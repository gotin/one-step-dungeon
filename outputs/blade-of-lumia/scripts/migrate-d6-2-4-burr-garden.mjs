// dungeon_6 `2,4`（看板＝分裂スライムの巣 `2,3` の南の辻）：薄い部屋を「大いが栗の庭」に作り替える
// （2026-11-06 / PLAN 実行キュー 95 の4室目・主題はユーザー判断「A' 専用の石だけが爆風で動く」＋「大いが栗」・叩き台）
//
// ■ 何が薄かったか
//      0 #####..#####
//      2 #....B.....#     ← 宝箱（ルピー×5）
//      3 #..u....t..#     ← 茂み1・木1
//      9 ############
//   宝箱を開けるだけの四角い広間・敵なし。
//
// ■ 新しいもの（このスクリプトと同じ日にエンジンへ入れた）
//   **大いが栗 '¤'**（`shared/tiles.js` TILE.BURR）＝聖樹から落ちた巨大な栗の実。
//   ①全身とげ＝手では押せない（押すと「とげが 痛くて 押せない」）②丸い＝爆弾の爆風で止まるまで
//   転がる（`game/projectile.js` rollBurrsFromBlast）③重い実＝踏み板を押せる。
//   普通の石 '*' は爆風で動かない＝全体のルールにすると既存の石の部屋が崩れる（PLAN キュー95 4室目の監査）。
//
// ■ 新しい `2,4`＝大いが栗の庭
//      0 #####..#####
//      1 #B#.i......#     ← 宝箱 B(1,1)＝爆弾×5（補給）・碑 i(1,4)
//      2 #T#.....*..#     ← 門 T(2,1)＝踏み板が全部石で埋まると開く／石 *(2,8)＝手で押す
//      3 #..t.......#     ← 木 t(3,3)＝北へ転がる栗の止め木
//      4 .......SS...     ← 踏み板 S(4,7)・S(4,8)
//      5 ............
//      6 #..........#
//      7 #..¤.......#     ← 大いが栗 ¤(7,3)
//      8 #..........#
//      9 ############
//   解き方（爆弾2個）＝①栗の南 (8,3) に置く→北へ転がって木の手前 (4,3) で止まる
//   ②石を奥の踏み板 S(4,8) へ押す（石は手で押せる）③栗の西 (4,1)/(4,2) に置く→東へ転がり、
//   手前の踏み板 S(4,7) を……**石に当たって止まる**＝2枚とも埋まって門が開く。
//   止め木の無い踏み板は転がって通り過ぎる＝「石は手で、栗は爆風で」を1部屋で並べて見せる。
//   転がす向きを誤ったら部屋を出て入り直せば石も栗も戻る（ダンジョンの石の決まり）。
//   報酬＝爆弾×5（キュー95 の⛔の約束＝爆弾の部屋を作るときは補給を足す）。旧 宝箱のルピー×5 は撤去。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝箱の中身／碑の本文／外周の口の形が不変
//   ・ソルバー（scripts/lib/blade-solver.mjs）で解ける・爆弾なしでは解けない・石を押さなくても解けない
//     ・爆弾の最少個数が 2・入って詰む状態が無い（noEscape 0）
//   ・口から口へ謎を解かずに抜けられる・層の到達性が書き換え前と同じ・dead-edge 0
//
// 使い方:
//   node scripts/migrate-d6-2-4-burr-garden.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-2-4-burr-garden.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer } from './lib/connectivity.mjs';
import { ROWS as SR, COLS as SC, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '2,4';
export const ROWS = 10, COLS = 12;

export const TARGET = [
	'#####..#####',
	'#B#.i......#',
	'#T#.....*..#',
	'#..t.......#',
	'.......SS...',
	'............',
	'#..........#',
	'#..¤.......#',
	'#..........#',
	'############',
];
export const CHEST = '1,1';
export const GATE  = '2,1';
export const SIGN  = '1,4';
export const BURR  = '7,3';
export const STONE = '2,8';
export const BUTTONS = ['4,7', '4,8'];
export const MOUTHS = { north: ['0,5', '0,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const CHEST_CONTENTS = { [CHEST]: { type: 'item', item: 'bomb', count: 5, name: '爆弾×5' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '大いが栗の 庭',
		lines: [
			'聖樹の 大いが栗は とげに 覆われ、 手では 動かせぬ。',
			'丸い 実は 爆ぜる 風に 転がり、 何かに 当たるまで 止まらぬ。',
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
	room.comment = '【キュー95 大いが栗の庭（2026-11-06）】大いが栗 ¤ は手で押せず爆風で止まるまで転がる。'
		+ '栗を爆弾で北へ（木で止まる）→石を手で奥の踏み板へ→栗を爆弾で東へ（石に当たって手前の踏み板で止まる）'
		+ '＝2枚埋まって門 T が開き、宝箱（爆弾×5＝補給）。scripts/migrate-d6-2-4-burr-garden.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱 ${CHEST} は1つ・中身＝爆弾×5`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS));
	check(`大いが栗 ${BURR} は1つ・石 ${STONE} は1つ`, count(TILE.BURR) === 1 && at(BURR) === TILE.BURR
		&& count(TILE.STONE) === 1 && at(STONE) === TILE.STONE);
	check(`踏み板は ${BUTTONS.join(' ')} の2枚・門は ${GATE} の1枚`, count(TILE.BUTTON) === 2 && BUTTONS.every((k) => at(k) === TILE.BUTTON)
		&& count(TILE.GATE) === 1 && at(GATE) === TILE.GATE);
	check(`碑 ${SIGN} に本文がある`, at(SIGN) === TILE.SIGN && room.signData[SIGN]?.lines?.length === 2);
	check(`床の爆弾 '5'・朽ちた根 '!'・敵が無い`, !t.flat().some((ch) => ch === TILE.ITEM_BOMB || ch === TILE.BREAKABLE_WALL || ENEMY_META[ch]));

	// ── ② ソルバー（実ゲームと同じ遷移）─────────────────────────────────
	{
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で爆弾が使える（toolsUsableIn）`, tools.has('bomb'));
		const solve = (opts) => {
			const bg = Array.from({ length: SR }, () => Array(SC).fill('g'));
			const S = makeSolver(t.map((r) => r.slice()), bg, [], {}, new Set(), {
				hasLadder: tools.has('ladder'), hasCandle: tools.has('candle'), noTools: false, ...opts,
			});
			const starts = S.exitCells.map((cell) => { const [r, c] = cell.split(',').map(Number); return S.encode(r, c, S.initStones, 0, 0, S.litInitMask); });
			const goal = (st) => { const f = st.split('|'); return f[0] === CHEST && f[5] === '1'; };
			return { S, starts, m: measureMetrics(S, starts, goal, () => 0, { guardMax: 4000000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) }) };
		};
		const { S, starts, m } = solve({});
		check(`ソルバーで解ける（L=${m.L}・最短解 ${m.solCount}・状態 ${m.states}）`, m.L != null);
		check(`入って詰む状態が無い（noEscape ${m.noEscape}）`, m.noEscape === 0);
		check(`対照：爆弾なしでは解けない`, solve({ noTools: true }).m.L == null);
		check(`対照：石を押さなくては解けない`, solve({ noPush: true }).m.L == null);
		// 爆弾の最少個数（0-1 BFS：位置が同じで石が動く手＝爆弾）
		const cost = new Map(); const dq = [];
		for (const s of starts) { cost.set(s, 0); dq.push(s); }
		let best = null;
		while (dq.length) {
			const st = dq.shift(); const f = st.split('|');
			if (f[0] === CHEST && f[5] === '1') { best = cost.get(st); break; }
			for (const nx of S.nextStates(st)) {
				const g = nx.split('|');
				const bomb = g[0] === f[0] && g[1] !== f[1];
				const nc = cost.get(st) + (bomb ? 1 : 0);
				if (!cost.has(nx) || nc < cost.get(nx)) { cost.set(nx, nc); bomb ? dq.push(nx) : dq.unshift(nx); }
			}
		}
		check(`爆弾の最少個数が 2（実測 ${best}）＝報酬の5個より少ない（補給が黒字）`, best === 2);
	}

	// ── ③ 通り抜け（謎を解かずに口から口へ）─────────────────────────────
	{
		const seen = new Set(); const q = [];
		const ok = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && [TILE.FLOOR, TILE.BUTTON].includes(t[r][c]);
		for (const k of MOUTHS.west) { seen.add(k); q.push(k); }
		while (q.length) {
			const [r, c] = q.shift().split(',').map(Number);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const k = `${r + dr},${c + dc}`;
				if (seen.has(k) || !ok(r + dr, c + dc)) continue;
				seen.add(k); q.push(k);
			}
		}
		check(`西の口から北・東の口へ謎を解かずに抜けられる`, [...MOUTHS.north, ...MOUTHS.east].every((k) => seen.has(k)));
	}

	// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「大いが栗の庭」に作り替える（キュー95 の4室目）`);
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
