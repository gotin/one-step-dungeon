// dungeon_2 `2,2`（南東の環の要）：D1 の写しの部屋を「対の祠」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第3陣 1室目・設計は Opus・叩き台＝ユーザー選択「ひび割れた壁の秘密」）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      ...
//      4 ............
//      5 .....E......     ← 巡回兵 E×1 だけ
//      ...
//      9 #####..#####
//   `dungeon_1 2,2` の写しからスイッチと刻みを抜いた形（敵1体の四角い広間・報酬なし）。
//
// ■ 新しい `2,2`＝対の祠（ダンジョンで初めての「後で戻る」秘密）
//      0 #####..#####
//      1 #†.##..##.B#     ← 北の壁の対の祠（2×2・石畳）。西＝石碑／東＝宝箱
//      2 #..##..##!!#     ← 東の祠の口をひび割れた壁 `!` 2枚で封じた
//      3 #..........#
//      4 ............     ← 4つの口（北 `2,1`／南 `2,3`／西 `1,2`／東 `3,2`）は書き換え前と同じ
//      5 ...ξ........
//      6 #.......ξ..#     ← コウモリ ξ×3（脅威度 6.0＝看板部屋 2,1 の 25.0 より軽い）
//      7 #....ξ.....#
//      8 #..........#
//      9 #####..#####
//   ・石碑の文＝「西の 祠は 開かれ、東の 祠は 閉ざされた。／砂の 民は 宝を 東に 納め、封じた。／その封は 刃では 解けぬ。」
//   ・ひびは剣でもブーメランでも崩れない（breakPower 0）。爆弾（D6 の報酬・breakPower 3 ≥ breakDef 1）なら1個で2枚とも崩れる。
//     ∴D2 で来たときは「開かない封」を見せるだけ＝D6 で爆弾を手にして戻ると宝箱に届く。ゲームで初めて見るひびの壁になる。
//   ・爆弾は爆弾を拾うまで敵の落とし物でも出ない（キュー41 の同じ番で `game/combat.js`／`game/game.js` に関門を足した）
//     ＝D6 より前に爆弾が手に入る経路は無い（店も爆弾を売らない）。
//   ・宝箱の中身はルピー×50＝仮（キュー45 で見直す）。
//   ・最初の叩き台「コウモリの回廊」は実測で取り下げた（回廊が群れを解く前提が成り立たない＝PLAN キュー41）。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（4つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-2-2-twin-shrines.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-2-2-twin-shrines.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META, ATTACK_BREAK_POWER } from '../shared/items.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '2,2';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'............',
	'.....E......',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#†.##..##.B#',
	'#..##..##!!#',
	'#..........#',
	'............',
	'...ξ........',
	'#.......ξ..#',
	'#....ξ.....#',
	'#..........#',
	'#####..#####',
];
export const EXITS = { north: ['0,5', '0,6'], south: ['9,5', '9,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const ENTRY = '4,0';                        // 西の口（十字路 `1,2` から入った最初のセル）
export const MONUMENT = '1,1';
export const CHEST = '1,10';
export const CRACKS = ['2,9', '2,10'];
export const BATS = ['5,3', '6,8', '7,5'];
export const WEST_SHRINE = ['1,1', '1,2', '2,1', '2,2'];
export const EAST_SHRINE = ['1,9', '1,10', '2,9', '2,10'];
export const STONE_FLOOR = [...WEST_SHRINE, ...EAST_SHRINE];   // 祠の下地＝石畳（ほかの床は砂）
export const CHEST_CONTENT = { type: 'rupee', value: 50, name: 'ルピー×50' };   // 仮＝キュー45 で見直す
export const SIGN = {
	name: '対の祠の碑',
	lines: ['西の 祠は 開かれ、東の 祠は 閉ざされた。', '砂の 民は 宝を 東に 納め、封じた。', 'その封は 刃では 解けぬ。'],
};
export const BREAK_DEF = 1;

// 盤面の下地（bgTiles）＝祠は石畳 'o'・ほかの床は砂 'd'。壁には敷かない。
export function targetBg(t = TARGET) {
	const bg = {};
	t.forEach((row, r) => [...row].forEach((ch, c) => {
		if (ch === TILE.WALL) return;
		const k = `${r},${c}`;
		bg[k] = STONE_FLOOR.includes(k) ? TILE.STONE_FLOOR : TILE.SAND;
	}));
	return bg;
}

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
// broken＝崩した `!` のセル（そこは床として歩ける）。
export function reach(t, from = ENTRY, broken = new Set()) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk)) continue;
			const ch = t[nr][nc];
			if (BLOCKED.has(ch) && !(ch === TILE.BREAKABLE_WALL && broken.has(nk))) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
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

	// 事前条件＝盤面の外の中身が無いか、このスクリプトが書いた物（違えば黙って上書きしない）。
	const mine = {
		signData: { [MONUMENT]: SIGN },
		chestContents: { [CHEST]: CHEST_CONTENT },
		breakableWalls: Object.fromEntries(CRACKS.map((k) => [k, { breakDef: BREAK_DEF }])),
	};
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects',
		'chestContents', 'showConditions', 'enemyDirs'];
	for (const k of extras) {
		const v = room[k];
		if (!v || !Object.keys(v).length) continue;
		if (mine[k] && JSON.stringify(v) === JSON.stringify(mine[k])) continue;
		die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	}
	if (room.links?.length) die(`${ROOM} の links が空でない`);
	if (room.bgTiles && Object.keys(room.bgTiles).length
		&& JSON.stringify(room.bgTiles) !== JSON.stringify(targetBg())) die(`${ROOM} の bgTiles が想定外`);

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
	for (const [k, v] of Object.entries(mine)) {
		if (JSON.stringify(room[k] ?? {}) !== JSON.stringify(v)) { room[k] = v; log.push(`  ${ROOM}: ${k} を書いた`); }
	}
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(targetBg())) {
		room.bgTiles = targetBg();
		log.push(`  ${ROOM}: 下地（祠＝石畳・床＝砂）を敷いた`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
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
		check(`画面の縁で開いているのは4つの口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵はコウモリ ξ×3 だけ・${BATS.join(' ')}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify(BATS) && BATS.every((k) => at(k) === TILE.BAT_SWARM));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝看板部屋 2,1 の 25.0 より軽い`, threat > 0 && threat < 25);
		check(`ξ は弱点の道具を持たない`, !ENEMY_META[TILE.BAT_SWARM].weakness);
	}
	check(`石碑 ${MONUMENT} に本文 ${SIGN.lines.length} 行`, at(MONUMENT) === TILE.MONUMENT
		&& JSON.stringify(room.signData) === JSON.stringify({ [MONUMENT]: SIGN }));
	check(`宝箱 ${CHEST}（条件なし・中身 ${CHEST_CONTENT.name}）`, at(CHEST) === TILE.CHEST
		&& cellsOf((ch) => ch === TILE.CHEST).length === 1
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& Object.keys(room.showConditions ?? {}).length === 0);
	check(`ひび割れた壁は ${CRACKS.join(' ')} の2枚だけ・breakDef ${BREAK_DEF}`,
		JSON.stringify(cellsOf((ch) => ch === TILE.BREAKABLE_WALL)) === JSON.stringify(CRACKS)
		&& JSON.stringify(room.breakableWalls) === JSON.stringify(mine.breakableWalls));
	check(`爆弾なら崩せる（breakPower ${ATTACK_BREAK_POWER.bomb} ≥ ${BREAK_DEF}）・剣とブーメランでは崩れない（${ATTACK_BREAK_POWER.sword ?? 0}・${ATTACK_BREAK_POWER.boomerang}）`,
		ATTACK_BREAK_POWER.bomb >= BREAK_DEF && (ATTACK_BREAK_POWER.sword ?? 0) < BREAK_DEF && ATTACK_BREAK_POWER.boomerang < BREAK_DEF);
	check(`ほかの仕掛けが無い（門・スイッチ・石・かがり火・穴・鍵）`,
		cellsOf((ch) => [TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.STONE, TILE.TORCH, TILE.PIT, TILE.KEY, TILE.DOOR,
			TILE.SIGN].includes(ch)).length === 0 && !room.links?.length);
	{
		const bg = room.bgTiles ?? {};
		check(`下地＝祠の8マスは石畳・ほかの床は砂・壁には敷かない`,
			STONE_FLOOR.every((k) => bg[k] === 'o')
			&& cellsOf((ch) => ch !== TILE.WALL).every((k) => bg[k] === (STONE_FLOOR.includes(k) ? 'o' : TILE.SAND))
			&& cellsOf((ch) => ch === TILE.WALL).every((k) => !(k in bg)));
	}

	// ── ② 祠の幾何 ──────────────────────────────────────────────────
	{
		const foot = reach(t);
		const opened = reach(t, ENTRY, new Set(CRACKS));
		check(`爆弾なし＝4つの口と西の祠（石碑の前）に歩いて届く`,
			Object.values(EXITS).flat().every((k) => foot.has(k)) && ['1,2', '2,1', '2,2'].every((k) => foot.has(k)));
		check(`爆弾なし＝東の祠（宝箱の前 1,9）に届かない`, !foot.has('1,9'));
		check(`ひびを崩すと宝箱の前 1,9 に歩いて届く（対照）`, opened.has('1,9'));
		check(`ひびの片方だけ崩しても届く（どちらでも1枚で口になる）`,
			CRACKS.every((k) => reach(t, ENTRY, new Set([k])).has('1,9')));
		// 東の祠の口はひびだけ＝祠のほかの縁は壁。
		const ring = [];
		for (const k of EAST_SHRINE) {
			const [r, c] = P(k);
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nk = `${r + dr},${c + dc}`;
				if (!EAST_SHRINE.includes(nk)) ring.push(nk);
			}
		}
		const openRing = ring.filter((k) => !BLOCKED.has(at(k)) && !CRACKS.includes(k));
		check(`東の祠へ外から入れるのはひびの真下だけ（実測 ${openRing.join(' ') || 'なし'}）`,
			openRing.every((k) => CRACKS.some((cr) => { const [a, b] = P(cr), [x, y] = P(k); return a === x - 1 && b === y; })));
		// 爆弾の立ち位置＝ひびの真下の床 (3,9)(3,10) は歩いて届き、そこから半径2 で2枚とも崩れる。
		const radius = ITEM_META.bomb?.aoeRadius ?? 2;
		const stands = ['3,9', '3,10'].filter((k) => foot.has(k)
			&& CRACKS.every((cr) => { const [a, b] = P(cr), [x, y] = P(k); return Math.hypot(a - x, b - y) <= radius; }));
		check(`ひびの下に爆弾を置く床があり、1個で2枚とも爆風に入る（半径 ${radius}・実測 ${stands.join(' ')}）`, stands.length === 2);
		const floors = cellsOf((ch) => !BLOCKED.has(ch) && ch !== TILE.CHEST);
		const left = floors.filter((k) => !opened.has(k) && !EAST_SHRINE.includes(k));
		check(`取り残しの床 0（祠の外の床にはどこからでも歩いて立てる）`, left.length === 0);
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：南東の環の要を「対の祠」に作り替える（キュー41 第3陣）`);
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
