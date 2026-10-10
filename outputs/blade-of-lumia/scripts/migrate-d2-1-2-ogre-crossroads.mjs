// dungeon_2 `1,2`（要の通り道）：D1 の写しの部屋を「ブーメラン鬼の十字路」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第1陣 2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..........#
//      3 #....E.....#     ← パトロール E×2（脅威度 8.0）
//      4 ............     ← 西の口（`0,2` 穴の小島）・東の口（`2,2`）
//      5 ......E.....
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####     ← 南の口＝入口 `1,3`／北の口（行0）＝ブーメランの部屋 `1,1`
//   `dungeon_1 1,2` と 6 セル差以内（D1 側にある道しるべ・宝箱を抜いただけ）＝四角い広間に雑魚2体。
//
// ■ 新しい `1,2`＝ブーメラン鬼の十字路（D2 の主題「ブーメラン」の予告＝行って帰る軌道）
//      0 #####..#####
//      1 ####....####
//      2 ####....####
//      3 #..........#
//      4 .....π......     ← (4,5) ブーメラン鬼（南の入口へ向く）
//      5 ............
//      6 #..........#
//      7 ####....####
//      8 ####....####
//      9 #####..#####
//   ・四隅を壁で埋めて十字の広間にした。縦の腕（列4-7）が南北の口を、横の腕（行3-6）が東西の口をつなぐ。
//   ・真ん中にブーメラン鬼 π を1体。π は縦横が揃ったときだけ投げ、ブーメランは π へ帰る
//     ＝行きを横に避けても、π へ寄ると帰りに当たる（名簿の「二度読み」）。
//   ・本筋（南の入口 → 北のブーメランの部屋）は π の居る行4 を必ず横切り、南の口から上がった最初の
//     セル (8,5) は π と同じ列・距離 4（射程の内側）＝入った瞬間に投げてくる。
//     ∴ブーメランの部屋 `1,1` に入る1部屋手前で、敵の手で「ブーメランの飛び方」を必ず一度は見る。
//     （腕は幅2∴π の線を踏まずに抜けられる口の組は1つだけ残る＝南→東。π は動くので固定の抜け道ではない）
//   ・答え＝①軸を外して近づき斬る（木の剣5振り）②木の盾（D1 の報酬）で正面から防ぎながら寄る
//     ③ブーメランを取った後は、投げ返して気絶させてから斬る。倒すことは必須でない（走り抜けてもよい）。
//   ・報酬は置かない（通り道）。D1 の写しだった E×2 は π に置き換えた。
//   ・旧盤面の下地に砂 `d` が3枚（bgTiles (2,4)(2,5)(2,6)＝キュー42 で tiles 層から移した名残）あった。
//     新しい北の腕（列4-7）に3枚だけ半端に残ると帯に見える∴消した（下地は層の既定の床に戻る）。
//   ・D2 の他の部屋と型を分けた＝`1,3` 炎の受け渡し・`0,1` 炎の2段・`0,2` 穴の小島の回収・
//     `2,1` 跳躍蜘蛛と地中蟲。ここは穴も篝火も使わない「戦い方の予告」。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（4つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-1-2-ogre-crossroads.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-1-2-ogre-crossroads.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '1,2';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#....E.....#',
	'............',
	'......E.....',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'####....####',
	'####....####',
	'#..........#',
	'.....π......',
	'............',
	'#..........#',
	'####....####',
	'####....####',
	'#####..#####',
];
export const EXITS = {
	north: ['0,5', '0,6'], south: ['9,5', '9,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'],
};
export const OGRE = '4,5';               // ブーメラン鬼（十字の交わり）
export const OGRE_DIR = 'down';          // 南の入口へ向く
export const ENTRY = '8,5';              // 南の入口から上がった最初のセル（π と同じ列・距離 4）
export const EXPECT_THREAT = 22.5;       // π×1（看板部屋 2,1 の 25.0 より軽い）

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
// `cut` に入れたセルは歩けないものとして数える（π の行・列を横切らずに口から口へ行けるかを測る）。
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
export function reach(t, from = ENTRY, cut = new Set()) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk) || cut.has(nk) || BLOCKED.has(t[nr][nc])) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}
// π の居る行と列（投げてくる線）。番人は盤面から引いた π の位置を渡す。
export function ogreLines(ogre = OGRE) {
	const [or, oc] = P(ogre);
	const out = new Set();
	for (let c = 0; c < COLS; c++) out.add(`${or},${c}`);
	for (let r = 0; r < ROWS; r++) out.add(`${r},${oc}`);
	return out;
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は定数と reach だけ使う）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	// 事前条件＝中身の無い通り道である（違えば黙って上書きしない）
	const extras = ['chestContents', 'signData', 'mapEnters', 'floorItems', 'showConditions', 'npcData', 'shopData', 'breakableWalls', 'objects'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の戻り口の着地
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: false, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = room.tiles;
	room.tiles = ORIGINAL.map((row) => row.split(''));
	const base = runs();
	room.tiles = applied;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (room.bgTiles && Object.keys(room.bgTiles).length) {
		log.push(`  ${ROOM}: 下地の名残を消した（${Object.keys(room.bgTiles).join(' ')}）`);
		room.bgTiles = {};
	}
	if (JSON.stringify(room.enemyDirs) !== JSON.stringify({ [OGRE]: OGRE_DIR })) {
		room.enemyDirs = { [OGRE]: OGRE_DIR };
		log.push(`  ${ROOM}: enemyDirs = { ${OGRE}: ${OGRE_DIR} }`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => (Array.isArray(r) ? [...r] : [...r]));
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは4つの口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵はブーメラン鬼 π×1 だけ・${OGRE}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify([OGRE]) && at(OGRE) === TILE.BOOMERANG_OGRE);
		check(`π は ${OGRE_DIR} を向く（南の入口へ）`, room.enemyDirs?.[OGRE] === OGRE_DIR && Object.keys(room.enemyDirs).length === 1);
		check(`π は縦横が揃うと往復するブーメランを投げる（boomerangThrow・射程 ${ENEMY_META[TILE.BOOMERANG_OGRE].attack.range}）`,
			ENEMY_META[TILE.BOOMERANG_OGRE].attack.type === 'boomerangThrow');
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝看板部屋 2,1（25.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`下地（bgTiles）が空＝旧盤面の砂3枚の名残が無い`, !room.bgTiles || Object.keys(room.bgTiles).length === 0);
	check(`宝箱・看板・床の物・仕掛けが無い（報酬なしの通り道）`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0)
		&& cellsOf((ch) => [TILE.CHEST, TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR,
			TILE.KEY, TILE.TORCH, TILE.PIT, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.BREAKABLE_WALL].includes(ch)).length === 0);

	// ── ② 十字の幾何 ──────────────────────────────────────────────────
	{
		const foot = reach(t);
		const exits = Object.values(EXITS).flat();
		check(`4つの口・π の隣に歩いて届く`, [...exits, '3,5', '5,5', '4,4', '4,6'].every((k) => foot.has(k)));
		const floors = cellsOf((ch) => !BLOCKED.has(ch));
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		check(`四隅（行1-2・7-8 × 列1-3・8-10）が壁`,
			[1, 2, 7, 8].every((r) => [1, 2, 3, 8, 9, 10].every((c) => t[r][c] === TILE.WALL)));
		// π の行と列を歩けなくして、口どうしが分かれるかを数える。
		// 本筋（南→北）は必ず分かれる＝π の行を横切らずにブーメランの部屋へは行けない。
		// 腕が幅2∴線を踏まずに抜けられる組は1つだけ残る（π が (4,5) なら南→東）。
		const cut = ogreLines();
		const inner = { north: [1, 0], south: [-1, 0], west: [0, 1], east: [0, -1] };
		const side = (name) => {
			const from = EXITS[name].find((k) => !cut.has(k));
			const [r, c] = P(from);
			return reach(t, `${r + inner[name][0]},${c + inner[name][1]}`, cut);
		};
		const joined = (a, b) => EXITS[b].filter((k) => !cut.has(k)).some((k) => side(a).has(k));
		check(`本筋の南の口→北の口は π の行・列を横切らずには行けない`, !joined('south', 'north'));
		const names = Object.keys(EXITS);
		const free = [];
		for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
			if (joined(names[i], names[j])) free.push(`${names[i]}→${names[j]}`);
		}
		check(`π の線を踏まずに抜けられる口の組は1つだけ（実測 ${free.join(' ') || 'なし'}）`,
			free.length === 1 && free[0] === 'south→east');
		const [er, ec] = P(ENTRY), [or, oc] = P(OGRE);
		check(`南の入口の最初のセル ${ENTRY} は π と同じ列・距離 ${er - or}（射程 4 の内側・minRange 2 の外）`,
			ec === oc && er - or <= ENEMY_META[TILE.BOOMERANG_OGRE].attack.range
			&& er - or >= ENEMY_META[TILE.BOOMERANG_OGRE].attack.minRange);
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：要の通り道を「ブーメラン鬼の十字路」に作り替える（キュー41 第1陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}`);
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
}
