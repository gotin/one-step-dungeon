#!/usr/bin/env node
/**
 * generate-key-room-d6.mjs — D6 の鍵部屋（dungeon_6 / 1,0）「朽ち根の環」の盤面を
 * 逆算生成・測定する（PLAN 実行キュー 47 第2陣 2室目・2026-10-12 作り直し）。
 *
 * ■ なぜ作り直したか（キュー47）
 *   旧盤面（キュー 5.5f）は D4 `1,0` の「柱の林＋東列の前室」とほぼ同じ骨組みで、北西の角の
 *   ボタンを爆弾壁の袋へ移しただけだった（内側で一致するセルが D4↔D6 で 26）。
 *   ユーザー判定（2026-10-12）＝D4 は見本として残し、D6 は別物に作り直す。主題はユーザー選択
 *   「朽ち根の環」。
 *
 * ■ 朽ち根の環（設計の芯）
 *   ・部屋の真ん中に聖樹の大きな根（木 't' の塊）。石は根のまわりの環を回して運ぶ。
 *   ・根には朽ちたところ（壊せる壁 '!'）が2つある：
 *       (a) **根を貫く近道**＝根の中を通る幅1の溝の栓。環を回るだけでは石が届かない
 *           （角で詰む／押す側に回れない）ボタンへ、溝を真っ直ぐ通して送る。
 *       (b) **袋の喉**＝床の隣人が '!' だけのボタン（ポケット）。壊さないと石は絶対に入らない。
 *   ・入口のワープは根の洞（うろ）の中＝石が絶対に入れない安全地帯。洞の口は根の溝に面して
 *     いて、溝の向こう側は根（木）∴溝の石を洞へ押し込む立ち位置が無い（幾何で保証）。
 *   ・D4（柱の林・純倉庫番）とは骨組みが別物＝「環と溝」。D8（石4・純）とも別。
 *
 * この部屋固有の不変条件（assertGeometry が検査する）：
 *   ① リング（外周）＝孤島なので鍵扉 D(4,0)(5,0) 以外は全壁（ワープ '>' で入る）。
 *   ② ポケットのボタン（床の隣人が '!' ただ1つ）がちょうど1個。
 *      それ以外の '!' は「近道」＝ボタンの隣ではない。
 *   ③ 壊せる壁どうしは離す＝1発の爆風（半径2）で2枚同時に壊せる床が無い
 *      （＝爆弾を2回、別の場所で使わせる）。
 *   ④ どの '!' にも、壊す前（'!' を全部壁として）にワープから歩ける爆破の足場（距離≤2）がある。
 *   ⑤ 壊す前に歩けない床は「ポケットのボタンと '!' のセル」だけ＝爆弾前に部屋が封鎖されない。
 *   ⑥ 全部壊した後はワープから全床へ歩ける。
 *   ⑦ 解けた状態（石が全ボタン上＝以後ロックで不動）でもワープから鍵と鍵扉の手前へ歩ける。
 *   ⑧ 安全地帯（洞）へ石が1個も入れない（外から押し込む押し手の立ち位置が必ず壁＝帰納法）。
 *      洞は連結で本体との口が2つ以上（1つだと口の手前に石が居座った瞬間に出られない）。
 *   ⑨ 鍵扉の手前 (4,1)(5,1) が床／各ボタンへ石を押し込める向きが1つ以上ある。
 *   ⑩ 見た目だけの地面タイルを混ぜない／ゲート 'T' を置かない／敵を置かない
 *      （敵は enemy-ai.js tryEnemyPushStone で**石を押す**＝測定した倉庫番が壊れる）。
 *
 * 測定（PUZZLE-DESIGN §7-3 C＋B）：4軸下限（L≥6・貪欲NG・deadlock>0・強制手率≤0.7）
 *   ＋§7-4 の D6 の帯 **L 34〜39**（D4 の L=32 より深く、D8 の帯 40〜60 より浅い＝倉庫番3室の
 *   難しさが進行順に上がる。§7-6 手順11＝帯は排他）。
 *   ＋I3（noEscape=0）＝どの到達状態からもワープに戻れる。
 *   ＋I4（道具の必須性）＝**壁ごとに**：その '!' を '#' に固定→解なし／「歩けるが石は通れない」
 *     タイルに差し替え→解なし（＝その壁は**石の**搬送路）。全部 '.' にすると解ける。
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    書き込みは scripts/migrate-d6-1-0-rotten-roots.mjs（この生成器の関数をそのまま import する）。
 *
 * 使い方（outputs/blade-of-lumia/ で実行）:
 *   node scripts/generate-key-room-d6.mjs            # 全テンプレ
 *   node scripts/generate-key-room-d6.mjs r1         # 指定テンプレだけ
 *   GEOM_ONLY=1 node scripts/generate-key-room-d6.mjs   # 幾何 assert だけ（設計反復用）
 *   MAX_MEASURE=20 CAND_CAP=2000 node scripts/generate-key-room-d6.mjs
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ────────────────────────────────────────────────────────────
//   '#' 壁 / 't' 根（木）/ '.' 床 / 'S' ボタン（石の目標）/ 'K' 鍵 / '!' 朽ちた根（爆弾で壊れる）
//   '>' ワープ（入口＝救済の出口）/ 'D' 鍵扉（ボス部屋へ・測定では壁として扱う）
//   ',' 安全地帯（洞）の床＝石が絶対に入れない区画（不変条件⑧。書き込み時は '.' に戻す）
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
// 採らなかった版の教訓（2026-10-12）：
//   r1＝環が全周で幅2・洞の口は2つとも溝に面していた → 溝に石が縦2個並ぶと両方の口が塞がり、
//       外に居るとワープへ戻れない（noEscape 3928）。状態 600万超で測るのも重い（1件 約1分）。
//   r2＝洞の口の1つを東の環（押す立ち位置が根になる幅1の所）へ移した。だが環が幅2のままだと
//       石が角を曲がって南のボタンへ回れる＝近道の朽ち根が要らない。
//   r3（採用）＝南の通り（行8）と西・東の角を幅1にした＝石は角を曲がれない（押す側が壁）∴南のボタン
//       (8,5) へ石を送る道は根を貫く溝（列5）だけ。床 55・状態 約217万。
export const TEMPLATES = [
	{
		name: 'r3',
		template: [
			'############',
			'#........!S#',
			'#.S.......t#',
			'#..tt!ttt..#',
			'D..tt.,>t.t#',
			'D..tt.,,,.t#',
			'#..tt.ttt..#',
			'#.ttt.tttt.#',
			'#....S..K..#',
			'############',
		],
	},
];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const GEOM_ONLY = !!process.env.GEOM_ONLY;
const MAX_MEASURE = Number(process.env.MAX_MEASURE ?? 12);

// L の帯（§7-4 の D6）＝34〜39。
export const L_MIN = Number(process.env.L_MIN ?? 34);
export const L_MAX = Number(process.env.L_MAX ?? 39);

// 爆弾の AOE（blade-solver.mjs／game/projectile.js blastCells：中心から半径2の円）。
export const BOMB_RADIUS = 2;

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);
// 敵タイル（この部屋には置かない＝敵が石を押す）。
const ENEMY_RE = /[WECFVXZALNJOUGIθμαβξζφδσλπηωψΓ]/;

export const DOOR_CELLS = ['4,0', '5,0'];
const DOOR_APPROACH = ['4,1', '5,1'];
// 安全地帯（洞）の床を宣言するテンプレ専用マーク。実タイルには存在しない＝書き込み時に '.' へ。
const SAFE_MARK = ',';
// 歩けない地形（壁・根）。
const SOLID = new Set(['#', TILE.TREE]);

export function analyze(template) {
	const grid = template.map((row) => [...row]);
	if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
		throw new Error(`テンプレは ${ROWS}x${COLS} 必要`);
	const buttons = [], floors = new Set(), safe = new Set(), breaks = [];
	let keyCell = null, warp = null;
	const doors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (SOLID.has(ch)) continue;
		if (ch === 'D') { doors.push(key(r, c)); continue; }  // 鍵未所持＝壁
		// 壊せる壁は「破壊後の床」＝floors に入れる（幾何の帰納法・pull-BFS は破壊後の世界で考える）。
		// 破壊前を見る検査だけが breaks を壁として扱う。
		if (ch === TILE.BREAKABLE_WALL) { breaks.push(key(r, c)); floors.add(key(r, c)); continue; }
		floors.add(key(r, c));
		if (ch === 'S') buttons.push(key(r, c));
		else if (ch === 'K') keyCell = key(r, c);
		else if (ch === TILE.MAP_ENTER) { warp = key(r, c); safe.add(key(r, c)); }
		else if (ch === SAFE_MARK) safe.add(key(r, c));
		else if (ch === 'B') throw new Error('この部屋に宝箱 B は置かない（報酬は鍵だけ）');
		else if (DECOR_TILES.has(ch)) throw new Error(`見た目だけの地面タイル '${ch}' が (${r},${c}) にある`);
		else if (ch !== '.') throw new Error(`テンプレに想定外の文字 '${ch}' が (${r},${c}) にある`);
	}
	if (!keyCell) throw new Error('テンプレに鍵 K が無い');
	if (!warp) throw new Error('テンプレにワープ > が無い');
	if (ENEMY_RE.test(template.join('')))
		throw new Error('敵を置いてはいけない（enemy-ai.js が石を押す＝測定した倉庫番が壊れる）');
	// §3-2c（ユーザー確定）＝石は3〜4個。D6 は §7-4 で石3。
	if (buttons.length !== 3) throw new Error(`ボタンは3個（今 ${buttons.length}）`);
	if (breaks.length !== 2) throw new Error(`朽ちた根 '!' は2枚（近道と袋の喉・今 ${breaks.length}）`);
	if (doors.sort().join(' ') !== DOOR_CELLS.join(' '))
		throw new Error(`鍵扉は ${DOOR_CELLS.join(' ')} の2枚（今 ${doors.join(' ')}）`);
	return { grid, buttons, floors, safe, keyCell, warp, doors, breaks };
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
	// ② ポケット＝「床の隣人が '!' ただ1つ」のボタンがちょうど1個。残りの '!' が近道。
	const floorNbrs = (k) => {
		const [r, c] = parse(k);
		return DIRS.map(([dr, dc]) => key(r + dr, c + dc)).filter((n) => t.floors.has(n));
	};
	const pockets = t.buttons.filter((b) => {
		const nb = floorNbrs(b);
		return nb.length === 1 && t.breaks.includes(nb[0]);
	});
	if (pockets.length !== 1)
		throw new Error(`ポケットのボタン（床の隣人が '!' だけ）が ${pockets.length} 個（1個必要）`);
	t.pocketButton = pockets[0];
	t.pocketBreak = floorNbrs(t.pocketButton)[0];
	t.cutBreaks = t.breaks.filter((b) => b !== t.pocketBreak);
	for (const b of t.cutBreaks) {
		if (t.buttons.some((s) => floorNbrs(s).includes(b)))
			throw new Error(`近道の '!' ${b} がボタンの隣にある（袋の喉と役が重なる）`);
	}
	for (const b of t.breaks) if (t.safe.has(b)) throw new Error(`壊せる壁 ${b} が安全地帯の中にある`);
	// ③ 1発の爆風で2枚同時に壊せる床が無い
	for (const f of t.floors) {
		const hit = t.breaks.filter((b) => dist2(f, b) <= BOMB_RADIUS);
		if (hit.length > 1) throw new Error(`${f} に置いた爆弾1発で ${hit.join(' と ')} が同時に壊れる`);
	}
	// ④ どの '!' にも、壊す前に歩ける爆破の足場がある
	const before = walkSet(t.warp, (k) => t.floors.has(k) && !t.breaks.includes(k));
	t.bombSpots = {};
	for (const b of t.breaks) {
		const spots = [...before].filter((k) => dist2(k, b) <= BOMB_RADIUS).sort();
		if (!spots.length) throw new Error(`壊せる壁 ${b} を爆破できる足場（距離≤${BOMB_RADIUS}）へ壊す前に歩けない`);
		t.bombSpots[b] = spots;
	}
	// ⑤ 壊す前に歩けない床は「ポケットのボタンと '!'」だけ
	for (const f of t.floors) {
		const sealed = f === t.pocketButton || t.breaks.includes(f);
		if (sealed === before.has(f)) {
			throw new Error(sealed
				? `壊す前に ${f} へ歩けてしまう（ポケットが封じられていない）`
				: `壊す前にワープから ${f} へ歩けない（爆弾前に部屋が封鎖される）`);
		}
	}
	// ⑥ 全部壊した後は全床へ歩ける
	const after = walkSet(t.warp, (k) => t.floors.has(k));
	for (const f of t.floors) if (!after.has(f)) throw new Error(`壊した後もワープから ${f} へ歩けない`);
	// ⑧ 安全地帯（洞）へは外から石を押し込めない（＝石は永遠に入れない）
	if (!t.safe.has(t.warp)) throw new Error(`ワープ ${t.warp} が安全地帯に入っていない`);
	for (const x of t.safe) {
		const how = pushableInto(t, x, { fromOutsideSafeOnly: true });
		if (how) throw new Error(`安全地帯 ${x} へ外から石を押し込める（${how}）`
			+ '＝詰み救済のワープが塞がれ得る（ハードロック）');
	}
	const safeWalk = walkSet(t.warp, (k) => t.safe.has(k));
	for (const x of t.safe) if (!safeWalk.has(x)) throw new Error(`安全地帯 ${x} がワープから分断されている`);
	const mouths = [];
	for (const x of t.safe) {
		for (const nk of floorNbrs(x)) if (!t.safe.has(nk)) mouths.push(`${nk}→${x}`);
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
	// ⑦ 解けた状態（石が全ボタン上・以後ロックで不動）でも要所へ歩ける
	const solved = new Set(t.buttons);
	const afterSolve = walkSet(t.warp, (k) => t.floors.has(k) && !solved.has(k));
	for (const [label, cell] of [['鍵', t.keyCell], ...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!afterSolve.has(cell)) throw new Error(`解いた後（石がボタン上で固定）にワープから ${label} ${cell} へ行けない`);
	}
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から「引き」で初期配置候補を作る ────────
// generate-key-room-d4.mjs と同じ規則。石を置けない/置きたくないセル（安全地帯の全セル・鍵セル）
// を除いた床の上だけで引く。'!' のセルは引きの経路としては通す（破壊後の世界）が、
// 初期配置としては禁じる（壁の中に石を置けない）。
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
	for (let head = 0; head < q.length; head++) {
		const st = q[head];
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
		if (stones.some((s) => t.breaks.includes(s))) continue;    // 壁の中には石を置けない
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

/** その初期配置で、どの '!' にも壊す前に爆破の足場へ歩けるか（石が足場を塞ぐ配置を落とす）。 */
function bombSpotsReachable(t, stones) {
	const blocked = new Set(stones);
	const seen = walkSet(t.warp, (k) => t.floors.has(k) && !t.breaks.includes(k) && !blocked.has(k));
	return t.breaks.every((b) => t.bombSpots[b].some((s) => seen.has(s)));
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
/**
 * 測定用タイル：テンプレそのまま＋石 '*'。
 *   ・鍵扉 'D' は鍵未所持＝壁として測る（ソルバーの 'D' は解ける関門扱いで通ってしまう）。
 *   ・安全地帯マーク ',' はテンプレ専用の注釈＝実タイルの床 '.' に戻す。
 *   ・breakAs={cell:char} を渡すと、その '!' のセルをその文字に差し替える（I4 の動的検査）。
 */
export function buildTiles(t, stonePlacement, breakAs = null) {
	const stoneSet = new Set(stonePlacement);
	const tiles = t.grid.map((row) => [...row]);
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const k = key(r, c);
		if (tiles[r][c] === 'D') tiles[r][c] = TILE.WALL;
		else if (tiles[r][c] === SAFE_MARK) tiles[r][c] = TILE.FLOOR;
		if (breakAs && breakAs[k]) tiles[r][c] = breakAs[k];
		if (stoneSet.has(k)) tiles[r][c] = TILE.STONE;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	return { tiles, bg };
}

/**
 * 軸②の貪欲モデル（generate-key-room-d4.mjs と同じ「押し単位のマクロ貪欲」）。
 * 歩行と爆弾（石を動かさない手）は自由・押しは石ポテンシャルを厳密に減らすものだけ許す。
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
	const macroKey = (state) => { const f = state.split('|'); return `${f[1]}|${f[3]}`; };
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
export function buildProblem(t, stonePlacement, breakAs = null) {
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
	// I3＝ワープ（救済の出口）に戻れない到達状態を数える（孤島なのでワープ1セルだけが脱出口）。
	const escapeTest = (state) => state.split('|')[0] === t.warp;
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
	return measureMetrics(S, [start], goalTest, h,
		{ guardMax, greedyFn: makeGreedyPush(t), escapeTest });
}

/** '!' を差し替えて「解けるか」だけを BFS で見る。 */
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

/**
 * I4（道具の必須性）を壁ごとに確かめる（migrate 側も同じ関数を使う＝規則を2箇所に書かない）：
 *   その '!' を '#' に固定           → 解けてはいけない
 *   その '!' を '['（歩けるが石は不可）→ 解けてはいけない＝その壁は**石の**搬送路
 *   全部の '!' を '.'                 → 解けなければならない（盤面自体は成立している）
 */
export function assertBombRequired(t, stonePlacement) {
	const out = {};
	for (const b of t.breaks) {
		const asWall = solvableWith(t, stonePlacement, { [b]: TILE.WALL });
		if (asWall.solvable)
			throw new Error(`'!' ${b} を壁 '#' に固定しても解けてしまう（L=${asWall.L}）＝この壁を壊す必要が無い`);
		const asSwitch = solvableWith(t, stonePlacement, { [b]: TILE.SWITCH_RED });
		if (asSwitch.solvable)
			throw new Error(`'!' ${b} を「歩けるが石は通れない」タイルにしても解けてしまう（L=${asSwitch.L}）`
				+ '＝この壁はプレイヤーの近道を開けているだけで、石の搬送路になっていない');
		out[b] = { wall: asWall, stoneBlocked: asSwitch };
	}
	const allOpen = Object.fromEntries(t.breaks.map((b) => [b, TILE.FLOOR]));
	const asFloor = solvableWith(t, stonePlacement, allOpen);
	if (!asFloor.solvable)
		throw new Error("'!' を全部床 '.' にしても解けない＝盤面（石の配置）そのものが成立していない");
	out.floor = asFloor;
	return out;
}

// ── 実行 ────────────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1]?.endsWith('generate-key-room-d6.mjs') ?? false;
const only = IS_MAIN ? process.argv.slice(2)[0] : undefined;
const list = IS_MAIN ? (only ? TEMPLATES.filter((x) => x.name === only) : TEMPLATES) : [];
if (IS_MAIN && !list.length) throw new Error(`テンプレが無い: ${only}`);

for (const tpl of list) {
	const t = analyze(tpl.template);
	assertGeometry(t);
	console.log(`\n════ ${tpl.name} ════`);
	tpl.template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
	console.log(`  ボタン ${t.buttons.join(' / ')}（ポケット ${t.pocketButton}・喉 '!' ${t.pocketBreak}）`);
	console.log(`  近道の '!' ${t.cutBreaks.join(' ')}`);
	console.log(`  鍵 ${t.keyCell}  ワープ(入口) ${t.warp}  扉 ${t.doors.join(' / ')}`);
	for (const b of t.breaks) console.log(`  ${b} の爆破の足場: ${t.bombSpots[b].join(' ')}`);
	console.log(`  洞の口: ${t.mouths.join(' ')}`);
	console.log(`  床 ${t.floors.size} セル`);
	if (GEOM_ONLY) { console.log('  (GEOM_ONLY: assertGeometry を通過)'); continue; }

	const seenStones = new Set();
	const cands = [];
	let noBombSpot = 0;
	for (const c of pullBFS(t)) {
		const sk = c.stones.join(';');
		if (seenStones.has(sk)) continue;
		if (!walkReachable(t, c.stones, c.player)) continue;
		seenStones.add(sk);
		if (!bombSpotsReachable(t, c.stones)) { noBombSpot++; continue; }
		cands.push(c);
	}
	console.log(`  石3配置候補: ${cands.length} 通り（引き距離 ${cands[0]?.pulls}〜${cands[cands.length - 1]?.pulls}`
		+ `／爆破の足場を石が塞ぐ配置 ${noBombSpot} 件を除外）`);

	const candCap = Number(process.env.CAND_CAP ?? 1200);
	let pool = cands;
	if (cands.length > candCap) {
		const st = cands.length / candCap;
		pool = Array.from({ length: candCap }, (_, i) => cands[Math.floor(i * st)]);
		console.log(`  ⚠️ 候補を ${cands.length} → ${pool.length} に等間隔サンプル（CAND_CAP=${candCap}）`);
	}

	// 篩：近道の必須性（I4 の安い前段）→ 貪欲（軸②）。どちらも状態空間 BFS より安い。
	const greedyFn = makeGreedyPush(t);
	const insight = [];
	let notGreedy = 0;
	for (const cand of pool) {
		const p = buildProblem(t, cand.stones);
		if (greedyFn(p.S, [p.start], p.goalTest)) continue;
		notGreedy++;
		insight.push(cand);
	}
	console.log(`  貪欲で解ける（軸②未達）${pool.length - notGreedy} 件 / 軸②クリア ${insight.length} 件`);

	const maxMeasure = Number(process.env.MAX_MEASURE ?? MAX_MEASURE);
	// 引き距離が PULL_TARGET に近い候補から測る（既定＝帯の中ほど L≈36 の半分強）。
	const pullTarget = Number(process.env.PULL_TARGET ?? 17);
	insight.sort((a, b) => Math.abs(a.pulls - pullTarget) - Math.abs(b.pulls - pullTarget) || b.pulls - a.pulls);
	const sample = insight.slice(0, maxMeasure);
	if (insight.length > sample.length)
		console.log(`  ⚠️ フル測定は引き距離が ${pullTarget} に近い順に ${sample.length}/${insight.length} 件だけ（MAX_MEASURE=${maxMeasure}）`);
	const passed = [];
	let tooBig = 0, escFail = 0, bandFail = 0, i4Fail = 0;
	for (const cand of sample) {
		let m;
		try { m = measurePlacement(t, cand.stones, 9000000); }
		catch { tooBig++; continue; }
		const v = verdict(m);
		console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount} states=${m.states} noEsc=${m.noEscape} ${v.label}`);
		if (!v.pass) continue;
		if (m.noEscape) { escFail++; continue; }
		if (m.L < L_MIN || m.L > L_MAX) { bandFail++; continue; }
		let i4;
		try { i4 = assertBombRequired(t, cand.stones); }
		catch (e) { console.log(`      ✗ I4: ${e.message}`); i4Fail++; continue; }
		console.log(`      I4 OK（どちらの壁も '#'→解なし・'石だけ不可'→解なし・全部 '.'→L=${i4.floor.L}）`);
		passed.push({ cand, m, i4 });
	}
	console.log(`  フル測定 ${sample.length} 件（状態超過 ${tooBig} / I3脱出不能 ${escFail} / 帯外 ${bandFail}`
		+ ` / I4未達 ${i4Fail}）→ 採用可 ${passed.length} 件`);
	if (!passed.length) { console.log(`  ✗ ${tpl.name}：帯 ${L_MIN}〜${L_MAX} の合格盤面が見つからず（テンプレ調整）`); continue; }

	const num = (v) => (typeof v === 'number' ? v : Infinity);
	passed.sort((a, b) => b.m.L - a.m.L || num(a.m.solCount) - num(b.m.solCount));
	const { cand, m, i4 } = passed[0];
	console.log(`  ✅ 採用 石 ${cand.stones.join(' ')}（引き${cand.pulls}）→ L=${m.L} 貪欲NG deadlock=${m.deadlocks}`
		+ ` 強制手率=${m.forcedRatio} 最短解本数=${m.solCount} 状態=${m.states} 脱出不能=${m.noEscape}`
		+ ` 爆弾必須（全部 '.' なら L=${i4.floor.L}）`);
	const { tiles } = buildTiles(t, cand.stones);
	const shown = tiles.map((row, r) => row.map((ch, c) => (DOOR_CELLS.includes(key(r, c)) ? 'D' : ch)).join(''));
	console.log('  ── 採用盤面 ──');
	shown.forEach((row, r) => console.log('    ', String(r).padStart(2), row));
	console.log(`  ── migrate 用 ── STONES=${cand.stones.join(' ')}  ENTRY=${t.warp}  L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount}`);
}
