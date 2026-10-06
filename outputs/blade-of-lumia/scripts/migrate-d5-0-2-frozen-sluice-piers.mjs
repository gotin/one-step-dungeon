// dungeon_5 `0,2`（鉄の盾の部屋 `0,1` の南の行き止まり）：D4 の写しの部屋を「凍れる湖の水門の足場」に作り替える
// （2026-10-06 / PLAN 実行キュー 40 の第2陣 2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//   `dungeon_4 0,2` と同型＝四角い広間の真ん中に宝箱（ルピー×20）が1つあるだけ。口は北だけ（列5-6）。
//   `0,1` へははしごの部屋 `1,2` と浮氷の湖 `1,1` を越えて来る＝この部屋もはしごを持って入る行き止まり。
//
// ■ 新しい `0,2`＝凍れる湖の水門の足場（干した水門は、はしごの橋脚になる）
//         0         1
//         012345678901
//      0  #####..#####   ← 北の口（列5-6）
//      1  #.......S..#   ← 奥のボタン S(1,8)＝湖の西の足場を干す
//      2  #..*..#..*.#   ← 石 (2,3)・(2,9)・柱 #(2,6)
//      3  #..S.S.....#   ← 岸のボタン S(3,3)＝西の足場を干す（おとり）・S(3,5)＝東の足場2枚を干す
//      4  #~~~~~~~~~~#   ← 凍れる湖（行4-8）
//      5  #~~=~=~~~~~#   ← 西の足場 =(5,3)・東の足場 =(5,5)
//      6  #~~~~~~~~~~#
//      7  #~~~~=~~~~~#   ← 東の足場 =(7,5)
//      8  #~~~~.B~~~~#   ← 南の小さな岸 (8,5)・宝箱 B(8,6)＝ルピー×20
//      9  ############
//   ・はしごは「陸→水1枚→陸」しか渡れない（入口 `1,3` の行4 で見せた「1枚なら渡れる・2枚は無理」）。
//     湖は厚さ5＝そのままでは渡れない。水門 `=`（潮ゲート）は閉じている間は水と同じく渡れず
//     （はしごの橋脚にもならない）、ボタンが押されている間だけ干上がって床になる
//     （`game/conditions.js refreshGates` ②）。**干した水門は床＝はしごの橋脚になる**
//     （`game/passable.js isLadderBank` は `tilePassable` で決まる）∴湖の中に足場を作れる。
//   ・道は1本＝岸 (3,3) → 水 (4,3) → 西の足場 (5,3) → 水 (5,4) → 東の足場 (5,5) → 水 (6,5)
//     → 東の足場 (7,5) → 南の岸 (8,5)。西の足場と東の足場が**同時に**干上がっていないと渡れない
//     ＝ボタンは自分で踏んでも離れた瞬間に戻る∴石2つで押さえる。
//   ・見せ場＝岸のボタン (3,3) はおとり。石 (2,3) を真下へ1つ押すだけで乗り、西の足場が干上がるのが
//     目に見える。しかし (3,3) は湖へ降りる唯一の岸＝**石が乗っているとはしごの橋脚にならない**
//     （東の列5 も同じ＝ボタン (3,5) に石を乗せると、東の足場へ真上から降りる岸が塞がる）。
//     ∴西の足場は奥のボタン (1,8) で干し、岸のボタン (3,3) の石は東のボタン (3,5) まで送る。
//   ・解き筋（最短 29 手・押し 5 回・解は1本）：石 (2,9) を北へ回って (1,8) へ押す（西の足場が干上がる）→
//     石 (2,3) を岸のボタン (3,3) へ押し下げ、さらに東の (3,5) へ2つ押す（東の足場2枚が干上がる・
//     岸 (3,3) が空く）→ 岸 (3,3) から足場を3つ渡って南の岸へ → 宝箱。
//   ・石ロック（全ボタンに石）は立たない（ボタン3つ・石2つ）。途中で詰めた石は部屋を出れば元に戻る
//     （未解決のボタン部屋の石はリセット＝`game/game.js` の enterStage）。
//   ・行き止まりの謎の部屋∴敵は置かない。木・茂み・看板は無い。宝箱の中身は書き換え前と同じルピー×20。
//   ・隣の `0,3`（凍れる水門の石渡し）は「水門＝石の渡し場」。ここは「水門＝人の足場」＝同じ水門の別の顔。
//     D7 の型（穴の飛び石・石運び＋穴・崩れ柱・灯籠継ぎ・ブーメランで拾う・射線の弓）とも重ならない。
//
// ■ 実機の細部に依らないこと（厳格版のソルバーで縛る）
//   `0,3` と同じ厳格版（水の上から押さない・はしごの途中で曲がらない・石を橋脚にしない）と緩い版の
//   **両方で同じ最短手数**になることを検証する。ソルバーは開いた潮ゲートを橋脚に数える
//   （`blade-solver` の `openTideBanks`＝この部屋で足した・既定 off）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水は bgTiles だけ／口は北だけ／敵・植生・看板が無い／宝箱の中身／石・ボタン・水門・links
//   ・ソルバー（厳格・緩い）で宝箱の隣に届く・同じ最短手数・入って詰む状態が無い
//   ・対照＝はしご無し／石を押さない／石を1つ壁にする／開いた水門を橋脚に数えない／足場を普通の水にする／
//     奥のボタンの連動を外す→どれも届かない・おとりのボタンに石を残すと届かない
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-0-2-frozen-sluice-piers.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-0-2-frozen-sluice-piers.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';
import { strictify } from './migrate-d5-0-3-frozen-sluice-ferry.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '0,2';

// 書き換え前の盤面（層の到達性の基準はこれで測る＝適用済みの地図に再実行しても同じ）
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#....B.....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面（`~`＝bgTiles の水・tiles 層では床）────────────────────
export const WATER_MAP = [
	'#####..#####',
	'#.......S..#',
	'#..*..#..*.#',
	'#..S.S.....#',
	'#~~~~~~~~~~#',
	'#~~=~=~~~~~#',
	'#~~~~~~~~~~#',
	'#~~~~=~~~~~#',
	'#~~~~.B~~~~#',
	'############',
];
export const TARGET = WATER_MAP.map((row) => row.replaceAll('~', '.'));
export const WATER = WATER_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '~' ? [`${r},${c}`] : [])));
export const EXITS = ['0,5', '0,6'];               // 口は北だけ＝書き換え前と同じ
export const CHEST = '8,6';
export const STONES = ['2,3', '2,9'];
export const FAR_BUTTON = '1,8';                   // 西の足場を干す（奥・正解）
export const DECOY_BUTTON = '3,3';                 // 西の足場を干す（岸＝はしごの橋脚・おとり）
export const EAST_BUTTON = '3,5';                  // 東の足場2枚を干す
export const WEST_PIER = ['5,3'];
export const EAST_PIERS = ['5,5', '7,5'];
export const BANK = '3,3';                         // 湖へ降りる唯一の岸
export const LINKS = [
	...WEST_PIER.map((g) => ({ switchId: DECOY_BUTTON, gateId: g })),
	...WEST_PIER.map((g) => ({ switchId: FAR_BUTTON, gateId: g })),
	...EAST_PIERS.map((g) => ({ switchId: EAST_BUTTON, gateId: g })),
];
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } };
export const SHORTEST = 29;                        // 最短手数（厳格・緩い とも）
export const ROUTE = ['3,3', '4,3', '5,3', '5,4', '5,5', '6,5', '7,5', '8,5'];   // 湖の渡り（岸→南の岸）

const P = (k) => k.split(',').map(Number);
const nextTo = (k) => { const [r, c] = P(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };

// ソルバーの入力＝tiles と bg（水）を盤面の写しから作る。links は [スイッチ, [水門…]] の形。
export function solverInput(waterMap = WATER_MAP, links = LINKS) {
	const tiles = waterMap.map((row) => [...row].map((ch) => (ch === '~' ? '.' : ch)));
	const bg = waterMap.map((row) => [...row].map((ch) => (ch === '~' ? '~' : 'g')));
	const by = new Map();
	for (const { switchId, gateId } of links) by.set(switchId, [...(by.get(switchId) ?? []), gateId]);
	return { tiles, bg, linkSpec: [...by] };
}
// goal＝宝箱の隣の陸に立つ（既定）。goalTest を渡せば差し替えられる（対照実験用）。
export function solveRoom(waterMap = WATER_MAP, { strict = true, links = LINKS, goalTest, ...opts } = {}) {
	const { tiles, bg, linkSpec } = solverInput(waterMap, links);
	const goals = new Set(nextTo(CHEST));
	const S0 = makeSolver(tiles, bg, linkSpec, {}, new Set(), { hasLadder: true, openTideBanks: true, ...opts });
	const S = strict ? strictify(S0, bg, tiles) : S0;
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	return measureMetrics(S, starts, goalTest ?? ((st) => goals.has(st.split('|')[0])), () => 0,
		{ guardMax: 3_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
}
// 盤面の1セルを差し替えた写し（対照実験用）
export const withCell = (k, ch) => {
	const [r, c] = P(k);
	return WATER_MAP.map((row, i) => (i === r ? row.slice(0, c) + ch + row.slice(c + 1) : row));
};

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		ladder: bfsLayer(stages, START, { withLadder: true, openTiles: OPEN }),
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: true, openTiles: null }),
	});
	// 基準は書き換え前の盤面で測る＝適用済みの地図に再実行しても同じ（冪等）。
	const before = room.tiles.map(rowStr);
	const saved = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	room.bgTiles = {};
	const base = runs();
	room.tiles = saved.tiles;
	room.bgTiles = saved.bgTiles;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));   // [[field-tiles-are-char-arrays]]
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	const wantBg = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚`);
	}
	if (JSON.stringify(room.links ?? []) !== JSON.stringify(LINKS)) {
		room.links = LINKS.map((l) => ({ ...l }));
		log.push(`  ${ROOM}: links＝ボタン ${DECOY_BUTTON}・${FAR_BUTTON}→西の足場 ${WEST_PIER.join(' ')}／ボタン ${EAST_BUTTON}→東の足場 ${EAST_PIERS.join(' ')}`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
		room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
		log.push(`  ${ROOM}: 宝箱 ${CHEST}＝ルピー×20（旧 (5,5) から移した）`);
	}
	room.signData ??= {};
	room.npcData ??= {};
	room.enemyDirs ??= {};
	room.floorItems ??= {};
	room.showConditions ??= {};
	room.breakableWalls ??= {};

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c], r, c)) out.push(`${r},${c}`);
		return out;
	};
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	const bgWater = (k) => room.bgTiles[k] === TILE.WATER;

	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`${ROOM} の tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	check(`水は bgTiles だけ（${WATER.length} 枚・tiles 層に '~' が無い・水の下は床）`,
		Object.keys(room.bgTiles).length === WATER.length && WATER.every((k) => bgWater(k) && at(k) === TILE.FLOOR)
		&& cellsOf((ch) => ch === TILE.WATER).length === 0);
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k)) && !bgWater(k)).sort();
		check(`画面の縁で開いているのは北の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・Y・色・かがり火・壊せる壁・門 T が無い`,
		cellsOf((ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.SWITCH_RED, TILE.SWITCH_BLUE,
			TILE.GATE_RED, TILE.GATE_BLUE, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.GATE].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`宝箱 B は ${CHEST} の1枚・中身＝ルピー×20`,
		same(cellsOf((ch) => ch === TILE.CHEST), [CHEST]) && JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`石は ${STONES.join(' ')}・ボタンは ${FAR_BUTTON} ${DECOY_BUTTON} ${EAST_BUTTON}`,
		same(cellsOf((ch) => ch === TILE.STONE), STONES)
		&& same(cellsOf((ch) => ch === TILE.BUTTON), [FAR_BUTTON, DECOY_BUTTON, EAST_BUTTON]));
	check(`水門 = は ${[...WEST_PIER, ...EAST_PIERS].join(' ')}・links がボタン→水門を1対ずつ指す`,
		same(cellsOf((ch) => ch === TILE.TIDE_GATE), [...WEST_PIER, ...EAST_PIERS])
		&& JSON.stringify(room.links) === JSON.stringify(LINKS));
	check(`floorItems・showConditions・breakableWalls・mapEnters が空`,
		Object.keys(room.floorItems).length === 0 && Object.keys(room.showConditions).length === 0
		&& Object.keys(room.breakableWalls).length === 0 && Object.keys(room.mapEnters ?? {}).length === 0);
	{
		// 宝箱に面して立てる陸は南の小さな岸 (8,5) だけ（他の3面は水か壁）
		const chestFaces = nextTo(CHEST).filter((k) => !HARD_BLOCKED.has(at(k)) && !bgWater(k));
		check(`宝箱に面して立てる陸は南の岸 8,5 だけ（実測 ${chestFaces.join(' ')}）`, same(chestFaces, ['8,5']));
	}
	{
		// 湖へ降りられる岸は (3,3) だけ＝足場の真上に陸が接するのは (3,3)→(5,3) と (3,5)→(5,5) の2列。
		// (3,5) はボタン＝石を乗せると岸にならない・自分で踏んでも降りた瞬間に東の足場が戻る。
		check(`湖の渡り ${ROUTE.join('→')}：岸・足場・水が交互に並ぶ`,
			ROUTE.every((k, i) => (i === 0 || i === ROUTE.length - 1) ? !bgWater(k) && !HARD_BLOCKED.has(at(k))
				: (i % 2 === 1 ? bgWater(k) : at(k) === TILE.TIDE_GATE)));
		check(`おとりのボタン ${DECOY_BUTTON} は湖へ降りる岸そのもの・東のボタン ${EAST_BUTTON} は東の足場の真上`,
			BANK === DECOY_BUTTON && at(EAST_BUTTON) === TILE.BUTTON && bgWater('4,5') && at('5,5') === TILE.TIDE_GATE);
		const widthOk = [4, 6].every((r) => [...WATER_MAP[r]].slice(1, 11).every((ch) => ch === '~'));
		check(`湖の行4・行6 は全幅が水（足場を介さずに渡れる所が無い）`, widthOk);
	}

	// ── ② ソルバー（状態空間）＝宝箱の隣に届く・詰まない・実機の細部に依らない ─────
	{
		const m = solveRoom();
		const lax = solveRoom(WATER_MAP, { strict: false });
		check(`厳格版で宝箱の隣に届く（L=${m.L}＝想定 ${SHORTEST}・解 ${m.solCount} 本）`, m.L === SHORTEST && m.solCount === 1);
		check(`緩い版も同じ最短手数（L=${lax.L}）＝読めない近道が無い`, lax.L === m.L);
		check(`入って詰む状態が無い（厳格 noEscape=${m.noEscape}・緩い ${lax.noEscape}）`, m.noEscape === 0 && lax.noEscape === 0);
		check(`対照：はしご無しでは届かない`, solveRoom(WATER_MAP, { hasLadder: false, strict: false }).L === null);
		check(`対照：石を押さなければ届かない（ボタンを自分で踏むだけでは足場が揃わない）`, solveRoom(WATER_MAP, { noPush: true, strict: false }).L === null);
		for (const s of STONES) {
			check(`対照：石 ${s} を壁にすると届かない（石は2つとも要る）`, solveRoom(withCell(s, TILE.WALL), { strict: false }).L === null);
		}
		check(`対照：開いた水門を橋脚に数えないと届かない（足場が主役）`,
			solveRoom(WATER_MAP, { strict: false, openTideBanks: false }).L === null);
		for (const g of [...WEST_PIER, ...EAST_PIERS]) {
			check(`対照：足場 ${g} を普通の水にすると届かない`, solveRoom(withCell(g, '~'), { strict: false }).L === null);
		}
		check(`対照：奥のボタンの連動を外すと届かない（おとりのボタンでは渡れない）`,
			solveRoom(WATER_MAP, { strict: false, links: LINKS.filter((l) => l.switchId !== FAR_BUTTON) }).L === null);
		check(`対照：おとりのボタンの連動を外しても届く（おとりは解に要らない）`,
			solveRoom(WATER_MAP, { strict: false, links: LINKS.filter((l) => l.switchId !== DECOY_BUTTON) }).L === SHORTEST);
		{
			// おとりのボタンに石を乗せたままでは、宝箱へ届かない（石を外さない限り岸が塞がる）
			const stuckOnDecoy = solveRoom(WATER_MAP, {
				strict: false,
				goalTest: (st) => st.split('|')[0] === '8,5' && st.split('|')[1].split(';').includes(DECOY_BUTTON),
			});
			check(`対照：おとりのボタンに石が乗ったまま南の岸に着く状態は無い`, stuckOnDecoy.L === null);
		}
	}

	// ── ③ 層の到達性は不変 ───────────────────────────────────────────
	{
		const now = runs();
		for (const kind of ['ladder', 'foot', 'closed']) {
			check(`層の到達室（${kind}）が書き換え前と同じ（${now[kind].reachedRooms.size} 室）`,
				same(now[kind].reachedRooms, base[kind].reachedRooms));
		}
		check(`レイヤーの dead-edge が 0（実測 ${now.closed.deadEdges.length}）`, now.closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：南の行き止まりを「凍れる湖の水門の足場」に作り替える（キュー40 第2陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}・水は bgTiles）`);
	WATER_MAP.forEach((now, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === TARGET[i] ? '=' : '→'}   ${now}`);
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
