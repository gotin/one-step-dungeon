// dungeon_8 `2,0`（看板 `2,1`「爆弾鬼と毒の廊下」の北の行き止まり）：素の部屋を「葦の導火線」に作り替える
// （2026-10-26 / PLAN 実行キュー 93 の4室目・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー93 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      3 #....B.....#     ← 宝箱（ルピー×20）が1つ置いてあるだけ
//      9 #####..#####     ← 南の口だけが開いた行き止まり
//   敵なし・仕掛けなし。歩いて開けるだけの部屋。
//
// ■ 新しい `2,0`＝葦の導火線（2版目＝ユーザー提案「隙間をブーメランでつなぐ」・2026-10-26）
//      0 ############
//      1 #~~~uuuuuuH#     ← 奥の導火線（(2,4)→(1,4)→北の列→小島の葦 (1,9)）→ 奥のかがり火 H(1,10)
//      2 #~~~u~~~~..#     ← 奥の導火線の根元 (2,4)＝どの岸にも接しない／小島（2×2）は幅2の水に囲まれている
//      3 #uuu~~~u~~~#     ← 手前の導火線 (3,1)(3,2)(3,3)／(3,4) が水の隙間／(3,7) は囮
//      4 #u~uH~uuu~~#     ← 手前の導火線の根元 (4,1)(4,3)／中継のかがり火 H(4,4)／囮 (4,6)(4,7)(4,8)
//      5 #...~......#     ← (5,4) は水＝中継のかがり火の前に立てない（ロウソクで直に点けられない）
//      6 #..........#     ← (6,4)＝ブーメランを北へ投げる立ち位置
//      7 #........B.#     ← 封印の宝箱 B(7,9)＝かがり火が2つとも灯ると現れる（ルピー×20・中身は旧のまま）
//      8 #..........#
//      9 #####..#####
//   （`~` と小島以外の `u` の下は bgTiles の水。小島・中継のかがり火の下・岸の行5 は泥＝見た目だけ）
//   ・**主題＝つながった葦は導火線になる（新設・2026-10-26）。** ロウソクで葦を1本燃やすと、縦横に
//     隣り合う葦へ 240ms ごとに火が移り、燃えた葦の隣の消えたかがり火にも灯る（projectile.js
//     spreadFireFrom）。**火は水を越えない**＝導火線は (3,4) の水で途切れている。
//   ・**隙間はブーメランでつなぐ（新設・同日）。** 灯ったかがり火をくぐったブーメランは火を運ぶ（既存）。
//     その火の付いたブーメランが葦のマスを通ると燃え上がる（projectile.js collectAlongBoomerang）。
//     (6,4) から北へ投げる＝中継のかがり火 (4,4) で火を拾い、隙間 (3,4) を越えて奥の根元 (2,4) に火を移す
//     ＝奥の導火線が燃え広がって奥のかがり火が灯る。木のブーメランは立ち位置から 4 マス先まで届く
//     （(6,4) から (2,4) がちょうど 4 マス）＝(7,4)(8,4) からでは届かない＝**投げる場所を探す**のが謎。
//     ❌ 失効（2026-11-07・キュー95 の8室目）＝矢も火を運ぶ（火矢・D6 `1,4` で教える）＝列4 のどこから北へ
//     射ても奥の根元が燃える＝「投げる場所を探す」は消えた。✅ ユーザー判断＝許容（盤面は変えない）。残る謎＝
//     「火を運んで水の隙間をつなぐ」。番人＝`tests/d6-fire-arrow-pool.spec.js` ③。
//     中継のかがり火は灯ったまま残る＝外しても何度でも投げ直せる（燃えている葦から直に拾う形は、
//     外すと火が残らず詰む∴採らなかった）。
//   ・**水に立つ葦は剣では刈れない（新設・同日）**（combat.js cutBush）＝導火線の根元を剣で切って、
//     残りが岸から届かない所に取り残される、を起こさない。燃やすことしかできない。
//   ・入口から北へ歩くと、正面に葦の茂み（囮）がある。燃やすと火は広がるが水で止まり、かがり火は
//     灯らない＝「火はつながった葦だけを伝う」をここで見せる。
//   ・D8 の語彙の軸（PLAN 93）の「大蝦蟇の予告（ボス I は炎に弱い）」を受け持つ＝沼の神殿で火を使う
//     初めての部屋。D8 の他の部屋と型を分けた＝`0,2` 毒ヒルの泥田（はしごで堀を渡る）／`0,1` 眠りヒルの
//     泥道（笛）／`3,2` 戸口の盾騎士（爆弾）。火の部屋の先例（D2 `1,3`・D4 `3,3`・D6 `1,1`・D7 `0,1`
//     ＝ブーメランでかがり火から火を運ぶ）を、ここでは「運んだ火で導火線をつなぐ」に広げた。
//   ・敵は置かない（謎の部屋。隣の看板部屋 `2,1` が爆弾鬼と毒沼ヒルの戦闘）。
//
// ■ 検証（このスクリプトが自分で確かめる）
//   ・盤面／bgTiles（水と泥）／宝箱1つ（中身はルピー×20＝不変）・封印＝torchesLit／外周の口の形が不変
//   ・かがり火は中継 H(4,4) と奥 H(1,10) の2つ・小島は幅2以上の水に囲まれ、はしご込みでも歩いて届かない
//     （葦が燃えた後も）・中継のかがり火の隣に立てる床が無い（ロウソクで直に点けられない）
//   ・岸に接する葦はすべて水の上＝剣で刈れない・奥の導火線はどの岸にも接しない
//   ・燃え広がり＝手前の根元からは中継へ届き奥へは届かない／奥の根元からは奥のかがり火へ届く／囮は届かない
//   ・ブーメラン＝(6,4) から北へ投げると中継のかがり火→隙間→奥の根元を通る（木の届く 4 マス以内）
//   ・層の到達性（21 室・dead-edge 0）が書き換え前と同じ
//
// 使い方: node scripts/migrate-d8-2-0-reed-fuse.mjs [--dry]
//   冪等（何度流しても同じ盤面に上書きする）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-0-2-leech-paddy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_8';
export const ROOM  = '2,0';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き tiles 側は '.'。'u' は tiles の葦＝下地は水か泥） ──
export const TARGET = [
	'############',
	'#~~~uuuuuuH#',
	'#~~~u~~~~..#',
	'#uuu~~~u~~~#',
	'#u~uH~uuu~~#',
	'#...~......#',
	'#..........#',
	'#........B.#',
	'#..........#',
	'#####..#####',
];
export const TORCH = '1,10';       // 奥のかがり火（小島の上）
export const RELAY = '4,4';        // 中継のかがり火（手前の導火線が灯す・ブーメランが火を拾う）
export const GAP = '3,4';          // 導火線の隙間（水）
export const FAR_ROOT = '2,4';     // 奥の導火線の根元（ブーメランで火を移す）
export const THROW_STAND = '6,4';  // ブーメランを北へ投げる立ち位置
export const NOTCH = '5,4';        // 中継のかがり火の前の水（立てない）
export const WOOD_REACH = 4;       // 木のブーメランが立ち位置から届くマス数（実測・.scratch/q93/probe-boom.mjs）
export const CHEST = '7,9';
export const CHEST_CONTENT = { type: 'rupee', value: 20, name: 'ルピー×20' };
export const FUSE_ROOT = '4,1';     // 手前の導火線の根元（岸 FUSE_STAND に接する）
export const FUSE_STAND = '5,1';    // 根元に火を点ける立ち位置（北を向く）
export const NEAR_ROOTS = ['4,1', '4,3'];            // 岸に接する手前の導火線の葦（どちらから点けてもよい）
export const DECOY = ['3,7', '4,6', '4,7', '4,8'];   // 入口の正面の囮（燃えても水で止まる）
export const ISLET = ['1,9', '1,10', '2,9', '2,10'];  // かがり火の小島（下地は泥）
export const SHORE_MUD = ['5,1', '5,2', '5,3', '5,5', '5,6', '5,7', '5,8', '5,9', '5,10'];
export const OPENING = ['9,5', '9,6'];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// tiles（'~' を '.' に）と bgTiles（水・泥）。葦の下地は、小島の上なら泥・それ以外は水。
export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => {
		const k = key(r, c);
		if (ch === TILE.WATER || (ch === TILE.BUSH && !ISLET.includes(k))) bg[k] = TILE.WATER;
	}));
	for (const k of [...ISLET, RELAY, ...SHORE_MUD]) bg[k] = TILE.MUD;
	return bg;
}

// 燃え広がりの届く先（projectile.js scheduleFireNeighbors と同じ規則＝縦横につながった茂み＋その隣のかがり火）。
export function fireReach(grid, root) {
	const burnt = new Set([root]);
	const torches = new Set();
	const q = [parse(root)];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of N4) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc), ch = grid[nr]?.[nc];
			if (ch === TILE.TORCH) torches.add(k);
			if (ch === TILE.BUSH && !burnt.has(k)) { burnt.add(k); q.push([nr, nc]); }
		}
	}
	return { burnt, torches };
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
	room.tiles = tilesOf();
	room.bgTiles = bgOf();
	room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
	room.floorItems = {};
	room.showConditions = { [CHEST]: { trigger: 'torchesLit' } };
	room.breakableWalls = {};
	room.signData = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	delete room.enemyHold;
	delete room.enemyChase;
	delete room.fluteEffect;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const bg = room.bgTiles;
	const flat = t.flat();
	const grid = TARGET.map((row) => [...row]);   // 解析用（水を '~' で描いた図）
	check(`盤面が狙いどおり（tiles に水を置かない）`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n') && !flat.includes(TILE.WATER));
	const water = Object.entries(bg).filter(([, v]) => v === TILE.WATER).map(([k]) => k);
	const mud = Object.entries(bg).filter(([, v]) => v === TILE.MUD).map(([k]) => k);
	check(`bgTiles＝水 ${water.length} 枚・泥 ${mud.length} 枚（ほかの値なし）`, water.length + mud.length === Object.keys(bg).length && mud.length === ISLET.length + 1 + SHORE_MUD.length);
	const torchCells = [];
	t.forEach((row, r) => row.forEach((ch, c) => { if (ch === TILE.TORCH) torchCells.push(key(r, c)); }));
	check(`かがり火は中継 ${RELAY} と奥 ${TORCH}（小島の上）の2つだけ（実測 ${torchCells.join(' ')}）`,
		torchCells.sort().join() === [RELAY, TORCH].sort().join() && ISLET.includes(TORCH));
	check(`宝箱は ${CHEST} の1つだけ・中身は ${CHEST_CONTENT.name}（書き換え前と同じ）・封印＝かがり火が全部灯る（torchesLit）`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && t[parse(CHEST)[0]][parse(CHEST)[1]] === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& room.showConditions[CHEST]?.trigger === 'torchesLit' && Object.keys(room.showConditions).length === 1);
	{
		const mobs = flat.filter((ch) => ENEMY_META[ch]);
		check(`敵なし（脅威度 ${stageThreat(room, ENEMY_META)}）・立札なし・床の拾い物なし`,
			mobs.length === 0 && !flat.includes(TILE.SIGN) && !Object.keys(room.floorItems).length);
	}

	// ── ② 歩行：岸は全部届く・小島へは届かない（葦が全部燃えて水になった後も・はしご込み） ─────
	{
		const shore = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const k = key(r, c);
			if (!HARD_BLOCKED.has(grid[r][c]) && grid[r][c] !== TILE.WATER && !ISLET.includes(k)) shore.push(k);
		}
		const lad = reach(grid, OPENING, { withLadder: true });
		const stranded = shore.filter((k) => !lad.has(k));
		check(`岸の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		const burntAll = grid.map((row) => row.map((ch) => (ch === TILE.BUSH ? TILE.WATER : ch)));
		const after = reach(burntAll, OPENING, { withLadder: true });
		const isletReached = ISLET.filter((k) => lad.has(k) || after.has(k));
		check(`小島（${ISLET.join(' ')}）へは、はしご込みで歩いて届かない（葦が全部燃えて水になった後も）（届いた ${isletReached.join(' ') || 'なし'}）`,
			isletReached.length === 0);
		check(`中継のかがり火 ${RELAY} の隣に立てる床が無い（ロウソクで直に点けられない・前の ${NOTCH} は水）`,
			grid[parse(NOTCH)[0]][parse(NOTCH)[1]] === TILE.WATER && N4.every(([dr, dc]) => { const [r, c] = parse(RELAY); return !lad.has(key(r + dr, c + dc)); }));
		check(`ブーメランの立ち位置 ${THROW_STAND} は岸の上`, lad.has(THROW_STAND));
		check(`宝箱 ${CHEST} の隣に立てる（岸の上）`, N4.some(([dr, dc]) => { const [r, c] = parse(CHEST); return lad.has(key(r + dr, c + dc)); }));
		// 岸から剣の届く葦（歩ける床に隣り合う葦）はすべて下地が水＝剣で刈れない
		const touchable = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (grid[r][c] !== TILE.BUSH) continue;
			if (N4.some(([dr, dc]) => lad.has(key(r + dr, c + dc)))) touchable.push(key(r, c));
		}
		check(`岸に接する葦（${touchable.join(' ')}）はすべて水の上＝剣で刈れない（combat.js cutBush）`,
			touchable.length > 0 && touchable.every((k) => bg[k] === TILE.WATER));
		const far = fireReach(grid, FAR_ROOT).burnt;
		check(`奥の導火線（${far.size} 本）はどの岸にも接しない＝ロウソクでは点けられない`, [...far].every((k) => !touchable.includes(k)));
		check(`導火線の根元 ${FUSE_ROOT} に火を点ける立ち位置 ${FUSE_STAND} は岸の上で、根元の真下`,
			lad.has(FUSE_STAND) && parse(FUSE_STAND)[0] === parse(FUSE_ROOT)[0] + 1 && parse(FUSE_STAND)[1] === parse(FUSE_ROOT)[1]);
		const toRelay = touchable.filter((k) => fireReach(grid, k).torches.has(RELAY)).sort();
		const toFar = touchable.filter((k) => fireReach(grid, k).torches.has(TORCH));
		check(`岸から火を点けて中継のかがり火へ燃え広がるのは手前の導火線（${NEAR_ROOTS.join(' ')}）だけ（実測 ${toRelay.join(' ') || 'なし'}）`,
			toRelay.join() === [...NEAR_ROOTS].sort().join());
		check(`岸から火を点けても奥のかがり火 ${TORCH} へは燃え広がらない（実測 ${toFar.join(' ') || 'なし'}）`, toFar.length === 0);
	}

	// ── ③ 燃え広がり：手前→中継・奥→奥のかがり火・囮→どこにも／ブーメランの線 ─────────────
	{
		const near = fireReach(grid, FUSE_ROOT);
		check(`手前の根元 ${FUSE_ROOT} の火は葦 ${near.burnt.size} 本を伝って中継のかがり火 ${RELAY} に届き、奥のかがり火には届かない（隙間 ${GAP} の水で止まる）`,
			near.torches.has(RELAY) && !near.torches.has(TORCH) && grid[parse(GAP)[0]][parse(GAP)[1]] === TILE.WATER);
		const far = fireReach(grid, FAR_ROOT);
		check(`奥の根元 ${FAR_ROOT} の火は葦 ${far.burnt.size} 本を伝って奥のかがり火 ${TORCH} に届く`, far.torches.has(TORCH));
		const decoy = fireReach(grid, DECOY[1]);
		check(`入口の正面の囮（${DECOY.join(' ')}）は1つながりで、燃やしてもどのかがり火にも届かない`,
			DECOY.every((k) => decoy.burnt.has(k)) && decoy.burnt.size === DECOY.length && decoy.torches.size === 0);
		const allReeds = flat.filter((ch) => ch === TILE.BUSH).length;
		check(`葦は手前 ${near.burnt.size} 本＋奥 ${far.burnt.size} 本＋囮 ${DECOY.length} 本の3つながりだけ（計 ${allReeds} 本）`,
			near.burnt.size + far.burnt.size + DECOY.length === allReeds);
		// ブーメランの線：立ち位置から北へ＝中継のかがり火 → 隙間 → 奥の根元（木で届く 4 マス以内）
		const [sr, sc] = parse(THROW_STAND);
		const line = [];
		for (let r = sr - 1; r >= sr - WOOD_REACH; r--) line.push(key(r, sc));
		const iRelay = line.indexOf(RELAY), iGap = line.indexOf(GAP), iFar = line.indexOf(FAR_ROOT);
		check(`${THROW_STAND} から北へ投げたブーメランは ${line.join('→')} を通る＝中継のかがり火→隙間→奥の根元の順（木の ${WOOD_REACH} マス以内）`,
			iRelay >= 0 && iRelay < iGap && iGap < iFar);
		check(`線の途中に壁・壊せる壁が無い`, line.every((k) => { const [r, c] = parse(k); return grid[r][c] !== TILE.WALL && grid[r][c] !== TILE.BREAKABLE_WALL; }));
		// 一つ下 (7,4) からでは奥の根元に届かない＝立ち位置は (6,4) だけ（列4 の岸の中で）
		check(`一つ下の ${key(sr + 1, sc)} からでは木のブーメランは奥の根元に届かない（${sr + 1 - parse(FAR_ROOT)[0]} マス）`,
			sr + 1 - parse(FAR_ROOT)[0] > WOOD_REACH);
		// 対照：隙間を葦で埋めると、手前の火だけで奥まで届く（＝隙間がブーメランを要求している）
		const filled = grid.map((row) => [...row]);
		{ const [r, c] = parse(GAP); filled[r][c] = TILE.BUSH; }
		check(`対照：隙間 ${GAP} を葦で埋めると手前の根元から奥のかがり火まで届く`, fireReach(filled, FUSE_ROOT).torches.has(TORCH));
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
	console.log(`# ${LAYER} ${ROOM}：素の宝箱の部屋を「葦の導火線」に作り替える（キュー93 の4室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・'~' は bgTiles の水）`);
	TARGET.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   →   ${row}`);
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
