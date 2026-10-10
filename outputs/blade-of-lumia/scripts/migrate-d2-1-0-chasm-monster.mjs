// dungeon_2 `1,0`（中ボスの部屋）：D1 の写しの部屋を「流砂の裂け目の魔物」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第2陣 1室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #.....W....#     ← 魔物 W（道中の中ボス）
//      3 #..........#
//      4 #....E.E....     ← パトロール E×2・東の口（`2,0`＝西の枝の続き）
//      5 #...........
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####     ← 南の口＝ブーメランの部屋 `1,1`
//   `dungeon_1 1,0` と同じ盤面（D1 側にある鍵の封印を抜いただけ）＝四角い広間に W と雑魚2体・報酬なし。
//
// ■ 新しい `1,0`＝流砂の裂け目の魔物（W の石を「盾を立てて受け、間合いを詰めよ」で越える）
//      0 ############
//      1 #....B.....#     ← (1,5) 宝箱（W を倒すと現れる・killAll）
//      2 #..........#
//      3 #....W.....#     ← (3,5) 魔物 W（南へ向く）
//      4 #...........     ← 東の口（`2,0`）は裂け目の北＝W の広間の側
//      5 #...........
//      6 #xxxx.xxxxx#     ← 流砂の裂け目（穴 x）。渡れるのは列5 の幅1の橋だけ
//      7 #xxxx.xxxxx#
//      8 #..........#     ← 南の口から上がった岸（着地 (8,5) は橋と同じ列）
//      9 #####..#####
//   ・部屋を東西いっぱいの裂け目（穴2行）で南北に割った。南の岸（入口）から北の広間（W・東の口・宝箱）へは
//     列5 の幅1の橋だけ。∴西の枝（`2,0`→`3,0`）へ進むにも宝箱を取るにも、橋を渡って W の広間に入る。
//   ・W は「間合いを保って行/列を揃え、石を投げる」二相の中ボス（`ENEMY_META.W.combat`）。石は穴を越えて飛ぶ。
//     橋は幅1＝橋の上では横へ避けられない＝W が列を揃えると、石は橋を真っすぐ下りてくる。
//     答え＝木の盾（D1 の報酬）を前に立てて受けながら渡る＝看板部屋 `2,1` の本文「盾を 立てて 受け、間合いを 詰めよ。」
//     を、ボス（N も石を投げる）の前に中ボスで一度通す。渡りきれば W は壁と裂け目に挟まれて下がり切れない。
//   ・ブーメランは W を止めない（ボスは硬直しない＝0c）。岸から投げれば削れはするが遅い（木 3・W は def 1）。
//   ・倒すと北の宝箱が現れる（中身はルピー＝仮・キュー45 で見直す）。倒さずに東の口へ抜けてもよい（必須でない）。
//   ・D1 の写しだったパトロール E×2 は外した（W 1体の決闘にする）。
//   ・D2 の他の部屋と型を分けた＝`1,3` 炎の受け渡し・`1,2` 敵のブーメランの軌道・`1,1` 構える敵をスタンで崩す・
//     `0,1` 炎の2段・`0,2` 穴の小島の回収（＝島。ここは島でなく「部屋を割る裂け目と一本橋」）・`2,1` 跳躍蜘蛛と地中蟲。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（2つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-1-0-chasm-monster.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-1-0-chasm-monster.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '1,0';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#.....W....#',
	'#..........#',
	'#....E.E....',
	'#...........',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#....B.....#',
	'#..........#',
	'#....W.....#',
	'#...........',
	'#...........',
	'#xxxx.xxxxx#',
	'#xxxx.xxxxx#',
	'#..........#',
	'#####..#####',
];
export const EXITS = { south: ['9,5', '9,6'], east: ['4,11', '5,11'] };
export const MONSTER = '3,5';            // 魔物 W（橋の列）
export const MONSTER_DIR = 'down';       // 南の岸へ向く
export const BRIDGE = ['6,5', '7,5'];    // 裂け目を渡る幅1の橋
export const ENTRY = '8,5';              // 南の口から上がった最初のセル（橋と同じ列）
export const CHEST = '1,5';
export const CHEST_CONTENT = { type: 'rupee', value: 30, name: 'ルピー×30' };   // 仮＝キュー45 で見直す
export const CHEST_CONDITION = { trigger: 'killAll', message: '砂の 魔物を 退けた！宝箱が現れた！' };

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
// `cut` に入れたセルは歩けないものとして数える（橋を落としたら岸と広間が分かれるかを測る）。
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
// 裂け目（穴の行）を横切る歩けるセル＝橋。番人は盤面から引く。
export function crossings(t) {
	const out = [];
	for (let r = 0; r < ROWS; r++) {
		const row = t[r];
		if (!row.some((ch) => ch === TILE.PIT)) continue;
		for (let c = 0; c < COLS; c++) if (!BLOCKED.has(row[c])) out.push(`${r},${c}`);
	}
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

	// 事前条件＝宝箱と封印以外の中身が無い（違えば黙って上書きしない）。宝箱と封印は適用済みなら狙いと同じ。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	for (const [k, want] of [['chestContents', { [CHEST]: CHEST_CONTENT }], ['showConditions', { [CHEST]: CHEST_CONDITION }]]) {
		const has = room[k] && Object.keys(room[k]).length;
		if (has && JSON.stringify(room[k]) !== JSON.stringify(want)) die(`${ROOM} の ${k} が想定外＝${JSON.stringify(room[k])}`);
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
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (JSON.stringify(room.enemyDirs) !== JSON.stringify({ [MONSTER]: MONSTER_DIR })) {
		room.enemyDirs = { [MONSTER]: MONSTER_DIR };
		log.push(`  ${ROOM}: enemyDirs = { ${MONSTER}: ${MONSTER_DIR} }`);
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
		check(`画面の縁で開いているのは2つの口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵は魔物 W×1 だけ・${MONSTER}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify([MONSTER]) && at(MONSTER) === TILE.MONSTER);
		check(`W は ${MONSTER_DIR} を向く（南の岸へ）`, room.enemyDirs?.[MONSTER] === MONSTER_DIR && Object.keys(room.enemyDirs).length === 1);
		const w = ENEMY_META[TILE.MONSTER];
		const stone = (w.attacks ?? []).find((a) => a.type === 'stone');
		check(`W は間合いの二相で石を投げる（combat.keepMax ${w.combat?.keepMax} ≤ 石の射程 ${stone?.range}）`,
			!!w.combat && !!stone && w.combat.keepMax <= stone.range);
		check(`W はボス扱い＝ブーメランで硬直しない（isBoss・stunnable の明示なし）`, w.isBoss === true && w.stunnable === undefined);
		const threat = stageThreat(room, ENEMY_META);
		check(`雑魚の脅威度＝0（実測 ${threat}）＝ボス格の W だけ（看板部屋 2,1 の 25.0 の梯子に触れない）`, threat === 0);
	}
	check(`宝箱 ${CHEST} は ${CHEST_CONTENT.name}・敵全滅（killAll）で現れる＝関門はこれ1つ`,
		at(CHEST) === TILE.CHEST && cellsOf((ch) => ch === TILE.CHEST).length === 1
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& JSON.stringify(room.showConditions) === JSON.stringify({ [CHEST]: CHEST_CONDITION }));
	check(`看板・床の物・仕掛けが無い`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0)
		&& cellsOf((ch) => [TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR,
			TILE.KEY, TILE.TORCH, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.BREAKABLE_WALL].includes(ch)).length === 0);
	check(`下地（bgTiles）が空`, !room.bgTiles || Object.keys(room.bgTiles).length === 0);

	// ── ② 裂け目と橋の幾何 ──────────────────────────────────────────
	{
		const foot = reach(t);
		const floors = cellsOf((ch) => !BLOCKED.has(ch));
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		check(`2つの口・宝箱の隣・W の隣に歩いて届く`, [...Object.values(EXITS).flat(), '2,5', '2,4', '4,5'].every((k) => foot.has(k)));
		const pits = cellsOf((ch) => ch === TILE.PIT);
		check(`裂け目＝行6-7 の列1-10 のうち橋を除く 18 枚が穴（実測 ${pits.length}）`,
			pits.length === 18 && pits.every((k) => { const [r, c] = P(k); return (r === 6 || r === 7) && c >= 1 && c <= 10; }));
		const cr = crossings(t);
		check(`裂け目を渡れるのは列5 の幅1の橋だけ（実測 ${cr.join(' ')}）`, JSON.stringify(cr) === JSON.stringify(BRIDGE));
		// 橋を落とすと、南の岸（入口）から東の口・宝箱・W へ届かない＝広間へは必ず橋を渡る。
		const cut = reach(t, ENTRY, new Set(BRIDGE));
		check(`橋を落とすと南の岸から東の口・宝箱・W の広間へ届かない`,
			![...EXITS.east, CHEST, MONSTER].some((k) => cut.has(k)));
		// 橋の上は横へ避けられない（両脇が穴）。
		check(`橋の両脇は穴＝橋の上では横へ避けられない`,
			BRIDGE.every((k) => { const [r, c] = P(k); return t[r][c - 1] === TILE.PIT && t[r][c + 1] === TILE.PIT; }));
		const [er, ec] = P(ENTRY), [mr, mc] = P(MONSTER);
		const [br] = P(BRIDGE[0]);
		check(`入口の最初のセル ${ENTRY}・橋・W は同じ列 ${mc}`, ec === mc && BRIDGE.every((k) => P(k)[1] === mc));
		check(`W の初期位置は裂け目の北（広間の側）・橋の手前から ${br - mr} 段`, mr < br);
		check(`宝箱 ${CHEST} は広間の側（裂け目の北）`, P(CHEST)[0] < br);
		// 入口の着地から W までは石の射程より遠い＝入った瞬間には撃たれない（W が寄ってから撃つ）。
		const stone = ENEMY_META[TILE.MONSTER].attacks.find((a) => a.type === 'stone');
		check(`入口 ${ENTRY} から W の初期位置まで ${er - mr}＞石の射程 ${stone.range}＝入った瞬間は撃たれない`, er - mr > stone.range);
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
	console.log(`# ${LAYER} ${ROOM}：中ボスの部屋を「流砂の裂け目の魔物」に作り替える（キュー41 第2陣）`);
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
