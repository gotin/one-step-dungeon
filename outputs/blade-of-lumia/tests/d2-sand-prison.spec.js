// tests/d2-sand-prison.spec.js
// dungeon_2 `0,3`（入口の脇の行き止まり）「砂の獄」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第2陣 4室目・盤面は `scripts/migrate-d2-0-3-sand-prison.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_1 0,3` とバイト一致＝四角い広間に床のルピー R が1つだけ（敵なし）。
//
// 新しい盤面（西の壁沿いに格子で閉じた牢が3つ・広間にレバー）:
//      1 #.βT.......#   ← 北の牢：跳躍蜘蛛 β
//      4 #B.T...Y....   ← 中の牢：宝箱／レバー（スイッチ Y）
//      7 #E.T.......#   ← 南の牢：巡回兵 E×2
//      8 #.ET.......#
//   レバー1つが6枚の格子をまとめて上げる＝宝を取るには囚われ者も放つ。
//   ブーメランは閉じた格子を越えて飛ぶ＝放つ前に牢の中を削れる（ブーメランはレバーを叩けない）。
//
// 守るものは2つ。
//   ① データ（幾何）：牢は格子でしか出入りできない・格子の手前から剣は届かずブーメランは届く・層の到達性。
//   ② 挙動（実機）：格子の前に立っても囚われ者に削られない／ブーメランは格子越しに当たるがレバーは動かさない／
//      剣でレバーを叩くと格子6枚が上がり、宝箱が開けられる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, LEVER, INMATES, CHEST, CHEST_CONTENT, cellOf, targetBg, reach, boomerangLine,
} from '../scripts/migrate-d2-0-3-sand-prison.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '0,3';
const stages = map.layers[LAYER].stages;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, pred) => {
	const out = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (pred(ch)) out.push(`${r},${c}`); }));
	return out;
};
const nb = (k) => { const [r, c] = P(k); return [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => `${r + dr},${c + dc}`); };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 0,3 砂の獄 ① データ', () => {
	test('盤面・囚われ者は β×1 と E×2・脅威度は看板部屋より軽い・宝箱は条件なし・レバー→格子6枚・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]).map((k) => `${t[P(k)[0]][P(k)[1]]}@${k}`).sort();
		expect(enemies, '囚われ者が違う').toEqual(Object.entries(INMATES).map(([k, ch]) => `${ch}@${k}`).sort());
		const threat = stageThreat(st, ENEMY_META);
		expect(threat).toBeGreaterThan(0);
		expect(threat, '看板部屋 2,1 の 25.0 を超えた').toBeLessThan(25);
		expect(st.chestContents).toEqual({ [CHEST]: CHEST_CONTENT });
		expect(Object.keys(st.showConditions ?? {}), '宝箱に出現条件が付いた（初めから格子の向こうに見えているはず）').toEqual([]);
		const gates = cellsOf(t, (ch) => ch === TILE.GATE);
		expect(cellsOf(t, (ch) => ch === TILE.SWITCH), 'スイッチはレバー1つ').toEqual([LEVER]);
		expect(gates, '格子が6枚でない').toHaveLength(6);
		expect(st.links, 'レバーが格子6枚をまとめて上げる形でない').toEqual(gates.map((g) => ({ switchId: LEVER, gateId: g })));
		for (const k of ['signData', 'floorItems', 'mapEnters']) expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('下地：牢の中と格子は石畳・ほかの床は砂（盤面から引く）', () => {
		const t = gridOf();
		expect(stages[ROOM].bgTiles).toEqual(targetBg(rowsOf(stages[ROOM])));
		for (const k of cellsOf(t, (ch) => !!ENEMY_META[ch] || ch === TILE.CHEST)) {
			expect(stages[ROOM].bgTiles[k], `${k} が牢の石畳の上に無い`).toBe(TILE.STONE_FLOOR);
		}
	});

	test('牢は格子でしか出入りできない：閉じたままでは宝箱の隣にも囚われ者の所にも立てない', () => {
		const t = gridOf();
		const closed = reach(t);
		for (const k of [...nb(CHEST), ...cellsOf(t, (ch) => !!ENEMY_META[ch])]) {
			expect(closed.has(k) && cellOf(k) !== null, `格子を閉じたまま牢の中 ${k} へ歩ける`).toBe(false);
		}
		// 牢ごとに、その牢の格子だけを塞げば（他の格子を上げても）中へ入れない。囚われ者と宝箱の位置は盤面から引く。
		const gates = cellsOf(t, (ch) => ch === TILE.GATE);
		for (const k of [CHEST, ...cellsOf(t, (ch) => !!ENEMY_META[ch])]) {
			const mine = gates.filter((g) => Math.abs(P(g)[0] - P(k)[0]) <= 1 && cellOf(`${P(g)[0]},${P(g)[1] - 1}`) === cellOf(k));
			const cutReach = reach(t, { open: true, cut: new Set(mine) });
			const inner = nb(k).concat(k).filter((x) => cellOf(x) === cellOf(k));
			expect(inner.some((x) => cutReach.has(x)), `${k} の牢へ自分の格子以外から入れる`).toBe(false);
		}
	});

	test('対照：格子を上げれば宝箱の隣にも囚われ者の所にも歩ける（測定が空虚でない）', () => {
		const t = gridOf();
		const open = reach(t, { open: true });
		expect(nb(CHEST).some((k) => open.has(k)), '格子を上げても宝箱の隣へ歩けない').toBe(true);
		for (const k of cellsOf(t, (ch) => !!ENEMY_META[ch])) expect(open.has(k), `${k} へ歩けない`).toBe(true);
	});

	test('格子の手前から剣は届かずブーメランは届く／対照＝格子を壁にすると届かない', () => {
		const t = gridOf();
		const closed = reach(t);
		const interior = cellsOf(t, () => true).filter((k) => cellOf(k));
		let minCheb = Infinity;
		for (const a of closed) for (const k of interior) {
			const [r0, c0] = P(a), [r1, c1] = P(k);
			minCheb = Math.min(minCheb, Math.max(Math.abs(r0 - r1), Math.abs(c0 - c1)));
		}
		expect(minCheb, '格子の手前に、牢の中と隣り合うセルがある＝剣が格子を越えて届く').toBeGreaterThanOrEqual(2);
		const walled = t.map((row) => row.map((ch) => (ch === TILE.GATE ? TILE.WALL : ch)));
		for (const k of cellsOf(t, (ch) => !!ENEMY_META[ch])) {
			expect([...closed].some((a) => boomerangLine(t, a, k)), `${k} へ格子越しに投げて届く座が無い`).toBe(true);
			expect([...closed].some((a) => boomerangLine(walled, a, k)), `格子を壁にしても ${k} へ届く＝測定が格子を見ていない`).toBe(false);
		}
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['0,3', '1,3']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '3', ps_shield: '1', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 3);
	await page.keyboard.press('g');   // fromEditor の無敵を切る（被弾を測る）
	await page.evaluate(() => window.__game.pause());
	return errors;
}

test.describe('D2 0,3 砂の獄 ② 実機', () => {
	test('格子の前に立ち止まっても囚われ者に削られず、囚われ者は牢から出ない', async ({ page }) => {
		for (const [r, c] of [[1, 4], [8, 4]]) {
			const errors = await boot(page, r, c);
			const res = await page.evaluate(() => {
				const g = window.__game;
				const hp0 = g.getPlayer().hp;
				g.setHeroDir('left');
				const seen = [];
				for (let i = 0; i < 300; i++) {
					g.step(1);
					for (const e of g.getEnemies()) seen.push(`${Math.round(e.y)},${Math.round(e.x)}`);
				}
				return { hp0, hp1: g.getPlayer().hp, seen: [...new Set(seen)] };
			});
			expect(res.hp1, `(${r},${c}) で格子越しに削られた`).toBe(res.hp0);
			for (const k of res.seen) expect(cellOf(k), `囚われ者が牢の外 ${k} に出た`).not.toBeNull();
			expect(errors).toEqual([]);
		}
	});

	test('ブーメランは閉じた格子を越えて囚われ者に当たる・レバーの上を飛んでも格子は上がらない', async ({ page }) => {
		const errors = await boot(page, 1, 5, { ps_boomerang: '1' });
		const r = await page.evaluate(() => {
			const g = window.__game;
			const spider = () => g.getEnemies().find((e) => e.id === '1,2');
			const hp0 = spider().hp;
			g.setHeroDir('left'); g.useSubItem();
			let hit = false;
			for (let i = 0; i < 20 && !hit; i++) {
				g.step(1);
				const s = spider();
				hit = !s || s.hp < hp0 || (s.stunUntil ?? 0) > g.getState().gameTime;
			}
			for (let i = 0; i < 20; i++) g.step(1);   // ブーメランを受け取る
			const gatesAfterSnipe = g.getStageState().openGates.length;
			// レバーの行（行4）で東から西へ投げる＝レバー (4,7) の上を飛ぶ。
			return { hit, gatesAfterSnipe };
		});
		expect(r.hit, 'ブーメランが格子越しに跳躍蜘蛛へ当たらない').toBe(true);
		expect(r.gatesAfterSnipe, '格子越しに投げただけで格子が上がった').toBe(0);
		await page.evaluate(() => window.__game.pause());
		const errors2 = await boot(page, 4, 9, { ps_boomerang: '1' });
		const lever = await page.evaluate(() => {
			const g = window.__game;
			g.setHeroDir('left'); g.useSubItem();
			let passed = false;
			for (let i = 0; i < 30; i++) {
				g.step(1);
				const pr = g.getProjectiles().find((x) => x.owner === 'player');
				if (pr && pr.x <= 6.5) passed = true;
			}
			const ss = g.getStageState();
			return { passed, toggles: ss.switchToggles.length, gates: ss.openGates.length };
		});
		expect(lever.passed, 'ブーメランがレバーの西まで飛んでいない＝測定が空虚').toBe(true);
		expect(lever.toggles, 'ブーメランでレバーが入った').toBe(0);
		expect(lever.gates, 'ブーメランで格子が上がった').toBe(0);
		expect(errors).toEqual([]);
		expect(errors2).toEqual([]);
	});

	test('剣でレバーを叩くと格子6枚が上がり、囚われ者が出てきて、中の牢の宝箱を開けられる', async ({ page }) => {
		const errors = await boot(page, 5, 7);
		const r = await page.evaluate(() => {
			const g = window.__game;
			g.setHeroDir('up'); g.swordAttack(); g.step(1);   // レバー (4,7) は真上
			const gates = g.getStageState().openGates.length;
			let out = false;
			for (let i = 0; i < 60 && !out; i++) {
				g.step(1);
				out = g.getEnemies().some((e) => Math.round(e.x) >= 3);
			}
			// 囚われ者を片付けてから中の牢へ歩く（行5 を西へ → 列1 で北へ＝宝箱 (4,1)）
			for (const e of g.getEnemies()) g.dealDamage(e.id, 99, 'sword', e.x, e.y);
			g.step(2);
			const rupees0 = g.getPlayer().rupees;
			for (let i = 0; i < 40 && g.getPlayer().x > 1.01; i++) { g.movePlayer('left'); g.step(1); }
			for (let i = 0; i < 6 && g.getPlayer().y > 4.01; i++) { g.movePlayer('up'); g.step(1); }
			return { gates, out, left: g.getEnemies().length, opened: [...g.getStageState().openedChests], rupees0, rupees1: g.getPlayer().rupees };
		});
		expect(r.gates, '剣で叩いても格子6枚が上がらない').toBe(6);
		expect(r.out, '格子を上げても囚われ者が牢から出てこない').toBe(true);
		expect(r.left).toBe(0);
		expect(r.opened, '中の牢の宝箱が開かない').toContain(CHEST);
		expect(r.rupees1 - r.rupees0, '宝箱の中身').toBe(CHEST_CONTENT.value);
		expect(errors).toEqual([]);
	});
});
