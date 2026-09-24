// dark_tower 1F/2F/3F：階段の踊り場3室を差別化する
// （2026-09-24 / PLAN 実行キュー 20b ⑤-c・設計は Opus）。
//
// ■ 何が壊れていたか（キュー20b の棚卸し⑱・⑤の実測＝`.scratch/20b-5c-census.mjs`）
//   `2,0` と `3,0` が**バイト単位で一致**していた（同じ12×10の素の箱＋E×2＋階段 '>'）。
//   `1,0` も同じ箱で E×4 だけが違う＝「登っても同じ部屋に出る」＝階を上がった実感が消える。
//     0 ############    ← 3室すべてこの形。違いは敵の数だけ
//     2 #...E..E...#
//     6 #...>......#
//     9 #####..#####
//
// ■ 何をするか（PLAN 20b ⑤の設計・不変条件は (d1)〜(d4)+(e)）
//   ・`1,0`（1F・16.0）＝**触らない**。E×4 の見張りのまま＝(d4) の予算の余裕を残す。
//   ・`2,0`（2F・8.0 → 12.0）＝E×2 を撤去して**分裂スライム δ×1**（7,7）へ。
//     δ の弱点は爆弾（`WEAKNESS_ITEM`）＝2F の主題（爆弾の関門 `2,1`）の**予告**になる。
//     ⚠️ 階段の着地セル (6,4) からチェビシェフ距離 3 を空ける（着地直後に張り付かれない
//        ＝棚卸し⑪と同じ筋）。⚠️ 4近傍を素の床にする＝剣で倒したとき小型2体が湧く空きが要る
//        （`ENEMY_META[δ].split`＝湧き場が無いと分裂の機構が黙って死ぬ）。
//     ⚠️ δ は `directional` ではない∴`enemyDirs` は**空にする**（残すと幽霊キー＝
//        `tests/enemy-placement.spec.js` ⑥ が赤くなる）。
//   ・`3,0`（3F・8.0 据え置き）＝**地形で差別化**する。row3 に穴の帯 `x×10`（幅1）を引き、
//     北の rows1-2 を「はしごでしか渡れない島」にして**矢束 '6'(1,5) を報酬**に置く。
//     既存の E×2(2,4)(2,7) はそのまま島の守り手になる＝「はしごの練習」＝同じ 3F の
//     本番（`3,1` のはしごの関門）の前振り。
//     ⚠️ 階段の着地セル (6,4) と南の出口 (9,5)(9,6) の間には**引かない**（塞ぐと 3F へ
//        進めない）＝帯は着地セルより北の row3 に置く＝本道は はしご無しで歩ける。
//     ⚠️ 穴は飛行では越えられない（`FLYABLE_OVER` に PIT は無い＝`game/passable.js`）∴
//        翼の羽衣を持っていても島は はしご専用のままになる。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・3室の盤面が互いに違う（⑱の解消）／`1,0` は1バイトも動いていない
//   ・`2,0`＝δ×1・脅威度 12.0・着地セルから距離3以上・4近傍が素の床・enemyDirs 空
//   ・`3,0`＝穴は row3 の cols1-10 だけ・全列が幅1の縦の橋（はしごで渡れる）・脅威度 8.0
//   ・ソルバー（状態空間）で：はしご無しでは島 (1,5) に届かない／はしご有りで届く／
//     **はしご無しでも南の出口 (9,5) には届く**（本道を塞いでいない＝(進行不能にしない)）
//   ・階段 `mapEnters`・境界の開きが不変（部屋間の接続を動かさない）
//   ・塔の非ボス合計 ≤ 900＝(d4)／各室 ≤ 162＝(d3)／全階に実戦室＝(d1)／
//     全道具ありの BFS で塔 30 室すべてに到達する
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-5c-landings.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-5c-landings.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { THREAT_OF, PINNED_STAGES } from './lib/enemy-placement.mjs';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const THREAT_CAP = 900;          // 不変条件 (d4)
const ROOM_CAP = 162;            // 不変条件 (d3)

// 3室に共通の旧盤面（⑱＝`2,0` と `3,0` はこれがバイト単位で一致していた）
const LANDING_BEFORE = [
	'############',
	'#..........#',
	'#...E..E...#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const DIRS_BEFORE = { '2,4': 'right', '2,7': 'left' };

// ── `2,0`＝2F の踊り場：分裂スライムの予告 ──────────────────────────
const F2_ROOM = '2,0';
const F2_TARGET = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#......δ...#',
	'#..........#',
	'#####..#####',
];
const F2_SLIME = [7, 7];

// ── `3,0`＝3F の踊り場：はしごの練習（幅1の穴＋島の矢束）────────────
const F3_ROOM = '3,0';
const F3_TARGET = [
	'############',
	'#....6.....#',
	'#...E..E...#',
	'#xxxxxxxxxx#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const F3_PIT_ROW = 3;
const F3_ISLAND_REWARD = '1,5';   // 矢束（弓を持っていないと拾えないがタイルは残る）
const F3_SOUTH_OUT = '9,5';       // 本道の出口＝はしご無しでも届かなければならない

// 触らない室（1F）＝差別化の対象外だが「3室が互いに違う」検証で読む
const F1_ROOM = '1,0';

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];
if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };
const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

const before = {};

// ──────────────────────────────────────────────────────────────────────
// ① 盤面と enemyDirs を当てる（旧盤面と一致しなければ止まる＝取り違え防止）
// ──────────────────────────────────────────────────────────────────────
function applyRoom(key, beforeRows, targetRows, dirs, dirsBefore, comment) {
	const st = stages[key];
	ok(st, `${key} が無い`);
	ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray),
		`${key} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
	ok(st.rows === targetRows.length && st.cols === targetRows[0].length,
		`${key} の寸法が想定外: ${st.rows}x${st.cols}`);

	const now = rowsOf(st);
	before[key] = now;

	if (now.join('\n') === targetRows.join('\n')) {
		step('=', `${key} の盤面は既に狙いどおり`);
	} else {
		for (let r = 0; r < beforeRows.length; r++) {
			ok(now[r] === beforeRows[r],
				`${key} row${r} が旧盤面と違う: '${now[r]}' 期待 '${beforeRows[r]}'`);
		}
		st.tiles = targetRows.map((row) => [...row]);
		step('✔', `${key} を作り替えた`);
	}

	const cur = st.enemyDirs ?? (st.enemyDirs = {});
	if (JSON.stringify(cur) === JSON.stringify(dirs)) {
		step('=', `${key} の enemyDirs は既に狙いどおり`);
	} else {
		ok(JSON.stringify(cur) === JSON.stringify(dirsBefore),
			`${key} に既に別の enemyDirs が在る: ${JSON.stringify(cur)} 期待 ${JSON.stringify(dirsBefore)}`);
		st.enemyDirs = { ...dirs };
		step('✔', `${key} の enemyDirs を置き換えた（${JSON.stringify(cur)} → ${JSON.stringify(dirs)}）`);
	}

	st.comment = comment;
}

// 1F は触らない＝差分ゼロを記録しておく（後の検証で「動いていない」ことを測る）
before[F1_ROOM] = rowsOf(stages[F1_ROOM]);

applyRoom(F2_ROOM, LANDING_BEFORE, F2_TARGET, {}, DIRS_BEFORE,
	'[dark_tower 2,0] 2F の踊り場＝分裂スライムの予告（キュー20b ⑤-c・2026-09-24）。'
	+ '`3,0` とバイト単位で一致していた素の箱（棚卸し⑱）。パトロール E×2（8.0）を撤去して'
	+ '分裂スライム δ(7,7) を置いた＝脅威度 12.0。δ の弱点は爆弾∴同じ 2F の主題'
	+ '（爆弾の関門 `2,1`）の予告になる（剣で倒すと小型2体に分裂・爆弾なら分裂させずに潰せる）。'
	+ '⚠️ 階段の着地セル (6,4) からチェビシェフ距離 3 を空けている（着地直後に張り付かれない'
	+ '＝棚卸し⑪）。⚠️ δ の4近傍は素の床のまま＝分裂した小型2体の湧き場（塞ぐと分裂が黙って'
	+ '死ぬ）。⚠️ δ は向き別スプライトではない∴enemyDirs は空（残すと幽霊キー）。');

applyRoom(F3_ROOM, LANDING_BEFORE, F3_TARGET, DIRS_BEFORE, DIRS_BEFORE,
	'[dark_tower 3,0] 3F の踊り場＝はしごの練習（キュー20b ⑤-c・2026-09-24）。'
	+ '`2,0` とバイト単位で一致していた素の箱（棚卸し⑱）を**地形で**差別化した＝row3 に'
	+ '幅1の穴の帯 x×10 を引き、北の rows1-2 を「はしごでしか渡れない島」にして矢束 6(1,5) を'
	+ '報酬に置いた。既存の E×2(2,4)(2,7) はそのまま島の守り手＝同じ 3F の本番'
	+ '（`3,1` のはしごの関門）の前振りになる（敵と脅威度 8.0 は据え置き）。'
	+ '⚠️ 帯は着地セル (6,4) より**北**＝本道（着地 → 南の口 (9,5)(9,6)）は はしご無しで歩ける'
	+ '（塞ぐと 3F へ進めない）。⚠️ 穴は飛行では越えられない（FLYABLE_OVER に PIT は無い）∴'
	+ '翼の羽衣を持っていても島は はしご専用のまま。');

// ──────────────────────────────────────────────────────────────────────
// ② 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

const threatOfRoom = (st) => {
	let t = 0;
	for (const row of st.tiles) for (const ch of row) if (ENEMY_META[ch]) t += THREAT_OF(ENEMY_META[ch]);
	return t;
};
const openingSig = (st) => {
	const rows = rowsOf(st);
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[st.rows - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[st.cols - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
};

// ── ⑱ の解消＝3室の盤面が互いに違う ───────────────────────────────
{
	const sig = (key) => rowsOf(stages[key]).join('\n');
	check('1F/2F/3F の踊り場が互いに違う盤面になった＝⑱の解消',
		sig(F1_ROOM) !== sig(F2_ROOM) && sig(F2_ROOM) !== sig(F3_ROOM) && sig(F1_ROOM) !== sig(F3_ROOM));
	check(`${F1_ROOM}（1F）は1バイトも動いていない`, sig(F1_ROOM) === before[F1_ROOM].join('\n'));
	check(`${F1_ROOM} の脅威度が 16.0 のまま（実測 ${threatOfRoom(stages[F1_ROOM]).toFixed(1)}）`,
		threatOfRoom(stages[F1_ROOM]) === 16);
}

// ── `2,0`＝δ の置き方 ───────────────────────────────────────────────
{
	const st = stages[F2_ROOM];
	const tiles = st.tiles;
	check(`${F2_ROOM} の盤面が狙いどおり`, rowsOf(st).join('\n') === F2_TARGET.join('\n'));
	check(`${F2_ROOM} の enemyDirs が空（δ は向き別スプライトではない）`,
		Object.keys(st.enemyDirs ?? {}).length === 0);

	const slimes = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (tiles[r][c] === TILE.SPLIT_SLIME) slimes.push(`${r},${c}`);
	}
	check(`${F2_ROOM} に δ が1体だけ（実測 ${slimes.join(' ') || 'なし'}）`,
		slimes.length === 1 && slimes[0] === F2_SLIME.join(','));

	const [sr, sc] = F2_SLIME;
	const cheb = Math.max(Math.abs(sr - 6), Math.abs(sc - 4));
	check(`${F2_ROOM} の δ が階段の着地セル (6,4) から距離3以上（実測 ${cheb}）`, cheb >= 3);
	const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => tiles[sr + dr][sc + dc]);
	check(`${F2_ROOM} の δ の4近傍が素の床＝分裂した小型2体の湧き場がある（実測 ${around.join('')}）`,
		around.every((t) => t === TILE.FLOOR));
	check(`${F2_ROOM} の脅威度が 12.0（実測 ${threatOfRoom(st).toFixed(1)}）`, threatOfRoom(st) === 12);
	check(`${F2_ROOM} に穴を掘っていない（2F の踊り場は地形では差別化しない）`,
		!rowsOf(st).some((row) => row.includes(TILE.PIT)));
}

// ── `3,0`＝穴の帯と島 ───────────────────────────────────────────────
{
	const st = stages[F3_ROOM];
	const tiles = st.tiles;
	check(`${F3_ROOM} の盤面が狙いどおり`, rowsOf(st).join('\n') === F3_TARGET.join('\n'));
	check(`${F3_ROOM} の enemyDirs が据え置き`,
		JSON.stringify(st.enemyDirs) === JSON.stringify(DIRS_BEFORE));
	check(`${F3_ROOM} の脅威度が 8.0 据え置き（実測 ${threatOfRoom(st).toFixed(1)}）`,
		threatOfRoom(st) === 8);

	// 穴は row3 の cols1-10 だけ
	const pits = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (tiles[r][c] === TILE.PIT) pits.push([r, c]);
	}
	check(`${F3_ROOM} の穴が row${F3_PIT_ROW} の cols1-10 の10枚だけ（実測 ${pits.length}枚）`,
		pits.length === 10 && pits.every(([r, c]) => r === F3_PIT_ROW && c >= 1 && c <= 10));

	// 幅1＝全列で「上下が陸」＝はしごで渡れる（`game/passable.js` isVertBridge と同じ規則。
	// 陸＝穴/水でない通行可タイル。'E' も '6' も通行可＝橋脚になる）
	const HARD = new Set([TILE.WALL, TILE.WATER, TILE.PIT, TILE.LAVA, TILE.SKY, TILE.TORCH, TILE.SIGN]);
	const isBank = (r, c) => !HARD.has(tiles[r]?.[c]) && !st.bgTiles?.[`${r},${c}`];
	const notBridge = pits.filter(([r, c]) => !(isBank(r - 1, c) && isBank(r + 1, c)));
	check(`${F3_ROOM} の穴は全列が幅1の縦の橋＝はしごで渡れる（渡れない列: ${notBridge.map(([, c]) => c).join(' ') || 'なし'}）`,
		notBridge.length === 0);

	// 島の報酬＝矢束（`FLOOR_STACK_TILES`＝弓が無いと拾えないがタイルは消えない）
	const [ir, ic] = F3_ISLAND_REWARD.split(',').map(Number);
	check(`${F3_ROOM} の島 (${F3_ISLAND_REWARD}) に矢束 '6' がある`, tiles[ir][ic] === TILE.ITEM_ARROWS);
	check(`${F3_ROOM} の島（rows1-2）に敵が2体（守り手）`,
		[1, 2].flatMap((r) => tiles[r].filter((ch) => ENEMY_META[ch])).length === 2);
	check(`${F3_ROOM} の北の外周が全部壁＝島へは穴を渡るしか無い`,
		rowsOf(st)[0] === '############');
}

// ── 状態空間（ソルバー）＝はしごの要否を測る（歩行の目視では判定しない）──
// [[blade-puzzle-must-verify-with-solver]]
{
	const st = stages[F3_ROOM];
	const measure = ({ hasLadder, goal }) => {
		const tiles = st.tiles.map((r) => r.slice());
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
			const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
		}
		const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder, pitCrossable: true });
		// 出発は階段の着地セル (6,4)＝2F から上がってきた直後
		const start = S.encode(6, 4, S.initStones, 0, 0, S.litInitMask);
		const [gr, gc] = goal.split(',').map(Number);
		return measureMetrics(S, [start],
			(s) => s.split('|')[0] === goal,
			(s) => {
				const [pr, pc] = s.split('|')[0].split(',').map(Number);
				return Math.abs(pr - gr) + Math.abs(pc - gc);
			},
			{ guardMax: 500_000, escapeTest: (s) => S.exitCells.includes(s.split('|')[0]) });
	};

	const islandNo = measure({ hasLadder: false, goal: F3_ISLAND_REWARD });
	const islandYes = measure({ hasLadder: true, goal: F3_ISLAND_REWARD });
	const routeNo = measure({ hasLadder: false, goal: F3_SOUTH_OUT });

	check(`${F3_ROOM}：はしご無しでは島 (${F3_ISLAND_REWARD}) に届かない`, islandNo.L === null);
	check(`${F3_ROOM}：はしご有りなら島に届く（最短 ${islandYes.L} 手）`, islandYes.L !== null);
	check(`${F3_ROOM}：はしご無しでも南の出口 (${F3_SOUTH_OUT}) に届く＝本道を塞いでいない`
		+ `（最短 ${routeNo.L} 手）`, routeNo.L !== null);
	check(`${F3_ROOM}：入って詰む状態が無い（noEscape=${routeNo.noEscape}）`, routeNo.noEscape === 0);
}

// ── 既存の作り込み（階段）と境界の開きが不変 ─────────────────────
for (const [key, id] of [[F2_ROOM, '2fEntrance'], [F3_ROOM, '3fEntrance']]) {
	const st = stages[key];
	check(`${key} の階段 mapEnters(6,4)=${id} が残っている`,
		st.mapEnters?.['6,4']?.id === id && st.tiles[6][4] === TILE.MAP_ENTER);
	check(`${key} の境界の開きが N[] S[5,6] W[] E[]（実測: ${openingSig(st)}）`,
		openingSig(st) === 'N[] S[5,6] W[] E[]');
	check(`${key} に宝箱・看板を足していない`,
		Object.keys(st.chestContents ?? {}).length === 0
		&& Object.keys(st.signData ?? {}).length === 0);
}

// ── 階ごとの合計と (d1)(d3)(d4) ─────────────────────────────────────
{
	const byFloor = {};
	let total = 0;
	const heavy = [];
	for (const [key, st] of Object.entries(stages)) {
		if (st.isBossRoom) continue;
		const f = key.split(',')[0];
		const t = threatOfRoom(st);
		// (d3) の例外＝関門部屋（`1,2` の 225.0＝`PINNED_STAGES` の既存例外・PLAN 20b ⑤の (d3)）
		if (t > ROOM_CAP && !PINNED_STAGES.has(`${LAYER}/${key}`)) heavy.push(`${key}=${t}`);
		byFloor[f] = (byFloor[f] ?? 0) + t;
		total += t;
	}
	const floors = Object.keys(byFloor).sort();
	const summary = floors.map((f) => `${f === '0' ? 'B1' : f}F ${byFloor[f].toFixed(1)}`).join(' / ');
	check(`塔の非ボス合計が ${THREAT_CAP} 以下＝(d4)（実測 ${total.toFixed(1)}／${summary}）`,
		total <= THREAT_CAP);
	check(`1室の脅威度が ${ROOM_CAP} 以下＝(d3)（超過: ${heavy.join(' ') || 'なし'}）`, heavy.length === 0);
	const noFight = floors.filter((f) => !Object.entries(stages).some(([key, st]) =>
		key.startsWith(`${f},`) && !st.isBossRoom && threatOfRoom(st) > 0));
	check(`塔のどの階にも実戦室が1室以上ある＝(d1)（無人の階: ${noFight.join(' ') || 'なし'}）`,
		noFight.length === 0);
}

// ── 接続＝全道具ありで塔30室に到達する ─────────────────────────────
{
	const res = bfsLayer(stages, { stage: '0,1', row: 5, col: 5 }, {
		withLadder: true, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const rooms = new Set([...res.reachedCells].map((k) => k.split(':')[0]));
	check(`全道具ありで塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${rooms.size}）`,
		rooms.size === Object.keys(stages).length);
	check(`${F3_ROOM} の島 (${F3_ISLAND_REWARD}) に全道具ありで到達する`,
		res.reachedCells.has(`${F3_ROOM}:${F3_ISLAND_REWARD}`));
	check(`${F3_ROOM} の南の口 (9,5)(9,6) に到達する＝3F を進める`,
		res.reachedCells.has(`${F3_ROOM}:9,5`) || res.reachedCells.has(`${F3_ROOM}:9,6`));
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 踊り場3室の差別化（キュー20b ⑤-c）`);
console.log(log.join('\n') || '  （変更なし）');

for (const key of [F2_ROOM, F3_ROOM]) {
	console.log(`\n## 盤面の差分（${key}）`);
	stages[key].tiles.forEach((row, i) => {
		const now = row.join('');
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
	// ⚠️ プレビューのパラメータは `game/game.js` の実装名に合わせる（`ps_bombs` は無い＝`ps_bomb`）。
	//    矢束を拾う手応えを見るため **弓は渡さない**（`ps_bow=1` は矢を maxArrows まで満タンに
	//    するので、その状態で '6' を踏むと「もう持てない！」になり拾えたように見えない）。
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_bomb=1';
	const url = (stage, row, col, extra = '') =>
		`  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}${extra}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(F2_ROOM, 6, 4));
	console.log('   着地(6,4)から南東へ＝分裂スライムが寄ってくる／剣で倒すと2体に分裂・爆弾(B)なら分裂しない');
	console.log(url(F3_ROOM, 6, 4));
	console.log('   はしご無し＝row3 の穴で島に渡れない（南へは歩ける＝本道は塞がっていない）');
	console.log(url(F3_ROOM, 6, 4, '&ps_ladder=1'));
	console.log('   はしご有り＝穴を1枚だけ渡って島へ（矢束 (1,5) は弓を持っていれば拾える・E×2 が守り手）');
}
