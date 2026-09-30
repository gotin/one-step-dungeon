// ── tests/gacha-once.spec.js ── 実行キュー36 くじの壺の器は1回限り（2026-09-30）──────────
// ユーザー確定（2026-09-30）＝「器は1回限り（5% の枠か天井のどちらかで1個出たら終わり・
// 以降は大当たりのルピー）」「満杯の薬が当たったら払い戻す」。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 天井が何周でも器を出す（キュー36 の元の不具合＝器1個 約100ルピーで買い放題）
//   ② 5% の枠から2個目の器が出る（天井だけ締めて抽選の枠を締め忘れる）
//   ③ 器が出た後の景品（afterOnce）が来ない＝代金だけ取られる／行の名前が「器があたる！」のまま
//   ④ 満杯の薬で代金を取る／天井の回数が進む（タダで天井へ近づく抜け道）
//   ⑤ 「もう出した」がセーブで消える／壊れたセーブの値で化ける
//   ⑥ 監査（`collectRewards`）がくじの器を数えない／1台を2個以上に数える
//
// ⚠️ どれも**実際の店を開いてスペースで引く**（`shopBuy` を通す）。旧 `gacha-risk-reward.spec.js`
//    ②〜⑤ はテストの中に抽選の式を書き直していて、`shopBuy` を壊しても赤くならなかった（削除済み）。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';
import { collectRewards } from '../shared/progression.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

const HUB = '9,9';
const GACHA_CELL = Object.entries(MAP.layers.field.stages[HUB].shopData).find(([, s]) => s.items[0].gacha)[0];
const GACHA = MAP.layers.field.stages[HUB].shopData[GACHA_CELL].items[0].gacha;
const KEY = `field:${HUB}:${GACHA_CELL}`;
const RICH = 10000;

// 抽選の枠を狙う乱数（重み 50/30/15/5＝データから境界を読む）
const weights = GACHA.pool.map(e => e.weight);
const total = weights.reduce((s, w) => s + w, 0);
const slotRandom = (i) => (weights.slice(0, i).reduce((s, w) => s + w, 0) + weights[i] / 2) / total;
const IDX_RUPEE5  = GACHA.pool.findIndex(e => e.reward.type === 'rupee' && e.reward.value < GACHA.price);
const IDX_POTION  = GACHA.pool.findIndex(e => e.reward.item === 'healPotion');
const IDX_HEART   = GACHA.pool.findIndex(e => e.reward.type === 'heartContainer');
const JACKPOT     = GACHA.afterOnce.reward.value;

async function seed(page, extra = {}) {
	const player = {
		x: 5, y: 5,
		hp: 6, maxHp: 6, maxHearts: 3,
		atk: 2, def: 0, keys: 0,
		weapon: null, shield: null, armor: null,
		swordTier: -1, armorTier: -1, shieldTier: -1,
		subItems: {}, activeSubItem: null,
		rupees: RICH, triforceCount: 0,
		hasWingRobe: false, flying: false, hasLadder: false,
		defeatedBosses: [],
		gachaPulls: {},
		...extra,
	};
	const saveData = JSON.stringify({
		player, stageState: {},
		currentLayer: 'field', stageKey: '7,14', heroDir: 'right',
	});
	await page.addInitScript(({ key, value }) => {
		try { localStorage.setItem(key, value); } catch { /* noop */ }
	}, { key: SAVE_KEY, value: saveData });
	await page.goto(GAME_URL);
	await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
	await page.locator('#btn-continue').click();
	await waitForBoard(page);
}

/** くじの壺の前（上のセル）に立って話しかける。実ループは止める＝9,9 の雑魚が近づかない。 */
async function openGacha(page) {
	const [r, c] = GACHA_CELL.split(',').map(Number);
	await page.evaluate(({ r, c }) => {
		const g = window.__game;
		g.enterStage('field', '9,9', r - 1, c);
		g.pause();
		g.setHeroDir('down');
		g.swordAttack();
	}, { r, c });
	await expect(page.locator('#shop-overlay')).toBeVisible();
	await expect(page.locator('#shop-title')).toContainText(MAP.layers.field.stages[HUB].shopData[GACHA_CELL].name);
}

const setRandom = (page, v) => page.evaluate((v) => { Math.random = () => v; }, v);
/** 1回引く＝スペース。結果の文が出るまで待つ（毎回書き換わる∴一度消してから待つ）。 */
async function pull(page) {
	await page.evaluate(() => { document.getElementById('shop-result').textContent = ''; });
	await page.keyboard.press(' ');
	await expect(page.locator('#shop-result')).not.toHaveText('');
}
const player = (page) => page.evaluate(() => window.__game.getPlayer());
const result = (page) => page.locator('#shop-result');

test.describe('くじの壺の器は1回限り（キュー36）', () => {

	test('前提：データのくじは1台・器の枠と天井が器・afterOnce は代金より大きいルピー', () => {
		expect(IDX_RUPEE5).toBeGreaterThanOrEqual(0);
		expect(IDX_POTION).toBeGreaterThanOrEqual(0);
		expect(IDX_HEART).toBeGreaterThanOrEqual(0);
		expect(GACHA.pityReward.type).toBe('heartContainer');
		expect(GACHA.afterOnce.reward.type).toBe('rupee');
		expect(JACKPOT).toBeGreaterThan(GACHA.price);
		let n = 0;
		for (const layer of Object.values(MAP.layers)) for (const st of Object.values(layer.stages ?? {}))
			for (const shop of Object.values(st.shopData ?? {})) n += (shop.items ?? []).filter(g => g.gacha).length;
		expect(n).toBe(1);
	});

	test('① 天井：1周目は器・2周目は大当たりのルピー（器は増えない）', async ({ page }) => {
		await seed(page, { gachaPulls: { [KEY]: GACHA.pityCount - 1 } });
		await openGacha(page);
		await setRandom(page, slotRandom(IDX_RUPEE5));   // 天井でなければ「はずれ」になる乱数
		await pull(page);
		let p = await player(page);
		expect(p.maxHearts).toBe(4);
		expect(p.gachaPulls[KEY]).toBe(0);
		expect(p.gachaPrizeTaken[KEY]).toBe(true);
		expect(p.rupees).toBe(RICH - GACHA.price);
		await expect(result(page)).toContainText('あたり');
		// 行の名前が変わる＝「器があたる！」と言い続けない
		await expect(page.locator('.shop-item-row').first()).toContainText(GACHA.afterOnce.name);

		// 2周目の天井まで回す（7回はずれ＋8回目が天井）
		for (let i = 0; i < GACHA.pityCount; i++) await pull(page);
		p = await player(page);
		expect(p.maxHearts).toBe(4);
		expect(p.gachaPulls[KEY]).toBe(0);
		const fives = (GACHA.pityCount - 1) * GACHA.pool[IDX_RUPEE5].reward.value;
		expect(p.rupees).toBe(RICH - GACHA.price * (GACHA.pityCount + 1) + fives + JACKPOT);
		await expect(result(page)).toContainText('あたり');
		await expect(result(page)).toContainText(String(JACKPOT));
	});

	test('② 5% の枠：2個目の器は出ない（40回引いても器は +1 だけ）', async ({ page }) => {
		await seed(page);
		await openGacha(page);
		await setRandom(page, slotRandom(IDX_HEART));
		await pull(page);
		let p = await player(page);
		expect(p.maxHearts).toBe(4);
		expect(p.gachaPrizeTaken[KEY]).toBe(true);
		for (let i = 0; i < 39; i++) await pull(page);
		p = await player(page);
		expect(p.maxHearts).toBe(4);
		// 39回とも器の枠か天井＝どちらも大当たりのルピー
		expect(p.rupees).toBe(RICH - GACHA.price * 40 + JACKPOT * 39);
	});

	test('②b 5% の枠で器を取った後の天井も大当たり（天井から2個目の器が出ない）', async ({ page }) => {
		await seed(page);
		await openGacha(page);
		await setRandom(page, slotRandom(IDX_HEART));
		await pull(page);
		await setRandom(page, slotRandom(IDX_RUPEE5));
		for (let i = 1; i < GACHA.pityCount; i++) await pull(page);   // 8回目＝天井
		const p = await player(page);
		expect(p.gachaPulls[KEY]).toBe(0);   // 天井に届いた（届かずに緑にならない）
		expect(p.maxHearts).toBe(4);
	});

	test('④ 満杯の薬：払い戻す＝代金も天井の回数も動かない', async ({ page }) => {
		await seed(page, { rupees: 100, subItems: { healPotion: { count: 1 } }, gachaPulls: { [KEY]: 3 } });
		await openGacha(page);
		await setRandom(page, slotRandom(IDX_POTION));
		await pull(page);
		await expect(result(page)).toContainText('もう持てない');
		await expect(result(page)).toContainText(`${GACHA.price} ルピーを返した`);
		await expect(result(page)).toHaveClass('miss');
		const p = await player(page);
		expect(p.rupees).toBe(100);
		expect(p.gachaPulls[KEY]).toBe(3);
		expect(p.subItems.healPotion.count).toBe(1);
	});

	test('④b 薬を持っていなければ薬の枠は薬が来る（払い戻しは満杯のときだけ）', async ({ page }) => {
		await seed(page, { rupees: 100 });
		await openGacha(page);
		await setRandom(page, slotRandom(IDX_POTION));
		await pull(page);
		const p = await player(page);
		expect(p.rupees).toBe(100 - GACHA.price);
		expect(p.subItems.healPotion.count).toBe(1);
		expect(p.gachaPulls[KEY]).toBe(1);
	});

	test('④c ルピー不足では引けない＝代金も回数も動かない（旧 gacha-risk-reward ② の置き換え）', async ({ page }) => {
		await seed(page, { rupees: GACHA.price - 1, gachaPulls: { [KEY]: 3 } });
		await openGacha(page);
		await setRandom(page, slotRandom(IDX_HEART));
		await pull(page);
		await expect(result(page)).toContainText('ルピーが足りない');
		const p = await player(page);
		expect(p.rupees).toBe(GACHA.price - 1);
		expect(p.gachaPulls[KEY]).toBe(3);
		expect(p.maxHearts).toBe(3);
	});

	test('⑤ 「もう出した」はセーブに残り、ロード後も器は出ない', async ({ page }) => {
		await seed(page, { gachaPrizeTaken: { [KEY]: true } });
		await openGacha(page);
		await expect(page.locator('.shop-item-row').first()).toContainText(GACHA.afterOnce.name);
		await setRandom(page, slotRandom(IDX_HEART));
		await pull(page);
		const p = await player(page);
		expect(p.maxHearts).toBe(3);
		expect(p.rupees).toBe(RICH - GACHA.price + JACKPOT);
		const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).player.gachaPrizeTaken, SAVE_KEY);
		expect(saved[KEY]).toBe(true);
	});

	test('⑤b 導入前のセーブ・壊れた値は {}＝まだ出ていない扱い', async ({ page }) => {
		await seed(page, { gachaPrizeTaken: 'broken' });
		expect((await player(page)).gachaPrizeTaken).toEqual({});
		await openGacha(page);
		await expect(page.locator('.shop-item-row').first()).toContainText(MAP.layers.field.stages[HUB].shopData[GACHA_CELL].items[0].name);
		await setRandom(page, slotRandom(IDX_HEART));
		await pull(page);
		expect((await player(page)).maxHearts).toBe(4);
	});

	test('⑥ 監査：くじ1台＝器1個（かけらだけのくじはかけら1個・器の無いくじは0）', () => {
		const withGacha = collectRewards(MAP).get('field');
		const noGacha = JSON.parse(JSON.stringify(MAP));
		const shop = noGacha.layers.field.stages[HUB].shopData[GACHA_CELL];
		shop.items = [];
		const without = collectRewards(noGacha).get('field');
		expect(withGacha.hearts - without.hearts).toBe(1);
		expect(withGacha.heartPieces - without.heartPieces).toBe(0);

		const pieceOnly = JSON.parse(JSON.stringify(MAP));
		const g = pieceOnly.layers.field.stages[HUB].shopData[GACHA_CELL].items[0].gacha;
		g.pityReward = { type: 'heartPiece' };
		g.pool = g.pool.map(e => e.reward.type === 'heartContainer' ? { ...e, reward: { type: 'heartPiece' } } : e);
		const piece = collectRewards(pieceOnly).get('field');
		expect(piece.hearts - without.hearts).toBe(0);
		expect(piece.heartPieces - without.heartPieces).toBe(1);
	});
});
