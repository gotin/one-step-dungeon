// dungeon_7 `1,4`（`2,4` の西の行き止まり）：D6 の写しの部屋を「空の石運び」に作り替える
// （2026-10-04 / PLAN 実行キュー 39 の第2陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー39 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #....B.....#     ← 宝箱 B(2,5)＝回復薬（素で開く）
//      3 #..........#
//      4 #...........     ← 口は東だけ（行4-5＝`2,4` の西の口へ）
//      5 #...........
//      6〜8 #..........#
//      9 ############
//
// ■ 新しい `1,4`＝空の石運び（穴の空の再演＋D7 で初めての石＝人ははしごで穴を渡れるが、石は渡れない）
//      0 ############
//      1 #BT..%S%%%%#     ← 宝箱 B(1,1)＝回復薬（大）・門 T(1,2)・北の小島のボタン S(1,6)
//      2 #%%%.x.%%%%#     ← 穴 (2,5)＝人だけが小島から宝箱の側へ渡れる
//      3 #%%%%%.%%%%#     ← 小島へ上がる1マス幅の土手 (3,6)
//      4 #S......%%..     ← 西の端のボタン S(4,1)
//      5 #.x.........     ← 穴 (5,2)＝人は渡れるが石は通れない（床なら石を行5 で東へ運ぶ近道が開く＝4手短い）
//      6 #*...*...%%#     ← 石 A(6,1)・石 B(6,5)
//      7 #...%%%%%%%#     ← 南西の張り出し（石を北へ押し上げる立ち位置）
//      8 #%%%%%%%%%%#
//      9 ############
//   ・床の南と北が空へ崩れ落ちた広間。ボタン2つ（S）に石が乗ると門 T が開く（`game/conditions.js refreshGates`
//     ①＝全ボタン ON で全 T 開・全ボタンに**石**が乗るとロック＝開いたまま）。
//   ・石は穴にも空にも入れない。人ははしごで穴を1マス渡れる（`game/passable.js LADDER_OVER`）。
//     ∴穴は「人の通り道・石の壁」。北の小島のボタン (1,6) へは土手 (3,6) を真下から押し上げるしかなく、
//     宝箱の側 (1,3)〜(1,4) へは穴 (2,5) を渡る＝石を乗せたまま人だけが宝箱へ回れる。
//   ・解き筋（最短 35 手・押し 13 回）：石 B を西へ押して溝へ寄せる → 石 A を張り出し (7,1) から北へ押して
//     西のボタン (4,1) へ → 石 B を張り出し (7,3) から北へ押し上げて行4 へ → 穴 (5,2) を渡って石 B の西 (4,2) に
//     回り、行4 を東へ (4,6) まで → 真下 (5,6) から土手を北へ押し上げて小島のボタン (1,6) へ → 穴 (2,5) を
//     渡って開いた門 T をくぐり宝箱。
//   ・行き止まりの謎の部屋∴敵は置かない。木・茂み・看板は無い。
//
// ■ 実機の細部に依らないこと（厳格版のソルバーで縛る）
//   実エンジンは「はしごで穴の上に居るまま石を押す」「石の乗ったセルを橋脚に数える」「穴の上で向きを変えて
//   降りる」を細かく許す（`game/player.js movePlayer`・`game/passable.js isLadderBank`）。見た目で読めない手に
//   解き方が頼らないよう、それらを除いた厳格版と、ソルバーそのままの緩い版の**両方で同じ最短手数**になることを
//   検証する（緩い版だけ短ければ、読めない近道がある＝盤面を作り直す）。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・翼の羽衣は D7 では使えない（`shared/progression.js` toolsUsableIn）。
//   ・はしごは D5 で手に入る＝D7 の時点で必ず持っている（`1,3`・`2,0` も同じ前提）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／口は東だけ／敵・植生・看板が無い／宝箱の中身／石・ボタン・門の位置
//   ・ソルバー（厳格・緩い）で宝箱の隣に届く・同じ最短手数・入って詰む状態が無い
//   ・対照＝はしご無し／石を押さない／石を1つ壁にする→届かない・穴 (5,2) を床にすると手数が減る（穴が石の壁として
//     効いている）・穴 (2,5) を空にすると届かない（人だけが渡る穴が要）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-1-4-sky-stone-ferry.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-1-4-sky-stone-ferry.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const ROOM  = '1,4';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#BT..%S%%%%#',
	'#%%%.x.%%%%#',
	'#%%%%%.%%%%#',
	'#S......%%..',
	'#.x.........',
	'#*...*...%%#',
	'#...%%%%%%%#',
	'#%%%%%%%%%%#',
	'############',
];
const EXITS = ['4,11', '5,11'];                // 口は東だけ＝書き換え前と同じ
const CHEST_CELL = '1,1';
const GATE_CELL = '1,2';
const BUTTONS = ['1,6', '4,1'];
const STONES = ['6,1', '6,5'];
const PITS = ['2,5', '5,2'];
const CHEST_CONTENTS = { [CHEST_CELL]: { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } };
const SHORTEST = 35;                           // 最短手数（厳格・緩い とも）

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
// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL}＝回復薬（大）（旧＝(2,5) の回復薬）`);
}
room.links ??= [];
room.bgTiles ??= {};
room.signData ??= {};
room.npcData ??= {};
room.floorItems ??= {};
room.enemyDirs ??= {};
room.showConditions ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const P = (k) => k.split(',').map(Number);
const at = (t, k) => { const [r, c] = P(k); return t[r]?.[c]; };
const cellsOf = (t, pred) => {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
	return out;
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const nextTo = (k) => { const [r, c] = P(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

// 厳格版：見た目で読めない3つの手を後継から除く（上の「実機の細部に依らないこと」）。
export function strictify(S, tiles) {
	const isPit = (r, c) => tiles[r]?.[c] === TILE.PIT;
	const land = (r, c) => tiles[r]?.[c] !== undefined && !isPit(r, c) && tiles[r][c] !== TILE.WALL && tiles[r][c] !== TILE.SKY;
	const orig = S.nextStates;
	return {
		...S,
		nextStates(state) {
			const [pos, stonesStr] = state.split('|');
			const [pr, pc] = P(pos);
			return orig(state).filter((nx) => {
				const [npos, nstones] = nx.split('|');
				const [nr, nc] = P(npos);
				const moved = nr !== pr || nc !== pc;
				if (nstones !== stonesStr && isPit(pr, pc)) return false;          // 穴の上から石を押さない
				if (isPit(pr, pc) && moved) {                                       // はしごの途中で曲がらない
					const ok = nr !== pr ? land(pr - 1, pc) && land(pr + 1, pc) : land(pr, pc - 1) && land(pr, pc + 1);
					if (!ok) return false;
				}
				if (isPit(nr, nc) && moved) {                                       // 石を橋脚にしない
					const stones = nstones ? nstones.split(';') : [];
					const banks = nr !== pr ? [[nr - 1, nc], [nr + 1, nc]] : [[nr, nc - 1], [nr, nc + 1]];
					if (banks.some(([r, c]) => stones.includes(`${r},${c}`))) return false;
				}
				return true;
			});
		},
	};
}
export function solveRoom(t, { strict = true, ...opts } = {}) {
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const goals = new Set(nextTo(CHEST_CELL));
	const S0 = makeSolver(t, bg, [], {}, new Set(), { hasLadder: true, pitCrossable: true, ...opts });
	const S = strict ? strictify(S0, t) : S0;
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	return measureMetrics(S, starts, (st) => goals.has(st.split('|')[0]), () => 0,
		{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
	room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
{
	const edge = [];
	for (let c = 0; c < COLS; c++) { edge.push(`0,${c}`, `9,${c}`); }
	for (let r = 1; r < ROWS - 1; r++) { edge.push(`${r},0`, `${r},11`); }
	const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
	check(`画面の縁で開いているのは東の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
}
check(`敵が居ない（謎解きの部屋）`, cellsOf(t, (ch) => !!ENEMY_META[ch]).length === 0);
check(`植生・看板・Y・色・かがり火・壊せる壁が無い`,
	cellsOf(t, (ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.SWITCH_RED, TILE.SWITCH_BLUE, TILE.GATE_RED, TILE.GATE_BLUE, TILE.TORCH, TILE.BREAKABLE_WALL].includes(ch)).length === 0
	&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
check(`宝箱 B は ${CHEST_CELL} の1枚・中身＝回復薬（大）`,
	same(cellsOf(t, (ch) => ch === TILE.CHEST), [CHEST_CELL])
	&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
check(`門 T は ${GATE_CELL} の1枚`, same(cellsOf(t, (ch) => ch === TILE.GATE), [GATE_CELL]));
check(`ボタン S は ${BUTTONS.join(' ')}・石は ${STONES.join(' ')}`,
	same(cellsOf(t, (ch) => ch === TILE.BUTTON), BUTTONS) && same(cellsOf(t, (ch) => ch === TILE.STONE), STONES));
check(`穴は ${PITS.join(' ')}`, same(cellsOf(t, (ch) => ch === TILE.PIT), PITS));
check(`links・showConditions・breakableWalls・floorItems・bgTiles が空（門はボタンの全押しで開く）`,
	room.links.length === 0 && Object.keys(room.showConditions).length === 0
	&& Object.keys(room.breakableWalls).length === 0 && Object.keys(room.floorItems).length === 0
	&& Object.keys(room.bgTiles).length === 0);
check(`笛の効果を持たない`, (room.fluteEffect ?? null) === null);

// ── ② ソルバー（状態空間）＝宝箱の隣に届く・詰まない・実機の細部に依らない ─────
{
	const m = solveRoom(t);
	const lax = solveRoom(t, { strict: false });
	check(`厳格版で宝箱の隣に届く（L=${m.L}＝想定 ${SHORTEST}）`, m.L === SHORTEST);
	check(`緩い版も同じ最短手数（L=${lax.L}）＝読めない近道が無い`, lax.L === m.L);
	check(`入って詰む状態が無い（厳格 noEscape=${m.noEscape}・緩い ${lax.noEscape}）`, m.noEscape === 0 && lax.noEscape === 0);
	check(`対照：はしご無しでは届かない`, solveRoom(t, { hasLadder: false }).L === null && solveRoom(t, { hasLadder: false, strict: false }).L === null);
	check(`対照：石を押さなければ届かない`, solveRoom(t, { noPush: true, strict: false }).L === null);
	for (const s of STONES) {
		const g = grid(); const [r, c] = P(s); g[r][c] = TILE.WALL;
		check(`対照：石 ${s} を壁にすると届かない（石は2つとも要る）`, solveRoom(g, { strict: false }).L === null);
	}
	const fill52 = grid(); fill52[5][2] = TILE.FLOOR;
	const l52 = solveRoom(fill52).L;
	check(`対照：穴 (5,2) を床にすると手数が減る（実測 ${l52}＝穴が石の壁として効いている）`, l52 !== null && l52 < m.L);
	const sky25 = grid(); sky25[2][5] = TILE.SKY;
	check(`対照：穴 (2,5) を空にすると届かない（人だけが渡る穴が要）`, solveRoom(sky25, { strict: false }).L === null);
}

// ── ③ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
		same(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
		same(open.reachedRooms, baseOpen.reachedRooms));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：西の行き止まりを「空の石運び」に作り替える（キュー39 第2陣）`);
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
