// tests/d1-rupee-vault.spec.js
// dungeon_1 `2,0`（中ボスの部屋 `1,0` と鎧の部屋 `3,0` の間の通り道）「裏口の金庫とルピー喰い」の番人
// （2026-10-12 / PLAN 実行キュー 47 の第1陣 6室目・盤面は `scripts/migrate-d1-2-0-rupee-vault.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   東西に抜けるだけの四角い空き部屋に、小ルピーと大ルピーが1つずつ落ちているだけ（キュー21 の F6）。
//
// 新しい盤面:
//      1 #..........#   ← 北の通り（裏口の前）
//      2 #.###.####.#   ← 金庫の裏口 (2,5)
//      3 #.#r....r#.#
//      4 ..#R.rσ.R#..   ← 西の口／東の口／ルピー喰い σ（金庫の中）
//      5 ..########..
//      6 #..........#
//      7 #..........#   ← 南の広間
//      8 #..........#
//
// 守るものは2つ。
//   ① データ（幾何）：σ×1 は金庫の中・宝はすべて金庫の中・金庫の口は北の裏口だけ・東西の口は金庫を通らずに
//      つながる・層の到達性。
//   ② 挙動（実機）：南の広間・東西の脇・東西の口に立っている間、σ は箱の壁に阻まれて金庫から出てこない（檻）／
//      裏口の前に立つと出てくる（対照）／金庫の中では張り付かれてルピーを吸われる・張り付いている間は体力が減らない／
//      予告を避けて斬れば木の剣・ハート3つで倒せ、吸われた分の半分が戻り、宝を全部拾える。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET, ENTRY, EXITS, EATER, DOOR, VAULT_RUPEES, RUPEE_VALUE, LEECH, SIGNATURE_THREAT, GATE_THREAT, vaultCells, reach,
} from '../scripts/migrate-d1-2-0-rupee-vault.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_1';
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
const VAULT_TOTAL = Object.values(VAULT_RUPEES).reduce((a, ch) => a + RUPEE_VALUE[ch], 0);

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D1 2,0 裏口の金庫とルピー喰い ① データ', () => {
	test('盤面・敵は σ×1 で金庫の中・脅威度は中ボスの部屋より軽い・宝はすべて金庫の中・宣言', () => {
		const st = stages[ROOM];
		expect(rowsOf(st)).toEqual(TARGET);
		expect(st.tiles.every((r) => Array.isArray(r)), 'tiles は文字の配列の配列').toBe(true);
		const t = gridOf();
		const enemies = cellsOf(t, (ch) => !!ENEMY_META[ch]).map((k) => `${t[P(k)[0]][P(k)[1]]}@${k}`);
		expect(enemies, '敵はルピー喰い 1体だけ').toEqual([`${TILE.RUPEE_EATER}@${EATER}`]);
		expect(vaultCells().includes(EATER), 'σ が金庫の外に居る').toBe(true);
		const threat = stageThreat(st, ENEMY_META);
		expect(threat, '中ボスの部屋 1,0 より重くなった').toBeLessThan(GATE_THREAT);
		expect(threat, '看板部屋 1,1 より軽い＝σ ではない敵に変わった').toBeGreaterThan(SIGNATURE_THREAT);
		const rupees = cellsOf(t, (ch) => ch === TILE.ITEM_RUPEE || ch === TILE.ITEM_RUPEE_LARGE);
		expect(rupees.sort(), '床のルピーの位置').toEqual(Object.keys(VAULT_RUPEES).sort());
		expect(rupees.every((k) => vaultCells().includes(k)), 'ルピーが金庫の外にある').toBe(true);
		expect(VAULT_TOTAL).toBe(13);
		for (const k of ['signData', 'floorItems', 'mapEnters', 'chestContents', 'showConditions', 'bgTiles']) {
			expect(Object.keys(st[k] ?? {}), `${k} が空でない`).toEqual([]);
		}
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS の宣言').toBe(true);
	});

	test('金庫：口は北の裏口だけ（裏口を切ると宝へ届かない）・東西の口は金庫を通らずにつながる', () => {
		const t = gridOf();
		const vault = vaultCells();
		expect(vault.every((k) => reach(t).has(k)), '切らなくても金庫へ届かない＝測定が空虚').toBe(true);
		expect(vault.some((k) => reach(t, ENTRY, new Set([DOOR])).has(k)), '裏口を通らずに金庫へ入れる').toBe(false);
		expect(P(DOOR)[0], '裏口が金庫の北に無い').toBeLessThan(Math.min(...vault.map((k) => P(k)[0])));
		expect(reach(t, ENTRY, new Set([...vault, DOOR])).has(EXITS.east[0]), '東西の通り抜けが金庫を通る').toBe(true);
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
// ⚠ プレビューは debugMode:true＝被弾しない・isPassable が無条件 true∴HP と通行を測る本は 'g' で debug を切る。
const GAME = '/blade-of-lumia/game/';
const RUPEES0 = 30;
async function boot(page, [row, col]) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '3', ps_rupees: String(RUPEES0),
	});
	await page.goto(`${GAME}?${q}`);
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await page.keyboard.press('g');
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// n tick 立ち止まる（剣は振らない）。σ の一番南の行・張り付いた tick・張り付き中に減った体力・吸われた額を返す。
const stand = (page, n) => page.evaluate((n) => {
	const g = window.__game;
	const s0 = g.getState().player;
	let maxY = 0, minY = 99, firstAtt = null, hpLostAttached = 0, last = s0.hp;
	for (let i = 0; i < n; i++) {
		const was = g.getEnemies()[0]?.attached;
		g.step(1);
		const e = g.getEnemies()[0];
		const hp = g.getState().player.hp;
		if (was && e?.attached && hp < last) hpLostAttached += last - hp;
		last = hp;
		maxY = Math.max(maxY, e.y); minY = Math.min(minY, e.y);
		if (e.attached && firstAtt === null) firstAtt = i;
	}
	const s = g.getState().player;
	return { maxY, minY, firstAtt, hpLostAttached, hpLost: s0.hp - s.hp, drained: s0.rupees - s.rupees };
}, n);

test.describe('D1 2,0 裏口の金庫とルピー喰い ② 実機', () => {
	test('檻：南の広間・東西の脇・東西の口に立っている間、σ は金庫から出てこない（張り付き 0・被弾 0）', async ({ page }) => {
		// 実測＝金庫の外の 17 か所に 150 tick 立ち続けて、σ が出てきたのは北の通りの (1,3)(1,4)(1,5) だけ。
		for (const at of [[4, 0], [8, 1], [6, 6], [8, 8], [5, 10], [4, 11], [1, 1]]) {
			const errors = await boot(page, at);
			const r = await stand(page, 150);
			expect(r.maxY, `${at} に立つと σ が金庫の南の壁を越えた`).toBeLessThanOrEqual(4);
			expect(r.minY, `${at} に立つと σ が裏口から出た`).toBeGreaterThanOrEqual(3);
			expect(r.firstAtt, `${at} で張り付かれた`).toBeNull();
			expect(r.hpLost, `${at} で削られた`).toBe(0);
			expect(errors).toEqual([]);
		}
	});

	test('対照：裏口の前 (1,5) に立つと、σ が裏口から出てきて張り付き、ルピーを吸う', async ({ page }) => {
		const errors = await boot(page, [1, 5]);
		const r = await stand(page, 80);
		expect(r.minY, '裏口の前でも σ が出てこない＝檻の比較が空虚').toBeLessThan(P(DOOR)[0]);
		expect(r.firstAtt, '張り付かない').not.toBeNull();
		expect(r.drained, '吸われない').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('金庫の中では、どの隅に立っても張り付かれて吸われる・張り付いている間は体力が減らない', async ({ page }) => {
		for (const at of [[3, 3], [4, 3], [3, 8], [4, 8]]) {
			const errors = await boot(page, at);
			const r = await stand(page, 80);
			expect(r.firstAtt, `金庫の ${at} で張り付かれない（σ が引っかかった）`).not.toBeNull();
			expect(r.drained, `金庫の ${at} で吸われない`).toBeGreaterThanOrEqual(LEECH.amount * 5);
			expect(r.hpLostAttached, `張り付いている間に体力が減った（${at}）`).toBe(0);
			expect(errors).toEqual([]);
		}
	});

	test('裏口から入り、予告を避けて斬れば木の剣・ハート3つで倒せ、吸われた分の半分が戻り、宝を全部拾える', async ({ page }) => {
		const errors = await boot(page, [1, 5]);
		const TB = TARGET;
		// 戦う：張り付かれたら斬る（剥がれる・最初だけ 6 吸われるまで待つ）／予告を見たら 2 マス離れる／隣に来たら斬る／それ以外は寄る。
		const fight = await page.evaluate((T) => {
			const g = window.__game;
			const keys = ['up', 'down', 'left', 'right'];
			const D = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
			const hold = (k) => { for (const o of keys) if (o !== k) g.releaseInput(o); if (k) g.queueInput(k); };
			const free = (y, x) => [[Math.floor(y), Math.floor(x)], [Math.ceil(y), Math.ceil(x)]]
				.every(([r, c]) => T[r] && T[r][c] !== undefined && T[r][c] !== '#');
			let dodge = null, stolen = 0, rBefore = null;
			for (let i = 0; i < 600; i++) {
				const e = g.getEnemies()[0];
				const p = g.getPlayer();
				if (!e) { hold(null); return { killedAt: i, stolen, rBefore, rAfter: g.getState().player.rupees, hp: g.getState().player.hp }; }
				stolen = e.stolenRupees; rBefore = g.getState().player.rupees;
				const dx = e.x - p.x, dy = e.y - p.y;
				let move = null;
				// 最初の張り付きは 6 吸われるまで待つ（払い戻しを測るため）→ 以後は張り付かれたら斬って剥がす
				if (e.attached) { if (e.stolenRupees >= 6) g.swordAttack(); dodge = null; }
				else if (e.slamAt != null && Math.hypot(dx, dy) < 2.2) {
					if (!dodge || !free(p.y + D[dodge][0] * 0.5, p.x + D[dodge][1] * 0.5)) {
						let bs = -1; dodge = null;
						for (const k of keys) {
							const [dr, dc] = D[k];
							if (!free(p.y + dr * 0.5, p.x + dc * 0.5)) continue;
							const far = [1, 1.5, 2].every((s) => free(p.y + dr * s, p.x + dc * s));
							const sc = (far ? 10 : 0) + Math.hypot(p.y + dr - e.y, p.x + dc - e.x);
							if (sc > bs) { bs = sc; dodge = k; }
						}
					}
					move = dodge;
				} else {
					dodge = null;
					const near = (Math.abs(dx) < 0.6 && Math.abs(dy) <= 1.0) || (Math.abs(dy) < 0.6 && Math.abs(dx) <= 1.0);
					if (near) {
						g.setHeroDir(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
						g.swordAttack();
					} else {
						// 盤面の上の最短路で σ の隣へ寄る（半マスずれていたら先に揃える）
						const sr = Math.round(p.y), sc = Math.round(p.x), tr = Math.round(e.y), tc = Math.round(e.x);
						const prev = new Map([[`${sr},${sc}`, null]]); const q = [[sr, sc]];
						let next = null;
						while (q.length && !next) {
							const [r, c] = q.shift();
							if (Math.abs(r - tr) + Math.abs(c - tc) <= 1) {
								let k = `${r},${c}`, pk;
								while ((pk = prev.get(k)) && pk !== `${sr},${sc}`) k = pk;
								next = k.split(',').map(Number);
								break;
							}
							for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
								const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
								if (prev.has(k) || !T[nr] || T[nr][nc] === undefined || T[nr][nc] === '#') continue;
								prev.set(k, `${r},${c}`); q.push([nr, nc]);
							}
						}
						if (next && (next[0] !== sr || next[1] !== sc)) {
							if (next[0] !== sr && Math.abs(p.x - sc) > 0.01) move = p.x < sc ? 'right' : 'left';
							else if (next[1] !== sc && Math.abs(p.y - sr) > 0.01) move = p.y < sr ? 'down' : 'up';
							else move = next[0] < sr ? 'up' : next[0] > sr ? 'down' : next[1] < sc ? 'left' : 'right';
						} else {
							move = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
						}
					}
				}
				hold(move);
				g.step(1);
				if (g.getState().player.hp <= 0) return { died: i };
			}
			hold(null);
			return { alive: true };
		}, TB);
		expect(fight.died, '予告を避けて斬り合って倒れた').toBeUndefined();
		expect(fight.killedAt, '600 tick で倒せない').toBeDefined();
		expect(fight.hp).toBeGreaterThan(0);
		expect(fight.stolen, '一度も吸われていない＝払い戻しの確認が空虚').toBeGreaterThan(0);
		// 期待値は設計の「半分」を直書きする（LEECH.refund から計算すると、refund を壊したとき期待値も一緒に動いて空虚になる）
		expect(fight.rAfter - fight.rBefore, '倒しても吸われた分の半分が戻らない').toBe(Math.floor(fight.stolen / 2));
		// 宝を拾う：金庫の中のルピーへ順に歩く（σ は居ない）。
		const got = await page.evaluate(([T, targets]) => {
			const g = window.__game;
			const keys = ['up', 'down', 'left', 'right'];
			const hold = (k) => { for (const o of keys) if (o !== k) g.releaseInput(o); if (k) g.queueInput(k); };
			const path = (sr, sc, tr, tc) => {
				const prev = new Map([[`${sr},${sc}`, null]]); const q = [[sr, sc]];
				while (q.length) {
					const [r, c] = q.shift();
					if (r === tr && c === tc) { const out = []; let k = `${r},${c}`; while (k) { out.unshift(k.split(',').map(Number)); k = prev.get(k); } return out; }
					for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
						const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
						if (prev.has(k) || !T[nr] || T[nr][nc] === undefined || T[nr][nc] === '#') continue;
						prev.set(k, `${r},${c}`); q.push([nr, nc]);
					}
				}
				return null;
			};
			// まず整数セルへ揃える
			for (let i = 0; i < 4; i++) {
				const p = g.getPlayer();
				const fy = Math.round(p.y) - p.y, fx = Math.round(p.x) - p.x;
				if (Math.abs(fy) < 0.01 && Math.abs(fx) < 0.01) break;
				hold(Math.abs(fx) > 0.01 ? (fx > 0 ? 'right' : 'left') : (fy > 0 ? 'down' : 'up'));
				g.step(1);
			}
			for (const [tr, tc] of targets) {
				const p = g.getPlayer();
				const steps = path(Math.round(p.y), Math.round(p.x), tr, tc);
				if (!steps) return { stuck: [tr, tc] };
				for (const [r, c] of steps.slice(1)) {
					for (let i = 0; i < 6; i++) {
						const q = g.getPlayer();
						if (Math.abs(q.y - r) < 0.01 && Math.abs(q.x - c) < 0.01) break;
						hold(Math.abs(q.x - c) > 0.01 ? (c > q.x ? 'right' : 'left') : (r > q.y ? 'down' : 'up'));
						g.step(1);
					}
				}
			}
			hold(null);
			return { rupees: g.getState().player.rupees, picked: g.getStageState().pickedKeys };
		}, [TB, Object.keys(VAULT_RUPEES).map(P)]);
		expect(got.stuck, '金庫のルピーへ歩けない').toBeUndefined();
		for (const k of Object.keys(VAULT_RUPEES)) expect(got.picked, `金庫の ${k} のルピーを拾えていない`).toContain(k);
		// 戦いの最中に拾った分もあるので最後の所持額で照合する：最初 30 − 吸われた分 ＋ 戻った半分 ＋ 金庫の 13。
		// ⚠️ 雑魚は倒すと 35% で落とし物（ルピーを含む）を出す（combat.js killEnemy）∴「以上」で見る。
		expect(got.rupees, '金庫の宝を全部拾えない（または払い戻しが合わない）')
			.toBeGreaterThanOrEqual(RUPEES0 - fight.stolen + Math.floor(fight.stolen / 2) + VAULT_TOTAL);
		expect(errors).toEqual([]);
	});
});
