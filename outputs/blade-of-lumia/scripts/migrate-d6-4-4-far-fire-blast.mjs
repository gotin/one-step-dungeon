// dungeon_6 `4,4`（`3,4` の東の行き止まり）：薄い部屋を「遠火の発破」に作り替える
// （2026-11-08 / PLAN 実行キュー 95 の13室目・主題はユーザー判断「A 遠火の発破」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 ############
//      2 #....B....t#     ← 宝箱 B(2,5)＝ルピー×5・木1
//      4 ...........#     ← 口は西（行4-5）だけ
//      6 #.........u#     ← 茂み1
//      9 ############
//   床の広間に宝箱が1つあるだけ・敵なし。
//
// ■ 新しい `4,4`＝遠火の発破（`~` は bgTiles の水）
//      0 ############
//      1 #t..~~~~~~~#
//      2 #...~~~~~~~#
//      3 #...~¤~ŧ~~B#     ← 大いが栗 ¤(3,5)（池の中）・枯れ木 ŧ(3,7)（岬の先）・宝箱 B(3,10)（池の東の小島）
//      4 ....~~~.~~~#     ← 西の口・岬 (4,7)〜(6,7)
//      5 ....~~~.~~~#
//      6 #...~~~.~~~#
//      7 #....H.....#     ← かがり火 H(7,5)＝初めから灯っている（栗の真南の列）
//      8 #i........t#     ← 碑 i(8,1)
//      9 ############
//   ・既存の規則3つの合わせ技（エンジン変更なし）：
//     ①灯ったかがり火を通った矢は火矢になる（8室目・game/projectile.js carryFireAt）
//     ②火に触れた大いが栗は爆ぜる＝爆弾と同じ爆発（7室目・burstBurrAt → explodeAt）
//     ③爆風を受けた枯れ木は爆心と反対の向きへ倒れ、先の2マスに幹が横たわる（10室目・fellTreesFromBlast）
//   ・解き方（1射）：かがり火の真南 (8,5) から北へ射る＝火矢が栗を爆ぜさせる→爆心 (3,5) は枯れ木の西2マス
//     ＝枯れ木は東へ倒れて (3,8)(3,9) に橋＝岬→切り株→橋で宝箱の前。
//   ・誤り（自然に歩く道）＝岬で爆弾を置く（10室目で覚えた手）＝勇者が立てるのは枯れ木の南だけ
//     ＝枯れ木は北へ倒れて (2,7)(1,7) に横たわる＝どこにも着かない（入り直せば戻る）。
//     **枯れ木を東へ倒せる爆心は池の中＝勇者の爆弾では作れない**＝池の向こうに居る栗を爆心にする。
//   ・勇者の火は栗に届かない：栗の四方は水（ロウソク＝前の1マス）・木のブーメラン（←↑4）は (8,5) から
//     栗まで5マスで届かない（銀・星のブーメラン＝D5 の後は届く＝後の道具で楽になる手・1室目以来の扱い）。
//   ・爆弾では栗が動かない（四方が水＝転がる先が無い）。
//   ・報酬＝回復薬（大）（旧 ルピー×5 は撤去・キュー100 の棚卸しの対象に入れてよい）。
//
// ■ 撤去したもの
//   宝箱 (2,5)（(3,10) へ移した）・木 (2,10)・茂み (6,10)。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水／宝の中身／碑の本文／かがり火は初めから灯る／外周の口の形が不変／敵なし
//   ・口から全部の岸の床へ歩ける・宝箱の隣は歩いて（はしごでも）届かない
//   ・ロウソク：立てる床が栗に縦横で接しない／爆弾：どこに置いても栗は動かない
//   ・爆弾だけの総当たり：枯れ木が倒れる向きは北だけ・北へ倒れても宝箱に届かない
//   ・火の総当たり（立てる床×4方向）：火矢で栗が爆ぜる座は (8,5) の北向きだけ・木のブーメランでは爆ぜない
//   ・連鎖：栗が爆ぜると枯れ木は東へ倒れ、宝箱の隣 (3,9) に歩いて届く
//   ・層の到達性が書き換え前と同じ・dead-edge 0
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-4-4-far-fire-blast.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-4-4-far-fire-blast.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';
import { FALL_DIRS, FALLEN_LOG_LEN } from '../game/passable.js';
import { bfsLayer } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '4,4';
export const ROWS = 10, COLS = 12;

// `~` は bgTiles の水（tiles 側は床 '.'）。栗 (3,5) の下も水。
export const PLAN_ROWS = [
	'############',
	'#t..~~~~~~~#',
	'#...~~~~~~~#',
	'#...~¤~ŧ~~B#',
	'....~~~.~~~#',
	'....~~~.~~~#',
	'#...~~~.~~~#',
	'#....H.....#',
	'#i........t#',
	'############',
];
export const BURR   = '3,5';
export const TREE   = '3,7';
export const TORCH  = '7,5';
export const SEAT   = '8,5';     // 火矢を射る座（北向き）
export const CHEST  = '3,10';
export const SIGN   = '8,1';
export const MOUTHS = ['4,0', '5,0'];
export const TARGET = PLAN_ROWS.map((row) => row.replace(/~/g, '.'));
export const WATER = [BURR];
PLAN_ROWS.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
export const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 50, name: 'ルピー×50' } };   // キュー100（2026-11-09）で差し替え＝scripts/migrate-q100-dungeon-rewards.mjs
export const SIGN_DATA = {
	[SIGN]: {
		name: '遠火の 発破',
		lines: [
			'灯を くぐった 矢は 火を 運び、 火に 触れた 実は 爆ぜる。',
			'朽ちた 木は 爆ぜる 風に 背を 向けて 倒れる。',
		],
	},
};
// 木のブーメランの届き（セル数・←↑4／→↓5＝D7 `3,1` の実測・D6 `1,4` `3,2` と同じ値）
export const WOOD_REACH = { neg: 4, pos: 5 };

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const rc = (k) => k.split(',').map(Number);
const nbrs = (k) => { const [r, c] = rc(k); return DIRS.map(([dr, dc]) => `${r + dr},${c + dc}`); };

// 勇者の歩ける床（口から）。fallen＝倒れた枯れ木の向き（null＝立っている）＝切り株と幹は歩ける。
// ladder＝幅1の水を渡れる（はしご＝D6 の後に手に入る＝戻ってきたとき）。
export function reach(tiles, water, { fallen = null, ladder = false } = {}) {
	const logs = new Set();
	if (fallen) {
		const [tr, tc] = rc(TREE); const [dr, dc] = FALL_DIRS[fallen];
		logs.add(TREE);
		for (let s = 1; s <= FALLEN_LOG_LEN; s++) logs.add(`${tr + dr * s},${tc + dc * s}`);
	}
	const ok = (r, c) => {
		const k = `${r},${c}`;
		if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
		if (logs.has(k)) return true;
		return !water.has(k) && tiles[r][c] === TILE.FLOOR;
	};
	const seen = new Set(MOUTHS); const q = [...MOUTHS];
	while (q.length) {
		const [r, c] = rc(q.shift());
		for (const [dr, dc] of DIRS) {
			let nr = r + dr, nc = c + dc;
			if (ladder && water.has(`${nr},${nc}`) && !logs.has(`${nr},${nc}`) && ok(nr + dr, nc + dc)) { nr += dr; nc += dc; }
			const k = `${nr},${nc}`;
			if (seen.has(k) || !ok(nr, nc)) continue;
			seen.add(k); q.push(k);
		}
	}
	return seen;
}

// 爆心 center の爆風で枯れ木がどちらへ倒れるか（game/projectile.js fellTreesFromBlast の写し）。
// 倒れない＝null。standOn＝勇者の居るセル（倒れる先に居れば倒れない）。
export function fallDirFrom(tiles, center, standOn = null) {
	const [r0, c0] = rc(center); const [tr, tc] = rc(TREE);
	const ddr = tr - r0, ddc = tc - c0;
	if ((ddr !== 0) === (ddc !== 0) || Math.abs(ddr) + Math.abs(ddc) > 2) return null;
	const d = ddr < 0 ? 'n' : ddr > 0 ? 's' : ddc < 0 ? 'w' : 'e';
	const [dr, dc] = FALL_DIRS[d];
	for (let s = 1; s <= FALLEN_LOG_LEN; s++) {
		const lr = tr + dr * s, lc = tc + dc * s;
		if (lr <= 0 || lc <= 0 || lr >= ROWS - 1 || lc >= COLS - 1) return null;
		if (tiles[lr][lc] !== TILE.FLOOR) return null;
		if (standOn === `${lr},${lc}`) return null;
	}
	return d;
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
	const layerRun = () => bfsLayer(stages, START, { withLadder: false, openTiles: null });
	const layerRunOpen = () => bfsLayer(stages, START, { withLadder: false, openTiles: new Set(['T', '!', 'D', '=']) });
	const baseClosed = layerRun();
	const baseOpen = layerRunOpen();

	const rowStr = (row) => (Array.isArray(row) ? row.join('') : String(row));
	const before = room.tiles.map(rowStr);
	const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : [...row][0] + [...row][COLS - 1])).join('|');
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────────
	check(`盤面は ${ROWS}×${COLS}`, TARGET.length === ROWS && TARGET.every((row) => [...row].length === COLS));
	check(`外周の口の形が書き換え前と同じ`, ringOf(before) === ringOf(TARGET));
	room.tiles = TARGET.map((row) => [...row]);
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	room.showConditions = {};
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.initLitTorches = [TORCH];
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = Array.isArray(room.links) ? [] : {};
	room.enemyDirs = {};
	delete room.enemyHold;
	delete room.enemyChase;
	delete room.enemiesRespawn;
	room.comment = '【キュー95 遠火の発破（2026-11-08）】灯ったかがり火を通った矢は火矢になり、火に触れた大いが栗は爆ぜ、'
		+ '爆風を受けた枯れ木は爆心と反対へ倒れる。岬の先の枯れ木を東へ倒せる爆心は池の中の栗だけ'
		+ '＝かがり火の真南 (8,5) から北へ射て栗を爆ぜさせると、幹が宝箱（回復薬（大））の小島への橋になる。'
		+ '岬で爆弾を置くと北へ倒れてどこにも着かない（入り直せば戻る）。scripts/migrate-d6-4-4-far-fire-blast.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const water = new Set(Object.keys(room.bgTiles).filter((k) => room.bgTiles[k] === TILE.WATER));
	const at = (k) => { const [r, c] = rc(k); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水 ${water.size} マス（bgTiles・栗の下も水・枯れ木と宝箱とかがり火の下は陸）`, water.size === WATER.length && water.has(BURR)
		&& ![TREE, CHEST, TORCH].some((k) => water.has(k)));
	check(`宝箱 ${CHEST} は1つ・中身＝回復薬（大）・初めから見えている`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS) && !Object.keys(room.showConditions).length);
	check(`大いが栗は ${BURR}・枯れ木は ${TREE}・かがり火は ${TORCH} の1つずつ・初めから灯るのはかがり火だけ`,
		count(TILE.BURR) === 1 && at(BURR) === TILE.BURR && count(TILE.DEAD_TREE) === 1 && at(TREE) === TILE.DEAD_TREE
		&& count(TILE.TORCH) === 1 && at(TORCH) === TILE.TORCH && JSON.stringify(room.initLitTorches) === JSON.stringify([TORCH]));
	check(`碑 ${SIGN} に本文2行`, at(SIGN) === TILE.SIGN && count(TILE.SIGN) === 1 && room.signData[SIGN]?.lines?.length === 2);
	check(`敵・石・茂み・壊せる壁・踏み板・門・床の爆弾が無い`, !t.flat().some((ch) => ENEMY_META[ch] || ch === TILE.STONE
		|| ch === TILE.BUSH || ch === TILE.BREAKABLE_WALL || ch === TILE.BUTTON || ch === TILE.GATE || ch === TILE.ITEM_BOMB));

	// ── ② 歩行：岸の床は全部届く・宝箱の隣は届かない ───────────────────────
	const walk = reach(t, water);
	const walkLadder = reach(t, water, { ladder: true });
	{
		const floors = [];
		t.forEach((row, r) => row.forEach((ch, c) => { const k = `${r},${c}`; if (!water.has(k) && ch === TILE.FLOOR) floors.push(k); }));
		const stranded = floors.filter((k) => !walk.has(k));
		check(`岸の床は全部、西の口から歩いてつながる（取り残し ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
		check(`射る座 ${SEAT} と岬の先 (4,7) に歩いて届く`, walk.has(SEAT) && walk.has('4,7'));
		check(`宝箱の隣は歩いて届かない`, !nbrs(CHEST).some((k) => walk.has(k)));
		check(`はしごでも宝箱の隣・栗の隣へは届かない（はしごで増える床 ${[...walkLadder].filter((k) => !walk.has(k)).join(' ') || 'なし'}）`,
			!nbrs(CHEST).some((k) => walkLadder.has(k)) && !nbrs(BURR).some((k) => walkLadder.has(k)));
	}

	// ── ③ 勇者の手（ロウソク・爆弾）では解けない ─────────────────────────
	{
		check(`ロウソク：栗の四方は水＝立てる床が縦横で接しない`, nbrs(BURR).every((k) => water.has(k)));
		check(`爆弾：栗の四方が水＝どこに置いても転がる先が無い`, nbrs(BURR).every((k) => water.has(k) || at(k) !== TILE.FLOOR));
		const dirs = new Map();
		for (const k of walkLadder) {
			const d = fallDirFrom(t, k, k);
			if (d) dirs.set(k, d);
		}
		const seen = [...new Set(dirs.values())];
		check(`爆弾だけの総当たり：枯れ木が倒れるのは北だけ（座 ${[...dirs].map(([k, d]) => `${k}${d}`).join(' ')}）`,
			seen.length === 1 && seen[0] === 'n');
		const afterN = reach(t, water, { fallen: 'n', ladder: true });
		check(`北へ倒れても宝箱の隣に届かない（はしごでも）`, !nbrs(CHEST).some((k) => afterN.has(k)));
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で持てる道具＝弓・ブーメラン・ロウソク・爆弾（はしごは後）`, ['bow', 'boomerang', 'candle', 'bomb'].every((x) => tools.has(x)) && !tools.has('ladder'));
	}

	// ── ④ 火の総当たり（矢／木のブーメラン）：栗が爆ぜる座 ───────────────────
	// 矢＝壁まで飛ぶ（木・栗・かがり火は貫通＝isTilePassableForProj は壁と壊せる壁だけ止める）・
	// 灯ったかがり火を通った後のセルに火を運ぶ。ブーメラン＝届きまで飛んで同じ道を戻る
	// ＝届きの中に灯った火があれば届きの中の全部に火が付く。
	{
		const projStop = (r, c) => t[r]?.[c] == null || t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL;
		const bursts = (seat, [dr, dc], kind) => {
			const [sr, sc] = rc(seat);
			const lim = kind === 'arrow' ? 99 : (dr < 0 || dc < 0 ? WOOD_REACH.neg : WOOD_REACH.pos);
			const line = [];
			for (let k = 1; k <= lim; k++) { const r = sr + dr * k, c = sc + dc * k; if (projStop(r, c)) break; line.push(`${r},${c}`); }
			if (kind === 'arrow') {
				const i = line.indexOf(TORCH), j = line.indexOf(BURR);
				return i >= 0 && j > i;
			}
			return line.includes(TORCH) && line.includes(BURR);
		};
		const arrowSeats = [], boomSeats = [];
		for (const s of walkLadder) for (const d of DIRS) {
			if (bursts(s, d, 'arrow')) arrowSeats.push(`${s}(${d})`);
			if (bursts(s, d, 'boomerang')) boomSeats.push(`${s}(${d})`);
		}
		check(`火矢で栗が爆ぜる座は ${SEAT} の北向きだけ（実測 ${arrowSeats.join(' ') || 'なし'}）`, arrowSeats.length === 1 && arrowSeats[0] === `${SEAT}(-1,0)`);
		check(`木のブーメランでは栗が爆ぜない（実測 ${boomSeats.join(' ') || 'なし'}）`, boomSeats.length === 0);
	}

	// ── ⑤ 連鎖：栗が爆ぜる→枯れ木が東へ倒れる→宝箱 ─────────────────────────
	{
		const d = fallDirFrom(t, BURR, SEAT);
		check(`栗 ${BURR} の爆風で枯れ木は東へ倒れる（実測 ${d}）`, d === 'e');
		const after = reach(t, water, { fallen: 'e' });
		check(`東へ倒れると幹 (3,8)(3,9) を渡って宝箱の隣 (3,9) に届く`, after.has('3,9') && after.has(TREE));
		check(`爆ぜた栗から枯れ木は距離 2＝爆風の届く端（栗をもう1マス西に置くと倒れない）`, fallDirFrom(t, '3,4', SEAT) === null);
	}

	// ── ⑥ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「遠火の発破」に作り替える（キュー95 の13室目）`);
	console.log(`\n## 盤面の差分（${ROOM}・~ は水）`);
	room.tiles.forEach((row, i) => console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === rowStr(row) ? '=' : '→'}   ${PLAN_ROWS[i]}`));
	console.log('\n## 検証');
	let ng = 0;
	for (const [cond, msg] of verify) { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) ng++; }
	if (ng) die(`${ng} 件の検証に失敗＝書き込まない`);
	if (DRY) console.log('\n--dry: 書き込みなし');
	else { writeFileSync(MAP_PATH, JSON.stringify(data, null, 2)); console.log('\n書き込み完了:', MAP_PATH); }
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
