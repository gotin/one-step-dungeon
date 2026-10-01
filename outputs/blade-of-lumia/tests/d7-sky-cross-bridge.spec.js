// tests/d7-sky-cross-bridge.spec.js
// dungeon_7 `2,1`（中央の十字路）「空の十字橋」の番人
// （2026-10-01 / PLAN 実行キュー 31 の第1陣・盤面は `scripts/migrate-d7-2-1-sky-cross-bridge.mjs`）。
//
// 直す前の実測（この番人が再発を止める相手）:
//   旧 `2,1` は `dungeon_6 2,1` と盤面がバイト一致＝4方向の口がある四角い広間に騎士が1体
//   立つだけ。空中の遺跡なのに D7 全体で空 '%' が 1 枚も無かった。
//
// 守るものは3つ。
//   ① データ：盤面（空の上の十字橋）と敵の構成（センチネル F×1・コウモリ ξ×3）。
//   ② 挙動（プレイヤー）：4つの口が橋でつながっている＝西→東・北→南へ歩いて抜けられる。
//      空へは歩いても、はしごでも入れない（橋の欠け (4,2) は幅 1 でも渡れない＝穴とは違う）。
//   ③ 挙動（敵）：コウモリは空の上を飛んで寄ってくる（＝剣の届かない所から来る敵を
//      飛び道具で落とす、の前提）。センチネルは空へ出ない。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dungeon_7';
const ROOM = '2,1';
const st = map.layers[LAYER].stages[ROOM];
const BOARD = [
	'%%%%#..#%%%%',
	'%%%%%.ξ%%%%%',
	'%%%%%..%%#%%',
	'%%%%..F.%%%%',
	'..%.........',
	'.........ξ..',
	'%%%%....%%%%',
	'%%%%%.ξ%%%%%',
	'%#%%%.%%%%%%',
	'%%%%#..#%%%%',
];

const cellsOf = (ch) => {
	const out = [];
	st.tiles.forEach((row, r) => row.forEach((x, c) => { if (x === ch) out.push(`${r},${c}`); }));
	return out;
};

test.describe('D7 2,1 空の十字橋 ① データ', () => {
	test('① 盤面と敵の構成', () => {
		expect(st.tiles.every((row) => Array.isArray(row) && row.length === 12), 'tiles が文字の配列の配列でない').toBe(true);
		expect(st.tiles.map((row) => row.join('')), '盤面が変わった').toEqual(BOARD);
		expect(cellsOf(TILE.SENTRY), 'センチネルは中央の台に1体').toEqual(['3,6']);
		expect(cellsOf('ξ'), 'コウモリは3つの橋の上に1体ずつ').toEqual(['1,6', '5,9', '7,6']);
		expect(cellsOf(TILE.CHEST), '報酬なしの通り道').toEqual([]);
		expect(Object.keys(st.bgTiles ?? {}), '空は tiles の %＝下地は使わない').toEqual([]);
		// 表の外に作った敵部屋＝EXTRA_ENEMY_ROOMS に宣言しておく（無いと各機構 spec が赤くなる）。
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === ROOM),
			`${LAYER} ${ROOM} が EXTRA_ENEMY_ROOMS に宣言されていない`).toBe(true);
	});
});

// ── 実プレイ（fromEditor=1 プレビュー）──────────────────────────────
async function open(page, row, col, extra = {}) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const q = new URLSearchParams({ fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col), ...extra });
	await page.goto(`${GAME_URL}?${q}`);
	await waitForBoard(page);
	await page.evaluate(() => window.__game.pause());
	return errors;
}
// 歩行の検査では敵を先に倒す＝敵が通り道を塞いで「止まった」を空のせいと取り違えない。
const clearEnemies = (page) => page.evaluate(() => {
	const g = window.__game;
	for (const e of g.getEnemies()) g.dealDamage(e.id, 999);
	g.step(1);
	return g.getEnemies().length;
});
// 1マス＝movePlayer 2回（[[blade-moveplayer-is-half-tile]]）
const walk = (page, d, tiles) => page.evaluate(({ d, n }) => {
	for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
}, { d, n: tiles });
const snap = (page) => page.evaluate(() => {
	const g = window.__game.getState();
	const p = window.__game.getPlayer();
	return { layer: g.currentLayer, stage: g.stageKey, r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});

test.describe('D7 2,1 空の十字橋 ② プレイヤー', () => {
	test('② 西の口から東の口まで橋を歩いて抜けられる', async ({ page }) => {
		const errors = await open(page, 5, 0);
		expect(await clearEnemies(page), '敵が倒れない').toBe(0);
		await walk(page, 'right', 10);
		expect(await snap(page)).toEqual({ layer: LAYER, stage: ROOM, r: 5, c: 10 });
		expect(errors).toEqual([]);
	});

	test('② 北の口から南の口まで橋を歩いて抜けられる（欠け (8,6) の脇を通る）', async ({ page }) => {
		const errors = await open(page, 0, 5);
		expect(await clearEnemies(page), '敵が倒れない').toBe(0);
		await walk(page, 'down', 8);
		expect(await snap(page)).toEqual({ layer: LAYER, stage: ROOM, r: 8, c: 5 });
		expect(errors).toEqual([]);
	});

	test('② 空へは歩いて入れない（橋の欠け (4,2)）', async ({ page }) => {
		const errors = await open(page, 4, 1);
		expect(await clearEnemies(page), '敵が倒れない').toBe(0);
		await walk(page, 'right', 2);
		expect(await snap(page), '空 (4,2) へ入れてしまった').toMatchObject({ r: 4, c: 1 });
		expect(errors).toEqual([]);
	});

	test('② はしごがあっても空は渡れない（幅 1 の欠けでも＝穴とは違う）', async ({ page }) => {
		const errors = await open(page, 4, 1, { ps_ladder: '1' });
		expect(await clearEnemies(page), '敵が倒れない').toBe(0);
		await walk(page, 'right', 2);
		expect(await snap(page), 'はしごで空 (4,2) を渡れてしまった').toMatchObject({ r: 4, c: 1 });
		expect(errors).toEqual([]);
	});
});

test.describe('D7 2,1 空の十字橋 ③ 敵', () => {
	test('③ コウモリは空の上を飛んで寄ってくる・センチネルは空へ出ない', async ({ page }) => {
		const errors = await open(page, 5, 0);   // 西の口に立ったまま待つ
		const seen = await page.evaluate((board) => {
			const g = window.__game;
			const isSky = (x, y) => {
				// 敵が跨いでいるセル（半マス位置なら 2 列/2 行）のどれかが空か
				for (let r = Math.floor(y); r <= Math.floor(y + 0.999); r++) {
					for (let c = Math.floor(x); c <= Math.floor(x + 0.999); c++) {
						if (board[r]?.[c] === '%') return true;
					}
				}
				return false;
			};
			const out = { batOnSky: null, sentryOnSky: null };
			for (let i = 0; i < 60; i++) {
				g.step(1);
				for (const e of g.getEnemies()) {
					if (!isSky(e.x, e.y)) continue;
					if (e.type === 'ξ') out.batOnSky ??= `${e.y},${e.x}@${i}`;
					if (e.type === 'F') out.sentryOnSky ??= `${e.y},${e.x}@${i}`;
				}
			}
			return out;
		}, BOARD);
		expect(seen.batOnSky, 'コウモリが一度も空の上に出ない').not.toBeNull();
		expect(seen.sentryOnSky, 'センチネルが空の上に出た').toBeNull();
		expect(errors).toEqual([]);
	});
});
