// scripts/migrate-d8-0-3-leech-stones.mjs
// 実行キュー112（2026-11-19）：沼地の神殿 D8 `0,3`（入口の西の行き止まり）を「ヒルと石の泥道」（パズルの部屋）にする。
//
// ユーザー判断（2026-11-19）＝D8 の残りはパズルと戦闘を半々。この部屋の主題はユーザーが選んだ「ヒルと石の泥道」
// （❌ 先に選んだ「切ってはいけない導火線」は、切った葦の跡に立てば残りに火を点けられる＝今の仕組みでは詰まない∴取り下げ）。
// パズルの部屋は強い敵と組まない（2026-11-16）。難しさは詰む手と気づきで出す。
//
// 直す前＝四角い広間に E・C（28）と飾りの水たまり4枚。東の口（→ 入口 1,3）だけの行き止まり。報酬なし。
// 新しい姿：
//   ・沼（bgTiles の水）の中に、幅1〜3の泥道。石2つ (4,6)(7,7)・踏み板2つ (5,9)(7,6)。
//     両方の踏み板に石が乗ると、西の袋 (4,1) に宝箱（ルピー×100・stonesPlaced）。
//   ・解き筋はソルバーで測った＝最少の押し 11。角や袋小路へ押すと詰む（詰む状態がある）。
//     笛を吹くと石が元に戻る（fluteEffect resetStones＝D8 の鍵の部屋 1,0 と同じ救済）。部屋を出ても石は戻る。
//   ・西の広場に毒沼ヒル Γ×2 (4,3)(5,2)。弱い・鈍い。石は押さない（実測）＝石の陰に隠れられるが、
//     石を運ぶ途中で泥道を塞がれると、斬るか（毒をもらう）かわすかを選ぶ。
//   ・内側の壁を沼に替えた所は、どこも幅2以上か壁に接する＝はしごの近道は無い（はしごありでも最少の押しは 11）。
// 敵の強さ＝Γ 4.5×2 ＝ 9（直す前 28）。
//
// 使い方：node scripts/migrate-d8-0-3-leech-stones.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '0,3';
export const CHEST = '4,1';
export const BUTTONS = ['5,9', '7,6'];
export const STONES = ['4,6', '7,7'];
export const ENTRY = ['4,10', '5,10'];
export const MIN_PUSHES = 11;

const BEFORE = [
	'############',
	'#..........#',
	'#..........#',
	'#...E......#',
	'#...........',
	'#......C....',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];
const BG_BEFORE = { '6,2': '~', '6,3': '~', '6,8': '~', '6,9': '~' };
// 設計図（'~'＝沼＝tiles は床・bgTiles が水）
export const DESIGN = [
	'############',
	'#~~~~~~~~~~#',
	'#~~~~~~~~~~#',
	'#~~~~~~~..~#',
	'#B.Γ..*.....',
	'#~Γ..~~.#S..',
	'#~~~~~~.#.~#',
	'#~~~~~S*..~#',
	'#~~~~~~~~~~#',
	'############',
];
export const AFTER = DESIGN.map((r) => r.replace(/~/g, '.'));
export const WATER = DESIGN.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '~' ? [`${r},${c}`] : [])));
const BG_AFTER = Object.fromEntries(WATER.map((k) => [k, '~']));
export const ENEMIES = ['4,3Γ', '5,2Γ'];
export const THREAT = 9;
const CONTENT = { type: 'rupee', value: 100, name: 'ルピー×100' };
const SHOW = { trigger: 'stonesPlaced' };
const FLUTE = { type: 'resetStones' };
const COMMENT = '[キュー112] D8 ヒルと石の泥道（パズルの部屋）。沼の中の泥道に石2つ (4,6)(7,7)・踏み板2つ (5,9)(7,6)。'
	+ '両方に石が乗ると西の袋 (4,1) に宝箱（ルピー×100）。最少の押し 11（ソルバー）・角や袋小路へ押すと詰む＝笛で石が戻る（部屋を出ても戻る）。'
	+ '西の広場に毒沼ヒル Γ×2（石は押さない）。沼はどこも幅2以上か壁に接する＝はしごの近道なし。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortObj = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));

// ── ソルバー（敵は床扱い＝倒せば通れる）────────────────────
export function solverOf(design, { ladder = true } = {}) {
	const tiles = design.map((r) => [...r].map((ch) => (ch === '~' || ENEMY_META[ch] ? '.' : ch)));
	const bg = design.map((r) => [...r].map((ch) => (ch === '~' ? '~' : 'g')));
	return makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: ladder });
}
const startsOf = (S) => ENTRY.map((k) => { const [r, c] = k.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
const goalOf = (S) => (st) => { const s = st.split('|')[1].split(';'); return S.buttons.every((b) => s.includes(b)); };

/** 押しの最も少ない解（歩き=0・押し=1 の 0-1 BFS）。{ pushes, cells } か null。 */
export function bestSolution(design, opt) {
	const S = solverOf(design, opt);
	const goal = goalOf(S);
	const dist = new Map(), par = new Map(), dq = [];
	for (const s of startsOf(S)) { dist.set(s, 0); dq.push(s); }
	while (dq.length) {
		const st = dq.shift(); const d = dist.get(st);
		if (goal(st)) { const seq = []; for (let s = st; s; s = par.get(s)) seq.push(s.split('|')[0]); return { pushes: d, cells: seq.reverse() }; }
		for (const n of S.nextStates(st)) {
			const w = n.split('|')[1] !== st.split('|')[1] ? 1 : 0;
			if (!dist.has(n) || dist.get(n) > d + w) { dist.set(n, d + w); par.set(n, st); if (w) dq.push(n); else dq.unshift(n); }
		}
	}
	return null;
}
/** 状態空間の指標（L＝最短手数・deadlocks＝解けなくなる状態の数・noEscape＝口へ戻れなくなる状態の数）。 */
export function measureRoom(design, opt) {
	const S = solverOf(design, opt);
	const goal = goalOf(S);
	return measureMetrics(S, startsOf(S), goal, () => 0, {
		guardMax: 2_000_000, greedyFn: () => false,
		escapeTest: (st) => ENTRY.includes(st.split('|')[0]) || goal(st),
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
	apply('沼（bgTiles）', sortObj(st.bgTiles), sortObj(BG_BEFORE), sortObj(BG_AFTER), () => { st.bgTiles = { ...BG_AFTER }; });
	apply('宝箱', st.chestContents, {}, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	apply('出現条件', st.showConditions, {}, { [CHEST]: SHOW }, () => { st.showConditions = { [CHEST]: { ...SHOW } }; });
	apply('笛の効き目', st.fluteEffect, undefined, FLUTE, () => { st.fluteEffect = { ...FLUTE }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	const at = (k) => { const [r, c] = k.split(',').map(Number); return g[r][c]; };
	ok(g.length === ROWS && g.every((r) => r.length === COLS), '盤面の大きさ');
	ok(g[4][11] === '.' && g[5][11] === '.', '東の口 (4,11)(5,11) はそのまま');
	ok(g.every((r, i) => r[0] === '#' && (i === 4 || i === 5 || r[11] === '#')), '外周は東の口のほか壁');
	ok(g[0] === '############' && g[9] === '############', '北と南は壁');
	ok(at(CHEST) === 'B', '宝箱 (4,1)');
	ok(BUTTONS.every((k) => at(k) === 'S') && STONES.every((k) => at(k) === '*'), '踏み板と石');
	ok(WATER.every((k) => at(k) === '.'), '沼の上に物や敵を置かない');
	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);

	const best = bestSolution(DESIGN);
	ok(best && best.pushes === MIN_PUSHES, `最少の押し ${best?.pushes}（期待 ${MIN_PUSHES}）`);
	const noLadder = bestSolution(DESIGN, { ladder: false });
	ok(noLadder && noLadder.pushes === MIN_PUSHES, `はしごの有無で最少の押しが変わる（近道がある）: ${noLadder?.pushes}`);
	const m = measureRoom(DESIGN);
	ok(m.deadlocks > 0, '詰む状態が無い（押し方を誤っても困らない）');
	ok(m.noEscape === 0, `口へ戻れなくなる状態 ${m.noEscape}（入って閉じ込められる）`);
	// 対照：石を1つ壁にすると解けない（石2つとも要る）
	for (const s of STONES) {
		const [r, c] = s.split(',').map(Number);
		const walled = DESIGN.map((row, i) => (i === r ? row.slice(0, c) + '#' + row.slice(c + 1) : row));
		ok(!bestSolution(walled), `石 ${s} が無くても解ける`);
	}
	console.log(`✔ 自己検証 OK（最少の押し ${best.pushes}・L ${m.L}・詰む状態 ${m.deadlocks}・閉じ込め 0・はしごの近道なし）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
