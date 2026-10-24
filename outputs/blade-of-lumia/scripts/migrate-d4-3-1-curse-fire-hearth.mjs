// dungeon_4 `3,1`（コンパスの部屋・四方の辻）：素の部屋を「呪い火の炉」に作り替える
// （2026-10-24 / PLAN 実行キュー 92 の3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 #####..#####
//      4 .....n......     ← 東西南北の4つの口が開いた四角い広間
//      9 #####..#####
//   真ん中にコンパス n が1つ落ちているだけ・敵なし＝「通るついでに拾う」。
//
// ■ 新しい `3,1`＝呪い火の炉
//      0 #####..#####
//      1 #......#ψ.n#     ← 炉（北東の石囲い・中は 3×2）の奥にコンパス n(1,10)
//      2 #......#.ψψ#     ← 呪い火 ψ が3体、炉の中に棲む
//      3 #......#.###     ← 炉の口 (3,8)＝幅1・奥行き1
//      4 ............
//      5 ............
//      6〜8 床
//      9 #####..#####
//   ・辻の通り抜けはどの口の組でも邪魔されない（炉は北東の角にあるだけ）。
//   ・コンパスは炉の奥。炉の口は (3,8) の1マスだけ＝**呪い火は壁を越えられない**（`move:'air'`
//     は水・溶岩・空を越えるが壁は越えない）∴炉から出てくるのも、こちらが入るのも口の1マス。
//   ・呪い火は触れると剣を 3 秒封じる（sealSword）。3体が口から列になって出てくる＝剣だけで
//     迎えると、1体に触れられた時点で残りの2体を剣無しで受けることになる。
//     ∴**口の前に立って口へ炎を置く**（ロウソクの置き炎＝同時3つ・3.5 秒・呪い火は hp 3＝
//     一度踏めば燃え尽きる）のが D4 の答え。剣が封じられても炎は置ける。
//     ブーメラン・弓で口を撃つのも正解（D2 `2,0`「封じ火の墓廊」と同じ手＝D2 の復習）。
//   ・ロウソク無しでも取れる（剣で1体ずつ迎える／封じられたら走って離れる＝呪い火はプレイヤーより
//     遅い）＝コンパスは「通り道で拾う物」のまま。ロウソクは2部屋先の `1,2`（入口の北）。
//   ・D4 の他の部屋と型を分けた＝`0,3` 怨念の封じ祠（もや＝ロウソクの予告・亀は外を巡回）／
//     `3,2` 溶岩の十字路と地図の袋小路（袋小路へ追ってくる亀）／`2,3` 剣封じの十字砲火（看板＝
//     広間で骸骨と呪い火を同時に受ける）。ここは**置き炎を部屋の謎に使う最初の部屋**（キュー92 の
//     型の割り振りで「置き炎＝部屋の謎に使った所が 0」）。溶岩も亀も使わない（2室続いたため）。
//   ・既存のコンパスの部屋と型を重ねない＝D2 `3,1`「砂の方位盤」（石の謎）／D5 `3,1`「凍れる湖の
//     鬼火」／D7 `3,1`「羅針の間」（ブーメランで火を運ぶ）／D8 `3,1`「石の柵と跳躍蜘蛛」。
//     呪い火を飛び道具で落とす D2 `2,0`「封じ火の墓廊」とは、こちらが**炎を置いて待つ**側。
//
// ■ 撤去したもの
//   なし（コンパス n を (4,5) から (1,10) へ移しただけ。floorItems は元から空）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／コンパス1つ・宝箱なし／floorItems・showConditions・links・signData が空／外周の口の形が不変
//   ・4つの口どうしが全部つながる
//   ・コンパスに届く・炉の口は (3,8) だけ（隣の立てる床は (2,8) と (4,8)）・炉の囲いは壁だけ
//     （溶岩・水・空が混じると呪い火が越える）
//   ・対照＝炉の口を壁にするとコンパスに届かない（測定が空虚でない）
//   ・敵は呪い火3体だけ・全部炉の中・口の着地セルの隣に居ない・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-3-1-curse-fire-hearth.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-3-1-curse-fire-hearth.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META, ROAM_DEFAULT } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_4';
export const ROOM  = '3,1';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#......#ψψψ#',
	'#.....#...n#',
	'#.....#.####',
	'......#.###.',
	'............',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const COMPASS_CELL = '2,10';
export const HEARTH = ['1,8', '1,9', '1,10', '2,8', '2,9', '2,10'];   // 炉の中
export const FLUE = ['4,7', '3,7', '2,7'];                             // 炉口の L 字の通路（辻側→曲がり角）
export const HEARTH_MOUTH = '2,7';                                    // 曲がり角＝炉の中へ開く唯一のマス
export const FLUE_EXIT = '5,7';                                       // 炉口の通路が辻へ出るマス
export const FIRES = ['1,8', '1,9', '1,10'];
export const OPENINGS = {
	north: ['0,5', '0,6'],
	south: ['9,5', '9,6'],
	west:  ['4,0', '5,0'],
	east:  ['4,11', '5,11'],
};

// 部屋の中だけの歩行（4近傍）。敵のセルは床とみなす・床のアイテム（コンパス）も踏める。
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
	room.chestContents = {};
	room.floorItems = {};
	room.showConditions = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`コンパスは ${COMPASS_CELL} の1つだけ`, flat.filter((ch) => ch === TILE.ITEM_COMPASS).length === 1 && at(COMPASS_CELL) === TILE.ITEM_COMPASS);
	check(`宝箱は無い・chestContents が空`, !flat.includes(TILE.CHEST) && !Object.keys(room.chestContents).length);
	check(`floorItems・showConditions・signData が空`,
		!Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !Object.keys(room.signData ?? {}).length);

	// ── ② 歩行：通り抜けと炉 ───────────────────────────────────────────
	const allOpen = Object.values(OPENINGS).flat();
	for (const [name, cells] of Object.entries(OPENINGS)) {
		const r = reach(t, cells);
		const miss = allOpen.filter((k) => !r.has(k));
		check(`${name} の口から他の3つの口へ届く（届かない ${miss.join(' ') || 'なし'}）`, miss.length === 0);
	}
	const walk = reach(t, OPENINGS.west);
	check(`コンパス ${COMPASS_CELL} に歩いて届く`, walk.has(COMPASS_CELL));
	const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([a, b]) => `${a},${b}`); };
	const standable = (k) => nbrs(k).filter((n) => walk.has(n));
	check(`炉口の曲がり角 ${HEARTH_MOUTH} の隣は 2,8 と 3,7 だけ（実測 ${standable(HEARTH_MOUTH).sort().join(' ')}）`,
		JSON.stringify(standable(HEARTH_MOUTH).sort()) === JSON.stringify(['2,8', '3,7']));
	check(`炉口の通路 3,7 の隣は 2,7 と 4,7 だけ（幅1・実測 ${standable('3,7').sort().join(' ')}）`,
		JSON.stringify(standable('3,7').sort()) === JSON.stringify(['2,7', '4,7']));
	check(`炉口の通路 4,7 の隣は 3,7 と ${FLUE_EXIT} だけ（幅1・実測 ${standable('4,7').sort().join(' ')}）`,
		JSON.stringify(standable('4,7').sort()) === JSON.stringify(['3,7', FLUE_EXIT]));
	{
		// 炉と炉口の通路から外へ出る隣接は辻の FLUE_EXIT だけ／囲いは壁だけ
		// （呪い火は壁以外を越える＝溶岩・水・空が混じると漏れる）
		const inside = [...HEARTH, ...FLUE];
		const exits = new Set(), fence = new Set();
		for (const k of inside) for (const n of nbrs(k)) {
			if (inside.includes(n)) continue;
			if (walk.has(n)) exits.add(n); else fence.add(at(n));
		}
		check(`炉から辻へ出られるのは ${FLUE_EXIT} だけ（実測 ${[...exits].join(' ')}）`, [...exits].join() === FLUE_EXIT);
		check(`炉と炉口の囲いは壁だけ（実測 ${[...fence].join('')}）`, [...fence].join('') === TILE.WALL);
	}
	{
		// 呪い火は気づくまで「家から radius マスの箱」の中を、長い軸から一歩ずつ歩いてさまよう
		// （enemy-ai.js pickRoamTarget／enemyRoam）＝目的地も歩く道も箱の中。∴箱の中だけを歩いて
		// 炉の外（辻）へ出られなければ、気づかれない限り炉から漏れない（最初の叩き台は家が辻から
		// 3マス以内＝実測 10 秒ほどで辻の東へ漂い出た）。
		const rad = (ENEMY_META[TILE.CURSE_FIRE].roam ?? ROAM_DEFAULT).radius;
		const inside = new Set([...HEARTH, ...FLUE]);
		for (const home of FIRES) {
			const [hr, hc] = home.split(',').map(Number);
			const inBox = (k) => { const [r, c] = k.split(',').map(Number); return Math.abs(r - hr) <= rad && Math.abs(c - hc) <= rad; };
			const seen = new Set([home]); const q = [home]; const out = [];
			while (q.length) {
				const k = q.shift();
				for (const n of nbrs(k)) {
					if (seen.has(n) || !walk.has(n) || !inBox(n)) continue;
					seen.add(n);
					if (!inside.has(n)) out.push(n); else q.push(n);
				}
			}
			check(`呪い火 ${home} は家から ${rad} マスの箱の中を歩いて炉の外へ出られない（実測 ${out.join(' ') || 'なし'}）`, out.length === 0);
		}
	}
	{
		// 辻（炉と炉口の通路の外）から、炉の中のどのマスへも一直線に通らない＝ブーメラン・矢は
		// 辻から炉の中へ届かない（炉口の通路へ入って曲がり角に立たないと撃てない）。
		const inside = new Set([...HEARTH, ...FLUE]);
		const leaks = [];
		for (const k of HEARTH) {
			const [r0, c0] = k.split(',').map(Number);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				for (let r = r0 + dr, c = c0 + dc; r >= 0 && c >= 0 && r < ROWS && c < COLS; r += dr, c += dc) {
					if (HARD_BLOCKED.has(t[r][c])) break;
					if (!inside.has(`${r},${c}`)) { leaks.push(`${k}→${r},${c}`); break; }
				}
			}
		}
		check(`辻から炉の中へ一直線に通る線が無い（実測 ${leaks.join(' ') || 'なし'}）`, leaks.length === 0);
	}
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!HARD_BLOCKED.has(t[r][c])) floors.push(`${r},${c}`);
	const stranded = floors.filter((k) => !walk.has(k));
	check(`床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	{
		// 対照＝炉の口を壁にするとコンパスに届かない（潰すのは必ず '#'＝[[blade-control-experiment-needs-tile-wall]]）
		const g = t.map((row, r) => row.map((x, c) => (`${r},${c}` === HEARTH_MOUTH ? TILE.WALL : x)));
		check(`対照：炉の口を壁にするとコンパスに届かない`, !reach(g, OPENINGS.west).has(COMPASS_CELL));
	}

	// ── ③ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		const want = FIRES.map((k) => `${TILE.CURSE_FIRE}@${k}`).join();
		check(`敵は呪い火 ψ×3（${FIRES.join(' ')}）だけ（実測 ${mobs.join(' ')}）`, mobs.join() === want);
		check(`呪い火は全部炉の中`, FIRES.every((k) => HEARTH.includes(k)));
		check(`呪い火は飛ぶ（move:'air'）＝囲いを壁だけにした理由が今も正しい`, ENEMY_META[TILE.CURSE_FIRE].move === 'air');
		check(`呪い火は剣を封じる（inflict sealSword）`, ENEMY_META[TILE.CURSE_FIRE].inflict?.type === 'sealSword');
		check(`呪い火は口の着地セルの隣に居ない`, !allOpen.some((k) => FIRES.some((f) => f === k || nbrs(k).includes(f))));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（ψ 3体＝9.0）が D4 の看板部屋 2,3（${sig}）より軽い`, threat === 9 && threat < sig);
	}

	// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「呪い火の炉」に作り替える（キュー92 の3室目）`);
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
