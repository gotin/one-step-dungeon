// tests/d2-skeleton-warden.spec.js
// dungeon_2 `1,1`（ブーメランの部屋）「旋刃の祭壇と骸骨の番兵」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第1陣 3室目・盤面は `scripts/migrate-d2-1-1-skeleton-warden.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_1 1,1` と 6 セル差以内＝四角い広間に宝箱（ブーメラン）とパトロール E×1（D1 の写し）。
//
// 新しい盤面（2×2 の柱4本の列柱の広間）:
//      2 #.##.θ..##.#   ← (2,5) 骸骨剣士 θ（南の口へ向く）
//      7 #.##B..i##.#   ← (7,4) ブーメランの宝箱・(7,7) 旋刃の書き置き
//   宝箱は南の口から上がってすぐ＝θ が来るより先に開けられる。θ は剣の間合いで正面を構えるが、
//   ブーメランを当てると気絶して構えが解ける＝正面からの剣が通る。
//
// 守るものは2つ。
//   ① データ（幾何）：θ が1体だけ・宝箱は入口から2歩で θ より先・θ は入口と同じ列・層の到達性は不変。
//   ② 挙動（実機）：入口から2歩で宝箱が開きブーメランが手に入る（その時 θ はまだ間合いの外）／
//      構えた θ に正面から斬っても減らない → ブーメランを当てると気絶・構えが解け、同じ正面の剣で減る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { TARGET, WARDEN_DIR, CHEST, SIGN, ENTRY, reach, steps } from '../scripts/migrate-d2-1-1-skeleton-warden.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '1,1';
const stages = map.layers[LAYER].stages;

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
// θ の位置は定数でなく盤面から引く（盤面で θ が動いたら赤くなるように）
function wardenOf(t) {
	const found = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.SKELETON) found.push(`${r},${c}`); }));
	return found;
}

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 1,1 旋刃の祭壇と骸骨の番兵 ① データ', () => {
	test('盤面・敵は θ×1・向き・脅威度・宣言・宝箱はブーメラン・書き置き', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemies.push(`${ch}@${r},${c}`); }));
		const w = wardenOf(t);
		expect(w, 'θ が盤面に1体だけ居ない').toHaveLength(1);
		expect(enemies, '敵は骸骨剣士1体だけ').toEqual([`${TILE.SKELETON}@${w[0]}`]);
		expect(st.enemyDirs).toEqual({ [w[0]]: WARDEN_DIR });
		expect(stageThreat(st, ENEMY_META), '脅威度＝看板部屋 2,1（25.0）より軽い').toBe(18);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
		expect(st.chestContents).toEqual({ [CHEST]: { type: 'item', item: 'boomerang', name: 'ブーメラン' } });
		expect(t[+CHEST.split(',')[0]][+CHEST.split(',')[1]]).toBe(TILE.CHEST);
		expect(Object.keys(st.signData)).toEqual([SIGN]);
		expect(st.signData[SIGN].name).toBe('旋刃の書き置き');
		for (const k of ['showConditions', 'floorItems', 'mapEnters', 'bgTiles']) {
			expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		}
	});

	test('宝箱は入口から2歩・θ より先に開けられる・θ は入口と同じ列（通りで投げる線が揃う）', () => {
		const t = gridOf();
		const [w] = wardenOf(t);
		// 宝箱も盤面から引く（盤面で宝箱が動いたら赤くなるように）
		const chests = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.CHEST) chests.push(`${r},${c}`); }));
		expect(chests, '宝箱が盤面に1つだけ無い').toHaveLength(1);
		const toChest = steps(t, ENTRY, chests[0]);
		const wardenToEntry = steps(t, w, ENTRY);
		expect(toChest, '宝箱が入口から遠い').toBeLessThanOrEqual(2);
		// θ の足（ENEMY_META の speed）／プレイヤーの足（速度換算 1.0）
		expect(toChest, '宝箱を開ける前に θ が入口へ来る').toBeLessThan(wardenToEntry * ENEMY_META[TILE.SKELETON].speed);
		expect(w.split(',')[1], 'θ が入口の列に居ない').toBe(ENTRY.split(',')[1]);
	});

	test('対照：床は全部歩ける・θ を壁で囲めば入口から θ の隣に届かない（測定が空虚でない）', () => {
		const t = gridOf();
		const floors = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ch === '.') floors.push(`${r},${c}`); }));
		const foot = reach(t);
		expect(floors.filter((k) => !foot.has(k)), '取り残された床').toEqual([]);
		const [w] = wardenOf(t);
		const [wr, wc] = w.split(',').map(Number);
		const walled = t.map((row) => [...row]);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) walled[wr + dr][wc + dc] = TILE.WALL;
		expect(reach(walled).has(`${wr + 1},${wc}`), '壁で囲んでも届く＝reach が壁を見ていない').toBe(false);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['0,1', '1,0', '1,1', '1,2']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row, col, ps_weapon: '1', ps_hearts: '3', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await page.evaluate(() => window.__game.pause());
	return errors;
}

test.describe('D2 1,1 旋刃の祭壇と骸骨の番兵 ② 実機', () => {
	test('入口から2歩で宝箱が開きブーメランが手に入る（θ はまだ剣の間合いの外）', async ({ page }) => {
		const [er, ec] = ENTRY.split(',');
		const errors = await boot(page, er, ec);
		// 1歩＝半マス×2（movePlayer 1回＝半マス）。左へ1歩・上へ1歩＝宝箱 (7,4)
		const r = await page.evaluate(() => {
			const g = window.__game;
			for (const d of ['left', 'left', 'up', 'up']) { g.movePlayer(d); g.step(1); }
			const pl = g.getPlayer(), e = g.getEnemies()[0];
			return {
				at: `${pl.y},${pl.x}`,
				opened: [...g.getStageState().openedChests],
				dist: Math.hypot(e.x - pl.x, e.y - pl.y),
			};
		});
		expect(r.at, '宝箱のセルに立てない').toBe(CHEST);
		expect(r.opened, '宝箱が開かない').toContain(CHEST);
		expect(r.dist, '宝箱を開けた時点で θ が剣の間合いに居る').toBeGreaterThan(ENEMY_META[TILE.SKELETON].attack.range);
		// 初入手のヒントを閉じるとブーメランを持っている
		await expect.poll(async () => {
			await page.keyboard.press('Enter');
			return page.evaluate(() => !!window.__game.getPlayer().subItems?.boomerang);
		}, { message: 'ブーメランが手に入らない', timeout: 5000 }).toBe(true);
		expect(errors).toEqual([]);
	});

	test('構えた θ に正面の剣は通らない → ブーメランを当てると気絶・構えが解け、同じ正面の剣で減る', async ({ page }) => {
		// 通り (4,5) から上を向く＝θ が下りてきて正面に立つ（プレビューは無敵＝プレイヤーの HP は測らない）
		const errors = await boot(page, 4, 5, { ps_boomerang: '1' });
		const r = await page.evaluate(() => {
			const g = window.__game;
			const dist = () => { const pl = g.getPlayer(), e = g.getEnemies()[0]; return pl.y - e.y; };
			const front = () => { const pl = g.getPlayer(), e = g.getEnemies()[0]; return Math.abs(e.x - pl.x) < 0.3 && dist() > 0 && dist() <= 1.0; };
			// ① θ は剣の間合い 1.5 で止まって構える＝プレイヤーの剣は届かない∴半歩ずつ詰めて距離 1.0 にする
			for (let i = 0; i < 40 && !front(); i++) {
				if (dist() > 1.0) g.movePlayer('up'); else g.setHeroDir('up');
				g.step(1);
			}
			if (!front()) return { front: false };
			// 剣の当たりは step の中で処理される∴振ってから1 tick 進めて測る
			const slash = () => { g.setHeroDir('up'); g.swordAttack(); g.step(1); return g.getEnemies()[0]?.hp ?? 0; };
			// ② 構えている間に正面から斬る＝減らない（構えが step の前後とも続いた振りだけ数える）
			let guardedSlashes = 0, guardedLoss = 0;
			for (let i = 0; i < 40 && guardedSlashes < 3; i++) {
				const e = g.getEnemies()[0];
				if (!(e.guarding && e.guardDir === 'down' && front())) { g.setHeroDir('up'); g.step(1); continue; }
				const hp0 = e.hp;
				const hp1 = slash();
				if (g.getEnemies()[0].guarding) { guardedSlashes++; guardedLoss += hp0 - hp1; }
				for (let k = 0; k < 3; k++) { g.setHeroDir('up'); g.step(1); }   // 剣の振り直しを待つ
			}
			// ③ ブーメランを当てる＝気絶して構えが解ける（構えた正面に当てる＝ダメージは弾かれても気絶は通る）
			let stunned = false, guardAfter = null;
			for (let i = 0; i < 20 && !stunned; i++) {
				g.setHeroDir('up');
				if (!g.getProjectiles().some((p) => p.owner === 'player')) g.useSubItem();
				g.step(1);
				const e = g.getEnemies()[0];
				if ((e.stunUntil ?? 0) > g.getState().gameTime) { stunned = true; guardAfter = e.guarding; }
			}
			// ④ 気絶中に同じ位置・同じ正面から斬る＝減る
			const frontAtStun = front();
			const hpB = g.getEnemies()[0]?.hp;
			const hpC = slash();
			return { front: true, guardedSlashes, guardedLoss, stunned, guardAfter, frontAtStun, hpB, hpC };
		});
		expect(r.front, 'θ の正面・剣の届く距離 1.0 に立てない').toBe(true);
		expect(r.guardedSlashes, '構えた θ を正面から斬る機会が無い').toBeGreaterThanOrEqual(1);
		expect(r.guardedLoss, '構えた θ に正面の剣が通った').toBe(0);
		expect(r.stunned, 'ブーメランで θ が気絶しない').toBe(true);
		expect(r.guardAfter, '気絶しても構えが解けない').toBe(false);
		expect(r.frontAtStun, '気絶中の θ が正面から外れた').toBe(true);
		expect(r.hpC, '気絶中の θ に正面の剣が通らない').toBeLessThan(r.hpB);
		expect(errors).toEqual([]);
	});
});
