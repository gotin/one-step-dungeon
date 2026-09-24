// dark_tower 4F：石の間の案内を `4,1` から `4,2` の南端へ移設する
// （2026-09-23 / ユーザー指摘）。
//
// ■ 何がおかしかったか
//   `4,1`(1,1) の刻み文が「**この上は** 石の 間。…」と書いていた。しかし 4F の歩行接続は
//   実測で `4,1`（階段の着地）→ **南** → `4,2`（穴＋爆破壁）→ **南** → `4,3`（石の間）
//   → **南** → `4,4`（宝箱＋玉座への階段）＝石の間はプレイヤーから見て **下（先）**。
//   「この上は」は方向が逆だった（2026-08 の対話帯の移行で書いた当時の書き損じ）。
//
//   方向よりも重いのが**置き場所**：石の間の詰み回復は `4,3` の
//   `fluteEffect {type:'resetStones'}` ＝**その部屋の中で笛を吹かないと効かない**。
//   なのに「手が 詰まったら 笛を 吹け」の一文が **2室手前**にあり、間に `4,2` の
//   はしご＋爆弾の関門を1つ挟む∴詰まった時には読んだことを忘れている。
//
// ■ どう直したか
//   刻み文を `4,1` から**消して**（'i' と signData の両方＝片方だけ残すと無言看板／
//   死にデータ。[[blade-sign-two-formats]]）、`4,2` の**南端 row7**＝石の間へ抜ける
//   爆破壁 (8,5)(8,6) の手前に「**この先は** 石の 間。…」として置き直した。
//   看板の総数は増えない∴キュー20c（塔の看板9枚の見直し）の方針と逆行しない。
//
//   ⚠️ 置き場所を row7 の**西端 (7,1)** にした理由＝`'i'` は**通行不可**
//   （`game/passable.js:264`。`TILE_META` の `passable:true` は見かけだけ）∴廊下の
//   途中に置くと row7 の東西移動を分断する（(7,7) に置くと東側 3 マスへはしご無しで
//   行けなくなる）。端なら分断が起きず、失うのは穴 (6,1) の「橋」1列だけ
//   （`isLadderBridgeCell` は両岸が床の幅1の穴しか橋に数えない）＝残り9列で渡れる。
//   既存の刻み文 (1,1) と同じ西端の列に揃う。
//
//   ⚠️ `4,3`（石の間）の中には置けない＝倉庫番は1升変えると解が変わるうえ、床は
//   すべて石の動線（2026-08 の移行スクリプトにも「4,3 は 1 升も触らない」と書いてある）。
//   ∴「石の間の1室手前」が最も近い置き場所。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・`4,1` に看板タイルも signData も残っていない（無言看板・死にデータを作らない）
//   ・`4,2` の新しい刻み文が本文つきで在り、「この先」を含み「この上」を含まない
//   ・既存の作り込みが不変＝`4,1` の敵 row2 と階段 (6,4)／`4,2` の床の爆弾 (7,5)・
//     爆破壁 (8,5)(8,6)・刻み文 (1,1)／両室の境界の開き
//   ・看板に隣接して立てる床が在る（＝読める）
//   ・穴 row6 を渡れる列が残っている／はしごありで 4F の4室と塔30室に到達する
//   ・塔の非ボス脅威度が ⑤-a の 858.0 から動いていない（盤面を壊していない）
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-4f-stone-room-sign.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-4f-stone-room-sign.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer, isLadderBridgeCell } from './lib/connectivity.mjs';
import { ENEMY_META } from '../shared/enemies.js';
import { THREAT_OF } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const FROM_ROOM = '4,1';
const FROM_CELL = '1,1';
const TO_ROOM = '4,2';
const TO_CELL = '7,1';
const TOWER_THREAT = 858;   // ⑤-a の実測（この番で動かしてはいけない）

// 移設する前の `4,1` の刻み文（これと違う文が入っていたら止まる＝取り違え防止）
const OLD_SIGN = {
	name: '四層の刻み文',
	lines: [
		'【四層の刻み文】',
		'この上は 石の 間。四つの 石を 座に 据えねば 扉は 動かぬ。',
		'手が 詰まったら 笛を 吹け。石は 元へ 還る。',
	],
};

// 移設後の刻み文（方向を「この先」に直し、名前で置き場所が分かるようにした）
const NEW_SIGN = {
	name: '四層の刻み文 ―石の間の前―',
	lines: [
		'【四層の刻み文】',
		'この先は 石の 間。四つの 石を 座に 据えねば 扉は 動かぬ。',
		'手が 詰まったら 笛を 吹け。石は 元へ 還る。',
	],
};

const FROM_ROW1_BEFORE = '#i.........#';
const FROM_ROW1_AFTER = '#..........#';
const TO_ROW7_BEFORE = '#....5.....#';
const TO_ROW7_AFTER = '#i...5.....#';

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`レイヤー ${LAYER} が無い`);

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };
const rowsOf = (st) => st.tiles.map((r) => r.join(''));

const from = stages[FROM_ROOM];
const to = stages[TO_ROOM];
ok(from && to, `${FROM_ROOM} / ${TO_ROOM} が無い`);
for (const [key, st] of [[FROM_ROOM, from], [TO_ROOM, to]]) {
	ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray),
		`${key} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
}

const beforeRows = { [FROM_ROOM]: rowsOf(from), [TO_ROOM]: rowsOf(to) };

// ──────────────────────────────────────────────────────────────────────
// ① `4,1` から外す
// ──────────────────────────────────────────────────────────────────────
{
	const now = rowsOf(from)[1];
	if (now === FROM_ROW1_AFTER) {
		step('=', `${FROM_ROOM} の看板タイルは既に外れている`);
	} else {
		ok(now === FROM_ROW1_BEFORE, `${FROM_ROOM} row1 が想定外: '${now}'`);
		from.tiles[1] = [...FROM_ROW1_AFTER];
		step('✔', `${FROM_ROOM} (${FROM_CELL}) の看板タイルを床に戻した`);
	}

	const sd = from.signData ?? (from.signData = {});
	if (!sd[FROM_CELL]) {
		step('=', `${FROM_ROOM} の signData は既に外れている`);
	} else {
		ok(JSON.stringify(sd[FROM_CELL]) === JSON.stringify(OLD_SIGN),
			`${FROM_ROOM} の刻み文が想定外の文になっている: ${JSON.stringify(sd[FROM_CELL])}`);
		delete sd[FROM_CELL];
		step('✔', `${FROM_ROOM} の signData['${FROM_CELL}'] を削除した`);
	}
}

// ──────────────────────────────────────────────────────────────────────
// ② `4,2` の南端へ置く
// ──────────────────────────────────────────────────────────────────────
{
	const now = rowsOf(to)[7];
	if (now === TO_ROW7_AFTER) {
		step('=', `${TO_ROOM} の看板タイルは既に在る`);
	} else {
		ok(now === TO_ROW7_BEFORE, `${TO_ROOM} row7 が想定外: '${now}'`);
		to.tiles[7] = [...TO_ROW7_AFTER];
		step('✔', `${TO_ROOM} (${TO_CELL}) に看板タイルを置いた`);
	}

	const sd = to.signData ?? (to.signData = {});
	if (JSON.stringify(sd[TO_CELL]) === JSON.stringify(NEW_SIGN)) {
		step('=', `${TO_ROOM} の刻み文は既に狙いどおり`);
	} else {
		ok(!sd[TO_CELL], `${TO_ROOM} (${TO_CELL}) に既に別の刻み文が在る: ${JSON.stringify(sd[TO_CELL])}`);
		sd[TO_CELL] = JSON.parse(JSON.stringify(NEW_SIGN));
		step('✔', `${TO_ROOM} に刻み文を置いた（「この上は」→「この先は」）`);
	}
}

// 部屋のコメントを最新化（失効した記述を残さない＝WORKFLOW Step 4-3）
from.comment = '[dark_tower 4,1] 4F の実戦（キュー20b ⑤-a・2026-09-23）。無人だった 4F'
	+ '（パトロール E×2＝8.0 だけ）に剣獣 μ(2,6)＋盾騎士 ζ(2,3) を置いた＝脅威度 81.0。'
	+ 'ζ は speed 0.25 で遅く単体だと走り抜けられる∴speed 0.85 の μ を混ぜて「避けられない」'
	+ '実戦にした。階段の着地セル (6,4) の周りは空けている（棚卸し⑪＝階段と強敵を同室にする'
	+ 'なら着地直後に囲まれない配置にする）。'
	+ '⚠️ 刻み文 i(1,1) は 2026-09-23 に `4,2` (7,1) へ移設した'
	+ '（「この上は 石の 間」＝方向が逆／石の間の詰み回復（笛）の案内が2室手前にあった）。';
to.comment = '[dark_tower 4,2] 4F の関門＝はしごで穴 row6 を渡り、爆弾で壁 (8,5)(8,6) を'
	+ '壊して石の間 `4,3` へ抜ける。床の爆弾 5(7,5) は関門の手前の供給（TILE.ITEM_BOMB）。'
	+ '⚠️ 刻み文が2枚＝(1,1) は「穴と壁」＝この部屋の関門の案内、(7,1) は'
	+ '「この先は 石の 間」＝次の間の予告と詰み回復（笛）の案内（2026-09-23 に `4,1` から移設）。'
	+ "'i' は通行不可∴廊下 row7 の途中に置くと東西が分断される＝端 (7,1) に置いている。";

// ──────────────────────────────────────────────────────────────────────
// ③ 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
const check = (msg, cond) => verify.push([cond, msg]);

const openingSig = (st) => {
	const rows = rowsOf(st);
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[st.rows - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[st.cols - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
};

// 移設そのもの
check(`${FROM_ROOM} に看板タイルが1枚も無い`, !rowsOf(from).some((r) => r.includes('i')));
check(`${FROM_ROOM} の signData が空＝死にデータを残していない`,
	Object.keys(from.signData ?? {}).length === 0);
check(`${TO_ROOM} (${TO_CELL}) が看板タイル`, to.tiles[7][1] === 'i');
check(`${TO_ROOM} の新しい刻み文が本文つき（${NEW_SIGN.lines.length} 行）`,
	(to.signData?.[TO_CELL]?.lines?.length ?? 0) >= 2);
{
	const body = (to.signData?.[TO_CELL]?.lines ?? []).join('');
	check('新しい刻み文が「この先」を含む＝進む向きが正しい', body.includes('この先'));
	check('新しい刻み文に「この上」が残っていない', !body.includes('この上'));
	check('新しい刻み文が笛（詰み回復）の案内を持つ', body.includes('笛'));
}

// 塔全体で無言看板・死にデータが1件も無い（[[blade-sign-two-formats]]）
{
	const bad = [];
	for (const [key, st] of Object.entries(stages)) {
		const rows = rowsOf(st);
		const tiles = [];
		rows.forEach((r, ri) => [...r].forEach((ch, ci) => { if (ch === 'i') tiles.push(`${ri},${ci}`); }));
		const keys = Object.keys(st.signData ?? {});
		for (const t of tiles) if (!(st.signData?.[t]?.lines?.length)) bad.push(`${key}(${t}) 無言看板`);
		for (const k of keys) if (!tiles.includes(k)) bad.push(`${key}(${k}) 死にデータ`);
	}
	check(`塔に無言看板・死にデータが無い（実測: ${bad.join(' / ') || 'なし'}）`, bad.length === 0);
}

// 既存の作り込みが不変
check(`${FROM_ROOM} の敵 row2 が不変（実測 '${rowsOf(from)[2]}'）`, rowsOf(from)[2] === '#..ζ..μ....#');
check(`${FROM_ROOM} の階段 (6,4) が残っている`,
	from.tiles[6][4] === '>' && from.mapEnters?.['6,4']?.id === '4fEntrance');
check(`${TO_ROOM} の床の爆弾 (7,5) が残っている`, to.tiles[7][5] === '5');
check(`${TO_ROOM} の爆破壁 (8,5)(8,6) が残っている`,
	to.tiles[8][5] === '!' && to.tiles[8][6] === '!'
	&& to.breakableWalls?.['8,5'] && to.breakableWalls?.['8,6']);
check(`${TO_ROOM} の既存の刻み文 (1,1) が本文つきで残っている`,
	to.tiles[1][1] === 'i' && (to.signData?.['1,1']?.lines?.length ?? 0) >= 2);
check(`${FROM_ROOM} の境界の開きが不変（実測 ${openingSig(from)}）`, openingSig(from) === 'N[] S[5,6] W[] E[]');
check(`${TO_ROOM} の境界の開きが不変（実測 ${openingSig(to)}）`, openingSig(to) === 'N[5,6] S[5,6] W[] E[]');
check(`${FROM_ROOM} の row1 以外は1升も動いていない`,
	rowsOf(from).every((r, i) => i === 1 || r === beforeRows[FROM_ROOM][i]));
check(`${TO_ROOM} の row7 以外は1升も動いていない`,
	rowsOf(to).every((r, i) => i === 7 || r === beforeRows[TO_ROOM][i]));

// 看板は「隣に立って読む」＝隣接して立てる床が要る
{
	const NEIGHBORS = [[6, 1], [8, 1], [7, 0], [7, 2]];
	const readable = NEIGHBORS.filter(([r, c]) => to.tiles[r]?.[c] === '.');
	check(`${TO_ROOM} の刻み文の隣に立てる床が在る＝読める（実測 ${readable.map((p) => p.join(',')).join(' ') || 'なし'}）`,
		readable.length > 0);
}

// 穴 row6 を渡れる列＝`isLadderBridgeCell`（lib の本物）で数える。
// ⚠️ 自前で「両岸が '.'」と数えてはいけない＝床の爆弾 5(7,5) のような床アイテムも岸に
// なる（lib の `bank` は HARD_BLOCKED / SOLVABLE_GATES / LADDER_OVER 以外を岸と見る）
// ∴自前判定だと col5 を橋から落として数を取り違える（実際に1度間違えた）。
{
	const bridges = [];
	for (let c = 1; c <= 10; c++) {
		if (isLadderBridgeCell(to.tiles, to.rows, to.cols, 6, c, to.bgTiles)) bridges.push(c);
	}
	check(`${TO_ROOM} の穴 row6 を渡れる列が残っている（実測 col ${bridges.join(' ')}）`, bridges.length > 0);
	check(`看板を置いた col1 だけが橋から外れた（実測 ${bridges.length} 列／看板の前は 10 列）`,
		bridges.length === 9 && !bridges.includes(1));
}

// 接続＝4F の4室と塔30室に到達する（看板が動線を殺していない）
{
	const f4 = bfsLayer(stages, { stage: FROM_ROOM, row: 6, col: 4 }, {
		withLadder: true, followMapEnters: false, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const f4rooms = [...new Set([...f4.reachedCells].map((k) => k.split(':')[0]))].sort();
	check(`階段の着地から 4F の4室すべてに歩いて到達する（実測 ${f4rooms.join(' ')}）`,
		f4rooms.join(' ') === '4,1 4,2 4,3 4,4');

	const all = bfsLayer(stages, { stage: '0,1', row: 5, col: 5 }, {
		withLadder: true, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const rooms = new Set([...all.reachedCells].map((k) => k.split(':')[0]));
	check(`全道具ありで塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${rooms.size}）`,
		rooms.size === Object.keys(stages).length);
}

// 脅威度が動いていない（盤面を壊していない）
{
	let total = 0;
	for (const st of Object.values(stages)) {
		if (st.isBossRoom) continue;
		for (const row of st.tiles) for (const ch of row) if (ENEMY_META[ch]) total += THREAT_OF(ENEMY_META[ch]);
	}
	check(`塔の非ボス脅威度が ⑤-a のまま（${TOWER_THREAT}・実測 ${total.toFixed(1)}）`, total === TOWER_THREAT);
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 4F：石の間の案内を ${FROM_ROOM} → ${TO_ROOM}(${TO_CELL}) へ移設`);
console.log(log.join('\n') || '  （変更なし）');

for (const [key, st] of [[FROM_ROOM, from], [TO_ROOM, to]]) {
	console.log(`\n## 盤面の差分（${key}）`);
	rowsOf(st).forEach((now, i) => {
		const was = beforeRows[key][i];
		console.log(`   ${String(i).padStart(2)} ${was}   ${was === now ? '=' : '→'}   ${now}`);
	});
}

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
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_ladder=1&ps_bombs=8';
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(`  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${TO_ROOM}&row=5&col=5&${GEAR}`);
	console.log('   はしごで穴を渡り row7 の西端の刻み文を読む＝「この先は 石の 間」／'
		+ '爆破壁 (8,5)(8,6) を壊して南へ進むと石の間 4,3');
}
