// tests/enemy-sword-beast.spec.js — Phase 5.5k #7 剣獣（SWORD_BEAST）
//
// 剣獣＝陸上通常敵の最強格（dark_tower[1,2] の戦闘部屋に集める枠）。
// 検証する機構は3つ：
//   ① swordBeam（飛ぶ斬撃）＝縦横が揃ったときだけ owner:'enemy' の 'beam' を飛ばす
//   ② 揃っていないときは撃たない（斜めには飛ばさない＝プレイヤーは列/行を外して避ける）
//   ③ guards:false＝ガード状態機械に乗らない（高機動の敵は立ち止まって構えない）
//
// 検証ステージ＝test_mechanics[27,0]（`sword_beast`）。幾何の芯は水路で隔てること：
// 陸上敵は水に入れない（passable.js enemyTilePassable）が投擲物は飛び越える
// （isTilePassableForProj は壁だけで止まる）∴速度 FAST の剣獣に密着される前に
// 遠隔攻撃だけを観測できる。ステージの詳細は scripts/migrate-test-sword-beast.mjs。
import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { stageKey } from './test-stage-keys.js';

const LAYER = 'test_mechanics';
const KEY   = stageKey('sword_beast'); // '27,0'
const BEAST_TILE = 'μ';
const BEAST_R = 4, BEAST_C = 8;   // 剣獣の初期位置（東の廊下）

async function startAt(page, { x, y, dir = 'right', hp = 6 }) {
	await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
		key: SAVE_KEY,
		value: JSON.stringify({
			player: {
				x, y, hp, maxHp: 6, maxHearts: 3,
				atk: 2, def: 0, keys: 0,
				weapon: 'sword', swordTier: 0,
				shield: null, shieldTier: -1, armor: null,
				subItems: {}, activeSubItem: null,
				rupees: 0, triforceCount: 0,
			},
			stageState: {},
			currentLayer: LAYER,
			stageKey: KEY,
			heroDir: dir,
		}),
	});
	await page.goto(GAME_URL);
	const cont = page.locator('#btn-continue');
	await cont.waitFor({ state: 'visible', timeout: 5000 });
	await cont.click();
	await page.waitForTimeout(200);
	// 盤面が出たら即止める（走らせると剣獣は速度 FAST で寄ってくる）。
	await page.evaluate(() => window.__game.pause());
}

const getBeast = (page) => page.evaluate(
	(t) => window.__game.getEnemies().find(e => e.type === t),
	BEAST_TILE,
);
const enemyBeams = (page) => page.evaluate(
	() => window.__game.getProjectiles().filter(p => p.owner === 'enemy' && p.type === 'beam'),
);
const playerHp = (page) => page.evaluate(() => window.__game.getState().player.hp);

async function stepN(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }

// n tick 進めながら敵ビームを集める（cooldown 1500ms / TICK_MS 120ms ∴ 初弾まで十数tick）。
async function collectBeams(page, ticks) {
	const seen = [];
	for (let i = 0; i < ticks; i++) {
		await page.evaluate(() => window.__game.step(1));
		for (const b of await enemyBeams(page)) {
			if (!seen.some(s => s.id === b.id)) seen.push(b);
		}
	}
	return seen;
}

test.describe('Phase 5.5k #7 – 剣獣（SWORD_BEAST）', () => {
	test('検証ステージに剣獣が1体だけ居る（ステージ幾何の裏取り）', async ({ page }) => {
		await startAt(page, { x: 2, y: 4 });
		const list = await page.evaluate(
			(t) => window.__game.getEnemies().filter(e => e.type === t),
			BEAST_TILE,
		);
		expect(list.length, '剣獣は1体').toBe(1);
		// ⚠️ 初期位置ぴったりを assert してはいけない＝Continue クリック後 pause() までの
		// 実時間（200ms）で速度 FAST の剣獣は既に西へ動いている（実測 x=7.5）。
		// 動かない不変条件（廊下の行・水路を渡れないこと）だけを見る。
		expect(list[0].y, `剣獣は row ${BEAST_R} の廊下から出られない`).toBeCloseTo(BEAST_R, 1);
		expect(list[0].x, '水路（col 5）より東・初期位置より西には来ている').toBeGreaterThan(5.5);
		expect(list[0].x).toBeLessThanOrEqual(BEAST_C);
	});

	test('水路越しに行が揃うと飛ぶ斬撃（owner:enemy の beam）を撃つ', async ({ page }) => {
		// プレイヤー(4,2) と剣獣(4,8) は row 4 で揃う＝距離 6（minRange 2.5 以上・range 9 以内）。
		await startAt(page, { x: 2, y: 4 });
		const beams = await collectBeams(page, 40);
		expect(beams.length, `飛ぶ斬撃が観測されるはず（40tick）`).toBeGreaterThan(0);
		// 西（プレイヤー側）へ真横に飛ぶ＝斜め成分を持たない。
		expect(beams[0].dx, 'プレイヤーの居る西向き（dx=-1）').toBe(-1);
		expect(beams[0].dy, '縦成分は持たない').toBe(0);
		expect(beams[0].atk, '威力は ENEMY_META.atk（剣獣=3）').toBe(3);
	});

	test('飛ぶ斬撃は水路を飛び越えてプレイヤーに当たる（陸上敵が渡れない距離でも削られる）', async ({ page }) => {
		await startAt(page, { x: 2, y: 4 });
		const before = await playerHp(page);
		let hp = before;
		for (let i = 0; i < 80 && hp === before; i++) {
			await page.evaluate(() => window.__game.step(1));
			hp = await playerHp(page);
		}
		expect(hp, '飛ぶ斬撃が水路越しに命中して hp が減るはず').toBeLessThan(before);
		// 近接ではないことの裏取り＝剣獣は水路（col 5）を渡れず東側に留まっている。
		const b = await getBeast(page);
		expect(b.x, '剣獣は水路を渡れない＝col 6 より東に留まる').toBeGreaterThan(5.5);
	});

	test('行も列も揃っていなければ撃たない（空虚でない陰性＝陽性と同じtick数で見る）', async ({ page }) => {
		// プレイヤー(2,2)。剣獣は east 廊下 row 4 の cols 6-10 にしか居られない
		// （migrate スクリプトが幾何を検査済み）∴|dy|=2, |dx|>=4＝永遠に揃わない。
		await startAt(page, { x: 2, y: 2 });
		const beams = await collectBeams(page, 40);
		expect(beams.length, '斜めには撃たない').toBe(0);
		const b = await getBeast(page);
		expect(Math.abs(b.y - 2), '剣獣は row 4 の廊下から出られない').toBeGreaterThanOrEqual(1);
	});

	test('guards:false＝近接されても構えない（ガード状態に入らずダメージも無効化しない）', async ({ page }) => {
		// 東の廊下の中（4,10）から近接させる。distance 2 ∴ minRange 2.5 未満で
		// 飛ぶ斬撃は出ず、近接（sword range 1.5）だけが起きる。
		await startAt(page, { x: 10, y: 4, dir: 'left' });
		let sawGuard = false, sawAtkPose = false;
		for (let i = 0; i < 30; i++) {
			await page.evaluate(() => window.__game.step(1));
			const b = await getBeast(page);
			if (b.guarding || b.sprite?.endsWith('Guard')) sawGuard = true;
			if (b.sprite?.endsWith('Atk')) sawAtkPose = true;
		}
		expect(sawGuard, 'guards:false の敵は構えない').toBe(false);
		expect(sawAtkPose, '近接圏に入れば攻撃ポーズは出る（＝近づいている＝空虚でない）').toBe(true);
	});

	test('構えないので正面から剣で殴れば必ずダメージが通る（ガードで無効化されない）', async ({ page }) => {
		await startAt(page, { x: 10, y: 4, dir: 'left' });
		// 剣獣が SWORD_REACH(1.2) 圏へ寄るまで進める（速度 FAST＝数tick）。
		let b = null;
		for (let i = 0; i < 20; i++) {
			await page.evaluate(() => window.__game.step(1));
			b = await getBeast(page);
			if (Math.abs(b.x - 10) <= 1.2 && Math.abs(b.y - 4) < 0.5) break;
		}
		expect(Math.abs(b.x - 10), '剣獣が剣の届く距離まで寄るはず').toBeLessThanOrEqual(1.2);
		const hpBefore = b.hp;
		await page.evaluate(() => window.__game.setHeroDir('left'));
		await page.evaluate(() => window.__game.swordAttack());
		await stepN(page, 1);
		const after = await getBeast(page);
		expect(after.hp, '構えない敵は正面からでもダメージが通る').toBeLessThan(hpBefore);
	});

	test('向き別スプライト機構に乗っている（swordBeast{D,R,U} 系が解決される・Guard は存在しない）', async ({ page }) => {
		await startAt(page, { x: 2, y: 4 });
		await stepN(page, 5);
		const b = await getBeast(page);
		expect(b.sprite, 'directional:true＝向き別の名前が解決される').toMatch(/^swordBeast[DRU]/);
		expect(b.sprite?.endsWith('Guard'), 'Guard フレームは持たない').toBe(false);
	});
});
