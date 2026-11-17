// scripts/migrate-dark-tower-111-3f-stairs.mjs
// 実行キュー111（2026-11-17）：暗黒の塔 3F の階段の部屋 `3,3` を「三つの手の広間」（戦闘の部屋）にする。
//
// ユーザー指摘（2026-11-16・11-17）＝部屋を役割で分ける。塔の残りは戦闘の部屋を主体にする。
// 戦闘の部屋は「敵の組み合わせ」で難しくし、地形は逃げ場と立て直しの間合いを作る側に使う。
//
// 直す前＝素の広間に剣獣 μ×2 とブーメラン鬼 π（112.5）。歩けば階段 (8,4) に乗れた＝戦わずに素通りできた。
// 新しい姿：
//   ・階段 (8,4) を壁と鍵の扉 (7,4) で囲む。鍵 K (4,5) は敵を全滅させると出る（killAll）＝戦いが本道になる。
//   ・敵は役割の違う3体＝剣獣 μ（離れると剣のビーム・寄ると斬る）／爆弾鬼 λ（離れた所へ爆弾＝足を止めさせる）／
//     突進猪 ω（縦横がそろうと一直線に突っ込む）。どれか1体に構うと、残りの2体が別の手で詰めてくる。
//   ・地形＝2×2 の柱4本＝ビームと突進の射線を切る隠れ場。柱の間は幅2〜4 の十字の通路。
//     突進は柱に当たると猪が気絶する＝柱を背にして誘うのが反撃の間合い。
//   ・逃げ場＝北の口から 3,2（敵のいない部屋）へ下がれる。部屋を出ると敵は元に戻る＝一度で倒し切る。
//   ・南の口 (9,5)(9,6) から寄り道（3,4・3,5）へは鍵なしで行ける。
// 敵の強さ＝45＋36＋36＝117（直す前 112.5）。4F の門番 5,2（117）を超えない＝`dungeon-key-gate` ⑩。
//
// 使い方：node scripts/migrate-dark-tower-111-3f-stairs.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '3,3';
export const KEY_CELL = '4,5';
export const DOOR = '7,4';
export const STAIRS = '8,4';
export const NORTH_IN = ['1,5', '1,6'];
export const SOUTH_OUT = ['9,5', '9,6'];

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..μ....μ..#',
	'#..........#',
	'#..........#',
	'#.π........#',
	'#..........#',
	'#...>......#',
	'#####..#####',
];
export const AFTER = [
	'#####..#####',
	'#..........#',
	'#.##....##.#',
	'#.##....##λ#',
	'#....K.....#',
	'#ω.........#',
	'#.##....##.#',
	'#.##D#..##.#',
	'#..#>#...μ.#',
	'#####..#####',
];
const DIRS_BEFORE = { '3,3': 'right', '3,8': 'left', '6,2': 'right' };
export const DIRS_AFTER = { '3,10': 'left', '5,1': 'right', '8,9': 'up' };
export const ENEMIES = ['3,10λ', '5,1ω', '8,9μ'];
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー111] 3F の階段の部屋＝三つの手の広間（戦闘の部屋）。階段は鍵の扉 (7,4) の奥。鍵 (4,5) は敵の全滅で出る。'
	+ '剣獣 μ（ビームと斬り）・爆弾鬼 λ（爆弾で足止め）・突進猪 ω（一直線の突進）を1体ずつ＝役割の違う3体が別の手で詰めてくる。'
	+ '2×2 の柱4本が射線を切る隠れ場＝突進は柱に当てると猪が気絶する。北の 3,2 へ下がれば立て直せる（敵は元に戻る）。'
	+ '南の寄り道（3,4・3,5）へは鍵なしで行ける。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cellOf = (k) => k.split(',').map(Number);

/** 歩いて届くセル（壁・穴・閉じた扉は通れない。敵は床として扱う）。open=true で扉を開いた後。 */
export function walkable(rows, from, { open = false } = {}) {
	const g = rows.map((r) => [...r]);
	const blocked = (ch) => ch === '#' || ch === 'x' || (!open && ch === 'D');
	const seen = new Set(from);
	const q = [...from];
	while (q.length) {
		const [r, c] = cellOf(q.shift());
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = r + dr, nc = c + dc;
			if (nr < 0 || nr >= g.length || nc < 0 || nc >= g[0].length) continue;
			const k = `${nr},${nc}`;
			if (seen.has(k) || blocked(g[nr][nc])) continue;
			seen.add(k); q.push(k);
		}
	}
	return seen;
}

/** (r0,c0) から (r1,c1) へ縦か横の直線で、間に壁が無いか（ビーム・突進の射線）。 */
export function clearLine(rows, a, b) {
	const [r0, c0] = cellOf(a), [r1, c1] = cellOf(b);
	if (r0 !== r1 && c0 !== c1) return false;
	const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
	for (let r = r0 + dr, c = c0 + dc; r !== r1 || c !== c1; r += dr, c += dc) {
		if ('#D'.includes(rows[r][c])) return false;
	}
	return true;
}

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
	apply('出現条件', st.showConditions, {}, { [KEY_CELL]: SHOW }, () => { st.showConditions = { [KEY_CELL]: { ...SHOW } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(g[0] === '#####..#####' && g[9] === '#####..#####', '北と南の口 (5,6) はそのまま');
	ok(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は全部壁');
	ok(same(Object.keys(st.mapEnters ?? {}), [STAIRS]) && st.mapEnters[STAIRS].id === '3fStairsUp', '出入口は階段 (8,4) の 3fStairsUp だけ');
	ok(g[7][4] === 'D' && g[8][3] === '#' && g[8][5] === '#', '階段は扉 (7,4) と壁で囲まれている');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	ok(same(Object.keys(st.enemyDirs).sort(), Object.keys(DIRS_AFTER).sort()), 'enemyDirs が敵の位置と一致');
	ok(['left', 'right'].includes(st.enemyDirs['5,1']), '突進猪は横向き（sideView）');

	const t = stageThreat(st, ENEMY_META);
	const guard = stageThreat(data.layers.dark_tower.stages['5,2'], ENEMY_META);
	ok(t === 117, `脅威度 ${t}（期待 117）`);
	ok(t <= guard && t <= 162, `脅威度 ${t} が門番 5,2（${guard}）か1室の上限 162 を超える`);

	// 入った瞬間に張り付かれない・撃たれない（北の口と、4F から下りてきた着地＝階段・扉・扉の前）
	for (const land of [...NORTH_IN, STAIRS, DOOR, '6,4']) {
		for (const e of es) {
			const pos = e.slice(0, -1);
			const [r, c] = cellOf(pos), [lr, lc] = cellOf(land);
			ok(Math.max(Math.abs(r - lr), Math.abs(c - lc)) >= 3, `着地 ${land} の近くに敵 ${e}`);
			if (e.endsWith('μ') || e.endsWith('ω')) ok(!clearLine(g, pos, land), `着地 ${land} が ${e} の射線上`);
		}
	}

	// 通り道：鍵なしで南の口と鍵のセルへ届く・階段へは届かない／扉を開けば階段へ届く
	const closed = walkable(g, NORTH_IN);
	ok(['9,5', '9,6', KEY_CELL].every((k) => closed.has(k)), '鍵なしで南の口か鍵のセルへ届かない');
	ok(!closed.has(STAIRS), '鍵なしで階段へ届いてしまう（戦いが飾り）');
	ok(walkable(g, NORTH_IN, { open: true }).has(STAIRS), '扉を開いても階段へ届かない');
	// 床は全部つながっている（柱の裏に閉じた袋が無い）
	const floors = g.flatMap((row, r) => [...row].flatMap((ch, c) => ('#xD>'.includes(ch) ? [] : [`${r},${c}`])));
	ok(floors.every((k) => closed.has(k)), `届かない床: ${floors.filter((k) => !closed.has(k))}`);
	// 突進猪の通り道 row5 は端から端まで開いている（突進の見せ場）
	ok(g[5].slice(1, 11) === 'ω.........', 'row5 は突進の通り道（全部床）');
	console.log(`✔ 自己検証 OK（脅威度 ${t}・門番 ${guard}・鍵なしで階段へ届かない・着地は安全）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
