// tests/d3-reef-archerfish.spec.js
// dungeon_3 `2,0`「射水魚の入り江」の番人
// （2026-11-04 / PLAN 実行キュー 94 の4室目・盤面は `scripts/migrate-d3-2-0-reef-archerfish.mjs`・エンジンの変更なし）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間に床の大ルピーが1つあるだけ・敵なし・水なし。
//
// 新しい盤面（'~'＝bgTiles の水）:
//      1 #.........B#   ← 北の岸・宝箱 B(1,10)＝回復薬（大）（全滅で出る）
//      3 #..~/~#~~~~#   ← 西の湾の射水魚 (3,4)・岩礁（列6）
//      4 ...~~~#~~/~#   ← 西の口／東の湾の射水魚 (4,9)
//      8 #6.~~~#~~~~#   ← 床の矢束×5 (8,1)
//
// 守るものは2つ。
//   ① データ：盤面・水・宝箱（回復薬（大）・killAll）・矢束・敵（射水魚×2）・宣言・脅威度・
//      岩礁が湾を2つに割る・湾の上の岸へは隣の湾から水弾の線が通らない・岩礁の付け根へは両方から通る・層の接続。
//   ② 部屋（実機）：岩礁の付け根に立つと両方の湾から撃たれ続ける（実測 113 tick でハート6）
//      ／湾の上の岸で水を向いて立てば、寄ってきた魚の水弾は盾が受け、隣の湾の水弾は岩礁が止める
//        （⚠️ 魚が斜め隣に来た瞬間の1発だけは盾の外＝盾の向き判定は横の成分が勝つ。実測 150 tick でハート0〜1）
//      ／通し＝湾の上から1匹ずつ射る→宝箱が出て回復薬（大）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, FISH_WEST, FISH_EAST, CHEST_CELL, ARROWS_CELL, ARROWS_COUNT,
	SPOT_WEST, SPOT_EAST, REEF_ROOT, OPENING,
} from '../scripts/migrate-d3-2-0-reef-archerfish.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
// 配っているマップで測る＝TARGET で測るとマップを壊しても緑のまま。水は bgTiles∴'~' として重ねる（魚の文字は残す）
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER && ch === TILE.FLOOR ? TILE.WATER : ch)));
const ROWS = grid.length, COLS = grid[0].length;
const parse = (k) => k.split(',').map(Number);
const wet = (r, c) => room.bgTiles?.[`${r},${c}`] === TILE.WATER;
const stand = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && !wet(r, c) && !HARD_BLOCKED.has(grid[r][c]);
const flood = (start, ok) => {
	const seen = new Set([start]);
	const q = [parse(start)];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const k = `${r + dr},${c + dc}`;
			if (!seen.has(k) && ok(r + dr, c + dc)) { seen.add(k); q.push([r + dr, c + dc]); }
		}
	}
	return seen;
};
// 水弾の線（投擲物は四捨五入したセルが壁なら消える）。⚠️ 移行スクリプトの lineClear を import しない＝物差しを共有すると両方壊れて緑。
const clear = (from, to) => {
	const [r0, c0] = parse(from), [r1, c1] = parse(to);
	const n = Math.ceil(Math.hypot(r1 - r0, c1 - c0) / 0.05);
	for (let i = 1; i < n; i++) if (grid[Math.round(r0 + (r1 - r0) * i / n)]?.[Math.round(c0 + (c1 - c0) * i / n)] === TILE.WALL) return false;
	return true;
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D3 射水魚の入り江 ① データ', () => {
	test('盤面・水・宝箱（回復薬（大）・killAll）・矢束・敵（射水魚×2）・宣言・脅威度', () => {
		const shown = TARGET.map((row) => row);
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(shown);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(wet(...parse(FISH_WEST)) && wet(...parse(FISH_EAST)), '魚の下が水でない').toBe(true);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(room.chestContents[CHEST_CELL], '宝箱の中身が回復薬（大）でない').toMatchObject({ type: 'item', item: 'bigHealPotion' });
		expect(room.showConditions, '宝箱が全滅で出ない').toEqual({ [CHEST_CELL]: { trigger: 'killAll' } });
		expect(room.floorItems, '床の矢束が違う').toEqual({ [ARROWS_CELL]: { count: ARROWS_COUNT } });
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs.sort(), '敵が射水魚×2 でない').toEqual([`${TILE.ARCHER_FISH}@${FISH_EAST}`, `${TILE.ARCHER_FISH}@${FISH_WEST}`].sort());
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS に宣言が無い').toBe(true);
		const threat = stageThreat(room, ENEMY_META);
		expect(threat, '脅威度が 32.0 でない').toBe(32);
		expect(threat, '看板部屋 1,3 より重い').toBeLessThan(stageThreat(stages['1,3'], ENEMY_META));
	});

	test('岩礁が湾を2つに割る・湾の上の岸へは隣の湾から線が通らない・付け根へは両方から通る', () => {
		const west = flood(FISH_WEST, wet);
		const east = flood(FISH_EAST, wet);
		expect(west.has(FISH_EAST) || east.has(FISH_WEST), '湾どうしが水でつながっている＝魚が1匹ずつでない').toBe(false);
		// 魚は勇者へ寄ると岩礁沿いの列に来る（西の湾＝列5・東の湾＝列7）
		const rows = [2, 3, 4, 5, 6, 7, 8];
		expect(rows.filter((r) => clear(`${r},7`, SPOT_WEST)).map((r) => `${r},7`), `東の湾から西の湾の上 ${SPOT_WEST} へ線が通る`).toEqual([]);
		expect(rows.filter((r) => clear(`${r},5`, SPOT_EAST)).map((r) => `${r},5`), `西の湾から東の湾の上 ${SPOT_EAST} へ線が通る`).toEqual([]);
		expect(rows.some((r) => clear(`${r},5`, REEF_ROOT)) && rows.some((r) => clear(`${r},7`, REEF_ROOT)),
			`岩礁の付け根 ${REEF_ROOT} が両方の湾から狙われない（対照が崩れた）`).toBe(true);
		for (const k of [SPOT_WEST, SPOT_EAST]) {
			const [r, c] = parse(k);
			expect(wet(r + 1, c), `${k} の真下が水でない＝魚が寄って並ばない`).toBe(true);
		}
	});

	test('西の口から宝箱・矢束・湾の上へ歩ける・層の接続は不変', () => {
		const seen = flood(OPENING.west, stand);
		for (const k of [CHEST_CELL, ARROWS_CELL, SPOT_WEST, SPOT_EAST, REEF_ROOT]) expect(seen.has(k), `${k} へ歩けない`).toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(hearts) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: '4', col: '0',
		ps_weapon: '1', ps_hearts: String(hearts), ps_bow: '1', ps_shield: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」）
async function boot(page, hearts = 10) {
	const errors = [];
	page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
	await page.goto(previewUrl(hearts));
	await waitForBoard(page);
	await page.keyboard.press('g');
	await page.evaluate(() => {
		const g = window.__game; g.pause();
		g.getPlayer()._shownSubItemHint = true;   // 本編では弓（1,2）で既に出ている「初めてのサブアイテム」の窓＝開くと足が止まる
		g.step(1);
	});
	return errors;
}
// stops＝[[行, 列, 向き, 最大 tick, 寄り道]]：そこへ歩き、向きを決めて立つ。shoot なら、その向きに魚が並んだら
// 4 tick 遅れて射る（人の反応）。湾の魚が全部倒れるか最大 tick で次へ。最後に after の床へ歩く。
const PLAN = `((g, stops, shoot, after) => {
	const P = () => g.getState().player;
	const fishes = () => g.getEnemies().filter((e) => e.type === '/');
	const hp0 = P().hp; let ticks = 0;
	const at = {};   // 立っている間の被弾
	const tick = () => { g.step(1); ticks++; };
	const walkTo = (tr, tc) => { for (let n = 0; n < 200; n++) { const p = P(); if (Math.abs(p.y - tr) < 0.01 && Math.abs(p.x - tc) < 0.01) return true; g.movePlayer(Math.abs(p.x - tc) > 0.01 ? (p.x < tc ? 'right' : 'left') : (p.y < tr ? 'down' : 'up')); tick(); if (P().hp <= 0) return false; } return false; };
	const DV = { down: [1, 0], up: [-1, 0], left: [0, -1], right: [0, 1] };
	const lined = [];
	for (const [r, c, dir, tmax, path] of stops) {
		for (const [pr, pc] of path ?? []) walkTo(pr, pc);
		if (!walkTo(r, c)) break;
		g.setHeroDir(dir);
		const hpIn = P().hp; let seen = -1; const t0 = ticks; let line = 0;
		const westBay = c < 6;
		while (ticks - t0 < tmax && P().hp > 0) {
			const p = P(); const [dy, dx] = DV[dir];
			const mine = fishes().filter((f) => (f.x < 6) === westBay);
			if (shoot && !mine.length) break;
			const inLine = mine.some((f) => (dy ? Math.abs(f.x - p.x) < 0.6 && Math.sign(f.y - p.y) === dy : Math.abs(f.y - p.y) < 0.6 && Math.sign(f.x - p.x) === dx));
			if (inLine) line++;
			if (shoot && inLine) { if (seen < 0) seen = ticks; if (ticks - seen >= 4) { g.useSubItem(); seen = -1; } } else seen = -1;
			tick();
		}
		at[r + ',' + c] = hpIn - P().hp;
		lined.push(line);
	}
	if (after) for (const [pr, pc] of after) walkTo(pr, pc);
	const ss = g.getStageState();
	return { ticks, hpLost: hp0 - P().hp, at, lined, fish: fishes().length,
		shown: ss.conditionsMet ?? [], opened: ss.openedChests ?? [],
		big: g.getPlayer().subItems?.bigHealPotion?.count ?? 0 };
})`;

test.describe('D3 射水魚の入り江 ② 部屋', () => {
	test('岩礁の付け根に立つと、両方の湾から斜めに撃たれ続ける', async ({ page }) => {
		const errors = await boot(page, 10);
		const r = await page.evaluate(([plan, root]) => eval(plan)(window.__game, [[...root, 'down', 150, [[1, 1]]]], false, null),
			[PLAN, parse(REEF_ROOT)]);
		expect(r.at[REEF_ROOT], `付け根で撃たれ続けていない（${r.at[REEF_ROOT]}）`).toBeGreaterThanOrEqual(8);   // 実測 12（113 tick でハート6）
		expect(r.lined[0], '付け根の真下に魚が並んだ＝岩礁の陰でない').toBe(0);
		expect(r.fish, '魚が減った').toBe(2);
		expect(errors).toEqual([]);
	});

	test('湾の上の岸で水を向いて立てば、寄ってきた魚と並び、水弾は盾と岩礁が受ける', async ({ page }) => {
		const errors = await boot(page, 10);
		const r = await page.evaluate(([plan, w, e]) => eval(plan)(window.__game, [[...w, 'down', 150, [[1, 1]]], [...e, 'down', 150]], false, null),
			[PLAN, parse(SPOT_WEST), parse(SPOT_EAST)]);
		expect(r.at[SPOT_WEST], `西の湾の上で削られた（${r.at[SPOT_WEST]}）`).toBeLessThanOrEqual(4);   // 実測 2（着いた直後、斜め隣の魚の1発＝盾は横向きの成分で判定∴下向きの盾の外）。付け根の 12 と分かれる
		expect(r.at[SPOT_EAST], `東の湾の上で削られた（${r.at[SPOT_EAST]}）`).toBeLessThanOrEqual(4);   // 実測 0〜2
		expect(r.lined[0] > 20 && r.lined[1] > 20, `湾の魚が真下に並ばない（${r.lined}）＝射返せない`).toBe(true);
		expect(errors).toEqual([]);
	});

	test('通し：湾の上から1匹ずつ射ると宝箱が出て、回復薬（大）が手に入る', async ({ page }) => {
		const errors = await boot(page, 10);
		const shownBefore = await page.evaluate(() => window.__game.getStageState().conditionsMet ?? []);
		expect(shownBefore, '前提：宝箱が最初から出ている').not.toContain(CHEST_CELL);
		const r = await page.evaluate(([plan, w, e, chest]) => eval(plan)(window.__game, [[...w, 'down', 300, [[1, 1]]], [...e, 'down', 300]], true, [chest]),
			[PLAN, parse(SPOT_WEST), parse(SPOT_EAST), parse(CHEST_CELL)]);
		expect(r.fish, '射水魚が残っている').toBe(0);
		expect(r.shown, '全滅しても宝箱が出ない').toContain(CHEST_CELL);
		expect(r.opened, '宝箱が開かない').toContain(CHEST_CELL);
		expect(r.big, '回復薬（大）が手に入らない').toBe(1);
		expect(r.hpLost, `減りすぎ（${r.hpLost}）`).toBeLessThanOrEqual(6);   // 実測 2〜4（湾の上へ歩く間の被弾）
		expect(errors).toEqual([]);
	});
});
