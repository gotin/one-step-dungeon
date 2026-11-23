// キュー109（2026-11-16 ユーザー確定）：クリア時の強さを女王の周回へ引き継ぐ。
// ①引き継ぐ＝剣・盾・鎧・ハートの器・光の紋章・剣技の巻物・金の装束（道具・ルピー・妖精は引き継がない）
// ②周回の上乗せ＝剣 ×1.2・守りなし・歩きなし ③器・紋章・巻物は「引き継いだ数まで」 ④金の装束の女王は髪が金＋体の光
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { snapshotCarry, normalizeCarry, carriedGain, clearedSwordAtk, CARRY_KEY } from '../game/carry-over.js';
import { PLAYER_PAL } from '../shared/sprites-player.js';

const SAVE_KEY = 'blade-of-lumia-save';
const CLEARED_KEY = 'blade-of-lumia-cleared';
const FULL = { swordTier: 3, shieldTier: 2, armorTier: 2, maxHearts: 12, emblems: 8, scrolls: 8, goldGarb: true };

test('写し取り＝強さの7つだけ・壊れた値は引き継がない側に倒す', () => {
	const c = snapshotCarry({
		swordTier: 3, shieldTier: 2, armorTier: 1, maxHearts: 9, emblems: 5, scrolls: 4, hasGoldGarb: true,
		subItems: { bomb: { count: 8 } }, hasLadder: true, rupees: 500, fairies: 1,
	});
	expect(c).toEqual({ swordTier: 3, shieldTier: 2, armorTier: 1, maxHearts: 9, emblems: 5, scrolls: 4, goldGarb: true });
	expect(normalizeCarry({ swordTier: 99, armorTier: 'x', maxHearts: -5, emblems: 50, goldGarb: 'yes' }))
		.toEqual({ swordTier: -1, shieldTier: -1, armorTier: -1, maxHearts: 3, emblems: 8, scrolls: 0, goldGarb: false });
	expect(normalizeCarry(null)).toBe(null);
});

test('引き継いだ数まで＝max(引き継いだ数, 素＋拾った数)・上限は超えない・引き継ぎの無い周回は null', () => {
	const p = { carryFloor: { hearts: 6, emblems: 3, scrolls: 8 }, carryEarned: { hearts: 0, emblems: 0, scrolls: 0 } };
	expect([1, 2, 3, 4].map(() => carriedGain(p, 'hearts'))).toEqual([6, 6, 6, 7]);   // 3+4=7 で初めて増える
	expect([1, 2, 3, 4].map(() => carriedGain(p, 'emblems'))).toEqual([3, 3, 3, 4]);
	expect(carriedGain(p, 'scrolls')).toBe(8);
	expect(carriedGain({}, 'hearts')).toBe(null);
	expect([4, 6, 9, 14, 16].map((a) => clearedSwordAtk(a, true))).toEqual([5, 7, 11, 17, 19]);
	expect(clearedSwordAtk(9, false)).toBe(9);
});

test('金の女王の色＝髪の3色だけ金・光の型は体全体（輪郭は抜かない）', () => {
	const q = PLAYER_PAL.queen, g = PLAYER_PAL.queenGold, s = PLAYER_PAL.queenGoldShine;
	expect(g.length).toBe(q.length);
	for (let i = 0; i < q.length; i++) {
		if ([14, 15, 16].includes(i)) expect(g[i], `髪 ${i}`).not.toBe(q[i]);
		else expect(g[i], `髪以外 ${i}`).toBe(q[i]);
	}
	expect(s.slice(0, 3)).toEqual(['transparent', 'transparent', 'transparent']);
	expect(s.slice(3).every((c) => c !== 'transparent')).toBe(true);
});

// 実機：クリアの印＋引き継ぎの記録を置いて素の URL を開く＝セーブが無いので「はじめから」が走る
async function startClearedRun(page, carry) {
	await page.addInitScript(({ SAVE_KEY, CLEARED_KEY, CARRY_KEY, carry }) => {
		if (sessionStorage.getItem('__carrySeeded')) return;   // 1回だけ置く（reload で上書きしない）
		sessionStorage.setItem('__carrySeeded', '1');
		localStorage.removeItem(SAVE_KEY);
		localStorage.setItem(CLEARED_KEY, '1');
		if (carry) localStorage.setItem(CARRY_KEY, JSON.stringify(carry));
		else localStorage.removeItem(CARRY_KEY);
	}, { SAVE_KEY, CLEARED_KEY, CARRY_KEY, carry });
	await page.goto(GAME_URL);
	await waitForBoard(page);
	await finishCurseScene(page);
	await page.waitForTimeout(300);
}

// キュー116：クリア後の「はじめから」は、剣士が石になる場面から始まる＝読み進めて村に立つまで送る
async function finishCurseScene(page) {
	await page.waitForFunction(() => document.body.classList.contains('ending-scene'), null, { timeout: 5000 });
	for (let i = 0; i < 200; i++) {
		const st = await page.evaluate(() => ({
			busy: document.body.classList.contains('ending-scene'),
			dlg: !document.getElementById('dialog-overlay').classList.contains('hidden'),
		}));
		if (!st.busy) return;
		if (st.dlg) await page.keyboard.press('Space');
		await page.waitForTimeout(150);
	}
	throw new Error('剣士が石になる場面が終わらない');
}

test('はじめから（クリア後）＝引き継いだ強さで始まり、道具は無い・女王の髪が金で光る', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await startClearedRun(page, FULL);
	const p = await page.evaluate(() => {
		const pl = window.__game.getPlayer();
		return { swordTier: pl.swordTier, atk: pl.atk, shieldTier: pl.shieldTier, armorTier: pl.armorTier, def: pl.def,
			maxHearts: pl.maxHearts, maxHp: pl.maxHp, hp: pl.hp, emblems: pl.emblems, scrolls: pl.scrolls,
			gold: pl.hasGoldGarb, subItems: Object.keys(pl.subItems), ladder: pl.hasLadder, rupees: pl.rupees };
	});
	expect(p).toEqual({ swordTier: 3, atk: 14, shieldTier: 2, armorTier: 2, def: 3,
		maxHearts: 12, maxHp: 24, hp: 24, emblems: 8, scrolls: 8,
		gold: true, subItems: [], ladder: false, rupees: 0 });
	// ④ 髪が金（queenGold）＋光の重ね絵（体全体の型）
	await page.evaluate(() => window.__game.updateHud());
	await expect.poll(() => page.evaluate(() =>
		document.querySelector('#char-player canvas:not(.shield-overlay):not(.gold-shine)')?.dataset?.pal)).toBe('queenGold');
	expect(await page.locator('#char-player canvas.gold-shine').count()).toBeGreaterThan(0);
	expect(errors).toEqual([]);
});

test('引き継いだ周回で器・紋章を拾う＝引き継いだ数より増えない・紋章のそろう演出は出ない', async ({ page }) => {
	await startClearedRun(page, { ...FULL, maxHearts: 5, emblems: 8, goldGarb: false });
	const r = await page.evaluate(() => {
		const g = window.__game, pl = g.getPlayer();
		pl.hp = 1;
		g.giveSubItem('heartContainer');            // 3+1=4 < 5 ＝増えないが HP は満タン
		const a = { maxHearts: pl.maxHearts, hp: pl.hp };
		g.giveSubItem('heartContainer');            // 3+2=5 ＝まだ 5
		g.giveSubItem('heartContainer');            // 3+3=6 ＝ここで増える
		const b = { maxHearts: pl.maxHearts, maxHp: pl.maxHp };
		const msg = g.grantReward({ type: 'item', item: 'emblem' });
		return { a, b, emblems: pl.emblems, msg };
	});
	expect(r.a).toEqual({ maxHearts: 5, hp: 10 });
	expect(r.b).toEqual({ maxHearts: 6, maxHp: 12 });
	expect(r.emblems).toBe(8);
	expect(r.msg ?? '').not.toContain('そろった');
});

test('周回の上乗せ＝守りはそのまま（×2 なし）', async ({ page }) => {
	await startClearedRun(page, { ...FULL, armorTier: 2 });   // def 3
	const lost = await page.evaluate(() => {
		const g = window.__game, pl = g.getPlayer();
		const before = pl.hp;
		g.takeDamage(5);
		return before - pl.hp;
	});
	expect(lost).toBe(2);   // 5 - 3（旧 ×2 なら max(1, 5-6)=1）
});

test('エンディング＝クリアの瞬間の強さを引き継ぎの記録に書く（道具は書かない）', async ({ page }) => {
	await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=6&col=6&ps_sword=2&ps_shield=1&ps_armor=0&ps_hearts=7&ps_emblems=3&ps_scrolls=5&ps_goldgarb=1&ps_ladder=1&ps_cleared=0`);
	await waitForBoard(page);
	await page.evaluate(() => { localStorage.removeItem('blade-of-lumia-carry'); window._debugEnding(); });
	await expect.poll(() => page.evaluate(() => localStorage.getItem('blade-of-lumia-carry'))).not.toBe(null);
	const c = await page.evaluate(() => JSON.parse(localStorage.getItem('blade-of-lumia-carry')));
	expect(c).toEqual({ swordTier: 2, shieldTier: 1, armorTier: 0, maxHearts: 7, emblems: 3, scrolls: 5, goldGarb: true });
	expect(await page.evaluate(() => localStorage.getItem('blade-of-lumia-cleared'))).toBe('1');
});
