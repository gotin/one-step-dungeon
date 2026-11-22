// scripts/migrate-d8-1-3-sluice-stones.mjs
// 実行キュー112（2026-11-21）：沼地の神殿 D8 `1,3`（入口）を「水門と石」（パズルの部屋）にする。
//
// 経緯：最初は「入口は軽く」で葦とヒル1匹だけを足したが、ユーザー指摘「なんか簡単すぎない？ 難しさには何にも寄与して
// ないよね？ このステージの狙いはなんですか？」→ ユーザー判断＝パズルの部屋として作り直す。主題はユーザー選択「水門と石」。
//
// 規則（game/conditions.js refreshGates・game/passable.js）：
//   ・水門（潮ゲート `=`）は links でつながった踏み板 `S` が ON の間だけ開く（干上がって通れる）。閉じると水＝通れない。
//   ・踏み板は乗っている間だけ ON（石でも勇者でも）。全部の踏み板に石が乗ると石が固まり、水門は開いたままになる。
//   ・石は部屋を出ると元に戻る（入口の西の口・北の水の帯がすぐ横＝やり直せる）。この時点では笛はまだ無い。
//
// 直す前＝戻り口 `>` (7,2)・石碑 (7,4)・北を塞ぐ水の帯（行3・はしごで渡る）・東の水たまりだけ。
// 新しい姿（`~` は bgTiles の水。北の帯・戻り口・石碑・西の口はそのまま）：
//      4 ..........S#     ← 踏み板 1 (4,10)：水門 B (7,10) を開ける
//      5 ......#....#
//      6 #*...#B#*#.#     ← 宝箱 (6,6)（四方は壁と水門 A）・石 (6,1)(6,8)
//      7 #.>.†.=...=#     ← 水門 A (7,6)：踏み板 2 (8,10) が開ける／水門 B (7,10)
//      8 #......###S#     ← 踏み板 2 (8,10)＝水門 B の奥
//   解き筋＝石を1つ北東の踏み板 1 (4,10) に乗せて水門 B を開け、もう1つの石を水門 B を抜けて南の踏み板 2 へ押す
//   → 水門 A が開いて宝箱へ。気づき＝「自分で踏み板に立つと水門は開くが、その間は自分が動けない＝石に押さえさせる」
//   「奥の踏み板へは、先に開けた水門を通して石を運ぶ」。
// 最少の押し 19・最短の手数 48・詰む状態あり・口へ戻れなくなる状態 0（自己検証）。敵なし。
//
// 使い方：node scripts/migrate-d8-1-3-sluice-stones.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '1,3';
export const CHEST = '6,6';
export const STONES = ['6,1', '6,8'];
export const GATES = ['7,6', '7,10'];
export const LINKS = [{ switchId: '8,10', gateId: '7,6' }, { switchId: '4,10', gateId: '7,10' }];
export const MIN_PUSHES = 19;
// 入口の着地まわり（戻り口のそば）・西の口・北の帯の岸
export const ENTRY = ['7,3'];
export const ESCAPES = ['7,3', '4,1', '5,1', '4,5', '4,6'];

// `~` は bgTiles の水（tiles 側は床 '.'）
export const DESIGN = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#~~~~~~~~~~#',
	'..........S#',
	'......#....#',
	'#*...#B#*#.#',
	'#.>.†.=...=#',
	'#......###S#',
	'############',
];
export const AFTER = DESIGN.map((row) => row.replace(/~/g, '.'));
const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'...........#',
	'...........#',
	'#..........#',
	'#.>.†......#',
	'#..........#',
	'############',
];
// 北の帯は元のまま。東の飾りの水たまり (4,9)(4,10)(5,9)(5,10) は消す（盤面の東を使うため）
// 探索＝`.scratch/q112-1-3-search.mjs`（乱数の候補をソルバーで選んだ。戻り口 `>` は踏むと外へ出る＝壁として測る）
export const WATER = [];
DESIGN.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
const BG_BEFORE_KEYS = [...WATER, '4,9', '4,10', '5,9', '5,10'];
export const CONTENT = { type: 'rupee', value: 100, name: 'ルピー×100' };
const COMMENT = '[キュー112] D8 水門と石（入口・パズルの部屋）。水門 = は links の踏み板が ON の間だけ開く。'
	+ '石を踏み板 (4,10) に乗せて水門 (7,10) を開け、もう1つの石をその水門を抜けて奥の踏み板 (8,10) へ→水門 (7,6) が開いて宝箱 (6,6)＝ルピー×100。'
	+ '最少の押し 19。石は部屋を出ると戻る。北の水の帯（はしご）・西の口・戻り口・石碑はそのまま。';

// ── ソルバー（S→= の links・石・はしご＝実エンジンと同じ）──────
const linkSpec = (links) => {
	const m = new Map();
	for (const { switchId, gateId } of links) m.set(switchId, [...(m.get(switchId) ?? []), gateId]);
	return [...m];
};
export function solverOf(design, { links = LINKS, ladder = true } = {}) {
	// 戻り口 `>` は踏むと外へ出る＝通り道にしない（壁として測る）
	const tiles = design.map((r) => [...r].map((ch) => (ch === '~' ? '.' : ch === '>' ? '#' : ch)));
	const bg = design.map((r) => [...r].map((ch) => (ch === '~' ? '~' : 'g')));
	return makeSolver(tiles, bg, linkSpec(links), {}, new Set(), { hasLadder: ladder });
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
		escapeTest: (st) => ESCAPES.includes(st.split('|')[0]) || atGoal(st),
	});
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortObj = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	// ── 設計の検証 ─────────────────────────────────────────
	const best = bestSolution(DESIGN);
	ok(best?.pushes === MIN_PUSHES, `最少の押し ${best?.pushes}（期待 ${MIN_PUSHES}）`);
	const m = measureRoom(DESIGN);
	ok(m.deadlocks > 0, '詰む状態が無い');
	ok(m.noEscape === 0, `口へ戻れない状態 ${m.noEscape}`);
	const set = (design, k, ch) => design.map((row, r) => [...row].map((x, c) => (`${r},${c}` === k ? ch : x)).join(''));
	for (const s of STONES) ok(!bestSolution(set(DESIGN, s, '#')), `対照：石 ${s} が無くても解ける`);
	for (const g of GATES) {
		const e = bestSolution(set(DESIGN, g, '.'), { links: LINKS.filter((l) => l.gateId !== g) });
		ok(!e || e.pushes < MIN_PUSHES, `対照：水門 ${g} を開けっぱなしにしても易しくならない`);
	}
	console.log(`✔ 設計 OK（押し ${best.pushes}・L ${m.L}・詰む状態 ${m.deadlocks}・閉じ込め ${m.noEscape}・石も水門も2つとも効く）`);

	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const st = data.layers[LAYER].stages[KEY];
	ok(st, `${LAYER} ${KEY} が無い`);
	const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
	let changed = false;
	const apply = (label, cur, before, after, setter) => {
		if (same(cur, after)) { console.log(`… ${KEY} の${label}は既に適用済み`); return; }
		ok(same(cur, before), `${KEY} の${label}が想定と違う: ${JSON.stringify(cur)}`);
		setter(); changed = true; console.log(`✔ ${KEY} の${label}を書き換えた`);
	};
	const BG_AFTER = Object.fromEntries(WATER.map((k) => [k, '~']));
	const BG_BEFORE = Object.fromEntries(BG_BEFORE_KEYS.map((k) => [k, '~']));
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('水（bgTiles）', sortObj(st.bgTiles), sortObj(BG_BEFORE), sortObj(BG_AFTER), () => { st.bgTiles = { ...BG_AFTER }; });
	apply('水門のつながり（links）', st.links ?? [], [], LINKS, () => { st.links = LINKS.map((l) => ({ ...l })); });
	apply('宝箱', st.chestContents, {}, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── データの自己検証 ──────────────────────────────────────────
	const g = rows();
	const at = (k) => { const [r, c] = k.split(',').map(Number); return [...g[r]][c]; };
	ok(st.mapEnters?.['7,2']?.destId === 'field_dungeon8' && at('7,2') === '>', '戻り口はそのまま');
	ok(st.signData?.['7,4']?.lines?.length === 1 && at('7,4') === '†', '石碑はそのまま');
	ok(['0,5', '0,6', '4,0', '5,0'].every((k) => at(k) === '.'), '北と西の口はそのまま');
	ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((c) => st.bgTiles[`3,${c}`] === '~'), '北の水の帯（行3）はそのまま');
	ok(!g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない');
	ok(STONES.every((k) => at(k) === '*') && GATES.every((k) => at(k) === '=') && LINKS.every((l) => at(l.switchId) === 'S'), '石・水門・踏み板');
	console.log('✔ データの自己検証 OK');

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
