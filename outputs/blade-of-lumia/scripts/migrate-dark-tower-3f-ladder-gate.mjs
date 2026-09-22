// dark_tower 3F：飾りだった橋を撤去して「はしごの関門」に作り直す
// （2026-09-22 / PLAN 実行キュー 20b ④の 3F 分・設計は Opus）。
//
// ■ 何が壊れていたか（キュー20b の棚卸し⑮・DECISIONS 2026-09-21（8）で検算済み）
//   `3,1` の row6 は `#xxvxxxxxxx#`＝穴10枚の中に橋 `v`（TILE.BRIDGE＝常時通行可）が
//   1枚在り、これがはしご不要の抜け道になっていた。対照実験（`.scratch/20b-tool-necessity.mjs`）＝
//   橋を穴に戻すと 18/30 室（`3,2` 以降12室が閉じる）→ はしごを持つと 30/30 室。
//   ∴ 橋を1マス消すだけで「はしごが無いと3F以降へ進めない」正しい関門になる。
//
// ■ 新しい機構
//   `(6,3)` の橋 `v` を穴 `x` に戻す（=旧・最初の姿へ）。row5/row7 は既に全幅の床
//   ∴ row6 の全セルが `isLadderBridgeCell`（両岸が床）の条件を満たし、はしごで渡れる
//   「正解のある関門」になる（[[blade-speed-up-needs-interpolation]] とは無関係・幅1の
//   穴限定のはしご機構）。
//   刻み文（'i' タイル）を (1,1) に置き、他の湖・沼・雪原の「飛び石」看板と同じ文法
//   （「一歩届かぬ／はしごを渡す力あらば越えられよう」）に合わせる。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・`3,1` の盤面／`v` が塔から1枚も無い／刻み文の本文
//   ・境界の開きが不変（部屋間の接続を動かさない）
//   ・**対照実験**（塔の入口から `followMapEnters` 付き BFS）：
//       はしごなし＝3,1 の南半分（row6 以降）にも 3,2 以降にも到達しない
//       はしごあり＝30 室すべてに到達する
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-3f-ladder-gate.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-3f-ladder-gate.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const GATE_ROOM = '3,1';
const BRIDGE_CELL = '6,3';

const GATE_TARGET = [
	'#####..#####',
	'#i.........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#xxxxxxxxxx#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
// 直す前の盤面（この形でなければ止まる＝データの取り違え防止）
const GATE_BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#xxvxxxxxxx#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

const GATE_SIGN = {
	name: '三層の刻み文 ―穴―',
	lines: [
		'【三層の刻み文】',
		'床は 崩れ、深い 穴に 落ちた。',
		'はしごを 渡す 力あらば 越えられよう。',
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
// ① `3,1`＝橋を穴に戻す＋刻み文
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
	step('✔', `${GATE_ROOM} を作り替えた（橋 'v'(${BRIDGE_CELL}) を穴 'x' に戻す`
		+ `＋刻み文 'i'(1,1)）`);
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

gate.comment = '[dark_tower 3,1] はしごの関門（キュー20b ④・2026-09-22）。row6 を穴 x×10 の'
	+ '一本帯にし、はしごが無いと 3,2 以降（4F/5F を含む）へ進めない。row5/row7 が全幅の床'
	+ '∴ row6 の全セルが isLadderBridgeCell（両岸が床）＝はしごで渡れる。旧構成は (6,3) に'
	+ '常時通行可の橋 v が1枚残っていて、はしご無しで素通しだった（対照実験＝18/30→30/30・'
	+ 'DECISIONS 2026-09-21（8））。';

// ──────────────────────────────────────────────────────────────────────
// ② 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

{
	const rows = rowsOf(gate);
	check(`${GATE_ROOM} の盤面が狙いどおり`, rows.join('\n') === GATE_TARGET.join('\n'));
	check(`${GATE_ROOM} の row6 が穴10枚だけ（橋 'v' が残っていない）`,
		rows[6] === '#xxxxxxxxxx#');
	check(`${GATE_ROOM} の刻み文が本文つき（無言看板でない）`,
		(gate.signData?.['1,1']?.lines?.length ?? 0) >= 2);
	check(`${GATE_ROOM} の 'i' タイルと看板の座標が一致`, gate.tiles[1][1] === 'i');
}

// ⚠️ 4,2 にも同型の橋（row6 (6,6)）が残っているが、これは 20b ⑤（4F の作り替え）の
//    対象＝この番のスコープ外なので、ここでは 3,1 だけを見る（上の row6 検証で済んでいる）。

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

// 対照実験：塔の入口から歩いて（階段ワープは辿る）どこまで行けるか
// ⚠️ 判定は connectivity.mjs の BFS に委ねる（自前の壁リストは嘘をつく＝
//    [[blade-control-experiment-needs-tile-wall]] と同じ理由）。
{
	const START = { stage: '0,1', row: 5, col: 5 };   // field から着く塔の入口
	const run = (withLadder) => bfsLayer(stages, START, {
		withLadder, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const noLadder = run(false);
	const withLadder = run(true);
	const roomsOf = (res) => new Set([...res.reachedCells].map((k) => k.split(':')[0]));
	const a = roomsOf(noLadder), b = roomsOf(withLadder);

	const BEFORE_GATE = [
		'0,1', '0,2', '0,3', '0,4',                       // B1F
		'1,0', '1,1', '1,2', '1,3', '1,4', '1,5',          // 1F
		'2,0', '2,1', '2,2', '2,3', '2,4', '2,5',          // 2F
		'3,0',                                             // 3F 入口
	];
	const BEYOND = Object.keys(stages).filter((k) => k !== GATE_ROOM && !BEFORE_GATE.includes(k));
	const leak = BEYOND.filter((k) => a.has(k));
	check(`はしごが無いと関門の先（${BEYOND.length}室）へ行けない（漏れ: ${leak.join(' ') || 'なし'}）`,
		leak.length === 0);
	check(`はしごが無いと ${GATE_ROOM} の南半分（row6 以降）に届かない`,
		!noLadder.reachedCells.has(`${GATE_ROOM}:7,5`) && !noLadder.reachedCells.has(`${GATE_ROOM}:9,5`));
	check(`はしごがあれば塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${b.size}）`,
		b.size === Object.keys(stages).length);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 3F：橋を穴に戻してはしごの関門にする（キュー20b ④ 3F分）`);
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
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_ladder=1';
	const url = (stage, row, col) => `  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(GATE_ROOM, 1, 5));
	console.log('   刻み文(1,1)を読む → row6 の穴帯へ向かう → はしごを使って渡る → 南へ抜ける');
}
