// dungeon_8 `3,0`：飾りの「石＋ボタンの門」部屋を「二色の鐘」（色ゲート＋弓）に作り替える
// （2026-09-28 / PLAN 実行キュー 34 の5室目・設計は Opus、主題はユーザー確定＝案 A）
//
// ■ 何が壊れていたか（着手前の実測）
//      0 ############
//      2 #.......B..#     ← 宝箱 B(2,8)＝ルピー×15・showConditions `stonesPushed`
//      3 #..*..S....#     ← 石 *(3,3)・ボタン S(3,6)
//      4 #.......T..#     ← 門 T(4,8)＝宝箱とは無関係（閉じていても宝箱の前に歩いて行ける）
//      9 #####..#####     ← 口は南だけ（3,1 の北の行き止まり＝寄り道の報酬部屋）
//   `stonesPushed` はエンジンに無い trigger（`game/conditions.js` evaluateConditions に分岐が
//   無い）∴宝箱は「何かが封印されているようだ…」で**永久に開かなかった**。
//
// ■ 新しい `3,0`＝二色の鐘
//      0 ############
//      1 #...#..#...#
//      2 #.B.)[.(...#     ← 宝箱 B(2,2)（北西）・青門 (2,4)・赤の鐘 [(2,5)・赤門 (2,7)
//      3 #...#~~#...#
//      4 ##(##~~##)##     ← 赤門 (4,2)（北西↔南西）・青門 (4,9)（北東↔南東）
//      5 #...~~~~...#
//      6 #...~~~~...#
//      7 #...).](...#     ← 青門 (7,4)・青の鐘 ](7,6)・赤門 (7,7)
//      8 #...i..#...#     ← 石碑 i(8,4)（壁の1枚を置き換え＝区画の仕切りは変わらない）
//      9 #####..#####
//   水は bgTiles の '~'（tiles 側は '.'）＝[[blade-water-single-source-readers]]。
//   ・池は幅2以上＝はしご（幅1だけ渡れる）で渡れない。池の周りの6区画（南の入口・南西・
//     南東・北西・北・北東）を、境目6か所の色ゲートだけでつなぐ。
//   ・色ゲートは `activeColor` が自色のときだけ開く＝**赤と青は同時に開かない**。鐘（色スイッチ）
//     は叩くとその色に「セット」する（トグルではない・`game/player.js` setActiveColor）。
//   ・投擲物を止めるのは壁と未破壊の '!' だけ（`isTilePassableForProj`）＝矢は水も閉じた門も
//     越える∴「池越し／閉じた門越しに鐘を射る立ち位置を探す」のが謎の本体。
//     銅の剣以上の溜め撃ち（剣ビーム）も鐘を鳴らせる＝射線は矢と同じ（鐘を同じ行・列に
//     置かないので、鐘を貫くビームでも結果が変わらない）。剣で隣を叩くだけでは解けない。
//   ・解き筋（最短＝色の切り替え 4 回）：①入口から池越しに北の赤を射る→赤門 (7,7)
//     ②南東で赤門越しに西の青を射る→青門 (4,9) ③北東で閉じた赤門 (2,7) 越しに赤を射る
//     ④北の廊下から池越しに南の青を射る→青門 (2,4) ⑤宝箱。
//   ・おとり＝宝箱の真下の南西区画は入口から青で入れるが、そこから赤を射る射線が無い
//     ＝赤門 (4,2) を開けられない（帰り道にだけ使える＝北西から東へ赤を射て南西へ抜ける）。
//   ・石もボタンも置かない＝笛の resetStones（activeColor も null に戻す）は発火しない
//     （fluteEffect を持たない）∴「色門の奥で笛を吹いて閉じ込められる」罠（darklord_prison
//     0,1 の注記 (f)）が起きない。
//   ・D8 の他の部屋の主題（倉庫番・笛・はしご・爆弾の鬼）と重ならない。本編で色ゲートを
//     石なしで学ぶ部屋はここが初めて（`void_shrine 0,0`・`darklord_prison 0,1` は石＋色）。
//   ・報酬＝ルピー×20（旧 15）。D6 `3,0`（20）・D7 `3,0`（20／25）と同じ帯。
//
// ■ 撤去したもの
//   石・ボタン・門 T・旧宝箱 B(2,8)・showConditions の `stonesPushed`・旧水 (7,2)(7,9)。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／bgTiles／links（空）／宝の中身／showConditions（空）／石碑が狙いどおり
//   ・色ゲートが本物＝両方閉・赤だけ開・青だけ開のどれでも宝箱に届かない／両方開なら届く
//   ・実ゲームと同じ遷移のソルバー（`lib/blade-solver.mjs`・D8 の道具）で：解ける・詰み 0・
//     色の切り替え最少 4 回・投擲物なし（剣で隣を叩くだけ）では解けない
//   ・対照＝赤の鐘／青の鐘を壁にすると解けない（鐘が両方とも必須）
//   ・はしごで架けられる水が 1 枚も無い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d8-3-0-twin-bells.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d8-3-0-twin-bells.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, TILE_META } from '../shared/tiles.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer, HARD_BLOCKED, isLadderBridgeCell } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_8';
const ROOM  = '3,0';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
// tiles は '.'、水は下の POOL（bgTiles）で重ねる。表示用の図はファイル冒頭。
const TARGET = [
	'############',
	'#...#..#...#',
	'#.B.)[.(...#',
	'#...#..#...#',
	'##(##..##)##',
	'#..........#',
	'#..........#',
	'#...).](...#',
	'#...i..#...#',
	'#####..#####',
];
// 池＝(3,5)(3,6)(4,5)(4,6) と rows 5-6 × cols 4-7。
const POOL = {};
for (const k of ['3,5', '3,6', '4,5', '4,6']) POOL[k] = TILE.WATER;
for (let r = 5; r <= 6; r++) for (let c = 4; c <= 7; c++) POOL[`${r},${c}`] = TILE.WATER;
const CHEST     = '2,2';
const RED_BELL  = '2,5';
const BLUE_BELL = '7,6';
const SIGN      = '8,4';
const RED_GATES  = ['2,7', '4,2', '7,7'];
const BLUE_GATES = ['2,4', '4,9', '7,4'];
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } };
const SIGN_DATA = {
	[SIGN]: {
		name: '二色の 鐘',
		lines: [
			'【二色の鐘の間】',
			'赤の門と 青の門は 決して 同時には 開かぬ。',
			'鐘を 鳴らせば 門の色が 移る。',
			'鐘の音は 水も 格子も 越えてゆく。',
		],
	},
};
const WANT_COLOR_CHANGES = 4;

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);

const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=', '(', ')']) });
const baseClosed = layerRun();
const baseOpen = layerRunOpen();

const before = room.tiles.map(rowStr);
const beforeBg = { ...(room.bgTiles ?? {}) };
const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if (!same(room.bgTiles ?? {}, POOL)) {
	room.bgTiles = { ...POOL };
	log.push(`  ${ROOM}: bgTiles（池の水 ${Object.keys(POOL).length} 枚）を敷いた（旧 ${Object.keys(beforeBg).join(' ') || 'なし'}）`);
}
if ((room.links ?? []).length) {
	log.push(`  ${ROOM}: links を空にした`);
}
room.links = [];
if (!same(room.chestContents ?? {}, CHEST_CONTENTS)) {
	log.push(`  ${ROOM}: 宝箱を ${Object.entries(room.chestContents ?? {}).map(([k, v]) => `${k}=${v.name}`).join(' ') || 'なし'} → ${CHEST}=ルピー×20 にした`);
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
}
if (Object.keys(room.showConditions ?? {}).length) {
	log.push(`  ${ROOM}: showConditions（${Object.entries(room.showConditions).map(([k, v]) => `${k}=${v.trigger}`).join(' ')}）を外した`);
}
room.showConditions = {};
if (!same(room.signData ?? {}, SIGN_DATA)) {
	log.push(`  ${ROOM}: 石碑 ${SIGN}「${SIGN_DATA[SIGN].name}」を置いた`);
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
}
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const isWater = (bg, k) => bg[k] === TILE.WATER;
const bg2d = (bg) => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (isWater(bg, `${r},${c}`) ? '~' : 'g')));
// 入口（南の口 row9）から歩ける床。open に入れた色の門だけ通す（'red'/'blue'）。
function walkable(t, bg, openColors = []) {
	const ok = (r, c) => {
		const ch = t[r][c];
		if (isWater(bg, `${r},${c}`)) return false;
		if (ch === TILE.GATE_RED) return openColors.includes('red');
		if (ch === TILE.GATE_BLUE) return openColors.includes('blue');
		if (ch === TILE.SWITCH_RED || ch === TILE.SWITCH_BLUE) return true;
		return !HARD_BLOCKED.has(ch);
	};
	const seen = new Set(), q = [];
	for (let c = 0; c < COLS; c++) if (ok(9, c)) { seen.add(`9,${c}`); q.push([9, c]); }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k)) continue;
			if (!ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}
// 実ゲームと同じ遷移（lib/blade-solver.mjs）で、解けるか・詰み・色の切り替え最少回数を測る。
const tools = toolsUsableIn(data)[LAYER] ?? new Set();
function solve(t, bg, { noTools = false } = {}) {
	const S = makeSolver(t, bg2d(bg), [], {}, new Set(), {
		hasLadder: tools.has('ladder'), hasCandle: tools.has('candle'),
		noTools: noTools || !(tools.has('bow') || tools.has('bomb') || tools.has('boomerang')),
	});
	const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, [], 0, 0, 0); });
	const edges = new Map();
	const seen = new Set(starts), q = [...starts];
	for (let h = 0; h < q.length; h++) {
		const ns = S.nextStates(q[h]); edges.set(q[h], ns);
		for (const n of ns) if (!seen.has(n)) { seen.add(n); q.push(n); }
	}
	const colorOf = (s) => s.split('|')[6];
	// 0-1 BFS：色が変わる手を 1、それ以外を 0。
	const cost = new Map(starts.map((s) => [s, 0]));
	const dq = [...starts];
	while (dq.length) {
		const s = dq.shift();
		for (const n of edges.get(s)) {
			const w = colorOf(n) !== colorOf(s) ? 1 : 0;
			const nk = cost.get(s) + w;
			if (cost.has(n) && cost.get(n) <= nk) continue;
			cost.set(n, nk);
			if (w) dq.push(n); else dq.unshift(n);
		}
	}
	const goals = q.filter((s) => s.split('|')[0] === CHEST);
	const changes = goals.length ? Math.min(...goals.map((s) => cost.get(s))) : null;
	// 詰み＝外周の口へ戻れない到達状態
	const rev = new Map();
	for (const [s, ns] of edges) for (const n of ns) { if (!rev.has(n)) rev.set(n, []); rev.get(n).push(s); }
	const ok = new Set(q.filter((s) => S.exitCells.includes(s.split('|')[0])));
	const rq = [...ok];
	for (let h = 0; h < rq.length; h++) for (const p of rev.get(rq[h]) ?? []) if (!ok.has(p)) { ok.add(p); rq.push(p); }
	return { solved: goals.length > 0, changes, states: q.length, noEscape: q.length - ok.size };
}

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
const bg = room.bgTiles;
const count = (ch) => t.flat().filter((x) => x === ch).length;
const cellsOf = (ch) => t.flatMap((row, r) => row.flatMap((x, c) => (x === ch ? [`${r},${c}`] : []))).sort();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`${ROOM} の bgTiles＝池の水 ${Object.keys(POOL).length} 枚`, same(bg, POOL));
check(`水の下は全部 tiles '.'（鐘・門・石碑の下に水が無い）`, Object.keys(bg).every((k) => { const [r, c] = k.split(',').map(Number); return t[r][c] === TILE.FLOOR; }));
check(`${ROOM} の links が空`, same(room.links, []));
check(`${ROOM} の宝箱＝${CHEST} のルピー×20 だけ`, same(room.chestContents, CHEST_CONTENTS) && count(TILE.CHEST) === 1 && t[2][2] === TILE.CHEST);
check(`${ROOM} の showConditions が空（エンジンに無い trigger を残さない）`, same(room.showConditions, {}));
for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SWITCH]) {
	check(`${ROOM} に '${ch}' が残っていない`, count(ch) === 0);
}
check(`赤の鐘は ${RED_BELL} の1つ・青の鐘は ${BLUE_BELL} の1つ`, same(cellsOf(TILE.SWITCH_RED), [RED_BELL]) && same(cellsOf(TILE.SWITCH_BLUE), [BLUE_BELL]));
check(`赤門＝${RED_GATES.join(' ')}・青門＝${BLUE_GATES.join(' ')}`, same(cellsOf(TILE.GATE_RED), [...RED_GATES].sort()) && same(cellsOf(TILE.GATE_BLUE), [...BLUE_GATES].sort()));
check(`石碑 ${SIGN} に本文がある（{name,lines} 形式）`, t[8][4] === TILE.SIGN && Array.isArray(room.signData[SIGN]?.lines) && room.signData[SIGN].lines.length > 0 && Object.keys(room.signData).length === 1);
check(`初期の色が未設定（initActiveColor なし＝両方の門が閉じて始まる）`, room.initActiveColor == null);
check(`fluteEffect なし（笛で色が null に戻る罠を作らない）`, room.fluteEffect == null);

// ── ② 色ゲートが本物＝片方の色だけでは宝箱に届かない ─────────────────────
{
	const none = walkable(t, bg), red = walkable(t, bg, ['red']), blue = walkable(t, bg, ['blue']);
	const both = walkable(t, bg, ['red', 'blue']);
	check(`門が両方閉じたままでは宝箱 ${CHEST} に届かない`, !none.has(CHEST));
	check(`赤だけ開けても宝箱に届かない`, !red.has(CHEST));
	check(`青だけ開けても宝箱に届かない`, !blue.has(CHEST));
	check(`両方開いていれば届く（盤面の形として道はある）`, both.has(CHEST));
	check(`門が閉じたまま入口から立てるのは南の4セルと口だけ`, same([...none].filter((k) => !k.startsWith('9,')).sort(), ['7,5', '7,6', '8,5', '8,6']));
}

// ── ③ ソルバー（実ゲームと同じ遷移）───────────────────────────────────
{
	const m = solve(t, bg);
	check(`解ける（D8 の道具＝${[...tools].join(' ')}・状態 ${m.states}）`, m.solved);
	check(`詰み 0（どの状態からも南の口へ戻れる・実測 ${m.noEscape}）`, m.noEscape === 0);
	check(`色の切り替え最少 ${WANT_COLOR_CHANGES} 回（実測 ${m.changes}）`, m.changes === WANT_COLOR_CHANGES);
	const sword = solve(t, bg, { noTools: true });
	check(`剣で隣を叩くだけ（投擲物なし）では解けない＝矢か剣ビームが必須（状態 ${sword.states}）`, !sword.solved);
	// 剣ビーム（銅の剣以上の溜め撃ち）は色スイッチを**貫いて**進む（game/projectile.js の beam 分岐は
	// break しない）＝1本の線に鐘が2つ並ぶと「最後に通った色」になり、矢（当たって消える）と
	// 結果が変わる。鐘を同じ行・列に置かない＝ソルバーの矢モデルがビームにもそのまま当てはまる。
	const [rr, rc] = RED_BELL.split(',').map(Number), [br, bc] = BLUE_BELL.split(',').map(Number);
	check(`赤と青の鐘が同じ行にも同じ列にも無い（ビームで両方を1本で鳴らせない）`, rr !== br && rc !== bc);
	for (const [label, cell] of [['赤の鐘', RED_BELL], ['青の鐘', BLUE_BELL]]) {
		const k = grid();
		const [r, c] = cell.split(',').map(Number);
		k[r][c] = TILE.WALL;   // [[blade-control-experiment-needs-tile-wall]]
		check(`対照：${label} ${cell} を壁にすると解けない`, !solve(k, bg).solved);
	}
	// 対照＝池の真ん中 (5,5)(6,5) を壁にすると、入口から北の赤を射る線が断たれて解けない
	const blocked = grid();
	blocked[5][5] = TILE.WALL;
	const bgB = { ...bg }; delete bgB['5,5'];
	check(`対照：池の (5,5) を壁にすると入口から赤を射る線が断たれて解けない`, !solve(blocked, bgB).solved);
}

// ── ④ はしごで池を渡れない ──────────────────────────────────────────
// ゲーム本体の `game/passable.js` isLadderBank は TILE_META の passable を見る＝鐘（passable:true）
// も橋脚になる∴ゲーム側の判定を写して数える（色門は保守側で橋脚にしない）。
const gameBank = (tt, bgx, r, c) => {
	if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
	const ch = tt[r][c];
	if (ch === TILE.WATER || ch === TILE.PIT || isWater(bgx, `${r},${c}`)) return false;
	return TILE_META[ch]?.passable ?? true;
};
const gameBridge = (tt, bgx, r, c) =>
	(gameBank(tt, bgx, r - 1, c) && gameBank(tt, bgx, r + 1, c)) ||
	(gameBank(tt, bgx, r, c - 1) && gameBank(tt, bgx, r, c + 1));
{
	const bridges = Object.keys(bg).filter((k) => gameBridge(t, bg, ...k.split(',').map(Number)));
	check(`はしごで架けられる水が 1 枚も無い（実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
	const helper = Object.keys(bg).filter((k) => isLadderBridgeCell(t, ROWS, COLS, ...k.split(',').map(Number), bg));
	check(`lib/connectivity.mjs の判定でも 0 枚（実測 ${helper.join(' ') || 'なし'}）`, helper.length === 0);
	// 対照＝(6,5)(6,6)(6,7) を床にすると (6,4) が (6,3) 床と (6,5) 床に挟まれた幅1の水になる
	// ＝検査が空虚でない（池を幅2以上に保っていることが橋0の根拠）
	const bg3 = { ...bg }; delete bg3['6,5']; delete bg3['6,6']; delete bg3['6,7'];
	check(`対照：(6,5)〜(6,7) を床にすると (6,4) がはしご橋として検出される`, gameBridge(t, bg3, 6, 4));
}

// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	const sameSet = (a, b) => same([...a].sort(), [...b].sort());
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, sameSet(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, sameSet(open.reachedRooms, baseOpen.reachedRooms));
	check(`${ROOM} に到達できる（寄り道の部屋として生きている）`, closed.reachedRooms.has(ROOM));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：飾りの石＋ボタンの門を「二色の鐘」に作り替える（キュー34 5室目）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${ROOM}・水は ~ で重ねて表示）`);
const show = (row, i, b) => row.split('').map((ch, c) => (ch === '.' && isWater(b, `${i},${c}`) ? '~' : ch)).join('');
room.tiles.forEach((row, i) => {
	const was = show(before[i], i, beforeBg), now = show(rowStr(row), i, bg);
	console.log(`   ${String(i).padStart(2)} ${was}   ${was === now ? '=' : '→'}   ${now}`);
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
