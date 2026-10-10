// dungeon_5 `0,1`（通り道＝東の `1,1`・南の `0,2` をつなぐ・鉄の盾の部屋）：
// D4 の写しの部屋を「凍れる祠の番鮫」に作り替える（2026-10-10 / PLAN 実行キュー 40 の第3陣 6室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー40 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 #.....B.....
//      5 #...........
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 #####..#####
//   D4 `0,1` と同じ四角い広間の真ん中に、鉄の盾の宝箱 `B(4,6)` が置いてあるだけ。敵も水も氷も無い。
//   鉄の盾＝ゲームで最初の「跳ね返す盾」（reflect 0.5）なのに、入ってすぐ開けられる。
//
// ■ 新しい `0,1`＝凍れる祠の番鮫（地形＋敵だけの通り道＝キュー39 のユーザー判定どおり謎・報酬なし。
//   鉄の盾の宝箱は残す＝第3陣の作法）
//   （'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。tiles 層では床。敵・宝箱の文字は tiles 層に置く）
//      0 ############
//      1 #~kkkkkkkkk#
//      2 #~kkkkkkkkk#
//      3 #~#######kk#
//      4 #~#.~~~~<kk.    ← 祠の池（行4-6・列4-8）に潜み鮫2匹。東の口（行4-5）
//      5 #~#B~o~o~kk.    ← 宝箱 B(5,3)・飛び石 o(5,5)(5,7)＝行5 だけが水1枚ずつの渡し
//      6 #~#.<~~~~kk#
//      7 #~#######kk#
//      8 #~~~~kkkkkk#
//      9 #####..#####     ← 南の口（列5-6）
//   凍れる湖のほとりの祠に鉄の盾が祀られている。祠の中は池で、潜み鮫が2匹棲む。
//   ・2026-10-10 の叩き台（祠の入口の水1枚に鮫1匹＝鮫が動けない）を、ユーザーが自分で作り替えた盤面
//     （「サメを２匹ぐらいおいて、たおさずに渡るのをほぼ不可能にする、みたいな戦略はどう？渡れるところは1箇所にしつつ」）。
//   ・渡しは行5 の1本だけ＝東の岸 (5,9)→水 (5,8)→飛び石 (5,7)→水 (5,6)→飛び石 (5,5)→水 (5,4)→宝箱 (5,3)。
//     はしごで水1枚ずつ3回渡る。池のほかの水は幅2以上か上下が水＝はしごでは渡れない。
//   ・鮫2匹は池（水 13 枚）の中を泳ぎ、プレイヤーに寄ってくる＝渡しの水に居座る。敵とは重なれない
//     ＝鮫が渡しの水にいる間は渡れない（潜っていても居る）。浮いた鮫にブーメランを当てると 1.5 秒気絶して
//     潜れず噛めない＝止めてから斬る。
//   ・**鉄の盾の宝箱は鮫を全滅させると現れる**（showConditions killAll）。ユーザーが試したところ、ブーメランを
//     1回当てて止まっている間に走り抜けて宝箱を取れた∴「渡れても倒さなければ取れない」にした
//     （2026-10-10 ユーザー「いっそ、全滅させたら宝箱が出現するパターンにしてもいいかも？」）。
//     宝箱の下は石畳＝出現前も飛び石と同じ石の床が祠の奥に見えて「何かありそう」に見える（同ユーザー案）。
//     出現前に乗ると「何かが封印されているようだ…」。
//   ・池は祠の壁で湖と切れている＝鮫は祠の外へ出ない。**壁の下に水を塗らない**＝はしごと水棲の敵は
//     壁の下の水（bgTiles）を水として扱う（`game/passable.js` isPassable の LADDER_OVER/isWaterAt）
//     ∴北の岸 (2,3) から壁 (3,3) を渡って祠の床 (4,3) へ鮫を倒さずに入れてしまう（エディタで塗った盤面で実測）。
//   ・5.5m の配置表の外に置く敵＝`scripts/lib/enemy-placement.mjs` の EXTRA_ENEMY_ROOMS に宣言する。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／水・氷・石畳は bgTiles だけ／壁の下に下地が無い／2つの口が書き換え前と同じ位置で開いている／縁で開いているのは口だけ
//   ・敵は池の潜み鮫2匹だけ・池は祠の中で閉じている（湖とつながらない）・脅威度・宣言あり
//   ・鉄の盾の宝箱は1つ・中身は書き換え前と同じ・敵全滅で出現・下は石畳／ほかに看板・拾い物が無い
//   ・2つの口が道具なしで互いに歩ける／宝箱へは道具なしでは行けず、はしごなら行5 の渡しで行ける
//   ・宝箱へは渡しの水3枚を全部通るしかない（どれか1枚塞ぐと届かない）／はしごで増える床は祠の中だけ
//   ・取り残された床が無い／層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d5-0-1-frozen-shrine-warden.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d5-0-1-frozen-shrine-warden.mjs         # 書き込み

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
const ROOM  = '0,1';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#.....B.....',
	'#...........',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];

// ── 狙いの盤面（'k'＝氷・'~'＝水・'o'＝石畳＝どれも bgTiles。tiles 層では床。敵・宝箱の文字は tiles 層に置く）──
export const GROUND_MAP = [
	'############',
	'#~kkkkkkkkk#',
	'#~kkkkkkkkk#',
	'#~#######kk#',
	'#~#.~~~~~kk.',
	'#~#B~o~o~kk.',
	'#~#.~~~~~kk#',
	'#~#######kk#',
	'#~~~~kkkkkk#',
	'#####..#####',
];
const BG_CHARS = new Set([TILE.WATER, TILE.ICE, TILE.STONE_FLOOR]);
export const BANK = '5,9';                          // 渡しの東の岸＝はしごの踏み切り
export const CROSSING = ['5,8', '5,6', '5,4'];      // 渡しの水（はしごで渡る水1枚×3）
export const STEPS = ['5,7', '5,5'];                // 飛び石（石畳）
export const SHRINE_FLOORS = ['4,3', '6,3'];        // 宝箱の脇の祠の床
export const CHEST_CELL = '5,3';                    // 鉄の盾の宝箱（ユーザーが祠の奥へ移した）。下地は石畳＝出現前も「何かある」と見せる
export const CHEST_CONDITION = { trigger: 'killAll', message: '祠の 番鮫を 退けた！宝箱が現れた！' };
export const ENEMIES = { '4,8': TILE.LURK_SHARK, '6,4': TILE.LURK_SHARK };
export const TARGET = GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	ENEMIES[`${r},${c}`] ?? (BG_CHARS.has(ch) ? TILE.FLOOR : ch)).join(''));
const cellsWhere = (pred) => GROUND_MAP.flatMap((row, r) => [...row].flatMap((ch, c) => (pred(ch) ? [`${r},${c}`] : [])));
export const WATER = cellsWhere((ch) => ch === TILE.WATER);
export const ICE = cellsWhere((ch) => ch === TILE.ICE);
export const POOL = WATER.filter((k) => { const [r, c] = k.split(',').map(Number); return r >= 4 && r <= 6 && c >= 4 && c <= 8; });
export const EXITS = { 東: ['4,11', '5,11'], 南: ['9,5', '9,6'] };
const EXPECT_THREAT = 45;
const COMMENT = '【キュー40 凍れる祠の番鮫（2026-10-10・盤面はユーザー作）】凍れる湖のほとりの祠に鉄の盾が祀られている。'
	+ '祠の中は池で潜み鮫が2匹棲む。渡しは行5 の飛び石の列だけ（はしごで水1枚ずつ3回渡る）。'
	+ '鮫は池を泳いでプレイヤーに寄り、渡しの水に居座る（敵とは重なれない）。'
	+ '浮いた鮫にブーメランを当てると気絶して潜れず噛めない＝止めてから斬る。'
	+ '鉄の盾の宝箱は鮫を全滅させると現れる（killAll・下は石畳＝出現前も何かありそうに見せる）。'
	+ '壁の下に水を塗らない（はしごが壁を渡れてしまう）。東の口から南の口へは鮫を倒さずに歩ける（報酬なしの通り道）。'
	+ '盤面は scripts/migrate-d5-0-1-frozen-shrine-warden.mjs。';

// ── 幾何の道具（番人からも import）────────────────────────────────────
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const P = (k) => k.split(',').map(Number);
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// 水を tiles 層へ畳み込んだ実効の盤面（`connectivity.mjs cellTile` と同じ考え＝bgTiles の水も水）。
// 氷・石畳は歩ける地面＝床として扱う。宝箱は tiles 層の B のまま。敵は数えない（地形だけの模型）。
export const effective = () => GROUND_MAP.map((row, r) => [...row].map((ch, c) =>
	(`${r},${c}` === CHEST_CELL ? TILE.CHEST : (ch === TILE.ICE || ch === TILE.STONE_FLOOR ? TILE.FLOOR : ch))));
// from から歩けるセル（Set）。withLadder なら幅 1 の水を、進む向きの先が地上のときだけ 1 マス渡る
// ＝`game/passable.js isLadderCrossable`。
// 宝箱は `connectivity.mjs` の BLOCKED に入っていない＝実機でもはしごの着地先になり、触れると開く
// （行5 の渡しの最後の水 (5,4) は宝箱 (5,3) に着地する）∴模型でも通れるものとして数える。
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
		(BG_CHARS.has(ch) ? [[`${r},${c}`, ch]] : []))));
	wantBg[CHEST_CELL] = TILE.STONE_FLOOR;   // 宝箱の下は石畳＝出現前も「何かある」と見せる
	if (JSON.stringify(room.showConditions ?? {}) !== JSON.stringify({ [CHEST_CELL]: CHEST_CONDITION })) {
		room.showConditions = { [CHEST_CELL]: CHEST_CONDITION };
		log.push(`  ${ROOM}: 宝箱 ${CHEST_CELL} を敵全滅（killAll）で出現させる`);
	}
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(wantBg)) {
		room.bgTiles = wantBg;
		log.push(`  ${ROOM}: bgTiles に水 ${WATER.length} 枚・氷 ${ICE.length} 枚・石畳 ${STEPS.length + 1} 枚`);
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
	check(`tiles 層に水・氷・石畳を書いていない（どれも bgTiles の単一ソース）`,
		cellsOf(tl, (ch) => BG_CHARS.has(ch)).length === 0);
	check(`bgTiles＝水 ${WATER.length} 枚・氷 ${ICE.length} 枚・石畳 ${STEPS.length + 1} 枚だけ`, JSON.stringify(room.bgTiles) === JSON.stringify(wantBg));
	{
		const under = Object.keys(room.bgTiles).filter((k) => { const [r, c] = P(k); return tl[r][c] === TILE.WALL; });
		check(`壁の下に下地が無い（壁の下の水ははしごで渡れてしまう・実測 ${under.join(' ') || 'なし'}）`, under.length === 0);
	}
	check(`飛び石 ${STEPS.join(' ')} と宝箱の下 ${CHEST_CELL} は石畳`,
		[...STEPS, CHEST_CELL].every((k) => room.bgTiles[k] === TILE.STONE_FLOOR));
	check(`宝箱 ${CHEST_CELL} は敵全滅（killAll）で出現する・関門はこれ1つ`,
		JSON.stringify(room.showConditions) === JSON.stringify({ [CHEST_CELL]: CHEST_CONDITION }));
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`${name}の口（${cells.join(' ')}）が開いている（床・下地なし）`,
			cells.every((k) => at(tl, k) === TILE.FLOOR && !room.bgTiles[k]));
	}
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(t, k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは2つの口だけ（実測 ${open.join(' ')}）`, JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = {};
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
			const ch = tl[r][c];
			if (ENEMY_META[ch]) enemies[`${r},${c}`] = ch;
		}
		check(`敵は池の潜み鮫 < 2匹だけ（実測 ${JSON.stringify(enemies)}）`,
			JSON.stringify(enemies) === JSON.stringify(ENEMIES));
		check(`鮫は池の水の上にいる・水棲・潜る・ボスでない（ブーメランで気絶する）`,
			Object.keys(ENEMIES).every((k) => POOL.includes(k)) && ENEMY_META[TILE.LURK_SHARK].move === 'water'
			&& !!ENEMY_META[TILE.LURK_SHARK].hide && !ENEMY_META[TILE.LURK_SHARK].isBoss
			&& (ENEMY_META[TILE.LURK_SHARK].stunnable ?? true));
		{
			// 池の水を水だけでたどる＝鮫が泳げる範囲。湖（外の水）に届かない＝鮫は祠から出ない。
			const seen = new Set([POOL[0]]); const q = [POOL[0]];
			while (q.length) {
				const [r, c] = P(q.shift());
				for (const [dr, dc] of DIRS4) {
					const k = `${r + dr},${c + dc}`;
					if (WATER.includes(k) && !seen.has(k)) { seen.add(k); q.push(k); }
				}
			}
			check(`池（水 ${POOL.length} 枚）はひと続きで、湖とつながらない（鮫は祠から出ない）`,
				seen.size === POOL.length && [...seen].every((k) => POOL.includes(k)));
			check(`渡しの水 ${CROSSING.join(' ')} は池の中（鮫が居座れる）`, CROSSING.every((k) => POOL.includes(k)));
		}
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度＝${EXPECT_THREAT}（実測 ${threat}）＝看板部屋 2,3（76.0）より軽い`, threat === EXPECT_THREAT);
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`鉄の盾の宝箱 B が ${CHEST_CELL} に1つだけ・chestContents はその1つで中身は鉄の盾`,
		JSON.stringify(cellsOf(tl, (ch) => ch === TILE.CHEST)) === JSON.stringify([CHEST_CELL])
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST_CELL]: { type: 'shield', shieldTier: 1, name: '鉄の盾' } }));
	check(`看板・本文・拾い物が無い（鉄の盾のほかは報酬なしの通り道）`,
		cellsOf(tl, (ch) => ch === TILE.SIGN).length === 0
		&& Object.keys(room.signData).length === 0 && Object.keys(room.npcData).length === 0
		&& Object.keys(room.floorItems).length === 0);
	check(`石・植生が無い`, cellsOf(tl, (ch) => ch === TILE.STONE || ch === TILE.TREE || ch === TILE.BUSH).length === 0);
	check(`links が書き換え前と同じ・enemyDirs が空`,
		JSON.stringify(room.links) === baseLinks && Object.keys(room.enemyDirs ?? {}).length === 0);

	// ── ② 歩ける範囲と形 ───────────────────────────────────────────
	const foot = walkable(t, EXITS.東[0]);
	const ladder = walkable(t, EXITS.東[0], true);
	for (const [name, cells] of Object.entries(EXITS)) {
		check(`道具なしで東の口から${name}の口へ歩ける（鮫を倒さずに通り抜けられる）`, cells.every((k) => foot.has(k)));
	}
	check(`宝箱 ${CHEST_CELL} へは道具なしでは行けない`, !foot.has(CHEST_CELL) && !foot.has(STEPS[0]));
	check(`はしごなら行5 の渡しで宝箱 ${CHEST_CELL} へ行ける（地形だけの模型＝鮫を数えない）`, ladder.has(CHEST_CELL));
	check(`東の岸 ${BANK} は道具なしで歩ける（渡しの踏み切り）`, foot.has(BANK));
	{
		const shrine = new Set([...STEPS, CHEST_CELL, ...SHRINE_FLOORS]);
		const extra = [...ladder].filter((k) => !foot.has(k)).sort();
		check(`はしごで増える床は祠の中（飛び石・宝箱・祠の床）だけ（実測 ${extra.join(' ')}）`,
			JSON.stringify(extra) === JSON.stringify([...shrine].sort()));
	}
	for (const k of CROSSING) {
		const g = effective(); const [r, c] = P(k); g[r][c] = TILE.WALL;
		check(`渡しの水 ${k} を塞ぐとはしごでも宝箱へ届かない（祠へは行5 の渡ししか無い）`, !walkable(g, EXITS.東[0], true).has(CHEST_CELL));
	}
	{
		const [br, bc] = P(BANK);
		const row5 = [BANK, ...CROSSING.flatMap((k, i) => [k, STEPS[i] ?? CHEST_CELL])];
		check(`渡しは行5 を東から西へ 岸→水→石→水→石→水→宝箱 と並ぶ（実測 ${row5.join(' ')}）`,
			row5.every((k, i) => { const [r, c] = P(k); return r === br && c === bc - i; }));
	}
	{
		const stranded = cellsOf(t, (ch) => !BLOCKED.has(ch)).filter((k) => !ladder.has(k));
		check(`取り残された床が無い（実測 ${stranded.join(' ') || 'なし'}）`, stranded.length === 0);
	}

	// ── ③ 層の到達性は不変 ─────────────────────────────────────────
	{
		const now = runs();
		const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
		check(`はしごありの到達室が書き換え前と同じ（${now.ladder.reachedRooms.size} 室）`, same(now.ladder.reachedRooms, base.ladder.reachedRooms));
		check(`徒歩の到達室が書き換え前と同じ（${now.foot.reachedRooms.size} 室）`, same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`, same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.closed.deadEdges.length}）`, now.closed.deadEdges.length === 0);
	}

	// ── 出力 ───────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：通り道を「凍れる祠の番鮫」に作り替える（キュー40 第3陣 6室目）`);
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
