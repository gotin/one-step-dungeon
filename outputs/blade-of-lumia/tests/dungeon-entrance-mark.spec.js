// ── tests/dungeon-entrance-mark.spec.js ── 実行キュー24 ─────────────────────
// 不変条件：**ダンジョンの地図に「入口の部屋」が印（緑の部屋＋白い門）で出る**。
// ユーザーの言葉＝「ダンジョンマップ上、どこがダンジョンの入り口だったのか表示できる
// ようにしたい。ダンジョンから脱出しようとしたときにどこを目指せばいいのかわからなく
// なってしまうケースが多発しそうなため」（2026-09-20）。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 入口の導出が壊れる（同じ層の中の階段まで入口に数える／1つも見つからない）
//   ② 印が入口と違う部屋に出る・コンパスを要求してしまう
//      ＝**実ブラウザの実ピクセル**で、緑が入口の部屋の中にだけあることを数える
//   ③ 入口の部屋に立つと門が消える（現在地の青で塗り潰して終わる）
//   ④ コンパスを持つと入口の印が消える（ボスの印と入れ替えてしまう）
//
// 意図した差：入口の部屋は訪問済みかどうかに関係なく緑（入ってきた部屋＝必ず訪問済み）。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { layerEntranceStages } from '../shared/exits.js';
import { gotoFreshGame } from './helpers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

const ENTRANCE = '#3f7a4a';
const GATE     = '#e8f4e0';
const MOUTH    = '#10261a';
const CURRENT  = '#80c0f0';
const BOSS     = '#c04040';
const CELL = 24, PAD = 3;

/** 部屋キー → 地図キャンバス上の左上座標 */
function roomOrigin(layer, key) {
	const coords = Object.keys(MAP.layers[layer].stages).map(k => k.split(',').map(Number));
	const minX = Math.min(...coords.map(c => c[0]));
	const minY = Math.min(...coords.map(c => c[1]));
	const [sx, sy] = key.split(',').map(Number);
	return { x: PAD + (sx - minX) * (CELL + PAD), y: PAD + (sy - minY) * (CELL + PAD) };
}

async function openRoomMap(page, layer, stage, { compass = false } = {}) {
	await gotoFreshGame(page);
	await page.evaluate(([lk, sk]) => window.__game.enterStage(lk, sk, 5, 5), [layer, stage]);
	await page.evaluate(([lk, c]) => {
		const p = window.__game.getPlayer();
		if (!p.dungeonItems) p.dungeonItems = {};
		p.dungeonItems[lk] = { hasMap: true, hasCompass: c };
	}, [layer, compass]);
	await page.keyboard.press('Escape');
	await expect(page.locator('#pause-overlay')).toBeVisible();
	await expect(page.locator('#pause-map-label')).toHaveText('ダンジョンマップ');
	return page.locator('#pause-map-canvas').evaluate((cv) => {
		const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
		const out = [];
		for (let i = 0; i < d.length; i += 4) {
			out.push(`#${[d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`);
		}
		return { w: cv.width, out };
	});
}

const at = (cv, x, y) => cv.out[y * cv.w + x];

test.describe('ダンジョン地図の入口の印', () => {
	test('① 入口の部屋は出口の結線から導出され、本編ダンジョンはちょうど1部屋', () => {
		const expected = {
			dungeon_1: '1,3', dungeon_2: '1,3', dungeon_3: '1,3', dungeon_4: '1,3',
			dungeon_5: '1,3', dungeon_6: '1,3', dungeon_7: '1,3', dungeon_8: '1,3',
			dark_tower: '0,1',
		};
		for (const [lk, key] of Object.entries(expected)) {
			expect([...layerEntranceStages(MAP, lk)], `${lk} の入口`).toEqual([key]);
		}
	});

	test('② コンパス無しでも入口の部屋だけが緑＋門で描かれる', async ({ page }) => {
		const cv = await openRoomMap(page, 'dungeon_6', '2,1');
		const { x, y } = roomOrigin('dungeon_6', '1,3');
		expect(at(cv, x + 2, y + 2), '入口の部屋の地が緑でない').toBe(ENTRANCE);
		expect(at(cv, x + 8, y + 12), '門の枠が無い').toBe(GATE);
		expect(at(cv, x + 12, y + 15), '門の口が無い').toBe(MOUTH);
		// 緑の画素はすべて入口の部屋の矩形の中にある（別の部屋に出ていない）
		let n = 0;
		cv.out.forEach((c, i) => {
			if (c !== ENTRANCE) return;
			n++;
			const px = i % cv.w, py = Math.floor(i / cv.w);
			expect(px >= x && px < x + CELL && py >= y && py < y + CELL, `入口の外に緑 (${px},${py})`).toBe(true);
		});
		expect(n).toBeGreaterThan(0);
	});

	test('③ 入口の部屋に立っているときは現在地の青の上に門', async ({ page }) => {
		const cv = await openRoomMap(page, 'dungeon_8', '1,3');
		const { x, y } = roomOrigin('dungeon_8', '1,3');
		expect(at(cv, x + 2, y + 2), '現在地の青でない').toBe(CURRENT);
		expect(at(cv, x + 8, y + 12), '現在地でも門が出ていない').toBe(GATE);
		expect(cv.out, '入口に立っているのに別の部屋が緑').not.toContain(ENTRANCE);
	});

	test('④ コンパス所持時もボス部屋は赤・入口は緑のまま', async ({ page }) => {
		const cv = await openRoomMap(page, 'dungeon_1', '2,2', { compass: true });
		const boss = roomOrigin('dungeon_1', MAP.layers.dungeon_1.bossStage);
		const ent  = roomOrigin('dungeon_1', '1,3');
		expect(at(cv, boss.x + 2, boss.y + 2)).toBe(BOSS);
		expect(at(cv, ent.x + 2, ent.y + 2)).toBe(ENTRANCE);
		expect(at(cv, ent.x + 8, ent.y + 12)).toBe(GATE);
	});
});
