// 消音の切り替え（実行キュー58）の番人。
//
// 音の出口は shared/sounds.js の2つのゲイン（効果音＝tone()・BGM＝_getBgmGain()）。
// 固定すること：
//   ① ポーズ画面のボタンで BGM・効果音を片方ずつ切り替えられ、実際の出口ゲインが 0/1 になる
//   ② M キーは両方まとめて（どちらかが鳴っていれば両方消す／両方消えていれば両方鳴らす）。ポーズ中でも効く
//   ③ 状態は再読み込みしても残る（localStorage）。BGM の文脈を作り直しても（stopBgm→playBgm）消音のまま
//   ④ 入力欄（プレイメモ）で打った M は消音にしない
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';

const URL = `${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=8&col=5`;
const sound = (page) => page.evaluate(() => window.__game.getSound());

async function open(page) {
	await page.goto(URL);
	await waitForBoard(page);
	// 出口を作らせる（BGM が先＝playBgm は曲が変わると AudioContext を作り直す∴効果音の出口は後で作る）
	await page.evaluate(() => { window.__game.playBgm('field'); window.__game.playSound('slash'); });
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		if (!sessionStorage.getItem('soundTestInit')) {
			localStorage.removeItem('bladeOfLumiaSound');
			sessionStorage.setItem('soundTestInit', '1');
		}
	});
});

test('① ポーズ画面のボタンで片方ずつ切り替わり、出口ゲインが 0/1 になる', async ({ page }) => {
	await open(page);
	expect(await sound(page)).toMatchObject({ bgm: true, se: true, gains: { bgm: 1, se: 1 } });
	await page.keyboard.press('Escape');
	await expect(page.locator('#pause-sound-bgm')).toHaveText('BGM：ON');

	await page.locator('#pause-sound-bgm').click();
	await expect(page.locator('#pause-sound-bgm')).toHaveText('BGM：OFF');
	expect(await sound(page)).toMatchObject({ bgm: false, se: true, gains: { bgm: 0, se: 1 } });

	await page.locator('#pause-sound-se').click();
	await expect(page.locator('#pause-sound-se')).toHaveText('効果音：OFF');
	expect(await sound(page)).toMatchObject({ bgm: false, se: false, gains: { bgm: 0, se: 0 } });

	await page.locator('#pause-sound-bgm').click();
	expect(await sound(page)).toMatchObject({ bgm: true, se: false, gains: { bgm: 1, se: 0 } });
	// クリックしたボタンにフォーカスが残らない＝Space がボタンを押し直さない
	// （ポーズ中の Space はゲーム側で何もしない∴フォーカスが残るとブラウザの既定動作でボタンが押される）
	await page.keyboard.press('Space');
	expect(await sound(page)).toMatchObject({ bgm: true, se: false });
	await page.keyboard.press('Enter');
	await expect(page.locator('#pause-overlay')).toBeHidden();
	expect(await sound(page)).toMatchObject({ bgm: true, se: false });
});

test('② M キーは両方まとめて（ポーズ中でも効く）', async ({ page }) => {
	await open(page);
	await page.keyboard.press('m');
	expect(await sound(page)).toMatchObject({ bgm: false, se: false, gains: { bgm: 0, se: 0 } });
	await page.keyboard.press('m');
	expect(await sound(page)).toMatchObject({ bgm: true, se: true, gains: { bgm: 1, se: 1 } });

	// 片方だけ消えている状態から M ＝両方消す
	await page.keyboard.press('Escape');
	await page.locator('#pause-sound-se').click();
	await page.keyboard.press('M');
	expect(await sound(page)).toMatchObject({ bgm: false, se: false });
	await expect(page.locator('#pause-sound-bgm')).toHaveText('BGM：OFF');   // ポーズ中の表示も追従
	await expect(page.locator('#pause-overlay')).toBeVisible();

});

test('③ 再読み込み・BGM の文脈の作り直しでも消音のまま', async ({ page }) => {
	await open(page);
	await page.keyboard.press('Escape');
	await page.locator('#pause-sound-bgm').click();
	await page.reload();
	await waitForBoard(page);
	await page.evaluate(() => { window.__game.playBgm('dungeon'); window.__game.playSound('slash'); });
	expect(await sound(page)).toMatchObject({ bgm: false, se: true, gains: { bgm: 0, se: 1 } });
	await page.keyboard.press('Escape');
	await expect(page.locator('#pause-sound-bgm')).toHaveText('BGM：OFF');
	// stopBgm は AudioContext を閉じて作り直す＝効果音の出口も作り直される
	await page.evaluate(() => { window.__game.playBgm('boss'); window.__game.playSound('slash'); });
	expect(await sound(page)).toMatchObject({ gains: { bgm: 0, se: 1 } });
});

test('④ プレイメモの入力欄で打った M は消音にしない', async ({ page }) => {
	await page.route('**/__playtest-notes**', (route) => route.fulfill({ json: [] }));
	await open(page);
	await page.keyboard.press('n');
	await page.locator('#pnote-text').pressSequentially('mM');
	await expect(page.locator('#pnote-text')).toHaveValue('mM');
	expect(await sound(page)).toMatchObject({ bgm: true, se: true });
});
