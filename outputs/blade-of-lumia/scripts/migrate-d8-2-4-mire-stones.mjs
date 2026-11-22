// scripts/migrate-d8-2-4-mire-stones.mjs
// 実行キュー112（2026-11-21）：沼地の神殿 D8 `2,4` を「底なし沼の石」（パズルの部屋）にする。
//
// ユーザー判断（2026-11-21）＝主題「泥に沈める石」（D4 の「石を溶岩に沈める」の沼版）。
// パズルの部屋は強い敵と組まない（2026-11-16）。難しさは詰む手と気づきで出す。
//
// 直す前＝四角い広間の真ん中に宝箱（ルピー×5）と飾りの水たまり4枚。北（→2,3）・西（→1,4）・東（→3,4）の通り道。
// 新しい姿：
//   ・南3行を沼にする＝底なし沼2行（rows 5-6・溶岩タイル `l` に泥の下地＝shared/tile-skins.js lavaSkinAt の肌 'mire'）、
//     その奥に幅1の水の帯（row 7・bgTiles の水）、さらに奥の沼の中の小島 (8,6) に宝箱（ルピー×50）。
//   ・石は泥に沈むと足場になる（溶岩と同じ動き＝player.js）。水には入らない。はしごは水を1マス渡れるが泥は渡れない。
//     ∴宝箱へは、同じ列 (5,6)(6,6) に石を2つ沈めて泥を埋め、水 (7,6) をはしごで渡る＝これが気づき。
//   ・石は北の陸に2つ (2,3)(3,8)＝ちょうど足りる数。別の列に沈めると石が足りなくなって詰む＝笛で石が戻る
//     （fluteEffect resetStones・沈んだ石も戻る）。部屋を出ても戻る。
//   ・北・西・東の口は rows 1-4 の陸でつながる＝通り道は塞がない。敵は置かない。
// 解き筋はソルバーで測った＝最少の押し 11・はしご無しでは解けない・石は2つとも要る・口へ戻れなくなる状態 0。
//
// 使い方：node scripts/migrate-d8-2-4-mire-stones.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '2,4';
export const CHEST = '8,6';
export const STONES = ['2,3', '3,8'];
export const ENTRY = ['1,5', '1,6', '4,1', '5,1', '4,10', '5,10'];
export const EXITS = ['0,5', '0,6', '4,0', '5,0', '4,11', '5,11'];
export const MIN_PUSHES = 11;

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'.....B......',
	'............',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];
const BG_BEFORE = { '6,3': '~', '6,4': '~', '6,7': '~', '6,8': '~' };
// 設計図（'l'＝底なし沼＝tiles は溶岩・bgTiles は泥／'~'＝水＝tiles は床・bgTiles が水）
export const DESIGN = [
	'#####..#####',
	'#..........#',
	'#..*.......#',
	'#.......*..#',
	'............',
	'..llllllll..',
	'#llllllllll#',
	'#~~~~~~~~~~#',
	'#lllllBllll#',
	'############',
];
export const AFTER = DESIGN.map((r) => r.replace(/~/g, '.'));
const cellsOf = (ch) => DESIGN.flatMap((row, r) => [...row].flatMap((x, c) => (x === ch ? [`${r},${c}`] : [])));
export const MIRE = cellsOf('l');
export const WATER = cellsOf('~');
const BG_AFTER = Object.fromEntries([...MIRE.map((k) => [k, TILE.MUD]), ...WATER.map((k) => [k, TILE.WATER])]);
const CONTENT = { type: 'rupee', value: 50, name: 'ルピー×50' };
const FLUTE = { type: 'resetStones' };
const COMMENT = '[キュー112] D8 底なし沼の石（パズルの部屋）。南に底なし沼2行（溶岩タイル＋泥の下地＝泥沼の肌）・幅1の水の帯・沼の中の小島に宝箱 (8,6)＝ルピー×50。'
	+ '石は泥に沈むと足場になり、水には入らない。はしごは水だけ渡れる。石2つ (2,3)(3,8) を同じ列 (5,6)(6,6) に沈め、水 (7,6) をはしごで渡る。'
	+ '別の列に沈めると石が足りず詰む＝笛で石が戻る（部屋を出ても戻る）。最少の押し 11。北・西・東の口は北の陸でつながる。敵なし。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortObj = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));

// ── ソルバー（石は溶岩＝沼に沈む・はしごは水だけ渡る＝実エンジンと同じ）──────
export function solverOf(design, { ladder = true } = {}) {
	const tiles = design.map((r) => [...r].map((ch) => (ch === '~' ? '.' : ch)));
	const bg = design.map((r) => [...r].map((ch) => (ch === 'l' ? TILE.MUD : ch === '~' ? '~' : 'g')));
	return makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: ladder, lavaSinks: true });
}
const startsOf = (S) => ENTRY.map((k) => { const [r, c] = k.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
const atGoal = (st) => st.split('|')[0] === CHEST;

/** 押しの最も少ない解（歩き=0・押し=1 の 0-1 BFS）。{ pushes, cells } か null。 */
export function bestSolution(design, opt) {
	const S = solverOf(design, opt);
	const dist = new Map(), par = new Map(), dq = [];
	for (const s of startsOf(S)) { dist.set(s, 0); dq.push(s); }
	while (dq.length) {
		const st = dq.shift(); const d = dist.get(st);
		if (atGoal(st)) { const seq = []; for (let s = st; s; s = par.get(s)) seq.push(s.split('|')[0]); return { pushes: d, cells: seq.reverse() }; }
		for (const n of S.nextStates(st)) {
			const w = n.split('|')[1] !== st.split('|')[1] ? 1 : 0;
			if (!dist.has(n) || dist.get(n) > d + w) { dist.set(n, d + w); par.set(n, st); if (w) dq.push(n); else dq.unshift(n); }
		}
	}
	return null;
}
export function measureRoom(design, opt) {
	const S = solverOf(design, opt);
	return measureMetrics(S, startsOf(S), atGoal, () => 0, {
		guardMax: 3_000_000, greedyFn: () => false,
		escapeTest: (st) => ENTRY.includes(st.split('|')[0]) || atGoal(st),
	});
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const st = data.layers[LAYER].stages[KEY];
	ok(st, `${LAYER} ${KEY} が無い`);
	const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

	let changed = false;
	const apply = (label, cur, before, after, set) => {
		if (same(cur, after)) { console.log(`… ${KEY} の${label}は既に適用済み`); return; }
		ok(same(cur, before), `${KEY} の${label}が想定と違う: ${JSON.stringify(cur)}`);
		set(); changed = true; console.log(`✔ ${KEY} の${label}を書き換えた`);
	};
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('下地（泥と水）', sortObj(st.bgTiles), sortObj(BG_BEFORE), sortObj(BG_AFTER), () => { st.bgTiles = { ...BG_AFTER }; });
	apply('宝箱', st.chestContents, { '4,5': { type: 'rupee', value: 5, name: 'ルピー×5' } }, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	apply('笛の効き目', st.fluteEffect, undefined, FLUTE, () => { st.fluteEffect = { ...FLUTE }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	const at = (k) => { const [r, c] = k.split(',').map(Number); return g[r][c]; };
	ok(g.length === ROWS && g.every((r) => r.length === COLS), '盤面の大きさ');
	ok(EXITS.every((k) => at(k) === '.'), '北・西・東の口はそのまま');
	ok(g[9] === '############', '南は壁');
	ok(at(CHEST) === 'B', '宝箱 (8,6)');
	ok(STONES.every((k) => at(k) === '*'), '石');
	ok(MIRE.every((k) => at(k) === TILE.LAVA && st.bgTiles[k] === TILE.MUD), '底なし沼＝溶岩タイル＋泥の下地');
	ok(WATER.every((k) => at(k) === '.' && st.bgTiles[k] === TILE.WATER), '水の帯＝床＋水の下地');
	ok(!g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない（パズルの部屋）');

	const best = bestSolution(DESIGN);
	ok(best && best.pushes === MIN_PUSHES, `最少の押し ${best?.pushes}（期待 ${MIN_PUSHES}）`);
	ok(!bestSolution(DESIGN, { ladder: false }), 'はしご無しで解ける（水の帯が飾り）');
	for (const s of STONES) {
		const [r, c] = s.split(',').map(Number);
		const walled = DESIGN.map((row, i) => (i === r ? row.slice(0, c) + '#' + row.slice(c + 1) : row));
		ok(!bestSolution(walled), `石 ${s} が無くても解ける`);
	}
	const m = measureRoom(DESIGN);
	ok(m.deadlocks > 0, '詰む状態が無い');
	ok(m.noEscape === 0, `口へ戻れなくなる状態 ${m.noEscape}`);
	console.log(`✔ 自己検証 OK（最少の押し ${best.pushes}・L ${m.L}・詰む状態 ${m.deadlocks}・閉じ込め 0・はしごと石2つが要る）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
