// tests/boss-map-mark-cleared.spec.js
// キュー114（2026-11-22 ユーザー指示「ボスを倒したらマップからボス部屋のマークは消していい気がする」）。
// ダンジョンの地図のボス部屋の印（赤い部屋＋「!」・「ボス部屋あり」のヒント）は、
// ボス部屋のボスを倒した後は出さない＝ふつうの訪れた部屋として描く。
//
// 守るもの：
// ① 倒す前（コンパスあり）は赤い部屋とヒントが出る（印そのものを消してしまっていないか）
// ② 実際にボスを倒すと、赤が消えて訪問済みの色になり、ヒントも隠れる
// ③ 同じ種類のボスを「種類の記録」（defeatedBosses）に入れただけでは消えない
//    ＝部屋の判定はボス部屋の撃破記録で行う（道中にも同じ種類が出る層がある）
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gotoFreshGame } from './helpers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dungeon_6';
const BOSS_STAGE = MAP.layers[LAYER].bossStage;   // '0,0'（ボス O は 2,4）
const BOSS_RED = '#c04040';
const VISITED = '#3a5060';
const CELL = 24, PAD = 3;

function roomOrigin(key) {
	const coords = Object.keys(MAP.layers[LAYER].stages).map((k) => k.split(',').map(Number));
	const minX = Math.min(...coords.map((c) => c[0]));
	const minY = Math.min(...coords.map((c) => c[1]));
	const [sx, sy] = key.split(',').map(Number);
	return { x: PAD + (sx - minX) * (CELL + PAD), y: PAD + (sy - minY) * (CELL + PAD) };
}

async function bossRoomColor(page) {
	await page.evaluate((lk) => {
		const p = window.__game.getPlayer();
		if (!p.dungeonItems) p.dungeonItems = {};
		p.dungeonItems[lk] = { hasMap: true, hasCompass: true };
	}, LAYER);
	await page.keyboard.press('Escape');
	await expect(page.locator('#pause-overlay')).toBeVisible();
	await expect(page.locator('#pause-map-label')).toHaveText('ダンジョンマップ');
	const { x, y } = roomOrigin(BOSS_STAGE);
	const color = await page.locator('#pause-map-canvas').evaluate((cv, [px, py]) => {
		const d = cv.getContext('2d').getImageData(px, py, 1, 1).data;
		return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
	}, [x + 2, y + 2]);
	const hint = await page.locator('#pause-map-hint').isVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('#pause-overlay')).toBeHidden();
	return { color, hint };
}

test.describe('Blade of Lumia – 倒したボスの部屋は地図の印を消す（キュー114）', () => {
	test('① 倒す前は赤い部屋とヒントが出る', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate((lk) => window.__game.enterStage(lk, '2,1', 5, 5), LAYER);
		expect(await bossRoomColor(page)).toEqual({ color: BOSS_RED, hint: true });
	});

	test('② ボス部屋のボスを倒すと印もヒントも消える', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate((lk) => window.__game.enterStage(lk, '0,0', 5, 8), LAYER);
		const boss = await page.evaluate(() => window.__game.getEnemies().find((e) => e.type === 'O'));
		expect(boss, '前提：ボス部屋にボス O がいる').toBeTruthy();
		await page.evaluate((id) => window.__game.dealDamage(id, 9999, 'sword'), boss.id);
		await page.waitForFunction(([lk, sk, id]) => window.__game.getDefeatedEnemies(lk, sk).includes(id),
			[LAYER, BOSS_STAGE, boss.id], { timeout: 20_000 });
		// 撃破の演出が終わって操作が戻るのを待つ（演出中はポーズが開かない）
		await page.waitForFunction(() => window.__game.getEnemies().length === 0 && !document.querySelector('#boss-hp-bar:not(.hidden)'), null, { timeout: 20_000 });
		await page.evaluate((lk) => window.__game.enterStage(lk, '2,1', 5, 5), LAYER);
		// 倒した後に会話（ボス撃破の語り）が出る＝読み終えるまで送る（会話中はポーズが開かない）
		for (let i = 0; i < 40; i++) {
			await page.waitForTimeout(300);
			if (await page.locator('#dialog-box').evaluate((el) => el.classList.contains('hidden'))) break;
			await page.keyboard.press('z');
		}
		await expect(page.locator('#dialog-box')).toBeHidden();
		expect(await bossRoomColor(page)).toEqual({ color: VISITED, hint: false });
	});

	test('③ 種類の記録に入れただけ（部屋のボスは健在）では消えない', async ({ page }) => {
		await gotoFreshGame(page);
		await page.evaluate((lk) => window.__game.enterStage(lk, '2,1', 5, 5), LAYER);
		await page.evaluate(() => window.__game.addDefeatedBoss('O'));
		expect(await bossRoomColor(page)).toEqual({ color: BOSS_RED, hint: true });
	});
});
