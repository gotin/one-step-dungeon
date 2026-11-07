// dungeon_6 `1,4`（大いが栗の庭 `2,4` の西の行き止まり）：薄い部屋を「火矢の淵」に作り替える
// （2026-11-07 / PLAN 実行キュー 95 の8室目・主題はユーザー判断「A 火矢の森」・設計は Opus・叩き台）
//
// ■ 何が薄かったか（キュー95 の着手時の実測＝`.scratch/q95/dump-d6.mjs`）
//      0 ############
//      2 #....B.....#     ← 宝箱（回復薬）が1つ
//      3 #..t.......#     ← 木が1本
//      4 #...........     ← 東の口だけ
//      6 #.......u..#     ← 茂みが1本
//      9 ############
//   四角い広間に宝箱と木と茂みだけ。歩いて開けるだけの部屋。
//
// ■ 新しい `1,4`＝火矢の淵（西の半分が池・`~` は bgTiles の水）
//      0 ############
//      1 #~~~~~....t#     ← 北の岸 (1,6)〜(1,9)
//      2 #H~~~~F....#     ← 淵の灯 T1 H(2,1)（池の中）・岸の火 F H(2,6)＝初めから灯っている
//      3 #~~~~~~~..i#     ← 碑 i(3,10)
//      4 #~~~~~~~....     ← 東の口
//      5 #~~~~~~~....
//      6 #~~~~~~~..t#
//      7 #~~~~~u~...#     ← 葦 u(7,6)
//      8 #H~~Huu~..B#     ← 淵の灯 T3 H(8,1)・T2 H(8,4)・葦 u(8,5)(8,6)・宝箱 B(8,10)＝灯が全部点ると現れる
//      9 ############
//   （F は岸の角＝下は床。T1・T2・T3 と葦の下は水＝葦は剣で刈れない・燃やすことしかできない）
//   ・新しい規則（エンジン＝`game/projectile.js carryFireAt`）＝**灯ったかがり火を通った矢は火矢になる**＝
//     火の付いたブーメランと同じく、通ったセルの消えたかがり火を灯し・茂みを燃やす（貫通のまま壁まで飛ぶ）。
//   ・淵の灯3つは四方が水＝ロウソク（前方1マス）は届かない。葦も岸に接しない（岸との間に水が1マス）。
//   ・解き方（3射）＝①岸の火の東 (2,7) から西へ射る＝火矢が池を越えて T1 を灯す。
//     ②岸の火の北 (1,6) から南へ射る＝火矢が葦 (7,6) を燃やし、葦を伝って T2 が灯る（燃え広がり）。
//     ③南東の岸 (8,8) から西へ射る＝灯った T2 で火を拾い、T3 を灯す（T2 が点くまで行8 に火元は無い）。
//     全部灯ると宝箱（回復薬）が現れる。
//   ・ブーメラン（木＝届き ←↑4／→↓5）では火を運べても的まで届かない（下の ③ が全部の座で実測）。
//     銀・星のブーメラン（D5 の後）は届く＝後から手に入る道具で楽になる手（D8 `2,0` と同じ扱い）。
//   ・爆弾も大いが栗も使わない（混ぜ方＝直前の `3,2` が栗＋爆弾＋火）。敵なし。
//
// ■ 撤去したもの
//   宝箱 (2,5)（(8,10) へ移した・中身の回復薬は同じ）・木 (3,3)・茂み (6,8)。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水／宝の中身と出る条件／碑の本文／岸の火だけが初めから灯る／外周の口の形が不変
//   ・淵の灯と葦の隣に立てる床が無い（ロウソクが届かない）・葦は1かたまりで T2 に接し、T1・T3 に接しない
//   ・火の受け渡しを全部の座・4方向で総当たり：矢では全部灯る（3射・T3 は T2 の後）／木のブーメランでは1つも灯らない／
//     ロウソクでは1つも灯らない
//   ・敵なし・層の到達性が書き換え前と同じ
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-1-4-fire-arrow-pool.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-1-4-fire-arrow-pool.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { toolsUsableIn } from '../shared/progression.js';
import { bfsLayer } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const LAYER = 'dungeon_6';
export const ROOM  = '1,4';
export const ROWS = 10, COLS = 12;

// `~` は bgTiles の水（tiles 側は床 '.'）。H と u の下の水は WATER_UNDER で足す。
export const PLAN_ROWS = [
	'############',
	'#~~~~~....t#',
	'#H~~~~H....#',
	'#~~~~~~~..i#',
	'#~~~~~~~....',
	'#~~~~~~~....',
	'#~~~~~~~..t#',
	'#~~~~~u~...#',
	'#H~~Huu~..B#',
	'############',
];
export const SOURCE = '2,6';                       // 岸の火（初めから灯っている）
export const T1 = '2,1', T2 = '8,4', T3 = '8,1';   // 淵の灯（池の中）
export const REEDS = ['7,6', '8,5', '8,6'];
export const SEATS = { t1: '2,7', t2: '1,6', t3: '8,8' };   // 想定の射る座
export const CHEST = '8,10';
export const SIGN = '3,10';
export const MOUTH = ['4,11', '5,11'];
export const TARGET = PLAN_ROWS.map((row) => row.replace(/~/g, '.'));
export const WATER = [];
PLAN_ROWS.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
WATER.push(T1, T2, T3, ...REEDS);
export const CHEST_CONTENTS = { [CHEST]: { type: 'item', item: 'healPotion', name: '回復薬' } };
export const SHOW = { [CHEST]: { trigger: 'torchesLit', message: '{{torch}} 淵の 灯が すべて 点り、宝箱が 現れた！' } };
export const SIGN_DATA = {
	[SIGN]: {
		name: '火矢の 淵',
		lines: [
			'灯った 火を くぐった 矢は 火を 運ぶ。',
			'淵に 立つ 灯が すべて 点れば 箱が 現れる。',
		],
	},
};
// 木のブーメランの届き（セル数・←↑4／→↓5＝D7 `3,1` の実測・D6 `3,2` と同じ値）
export const WOOD_REACH = { neg: 4, pos: 5 };

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

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
	room.bgTiles = Object.fromEntries(WATER.map((k) => [k, '~']));
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
	room.showConditions = JSON.parse(JSON.stringify(SHOW));
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
	room.initLitTorches = [SOURCE];
	room.breakableWalls = {};
	room.floorItems = {};
	room.links = [];
	room.enemyDirs = {};
	delete room.enemyHold;
	delete room.enemyChase;
	delete room.enemiesRespawn;
	room.comment = '【キュー95 火矢の淵（2026-11-07）】灯ったかがり火を通った矢は火矢になる（ブーメランと同じく火を運ぶ・壁まで飛ぶ）。'
		+ '池の中の灯3つはロウソクもブーメランも届かない。岸の火越しに西へ射て T1、北から南へ射て葦を燃やし T2、'
		+ '南東の岸から灯った T2 越しに西へ射て T3＝全部灯ると宝箱（回復薬）。scripts/migrate-d6-1-4-fire-arrow-pool.mjs。';

	// ── ① 盤面と付帯データ ─────────────────────────────────────────────
	const t = room.tiles;
	const at = (k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	const water = new Set(Object.keys(room.bgTiles));
	const torches = [SOURCE, T1, T2, T3];
	check(`盤面が狙いどおり`, t.map(rowStr).join('\n') === TARGET.join('\n'));
	check(`水 ${water.size} マス（bgTiles）・淵の灯と葦の下は水・岸の火の下は床`, water.size === WATER.length
		&& [T1, T2, T3, ...REEDS].every((k) => water.has(k)) && !water.has(SOURCE));
	check(`かがり火は4つ（岸の火 ${SOURCE}＋淵の灯 ${T1} ${T2} ${T3}）・初めから灯るのは岸の火だけ`, count(TILE.TORCH) === 4
		&& torches.every((k) => at(k) === TILE.TORCH) && JSON.stringify(room.initLitTorches) === JSON.stringify([SOURCE]));
	check(`葦は ${REEDS.join(' ')} の3本だけ`, count(TILE.BUSH) === 3 && REEDS.every((k) => at(k) === TILE.BUSH));
	check(`宝箱 ${CHEST} は1つ・中身＝回復薬（書き換え前と同じ）・灯が全部点ると現れる`, count(TILE.CHEST) === 1 && at(CHEST) === TILE.CHEST
		&& JSON.stringify(room.chestContents) === JSON.stringify(CHEST_CONTENTS) && room.showConditions[CHEST]?.trigger === 'torchesLit');
	check(`碑 ${SIGN} に本文2行`, at(SIGN) === TILE.SIGN && count(TILE.SIGN) === 1 && room.signData[SIGN]?.lines?.length === 2);
	check(`敵・石・大いが栗・壊せる壁・踏み板・門・床の爆弾が無い`, !t.flat().some((ch) => ENEMY_META[ch] || ch === TILE.STONE
		|| ch === TILE.BURR || ch === TILE.BREAKABLE_WALL || ch === TILE.BUTTON || ch === TILE.GATE || ch === TILE.ITEM_BOMB));

	// ── ② 立てる床・ロウソクが届かない ─────────────────────────────────────
	const standable = (r, c) => r > 0 && c > 0 && r < ROWS - 1 && c < COLS - 1 && !water.has(`${r},${c}`)
		&& (t[r][c] === TILE.FLOOR || t[r][c] === TILE.CHEST);
	const floor = new Set();
	{
		const q = [];
		for (const k of MOUTH) { const [r, c] = k.split(',').map(Number); floor.add(k); q.push([r, c - 1]); }
		while (q.length) {
			const [r, c] = q.shift();
			const k = `${r},${c}`;
			if (floor.has(k) || !standable(r, c)) continue;
			floor.add(k);
			for (const [dr, dc] of DIRS) q.push([r + dr, c + dc]);
		}
		for (const k of MOUTH) floor.delete(k);
	}
	const landCount = t.flat().filter((ch, i) => (ch === TILE.FLOOR || ch === TILE.CHEST) && !water.has(`${Math.floor(i / COLS)},${i % COLS}`)).length - MOUTH.length;
	check(`岸の床は全部、東の口から歩いてつながる（${floor.size} マス）`, floor.size === landCount);
	check(`想定の射る座 ${Object.values(SEATS).join(' ')} と宝箱に歩いて届く`, Object.values(SEATS).every((k) => floor.has(k)) && floor.has(CHEST));
	const nbrs = (k) => { const [r, c] = k.split(',').map(Number); return DIRS.map(([dr, dc]) => `${r + dr},${c + dc}`); };
	for (const k of [T1, T2, T3, ...REEDS]) check(`${at(k) === TILE.TORCH ? '淵の灯' : '葦'} ${k} の隣に立てる床が無い（ロウソクが届かない）`, nbrs(k).every((n) => !floor.has(n)));
	check(`葦は1かたまりで T2 ${T2} に接し、T1・T3 に接しない`, REEDS.every((k) => nbrs(k).some((n) => REEDS.includes(n) || n === T2) || k === REEDS[0])
		&& REEDS.some((k) => nbrs(k).includes(T2)) && REEDS.every((k) => !nbrs(k).includes(T1) && !nbrs(k).includes(T3)));

	// ── ③ 火の受け渡しを総当たり（矢／木のブーメラン／ロウソク） ──────────────
	// 状態＝灯ったかがり火の集合＋燃えた葦。手＝立てる床の全部 × 4方向（ロウソクは前方1マス）。
	// 矢＝壁まで飛び、点いた火を通った後のセルにだけ火を運ぶ（戻らない）。
	// ブーメラン＝届き（←↑4／→↓5）まで飛んで同じ道を戻る＝届きの中に点いた火があれば届きの中を全部（往きに通った所も）。
	// 燃えた葦は縦横につながった葦と消えたかがり火へ燃え移る（spreadFireFrom）。
	const projStop = (r, c) => t[r]?.[c] == null || t[r][c] === TILE.WALL || t[r][c] === TILE.BREAKABLE_WALL;
	const burn = (lit, burned, k) => {
		const q = [k];
		while (q.length) {
			const x = q.shift();
			if (at(x) === TILE.BUSH) { if (burned.has(x)) continue; burned.add(x); for (const n of nbrs(x)) q.push(n); }
			else if (at(x) === TILE.TORCH) lit.add(x);
		}
	};
	const shoot = (lit, burned, seat, [dr, dc], kind) => {
		const [sr, sc] = seat.split(',').map(Number);
		const reach = kind === 'arrow' ? 99 : (dr < 0 || dc < 0 ? WOOD_REACH.neg : WOOD_REACH.pos);
		const line = [];
		for (let k = 1; k <= reach; k++) { const r = sr + dr * k, c = sc + dc * k; if (projStop(r, c)) break; line.push(`${r},${c}`); }
		const nl = new Set(lit), nb = new Set(burned);
		if (kind === 'arrow') {
			let flaming = false;
			for (const x of line) {
				if (at(x) === TILE.TORCH) { if (nl.has(x)) flaming = true; else if (flaming) nl.add(x); }
				else if (flaming && at(x) === TILE.BUSH) burn(nl, nb, x);
			}
		} else if (line.some((x) => at(x) === TILE.TORCH && nl.has(x))) {
			for (const x of line) { if (at(x) === TILE.TORCH) nl.add(x); else if (at(x) === TILE.BUSH) burn(nl, nb, x); }
		}
		return [nl, nb];
	};
	const candle = (lit, burned, seat, [dr, dc]) => {
		const [sr, sc] = seat.split(',').map(Number);
		const k = `${sr + dr},${sc + dc}`;
		const nl = new Set(lit), nb = new Set(burned);
		if (at(k) === TILE.TORCH) nl.add(k); else if (at(k) === TILE.BUSH) burn(nl, nb, k);
		return [nl, nb];
	};
	// BFS（最短手数）＝手は「どこかの座から1射」。歩く手数は数えない。
	const solve = (kinds) => {
		const enc = (l, b) => [...l].sort().join(';') + '|' + [...b].sort().join(';');
		const start = [new Set([SOURCE]), new Set()];
		const seen = new Map([[enc(...start), []]]);
		const q = [start];
		let best = null; const allLit = new Set();
		while (q.length) {
			const [l, b] = q.shift();
			const path = seen.get(enc(l, b));
			for (const x of l) allLit.add(x);
			if (torches.every((x) => l.has(x))) { best = best ?? path; continue; }
			for (const seat of floor) for (const d of DIRS) for (const kind of kinds) {
				const [nl, nb] = kind === 'candle' ? candle(l, b, seat, d) : shoot(l, b, seat, d, kind);
				const e = enc(nl, nb);
				if (seen.has(e)) continue;
				seen.set(e, [...path, `${kind}@${seat}${d.join(',')}`]);
				q.push([nl, nb]);
			}
		}
		return { best, allLit };
	};
	{
		const arrow = solve(['arrow']);
		check(`矢だけで淵の灯が全部点く・最短 3 射（${arrow.best?.join(' → ') ?? '解なし'}）`, arrow.best?.length === 3);
		const boom = solve(['boomerang', 'candle']);
		const extra = [...boom.allLit].filter((x) => x !== SOURCE);
		check(`木のブーメラン＋ロウソクでは淵の灯が1つも点かない（点いた ${extra.join(' ') || 'なし'}）`, extra.length === 0);
		// T3 は T2 の後：T2 を消したままにした盤面（行8 の火元を除く）では矢でも T3 が点かない
		{
			let l = new Set([SOURCE]), b = new Set();
			[l, b] = shoot(l, b, SEATS.t1, [0, -1], 'arrow');
			check(`①岸の火の東 ${SEATS.t1} から西へ射ると T1 が点く`, l.has(T1) && !l.has(T2) && !l.has(T3));
			const [l3] = shoot(l, b, SEATS.t3, [0, -1], 'arrow');
			check(`対照：T2 が消えている間に ${SEATS.t3} から西へ射ても T3 は点かない（行8 に火元が無い）`, !l3.has(T3));
			[l, b] = shoot(l, b, SEATS.t2, [1, 0], 'arrow');
			check(`②岸の火の北 ${SEATS.t2} から南へ射ると葦が燃えて T2 が点く`, l.has(T2) && REEDS.every((k) => b.has(k)) && !l.has(T3));
			[l, b] = shoot(l, b, SEATS.t3, [0, -1], 'arrow');
			check(`③${SEATS.t3} から西へ射ると灯った T2 越しに T3 が点く`, l.has(T3));
		}
		const tools = toolsUsableIn(data)[LAYER] ?? new Set();
		check(`D6 で弓・ブーメラン・ロウソクが使える（toolsUsableIn）`, tools.has('bow') && tools.has('boomerang') && tools.has('candle'));
	}

	// ── ④ 層の到達性は不変 ───────────────────────────────────────────────
	{
		const closed = layerRun();
		const open = layerRunOpen();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, same(closed.reachedRooms, baseClosed.reachedRooms));
		check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, same(open.reachedRooms, baseOpen.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：薄い部屋を「火矢の淵」に作り替える（キュー95 の8室目）`);
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
