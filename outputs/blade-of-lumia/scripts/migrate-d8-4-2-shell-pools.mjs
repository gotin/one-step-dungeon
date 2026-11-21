// scripts/migrate-d8-4-2-shell-pools.mjs
// 実行キュー112（2026-11-21）：沼地の神殿 D8 `4,2`（北→4,1・西→3,2・南→4,3 の三つ辻）を「甲羅と呪い火の池」（戦闘の部屋）にする。
//
// ユーザー判断（2026-11-19）＝D8 の残りはパズルと戦闘を半々。戦闘の部屋は敵の組み合わせで難しくする。
//
// 直す前＝床にルピー×3 が落ちただけの素の広間。
// 新しい姿：
//   ・2×2 の池（bgTiles の水）を4つ＝幅2の通路が井の字に走る。池の上は呪い火だけが渡れる。
//   ・火吐き亀 φ (1,1)(8,10)：甲羅に籠もっている間は何も効かない・口を開けた瞬間に2マス先まで炎を吐く。
//     呪い火 ψ (1,10)(8,1)：触れると剣が3秒封じられる・宙に浮いて池を越えて来る（弓・ブーメラン・爆弾は封じられない）。
//     地中蟲 α (4,5)(5,8)：潜っている間は何も効かず足元へ寄って来る・顔を出した時だけ斬れる。
//   ・どれも「効く時」が短い敵＝亀が口を開けた時・蟲が顔を出した時に、呪い火に剣を封じられていると斬れない。
//     呪い火を先に落とす（弓・ブーメラン）か、封じられたら弓に持ち替える、が読み。
//     D8 では3種とも初めて。
//   ・全滅で東の行き止まり (4,10) に宝箱＝回復薬（killAll）。
// 敵の強さ＝φ 30×2 ＋ ψ 3×2 ＋ α 9×2 ＝ 84（直す前 0）。どの口の着地からも敵は3マス以上。口は戦わずに通れる。
//
// 使い方：node scripts/migrate-d8-4-2-shell-pools.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-2-3-island-turrets.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '4,2';
export const CHEST = '4,10';
export const LANDINGS = ['1,5', '1,6', '4,1', '5,1', '8,5', '8,6'];
export const EXITS = ['0,5', '0,6', '4,0', '5,0', '9,5', '9,6'];

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#....r.....#',
	'...........#',
	'.....r.....#',
	'#..........#',
	'#....r.....#',
	'#..........#',
	'#####..#####',
];
// `~` は bgTiles の水（tiles 側は床 '.'）
export const DESIGN = [
	'#####..#####',
	'#φ........ψ#',
	'#..~~..~~..#',
	'#..~~..~~..#',
	'.....α....B#',
	'........α..#',
	'#..~~..~~..#',
	'#..~~..~~..#',
	'#ψ........φ#',
	'#####..#####',
];
export const AFTER = DESIGN.map((row) => row.replace(/~/g, '.'));
export const WATER = [];
DESIGN.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '~') WATER.push(`${r},${c}`); }));
export const ENEMIES = ['1,1φ', '1,10ψ', '4,5α', '5,8α', '8,1ψ', '8,10φ'];
export const THREAT = 84;
export const CONTENT = { type: 'item', item: 'healPotion', name: '回復薬' };
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー112] D8 甲羅と呪い火の池（戦闘の部屋）。2×2 の池4つで井の字の通路。火吐き亀 φ (1,1)(8,10)・呪い火 ψ (1,10)(8,1)・地中蟲 α (4,5)(5,8)。'
	+ '亀が口を開けた時・蟲が顔を出した時だけ斬れるが、呪い火に触れると剣が封じられる（池を越えて来る）。全滅で東の行き止まり (4,10) に宝箱＝回復薬。三つの口は戦わずに通れる。';

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
	const BG_AFTER = Object.fromEntries(WATER.map((k) => [k, '~']));
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('池（bgTiles）', sortObj(st.bgTiles), {}, sortObj(BG_AFTER), () => { st.bgTiles = { ...BG_AFTER }; });
	apply('宝箱', st.chestContents, {}, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	apply('出現条件', st.showConditions, {}, { [CHEST]: SHOW }, () => { st.showConditions = { [CHEST]: { ...SHOW } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	const water = new Set(WATER);
	const at = (k) => { const [r, c] = cellOf(k); return [...g[r]][c]; };
	ok(g.length === 10 && g.every((r) => [...r].length === 12), '盤面の大きさ');
	ok(EXITS.every((k) => at(k) === '.'), '三つの口はそのまま');
	ok(WATER.every((k) => at(k) === '.'), '池の上に物や敵を置かない');
	ok(at(CHEST) === 'B' && !water.has(CHEST), '宝箱');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	ok(!es.some((e) => ENEMY_META[e.slice(-1)].directional), '向き別の敵は居ない');
	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);

	const foot = reach(g, water, LANDINGS);
	ok(LANDINGS.every((k) => foot.has(k)), '三つの口がつながっていない');
	const floor = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '#' || water.has(`${r},${c}`) ? [] : [`${r},${c}`])));
	ok(floor.every((k) => foot.has(k)), `歩いて届かない床: ${floor.filter((k) => !foot.has(k))}`);
	for (const l of LANDINGS) {
		const [ar, ac] = cellOf(l);
		for (const e of es) {
			const [r, c] = cellOf(e.slice(0, -1));
			ok(Math.max(Math.abs(r - ar), Math.abs(c - ac)) >= 3, `着地 ${l} の近くに敵 ${e}`);
		}
	}
	console.log(`✔ 自己検証 OK（脅威度 ${t}・三つの口は戦わずに通れる・着地は安全）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
