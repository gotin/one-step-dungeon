// dungeon_4 `4,3`（`3,3` 溶岩越しの灯火の東の行き止まり）：素の部屋を「火口湖の甲羅島」に作り替える
// （2026-10-24 / PLAN 実行キュー 92 の4室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 ......r....#     ← 西の口だけが開いた行き止まり
//      9 ############
//   真ん中にルピー×5 が1つ落ちているだけ・敵なし。
//
// ■ 新しい `4,3`＝火口湖の甲羅島
//      0 ############
//      1 #6..lllllξφ#     ← 島（北東の角・2×2）に火吐き亀 φ と蝙蝠 ξ×3
//      2 #...lllllξξ#
//      3 #...lllllll#
//      4 ....lllllll#     ← 西の口
//      5 ....ll#llll#     ← 湖の岩 (5,6)（飾り・射る線の外）
//      6 #....llllll#
//      7 #.....lllll#     ← 南西の岸は斜めに削る（射る線＝行1-2・列9-10 には触れない）
//      8 #.........B#     ← 宝箱 B(8,10)＝ルピー×50（killAll で出る）
//      9 ############
//   北東を溶岩の湖にし、角の 2×2 だけを岩の島に残す。岸は西の3〜5列と南の1行。
//   ・島へは歩いて渡れない（溶岩・はしごは溶岩を渡れない）＝剣は亀に届かない。
//   ・**島は木のブーメランの届く距離の外**＝岸から島のどのマスまでも、縦横に並ぶ線で 6 マス
//     （木の maxRange 3＋実到達の上乗せ約 1.5＝実効 4.5 マス。PLAN 4939 の実測）。
//     ∴答えは**弓**。亀は甲羅に籠もる間（1.4 秒）は矢も弾く＝**口を開けた瞬間（1.0 秒）に射る**。
//     矢 5−def1＝4 ダメージ×4 本で hp 15 が尽きる。射る座は西の岸の行1-2（東向き）と、
//     南の岸の列9-10（北向き）。
//   ・亀の炎（正面2マス）は溶岩で止まる（`breatheFire` は通れないセルで止まる）＝岸は焼かれない。
//     脅威は島から湖を越えて飛んでくる蝙蝠 ξ×3（溶岩の上を飛べる）＝甲羅の窓を待つ間にさばく。
//   ・D4 のボス 炎のサラマンドラ A は弱点＝矢（×2）・射線を保って炎を吐く（`laneStalk`）＝
//     「炎を吐く相手へ、届かない距離から矢を射る」の予習。D4 の部屋で弓が答えになるのはここが初。
//   ・全滅（`killAll`）で宝箱が南東の角に出る。床の矢束（×5・北西の角）＝矢を切らして来ても
//     ここで足りる（4 本で倒せる・1 本は外してよい）＋「ここで矢を使う」の目印。
//   ・ロウソク無しで解ける（`3,3` 経由でロウソクより先に来られる行き止まり）。
//   ・D4 の他の部屋と型を分けた＝`0,3` 怨念の封じ祠（もや・亀は外を巡回）／`3,2` 溶岩の十字路と
//     地図の袋小路（追ってくる亀＝剣で側面を取るかスルー）／`3,1` 呪い火の炉（置き炎）／`3,3` 溶岩越しの
//     灯火（ロウソク＋ブーメランで火を運ぶ）。亀はここで3度目＝**見る（0,3）→間合いを読む（3,2）→
//     届かない所から仕留める（ここ）**の三段。
//   ・既存の「撃って越える」部屋と型を重ねない＝D1 `3,2`「堀の見張り台」（撃ってくる F を回り込んで
//     倒す）／D7 `2,2`・`0,3`・`4,4`（空の向こうの座を射る＝動かない的）。ここの的は**時間で開閉する**。
//     field `11,0`「外輪の隘路」（溶岩の橋の先で φ が宝箱に居座る＝歩いて渡って斬る）とも違う＝橋は無い。
//
// ■ 例外（後から手に入る道具で楽になる手）
//   ・銀のブーメラン（深洋の最奥 `12,19`＝はしごの後）は実効 7.5 マス＝島へ届く。D4 の一周目には無い。
//   ・翼の羽衣（最終盤）は溶岩の上を飛べる＝島の隣へ飛んで剣で斬れる。全ダンジョン後の道具。
//
// ■ 撤去したもの
//   床のルピー×5（旧 (4,6) の r と floorItems）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝箱1つ＝ルピー×50・killAll／床の矢束×5／links・signData が空／外周の口の形が不変
//   ・西の口から宝箱・矢束へ届く・床の取り残しなし・島へは届かない・島の隣は溶岩か壁だけ
//   ・岸から島へ縦横に並ぶ線は全部 6 マス以上（木のブーメランの実効 4.5 マスの外）・射る線が少なくとも
//     1本ずつ西と南にある・線の途中に壁が無い／対照＝西の岸を1列広げると届く距離になる
//   ・亀の炎（正面2マス）が岸に届かない
//   ・敵は島の上だけ（φ×1・ξ×3）・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-4-3-crater-shell-isle.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-4-3-crater-shell-isle.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_4';
export const ROOM  = '4,3';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#6..lllllξφ#',
	'#...lllllξξ#',
	'#...lllllll#',
	'....lllllll#',
	'....ll#llll#',
	'#....llllll#',
	'#.....lllll#',
	'#.........B#',
	'############',
];
export const ISLE = ['1,9', '1,10', '2,9', '2,10'];
export const TURTLE = '1,10';
export const BATS = ['1,9', '2,9', '2,10'];
export const CHEST_CELL = '8,10';
export const ARROWS_CELL = '1,1';
export const ARROWS_COUNT = 5;
export const OPENING = ['4,0', '5,0'];
// 木のブーメランの実効の届き＝maxRange＋約1.5（発射位置 +0.5＋折り返しの判定が移動前の距離。
// PLAN 4939「ブーメランの実到達距離は maxRange より約1.5セル長い」）。
export const WOOD_REACH = BOOMERANG_TIERS[0].maxRange + 1.5;
export const MIN_SHOT = 6;   // 岸から島までの縦横の最短（WOOD_REACH の外・1マスの余裕つき）

// 部屋の中だけの歩行（4近傍）。敵のセルは床とみなす・床のアイテムも踏める。
export function reach(grid, starts) {
	const seen = new Set();
	const q = [];
	const ok = (r, c) => {
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		const ch = grid[r][c];
		if (ENEMY_META[ch]) return true;
		return !HARD_BLOCKED.has(ch);
	};
	for (const k of starts) {
		const [r, c] = k.split(',').map(Number);
		if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); }
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}

// 岸（bank＝歩いて立てるマスの集合）から島のマスへ、縦横に並んで間に壁の無い線（矢・ブーメランの線）。
// 戻り値＝[{ from, to, dist }]。投擲物は溶岩の上を飛ぶ＝止めるのは壁（と部屋の外）だけ。
export function shotLines(grid, bank) {
	const out = [];
	for (const to of ISLE) {
		const [r0, c0] = to.split(',').map(Number);
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			for (let r = r0 + dr, c = c0 + dc, d = 1; r >= 0 && c >= 0 && r < ROWS && c < COLS; r += dr, c += dc, d++) {
				if (grid[r][c] === TILE.WALL) break;
				const k = `${r},${c}`;
				if (bank.has(k)) out.push({ from: k, to, dist: d });
			}
		}
	}
	return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2) の着地セル
	const layerRun = () => bfsLayer(stages, START, { withLadder: true, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = { [CHEST_CELL]: { type: 'rupee', value: 50, name: 'ルピー×50' } };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
	room.floorItems = { [ARROWS_CELL]: { count: ARROWS_COUNT } };
	room.showConditions = { [CHEST_CELL]: { trigger: 'killAll' } };
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱は ${CHEST_CELL} の1つだけ＝ルピー×50`, flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST_CELL) === TILE.CHEST
		&& room.chestContents[CHEST_CELL]?.type === 'rupee' && room.chestContents[CHEST_CELL]?.value === 50);
	check(`宝箱は全滅（killAll）で出る`, room.showConditions[CHEST_CELL]?.trigger === 'killAll' && Object.keys(room.showConditions).length === 1);
	check(`床の矢束は ${ARROWS_CELL} の1つだけ（×${ARROWS_COUNT}）`, flat.filter((ch) => ch === TILE.ITEM_ARROWS).length === 1
		&& at(ARROWS_CELL) === TILE.ITEM_ARROWS && room.floorItems[ARROWS_CELL]?.count === ARROWS_COUNT);
	check(`旧ルピー r は残っていない・signData が空`, !flat.includes(TILE.ITEM_RUPEE) && !Object.keys(room.signData ?? {}).length);

	// ── ② 歩行：岸と島 ─────────────────────────────────────────────────
	const walk = reach(t, OPENING);
	check(`宝箱 ${CHEST_CELL} に歩いて届く`, walk.has(CHEST_CELL));
	check(`矢束 ${ARROWS_CELL} に歩いて届く`, walk.has(ARROWS_CELL));
	check(`島（${ISLE.join(' ')}）へは歩いて届かない`, ISLE.every((k) => !walk.has(k)));
	const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
	{
		const fence = new Set();
		for (const k of ISLE) for (const n of nbrs(k)) if (!ISLE.includes(n)) fence.add(at(n));
		check(`島の隣は溶岩と壁だけ（実測 ${[...fence].sort().join('')}）`, [...fence].sort().join('') === [TILE.WALL, TILE.LAVA].sort().join(''));
	}
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!HARD_BLOCKED.has(t[r][c]) && !ISLE.includes(`${r},${c}`)) floors.push(`${r},${c}`);
	const stranded = floors.filter((k) => !walk.has(k));
	check(`島の外の床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

	// ── ③ 射る線：弓は届き、木のブーメランは届かない ─────────────────────
	{
		const lines = shotLines(t, walk);
		const min = Math.min(...lines.map((l) => l.dist));
		check(`岸から島へ縦横に並ぶ線がある（${lines.length} 本）`, lines.length > 0);
		check(`西の岸から東向きに射る線がある`, lines.some((l) => l.from.split(',')[1] < l.to.split(',')[1]));
		check(`南の岸から北向きに射る線がある`, lines.some((l) => l.from.split(',')[0] > l.to.split(',')[0]));
		check(`岸から島までの最短は ${min} マス（${MIN_SHOT} 以上＝木のブーメランの実効 ${WOOD_REACH} マスの外）`, min >= MIN_SHOT && min > WOOD_REACH);
		check(`亀の居場所 ${TURTLE} にも射る線がある`, lines.some((l) => l.to === TURTLE));
		// 対照＝西の岸を1列（列4）広げると、届く距離（5 マス）の線ができる＝測定が空虚でない
		const wide = t.map((row, r) => row.map((x, c) => (c === 4 && r >= 1 && r <= 8 ? TILE.FLOOR : x)));
		const wideMin = Math.min(...shotLines(wide, reach(wide, OPENING)).map((l) => l.dist));
		check(`対照：西の岸を1列広げると最短が ${wideMin} マスに縮む（${MIN_SHOT} 未満）`, wideMin < MIN_SHOT);
	}
	{
		// 亀の炎は正面 breathCells マス・通れないセルで止まる（enemy-ai.js breatheFire）。
		// 島のどこで口を開けても、岸のマスに届かない。
		const cells = ENEMY_META[TILE.FIRE_TURTLE].shell?.breathCells ?? 2;
		const burnt = [];
		for (const k of ISLE) {
			const [r0, c0] = k.split(',').map(Number);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				for (let i = 1; i <= cells; i++) {
					const r = r0 + dr * i, c = c0 + dc * i;
					if (r < 0 || c < 0 || r >= ROWS || c >= COLS || HARD_BLOCKED.has(t[r][c])) break;
					if (walk.has(`${r},${c}`)) burnt.push(`${k}→${r},${c}`);
				}
			}
		}
		check(`亀の炎（正面 ${cells} マス）が岸に届かない（実測 ${burnt.join(' ') || 'なし'}）`, burnt.length === 0);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		const want = [...ISLE].map((k) => `${k === TURTLE ? TILE.FIRE_TURTLE : TILE.BAT_SWARM}@${k}`).sort().join();
		check(`敵は島の上の φ×1・ξ×3 だけ（実測 ${mobs.join(' ')}）`, [...mobs].sort().join() === want);
		check(`亀は歩く（move 無し＝溶岩を越えない）`, !ENEMY_META[TILE.FIRE_TURTLE].move);
		check(`蝙蝠は飛ぶ（move:'air'＝湖を越えて岸へ来る）`, ENEMY_META[TILE.BAT_SWARM].move === 'air');
		check(`亀は甲羅に籠もる（shell）＝開いた瞬間だけ矢が効く`, !!ENEMY_META[TILE.FIRE_TURTLE].shell);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（φ 30＋ξ 3体 6＝36.0）が D4 の看板部屋 2,3（${sig}）より軽い`, threat === 36 && threat < sig);
	}

	// ── ⑤ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`,
			same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(open.reachedRooms, baseOpen.reachedRooms));
		check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「火口湖の甲羅島」に作り替える（キュー92 の4室目）`);
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

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
