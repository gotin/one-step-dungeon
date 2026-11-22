// scripts/migrate-dark-tower-111-2f-landing.mjs
// 実行キュー111（2026-11-17）：暗黒の塔 2F の踊り場 `2,0` を「分裂の踊り場」（戦闘の部屋）にする。
//
// ユーザー指摘（2026-11-17）＝「dark_tower は敵との戦闘が主体なステージ多めでいい」。戦闘の部屋は
// 敵の組み合わせで難しくし、地形は逃げ場と立て直しの間合いを作る側に使う（2026-11-16）。
// 難しさの基準＝B1 入口 `0,1`（脅威度 144）を塔の標準装備で「まあまあ」（DECISIONS 2026-11-17）。
//
// 直す前＝分裂スライム δ が1体（12）だけの素の箱。着地 (6,4) から南の口まで素通りできた。
// 新しい姿：
//   ・南の口の手前を壁と鍵の扉 (8,5) で閉じる。鍵 K (5,6) は敵の全滅で出る（killAll）＝戦いが本道。
//   ・敵は7体＝分裂スライム δ×4 を北東に2×2 で固める（剣で斬ると小型2体ずつに分かれて8体に増える。
//     爆弾なら分かれずに潰れる＝固まっているうちに爆弾1発でまとめて消せる。2F の主題＝爆弾）／
//     ブーメラン鬼 π×2 が北の両角から2〜4マスの間合いでブーメランを投げる（爆弾を置く足を止める）／
//     剣獣 μ が南東から詰めてくる（ビームと斬り）。
//   ・爆弾 '5' を西の角 (7,1) に置く＝爆弾が切れていても、ここで拾って使える。
//   ・地形＝1マスの柱2本 (4,2)(6,9) と北の壁 (2,5)(2,6)＝ブーメランとビームの線を切る隠れ場。
//   ・逃げ場＝着地 (6,4) の階段に乗り直せば 1F へ下がれる（敵は元に戻る）。
// 敵の強さ＝δ 12×4 ＋ π 22.5×2 ＋ μ 45 ＝ 138（直す前 12）。1室の上限 162 以内。
// δ は剣で斬ると分かれて数が倍になる＝数字より手ごわい（分かれた小型は脅威度に数えない）。
//
// 使い方：node scripts/migrate-dark-tower-111-2f-landing.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { walkable, clearLine } from './migrate-dark-tower-111-3f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '2,0';
export const KEY_CELL = '5,6';
export const DOOR = '8,5';
export const STAIRS = '6,4';
export const PILE = '7,1';
export const SOUTH_OUT = ['9,5', '9,6'];

const BEFORE = [
	'############',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#...>......#',
	'#......δ...#',
	'#..........#',
	'#####..#####',
];
export const AFTER = [
	'############',
	'#π........π#',
	'#....##....#',
	'#.......δδ.#',
	'#.#.....δδ.#',
	'#.....K....#',
	'#...>....#.#',
	'#5.......μ.#',
	'#####D######',
	'#####..#####',
];
const DIRS_BEFORE = {};
export const DIRS_AFTER = { '1,1': 'right', '1,10': 'left', '7,9': 'left' };
export const ENEMIES = ['1,1π', '1,10π', '3,8δ', '3,9δ', '4,8δ', '4,9δ', '7,9μ'];
export const THREAT = 138;
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー111] 2F の踊り場＝分裂の踊り場（戦闘の部屋）。南の口の手前は鍵の扉 (8,5)。鍵 (5,6) は敵の全滅で出る。'
	+ '分裂スライム δ×4 を北東に固めた（剣で斬ると小型2体ずつに分かれる・爆弾なら分かれずに潰れる＝固まっているうちに爆弾でまとめて消す）。'
	+ 'ブーメラン鬼 π×2 が北の両角から投げて爆弾を置く足を止め、剣獣 μ が南東から詰めてくる。'
	+ '爆弾 (7,1) は西の角で拾える。柱 (4,2)(6,9) と北の壁が線を切る隠れ場。階段 (6,4) に乗り直せば 1F へ下がれる（敵は元に戻る）。'
	+ '⚠️ δ の4近傍は床のまま＝分裂した小型の湧き場（塞ぐと分裂が黙って死ぬ）。';

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
	ok(same(Object.keys(st.mapEnters ?? {}), [STAIRS]) && st.mapEnters[STAIRS].id === '2fEntrance', '出入口は階段 (6,4) の 2fEntrance だけ');
	ok(g[8] === '#####D######', '南の口の手前は扉 (8,5) だけが開く');
	ok(g[7][1] === '5', '爆弾 (7,1)');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const directional = es.filter((e) => ENEMY_META[e.slice(-1)].directional).map((e) => e.slice(0, -1));
	ok(same(Object.keys(st.enemyDirs).sort(), directional.sort()), 'enemyDirs が向き別の敵の位置と一致（δ は向きを持たない）');

	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);
	ok(t <= 162, `脅威度 ${t} が1室の上限 162 を超える`);

	// 分裂の湧き場＝δ の4近傍は壁でない
	for (const e of es.filter((x) => x.endsWith('δ'))) {
		const [r, c] = cellOf(e.slice(0, -1));
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ok(g[r + dr][c + dc] !== '#', `δ ${e} の4近傍 (${r + dr},${c + dc}) が壁`);
	}

	// 入った瞬間に張り付かれない・斬られない（1F からの着地・2,1 から戻った着地・扉）
	for (const land of [STAIRS, ...SOUTH_OUT, DOOR]) {
		for (const e of es) {
			const pos = e.slice(0, -1);
			const [r, c] = cellOf(pos), [lr, lc] = cellOf(land);
			ok(Math.max(Math.abs(r - lr), Math.abs(c - lc)) >= 3, `着地 ${land} の近くに敵 ${e}`);
			if (e.endsWith('μ')) ok(!clearLine(g, pos, land), `着地 ${land} が ${e} のビームの線上`);
		}
	}

	// 通り道：鍵なしでは南の口へ届かない・鍵と爆弾には届く・床は全部つながっている
	const closed = walkable(g, [STAIRS]);
	ok([KEY_CELL, PILE].every((k) => closed.has(k)), '着地から鍵のセルか爆弾へ届かない');
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
