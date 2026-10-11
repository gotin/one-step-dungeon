// dungeon_2 `2,3`（入口の東の通り道）：床と雑魚だけの部屋を「流砂の大穴と追い手」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第3陣 2室目・設計は Opus・主題＝ユーザー選択「流砂の大穴と追い手」）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 #####..#####     ← 北の口（対の祠 `2,2`）
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 ............     ← 西の口（入口 `1,3`）／東の口（`3,3`）
//      5 .......E....
//      6 #....C.....#
//      7 #..........#
//      8 #..........#
//      9 ############
//   四角い広間に巡回兵 E と追跡者 C が1体ずつ＝床と雑魚だけ（D1 `2,3` のコウモリの群れの箱から中身を替えた形）。
//   下地は旧盤面の砂の名残が2枚（`1,5`・`1,7`）だけ。
//
// ■ 新しい `2,3`＝流砂の大穴と追い手（追い手は穴を回り込まない＝向こう岸を選んで歩く）
//      0 #####..#####     ← 北の口
//      1 #..........#     ← 北の岸（追い手が来られない側）
//      2 #...xxxx...#
//      3 #..xxxxxxx.#     ← 東の岸は幅1で北の岸とつながる
//      4 ...xxxxxxx..     ← 西の口／東の口
//      5 ....xxxxx...
//      6 #....xxx...#     ← 南の縁＝追い手が足止めされる所
//      7 #.....C....#     ← 追跡者 C×1（大穴の一番深い所の真下）
//      8 #.........B#     ← 南東の隅に宝箱（条件なし・見えている）
//      9 ############
//   ・部屋の真ん中が砂の流れ落ちた歪な大穴（穴 `x` 26 枚）。床は全部砂（bgTiles 'd'）・穴には下地を置かない。
//   ・追跡者 C×1（脅威度 24.0＝看板部屋 `2,1` の 25.0 より軽い。⚠️ C は1体で 24.0＝2体は 48.0 で梯子を崩す∴1体）。
//     C はプレイヤーへまっすぐ寄るだけで、穴を回り込まない＝穴の向こう岸に立つと南の岸で足止めされる
//     （実測＝北の岸 `(1,6)` に 300 tick 立っても `(7,6)` から動かない）。
//   ・西の口（入口から来る一番ありがちな入り方）から南の岸を宝箱へ突っ切ると C に寄られる（実測＝木の剣で倒して HP 6→4）。
//     北の岸を回れば、C は西の縁に貼り付いたまま＝無傷で東の岸を下りて宝箱に届く（実測＝HP 6→6）。
//     北の口から入ってそのまま東の岸を下りると寄られる（HP 6→4）が、先に北の岸の西へ歩いて C を西へおびき寄せてから
//     東へ回れば無傷（実測）＝どの口から来ても「向こう岸でおびき寄せてから回る」が答えになる。
//   ・⚠️ 大穴が C を止めるのは「プレイヤーが向こう岸に居る間」だけ。南の岸（宝箱の前など）で留まれば C は岸を回って
//     追いつく（実測＝北の岸を回って宝箱を開け、そのまま 60 tick 留まると HP 6→2）。C の足はプレイヤーの半分＝走り続ければ
//     南の岸でも振り切れる（実測＝無傷）。∴この部屋は関門ではなく「向こう岸は安全・同じ岸は追われる」を見せる通り道。
//   ・ブーメラン（`1,1` で入手）を持って戻れば、北の岸から穴越しに真下へ投げて当てられる（実測＝西の口から北の岸の西寄りへ
//     上がると C は南の縁 `(6,3)`〜`(6,4)` へ上がってくる＝列を揃えて4投・無傷）。⚠️ C が一番深い所の真下 `(7,6)` に居る間は
//     北の岸から 6 段＝届かない（↓5）＝西寄りか東寄りへ動いて縁へ上がらせてから投げる。
//   ・入口の隣＝ブーメランより先に来られる（初めての来訪は剣と木の盾・ハート3）。宝箱の中身＝ルピー×30（キュー45〈2026-10-11〉で据え置き＝C 段）。
//   ・D2 の他の部屋と型を分けた＝`1,0` は東西いっぱいの裂け目と一本橋（石を盾で受ける）・`0,2` は穴の中の小島の回収・
//     `1,3` は穴の隅の篝火。ここは「敵が渡れない穴を盾にする」＝穴が守るのはプレイヤーの側。
//   ・⚠️ D5 `2,2`（凍れる湖の一周道）と形が近くならないよう、穴は輪でなく歪な形にした（岸の幅も場所で違う）。
//   ・⚠️ 最初に推奨した「砂穴の幻術師」（術士 η が穴の向こうの小島に出る）は D7 `2,4`（空の術士の浮島）と同じ機構だった＝取り下げた。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（3つの口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-2-3-sinkhole-chasers.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-2-3-sinkhole-chasers.mjs         # 書き込み

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
const ROOM  = '2,3';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'............',
	'.......E....',
	'#....C.....#',
	'#..........#',
	'#..........#',
	'############',
];
const ORIGINAL_BG = { '1,5': TILE.SAND, '1,7': TILE.SAND };   // 旧盤面の砂の名残

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#..........#',
	'#...xxxx...#',
	'#..xxxxxxx.#',
	'...xxxxxxx..',
	'....xxxxx...',
	'#....xxx...#',
	'#.....C....#',
	'#.........B#',
	'############',
];
export const EXITS = { north: ['0,5', '0,6'], west: ['4,0', '5,0'], east: ['4,11', '5,11'] };
export const CHASERS = ['7,6'];             // 追跡者 C×1（1体で脅威度 24.0）
export const ENTRY = '4,0';                  // 西の口（入口 `1,3` から入った最初のセル）
export const NORTH_BANK_ROW = 1;             // 北の岸の行（追い手の来られない側）
export const SOUTH_LIP = ['6,4', '6,8'];     // 南の縁＝真上が穴の岸のセル（北の岸の西寄り・東寄りに立つと C はここへ上がって止まる）
export const CHEST = '8,10';
export const CHEST_CONTENT = { type: 'rupee', value: 30, name: 'ルピー×30' };   // キュー45（2026-10-11）で据え置き＝C 段（L12 以下・敵全滅の封印）
export const BOOMERANG_DOWN = 5;             // 木のブーメランの届き（↓→5・↑←4＝DECISIONS 2026-09-26（2））

// 下地＝穴と壁を除く床は全部砂 'd'（宝箱のセルも床）。盤面から導く。
export function targetBg(t = TARGET) {
	const bg = {};
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (BLOCKED.has(t[r][c]) && t[r][c] !== TILE.CHEST) continue;
		bg[`${r},${c}`] = TILE.SAND;
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
// 穴のセル（盤面から引く）。
export function pitsOf(t) {
	const out = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (t[r][c] === TILE.PIT) out.push(`${r},${c}`);
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

	// 事前条件＝盤面の外の中身が無い（宝箱と下地は、書き換え前の物かこのスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs', 'showConditions'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	{
		const cur = room.chestContents ?? {};
		if (Object.keys(cur).length && JSON.stringify(cur) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) die(`${ROOM} の chestContents が想定外の中身`);
		const bg = JSON.stringify(room.bgTiles ?? {});
		if (bg !== JSON.stringify(ORIGINAL_BG) && bg !== JSON.stringify(targetBg()) && bg !== '{}') die(`${ROOM} の bgTiles が想定外の中身`);
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
	room.bgTiles = { ...ORIGINAL_BG };
	const base = runs();
	room.tiles = applied.tiles;
	room.bgTiles = applied.bgTiles;

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
		log.push(`  ${ROOM}: 下地＝床を全部砂にした（穴には置かない・旧盤面の砂の名残2枚は吸収）`);
	}
	if (JSON.stringify(room.chestContents ?? {}) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
		room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
		log.push(`  ${ROOM}: 宝箱 ${CHEST} = ${CHEST_CONTENT.name}`);
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
		const was = edge.filter((k) => { const [r, c] = P(k); return !HARD_BLOCKED.has(ORIGINAL[r][c]); }).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは北・西・東の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want) && JSON.stringify(was) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		check(`敵は追跡者 C×1 だけ・${CHASERS.join(' ')}（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies) === JSON.stringify(CHASERS) && CHASERS.every((k) => at(k) === TILE.CHASER));
		const m = ENEMY_META[TILE.CHASER];
		check(`C は陸を歩く（飛ばない＝穴を越えない）・ボスでない・弱点の道具を持たない`, !m.move && !m.isBoss && !m.weakness);
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝看板部屋 2,1 の 25.0 より軽い`, threat > 0 && threat < 25);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`宝箱 ${CHEST} は ${CHEST_CONTENT.name}・条件なし（初めから見えている）・宝箱はこれ1つ`,
		at(CHEST) === TILE.CHEST && cellsOf((ch) => ch === TILE.CHEST).length === 1
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& Object.keys(room.showConditions ?? {}).length === 0);
	check(`看板・床の物・穴のほかの仕掛けが無い`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0)
		&& cellsOf((ch) => [TILE.SIGN, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.DOOR, TILE.KEY, TILE.TORCH,
			TILE.BREAKABLE_WALL, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE, TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION].includes(ch)).length === 0);
	{
		const bg = room.bgTiles ?? {};
		const floors = cellsOf((ch) => !BLOCKED.has(ch) || ch === TILE.CHEST);
		check(`下地＝床は全部砂（${floors.length} マス）・穴と壁には置かない`,
			Object.keys(bg).length === floors.length && floors.every((k) => bg[k] === TILE.SAND));
	}

	// ── ② 大穴の幾何 ──────────────────────────────────────────────
	{
		const foot = reach(t);
		const floors = cellsOf((ch) => !BLOCKED.has(ch));
		check(`床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => foot.has(k)));
		check(`3つの口・追い手・宝箱の隣に歩いて届く`,
			[...Object.values(EXITS).flat(), ...CHASERS, '8,9', '7,10'].every((k) => foot.has(k)));
		const pits = pitsOf(t);
		// 穴は1つのかたまり（4近傍でつながる）で、外周の壁に接しない＝4つの岸が穴を一周する。
		const blob = new Set([pits[0]]); const q = [pits[0]];
		while (q.length) {
			const [r, c] = P(q.shift());
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nk = `${r + dr},${c + dc}`;
				if (pits.includes(nk) && !blob.has(nk)) { blob.add(nk); q.push(nk); }
			}
		}
		const touchesWall = pits.some((k) => { const [r, c] = P(k); return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => at(`${r + dr},${c + dc}`) === TILE.WALL); });
		check(`穴は ${pits.length} 枚の1つのかたまりで、外周の壁に接しない（岸が一周する）`,
			pits.length === 26 && blob.size === pits.length && !touchesWall);
		// 輪でない＝穴の行ごとの幅がそろっていない（D5 2,2 の湖の一周道と絵を分ける）。
		const widths = [...new Set(pits.map((k) => P(k)[0]))].map((r) => pits.filter((k) => P(k)[0] === r).length);
		check(`穴は歪な形（行ごとの幅 ${widths.join('/')} が3通り以上）`, new Set(widths).size >= 3);
		// 北の岸と南の岸の間は穴＝南の縁の追い手から北の岸へ真っすぐは行けない。
		const lipBlocked = SOUTH_LIP.every((k) => {
			const [r, c] = P(k);
			if (at(k) !== TILE.FLOOR || at(`${r - 1},${c}`) !== TILE.PIT) return false;
			for (let rr = r - 1; rr > NORTH_BANK_ROW; rr--) if (BLOCKED.has(t[rr][c]) && t[rr][c] !== TILE.PIT) return false;
			return true;
		});
		check(`南の縁 ${SOUTH_LIP.join(' ')} は床で、真上（北の岸まで）は穴と床だけ＝追い手は真上へ進めない`, lipBlocked);
		// ブーメランの届き：北の岸（またはその下の岸）から真下へ投げて南の縁に届く。
		const snipe = SOUTH_LIP.every((k) => {
			const [r, c] = P(k);
			for (let rr = NORTH_BANK_ROW; rr < r; rr++) if (t[rr][c] === TILE.FLOOR && r - rr <= BOOMERANG_DOWN) return true;
			return false;
		});
		check(`南の縁の追い手には、上の岸から真下へ投げてブーメランが届く（↓${BOOMERANG_DOWN} の内側）`, snipe);
		// 北の岸から南の岸へは、穴の西か東の岸を回るしかない（西の岸と東の岸を塞ぐと南へ届かない）。
		const westBank = ['3,1', '3,2', '4,1', '4,2'];
		const eastBank = ['3,10', '2,10', '2,9', '2,8'];
		check(`対照＝西の岸と東の岸の首を塞ぐと北の岸から南の岸へ届かない`,
			!reach(t, '1,6', new Set([...westBank, ...eastBank, '4,0', '5,0', '4,11', '5,11'])).has('7,6')
			&& reach(t, '1,6').has('7,6'));
		// 入った瞬間に囲まれない＝西の口から一番近い追い手まで 6 歩以上。
		const near = Math.min(...CHASERS.map((k) => steps(t, ENTRY, k)));
		check(`西の口から一番近い追い手まで ${near} 歩（≥ 6）`, near >= 6);
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
	console.log(`# ${LAYER} ${ROOM}：入口の東の通り道を「流砂の大穴と追い手」に作り替える（キュー41 第3陣）`);
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
