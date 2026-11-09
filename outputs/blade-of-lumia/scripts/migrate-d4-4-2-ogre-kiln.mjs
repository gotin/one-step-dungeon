// dungeon_4 `4,2`（`3,2` 溶岩の十字路の東の行き止まり）：素の部屋を「爆弾鬼の封じ窯」に作り替える
// （2026-10-25 / PLAN 実行キュー 92 の5室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 ......r....#     ← 西の口だけが開いた行き止まり
//      9 ############
//   真ん中にルピー×5 が1つ落ちているだけ・敵なし。
//
// ■ 新しい `4,2`＝爆弾鬼の封じ窯
//      0 ############
//      1 #....#λ...##     ← 窯（北東・中は 2×4）に爆弾鬼 λ。窯は壁だけで閉じている＝入口が無い
//      2 #....#....##
//      3 #....#######
//      4 ...........#     ← 西の口（行4-5）
//      5 ...lll.....#
//      6 #..lll.....#     ← 溶岩の池（飾り＋走る道を分ける）
//      7 ##.........#
//      8 #B!........#     ← 宝物庫：宝箱 B(8,1) の東の壁がひび `!`(8,2)
//      9 ############
//   ・**主題＝敵の爆弾でひびを壊させる。** D4 では爆弾を持っていない（爆弾は D6 の報酬）。ひびの奥の宝箱は
//     見えているのに、剣でも矢でもブーメランでもロウソクでも崩れない。崩せるのは窯の中の爆弾鬼が投げる爆弾だけ
//     （λ の爆風はプレイヤーの爆弾と同じ `explodeAt` を通り、breakPower 3 で `!` を壊す）。
//     爆弾は**投げた瞬間のプレイヤーのセル**に落ちる（追わない）∴ひびの隣に立って投げさせ、落ちる前に離れる。
//   ・窯は壁だけで閉じている＝λ へは歩いて届かず、矢・ブーメランの線も壁で切れ、ロウソクの炎を置ける隣のマスも無い
//     ＝**倒せない砲台**。∴ひびを壊す前に λ を倒してしまい宝が取れなくなる、という詰みは起きない
//     （ダンジョンの敵は再入室で復活しない＝倒せる位置に置くと取り返しがつかない）。
//   ・λ の爆弾は放物線で壁を越える（`lobStep`）。投げられる距離 7・2 マスより近いと投げない（minRange）。
//     窯の南西の角 (2,6) から、ひびを壊せる立ち位置 (7,2)(7,3)(8,3) まで 5.8〜6.7 マス＝届く。
//     西の口 (4,0) も 6.3 マス＝入った瞬間から投げてくる＝「足元を狙う」を宝物庫を見る前に覚える。
//   ・D4 で爆弾の予告になる＝`0,3` が「ロウソクでしか祓えないもや」でロウソクを予告したのと対（つい）。
//     D6 で爆弾を手に入れてから戻れば、自分の爆弾でも崩せる（別解）。
//   ・D4 の他の部屋と型を分けた＝`0,3` 怨念の封じ祠（もや）／`3,2` 溶岩の十字路と地図の袋小路（追ってくる亀）／
//     `3,1` 呪い火の炉（置き炎）／`4,3` 火口湖の甲羅島（開いた甲羅を弓で射る）／`3,3` 溶岩越しの灯火。
//     既存の λ の部屋とも違う＝D7 `4,1`「空の爆弾鬼の岬」（λ を詰め寄って倒す／駆け抜ける）は λ を倒す相手として
//     使った。ここの λ は**倒せない道具**。
//   ・ロウソク無しで解ける（`3,2` から来られる＝ロウソクより先に来られる）。
//
// ■ 例外（DECISIONS 2026-08 の「爆弾で開ける仕掛けのある画面に λ を置かない」との関係）
//   あの規則は field の爆弾関門（プレイヤーの爆弾で開ける進行の門）を λ が勝手に壊すのを防ぐためのもの。
//   ここのひびは進行の門ではなく（宝箱1つの行き止まり）、λ に壊させることが答え＝規則の意図に触れない。
//
// ■ 撤去したもの
//   床のルピー×5（旧 (4,6) の r と floorItems）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝箱1つ＝ルピー×50・出現条件なし／ひび1枚（breakDef 1・λ の breakPower で壊れる）／外周の口の形が不変
//   ・宝箱はひびが壊れる前は届かず、壊れると届く／取り残しなし
//   ・窯へは歩いて届かず、窯の隣に歩けるマスが無い（ロウソクの炎を置けない）／歩けるマスから窯の中へ縦横の
//     壁の無い線が無い（矢・ブーメランが届かない）／対照＝窯の壁を1枚床にすると線ができる
//   ・ひびを壊せる立ち位置（爆風の半径の中・歩ける）があり、λ がそこへ投げられる（距離 2〜7）
//   ・敵は窯の中の λ×1 だけ・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-4-2-ogre-kiln.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-4-2-ogre-kiln.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_4';
export const ROOM  = '4,2';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#....#λ...##',
	'#....#....##',
	'#....#######',
	'...........#',
	'...lll.....#',
	'#..lll.....#',
	'##.........#',
	'#B!........#',
	'############',
];
export const KILN = ['1,6', '1,7', '1,8', '1,9', '2,6', '2,7', '2,8', '2,9'];
export const OGRE = '1,6';
export const CHEST_CELL = '8,1';
export const CRACK = '8,2';
export const OPENING = ['4,0', '5,0'];
export const BREAKABLE_WALLS = { [CRACK]: { breakDef: 1 } };

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

// 部屋の中だけの歩行（4近傍）。敵のセルは床とみなす・床のアイテムも踏める。
// broken＝壊れたひびの集合（床として扱う）。
export function reach(grid, starts, broken = new Set()) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		// ⚠️ HARD_BLOCKED は `!` を含まない（接続の検査は「爆弾で開く」扱い）∴ここで明示的に止める。
		if (ch === TILE.BREAKABLE_WALL) return broken.has(key(r, c));
		if (ENEMY_META[ch]) return true;
		return !HARD_BLOCKED.has(ch);
	};
	for (const k of starts) {
		const [r, c] = parse(k);
		if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); }
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}

// 歩けるマス（walk）から窯の中のマスへ、縦横に並んで間に壁の無い線（矢・ブーメランの線）。
// 投擲物を止めるのは壁（とひび）だけ＝溶岩の上は飛ぶ。
export function linesIntoKiln(grid, walk) {
	const out = [];
	for (const to of KILN) {
		const [r0, c0] = parse(to);
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			for (let r = r0 + dr, c = c0 + dc, d = 1; r >= 0 && c >= 0 && r < ROWS && c < COLS; r += dr, c += dc, d++) {
				const ch = grid[r][c];
				if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
				if (walk.has(key(r, c))) out.push({ from: key(r, c), to, dist: d });
			}
		}
	}
	return out;
}

// λ の投げられる間合い（enemy-ai.js enemyAttack の reach＝hitbox.js enemyEdgeDist＝体の端からプレイヤーまで）。
// 1×1 の体の半幅は 0（enemyHalf）＝セルの中心どうしの距離。⚠️ 0.5 を引くと 1 マス近く甘く出る
// （叩き台の初版で (8,3) を「届く」と数え、実機では 7.21 で投げなかった）。
export function edgeDist(fromKey, toKey) {
	const [r0, c0] = parse(fromKey), [r1, c1] = parse(toKey);
	return Math.hypot(r1 - r0, c1 - c0);
}

// ひびを壊せる立ち位置＝歩けるマスのうち、そこへ落ちた爆風（半径 radius）がひびに掛かるもの。
export function standCells(walk, radius) {
	const [cr, cc] = parse(CRACK);
	return [...walk].filter((k) => { const [r, c] = parse(k); return Math.hypot(r - cr, c - cc) <= radius; });
}

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
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	// 外周の口の形＝西の口（行4-5）だけが開いていること。宝物庫の壁 (7,0)・(8,0) は外周のまま。
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#.]/g, '.') === ringOf(TARGET).replace(/[^#.]/g, '.'));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = { [CHEST_CELL]: { type: 'rupee', value: 50, name: 'ルピー×50' } };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = { ...BREAKABLE_WALLS };
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = parse(k); return t[r]?.[c]; };
	const flat = t.flat();
	const ogreMeta = ENEMY_META[TILE.BOMB_OGRE];
	const blast = ogreMeta.attack.blast;
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱は ${CHEST_CELL} の1つだけ＝ルピー×50・出現条件なし（最初から置いてある）`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST_CELL) === TILE.CHEST
		&& room.chestContents[CHEST_CELL]?.type === 'rupee' && room.chestContents[CHEST_CELL]?.value === 50
		&& !Object.keys(room.showConditions).length);
	check(`ひびは ${CRACK} の1枚だけ・breakDef 1（λ の breakPower ${blast.breakPower} で壊れる）`,
		flat.filter((ch) => ch === TILE.BREAKABLE_WALL).length === 1 && at(CRACK) === TILE.BREAKABLE_WALL
		&& JSON.stringify(room.breakableWalls) === JSON.stringify(BREAKABLE_WALLS) && blast.breakPower >= 1);
	check(`旧ルピー r は残っていない・床の拾い物と signData が空`,
		!flat.includes(TILE.ITEM_RUPEE) && !Object.keys(room.floorItems).length && !Object.keys(room.signData ?? {}).length);

	// ── ② 歩行：宝物庫とひび ────────────────────────────────────────────
	const walk = reach(t, OPENING);
	const walkBroken = reach(t, OPENING, new Set([CRACK]));
	check(`宝箱 ${CHEST_CELL} はひびが壊れる前は届かない`, !walk.has(CHEST_CELL));
	check(`ひびが壊れると宝箱 ${CHEST_CELL} に届く`, walkBroken.has(CHEST_CELL));
	{
		const [r, c] = parse(CHEST_CELL);
		const sides = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => t[a]?.[b]);
		check(`宝箱の隣はひび1枚と壁だけ（実測 ${sides.join('')}）`,
			sides.filter((ch) => ch === TILE.BREAKABLE_WALL).length === 1 && sides.every((ch) => ch === TILE.WALL || ch === TILE.BREAKABLE_WALL));
	}
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const k = key(r, c);
		if (!HARD_BLOCKED.has(t[r][c]) && t[r][c] !== TILE.BREAKABLE_WALL && !KILN.includes(k) && k !== CHEST_CELL) floors.push(k);
	}
	const stranded = floors.filter((k) => !walk.has(k));
	check(`窯と宝物庫の外の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

	// ── ③ 窯：λ は倒せない ──────────────────────────────────────────────
	check(`窯（${KILN.length} マス）へは歩いて届かない`, KILN.every((k) => !walk.has(k) && !walkBroken.has(k)));
	{
		const touching = [];
		for (const k of KILN) {
			const [r, c] = parse(k);
			for (const n of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => key(a, b))) {
				if (!KILN.includes(n) && (walk.has(n) || walkBroken.has(n))) touching.push(n);
			}
		}
		check(`窯の隣に歩けるマスが無い＝ロウソクの炎を置けない・剣が届かない（実測 ${touching.join(' ') || 'なし'}）`, touching.length === 0);
		const fence = new Set();
		for (const k of KILN) {
			const [r, c] = parse(k);
			for (const n of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => key(a, b))) if (!KILN.includes(n)) fence.add(at(n));
		}
		check(`窯の囲いは壁だけ（実測 ${[...fence].join('')}）`, [...fence].join('') === TILE.WALL);
	}
	{
		const lines = linesIntoKiln(t, walkBroken);
		check(`歩けるマスから窯の中へ壁の無い縦横の線が無い＝矢もブーメランも届かない（実測 ${lines.length} 本）`, lines.length === 0);
		// 対照＝窯の南の壁 (3,7) を床にすると、線（と歩く道）ができる＝測定が空虚でない
		const open = t.map((row, r) => row.map((x, c) => (r === 3 && c === 7 ? TILE.FLOOR : x)));
		check(`対照：窯の壁 (3,7) を床にすると線ができる`, linesIntoKiln(open, reach(open, OPENING)).length > 0);
	}

	// ── ④ ひびを壊させる立ち位置 ─────────────────────────────────────────
	{
		const stands = standCells(walk, blast.radius);
		check(`ひびに爆風（半径 ${blast.radius}）が掛かる立ち位置がある（${stands.join(' ')}）`, stands.length > 0);
		const reachable = stands.filter((s) => KILN.some((k) => {
			const d = edgeDist(k, s);
			return d <= ogreMeta.attack.range && d >= ogreMeta.attack.minRange;
		}));
		check(`そのうち λ が窯の中から投げられる（距離 ${ogreMeta.attack.minRange}〜${ogreMeta.attack.range}）立ち位置がある（${reachable.join(' ')}）`, reachable.length > 0);
		const near = Math.min(...reachable.map((s) => Math.min(...KILN.map((k) => edgeDist(k, s)))));
		check(`立ち位置は λ から ${near.toFixed(2)} マス（≥ 5＝爆弾が落ちるまでに離れる猶予がある）`, near >= 5);	}

	// ── ⑤ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は窯の中の λ×1 だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.BOMB_OGRE}@${OGRE}` && KILN.includes(OGRE));
		check(`λ は歩く（move 無し）・投げるのは放物線（bombThrow）`, !ogreMeta.move && ogreMeta.attack.type === 'bombThrow');
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（λ 36.0）が D4 の看板部屋 2,3（${sig}）より軽い`, threat === 36 && threat < sig);
	}

	// ── ⑥ 層の到達性は不変 ───────────────────────────────────────────────
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「爆弾鬼の封じ窯」に作り替える（キュー92 の5室目）`);
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${rowStr(row)}`);
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
