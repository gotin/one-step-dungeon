#!/usr/bin/env node
/**
 * generate-key-room-dark-tower-43.mjs — dark_tower の鍵部屋 [4,3] を
 * 「純倉庫番（C）・石4・可能な限り深い L」にするための盤面を逆算生成・測定する
 * （PLAN 実行キュー 5.5i）。
 *
 * ⚠️ 2026-08-09 の方針転換（ユーザー確定）で、この部屋は **色ゲートを使わない**：
 *   - 色ゲート/色スイッチ込みの合成パズルは AI の自動生成ロジックが未整備＝実質失敗
 *     （26,0 はユーザーが手で作った）。∴ここでは非単調な関門は使わない。
 *   - 代わりに **純倉庫番（石4）で L > 60 を狙う**（D8＝石4・L=60 を「深さ」で超える）。
 *     これは新しい設計能力ではなく、D8 生成器（逆算 pull-BFS）の探索帯を上へ広げるだけ。
 *     ∴「L>60 が出る」と口約束せず、**回して出た最大 L を実測で報告**する。出なければ
 *     正直に報告し A 戦闘型へ切替（PLAN 5.5i の代用案）。
 *   - 26,0（色ゲート合成・L=106）は深洋O（寄り道・上限なし）用に温存する（案A）。
 *   - 旧・色ゲート版の生成器（I5 の過剰条件で袋小路に入った）は本ファイルで破棄した。
 *
 * 部屋の位相（実データで再確認・2026-08-09）：
 *   ・入口＝北 (0,5)(0,6)（`4,2` から歩いて降りてくる。ワープではない）
 *   ・もう一方の出口＝南の鍵扉 `DD`(9,5)(9,6) → `4,4`
 *     ⚠️ ステージキーは "x,y"（列,行）＝[4,3] の南は [4,4]。
 *   ・東西の外周は全壁＝入口と鍵扉の2辺しかない **終端相当**∴部屋を丸ごとパズルに使える。
 *   ・鍵 `K` は (7,6) 据え置き。入場時の道具＝全部（**笛を持っている**）。
 *
 * 詰み救済（D8 と違い笛がある）：
 *   (a) 北の入口 (0,5)(0,6) へ戻って隣室へ出る＝enterStage が未解決の石を初期位置へ戻す
 *   (b) `fluteEffect:{type:'resetStones'}`＝その場で石を初期位置へ戻す
 *   ∴ D8 のような「前室へ石を1個も入れない」帰納法は**不要**（26,0 も noEscape 非ゼロで
 *      笛前提＝正常な倉庫番の詰みは笛で回復できる）。noEscape は**測って報告する**が
 *      不合格にはしない（migrate 側で必ず笛を付ける）。
 *
 * 部屋固有の不変条件（assertGeometry が検査する。違反は**全部まとめて**投げる）：
 *   ① 外周：北 (0,5)(0,6) が入口の床・南 (9,5)(9,6) が鍵扉 'D'・他は全壁。
 *   ② 鍵扉の手前 (8,5)(8,6) が床／鍵は (7,6)。
 *   ③ 石ゼロで北入口から鍵・全ボタン・扉の手前・全床へ歩ける（孤立区画が無い）。
 *   ④ 解けた状態（石が全ボタン上＝以後ロックで不動）でも入口から鍵・扉の手前へ歩ける。
 *   ⑤ 各ボタンに石を押し込める向きが1つ以上ある（無いと解なし）。
 *   ⑥ tiles 層に見た目だけの地面タイルを混ぜない／敵を置かない／ゲート 'T' も宝箱 'B' も
 *      色ゲートも無い（敵は enemy-ai.js が石を押す＝測定した倉庫番が別物になる）。
 *
 * 合格基準（2026-08-09・ユーザーと再設計）＝**2軸だけ**：
 *   ① L（押し手数＝箱を動かす回数）≥ L_MIN。**逆算 pull-BFS の「引き距離」で測る**
 *      ＝押しと引きは厳密に逆操作 ∴ goal から引いた距離 = その配置から goal への最短押し手数。
 *      **後段のフル BFS（全到達状態を rev グラフ付きで保持）は廃止**＝これが OOM の主因だった
 *      （deadlock 数・強制手率・脱出可否は「全到達状態を列挙する」のが定義 ∴ 難しい倉庫番＝
 *      状態空間が指数爆発する盤面ほど列挙不能＝この枠組みで難易度を保証しようとするのが破綻。
 *      倉庫番の求解可否は PSPACE 完全）。pull-BFS は state=石+プレイヤーだけで軽く、PULL_CAP で
 *      深さ打ち切りしても、打ち切り前に確定した引き距離は BFS 順 ∴ 最短で正しい。
 *   ② 貪欲NG＝素朴なヒルクライム（近づく押しだけ選ぶ）では解けない＝一度遠ざける/回り込む
 *      ひらめきが要る。**前向きの探索だけ＝全列挙しない＝OOM しない**（一直線押しの水増しL を弾く保険）。
 *   ・deadlock 数・強制手率・noEscape は**捨てる**（全列挙が要る＝OOM の元凶・体感難易度への寄与も薄い）。
 *   ・盤面サイズは 10×12 で上限が決まっている ∴ L（押し手数）が大きい＝石が曲がりくねった非自明な
 *     経路を強制されている＝難しい（小さい盤面では一直線の水増しが物理的に取れない）。閾値 L_MIN は
 *     未知なので、まず到達可能な最大 L を実測し、その値を見て確定する。
 *   ⚠️ この L は「押し手数」＝D8 旧生成器の L=60（歩き込みの遷移数）とは別尺度で比較不可。再較正する。
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    書き込みは scripts/migrate-key-room-dark-tower-43.mjs。
 *
 * 使い方（outputs/blade-of-lumia/ で実行）:
 *   node scripts/generate-key-room-dark-tower-43.mjs               # 全テンプレ
 *   node scripts/generate-key-room-dark-tower-43.mjs v1            # 指定テンプレだけ
 *   GEOM_ONLY=1 node scripts/generate-key-room-dark-tower-43.mjs   # 幾何 assert だけ
 *   MAX_MEASURE=20 CAND_CAP=2000 L_MIN=61 node scripts/generate-key-room-dark-tower-43.mjs
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ────────────────────────────────────────────────────────────
//   '#' 壁 / '.' 床 / 'S' ボタン（石の目標）/ 'K' 鍵（(7,6) 固定）
//   北 (0,5)(0,6) が入口の床 / 'D' 鍵扉（南 (9,5)(9,6)・測定では壁扱い＝鍵未所持）
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
//
// 設計方針：部屋は 10x12（内部 rows1-8 × cols1-10＝80セル）で D8（内部 cols1-7）より広い
//   ∴同じ千鳥ピラーでも搬送距離が伸びて L が深くなり得る。ボタンを4隅寄りに散らし、
//   中央にピラーを置いて石4の搬送路が必ず交差するようにする（独立に運べない＝貪欲NG）。
// ⚠️ 2026-08-09 に測定を作り替えた（旧フル BFS の OOM を廃止）＝L は pull-BFS の
//    引き距離で測る（石+プレイヤーだけの軽い状態）∴**広い盤面でも回る見込み**。
//    L を伸ばすには広い盤面が要る（10×12 上限で L 大＝石が曲がりくねる＝難しい）ので
//    v1（床66・広い）を主軸に戻す。pull-BFS が OOM/打ち切りに達したらログに出す。
//    v2（床34・狭い）は比較用に残す（L の頭打ちを見る）。
export const TEMPLATES = [
	{
		// v1：4隅ボタン＋中央千鳥ピラー。北中央に入口の縦通路 (0,5)(0,6)。
		//   ボタン (1,1) 北西 / (1,10) 北東 / (7,1) 南西 / (7,10) 南東。鍵 (7,6)。
		name: 'v1',
		template: [
			'#####..#####',
			'#S..#..#..S#',
			'#..#....#..#',
			'#....##....#',
			'#.#......#.#',
			'#....##....#',
			'#..#....#..#',
			'#S...#K.#.S#',
			'#..#....#..#',
			'#####DD#####',
		],
	},
	{
		// v2：十字（縦通路 col5,6＋横通路 row4,5）。床34＝狭い＝L の頭打ちを見る比較用。
		name: 'v2',
		template: [
			'#####..#####',
			'#####..#####',
			'#####..#####',
			'#####..#####',
			'#S........S#',
			'#S........S#',
			'#####..#####',
			'#####.K#####',
			'#####..#####',
			'#####DD#####',
		],
	},
];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const GEOM_ONLY = !!process.env.GEOM_ONLY;
// 石4は状態が桁で増える∴上限を env で動かせる（超過した候補は件数を出す）。
const GUARD_MAX = Number(process.env.GUARD_MAX ?? 15000000);
// 逆算(pull-BFS)の展開上限。切ったら「どこまで見たか」をログに出す（黙って切らない）。
const PULL_CAP = Number(process.env.PULL_CAP ?? 5000000);

// L（押し手数）の下限。閾値は未知 ∴ 既定 1（＝全候補を一覧して実測最大を見てから確定する）。
// 実測を見たら L_MIN=env で絞る。上限は既定なし（深いほど良い）。
const L_MIN = Number(process.env.L_MIN ?? 1);
const L_MAX = Number(process.env.L_MAX ?? Infinity);

const STONE_COUNT = 4;

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);
// 敵タイル（この部屋には置かない＝敵が石を押す）。
const ENEMY_RE = /[WECFVXZALNJOUGI]/;
// 使ってはいけないギミック（色ゲート/色スイッチ/ゲート/宝箱/潮＝この部屋では使わない）。
const FORBIDDEN_GIMMICKS = new Set(['(', ')', '[', ']', 'T', 'B', '=']);

const ENTRY_CELLS = ['0,5', '0,6'];
const DOOR_CELLS = ['9,5', '9,6'];
const DOOR_APPROACH = ['8,5', '8,6'];
const KEY_CELL = '7,6';

export function analyze(template) {
	const grid = template.map((row) => row.split(''));
	if (grid.length !== ROWS || grid.some((r) => r.length !== COLS))
		throw new Error(`テンプレは ${ROWS}x${COLS} 必要`);
	const buttons = [], walls = new Set(), floors = new Set();
	let keyCell = null;
	const doors = [], entries = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = grid[r][c];
		if (ch === '#') { walls.add(key(r, c)); continue; }
		if (ch === 'D') { doors.push(key(r, c)); walls.add(key(r, c)); continue; }  // 鍵未所持＝壁
		floors.add(key(r, c));
		if (ch === 'S') buttons.push(key(r, c));
		if (ch === 'K') keyCell = key(r, c);
		if (ENTRY_CELLS.includes(key(r, c))) entries.push(key(r, c));
		if (DECOR_TILES.has(ch)) throw new Error(`見た目だけの地面タイル '${ch}' が (${r},${c}) にある`);
		if (FORBIDDEN_GIMMICKS.has(ch)) throw new Error(`この型では使わないギミック '${ch}' が (${r},${c}) にある`);
	}
	if (!keyCell) throw new Error('テンプレに鍵 K が無い');
	if (keyCell !== KEY_CELL) throw new Error(`鍵は ${KEY_CELL} 据え置き（今 ${keyCell}）`);
	if (ENEMY_RE.test(template.join('')))
		throw new Error('敵を置いてはいけない（enemy-ai.js が石を押す＝測定した倉庫番が壊れる）');
	if (buttons.length !== STONE_COUNT) throw new Error(`ボタンは${STONE_COUNT}個（今 ${buttons.length}）`);
	if (doors.sort().join(' ') !== DOOR_CELLS.join(' '))
		throw new Error(`鍵扉は ${DOOR_CELLS.join(' ')} の2枚（今 ${doors.join(' ')}）`);
	if (entries.sort().join(' ') !== ENTRY_CELLS.join(' '))
		throw new Error(`北入口は ${ENTRY_CELLS.join(' ')} の2セル（今 ${entries.join(' ')}）`);
	return { grid, buttons, walls, floors, keyCell, doors, entries };
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
function pushableInto(t, x) {
	const [xr, xc] = parse(x);
	for (const [dr, dc] of DIRS) {
		const s = key(xr - dr, xc - dc);          // 石の居るセル
		const p = key(xr - 2 * dr, xc - 2 * dc);  // プレイヤーの立つセル
		if (!t.floors.has(s) || !t.floors.has(p)) continue;
		return `${s} の石を ${p} から押す`;
	}
	return null;
}

export function assertGeometry(t) {
	// ① 外周＝終端なので鍵扉2枚・北入口2セル以外は全壁
	for (let c = 0; c < COLS; c++) {
		const north = t.grid[0][c], want = ENTRY_CELLS.includes(key(0, c)) ? '.' : '#';
		if (north !== want) throw new Error(`北の外周: (0,${c}) は '${want}' でなく '${north}'`);
		const south = t.grid[ROWS - 1][c], wantS = DOOR_CELLS.includes(key(ROWS - 1, c)) ? 'D' : '#';
		if (south !== wantS) throw new Error(`南の外周: (9,${c}) は '${wantS}' でなく '${south}'`);
	}
	for (let r = 0; r < ROWS; r++) {
		if (t.grid[r][0] !== '#') throw new Error(`西の外周が漏れている: (${r},0)`);
		if (t.grid[r][COLS - 1] !== '#') throw new Error(`東の外周が漏れている: (${r},11)`);
	}
	// ② 鍵扉の手前が床
	for (const a of DOOR_APPROACH) if (!t.floors.has(a)) throw new Error(`鍵扉の手前 ${a} が床でない`);
	// ⑤ 各ボタンに石を押し込める向きが1つ以上ある
	for (const b of t.buttons) {
		if (!pushableInto(t, b)) throw new Error(`ボタン ${b} へ石を押し込める向きが無い＝解なし`);
	}
	// ③ 石ゼロで北入口から全要所へ歩ける
	const open = walkSet(t.entries[0], (k) => t.floors.has(k));
	for (const [label, cell] of [['鍵', t.keyCell],
		...t.buttons.map((b) => ['ボタン', b]), ...DOOR_APPROACH.map((a) => ['扉の手前', a]),
		...t.entries.map((e) => ['入口', e])]) {
		if (!open.has(cell)) throw new Error(`石ゼロでも入口から ${label} ${cell} へ行けない`);
	}
	for (const f of t.floors) if (!open.has(f)) throw new Error(`床 ${f} が入口から到達できない（孤立区画）`);
	// ④ 解けた状態（石が全ボタン上・以後ロックで不動）でも要所へ歩ける
	const solved = new Set(t.buttons);
	const afterSolve = walkSet(t.entries[0], (k) => t.floors.has(k) && !solved.has(k));
	for (const [label, cell] of [['鍵', t.keyCell], ...DOOR_APPROACH.map((a) => ['扉の手前', a])]) {
		if (!afterSolve.has(cell)) throw new Error(`解いた後（石がボタン上で固定）に入口から ${label} ${cell} へ行けない`);
	}
}

// ── 逆算(pull-BFS)：ゴール（石が全ボタン上）から「引き」で初期配置候補を作る ────────
function pullBFS(t) {
	const noStone = new Set([...t.entries, t.keyCell]);
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

/** 初期配置で北入口から目標セルへ歩いて行けるか。 */
function walkReachable(t, stones, target) {
	const blocked = new Set(stones);
	if (!t.floors.has(target) || blocked.has(target)) return false;
	return walkSet(t.entries[0], (k) => t.floors.has(k) && !blocked.has(k)).has(target);
}

// ── 候補を実ゲーム遷移＋4軸で測る ───────────────────────────────────────────────
export function buildTiles(t, stonePlacement) {
	const stoneSet = new Set(stonePlacement);
	const tiles = t.grid.map((row) => [...row]);
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (tiles[r][c] === 'D') tiles[r][c] = TILE.WALL;
		if (stoneSet.has(key(r, c))) tiles[r][c] = TILE.STONE;
	}
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	return { tiles, bg };
}

/** 軸②の貪欲モデル（D4/D6/D8 と同じ「押し単位のマクロ貪欲」）。 */
function makeGreedyPush(t) {
	const bpos = t.buttons.map(parse);
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	const perms = (xs) => xs.length <= 1 ? [xs]
		: xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
	const BPERM = perms(bpos.map((_, i) => i));   // 石4＝24通り
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
export function buildProblem(t, stonePlacement) {
	const { tiles, bg } = buildTiles(t, stonePlacement);
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false });
	const start = S.encode(...parse(t.entries[0]), S.initStones, 0, 0, 0);
	const goalTest = (state) => {
		const f = state.split('|');
		return f[0] === t.keyCell && f[5] === '1';
	};
	return { S, start, goalTest };
}

// ⚠️ 旧 measurePlacement（全到達状態を rev グラフ付きで保持する measureMetrics で
//    deadlock/強制手率/noEscape を測る）は 2026-08-09 に**廃止**した＝これが OOM の主因。
//    L は pull-BFS の引き距離で無料で取れる ∴ フル BFS は不要。貪欲NG は buildProblem +
//    makeGreedyPush の前向き探索だけで判定する（下の実行ループ参照）。

// ── 実行 ────────────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1]?.endsWith('generate-key-room-dark-tower-43.mjs') ?? false;
const only = IS_MAIN ? process.argv.slice(2)[0] : undefined;
const list = IS_MAIN ? (only ? TEMPLATES.filter((x) => x.name === only) : TEMPLATES) : [];
if (IS_MAIN && !list.length) throw new Error(`テンプレが無い: ${only}`);

for (const tpl of list) {
	const t = analyze(tpl.template);
	assertGeometry(t);
	console.log(`\n════ ${tpl.name} ════`);
	tpl.template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
	console.log(`  ボタン ${t.buttons.join(' / ')}  鍵 ${t.keyCell}  入口 ${t.entries.join(' / ')}  扉 ${t.doors.join(' / ')}`);
	console.log(`  床 ${t.floors.size} セル（測定では鍵扉は壁扱い＝鍵未所持）`);
	if (GEOM_ONLY) { console.log('  (GEOM_ONLY: assertGeometry を通過)'); continue; }

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

	const candCap = Number(process.env.CAND_CAP ?? 1500);
	let pool = cands;
	if (cands.length > candCap) {
		const st = cands.length / candCap;
		pool = Array.from({ length: candCap }, (_, i) => cands[Math.floor(i * st)]);
		console.log(`  ⚠️ 候補を ${cands.length} → ${pool.length} に等間隔サンプル（CAND_CAP=${candCap}）`
			+ `＝全候補は見ていない（${cands.length - pool.length} 通りは未評価＝見落としの可能性を明示）`);
	} else {
		console.log(`  候補は全 ${pool.length} 通りを評価（CAND_CAP=${candCap} に未達＝打ち切りなし）`);
	}

	// 篩：貪欲（マクロ押し）は安い∴先に軸②で篩う。
	const greedyFn = makeGreedyPush(t);
	const insight = [];
	for (const cand of pool) {
		const p = buildProblem(t, cand.stones);
		if (!greedyFn(p.S, [p.start], p.goalTest)) insight.push(cand);
	}
	console.log(`  貪欲で解ける（軸②未達）${pool.length - insight.length} 件 / 軸②クリア ${insight.length} 件`);
	if (!insight.length) { console.log(`  ✗ ${tpl.name}：軸②（貪欲NG）を通る候補が無い`); continue; }

	// L（押し手数）は pull-BFS の引き距離そのもの＝後段のフル BFS は不要（OOM 回避）。
	// 貪欲NG を満たす候補を L の深い順に並べ、L_MIN 以上を採用可とする。
	const byL = [...insight].sort((a, b) => b.pulls - a.pulls);
	const deepest = byL[0];
	console.log(`  軸②クリア ${insight.length} 件の L（押し手数）分布: 最大 ${deepest.pulls} / 最小 ${byL[byL.length - 1].pulls}`);
	// 上位を一覧（実測値を見て L_MIN を確定するため）。
	const topN = Math.min(Number(process.env.TOP_N ?? 12), byL.length);
	for (let i = 0; i < topN; i++) {
		const c = byL[i];
		console.log(`    · L=${c.pulls} 石 ${c.stones.join(' ')} プレイヤー初期 ${c.player}`);
	}
	if (pull.truncatedAt != null && deepest.pulls >= pull.truncatedAt)
		console.log(`  ⚠️ 最大 L=${deepest.pulls} は PULL_CAP 打ち切り(${pull.truncatedAt})に達している＝さらに深い L がある可能性`);

	const passed = byL.filter((c) => c.pulls >= L_MIN && c.pulls <= L_MAX);
	console.log(`  L≥${L_MIN}${Number.isFinite(L_MAX) ? `かつL≤${L_MAX}` : ''} を満たす貪欲NG候補: ${passed.length} 件`);
	if (!passed.length) {
		console.log(`  ✗ ${tpl.name}：L≥${L_MIN} の合格盤面なし（実測最大 L=${deepest.pulls}）`
			+ `＝テンプレ調整で L を伸ばすか、L_MIN をこの実測値に合わせて再判断（or A戦闘型へ切替）`);
		continue;
	}

	// 最も深い L を採る。
	const cand = passed[0];
	console.log(`  ✅ 採用 石 ${cand.stones.join(' ')}（L=${cand.pulls}・貪欲NG・プレイヤー初期 ${cand.player}）`);
	const { tiles } = buildTiles(t, cand.stones);
	const shown = tiles.map((row, r) => row.map((ch, c) => (DOOR_CELLS.includes(key(r, c)) ? 'D' : ch)).join(''));
	console.log('  ── 採用盤面 ──');
	shown.forEach((row, r) => console.log('    ', String(r).padStart(2), row));
	console.log(`  ── migrate 用 ── STONES=${cand.stones.join(' ')}  PLAYER=${cand.player}  ENTRY=${t.entries.join(' ')}  L=${cand.pulls}`);
}
