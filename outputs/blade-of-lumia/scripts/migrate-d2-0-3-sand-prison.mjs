// dungeon_2 `0,3`（入口の脇の行き止まり）：D1 の写しの部屋を「砂の獄」に作り替える
// （2026-10-10 / PLAN 実行キュー 41 の第2陣 4室目・設計は Opus・叩き台＝案 A）
//
// ■ 何が薄かったか（キュー41 の着手時の実測）
//      0 ############
//      1 #..........#
//      2 #..........#
//      3 #..........#
//      4 #...........     ← 東の口（入口 `1,3`）。北・西・南は閉じている＝行き止まり
//      5 #....R......     ← 床のルピー（大）
//      6 #..........#
//      7 #..........#
//      8 #..........#
//      9 ############
//   `dungeon_1 0,3` とバイト一致（四角い広間に床のルピー R が1つだけ・敵なし）。
//
// ■ 新しい `0,3`＝砂の獄（閉じた格子の向こうの囚われ者を、放つ前に旋刃で削れる）
//      0 ############
//      1 #.βT.......#     ← 北の牢：跳躍蜘蛛 β
//      2 #..T.......#
//      3 ####.......#
//      4 #B.T...Y....     ← 中の牢：宝箱／広間の真ん中にレバー（スイッチ Y）／東の口
//      5 #..T........
//      6 ####.......#
//      7 #E.T.......#     ← 南の牢：巡回兵 E×2
//      8 #.ET.......#
//      9 ############
//   ・西の壁沿いに 2×2 の牢が3つ。どの牢も東の面が格子（門 T）で、レバー Y（剣で叩くスイッチ）1つが
//     **6枚の格子を全部まとめて**上げ下げする（links Y→T×6）。宝箱は中の牢＝**宝を取るには囚われ者も放つしかない**。
//   ・囚われ者＝跳躍蜘蛛 β×1・巡回兵 E×2（脅威度 24.0＝看板部屋 `2,1` の 25.0 より軽い）。格子の前に立っても
//     向こうの剣も体当たりも届かない（牢の中のセルは広間のどのセルからも2マス以上離れている）＝こちらの剣も届かない。
//   ・初めて来たとき（ブーメランの前・入口のすぐ脇）＝レバーを叩いて3体を一度に放ち、剣と盾で迎え撃つ。
//     立ち止まって待つと削られ（HP 6→0）、寄って斬れば勝てる（HP 6→5）。
//   ・ブーメランを手にして戻ると＝**ブーメランは閉じた格子を越えて飛ぶ**（投擲物を止めるのは壁と壊せる壁だけ）
//     ＝格子の前から牢の中の囚われ者を削り切ってからレバーを叩ける（実測 7 投・無傷）。ブーメランはスイッチ Y を
//     叩けない（`projectile.js` のトグルは矢とビームだけ）＝遠くからレバーを上げる抜け道は無い。
//   ・D2 の他の部屋と型を分けた＝`1,3` 炎の受け渡し・`1,2` 敵のブーメランの軌道・`1,1` 構える敵をスタンで崩す・
//     `1,0` 裂け目と一本橋・`2,0` 剣を封じる鬼火・`3,0` 潜る敵を止める・`0,1` 炎の2段・`0,2` 穴の小島の回収・
//     `2,1` 跳躍蜘蛛と地中蟲（看板）。ここは「剣の届かない向こうの敵を格子越しに撃つ」＋「放つか、先に削るか」。
//     スイッチ Y と門 T は D2 で初めて使う（D1 `2,2` で Y→T を一度見ている）。
//   ・床のルピー R は宝箱（ルピー×30＝仮・キュー45 で見直す）に替えた。
//
// ■ 層への影響（このスクリプトの検証が固定する）
//   ・徒歩の到達室・門を閉じたままの到達室・dead-edge 0 は書き換え前と同じ（東の口は同じセルで開いたまま）。
//
// 使い方:
//   node scripts/migrate-d2-0-3-sand-prison.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d2-0-3-sand-prison.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, BLOCKED, HARD_BLOCKED } from './lib/connectivity.mjs';
import { stageThreat, EXTRA_ENEMY_ROOMS } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_2';
const ROOM  = '0,3';
const ROWS = 10, COLS = 12;

// ── 書き換え前の盤面（層の到達性の基準を測るためだけに持つ） ─────────────
const ORIGINAL = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...........',
	'#....R......',
	'#..........#',
	'#..........#',
	'#..........#',
	'############',
];

// ── 狙いの盤面 ───────────────────────────────────────────────────────
export const TARGET = [
	'############',
	'#.βT.......#',
	'#..T.......#',
	'####.......#',
	'#B.T...Y....',
	'#..T........',
	'####.......#',
	'#E.T.......#',
	'#.ET.......#',
	'############',
];
export const EXITS = { east: ['4,11', '5,11'] };
export const LEVER = '4,7';                       // レバー（スイッチ Y）
export const BARS = ['1,3', '2,3', '4,3', '5,3', '7,3', '8,3'];   // 格子（門 T）
export const LINKS = BARS.map((g) => ({ switchId: LEVER, gateId: g }));
export const CELLS = {                            // 牢の中（内寸 2×2）
	north:  { r0: 1, r1: 2, c0: 1, c1: 2 },
	center: { r0: 4, r1: 5, c0: 1, c1: 2 },
	south:  { r0: 7, r1: 8, c0: 1, c1: 2 },
};
export const INMATES = { '1,2': TILE.LEAP_SPIDER, '7,1': TILE.PATROL, '8,2': TILE.PATROL };
export const ENTRY = '4,10';                      // 東の口（入口 `1,3` から入った最初のセル）
export const CHEST = '4,1';
export const CHEST_CONTENT = { type: 'rupee', value: 30, name: 'ルピー×30' };   // 仮＝キュー45 で見直す
export const BOOMERANG_REACH_WEST = 4;            // 木のブーメランの届き（←↑4／→↓5・DECISIONS 2026-09-26（2））

const P = (k) => k.split(',').map(Number);
// どの牢の中か（牢の外なら null）。
export function cellOf(k) {
	const [r, c] = P(k);
	for (const [name, b] of Object.entries(CELLS)) if (r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1) return name;
	return null;
}

// 下地＝牢の中と格子のセルは石畳 'o'、それ以外の床は全部砂 'd'（壁には置かない）。盤面から導く。
export function targetBg(t = TARGET) {
	const bg = {};
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = t[r][c];
		if (ch === TILE.WALL) continue;
		const k = `${r},${c}`;
		bg[k] = (cellOf(k) || ch === TILE.GATE) ? TILE.STONE_FLOOR : TILE.SAND;
	}
	return bg;
}

// ── 歩行の到達（モジュールとしても使う＝番人が import する） ─────────────
// open=true なら格子 T を開いている（床）として歩く。cut は塞ぐセル。
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export function reach(t, { from = ENTRY, open = false, cut = new Set() } = {}) {
	const ok = (ch) => (ch === TILE.GATE ? open : !BLOCKED.has(ch) || !!ENEMY_META[ch]);
	const seen = new Set([from]);
	const q = [from];
	while (q.length) {
		const [r, c] = P(q.shift());
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
			if (!inside(nr, nc) || seen.has(nk) || cut.has(nk) || !ok(t[nr][nc])) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}
// 東から西へ投げたブーメランが from（広間）から to（牢の中）まで壁に当たらずに届くか（同じ行・距離 ≤ 4）。
export function boomerangLine(t, from, to) {
	const [r0, c0] = P(from), [r1, c1] = P(to);
	if (r0 !== r1 || c1 >= c0 || c0 - c1 > BOOMERANG_REACH_WEST) return false;
	for (let c = c1 + 1; c < c0; c++) if (t[r0][c] === TILE.WALL || t[r0][c] === TILE.BREAKABLE_WALL) return false;
	return true;
}

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// import されたときはここで止める（番人は定数と reach だけ使う）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const stages = data.layers?.[LAYER]?.stages;
	if (!stages) die(`${LAYER} が無い`);
	const room = stages[ROOM];
	if (!room) die(`${LAYER} ${ROOM} が無い`);

	// 事前条件＝盤面の外の中身が無い（宝箱・links・下地は、このスクリプトが書いた物なら受ける＝冪等）。
	const extras = ['signData', 'mapEnters', 'floorItems', 'npcData', 'shopData', 'breakableWalls', 'objects', 'enemyDirs', 'showConditions'];
	for (const k of extras) if (room[k] && Object.keys(room[k]).length) die(`${ROOM} の ${k} が空でない＝想定外の中身`);
	for (const [k, want] of [['chestContents', { [CHEST]: CHEST_CONTENT }], ['bgTiles', targetBg()]]) {
		const cur = room[k] ?? {};
		if (Object.keys(cur).length && JSON.stringify(cur) !== JSON.stringify(want)) die(`${ROOM} の ${k} が想定外の中身`);
	}
	if (room.links?.length && JSON.stringify(room.links) !== JSON.stringify(LINKS)) die(`${ROOM} の links が想定外の中身`);

	const START = { stage: '1,3', row: 7, col: 2 };   // 入口の戻り口の着地
	const OPEN = new Set(['T', '!', 'D', '=']);
	const runs = () => ({
		foot: bfsLayer(stages, START, { withLadder: false, openTiles: OPEN }),
		closed: bfsLayer(stages, START, { withLadder: false, openTiles: null }),
	});
	// 層の到達性の基準は「書き換え前の盤面」で測る＝適用済みの地図に再実行しても同じ基準になる（冪等）。
	const before = room.tiles.map(rowStr);
	const applied = { tiles: room.tiles, bgTiles: room.bgTiles, links: room.links };
	room.tiles = ORIGINAL.map((row) => row.split(''));
	delete room.bgTiles;
	room.links = [];
	const base = runs();
	room.tiles = applied.tiles;
	if (applied.bgTiles !== undefined) room.bgTiles = applied.bgTiles;
	room.links = applied.links ?? [];

	const log = [];
	const verify = [];
	const check = (msg, cond) => verify.push([!!cond, msg]);

	// ── 書き換え（tiles は文字の配列の配列＝[[field-tiles-are-char-arrays]]） ──
	if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
		room.tiles = TARGET.map((row) => [...row]);
		log.push(`  ${ROOM}: 盤面を差し替えた`);
	}
	if (JSON.stringify(room.bgTiles ?? {}) !== JSON.stringify(targetBg())) {
		room.bgTiles = targetBg();
		log.push(`  ${ROOM}: 下地＝床を砂・牢の中と格子を石畳にした`);
	}
	if (JSON.stringify(room.links ?? []) !== JSON.stringify(LINKS)) {
		room.links = LINKS.map((l) => ({ ...l }));
		log.push(`  ${ROOM}: レバー ${LEVER} → 格子 ${BARS.join(' ')}（6枚まとめて上げ下げ）`);
	}
	if (JSON.stringify(room.chestContents) !== JSON.stringify({ [CHEST]: CHEST_CONTENT })) {
		room.chestContents = { [CHEST]: { ...CHEST_CONTENT } };
		log.push(`  ${ROOM}: 宝箱 ${CHEST} = ${CHEST_CONTENT.name}`);
	}

	// ── ① 盤面とデータ ──────────────────────────────────────────────
	const t = room.tiles.map((r) => [...r]);
	const at = (k) => { const [r, c] = P(k); return t[r]?.[c]; };
	const cellsOf = (pred) => {
		const out = [];
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pred(t[r][c])) out.push(`${r},${c}`);
		return out;
	};
	check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
	check(`tiles が文字の配列の配列（${ROWS}×${COLS}）`,
		room.tiles.length === ROWS && room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
	{
		const edge = [];
		for (let c = 0; c < COLS; c++) edge.push(`0,${c}`, `9,${c}`);
		for (let r = 1; r < ROWS - 1; r++) edge.push(`${r},0`, `${r},11`);
		const open = edge.filter((k) => !HARD_BLOCKED.has(at(k))).sort();
		const want = Object.values(EXITS).flat().sort();
		check(`画面の縁で開いているのは東の口だけ＝書き換え前と同じ行き止まり（実測 ${open.join(' ')}）`,
			JSON.stringify(open) === JSON.stringify(want));
	}
	{
		const enemies = cellsOf((ch) => !!ENEMY_META[ch]);
		const want = Object.keys(INMATES).sort();
		check(`敵は跳躍蜘蛛 β×1・巡回兵 E×2 だけ（実測 ${enemies.map((k) => `${at(k)}@${k}`).join(' ')}）`,
			JSON.stringify(enemies.slice().sort()) === JSON.stringify(want) && want.every((k) => at(k) === INMATES[k]));
		check(`囚われ者は全員が牢の中・宝箱の牢（中）には居ない`,
			enemies.every((k) => cellOf(k) && cellOf(k) !== 'center'));
		check(`北の牢と南の牢の両方に囚われ者が居る（宝の牢の両隣）`,
			enemies.some((k) => cellOf(k) === 'north') && enemies.some((k) => cellOf(k) === 'south'));
		const threat = stageThreat(room, ENEMY_META);
		check(`脅威度 ${threat}＝看板部屋 2,1 の 25.0 より軽い`, threat > 0 && threat < 25);
		check(`囚われ者は弱点の道具を持たない・ボスでない（ブーメランで気絶する）`,
			enemies.every((k) => !ENEMY_META[at(k)].weakness && !ENEMY_META[at(k)].isBoss));
		check(`囚われ者は空を飛ばない（飛ぶ敵は格子を越えないが、念のため陸の敵に限る）`,
			enemies.every((k) => !ENEMY_META[at(k)].move));
		check(`EXTRA_ENEMY_ROOMS に ${LAYER} ${ROOM} が宣言されている（5.5m の配置表の外に置く敵）`,
			EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM));
	}
	check(`宝箱 ${CHEST} は中の牢・${CHEST_CONTENT.name}・出現条件なし（初めから格子の向こうに見えている）`,
		at(CHEST) === TILE.CHEST && cellOf(CHEST) === 'center' && cellsOf((ch) => ch === TILE.CHEST).length === 1
		&& JSON.stringify(room.chestContents) === JSON.stringify({ [CHEST]: CHEST_CONTENT })
		&& Object.keys(room.showConditions ?? {}).length === 0);
	{
		const switches = cellsOf((ch) => ch === TILE.SWITCH);
		const gates = cellsOf((ch) => ch === TILE.GATE);
		check(`スイッチはレバー ${LEVER} の1つだけ（実測 ${switches.join(' ')}）`, JSON.stringify(switches) === JSON.stringify([LEVER]));
		check(`門は格子の6枚だけ・どれも牢の東の面（列3）`, JSON.stringify(gates) === JSON.stringify(BARS) && BARS.every((k) => P(k)[1] === 3));
		check(`links はレバー → 格子6枚（1つのレバーが全部の格子を上げ下げする）`, JSON.stringify(room.links) === JSON.stringify(LINKS));
	}
	check(`ほかの仕掛け（看板・床の物・石・ボタン・扉・鍵・かがり火・穴・壊せる壁・色の仕掛け）が無い`,
		extras.every((k) => !room[k] || Object.keys(room[k]).length === 0)
		&& cellsOf((ch) => [TILE.SIGN, TILE.STONE, TILE.BUTTON, TILE.DOOR, TILE.KEY, TILE.TORCH, TILE.PIT, TILE.BREAKABLE_WALL,
			TILE.SWITCH_RED, TILE.SWITCH_BLUE, TILE.GATE_RED, TILE.GATE_BLUE, TILE.ITEM_RUPEE, TILE.ITEM_RUPEE_LARGE,
			TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION].includes(ch)).length === 0);
	{
		const bg = room.bgTiles ?? {};
		const nonWall = cellsOf((ch) => ch !== TILE.WALL);
		const stone = Object.keys(bg).filter((k) => bg[k] === TILE.STONE_FLOOR);
		check(`下地＝牢の中（12 マス）と格子（6 マス）が石畳・ほかの床は全部砂・壁には置かない（石畳 ${stone.length} マス）`,
			Object.keys(bg).length === nonWall.length
			&& nonWall.every((k) => bg[k] === ((cellOf(k) || at(k) === TILE.GATE) ? TILE.STONE_FLOOR : TILE.SAND))
			&& stone.length === 18);
	}

	// ── ② 牢の幾何 ──────────────────────────────────────────────
	{
		const closed = reach(t);
		const open = reach(t, { open: true });
		// 歩ける床＝BLOCKED でないセルと敵の居るセル（宝箱 B・レバー Y は立てない＝隣に立って使う）。
		const floors = cellsOf((ch) => !BLOCKED.has(ch) || !!ENEMY_META[ch]);
		const interior = floors.filter((k) => cellOf(k));
		const nb = (k) => { const [r, c] = P(k); return [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => `${r + dr},${c + dc}`); };
		check(`格子を閉じたまま、牢の中（${interior.length} マス）のどこにも歩いて入れない`, interior.every((k) => !closed.has(k)));
		check(`格子を閉じたまま、レバーの四方と東の口に歩いて届く`,
			[...EXITS.east, ...nb(LEVER)].every((k) => closed.has(k)));
		check(`宝箱の隣には、格子を閉じたままでは立てず、上げれば立てる`,
			!nb(CHEST).some((k) => closed.has(k)) && nb(CHEST).some((k) => open.has(k)));
		check(`格子を上げれば床のどのセルにも歩いて立てる（取り残し 0・${floors.length} マス）`, floors.every((k) => open.has(k)));
		// 牢の出入りはその牢の格子だけ。
		for (const [name, b] of Object.entries(CELLS)) {
			const mine = BARS.filter((k) => P(k)[0] >= b.r0 && P(k)[0] <= b.r1);
			const inner = `${b.r0},${b.c0}`;
			check(`${name} の牢の出入りは自分の格子 ${mine.join(' ')} だけ（塞ぐと他の格子を上げても入れない）`,
				mine.length === 2 && !reach(t, { open: true, cut: new Set(mine) }).has(inner));
		}
		// 剣も体当たりも届かない＝格子を閉じたまま立てるセルと牢の中は、縦横斜めとも2マス以上離れている。
		let minCheb = Infinity;
		for (const a of closed) for (const k of interior) {
			const [r0, c0] = P(a), [r1, c1] = P(k);
			minCheb = Math.min(minCheb, Math.max(Math.abs(r0 - r1), Math.abs(c0 - c1)));
		}
		check(`格子の手前に立てるセルと牢の中は 2 マス以上離れている（実測 ${minCheb}）＝剣も体当たりも格子を越えて届かない`, minCheb >= 2);
		// 格子越しにブーメランが届く＝囚われ者ごとに、格子の手前の同じ行に投げる座がある。
		for (const k of Object.keys(INMATES)) {
			const seats = [...closed].filter((a) => boomerangLine(t, a, k));
			check(`囚われ者 ${at(k)}@${k} へ、格子の手前から西へ投げて届く座がある（${seats.length} 座）`, seats.length > 0);
		}
		check(`対照＝格子を壁にすると、どの囚われ者へも投げて届く座が無い`,
			Object.keys(INMATES).every((k) => {
				const tw = t.map((row) => row.map((ch) => (ch === TILE.GATE ? TILE.WALL : ch)));
				return ![...closed].some((a) => boomerangLine(tw, a, k));
			}));
	}

	// ── ③ 層の到達性 ──────────────────────────────────────────────────
	{
		const now = runs();
		const sorted = (s) => [...s].sort();
		const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
		check(`徒歩・錠を全部開けた到達室が書き換え前と同じ（${now.foot.reachedRooms.size}/${Object.keys(stages).length} 室）`,
			same(now.foot.reachedRooms, base.foot.reachedRooms));
		check(`門を閉じたままの到達室が書き換え前と同じ（${now.closed.reachedRooms.size} 室）`,
			same(now.closed.reachedRooms, base.closed.reachedRooms));
		check(`レイヤーの dead-edge が 0（実測 ${now.foot.deadEdges.length}）`, now.foot.deadEdges.length === 0);
	}

	// ── 出力 ─────────────────────────────────────────────────────────
	console.log(`# ${LAYER} ${ROOM}：入口の脇の行き止まりを「砂の獄」に作り替える（キュー41 第2陣）`);
	console.log(log.join('\n') || '  （変更なし）');
	console.log(`\n## 盤面の差分（${ROOM}）`);
	room.tiles.forEach((row, i) => {
		const now = rowStr(row);
		console.log(`   ${String(i).padStart(2)} ${before[i]}   ${before[i] === now ? '=' : '→'}   ${now}`);
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
