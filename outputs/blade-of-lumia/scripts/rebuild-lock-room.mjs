#!/usr/bin/env node
// scripts/rebuild-lock-room.mjs ── 実行キュー 0o-3（2026-09-05）
// 「二色の錠の間」（`darklord_prison 0,1`）を**作り直す**。0o-2 で作った盤面は
// ユーザーが実際に遊んで却下した：
//   「ちょっとまって、パズル簡単すぎない？ こんな簡単なパズルならない方がいいでしょ。
//     もっと難しくしてよ」
// 難しさの軸はユーザーが確定した2つ＝**読みの深さ（順序が一意）** と **手数の長さ**。
// デッドロックは許す（笛 `fluteEffect:{type:'resetStones'}` をこの部屋に付ける）。
//
// ── 旧盤面が簡単だった理由（0o-2 の設計そのものが上限を作っていた）──────────
//   旧盤面は「レーンを幅1・奥を行き止まり」にしてデッドロック 0 を幾何で保証していた。
//   その結果 石は**ボタンへ向かってしか動けない**＝考える余地が「どちらの色を先に開けるか」
//   だけになり、L=32・ボタン充填順は 2 通り（どちらでもよい）＝読みが要らない。
//   ∴「デッドロック 0」という自縄自縛を捨て、笛の救済に乗り換えたのがこの作り直し。
//
// ── 新しい盤面の設計 ─────────────────────────────────────────
//   骨格：北の帯 row 1（降り口 cols 1/4/7/10）＋ row 3 のレーン ＋ 広間 rows 5-6。
//   ・**石が row 3 へ入る口は (4,6) の1マスだけ**。その足場は (6,6)＝青門
//     ∴石を1個上げるのに毎回「青」が要る。
//   ・**プレイヤー専用の縦穴 col 3**（(4,3)。真上 (2,3) と真下 (6,3) が壁＝石を押す足場が
//     どちらにも無い∴石は絶対に入らない）。これが無いと (3,6) に石を上げた瞬間
//     プレイヤーが上下に分断され、レーンの裏へ回り込めず**解なし**になる（実測で確認）。
//   ・レーンは3本とも「異色の門が直列」＝1個の石を据えるのに色を跨ぐ：
//       A(3,1) … 青で (4,6) へ上げる → **赤**で (3,5) を跨いで (3,3) まで運ぶ
//                 → **青**で (3,2) を跨いで A（押し位置 (3,4)/(3,3) は無色の床）
//       C(3,10)… 青で上げる → **赤**で (3,9) を跨いで C（押し位置 (3,5) も赤門）
//       B(6,10)… **青**で (6,6) を跨ぐ → 床 (6,7)(6,8) で待つ → **赤**で (6,9) を跨ぐ
//   ・石 (6,5) は北へ押せない（足場 (7,5) が T）∴**B 専用**。残り2個が A と C＝割当が確定。
//   ・色スイッチは 赤 `[`(7,2)／青 `]`(7,10)＝どちらも広間の南の袖（矢でも狙える）。
//   ・宝箱（ハートの器 8,3）は T の奥をさらに赤門 (8,4) で仕切る＝最後にもう一度 赤が要る。
//
// ⚠️ 触ると壊れる不変条件（実測で1つずつ潰した落とし穴）：
//   (1) 直列の門と門のあいだは**床2枚**。1枚だと「次の押し位置が閉じた門の中」になり解なし
//       （H 候補＝(6,7) が青門・(6,9) が赤門で床1枚＝B のレーンが通らなかった）。
//   (2) プレイヤー専用の縦穴 col 3 の (2,3)/(6,3) は壁のまま。掘ると石が入って
//       「唯一の連絡路を石で塞ぐ」＝笛でしか戻せない詰みが増える（かつ石の割当が崩れる）。
//   (3) row 2 の cols 2/3/5/6/8/9 は壁のまま＝石を連絡通路 (0,5)/(0,6) へ押し出せない。
//   (4) ボタンは T (7,5)/(7,6) に隣接させない（足踏みで T を跨げてしまう）。
//   (5) **初期石の隣接に注意**：初期石2個に囲まれた床があると、そこで笛を吹いた人が
//       壁に閉じ込められる（(5,4) 版で実測。∴石を (5,5) にずらした）。
//   (6) 色門の奥に立てるセルを作らない（笛は activeColor も null に戻す＝game/game.js:1647-1648
//       ∴色門の奥で吹くと永久に出られない）。例外は T の奥（宝箱 8,3）だけ＝そこは恒久ロック
//       後にしか入れず、笛は allSolved で不発になる。
//
// 実測（このスクリプトが毎回測り直して合わなければ書かない）：
//   南口まで L=120／宝箱まで L=122（剣だけ L=126）・貪欲（押し単位マクロ）では解けない・
//   デッドロック 1,414,321・solCount 684・forcedRatio 0.06・**ボタン充填順は 1 通り（A→B→C）**・
//   石を押さないと南口にも宝箱にも届かない・赤門を壁にすると解なし・青門を壁にすると解なし・
//   色スイッチを床にする（色を移せない）と解なし。
//
// 実行：outputs/blade-of-lumia/ から `node --max-old-space-size=6000 scripts/rebuild-lock-room.mjs`

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { TILE } from '../shared/tiles.js';
import { ITEM_META } from '../shared/items.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
// makeGreedyPush = 軸②の「押し単位のマクロ貪欲」。既定の1手山登りでは石パズルの軸②が
// 空虚になる（0o-2 はそれで「貪欲では解けない」を主張していた＝無意味だった）。
import { measureMetrics, makeGreedyPush, buttonFillOrders } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const LAYER = 'darklord_prison';
const ENTRANCE = '0,0';      // 岩牢の口（前室＋竪坑）
const PUZZLE = '0,1';        // 二色の錠の間（この部屋を作り直す）
const CELL = '0,2';          // 封魔の間（触らない）

const HEART_CELL = '8,3';    // 錠の間の宝箱（座標は動かさない）
const SIGN_OLD = '4,3';      // 旧・刻み文（新盤面では床＝プレイヤー専用の縦穴の一部）
const SIGN_NEW = '2,6';      // 新・刻み文（降り口の真正面。看板は通行不可＝壁と同じ）

// 0o-2 の盤面（これを見つけたときだけ書き換える＝手で直した盤面を黙って潰さない）
const OLD_ROWS = [
	'#####..#####',
	'#S.(*..*).S#',
	'####....####',
	'###[....]###',
	'###i....####',
	'####....####',
	'####....####',
	'#####TT#####',
	'###B(..#####',
	'#####..#####',
];

// 新盤面（.scratch/lock-room-lab.mjs で候補 A/B/D/F/G/H を潰して残った I）
const NEW_ROWS = [
	'#####..#####',
	'#..........#',
	'#.##.#i.##.#',
	'#S)..(...(S#',
	'###.##.#####',
	'#....*.....#',
	'#.*#.*)..(S#',
	'#.[##TT...]#',
	'###B(..#####',
	'#####..#####',
];

const ENTRY_CELLS = ['0,5', '0,6'];
const EXIT_CELLS = ['9,5', '9,6'];
const BUTTONS = ['3,1', '3,10', '6,10'];      // A / B / C（充填順が一意になる並び）
const STONES = ['5,5', '6,2', '6,5'];
const EXPECT = { lExit: 120, lChest: 122, lChestMelee: 126, orders: 1, order: 'A→B→C' };

function die(msg) {
	console.error(`✗ ${msg}`);
	process.exit(1);
}

const rowsToTiles = (rows) => rows.map((r) => [...r]);
const cellsOf = (rows, ch) => {
	const out = [];
	rows.forEach((row, r) => [...row].forEach((c, i) => { if (c === ch) out.push(`${r},${i}`); }));
	return out;
};

// ── 前提の確認（壊れた前提の上に書かない）────────────────────────
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const L = map.layers[LAYER];
if (!L) die(`${LAYER} が無い（0o の migrate-darklord-prison.mjs を先に流す）`);
if (Object.keys(L.stages).join(' ') !== `${ENTRANCE} ${PUZZLE} ${CELL}`) {
	die(`部屋の並びが ${ENTRANCE} ${PUZZLE} ${CELL} でない: ${Object.keys(L.stages).join(' ')}`
		+ '（0o-2 の migrate-darklord-prison-puzzle.mjs を先に流す）');
}
if (L.bossStage !== CELL) die(`bossStage が ${CELL} でない: ${L.bossStage}`);
const puzzle = L.stages[PUZZLE];
const before = puzzle.tiles.map((r) => r.join(''));
if (before.join('|') !== OLD_ROWS.join('|') && before.join('|') !== NEW_ROWS.join('|')) {
	die('錠の間の盤面が 0o-2 版でも 0o-3 版でもない＝誰かが手で直した'
		+ '（黙って潰さない。現物を見てからこのスクリプトの OLD_ROWS を更新する）');
}
if (puzzle.chestContents?.[HEART_CELL]?.type !== 'heartContainer') {
	die(`錠の間の宝箱 (${HEART_CELL}) がハートの器でない＝報酬の前提が崩れている`);
}
if (puzzle.isBossRoom) die('錠の間が isBossRoom になっている');
const cellBefore = L.stages[CELL].tiles.map((r) => r.join(''));   // 主の間は1セルも動かさない
// 縦の並び（前室 → 錠の間 → 主の間）が歩いて繋がるか
const entrance = L.stages[ENTRANCE];
for (const c of [5, 6]) {
	if (entrance.tiles[9][c] !== TILE.FLOOR) die(`前室の南辺 (9,${c}) が塞がっている`);
	if (NEW_ROWS[0][c] !== TILE.FLOOR) die(`錠の間の北辺 (0,${c}) が塞がっている`);
	if (NEW_ROWS[9][c] !== TILE.FLOOR) die(`錠の間の南辺 (9,${c}) が塞がっている`);
	if (L.stages[CELL].tiles[0][c] !== TILE.DOORWAY_BOSS) die(`主の間の北辺 (0,${c}) が扉でない`);
}

// ── 盤面の幾何（状態空間を回す前に、上の不変条件を機械で確かめる）──────────
const PLAYER_OK = new Set([TILE.FLOOR, TILE.BUTTON, TILE.SWITCH_RED, TILE.SWITCH_BLUE, 'B', TILE.STONE]);
// ⚠️ 看板 `i` は通行不可（game/passable.js:264「隣接して剣で読む」）∴PLAYER_OK に入れない。
//    shared/tiles.js の TILE_META は passable:true と書いてあるがそれはエディタ用のメタ。

function checkGeometry(rows) {
	const bad = [];
	const at = (r, c) => rows[r]?.[c];
	if (rows.length !== ROWS || rows.some((r) => r.length !== COLS)) bad.push(`${ROWS}x${COLS} でない`);
	if (cellsOf(rows, TILE.BUTTON).join(' ') !== BUTTONS.join(' ')) bad.push(`ボタンが ${BUTTONS.join(' ')} でない`);
	if (cellsOf(rows, TILE.STONE).join(' ') !== STONES.join(' ')) bad.push(`石が ${STONES.join(' ')} でない`);
	if (cellsOf(rows, TILE.GATE).join(' ') !== '7,5 7,6') bad.push('T が (7,5)/(7,6) に無い');
	if (cellsOf(rows, TILE.SWITCH_RED).length !== 1 || cellsOf(rows, TILE.SWITCH_BLUE).length !== 1) {
		bad.push('色スイッチが赤青1枚ずつでない');
	}

	// (3) 石を連絡通路（0,5 0,6 9,5 9,6）へ押し出せない＝押しの成立幾何が無いこと
	for (const cell of [...ENTRY_CELLS, ...EXIT_CELLS]) {
		const [r, c] = cell.split(',').map(Number);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const from = at(r - dr, c - dc), stand = at(r - 2 * dr, c - 2 * dc);
			if (from && stand && PLAYER_OK.has(from) && PLAYER_OK.has(stand)) {
				bad.push(`石を連絡通路 ${cell} へ押し込める幾何（${r - dr},${c - dc} の石を ${r - 2 * dr},${c - 2 * dc} から押す）`);
			}
		}
	}
	// (4) ボタンが T に隣接していない
	for (const b of cellsOf(rows, TILE.BUTTON)) {
		const [br, bc] = b.split(',').map(Number);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			if (at(br + dr, bc + dc) === TILE.GATE) bad.push(`ボタン ${b} が T に隣接（足踏みで T を跨げる）`);
		}
	}
	// (2) プレイヤー専用の縦穴＝(4,3) の真上と真下が壁（石を押す足場が無い）
	if (at(2, 3) !== TILE.WALL || at(6, 3) !== TILE.WALL) bad.push('(2,3)/(6,3) が壁でない＝縦穴に石が入る');
	if (at(4, 3) !== TILE.FLOOR || at(3, 3) !== TILE.FLOOR || at(5, 3) !== TILE.FLOOR) {
		bad.push('プレイヤー専用の縦穴 (3,3)/(4,3)/(5,3) が床でない');
	}
	// (1) 直列の門のあいだは床2枚（row 6 の 青(6,6) → 床 → 床 → 赤(6,9)）
	if (!(at(6, 6) === TILE.GATE_BLUE && at(6, 7) === TILE.FLOOR && at(6, 8) === TILE.FLOOR && at(6, 9) === TILE.GATE_RED)) {
		bad.push('row 6 のレーンが「青・床・床・赤」でない（床1枚だと石を赤門へ押す足場が青門になる＝解なし）');
	}
	if (!(at(3, 5) === TILE.GATE_RED && at(3, 4) === TILE.FLOOR && at(3, 3) === TILE.FLOOR && at(3, 2) === TILE.GATE_BLUE)) {
		bad.push('row 3 西のレーンが「赤・床・床・青」でない');
	}

	// (6)(5) 笛で必ず立て直せるか＝色門の奥に立てるセルが T の奥（宝箱）だけであること。
	//   笛は石を初期位置へ戻し activeColor も null にする∴「石を壁とみなし、色門を閉じ、
	//   T だけ開けた盤面」で全床が歩けなければならない。
	const walk = (opt) => {
		const q = [...ENTRY_CELLS], seen = new Set(q);
		for (let i = 0; i < q.length; i++) {
			const [r, c] = q[i].split(',').map(Number);
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
				if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k)) continue;
				const ch = at(nr, nc);
				if (ch === TILE.STONE && opt.stonesBlock) continue;
				if (!PLAYER_OK.has(ch) && !opt.pass?.has(ch)) continue;
				if (opt.stop?.has(ch)) continue;
				seen.add(k); q.push(k);
			}
		}
		return seen;
	};
	const base = walk({ pass: new Set([TILE.GATE]), stonesBlock: true });
	const withoutT = walk({ pass: new Set([TILE.GATE_RED, TILE.GATE_BLUE]), stop: new Set([TILE.GATE]) });
	const pockets = [];
	rows.forEach((row, r) => [...row].forEach((ch, c) => {
		const k = `${r},${c}`;
		if (!PLAYER_OK.has(ch) || base.has(k)) return;
		if (ch === TILE.STONE) {   // 初期石のセルは「石をどかせば立てる」＝隣が base なら可
			if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => base.has(`${r + dr},${c + dc}`))) return;
		}
		pockets.push(k);
		if (withoutT.has(k)) bad.push(`笛で立て直せないセル ${k}（色門の奥／初期石で孤立・T の奥でない）`);
	}));
	if (pockets.join(' ') !== HEART_CELL) bad.push(`色門の奥のくぼみが宝箱 ${HEART_CELL} だけでない: ${pockets.join(' ')}`);
	return bad;
}

// ── パズルを状態空間で測る（PUZZLE-DESIGN §2/§4/§6-1）────────────────
const posOf = (state) => state.split('|')[0];
const buildSolver = (rows, opt = {}) => {
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	return makeSolver(rowsToTiles(rows), bg, [], {}, new Set(), { hasLadder: false, ...opt });
};
const startsOf = (S) => ENTRY_CELLS.map((cell) => {
	const [r, c] = cell.split(',').map(Number);
	return S.encode(r, c, S.initStones, 0, 0, 0);   // color=0＝両門とも閉から始める
});
const makeH = (goalCell) => {
	const [gr, gc] = goalCell.split(',').map(Number);
	const btn = BUTTONS.map((b) => b.split(',').map(Number));
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	return (state) => {
		const [pos, stonesStr] = state.split('|');
		const [pr, pc] = pos.split(',').map(Number);
		let h = man([pr, pc], [gr, gc]);
		for (const s of (stonesStr ? stonesStr.split(';') : [])) {
			const sp = s.split(',').map(Number);
			h += Math.min(...btn.map((b) => man(sp, b)));
		}
		return h;
	};
};

/** ボタンの充填順序を A→B→C の形で読む（測定コアは scripts/lib/puzzle-metrics.mjs）。 */
function countButtonOrders(rows) {
	const S = buildSolver(rows);
	const { L, orders } = buttonFillOrders(S, startsOf(S), (s) => EXIT_CELLS.includes(posOf(s)), BUTTONS);
	const NAME = ['A', 'B', 'C', 'D'];
	return { L, orders: orders.map((seq) => seq.map((i) => NAME[i]).join('→')) };
}

function reachable(rows, opt) {
	const S = buildSolver(rows, opt);
	const seen = new Set(startsOf(S)); const q = [...seen];
	for (let i = 0; i < q.length; i++) for (const nx of S.nextStates(q[i])) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
	return {
		states: seen.size,
		exit: [...seen].some((s) => EXIT_CELLS.includes(posOf(s))),
		chest: [...seen].some((s) => posOf(s) === HEART_CELL),
	};
}

function measurePuzzle() {
	const t0 = Date.now();
	const opt = {
		guardMax: 6000000,
		escapeTest: (s) => ENTRY_CELLS.includes(posOf(s)) || EXIT_CELLS.includes(posOf(s)),
		greedyFn: makeGreedyPush(BUTTONS),
	};
	const S = buildSolver(NEW_ROWS);
	const exitM = measureMetrics(S, startsOf(S), (s) => EXIT_CELLS.includes(posOf(s)), makeH(EXIT_CELLS[0]), opt);
	const chestM = measureMetrics(S, startsOf(S), (s) => posOf(s) === HEART_CELL, makeH(HEART_CELL), opt);
	const meleeS = buildSolver(NEW_ROWS, { noTools: true });   // 弓/ブーメランなし＝隣接で叩くだけ
	const meleeM = measureMetrics(meleeS, startsOf(meleeS), (s) => posOf(s) === HEART_CELL, makeH(HEART_CELL), opt);
	const ord = countButtonOrders(NEW_ROWS);
	// 必須性（PUZZLE-DESIGN §6-1 step 2）：石・赤門・青門・色の機構をそれぞれ殺すと解けない
	const noPush = reachable(NEW_ROWS, { noPush: true });
	const kill = (from, to) => NEW_ROWS.map((r) => [...r].map((x) => (from.includes(x) ? to : x)).join(''));
	const noRed = reachable(kill([TILE.GATE_RED], TILE.WALL));
	const noBlue = reachable(kill([TILE.GATE_BLUE], TILE.WALL));
	// 色スイッチを**床に**する＝幾何は緩む（プレイヤーの立ち位置が増える）のに解けないなら
	// 「色を移す操作そのものが必須」が上界つきで示せる。
	const noColor = reachable(kill([TILE.SWITCH_RED, TILE.SWITCH_BLUE], TILE.FLOOR));
	return { exitM, chestM, meleeM, ord, noPush, noRed, noBlue, noColor, secs: (Date.now() - t0) / 1000 };
}

const geo = checkGeometry(NEW_ROWS);
if (geo.length) {
	console.error('✗ 錠の間の幾何が不変条件を満たしていない（マップは書き換えていない）:');
	geo.forEach((b) => console.error(`   - ${b}`));
	process.exit(1);
}
console.log('   幾何の不変条件 ✓（連絡通路への押し出し無し・ボタンは T 非隣接・'
	+ 'プレイヤー専用の縦穴あり・直列の門のあいだは床2枚・笛の効かないくぼみは宝箱だけ）');

const M = measurePuzzle();
const bad = [];
const need = (cond, msg) => { if (!cond) bad.push(msg); };
need(M.exitM.L === EXPECT.lExit, `南口までの L が ${EXPECT.lExit} でない: ${M.exitM.L}`);
need(M.chestM.L === EXPECT.lChest, `宝箱までの L が ${EXPECT.lChest} でない: ${M.chestM.L}`);
need(M.meleeM.L === EXPECT.lChestMelee, `剣だけの L が ${EXPECT.lChestMelee} でない: ${M.meleeM.L}`);
need(!M.exitM.greedy && !M.chestM.greedy, '押し単位のマクロ貪欲で解けてしまう（軸②が立たない＝作業ゲー）');
need(M.exitM.deadlocks > 0, 'デッドロックが 0（0o-2 の「幅1レーン」に戻っている＝考える余地が無い）');
need(M.exitM.forcedRatio <= 0.7, `forcedRatio が高すぎる（一本道）: ${M.exitM.forcedRatio}`);
need(M.ord.orders.length === EXPECT.orders && M.ord.orders[0] === EXPECT.order,
	`ボタン充填順が一意でない（軸「読みの深さ」）: ${M.ord.orders.join(' , ')}`);
need(!M.noPush.exit && !M.noPush.chest, '石を押さずに南口／宝箱へ行けてしまう（パズルが飾り）');
need(!M.noRed.exit && !M.noRed.chest, '赤門を壁にしても解ける（赤門が飾り＝I4 不成立）');
need(!M.noBlue.exit && !M.noBlue.chest, '青門を壁にしても解ける（青門が飾り＝I4 不成立）');
need(!M.noColor.exit && !M.noColor.chest, '色スイッチが無くても解ける（色の機構が飾り）');
if (bad.length) {
	console.error('✗ 錠の間の設計が条件を満たしていない（マップは書き換えていない）:');
	bad.forEach((b) => console.error(`   - ${b}`));
	process.exit(1);
}

// ── 書き換え（この部屋だけ。主の間と前室の幾何は触らない）────────────────
puzzle.tiles = rowsToTiles(NEW_ROWS);
delete puzzle.signData[SIGN_OLD];
puzzle.signData[SIGN_NEW] = {
	name: '錠の間の刻み文',
	lines: [
		'【二色の錠の間】',
		'赤と青の 門は 決して 同時には 開かぬ。',
		'されど 錠は 石の 重みを 覚えている。',
		'一つの 石を 据えるには 二つの 色を 渡り歩け。',
		'——手が 詰まったら 笛を 吹け。石は 元の 岩に 還る。',
	],
};
// 笛の救済（0o-3・ユーザー確定）＝デッドロックを難しさの本体として使う代わりに、
// 「石を初期位置へ戻す」を必ず持たせる。全ボタンに石が乗っていれば不発（解いた盤面は壊れない）。
puzzle.fluteEffect = { type: 'resetStones' };
puzzle.comment = `[${LAYER} ${PUZZLE}] 二色の錠の間＝前室と主の間のあいだのパズル部屋。`
	+ '⚠️ 0o-3（2026-09-05）で**盤面を丸ごと作り直した**。0o-2 版はユーザーが遊んで却下'
	+ '（「こんな簡単なパズルならない方がいいでしょ。もっと難しくしてよ」）＝'
	+ '「レーンを幅1にしてデッドロック 0 を幾何で保証する」設計が読みの余地を消していた'
	+ `（L=32・ボタン充填順 2 通り）。今の設計は逆で、デッドロック（${M.exitM.deadlocks} 状態）を`
	+ '難しさの本体として使い、笛 fluteEffect:{type:resetStones} で救済する。'
	+ '骨格＝北の帯 row 1（降り口 cols 1/4/7/10）／row 3 のレーン／広間 rows 5-6。'
	+ '石が row 3 へ入る口は (4,6) の1枚だけで、その足場 (6,6) が青門∴石を上げるたび青が要る。'
	+ 'レーンは3本とも異色の門が直列＝A(3,1) は 青で上げ→赤で (3,5) を跨ぎ→青で (3,2) を跨ぐ、'
	+ 'C(3,10) は 青で上げ→赤で (3,9) を跨ぐ、B(6,10) は 青で (6,6)→床2枚→赤で (6,9) を跨ぐ。'
	+ '石 (6,5) は北へ押せない（足場 (7,5) が T）∴B 専用＝残り2個が A と C で割当が確定する。'
	+ `色スイッチ 赤 \`[\`(7,2)／青 \`]\`(7,10)。宝箱（${ITEM_META.heartContainer.name}・${HEART_CELL}）は`
	+ 'T の奥をさらに赤門 (8,4) で仕切る＝最後にもう一度 赤が要る。'
	+ `実測（${'`scripts/rebuild-lock-room.mjs`'} が毎回測り直す）：南口まで L=${M.exitM.L}／`
	+ `宝箱まで L=${M.chestM.L}（剣だけ L=${M.meleeM.L}）・押し単位のマクロ貪欲では解けない・`
	+ `デッドロック ${M.exitM.deadlocks}・solCount ${M.exitM.solCount}・`
	+ `forcedRatio ${M.exitM.forcedRatio.toFixed(2)}・**ボタン充填順は 1 通り（${M.ord.orders[0]}）**・`
	+ '石を押さないと南口にも宝箱にも届かない・赤門/青門を壁にすると解なし・'
	+ '色スイッチを床にすると解なし。'
	+ '⚠️ 触ると壊れる：(a) 直列の門のあいだは床2枚（1枚だと押し位置が閉じた門になり解なし）／'
	+ '(b) プレイヤー専用の縦穴 (4,3) の真上 (2,3) と真下 (6,3) は壁のまま（石が入ると'
	+ '広間と帯を結ぶ唯一の連絡路が塞がる。掘ると解なしにもなる）／(c) row 2 の cols 2/3/5/6/8/9 は'
	+ '壁のまま（石を連絡通路 0,5/0,6 へ押し出せない根拠）／(d) ボタンを T に隣接させない／'
	+ '(e) 初期石2個で床を囲まない（そこで笛を吹くと閉じ込められる）／'
	+ '(f) 色門の奥に立てるセルを作らない（笛は activeColor も null に戻す＝'
	+ 'game/game.js:1647-1648∴色門の奥で吹くと永久に出られない。例外は T の奥の宝箱だけ）。';

const out = JSON.stringify(map, null, 2);
writeFileSync(MAP_PATH, out);

// ── 自己検証（書いた JSON をもう一度読む）──────────────────────
const back = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const B = back.layers[LAYER];
const pz = B.stages[PUZZLE];
ok(Object.keys(B.stages).join(' ') === `${ENTRANCE} ${PUZZLE} ${CELL}`, '部屋の並びが降りる順でない');
ok(B.bossStage === CELL, `bossStage が ${CELL} でない`);
ok(pz.tiles.map((r) => r.join('')).join('|') === NEW_ROWS.join('|'), '錠の間の盤面が設計と違う');
ok(pz.tiles.every((r) => Array.isArray(r) && r.length === COLS), '錠の間の tiles が 12 列の文字配列でない');
ok(Array.isArray(pz.links), '錠の間の links が配列でない（{} は refreshGates を殺す）');
ok(pz.fluteEffect?.type === 'resetStones', '錠の間に笛の石戻しが付いていない');
ok(!pz.initActiveColor, '錠の間に初期色が付いている（両門とも閉から始める設計）');
ok(pz.chestContents?.[HEART_CELL]?.type === 'heartContainer', '錠の間にハートの器が無い');
ok(!pz.showConditions?.[HEART_CELL], '錠の間の宝箱に封印が付いている（到達で開く設計）');
ok(!pz.signData?.[SIGN_OLD], `旧・刻み文 ${SIGN_OLD} が残っている（新盤面ではそこは床）`);
ok(pz.signData?.[SIGN_NEW]?.lines?.length > 0, `刻み文 ${SIGN_NEW} が無言看板`);
ok(pz.signData?.[SIGN_NEW]?.lines?.some((l) => l.includes('笛')), '刻み文が笛の救済に触れていない（理不尽になる）');
ok(pz.tiles[2][6] === TILE.SIGN, '刻み文のタイル `i` が (2,6) に無い');
ok(!pz.isBossRoom, '錠の間がボス部屋になっている');
ok(Object.keys(pz.enemyDirs ?? {}).length === 0, '錠の間に敵の向きが入っている（この部屋に敵は置かない）');
ok(B.stages[CELL].tiles.map((r) => r.join('')).join('|') === cellBefore.join('|'),
	'主の間の幾何が動いた（1セルも動かしてはいけない）');
ok(B.stages[ENTRANCE].mapEnters['1,1']?.id === 'darklordPrison', '前室の出入口が壊れた');
if (problems.length) {
	console.error('✗ 自己検証で問題を検出（マップは書き換わっている＝git で戻せる）:');
	problems.forEach((p) => console.error(`   - ${p}`));
	process.exit(1);
}

console.log('✓ 二色の錠の間を作り直した');
console.log(NEW_ROWS.map((r, i) => `   ${i} ${r}`).join('\n'));
console.log(`   石 ${STONES.join(' ')}／ボタン ${BUTTONS.join(' ')}（充填順は ${M.ord.orders[0]} の1通り）`);
console.log(`   L … 南口 ${M.exitM.L}／宝箱 ${M.chestM.L}（剣だけ ${M.meleeM.L}）`
	+ `・状態 ${M.exitM.states}・デッドロック ${M.exitM.deadlocks}`
	+ `・solCount ${M.exitM.solCount}・forced ${M.exitM.forcedRatio.toFixed(2)}`
	+ `・noEscape ${M.exitM.noEscape}（笛で戻せる）`);
console.log(`   必須性 … 石を押さない:${M.noPush.exit || M.noPush.chest ? '✗' : '✓'}`
	+ ` 赤門を壁:${M.noRed.exit || M.noRed.chest ? '✗' : '✓'}`
	+ ` 青門を壁:${M.noBlue.exit || M.noBlue.chest ? '✗' : '✓'}`
	+ ` 色スイッチを床:${M.noColor.exit || M.noColor.chest ? '✗' : '✓'}`);
console.log(`   笛 … fluteEffect:{type:'resetStones'}（全ボタンに石が乗っていれば不発）`);
console.log(`   （測定 ${M.secs.toFixed(1)}s）`);
