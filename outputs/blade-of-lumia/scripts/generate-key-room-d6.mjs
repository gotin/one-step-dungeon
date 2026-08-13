#!/usr/bin/env node
/**
 * generate-key-room-d6.mjs — D6 の鍵部屋（dungeon_6 / 1,0）を「倉庫番型②＝石3＋爆弾壁」
 * にするための盤面を逆算生成・測定する（PLAN 実行キュー 5.5f・PUZZLE-DESIGN §7-4）。
 *
 * generate-key-room-d4.mjs（倉庫番型①＝石3・純）との違い＝**道具が1つ混ざる合成型（D 型）**：
 *   ・ボタン3個のうち1個 (1,1) は**壊せる壁 '!' が喉になった1セルの袋（ポケット）**の中にある。
 *     ポケットの床の隣人は '!' ただ1つ∴そのボタンへ石を押し込む向きは
 *     「'!' の上に居る石を押す」だけ＝**爆弾で '!' を壊すまで石は絶対に届かない**。
 *     これは幾何で決まる（下の assertGeometry ②）＝静的に証明できる必須性。
 *   ・さらに PLAN 5.5f の要求どおり**動的にも**確かめる（I4 と同じ「壁を戻して再測定」）：
 *       - '!' → '#'（永久に壁）  ⇒ 解なし
 *       - '!' → '['（プレイヤーは踏めるが石は通れない・色スイッチの通行規則を流用）⇒ 解なし
 *         ＝「爆弾はプレイヤーの近道を開けているだけ」ではなく**石の搬送路**であることの証明。
 *       - '!' → '.'（最初から穴が空いている）⇒ 解ける（＝盤面自体は成立している）
 *   ・宝箱 'B' は置かない（この部屋に chestContents が無い＝実マップの通り）。
 *     ついでに D4 で回避した「'B' へ石を押せる実エンジン／押せないソルバー」の食い違いも無関係になる。
 *
 * この部屋固有の不変条件（assertGeometry が検査する）：
 *   ① リング（外周）＝孤島なので鍵扉 D(4,0)(5,0) 以外は全壁（ワープ '>' で入る）。
 *   ② 壊せる壁 '!' はちょうど1枚で、**ポケットのボタン**（床の隣人が '!' だけのボタン）が
 *      ちょうど1個ある＝そのボタンへの押し込みは必ず '!' を通る。
 *   ③ 爆弾を置ける足場：'!' を壁として歩いた到達集合の中に、'!' からユークリッド距離 ≤2 の
 *      セルが1つ以上ある（＝壊せない位置にある壁を作らない。AOE 半径2＝blade-solver.mjs）。
 *   ④ 破壊前（'!' を壁として）ワープから歩ける範囲＝**ポケットのボタンと '!' 以外の全床**。
 *      ＝爆弾を撃つ前でも部屋の他の部分は一切封鎖されない（入って詰まない）。
 *   ⑤ 破壊後（'!' を床として）ワープから全床へ歩ける。
 *   ⑥ 解けた状態（石が全ボタン上＝以後ロックで不動・'!' 破壊済み）でもワープから
 *      鍵と鍵扉の手前へ歩ける（解いた後に進めなくなる盤面を弾く）。
 *   ⑦ 安全地帯（前室）へ石が1個も入れない（D4 と同じ帰納法）。ワープ '>' は**詰み救済の
 *      唯一の出口**（踏むと隣室 1,1 へ出る→enterStage が未解決の石を初期位置へ戻す）∴
 *      塞がれると本当のハードロックになる（笛の resetStones は cave_1 の報酬＝D6 では未所持）。
 *      安全地帯 X に石が入る押しは「石 S=X-d → 行き先 X・プレイヤー P=X-2d」∴**S が
 *      安全地帯の外なら P が壁**を全 X・全方向で要求する（＋初期配置を安全地帯から除く）。
 *   ⑧ 安全地帯は連結で本体との口が2つ以上（1つだと口の手前に石が居座った瞬間に脱出できない）。
 *      ⚠️ 「口のセル自体を石が通れないようにする」静的強化は**採らない**＝それをやると口が
 *      袋小路になって本体から切れる。閉じ込めの検査は状態空間の noEscape=0（測定⑨）で行う。
 *   ⑨ 鍵扉の手前 (4,1)(5,1) が床／各ボタンに石を押し込める向きが1つ以上ある
 *      （'!' は破壊後＝床として見る）。
 *   ⑩ tiles 層に見た目だけの地面タイルを混ぜていない／ゲート 'T' を置かない／敵を置かない
 *      （敵は enemy-ai.js tryEnemyPushStone で**石を押す**＝測定した倉庫番が壊れる）。
 *
 * 測定（PUZZLE-DESIGN §7-3 C＋D）：4軸下限（L≥6・貪欲NG・deadlock>0・強制手率≤0.7）
 *   ＋関門の上限 L ≤ 60、さらに §7-4 の D6 の帯 **L 34〜39**。帯の根拠＝倉庫番3枚を
 *   進行順で単調に深くする：D4（石3・純）L=32 < D6（石3＋爆弾壁）< D8（石4）の帯 40〜60。
 *   ∴上端は D8 の帯の下限 40 の**手前**で切る（実測では L=43 の候補も出たが、それだと
 *   D6 が D8 の帯に食い込んで「後のダンジョンの方が浅い」が起き得る）。
 *   ＋ I3（noEscape=0）＝どの到達状態からもワープに戻れる（石で自分を閉じ込めない）。
 *   ＋ I4（道具の必須性）＝上記の3通りの壁差し替えで解の有無が期待どおりに変わる。
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    書き込みは scripts/migrate-key-room-d6.mjs。
 *
 * 使い方（outputs/blade-of-lumia/ で実行）:
 *   node scripts/generate-key-room-d6.mjs            # 全テンプレ
 *   node scripts/generate-key-room-d6.mjs v1         # 指定テンプレだけ
 *   GEOM_ONLY=1 node scripts/generate-key-room-d6.mjs   # 幾何 assert だけ（設計反復用）
 *   MAX_MEASURE=20 CAND_CAP=2000 node scripts/generate-key-room-d6.mjs
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ────────────────────────────────────────────────────────────
//   '#' 壁 / '.' 床 / 'S' ボタン（石の目標）/ 'K' 鍵 / '!' 壊せる壁（爆弾）
//   '>' ワープ（入口＝救済の出口）/ 'D' 鍵扉（ボス部屋へ・測定では壁として扱う）
//   ',' 安全地帯（前室）の床＝石が絶対に入れない区画（不変条件⑦。書き込み時は '.' に戻す）
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
export const TEMPLATES = [
	{
		// v1：D4 v2（東列を「石が入れない前室」にしたピラー部屋）を土台に、
		// 北西の角のボタンを**爆弾壁の袋（ポケット）**へ移した形。
		//   ・ポケット＝ボタン (1,1)・喉 (1,2)='!'・(2,1) は壁∴(1,1) の床の隣人は '!' だけ。
		//     石をここへ運ぶには「行1の廊下 (1,3)〜(1,7) を西へ押して (1,2) へ入れ、
		//     (1,3) から左へもう1回押す」しかない＝爆弾を撃つまで着手すらできない。
		//   ・前室＝(3,8)(3,9)(4,9)(5,9)(6,8)(6,9)(7,9)>(8,9)。口は (3,7)→(3,8) と
		//     (6,7)→(6,8) の2つで、押し込み位置 (3,6)/(6,6) は壁∴石は前室へ入れない。
		//   ・ピラー (2,1)(2,3)(2,6)(4,3)(5,5)(6,2)(3,6)(6,6) は千鳥＝真っ直ぐ運べるレーンが無い。
		//   ・鍵 (5,7) は本体の東端＝最初から見える（何をすべきかが見える＝§7-3 B③ の精神）。
		name: 'v1',
		template: [
			'############',
			'#S!.....####',
			'##.#..#.####',
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
const GEOM_ONLY = !!process.env.GEOM_ONLY;
const MAX_MEASURE = Number(process.env.MAX_MEASURE ?? 12);

// L の帯（§7-4 の D6）＝34〜39。関門の上限 L≤60（§7-3 C）より内側で、
// D4（L=32）より深く D8（帯 40〜60）より浅い＝倉庫番の難度が進行順で単調に上がる。
const L_MIN = Number(process.env.L_MIN ?? 34);
const L_MAX = Number(process.env.L_MAX ?? 39);

// 爆弾の AOE（blade-solver.mjs：プレイヤーのセルから半径2の円内の未破壊 '!' を壊す）。
const BOMB_RADIUS = 2;

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
	const buttons = [], walls = new Set(), floors = new Set(), safe = new Set(), breaks = [];
	let keyCell = null, warp = null;
	const doors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (ch === '#') { walls.add(key(r, c)); continue; }
		if (ch === 'D') { doors.push(key(r, c)); walls.add(key(r, c)); continue; }  // 鍵未所持＝壁
		// 壊せる壁は「破壊後の床」＝floors に入れる（幾何の帰納法・pull-BFS は破壊後の世界で考える）。
		// 破壊前を見る検査だけが breaks を壁として扱う（下の walkSet の pass に渡す）。
		if (ch === TILE.BREAKABLE_WALL) { breaks.push(key(r, c)); floors.add(key(r, c)); continue; }
		floors.add(key(r, c));
		if (ch === 'S') buttons.push(key(r, c));
		if (ch === 'K') keyCell = key(r, c);
		if (ch === 'B') throw new Error('この部屋に宝箱 B は置かない（chestContents が無い）');
		if (ch === TILE.MAP_ENTER) { warp = key(r, c); safe.add(key(r, c)); }
		if (ch === SAFE_MARK) safe.add(key(r, c));
		if (DECOR_TILES.has(ch)) throw new Error(`見た目だけの地面タイル '${ch}' が (${r},${c}) にある`);
	}
	if (!keyCell) throw new Error('テンプレに鍵 K が無い');
	if (!warp) throw new Error('テンプレにワープ > が無い');
	if (grid.some((row) => row.includes(TILE.GATE)))
		throw new Error("この型（倉庫番＋爆弾壁）にゲート 'T' は置かない");
	if (ENEMY_RE.test(template.join('')))
		throw new Error('敵を置いてはいけない（enemy-ai.js が石を押す＝測定した倉庫番が壊れる）');
	// §3-2c（ユーザー確定）＝石は3〜4個。D6 は §7-4 で石3。
	if (buttons.length !== 3) throw new Error(`ボタンは3個（今 ${buttons.length}）`);
	if (breaks.length !== 1) throw new Error(`壊せる壁 '!' はちょうど1枚（今 ${breaks.length}）`);
	if (doors.sort().join(' ') !== DOOR_CELLS.join(' '))
		throw new Error(`鍵扉は ${DOOR_CELLS.join(' ')} の2枚（今 ${doors.join(' ')}）`);
	return { grid, buttons, walls, floors, safe, keyCell, warp, doors, breakCell: breaks[0] };
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

/** 破壊前の通行判定（'!' は壁）。 */
const openBeforeBomb = (t) => (k) => t.floors.has(k) && k !== t.breakCell;

const dist2 = (a, b) => {
	const [ar, ac] = parse(a), [br, bc] = parse(b);
	return Math.sqrt((ar - br) ** 2 + (ac - bc) ** 2);
};

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
	// ② ポケット＝「床の隣人が壊せる壁 '!' ただ1つ」のボタンがちょうど1個
	//    ⇒ そのボタンへ石を押し込む向きは必ず '!' を経由する（＝爆弾を壊さないと解なし）。
	const pockets = t.buttons.filter((b) => {
		const [br, bc] = parse(b);
		const nb = DIRS.map(([dr, dc]) => key(br + dr, bc + dc)).filter((k) => t.floors.has(k));
		return nb.length === 1 && nb[0] === t.breakCell;
	});
	if (pockets.length !== 1)
		throw new Error(`ポケットのボタン（床の隣人が '!' だけ）が ${pockets.length} 個（1個必要）`
			+ '＝爆弾壁が石の搬送路の喉になっていない');
	t.pocketButton = pockets[0];
	if (t.safe.has(t.breakCell)) throw new Error(`壊せる壁 ${t.breakCell} が安全地帯の中にある`);
	// ③ 爆弾を置ける足場が破壊前の到達範囲にある（AOE 半径2）
	const before = walkSet(t.warp, openBeforeBomb(t));
	const spots = [...before].filter((k) => dist2(k, t.breakCell) <= BOMB_RADIUS);
	if (!spots.length)
		throw new Error(`壊せる壁 ${t.breakCell} を爆破できる足場（距離≤${BOMB_RADIUS}）へ破壊前に歩けない`);
	t.bombSpots = spots.sort();
	// ④ 破壊前に歩けない床は「ポケットのボタンと '!' 」だけ
	for (const f of t.floors) {
		const sealed = f === t.pocketButton || f === t.breakCell;
		if (sealed === before.has(f)) {
			throw new Error(sealed
				? `破壊前に ${f} へ歩けてしまう（ポケットが封じられていない）`
				: `破壊前にワープから ${f} へ歩けない（爆弾前に部屋が封鎖される）`);
		}
	}
	// ⑤ 破壊後は全床へ歩ける
	const after = walkSet(t.warp, (k) => t.floors.has(k));
	for (const f of t.floors) if (!after.has(f)) throw new Error(`破壊後もワープから ${f} へ歩けない`);
	// ⑦ 安全地帯（前室）へは外から石を押し込めない（＝石は永遠に入れない）
	if (!t.safe.has(t.warp)) throw new Error(`ワープ ${t.warp} が安全地帯に入っていない`);
	for (const x of t.safe) {
		const how = pushableInto(t, x, { fromOutsideSafeOnly: true });
		if (how) throw new Error(`安全地帯 ${x} へ外から石を押し込める（${how}）`
			+ '＝詰み救済のワープが塞がれ得る（ハードロック）');
	}
	// ⑧ 安全地帯は連結・本体との口が2つ以上
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
	t.mouths = mouths;
	// ⑨ 鍵扉の手前が床／各ボタンに押し込める向きがある／鍵セルの素性
	for (const a of DOOR_APPROACH) if (!t.floors.has(a)) throw new Error(`鍵扉の手前 ${a} が床でない`);
	for (const b of t.buttons) {
		if (!pushableInto(t, b)) throw new Error(`ボタン ${b} へ石を押し込める向きが無い＝解なし`);
	}
	if (t.safe.has(t.keyCell)) throw new Error(`鍵 ${t.keyCell} が安全地帯の中にある（本体側に置く）`);
	if (t.buttons.includes(t.keyCell)) throw new Error(`鍵 ${t.keyCell} がボタンと同じセル`);
	// ⑥ 解けた状態（石が全ボタン上・以後ロックで不動）でも要所へ歩ける
	const solved = new Set(t.buttons);
	const afterSolve = walkSet(t.warp, (k) => t.floors.has(k) && !solved.has(k));
	for (const [label, cell] of [['鍵', t.keyCell], ...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!afterSolve.has(cell)) throw new Error(`解いた後（石がボタン上で固定）にワープから ${label} ${cell} へ行けない`);
	}
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から「引き」で初期配置候補を作る ────────
// generate-key-room-d4.mjs と同じ規則。石を置けない/置きたくないセル（安全地帯の全セル
// ＝ワープ・前室の床、および鍵セル）を除いた床の上だけで引く。
// ⚠️ 壊せる壁 '!' のセルは**引きの経路としては通す**（破壊後の世界で考える＝石はそこを通る）が、
//    **初期配置としては禁じる**（壁の中に石を置けない）。後段の filter で落とす。
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
		if (stones.includes(t.breakCell)) continue;                // 壁の中には石を置けない
		out.push({ stones, player: pStr, pulls: d });
	}
	return out.sort((a, b) => a.pulls - b.pulls);
}

/** 破壊後の世界で、ワープから目標セルへ歩いて行けるか（初期配置の石を壁として）。 */
function walkReachable(t, stones, target) {
	const blocked = new Set(stones);
	if (!t.floors.has(target) || blocked.has(target)) return false;
	return walkSet(t.warp, (k) => t.floors.has(k) && !blocked.has(k)).has(target);
}

/** その初期配置で「爆弾を撃てる足場」へ破壊前に歩けるか（石が足場を塞いだ配置を落とす）。 */
function bombSpotReachable(t, stones) {
	const blocked = new Set(stones);
	const pass = (k) => t.floors.has(k) && k !== t.breakCell && !blocked.has(k);
	if (!pass(t.warp) && t.warp !== t.breakCell) return false;
	const seen = walkSet(t.warp, pass);
	return t.bombSpots.some((s) => seen.has(s));
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
/**
 * 測定用タイル：テンプレそのまま＋石 '*'。
 *   ・鍵扉 'D' は鍵未所持＝壁として測る（ソルバーの 'D' は解ける関門扱いで通ってしまう）。
 *   ・安全地帯マーク ',' はテンプレ専用の注釈＝実タイルの床 '.' に戻す。
 *   ・breakAs を渡すと '!' のセルをその文字に差し替える（I4 の動的検査＝壁を戻して再測定）。
 */
export function buildTiles(t, stonePlacement, breakAs = null) {
	const stoneSet = new Set(stonePlacement);
	const tiles = t.grid.map((row) => [...row]);
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (tiles[r][c] === 'D') tiles[r][c] = TILE.WALL;
		else if (tiles[r][c] === SAFE_MARK) tiles[r][c] = TILE.FLOOR;
		if (breakAs && key(r, c) === t.breakCell) tiles[r][c] = breakAs;
		if (stoneSet.has(key(r, c))) tiles[r][c] = TILE.STONE;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	return { tiles, bg };
}

/**
 * 軸②の貪欲モデル（generate-key-room-d4.mjs と同じ「押し単位のマクロ貪欲」）。
 * 1手単位のヒルクライムだと石の裏へ回り込む歩行が必ず評価値を悪化させる＝どんな倉庫番でも
 * 詰まって軸②が空虚になる∴歩行は自由・押しは石ポテンシャルを厳密に減らすものだけ許す。
 * ⚠️ 爆弾（'!' の破壊）は石を動かさない手＝「歩行」と同じ扱いで自由に許す（破壊しないと
 *    ポケットへ押せない∴禁じると貪欲が常に詰まって軸②が空虚になる）。
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
	// 石を動かさない手（歩行・爆弾）はマクロの「同じ節」の中に閉じる∴石配置＋破壊ビットで括る。
	const macroKey = (state) => { const f = state.split('|'); return `${f[1]}|${f[3]}`; };
	const microKey = (state) => { const f = state.split('|'); return `${f[1]}|${f[3]}`; };
	return (S, starts, goalTest) => {
		const q = [...starts];
		const seen = new Set(q.map(macroKey));
		for (let i = 0; i < q.length; i++) {
			const cur = q[i];
			const curMicro = microKey(cur);
			const p0 = potential(stonesOf(cur));
			const walk = new Set([cur]), wq = [cur];
			for (let j = 0; j < wq.length; j++) {
				if (goalTest(wq[j])) return true;
				for (const nx of S.nextStates(wq[j])) {
					// 石配置が変わらない手（歩行・爆弾）は「同じ節の中の移動」＝自由。
					if (microKey(nx) === curMicro || stonesOf(nx).join(';') === stonesOf(cur).join(';')) {
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
function buildProblem(t, stonePlacement, breakAs = null) {
	const { tiles, bg } = buildTiles(t, stonePlacement, breakAs);
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

/**
 * I4（道具の必須性）の動的検査：'!' を別のタイルに差し替えて「解けるか」だけを BFS で見る。
 *   breakAs='#' … 永久に壁          → 解けてはいけない
 *   breakAs='[' … プレイヤーは踏めるが石は通れない（色スイッチの通行規則）
 *                                    → 解けてはいけない（＝壁は**石の**搬送路の喉）
 *   breakAs='.' … 最初から穴        → 解けなければならない（盤面自体は成立している）
 * @returns {{solvable:boolean, L:number|null, states:number}}
 */
export function solvableWith(t, stonePlacement, breakAs, guardMax = 9000000) {
	const { S, start, goalTest } = buildProblem(t, stonePlacement, breakAs);
	const dist = new Map([[start, 0]]);
	const q = [start];
	for (let i = 0; i < q.length; i++) {
		if (i > guardMax) throw new Error('状態空間が大きすぎる');
		if (goalTest(q[i])) return { solvable: true, L: dist.get(q[i]), states: dist.size };
		for (const nx of S.nextStates(q[i])) {
			if (dist.has(nx)) continue;
			dist.set(nx, dist.get(q[i]) + 1);
			q.push(nx);
		}
	}
	return { solvable: false, L: null, states: dist.size };
}

/** I4 の3通りをまとめて確かめる（migrate 側も同じ関数を使う＝規則を2箇所に書かない）。 */
export function assertBombRequired(t, stonePlacement) {
	const asWall = solvableWith(t, stonePlacement, TILE.WALL);
	if (asWall.solvable)
		throw new Error(`'!' を壁 '#' に固定しても解けてしまう（L=${asWall.L}）＝爆弾が必須でない`);
	const asSwitch = solvableWith(t, stonePlacement, TILE.SWITCH_RED);
	if (asSwitch.solvable)
		throw new Error(`'!' を「歩けるが石は通れない」タイルにしても解けてしまう（L=${asSwitch.L}）`
			+ '＝爆弾はプレイヤーの近道を開けているだけで、石の搬送路になっていない');
	const asFloor = solvableWith(t, stonePlacement, TILE.FLOOR);
	if (!asFloor.solvable)
		throw new Error("'!' を床 '.' にしても解けない＝盤面（石の配置）そのものが成立していない");
	return { wall: asWall, stoneBlocked: asSwitch, floor: asFloor };
}

// ── 実行 ────────────────────────────────────────────────────────────────────
// migrate-key-room-d6.mjs がテンプレ解析・幾何 assert・測定・I4 を**そのまま再利用**できるよう
// （＝2箇所に規則を書いて食い違わせないよう）ライブラリとして import 可能にする。
const IS_MAIN = process.argv[1]?.endsWith('generate-key-room-d6.mjs') ?? false;
const only = IS_MAIN ? process.argv.slice(2)[0] : undefined;
const list = IS_MAIN ? (only ? TEMPLATES.filter((x) => x.name === only) : TEMPLATES) : [];
if (IS_MAIN && !list.length) throw new Error(`テンプレが無い: ${only}`);

for (const tpl of list) {
	const t = analyze(tpl.template);
	assertGeometry(t);
	console.log(`\n════ ${tpl.name} ════`);
	tpl.template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
	console.log(`  ボタン ${t.buttons.join(' / ')}（ポケット ${t.pocketButton}・喉 '!' ${t.breakCell}）`);
	console.log(`  鍵 ${t.keyCell}  ワープ(入口) ${t.warp}  扉 ${t.doors.join(' / ')}`);
	console.log(`  爆弾を置ける足場（破壊前に到達可・距離≤${BOMB_RADIUS}）: ${t.bombSpots.join(' ')}`);
	console.log(`  前室の口: ${t.mouths.join(' ')}`);
	console.log(`  床 ${t.floors.size} セル（測定では鍵扉は壁扱い＝鍵未所持）`);
	if (GEOM_ONLY) { console.log('  (GEOM_ONLY: assertGeometry を通過)'); continue; }

	// 逆算候補（同じ石配置は最小引き距離の1件に代表させる／逆再生できるものだけ）
	const seenStones = new Set();
	const cands = [];
	let noBombSpot = 0;
	for (const c of pullBFS(t)) {
		const sk = c.stones.join(';');
		if (seenStones.has(sk)) continue;
		if (!walkReachable(t, c.stones, c.player)) continue;
		seenStones.add(sk);
		if (!bombSpotReachable(t, c.stones)) { noBombSpot++; continue; }   // 石が爆破の足場を塞ぐ配置
		cands.push(c);
	}
	console.log(`  石3配置候補: ${cands.length} 通り（引き距離 ${cands[0]?.pulls}〜${cands[cands.length - 1]?.pulls}`
		+ `／爆破の足場を石が塞ぐ配置 ${noBombSpot} 件を除外）`);

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
	if (insight.length > sample.length) {
		console.log(`  ⚠️ フル測定は ${insight.length} → ${sample.length} 件に間引き（MAX_MEASURE=${maxMeasure}・`
			+ `${step} 件ごと）＝全候補を測っていない`);
	}
	const passed = [];
	let tooBig = 0, escFail = 0, bandFail = 0, i4Fail = 0;
	for (const cand of sample) {
		let m;
		try { m = measurePlacement(t, cand.stones, 9000000); }
		catch { tooBig++; continue; }
		const v = verdict(m);
		console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount} states=${m.states} noEsc=${m.noEscape} ${v.label}`);
		if (!v.pass) continue;
		if (m.noEscape) { escFail++; continue; }               // I3＝ワープに戻れない状態がある
		if (m.L < L_MIN || m.L > L_MAX) { bandFail++; continue; }  // §7-4 の帯 34〜39
		let i4;
		try { i4 = assertBombRequired(t, cand.stones); }
		catch (e) { console.log(`      ✗ I4: ${e.message}`); i4Fail++; continue; }
		console.log(`      I4 OK（'#'固定→解なし・'石だけ不可'→解なし・'.'→L=${i4.floor.L}）`);
		passed.push({ cand, m, i4 });
	}
	console.log(`  フル測定 ${sample.length} 件（状態超過 ${tooBig} / I3脱出不能 ${escFail} / 帯外 ${bandFail}`
		+ ` / I4未達 ${i4Fail}）→ 採用可 ${passed.length} 件`);
	if (!passed.length) { console.log(`  ✗ ${tpl.name}：帯 ${L_MIN}〜${L_MAX} の合格盤面が見つからず（テンプレ調整）`); continue; }

	// 帯の中で最も深く、同じ深さなら最短解が最も細いものを採る。
	const num = (v) => (typeof v === 'number' ? v : Infinity);
	passed.sort((a, b) => b.m.L - a.m.L || num(a.m.solCount) - num(b.m.solCount));
	const { cand, m, i4 } = passed[0];
	console.log(`  ✅ 採用 石 ${cand.stones.join(' ')}（引き${cand.pulls}）→ L=${m.L} 貪欲NG deadlock=${m.deadlocks}`
		+ ` 強制手率=${m.forcedRatio} 最短解本数=${m.solCount} 状態=${m.states} 脱出不能=${m.noEscape}`
		+ ` 爆弾必須（'.'なら L=${i4.floor.L}）`);
	const { tiles } = buildTiles(t, cand.stones);
	// 表示は実際に書き込む形（鍵扉 'D' は戻す・安全地帯マークは buildTiles で '.' 済み）
	const shown = tiles.map((row, r) => row.map((ch, c) => (DOOR_CELLS.includes(key(r, c)) ? 'D' : ch)).join(''));
	console.log('  ── 採用盤面 ──');
	shown.forEach((row, r) => console.log('    ', String(r).padStart(2), row));
	console.log(`  ── migrate 用 ── STONES=${cand.stones.join(' ')}  ENTRY=${t.warp}  L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount}`);
}
