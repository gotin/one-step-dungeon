// ボス BGM のテンポアップ（実行キュー69）の番人。
//
// 仕様（2026-10-14 ユーザー決定＝「怒り狂った時に上げる」）：
//   ボスが後半の相に入る（boss.js checkBossPhase＝「◯◯ が 怒り狂った！」）たびに、
//   ボス BGM を1段速く・半音高くする（shared/sounds.js BOSS_BGM_STAGES）。
//   段＝その戦いで効いた相の数＝相が1つのボスは1段、魔王 X（0.5/0.25）・ザーネル Z
//   （0.66/0.33）は2段まで上がる。段は playBgm() で曲が変わると 0 に戻る
//   （リトライは enterStage が層の BGM＝'dungeon' を鳴らす→ボス戦開始で 'boss'＝通常の速さから）。
//
// 観測＝`__game.getSound().bgmState`（{ key, bossLevel, loopSec }）。loopSec は最後に
// 予約したループ1周の秒数＝実際に速さを変えて予約し直したことの証拠（段の数字だけでは
// 「数字は変わったが鳴っている譜面は元の速さ」を見逃す）。
//
// 検証ステージ＝test_mechanics の spare_arena（tests/boss-phase-behavior.spec.js と同じ）。
// 実時間ループは止める（freezeGameLoop）＝ボスが勝手に動いて結果が揺れないように。
// ボスは injectEnemy で置き、dealDamage で HP 比を狙って割る（def 0＝減算なし）。
import { test, expect } from '@playwright/test';
import { waitForBoard, freezeGameLoop } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const URL = `${GAME}?${new URLSearchParams({
	fromEditor: '1', layer: TEST_LAYER, stage: stageKey('spare_arena'), row: '4', col: '2',
}).toString()}`;

const LOOP = 8;   // 通常の速さのループ1周（秒）
const near = (a, b) => Math.abs(a - b) < 1e-6;

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		if (!sessionStorage.getItem('bgmTempoInit')) {
			localStorage.removeItem('bladeOfLumiaSound');   // BGM：ON から始める
			sessionStorage.setItem('bgmTempoInit', '1');
		}
	});
	await freezeGameLoop(page);
	await page.goto(URL);
	await waitForBoard(page);
});

const state = (page) => page.evaluate(() => window.__game.getSound());

// ボスを1体置いて、HP 比を順に割っていく。各段階の後の bgmState を返す。
async function hitDown(page, { type, hp = 100, bgm = 'boss', ratios }) {
	return page.evaluate(({ type, hp, bgm, ratios }) => {
		const g = window.__game;
		if (bgm) g.playBgm(bgm);
		const id = g.injectEnemy(6, 4, hp, 1, 1, type);
		const out = [{ ...g.getSound().bgmState }];
		let cur = hp;
		for (const r of ratios) {
			const target = Math.ceil(hp * r);
			g.dealDamage(id, cur - target);
			cur = target;
			out.push({ ...g.getSound().bgmState });
		}
		return out;
	}, { type, hp, bgm, ratios });
}

test('① 相が1つのボス（O）＝50% を割ると1段速くなる（割る前は通常の速さ）', async ({ page }) => {
	const [before, mid, after] = await hitDown(page, { type: 'O', ratios: [0.6, 0.4] });
	expect(before).toMatchObject({ key: 'boss', bossLevel: 0 });
	expect(near(before.loopSec, LOOP), `割る前のループ ${before.loopSec}`).toBe(true);
	expect(mid.bossLevel, '60%＝まだ相に入っていない').toBe(0);
	expect(after.bossLevel, '40%＝後半の相＝1段').toBe(1);
	expect(near(after.loopSec, LOOP / 1.25), `1段のループ ${after.loopSec}`).toBe(true);
});

test('② 相が2つのボス（X 0.5/0.25・Z 0.66/0.33）＝2段まで上がる', async ({ page }) => {
	const x = await hitDown(page, { type: 'X', ratios: [0.4, 0.2] });
	expect(x.map((s) => s.bossLevel)).toEqual([0, 1, 2]);
	expect(near(x[2].loopSec, LOOP / 1.45), `2段のループ ${x[2].loopSec}`).toBe(true);
});

test('②b ザーネル（Z）も2段＝0.66 と 0.33 で1段ずつ', async ({ page }) => {
	const z = await hitDown(page, { type: 'Z', ratios: [0.6, 0.3] });
	expect(z.map((s) => s.bossLevel)).toEqual([0, 1, 2]);
});

test('③ 一撃で2つの相をまたいでも2段（段は効いた相の数）', async ({ page }) => {
	const x = await hitDown(page, { type: 'X', ratios: [0.1] });
	expect(x[1].bossLevel).toBe(2);
	expect(near(x[1].loopSec, LOOP / 1.45)).toBe(true);
});

test('④ 曲が変わると通常の速さに戻る（リトライ＝層の BGM → ボス BGM の順に鳴る）', async ({ page }) => {
	await hitDown(page, { type: 'O', ratios: [0.4] });
	const after = await page.evaluate(() => {
		const g = window.__game;
		g.playBgm('dungeon');
		const mid = { ...g.getSound().bgmState };
		g.playBgm('boss');
		return { mid, boss: { ...g.getSound().bgmState } };
	});
	expect(after.mid).toMatchObject({ key: 'dungeon', bossLevel: 0 });
	expect(after.boss).toMatchObject({ key: 'boss', bossLevel: 0 });
	expect(near(after.boss.loopSec, LOOP)).toBe(true);
});

test('⑤ ボス BGM 以外が鳴っている間は相に入っても何も変えない', async ({ page }) => {
	const s = await hitDown(page, { type: 'O', bgm: 'dungeon', ratios: [0.4] });
	expect(s[1]).toMatchObject({ key: 'dungeon', bossLevel: 0 });
});

test('⑥ BGM：OFF のまま相に入っても、作り直した出口は鳴らない（ゲイン 0）', async ({ page }) => {
	await page.keyboard.press('Escape');
	await page.locator('#pause-sound-bgm').click();
	await expect(page.locator('#pause-sound-bgm')).toHaveText('BGM：OFF');
	await page.keyboard.press('Escape');
	await hitDown(page, { type: 'O', ratios: [0.4] });
	const s = await state(page);
	expect(s.bgmState.bossLevel).toBe(1);
	expect(s.gains.bgm, 'BGM の出口ゲイン').toBe(0);
	expect(s.gains.se, '効果音は ON のまま').toBe(1);
});
