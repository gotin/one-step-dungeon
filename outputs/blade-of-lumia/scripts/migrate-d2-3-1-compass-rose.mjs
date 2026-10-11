// dungeon_2 `3,1`（南東の環の北東＝コンパスの部屋）：床にコンパスが落ちているだけの部屋を「砂の方位盤」に作り替える
// （2026-10-11 / PLAN 実行キュー 41 の第3陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #....n.....#     ← 床のコンパス（拾うだけ）
//      4 ...........#     ← 西の口（看板の部屋 `2,1`）
//      5 ...........#
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####     ← 南の口（地図の部屋 `3,2`）
//   四角い広間の真ん中にコンパスが1つ＝D1 `3,1`（同じ箱・コンパスなし）の写し。敵も仕掛けも無い。
//
// ■ 新しい `3,1`＝砂の方位盤（D2 で初めての石の謎・D4 の倉庫番の予告）
//      0 ############
//      1 #.......#.n#     ← 北東の祠（石畳）にコンパス (1,10)
//      2 #....*..#..#     ← 北の針の口に石 (2,5)
//      3 #..xx*xx##T#     ← 北の針に石 (3,5)／祠の門 T (3,10)
//      4 ...xxSxx...#     ← 北の針の先にボタン (4,5)
//      5 ....Sx.....#     ← 西の針の先にボタン (5,4)・真ん中 (5,5) は穴・東の針 (5,6)(5,7)
//      6 #..xx.xx...#     ← 南の針 (6,5)(7,5)
//      7 #..xx.xx...#
//      8 #..........#
//      9 #####..#####
//   ・部屋の真ん中の床が砂の流れ落ちた四角い穴（行3-7×列3-7 の 25 マスから針の8マスを抜いた 17 枚）。四辺の真ん中から
//     中心へ向けて幅1・奥行き2の「針」が4本切れ込む＝方位盤の形。針の先（中心の穴の隣）は行き止まり。
//   ・ボタンは北の針の先 (4,5) と西の針の先 (5,4)。両方に石が乗ると祠の門 T (3,10) が開く（ボタンのある盤面は
//     「全ボタン ON で全 T 開」・石が全部乗るとロック＝門は開いたまま。links は要らない）。
//     ⚠️ 北と西＝この部屋から見たボス部屋 `0,0` の方角（北西）。コンパスの部屋の謎が「王の眠る方角」を指す。
//   ・主題＝**針には真っすぐ押し込むしかない**（針は幅1で両脇が穴＝横からは押せず、穴の側にも立てない）。
//     北の針には石が2つ詰まっている（(2,5) と (3,5)）。北から押しても2つ重ねては押せない＝**口の石を先に横へどけ、
//     奥の石を針の先へ押し込み、どけた石を西の針まで運ぶ**。運ぶ道は列1-2 を南へ下り、行5 を西の口の側から東へ押す。
//   ・罠（入って詰む形ではない＝部屋を出れば石は戻る）：口の石を東へ2つ押すと北東の角 (2,7) で動かなくなる／
//     行1（北の壁沿い）へ押し上げると南へ戻せない／東と南の針へ押し込むと取り出せない。
//   ・最短 43 手・押し 9 回・貪欲（ボタンへの距離が減る押しだけ）では解けない・入って詰む状態 0（ソルバー）。
//   ・通り道（西の口 → 南の口）は穴の西と南の縁を回る＝石に触れずに通れる。敵は置かない（敵が石を押して謎が崩れる）。
//   ・下地＝床は砂 'd'、祠（2×2）と門の敷居は石畳 'o'（`2,2` の祠と同じ）・穴には置かない。
//   ・D2 の他の部屋と型を分けた＝`1,3` は穴の隅の篝火・`2,3` は大穴と追い手・`0,2` は穴の中の小島・`1,0` は裂け目と
//     一本橋。ここは「穴で押す向きを縛る」＝穴が石の通り道を決める。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（2つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-3-1-compass-rose.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-3-1-compass-rose.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, makeGreedyPush, buttonFillOrders } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '3,1';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#....n.....#',
	'...........#',
	'...........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#.......#.n#',
	'#....*..#..#',
	'#..xx*xx##T#',
	'...xxSxx...#',
	'....Sx.....#',
	'#..xx.xx...#',
	'#..xx.xx...#',
	'#..........#',
	'#####..#####',
];
export const EXITS = { west: ['4,0', '5,0'], south: ['9,5', '9,6'] };
export const STONES = ['2,5', '3,5'];                 // 北の針に詰まった石（口の石・奥の石）
export const BUTTONS = { north: '4,5', west: '5,4' };  // 針の先
export const NEEDLES = {                               // 針＝幅1・奥行き2（口の側 → 先）
	north: ['3,5', '4,5'],
	west: ['5,3', '5,4'],
	east: ['5,7', '5,6'],
	south: ['7,5', '6,5'],
};
export const HUB = '5,5';                              // 方位盤の中心（穴）
export const GATE = '3,10';
export const COMPASS = '1,10';
export const SHRINE = ['1,9', '1,10', '2,9', '2,10'];
export const STONE_FLOOR = [...SHRINE, GATE];          // 祠と門の敷居＝石畳
export const SHORTEST = 43;                            // 口からコンパスまでの最短手数
export const PUSHES = 9;

// 下地＝祠と門は石畳 'o'・ほかの床（石・ボタン・コンパスの下も）は砂 'd'。壁と穴には置かない。盤面から導く。
export function targetBg(t = TARGET) {
	const bg = {};
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const k = `${r},${c}`, ch = t[r][c];
		if (ch === TILE.WALL || ch === TILE.PIT) continue;
		bg[k] = STONE_FLOOR.includes(k) ? TILE.STONE_FLOOR : TILE.SAND;
	}
	return bg;
}

const P = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
// 盤面の1セルを差し替えた写し（対照実験用）
export const withCell = (k, ch, base = TARGET) => {
	const [r, c] = P(k);
	return base.map((row, i) => (i === r ? row.slice(0, c) + ch + row.slice(c + 1) : row));
};

// ── 歩行の到達（石も門も壁として見る・番人が import する） ─────────────
export function reach(t, from = EXITS.west[0], cut = new Set()) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of DIRS) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk) || cut.has(nk)) continue;
			const ch = t[nr][nc];
			if (BLOCKED.has(ch) || ch === TILE.GATE || ch === TILE.STONE) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

// ── ソルバー（状態空間＝実エンジンの石押し・ボタン・門の規則の写し） ───────
// goal＝'compass'（祠のコンパスのセルに立つ）／'stones'（両方のボタンに石が乗る）。
export function solveRoom(board = TARGET, { goal = 'compass', noPush = false } = {}) {
	const tiles = board.map((row) => [...row].map((ch) => (ch === TILE.ITEM_COMPASS ? TILE.FLOOR : ch)));
	const bg = board.map((row) => [...row].map(() => TILE.SAND));
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false, noPush });
	const exits = Object.values(EXITS).flat();
	const starts = exits.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	const stonesOn = (st) => { const ss = st.split('|')[1].split(';'); return S.buttons.length > 0 && S.buttons.every((b) => ss.includes(b)); };
	const goalTest = goal === 'compass' ? (st) => st.split('|')[0] === COMPASS : stonesOn;
	const m = measureMetrics(S, starts, goalTest, () => 0, {
		guardMax: 3_000_000, greedyFn: makeGreedyPush(S.buttons),
		escapeTest: (st) => exits.includes(st.split('|')[0]),
	});
	const { orders } = buttonFillOrders(S, starts, stonesOn, S.buttons);
	// 最短解の押し列
	const par = new Map(starts.map((s) => [s, null]));
	const q = [...starts];
	let g = null;
	for (let h = 0; h < q.length; h++) {
		if (goalTest(q[h])) { g = q[h]; break; }
		for (const nx of S.nextStates(q[h])) if (!par.has(nx)) { par.set(nx, q[h]); q.push(nx); }
	}
	const pushList = [];
	if (g) {
		const path = [];
		for (let s = g; s; s = par.get(s)) path.unshift(s);
		for (let i = 1; i < path.length; i++) {
			const A = path[i - 1].split('|')[1].split(';'), B = path[i].split('|')[1].split(';');
			const j = A.findIndex((x, k) => x !== B[k]);
			if (j >= 0) pushList.push(`${A[j]}→${B[j]}`);
		}
	}
	return { ...m, pushes: pushList.length, pushList, orders, buttons: S.buttons };
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は定数と reach・solveRoom だけ使う）。
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
		log.push(`  ${ROOM}: 下地＝床は砂・祠と門の敷居は石畳（穴には置かない）`);
	}
	if (!Array.isArray(room.links)) { room.links = []; log.push(`  ${ROOM}: links を空の配列に`); }

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k))).sort();
		const was = edge.filter((k) => { const [r, c] = P(k); return !HARD_BLOCKED.has(ORIGINAL[r][c]); }).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは西・南の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want) && JSON.stringify(was) === JSON.stringify(want));
	}
	check(`敵が居ない（敵が石を押すと謎が崩れる）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`石は ${STONES.join(' ')}・ボタンは ${Object.values(BUTTONS).join(' ')}・門 T は ${GATE} の1枚・コンパスは ${COMPASS} の1つ`,
		same(cellsOf((ch) => ch === TILE.STONE), STONES) && same(cellsOf((ch) => ch === TILE.BUTTON), Object.values(BUTTONS))
		&& same(cellsOf((ch) => ch === TILE.GATE), [GATE]) && same(cellsOf((ch) => ch === TILE.ITEM_COMPASS), [COMPASS]));
	check(`看板・宝箱・床の物・ほかの仕掛けが無い（links も空＝門はボタンの規則で開く）`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0) && room.links.length === 0
		&& cellsOf((ch) => [TILE.SIGN, TILE.MONUMENT, TILE.CHEST, TILE.SWITCH, TILE.DOOR, TILE.KEY, TILE.TORCH, TILE.BREAKABLE_WALL,
			TILE.TIDE_GATE, TILE.SWITCH_RED, TILE.SWITCH_BLUE, TILE.GATE_RED, TILE.GATE_BLUE, TILE.ITEM_DUNGEON_MAP,
			TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION].includes(ch)).length === 0);
	{
		const bg = room.bgTiles ?? {};
		const floors = cellsOf((ch) => ch !== TILE.WALL && ch !== TILE.PIT);
		check(`下地＝床は砂・祠と門の敷居は石畳（${floors.length} マス）・壁と穴には置かない`,
			Object.keys(bg).length === floors.length
			&& floors.every((k) => bg[k] === (STONE_FLOOR.includes(k) ? TILE.STONE_FLOOR : TILE.SAND)));
	}

	// ── ② 方位盤の幾何 ──────────────────────────────────────────────
	{
		const pits = cellsOf((ch) => ch === TILE.PIT);
		const needleCells = Object.values(NEEDLES).flat();
		const square = [];
		for (let r = 3; r <= 7; r++) for (let c = 3; c <= 7; c++) square.push(`${r},${c}`);
		check(`穴は行3-7×列3-7 の四角から針の8マスを抜いた ${pits.length} 枚（中心 ${HUB} は穴）`,
			pits.length === 17 && same(pits, square.filter((k) => !needleCells.includes(k))) && at(HUB) === TILE.PIT);
		// 針＝幅1（両脇が穴）・先は中心の穴の隣＝行き止まり
		const sideOk = Object.entries(NEEDLES).every(([dir, cells]) => cells.every((k) => {
			const [r, c] = P(k);
			const sides = dir === 'north' || dir === 'south' ? [`${r},${c - 1}`, `${r},${c + 1}`] : [`${r - 1},${c}`, `${r + 1},${c}`];
			return sides.every((s) => at(s) === TILE.PIT);
		}));
		const tipOk = Object.values(NEEDLES).every(([, tip]) => {
			const [r, c] = P(tip);
			return DIRS.some(([dr, dc]) => `${r + dr},${c + dc}` === HUB);
		});
		check(`針4本は幅1（両脇が穴）で、先は中心の穴に接する行き止まり`, sideOk && tipOk);
		check(`ボタンは北の針の先と西の針の先（北西＝ボス部屋 0,0 の方角）`,
			BUTTONS.north === NEEDLES.north[1] && BUTTONS.west === NEEDLES.west[1]);
		check(`北の針に石が2つ詰まっている（口 ${STONES[0]} と針の中 ${STONES[1]}）`,
			STONES[1] === NEEDLES.north[0] && P(STONES[0])[0] === P(STONES[1])[0] - 1 && P(STONES[0])[1] === P(STONES[1])[1]);
		// 奥の石は、口の石をどけない限り押せない＝押す立ち位置（北＝口の石・南＝針の先）に歩いて立てない
		const foot = reach(t);
		check(`奥の石 ${STONES[1]} を押す立ち位置（${STONES[0]}／${BUTTONS.north}）に、初めは歩いて立てない`,
			!foot.has(STONES[0]) && !foot.has(BUTTONS.north));
		// 祠は門でしか出入りできない・ボタンは門の隣に無い（ボタンに立ったまま門へ1歩で入れない）
		check(`コンパスには門を通らないと届かない（門と石を壁にした歩行で届かない）`, !foot.has(COMPASS));
		const [gr, gc] = P(GATE);
		check(`ボタンは門の隣に無い（ボタンに立ったまま門をくぐれない）`,
			Object.values(BUTTONS).every((k) => { const [r, c] = P(k); return Math.abs(r - gr) + Math.abs(c - gc) > 1; }));
		check(`門の前 (4,10) には歩いて届く`, foot.has('4,10'));
		// 通り道：西の口から南の口へ、石に触れずに歩いて行ける
		check(`西の口から南の口へ石に触れずに歩いて行ける（通り道）`, EXITS.south.every((k) => foot.has(k)));
		const floors = cellsOf((ch) => !BLOCKED.has(ch) && ch !== TILE.GATE && ch !== TILE.STONE);
		const shut = new Set([...SHRINE, GATE, BUTTONS.north]);
		check(`祠と北の針の先のほかは、床のどのセルにも歩いて立てる`, floors.filter((k) => !shut.has(k)).every((k) => foot.has(k)));
	}

	// ── ③ ソルバー＝解ける・詰まない・飾りでない ─────────────────────
	{
		const m = solveRoom();
		check(`口からコンパスまで最短 ${m.L} 手（想定 ${SHORTEST}）・押し ${m.pushes}（想定 ${PUSHES}）`, m.L === SHORTEST && m.pushes === PUSHES);
		check(`最初の押しは口の石を横へどける（${m.pushList[0]}）`, m.pushList[0]?.startsWith(`${STONES[0]}→`) && P(m.pushList[0].split('→')[1])[0] === P(STONES[0])[0]);
		check(`入って詰む状態が無い（noEscape=${m.noEscape}＝部屋を出れば石は戻る）`, m.noEscape === 0);
		check(`貪欲（ボタンへの距離が減る押しだけ）では解けない`, m.greedy === false);
		check(`詰みの状態がある（${m.deadlocks}＝押し方を誤ると戻せない・出直せば戻る）`, m.deadlocks > 0);
		check(`最短解でボタンが埋まる順は北→西の1通り（${JSON.stringify(m.orders)}）`,
			JSON.stringify(m.orders) === JSON.stringify([[m.buttons.indexOf(BUTTONS.north), m.buttons.indexOf(BUTTONS.west)]]));
		check(`対照：石を押さなければコンパスに届かない`, solveRoom(TARGET, { noPush: true }).L === null);
		for (const k of STONES) check(`対照：石 ${k} を消すと届かない（石は2つとも要る）`, solveRoom(withCell(k, '.')).L === null);
		// 穴が謎を作っている：穴を全部床にすると押しの数が減る（針へ真っすぐ押す縛りが消える）
		const flat = TARGET.map((row) => row.replaceAll('x', '.'));
		const f = solveRoom(flat);
		check(`対照：穴を床にすると別物（押し ${f.pushes} < ${PUSHES}）`, f.L !== null && f.pushes < PUSHES);
	}

	// ── ④ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const sameSet = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			sameSet(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			sameSet(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：コンパスの部屋を「砂の方位盤」に作り替える（キュー41 第3陣）`);
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
