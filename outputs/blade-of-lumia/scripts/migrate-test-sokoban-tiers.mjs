#!/usr/bin/env node
/**
 * migrate-test-sokoban-tiers.mjs — PLAN 実行キュー4.6「お試しパズル（易/中/難/激難）」の4枚＋
 * 回帰フィクスチャ1枚（24,0）を
 * ライブマップ（work/blade-of-lumia.json）の `test_mechanics` レイヤーへ書き込む。
 *
 * 盤面は scripts/generate-sokoban-playable.mjs が
 *   ・逆算(pull-BFS)＋「引き終わりの位置に入口から歩ける」制約で **可解性を保証** し、
 *   ・4軸（PUZZLE-DESIGN §2）でフル測定して下限クリアを確認し、
 *   ・帯（易/中/難）は **実測 L** の min / 中庸 / max で選び、
 *   ・激難は石4個で「最深帯（最大 L の95%以上）の中で最短解が最も細いもの」を選ぶ
 * ものをそのまま貼る（このスクリプト内の EXPECT が測定値の記録＝再測定で検証できる）。
 *
 * ⚠️ 24,0 は元々 Phase 5-1「合成（石＋色ゲート）」のパズルだったが、その解（L=91）は
 *    **実エンジンのバグ**（押し成功時にプレイヤーが通行判定なしで石の元セルへ入る＝閉じた門の
 *    中に立てる）に依存していた＝2026-08-02 に撤回。バグを直した今は解なしで、
 *    「押した後に入る石の元セルの下地が閉じていたら押せない」ことの回帰フィクスチャとして
 *    残している（fixture:true）。石を**開いた**門へ押し込むのは正当（廊下C3 がその設計）＝
 *    エアロックが成立しないのは「石を渡した後、閉じた赤ゲートの中に立てないと次を押せない」ため。
 *
 * 自己検証（書き込み前に必ず実行・1つでも落ちたら書かない）：
 *   ① タイルが 10x12 の**文字配列**であること（join した行文字列だとゲームが落ちる）
 *   ② ゲートを閉じたままでは宝に到達できない（＝報酬が飾りでない）
 *   ③ ボタンとゲートの距離が 2 以上（足踏みでゲートが開いた瞬間に1歩で抜ける穴を封じる）
 *   ④ ソルバーで再測定し、EXPECT（L / 貪欲 / デッドロック / 強制手率）と一致すること
 *      （fixture は L=null＝解なしであることを検査する＝解けたらバグの再発）
 *   ⑤ 全枚が横に繋がっている（20,0 ⇄ … ⇄ 24,0 の row1 連絡通路）＝詰んだら隣へ出て
 *      戻れば石がリセットされる（game.js enterStage の未解決リセット）＝理不尽を回避
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/migrate-test-sokoban-tiers.mjs --dry     # 検証だけ（書き込まない）
 *   node scripts/migrate-test-sokoban-tiers.mjs           # 検証して書き込む
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

const MAP_PATH = path.resolve('work/blade-of-lumia.json');
const LAYER = 'test_mechanics';

// ── 貼る3枚（generate-sokoban-playable.mjs の採用盤面そのまま） ─────────────────
const BOARDS = [
	{
		key: '20,0', name: 'sokoban_easy',
		label: '石パズル 易（Phase 4.6 方法論検証）',
		// 4x?のピラー部屋。ボタン 3,6 / 5,1 / 7,4、ゲート 5,8、宝 5,9
		tiles: [
			'############',
			'............',
			'##.#########',
			'#.....S.####',
			'#*#...#.####',
			'#S....*.TB##',
			'#.#...#.####',
			'#...S*..####',
			'############',
			'############',
		],
		entry: '1,0',
		// noEscape＝画面外へ戻れない状態の数（I3）。⚠️ 0 ではない＝連絡通路への口の真下 (3,2) に
		// 石を押し込むと画面内では出られない（石は row0-2 へ押せない）。出荷済み∴値を固定して
		// 退行検出だけ行う（詳細は下の remeasure のコメント）。
		EXPECT: { L: 33, greedy: false, deadlocks: 31158, forcedRatio: 0.06, solCount: 1, states: 37505, noEscape: 385 },
		chest: { type: 'rupee', value: 30, name: 'ルピー×30' },
	},
	{
		key: '21,0', name: 'sokoban_medium',
		label: '石パズル 中（Phase 4.6 方法論検証）',
		// 横長ピラー部屋。ボタン 5,1 / 5,8 / 7,4、ゲート 7,9、宝 7,10
		tiles: [
			'############',
			'............',
			'##.#########',
			'#........###',
			'#.#..#..####',
			'#S...*..S###',
			'#*#*.#..####',
			'#...S....TB#',
			'############',
			'############',
		],
		entry: '1,0',
		EXPECT: { L: 40, greedy: false, deadlocks: 165442, forcedRatio: 0.12, solCount: 6, states: 204550, noEscape: 4604 },
		chest: { type: 'rupee', value: 50, name: 'ルピー×50' },
	},
	{
		key: '22,0', name: 'sokoban_hard',
		label: '石パズル 難（Phase 4.6 方法論検証）',
		// 最大ピラー部屋＋南の隔離宝室。ボタン 5,1 / 5,9 / 7,4、ゲート 8,6、宝 8,7
		tiles: [
			'############',
			'............',
			'##.#########',
			'#.........##',
			'#.#..#..#.##',
			'#S.....**S##',
			'#.#*.#..#.##',
			'#...S..#..##',
			'######TB####',
			'############',
		],
		entry: '1,0',
		EXPECT: { L: 56, greedy: false, deadlocks: 1590600, forcedRatio: 0.07, solCount: 22, states: 1917870, noEscape: 21252 },
		// 報酬はルピーで統一する。ハートの器（heartContainer）は「配置総数＝最大ハート数」
		// という設計予算そのものなので、検証用ステージに置くと本編の予算を汚す。
		chest: { type: 'rupee', value: 100, name: 'ルピー×100' },
	},
	{
		key: '23,0', name: 'sokoban_extreme',
		label: '石パズル 激難（Phase 4.6 方法論検証・石4個）',
		// 難と同じ広さの部屋（rows3-7 / cols1-9）に **石4個**＋千鳥ピラー。
		// ボタン 3,1 / 3,9 / 7,1 / 7,9（4隅寄り＝運ぶレーンが必ず交差する）、ゲート 8,5、宝 8,6。
		// 難より一段上げる主役は石数（干渉の方向が3→4）＝L を伸ばすだけでは歩きが増えるだけ。
		tiles: [
			'############',
			'............',
			'##.#########',
			'#S.*.....S##',
			'#.#.#.#*#.##',
			'#.........##',
			'#..#*#.#*.##',
			'#S....#..S##',
			'#####TB#####',
			'############',
		],
		entry: '1,0',
		// noEscape=103249（全到達状態の約4.4%）＝激難は「石で口を塞いで出られなくなる」余地が
		// 一番広い。ユーザー判定済み・出荷済み∴値の固定だけ行う（新盤面は requireEscape で 0 を要求）。
		EXPECT: { L: 89, greedy: false, deadlocks: 1852062, forcedRatio: 0.13, solCount: 2, states: 2348945, noEscape: 103249 },
		chest: { type: 'rupee', value: 200, name: 'ルピー×200' },
	},
	{
		key: '25,0', name: 'sokoban_gate_push_regression',
		label: '回帰フィクスチャ：色ゲートは石も通さない・石が乗ったゲートを閉じる切替は不発',
		// ⚠️ 2026-08-04（PLAN 4.7・ユーザー指摘で規則そのものを直した）＝旧規則（押した後
		// プレイヤーが入る石の元セルの下地が閉じていたら押せない）は曲がり角を強制する幾何制約
		// （旧 I1/I1'）が窮屈すぎた。代わりに規則を直した：
		//   ・色ゲートは閉じている間、石にもプレイヤーと同じ「壁」を適用する（passableFor が
		//     両方に同じ color 判定を課す＝単一の通行規則）。開いたゲートに石が乗ったまま
		//     反対色へ切り替える操作は**不発**にする（player.js setActiveColor・
		//     blade-solver.mjs colorSwitchBlocked）。不発時は switchDenied 音を鳴らす。
		//   ・色スイッチは石を通さない（プレイヤーは踏めるが石は押し込めない）。
		// これで旧 I1/I1' が丸ごと不要になった＝幾何は自由。
		// ⚠️ 旧盤面（直列2枚の色ゲート「エアロック」で石を渡す設計）は撤回済み（2026-08-02）＝
		// 実エンジンのバグの上に成立していた。今の盤面は 23,0（激難）の壁構造の一部を土台に、
		// 赤ゲート1枚(4,5)だけのパズル（石3・可解）へ作り直した＝**fixture ではなく通常の
		// 可解パズルとして扱う**（fixture:true を撤廃）。青スイッチ(5,10)はパズル本体には
		// 無関係＝「石が乗った開いた赤ゲートを閉じようとすると不発」を実機で直接踏める配置。
		// ⚠️ noEscape=12132（右側の部屋で石2個を通路(3,7)/(3,9)へ連続で押し込むと、連絡通路
		// への唯一の口(2,8)への道が完全に塞がり、青のまま赤スイッチへ戻れなくなる）＝
		// **正常な倉庫番の詰み**（既存4帯にもある性質・バグではない）。ユーザー指摘で
		// 「画面外に歩いて出られること」自体は目的でないと判明＝笛の resetStones 効果
		// （game.js playFlute・2026-08-04 新規追加）で詰みから回復できれば十分∴
		// requireEscape は外す（I3 の「歩いて出られる」判定をこの盤面には適用しない）。
		tiles: [
			'############',
			'............',
			'##.#####.###',
			'#[...#....S#',
			'#.#.*(..#*.#',
			'#....#....]#',
			'#.#.*#..#..#',
			'#S#..#....S#',
			'##BT########',
			'############',
		],
		entry: '1,0',
		// 実測（entry '1,0' 基準・remeasure と同じ測定条件）。
		EXPECT: { L: 76, greedy: false, deadlocks: 2330720, forcedRatio: 0.05, solCount: 12, states: 4071706, noEscape: 12132 },
		chest: { type: 'rupee', value: 300, name: 'ルピー×300' },
	},
];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const fail = (msg) => { throw new Error(msg); };

/** 盤面文字列を解析（壁・床・ボタン・ゲート・宝・石）。 */
function analyze(b) {
	const grid = b.tiles.map((row) => row.split(''));
	if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
		fail(`${b.name}: 盤面は ${ROWS}x${COLS} でなければならない`);
	const buttons = [], gates = [], stones = [], floors = new Set();
	const colorGates = new Set(), colorSwitches = new Set();
	let chest = null;
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (ch === TILE.WALL) continue;
		if (ch === TILE.GATE) { gates.push(key(r, c)); continue; }
		floors.add(key(r, c));                    // 石は押せば動く＝床として数える
		if (ch === TILE.BUTTON) buttons.push(key(r, c));
		if (ch === TILE.STONE) stones.push(key(r, c));
		if (ch === 'B') chest = key(r, c);
		// 色ゲート '('/')' は「開けば通れる」＝床として数える（閉のままでは通れないことは
		// remeasure のソルバーが activeColor で判定する）。色スイッチ '['/']' は踏める。
		if (ch === TILE.GATE_RED || ch === TILE.GATE_BLUE) colorGates.add(key(r, c));
		if (ch === TILE.SWITCH_RED || ch === TILE.SWITCH_BLUE) colorSwitches.add(key(r, c));
	}
	if (!chest) fail(`${b.name}: 宝 B が無い`);
	if (!gates.length) fail(`${b.name}: ゲート T が無い`);
	// 石数レンジは 3〜4（§3-2c）。ボタンと石は必ず同数（片方が余ると解けない／余る）。
	if (buttons.length < 3 || buttons.length > 4) fail(`${b.name}: ボタンは3〜4個（今 ${buttons.length}）`);
	if (stones.length !== buttons.length)
		fail(`${b.name}: 石とボタンの数が違う（石 ${stones.length} / ボタン ${buttons.length}）`);
	// 色スイッチと色ゲートは両方あるか両方ないか（ゲートだけ＝開けられない壁／
	// スイッチだけ＝押しても何も起きない飾り）。
	if ((colorGates.size > 0) !== (colorSwitches.size > 0))
		fail(`${b.name}: 色スイッチと色ゲートは両方必要（片方だけは飾り）`);
	return { grid, buttons, gates, stones, floors, chest, colorGates, colorSwitches };
}

/** 床集合 pass の中を start から歩いた到達集合。 */
function walkSet(start, pass) {
	const seen = new Set([start]), q = [start];
	for (let i = 0; i < q.length; i++) {
		const [r, c] = parse(q[i]);
		for (const [dr, dc] of DIRS) {
			const nk = key(r + dr, c + dc);
			if (seen.has(nk) || !pass(nk)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

/** ② 非空虚性：ゲート閉のまま入口から歩いて宝に届かないこと／③ ボタン↔ゲート距離≥2。 */
function assertGeometry(b, a) {
	if (!a.floors.has(b.entry)) fail(`${b.name}: 入口 ${b.entry} が床でない`);
	const seen = walkSet(b.entry, (k) => a.floors.has(k));
	if (seen.has(a.chest)) fail(`${b.name}: ゲートを開けずに宝へ届く＝関門が飾り`);
	for (const bt of a.buttons) if (!seen.has(bt)) fail(`${b.name}: ボタン ${bt} が入口側から到達不能`);
	for (const bt of a.buttons) for (const g of a.gates) {
		const [br, bc] = parse(bt), [gr, gc] = parse(g);
		if (Math.abs(br - gr) + Math.abs(bc - gc) <= 1)
			fail(`${b.name}: ボタン ${bt} がゲート ${g} と隣接＝足踏みで1歩すり抜けできる`);
	}
}

/**
 * 色ギミック盤面だけの不変条件（generate-sokoban-playable.mjs の assertGeometry と同じ規則）。
 *   ⑥ 石を連絡通路（row0-2）へ押し出せない（通路の石は隣ステージへの継ぎ目を塞ぐ）＝I5。
 *
 * ⚠️ 2026-08-02（PLAN 4.7・§3-2e）＝旧 ⑦（色ゲート閉で石の島の数合わせ＝forceCross）と
 *    旧 ⑧（色ゲート閉でも全床へ歩ける）を削除した。
 *    ・⑦：新設計は「石は門を渡らない・門を跨ぐのはプレイヤーだけ」＝静的な島の数合わせは
 *      意味を持たない。両色が必須であることは I4（色ゲート1枚壁化で解なし）が動的に担う。
 *    ・⑧：門を閉じても全床へ歩けるなら門は飾り＝パズルの条件として自己矛盾（§3-2d の訂正）。
 *      ハードロック回避は I3（noEscape=0・状態空間で測る＝下の remeasure/requireEscape）が担う。
 * ⚠️ 2026-08-04（ユーザー指摘）＝旧 I1/I1'（色ゲート/色スイッチへの押し込み直線を幾何で
 *    禁止）も削除した。曲がり角の強制が窮屈すぎたため、代わりに実エンジン／ソルバー側の
 *    通行規則を直した：色ゲートは閉じている間、石にもプレイヤーと同じ壁を適用し、石が
 *    乗ったまま反対色へ切り替える操作は不発にする（player.js setActiveColor）。色スイッチは
 *    石を通さない（player.js stoneDestOk・enemy-ai.js tryEnemyPushStone）。∴幾何の形は自由。
 */
function assertColorGeometry(b, a) {
	if (!a.colorGates.size) return;
	// ⑥ 押しは「プレイヤー P → 石 S → 行き先 G」が一直線∴通路セル G の隣に部屋の床 S が
	//    あり、その反対側 P=2S-G も床なら押し出せてしまう。
	for (const g of a.floors) {
		const [gr, gc] = parse(g);
		if (gr > 2) continue;
		for (const [dr, dc] of DIRS) {
			const sr = gr + dr, sc = gc + dc;
			if (sr <= 2 || !a.floors.has(key(sr, sc))) continue;
			if (a.floors.has(key(sr + dr, sc + dc)))
				fail(`${b.name}: 石を通路 ${g} へ押し出せる（石 ${sr},${sc} の背後が床）`);
		}
	}
}

/** ④ 4軸の再測定（generate 側と同じゴール判定・同じ貪欲モデル）。 */
function remeasure(b, a) {
	const tiles = a.grid.map((row) => row.map((ch) => (ch === 'B' ? 'B' : ch)));
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false });
	const start = S.encode(...parse(b.entry), S.initStones, 0, 0, 0);
	const goalTest = (state) => {
		const f = state.split('|');
		return f[0] === a.chest && f[5] === '1';
	};
	const man = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
	const bpos = a.buttons.map(parse);
	const perms = (xs) => xs.length <= 1 ? [xs]
		: xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
	const BPERM = perms(bpos.map((_, i) => i));
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
	const macroKey = (state) => state.split('|').slice(0, 2).join('|');
	// 軸②＝押し単位のマクロ貪欲（歩行は自由・ポテンシャルを厳密に減らす押しだけ許す）
	const greedyFn = (SS, starts, goal) => {
		const q = [...starts], seen = new Set(q.map(macroKey));
		for (let i = 0; i < q.length; i++) {
			const cur = q[i], curStones = stonesOf(cur).join(';'), p0 = potential(stonesOf(cur));
			const walk = new Set([cur]), wq = [cur];
			for (let j = 0; j < wq.length; j++) {
				if (goal(wq[j])) return true;
				for (const nx of SS.nextStates(wq[j])) {
					if (stonesOf(nx).join(';') === curStones) {
						if (!walk.has(nx)) { walk.add(nx); wq.push(nx); }
						continue;
					}
					if (potential(stonesOf(nx)) >= p0) continue;
					const k = macroKey(nx);
					if (!seen.has(k)) { seen.add(k); q.push(nx); }
				}
			}
		}
		return false;
	};
	const h = () => 0;   // 軸②は greedyFn が担う（既定のヒルクライムは使わない）
	// I3（ハードロック検査・PUZZLE-DESIGN §3-2e）＝プレイヤーが画面外セル（リングの床）に
	// 立てている状態。ここから逆に塗って「戻れない状態」を数える（noEscape）。
	// ⚠️ 歩行だけの静的検査（旧 I2）では石による閉じ込めを見逃す∴状態空間で測る。
	const exits = new Set(S.exitCells);
	const escapeTest = (state) => exits.has(state.split('|')[0]);
	// 石4は状態が桁で増える（激難＝235万）∴上限を generate 側と揃えて 900万にする。
	return measureMetrics(S, [start], goalTest, h, { guardMax: 9000000, greedyFn, escapeTest });
}

// ── 実行 ────────────────────────────────────────────────────────────────────
const dry = process.argv.includes('--dry');
const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const stages = map.layers?.[LAYER]?.stages ?? fail(`${LAYER} レイヤーが無い`);

const built = [];
for (const b of BOARDS) {
	const a = analyze(b);
	assertGeometry(b, a);
	assertColorGeometry(b, a);
	const m = remeasure(b, a);
	const v = verdict(m);
	console.log(`── ${b.name} (${b.key}) ──`);
	console.log(`   L=${m.L} 貪欲=${m.greedy} デッドロック=${m.deadlocks} 強制手率=${m.forcedRatio} `
		+ `最短解本数=${m.solCount} 状態=${m.states} 脱出不能=${m.noEscape} ${v.label}`);
	// I3（PUZZLE-DESIGN §3-2e）：どの到達状態からも画面外へ戻れること。
	// ⚠️ 2026-08-02 の実測で判明＝**既存の帯4枚（20,0〜23,0）は満たしていない**（易=385 件ほか）。
	//    形＝連絡通路への口の真下（例 20,0 の (3,2)）に石を押し込むと、その石は row0-2 へ
	//    押せない（検査③）∴プレイヤーは画面内に閉じ込められる。**画面内では回復不能**。
	//    ゲーム全体では回復できる（セーブ→ロードで `stonePositions` は破棄される＝§1-1）が、
	//    体験としては悪い。既存4枚は出荷済み＋ユーザー判定済み∴ここでは値を EXPECT で
	//    固定して**退行を検出**するだけにし、0 を要求するのは `requireEscape` を立てた盤面だけ。
	if (b.requireEscape && m.noEscape) fail(`${b.name}: 画面外へ戻れない状態が ${m.noEscape} 件ある`
		+ '（ハードロック＝倉庫番の「やり直せる詰み」ではない）＝PUZZLE-DESIGN §3-2e の I3 違反');
	// フィクスチャは「解けないこと」が仕様＝§2 の下限（パズルとしての合格）は当てない。
	// 逆に解けてしまったら「閉じた門の中に立って石を押せる」バグの再発なので落とす。
	if (b.fixture) {
		if (m.L !== null) fail(`${b.name}: 回帰フィクスチャなのに解けている`
			+ `（L=${m.L}）＝閉じた門越しに石とプレイヤーを渡せる`
			+ '＝player.js の「石の元セルの下地」判定の抜け');
	} else if (!v.pass) fail(`${b.name}: §2 下限を満たさない`);
	for (const [k, want] of Object.entries(b.EXPECT)) {
		const got = m[k];
		if (String(got) !== String(want)) fail(`${b.name}: ${k} が記録と不一致（記録 ${want} / 実測 ${got}）`);
	}
	built.push({ b, a });
}

// ⑤ 横に繋がっているか（row1 の連絡通路：右端と左端が床）。
// ⚠️ BOARDS に載っていない座標（例＝再設計中の 24,0）は**このスクリプトの管轄外**＝隣接して
//    いないペアを繋がり検査すると「検査したつもり」になる∴x が +1 のペアだけ検査し、
//    飛んでいるペアは黙って通さずログに出す（欠番の画面は別途ライブマップ側で繋がっている）。
let checked = 0;
for (let i = 0; i + 1 < built.length; i++) {
	const [ax, ay] = parse(built[i].b.key), [bx, by] = parse(built[i + 1].b.key);
	if (ay !== by || bx !== ax + 1) {
		console.log(`… ${built[i].b.key} → ${built[i + 1].b.key} は隣接していない`
			+ '∴連絡通路の検査を飛ばした（間の座標は BOARDS 管轄外）');
		continue;
	}
	const east = built[i].a.grid[1][COLS - 1], west = built[i + 1].a.grid[1][0];
	if (east === TILE.WALL || west === TILE.WALL)
		fail(`${built[i].b.name} → ${built[i + 1].b.name} の連絡通路が塞がっている`
			+ '（詰んだとき隣へ出て石をリセットできない）');
	checked++;
}
console.log(`✅ 連絡通路 OK（隣接ペア ${checked} 組を検査：${built.map((x) => x.b.key).join(' / ')}`
	+ '：隣へ出て戻れば未解決の石はリセットされる）');

if (dry) { console.log('\n--dry ∴ 書き込みなし'); process.exit(0); }

for (const { b, a } of built) {
	stages[b.key] = {
		comment: b.fixture
			? `[${b.name}] ${b.label}: 石${a.stones.length}／色ゲート ${[...a.colorGates].join('/')}。`
				+ '解なし（状態=' + b.EXPECT.states + '）＝閉じた門の中に立って石を押せない仕様の回帰用。'
				+ 'パズルとしては未成立（旧 L=91 はエンジンのバグ依存だった）'
			: `[${b.name}] ${b.label}: 石${a.stones.length} → 全ボタン ON で ${a.gates.join('/')} が開き宝 ${a.chest}。`
				+ `4軸実測 L=${b.EXPECT.L} 貪欲NG デッドロック=${b.EXPECT.deadlocks} 強制手率=${b.EXPECT.forcedRatio}`,
		tiles: a.grid.map((row) => [...row]),      // ⚠️ 文字配列（行文字列にするとゲームが落ちる）
		// links は空配列（オブジェクト {} にすると読み手が落ちる）。
		// このステージのゲートは「全ボタン ON → そのステージの全 T が開く」規則が担うので
		// switchId→gateId の紐付けは不要。
		links: [],
		showConditions: {},
		chestContents: { [a.chest]: b.chest },
		// 色ギミック盤面だけ、笛で石をリセットできるようにする（2026-08-04・PLAN 4.7）＝
		// 画面外への唯一の口を石で完全に塞いで詰んだときの救済。全ボタン充足済みなら不発
		// （game.js playFlute の resetStones が防御する）。
		...(a.colorGates.size ? { fluteEffect: { type: 'resetStones' } } : {}),
		rows: ROWS,
		cols: COLS,
	};
	console.log(`書き込み: ${LAYER}/${b.key} ← ${b.name}`);
}

// 既存ファイルの体裁（スペース2・末尾改行なし）に合わせる＝差分を追加分だけに留める。
fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log(`✅ ${MAP_PATH} を更新した`);
