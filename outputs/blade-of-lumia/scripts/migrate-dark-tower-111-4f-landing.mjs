// scripts/migrate-dark-tower-111-4f-landing.mjs
// 実行キュー111（2026-11-18）：暗黒の塔 4F の踊り場 `4,1` を「術士と亡者の広間」（戦闘の部屋）にする。
//
// ユーザー指摘（2026-11-17）＝「dark_tower は敵との戦闘が主体なステージ多めでいい」。戦闘の部屋は
// 敵の組み合わせで難しくし、地形は逃げ場と立て直しの間合いを作る側に使う（2026-11-16）。
// 難しさの基準＝B1 入口 `0,1`（脅威度 144）を塔の標準装備で「まあまあ」。ボスに近いほど難しくてよい
// （DECISIONS 2026-11-17）。4F の主題＝これまでの道具の組み合わせ。
//
// 直す前＝盾騎士 ζ と剣獣 μ の2体（81）だけの素の箱。着地 (6,4) から南の口まで素通りできた。
// 新しい姿：
//   ・北の広間と南の前室を、切れ目3つ（(4,1)・(4,5)(4,6)・(4,10)）のある壁 row4 で仕切る。
//     壁は術士の魔弾とビームを切る＝南の前室が立て直しの場・切れ目が戦う場所になる。
//   ・南の口の手前を壁と鍵の扉 (8,5) で閉じる。鍵 K (3,6) は敵の全滅で出る（killAll）＝戦いが本道。
//   ・敵は6体＝術士 η×2 を北の両角に（ワープしながら魔弾を撃つ・矢に弱い＝弓で落とす）／
//     骸骨剣士 θ×2 と剣獣 μ が北の広間から切れ目を抜けて詰める（剣）／盾騎士 ζ が南の前室の東で
//     正面を西へ向けて構える（正面は斬れない＝回り込む）。弓・剣・盾を全部使う＝4F の組み合わせ。
//   ・矢束 '6' を南西の角 (7,1) に置く＝術士を矢で落とすぶんを補える。
//   ・逃げ場＝着地 (6,4) の階段に乗り直せば 3F へ下がれる（敵は元に戻る）。
// 敵の強さ＝η 18×2 ＋ θ 18×2 ＋ μ 45 ＋ ζ 36 ＝ 153（直す前 81）。1室の上限 162 以内。
//
// 使い方：node scripts/migrate-dark-tower-111-4f-landing.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { walkable, clearLine } from './migrate-dark-tower-111-3f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '4,1';
export const KEY_CELL = '3,6';
export const DOOR = '8,5';
export const STAIRS = '6,4';
export const PILE = '7,1';
export const SOUTH_OUT = ['9,5', '9,6'];
export const GAPS = ['4,1', '4,5', '4,6', '4,10'];

const BEFORE = [
	'############',
	'#..........#',
	'#..ζ..μ....#',
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
	'#η........η#',
	'#..θ...μ.θ.#',
	'#.....K....#',
	'#.###..###.#',
	'#.........ζ#',
	'#...>......#',
	'#6.........#',
	'#####D######',
	'#####..#####',
];
const DIRS_BEFORE = { '2,3': 'down' };
export const DIRS_AFTER = { '2,3': 'down', '2,7': 'down', '2,9': 'down', '5,10': 'left' };
export const ENEMIES = ['1,1η', '1,10η', '2,3θ', '2,7μ', '2,9θ', '5,10ζ'];
export const THREAT = 153;
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー111] 4F の踊り場＝術士と亡者の広間（戦闘の部屋）。南の口の手前は鍵の扉 (8,5)。鍵 (3,6) は敵の全滅で出る。'
	+ '北の広間と南の前室を、切れ目3つ（(4,1)・(4,5)(4,6)・(4,10)）のある壁で仕切った＝壁が魔弾とビームを切る。'
	+ '術士 η×2 が北の両角でワープしながら魔弾を撃つ（矢に弱い）。骸骨剣士 θ×2 と剣獣 μ が切れ目を抜けて詰め、'
	+ '盾騎士 ζ が南の前室の東で西を向いて構える（正面は斬れない）。矢束 (7,1) は南西の角で拾える。'
	+ '階段 (6,4) に乗り直せば 3F へ下がれる（敵は元に戻る）。';

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
	ok(same(Object.keys(st.mapEnters ?? {}), [STAIRS]) && st.mapEnters[STAIRS].id === '4fEntrance', '出入口は階段 (6,4) の 4fEntrance だけ');
	ok(g[8] === '#####D######', '南の口の手前は扉 (8,5) だけが開く');
	ok(g[7][1] === '6', '矢束 (7,1)');
	ok(same([...g[4]].flatMap((ch, c) => (ch === '#' ? [] : [`4,${c}`])), GAPS), '仕切りの切れ目は (4,1)(4,5)(4,6)(4,10) だけ');
	ok(Object.keys(st.signData ?? {}).length === 0, '刻み文は 4,2 へ移したまま（4,1 に看板を戻さない）');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const directional = es.filter((e) => ENEMY_META[e.slice(-1)].directional).map((e) => e.slice(0, -1));
	ok(same(Object.keys(st.enemyDirs).sort(), directional.sort()), 'enemyDirs が向き別の敵の位置と一致（η は向きを持たない）');

	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);
	ok(t <= 162, `脅威度 ${t} が1室の上限 162 を超える`);

	// 入った瞬間に張り付かれない・斬られない（3F からの着地・4,2 から戻った着地・扉）
	const [lr, lc] = cellOf(STAIRS);
	for (const land of [STAIRS, ...SOUTH_OUT, DOOR]) {
		for (const e of es) {
			const pos = e.slice(0, -1);
			const [r, c] = cellOf(pos), [ar, ac] = cellOf(land);
			ok(Math.max(Math.abs(r - ar), Math.abs(c - ac)) >= 3, `着地 ${land} の近くに敵 ${e}`);
			if (e.endsWith('μ')) ok(!clearLine(g, pos, land), `着地 ${land} が ${e} のビームの線上`);
		}
	}
	// dungeon-key-gate ⑩：剣獣は着地セルと同じ行/列に居ない（壁越しでも）
	for (const e of es.filter((x) => x.endsWith('μ'))) {
		const [r, c] = cellOf(e.slice(0, -1));
		ok(r !== lr && c !== lc, `${e} が着地 (6,4) と同じ行/列`);
	}

	// 通り道：鍵なしでは南の口へ届かない・鍵と矢束には届く・床は全部つながっている
	const closed = walkable(g, [STAIRS]);
	ok([KEY_CELL, PILE].every((k) => closed.has(k)), '着地から鍵のセルか矢束へ届かない');
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
