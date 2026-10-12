// dungeon_8 `1,0`（鍵の部屋）：D4 `1,0` の骨組みの写しだった「石4・純倉庫番」を
// 「沼の浮島」に作り替える
// （2026-10-12 / PLAN 実行キュー 47 の第3陣・設計は Opus、主題はユーザー選択）
//
// ■ 何が壊れていたか（キュー47 の指摘）
//   旧盤面（キュー 5.5g）は D4 `1,0` の「千鳥の柱＋東列の前室」とほぼ同じで、石とボタンを
//   1組増やしただけだった（内側で一致するセルが D6↔D8 で 27）。ユーザー判定（2026-10-12）＝
//   D4 は見本として残し、D8 は別物に作り直す。
//
// ■ 新しい `1,0`＝沼の浮島
//      0 ############
//      1 #S###>###S##     ← 桟橋の先端のボタン (1,1)(1,9)・ワープ `>`(1,5)
//      2 #.~.~K~.~.##     ← 鍵 (2,5)＝ワープの小島の上
//      3 #.~.~.~*~*##     ← 石の桟橋（列7）の石 (3,7)・ボタンの桟橋（列9）の石 (3,9)
//      4 D.~.~~~.~.##     ← 小島の根元は水 (4,5)＝陸続きでない
//      5 D....*...*##     ← 広間の石 (5,5)(5,9)
//      6 #..#...#..##
//      7 #S.......S##     ← 広間のボタン (7,1)(7,9)
//      8 ############
//      9 ############
//   ・北は桟橋の櫛＝列1/3/5/7/9 が幅1の陸、間の列2/4/6/8 が幅1の水路（bgTiles の水）。
//   ・勇者ははしごで水路をどこでも渡れる。石は水に入れない＝桟橋を縦にしか動けない。
//     ∴桟橋の中の石を外（南）へ出すには、石の上（桟橋の奥）に立つ＝隣の陸から水路を跳ぶしかない。
//   ・真ん中の桟橋（列5）は根元 (4,5) が水＝小島。ワープと鍵が乗る。石は水を越えられない∴小島に
//     石は絶対に入らない＝旧盤面の「前室」の代わり（幾何で自明）。小島の渡り口は5つ。
//   ・この部屋に入るときは必ず笛を持っている（笛は D8 `1,2` の宝箱・ワープは `1,1` で笛を吹くと
//     現れる）＝`fluteEffect:{type:'resetStones'}` の救済は初回から効く。旧盤面の注記「笛は D8 の
//     報酬＝初回は未所持」は誤りだった（2026-10-12 裏取り）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／bgTiles／mapEnters・showConditions・fluteEffect／宝箱・看板・敵が無い
//   ・幾何の不変条件（generate-key-room-d8.mjs の assertGeometry をそのまま使う）
//   ・ソルバー実測：L が帯 40〜60・貪欲NG・deadlock>0・強制手率≤0.7・noEscape=0
//   ・I6（はしごの必須性）：小島の渡り口以外の水路を壁にすると解なし
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方（状態 66 万を2回測る＝ヒープを広げる）:
//   node --max-old-space-size=8000 scripts/migrate-d8-1-0-swamp-isles.mjs --dry   # 検査と差分のみ
//   node --max-old-space-size=8000 scripts/migrate-d8-1-0-swamp-isles.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { verdict } from './lib/puzzle-metrics.mjs';
import { ROWS, COLS } from './lib/blade-solver.mjs';
import {
	TEMPLATES, analyze, assertGeometry, measurePlacement, assertLadderRequired, L_MIN, L_MAX,
} from './generate-key-room-d8.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_8';
const ROOM  = '1,0';
const TPL = TEMPLATES.find((x) => x.name === 'c3').template;
const STONES = ['3,7', '3,9', '5,5', '5,9'];   // generate-key-room-d8.mjs c3 の採用盤面
const BUTTONS = ['1,1', '1,9', '7,1', '7,9'];
const EXPECT_L = 55;
const WARP = '1,5';
const KEY = '2,5';

// 書き込む盤面＝テンプレ（水 '~' は床 '.'＋bgTiles の水）＋石。
const TARGET = TPL.map((row, r) => [...row].map((ch, c) => {
	if (STONES.includes(`${r},${c}`)) return TILE.STONE;
	return ch === '~' ? TILE.FLOOR : ch;
}).join(''));
const WATER = {};
TPL.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER[`${r},${c}`] = TILE.WATER; }));

const NEW_DATA = {
	mapEnters: { [WARP]: { id: 'd8_bosswing', destId: 'd8_gatehall' } },
	showConditions: { [KEY]: { trigger: 'stonesPlaced' } },
	breakableWalls: {},
	fluteEffect: { type: 'resetStones' },
	bgTiles: WATER,
};

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);
// 隣室 `1,1` のワープが d8_gatehall → d8_bosswing のままであること（行き先は id で引く＝セルが動いても繋がる）
const gate = Object.values(stages['1,1']?.mapEnters ?? {});
if (!gate.some((e) => e.id === 'd8_gatehall' && e.destId === 'd8_bosswing')) die('1,1 のワープ d8_gatehall が見つからない');

const entry = Object.entries(stages['1,3']?.mapEnters ?? {}).find(([, e]) => e.destId?.startsWith('field'));
if (!entry) die('1,3 の入口 > が見つからない');
const [er, ec] = entry[0].split(',').map(Number);
const START = { stage: '1,3', row: er, col: ec };
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
		log.push(`  ${ROOM}: ${k} を書き換えた`);
	}
}
const COMMENT = '[key_gate D8] 沼の浮島＝倉庫番型②（石4・PUZZLE-DESIGN §7-3 C / §7-4 #8 / キュー47 第3陣で作り直し・'
	+ `scripts/migrate-d8-1-0-swamp-isles.mjs）。ボタン S ${BUTTONS.join(' ')} の全てに石 ${STONES.join(' ')} を乗せると `
	+ `showConditions(stonesPlaced) で鍵 ${KEY} が出現→西の鍵扉 D(4,0)(5,0) からボス部屋へ。北は桟橋の櫛（列1/3/5/7/9 が幅1の陸・`
	+ '間の列2/4/6/8 が幅1の水路＝bgTiles の水）。勇者ははしごで水路を渡れるが石は水に入れない＝桟橋の中の石を外へ出す押しの'
	+ `立ち位置は桟橋の奥＝隣の陸から跳ぶしかない。真ん中の桟橋（列5）は根元 4,5 が水の小島＝ワープ ${WARP} と鍵が乗る`
	+ `（石は絶対に入れない）。実測 L=${EXPECT_L}（帯 40〜60）・貪欲では解けない・最短解1本・脱出不能0・`
	+ '渡り口以外の水路を壁にすると解なし（はしご必須）。この部屋へ入るときは必ず笛を持っている（1,2 の宝箱・1,1 のワープは笛で現れる）'
	+ '＝笛の resetStones が初回から効く。敵は置かない（敵が石を押す）。';
if (room.comment !== COMMENT) { room.comment = COMMENT; log.push(`  ${ROOM}: comment を書き換えた`); }

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const cells = (ch) => t.flatMap((row, r) => row.map((x, c) => (x === ch ? `${r},${c}` : null))).filter(Boolean);
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === COLS) && room.tiles.length === ROWS);
check(`石は ${STONES.join(' ')} の4個`, JSON.stringify(cells(TILE.STONE).sort()) === JSON.stringify([...STONES].sort()));
check(`ボタンは ${BUTTONS.join(' ')} の4個`, JSON.stringify(cells(TILE.BUTTON).sort()) === JSON.stringify([...BUTTONS].sort()));
check(`鍵は ${KEY}・ワープは ${WARP}`, JSON.stringify(cells(TILE.KEY)) === JSON.stringify([KEY])
	&& JSON.stringify(cells(TILE.MAP_ENTER)) === JSON.stringify([WARP]));
for (const [k, v] of Object.entries(NEW_DATA)) check(`${k} が狙いどおり`, JSON.stringify(room[k]) === JSON.stringify(v));
check(`水は bgTiles だけ（${Object.keys(WATER).length} 枚）・その下の tiles は床`, Object.keys(WATER).every((k) => {
	const [r, c] = k.split(',').map(Number);
	return t[r][c] === TILE.FLOOR;
}) && !cells(TILE.WATER).length);
check('宝箱・看板・床置きアイテムが無い', !cells(TILE.CHEST).length && !cells(TILE.SIGN).length
	&& !Object.keys(room.chestContents ?? {}).length && !Object.keys(room.signData ?? {}).length
	&& !Object.keys(room.floorItems ?? {}).length);
check('links が空配列', Array.isArray(room.links) && room.links.length === 0);
check('敵が居ない（敵は石を押す）', !Object.keys(room.enemyDirs ?? {}).length
	&& !/[WECFVXZALNJOUGIθμαβξζφδσλπηωψΓ]/.test(TARGET.join('')));
check('ゲート T・壊せる壁 ! が無い', !cells(TILE.GATE).length && !cells(TILE.BREAKABLE_WALL).length);

// ── ② 幾何・ソルバー（生成器と同じ関数） ─────────────────────────────
const g = analyze(TPL);
try { assertGeometry(g); check('幾何の不変条件（assertGeometry ①〜⑥）を全部満たす', true); }
catch (e) { check(`幾何の不変条件：${e.message}`, false); }
check(`小島は ${[...g.isle].sort().join(' ')}（石は入れない）・渡り口 ${g.crossings.length} か所`,
	[...g.isle].sort().join(' ') === '1,5 2,5 3,5' && g.crossings.length >= 2);
const m = measurePlacement(g, STONES, 9000000);
const v = verdict(m);
check(`ソルバー：L=${m.L}（記録値 ${EXPECT_L}・帯 ${L_MIN}〜${L_MAX}）`, m.L === EXPECT_L && m.L >= L_MIN && m.L <= L_MAX);
check(`4軸の下限（${v.label}・deadlock=${m.deadlocks}・強制手率=${m.forcedRatio}・最短解=${m.solCount}本）`, v.pass);
check(`どの到達状態からもワープへ戻れる（noEscape=${m.noEscape}・状態 ${m.states}）`, m.noEscape === 0);
try {
	const i5 = assertLadderRequired(g, STONES);
	check(`I6：小島の渡り口以外の水路を壁にすると解なし（状態 ${i5.states}）`, true);
} catch (e) { check(`I6：${e.message}`, false); }

// ── ③ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
		same(open.reachedRooms, baseOpen.reachedRooms));
	check(`レイヤーの dead-edge が書き換え前と同じ（実測 ${closed.deadEdges.length}・前 ${baseClosed.deadEdges.length}）`,
		closed.deadEdges.length === baseClosed.deadEdges.length);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：D4 の骨組みの写しだった鍵の部屋を「沼の浮島」に作り替える（キュー47）`);
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
