// dungeon_3 `4,2`（`3,2`〈地図〉の東・`4,1` の南＝2つの口の通り道・床の回復薬（小））：
// 素の部屋を「堤の術士」に作り替える
// （2026-11-03 / PLAN 実行キュー 94 の3室目・設計は Opus）
//
// ■ 何が薄かったか（キュー94 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 #####..#####     ← 北の口（列5-6）＝`4,1` へ
//      4 ...........#     ← 西の口（行4-5）＝`3,2` へ
//      6 #.....7....#     ← 床の回復薬（小）'7'(6,6)・敵なし
//      9 ############
//
// ■ 新しい `4,2`＝堤の術士（'~'＝bgTiles の水。tiles 層では床）
//      0 #####..#####
//      1 #~~~~...η.~#     ← 北の堤 (1,5)〜(1,9)・術士 η(1,8)＝西の口からは射線が通らない／北の口
//      2 #~~~~~~~~.~#     ← 東の堤 (1,9)〜(5,9)
//      3 #~~~~~~~~E~#     ← パトロール E(3,9)＝いつも追う
//      4 ...~~~~~~.~#     ← 西の口の船着き (4,0)〜(5,2)
//      5 ..........~#     ← 南の堤 (5,3)〜(5,9)
//      6 #~~~.~~~~~~#     ← 薬の突堤 (6,4)〜(8,4)
//      7 #~~~.~~~~~~#
//      8 #~~~7~~~~~~#     ← 回復薬（小）'7'(8,4)＝突堤の先
//      9 ############
//   ・**主題＝逃げ場の無い堤で術士と向き合う。** 部屋は水に沈み、西の口から北の口へ幅1の堤だけが
//     残った（南の堤 → 東の堤 → 北の堤のコの字・16 マス）。堤の途中から南へ短い突堤が出て、その先に回復薬。
//   ・術士 η の出現先は「勇者から縦横ちょうど3マスの、敵が立てる床」（game/enemy-ai.js `pickBlinkCell`）。
//     この盤面では**縦横3マス先の床はいつも同じ堤の上**（腕どうしは4マス以上離した＝水越しの腕には出ない）
//     ＝術士は勇者の前か後ろ、**同じ一本道の上**に出る。幅1の堤では横へ避けられない（両脇は水）＝
//     魔弾は盾で受けるか、出た瞬間に射抜く（弱点は矢×2）か、詰め寄って斬るか。前に出れば道を塞ぐ
//     （敵とは重なれない）、後ろに出れば背中を撃たれる＝振り向く。
//   ・パトロール E は東の堤からいつも追ってくる（enemyChase）＝南の堤の東の端で勇者の前に立ちはだかり、
//     その間に術士が後ろへ出る＝**前の E と後ろの術士に挟まれる。盾は片方にしか向けられない。**
//     実測（`.scratch/q94/probe-4-2.mjs`・勇者ハート6）＝剣も弓も使わず歩くだけだと E に塞がれたまま背中を
//     撃たれ続けて倒れる（113 tick）。E を斬って進めば半ハート1回、出た術士を射抜けば半ハート1回で北の口へ。
//   ・術士の初めの位置 (1,8) は西の口から射線が通らない＝入った瞬間に射抜いて終わり、にはならない。
//   ・突堤の (6,4)(7,4) は縦横3マス先がすべて水か壁＝術士はそこへ出られず、最後に居た所に出直す
//     （水越しに撃ってくる＝突堤の上でも気は抜けない）。薬は突堤の先 (8,4)＝取ったら堤へ引き返す。
//   ・ブーメランは堤の上の術士・E を止められる（止めた間に詰める）。弓が無くても剣と盾で通れる
//     （入口から 3 室目＝弓の前に来られる）。
//   ・脅威度 22.0（η 18.0 ＋ E 4.0）＝看板部屋 `1,3`（η×2＝36.0）より軽い。
//   ・型を重ねない相手＝D7 `2,4`「空の術士の浮島」（術士が**歩いて行けない浮島**に出る＝立ち位置で出る所を選ぶ）。
//     ここは逆＝術士は**必ず勇者の歩く道の上**に出る（水越しの腕が無い）。D7 `3,4`「空の盾騎士の細橋」
//     （盾騎士の背後へ回る）・D4 `4,1`「溶岩の川向こうの薬棚」（ブーメランで薬を持ち帰る）とも別の答え。
//
// ■ 撤去／移したもの
//   床の回復薬 (6,6) → 突堤の先 (8,4)（同じ回復薬（小））。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水は bgTiles だけ／回復薬は突堤の先の1つ／余計な仕掛けなし
//   ・西の口から北の口へ・薬へ歩いて届く／堤は幅1（両脇は水）
//   ・どの床に立っても、術士の出現先（縦横3マス先の床）は勇者との間が全部床＝同じ一本道の上
//   ・突堤の (6,4)(7,4) には出現先が無い／堤のどこかには出現先がある
//   ・敵は η×1・E×1 だけ・どちらも堤の上・E はいつも追う／術士の初めの位置は西の口から射線が通らない
//   ・脅威度 22.0 が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d3-4-2-causeway-sorcerer.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d3-4-2-causeway-sorcerer.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_3';
export const ROOM  = '4,2';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'#####..#####',
	'#~~~~...η.~#',
	'#~~~~~~~~.~#',
	'#~~~~~~~~E~#',
	'...~~~~~~.~#',
	'..........~#',
	'#~~~.~~~~~~#',
	'#~~~.~~~~~~#',
	'#~~~7~~~~~~#',
	'############',
];
export const SORCERER = '1,8';
export const PATROL = '3,9';
export const POTION = '8,4';
export const SPUR = ['6,4', '7,4', '8,4'];
export const BLINK_RANGE = ENEMY_META[TILE.SORCERER].blink.range;   // 3
export const OPENING = { west: '4,0', north: '0,5' };

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER) bg[key(r, c)] = TILE.WATER; }));
	return bg;
}

const standable = (grid, r, c) => {
	if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
	const ch = grid[r][c];
	if (ENEMY_META[ch]) return true;
	if (ch === TILE.WATER) return false;
	return !HARD_BLOCKED.has(ch);
};

// 歩ける所（水と固い物は通れない）
export function walk(grid, starts) {
	const seen = new Set();
	const q = [];
	for (const k of starts) { const [r, c] = parse(k); if (standable(grid, r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); } }
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (!seen.has(k) && standable(grid, nr, nc)) { seen.add(k); q.push([nr, nc]); }
		}
	}
	return seen;
}

// 勇者が (r,c) に立ったときの術士の出現先（pickBlinkCell と同じ＝縦横ちょうど BLINK_RANGE マス先の床）
export function blinkCells(grid, r, c) {
	const out = [];
	for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
		const nr = r + dr * BLINK_RANGE, nc = c + dc * BLINK_RANGE;
		if (standable(grid, nr, nc)) out.push({ cell: key(nr, nc), dr, dc });
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

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口 '>'(7,2)
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=', '(', ')']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#]/g, '.') === ringOf(TARGET).replace(/[^#]/g, '.'));
	room.tiles = tilesOf();
	room.bgTiles = bgOf();
	room.chestContents = {};
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = {};
	room.links = [];
	room.enemyDirs = {};
	room.enemyChase = { [PATROL]: true };   // さまよわずに最初から追う＝堤の上で必ず勇者の前に立ちはだかる
	delete room.enemyHold;
	delete room.enemiesRespawn;
	delete room.fluteEffect;
	delete room.tideCycle;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		check(`bgTiles＝水 ${water.length} 枚だけ（ほかの値なし）`, water.length === Object.keys(bg).length && water.length > 0);
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
	}
	check(`回復薬（小）は突堤の先 ${POTION} の1つだけ`,
		flat.filter((ch) => ch === TILE.ITEM_HEAL_POTION).length === 1 && at(POTION) === TILE.ITEM_HEAL_POTION && SPUR.at(-1) === POTION);
	check(`宝箱・石・立札・ボタン・鐘・門・潮ゲート・ほかの拾い物・出現条件・潮の周期が無い`,
		![TILE.CHEST, TILE.STONE, TILE.SIGN, TILE.BUTTON, TILE.SWITCH, TILE.GATE, TILE.TIDE_GATE, TILE.RUPEE, TILE.RUPEE_LARGE,
			TILE.ITEM_ARROWS, TILE.ITEM_BIG_HEAL_POTION].some((ch) => flat.includes(ch))
		&& !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !room.tideCycle && !room.links.length);

	// ── ② 歩行：堤は幅1の一本道 ──────────────────────────────────────────
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (standable(grid, r, c)) floors.push(key(r, c));
	const reach = walk(grid, [OPENING.west]);
	{
		check(`西の口から北の口へ歩いて届く`, reach.has(OPENING.north));
		check(`西の口から薬へ歩いて届く`, reach.has(POTION));
		const stranded = floors.filter((k) => !reach.has(k));
		check(`床が全部つながっている（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		// 船着き（西の口の 2×3）と北の口の 2 マス以外は、床の隣が 2 枚以下＝幅1（分かれ道は突堤の根元 (5,4) だけ）
		const landing = new Set(['4,0', '4,1', '4,2', '5,0', '5,1', '5,2', '0,5', '0,6', '1,5', '1,6']);
		const wide = [];
		const forks = [];
		for (const k of floors) {
			if (landing.has(k)) continue;
			const [r, c] = parse(k);
			const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => standable(grid, r + dr, c + dc)).length;
			if (n >= 3) forks.push(k);
			// 2×2 の床の塊があれば幅1でない
			if (standable(grid, r + 1, c) && standable(grid, r, c + 1) && standable(grid, r + 1, c + 1)) wide.push(k);
		}
		check(`堤は幅1（2×2 の床の塊なし・実測 ${wide.join(' ') || 'なし'}）`, wide.length === 0);
		check(`堤の分かれ道は突堤の根元 5,4 だけ（実測 ${forks.join(' ') || 'なし'}）`, forks.join() === '5,4');
	}

	// ── ③ 術士の出現先：いつも勇者と同じ一本道の上 ─────────────────────────
	{
		const across = [];
		let some = 0;
		for (const k of floors) {
			const [r, c] = parse(k);
			for (const { cell, dr, dc } of blinkCells(grid, r, c)) {
				some++;
				// 勇者と出現先の間（2マス）が全部床＝同じ道の上（水越しではない）
				let line = true;
				for (let i = 1; i < BLINK_RANGE; i++) if (!standable(grid, r + dr * i, c + dc * i)) line = false;
				if (!line) across.push(`${k}→${cell}`);
			}
		}
		check(`どの床に立っても、術士の出現先は勇者との間が全部床（水越しの出現 ${across.join(' ') || 'なし'}）`, across.length === 0 && some > 0);
		const noDest = SPUR.slice(0, 2).filter((k) => { const [r, c] = parse(k); return blinkCells(grid, r, c).length === 0; });
		check(`突堤の 6,4・7,4 には出現先が無い（＝術士は最後に居た所に出直す）`, noDest.length === 2);
		const stand = ['5,6', '3,9', '1,8'].map((k) => { const [r, c] = parse(k); return blinkCells(grid, r, c).length; });
		check(`堤の上には出現先がある（5,6／3,9／1,8 で ${stand.join('／')} か所）`, stand[0] > 0 && stand[2] > 0);
		// 対照：腕どうしを近づける（北の堤を行2へ下げる）と水越しの出現が生まれる＝この検査に歯がある
		const near = TARGET.map((row) => [...row]);
		for (let c = 5; c <= 9; c++) { near[1][c] = TILE.WATER; near[2][c] = TILE.FLOOR; }
		near[1][5] = TILE.FLOOR; near[1][6] = TILE.FLOOR;
		let nearAcross = 0;
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			if (!standable(near, r, c)) continue;
			for (const { dr, dc } of blinkCells(near, r, c)) {
				for (let i = 1; i < BLINK_RANGE; i++) if (!standable(near, r + dr * i, c + dc * i)) { nearAcross++; break; }
			}
		}
		check(`対照：北の堤を行2へ寄せると水越しの出現が ${nearAcross} 件生まれる（0 でない）`, nearAcross > 0);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は術士 η×1（${SORCERER}）とパトロール E×1（${PATROL}）だけ（実測 ${mobs.join(' ')}）`,
			mobs.sort().join() === [`${TILE.PATROL}@${PATROL}`, `${TILE.SORCERER}@${SORCERER}`].sort().join());
		check(`E はいつも追う（enemyChase）＝堤の上で勇者の前に立ちはだかる`,
			JSON.stringify(room.enemyChase) === JSON.stringify({ [PATROL]: true }));
		{
			// 西の口の船着き（2×3）のどこからも、術士の初めの位置へ縦横の床の一直線が無い
			const [sr, sc] = parse(SORCERER);
			const landing = ['4,0', '4,1', '4,2', '5,0', '5,1', '5,2'];
			const sees = landing.filter((k) => {
				const [r, c] = parse(k);
				if (r !== sr && c !== sc) return false;
				const dr = Math.sign(sr - r), dc = Math.sign(sc - c);
				for (let y = r + dr, x = c + dc; y !== sr || x !== sc; y += dr, x += dc) if (grid[y][x] === TILE.WALL) return false;
				return true;
			});
			check(`術士の初めの位置 ${SORCERER} は西の口の船着きから縦横の射線が通らない（実測 ${sees.join(' ') || 'なし'}）`, sees.length === 0);
		}
		check(`術士の弱点は矢・歩かない（瞬間移動だけ）`,
			ENEMY_META[TILE.SORCERER].weakness?.type === 'arrow' && ENEMY_META[TILE.SORCERER].speed === 0 && BLINK_RANGE === 3);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['1,3'], ENEMY_META);
		check(`脅威度 ${threat}（η 18.0 ＋ E 4.0）が D3 の看板部屋 1,3（${sig}）より軽い`, threat === 22 && threat < sig);
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
		check(`${ROOM} と北の行き止まり 4,1 に到達できる`, closed.reachedRooms.has(ROOM) && closed.reachedRooms.has('4,1'));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「堤の術士」に作り替える（キュー94 の3室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・水は ~ で表示）`);
	TARGET.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === tilesOf()[i].join('') ? '=' : '→'}   ${row}`);
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
