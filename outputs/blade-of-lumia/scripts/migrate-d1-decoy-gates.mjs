// D1 の「飾りの仕掛け」2室を、仕掛けを使わないと報酬に届かない盤面へ作り替える。
//
// 実行キュー20（2026-09-21・🧠 Opus）。着手前に `scripts/measure-puzzle.mjs` をダンジョン層
// 対応にして現物を測り、2室とも仕掛けが完全な飾りであることを対照実験で確定させた：
//   ・`dungeon_1 2,1`：報酬（宝箱 4,10）は東の境界口 (4,11) の真横∴**L=1**。
//     `--no-push`（石を押さない）でも **L=1**＝石・ボタン・扉は1つも要らない。
//   ・`dungeon_1 2,2`：報酬（洞窟の地図 m 2,3）まで **L=4**。`--kill 8,9`（Y を壁で潰す）
//     でも **L=4**＝扉 T(2,9) は行1・行3 の素通しで迂回できる。
//
// 直しの方針＝**境界（外周の口）は1マスも動かさない**＝部屋間の接続は不変。
// 室内に壁を足して報酬を「扉の奥の袋小路」に移す（`check-dungeon-integrity.mjs` /
// `check-dungeon-connectivity.mjs` の出力は動かない）。
//
//   ① 2,1「石の重し」：宝箱を北東の袋小路（内部 rows1-2 × cols8-10）へ移し、
//      その唯一の口を扉 T(3,9) にする。扉を開ける手は「石 *(3,5) をボタン S(4,5) に
//      乗せる」だけ（プレイヤーが足で踏んでも開くが、踏んでいる間は袋小路へ行けない）。
//      石が全ボタンに乗ると恒久ロック（Phase 4.56）∴中に入った後に閉じ込められない。
//      チェイサー C は袋小路の中（1,8）へ移す＝**宝の番人**。扉の真上 (2,9) には置かない
//      （袋小路の唯一の口∴そこに居座ると扉を開けても入れず「扉の前で殴る」だけになる）。
//      ⚠️ 敵は石を押す（`enemy-ai.js tryEnemyPushStone`）∴石と同じ列に置いたままだと
//         入室直後に敵が石をボタンへ落として「無料で開く」。扉の奥に封じれば、扉が開く
//         時点で石はロック済み＝敵は石を押せない（同 1462 行）。
//   ② 2,2「壁の刻み（Y スイッチ）」：地図 m を北西の袋小路（内部 rows1-2 × cols1-2）へ
//      移し、その唯一の口を扉 T(3,2) にする。開ける手は Y(8,9) を叩くこと。
//      ⚠️ 袋小路からは Y に**射線も届かない**（行も列も一致しない）∴後で弓を持って
//         戻っても自分を閉じ込められない。看板 (4,3)「壁の刻み」の本文はそのまま生きる
//         （「打てば開き、また打てば閉じる」＝この直しで初めて意味を持つ）。
//
// 石の詰み（デッドロック）は「部屋を出れば石が初期位置に戻る」（`game/game.js enterStage`
// の未解決リセット）で救済される∴軸③の deadlock>0 は取り返しのつく難しさ。
//
// 使い方:
//   node scripts/migrate-d1-decoy-gates.mjs
//   BLADE_MAP_PATH=.scratch/dry.json node scripts/migrate-d1-decoy-gates.mjs   # 空撃ち
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ROWS, COLS, makeSolver } from './lib/blade-solver.mjs';
import { measureMetrics } from './lib/puzzle-metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = process.env.BLADE_MAP_PATH
	? path.resolve(process.env.BLADE_MAP_PATH)
	: path.join(ROOT, 'work/blade-of-lumia.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// ── 盤面の定義（before を全行ぶん書く＝1文字でも違えば止まる）─────────────
// tiles は文字配列の配列（[[blade-field-tiles-are-char-arrays]] と同じ形）。
const ROOMS = [
	{
		key: '2,1',
		label: '石の重しの部屋',
		before: [
			'############',
			'#..........#',
			'#....C.....#',
			'#....*.....#',
			'#....S...TB.',
			'#....#......',
			'#..........#',
			'#..........#',
			'#..........#',
			'#####..#####',
		],
		after: [
			'############',
			'#......#C.B#',
			'#......#...#',
			'#....*..#T##',
			'#....S......',
			'#....#......',
			'#..........#',
			'#..........#',
			'#..........#',
			'#####..#####',
		],
		links: [{ switchId: '4,5', gateId: '3,9' }],
		// 宝箱の中身は動かさない（キュー13「しょぼい報酬の見直し」の担当範囲）。
		chestMove: { from: '4,10', to: '1,10' },
		reward: '1,10',
		control: { kind: 'noPush', why: '石を押さない' },
	},
	{
		key: '2,2',
		label: '壁の刻み（Y スイッチ）の部屋',
		before: [
			'#####..#####',
			'#..........#',
			'#..m.....T.#',
			'#..........#',
			'...i........',
			'............',
			'#..........#',
			'#..........#',
			'#........Y.#',
			'############',
		],
		after: [
			'#####..#####',
			'#m.#.......#',
			'#..#.......#',
			'##T#.......#',
			'...i........',
			'............',
			'#..........#',
			'#..........#',
			'#........Y.#',
			'############',
		],
		links: [{ switchId: '8,9', gateId: '3,2' }],
		reward: '1,1',
		control: { kind: 'kill', cell: '8,9', why: 'Y を壁で潰す' },
	},
];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const toGrid = (rows) => rows.map((r) => [...r]);

function stage(key) {
	const st = map.layers?.dungeon_1?.stages?.[key];
	if (!st) throw new Error(`stage が無い: dungeon_1 ${key}`);
	return st;
}

// 外周の口（＝境界の開き）を文字列にする。直しの前後で一致することを確かめるため。
function edgeSig(rows) {
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[ROWS - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[COLS - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

console.log(`対象: ${MAP_PATH}`);

for (const room of ROOMS) {
	const st = stage(room.key);
	const cur = rowsOf(st);
	console.log(`\n── dungeon_1 ${room.key}「${room.label}」──`);

	// 形の検算（盤面を手で書き間違えていないか＝移行前に落とす）
	for (const [name, rows] of [['before', room.before], ['after', room.after]]) {
		if (rows.length !== ROWS) throw new Error(`${room.key} の ${name} が ${rows.length} 行`);
		for (const [i, r] of rows.entries()) if (r.length !== COLS) throw new Error(`${room.key} ${name} r${i} が ${r.length} 文字`);
	}
	if (edgeSig(room.before) !== edgeSig(room.after)) {
		throw new Error(`${room.key}: 境界の開きが変わる（部屋間の接続が動く）\n  before: ${edgeSig(room.before)}\n  after : ${edgeSig(room.after)}`);
	}

	const already = cur.join('\n') === room.after.join('\n');
	if (already) {
		console.log('  = 盤面は既に新しい形');
	} else {
		if (cur.join('\n') !== room.before.join('\n')) {
			throw new Error(`${room.key}: 盤面が想定の before と違う\n  実際:\n${cur.map((r) => `    ${r}`).join('\n')}`);
		}
		st.tiles = toGrid(room.after);
		console.log('  ✔ 盤面を差し替えた');
	}

	// links（switch → gate）の付け替え
	if (JSON.stringify(st.links) === JSON.stringify(room.links)) {
		console.log(`  = links は既に ${JSON.stringify(room.links)}`);
	} else {
		if (st.links?.length !== 1 || st.links[0].switchId !== room.links[0].switchId) {
			throw new Error(`${room.key}: links が想定と違う: ${JSON.stringify(st.links)}`);
		}
		st.links = room.links.map((l) => ({ ...l }));
		console.log(`  ✔ links を ${JSON.stringify(st.links)} に付け替えた`);
	}

	// 宝箱の中身の引っ越し（中身は1文字も変えない）
	if (room.chestMove) {
		const { from, to } = room.chestMove;
		const cc = st.chestContents ?? {};
		if (cc[to] && !cc[from]) {
			console.log(`  = 宝箱の中身は既に (${to})`);
		} else {
			if (!cc[from]) throw new Error(`${room.key}: 宝箱の中身 (${from}) が無い: ${JSON.stringify(cc)}`);
			if (cc[to]) throw new Error(`${room.key}: 移設先 (${to}) に既に中身がある`);
			cc[to] = cc[from];
			delete cc[from];
			st.chestContents = cc;
			console.log(`  ✔ 宝箱の中身を (${from}) → (${to}) へ移した（中身は不変: ${JSON.stringify(cc[to])}）`);
		}
	}
}

// ── 書き出し（整形はスペース2＝既存と揃える。タブだと全行が差分になる）──────
fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き出した: ${MAP_PATH}`);

// ── 自己検証＝「仕掛けを使わないと報酬に届かない」をソルバーで示す ────────────
// D1 は道具ゼロ（`shared/progression.js toolsUsableIn`）＝剣だけで測る。
// 対照実験で潰すセルは必ず '#'（未知文字だと通行可になり全部「必須でない」と出る
// ＝[[blade-control-experiment-needs-tile-wall]]）。
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const problems = [];
	const SOLVER_OPTS = { hasLadder: false, hasCandle: false, noTools: true };

	function build(st, { noPush = false, kill = null } = {}) {
		const tiles = st.tiles.map((r) => (Array.isArray(r) ? r.slice() : [...r]));
		if (kill) {
			const [r, c] = kill.split(',').map(Number);
			tiles[r][c] = TILE.WALL;
		}
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		for (const [k, ch] of Object.entries(st.bgTiles ?? {})) {
			const [r, c] = k.split(',').map(Number); bg[r][c] = ch;
		}
		const linkMap = new Map();
		for (const { switchId, gateId } of st.links ?? []) {
			if (!linkMap.has(switchId)) linkMap.set(switchId, []);
			linkMap.get(switchId).push(gateId);
		}
		return makeSolver(tiles, bg, [...linkMap.entries()], {}, new Set(), { ...SOLVER_OPTS, noPush });
	}

	function measure(st, reward, opts) {
		const S = build(st, opts);
		const starts = S.exitCells.map((cell) => {
			const [r, c] = cell.split(',').map(Number);
			return S.encode(r, c, S.initStones, 0, 0, S.litInitMask);
		});
		const [gr, gc] = reward.split(',').map(Number);
		const goalTest = (state) => state.split('|')[0] === reward;
		const h = (state) => {
			const [pr, pc] = state.split('|')[0].split(',').map(Number);
			return Math.abs(pr - gr) + Math.abs(pc - gc);
		};
		return measureMetrics(S, starts, goalTest, h, {
			guardMax: 2000000,
			escapeTest: (state) => S.exitCells.includes(state.split('|')[0]),
		});
	}

	for (const room of ROOMS) {
		const st = after.layers.dungeon_1.stages[room.key];
		const rows = rowsOf(st);
		const label = `dungeon_1 ${room.key}`;

		// (a) 盤面が after と一致・境界の開きが before と同じ
		if (rows.join('\n') !== room.after.join('\n')) problems.push(`${label}: 盤面が after と違う`);
		if (edgeSig(rows) !== edgeSig(room.before)) problems.push(`${label}: 境界の開きが変わった＝部屋間の接続が動く`);

		// (b) 報酬セルに報酬がある（宝箱 'B' か床の地図 'm'）
		const [rr, rc] = room.reward.split(',').map(Number);
		const rewardTile = st.tiles[rr][rc];
		if (![TILE.CHEST, TILE.ITEM_DUNGEON_MAP].includes(rewardTile)) {
			problems.push(`${label}: 報酬セル (${room.reward}) が報酬でない（'${rewardTile}'）`);
		}
		if (rewardTile === TILE.CHEST && !st.chestContents?.[room.reward]) {
			problems.push(`${label}: 宝箱 (${room.reward}) に中身が無い`);
		}

		// (c) 扉（links の gateId）が実際に 'T' で、報酬の袋小路の唯一の口である
		const gateId = st.links[0].gateId;
		const [tr, tc] = gateId.split(',').map(Number);
		if (st.tiles[tr][tc] !== TILE.GATE) problems.push(`${label}: gateId (${gateId}) が 'T' でない（'${st.tiles[tr][tc]}'）`);

		// (d) 素の測定＝報酬に届く／届くまで十分深い／入って詰まない
		const m = measure(st, room.reward);
		if (m.L === Infinity || m.L === null) problems.push(`${label}: 報酬に届かない（解なし）`);
		else if (m.L < 6) problems.push(`${label}: L=${m.L} < 6＝浅すぎる`);
		if (m.noEscape !== 0) problems.push(`${label}: 入って詰む状態が ${m.noEscape} 件`);

		// (e) 対照実験＝仕掛けを殺すと届かない（＝飾りでない）
		const ctl = measure(st, room.reward, room.control.kind === 'noPush' ? { noPush: true } : { kill: room.control.cell });
		const dead = ctl.L === Infinity || ctl.L === null;
		if (!dead) problems.push(`${label}: 対照実験（${room.control.why}）でも L=${ctl.L} で届く＝まだ飾り`);

		console.log(`\n${label}「${room.label}」`);
		console.log(`  報酬セル ${room.reward} / 状態 ${m.states} / L=${m.L} / 貪欲 ${m.greedy ? 'YES' : 'NO'} / deadlock ${m.deadlocks} / 詰み ${m.noEscape}`);
		console.log(`  対照実験（${room.control.why}）: ${dead ? '✅ 報酬に届かない（解なし）' : `❌ L=${ctl.L}`}`);
	}

	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('\n✅ 自己検証 OK');
}
