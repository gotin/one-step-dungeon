#!/usr/bin/env node
/**
 * generate-sokoban-playable.mjs — PLAN 実行キュー4.6「お試しパズル3枚（易/中/難）」の
 * 盤面を **実プレイ形のまま** 生成・測定する。
 *
 * generate-sokoban-tiers.mjs（測定用）との決定的な違い：
 *   ・宝 B を「開けた床」ではなく **ゲート T の奥に隔離した実プレイ形** で測る。
 *     測定用の盤面をあとから T で隔離すると L が激減する（前セッション実測＝易 L25→L8）＝
 *     実プレイ化の後に測り直さないと難易度の数字が嘘になる。∴最初から実プレイ形で測る。
 *   ・ゴール判定＝「石ロックが立った（＝全ボタンに石が乗った）」かつ「宝セルに到達」。
 *     実ゲームの 4.56 ロック（全ボタンに石→恒久ロック・以後石は押せない・T は開いたまま）は
 *     blade-solver.mjs が状態の locked ビットで再現している。
 *
 * 幾何の不変条件（実エンジンの抜け道を潰すために必須）：
 *   ・ボタンは**プレイヤーも踏める**（モーメンタリ）。ロック条件は「石で全ボタン」に
 *     絞ったので恒久開放はされないが、**足踏みで開いた瞬間に隣のゲートへ1歩入る**と
 *     すり抜けられる∴ボタンとゲートの歩行距離を 2 以上空ける（下の assert）。
 *   ・宝はゲートの奥だけからアクセスできる（ゲートを塞げば到達不能）＝非空虚性。
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/generate-sokoban-playable.mjs           # 3帯すべて
 *   node scripts/generate-sokoban-playable.mjs 難        # 指定帯だけ
 *   MAX_MEASURE=6 node scripts/generate-sokoban-playable.mjs 易
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    実プレイ化＝scripts/migrate-test-sokoban-tiers.mjs。
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 帯ごとの盤面テンプレ ──────────────────────────────────────────────────────
//   '#' 壁 / '.' 床 / 'S' ボタン（石の目標） / 'T' ゲート / 'B' 宝 / '@' プレイヤー入口
//   '[' 色スイッチ赤 / ']' 色スイッチ青 / '(' 色ゲート赤 / ')' 色ゲート青（合成帯だけ）
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
//   難易度の主役は「壁の幾何」＝くびれ・回り込みの余地・デッドロック角（§3-2c）。
const TIERS = [
	{
		// 易：1幅回廊の「はしご型ループ」＋東の行き止まり枝。
		//   ・開けた部屋は不採用（実測＝開けた部屋は必ず貪欲で解ける＝作業ゲー）。
		//     難易度は壁の幾何が作る（§3-2c）＝くびれ・曲がれる交点・退避ポケット。
		//   ・石は1幅回廊では直進しかできず、曲がれるのは縦横が交わる c1/c6 の交点だけ。
		//     角（3,1）(3,6)(7,1)(7,6) などに入れた石は永久デッドロック（外に出て戻ると
		//     石はリセットされる＝game.js enterStage の仕様なので理不尽ではない）。
		//   ・row1 は隣ステージへの連絡通路。(4,2) を壁にして「石を上の通路へ押し出す」
		//     抜け道を封じている（石を north に押すには (4,2) に立つ必要があるため）。
		name: '易', pick: 'min', guardMax: 3000000,
		template: [
			'############',
			'@...........',
			'##.#########',
			'#.....S.####',
			'#.#...#.####',
			'#S......TB##',
			'#.#...#.####',
			'#...S...####',
			'############',
			'############',
		],
	},
	{
		// 中：易と同じピラー部屋を横に伸ばし、宝を南東の別口に移した版。
		// 部屋が広い＝石の退避先が増えるが、運ぶ距離とすれ違いの回数が増える。
		// pick:'mid' ＝ 軸②クリア候補の L 中庸を採る。
		name: '中', pick: 'mid', guardMax: 4000000,
		template: [
			'############',
			'@...........',
			'##.#########',
			'#........###',
			'#.#..#..####',
			'#S......S###',
			'#.#..#..####',
			'#...S....TB#',
			'############',
			'############',
		],
	},
	{
		// 難：最大サイズのピラー部屋＋宝を完全隔離した南の小部屋（8,6→8,7）。
		// ピラーが3列＝1幅の通路が増え、石を置ける「詰み角」も増える。
		// pick:'max' ＝ 軸②クリア候補のうち最も深い（L 最大）盤面を採る。
		name: '難', pick: 'max', guardMax: 6000000,
		template: [
			'############',
			'@...........',
			'##.#########',
			'#.........##',
			'#.#..#..#.##',
			'#S.......S##',
			'#.#..#..#.##',
			'#...S..#..##',
			'######TB####',
			'############',
		],
	},
	{
		// 激難：石4個（§3-2c の上限）＋ピラーを千鳥に配した格子部屋。
		//   ・難（石3）より一段上げる主役は **石数** ＝相互干渉の方向が3→4に増える。
		//     L を伸ばすだけでは「長いだけ」になる（歩きが増えるだけで思考は増えない）。
		//   ・ボタンは部屋の4隅寄り＝運ぶレーンが必ず交差する（他の石が通り道を塞ぐ）。
		//   ・ピラーは row4 が偶数列・row6 が奇数列の**千鳥**＝縦レーンが行ごとにずれ、
		//     「まっすぐ運べる石」が存在しない。
		//   ・宝室は南の袋（8,6）でゲート(8,5)の奥＝(7,6) を壁にして上からの侵入を封じている。
		//   ・石を row1 の連絡通路へ押し出す抜け道は (4,2) のピラーが塞ぐ
		//     （(3,2) の石を north に押すには (4,2) に立つ必要がある）。
		// 部屋の広さは難と同じ（rows3-7・cols1-9）＝**壁の幾何を据え置いて石だけ +1** した対照。
		// 比較のために部屋を1列ずつ縮めた版（cols1-8）も測った＝L の上限が 69 で止まった
		// （狭いと運ぶ距離が足りない）∴難と同じ広さを採る。
		name: '激難', pick: 'maxThin', guardMax: 9000000, candCap: 700,
		template: [
			'############',
			'@...........',
			'##.#########',
			'#S.......S##',
			'#.#.#.#.#.##',
			'#.........##',
			'#..#.#.#..##',
			'#S....#..S##',
			'#####TB#####',
			'############',
		],
	},
	{
		// ⚠️⚠️ この帯（合成）は 2026-08-02 に**撤回**した。この帯を再生成しても解は出ない。
		//   理由：下に書いた「石を色ゲート越しに渡す」手順（①②③）は**実エンジンのバグ**に
		//   依存していた＝押し成功時プレイヤーは通行判定なしで石の元セルへ入る＝閉じた門の
		//   中に立てる（B1）。修正後の規則は「押した後に入る石の元セルの下地が閉じていたら
		//   押せない」∴**エアロックで石は渡せない**（24,0 は解なし＝
		//   tests/sokoban-tiers.spec.js の回帰フィクスチャ）。
		//   ⚠️ 石を**開いた**門へ押し込むのは正当（廊下C3 = field 15,14 がその設計）＝
		//   一度入れた「閉じ直せる門へは開いていても押し込めない」という禁止は撤回した。
		//   ＝色ゲートは「石の搬送路」ではなく「**プレイヤーの通路**」に使うのが正しい設計
		//   （赤にしないと石Aの押し位置へ行けない／青にしないと石Bの押し位置へ行けない
		//    ＝排他を順序制約にする）。再設計は PLAN 実行キューに積んである。
		//   ⚠️ 下の「並列だと赤が飾りで L=70」という実測もバグ入りエンジンでの値∴再利用不可。
		//   残す価値があるのは「単調な関門（潮 `=`／弓 `Y`）では難しくならない」という判断だけ。
		//
		// 合成：石3＋**色スイッチ/色ゲート**（PUZZLE-DESIGN §1-4「Blade 固有の追加軸＝道具の混在」）。
		//
		// なぜ第2ギミックが色ゲートなのか（設計時に潮ゲート `=`／弓 `Y` を捨てた理由）：
		//   潮ゲートと弓ゲートは「開くと通れる場所が増えるだけ」＝**単調**。最適プレイは
		//   「最初に開けて以後放置」＝手数が数手伸びるだけで思考は増えない（＝激難で学んだ
		//   「長いだけ」と同じ罠）。色スイッチは**その色にセット**＝赤を開けると青が閉じる
		//   **排他＝非単調**。∴石の搬送路そのものが「今どちらの色か」に依存し、順序制約
		//   （§6.1）と新種のデッドロックが生まれる。
		//
		// 幾何：col5 の仕切りで部屋を東西に分け、通れる穴は row4 の1レーンだけ。そこに
		//   **色ゲートを直列2枚**（(4,5) 赤 `(` → (4,6) 青 `)`）並べた「エアロック」にする。
		//   ⚠️ 穴を2箇所（上=赤・下=青）に分ける案を先に測ったら **赤を壁で塞いでも L=70 のまま**
		//      ＝最短解は青の穴しか使わず赤が飾りだった。穴が並列だとプレイヤーは片方だけで
		//      済ませられる∴**直列にして両方を通らせる**のが「合成」の作り方。
		//   直列だと石1個を渡すのに**必ず赤と青の両方**を使う（実エンジンの規則から導出）：
		//     ① 赤 … (4,3) に立ち (4,4) の石を (4,5) へ押す（押し先が赤ゲート＝赤でないと入らない）
		//     ② 青 … (4,4) に立ち石を (4,6) へ押す（石が乗っている (4,5) が閉じているのは無関係＝
		//             押し判定は**行き先セルだけ**を見る。実エンジン player.js:434 も同じ）
		//     ③ 色不問 … (4,5) に立ち石を (4,7) へ押し出す
		//   ②の後にプレイヤーが (4,5)＝閉じた赤ゲートの上に立てるのは、押し成功時に
		//   player.js:447 が `player.x/y` を石の元セルへ**通行判定なしで**移す実装だから
		//   （ソルバーの押し遷移も同じく行き先だけを見る＝乖離なし）。この上に居ても普通の
		//   移動で降りられるので詰まない。
		//   ＝排他（非単調）が「どちらの色を今開けるか」の順序制約として必ず効く。
		//   色スイッチは各部屋に赤青1組ずつ置く（切替を安くして、難しさを「歩く距離」では
		//   なく「順序」に寄せる）。ボタンは西1（7,1）・東2（3,10 / 7,10）。
		//   エアロックは west→east の一方通行（(4,7) の石を西へ押すには壁 (4,8) に立つ必要がある）
		//   ∴渡す順番を間違えると戻せない＝新種のデッドロック（軸③）。
		//   初期 activeColor は未設定＝**両方閉**∴最初の一手が「どちらの色を開けるか」。
		//
		// ハードロックを作らない仕掛け（重要）：連絡通路への口を西 (2,2)・東 (2,8) の2つ開け、
		//   その真下 (4,2)/(4,8) をピラーで塞ぐ。
		//   ・プレイヤーはどちらの部屋からも通路へ出られる＝色ゲートが両方閉でも詰まない
		//     （出て戻れば未解決の石はリセットされる＝game.js enterStage）。
		//   ・石は通路へ押し出せない（(3,2) の石を north に押すには (4,2) に立つ必要がある）
		//     ∴石の東西移動は色ゲート経由に限られる＝プレイヤーの自由歩行と両立する。
		//   ・ロック成立＝全ボタンに石＝**穴の上に石は残らない**（石数＝ボタン数）∴
		//     「解けたのに宝へ行けない」は原理的に起きない。
		name: '合成', pick: 'maxThin', guardMax: 9000000, candCap: 500, maxMeasure: 8,
		// 石の島（色ゲートを閉じたときの連結成分）で石数とボタン数が食い違う配置だけを採る
		// ＝色ゲートを1度も通らずに解ける盤面を弾く（＝ギミックを飾りにしない）。
		forceCross: true,
		// 石は部屋（row3 以降）にだけ置く＝連絡通路 row1 に石を置く候補を弾く
		// （通路の石は隣ステージへの継ぎ目を塞ぐ）。既存4帯は生成済み＝再現性のため無効のまま。
		noStonesAbove: 3,
		template: [
			'############',
			'@...........',
			'##.#####.###',
			'#[...#....S#',
			'#.#..().#..#',
			'#]...#]...[#',
			'#.#..#..#..#',
			'#S#..#....S#',
			'##BT########',
			'############',
		],
	},
];

// 色タイル（テンプレに書ける Blade 固有ギミック）。色ゲートは pull-BFS では
// **楽観的に床として扱う**（下の analyze で floors に入れる）：
//   ・壁として扱うと色ゲートを渡る候補が1つも出ない（＝ギミックが飾りになる）。
//   ・楽観視の代償は「逆再生がそのまま押しの解になる」保証が弱まること＝実測 L=null で
//     落ちるだけ（4軸フル測定が最終判定∴嘘の難易度は出ない）。
const COLOR_SWITCHES = new Set([TILE.SWITCH_RED, TILE.SWITCH_BLUE]);
const COLOR_GATES = new Set([TILE.GATE_RED, TILE.GATE_BLUE]);

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const MAX_MEASURE = Number(process.env.MAX_MEASURE ?? 10);

function analyze(template) {
	const grid = template.map((row) => row.split(''));
	if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
		throw new Error(`テンプレは ${ROWS}x${COLS} 必要`);
	const buttons = [], gates = [], walls = new Set(), floors = new Set();
	const colorGates = new Set(), colorSwitches = new Set();
	let chest = null, entry = null;
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (ch === '#') { walls.add(key(r, c)); continue; }
		if (ch === 'T') { gates.push(key(r, c)); continue; }   // ゲートは石の置き場でない
		floors.add(key(r, c));
		if (COLOR_GATES.has(ch)) colorGates.add(key(r, c));       // 楽観的に床（上のコメント）
		if (COLOR_SWITCHES.has(ch)) colorSwitches.add(key(r, c));
		if (ch === 'S') buttons.push(key(r, c));
		if (ch === 'B') chest = key(r, c);
		if (ch === '@') entry = key(r, c);
	}
	if (!chest) throw new Error('テンプレに宝 B が無い');
	if (!entry) throw new Error('テンプレに入口 @ が無い');
	if (!gates.length) throw new Error('テンプレにゲート T が無い');
	// 石数レンジは 3〜4（§3-2c ユーザー確定）。1〜2 は回り込み制約が発生せず倉庫番として
	// 本質的に難しくならない／5以上は現段階では考えない（測定コストも指数的に増える）。
	if (buttons.length < 3 || buttons.length > 4)
		throw new Error(`ボタンは3〜4個（今 ${buttons.length}）`);
	// 色タイルは「スイッチとゲートが両方ある」か「両方ない」かのどちらかでないと成立しない
	// （ゲートだけ＝開けられない永久壁／スイッチだけ＝押しても何も起きない飾り）。
	if ((colorGates.size > 0) !== (colorSwitches.size > 0))
		throw new Error('色スイッチと色ゲートは両方必要（片方だけは飾り）');
	return { buttons, gates, walls, floors, chest, entry, colorGates, colorSwitches, grid };
}

/** 床集合 pass の中を start から歩いた到達集合。 */
function walkSet(start, pass) {
	const seen = new Set([start]), q = [start];
	for (let h = 0; h < q.length; h++) {
		const [r, c] = parse(q[h]);
		for (const [dr, dc] of DIRS) {
			const nk = key(r + dr, c + dc);
			if (seen.has(nk) || !pass(nk)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

/**
 * 幾何の不変条件：
 *   ① 宝はゲートを閉じたままでは到達不能（＝ゲートが本当に関門）。
 *   ② どのボタンからもゲートセルまでの歩行距離が 2 以上（足踏みで開いた瞬間に
 *      1歩でゲートへ入る「すり抜け」を封じる）。石も入口も無視した素の床で測る。
 *   ③ 石を連絡通路（row0-2）へ押し出せない（通路の石は隣ステージへの継ぎ目を塞ぐ）。
 *   ④ 色ギミックがある帯だけ：色ゲートが関門として効いていて、かつ詰ませないこと。
 */
function assertGeometry(t) {
	const passable = (k) => t.floors.has(k);            // ゲート T は通行不可として扱う
	// ① ゲート閉のまま入口から BFS して宝に届かないこと
	const seen = walkSet(t.entry, passable);
	if (seen.has(t.chest)) throw new Error('ゲートを開けずに宝へ届く＝関門が飾り');
	for (const b of t.buttons) if (!seen.has(b)) throw new Error(`ボタン ${b} が入口側から到達不能`);
	// ② ボタン→ゲート の歩行距離 ≥ 2
	for (const b of t.buttons) {
		for (const g of t.gates) {
			const [br, bc] = parse(b), [gr, gc] = parse(g);
			if (Math.abs(br - gr) + Math.abs(bc - gc) <= 1)
				throw new Error(`ボタン ${b} がゲート ${g} と隣接＝足踏みで1歩すり抜けできる`);
		}
	}
	// ③ 石が連絡通路へ出られないこと。押しは「プレイヤー P → 石 S → 行き先 G」が一直線∴
	//    通路セル G の隣に部屋の床 S があり、その反対側 P=2S-G が床なら押し出せてしまう。
	for (const g of t.floors) {
		const [gr, gc] = parse(g);
		if (gr > 2) continue;                                   // 通路＝row0-2
		for (const [dr, dc] of DIRS) {
			const sr = gr + dr, sc = gc + dc;
			if (sr <= 2 || !t.floors.has(key(sr, sc))) continue;  // S は部屋の床
			if (t.floors.has(key(sr + dr, sc + dc)))
				throw new Error(`石を通路 ${g} へ押し出せる（石 ${sr},${sc} の背後 ${sr + dr},${sc + dc} が床）`);
		}
	}
	if (!t.colorGates.size) return;
	// ④-a 色ゲートを閉じると、部屋（row3 以降＝石が入れる範囲）のボタンが2つ以上の
	//     連結成分に分かれること＝**石を渡すには色ゲートを開けるしかない**（＝飾りでない）。
	//     ⚠️ プレイヤーは通路を回れる∴この検査は「石の搬送路」の話。プレイヤーの歩行は ④-b。
	const roomPass = (k) => t.floors.has(k) && !t.colorGates.has(k) && parse(k)[0] >= 3;
	const comps = [];
	for (const b of t.buttons) {
		if (comps.some((s) => s.has(b))) continue;
		comps.push(walkSet(b, roomPass));
	}
	if (comps.length < 2)
		throw new Error('色ゲートを閉じてもボタンが1つの部屋に繋がる＝色ゲートが石の関門になっていない');
	// ④-b 色ゲートを両方閉じたままでも、入口から色ゲート以外の全床へ歩けること。
	//     ＝どちらの部屋からも連絡通路へ出られる（出入りで石はリセット＝詰みからの復帰路）し、
	//       どの色スイッチにも辿り着ける（＝初手で色を選べる）。ハードロック不可の保証。
	//     ゲート T は開いた状態で見る（T の奥＝宝室は解けた後にしか入れない＝閉じ込めの元にならない）。
	const noColor = (k) => (t.floors.has(k) || t.gates.includes(k)) && !t.colorGates.has(k);
	const free = walkSet(t.entry, noColor);
	for (const f of t.floors) {
		if (t.colorGates.has(f) || free.has(f)) continue;
		throw new Error(`色ゲートを閉じると ${f} から出られない＝ハードロックの恐れ`);
	}
}

/**
 * 色ゲートを閉じたときに石が動ける「島」のラベル（部屋＝row3 以降・色ゲートは通れない）。
 * プレイヤーは連絡通路を回れるので島に分かれないが、**石は通路へ出せない**（assertGeometry ③）
 * ∴石にとっては島＝色ゲートだけが橋。
 */
function roomComponents(t) {
	const roomPass = (k) => t.floors.has(k) && !t.colorGates.has(k) && parse(k)[0] >= 3;
	const label = new Map();
	let n = 0;
	for (const k of t.floors) {
		if (!roomPass(k) || label.has(k)) continue;
		for (const cell of walkSet(k, roomPass)) label.set(cell, n);
		n++;
	}
	return label;
}

/**
 * 初期配置が「色ゲートを1度も通らずに解ける」形でないか。
 * 島ごとに（石の数 == ボタンの数）が全島で成立してしまう配置は、石を島の中だけで
 * 配れる＝**色ゲートを開けずに解ける可能性がある＝ギミックが飾り**（実測で発覚：
 * 西1石/西1ボタン・東2石/東2ボタンの配置が L=58 で下限クリアしていた）。
 * ∴どこかの島で数が食い違う配置だけを採る＝石の島越え（＝色ゲート通過）が必須になる。
 */
function forcesCrossing(label, buttons, stones) {
	const count = (cells) => {
		const m = new Map();
		for (const c of cells) m.set(label.get(c), (m.get(label.get(c)) ?? 0) + 1);
		return m;
	};
	const bc = count(buttons), sc = count(stones);
	for (const k of new Set([...bc.keys(), ...sc.keys()]))
		if ((bc.get(k) ?? 0) !== (sc.get(k) ?? 0)) return true;
	return false;
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から「引き」で初期配置候補を作る ────────
function pullBFS({ buttons, floors, chest }) {
	const isFloor = (r, c) => floors.has(key(r, c)) && key(r, c) !== chest;
	const goalStones = [...buttons].sort();
	const encode = (stones, p) => `${stones.join(';')}|${p}`;
	const stoneSet0 = new Set(goalStones);
	const start = [];
	for (const b of goalStones) for (const [dr, dc] of DIRS) {
		const [br, bc] = parse(b);
		const pr = br + dr, pc = bc + dc;
		if (isFloor(pr, pc) && !stoneSet0.has(key(pr, pc))) start.push(encode(goalStones, key(pr, pc)));
	}
	const dist = new Map();
	const q = [];
	for (const s of new Set(start)) { dist.set(s, 0); q.push(s); }
	let head = 0;
	while (head < q.length) {
		const st = q[head++];
		const [stonesStr, pStr] = st.split('|');
		const stones = stonesStr.split(';');
		const stoneSet = new Set(stones);
		const [pr, pc] = parse(pStr);
		const d = dist.get(st);
		for (const [dr, dc] of DIRS) {   // プレイヤーだけ動く（引かない＝距離据え置き）
			const nr = pr + dr, nc = pc + dc;
			if (!isFloor(nr, nc) || stoneSet.has(key(nr, nc))) continue;
			const ns = encode(stones, key(nr, nc));
			if (!dist.has(ns)) { dist.set(ns, d); q.push(ns); }
		}
		for (const [dr, dc] of DIRS) {   // 引く（＝押しの逆・距離+1）
			const sr = pr - dr, sc = pc - dc;
			if (!stoneSet.has(key(sr, sc))) continue;
			const nr = pr + dr, nc = pc + dc;
			if (!isFloor(nr, nc) || stoneSet.has(key(nr, nc))) continue;
			const ns2 = stones.filter((s) => s !== key(sr, sc));
			ns2.push(key(pr, pc));
			ns2.sort();
			const ns = encode(ns2, key(nr, nc));
			if (!dist.has(ns)) { dist.set(ns, d + 1); q.push(ns); }
		}
	}
	// 「石配置＋引き終わりのプレイヤー位置」を候補として返す。
	// ⚠️ プレイヤー位置を捨てて石配置だけにすると **引きでは解けるが押しでは解けない**
	//    配置（trap A）が大量に混じる：引きの最終プレイヤー位置に入口から歩いて行けない
	//    なら、引き手順を逆再生できない＝押しの解が存在する保証が消える。
	//    位置を保持して「入口から歩いて到達できる」ものだけ採れば、逆再生がそのまま
	//    押しの解になる＝**測定前に可解性が保証される**（実測：これで解なし候補が消えた）。
	const out = [];
	for (const [st, d] of dist) {
		const [stonesStr, pStr] = st.split('|');
		const stones = stonesStr.split(';');
		if (stones.some((s) => buttons.includes(s))) continue;   // 初期から一部解けている配置は除外
		out.push({ stones, player: pStr, pulls: d });
	}
	if (process.env.PULL_DEBUG) {
		console.log(`  [pull] 引き到達状態 ${dist.size} → ボタン非占有 ${out.length} 件`);
	}
	return out.sort((a, b) => a.pulls - b.pulls);
}

/** 初期配置で入口から目標セルへ歩いて行けるか（閉じたゲートは通れない＝floors に無い）。 */
function walkReachable(t, stones, target) {
	const blocked = new Set(stones);
	if (!t.floors.has(target) || blocked.has(target)) return false;
	const seen = new Set([t.entry]), q = [t.entry];
	for (let i = 0; i < q.length; i++) {
		if (q[i] === target) return true;
		const [r, c] = parse(q[i]);
		for (const [dr, dc] of DIRS) {
			const nk = key(r + dr, c + dc);
			if (seen.has(nk) || !t.floors.has(nk) || blocked.has(nk)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen.has(target);
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
function buildTiles(t, stonePlacement, wallOff = new Set()) {
	const stoneSet = new Set(stonePlacement);
	const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const k = key(r, c);
		if (t.walls.has(k) || wallOff.has(k)) tiles[r][c] = TILE.WALL;   // wallOff＝必須性の検査用
		else if (t.gates.includes(k)) tiles[r][c] = TILE.GATE;
		else if (t.chest === k) tiles[r][c] = 'B';
		else if (t.buttons.includes(k)) tiles[r][c] = TILE.BUTTON;
		// 色タイルはテンプレの文字をそのまま残す（'.' で塗り潰すとギミックが消える）。
		// 石より先に見る＝色セルに石を置く候補は下で弾いているので競合しない。
		else if (t.colorGates.has(k) || t.colorSwitches.has(k)) tiles[r][c] = t.grid[r][c];
		else if (stoneSet.has(k)) tiles[r][c] = TILE.STONE;
	}
	return { tiles, bg };
}

/**
 * 軸②の貪欲モデル（石パズル専用・押し単位のマクロ貪欲）。
 *
 * 1手単位のヒルクライムだと「石の裏へ回り込む歩行」が必ず評価値を悪化させる∴
 * どんな倉庫番でも詰まり、軸②が常に insight>0 に見えて空虚（実プレイ形で最初に踏んだ罠）。
 * ∴人間の素朴戦略に合わせて次のモデルで測る：
 *   ・歩行は自由（コスト0）。石配置が変わらない範囲を BFS で全部回れるとみなす。
 *   ・押しは「石ポテンシャル（石↔ボタンの最小コスト割り当て＝全順列で厳密）」を
 *     **厳密に減らす**ものだけ許す。
 *   ・全石が乗ってロックされた後、歩いて宝に届けば貪欲成功。
 * 単一の経路を辿るのではなく、単調減少の押しだけで到達できる範囲を**全部探索**する
 * （＝同値の押しをどの順で選ぶかに結果が左右されない）。∴insight>0 の意味は
 * 「どう選んでも、途中で必ず“ボタンから遠ざける押し”を1回は入れないと解けない」。
 */
function makeGreedyPush(t) {
	const bpos = t.buttons.map(parse);
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	const perms = (xs) => xs.length <= 1 ? [xs]
		: xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
	const BPERM = perms(bpos.map((_, i) => i));
	// 石ポテンシャル＝石とボタンの最小コスト1対1割り当て（3個なので全順列で厳密に）
	const potential = (stones) => {
		const sp = stones.map(parse);
		let best = Infinity;
		for (const p of BPERM) {
			let sum = 0;
			for (let i = 0; i < sp.length; i++) sum += man(sp[i], bpos[p[i]]);
			best = Math.min(best, sum);
		}
		return best;
	};
	const stonesOf = (state) => { const f = state.split('|')[1]; return f ? f.split(';') : []; };

	const macroKey = (state) => state.split('|').slice(0, 2).join('|');   // プレイヤー位置＋石配置
	return (S, starts, goalTest) => {
		const q = [...starts];
		const seen = new Set(q.map(macroKey));
		for (let i = 0; i < q.length; i++) {
			const cur = q[i];
			const curStones = stonesOf(cur).join(';');
			const p0 = potential(stonesOf(cur));
			// 歩行（石配置が変わらない遷移）で到達できる範囲を全部見る
			const walk = new Set([cur]), wq = [cur];
			for (let j = 0; j < wq.length; j++) {
				if (goalTest(wq[j])) return true;
				for (const nx of S.nextStates(wq[j])) {
					if (stonesOf(nx).join(';') === curStones) {
						if (!walk.has(nx)) { walk.add(nx); wq.push(nx); }
						continue;
					}
					// 押し：ポテンシャルを厳密に減らすものだけ貪欲は選べる
					if (potential(stonesOf(nx)) >= p0) continue;
					const k = macroKey(nx);
					if (!seen.has(k)) { seen.add(k); q.push(nx); }
				}
			}
		}
		return false;
	};
}

/** 盤面をソルバー問題（S・開始状態・ゴール判定）に組み立てる。 */
function buildProblem(t, stonePlacement, wallOff) {
	const { tiles, bg } = buildTiles(t, stonePlacement, wallOff);
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false });
	const start = S.encode(...parse(t.entry), S.initStones, 0, 0, 0);
	// ゴール＝ロック済み（全ボタンに石が乗った）かつ宝セルに立った
	const goalTest = (state) => {
		const f = state.split('|');
		return f[0] === t.chest && f[5] === '1';
	};
	return { S, start, goalTest };
}

function measurePlacement(t, stonePlacement, guardMax, wallOff) {
	const { S, start, goalTest } = buildProblem(t, stonePlacement, wallOff);
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	const bpos = t.buttons.map(parse);
	const [gr, gc] = parse(t.chest);
	// 貪欲法のヒューリスティック（軸②）は**段階を分ける**のが要点。
	// 「プレイヤー→宝」の距離を石運びの段階でも足すと、石を押すには石の裏へ回り込む＝
	// 宝から遠ざかる手が必須になり、どんな盤面でも貪欲が即詰まって insight>0 に見える
	// （＝軸②が空虚になる／実プレイ形で最初に踏んだ罠）。∴石が全部乗るまでは
	// 「石→最寄りボタン」と「プレイヤー→未設置の石」だけを見て、ロック後に宝へ向かう。
	const h = (state) => {
		const f = state.split('|');
		const [pr, pc] = parse(f[0]);
		if (f[5] === '1') return man([pr, pc], [gr, gc]);      // ロック後＝宝に近づくだけ
		const stones = f[1] ? f[1].split(';') : [];
		let sum = 0, near = Infinity;
		for (const s of stones) {
			const sp = parse(s);
			sum += Math.min(...bpos.map((b) => man(sp, b)));
			if (!t.buttons.includes(s)) near = Math.min(near, man([pr, pc], sp));
		}
		// 石を目標へ近づける手を最優先（×8）、同点なら未設置の石へ歩く手を選ぶ。
		return sum * 8 + (near === Infinity ? 0 : near);
	};
	return measureMetrics(S, [start], goalTest, h, { guardMax, greedyFn: makeGreedyPush(t) });
}

/**
 * 帯の選び方は「引き距離」ではなく **実測 L** で決める。
 * 引き距離は押しの手数と相関が弱い（歩きが支配的）＝引き距離順に採ると帯の意味が出ない。
 * ∴ 軸②クリア候補を等間隔にサンプルして全部測り、L の min/中庸/max を帯として採る。
 */
function pickByL(list, pick) {
	if (!list.length) return null;
	const sorted = [...list].sort((a, b) => a.m.L - b.m.L);
	if (pick === 'min') return sorted[0];
	if (pick === 'max') return sorted[sorted.length - 1];
	// 'maxThin' ＝「最も深い帯（最大 L の 95% 以上）の中で、最短解が最も細いもの」。
	// 最深帯の最上位だけを採ると解が太い盤面（＝最短解が何十本もある＝どう運んでも
	// 同じ手数で解ける）を掴むことがある。L を数手諦めて解の細さ（軸④）を取る方が
	// 「一本道を見つける快感」が強い＝人が感じる難しさに効く。
	if (pick === 'maxThin') {
		const maxL = sorted[sorted.length - 1].m.L;
		const deep = sorted.filter((x) => x.m.L >= maxL * 0.95);
		const num = (v) => (typeof v === 'number' ? v : Infinity);   // '≥1e9' 表記の保険
		return deep.sort((a, b) => num(a.m.solCount) - num(b.m.solCount) || b.m.L - a.m.L)[0];
	}
	return sorted[Math.floor(sorted.length / 2)];
}

// ── 実行 ────────────────────────────────────────────────────────────────────
const only = process.argv.slice(2)[0];
const tiers = only ? TIERS.filter((t) => t.name === only) : TIERS;

for (const tier of tiers) {
	const t = analyze(tier.template);
	assertGeometry(t);
	console.log(`\n════ ${tier.name}帯（pick=${tier.pick}）════`);
	tier.template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
	console.log(`  ボタン ${t.buttons.join(' / ')}  ゲート ${t.gates.join(' / ')}  宝 ${t.chest}  入口 ${t.entry}`);

	// 可解性が保証された候補だけに絞る（同じ石配置は最小引き距離の1件に代表させる）。
	const roomLabel = t.colorGates.size ? roomComponents(t) : new Map();
	const seenStones = new Set();
	const cands = [];
	for (const c of pullBFS(t)) {
		if (c.stones.includes(t.entry)) continue;
		// 色セルに石を置く初期配置は弾く（タイルが1文字＝石とギミックは同居できない）。
		if (c.stones.some((s) => t.colorGates.has(s) || t.colorSwitches.has(s))) continue;
		// 通路に石を置く初期配置を弾く（帯オプション・既存4帯は再現性のため無効のまま）。
		if (tier.noStonesAbove && c.stones.some((s) => parse(s)[0] < tier.noStonesAbove)) continue;
		// 色ゲートを通らずに解ける配置を弾く（＝ギミックが飾りになる）。
		if (tier.forceCross && !forcesCrossing(roomLabel, t.buttons, c.stones)) continue;
		const sk = c.stones.join(';');
		if (seenStones.has(sk)) continue;
		if (!walkReachable(t, c.stones, c.player)) continue;   // 逆再生できない＝押しの解が保証されない
		seenStones.add(sk);
		cands.push(c);
	}
	console.log(`  石${t.buttons.length}配置候補: ${cands.length} 通り（引き距離 ${cands[0]?.pulls}〜${cands[cands.length - 1]?.pulls}）`);

	// 石4になると配置候補が桁で増える（C(床,4)）＝全候補に貪欲篩をかけると現実的な
	// 時間で終わらない∴引き距離順に**等間隔サンプル**して上限まで絞る（帯の偏りを避ける）。
	const candCap = Number(process.env.CAND_CAP ?? tier.candCap ?? Infinity);
	let pool = cands;
	if (cands.length > candCap) {
		const st = cands.length / candCap;
		pool = Array.from({ length: candCap }, (_, i) => cands[Math.floor(i * st)]);
		console.log(`  ⚠️ 候補を ${cands.length} → ${pool.length} に等間隔サンプル（CAND_CAP=${candCap}）`
			+ `＝この帯の探索は全候補ではない（見落としの可能性を明示）`);
	}

	// 篩：貪欲（マクロ押し）判定は状態空間 BFS が不要で安い∴先に候補を貪欲で篩い、
	// 「貪欲では解けない（軸②を満たす）」候補だけ 4軸フル測定に回す。
	const greedyFn = makeGreedyPush(t);
	const insight = [];
	for (const cand of pool) {
		const p = buildProblem(t, cand.stones);
		if (!greedyFn(p.S, [p.start], p.goalTest)) insight.push(cand);
	}
	console.log(`  貪欲で解ける（軸②未達）${pool.length - insight.length} 件 / 軸②クリア ${insight.length} 件`);

	// 軸②クリア候補を等間隔サンプル → 4軸フル測定
	// 色ギミック帯は状態が3倍（activeColor 3値）＝1件のフル測定が重い∴帯側で件数を絞れる。
	const maxMeasure = Number(process.env.MAX_MEASURE ?? tier.maxMeasure ?? MAX_MEASURE);
	const step = Math.max(1, Math.floor(insight.length / maxMeasure));
	const sample = insight.filter((_, i) => i % step === 0).slice(0, maxMeasure);
	const passed = [];
	let tooBig = 0;
	for (const cand of sample) {
		let m;
		try { m = measurePlacement(t, cand.stones, tier.guardMax); }
		catch (e) { tooBig++; continue; }
		const v = verdict(m);
		console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount} states=${m.states} ${v.label}`);
		if (v.pass) passed.push({ cand, m });
	}
	console.log(`  フル測定 ${sample.length} 件（状態超過スキップ ${tooBig} 件）→ 下限クリア ${passed.length} 件`
		+ (passed.length ? `（L 範囲 ${Math.min(...passed.map((p) => p.m.L))}〜${Math.max(...passed.map((p) => p.m.L))}）` : ''));
	const picked = pickByL(passed, tier.pick);
	if (!picked) { console.log(`  ✗ ${tier.name}帯：下限クリア盤面が見つからず（テンプレ調整）`); continue; }

	const { cand, m } = picked;
	console.log(`  ✅ 採用 石 ${cand.stones.join(' ')}（引き${cand.pulls}）→ L=${m.L} 貪欲NG deadlock=${m.deadlocks} 強制手率=${m.forcedRatio} 最短解本数=${m.solCount} 状態=${m.states}`);
	// 色ゲートの必須性：穴を1つずつ壁で塞いで測り直す。
	//   L=null（解なし）＝その穴は解に必ず要る／L が出る＝その穴だけでも解ける。
	//   両方 null なら「どちらの色でも解けるが色ゲート自体は必須」＝排他が効いている。
	for (const g of t.colorGates) {
		let lab;
		try {
			const mm = measurePlacement(t, cand.stones, tier.guardMax, new Set([g]));
			lab = mm.L === null ? '解なし＝この穴は必須' : `L=${mm.L}（この穴を塞いでも解ける）`;
		} catch { lab = '状態超過で測定不能'; }
		console.log(`  ── 色ゲート ${g} を塞ぐと: ${lab}`);
	}

	const { tiles } = buildTiles(t, cand.stones);
	console.log('  ── 採用盤面 ──');
	tiles.forEach((row, r) => console.log('    ', String(r).padStart(2), row.join('')));
	console.log(`  ── migrate 用 ── STONES=${cand.stones.join(' ')}  ENTRY=${t.entry}`);
}
