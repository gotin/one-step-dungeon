// dungeon_7 `3,1`（コンパスの部屋）：D6 の写しの部屋を「羅針の間（四方の灯）」に作り替える
// （2026-10-01 / PLAN 実行キュー 31 の第1陣 4室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー31 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #....n.....#     ← コンパス n
//      3 #..u.......#     ← 茂み u
//      4 ............
//      5 ............
//      6 #......t...#     ← 木 t
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   `dungeon_6 3,1` の写し＝4方向の口がある四角い広間に、コンパスと森の木・茂みが置いてあるだけ。
//
// ■ 新しい `3,1`＝羅針の間（ブーメランの再演＝空の吹き抜けを越えて、火を四方へ運ぶ）
//      0 #####..#####     ← 4つの口（北・南 列5-6／西・東 行4-5）は変えない
//      1 #n...@.....#     ← コンパス n(1,1)・北の座 (1,5)
//      2 #...%H%....#     ← 北の灯 H(2,5)＝唯一ロウソクが届く（北の座の真下）
//      3 #..%%%%%...#
//      4 .@%H%H%H%@..     ← 西の座 (4,1)・西の灯 (4,3)・中心の灯 (4,5)・東の灯 (4,7)・東の座 (4,9)
//      5 ...%%%%%....
//      6 #...%H%....#     ← 南の灯 H(6,5)
//      7 #....%.....#
//      8 #.........B#     ← 宝箱 B(8,10)＝ルピー×50（torchesLit で出る）
//      9 #####..#####
//   （@ は説明用の印。実際の盤面は床 '.'）
//   ・広間の真ん中が羅針盤の形（菱形）に空 '%' へ抜け落ち、東西南北の先と中心にかがり火 H が
//     5枚浮く。北の灯だけが縁（北の座 (1,5)）に接し、ほかの4枚は四方が空＝隣に立てない
//     ∴ロウソク（前方1マス・`game/game.js` playCandle）では点けられない。
//   ・ブーメランは空の上を越える（投擲物を止めるのは壁と罅割れ壁だけ）。点いた灯を通ると炎を
//     拾い、炎を持って消えた灯を通ると点ける（`game/projectile.js` collectAlongBoomerang＝往路・
//     復路の両方）。
//   ・解（木のブーメラン＝届き ↑←4／→↓5）：
//       ① 北の座でロウソク → 北の灯
//       ② 北の座から下へ投げる＝北の灯で炎を拾い、中心と南の灯を点ける（経線に火が通る）
//       ③ 西の座から右へ投げる＝往路は西の灯を火を持たずに素通りし、中心で炎を拾って、
//          復路で西の灯を点ける
//       ④ 東の座から左へ投げる＝同じく中心で拾って復路で東の灯を点ける
//     銀・星のブーメランは届きが長い＝③で東まで一度に点く（手が1つ減るだけ。ロウソク無しでは
//     どの段でも解けない＝下の ③ が実測）。
//   ・D7 の道具で、D7 の部屋にまだ一度も出ていなかったのがロウソク（かがり火は D7 に0枚だった）。
//     火の受け渡しは D4 `3,3`（溶岩越しの灯火）で既習＝D7 では「空を越えて四方へ」の卒業版。
//   ・全点灯（`torchesLit`）で南東の隅に宝箱 B(8,10)（ルピー×50）が出る。
//   ・コンパスは北西の隅 (1,1) の床に置く＝謎を解かなくても拾える
//     （コンパス・地図の拾得は showConditions で封じられない＝`game/player.js` handleTileEvent
//     の封印判定は鍵と宝箱だけ∴隠すと「見えないのに拾える」になる。だから報酬は宝箱にした）。
//   ・4つの口は縁を一周する回廊でつながる＝灯を点けなくても通り抜けられる。
//   ・敵は置かない（謎解きの部屋）。茂み・木は撤去。看板も置かない。`initLitTorches` も置かない
//     （火元はロウソク）。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣（全ダンジョン後に祭壇で授かる）は空の上を飛べる＝飛んで灯の隣へ行けばロウソクで
//     直接点けられる。羽衣は D7 では使えない（`shared/progression.js` toolsUsableIn）＝一周目の約束
//     （ロウソク＋ブーメラン）は崩れない。
//   ・はしごは空を渡れない（`LADDER_OVER` に空が無い）＝抜け道にならない。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／4つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵・植生・石・看板が無い／宝箱の中身と showConditions／links が空／コンパスが1枚
//   ・北の灯の隣に立てる床は北の座だけ・ほかの4枚の隣に立てる床は0マス
//   ・火の受け渡しの実測（collectAlongBoomerang と同じ規則・実効の届き）で：どの段のブーメランでも
//     解がある／ロウソクだけ・ブーメランだけでは解けない／木の解は4手で①がロウソク／
//     対照＝空を全部床にするとロウソクだけで解ける・北の灯を壁にすると解けない・
//     往路だけで測ると西の灯は点かない（復路で点けている）
//   ・ソルバー（hasCandle）で全点灯に届く／ロウソク無しでは届かない／入って詰む状態が0
//   ・どの口からでもほかの3つの口へ道具なしで歩ける／コンパスと宝箱に歩いて届く／
//     はしごがあっても歩ける範囲が増えない
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-3-1-compass-rose.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-3-1-compass-rose.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '3,1';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'#####..#####',
	'#n.........#',
	'#...%H%....#',
	'#..%%%%%...#',
	'..%H%H%H%...',
	'...%%%%%....',
	'#...%H%....#',
	'#....%.....#',
	'#.........B#',
	'#####..#####',
];
// 口のセル（隣室との開き）＝書き換え前と同じ。
const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
const TORCH_N = '2,5', TORCH_C = '4,5', TORCH_S = '6,5', TORCH_W = '4,3', TORCH_E = '4,7';
const SEAT_N = '1,5', SEAT_W = '4,1', SEAT_E = '4,9';
const COMPASS_CELL = '1,1';
const CHEST_CELL   = '8,10';
const CHEST_CONTENTS  = { [CHEST_CELL]: { type: 'rupee', value: 50, name: 'ルピー×50' } };
const SHOW_CONDITIONS = { [CHEST_CELL]: { trigger: 'torchesLit' } };

// ブーメランの実効の届き（セル数）＝`migrate-d4-3-3-lava-relay.mjs` reachOf と同じ式
// （`game/projectile.js` の往路をなぞる・一周目の速度）。↑← と →↓ で 1 セル違う。
function reachOf(tier) {
	const step = tier.speed * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
const TIERS = BOOMERANG_TIERS.map((t) => [t.name, reachOf(t)]);

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);

const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
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
// tiles は「文字の配列の配列」で持つ（行文字列にするとゲームが落ちる
// ＝[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if ((room.links ?? []).length) {
	log.push(`  ${ROOM}: links を外した`);
	room.links = [];
}
if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝ルピー×50`);
}
if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify(SHOW_CONDITIONS)) {
	room.showConditions = JSON.parse(JSON.stringify(SHOW_CONDITIONS));
	log.push(`  ${ROOM}: showConditions を ${CHEST_CELL}=torchesLit にした`);
}
room.links ??= [];
room.bgTiles ??= {};
room.signData ??= {};
room.npcData ??= {};
room.floorItems ??= {};
room.breakableWalls ??= {};
room.enemyDirs ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const at = (t, k) => { const [r, c] = P(k); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = P(k);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => inside(rr, cc)).map(([rr, cc]) => `${rr},${cc}`);
};
const cellsOf = (t, pred) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
};
const allExits = Object.values(EXITS).flat();
// 口から歩けるセル。宝箱 B・コンパス n は踏めるタイル（封印中の宝箱にも乗れる＝そこからの投げも測る）。
// withLadder なら幅 1 の穴/水を 1 マスだけ渡れる＝エンジンの進入軸の橋（`game/passable.js`）。
function walkable(t, from, { withLadder = false } = {}) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const seen = new Set(), q = [];
	for (const k of from) { const [r, c] = P(k); if (!blocked(r, c)) { seen.add(k); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(k)) continue;
			const ladderOk = withLadder && LADDER_OVER.has(t[nr][nc])
				&& inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc);
			if (blocked(nr, nc) && !ladderOk) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}

// 火の受け渡しの実測＝`collectAlongBoomerang` と同じ規則。投擲物は '#' と未破壊 '!' で止まり
// （止まったセルでも通過判定は走る）、同じ道を戻る。点いた H を通ると炎を拾い、炎を持って
// 消えた H を通ると点ける＝往路・復路とも。outboundOnly は対照用（往路だけで測る）。
function throwFrom(t, k, dir, reach, lit, { outboundOnly = false } = {}) {
	const [r, c] = P(k);
	const [dr, dc] = { 上: [-1, 0], 下: [1, 0], 左: [0, -1], 右: [0, 1] }[dir];
	const n = (dir === '上' || dir === '左') ? reach.neg : reach.pos;
	const path = [];
	for (let i = 1; i <= n; i++) {
		const kk = `${r + dr * i},${c + dc * i}`;
		const ch = at(t, kk);
		if (ch === undefined) break;
		path.push(kk);
		if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
	}
	const out = new Set(lit);
	let flaming = false;
	for (const kk of outboundOnly ? path : [...path, ...[...path].reverse()]) {
		if (at(t, kk) !== TILE.TORCH) continue;
		if (out.has(kk)) flaming = true;
		else if (flaming) out.add(kk);
	}
	return out;
}
// 状態＝点いたかがり火の集合で総当たり（最短手順を返す・解が無ければ null）。
function relay(t, reach, { candle = true, boomerang = true } = {}) {
	const torches = cellsOf(t, (ch) => ch === TILE.TORCH);
	const stand = [...walkable(t, allExits)];
	const key = (s) => [...s].sort().join('|');
	const seen = new Map([[key(new Set()), null]]);
	const q = [new Set()];
	while (q.length) {
		const s = q.shift();
		if (torches.length && torches.every((x) => s.has(x))) {
			const steps = []; let k = key(s);
			while (seen.get(k)) { const [pk, mv] = seen.get(k); steps.unshift(mv); k = pk; }
			return steps;
		}
		const moves = [];
		for (const k of stand) {
			if (candle) for (const n of nbrs(k)) {
				if (at(t, n) === TILE.TORCH && !s.has(n)) moves.push([new Set([...s, n]), `ロウソク ${k}→${n}`]);
			}
			if (boomerang) for (const d of ['上', '下', '左', '右']) {
				const n = throwFrom(t, k, d, reach, s);
				if (n.size > s.size) moves.push([n, `ブーメラン ${k}→${d}`]);
			}
		}
		for (const [n, mv] of moves) {
			const k = key(n);
			if (!seen.has(k)) { seen.set(k, [key(s), mv]); q.push(n); }
		}
	}
	return null;
}

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
	room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
for (const [name, cells] of Object.entries(EXITS)) {
	check(`${name}の口（${cells.join(' ')}）が開いている`, cells.every((k) => at(t, k) === TILE.FLOOR));
}
{
	// 口の両脇は塞がっている＝口の幅（2）が隣室と同じまま。
	const edge = [];
	for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
	for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
	const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
	check(`画面の縁で開いているのは4つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify([...allExits].sort()));
}
check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
check(`石・植生・看板・門・座が残っていない`,
	cellsOf(t, (ch) => [TILE.STONE, TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.GATE, TILE.SWITCH, TILE.BUTTON].includes(ch)).length === 0
	&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
check(`かがり火は北 ${TORCH_N}・中心 ${TORCH_C}・南 ${TORCH_S}・西 ${TORCH_W}・東 ${TORCH_E} の5枚`,
	JSON.stringify(cellsOf(t, (ch) => ch === TILE.TORCH)) === JSON.stringify([TORCH_N, TORCH_W, TORCH_C, TORCH_E, TORCH_S]));
check(`コンパス n は ${COMPASS_CELL} の1枚・宝箱 B は ${CHEST_CELL} の1枚`,
	JSON.stringify(cellsOf(t, (ch) => ch === TILE.ITEM_COMPASS)) === JSON.stringify([COMPASS_CELL])
	&& JSON.stringify(cellsOf(t, (ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST_CELL]));
check(`宝箱の中身＝ルピー×50`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
check(`showConditions＝${CHEST_CELL} が torchesLit だけ`, JSON.stringify(room.showConditions) === JSON.stringify(SHOW_CONDITIONS));
check(`links が空・initLitTorches が無い（火元はロウソク）`,
	room.links.length === 0 && !(room.initLitTorches ?? []).length);
check(`floorItems・bgTiles が空`, Object.keys(room.floorItems).length === 0 && Object.keys(room.bgTiles).length === 0);
{
	const sky = cellsOf(t, (ch) => ch === TILE.SKY).length;
	check(`吹き抜けの空が 18 マス以上（実測 ${sky}）`, sky >= 18);
}

// ── ② 歩ける床と灯の隣 ──────────────────────────────────────────────
const foot = walkable(t, allExits);
for (const [from, fromCells] of Object.entries(EXITS)) {
	const w = walkable(t, [fromCells[0]]);
	for (const [to, cells] of Object.entries(EXITS)) {
		if (to === from) continue;
		check(`道具なしで${from}の口から${to}の口へ歩ける`, cells.every((k) => w.has(k)));
	}
}
check(`コンパス ${COMPASS_CELL}・宝箱 ${CHEST_CELL}・3つの座に歩いて届く`,
	[COMPASS_CELL, CHEST_CELL, SEAT_N, SEAT_W, SEAT_E].every((k) => foot.has(k)));
{
	const nNb = nbrs(TORCH_N).filter((k) => foot.has(k));
	check(`北の灯 ${TORCH_N} の隣に立てる床は北の座 ${SEAT_N} だけ（実測 ${nNb.join(' ') || 'なし'}）`,
		nNb.length === 1 && nNb[0] === SEAT_N);
	for (const [name, k] of [['中心', TORCH_C], ['南', TORCH_S], ['西', TORCH_W], ['東', TORCH_E]]) {
		const nb = nbrs(k).filter((x) => foot.has(x));
		check(`${name}の灯 ${k} の隣に立てる床が0マス（四方が空・実測 ${nb.join(' ') || 'なし'}）`, nb.length === 0);
	}
	const floors = cellsOf(t, (ch) => ch === TILE.FLOOR || ch === TILE.CHEST || ch === TILE.ITEM_COMPASS);
	check(`床のどのセルにも歩いて行ける（取り残された床が無い）`, floors.every((k) => foot.has(k)));
	const ladder = walkable(t, allExits, { withLadder: true });
	check(`はしごがあっても空は渡れない（歩ける ${foot.size} マス＝はしご ${ladder.size} マス）`,
		!LADDER_OVER.has(TILE.SKY) && foot.size === ladder.size);
}

// ── ③ 火の受け渡しの実測 ────────────────────────────────────────────
for (const [i, [name, reach]] of TIERS.entries()) {
	const sol = relay(t, reach);
	check(`${name}（届き ↑←${reach.neg}／→↓${reach.pos}）＋ロウソクで全点灯：${sol ? sol.join(' → ') : '解なし'}`,
		sol && sol[0] === `ロウソク ${SEAT_N}→${TORCH_N}`);
	if (i === 0) {
		// 座は口のセル（(0,5) や (4,0)）でも同じ線に乗る＝手の「形」で測る：
		// ②列5を下へ・③行4を右へ・④行4を左へ。
		const isThrow = (mv, dir, line) => new RegExp(`^ブーメラン ${line}→${dir}$`).test(mv);
		check(`${name}の解は4手（ロウソク1＋列5を下へ＋行4を右へ＋行4を左へ）`, sol && sol.length === 4
			&& isThrow(sol[1], '下', '\\d+,5') && sol.some((m) => isThrow(m, '右', '4,\\d+'))
			&& sol.some((m) => isThrow(m, '左', '4,\\d+')));
	}
	check(`${name}だけ（ロウソク無し）では点かない`, relay(t, reach, { candle: false }) === null);
}
check(`ロウソクだけ（ブーメラン無し）では点かない`, relay(t, TIERS[0][1], { boomerang: false }) === null);
{
	// 対照①＝空を全部床にするとロウソクだけで全点灯できる（空の隔離が効いている証明）
	const open = grid().map((row) => row.map((ch) => (ch === TILE.SKY ? TILE.FLOOR : ch)));
	check(`対照：空を全部床にするとロウソクだけで全点灯できる`, relay(open, TIERS[0][1], { boomerang: false }) !== null);
	// 対照②＝北の灯を壁にすると（火元が無い）どの道具でも点かない
	//         （潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
	const noN = grid(); { const [r, c] = P(TORCH_N); noN[r][c] = TILE.WALL; }
	check(`対照：北の灯 ${TORCH_N} を壁にするとロウソク＋ブーメランでも点かない`, relay(noN, TIERS[0][1]) === null);
	// 対照③＝往路だけで測ると西の座からの投げは西の灯を点けない＝復路で点けていることの証明
	const wood = TIERS[0][1];
	const lit = new Set([TORCH_N, TORCH_C, TORCH_S]);
	check(`西の座→右は復路で西の灯を点ける（往復で点く／往路だけでは点かない）`,
		throwFrom(t, SEAT_W, '右', wood, lit).has(TORCH_W)
		&& !throwFrom(t, SEAT_W, '右', wood, lit, { outboundOnly: true }).has(TORCH_W));
}

// ── ④ ソルバー（状態空間）＝全点灯に届く・詰まない ─────────────────────
{
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const solve = (opts) => {
		const S = makeSolver(t, bg, [], {}, new Set(), { hasLadder: true, ...opts });
		const starts = allExits.map((cell) => {
			const [r, c] = P(cell);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const fullLit = (1 << S.torchCells.length) - 1;
		return measureMetrics(S, starts, (st) => Number(st.split('|')[4]) === fullLit, () => 0,
			{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
	};
	const on = solve({ hasCandle: true });
	check(`ソルバー（ロウソク＋ブーメラン）で全点灯に届く（L=${on.L}）`, on.L !== null);
	check(`入って詰む状態が無い（実測 noEscape=${on.noEscape}）`, on.noEscape === 0);
	check(`対照：ソルバーでもロウソク無しでは全点灯に届かない`, solve({ hasCandle: false }).L === null);
}

// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
		same(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
		same(open.reachedRooms, baseOpen.reachedRooms));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：コンパスの部屋を「羅針の間（四方の灯）」に作り替える（キュー31 第1陣）`);
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
