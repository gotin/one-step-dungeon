// dungeon_6 `4,2`（地図の部屋 `3,2` の東・北の `4,1` へ抜ける通り道）：薄い部屋を「呪い火の導火」に作り替える
// （2026-11-08 / PLAN 実行キュー 95 の12室目・主題はユーザー判断「A 呪い火の導火」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 #####..#####
//      2 #..t.......#     ← 木1
//      4 ...........#     ← 口は西（行4-5）と北（列5-6）
//      6 #......u...#     ← 茂み1
//   床のルピー×5 (4,5) だけ。敵なし。
//
// ■ 新しい `4,2`＝呪い火の導火（`~` は bgTiles の水）
//      0 #####..#####
//      1 #..........#     ← 北の岸
//      2 #.ψ~~~~~~~.#     ← 呪い火 ψ(2,2)＝池の北西の隅（最初から追う）
//      3 #.~~~~~~~~.#
//      4 ..~S.¤t¤~~.#     ← 池の中の小島：踏み板 S(4,3)・床 (4,4)・西の栗 ¤(4,5)・木 (4,6)・東の栗 ¤(4,7)
//      5 ..~~~~~~~~.#
//      6 #.~~~~~~~~.#
//      7 #..........#     ← 南の岸（2行）
//      8 #i........B#     ← 碑 i(8,1)・宝箱 B(8,10)＝栗が踏み板に乗ると現れる
//      9 ############
//   ・規則（既存・エンジン変更なし）：呪い火 ψ の体に縦横で接した大いが栗は爆ぜる
//     （game/enemy-ai.js scorchAround → projectile.js igniteBushAt → burstBurrAt＝キュー95 の7室目）。
//     爆ぜた栗の爆風（半径 2）は同じ行・列の栗を爆心から遠ざかる向きへ止まるまで転がす（4室目）。
//   ・解き方：東の栗を焼かせる＝爆風で西の栗が西へ転がり、床 (4,4) を越えて踏み板 (4,3) で止まる
//     （その先 (4,2) は水）→宝箱。ψ は勇者へまっすぐ寄る（長い軸を先に）＝北の岸で ψ を引き寄せてから
//     南東へ走る（または南で引き寄せて北東へ）と、ψ は池を斜めに渡って東の栗に触れる。
//   ・誤り：西の栗を先に焼かせる＝東の栗は東へ転がろうとして水で止まる＝踏み板は空のまま・ψ は爆風で消える
//     →入り直せば栗も ψ も戻る（栗は石と同じ・enemiesRespawn）。南の岸を西から東へ歩くと西の栗が焼ける
//     （規則を見せる失敗）。
//   ・勇者の火は届かない：小島の栗はどれも勇者の立てる床に縦横で接しない（ロウソクは前の1マス）・
//     かがり火も茂みも無い（火矢・燃えるブーメラン・燃え広がりの火元が無い）。
//   ・爆弾では動かない：栗の行・列で距離 2 以内の床に置いても、転がる先が水か木＝動かない。
//   ・報酬＝回復薬（大）（旧 床のルピー×5 は撤去・キュー100 の「ルピーだけはしょっぱい」に合わせた）。
//
// ■ 撤去したもの
//   床のルピー×5 (4,5)・木 (2,3)・茂み (6,7)。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水／宝の中身と出る条件／碑の本文／外周の口の形が不変／敵は ψ 1体・最初から追う・入り直しで戻る
//   ・口から口へ謎を解かずに抜けられる・小島へは歩いて入れない・床の取り残しなし
//   ・勇者の火：立てる床が栗に縦横で接しない・かがり火／茂みが無い（はしごで渡った小島からも東の栗には接しない）
//   ・爆弾：立てる床（はしごの床も）のどこに置いても栗は動かない
//   ・連鎖：東の栗が爆ぜると西の栗が踏み板で止まる／西の栗が爆ぜても東の栗は動かず踏み板は空
//   ・層の到達性が書き換え前と同じ・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-4-2-curse-fire-fuse.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-4-2-curse-fire-fuse.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '4,2';
export const ROWS = 10, COLS = 12;

// `~` は bgTiles の水（tiles 側は床 '.'）。ψ の家 (2,2) の下も水。
export const PLAN_ROWS = [
	'#####..#####',
	'#..........#',
	'#.ψ~~~~~~~.#',
	'#.~~~~~~~~.#',
	'..~S.¤t¤~~.#',
	'..~~~~~~~~.#',
	'#.~~~~~~~~.#',
	'#..........#',
	'#i........B#',
	'############',
];
export const PSI     = '2,2';
export const BURR_W  = '4,5';   // 転がす実（踏み板の隣の列）
export const BURR_E  = '4,7';   // 焼かせる実（踏み板から遠い方）
export const TREE    = '4,6';
export const PLATE   = '4,3';
export const CHEST   = '8,10';
export const SIGN    = '8,1';
export const MOUTHS = { north: ['0,5', '0,6'], west: ['4,0', '5,0'] };
export const TARGET = PLAN_ROWS.map((row) => row.replace(/~/g, '.'));
export const WATER = [PSI];
PLAN_ROWS.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
export const CHEST_CONTENTS = { [CHEST]: { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' } };
export const SHOW = { [CHEST]: { trigger: 'stonesPlaced', message: '{{burr}} 大いが栗が 踏み板に 収まり、宝箱が 現れた！' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '呪い火の 導火',
		lines: [
			'呪いの 火は 狙う 者へ まっすぐ 寄り、 触れた 実を 焼く。',
			'焼けた 実は 爆ぜ、 その 風は 隣の 実を 転がす。',
		],
	},
};

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const rc = (k) => k.split(',').map(Number);

// 勇者の歩ける床（口から）。ladder＝幅1の水を渡れる（はしご＝D6 の後に手に入る＝戻ってきたとき）。
export function reach(tiles, water, { ladder = false } = {}) {
	const ok = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && !water.has(`${r},${c}`)
		&& [TILE.FLOOR, TILE.BUTTON].includes(tiles[r][c]);
	const seen = new Set(); const q = [];
	for (const k of Object.values(MOUTHS).flat()) { seen.add(k); q.push(k); }
	while (q.length) {
		const [r, c] = rc(q.shift());
		for (const [dr, dc] of DIRS) {
			let nr = r + dr, nc = c + dc;
			if (ladder && water.has(`${nr},${nc}`) && ok(nr + dr, nc + dc)) { nr += dr; nc += dc; }
			const k = `${nr},${nc}`;
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push(k);
		}
	}
	return seen;
}

// 爆風で栗が転がる（game/projectile.js rollBurrsFromBlast の写し＝同じ行・列で距離 radius 以内の栗を
// 爆心から遠ざかる向きへ、外周・床でない・水・ほかの栗の手前まで）。burrs＝{ id: 'r,c' }（爆ぜた栗は除く）。
export function rollFrom(tiles, water, burrs, center, radius = 2) {
	const [r0, c0] = rc(center);
	const out = { ...burrs };
	const occupied = (r, c) => Object.values(out).includes(`${r},${c}`);
	const canEnter = (r, c) => r > 0 && c > 0 && r < ROWS - 1 && c < COLS - 1 && !water.has(`${r},${c}`)
		&& [TILE.FLOOR, TILE.BUTTON].includes(tiles[r][c]) && !occupied(r, c);
	for (const [dr, dc] of DIRS) {
		const onArm = Object.entries(out).filter(([, p]) => {
			const [r, c] = rc(p);
			return dr ? c === c0 && Math.sign(r - r0) === dr && Math.abs(r - r0) <= radius
				: r === r0 && Math.sign(c - c0) === dc && Math.abs(c - c0) <= radius;
		}).sort((a, b) => { const [ar, ac] = rc(a[1]), [br, bc] = rc(b[1]); return (Math.abs(br - r0) + Math.abs(bc - c0)) - (Math.abs(ar - r0) + Math.abs(ac - c0)); });
		for (const [id, p] of onArm) {
			let [r, c] = rc(p);
			out[id] = '-1,-1';
			while (canEnter(r + dr, c + dc)) { r += dr; c += dc; }
			out[id] = `${r},${c}`;
		}
	}
	return out;
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
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	room.showConditions = JSON.parse(JSON.stringify(SHOW));
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	delete room.enemyHold;
	// ψ は既定でさまよう（家の周りの池の上を飛んで勝手に栗に触れる＝謎が乱数で解ける・2,2 と同じ理由）
	// ∴最初から追う。入り直せば ψ も栗も戻る（失敗しても詰まない）。
	room.enemyChase = { [PSI]: true };
	room.enemiesRespawn = true;
	delete room.initLitTorches;
	room.comment = '【キュー95 呪い火の導火（2026-11-08）】呪い火 ψ に縦横で接した大いが栗は爆ぜ、爆風は隣の栗を転がす。'
		+ '池の小島に栗2つ＝踏み板から遠い東の栗を焼かせると、西の栗が踏み板 (4,3) に転がって宝箱（回復薬（大））。'
		+ 'ψ は勇者へまっすぐ寄る＝北で引き寄せて南東へ走ると池を斜めに渡って東の栗に触れる。'
		+ '西の栗を先に焼かせると失敗（入り直せば戻る）。scripts/migrate-d6-4-2-curse-fire-fuse.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const water = new Set(Object.keys(room.bgTiles).filter((k) => room.bgTiles[k] === TILE.WATER));
	const at = (k) => { const [r, c] = rc(k); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水 ${water.size} マス（bgTiles・ψ の家の下も水）`, water.size === WATER.length && water.has(PSI));
	check(`宝箱 ${CHEST} は1つ・中身＝回復薬（大）・栗が踏み板に乗ると現れる（stonesPlaced）`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS) && room.showConditions[CHEST]?.trigger === 'stonesPlaced'
		&& Object.keys(room.showConditions).length === 1);
	check(`大いが栗は ${BURR_W}・${BURR_E} の2つ・踏み板 ${PLATE} は1枚・間に木 ${TREE}・普通の石と門は無い`,
		count(TILE.BURR) === 2 && at(BURR_W) === TILE.BURR && at(BURR_E) === TILE.BURR && at(TREE) === TILE.TREE
		&& count(TILE.BUTTON) === 1 && at(PLATE) === TILE.BUTTON && count(TILE.STONE) === 0 && count(TILE.GATE) === 0);
	check(`碑 ${SIGN} に本文2行`, at(SIGN) === TILE.SIGN && count(TILE.SIGN) === 1 && room.signData[SIGN]?.lines?.length === 2);
	check(`火元になる物が無い（かがり火・茂み・初めから灯った火）・床の爆弾・壊せる壁も無い`,
		![TILE.TORCH, TILE.BUSH, TILE.ITEM_BOMB, TILE.BREAKABLE_WALL].some((ch) => t.flat().includes(ch))
		&& !(room.initLitTorches ?? []).length);
	{
		const mobs = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) mobs.push(`${ch}@${r},${c}`); }));
		check(`敵は呪い火 ψ ${PSI} の1体だけ（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.CURSE_FIRE}@${PSI}`);
		check(`呪い火は ignitesBushes を持つ・飛ぶ（move 'air'）`,
			ENEMY_META[TILE.CURSE_FIRE].ignitesBushes === true && ENEMY_META[TILE.CURSE_FIRE].move === 'air');
		check(`ψ は最初から追う（enemyChase）・入り直すと戻る（enemiesRespawn）`,
			JSON.stringify(room.enemyChase) === JSON.stringify({ [PSI]: true }) && room.enemiesRespawn === true);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（ψ 1体）が看板部屋 2,3（${sig}）より軽い`, threat < sig);
	}

	// ── ② 歩行：通り抜けと取り残し・小島へは入れない ──────────────────────
	const walk = reach(t, water);
	const walkLadder = reach(t, water, { ladder: true });
	{
		check(`西の口から北の口へ謎を解かずに抜けられる`, MOUTHS.north.every((k) => walk.has(k)) && MOUTHS.west.every((k) => walk.has(k)));
		const island = ['4,3', '4,4'];
		check(`小島（踏み板と床）へは歩いて入れない`, island.every((k) => !walk.has(k)));
		const floors = [];
		t.forEach((row, r) => row.forEach((ch, c) => {
			const k = `${r},${c}`;
			if (!water.has(k) && ch === TILE.FLOOR && !island.includes(k)) floors.push(k);
		}));
		const stranded = floors.filter((k) => !walk.has(k));
		check(`岸の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		const nb = (k) => { const [r, c] = rc(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
		check(`宝箱 ${CHEST} の隣に立てる`, nb(CHEST).some((k) => walk.has(k)));
		check(`はしごで渡れる所＝小島の西の端（踏み板・床）だけ（実測 ${[...walkLadder].filter((k) => !walk.has(k)).join(' ')}）`,
			[...walkLadder].filter((k) => !walk.has(k)).sort().join() === island.sort().join());
	}

	// ── ③ 勇者の火と爆弾では解けない ───────────────────────────────────────
	{
		const nb = (k) => { const [r, c] = rc(k); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
		const touchW = nb(BURR_W).filter((k) => walk.has(k));
		const touchE = nb(BURR_E).filter((k) => walk.has(k));
		check(`ロウソク：立てる床はどちらの栗にも縦横で接しない（${[...touchW, ...touchE].join(' ') || 'なし'}）`, !touchW.length && !touchE.length);
		check(`はしごで小島に渡っても、東の栗には接しない（接するのは西の栗だけ＝焼いても失敗）`,
			!nb(BURR_E).some((k) => walkLadder.has(k)));
		const burrs = { w: BURR_W, e: BURR_E };
		const moved = [];
		for (const k of walkLadder) {
			const after = rollFrom(t, water, burrs, k, 2);
			if (after.w !== BURR_W || after.e !== BURR_E) moved.push(k);
		}
		check(`爆弾：立てる床（はしごの床も）のどこに置いても栗は動かない（動く置き場 ${moved.join(' ') || 'なし'}）`, moved.length === 0);
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で持てる道具＝弓・ブーメラン・ロウソク・爆弾（はしごは後）`, ['bow', 'boomerang', 'candle', 'bomb'].every((x) => tools.has(x)) && !tools.has('ladder'));
	}

	// ── ④ 連鎖：どちらを焼かせるか ───────────────────────────────────────
	{
		const right = rollFrom(t, water, { w: BURR_W }, BURR_E, 2);
		check(`東の栗が爆ぜる→西の栗は西へ転がり踏み板 ${PLATE} で止まる（実測 ${right.w}）`, right.w === PLATE);
		const wrong = rollFrom(t, water, { e: BURR_E }, BURR_W, 2);
		check(`西の栗が爆ぜる→東の栗は動かない（実測 ${wrong.e}）＝踏み板は空`, wrong.e === BURR_E);
		const [pr, pc] = rc(PLATE);
		check(`踏み板の西 (${pr},${pc - 1}) は水＝栗は踏み板を通り過ぎない`, water.has(`${pr},${pc - 1}`));
		check(`栗と木の上下は水（ψ は上下から触れられる・栗は縦には転がらない）`,
			[BURR_W, TREE, BURR_E].every((k) => { const [r, c] = rc(k); return water.has(`${r - 1},${c}`) && water.has(`${r + 1},${c}`); }));
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
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「呪い火の導火」に作り替える（キュー95 の12室目）`);
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
