// scripts/migrate-dark-tower-111-2f-stairs.mjs
// 実行キュー111（2026-11-16）：暗黒の塔 2F の階段の部屋 `2,3` を「火を渡す鍵の間」にする。
//
// ユーザーの感想「dark_towerって最後のダンジョンだよね？…ここずいぶん簡単じゃない？」を受けて、
// 本道の部屋を「道具を2つ以上組み合わせないと抜けられない」にする最初の部屋（DECISIONS 2026-11-16）。
//
// 直す前＝素の広間に爆弾鬼 λ×2 と 3F への階段だけ（歩けば階段に乗れた）。
// 新しい姿：
//   ・階段 (8,4) を壁と鍵の扉 (7,4) で囲む。鍵 K (2,8) は部屋のかがり火を全部点けると出る（torchesLit）。
//   ・かがり火 B (4,5) は北南が壁・東西が壊せる壁 '!'＝爆弾で開けてからロウソクで点ける
//     （爆弾の届き＝半径2 の円∴東西の2枚を1発では壊せない＝2発）。
//   ・かがり火 C (4,9) は幅2以上の穴の環の中＝歩いても、はしごでも近づけず、ロウソクは届かない。
//     B を通る直線（row4）に火を運ぶ＝矢（火矢）かブーメラン（銀・星）で B の火を C へ渡す。
//     木のブーメランは届きが3マス＝(4,4) から C まで5マスで届かない∴本命は火矢。
//   ・その間、爆弾鬼 λ×2（(2,2)・(6,9)）が爆弾を投げてくる（λ の爆風も '!' を壊せる＝代わりに使ってよい）。
//   ・爆弾の山 '5' を (6,1) に置く（関門の手前に山＝DECISIONS 2026-09-22（1））。
//   ・南の口 (9,5)(9,6) から寄り道（2,4・2,5）へは鍵なしで行ける。
// 敵の強さ＝λ×2 の 72.0 のまま（位置だけ動かした）。
//
// 使い方：node scripts/migrate-dark-tower-111-2f-stairs.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '2,3';
const KEY_CELL = '2,8';
const ENTRY = [1, 5];

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#.λ......λ.#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#####..#####',
];
export const AFTER = [
	'#####..#####',
	'#..........#',
	'#.λ.....K..#',
	'#....#.xxxx#',
	'#...!H!xxHx#',
	'#....#.xxxx#',
	'#5.......λ.#',
	'#..#D#.....#',
	'#..#>#.....#',
	'#####..#####',
];
const DIRS_BEFORE = { '3,2': 'right', '3,9': 'left' };
const DIRS_AFTER = { '2,2': 'right', '6,9': 'left' };
const SHOW = { trigger: 'torchesLit', message: '{{torch}} 二つの 火が 揃い、鍵が 現れた！' };
const COMMENT = '[キュー111] 2F の階段の部屋＝火を渡す鍵の間。階段は鍵の扉 (7,4) の奥。鍵 (2,8) は全かがり火で出る。'
	+ 'B (4,5) は壊せる壁の奥＝爆弾＋ロウソク。C (4,9) は穴の環の中＝B を通して火矢（またはブーメラン）で火を渡す。'
	+ '爆弾鬼 λ×2 が邪魔をする。爆弾の山 (6,1)。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── ソルバーで解けるか（tiles を差し替えて対照実験もできるように関数にする）──────────
// ゴール＝全かがり火が点いた状態で鍵のセルに立つ。
export function solveKeyRoom(rows, { hasCandle = true, noTools = false } = {}) {
	const tiles = rows.map((r) => [...r]);
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasCandle, noTools, pitCrossable: true, hasLadder: true });
	const all = (1 << S.torchCells.length) - 1;
	const start = S.encode(ENTRY[0], ENTRY[1], S.initStones, 0, 0, S.litInitMask);
	const seen = new Set([start]);
	const q = [start];
	while (q.length) {
		const s = q.shift();
		const f = s.split('|');
		if (f[0] === KEY_CELL && Number(f[4]) === all) return true;
		for (const n of S.nextStates(s)) if (!seen.has(n)) { seen.add(n); q.push(n); }
		if (seen.size > 2_000_000) throw new Error('状態空間が大きすぎる');
	}
	return false;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const st = data.layers.dark_tower.stages[KEY];
	ok(st, `dark_tower ${KEY} が無い`);
	const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

	let changed = false;
	const apply = (label, cur, before, after, set) => {
		if (same(cur, after)) { console.log(`… ${KEY} の${label}は既に適用済み`); return; }
		ok(same(cur, before), `${KEY} の${label}が想定と違う: ${JSON.stringify(cur)}`);
		set(); changed = true; console.log(`✔ ${KEY} の${label}を書き換えた`);
	};
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('enemyDirs', st.enemyDirs, DIRS_BEFORE, DIRS_AFTER, () => { st.enemyDirs = { ...DIRS_AFTER }; });
	apply('出現条件', st.showConditions, {}, { [KEY_CELL]: SHOW }, () => { st.showConditions = { [KEY_CELL]: { ...SHOW } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows().map((r) => [...r]);
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(g[0].join('') === '#####..#####', '北の口 (0,5)(0,6) はそのまま');
	ok(g[9].join('') === '#####..#####', '南の口 (9,5)(9,6) はそのまま');
	ok(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は全部壁');
	ok(g[8][4] === '>' && st.mapEnters?.['8,4']?.id === '2fStairsUp', '階段 (8,4) と 2fStairsUp がそのまま');
	// 階段の四方＝扉か壁
	ok(g[7][4] === 'D' && g[8][3] === '#' && g[8][5] === '#' && g[9][4] === '#', '階段は扉 (7,4) と壁で囲まれている');
	// 敵＝λ×2・enemyDirs と一致
	const es = [];
	g.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ['2,2λ', '6,9λ']), `敵の配置: ${es}`);
	ok(same(Object.keys(st.enemyDirs).sort(), ['2,2', '6,9']), 'enemyDirs が λ の位置と一致');
	// 着地 (8,4) の ±2 に敵なし
	for (const e of es) {
		const [r, c] = e.split(/[^\d,]/)[0].split(',').map(Number);
		ok(Math.max(Math.abs(r - 8), Math.abs(c - 4)) > 2, `着地 ±2 に敵 ${e}`);
	}
	// かがり火 C の四方は穴＝誰も C の隣に立てない（ロウソクが届かない）。はしごで穴1枚を渡った
	// 先は C 自身か穴＝着地できない。届くかどうかはソルバーの対照実験（下）で数で押さえる。
	for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
		ok(g[4 + dr][9 + dc] === 'x', `C の隣 (${4 + dr},${9 + dc}) は穴`);
	}
	// ソルバー：解ける／ロウソク無し・道具無し・壊せる壁を壁にすると解けない（飾りでない）
	ok(solveKeyRoom(AFTER), '全部の道具で鍵へ届かない（解なし）');
	ok(!solveKeyRoom(AFTER, { hasCandle: false }), 'ロウソク無しでも解けてしまう');
	ok(!solveKeyRoom(AFTER, { noTools: true }), '道具無しでも解けてしまう');
	const walled = AFTER.map((r) => r.replace(/!/g, '#'));
	ok(!solveKeyRoom(walled), '壊せる壁を壊さなくても解けてしまう（爆弾が飾り）');
	const noLine = AFTER.map((r, i) => (i === 4 ? r.slice(0, 6) + '#' + r.slice(7) : r));
	ok(!solveKeyRoom(noLine), 'B から C への直線を塞いでも解けてしまう（火渡しが飾り）');
	console.log('✔ 自己検証 OK（ソルバー＝解ける・ロウソク／道具／爆弾／火渡しのどれを欠いても解けない）');

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
