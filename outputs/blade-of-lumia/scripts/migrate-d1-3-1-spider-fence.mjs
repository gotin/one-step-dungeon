// dungeon_1 `3,1`（紋章の部屋 `2,1` の東の行き止まり）：床にコンパスが落ちているだけの四角い部屋を
// 「石の柵と跳躍蜘蛛」に作り替える（2026-10-12 / PLAN 実行キュー 47 の第1陣 5室目・設計は Opus・
// 主題＝ユーザー選択「跳躍蜘蛛の見切り」）
//
// ■ 何が薄かったか（キュー47 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 .....n.....#     ← 西の口（`2,1` から）／床のコンパス
//      5 ...........#
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   西の口だけにつながる行き止まり。入ればコンパスを拾って帰るだけ（キュー21 の F6）。
//
// ■ 新しい `3,1`＝石の柵と跳躍蜘蛛
//      0 ############
//      1 #....#.....#
//      2 #..........#     ← 柵の切れ目（北）
//      3 #....#.....#
//      4 .....#..β..#     ← 西の口／跳躍蜘蛛 β の持ち場
//      5 .....#.....#
//      6 #....#.....#
//      7 #..........#     ← 柵の切れ目（南）
//      8 #....#....n#     ← コンパスは東の広間の奥の隅
//      9 ############
//   ・部屋を列5 の石の柵（柱6本）で西の広間（入口）と東の広間に分ける。切れ目は行2 と行7 の2つ。
//   ・跳躍蜘蛛 β×1（脅威度 16.0＝看板部屋 `1,1` の 18.0 を超えない）。間合い 1.8〜6 で溜め（0.36 秒）→
//     縦か横の近い方の軸へ3マス跳ぶ（滞空中は無敵）→ 着地して 1 秒の硬直。跳んだ先が壁ならそこで落ちる
//     （`game/enemy-ai.js` の tickLeap）。
//   ・西の広間に立つと、蜘蛛は柵の前（列6）まで来て、横に跳ぼうとして柱にぶつかる＝0 マスで落ちて硬直、
//     をくり返す＝**柵の内側からなら、溜めの絵と硬直を何度でも安全に見られる**（見切りの稽古）。
//   ・答え＝柵の切れ目から東へ回り込み、跳んで降りた硬直に斬る。コンパスは東の広間の奥の隅。
//     D1 の他の「回り込む」部屋（`0,3` 石の裏・`0,2` 部屋の裏・`3,2` 見張り台の裏の橋）と同じ語彙を、
//     ここは跳ぶ敵の軸で言う。
//   ・D1 の他の部屋と型を分けた＝跳躍蜘蛛は D1 ではここだけ（field に4体＝D1 の前に出会える相手・D2 の予習）。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（西の口は同じセルで開いたまま）。
//   ・コンパスの位置が 4,5 → 8,10 に動く＝旧セーブで拾い済みでも新しい位置にもう1つ見える（拾っても
//     hasCompass が true のまま＝害は無い）。
//
// 使い方:
//   node scripts/migrate-d1-3-1-spider-fence.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d1-3-1-spider-fence.mjs         # 書き込み

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

const LAYER = 'dungeon_1';
const ROOM  = '3,1';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'.....n.....#',
	'...........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#....#.....#',
	'#..........#',
	'#....#.....#',
	'.....#..β..#',
	'.....#.....#',
	'#....#.....#',
	'#..........#',
	'#....#....n#',
	'############',
];
export const EXITS = { west: ['4,0', '5,0'] };
export const ENTRY = '4,0';
export const SPIDER = '4,8';                                         // 蜘蛛の持ち場（東の広間）
export const FENCE_COL = 5;
export const FENCE = ['1,5', '3,5', '4,5', '5,5', '6,5', '8,5'];      // 石の柵（柱6本）
export const GAPS = ['2,5', '7,5'];                                  // 柵の切れ目
export const COMPASS = '8,10';
export const WEST = { c0: 1, c1: 4 };                                // 西の広間（入口）
export const LEAP = ENEMY_META[TILE.LEAP_SPIDER].leap;               // { windupMs, cells, minRange, maxRange, ... }
export const SIGNATURE_THREAT = 18;                                  // 看板部屋 `1,1`（地中蟲）

// ── 歩行の到達（壁は通れない・コンパスと敵の居るセルは床） ─────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
export function walkable(t, k) {
	const [r, c] = P(k);
	if (!inside(r, c)) return false;
	const ch = t[r][c];
	if (ENEMY_META[ch]) return true;
	return !BLOCKED.has(ch);
}
export function reach(t, from = ENTRY, cut = new Set()) {
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nk = `${r + dr},${c + dc}`;
			if (seen.has(nk) || cut.has(nk) || !walkable(t, nk)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}
// 蜘蛛が from から dir（[dr,dc]）へ跳んだとき、何マス進めるか（壁に当たればそこで落ちる＝tickLeap と同じ）。
export function leapCells(t, from, [dr, dc], cells = LEAP.cells) {
	let [r, c] = P(from), n = 0;
	for (let i = 0; i < cells; i++) {
		if (!walkable(t, `${r + dr},${c + dc}`)) break;
		r += dr; c += dc; n++;
	}
	return n;
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

	// 事前条件＝盤面の外の中身が無い（コンパスは tiles の 'n' で持つ）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects',
		'enemyDirs', 'showConditions', 'chestContents', 'bgTiles'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	if (room.links?.length) die(`${ROOM} の links が空でない`);
	{
		const now = room.tiles.map(rowStr).join('|');
		if (now !== ORIGINAL.join('|') && now !== TARGET.join('|')) die(`${ROOM} の盤面が書き換え前とも狙いとも違う＝誰かが触った`);
	}

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
		log.push(`  ${ROOM}: 盤面を差し替えた（石の柵と跳躍蜘蛛・コンパス 4,5 → ${COMPASS}）`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
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
		check(`画面の縁で開いているのは西の口だけ＝書き換え前と同じ行き止まり（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵は跳躍蜘蛛 β×1 だけ・持ち場 ${SPIDER}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify([SPIDER]) && at(SPIDER) === TILE.LEAP_SPIDER);
		const b = ENEMY_META[TILE.LEAP_SPIDER];
		check(`β は縦横に ${LEAP.cells} マス跳ぶ（溜め ${LEAP.windupMs}ms・間合い ${LEAP.minRange}〜${LEAP.maxRange}）・地を歩く・ボスでない・弱点の道具を持たない`,
			LEAP.cells === 3 && !b.move && !b.isBoss && !b.weakness);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝看板部屋 \`1,1\` の ${SIGNATURE_THREAT}.0 を超えない`, threat <= SIGNATURE_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`コンパスは1つだけ・${COMPASS}（東の広間の奥の隅）`,
		JSON.stringify(cellsOf((ch) => ch === TILE.ITEM_COMPASS)) === JSON.stringify([COMPASS]));
	check(`部屋の中の壁は柵 ${FENCE.join(' ')} だけ・宝箱・看板・仕掛け・床の物なし`,
		JSON.stringify(cellsOf((ch) => ch === TILE.WALL).filter((k) => { const [r, c] = P(k); return r > 0 && r < 9 && c > 0 && c < 11; })) === JSON.stringify(FENCE)
		&& cellsOf((ch) => [TILE.CHEST, TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR, TILE.KEY, TILE.TORCH, TILE.PIT,
			TILE.BREAKABLE_WALL, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION, TILE.ITEM_DUNGEON_MAP].includes(ch)).length === 0);

	// ── ② 柵の幾何 ────────────────────────────────────────────────────
	{
		const foot = reach(t);
		const floors = cellsOf((ch) => !BLOCKED.has(ch) || !!ENEMY_META[ch]);
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		check(`列${FENCE_COL} の行1-8 は柵か切れ目のどちらか＝柵を回らずに東へ渡れない`,
			[1, 2, 3, 4, 5, 6, 7, 8].every((r) => FENCE.includes(`${r},${FENCE_COL}`) || GAPS.includes(`${r},${FENCE_COL}`)));
		check(`対照＝切れ目 ${GAPS.join(' ')} を両方切るとコンパスへ届かない（片方ずつなら届く）`,
			!reach(t, ENTRY, new Set(GAPS)).has(COMPASS)
			&& GAPS.every((g) => reach(t, ENTRY, new Set([g])).has(COMPASS)));
		// 柵の前（列6）で西へ跳ぶと、柱の行では 0 マスで落ちる＝柵を跳び越えられない。
		const pinRows = FENCE.map((k) => P(k)[0]);
		check(`柵の前（列6）の柱の行 ${pinRows.join(',')} では、西へ跳んでも 0 マス（柱にぶつかって落ちる）`,
			pinRows.every((r) => leapCells(t, `${r},${FENCE_COL + 1}`, [0, -1]) === 0));
		check(`対照＝切れ目の行（${GAPS.map((k) => P(k)[0]).join(',')}）では西へ ${LEAP.cells} マス跳べる＝柵を越えるのは切れ目だけ`,
			GAPS.every((g) => leapCells(t, `${P(g)[0]},${FENCE_COL + 1}`, [0, -1]) === LEAP.cells));
		const [sr, sc] = P(SPIDER), [er, ec] = P(ENTRY);
		check(`西の口は蜘蛛の間合いの外（持ち場まで ${sc - ec} マス > ${LEAP.maxRange}）＝入った瞬間には跳んでこない`,
			sc - ec > LEAP.maxRange && sr === er);
		const west = floors.filter((k) => { const [, c] = P(k); return c >= WEST.c0 && c <= WEST.c1; });
		check(`西の広間（列${WEST.c0}-${WEST.c1}）は行1-8 の ${west.length} マス＝溜めを見て下がれる広さ`, west.length === 32);
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
	console.log(`# ${LAYER} ${ROOM}：コンパスだけの四角い部屋を「石の柵と跳躍蜘蛛」に作り替える（キュー47 第1陣 5室目）`);
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
}
