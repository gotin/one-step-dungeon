// dungeon_6 `1,0`（鍵の部屋）：D4 `1,0` の骨組みの写しだった「石3＋爆弾壁」の倉庫番を
// 「朽ち根の環」に作り替える
// （2026-10-12 / PLAN 実行キュー 47 の第2陣 2室目・設計は Opus、主題はユーザー選択）
//
// ■ 何が壊れていたか（キュー47 の指摘）
//   旧盤面（キュー 5.5f）は D4 `1,0` の「柱の林＋東列の前室」とほぼ同じで、北西の角のボタンを
//   爆弾壁の袋へ移しただけだった（内側で一致するセルが D4↔D6 で 26）。ユーザー判定
//   （2026-10-12）＝D4 は見本として残し、D6 は別物に作り直す。
//
// ■ 新しい `1,0`＝朽ち根の環
//      0 ############
//      1 #...*....!S#     ← 袋のボタン (1,10)・喉の朽ち根 '!'(1,9)
//      2 #.S.*...*.t#     ← ボタン (2,2)
//      3 #..tt!ttt..#     ← 根を貫く溝の栓＝朽ち根 '!'(3,5)
//      4 D..tt..>t.t#     ← ワープ `>`(4,7)＝根の洞（入口・救済の出口）
//      5 D..tt....t.#
//      6 #..tt.ttt..#
//      7 #.ttt.tttt.#
//      8 #....S..K..#     ← 南の通りのボタン (8,5)・鍵 (8,8)
//      9 ############
//   ・部屋の真ん中に聖樹の根（木 't'）。石は根のまわりの環を回して運ぶ。
//   ・南の通り（行8）は幅1で、西 (7,1)・東 (7,10) の角も幅1＝石は角を曲がれない（押す側が壁）。
//     ∴南のボタン (8,5) へ石を送る道は、根を貫く溝（列5・行3〜7）だけ。溝の栓 (3,5) は朽ちた根
//     ＝爆弾で崩すと、北の環から石を真っ直ぐ5回押し下ろせる（近道）。
//   ・北東の角のボタン (1,10) は袋の中＝床の隣人は朽ちた根 (1,9) だけ。崩すまで石は入らない。
//   ・入口のワープは根の洞（(4,5)〜(5,8) の区画）。洞の口は溝の (4,5)(5,5) と東の環の (5,9)。
//     溝の石を洞へ押す立ち位置は根の中、(5,9) の石を押す立ち位置は (5,10) の根＝石は洞へ入れない
//     （詰み救済のワープを石で塞げない）。
//   ・2枚の朽ち根は離してある＝爆弾1発では1枚しか崩れない（爆弾2個）。爆弾は `1,2` の宝箱で3個。
//   ・D4（柱の林・純倉庫番）とも D8（石4・純）とも骨組みが別物＝「環と溝」。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／breakableWalls・mapEnters・showConditions・fluteEffect／宝箱・看板・敵が無い
//   ・幾何の不変条件（generate-key-room-d6.mjs の assertGeometry をそのまま使う）
//   ・ソルバー実測：L が帯 34〜39・貪欲NG・deadlock>0・強制手率≤0.7・noEscape=0
//   ・I4（壁ごと）：'#' に固定→解なし／「歩けるが石は通れない」→解なし／全部 '.'→解ける
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-1-0-rotten-roots.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-1-0-rotten-roots.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { verdict } from './lib/puzzle-metrics.mjs';
import { ROWS, COLS } from './lib/blade-solver.mjs';
import {
	TEMPLATES, analyze, assertGeometry, measurePlacement, assertBombRequired, L_MIN, L_MAX,
} from './generate-key-room-d6.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_6';
const ROOM  = '1,0';
const TPL = TEMPLATES.find((x) => x.name === 'r3').template;
const STONES = ['1,4', '2,4', '2,8'];   // generate-key-room-d6.mjs r3 の採用盤面
const EXPECT_L = 39;
const WARP = '4,7';
const KEY = '8,8';
const BREAKS = ['1,9', '3,5'];

// 書き込む盤面＝テンプレ（安全地帯マーク ',' は床へ）＋石。
const TARGET = TPL.map((row, r) => [...row].map((ch, c) => {
	if (STONES.includes(`${r},${c}`)) return TILE.STONE;
	return ch === ',' ? TILE.FLOOR : ch;
}).join(''));

const NEW_DATA = {
	mapEnters: { [WARP]: { id: 'd6_bosswing', destId: 'd6_gatehall' } },
	showConditions: { [KEY]: { trigger: 'stonesPlaced' } },
	breakableWalls: Object.fromEntries(BREAKS.map((b) => [b, { breakDef: 1 }])),
	fluteEffect: { type: 'resetStones' },
};

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);
// 隣室 `1,1` のワープが d6_gatehall → d6_bosswing のままであること（行き先は id で引く＝セルが動いても繋がる）
const gate = Object.values(stages['1,1']?.mapEnters ?? {});
if (!gate.some((e) => e.id === 'd6_gatehall' && e.destId === 'd6_bosswing')) die('1,1 のワープ d6_gatehall が見つからない');

const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
const baseClosed = layerRun();
const baseOpen = layerRunOpen();

const before = room.tiles.map(rowStr);
const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
for (const [k, v] of Object.entries(NEW_DATA)) {
	if (JSON.stringify(room[k]) !== JSON.stringify(v)) {
		room[k] = JSON.parse(JSON.stringify(v));
		log.push(`  ${ROOM}: ${k} を ${JSON.stringify(v)} にした`);
	}
}
const COMMENT = '[key_gate D6] 朽ち根の環＝倉庫番＋道具（石3＋朽ちた根2枚・PUZZLE-DESIGN §7-3 C+B / §7-4 #6 / '
	+ 'キュー47 第2陣で作り直し・scripts/migrate-d6-1-0-rotten-roots.mjs）。ボタン S 1,10 2,2 8,5 の全てに石 '
	+ `${STONES.join(' ')} を乗せると showConditions(stonesPlaced) で鍵 ${KEY} が出現→西の鍵扉 D(4,0)(5,0) からボス部屋へ。`
	+ '南の通り（行8）は幅1で角も幅1＝石は角を曲がれない∴(8,5) へ石を送る道は根を貫く溝（列5）だけ。溝の栓 3,5 と'
	+ '袋の喉 1,9 が朽ちた根（爆弾で崩れる・2枚は離してあり1発で1枚）。どちらの壁も「#固定」「歩けるが石は通れない」'
	+ `で解なし＝石の搬送路。実測 L=${EXPECT_L}（帯 34〜39）・貪欲では解けない・脱出不能0。入口のワープ ${WARP} は根の洞`
	+ '＝石が入れない安全地帯（口は溝の 4,5/5,5 と東の 5,9・押す立ち位置が根）。敵は置かない（敵が石を押す）。';
if (room.comment !== COMMENT) { room.comment = COMMENT; log.push(`  ${ROOM}: comment を書き換えた`); }

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cells = (ch) => t.flatMap((row, r) => row.map((x, c) => (x === ch ? `${r},${c}` : null))).filter(Boolean);
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === COLS) && room.tiles.length === ROWS);
check(`石は ${STONES.join(' ')} の3個`, JSON.stringify(cells(TILE.STONE).sort()) === JSON.stringify([...STONES].sort()));
check(`ボタンは 1,10 2,2 8,5 の3個`, JSON.stringify(cells(TILE.BUTTON).sort()) === JSON.stringify(['1,10', '2,2', '8,5']));
check(`朽ちた根 '!' は ${BREAKS.join(' ')}`, JSON.stringify(cells(TILE.BREAKABLE_WALL).sort()) === JSON.stringify([...BREAKS].sort()));
check(`鍵は ${KEY}・ワープは ${WARP}`, JSON.stringify(cells(TILE.KEY)) === JSON.stringify([KEY])
	&& JSON.stringify(cells(TILE.MAP_ENTER)) === JSON.stringify([WARP]));
for (const [k, v] of Object.entries(NEW_DATA)) check(`${k} が ${JSON.stringify(v)}`, JSON.stringify(room[k]) === JSON.stringify(v));
check('宝箱・看板・床置きアイテムが無い', !cells(TILE.CHEST).length && !cells(TILE.SIGN).length
	&& !Object.keys(room.chestContents ?? {}).length && !Object.keys(room.signData ?? {}).length
	&& !Object.keys(room.floorItems ?? {}).length);
check('links が空配列', Array.isArray(room.links) && room.links.length === 0);
check('敵が居ない（敵は石を押す）', !Object.keys(room.enemyDirs ?? {}).length
	&& !/[WECFVXZALNJOUGIθμαβξζφδσλπηωψΓ]/.test(TARGET.join('')));
check('ゲート T が無い', !cells(TILE.GATE).length);
check(`bgTiles が無い/空（地形は tiles だけ）`, !room.bgTiles || !Object.keys(room.bgTiles).length);

// ── ② 幾何・ソルバー（生成器と同じ関数） ─────────────────────────────
const g = analyze(TPL);
try { assertGeometry(g); check('幾何の不変条件（assertGeometry ①〜⑩）を全部満たす', true); }
catch (e) { check(`幾何の不変条件：${e.message}`, false); }
check(`袋のボタン ${g.pocketButton}・喉 ${g.pocketBreak}／近道 ${g.cutBreaks?.join(' ')}`,
	g.pocketButton === '1,10' && g.pocketBreak === '1,9' && g.cutBreaks?.join(' ') === '3,5');
const m = measurePlacement(g, STONES, 9000000);
const v = verdict(m);
check(`ソルバー：L=${m.L}（記録値 ${EXPECT_L}・帯 ${L_MIN}〜${L_MAX}）`, m.L === EXPECT_L && m.L >= L_MIN && m.L <= L_MAX);
check(`4軸の下限（${v.label}・deadlock=${m.deadlocks}・強制手率=${m.forcedRatio}・最短解=${m.solCount}本）`, v.pass);
check(`どの到達状態からもワープへ戻れる（noEscape=${m.noEscape}・状態 ${m.states}）`, m.noEscape === 0);
try {
	const i4 = assertBombRequired(g, STONES);
	check(`I4：朽ち根 ${BREAKS.join('・')} はどちらも '#'→解なし／石だけ不可→解なし／全部 '.'→L=${i4.floor.L}`, true);
} catch (e) { check(`I4：${e.message}`, false); }

// ── ③ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
		same(open.reachedRooms, baseOpen.reachedRooms));
	// ⚠️ この部屋とボス部屋 0,0 は層の BFS では届かない（書き換え前から同じ）＝`1,1` のワープは
	//    showConditions（torchesLit）付きで、bfsLayer は条件付きワープを辿らない。部屋の中の
	//    「ワープ→鍵→鍵扉の手前」は assertGeometry ⑦ が見ている。
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：D4 の骨組みの写しだった鍵の部屋を「朽ち根の環」に作り替える（キュー47）`);
console.log(log.join('\n') || '  （変更なし）');
console.log(`\n## 盤面の差分（${ROOM}）`);
room.tiles.forEach((row, i) => {
	console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${rowStr(row)}`);
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
}
