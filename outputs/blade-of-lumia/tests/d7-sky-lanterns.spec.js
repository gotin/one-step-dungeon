// tests/d7-sky-lanterns.spec.js
// dungeon_7 `0,1`「空の灯籠継ぎ」の番人
// （2026-10-04 / PLAN 実行キュー 39 の第3陣 1室目・盤面は `scripts/migrate-d7-0-1-sky-lanterns.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_6 0,1` の写し＝東・南の口がある四角い広間に、宝箱（ルピー×5・素で開く）が1つあるだけ。
//
// 新しい盤面（西半分と北が空へ崩れ落ち、かがり火4つが空に浮く）:
//      2 #%%%%B%%%%%#   ← 宝箱 (2,5)＝ルピー×30（torchesLit で出る）
//      3 #H%H%.%%%%%#   ← 灯③(3,1)・灯④(3,3)・北の小島 (3,5)
//      4 #%%%%x......   ← 穴 (4,5)
//      5 #H%%H.......   ← 灯②(5,1)・灯①(5,4)＝唯一ロウソクが届く
//      7 #...x..%%%%#   ← 西の小島 (7,1)〜(7,3)・穴 (7,4)
//   火は同じ行・列に並んだ灯どうしでしか渡らない。灯②→灯③（列1）を投げられるのは西の小島の端
//   (7,1)、灯③→灯④（行3）を投げられるのは北の小島 (3,5) だけ＝どちらも穴の先。
//
// 守るものは2つ。
//   ① データ：盤面・宝箱と封印／灯①だけが床に接する／どの段のブーメランでも同じ手数で全点灯／
//      はしご・ブーメラン・ロウソクのどれが欠けても点かない／どちらの穴を空にしても点かない
//      （測定が空虚でない対照）／層の到達性は不変。
//   ② 挙動（実機）：はしご無しでは小島へ渡れない／本土からは灯②までしか点かない／
//      通しで4つが灯り、北の小島の宝箱でルピー +30。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, LADDER_OVER } from '../scripts/lib/connectivity.mjs';
import { TARGET, TORCHES, PITS, CHEST_CELL as CHEST, SHORTEST, TIERS, solveLanterns } from '../scripts/migrate-d7-0-1-sky-lanterns.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '0,1';
const stages = map.layers[LAYER].stages;
const ROWS = 10, COLS = 12;
const [T1, T2, T3, T4] = TORCHES;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const at = (t, k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => `${rr},${cc}`);
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D7 0,1 空の灯籠継ぎ ① データ', () => {
	// ⚠️ 盤面は**実マップから**読む（移行スクリプトの TARGET と一致することは最初の本で別に見る）。
	const t = gridOf();

	test('盤面・宝箱・封印の配線（敵・植生・看板が無い）', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } });
		expect(st.showConditions).toEqual({ [CHEST]: { trigger: 'torchesLit' } });
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(st.initLitTorches ?? [], '最初から点いている火は無い（火元はロウソク）').toEqual([]);
		expect(Object.keys(st.signData ?? {}), '看板データは空').toEqual([]);
		const chars = rowsOf(st).join('');
		expect([...chars].filter((ch) => ENEMY_META[ch]), '敵が居る').toEqual([]);
		for (const ch of [TILE.TREE, TILE.BUSH, TILE.STONE, TILE.SIGN, TILE.GATE, TILE.SWITCH]) {
			expect(chars.includes(ch), `'${ch}' が残っている`).toBe(false);
		}
	});

	test('灯①だけが床に接し、ほかの灯の四方は空か壁', () => {
		const floorish = (k) => [TILE.FLOOR, TILE.CHEST].includes(at(t, k));
		const lit = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.TORCH) lit.push(`${r},${c}`);
		expect(lit.sort(), 'かがり火の位置').toEqual([...TORCHES].sort());
		expect(nbrs(T1).filter(floorish), `灯① (${T1}) の隣の床`).toEqual(['5,5']);
		for (const k of [T2, T3, T4]) {
			expect(nbrs(k).filter(floorish), `灯 (${k}) の隣に床がある＝ロウソクで直に点く`).toEqual([]);
		}
	});

	test('どの段のブーメランでも同じ手数で全点灯・はしごが要る', () => {
		expect(LADDER_OVER.has(TILE.PIT), '前提：はしごで穴を渡れる').toBe(true);
		expect(LADDER_OVER.has(TILE.SKY), '前提：はしごで空は渡れない').toBe(false);
		for (const [name, reach] of TIERS) {
			const sol = solveLanterns(t, { reach });
			expect(sol?.length, `${name}の手数（${sol?.join(' → ')}）`).toBe(SHORTEST);
			expect(sol.filter((s) => s.startsWith('はしご')).length, `${name}で渡る穴の数`).toBe(3);
			expect(solveLanterns(t, { reach, ladder: false }), `${name}：はしご無しで点いた`).toBeNull();
		}
		const wood = solveLanterns(t);
		expect(wood.filter((s) => s.startsWith('ブーメラン')), '投げる場所と向き').toEqual([
			'ブーメラン 5,5→左', 'ブーメラン 7,1→上', 'ブーメラン 3,5→左',
		]);
		expect(solveLanterns(t, { boomerang: false }), 'ブーメラン無しで点いた').toBeNull();
		expect(solveLanterns(t, { candle: false }), 'ロウソク無しで点いた').toBeNull();
	});

	test('対照：どちらの穴を空にしても点かない・空を床にすると穴が要らない（測定が空虚でない）', () => {
		for (const pit of PITS) {
			const g = gridOf(); const [r, c] = pit.split(',').map(Number); g[r][c] = TILE.SKY;
			expect(solveLanterns(g), `穴 ${pit} を空にしても点いた`).toBeNull();
		}
		const open = gridOf().map((row) => row.map((ch) => (ch === TILE.SKY ? TILE.FLOOR : ch)));
		expect(solveLanterns(open, { ladder: false }), '空を床にしてもはしご無しで点かない').not.toBeNull();
		// 灯②の列に立てる床が西の小島の端だけ＝(7,1) を空にすると灯③に火が渡らない
		const noTip = gridOf(); noTip[7][1] = TILE.SKY;
		expect(solveLanterns(noTip), '西の小島の端が無くても点いた').toBeNull();
	});

	test('層の接続は不変', () => {
		const closed = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(closed.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(closed.reachedRooms.has(ROOM), '0,1 に届かない').toBe(true);
		expect(closed.reachedRooms.size, '門を閉じたまま歩ける部屋数').toBe(20);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_boomerang: '1', ps_candle: '1', ...extra,
	});
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
const step = (page, n) => page.evaluate((k) => window.__game.step(k), n);
// tiles マス歩く（movePlayer 1回＝半マス＝[[blade-moveplayer-is-half-tile]]）。
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const snap = (page) => page.evaluate(() => {
	const p = window.__game.getPlayer();
	const ss = window.__game.getStageState();
	return {
		pos: `${Math.floor(p.y + 0.5)},${Math.floor(p.x + 0.5)}`, rupees: p.rupees,
		lit: [...(ss.litTorches ?? [])].sort(), met: [...(ss.conditionsMet ?? [])], opened: [...(ss.openedChests ?? [])],
	};
});
async function candle(page, dir) {
	await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.getPlayer().activeSubItem = 'candle'; }, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	await step(page, 2);
}
async function throwBoomerang(page, dir) {
	await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.getPlayer().activeSubItem = 'boomerang'; }, dir);
	await step(page, 1);
	await page.evaluate(() => window.__game.useSubItem());
	const flying = () => page.evaluate(() => window.__game.getProjectiles().some((p) => p.type === 'boomerang' && p.owner === 'player'));
	expect(await flying(), 'ブーメランが飛ばない').toBe(true);
	for (let i = 0; i < 200 && await flying(); i++) await step(page, 1);
	expect(await flying(), 'ブーメランが戻らない').toBe(false);
}
async function route(page, legs) {
	for (const [d, n, want] of legs) {
		await walk(page, d, n);
		expect((await snap(page)).pos, `${d}×${n} の後`).toBe(want);
	}
}

test.describe('D7 0,1 空の灯籠継ぎ ② 実機', () => {
	test('はしご無しでは西の小島へも北の小島へも渡れない', async ({ page }) => {
		const errors = await boot(page, 7, 5);
		await walk(page, 'left', 2);
		expect((await snap(page)).pos, 'はしご無しで穴 (7,4) を渡れた').toBe('7,5');
		await route(page, [['up', 2, '5,5']]);
		await walk(page, 'up', 2);
		expect((await snap(page)).pos, 'はしご無しで穴 (4,5) を渡れた').toBe('5,5');
		expect(errors).toEqual([]);
	});

	test('本土からは灯②までしか点かず、封印は解けない', async ({ page }) => {
		const errors = await boot(page, 5, 5);
		await candle(page, 'left');
		expect((await snap(page)).lit, 'ロウソクで灯①が点かない').toEqual([T1]);
		await throwBoomerang(page, 'left');
		expect((await snap(page)).lit, '本土の西端から西へ投げて灯②が点かない').toEqual([T1, T2].sort());
		// 本土のどこから投げても灯③・灯④へは渡らない（並ぶ行・列に本土の床が無い）
		for (const [d, n, want, dir] of [['up', 0, '5,5', 'up'], ['right', 1, '5,6', 'up'], ['down', 3, '8,6', 'left']]) {
			if (n) await walk(page, d, n);
			expect((await snap(page)).pos).toBe(want);
			await throwBoomerang(page, dir);
		}
		const s = await snap(page);
		expect(s.lit, '本土から灯③・灯④が点いた').toEqual([T1, T2].sort());
		expect(s.met, '2つで封印が解けた').not.toContain(CHEST);
		expect(errors).toEqual([]);
	});

	test('通し（木）：ロウソク→本土から西→西の小島から北→北の小島から西＝4つが灯り、宝箱でルピー +30', async ({ page }) => {
		const errors = await boot(page, 8, 5, { ps_ladder: '1' });
		expect(await page.evaluate(() => window.__game.getState().player.boomerangTier)).toBe(0);
		const r0 = (await snap(page)).rupees;
		await route(page, [['up', 3, '5,5']]);
		await candle(page, 'left');
		await throwBoomerang(page, 'left');
		expect((await snap(page)).lit).toEqual([T1, T2].sort());
		// 穴 (7,4) を渡って西の小島の端へ
		await route(page, [['down', 2, '7,5'], ['left', 2, '7,3'], ['left', 2, '7,1']]);
		await throwBoomerang(page, 'up');
		expect((await snap(page)).lit, '西の小島の端から北へ投げて灯③が点かない').toEqual([T1, T2, T3].sort());
		// 本土へ戻り、穴 (4,5) を渡って北の小島へ
		await route(page, [['right', 2, '7,3'], ['right', 2, '7,5'], ['up', 2, '5,5'], ['up', 2, '3,5']]);
		await throwBoomerang(page, 'left');
		let s = await snap(page);
		expect(s.lit, '北の小島から西へ投げて灯④が点かない').toEqual([...TORCHES].sort());
		expect(s.met, '全点灯で封印が解けない').toContain(CHEST);
		await route(page, [['up', 1, CHEST]]);
		s = await snap(page);
		expect(s.opened, '宝箱が開かない').toContain(CHEST);
		expect(s.rupees - r0, 'ルピーが 30 増えない').toBe(30);
		expect(errors).toEqual([]);
	});
});
