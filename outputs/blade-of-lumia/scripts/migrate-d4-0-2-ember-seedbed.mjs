// dungeon_4 `0,2`（`0,1` の南の行き止まり＝かがり火の間 `1,1` の先）：素の部屋を「熾火の苗床」に作り替える
// （2026-10-25 / PLAN 実行キュー 92 の9室目＝D4 の最後・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー92 の着手時の実測＝`.scratch/review/game-stats2.mjs`）
//      0 #####..#####     ← 北の口だけが開いた行き止まり
//      4 #....B.....#     ← 宝箱（ルピー×5）が1つ置いてあるだけ
//      9 ############
//   敵なし・取るのに1手も要らない。
//
// ■ 新しい `0,2`＝熾火の苗床
//      0 #####..#####
//      1 #i.........#     ← 看板 (1,1)「熾火の 苗床」／広間の行
//      2 #llll..llll#
//      3 #.δ........#     ← 畝（幅1・上下は溶岩）
//      4 #llll..llll#
//      5 #........δ.#     ← 畝
//      6 #llll..llll#
//      7 #.δ........#     ← 畝
//      8 #llll.Bllll#     ← 背骨（列5-6・幅2）の突き当たりに宝箱 (8,6)＝全滅（killAll）で出る
//      9 ############
//   ・**主題＝分裂スライム δ は斬ると2つに分かれる。分かれた子は親が倒れたマスとその隣に生まれる
//     ＝そこにロウソクの炎が燃えていれば、生まれた瞬間に燃え尽きる。** 置き炎は燃えている間、上に来た敵を
//     毎 tick 焼く（`projectile.js flameTick → burnEnemiesOnFlame`・1つの炎は同じ敵を1回だけ）。子は新しい敵
//     （id が別）∴親を焼いた炎でも子をもう一度焼く。子の hp 2 は炎の 3 で一撃。
//   ・畝は幅1（上下が溶岩）＝子の生まれる先は「親のマス・東・西」に絞られる（`combat.js pickSplitCells`
//     は親のマス→東→西→南→北→斜めの順に、歩ける空きマスを2つ取る）。∴畝に炎を2つ並べて置き、
//     親に踏ませれば、親は炎で倒れ、子は2体とも炎の上に生まれて燃え尽きる＝触れずに片付く。
//     炎1つでも、親が炎の上に居る間に斬れば子の片方は燃える。剣だけで斬っても解ける（子は剣1振り）＝
//     炎は「楽に・無傷で」片付ける手。
//   ・**δ に本編で初めて会うのはここ**（進行順 D4→D6→D5＝D6 で爆弾を手に入れると「分裂させずに潰す」
//     弱点が使える。D5 の δ×5 が再演）。`4,2` 爆弾鬼の封じ窯が「爆弾でひびを壊す」を予告したのと対で、
//     ここは「爆弾が効く敵」を先に見せる。
//   ・この部屋へはロウソクの後に来る（`1,2` の櫃→かがり火の間 `1,1`→`0,1`→ここ）＝ロウソクを使う部屋だが
//     「後で戻る」部屋ではない（`0,3` 怨念の封じ祠だけがロウソクの前に来る）。
//   ・Fable レビュー #2（D4 はほぼ無戦闘）を薄める戦い。脅威度 36.0（δ 12.0×3＝看板 `2,3` の 42.0 より軽い）。
//   ・D4 の他の部屋と型を分けた＝`0,3` 怨念の封じ祠（もや）／`3,2` 溶岩の十字路と地図の袋小路（追ってくる亀）／
//     `3,1` 呪い火の炉（炉口に炎を置いて出てくる ψ を焼く＝炎は「1体を1回焼く罠」）／`4,3` 火口湖の甲羅島（弓）／
//     `4,2` 爆弾鬼の封じ窯／`4,1` 溶岩の川向こうの薬棚（ブーメラン運び）／`4,0` 炉番の盾騎士／`2,0` 冷え石の渡り。
//     `3,1` との違い＝あちらは「出口を炎で塞ぐ」、こちらは「倒す場所を炎で選ぶ（増える先を焼く）」。
//
// ■ 撤去したもの
//   宝箱（ルピー×5・旧 (4,5)・出現条件なし）。報酬は全滅で出る宝箱のルピー×20 に置き換えた。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝箱1つと中身・killAll で出る／看板の本文／床の拾い物なし／外周の口の形が不変
//   ・取り残しなし（床は全部歩いて届く）・宝箱の隣まで歩ける
//   ・畝の幅1：背骨（列5-6）の外の畝のマスは上下とも溶岩
//   ・敵は δ×3 だけ・どれも畝の上／脅威度が看板部屋より軽い
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d4-0-2-ember-seedbed.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d4-0-2-ember-seedbed.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_4';
export const ROOM  = '0,2';
export const ROWS = 10, COLS = 12;

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'#####..#####',
	'#i.........#',
	'#llll..llll#',
	'#.δ........#',
	'#llll..llll#',
	'#........δ.#',
	'#llll..llll#',
	'#.δ........#',
	'#llll.Bllll#',
	'############',
];
export const CHEST = '8,6';
export const CHEST_CONTENT = { type: 'rupee', value: 50, name: 'ルピー×50' };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
export const SIGN = '1,1';
export const SIGN_DATA = {
	name: '熾火の 苗床',
	lines: ['灰の 苗は 斬れば 二つに 分かれる。', '火の 上で 果てた 苗は 分かれた 端から 燃え尽きる。'],
};
export const SLIMES = ['3,2', '5,9', '7,2'];
export const LANES = [3, 5, 7];           // 畝の行
export const SPINE = [5, 6];              // 背骨の列（幅2）
export const OPENING = ['0,5', '0,6'];

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

// 部屋の中だけの歩行（4近傍）。敵のセルは床とみなす（宝箱のセルは届けばよい）。
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
		const [r, c] = parse(k);
		if (ok(r, c) && !seen.has(k)) { seen.add(k); q.push([r, c]); }
	}
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc, k = key(nr, nc);
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push([nr, nc]);
		}
	}
	return seen;
}

export function chestReachable(grid, walk) {
	const [r, c] = parse(CHEST);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([a, b]) => walk.has(key(a, b)));
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
	check(`外周の口の形が書き換え前と同じ`, ringOf(before).replace(/[^#.]/g, '.') === ringOf(TARGET).replace(/[^#.]/g, '.'));
	room.tiles = TARGET.map((row) => [...row]);
	room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
	room.showConditions = { [CHEST]: { trigger: 'killAll' } };
	room.signData = { [SIGN]: { ...SIGN_DATA, lines: [...SIGN_DATA.lines] } };
	room.floorItems = {};
	room.breakableWalls = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = parse(k); return t[r]?.[c]; };
	const flat = t.flat();
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`宝箱は ${CHEST} の1つだけ・中身は ${CHEST_CONTENT.name}`,
		flat.filter((ch) => ch === TILE.CHEST).length === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT }));
	check(`宝箱は全滅（killAll）で出る`, room.showConditions[CHEST]?.trigger === 'killAll' && Object.keys(room.showConditions).length === 1);
	check(`看板 ${SIGN} に本文（{name, lines}＝描画される形）`,
		at(SIGN) === TILE.SIGN && Array.isArray(room.signData[SIGN]?.lines) && room.signData[SIGN].lines.length > 0
		&& flat.filter((ch) => ch === TILE.SIGN).length === 1);
	check(`床の拾い物なし・床のルピーが無い`,
		!Object.keys(room.floorItems).length && !flat.includes(TILE.ITEM_RUPEE) && !flat.includes(TILE.ITEM_RUPEE_LARGE));

	// ── ② 歩行：取り残しなし ───────────────────────────────────────────
	const walk = reach(t, OPENING);
	check(`宝箱 ${CHEST} の隣まで歩ける`, chestReachable(t, walk));
	const floors = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (!HARD_BLOCKED.has(t[r][c]) && t[r][c] !== TILE.CHEST && t[r][c] !== TILE.SIGN) floors.push(key(r, c));
	}
	const stranded = floors.filter((k) => !walk.has(k));
	check(`床は全部届く（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);

	// ── ③ 畝は幅1（背骨の外は上下とも溶岩） ──────────────────────────
	{
		const wide = [];
		for (const r of LANES) for (let c = 1; c < COLS - 1; c++) {
			if (SPINE.includes(c)) continue;
			if (t[r][c] === TILE.WALL) continue;
			if (t[r - 1][c] !== TILE.LAVA || t[r + 1][c] !== TILE.LAVA) wide.push(key(r, c));
		}
		check(`畝（行 ${LANES.join('・')}）は背骨の外で幅1＝上下とも溶岩（崩れ ${wide.join(' ') || 'なし'}）`, wide.length === 0);
		const spineOk = [];
		for (let r = 1; r <= 7; r++) for (const c of SPINE) if (!walk.has(key(r, c))) spineOk.push(key(r, c));
		check(`背骨（列 ${SPINE.join('-')}）は行1〜7 が全部歩ける（塞がり ${spineOk.join(' ') || 'なし'}）`, spineOk.length === 0);
	}

	// ── ④ 敵 ──────────────────────────────────────────────────────────
	{
		const mobs = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ENEMY_META[t[r][c]]) mobs.push(`${t[r][c]}@${r},${c}`);
		check(`敵は δ×3 だけ（実測 ${mobs.join(' ')}）`, mobs.join() === SLIMES.map((k) => `${TILE.SPLIT_SLIME}@${k}`).join());
		check(`δ はどれも畝の上・背骨の外`, SLIMES.every((k) => { const [r, c] = parse(k); return LANES.includes(r) && !SPINE.includes(c); }));
		const threat = stageThreat(room, ENEMY_META);
		const sig = stageThreat(stages['2,3'], ENEMY_META);
		check(`脅威度 ${threat}（δ 12.0×3）が D4 の看板部屋 2,3（${sig}）より軽い`, threat === 36 && threat < sig);
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
	console.log(`# ${LAYER} ${ROOM}：素の部屋を「熾火の苗床」に作り替える（キュー92 の9室目）`);
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
