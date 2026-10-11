// dungeon_2 `2,0`（西の枝の通り道）：D1 の写しの部屋を「封じ火の墓廊」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第2陣 2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #....r.....#     ← ルピー（小）
//      3 #..........#
//      4 ............     ← 西の口（中ボスの部屋 `1,0`）・東の口（行き止まり `3,0`）
//      5 .....R......     ← ルピー（大）
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   `dungeon_1 2,0` とバイト一致（床にルピー2枚だけ・敵なし）。
//
// ■ 新しい `2,0`＝封じ火の墓廊（剣を封じる鬼火を、龕の線に乗せて旋刃で落とす）
//      0 ############
//      1 #..##.ψ##..#     ← 北の龕3つ（列1-2・5-6・9-10）。真ん中の龕の奥に呪い火 ψ
//      2 #..##r.##..#     ← 真ん中の龕の副葬品＝ルピー（小）（書き換え前と同じセル）
//      3 #..##..##..#
//      4 ............     ← 墓廊（東西の通り・幅2）。西の口＝中ボスの部屋 `1,0`／東の口＝行き止まり `3,0`
//      5 ............
//      6 ###..##..###     ← 南の龕2つ（列3-4・7-8）＝北と互い違い
//      7 ###..##.ψ###     ← 東の龕の奥に呪い火 ψ
//      8 ###..##R.###     ← 東の龕の副葬品＝ルピー（大）
//      9 ############
//   ・墓廊の両側に龕（幅2・奥行き3の袋小路）を互い違いに5つ並べた地下墓所。龕は墓廊にしか口を開けていない。
//   ・D2 のブーメランは `1,1` で手に入る＝この部屋（`1,1`→`1,0`→`2,0`）に来る時点で必ず持っている。
//   ・呪い火 ψ は触れると剣を3秒封じ、触れている間は封じ直す（`ENEMY_META.ψ.inflict`）。接触の間合い（1.5）は
//     木の剣の届きより長い＝**立って迎え撃つと先に封じられる**（実測＝構えて振り続けても1度も当たらない）。
//     木の盾も防がない。ψ は HP 3・def 0＝木のブーメラン（固定 3）なら1発で落ちる。
//   ・ψ は飛ぶが壁で止まり、行と列に沿ってプレイヤーへ寄る。龕から出る道は口（幅2）だけ＝ψ は龕の口の角に
//     張り付いて待ち、プレイヤーが口の前を通ると龕の列をまっすぐ下りて（上って）くる＝その線がブーメランの線。
//     答え＝龕の口の前で龕へ向いて投げる（距離 2〜3）。副葬品のルピーを取るには ψ の居る龕へ入る＝落としてから入る。
//     墓廊を走って抜けてもよい（ψ はプレイヤーより遅い）＝倒すことは必須でない。
//   ・床のルピー2枚は書き換え前と同じ物を龕に納めた（`r` は同じセル `(2,5)`・`R` は東の南の龕へ）＝報酬はキュー45〈2026-10-11〉で据え置き（C 段）。
//   ・D2 の他の部屋と型を分けた＝`1,3` 炎の受け渡し・`1,2` 敵のブーメランの軌道（十字の広間）・`1,1` 構える敵をスタンで崩す
//     （列柱の広間）・`1,0` 裂け目と一本橋（石を盾で受ける）・`0,1` 炎の2段・`0,2` 穴の小島の回収・`2,1` 跳躍蜘蛛と地中蟲。
//     ここは「剣が効かない相手をブーメランで落とす」＝ブーメランを**剣の代わり**として使う部屋。
//     ⚠️ 最初の叩き台は墓廊に北と南の龕を1つずつ（十字）にした＝`1,2` の十字の広間と同じ形に見えた∴互い違いの櫛にした。
//   ・ψ は D4 の看板の敵（`2,3`「剣封じの十字砲火」＝θ×2 と ψ×2）。D2 では ψ だけを2体・剣を封じる仕組みを
//     ブーメラン1本で解かせる＝D4 の看板は骸骨剣士と重ねた再演になる（D2 `1,2` が D7 の看板の π を先に見せたのと同じ扱い）。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（2つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-2-0-sealfire-crypt.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-2-0-sealfire-crypt.mjs         # 書き込み

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
	'#..##.ψ##..#',
	'#..##r.##..#',
	'#..##..##..#',
	'............',
	'............',
	'###..##..###',
	'###..##.ψ###',
	'###..##R.###',
	'############',
];
export const EXITS = { west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const FIRES = ['1,6', '7,8'];         // 呪い火 ψ（北の真ん中の龕・南の東の龕）
export const HALL_ROWS = [4, 5];             // 墓廊＝東西の通り
export const NICHE_MOUTHS = { north: ['3,1', '3,2', '3,5', '3,6', '3,9', '3,10'], south: ['6,3', '6,4', '6,7', '6,8'] };
export const ENTRY = '4,0';                  // 西の口（中ボスの部屋から入った最初のセル）
export const RUPEES = { [TILE.ITEM_RUPEE]: '2,5', [TILE.ITEM_RUPEE_LARGE]: '8,7' };

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
// 墓廊の行（HALL_ROWS）の外にある歩けるセル＝龕。龕と墓廊の境目（墓廊に接する龕のセル）を口として返す。
export function nicheMouths(t) {
	const out = [];
	for (let r = 0; r < ROWS; r++) {
		if (HALL_ROWS.includes(r)) continue;
		for (let c = 0; c < COLS; c++) {
			if (BLOCKED.has(t[r][c])) continue;
			if (HALL_ROWS.includes(r + 1) || HALL_ROWS.includes(r - 1)) out.push(`${r},${c}`);
		}
	}
	return out;
}

// k を含む龕（墓廊の行を通らずに歩けるセルの塊）。墓廊の上なら空。
export function nicheOf(t, k) {
	const [r0] = P(k);
	if (HALL_ROWS.includes(r0)) return new Set();
	const seen = new Set([k]);
	const q = [k];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk) || HALL_ROWS.includes(nr) || BLOCKED.has(t[nr][nc])) continue;
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

	// 事前条件＝盤面の外の中身が無い（違えば黙って上書きしない）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects',
		'chestContents', 'showConditions', 'enemyDirs'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	if (room.links?.length) die(`${ROOM} の links が空でない`);

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
		check(`画面の縁で開いているのは2つの口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵は呪い火 ψ×2 だけ・${FIRES.join(' ')}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify(FIRES) && FIRES.every((k) => at(k) === TILE.CURSE_FIRE));
		const psi = ENEMY_META[TILE.CURSE_FIRE];
		check(`ψ は触れると剣を封じる（inflict.type ${psi.inflict?.type}）・飛ぶ（move ${psi.move}）`,
			psi.inflict?.type === 'sealSword' && psi.move === 'air');
		check(`ψ は木のブーメラン1発で落ちる（hp ${psi.hp}・def ${psi.def}）`, psi.hp <= 3 && (psi.def ?? 0) === 0);
		check(`ψ は弱点の道具を持たない＝どの道具でも倒せる`, !psi.weakness);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝看板部屋 2,1 の 25.0 より軽い`, threat > 0 && threat < 25);
	}
	check(`床のルピー2枚＝r は ${RUPEES[TILE.ITEM_RUPEE]}（書き換え前と同じセル）・R は南の龕 ${RUPEES[TILE.ITEM_RUPEE_LARGE]}`,
		Object.entries(RUPEES).every(([ch, k]) => at(k) === ch)
		&& cellsOf((ch) => ch === TILE.ITEM_RUPEE || ch === TILE.ITEM_RUPEE_LARGE).length === 2);
	check(`宝箱・看板・仕掛けが無い（通り道）`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0)
		&& cellsOf((ch) => [TILE.CHEST, TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR,
			TILE.KEY, TILE.TORCH, TILE.PIT, TILE.BREAKABLE_WALL].includes(ch)).length === 0);
	check(`下地（bgTiles）が空`, !room.bgTiles || Object.keys(room.bgTiles).length === 0);

	// ── ② 墓廊と龕の幾何 ──────────────────────────────────────────
	{
		const foot = reach(t);
		const floors = cellsOf((ch) => !BLOCKED.has(ch));
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		check(`2つの口・ψ の居るセル・ルピーに歩いて届く`,
			[...Object.values(EXITS).flat(), ...FIRES, ...Object.values(RUPEES)].every((k) => foot.has(k)));
		// 墓廊は行4-5 の端から端まで床＝東西の通り。墓廊の外は龕だけ。
		check(`墓廊（行 ${HALL_ROWS.join('-')}）は端から端まで歩ける`,
			HALL_ROWS.every((r) => t[r].every((ch) => !BLOCKED.has(ch))));
		const mouths = nicheMouths(t).sort();
		const wantMouths = Object.values(NICHE_MOUTHS).flat().sort();
		check(`龕の口は北に3つ・南に2つ（幅2ずつ・互い違い）（実測 ${mouths.join(' ')}）`,
			JSON.stringify(mouths) === JSON.stringify(wantMouths));
		// 龕は袋小路（墓廊にしか口を開けていない）＝墓廊を塞ぐと西の口から東の口へ届かない。
		const cut = reach(t, ENTRY, new Set(cellsOf((ch) => !BLOCKED.has(ch)).filter((k) => {
			const [r, c] = P(k); return HALL_ROWS.includes(r) && c >= 5 && c <= 6;
		})));
		check(`墓廊の真ん中（列5-6）を塞ぐと西の口から東の口へ届かない＝龕は抜け道でない`,
			!EXITS.east.some((k) => cut.has(k)));
		const niches = [];
		for (const k of cellsOf((ch) => !BLOCKED.has(ch))) {
			if (HALL_ROWS.includes(P(k)[0]) || niches.some((n) => n.has(k))) continue;
			niches.push(nicheOf(t, k));
		}
		check(`龕は5つ・どれも幅2×奥行き3（実測 ${niches.map((n) => n.size).join('・')}）`,
			niches.length === 5 && niches.every((n) => n.size === 6));
		// ψ はそれぞれ別の龕の奥（墓廊に接していない段）に居て、同じ龕に副葬品のルピーがある。
		for (const [f, ch] of [[FIRES[0], TILE.ITEM_RUPEE], [FIRES[1], TILE.ITEM_RUPEE_LARGE]]) {
			const n = nicheOf(t, f);
			const [fr] = P(f);
			check(`ψ ${f} は龕の奥（墓廊から ${Math.min(...HALL_ROWS.map((h) => Math.abs(h - fr))) } 段）・同じ龕に ${ch} ${RUPEES[ch]}`,
				n.size === 6 && n.has(RUPEES[ch]) && HALL_ROWS.every((h) => Math.abs(h - fr) >= 2));
		}
		check(`2体の ψ は別の龕（北と南）`, !nicheOf(t, FIRES[0]).has(FIRES[1]) && P(FIRES[0])[0] < HALL_ROWS[0] && P(FIRES[1])[0] > HALL_ROWS[1]);
		// 入った瞬間に触れられない＝西の口から両方の ψ まで、接触の間合い（1.5）を大きく超える。
		const dist = (a, b) => { const [ar, ac] = P(a), [br, bc] = P(b); return Math.abs(ar - br) + Math.abs(ac - bc); };
		// 東の口（行き止まり `3,0` から戻る側）からも同じ（入った瞬間に封じられない）。
		const near = (k) => Math.min(...Object.values(EXITS).flat().map((x) => dist(x, k)));
		check(`どの口からも ψ まで ${FIRES.map(near).join('・')} マス以上（≥ 5＝構える間がある）`,
			FIRES.every((k) => near(k) >= 5));
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
	console.log(`# ${LAYER} ${ROOM}：西の枝の通り道を「封じ火の墓廊」に作り替える（キュー41 第2陣）`);
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
