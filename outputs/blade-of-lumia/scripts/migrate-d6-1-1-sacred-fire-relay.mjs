// dungeon_6 `1,1`：D4 `1,1` の写しだった「ロウソクで3本灯すかがり火の間」を
// 「聖樹の火の継ぎ渡し」（ブーメランで火を3回継ぐ）に作り替える
// （2026-10-12 / PLAN 実行キュー 47 の第2陣 1室目・設計は Opus、主題はユーザー選択）
//
// ■ 何が壊れていたか（キュー47 の指摘＋着手時の実測）
//   D4 `1,1` と D6 `1,1` は盤面がほぼ同じ（かがり火3本 (2,3)(2,7)(5,5) を床の上に置き、
//   ロウソクで歩いて灯す）。D6 は D4 の報酬（ロウソク）を使い回すだけの写しだった。
//   ユーザー判定（2026-10-12）＝D4 のボス前は見本として残し、D6 `1,1` はロウソク頼みをやめ、
//   森の聖域らしい別の仕掛けにする。
//
// ■ 新しい `1,1`＝聖樹の火の継ぎ渡し
//      0 ############
//      1 #.tttt.....#
//      2 #.HtHt.....#     ← 聖樹の火 F(2,2)＝初めから点いている・A(2,4)
//      3 #..tttt..i.#     ← 鍵番の書き置き (3,9)＝据え置き
//      4 ...tHtHt.>..     ← B(4,4)・C(4,6)・ワープ `>`(4,9)＝据え置き
//      5 ....ttt.....
//      6 #..........#
//      7 #..........#
//      8 #i.........#     ← 看板 (8,1)＝文言だけ書き換え
//      9 #####..#####
//   部屋の西寄りに木立ち（聖域の森）を置き、その中にかがり火4本を「+」の形に並べた。
//   ・F(2,2) は `initLitTorches`＝消えない聖樹の火（火元）。
//   ・A・B・C は四方が木＝隣に立てる床が無い∴ロウソク（前方1マス・`game/game.js` playCandle）
//     では1本も点かない。点ける手はブーメランで火を運ぶことだけ（`game/projectile.js`
//     collectAlongBoomerang＝直線上に点いた火があれば、その直線上の消えた火が全部点く）。
//   ・かがり火が同じ直線に並ぶのは F–A（行2）・A–B（列4）・B–C（行4）の3組だけ＝木の鎖。
//     ∴F→A→B→C の順にしか継げない（A が点くまで列4 には火元が無い・B が点くまで行4 にも無い）。
//     解は3投で、投げる座が毎回変わる＝行2 の西 (2,1)→右／列4 の南 (6,4)→上／行4 の東 (4,8)→左
//     （行2 は東の (2,6)→左、行4 は西の (4,2)→右 でも同じ）。
//   ・D2 `0,1`（ブーメランで火を運ぶ初出・2投・1回曲がる）の再演を一段深くした形。ほかの
//     火の受け渡しの部屋（D2 `1,3`・D4 `3,3`・塔 `3,5`・field 4室）はどれも1〜2投の1直線。
//   ・伝承「森の民は聖樹の火を絶やさぬ番人だった」（入口 `1,3` の手記）と合わせた。
//   ・全点灯（`torchesLit`）で鍵の部屋 `1,0` へのワープ `>`(4,9) が現れる（据え置き）。
//   ・3つの口（西・東・南）の通り抜けは木立ちの南（行5〜8）と北東を回る。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・銀・星のブーメラン、二周目の倍速は届きが伸びる（部屋の端まで届く）。届きが伸びても
//     かがり火の並ぶ直線は同じ3組∴順序と投げる回数は変わらない（下の ③ が全ティアで実測）。
//   ・翼の羽衣は木の上を飛べない（`FLYABLE_OVER` に木が無い）。
//
// ■ 撤去したもの
//   旧かがり火 (2,3)(2,7)(5,5)。看板 (8,1) の旧文「灯を 持つ 者だけが 巨人の 間へ 進める。」。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／initLitTorches／showConditions・mapEnters・鍵番の書き置きが据え置き／看板の文言
//   ・3つの口が互いに歩いてつながる／ワープ (4,9) と投げる座へ歩ける／外周の口の形が同じ
//   ・A・B・C の隣に立てる床が0マス
//   ・火の受け渡しの実測（collectAlongBoomerang と同じ規則・ティアごとの実効の届き）で：
//     全ティアで最短3投・ロウソクだけでは点かない・継ぐ順は A→B→C だけ
//     対照＝聖樹の火を消すと解けない／(2,3) を '#' にすると解けない／(4,5) を床にすると
//     ロウソクで B・C が点いて投げる回数が減る
//   ・ソルバーで全点灯に届く／道具無しでは届かない／入って詰む状態が0
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-1-1-sacred-fire-relay.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-1-1-sacred-fire-relay.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver, ROWS, COLS } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_6';
const ROOM  = '1,1';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'############',
	'#.tttt.....#',
	'#.HtHt.....#',
	'#..tttt..i.#',
	'...tHtHt.>..',
	'....ttt.....',
	'#..........#',
	'#..........#',
	'#i.........#',
	'#####..#####',
];
const FIRE = '2,2';   // 聖樹の火（初めから点いている）
const A = '2,4', B = '4,4', C = '4,6';
const UNLIT = [A, B, C];
const WARP = '4,9';
const OPENINGS = { 西: ['4,0', '5,0'], 東: ['4,11', '5,11'], 南: ['9,5', '9,6'] };
const SIGN = '8,1';
const SIGN_DATA = {
	name: '聖樹のかがり火の間',
	lines: [
		'【聖樹のかがり火の間】',
		'聖樹の 火は 絶えず 燃える。',
		'木立ちの 灯へ その 火を 継げ。',
	],
};
// 据え置き（書き換え前と同じであることを確かめる）
const KEEP_SHOW = { [WARP]: { trigger: 'torchesLit' } };
const KEEP_ENTERS = { [WARP]: { id: 'd6_gatehall', destId: 'd6_bosswing' } };
const KEEP_NOTE = '3,9';

// ブーメランの実効の届き（セル数）＝`migrate-d4-3-3-lava-relay.mjs` reachOf と同じ式
// （`game/projectile.js` の往路をなぞる）。↑← と →↓ で 1 セル違う。二周目は速度が2倍。
function reachOf(tier, speedMul = 1) {
	const step = tier.speed * speedMul * MOVE_STEP;
	let p = 0.5;
	while (p < tier.maxRange) p += step;
	const travel = p + step;
	return { neg: Math.ceil(travel - 0.5), pos: Math.floor(travel + 0.5) };
}
const TIERS = [
	...BOOMERANG_TIERS.map((t) => [t.name, reachOf(t)]),
	...BOOMERANG_TIERS.map((t) => [`${t.name}（二周目）`, reachOf(t, 2)]),
];

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const room = stages[ROOM];
if (!room) die(`${LAYER} ${ROOM} が無い`);

const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
const baseClosed = layerRun();
const baseOpen = layerRunOpen();

const before = room.tiles.map(rowStr);
const beforeShow = JSON.stringify(room.showConditions ?? {});
const beforeEnters = JSON.stringify(room.mapEnters ?? {});
const beforeNote = JSON.stringify(room.signData?.[KEEP_NOTE] ?? null);
const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if (JSON.stringify(room.initLitTorches ?? []) !== JSON.stringify([FIRE])) {
	room.initLitTorches = [FIRE];
	log.push(`  ${ROOM}: initLitTorches を [${FIRE}]（聖樹の火）にした`);
}
room.signData ??= {};
if (JSON.stringify(room.signData[SIGN]) !== JSON.stringify(SIGN_DATA)) {
	room.signData[SIGN] = JSON.parse(JSON.stringify(SIGN_DATA));
	log.push(`  ${ROOM}: 看板 ${SIGN} の文言を書き換えた`);
}
room.bgTiles ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const at = (t, k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => `${rr},${cc}`);
};
// 3つの口から歩ける床。壁・木（HARD_BLOCKED）・かがり火は踏めない。
const standOk = (ch) => ch !== undefined && !HARD_BLOCKED.has(ch) && ch !== TILE.TORCH;
function walkable(t, from) {
	const seen = new Set(), q = [];
	for (const k of from) if (standOk(at(t, k))) { seen.add(k); q.push(k); }
	while (q.length) {
		const k = q.shift();
		for (const n of nbrs(k)) {
			if (seen.has(n) || !standOk(at(t, n))) continue;
			seen.add(n); q.push(n);
		}
	}
	return seen;
}
const allOpenings = Object.values(OPENINGS).flat();

// 火の受け渡しの実測＝`collectAlongBoomerang` と同じ規則（D4 `3,3` の移行と同じ実装）。
// 投擲物は '#' と未破壊 '!' で止まり（止まったセルでも通過判定は走る）、同じ道を戻る。
// 点いた H を通ると炎を拾い、炎を持って消えた H を通ると点ける＝往路・復路とも。
function throwFrom(t, k, dir, reach, lit) {
	const [r, c] = k.split(',').map(Number);
	const [dr, dc] = { 上: [-1, 0], 下: [1, 0], 左: [0, -1], 右: [0, 1] }[dir];
	const n = (dir === '上' || dir === '左') ? reach.neg : reach.pos;
	const path = [];
	for (let i = 1; i <= n; i++) {
		const kk = `${r + dr * i},${c + dc * i}`;
		const ch = at(t, kk);
		if (ch === undefined) break;
		path.push(kk);
		if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
	}
	const out = new Set(lit);
	let flaming = false;
	for (const kk of [...path, ...[...path].reverse()]) {
		if (at(t, kk) !== TILE.TORCH) continue;
		if (out.has(kk)) flaming = true;
		else if (flaming) out.add(kk);
	}
	return out;
}
// 状態＝点いたかがり火の集合で総当たり（BFS＝手数が最短の解を返す）。
function relay(t, reach, { candle = true, boomerang = true, init = [FIRE] } = {}) {
	const torches = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.TORCH) torches.push(`${r},${c}`);
	const stand = [...walkable(t, allOpenings)];
	const key = (s) => [...s].sort().join('|');
	const s0 = new Set(init);
	const seen = new Map([[key(s0), null]]);
	const q = [s0];
	while (q.length) {
		const s = q.shift();
		if (torches.length && torches.every((x) => s.has(x))) {
			const steps = []; let k = key(s);
			while (seen.get(k)) { const [pk, mv] = seen.get(k); steps.unshift(mv); k = pk; }
			return steps;
		}
		const moves = [];
		for (const k of stand) {
			if (candle) for (const n of nbrs(k)) {
				if (at(t, n) === TILE.TORCH && !s.has(n)) moves.push([new Set([...s, n]), `ロウソク ${k}→${n}`]);
			}
			if (boomerang) for (const d of ['上', '下', '左', '右']) {
				const n = throwFrom(t, k, d, reach, s);
				if (n.size > s.size) moves.push([n, `ブーメラン ${k}→${d}`]);
			}
		}
		for (const [n, mv] of moves) {
			const k = key(n);
			if (!seen.has(k)) { seen.set(k, [key(s), mv]); q.push(n); }
		}
	}
	return null;
}
// 点いた集合 lit から、1投で新たに点く集合を全部並べる（継ぐ順の検査用）
function nextLit(t, reach, lit) {
	const out = new Set();
	for (const k of walkable(t, allOpenings)) for (const d of ['上', '下', '左', '右']) {
		const n = throwFrom(t, k, d, reach, lit);
		const added = [...n].filter((x) => !lit.has(x)).sort();
		if (added.length) out.add(added.join('+'));
	}
	return [...out].sort();
}

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`${ROOM} の initLitTorches＝聖樹の火 ${FIRE} だけ`, JSON.stringify(room.initLitTorches) === JSON.stringify([FIRE]));
{
	const torches = t.flatMap((row, r) => row.map((ch, c) => (ch === TILE.TORCH ? `${r},${c}` : null))).filter(Boolean);
	check(`かがり火は ${FIRE}・${UNLIT.join('・')} の4本（実測 ${torches.join(' ')}）`,
		JSON.stringify(torches.sort()) === JSON.stringify([FIRE, ...UNLIT].sort()));
}
check(`ワープ ${WARP} が '>' のまま`, at(t, WARP) === TILE.MAP_ENTER);
check(`showConditions が書き換え前と同じ（${WARP}=torchesLit）`,
	JSON.stringify(room.showConditions) === beforeShow && beforeShow === JSON.stringify(KEEP_SHOW));
check(`mapEnters が書き換え前と同じ（d6_gatehall→d6_bosswing）`,
	JSON.stringify(room.mapEnters) === beforeEnters && beforeEnters === JSON.stringify(KEEP_ENTERS));
check(`鍵番の書き置き ${KEEP_NOTE} が書き換え前と同じ`,
	JSON.stringify(room.signData[KEEP_NOTE]) === beforeNote && beforeNote !== 'null' && at(t, KEEP_NOTE) === TILE.SIGN);
check(`看板 ${SIGN} の文言が新しい3行`, JSON.stringify(room.signData[SIGN]) === JSON.stringify(SIGN_DATA) && at(t, SIGN) === TILE.SIGN);
check(`看板は ${SIGN}・${KEEP_NOTE} の2枚だけ`,
	t.flat().filter((x) => x === TILE.SIGN).length === 2 && Object.keys(room.signData).sort().join(' ') === [KEEP_NOTE, SIGN].sort().join(' '));
for (const ch of [TILE.STONE, TILE.BUTTON, TILE.GATE, TILE.SWITCH, TILE.BUSH, TILE.CHEST]) {
	check(`${ROOM} に '${ch}' が無い`, !t.some((row) => row.includes(ch)));
}
check(`${ROOM} の bgTiles が空`, Object.keys(room.bgTiles).length === 0);
check(`${ROOM} に敵が居ない（謎解きの部屋）`, !Object.keys(room.enemyDirs ?? {}).length);
check(`外周の口の形が書き換え前と同じ（西・東・南の3口）`, ringOf(room.tiles.map(rowStr)) === ringOf(before));

// ── ② 歩ける床 ──────────────────────────────────────────────────────
{
	for (const [name, cells] of Object.entries(OPENINGS)) {
		const w = walkable(t, cells);
		check(`${name}の口から他の2口へ歩ける`, allOpenings.every((k) => w.has(k)));
	}
	const w = walkable(t, allOpenings);
	const seats = ['2,1', '6,4', '4,8'];
	check(`口からワープ ${WARP} と投げる座 ${seats.join('・')} へ歩ける`, w.has(WARP) && seats.every((k) => w.has(k)));
	for (const k of UNLIT) {
		const nb = nbrs(k).filter((n) => w.has(n));
		check(`消えた火 ${k} の隣に立てる床が0マス（実測 ${nb.join(' ') || 'なし'}）`, nb.length === 0);
	}
}

// ── ③ 火の受け渡しの実測 ────────────────────────────────────────────
for (const [name, reach] of TIERS) {
	const sol = relay(t, reach);
	check(`${name}（届き ↑←${reach.neg}／→↓${reach.pos}）で全点灯は最短3投：${sol ? sol.join(' → ') : '解なし'}`,
		sol && sol.length === 3 && sol.every((mv) => mv.startsWith('ブーメラン')));
	check(`${name}：継ぐ順は A→B→C だけ（各段で1投で点くのは1本）`,
		JSON.stringify(nextLit(t, reach, new Set([FIRE]))) === JSON.stringify([A])
		&& JSON.stringify(nextLit(t, reach, new Set([FIRE, A]))) === JSON.stringify([B])
		&& JSON.stringify(nextLit(t, reach, new Set([FIRE, A, B]))) === JSON.stringify([C]));
}
{
	const wood = TIERS[0][1];
	const sol = relay(t, wood);
	// 投げる座は直線ごとに数か所ある（例＝行4 は (4,8)→左 でも (4,1)→右 でも届く）∴座ではなく
	// 「どの直線に投げたか」で見る＝1投目は行2・2投目は列4・3投目は行4。
	const lineOf = (mv) => {
		const [, k, d] = mv.match(/ブーメラン (\d+,\d+)→(.)/) ?? [];
		if (!k) return null;
		const [r, c] = k.split(',').map(Number);
		return (d === '上' || d === '下') ? `列${c}` : `行${r}`;
	};
	check(`木のブーメランの最短解は 行2 → 列4 → 行4 の順に投げる（実測 ${sol?.join(' / ')}）`,
		sol && sol.map(lineOf).join(' ') === '行2 列4 行4');
	check(`ロウソクだけ（ブーメラン無し）では1本も点かない`, nextLitCandle(t).length === 0 && relay(t, wood, { boomerang: false }) === null);
	// 対照①＝聖樹の火を '#' にすると、どの道具でも点かない（火元が要）。
	//         ⚠️「消す」（init を空にする）は対照にならない＝聖樹の隣は床なのでロウソクで点け直せる。
	const noFire = grid(); noFire[2][2] = TILE.WALL;
	check(`対照：聖樹の火 ${FIRE} を '#' にするとロウソク＋ブーメランでも全点灯できない`, relay(noFire, wood, { init: [] }) === null);
	// 対照②＝F と A の間の木 (2,3) を壁にすると最初の1投が通らない（潰すのは必ず '#'
	//         ＝[[blade-control-experiment-needs-tile-wall]]）
	const wall = grid(); wall[2][3] = TILE.WALL;
	check(`対照：(2,3) を '#' にすると全点灯できない（行2 が火の通り道）`, relay(wall, wood) === null);
	// 対照③＝B の南の木 (5,4) を床にすると、(6,4) から歩いて入ってロウソクで B が点く
	//         ＝投げる回数が減る（木で囲んだことがロウソク封じの本体）
	const open = grid(); open[5][4] = TILE.FLOOR;
	const s3 = relay(open, wood);
	check(`対照：(5,4) を床にするとロウソクが混ざり、投げるのが3回未満になる（実測 ${s3?.join(' → ')}）`,
		s3 && s3.some((mv) => mv.startsWith('ロウソク')) && s3.filter((mv) => mv.startsWith('ブーメラン')).length < 3);
}
function nextLitCandle(tt) {
	const w = walkable(tt, allOpenings);
	return UNLIT.filter((k) => nbrs(k).some((n) => w.has(n)));
}

// ── ④ ソルバー（状態空間）＝全点灯に届く・詰まない ─────────────────────
{
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const solve = (opts) => {
		const S = makeSolver(t, bg, [], {}, new Set([FIRE]), { hasLadder: true, ...opts });
		const starts = allOpenings.map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const fullLit = (1 << S.torchCells.length) - 1;
		return measureMetrics(S, starts, (st) => Number(st.split('|')[4]) === fullLit, () => 0,
			{ guardMax: 2_000_000, escapeTest: (st) => S.exitCells.includes(st.split('|')[0]) });
	};
	const on = solve({ hasCandle: true });
	check(`ソルバー（ロウソク＋ブーメラン）で全点灯に届く（L=${on.L}）`, on.L !== null);
	check(`入って詰む状態が無い（実測 noEscape=${on.noEscape}）`, on.noEscape === 0);
	check(`対照：ソルバーでも道具無しでは全点灯に届かない`, solve({ noTools: true }).L === null);
}

// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
{
	const closed = layerRun();
	const open = layerRunOpen();
	const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
		same(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
		same(open.reachedRooms, baseOpen.reachedRooms));
	check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：D4 の写しの「かがり火の間」を「聖樹の火の継ぎ渡し」に作り替える（キュー47）`);
console.log(log.join('\n') || '  （変更なし）');

console.log(`\n## 盤面の差分（${ROOM}）`);
room.tiles.forEach((row, i) => {
	console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${rowStr(row)}`);
});

console.log('\n## 検証');
let ng = 0;
for (const [cond, msg] of verify) {
	console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
	if (!cond) ng++;
}
if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);

if (DRY) {
	console.log('\n--dry: 書き込みなし');
} else {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
	console.log('\n書き込み完了:', MAP_PATH);
}
