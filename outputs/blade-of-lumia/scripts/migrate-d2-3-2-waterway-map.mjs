// dungeon_2 `3,2`（地図の部屋）：床の真ん中に地図が落ちているだけの部屋を「地下水路の向こうの地図」に作り替える
// （2026-10-11 / PLAN 実行キュー 41 の第3陣 4室目・設計は Opus・主題＝ユーザー選択「地下水路の向こうの地図」）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 #####..#####     ← 北の口（方位盤 `3,1`）
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 .....m.....#     ← 西の口（対の祠 `2,2`）・床の地図
//      5 ...........#
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####     ← 南の口（`3,3`）
//   四角い広間の真ん中に床の地図が1つだけ（D1 `3,2` の写しから宝箱を抜いた形）。敵なし・下地なし。
//
// ■ 新しい `3,2`＝地下水路の向こうの地図（見えているのに渡れない＝隣の部屋を回って入る）
//      0 #####..#####     ← 北の口
//      1 #..........#     ┐ 北西の通り道（西の口と北の口をつなぐ L 字の岸・幅2）
//      2 #..........#     ┘
//      3 #..~~~~~~~~#     ← 水路（下地 '~'・幅2の L 字＝北の壁際の帯から南の壁まで）
//      4 ...~~~~~~~~#     ← 西の口
//      5 ...~~m.....#     ← 地図＝南東の庭の角（石畳の台 2×2）・西の口から水を挟んで3マス
//      6 #..~~......#
//      7 #..~~......#
//      8 #..~~......#
//      9 #####..#####     ← 南の口（南東の庭へは `3,3` から上がるしかない）
//   ・D2 で初めての水（ここまでの D2 は穴の部屋が5つ・東側の `2,3` と `3,1` は部屋の真ん中が穴∴ここは水で割った）。
//   ・水路は幅2の L 字（行3-4 の帯＋列3-4 の帯）で、部屋を北西の通り道（西の口・北の口）と南東の庭（南の口）に割る。
//     西の口（対の祠 `2,2` から）や北の口（方位盤 `3,1` から）から入ると、地図は水の向こうの庭の角に見えるだけ。
//     庭へは南の口＝`3,3` からしか入れない（`2,2`→`2,3`→`3,3`→ここ、と隣の部屋を回る）。
//   ・水路は全部幅2＝はしご（D5）でも渡れない（はしごは両隣が地上の1セルだけ）。翼の羽衣（終盤）なら越えられる。
//   ・ブーメランは地図を持ち帰れない（持ち帰れる床の物は鍵とルピーだけ＝`projectile.js`）∴水の上を飛ばしても回り道は省けない。
//   ・水路に魚群 `&`×3（脅威度 6.0＝看板部屋 `2,1` の 25.0 より軽い）。水から出られず、水際に立つと噛む（実測＝水から
//     1マス離れれば無傷・水際に立ち止まると HP 6→0・木の剣3振りで落ちる）。北西の通り道は幅2＝水から離れた側を歩けば
//     噛まれない。地図の台の角は二方が水＝拾う間だけ水際に立つ。D5（`1,1`・`3,2` の魚群）の予告。
//   ・⚠️ 射水魚 `/` は採らなかった＝部屋全体が射程で「盾で受ける」が答えになる＝`1,0`（裂け目越しの石を盾で受ける）と同じ。
//   ・地図は床の物のまま（宝箱にしない）。北の口と南の口は別の岸になった＝`3,1` と `3,3` をこの部屋で行き来することはできない
//     （どちらも `2,1`・`2,3` から入れる＝層の到達室は変わらない）。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（3つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-3-2-waterway-map.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-3-2-waterway-map.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, isLadderBridgeCell } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '3,2';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'.....m.....#',
	'...........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（水は下地 '~'＝tiles は床か魚群） ─────────────────────────
export const TARGET = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#.....&....#',
	'.........&.#',
	'.....m.....#',
	'#..........#',
	'#..&.......#',
	'#..........#',
	'#####..#####',
];
// 下地の絵（'~' 水／'o' 石畳／'d' 砂／' ' なし）。
export const TARGET_BG_ART = [
	'     dd     ',
	' dddddddddd ',
	' dddddddddd ',
	' dd~~~~~~~~ ',
	'ddd~~~~~~~~ ',
	'ddd~~oodddd ',
	' dd~~oodddd ',
	' dd~~dddddd ',
	' dd~~dddddd ',
	'     dd     ',
];
export const EXITS = { north: ['0,5', '0,6'], west: ['4,0', '5,0'], south: ['9,5', '9,6'] };
export const FISH = ['3,6', '4,9', '7,3'];   // 魚群 &×3（水の上・脅威度 2.0×3）
export const MAP_CELL = '5,5';               // 床の地図（南東の庭の角・石畳の台）
export const DAIS = ['5,5', '5,6', '6,5', '6,6'];
export const WEST_ENTRY = '5,1';             // 西の口から入った最初のセル（地図と同じ行）
export const NORTH_ENTRY = '1,5';
export const SOUTH_ENTRY = '8,5';

export function targetBg() {
	const bg = {};
	TARGET_BG_ART.forEach((row, r) => [...row].forEach((ch, c) => {
		if (ch === TILE.WATER || ch === TILE.SAND || ch === 'o') bg[`${r},${c}`] = ch;
	}));
	return bg;
}

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
// 水は下地にある∴tiles だけでなく bg も見る（connectivity.mjs cellTile と同じ畳み込み）。
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
export function walkable(t, bg, r, c) {
	if (!inside(r, c)) return false;
	if (bg?.[`${r},${c}`] === TILE.WATER) return false;
	return !BLOCKED.has(t[r][c]);
}
export function reach(t, bg, from, { ladder = false } = {}) {
	const seen = new Set([from]);
	const q = [from];
	const rows = t.map((row) => [...row]);
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk)) continue;
			const ok = walkable(t, bg, nr, nc)
				|| (ladder && bg?.[nk] === TILE.WATER && isLadderBridgeCell(rows, ROWS, COLS, nr, nc, bg));
			if (!ok) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}
export function waterOf(bg) {
	return Object.keys(bg ?? {}).filter((k) => bg[k] === TILE.WATER);
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は定数と reach だけ使う）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	// 事前条件＝盤面の外の中身が無い（下地は空か、このスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs', 'showConditions', 'chestContents'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	{
		const bg = JSON.stringify(room.bgTiles ?? {});
		if (bg !== '{}' && bg !== JSON.stringify(targetBg())) die(`${ROOM} の bgTiles が想定外の中身`);
	}
	if (room.links?.length) die(`${ROOM} の links が空でない`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の戻り口の着地
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		ladder: bfsLayer(stages, START, { withLadder: true, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: false, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	room.bgTiles = {};
	const base = runs();
	room.tiles = applied.tiles;
	room.bgTiles = applied.bgTiles;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(targetBg())) {
		room.bgTiles = targetBg();
		log.push(`  ${ROOM}: 下地＝L 字の水路（水 ${waterOf(targetBg()).length} 枚）・地図の台は石畳・ほかの床は砂`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
	const bg = room.bgTiles ?? {};
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c], `${r},${c}`)) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k)) && bg[k] !== TILE.WATER).sort();
		const was = edge.filter((k) => { const [r, c] = P(k); return !HARD_BLOCKED.has(ORIGINAL[r][c]); }).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは北・西・南の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want) && JSON.stringify(was) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵は魚群 &×3 だけ・${FISH.join(' ')}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify(FISH) && FISH.every((k) => at(k) === TILE.FISH_SCHOOL));
		check(`魚群はすべて水の上（下地 '~'）`, FISH.every((k) => bg[k] === TILE.WATER));
		const m = ENEMY_META[TILE.FISH_SCHOOL];
		check(`魚群は水しか泳げない（move:'water'）・ボスでない・弱点の道具を持たない`, m.move === 'water' && !m.isBoss && !m.weakness);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝看板部屋 2,1 の 25.0 より軽い`, threat > 0 && threat < 25);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`床の地図は ${MAP_CELL} の1つだけ（石畳の台の上）`,
		at(MAP_CELL) === TILE.ITEM_DUNGEON_MAP && cellsOf((ch) => ch === TILE.ITEM_DUNGEON_MAP).length === 1
		&& DAIS.every((k) => bg[k] === 'o'));
	check(`看板・宝箱・石・門などのほかの仕掛けが無い`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0)
		&& cellsOf((ch) => [TILE.SIGN, TILE.CHEST, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR, TILE.KEY, TILE.TORCH,
			TILE.BREAKABLE_WALL, TILE.PIT, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION].includes(ch)).length === 0);
	{
		const want = targetBg();
		const walls = cellsOf((ch) => ch === TILE.WALL);
		check(`下地が狙いどおり・壁の上には置かない（水 ${waterOf(bg).length}／石畳 ${DAIS.length}／砂 ${Object.values(bg).filter((v) => v === TILE.SAND).length}）`,
			JSON.stringify(bg) === JSON.stringify(want) && walls.every((k) => !(k in bg)));
		const floors = cellsOf((ch, k) => !BLOCKED.has(ch) && bg[k] !== TILE.WATER);
		check(`水でない床には全部下地がある（${floors.length} マス）`, floors.every((k) => bg[k] === TILE.SAND || bg[k] === 'o'));
	}

	// ── ② 水路の幾何 ──────────────────────────────────────────────
	{
		const west = reach(t, bg, WEST_ENTRY);
		const south = reach(t, bg, SOUTH_ENTRY);
		const floors = cellsOf((ch, k) => !BLOCKED.has(ch) && bg[k] !== TILE.WATER);
		check(`水でない床のどのセルにも、どれかの口から歩いて立てる（取り残し 0・${floors.length} マス）`,
			floors.every((k) => west.has(k) || south.has(k)));
		check(`北西の通り道＝西の口と北の口が歩いてつながる`, west.has(NORTH_ENTRY));
		check(`南東の庭＝南の口から地図に歩いて届く`, south.has(MAP_CELL));
		check(`西の口・北の口から地図へは歩いて届かない（水路で割れている）`, !west.has(MAP_CELL) && !west.has(SOUTH_ENTRY));
		check(`はしご（D5）を持っても西の口から地図へは届かない（水路は全部幅2）`,
			!reach(t, bg, WEST_ENTRY, { ladder: true }).has(MAP_CELL)
			&& waterOf(bg).every((k) => { const [r, c] = P(k); return !isLadderBridgeCell(t, ROWS, COLS, r, c, bg); }));
		// 西の口から地図が水の向こうに見える＝同じ行で、間は水だけ。
		const [mr, mc] = P(MAP_CELL);
		const [wr, wc] = P(WEST_ENTRY);
		let between = [];
		for (let c = wc + 1; c < mc; c++) between.push(`${wr},${c}`);
		const shore = between.filter((k) => bg[k] !== TILE.WATER);
		const water = between.filter((k) => bg[k] === TILE.WATER);
		check(`西の口 ${WEST_ENTRY} と地図は同じ行で、間は岸と水だけ（水 ${water.length} 枚・岸 ${shore.length}）`,
			wr === mr && water.length === 2 && shore.every((k) => walkable(t, bg, ...P(k))) && between.every((k) => !BLOCKED.has(at(k))));
		// 地図の台の角は二方が水＝拾う間だけ水際に立つ。
		const wet = [[-1, 0], [0, -1]].filter(([dr, dc]) => bg[`${mr + dr},${mc + dc}`] === TILE.WATER).length;
		check(`地図のセルは北と西が水（拾うときは水際）`, wet === 2);
		// 北西の通り道は幅2＝水から離れた側（行1・列1）を歩けば水際に立たずに西の口から北の口へ行ける。
		const dry = (k) => { const [r, c] = P(k); return [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dr, dc]) => bg[`${r + dr},${c + dc}`] !== TILE.WATER); };
		const path = ['5,1', '4,1', '3,1', '2,1', '1,1', '1,2', '1,3', '1,4', '1,5'];
		check(`西の口から北の口へ、水際を踏まない道がある（${path.join('→')}）`, path.every((k) => walkable(t, bg, ...P(k)) && dry(k)));
		// 水路は1つのかたまり（4近傍）で、北の壁際の帯の東端は東の壁・縦の帯の南端は南の壁に接する＝岸がつながらない。
		const ws = waterOf(bg);
		const blob = new Set([ws[0]]); const q = [ws[0]];
		while (q.length) {
			const [r, c] = P(q.shift());
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nk = `${r + dr},${c + dc}`;
				if (ws.includes(nk) && !blob.has(nk)) { blob.add(nk); q.push(nk); }
			}
		}
		check(`水路は ${ws.length} 枚の1つのかたまりで、東の壁と南の壁に接する`,
			blob.size === ws.length && ws.length === 24 && at('3,11') === TILE.WALL && bg['3,10'] === TILE.WATER
			&& at('9,3') === TILE.WALL && bg['8,3'] === TILE.WATER);
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`はしご込みの到達室が書き換え前と同じ（${now.ladder.reachedRooms.size} 室）`,
			same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：地図の部屋を「地下水路の向こうの地図」に作り替える（キュー41 第3陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}   ${TARGET_BG_ART[i]}`);
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
