// scripts/migrate-d8-2-2-sorcerer-pond.mjs
// 実行キュー112（2026-11-20）：沼地の神殿 D8 `2,2`（四つ辻）を「術士の沼の環」（戦闘の部屋）にする。
//
// ユーザー判断（2026-11-19）＝D8 の残りはパズルと戦闘を半々。戦闘の部屋は敵の組み合わせで難しくし、
// 地形は逃げ場と立て直しの間合いを作る側に使う（2026-11-16）。
//
// 直す前＝四角い広間に E×2（8）と飾りの水たまり2枚。北（→2,1 看板部屋）・南（→2,3 小島の砲台）・
//   西（→1,2 笛の間）・東（→3,2 戸口の盾騎士）の四つ辻。
// 新しい姿：
//   ・真ん中に沼（4×6・bgTiles の水）。周りは幅2の泥の環＝四つの口は環でつながる（通り道は塞がない）。
//   ・沼の中に小島（2×2）。北と南は幅1の水＝はしごで渡れる。東西は幅2＝渡れない。
//     敵を全滅させると小島に宝箱 (4,6)（回復薬（大）・killAll）。
//   ・四隅に4体＝術士 η (1,1)(8,10)（消えてプレイヤーの近くへ現れ魔弾・矢に弱い）／爆弾鬼 λ (1,10)（沼越しに爆弾）／
//     分裂スライム δ (8,1)（剣で斬ると分かれる・爆弾なら分かれない）。
//     沼が真ん中を塞ぐ＝環を回って追う・爆弾は沼を越えて来る。術士は環のどこへでも現れる。
// 敵の強さ＝η 18×2 ＋ λ 36 ＋ δ 12 ＝ 84（直す前 8）。どの口の着地からも敵は3マス以上。
//
// 使い方：node scripts/migrate-d8-2-2-sorcerer-pond.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-2-3-island-turrets.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '2,2';
export const CHEST = '4,6';
export const ISLAND = ['4,5', '4,6', '5,5', '5,6'];
export const LANDINGS = ['1,5', '1,6', '8,5', '8,6', '4,1', '5,1', '4,10', '5,10'];
export const EXITS = ['0,5', '0,6', '9,5', '9,6', '4,0', '5,0', '4,11', '5,11'];

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..E.......#',
	'............',
	'............',
	'#......E...#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const AFTER = [
	'#####..#####',
	'#η........λ#',
	'#..........#',
	'#..........#',
	'......B.....',
	'............',
	'#..........#',
	'#..........#',
	'#δ........η#',
	'#####..#####',
];
const BG_BEFORE = { '5,5': '~', '5,6': '~' };
export const WATER = [];
for (let r = 3; r <= 6; r++) for (let c = 3; c <= 8; c++) if (!ISLAND.includes(`${r},${c}`)) WATER.push(`${r},${c}`);
const BG_AFTER = Object.fromEntries(WATER.map((k) => [k, '~']));
export const DIRS_AFTER = { '1,10': 'left' };
export const ENEMIES = ['1,1η', '1,10λ', '8,1δ', '8,10η'];
export const THREAT = 84;
const CONTENT = { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' };
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー112] D8 術士の沼の環（戦闘の部屋）。真ん中に沼（4×6）と小島（2×2）。周りの幅2の環が四つの口をつなぐ（戦わずに通れる）。'
	+ '四隅に術士 η (1,1)(8,10)・爆弾鬼 λ (1,10)・分裂スライム δ (8,1)。術士は環のどこへでも現れて魔弾、爆弾は沼を越える。'
	+ '全滅で小島に宝箱 (4,6)＝回復薬（大）。小島へは北か南の幅1の水をはしごで渡る。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cellOf = (k) => k.split(',').map(Number);
const sortObj = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const st = data.layers[LAYER].stages[KEY];
	ok(st, `${LAYER} ${KEY} が無い`);
	const rows = () => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

	let changed = false;
	const apply = (label, cur, before, after, set) => {
		if (same(cur, after)) { console.log(`… ${KEY} の${label}は既に適用済み`); return; }
		ok(same(cur, before), `${KEY} の${label}が想定と違う: ${JSON.stringify(cur)}`);
		set(); changed = true; console.log(`✔ ${KEY} の${label}を書き換えた`);
	};
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('沼（bgTiles）', sortObj(st.bgTiles), sortObj(BG_BEFORE), sortObj(BG_AFTER), () => { st.bgTiles = { ...BG_AFTER }; });
	apply('enemyDirs', st.enemyDirs, {}, DIRS_AFTER, () => { st.enemyDirs = { ...DIRS_AFTER }; });
	apply('宝箱', st.chestContents, {}, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	apply('出現条件', st.showConditions, {}, { [CHEST]: SHOW }, () => { st.showConditions = { [CHEST]: { ...SHOW } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	const water = new Set(Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === '~'));
	const at = (k) => { const [r, c] = cellOf(k); return g[r][c]; };
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(EXITS.every((k) => at(k) === '.'), '四つの口はそのまま');
	ok(same([...water].sort(), [...WATER].sort()), '沼のセル');
	ok(WATER.every((k) => at(k) === '.'), '沼の上に物や敵を置かない');
	ok(at(CHEST) === 'B' && ISLAND.includes(CHEST), '宝箱は小島の上');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const directional = es.filter((e) => ENEMY_META[e.slice(-1)].directional).map((e) => e.slice(0, -1));
	ok(same(Object.keys(st.enemyDirs).sort(), directional.sort()), 'enemyDirs が向き別の敵の位置と一致');
	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);

	// 歩きでは小島へ入れない・はしごなら入れる・四つの口は環で互いに届く・環の床は全部つながる
	const foot = reach(g, water, LANDINGS);
	ok(!ISLAND.some((k) => foot.has(k)), '歩きで小島へ入れる');
	ok(ISLAND.every((k) => reach(g, water, LANDINGS, { ladder: true }).has(k)), 'はしごでも小島へ渡れない');
	ok(LANDINGS.every((k) => foot.has(k)), '四つの口が環でつながっていない');
	const ring = g.flatMap((row, r) => [...row].flatMap((ch, c) => {
		const k = `${r},${c}`;
		return ch === '#' || water.has(k) || ISLAND.includes(k) ? [] : [k];
	}));
	ok(ring.every((k) => foot.has(k)), `歩いて届かない床: ${ring.filter((k) => !foot.has(k))}`);
	// 東西は幅2（はしごで渡れない）・北南は幅1
	ok(water.has('4,3') && water.has('4,4') && water.has('4,7') && water.has('4,8'), '東西の水は幅2');
	ok(water.has('3,5') && water.has('6,5') && !water.has('2,5') && !water.has('7,5'), '北南の水は幅1');

	// 入った瞬間に張り付かれない（どの口の着地からも敵は3マス以上）
	for (const l of LANDINGS) {
		const [ar, ac] = cellOf(l);
		for (const e of es) {
			const [r, c] = cellOf(e.slice(0, -1));
			ok(Math.max(Math.abs(r - ar), Math.abs(c - ac)) >= 3, `着地 ${l} の近くに敵 ${e}`);
		}
	}
	console.log(`✔ 自己検証 OK（脅威度 ${t}・小島へははしごだけ・四つの口は戦わずに通れる・着地は安全）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
