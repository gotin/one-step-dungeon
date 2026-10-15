// ── tests/touch-dpad-hold.spec.js ── 実行キュー70 ──────────────────
// 不変条件：**スマホの十字キーは押しっぱなしで歩ける**（ユーザー決定 2026-10-15）。
// 押している間はキーボードの押しっぱなしと同じだけ歩き、短いタップでも1歩（半マス）歩く。
// 押したまま別のボタンへ滑らせると向きが変わり、中央へ外せば止まる。
// 走るボタン（旧盾ボタンの場所・靴を持つまで隠す）は押している間だけ走る。ポーズ画面はタップで閉じられる。
//
// 🔴 当て所：
//   ① 押しっぱなしでも1回しか歩かない（旧実装＝touchstart で movePlayer 1回）
//   ② 短いタップ（tick を挟まず離す）が無反応
//   ③ 離した時に余分な1歩を足す（歩いた後のタップ補填）
//   ④ 滑らせても向きが変わらない／中央で止まらない
//   ⑤ 走るボタンが効かない／靴なしで出る／離しても走り続ける
//   ⑥ ポーズ画面を閉じる手段がタッチに無い（MENU は枠の下）
//   ⑦ 走る・飛行の両方が出るとボタンが3段になり、MENU が操作盤の下に隠れる（2026-10-15 ユーザー指摘）

import { test, expect } from '@playwright/test';
import { gotoFreshGame, freezeGameLoop, expectLoopFrozen } from './helpers.js';
import { DASH_SPEED } from '../game/constants.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

// 指1本（identifier=1）のタッチを要素の中央で発生させる。
async function touch(page, type, selector) {
	await page.evaluate(({ type, selector }) => {
		const el = document.querySelector(selector);
		const r = el.getBoundingClientRect();
		const t = new Touch({ identifier: 1, target: el, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 });
		const ending = type === 'touchend' || type === 'touchcancel';
		el.dispatchEvent(new TouchEvent(type, {
			bubbles: true, cancelable: true,
			touches: ending ? [] : [t], targetTouches: ending ? [] : [t], changedTouches: [t],
		}));
	}, { type, selector });
}
const btn = (dir) => `.dpad-btn[data-dir="${dir}"]`;
const pos = (page) => page.evaluate(() => { const p = window.__game.getState().player; return { x: p.x, y: p.y }; });
const step = (page, n) => page.evaluate((n) => window.__game.step(n), n);

// 開始地点から 4 tick（＝半マス×4）まっすぐ歩ける向きと、1 tick の歩幅をキーボードで測る。
// 測った後は逆向きに同じだけ戻して開始地点に戻す。
async function findOpenDir(page) {
	const p0 = await pos(page);
	for (const dir of ['right', 'left', 'down', 'up']) {
		const r = await page.evaluate(({ dir, opp }) => {
			const g = window.__game;
			const at = () => { const p = g.getState().player; return { x: p.x, y: p.y }; };
			const a = at();
			g.queueInput(dir); g.step(1); const b = at(); g.step(3); const c = at(); g.releaseInput(dir);
			g.queueInput(opp); g.step(4); g.releaseInput(opp);
			return { one: { x: b.x - a.x, y: b.y - a.y }, four: { x: c.x - a.x, y: c.y - a.y } };
		}, { dir, opp: OPP[dir] });
		expect(await pos(page), 'キーボードで戻したら開始地点に戻るはず').toEqual(p0);
		const moved1 = r.one.x !== 0 || r.one.y !== 0;
		if (moved1 && r.four.x === 4 * r.one.x && r.four.y === 4 * r.one.y) return { dir, one: r.one, p0 };
	}
	throw new Error('開始地点から 4 tick 歩ける向きが無い');
}

test.describe('キュー70 十字キーの押しっぱなし歩行', () => {
	test.beforeEach(async ({ page }) => {
		await freezeGameLoop(page);
		await gotoFreshGame(page);
		await expectLoopFrozen(page);
		await expect(page.locator('#mobile-ctrl')).toBeVisible();
	});

	test('① 押しっぱなしでキーボードと同じだけ歩き、③ 離しても余分に歩かない', async ({ page }) => {
		const { dir, one, p0 } = await findOpenDir(page);
		await touch(page, 'touchstart', btn(dir));
		await expect(page.locator(btn(dir))).toHaveClass(/pressed/);
		await step(page, 4);
		const held = await pos(page);
		expect(held, '押しっぱなし 4 tick で半マス×4 歩くはず').toEqual({ x: p0.x + 4 * one.x, y: p0.y + 4 * one.y });
		await touch(page, 'touchend', btn(dir));
		await step(page, 4);
		expect(await pos(page), '離した後は止まる（補填の1歩も無い）').toEqual(held);
		await expect(page.locator(btn(dir))).not.toHaveClass(/pressed/);
	});

	test('② 短いタップ（tick を挟まず離す）でも半マス1歩', async ({ page }) => {
		const { dir, one, p0 } = await findOpenDir(page);
		await touch(page, 'touchstart', btn(dir));
		await touch(page, 'touchend', btn(dir));
		expect(await pos(page)).toEqual({ x: p0.x + one.x, y: p0.y + one.y });
		await step(page, 3);
		expect(await pos(page), 'タップ後に歩き続けない').toEqual({ x: p0.x + one.x, y: p0.y + one.y });
	});

	test('④ 押したまま逆向きへ滑らせると戻り、中央へ外すと止まる', async ({ page }) => {
		const { dir, one, p0 } = await findOpenDir(page);
		await touch(page, 'touchstart', btn(dir));
		await step(page, 2);
		expect(await pos(page)).toEqual({ x: p0.x + 2 * one.x, y: p0.y + 2 * one.y });
		await touch(page, 'touchmove', btn(OPP[dir]));
		await step(page, 2);
		expect(await pos(page), '滑らせた先の向きで歩くはず').toEqual(p0);
		await touch(page, 'touchmove', '.dpad-center');
		await step(page, 3);
		expect(await pos(page), '中央へ外したら止まるはず').toEqual(p0);
		await touch(page, 'touchend', '.dpad-center');
		await step(page, 2);
		expect(await pos(page)).toEqual(p0);
	});

	test('⑤ 走るボタン：靴を持つまで隠れ、押している間だけ十字キーの歩きが DASH_SPEED 倍になる', async ({ page }) => {
		await expect(page.locator('#btn-dash')).toBeHidden();
		await expect(page.locator('#btn-shield'), '中身の無かった盾ボタンは撤去').toHaveCount(0);
		const { dir, one, p0 } = await findOpenDir(page);
		await page.evaluate(() => { window.__game.getPlayer().hasSwiftBoots = true; window.__game.updateHud(); });
		await expect(page.locator('#btn-dash')).toBeVisible();
		await touch(page, 'touchstart', '#btn-dash');
		await expect(page.locator('#btn-dash')).toHaveClass(/dashing/);
		await touch(page, 'touchstart', btn(dir));
		await step(page, 2);
		expect(await pos(page), `走ると 1 tick に半マス×${DASH_SPEED}`).toEqual({ x: p0.x + 2 * DASH_SPEED * one.x, y: p0.y + 2 * DASH_SPEED * one.y });
		await touch(page, 'touchcancel', '#btn-dash');
		await expect(page.locator('#btn-dash')).not.toHaveClass(/dashing/);
		const mid = await pos(page);
		await touch(page, 'touchmove', btn(OPP[dir]));
		await step(page, 2);
		expect(await pos(page), '走るボタンを離したら普通の速さ').toEqual({ x: mid.x - 2 * one.x, y: mid.y - 2 * one.y });
		await touch(page, 'touchend', btn(OPP[dir]));
	});

	test('⑥ ポーズ画面はタップで閉じられる（MENU は枠の下に隠れる）', async ({ page }) => {
		await page.locator('#btn-menu').tap();
		await expect.poll(() => page.evaluate(() => window.__game.getState().isPaused)).toBe(true);
		// 新規開始＝サブアイテム0個＝旧来の「持ち物をタップして閉じる」道も無い状態
		expect(await page.locator('#pause-items .pause-item').count()).toBe(0);
		const top = await page.evaluate(() => {
			const at = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); };
			return { menu: at('#btn-menu')?.id ?? null, close: at('#pause-close')?.id ?? null };
		});
		expect(top.menu, 'MENU はポーズ画面に覆われている（前提）').not.toBe('btn-menu');
		expect(top.close, '戻るボタンは一番上にあって押せる').toBe('pause-close');
		await page.locator('#pause-close').tap();
		await expect.poll(() => page.evaluate(() => window.__game.getState().isPaused)).toBe(false);
		await expect(page.locator('#pause-overlay')).toBeHidden();
	});
	test('⑦ 走る・飛行の両方が出ても、右下のボタンは全部画面と操作盤の中に収まる', async ({ page }) => {
		for (const [w, h] of [[375, 667], [390, 844], [440, 956]]) {
			await page.setViewportSize({ width: w, height: h });
			await page.evaluate(() => { const pl = window.__game.getPlayer(); pl.hasSwiftBoots = true; pl.hasWingRobe = true; window.__game.updateHud(); });
			const out = await page.evaluate(() => {
				const ctrl = document.getElementById('mobile-ctrl').getBoundingClientRect();
				const bad = [];
				for (const b of document.querySelectorAll('#action-btns .action-btn')) {
					if (b.classList.contains('hidden')) continue;
					const r = b.getBoundingClientRect();
					if (r.top < ctrl.top || r.bottom > ctrl.bottom || r.left < 0 || r.right > window.innerWidth) bad.push(`${b.id} ${Math.round(r.top)}-${Math.round(r.bottom)}/${Math.round(ctrl.bottom)}`);
				}
				return { shown: [...document.querySelectorAll('#action-btns .action-btn:not(.hidden)')].length, bad };
			});
			expect(out.shown, '5個（SUB・剣・走る・飛行・MENU）出ている前提').toBe(5);
			expect(out.bad, `${w}×${h} ではみ出したボタン`).toEqual([]);
		}
	});
});
