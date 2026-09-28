// dungeon_6 `3,3`：飾りの「石＋ボタンの門」部屋を「檻の番人」（檻の中のチェイサーを外から
// 誘導して石をボタンへ押させる）に作り替える（2026-09-28 / PLAN 実行キュー 34 の4室目・
// 設計は Opus、主題はユーザー確定＝案 A）
//
// ■ 何が壊れていたか（キュー34 の指摘＋着手前の実測）
//      0 #####..#####     ← 北の口（3,2 地図の部屋）
//      1 #........T.#     ← 門 T(1,9)
//      2 #........B.#     ← 宝箱 B(2,9)＝ルピー×5
//      3 #..*...S...#     ← 石 *(3,3)・ボタン S(3,7)
//      4 ...........#     ← 西の口（2,3 分裂スライムの巣）
//      9 #####..#####     ← 南の口（3,4）
//   宝箱 (2,9) は (2,8)(2,10)(3,9) から素で歩いて開けられた＝門は何も守っていない飾り。
//
// ■ 石1個版は易しすぎた（2026-09-28 ユーザー判定「ちょっと簡単かも？」）
//   → ユーザーの確認「石敵パズルの2個石化を想定してます」＝主題はそのまま、石とボタンを2個ずつ。
//
// ■ 新しい `3,3`＝檻の番人・石2個（通り抜けの部屋＋寄り道の報酬）
//      0 #####..#####
//      1 #B#...######     ← 宝箱 B(1,1)＝ルピー×20・門 T(2,1) の奥
//      2 #T#..##S#C.#     ← ボタン S(2,7)・柱 (2,8)・番人 C(2,9)
//      3 #....##..**#     ← 石 *(3,9)(3,10)
//      4 .....##..#.#     ← 柱 (4,9)
//      5 .....##...S#     ← ボタン S(5,10)
//      6 #.....######
//      7 #......#####
//      8 #i.........#     ← 看板 i(8,1)・南の通路 row8（檻の真下を東西に歩ける）
//      9 #####..#####
//   東側を二重の壁で囲った檻（中は rows2-5 cols7-10）にし、チェイサー・石2個・ボタン2個を入れる。
//   外周の壁は「檻のセルから距離 2 以下の檻の外は全部壁」で決めた（下の ③ で測る）。
//   プレイヤーは檻に入れない。`enemy-ai.js enemyChase` は距離に関係なく常にプレイヤーを追う
//   （縦横の差が大きい軸を先に試し、塞がれたらもう一方の軸）＝乱数なし・決定論的。
//   `tryEnemyPushStone` はプレイヤーと同じ規則で石を押す（Phase 5-3）。ボタンは石かプレイヤー
//   でしか押されない（敵は押さない）。門は2つのボタンが両方 ON で開き、両方に石が乗った瞬間に
//   石がロックされる（`game/conditions.js` refreshGates ①）＝1個目を乗せた後も番人は石を押し出せる。
//   ・解＝①南東の角 (8,10) に立つ → 番人が右へ回り込み、石 (3,10) を下のボタン (5,10) へ押す
//         ②北西 (1,4)〜(1,5) へ歩く → 番人が上がって石 (3,9) を左端 (3,7) へ押す
//         ③西の口 (4,1) へ → 番人が石の下 (4,7) へ回り込む
//         ④(3,4) へ上がる → 番人が石を上のボタン (2,7) へ押し上げる → 門 T(2,1) が開く
//   ・入室しても番人は動かない＝袋 (2,9) の西は柱 (2,8)・南は石・北は壁。立てる床のうち
//     番人が動き出すのは南東の角 (8,10) だけ（南が石で塞がり、東 (2,10) が開いている）。
//   ・詰みは無い（1セル歩く＝番人1歩のモデルで全状態を測って 0）＝しくじっても歩き直せば解ける。
//     難しさは「番人を呼ぶ場所を順に見つける」4段の手順が持つ。詰みを持つ形も探したが、
//     入口で立ち止まるだけで詰む形しか無かった（PLAN キュー34 4室目の測定結果）。
//   ・初出の機構なので看板 i(8,1) でヒントを出す（D6 の他の看板と同じ {name,lines} 形式）。
//
// ■ 測り方（2石版で踏んだ罠）
//   「1手＝どこかに立って番人が止まるまで待つ」立ち位置モデルは2石では嘘になる＝遠い立ち位置の
//   間を歩く途中で番人が別の方へ引っ張られる。∴下の ④ は「1セル歩く／その場で待つ＝番人1歩」の
//   歩くモデル（状態＝プレイヤーのセル×番人の座標×石の配置）で全状態を数える。
//
// ■ 番人を倒せないこと（ユーザー確認 2026-09-28）
//   ダンジョンの敵は倒すと部屋を出ても復活しない（復活は field だけ＝`game/game.js` enterStage）
//   ∴檻の外から倒せたら謎解きが永久に死ぬ。敵に届く攻撃は4つだけ：
//   ・剣（`SWORD_REACH` 1.2）・ロウソクの炎（前方1マス）＝距離で届かない
//   ・投擲物（矢・ビーム・ブーメラン）＝`#` と未破壊 `!` で止まる（`isTilePassableForProj`）
//   ・爆弾＝置いたセルから距離 2 **以下**のセルの敵に当たる・**壁で遮られない**（`explodeAt`
//     の `> radius` で除外）＝壁1枚隔てた距離 2 は当たる
//   ∴檻の壁は二重。木だと翼の羽衣（最終盤）で上を飛べる（`FLYABLE_OVER`）＝木の上から爆弾を
//   置くと檻に届く∴外側も壁にした。
//   下の ③ が「歩いて／飛んで立てるどのセルからも、檻の中は距離 2 より遠く、まっすぐの射線は
//   必ず壁で止まる」を測る。
//
// ■ 撤去したもの
//   旧石 *(3,3)・旧ボタン S(3,7)・旧門 T(1,9)・旧宝箱 B(2,9)・茂み (6,3)・木 (6,8)。
//   2026-09-28 にエディタで入れた石1個版の手直し（C(1,10)・S(6,10)・links 6,10→2,1）も上書きする。
//   links は2つのボタン→門の2本（ボタンの部屋の T は links が無くても開くが、編集画面と
//   飾り門の走査に意図を残す）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・盤面／宝の中身／links／看板／showConditions が空
//   ・3つの口が互いに歩いてつながる／外周の口の形が書き換え前と同じ
//   ・檻の中へは歩いても飛んでも入れない／門を閉じたままでは宝箱へ届かない・開ければ届く
//   ・番人を倒せない（距離・射線）／対照＝外側の壁を木にすると飛行で爆弾が届く
//   ・番人の誘導の実測（歩くモデル）＝最短 26 歩で解ける・詰み 0・1 か所に立つだけでは解けない・
//     入室で動くのは (8,10) だけ・歩き方の台本（想定解は解ける／1個目だけでは門が開かない）／
//     対照＝柱 (2,8) か (4,9) を外すと解けない
//   ・はしごで架けられるセルが0／層の到達性が書き換え前と同じ（到達室・dead-edge）
//   再実行しても同じ結果になる（既に適用済みなら盤面の差分が出ないだけ）＝冪等。
//
// 使い方:
//   node scripts/migrate-d6-3-3-caged-warden.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-d6-3-3-caged-warden.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ITEM_META } from '../shared/items.js';
import { SWORD_REACH, MOVE_STEP } from '../game/constants.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bfsLayer, LADDER_OVER, isLadderBridgeCell } from './lib/connectivity.mjs';
import { ROWS, COLS } from './lib/blade-solver.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dungeon_6';
const ROOM  = '3,3';

// ── 狙いの盤面 ───────────────────────────────────────────────────────
const TARGET = [
	'#####..#####',
	'#B#...######',
	'#T#..##S#C.#',
	'#....##..**#',
	'.....##..#.#',
	'.....##...S#',
	'#.....######',
	'#......#####',
	'#i.........#',
	'#####..#####',
];
const WARDEN  = [2, 9];
const STONES  = [[3, 9], [3, 10]];
const BUTTONS = [[2, 7], [5, 10]];
const PILLARS = ['2,8', '4,9'];
const GATE    = '2,1';
const CHEST   = '1,1';
const SIGN    = '8,1';
const PEN = [];   // 檻の中（rows2-5 cols7-10）
for (let r = 2; r <= 5; r++) for (let c = 7; c <= 10; c++) PEN.push(`${r},${c}`);
const OPENINGS = { 北: ['0,5', '0,6'], 西: ['4,0', '5,0'], 南: ['9,5', '9,6'] };
const CHEST_CONTENTS = { [CHEST]: { type: 'rupee', value: 20, name: 'ルピー×20' } };
const LINKS = BUTTONS.map(([r, c]) => ({ switchId: `${r},${c}`, gateId: GATE }));
const SIGN_DATA = {
	[SIGN]: {
		name: '番人の 檻',
		lines: [
			'檻の 番人は 近づく 者を どこまでも 追う。',
			'二つの 石を 踏み板へ 送るのは 番人の 足だ。',
			'番人を 呼ぶ 場所を 順に 探せ。',
		],
	},
};

// ── 読み込み ─────────────────────────────────────────────────────────
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

const before = room.tiles.map(rowStr);
const log = [];
const verify = [];
const check = (msg, cond) => verify.push([!!cond, msg]);

function rowStr(row) { return Array.isArray(row) ? row.join('') : String(row); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
const ringOf = (rows) => rows.map((row, r) => (r === 0 || r === ROWS - 1 ? row : row[0] + row[COLS - 1])).join('|');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 書き換え ─────────────────────────────────────────────────────────
// tiles は「文字の配列の配列」で持つ（[[field-tiles-are-char-arrays]]）。
if (room.tiles.map(rowStr).join('|') !== TARGET.join('|')) {
	room.tiles = TARGET.map((row) => row.split(''));
	log.push(`  ${ROOM}: 盤面を差し替えた`);
}
if (!same(room.links ?? [], LINKS)) {
	log.push(`  ${ROOM}: links を ${(room.links ?? []).map((l) => `${l.switchId}→${l.gateId}`).join(' / ') || 'なし'} → ${LINKS.map((l) => `${l.switchId}→${l.gateId}`).join(' / ')} にした`);
	room.links = JSON.parse(JSON.stringify(LINKS));
}
if (!same(room.chestContents ?? {}, CHEST_CONTENTS)) {
	log.push(`  ${ROOM}: 宝箱を ${Object.entries(room.chestContents ?? {}).map(([k, v]) => `${k}=${v.name}`).join(' ') || 'なし'} → ${CHEST}=ルピー×20 にした`);
	room.chestContents = JSON.parse(JSON.stringify(CHEST_CONTENTS));
}
if (!same(room.signData ?? {}, SIGN_DATA)) {
	log.push(`  ${ROOM}: 看板 ${SIGN}「${SIGN_DATA[SIGN].name}」を置いた`);
	room.signData = JSON.parse(JSON.stringify(SIGN_DATA));
}
if (Object.keys(room.showConditions ?? {}).length) {
	log.push(`  ${ROOM}: showConditions を外した`);
}
room.showConditions = {};
room.bgTiles ??= {};
room.breakableWalls ??= {};

// ── 検証の道具 ───────────────────────────────────────────────────────
const grid = () => room.tiles.map((r) => (Array.isArray(r) ? [...r] : r.split('')));
const at = (t, k) => { const [r, c] = k.split(',').map(Number); return t[r]?.[c]; };
const nbrs = (k) => {
	const [r, c] = k.split(',').map(Number);
	return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
		.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => `${rr},${cc}`);
};
// 歩いて立てる床（宝箱は踏んで開けるタイル＝立てる床に数える。門は openGate のときだけ）
const WALK_BLOCK = new Set([TILE.WALL, TILE.TREE, TILE.WATER, TILE.PIT, TILE.LAVA, TILE.SIGN, TILE.STONE, TILE.BUSH, TILE.TORCH]);
// 翼の羽衣で飛んで上に居られるタイル（`game/passable.js` FLYABLE_OVER と同じ）
const FLY_OVER = new Set([TILE.SKY, TILE.WATER, TILE.LAVA, TILE.TREE, TILE.BUSH, TILE.FENCE, TILE.TIDE_GATE]);
function reach(t, from, { openGate = false, fly = false } = {}) {
	const ok = (ch) => {
		if (ch === undefined) return false;
		if (ch === TILE.GATE) return openGate;
		if (fly && FLY_OVER.has(ch)) return true;
		return !WALK_BLOCK.has(ch);
	};
	const seen = new Set(), q = [];
	for (const k of from) if (ok(at(t, k))) { seen.add(k); q.push(k); }
	while (q.length) {
		const k = q.shift();
		for (const n of nbrs(k)) {
			if (seen.has(n) || !ok(at(t, n))) continue;
			seen.add(n); q.push(n);
		}
	}
	return seen;
}
const allOpenings = Object.values(OPENINGS).flat();

// 番人の誘導＝`game/enemy-ai.js` enemyChase / tryEnemyPushStone と同じ規則を格子で再現する（石 N 個）。
// プレイヤーが 1 セル歩く（2 tick）ごとに番人は半セル 1 歩（チェイサー speed 0.5・MOVE_STEP 0.5）。
// 石は番人の通り道を塞ぐ。押せるのは整列時の縦横1歩で、行き先が通れて・他の石もプレイヤーも居ないとき。
const ENEMY_BLOCK = new Set([TILE.WALL, TILE.TREE, TILE.WATER, TILE.PIT, TILE.LAVA, TILE.GATE, TILE.CHEST, TILE.SIGN, TILE.BUSH]);
const stoneKey = (st) => st.map(([r, c]) => r * 16 + c).sort((a, b) => a - b).join('.');
const GOAL = stoneKey(BUTTONS);
function makeSim(t) {
	const pass = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !ENEMY_BLOCK.has(t[r][c]);
	const stoneAt = (st, r, c) => st.findIndex((s) => s[0] === r && s[1] === c);
	function enemyOk(ny, nx, st, P) {
		for (let r = Math.floor(ny); r <= Math.floor(ny + 0.999); r++) {
			for (let c = Math.floor(nx); c <= Math.floor(nx + 0.999); c++) {
				if (!pass(r, c) || stoneAt(st, r, c) >= 0) return false;
			}
		}
		const ox = Math.min(nx + 1, P[1] + 1) - Math.max(nx, P[1]);
		const oy = Math.min(ny + 1, P[0] + 1) - Math.max(ny, P[0]);
		return !(ox > 0 && oy > 0);
	}
	// 両方のボタンに石が乗った状態は解けた終点として扱う（その瞬間に石ロック）＝ロック後の押しは測らない
	function step(ey, ex, st, P) {
		const dy = P[0] - ey, dx = P[1] - ex;
		if (Math.hypot(dy, dx) < 0.01) return [ey, ex, st];
		const s = MOVE_STEP, cand = [];
		if (Math.abs(dy) >= Math.abs(dx)) { cand.push([Math.sign(dy) * s, 0]); cand.push([0, Math.sign(dx) * s]); }
		else { cand.push([0, Math.sign(dx) * s]); cand.push([Math.sign(dy) * s, 0]); }
		const aligned = Number.isInteger(ey) && Number.isInteger(ex);
		for (const [my, mx] of cand) {
			const ny = ey + my, nx = ex + mx;
			if (enemyOk(ny, nx, st, P)) return [ny, nx, st];
			if (aligned) {
				const ndr = Math.sign(my), ndc = Math.sign(mx);
				const sr = ey + ndr, sc = ex + ndc, i = stoneAt(st, sr, sc);
				if (i >= 0) {
					const dr = sr + ndr, dc = sc + ndc;
					if (pass(dr, dc) && stoneAt(st, dr, dc) < 0 && !(P[0] === dr && P[1] === dc)) {
						return [ny, nx, st.map((x, j) => (j === i ? [dr, dc] : x))];
					}
				}
			}
		}
		return [ey, ex, st];
	}
	return { step };
}
// 歩くモデル＝状態 (プレイヤーのセル, 番人の座標, 石の配置)。1手＝隣へ歩く or その場で待つ。
// 口に接する立てるセルから始め、最短歩数と「プレイヤーがどこに居ても解けない (番人, 石) の組」（詰み）を数える。
function walkModel(t, cells, starts, warden = WARDEN, stones = STONES) {
	const sim = makeSim(t);
	const cellSet = new Set(cells.map((p) => p.join(',')));
	const K = (P, e, st) => `${P}|${e}|${stoneKey(st)}`;
	const nodes = new Map(), edges = new Map(), q = [];
	for (const P of starts) { const k = K(P, warden, stones); if (!nodes.has(k)) { nodes.set(k, { P, e: warden, st: stones, d: 0 }); q.push(k); } }
	const solvedFrom = new Set();
	let best = Infinity;
	for (let h = 0; h < q.length; h++) {
		const k = q[h], n = nodes.get(k), out = [];
		edges.set(k, out);
		const [r, c] = n.P;
		for (const [a, b] of [[r, c], [r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
			if (!cellSet.has(`${a},${b}`)) continue;
			const [ey, ex, ns] = sim.step(n.e[0], n.e[1], n.st, [a, b]);
			if (stoneKey(ns) === GOAL) { solvedFrom.add(k); best = Math.min(best, n.d + 1); continue; }
			const nk = K([a, b], [ey, ex], ns);
			out.push(nk);
			if (!nodes.has(nk)) { nodes.set(nk, { P: [a, b], e: [ey, ex], st: ns, d: n.d + 1 }); q.push(nk); }
		}
	}
	const good = new Set(solvedFrom);
	const radj = new Map();
	for (const [k, out] of edges) for (const x of out) { if (!radj.has(x)) radj.set(x, []); radj.get(x).push(k); }
	for (const st = [...good]; st.length;) { const k = st.pop(); for (const p of radj.get(k) ?? []) if (!good.has(p)) { good.add(p); st.push(p); } }
	const byES = new Map();
	for (const [k, n] of nodes) { const es = `${n.e}|${stoneKey(n.st)}`; byES.set(es, (byES.get(es) ?? false) || good.has(k)); }
	const dead = [...byES].filter(([, ok]) => !ok).map(([es]) => es);
	return { steps: best, states: byES.size, dead };
}
// 歩き方の台本（1 セル歩く／その場で待つ＝番人 1 歩）。数字＝その場で待つ歩数、座標＝横→縦の順に歩く。
function walkScript(t, start, legs) {
	const sim = makeSim(t);
	let P = start, ey = WARDEN[0], ex = WARDEN[1], st = STONES, walked = 0;
	for (const leg of legs) {
		const steps = [];
		if (typeof leg === 'number') for (let i = 0; i < leg; i++) steps.push(P);
		else {
			let [r, c] = P;
			while (c !== leg[1]) { c += Math.sign(leg[1] - c); steps.push([r, c]); }
			while (r !== leg[0]) { r += Math.sign(leg[0] - r); steps.push([r, c]); }
		}
		for (const cell of steps) {
			P = cell;
			if (WALK_BLOCK.has(t[P[0]][P[1]]) || t[P[0]][P[1]] === TILE.GATE) return { error: `床でないセル ${P}` };
			[ey, ex, st] = sim.step(ey, ex, st, P);
			walked++;
			if (stoneKey(st) === GOAL) return { solved: true, warden: [ey, ex], stones: st, walked };
		}
	}
	return { solved: false, warden: [ey, ex], stones: st, walked };
}
const stonesStr = (st) => st.map((s) => s.join(',')).sort().join(' ');

// ── ① 盤面とデータ ──────────────────────────────────────────────────
const t = grid();
check(`${ROOM} の盤面が狙いどおり`, room.tiles.map(rowStr).join('|') === TARGET.join('|'));
check(`${ROOM} の tiles が文字の配列の配列`, room.tiles.every((r) => Array.isArray(r) && r.length === COLS));
check(`${ROOM} の宝箱＝${CHEST} のルピー×20 だけ`, same(room.chestContents, CHEST_CONTENTS));
check(`${ROOM} の links＝ボタン ${LINKS.map((l) => l.switchId).join('・')}→門 ${GATE} の2本`, same(room.links, LINKS));
check(`${ROOM} の showConditions が空（宝箱は門で守る）`, Object.keys(room.showConditions).length === 0);
check(`${ROOM} の看板 ${SIGN} は {name,lines} 形式で本文あり`, at(t, SIGN) === TILE.SIGN
	&& Array.isArray(room.signData[SIGN]?.lines) && room.signData[SIGN].lines.length > 0);
check(`番人 ${WARDEN} はチェイサー（'${at(t, WARDEN.join(','))}'＝${ENEMY_META[at(t, WARDEN.join(','))]?.name}・ボスでない・既定の追跡）`,
	at(t, WARDEN.join(',')) === 'C' && !ENEMY_META.C.isBoss && ENEMY_META.C.speed === 0.5);
{
	const count = (ch) => t.flat().filter((x) => x === ch).length;
	check(`石2・ボタン2・門1・宝箱1・敵1（石 ${stonesStr(STONES)}・ボタン ${stonesStr(BUTTONS)}・${GATE}・${CHEST}・${WARDEN}）`,
		count(TILE.STONE) === 2 && STONES.every((p) => at(t, p.join(',')) === TILE.STONE)
		&& count(TILE.BUTTON) === 2 && BUTTONS.every((p) => at(t, p.join(',')) === TILE.BUTTON)
		&& count(TILE.GATE) === 1 && at(t, GATE) === TILE.GATE
		&& count(TILE.CHEST) === 1 && at(t, CHEST) === TILE.CHEST
		&& t.flat().filter((x) => ENEMY_META[x]).length === 1);
	check(`石・ボタン・番人・柱は全部檻の中`, [...STONES, ...BUTTONS, WARDEN].every((p) => PEN.includes(p.join(',')))
		&& PILLARS.every((k) => PEN.includes(k) && at(t, k) === TILE.WALL));
}
check(`外周の口の形が書き換え前と同じ（北・西・南の3口）`, ringOf(room.tiles.map(rowStr)) === ringOf(before));

// ── ② 歩ける床・檻・宝箱 ─────────────────────────────────────────────
const walk = reach(t, allOpenings);
const fly = reach(t, allOpenings, { openGate: true, fly: true });
{
	for (const [name, cells] of Object.entries(OPENINGS)) {
		const w = reach(t, cells);
		check(`${name}の口から他の2口へ歩ける`, allOpenings.every((k) => w.has(k)));
	}
	check(`檻の中へは歩いても飛んでも入れない（門を開けても）`, PEN.every((k) => !walk.has(k) && !fly.has(k)));
	check(`門 ${GATE} を閉じたままでは宝箱 ${CHEST} に届かない`, !walk.has(CHEST));
	check(`門を開ければ宝箱 ${CHEST} に届く`, reach(t, allOpenings, { openGate: true }).has(CHEST));
	const chestNb = nbrs(CHEST).filter((k) => at(t, k) !== TILE.WALL);
	check(`宝箱 ${CHEST} の隣で壁でないのは門 ${GATE} だけ（実測 ${chestNb.join(' ')}）`, same(chestNb, [GATE]));
	check(`看板 ${SIGN} の隣に立てる床がある`, nbrs(SIGN).some((k) => walk.has(k)));
	check(`解の立ち位置 (8,10)・(1,4)・(1,5)・(4,1)・(3,4) に歩いて立てる`, ['8,10', '1,4', '1,5', '4,1', '3,4'].every((k) => walk.has(k)));
}

// ── ③ 番人を倒せない ────────────────────────────────────────────────
function safety(tt) {
	const stand = reach(tt, allOpenings, { openGate: true, fly: true });
	let minD = Infinity, minAt = '';
	for (const s of stand) for (const p of PEN) {
		const [a, b] = s.split(',').map(Number), [c, d] = p.split(',').map(Number);
		const dd = Math.hypot(a - c, b - d);
		if (dd < minD) { minD = dd; minAt = `${s}→${p}`; }
	}
	const lines = [];
	for (const s of stand) {
		const [r, c] = s.split(',').map(Number);
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			for (let i = 1; ; i++) {
				const k = `${r + dr * i},${c + dc * i}`;
				const ch = at(tt, k);
				if (ch === undefined || ch === TILE.WALL || ch === TILE.BREAKABLE_WALL) break;
				if (PEN.includes(k)) { lines.push(`${s}→${k}`); break; }
			}
		}
	}
	return { minD, minAt, lines };
}
{
	const bombR = ITEM_META.bomb?.aoeRadius ?? 2;
	const s = safety(t);
	check(`立てるどのセル（歩き・飛行）からも檻の中は爆弾の半径 ${bombR} より遠い（最短 ${s.minD.toFixed(2)}＝${s.minAt}）`, s.minD > bombR);
	check(`同じく剣の届き ${SWORD_REACH}・ロウソクの前方1マスより遠い`, s.minD > Math.max(SWORD_REACH, 1) + 0.5);
	check(`立てるセルから檻の中へのまっすぐの射線は全部壁で止まる（実測 ${s.lines.join(' ') || 'なし'}）`, s.lines.length === 0);
	// 対照＝檻の西の外側の壁（col5）を木にすると、飛行で木の上から爆弾が届く
	const trees = grid();
	for (let r = 2; r <= 5; r++) trees[r][5] = TILE.TREE;
	const st = safety(trees);
	check(`対照：西の外側を木にすると飛行で檻まで距離 ${st.minD.toFixed(2)}（${st.minAt}）＝爆弾が届く`, st.minD <= bombR);
}

// ── ④ 番人の誘導の実測（歩くモデル）───────────────────────────────────
{
	const cells = [...walk].map((k) => k.split(',').map(Number)).filter(([r, c]) => r > 0 && r < ROWS - 1 && c > 0);
	const starts = cells.filter(([r, c]) => (r === 1 && (c === 5 || c === 6)) || (c === 1 && (r === 4 || r === 5)) || (r === ROWS - 2 && (c === 5 || c === 6)));
	check(`口に接する立てるセル（実測 ${starts.map((p) => p.join(',')).join(' ')}）が北・西・南の全部にある`,
		starts.some(([r]) => r === 1) && starts.some(([, c]) => c === 1) && starts.some(([r]) => r === ROWS - 2));
	const m = walkModel(t, cells, starts);
	check(`歩くモデル：最短 26 歩で両方の石がボタンに乗る（実測 ${m.steps} 歩・(番人,石) の状態 ${m.states}）`, m.steps === 26);
	check(`歩くモデル：詰み（どこに立っても解けない番人×石の配置）が 0（実測 ${m.dead.length}：${m.dead.slice(0, 6).join(' ')}）`, m.dead.length === 0);
	const sim = makeSim(t);
	// 1か所に立ち続けるだけでは解けない
	const oneSpot = cells.filter((P) => {
		let [ey, ex, st] = [WARDEN[0], WARDEN[1], STONES];
		for (let i = 0; i < 80; i++) { [ey, ex, st] = sim.step(ey, ex, st, P); if (stoneKey(st) === GOAL) return true; }
		return false;
	});
	check(`1か所に立ち続けるだけでは解けない（実測 ${oneSpot.map((p) => p.join(',')).join(' ') || 'なし'}）`, oneSpot.length === 0);
	// 入室で動かない＝番人が動き出す立ち位置は南東の角 (8,10) だけ
	const moves = cells.filter((P) => { const [ey, ex] = sim.step(WARDEN[0], WARDEN[1], STONES, P); return ey !== WARDEN[0] || ex !== WARDEN[1]; })
		.map((p) => p.join(','));
	check(`番人が動き出す立ち位置は ${cells.length} セル中 (8,10) だけ（実測 ${moves.join(' ')}）`, same(moves, ['8,10']));
	// 歩き方の台本
	const A = walkScript(t, [8, 6], [[8, 10], 5, [8, 4], [1, 4], [1, 5], 6, [4, 4], [4, 1], 6, [4, 4], [3, 4]]);
	if (A.error) check(`台本 A が床だけを歩く（${A.error}）`, false);
	check(`台本：南東の角 (8,10) → 北西 (1,5) → 西 (4,1) → (3,4)＝解ける（実測 ${A.walked} 歩・石 ${stonesStr(A.stones)}）`, A.solved);
	const A1 = walkScript(t, [8, 6], [[8, 10], 5]);
	check(`台本：南東の角で待つと1個目がボタン (5,10) に乗るが、もう1個は動かない（実測 石 ${stonesStr(A1.stones)}）`,
		!A1.solved && stonesStr(A1.stones) === stonesStr([[3, 9], [5, 10]]));
	const C = walkScript(t, [1, 5], [[1, 4], [4, 4], [4, 1], [7, 1], [7, 6], [8, 6], [8, 9], [8, 5], [7, 4], [1, 4], [1, 5], 20]);
	if (C.error) check(`台本 C が床だけを歩く（${C.error}）`, false);
	check(`台本：北から入って西側と南の通路 (8,9) までを歩き回る＝番人は袋から動かない（実測 ${C.warden}）`, !C.solved && same(C.warden, WARDEN));
	// 対照＝柱を1本でも外すと解けない（柱が手順を作っている）
	for (const k of PILLARS) {
		const noPillar = grid(); const [r, c] = k.split(',').map(Number); noPillar[r][c] = TILE.FLOOR;
		const mm = walkModel(noPillar, cells, starts);
		check(`対照：柱 ${k} を外すと解けない（実測 最短 ${mm.steps}・詰み ${mm.dead.length}）`, mm.steps === Infinity && mm.dead.length > 0);
	}
}

// ── ⑤ はしご・層の到達性 ─────────────────────────────────────────────
{
	const bridges = [];
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		if (LADDER_OVER.has(t[r][c]) && isLadderBridgeCell(t, ROWS, COLS, r, c, room.bgTiles)) bridges.push(`${r},${c}`);
	}
	check(`はしごで架けられるセルが1枚も無い（実測 ${bridges.join(' ') || 'なし'}）`, bridges.length === 0);
	const closed = layerRun();
	const open = layerRunOpen();
	const sameSet = (a, b) => same([...a].sort(), [...b].sort());
	check(`門を閉じたままの到達室が書き換え前と同じ（${closed.reachedRooms.size} 室）`, sameSet(closed.reachedRooms, baseClosed.reachedRooms));
	check(`錠を全部開けた到達室が書き換え前と同じ（${open.reachedRooms.size}/${Object.keys(stages).length} 室）`, sameSet(open.reachedRooms, baseOpen.reachedRooms));
	check(`${ROOM} に到達できる`, closed.reachedRooms.has(ROOM));
	check(`レイヤーの dead-edge が 0（実測 ${closed.deadEdges.length}）`, closed.deadEdges.length === 0);
}

// ── 出力 ─────────────────────────────────────────────────────────────
console.log(`# ${LAYER} ${ROOM}：飾りの石＋ボタンの門を「檻の番人」（石2個）に作り替える（キュー34）`);
console.log(log.join('\n') || '  （変更なし）');
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
