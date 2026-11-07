// dungeon_6 `3,2`（地図の部屋＝四方の辻・北 `3,1`・南 `3,3`・西 `2,2`・東 `4,2`）：薄い部屋を「焼き栗の淵」に作り替える
// （2026-11-07 / PLAN 実行キュー 95 の7室目・主題はユーザー判断「A 焼き栗の発破」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 #####..#####
//      2 #....m.....#     ← 地図 m が1つ
//      3 #......u...#     ← 茂みが1本
//      4 ............     ← 西・東の口
//      6 #..t.......#     ← 木が1本
//      9 #####..#####     ← 南の口
//   四角い広間に地図と茂みと木だけ。宝箱も仕掛けも無い。
//
// ■ 新しい `3,2`＝焼き栗の淵（真ん中が池・`~` は bgTiles の水）
//      0 #####..#####
//      1 #.m.......B#     ← 地図 m(1,2)・宝箱 B(1,10)＝根が崩れると現れる（wallBroken）
//      2 #.t~~~~~~..#
//      3 #.~~~~~~~~.#
//      4 ..~~!~.¤H...     ← 朽ちた根＝壊せる壁 !(4,4)（水の上）・岬 (4,6)(4,7)・大いが栗 ¤(4,7)・かがり火 H(4,8)（消えている）
//      5 ..~~~~~~~~..
//      6 #.~~~~~~~~.#
//      7 #..~~~~~~i.#     ← 碑 i(7,9)
//      8 #.t........#
//      9 #####..#####
//   ・新しい規則（エンジン＝`game/projectile.js burstBurrAt`）＝**火に触れた大いが栗は爆ぜる**＝その場で
//     爆弾と同じ爆発（半径 2・壊せる壁を壊す）を起こして消える。爆弾の爆風は栗を転がすだけ（火ではない）。
//   ・朽ちた根は、勇者が立てるどの床からも爆風の外（距離 3 以上）＝爆弾では崩せない。
//   ・栗は岬の付け根 (4,7)。岬の口はかがり火 H(4,8) が塞ぐ＝勇者は岬に入れない（栗を転がしても・爆ぜさせても）。
//   ・解き方＝①東の岸 (4,9) で爆弾＝爆風はかがり火を越えて栗に届き（同じ行・距離 2）、栗は西へ転がって
//     岬の先 (4,6)（その先は水）で止まる＝根まで距離 2。②ロウソクでかがり火を灯す（(4,9) で西を向く）。
//     ③(4,9) から西へブーメラン＝かがり火で火を拾い、岬の先の栗の上を通る＝栗が爆ぜて根が崩れる→宝箱。
//   ・誤り＝転がす前に火の付いたブーメランを投げる→栗は付け根 (4,7) で爆ぜる＝根まで距離 3 で届かない
//     （入り直せば栗は戻る・かがり火は灯ったまま＝やり直せる＝詰まない）。
//   ・使う爆弾は1個（キュー95 爆弾の部屋の約束①）。報酬は爆弾にしない（補給は `2,4`・`0,1` で足した）。
//   ・地図は北の回廊 (1,2)＝謎と無関係に拾える（地図は showConditions で隠せない＝キュー32 の ⚠️）。
//   ・4つの口は池を囲む回廊でつながる（謎を解かずに通り抜けられる）。
//
// ■ 撤去したもの
//   茂み (3,7)・木 (6,3)・地図 (2,5)（(1,2) へ移した）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水／宝の中身と出る条件／壊せる壁／碑の本文／かがり火が消えている／外周の口の形が不変
//   ・勇者が立てるどの床からも、爆風が根に届かない（栗を転がした後・付け根で爆ぜた後も＝岬に入れない）
//   ・爆弾で栗を動かせる床は (4,9) だけ・そこからの爆風で栗は岬の先 (4,6) で止まる
//   ・岬の先の栗の爆風は根に届き、付け根の栗の爆風は届かない
//   ・(4,9) から西へのブーメランは、かがり火→付け根→岬の先の順に通り、木の届き（左 4）に岬の先が入る
//   ・ソルバー（火を持たない＝栗は爆ぜない）では宝箱に届かない＝爆弾と栗の転がしだけでは解けない
//   ・通り抜け・敵なし・層の到達性が書き換え前と同じ
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-3-2-roast-burr-pool.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-3-2-roast-burr-pool.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { ROWS as SR, COLS as SC, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '3,2';
export const ROWS = 10, COLS = 12;

// `~` は bgTiles の水（tiles 側は床 '.'、根 '!' の下も水）
export const PLAN_ROWS = [
	'#####..#####',
	'#.m.......B#',
	'#.t~~~~~~..#',
	'#.~~~~~~~~.#',
	'..~~!~.¤H...',
	'..~~~~~~~~..',
	'#.~~~~~~~~.#',
	'#..~~~~~~i.#',
	'#.t........#',
	'#####..#####',
];
export const TARGET = PLAN_ROWS.map((row) => row.replace(/~/g, '.'));
export const WATER = [];
PLAN_ROWS.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~' || ch === '!') WATER.push(`${r},${c}`); }));
export const CHEST = '1,10';
export const ROOT  = '4,4';    // 朽ちた根＝壊せる壁
export const BURR  = '4,7';    // 岬の付け根
export const TIP   = '4,6';    // 岬の先（その先は水）
export const TORCH = '4,8';    // 岬の口を塞ぐ消えたかがり火
export const BOMB_CELL = '4,9';
export const MAP_ITEM = '1,2';
export const SIGN = '7,9';
export const MOUTHS = { north: ['0,5', '0,6'], south: ['9,5', '9,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 50, name: 'ルピー×50' } };
export const SHOW = { [CHEST]: { trigger: 'wallBroken', wallId: ROOT, message: '{{burr}} 朽ちた 根が 崩れ、宝箱が 現れた！' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '焼き栗の 淵',
		lines: [
			'淵に 立つ 朽ちた 根は 爆ぜる 風で 崩れる。',
			'とげの 実は 火に 焼かれると 爆ぜる。',
		],
	},
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
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : [...row][0] + [...row][COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, TARGET.length === ROWS && TARGET.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, '~']));
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	room.showConditions = JSON.parse(JSON.stringify(SHOW));
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.breakableWalls = { [ROOT]: { breakDef: 1 } };
	room.floorItems = {};
	room.links = [];
	room.enemyDirs = {};
	delete room.enemyHold;
	delete room.enemyChase;
	delete room.enemiesRespawn;
	delete room.initLitTorches;
	room.comment = '【キュー95 焼き栗の淵（2026-11-07）】池の中の朽ちた根（壊せる壁）は、どの岸からも爆風が届かない。'
		+ '火に触れた大いが栗は爆ぜる（爆弾と同じ爆発）。東の岸で爆弾＝栗が岬の先へ転がる→かがり火を灯し、'
		+ 'ブーメランで火を運んで栗を爆ぜさせる＝根が崩れて宝箱（ルピー×50）。岬の口はかがり火が塞ぐ＝勇者は岬に入れない。'
		+ 'scripts/migrate-d6-3-2-roast-burr-pool.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	const water = new Set(Object.keys(room.bgTiles));
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水 ${water.size} マス（bgTiles）・根の下も水`, water.size === WATER.length && water.has(ROOT));
	check(`宝箱 ${CHEST} は1つ・中身＝ルピー×50・根が崩れると現れる`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS)
		&& room.showConditions[CHEST]?.trigger === 'wallBroken' && room.showConditions[CHEST]?.wallId === ROOT);
	check(`壊せる壁は根 ${ROOT} の1枚`, count(TILE.BREAKABLE_WALL) === 1 && at(ROOT) === TILE.BREAKABLE_WALL
		&& JSON.stringify(room.breakableWalls) === JSON.stringify({ [ROOT]: { breakDef: 1 } }));
	check(`大いが栗は ${BURR} の1つ・普通の石は無い`, count(TILE.BURR) === 1 && at(BURR) === TILE.BURR && count(TILE.STONE) === 0);
	check(`かがり火は ${TORCH} の1つで、初めは消えている`, count(TILE.TORCH) === 1 && at(TORCH) === TILE.TORCH && !room.initLitTorches);
	check(`地図 ${MAP_ITEM}・碑 ${SIGN} に本文`, at(MAP_ITEM) === TILE.ITEM_DUNGEON_MAP && count(TILE.ITEM_DUNGEON_MAP) === 1
		&& at(SIGN) === TILE.SIGN && room.signData[SIGN]?.lines?.length === 2);
	check(`床の爆弾 '5'・茂み・踏み板・門・敵が無い`, !t.flat().some((ch) => ch === TILE.ITEM_BOMB || ch === TILE.BUSH
		|| ch === TILE.BUTTON || ch === TILE.GATE || ENEMY_META[ch]));
	check(`岬の先 ${TIP} は床・その先 4,5 は水`, at(TIP) === TILE.FLOOR && !water.has(TIP) && water.has('4,5'));

	// ── ② 歩ける床と爆風 ───────────────────────────────────────────────
	// 立てる床＝床と地図（水・壁・栗・かがり火・根・碑・木・宝箱は立てない）。burrAt＝今の栗の位置（null＝爆ぜた）。
	const walk = (burrAt) => {
		const ok = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && !water.has(`${r},${c}`)
			&& [TILE.FLOOR, TILE.ITEM_DUNGEON_MAP, TILE.BURR].includes(t[r][c]) && `${r},${c}` !== burrAt;
		const seen = new Set(); const q = [];
		for (const k of MOUTHS.west) { seen.add(k); q.push(k); }
		while (q.length) {
			const [r, c] = q.shift().split(',').map(Number);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const k = `${r + dr},${c + dc}`;
				if (seen.has(k) || !ok(r + dr, c + dc)) continue;
				seen.add(k); q.push(k);
			}
		}
		return seen;
	};
	// 爆風の形＝(0,±1)(0,±2)(±1,0)(±2,0)(±1,±1)（PLAN キュー95 の爆弾の事実）
	const blast = (k) => {
		const [r, c] = k.split(',').map(Number);
		const cells = [[0, 0], [0, 1], [0, -1], [0, 2], [0, -2], [1, 0], [-1, 0], [2, 0], [-2, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
		return cells.map(([dr, dc]) => `${r + dr},${c + dc}`);
	};
	const reachesRoot = (k) => blast(k).includes(ROOT);
	{
		const states = { '初め': walk(BURR), '栗を岬の先へ転がした後': walk(TIP), '栗が付け根で爆ぜた後': walk(null) };
		for (const [name, floor] of Object.entries(states)) {
			const hits = [...floor].filter(reachesRoot);
			check(`${name}：立てる床のどこからも爆風が根に届かない（届く床 ${hits.join(' ') || 'なし'}）`, hits.length === 0);
			check(`${name}：岬 ${TIP} ${BURR} に入れない`, !floor.has(TIP) && !floor.has(BURR));
		}
		const all = [...MOUTHS.north, ...MOUTHS.south, ...MOUTHS.east];
		check(`西の口から北・南・東の口と地図へ謎を解かずに抜けられる`, all.every((k) => states['初め'].has(k)) && states['初め'].has(MAP_ITEM));
		check(`宝箱の隣に立てる（現れたら開けられる）`, ['1,9', '2,10'].some((k) => states['初め'].has(k)));

		// 栗を動かせる床＝栗と同じ行か列・距離 1〜2（rollBurrsFromBlast の規則）
		const [br, bc] = BURR.split(',').map(Number);
		const movers = [...states['初め']].filter((k) => {
			const [r, c] = k.split(',').map(Number);
			return (r === br && Math.abs(c - bc) >= 1 && Math.abs(c - bc) <= 2) || (c === bc && Math.abs(r - br) >= 1 && Math.abs(r - br) <= 2);
		});
		check(`爆弾で栗を動かせる床は ${BOMB_CELL} だけ（実測 ${movers.join(' ') || 'なし'}）`, JSON.stringify(movers) === JSON.stringify([BOMB_CELL]));
		// 転がす：爆心から遠ざかる向きへ、入れなくなるまで（水・壁・かがり火・外周で止まる）
		const [pr, pc] = BOMB_CELL.split(',').map(Number);
		const dr = Math.sign(br - pr), dc = Math.sign(bc - pc);
		let r = br, c = bc;
		const enter = (rr, cc) => rr > 0 && cc > 0 && rr < ROWS - 1 && cc < COLS - 1 && !water.has(`${rr},${cc}`) && t[rr][cc] === TILE.FLOOR;
		while (enter(r + dr, c + dc)) { r += dr; c += dc; }
		check(`${BOMB_CELL} の爆弾で栗は岬の先 ${TIP} で止まる（実測 ${r},${c}）`, `${r},${c}` === TIP);
		check(`岬の先の栗の爆風は根に届く`, reachesRoot(TIP));
		check(`対照：付け根の栗の爆風は根に届かない（転がさずに爆ぜさせると外れる）`, !reachesRoot(BURR));
	}

	// ── ③ ブーメランの道筋（火を拾って岬の先の栗の上を通る）───────────────
	{
		const reachLeft = 4;   // 木のブーメランの届き（左・上＝4／右・下＝5＝D7 `3,1` の実測）
		const [pr, pc] = BOMB_CELL.split(',').map(Number);
		const path = [];
		for (let c = pc - 1; c >= pc - reachLeft; c--) { path.push(`${pr},${c}`); if (t[pr][c] === TILE.WALL || t[pr][c] === TILE.BREAKABLE_WALL) break; }
		const iTorch = path.indexOf(TORCH), iBurr = path.indexOf(BURR), iTip = path.indexOf(TIP);
		check(`${BOMB_CELL} から西へ＝かがり火→付け根→岬の先の順に通る（道筋 ${path.join(' ')}）`, iTorch === 0 && iBurr === 1 && iTip === 2);
		check(`木のブーメランが最弱（届き ${BOOMERANG_TIERS[0]?.maxRange}）`, BOOMERANG_TIERS.every((bt) => (bt.maxRange ?? 0) >= (BOOMERANG_TIERS[0]?.maxRange ?? 0)));
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で爆弾・ロウソク・ブーメランが使える（toolsUsableIn）`, tools.has('bomb') && tools.has('candle') && tools.has('boomerang'));
	}

	// ── ④ ソルバー（火を持たない＝栗は爆ぜない）では解けない ─────────────────
	{
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		const bg = Array.from({ length: SR }, (_, r) => Array.from({ length: SC }, (_, c) => (water.has(`${r},${c}`) ? '~' : 'g')));
		const breakDefs = { [ROOT]: 1 };
		const S = makeSolver(t.map((r) => r.slice()), bg, [], breakDefs, new Set(), {
			hasLadder: tools.has('ladder'), hasCandle: tools.has('candle'), noTools: false,
		});
		const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
		// 状態の4番目＝brokenWalls のビット（壊せる壁は根の1枚だけ＝bit 0）
		const brokeRoot = (st) => (Number(st.split('|')[3]) & 1) === 1;
		const m = measureMetrics(S, starts, brokeRoot, () => 0, { guardMax: 2000000 });
		check(`ソルバー（爆弾・栗の転がしあり・火で爆ぜる規則なし）では根が崩れない（L=${m.L}・状態 ${m.states}）`, m.L == null);
	}

	// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「焼き栗の淵」に作り替える（キュー95 の7室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・~ は水）`);
	room.tiles.forEach((row, i) => console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${PLAN_ROWS[i]}`));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) ng++; }
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);
	if (DRY) console.log('\n--dry: 書き込みなし');
	else { writeFileSync(MAP_PATH, JSON.stringify(data, null, 2)); console.log('\n書き込み完了:', MAP_PATH); }
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
