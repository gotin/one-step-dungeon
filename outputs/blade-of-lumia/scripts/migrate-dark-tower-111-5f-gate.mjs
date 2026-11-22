// scripts/migrate-dark-tower-111-5f-gate.mjs
// 実行キュー111（2026-11-18）：暗黒の塔 5F `5,2`（玉座の門番の間）を、走り抜けられない最後の関門にする。
//
// ユーザー判断（2026-11-18）＝門番は今 117 で走り抜けられる。5,0（呪い火の踊り場・147）くらいの強さに上げる。
// 決まり＝3F の大広間 `3,3`（117）以上・1室 162 以下（tests/dungeon-key-gate.spec.js ⑩）。
// 戦闘の部屋は敵の組み合わせで難しくし、地形は逃げ場と立て直しの間合いを作る側に使う（2026-11-16）。
//
// 直す前＝盾騎士 ζ (8,4)=right・(8,7)=left が南の口の両脇に立ち、剣獣 μ (4,3)（117）。
//   通路 col5/6 には敵を置かず、走り抜けを残していた（20b ④の「関門は打ち止め」＝2026-11-16 に失効）。
// 新しい姿：
//   ・南の口の手前を壁と鍵の扉 (8,5) で閉じる。鍵 K (6,5) は敵の全滅で出る（killAll）＝玉座へは戦って進む。
//   ・盾騎士 ζ×2 が扉の前 (5,4)(5,7) に北向きで並ぶ＝入ってきたプレイヤーへ盾を向ける「門番の壁」。
//     塔の入口 `0,1`（盾騎士2体が着地へ盾）の再演＝最初と最後で同じ顔。
//   ・剣獣 μ (7,9) が扉の脇から斬り込み、ビームを撃つ。突進猪 ω (4,10) が row4 と col10 を突進する
//     ＝盾の正面を避けて回り込もうとすると、猪の線とビームの線に入る。
//   ・柱4本 (3,3)(3,8)(6,3)(6,8) はそのまま＝ビームを切り、突進を当てると猪が気絶する。
//   ・逃げ場＝北の口から一息の部屋 5,1（敵なし）へ下がって立て直せる（敵は元に戻る）。
// 敵の強さ＝ζ 36×2 ＋ μ 45 ＋ ω 36 ＝ 153（直す前 117）。1室の上限 162 以内・5,0 の 147 より少し上。
//
// 使い方：node scripts/migrate-dark-tower-111-5f-gate.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { walkable, clearLine } from './migrate-dark-tower-111-3f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '5,2';
export const KEY_CELL = '6,5';
export const DOOR = '8,5';
export const NORTH_IN = ['0,5', '0,6'];
export const SOUTH_OUT = ['9,5', '9,6'];

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..#....#..#',
	'#..μ.......#',
	'#..........#',
	'#..#....#..#',
	'#..........#',
	'#...ζ..ζ...#',
	'#####..#####',
];
export const AFTER = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..#....#..#',
	'#.........ω#',
	'#...ζ..ζ...#',
	'#..#.K..#..#',
	'#........μ.#',
	'#####D######',
	'#####..#####',
];
const DIRS_BEFORE = { '8,4': 'right', '8,7': 'left' };
export const DIRS_AFTER = { '5,4': 'up', '5,7': 'up', '7,9': 'up' };
export const ENEMIES = ['4,10ω', '5,4ζ', '5,7ζ', '7,9μ'];
export const THREAT = 153;
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー111] 5F 玉座の門番の間（戦闘の部屋）。南の口の手前は鍵の扉 (8,5)。鍵 (6,5) は敵の全滅で出る＝玉座へは戦って進む。'
	+ '盾騎士 ζ×2 (5,4)(5,7) が扉の前に北向きで並ぶ（塔の入口 0,1 の再演＝最初と最後で同じ顔）。'
	+ '剣獣 μ (7,9) が扉の脇から斬り込み、突進猪 ω (4,10) が row4 と col10 を突進する＝盾を回り込むと猪とビームの線に入る。'
	+ '柱4本はビームを切り、突進を当てると猪が気絶する。北の一息の部屋 5,1 へ下がって立て直せる（敵は元に戻る）。';

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
	ok(g[0] === '#####..#####' && g[9] === '#####..#####', '北の口 (0,5)(0,6) と南の口 (9,5)(9,6) はそのまま');
	ok(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は全部壁');
	ok(g[8] === '#####D######', '南の口の手前は扉 (8,5) だけが開く');
	ok(['3,3', '3,8', '6,3', '6,8'].every((k) => { const [r, c] = cellOf(k); return g[r][c] === '#'; }), '柱4本はそのまま');
	ok(Object.keys(st.mapEnters ?? {}).length === 0, '出入口（階段）は無い');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const directional = es.filter((e) => ENEMY_META[e.slice(-1)].directional).map((e) => e.slice(0, -1));
	ok(same(Object.keys(st.enemyDirs).sort(), directional.sort()), 'enemyDirs が向き別の敵の位置と一致（ω は向きを持たない）');
	ok(st.enemyDirs['5,4'] === 'up' && st.enemyDirs['5,7'] === 'up', '盾騎士は北向き（入ってきたプレイヤーへ盾）');

	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);
	ok(t <= 162, `脅威度 ${t} が1室の上限 162 を超える`);
	const hall3f = stageThreat(data.layers.dark_tower.stages['3,3'], ENEMY_META);
	ok(t >= hall3f, `脅威度 ${t} が 3F の大広間 ${hall3f} を下回る`);

	// 入った瞬間に張り付かれない・撃たれない（5,1 からの着地・玉座から戻った着地・扉）
	const lands = [...NORTH_IN, '1,5', '1,6', ...SOUTH_OUT, DOOR];
	for (const land of lands) {
		const [ar, ac] = cellOf(land);
		for (const e of es) {
			const pos = e.slice(0, -1);
			const [r, c] = cellOf(pos);
			ok(Math.max(Math.abs(r - ar), Math.abs(c - ac)) >= 3, `着地 ${land} の近くに敵 ${e}`);
			if ('μω'.includes(e.slice(-1))) ok(!clearLine(g, pos, land), `着地 ${land} が ${e} のビーム／突進の線上`);
		}
	}

	// 通り道：鍵なしでは南の口へ届かない・鍵には届く・床は全部つながっている
	const closed = walkable(g, NORTH_IN);
	ok(closed.has(KEY_CELL), '北の口から鍵へ届かない');
	ok(!SOUTH_OUT.some((k) => closed.has(k)), '鍵なしで南の口へ届いてしまう（戦いが飾り）');
	const open = walkable(g, NORTH_IN, { open: true });
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
