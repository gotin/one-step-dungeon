// scripts/migrate-dark-tower-111-5f-voice.mjs
// 実行キュー111（2026-11-18）：暗黒の塔 5F `5,1`（ザーネルの声の間）を「一息の部屋」にする。
//
// ユーザー判断（2026-11-18）＝5F は 5,0（呪い火・強烈）→ 5,1 → 5,2（門番）→ 5,3（ザーネル）と続くので、
// 5,1 は敵を置かない一息の部屋にする。小さな気づきの仕掛けを解くと回復薬（大）が出る。
// ❌ 1版目（スイッチを1本の線から射ると宝箱が出る）はユーザー「あまりにも簡単」＝作り直し。
//    ユーザー案「笛を吹いたら橋が現れてその先に宝箱があって、薬をゲットできる」を採った。
//
// 直す前＝ザーネルの声の看板 (2,6) だけの素の箱。
// 新しい姿：
//   ・南東に穴の淵（rows5-8 × cols7-10）。中の小島 (7,9) と回復薬（大）の宝箱 (7,10) が岸から見える。
//     淵はどこも2マス以上＝はしごは架からない・穴は羽衣でも飛べない＝歩いては取れない。
//   ・岸の刻み文 (8,6)「途切れた橋」が、笛で渡りが戻ると教える。笛を吹くと (7,7)(7,8) に橋が架かる
//     （fluteEffect reveal ＋ 穴に showConditions flutePlayed＝game/passable.js revealedBridgeAt）。
//   ・看板（ザーネルの声）はそのまま。敵は置かない。南の口から門番の間 5,2 へ。
//
// 使い方：node scripts/migrate-dark-tower-111-5f-voice.mjs [--dry]
// 冪等＝もう一度流すと「既に適用済み」で何も書かない。

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { walkable } from './migrate-dark-tower-111-3f-stairs.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const DRY = process.argv.includes('--dry');
const KEY = '5,1';
export const CHEST = '7,10';
export const ISLAND = '7,9';
export const BRIDGE = ['7,7', '7,8'];
export const SIGN = '2,6';
export const HINT = '8,6';
export const SHORE = '7,6';

const BEFORE = [
	'#####..#####',
	'#..........#',
	'#.....i....#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
export const AFTER = [
	'#####..#####',
	'#..........#',
	'#.....i....#',
	'#..........#',
	'#..........#',
	'#......xxxx#',
	'#......xxxx#',
	'#......xx.B#',
	'#.....ixxxx#',
	'#####..#####',
];
const CONTENT = { type: 'item', item: 'bigHealPotion', name: '回復薬（大）' };
const SHOW = Object.fromEntries(BRIDGE.map((k) => [k, { trigger: 'flutePlayed' }]));
const FLUTE = { type: 'reveal', message: '{{flute}} 音色に 応えて 崩れた 橋が 架かった！' };
const HINT_SIGN = {
	name: '途切れた橋の刻み文',
	lines: ['【途切れた 橋】', '玉座の 主が 橋を 落とした。', '古き 調べを 奏でれば 渡りは 戻るという。'],
};
const COMMENT = '[キュー111] 5F ザーネルの声の間＝一息の部屋（敵なし）。5,0 の呪い火の踊り場と 5,2 の門番の間にはさむ休み。'
	+ '南東の穴の淵の小島 (7,9) に回復薬（大）の宝箱 (7,10)。淵はどこも2マス以上（はしごが架からない・穴は羽衣でも飛べない）。'
	+ '岸の刻み文 (8,6) が笛を教え、笛を吹くと (7,7)(7,8) に橋が架かる（穴の showConditions flutePlayed＝revealedBridgeAt）。'
	+ '看板（ザーネルの声）はそのまま。❌ 1版目のスイッチ撃ちは「あまりにも簡単」で作り直した。';

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
	const signBefore = { [SIGN]: st.signData?.[SIGN] };
	apply('盤面', rows(), BEFORE, AFTER, () => { st.tiles = AFTER.map((r) => [...r]); });
	apply('宝箱', st.chestContents, {}, { [CHEST]: CONTENT }, () => { st.chestContents = { [CHEST]: { ...CONTENT } }; });
	apply('出現条件（橋）', st.showConditions, {}, SHOW, () => { st.showConditions = structuredClone(SHOW); });
	apply('笛の効き目', st.fluteEffect, undefined, FLUTE, () => { st.fluteEffect = { ...FLUTE }; });
	apply('刻み文', st.signData, signBefore, { ...signBefore, [HINT]: HINT_SIGN }, () => { st.signData[HINT] = structuredClone(HINT_SIGN); });
	if (st.comment !== COMMENT) { st.comment = COMMENT; changed = true; }

	// ── 自己検証 ─────────────────────────────────────────
	const g = rows();
	const at = (k) => { const [r, c] = cellOf(k); return g[r]?.[c]; };
	ok(g.length === 10 && g.every((r) => r.length === 12), '盤面の大きさ');
	ok(g[0] === '#####..#####' && g[9] === '#####..#####', '北と南の口はそのまま');
	ok(g.every((r) => r[0] === '#' && r[11] === '#'), '東西の境界は全部壁');
	ok(at(SIGN) === 'i' && st.signData[SIGN].name === 'ザーネルの声', '看板（ザーネルの声）はそのまま');
	ok(at(HINT) === 'i', '岸の刻み文 (8,6)');
	ok(at(CHEST) === 'B' && at(ISLAND) === '.', '小島 (7,9) と宝箱 (7,10)');
	ok(BRIDGE.every((k) => at(k) === 'x'), '橋のセルは穴（笛の前は渡れない）');
	ok(at(SHORE) === '.', '橋の西の岸 (7,6) は床');
	ok(!g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない（一息の部屋）');

	// 小島へは歩いて行けない・はしご（1マス幅だけ架かる）でも行けない＝小島の4近傍の穴は奥がまた穴か壁
	const before = walkable(g, ['1,5']);
	ok(!before.has(ISLAND), '笛の前に小島へ歩いて行ける');
	const [ir, ic] = cellOf(ISLAND);
	for (const [dr, dc] of [[1, 0], [-1, 0], [0, -1]]) {
		const n1 = g[ir + dr]?.[ic + dc], n2 = g[ir + 2 * dr]?.[ic + 2 * dc];
		ok(n1 === 'x' && 'x#'.includes(n2), `はしごで小島へ渡れる（${ir + dr},${ic + dc}）`);
	}
	// 淵の北側（row4 の床）から下へも2マス以上
	for (let c = 7; c <= 10; c++) ok(g[5][c] === 'x' && g[6][c] === 'x', `淵の北 (5,${c})(6,${c}) が2マス幅でない`);
	// 笛の後＝橋を床として扱うと小島へ届く
	const after = g.map((row, r) => [...row].map((ch, c) => (BRIDGE.includes(`${r},${c}`) ? '.' : ch)).join(''));
	ok(walkable(after, ['1,5']).has(ISLAND), '笛の後でも小島へ届かない');
	// 通り道：北の口・南の口・岸はつながっている
	ok(['9,5', '9,6', SHORE].every((k) => before.has(k)), '北の口から南の口・橋の岸へ歩ける');
	console.log('✔ 自己検証 OK（敵なし・笛の前は小島へ渡れない・笛の後は橋で渡れる）');

	if (changed && !DRY) {
		writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
		console.log('✔ 書き込んだ');
	} else if (changed) {
		console.log('（--dry：書き込みはしない）');
	}
}
