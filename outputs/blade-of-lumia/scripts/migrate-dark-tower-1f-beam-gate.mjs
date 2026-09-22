// dark_tower 1F `1,1`：飾りだったスイッチを「遠隔攻撃の関門」に作り直す
// （2026-09-21 / PLAN 実行キュー 20b ④の 1F 分・設計は Opus）。
//
// ■ 何が壊れていたか（ユーザー指摘＝「スイッチあってもなんの意味ないよね？」）
//   旧盤面：
//      4 #####T.#####     ← 門 T(4,5) の**東隣 (4,6) が素の床**
//      5 #####T.#####     ← 門 T(5,5) の**東隣 (5,6) が素の床**
//      7 #.......Y..#     ← スイッチ Y(7,8)
//   ・門が縦に並んでいる＝本道の col6 を1枚も塞いでいない。門を無視して素通りできた。
//   ・`links: []`＝`Y` はどこにも配線されていない。叩いても何も起きない飾り。
//     （ステージに `switchToggles:{"7,9":["4,5","5,5"]}` という「配線に見えるフィールド」が
//       在ったが、エンジンはステージの switchToggles を読まない＝実行時の `ss.switchToggles`
//       とは別物。しかも指す `7,9` は空の床で、本物の `Y` は `(7,8)`＝座標まで嘘だった。）
//   ・`Y` は南半分に在り、南半分は南の入口から歩いて入れた＝隔離もされていなかった。
//
// ■ 新しい機構（ユーザー設計・2026-09-21）
//   「縦に並んでるゲートを横に並べてそのままだと下にいけないようにして、左右に走る真ん中の
//     壁の代わりに穴にして、スイッチを矢か剣ビームでうって通れるようにする」
//      4 #xxxxTTxxxx#   ← 門を**横並び**にして本道 col5・col6 の両方を塞ぐ
//      5 #xxxx..xxxx#   ← 左右に走っていた壁を**穴の帯**に置き換える（本道の2マスだけ床）
//      7 #.......Y..#   ← Y(7,8) は穴の向こう＝歩いて触れない
//   `links: [{7,8 → 4,5}, {7,8 → 4,6}]`＝1つの座で門2枚を同時に開ける。
//
//   成立する理由（すべて実装を裏取り済み）：
//   ・穴 `x` は徒歩不通（`game/passable.js:249`）。落下機構は無い＝踏めないだけ。
//   ・はしごで渡れるのは**1セル幅**の水/穴だけ（`isLadderBridgeCell`）。この帯は
//     本道の外では row4・row5 の**2行**＝どの向きでも幅2∴はしごでは渡れない。
//   ・翼の羽衣が越えられるのは SKY/WATER/TREE/BUSH/FENCE＝**穴は飛べない**。
//   ・矢と剣ビームは**どちらも** `Y` を叩く（`game/projectile.js:637` が
//     `type === 'arrow' || type === 'beam'` を許す）。投擲物は穴の上を飛ぶ
//     （`isTilePassableForProj` が止めるのは壁と未破壊の `!` だけ）。
//   ・剣ビームは溜め攻撃（`game/charge.js`）＝弾切れも HP 条件も無い∴矢を切らしても詰まない。
//   ∴ 関門の不変条件は「**遠隔攻撃が無いと開かない**（近接だけでは通れない）」。
//     ⚠️ 「弓が必須」ではない：この塔に着く時点でプレイヤーは必ず剣を持ち、剣ビームで開ける。
//     弓そのものの卒業試験は D3 `1,0`（水で完全隔離＝剣ビームでも届かない立ち位置）が担う。
//
// ■ 石碑（signData `2,1`）も書き換える
//   旧「東の 座を 叩けば 石の 門が 開く。」は、歩いて叩けると誤読させる。
//   穴の向こうへ射ることを示す文へ差し替える（`Y` は col8＝東のまま∴「東の座」は据え置き）。
//
// ■ 同型の幽霊データを塔から全部消す（[[blade-bad-data-fix-five-layers]]）
//   `4,2` にも `switchToggles:{"7,9":["6,2","6,3","6,4"]}` が在った。指す `6,2〜6,4` は
//   門ではなく**穴**＝門の配線として成立しない。`4,2` の `Y(7,8)` も配線先が無い飾り∴
//   **スイッチごと外す**（4F に遠隔機構を置くなら実行キュー 20b ⑤で改めて設計する。
//   直したばかりの defect をもう1部屋に残したままにはしない）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・`1,1` の盤面が狙いどおり／`links` が 2 本／`Y` が `(7,8)`／門が `T`
//   ・塔のどのステージにも幽霊フィールド `switchToggles` が無い
//   ・**対照実験**：門が閉じている間、北の入口から歩いて
//       南半分 (7,8) にも 南の出口 (9,5)(9,6) にも**到達できない**
//       （はしごを持っていても到達できない＝はしごで迂回されない）
//     門が開けば両方に到達できる＝門が本当に必須
//   ・**射線の実測**：門が閉じた状態で到達できるセルのうち、直線で `Y(7,8)` を
//     撃ち抜けるセルが 1 つ以上在る（無ければ永久に開かない関門＝詰み）
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-1f-beam-gate.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-1f-beam-gate.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const ROOM = '1,1';
const GHOST_ROOM = '4,2';
const SWITCH = '7,8';
const GATES = ['4,5', '4,6'];

// 狙いの盤面（`.` 床 / `#` 壁 / `x` 穴 / `T` 門 / `Y` スイッチ / `i` 石碑）
const TARGET = [
	'#####..#####',
	'#..........#',
	'#i.........#',
	'#..........#',
	'#xxxxTTxxxx#',
	'#xxxx..xxxx#',
	'#..........#',
	'#.......Y..#',
	'#..........#',
	'#####..#####',
];

const SIGN_LINES = [
	'【一層の刻み文】',
	'石の 門の 前は 深い 穴。',
	'東の 座には 歩いて 近づけぬ。',
	'遠矢か 光の 刃を 放ち 射抜け。',
];

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];
if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };

// ──────────────────────────────────────────────────────────────────────
// ① `1,1` の盤面・配線・石碑
// ──────────────────────────────────────────────────────────────────────
const st = stages[ROOM];
ok(st, `${ROOM} が無い`);
ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray),
	`${ROOM} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
ok(st.rows === TARGET.length && st.cols === TARGET[0].length,
	`${ROOM} の寸法が想定外: ${st.rows}x${st.cols}`);

const beforeRows = st.tiles.map((r) => r.join(''));

if (beforeRows.join('\n') === TARGET.join('\n')) {
	step('=', `${ROOM} の盤面は既に狙いどおり`);
} else {
	// 触るのは row4 / row5 だけ＝それ以外の行が想定と違ったら止まる（データの取り違え防止）
	for (let r = 0; r < TARGET.length; r++) {
		if (r === 4 || r === 5) continue;
		ok(beforeRows[r] === TARGET[r],
			`${ROOM} row${r} が想定と違う（触らない行）: '${beforeRows[r]}' 期待 '${TARGET[r]}'`);
	}
	ok(beforeRows[4] === '#####T.#####', `${ROOM} row4 が旧盤面と違う: '${beforeRows[4]}'`);
	ok(beforeRows[5] === '#####T.#####', `${ROOM} row5 が旧盤面と違う: '${beforeRows[5]}'`);
	st.tiles[4] = [...TARGET[4]];
	st.tiles[5] = [...TARGET[5]];
	step('✔', `${ROOM} の縦並び門→横並び門＋左右の壁→穴の帯（row4 row5 を置換）`);
}

{
	const want = GATES.map((g) => ({ switchId: SWITCH, gateId: g }));
	const cur = Array.isArray(st.links) ? st.links : [];
	if (JSON.stringify(cur) === JSON.stringify(want)) step('=', `${ROOM} の links は既に狙いどおり`);
	else {
		ok(cur.length === 0, `${ROOM} の links に既に何か入っている: ${JSON.stringify(cur)}`);
		st.links = want;
		step('✔', `${ROOM} の links を張った: Y(${SWITCH}) → T(${GATES.join(') T(')})`);
	}
}

if (st.switchToggles === undefined) step('=', `${ROOM} に幽霊フィールドは無い`);
else {
	const ghost = JSON.stringify(st.switchToggles);
	delete st.switchToggles;
	step('✔', `${ROOM} の幽霊フィールド switchToggles を削除: ${ghost}`
		+ '（エンジンはステージの switchToggles を読まない）');
}

{
	const sd = st.signData?.['2,1'];
	ok(sd, `${ROOM} の石碑 signData['2,1'] が無い`);
	if (JSON.stringify(sd.lines) === JSON.stringify(SIGN_LINES)) step('=', `${ROOM} の石碑は既に新文`);
	else {
		ok(Array.isArray(sd.lines) && sd.lines[0] === '【一層の刻み文】',
			`${ROOM} の石碑が想定と違う: ${JSON.stringify(sd.lines)}`);
		const old = JSON.stringify(sd.lines);
		sd.lines = [...SIGN_LINES];
		step('✔', `${ROOM} の石碑を書き換えた（旧: ${old}）`);
	}
}

st.comment = '[dark_tower 1,1] 遠隔攻撃の関門（キュー20b ④・2026-09-21）。横並びの門'
	+ ' T(4,5)(4,6) が本道 col5/col6 を塞ぎ、左右は穴の帯（row4・row5 の2行＝幅2∴はしごで'
	+ '渡れない・穴は飛行でも越えられない）。座 Y(7,8) は穴の向こう＝歩いては触れない∴'
	+ '矢か剣ビームで撃って links の 2 本で門を開ける。剣ビームは弾切れしない（溜め攻撃）'
	+ '∴矢を切らしても詰まない＝関門の不変条件は「遠隔攻撃が必須」で「弓が必須」ではない'
	+ '（弓の卒業試験は D3 1,0 が担う）。旧構成は門が縦並びで col6 が素通りでき、'
	+ 'links も空＝座が完全な飾りだった。';

// ──────────────────────────────────────────────────────────────────────
// ② `4,2` の同型の幽霊データとスイッチを外す
// ──────────────────────────────────────────────────────────────────────
{
	const g = stages[GHOST_ROOM];
	ok(g, `${GHOST_ROOM} が無い`);
	if (g.switchToggles === undefined) step('=', `${GHOST_ROOM} に幽霊フィールドは無い`);
	else {
		const ghost = JSON.stringify(g.switchToggles);
		delete g.switchToggles;
		step('✔', `${GHOST_ROOM} の幽霊フィールド switchToggles を削除: ${ghost}`
			+ '（指す 6,2〜6,4 は門ではなく穴＝配線として成立しない）');
	}
	if (g.tiles[7][8] === 'Y') {
		g.tiles[7][8] = '.';
		step('✔', `${GHOST_ROOM} の飾りスイッチ Y(7,8) を外した（開く門が存在しない）`);
		g.comment = '[dark_tower 4,2] キュー20b ④（2026-09-21）で、配線先の無い飾りスイッチ'
			+ ' Y(7,8) と幽霊フィールド switchToggles を撤去した（指していた 6,2〜6,4 は門では'
			+ 'なく穴）。4F に遠隔機構を置くならキュー20b ⑤で改めて設計する。';
	} else step('=', `${GHOST_ROOM} に飾りスイッチは無い`);
}

// ──────────────────────────────────────────────────────────────────────
// ③ 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

{
	const rows = st.tiles.map((r) => r.join(''));
	check(`${ROOM} の盤面が狙いどおり`, rows.join('\n') === TARGET.join('\n'));
	check(`${ROOM} の Y が (${SWITCH})`, st.tiles[7][8] === 'Y');
	check(`${ROOM} の門が T(${GATES.join(') T(')})`, GATES.every((g) => {
		const [r, c] = g.split(',').map(Number);
		return st.tiles[r][c] === 'T';
	}));
	check(`${ROOM} の links が 2 本・すべて Y(${SWITCH}) 起点`,
		Array.isArray(st.links) && st.links.length === 2
		&& st.links.every((l) => l.switchId === SWITCH && GATES.includes(l.gateId)));
	check(`${ROOM} の石碑が新文（4行）`,
		JSON.stringify(st.signData?.['2,1']?.lines) === JSON.stringify(SIGN_LINES));
}

{
	const ghosts = Object.entries(stages).filter(([, s]) => s.switchToggles !== undefined).map(([k]) => k);
	check(`塔に幽霊フィールド switchToggles が無い（残り: ${ghosts.join(' ') || 'なし'}）`, ghosts.length === 0);
	// 飾りスイッチ（links にも showConditions(switchOn) にも載っていない Y）がゼロ
	const dead = [];
	for (const [k, s] of Object.entries(stages)) {
		const wired = new Set((Array.isArray(s.links) ? s.links : []).map((l) => l.switchId));
		for (const cond of Object.values(s.showConditions ?? {})) {
			if (cond?.trigger === 'switchOn' && cond.switchId) wired.add(String(cond.switchId));
		}
		for (let r = 0; r < s.rows; r++) {
			for (let c = 0; c < s.cols; c++) {
				if (s.tiles[r]?.[c] === 'Y' && !wired.has(`${r},${c}`)) dead.push(`${k}(${r},${c})`);
			}
		}
	}
	check(`塔に飾りスイッチが無い（残り: ${dead.join(' ') || 'なし'}）`, dead.length === 0);
}

// 対照実験：門の開閉で「南半分に歩いて行けるか」が変わる＝門が本当に必須
// ⚠️ 未知の文字を通行可と誤解しないため、判定は connectivity.mjs の BFS に委ねる
//    （[[blade-control-experiment-needs-tile-wall]] と同じ理由＝自前の壁リストは嘘をつく）。
{
	const only = { [ROOM]: st };            // 1 部屋だけを取り出して室内の歩行だけを測る
	const START = [1, 5];                   // 北の入口 (0,5) から入った直後の室内セル
	// ⚠️ 測る先に `Y(7,8)` そのものを混ぜない：connectivity.mjs は 'Y' を HARD_BLOCKED に
	//    入れている（engine の passable.js は 'Y' を素通しする＝lib の方が厳しい）ため、
	//    Y セルは門を開けても「未到達」と出る＝閉状態の検査が無条件で緑になる歯なし検査になる。
	//    代わりに Y の隣接床と南の出口で南半分の到達性を測る。
	const SOUTH = ['6,8', '7,7', '8,8', '9,5', '9,6'];
	const run = (opts) => {
		const res = bfsLayer(only, { stage: ROOM, row: START[0], col: START[1] }, opts);
		return (p) => res.reachedCells.has(`${ROOM}:${p}`);
	};
	const closedNoLadder = run({});
	const closedLadder = run({ withLadder: true });
	const opened = run({ openTiles: new Set(['T']), withLadder: true });

	const leakA = SOUTH.filter(closedNoLadder);
	const leakB = SOUTH.filter(closedLadder);
	const gotC = SOUTH.filter(opened);
	check(`門が閉じている間、北から南半分へ歩いて行けない（漏れ: ${leakA.join(' ') || 'なし'}）`, leakA.length === 0);
	check(`はしごを持っていても迂回できない（漏れ: ${leakB.join(' ') || 'なし'}）`, leakB.length === 0);
	check(`門が開けば南半分へ通れる（到達: ${gotC.join(' ')}）`, gotC.length === SOUTH.length);
	check('北の入口セル (1,5) 自体は歩ける', closedNoLadder('1,5'));
}

// 射線の実測：門が閉じている間に立てるセルから、直線で Y(7,8) を撃ち抜けるか
// （投擲物が止まるのは壁と未破壊の破壊壁だけ＝穴・門・床は通り抜ける）
{
	const only = { [ROOM]: st };
	const res = bfsLayer(only, { stage: ROOM, row: 1, col: 5 }, {});
	const stop = (ch) => ch === '#' || ch === '!';
	const shooters = [];
	for (const ck of res.reachedCells) {
		const [r, c] = ck.split(':')[1].split(',').map(Number);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			let rr = r + dr, cc = c + dc;
			while (rr >= 0 && cc >= 0 && rr < st.rows && cc < st.cols) {
				const ch = st.tiles[rr][cc];
				if (ch === 'Y' && `${rr},${cc}` === SWITCH) { shooters.push(`${r},${c}`); break; }
				if (stop(ch)) break;
				rr += dr; cc += dc;
			}
		}
	}
	const uniq = [...new Set(shooters)].sort();
	check(`門が閉じた状態で Y(${SWITCH}) を撃ち抜ける立ち位置が在る（${uniq.length}箇所: ${uniq.join(' ')}）`,
		uniq.length > 0);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：飾りスイッチを遠隔攻撃の関門に作り直す（キュー20b ④ 1F分）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${ROOM}）`);
st.tiles.forEach((row, i) => {
	const now = row.join('');
	console.log(`   ${String(i).padStart(2)} ${beforeRows[i]}   ${beforeRows[i] === now ? '=' : '→'}   ${now}`);
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
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_bow=1&ps_ladder=1&ps_wingrobe=1';
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(`  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${ROOM}&row=2&col=8&${GEAR}`);
	console.log('  石碑(2,1)を読む → 穴の帯で南へ行けないことを確かめる → col8 で南を向いて');
	console.log('  攻撃ボタン長押し（剣ビーム）か矢 → Y(7,8) が光り門 T(4,5)(4,6) が開く → 南へ抜ける');
}
