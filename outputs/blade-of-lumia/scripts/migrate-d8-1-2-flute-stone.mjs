// scripts/migrate-d8-1-2-flute-stone.mjs
// 実行キュー112（2026-11-22）：沼地の神殿 D8 `1,2`（笛の間・四つ辻）を「笛で呼び戻す石」（パズルの部屋）にする。
//
// ユーザー判断（2026-11-21）＝パズルの部屋。主題はユーザー選択「笛で戻す石押し」＋ユーザー提案（2026-11-22）
// 「むしろ、積極的に笛で戻す操作をしないと解けないパズルが作れると面白いかも？」＝笛を「やり直し」でなく「手」として使う。
//
// 仕組み：
//   ・笛（fluteEffect resetStones）＝石だけが元の位置へ戻り、勇者はその場に残る。
//     ∴石を押し出した後、その裏（石の元の位置のさらに奥）に回り込んでから吹くと、石が自分の前に戻ってくる
//     ＝押せなかった向きへ押せる（笛で石を「引き寄せる」）。
//   ・この部屋の石は出ても戻らない（新設 keepStonesOnExit・game.js enterStage）＝出入りが笛の代わりにならない。
//     着地セルに石が残っていたら、入ったときに石が戻る（重なって動けなくなるのを防ぐ）。
//   ・石の戻る場所に立っていると笛は不発（game.js playFlute・同日に直した既存の穴＝重なって動けなくなっていた）。
//
// 直す前＝笛の宝箱 (2,5) と石碑 (1,9)、茂み2つと水たまりだけの四つ辻。
// 新しい姿（`~` は bgTiles の水。四つの口は行4-5・列5-6 の十字でつながる）：
//      0 #####..#####
//      1 ##.~...S.†##     ← 踏み板 (1,7)：宝箱の前の水門 (7,2) を開ける・石碑 (1,9)
//      2 ##.##...##.#
//      3 #.#..B.#~#.#     ← 笛の宝箱 (3,5)（入ってすぐ取れる）
//      4 ............
//      5 ............
//      6 #...#..#.#.#
//      7 ##=.#...*.##     ← 水門 (7,2)・石 (7,8)
//      8 #B.#...#.###     ← 宝箱 (8,1)＝ルピー×100（いつも見える）
//      9 #####..#####
//   解き筋＝石 (7,8) は北へ押せない（真下 (8,8) へは石の元の位置を通らないと入れない）。
//   東の行き止まりへ押し出し→空いた (7,8) を通って (8,8) へ→笛＝石が (7,8) に戻り、自分はその真下
//   →北へ押し上げ、十字を回して北の踏み板 (1,7) へ→水門が開いて宝箱。
// 笛なしでは解けない・笛があれば詰む状態 0（いつでも吹き戻せる）・閉じ込め 0（自己検証）。敵なし。
//
// 使い方：node scripts/migrate-d8-1-2-flute-stone.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { makeSolver } from './lib/blade-solver.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '1,2';
const ROWS = 10, COLS = 12;
export const CHEST = '8,1';
export const FLUTE_CHEST = '3,5';
export const STONE = '7,8';
export const PLATE = '1,7';
export const GATE = '7,2';
export const LINKS = [{ switchId: PLATE, gateId: GATE }];
export const LANDINGS = ['1,5', '1,6', '4,1', '5,1', '4,10', '5,10', '8,5', '8,6'];

// `~` は bgTiles の水（tiles 側は床 '.'）
export const DESIGN = [
	'#####..#####',
	'##.~...S.†##',
	'##.##...##.#',
	'#.#..B.#~#.#',
	'............',
	'............',
	'#...#..#.#.#',
	'##=.#...*.##',
	'#B.#...#.###',
	'#####..#####',
];
export const AFTER = DESIGN.map((row) => row.replace(/~/g, '.'));
export const WATER = [];
DESIGN.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
const BEFORE = [
	'#####..#####',
	'#........†.#',
	'#....B.....#',
	'#..........#',
	'............',
	'............',
	'#..u....u..#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const BG_BEFORE = { '7,5': '~', '7,6': '~' };
const FLUTE_CONTENT = { type: 'item', item: 'flute', name: '笛' };
export const CONTENT = { type: 'rupee', value: 100, name: 'ルピー×100' };
const SIGN_BEFORE = { name: '笛の間の石碑', lines: ['見えざる 道は、音が 開く。', 'この 間の 箱に その 音が 眠る。'] };
export const SIGN_AFTER = { name: '笛の間の石碑', lines: ['見えざる 道は、音が 開く。', 'この 間の 箱に その 音が 眠る。', '石は 音に 呼ばれ、元の 場所へ 帰る。'] };
const COMMENT = '[キュー112] D8 笛で呼び戻す石（笛の間・パズルの部屋）。笛は石だけを元の位置へ戻し、勇者はその場に残る＝石の裏へ回り込んでから吹くと石が前に戻る。'
	+ '石 (7,8) を東の行き止まりへ押し出し、空いた所を通って真下 (8,8) へ→笛→北へ押し上げて十字を回し、北の踏み板 (1,7) へ→水門 (7,2) が開いて宝箱 (8,1)＝ルピー×100。'
	+ '石は部屋を出ても戻らない（keepStonesOnExit）。笛なしでは解けない。笛の宝箱 (3,5) は入ってすぐ取れる。';

// ── ソルバー（S→= の links・石・はしご＋笛＝石だけ元へ）──────
export function solverOf(design) {
	// 外周の口の段は踏むと隣の部屋へ移る＝立てない。宝箱・石碑・笛の宝箱は通れない物（目標の宝箱だけ 'B' のまま）
	const tiles = design.map((r, ri) => [...r].map((ch, ci) => {
		if (ri === 0 || ri === ROWS - 1 || ci === 0 || ci === COLS - 1) return '#';
		if (`${ri},${ci}` === FLUTE_CHEST || ch === '†') return '#';
		return ch === '~' ? '.' : ch;
	}));
	const bg = design.map((r) => [...r].map((ch) => (ch === '~' ? '~' : 'g')));
	return makeSolver(tiles, bg, [[PLATE, [GATE]]], {}, new Set(), { hasLadder: true });
}
// 笛の手＝石だけを初期位置へ（ロック済み・全踏み板に石・石の戻る場所に立っている、のどれかなら不発）
export function nextWith(S, flute) {
	const init = S.initStones.join(';');
	return (st) => {
		const out = S.nextStates(st);
		if (!flute) return out;
		const p = st.split('|');
		const stones = p[1] ? p[1].split(';') : [];
		const allOn = S.buttons.length > 0 && S.buttons.every((b) => stones.includes(b));
		if (p[5] !== '1' && !allOn && !S.initStones.includes(p[0]) && p[1] !== init) { p[1] = init; out.push(p.join('|')); }
		return out;
	};
}
/** 状態空間を閉じるまで広げ、解けるか・詰む状態・閉じ込め・最短の解（笛と押しの並び）を返す */
export function analyze({ flute = true, design = DESIGN } = {}) {
	const S = solverOf(design); const next = nextWith(S, flute);
	const start = S.encode(5, 1, S.initStones, 0, 0, S.litInitMask);
	const par = new Map([[start, null]]); const rev = new Map(); const q = [start];
	while (q.length) {
		const st = q.shift();
		for (const x of next(st)) { if (!rev.has(x)) rev.set(x, []); rev.get(x).push(st); if (!par.has(x)) { par.set(x, st); q.push(x); } }
	}
	const all = [...par.keys()];
	const back = (targets) => { const ok = new Set(targets); const qq = [...targets]; while (qq.length) { const s = qq.shift(); for (const p of rev.get(s) ?? []) if (!ok.has(p)) { ok.add(p); qq.push(p); } } return ok; };
	const goals = all.filter((s) => s.split('|')[0] === CHEST);
	const canGoal = back(goals);
	const canEsc = back(all.filter((s) => LANDINGS.includes(s.split('|')[0])));
	let steps = null;
	if (goals.length) {
		const g = goals.find(Boolean);
		// BFS の親をたどる＝最短
		const path = []; for (let x = goals.reduce((a, b) => a), y = x; y; y = par.get(y)) path.unshift(y);
		steps = path.map((s, i) => (i === 0 ? null : (() => { const [a, b] = [path[i - 1].split('|'), s.split('|')]; return a[1] === b[1] ? null : a[0] === b[0] ? 'F' : 'P'; })())).filter(Boolean).join('');
		void g;
	}
	return {
		states: all.length, solvable: canGoal.has(start), events: steps,
		deadlocks: all.filter((s) => !canGoal.has(s)).length, noEscape: all.filter((s) => !canEsc.has(s)).length,
	};
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortObj = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	// ── 設計の検証 ─────────────────────────────────────────
	const withF = analyze({ flute: true });
	const noF = analyze({ flute: false });
	ok(withF.solvable, '笛があっても解けない');
	ok(!noF.solvable, '笛なしで解ける（笛が手になっていない）');
	ok(withF.events?.includes('F') && /F.*P{3,}/.test(withF.events), `笛の後に押す解になっていない: ${withF.events}`);
	ok(withF.noEscape === 0 && noF.noEscape === 0, `閉じ込め（笛あり ${withF.noEscape}・笛なし ${noF.noEscape}）`);
	console.log(`✔ 設計 OK（笛あり：状態 ${withF.states}・解 ${withF.events}・詰む状態 ${withF.deadlocks}／笛なし：解けない・閉じ込め 0）`);

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
	const CH_BEFORE = { '2,5': FLUTE_CONTENT };
	const CH_AFTER = { [FLUTE_CHEST]: FLUTE_CONTENT, [CHEST]: CONTENT };
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('水（bgTiles）', sortObj(st.bgTiles), sortObj(BG_BEFORE), sortObj(BG_AFTER), () => { st.bgTiles = { ...BG_AFTER }; });
	apply('水門のつながり（links）', st.links ?? [], [], LINKS, () => { st.links = LINKS.map((l) => ({ ...l })); });
	apply('宝箱', sortObj(st.chestContents), sortObj(CH_BEFORE), sortObj(CH_AFTER), () => { st.chestContents = JSON.parse(JSON.stringify(CH_AFTER)); });
	apply('石碑', st.signData?.['1,9'], SIGN_BEFORE, SIGN_AFTER, () => { st.signData['1,9'] = JSON.parse(JSON.stringify(SIGN_AFTER)); });
	apply('笛の効き目', st.fluteEffect, undefined, { type: 'resetStones' }, () => { st.fluteEffect = { type: 'resetStones' }; });
	apply('石が出ても戻らない指定', st.keepStonesOnExit ?? null, null, true, () => { st.keepStonesOnExit = true; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── データの自己検証 ──────────────────────────────────────────
	const g = rows();
	const at = (k) => { const [r, c] = k.split(',').map(Number); return [...g[r]][c]; };
	ok(['0,5', '0,6', '4,0', '5,0', '4,11', '5,11', '9,5', '9,6'].every((k) => at(k) === '.'), '四つの口はそのまま');
	ok(at(FLUTE_CHEST) === 'B' && at(CHEST) === 'B' && at(STONE) === '*' && at(PLATE) === 'S' && at(GATE) === '=' && at('1,9') === '†', '笛の宝箱・宝箱・石・踏み板・水門・石碑');
	ok(!g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない');
	console.log('✔ データの自己検証 OK');

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
