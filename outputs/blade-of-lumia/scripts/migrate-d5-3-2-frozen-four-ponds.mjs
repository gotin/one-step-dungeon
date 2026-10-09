// dungeon_5 `3,2`（通り道＝北の `3,1`・南の `3,3`・西の `2,2`・東の `4,2` をつなぐ十字路・地図の部屋）：
// D4 の写しの部屋を「凍れる四つ池の辻」に作り替える（2026-10-09 / PLAN 実行キュー 40 の第3陣 3室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 #####..#####
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 ......m.....
//      5 ............
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   D4 `3,2` と同じ四角い広間の真ん中に地図 `m` が落ちているだけ。敵も水も氷も無い。
//
// ■ 新しい `3,2`＝凍れる四つ池の辻（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし）
//   （'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵の文字は tiles 層に置く）
//      0 #####..#####     ← 北の口（列5-6）
//      1 #&~~~~k~~~&#
//      2 #~~&~~k~&~~#
//      3 #&~~~~k~~~&#
//      4 .kkkkkmkkkk.     ← 西・東の口（行4-5）・地図 m (4,6) は書き換え前と同じセル＝十字の交わり
//      5 .~~~~~k~~~~.
//      6 #&~~~~k~~~&#
//      7 #~~&~~k~&~~#
//      8 #&~~~~k~~~&#
//      9 #####..#####     ← 南の口（列5-6）
//   （& は魚群＝tiles 層の敵。下地は水）
//   隣の四つ辻 `2,2`（真ん中が湖・岸が外周を巡る）の裏返し＝真ん中が幅1の十字の氷の堤で、四隅が4つの池。
//   ・見せ場＝**堤は両側が池＝歩くと左右の池から魚群が群がって並走してくる**。魚群は陸に上がれないが、
//     堤の脇の水へ素早く寄って来て体当たりする。堤の上で群れから離れられる床は十字の交わり (4,6) だけ。
//   ・池は4つとも別々の水＝魚群は自分の池の縁しか追えない。堤の腕を進むと、両側の池の群れが寄って来る。
//   ・地図は十字の交わり（書き換え前と同じ (4,6)）＝群れの届かない1マスで拾う。
//   ・答え＝①駆け抜ける ②寄って来た群れを堤から斬る（魚群は1振りで倒れる雑魚）。倒すことは必須でない。
//     魚群の体当たりは1点ずつで、何体寄っても被弾の無敵時間で頭打ち＝重い部屋ではない（看板部屋 2,3 の前の息継ぎ）。
//   ・幅2の道（叩き台の初版）は捨てた＝内側の列が水から2マス離れていて、魚群が1度も届かなかった
//     （駆け抜け・立ち止まりとも被弾 0＝見せ場が起きない）。
//   ・水棲の敵は 5.5m の配置表の外＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//   ・`2,2`・`2,1`（潜み鮫・射水魚＝離れていても撃たれる）とは敵の種類が違う＝魚群は飛び道具を持たない
//     ＝池から離れれば安全・縁に立てば囲まれる（`1,1` の浮氷の語彙を、はしごの要らない通り道で再演する）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水と氷は bgTiles だけ／4つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は魚群だけ・どれも水の上・脅威度（看板部屋 2,3 の 76.0 より軽い）・宣言あり
//   ・地図 m が書き換え前と同じセル／宝箱・看板・床の拾い物が無い
//   ・4つの口が道具なしで互いに歩ける／はしごで歩ける床が増えない／取り残された床が無い
//   ・池は4つ・どれもひと続きで互いにつながらない・各池に魚群がいる
//   ・堤は交わりを除いてどの床も両側が池（2つの池に接する）／交わりはどの池にも接しない
//   ・層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-3-2-frozen-four-ponds.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-3-2-frozen-four-ponds.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED, LADDER_OVER } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_5';
const ROOM  = '3,2';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'......m.....',
	'............',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水＝どちらも bgTiles。tiles 層では床。敵・地図の文字は tiles 層に置く）──
export const GROUND_MAP = [
	'#####..#####',
	'#~~~~~k~~~~#',
	'#~~~~~k~~~~#',
	'#~~~~~k~~~~#',
	'.kkkkkkkkkk.',
	'.~~~~~k~~~~.',
	'#~~~~~k~~~~#',
	'#~~~~~k~~~~#',
	'#~~~~~k~~~~#',
	'#####..#####',
];
const F = TILE.FISH_SCHOOL;
export const ENEMIES = {
	'1,1': F, '2,3': F, '3,1': F,        // 北西の池
	'1,10': F, '2,8': F, '3,10': F,      // 北東の池
	'6,1': F, '7,3': F, '8,1': F,        // 南西の池
	'6,10': F, '7,8': F, '8,10': F,      // 南東の池
};
export const MAP_CELL = '4,6';
export const TARGET = GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	ENEMIES[`${r},${c}`] ?? (`${r},${c}` === MAP_CELL ? TILE.ITEM_DUNGEON_MAP
		: (ch === TILE.WATER || ch === TILE.ICE ? TILE.FLOOR : ch))).join(''));
const cellsWhere = (pred) => GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsWhere((ch) => ch === TILE.WATER);
export const ICE = cellsWhere((ch) => ch === TILE.ICE);
export const EXITS = { 北: ['0,5', '0,6'], 南: ['9,5', '9,6'], 西: ['4,0', '5,0'], 東: ['4,11', '5,11'] };
// 十字の交わり（どの池にも接しない1マス＝地図のセル）。
export const HUB = ['4,6'];
const EXPECT_THREAT = 24.0;
const COMMENT = '【キュー40 凍れる四つ池の辻（2026-10-09）】幅1の十字の氷の堤が4つの口をつなぎ、四隅は4つの池。'
	+ '各池に魚群が3体ずつ棲み、陸に上がれないが堤の脇の水へ素早く寄って体当たりする。'
	+ '堤は両側が池＝歩くと左右から群れが並走してくる。群れの届かないのは十字の交わりだけ（地図はそこに落ちている）。'
	+ '池は別々の水＝群れは自分の池の縁しか追えない。'
	+ '答え＝駆け抜ける／寄って来た群れを道から斬る。報酬なしの通り道。'
	+ '盤面は scripts/migrate-d5-3-2-frozen-four-ponds.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// 水を tiles 層へ畳み込んだ実効の盤面（`connectivity.mjs cellTile` と同じ考え＝bgTiles の水も水）。
// 氷は歩ける地面＝床として扱う。
export const effective = () => GROUND_MAP.map((row) => [...row].map((ch) => (ch === TILE.ICE ? TILE.FLOOR : ch)));
// from から歩けるセル。withLadder なら幅 1 の水を、進む向きの先が地上のときだけ 1 マス渡る
// ＝`game/passable.js isLadderCrossable`。
export function walkable(t, from, withLadder = false) {
	const blocked = (r, c) => BLOCKED.has(t[r][c]);
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of DIRS4) {
			const nr = r + dr, nc = c + dc;
			if (!inside(nr, nc)) continue;
			let to = null;
			if (!blocked(nr, nc)) to = `${nr},${nc}`;
			else if (withLadder && LADDER_OVER.has(t[nr][nc]) && inside(nr + dr, nc + dc) && !blocked(nr + dr, nc + dc)) to = `${nr + dr},${nc + dc}`;
			if (to && !seen.has(to)) { seen.add(to); q.push(to); }
		}
	}
	return seen;
}
// 水のひと続き（池）を返す＝魚群が泳げる範囲。
export function ponds() {
	const water = new Set(WATER);
	const seen = new Set();
	const out = [];
	for (const k of WATER) {
		if (seen.has(k)) continue;
		const body = [];
		const q = [k];
		seen.add(k);
		while (q.length) {
			const cur = q.shift();
			body.push(cur);
			const [r, c] = P(cur);
			for (const [dr, dc] of DIRS4) {
				const n = `${r + dr},${c + dc}`;
				if (water.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
			}
		}
		out.push(body);
	}
	return out;
}
// 床 k が接している（四方のどれかが水の）池の数。
export const pondsTouching = (k) => {
	const [r, c] = P(k);
	return ponds().filter((b) => DIRS4.some(([dr, dc]) => b.includes(`${r + dr},${c + dc}`))).length;
};

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

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の着地セル
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
	room.bgTiles = {};
	const base = runs();
	room.tiles = saved.tiles;
	room.bgTiles = saved.bgTiles;
	const baseLinks = JSON.stringify(room.links ?? []);

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え ───────────────────────────────────────────────────
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);   // [[field-tiles-are-char-arrays]]
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	const wantBg = Object.fromEntries(GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) =>
		(ch === TILE.WATER || ch === TILE.ICE ? [[`${r},${c}`, ch]] : []))));
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚・氷 ${ICE.length} 枚`);
	}
	if (room.comment !== COMMENT) {
		room.comment = COMMENT;
		log.push(`  ${ROOM}: comment を書き換えた`);
	}
	room.links ??= [];
	room.signData ??= {};
	room.npcData ??= {};
	room.chestContents ??= {};
	room.floorItems ??= {};

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
	check(`tiles 層に水・氷を書いていない（どちらも bgTiles の単一ソース）`,
		cellsOf(tl, (ch) => ch === TILE.WATER || ch === TILE.ICE).length === 0);
	check(`bgTiles＝水 ${WATER.length} 枚・氷 ${ICE.length} 枚だけ`, JSON.stringify(room.bgTiles) === JSON.stringify(wantBg));
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`${name}の口（${cells.join(' ')}）が開いている（床・氷なし）`,
			cells.every((k) => at(tl, k) === TILE.FLOOR && !room.bgTiles[k]));
	}
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは4つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = {};
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = tl[r][c];
			if (ENEMY_META[ch]) enemies[`${r},${c}`] = ch;
		}
		check(`敵は魚群 &×${Object.keys(ENEMIES).length} だけ（実測 ${Object.keys(enemies).length} 体）`,
			JSON.stringify(Object.entries(enemies).sort()) === JSON.stringify(Object.entries(ENEMIES).sort()));
		check(`どれも水棲（move:'water'）で、水の上に置かれている`,
			Object.entries(ENEMIES).every(([k, ch]) => ENEMY_META[ch].move === 'water' && WATER.includes(k)));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝看板部屋 2,3（76.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`地図 m が書き換え前と同じセル ${MAP_CELL} に1つだけ`,
		JSON.stringify(cellsOf(tl, (ch) => ch === TILE.ITEM_DUNGEON_MAP)) === JSON.stringify([MAP_CELL])
		&& ORIGINAL[P(MAP_CELL)[0]][P(MAP_CELL)[1]] === TILE.ITEM_DUNGEON_MAP);
	check(`宝箱・看板・本文・床の拾い物・回復薬が無い（報酬なしの通り道）`,
		cellsOf(tl, (ch) => ch === TILE.CHEST || ch === TILE.SIGN || ch === TILE.ITEM_HEAL_POTION).length === 0
		&& Object.keys(room.chestContents).length === 0 && Object.keys(room.floorItems).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0);
	check(`石・植生が無い`, cellsOf(tl, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・showConditions が空・enemyDirs が空`,
		JSON.stringify(room.links) === baseLinks
		&& Object.keys(room.showConditions ?? {}).length === 0 && Object.keys(room.enemyDirs ?? {}).length === 0);

	// ── ② 歩ける範囲 ──────────────────────────────────────────────
	const foot = walkable(t, EXITS.南[0]);
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`道具なしで南の口から${name}の口へ歩ける`, cells.every((k) => foot.has(k)));
	}
	{
		const ladder = walkable(t, EXITS.南[0], true);
		check(`はしごがあっても歩ける床が増えない（${foot.size} マス）`, foot.size === ladder.size);
		const stranded = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => !foot.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}

	// ── ③ 池と十字の道 ────────────────────────────────────────────
	{
		const bodies = ponds();
		check(`池は4つ（実測 ${bodies.length}）＝互いにつながらない`, bodies.length === 4);
		check(`各池に魚群が3体ずつ`,
			bodies.every((b) => Object.keys(ENEMIES).filter((k) => b.includes(k)).length === 3));
		const road = [...foot].filter((k) => { const [r] = P(k); return r >= 1 && r <= 8; })
			.filter((k) => { const [, c] = P(k); return c >= 1 && c <= 10; });
		const exposed = road.filter((k) => !HUB.includes(k));
		const bare = exposed.filter((k) => pondsTouching(k) !== 2);
		check(`堤は交わりを除いてどの床も両側が池＝2つの池に接する（${exposed.length} マス・外れ ${bare.join(' ') || 'なし'}）`,
			exposed.length === 16 && bare.length === 0);
		check(`交わり（${HUB.join(' ')}）はどの池にも接しない`, HUB.every((k) => foot.has(k) && pondsTouching(k) === 0));
		check(`地図 ${MAP_CELL} は交わりの中`, HUB.includes(MAP_CELL));
	}

	// ── ④ 層の到達性は不変 ─────────────────────────────────────────
	{
		const now = runs();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`はしごありの到達室が書き換え前と同じ（${now.ladder.reachedRooms.size} 室）`, same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`徒歩の到達室が書き換え前と同じ（${now.foot.reachedRooms.size} 室）`, same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`, same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.closed.deadEdges.length}）`, now.closed.deadEdges.length === 0);
	}

	// ── 出力 ───────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：通り道を「凍れる四つ池の辻」に作り替える（キュー40 第3陣 3室目）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}   ${GROUND_MAP[i]}`);
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
