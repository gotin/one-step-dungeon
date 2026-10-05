// tests/d5-frozen-sluice-ferry.spec.js
// dungeon_5 `0,3`（入口 `1,3` の西の行き止まり）「凍れる水門の石渡し」の番人
// （2026-10-05 / PLAN 実行キュー 40 の第2陣 1室目・盤面は `scripts/migrate-d5-0-3-frozen-sluice-ferry.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 0,3` と同型＝四角い広間の真ん中に床のルピー（5）が1つあるだけ。
//
// 新しい盤面（水は bgTiles）:
//      1 #....~~..=B#   ← 宝箱 (1,10)＝ルピー×30・宝物庫の水門 (1,9)(2,10)
//      2 #.*..~~..#=#   ← 石 (2,2)
//      3 #....~.....#
//      4 #.#..=......   ← 湖の水門 (4,5)＝石が湖を渡れる唯一の所・東の口（行4-5）
//      5 #....~......
//      6 #.*..~.....#   ← 石 (6,2)
//      7 #....~~..S.#   ← 東のボタン (7,9)→宝物庫の水門
//      8 #S...~~....#   ← 西の角のボタン (8,1)→湖の水門
//   人ははしごで幅1の水を渡れるが、石は水へ入れない＝石は干した水門だけを渡る。
//
// 守るものは2つ。
//   ① データ：盤面・水・水門と links・中身／ソルバーの厳格版と緩い版が同じ最短手数・詰まない／
//      対照（はしご・石2つ・湖の水門・角のボタンがどれも飾りでない）／層の接続。
//   ② 挙動（実機）：ボタンを自分で踏むと水門は干上がるが離れると戻る／閉じた水門と水へは石を押し込めない／
//      通しで石2つを運び、干した宝物庫の水門から宝箱を開ける。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import {
	TARGET, WATER, WATER_MAP, EXITS, CHEST, STONES, LAKE_BUTTON, VAULT_BUTTON, LAKE_SLUICE, VAULT_SLUICE, LINKS,
	SHORTEST, solveRoom, withCell,
} from '../scripts/migrate-d5-0-3-frozen-sluice-ferry.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '0,3';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
// 実マップから水の盤面を組み直す（定数ではなく実物を測る）
const liveWaterMap = () => rowsOf(stages[ROOM]).map((row, r) =>
	[...row].map((ch, c) => (stages[ROOM].bgTiles?.[`${r},${c}`] === TILE.WATER ? '~' : ch)).join(''));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 0,3 凍れる水門の石渡し ① データ', () => {
	test('盤面・水は bgTiles・水門と links・宝箱（敵・植生・看板が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(Object.keys(st.bgTiles).sort()).toEqual([...WATER].sort());
		expect(Object.values(st.bgTiles).every((v) => v === TILE.WATER)).toBe(true);
		expect(st.links).toEqual(LINKS);
		expect(LINKS.filter((l) => l.switchId === LAKE_BUTTON).map((l) => l.gateId)).toEqual(LAKE_SLUICE);
		expect(LINKS.filter((l) => l.switchId === VAULT_BUTTON).map((l) => l.gateId)).toEqual(VAULT_SLUICE);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.floorItems ?? {}, '旧 床のルピーが残っている').toEqual({});
		expect(st.showConditions ?? {}).toEqual({});
		expect(Object.keys(st.signData ?? {})).toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.GATE]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test(`ソルバー：厳格版と緩い版が同じ最短手数 ${SHORTEST}・詰まない`, () => {
		const wm = liveWaterMap();
		expect(wm).toEqual(WATER_MAP);
		const m = solveRoom(wm);
		const lax = solveRoom(wm, { strict: false });
		expect(m.L, '厳格版の最短手数').toBe(SHORTEST);
		expect(lax.L, '緩い版だけ短い＝見た目で読めない近道がある').toBe(m.L);
		expect(m.noEscape, '入って詰む状態（厳格）').toBe(0);
		expect(lax.noEscape, '入って詰む状態（緩い）').toBe(0);
	});

	test('対照：はしご・石2つ・湖の水門・角のボタンがどれも飾りでない（測定が空虚でない）', () => {
		expect(solveRoom(WATER_MAP, { hasLadder: false, strict: false }).L, 'はしご無しで届く').toBe(null);
		expect(solveRoom(WATER_MAP, { noPush: true, strict: false }).L, '石を押さずに届く').toBe(null);
		for (const s of STONES) expect(solveRoom(withCell(s, TILE.WALL), { strict: false }).L, `石 ${s} を壁にしても届く`).toBe(null);
		expect(solveRoom(withCell('4,5', '~'), { strict: false }).L, '湖の水門を水にしても届く＝石が水を渡れている').toBe(null);
		expect(solveRoom(WATER_MAP, { strict: false, links: LINKS.filter((l) => l.switchId !== LAKE_BUTTON) }).L,
			'湖の水門の連動を外しても届く').toBe(null);
		// 逆向きの対照＝湖の水門を床にすると（連動なしでも）届く＝測定の土台が生きている
		expect(solveRoom(withCell('4,5', TILE.FLOOR), { strict: false, links: LINKS.filter((l) => l.switchId !== LAKE_BUTTON) }).L,
			'湖の水門を床にしても届かない＝測定が壊れている').not.toBe(null);
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '0,3 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_ladder: '1' });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
// 石押しは実時間のクールダウン（STONE_PUSH_COOLDOWN_MS=600）＝1押しごとに待つ。1押し＝石もプレイヤーも1マス。
async function push(page, d, times) {
	for (let i = 0; i < times; i++) {
		await page.evaluate((dir) => { window.__game.movePlayer(dir); window.__game.step(1); }, d);
		await page.waitForTimeout(650);
	}
}
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`,
		stones: Object.values(ss.stonePositions ?? {}).map((s) => `${s.r},${s.c}`).sort(),
		openGates: [...(ss.openGates ?? [])].sort(),
		locked: !!ss.stonesLocked,
		opened: [...(ss.openedChests ?? [])],
	};
});
async function run(page, route) {
	for (const [kind, d, n, want] of route) {
		if (kind === 'push') await push(page, d, n); else await walk(page, d, n);
		expect((await snap(page)).pos, `${kind} ${d}×${n} の後`).toBe(want);
	}
}

test.describe('D5 0,3 凍れる水門の石渡し ② 実機', () => {
	test('東のボタンを自分で踏むと宝物庫の水門が干上がるが、離れると水へ戻る（石で押さえるしかない）', async ({ page }) => {
		const errors = await boot(page, 5, 10);
		await run(page, [['walk', 'down', 2, '7,10'], ['walk', 'left', 1, VAULT_BUTTON]]);
		expect((await snap(page)).openGates, '踏んでも水門が干上がらない').toEqual([...VAULT_SLUICE].sort());
		await walk(page, 'up', 1);
		expect((await snap(page)).openGates, '離れても水門が干上がったまま').toEqual([]);
		expect(errors).toEqual([]);
	});

	test('石は閉じた湖の水門へも、水へも押し込めない（角のボタンが空のうち）', async ({ page }) => {
		const errors = await boot(page, 5, 10);
		await run(page, [
			['walk', 'down', 1, '6,10'], ['walk', 'left', 7, '6,3'],   // はしごで湖 (6,5) を渡る
			['push', 'left', 1, '6,2'],                                 // 石 (6,2) を (6,1) へ（ボタンには乗せない）
			['walk', 'up', 1, '5,2'], ['walk', 'left', 1, '5,1'], ['walk', 'up', 3, '2,1'],
			['push', 'right', 2, '2,3'],                                // 石 (2,2) を (2,4) へ
			['walk', 'up', 1, '1,3'], ['walk', 'right', 1, '1,4'],
			['push', 'down', 2, '3,4'],                                 // 石を行4 の (4,4) へ
			['walk', 'left', 1, '3,3'], ['walk', 'down', 1, '4,3'],
		]);
		await push(page, 'right', 1);                                  // 閉じた湖の水門 (4,5) へは押せない
		let s = await snap(page);
		expect(s.pos, '閉じた水門へ石を押し込んで前へ出た').toBe('4,3');
		expect(s.stones, '石が閉じた水門へ入った').toEqual(['4,4', '6,1']);
		await run(page, [['walk', 'down', 1, '5,3'], ['walk', 'right', 1, '5,4']]);
		await push(page, 'up', 1);                                     // 石 (4,4) を北へ＝(3,4) は床∴これは動く
		s = await snap(page);
		expect(s.pos, '床へ押せる石が動かない（対照）').toBe('4,4');
		expect(s.stones).toEqual(['3,4', '6,1']);
		// 石 (3,4) の西から東へ押す＝(3,5) は水∴動かない
		await run(page, [['walk', 'left', 1, '4,3'], ['walk', 'up', 1, '3,3']]);
		await push(page, 'right', 1);
		s = await snap(page);
		expect(s.pos, '水へ石を押し込んで前へ出た').toBe('3,3');
		expect(s.stones, '石が水へ入った').toEqual(['3,4', '6,1']);
		expect(errors).toEqual([]);
	});

	test('通し：角のボタンで湖の水門を干し、石を渡して東のボタンへ＝宝物庫の水門から宝箱を開ける', async ({ page }) => {
		const errors = await boot(page, 5, 10);
		await run(page, [
			['walk', 'down', 1, '6,10'], ['walk', 'left', 7, '6,3'],   // はしごで湖 (6,5) を渡る
			['push', 'left', 1, '6,2'],
			['walk', 'up', 1, '5,2'], ['walk', 'left', 1, '5,1'],
			['push', 'down', 2, '7,1'],                                 // 石を西の角のボタン (8,1) へ
		]);
		let s = await snap(page);
		expect(s.stones, '石が角のボタンに乗っていない').toContain(LAKE_BUTTON);
		expect(s.openGates, '湖の水門が干上がらない').toEqual([...LAKE_SLUICE].sort());
		await run(page, [
			['walk', 'up', 5, '2,1'],
			['push', 'right', 2, '2,3'],
			['walk', 'up', 1, '1,3'], ['walk', 'right', 1, '1,4'],
			['push', 'down', 2, '3,4'],
			['walk', 'left', 1, '3,3'], ['walk', 'down', 1, '4,3'],
			['push', 'right', 5, '4,8'],                                // 干した水門 (4,5) を越えて東へ
			['walk', 'up', 1, '3,8'], ['walk', 'right', 1, '3,9'],
			['push', 'down', 3, '6,9'],                                 // 東のボタン (7,9) へ
		]);
		s = await snap(page);
		expect(s.stones, '石が2つともボタンに乗っていない').toEqual([VAULT_BUTTON, LAKE_BUTTON].sort());
		expect(s.openGates, '宝物庫の水門が干上がらない').toEqual([...LAKE_SLUICE, ...VAULT_SLUICE].sort());
		expect(s.locked, '石ロックが立たない').toBe(true);
		await run(page, [['walk', 'up', 3, '3,9'], ['walk', 'right', 1, '3,10'], ['walk', 'up', 1, '2,10']]);
		await walk(page, 'up', 1);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(errors).toEqual([]);
	});
});
