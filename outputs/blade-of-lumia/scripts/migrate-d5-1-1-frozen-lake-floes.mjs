// dungeon_5 `1,1`（石碑が湖を語る部屋）：D4 の写しの部屋を「凍れる湖の浮氷」に作り替える
// （2026-10-05 / PLAN 実行キュー 40 の第1陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 #####..#####     ← 北の口（鍵の部屋 `1,0`＝ボスへの本筋）
//      1 #..†.......#     ← 石碑「凍れる湖に橋を架けよ。はしごを使え。」
//      2 #..........#
//      3 #~~~~~~~~~~#     ← bgTiles の水が1本の帯（幅1）＝はしごで1回渡るだけ
//      4 ...........#     ← 西の口（`0,1`＝鉄の盾の宝箱）
//      5 ...........#
//      6〜8 #..........#
//      9 #####..#####     ← 南の口（はしごの部屋 `1,2`）
//   石碑の本文が湖を語っているのに、湖は無く水の帯が1本あるだけ（D4 の `1,1`＝かがり火の間の写し）。
//
// ■ 新しい `1,1`＝凍れる湖の浮氷（D5 の主題「水路とはしご」の応用）
//      0 #####..#####
//      1 #~~~~..~~~~#     ← 北の岸（本筋）
//      2 #~~~~.~.~~~#     ← 浮氷 (2,7) → 岸の張り出し (2,5)
//      3 #~~~~~~~~~~#
//      4 ..~.~~~.~.~#     ← 西の岸 (4,1)(5,1)・浮氷 (4,3)(4,7)(4,9)
//      5 ..~~~.~~~~~#     ← おとりの浮氷 (5,5)＝南の岸から幅2＝渡れない
//      6 #~~.~~~~~.~#     ← 浮氷 (6,3)(6,9)
//      7 #~~~~~~~~~~#
//      8 #†.........#     ← 南の岸・石碑（本文はそのまま・湖を見渡す岸へ移した）
//      9 #####..#####
//   ・湖の中の陸は1マスの浮氷だけ。はしごは「陸→水1枚→陸」を同じ向きで渡る＝浮氷どうしの
//     並び（縦か横に1枚あけて並んでいるか）を読んで道を作る。
//   ・本筋（北）＝南の岸の東端から (6,9)→(4,9)→(4,7)→(2,7)→(2,5)＝5回渡る（上・上・左・上・左）。
//     寄道（西＝鉄の盾）＝南の岸の西から (6,3)→(4,3)→(4,1)＝3回渡る。二つの道は湖の中で交わらない。
//   ・入ってすぐ正面の浮氷 (5,5) は幅2の水の向こう＝はしごでも届かない（入口 `1,3` の行4 の再演）。
//   ・湖に魚群 `&` を5体（脅威度 10.0）。浮氷の上では四方が水＝四方から寄られる（魚群の設計どおり
//     「狭い足場を水から包囲する」）。岸では片側からしか来ない。魚群は渡りの水に居座ると
//     はしごを塞ぐ（敵と重なれない）＝浮氷の上から斬って退かしてから渡る。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・はしごの有無・門の開閉どちらでも、到達できる部屋は書き換え前と同じ
//     （`1,1` へははしごの部屋 `1,2` の水路を渡らないと入れない＝はしご無しの到達室に元々入っていない）。
//
// 使い方:
//   node scripts/migrate-d5-1-1-frozen-lake-floes.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-1-1-frozen-lake-floes.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';
import { THREAT_OF, EXTRA_ENEMY_ROOMS, SIGNATURE_LADDER } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '1,1';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ。水は bgTiles の行3） ─────
const ORIGINAL = [
	'#####..#####',
	'#..†.......#',
	'#..........#',
	'#..........#',
	'...........#',
	'...........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const ORIGINAL_BG = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`3,${i + 1}`, TILE.WATER]));

// ── 狙いの盤面（`~` は bgTiles の水・tiles 層では床。敵の文字は tiles 層に置く） ─────
export const WATER_MAP = [
	'#####..#####',
	'#~~~~..~~~~#',
	'#~~~~.~.~~~#',
	'#~~~~~~~~~~#',
	'..~.~~~.~.~#',
	'..~~~.~~~~~#',
	'#~~.~~~~~.~#',
	'#~~~~~~~~~~#',
	'#†.........#',
	'#####..#####',
];
export const ENEMIES = Object.fromEntries(['2,3', '3,6', '5,8', '6,6', '7,4'].map((k) => [k, TILE.FISH_SCHOOL]));
export const TARGET = WATER_MAP.map((row, r) => [...row].map((ch, c) => ENEMIES[`${r},${c}`] ?? (ch === '~' ? '.' : ch)).join(''));
export const WATER = WATER_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '~' ? [`${r},${c}`] : [])));
export const EXITS = { north: ['0,5', '0,6'], south: ['9,5', '9,6'], west: ['4,0', '5,0'] };
export const ENTRY = '8,5';    // 南の口の内側（はしごの部屋 `1,2` から来たときの最初の床）
export const MONUMENT = '8,1';
export const DECOY = '5,5';    // 入ってすぐ正面の浮氷＝幅2の水の向こう
// 本筋と寄道の渡り方（陸 → 水 → 陸の「渡った先」の並び）。番人も import する。
export const NORTH_ROUTE = ['6,9', '4,9', '4,7', '2,7', '2,5'];
export const WEST_ROUTE = ['6,3', '4,3', '4,1'];
const SIGN = { name: '氷の廃墟の石碑', lines: ['「凍れる湖に橋を架けよ。はしごを使え。」'] };

// ── 歩行の到達（番人も import する） ─────────────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
// 水を tiles 層へ畳み込んだ実効の盤面（`connectivity.mjs cellTile` と同じ考え＝bgTiles の水も水）。
export const effective = () => WATER_MAP.map((row) => [...row]);
// from から歩けるセル。withLadder なら幅 1 の水を、進む向きの先が地上のときだけ 1 マス渡る
// ＝`game/passable.js isLadderCrossable`。返り値は Map(セル → 渡った水の最少枚数)。
export function reach(t, { withLadder = false, from = ENTRY } = {}) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const cost = new Map([[from, 0]]);
	const dq = [from];
	while (dq.length) {
		const k = dq.shift();
		const [r, c] = P(k);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc)) continue;
			if (!blocked(nr, nc)) {
				const nCost = cost.get(k);
				if (!cost.has(nk) || cost.get(nk) > nCost) { cost.set(nk, nCost); dq.unshift(nk); }
				continue;
			}
			const fr = nr + dr, fc = nc + dc, fk = `${fr},${fc}`;
			if (withLadder && LADDER_OVER.has(t[nr][nc]) && inside(fr, fc) && !blocked(fr, fc)) {
				const nCost = cost.get(k) + 1;
				if (!cost.has(fk) || cost.get(fk) > nCost) { cost.set(fk, nCost); dq.push(fk); }
			}
		}
	}
	return cost;
}
// 湖の中の陸（浮氷）＝岸（外周に接する陸のかたまり）以外の床。
export function floes(t) {
	const out = [];
	for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
		if (BLOCKED.has(t[r][c])) continue;
		const land = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => !BLOCKED.has(t[r + dr][c + dc]));
		if (land.length === 0) out.push(`${r},${c}`);
	}
	return out;
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);
	const signNow = Object.values(room.signData ?? {});
	if (signNow.length !== 1 || JSON.stringify(signNow[0]) !== JSON.stringify(SIGN)) die(`${ROOM} の石碑の本文が想定と違う`);

	const START = { stage: '1,3', row: 7, col: 2 };
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		ladder: bfsLayer(stages, START, { withLadder: true, openTiles: OPEN }),
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: true, openTiles: null }),
	});
	// 基準は書き換え前の盤面で測る＝適用済みの地図に再実行しても同じ（冪等）。
	const before = room.tiles.map(rowStr);
	const saved = { tiles: room.tiles, bgTiles: room.bgTiles };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	room.bgTiles = { ...ORIGINAL_BG };
	const base = runs();
	room.tiles = saved.tiles;
	room.bgTiles = saved.bgTiles;

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => row.split(''));   // [[field-tiles-are-char-arrays]]
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	const wantBg = Object.fromEntries(WATER.map((k) => [k, TILE.WATER]));
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚`);
	}
	if (JSON.stringify(room.signData) !== JSON.stringify({ [MONUMENT]: SIGN })) {
		room.signData = { [MONUMENT]: { ...SIGN, lines: [...SIGN.lines] } };
		log.push(`  ${ROOM}: 石碑を ${MONUMENT}（南の岸）へ移した（本文は同じ）`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const tl = room.tiles.map((r) => [...r]);
	const t = effective();
	const at = (g, k) => { const [r, c] = P(k); return g[r]?.[c]; };
	const cellsOf = (g, pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(g[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	check(`tiles 層に水 ~ を書いていない（水は bgTiles の単一ソース）`, cellsOf(tl, (ch) => ch === TILE.WATER).length === 0);
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		check(`画面の縁で開いているのは北・南・西の口だけ＝書き換え前と同じ（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(Object.values(EXITS).flat().sort()));
	}
	check(`石碑は ${MONUMENT} の1枚・本文は書き換え前と同じ`,
		JSON.stringify(cellsOf(tl, (ch) => ch === TILE.MONUMENT)) === JSON.stringify([MONUMENT])
		&& JSON.stringify(room.signData) === JSON.stringify({ [MONUMENT]: SIGN }));
	check(`宝箱・石・門・座・看板・壊せる壁・床の道具が無い（通り道）`,
		cellsOf(tl, (ch) => [TILE.CHEST, TILE.STONE, TILE.GATE, TILE.SWITCH, TILE.BUTTON, TILE.SIGN, TILE.TORCH, TILE.BREAKABLE_WALL, TILE.TIDE_GATE].includes(ch)).length === 0
		&& Object.keys(room.chestContents ?? {}).length === 0 && Object.keys(room.floorItems ?? {}).length === 0
		&& Object.keys(room.showConditions ?? {}).length === 0 && (room.links ?? []).length === 0);
	{
		const found = Object.fromEntries(cellsOf(tl, (ch) => !!ENEMY_META[ch]).map((k) => [k, at(tl, k)]));
		check(`敵は魚群 & の5体（${Object.keys(ENEMIES).join(' ')}）`, Object.keys(found).length === 5 && Object.entries(ENEMIES).every(([k, ch]) => found[k] === ch));
		check(`魚群はすべて水の上`, Object.keys(ENEMIES).every((k) => WATER.includes(k) && ENEMY_META[TILE.FISH_SCHOOL].move === 'water'));
		const threat = Object.values(ENEMIES).reduce((s, ch) => s + THREAT_OF(ENEMY_META[ch]), 0);
		const sig = SIGNATURE_LADDER.find((e) => e.layer === LAYER);
		const sigRoom = stages[sig.stage].tiles.map(rowStr).join('');
		const sigThreat = [...sigRoom].reduce((s, ch) => s + (ENEMY_META[ch] && !ENEMY_META[ch].isBoss ? THREAT_OF(ENEMY_META[ch]) : 0), 0);
		check(`脅威度 ${threat.toFixed(1)}＝D5 の看板部屋 ${sig.stage}（${sigThreat.toFixed(1)}）より軽い`, threat === 10 && threat < sigThreat);
		check(`EXTRA_ENEMY_ROOMS に宣言がある`, EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
		// 魚群の泳げる水はひと続き（どの浮氷にも寄って来られる）
		const water = new Set(WATER);
		const seen = new Set(['3,6']); const q = ['3,6'];
		while (q.length) {
			const [r, c] = P(q.shift());
			for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
				const nk = `${r + dr},${c + dc}`;
				if (water.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
			}
		}
		check(`湖の水はひと続き（${seen.size}/${WATER.length} 枚）`, seen.size === WATER.length);
	}

	// ── ② 浮氷とはしご ───────────────────────────────────────────────
	{
		const fl = floes(t);
		check(`浮氷（四方が水の陸）は ${fl.length} 枚＝道の 6 枚＋おとり 1 枚`,
			JSON.stringify(fl.sort()) === JSON.stringify(['2,7', '4,3', '4,7', '4,9', '5,5', '6,3', '6,9'].sort()));
		const foot = reach(t);
		check(`はしご無しでは南の岸から出られない（北・西の口に届かない・歩ける ${foot.size} マス）`,
			[...EXITS.north, ...EXITS.west].every((k) => !foot.has(k)));
		const ladder = reach(t, { withLadder: true });
		check(`はしごで北の口へ＝5回渡る（実測 ${ladder.get('0,5')}）`, ladder.get('0,5') === 5);
		check(`はしごで西の口へ＝3回渡る（実測 ${ladder.get('4,0')}）`, ladder.get('4,0') === 3);
		check(`本筋の道の各浮氷が、南の岸から 1,2,3,4,5 回目に着く所`, NORTH_ROUTE.every((k, i) => ladder.get(k) === i + 1));
		check(`寄道の道の各浮氷が、南の岸から 1,2,3 回目に着く所`, WEST_ROUTE.every((k, i) => ladder.get(k) === i + 1));
		check(`おとり ${DECOY} は、はしごでも届かない`, !ladder.has(DECOY));
		{
			const [r, c] = P(DECOY);
			check(`おとりと南の岸の間は幅2の水（${r + 1},${c}）（${r + 2},${c}）`, LADDER_OVER.has(t[r + 1][c]) && LADDER_OVER.has(t[r + 2][c]) && !BLOCKED.has(t[r + 3][c]));
		}
		// 二つの道は湖の中で交わらない＝北の岸から西の口へは南の岸へ戻らないと行けない
		const northFrom = reach(t, { withLadder: true, from: '1,5' });
		check(`北の岸から西の口へ＝南の岸を経由して 8 回（実測 ${northFrom.get('4,0')}）`, northFrom.get('4,0') === 8);
		const floors = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => k !== DECOY);
		check(`おとり以外の床のどのセルにも、はしごを使えば立てる（${floors.length} マス）`, floors.every((k) => ladder.has(k)));
		// 対照①＝本筋の浮氷を1枚でも水にすると北の口に届かない（どれも要る）
		for (const k of NORTH_ROUTE.slice(0, 4)) {
			const g = effective(); const [r, c] = P(k); g[r][c] = TILE.WATER;
			check(`対照：浮氷 ${k} を水にすると、はしごでも北の口に届かない`, !reach(g, { withLadder: true }).has('0,5'));
		}
		// 対照②＝おとりの下 (6,5) を床にすると届く（幅2 だから届かない）
		const g2 = effective(); g2[6][5] = TILE.FLOOR;
		check(`対照：(6,5) を床にすると、おとり ${DECOY} に届く`, reach(g2, { withLadder: true }).has(DECOY));
		// 対照③＝潰すのは必ず '#'（[[blade-control-experiment-needs-tile-wall]]）
		const g3 = effective(); g3[4][2] = TILE.WALL;
		check(`対照：(4,2) を壁にすると、はしごでも西の口に届かない`, !reach(g3, { withLadder: true }).has('4,0'));
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`はしごあり・錠を全部開けた到達室が書き換え前と同じ（${now.ladder.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`はしごあり・門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`はしご無しの到達室が書き換え前と同じ（${now.foot.reachedRooms.size} 室・${ROOM} は元々入らない）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms) && !now.foot.reachedRooms.has(ROOM));
		check(`レイヤーの dead-edge が 0（実測 ${now.ladder.deadEdges.length}）`, now.ladder.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：石碑が湖を語る部屋を「凍れる湖の浮氷」に作り替える（キュー40 第1陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}・水は bgTiles）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}   ${WATER_MAP[i]}`);
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
