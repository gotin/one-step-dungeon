// tests/d8-eater-mire.spec.js
// dungeon_8 `4,3`「ルピー喰いの底なし沼」と、張り付いたルピー喰いが水の上で剥がれると沈む規則の番人
// （2026-10-31 / PLAN 実行キュー 93 の7室目・盤面は `scripts/migrate-d8-4-3-eater-mire.mjs`・
//   エンジンは game/enemy-ai.js detachLeech → bodyAllLiquid → startSink〈4,1 の沈みを流用〉）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   3つの口の通り道の真ん中に宝箱 B(4,5)＝ルピー×30 が置いてあるだけ・敵なし。
//
// 新しい盤面（'~'＝bgTiles の水）:
//      2 #......~~~~#   ← 堀（幅1）
//      3 #......~...#   ← 小島（行3〜6×列8〜10・泥）
//      4 .......~σ..#   ← ルピー喰い σ(4,8)
//      5 .......~..B#   ← 宝箱 B(5,10)＝ルピー×50（キュー100 で増額）
//      6 #......~.σ.#   ← ルピー喰い σ(6,9)
//      7 #......~~~~#
//
// 守るものは3つ。
//   ① データ：盤面・堀と泥・宝箱・σ は小島から出られない・岸は小島と隣り合わない・宣言・層の接続。
//   ② 部屋（実機）：堀の上で張り付かれて叩くと σ が沈んで倒れる（隠れ・撃破に数え・入り直しても戻らない）
//      ／岸に立っていれば張り付かれない／通しで2体とも沈めて宝箱 +30。
//   ③ 規則（実機の対照）：小島の上で叩いても沈まない／半歩で岸に掛かっていると沈まない
//      ／吸うルピーが無くて自分から剥がれたときも水の上なら沈む。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TICK_MS } from '../game/constants.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-0-2-leech-paddy.mjs';
import {
	LAYER, ROOM, TARGET, EATERS, CHEST, CHEST_CONTENT, ISLAND, MOAT, OPENING, MUD,
} from '../scripts/migrate-d8-4-3-eater-mire.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const parse = (k) => k.split(',').map(Number);
// 配っているマップで測る＝TARGET で測るとマップを壊しても緑のまま。水は bgTiles∴'~' として重ねる
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D8 ルピー喰いの底なし沼 ① データ', () => {
	test('盤面・堀と泥・宝箱（ルピー×50）', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(grid.flat().filter((ch) => ch === TILE.CHEST).length, '宝箱が1つでない').toBe(1);
		expect(room.chestContents, '宝箱の中身が違う').toEqual({ [CHEST]: CHEST_CONTENT });
		expect(MOAT.every((k) => room.bgTiles?.[k] === TILE.WATER), '堀が水でない').toBe(true);
		expect(MUD.every((k) => room.bgTiles?.[k] === TILE.MUD), '小島が泥でない').toBe(true);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(room.showConditions ?? {}, '出現条件が付いた').toEqual({});
		expect(room.fluteEffect, '笛の効き目が付いた').toBeUndefined();
	});

	test('通り道は塞がない・小島へははしごだけ・σ は小島から出られない・岸は小島と隣り合わない', () => {
		const opens = Object.values(OPENING);
		const walk = reach(grid, [OPENING.west]);
		expect(opens.filter((k) => !walk.has(k)), '3つの口が歩いてつながっていない').toEqual([]);
		const lad = reach(grid, opens, { withLadder: true });
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (!HARD_BLOCKED.has(ch) && ch !== TILE.WATER && !lad.has(`${r},${c}`)) stranded.push(`${r},${c}`); }));
		expect(stranded, '取り残された床がある').toEqual([]);
		const islandFloor = ISLAND.filter((k) => k !== CHEST);
		expect(islandFloor.filter((k) => walk.has(k)), '小島へ歩いて入れる＝堀が切れている').toEqual([]);
		expect(islandFloor.filter((k) => !lad.has(k)), '小島へはしごでも入れない').toEqual([]);
		const eaterWalk = reach(grid, EATERS);
		expect([...eaterWalk.keys()].filter((k) => !ISLAND.includes(k)), 'σ が小島から歩いて出られる').toEqual([]);
		const near = [];
		grid.forEach((row, r) => row.forEach((ch, c) => {
			const k = `${r},${c}`;
			if (HARD_BLOCKED.has(ch) || ch === TILE.WATER || ISLAND.includes(k)) return;
			if (ISLAND.some((i) => { const [ir, ic] = parse(i); return Math.abs(ir - r) + Math.abs(ic - c) <= 1; })) near.push(k);
		}));
		expect(near, '岸の床が小島と隣り合う＝岸に立っても張り付かれる').toEqual([]);
	});

	test('敵は σ×2・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual(EATERS.map((k) => `${TILE.RUPEE_EATER}@${k}`));
		expect(stageThreat(room, ENEMY_META)).toBeLessThan(stageThreat(stages['2,1'], ENEMY_META));
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			'配置表の外に置く敵＝EXTRA_ENEMY_ROOMS の宣言が無い').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: true, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ②③ 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(row, col, rupees) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_ladder: '1', ps_rupees: String(rupees),
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も通れてしまう）
async function boot(page, row, col, { rupees = 50 } = {}) {
	const errors = [];
	page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
	await page.goto(previewUrl(row, col, rupees));
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 2);
	await page.keyboard.press('g');
	await page.evaluate(() => { const g = window.__game; g.pause(); g.step(2); });
	return errors;
}
// 張り付かれるまで待つ（上限 n tick）。張り付いた σ の id を返す（来なければ null）。
const WAIT_ATTACH = `(g, n) => {
	for (let i = 0; i < n; i++) { const a = g.getEnemies().find((e) => e.attached); if (a) return a.id; g.step(1); }
	return g.getEnemies().find((e) => e.attached)?.id ?? null;
}`;
// 沈み切るまでの上限＝1 秒（ENEMY_SINK_MS 600 の想定）。⚠️ ENEMY_SINK_MS から計算しない
// ＝定数を壊しても待ち時間が追従して緑のままになる（4,1 の歯の確認で踏んだ）。
const SINK_TICKS = Math.ceil(1000 / TICK_MS);

test.describe('D8 ルピー喰いの底なし沼 ② 部屋', () => {
	test('堀の上で張り付かれて叩くと、σ は水へ落ちて沈み、倒れる（撃破に数え・入り直しても戻らない）', async ({ page }) => {
		const errors = await boot(page, 4, 6);
		const r = await page.evaluate(([waitAttach, sinkTicks]) => {
			const g = window.__game;
			g.movePlayer('right'); g.step(1); g.movePlayer('right'); g.step(1);   // (4,7)＝堀の上
			const p0 = g.getState().player;
			const id = eval(waitAttach)(g, 80);
			const kills0 = g.getPlayer().kills ?? 0;
			g.swordAttack(); g.step(1);
			const e = g.getEnemies().find((x) => x.id === id);
			const sinking = { sink: e?.sinkUntil ?? null, hidden: e?.hidden, at: e ? `${e.y},${e.x}` : null, hp: e?.hp };
			if (e) g.dealDamage?.(e.id, 99);   // 沈んでいる間は攻撃が通らない（隠れ）
			const hpAfter = g.getEnemies().find((x) => x.id === id)?.hp;
			g.step(sinkTicks);
			const gone = !g.getEnemies().some((x) => x.id === id);
			const kills = (g.getPlayer().kills ?? 0) - kills0;
			const defeated = g.getDefeatedEnemies('dungeon_8', '4,3');
			g.enterStage('dungeon_8', '4,3', 4, 6); g.step(2);
			const back = g.getEnemies().map((x) => x.id);
			return { stand: `${p0.y},${p0.x}`, id, sinking, hpAfter, gone, kills, defeated, back };
		}, [WAIT_ATTACH, SINK_TICKS]);
		expect(r.stand, '前提：堀の上 (4,7) に立てない（はしご）').toBe('4,7');
		expect(r.id, '堀の上に立っても σ が張り付かない').toBe(EATERS[0]);
		expect(r.sinking.sink, '堀の上で叩いても σ が沈み始めない').not.toBeNull();
		expect(r.sinking.hidden, '沈んでいる σ が隠れになっていない＝攻撃が通る').toBe(true);
		expect(r.sinking.at, '沈み始めた σ が堀の上に居ない').toBe('4,7');
		expect(r.sinking.hp, '前提：1振りで倒れた（沈むのを見ていない）').toBeGreaterThan(0);
		expect(r.hpAfter, '沈んでいる σ に攻撃が通った').toBe(r.sinking.hp);
		expect(r.gone, `沈み始めて ${SINK_TICKS} tick 経っても σ が残っている`).toBe(true);
		expect(r.kills, '沈んだ σ が撃破に数えられていない').toBe(1);
		expect(r.defeated, '沈んだ σ が倒した敵の記録に無い＝入り直すと戻る').toContain(EATERS[0]);
		expect(r.back, '入り直したら沈んだ σ が戻った').toEqual([EATERS[1]]);
		expect(errors).toEqual([]);
	});

	test('岸に立っていれば張り付かれない（σ は堀の縁で止まる）', async ({ page }) => {
		for (const [row, col] of [[4, 6], [1, 9], [8, 9]]) {
			const errors = await boot(page, row, col);
			const r = await page.evaluate(() => {
				const g = window.__game;
				const r0 = g.getState().player.rupees;
				let att = false;
				for (let i = 0; i < 200; i++) { g.step(1); if (g.getEnemies().some((e) => e.attached)) att = true; }
				return { att, drained: r0 - g.getState().player.rupees, out: g.getEnemies().filter((e) => e.x < 7.5 || e.y < 2.5 || e.y > 6.5).length };
			});
			expect(r.att, `岸 (${row},${col}) で張り付かれた`).toBe(false);
			expect(r.drained, `岸 (${row},${col}) で吸われた`).toBe(0);
			expect(r.out, `岸 (${row},${col}) に立つと σ が小島から出た`).toBe(0);
			expect(errors).toEqual([]);
		}
	});

	test('通し：西の堀の上で2体とも沈め、小島へ渡って宝箱 +30', async ({ page }) => {
		const errors = await boot(page, 4, 6);
		const r = await page.evaluate(([waitAttach, sinkTicks, chest]) => {
			const g = window.__game;
			// 横を先に歩く＝堀の上（はしご）は渡る向き（横）にしか進めない∴縦を先にすると堀の上で止まる
			const walk = (rr, cc) => { for (let i = 0; i < 60; i++) { const p = g.getState().player; if (Math.abs(p.y - rr) < 0.01 && Math.abs(p.x - cc) < 0.01) return true;
				g.movePlayer(Math.abs(p.x - cc) > 0.01 ? (p.x < cc ? 'right' : 'left') : (p.y < rr ? 'down' : 'up')); g.step(1); } return false; };
			g.movePlayer('right'); g.step(1); g.movePlayer('right'); g.step(1);   // (4,7)＝堀の上
			let sunk = 0;
			for (let k = 0; k < 2; k++) {
				const id = eval(waitAttach)(g, 300);
				if (!id) break;
				g.swordAttack(); g.step(1);
				if (g.getEnemies().find((x) => x.id === id)?.sinkUntil != null) sunk++;
				g.step(sinkTicks);
			}
			const left = g.getEnemies().length;
			const rupees0 = g.getState().player.rupees;
			const [cr, cc] = chest.split(',').map(Number);
			const go = walk(cr, cc - 1);
			for (let i = 0; i < 3; i++) { g.movePlayer('right'); g.step(1); }
			const opened = g.getStageState().openedChests.includes(chest);
			return { sunk, left, go, opened, gained: g.getState().player.rupees - rupees0 };
		}, [WAIT_ATTACH, SINK_TICKS, CHEST]);
		expect(r.sunk, '堀の上で2体とも沈められない').toBe(2);
		expect(r.left, 'σ が残っている').toBe(0);
		expect(r.go, '小島の宝箱の手前まで行けない').toBe(true);
		expect(r.opened, '宝箱が開かない').toBe(true);
		expect(r.gained, '宝箱でルピー×50 が増えていない').toBe(50);
		expect(errors).toEqual([]);
	});
});

test.describe('D8 ルピー喰いの底なし沼 ③ 沈むのは「体の下が全部水」のときだけ（対照）', () => {
	test('小島の上で張り付かれて叩いても、σ は剥がれるだけで沈まない', async ({ page }) => {
		const errors = await boot(page, 3, 9);
		const r = await page.evaluate(([waitAttach]) => {
			const g = window.__game;
			const id = eval(waitAttach)(g, 80);
			g.swordAttack(); g.step(1);
			const e = g.getEnemies().find((x) => x.id === id);
			return { id, attached: e?.attached, sink: e?.sinkUntil ?? null, hp: e?.hp, alive: !!e };
		}, [WAIT_ATTACH]);
		expect(r.id, '前提：小島の上で張り付かれない').not.toBeNull();
		expect(r.alive, '小島の上で1振りで σ が消えた').toBe(true);
		expect(r.attached, '叩いても剥がれない').toBe(false);
		expect(r.sink, '小島（陸）の上で剥がした σ が沈み始めた').toBeNull();
		expect(errors).toEqual([]);
	});

	test('小島から半歩下がり、小島と堀に半分ずつ掛かったまま叩いても沈まない', async ({ page }) => {
		const errors = await boot(page, 3, 8);
		const r = await page.evaluate(([waitAttach]) => {
			const g = window.__game;
			const id = eval(waitAttach)(g, 80);
			g.movePlayer('left'); g.step(1);   // (3,7.5)＝小島と堀に半分ずつ
			const half = g.getState().player.x;
			const carried = g.getEnemies().find((x) => x.id === id)?.attached;
			g.swordAttack(); g.step(1);
			const e1 = g.getEnemies().find((x) => x.id === id);
			const halfRes = { sink: e1?.sinkUntil ?? null, attached: e1?.attached };
			return { id, half, carried, halfRes };
		}, [WAIT_ATTACH]);
		expect(r.id, '前提：小島の縁で張り付かれない').not.toBeNull();
		expect(r.half, '前提：半歩の位置に立てない').toBe(7.5);
		expect(r.carried, '前提：半歩下がったら張り付きが外れた').toBe(true);
		expect(r.halfRes.attached, '叩いても剥がれない').toBe(false);
		expect(r.halfRes.sink, '半分岸に掛かったまま剥がした σ が沈み始めた').toBeNull();
		expect(errors).toEqual([]);
	});

	test('吸うルピーが無くて自分から剥がれたときも、堀の上なら沈む', async ({ page }) => {
		const errors = await boot(page, 4, 6, { rupees: 0 });
		const r = await page.evaluate(([waitAttach]) => {
			const g = window.__game;
			g.movePlayer('right'); g.step(1); g.movePlayer('right'); g.step(1);   // (4,7)＝堀の上
			let sinkId = null;
			for (let i = 0; i < 120 && !sinkId; i++) { g.step(1); sinkId = g.getEnemies().find((e) => e.sinkUntil != null)?.id ?? null; }
			const e = g.getEnemies().find((x) => x.id === sinkId);
			return { sinkId, hp: e?.hp, max: e?.maxHp };
		}, [WAIT_ATTACH]);
		expect(r.sinkId, '吸うルピーが無く剥がれた σ が堀の上で沈まない').toBe(EATERS[0]);
		expect(r.hp, '叩いていないのに減っている＝剣で剥がした').toBe(ENEMY_META[TILE.RUPEE_EATER].hp);
		expect(errors).toEqual([]);
	});
});
