#!/usr/bin/env node
/**
 * generate-key-room-dark-tower-43.mjs — dark_tower の鍵部屋 [4,3] を
 * 「純倉庫番（C）・石4・狭く濃い」盤面にするため逆算生成＋実ゲーム遷移フル BFS で
 * 濃さを測って選別する（PLAN 実行キュー 5.5i）。
 *
 * ⚠️ 2026-08-09（ユーザー確定・作り直し）の設計方針：
 *   - この部屋は **色ゲートを使わない純倉庫番（石4）**。合成移植（26,0）は採らない
 *     （26,0 は深洋O の寄り道用に温存）。
 *   - 前作（純倉庫番・石4・L=42・床66 の広い盤面）はユーザー実感で否定された
 *     ＝「簡単。23,0 の方が難しくない?」。**L（押し手数）は必要条件だが十分条件でない**。
 *     広い盤面は「石を遠くへ運ぶだけ」で L を水増しでき、体感の難しさに繋がらない。
 *   - **難しさの主役は「濃さ」**＝ deadlock 比（誤手が回復不能になる割合）・強制手率
 *     （進める手が1つしかない状態の割合）・最短解本数（一本道か）。これらは
 *     **全到達状態を列挙して初めて測れる**＝盤面を**狭く**保てば（状態が完全展開できる範囲に
 *     収まれば）測定できる。23,0 は状態 234万で完全展開できた実績がある。
 *
 * 「基準機」= test_mechanics 23,0（激難試作・石4）。実測（2026-08-09・.scratch/density.mjs）：
 *     状態 2,348,945（完全展開）/ L押 21 / L歩 80 / 貪欲NG /
 *     deadlock 1,852,062（比 0.79）/ 最短解本数 6 / 強制手率 0.13
 *   → **新盤面はこの全軸を下限として上回る**：L押≥21・最短解本数≤6・強制手率≥0.13・
 *     deadlock比≥0.79・貪欲NG。かつ **状態が DENSITY_CAP 以内で完全展開できる**
 *     （＝24,0(=現4,3) はここでフル BFS が OOM＝広すぎ＝不採用。この上限が「狭さ」を強制する）。
 *
 * 部屋の位相（実データで再確認・2026-08-09）：
 *   ・入口＝北 (0,5)(0,6)（`4,2` から歩いて降りてくる。ワープではない）
 *   ・もう一方の出口＝南の鍵扉 `DD`(9,5)(9,6) → `4,4`（ステージキーは "x,y"＝[4,3] の南は [4,4]）
 *   ・東西の外周は全壁＝入口と鍵扉の2辺しかない **終端相当**∴部屋を丸ごとパズルに使える。
 *   ・鍵 `K` は (7,6) 据え置き。入場時の道具＝全部（**笛を持っている**）。
 *
 * 詰み救済（D8 と違い笛がある）：
 *   (a) 北の入口 (0,5)(0,6) へ戻って隣室へ出る＝enterStage が未解決の石を初期位置へ戻す
 *   (b) `fluteEffect:{type:'resetStones'}`＝その場で石を初期位置へ戻す
 *   ∴ D8 のような「前室へ石を1個も入れない」帰納法は**不要**。noEscape は測っても
 *      不合格にしない（migrate 側で必ず笛を付ける＝倉庫番の詰みは笛で回復できる）。
 *
 * 部屋固有の不変条件（assertGeometry が検査・違反は全部まとめて投げる）：
 *   ① 外周：北 (0,5)(0,6) が入口の床・南 (9,5)(9,6) が鍵扉 'D'・他は全壁。
 *   ② 鍵扉の手前 (8,5)(8,6) が床／鍵は (7,6)。
 *   ③ 石ゼロで北入口から鍵・全ボタン・扉の手前・全床へ歩ける（孤立区画が無い）。
 *   ④ 解けた状態（石が全ボタン上＝以後ロックで不動）でも入口から鍵・扉の手前へ歩ける。
 *   ⑤ 各ボタンに石を押し込める向きが1つ以上ある（無いと解なし）。
 *   ⑥ tiles 層に見た目だけの地面タイルを混ぜない／敵を置かない／色ゲート 'T' 'B' も無い。
 *
 * 測定（2段）：
 *   1. 逆算 pull-BFS（石+プレイヤーだけの軽い状態）で「押し手数 L」の候補を作る。
 *      押しと引きは厳密に逆操作∴ goal から引いた距離 = その配置から goal への最短押し手数。
 *   2. L 上位を実ゲーム遷移フル BFS（makeSolver + measureMetrics）に掛け、
 *      deadlock比・強制手率・最短解本数を測る。状態が DENSITY_CAP 超＝広すぎ＝不採用
 *      （＝これが「狭さ」の強制フィルタ＝23,0 は 234万で通り、24,0 は OOM 域で落ちる）。
 *
 * ⚠️ 実マップ（work/blade-of-lumia.json）は変更しない（採用盤面をコンソールに出すだけ）。
 *    書き込みは scripts/migrate-key-room-dark-tower-43.mjs。
 *
 * 使い方（outputs/blade-of-lumia/ で実行）:
 *   node scripts/generate-key-room-dark-tower-43.mjs               # 全テンプレ
 *   node scripts/generate-key-room-dark-tower-43.mjs d1            # 指定テンプレだけ
 *   GEOM_ONLY=1 node scripts/generate-key-room-dark-tower-43.mjs   # 幾何 assert だけ（テンプレ検証）
 *   CAND_CAP=200 DENSITY_CAP=4000000 node scripts/generate-key-room-dark-tower-43.mjs
 */

import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';
import { TILE } from '../shared/tiles.js';

// ── 盤面テンプレ ────────────────────────────────────────────────────────────
//   '#' 壁 / '.' 床 / 'S' ボタン（石の目標）/ 'K' 鍵（(7,6) 固定）
//   北 (0,5)(0,6) が入口の床 / 'D' 鍵扉（南 (9,5)(9,6)・測定では壁扱い＝鍵未所持）
//   石の初期位置は逆算(pull-BFS)で決めるのでテンプレには書かない。
//
// 設計方針（2026-08-09・23,0 に倣う）：狭く濃くする＝**内部にピラー（#）の格子を敷き**、
//   床を絞って（目安 40〜52 セル）状態空間が完全展開できる範囲に収める。開けた広間を作らない。
//   23,0 の DNA＝「ピラー格子＋所々の抜け道」で石の搬送路が曲がりくねり交差する＝独立に運べない
//   （貪欲NG）・誤手が回復不能（deadlock 多）・進路が一本道（強制手率高・最短解本数少）。
//   ボタンは隅・袋小路寄りに置き、そこへ石を押し込む向きが幾何で1つに絞られるようにする。
// ⚠️ テンプレは**座標で組む**（文字列直書きは幅ミスを量産した＝2026-08-09）。
//   buildTemplate が 10×12 の外周・入口・扉・鍵・ボタン・内部ピラーを機械生成する
//   ∴行の幅は構造的に必ず 12 になる。ボタンとピラーだけを "r,c" で与える。
const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const ENTRY_CELLS = ['0,5', '0,6'];
const DOOR_CELLS = ['9,5', '9,6'];
const DOOR_APPROACH = ['8,5', '8,6'];
const KEY_CELL = '7,6';

/**
 * 座標指定から 10×12 テンプレ行配列を作る。
 *   外周＝壁（北 (0,5)(0,6) だけ床・南 (9,5)(9,6) だけ 'D'）／鍵 (7,6)＝'K'／
 *   buttons＝'S'／pillars＝内部の壁 '#'／それ以外の内部＝床 '.'。
 */
function buildTemplate({ buttons, pillars }) {
	const g = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const onRing = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
		if (onRing) g[r][c] = '#';
	}
	for (const e of ENTRY_CELLS) { const [r, c] = parse(e); g[r][c] = '.'; }
	for (const d of DOOR_CELLS) { const [r, c] = parse(d); g[r][c] = 'D'; }
	for (const p of pillars) { const [r, c] = parse(p); g[r][c] = '#'; }
	for (const b of buttons) { const [r, c] = parse(b); g[r][c] = 'S'; }
	const [kr, kc] = parse(KEY_CELL); g[kr][kc] = 'K';
	return g.map((row) => row.join(''));
}

// ⚠️ 設計の要（2026-08-09・実測で確定）：**L 押は広さでなく「狭さ＋不規則ピラー」で稼ぐ**。
//   規則的千鳥（床61）は石が直進でき L 押 8 止まり。開けた広間（床64-71）は L 押 21+ 出るが
//   状態が 4M 超で全件 tooWide＝スカスカ＝前作と同じ轍。基準機 23,0 は **床50・不規則な単マス
//   ピラー散在**で L 押 21・状態 234万（完全展開）＝濃い。∴床を 48〜54 に絞り、ピラーを不規則に
//   置いて石の回り込みを強制する核にする。ボタンは各象限のポケット。鍵 (7,6)・扉手前 (8,5)(8,6)。
export const TEMPLATES = [
	{
		// e1：内部を単マスピラーで不規則に仕切る。ボタン (1,1)(1,10)(7,1)(7,10)。
		name: 'e1',
		buttons: ['1,1', '1,10', '7,1', '7,10'],
		pillars: ['2,2', '2,7', '3,3', '3,5', '4,1', '4,7', '5,3', '5,5', '6,2', '6,7', '6,9', '8,3', '8,8'],
	},
	{
		// e2：櫛歯を左右非対称にずらして石の左右搬送を折れ線に強制する。
		name: 'e2',
		buttons: ['1,1', '1,10', '7,1', '7,10'],
		pillars: ['2,3', '2,6', '3,4', '3,8', '4,1', '4,5', '5,3', '5,7', '6,4', '6,8', '8,2', '8,4', '8,9'],
	},
];
const GEOM_ONLY = !!process.env.GEOM_ONLY;
// 逆算(pull-BFS)の展開上限。切ったら「どこまで見たか」をログに出す（黙って切らない）。
const PULL_CAP = Number(process.env.PULL_CAP ?? 5000000);
// フル BFS（濃さ測定）の状態上限＝**狭さの強制フィルタ**。超えたら「広すぎ」で不採用。
// 23,0 は 234万で完全展開できた∴既定 4,000,000（24,0 はこの域で OOM＝落ちる）。
const DENSITY_CAP = Number(process.env.DENSITY_CAP ?? 4000000);

const STONE_COUNT = 4;

// ── 基準機 23,0 の実測（.scratch/density.mjs・2026-08-09）＝この全軸を下限として超える ──
const BASE = {
	Lpush: 21,           // 押し手数（pull-BFS 引き距離）
	solCount: 6,         // 最短解本数（少ないほど一本道＝難しい）
	forcedRatio: 0.13,   // 強制手率（高いほど一本道＝難しい）
	deadlockRatio: 0.79, // deadlock/states（高いほど誤手が回復不能＝濃い）
};

// tiles 層に置いてはいけない「見た目だけの地面タイル」（塗りは bgTiles の仕事）。
const DECOR_TILES = new Set(['d', 'g', 'o', 's', 'a', 'm']);
// 敵タイル（この部屋には置かない＝敵が石を押す）。
const ENEMY_RE = /[WECFVXZALNJOUGI]/;
// 使ってはいけないギミック（色ゲート/色スイッチ/ゲート/宝箱/潮＝この部屋では使わない）。
const FORBIDDEN_GIMMICKS = new Set(['(', ')', '[', ']', 'T', 'B', '=']);

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

// ── 候補を実ゲーム遷移で組み立てて測る ───────────────────────────────────────────
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

/** 盤面をソルバー問題に組み立てる。ゴール＝石ロック済み（＝全ボタンに石＝stonesPlaced）。 */
export function buildProblem(t, stonePlacement) {
	const { tiles, bg } = buildTiles(t, stonePlacement);
	const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false });
	// 入口2セルの両方を start にする（どちらから降りても最短で何手か）。
	const starts = t.entries.map((e) => S.encode(...parse(e), S.initStones, 0, 0, 0));
	// ゴール＝ロックビットが立つ（＝全ボタンに石が乗った＝基準機 23,0 と同じ尺度）。
	const goalTest = (state) => state.split('|')[5] === '1';
	return { S, starts, goalTest };
}

/** 濃さヒューリスティック（貪欲の既定 h と同じ形＝石→最寄りボタンのマンハッタン和）。 */
function makeHeuristic(t) {
	const bpos = t.buttons.map(parse);
	const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
	return (state) => {
		const stonesStr = state.split('|')[1];
		const stones = stonesStr ? stonesStr.split(';') : [];
		let h = 0;
		for (const s of stones) { const sp = parse(s); h += Math.min(...bpos.map((b) => man(sp, b))); }
		return h;
	};
}

/**
 * 実ゲーム遷移フル BFS で濃さ4軸を測る。状態が DENSITY_CAP 超なら「広すぎ」で null
 * （＝measureMetrics が throw＝それを捕まえる）。返り＝{states,L,greedy,deadlocks,solCount,forcedRatio,deadlockRatio}。
 */
function measureDensity(t, stonePlacement, greedyFn) {
	const { S, starts, goalTest } = buildProblem(t, stonePlacement);
	const h = makeHeuristic(t);
	try {
		const m = measureMetrics(S, starts, goalTest, h, { guardMax: DENSITY_CAP, greedyFn });
		if (m.L === null) return null;   // ゴール到達不能（実ゲーム遷移では解けない配置）
		return { ...m, deadlockRatio: m.states ? m.deadlocks / m.states : 0 };
	} catch (e) {
		return { tooWide: true };        // 状態 > DENSITY_CAP＝広すぎ（スカスカ）＝不採用
	}
}

/** 23,0（基準機）を全軸で上回るか。 */
function beatsBaseline(d) {
	return !d.greedy
		&& d.L !== null
		&& (typeof d.solCount === 'number' ? d.solCount : Infinity) <= BASE.solCount
		&& d.forcedRatio >= BASE.forcedRatio
		&& d.deadlockRatio >= BASE.deadlockRatio;
}

// ── 実行 ────────────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1]?.endsWith('generate-key-room-dark-tower-43.mjs') ?? false;
const only = IS_MAIN ? process.argv.slice(2)[0] : undefined;
const list = IS_MAIN ? (only ? TEMPLATES.filter((x) => x.name === only) : TEMPLATES) : [];
if (IS_MAIN && !list.length && only) throw new Error(`テンプレが無い: ${only}`);

for (const tpl of list) {
	const template = buildTemplate(tpl);
	const t = analyze(template);
	assertGeometry(t);
	console.log(`\n════ ${tpl.name} ════`);
	template.forEach((row, r) => console.log('  ', String(r).padStart(2), row));
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
			: `  ⚠️ PULL_CAP=${PULL_CAP} で打ち切り＝引き距離 ${pull.truncatedAt} まで`));
	console.log(`  石${STONE_COUNT}配置候補: ${cands.length} 通り（押し手数 ${cands[0]?.pulls}〜${cands[cands.length - 1]?.pulls}）`);
	if (!cands.length) { console.log(`  ✗ ${tpl.name}：候補ゼロ（ボタンへ石を運べない盤面）`); continue; }

	// L 押 が 23,0 下限（21）以上の候補だけ濃さ測定に回す（それ未満は基準未達確定）。
	const eligible = cands.filter((c) => c.pulls >= BASE.Lpush).sort((a, b) => b.pulls - a.pulls);
	console.log(`  L押≥${BASE.Lpush} の候補: ${eligible.length} 通り`);
	if (!eligible.length) {
		console.log(`  ✗ ${tpl.name}：L押≥${BASE.Lpush} の候補なし（実測最大 L押=${cands[cands.length - 1].pulls}）`
			+ '＝テンプレを狭く/曲げて L を伸ばす必要');
		continue;
	}

	// 濃さ測定は重い∴ L 上位から CAND_CAP 件だけ実ゲーム遷移フル BFS に掛ける。
	const candCap = Number(process.env.CAND_CAP ?? 150);
	const pool = eligible.slice(0, candCap);
	if (eligible.length > candCap)
		console.log(`  ⚠️ L 上位 ${candCap} 件だけ濃さ測定（残り ${eligible.length - candCap} 件は未評価）`);

	const greedyFn = makeGreedyPush(t);
	const scored = [];
	let tooWide = 0, unsolved = 0, greedyOK = 0;
	for (const c of pool) {
		const d = measureDensity(t, c.stones, greedyFn);
		if (!d) { unsolved++; continue; }
		if (d.tooWide) { tooWide++; continue; }
		if (d.greedy) { greedyOK++; continue; }   // 貪欲で解ける＝軸②未達
		scored.push({ ...c, ...d });
	}
	console.log(`  濃さ測定 ${pool.length} 件 → 広すぎ棄却 ${tooWide} / 解なし ${unsolved} / 貪欲可 ${greedyOK} / 貪欲NG ${scored.length}`);
	if (!scored.length) { console.log(`  ✗ ${tpl.name}：貪欲NGかつ完全展開できる候補が無い`); continue; }

	// 23,0 を全軸で超える候補。無ければ「一番惜しい」も見せる。
	const passed = scored.filter(beatsBaseline);
	const rank = (d) => [d.deadlockRatio, -d.solCount, d.forcedRatio, d.L];
	const cmp = (a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < ra.length; i++) if (rb[i] !== ra[i]) return rb[i] - ra[i]; return 0; };
	scored.sort(cmp);
	console.log(`  基準機23,0 を全軸で超える候補: ${passed.length} 件`);
	const topN = Math.min(Number(process.env.TOP_N ?? 8), scored.length);
	console.log(`  ── 濃さ上位 ${topN} 件（基準: L押≥${BASE.Lpush} 解本数≤${BASE.solCount} 強制≥${BASE.forcedRatio} dl比≥${BASE.deadlockRatio}）──`);
	for (let i = 0; i < topN; i++) {
		const c = scored[i];
		console.log(`    ${beatsBaseline(c) ? '✅' : '  '} L押=${c.pulls} L歩=${c.L} 状態=${c.states} dl比=${c.deadlockRatio.toFixed(2)} 解本数=${c.solCount} 強制=${c.forcedRatio} 石 ${c.stones.join(' ')}`);
	}
	if (!passed.length) { console.log(`  ✗ ${tpl.name}：基準機を全軸で超える盤面なし（テンプレの幾何を詰め直す）`); continue; }

	passed.sort(cmp);
	const win = passed[0];
	console.log(`\n  ✅ 採用（${tpl.name}）石 ${win.stones.join(' ')}`);
	console.log(`     L押=${win.pulls} L歩=${win.L} 状態=${win.states} dl比=${win.deadlockRatio.toFixed(2)} 解本数=${win.solCount} 強制=${win.forcedRatio}`);
	const { tiles } = buildTiles(t, win.stones);
	const shown = tiles.map((row, r) => row.map((ch, c) => (DOOR_CELLS.includes(key(r, c)) ? 'D' : ch)).join(''));
	console.log('  ── 採用盤面 ──');
	shown.forEach((row, r) => console.log('    ', String(r).padStart(2), row));
	console.log(`  ── migrate 用 ── STONES=${win.stones.join(' ')}  PLAYER=${t.entries[0]}  ENTRY=${t.entries.join(' ')}  L押=${win.pulls}`);
}
