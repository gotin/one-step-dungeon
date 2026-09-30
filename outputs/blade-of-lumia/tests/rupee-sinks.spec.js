// ── tests/rupee-sinks.spec.js ── 実行キュー13 ③ ルピーの使い道（2026-09-30）──────────
// ユーザー確定（2026-09-29）＝「A 情報屋・C 妖精の瓶」。回復薬は「小も大も一個ずつ」、
// 妖精の瓶は「1本まで」・100 ルピー・よみがえると HP 全快。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 上限を超えて持てる（床の薬・宝箱・店・くじのどこか1つでも）
//   ② 持てないのに**消える**（床の薬が消える／宝箱が開いて空になる／店がルピーだけ取る）
//      ＝「持てないなら取らない＝その場に残す」
//   ③ 上限の導入前に何本も持っていたセーブが**減る**
//   ④ 妖精の瓶がよみがえらせない／使っても減らない／瓶が無いのにゲームオーバーにならない
//   ⑤ セーブの壊れた値（文字列・小数）で `fairies > 0` が化ける
//   ⑥ 情報屋：地図の無い人・もう見つけた人・もう教わった人からルピーを取る／印が立たない
//   ⑦ 店の行を**クリック**して買うと、ルピーだけ減って品が来ない（キュー13 ③までの不具合）
//   ⑧ うわさの行き先が実在する宝箱でない／中身が名前と違う（データ全走査）
//   ⑩ 情報屋が専用の絵にならない／他の店まで変わる／エディタとゲームで絵が違う
//   ⑪ 店が進行の道具（ブーメランなど SUB_ITEM_KEYS）を売る／うわさの値段がユーザー判定と違う
//
// くじで満杯の薬が当たったときは払い戻す（キュー36・2026-09-30 ユーザー確定。それまでは
// 「はずれ・払い戻さない」だった）。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { ITEM_META, ITEM_STACK_MAX } from '../shared/items.js';
import { SHOP_NPC_SPRITES, NPC_SPRITE_MAP, npcSpriteOf } from '../shared/npcs.js';
import { PLAYER_SPRITES, PLAYER_PAL } from '../shared/sprites-player.js';
import { SUB_ITEM_KEYS } from '../shared/progression.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

const HUB = '9,9';
const MERCHANT = [6, 7];   // 旅の商人（上の 5,7 から下を向いて話す）
const BROKER   = [4, 9];   // 情報屋（下の 5,9 から上を向いて話す）
// 店の品の並び（データの順）＝旅の商人：小・大・妖精の瓶（ブーメランは 2026-09-30 に外した＝⑪）
const MERCHANT_IDX = { healPotion: 0, bigHealPotion: 1, fairy: 2 };
// うわさを買える持ち金（値段 1000〜3000＝2026-09-30 ユーザー判定）。値段はデータから読むので固定の額にしない
const RICH = 10000;

async function seed(page, { player: extra = {}, stageState = {} } = {}) {
	const player = {
		x: 5, y: 5,
		hp: 6, maxHp: 6, maxHearts: 3,
		atk: 2, def: 0, keys: 0,
		weapon: null, shield: null, armor: null,
		swordTier: -1, armorTier: -1, shieldTier: -1,
		subItems: {}, activeSubItem: null,
		rupees: 100, triforceCount: 0,
		hasWingRobe: false, flying: false, hasLadder: false,
		defeatedBosses: [],
		gachaPulls: {},
		...extra,
	};
	const saveData = JSON.stringify({
		player, stageState,
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

const withFieldMap = { dungeonItems: { field: { hasMap: true, hasCompass: false } } };

/** 店の前に立って話しかける（剣を振る）。実ループは止める＝9,9 の雑魚が近づかない。 */
async function openShopAt(page, [r, c], standDir) {
	await page.evaluate(({ r, c, standDir }) => {
		const g = window.__game;
		const [sr, sc] = standDir === 'down' ? [r - 1, c] : [r + 1, c];
		g.enterStage('field', '9,9', sr, sc);
		g.pause();
		g.setHeroDir(standDir);
		g.swordAttack();
	}, { r, c, standDir });
	await expect(page.locator('#shop-overlay')).toBeVisible();
}

async function selectRow(page, idx) {
	// ↑↓ で選ぶ（先頭から idx 回 ↓）
	for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
	await expect(page.locator('.shop-item-row').nth(idx)).toHaveClass(/selected/);
}

const player = (page) => page.evaluate(() => window.__game.getPlayer());
const result = (page) => page.locator('#shop-result');

test.describe('ルピーの使い道（キュー13 ③）', () => {

	test.describe('① 回復薬は小・大とも1本まで', () => {

		test('表：上限は 小1・大1・妖精の瓶1', () => {
			expect(ITEM_STACK_MAX).toEqual({ healPotion: 1, bigHealPotion: 1, fairy: 1 });
		});

		test('giveSubItem：満杯なら渡さない・上限導入前の3本は減らさない', async ({ page }) => {
			await seed(page, { player: { subItems: { bigHealPotion: { count: 3 } } } });
			const r = await page.evaluate(() => {
				const g = window.__game;
				const first  = g.giveSubItem('healPotion');
				const second = g.giveSubItem('healPotion');
				const big    = g.giveSubItem('bigHealPotion');
				const p = g.getPlayer();
				return { first, second, big, small: p.subItems.healPotion?.count, bigCount: p.subItems.bigHealPotion?.count };
			});
			expect(r.first).toBe(true);
			expect(r.second).toBe(false);
			expect(r.small).toBe(1);
			expect(r.big).toBe(false);
			expect(r.bigCount, '上限導入前に持っていた3本が減った').toBe(3);
		});

		test('床の薬：満杯なら拾わずに床に残す→1本使えば拾える', async ({ page }) => {
			await seed(page, { player: { subItems: { healPotion: { count: 1 } } } });
			// dungeon_1 3,0 の (4,5) に回復薬（小）の床タイル
			const layer = 'dungeon_1', stage = '3,0';
			expect(MAP.layers[layer].stages[stage].tiles[4][5]).toBe(TILE.ITEM_HEAL_POTION);
			const walkOn = () => page.evaluate(({ layer, stage }) => {
				const g = window.__game;
				g.enterStage(layer, stage, 4, 4);
				g.pause();
				g.movePlayer('right'); g.step(1);
				g.movePlayer('right'); g.step(1);
				const p = g.getPlayer();
				return {
					at: [Math.round(p.y), Math.round(p.x)],
					count: p.subItems.healPotion?.count ?? 0,
					picked: g.getStageState().pickedKeys.includes('4,5'),
				};
			}, { layer, stage });
			const full = await walkOn();
			expect(full.at).toEqual([4, 5]);
			expect(full.count).toBe(1);
			expect(full.picked, '満杯なのに床の薬が消えた').toBe(false);
			// 1本使った（＝空いた）ら拾える＝同じ場所に残っていた証拠
			await page.evaluate(() => { delete window.__game.getPlayer().subItems.healPotion; });
			const empty = await walkOn();
			expect(empty.count).toBe(1);
			expect(empty.picked).toBe(true);
		});

		test('宝箱：満杯なら開けずに閉じたまま→空けば開く', async ({ page }) => {
			await seed(page, { player: { subItems: { healPotion: { count: 1 } } } });
			// field 1,0 の (7,2) は回復薬（小）の宝箱（封印なし）
			const st = MAP.layers.field.stages['1,0'];
			expect(st.tiles[7][2]).toBe(TILE.CHEST);
			expect(st.chestContents['7,2']).toMatchObject({ type: 'item', item: 'healPotion' });
			expect(st.showConditions?.['7,2']).toBeUndefined();
			const walkOn = () => page.evaluate(() => {
				const g = window.__game;
				g.enterStage('field', '1,0', 7, 1);
				g.pause();
				g.movePlayer('right'); g.step(1);
				g.movePlayer('right'); g.step(1);
				const p = g.getPlayer();
				return { count: p.subItems.healPotion?.count ?? 0, opened: g.getStageState().openedChests.includes('7,2') };
			});
			const full = await walkOn();
			expect(full.count).toBe(1);
			expect(full.opened, '満杯なのに宝箱が開いた（中身が消える）').toBe(false);
			await page.evaluate(() => { delete window.__game.getPlayer().subItems.healPotion; });
			const empty = await walkOn();
			expect(empty.count).toBe(1);
			expect(empty.opened).toBe(true);
		});

		test('くじ・ボス報酬（grantReward）：満杯なら「もう持てない」と言って渡さない', async ({ page }) => {
			await seed(page, { player: { subItems: { healPotion: { count: 1 } } } });
			const r = await page.evaluate(() => {
				const g = window.__game;
				const msg = g.grantReward({ type: 'item', item: 'healPotion', name: '回復薬' });
				return { msg, count: g.getPlayer().subItems.healPotion.count };
			});
			expect(r.msg).toContain('もう持てない');
			expect(r.count).toBe(1);
		});

		// キュー36（2026-09-30 ユーザー確定）で「はずれ・払い戻さない」→「払い戻す」に変えた。
		// 天井の回数が動かないことは `tests/gacha-once.spec.js` ④ が見る。
		test('くじ：満杯の薬が当たったら払い戻す（持てない薬は来ない・ルピーは減らない）', async ({ page }) => {
			await seed(page, { player: { rupees: 100, subItems: { healPotion: { count: 1 } } } });
			// 重み 50/30/15/5 ＝ 0.85×100＝85 は3枠目（回復薬）
			await page.evaluate(() => { Math.random = () => 0.85; });
			const gachaCell = Object.entries(MAP.layers.field.stages[HUB].shopData).find(([, s]) => s.items[0].gacha)[0];
			expect(MAP.layers.field.stages[HUB].shopData[gachaCell].items[0].gacha.pool[2].reward.item).toBe('healPotion');
			await openShopAt(page, gachaCell.split(',').map(Number), 'down');
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText('もう持てない');
			await expect(result(page)).toContainText('ルピーを返した');
			await expect(result(page)).toHaveClass('miss');
			const p = await player(page);
			expect(p.rupees).toBe(100);
			expect(p.subItems.healPotion.count).toBe(1);
		});

		test('店：満杯なら売らない＝ルピーを取らない（行にも出る）', async ({ page }) => {
			await seed(page, { player: { rupees: 100, subItems: { healPotion: { count: 1 } } } });
			await openShopAt(page, MERCHANT, 'down');
			await expect(page.locator('#shop-title')).toContainText('旅の商人');
			const row = page.locator('.shop-item-row').nth(MERCHANT_IDX.healPotion);
			await expect(row).toContainText('もう持てない');
			await expect(row).toHaveClass(/cannot-afford/);
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText('もう持てない');
			const p = await player(page);
			expect(p.rupees).toBe(100);
			expect(p.subItems.healPotion.count).toBe(1);
		});
	});

	test('⑦ 店の行をクリックして買うと品が来る（ルピーだけ減らない）', async ({ page }) => {
		await seed(page, { player: { rupees: 100 } });
		await openShopAt(page, MERCHANT, 'down');
		await page.locator('.shop-item-row').nth(MERCHANT_IDX.healPotion).click();
		await expect(result(page)).toContainText('購入した');
		const p = await player(page);
		expect(p.rupees).toBe(90);
		expect(p.subItems.healPotion?.count, 'クリックで買ったのに薬が来ない').toBe(1);
	});

	test('⑨ 店で初めてサブアイテムを買っても ↑↓・Escape が効く（ヒントは店を閉じてから出る）', async ({ page }) => {
		// 2026-09-30 ユーザー報告＝ヒントのダイアログが店の窓の裏で開き、キー入力を奪っていた
		await seed(page, { player: { rupees: 100 } });
		expect(await page.evaluate(() => window.__game.getPlayer()._shownSubItemHint)).toBeFalsy();
		await openShopAt(page, MERCHANT, 'down');
		await page.keyboard.press(' ');
		await expect(result(page)).toContainText('購入した');
		await expect(page.locator('#dialog-overlay')).toBeHidden();
		await page.keyboard.press('ArrowDown');
		await expect(page.locator('.shop-item-row').nth(1), '買った後に ↓ が効かない').toHaveClass(/selected/);
		await page.keyboard.press('Escape');
		await expect(page.locator('#shop-overlay'), '買った後に Escape が効かない').toBeHidden();
		await expect(page.locator('#dialog-overlay')).toBeVisible();
		await expect(page.locator('#dialog-overlay')).toContainText('サブアイテムを手に入れた');
	});

	test('店のルピー不足は店の中に出る（閉じるまで黙らない）', async ({ page }) => {
		await seed(page, { player: { rupees: 5 } });
		await openShopAt(page, MERCHANT, 'down');
		await page.keyboard.press(' ');
		await expect(result(page)).toContainText('ルピーが足りない');
		expect((await player(page)).rupees).toBe(5);
	});

	test.describe('④ 妖精の瓶', () => {

		test('旅の商人が 100 ルピーで売る・2本目は売らない', async ({ page }) => {
			await seed(page, { player: { rupees: 250 } });
			await openShopAt(page, MERCHANT, 'down');
			await selectRow(page, MERCHANT_IDX.fairy);
			await expect(page.locator('.shop-item-row').nth(MERCHANT_IDX.fairy)).toContainText('妖精の瓶');
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText('妖精の瓶 を購入した');
			let p = await player(page);
			expect(p.fairies).toBe(1);
			expect(p.rupees).toBe(150);
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText('もう持てない');
			p = await player(page);
			expect(p.fairies).toBe(1);
			expect(p.rupees, '2本目を断ったのにルピーを取った').toBe(150);
		});

		test('HP が 0 になると1本使って全快でよみがえる→瓶が無ければゲームオーバー', async ({ page }) => {
			await seed(page, { player: { hp: 1, maxHp: 6, fairies: 1 } });
			await page.evaluate(() => { window.__game.pause(); });
			const hit = () => page.evaluate(() => {
				const g = window.__game;
				const p = g.getPlayer();
				g.injectEnemyProjectile(p.x, p.y, -1, 0, 4, 2);
				g.step(2);
			});
			await hit();
			let p = await player(page);
			expect(p.hp, 'よみがえっていない').toBe(p.maxHp);
			expect(p.fairies, '使った瓶が減っていない').toBe(0);
			await expect(page.locator('#gameover-overlay')).toBeHidden();
			// 無敵（2000ms）が切れるまで論理時間を進めてから、もう一度 HP 1 で当てる
			await page.evaluate(() => { const g = window.__game; g.step(20); g.getPlayer().hp = 1; });
			await hit();
			await expect(page.locator('#gameover-overlay')).toBeVisible();
		});

		test('セーブの壊れた値：文字列は 0・小数は切り捨て・上限超えは減らさない', async ({ page }) => {
			await seed(page, { player: { fairies: 'x' } });
			expect((await player(page)).fairies).toBe(0);
		});

		test('セーブの小数・上限超え', async ({ page }) => {
			await seed(page, { player: { fairies: 2.7 } });
			expect((await player(page)).fairies).toBe(2);
		});

		test('ポーズ画面の「だいじなもの」に出る', async ({ page }) => {
			await seed(page, { player: { fairies: 1 } });
			await page.keyboard.press('Escape');
			await expect(page.locator('#pause-key-items')).toContainText('妖精の瓶');
		});
	});

	test.describe('⑥ 情報屋のうわさ', () => {

		test('⑧ データ：うわさの行き先は実在する宝箱で、中身が品名どおり・値段は重さで差', () => {
			const hub = MAP.layers.field.stages[HUB];
			expect(hub.tiles[BROKER[0]][BROKER[1]]).toBe(TILE.NPC_SHOP);
			const shop = hub.shopData[BROKER.join(',')];
			expect(shop.name).toBe('情報屋');
			const goods = shop.items;
			expect(goods.length).toBe(8);
			const priceOf = {};
			for (const g of goods) {
				expect(g.id).toBe('rumor');
				const { layer = 'field', stage, cell, label } = g.rumor;
				const st = MAP.layers[layer]?.stages?.[stage];
				expect(st, `${g.name}：画面 ${stage} が無い`).toBeTruthy();
				const [r, c] = cell.split(',').map(Number);
				expect(st.tiles[r][c], `${g.name}：${stage} (${cell}) が宝箱でない`).toBe(TILE.CHEST);
				const content = st.chestContents[cell];
				expect(content?.type).toBe('item');
				expect(g.name, `${g.name}：中身（${content.item}）と品名が違う`).toContain(ITEM_META[content.item].name);
				expect(label).toBeTruthy();
				(priceOf[content.item] ??= new Set()).add(g.price);
			}
			// 印は画面単位＝同じ画面を2件が指すと、片方を買った瞬間にもう片方も「教わった」になる
			expect(new Set(goods.map(g => g.rumor.stage)).size).toBe(goods.length);
			// 同じ品は同じ値段・靴 > かけら > 袋/矢筒
			const p = Object.fromEntries(Object.entries(priceOf).map(([k, s]) => { expect(s.size).toBe(1); return [k, [...s][0]]; }));
			expect(p.swiftBoots).toBeGreaterThan(p.heartPiece);
			expect(p.heartPiece).toBeGreaterThan(p.bombBag);
			expect(p.bombBag).toBe(p.quiver);
		});

		test('⑧ データ：うわさの画面を指す印が他の会話に無い（あると最初から「教わった」になる）', () => {
			const stages = new Set(MAP.layers.field.stages[HUB].shopData[BROKER.join(',')].items.map(g => g.rumor.stage));
			const hits = [];
			(function walk(o, path) {
				if (!o || typeof o !== 'object') return;
				if (path.includes('shopData')) return;   // うわさ自身は数えない
				if (typeof o.stage === 'string' && stages.has(o.stage)) hits.push(path);
				for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
			})(MAP, '');
			expect(hits).toEqual([]);
		});

		test('地図が無いと売らない＝ルピーを取らない', async ({ page }) => {
			await seed(page, { player: { rupees: RICH } });
			await openShopAt(page, BROKER, 'up');
			await expect(page.locator('#shop-title')).toContainText('情報屋');
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText('地図を 持っていないと');
			const p = await player(page);
			expect(p.rupees).toBe(RICH);
			expect(p.mapMarks ?? []).toEqual([]);
		});

		test('買うと印が立って選ばれる・2度目は取らない', async ({ page }) => {
			// 先に別の印を選んでおく＝`grantMark` は「何も選んでいないときだけ」自動で選ぶ∴
			// 空の状態で試すと、買った印を選び直す処理が無くても緑になる
			const other = { layer: 'field', stage: '6,13', label: '草原の洞窟', kind: 'dungeon' };
			await seed(page, { player: { rupees: RICH, ...withFieldMap, mapMarks: [other], selectedMarkId: 'field:6,13' } });
			const goods = MAP.layers.field.stages[HUB].shopData[BROKER.join(',')].items;
			const g0 = goods[0];
			await openShopAt(page, BROKER, 'up');
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText(`地図に「${g0.rumor.label}」を記した`);
			let p = await player(page);
			expect(p.rupees).toBe(RICH - g0.price);
			expect(p.mapMarks).toContainEqual({ layer: 'field', stage: g0.rumor.stage, label: g0.rumor.label, kind: 'item' });
			expect(p.selectedMarkId).toBe(`field:${g0.rumor.stage}`);
			await expect(page.locator('.shop-item-row').nth(0)).toContainText('地図に記した');
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText('もう 地図に 記してある');
			p = await player(page);
			expect(p.rupees, '教えた場所をもう一度売った').toBe(RICH - g0.price);
			// 店を出ると HUD の矢印がその印を指す
			await page.keyboard.press('Escape');
			await expect(page.locator('#hud-mark-guide')).toBeVisible();
			await expect(page.locator('#hud-mark-guide')).toContainText(g0.rumor.label);
		});

		test('もう開けた宝箱のうわさは売らない（行にも「見つけた」）', async ({ page }) => {
			const goods = MAP.layers.field.stages[HUB].shopData[BROKER.join(',')].items;
			const g1 = goods[1];
			await seed(page, {
				player: { rupees: RICH, ...withFieldMap },
				stageState: { [`field_${g1.rumor.stage}`]: { openedChests: [g1.rumor.cell] } },
			});
			await openShopAt(page, BROKER, 'up');
			await selectRow(page, 1);
			await expect(page.locator('.shop-item-row').nth(1)).toContainText('見つけた');
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText('もう 見つけた');
			const p = await player(page);
			expect(p.rupees).toBe(RICH);
			expect(p.mapMarks ?? []).toEqual([]);
		});

		test('ルピー不足なら売らない（値段より1少ない）', async ({ page }) => {
			const g0 = MAP.layers.field.stages[HUB].shopData[BROKER.join(',')].items[0];
			await seed(page, { player: { rupees: g0.price - 1, ...withFieldMap } });
			await openShopAt(page, BROKER, 'up');
			await page.keyboard.press(' ');
			await expect(result(page)).toContainText('ルピーが足りない');
			const p = await player(page);
			expect(p.rupees).toBe(g0.price - 1);
			expect(p.mapMarks ?? []).toEqual([]);
		});
	});

	// ⑪ 店の品の決め事（2026-09-30 ユーザー判定）
	//   「ブーメランは店で売らないことにしよう」＝D2 の宝箱の報酬（進行の道具）を店が先に売ると、
	//   D2 の報酬の意味が消え、ブーメランで解く仕掛けを D2 より前に飛ばせる。
	//   「疾風の靴の噂は3000 にしよう。他も最低で1000ぐらい」＝靴 3000・かけら 1200・袋/矢筒 1000。
	test.describe('⑪ 店の品の決め事', () => {
		test('データ：どの店も進行の道具（SUB_ITEM_KEYS）を売らない（全走査）', () => {
			const sold = [];
			let shops = 0;
			for (const [lk, ld] of Object.entries(MAP.layers)) {
				for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
					for (const [cell, shop] of Object.entries(sd.shopData ?? {})) {
						shops++;
						for (const g of shop.items ?? []) if (SUB_ITEM_KEYS.includes(g.id)) sold.push(`${lk}/${sk} (${cell}) ${g.id}`);
					}
				}
			}
			expect(shops, '店が1つも無い＝走査が空振り').toBeGreaterThan(0);
			expect(sold).toEqual([]);
			expect(MAP.layers.field.stages[HUB].shopData[MERCHANT.join(',')].items.map(g => g.id))
				.toEqual(Object.keys(MERCHANT_IDX));
		});

		test('データ：うわさの値段＝靴 3000・かけら 1200・爆弾袋/矢筒 1000', () => {
			const hub = MAP.layers.field.stages[HUB];
			const want = { swiftBoots: 3000, heartPiece: 1200, bombBag: 1000, quiver: 1000 };
			const got = hub.shopData[BROKER.join(',')].items.map(g => {
				const { layer = 'field', stage, cell } = g.rumor;
				return [MAP.layers[layer].stages[stage].chestContents[cell].item, g.price];
			});
			expect(got.length).toBe(8);
			for (const [item, price] of got) expect(price, item).toBe(want[item]);
		});

		test('ゲーム：旅の商人の行にブーメランが無い', async ({ page }) => {
			await seed(page, { player: { rupees: RICH } });
			await openShopAt(page, MERCHANT, 'down');
			await expect(page.locator('#shop-title')).toContainText('旅の商人');
			await expect(page.locator('.shop-item-row')).toHaveCount(Object.keys(MERCHANT_IDX).length);
			await expect(page.locator('#shop-items')).not.toContainText(ITEM_META.boomerang.name);
			await expect(page.locator('.shop-item-row').nth(MERCHANT_IDX.fairy)).toContainText('妖精の瓶');
		});
	});

	// ⑩ 情報屋の専用の見た目（refs/情報屋1.png・2.png・2026-09-30 ユーザー依頼「あったほうがいい」）
	//   当て所：情報屋が商人の絵のまま／他の店まで情報屋の絵になる／エディタとゲームで絵が違う／
	//           表に無い名前で絵が消える
	test.describe('⑩ 情報屋の見た目', () => {

		test('データ：店の sprite は全部 SHOP_NPC_SPRITES にあり、絵とパレットが登録済み（全走査）', () => {
			const bad = [];
			let n = 0;
			for (const [lk, ld] of Object.entries(MAP.layers)) {
				for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
					for (const [cell, shop] of Object.entries(sd.shopData ?? {})) {
						if (shop?.sprite === undefined) continue;
						n++;
						const m = SHOP_NPC_SPRITES[shop.sprite];
						if (!m || !PLAYER_SPRITES[m.sprite] || !PLAYER_PAL[m.pal]) bad.push(`${lk}/${sk} (${cell}) '${shop.sprite}'`);
					}
				}
			}
			expect(bad).toEqual([]);
			expect(n, '見た目を差し替えた店が1つも無い＝走査が空振り').toBeGreaterThan(0);
			expect(MAP.layers.field.stages[HUB].shopData[BROKER.join(',')].sprite).toBe('npcInfo');
			for (const f of PLAYER_SPRITES.npcInfo) {
				expect(f.length).toBe(32);
				for (const row of f) expect(row.length).toBe(32);
			}
		});

		test('npcSpriteOf：表に無い名前・sprite 無しは既定の商人の絵（消えない）', () => {
			const sd = { shopData: { '1,1': { sprite: 'npcInfo' }, '2,2': { sprite: 'nope' }, '3,3': {} } };
			expect(npcSpriteOf(sd, '1,1', TILE.NPC_SHOP).sprite).toBe('npcInfo');
			expect(npcSpriteOf(sd, '2,2', TILE.NPC_SHOP)).toEqual(NPC_SPRITE_MAP[TILE.NPC_SHOP]);
			expect(npcSpriteOf(sd, '3,3', TILE.NPC_SHOP)).toEqual(NPC_SPRITE_MAP[TILE.NPC_SHOP]);
			// 店以外は shopData を見ない
			expect(npcSpriteOf(sd, '1,1', TILE.NPC_A)).toEqual(NPC_SPRITE_MAP[TILE.NPC_A]);
		});

		test('ゲーム：情報屋だけ npcInfo・旅の商人とくじの壺は商人の絵のまま', async ({ page }) => {
			await seed(page);
			await page.evaluate(() => { window.__game.enterStage('field', '9,9', 5, 5); window.__game.pause(); });
			const spriteAt = (r, c) => page.evaluate(({ r, c }) =>
				document.querySelector(`#board [data-row="${r}"][data-col="${c}"] canvas[data-sprite]`)?.dataset.sprite ?? null, { r, c });
			await expect.poll(() => spriteAt(...BROKER)).toBe('npcInfo');
			expect(await page.evaluate(({ r, c }) =>
				document.querySelector(`#board [data-row="${r}"][data-col="${c}"] canvas[data-sprite]`)?.dataset.pal, { r: BROKER[0], c: BROKER[1] })).toBe('npcInfo');
			expect(await spriteAt(...MERCHANT)).toBe('npcShop');
			expect(await spriteAt(6, 9)).toBe('npcShop');
		});

		test('エディタ：同じ絵で描く・「見た目」を既定に戻すとその場で商人の絵になり sprite が消える', async ({ page }) => {
			page.on('dialog', d => d.dismiss().catch(() => {}));
			await page.goto('/blade-of-lumia/editor/');
			await page.waitForSelector('#world-grid');
			const chooser = page.waitForEvent('filechooser');
			await page.locator('#btn-load').click();
			await (await chooser).setFiles(MAP_PATH);
			await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
			await page.locator('#tab-world').click();
			const tabs = page.locator('#layer-tabs button.layer-tab');
			for (let i = 0; i < await tabs.count(); i++) {
				if (await tabs.nth(i).evaluate(el => el.childNodes[0]?.textContent ?? '') === 'field') { await tabs.nth(i).click(); break; }
			}
			await page.locator('#world-grid .world-cell')
				.filter({ has: page.locator('.cell-coord', { hasText: /^\(9,9\)/ }) }).first().click();
			await page.locator('#btn-edit-stage').click();
			await page.waitForSelector('#stage-canvas', { state: 'visible' });
			await expect(page.locator('#stage-coord-label')).toContainText('[field] ステージ (9, 9)');

			const sprs = (k) => page.evaluate((k) => window.__editorDrawLog.get(k)?.sprs ?? [], k);
			expect(await sprs(BROKER.join(','))).toContain('npcInfo@npcInfo');
			expect(await sprs(MERCHANT.join(','))).toContain('npcShop@npcB');

			const sel = page.locator(`#shop-list select[data-key="${BROKER.join(',')}"]`);
			await expect(sel).toHaveValue('npcInfo');
			// 保存したデータの店（「既定」＝キーごと消える・空文字を残さない）
			const savedShop = async () => {
				await page.locator('#btn-save').click();
				const raw = await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData'));
				expect(raw, 'エディタが保存していない').toBeTruthy();
				return JSON.parse(raw).layers.field.stages[HUB].shopData[BROKER.join(',')];
			};
			await sel.selectOption('');
			await expect.poll(() => sprs(BROKER.join(','))).toContain('npcShop@npcB');
			expect('sprite' in await savedShop(), '既定に戻したのに sprite が残っている').toBe(false);
			await sel.selectOption('npcInfo');
			await expect.poll(() => sprs(BROKER.join(','))).toContain('npcInfo@npcInfo');
			expect((await savedShop()).sprite).toBe('npcInfo');
		});
	});
});
