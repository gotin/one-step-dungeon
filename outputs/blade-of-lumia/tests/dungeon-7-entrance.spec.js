// D7「空中の遺跡」の入口（実行キュー 0x・2026-09-05）
//
// それまで **D7 には世界のどこからも入れなかった**：`dungeon_7/1,3 @7,2` の '>' は
// `destId: 'field_dungeon7'` を指すのに、その id を持つセルが field 側に無く
// `buildExitRegistry()` で解決できなかった（`game/game.js` の遷移判定は
// `enter.destId && exitRegistry[enter.destId]` の両方が要る＝fallback は無い）。
// D7 のボス U が8個目の星の欠片を落とす∴入れない＝翼の羽衣・暗黒の塔・寄道3つが
// 全部閉じる＝クリア不能だった。
//
// 直した形（`scripts/migrate-dungeon7-entrance.mjs`）:
//   `field/2,0`「風の環状列石」の内庭 (6,5) に **笛で現れる隠し MAP_ENTER**。
//   `shared/progression.js ORDER` は D8 →(秘密の洞窟)→ D7 ∴ここに来る人は笛を持ち、
//   翼の羽衣はまだ持っていない＝笛の関門なら循環依存が起きない（空島に置くと
//   「羽衣が要る／羽衣は D7 の欠片が要る」の循環になる）。
//
// ここで守るもの:
//   ① データ契約（タイル '>' ・両側の id⇔destId が解決・笛の封印と fluteEffect{reveal}）
//   ② 循環依存が無い＝入口セルが「全ゲート閉・道具0」の歩行で開始村から到達可能
//   ③ 笛を吹く前は入口が描画されず、踏んでも遷移しない
//   ④ 笛を吹くと入口が現れ、踏むと dungeon_7/1,3 に着地する
//   ⑤ そこから '>' を踏み直すと field/2,0 (6,5) へ帰れる（往復が閉じている）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { waitForBoard } from './helpers.js';
import { buildExitRegistry, resolveExit, reverseRefs } from '../shared/exits.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const GAME = '/blade-of-lumia/game/';

const FIELD_STAGE = '2,0';
const ENTRY = { row: 6, col: 5 };          // 環の内庭・西側（列6は素通り用に空けてある）
const D7_STAGE = '1,3';
const D7_EXIT = { row: 7, col: 2 };

/** 笛を持った状態のプレビュー URL（D7 は笛入手後＝D8 クリア後に来る場所）。 */
function previewUrl(layer, stage, row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage, row: String(row), col: String(col),
		ps_flute: '1',
	});
	return `${GAME}?${p.toString()}`;
}

/** n タイル歩く（1 タイル = movePlayer 2回・MOVE_STEP 0.5）。 */
async function walkTiles(page, dir, tiles = 1) {
	await page.evaluate(({ d, n }) => {
		for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
	}, { d: dir, n: tiles });
}
const at = (page) => page.evaluate(() => {
	const p = window.__game.getState().player;
	return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});
const spriteCount = (page, r, c) => page.locator(
	`#board .cell[data-row="${r}"][data-col="${c}"] .obj-sprite`).count();

test.describe('Blade of Lumia – D7 空中の遺跡の入口', () => {

	test('① データ契約：笛で現れる MAP_ENTER が両側で解決する', () => {
		const st = MAP.layers.field.stages[FIELD_STAGE];
		const pos = `${ENTRY.row},${ENTRY.col}`;

		expect(st.tiles[ENTRY.row][ENTRY.col], '入口のタイルが MAP_ENTER でない').toBe('>');
		expect(st.mapEnters[pos]).toEqual({ id: 'field_dungeon7', destId: 'dungeon_7' });
		expect(st.showConditions[pos], '笛の封印が無い＝最初から入れてしまう')
			.toEqual({ trigger: 'flutePlayed' });
		expect(st.fluteEffect?.type, 'fluteEffect{reveal} が無いと flutePlayed が立たない')
			.toBe('reveal');

		// 両向きの解決（片側だけ結線＝0x の元の壊れ方をここで赤にする）。
		const reg = buildExitRegistry(MAP);
		expect(resolveExit(MAP, 'field', FIELD_STAGE, pos, reg).resolved)
			.toEqual({ layer: 'dungeon_7', stage: D7_STAGE, cell: `${D7_EXIT.row},${D7_EXIT.col}`, ...D7_EXIT });
		expect(resolveExit(MAP, 'dungeon_7', D7_STAGE, `${D7_EXIT.row},${D7_EXIT.col}`, reg).resolved)
			.toEqual({ layer: 'field', stage: FIELD_STAGE, cell: pos, ...ENTRY });
		expect(reverseRefs(MAP, 'field_dungeon7'), 'D7 の帰り出口が field_dungeon7 を指していない')
			.toEqual([{ layer: 'dungeon_7', stage: D7_STAGE, cell: `${D7_EXIT.row},${D7_EXIT.col}` }]);
		expect(reverseRefs(MAP, 'dungeon_7').map((e) => `${e.layer}/${e.stage}@${e.cell}`),
			'dungeon_7 への入口はこの1つだけ').toEqual([`field/${FIELD_STAGE}@${pos}`]);
	});

	test('② 循環依存が無い：入口は道具0・全ゲート閉の歩行で開始村から到達できる', () => {
		// 翼の羽衣は「星の欠片を全部捧げて」授かる＝8個目は D7 のボス U ∴入口が羽衣を
		// 要求したら循環する。bfsLayer は道具0・全ゲート閉（＝羽衣も飛行も無い）の歩行。
		const field = MAP.layers.field;
		const start = {
			stage: MAP.startPos?.stage ?? '1,0',
			row: MAP.startPos?.row ?? 2,
			col: MAP.startPos?.col ?? 2,
		};
		const { reachedCells } = bfsLayer(field.stages, start);
		expect(reachedCells.has(`${FIELD_STAGE}:${ENTRY.row},${ENTRY.col}`),
			`入口 ${FIELD_STAGE} (${ENTRY.row},${ENTRY.col}) へ徒歩で行けない`).toBe(true);
		// 空島（飛行専用）に置いていないこと＝置いた瞬間に循環依存が復活する。
		expect(FIELD_STAGE).not.toBe('8,1');
	});

	test('③ 笛を吹く前：入口は描かれず、踏んでも遷移しない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(previewUrl('field', FIELD_STAGE, ENTRY.row, ENTRY.col + 1));
		await waitForBoard(page);

		expect(await spriteCount(page, ENTRY.row, ENTRY.col), '封印中なのに入口が描かれている')
			.toBe(0);

		await walkTiles(page, 'left', 1);
		expect(await at(page)).toEqual({ r: ENTRY.row, c: ENTRY.col });
		await page.waitForTimeout(300);   // 遷移の setTimeout(100ms) が起きないことを見る
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer, '笛を吹く前に D7 へ入れてしまった').toBe('field');
		expect(st.stageKey).toBe(FIELD_STAGE);
		expect(errors).toEqual([]);
	});

	test('④ 笛を吹くと入口が現れ、踏むと D7 の 1,3 に着地する', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(previewUrl('field', FIELD_STAGE, ENTRY.row, ENTRY.col + 1));
		await waitForBoard(page);

		await page.evaluate(() => { window.__game.useSubItem(); window.__game.step(1); });
		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.conditionsMet, '笛を吹いても封印が解けていない')
			.toContain(`${ENTRY.row},${ENTRY.col}`);
		expect(await spriteCount(page, ENTRY.row, ENTRY.col), '解除後も入口が描かれない')
			.toBe(1);

		await walkTiles(page, 'left', 1);
		await page.waitForFunction(() => window.__game.getState().currentLayer === 'dungeon_7',
			null, { timeout: 3000 });
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.stageKey, 'D7 の着地部屋が 1,3 でない').toBe(D7_STAGE);
		expect(await at(page), '帰り出口のセルに着地していない')
			.toEqual({ r: D7_EXIT.row, c: D7_EXIT.col });
		expect(errors).toEqual([]);
	});

	test('⑤ D7 の出口を踏むと field/2,0 の入口セルへ帰れる（往復が閉じる）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(previewUrl('dungeon_7', D7_STAGE, D7_EXIT.row, D7_EXIT.col + 1));
		await waitForBoard(page);

		await walkTiles(page, 'left', 1);
		await page.waitForFunction(() => window.__game.getState().currentLayer === 'field',
			null, { timeout: 3000 });
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.stageKey, '帰り先が 風の環状列石 でない').toBe(FIELD_STAGE);
		expect(await at(page), '入口セルに戻っていない').toEqual({ r: ENTRY.row, c: ENTRY.col });
		expect(errors).toEqual([]);
	});
});
