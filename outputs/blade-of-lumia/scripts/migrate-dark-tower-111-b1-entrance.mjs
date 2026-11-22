// scripts/migrate-dark-tower-111-b1-entrance.mjs
// 実行キュー111（2026-11-17）：暗黒の塔 B1 の入口の部屋 `0,1` を「盾の関所」（戦闘の部屋）にする。
//
// ユーザー指摘（2026-11-17）＝「dark_tower は敵との戦闘が主体なステージ多めでいい」。戦闘の部屋は
// 敵の組み合わせで難しくし、地形は逃げ場と立て直しの間合いを作る側に使う（2026-11-16）。
//
// 直す前＝盾騎士 ζ×2・突進猪 ω・術士 η（126）。着地 (5,5) から階段 (1,5) まで4マスの一本道で、
// 走り抜ければ戦わずに 1F へ上がれた。
// 新しい姿：
//   ・階段 (1,5) は敵を全滅させると現れる（showConditions killAll＝隠し入口）＝戦いが本道になる。
//     3F の大広間（3,3）は鍵と扉だったので、ここは階段そのものを隠して形を変えた。
//   ・敵は4体＝盾騎士 ζ×2（階段の左右で下を向いて構える＝正面からは斬れない・回り込む）／
//     爆弾鬼 λ（西から爆弾＝回り込みの足を止める）／突進猪 ω（東から縦横に突っ込む）。
//     術士 η を爆弾鬼に替えた（ユーザー指摘「爆弾と他の敵の組み合わせだけでも難易度は上がる」）。
//   ・地形＝1マスの柱4本（3,3）(3,8)(6,3)(6,8)＝爆弾は越えるが突進は止まる。柱の前でかわすと猪が頭を打つ。
//   ・逃げ場＝着地 (5,5) に乗り直せば島へ出られる（敵は元に戻る）。南の寄り道（0,2〜0,4）へは戦わずに行ける。
//   ・回復薬（大）の宝箱 (6,5) と看板の石碑 (1,1) はそのまま。
// 敵の強さ＝36×4＝144（直す前 126）。1室の上限 162 以内。
//
// 使い方：node scripts/migrate-dark-tower-111-b1-entrance.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { walkable, clearLine } from './migrate-dark-tower-111-3f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '0,1';
export const STAIRS = '1,5';
export const LANDING = '5,5';
export const SOUTH_OUT = ['9,5', '9,6'];
export const SOUTH_IN = ['8,5', '8,6'];   // 0,2 から戻ってきた着地

const BEFORE = [
	'############',
	'#†...>.....#',
	'#..ζ...ζ...#',
	'#..........#',
	'#..ω....η..#',
	'#....>.....#',
	'#....B.....#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const AFTER = [
	'############',
	'#†...>.....#',
	'#.ζ.....ζ..#',
	'#..#....#..#',
	'#..........#',
	'#....>.....#',
	'#λ.#.B..#..#',
	'#.........ω#',
	'#..........#',
	'#####..#####',
];
const DIRS_BEFORE = { '2,7': 'up', '4,3': 'down', '4,8': 'down', '2,3': 'up' };
export const DIRS_AFTER = { '2,2': 'down', '2,8': 'down', '6,1': 'right', '7,10': 'left' };
export const ENEMIES = ['2,2ζ', '2,8ζ', '6,1λ', '7,10ω'];
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー111] B1 の入口＝盾の関所（戦闘の部屋）。1F への階段 (1,5) は敵の全滅で現れる。'
	+ '盾騎士 ζ×2 が階段の左右で下を向いて構える（正面からは斬れない＝回り込む）。爆弾鬼 λ が西から爆弾で回り込みの足を止め、'
	+ '突進猪 ω が東から縦横に突っ込む。1マスの柱4本は突進を止める（爆弾は越える）。着地 (5,5) に乗り直せば島へ下がれる（敵は元に戻る）。'
	+ '南の寄り道（0,2〜0,4）へは戦わずに行ける。回復薬（大）の宝箱 (6,5) はそのまま。';

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
	ok(g[0] === '############' && g[9] === '#####..#####', '北は壁・南の口 (9,5)(9,6) はそのまま');
	ok(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は全部壁');
	ok(same(Object.keys(st.mapEnters).sort(), [STAIRS, LANDING].sort()), '出入口は着地と階段の2つ');
	ok(st.mapEnters[STAIRS].id === 'b1fStairsUp' && st.mapEnters[LANDING].id === 'towerEntrance', '出入口の id');
	ok(g[1][1] === '†' && st.signData?.['1,1'], '石碑 (1,1) と刻み文はそのまま');
	ok(g[6][5] === 'B' && st.chestContents?.['6,5']?.item === 'bigHealPotion', '回復薬（大）の宝箱 (6,5) はそのまま');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	ok(same(Object.keys(st.enemyDirs).sort(), Object.keys(DIRS_AFTER).sort()), 'enemyDirs が敵の位置と一致');
	ok(['left', 'right'].includes(st.enemyDirs['7,10']), '突進猪は横向き（sideView）');

	const t = stageThreat(st, ENEMY_META);
	ok(t === 144, `脅威度 ${t}（期待 144）`);
	ok(t <= 162, `脅威度 ${t} が1室の上限 162 を超える`);

	// 入った瞬間に張り付かれない・撃たれない（島からの着地・1F から下りた着地・南から戻った着地）
	for (const land of [LANDING, STAIRS, ...SOUTH_IN]) {
		for (const e of es) {
			const pos = e.slice(0, -1);
			const [r, c] = cellOf(pos), [lr, lc] = cellOf(land);
			ok(Math.max(Math.abs(r - lr), Math.abs(c - lc)) >= 3, `着地 ${land} の近くに敵 ${e}`);
			if (e.endsWith('ω')) ok(!clearLine(g, pos, land), `着地 ${land} が ${e} の突進の線上`);
		}
	}

	// 通り道：着地から南の口へは戦わずに行ける・床は全部つながっている（階段は全滅で現れる＝床としては常に届く）
	const reach = walkable(g, [LANDING]);
	ok(SOUTH_OUT.every((k) => reach.has(k)) && reach.has(STAIRS), '着地から南の口か階段のセルへ届かない');
	const floors = g.flatMap((row, r) => [...row].flatMap((ch, c) => ('#'.includes(ch) ? [] : [`${r},${c}`])));
	ok(floors.every((k) => reach.has(k)), `届かない床: ${floors.filter((k) => !reach.has(k))}`);
	console.log(`✔ 自己検証 OK（脅威度 ${t}・階段は全滅で現れる・着地は安全）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
