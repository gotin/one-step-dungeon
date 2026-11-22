// scripts/migrate-dark-tower-111-1f-landing.mjs
// 実行キュー111（2026-11-16）：暗黒の塔 1F の踊り場 `1,0` を「剣獣 μ を1体だけ教える柱の間」にする。
//
// 直す前＝素の箱にパトロール E×4（脅威度 16.0）。すぐ南の `1,2` は μ×5 の全滅部屋で、
// μ が初めて出るのにいきなり5体＝μ の戦い方（離れると縦横がそろった時だけ剣ビーム・
// 盾で止まる・柱で射線が切れる）を覚える場所が無かった。
//
// 新しい姿＝2段×左右の柱（1×2）を4本立て、μ を北の (2,5) に1体だけ置く。
//   ・着地セル (6,4) の真上 (5,4) が柱＝着いた瞬間は北からの射線が切れている
//   ・柱の列で縦の射線、柱の段で横の射線が切れる＝隠れながら近づける
//   ・本道（着地 → 南の口 (9,5)(9,6)）は柱の間を素通りできる
// 敵の強さの合計＝塔の非ボス合計 898 → 927（上限は 900 → 950 に引き上げ＝2026-11-16 ユーザー判断）。
//
// 使い方：node scripts/migrate-dark-tower-111-1f-landing.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '1,0';
const LANDING = [6, 4];

const BEFORE = [
	'############',
	'#...E..E...#',
	'#..........#',
	'#..E....E..#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const AFTER = [
	'############',
	'#..........#',
	'#....μ.....#',
	'#..##..##..#',
	'#..........#',
	'#..##..##..#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
const DIRS_BEFORE = { '1,4': 'right', '1,7': 'left', '3,4': 'down', '3,7': 'down' };
const DIRS_AFTER = { '2,5': 'down' };
const COMMENT = '[キュー111] 1F の踊り場＝剣獣 μ の習い場。柱（1×2）4本で縦横の射線を切る。'
	+ '着地 (6,4) の真上 (5,4) が柱＝入った瞬間は撃たれない。μ を1体だけ置き、すぐ南の `1,2`（μ の巣）の前に戦い方を覚えさせる。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const st = data.layers.dark_tower.stages[KEY];
ok(st, `dark_tower ${KEY} が無い`);
const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

// ── 書き換え ─────────────────────────────────────────
const cur = rows();
let changed = false;
if (JSON.stringify(cur) === JSON.stringify(AFTER)) {
	console.log(`… ${KEY} の盤面は既に適用済み`);
} else {
	ok(JSON.stringify(cur) === JSON.stringify(BEFORE), `${KEY} の盤面が想定の旧盤面と違う:\n${cur.join('\n')}`);
	st.tiles = AFTER.map((r) => [...r]);
	changed = true;
	console.log(`✔ ${KEY} の盤面を柱の間に置き換えた`);
}
if (JSON.stringify(st.enemyDirs) === JSON.stringify(DIRS_AFTER)) {
	console.log(`… ${KEY} の enemyDirs は既に適用済み`);
} else {
	ok(JSON.stringify(st.enemyDirs) === JSON.stringify(DIRS_BEFORE), `${KEY} の enemyDirs が想定と違う: ${JSON.stringify(st.enemyDirs)}`);
	st.enemyDirs = { ...DIRS_AFTER };
	changed = true;
	console.log(`✔ ${KEY} の enemyDirs を置き換えた`);
}
if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

// ── 自己検証 ─────────────────────────────────────────
const g = rows().map((r) => [...r]);
const R = g.length, C = g[0].length;
ok(R === 10 && C === 12, '盤面の大きさ');
// ① 境界＝北・東・西は閉じ、南の口は (9,5)(9,6) だけ（20b の階の構造を守る）
ok(g[0].every((ch) => ch === '#'), '北の境界は全部壁');
ok(g.every((row) => row[0] === '#' && row[C - 1] === '#'), '東西の境界は全部壁');
ok(g[R - 1].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0).join() === '5,6', '南の口は cols 5,6');
// ② 階段（着地）と mapEnters がそのまま
ok(g[LANDING[0]][LANDING[1]] === '>', '着地セルは階段タイル');
ok(st.mapEnters?.['6,4']?.id === '1fEntrance', 'mapEnters 1fEntrance がそのまま');
// ③ 敵＝μ が1体だけ・enemyDirs と一致
const enemies = [];
g.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemies.push([r, c, ch]); }));
ok(enemies.length === 1 && enemies[0][2] === 'μ', `敵は μ 1体だけ: ${JSON.stringify(enemies)}`);
ok(Object.keys(st.enemyDirs).join() === `${enemies[0][0]},${enemies[0][1]}`, 'enemyDirs が μ の位置と一致');
// ④ 着地が安全＝±2 に敵なし・μ は着地と同じ行/列に居ない・着地の真上が柱
const [er, ec] = enemies[0];
ok(Math.max(Math.abs(er - LANDING[0]), Math.abs(ec - LANDING[1])) > 2, '着地セル ±2 に敵を置かない');
ok(er !== LANDING[0] && ec !== LANDING[1], 'μ は着地セルと同じ行/列に居ない');
ok(g[LANDING[0] - 1][LANDING[1]] === '#', '着地の真上は柱');
// ⑤ 歩ける床が全部つながっている（孤立した床が無い）・着地から南の口へ行ける
const walk = (ch) => ch !== '#';
const seen = new Set([LANDING.join()]);
const q = [LANDING];
while (q.length) {
	const [r, c] = q.shift();
	for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
		const nr = r + dr, nc = c + dc;
		if (nr < 0 || nc < 0 || nr >= R || nc >= C || !walk(g[nr][nc]) || seen.has(`${nr},${nc}`)) continue;
		seen.add(`${nr},${nc}`); q.push([nr, nc]);
	}
}
let floor = 0;
g.forEach((row, r) => row.forEach((ch, c) => { if (walk(ch)) { floor++; ok(seen.has(`${r},${c}`), `(${r},${c}) が孤立`); } }));
ok(seen.has('9,5') && seen.has('9,6'), '着地から南の口へ行ける');
// ⑥ μ の4近傍は床（動けずに固まらない）
for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ok(g[er + dr][ec + dc] === '.', 'μ の4近傍は床');
console.log(`✔ 自己検証 OK（床 ${floor} マス・μ (${er},${ec})）`);

if (changed && !DRY) {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
	console.log('✔ 書き込んだ');
} else if (changed) {
	console.log('（--dry：書き込みはしない）');
}
