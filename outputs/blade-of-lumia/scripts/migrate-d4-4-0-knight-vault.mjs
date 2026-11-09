// dungeon_4 `4,0`（`3,0` の東の行き止まり＝東の列の北端）：素の部屋を「炉番の盾騎士」に作り替える
// （2026-10-25 / PLAN 実行キュー 92 の7室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 ......r....#     ← 西の口だけが開いた行き止まり
//      9 ############
//   床にルピー×5 が1つ落ちているだけ・敵なし。
//
// ■ 新しい `4,0`＝炉番の盾騎士
//      0 ############
//      1 #......#...#
//      2 #......#.B.#     ← 宝物庫（東・中は 3×8）の宝箱 (2,9)
//      3 #..ll..#...#
//      4 ...ll...ζ..#     ← 西の口（行4-5）／宝物庫の戸口 (4,7)（幅1）を盾騎士 ζ (4,8) が西を向いて塞ぐ
//      5 ...ll..#...#
//      6 #..ll..#...#     ← 溶岩の池（2×4）＝広間の真ん中の柱。池の四辺はどこも幅2（騎士の横をすり抜けられる）
//      7 #......#...#
//      8 #......#...#
//      9 ############
//   ・**主題＝持ち場を塞ぐ盾騎士を、溶岩の池を柱にして回り込む。** 盾騎士は正面からの攻撃を全部弾き、
//     弾き返す（`meta.blockFacing`）。幅1の戸口で正面から向き合うと、剣も矢もブーメランも通らない。
//     ∴戸口では戦わない＝気づかせて広間へおびき出し、池の周りを回って横か背後を取る
//     （向き直りは 720ms ごとの離散判断＝回った直後に隙がある）。騎士は遅い＝池を一周して先に戸口へ
//     駆け込めば、戦わずに宝を取ることもできる（どちらも正解）。
//   ・本編ダンジョンで盾騎士が出るのはここが先（進行順 D1→D2→D3→D4→D6→D5→D8→D7＝D7 `3,4`「空の盾騎士の細橋」が
//     再演＝橋では回り込めない∴爆弾）。⚠️ D7 `3,4` の「盾騎士は D7 初出」は、この部屋で失効する。
//   ・**騎士は壁越しには出てこない**（`enemyChase` は道を探さない＝寄る向きの2択だけ）。勇者が北や南の道に居ると、
//     宝物庫の壁の内側で同じ行へ寄るだけ＝出てくるのは勇者が戸口の行（行4）に立ったときだけ。∴戸口の前で
//     気づかせ、すぐ北か南へ逃げて広間へ引き出す（実測＝`.scratch/q92/probe-4-0e.mjs`：(4,5) で気づかせて即
//     北→西→南と回ると、騎士は池の東か北に残り、勇者は無傷で宝箱へ。戸口の正面で 20 tick 立ち止まるとハート4つ減る）。
//   ・木の剣は騎士に 1 しか通らない（hp 18・def 1）＝横から 18 回斬る正攻法は重い。倒すのは任意（ブーメランで
//     横から止めると楽）。答えの芯は「戸口では向き合わない」。
//   ・Fable レビュー #2（D4 はほぼ無戦闘）を薄める戦い。脅威度 36.0（看板 `2,3` の 42.0 より軽い）。
//   ・D4 の他の部屋と型を分けた＝`0,3` 怨念の封じ祠（もや）／`3,2` 溶岩の十字路と地図の袋小路（追ってくる亀）／
//     `3,1` 呪い火の炉（置き炎）／`4,3` 火口湖の甲羅島（開いた甲羅を弓で射る）／`4,2` 爆弾鬼の封じ窯（敵の爆弾で
//     ひびを壊させる）／`4,1` 溶岩の川向こうの薬棚（ブーメランで持ち帰る）／`3,3` 溶岩越しの灯火。
//   ・ロウソク無しで解ける（`3,1`→`3,0` から来られる）。
//
// ■ 撤去したもの
//   床のルピー×5（旧 (4,6)）。報酬は宝箱のルピー×20 に置き換えた。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝箱1つと中身／床の拾い物・出現条件なし／外周の口の形が不変
//   ・宝物庫へは戸口 (4,7) からしか入れない（幅1）・対照＝戸口を壁にすると宝箱に届かない／取り残しなし
//   ・溶岩の池の周りを一周できる（池に接する歩けるマスが1つの輪になっている）
//   ・敵は戸口の内側の ζ×1 だけ・西向き／脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-4-0-knight-vault.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-4-0-knight-vault.mjs         # 書き込み

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
export const ROOM  = '4,0';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#......#...#',
	'#......#.B.#',
	'#..ll..#...#',
	'...ll...ζ..#',
	'...ll..#...#',
	'#..ll..#...#',
	'#......#...#',
	'#......#...#',
	'############',
];
export const CHEST = '2,9';
export const CHEST_CONTENT = { type: 'item', item: 'scroll', name: '剣技の巻物' };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
export const DOOR = '4,7';           // 宝物庫の戸口（幅1）
export const KNIGHT = '4,8';         // 戸口のすぐ内側で西を向く
export const KNIGHT_DIR = 'left';
export const POOL = ['3,3', '3,4', '4,3', '4,4', '5,3', '5,4', '6,3', '6,4'];
export const OPENING = ['4,0', '5,0'];
export const VAULT_COLS = [8, 9, 10];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

// 部屋の中だけの歩行（4近傍）。敵のセルは床とみなす・床のアイテムと宝箱の手前まで踏める（宝箱のセルは届けばよい）。
export function reach(grid, starts) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
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

// 宝箱は「隣のマスまで歩ければ開けられる」。
export function chestReachable(grid, walk) {
	const [r, c] = parse(CHEST);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([a, b]) => walk.has(key(a, b)));
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
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#.]/g, '.') === ringOf(TARGET).replace(/[^#.]/g, '.'));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = { [KNIGHT]: KNIGHT_DIR };

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = parse(k); return t[r]?.[c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱は ${CHEST} の1つだけ・中身は ${CHEST_CONTENT.name}`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT }));
	check(`床の拾い物・出現条件・signData が空・床のルピーが無い`,
		!Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length
		&& !Object.keys(room.signData ?? {}).length && !flat.includes(TILE.ITEM_RUPEE) && !flat.includes(TILE.ITEM_RUPEE_LARGE));
	check(`溶岩の池は ${POOL.length} マス（実測 ${flat.filter((ch) => ch === TILE.LAVA).length}）`,
		POOL.every((k) => at(k) === TILE.LAVA) && flat.filter((ch) => ch === TILE.LAVA).length === POOL.length);

	// ── ② 歩行：宝物庫の入口は戸口だけ・取り残しなし ───────────────────
	const walk = reach(t, OPENING);
	check(`宝箱 ${CHEST} の隣まで歩ける`, chestReachable(t, walk));
	{
		const [dr, dc] = parse(DOOR);
		check(`戸口 ${DOOR} は幅1（上下 ${t[dr - 1][dc]}${t[dr + 1][dc]} が壁）`, t[dr - 1][dc] === TILE.WALL && t[dr + 1][dc] === TILE.WALL);
		const wallCol = [];
		for (let r = 1; r < ROWS - 1; r++) if (r !== dr && t[r][dc] !== TILE.WALL) wallCol.push(key(r, dc));
		check(`宝物庫の西の壁（列${dc}）は戸口のほかに開いていない（開いた所 ${wallCol.join(' ') || 'なし'}）`, wallCol.length === 0);
		const shut = t.map((row, r) => row.map((x, c) => (key(r, c) === DOOR ? TILE.WALL : x)));
		check(`対照：戸口を壁にすると宝箱に届かない`, !chestReachable(shut, reach(shut, OPENING)));
	}
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (!HARD_BLOCKED.has(t[r][c]) && t[r][c] !== TILE.CHEST) floors.push(key(r, c));
	}
	const stranded = floors.filter((k) => !walk.has(k));
	check(`床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

	// ── ③ 池の周りを一周できる ─────────────────────────────────────────
	{
		// 池を囲む外周（8近傍で池に接する歩けるマス）が、4近傍で1本の輪になっているか＝
		// 各マスの輪の中の隣が2つずつで、つながりが1つ。
		const poolSet = new Set(POOL);
		const ring = new Set();
		for (const k of POOL) {
			const [r, c] = parse(k);
			for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
				const nk = key(r + dr, c + dc);
				if (!poolSet.has(nk) && walk.has(nk)) ring.add(nk);
			}
		}
		const deg = [...ring].map((k) => {
			const [r, c] = parse(k);
			return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => ring.has(key(r + dr, c + dc))).length;
		});
		const one = reach(t.map((row, r) => row.map((x, c) => (ring.has(key(r, c)) ? x : TILE.WALL))), [[...ring][0]]);
		check(`池の周りの ${ring.size} マスが1本の輪（どのマスも輪の隣が2つ・つながり1つ）`,
			ring.size === 2 * (2 + 4) + 4 && deg.every((d) => d === 2) && [...ring].every((k) => one.has(k)));
		// 池の四辺の道はどれも幅2＝騎士がその道に居ても横をすり抜けられる（幅1だと騎士の正面しか通れない
		// ＝叩き台の初版は池の東が幅1で、騎士が東の道に居座って戸口へ戻れなかった）。
		const rs = POOL.map((k) => parse(k)[0]), cs = POOL.map((k) => parse(k)[1]);
		const [r0, r1, c0, c1] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)];
		const lane = (cells) => cells.every((k) => walk.has(k));
		const north = [], south = [], west = [], east = [];
		for (let c = c0 - 2; c <= c1 + 2; c++) { north.push(key(r0 - 1, c), key(r0 - 2, c)); south.push(key(r1 + 1, c), key(r1 + 2, c)); }
		for (let r = r0; r <= r1; r++) { west.push(key(r, c0 - 1), key(r, c0 - 2)); east.push(key(r, c1 + 1), key(r, c1 + 2)); }
		check(`池の四辺の道はどれも幅2（北 ${lane(north)}・南 ${lane(south)}・西 ${lane(west)}・東 ${lane(east)}）`,
			lane(north) && lane(south) && lane(west) && lane(east));
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は戸口の内側の ζ×1 だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.SHIELD_KNIGHT}@${KNIGHT}`);
		const [kr, kc] = parse(KNIGHT), [dr, dc] = parse(DOOR);
		check(`ζ は戸口の東隣・西を向く（enemyDirs ${JSON.stringify(room.enemyDirs)}）`,
			kr === dr && kc === dc + 1 && room.enemyDirs[KNIGHT] === 'left');
		check(`ζ は宝物庫の中（列 ${VAULT_COLS.join('-')}）`, VAULT_COLS.includes(kc));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（ζ 36.0）が D4 の看板部屋 2,3（${sig}）より軽い`, threat === 36 && threat < sig);
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
		check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「炉番の盾騎士」に作り替える（キュー92 の7室目）`);
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
