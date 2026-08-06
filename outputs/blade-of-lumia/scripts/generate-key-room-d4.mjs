#!/usr/bin/env node
/**
 * generate-key-room-d4.mjs — D4 の鍵部屋（dungeon_4 / 1,0）を「石3・純倉庫番」に
 * するための盤面を逆算生成・測定する（PLAN 実行キュー 5.5e・PUZZLE-DESIGN §7-4）。
 *
 * generate-sokoban-playable.mjs（お試し4枚）との違い＝**関門の形が違う**：
 *   ・お試し4枚は「ゲート T の奥の宝 B」がゴール＝ゲートが物理的な関門。
 *   ・鍵部屋は showConditions(`stonesPlaced`) が関門＝**物理ゲートが無い**。
 *     鍵セルには最初から歩いて行けるが、全ボタンに石が乗るまで鍵が出現しない
 *     （＝描画も踏んで拾うもブーメランも塞がる＝3経路ガード）。
 *     ∴ゴール判定は「石ロック済み（locked=1）かつ鍵セルに立っている」。
 *   ・お試し4枚の幾何不変条件①（ゲート閉で宝に届かない）②（ボタン↔ゲート距離≥2）は
 *     この部屋には**適用できない/不要**：①ゲートが無い、②足踏みでは `stonesPlaced` が
 *     成立しない（石だけを数える＝§7-5 がこのトリガーを新設した理由そのもの）。
 *
 * この部屋固有の不変条件（下の assertGeometry が検査する）：
 *   ① 外周＝リング全壁。ただし西の (4,0)(5,0) は鍵扉 'D'（ボス部屋への出口）。
 *      孤島（ワープ `>` で入る）＝辺で隣室と繋がっていない∴他の継ぎ目は開けない。
 *   ② **安全地帯（前室）へ石が1個も入れない。** ワープ `>` は**詰み救済の唯一の出口**
 *      （踏むと隣室へ出る→enterStage が未解決の石を初期位置へ戻す）∴塞がれると
 *      本当のハードロックになる（笛の `resetStones` は D7 の道具＝D4 では使えない）。
 *      テンプレの ',' で安全地帯を宣言し、次の帰納法で「石は永遠に入れない」を静的に保証する：
 *        ・石の初期配置は安全地帯に置かない（pull-BFS 側で除外）。
 *        ・安全地帯のセル X に石が入る押しは「石 S=X-d → 行き先 X・プレイヤー P=X-2d」∴
 *          **S が安全地帯の外なら P が壁**であることを全 X・全方向で要求する。
 *          ⇒ 外から入る押しが存在しない＋初期に居ない ⇒ 永遠に入れない。
 *      これは「1幅の袋小路（喉）を石で栓される」形（v1 で実測 noEscape=1248）の根治：
 *      喉を石で栓できないようにするには喉の手前も壁で守るしかなく、それをやると喉が
 *      孤立する∴**袋小路をやめて「石が入れない前室」にする**のが正しい形。
 *   ③ 宝箱 'B'（ハートの器）も安全地帯に置く。実エンジン player.js の stoneDestOk は
 *      `tilePassable` だけを見る＝宝箱（passable:true）へ石を押せてしまうが、
 *      ソルバー passableFor は forStone で 'B' を拒む＝**規則が食い違う**。
 *      石が入れない前室に置けば食い違いが無効化される（測定 = 実機を保つ）。
 *   ④ 安全地帯は連結で、本体（パズル区画）との口が2つ以上ある
 *      （1つだと口の手前のセルに石が居座った瞬間に脱出できない＝ハードロック）。
 *   ⑤ 鍵扉の手前 (4,1)(5,1) が床（扉に手が届く）。
 *   ⑥ 石ゼロの状態でワープから鍵・宝箱・ボタン全部・扉の手前に歩いて行ける
 *      （入って詰まない／パズルを始められる）。
 *   ⑦ 解けた状態（石が全ボタン上＝以後ロックで動かない）でも、ワープから
 *      鍵・宝箱・扉の手前へ歩いて行ける（＝解いた後に進めなくなる盤面を弾く）。
 *   ⑧ ボタンは全て「石を押し込める向きが1つ以上ある」（押し込めないボタン＝解なし）。
 *   ⑨ tiles 層に見た目だけの地面タイルを混ぜていない／敵を置かない
 *      （敵は enemy-ai.js tryEnemyPushStone で**石を押す**＝測定した倉庫番が壊れる）。
 *
 * 測定（PUZZLE-DESIGN §7-3 C）：4軸下限（L≥6・貪欲NG・deadlock>0・強制手率≤0.7）
 *   ＋関門の上限 L ≤ 60、さらに §7-4 の D4 の帯 **L 20〜35**。
 *   ＋ I3（noEscape=0）＝どの到達状態からもワープに戻れる（石で自分を閉じ込めない）。
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    書き込みは scripts/migrate-key-room-d4.mjs。
 *
 * 使い方（outputs/blade-of-lumia/ で実行）:
 *   node scripts/generate-key-room-d4.mjs            # 全テンプレ
 *   node scripts/generate-key-room-d4.mjs v1         # 指定テンプレだけ
 *   GEOM_ONLY=1 node scripts/generate-key-room-d4.mjs   # 幾何 assert だけ（設計反復用）
 *   MAX_MEASURE=20 node scripts/generate-key-room-d4.mjs
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ────────────────────────────────────────────────────────────
//   '#' 壁 / '.' 床 / 'S' ボタン（石の目標）/ 'K' 鍵 / 'B' 宝箱（ハートの器）
//   '>' ワープ（入口＝救済の出口）/ 'D' 鍵扉（ボス部屋へ・測定では壁として扱う）
//   ',' 安全地帯（前室）の床＝石が絶対に入れない区画（不変条件②。書き込み時は '.' に戻す）
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
//
// ⚠️ v1（東に1幅の袋を2つ彫った形）は実測で捨てた＝袋の喉 (7,8) と (8,8) に石が縦に
//    2個並ぶと双方が動かせず**ワープに永久に行けない**（noEscape=1248・全候補が失格）。
//    ∴袋小路をやめ、東列を「石が入れない前室」にして口を2つ持たせる形に作り替えた。
export const TEMPLATES = [
	{
		// v2：東列（col8-9）を安全地帯の前室にし、本体（rows1-8 / cols1-7）を
		// ピラー部屋にした形。
		//   ・前室への口は (3,7)→(3,8) と (6,7)→(6,8) の2つ。口の「押し込み位置」
		//     (3,6)/(6,6) を壁にしてあるので石は前室へ入れない（不変条件②）。
		//     口が2つ＝片方の手前に石が居座っても反対の口から脱出できる。
		//   ・ピラー (2,2)(2,5)(4,3)(5,5)(6,2)(3,6)(6,6) は千鳥＝真っ直ぐ運べるレーンが無い。
		//   ・ボタンは北西の角 (1,1)・中央 (4,4)・南東 (8,7) ＝運ぶレーンが必ず交差する。
		//   ・鍵 (5,7) は本体の東端＝最初から見える（何をすべきかが見える＝§7-3 B③ の精神）。
		name: 'v2',
		template: [
			'############',
			'#S......####',
			'#.#..#..#B##',
			'#.....#.,,##',
			'D..#S...#,##',
			'D....#.K#,##',
			'#.#...#.,,##',
			'#.......#>##',
			'#......S#,##',
			'############',
		],
	},
];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const MAX_MEASURE = Number(process.env.MAX_MEASURE ?? 12);
const GEOM_ONLY = !!process.env.GEOM_ONLY;

// L の帯（§7-4 の D4）＝20〜35。関門の上限 L≤60（§7-3 C）より内側。
const L_MIN = Number(process.env.L_MIN ?? 20);
const L_MAX = Number(process.env.L_MAX ?? 35);

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);
// 敵タイル（この部屋には置かない＝敵が石を押す）。
const ENEMY_RE = /[WECFVXZALNJOUGI]/;

const DOOR_CELLS = ['4,0', '5,0'];
const DOOR_APPROACH = ['4,1', '5,1'];
// 安全地帯（前室）の床を宣言するテンプレ専用マーク。実タイルには存在しない＝書き込み時に '.' へ。
const SAFE_MARK = ',';

export function analyze(template) {
	const grid = template.map((row) => row.split(''));
	if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
		throw new Error(`テンプレは ${ROWS}x${COLS} 必要`);
	const buttons = [], walls = new Set(), floors = new Set(), safe = new Set();
	let keyCell = null, chest = null, warp = null;
	const doors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (ch === '#') { walls.add(key(r, c)); continue; }
		if (ch === 'D') { doors.push(key(r, c)); walls.add(key(r, c)); continue; }  // 鍵未所持＝壁
		floors.add(key(r, c));
		if (ch === 'S') buttons.push(key(r, c));
		if (ch === 'K') keyCell = key(r, c);
		if (ch === 'B') { chest = key(r, c); safe.add(key(r, c)); }
		if (ch === TILE.MAP_ENTER) { warp = key(r, c); safe.add(key(r, c)); }
		if (ch === SAFE_MARK) safe.add(key(r, c));
		if (DECOR_TILES.has(ch)) throw new Error(`見た目だけの地面タイル '${ch}' が (${r},${c}) にある`);
	}
	if (!keyCell) throw new Error('テンプレに鍵 K が無い');
	if (!chest) throw new Error('テンプレに宝箱 B が無い');
	if (!warp) throw new Error('テンプレにワープ > が無い');
	if (grid.some((row) => row.includes(TILE.GATE)))
		throw new Error("この型（C 倉庫番・stonesPlaced）にゲート 'T' は置かない");
	if (ENEMY_RE.test(template.join('')))
		throw new Error('敵を置いてはいけない（enemy-ai.js が石を押す＝測定した倉庫番が壊れる）');
	// §3-2c（ユーザー確定）＝石は3〜4個。D4 は §7-4 で石3。
	if (buttons.length !== 3) throw new Error(`ボタンは3個（今 ${buttons.length}）`);
	if (doors.sort().join(' ') !== DOOR_CELLS.join(' '))
		throw new Error(`鍵扉は ${DOOR_CELLS.join(' ')} の2枚（今 ${doors.join(' ')}）`);
	return { grid, buttons, walls, floors, safe, keyCell, chest, warp, doors };
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

/** セル x へ石を押し込める向きがあるか（押し＝プレイヤー x-2d → 石 x-d → 行き先 x）。 */
function pushableInto(t, x, { fromOutsideSafeOnly = false } = {}) {
	const [xr, xc] = parse(x);
	for (const [dr, dc] of DIRS) {
		const s = key(xr - dr, xc - dc);          // 石の居るセル
		const p = key(xr - 2 * dr, xc - 2 * dc);  // プレイヤーの立つセル
		if (!t.floors.has(s) || !t.floors.has(p)) continue;
		if (fromOutsideSafeOnly && t.safe.has(s)) continue;   // 安全地帯の中→中は帰納法で除外済み
		return `${s} の石を ${p} から押す`;
	}
	return null;
}

export function assertGeometry(t) {
	// ① リング（外周）＝孤島なので鍵扉 2 枚以外は全壁
	for (let c = 0; c < COLS; c++) {
		if (t.grid[0][c] !== '#') throw new Error(`北の外周が漏れている: (0,${c})`);
		if (t.grid[ROWS - 1][c] !== '#') throw new Error(`南の外周が漏れている: (9,${c})`);
	}
	for (let r = 0; r < ROWS; r++) {
		if (t.grid[r][COLS - 1] !== '#') throw new Error(`東の外周が漏れている: (${r},11)`);
		const west = t.grid[r][0];
		const want = DOOR_CELLS.includes(key(r, 0)) ? 'D' : '#';
		if (west !== want) throw new Error(`西の外周: (${r},0) は '${want}' でなく '${west}'`);
	}
	// ②③ 安全地帯（前室）へは外から石を押し込めない（＝石は永遠に入れない）
	if (!t.safe.has(t.warp)) throw new Error(`ワープ ${t.warp} が安全地帯に入っていない`);
	if (!t.safe.has(t.chest)) throw new Error(`宝箱 ${t.chest} が安全地帯に入っていない`);
	for (const x of t.safe) {
		const how = pushableInto(t, x, { fromOutsideSafeOnly: true });
		if (how) throw new Error(`安全地帯 ${x} へ外から石を押し込める（${how}）`
			+ '＝ワープが塞がれ得る（ハードロック）／宝箱で実機とソルバーの規則が食い違う');
	}
	// ④ 安全地帯は連結・本体との口が2つ以上
	const safeWalk = walkSet(t.warp, (k) => t.safe.has(k));
	for (const x of t.safe) if (!safeWalk.has(x)) throw new Error(`安全地帯 ${x} がワープから分断されている`);
	const mouths = [];
	for (const x of t.safe) {
		const [xr, xc] = parse(x);
		for (const [dr, dc] of DIRS) {
			const nk = key(xr + dr, xc + dc);
			if (t.floors.has(nk) && !t.safe.has(nk)) mouths.push(`${nk}→${x}`);
		}
	}
	if (mouths.length < 2) throw new Error(`安全地帯と本体の口が ${mouths.length} 個（2以上必要）`
		+ '＝口の手前に石が居座った瞬間に脱出できない');
	// ⑤ 鍵扉の手前が床
	for (const a of DOOR_APPROACH) if (!t.floors.has(a)) throw new Error(`鍵扉の手前 ${a} が床でない`);
	// ⑧ 各ボタンに石を押し込める向きが1つ以上ある
	for (const b of t.buttons) {
		if (!pushableInto(t, b)) throw new Error(`ボタン ${b} へ石を押し込める向きが無い＝解なし`);
	}
	t.mouths = mouths;
	// ⑥ 石ゼロでワープから全要所へ歩ける
	const open = walkSet(t.warp, (k) => t.floors.has(k));
	for (const [label, cell] of [['鍵', t.keyCell], ['宝箱', t.chest],
		...t.buttons.map((b) => ['ボタン', b]), ...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!open.has(cell)) throw new Error(`石ゼロでもワープから ${label} ${cell} へ行けない`);
	}
	// ⑦ 解けた状態（石が全ボタン上・以後ロックで不動）でも要所へ歩ける
	const solved = new Set(t.buttons);
	const afterSolve = walkSet(t.warp, (k) => t.floors.has(k) && !solved.has(k));
	for (const [label, cell] of [['鍵', t.keyCell], ['宝箱', t.chest],
		...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!afterSolve.has(cell)) throw new Error(`解いた後（石がボタン上で固定）にワープから ${label} ${cell} へ行けない`);
	}
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から「引き」で初期配置候補を作る ────────
// generate-sokoban-playable.mjs と同じ規則。石を置けない/置きたくないセル（安全地帯の全セル
// ＝宝箱・ワープ・前室の床、および鍵セル）を除いた床の上だけで引く。安全地帯を除くのは
// 不変条件②の帰納法の前提（「石は初期に安全地帯に居ない」）そのもの。
// プレイヤー位置も保持する＝逆再生がそのまま押しの解になる。
function pullBFS(t) {
	const noStone = new Set([...t.safe, t.keyCell]);
	const isFloor = (r, c) => t.floors.has(key(r, c)) && !noStone.has(key(r, c));
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
	let head = 0;
	while (head < q.length) {
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
		out.push({ stones, player: pStr, pulls: d });
	}
	return out.sort((a, b) => a.pulls - b.pulls);
}

/** 初期配置でワープ（入口）から目標セルへ歩いて行けるか。 */
function walkReachable(t, stones, target) {
	const blocked = new Set(stones);
	if (!t.floors.has(target) || blocked.has(target)) return false;
	return walkSet(t.warp, (k) => t.floors.has(k) && !blocked.has(k)).has(target);
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
/**
 * 測定用タイル：テンプレそのまま＋石 '*'。
 *   ・鍵扉 'D' は鍵未所持＝壁として測る（ソルバーの 'D' は解ける関門扱いで通ってしまう）。
 *   ・安全地帯マーク ',' はテンプレ専用の注釈＝実タイルの床 '.' に戻す。
 */
export function buildTiles(t, stonePlacement) {
	const stoneSet = new Set(stonePlacement);
	const tiles = t.grid.map((row) => [...row]);
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (tiles[r][c] === 'D') tiles[r][c] = TILE.WALL;
		else if (tiles[r][c] === SAFE_MARK) tiles[r][c] = TILE.FLOOR;
		if (stoneSet.has(key(r, c))) tiles[r][c] = TILE.STONE;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	return { tiles, bg };
}

/**
 * 軸②の貪欲モデル（generate-sokoban-playable.mjs と同じ「押し単位のマクロ貪欲」）。
 * 1手単位のヒルクライムだと石の裏へ回り込む歩行が必ず評価値を悪化させる＝どんな倉庫番でも
 * 詰まって軸②が空虚になる∴歩行は自由・押しは石ポテンシャルを厳密に減らすものだけ許す。
 */
function makeGreedyPush(t) {
	const bpos = t.buttons.map(parse);
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
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
function buildProblem(t, stonePlacement) {
	const { tiles, bg } = buildTiles(t, stonePlacement);
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false });
	const start = S.encode(...parse(t.warp), S.initStones, 0, 0, 0);
	const goalTest = (state) => {
		const f = state.split('|');
		return f[0] === t.keyCell && f[5] === '1';
	};
	return { S, start, goalTest };
}

export function measurePlacement(t, stonePlacement, guardMax) {
	const { S, start, goalTest } = buildProblem(t, stonePlacement);
	// I3＝ワープ（救済の出口）に戻れない到達状態を数える。リングの exitCells ではない
	// （孤島なのでリングは全部壁／鍵扉は鍵未所持＝壁）∴ワープ1セルだけが脱出口。
	const escapeTest = (state) => state.split('|')[0] === t.warp;
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	const bpos = t.buttons.map(parse);
	const [gr, gc] = parse(t.keyCell);
	// 貪欲ヒューリスティックは段階を分ける（石が全部乗るまでは鍵への距離を見ない）。
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
	return measureMetrics(S, [start], goalTest, h,
		{ guardMax, greedyFn: makeGreedyPush(t), escapeTest });
}

// ── 実行 ────────────────────────────────────────────────────────────────────
// migrate-key-room-d4.mjs がテンプレ解析・幾何 assert・測定を**そのまま再利用**できるよう
// （＝2箇所に規則を書いて食い違わせないよう）ライブラリとして import 可能にする。
// 直接実行のときだけ下の生成ループを回す。
const IS_MAIN = process.argv[1]?.endsWith('generate-key-room-d4.mjs') ?? false;
const only = IS_MAIN ? process.argv.slice(2)[0] : undefined;
const list = IS_MAIN ? (only ? TEMPLATES.filter((x) => x.name === only) : TEMPLATES) : [];
if (IS_MAIN && !list.length) throw new Error(`テンプレが無い: ${only}`);

for (const tpl of list) {
	const t = analyze(tpl.template);
	assertGeometry(t);
	console.log(`\n════ ${tpl.name} ════`);
	tpl.template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
	console.log(`  ボタン ${t.buttons.join(' / ')}  鍵 ${t.keyCell}  宝箱 ${t.chest}  ワープ(入口) ${t.warp}  扉 ${t.doors.join(' / ')}`);
	console.log(`  床 ${t.floors.size} セル（測定では鍵扉は壁扱い＝鍵未所持）`);
	if (GEOM_ONLY) { console.log('  (GEOM_ONLY: assertGeometry を通過)'); continue; }

	// 逆算候補（同じ石配置は最小引き距離の1件に代表させる／逆再生できるものだけ）
	const seenStones = new Set();
	const cands = [];
	for (const c of pullBFS(t)) {
		const sk = c.stones.join(';');
		if (seenStones.has(sk)) continue;
		if (!walkReachable(t, c.stones, c.player)) continue;
		seenStones.add(sk);
		cands.push(c);
	}
	console.log(`  石3配置候補: ${cands.length} 通り（引き距離 ${cands[0]?.pulls}〜${cands[cands.length - 1]?.pulls}）`);

	const candCap = Number(process.env.CAND_CAP ?? 1200);
	let pool = cands;
	if (cands.length > candCap) {
		const st = cands.length / candCap;
		pool = Array.from({ length: candCap }, (_, i) => cands[Math.floor(i * st)]);
		console.log(`  ⚠️ 候補を ${cands.length} → ${pool.length} に等間隔サンプル（CAND_CAP=${candCap}）`
			+ '＝全候補は見ていない（見落としの可能性を明示）');
	}

	// 篩：貪欲（マクロ押し）は状態空間 BFS 不要で安い∴先に軸②で篩う。
	const greedyFn = makeGreedyPush(t);
	const insight = [];
	for (const cand of pool) {
		const p = buildProblem(t, cand.stones);
		if (!greedyFn(p.S, [p.start], p.goalTest)) insight.push(cand);
	}
	console.log(`  貪欲で解ける（軸②未達）${pool.length - insight.length} 件 / 軸②クリア ${insight.length} 件`);

	const maxMeasure = Number(process.env.MAX_MEASURE ?? MAX_MEASURE);
	const step = Math.max(1, Math.floor(insight.length / maxMeasure));
	const sample = insight.filter((_, i) => i % step === 0).slice(0, maxMeasure);
	const passed = [];
	let tooBig = 0, escFail = 0, bandFail = 0;
	for (const cand of sample) {
		let m;
		try { m = measurePlacement(t, cand.stones, 9000000); }
		catch { tooBig++; continue; }
		const v = verdict(m);
		console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount} states=${m.states} noEsc=${m.noEscape} ${v.label}`);
		if (!v.pass) continue;
		if (m.noEscape) { escFail++; continue; }               // I3＝ワープに戻れない状態がある
		if (m.L < L_MIN || m.L > L_MAX) { bandFail++; continue; }  // §7-4 の帯 20〜35
		passed.push({ cand, m });
	}
	console.log(`  フル測定 ${sample.length} 件（状態超過 ${tooBig} / I3脱出不能 ${escFail} / 帯外 ${bandFail}）→ 採用可 ${passed.length} 件`);
	if (!passed.length) { console.log(`  ✗ ${tpl.name}：帯 ${L_MIN}〜${L_MAX} の合格盤面が見つからず（テンプレ調整）`); continue; }

	// 帯の中で最も深く、同じ深さなら最短解が最も細いものを採る。
	const num = (v) => (typeof v === 'number' ? v : Infinity);
	passed.sort((a, b) => b.m.L - a.m.L || num(a.m.solCount) - num(b.m.solCount));
	const { cand, m } = passed[0];
	console.log(`  ✅ 採用 石 ${cand.stones.join(' ')}（引き${cand.pulls}）→ L=${m.L} 貪欲NG deadlock=${m.deadlocks} 強制手率=${m.forcedRatio} 最短解本数=${m.solCount} 状態=${m.states} 脱出不能=${m.noEscape}`);
	const { tiles } = buildTiles(t, cand.stones);
	// 表示は実際に書き込む形（鍵扉 'D' は戻す・安全地帯マークは buildTiles で '.' 済み）
	const shown = tiles.map((row, r) => row.map((ch, c) => (DOOR_CELLS.includes(key(r, c)) ? 'D' : ch)).join(''));
	console.log('  ── 採用盤面 ──');
	shown.forEach((row, r) => console.log('    ', String(r).padStart(2), row));
	console.log(`  ── migrate 用 ── STONES=${cand.stones.join(' ')}  ENTRY=${t.warp}  L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount}`);
}
