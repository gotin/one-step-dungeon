// tests/d6-spring-target.spec.js
// dungeon_6 `3,0`「泉の的」の番人
// （2026-09-27 / PLAN 実行キュー 33・盤面は `scripts/migrate-d6-3-0-spring-target.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   石 *(3,3)・ボタン S(3,7)・門 T(1,9)・宝箱 B(2,9) の部屋で、門の北は壁＝開けても行ける所が
//   増えず、宝箱は (3,9) から素で歩いて開けられた＝石もボタンも門も何も守っていない飾り。
//
// 守るものは3つ。
//   ① データ（幾何）：門 T(3,1) が宝箱の窪みの唯一の口／的 Y(2,7) の隣に立てるセルが 0
//      （剣では開かない）／射線は東の縁 (2,10) だけ／泉は幅 2 以上＝はしごで小島に渡れない。
//   ② データ（層の到達性）：dead-edge 0・到達室数は不変。
//   ③ 挙動（実機）：剣では開かず、(2,10) から西へ射た矢で門が開き、宝箱でルピー +20。
//
// ⚠️ ボタン S を1つでも置くと「全ボタンONで全T開」規則に切り替わり、Y→T の links が
//    まるごと無視される（game/conditions.js）＝矢で門が開かなくなる。ここでも 0 枚を見張る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE, TILE_META } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_6';
const ROOM = '3,0';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;

const SWITCH = '2,7';
const GATE = '3,1';
const CHEST = '1,1';
const PILLAR = '5,7';
const SHOOT = { row: 2, col: 10 };

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const bgOf = () => stages[ROOM].bgTiles ?? {};
const cellOf = (k) => k.split(',').map(Number);
// 南の口から歩いて立てるセル（門は open に入れたときだけ通す・水は不可）。
function walkable(t, bg, open = new Set()) {
	const ok = (r, c) => {
		const k = `${r},${c}`;
		if (bg[k] === TILE.WATER) return false;
		if (t[r][c] === TILE.GATE) return open.has(k);
		return !HARD_BLOCKED.has(t[r][c]);
	};
	const seen = new Set(), q = [];
	for (let c = 0; c < COLS; c++) if (ok(ROWS - 1, c)) { seen.add(`${ROWS - 1},${c}`); q.push([ROWS - 1, c]); }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// cell を直線で撃ち抜ける立ち位置（壁と未破壊の '!' で止まる＝投擲物は水も門も越える）。
function shootersOf(t, walk, cell) {
	const [r0, c0] = cellOf(cell), out = [];
	for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		for (let r = r0 + dr, c = c0 + dc; r >= 0 && r < ROWS && c >= 0 && c < COLS; r += dr, c += dc) {
			if (t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL) break;
			if (walk.has(`${r},${c}`)) out.push(`${r},${c}`);
		}
	}
	return out.sort();
}

// ── ① データ（盤面・配線・幾何）────────────────────────────────────────
test.describe('D6 泉の的 ① データ（盤面と隔離）', () => {
	test('門 T(3,1) が宝箱の窪みの唯一の口＝閉じたままでは宝箱に届かない', () => {
		const t = gridOf(), bg = bgOf();
		expect(t[1][1], `宝箱が (${CHEST}) に無い`).toBe(TILE.CHEST);
		expect(t[3][1], `門が (${GATE}) に無い`).toBe(TILE.GATE);
		const closed = walkable(t, bg);
		expect(closed.has(CHEST), '門を閉じたまま宝箱に届く＝門が飾り（旧盤面の再発）').toBe(false);
		expect(walkable(t, bg, new Set([GATE])).has(CHEST), '門を開けても宝箱に届かない').toBe(true);
		expect(stages[ROOM].chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } });
	});

	test(`的 Y(${SWITCH}) は泉の小島＝隣に立てず、射線は (${SHOOT.row},${SHOOT.col}) だけ`, () => {
		const t = gridOf(), bg = bgOf();
		expect(t[2][7], `Y が (${SWITCH}) に無い`).toBe(TILE.SWITCH);
		const walk = walkable(t, bg, new Set([GATE]));
		const [yr, yc] = cellOf(SWITCH);
		const around = [[yr - 1, yc], [yr + 1, yc], [yr, yc - 1], [yr, yc + 1]]
			.map(([r, c]) => `${r},${c}`).filter((k) => walk.has(k));
		expect(around, 'Y の隣に立てる＝剣で叩けてしまう').toEqual([]);
		expect(shootersOf(t, walk, SWITCH), '矢で Y を撃てる立ち位置').toEqual([`${SHOOT.row},${SHOOT.col}`]);
		// 柱が真下の岸からの射線を断っている（柱を外すと (6,7) 以南から撃てる＝対照）。
		const [pr, pc] = cellOf(PILLAR);
		expect(t[pr][pc], `柱 (${PILLAR}) が壁でない`).toBe(TILE.WALL);
		const noPillar = gridOf();
		noPillar[pr][pc] = TILE.FLOOR;
		expect(shootersOf(noPillar, walkable(noPillar, bg, new Set([GATE])), SWITCH),
			'対照：柱を外しても射線が増えない＝射線の数え方が壊れている').toContain('6,7');
	});

	test('泉は幅 2 以上＝はしごで架けられる水が無い（Y も橋脚に数える）', () => {
		const t = gridOf(), bg = bgOf();
		// ゲーム本体の isLadderBank（game/passable.js）は passable を見る＝Y も橋脚になる。
		const bank = (b, r, c) => {
			if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
			const ch = t[r][c];
			if (ch === TILE.WATER || ch === TILE.PIT || ch === TILE.GATE || b[`${r},${c}`] === TILE.WATER) return false;
			return TILE_META[ch]?.passable ?? true;
		};
		const bridge = (b, r, c) => (bank(b, r - 1, c) && bank(b, r + 1, c)) || (bank(b, r, c - 1) && bank(b, r, c + 1));
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		expect(water.filter((k) => bridge(bg, ...cellOf(k))), 'はしごで小島へ渡れる＝剣で叩く近道').toEqual([]);
		expect(water.length, '泉の水の枚数').toBe(33);
		// 対照：(2,9) を床にすると (2,8) が Y と床に挟まれた幅 1 の水になる＝検出されること。
		const bg2 = { ...bg };
		delete bg2['2,9'];
		expect(bridge(bg2, 2, 8), '対照：幅 1 の水を見逃した＝はしご判定が壊れている').toBe(true);
	});

	test('石・ボタン・看板は置かない／links は Y→門の1本', () => {
		const rows = rowsOf(stages[ROOM]);
		for (const ch of [TILE.STONE, TILE.BUTTON, TILE.SIGN]) {
			expect(rows.some((r) => r.includes(ch)), `'${ch}' がある`).toBe(false);
		}
		expect(stages[ROOM].links).toEqual([{ switchId: SWITCH, gateId: GATE }]);
		expect(Object.keys(stages[ROOM].signData ?? {})).toEqual([]);
	});
});

// ── ② データ（層の到達性）────────────────────────────────────────────
test.describe('D6 泉の的 ② データ（層の接続は不変）', () => {
	test('dead-edge 0・入口から 3,0 に歩いて入れる', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '3,0 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ③ 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, extra = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ...extra,
	});
	return `${GAME}?${p.toString()}`;
}
async function boot(page, url) {
	await page.goto(url);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// movePlayer 1回＝半マス（[[blade-moveplayer-is-half-tile]]）。
async function walk(page, dir, ops) {
	for (let i = 0; i < ops; i++) {
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await step(page, 1);
	}
}
const at = (page) => page.evaluate(() => {
	const { x, y } = window.__game.getState().player;
	return { r: y, c: x };
});
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const rupees = (page) => page.evaluate(() => window.__game.getState().player.rupees);
const face = async (page, dir) => {
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	await step(page, 1);
};
const shoot = async (page) => {
	await page.evaluate(() => { window.__game.getPlayer().activeSubItem = 'bow'; });
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 30);
};

test.describe('D6 泉の的 ③ 実機（剣では開かず矢で開く）', () => {
	test(`はしごを持っていても東の縁 (${SHOOT.row},${SHOOT.col}) から泉へ踏み込めない`, async ({ page }) => {
		await boot(page, previewUrl(6, 10, { ps_ladder: '1' }));
		await walk(page, 'up', 8);
		expect(await at(page), '東の縁に立てない').toEqual({ r: SHOOT.row, c: SHOOT.col });
		await walk(page, 'left', 6);
		expect((await at(page)).c, 'はしごで泉を渡れてしまった').toBe(SHOOT.col);
	});

	test(`東の縁 (${SHOOT.row},${SHOOT.col}) で西へ剣を振っても門は開かない`, async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(6, 10));
		await walk(page, 'up', 8);
		expect(await at(page), '東の縁に立てない').toEqual({ r: SHOOT.row, c: SHOOT.col });
		await face(page, 'left');
		await page.evaluate(() => window.__game.swordAttack());
		await step(page, 6);
		const s = await ss(page);
		expect(s.switchToggles ?? [], '剣で Y が反応した（水の向こうに届いている）').not.toContain(SWITCH);
		expect(s.openGates ?? [], '剣で門が開いた').not.toContain(GATE);
		expect(errors).toEqual([]);
	});

	test('通し：縁から西へ矢→門 T(3,1) が開く→窪みの宝箱でルピー +20', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await boot(page, previewUrl(6, 10, { ps_bow: '1' }));

		// 門を開ける前は窪みへ入れない
		await walk(page, 'left', 18);
		expect(await at(page), '(6,1) まで歩けない').toEqual({ r: 6, c: 1 });
		await walk(page, 'up', 8);
		expect(await at(page), '門を閉じたまま窪みへ入れた').toEqual({ r: 4, c: 1 });

		// 東の縁 (2,10) へ回って西へ射る
		await walk(page, 'down', 4);
		await walk(page, 'right', 18);
		await walk(page, 'up', 8);
		expect(await at(page), '東の縁に立てない').toEqual({ r: SHOOT.row, c: SHOOT.col });
		await face(page, 'left');
		await shoot(page);
		const s = await ss(page);
		expect(s.switchToggles, '矢が泉を越えて Y に当たらない').toContain(SWITCH);
		expect(s.openGates, `門 (${GATE}) が開かない`).toContain(GATE);

		// 門をくぐって宝箱 (1,1) へ
		const r0 = await rupees(page);
		await walk(page, 'down', 8);
		await walk(page, 'left', 18);
		await walk(page, 'up', 10);
		expect(await at(page), '宝箱のセルに立てない（門が開いていない）').toEqual({ r: 1, c: 1 });
		expect((await ss(page)).openedChests, '宝箱が開かない').toContain(CHEST);
		expect(await rupees(page), 'ルピーが 20 増えない').toBe(r0 + 20);
		expect(errors).toEqual([]);
	});
});
