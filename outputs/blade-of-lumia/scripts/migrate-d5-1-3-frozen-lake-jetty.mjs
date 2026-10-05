// dungeon_5 `1,3`（入口）：D4 の写しの部屋を「凍れる湖の桟橋」に作り替える
// （2026-10-05 / PLAN 実行キュー 40 の第1陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 #####..#####
//      1 #....!!....#     ← 北の口の手前に壊せる壁 `!!`（爆弾＝D6 の報酬）
//      2 #........E.#
//      3 #...†......#     ← 入口の石碑
//      4 ............     ← 西の口（`0,3` 行き止まり）・東の口（`2,3` 看板部屋）
//      5 ............
//      6 #..........#
//      7 #.>........#     ← フィールドへの戻り口 `>`（着地もこのセル）
//      8 #..........#
//      9 ############
//   `dungeon_4 1,3` と 6 セル差＝四角い広間に石碑と敵が1体いるだけ。
//
// ■ 新しい `1,3`＝凍れる湖の桟橋（D5 の主題「水路とはしご」の予告）
//      0 #####..#####
//      1 #~~~.!!....#
//      2 #~~~.....E.#
//      3 #~~~†......#
//      4 .~~.........     ← (4,1)(4,2)＝幅2の水＝はしごでも渡れない（おとり）
//      5 .~..........     ← (5,1)＝幅1の水＝はしごを取って戻れば西の口へ渡れる
//      6 #~~........#
//      7 #~>........#     ← 戻り口は湖に突き出た桟橋の先＝着くと東へしか出られない
//      8 #~~........#
//      9 ############
//   ・部屋の西の三分の一が凍れる湖。入口の桟橋に着くと、湖の向こうに西の口が見える。
//   ・西の口へは水を1枚渡るしかない＝はしごが要る。はしごはこの部屋の北（`!!` を爆弾で崩した先の
//     `1,2`）にある＝1部屋先で取って戻ってくる短い往復。西の口の先（`0,3`＝行き止まり）は
//     はしごを持ってから入る部屋になる（第2陣で作る）。
//   ・西の口の手前は2行：行5 は幅1（渡れる）、行4 は幅2（渡れない）。「1枚なら渡れる・2枚は無理」の
//     見分けを、はしごを持つ前に目で見せる。
//   ・北の `!!`・石碑・敵 E・戻り口 `>` は書き換え前と同じセルに残した（石碑の本文も触らない）。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・はしごを持っていれば到達できる部屋は書き換え前と同じ。
//   ・はしごを持たない到達室から `0,3` だけが抜ける（意図した変化）。
//
// 使い方:
//   node scripts/migrate-d5-1-3-frozen-lake-jetty.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-1-3-frozen-lake-jetty.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '1,3';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#....!!....#',
	'#........E.#',
	'#...†......#',
	'............',
	'............',
	'#..........#',
	'#.>........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#~~~.!!....#',
	'#~~~.....E.#',
	'#~~~†......#',
	'.~~.........',
	'.~..........',
	'#~~........#',
	'#~>........#',
	'#~~........#',
	'############',
];
export const EXITS = { north: ['0,5', '0,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const LANDING = '7,2';           // 戻り口 `>`＝フィールドから来たときの着地セル
export const CROSSING = '5,1';          // 西の口へ渡る幅1の水
export const DECOY = ['4,1', '4,2'];    // 幅2の水＝はしごでも渡れない

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
// 着地セルから歩けるセル。withLadder なら幅 1 の水/穴を、進む向きの先が地上のときだけ 1 マス渡る
// ＝エンジンの進入軸の橋（`game/passable.js isLadderCrossable`）と同じ。壊せる壁 `!` は閉じたまま。
// 返り値は Map(セル → 渡った水の最少枚数)。
export function reach(t, { withLadder = false, from = LANDING } = {}) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const cost = new Map([[from, 0]]);
	const dq = [from];
	while (dq.length) {
		const k = dq.shift();
		const [r, c] = P(k);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc)) continue;
			if (!blocked(nr, nc)) {
				const nCost = cost.get(k);
				if (!cost.has(nk) || cost.get(nk) > nCost) { cost.set(nk, nCost); dq.unshift(nk); }
				continue;
			}
			const fr = nr + dr, fc = nc + dc, fk = `${fr},${fc}`;
			if (withLadder && LADDER_OVER.has(t[nr][nc]) && inside(fr, fc) && !blocked(fr, fc)) {
				const nCost = cost.get(k) + 1;
				if (!cost.has(fk) || cost.get(fk) > nCost) { cost.set(fk, nCost); dq.push(fk); }
			}
		}
	}
	return cost;
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は TARGET と reach だけ使う）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	// 事前条件＝戻り口と石碑が想定のセルにある（違えば黙って上書きしない）
	if (room.mapEnters?.[LANDING]?.destId !== 'field_dungeon5') die(`${ROOM} の戻り口が ${LANDING} に無い`);
	if (!room.signData?.['3,4']) die(`${ROOM} の石碑が 3,4 に無い`);

	const START = { stage: ROOM, row: 7, col: 2 };
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		ladder: bfsLayer(stages, START, { withLadder: true, openTiles: OPEN }),
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: true, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = room.tiles;
	room.tiles = ORIGINAL.map((row) => row.split(''));
	const base = runs();
	room.tiles = applied;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは北・西・東の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	check(`戻り口 > は ${LANDING} の1枚・行き先は field_dungeon5`,
		JSON.stringify(cellsOf((ch) => ch === TILE.MAP_ENTER)) === JSON.stringify([LANDING])
		&& room.mapEnters[LANDING].destId === 'field_dungeon5' && Object.keys(room.mapEnters).length === 1);
	check(`石碑 † は 3,4 の1枚・本文は書き換え前のまま`,
		JSON.stringify(cellsOf((ch) => ch === TILE.MONUMENT)) === JSON.stringify(['3,4'])
		&& room.signData['3,4'].name === '氷の廃墟・入口の石碑');
	check(`北の口の手前に壊せる壁 ! が 1,5・1,6`,
		JSON.stringify(cellsOf((ch) => ch === TILE.BREAKABLE_WALL)) === JSON.stringify(['1,5', '1,6']));
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵は E(2,9) の1体だけ（書き換え前と同じ）`, JSON.stringify(enemies) === JSON.stringify(['2,9']) && at('2,9') === 'E');
	}
	check(`宝箱・石・門・座・かがり火が無い`,
		cellsOf((ch) => [TILE.CHEST, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.TORCH].includes(ch)).length === 0);
	check(`水は湖の 17 枚だけ（tiles 層の ~）・bgTiles に水を置いていない`,
		cellsOf((ch) => ch === TILE.WATER).length === 17
		&& !Object.values(room.bgTiles ?? {}).includes(TILE.WATER));

	// ── ② はしごと西の口 ──────────────────────────────────────────────
	{
		const foot = reach(t);
		const ladder = reach(t, { withLadder: true });
		check(`はしご無しでは西の口に届かない（歩ける ${foot.size} マス）`, EXITS.west.every((k) => !foot.has(k)));
		check(`はしご無しでも北の壊せる壁の前・東の口・石碑の前に届く`,
			['2,5', '2,6', ...EXITS.east, '3,5'].every((k) => foot.has(k)));
		check(`はしごがあれば西の口に届き、渡る水は1枚（実測 ${ladder.get('5,0')}）`, ladder.get('5,0') === 1);
		{
			const [r, c] = P(CROSSING);
			check(`渡り ${CROSSING} は横の橋（左右が地上・上下は水）`,
				!BLOCKED.has(t[r][c - 1]) && !BLOCKED.has(t[r][c + 1])
				&& LADDER_OVER.has(t[r - 1][c]) && LADDER_OVER.has(t[r + 1][c]));
		}
		check(`おとり ${DECOY.join(' ')} は水＝行4 は幅2`, DECOY.every((k) => at(k) === TILE.WATER));
		check(`西の口から戻るときも同じ渡り1枚で着地へ帰れる`, reach(t, { withLadder: true, from: '4,0' }).get(LANDING) === 1);
		// 北の口の2セルは壊せる壁の向こう＝爆弾で崩すまで立てない（書き換え前と同じ）∴数えない
		const floors = cellsOf((ch) => !BLOCKED.has(ch) && ch !== TILE.WATER).filter((k) => !EXITS.north.includes(k));
		check(`床のどのセルにも、はしごを使えば立てる（北の口の2セルを除く ${floors.length} マス）`, floors.every((k) => ladder.has(k)));
		// 対照①＝渡りを壁にすると、はしごでも西の口に届かない（潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
		const wall = t.map((r) => [...r]); wall[5][1] = TILE.WALL;
		check(`対照：渡り ${CROSSING} を壁にすると、はしごでも西の口に届かない`, !reach(wall, { withLadder: true }).has('5,0'));
		// 対照②＝渡りの東を水にする（幅2）と届かない＝幅1 だから渡れている
		const wide = t.map((r) => [...r]); wide[5][2] = TILE.WATER;
		check(`対照：(5,2) も水にして幅2にすると、はしごでも西の口に届かない`, !reach(wide, { withLadder: true }).has('5,0'));
		// 対照③＝おとりの (4,2) を床にすると行4 でも渡れる＝行4 が渡れないのは幅2 のせい
		const thin = t.map((r) => [...r]); thin[4][2] = TILE.FLOOR;
		check(`対照：(4,2) を床にすると行4 でも西の口へ渡れる`, reach(thin, { withLadder: true, from: '4,2' }).get('4,0') === 1);
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`はしごあり・錠を全部開けた到達室が書き換え前と同じ（${now.ladder.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`はしごあり・門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		const lost = sorted(base.foot.reachedRooms).filter((k) => !now.foot.reachedRooms.has(k));
		const gained = sorted(now.foot.reachedRooms).filter((k) => !base.foot.reachedRooms.has(k));
		check(`はしご無しの到達室から抜けるのは 0,3 だけ（実測 抜け=[${lost.join(' ')}] 増え=[${gained.join(' ')}]）`,
			JSON.stringify(lost) === JSON.stringify(['0,3']) && gained.length === 0);
		check(`レイヤーの dead-edge が 0（実測 ${now.ladder.deadEdges.length}）`, now.ladder.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：入口を「凍れる湖の桟橋」に作り替える（キュー40 第1陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}`);
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
}
