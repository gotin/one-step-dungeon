// dungeon_6 `2,1`（四方の辻＝西 `1,1`・北 `2,0`・東 `3,1`・南 `2,2`）：薄い部屋を「栗番の辻」に作り替える
// （2026-11-07 / PLAN 実行キュー 95 の6室目・主題はユーザー判断「A 番兵を止め木に」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 #####..#####
//      2 #....F.....#     ← センチネル F が1体
//      3 #..*...#...#     ← 石が1つ・壁が1枚
//      4 ............     ← 西・東の口
//      9 #####..#####     ← 南の口
//   四角い広間にセンチネルと石が1つずつ。宝箱も仕掛けも無い。
//
// ■ 新しい `2,1`＝栗番の辻（北の通路の両脇に幅1の溝。溝ごとに大いが栗と踏み板と槍衛）
//      0 #####..#####
//      1 #####..#####
//      2 #SF.¤..¤SF.#     ← 西の溝＝踏み板 S(2,1)・槍衛 F(2,2)・栗 ¤(2,4)
//      3 #####..#####        東の溝＝栗 ¤(2,7)・踏み板 S(2,8)・槍衛 F(2,9)・床 (2,10)
//      4 ............     ← 西・東の口
//      5 ............
//      6 #.t......t##
//      7 #...i....#B#     ← 宝箱 B(7,10)＝門の奥・碑 i(7,4)
//      8 #.t......T.#     ← 門 T(8,9)＝踏み板が2枚とも埋まると開く
//      9 #####..#####     ← 南の口
//   ・既存の事実（エンジン変更なし）＝転がる大いが栗は、敵の立つセルの手前で止まる
//     （`game/projectile.js` rollBurrsFromBlast の canEnter）。槍衛は2体とも持ち場を動かない（enemyHold）。
//   ・**東の溝**は、槍衛が踏み板のすぐ先に立つ＝栗は槍衛に当たって踏み板の上で止まる。槍衛を倒すと
//     止め木が消え、栗は踏み板を通り過ぎて (2,10) まで転がる（壁の手前）。
//   ・**西の溝**は、槍衛が栗と踏み板の間に立つ＝生かしておくと栗は槍衛の手前 (2,3) で止まる。
//     槍衛を倒せば栗は外周の壁の手前＝踏み板 (2,1) まで転がる。
//   ・∴解き方＝**西の槍衛だけを倒し、東の槍衛は生かす**→北の通路 (2,5) か (2,6) に爆弾1個＝爆風が
//     両方の栗に届いて（同じ行・距離 1〜2）左右へ転がる→2枚とも埋まって門が開き、宝箱（ルピー×50）。
//     見た目はほぼ左右対称＝どちらの番兵が止め木かは、踏み板と番兵の並び順を読んで決める。
//   ・西の槍衛を倒す手段＝北の通路から西へ矢（投擲物は壁以外を通り抜ける＝栗を越えて届く）。
//     爆弾は通路から届かない（距離 3）。先に爆弾を置いて西の栗を (2,3) まで寄せた後なら、
//     溝へ入って (2,4) に置く爆弾で槍衛ごと吹き飛ばせる（その爆風で栗も転がる）。
//   ・圧＝槍衛は同じ行・列で距離 4 以内なら槍を投げる。北の通路の (2,5)(2,6) はどちらの槍衛からも
//     距離 3〜4＝爆弾を置く間は東西から挟まれる（盾で防げるのは片側だけ）。溝の上下は壁＝西・東の
//     口の行（4〜5）には槍は届かない＝東西の通り抜けは槍に晒されない。
//   ・失敗しても詰まない＝入り直せば栗も槍衛も戻る（栗の位置は石と同じく入り直しで戻る・
//     `enemiesRespawn`）。2枚とも埋まった後は栗がロックされる（石と同じ）。
//   ・使う爆弾は1個（キュー95 爆弾の部屋の約束①）。報酬は爆弾にしない（補給は `2,4`・`0,1` で足した）。
//   ・D6 の他の部屋と型を分けた＝`2,4` 大いが栗の庭（木と石を止め木にする）／`0,1` 猪の囲い。
//     「敵を倒さずに使う」はここだけ。
//
// ■ 撤去したもの
//   センチネル F(2,5)・石 *(3,3)・壁 (3,7)。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝の中身／碑の本文／持ち場と入り直しの指定／外周の口の形が不変
//   ・ソルバー（槍衛＝生きていれば壁・倒せば床）で4通りを解く＝**西だけ倒した場合だけ**解ける・
//     その場合に入って詰む状態が無い・爆弾の最少個数が 1
//   ・初めから立てる床のどこから爆弾を置いても槍衛に爆風が届かない（両方の栗を動かすセルがある）
//   ・通り抜け（4つの口が謎を解かずにつながる）・西・東の口の行は槍衛の列にも行にも入らない
//   ・敵と脅威度（看板 `2,3` より軽い）・層の到達性が書き換え前と同じ
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-2-1-burr-wardens.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-2-1-burr-wardens.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { holdsPost } from '../shared/enemy-alert.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';
import { ROWS as SR, COLS as SC, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '2,1';
export const ROWS = 10, COLS = 12;

export const TARGET = [
	'#####..#####',
	'#####..#####',
	'#SF.¤..¤SF.#',
	'#####..#####',
	'............',
	'............',
	'#.t......t##',
	'#...i....#B#',
	'#.t......T.#',
	'#####..#####',
];
export const CHEST = '7,10';
export const GATE  = '8,9';
export const SIGN  = '7,4';
export const WARDEN_W = '2,2';
export const WARDEN_E = '2,9';
export const BURR_W = '2,4';
export const BURR_E = '2,7';
export const PLATE_W = '2,1';
export const PLATE_E = '2,8';
export const BOMB_CELLS = ['2,5', '2,6'];   // 両方の栗を1発で転がせるセル
export const MOUTHS = { north: ['0,5', '0,6'], south: ['9,5', '9,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 50, name: 'ルピー×50' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '栗番の 辻',
		lines: [
			'溝の 槍衛は 持ち場を 一歩も 離れぬ。',
			'とげの 実は 爆ぜる 風に 転がり、 何かに 当たるまで 止まらぬ。',
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
	room.bgTiles = {};
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	room.showConditions = {};
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = [];
	room.enemyDirs = {};
	room.enemyHold = { [WARDEN_W]: true, [WARDEN_E]: true };   // 番兵は歩かない＝止め木になる
	delete room.enemyChase;
	room.enemiesRespawn = true;   // 止め木の番兵を倒してしまっても入り直せば戻る
	room.comment = '【キュー95 栗番の辻（2026-11-07）】北の通路の両脇に幅1の溝。転がる大いが栗は敵の手前で止まる。'
		+ '東の溝は槍衛が踏み板のすぐ先＝生かせば栗が踏み板で止まる。西の溝は槍衛が栗と踏み板の間＝倒さないと栗が届かない。'
		+ '西だけ矢で倒し、通路に爆弾1個で両方の栗を転がす＝門 T が開き宝箱（ルピー×50）。入り直せば栗も槍衛も戻る。'
		+ 'scripts/migrate-d6-2-1-burr-wardens.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱 ${CHEST} は1つ・中身＝ルピー×50`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`大いが栗は ${BURR_W} ${BURR_E} の2つ・普通の石は無い`, count(TILE.BURR) === 2 && at(BURR_W) === TILE.BURR
		&& at(BURR_E) === TILE.BURR && count(TILE.STONE) === 0);
	check(`踏み板は ${PLATE_W} ${PLATE_E} の2枚・門は ${GATE} の1枚`, count(TILE.BUTTON) === 2 && at(PLATE_W) === TILE.BUTTON
		&& at(PLATE_E) === TILE.BUTTON && count(TILE.GATE) === 1 && at(GATE) === TILE.GATE);
	check(`碑 ${SIGN} に本文がある`, at(SIGN) === TILE.SIGN && room.signData[SIGN]?.lines?.length === 2);
	check(`床の爆弾 '5'・壊せる壁 '!' が無い`, !t.flat().some((ch) => ch === TILE.ITEM_BOMB || ch === TILE.BREAKABLE_WALL));
	{
		const enemies = [];
		t.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemies.push([`${r},${c}`, ch]); }));
		check(`敵は槍衛 F が ${WARDEN_W} ${WARDEN_E} の2体だけ`, enemies.length === 2
			&& enemies.every(([k, ch]) => ch === TILE.SENTRY && (k === WARDEN_W || k === WARDEN_E)));
		check(`2体とも持ち場を動かない（enemyHold）`, holdsPost(room, WARDEN_W, TILE.SENTRY) && holdsPost(room, WARDEN_E, TILE.SENTRY));
		check(`入り直すと敵が戻る（enemiesRespawn）`, room.enemiesRespawn === true);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat} が看板部屋 2,3 の ${sig} より軽い`, threat < sig);
	}
	// 並び順（読みの材料）：東は「栗→踏み板→番兵」、西は「踏み板→番兵→…→栗」
	{
		const [, wc] = WARDEN_W.split(',').map(Number), [, ec] = WARDEN_E.split(',').map(Number);
		const [, pwc] = PLATE_W.split(',').map(Number), [, pec] = PLATE_E.split(',').map(Number);
		const [, bwc] = BURR_W.split(',').map(Number), [, bec] = BURR_E.split(',').map(Number);
		check(`東の溝＝栗・踏み板・番兵が隣り合って並び、番兵の先に床が1枚ある`, pec === bec + 1 && ec === pec + 1 && at(`2,${ec + 1}`) === TILE.FLOOR && at(`2,${ec + 2}`) === TILE.WALL);
		check(`西の溝＝踏み板が外周の壁の手前・番兵が踏み板と栗の間`, pwc === 1 && wc === pwc + 1 && bwc > wc + 1);
	}

	// ── ② ソルバー（槍衛＝生きていれば壁・倒せば床）──────────────────────
	{
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で爆弾と弓が使える（toolsUsableIn）`, tools.has('bomb') && tools.has('bow'));
		const solve = ({ wAlive, eAlive }) => {
			const grid = t.map((r) => r.slice());
			const put = (k, alive) => { const [r, c] = k.split(',').map(Number); grid[r][c] = alive ? TILE.WALL : TILE.FLOOR; };
			put(WARDEN_W, wAlive); put(WARDEN_E, eAlive);
			const bg = Array.from({ length: SR }, () => Array(SC).fill('g'));
			const S = makeSolver(grid, bg, [], {}, new Set(), {
				hasLadder: tools.has('ladder'), hasCandle: tools.has('candle'), noTools: false,
			});
			const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
			const goal = (st) => { const f = st.split('|'); return f[0] === CHEST && f[5] === '1'; };
			const m = measureMetrics(S, starts, goal, () => 0, { guardMax: 4000000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
			return { S, starts, m, goal };
		};
		const ok = solve({ wAlive: false, eAlive: true });
		check(`西だけ倒すと解ける（L=${ok.m.L}・最短解 ${ok.m.solCount}・状態 ${ok.m.states}）`, ok.m.L != null);
		check(`その場合に入って詰む状態が無い（noEscape ${ok.m.noEscape}）`, ok.m.noEscape === 0);
		check(`対照：両方生かすと解けない`, solve({ wAlive: true, eAlive: true }).m.L == null);
		check(`対照：東だけ倒すと解けない`, solve({ wAlive: true, eAlive: false }).m.L == null);
		check(`対照：両方倒すと解けない`, solve({ wAlive: false, eAlive: false }).m.L == null);
		// 爆弾の最少個数（0-1 BFS：位置が同じで石が動く手＝爆弾）
		const { S, starts, goal } = ok;
		const cost = new Map(); const dq = [];
		for (const s of starts) { cost.set(s, 0); dq.push(s); }
		let best = null;
		while (dq.length) {
			const st = dq.shift();
			if (goal(st)) { best = cost.get(st); break; }
			const f = st.split('|');
			for (const nx of S.nextStates(st)) {
				const g = nx.split('|');
				const bomb = g[0] === f[0] && g[1] !== f[1];
				const nc = cost.get(st) + (bomb ? 1 : 0);
				if (!cost.has(nx) || nc < cost.get(nx)) { cost.set(nx, nc); bomb ? dq.push(nx) : dq.unshift(nx); }
			}
		}
		check(`爆弾の最少個数が 1（実測 ${best}）＝約束①`, best === 1);
	}

	// ── ③ 初めの床から：爆風は番兵に届かない・両方の栗を動かすセルがある ─────
	const walk = (passableChars) => {
		const seen = new Set(); const q = [];
		const ok = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && passableChars.includes(t[r][c]);
		for (const k of [...MOUTHS.west]) { seen.add(k); q.push(k); }
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
	{
		const floor = walk([TILE.FLOOR, TILE.BUTTON, TILE.SIGN]);
		// 爆風の形＝(0,±1)(0,±2)(±1,0)(±2,0)(±1,±1)（PLAN キュー95 の爆弾の事実）
		const blast = (k) => {
			const [r, c] = k.split(',').map(Number);
			const cells = [[0, 0], [0, 1], [0, -1], [0, 2], [0, -2], [1, 0], [-1, 0], [2, 0], [-2, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
			return cells.map(([dr, dc]) => `${r + dr},${c + dc}`);
		};
		// 爆風は壁を越える（`0,3` の語彙）＝溝の真下2マスの床からは番兵に届く。西の (4,2) は
		// 「西の番兵を倒す」別解（爆弾2個）、東の (4,9) は止め木を失う誤り（入り直せば戻る）。
		// 栗を動かす通路のセルからは、どちらの番兵にも届かない。
		const hits = [...floor].filter((k) => blast(k).some((b) => b === WARDEN_W || b === WARDEN_E)).sort();
		check(`爆風が番兵に届く床は溝の真下 4,2 4,9 だけ（実測 ${hits.join(' ') || 'なし'}）`, JSON.stringify(hits) === JSON.stringify(['4,2', '4,9']));
		check(`通路の ${BOMB_CELLS.join(' ')} からの爆風は番兵に届かない`, BOMB_CELLS.every((k) => !blast(k).some((b) => b === WARDEN_W || b === WARDEN_E)));
		const sameRowWithin = (k, b) => { const [r, c] = k.split(',').map(Number), [br, bc] = b.split(',').map(Number); return r === br && Math.abs(c - bc) >= 1 && Math.abs(c - bc) <= 2; };
		check(`通路の ${BOMB_CELLS.join(' ')} は立てる床で、両方の栗に爆風が届く（同じ行・距離 1〜2）`,
			BOMB_CELLS.every((k) => floor.has(k) && sameRowWithin(k, BURR_W) && sameRowWithin(k, BURR_E)));
		check(`溝の中（栗の向こう）へは初めは歩いて入れない`, !floor.has('2,3') && !floor.has('2,8') && !floor.has('2,10') && !floor.has(PLATE_W));
	}

	// ── ④ 通り抜け（謎を解かずに口から口へ）＋東西の口の行に槍が来ない ─────
	{
		const floor = walk([TILE.FLOOR, TILE.BUTTON, TILE.SIGN]);
		const all = [...MOUTHS.north, ...MOUTHS.south, ...MOUTHS.east];
		check(`西の口から北・南・東の口へ謎を解かずに抜けられる`, all.every((k) => floor.has(k)));
		// 槍は壁以外を通り抜ける。番兵の列（縦）に壁を挟まずに入る床が西・東の口の行に無い
		const exposed = [];
		for (const w of [WARDEN_W, WARDEN_E]) {
			const [wr, wc] = w.split(',').map(Number);
			for (let r = wr + 1; r < ROWS && t[r][wc] !== TILE.WALL; r++) exposed.push(`${r},${wc}`);
			for (let r = wr - 1; r >= 0 && t[r][wc] !== TILE.WALL; r--) exposed.push(`${r},${wc}`);
		}
		check(`番兵の列は上下とも壁で閉じている（縦に槍が出ない・晒される床 ${exposed.join(' ') || 'なし'}）`, exposed.length === 0);
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
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「栗番の辻」に作り替える（キュー95 の6室目）`);
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${rowStr(row)}`));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) ng++; }
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);
	if (DRY) console.log('\n--dry: 書き込みなし');
	else { writeFileSync(MAP_PATH, JSON.stringify(data, null, 2)); console.log('\n書き込み完了:', MAP_PATH); }
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
