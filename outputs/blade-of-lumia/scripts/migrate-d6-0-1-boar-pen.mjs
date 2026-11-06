// dungeon_6 `0,1`（猪の木立ち `0,2` の北＝`1,1` への迂回路）：薄い部屋を「猪の囲い」に作り替える
// （2026-11-06 / PLAN 実行キュー 95 の5室目・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 ############
//      2 #....B.....#     ← 宝箱（ルピー×10）が床に置いてあるだけ
//      3 #..t....t..#     ← 木が2本
//      4 #...........     ← 東の口（`1,1` へ）
//      9 #####..#####     ← 南の口（`0,2` 猪の木立ちから）
//   四角い広間に宝箱と木が2本・敵なし。
//
// ■ 新しい `0,1`＝猪の囲い（池に囲まれた石の囲いの中に突進猪。南の壁の1枚だけが壊せる壁）
//      0 ############
//      1 #~~#.ω..#~~#     ← 突進猪 ω(1,5)＝囲いの中（中は 2×4）
//      2 #~~#....#~~#
//      3 #~~###!##~~#     ← 囲いの南の壁。壊せる壁は (3,6) の1枚だけ
//      4 #B.~~~~~~...     ← 宝箱 B(4,1)＝猪を倒すと現れる（killAll）・東の口
//      5 #..~~~~~~...
//      6 #..........#     ← 岸。(6,6) が壊せる壁の列
//      7 #.t......t.#
//      8 #..........#
//      9 #####..#####     ← 南の口
//   （`~` は bgTiles の水＝tiles 層は床）
//   ・新しい規則（2026-11-06 ユーザー判断＝案 A）＝**突進猪が頭からぶつかった壊せる壁は砕ける**
//     （`shared/enemies.js` CHARGE_BOAR の `dash.breaksWalls`・`game/enemy-ai.js` tickDash・
//     `game/projectile.js` breakWallAt）。砕いても頭を打ったことに変わりはない＝気絶はする。
//   ・猪は列に入れば**間に何があっても**突進する（tickDash の idle は視線を見ない＝南の `0,2` で
//     「木の陰に立つと木に頭を打つ」として覚えた性質）。∴岸の行6〜8 で猪と同じ列に立つと、猪は
//     囲いの南の壁へ突っ込む。普通の壁の列なら頭を打って気絶するだけ（⭐）。**壊せる壁の列（列6）
//     なら壁が砕ける**。
//   ・壁が砕けた後も列6 に立っていれば、猪はもう一度突進して池へ突っ込み、沈んで倒れる（キュー93
//     の「突進して水へ突っ込んだ雑魚は沈む」＝進行順は D6→D5→D8 ∴ここが先・D8 `4,1` 猪の泥浴び場が
//     再演）。砕けた穴から矢を射て倒してもよい。倒すと宝箱（爆弾×3）が現れる。
//   ・**爆弾では開かない**＝池が岸を壁から3マス離す。爆風は半径2（マンハッタン距離2）なので、勇者が
//     立てるどのセルからも、壊せる壁にも囲いの中の猪にも届かない（このスクリプトが全部の床で数える）。
//   ・通り抜け（南の口→東の口）に条件は付けない（`1,2` 北の岩壁の迂回路＝ユーザー判断 2026-11-05
//     「迂回はそのまま」）。
//   ・宝箱を爆弾×3 にした理由＝D6 の宝箱はルピーが多い（Fable レビュー）・この部屋は鍵の部屋 `1,0`
//     （爆弾2個）へ向かう道の途中＝爆弾の補給になる。
//   ・D6 の他の部屋と型を分けた＝`0,2` 猪の木立ち（木で猪を止めて斬る）／`0,3` ルピー喰いの檻
//     （爆弾で扉と敵を吹き飛ばす）。猪で壁を砕くのはここだけ。
//
// ■ 撤去したもの
//   床の宝箱 B(2,5)（ルピー×10）・木2本 (3,3)(3,8)。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水の下地／宝の中身と出る条件（killAll）／壊せる壁は (3,6) の1枚／外周の口の形が不変
//   ・南の口と東の口がつながる・岸の床は全部届く・宝箱に届く・囲いの中には（壁が砕けても）歩いて入れない
//   ・爆風が届かない：勇者が立てるどの床からも、壊せる壁と囲いの中がマンハッタン距離3以上
//   ・壊せる壁の列の岸 (6,6) から、壁の向こうに猪の立てるセルが同じ列で並ぶ（突進の距離 2〜9）
//   ・壊せる壁の外側の真下は水＝砕けた後の突進は池へ落ちる
//   ・敵と脅威度（看板 `2,3` より軽い）・突進猪が壊せる壁を砕く性質を持つ・層の到達性が書き換え前と同じ
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-0-1-boar-pen.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-0-1-boar-pen.mjs         # 書き込み

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

export const LAYER = 'dungeon_6';
export const ROOM  = '0,1';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（`~` は bgTiles の水）──────────────────────────────────
export const DISPLAY = [
	'############',
	'#~~#.ω..#~~#',
	'#~~#....#~~#',
	'#~~###!##~~#',
	'#B.~~~~~~...',
	'#..~~~~~~...',
	'#..........#',
	'#.t......t.#',
	'#..........#',
	'#####..#####',
];
export const TARGET = DISPLAY.map((row) => row.replaceAll('~', '.'));
export const WATER = [];
DISPLAY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
export const BOAR  = '1,5';
export const WALL  = '3,6';           // 壊せる壁（囲いの南の壁の1枚）
export const SHORE = '6,6';           // 壊せる壁の列の岸
export const CHEST = '4,1';
export const PEN = [];                // 囲いの中（2×4）
for (const r of [1, 2]) for (const c of [4, 5, 6, 7]) PEN.push(`${r},${c}`);
export const EAST_MOUTH  = ['4,11', '5,11'];
export const SOUTH_MOUTH = ['9,5', '9,6'];
export const CHEST_CONTENTS = { [CHEST]: { type: 'item', item: 'bomb', count: 3, name: '爆弾×3' } };
export const SHOW = { [CHEST]: { trigger: 'killAll', message: '{{sword}} 囲いの 主を 退けた！宝箱が現れた！' } };
export const BREAKABLE = { [WALL]: { breakDef: 1 } };
export const BLAST_RADIUS = 2;        // 爆弾の爆風（shared/items.js bomb.aoeRadius）

// 部屋の中だけの歩行（4近傍）。敵のセルと宝箱は床・水と壊せる壁は通れない
// （opened に入れた壊せる壁は砕けた後＝床）。
export function reach(grid, starts, water, opened = new Set()) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const k = `${r},${c}`;
		if (water.has(k)) return false;
		const ch = grid[r][c];
		if (ch === TILE.BREAKABLE_WALL) return opened.has(k);
		if (ENEMY_META[ch]) return true;
		if (ch === TILE.CHEST) return true;
		return !HARD_BLOCKED.has(ch);
	};
	for (const k of starts) {
		const [r, c] = k.split(',').map(Number);
		if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); }
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}

const manhattan = (a, b) => {
	const [ar, ac] = a.split(',').map(Number), [br, bc] = b.split(',').map(Number);
	return Math.abs(ar - br) + Math.abs(ac - bc);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, TARGET.length === ROWS && TARGET.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	room.chestContents = { ...CHEST_CONTENTS };
	room.showConditions = JSON.parse(JSON.stringify(SHOW));
	room.breakableWalls = JSON.parse(JSON.stringify(BREAKABLE));
	room.floorItems = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const water = new Set(Object.keys(room.bgTiles).filter((k) => room.bgTiles[k] === TILE.WATER));
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水の下地は ${WATER.length} マス（tiles 層は床）`, water.size === WATER.length && WATER.every((k) => at(k) === TILE.FLOOR));
	check(`宝箱 ${CHEST} の中身＝爆弾×3`, JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`宝箱は1つだけ`, t.flat().filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST);
	check(`宝箱は猪を倒すと現れる（showConditions は ${CHEST} の killAll だけ）`,
		JSON.stringify(Object.keys(room.showConditions)) === JSON.stringify([CHEST]) && room.showConditions[CHEST].trigger === 'killAll');
	const walls = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.BREAKABLE_WALL) walls.push(`${r},${c}`);
	check(`壊せる壁は ${WALL} の1枚だけ（実測 ${walls.join(' ')}）・breakableWalls もその1枚`,
		walls.join() === WALL && JSON.stringify(Object.keys(room.breakableWalls)) === JSON.stringify([WALL]));
	check(`床の爆弾 '5'・かがり火 'H'・石 '*' が無い`, ![TILE.ITEM_BOMB, TILE.TORCH, TILE.STONE].some((ch) => t.flat().includes(ch)));
	check(`floorItems・signData が空`, !Object.keys(room.floorItems).length && !Object.keys(room.signData ?? {}).length);

	// ── ② 歩行：通り抜けと取り残し・囲いには入れない ───────────────────
	const fromSouth = reach(t, SOUTH_MOUTH, water);
	check(`南の口から東の口へ抜けられる`, EAST_MOUTH.every((k) => fromSouth.has(k)));
	check(`南の口から宝箱 ${CHEST} に届く`, fromSouth.has(CHEST));
	check(`岸 ${SHORE} に届く`, fromSouth.has(SHORE));
	const opened = reach(t, SOUTH_MOUTH, water, new Set([WALL]));
	check(`壊せる壁が砕けても囲いの中には歩いて入れない（池が隔てる）`, PEN.every((k) => !opened.has(k)) && !opened.has(WALL));
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const k = `${r},${c}`;
		if (water.has(k) || PEN.includes(k)) continue;
		const ch = t[r][c];
		if (ch === TILE.FLOOR || ENEMY_META[ch] || ch === TILE.CHEST) floors.push(k);
	}
	const stranded = floors.filter((k) => !fromSouth.has(k));
	check(`囲いの外の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

	// ── ③ 爆弾では開かない＝勇者が立てるどの床からも爆風が届かない ──────
	{
		const targets = [WALL, ...PEN];
		const near = [];
		for (const k of opened) for (const tk of targets) if (manhattan(k, tk) <= BLAST_RADIUS) near.push(`${k}→${tk}`);
		check(`勇者が立てる床から壊せる壁と囲いの中はマンハッタン距離 ${BLAST_RADIUS + 1} 以上（近すぎ ${near.join(' ') || 'なし'}）`, near.length === 0);
		// 対照＝岸の水を1マス床にすると届く（検査に歯がある）
		const water2 = new Set(water); water2.delete('5,6');
		const opened2 = reach(t, SOUTH_MOUTH, water2);
		check(`対照：壁の前の水 (5,6) を床にすると爆風が壁に届く`, [...opened2].some((k) => manhattan(k, WALL) <= BLAST_RADIUS));
	}

	// ── ④ 突進の形：壊せる壁の列で猪と並ぶ・砕けた後は池へ落ちる ─────────
	{
		const dash = ENEMY_META[TILE.CHARGE_BOAR].dash ?? {};
		check(`突進猪は頭からぶつかった壊せる壁を砕く（dash.breaksWalls）`, dash.breaksWalls === true);
		const [sr, sc] = SHORE.split(',').map(Number);
		const [wr, wc] = WALL.split(',').map(Number);
		const penInCol = PEN.filter((k) => Number(k.split(',')[1]) === wc);
		const dists = penInCol.map((k) => sr - Number(k.split(',')[0]) - 0.5);   // 体の端から（tickDash と同じ）
		check(`岸 ${SHORE} と壊せる壁 ${WALL} と囲いの中 ${penInCol.join(' ')} が同じ列`, sc === wc && penInCol.length > 0);
		check(`その距離（${dists.join(' / ')}）が突進の範囲 ${dash.minRange}〜${dash.maxRange} に入る`,
			dists.every((d) => d >= dash.minRange && d <= dash.maxRange));
		const between = [];
		for (let r = wr + 1; r < sr; r++) between.push(`${r},${wc}`);
		check(`壊せる壁と岸のあいだ（${between.join(' ')}）は全部水＝砕けた後の突進は池へ落ちる`, between.length > 0 && between.every((k) => water.has(k)));
		// 囲いの他の列は普通の壁＝そこで並ぶと頭を打つだけ
		const otherCols = [4, 5, 7].map((c) => `${wr},${c}`);
		check(`囲いの南の壁の他の列（${otherCols.join(' ')}）は普通の壁`, otherCols.every((k) => at(k) === TILE.WALL));
	}

	// ── ⑤ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は突進猪 ω ${BOAR} の1体だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.CHARGE_BOAR}@${BOAR}`);
		check(`猪は囲いの中`, PEN.includes(BOAR));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（ω 1体＝36.0）が D6 の看板部屋 2,3（${sig}）より軽い`, threat === 36 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「猪の囲い」に作り替える（キュー95 の5室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・水は tiles 層では床）`);
	room.tiles.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${DISPLAY[i]}`);
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
