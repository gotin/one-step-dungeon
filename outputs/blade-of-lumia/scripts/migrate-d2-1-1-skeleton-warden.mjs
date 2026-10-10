// dungeon_2 `1,1`（ブーメランの部屋）：D1 の写しの部屋を「旋刃の祭壇と骸骨の番兵」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第1陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 #####..#####     ← 北の口＝`1,0`（中ボスの部屋）
//      1 #.......E..#     ← パトロール E×1（脅威度 4.0）
//      2 #..........#
//      3 #....B.....#     ← (3,5) ブーメランの宝箱
//      4 ...........#     ← 西の口＝`0,1`（鍵の部屋）
//      5 ...........#
//      6 #..........#
//      7 #....i.....#     ← (7,5) 旋刃の書き置き
//      8 #..........#
//      9 #####..#####     ← 南の口＝`1,2`（ブーメラン鬼の十字路）
//   `dungeon_1 1,1` と 6 セル差以内（D1 の地中蟲 α×2 を E に、木の盾をブーメランに替えただけ）。
//
// ■ 新しい `1,1`＝旋刃の祭壇と骸骨の番兵（D2 の主題「ブーメラン」を手にした直後に一度だけ試させる）
//      0 #####..#####
//      1 #..........#
//      2 #.##.θ..##.#     ← (2,5) 骸骨剣士 θ（南の口へ向く）
//      3 #.##....##.#
//      4 ...........#
//      5 ...........#
//      6 #.##....##.#
//      7 #.##B..i##.#     ← (7,4) ブーメランの宝箱・(7,7) 旋刃の書き置き
//      8 #..........#
//      9 #####..#####
//   ・2×2 の柱を4本立てた列柱の広間。真ん中の縦の通り（列4-7）が北の口と南の口を、柱の間の横の通り
//     （行4-5）が西の口を、外周（列1・10／行1・8）が柱の裏をつなぐ。
//   ・宝箱は南の口から上がってすぐ（入口の着地 (8,5) から1歩横・1歩上）。番兵 θ は北の柱の間 (2,5)。
//     θ の足（0.25 セル/tick）では宝箱を開けるより先に入口まで来られない＝**ブーメランを持った状態で
//     番兵と向き合う**順番が地形で決まる（宝箱を素通りして先に戦うこともできる＝剣だけでも勝てる）。
//   ・θ は剣の間合いに入ると、攻撃の合間だけ正面を盾で構える（tickGuard＝正面からの剣は 0 ダメージ）。
//     ブーメランを当てると 1.5 秒止まり、構えも解ける（projectile.js）＝**ユーザー設計
//     「ブーメランで動きを止めてガード不能にしてから攻撃する」**を、手にしたその部屋で体に入れる。
//     θ は縦の通りを真っ直ぐ下りてくる＝通りに立てば投げる線が自然に揃う。
//   ・剣だけの答えも残す＝木の盾（D1 の報酬）で θ の剣を受けながら正面から粘る。実測（`.scratch/q41-1-1-probe.mjs`・
//     ハート3＝HP 6）＝ブーメラン→剣は 30 tick・無傷／木の盾で正面から剣だけは 143 tick・無傷（弾かれ 89 回）／
//     盾なしで正面から剣だけは HP 6→0。∴ブーメランが「速く・安全に」崩す答えになる（必須ではない）。
//   ・宝箱の中身（ブーメラン）と書き置きの本文は変えない（書き置きは宝箱の対の位置へ移しただけ）。
//   ・D2 の他の部屋と型を分けた＝`1,3` 炎の受け渡し・`1,2` 敵のブーメランの軌道・`0,1` 炎の2段・
//     `0,2` 穴の小島の回収・`2,1` 跳躍蜘蛛と地中蟲（スタンで跳ぶ敵を止める）。ここは
//     「スタンで構えを崩す」＝穴も篝火も使わない。θ は D4 の看板部屋が初出だったが、弱点の道具を
//     持たない敵∴どこに置いてもよい（WEAKNESS_ITEM に載らない）。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（3つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-1-1-skeleton-warden.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-1-1-skeleton-warden.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS, WEAKNESS_ITEM } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '1,1';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#.......E..#',
	'#..........#',
	'#....B.....#',
	'...........#',
	'...........#',
	'#..........#',
	'#....i.....#',
	'#..........#',
	'#####..#####',
];
const OLD_CHEST = '3,5';
const OLD_SIGN  = '7,5';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#..........#',
	'#.##.θ..##.#',
	'#.##....##.#',
	'...........#',
	'...........#',
	'#.##....##.#',
	'#.##B..i##.#',
	'#..........#',
	'#####..#####',
];
export const EXITS = { north: ['0,5', '0,6'], south: ['9,5', '9,6'], west: ['4,0', '5,0'] };
export const WARDEN = '2,5';             // 骸骨剣士（北の柱の間）
export const WARDEN_DIR = 'down';        // 南の口へ向く
export const CHEST = '7,4';              // ブーメランの宝箱（入口から1歩横・1歩上）
export const SIGN = '7,7';               // 旋刃の書き置き（宝箱の対）
export const ENTRY = '8,5';              // 南の口から上がった着地
export const PILLARS = [[2, 2], [2, 8], [6, 2], [6, 8]];   // 2×2 の柱の左上
export const EXPECT_THREAT = 18.0;       // θ×1（看板部屋 2,1 の 25.0 より軽い）

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
// 宝箱は踏んで開ける（通れる）∴BLOCKED に入らない。
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
// 歩数（4近傍の最短）。番人は「入口→宝箱」と「番兵→入口」の歩数を比べる。
export function steps(t, from, to) {
	const dist = new Map([[from, 0]]);
	const q = [from];
	while (q.length) {
		const k = q.shift();
		if (k === to) return dist.get(k);
		const [r, c] = P(k);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || dist.has(nk)) continue;
			// 番兵の歩数を測るときは自分のセル（敵の文字）を通れるものとして数える
			if (nk !== to && BLOCKED.has(t[nr][nc])) continue;
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

	// 事前条件＝宝箱はブーメラン・看板は旋刃の書き置き（旧位置か新位置のどちらか＝冪等）
	const chestKey = room.chestContents?.[CHEST] ? CHEST : OLD_CHEST;
	const signKey  = room.signData?.[SIGN] ? SIGN : OLD_SIGN;
	const chest = room.chestContents?.[chestKey];
	const sign  = room.signData?.[signKey];
	if (chest?.type !== 'item' || chest.item !== 'boomerang') die(`${ROOM} の宝箱（${chestKey}）がブーメランでない`);
	if (sign?.name !== '旋刃の書き置き') die(`${ROOM} の看板（${signKey}）が旋刃の書き置きでない`);
	if (Object.keys(room.chestContents).length !== 1 || Object.keys(room.signData).length !== 1) die(`${ROOM} の宝箱・看板が1つずつでない`);
	const extras = ['mapEnters', 'floorItems', 'showConditions', 'npcData', 'shopData', 'breakableWalls', 'objects'];
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
	if (chestKey !== CHEST) {
		room.chestContents = { [CHEST]: chest };
		log.push(`  ${ROOM}: 宝箱（ブーメラン）を ${chestKey} → ${CHEST}`);
	}
	if (signKey !== SIGN) {
		room.signData = { [SIGN]: sign };
		log.push(`  ${ROOM}: 旋刃の書き置きを ${signKey} → ${SIGN}（本文は変えない）`);
	}
	if (JSON.stringify(room.enemyDirs) !== JSON.stringify({ [WARDEN]: WARDEN_DIR })) {
		room.enemyDirs = { [WARDEN]: WARDEN_DIR };
		log.push(`  ${ROOM}: enemyDirs = { ${WARDEN}: ${WARDEN_DIR} }`);
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
		check(`画面の縁で開いているのは3つの口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵は骸骨剣士 θ×1 だけ・${WARDEN}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify([WARDEN]) && at(WARDEN) === TILE.SKELETON);
		check(`θ は ${WARDEN_DIR} を向く（南の口へ）`, room.enemyDirs?.[WARDEN] === WARDEN_DIR && Object.keys(room.enemyDirs).length === 1);
		const m = ENEMY_META[TILE.SKELETON];
		check(`θ は剣を持ち、構える（attack.type sword・guards が false でない）`, m.attack?.type === 'sword' && m.guards !== false);
		check(`θ は弱点の道具を要さない（WEAKNESS_ITEM に載らない）`, !m.weakness || !WEAKNESS_ITEM[m.weakness.type]);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝看板部屋 2,1（25.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`宝箱は ${CHEST} の1つだけ・中身はブーメラン`,
		JSON.stringify(cellsOf((ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST])
		&& Object.keys(room.chestContents).join() === CHEST && room.chestContents[CHEST].item === 'boomerang');
	check(`看板は ${SIGN} の1つだけ・旋刃の書き置き（本文3行は書き換え前と同じ）`,
		JSON.stringify(cellsOf((ch) => ch === TILE.SIGN)) === JSON.stringify([SIGN])
		&& Object.keys(room.signData).join() === SIGN && room.signData[SIGN].lines.length === 3
		&& room.signData[SIGN].lines[0] === 'この ブーメランで 遠くの 物を 回収できる。');
	check(`封印・床の物・仕掛けが無い（宝箱は最初から開けられる）`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0)
		&& cellsOf((ch) => [TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR, TILE.KEY, TILE.TORCH, TILE.PIT,
			TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.BREAKABLE_WALL].includes(ch)).length === 0);
	check(`下地（bgTiles）が空`, !room.bgTiles || Object.keys(room.bgTiles).length === 0);

	// ── ② 列柱の幾何 ──────────────────────────────────────────────────
	{
		const foot = reach(t);
		check(`3つの口・宝箱・θ の隣に歩いて届く`,
			[...Object.values(EXITS).flat(), CHEST, '3,5', '2,4', '2,6', '1,5'].every((k) => foot.has(k)));
		const floors = cellsOf((ch) => !BLOCKED.has(ch));
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		check(`2×2 の柱が4本（${PILLARS.map(([r, c]) => `${r},${c}`).join(' ')}）`,
			PILLARS.every(([r, c]) => [0, 1].every((dr) => [0, 1].every((dc) => t[r + dr][c + dc] === TILE.WALL))));
		// どの柱も壁から離れて立つ＝柱の陰で θ をやり過ごし、投げる線を選び直せる。
		// 外周のうち歩けないのは書き置き (7,7) の1セルだけ＝宝箱は踏める。
		const ring = ([r, c]) => {
			const out = [];
			for (let k = -1; k <= 2; k++) out.push(`${r - 1},${c + k}`, `${r + 2},${c + k}`, `${r + k},${c - 1}`, `${r + k},${c + 2}`);
			return out;
		};
		const ringBlocked = [...new Set(PILLARS.flatMap(ring))].filter((k) => { const [r, c] = P(k); return BLOCKED.has(t[r][c]); });
		check(`柱はどれも壁から離れて立つ（外周で歩けないのは書き置きだけ・実測 ${ringBlocked.join(' ')}）`,
			JSON.stringify(ringBlocked) === JSON.stringify([SIGN]));
		// 順番：入口→宝箱の歩数 ＜ 番兵→入口の歩数 ÷ (θ の足 / プレイヤーの足)
		const toChest = steps(t, ENTRY, CHEST);
		const wardenToEntry = steps(t, WARDEN, ENTRY);
		const ratio = ENEMY_META[TILE.SKELETON].speed / 1.0;   // プレイヤーの足＝速度換算 1.0（MOVE_STEP 0.5/tick）
		check(`宝箱は入口から ${toChest} 歩・θ は入口まで ${wardenToEntry} 歩（足の比 ${ratio}）＝宝箱を開けるのが先`,
			toChest <= 2 && toChest < wardenToEntry * ratio);
		// θ は縦の通り（列4-7）を真っ直ぐ下りてくる＝θ の列は入口の列と同じ
		check(`θ の列（${P(WARDEN)[1]}）＝入口の列（${P(ENTRY)[1]}）＝通りに立てば投げる線が揃う`, P(WARDEN)[1] === P(ENTRY)[1]);
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
	console.log(`# ${LAYER} ${ROOM}：ブーメランの部屋を「旋刃の祭壇と骸骨の番兵」に作り替える（キュー41 第1陣）`);
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
