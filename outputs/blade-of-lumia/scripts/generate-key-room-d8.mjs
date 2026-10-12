#!/usr/bin/env node
/**
 * generate-key-room-d8.mjs — D8 の鍵部屋（dungeon_8 / 1,0）「沼の浮島」の盤面を
 * 逆算生成・測定する（PLAN 実行キュー 47 第3陣・2026-10-12 作り直し）。
 *
 * ■ なぜ作り直したか（キュー47）
 *   旧盤面（キュー 5.5g）は D4 `1,0` の「千鳥の柱＋東列の前室」とほぼ同じ骨組みで、石を
 *   1個増やしただけだった（内側で一致するセルが D6↔D8 で 27）。ユーザー判定（2026-10-12）＝
 *   D4 は見本として残し、D8 は別物に作り直す。主題はユーザー選択「沼の浮島」。
 *
 * ■ 沼の浮島（設計の芯）
 *   ・部屋を幅1の水路（bgTiles の水 '~'）で島に分ける。
 *   ・勇者は**はしご**で幅1の水路をどこでも渡れる（D5 の道具・`game/passable.js LADDER_OVER`）。
 *     石は水に入れない＝**石が通れるのは陸の土手道だけ**。
 *   ∴土手道を石で塞いでも、勇者は水路を渡って石の向こう側へ回れる＝「押す位置は水の向こう」。
 *     謎の本体は、細い土手道を4つの石がどの順で通るか（石が石の道を塞ぐ）。
 *   ・入口のワープは水に囲まれた小島＝陸続きでない∴石は絶対に入れない（幾何で自明）。
 *     小島から出る渡り口は2つ以上（向こう岸に石が居座ると、その渡り口は使えない）。
 *
 * ■ 笛について（2026-10-12 裏取り・旧版の記述の訂正）
 *   旧版は「笛は D8 の報酬＝この部屋の初回攻略時は未所持」と書いていたが誤り。笛は D8 `1,2` の
 *   宝箱で、この部屋へのワープ（`1,1` の `>`）は笛を吹くと現れる（flutePlayed）∴**この部屋に
 *   入るときは必ず笛を持っている**＝`fluteEffect:{type:'resetStones'}` の救済が初回から使える。
 *   それでも I3（noEscape=0＝どの状態からもワープへ戻れる）は測って守る（笛に頼らずに部屋を
 *   出られる＝詰みの逃げ道を2本持つ）。
 *
 * この部屋固有の不変条件（assertGeometry が検査する）：
 *   ① リング（外周）＝孤島なので鍵扉 D(4,0)(5,0) 以外は全壁（ワープ '>' で入る）。
 *   ② ワープの小島＝ワープを含む陸の連結成分にボタンが無い（石が永遠に入れない区画）。
 *      小島から出る渡り口（はしごで渡れる水1枚）が2つ以上で、向こう岸のセルが別々。
 *   ③ 石の無い部屋で、ワープから（はしごを使って）全部の陸へ行ける（入って詰まない）。
 *   ④ 解けた状態（石が全ボタン上＝以後ロックで不動）でもワープから鍵・鍵扉の手前へ行ける。
 *   ⑤ 鍵扉の手前 (4,1)(5,1) が陸／各ボタンへ石を押し込める向きが1つ以上ある。
 *   ⑥ 見た目だけの地面タイル・ゲート・宝箱・敵を置かない
 *      （敵は enemy-ai.js tryEnemyPushStone で**石を押す**＝測定した倉庫番が壊れる）。
 *
 * 測定（PUZZLE-DESIGN §7-3 C）：4軸下限（L≥6・貪欲NG・deadlock>0・強制手率≤0.7）
 *   ＋§7-4 の D8 の帯 **L 40〜60**（D6 の L=39 より深い＝倉庫番3室の難しさが進行順に上がる）
 *   ＋I3（noEscape=0）＝どの到達状態からもワープに戻れる
 *   ＋I6（はしごの必須性）＝小島の渡り口以外の水路を全部「壁」にすると解なし
 *     （＝はしごは小島から出るためだけでなく、石の向こうへ回るために要る）。
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    書き込みは scripts/migrate-d8-1-0-swamp-isles.mjs（この生成器の関数をそのまま import する）。
 *
 * 使い方（outputs/blade-of-lumia/ で実行）:
 *   node scripts/generate-key-room-d8.mjs            # 全テンプレ
 *   node scripts/generate-key-room-d8.mjs c3         # 指定テンプレだけ
 *   GEOM_ONLY=1 node scripts/generate-key-room-d8.mjs   # 幾何 assert だけ（設計反復用）
 *   GUARD_MAX=8000000 MAX_MEASURE=6 node --max-old-space-size=20000 scripts/generate-key-room-d8.mjs
 *     ＝採用時の実行（状態 200 万級を測るのでヒープを広げる・既定のヒープでは落ちる）
 */

import { ROWS, COLS, W, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics, verdict } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ────────────────────────────────────────────────────────────
//   '#' 壁 / '.' 陸の床 / '~' 水（書き込み時は tiles '.'＋bgTiles '~'）/ 'S' ボタン / 'K' 鍵
//   '>' ワープ（入口＝救済の出口）/ 'D' 鍵扉（ボス部屋へ・測定では壁として扱う）
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
// 採らなかった版の教訓（2026-10-12）：
//   i1＝陸を幅1の帯だけで組み、真ん中にワープの小島。石は帯を真っ直ぐしか動けず、陸が西（ボタン2）と
//       東（ボタン2）に分かれて石2個ずつの独立した2問になった＝候補 240 通りが全部貪欲で解けた。
//   c1/c2＝北に桟橋の櫛・南に広い広間。広間が広すぎて状態が 500 万を超え、測れなかった
//       （はしごで水の上にも立てる分、陸だけの倉庫番より状態が増える）。
//   c3 の最初の測定＝4軸と帯は通ったが I6 が不合格（水路を壁にしても解ける＝はしごは近道だけ）。
//       ∴「桟橋の中に石が居る配置」に候補を絞った（STRIP_MIN）。桟橋の石を外へ出す押しの立ち位置は
//       桟橋の上＝隣の陸から水路を跳ばないと立てない。
export const TEMPLATES = [
	{
		// c3（採用）：北に桟橋の櫛（列1/3/7/9＝幅1の陸・間の列2/4/6/8＝水路）。列1・列9 の桟橋の
		//   先端がボタン、列3・列7 は石の桟橋。真ん中の桟橋（列5）は根元が水 (4,5) で切れた小島＝
		//   ワープと鍵。南（行5-7）は石を運ぶ広間（柱 (6,3)(6,7)）。陸 42・水 13。
		name: 'c3',
		template: [
			'############',
			'#S###>###S##',
			'#.~.~K~.~.##',
			'#.~.~.~.~.##',
			'D.~.~~~.~.##',
			'D.........##',
			'#..#...#..##',
			'#S.......S##',
			'############',
			'############',
		],
	},
];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const GEOM_ONLY = !!process.env.GEOM_ONLY;
const MAX_MEASURE = Number(process.env.MAX_MEASURE ?? 12);
// L の帯（§7-4 の D8）＝40〜60。下限は D6 の L=39 の1つ上（帯は排他・§7-6 手順11）。
export const L_MIN = Number(process.env.L_MIN ?? 40);
export const L_MAX = Number(process.env.L_MAX ?? 60);
export const STONE_COUNT = 4;

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);
// 敵タイル（この部屋には置かない＝敵が石を押す）。
const ENEMY_RE = /[WECFVXZALNJOUGIθμαβξζφδσλπηωψΓ]/;
export const DOOR_CELLS = ['4,0', '5,0'];
const DOOR_APPROACH = ['4,1', '5,1'];
const WATER_MARK = '~';

export function analyze(template) {
	const grid = template.map((row) => [...row]);
	if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
		throw new Error(`テンプレは ${ROWS}x${COLS} 必要`);
	const buttons = [], land = new Set(), water = new Set();
	let keyCell = null, warp = null;
	const doors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (ch === '#') continue;
		if (ch === 'D') { doors.push(key(r, c)); continue; }  // 鍵未所持＝壁
		if (ch === WATER_MARK) { water.add(key(r, c)); continue; }
		land.add(key(r, c));
		if (ch === 'S') buttons.push(key(r, c));
		else if (ch === 'K') keyCell = key(r, c);
		else if (ch === TILE.MAP_ENTER) warp = key(r, c);
		else if (ch === 'B') throw new Error('この部屋に宝箱 B は置かない（報酬は鍵だけ）');
		else if (DECOR_TILES.has(ch)) throw new Error(`見た目だけの地面タイル '${ch}' が (${r},${c}) にある`);
		else if (ch !== '.') throw new Error(`テンプレに想定外の文字 '${ch}' が (${r},${c}) にある`);
	}
	if (!keyCell) throw new Error('テンプレに鍵 K が無い');
	if (!warp) throw new Error('テンプレにワープ > が無い');
	if (ENEMY_RE.test(template.join('')))
		throw new Error('敵を置いてはいけない（enemy-ai.js が石を押す＝測定した倉庫番が壊れる）');
	if (buttons.length !== STONE_COUNT) throw new Error(`ボタンは ${STONE_COUNT} 個（今 ${buttons.length}）`);
	if (doors.sort().join(' ') !== DOOR_CELLS.join(' '))
		throw new Error(`鍵扉は ${DOOR_CELLS.join(' ')} の2枚（今 ${doors.join(' ')}）`);
	return { grid, buttons, land, water, keyCell, warp, doors };
}

/** 陸だけを歩いた連結成分（石の動ける範囲の上界＝石は水に入れない）。 */
function landComponent(t, start) {
	const seen = new Set([start]), q = [start];
	for (let h = 0; h < q.length; h++) {
		const [r, c] = parse(q[h]);
		for (const [dr, dc] of DIRS) {
			const nk = key(r + dr, c + dc);
			if (seen.has(nk) || !t.land.has(nk)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

/**
 * はしごを使った歩行の到達集合（blade-solver.mjs の移動規則と同じ）：
 *   ・陸へは（石が無ければ）入れる。
 *   ・水へは「進入軸の両隣が陸（石なし）」のときだけ1枚入れる。水の上から陸へは軸を問わず出られる。
 *   ・水から水へは入れない（両隣の片方が水＝橋脚にならない）。
 */
function ladderWalk(t, start, blocked = new Set()) {
	const isBank = (k) => t.land.has(k) && !blocked.has(k);
	const seen = new Set([start]), q = [start];
	for (let h = 0; h < q.length; h++) {
		const [r, c] = parse(q[h]);
		for (const [dr, dc] of DIRS) {
			const nr = r + dr, nc = c + dc, nk = key(nr, nc);
			if (seen.has(nk)) continue;
			if (t.water.has(nk)) {
				if (!isBank(key(nr - dr, nc - dc)) || !isBank(key(nr + dr, nc + dc))) continue;
			} else if (!isBank(nk)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

/** セル x へ石を押し込める向きがあるか（押し＝プレイヤー x-2d（陸）→ 石 x-d（陸）→ 行き先 x）。 */
function pushableInto(t, x) {
	const [xr, xc] = parse(x);
	for (const [dr, dc] of DIRS) {
		const s = key(xr - dr, xc - dc);
		const p = key(xr - 2 * dr, xc - 2 * dc);
		if (t.land.has(s) && t.land.has(p)) return `${s} の石を ${p} から押す`;
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
	// ② ワープの小島＝陸の連結成分にボタンが無い∴石は入れない／渡り口が2つ以上
	t.isle = landComponent(t, t.warp);
	for (const b of t.buttons) if (t.isle.has(b)) throw new Error(`ボタン ${b} がワープの小島にある`);
	const crossings = [];
	for (const x of t.isle) {
		const [r, c] = parse(x);
		for (const [dr, dc] of DIRS) {
			const w = key(r + dr, c + dc), far = key(r + 2 * dr, c + 2 * dc);
			if (t.water.has(w) && t.land.has(far) && !t.isle.has(far)) crossings.push({ from: x, water: w, far });
		}
	}
	const farCells = new Set(crossings.map((x) => x.far));
	if (farCells.size < 2)
		throw new Error(`ワープの小島から渡れる向こう岸が ${farCells.size} か所（2以上必要）`
			+ '＝向こう岸に石が居座った瞬間に小島から出られない');
	t.crossings = crossings;
	// ③ 石の無い部屋で、ワープから全部の陸へ行ける
	const empty = ladderWalk(t, t.warp);
	for (const f of t.land) if (!empty.has(f)) throw new Error(`石が無くてもワープから ${f} へ行けない`);
	// ⑤ 鍵扉の手前が陸／各ボタンに押し込める向きがある
	for (const a of DOOR_APPROACH) if (!t.land.has(a)) throw new Error(`鍵扉の手前 ${a} が陸でない`);
	for (const b of t.buttons) {
		if (!pushableInto(t, b)) throw new Error(`ボタン ${b} へ石を押し込める向きが無い＝解なし`);
	}
	// ④ 解けた状態（石が全ボタン上・以後ロックで不動）でも要所へ行ける
	const solved = ladderWalk(t, t.warp, new Set(t.buttons));
	for (const [label, cell] of [['鍵', t.keyCell], ...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!solved.has(cell)) throw new Error(`解いた後（石がボタン上で固定）にワープから ${label} ${cell} へ行けない`);
	}
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から「引き」で初期配置候補を作る ────────
// 引き＝押しの逆。プレイヤーは陸 P に立ち、石が P-d、プレイヤーが P+d（陸）へ下がると石が P へ来る。
// プレイヤーの移動ははしごを含む（水の上に立てる）。引いた後のプレイヤーのセルは陸だけに限る
// （水の上から押す手は数えない＝候補が少し減るだけ。最終判定は順方向のソルバー）。
function pullBFS(t) {
	const noStone = new Set([...t.isle, t.keyCell]);
	const isStoneCell = (k) => t.land.has(k) && !noStone.has(k);
	const goalStones = [...t.buttons].sort();
	const encode = (stones, p) => `${stones.join(';')}|${p}`;
	const start = [];
	{
		const stoneSet0 = new Set(goalStones);
		for (const b of goalStones) {
			const [br, bc] = parse(b);
			for (const [dr, dc] of DIRS) {
				const pk = key(br + dr, bc + dc);
				if (t.land.has(pk) && !stoneSet0.has(pk)) start.push(encode(goalStones, pk));
			}
		}
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
		const isBank = (k) => t.land.has(k) && !stoneSet.has(k);
		for (const [dr, dc] of DIRS) {          // プレイヤーだけ動く（はしご含む・距離据え置き）
			const nr = pr + dr, nc = pc + dc, nk = key(nr, nc);
			if (stoneSet.has(nk)) continue;
			if (t.water.has(nk)) {
				if (!isBank(key(nr - dr, nc - dc)) || !isBank(key(nr + dr, nc + dc))) continue;
			} else if (!t.land.has(nk)) continue;
			const ns = encode(stones, nk);
			if (!dist.has(ns)) { dist.set(ns, d); q.push(ns); }
		}
		if (!t.land.has(pStr)) continue;        // 水の上からは引かない
		for (const [dr, dc] of DIRS) {          // 引く（＝押しの逆・距離+1）
			const sk = key(pr - dr, pc - dc);
			if (!stoneSet.has(sk)) continue;
			const nk = key(pr + dr, pc + dc);
			if (!t.land.has(nk) || stoneSet.has(nk)) continue;
			const ns2 = stones.filter((s) => s !== sk);
			ns2.push(pStr);
			ns2.sort();
			const ns = encode(ns2, nk);
			if (!dist.has(ns)) { dist.set(ns, d + 1); q.push(ns); }
		}
	}
	const out = [];
	for (const [st, d] of dist) {
		const [stonesStr, pStr] = st.split('|');
		const stones = stonesStr.split(';');
		if (stones.some((s) => t.buttons.includes(s))) continue;   // 初期から一部解けている配置は除外
		if (stones.some((s) => !isStoneCell(s))) continue;
		out.push({ stones, player: pStr, pulls: d });
	}
	return out.sort((a, b) => a.pulls - b.pulls);
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
/**
 * 測定用タイル：テンプレ＋石 '*'。水は tiles '.'＋bg '~'。
 *   ・鍵扉 'D' は鍵未所持＝壁として測る（ソルバーの 'D' は解ける関門扱いで通ってしまう）。
 *   ・wallWater=Set を渡すと、その水セルを壁 '#' に差し替える（I6 の対照実験）。
 */
export function buildTiles(t, stonePlacement, wallWater = null) {
	const stoneSet = new Set(stonePlacement);
	const tiles = t.grid.map((row) => [...row]);
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const k = key(r, c);
		if (tiles[r][c] === 'D') tiles[r][c] = TILE.WALL;
		else if (tiles[r][c] === WATER_MARK) {
			if (wallWater?.has(k)) tiles[r][c] = TILE.WALL;
			else { tiles[r][c] = TILE.FLOOR; bg[r][c] = W; }
		}
		if (stoneSet.has(k)) tiles[r][c] = TILE.STONE;
	}
	return { tiles, bg };
}

/**
 * 軸②の貪欲モデル（generate-key-room-d4/d6 と同じ「押し単位のマクロ貪欲」）。
 * 歩行（はしご含む）は自由・押しは石ポテンシャルを厳密に減らすものだけ許す。
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
export function buildProblem(t, stonePlacement, { wallWater = null, start = t.warp } = {}) {
	const { tiles, bg } = buildTiles(t, stonePlacement, wallWater);
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: true });
	const s0 = S.encode(...parse(start), S.initStones, 0, 0, 0);
	const goalTest = (state) => {
		const f = state.split('|');
		return f[0] === t.keyCell && f[5] === '1';
	};
	return { S, start: s0, goalTest };
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

/** 「解けるか」だけを BFS で見る（I6 の対照実験用）。 */
export function solvableWith(t, stonePlacement, opts = {}, guardMax = 12000000) {
	const { S, start, goalTest } = buildProblem(t, stonePlacement, opts);
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
 * I6（はしごの必須性）＝小島の渡り口の水だけを残し、ほかの水路を全部壁 '#' にすると解けない。
 * ＝はしごは「小島から出る」ためだけの道具ではなく、石の向こうへ回るために要る。
 * migrate 側も同じ関数を使う（規則を2箇所に書かない）。
 */
export function assertLadderRequired(t, stonePlacement) {
	const keep = new Set(t.crossings.map((x) => x.water));
	const wallWater = new Set([...t.water].filter((w) => !keep.has(w)));
	const res = solvableWith(t, stonePlacement, { wallWater });
	if (res.solvable)
		throw new Error(`小島の渡り口以外の水路を壁にしても解けてしまう（L=${res.L}）＝水路を渡る手が要らない`);
	return res;
}

// ── 実行 ────────────────────────────────────────────────────────────────────
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
	console.log(`  陸 ${t.land.size} セル・水 ${t.water.size} セル・小島 ${t.isle.size} セル`);
	console.log(`  小島の渡り口: ${t.crossings.map((x) => `${x.from}→${x.water}→${x.far}`).join(' ')}`);
	if (GEOM_ONLY) { console.log('  (GEOM_ONLY: assertGeometry を通過)'); continue; }

	const seenStones = new Set();
	const cands = [];
	for (const c of pullBFS(t)) {
		const sk = c.stones.join(';');
		if (seenStones.has(sk)) continue;
		// 初期配置で、ワープから引き終わりのプレイヤー位置へ行けるもの（逆再生できる）だけ。
		if (!ladderWalk(t, t.warp, new Set(c.stones)).has(c.player)) continue;
		seenStones.add(sk);
		cands.push(c);
	}
	console.log(`  石${STONE_COUNT}配置候補: ${cands.length} 通り（引き距離 ${cands[0]?.pulls}〜${cands[cands.length - 1]?.pulls}）`);
	if (!cands.length) { console.log(`  ✗ ${tpl.name}：候補ゼロ`); continue; }

	// 桟橋の石＝左右（または上下）が水の陸に居る石。ここから石を出す押しの立ち位置は桟橋の上＝
	// 隣の陸から水路を跳ばないと立てない。I6（はしごの必須性）の安い前段として、この石が
	// STRIP_MIN 個以上ある配置だけを見る（I6 は最後に状態空間で確かめる＝これは篩にすぎない）。
	const stripMin = Number(process.env.STRIP_MIN ?? 1);
	const isStrip = (k) => {
		const [r, c] = parse(k);
		return (t.water.has(key(r, c - 1)) && t.water.has(key(r, c + 1)))
			|| (t.water.has(key(r - 1, c)) && t.water.has(key(r + 1, c)));
	};
	const stripCands = cands.filter((c) => c.stones.filter(isStrip).length >= stripMin);
	console.log(`  桟橋の石が ${stripMin} 個以上の配置: ${stripCands.length}/${cands.length} 通り`);
	const candCap = Number(process.env.CAND_CAP ?? 1500);
	let pool = stripCands;
	if (stripCands.length > candCap) {
		const st = stripCands.length / candCap;
		pool = Array.from({ length: candCap }, (_, i) => stripCands[Math.floor(i * st)]);
		console.log(`  ⚠️ 候補を ${stripCands.length} → ${pool.length} に等間隔サンプル（CAND_CAP=${candCap}）＝全候補は見ていない`);
	}

	const greedyFn = makeGreedyPush(t);
	const insight = [];
	for (const cand of pool) {
		const p = buildProblem(t, cand.stones);
		if (!greedyFn(p.S, [p.start], p.goalTest)) insight.push(cand);
	}
	console.log(`  貪欲で解ける（軸②未達）${pool.length - insight.length} 件 / 軸②クリア ${insight.length} 件`);
	if (!insight.length) continue;

	const maxMeasure = Number(process.env.MAX_MEASURE ?? MAX_MEASURE);
	const pullTarget = Number(process.env.PULL_TARGET ?? 22);
	insight.sort((a, b) => Math.abs(a.pulls - pullTarget) - Math.abs(b.pulls - pullTarget) || b.pulls - a.pulls);
	// I6 を先に回す：水路なしで解ける配置は BFS が早く解を見つける＝安く落とせる。
	const sample = [];
	let i5Fail = 0, i5Big = 0;
	for (const cand of insight) {
		if (sample.length >= maxMeasure) break;
		try { assertLadderRequired(t, cand.stones); }
		catch (e) { if (/大きすぎる/.test(e.message)) i5Big++; else i5Fail++; continue; }
		sample.push(cand);
	}
	console.log(`  I6 の前段：水路なしで解ける ${i5Fail} 件・測定不能 ${i5Big} 件を落とし、${sample.length} 件をフル測定（MAX_MEASURE=${maxMeasure}）`);
	const passed = [];
	let tooBig = 0, escFail = 0, bandFail = 0, axisFail = 0;
	for (const cand of sample) {
		let m;
		try { m = measurePlacement(t, cand.stones, Number(process.env.GUARD_MAX ?? 12000000)); }
		catch (e) { tooBig++; console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} → 測定不能 (${e.message})`); continue; }
		const v = verdict(m);
		console.log(`    · 石 ${cand.stones.join(' ')} pull${cand.pulls} L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount} states=${m.states} noEsc=${m.noEscape} ${v.label}`);
		if (!v.pass) { axisFail++; continue; }
		if (m.noEscape) { escFail++; continue; }
		if (m.L < L_MIN || m.L > L_MAX) { bandFail++; continue; }
		passed.push({ cand, m });
	}
	console.log(`  フル測定 ${sample.length} 件（状態超過 ${tooBig} / 4軸未達 ${axisFail} / I3脱出不能 ${escFail}`
		+ ` / 帯外 ${bandFail} / I6未達 ${i5Fail}）→ 採用可 ${passed.length} 件`);
	if (!passed.length) { console.log(`  ✗ ${tpl.name}：帯 ${L_MIN}〜${L_MAX} の合格盤面が見つからず（テンプレ調整）`); continue; }

	const num = (v) => (typeof v === 'number' ? v : Infinity);
	// 帯の中では最短解が細いものを優先し、同じ細さなら深いものを採る（§7-6 手順11＝帯の上寄りでは
	// L より細さ。c3 の測定では L=55・最短解1本 が L=57・最短解18本 より良い盤面）。
	passed.sort((a, b) => num(a.m.solCount) - num(b.m.solCount) || b.m.L - a.m.L);
	const { cand, m } = passed[0];
	console.log(`  ✅ 採用 石 ${cand.stones.join(' ')}（引き${cand.pulls}）→ L=${m.L} 貪欲NG deadlock=${m.deadlocks}`
		+ ` 強制手率=${m.forcedRatio} 最短解本数=${m.solCount} 状態=${m.states} 脱出不能=${m.noEscape}`);
	const { tiles, bg } = buildTiles(t, cand.stones);
	const shown = tiles.map((row, r) => row.map((ch, c) => (DOOR_CELLS.includes(key(r, c)) ? 'D'
		: bg[r][c] === W ? '~' : ch)).join(''));
	console.log('  ── 採用盤面 ──');
	shown.forEach((row, r) => console.log('    ', String(r).padStart(2), row));
	console.log(`  ── migrate 用 ── STONES=${cand.stones.join(' ')}  ENTRY=${t.warp}  L=${m.L} dl=${m.deadlocks} fr=${m.forcedRatio} sol=${m.solCount}`);
}
