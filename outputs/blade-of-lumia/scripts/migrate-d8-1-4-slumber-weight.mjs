// dungeon_8 `1,4`（`2,4` の西の行き止まり・宝箱＝回復薬（小））：
// 素の宝箱の部屋を「眠る重しの泥橋」に作り替える
// （2026-11-01 / PLAN 実行キュー 93 の8室目・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー93 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      4 #....B......     ← 宝箱 B(4,5)＝回復薬（小）が真ん中に置いてあるだけ・敵なし
//      9 ############     ← 口は東（行4-5）だけ＝D8 の南西の行き止まり
//
// ■ 新しい `1,4`＝眠る重しの泥橋（'~'＝bgTiles の水。tiles 層では床）
//      0 ############
//      1 #~~~~~~~...#
//      2 #~~~~~~~...#
//      3 #...~~~~...#     ← 西の小島（行3〜7×列1〜3・泥）
//      4 #...~~~~....     ← 東の口（行4-5）
//      5 #B..TΓS~....     ← 泥橋（行5）：門 T(5,4)・間 (5,5)＝ヒル Γ の家・ボタン S(5,6)・堀 (5,7)＝はしごで渡る
//      6 #...~~~~...#
//      7 #...~~~~...#
//      8 #~~~~~~~...#
//      9 ############
//   ・**主題＝D8 の毒沼ヒルの総仕上げ。ヒルは自分でボタンに乗って門を開ける（`3,1` の重し・`0,2` の「水を
//     渡らない」）。倒すと重しが無くなって門が閉じる。笛で眠らせると、泥に沈んでも重いまま＝ボタンは
//     押されたまま、上を歩ける（`0,1` の眠り＋キュー93 の8室目で足したエンジンの規則＝player.js
//     syncEnemyButtons が眠っている重しの敵も数える）。**
//   ・入ると、ヒル（間 (5,5)）が勇者の方へ這って泥橋の東の端＝ボタン (5,6) に乗り、門が開くのが見える
//     （東は堀＝ヒルは水を渡らないのでボタンの上で止まる）。勇者が広間のどこに居てもヒルはボタンから降りない。
//   ・答え＝広間で笛を吹く → 眠ったヒルの上へはしごで堀を渡る → 間 → 開いた門 → 小島の宝箱。
//     倒す（剣・矢・爆弾）と門が閉じる＝自分でボタンに乗っても、門はボタンから 2 マス先（間を挟む）＝
//     踏みながら門をくぐれない。入り直せばヒルは戻る（enemiesRespawn）。
//   ・帰り＝目を覚ましたヒルが勇者を追って間へ出る（ボタンは「勇者が門の奥にいる間は押したまま」＝
//     player.js closingGatesTrapsPlayer）。小島で斬るか、もう一度吹いて上を歩いて戻る。
//   ・脅威度 4.5（Γ×1・看板 `2,1` の 85.5 より軽い）。
//   ・型を重ねない相手＝D8 `0,1`「眠りヒルの泥道」（眠らせて渡る＝射る・斬るでも解ける）／`3,1`「ヒルの
//     重し」（呼んで乗せる）／`3,2`「戸口の盾騎士」（持ち場の番人を倒して通る）。ここは**倒すと通れない番人**
//     ＝`0,1` で選べた「射る・斬る」が答えにならず、眠らせる手だけが残る。
//
// ■ 撤去したもの
//   なし（宝箱 B(4,5) は小島の西の端 (5,1) へ移した・中身は回復薬（小）のまま）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と泥は bgTiles だけ／宝箱1つ（中身は回復薬（小））・ボタン1つ・門1つ／石・立札・床の拾い物が無い
//   ・広間（東の口から歩ける床）と小島・泥橋は歩いてはつながらない／泥橋へは堀 (5,7) をはしごで渡る1か所だけ
//   ・小島へは門を通るしか行けない（門を壁にすると、はしご込みでも届かない）／取り残しなし
//   ・ボタンと門の間に1マス（勇者はボタンを踏みながら門に掛からない）
//   ・ヒルの足で歩けるのは間とボタン（門が閉じている間）／ボタンの東は堀＝ヒルはボタンで止まる
//   ・敵は Γ×1・enemyChase・enemiesRespawn・fluteEffect（slumber 4000ms・Γ だけ）・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d8-1-4-slumber-weight.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d8-1-4-slumber-weight.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { startsAlert } from '../shared/enemy-alert.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-0-2-leech-paddy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_8';
export const ROOM  = '1,4';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'############',
	'#~~~~~~~...#',
	'#~~~~~~~...#',
	'#...~~~~...#',
	'#...~~~~....',
	'#B..TΓS~....',
	'#...~~~~...#',
	'#...~~~~...#',
	'#~~~~~~~...#',
	'############',
];
export const LEECH = '5,5';                       // ヒルの家＝間（ボタンと門の間）
export const BUTTON = '5,6';
export const GATE = '5,4';
export const MOAT = '5,7';                        // はしごで泥橋へ渡る唯一の水
export const SHORE = '5,8';                       // 堀の東の岸（笛を吹いて渡る立ち位置）
export const CHEST = '5,1';
export const CHEST_CONTENT = { type: 'item', item: 'healPotion', name: '回復薬（小）' };
export const FLUTE_EFFECT = { type: 'slumber', ms: 4000, enemies: [TILE.POISON_LEECH] };
export const ISLAND = [];
for (let r = 3; r <= 7; r++) for (let c = 1; c <= 3; c++) ISLAND.push(`${r},${c}`);
export const CAUSEWAY = [GATE, LEECH, BUTTON];    // 泥橋（行5・列4〜6）
export const HALL = [];                           // 広間＝東の口から歩ける床（列8〜10＋口）
for (let r = 1; r <= 8; r++) for (let c = 8; c <= 10; c++) HALL.push(`${r},${c}`);
export const OPENING = { east: '4,11' };
// 見た目だけの泥（bgTiles 'w'）＝小島の床（宝箱の下も）と泥橋（門の下も＝開いた門が迷宮の床色で浮かない）
export const MUD = [...ISLAND, ...CAUSEWAY];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

export function tilesOf(target = TARGET) { return target.map((row) => [...row].map((ch) => (ch === TILE.WATER ? TILE.FLOOR : ch))); }
export function bgOf(target = TARGET, mud = MUD) {
	const bg = {};
	target.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === TILE.WATER) bg[key(r, c)] = TILE.WATER; }));
	for (const k of mud) bg[k] = TILE.MUD;
	return bg;
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
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: true, openTiles: new Set(['T', '!', 'D', '=', '(', ')']) });
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
	room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	room.enemyChase = { [LEECH]: true };
	room.enemiesRespawn = true;
	room.fluteEffect = { ...FLUTE_EFFECT, enemies: [...FLUTE_EFFECT.enemies] };
	delete room.enemyHold;

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);   // 水を '~' で描いた図＝歩行の判定に使う
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		const mud = Object.keys(bg).filter((k) => bg[k] === TILE.MUD);
		const wantWater = TARGET.join('').split('').filter((ch) => ch === TILE.WATER).length;
		check(`bgTiles＝水 ${water.length} 枚・泥 ${mud.length} 枚（ほかの値なし）`,
			water.length + mud.length === Object.keys(bg).length && water.length === wantWater && mud.length === MUD.length);
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
	}
	check(`宝箱は小島の ${CHEST} の1つだけ・中身は回復薬（小）`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST && ISLAND.includes(CHEST)
		&& Object.keys(room.chestContents).join() === CHEST && room.chestContents[CHEST].item === 'healPotion');
	check(`ボタンは ${BUTTON}・門は ${GATE} の1つずつ（連動は refreshGates ①＝全ボタン ON で全 T が開く）`,
		flat.filter((ch) => ch === TILE.BUTTON).length === 1 && at(BUTTON) === TILE.BUTTON
		&& flat.filter((ch) => ch === TILE.GATE).length === 1 && at(GATE) === TILE.GATE);
	check(`石・立札・床の拾い物・出現条件が無い`,
		!flat.includes(TILE.STONE) && !flat.includes(TILE.SIGN)
		&& !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length);
	check(`fluteEffect＝slumber 4000ms・毒沼ヒルだけ`,
		room.fluteEffect.type === 'slumber' && room.fluteEffect.ms === 4000 && room.fluteEffect.enemies.join() === TILE.POISON_LEECH);

	// ── ② 歩行：広間・泥橋・小島のつながり ─────────────────────────────
	{
		const opens = Object.values(OPENING);
		const shut = grid.map((row) => [...row]);
		{ const [r, c] = parse(GATE); shut[r][c] = TILE.WALL; }
		const walk = reach(grid, opens);
		const hallOnly = [...walk.keys()].sort().join(' ');
		const wantHall = [...HALL, '4,11', '5,11'].sort().join(' ');
		check(`東の口から歩いて届くのは広間（列8〜10）だけ（泥橋にも小島にも歩いては届かない）`, hallOnly === wantHall);
		const lad = reach(grid, opens, { withLadder: true });
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!HARD_BLOCKED.has(grid[r][c]) && grid[r][c] !== TILE.WATER) floors.push(key(r, c));
		const stranded = floors.filter((k) => !lad.has(k));
		check(`床は全部届く（門を開けて・はしご込み）（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		// はしごで広間から渡れる先＝ボタンだけ（堀 (5,7) の1枚）
		const ladderLandings = [];
		for (const k of HALL) {
			const [r, c] = parse(k);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const wr = r + dr, wc = c + dc, fr = r + 2 * dr, fc = c + 2 * dc;
				if (grid[wr]?.[wc] !== TILE.WATER) continue;
				const ch = grid[fr]?.[fc];
				if (ch !== undefined && ch !== TILE.WATER && !HARD_BLOCKED.has(ch)) ladderLandings.push(`${k}→${key(fr, fc)}`);
			}
		}
		check(`広間からはしごで渡れるのは ${SHORE}→${BUTTON}（堀 ${MOAT}）の1か所だけ（実測 ${ladderLandings.join(' ')}）`,
			ladderLandings.join() === `${SHORE}→${BUTTON}`);
		const sealed = reach(shut, opens, { withLadder: true });
		check(`小島（${ISLAND.length} マス）へは門 ${GATE} を通るしか行けない（門を壁にすると、はしご込みでも届かない）`,
			ISLAND.every((k) => !sealed.has(k)) && ISLAND.every((k) => lad.has(k)));
		const [br, bc] = parse(BUTTON), [gr, gc] = parse(GATE);
		check(`ボタンと門の間に1マス（${LEECH}）＝ボタンを踏みながら門に掛からない`, br === gr && bc - gc === 2 && at(LEECH) === TILE.POISON_LEECH);
	}

	// ── ③ ヒルの足 ─────────────────────────────────────────────────────
	{
		const foot = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS
			&& grid[r][c] !== TILE.WATER && grid[r][c] !== TILE.GATE && !HARD_BLOCKED.has(grid[r][c]);
		const seen = new Set([LEECH]);
		const q = [parse(LEECH)];
		while (q.length) {
			const [r, c] = q.shift();
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nr = r + dr, nc = c + dc, k = key(nr, nc);
				if (foot(nr, nc) && !seen.has(k)) { seen.add(k); q.push([nr, nc]); }
			}
		}
		const region = [...seen].sort().join(' ');
		check(`門が閉じている間、ヒルの足で歩けるのは間 ${LEECH} とボタン ${BUTTON} だけ（実測 ${region}）`,
			region === [LEECH, BUTTON].sort().join(' '));
		const [br, bc] = parse(BUTTON);
		check(`ボタンの東は堀・南北も水＝ヒルはボタンで止まる（実測 北${grid[br - 1][bc]} 南${grid[br + 1][bc]} 東${grid[br][bc + 1]}）`,
			grid[br - 1][bc] === TILE.WATER && grid[br + 1][bc] === TILE.WATER && grid[br][bc + 1] === TILE.WATER);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は毒沼ヒル Γ×1（${LEECH}）（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.POISON_LEECH}@${LEECH}`);
		check(`毒沼ヒルはボタンを押せる（ENEMY_META.pressesButtons）`, ENEMY_META[TILE.POISON_LEECH].pressesButtons === true);
		check(`ヒルはいつも追う（enemyChase）`, startsAlert(room, LEECH, TILE.POISON_LEECH));
		check(`部屋は enemiesRespawn＝入り直すとヒルが戻る（倒すと重しが無くなる）`, room.enemiesRespawn === true);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,1'], ENEMY_META);
		check(`脅威度 ${threat}（Γ 4.5）が D8 の看板部屋 2,1（${sig}）より軽い`, threat === 4.5 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：素の宝箱の部屋を「眠る重しの泥橋」に作り替える（キュー93 の8室目）`);
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
