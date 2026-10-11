// dungeon_2 `3,0`（西の枝の行き止まり）：D1 の写しの部屋を「砂蟲の祭壇」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第2陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 ...........#     ← 西の口（封じ火の墓廊 `2,0`）。東・北・南は閉じている＝行き止まり
//      5 .....7.....#     ← 回復薬（小）
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   `dungeon_1 3,0`（同じ箱に魔物 W＋全滅で革の鎧）から W と宝箱を抜いた写し＝床に回復薬1つだけ・敵なし。
//   西の枝（`1,1`→`1,0`→`2,0`→`3,0`）の終点なのに、たどり着いても何も無い。
//
// ■ 新しい `3,0`＝砂蟲の祭壇（浮いた蟲を旋刃で止め、潜らせずに斬る）
//      0 ############
//      1 #..........#     ← 床は祭壇の中を除いて全部砂（bgTiles 'd'）＝蟲の棲み家
//      2 #..........#
//      3 #...####...#     ← 祭壇の壁（列4-7・行3-5）
//      4 ....#B.#...#     ← 西の口（墓廊 `2,0`）／祭壇の奥に宝箱（蟲を全滅させると現れる）
//      5 ....#..#...#     ← 祭壇の中は石畳（bgTiles 'o'）
//      6 #..........#     ← 祭壇の口は南（列5-6）
//      7 #..α....α..#     ← 地中蟲 α×2
//      8 #7.........#     ← 回復薬（小）＝書き換え前の物を南西の隅へ
//      9 ############
//   ・地中蟲 α×2（脅威度 18.0＝看板部屋 `2,1` の 25.0 より軽い）。α は砂の下を進んでプレイヤーの隣へ来て、
//     1.0 秒だけ浮いて噛み（atk 2）、1.6 秒潜る（潜っている間は無敵）。2体の周期は揃っている。
//   ・答え＝浮いた α にブーメランを当てると 1.5 秒気絶して**潜れず噛めない**（`stunUntil` の間は enemyTick が止まる
//     ＝潜る周期も止まる）＝その間に斬る（木の剣3振り）。剣だけでも倒せる（浮いた 1.0 秒に合わせて斬る＝D1 `1,1` と同じ手）。
//   ・**D5 `0,1`（凍れる祠の番鮫・ユーザー判定 OK）の予告。** D5 では「浮いた鮫をブーメランで気絶させれば潜れず噛めない」
//     を水の上でやる。ここはその陸の版＝D2 でブーメランを得た直後の西の枝で先に一度通す。
//   ・倒すと祭壇の奥 `(4,5)` に宝箱が現れる（killAll・中身＝ルピー×30＝キュー45〈2026-10-11〉で光の紋章に差し替え）。
//   ・`2,1`（看板の部屋）の手記「この 砂は 生きている。足元から 牙が 来る。」の答え合わせを、砂の床で見せる。
//   ・D2 の他の部屋と型を分けた＝`1,3` 炎の受け渡し（穴の隅）・`1,2` 敵のブーメランの軌道（十字の広間）・
//     `1,1` 構える敵をスタンで崩す（列柱の広間）・`1,0` 裂け目と一本橋（石を盾で受ける）・`2,0` 剣を封じる鬼火（龕の櫛）・
//     `0,1` 炎の2段・`0,2` 穴の小島の回収・`2,1` 跳躍蜘蛛と地中蟲（看板）。ここは「潜る敵を止める」＝時間を止める使い方。
//   ・⚠️ 最初の叩き台はルピー喰い σ の宝物庫だった＝取り下げた（実測＝D2 の装備〈ハート3・木の剣〉では σ の体当たりで
//     HP 6→0・剣だけでは倒し切れない／宝物庫を壁で囲うと σ が内側の壁に張り付いて出て来ない）。PLAN の第2陣 3室目の節に記録。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（西の口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-3-0-burrow-basin.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-3-0-burrow-basin.mjs         # 書き込み

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
const ROOM  = '3,0';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'...........#',
	'.....7.....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#..........#',
	'#..........#',
	'#...####...#',
	'....#B.#...#',
	'....#..#...#',
	'#..........#',
	'#..α....α..#',
	'#7.........#',
	'############',
];
export const EXITS = { west: ['4,0', '5,0'] };
export const WORMS = ['7,3', '7,8'];         // 地中蟲 α×2
export const ALTAR = { r0: 4, r1: 5, c0: 5, c1: 6 };   // 祭壇の中（行4-5・列5-6）
export const ALTAR_MOUTH = ['6,5', '6,6'];   // 祭壇の口（南）
export const ENTRY = '4,0';                  // 西の口（墓廊から入った最初のセル）
export const CHEST = '4,5';
export const CHEST_CONTENT = { type: 'rupee', value: 30, name: 'ルピー×30' };   // キュー45（2026-10-11）で据え置き＝C 段（L12 以下・敵全滅の封印）
export const CHEST_CONDITION = { trigger: 'killAll', message: '砂の 蟲を 退けた！祭壇に 宝箱が 現れた！' };
export const POTION = '8,1';                 // 回復薬（小）＝書き換え前の物を南西の隅へ

// 祭壇の中か。
export const inAltar = (k) => { const [r, c] = k.split(',').map(Number); return r >= ALTAR.r0 && r <= ALTAR.r1 && c >= ALTAR.c0 && c <= ALTAR.c1; };

// 下地＝祭壇の中は石畳 'o'、それ以外の床は全部砂 'd'（壁には置かない）。盤面から導く。
export function targetBg(t = TARGET) {
	const bg = {};
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (BLOCKED.has(t[r][c]) && t[r][c] !== TILE.CHEST) continue;
		const k = `${r},${c}`;
		bg[k] = inAltar(k) ? TILE.STONE_FLOOR : TILE.SAND;
	}
	return bg;
}

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
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
// 歩数（BFS の距離）。届かなければ Infinity。
export function steps(t, from, to) {
	const dist = new Map([[from, 0]]);
	const q = [from];
	while (q.length) {
		const k = q.shift();
		if (k === to) return dist.get(k);
		const [r, c] = P(k);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || dist.has(nk) || BLOCKED.has(t[nr][nc])) continue;
			dist.set(nk, dist.get(k) + 1); q.push(nk);
		}
	}
	return Infinity;
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

	// 事前条件＝盤面の外の中身が無い（宝箱の2つと下地は、このスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	for (const [k, want] of [['chestContents', { [CHEST]: CHEST_CONTENT }], ['showConditions', { [CHEST]: CHEST_CONDITION }], ['bgTiles', targetBg()]]) {
		const cur = room[k] ?? {};
		if (Object.keys(cur).length && JSON.stringify(cur) !== JSON.stringify(want)) die(`${ROOM} の ${k} が想定外の中身`);
	}
	if (room.links?.length) die(`${ROOM} の links が空でない`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の戻り口の着地
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: false, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	delete room.bgTiles;
	const base = runs();
	room.tiles = applied.tiles;
	if (applied.bgTiles !== undefined) room.bgTiles = applied.bgTiles;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(targetBg())) {
		room.bgTiles = targetBg();
		log.push(`  ${ROOM}: 下地＝床を砂・祭壇の中を石畳にした`);
	}
	if (JSON.stringify(room.chestContents) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
		room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
		log.push(`  ${ROOM}: 宝箱 ${CHEST} = ${CHEST_CONTENT.name}`);
	}
	if (JSON.stringify(room.showConditions) !== JSON.stringify({ [CHEST]: CHEST_CONDITION })) {
		room.showConditions = { [CHEST]: { ...CHEST_CONDITION } };
		log.push(`  ${ROOM}: 宝箱 ${CHEST} を敵全滅（killAll）で出現させる`);
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
		check(`敵は地中蟲 α×2 だけ・${WORMS.join(' ')}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify(WORMS) && WORMS.every((k) => at(k) === TILE.BURROW_WORM));
		const a = ENEMY_META[TILE.BURROW_WORM];
		check(`α は潜る（hide ${a.hide?.style}・潜伏 ${a.hide?.hiddenMs}ms／浮上 ${a.hide?.shownMs}ms）＝浮いている窓の方が短い`,
			a.hide?.style === 'burrow' && a.hide.shownMs < a.hide.hiddenMs);
		check(`α はボスでない（ブーメランで気絶する）・弱点の道具を持たない`, !a.isBoss && !a.weakness);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝看板部屋 2,1 の 25.0 より軽い`, threat > 0 && threat < 25);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`宝箱 ${CHEST} は ${CHEST_CONTENT.name}・敵全滅（killAll）で現れる＝関門はこれ1つ`,
		at(CHEST) === TILE.CHEST && cellsOf((ch) => ch === TILE.CHEST).length === 1
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& JSON.stringify(room.showConditions) === JSON.stringify({ [CHEST]: CHEST_CONDITION }));
	check(`床の物＝回復薬（小）${POTION}（書き換え前の物）だけ`,
		at(POTION) === TILE.ITEM_HEAL_POTION
		&& cellsOf((ch) => [TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION].includes(ch)).length === 1);
	check(`看板・仕掛けが無い`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0)
		&& cellsOf((ch) => [TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR,
			TILE.KEY, TILE.TORCH, TILE.PIT, TILE.BREAKABLE_WALL].includes(ch)).length === 0);
	{
		const bg = room.bgTiles ?? {};
		const floors = cellsOf((ch) => !BLOCKED.has(ch) || ch === TILE.CHEST);
		const sand = Object.keys(bg).filter((k) => bg[k] === TILE.SAND);
		const stone = Object.keys(bg).filter((k) => bg[k] === TILE.STONE_FLOOR);
		check(`下地＝祭壇の外の床は全部砂（${sand.length} マス）・祭壇の中は石畳（${stone.length} マス）・壁には置かない`,
			Object.keys(bg).length === floors.length && floors.every((k) => bg[k] === (inAltar(k) ? TILE.STONE_FLOOR : TILE.SAND))
			&& stone.length === 4);
		check(`α は砂の上から始まる`, WORMS.every((k) => bg[k] === TILE.SAND));
	}

	// ── ② 祭壇の幾何 ──────────────────────────────────────────────
	{
		const foot = reach(t);
		const floors = cellsOf((ch) => !BLOCKED.has(ch));
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		check(`西の口・α・祭壇の中・回復薬に歩いて届く`,
			[...EXITS.west, ...WORMS, ...ALTAR_MOUTH, POTION, '5,5', '5,6', '4,6'].every((k) => foot.has(k)));
		// 祭壇は壁で囲まれ、口は南の2マスだけ。
		const inner = floors.filter(inAltar);
		const out = new Set();
		for (const k of [...inner, CHEST]) {
			const [r, c] = P(k);
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nk = `${r + dr},${c + dc}`;
				if (!inAltar(nk) && !BLOCKED.has(at(nk))) out.add(nk);
			}
		}
		check(`祭壇（内寸 2×2）の外へ開くのは南の口 ${ALTAR_MOUTH.join(' ')} だけ（実測 ${[...out].sort().join(' ')}）`,
			JSON.stringify([...out].sort()) === JSON.stringify([...ALTAR_MOUTH].sort()));
		check(`宝箱は祭壇の奥の段（口から2段）`, inAltar(CHEST) && P(CHEST)[0] === ALTAR.r0);
		check(`対照＝祭壇の口を塞ぐと祭壇の中へ届かない`, !reach(t, ENTRY, new Set(ALTAR_MOUTH)).has('5,5'));
		// 入った瞬間に噛まれない＝西の口から α まで、α の周期1回ぶん（潜伏 1.6 秒で寄れる距離）より遠い。
		const near = Math.min(...WORMS.map((k) => steps(t, ENTRY, k)));
		check(`西の口から一番近い α まで ${near} 歩（≥ 6）`, near >= 6);
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
	console.log(`# ${LAYER} ${ROOM}：西の枝の行き止まりを「砂蟲の祭壇」に作り替える（キュー41 第2陣）`);
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
