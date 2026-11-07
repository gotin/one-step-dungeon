// dungeon_6 `3,4`（看板 `2,3` の南東＝西 `2,4`・北 `3,3`・東 `4,4` をつなぐ素通りの部屋）：薄い部屋を「鬼火薬の栗転がし」に作り替える
// （2026-11-07 / PLAN 実行キュー 95 の9室目・主題はユーザー判断「爆弾鬼に栗を転がさせる」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 #####..#####
//      2 #..t....u..#     ← 木1・茂み1
//      4 ............     ← 西と東の口
//      6 #....u.....#     ← 茂み1
//      9 ############
//   床にルピー×5 が1つ落ちているだけの広間・敵なし。
//
// ■ 新しい `3,4`＝鬼火薬の栗転がし（`~` は bgTiles の水）
//      0 #####..#####
//      1 #~~~...t...#
//      2 #~λ~.....t.#     ← 爆弾鬼 λ(2,2)＝1マスの島（周り8マスが水＝動けない・剣は届かない）
//      3 #~~~..t....#
//      4 ............
//      5 ............
//      6 #.........S#     ← 踏み板 S(6,10)
//      7 #..¤....t..#     ← 大いが栗 ¤(7,3)
//      8 #i........B#     ← 碑 i(8,1)・宝箱 B(8,10)＝栗が踏み板に乗ると現れる（stonesPlaced）
//      9 ############
//   ・規則はどれも既存（エンジン変更なし）：
//     爆弾鬼の爆弾は「投げた瞬間の勇者のセル」に落ちる（壁も水も越える）。着弾の爆発（半径 1.5）は
//     爆弾と同じく大いが栗を転がす（`rollBurrsFromBlast`＝爆心と同じ行か列・距離 1 の栗が遠ざかる向きへ止まるまで）。
//     ∴栗の隣に立って投げさせ、着弾の前に離れれば、自分の爆弾を使わずに栗を転がせる。
//     鬼が投げるのは勇者との距離が 2〜7 の間だけ（`minRange 2.0`／`range 7`）。
//   ・解き方（5押し・自分の爆弾は1個＝約束①）：
//     ①栗の西 (7,2) で投げさせる→東へ転がって木 (7,8) の手前 (7,7)
//     ②栗の南 (8,7) は鬼から 7.8＝投げてこない→**ここだけ自分の爆弾**→北へ転がって木 (1,7) の手前 (2,7)
//     ③栗の西 (2,6) で投げさせる→東へ転がって木 (2,9) の手前 (2,8)
//     ④栗の北 (1,8) で投げさせる→南へ転がって木 (7,8) の手前 (6,8)
//     ⑤栗の西 (6,7) で投げさせる→東へ転がって外周の手前 (6,10)＝踏み板→宝箱（回復薬（大））
//     鬼を使わず自分の爆弾だけでも解ける（5個）。鬼を矢で倒すと自分の爆弾でしか押せない＝入り直せば鬼も栗も戻る（enemiesRespawn）。
//   ・報酬＝回復薬（大）（鬼の爆弾を浴びながら解く部屋＝傷を癒やす物）。旧 床のルピー×5 は撤去。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水／宝の中身と出る条件／碑の本文／外周の口の形が不変
//   ・鬼の島：周り8マスが水・勇者の立てる床から剣の届き（1.2）より遠い
//   ・鬼あり（距離 2〜7 で隣に立てば無料）の BFS：自分の爆弾の最少 1・最少 5 押し・境目（2.5〜6.5／1.9〜7.6）でも同じ
//   ・鬼なし（ソルバー scripts/lib/blade-solver.mjs）：爆弾の最少 5・入って詰む状態が無い（noEscape 0）
//   ・口から口へ謎を解かずに抜けられる・敵と脅威度・層の到達性が書き換え前と同じ・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-3-4-ogre-burr-roll.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-3-4-ogre-burr-roll.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { ROWS as SR, COLS as SC, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '3,4';
export const ROWS = 10, COLS = 12;

// `~` は bgTiles の水（tiles 側は床 '.'）。
export const PLAN_ROWS = [
	'#####..#####',
	'#~~~...t...#',
	'#~λ~.....t.#',
	'#~~~..t....#',
	'............',
	'............',
	'#.........S#',
	'#..¤....t..#',
	'#i........B#',
	'############',
];
export const OGRE  = '2,2';
export const BURR  = '7,3';
export const PLATE = '6,10';
export const CHEST = '8,10';
export const SIGN  = '8,1';
export const MOUTHS = { north: ['0,5', '0,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
// 想定の5押し（立つセル → 栗の止まる所）。own＝自分の爆弾（鬼の届きの外）
export const PUSHES = [
	{ seat: '7,2', to: '7,7', own: false },
	{ seat: '8,7', to: '2,7', own: true },
	{ seat: '2,6', to: '2,8', own: false },
	{ seat: '1,8', to: '6,8', own: false },
	{ seat: '6,7', to: '6,10', own: false },
];
export const OGRE_RANGE = [2, 7];   // shared/enemies.js 爆弾鬼 attack.minRange / range
export const TARGET = PLAN_ROWS.map((row) => row.replace(/~/g, '.'));
export const WATER = [];
PLAN_ROWS.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
export const CHEST_CONTENTS = { [CHEST]: { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } };
export const SHOW = { [CHEST]: { trigger: 'stonesPlaced', message: '{{burr}} 大いが栗が 踏み板に 収まり、宝箱が 現れた！' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '鬼火薬の 庭',
		lines: [
			'島の 鬼は 見た 者の 足元へ 火薬を 投げる。',
			'大いが栗は 誰の 爆ぜる 風にも 転がる。',
		],
	},
};

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

// ── 鬼ありの押し方の BFS（自分の爆弾の数を最小に・次に押し回数）─────────────────
// 状態＝栗の位置。手＝栗の縦横の隣 X に立って鬼に投げさせる（鬼との距離が range の内なら無料）か、
// 栗から縦横 1〜2 の X で自分の爆弾（1個）。栗は爆心から遠ざかる向きへ止まるまで転がる
// （入れない＝外周・床でない・踏み板以外のタイル・水・鬼のセル）。勇者は口から栗を避けて歩ける床に立てる。
export function ogreSearch(tiles, water, { range = OGRE_RANGE } = {}) {
	const [or, oc] = OGRE.split(',').map(Number);
	const at = (r, c) => tiles[r]?.[c];
	const isWater = (r, c) => water.has(`${r},${c}`);
	const walkable = (r, c) => !isWater(r, c) && (at(r, c) === TILE.FLOOR || at(r, c) === TILE.BUTTON);
	const canRoll = (r, c) => r > 0 && c > 0 && r < ROWS - 1 && c < COLS - 1 && walkable(r, c);
	const reach = (burr) => {
		const seen = new Set(); const q = [];
		for (const k of Object.values(MOUTHS).flat()) { seen.add(k); q.push(k); }
		while (q.length) {
			const [r, c] = q.shift().split(',').map(Number);
			for (const [dr, dc] of DIRS) {
				const k = `${r + dr},${c + dc}`;
				if (seen.has(k) || k === burr || !walkable(r + dr, c + dc)) continue;
				seen.add(k); q.push(k);
			}
		}
		return seen;
	};
	const inOgreRange = (k) => { const [r, c] = k.split(',').map(Number); const d = Math.hypot(r - or, c - oc); return d >= range[0] && d <= range[1]; };
	const best = new Map([[BURR, { bombs: 0, pushes: 0, path: [] }]]);
	const pq = [{ burr: BURR, bombs: 0, pushes: 0, path: [] }];
	let sol = null;
	while (pq.length) {
		pq.sort((a, b) => a.bombs - b.bombs || a.pushes - b.pushes);
		const cur = pq.shift();
		const b = best.get(cur.burr);
		if (b.bombs < cur.bombs || (b.bombs === cur.bombs && b.pushes < cur.pushes)) continue;
		if (cur.burr === PLATE) { sol = sol ?? cur; continue; }
		const seats = reach(cur.burr);
		const [br, bc] = cur.burr.split(',').map(Number);
		for (const [dr, dc] of DIRS) {
			let r = br, c = bc;
			while (canRoll(r + dr, c + dc)) { r += dr; c += dc; }
			if (r === br && c === bc) continue;
			const to = `${r},${c}`;
			for (const dist of [1, 2]) {
				const seat = `${br - dr * dist},${bc - dc * dist}`;
				if (!seats.has(seat) || Object.values(MOUTHS).flat().includes(seat)) continue;
				const free = dist === 1 && inOgreRange(seat);
				const cand = { burr: to, bombs: cur.bombs + (free ? 0 : 1), pushes: cur.pushes + 1, path: [...cur.path, `${free ? '鬼' : '自'}@${seat}→${to}`] };
				const ob = best.get(to);
				if (ob && (ob.bombs < cand.bombs || (ob.bombs === cand.bombs && ob.pushes <= cand.pushes))) continue;
				best.set(to, cand); pq.push(cand);
			}
		}
	}
	return { sol, states: best.size };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : [...row][0] + [...row][COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, TARGET.length === ROWS && TARGET.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, '~']));
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	room.showConditions = JSON.parse(JSON.stringify(SHOW));
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = [];
	room.enemyDirs = { [OGRE]: 'down' };
	delete room.enemyHold;     // λ は roam を持たない＝持ち場の指定は効かない（holdsPost）∴1マスの島で動けなくする
	delete room.enemyChase;
	room.enemiesRespawn = true;   // 鬼を倒してしまっても入り直せば戻る（栗も元の位置へ戻る）
	delete room.initLitTorches;
	room.comment = '【キュー95 鬼火薬の栗転がし（2026-11-07）】1マスの島の爆弾鬼は勇者の足元へ爆弾を投げる＝その爆風でも大いが栗は転がる。'
		+ '栗の隣に立って投げさせ、着弾の前に離れる。鬼から遠い (8,7) だけは投げてこない＝自分の爆弾1個。'
		+ '5押しで栗が踏み板 (6,10) に乗ると宝箱（回復薬（大））。入り直せば鬼も栗も戻る。scripts/migrate-d6-3-4-ogre-burr-roll.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	const water = new Set(Object.keys(room.bgTiles));
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水 ${water.size} マス（bgTiles）＝鬼の島の周り`, water.size === WATER.length);
	check(`宝箱 ${CHEST} は1つ・中身＝回復薬（大）・栗が踏み板に乗ると現れる（stonesPlaced）`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS) && room.showConditions[CHEST]?.trigger === 'stonesPlaced');
	check(`大いが栗 ${BURR} は1つ・踏み板 ${PLATE} は1枚・普通の石と門は無い`, count(TILE.BURR) === 1 && at(BURR) === TILE.BURR
		&& count(TILE.BUTTON) === 1 && at(PLATE) === TILE.BUTTON && count(TILE.STONE) === 0 && count(TILE.GATE) === 0);
	check(`碑 ${SIGN} に本文2行`, at(SIGN) === TILE.SIGN && count(TILE.SIGN) === 1 && room.signData[SIGN]?.lines?.length === 2);
	check(`床の爆弾 '5'・壊せる壁 '!'・茂み・かがり火が無い`, !t.flat().some((ch) => ch === TILE.ITEM_BOMB || ch === TILE.BREAKABLE_WALL
		|| ch === TILE.BUSH || ch === TILE.TORCH));
	{
		const enemies = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemies.push([`${r},${c}`, ch]); }));
		check(`敵は爆弾鬼 λ が ${OGRE} の1体だけ`, enemies.length === 1 && enemies[0][0] === OGRE && enemies[0][1] === TILE.BOMB_OGRE);
		const atk = ENEMY_META[TILE.BOMB_OGRE].attack;
		check(`爆弾鬼の届き＝${atk.minRange}〜${atk.range}・爆風 ${atk.blast.radius}（このスクリプトの前提と同じ）`,
			atk.type === 'bombThrow' && atk.minRange === OGRE_RANGE[0] && atk.range === OGRE_RANGE[1] && atk.blast.radius === 1.5 && atk.blast.breakPower > 0);
		const [or, oc] = OGRE.split(',').map(Number);
		const ring = [];
		for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) ring.push(`${or + dr},${oc + dc}`);
		check(`鬼の島＝周り8マスが水（歩いて出られない）`, ring.every((k) => water.has(k)));
		const floors = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.FLOOR && !water.has(`${r},${c}`)) floors.push([r, c]); }));
		const nearest = Math.min(...floors.map(([r, c]) => Math.hypot(r - or, c - oc)));
		check(`勇者の立てる床から鬼まで ${nearest.toFixed(2)}＝剣の届き 1.2 より遠い（鬼は矢でしか倒せない）`, nearest > 1.2);
		check(`入り直すと敵が戻る（enemiesRespawn）`, room.enemiesRespawn === true);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat} が看板部屋 2,3 の ${sig} より軽い`, threat < sig);
	}

	// ── ② 鬼ありの押し方（BFS）────────────────────────────────────────────
	{
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で爆弾が使える（toolsUsableIn）`, tools.has('bomb'));
		const ogre = ogreSearch(t, water);
		check(`鬼に投げさせると自分の爆弾は 1 個・5 押しで踏み板（${ogre.sol?.path.join(' → ') ?? '解なし'}）`,
			ogre.sol?.bombs === 1 && ogre.sol?.pushes === 5);
		const want = PUSHES.map((p) => `${p.own ? '自' : '鬼'}@${p.seat}→${p.to}`).join(' → ');
		check(`最短の押し方が想定の5押しと同じ（${want}）`, ogre.sol?.path.join(' → ') === want);
		for (const rg of [[2.5, 6.5], [1.9, 7.6]]) {
			const o = ogreSearch(t, water, { range: rg });
			check(`鬼の届きの境目をずらしても（${rg.join('〜')}）同じ押し方`, o.sol?.path.join(' → ') === want);
		}
		const [or, oc] = OGRE.split(',').map(Number);
		for (const p of PUSHES) {
			const [r, c] = p.seat.split(',').map(Number);
			const d = Math.hypot(r - or, c - oc);
			check(`${p.seat} は鬼から ${d.toFixed(2)}＝${p.own ? '届きの外（投げてこない）' : '届きの内（投げてくる）'}`,
				p.own ? d > OGRE_RANGE[1] + 0.5 : d >= OGRE_RANGE[0] + 0.2 && d <= OGRE_RANGE[1] - 0.5);
		}
	}

	// ── ③ 鬼なし（ソルバー＝実ゲームと同じ遷移・鬼と水は壁）────────────────
	{
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		const grid = t.map((r) => r.slice());
		for (const k of [...water, OGRE]) { const [r, c] = k.split(',').map(Number); grid[r][c] = TILE.WALL; }
		const bg = Array.from({ length: SR }, () => Array(SC).fill('g'));
		const S = makeSolver(grid, bg, [], {}, new Set(), { hasLadder: tools.has('ladder'), hasCandle: tools.has('candle'), noTools: false });
		const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
		// 宝箱は踏み板に栗が乗ると現れる＝ソルバー上は「栗が踏み板に乗った（f[5]）」をゴールにする
		const goal = (st) => st.split('|')[5] === '1';
		const m = measureMetrics(S, starts, goal, () => 0, { guardMax: 4000000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
		check(`鬼なしでもソルバーで解ける（L=${m.L}・状態 ${m.states}）`, m.L != null);
		check(`入って詰む状態が無い（noEscape ${m.noEscape}）`, m.noEscape === 0);
		check(`対照：爆弾なしでは解けない`, (() => {
			const S2 = makeSolver(grid, bg, [], {}, new Set(), { hasLadder: false, hasCandle: true, noTools: true });
			const st2 = S2.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S2.encode(r, c, S2.initStones, 0, 0, S2.litInitMask); });
			return measureMetrics(S2, st2, goal, () => 0, { guardMax: 4000000 }).L == null;
		})());
		const cost = new Map(); const dq = [];
		for (const s of starts) { cost.set(s, 0); dq.push(s); }
		let best = null;
		while (dq.length) {
			const st = dq.shift();
			if (goal(st)) { best = cost.get(st); break; }
			const f = st.split('|');
			for (const nx of S.nextStates(st)) {
				const g = nx.split('|');
				const bomb = g[0] === f[0] && g[1] !== f[1];
				const nc = cost.get(st) + (bomb ? 1 : 0);
				if (!cost.has(nx) || nc < cost.get(nx)) { cost.set(nx, nc); bomb ? dq.push(nx) : dq.unshift(nx); }
			}
		}
		check(`鬼を使わないと自分の爆弾が 5 個要る（実測 ${best}）＝鬼に投げさせる意味がある`, best === 5);
	}

	// ── ④ 通り抜け（謎を解かずに口から口へ）─────────────────────────────
	{
		const seen = new Set(); const q = [];
		const ok = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && !water.has(`${r},${c}`) && [TILE.FLOOR, TILE.BUTTON].includes(t[r][c]);
		for (const k of MOUTHS.west) { seen.add(k); q.push(k); }
		while (q.length) {
			const [r, c] = q.shift().split(',').map(Number);
			for (const [dr, dc] of DIRS) {
				const k = `${r + dr},${c + dc}`;
				if (seen.has(k) || k === BURR || !ok(r + dr, c + dc)) continue;
				seen.add(k); q.push(k);
			}
		}
		check(`西の口から北・東の口へ謎を解かずに抜けられる`, [...MOUTHS.north, ...MOUTHS.east].every((k) => seen.has(k)));
	}

	// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「鬼火薬の栗転がし」に作り替える（キュー95 の9室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・~ は水）`);
	room.tiles.forEach((row, i) => console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${PLAN_ROWS[i]}`));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) ng++; }
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);
	if (DRY) console.log('\n--dry: 書き込みなし');
	else { writeFileSync(MAP_PATH, JSON.stringify(data, null, 2)); console.log('\n書き込み完了:', MAP_PATH); }
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
