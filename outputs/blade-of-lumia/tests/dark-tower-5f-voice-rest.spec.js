// tests/dark-tower-5f-voice-rest.spec.js
// dark_tower 5F `5,1`＝ザーネルの声の間（一息の部屋）の番人。
//
// 経緯：キュー111（2026-11-18・`scripts/migrate-dark-tower-111-5f-voice.mjs`）。ユーザー判断＝5,0（呪い火・強烈）と
// 5,2（門番）の間は敵を置かない一息の部屋にし、小さな気づきの仕掛けで回復薬（大）を出す。1版目（スイッチ撃ち）は
// 「あまりにも簡単」→ ユーザー案「笛を吹いたら橋が現れてその先に宝箱」に作り直した。
// 穴の淵の小島に宝箱。笛を吹くと穴 (7,7)(7,8) に橋が架かる（game/passable.js revealedBridgeAt）。
//
// 守るもの：
// ① 盤面・敵なし・看板と刻み文・宝箱・橋の条件・笛の効き目
// ② 実機：笛の前は、はしごを持っていても橋の穴を渡れない（穴は2マス幅）
// ③ 実機：笛を吹くと橋が架かり、小島へ渡って回復薬（大）を拾える
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { AFTER, CHEST, BRIDGE, SIGN, HINT } from '../scripts/migrate-dark-tower-111-5f-voice.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const LAYER = 'dark_tower';
const ROOM = '5,1';
const st = map.layers[LAYER].stages[ROOM];
const rowsOf = (s) => s.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));

test.describe('Blade of Lumia – dark_tower 5F ザーネルの声の間（キュー111）', () => {
	test('① 盤面・敵なし・看板・宝箱・橋の条件・笛', () => {
		const g = rowsOf(st);
		expect(g, '5,1 の盤面').toEqual(AFTER);
		expect(g.some((row) => [...row].some((ch) => ENEMY_META[ch])), '敵を置かない').toBe(false);
		expect(st.signData[SIGN].name, '看板（ザーネルの声）').toBe('ザーネルの声');
		expect(st.signData[HINT].lines.join(''), '刻み文が笛を教える').toContain('調べ');
		expect(st.chestContents[CHEST].item, '宝箱は回復薬（大）').toBe('bigHealPotion');
		expect(st.showConditions, '橋は笛で架かる').toEqual(Object.fromEntries(BRIDGE.map((k) => [k, { trigger: 'flutePlayed' }])));
		expect(st.fluteEffect?.type, '笛の効き目は reveal').toBe('reveal');
	});
});

const previewUrl = (row, col, extra) => {
	const p = new URLSearchParams({
		fromEditor: '1', layer: LAYER, stage: ROOM, row: String(row), col: String(col),
		ps_hearts: '15', ps_sword: '2', ps_shield: '2', ps_armor: '0', ...extra,
	});
	return `/blade-of-lumia/game/?${p}`;
};
const walkEast = (n) => { const g = window.__game; for (let i = 0; i < n * 2; i++) { g.movePlayer('right'); g.step(1); } return g.getPlayer().x; };

test.describe('Blade of Lumia – dark_tower 5F ザーネルの声の間は笛で渡れる（キュー111）', () => {
	test('② 笛の前は、はしごを持っていても橋の穴を渡れない', async ({ page }) => {
		await freezeGameLoop(page);
		await page.goto(previewUrl(7, 6, { ps_ladder: '1' }));
		await waitForBoard(page);
		await page.keyboard.press('g');   // デバッグ（すり抜け）を切る
		const x = await page.evaluate(`(${walkEast})(4)`);
		expect(x, '穴 (7,7) へ入った').toBeLessThan(6.5);
	});

	test('③ 笛を吹くと橋が架かり、小島へ渡って回復薬（大）を拾える', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await freezeGameLoop(page);
		await page.goto(previewUrl(7, 6, { ps_flute: '1' }));
		await waitForBoard(page);
		await page.keyboard.press('g');
		const res = await page.evaluate(`(() => {
			const g = window.__game;
			const out = { before: ${JSON.stringify(BRIDGE)}.map((k) => g.getStageState().conditionsMet.includes(k)) };
			g.step(2); g.useSubItem(); g.step(3);
			out.after = ${JSON.stringify(BRIDGE)}.map((k) => g.getStageState().conditionsMet.includes(k));
			out.potions0 = g.getPlayer().subItems?.bigHealPotion?.count ?? 0;
			out.x = (${walkEast})(4);                // (7,6) → 橋 (7,7)(7,8) → 小島 (7,9) → 宝箱 (7,10)
			out.potions1 = g.getPlayer().subItems?.bigHealPotion?.count ?? 0;
			return out;
		})()`);
		expect(res.before, '笛の前から橋が架かっている').toEqual([false, false]);
		expect(res.after, '笛を吹いても橋が架からない').toEqual([true, true]);
		expect(res.x, '橋を渡れていない').toBeGreaterThanOrEqual(9);
		expect(res.potions1, '回復薬（大）を拾えていない').toBe(res.potions0 + 1);
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
