// dungeon_1 `2,0`（中ボスの部屋 `1,0` と鎧の部屋 `3,0` の間の通り道）：ルピーが2つ落ちているだけの
// 四角い部屋を「ルピー喰いの金庫」に作り替える（2026-10-12 / PLAN 実行キュー 47 の第1陣 6室目・設計は Opus・
// 主題＝ユーザー選択「ルピー喰いの金庫」）
//
// ■ 何が薄かったか（キュー47 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #....r.....#
//      3 #..........#
//      4 ............     ← 西の口（`1,0` から）／東の口（`3,0` へ）
//      5 .....R......
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   東西に抜けるだけの空き部屋に、小ルピーと大ルピーが1つずつ（キュー21 の F6）。
//
// ■ 新しい `2,0`＝裏口の金庫とルピー喰い
//      0 ############
//      1 #..........#     ← 北の通り（裏口の前）
//      2 #.###.####.#     ← 金庫の裏口 (2,5)（幅1・東西の口と反対の北向き）
//      3 #.#r....r#.#
//      4 ..#R.rσ.R#..     ← 西の口（`1,0` から）／東の口（`3,0` へ）／ルピー喰い σ
//      5 ..########..
//      6 #..........#
//      7 #..........#     ← 南の広間（東西の通り抜けはここを回る）
//      8 #..........#
//      9 ############
//   ・部屋の真ん中に石の箱＝金庫（中は行3-4・列3-8 の 12 マス）。入口は北の裏口 (2,5) の1マスだけ。
//     東西の口から入ると箱の南と脇しか見えない＝宝は見えるが入口が無い→回り込むと北に裏口。宝はすべて金庫の中
//     （大ルピー2・小ルピー3＝13）。
//   ・ルピー喰い σ×1（`shared/enemies.js` の leech）は金庫の中。寄ってきて隣に来ると張り付き、0.6 秒ごとに
//     ルピーを 2 つ吸う（張り付いている間は体力を削らない）。叩けば剥がれる（1.2 秒は張り付き直せない）。
//     倒すと吸われた分の半分が戻る。剥がれている間は体当たり（予告 0.48 秒・到達 1.5）をする。
//   ・σ は道を探さない（`enemyChase`＝寄る向きの2択だけ）。∴**勇者が南の広間・東西の脇に居る間、σ は箱の壁に
//     阻まれて金庫の中を行き来するだけ＝檻の番人。** 出てくるのは勇者が北の通りの裏口の前（と、その西）に立った
//     ときだけ。∴東西の通り抜け（南の広間を回る）は邪魔されない。
//   ・宝を取る手＝(a) 裏口から入って番人と1対1（木の剣で 15 振り）(b) 張り付かれたら叩いて剥がしながら拾う
//     (c) 裏口の前でおびき出して外で戦う。叩かずに拾うと、拾った分より多く吸われる（実測 13 拾って 20 吸われる）。
//   ・D1 の他の部屋と型を分けた＝ルピー喰いは D1 ではここだけ（field の東の端と D6 にしか居ない＝D2〜D5 の初出を
//     横取りしない）。`0,2`（門の窓の祠）の「見えるが届かない→裏へ回る」を、部屋の中の箱で言う。
//   ・脅威度 22.5＝看板部屋 `1,1` の 18.0 より重い。ただしこの部屋は中ボス（`1,0`＝56.0）を越えた先の通り道で、
//     σ は宝を取りに行かない限り相手にしなくてよい＝D1 の重さの順は崩さない（鍵の関門の値は動かさない）。
//
// ■ 実測（headless・木の剣・ハート3・盾なし・所持 30 ルピー・`.scratch/q47f/beh.mjs`／`proto.mjs`）
//   ・金庫の外の 17 か所に 150 tick 立ち続ける＝σ が出てきたのは北の通りの (1,3)(1,4)(1,5) だけ。南の広間・
//     東西の脇・東西の口・裏口の東隣 (1,6) では出てこない（張り付き 0・被弾 0）。
//   ・金庫の中のどの隅に立っても張り付かれる（吸われる）。
//   ・σ を無視して全部拾う＝13 拾って 20 吸われる（差し引き −7）・被弾 1（−3）。
//   ・立ち止まって斬り合う＝体当たり2発で倒れる（ハート3）。
//   ⚠️ 最初は「北の壁ぎわの金庫（戸口は南）＋σ は戸口の前」だった。実機で、勇者が金庫の中に居ると σ が金庫の
//      南の壁の下で引っかかって入ってこない／σ を金庫の中に移すと、勇者が広間に居るだけで戸口から出てくる、と
//      分かった（道を探さない追跡は、戸口が勇者の側を向いていると素通りで出てくる）。∴戸口を勇者の来る側の反対
//      （北）へ向けた。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（東西の口は同じセルで開いたまま）。
//   ・床のルピーは 6 → 13（旧セーブで拾い済みのセルは pickedKeys に残る＝新しい位置の分だけ拾える）。
//
// 使い方:
//   node scripts/migrate-d1-2-0-rupee-vault.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d1-2-0-rupee-vault.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { MOVE_STEP } from '../game/constants.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_1';
const ROOM  = '2,0';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#....r.....#',
	'#..........#',
	'............',
	'.....R......',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#..........#',
	'#.###.####.#',
	'#.#r....r#.#',
	'..#R.rσ.R#..',
	'..########..',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];
export const EXITS = { west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const ENTRY = '4,0';
export const EATER = '4,6';                                          // ルピー喰いの持ち場（金庫の中）
export const DOOR = '2,5';                                           // 金庫の裏口（幅1・北向き）
export const VAULT = { r0: 3, r1: 4, c0: 3, c1: 8 };                 // 金庫の中（12 マス）
export const VAULT_RUPEES = { '3,3': 'r', '3,8': 'r', '4,3': 'R', '4,5': 'r', '4,8': 'R' };
export const HALL = { r0: 6, r1: 8 };                                // 南の広間
export const RUPEE_VALUE = { r: 1, R: 5 };                           // game/player.js の拾い（小 1・大 5）
export const LEECH = ENEMY_META[TILE.RUPEE_EATER].leech;             // { attachRange, drainMs, amount, refund, cooldownMs }
export const SIGNATURE_THREAT = 18;                                  // 看板部屋 `1,1`（地中蟲）
export const GATE_THREAT = 56;                                       // 中ボスの部屋 `1,0`（tests/dungeon-key-gate ⑨）

export const vaultCells = () => {
	const out = [];
	for (let r = VAULT.r0; r <= VAULT.r1; r++) for (let c = VAULT.c0; c <= VAULT.c1; c++) out.push(`${r},${c}`);
	return out;
};

// ── 歩行の到達（壁は通れない・ルピーと敵の居るセルは床） ─────────────
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

	// 事前条件＝盤面の外の中身が無い（ルピーは tiles の 'r'/'R' で持つ）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects',
		'enemyDirs', 'showConditions', 'chestContents', 'bgTiles'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	if (room.links?.length) die(`${ROOM} の links が空でない`);
	if (room.monsters?.length) die(`${ROOM} の monsters が空でない`);
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
		log.push(`  ${ROOM}: 盤面を差し替えた（裏口の金庫・σ×1 を金庫の中 ${EATER}・床のルピー 6 → 13）`);
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
		check(`画面の縁で開いているのは東西の口だけ＝書き換え前と同じ通り道（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵はルピー喰い σ×1 だけ・持ち場 ${EATER}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify([EATER]) && at(EATER) === TILE.RUPEE_EATER);
		const s = ENEMY_META[TILE.RUPEE_EATER];
		check(`σ は張り付いて吸う（隣 ${LEECH.attachRange} で張り付き・${LEECH.drainMs}ms ごとに ${LEECH.amount}・倒すと ${LEECH.refund * 100}% 戻る）・ボスでない・弱点の道具を持たない`,
			LEECH.attachRange >= 1.0 && LEECH.amount > 0 && LEECH.refund > 0 && !s.isBoss && !s.weakness && !s.move);
		// 勇者は 1 tick に MOVE_STEP 進む。素の追跡（enemyChase）は speed を貯めて 1.0 で MOVE_STEP 進む。
		check(`σ の足（1 tick ${s.speed * MOVE_STEP} マス）は勇者（${MOVE_STEP} マス）より遅い＝開けた所では追いつかれない`,
			s.speed < 1 && !s.zigzag && !s.leap && !s.dash && !s.laneStalk);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝中ボスの部屋 \`1,0\` の ${GATE_THREAT}.0 より軽い（看板部屋 \`1,1\` の ${SIGNATURE_THREAT}.0 よりは重い＝中ボスを越えた先の通り道）`,
			threat > SIGNATURE_THREAT && threat < GATE_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	{
		const rupees = cellsOf((ch) => ch === TILE.ITEM_RUPEE || ch === TILE.ITEM_RUPEE_LARGE);
		check(`床のルピーは金庫の棚の ${Object.keys(VAULT_RUPEES).length} 個だけ（実測 ${rupees.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(rupees.sort()) === JSON.stringify(Object.keys(VAULT_RUPEES).sort())
			&& Object.entries(VAULT_RUPEES).every(([k, ch]) => at(k) === ch));
		const sum = Object.values(VAULT_RUPEES).reduce((a, ch) => a + RUPEE_VALUE[ch], 0);
		check(`金庫の中は ${sum} ルピー＝宝はすべて金庫の中（広間には落ちていない）`,
			sum === 13 && rupees.every((k) => vaultCells().includes(k)));
	}
	check(`宝箱・看板・仕掛け・ほかの床の物なし`,
		cellsOf((ch) => [TILE.CHEST, TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR, TILE.KEY, TILE.TORCH, TILE.PIT,
			TILE.BREAKABLE_WALL, TILE.ITEM_HEAL_POTION, TILE.ITEM_DUNGEON_MAP, TILE.ITEM_COMPASS].includes(ch)).length === 0);

	// ── ② 金庫の幾何 ──────────────────────────────────────────────────
	{
		const foot = reach(t);
		const floors = cellsOf((ch) => !BLOCKED.has(ch) || !!ENEMY_META[ch]);
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		const vault = vaultCells();
		check(`金庫の中（行${VAULT.r0}-${VAULT.r1}・列${VAULT.c0}-${VAULT.c1}）は ${vault.length} マスすべて床`, vault.every((k) => walkable(t, k)));
		// 金庫の外周で床なのは戸口だけ＝袋小路。
		const ring = [];
		for (let c = VAULT.c0 - 1; c <= VAULT.c1 + 1; c++) ring.push(`${VAULT.r0 - 1},${c}`, `${VAULT.r1 + 1},${c}`);
		for (let r = VAULT.r0; r <= VAULT.r1; r++) ring.push(`${r},${VAULT.c0 - 1}`, `${r},${VAULT.c1 + 1}`);
		const openRing = ring.filter((k) => walkable(t, k));
		check(`金庫の外周で開いているのは戸口 ${DOOR} だけ（実測 ${openRing.join(' ')}）`,
			JSON.stringify(openRing) === JSON.stringify([DOOR]));
		check(`対照＝戸口を切ると金庫のどこへも届かない（切らなければ全部届く）`,
			vault.every((k) => foot.has(k)) && vault.every((k) => !reach(t, ENTRY, new Set([DOOR])).has(k)));
		// 東西の口どうしは金庫を通らずにつながる（南の広間を回る）＝通り抜けは番人の檻の外。
		check(`東西の口は金庫を通らずにつながる（金庫と裏口を切っても ${ENTRY} から東の口へ届く）`,
			reach(t, ENTRY, new Set([...vault, DOOR])).has(EXITS.east[0]));
		// 金庫の南の壁・東西の壁はすべて岩＝σ が箱から出られるのは北の裏口だけ。
		const [dr, dc] = P(DOOR);
		const south = [...Array(VAULT.c1 - VAULT.c0 + 3).keys()].map((i) => `${VAULT.r1 + 1},${VAULT.c0 - 1 + i}`);
		const sides = [VAULT.r0, VAULT.r1].flatMap((r) => [`${r},${VAULT.c0 - 1}`, `${r},${VAULT.c1 + 1}`]);
		check(`金庫の南の壁（行${VAULT.r1 + 1}）と東西の壁（列${VAULT.c0 - 1}・列${VAULT.c1 + 1}）はすべて岩＝口は北の裏口だけ`,
			[...south, ...sides].every((k) => at(k) === TILE.WALL));
		check(`裏口 ${DOOR} は金庫の北＝東西の口（行${P(EXITS.west[0])[0]}-${P(EXITS.west[1])[0]}）と南の広間（行${HALL.r0}-${HALL.r1}）の反対側`,
			dr === VAULT.r0 - 1 && dr < P(EXITS.west[0])[0] && dr < HALL.r0);
		check(`σ の持ち場 ${EATER} は金庫の中`, vault.includes(EATER));
		const [er, ec] = P(EATER);
		const dist = (k) => { const [r, c] = P(k); return Math.abs(r - er) + Math.abs(c - ec); };
		check(`σ は東西どちらの口からも 5 マス以上離れている（${Object.values(EXITS).flat().map((k) => `${k}:${dist(k)}`).join(' ')}）`,
			Object.values(EXITS).flat().every((k) => dist(k) >= 5));
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
	console.log(`# ${LAYER} ${ROOM}：ルピーが落ちているだけの通り道を「ルピー喰いの金庫」に作り替える（キュー47 第1陣 6室目）`);
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
