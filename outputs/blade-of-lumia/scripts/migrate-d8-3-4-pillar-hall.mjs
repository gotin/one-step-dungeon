// scripts/migrate-d8-3-4-pillar-hall.mjs
// 実行キュー112（2026-11-21）：沼地の神殿 D8 `3,4`（2,4・3,3・4,4 をつなぐ広間）を「剣獣の柱の間」（戦闘の部屋）にする。
//
// ユーザー判断（2026-11-19）＝D8 の残りはパズルと戦闘を半々。戦闘の部屋は敵の組み合わせで難しくする。
//
// 直す前＝四角い広間に E・C（28）だけ。北（→3,3）・西（→2,4 底なし沼の石）・東（→4,4）の三つの口。
// 新しい姿：
//   ・1マスの石柱を3本、部屋の真ん中（敵の近く）に散らす＝剣獣の飛ぶ剣を遮る盾。
//     どの口の着地からも柱は3マス以上離す＝入ってすぐは柱に守られない。北の口の列 (1,6) は剣獣 (8,6) から
//     筋が通る＝入った瞬間に飛ぶ剣が来る。柱を使うには自分から敵の方へ踏み込む。
//     ユーザー指摘（2026-11-21・1版目＝2マスの柱5本を北と南に並べた）＝「壁のおかげでちょっと簡単すぎる。
//     プレーヤーが積極的に壁を使おうとしないと使えないぐらいの配置に。今は最初から壁に守られていて比較的安全に戦えてしまう」。
//   ・剣獣 μ (8,6)=up：離れると飛ぶ剣（間合い 2.5〜9）・近いと斬る・間合い 3〜6.5 を保って下がる。
//     盾騎士 ζ (4,5)=up：正面の攻撃を弾く＝横か後ろへ回る（向き直りは遅い）。
//     跳躍蜘蛛 β (8,4)：離れた所から3マス跳んで来る＝柱の陰に隠れても追い出される。
//   ・柱の陰で剣を避ける → 蜘蛛が跳んで来る → 剣獣に近づこうとすると盾騎士が前を塞ぐ、の組み合わせ。
//     3体とも D8 では初めて（剣獣・跳躍蜘蛛）か、別の組み合わせ（盾騎士は 3,2 では単独）。
//   ・全滅で南東の隅に宝箱 (8,10)＝ルピー×100（killAll）。
// 敵の強さ＝μ 45 ＋ ζ 36 ＋ β 16 ＝ 97（直す前 28）。どの口の着地からも敵は3マス以上。口は戦わずに通れる。
//
// 使い方：node scripts/migrate-d8-3-4-pillar-hall.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { stageThreat } from './lib/enemy-placement.mjs';
import { reach } from './migrate-d8-2-3-island-turrets.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const LAYER = 'dungeon_8';
const KEY = '3,4';
export const CHEST = '8,10';
export const LANDINGS = ['1,5', '1,6', '4,1', '5,1', '4,10', '5,10'];
export const EXITS = ['0,5', '0,6', '4,0', '5,0', '4,11', '5,11'];
export const PILLARS = ['4,7', '5,4', '7,7'];

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'.....E......',
	'............',
	'#..........#',
	'#......C...#',
	'#..........#',
	'############',
];
export const AFTER = [
	'#####..#####',
	'#..........#',
	'#..........#',
	'#..........#',
	'.....ζ.#....',
	'....#.......',
	'#..........#',
	'#......#...#',
	'#...β.μ...B#',
	'############',
];
export const DIRS_AFTER = { '4,5': 'up', '8,6': 'up' };
export const ENEMIES = ['4,5ζ', '8,4β', '8,6μ'];
export const THREAT = 97;
// 爆弾にしない＝D8 に来る時点の爆弾は満タン（8）で、拾っても増えない（実測 2026-11-21）
export const CONTENT = { type: 'rupee', value: 100, name: 'ルピー×100' };
const SHOW = { trigger: 'killAll' };
const COMMENT = '[キュー112] D8 剣獣の柱の間（戦闘の部屋）。真ん中に1マスの石柱3本（剣獣の飛ぶ剣を遮る・口から3マス以上離した＝自分から踏み込まないと使えない）。'
	+ '剣獣 μ (8,6)・盾騎士 ζ (4,5)・跳躍蜘蛛 β (8,4)。柱の陰で剣を避けると蜘蛛が跳んで来て、剣獣へ近づくと盾騎士が前を塞ぐ。'
	+ '全滅で南東の隅に宝箱 (8,10)＝ルピー×100。三つの口は戦わずに通れる。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(cond, msg) { if (!cond) die(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cellOf = (k) => k.split(',').map(Number);

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
	apply('enemyDirs', st.enemyDirs, {}, DIRS_AFTER, () => { st.enemyDirs = { ...DIRS_AFTER }; });
	apply('宝箱', st.chestContents, {}, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	apply('出現条件', st.showConditions, {}, { [CHEST]: SHOW }, () => { st.showConditions = { [CHEST]: { ...SHOW } }; });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	const at = (k) => { const [r, c] = cellOf(k); return g[r][c]; };
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(EXITS.every((k) => at(k) === '.'), '三つの口はそのまま');
	ok(g[9] === '############', '南に口は無い');
	ok(PILLARS.every((k) => at(k) === '#'), '石柱');
	ok(at(CHEST) === 'B', '宝箱');
	ok(Object.keys(st.bgTiles ?? {}).length === 0, '水を足さない');

	const es = [];
	g.forEach((row, r) => [...row].forEach((ch, c) => { if (ENEMY_META[ch]) es.push(`${r},${c}${ch}`); }));
	ok(same(es, ENEMIES), `敵の配置: ${es}`);
	const directional = es.filter((e) => ENEMY_META[e.slice(-1)].directional).map((e) => e.slice(0, -1));
	ok(same(Object.keys(st.enemyDirs).sort(), directional.sort()), 'enemyDirs が向き別の敵の位置と一致');
	const t = stageThreat(st, ENEMY_META);
	ok(t === THREAT, `脅威度 ${t}（期待 ${THREAT}）`);

	// 三つの口は互いに歩いて届く・床は全部つながる（柱が部屋を割らない）
	const foot = reach(g, new Set(), LANDINGS);
	ok(LANDINGS.every((k) => foot.has(k)), '三つの口がつながっていない');
	const floor = g.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '#' ? [] : [`${r},${c}`])));
	ok(floor.every((k) => foot.has(k)), `歩いて届かない床: ${floor.filter((k) => !foot.has(k))}`);

	// 入った瞬間に張り付かれない（どの口の着地からも敵は3マス以上）
	for (const l of LANDINGS) {
		const [ar, ac] = cellOf(l);
		for (const e of es) {
			const [r, c] = cellOf(e.slice(0, -1));
			ok(Math.max(Math.abs(r - ar), Math.abs(c - ac)) >= 3, `着地 ${l} の近くに敵 ${e}`);
		}
	}
	// 入ってすぐは柱に守られない＝どの口の着地からも柱は3マス以上・北の口 (1,6) は剣獣 (8,6) から筋が通る
	for (const l of LANDINGS) {
		const [ar, ac] = cellOf(l);
		for (const p of PILLARS) {
			const [r, c] = cellOf(p);
			ok(Math.max(Math.abs(r - ar), Math.abs(c - ac)) >= 3, `着地 ${l} の近くに柱 ${p}`);
		}
	}
	for (let r = 1; r < 8; r++) ok(g[r][6] !== '#', `剣獣 (8,6) から北の口 (1,6) への筋を (${r},6) が塞ぐ`);
	console.log(`✔ 自己検証 OK（脅威度 ${t}・三つの口は戦わずに通れる・着地は安全）`);

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
