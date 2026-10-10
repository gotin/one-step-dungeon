// tests/d5-frozen-shrine-warden.spec.js
// dungeon_5 `0,1`（通り道・鉄の盾の部屋）「凍れる祠の番鮫」の番人
// （2026-10-10 / PLAN 実行キュー 40 の第3陣 6室目・盤面はユーザー作・`scripts/migrate-d5-0-1-frozen-shrine-warden.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   ・`dungeon_4 0,1` の写し＝氷の廃墟なのに水も氷も無い四角い広間の真ん中に、鉄の盾の宝箱が置いてあるだけだった。
//   ・ユーザーがエディタで作り替えた直後は、壁の下にも水（bgTiles）が塗られていた＝はしごが壁を水として渡り、
//     北の岸 (2,3) から壁 (3,3) を越えて祠の床 (4,3) へ、鮫を倒さずに入れた（実測）。
//   ・ブーメランを1回当てて鮫が止まっている間に走り抜けると、宝箱を取れた（ユーザーの実プレイ）
//     ∴宝箱は鮫を全滅させると現れる（killAll）にした。
//
// 新しい盤面（'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles）:
//      3 #~#######kk#
//      4 #~#.~~~~<kk.   ← 祠の池（行4-6・列4-8）に潜み鮫2匹
//      5 #~#B~o~o~kk.   ← 宝箱 (5,3)〈下は石畳・敵全滅で出現〉・飛び石 (5,5)(5,7)＝行5 だけが渡し
//      6 #~#.<~~~~kk#
//      7 #~#######kk#
//
// 守るものは2つ。
//   ① データ（幾何）：盤面と下地（壁の下に下地なし）・敵と宣言・宝箱の出現条件／2つの口が道具なしでつながる・
//      宝箱へは行5 の渡しをはしごで渡るしかない／層の到達性。
//   ② 挙動（実機）：鮫が生きている間は祠へ入っても宝箱が無く、倒せば現れて取れる／北から壁を渡れない／
//      入口から渡しへ走り込んでも鮫が先に渡しを塞ぐ／ブーメランで止めて斬れば無傷で2匹倒せる（剣だけは削られる）／
//      倒さずに東の口から南の口へ抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, WATER, ICE, POOL, ENEMIES, EXITS, CROSSING, STEPS, SHRINE_FLOORS, CHEST_CELL, CHEST_CONDITION,
	effective, walkable,
} from '../scripts/migrate-d5-0-1-frozen-shrine-warden.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '0,1';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const P = (k) => k.split(',').map(Number);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 0,1 凍れる祠の番鮫 ① データ', () => {
	test('盤面・下地（壁の下に無い）・敵の宣言・宝箱は敵全滅で出現', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const bgOf = (ch) => Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === ch).sort();
		expect(bgOf(TILE.WATER), '水は bgTiles').toEqual([...WATER].sort());
		expect(bgOf(TILE.ICE), '床は氷の bgTiles').toEqual([...ICE].sort());
		expect(bgOf(TILE.STONE_FLOOR), '石畳は飛び石と宝箱の下').toEqual([...STEPS, CHEST_CELL].sort());
		expect(Object.keys(st.bgTiles).length).toBe(WATER.length + ICE.length + STEPS.length + 1);
		const underWall = Object.keys(st.bgTiles).filter((k) => { const [r, c] = P(k); return st.tiles[r][c] === TILE.WALL; });
		expect(underWall, '壁の下に下地がある＝はしごが壁を渡れる').toEqual([]);
		expect(ENEMIES).toEqual({ '4,8': TILE.LURK_SHARK, '6,4': TILE.LURK_SHARK });
		for (const k of Object.keys(ENEMIES)) {
			const [r, c] = P(k);
			expect(st.tiles[r][c], `${k} の鮫`).toBe(TILE.LURK_SHARK);
			expect(POOL, `${k} の鮫が池の上にいない`).toContain(k);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const [cr, cc] = P(CHEST_CELL);
		expect(st.tiles[cr][cc]).toBe(TILE.CHEST);
		expect(st.chestContents).toEqual({ [CHEST_CELL]: { type: 'shield', shieldTier: 1, name: '鉄の盾' } });
		expect(st.showConditions, '宝箱が敵全滅で出現しない').toEqual({ [CHEST_CELL]: CHEST_CONDITION });
		expect(CHEST_CONDITION.trigger).toBe('killAll');
		expect(Object.keys(st.floorItems ?? {}), '通り道に拾い物がある').toEqual([]);
	});

	test('2つの口は道具なしでつながり、宝箱へは行5 の渡しをはしごで渡るしかない', () => {
		const t = effective();
		const foot = walkable(t, EXITS.東[0]);
		for (const [name, cells] of Object.entries(EXITS)) {
			for (const k of cells) expect(foot.has(k), `東の口から${name}の口 ${k} へ歩けない`).toBe(true);
		}
		expect(foot.has(CHEST_CELL), '宝箱へ道具なしで行ける').toBe(false);
		const ladder = walkable(t, EXITS.東[0], true);
		expect([...ladder].filter((k) => !foot.has(k)).sort(), 'はしごで増える床が祠の中だけでない')
			.toEqual([...STEPS, CHEST_CELL, ...SHRINE_FLOORS].sort());
		for (const k of CROSSING) {
			expect(POOL, `渡しの水 ${k} が池の外＝鮫が居座れない`).toContain(k);
			const cut = effective();
			const [r, c] = P(k);
			cut[r][c] = TILE.WALL;
			expect(walkable(cut, EXITS.東[0], true).has(CHEST_CELL), `渡しの水 ${k} のほかに祠へ渡れる所がある`).toBe(false);
		}
	});

	test('層の接続：徒歩の到達室は 14 のまま（0,1 は元々はしごの先）・はしごで全室・dead-edge 0', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const ladder = bfsLayer(stages, START, { withLadder: true, openTiles: OPEN });
		expect(ladder.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(ladder.reachedRooms.size).toBe(Object.keys(stages).length);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.reachedRooms.size).toBe(14);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
// debugOff＝'g' で debugMode を切る（プレビューは debugMode:true＝無敵・敵すり抜け）。
// 切らずに使うのは「鮫を素通りして祠へ入った」状態を作るときだけ。
async function boot(page, row, col, { debugOff = true } = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_ladder: '1', ps_boomerang: '1', ps_shield: '0',
	});
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 2);
	if (debugOff) await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
const hold = (page, dirs) => page.evaluate((dirs) => {
	const g = window.__game;
	for (const [d, n] of dirs) for (let i = 0; i < n; i++) { g.movePlayer(d); g.step(1); }
	const pl = g.getPlayer();
	return { r: Math.round(pl.y), c: Math.round(pl.x), shieldTier: pl.shieldTier };
}, dirs);
const killAll = (page) => page.evaluate(() => {
	const g = window.__game;
	for (const s of g.getEnemies()) { g.setEnemyFieldForTest(s.id, { hidden: false }); g.dealDamage(s.id, 999); }
	g.step(5);
	return g.getEnemies().length;
});
// 渡しの東の岸 (5,9) で左を向き、渡しの水 (5,8) に来た鮫と向き合う。
// mode＝'sword'（浮いていれば斬る）／'boom'（浮いたらブーメラン・気絶中は斬る）。
const duel = (page, mode, ticks) => page.evaluate(({ mode, ticks }) => {
	const g = window.__game;
	g.getPlayer().activeSubItem = 'boomerang';
	g.setHeroDir('left');
	const hp0 = g.getState().player.hp;
	let stunnedTicks = 0, hiddenWhileStunned = 0, died = false;
	for (let i = 0; i < ticks; i++) {
		const es = g.getEnemies();
		if (!es.length) break;
		const now = g.getState().gameTime;
		for (const e of es) if ((e.stunUntil ?? 0) > now) { stunnedTicks++; if (e.hidden) hiddenWhileStunned++; }
		const s = es.find((e) => Math.round(e.y) === 5 && Math.round(e.x) === 8);
		if (s) {
			const stunned = (s.stunUntil ?? 0) > now;
			if (mode === 'sword' && !s.hidden) g.swordAttack();
			if (mode === 'boom') {
				const flying = g.getProjectiles().some((q) => q.type === 'boomerang' && q.owner === 'player');
				if (!s.hidden && !stunned && !flying) g.useSubItem();
				else if (stunned) g.swordAttack();
			}
		}
		g.step(1);
		if (g.getState().player.hp <= 0) { died = true; break; }
	}
	return { left: g.getEnemies().length, hpLost: hp0 - g.getState().player.hp, died, stunnedTicks, hiddenWhileStunned };
}, { mode, ticks });

test.describe('D5 0,1 凍れる祠の番鮫 ② 実機', () => {
	test('鮫が生きている間は祠へ入っても宝箱が無く、全滅させると現れて鉄の盾を取れる', async ({ page }) => {
		// 鮫を素通り（debugMode）して宝箱のセルへ＝出現前なので取れない
		let errors = await boot(page, 5, 9, { debugOff: false });
		const ghost = await hold(page, [['left', 40]]);
		expect(ghost, '鮫が生きているのに宝箱を取れた').toEqual({ r: 5, c: 3, shieldTier: 0 });
		expect(errors).toEqual([]);
		// 倒してから渡る＝現れて取れる
		errors = await boot(page, 5, 9);
		expect(await killAll(page)).toBe(0);
		expect(await hold(page, [['left', 40]]), '鮫を全滅させても宝箱を取れない').toEqual({ r: 5, c: 3, shieldTier: 1 });
		expect(errors).toEqual([]);
	});

	test('北の岸から壁を渡って祠へ入れない／入口から渡しへ走り込んでも鮫が先に塞ぐ', async ({ page }) => {
		let errors = await boot(page, 2, 3);
		expect(await hold(page, [['down', 40]]), '北の岸から壁を越えて祠へ入れた').toEqual({ r: 2, c: 3, shieldTier: 0 });
		expect(errors).toEqual([]);
		errors = await boot(page, 5, 11);
		const dash = await hold(page, [['left', 300]]);
		expect(dash.c, '東の口から走り込んだら鮫より先に渡しを渡れた').toBe(9);
		expect(errors).toEqual([]);
	});

	test('浮いた鮫はブーメランで気絶して潜らず噛まない＝止めて斬れば無傷で2匹倒せる（剣だけだと削られる）', async ({ page }) => {
		let errors = await boot(page, 5, 9);
		const boom = await duel(page, 'boom', 1200);
		expect(boom.left, 'ブーメランで止めて斬っても 1200 tick で2匹倒れない').toBe(0);
		expect(boom.stunnedTicks, 'ブーメランで気絶しない').toBeGreaterThan(0);
		expect(boom.hiddenWhileStunned, '気絶している鮫が潜った').toBe(0);
		expect(boom.hpLost, 'ブーメランで止めて斬ったのに噛まれた').toBe(0);
		expect(errors).toEqual([]);

		errors = await boot(page, 5, 9);
		const sword = await duel(page, 'sword', 1200);
		expect(sword.hpLost, '剣だけの斬り合いで削られない＝ブーメランの値打ちが無い').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('倒さずに東の口から南の口へ抜けられる', async ({ page }) => {
		const errors = await boot(page, 4, 11);
		const r = await page.evaluate(() => {
			const g = window.__game;
			// (4,11)→(4,10)→(8,10)→(8,5)→南の口 (9,5) の外へ
			const moves = [...Array(2).fill('left'), ...Array(8).fill('down'), ...Array(10).fill('left'), ...Array(2).fill('down')];
			const hp0 = g.getState().player.hp;
			for (const m of moves) { g.movePlayer(m); g.step(1); }
			const pl = g.getPlayer();
			return { r: pl.y, c: pl.x, hpLost: hp0 - g.getState().player.hp, alive: g.getEnemies().length };
		});
		expect([r.r, r.c], '倒さずに南の口 (9,5) まで歩けない').toEqual([9, 5]);
		expect(r.alive, '通り抜けの間に鮫が倒れた＝倒さずに通った証明にならない').toBe(2);
		expect(r.hpLost, '駆け抜けで削られすぎ').toBeLessThanOrEqual(3);
		expect(errors).toEqual([]);
	});
});
