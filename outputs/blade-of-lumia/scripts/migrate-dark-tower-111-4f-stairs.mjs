// scripts/migrate-dark-tower-111-4f-stairs.mjs
// 実行キュー111（2026-11-18）：暗黒の塔 4F の階段の部屋 `4,4` を「火と跳躍の間」（戦闘の部屋）にする。
//
// ユーザー指摘（2026-11-17）＝「dark_tower は敵との戦闘が主体なステージ多めでいい」。戦闘の部屋は
// 敵の組み合わせで難しくし、地形は逃げ場と立て直しの間合いを作る側に使う（2026-11-16）。
// 難しさの基準＝B1 入口 `0,1`（144）を塔の標準装備で「まあまあ」。ボスに近いほど難しくてよい（DECISIONS 2026-11-17）。
//
// 直す前＝回復薬（大）の宝箱と 5F への階段だけの空室（脅威度 0）。北の口から階段まで歩けば上がれた。
// 新しい姿：
//   ・5F への階段 (8,4) は全滅で現れる（showConditions killAll）＝B1 入口 `0,1` と同じ形。塔の最初と
//     4F の最後（玉座の階の手前）を同じ関所でそろえる。
//   ・敵は6体＝塔でまだ出していない組み合わせ。火吐き亀 φ×2 が西と東の壁ぎわで甲羅を閉じて待ち、
//     開いたときだけ2マス先へ火を吐く（閉じている間は斬れない）／跳躍蜘蛛 β×2 が3マス跳んで飛びかかる／
//     爆弾鬼 λ が南から爆弾を投げて足を止める／ブーメラン鬼 π が北東から投げる。
//   ・地形＝1マスの柱4本 (3,4)(3,7)(5,4)(5,7)＝ブーメランと跳躍の線を切る。爆弾は越える。
//   ・逃げ場＝北の口から石の間 `4,3`（敵なし）へ戻れる（敵は元に戻る）。回復薬（大）の宝箱 (6,4) はそのまま。
// 敵の強さ＝φ 30×2 ＋ β 16×2 ＋ λ 36 ＋ π 22.5 ＝ 150.5（直す前 0）。1室の上限 162 以内。
//
// 使い方：node scripts/migrate-dark-tower-111-4f-stairs.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { walkable } from './migrate-dark-tower-111-3f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '4,4';
export const STAIRS = '8,4';
export const CHEST = '6,4';
export const NORTH_IN = ['0,5', '0,6', '1,5', '1,6'];

const BEFORE = [
	'#####;;#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...B......#',
	'#..........#',
	'#...>......#',
	'############',
];
export const AFTER = [
	'#####;;#####',
	'#..........#',
	'#.........π#',
	'#β..#..#..β#',
	'#..........#',
	'#φ..#..#..φ#',
	'#...B......#',
	'#......λ...#',
	'#...>......#',
	'############',
];
const DIRS_BEFORE = {};
export const DIRS_AFTER = { '2,10': 'left', '7,7': 'up' };
export const ENEMIES = ['2,10π', '3,1β', '3,10β', '5,1φ', '5,10φ', '7,7λ'];
export const THREAT = 150.5;
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー111] 4F の階段の部屋＝火と跳躍の間（戦闘の部屋）。5F への階段 (8,4) は敵の全滅で現れる（B1 入口 0,1 と同じ形）。'
	+ '火吐き亀 φ×2 が西と東の壁ぎわで甲羅を閉じて待ち、開いたときだけ火を吐く。跳躍蜘蛛 β×2 が飛びかかり、'
	+ '爆弾鬼 λ が南から爆弾で足を止め、ブーメラン鬼 π が北東から投げる。柱4本が線を切る。'
	+ '北の口から石の間 4,3（敵なし）へ戻って立て直せる（敵は元に戻る）。回復薬（大）の宝箱 (6,4) はそのまま。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cellOf = (k) => k.split(',').map(Number);

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const st = data.layers.dark_tower.stages[KEY];
	ok(st, `dark_tower ${KEY} が無い`);
	const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

	let changed = false;
	const apply = (label, cur, before, after, set) => {
		if (same(cur, after)) { console.log(`… ${KEY} の${label}は既に適用済み`); return; }
		ok(same(cur, before), `${KEY} の${label}が想定と違う: ${JSON.stringify(cur)}`);
		set(); changed = true; console.log(`✔ ${KEY} の${label}を書き換えた`);
	};
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('enemyDirs', st.enemyDirs, DIRS_BEFORE, DIRS_AFTER, () => { st.enemyDirs = { ...DIRS_AFTER }; });
	apply('出現条件', st.showConditions, {}, { [STAIRS]: SHOW }, () => { st.showConditions = { [STAIRS]: { ...SHOW } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(g[0] === '#####;;#####' && g[9] === '############', '北の口 (0,5)(0,6) だけ・南は壁');
	ok(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は全部壁');
	ok(same(Object.keys(st.mapEnters ?? {}), [STAIRS]) && st.mapEnters[STAIRS].id === '4fStairsUp', '階段 (8,4) は 4fStairsUp のまま');
	ok(g[8][4] === '>' && g[6][4] === 'B', '階段 (8,4) と宝箱 (6,4) はそのまま');
	ok(st.chestContents?.[CHEST]?.item === 'bigHealPotion', '宝箱の中身は回復薬（大）のまま');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const directional = es.filter((e) => ENEMY_META[e.slice(-1)].directional).map((e) => e.slice(0, -1));
	ok(same(Object.keys(st.enemyDirs).sort(), directional.sort()), 'enemyDirs が向き別の敵の位置と一致（φ・β は向きを持たない）');

	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);
	ok(t <= 162, `脅威度 ${t} が1室の上限 162 を超える`);

	// 入った瞬間に張り付かれない（石の間からの着地・5F から下りた着地）
	for (const land of [...NORTH_IN, STAIRS]) {
		for (const e of es) {
			const [r, c] = cellOf(e.slice(0, -1)), [lr, lc] = cellOf(land);
			ok(Math.max(Math.abs(r - lr), Math.abs(c - lc)) >= 3, `着地 ${land} の近くに敵 ${e}`);
		}
	}
	// 跳躍蜘蛛は 1.8〜6 マスで跳ぶ＝北の口からは 4 マス以上離す（入った直後に跳ばれない余裕）
	for (const e of es.filter((x) => x.endsWith('β'))) {
		const [r, c] = cellOf(e.slice(0, -1));
		for (const land of NORTH_IN) {
			const [lr, lc] = cellOf(land);
			ok(Math.max(Math.abs(r - lr), Math.abs(c - lc)) >= 4, `北の口 ${land} が ${e} に近い`);
		}
	}

	// 通り道：床は全部つながっている（階段・宝箱へ歩ける）
	const reach = walkable(g, ['1,5']);
	const floors = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '#' ? [] : [`${r},${c}`])));
	ok(floors.every((k) => reach.has(k)), `届かない床: ${floors.filter((k) => !reach.has(k))}`);
	console.log(`✔ 自己検証 OK（脅威度 ${t}・階段は全滅で現れる・着地は安全）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
