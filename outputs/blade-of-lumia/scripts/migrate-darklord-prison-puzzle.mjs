#!/usr/bin/env node
// scripts/migrate-darklord-prison-puzzle.mjs ── 実行キュー 0o-2（2026-09-05）
// 「魔王の岩牢」を2部屋から**3部屋**にし、報酬を組み替える。
//
// ユーザーの再考（2026-09-05）：
//   (1) 洞窟魔（X 魔王）の報酬がハートの器だけでは しょぼい → もっとすごいアイテム
//   (2) 洞窟の入口が全部 field 8,1 なのは変 → 分散させる（(c) で別途）
//   (3) そこまでするなら もう一部屋増やしてパズルステージを足す ← **このスクリプト**
//
// 何をするか（3点）：
//   ① 主の間（旧 `0,1`）を `0,2` へ移す。**幾何は1セルも触らない**（闘技場から写した床＝
//      X の詔 lockstep の実測条件そのもの）。宝箱の中身だけ ハートの器 → ルミアの剣（tier4）
//      に差し替え、碑文を書き直す。
//   ② 新設の `0,1`「二色の錠の間」を前室と主の間の**あいだ**に挟む。ハートの器はここへ移す
//      （パズルを解いた見返り＝killAll ではなく到達で開く）。
//   ③ 前室（`0,1`→変わらず `0,0`）の刻み文を、竪坑の底が錠の間になったことに合わせて直す。
//
// ⚠️ ステージキーは `"col,row"`（`game/game.js` の遷移計算 `${sx},${sy+1}`）∴縦に降りる並びは
//    `0,0`（前室）→ `0,1`（錠の間）→ `0,2`（封魔の間）。PLAN に書いた「`1,0` パズルの間」は
//    キーの意味を取り違えた記述で、そのままでは**東の脇部屋**＝パズルを解かずに主の間へ
//    行けてしまう（完了条件 (b) が成立しない）∴縦の並びに正した。
// ⚠️ 主の間のキーを動かす影響先は3つ：レイヤーの `bossStage`・`scripts/lib/enemy-placement.mjs`
//    の `EXTRA_ENEMY_ROOMS`・`tests/darklord-prison.spec.js`。前2つはこのスクリプトが現物を
//    見て検証する（宣言が古いままなら止まる）。
//
// ❌ 失効（2026-09-05・実行キュー 0o-3）─────────────────────────────────
// **このスクリプトの「パズルの設計」と「実測」は現物と合っていない。読むな。**
// ユーザーが 0o-2 の錠の間を実プレイして「ちょっとまって、パズル簡単すぎない？ こんな簡単な
// パズルならない方がいいでしょ。もっと難しくしてよ」と判定したため、盤面を全面的に作り直した。
// 錠の間の現物・設計・実測を読むときは **`scripts/rebuild-lock-room.mjs`** を見ること。
//
// 何が失効したか（下の記述はどれも 0o-2 当時のもの）:
//   ・「幅1の一方通行レーン」「石2個」「ボタン (1,1)/(1,10)」「石 (1,4)/(1,7)」
//     → 現物は石3個・ボタン (3,1)/(3,10)/(6,10)・盤面は全面差し替え。
//   ・「デッドロック 0」「noEscape 0」＝**設計方針そのものを捨てた**。浅さの主犯はこれだった
//     （石の奥へ回り込めない＝読む余地が無い）∴ 0o-3 では詰みを許し、部屋に
//     `fluteEffect:{type:'resetStones'}` を付けて笛で立て直せるようにした。
//   ・実測「南口 L=32／宝箱 L=33／剣だけ L=37」→ 現物は 120／122／126。
//   ・「貪欲では解けない（insight>0）」→ この主張は **当時から空虚**だった。既定の1手
//     ヒルクライムは倉庫番では必ず詰まる∴軸②は押し単位のマクロ貪欲
//     （`scripts/lib/puzzle-metrics.mjs` の `makeGreedyPush`）で測らなければ意味が無い。
//
// このスクリプトを再実行してはいけない（冒頭の一度きりガードで止まるが、仮に通れば
// 錠の間が 0o-2 の簡単な盤面に戻る）。0o-2 で移した3部屋構成・報酬の組み替え・入口の分散は
// 現物として生きている＝**部屋割りと報酬の履歴を読む目的でだけ**この下を読むこと。
// ───────────────────────────────────────────────────────────────
//
// パズルの設計（❌ 失効。0o-2 当時の記述）：
//   ・row 1 に東西2本の**幅1の一方通行レーン**を彫る。西 `(`(1,3) の奥にボタン `S`(1,1)、
//     東 `)`(1,8) の奥にボタン `S`(1,10)。石は各レーンの口（1,4)/(1,7)に置く。
//   ・レーンが幅1で奥が行き止まり∴プレイヤーは石の**奥側へ回り込めない**＝石は
//     ボタンへ向かってしか動かない＝**デッドロック 0**（笛の石戻しに頼らない）。
//   ・赤門と青門は同時には開かない（activeColor は排他）が、ボタンは石の重みを覚えている
//     ∴「片方に石を据える → 色を移す → もう片方に据える」でしか全ボタン ON にできない。
//     全ボタン ON ＝ `refreshGates()` が T (7,5)/(7,6) を開き、石が恒久ロックされる
//     （`game/conditions.js` allButtonsHeldByStones＝足踏みでは ON にならない）。
//   ・宝箱（ハートの器）は南の小部屋の奥に赤門 `(`(8,4) で仕切って置く＝T を開けた後も
//     もう一度 色を移す必要がある（色の機構が最後まで効く）。主の間への南口は色で
//     仕切らない＝**閉じ込めが起きない**（noEscape 0）。
//   ・初期色は持たせない（`initActiveColor` なし＝両門とも閉）＝まず色スイッチを叩くことが
//     この部屋の第一歩になる。← ここだけは現物でも生きている（0o-3 も両門閉から始める）。
//
// 実測（❌ 失効。0o-3 の現物は 120／122／126）：
//   南口まで L=32／宝箱まで L=33（剣だけなら L=37）・貪欲では解けない（insight>0）・
//   デッドロック 0・noEscape 0・石を押さないと南口にも宝箱にも届かない。
//
// 実行：❌ するな（0o-3 で作り直した錠の間を 0o-2 の盤面へ戻す）。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { TILE } from '../shared/tiles.js';
import { ITEM_META, SWORD_TIERS } from '../shared/items.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';
import { EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const LAYER = 'darklord_prison';
const ENTRANCE = '0,0';      // 岩牢の口（前室＋竪坑）＝キーも中身も動かさない
const PUZZLE = '0,1';        // 二色の錠の間（新設）
const CELL_OLD = '0,1';      // 封魔の間（移設前）
const CELL = '0,2';          // 封魔の間（移設後）

const SWORD_TIER = 4;        // ルミアの剣（0o-2 (a) で `SWORD_TIERS` に足したティア）
const SWORD_CELL = '8,10';   // 主の間の宝箱（座標は動かさない）
const HEART_CELL = '8,3';    // 錠の間の宝箱（ハートの器＝主の間から移す）
const BOSS_CELL = '4,8';     // X（闘技場と同じ座標）
const ARENA = { layer: 'test_mechanics', stage: '23,1' };

// ── 錠の間の盤面（行リテラル＝目で見て設計する）──────────────────────
// row 0 … 竪坑からの降り口（cols 5-6）。row 1 … 東西の一方通行レーン（幅1）。
// rows 2-6 … 中央の広間（cols 4-7）。西壁に色スイッチ赤 `[`(3,3) と刻み文 `i`(4,3)、
// 東壁に色スイッチ青 `]`(3,8)＝どちらも広間から叩ける（矢でも届く）。
// row 7 … ゲート T（cols 5-6）＝全ボタン ON でだけ開く。rows 8-9 … 南の小部屋と主の間への口。
const PUZZLE_ROWS = [
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

const ENTRY_CELLS = ['0,5', '0,6'];   // 竪坑から降りてくるセル
const EXIT_CELLS = ['9,5', '9,6'];    // 主の間へ降りるセル
const BUTTONS = ['1,1', '1,10'];
const EXPECT = { lExit: 32, lChest: 33, lChestMelee: 37 };

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
if (L.stages[PUZZLE] && L.bossStage === CELL) die('既に3部屋になっている（このスクリプトは1回だけ流す）');
if (L.bossStage !== CELL_OLD) die(`bossStage が ${CELL_OLD} でない: ${L.bossStage}`);
if (Object.keys(L.stages).length !== 2) die(`部屋数が2でない: ${Object.keys(L.stages).join(' ')}`);
const bossStage = L.stages[CELL_OLD];
if (!bossStage?.isBossRoom) die(`${CELL_OLD} が isBossRoom でない`);
if (bossStage.chestContents?.[SWORD_CELL]?.type !== 'heartContainer') {
	die(`主の間の宝箱がハートの器でない＝差し替える前提が崩れている`);
}
const tier = SWORD_TIERS[SWORD_TIER];
if (!tier) die(`SWORD_TIERS[${SWORD_TIER}] が無い（0o-2 (a) を先に入れる）`);
if (!ITEM_META.heartContainer) die('ITEM_META に heartContainer が無い');
// 主の間の幾何は闘技場から写したもの＝1セルも動かさないことを現物で確かめる
const arena = map.layers[ARENA.layer]?.stages?.[ARENA.stage];
if (!arena) die(`闘技場 ${ARENA.layer}/${ARENA.stage} が無い＝幾何の出所を確かめられない`);
const bossRowsBefore = bossStage.tiles.map((r) => r.join(''));
if (bossStage.tiles[4][8] !== TILE.DARK_LORD) die(`主の間の X が ${BOSS_CELL} に居ない`);
// 敵配置表の宣言が新しいキーを指しているか（宣言が古いと配置表の外＝ドリフト扱いになる）
if (!EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === CELL)) {
	die(`EXTRA_ENEMY_ROOMS の ${LAYER} の宣言が ${CELL} を指していない`
		+ '（scripts/lib/enemy-placement.mjs を先に直す＝主の間のキーが動いた）');
}
// 縦の並び（前室 → 錠の間 → 主の間）が歩いて繋がるか
const entrance = L.stages[ENTRANCE];
for (const c of [5, 6]) {
	if (entrance.tiles[9][c] !== TILE.FLOOR) die(`前室の南辺 (9,${c}) が塞がっている`);
	if (PUZZLE_ROWS[0][c] !== TILE.FLOOR) die(`錠の間の北辺 (0,${c}) が塞がっている`);
	if (PUZZLE_ROWS[9][c] !== TILE.FLOOR) die(`錠の間の南辺 (9,${c}) が塞がっている`);
	if (bossStage.tiles[0][c] !== TILE.DOORWAY_BOSS) die(`主の間の北辺 (0,${c}) が扉でない`);
}

// ── パズルを状態空間で測る（設計の証明＝ここが合わなければ書かない）──────
function measurePuzzle() {
	const tiles = rowsToTiles(PUZZLE_ROWS);
	if (tiles.length !== ROWS || tiles.some((r) => r.length !== COLS)) {
		die(`錠の間の盤面が ${ROWS}x${COLS} でない`);
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const build = (opt) => makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false, ...opt });
	const startsOf = (S) => ENTRY_CELLS.map((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return S.encode(r, c, S.initStones, 0, 0, 0);   // color=0＝両門とも閉
	});
	const posOf = (state) => state.split('|')[0];
	const atExit = (s) => EXIT_CELLS.includes(posOf(s));
	const atChest = (s) => posOf(s) === HEART_CELL;
	const escapeTest = (s) => ENTRY_CELLS.includes(posOf(s)) || EXIT_CELLS.includes(posOf(s));
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
	const opt = { guardMax: 6000000, escapeTest };
	const S = build();
	const exitM = measureMetrics(S, startsOf(S), atExit, makeH(EXIT_CELLS[0]), opt);
	const chestM = measureMetrics(S, startsOf(S), atChest, makeH(HEART_CELL), opt);
	const meleeS = build({ noTools: true });   // 弓/ブーメランを持っていない＝隣接で叩くだけ
	const meleeM = measureMetrics(meleeS, startsOf(meleeS), atChest, makeH(HEART_CELL), opt);
	// 必須性：石を押さないと南口にも宝箱にも届かない（＝パズルが飾りでない）
	const NP = build({ noPush: true });
	const seen = new Set(startsOf(NP));
	const q = [...seen];
	for (let i = 0; i < q.length; i++) for (const nx of NP.nextStates(q[i])) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
	return {
		exitM, chestM, meleeM,
		noPushStates: seen.size,
		noPushExit: [...seen].some(atExit),
		noPushChest: [...seen].some(atChest),
	};
}

const M = measurePuzzle();
const bad = [];
const need = (cond, msg) => { if (!cond) bad.push(msg); };
need(M.exitM.L === EXPECT.lExit, `南口までの L が ${EXPECT.lExit} でない: ${M.exitM.L}`);
need(M.chestM.L === EXPECT.lChest, `宝箱までの L が ${EXPECT.lChest} でない: ${M.chestM.L}`);
need(M.meleeM.L === EXPECT.lChestMelee, `剣だけの L が ${EXPECT.lChestMelee} でない: ${M.meleeM.L}`);
need(!M.exitM.greedy && !M.chestM.greedy, '貪欲法で解けてしまう（insight=0＝作業ゲー）');
need(M.exitM.deadlocks === 0 && M.chestM.deadlocks === 0 && M.meleeM.deadlocks === 0,
	`デッドロックがある（石を戻せない＝笛が無いと詰む）: 南口 ${M.exitM.deadlocks} / 宝箱 ${M.chestM.deadlocks} / 剣だけ ${M.meleeM.deadlocks}`);
need(M.exitM.noEscape === 0 && M.chestM.noEscape === 0 && M.meleeM.noEscape === 0,
	`画面外へ戻れない状態がある（ハードロック）: ${M.exitM.noEscape} / ${M.chestM.noEscape} / ${M.meleeM.noEscape}`);
need(!M.noPushExit, '石を押さずに主の間へ行けてしまう（パズルが飾り＝完了条件 (b) が不成立）');
need(!M.noPushChest, '石を押さずに宝箱へ届いてしまう（報酬が飾り）');
if (bad.length) {
	console.error('✗ 錠の間の設計が条件を満たしていない（マップは書き換えていない）:');
	bad.forEach((b) => console.error(`   - ${b}`));
	process.exit(1);
}

// ── ① 錠の間（新設）─────────────────────────────────────────
const puzzle = {
	cols: 12,
	rows: 10,
	tiles: rowsToTiles(PUZZLE_ROWS),
	bgTiles: {},
	links: [],
	enemyDirs: {},
	chestContents: { [HEART_CELL]: { type: 'heartContainer', name: ITEM_META.heartContainer.name } },
	floorItems: {},
	objects: {},
	npcData: {},
	shopData: {},
	mapEnters: {},
	showConditions: {},   // 封印なし＝赤門の奥に置くこと自体が「解いた見返り」
	breakableWalls: {},
	isBossRoom: false,
	signData: {
		'4,3': {
			name: '錠の間の刻み文',
			lines: [
				'【二色の錠の間】',
				'赤と青の 門は 決して 同時には 開かぬ。',
				'されど 錠は 石の 重みを 覚えている。',
				'片方に 石を 据え 色を 移し もう片方に 据えよ。',
			],
		},
	},
	comment: `[${LAYER} ${PUZZLE}] 二色の錠の間＝前室と主の間のあいだに挟んだパズル部屋`
		+ '（0o-2・2026-09-05。ユーザーの再考「もう一部屋増やしてパズルステージを追加したい」）。'
		+ '色スイッチ 赤 `[`(3,3)／青 `]`(3,8) で activeColor を移し、幅1の一方通行レーンに置いた'
		+ '石車 `*`(1,4)/(1,7) を、赤門 `(`(1,3)／青門 `)`(1,8) の奥のボタン `S`(1,1)/(1,10) へ'
		+ '据える。門は排他∴一度に運べる石は1個＝「据える→色を移す→据える」の2段でしか'
		+ '全ボタン ON にならない。全ボタン ON で T (7,5)/(7,6) が開き石が恒久ロックされる'
		+ `（${'`game/conditions.js`'} allButtonsHeldByStones＝足踏みでは ON にならない）。`
		+ `宝箱（${ITEM_META.heartContainer.name}・${HEART_CELL}）は南の小部屋の奥を赤門 `
		+ '`(`(8,4) で仕切った＝T を開けた後にもう一度 色を移す必要がある。'
		+ `実測（${'`scripts/migrate-darklord-prison-puzzle.mjs`'} が毎回測り直す）：`
		+ `南口まで L=${M.exitM.L}／宝箱まで L=${M.chestM.L}（剣だけ L=${M.meleeM.L}）・`
		+ `貪欲では解けない・デッドロック 0・noEscape 0・石を押さないと南口にも宝箱にも届かない。`
		+ '⚠️ レーンを幅1・奥を行き止まりにしているのが「デッドロック 0」の根拠＝'
		+ '石の奥側へ回り込めない∴石はボタンへ向かってしか動かない。広げてはいけない。'
		+ '⚠️ 主の間への南口 (9,5)/(9,6) は色で仕切らない＝閉じ込めが起きない（noEscape 0）。',
};

// ── ② 主の間（キーだけ移し、宝箱の中身と碑文を差し替える）──────────────
const cell = bossStage;
cell.chestContents = { [SWORD_CELL]: { type: 'weapon', swordTier: SWORD_TIER } };
cell.signData = {
	'6,1': {
		name: '封魔の碑',
		lines: [
			'【封魔の間】',
			'八つの 欠片が 揃った 日に この王は 目を 開く。',
			'——王を 岩に 縫い留めた 剣は 王の 傍に 眠る。',
			'抜けるのは 王を 討った 者 だけだ。',
		],
	},
};
cell.comment = `[${LAYER} ${CELL}] 封魔の間＝寄道の主の間。X 魔王を世界で1体だけここに置いた`
	+ '（0o・2026-09-05）。幾何は闘技場 test_mechanics 23,1（bal_dark_lord）と同じ＝内部は'
	+ `全面床・遮蔽ゼロ・X (${BOSS_CELL})・碑 (6,1)。詔（lockstep）の「床のどのセルでも 60 tick`
	+ ' 以内に被弾」はその床で採った実測∴同じ幾何なら移る。isBossRoom:true ∴入室で `:`'
	+ '（北辺 0,5/0,6）が閉じ HP バーが出る＝一対一の一戦になる。'
	+ `宝箱 (${SWORD_CELL}) は killAll 封印∴**この部屋に雑魚を足してはいけない**。`
	+ `⚠️ 0o-2（2026-09-05）で部屋を ${CELL_OLD} → ${CELL} へ移し、報酬を`
	+ `${ITEM_META.heartContainer.name} → ${tier.name}（剣 tier${SWORD_TIER}）に差し替えた。`
	+ '間に「二色の錠の間」(0,1) を挟んだため＝ハートの器はそちらへ移した。'
	+ 'キーが動く影響先は bossStage・scripts/lib/enemy-placement.mjs の EXTRA_ENEMY_ROOMS・'
	+ 'tests/darklord-prison.spec.js の3つ（幾何は1セルも動かしていない）。'
	+ '⚠️ X は星の欠片を落とさない（祭壇より後の寄道＝落とすと総数が 9 になって祭壇が開かない）。';

// ── ③ 前室の刻み文（竪坑の底が錠の間になった）──────────────────────
const sign = entrance.signData?.['2,1'];
if (!sign?.lines) die('前室の刻み文が {name,lines} 形式でない');
sign.lines = [
	'【封魔の岩牢】',
	'星の欠片を 継いだ 者よ。ここは 塔ではない。',
	'塔の主より 古い 王が 岩に 縫い留められている。',
	'竪坑の 底は 二色の 錠の 間。石を 据えねば 王の 扉は 開かぬ。',
];
entrance.comment = (entrance.comment ?? '')
	+ ` ⚠️ 0o-2（2026-09-05）で竪坑の先を「二色の錠の間」(${PUZZLE}) に差し替えた`
	+ `＝主の間は ${CELL} へ移った（前室の幾何と回復薬（大）はそのまま）。`;

// ── 書き込み（部屋の並び順＝降りる順に保つ）────────────────────────
L.stages = { [ENTRANCE]: entrance, [PUZZLE]: puzzle, [CELL]: cell };
L.bossStage = CELL;

const out = JSON.stringify(map, null, 2);
writeFileSync(MAP_PATH, out);

// ── 自己検証（書いた JSON をもう一度読んで測る）──────────────────
const back = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const B = back.layers[LAYER];
ok(Object.keys(B.stages).join(' ') === `${ENTRANCE} ${PUZZLE} ${CELL}`,
	`部屋の並びが降りる順でない: ${Object.keys(B.stages).join(' ')}`);
ok(B.bossStage === CELL, `bossStage が ${CELL} を指していない: ${B.bossStage}`);
const pz = B.stages[PUZZLE];
ok(pz.tiles.map((r) => r.join('')).join('|') === PUZZLE_ROWS.join('|'), '錠の間の盤面が設計と違う');
ok(pz.tiles.every((r) => Array.isArray(r) && r.length === 12), '錠の間の tiles が 12 列の文字配列でない');
ok(Array.isArray(pz.links), '錠の間の links が配列でない（{} は refreshGates を殺す）');
ok(!pz.isBossRoom, '錠の間がボス部屋になっている');
ok(pz.chestContents?.[HEART_CELL]?.type === 'heartContainer', '錠の間にハートの器が無い');
ok(!pz.showConditions?.[HEART_CELL], '錠の間の宝箱に封印が付いている（到達で開く設計）');
ok(pz.signData?.['4,3']?.lines?.length > 0, '錠の間の刻み文が無言看板');
ok(!pz.initActiveColor, '錠の間に初期色が付いている（両門とも閉から始める設計）');
ok(cellsOf(PUZZLE_ROWS, TILE.BUTTON).join(' ') === BUTTONS.join(' '), `錠の間のボタンが ${BUTTONS.join(' ')} でない`);
ok(cellsOf(PUZZLE_ROWS, TILE.STONE).length === 2, '錠の間の石が2個でない');
ok(cellsOf(PUZZLE_ROWS, TILE.GATE).join(' ') === '7,5 7,6', '錠の間の T が (7,5)/(7,6) に無い');
ok(cellsOf(PUZZLE_ROWS, TILE.SWITCH_RED).length === 1 && cellsOf(PUZZLE_ROWS, TILE.SWITCH_BLUE).length === 1,
	'錠の間の色スイッチが赤青1枚ずつでない');
const cb = B.stages[CELL];
ok(cb.isBossRoom === true, '主の間が isBossRoom でない');
ok(cb.tiles.map((r) => r.join('')).join('|') === bossRowsBefore.join('|'), '主の間の幾何が動いた（1セルも動かしてはいけない）');
ok(cb.chestContents?.[SWORD_CELL]?.type === 'weapon' && cb.chestContents[SWORD_CELL].swordTier === SWORD_TIER,
	`主の間の宝箱が ${tier.name}（剣 tier${SWORD_TIER}）でない`);
ok(cb.showConditions?.[SWORD_CELL]?.trigger === 'killAll', '主の間の宝箱が killAll 封印でない');
ok(!Object.values(cb.chestContents).some((c) => c.type === 'heartContainer'), '主の間にハートの器が残っている');
ok(cb.signData?.['6,1']?.lines?.some((l) => l.includes('剣')), '碑文が剣の在処に触れていない');
ok(!cb.signData?.['6,1']?.lines?.some((l) => l.includes('器')), '碑文にハートの器の記述が残っている');
ok(B.stages[ENTRANCE].signData['2,1'].lines.some((l) => l.includes('錠')), '前室の刻み文が錠の間に触れていない');
ok(B.stages[ENTRANCE].mapEnters['1,1']?.id === 'darklordPrison', '前室の出入口が壊れた');
// 世界のハートの器の総数は動かない（主の間 → 錠の間へ移しただけ）
let hearts = 0, swords4 = 0;
for (const [lk, layer] of Object.entries(back.layers)) {
	if (lk.startsWith('test_')) continue;
	for (const st of Object.values(layer.stages ?? {})) {
		for (const c of Object.values(st.chestContents ?? {})) {
			if (c.type === 'heartContainer') hearts += 1;
			if (c.type === 'weapon' && c.swordTier === SWORD_TIER) swords4 += 1;
		}
		for (const c of Object.values(st.floorItems ?? {})) {
			if (c === 'heartContainer' || c?.item === 'heartContainer') hearts += 1;
		}
	}
}
ok(swords4 === 1, `${tier.name} が世界に1本でない: ${swords4}`);
console.log(`   世界のハートの器（宝箱・床置き）＝ ${hearts}`);

if (problems.length) {
	console.error('✗ 自己検証で問題を検出（マップは書き換わっている＝git で戻せる）:');
	problems.forEach((p) => console.error(`   - ${p}`));
	process.exit(1);
}

console.log('✓ 魔王の岩牢を3部屋にした');
console.log(`   ${LAYER}/${ENTRANCE} 岩牢の口     … 回復薬（大）（封印なし）／刻み文を錠の間に合わせた`);
console.log(`   ${LAYER}/${PUZZLE} 二色の錠の間 … 石2個・ボタン2個・色門2枚・T 2枚`
	+ `＋ ${ITEM_META.heartContainer.name}（${HEART_CELL}・赤門の奥）`);
console.log(`   ${LAYER}/${CELL} 封魔の間     … X ×1（${BOSS_CELL}）`
	+ `＋ ${tier.name}（${SWORD_CELL}・killAll 封印）`);
console.log(`   実測 … 南口まで L=${M.exitM.L}／宝箱まで L=${M.chestM.L}（剣だけ L=${M.meleeM.L}）`
	+ `・貪欲 ${M.exitM.greedy ? 'YES' : 'NO'}・デッドロック ${M.chestM.deadlocks}`
	+ `・noEscape ${M.chestM.noEscape}・石を押さないと届かない（状態 ${M.noPushStates}）`);
