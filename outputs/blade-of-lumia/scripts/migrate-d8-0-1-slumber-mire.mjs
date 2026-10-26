// dungeon_8 `0,1`（`1,1` と `0,2` の通り道・ボス部屋 `0,0` の真南）：素の部屋を「眠りヒルの泥道」に作り替える
// （2026-10-26 / PLAN 実行キュー 93 の2室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー93 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 ############
//      3 #....B.....#     ← 宝箱 B(3,5)＝ルピー×10
//      4 #...........     ← 東の口（行4-5）→ `1,1`
//      9 #####..#####     ← 南の口（列5-6）→ `0,2`
//   真ん中に宝箱が1つあるだけ・敵なし。
//
// ■ 新しい `0,1`＝眠りヒルの泥道
//      0 ############
//      1 #~Γ~~Γ~~~###     ← 北の窪み Γ(1,2)(1,5)
//      2 #B.........#     ← 幅1の泥道（行2・列2〜10）・西の突き当たりに宝箱 B(2,1)＝ルピー×20
//      3 #~~Γ~~Γ~~~~#     ← 南の窪み Γ(3,3)(3,6)・堀 (3,10)＝はしごで泥道へ渡る唯一の水
//      4 #########i..     ← 立札 i(4,9)「泥田の 子守唄」・岸 (4,10)・東の口
//      5 #...........
//      6 #..........#     ← 本土（広間）は書き換え前と同じ空き床
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   （`~`＝bgTiles の水・tiles は '.'。泥道と窪みと宝箱の下は bgTiles の泥 `w`＝見た目だけ）
//   ・**主題＝笛を吹くと、この部屋の毒沼ヒルが泥の底へ沈んで眠る（4 秒）。眠っている間は上を歩け、
//     攻撃もしてこない（こちらの攻撃も通らない）。** 新しい笛の効き目
//     `fluteEffect:{type:'slumber'}`（game.js playFlute → enemy-ai.js slumberEnemies）。
//     Fable レビュー #13「笛に戦闘側の役が無い」への答え（2026-10-26 ユーザー判断「笛を敵に効かせる」）。
//   ・泥道の帯（行1〜3）は四方が水か壁＝**ヒルは帯から出られない**。帯へ入るのは、岸 (4,10) から堀 (3,10) を
//     はしごで渡るときだけ。ヒルは水の窪み（三方が水か壁）に1体ずつ居て、勇者に気づくと道へ出て東の端へ
//     寄ってくる＝着地 (2,10) を塞ぎ、幅1の道に列を作る（毒は無敵を貫く＝狭い道で斬り合うと重い）。
//   ・答えは3つ＝①岸で笛を吹き、眠っているヒルの上を歩いて宝箱へ。突き当たりで目を覚ましたヒルに
//     道を塞がれる＝起きたらもう一度吹いて戻る（眠っている間は吹き直しても延びない＝窓は 4 秒×2）
//     ②岸から堀越しに、着地を塞いだヒルを1体ずつ射る・爆弾で吹く（ヒルは水を越えて来ない）
//     ③着地が空いた隙に渡って剣で1体ずつ（毒をもらう）。倒すのは必須でない。
//   ・片道は 10 マス（堀を渡って宝箱の手前まで）＝約 2.4 秒（勇者は 1 マス 240ms）＝1回の眠りで宝箱まで届く。
//   ・⚠️ 最初の版は堀の代わりに歩ける入口 (3,10) だった＝勇者に気づいたヒルが入口から広間へ溢れ出て、
//     東の口に立つ勇者を囲んだ（実測 `.scratch/q93/probe-0-1.mjs`）。窪みの家からの距離では止まらない。
//   ・D8 の看板部屋 `2,1`（爆弾鬼と毒の廊下）が毒沼ヒルの本番。ここは `0,2`（はしごで撒く）に続く2つ目の
//     顔見せ（脅威度 18.0＝85.5 より軽い）。
//   ・型を重ねない相手＝D8 `0,2` 毒ヒルの泥田（水を跨いで撒く・はしご＝こちらのはしごは帯へ入る鍵で、
//     撒く手は笛）／D4 `0,3` 怨念の封じ祠（道具で通れるようにする＝もやを祓う。こちらは時間の窓）／
//     field の笛の reveal（隠しが出る）。
//
// ■ 撤去したもの
//   宝箱ルピー×10（旧 (3,5)）。報酬は泥道の奥の宝箱ルピー×20 に置き換えた。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／bgTiles（水と泥）／宝箱1つと中身／立札の本文／fluteEffect／外周の口の形が不変
//   ・取り残しなし（泥道の帯ははしごで水1枚）／泥道は幅1（上下が水か壁か窪み）
//   ・帯は歩いては出入りできない＝ヒルは帯から出られない／はしごで帯へ渡れるのは岸 (4,10) の1か所だけ
//   ・窪みは三方が水か壁＝ヒルの出口は泥道だけ
//   ・敵は Γ×4・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d8-0-1-slumber-mire.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d8-0-1-slumber-mire.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-0-2-leech-paddy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_8';
export const ROOM  = '0,1';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'############',
	'#~Γ~~Γ~~~###',
	'#B.........#',
	'#~~Γ~~Γ~~~~#',
	'#########i..',
	'#...........',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const CHEST = '2,1';
export const CHEST_CONTENT = { type: 'rupee', value: 20, name: 'ルピー×20' };
export const SIGN = '4,9';
export const SIGN_DATA = {
	name: '泥田の 子守唄',
	lines: ['泥の 子らは 笛の 音に 眠る。', '眠りは 短い。 目覚めた 子は 道を 塞ぐ。'],
};
export const FLUTE_EFFECT = { type: 'slumber', ms: 4000, enemies: [TILE.POISON_LEECH] };
export const LEECHES = ['1,2', '1,5', '3,3', '3,6'];
export const PATH_ROW = 2;
export const PATH = [];                      // 泥道＝行2 の列2〜10
for (let c = 2; c <= 10; c++) PATH.push(`${PATH_ROW},${c}`);
export const MOAT = '3,10';                  // 岸と泥道の間の堀＝はしごで渡る唯一の水
export const BANK = '4,10';                  // 堀の南の岸
export const LANDING = '2,10';               // 堀の北＝泥道の東端
export const OPENING = ['4,11', '5,11', '9,5', '9,6'];
// 見た目だけの泥（bgTiles 'w'）＝泥道・窪み・宝箱の下
export const MUD = [...PATH, ...LEECHES, CHEST];
// 泥道の帯（はしごで渡った先）＝泥道と窪みと宝箱のマス（宝箱は敵が乗れる＝ヒルも上を通る）
export const STRIP = [...PATH, ...LEECHES, CHEST];

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
	room.signData = { [SIGN]: { ...SIGN_DATA, lines: [...SIGN_DATA.lines] } };
	room.fluteEffect = { ...FLUTE_EFFECT, enemies: [...FLUTE_EFFECT.enemies] };
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const grid = TARGET.map((row) => [...row]);
	const at = (k) => { const [r, c] = parse(k); return grid[r][c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === tilesOf().map(rowStr).join('\n'));
	{
		const bg = room.bgTiles;
		const water = Object.keys(bg).filter((k) => bg[k] === TILE.WATER);
		const mud = Object.keys(bg).filter((k) => bg[k] === TILE.MUD);
		check(`bgTiles＝水 ${water.length} 枚・泥 ${mud.length} 枚（ほかの値なし）`,
			water.length + mud.length === Object.keys(bg).length && water.length === 14 && mud.length === MUD.length);
		check(`tiles 層に水を置いていない（水は bgTiles だけ）`, !flat.includes(TILE.WATER));
		check(`泥は水の上に無い`, mud.every((k) => at(k) !== TILE.WATER));
	}
	check(`宝箱は泥道の奥 ${CHEST} の1つだけ・中身はルピー×20`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST
		&& Object.keys(room.chestContents).join() === CHEST && room.chestContents[CHEST].value === 20);
	check(`立札 ${SIGN}「${SIGN_DATA.name}」＝{name,lines} 形式・本文あり`,
		at(SIGN) === TILE.SIGN && flat.filter((ch) => ch === TILE.SIGN).length === 1
		&& Array.isArray(room.signData[SIGN]?.lines) && room.signData[SIGN].lines.length === 2);
	check(`fluteEffect＝slumber 4000ms・毒沼ヒルだけ`,
		room.fluteEffect.type === 'slumber' && room.fluteEffect.ms === 4000 && room.fluteEffect.enemies.join() === TILE.POISON_LEECH);
	check(`床の拾い物・出現条件が空`, !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length);

	// ── ② 歩行：帯は歩いて出入りできない・はしごでは岸の1か所から ───────────
	{
		const foot = reach(grid, OPENING);
		const lad = reach(grid, OPENING, { withLadder: true });
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!HARD_BLOCKED.has(grid[r][c]) && grid[r][c] !== TILE.WATER) floors.push(key(r, c));
		const stranded = floors.filter((k) => !lad.has(k));
		check(`床は全部届く（はしご込み・取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		check(`泥道の帯（泥道・窪み・宝箱）へは歩いて1マスも届かない＝ヒルは帯から出られない`, STRIP.every((k) => !foot.has(k)));
		check(`はしごなら帯のどこへも水1枚で届く`, STRIP.every((k) => lad.get(k) === 1));
		const blocked = (ch) => ch === TILE.WATER || HARD_BLOCKED.has(ch) || !!ENEMY_META[ch];
		const narrow = PATH.every((k) => { const [r, c] = parse(k); return blocked(grid[r - 1][c]) && blocked(grid[r + 1][c]); });
		check(`泥道（行2・列2〜10）は幅1＝上下が水か壁か窪み`, narrow);
		// はしごで帯へ渡れる岸＝帯の外の歩ける床から、水1枚を挟んで帯のセルへ着く組
		const crossings = [];
		for (const k of foot.keys()) {
			const [r, c] = parse(k);
			for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const w = grid[r + dr]?.[c + dc], fr = r + 2 * dr, fc = c + 2 * dc;
				if (w === TILE.WATER && STRIP.includes(key(fr, fc))) crossings.push(`${k}→${key(fr, fc)}`);
			}
		}
		check(`はしごで帯へ渡れるのは岸 ${BANK} → 着地 ${LANDING} の1か所だけ（実測 ${crossings.join(' ')}）`,
			crossings.length === 1 && crossings[0] === `${BANK}→${LANDING}` && at(MOAT) === TILE.WATER);
	}

	// ── ③ 窪みとヒル ───────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		const want = LEECHES.map((k) => `${TILE.POISON_LEECH}@${k}`);
		check(`敵は毒沼ヒル Γ×4（${LEECHES.join(' ')}）（実測 ${mobs.join(' ')}）`, mobs.join() === want.join());
		const pocketOk = LEECHES.every((k) => {
			const [r, c] = parse(k);
			const exits = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => {
				const ch = grid[a]?.[b];
				return ch && ch !== TILE.WATER && !HARD_BLOCKED.has(ch);
			});
			return exits.length === 1 && exits[0][0] === PATH_ROW;
		});
		check(`窪みは三方が水か壁＝ヒルの出口は泥道だけ`, pocketOk);
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,1'], ENEMY_META);
		check(`脅威度 ${threat}（Γ 4.5×4）が D8 の看板部屋 2,1（${sig}）より軽い`, threat === 18 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「眠りヒルの泥道」に作り替える（キュー93 の2室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・水は ~ で表示）`);
	TARGET.forEach((row, i) => {
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === row ? '=' : '→'}   ${row}`);
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
