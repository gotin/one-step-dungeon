// tests/d2-sealfire-crypt.spec.js
// dungeon_2 `2,0`（西の枝の通り道）「封じ火の墓廊」の番人
// （2026-10-10 / PLAN 実行キュー 41 の第2陣 2室目・盤面は `scripts/migrate-d2-2-0-sealfire-crypt.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   `dungeon_1 2,0` とバイト一致＝四角い広間に床のルピー2枚だけ（敵なし・D1 の写し）。
//
// 新しい盤面（墓廊の両側に龕を互い違いに並べた地下墓所）:
//      1 #..##.ψ##..#   ← 北の龕3つ。真ん中の龕の奥に呪い火 ψ
//      2 #..##r.##..#   ← 副葬品のルピー（小）
//      4 ............   ← 墓廊（西の口＝中ボスの部屋 1,0／東の口＝行き止まり 3,0）
//      5 ............
//      7 ###..##.ψ###   ← 南の龕2つ。東の龕の奥に呪い火 ψ
//      8 ###..##R.###   ← 副葬品のルピー（大）
//   ψ は触れると剣を封じる。立って迎え撃つと先に封じられる。ψ は龕の列をまっすぐ寄ってくる＝ブーメランの線。
//
// 守るものは2つ。
//   ① データ（幾何）：ψ が2体・それぞれ別の龕の奥に居て、同じ龕に副葬品がある・龕は袋小路・層の到達性。
//   ② 挙動（実機）：西の口で立って剣を振り続けると先に封じられる（ψ は無傷）／
//      墓廊を歩いて線が揃った ψ にブーメランを投げれば、1度も封じられずに2体とも落ちる。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, EXITS, FIRES, HALL_ROWS, ENTRY, RUPEES, reach, nicheOf,
} from '../scripts/migrate-d2-2-0-sealfire-crypt.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_2';
const ROOM = '2,0';
const stages = map.layers[LAYER].stages;

const P = (k) => k.split(',').map(Number);
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const gridOf = () => stages[ROOM].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cellsOf = (t, pred) => {
	const out = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (pred(ch)) out.push(`${r},${c}`); }));
	return out;
};

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D2 2,0 封じ火の墓廊 ① データ', () => {
	test('盤面・敵は ψ×2・脅威度は看板部屋より軽い・床のルピー2枚・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]).map((k) => `${t[P(k)[0]][P(k)[1]]}@${k}`);
		expect(enemies, '敵は呪い火 ψ 2体だけ').toEqual(FIRES.map((k) => `${TILE.CURSE_FIRE}@${k}`));
		const threat = stageThreat(st, ENEMY_META);
		expect(threat).toBeGreaterThan(0);
		expect(threat, '看板部屋 2,1 の 25.0 を超えた').toBeLessThan(25);
		for (const [ch, k] of Object.entries(RUPEES)) expect(t[P(k)[0]][P(k)[1]], `${k} に ${ch} が無い`).toBe(ch);
		for (const k of ['signData', 'floorItems', 'mapEnters', 'chestContents', 'showConditions', 'bgTiles']) {
			expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('ψ はそれぞれ別の龕の奥に居て、同じ龕に副葬品のルピーがある（ψ の位置は盤面から引く）', () => {
		const t = gridOf();
		const fires = cellsOf(t, (ch) => ch === TILE.CURSE_FIRE);
		expect(fires.length).toBe(2);
		const rupees = cellsOf(t, (ch) => ch === TILE.ITEM_RUPEE || ch === TILE.ITEM_RUPEE_LARGE);
		const niches = fires.map((k) => nicheOf(t, k));
		for (const [i, k] of fires.entries()) {
			const [r] = P(k);
			expect(niches[i].size, `ψ ${k} が龕の中に居ない（墓廊に出ている）`).toBeGreaterThan(0);
			expect(HALL_ROWS.every((h) => Math.abs(h - r) >= 2), `ψ ${k} が龕の口（墓廊の隣）に居る`).toBe(true);
			expect(rupees.filter((x) => niches[i].has(x)).length, `ψ ${k} の龕に副葬品が無い`).toBe(1);
		}
		expect(niches[0].has(fires[1]), '2体の ψ が同じ龕に居る').toBe(false);
	});

	test('龕は5つ・どれも袋小路＝墓廊の真ん中を塞ぐと西の口から東の口へ届かない', () => {
		const t = gridOf();
		const floors = cellsOf(t, (ch) => !BLOCKED.has(ch));
		const niches = [];
		for (const k of floors) {
			if (HALL_ROWS.includes(P(k)[0]) || niches.some((n) => n.has(k))) continue;
			niches.push(nicheOf(t, k));
		}
		expect(niches.map((n) => n.size), '龕の数と大きさ').toEqual([6, 6, 6, 6, 6]);
		const mid = floors.filter((k) => { const [r, c] = P(k); return HALL_ROWS.includes(r) && c >= 5 && c <= 6; });
		const cut = reach(t, ENTRY, new Set(mid));
		for (const k of EXITS.east) expect(cut.has(k), `墓廊を通らずに ${k} へ届く＝龕が抜け道になっている`).toBe(false);
	});

	test('対照：墓廊を塞がなければ西の口から東の口・龕の奥まで歩ける（測定が空虚でない）', () => {
		const seen = reach(gridOf(), ENTRY);
		for (const k of [...EXITS.east, ...FIRES, ...Object.values(RUPEES)]) expect(seen.has(k), `${k} へ歩けない`).toBe(true);
	});

	test('層の接続：dead-edge 0・徒歩で 15 室（書き換え前と同じ）', () => {
		const START = { stage: '1,3', row: 7, col: 2 };
		const OPEN = new Set(['T', '!', 'D', '=']);
		const foot = bfsLayer(stages, START, { withLadder: false, openTiles: OPEN });
		expect(foot.deadEdges, '境界の開きが合っていない').toEqual([]);
		expect(foot.reachedRooms.size, '徒歩で歩ける部屋数').toBe(15);
		for (const k of ['1,0', '2,0', '3,0']) expect(foot.reachedRooms.has(k), `徒歩で ${k} に入れない`).toBe(true);
	});
});

// ── ② 挙動（実機・fromEditor=1 プレビュー）────────────────────────────
const GAME = '/blade-of-lumia/game/';
async function boot(page, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const [row, col] = P(ENTRY);
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row, col, ps_weapon: '1', ps_hearts: '3', ...extra });
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 2);
	// ⚠️ プレビューは debugMode:true＝無敵（takeDamage が早期 return）∴HP・封印を測る本は 'g' で切る。
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}

test.describe('D2 2,0 封じ火の墓廊 ② 実機', () => {
	test('西の口で立ち、寄ってきた ψ へ剣を振り続けると先に剣を封じられる（ψ は無傷）', async ({ page }) => {
		const errors = await boot(page);
		// ψ の速さ 0.25 セル/tick・近い方の ψ まで 8 マス＝30 tick 前後で寄り切る∴120 tick で足りる。
		const r = await page.evaluate(() => {
			const g = window.__game;
			let firstSeal = null, swings = 0, hpAtSeal = null;
			for (let i = 0; i < 120 && firstSeal == null; i++) {
				const pl = g.getPlayer();
				const es = g.getEnemies();
				if (!es.length) break;   // 封じられる前に剣で全部斬れた＝下の expect で赤くする
				const e = es.reduce((a, x) => (Math.abs(x.x - pl.x) + Math.abs(x.y - pl.y) < Math.abs(a.x - pl.x) + Math.abs(a.y - pl.y) ? x : a));
				const dx = e.x - pl.x, dy = e.y - pl.y;
				if (Math.abs(dx) + Math.abs(dy) <= 1.6) {
					g.setHeroDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
					g.swordAttack(); swings++;
				}
				g.step(1);
				if (g.getState().player.swordSealed) { firstSeal = i; hpAtSeal = g.getEnemies().map((x) => x.hp); }
			}
			return { firstSeal, swings, hpAtSeal };
		});
		expect(r.firstSeal, 'ψ に触れても剣が封じられない').not.toBeNull();
		expect(r.swings, 'ψ が剣の届く所まで寄ってこない').toBeGreaterThan(0);
		expect(r.hpAtSeal, '封じられる前に剣が ψ に当たった').toEqual([3, 3]);
		expect(errors).toEqual([]);
	});

	test('墓廊を東へ歩き、線が揃った ψ にブーメランを投げれば、1度も封じられずに2体とも落ちる', async ({ page }) => {
		const errors = await boot(page, { ps_boomerang: '1' });
		// 線が揃う＝ψ と同じ列（行）で距離 4.5 以内。揃わない間は東へ歩く。木のブーメランは HP 3 の ψ を1発で落とす。
		const r = await page.evaluate(() => {
			const g = window.__game;
			let sealed = 0, throws = 0, i = 0;
			for (; i < 400 && g.getEnemies().length; i++) {
				const pl = g.getPlayer();
				const inFlight = g.getProjectiles().some((x) => x.owner === 'player');
				let dir = null;
				for (const e of g.getEnemies()) {
					const dx = e.x - pl.x, dy = e.y - pl.y;
					if (Math.abs(dx) < 0.5 && Math.abs(dy) <= 4.5) dir = dy > 0 ? 'down' : 'up';
					else if (Math.abs(dy) < 0.5 && Math.abs(dx) <= 4.5) dir = dx > 0 ? 'right' : 'left';
				}
				if (dir) { if (!inFlight) { g.setHeroDir(dir); g.useSubItem(); throws++; } }
				else g.movePlayer('right');
				g.step(1);
				if (g.getState().player.swordSealed) sealed++;
			}
			return { left: g.getEnemies().length, sealed, throws, ticks: i, hp: g.getState().player.hp, maxHp: g.getState().player.maxHp };
		});
		expect(r.left, `ψ が残った（${r.throws} 投・${r.ticks} tick）`).toBe(0);
		expect(r.sealed, '途中で剣を封じられた').toBe(0);
		expect(r.throws, '1体1投で落ちていない').toBe(2);
		expect(r.hp).toBe(r.maxHp);
		expect(errors).toEqual([]);
	});
});
