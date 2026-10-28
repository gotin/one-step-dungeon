// dungeon_8 `3,1`（十字路＝北 `3,0`・南 `3,2`・西 `2,1`・東 `4,1` の4つの口・床にコンパス）：
// 素のコンパスの部屋を「ヒルの重し」に作り替える
// （2026-10-27 / PLAN 実行キュー 93 の5室目・設計は Opus・ユーザー判断「ヒルを重しに」）
//
// ■ 何が薄かったか（キュー93 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 #####..#####
//      3 #....n.....#     ← 床にコンパス n(3,5) が落ちているだけ・敵なし
//      4 ............     ← 西の口・東の口（行4-5）
//      9 #####..#####     ← 南の口・北の口（列5-6）
//
// ■ 新しい `3,1`＝ヒルの重し（'~'＝bgTiles の水。tiles 層では床）
//      0 #####..#####
//      1 #..##......#     ← 北西の隅（1,1)(1,2)＝ヒルを呼ぶ立ち位置
//      2 #.~S.~...~~#     ← ボタン S(2,3)＝泥溝の西の袋（北は壁・西と南は水）
//      3 #..~Γ~...~~#     ← 毒沼ヒル Γ(3,4)＝泥溝 (2,4)(3,4) から出られない
//      4 ....~.......
//      5 ............
//      6 #T#........#     ← 門 T(6,1)＝ボタンが押されている間だけ開く
//      7 #.#.....~..#
//      8 #n#.....~~.#     ← コンパス n(8,1)＝門の奥
//      9 #####..#####
//   ・**主題＝毒沼ヒルは泥を吸った重い体でボタンを押す（新設＝ENEMY_META.pressesButtons）。
//     コンパスは門の奥・門はボタンが押されている間だけ開く・ボタンは泥溝の袋の先＝勇者は踏みながら門をくぐれない。
//     重しになるのはヒルだけ（石は無い）。**
//   ・ヒルの追い方は「長い軸を先に・回り込まない」（`0,2` 毒ヒルの泥田で覚える）＝勇者の居る方へ泥溝の縁まで寄って止まる。
//     溝は縦に2マス (2,4)(3,4)＋西の袋（ボタン）。袋へ入るのは、勇者が**袋と同じ高さ（行1〜2）の西**に居るときだけ
//     ＝北西の隅に立って待つと、ヒルが袋へ這い込みボタンを押す。入口（西の口）の高さ（行4〜5）では溝の底で止まる。
//   ・袋の中のヒルは、勇者が袋より東へ出るまで動かない（北は壁・西と南は水）＝隅から西の列を下りて門へ行けば押したまま。
//     東へ出るとヒルは溝へ戻る＝門が閉じる。
//   ・ヒルはいつも勇者を追う（enemyChase）＝見失って家の周りをさまよい、勝手にボタンへ乗ることが無い。
//   ・閉じ込めの防止（新設）＝門の奥に居る間にヒルが離れても（倒された・セーブから再開）門は閉じない
//     （`game/player.js syncEnemyButtons`）。
//   ・ヒルを倒すと重しが無くなる＝この部屋だけ入り直すとヒルが戻る（新設＝stage.enemiesRespawn・
//     整合性チェッカー検査17）。
//   ・はしごで袋の西の水 (2,2) を渡れば自分でボタンを踏める＝門が開くのを見て「重しが要る」と分かる（隣のヒルに毒をもらう）。
//   ・十字路の通り道（4つの口の行き来）は泥溝・門・池に塞がれない（はしご無し）。
//   ・脅威度 4.5（看板 `2,1` の 85.5 より軽い）。
//   ・型を重ねない相手＝D8 `0,2` 毒ヒルの泥田（ヒルは水で止まる＝撒く）／`0,1` 眠りヒルの泥道（笛で眠らせて上を歩く）
//     ／`1,0` 沼の石段（石でボタン）／D1〜D7 のボタンはどれも石か勇者が押す。敵を重しにするのはここが初めて。
//
// ■ 撤去したもの
//   床のコンパス n(3,5)。コンパスは門の奥 (8,1) へ移した。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と泥は bgTiles だけ／コンパス1つ・ボタン1つ・門1つ／宝箱・立札・石・笛の効き目が無い
//   ・4つの口はどれも、はしごも門も使わずにほかの3つへ歩いて届く／取り残された床が無い（はしご込み・門を開けて）
//   ・コンパスへは門を通るしか行けない（門を壁にすると、はしご込みでも届かない）
//   ・ヒルの泥溝は閉じている（ヒルの足で歩けるのは溝の2マスとボタンだけ）・ボタンの北は壁・西と南は水
//   ・ボタンへは歩いて行けず、はしごなら西の隅から水1枚で届く
//   ・ヒルを呼ぶ隅 (1,1)(1,2)(2,1) と、門までの西の列が歩いて届く
//   ・敵は Γ×1・いつも追う（enemyChase）・部屋は enemiesRespawn・脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d8-3-1-leech-weight.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d8-3-1-leech-weight.mjs         # 書き込み

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
export const ROOM  = '3,1';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面（'~' は bgTiles の水として敷き、tiles 側は '.'） ─────────────
export const TARGET = [
	'#####..#####',
	'#..##......#',
	'#.~S.~...~~#',
	'#..~Γ~...~~#',
	'....~.......',
	'............',
	'#T#........#',
	'#.#.....~..#',
	'#n#.....~~.#',
	'#####..#####',
];
export const BUTTON = '2,3';
export const GATE = '6,1';
export const COMPASS = '8,1';
export const LEECH = '3,4';
export const TROUGH = ['2,4', '3,4'];            // ヒルの泥溝（ボタンの袋を除く）
export const VAULT = ['7,1', '8,1'];             // 門の奥
export const CALL_SPOTS = ['1,1', '1,2', '2,1']; // ヒルを袋へ呼ぶ立ち位置（北西の隅）
export const WEST_ROUTE = ['3,1', '4,1', '5,1']; // 隅から門の前までの西の列
export const OPENING = { north: '0,5', south: '9,5', west: '4,0', east: '4,11' };
// 見た目だけの泥（bgTiles 'w'）＝泥溝とボタンの下
export const MUD = [...TROUGH, BUTTON];

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
	room.chestContents = {};
	room.floorItems = {};
	room.showConditions = {};
	room.breakableWalls = {};
	room.signData = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	room.enemyChase = { [LEECH]: true };
	room.enemiesRespawn = true;
	delete room.enemyHold;
	delete room.fluteEffect;

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
	check(`コンパスは門の奥 ${COMPASS} の1つだけ`,
		flat.filter((ch) => ch === TILE.ITEM_COMPASS).length === 1 && at(COMPASS) === TILE.ITEM_COMPASS && VAULT.includes(COMPASS));
	check(`ボタンは ${BUTTON}・門は ${GATE} の1つずつ（連動は refreshGates ①＝全ボタン ON で全 T が開く）`,
		flat.filter((ch) => ch === TILE.BUTTON).length === 1 && at(BUTTON) === TILE.BUTTON
		&& flat.filter((ch) => ch === TILE.GATE).length === 1 && at(GATE) === TILE.GATE);
	check(`石・宝箱・立札・床の拾い物・出現条件・笛の効き目が無い`,
		!flat.includes(TILE.STONE) && !flat.includes(TILE.CHEST) && !flat.includes(TILE.SIGN)
		&& !Object.keys(room.floorItems).length && !Object.keys(room.showConditions).length && !room.fluteEffect);

	// ── ② 歩行：十字路は通れる・コンパスへは門だけ ─────────────────────────
	{
		const opens = Object.values(OPENING);
		const shut = grid.map((row) => [...row]);
		{ const [r, c] = parse(GATE); shut[r][c] = TILE.WALL; }
		const pairs = [];
		for (const [a, ka] of Object.entries(OPENING)) {
			const f = reach(shut, [ka]);
			for (const [b, kb] of Object.entries(OPENING)) if (a !== b && !f.has(kb)) pairs.push(`${a}→${b}`);
		}
		check(`4つの口はどれも、はしごも門も使わずにほかの3つへ歩いて届く（届かない組 ${pairs.join(' ') || 'なし'}）`, pairs.length === 0);
		const floors = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!HARD_BLOCKED.has(grid[r][c])) floors.push(key(r, c));
		const lad = reach(grid, opens, { withLadder: true });
		const stranded = floors.filter((k) => !lad.has(k));
		check(`床は全部届く（門を開けて・はしご込み）（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		const sealed = reach(shut, opens, { withLadder: true });
		check(`コンパス（${VAULT.join('・')}）へは門 ${GATE} を通るしか行けない（門を壁にすると、はしご込みでも届かない）`,
			VAULT.every((k) => !sealed.has(k)) && VAULT.every((k) => lad.has(k)));
		const walk = reach(shut, opens);
		check(`ヒルを呼ぶ隅（${CALL_SPOTS.join('・')}）と門までの西の列（${WEST_ROUTE.join('・')}）は歩いて届く`,
			[...CALL_SPOTS, ...WEST_ROUTE].every((k) => walk.has(k)));
		check(`ボタン ${BUTTON} へは歩いて行けない／はしごなら西の水1枚で届く`,
			!walk.has(BUTTON) && reach(shut, opens, { withLadder: true }).get(BUTTON) === 1);
	}

	// ── ③ ヒルの泥溝 ─────────────────────────────────────────────────────
	{
		// ヒルの足＝水・壁・門（閉じている）を歩けない。泥溝から歩いて届くセル
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
		check(`ヒルの足で歩けるのは泥溝 ${TROUGH.join('・')} とボタン ${BUTTON} だけ（実測 ${region}）`,
			region === [...TROUGH, BUTTON].sort().join(' '));
		const [br, bc] = parse(BUTTON);
		check(`ボタンの袋＝北は壁・西と南は水・東だけが泥溝（実測 北${grid[br - 1][bc]} 西${grid[br][bc - 1]} 南${grid[br + 1][bc]} 東${grid[br][bc + 1]}）`,
			grid[br - 1][bc] === TILE.WALL && grid[br][bc - 1] === TILE.WATER && grid[br + 1][bc] === TILE.WATER && TROUGH.includes(key(br, bc + 1)));
		const [cr, cc] = parse(CALL_SPOTS[2]);
		check(`呼ぶ隅 ${CALL_SPOTS[2]} はボタンと同じ行の西＝水1枚を挟んで向かい合う`, cr === br && grid[br][bc - 1] === TILE.WATER && cc === bc - 2);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は毒沼ヒル Γ×1（${LEECH}）（実測 ${mobs.join(' ')}）`, mobs.join() === `${TILE.POISON_LEECH}@${LEECH}`);
		check(`毒沼ヒルはボタンを押せる（ENEMY_META.pressesButtons）`, ENEMY_META[TILE.POISON_LEECH].pressesButtons === true);
		check(`ヒルはいつも追う（enemyChase＝見失ってさまよい、勝手にボタンへ乗らない）`, startsAlert(room, LEECH, TILE.POISON_LEECH));
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
	console.log(`# ${LAYER} ${ROOM}：素のコンパスの部屋を「ヒルの重し」に作り替える（キュー93 の5室目）`);
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
