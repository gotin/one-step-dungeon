// tests/d7-sky-sorcerer-isles.spec.js
// dungeon_7 `2,4`（十字路 `2,3` の南の通り道）「空の術士の浮島」の番人
// （2026-10-04 / PLAN 実行キュー 39 の第4陣 1室目・盤面は `scripts/migrate-d7-2-4-sky-sorcerer-isles.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `2,4` は D6 `2,4` と同じ四角い広間に宝箱（ルピー×5）が1つあるだけ。空も敵も無かった。
//
// 守るものは3つ。
//   ① データ：盤面（T 字の土手道＋浮島）と術士2体・報酬なし・EXTRA_ENEMY_ROOMS の宣言。
//   ② 幾何：浮島は歩いて行けない（はしごでも）・剣が届かない／術士の出現先が浮島にもある／
//      空の割れ目の列（4・7）に立つと土手道にしか出ない。
//   ③ 挙動（実機）＝この部屋の見せ場「術士は浮島にも出る＝剣は届かず、矢は空を越えて当たる」と、
//      立ち位置で出る場所が変わること。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { HARD_BLOCKED } from '../scripts/lib/connectivity.mjs';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import {
	TARGET as BOARD, SORCERERS, EXITS, walkable, blinkTable,
} from '../scripts/migrate-d7-2-4-sky-sorcerer-isles.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '2,4';
const st = map.layers[LAYER].stages[ROOM];
const t = st.tiles.map((row) => [...row]);

const cellsOf = (ch) => {
	const out = [];
	st.tiles.forEach((row, r) => row.forEach((x, c) => { if (x === ch) out.push(`${r},${c}`); }));
	return out;
};
// 歩ける床（土手道）と浮島は盤面の実物から引く（定数を見ると盤面が崩れても緑になる）。
const foot = walkable(t, EXITS.北[0], false);
const isles = [];
t.forEach((row, r) => row.forEach((ch, c) => { if (!HARD_BLOCKED.has(ch) && !foot.has(`${r},${c}`)) isles.push(`${r},${c}`); }));
const onIsle = (r, c) => isles.includes(`${r},${c}`);

test.describe('D7 2,4 空の術士の浮島 ① データ', () => {
	test('① 盤面・術士2体・報酬なし', () => {
		expect(st.tiles.every((row) => Array.isArray(row) && row.length === 12), 'tiles が文字の配列の配列でない').toBe(true);
		expect(st.tiles.map((row) => row.join('')), '盤面が変わった').toEqual(BOARD);
		// 盤面の定数そのものも確かめる（TARGET を import しているので、移行スクリプト側で
		// 盤面ごと書き換えられると上の比較は素通りする）。
		expect(BOARD[4], '土手道（行4）').toBe('............');
		expect(BOARD[6], '南の割れ目（行6）').toBe('#%%%%%%%%%%#');
		expect(cellsOf(TILE.SORCERER), '術士は北西と南東の浮島').toEqual(['2,2', '7,9']);
		expect(SORCERERS).toEqual(['2,2', '7,9']);
		expect(cellsOf(TILE.CHEST), '報酬なしの通り道（旧 宝箱 ルピー×5 は撤去）').toEqual([]);
		expect(Object.keys(st.chestContents ?? {}), '宝箱の中身が残っている').toEqual([]);
		expect(Object.keys(st.bgTiles ?? {}), '空は tiles の %＝下地は使わない').toEqual([]);
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			`${LAYER} ${ROOM} が EXTRA_ENEMY_ROOMS に宣言されていない`).toBe(true);
	});
});

test.describe('D7 2,4 空の術士の浮島 ② 幾何', () => {
	test('② 浮島は歩いて行けない（はしごでも）・剣が届かない・術士はどちらも浮島の上', () => {
		// 歩ける床＝T 字の土手道そのもの（行4-5 の全幅＋北の口からの列5-6）。
		// 浮島が1つでも土手道とつながると、ここが赤くなる（術士の島だけ見ると他の島の崩れを見逃す）。
		const T_ROAD = [...foot].filter((k) => {
			const [r, c] = k.split(',').map(Number);
			return !(r === 4 || r === 5 || ((c === 5 || c === 6) && r <= 3));
		});
		expect(T_ROAD, '土手道の外の床へ歩いて行ける（浮島が土手道とつながった）').toEqual([]);
		expect(foot.size, '土手道の床の数').toBe(12 * 2 + 2 * 4);
		expect(walkable(t, EXITS.北[0], true).size, 'はしごで歩ける床が増えた').toBe(foot.size);
		for (const k of [...EXITS.西, ...EXITS.東]) expect(foot.has(k), `北の口から ${k} へ歩けない`).toBe(true);
		expect(isles.length, '浮島が無い').toBeGreaterThan(0);
		let minD = Infinity;
		for (const a of isles) for (const b of foot) {
			const [ar, ac] = a.split(',').map(Number), [br, bc] = b.split(',').map(Number);
			minD = Math.min(minD, Math.hypot(ar - br, ac - bc));
		}
		expect(minD, '浮島が土手道から剣の届き（1.2）の内にある').toBeGreaterThan(1.2);
		for (const k of SORCERERS) expect(isles.includes(k), `術士 ${k} が浮島の上でない`).toBe(true);
	});

	test('② 術士の出現先：どこに立っても出られる・浮島にも出る・割れ目の列では土手道だけ', () => {
		const table = blinkTable(t, foot);
		expect(table.filter((x) => x.cands.length === 0).map((x) => x.k), '出現先が無い床').toEqual([]);
		const toIsle = table.filter((x) => x.isle.length > 0).length;
		expect(toIsle * 10, `浮島に出得る床が 4 割未満（${toIsle}/${foot.size}）`).toBeGreaterThanOrEqual(foot.size * 4);
		for (const k of ['4,4', '4,7', '5,4', '5,7']) {
			const row = table.find((x) => x.k === k);
			expect(row.isle, `${k}（割れ目の列）に立っても浮島に出る`).toEqual([]);
		}
		// 対照＝浮島を空で塗ると、浮島に出る床が 0（[[blade-control-experiment-needs-tile-wall]]）。
		const ctl = t.map((row) => [...row]);
		for (const k of isles) { const [r, c] = k.split(',').map(Number); ctl[r][c] = TILE.SKY; }
		expect(blinkTable(ctl, walkable(ctl, EXITS.北[0], false)).every((x) => x.isle.length === 0)).toBe(true);
	});
});

// ── 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
// 実時間ループ（game.js startGameLoop）を差し込ませない＝出現の拍を tick で数える（GUIDE 4-2）。
async function open(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.addInitScript(() => {
		const native = window.setInterval;
		window.__loopBlocked = 0;
		window.setInterval = function (fn, ms, ...rest) {
			if (/step\s*\(\s*1\s*\)/.test(String(fn))) { window.__loopBlocked++; return 0; }
			return native.call(window, fn, ms, ...rest);
		};
	});
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ...extra });
	await page.goto(`${GAME_URL}?${q}`);
	await waitForBoard(page);
	expect(await page.evaluate(() => window.__loopBlocked), '実時間ループの差し込み阻止が効いていない').toBeGreaterThan(0);
	await page.evaluate(() => window.__game.pause());
	return errors;
}

// 立ったまま n 回ぶんの出現を待ち、出たセルを返す（全術士ぶん）。
const watchAppears = (page, n) => page.evaluate((n) => {
	const g = window.__game;
	const p = g.getPlayer();
	const px = p.x, py = p.y;
	const seen = {}, out = [];
	for (let i = 0; i < 2000 && out.length < n; i++) {
		p.x = px; p.y = py;
		g.step(1);
		for (const e of g.getEnemies()) {
			if ((e.blinkCount ?? 0) > (seen[e.id] ?? 0)) {
				seen[e.id] = e.blinkCount;
				out.push(`${Math.round(e.y)},${Math.round(e.x)}`);
			}
		}
	}
	return out;
}, n);

test.describe('D7 2,4 空の術士の浮島 ③ 実機', () => {
	test('③ 浮島に出た術士は剣では叩けず、矢は空を越えて当たる（弱点 ×2）', async ({ page }) => {
		// 土手道 (4,2) に立ち、南東の術士を真南の浮島 (7,2) へ置く＝出現と同じ「同じ列・距離 3」。
		const errors = await open(page, 4, 2, { ps_weapon: '1', ps_bow: '1' });
		const r = await page.evaluate(() => {
			const g = window.__game;
			const p = g.getPlayer();
			p._shownSubItemHint = true;
			const [a, b] = g.getEnemies();
			g.dealDamage(a.id, 999);                       // 北西の術士は倒す（測る相手を1体に）
			g.setEnemyFieldForTest(b.id, { x: 2, y: 7 });
			g.step(1);
			const hp = () => g.getEnemies().find((e) => e.id === b.id)?.hp;
			const out = { start: hp(), phase: g.getEnemies()[0].blinkPhase };
			// 剣：南へ振る。浮島は空の向こう＝届かない。
			g.setHeroDir('down');
			g.swordAttack();
			for (let i = 0; i < 3; i++) g.step(1);
			out.afterSword = hp();
			// 矢：同じ向きのまま撃つ。
			p.activeSubItem = 'bow';
			g.useSubItem();
			for (let i = 0; i < 6; i++) g.step(1);
			out.afterArrow = hp();
			return out;
		});
		expect(r.phase, '測る tick で術士の姿が無い＝測り方が崩れている').toBe('shown');
		expect(r.afterSword, '浮島の術士に剣が届いた').toBe(r.start);
		expect(r.afterArrow, '矢が空を越えて浮島の術士に当たらない').toBeLessThan(r.start);
		expect(errors).toEqual([]);
	});

	test('③ 土手道 (4,2) に立つと術士は浮島にも出る／割れ目の列 (4,4) に立つと土手道にしか出ない', async ({ page }) => {
		const errors = await open(page, 4, 2);
		const west = await watchAppears(page, 24);
		expect(west.length).toBe(24);
		expect(west.some((k) => onIsle(...k.split(',').map(Number))),
			`(4,2) で 24 回待っても浮島に出ない（${west.join(' ')}）`).toBe(true);

		await page.goto('about:blank');
		const errors2 = await open(page, 4, 4);
		const mid = await watchAppears(page, 24);
		expect(mid.length).toBe(24);
		// 「浮島に出ない」ではなく「土手道にしか出ない」で書く＝空や壁の上に出る壊れ方も赤くなる。
		expect(mid.filter((k) => !foot.has(k)),
			`(4,4) に立っているのに土手道の外に出た（${mid.join(' ')}）`).toEqual([]);
		expect(errors.concat(errors2)).toEqual([]);
	});
});
