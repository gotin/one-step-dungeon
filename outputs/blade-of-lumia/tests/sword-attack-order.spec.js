// キュー85 #26：剣の1振りで「何をするか」の優先順位と、剣の当たり判定（game/sword-reach.js）の番人。
//
// swordAttack は「目の前の物との操作」と「剣の当たり判定」に分けた（combat.js）。分けた形は
// **上から順に試して最初に成り立った1つだけをする**＝並び順そのものが仕様になった。
// 分ける前の歯の確認で、次の決まりはどの既存テストも守っていなかった（壊しても全部緑）：
//   ① 当たり判定（純関数・ページ不要）
//      - 同じ距離なら本物の敵が幻影に勝つ／竜（敵）が金の棘に勝つ
//      - 幻影に届いていたら、より近い棘があっても幻影を消す（分ける前の順のまま）
//      - 隠れ中の敵は狙わない（背後の幻影・棘に届く）／予告中の棘は狙わない
//   ② 実機（ライブマップ test_mechanics の color_switch）
//      - 半歩スイッチに入り込んだ位置では、1マス先でなく手前のスイッチを叩く
//      - スイッチと敵が両方届くなら、スイッチだけを叩く（敵は削らない）
//      - 二周目（ps_cleared=1）は剣の攻撃力が2倍
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';
import { findSwordTarget } from '../game/sword-reach.js';
import { SWORD_REACH } from '../game/constants.js';

// ── ① 当たり判定（純関数）──────────────────────────────────────────
// プレイヤーは (0,0) のセルに立って右を向く＝中心 (0.5,0.5)・向き (1,0)。
// 相手は1×1・行0 に置く＝距離は「列の差」そのもの。
const SWING = { pcx: 0.5, pcy: 0.5, ndx: 1, ndy: 0, reach: SWORD_REACH };
const at = (x, extra = {}) => ({ x, y: 0, ...extra });
const pick = (lists) => {
	const hit = findSwordTarget(SWING, lists);
	return hit ? `${hit.kind}:${hit.target.id}` : null;
};

test.describe('剣の当たり判定（sword-reach.js findSwordTarget）', () => {
	test('届く距離の中の一番近い敵を選ぶ・届かなければ null・後ろは狙わない', () => {
		expect(pick({ enemies: [at(1, { id: 'a' }), at(1.1, { id: 'b' })] })).toBe('enemy:a');
		expect(pick({ enemies: [at(1.1, { id: 'b' }), at(1, { id: 'a' })] })).toBe('enemy:a');
		expect(pick({ enemies: [at(SWORD_REACH + 0.01, { id: 'far' })] })).toBe(null);
		expect(pick({ enemies: [at(-1, { id: 'back' })] })).toBe(null);
	});

	test('同じ距離なら本物の敵が幻影に勝つ・幻影が近ければ幻影', () => {
		expect(pick({ enemies: [at(1, { id: 'e' })], mirages: [at(1, { id: 'm' })] })).toBe('enemy:e');
		expect(pick({ enemies: [at(1, { id: 'e' })], mirages: [at(0.9, { id: 'm' })] })).toBe('mirage:m');
	});

	test('同じ距離なら竜（敵）が金の棘に勝つ・立っている棘が近ければ棘・予告中の棘は狙わない', () => {
		expect(pick({ enemies: [at(1, { id: 'e' })], thorns: [at(1, { id: 't', phase: 'up' })] })).toBe('enemy:e');
		expect(pick({ enemies: [at(1, { id: 'e' })], thorns: [at(0.9, { id: 't', phase: 'up' })] })).toBe('thorn:t');
		expect(pick({ enemies: [at(1, { id: 'e' })], thorns: [at(0.9, { id: 't', phase: 'warn' })] })).toBe('enemy:e');
	});

	test('幻影に届いていたら、より近い棘があっても幻影', () => {
		expect(pick({ mirages: [at(1, { id: 'm' })], thorns: [at(0.9, { id: 't', phase: 'up' })] })).toBe('mirage:m');
		// 対照：幻影が届かなければ棘
		expect(pick({ mirages: [at(SWORD_REACH + 0.5, { id: 'm' })], thorns: [at(0.9, { id: 't', phase: 'up' })] })).toBe('thorn:t');
	});

	test('隠れ中の敵は狙わない＝後ろの幻影・棘・別の敵に届く', () => {
		expect(pick({ enemies: [at(0.8, { id: 'h', hidden: true })] })).toBe(null);
		expect(pick({ enemies: [at(0.8, { id: 'h', hidden: true }), at(1, { id: 'e' })] })).toBe('enemy:e');
		expect(pick({ enemies: [at(0.8, { id: 'h', hidden: true })], mirages: [at(1, { id: 'm' })] })).toBe('mirage:m');
		expect(pick({ enemies: [at(0.8, { id: 'h', hidden: true })], thorns: [at(1, { id: 't', phase: 'up' })] })).toBe('thorn:t');
	});
});

// ── ② 実機（color_switch）─────────────────────────────────────────
//   row2: #[.......].#  ← SWITCH_RED '[' (2,1) / SWITCH_BLUE ']' (2,9)
const GAME = '/blade-of-lumia/game/';
function url({ row = 2, col = 5, cleared = false } = {}) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: TEST_LAYER, stage: stageKey('color_switch'),
		row: String(row), col: String(col), ps_weapon: '1',
	});
	if (cleared) p.set('ps_cleared', '1');
	return `${GAME}?${p.toString()}`;
}
async function boot(page, opts) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url(opts));
	await waitForBoard(page);
	return errors;
}

test.describe('剣の1振りの優先順位（実機・color_switch）', () => {
	test('半歩スイッチに入り込んだ位置では、手前のスイッチを叩く（1マス先は床）', async ({ page }) => {
		const errors = await boot(page, { col: 8 });
		const r = await page.evaluate(() => {
			const g = window.__game;
			const pl = g.getPlayer();
			pl.x = 8.5; pl.y = 2;
			g.setHeroDir('right');
			const before = g.getStageState().activeColor;
			g.swordAttack(); g.step(1);
			return { before, after: g.getStageState().activeColor };
		});
		// x=8.5 で右向き＝目の前の1マスは (2,10)（床）・手前の 0.5 は (2,9)（青のスイッチ）
		expect(r.before).toBeNull();
		expect(r.after, '手前のスイッチを叩かなかった').toBe('blue');
		expect(errors).toEqual([]);
	});

	test('スイッチと敵の両方に届くなら、スイッチだけを叩く', async ({ page }) => {
		const errors = await boot(page, { col: 8 });
		const r = await page.evaluate(() => {
			const g = window.__game;
			const pl = g.getPlayer();
			pl.x = 8; pl.y = 2;
			g.setHeroDir('right');
			const id = g.injectEnemy(9, 2, 50);
			g.swordAttack(); g.step(1);
			return { color: g.getStageState().activeColor, hp: g.getEnemies().find((e) => e.id === id)?.hp };
		});
		expect(r.color, 'スイッチを叩かなかった').toBe('blue');
		expect(r.hp, 'スイッチを叩いた振りで敵も削った').toBe(50);
		expect(errors).toEqual([]);
	});

	for (const cleared of [false, true]) {
		test(`剣の攻撃力：${cleared ? '二周目は2倍' : '一周目は等倍'}`, async ({ page }) => {
			const errors = await boot(page, { col: 4, cleared });
			const r = await page.evaluate(() => {
				const g = window.__game;
				const pl = g.getPlayer();
				pl.x = 4; pl.y = 2;
				g.setHeroDir('right');
				const id = g.injectEnemy(5, 2, 50);   // def 0
				g.swordAttack(); g.step(1);
				return { atk: pl.atk, lost: 50 - g.getEnemies().find((e) => e.id === id).hp };
			});
			expect(r.atk).toBeGreaterThan(0);
			expect(r.lost).toBe(cleared ? r.atk * 2 : r.atk);
			expect(errors).toEqual([]);
		});
	}
});
