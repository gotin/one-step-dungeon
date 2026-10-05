// dungeon_5 `0,3`（入口 `1,3` の西の行き止まり）：D4 の写しの部屋を「凍れる水門の石渡し」に作り替える
// （2026-10-05 / PLAN 実行キュー 40 の第2陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//   `dungeon_4 0,3` と同型＝四角い広間の真ん中に床のルピー（5）が1つあるだけ。口は東だけ（行4-5）。
//   入口 `1,3`「凍れる湖の桟橋」で、西の口へは幅1の水をはしごで渡る形にした＝この部屋は
//   「はしごを持ってから入る行き止まり」（PLAN キュー40 の第1陣 1室目の項で約束した）。
//
// ■ 新しい `0,3`＝凍れる水門の石渡し（はしごは人を渡すが、石は渡さない＝石の渡し場は水門だけ）
//         0         1
//         012345678901
//      0  ############
//      1  #....~~..=B#   ← 宝箱 B(1,10)＝ルピー×30・その前の水門 =(1,9)(2,10)＝宝物庫の水門
//      2  #.*..~~..#=#   ← 石 (2,2)
//      3  #....~.....#
//      4  #.#..=......   ← 湖の水門 =(4,5)＝石が湖を渡れる唯一の所・柱 #(4,2)・東の口（行4-5）
//      5  #....~......
//      6  #.*..~.....#   ← 石 (6,2)
//      7  #....~~..S.#   ← 東のボタン S(7,9)＝宝物庫の水門を干す
//      8  #S...~~....#   ← 西の角のボタン S(8,1)＝湖の水門を干す
//      9  ############
//   ・湖（bgTiles の水 `~`）が部屋を東西に割る。幅1の所（行3・5・6）は、はしごで人だけが渡れる。
//     行1-2・行7-8 は幅2＝はしごでも渡れない（入口 `1,3` の行4 と同じ「1枚なら渡れる・2枚は無理」）。
//   ・水門 `=`（潮ゲート）は閉じている間は水（徒歩もはしごも不可）・ボタンに石が乗っている間は干上がって床になる
//     （`game/conditions.js refreshGates` ②＝links の S→= 連動）。石は水へ押し込めない
//     （`game/player.js` の stoneDestOk＝通行判定）∴**石が湖を渡れるのは干した水門 (4,5) だけ**。
//   ・西の角のボタン (8,1) → 湖の水門 (4,5)／東のボタン (7,9) → 宝物庫の水門 (1,9)(2,10)。
//     ボタンはモーメンタリ（乗っている間だけ）＝自分で踏んでも、離れた瞬間に水へ戻る∴石で押さえる。
//   ・解き筋（最短 42 手・押し 15 回）：入口から見えるのは湖の向こうの石2つ＝はしごで湖を渡る →
//     石 (6,2) を西の角のボタン (8,1) へ（湖の水門が干上がる）→ 石 (2,2) を柱を避けて行4 へ寄せ、
//     干上がった水門 (4,5) を東へ押し渡る → 東のボタン (7,9) まで押し下げる（宝物庫の水門が干上がる・
//     ボタン2つに石が乗る＝石ロック）→ 宝物庫の水門の上から宝箱。
//   ・惑わせるもの＝入口の目の前のボタン (7,9) を踏むと宝物庫の水門は干上がるが、離れると戻る／
//     手前のボタンに石を運びたくても石は湖の向こう＝**先に遠い角のボタンで湖の水門を開ける**のが鍵。
//   ・西の角のボタン (8,1) は部屋の角＝乗せた石はもう押し出せない（下も左も壁）∴湖の水門が石の下で
//     閉じる（石が水に沈む）場面は起きない。途中で詰めた石は部屋を出れば元に戻る（未解決のボタン部屋の
//     石はリセット＝`game/game.js` の enterStage）。
//   ・行き止まりの謎の部屋∴敵は置かない。木・茂み・看板は無い。旧 床のルピー（5）は撤去。
//
// ■ 実機の細部に依らないこと（厳格版のソルバーで縛る）
//   実エンジンは「はしごで水の上に居るまま石を押す」「動かした石の乗ったセルを橋脚に数える」
//   「水の上で向きを変えて降りる」を細かく許す（`game/player.js movePlayer`・`game/passable.js isLadderBank`）。
//   見た目で読めない手に解き方が頼らないよう、それらを除いた厳格版と、ソルバーそのままの緩い版の
//   **両方で同じ最短手数**になることを検証する（D7 `1,4` 空の石運びと同じ作法）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水は bgTiles だけ／口は東だけ／敵・植生・看板が無い／宝箱の中身／石・ボタン・水門・links
//   ・ソルバー（厳格・緩い）で宝箱の隣に届く・同じ最短手数・入って詰む状態が無い
//   ・対照＝はしご無し／石を押さない／石を1つ壁にする／湖の水門を普通の水にする／湖の水門の連動を外す
//     →どれも届かない（はしご・石2つ・水門が飾りでない）
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-0-3-frozen-sluice-ferry.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-0-3-frozen-sluice-ferry.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '0,3';

// 書き換え前の盤面（層の到達性の基準はこれで測る＝適用済みの地図に再実行しても同じ）
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...........',
	'#....r......',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面（`~`＝bgTiles の水・tiles 層では床）────────────────────
export const WATER_MAP = [
	'############',
	'#....~~..=B#',
	'#.*..~~..#=#',
	'#....~.....#',
	'#.#..=......',
	'#....~......',
	'#.*..~.....#',
	'#....~~..S.#',
	'#S...~~....#',
	'############',
];
export const TARGET = WATER_MAP.map((row) => row.replaceAll('~', '.'));
export const WATER = WATER_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '~' ? [`${r},${c}`] : [])));
export const EXITS = ['4,11', '5,11'];             // 口は東だけ＝書き換え前と同じ
export const CHEST = '1,10';
export const STONES = ['2,2', '6,2'];
export const LAKE_BUTTON = '8,1';                  // 湖の水門を干す（部屋の角）
export const VAULT_BUTTON = '7,9';                 // 宝物庫の水門を干す（入口の目の前）
export const LAKE_SLUICE = ['4,5'];
export const VAULT_SLUICE = ['1,9', '2,10'];
export const LINKS = [
	...LAKE_SLUICE.map((g) => ({ switchId: LAKE_BUTTON, gateId: g })),
	...VAULT_SLUICE.map((g) => ({ switchId: VAULT_BUTTON, gateId: g })),
];
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 30, name: 'ルピー×30' } };
export const SHORTEST = 42;                        // 最短手数（厳格・緩い とも）

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

// 厳格版：見た目で読めない3つの手を後継から除く（上の「実機の細部に依らないこと」）。
export function strictify(S, bg, tiles) {
	const isWater = (r, c) => bg[r]?.[c] === '~';
	const land = (r, c) => tiles[r]?.[c] !== undefined && !isWater(r, c) && !HARD_BLOCKED.has(tiles[r][c]);
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
				if (nstones !== stonesStr && isWater(pr, pc)) return false;         // 水の上から石を押さない
				if (isWater(pr, pc) && moved) {                                     // はしごの途中で曲がらない
					const ok = nr !== pr ? land(pr - 1, pc) && land(pr + 1, pc) : land(pr, pc - 1) && land(pr, pc + 1);
					if (!ok) return false;
				}
				if (isWater(nr, nc) && moved) {                                     // 石を橋脚にしない
					const stones = nstones ? nstones.split(';') : [];
					const banks = nr !== pr ? [[nr - 1, nc], [nr + 1, nc]] : [[nr, nc - 1], [nr, nc + 1]];
					if (banks.some(([r, c]) => stones.includes(`${r},${c}`))) return false;
				}
				return true;
			});
		},
	};
}
export function solveRoom(waterMap = WATER_MAP, { strict = true, links = LINKS, ...opts } = {}) {
	const { tiles, bg, linkSpec } = solverInput(waterMap, links);
	const goals = new Set(nextTo(CHEST));
	const S0 = makeSolver(tiles, bg, linkSpec, {}, new Set(), { hasLadder: true, ...opts });
	const S = strict ? strictify(S0, bg, tiles) : S0;
	const starts = EXITS.map((cell) => { const [r, c] = P(cell); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
	return measureMetrics(S, starts, (st) => goals.has(st.split('|')[0]), () => 0,
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
		log.push(`  ${ROOM}: links＝ボタン ${LAKE_BUTTON}→湖の水門 ${LAKE_SLUICE.join(' ')}／ボタン ${VAULT_BUTTON}→宝物庫の水門 ${VAULT_SLUICE.join(' ')}`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify(CHEST_CONTENTS)) {
		room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
		log.push(`  ${ROOM}: 宝箱 ${CHEST}＝ルピー×30`);
	}
	if (Object.keys(room.floorItems ?? {}).length) {
		room.floorItems = {};
		log.push(`  ${ROOM}: 旧 床のルピー（5）を撤去`);
	}
	room.signData ??= {};
	room.npcData ??= {};
	room.enemyDirs ??= {};
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
		check(`画面の縁で開いているのは東の口だけ（実測 ${open.join(' ')}）`, same(open, EXITS));
	}
	check(`敵が居ない（謎解きの部屋）`, cellsOf((ch) => !!ENEMY_META[ch]).length === 0);
	check(`植生・看板・Y・色・かがり火・壊せる壁・門 T が無い`,
		cellsOf((ch) => [TILE.TREE, TILE.BUSH, TILE.SIGN, TILE.SWITCH, TILE.SWITCH_RED, TILE.SWITCH_BLUE,
			TILE.GATE_RED, TILE.GATE_BLUE, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.GATE].includes(ch)).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`宝箱 B は ${CHEST} の1枚・中身＝ルピー×30`,
		same(cellsOf((ch) => ch === TILE.CHEST), [CHEST]) && JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`石は ${STONES.join(' ')}・ボタンは ${LAKE_BUTTON} ${VAULT_BUTTON}`,
		same(cellsOf((ch) => ch === TILE.STONE), STONES) && same(cellsOf((ch) => ch === TILE.BUTTON), [LAKE_BUTTON, VAULT_BUTTON]));
	check(`水門 = は ${[...LAKE_SLUICE, ...VAULT_SLUICE].join(' ')}・links がボタン→水門を1対ずつ指す`,
		same(cellsOf((ch) => ch === TILE.TIDE_GATE), [...LAKE_SLUICE, ...VAULT_SLUICE])
		&& JSON.stringify(room.links) === JSON.stringify(LINKS));
	check(`floorItems・showConditions・breakableWalls・mapEnters が空`,
		Object.keys(room.floorItems).length === 0 && Object.keys(room.showConditions).length === 0
		&& Object.keys(room.breakableWalls).length === 0 && Object.keys(room.mapEnters ?? {}).length === 0);
	{
		// 宝箱に面する2枚の水門ははしごの橋脚が無い（向こう側が宝箱）＝水門が閉じている限り宝箱へは寄れない
		const chestFaces = nextTo(CHEST).filter((k) => !HARD_BLOCKED.has(at(k)));
		check(`宝箱に面して立てるセルは宝物庫の水門 ${VAULT_SLUICE.join(' ')} だけ（実測 ${chestFaces.join(' ')}）`, same(chestFaces, VAULT_SLUICE));
	}
	{
		// 湖の角のボタンは下と左が壁＝乗せた石はもう押し出せない（湖の水門が石の下で閉じない）
		const [r, c] = P(LAKE_BUTTON);
		check(`湖の水門のボタン ${LAKE_BUTTON} は部屋の角（下と左が壁）`, t[r + 1][c] === TILE.WALL && t[r][c - 1] === TILE.WALL);
	}
	{
		// 湖の幅＝行1-2・7-8 は幅2（はしごでも渡れない）・行3・5・6 は幅1（はしごで渡れる）
		const widthAt = (r) => [...WATER_MAP[r]].filter((ch) => ch === '~').length;
		check(`湖の幅：行1・2・7・8 は2枚／行3・5・6 は1枚／行4 は水門`,
			[1, 2, 7, 8].every((r) => widthAt(r) === 2) && [3, 5, 6].every((r) => widthAt(r) === 1)
			&& widthAt(4) === 0 && WATER_MAP[4][5] === TILE.TIDE_GATE);
	}

	// ── ② ソルバー（状態空間）＝宝箱の隣に届く・詰まない・実機の細部に依らない ─────
	{
		const m = solveRoom();
		const lax = solveRoom(WATER_MAP, { strict: false });
		check(`厳格版で宝箱の隣に届く（L=${m.L}＝想定 ${SHORTEST}）`, m.L === SHORTEST);
		check(`緩い版も同じ最短手数（L=${lax.L}）＝読めない近道が無い`, lax.L === m.L);
		check(`入って詰む状態が無い（厳格 noEscape=${m.noEscape}・緩い ${lax.noEscape}）`, m.noEscape === 0 && lax.noEscape === 0);
		check(`対照：はしご無しでは届かない`, solveRoom(WATER_MAP, { hasLadder: false, strict: false }).L === null);
		check(`対照：石を押さなければ届かない（ボタンを自分で踏むだけでは宝箱に寄れない）`, solveRoom(WATER_MAP, { noPush: true, strict: false }).L === null);
		for (const s of STONES) {
			check(`対照：石 ${s} を壁にすると届かない（石は2つとも要る）`, solveRoom(withCell(s, TILE.WALL), { strict: false }).L === null);
		}
		check(`対照：湖の水門 (4,5) を普通の水にすると届かない（石の渡し場は水門だけ）`,
			solveRoom(withCell('4,5', '~'), { strict: false }).L === null);
		check(`対照：湖の水門の連動を外すと届かない（角のボタンが要）`,
			solveRoom(WATER_MAP, { strict: false, links: LINKS.filter((l) => l.switchId !== LAKE_BUTTON) }).L === null);
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
	console.log(`# ${LAYER} ${ROOM}：西の行き止まりを「凍れる水門の石渡し」に作り替える（キュー40 第2陣）`);
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
