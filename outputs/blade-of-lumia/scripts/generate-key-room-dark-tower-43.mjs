#!/usr/bin/env node
/**
 * generate-key-room-dark-tower-43.mjs — dark_tower の鍵部屋 [4,3] を
 * 「合成型（D）＝石3＋色ゲート」にするための盤面を逆算生成・測定する
 * （PLAN 実行キュー 5.5i・PUZZLE-DESIGN §7-3 D / §7-4 #10）。
 *
 * この部屋は10鍵の最後＝**体験の頂点**。倉庫番（C）に色スイッチ `[`/`]`＋色ゲート
 * `(`/`)` という**非単調な関門**を重ねる。難しさの質が C と違う（L の絶対値ではなく
 * 「今どちらの色か」で行ける場所が変わること）∴ L は §7-3 C の関門上限 **L ≤ 60** に抑える。
 *
 * 部屋の位相（PUZZLE-DESIGN §7-2 #10・実データで再確認した）：
 *   ・入口＝北 (0,5)(0,6)（`4,2` から歩いて降りてくる。ワープではない）
 *   ・もう一方の出口＝南の鍵扉 `DD`(9,5)(9,6) → `4,4`（そこの階段で玉座 `5,0` へ）
 *     ⚠️ ステージキーは "x,y"（列,行）＝[4,3] の南は [4,4]。"行,列" と読み違えると
 *        「扉の先が存在しない」と誤診する。
 *   ・東西の外周は全壁＝入口と鍵扉の2辺しかない **終端相当**∴部屋を丸ごとパズルに使える。
 *   ・鍵 `K` は (7,6) 据え置き（§7-2 の表と一致させる）。入場時の道具＝全部（弓を持っている
 *     ＝**矢は色スイッチを遠くから叩ける**・壁と未破壊 '!' 以外は貫通する）。
 *
 * 詰み救済は三段（§7-6 手順7）。この部屋は最終ダンジョン＝**笛を必ず持っている**：
 *   (a) 北の入口へ戻って隣室へ出る＝enterStage が未解決の石を初期位置へ戻す
 *   (b) `fluteEffect:{type:'resetStones'}`＝その場で石を初期位置へ戻す。
 *       game.js playFlute は `ss.activeColor = null` も一緒に戻す∴**色の詰みにも効く**
 *   (c) 生成時の実測 `noEscape === 0`＝到達し得る全状態から入口セルへ戻れる
 *   さらに (d) 静的な帰納法で「北の玄関ホールへ石は1個も入れない」を保証する（下記②）。
 *
 * 部屋固有の不変条件（assertGeometry が検査する。違反は**全部まとめて**投げる）：
 *   ① 外周：北 (0,5)(0,6) が入口の床・南 (9,5)(9,6) が鍵扉 'D'・他は全壁。
 *   ② 安全地帯（玄関ホール＝row1 と階段口）へ**石が1個も入れない**（帰納法）：
 *      初期配置を置かない＋「前室のセル X・全方向 d で、押し元 X-d が前室の外なら
 *      押し手 X-2d が壁」⇒ 外から入る押しが存在しない。
 *   ③ 安全地帯は連結で、本体との口が2つ以上（1つだと口の手前に石が座った瞬間に脱出不能）。
 *   ④ 鍵扉の手前 (8,5)(8,6) が床／鍵は (7,6)。
 *   ⑤ **色ゲートは「近道」であって唯一路ではない**＝ゲートを全部壁にしても、入口から
 *      ゲート以外の全ての床へ歩ける。∴色の選択が一方通行の賭けにならない（色スイッチも
 *      両方ゲート抜きで到達できる）＝色による恒久詰みが幾何のレベルで起こり得ない。
 *      ⚠️ 必須性（I4）はこの不変条件と両立する：石が迂回路を塞いだ局面ではゲートしか
 *      残らない＝必須性は**石との相互作用から生まれる**（4.7 の 26,0 と同じ）∴静的な
 *      「唯一路」ではなく動的に測る（下記 I4）。
 *   ⑥ 各ボタンに石を押し込める向きが1つ以上ある（無いと解なし）。
 *   ⑦ 石ゼロのとき、ゲート抜きで入口から鍵・全ボタン・扉の手前へ歩ける／孤立床が無い。
 *   ⑧ 解けた状態（石が全ボタン上＝以後ロックで不動）でも、ゲート抜きで鍵と扉の手前へ歩ける。
 *   ⑨ tiles 層に見た目だけの地面タイルを混ぜない／敵を置かない／ゲート 'T' も宝箱 'B' も無い
 *      （敵は enemy-ai.js tryEnemyPushStone で石を押す＝測定した倉庫番が別物になる）。
 *
 * 測定（§7-3 D＝C の基準＋合成型の追加検査）：
 *   ・4軸下限（L≥6・貪欲NG・deadlock>0・強制手率≤0.7）＋ **L ≤ 60**（関門の上限）
 *   ・I3：`noEscape === 0`
 *   ・I4（色ゲートの必須性・**動的に測る**）：ゲートを1枚ずつ
 *       - '#'（壁）に差し替え ⇒ **解なし**（そのゲートが無いと解けない）
 *       - '.'（常時開通）に差し替え ⇒ 解ける・L は下がる（難しさの出所がゲートだと言い切る）
 *   ・I5（4.7 の硬い制約＝**色ゲートは石の搬送路にしない／プレイヤーの通路にする**・動的）：
 *     「石をゲートのセルへ置く遷移」を禁止して測り直しても **L が同じ**＝最短解は石を
 *     ゲートに通していない。⚠️ 幾何で「石をゲートに押し込めない」を禁止する手も考えたが、
 *     ゲートの前後2セルを全部壁にする必要があり盤面が痩せる∴禁止ではなく**測る**。
 *     （石がゲートに乗った局面自体は残る＝実エンジンの `colorSwitchBlocked`＝閉じる側の
 *      ゲートに石が乗っていると切替が**不発**になる規則も含めて noEscape で安全を測る）
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    書き込みは scripts/migrate-key-room-dark-tower-43.mjs。
 *
 * 使い方（outputs/blade-of-lumia/ で実行）:
 *   node scripts/generate-key-room-dark-tower-43.mjs               # 全テンプレ
 *   node scripts/generate-key-room-dark-tower-43.mjs v1            # 指定テンプレだけ
 *   GEOM_ONLY=1 node scripts/generate-key-room-dark-tower-43.mjs   # 幾何 assert だけ（設計反復用）
 *   MAX_MEASURE=20 CAND_CAP=2000 node scripts/generate-key-room-dark-tower-43.mjs
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ────────────────────────────────────────────────────────────
//   '#' 壁 / '.' 床 / 'S' ボタン（石の目標）/ 'K' 鍵（(7,6) 固定）
//   'D' 鍵扉（測定では鍵未所持＝壁）/ ',' 安全地帯（玄関ホール）の床＝書き込み時は '.'
//   '(' 色ゲート赤 / ')' 色ゲート青 / '[' 色スイッチ赤 / ']' 色スイッチ青
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
export const TEMPLATES = [
	{
		// v1「玄関ホールと二本の梁」：
		//   ・row1 が玄関ホール（安全地帯）＝石が絶対に入れない。階段口は (2,2)/(2,9) の2つ
		//     ＝どちらも真下 (4,2)/(4,9) が壁なので石を押し上げられない（帰納法②）。
		//   ・本体は row3（上の梁）と row7（下の梁）＋ col1/col10 の縦通路で外周ループ、
		//     その内側に row5 の1マス幅の背骨（(5,3)〜(5,7)）が走る。
		//   ・色ゲートは背骨の両端 (5,2)赤 /(5,8)青 ＝ループから背骨への**近道**。
		//     迂回路は上の梁 (3,3)→(4,3) と 下の梁 (7,7)→(6,7) 等＝石で塞がり得る。
		//   ・色スイッチは row5 の両端 (5,1)赤 /(5,10)青。row5 は壁で切れていない∴
		//     背骨に居れば**矢でどちらの色にも切り替えられる**（弓は入場時に所持）。
		//     縦の射線は col1 が赤・col10 が青だけ＝場所によって選べる色が変わる。
		//   ・ボタンは (4,5) 中央上のポケット・(7,3) 南西・(7,9) 南東＝搬送路が背骨で交差する。
		name: 'v1',
		template: [
			'#####,,#####',
			'#,,,,,,,,,,#',
			'##,######,##',
			'#..........#',
			'#.#.#S#.##.#',
			'#[(.....).]#',
			'#.#.#.#.#..#',
			'#..S..K..S.#',
			'#.#.#..#.#.#',
			'#####DD#####',
		],
	},
];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const GEOM_ONLY = !!process.env.GEOM_ONLY;
const GUARD_MAX = Number(process.env.GUARD_MAX ?? 12000000);
const PULL_CAP = Number(process.env.PULL_CAP ?? 4000000);
const MAX_MEASURE = Number(process.env.MAX_MEASURE ?? 12);

// L の帯：上限は §7-3 D＝C と同じ関門の上限 60。下限は「合成型が頂点」＝深い側だけ見る。
const L_MIN = Number(process.env.L_MIN ?? 40);
const L_MAX = Number(process.env.L_MAX ?? 60);

// §3-2c（ユーザー確定）＝石は3〜4個。合成型は色の層が乗る∴石は3（§7-4 #10）。
const STONE_COUNT = 3;

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);
// 敵タイル（この部屋には置かない＝敵が石を押す）。
const ENEMY_RE = /[WECFVXZALNJOUGI]/;

// 部屋の固定物（§7-2 #10 の表と一致させる）
export const ENTRY_CELLS = ['0,5', '0,6'];      // 北の入口＝脱出口（`4,2` へ戻る）
export const DOOR_CELLS = ['9,5', '9,6'];       // 南の鍵扉 → `4,4`
const DOOR_APPROACH = ['8,5', '8,6'];
const KEY_CELL = '7,6';
const SAFE_MARK = ',';

export function analyze(template) {
	const grid = template.map((row) => row.split(''));
	const errs = [];
	if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
		throw new Error(`テンプレは ${ROWS}x${COLS} 必要`);
	const buttons = [], walls = new Set(), floors = new Set(), safe = new Set();
	const gates = { red: [], blue: [] }, switches = { red: [], blue: [] };
	let keyCell = null;
	const doors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (ch === '#') { walls.add(key(r, c)); continue; }
		if (ch === 'D') { doors.push(key(r, c)); walls.add(key(r, c)); continue; }  // 鍵未所持＝壁
		floors.add(key(r, c));                       // プレイヤーが（色が合えば）立てるセル
		if (ch === 'S') buttons.push(key(r, c));
		if (ch === 'K') keyCell = key(r, c);
		if (ch === SAFE_MARK) safe.add(key(r, c));
		if (ch === TILE.GATE_RED) gates.red.push(key(r, c));
		if (ch === TILE.GATE_BLUE) gates.blue.push(key(r, c));
		if (ch === TILE.SWITCH_RED) switches.red.push(key(r, c));
		if (ch === TILE.SWITCH_BLUE) switches.blue.push(key(r, c));
		if (DECOR_TILES.has(ch)) errs.push(`見た目だけの地面タイル '${ch}' が (${r},${c}) にある`);
	}
	if (keyCell !== KEY_CELL) errs.push(`鍵 K は ${KEY_CELL}（今 ${keyCell ?? 'なし'}）`);
	if (grid.some((row) => row.includes(TILE.GATE)))
		errs.push("この型（D 合成・stonesPlaced）にゲート 'T' は置かない（色ゲートと役割が重なる）");
	if (grid.some((row) => row.includes('B')))
		errs.push("宝箱 'B' は置かない（chestContents が空＝開けられない宝箱になる／石を押せる規則が"
			+ 'engine とソルバーで食い違う＝§7-6 手順9）');
	if (ENEMY_RE.test(template.join('')))
		errs.push('敵を置いてはいけない（enemy-ai.js が石を押す＝測定した倉庫番が壊れる）');
	if (buttons.length !== STONE_COUNT) errs.push(`ボタンは${STONE_COUNT}個（今 ${buttons.length}）`);
	if (gates.red.length !== 1 || gates.blue.length !== 1)
		errs.push(`色ゲートは赤1枚・青1枚（今 赤${gates.red.length}/青${gates.blue.length}）`);
	if (switches.red.length !== 1 || switches.blue.length !== 1)
		errs.push(`色スイッチは赤1個・青1個（今 赤${switches.red.length}/青${switches.blue.length}）`);
	if (doors.sort().join(' ') !== DOOR_CELLS.join(' '))
		errs.push(`鍵扉は ${DOOR_CELLS.join(' ')} の2枚（今 ${doors.join(' ') || 'なし'}）`);
	if (errs.length) throw new Error(`テンプレ不正:\n  - ${errs.join('\n  - ')}`);
	const gateCells = [...gates.red, ...gates.blue];
	const switchCells = [...switches.red, ...switches.blue];
	// 石が居られるセル＝床のうち、ゲート/色スイッチ/安全地帯/鍵セル以外。
	//   ・色スイッチは engine（player.js stoneDestOk）もソルバーも石を通さない
	//   ・ゲートは「開いていれば石も通る」が、4.7 の硬い制約＝搬送路にしない（I5 で測る）
	//     ∴初期配置と逆算の対象からは外す
	const stoneCells = new Set([...floors].filter((k) =>
		!gateCells.includes(k) && !switchCells.includes(k) && !safe.has(k) && k !== keyCell));
	return { grid, buttons, walls, floors, safe, keyCell, doors, gates, switches, gateCells, switchCells, stoneCells };
}

/** 集合 pass の中を start から歩いた到達集合。 */
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

/** 複数の始点から歩いた到達集合（入口が2セルある部屋用）。 */
function walkSetMulti(starts, pass) {
	const seen = new Set();
	for (const s of starts) {
		if (!pass(s)) continue;
		for (const k of walkSet(s, pass)) seen.add(k);
	}
	return seen;
}

/**
 * セル x へ石を押し込める向きがあるか（押し＝プレイヤー x-2d → 石 x-d → 行き先 x）。
 * 石の居るセルは stoneCells、プレイヤーの立つセルは floors（ゲートの上にも開けば立てる）。
 */
function pushableInto(t, x, { fromOutsideSafeOnly = false } = {}) {
	const [xr, xc] = parse(x);
	for (const [dr, dc] of DIRS) {
		const s = key(xr - dr, xc - dc);          // 石の居るセル
		const p = key(xr - 2 * dr, xc - 2 * dc);  // プレイヤーの立つセル
		if (!t.stoneCells.has(s) || !t.floors.has(p)) continue;
		if (fromOutsideSafeOnly && t.safe.has(s)) continue;   // 安全地帯の中→中は帰納法で除外済み
		return `${s} の石を ${p} から押す`;
	}
	return null;
}

export function assertGeometry(t) {
	const errs = [];
	// ① 外周：北の入口2セル・南の鍵扉2セル以外は全壁
	for (let c = 0; c < COLS; c++) {
		const north = t.grid[0][c], south = t.grid[ROWS - 1][c];
		const wantN = ENTRY_CELLS.includes(key(0, c)) ? SAFE_MARK : '#';
		const wantS = DOOR_CELLS.includes(key(ROWS - 1, c)) ? 'D' : '#';
		if (north !== wantN) errs.push(`北の外周 (0,${c}) は '${wantN}' でなく '${north}'`);
		if (south !== wantS) errs.push(`南の外周 (9,${c}) は '${wantS}' でなく '${south}'`);
	}
	for (let r = 1; r < ROWS - 1; r++) {
		if (t.grid[r][0] !== '#') errs.push(`西の外周が漏れている: (${r},0)`);
		if (t.grid[r][COLS - 1] !== '#') errs.push(`東の外周が漏れている: (${r},11)`);
	}
	// ② 安全地帯（玄関ホール）へは外から石を押し込めない＝石は永遠に入れない
	for (const e of ENTRY_CELLS) if (!t.safe.has(e)) errs.push(`入口 ${e} が安全地帯に入っていない`);
	for (const x of t.safe) {
		const how = pushableInto(t, x, { fromOutsideSafeOnly: true });
		if (how) errs.push(`安全地帯 ${x} へ外から石を押し込める（${how}）＝脱出口を石で塞げる（ハードロック）`);
	}
	// ③ 安全地帯は連結・本体との口が2つ以上
	const safeWalk = walkSetMulti(ENTRY_CELLS, (k) => t.safe.has(k));
	for (const x of t.safe) if (!safeWalk.has(x)) errs.push(`安全地帯 ${x} が入口から分断されている`);
	const mouths = [];
	for (const x of t.safe) {
		const [xr, xc] = parse(x);
		for (const [dr, dc] of DIRS) {
			const nk = key(xr + dr, xc + dc);
			if (t.floors.has(nk) && !t.safe.has(nk)) mouths.push(`${nk}→${x}`);
		}
	}
	if (mouths.length < 2) errs.push(`安全地帯と本体の口が ${mouths.length} 個（2以上必要）`
		+ '＝口の手前に石が居座った瞬間に脱出できない');
	t.mouths = mouths;
	// ④ 鍵扉の手前が床
	for (const a of DOOR_APPROACH) if (!t.floors.has(a)) errs.push(`鍵扉の手前 ${a} が床でない`);
	// ⑥ 各ボタンに石を押し込める向きが1つ以上ある
	for (const b of t.buttons) if (!pushableInto(t, b)) errs.push(`ボタン ${b} へ石を押し込める向きが無い＝解なし`);
	// ⑤⑦ 石ゼロ・**色ゲートを全部閉じた**歩行で、ゲート以外の全ての床へ行ける
	//     ＝ゲートは近道であって唯一路ではない（色の選択が一方通行の賭けにならない）。
	const noGate = (k) => t.floors.has(k) && !t.gateCells.includes(k);
	const openWalk = walkSetMulti(ENTRY_CELLS, noGate);
	for (const [label, cell] of [['鍵', t.keyCell],
		...t.buttons.map((b) => ['ボタン', b]), ...DOOR_APPROACH.map((a) => ['扉の手前', a]),
		...t.switches.red.map((s) => ['色スイッチ赤', s]), ...t.switches.blue.map((s) => ['色スイッチ青', s])]) {
		if (!openWalk.has(cell)) errs.push(`色ゲートを閉じたまま入口から ${label} ${cell} へ行けない`
			+ '（＝ゲートが唯一路＝色の選択が一方通行の賭けになる）');
	}
	for (const f of t.floors) {
		if (t.gateCells.includes(f)) continue;
		if (!openWalk.has(f)) errs.push(`床 ${f} が「ゲート閉」では入口から到達できない（孤立区画/ゲート唯一路）`);
	}
	// ⑧ 解けた状態（石が全ボタン上・以後ロックで不動）でもゲート抜きで鍵・扉の手前へ歩ける
	const solved = new Set(t.buttons);
	const afterSolve = walkSetMulti(ENTRY_CELLS, (k) => noGate(k) && !solved.has(k));
	for (const [label, cell] of [['鍵', t.keyCell], ...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!afterSolve.has(cell)) errs.push(`解いた後（石がボタン上で固定）に ${label} ${cell} へ行けない`);
	}
	if (errs.length) throw new Error(`幾何の不変条件に違反:\n  - ${errs.join('\n  - ')}`);
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から「引き」で初期配置候補を作る ────────
// D4/D8 と同じ規則。石を置けるセルは t.stoneCells（安全地帯・鍵・ゲート・色スイッチを除く）。
// ⚠️ 引き BFS ではプレイヤーの通行を「色ゲートは開いている」と甘く見る（生成は候補を作る
//    だけ／合否は前向きの実測が決める）。甘く見た分は「実測で解なし/帯外」として落ちる。
function pullBFS(t) {
	const isFloor = (r, c) => t.stoneCells.has(key(r, c)) || t.gateCells.includes(key(r, c));
	const goalStones = [...t.buttons].sort();
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
	let head = 0, truncatedAt = null;
	while (head < q.length) {
		if (dist.size >= PULL_CAP) { truncatedAt = dist.get(q[head]); break; }
		const st = q[head++];
		const [stonesStr, pStr] = st.split('|');
		const stones = stonesStr.split(';');
		const stoneSet = new Set(stones);
		const [pr, pc] = parse(pStr);
		const d = dist.get(st);
		for (const [dr, dc] of DIRS) {          // プレイヤーだけ動く（距離据え置き）
			const nr = pr + dr, nc = pc + dc;
			if (!isFloor(nr, nc) || stoneSet.has(key(nr, nc))) continue;
			const ns = encode(stones, key(nr, nc));
			if (!dist.has(ns)) { dist.set(ns, d); q.push(ns); }
		}
		for (const [dr, dc] of DIRS) {          // 引く（＝押しの逆・距離+1）
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
	const out = [];
	for (const [st, d] of dist) {
		const [stonesStr, pStr] = st.split('|');
		const stones = stonesStr.split(';');
		if (stones.some((s) => t.buttons.includes(s))) continue;   // 初期から一部解けている配置は除外
		if (stones.some((s) => !t.stoneCells.has(s))) continue;    // ゲートの上に初期配置しない
		out.push({ stones, player: pStr, pulls: d });
	}
	out.sort((a, b) => a.pulls - b.pulls);
	return { cands: out, states: dist.size, truncatedAt };
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
/**
 * 測定用タイル：テンプレそのまま＋石 '*'。
 *   ・鍵扉 'D' は鍵未所持＝壁として測る。
 *   ・安全地帯マーク ',' はテンプレ専用の注釈＝実タイルの床 '.' に戻す。
 *   ・gateAs で色ゲートのセルを別のタイルに差し替える（I4 の動的検査＝壁/常時開通）。
 */
export function buildTiles(t, stonePlacement, gateAs = null) {
	const stoneSet = new Set(stonePlacement);
	const tiles = t.grid.map((row) => [...row]);
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const k = key(r, c);
		if (tiles[r][c] === 'D') tiles[r][c] = TILE.WALL;
		else if (tiles[r][c] === SAFE_MARK) tiles[r][c] = TILE.FLOOR;
		if (gateAs && gateAs.cells.includes(k)) tiles[r][c] = gateAs.ch;
		if (stoneSet.has(k)) tiles[r][c] = TILE.STONE;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	return { tiles, bg };
}

/**
 * 軸②の貪欲モデル（D4/D6/D8 と同じ「押し単位のマクロ貪欲」）。
 * 1手単位のヒルクライムだと石の裏へ回り込む歩行が必ず評価値を悪化させる＝どんな倉庫番でも
 * 詰まって軸②が空虚になる∴歩行は自由・押しは石ポテンシャルを厳密に減らすものだけ許す。
 */
function makeGreedyPush(t) {
	const bpos = t.buttons.map(parse);
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	const perms = (xs) => xs.length <= 1 ? [xs]
		: xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
	const BPERM = perms(bpos.map((_, i) => i));   // 石3＝6通り
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
	// 色（f[6]）まで含めて「同じマクロ状態」を判定する＝色を変える手は歩行と同じ扱い。
	const macroKey = (state) => { const f = state.split('|'); return `${f[0]}|${f[1]}|${f[6]}`; };
	return (S, starts, goalTest) => {
		const q = [...starts];
		const seen = new Set(q.map(macroKey));
		for (let i = 0; i < q.length; i++) {
			const cur = q[i];
			const curStones = stonesOf(cur).join(';');
			const p0 = potential(stonesOf(cur));
			const walk = new Set([cur]), wq = [cur];
			for (let j = 0; j < wq.length; j++) {
				if (goalTest(wq[j])) return true;
				for (const nx of S.nextStates(wq[j])) {
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
}

/** 盤面をソルバー問題に組み立てる。ゴール＝石ロック済み かつ 鍵セルに立っている。 */
function buildProblem(t, stonePlacement, gateAs = null) {
	const { tiles, bg } = buildTiles(t, stonePlacement, gateAs);
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false });
	// 入口は2セル（`4,2` から降りてくる列がそのまま保たれる）∴両方を始点にする。
	// 色は未設定（0）＝色ゲートは両方閉じている（実ゲームの初回入室と同じ）。
	const starts = ENTRY_CELLS.map((e) => S.encode(...parse(e), S.initStones, 0, 0, 0));
	const goalTest = (state) => {
		const f = state.split('|');
		return f[0] === t.keyCell && f[5] === '1';
	};
	return { S, starts, goalTest };
}

/** 石をこのセル集合へ置く遷移を禁止したソルバー（I5＝色ゲートを石の搬送路にしない）。 */
function restrictStones(S, banned) {
	const ban = new Set(banned);
	return {
		...S,
		nextStates: (st) => S.nextStates(st).filter((nx) => {
			const f = nx.split('|')[1];
			if (!f) return true;
			return !f.split(';').some((s) => ban.has(s));
		}),
	};
}

/** 4軸＋I3 を測る（この部屋の脱出口＝北の入口2セル）。 */
export function measurePlacement(t, stonePlacement, guardMax, gateAs = null) {
	const { S, starts, goalTest } = buildProblem(t, stonePlacement, gateAs);
	const escapeTest = (state) => ENTRY_CELLS.includes(state.split('|')[0]);
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	const bpos = t.buttons.map(parse);
	const [gr, gc] = parse(t.keyCell);
	const h = (state) => {
		const f = state.split('|');
		const [pr, pc] = parse(f[0]);
		if (f[5] === '1') return man([pr, pc], [gr, gc]);
		const stones = f[1] ? f[1].split(';') : [];
		let sum = 0, near = Infinity;
		for (const s of stones) {
			const sp = parse(s);
			sum += Math.min(...bpos.map((b) => man(sp, b)));
			if (!t.buttons.includes(s)) near = Math.min(near, man([pr, pc], sp));
		}
		return sum * 8 + (near === Infinity ? 0 : near);
	};
	return measureMetrics(S, starts, goalTest, h,
		{ guardMax, greedyFn: makeGreedyPush(t), escapeTest });
}

/** 解けるか・L だけを見る軽い BFS（I4/I5 の差し替え測定用）。 */
function solveL(S, starts, goalTest, guardMax) {
	const dist = new Map();
	const q = [];
	for (const s of starts) if (!dist.has(s)) { dist.set(s, 0); q.push(s); }
	let head = 0, guard = 0;
	while (head < q.length) {
		if (++guard > guardMax) throw new Error('状態空間が大きすぎる');
		const st = q[head++];
		if (goalTest(st)) return { L: dist.get(st), states: dist.size };
		const d = dist.get(st);
		for (const nx of S.nextStates(st)) {
			if (dist.has(nx)) continue;
			dist.set(nx, d + 1); q.push(nx);
		}
	}
	return { L: null, states: dist.size };
}

/**
 * I4（色ゲートの必須性）＋I5（色ゲートを石の搬送路にしていないこと）を動的に確かめる。
 * 期待どおりでなければ throw（＝この石配置は合成型として成立していない）。
 * migrate 側も同じ関数を import する＝規則を2箇所に書かない。
 */
export function checkGateInvariants(t, stonePlacement, L, guardMax) {
	const out = { wall: {}, floor: {}, stoneBan: null };
	for (const [label, cells] of [['赤 (', t.gates.red], ['青 )', t.gates.blue]]) {
		// I4-① ゲートを壊せない壁にすると解なし（＝そのゲートが無いと解けない）
		{
			const p = buildProblem(t, stonePlacement, { cells, ch: TILE.WALL });
			const r = solveL(p.S, p.starts, p.goalTest, guardMax);
			if (r.L !== null) throw new Error(`I4: 色ゲート${label} を壁にしても解けてしまう（L=${r.L}）`
				+ '＝そのゲートは飾り（合成型として成立していない）');
			out.wall[label] = r;
		}
		// I4-③ ゲートを常時開通（床）にすると解ける・L は元より小さいか同じ
		{
			const p = buildProblem(t, stonePlacement, { cells, ch: TILE.FLOOR });
			const r = solveL(p.S, p.starts, p.goalTest, guardMax);
			if (r.L === null) throw new Error(`I4: 色ゲート${label} を床にすると解けなくなる`
				+ '＝解なしの原因がゲートの開閉ではない（盤面の作り間違い）');
			if (r.L > L) throw new Error(`I4: 色ゲート${label} を床にしたのに L が増えた（${L}→${r.L}）`);
			out.floor[label] = r;
		}
	}
	// I5 石を色ゲートのセルへ置く遷移を禁止しても L が同じ＝最短解は石をゲートに通していない
	//    （4.7 の硬い制約＝色ゲートはプレイヤーの通路・石の搬送路にしない）
	{
		const p = buildProblem(t, stonePlacement);
		const r = solveL(restrictStones(p.S, t.gateCells), p.starts, p.goalTest, guardMax);
		if (r.L === null) throw new Error('I5: 石をゲートに乗せられないと解けない'
			+ '＝色ゲートを石の搬送路にしている（4.7 の硬い制約に違反）');
		if (r.L !== L) throw new Error(`I5: 石をゲートに乗せない最短解が ${r.L} 手（本来 ${L} 手）`
			+ '＝最短解が石をゲートに通している（4.7 の硬い制約に違反）');
		out.stoneBan = r;
	}
	return out;
}

// ── 実行 ────────────────────────────────────────────────────────────────────
// migrate-key-room-dark-tower-43.mjs が解析・幾何 assert・測定・I4/I5 を**そのまま再利用**
// できるよう（規則を2箇所に書いて食い違わせないよう）ライブラリとして import 可能にする。
const IS_MAIN = process.argv[1]?.endsWith('generate-key-room-dark-tower-43.mjs') ?? false;
const only = IS_MAIN ? process.argv.slice(2)[0] : undefined;
const list = IS_MAIN ? (only ? TEMPLATES.filter((x) => x.name === only) : TEMPLATES) : [];
if (IS_MAIN && !list.length) throw new Error(`テンプレが無い: ${only}`);

for (const tpl of list) {
	const t = analyze(tpl.template);
	assertGeometry(t);
	console.log(`\n════ ${tpl.name} ════`);
	tpl.template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
	console.log(`  ボタン ${t.buttons.join(' / ')}  鍵 ${t.keyCell}  入口 ${ENTRY_CELLS.join(' ')}  鍵扉 ${t.doors.join(' / ')}`);
	console.log(`  色ゲート 赤 ${t.gates.red.join(' ')} / 青 ${t.gates.blue.join(' ')}`
		+ `  色スイッチ 赤 ${t.switches.red.join(' ')} / 青 ${t.switches.blue.join(' ')}`);
	console.log(`  床 ${t.floors.size} セル（うち安全地帯 ${t.safe.size}／石が居られる ${t.stoneCells.size}）`);
	console.log(`  玄関ホールの口: ${t.mouths.join(' , ')}`);
	if (GEOM_ONLY) { console.log('  (GEOM_ONLY: assertGeometry を通過)'); continue; }

	// 逆算候補（同じ石配置は最小引き距離の1件に代表させる）
	const pull = pullBFS(t);
	const seenStones = new Set();
	const cands = [];
	for (const c of pull.cands) {
		const sk = c.stones.join(';');
		if (seenStones.has(sk)) continue;
		seenStones.add(sk);
		cands.push(c);
	}
	console.log(`  逆算(pull-BFS) 展開状態 ${pull.states}`
		+ (pull.truncatedAt == null ? '（完全展開）'
			: `  ⚠️ PULL_CAP=${PULL_CAP} で打ち切り＝引き距離 ${pull.truncatedAt} までしか見ていない`
				+ '（より深い候補を見落としている可能性あり）'));
	console.log(`  石${STONE_COUNT}配置候補: ${cands.length} 通り（引き距離 ${cands[0]?.pulls}〜${cands[cands.length - 1]?.pulls}）`);
	if (!cands.length) { console.log(`  ✗ ${tpl.name}：候補ゼロ（ボタンへ石を運べない盤面）`); continue; }

	const candCap = Number(process.env.CAND_CAP ?? 1200);
	let pool = cands;
	if (cands.length > candCap) {
		const st = cands.length / candCap;
		pool = Array.from({ length: candCap }, (_, i) => cands[Math.floor(i * st)]);
		console.log(`  ⚠️ 候補を ${cands.length} → ${pool.length} に等間隔サンプル（CAND_CAP=${candCap}）`
			+ `＝全候補は見ていない（${cands.length - pool.length} 通りは未評価＝見落としの可能性を明示）`);
	} else {
		console.log(`  候補は全 ${pool.length} 通りを評価（CAND_CAP=${candCap} に未達＝打ち切りなし）`);
	}

	// 篩：貪欲（マクロ押し）は状態空間 BFS 不要で安い∴先に軸②で篩う。
	const greedyFn = makeGreedyPush(t);
	const insight = [];
	for (const cand of pool) {
		const p = buildProblem(t, cand.stones);
		if (!greedyFn(p.S, p.starts, p.goalTest)) insight.push(cand);
	}
	console.log(`  貪欲で解ける（軸②未達）${pool.length - insight.length} 件 / 軸②クリア ${insight.length} 件`);
	if (!insight.length) { console.log(`  ✗ ${tpl.name}：軸②（貪欲NG）を通る候補が無い`); continue; }

	// L と引き距離は単調対応しない∴引き距離の分布全体から等間隔サンプルする。
	const byPulls = [...insight].sort((a, b) => a.pulls - b.pulls);
	const sample = byPulls.length <= MAX_MEASURE ? byPulls
		: Array.from({ length: MAX_MEASURE },
			(_, i) => byPulls[Math.floor(i * byPulls.length / MAX_MEASURE)]);
	if (byPulls.length > sample.length)
		console.log(`  ⚠️ フル測定は軸②クリア ${insight.length} 件から引き距離で等間隔サンプルした ${sample.length} 件だけ`
			+ `（MAX_MEASURE=${MAX_MEASURE}）＝残り ${insight.length - sample.length} 件は未測定`);
	const passed = [];
	let tooBig = 0, escFail = 0, bandFail = 0, axisFail = 0, gateFail = 0;
	for (const cand of sample) {
		let m;
		try { m = measurePlacement(t, cand.stones, GUARD_MAX); }
		catch (e) { tooBig++; console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} → 状態超過/測定不能 (${e.message})`); continue; }
		const v = verdict(m);
		console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount} states=${m.states} noEsc=${m.noEscape} ${v.label}`);
		if (!v.pass) { axisFail++; continue; }
		if (m.noEscape) { escFail++; continue; }
		if (m.L < L_MIN || m.L > L_MAX) { bandFail++; continue; }
		let gi;
		try { gi = checkGateInvariants(t, cand.stones, m.L, GUARD_MAX); }
		catch (e) { gateFail++; console.log(`      ✗ ${e.message}`); continue; }
		console.log(`      I4 OK（赤を壁→解なし・青を壁→解なし・床にすると赤 L=${gi.floor['赤 ('].L}`
			+ ` / 青 L=${gi.floor['青 )'].L}）  I5 OK（石をゲートに乗せない最短解も L=${gi.stoneBan.L}）`);
		passed.push({ cand, m, gi });
	}
	console.log(`  フル測定 ${sample.length} 件（状態超過 ${tooBig} / 4軸未達 ${axisFail}`
		+ ` / I3脱出不能 ${escFail} / 帯外 ${bandFail} / I4・I5未達 ${gateFail}）→ 採用可 ${passed.length} 件`);
	if (!passed.length) { console.log(`  ✗ ${tpl.name}：帯 ${L_MIN}〜${L_MAX} の合格盤面が見つからず（テンプレ調整）`); continue; }

	// 帯の中で最も深く、同じ深さなら最短解が最も細いものを採る。
	const num = (v) => (typeof v === 'number' ? v : Infinity);
	passed.sort((a, b) => b.m.L - a.m.L || num(a.m.solCount) - num(b.m.solCount));
	const { cand, m } = passed[0];
	console.log(`  ✅ 採用 石 ${cand.stones.join(' ')}（引き${cand.pulls}）→ L=${m.L} 貪欲NG deadlock=${m.deadlocks}`
		+ ` 強制手率=${m.forcedRatio} 最短解本数=${m.solCount} 状態=${m.states} 脱出不能=${m.noEscape}`);
	const { tiles } = buildTiles(t, cand.stones);
	const shown = tiles.map((row, r) => row.map((ch, c) => (DOOR_CELLS.includes(key(r, c)) ? 'D' : ch)).join(''));
	console.log('  ── 採用盤面 ──');
	shown.forEach((row, r) => console.log('    ', String(r).padStart(2), row));
	console.log(`  ── migrate 用 ── STONES=${cand.stones.join(' ')}  L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount}`);
}
