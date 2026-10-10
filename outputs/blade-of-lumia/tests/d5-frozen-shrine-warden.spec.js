// tests/d5-frozen-shrine-warden.spec.js
// dungeon_5 `0,1`（通り道・鉄の盾の部屋）「凍れる祠の番鮫」の番人
// （2026-10-10 / PLAN 実行キュー 40 の第3陣 6室目・盤面は `scripts/migrate-d5-0-1-frozen-shrine-warden.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_4 0,1` の写し＝氷の廃墟なのに水も氷も無い四角い広間の真ん中に、鉄の盾の宝箱が置いてあるだけだった。
//
// 新しい盤面（'k'＝氷・'~'＝水＝どちらも bgTiles）:
//      3 #~~~~####~~#
//      4 #~~~~#Bk<kk.   ← 祠：宝箱 (4,6)・祠の床 (4,7)・崩れた入口の穴 (4,8) に潜み鮫
//      5 #~~~~####kk.
//      8 #~~~~kkkkkk#
//   凍れる湖に浮かぶ祠。祠へは穴（水1枚）をはしごで渡るしかなく、鮫がいる限り渡れない（敵とは重なれない）。
//
// 守るものは2つ。
//   ① データ（幾何）：盤面と下地・敵と宣言・鉄の盾の宝箱／2つの口が道具なしでつながる・祠の床へは穴を
//      はしごで渡るしかない・宝箱に面して立てるのは祠の床だけ／層の到達性。
//   ② 挙動（実機）：鮫がいる間ははしごで穴を渡れず、倒せば渡って鉄の盾を取れる／浮いた鮫にブーメランを
//      当てると気絶して潜らず噛まない＝止めて斬れば無傷で倒せる（剣だけの斬り合いは削られる）／
//      倒さずに東の口から南の口へ抜けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, WATER, ICE, ENEMIES, EXITS, HOLE, ALCOVE, CHEST_CELL, effective, walkable }
	from '../scripts/migrate-d5-0-1-frozen-shrine-warden.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_5';
const ROOM = '0,1';
const stages = map.layers[LAYER].stages;
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const P = (k) => k.split(',').map(Number);
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D5 0,1 凍れる祠の番鮫 ① データ', () => {
	test('盤面・水と氷の下地・敵の宣言・鉄の盾の宝箱', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const bgWater = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.WATER).sort();
		const bgIce = Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === TILE.ICE).sort();
		expect(bgWater, '水は bgTiles').toEqual([...WATER].sort());
		expect(bgIce, '床は氷の bgTiles').toEqual([...ICE].sort());
		expect(Object.keys(st.bgTiles).length).toBe(WATER.length + ICE.length);
		expect(ENEMIES).toEqual({ [HOLE]: TILE.LURK_SHARK });
		const [hr, hc] = P(HOLE);
		expect(st.tiles[hr][hc], '穴の鮫').toBe(TILE.LURK_SHARK);
		expect(WATER, '鮫が水の上にいない').toContain(HOLE);
		for (const [dr, dc] of DIRS4) expect(WATER.includes(`${hr + dr},${hc + dc}`), '穴が水1枚でない＝鮫が動ける').toBe(false);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'5.5m の配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const [cr, cc] = P(CHEST_CELL);
		expect(st.tiles[cr][cc]).toBe(TILE.CHEST);
		expect(st.chestContents).toEqual({ [CHEST_CELL]: { type: 'shield', shieldTier: 1, name: '鉄の盾' } });
		expect(Object.keys(st.floorItems ?? {}), '通り道に拾い物がある').toEqual([]);
		expect(Object.keys(st.showConditions ?? {}), '宝箱に封印が付いた').toEqual([]);
	});

	test('2つの口は道具なしでつながり、祠の床へは穴をはしごで渡るしかない', () => {
		const t = effective();
		const foot = walkable(t, EXITS.東[0]);
		for (const [name, cells] of Object.entries(EXITS)) {
			for (const k of cells) expect(foot.has(k), `東の口から${name}の口 ${k} へ歩けない`).toBe(true);
		}
		expect(foot.has(ALCOVE), '祠の床へ道具なしで行ける').toBe(false);
		const ladder = walkable(t, EXITS.東[0], true);
		expect([...ladder].filter((k) => !foot.has(k)), 'はしごで増える床が祠の床だけでない').toEqual([ALCOVE]);
		const cut = effective();
		const [hr, hc] = P(HOLE);
		cut[hr][hc] = TILE.WALL;
		expect(walkable(cut, EXITS.東[0], true).has(ALCOVE), '穴のほかに祠へ渡れる所がある').toBe(false);
		const [cr, cc] = P(CHEST_CELL);
		const faces = DIRS4.map(([dr, dc]) => `${cr + dr},${cc + dc}`).filter((k) => ladder.has(k));
		expect(faces, '宝箱に面して立てるのが祠の床だけでない').toEqual([ALCOVE]);
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
async function boot(page, row, col) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_ladder: '1', ps_boomerang: '1', ps_shield: '0',
	});
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）かつ敵すり抜け∴'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 穴の東の岸 (4,9) で左を向いて鮫と向き合う。mode＝'sword'（浮いていれば斬る）／'boom'（浮いたらブーメラン・気絶中は斬る）。
const duel = (page, mode, ticks) => page.evaluate(({ mode, ticks }) => {
	const g = window.__game;
	g.getPlayer().activeSubItem = 'boomerang';
	g.setHeroDir('left');
	const hp0 = g.getState().player.hp;
	let killedAt = null, stunnedTicks = 0, hiddenWhileStunned = 0, throws = 0;
	for (let i = 0; i < ticks; i++) {
		const s = g.getEnemies()[0];
		if (!s) { killedAt = i; break; }
		const stunned = (s.stunUntil ?? 0) > g.getState().gameTime;
		if (stunned) { stunnedTicks++; if (s.hidden) hiddenWhileStunned++; }
		if (mode === 'sword' && !s.hidden) g.swordAttack();
		if (mode === 'boom') {
			const flying = g.getProjectiles().some((q) => q.type === 'boomerang' && q.owner === 'player');
			if (!s.hidden && !stunned && !flying) { g.useSubItem(); throws++; }
			else if (stunned) g.swordAttack();
		}
		g.step(1);
	}
	return { killedAt, hpLost: hp0 - g.getState().player.hp, stunnedTicks, hiddenWhileStunned, throws };
}, { mode, ticks });

test.describe('D5 0,1 凍れる祠の番鮫 ② 実機', () => {
	test('鮫がいる間ははしごで穴を渡れず、倒せば渡って鉄の盾を取れる', async ({ page }) => {
		const errors = await boot(page, 4, 9);
		const blocked = await page.evaluate(() => {
			const g = window.__game;
			for (let i = 0; i < 40; i++) { g.movePlayer('left'); g.step(1); }
			const pl = g.getPlayer();
			return { r: pl.y, c: pl.x, shieldTier: pl.shieldTier };
		});
		expect(blocked, '鮫がいるのに穴を渡れた').toEqual({ r: 4, c: 9, shieldTier: 0 });
		const after = await page.evaluate(() => {
			const g = window.__game;
			const s = g.getEnemies()[0];
			g.setEnemyFieldForTest(s.id, { hidden: false });
			g.dealDamage(s.id, 999);
			for (let i = 0; i < 20; i++) { g.movePlayer('left'); g.step(1); }
			const pl = g.getPlayer();
			return { r: pl.y, c: pl.x, shieldTier: pl.shieldTier };
		});
		expect(after, '鮫を倒しても祠へ渡って鉄の盾を取れない').toEqual({ r: 4, c: 6, shieldTier: 1 });
		expect(errors).toEqual([]);
	});

	test('浮いた鮫はブーメランで気絶して潜らず噛まない＝止めて斬れば無傷で倒せる（剣だけだと削られる）', async ({ page }) => {
		let errors = await boot(page, 4, 9);
		const boom = await duel(page, 'boom', 400);
		expect(boom.killedAt, 'ブーメランで止めて斬っても 400 tick で倒れない').not.toBeNull();
		expect(boom.stunnedTicks, 'ブーメランで気絶しない').toBeGreaterThan(0);
		expect(boom.hiddenWhileStunned, '気絶している鮫が潜った').toBe(0);
		expect(boom.hpLost, 'ブーメランで止めて斬ったのに噛まれた').toBe(0);
		expect(errors).toEqual([]);

		errors = await boot(page, 4, 9);
		const sword = await duel(page, 'sword', 400);
		expect(sword.killedAt, '剣だけで 400 tick で倒れない').not.toBeNull();
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
		expect(r.alive, '通り抜けの間に鮫が倒れた＝倒さずに通った証明にならない').toBe(1);
		expect(r.hpLost, '駆け抜けで削られすぎ').toBeLessThanOrEqual(3);
		expect(errors).toEqual([]);
	});
});
