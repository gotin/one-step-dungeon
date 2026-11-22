// scripts/migrate-d8-2-3-island-turrets.mjs
// 実行キュー112（2026-11-19）：沼地の神殿 D8 `2,3` を「小島の砲台」（戦闘の部屋）にする。
//
// ユーザー判断（2026-11-19）＝D8 の残りの素の部屋は、パズルの部屋と戦闘の部屋を半々で混ぜる。
// 戦闘の部屋は敵の組み合わせで難しくし、地形は逃げ場と立て直しの間合いを作る側に使う（2026-11-16）。
// D8 の語彙＝「水が陸の敵を止める」（キュー93 `0,2` 毒ヒルの泥田）。ここではそれを戦いに使う。
//
// 直す前＝四角い広間に E×2・C（脅威度 32）と飾りの水たまり3枚。北（→2,2）・南（→2,4）・東（→3,3）の口。
// 新しい姿：
//   ・南の両隅に小島（2×3）を2つ。どちらも幅1の水（bgTiles）で囲う＝はしごで渡れる・陸の敵は渡れない。
//   ・小島には遠くから攻める敵＝ブーメラン鬼 π (8,2)・爆弾鬼 λ (8,9)。島から出られない砲台。
//   ・陸には近くで斬る敵＝骸骨剣士 θ (4,2)(5,7)・毒沼ヒル Γ (2,2)(5,3)。陸を追ってくる。
//   ・はしごで小島へ渡れば、陸の敵は水の縁で止まる＝砲台を斬る間は背中が空く。ただし爆弾とブーメランは水を越える。
//   ・敵を全滅させると北の宝箱 (3,5) が出る（ルピー×50）。通り道は塞がない（南・東・北の口は戦わずに通れる）。
// 敵の強さ＝θ 18×2 ＋ Γ 4.5×2 ＋ π 22.5 ＋ λ 36 ＝ 103.5（直す前 32）。
//
// 使い方：node scripts/migrate-d8-2-3-island-turrets.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '2,3';
export const CHEST = '3,5';
export const WEST_ISLAND = ['7,1', '7,2', '7,3', '8,1', '8,2', '8,3'];
export const EAST_ISLAND = ['7,8', '7,9', '7,10', '8,8', '8,9', '8,10'];
export const LANDINGS = ['1,5', '1,6', '4,10', '5,10', '8,5', '8,6'];
export const EXITS = ['0,5', '0,6', '4,11', '5,11', '9,5', '9,6'];

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#...E......#',
	'#...........',
	'#......C....',
	'#..........#',
	'#..E.......#',
	'#..........#',
	'#####..#####',
];
export const AFTER = [
	'#####..#####',
	'#..........#',
	'#.Γ........#',
	'#....B.....#',
	'#.θ.........',
	'#..Γ...θ....',
	'#..........#',
	'#..........#',
	'#.π......λ.#',
	'#####..#####',
];
const BG_BEFORE = { '4,8': '~', '4,9': '~', '5,8': '~' };
export const WATER = [
	'6,1', '6,2', '6,3', '6,4', '7,4', '8,4',          // 西の小島の堀
	'6,7', '6,8', '6,9', '6,10', '7,7', '8,7',         // 東の小島の堀
];
const BG_AFTER = Object.fromEntries(WATER.map((k) => [k, '~']));
export const DIRS_AFTER = { '4,2': 'right', '5,7': 'up', '8,2': 'up', '8,9': 'up' };
export const ENEMIES = ['2,2Γ', '4,2θ', '5,3Γ', '5,7θ', '8,2π', '8,9λ'];
export const THREAT = 103.5;
const CONTENT = { type: 'rupee', value: 50, name: 'ルピー×50' };
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー112] D8 小島の砲台（戦闘の部屋）。南の両隅に幅1の水で囲った小島。島にはブーメラン鬼 π (8,2) と爆弾鬼 λ (8,9)＝島から出られない砲台。'
	+ '陸には骸骨剣士 θ (4,2)(5,7) と毒沼ヒル Γ (2,2)(5,3)。はしごで島へ渡れば陸の敵は水の縁で止まる（爆弾とブーメランは水を越える）。'
	+ '全滅で北の宝箱 (3,5)＝ルピー×50。北・東・南の口は戦わずに通れる。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cellOf = (k) => k.split(',').map(Number);
const sortObj = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));

// 歩いて行けるセル。water＝水のセルの集合。ladder＝幅1の水を1枚跨げる（はしご）。
// 敵・宝箱は床として扱う（倒した後・開けた後に通れる）。壁と水は通れない。
export function reach(rows, water, from, { ladder = false } = {}) {
	const H = rows.length, W = rows[0].length;
	const floor = (r, c) => r >= 0 && r < H && c >= 0 && c < W && rows[r][c] !== '#' && !water.has(`${r},${c}`);
	const seen = new Set(from), q = [...from];
	while (q.length) {
		const [r, c] = cellOf(q.shift());
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const steps = [[r + dr, c + dc]];
			if (ladder && water.has(`${r + dr},${c + dc}`)) steps.push([r + 2 * dr, c + 2 * dc]);
			for (const [nr, nc] of steps) {
				const k = `${nr},${nc}`;
				if (seen.has(k) || !floor(nr, nc)) continue;
				seen.add(k); q.push(k);
			}
		}
	}
	return seen;
}

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
	apply('水（bgTiles）', sortObj(st.bgTiles), sortObj(BG_BEFORE), sortObj(BG_AFTER), () => { st.bgTiles = { ...BG_AFTER }; });
	apply('enemyDirs', st.enemyDirs, {}, DIRS_AFTER, () => { st.enemyDirs = { ...DIRS_AFTER }; });
	apply('宝箱', st.chestContents, {}, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	apply('出現条件', st.showConditions, {}, { [CHEST]: SHOW }, () => { st.showConditions = { [CHEST]: { ...SHOW } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	const water = new Set(Object.keys(st.bgTiles).filter((k) => st.bgTiles[k] === '~'));
	const at = (k) => { const [r, c] = cellOf(k); return g[r][c]; };
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(EXITS.every((k) => at(k) === '.'), '北・東・南の口はそのまま');
	ok(same([...water].sort(), [...WATER].sort()), '水のセル');
	ok(WATER.every((k) => at(k) === '.'), '水の上に物や敵を置かない');
	ok(at(CHEST) === 'B', '宝箱 (3,5)');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const directional = es.filter((e) => ENEMY_META[e.slice(-1)].directional).map((e) => e.slice(0, -1));
	ok(same(Object.keys(st.enemyDirs).sort(), directional.sort()), 'enemyDirs が向き別の敵の位置と一致');
	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);

	// 小島の砲台は島の上・陸の敵は島の外
	ok(WEST_ISLAND.includes('8,2') && EAST_ISLAND.includes('8,9'), '砲台は島の上');
	ok(['2,2', '4,2', '5,3', '5,7'].every((k) => !WEST_ISLAND.includes(k) && !EAST_ISLAND.includes(k)), '陸の敵は島の外');

	// 歩きでは島へ入れない（陸の敵も入れない）・はしごなら入れる
	const foot = reach(g, water, LANDINGS);
	ok(![...WEST_ISLAND, ...EAST_ISLAND].some((k) => foot.has(k)), '歩きで島へ入れる（陸の敵が島へ届く）');
	const withLadder = reach(g, water, LANDINGS, { ladder: true });
	ok([...WEST_ISLAND, ...EAST_ISLAND].every((k) => withLadder.has(k)), 'はしごでも島へ渡れない');
	// 島は幅1の水だけで囲う（はしごの届く堀）＝島に接する水の向こうは床か壁
	for (const k of WATER) {
		const [r, c] = cellOf(k);
		const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => `${r + dr},${c + dc}`);
		ok(nb.some((n) => !water.has(n) && g[cellOf(n)[0]]?.[cellOf(n)[1]] && g[cellOf(n)[0]][cellOf(n)[1]] !== '#'), `水 ${k} が床に接していない`);
	}
	// 通り道：4つの口（北・東・南）は歩きで互いに届く・陸の床は全部つながっている
	ok(EXITS.every((k) => foot.has(k) || ['0,5', '0,6', '4,11', '5,11', '9,5', '9,6'].includes(k)), '口');
	ok(LANDINGS.every((k) => foot.has(k)), '口の着地から互いに歩いて届かない');
	ok(foot.has(CHEST), '宝箱へ歩いて届かない');
	const land = g.flatMap((row, r) => [...row].flatMap((ch, c) => {
		const k = `${r},${c}`;
		return ch === '#' || water.has(k) || WEST_ISLAND.includes(k) || EAST_ISLAND.includes(k) ? [] : [k];
	}));
	ok(land.every((k) => foot.has(k)), `歩いて届かない陸: ${land.filter((k) => !foot.has(k))}`);

	// 入った瞬間に張り付かれない（どの口の着地からも敵は3マス以上）
	for (const l of LANDINGS) {
		const [ar, ac] = cellOf(l);
		for (const e of es) {
			const [r, c] = cellOf(e.slice(0, -1));
			ok(Math.max(Math.abs(r - ar), Math.abs(c - ac)) >= 3, `着地 ${l} の近くに敵 ${e}`);
		}
	}
	console.log(`✔ 自己検証 OK（脅威度 ${t}・島へははしごだけ・口は戦わずに通れる・着地は安全）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
