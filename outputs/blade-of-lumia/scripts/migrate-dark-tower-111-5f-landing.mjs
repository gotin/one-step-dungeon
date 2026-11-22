// scripts/migrate-dark-tower-111-5f-landing.mjs
// 実行キュー111（2026-11-18）：暗黒の塔 5F の踊り場 `5,0` を「呪い火の踊り場」（戦闘の部屋）にする。
//
// ユーザー指摘（2026-11-17）＝「dark_tower は敵との戦闘が主体なステージ多めでいい」。戦闘の部屋は
// 敵の組み合わせで難しくし、地形は逃げ場と立て直しの間合いを作る側に使う（2026-11-16）。
// 難しさの基準＝B1 入口 `0,1`（144）を塔の標準装備で「まあまあ」。ボスに近いほど難しくてよい（DECISIONS 2026-11-17）。
//
// 直す前＝タイルが階段だけの空室（脅威度 0）。着地 (6,4) から南の口（→ 5,1）まで歩けば抜けられた。
// 新しい姿：
//   ・南の口の手前を壁と鍵の扉 (8,5) で閉じる。鍵 K (5,7) は敵の全滅で出る（killAll）。
//   ・敵は8体＝呪い火 ψ×4（宙を飛び、触れると剣を3秒封じる）が、盾騎士 ζ・剣獣 μ・爆弾鬼 λ・骸骨剣士 θ と混ざる。
//     剣を封じられている間は弓・ブーメラン・爆弾でしのぐ＝玉座の階の手前で「全部の道具」を試す。
//   ・矢束 '6' (7,1) と爆弾 '5' (7,10) を南の両角に置く＝剣を封じられたときの手を補える。
//   ・地形＝北の壁 (1,5)(1,6) と1マスの柱 (4,2)(4,9)＝ビームと投げ物の線を切る。
//   ・逃げ場＝着地 (6,4) の階段に乗り直せば 4F へ下がれる（敵は元に戻る）。
// 敵の強さ＝ψ 3×4 ＋ ζ 36 ＋ μ 45 ＋ λ 36 ＋ θ 18 ＝ 147（直す前 0）。1室の上限 162 以内。
//
// 使い方：node scripts/migrate-dark-tower-111-5f-landing.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { walkable, clearLine } from './migrate-dark-tower-111-3f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '5,0';
export const KEY_CELL = '5,7';
export const DOOR = '8,5';
export const STAIRS = '6,4';
export const ARROWS = '7,1';
export const BOMBS = '7,10';
export const SOUTH_OUT = ['9,5', '9,6'];

const BEFORE = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const AFTER = [
	'############',
	'#ψ...##...ψ#',
	'#.......μ..#',
	'#.ζ..ψψ..λ.#',
	'#.#......#.#',
	'#......K.θ.#',
	'#...>......#',
	'#6........5#',
	'#####D######',
	'#####..#####',
];
const DIRS_BEFORE = {};
export const DIRS_AFTER = { '2,8': 'down', '3,2': 'down', '3,9': 'down', '5,9': 'left' };
export const ENEMIES = ['1,1ψ', '1,10ψ', '2,8μ', '3,2ζ', '3,5ψ', '3,6ψ', '3,9λ', '5,9θ'];
export const THREAT = 147;
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー111] 5F の踊り場＝呪い火の踊り場（戦闘の部屋）。南の口の手前は鍵の扉 (8,5)。鍵 (5,7) は敵の全滅で出る。'
	+ '呪い火 ψ×4（触れると剣を3秒封じる）が、盾騎士 ζ・剣獣 μ・爆弾鬼 λ・骸骨剣士 θ と混ざる＝剣を封じられた間は弓・ブーメラン・爆弾でしのぐ。'
	+ '矢束 (7,1) と爆弾 (7,10) は南の両角で拾える。北の壁と柱 (4,2)(4,9) が線を切る。'
	+ '階段 (6,4) に乗り直せば 4F へ下がれる（敵は元に戻る）。';

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
	apply('出現条件', st.showConditions, {}, { [KEY_CELL]: SHOW }, () => { st.showConditions = { [KEY_CELL]: { ...SHOW } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(g[0] === '############' && g[9] === '#####..#####', '北は壁・南の口 (9,5)(9,6) はそのまま');
	ok(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は全部壁');
	ok(same(Object.keys(st.mapEnters ?? {}), [STAIRS]) && st.mapEnters[STAIRS].id === 'throneEntrance', '出入口は階段 (6,4) の throneEntrance だけ');
	ok(g[8] === '#####D######', '南の口の手前は扉 (8,5) だけが開く');
	ok(g[7][1] === '6' && g[7][10] === '5', '矢束 (7,1) と爆弾 (7,10)');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const directional = es.filter((e) => ENEMY_META[e.slice(-1)].directional).map((e) => e.slice(0, -1));
	ok(same(Object.keys(st.enemyDirs).sort(), directional.sort()), 'enemyDirs が向き別の敵の位置と一致（ψ は向きを持たない）');

	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);
	ok(t <= 162, `脅威度 ${t} が1室の上限 162 を超える`);

	// 入った瞬間に張り付かれない・斬られない（4F からの着地・5,1 から戻った着地・扉）
	const [lr, lc] = cellOf(STAIRS);
	for (const land of [STAIRS, ...SOUTH_OUT, DOOR]) {
		for (const e of es) {
			const pos = e.slice(0, -1);
			const [r, c] = cellOf(pos), [ar, ac] = cellOf(land);
			ok(Math.max(Math.abs(r - ar), Math.abs(c - ac)) >= 3, `着地 ${land} の近くに敵 ${e}`);
			if (e.endsWith('μ')) ok(!clearLine(g, pos, land), `着地 ${land} が ${e} のビームの線上`);
		}
	}
	for (const e of es.filter((x) => x.endsWith('μ'))) {
		const [r, c] = cellOf(e.slice(0, -1));
		ok(r !== lr && c !== lc, `${e} が着地 (6,4) と同じ行/列`);
	}

	// 通り道：鍵なしでは南の口へ届かない・鍵と矢束と爆弾には届く・床は全部つながっている
	const closed = walkable(g, [STAIRS]);
	ok([KEY_CELL, ARROWS, BOMBS].every((k) => closed.has(k)), '着地から鍵・矢束・爆弾へ届かない');
	ok(!SOUTH_OUT.some((k) => closed.has(k)), '鍵なしで南の口へ届いてしまう（戦いが飾り）');
	const open = walkable(g, [STAIRS], { open: true });
	ok(SOUTH_OUT.every((k) => open.has(k)), '扉を開いても南の口へ届かない');
	const floors = g.flatMap((row, r) => [...row].flatMap((ch, c) => ('#D'.includes(ch) ? [] : [`${r},${c}`])));
	ok(floors.every((k) => open.has(k)), `届かない床: ${floors.filter((k) => !open.has(k))}`);
	console.log(`✔ 自己検証 OK（脅威度 ${t}・鍵なしで南の口へ届かない・着地は安全）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
