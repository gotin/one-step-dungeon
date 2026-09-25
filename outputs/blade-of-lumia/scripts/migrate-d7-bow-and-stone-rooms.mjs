// dungeon_7 `1,1` / `1,2`：双子の部屋を「弓の関門」と「石＋弓の宝の間」に作り替える
// （2026-09-25 / PLAN 実行キュー 30・設計は Opus、二室の主題はユーザー確定）
//
// ■ 何が壊れていたか（キュー30 の指摘＋着手時の実測で1件増えた）
//   旧盤面は 2 室が `!` の 2 枚を除いて**完全に同一**だった：
//      0 #####TT#####      0 #####TT#####
//      1 #....!!....#      1 #..........#
//      3 #........Y.#      3 #........Y.#     ← どちらも Y(3,9)・水は bgTiles の 3 枚
//   ① `1,1` の Y(3,9) は**南 (4,9) が素の床**＝剣で殴って開けられた。水で隔離した
//      つもりが「弓でなければ開かない」という機構の嘘になっていた。
//   ② 2 室が同じ絵・同じ仕掛け＝通すだけの部屋が 2 つ続いて退屈だった。
//   ③ **着手時の実測で分かった追加の事実**＝`1,2` の Y/T は**何も守っていない飾り**。
//      門を全部閉じても入口 `1,3` から 22 室のうち 20 室に歩ける（未達は `1,0`/`0,0` だけ）。
//      `1,1` は南の `1,2` を通らずに**西 `0,1`・東 `2,1` から入れる**∴`1,2` の北門は
//      迂回できる。逆に `1,0`（鍵の間）を守っているのは `1,1` だけで、しかも
//      `!`（爆弾壁）と `T`（門）の**両方**が要る＝`1,1` は既に複合錠だった。
//      ∴弓の関門を置けるのは `1,1` しかない（`1,2` に置いても経路を守れない＝嘘の再生産）。
//      `1,2` のシームを閉じて関門化する道は実測で否＝閉じると `0,1`/`0,2` が門を開けても
//      孤立する（到達 20/22・未達 `0,1 0,2`）∴`1,2` は**報酬を守る部屋**にする。
//
// ■ 新しい `1,1`＝弓の関門（本道の錠・爆弾との複合）
//      0 #####TT#####     ← 門 T(0,5)(0,6)＝Y(1,1) と配線
//      1 #Y...!!....#     ← Y(1,1) は 2×2 の池の向こう・!(1,5)(1,6) は据え置き
//      2 ##.........#     ← 池＝bgTiles 水 (1,2)(1,3)(2,2)(2,3)
//   ・Y(1,1) の四方＝壁・壁・壁・水∴**剣が絶対に届かない**（旧盤面の嘘を潰す）。
//   ・池は 2×2＝どの軸でも幅 2∴はしごでも渡れない（`isLadderBridgeCell` は幅 1 だけ）。
//     幅 1 の水だと「はしごを架けた水の上に立って隣を斬る」で開いてしまう（同じ罠）。
//   ・射座は (1,4) ほか row1 の東側＝**矢（または剣ビーム）でだけ** Y に届く。
//     投擲物を止めるのは壁と未破壊の `!` だけ（`game/projectile.js:199-202`）∴水の上は飛ぶ。
//   ・Y を叩けるのは矢と剣ビームだけ（`game/projectile.js:637`＝`arrow`/`beam` のみ）。
//     ブーメラン・ロウソク・笛では開かない。
//   ∴不変条件は「**近接では開かない／最低装備では弓が唯一の手段**」。D7 到達時の剣の
//     下限はティア 0（木の剣＝ビーム無し・`scripts/audit-balance.mjs` の実測）∴弓が要る。
//     寄道で銅の剣以上を持つ人は剣ビームで代替できる（`dark_tower 1,1` と同じ約束）。
//
// ■ 新しい `1,2`＝石＋はしご＋弓の「宝の間」（本道は素通り・報酬だけを守る）
//      0 #####..#####     ← 飾りの門 T を撤去＝素の通路（嘘を消す）
//      1 #B###.#...Y#     ← 宝箱 B(1,1)／射座 (1,7)／Y(1,10) は水 (1,8)(1,9) の向こう
//      2 #=###.#.####     ← 潮ゲート =(2,1)＝Y と配線（宝の間の扉）
//      3 #.....#T...#     ← 門 T(3,7)＝射座への唯一の口（ボタンで開く）
//      7 #.......*.S#     ← 水 (7,6) をはしごで渡り、石 *(7,8) を東へ 2 回押して S(7,10)
//   手順＝はしごで渡る → 石をボタンへ → T(3,7) が開く → 射座 (1,7) から矢 → 潮が引く → 宝箱。
//   ・**ボタンのある部屋では Y→T の配線が効かない**＝エンジンの仕様（`game/conditions.js:70-102`
//     ＝「全ボタン ON なら全 T を開く／links の T エントリはスキップ」2026-07-31 ユーザー確定）。
//     ∴Y が開ける扉は**潮ゲート `=`**にする（links は `=` には効く＝同 98 行の条件は T だけ）。
//     潮ゲートはエディタのパレットにも在り（`editor/editor-palette.js:74`）閉＝水の見た目
//     ∴この部屋の池と地続きに読める（「矢を当てると水が引く」）。
//   ・射座 (1,7) は T(3,7) の奥＝**門が開くまで矢を当てられない**。門の外 (4,7) から北へ
//     射っても矢は col7 を上って (0,7) の壁で消える＝Y には当たらない（射線は row1 だけ・
//     (1,6) が壁で西からの射線を断つ）。閉じた門は矢を止めないが、**立ち位置**が無い。
//   ・石の通路は幅 1・東端 S(7,10) の先が壁＝押し過ぎられない。プレイヤーは石より東へ
//     回り込めない∴石で自分の退路を塞ぐ詰みも起きない（実測 noEscape=0 で裏取り）。
//   ・全ボタンに石が乗ると `ss.stonesLocked`＝門は恒久開放（`game/conditions.js:82`）。
//     プレイヤーが自分で踏んでも T は開くが、足を離せば閉じる∴石が必須。
//   ・報酬＝**ハートの器**。最初は矢筒（矢の上限 +8）にしたが**やめた**＝世界の矢筒は
//     「dark_tower 3,2 と 3,5 の 2 個だけ」が確定済みの希少さ（キュー20b ⑳）で、
//     3 本のテストが座標つきで見張っている（`tests/dark-tower-3f-flute-reward.spec.js` の
//     「3つめを増やすならここが赤くなる」）∴3 個目を黙って増やすのは筋が通らない。
//     ダンジョンの隠し部屋にハートの器を置く形は既にある（`dungeon_1 3,3` の隠し場所＝
//     `tests/heart-containers.spec.js` ④）∴3 つの道具を要る隠し部屋の報酬として釣り合う。
//     器は上限を設けない設計＝配置総数がそのまま最大ハート数（[[blade-heart-container-no-cap]]）。
//
// ■ 看板は置かない（キュー30 ④＝20c で間引いた看板は復活させない）
//   「水の向こうの錠は矢だけが打てる」は D3 `1,2` の看板で既に教えている語彙。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・2 室の盤面／links／bgTiles／宝の中身が狙いどおり
//   ・`1,1`：Y に**歩いて隣接できるセルが 0**／射線のある立ち位置が 1 つ以上在る
//   ・`1,1`：層の到達性の対照実験＝門だけ開 → `1,0` 未達／`!` だけ壊し → 未達／
//     両方 → 到達（＝両方の錠が本物）／レイヤー全体の dead-edge が 0
//   ・`1,2`：状態空間ソルバーの対照実験＝道具全部 → 宝箱に届く／弓封じ → 届かない／
//     石押し封じ → 届かない／はしご無し → 届かない／noEscape=0（入って詰まない）
//   ・`1,2`：Y に歩いて隣接できない／射線を持つ立ち位置が門の奥だけ
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d7-bow-and-stone-rooms.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d7-bow-and-stone-rooms.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_7';
const BOW   = '1,1';   // 弓の関門（本道）
const HOARD = '1,2';   // 石＋弓の宝の間

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const BOW_TARGET = [
	'#####TT#####',
	'#Y...!!....#',
	'##.........#',
	'#..........#',
	'............',
	'............',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const BOW_BG = { '1,2': '~', '1,3': '~', '2,2': '~', '2,3': '~' };
const BOW_LINKS = [
	{ switchId: '1,1', gateId: '0,5' },
	{ switchId: '1,1', gateId: '0,6' },
];

const HOARD_TARGET = [
	'#####..#####',
	'#B###.#...Y#',
	'#=###.#.####',
	'#.....#T...#',
	'............',
	'............',
	'#.....######',
	'#.......*.S#',
	'#......#####',
	'#####..#####',
];
const HOARD_BG = { '1,8': '~', '1,9': '~', '7,6': '~' };
const HOARD_LINKS = [{ switchId: '1,10', gateId: '2,1' }];
const HOARD_CHEST = { '1,1': { type: 'heartContainer', name: 'ハートの器' } };

const BOW_SWITCH   = '1,1';
const HOARD_SWITCH = '1,10';
const HOARD_ALCOVE = '1,7';    // 唯一の射座（門 3,7 の奥）
const HOARD_GATE   = '3,7';    // ボタンで開く門
const HOARD_TIDE   = '2,1';    // Y で引く潮ゲート
const HOARD_STONE  = '7,8';
const HOARD_BUTTON = '7,10';
const HOARD_GAP    = '7,6';    // はしごで渡る幅1の水

// ── 読み込み ─────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const rooms = {
	[BOW]:   stages[BOW],
	[HOARD]: stages[HOARD],
};
for (const [k, st] of Object.entries(rooms)) if (!st) die(`${LAYER} ${k} が無い`);

const before = {};
for (const [k, st] of Object.entries(rooms)) before[k] = st.tiles.map((r) => rowStr(r));

const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── 書き換え ─────────────────────────────────────────────────────────
applyRoom(BOW, BOW_TARGET, BOW_BG, BOW_LINKS, null);
applyRoom(HOARD, HOARD_TARGET, HOARD_BG, HOARD_LINKS, HOARD_CHEST);

function applyRoom(key, target, bg, links, chest) {
	const st = rooms[key];
	// tiles は「文字の配列の配列」で持つ（行文字列にするとゲームが落ちる
	// ＝[[field-tiles-are-char-arrays]]）。
	const nextTiles = target.map((row) => row.split(''));
	if (st.tiles.map(rowStr).join('|') !== target.join('|')) {
		st.tiles = nextTiles;
		log.push(`  ${key}: 盤面を差し替えた`);
	}
	if (JSON.stringify(st.bgTiles ?? {}) !== JSON.stringify(bg)) {
		st.bgTiles = { ...bg };
		log.push(`  ${key}: bgTiles（水）を ${Object.keys(bg).join(' ')} に差し替えた`);
	}
	if (JSON.stringify(st.links ?? []) !== JSON.stringify(links)) {
		st.links = links.map((l) => ({ ...l }));
		log.push(`  ${key}: links を ${links.map((l) => `${l.switchId}→${l.gateId}`).join(' / ')} にした`);
	}
	if (chest && JSON.stringify(st.chestContents ?? {}) !== JSON.stringify(chest)) {
		st.chestContents = JSON.parse(JSON.stringify(chest));
		log.push(`  ${key}: 宝の中身を ${Object.values(chest).map((v) => v.name).join(' ')} にした`);
	}
	// 空のまま保つフィールド（形式は配列/オブジェクトを崩さない）
	st.signData ??= {};
	st.showConditions ??= {};
	st.breakableWalls ??= {};
}

// ── 検証の道具 ───────────────────────────────────────────────────────
const tilesOf = (key) => rooms[key].tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const bgOf = (key) => {
	const g = Array.from({ length: 10 }, () => Array(12).fill('.'));
	for (const [cell, v] of Object.entries(rooms[key].bgTiles ?? {})) {
		const [r, c] = cell.split(',').map(Number);
		g[r][c] = v;
	}
	return g;
};
// 「歩いて立てるセルか」＝硬い障害でなく、bgTiles の水でもない（門は閉じている前提で不可）。
const standable = (t, bg, r, c) => {
	if (r < 0 || r > 9 || c < 0 || c > 11) return false;
	if (bg[r][c] === TILE.WATER) return false;
	const ch = t[r][c];
	// 門は閉じている前提／壊せる壁は壊す前の姿で見る（＝立ち位置を数えるときは壁）。
	if (ch === TILE.GATE || ch === TILE.TIDE_GATE || ch === TILE.BREAKABLE_WALL) return false;
	return !HARD_BLOCKED.has(ch);
};
// 直線で cell の Y を撃ち抜ける立ち位置（壁と未破壊の '!' で止まる）。
const shootersOf = (t, bg, cell) => {
	const out = [];
	for (let r = 0; r < 10; r++) for (let c = 0; c < 12; c++) {
		if (!standable(t, bg, r, c)) continue;
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			let rr = r + dr, cc = c + dc;
			while (rr >= 0 && rr < 10 && cc >= 0 && cc < 12) {
				if (`${rr},${cc}` === cell) { out.push(`${r},${c}`); rr = -1; break; }
				const ch = t[rr][cc];
				if (ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
				rr += dr; cc += dc;
			}
		}
	}
	return [...new Set(out)].sort();
};

// ── ① 盤面とデータ ──────────────────────────────────────────────────
check(`${BOW} の盤面が狙いどおり`, rooms[BOW].tiles.map(rowStr).join('|') === BOW_TARGET.join('|'));
check(`${HOARD} の盤面が狙いどおり`, rooms[HOARD].tiles.map(rowStr).join('|') === HOARD_TARGET.join('|'));
check(`${BOW} の links が Y(${BOW_SWITCH})→T(0,5)(0,6) の 2 本`,
	JSON.stringify(rooms[BOW].links) === JSON.stringify(BOW_LINKS));
check(`${HOARD} の links が Y(${HOARD_SWITCH})→潮ゲート(${HOARD_TIDE}) の 1 本`,
	JSON.stringify(rooms[HOARD].links) === JSON.stringify(HOARD_LINKS));
check(`${HOARD} の宝の中身がハートの器`, rooms[HOARD].chestContents?.['1,1']?.type === 'heartContainer');
// 矢筒の希少さ（キュー20b ⑳）を壊していない＝世界に 2 個・どちらも dark_tower のまま。
{
	const quivers = [];
	for (const [lk, lay] of Object.entries(data.layers ?? {})) {
		for (const [sk, st] of Object.entries(lay.stages ?? {})) {
			for (const [cell, cc] of Object.entries(st.chestContents ?? {})) {
				if (cc?.item === 'quiver') quivers.push(`${lk}/${sk}(${cell})`);
			}
		}
	}
	check(`矢筒は世界に 2 個のまま（実測 ${quivers.sort().join(' ')}）`,
		quivers.length === 2 && quivers.every((q) => q.startsWith('dark_tower/')));
}
check(`${HOARD} に飾りの門 T が残っていない（本道の (0,5)(0,6) が素の通路）`,
	rooms[HOARD].tiles[0][5] === '.' && rooms[HOARD].tiles[0][6] === '.');
check('2 室の盤面が別物になった（双子を解消）',
	rooms[BOW].tiles.map(rowStr).join('|') !== rooms[HOARD].tiles.map(rowStr).join('|'));
// ボタンが1つでもあると Y→T の links は無効化される（`game/conditions.js:98`）∴
// `1,1` には S を置かない＝置いた瞬間に「矢で門が開く」が静かに壊れる。
check(`${BOW} にボタン S が無い（Y→T の links が生きている前提）`,
	!rooms[BOW].tiles.some((row) => rowStr(row).includes(TILE.BUTTON)));
check(`${HOARD} の潮ゲート ${HOARD_TIDE} は T ではない（ボタン盤面でも links が効く）`,
	rooms[HOARD].tiles[2][1] === TILE.TIDE_GATE);
check('看板は置いていない（キュー30 ④）',
	Object.keys(rooms[BOW].signData ?? {}).length === 0
	&& Object.keys(rooms[HOARD].signData ?? {}).length === 0);

// ── ② Y の隔離と射線（幾何） ────────────────────────────────────────
for (const [key, sw, wantShooters] of [[BOW, BOW_SWITCH, null], [HOARD, HOARD_SWITCH, [HOARD_ALCOVE]]]) {
	const t = tilesOf(key), bg = bgOf(key);
	const [yr, yc] = sw.split(',').map(Number);
	const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]]
		.map(([dr, dc]) => [yr + dr, yc + dc])
		.filter(([r, c]) => standable(t, bg, r, c))
		.map(([r, c]) => `${r},${c}`);
	check(`${key}: Y(${sw}) に歩いて隣接できるセルが 0（剣では開かない・実測 ${neighbors.join(' ') || 'なし'}）`,
		neighbors.length === 0);
	const shooters = shootersOf(t, bg, sw);
	check(`${key}: Y(${sw}) を撃ち抜ける立ち位置が在る（${shooters.length}箇所: ${shooters.join(' ')}）`,
		shooters.length > 0);
	if (wantShooters) {
		check(`${key}: 射座が門の奥 ${wantShooters.join(' ')} だけ（門の外からは当てられない）`,
			JSON.stringify(shooters) === JSON.stringify(wantShooters));
	}
}
// 池が 2×2＝はしごで渡れない（幅 1 なら渡って剣で斬れてしまう）
{
	const bg = bgOf(BOW);
	const pond = ['1,2', '1,3', '2,2', '2,3'].every((cell) => {
		const [r, c] = cell.split(',').map(Number);
		return bg[r][c] === TILE.WATER;
	});
	check(`${BOW}: 池が 2×2 の水＝どの軸でも幅 2（はしごで渡れない）`, pond);
}

// ── ③ `1,1` の錠が両方とも本物か（層の到達性の対照実験）──────────────
{
	const start = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
	const run = (open) => bfsLayer(stages, start, {
		withLadder: true,
		openTiles: open ? new Set(open) : null,
	});
	const closed = run(null);
	const tOnly  = run(['T']);
	const bOnly  = run(['!']);
	const both   = run(['T', '!']);
	const all    = run(['T', '!', 'D']);
	check(`門も壁も閉じたままなら鍵の間 1,0 へ行けない`, !closed.reachedRooms.has('1,0'));
	check(`門(T)だけ開けても 1,0 へ行けない＝爆弾壁 !(1,5)(1,6) が本物`, !tOnly.reachedRooms.has('1,0'));
	check(`爆弾壁だけ壊しても 1,0 へ行けない＝門 T(0,5)(0,6)＝Y(1,1) が本物`, !bOnly.reachedRooms.has('1,0'));
	check(`両方開けば 1,0 へ行ける（弓＋爆弾の複合錠）`, both.reachedRooms.has('1,0'));
	check(`鍵の扉 D まで開けば全 22 室に到達（実測 ${all.reachedRooms.size}/${Object.keys(stages).length}）`,
		all.reachedRooms.size === Object.keys(stages).length);
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	check(`門を閉じたままでも到達 20 室は不変（実測 ${closed.reachedRooms.size}）`,
		closed.reachedRooms.size === 20);
}

// ── ④ `1,2` の三重の錠（状態空間ソルバーの対照実験）──────────────────
{
	const t = tilesOf(HOARD), bg = bgOf(HOARD);
	const linkSpec = [[HOARD_SWITCH, [HOARD_TIDE]]];
	const breakDefs = {};
	const GOAL = '1,1';                       // 宝箱のセルに立つ
	const [gr, gc] = GOAL.split(',').map(Number);
	const measure = (opts) => {
		const S = makeSolver(t, bg, linkSpec, breakDefs, new Set(), { hasLadder: true, ...opts });
		// 入口＝南の口から入った直後の 2 セル
		const starts = ['8,5', '8,6'].map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		return measureMetrics(S, starts,
			(state) => state.split('|')[0] === GOAL,
			(state) => {
				const [pr, pc] = state.split('|')[0].split(',').map(Number);
				return Math.abs(pr - gr) + Math.abs(pc - gc);
			},
			{ guardMax: 3_000_000, escapeTest: (state) => S.exitCells.includes(state.split('|')[0]) });
	};
	const solvable = (m) => m.L !== null && m.L !== Infinity;
	const full = measure({});
	check(`${HOARD}: 道具を全部持てば宝箱に届く（最短 ${full.L} 手）`, solvable(full));
	check(`${HOARD}: 入って詰む状態が無い（実測 noEscape=${full.noEscape}）`, full.noEscape === 0);
	// noTools＝弓・爆弾・ブーメランを全部落とす（はしごは別軸）。この部屋で遠隔は矢だけ∴
	// 実質「弓を封じた」測定になる（剣は隣接＝Y に届かないことは幾何で別に測った）。
	check(`${HOARD}: 遠隔の道具を封じると届かない（矢だけが Y に届く＝潮が引かない）`,
		!solvable(measure({ noTools: true })));
	check(`${HOARD}: 石押しを封じると届かない（ボタン→門 T(${HOARD_GATE}) が本物）`,
		!solvable(measure({ noPush: true })));
	check(`${HOARD}: はしごが無いと届かない（水 ${HOARD_GAP} が本物）`,
		!solvable(measure({ hasLadder: false })));
	// 対照実験が空虚でないことの担保＝必ず NO になる盤面（宝箱を壁で塗る）を混ぜる
	// （[[blade-control-experiment-needs-tile-wall]]）。
	const walled = t.map((row) => [...row]);
	walled[gr][gc] = TILE.WALL;
	const S = makeSolver(walled, bg, linkSpec, breakDefs, new Set(), { hasLadder: true });
	const wm = measureMetrics(S,
		['8,5', '8,6'].map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		}),
		(state) => state.split('|')[0] === GOAL, () => 0, { guardMax: 3_000_000 });
	check(`${HOARD}: 対照（宝箱セルを壁で塗る）は必ず届かない＝測定が空虚でない`, !solvable(wm));
	// 石とボタンの形（押し過ぎ・自分の退路封じが起きない幾何）
	check(`${HOARD}: ボタン ${HOARD_BUTTON} の東隣が壁＝石を押し過ぎられない`,
		t[7][11] === TILE.WALL);
	check(`${HOARD}: 石 ${HOARD_STONE} の通路は幅 1（上下が壁）`,
		t[6][8] === TILE.WALL && t[8][8] === TILE.WALL);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${BOW} / ${HOARD}：双子の部屋を弓の関門と石＋弓の宝の間に作り替える（キュー30）`);
console.log(log.join('\n') || '  （変更なし）');

for (const key of [BOW, HOARD]) {
	console.log(`\n## 盤面の差分（${key}）`);
	rooms[key].tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[key][i]}   ${before[key][i] === now ? '=' : '→'}   ${now}`);
	});
}

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
