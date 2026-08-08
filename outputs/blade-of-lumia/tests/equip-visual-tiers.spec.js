// tests/equip-visual-tiers.spec.js – 剣・盾のティア別「見た目」テスト（Phase 5.5g3）
//
// 検証内容：
//   ①: 装備している盾のティアで盾オーバーレイの配色（パレット）が変わる
//   ②: 剣を振ると剣スプライト（.sword-held）が出て、ティアに応じたパレットになる
//   ③: 剣を振っている間はプレイヤー本体が「構えのポーズ」スプライトに変わる
//   ④: ポーズは論理時間で切れる（ATTACK_POSE_MS 経過後は通常スプライトへ戻る）
//   ⑤: 攻撃中も盾は描く（右手側へ回る＝向きごとに見える面が変わる）
//   ⑥: 剣を持っていなければ剣スプライトは出ない
//   ⑦: 攻撃ポーズの窓（ATTACK_POSE_MS）の間は盾の防御が効かない
//       ＝見た目（盾が右手側へ回っている）と当たり判定が同じ1つの窓を見る
//
// ※ 敵の攻撃演出（.sword-thrust）は別要素として残っている。そちらは
//    tests/sea-enemies.spec.js が担保する。

import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';

// 剣ティア・盾ティア・向きを指定してセーブをロードする
async function seed(page, { swordTier = 0, shieldTier = 0, heroDir = 'down', weapon = 'sword' } = {}) {
	const saveData = JSON.stringify({
		player: {
			x: 4, y: 5,
			hp: 6, maxHp: 6, maxHearts: 3,
			atk: swordTier >= 0 ? 2 + [2, 4, 7, 12][swordTier] : 2,
			def: 0, keys: 0,
			weapon,
			swordTier,
			shield: shieldTier >= 0 ? 'shield' : null,
			shieldTier,
			armor: null,
			subItems: {}, activeSubItem: null,
			rupees: 0, triforceCount: 0,
		},
		stageState: {},
		currentLayer: 'field',
		stageKey: '7,14',
		heroDir,
	});
	await page.addInitScript(({ key, value }) => {
		try { localStorage.setItem(key, value); } catch { /* noop */ }
	}, { key: SAVE_KEY, value: saveData });
	await page.goto(GAME_URL);
	await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
	await page.locator('#btn-continue').click();
	await page.waitForFunction(() => {
		const b = document.getElementById('board');
		return !!b && b.children.length > 0;
	});
	// 実ループを止めてから論理時間を進める（クールダウン解除＋余分な tick の排除）
	await page.evaluate(() => { window.__game.pause(); window.__game.step(3); });
}

// 盾オーバーレイのパレット名（未描画なら null）
const shieldPal = (page) => page.evaluate(() =>
	document.querySelector('#char-player canvas.shield-overlay')?.dataset.pal ?? null);

// プレイヤー本体スプライト名
const heroSprite = (page) => page.evaluate(() =>
	document.querySelector('#char-player canvas[data-sprite]')?.dataset.sprite ?? null);

// 盾オーバーレイの状態（idle/attack）とスプライト名（未描画なら null）
const shieldInfo = (page) => page.evaluate(() => {
	const cv = document.querySelector('#char-player canvas.shield-overlay');
	if (!cv) return null;
	return { state: cv.dataset.shieldState, spr: cv.dataset.shieldSpr, pal: cv.dataset.pal };
});

// 剣スプライト（.sword-held）の情報（未描画なら null）
const heldSword = (page) => page.evaluate(() => {
	const el = document.querySelector('.sword-held');
	if (!el) return null;
	return { tier: el.dataset.tier, cls: el.className };
});

test.describe('Blade of Lumia – 剣・盾のティア別見た目', () => {

	test('①: 盾ティアごとに盾オーバーレイのパレットが変わる（形状は共通）', async ({ page }) => {
		for (const [tier, pal] of [[0, 'shieldWood'], [1, 'shieldIron'], [2, 'shieldMirror']]) {
			await seed(page, { shieldTier: tier });
			expect(await shieldPal(page), `shieldTier=${tier}`).toBe(pal);
		}
	});

	test('②: 剣を振ると剣スプライトが出てティアが反映される', async ({ page }) => {
		for (const [tier, key] of [[0, 'wood'], [1, 'bronze'], [2, 'silver'], [3, 'holy']]) {
			await seed(page, { swordTier: tier });
			await page.evaluate(() => window.__game.swordAttack());
			const sw = await heldSword(page);
			expect(sw, `swordTier=${tier} で剣スプライトが出ていない`).not.toBeNull();
			expect(sw.tier).toBe(key);
			expect(sw.cls).toContain(`tier-${key}`);
		}
	});

	test('③: 4方向すべてで構えのポーズに変わり、向きのクラスが付く', async ({ page }) => {
		for (const [dir, spr] of [
			['down', 'heroDAtk'], ['right', 'heroRAtk'], ['left', 'heroRAtk'], ['up', 'heroUAtk'],
		]) {
			await seed(page, { swordTier: 3, heroDir: dir });
			expect(await heroSprite(page), `${dir} の待機スプライト`).not.toBe(spr);
			await page.evaluate(() => window.__game.swordAttack());
			expect(await heroSprite(page), `${dir} の攻撃ポーズ`).toBe(spr);
			const sw = await heldSword(page);
			expect(sw.cls).toContain(`dir-${dir}`);
		}
	});

	test('④: ポーズは論理時間で切れて通常スプライトへ戻る', async ({ page }) => {
		await seed(page, { swordTier: 3, heroDir: 'down' });
		await page.evaluate(() => window.__game.swordAttack());
		expect(await heroSprite(page)).toBe('heroDAtk');

		// ATTACK_POSE_MS=180ms・TICK_MS=120ms ∴ 2 tick で必ず期限切れになる
		await page.evaluate(() => window.__game.step(2));
		expect(await heroSprite(page)).toBe('heroD');
	});

	test('⑤: 攻撃中も盾を描く（右手側へ回る＝向きごとに見える面が変わる）', async ({ page }) => {
		// プレイヤーは左利き＝剣は左手・盾は右手。攻撃で盾がワールド 90° 回る∴
		//   下/上向き … 側面（shieldSide）／右向き … 正面（shield）／左向き … 裏面（shieldBack）
		for (const [dir, spr] of [
			['down', 'shieldSide'], ['up', 'shieldSide'],
			['right', 'shield'], ['left', 'shieldBack'],
		]) {
			await seed(page, { swordTier: 3, shieldTier: 2, heroDir: dir });
			const idle = await shieldInfo(page);
			expect(idle, `${dir} の待機で盾が出ていない`).not.toBeNull();
			expect(idle.state).toBe('idle');
			expect(idle.pal).toBe('shieldMirror');

			await page.evaluate(() => window.__game.swordAttack());
			const atk = await shieldInfo(page);
			expect(atk, `${dir} の攻撃中に盾が消えている`).not.toBeNull();
			expect(atk.state, `${dir} の攻撃中の盾が待機配置のまま`).toBe('attack');
			expect(atk.spr, `${dir} の攻撃中に見える盾の面`).toBe(spr);
			expect(atk.pal, 'ティア配色は攻撃中も維持').toBe('shieldMirror');

			// ポーズが切れたら待機配置へ戻る
			await page.evaluate(() => window.__game.step(2));
			expect((await shieldInfo(page)).state).toBe('idle');
		}
	});

	test('⑥: 剣を持っていなければ剣スプライトは出ない', async ({ page }) => {
		await seed(page, { swordTier: -1, weapon: null });
		await page.evaluate(() => window.__game.swordAttack());
		expect(await heldSword(page)).toBeNull();
		expect(await heroSprite(page)).toBe('heroD');
	});

	test('⑦: 攻撃ポーズの窓の間は盾の防御が効かない（見た目と当たり判定が同じ窓）', async ({ page }) => {
		// 盾の無効化は _atkUntil（=ATTACK_POSE_MS 180ms）の窓で判定する。
		// 剣のクールダウン（SWORD_COOLDOWN_MS 100ms）だけで判定していた頃は
		// 100〜180ms の間だけ「盾が右手側へ回った絵なのに正面ブロックできる」
		// 食い違いが出ていた。TICK_MS=120 ∴ 攻撃後 1 tick がちょうどその隙間。
		await seed(page, { swordTier: 3, shieldTier: 0, heroDir: 'right' });
		const hp0 = await page.evaluate(() => window.__game.getPlayer().hp);

		await page.evaluate(() => window.__game.swordAttack());
		// 右向きのプレイヤー位置に、右から来る投擲物（dx=-1）＝正面ブロックできる向き
		await page.evaluate(() => window.__game.injectEnemyProjectile(4, 5, -1, 0, 4, 2));
		await page.evaluate(() => window.__game.step(1));
		const hp1 = await page.evaluate(() => window.__game.getPlayer().hp);
		expect(hp1, '攻撃ポーズ中なのに盾がブロックしてしまった').toBeLessThan(hp0);

		// ポーズが切れれば正面ブロックは復活する（無敵時間 1500ms が切れるまで進める）
		await page.evaluate(() => window.__game.step(14));
		const hp2 = await page.evaluate(() => window.__game.getPlayer().hp);
		await page.evaluate(() => window.__game.injectEnemyProjectile(4, 5, -1, 0, 4, 2));
		await page.evaluate(() => window.__game.step(1));
		const hp3 = await page.evaluate(() => window.__game.getPlayer().hp);
		expect(hp3, 'ポーズが切れた後に盾がブロックしていない').toBe(hp2);
	});

});
