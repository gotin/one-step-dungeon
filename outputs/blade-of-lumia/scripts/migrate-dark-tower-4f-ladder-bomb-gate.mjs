// dark_tower 4F：配線の無い仕掛けの寄せ集めを「はしご＋爆弾」の複合関門に束ねる
// （2026-09-22 / PLAN 実行キュー 20b ④の 4F 分・設計は Opus）。
//
// ■ 何が壊れていたか（キュー20b の棚卸し⑯・DECISIONS 2026-09-21（8）で検算済み）
//   `4,2` は配線されていない仕掛けの寄せ集めだった：
//     H×2（かがり火・どの showConditions にも使われていない）
//     !×1（破壊壁 (2,4)・背後は普通の床＝壊しても何も無い）
//     row6 `#.xxx.v....#`＝穴3枚＋橋1枚＋**col5 が素通しの床**＝穴の帯として機能していない
//   （Y と switchToggles は20b ④の1F分で既に撤去済み＝キュー20b ⑨の comment 参照）。
//   対照実験（DECISIONS 2026-09-21（8））＝row6 を全幅の穴にすると 24/30 室（`4,3` 以降
//   6室が閉じる）→ はしごで 30/30 室。
//
// ■ 新しい機構（⑯の寄せ集めを1つの関門に束ねる）
//   row6 を全幅の穴 `x`×10 にする（3F の関門と同じ「幅1・両岸が床」のはしご渡り）。
//   渡った先（row7）に**床の爆弾の山 `'5'`**を置き、その先（row8）を破壊壁2枚
//   `!`(8,5)(8,6) で塞ぐ＝はしごで渡っただけでは南（`4,3` 以降）へ抜けられず、
//   爆弾も要る「複合関門」にする。旧・北側の破壊壁 (2,4)（背後が普通の床の飾り）と
//   配線の無い H×2 は撤去する。
//
//   成立する理由（すべて実装を裏取り済み）：
//   ・row5/row7 は全幅の床∴ row6 の全セルが `isLadderBridgeCell`（両岸が床）。
//   ・爆風は半径2の円（`ITEM_META.bomb.aoeRadius`）／`breakPower` 3 ≧ `breakDef` 1
//     ∴ (7,5) から (8,5)(8,6) はどちらも距離 ≦ 2＝1個で2枚とも砕ける。
//   ・爆弾の山は世界の2番目の供給源（1番目＝`dungeon_6 1,2` の宝箱・2番目＝
//     `dark_tower 2,1` の床の山＝キュー20b ④の2F分）。関門の**手前**（row7・row8の壁より
//     北）に置くのは2F分と同じ「消費品は関門の手前で必ず補給できる」不変条件
//     （DECISIONS 2026-09-22（1））をこの関門にも適用したもの。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・`4,2` の盤面／破壊壁が (8,5)(8,6) の2枚だけ＝旧 (2,4) が残っていない／かがり火が
//     0本／刻み文の本文／境界の開きが不変
//   ・**部屋単独の対照実験**（`blade-solver.mjs` で `4,2` だけを切り出して測る＝
//     2,1 も同じ '!' 文字を使うため、塔全体の BFS では「はしご無し」と「爆弾無し」を
//     この部屋だけに絞って区別できない）：
//       はしご無し＝南へ抜けられない（噴射の帯を渡れない）
//       はしごあり・爆弾封じ（noTools）＝爆弾の山までは届くが南へ抜けられない
//       はしごあり・爆弾あり＝南へ抜けられる
//   ・**塔全体の対照実験**（`followMapEnters` 付き BFS）：全ゲート開＝30/30 室
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-4f-ladder-bomb-gate.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-4f-ladder-bomb-gate.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const GATE_ROOM = '4,2';
const BOMBS = '7,5';
const WALLS = ['8,5', '8,6'];
const NORTH_IN = ['1,5', '1,6'];
const SOUTH_OUT = '9,5';

const GATE_TARGET = [
	'#####..#####',
	'#i.........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#xxxxxxxxxx#',
	'#....5.....#',
	'#####!!#####',
	'#####..#####',
];
// 直す前の盤面（この形でなければ止まる＝データの取り違え防止）
const GATE_BEFORE = [
	'#####..#####',
	'#..H...H...#',
	'#...!......#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#.xxx.v....#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

const GATE_SIGN = {
	name: '四層の刻み文 ―穴と壁―',
	lines: [
		'【四層の刻み文】',
		'穴を 越えて なお、壁が 立つ。',
		'火薬を 使えば 道は 開けよう。',
	],
};

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];
if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };
const rowsOf = (st) => st.tiles.map((r) => r.join(''));

// ──────────────────────────────────────────────────────────────────────
// ① `4,2`＝はしご＋爆弾の複合関門
// ──────────────────────────────────────────────────────────────────────
const gate = stages[GATE_ROOM];
ok(gate, `${GATE_ROOM} が無い`);
ok(Array.isArray(gate.tiles) && gate.tiles.every(Array.isArray),
	`${GATE_ROOM} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
ok(gate.rows === GATE_TARGET.length && gate.cols === GATE_TARGET[0].length,
	`${GATE_ROOM} の寸法が想定外: ${gate.rows}x${gate.cols}`);

const gateBeforeRows = rowsOf(gate);

if (gateBeforeRows.join('\n') === GATE_TARGET.join('\n')) {
	step('=', `${GATE_ROOM} の盤面は既に狙いどおり`);
} else {
	for (let r = 0; r < GATE_BEFORE.length; r++) {
		ok(gateBeforeRows[r] === GATE_BEFORE[r],
			`${GATE_ROOM} row${r} が旧盤面と違う: '${gateBeforeRows[r]}' 期待 '${GATE_BEFORE[r]}'`);
	}
	gate.tiles = GATE_TARGET.map((row) => [...row]);
	step('✔', `${GATE_ROOM} を作り替えた（配線の無い H×2 と背後が飾りの !(2,4) を撤去`
		+ `→ row6 を全幅の穴 x×10＋爆弾の山 '5'(${BOMBS})＋破壊壁2枚 !${WALLS.join('')}`
		+ `＋刻み文 'i'(1,1)）`);
}

{
	const want = Object.fromEntries(WALLS.map((k) => [k, { breakDef: 1 }]));
	const cur = gate.breakableWalls ?? {};
	if (JSON.stringify(cur) === JSON.stringify(want)) {
		step('=', `${GATE_ROOM} の breakableWalls は既に狙いどおり`);
	} else {
		gate.breakableWalls = want;
		step('✔', `${GATE_ROOM} の breakableWalls を張り替えた（旧: ${JSON.stringify(cur)}`
			+ `＝背後が普通の床の飾り）→ ${JSON.stringify(want)}`);
	}
}

{
	const sd = gate.signData ?? (gate.signData = {});
	if (JSON.stringify(sd['1,1']) === JSON.stringify(GATE_SIGN)) {
		step('=', `${GATE_ROOM} の刻み文は既に狙いどおり`);
	} else {
		ok(sd['1,1'] === undefined, `${GATE_ROOM} に既に別の看板が在る: ${JSON.stringify(sd['1,1'])}`);
		sd['1,1'] = { ...GATE_SIGN, lines: [...GATE_SIGN.lines] };
		step('✔', `${GATE_ROOM} に刻み文を足した（'i' タイルは本文が無いと無言看板になる）`);
	}
}

gate.comment = '[dark_tower 4,2] はしご＋爆弾の複合関門（キュー20b ④・2026-09-22）。row6 を穴 '
	+ 'x×10 の一本帯にし、渡った先（row7）の爆弾の山 5(7,5) を拾って、破壊壁 !(8,5)(8,6) を'
	+ '砕くと南（4,3以降）へ抜けられる。旧構成は H×2（配線無し）・!(2,4)（背後が普通の床の'
	+ '飾り）・row6 の col5 が素通しの床（穴の帯として機能していない）という寄せ集めだった'
	+ '（対照実験＝24/30→はしごで30/30・DECISIONS 2026-09-21（8））。爆弾は世界の2番目の'
	+ '供給源（1番目＝dungeon_6 1,2の宝箱・2番目＝dark_tower 2,1の床の山）＝関門の手前に'
	+ '置くのは2F分と同じ「消費品は関門の手前で必ず補給できる」不変条件（DECISIONS '
	+ '2026-09-22（1））をこの関門にも適用したもの。';

// ──────────────────────────────────────────────────────────────────────
// ② 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

{
	const rows = rowsOf(gate);
	check(`${GATE_ROOM} の盤面が狙いどおり`, rows.join('\n') === GATE_TARGET.join('\n'));
	check(`${GATE_ROOM} の row6 が穴10枚だけ（橋 'v' も飾りの床も残っていない）`,
		rows[6] === '#xxxxxxxxxx#');
	const [br, bc] = BOMBS.split(',').map(Number);
	check(`${GATE_ROOM} に爆弾の山 '5'(${BOMBS})`, gate.tiles[br][bc] === '5');
	const bangs = [];
	for (let r = 0; r < gate.rows; r++) {
		for (let c = 0; c < gate.cols; c++) if (gate.tiles[r][c] === '!') bangs.push(`${r},${c}`);
	}
	check(`${GATE_ROOM} の破壊壁が (8,5)(8,6) の2枚だけ（実測: ${bangs.join(' ')}）`,
		JSON.stringify(bangs) === JSON.stringify(WALLS));
	let torches = 0;
	for (let r = 0; r < gate.rows; r++) {
		for (let c = 0; c < gate.cols; c++) if (gate.tiles[r][c] === 'H') torches++;
	}
	check(`${GATE_ROOM} のかがり火が0本（配線の無い飾りを撤去済み・実測 ${torches}）`, torches === 0);
	check(`${GATE_ROOM} の刻み文が本文つき（無言看板でない）`,
		(gate.signData?.['1,1']?.lines?.length ?? 0) >= 2);
	check(`${GATE_ROOM} の 'i' タイルと看板の座標が一致`, gate.tiles[1][1] === 'i');
}

// breakableWalls の鍵が `!` を指し、値が `{breakDef}` の形（塔の全室・検査15と同じ観点）
{
	const badShape = [], badCell = [];
	for (const [k, s] of Object.entries(stages)) {
		for (const [cell, v] of Object.entries(s.breakableWalls ?? {})) {
			const [r, c] = cell.split(',').map(Number);
			if (typeof v !== 'object' || v === null) badShape.push(`${k}(${cell})`);
			if (s.tiles[r]?.[c] !== '!') badCell.push(`${k}(${cell})=${JSON.stringify(s.tiles[r]?.[c])}`);
		}
	}
	check(`塔の breakableWalls が全部 {breakDef} の形（違反: ${badShape.join(' ') || 'なし'}）`,
		badShape.length === 0);
	check(`塔の breakableWalls が全部 '!' を指す（違反: ${badCell.join(' ') || 'なし'}）`,
		badCell.length === 0);
}

// 境界の開き＝部屋間の接続を動かしていない
{
	const rows = rowsOf(gate);
	const sig = (() => {
		const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
		const s = [...rows[gate.rows - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
		const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
		const e = rows.map((r, i) => (r[gate.cols - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
		return `N[${n}] S[${s}] W[${w}] E[${e}]`;
	})();
	check(`${GATE_ROOM} の境界の開きが N[5,6] S[5,6] W[] E[]（実測: ${sig}）`,
		sig === 'N[5,6] S[5,6] W[] E[]');
}

// 部屋単独の対照実験（`!` は 2,1 も使う文字なので塔全体の BFS では区別できない＝
// この部屋だけを切り出したソルバーで「はしご」と「爆弾」を独立に測る）。
{
	const measureRoom = ({ withLadder = true, noTools = false, goal = SOUTH_OUT } = {}) => {
		const tiles = gate.tiles.map((r) => [...r]);
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		for (const [k, ch] of Object.entries(gate.bgTiles ?? {})) {
			const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
		}
		const breakDefs = {};
		for (const [k, v] of Object.entries(gate.breakableWalls ?? {})) breakDefs[k] = v.breakDef ?? 1;
		const S = makeSolver(tiles, bg, [], breakDefs, new Set(),
			{ hasLadder: withLadder, pitCrossable: true, noTools });
		const starts = NORTH_IN.map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const [gr, gc] = goal.split(',').map(Number);
		return measureMetrics(S, starts, (state) => state.split('|')[0] === goal,
			(state) => {
				const [pr, pc] = state.split('|')[0].split(',').map(Number);
				return Math.abs(pr - gr) + Math.abs(pc - gc);
			},
			{ guardMax: 2_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) });
	};

	const full = measureRoom();
	check(`${GATE_ROOM}（はしご＋爆弾あり）で南の出口へ届く`, full.L !== null);
	check(`${GATE_ROOM} は入って詰む状態が無い`, full.noEscape === 0);
	check(`${GATE_ROOM} ははしごが無いと南へ抜けられない`,
		measureRoom({ withLadder: false }).L === null);
	check(`${GATE_ROOM} ははしごがあっても爆弾（道具）が無いと南へ抜けられない`,
		measureRoom({ noTools: true }).L === null);
	check(`${GATE_ROOM} ははしごがあれば爆弾なしでも山 ${BOMBS} には届く`,
		measureRoom({ noTools: true, goal: BOMBS }).L !== null);
}

// 塔全体の対照実験：全ゲート開＝30室すべてに到達する
{
	const START = { stage: '0,1', row: 5, col: 5 };
	const withAll = bfsLayer(stages, START, {
		withLadder: true, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const rooms = new Set([...withAll.reachedCells].map((k) => k.split(':')[0]));
	check(`全ゲート開＝塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${rooms.size}）`,
		rooms.size === Object.keys(stages).length);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 4F：はしご＋爆弾の複合関門にする（キュー20b ④ 4F分）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${GATE_ROOM}）`);
gate.tiles.forEach((row, i) => {
	const now = row.join('');
	console.log(`   ${String(i).padStart(2)} ${gateBeforeRows[i]}   ${gateBeforeRows[i] === now ? '=' : '→'}   ${now}`);
});

console.log('\n## 検証');
let ng = 0;
for (const [cond, msg] of verify) {
	console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
	if (!cond) ng++;
}
if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
	console.log('\n書き込み完了:', MAP_PATH);
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_ladder=1&ps_bomb=1';
	const url = (stage, row, col) => `  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(GATE_ROOM, 1, 5));
	console.log('   刻み文(1,1)を読む → row6 の穴帯をはしごで渡る → 爆弾の山(7,5)を拾う');
	console.log('   → 罅割れた壁 !(8,5)(8,6) の手前で爆弾を置く → 砕けて南へ抜ける');
}
