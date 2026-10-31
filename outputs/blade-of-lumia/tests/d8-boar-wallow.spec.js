// tests/d8-boar-wallow.spec.js
// dungeon_8 `4,1`「猪の泥浴び場」と、突進して水・溶岩へ突っ込んだ雑魚が沈む機構の番人
// （2026-10-31 / PLAN 実行キュー 93 の6室目・盤面は `scripts/migrate-d8-4-1-boar-wallow.mjs`・
//   エンジンは game/enemy-ai.js tickDash の plunge〈dashPlungesAt／startSink〉と enemyTick の沈み切り）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   素の広間の床に回復薬 7(4,5) が落ちているだけ・敵なし。
//
// 新しい盤面（'~'＝bgTiles の水）:
//      1 #......#7..#   ← 回復薬 7(1,8)＝猪の寝床の隅（どの直線からも狙えない）
//      2 #........ω.#   ← 突進猪 ω(2,9)＝持ち場（enemyHold）・寝床の口は (2,7) だけ
//      3 #......##..#
//      4 .......#~~~#   ← 泥沼（幅2）
//      5 .......#~~~#
//      6 #..........#   ← 南岸 (6,9)＝猪の列に立つと猪が泥沼へ突っ込んで沈む
//
// 守るものは3つ。
//   ① データ：盤面・回復薬・泥と水・持ち場・脅威度・宣言・寝床へは口だけ・猪の2本の列の先・層の接続。
//   ② 部屋（実機）：南岸に立つと猪が泥沼へ突っ込んで沈み、無傷で倒れる（沈む間は剣が通らない・撃破に数え・入り直しても戻らない）
//      →寝床の回復薬を拾える／行2 で突進を避けると西の壁で気絶して倒れない（持ち場を離れたまま戻らない）。
//   ③ 規則（実機の対照）：沈むのは液体だけ＝泥沼を空にすると縁で気絶／溶岩にすると沈む／ボスは沈まない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { holdsPost } from '../shared/enemy-alert.js';
import { TICK_MS } from '../game/constants.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { reach } from '../scripts/migrate-d8-0-2-leech-paddy.mjs';
import {
	LAYER, ROOM, TARGET, BOAR, POTION, DOORWAY, PEN, WALLOW, SHORE, WEST_LANE, OPENING, MUD, firstObstacle,
} from '../scripts/migrate-d8-4-1-boar-wallow.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
const parse = (k) => k.split(',').map(Number);
// 配っているマップで測る＝TARGET で測るとマップを壊しても緑のまま。水は bgTiles∴'~' として重ねる
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D8 猪の泥浴び場 ① データ', () => {
	test('盤面・回復薬・泥と水・持ち場', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		const flat = grid.flat();
		expect(flat.filter((ch) => ch === TILE.ITEM_HEAL_POTION).length, '回復薬が1つでない').toBe(1);
		expect(grid[parse(POTION)[0]][parse(POTION)[1]], '回復薬が寝床の隅に無い').toBe(TILE.ITEM_HEAL_POTION);
		expect(WALLOW.every((k) => room.bgTiles?.[k] === TILE.WATER), '泥沼が水でない').toBe(true);
		expect(MUD.every((k) => room.bgTiles?.[k] === TILE.MUD), '寝床と南岸が泥でない').toBe(true);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(holdsPost(room, BOAR, TILE.CHARGE_BOAR), '猪が持ち場を動かない、でない＝寝床から出て歩き回る').toBe(true);
		expect(room.showConditions ?? {}, '出現条件が付いた').toEqual({});
		expect(room.fluteEffect, '笛の効き目が付いた').toBeUndefined();
	});

	test('寝床へは口だけ・泥沼ははしごで渡れない・猪の2本の列の先・回復薬は直線で狙えない・通り道は塞がない', () => {
		const opens = Object.values(OPENING);
		expect(reach(grid, [OPENING.west]).has(OPENING.south), '西の口から南の口へ歩けない').toBe(true);
		const shut = grid.map((r) => [...r]);
		{ const [r, c] = parse(DOORWAY); shut[r][c] = TILE.WALL; }
		const sealed = reach(shut, opens, { withLadder: true });
		expect(PEN.filter((k) => sealed.has(k)), '口を塞いでも寝床へ入れる＝泥沼をはしごで渡れる').toEqual([]);
		const lad = reach(grid, opens, { withLadder: true });
		const stranded = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (!HARD_BLOCKED.has(ch) && ch !== TILE.WATER && !lad.has(`${r},${c}`)) stranded.push(`${r},${c}`); }));
		expect(stranded, '取り残された床がある').toEqual([]);
		const south = firstObstacle(grid, BOAR, [1, 0]);
		expect(WALLOW.includes(south.at) && south.ch === TILE.WATER, `猪の南の先が泥沼でない（${south.at} '${south.ch}'）`).toBe(true);
		expect(firstObstacle(grid, BOAR, [0, -1]).at, '猪の西の先が西の壁でない').toBe('2,0');
		const [br, bc] = parse(BOAR);
		expect(SHORE.every((k) => parse(k)[1] === bc), '南岸の立ち位置が猪の列でない').toBe(true);
		expect(WEST_LANE.every((k) => parse(k)[0] === br), '行2 の立ち位置が猪の行でない').toBe(true);
		// 回復薬へ通る直線（壁で切れるまで・水は投擲物が越える）に寝床の外の床が無い
		const outside = [];
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			let [r, c] = parse(POTION);
			for (;;) {
				r += dr; c += dc;
				const ch = grid[r]?.[c];
				if (ch === undefined || (HARD_BLOCKED.has(ch) && ch !== TILE.WATER)) break;
				if (ch !== TILE.WATER && !PEN.includes(`${r},${c}`)) outside.push(`${r},${c}`);
			}
		}
		expect(outside, '寝床の外から回復薬へ直線が通る＝ブーメランで持ち帰れる').toEqual([]);
	});

	test('敵は猪×1・脅威度は看板部屋より軽い・宣言あり・層の接続は不変', () => {
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs).toEqual([`${TILE.CHARGE_BOAR}@${BOAR}`]);
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
function previewUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_weapon: '1', ps_hearts: '10', ps_ladder: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も通れてしまう）
async function boot(page, row, col, { patch, meta } = {}) {
	if (patch) {
		// 対照：部屋のデータだけを書き換えたマップを配る（ディスクのマップの複製＝route.fetch はしない）
		await page.route('**/work/blade-of-lumia.json', async (route) => {
			const json = structuredClone(map);
			patch(json.layers[LAYER].stages[ROOM]);
			await route.fulfill({ json });
		});
	}
	await page.goto(previewUrl(row, col));
	await waitForBoard(page);
	await page.waitForFunction(() => window.__game.getEnemies().length === 1);
	await page.keyboard.press('g');
	await page.evaluate((m) => {
		const g = window.__game;
		g.pause();
		if (m) g.setEnemyMetaForTest(m.type, m.patch);
		g.step(2);
	}, meta ?? null);
}
// 泥沼のセルを別の地形にする（水を bgTiles から外し、tiles に置く）
const wallowAs = (ch) => (sd) => {
	for (const k of WALLOW) {
		delete sd.bgTiles[k];
		const [r, c] = parse(k);
		sd.tiles[r][c] = ch;
	}
};
// 南岸の (6,8) から右へ半マス×2＝(6,9)（猪の列）に立ち、突進が決着するまで回す。
// 戻り値＝決着の種類（'sink'＝沈み始めた／'stun'＝気絶した）と、その時点の状態。
const AT_SHORE = `(g) => {
	g.movePlayer('right'); g.movePlayer('right');
	const hp0 = g.getState().player.hp;
	for (let i = 0; i < 20; i++) {
		g.step(1);
		const e = g.getEnemies()[0];
		if (!e) return { kind: 'gone', i };
		if (e.sinkUntil != null) return { kind: 'sink', i, at: e.y + ',' + e.x, hidden: e.hidden, hurt: hp0 - g.getState().player.hp };
		if (e.stunUntil > g.getState().gameTime) return { kind: 'stun', i, at: e.y + ',' + e.x, hurt: hp0 - g.getState().player.hp };
	}
	return { kind: 'none' };
}`;
// 沈み切るまでの上限＝1 秒（ENEMY_SINK_MS 600 の想定）。⚠️ ENEMY_SINK_MS から計算しない
// ＝定数を壊しても待ち時間が追従して緑のままになる（歯の確認で踏んだ）。
const SINK_TICKS = Math.ceil(1000 / TICK_MS);

test.describe('D8 猪の泥浴び場 ② 部屋', () => {
	test('南岸で猪の列に立つと猪が泥沼へ突っ込んで沈み、無傷で倒れる＝寝床の回復薬を拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
		await boot(page, 6, 8);
		const r = await page.evaluate(([atShore, sinkTicks, boar]) => {
			const g = window.__game;
			const kills0 = g.getPlayer().kills ?? 0;
			const res = eval(atShore)(g);
			// 沈んでいる間は剣が通らない（隠れ）＝寝床の外から斬り足して手柄を横取りできない
			const e = g.getEnemies()[0];
			const hpBefore = e?.hp;
			if (e) g.dealDamage?.(e.id, 99);
			const hpAfter = g.getEnemies()[0]?.hp;
			g.step(sinkTicks);
			const left = g.getEnemies().length;
			const kills = (g.getPlayer().kills ?? 0) - kills0;
			const defeated = g.getDefeatedEnemies('dungeon_8', '4,1');
			// 入り直しても戻らない（撃破に数えた）
			g.enterStage('dungeon_8', '4,1', 6, 8); g.step(2);
			const back = g.getEnemies().length;
			return { res, hpBefore, hpAfter, left, kills, defeated, back, hp: g.getState().player.hp };
		}, [AT_SHORE, SINK_TICKS, BOAR]);
		expect(r.res.kind, '南岸で猪の列に立っても猪が泥沼に沈まない').toBe('sink');
		expect(r.res.hidden, '沈んでいる猪が隠れになっていない＝攻撃が通る').toBe(true);
		expect(r.res.hurt, '猪が沈むまでに傷を受けた').toBe(0);
		expect(r.res.at, '沈み始めた猪の体が岸に残っていない（落とし物が水の上に出る）').toBe('3,9');
		expect(r.hpAfter, '沈んでいる猪に剣（ダメージ）が通った').toBe(r.hpBefore);
		expect(r.left, `沈み始めて ${SINK_TICKS} tick 経っても猪が残っている`).toBe(0);
		expect(r.kills, '沈んだ猪が撃破に数えられていない').toBe(1);
		expect(r.defeated, '沈んだ猪が倒した敵の記録に無い＝入り直すと戻る').toContain(BOAR);
		expect(r.back, '入り直したら沈んだ猪が戻った').toBe(0);
		expect(errors).toEqual([]);
	});

	test('猪が沈んだ後、口から寝床へ入って回復薬を拾える', async ({ page }) => {
		await boot(page, 6, 8);
		const r = await page.evaluate(([atShore, sinkTicks]) => {
			const g = window.__game;
			const res = eval(atShore)(g);
			g.step(sinkTicks);
			const walk = (rr, cc, h) => { for (let i = 0; i < 120; i++) { const p = g.getState().player;
				const dy = Math.abs(p.y - rr) > 0.01, dx = Math.abs(p.x - cc) > 0.01; if (!dy && !dx) return true;
				const vert = h ? !dx : dy; g.movePlayer(vert ? (p.y < rr ? 'down' : 'up') : (p.x < cc ? 'right' : 'left')); g.step(1); } return false; };
			const before = g.getPlayer().subItems?.healPotion?.count ?? 0;
			walk(6, 5, true); walk(2, 5); walk(2, 8, true); walk(1, 8);
			const p = g.getState().player;
			return { kind: res.kind, at: `${p.y},${p.x}`, got: (g.getPlayer().subItems?.healPotion?.count ?? 0) - before };
		}, [AT_SHORE, SINK_TICKS]);
		expect(r.kind, '前提：猪が沈まない').toBe('sink');
		expect(r.at, '口から寝床の隅まで歩けない').toBe(POTION);
		expect(r.got, '寝床の隅の回復薬を拾えていない').toBe(1);
	});

	test('行2 で突進を避けると猪は西の壁で気絶し、沈まない（持ち場を離れたまま戻らない）', async ({ page }) => {
		await boot(page, 3, 3);
		const r = await page.evaluate(() => {
			const g = window.__game;
			// 行2 へ上がる（猪の行）→ 溜めが始まったら行3 へ下りて避ける
			g.movePlayer('up'); g.movePlayer('up');
			let windup = -1;
			for (let i = 0; i < 6; i++) { g.step(1); if (g.getEnemies()[0]?.dashPhase === 'windup') { windup = i; break; } }
			g.movePlayer('down'); g.movePlayer('down');
			const hp0 = g.getState().player.hp;
			let stun = null;
			for (let i = 0; i < 20; i++) {
				g.step(1);
				const e = g.getEnemies()[0];
				if (e && e.stunUntil > g.getState().gameTime) { stun = { at: `${e.y},${e.x}`, sink: e.sinkUntil ?? null }; break; }
			}
			g.step(30);   // 気絶＋硬直が明けても寝床へ歩いて戻らない（持ち場）
			const e = g.getEnemies()[0];
			return { windup, stun, hurt: hp0 - g.getState().player.hp, alive: !!e, after: e ? `${e.y},${e.x}` : null };
		});
		expect(r.windup, '前提：行2 に立っても猪が溜めない').toBeGreaterThanOrEqual(0);
		expect(r.stun, '避けた突進で猪が気絶しない').not.toBeNull();
		expect(r.stun.at, '猪が西の壁の手前で気絶していない').toBe('2,1');
		expect(r.stun.sink, '壁に当たった猪が沈み始めた').toBeNull();
		expect(r.hurt, '避けたのに轢かれた').toBe(0);
		expect(r.alive, '壁に当たった猪が倒れた').toBe(true);
		expect(r.after, '気絶が明けた猪が寝床へ歩いて戻った（持ち場が効いていない）').toBe('2,1');
	});
});

test.describe('D8 猪の泥浴び場 ③ 沈むのは液体だけ（対照）', () => {
	test('泥沼を空（虚空）にすると、猪は縁で気絶して沈まない', async ({ page }) => {
		await boot(page, 6, 8, { patch: wallowAs(TILE.SKY) });
		const r = await page.evaluate(([atShore]) => eval(atShore)(window.__game), [AT_SHORE]);
		expect(r.kind, '空の縁で猪が気絶しない（沈んだ／何も起きない）').toBe('stun');
		expect(r.at).toBe('3,9');
	});

	test('泥沼を溶岩にすると、猪は沈む（溶岩は水と同じ挙動）', async ({ page }) => {
		await boot(page, 6, 8, { patch: wallowAs(TILE.LAVA) });
		const r = await page.evaluate(([atShore]) => eval(atShore)(window.__game), [AT_SHORE]);
		expect(r.kind, '溶岩へ突っ込んだ猪が沈まない').toBe('sink');
	});

	test('ボスは沈まない（同じ突進でも縁で気絶する）', async ({ page }) => {
		await boot(page, 6, 8, { meta: { type: TILE.CHARGE_BOAR, patch: { isBoss: true } } });
		const r = await page.evaluate(([atShore]) => eval(atShore)(window.__game), [AT_SHORE]);
		expect(r.kind, 'ボス扱いの猪が水へ突っ込んで沈んだ').toBe('stun');
	});
});
