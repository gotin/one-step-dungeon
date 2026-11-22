// scripts/migrate-dark-tower-111-1f-stairs.mjs
// 実行キュー111（2026-11-16）：暗黒の塔 1F の階段の部屋 `1,3` を「穴の島の番兵」にする。
//
// 直す前＝素の箱にパトロール E×2（脅威度 8.0）と 2F への階段だけ。
// 新しい姿＝東半分を幅2の穴の環にし、中の島 (4,8)(4,9)(5,8)(5,9) にセンチネル F を1体。
//   ・F は陸の敵＝穴を越えられない＝島から出ない。縦横がそろって4マス以内だと槍を投げる
//     ＝西側の通り道で島と同じ行（row4・5）を通るとき槍が飛んでくる（盾で止まる）。
//   ・穴の環は幅2＝はしごで渡れない＝剣は届かない。倒すには遠隔（剣ビーム・矢・ブーメラン）
//     ＝1F の主題（遠隔攻撃）の再演。倒すのは任意＝倒すと北の通路の東の角 (1,10) に宝箱（大ルピー×50）。
//   ・本道（北の口 → 階段 (8,4)・南の口 (9,5)(9,6)）は西側を素通りできる＝必須の関門は増やさない。
//   ・北の口 (0,5)(0,6) は島と同じ行/列に無い＝入った瞬間は狙われない。
// 敵の強さ＝8.0 → 18.0（塔の非ボス合計 927 → 937・上限 950）。
//
// 使い方：node scripts/migrate-dark-tower-111-1f-stairs.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '1,3';
const CHEST = '1,10';   // 角＝宝箱で床をふさいで孤立させない（(1,9) に置くと東の (1,10) が孤立した）

const BEFORE = [
	'#####;;#####',
	'#..........#',
	'#...E..E...#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#####..#####',
];
const AFTER = [
	'#####;;#####',
	'#.........B#',
	'#.....xxxxx#',
	'#.....xxxxx#',
	'#.....xxF.x#',
	'#.....xx..x#',
	'#.....xxxxx#',
	'#.....xxxxx#',
	'#...>......#',
	'#####..#####',
];
const DIRS_BEFORE = { '2,4': 'right', '2,7': 'left' };
const DIRS_AFTER = {};   // F は directional ではない
const CHEST_CONTENT = { type: 'rupee', value: 50, name: '大ルピー×50' };
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー111] 1F の階段の部屋＝穴の島の番兵。幅2の穴の環の中の島にセンチネル F（島から出られない・'
	+ '縦横がそろうと槍）。剣は届かない＝遠隔で倒すと北の通路に宝箱（大ルピー×50）。本道は西側を素通りできる。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const st = data.layers.dark_tower.stages[KEY];
ok(st, `dark_tower ${KEY} が無い`);
const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

// ── 書き換え ─────────────────────────────────────────
let changed = false;
function apply(label, cur, before, after, set) {
	if (same(cur, after)) { console.log(`… ${KEY} の${label}は既に適用済み`); return; }
	ok(same(cur, before), `${KEY} の${label}が想定と違う: ${JSON.stringify(cur)}`);
	set(); changed = true; console.log(`✔ ${KEY} の${label}を書き換えた`);
}
apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
apply('enemyDirs', st.enemyDirs, DIRS_BEFORE, DIRS_AFTER, () => { st.enemyDirs = { ...DIRS_AFTER }; });
apply('宝箱の中身', st.chestContents, {}, { [CHEST]: CHEST_CONTENT }, () => { st.chestContents = { [CHEST]: { ...CHEST_CONTENT } }; });
apply('出現条件', st.showConditions, {}, { [CHEST]: SHOW }, () => { st.showConditions = { [CHEST]: { ...SHOW } }; });
if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

// ── 自己検証 ─────────────────────────────────────────
const g = rows().map((r) => [...r]);
const R = g.length, C = g[0].length;
ok(R === 10 && C === 12, '盤面の大きさ');
// ① 境界＝北の口 (0,5)(0,6) は DOORWAY のまま・南の口は cols 5,6・東西は壁
ok(g[0].map((ch, c) => (ch !== '#' ? `${c}${ch}` : '')).join('') === '5;6;', '北の口は (0,5)(0,6) の DOORWAY');
ok(g[R - 1].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0).join() === '5,6', '南の口は cols 5,6');
ok(g.every((row) => row[0] === '#' && row[C - 1] === '#'), '東西の境界は全部壁');
// ② 階段と mapEnters がそのまま
ok(g[8][4] === '>' && st.mapEnters?.['8,4']?.id === '1fStairsUp', '階段 (8,4) と 1fStairsUp がそのまま');
// ③ 敵＝F 1体・島の上
const enemies = [];
g.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) enemies.push([r, c, ch]); }));
ok(enemies.length === 1 && enemies[0][2] === 'F', `敵は F 1体だけ: ${JSON.stringify(enemies)}`);
ok(!ENEMY_META.F.directional, '前提：F は directional ではない（enemyDirs は空）');
// ④ 歩いて行ける範囲（穴は渡れない）＝北の口から
const walk = (ch) => ch !== '#' && ch !== 'x' && ch !== 'B' && !ENEMY_META[ch];
function reach(sr, sc) {
	const seen = new Set([`${sr},${sc}`]); const q = [[sr, sc]];
	while (q.length) {
		const [r, c] = q.shift();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc;
			if (nr < 0 || nc < 0 || nr >= R || nc >= C || seen.has(`${nr},${nc}`)) continue;
			if (!walk(g[nr][nc])) continue;
			seen.add(`${nr},${nc}`); q.push([nr, nc]);
		}
	}
	return seen;
}
const fromN = reach(0, 5);
ok(fromN.has('8,4') && fromN.has('9,5') && fromN.has('9,6'), '北の口から階段・南の口へ歩ける');
ok(!fromN.has('4,9') && !fromN.has('5,8'), '島へは歩いて行けない');
// 宝箱の前（隣の床）へ歩いて行ける
const [cr, cc] = CHEST.split(',').map(Number);
ok([[0, 1], [0, -1], [1, 0]].some(([dr, dc]) => fromN.has(`${cr + dr},${cc + dc}`)), '宝箱の隣へ歩いて行ける');
// 孤立した床が無い（島の4マス以外は全部北の口から歩ける）は下の ⑤ の「島の床は4マス」で押さえる
// ⑤ 島の周りの穴は幅2以上（はしご＝穴1枚で渡れる・で島へ渡れない）＝通り道側の床から島の床まで、
//    間の穴が1枚だけの縦横の並びが無い
const island = [];
g.forEach((row, r) => row.forEach((ch, c) => { if ((ch === '.' || ENEMY_META[ch]) && !fromN.has(`${r},${c}`) && r > 0 && r < R - 1) island.push([r, c]); }));
ok(island.length === 4, `島の床は4マス: ${JSON.stringify(island)}`);
for (const [r, c] of island) {
	for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
		const pr = r + dr, pc = c + dc, fr = r + 2 * dr, fc = c + 2 * dc;
		if (g[pr]?.[pc] === 'x' && fromN.has(`${fr},${fc}`)) die(`島 (${r},${c}) は穴1枚で通り道 (${fr},${fc}) とつながる＝はしごで渡れる`);
	}
}
// ⑥ 北の口の2マスは島と同じ行/列に無い（入った瞬間に狙われない）
for (const [r, c] of island) ok(r !== 0 && c !== 5 && c !== 6, '北の口は島と同じ行/列に無い');
console.log(`✔ 自己検証 OK（島 ${island.map(([r, c]) => `${r},${c}`).join(' ')}）`);

if (changed && !DRY) {
	writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
	console.log('✔ 書き込んだ');
} else if (changed) {
	console.log('（--dry：書き込みはしない）');
}
