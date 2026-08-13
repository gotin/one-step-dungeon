#!/usr/bin/env node
/**
 * generate-key-room-d8.mjs — D8 の鍵部屋（dungeon_8 / 1,0）を「石4・純倉庫番」に
 * するための盤面を逆算生成・測定する（PLAN 実行キュー 5.5g・PUZZLE-DESIGN §7-4 #8）。
 *
 * D4（石3・純倉庫番＝generate-key-room-d4.mjs）と同じ型だが、
 *   ・石とボタンが **4個**（§3-2c の上限＝石3〜4の「4」側）
 *   ・L の帯が **40〜60**（§7-6 手順11 の排他帯＝D4 20〜35／D6 34〜39 と重ねない。
 *     上限 60 は §7-3 C の「必須進行路の関門」上限そのもの＝23,0 の L=89 は重すぎる）
 *   ・宝箱 'B' を置かない（この部屋には元から宝箱が無い＝chestContents 空。
 *     ∴ engine の stoneDestOk とソルバー passableFor の食い違い §7-6 手順9 は
 *     そもそも現れない＝analyze は 'B' を error にする）
 *
 * ⚠️ 石4は状態も候補も桁で増える∴**打ち切りを黙ってやらない**（§7-6 の精神＝
 *    見ていない範囲を「見た」と読ませない）。この生成器は3箇所で打ち切りを明示ログする：
 *      ・pull-BFS の展開状態数（`PULL_CAP`）＝逆算の途中で切ったらその旨と切った深さ
 *      ・候補の等間隔サンプル（`CAND_CAP`）＝全候補を見ていないこと
 *      ・フル測定の間引き（`MAX_MEASURE`）＝軸②通過のうち何件だけ測ったか
 *    さらに状態超過（`GUARD_MAX`）で測れなかった候補も件数を出す。
 *
 * 部屋固有の不変条件（assertGeometry が検査する。D4 と同じ＝孤島・前室の帰納法）：
 *   ① 外周＝リング全壁。ただし西の (4,0)(5,0) は鍵扉 'D'（ボス部屋への出口）。
 *      孤島（ワープ `>`(7,9) で入る）＝辺で隣室と繋がっていない。
 *   ② **安全地帯（前室）へ石が1個も入れない**（ワープ＝詰み救済の唯一の出口）。
 *      テンプレの ',' で宣言し、帰納法で静的に保証する：
 *        ・石の初期配置は前室に置かない（pull-BFS 側で除外）
 *        ・前室のセル X・全方向 d で「押し元 X-d が前室の外なら押し手 X-2d が壁」
 *      ⇒ 外から入る押しが存在しない＋初期に居ない ⇒ 永遠に入れない。
 *      笛（`resetStones`）は **D8 の報酬そのもの**＝この部屋の初回攻略時は未所持
 *      （進行順 D4→D6→D5→D8→D7）∴救済はワープ1本＝前室の保証が要る。
 *   ③ 前室は連結で、本体との口が2つ以上（1つだと口の手前に石が居座った瞬間に脱出不能）。
 *   ④ 鍵扉の手前 (4,1)(5,1) が床。
 *   ⑤ 石ゼロでワープから鍵・ボタン全部・扉の手前へ歩ける（入って詰まない）。
 *   ⑥ 解けた状態（石が全ボタン上＝以後ロックで不動）でもワープから鍵・扉の手前へ歩ける。
 *   ⑦ 各ボタンに石を押し込める向きが1つ以上ある（押し込めないボタン＝解なし）。
 *   ⑧ tiles 層に見た目だけの地面タイルを混ぜていない／敵を置かない／ゲート 'T' も宝箱 'B' も無い
 *      （敵は enemy-ai.js tryEnemyPushStone で石を押す＝測定した倉庫番が別物になる）。
 *
 * 測定（§7-3 C）：4軸下限（L≥6・貪欲NG・deadlock>0・強制手率≤0.7）＋帯 40〜60
 *   ＋ I3（noEscape=0）＝どの到達状態からもワープに戻れる。
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    書き込みは scripts/migrate-key-room-d8.mjs。
 *
 * 使い方（outputs/blade-of-lumia/ で実行）:
 *   node scripts/generate-key-room-d8.mjs               # 全テンプレ
 *   node scripts/generate-key-room-d8.mjs v1            # 指定テンプレだけ
 *   GEOM_ONLY=1 node scripts/generate-key-room-d8.mjs   # 幾何 assert だけ（設計反復用）
 *   MAX_MEASURE=20 CAND_CAP=2000 node scripts/generate-key-room-d8.mjs
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ────────────────────────────────────────────────────────────
//   '#' 壁 / '.' 床 / 'S' ボタン（石の目標）/ 'K' 鍵
//   '>' ワープ（入口＝救済の出口）/ 'D' 鍵扉（ボス部屋へ・測定では壁として扱う）
//   ',' 安全地帯（前室）の床＝石が絶対に入れない区画（不変条件②。書き込み時は '.' に戻す）
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
//
// 前室（東の col8-9）は D4/D6 で実測 noEscape=0 を取った形をそのまま使う
//   ＝口は (3,7)→(3,8) と (6,7)→(6,8) の2つで、押し込み位置 (3,6)/(6,6) が壁∴石は入れない。
export const TEMPLATES = [
	{
		// v1：本体（rows1-8 / cols1-7）を千鳥ピラーで割り、ボタンを4隅寄りに散らした形。
		//   ・ボタン (1,1) 北西角 / (4,4) 中央 / (8,1) 南西角 / (8,7) 南東
		//     ＝石4本の搬送路が中央 (4,4) で必ず交差する（独立に運べない＝貪欲が通らない）。
		//   ・col3 が (2,3)(4,3)(5,3) の壁で3箇所欠けた縦の隔壁＝西区画と中央区画の
		//     行き来は (1,3)/(3,3)/(6,3)/(7,3) の隙間だけ＝石の搬送路が細い。
		//   ・(7,2)(7,4) の千鳥で南西角 (8,1) への持ち込みが直線にならない。
		name: 'v1',
		template: [
			'############',
			'#S...#..####',
			'#.#.#...####',
			'#.....#.,,##',
			'D..#S...#,##',
			'D..#.##K#,##',
			'#.....#.,,##',
			'#.#.#...#>##',
			'#S.....S#,##',
			'############',
		],
	},
];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const MAX_MEASURE = Number(process.env.MAX_MEASURE ?? 12);
const GEOM_ONLY = !!process.env.GEOM_ONLY;
// 石4は状態が桁で増える∴上限を env で動かせるようにする（超過した候補は件数を出す）。
const GUARD_MAX = Number(process.env.GUARD_MAX ?? 12000000);
// 逆算(pull-BFS)の展開上限。切ったら「どこまで見たか」をログに出す（黙って切らない）。
const PULL_CAP = Number(process.env.PULL_CAP ?? 4000000);

// L の帯（§7-4 の D8）＝40〜60。上限は §7-3 C の関門の上限そのもの。
const L_MIN = Number(process.env.L_MIN ?? 40);
const L_MAX = Number(process.env.L_MAX ?? 60);

// §3-2c（ユーザー確定）＝石は3〜4個。D8 は §7-4 で石4。
const STONE_COUNT = 4;

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
	let keyCell = null, warp = null;
	const doors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (ch === '#') { walls.add(key(r, c)); continue; }
		if (ch === 'D') { doors.push(key(r, c)); walls.add(key(r, c)); continue; }  // 鍵未所持＝壁
		floors.add(key(r, c));
		if (ch === 'S') buttons.push(key(r, c));
		if (ch === 'K') keyCell = key(r, c);
		if (ch === TILE.MAP_ENTER) { warp = key(r, c); safe.add(key(r, c)); }
		if (ch === SAFE_MARK) safe.add(key(r, c));
		if (DECOR_TILES.has(ch)) throw new Error(`見た目だけの地面タイル '${ch}' が (${r},${c}) にある`);
	}
	if (!keyCell) throw new Error('テンプレに鍵 K が無い');
	if (!warp) throw new Error('テンプレにワープ > が無い');
	if (grid.some((row) => row.includes(TILE.GATE)))
		throw new Error("この型（C 倉庫番・stonesPlaced）にゲート 'T' は置かない");
	if (grid.some((row) => row.includes('B')))
		throw new Error("宝箱 'B' は置かない（この部屋の chestContents は空＝開けられない宝箱になる／"
			+ '石を押せる規則が engine とソルバーで食い違う＝§7-6 手順9）');
	if (ENEMY_RE.test(template.join('')))
		throw new Error('敵を置いてはいけない（enemy-ai.js が石を押す＝測定した倉庫番が壊れる）');
	if (buttons.length !== STONE_COUNT) throw new Error(`ボタンは${STONE_COUNT}個（今 ${buttons.length}）`);
	if (doors.sort().join(' ') !== DOOR_CELLS.join(' '))
		throw new Error(`鍵扉は ${DOOR_CELLS.join(' ')} の2枚（今 ${doors.join(' ')}）`);
	return { grid, buttons, walls, floors, safe, keyCell, warp, doors };
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
	// ② 安全地帯（前室）へは外から石を押し込めない（＝石は永遠に入れない）
	if (!t.safe.has(t.warp)) throw new Error(`ワープ ${t.warp} が安全地帯に入っていない`);
	for (const x of t.safe) {
		const how = pushableInto(t, x, { fromOutsideSafeOnly: true });
		if (how) throw new Error(`安全地帯 ${x} へ外から石を押し込める（${how}）`
			+ '＝詰み救済のワープが塞がれ得る（ハードロック）');
	}
	// ③ 安全地帯は連結・本体との口が2つ以上
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
	// ④ 鍵扉の手前が床
	for (const a of DOOR_APPROACH) if (!t.floors.has(a)) throw new Error(`鍵扉の手前 ${a} が床でない`);
	// ⑦ 各ボタンに石を押し込める向きが1つ以上ある
	for (const b of t.buttons) {
		if (!pushableInto(t, b)) throw new Error(`ボタン ${b} へ石を押し込める向きが無い＝解なし`);
	}
	t.mouths = mouths;
	// ⑤ 石ゼロでワープから全要所へ歩ける
	const open = walkSet(t.warp, (k) => t.floors.has(k));
	for (const [label, cell] of [['鍵', t.keyCell],
		...t.buttons.map((b) => ['ボタン', b]), ...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!open.has(cell)) throw new Error(`石ゼロでもワープから ${label} ${cell} へ行けない`);
	}
	// 孤立した床（どこからも歩いて行けない死んだ区画）を弾く＝盤面の作り間違い検出
	for (const f of t.floors) if (!open.has(f)) throw new Error(`床 ${f} がワープから到達できない（孤立区画）`);
	// ⑥ 解けた状態（石が全ボタン上・以後ロックで不動）でも要所へ歩ける
	const solved = new Set(t.buttons);
	const afterSolve = walkSet(t.warp, (k) => t.floors.has(k) && !solved.has(k));
	for (const [label, cell] of [['鍵', t.keyCell], ...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!afterSolve.has(cell)) throw new Error(`解いた後（石がボタン上で固定）にワープから ${label} ${cell} へ行けない`);
	}
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から「引き」で初期配置候補を作る ────────
// D4 と同じ規則。石を置けない/置きたくないセル（安全地帯の全セル＝ワープ・前室の床、
// および鍵セル）を除いた床の上だけで引く。安全地帯を除くのは不変条件②の帰納法の前提
// （「石は初期に安全地帯に居ない」）そのもの。
// 石4は展開が桁で増える∴`PULL_CAP` で切る。切ったときは「引き距離いくつまで見たか」を返す
// （＝より深い候補を見ていない可能性を呼び出し側がログに出せる）。
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
		out.push({ stones, player: pStr, pulls: d });
	}
	out.sort((a, b) => a.pulls - b.pulls);
	return { cands: out, states: dist.size, truncatedAt };
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
 * 軸②の貪欲モデル（D4/D6 と同じ「押し単位のマクロ貪欲」）。
 * 1手単位のヒルクライムだと石の裏へ回り込む歩行が必ず評価値を悪化させる＝どんな倉庫番でも
 * 詰まって軸②が空虚になる∴歩行は自由・押しは石ポテンシャルを厳密に減らすものだけ許す。
 */
function makeGreedyPush(t) {
	const bpos = t.buttons.map(parse);
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	const perms = (xs) => xs.length <= 1 ? [xs]
		: xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
	const BPERM = perms(bpos.map((_, i) => i));   // 石4＝24通り（ボタンへの割り当ての最小和）
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
// migrate-key-room-d8.mjs がテンプレ解析・幾何 assert・測定を**そのまま再利用**できるよう
// （＝2箇所に規則を書いて食い違わせないよう）ライブラリとして import 可能にする。
// 直接実行のときだけ下の生成ループを回す。
const IS_MAIN = process.argv[1]?.endsWith('generate-key-room-d8.mjs') ?? false;
const only = IS_MAIN ? process.argv.slice(2)[0] : undefined;
const list = IS_MAIN ? (only ? TEMPLATES.filter((x) => x.name === only) : TEMPLATES) : [];
if (IS_MAIN && !list.length) throw new Error(`テンプレが無い: ${only}`);

for (const tpl of list) {
	const t = analyze(tpl.template);
	assertGeometry(t);
	console.log(`\n════ ${tpl.name} ════`);
	tpl.template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
	console.log(`  ボタン ${t.buttons.join(' / ')}  鍵 ${t.keyCell}  ワープ(入口) ${t.warp}  扉 ${t.doors.join(' / ')}`);
	console.log(`  床 ${t.floors.size} セル（うち安全地帯 ${t.safe.size}・測定では鍵扉は壁扱い＝鍵未所持）`);
	console.log(`  前室の口: ${t.mouths.join(' , ')}`);
	if (GEOM_ONLY) { console.log('  (GEOM_ONLY: assertGeometry を通過)'); continue; }

	// 逆算候補（同じ石配置は最小引き距離の1件に代表させる／逆再生できるものだけ）
	const pull = pullBFS(t);
	const seenStones = new Set();
	const cands = [];
	for (const c of pull.cands) {
		const sk = c.stones.join(';');
		if (seenStones.has(sk)) continue;
		if (!walkReachable(t, c.stones, c.player)) continue;
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
		if (!greedyFn(p.S, [p.start], p.goalTest)) insight.push(cand);
	}
	console.log(`  貪欲で解ける（軸②未達）${pool.length - insight.length} 件 / 軸②クリア ${insight.length} 件`);
	if (!insight.length) { console.log(`  ✗ ${tpl.name}：軸②（貪欲NG）を通る候補が無い`); continue; }

	// L と引き距離は単調対応しない（同じ引き距離でも配置次第で L が数十変わる）∴
	// 「深い側だけ」ではなく引き距離の分布全体から等間隔サンプルする（帯 40〜60 を見落とさない）。
	const maxMeasure = Number(process.env.MAX_MEASURE ?? MAX_MEASURE);
	const byPulls = [...insight].sort((a, b) => a.pulls - b.pulls);
	const sample = byPulls.length <= maxMeasure ? byPulls
		: Array.from({ length: maxMeasure },
			(_, i) => byPulls[Math.floor(i * byPulls.length / maxMeasure)]);
	if (byPulls.length > sample.length)
		console.log(`  ⚠️ フル測定は軸②クリア ${insight.length} 件から引き距離で等間隔サンプルした ${sample.length} 件だけ`
			+ `（MAX_MEASURE=${maxMeasure}）＝残り ${insight.length - sample.length} 件は未測定`);
	const passed = [];
	let tooBig = 0, escFail = 0, bandFail = 0, axisFail = 0;
	for (const cand of sample) {
		let m;
		try { m = measurePlacement(t, cand.stones, GUARD_MAX); }
		catch (e) { tooBig++; console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} → 状態超過/測定不能 (${e.message})`); continue; }
		const v = verdict(m);
		console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount} states=${m.states} noEsc=${m.noEscape} ${v.label}`);
		if (!v.pass) { axisFail++; continue; }
		if (m.noEscape) { escFail++; continue; }               // I3＝ワープに戻れない状態がある
		if (m.L < L_MIN || m.L > L_MAX) { bandFail++; continue; }  // §7-4 の帯 40〜60
		passed.push({ cand, m });
	}
	console.log(`  フル測定 ${sample.length} 件（状態超過 ${tooBig} / 4軸未達 ${axisFail}`
		+ ` / I3脱出不能 ${escFail} / 帯外 ${bandFail}）→ 採用可 ${passed.length} 件`);
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
