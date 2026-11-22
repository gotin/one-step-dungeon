// scripts/migrate-d8-4-4-fallen-trees.mjs
// 実行キュー112（2026-11-21）：沼地の神殿 D8 `4,4`（北→4,3・西→3,4 の行き止まり）を「倒木の渡し」（パズルの部屋）にする。
//
// ユーザー判断（2026-11-19）＝D8 の残りはパズルと戦闘を半々。パズルの部屋は強い敵を置かず、詰む手と気づきで難しくする。
// 主題はユーザー選択（2026-11-21「倒木の渡し」）＝D6 の枯れ木 `ŧ` を沼で使い直す。
//   規則（game/projectile.js fellTreesFromBlast）＝爆風を受けた枯れ木（爆心と同じ行か列・距離 1〜2）は爆心と反対へ倒れ、
//   先の2マスに幹が横たわる（水の上なら橋）。先が1マスでも塞がっていれば倒れない（揺れるだけ）。根元は切り株＝歩ける。
//   部屋を出ると立ち直る。はしご（game/passable.js）＝幅1の水を、両隣が水でない歩ける所なら渡れる（水の上の幹は橋脚にならない）。
//
// 直す前＝ルピー×2 が床に落ちた広間と、飾りの水たまり2枚。
// 新しい姿（`~` は bgTiles の水・枯れ木は水の中の小さな中州に立つ）：
//      0 #####..#####
//      1 #..........#     ← 北の岸
//      2 #..~~~~~~~~#
//      3 #..ŧŧ~~~~~~#     ← 枯れ木 A(3,3)・B(3,4)
//      4 ...~~ŧ~~~~~#     ← 枯れ木 C(4,5)
//      5 ...ŧ~~~~~~~#     ← 枯れ木 D(5,3)
//      6 #..~~~~~~~~#
//      7 #..~~ŧ~~~~~#     ← 枯れ木 E(7,5)
//      8 #..~~~B~~~~#     ← 宝箱 (8,6)＝ルピー×100（いつも見える）
//      9 ############
// 解き方（爆弾4個・1手目は (3,2) だけ）：
//   ① 西の岸 (3,2) で爆弾＝A は B に塞がれて揺れるだけ・B が東へ倒れて (3,5)(3,6) に橋。
//   ② 北の岸 (1,4) からはしごで (2,4) を渡り、B の切り株 (3,4) → 幹 (3,5) で爆弾＝A は西の岸へ倒れ、C は南へ倒れて (5,5)(6,5) に橋。
//   ③ A の切り株 (3,3) で爆弾＝D が南へ倒れて (6,3)(7,3) に橋。
//   ④ 西の岸 (5,2) → D の切り株 → 幹の先 (7,3) で爆弾＝E が東へ倒れて (7,6)(7,7)。
//   ⑤ C の幹 (5,5)(6,5) → E の切り株 (7,5) → (7,6) で宝箱の前。
// 気づき＝塞がった木は倒れない（手前の木で奥の木を倒す）・自分は倒したい向きの反対側に立つ・
//   ひとつの爆風で何本も倒れる（②で C が南へ倒れるのが最後の道になる）・幅1の水ははしご。
// 詰み＝向きを誤った木は戻らない（部屋を出て入り直す。西の口がすぐ横）。北の岸から B を倒すと南へ、西の岸から D を倒すと東へ倒れて解けなくなる。
// 敵なし。西の口のそば (6,1) に床の爆弾×5。部屋を出ると戻る（restockFloorItems＝木が立ち直るのと同時に補える）。
//   2026-11-21 ユーザー提案「ここにも爆弾を置いておく方がいいかも？ 結構使うことになりそうだし」。
//
// 使い方：node scripts/migrate-d8-4-4-fallen-trees.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { FALL_DIRS, FALLEN_LOG_LEN } from '../game/passable.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '4,4';
const ROWS = 10, COLS = 12;
export const CHEST = '8,6';
export const TREES = ['3,3', '3,4', '4,5', '5,3', '7,5'];
export const FIRST_SEAT = '3,2';
export const BLOCKER = '3,4';   // B＝A の東を塞ぐ木
export const BOMBS = '6,1';     // 床の爆弾（部屋を出ると戻る）
export const BOMB_COUNT = 5;
export const MIN_BOMBS = 4;
// 口の外の段（row 0・col 0）も立てる＝爆弾の置き場に含める
export const MOUTHS = ['0,5', '0,6', '4,0', '5,0'];

// `~` は bgTiles の水（tiles 側は床 '.'）。`ŧ` は枯れ木（下地は水にしない＝小さな中州に立つ）。
export const DESIGN = [
	'#####..#####',
	'#..........#',
	'#..~~~~~~~~#',
	'#..ŧŧ~~~~~~#',
	'...~~ŧ~~~~~#',
	'...ŧ~~~~~~~#',
	'#5.~~~~~~~~#',
	'#..~~ŧ~~~~~#',
	'#..~~~B~~~~#',
	'############',
];
export const AFTER = DESIGN.map((row) => row.replace(/~/g, '.'));
export const WATER = [];
DESIGN.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#......r...#',
	'...........#',
	'.....r.....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];
const BG_BEFORE = { '6,3': '~', '6,4': '~' };
export const CONTENT = { type: 'rupee', value: 100, name: 'ルピー×100' };
const COMMENT = '[キュー112] D8 倒木の渡し（パズルの部屋）。沼に枯れ木5本（爆風で爆心と反対へ倒れ、水の上に2マスの橋）。'
	+ '西の岸 (3,2)→はしごで B の切り株から幹 (3,5)→A の切り株 (3,3)→D の幹の先 (7,3) の爆弾4個で、C と E の幹を伝って宝箱 (8,6)＝ルピー×100。'
	+ '向きを誤った木は部屋を出ると立ち直る。西の口のそば (6,1) に床の爆弾×5（部屋を出ると戻る＝restockFloorItems）。敵なし。';

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

// ── 倒し方の総当たり（実エンジンの写し）────────────────────────────────
// 状態＝倒れた木 { 'r,c': dir }。手＝勇者が立てるセル（歩ける所＋はしごで渡る途中の水）に爆弾を置く。
export function fallSearch(design, { ladder = true } = {}) {
	const at = (r, c) => design[r]?.[c];
	const logsOf = (st) => {
		const s = new Set();
		for (const [k, d] of Object.entries(st)) {
			const [r, c] = k.split(',').map(Number); const [dr, dc] = FALL_DIRS[d];
			for (let i = 1; i <= FALLEN_LOG_LEN; i++) s.add(`${r + dr * i},${c + dc * i}`);
		}
		return s;
	};
	const walk = (r, c, st, logs) => {
		const k = `${r},${c}`; const t = at(r, c);
		if (logs.has(k)) return true;
		if (t === TILE.DEAD_TREE) return !!st[k];
		return t === TILE.FLOOR || t === TILE.ITEM_BOMB;
	};
	const bank = (r, c, st, logs) => at(r, c) !== '~' && walk(r, c, st, logs);
	const reach = (st) => {
		const logs = logsOf(st);
		const seen = new Set(MOUTHS); const seats = new Set(MOUTHS); const q = [...MOUTHS];
		while (q.length) {
			const [r, c] = q.shift().split(',').map(Number);
			for (const [dr, dc] of DIRS) {
				const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
				if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
				if (!seen.has(k) && walk(nr, nc, st, logs)) { seen.add(k); seats.add(k); q.push(k); continue; }
				if (!ladder || at(nr, nc) !== '~' || logs.has(k) || !bank(r, c, st, logs)) continue;
				const fk = `${nr + dr},${nc + dc}`;
				if (!seen.has(fk) && bank(nr + dr, nc + dc, st, logs)) { seen.add(fk); seats.add(fk); seats.add(k); q.push(fk); }
			}
		}
		return { seen, seats };
	};
	let chest = null; const trees = [];
	design.forEach((row, r) => [...row].forEach((ch, c) => {
		if (ch === TILE.CHEST) chest = [r, c];
		if (ch === TILE.DEAD_TREE) trees.push([r, c]);
	}));
	const won = (st) => { const { seen } = reach(st); return DIRS.some(([dr, dc]) => seen.has(`${chest[0] + dr},${chest[1] + dc}`)); };
	const blast = (st, br, bc) => {
		const ns = { ...st }; const felled = [];
		for (const [r, c] of trees) {
			const k = `${r},${c}`;
			if (ns[k]) continue;
			const ddr = r - br, ddc = c - bc;
			if ((ddr !== 0) === (ddc !== 0) || Math.abs(ddr) + Math.abs(ddc) > 2) continue;
			const d = ddr < 0 ? 'n' : ddr > 0 ? 's' : ddc < 0 ? 'w' : 'e';
			const [dr, dc] = FALL_DIRS[d]; const logs = logsOf(ns);
			let ok = true;
			for (let i = 1; i <= FALLEN_LOG_LEN && ok; i++) {
				const lr = r + dr * i, lc = c + dc * i, lk = `${lr},${lc}`;
				ok = lr > 0 && lc > 0 && lr < ROWS - 1 && lc < COLS - 1 && (at(lr, lc) === TILE.FLOOR || at(lr, lc) === '~')
					&& !logs.has(lk) && !ns[lk] && !(lr === br && lc === bc);
			}
			if (ok) { ns[k] = d; felled.push(k + d); }
		}
		return { ns, felled };
	};
	const key = (st) => Object.entries(st).sort().map(([k, d]) => k + d).join('|') || '-';
	const all = new Map([['-', { st: {}, bombs: 0, from: null }]]);
	const q = ['-'];
	while (q.length) {
		const kk = q.shift(); const { st, bombs } = all.get(kk);
		for (const s of reach(st).seats) {
			const [r, c] = s.split(',').map(Number);
			const { ns, felled } = blast(st, r, c);
			if (!felled.length) continue;
			const nk = key(ns);
			if (!all.has(nk)) { all.set(nk, { st: ns, bombs: bombs + 1, from: kk, seat: s, felled }); q.push(nk); }
		}
	}
	const solvable = new Set([...all].filter(([, v]) => won(v.st)).map(([k]) => k));
	for (let ch = true; ch;) {
		ch = false;
		for (const [k, v] of all) {
			if (solvable.has(k)) continue;
			for (const s of reach(v.st).seats) {
				const [r, c] = s.split(',').map(Number);
				const { ns, felled } = blast(v.st, r, c);
				if (felled.length && solvable.has(key(ns))) { solvable.add(k); ch = true; break; }
			}
		}
	}
	let best = null;
	for (const [k, v] of all) if (won(v.st) && (!best || v.bombs < all.get(best).bombs)) best = k;
	const path = [];
	for (let k = best; k && all.get(k).from !== null; k = all.get(k).from) path.unshift({ seat: all.get(k).seat, felled: all.get(k).felled });
	const firstSeats = [];
	for (const s of reach({}).seats) {
		const [r, c] = s.split(',').map(Number);
		const { ns, felled } = blast({}, r, c);
		if (felled.length) firstSeats.push({ seat: s, felled, solves: solvable.has(key(ns)) });
	}
	return {
		minBombs: best ? all.get(best).bombs : null, path, firstSeats, states: all.size,
		deadlocks: all.size - solvable.size, solvableStart: solvable.has('-'), won0: won({}),
		noEscape: [...all.values()].filter((v) => !MOUTHS.every((m) => reach(v.st).seen.has(m))).length,
	};
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortObj = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	// ── 設計の検証（データに触る前）────────────────────────────────
	const S = fallSearch(DESIGN);
	ok(!S.won0, '爆弾なしで宝箱の前に立てる');
	ok(S.minBombs === MIN_BOMBS, `最少の爆弾 ${S.minBombs}（期待 ${MIN_BOMBS}）`);
	const solving = S.firstSeats.filter((f) => f.solves).map((f) => f.seat);
	ok(same(solving, [FIRST_SEAT]), `1手目で解ける置き場: ${solving}`);
	ok(S.firstSeats.some((f) => !f.solves), '1手目の罠が無い');
	ok(S.deadlocks > 0, '詰む状態が無い');
	ok(S.noEscape === 0, `口へ戻れない状態 ${S.noEscape}`);
	ok(!fallSearch(DESIGN, { ladder: false }).solvableStart, 'はしご無しで解ける');
	const without = (t) => { const [r, c] = t.split(',').map(Number); return DESIGN.map((row, i) => (i === r ? row.slice(0, c) + '~' + row.slice(c + 1) : row)); };
	// 道になる木（A・C・D・E）は1本でも欠けると解けない
	for (const t of TREES.filter((x) => x !== BLOCKER)) ok(!fallSearch(without(t)).solvableStart, `枯れ木 ${t} が無くても解ける`);
	// B は塞ぐ役＝B が無ければ A を西から東へ倒せて、はしご無しで解けてしまう（B がはしごの一手を作る）
	ok(fallSearch(without(BLOCKER), { ladder: false }).solvableStart, `対照：B ${BLOCKER} が無いと、はしご無しで解ける…はずが解けない`);
	console.log(`✔ 設計 OK（爆弾 ${S.minBombs}・状態 ${S.states}・詰む状態 ${S.deadlocks}・1手目の罠 ${S.firstSeats.filter((f) => !f.solves).map((f) => f.seat).join(' ')}・道の木4本は要る・B ははしごの一手を作る・はしごが要る）`);
	console.log('  解：' + S.path.map((p) => `${p.seat}→${p.felled.join('+')}`).join('  '));

	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const st = data.layers[LAYER].stages[KEY];
	ok(st, `${LAYER} ${KEY} が無い`);
	const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
	let changed = false;
	const apply = (label, cur, before, after, set) => {
		if (same(cur, after)) { console.log(`… ${KEY} の${label}は既に適用済み`); return; }
		ok(same(cur, before), `${KEY} の${label}が想定と違う: ${JSON.stringify(cur)}`);
		set(); changed = true; console.log(`✔ ${KEY} の${label}を書き換えた`);
	};
	const BG_AFTER = Object.fromEntries(WATER.map((k) => [k, '~']));
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('沼（bgTiles）', sortObj(st.bgTiles), sortObj(BG_BEFORE), sortObj(BG_AFTER), () => { st.bgTiles = { ...BG_AFTER }; });
	apply('宝箱', st.chestContents, {}, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	apply('床の爆弾', st.floorItems, {}, { [BOMBS]: { count: BOMB_COUNT } }, () => { st.floorItems = { [BOMBS]: { count: BOMB_COUNT } }; });
	apply('床の弾が戻る指定', st.restockFloorItems ?? null, null, true, () => { st.restockFloorItems = true; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── データの自己検証 ──────────────────────────────────────────
	const g = rows();
	ok(g.length === ROWS && g.every((r) => [...r].length === COLS), '盤面の大きさ');
	ok(['0,5', '0,6', '4,0', '5,0'].every((k) => { const [r, c] = k.split(',').map(Number); return g[r][c] === '.'; }), '北と西の口はそのまま');
	ok(g[9] === '############' && g.slice(1, 9).every((r) => r.endsWith('#')), '南と東に口は無い');
	ok(TREES.every((k) => { const [r, c] = k.split(',').map(Number); return g[r][c] === TILE.DEAD_TREE && !st.bgTiles[k]; }), '枯れ木（下地は水でない）');
	ok(!g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない');
	ok(Object.keys(st.showConditions ?? {}).length === 0, '宝箱はいつも見える');
	{ const [r, c] = BOMBS.split(',').map(Number); ok(g[r][c] === TILE.ITEM_BOMB && st.restockFloorItems === true, '床の爆弾と、部屋を出ると戻る指定'); }
	ok(BOMB_COUNT >= MIN_BOMBS, '床の爆弾で1回ぶん解ける');
	const [cr, cc] = CHEST.split(',').map(Number);
	ok(DIRS.every(([dr, dc]) => st.bgTiles[`${cr + dr},${cc + dc}`] === '~' || g[cr + dr][cc + dc] === '#'), '宝箱の隣は水か壁だけ');
	console.log('✔ データの自己検証 OK');

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
