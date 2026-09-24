// dark_tower 4F・5F：無人だった2室に実戦を戻す
// （2026-09-23 / PLAN 実行キュー 20b ⑤-a・設計は Opus）。
//
// ■ 何が壊れていたか（キュー20b の棚卸し⑲・⑤の実測＝`.scratch/20b-5-thin-rooms.mjs`）
//   階ごとの脅威度合計が B1F 134.0 / 1F 249.0 / 2F 80.0 / 3F 197.0 / **4F 8.0 / 5F 0.0**
//   ＝塔を登るほど楽になっていた。とくに
//     ・`5,2`（玉座の直前）は **タイルが1つも無い完全な空室**
//     ・`4,1` はパトロール E×2（8.0）だけ＝4F は実質無人
//   ∴「最後の階が一番静か」という逆のカーブになっていた。
//
// ■ 新しい機構（不変条件は PLAN 20b ⑤の (d1)〜(d4)＝2026-09-23 に (d) を改訂した）
//   ・`5,2` ＝**玉座の門番の間**（0.0 → 117.0）。玉座 `5,3` へ抜ける南の口 (9,5)(9,6) の
//     両脇に盾騎士 ζ(8,4)=right / ζ(8,7)=left を「通路を正面に見て」据え、部屋の半ばに
//     剣獣 μ(4,3) を置く。塔の入口 `0,1`「正面を固めた関所」（盾騎士2体を上向き）の再演＝
//     **塔の最初と最後で同じ顔を見せ、最後は剣獣が1体増える**。
//     ⚠️ ζ は通路そのもの（col5/6）には置かない＝置くと2体を倒すまで進めず事実上 killAll に
//     なる（④で関門は打ち止め＝走り抜けも残す、が設計）。両脇からの挟み撃ちだけを課す。
//     柱 '#' を (3,3)(3,8)(6,3)(6,8) に4本立てる＝素の箱の使い回し（棚卸し⑫）も同時に解く。
//   ・`4,1` ＝**4F の実戦**（8.0 → 81.0）。E×2 を撤去して 剣獣 μ(2,6)＋盾騎士 ζ(2,3)=down。
//     ⚠️ **速い敵を1体混ぜるのが要件**＝ζ は speed 0.25 で遅く、ζ だけだと走り抜けて完全に
//     無視できる（「実戦室」が名前だけになる）。μ は speed 0.85 ∴動線へ寄ってくる。
//     ⚠️ 階段の着地セル `(6,4)`（`mapEnters.4fEntrance`）の周囲は空ける＝敵は row2 だけに
//     置く（着地直後に囲まれるのは不公平＝棚卸し⑪と同じ筋）。
//
// ■ 検証（このスクリプト自身が最後に全部やる）
//   ・両室の盤面と `enemyDirs`／既存の看板・階段（signData・mapEnters）が消えていないこと
//   ・境界の開きが不変（部屋間の接続を動かさない）
//   ・脅威度＝`4,1` 81.0／`5,2` 117.0／塔の非ボス合計 ≤ 900（不変条件 (d4)）
//   ・(d1) 塔の全階に実戦室が1室以上ある／(d2) 最後の群れ `5,2` ≥ 3F の大広間 112.5
//   ・全道具ありの BFS で塔 30 室すべてに到達する（接続を壊していない）
//   再実行しても同じ結果になる（既に適用済みを検出して飛ばす）＝冪等。
//
// 使い方:
//   node scripts/migrate-dark-tower-45f-encounters.mjs --dry   # 検査と差分のみ
//   node scripts/migrate-dark-tower-45f-encounters.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bfsLayer } from './lib/connectivity.mjs';
import { ENEMY_META } from '../shared/enemies.js';
import { THREAT_OF } from './lib/enemy-placement.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const LAYER = 'dark_tower';
const THREAT_CAP = 900;          // 不変条件 (d4)（2026-09-23 ユーザー承認＝現状比 +35%）
const LAST_FIGHT_FLOOR = 112.5;  // 不変条件 (d2)＝3F の大広間 `3,3`

// ── `4,1`＝4F の実戦 ────────────────────────────────────────────────
const F4_ROOM = '4,1';
const F4_BEFORE = [
	'############',
	'#i.........#',
	'#...E..E...#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const F4_TARGET = [
	'############',
	'#i.........#',
	'#..ζ..μ....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
// ⚠️ 2026-09-23（この番の後）に刻み文 i(1,1) を `4,2` (7,1) へ移設した
// （`scripts/migrate-dark-tower-4f-stone-room-sign.mjs`）∴今の盤面の row1 は看板なし。
// 「既に適用済み」を看板の有無どちらでも認める＝この番の移行を今の盤面で再実行しても
// 止まらず、かつ移設済みの看板を書き戻さない（1F 分と同じ作法）。
const F4_TARGET_SIGN_MOVED = F4_TARGET.map((row, i) => (i === 1 ? '#..........#' : row));
const F4_DIRS = { '2,3': 'down' };   // 階段の着地セル (6,4) は南＝プレイヤーが来る側へ正面を向ける
// 撤去するパトロール E×2 に付いていた向き指定（これ以外が入っていたら止まる）
const F4_DIRS_BEFORE = { '2,4': 'right', '2,7': 'left' };

// ── `5,2`＝玉座の門番の間 ──────────────────────────────────────────
const F5_ROOM = '5,2';
const F5_BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const F5_TARGET = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..#....#..#',
	'#..μ.......#',
	'#..........#',
	'#..#....#..#',
	'#..........#',
	'#...ζ..ζ...#',
	'#####..#####',
];
const F5_DIRS = { '8,4': 'right', '8,7': 'left' };   // 門の両脇＝通路（col5/6）を正面に見る

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = data.layers?.[LAYER];
if (!layer) die(`レイヤー ${LAYER} が無い`);
const stages = layer.stages;

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

const log = [];
const step = (mark, msg) => { log.push(`  ${mark} ${msg}`); };
const rowsOf = (st) => st.tiles.map((r) => r.join(''));

const before = {};

// ──────────────────────────────────────────────────────────────────────
// ① 盤面と enemyDirs を当てる（旧盤面と一致しなければ止まる＝取り違え防止）
// ──────────────────────────────────────────────────────────────────────
function applyRoom(key, beforeRows, targetRows, dirs, dirsBefore, comment, doneVariants = []) {
	const st = stages[key];
	ok(st, `${key} が無い`);
	ok(Array.isArray(st.tiles) && st.tiles.every(Array.isArray),
		`${key} の tiles が文字配列の配列でない`);   // [[field-tiles-are-char-arrays]]
	ok(st.rows === targetRows.length && st.cols === targetRows[0].length,
		`${key} の寸法が想定外: ${st.rows}x${st.cols}`);

	const now = rowsOf(st);
	before[key] = now;

	if ([targetRows, ...doneVariants].some((v) => now.join('\n') === v.join('\n'))) {
		step('=', `${key} の盤面は既に狙いどおり`);
	} else {
		for (let r = 0; r < beforeRows.length; r++) {
			ok(now[r] === beforeRows[r],
				`${key} row${r} が旧盤面と違う: '${now[r]}' 期待 '${beforeRows[r]}'`);
		}
		st.tiles = targetRows.map((row) => [...row]);
		step('✔', `${key} を作り替えた`);
	}

	const cur = st.enemyDirs ?? (st.enemyDirs = {});
	if (JSON.stringify(cur) === JSON.stringify(dirs)) {
		step('=', `${key} の enemyDirs は既に狙いどおり`);
	} else {
		// 撤去する敵の向き指定（旧 dirs）だけを置き換える＝想定外の指定が在れば止まる
		ok(JSON.stringify(cur) === JSON.stringify(dirsBefore),
			`${key} に既に別の enemyDirs が在る: ${JSON.stringify(cur)} 期待 ${JSON.stringify(dirsBefore)}`);
		st.enemyDirs = { ...dirs };
		step('✔', `${key} の enemyDirs を置き換えた（${JSON.stringify(cur)} → ${JSON.stringify(dirs)}）`);
	}

	st.comment = comment;
}

applyRoom(F4_ROOM, F4_BEFORE, F4_TARGET, F4_DIRS, F4_DIRS_BEFORE,
	'[dark_tower 4,1] 4F の実戦（キュー20b ⑤-a・2026-09-23）。無人だった 4F'
	+ '（パトロール E×2＝8.0 だけ）に剣獣 μ(2,6)＋盾騎士 ζ(2,3) を置いた＝脅威度 81.0。'
	+ 'ζ は speed 0.25 で遅く単体だと走り抜けられる∴speed 0.85 の μ を混ぜて「避けられない」'
	+ '実戦にした。階段の着地セル (6,4) の周りは空けている（棚卸し⑪＝階段と強敵を同室にする'
	+ 'なら着地直後に囲まれない配置にする）。'
	+ '⚠️ 刻み文 i(1,1) は 2026-09-23 に `4,2` (7,1) へ移設した'
	+ '（「この上は 石の 間」＝方向が逆／石の間の詰み回復（笛）の案内が2室手前にあった）。',
	[F4_TARGET_SIGN_MOVED]);

applyRoom(F5_ROOM, F5_BEFORE, F5_TARGET, F5_DIRS, {},
	'[dark_tower 5,2] 玉座の門番の間（キュー20b ⑤-a・2026-09-23）。タイルが1つも無い'
	+'完全な空室だった（棚卸し⑤）。玉座 5,3 への南の口 (9,5)(9,6) の両脇に盾騎士'
	+ ' ζ(8,4)=right / ζ(8,7)=left を通路を正面に見て据え、半ばに剣獣 μ(4,3)＝脅威度 117.0'
	+ '＝塔の入口 0,1「正面を固めた関所」の再演（最初と最後で同じ顔・最後は剣獣が1体増える）。'
	+ '⚠️ 通路 col5/6 には敵を置かない＝置くと2体を倒すまで進めず事実上 killAll になる'
	+ '（④で関門は打ち止め＝走り抜けも残す）。柱 4本は素の箱の使い回し（棚卸し⑫）の解消。');

// ──────────────────────────────────────────────────────────────────────
// ② 検証
// ──────────────────────────────────────────────────────────────────────
const verify = [];
function check(msg, cond) { verify.push([cond, msg]); }

const threatOfRoom = (st) => {
	let t = 0;
	for (const row of st.tiles) for (const ch of row) if (ENEMY_META[ch]) t += THREAT_OF(ENEMY_META[ch]);
	return t;
};
const openingSig = (st) => {
	const rows = rowsOf(st);
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[st.rows - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[st.cols - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
};

{
	const f4 = stages[F4_ROOM], f5 = stages[F5_ROOM];
	check(`${F4_ROOM} の盤面が狙いどおり（看板の移設前／移設後のどちらか）`,
		[F4_TARGET, F4_TARGET_SIGN_MOVED].some((v) => rowsOf(f4).join('\n') === v.join('\n')));
	check(`${F5_ROOM} の盤面が狙いどおり`, rowsOf(f5).join('\n') === F5_TARGET.join('\n'));
	check(`${F4_ROOM} の enemyDirs が狙いどおり`, JSON.stringify(f4.enemyDirs) === JSON.stringify(F4_DIRS));
	check(`${F5_ROOM} の enemyDirs が狙いどおり`, JSON.stringify(f5.enemyDirs) === JSON.stringify(F5_DIRS));

	// 既存の作り込みを消していない
	check(`${F4_ROOM} の階段 mapEnters(6,4) が残っている`,
		f4.mapEnters?.['6,4']?.id === '4fEntrance' && f4.tiles[6][4] === '>');
	// (1,1) は刻み文（本文つき）か床のどちらか＝2026-09-23 に `4,2` へ移設したので今は床。
	// 片方だけ残る形（無言看板／死にデータ）にはしない。[[blade-sign-two-formats]]
	check(`${F4_ROOM} (1,1) が「本文つきの刻み文」か「床」のどちらか`,
		(f4.tiles[1][1] === 'i' && (f4.signData?.['1,1']?.lines?.length ?? 0) >= 2)
		|| (f4.tiles[1][1] === '.' && !f4.signData?.['1,1']));
	check(`${F5_ROOM} に宝箱・看板・階段を足していない`,
		Object.keys(f5.chestContents ?? {}).length === 0
		&& Object.keys(f5.signData ?? {}).length === 0
		&& Object.keys(f5.mapEnters ?? {}).length === 0);

	// 境界の開き＝部屋間の接続を動かしていない
	check(`${F4_ROOM} の境界の開きが N[] S[5,6] W[] E[]（実測: ${openingSig(f4)}）`,
		openingSig(f4) === 'N[] S[5,6] W[] E[]');
	check(`${F5_ROOM} の境界の開きが N[5,6] S[5,6] W[] E[]（実測: ${openingSig(f5)}）`,
		openingSig(f5) === 'N[5,6] S[5,6] W[] E[]');

	// 門番は通路そのものを塞がない（走り抜けを残す＝事実上の killAll にしない）
	const corridorClear = [8, 7, 5, 4, 2, 1].every((r) => !ENEMY_META[f5.tiles[r][5]] && !ENEMY_META[f5.tiles[r][6]]);
	check(`${F5_ROOM} の通路（col5/6）に敵が1体もいない＝走り抜けが残る`, corridorClear);

	// 着地セルの周り（±2マス）に敵がいない
	const nearLanding = [];
	for (let r = 4; r <= 8; r++) for (let c = 2; c <= 6; c++) if (ENEMY_META[f4.tiles[r][c]]) nearLanding.push(`${r},${c}`);
	check(`${F4_ROOM} の着地セル (6,4) の周囲±2に敵がいない（実測: ${nearLanding.join(' ') || 'なし'}）`,
		nearLanding.length === 0);

	// 脅威度
	check(`${F4_ROOM} の脅威度が 81.0（実測 ${threatOfRoom(f4).toFixed(1)}）`, threatOfRoom(f4) === 81);
	check(`${F5_ROOM} の脅威度が 117.0（実測 ${threatOfRoom(f5).toFixed(1)}）`, threatOfRoom(f5) === 117);
	check(`${F5_ROOM}（最後の群れ）が 3F の大広間 ${LAST_FIGHT_FLOOR} 以上＝(d2)`,
		threatOfRoom(f5) >= LAST_FIGHT_FLOOR);
	check(`1室の脅威度が 162 以下＝(d3)`, threatOfRoom(f4) <= 162 && threatOfRoom(f5) <= 162);
}

// 階ごとの合計と (d1)(d4)
{
	const byFloor = {};
	let total = 0;
	for (const [key, st] of Object.entries(stages)) {
		if (st.isBossRoom) continue;
		const f = key.split(',')[0];
		const t = threatOfRoom(st);
		byFloor[f] = (byFloor[f] ?? 0) + t;
		total += t;
	}
	const floors = Object.keys(byFloor).sort();
	const summary = floors.map((f) => `${f === '0' ? 'B1' : f}F ${byFloor[f].toFixed(1)}`).join(' / ');
	check(`塔の非ボス合計が ${THREAT_CAP} 以下＝(d4)（実測 ${total.toFixed(1)}／${summary}）`,
		total <= THREAT_CAP);

	// (d1)＝各階に「実戦室」が1室以上（この番では 4F/5F の無人の解消が本体）
	const noFight = floors.filter((f) => !Object.entries(stages).some(([key, st]) =>
		key.startsWith(`${f},`) && !st.isBossRoom && threatOfRoom(st) > 0));
	check(`塔のどの階にも実戦室が1室以上ある＝(d1)（無人の階: ${noFight.join(' ') || 'なし'}）`,
		noFight.length === 0);
}

// 接続＝全道具ありで塔30室に到達する（敵タイルも柱も動線を切っていない）
{
	const res = bfsLayer(stages, { stage: '0,1', row: 5, col: 5 }, {
		withLadder: true, followMapEnters: true, openTiles: new Set(['D', 'T', ':', '!']),
	});
	const rooms = new Set([...res.reachedCells].map((k) => k.split(':')[0]));
	check(`全道具ありで塔の全 ${Object.keys(stages).length} 室に到達する（実測 ${rooms.size}）`,
		rooms.size === Object.keys(stages).length);
	check(`${F5_ROOM} の南の口 (9,5)(9,6) に到達する＝玉座へ抜けられる`,
		res.reachedCells.has(`${F5_ROOM}:9,5`) || res.reachedCells.has(`${F5_ROOM}:9,6`));
}

// ──────────────────────────────────────────────────────────────────────
// 出力
// ──────────────────────────────────────────────────────────────────────
console.log(`# ${LAYER} 4F/5F：無人だった2室に実戦を戻す（キュー20b ⑤-a）`);
console.log(log.join('\n') || '  （変更なし）');

for (const key of [F4_ROOM, F5_ROOM]) {
	console.log(`\n## 盤面の差分（${key}）`);
	stages[key].tiles.forEach((row, i) => {
		const now = row.join('');
		console.log(`   ${String(i).padStart(2)} ${before[key][i]}   ${before[key][i] === now ? '=' : '→'}   ${now}`);
	});
}

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
	const GEAR = 'ps_sword=3&ps_shield=1&ps_armor=2&ps_hearts=10&ps_ladder=1';
	const url = (stage, row, col) => `  http://localhost:18080/blade-of-lumia/game/index.html`
		+ `?fromEditor=1&layer=${LAYER}&stage=${stage}&row=${row}&col=${col}&${GEAR}`;
	console.log('\n▶ 試す URL（npm run dev / port 18080）:');
	console.log(url(F4_ROOM, 6, 4));
	console.log('   階段の着地(6,4)から南へ抜ける＝剣獣が寄ってくる／盾騎士は正面ガード∴側面を取る');
	console.log(url(F5_ROOM, 1, 5));
	console.log('   北から入る＝剣獣が半ばで迎える／門の両脇の盾騎士が通路を正面に見て立つ');
}
