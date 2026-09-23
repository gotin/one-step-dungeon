// tests/dark-tower-3f-flute-reward.spec.js
// dark_tower 3F「笛で解く封印の宝（矢筒）」の番人
// （2026-09-22 / PLAN 実行キュー20b ④の 3F 封印報酬・flutePlayed 分）。
//
// 直す前の実測：
//   `3,2 (5,5)` ↔ `3,3 (5,4)` の `>` 2枚＝`flutePlayed` で開く「近道ワープ」だったが、
//   `3,2` と `3,3` は**歩いて素通しの隣室**（境界 col5/col6 が開いている）∴笛を吹く報酬が
//   「隣の部屋へ1マス早く着く」だけ＝実質ゼロ（2F のかがり火と同型の飾り）。
//   おまけに `3,3` は剣獣 μ×2＋ブーメラン鬼 π の部屋で `mapEnters` が2つ＝戦闘中に
//   押し負けて `>` に重なると別の階へ飛ばされた（棚卸しの⑪）。
//
// 新しい機構：同じセルを**封印の宝箱**にして、中身を**矢筒（矢の上限 +8）**にした。
//   `3,3` 側の戻り口は撤去（階段 (8,4) だけ残す）。
//
// 守るものは4つ。
//
// ① データ：封印が `flutePlayed`／中身が矢筒／`>` と `mapEnters` が残っていない。
//    ⚠️ 開封の文は `fluteEffect.message` に書く＝`showConditions[cell].message` は
//    `bossYielded`（`game/boss.js:477`）しか読まない∴ここに書いても**表示されない**。
// ② 寄道であること：笛を吹かなくても塔の全室（30室）に到達する＝本道を塞いでいない。
//    歩いて行けるかの目視では判定できない∴BFS で測る（[[blade-puzzle-must-verify-with-solver]]）。
// ③ 報酬の希少さ：矢筒は世界でこの1個だけ（`shared/items.js` に実装済みで、9-5a 以来
//    どこにも置かれていなかった＝塔固有の報酬にする設計）。
// ④ 挙動（実機）：吹く前は宝箱が見えず踏んでも開かない／吹くと現れる／開けると
//    `maxArrows` が 8→16 に増え、増えた分だけ矢を持てる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dark_tower';
const FLUTE_ROOM = '3,2';   // 石碑＋封印の宝箱
const HALL_ROOM  = '3,3';   // 中ボスの大広間（階段 8,4 だけが残る）
const CHEST  = '5,5';
const SIGN   = '2,2';
const STAIRS = '8,4';
const EDGES  = 'N[5,6] S[5,6] W[] E[]';
const DEAD_IDS = ['3fFluteGate', '3fMidBoss'];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

function edgeSig(st) {
	const rows = rowsOf(st);
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[st.rows - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[st.cols - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

test.describe('Blade of Lumia – dark_tower 3F の封印の宝（キュー20b ④）', () => {
	test(`データ：${LAYER} ${FLUTE_ROOM} の封印の宝箱と、撤去した近道ワープ`, () => {
		const st = map.layers[LAYER].stages[FLUTE_ROOM];
		const [cr, cc] = CHEST.split(',').map(Number);
		expect(st.tiles[cr][cc], `(${CHEST}) は宝箱 'B'`).toBe(TILE.CHEST);
		expect(rowsOf(st).some((row) => row.includes(TILE.MAP_ENTER)),
			'近道ワープ \'>\' が残っている').toBe(false);
		expect(Object.keys(st.mapEnters ?? {}), `${FLUTE_ROOM} の mapEnters は空`).toEqual([]);
		expect(st.showConditions?.[CHEST]?.trigger, '封印は flutePlayed').toBe('flutePlayed');
		expect(st.chestContents?.[CHEST]?.item, '中身は矢筒').toBe('quiver');

		// 開封の文は fluteEffect 側（showConditions.message は bossYielded 専用＝読まれない）
		expect(st.fluteEffect?.type, '笛の効果は reveal').toBe('reveal');
		expect(typeof st.fluteEffect?.message, '笛の開封の文がある').toBe('string');
		expect(st.showConditions?.[CHEST]?.message,
			'showConditions.message は表示されない死んだデータ∴書かない').toBeUndefined();

		// 石碑は 'i' タイルと同じ座標に本文つき（[[blade-sign-two-formats]]＝本文が無いと無言看板）
		const [sr, sc] = SIGN.split(',').map(Number);
		expect(st.tiles[sr][sc], `(${SIGN}) は石碑 i`).toBe(TILE.SIGN);
		expect(st.signData?.[SIGN]?.lines?.length ?? 0, '石碑の本文').toBeGreaterThanOrEqual(2);
		expect(JSON.stringify(st.signData?.[SIGN]?.lines ?? []),
			'石碑が廃止した近道を案内している').not.toContain('近道');

		// 反対側（3,3）＝上階の階段だけが残っている
		const hall = map.layers[LAYER].stages[HALL_ROOM];
		expect(Object.keys(hall.mapEnters ?? {}), `${HALL_ROOM} の出入口は上階の階段だけ`).toEqual([STAIRS]);
		const arrows = [];
		for (let r = 0; r < hall.rows; r++) {
			for (let c = 0; c < hall.cols; c++) {
				if (hall.tiles[r][c] === TILE.MAP_ENTER) arrows.push(`${r},${c}`);
			}
		}
		expect(arrows, `${HALL_ROOM} の '>' は階段の1枚だけ`).toEqual([STAIRS]);

		// 撤去した id が塔のどこにも残っていない（死んだ行き先＝踏めない入口の再発防止）
		const dead = [];
		for (const [k, s] of Object.entries(map.layers[LAYER].stages)) {
			for (const [cell, ent] of Object.entries(s.mapEnters ?? {})) {
				if (DEAD_IDS.includes(ent?.id) || DEAD_IDS.includes(ent?.destId)) dead.push(`${k}(${cell})`);
			}
		}
		expect(dead, '撤去した近道ワープの id が残っている').toEqual([]);
	});

	test(`データ：${LAYER} ${FLUTE_ROOM}/${HALL_ROOM} の境界の開きは不変`, () => {
		expect(edgeSig(map.layers[LAYER].stages[FLUTE_ROOM]), FLUTE_ROOM).toBe(EDGES);
		expect(edgeSig(map.layers[LAYER].stages[HALL_ROOM]), HALL_ROOM).toBe(EDGES);
	});

	test('データ：笛を吹かなくても塔の全室に到達する（封印の宝は寄道）', () => {
		// 塔の入口 0,1(5,5) から、階段ワープを辿る BFS。開けておく口＝鍵扉 'D'・1F の門 'T'・
		// ボス扉 ':'・破壊壁 '!'（どれも笛とは無関係）。封印の宝箱は歩行の障害ではない∴
		// この測定に笛の状態は入らない＝「吹かなくても全室に届く」が寄道であることの証明。
		const stages = map.layers[LAYER].stages;
		const res = bfsLayer(stages, { stage: '0,1', row: 5, col: 5 }, {
			withLadder: true, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
		});
		const rooms = new Set([...res.reachedCells].map((k) => k.split(':')[0]));
		expect(rooms.size, '笛なしで到達できる部屋数').toBe(Object.keys(stages).length);
		expect(res.reachedCells.has(`${HALL_ROOM}:${STAIRS}`), '4F への階段に届かない').toBe(true);
		// 封印された宝箱のセルは「踏めるが開かない」＝通行を塞いでいない
		expect(res.reachedCells.has(`${FLUTE_ROOM}:${CHEST}`), '宝箱のセルを踏めない').toBe(true);
	});

	test('データ：矢筒はこの部屋と 3,5（淵の火渡り）の2個だけ（キュー20b ⑳）', () => {
		const found = [];
		for (const [lk, lay] of Object.entries(map.layers)) {
			for (const [k, s] of Object.entries(lay.stages ?? {})) {
				for (const [cell, cc] of Object.entries(s.chestContents ?? {})) {
					if (cc?.item === 'quiver') found.push(`${lk}/${k}(${cell})`);
				}
			}
		}
		expect(found.sort(), '矢筒の配置（3つめを増やすならここが赤くなる）')
			.toEqual([`${LAYER}/${FLUTE_ROOM}(${CHEST})`, `${LAYER}/3,5(4,3)`].sort());
	});
});

// ── ④ 挙動（実機・fromEditor=1 プレビュー）──────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(stage, row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage, row: String(row), col: String(col), ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
/** n タイル歩く（1タイル = movePlayer 2回／MOVE_STEP = 0.5 セル＝[[blade-moveplayer-is-half-tile]]）。 */
async function walkTiles(page, dir, tiles = 1) {
	await page.evaluate(({ d, n }) => {
		for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
	}, { d: dir, n: tiles });
}
async function step(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }
/**
 * ダイアログを閉じる。送るキーは 'z'（`game/input.js:100`）＝Enter はダイアログが
 * 閉じた後に一時停止をトグルしてしまう（同 :111）ので使わない。
 */
async function dismissDialog(page) {
	for (let i = 0; i < 8; i++) {
		if (!(await page.evaluate(() => window.__game.getState().isDialog))) return;
		await page.keyboard.press('z');
		await page.waitForTimeout(60);
	}
	expect(await page.evaluate(() => window.__game.getState().isDialog), 'ダイアログが閉じない').toBe(false);
}
// ⚠️ プレイヤーの持ち物・上限は `getPlayer()` で読む。`getState().player` は subItems を
//    含まないスナップショット（[[blade-snapshot-api-names]]）。
const at = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const maxArrows = (page) => page.evaluate(() => window.__game.getPlayer().maxArrows ?? 8);

test.describe('Blade of Lumia – dark_tower 3F は笛で封印が解ける（キュー20b ④）', () => {
	test('吹く前は開かない／吹くと現れる／開けると矢の上限が 8→16 になる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		// 笛だけ持たせる（ps_ フラグは '1' の厳密一致＝`game/game.js:2111`）。
		// 弓は持たせない＝矢の上限だけを見る（弓を持つと満タンの矢が入って数が動く）。
		await page.goto(previewUrl(FLUTE_ROOM, 3, 5, { ps_flute: '1' }));
		await waitForBoard(page);
		const boot = await ss(page);
		expect(boot.flutePlayed ?? false, '最初から笛を吹いた状態').toBe(false);
		expect(boot.conditionsMet ?? [], '吹く前に封印が解けている').not.toContain(CHEST);
		expect(await maxArrows(page), '矢の上限の初期値').toBe(8);

		// ① 吹く前に宝箱を踏んでも開かない（`game/player.js:1003` の封印ガード）
		await walkTiles(page, 'down', 2);
		expect(await at(page), `宝箱 (${CHEST}) に立てない`).toMatchObject({ r: 5, c: 5 });
		expect((await ss(page)).openedChests ?? [], '封印されたままの宝箱が開いた').not.toContain(CHEST);
		expect(await maxArrows(page), '開いていないのに上限が増えた').toBe(8);

		// ② 笛を吹く＝fluteEffect reveal で ss.flutePlayed が立ち、封印が解ける
		await page.evaluate(() => { window.__game.step(2); window.__game.useSubItem(); });
		await step(page, 3);
		const after = await ss(page);
		expect(after.flutePlayed, '笛を吹いても flutePlayed が立たない').toBe(true);
		expect(after.conditionsMet, '笛を吹いても封印が解けない').toContain(CHEST);
		await dismissDialog(page);

		// ③ 現れた宝箱を開けると矢筒が入って上限が +8（8→16）
		//    宝箱の上に立っているので一度離れて踏み直す（開封は踏んだ瞬間に起きる）
		await walkTiles(page, 'up', 1);
		await walkTiles(page, 'down', 1);
		expect(await at(page), `宝箱 (${CHEST}) に戻れない`).toMatchObject({ r: 5, c: 5 });
		expect((await ss(page)).openedChests, '封印が解けた宝箱が開かない').toContain(CHEST);
		expect(await maxArrows(page), '矢筒を取っても矢の上限が増えない').toBe(16);
		expect(errors, `page errors on ${FLUTE_ROOM}:\n${errors.join('\n')}`).toEqual([]);
	});

	test('笛を吹かずに南の 3,3 へ抜けられる（封印の宝は寄道）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		// 笛を持たずに北寄りから南の出口 (9,5) を目指す＝部屋を出られる
		await page.goto(previewUrl(FLUTE_ROOM, 1, 5));
		await waitForBoard(page);
		expect(await page.evaluate(() => window.__game.getPlayer().subItems?.flute ?? null),
			'笛を持たない前提のテスト').toBeNull();
		for (let i = 0; i < 40; i++) {
			if ((await at(page)).r >= 9) break;
			await page.evaluate(() => { window.__game.movePlayer('down'); window.__game.step(1); });
		}
		expect((await at(page)).r, '笛なしで南の出口へ抜けられない').toBeGreaterThanOrEqual(9);
		expect(errors, `page errors on ${FLUTE_ROOM}:\n${errors.join('\n')}`).toEqual([]);
	});
});
