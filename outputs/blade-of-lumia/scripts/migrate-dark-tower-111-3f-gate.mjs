// scripts/migrate-dark-tower-111-3f-gate.mjs
// 実行キュー111（2026-11-17）：暗黒の塔 3F の関門 `3,1` を「はしごと石の関門」にする。
//
// ユーザー指摘（2026-11-16）＝部屋を役割で分ける。この部屋は**パズルの部屋**＝敵を置かない。
// 難しさは「押す順を間違えると詰む手」と「気づきが要る手」で出す。
//
// 直す前＝row6 の穴の一本帯をはしごで渡るだけ（1手）。
// 新しい姿：
//   ・row3 の穴の帯（はしごの関門の名残）を渡った先が仕掛けの床。南の口の手前 (8,5)(8,6) は門 T。
//   ・門は踏み板 S (4,1)・(7,2) の両方に石が乗ると開く（全踏み板に石＝ロック＝解いた後は開いたまま）。
//   ・石は (6,6)・(6,9) の2つ。踏み板 (7,2) へは (6,2) から南へ押し込むしかなく、そのため1つ目の石は
//     row6 を西端まで運ぶ。2つ目の石は (6,4) まで運んでから北へ押し上げ、row4 を西へ運ぶ＝下から押す立ち位置
//     (7,4) は西が壁・北が石・東が穴 (7,5)＝**穴をはしごで渡って石の裏へ回る**のが気づきの一手。
//   ・角や穴の縁へ押すと戻せない＝詰む（部屋を出れば石は元へ戻る＝実エンジンの未解決リセット）。
//   ・敵は置かない。
// 数（ソルバー・はしごの上から押す手は数えない）＝最少の押し 15 回・最短 43 手・詰む状態あり・
// 抜け出せなくなる状態 0。はしご無し・押し無し・穴 (7,5) を壁にした、のどれでも解けない。
//
// 使い方：node scripts/migrate-dark-tower-111-3f-gate.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '3,1';
export const NORTH_IN = ['1,5', '1,6'];
export const SOUTH_OUT = ['9,5', '9,6'];

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#xxxxxxxxxx#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const AFTER = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#xxxxxxxxxx#',
	'#S....x....#',
	'#.....x....#',
	'#.....*..*.#',
	'#xS#.x.....#',
	'#####TT#####',
	'#####..#####',
];
export const LADDER_KEY_PIT = '7,5';   // 石の裏 (7,4) へ回るための穴
export const MIN_PUSHES = 15;
const COMMENT = '[キュー111] 3F の関門＝はしごと石の関門（パズルの部屋・敵なし）。南の門 (8,5)(8,6) は踏み板 (4,1)(7,2) の'
	+ '両方に石が乗ると開く。石 (6,6) は row6 を西端まで運んで (7,2) へ、石 (6,9) は (6,4) まで運んでから北へ押し上げて (4,1) へ。'
	+ '押し上げる立ち位置 (7,4) へは穴 (7,5) をはしごで渡って入る。角や穴の縁へ押すと詰む（部屋を出れば石は戻る）。'
	+ 'row3 の穴の帯ははしごの関門の名残。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── ソルバー ─────────────────────────────────────────
// ⚠️ はしごの上（穴のセル）から石を押す手は数えない＝エンジンは許すが、どこでも教えていない手を
//    解き筋に入れないため（入れると「押し15回」が嘘の近道で縮む）。
function solverOf(rows, { hasLadder = true, noPush = false } = {}) {
	const tiles = rows.map((r) => [...r]);
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder, noPush, pitCrossable: true });
	const orig = S.nextStates;
	S.nextStates = (st) => {
		const [pos, stones] = st.split('|');
		const [r, c] = pos.split(',').map(Number);
		const out = orig(st);
		return tiles[r][c] === TILE.PIT ? out.filter((n) => n.split('|')[1] === stones) : out;
	};
	return S;
}
const startsOf = (S) => NORTH_IN.map((k) => { const [r, c] = k.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
const atOut = (st) => SOUTH_OUT.includes(st.split('|')[0]);

/** 北の口から南の口まで。L=null は解なし。noEscape＝口（北・南）へ二度と立てない状態の数。 */
export function measureGate(rows, opt = {}) {
	const S = solverOf(rows, opt);
	return measureMetrics(S, startsOf(S), atOut, () => 0, {
		guardMax: 2_000_000, greedyFn: () => false,
		escapeTest: (st) => NORTH_IN.includes(st.split('|')[0]) || atOut(st),
	});
}

/**
 * 押しの最も少ない解（歩き=0・押し=1 の 0-1 BFS）。解なしは null。
 * 戻り値＝{ pushes, cells }。cells＝北の口から南の口までプレイヤーが立つセルの列（実機の通しテストで再生する）。
 */
export function bestSolution(rows) {
	const S = solverOf(rows);
	const dist = new Map();
	const par = new Map();
	const dq = [];
	for (const s of startsOf(S)) { dist.set(s, 0); dq.push(s); }
	while (dq.length) {
		const st = dq.shift();
		const d = dist.get(st);
		if (atOut(st)) {
			const seq = [];
			for (let s = st; s; s = par.get(s)) seq.push(s.split('|')[0]);
			return { pushes: d, cells: seq.reverse() };
		}
		const stones = st.split('|')[1];
		for (const n of S.nextStates(st)) {
			const w = n.split('|')[1] !== stones ? 1 : 0;
			if (!dist.has(n) || dist.get(n) > d + w) {
				dist.set(n, d + w); par.set(n, st);
				if (w) dq.push(n); else dq.unshift(n);
			}
		}
	}
	return null;
}
export const minPushes = (rows) => bestSolution(rows)?.pushes ?? null;

export const wallAt = (rows, cell) => {
	const [r, c] = cell.split(',').map(Number);
	return rows.map((row, i) => (i === r ? row.slice(0, c) + TILE.WALL + row.slice(c + 1) : row));
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const st = data.layers.dark_tower.stages[KEY];
	ok(st, `dark_tower ${KEY} が無い`);
	const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

	let changed = false;
	const cur = rows();
	if (same(cur, AFTER)) console.log(`… ${KEY} の盤面は既に適用済み`);
	else {
		ok(same(cur, BEFORE), `${KEY} の盤面が想定と違う: ${JSON.stringify(cur)}`);
		st.tiles = AFTER.map((r) => [...r]);
		changed = true;
		console.log(`✔ ${KEY} の盤面を書き換えた`);
	}
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(g[0] === '#####..#####' && g[9] === '#####..#####', '北と南の口 (5,6) はそのまま');
	ok(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は全部壁');
	ok(Object.keys(st.mapEnters ?? {}).length === 0, '階段・入口は無い');
	const enemies = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ENEMY_META[ch] ? [`${r},${c}`] : [])));
	ok(enemies.length === 0, `パズルの部屋に敵がいる: ${enemies}`);
	ok(Object.keys(st.enemyDirs ?? {}).length === 0, 'enemyDirs は空');

	const m = measureGate(AFTER);
	ok(m.L !== null, '南の口へ届かない（解なし）');
	ok(m.noEscape === 0, `抜け出せなくなる状態がある: ${m.noEscape}`);
	ok(m.deadlocks > 0, '詰む状態が無い（順序を問わない＝易しすぎる）');
	const p = minPushes(AFTER);
	ok(p === MIN_PUSHES, `最少の押し ${p}（期待 ${MIN_PUSHES}）`);
	ok(measureGate(AFTER, { hasLadder: false }).L === null, 'はしご無しでも抜けられる');
	ok(measureGate(AFTER, { noPush: true }).L === null, '石を押さずに抜けられる');
	ok(measureGate(wallAt(AFTER, LADDER_KEY_PIT)).L === null, `穴 ${LADDER_KEY_PIT} を壁にしても抜けられる（石の裏へ回る手が飾り）`);
	ok(measureGate(wallAt(AFTER, '1,9')).L !== null, '対照の空振り検査：無関係な床を潰したら解けなくなった');
	console.log(`✔ 自己検証 OK（L=${m.L}・押し ${p}・詰む状態 ${m.deadlocks}・抜け出せない 0・はしご／押し／穴 ${LADDER_KEY_PIT} のどれを欠いても解けない）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
