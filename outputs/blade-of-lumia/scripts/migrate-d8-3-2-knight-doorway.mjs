// dungeon_8 `3,2`（十字路＝北 `3,1`・南 `3,3`・西 `2,2`・東 `4,2` の4つの口）：素の地図の部屋を「戸口の盾騎士」に作り替える
// （2026-10-26 / PLAN 実行キュー 93 の3室目・設計は Opus・ユーザー判断「騎士を持ち場に固定」）
//
// ■ 何が薄かったか（キュー93 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 #####..#####
//      3 #....m.....#     ← 床に地図 m(3,5) が落ちているだけ・敵なし
//      4 ............     ← 西の口・東の口（行4-5）
//      9 #####..#####     ← 南の口・北の口（列5-6）
//
// ■ 新しい `3,2`＝戸口の盾騎士
//      0 #####..#####
//      1 #......#.m.#     ← 地図の間（北東・中は 2×3）の奥に地図 m(1,9)
//      2 #......#...#
//      3 #......##ζ##     ← 戸口 (3,9)＝幅1。盾騎士 ζ が戸口に立ち、南を向いて構える（持ち場＝enemyHold）
//      4 ............
//      5 ............
//      6〜8 床
//      9 #####..#####
//   ・**主題＝持ち場を動かない盾騎士が、幅1の戸口を塞ぐ。正面からは剣も矢もブーメランも弾かれる。
//     爆弾の爆風には向きが無い＝正面でも通る（爆弾 20 ＞ 騎士の hp 18＝1発で倒れる）。**
//     盾騎士の本編での並び＝D4 `4,0`「炉番の盾騎士」（広間へおびき出して回り込む）→ **D8 `3,2`（おびき出せない＝
//     持ち場を動かない・戸口の両脇は壁＝回り込めない）** → D7 `3,4`「空の盾騎士の細橋」（橋の上で回り込めない∴爆弾＝再演）。
//   ・騎士は 720ms ごとに勇者の方へ向き直る（`tickFaceLock`＝縦と横の差が同じなら横を向く）。剣の届く距離は 1.5
//     ＝戸口の真下 (4,9) は正面・2 マス離れた (5,9) は届かない。
//   ・答えは3つ＝①(5,9) あたりから爆弾を置く（爆風の半径 2・自分は巻き込まれない）＝1発
//     ②戸口の斜め下 (4,8)/(4,10) に立つと騎士は横（壁の方）を向く＝その隙に真下へ入って斬り、
//     向き直られたら斜めへ戻る（木の剣は 1 しか通らない＝18 回・根気の答え）
//     ③倒さずに素通り（十字路の通り道は騎士の前を通らずに歩ける＝地図は任意）。
//   ・持ち場が要る理由＝持ち場が無いと騎士は勇者に気づいて戸口から出てくる＝D4 `4,0` と同じ回り込みの部屋になる
//     （「おびき出せない番兵」がこの部屋の型）。
//   ・十字路の通り道（4つの口の行き来）は地図の間の外＝塞がない。東の口（行4-5）へ抜ける行4 だけは騎士の正面を
//     横切る＝行5 を通れば届かない。
//   ・脅威度 36.0（看板 `2,1` の 85.5 より軽い）。
//   ・型を重ねない相手＝D8 `0,2` 毒ヒルの泥田（はしごで撒く）／`0,1` 眠りヒルの泥道（笛）／`3,3` 崩れた砦の桟橋
//     （爆弾で岸を作る＝壁を壊す。こちらは敵を倒す）／D4 `4,0`（回り込む）／D7 `3,4`（細橋・爆弾＝再演）。
//   ・⚠️ 最初の叩き台＝「堀の島に騎士」（2×2 の島を幅1の堀で囲み、はしごで横か背中へ渡る）は実測で捨てた
//     （`.scratch/q93/probe-3-2.mjs`）：①島の地図は渡る途中（半マス重なった時点）で拾えて騎士が関わらない
//     ②木の剣で 18 回＝島の上の斬り合いがぐだる・正面で弾かれると堀の上へ押し戻されて斬られ続ける
//     ③`0,2` と同じ「堀＋はしご＋島」の形。
//
// ■ 撤去したもの
//   床の地図 m(3,5)。地図は地図の間の奥 (1,9) へ移した。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／地図1つ／外周の口の形が不変／水・宝箱・立札・笛の効き目が無い
//   ・4つの口はどれも、はしごなしでほかの3つへ歩いて届く（騎士の前の行4 を避けても＝行5 で）
//   ・地図の間へは戸口（騎士のマス）を通るしか入れない（騎士のマスを壁にすると、はしご込みでも届かない）
//   ・戸口の両脇は壁＝騎士の横へ回れない
//   ・騎士は持ち場を動かない（enemyHold）・南向き・剣の届く距離 1.5 ＜ 2（(5,9) は安全）・爆弾の威力が hp を超える
//   ・敵は ζ×1・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d8-3-2-knight-doorway.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d8-3-2-knight-doorway.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { holdsPost } from '../shared/enemy-alert.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-0-2-leech-paddy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_8';
export const ROOM  = '3,2';
export const ROWS = 10, COLS = 12;

export const TARGET = [
	'#####..#####',
	'#......#.m.#',
	'#......#...#',
	'#......##ζ##',
	'............',
	'............',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const MAP_CELL = '1,9';
export const KNIGHT = '3,9';
export const KNIGHT_DIR = 'down';
export const FRONT = '4,9';          // 戸口の真下＝騎士の正面（剣が届く）
export const BOMB_SPOT = '5,9';      // 2 マス離れた所＝剣は届かず、爆風は届く
export const FLANKS = ['4,8', '4,10']; // 戸口の斜め下＝騎士が横を向く所
export const VAULT = ['1,8', '1,9', '1,10', '2,8', '2,9', '2,10'];
export const OPENING = { north: '0,5', south: '9,5', west: '4,0', east: '4,11' };

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
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

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#]/g, '.') === ringOf(TARGET).replace(/[^#]/g, '.'));
	room.tiles = TARGET.map((row) => [...row]);
	room.bgTiles = {};
	room.chestContents = {};
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = { [KNIGHT]: KNIGHT_DIR };
	room.enemyHold = { [KNIGHT]: true };
	delete room.enemyChase;
	delete room.fluteEffect;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`地図は地図の間の奥 ${MAP_CELL} の1つだけ`,
		flat.filter((ch) => ch === TILE.ITEM_DUNGEON_MAP).length === 1 && at(MAP_CELL) === TILE.ITEM_DUNGEON_MAP && VAULT.includes(MAP_CELL));
	check(`水・宝箱・立札・床の拾い物・出現条件・笛の効き目が無い`,
		!flat.includes(TILE.WATER) && !Object.keys(room.bgTiles).length && !flat.includes(TILE.CHEST) && !flat.includes(TILE.SIGN)
		&& !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !room.fluteEffect);

	// ── ② 歩行：十字路は通れる・地図の間へは戸口だけ ─────────────────────
	{
		const opens = Object.values(OPENING);
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!HARD_BLOCKED.has(grid[r][c])) floors.push(key(r, c));
		const lad = reach(grid, opens, { withLadder: true });
		const stranded = floors.filter((k) => !lad.has(k));
		check(`床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		// 騎士の正面と斜め下を壁にしても4つの口が互いに届く＝行5 で騎士の前を避けて通れる
		const avoid = grid.map((row) => [...row]);
		for (const k of [FRONT, ...FLANKS, KNIGHT]) { const [r, c] = parse(k); avoid[r][c] = TILE.WALL; }
		const pairs = [];
		for (const [a, ka] of Object.entries(OPENING)) {
			const f = reach(avoid, [ka]);
			for (const [b, kb] of Object.entries(OPENING)) if (a !== b && !f.has(kb)) pairs.push(`${a}→${b}`);
		}
		check(`4つの口はどれも、騎士の前（${FRONT}・${FLANKS.join('・')}）を通らずにほかの3つへ歩いて届く（届かない組 ${pairs.join(' ') || 'なし'}）`, pairs.length === 0);
		// 騎士のマスを壁にすると地図の間へ届かない（はしご込み）＝入口は戸口だけ
		const sealed = grid.map((row) => [...row]);
		{ const [r, c] = parse(KNIGHT); sealed[r][c] = TILE.WALL; }
		const s = reach(sealed, opens, { withLadder: true });
		check(`地図の間（${VAULT.length} マス）へは戸口 ${KNIGHT} を通るしか入れない（騎士のマスを壁にすると、はしご込みでも届かない）`,
			VAULT.every((k) => !s.has(k)) && VAULT.every((k) => lad.has(k)));
		const [kr, kc] = parse(KNIGHT);
		check(`戸口の両脇は壁＝騎士の横へ回れない`, grid[kr][kc - 1] === TILE.WALL && grid[kr][kc + 1] === TILE.WALL);
	}

	// ── ③ 騎士 ───────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は盾騎士 ζ×1（${KNIGHT}・${KNIGHT_DIR} 向き）（実測 ${mobs.join(' ')}）`,
			mobs.join() === `${TILE.SHIELD_KNIGHT}@${KNIGHT}` && room.enemyDirs[KNIGHT] === KNIGHT_DIR);
		check(`騎士は持ち場 ${KNIGHT} を動かない（enemyHold・holdsPost）`, holdsPost(room, KNIGHT, TILE.SHIELD_KNIGHT));
		const meta = ENEMY_META[TILE.SHIELD_KNIGHT];
		const range = meta.attack?.range ?? 0;
		const [kr] = parse(KNIGHT), [br] = parse(BOMB_SPOT);
		check(`騎士の剣の届く距離 ${range} は正面の ${FRONT}（1）に届き、${BOMB_SPOT}（${br - kr}）に届かない・向き固定（blockFacing）`,
			range >= 1 && range < br - kr && !!meta.blockFacing);
		const bomb = ITEM_META.bomb;
		check(`${BOMB_SPOT} に置いた爆弾の爆風（半径 ${bomb.aoeRadius}）が騎士へ届き、1発で倒れる（${bomb.damage} − def ${meta.def} ≧ hp ${meta.hp}）`,
			bomb.aoeRadius >= br - kr && bomb.damage - meta.def >= meta.hp);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,1'], ENEMY_META);
		check(`脅威度 ${threat}（ζ 36.0）が D8 の看板部屋 2,1（${sig}）より軽い`, threat === 36 && threat < sig);
	}

	// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：素の地図の部屋を「戸口の盾騎士」に作り替える（キュー93 の3室目）`);
	console.log(`\n## 盤面の差分（${ROOM}）`);
	TARGET.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === row ? '=' : '→'}   ${row}`);
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

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
