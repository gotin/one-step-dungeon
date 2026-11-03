// tests/d3-causeway-sorcerer.spec.js
// dungeon_3 `4,2`「堤の術士」の番人
// （2026-11-03 / PLAN 実行キュー 94 の3室目・盤面は `scripts/migrate-d3-4-2-causeway-sorcerer.mjs`・エンジンの変更なし）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   四角い広間に床の回復薬（小）が1つあるだけ・敵なし・水なし。
//
// 新しい盤面（'~'＝bgTiles の水）:
//      1 #~~~~...η.~#   ← 北の堤・術士 η(1,8)／北の口
//      3 #~~~~~~~~E~#   ← 東の堤・パトロール E(3,9)＝いつも追う
//      4 ...~~~~~~.~#   ← 西の口の船着き
//      5 ..........~#   ← 南の堤
//      6 #~~~.~~~~~~#   ← 薬の突堤 (6,4)〜(8,4)
//      8 #~~~7~~~~~~#   ← 回復薬（小）(8,4)
//
// 守るものは2つ。
//   ① データ：盤面・水・回復薬・敵（η×1・E×1・E はいつも追う）・宣言・堤は幅1・
//      術士の出現先はいつも勇者と同じ一本道の上（水越しの腕に出ない）・突堤の根元側には出現先が無い・層の接続。
//   ② 部屋（実機）：術士は堤の上の、勇者と同じ行か列の3マス先に出る（出られない所では動かない）
//      ／剣も弓も使わずに歩くと、前の E に塞がれ、後ろの術士に撃たれ続ける（実測 150 tick でハート8）
//      ／E を斬り、出た術士を射て進めば、薬を拾って北の口までハート2つ以内（実測 半ハート2〜3回）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	LAYER, ROOM, TARGET, SORCERER, PATROL, POTION, SPUR, OPENING,
} from '../scripts/migrate-d3-4-2-causeway-sorcerer.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers[LAYER].stages;
const room = stages[ROOM];
const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
// 配っているマップで測る＝TARGET で測るとマップを壊しても緑のまま。水は bgTiles∴'~' として重ねる
const grid = room.tiles.map((row, r) => [...rowStr(row)].map((ch, c) => (room.bgTiles?.[`${r},${c}`] === TILE.WATER ? TILE.WATER : ch)));
const ROWS = grid.length, COLS = grid[0].length;
// 術士の出現距離＝3。⚠️ ENEMY_META から引かない＝メタを壊すと物差しも追従して緑のまま。
const RANGE = 3;
const parse = (k) => k.split(',').map(Number);
const stand = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && grid[r][c] !== TILE.WATER
	&& (ENEMY_META[grid[r][c]] || !HARD_BLOCKED.has(grid[r][c]));
const floors = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (stand(r, c)) floors.push(`${r},${c}`);
const blinkOf = (r, c) => [[-1, 0], [0, 1], [1, 0], [0, -1]]
	.map(([dr, dc]) => ({ dr, dc, r: r + dr * RANGE, c: c + dc * RANGE }))
	.filter((d) => stand(d.r, d.c));
const between = (r, c, d) => { for (let i = 1; i < RANGE; i++) if (!stand(r + d.dr * i, c + d.dc * i)) return false; return true; };

// ── ① データ ─────────────────────────────────────────────────────────
test.describe('D3 堤の術士 ① データ', () => {
	test('盤面・水・回復薬（突堤の先）・敵（η×1・E×1・E はいつも追う）・宣言・脅威度', () => {
		expect(grid.map((r) => r.join('')), '盤面が移行スクリプトの TARGET と違う').toEqual(TARGET);
		expect(rowStr(room.tiles.flat()).includes(TILE.WATER), 'tiles 層に水がある（水は bgTiles だけ）').toBe(false);
		expect(grid[parse(POTION)[0]][parse(POTION)[1]], '突堤の先に回復薬が無い').toBe(TILE.ITEM_HEAL_POTION);
		expect(grid.flat().filter((ch) => ch === TILE.ITEM_HEAL_POTION).length, '回復薬が1つでない').toBe(1);
		const mobs = [];
		grid.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		expect(mobs.sort(), '敵が η×1・E×1 でない').toEqual([`${TILE.PATROL}@${PATROL}`, `${TILE.SORCERER}@${SORCERER}`].sort());
		expect(room.enemyChase, 'E がいつも追わない＝堤の上で前に立ちはだからない').toEqual({ [PATROL]: true });
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM), 'EXTRA_ENEMY_ROOMS に宣言が無い').toBe(true);
		const threat = stageThreat(room, ENEMY_META);
		expect(threat, '脅威度が 22.0 でない').toBe(22);
		expect(threat, '看板部屋 1,3 より重い').toBeLessThan(stageThreat(stages['1,3'], ENEMY_META));
		// 術士の初めの位置へ、西の口の船着きから縦横の射線が通らない（入った瞬間に射抜いて終わり、にしない）
		const [sr, sc] = parse(SORCERER);
		expect(['4,0', '4,1', '4,2', '5,0', '5,1', '5,2'].filter((k) => { const [r, c] = parse(k); return r === sr || c === sc; }),
			'西の口から術士の初めの位置が一直線').toEqual([]);
	});

	test('堤は幅1・術士の出現先はいつも同じ一本道の上・突堤の根元側には出現先が無い', () => {
		// 2×2 の床の塊なし＝幅1（船着きと北の口の前は除く）
		const landing = new Set(['4,0', '4,1', '4,2', '5,0', '5,1', '5,2', '0,5', '0,6', '1,5', '1,6']);
		const wide = floors.filter((k) => { const [r, c] = parse(k); return !landing.has(k) && stand(r + 1, c) && stand(r, c + 1) && stand(r + 1, c + 1); });
		expect(wide, '堤に幅2の所がある＝横へ避けられる').toEqual([]);
		const across = [];
		for (const k of floors) {
			const [r, c] = parse(k);
			for (const d of blinkOf(r, c)) if (!between(r, c, d)) across.push(`${k}→${d.r},${d.c}`);
		}
		expect(across, '水越しの腕に術士が出られる＝一本道の前後でない').toEqual([]);
		expect(SPUR.slice(0, 2).filter((k) => { const [r, c] = parse(k); return blinkOf(r, c).length; }),
			'突堤の根元側に出現先がある').toEqual([]);
		expect(['5,6', '1,8'].filter((k) => { const [r, c] = parse(k); return !blinkOf(r, c).length; }), '堤の上に出現先が無い').toEqual([]);
	});

	test('西の口から北の口・薬へ歩ける・層の接続は不変', () => {
		const seen = new Set([OPENING.west]);
		const q = [parse(OPENING.west)];
		while (q.length) {
			const [r, c] = q.shift();
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const k = `${r + dr},${c + dc}`;
				if (!seen.has(k) && stand(r + dr, c + dc)) { seen.add(k); q.push([r + dr, c + dc]); }
			}
		}
		expect(seen.has(OPENING.north), '西の口から北の口へ歩けない').toBe(true);
		expect(seen.has(POTION), '西の口から薬へ歩けない').toBe(true);
		const run = bfsLayer(stages, { stage: '1,3', row: 7, col: 2 }, { withLadder: false, openTiles: null });
		expect(run.reachedRooms.has(ROOM), `${ROOM} に入れない`).toBe(true);
		expect(run.reachedRooms.has('4,1'), '北の行き止まり 4,1 に入れない').toBe(true);
		expect(run.deadEdges, 'dead-edge がある').toEqual([]);
	});
});

// ── ② 実機（fromEditor=1 プレビュー）────────────────────────────────
const GAME = '/blade-of-lumia/game/';
function previewUrl(hearts) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: '5', col: '0',
		ps_weapon: '1', ps_hearts: String(hearts), ps_bow: '1',
	});
	return `${GAME}?${p.toString()}`;
}
// debug を切る（fromEditor の既定は「無敵・すり抜け」＝すり抜けたままだと水も歩ける）
async function boot(page, hearts = 10) {
	const errors = [];
	page.on('pageerror', (e) => { if (!/resume a context/.test(e.message)) errors.push(e.message); });
	await page.goto(previewUrl(hearts));
	await waitForBoard(page);
	await page.keyboard.press('g');
	await page.evaluate(() => {
		const g = window.__game; g.pause();
		g.getPlayer()._shownSubItemHint = true;   // 本編では弓（1,2）で既に出ている「初めてのサブアイテム」の窓＝開くと足が止まる
	});
	return errors;
}
// 歩きながら、術士が姿を現すたびに（勇者のマス・術士のマス）を記録する。
// mode＝'walk'（剣も弓も使わない）／'fight'（隣の E を斬り、同じ行か列に出た術士を射る）。
const RUN = `((g, route, mode, maxTicks) => {
	const P = () => g.getState().player;
	const sor = () => g.getEnemies().find((e) => e.type === 'η');
	const pat = () => g.getEnemies().find((e) => e.type === 'E');
	const face = (dy, dx) => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
	g.step(1);   // 1 tick 回して術士の拍を立ててから見る（初めの「姿がある」を出現に数えない）
	const appear = []; let phase = sor()?.blinkPhase; let prev = sor() ? sor().y + ',' + sor().x : null;
	let i = 0, t = 0, waited = 0; const hp0 = P().hp; let farthest = 0;
	while (t < maxTicks && i < route.length) {
		const p = P(); const s = sor(); const e = pat();
		if (s && s.blinkPhase !== phase) {
			if (s.blinkPhase === 'shown') { appear.push({ hero: Math.round(p.y) + ',' + Math.round(p.x), at: s.y + ',' + s.x, prev }); prev = s.y + ',' + s.x; }
			phase = s.blinkPhase;
		}
		// 'w20'＝その場で 20 tick 待つ（術士の出直しを見る）
		if (route[i][0] === 'w') { if (++waited > Number(route[i].slice(1))) { i++; waited = 0; continue; } }
		const [tr, tc] = route[i][0] === 'w' ? [p.y, p.x] : route[i].split(',').map(Number);
		if (route[i][0] !== 'w' && Math.abs(p.y - tr) < 0.01 && Math.abs(p.x - tc) < 0.01) { i++; farthest = Math.max(farthest, i); continue; }
		if (mode === 'fight' && e && Math.abs(e.y - p.y) + Math.abs(e.x - p.x) <= 1.3) { g.setHeroDir(face(e.y - p.y, e.x - p.x)); g.swordAttack(); }
		else if (mode === 'fight' && s && s.blinkPhase === 'shown' && (s.y === Math.round(p.y) || s.x === Math.round(p.x))) { g.setHeroDir(face(s.y - p.y, s.x - p.x)); g.useSubItem(); }
		else if (route[i][0] !== 'w') g.movePlayer(Math.abs(p.x - tc) > 0.01 ? (p.x < tc ? 'right' : 'left') : (p.y < tr ? 'down' : 'up'));
		g.step(1); t++;
		if (P().hp <= 0) break;
	}
	return { appear, reached: i >= route.length, farthest, ticks: t, hpLost: hp0 - P().hp, sorAlive: !!sor(), patAlive: !!pat(),
		potions: g.getPlayer().subItems.healPotion?.count ?? 0 };
})`;
const SOUTH = ['5,1', '5,2', '5,3', '5,4', '5,5', '5,6', '5,7', '5,8', '5,9'];
const EAST_NORTH = ['4,9', '3,9', '2,9', '1,9', '1,8', '1,7', '1,6', '1,5', '0,5'];
const TO_POTION = ['5,1', '5,2', '5,3', '5,4', '6,4', '7,4', '8,4', '7,4', '6,4', '5,4'];

test.describe('D3 堤の術士 ② 部屋', () => {
	test('術士は堤の上の、勇者と同じ行か列の3マス先に出る（出られない突堤では動かない）', async ({ page }) => {
		const errors = await boot(page, 20);
		// 船着き→南の堤の東の端→突堤の先→北の口（E は斬って進む＝術士の出方を多く見る）
		const route = ['5,3', 'w40', '5,6', 'w40', ...SOUTH.slice(6), 'w20', ...[...SOUTH].reverse().slice(1, 6), '6,4', '7,4', 'w40', '6,4',
			...SOUTH.slice(3), '3,9', 'w40', '2,9', '1,9', '1,8', 'w40', '1,7', '1,6', '1,5', '0,5'];
		const r = await page.evaluate(([run, route]) => {
			const g = window.__game;
			// 術士は射らない＝出方を最後まで見る（隣の E だけ斬る）
			const f = eval(run.replace("else if (mode === 'fight' && s &&", 'else if (false &&'));
			return f(g, route, 'fight', 900);
		}, [RUN, route]);
		const bad = [];
		let moved = 0, stayed = 0;
		for (const a of r.appear) {
			const [hr, hc] = parse(a.hero);
			const [sr, sc] = parse(a.at);
			const options = blinkOf(hr, hc);
			if (!options.length) { stayed++; if (a.at !== a.prev) bad.push(`出現先の無い ${a.hero} で ${a.prev}→${a.at} へ動いた`); continue; }
			moved++;
			const d = options.find((o) => o.r === sr && o.c === sc);
			if (!d) bad.push(`${a.hero} に立っていて ${a.at} に出た（縦横3マス先の床でない）`);
			else if (!between(hr, hc, d)) bad.push(`${a.hero} に立っていて水越しの ${a.at} に出た`);
			if (!stand(sr, sc)) bad.push(`${a.at} は水の上`);
		}
		expect(bad, '術士の出方が一本道の前後でない').toEqual([]);
		expect(moved, '堤の上で術士が出直した回数が少なすぎる＝測れていない').toBeGreaterThanOrEqual(5);
		expect(stayed, '突堤の上で「動かずに出直す」を1回も見ていない').toBeGreaterThanOrEqual(1);
		expect(r.reached, `北の口まで歩けていない（${r.farthest}/${route.length}）`).toBe(true);
		expect(errors).toEqual([]);
	});

	test('剣も弓も使わずに歩くと、前の E に塞がれ、後ろの術士に撃たれ続ける', async ({ page }) => {
		const errors = await boot(page, 10);
		const r = await page.evaluate(([run, route]) => eval(run)(window.__game, route, 'walk', 150), [RUN, [...SOUTH, ...EAST_NORTH]]);
		expect(r.reached, '剣も弓も使わずに北の口まで抜けられた＝挟み撃ちが起きていない').toBe(false);
		expect(r.farthest, `東の堤まで進めた（${r.farthest}）＝E が前に立ちはだかっていない`).toBeLessThan(SOUTH.length + 2);
		expect(r.hpLost, `撃たれ続けていない（${r.hpLost}）`).toBeGreaterThanOrEqual(10);   // 実測 16（ハート8）
		const behind = r.appear.filter((a) => { const [hr, hc] = parse(a.hero); const [sr, sc] = parse(a.at); return sr === hr && sc < hc; });
		expect(behind.length, '術士が勇者の後ろ（西）に1回も出ていない').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('通し：E を斬り、出た術士を射て進めば、薬を拾って北の口までハート2つ以内', async ({ page }) => {
		const errors = await boot(page, 10);
		const r = await page.evaluate(([run, route]) => eval(run)(window.__game, route, 'fight', 600),
			[RUN, [...TO_POTION, ...SOUTH.slice(4), ...EAST_NORTH]]);
		expect(r.reached, `北の口まで行けない（${r.farthest}）`).toBe(true);
		expect(r.potions, '突堤の先で回復薬を拾えない').toBe(1);
		expect(r.sorAlive, '術士を射落とせていない').toBe(false);
		expect(r.patAlive, 'E を斬れていない').toBe(false);
		expect(r.hpLost, `減りすぎ（${r.hpLost}）`).toBeLessThanOrEqual(4);   // 実測 2〜3（術士の出る向きは乱数）
		expect(errors).toEqual([]);
	});
});
