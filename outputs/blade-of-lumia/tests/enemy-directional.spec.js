// tests/enemy-directional.spec.js — Phase 5.5k ①エンジン基盤（陸上敵の真4方向＋攻撃/ガードポーズ機構）
//
// DECISIONS.md 2026-08-10「陸上敵の真4方向＋攻撃/ガードポーズ機構」の実装検証。
// このセッションでは skeleton（骸骨剣士）の正面絵をエイリアスで4方向に割り当てた状態のまま、
// 機構（directional フラグ・resolveEnemySprite・敵の _atkUntil/_guardUntil）だけを先に通す。
// 向き別の実描画・専用の攻撃/ガードスプライトは次段（このテストは「機構が動くこと」だけを見る）。
//
// 検証ステージ：test_mechanics 0,0（[color_switch]）に常設された skeleton (3,5)。
import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { stageKey } from './test-stage-keys.js';

const LAYER = 'test_mechanics';
const KEY   = stageKey('color_switch'); // '0,0'
const SKEL_R = 3, SKEL_C = 5; // skeleton の常設位置

async function startAt(page, { x, y, dir = 'right', boomerang = false }) {
	await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
		key: SAVE_KEY,
		value: JSON.stringify({
			player: {
				x, y, hp: 6, maxHp: 6, maxHearts: 3,
				atk: 2, def: 0, keys: 0,
				weapon: 'sword', swordTier: 0,
				shield: null, shieldTier: -1, armor: null,
				subItems: boomerang ? { boomerang: { count: 99 } } : {},
				activeSubItem: boomerang ? 'boomerang' : null,
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
	await page.evaluate(() => window.__game.pause());
}

// SKELETON のタイル文字は 5.5k で 'k' → 'θ'（ギリシャ文字）へ移行した（shared/tiles.js 参照）。
function skeletonOf(list) { return list.find(e => e.type === 'θ'); }
async function getSkeleton(page) { return skeletonOf(await page.evaluate(() => window.__game.getEnemies())); }
async function stepN(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }

// skeleton が隣接圏(guardRange=2.4)まで近づいてガードに入るまで進める（最大 maxTicks）。
async function advanceUntilGuarding(page, maxTicks = 20) {
	let s = null;
	for (let i = 0; i < maxTicks; i++) {
		await page.evaluate(() => window.__game.step(1));
		s = await getSkeleton(page);
		if (s?.guarding) break;
	}
	return s;
}

test.describe('Phase 5.5k ① – 陸上敵の directional 機構（skeleton）', () => {
	test('プレイヤーが東西南北から近づくと敵の向き(dir)がプレイヤー方向に追従する', async ({ page }) => {
		await startAt(page, { x: SKEL_C - 3, y: SKEL_R });
		await stepN(page, 25);
		let s = await getSkeleton(page);
		expect(s.dir).toBe('left'); // プレイヤーが西側＝敵は西(left)を向く

		await startAt(page, { x: SKEL_C + 3, y: SKEL_R, dir: 'left' });
		await stepN(page, 25);
		s = await getSkeleton(page);
		expect(s.dir).toBe('right');

		await startAt(page, { x: SKEL_C, y: SKEL_R - 2, dir: 'down' });
		await stepN(page, 25);
		s = await getSkeleton(page);
		expect(s.dir).toBe('up');

		await startAt(page, { x: SKEL_C, y: SKEL_R + 2, dir: 'up' });
		await stepN(page, 25);
		s = await getSkeleton(page);
		expect(s.dir).toBe('down');
	});

	test('resolveEnemySprite: 向きに応じて skeletonD/R/U が解決される（L は R の flipX 代用）', async ({ page }) => {
		await startAt(page, { x: SKEL_C, y: SKEL_R - 2, dir: 'down' });
		await stepN(page, 25);
		const s = await getSkeleton(page);
		expect(s.dir).toBe('up');
		expect(s.sprite).toMatch(/^skeletonU/);
	});

	test('隣接して待つと剣攻撃（sword）が発火し、e._atkUntil が立ち skeleton*Atk になる', async ({ page }) => {
		await startAt(page, { x: SKEL_C - 1, y: SKEL_R, dir: 'right' });
		let sawAtk = false;
		let last = null;
		for (let i = 0; i < 40; i++) {
			await page.evaluate(() => window.__game.step(1));
			const s = await getSkeleton(page);
			last = s;
			if (s.sprite?.endsWith('Atk')) { sawAtk = true; break; }
		}
		expect(sawAtk, `40tick以内に攻撃ポーズが観測されるはず（最後の観測=${JSON.stringify(last)}）`).toBe(true);
		expect(last.atkUntil).not.toBeNull();
	});

	test('攻撃ポーズの窓が切れると通常スプライト（Atk/Guard 無し）に戻る', async ({ page }) => {
		await startAt(page, { x: SKEL_C - 1, y: SKEL_R, dir: 'right' });
		let sawAtk = false;
		for (let i = 0; i < 40 && !sawAtk; i++) {
			await page.evaluate(() => window.__game.step(1));
			const s = await getSkeleton(page);
			if (s.sprite?.endsWith('Atk')) sawAtk = true;
		}
		expect(sawAtk).toBe(true);
		// ATTACK_POSE_MS=180ms・TICK_MS=120ms ∴ 2tick進めれば窓は必ず切れる
		await stepN(page, 3);
		const s = await getSkeleton(page);
		expect(s.sprite?.endsWith('Atk')).toBe(false);
	});

	test('近接（範囲内・非攻撃時）は guard 窓が立ち skeleton*Guard になる', async ({ page }) => {
		// sword range=1.5・guardRange=range*1.6=2.4。範囲内だが即接触はしない距離に置く。
		await startAt(page, { x: SKEL_C - 2, y: SKEL_R, dir: 'right' });
		let sawGuardOrAtk = false;
		let last = null;
		for (let i = 0; i < 15; i++) {
			await page.evaluate(() => window.__game.step(1));
			const s = await getSkeleton(page);
			last = s;
			if (s.sprite?.endsWith('Guard') || s.sprite?.endsWith('Atk')) { sawGuardOrAtk = true; break; }
		}
		expect(sawGuardOrAtk, `構え/攻撃ポーズのどちらかが観測されるはず（最後=${JSON.stringify(last)}）`).toBe(true);
	});

	test('遠く離れている間は Atk も Guard も出ない（誤検出防止＝空虚テストでない裏取り）', async ({ page }) => {
		// skeleton は enemyChase で毎tick近づく（speed=0.5）ので、離れた直後の1tickだけを見る
		// （時間が経てば必ず隣接して guard/atk が立つ＝それ自体は他テストで確認済み）。
		await startAt(page, { x: SKEL_C - 4, y: SKEL_R, dir: 'right' });
		await stepN(page, 1);
		const s = await getSkeleton(page);
		expect(s.sprite?.endsWith('Atk')).toBe(false);
		expect(s.sprite?.endsWith('Guard')).toBe(false);
	});
});

// ── Phase 5.5k ガードの実効化（ユーザー指示 2026-08-10）─────────────
// 「ガードしてるなら防がなきゃダメ」＝見た目だけでなく実際にダメージを無効化する。
// 規則：ガード中は①移動しない②攻撃しない③向きをロック。ロックした向き＝正面からの
// 攻撃だけ無効化（盾ブロックと同じ音・エフェクト）。側面/背後は通常どおり通る。
// 崩し方＝ブーメランでスタン（動きを止める）→ガード解除→隣接して殴る。
test.describe('Phase 5.5k ② – ガードの実効化（skeleton）', () => {
	test('ガード圏内に入ると移動が止まる（x座標が変化しない）', async ({ page }) => {
		await startAt(page, { x: SKEL_C - 4, y: SKEL_R, dir: 'right' });
		const s = await advanceUntilGuarding(page);
		expect(s?.guarding, `ガードに入るはず（最後の観測=${JSON.stringify(s)}）`).toBe(true);
		const xBefore = s.x;
		await stepN(page, 10);
		const s2 = await getSkeleton(page);
		expect(s2.x).toBe(xBefore);
	});

	test('ガードがロックした正面方向からの剣攻撃は無効化される（hp不変・盾ブロック演出）', async ({ page }) => {
		await startAt(page, { x: SKEL_C - 4, y: SKEL_R, dir: 'right' });
		const s = await advanceUntilGuarding(page);
		expect(s?.guarding).toBe(true);
		const hpBefore = s.hp;
		// advanceUntilGuarding は skeleton だけ進める＝guardRange(=sword.range=1.5) で
		// 止まった時点のプレイヤー距離は SWORD_REACH(1.2) にまだ届かない。プレイヤーが
		// 1歩詰めて初めて「剣は届くがガードで無効化される」の検証になる（詰めないと
		// そもそも当たらず hp 不変になる＝ガードを潰しても緑になる空虚テストだった）。
		await page.evaluate(() => window.__game.movePlayer('right'));
		// プレイヤーは skeleton の西側にいる＝skeleton の guardDir は 'left'（西を向いてガード）。
		// heroDir='right' のまま剣を振る＝プレイヤーから見て東（skeletonへ向かう正面）を突く。
		await page.evaluate(() => window.__game.swordAttack());
		await stepN(page, 1);
		const s2 = await getSkeleton(page);
		expect(s2.hp, 'ガードの正面からの攻撃は無効化されるはず').toBe(hpBefore);
	});

	test('ブーメランでスタンさせるとガードが解除され、隣接して殴るとダメージが通る', async ({ page }) => {
		await startAt(page, { x: SKEL_C - 4, y: SKEL_R, dir: 'right', boomerang: true });
		const s = await advanceUntilGuarding(page);
		expect(s?.guarding).toBe(true);
		const hpBefore = s.hp;

		await page.evaluate(() => window.__game.useSubItem());
		await stepN(page, 3);
		const stunned = await getSkeleton(page);
		expect(stunned.stunUntil, 'ブーメラン命中でスタンが入るはず').not.toBeNull();
		expect(stunned.guarding, 'スタンでガードは解除されるはず').toBe(false);

		// スタン中に隣接（SWORD_REACH=1.2）まで歩き、剣で殴る
		await page.evaluate(() => window.__game.movePlayer('right'));
		await page.evaluate(() => window.__game.movePlayer('right'));
		await page.evaluate(() => window.__game.swordAttack());
		await stepN(page, 1);
		const after = await getSkeleton(page);
		expect(after.hp, 'スタン中はガードで守られないので通常どおりダメージが通る').toBeLessThan(hpBefore);
	});

	test('ガードがロックした方向と反対の側面/背後から殴ればガードを無視してダメージが通る（回り込みが意味を持つ）', async ({ page }) => {
		await startAt(page, { x: SKEL_C - 4, y: SKEL_R, dir: 'right' });
		const s = await advanceUntilGuarding(page);
		expect(s?.guarding).toBe(true);
		expect(s.guardDir, 'プレイヤーは西側から近づく＝ガードは west(left) 方向をロックするはず').toBe('left');
		const hpBefore = s.hp;

		// isPassable は「敵と同じタイルセルへは進入できない」（重なり防止）＝ガードで
		// 位置固定された skeleton の真横（同じ行/列）を直接すり抜けることはできない。
		// ∴ row2（内側の床）を経由して東側へ回り、南へ下りて背後（SWORD_REACH=1.2 の内側）
		// まで詰める。
		for (const d of ['up', 'up', 'right', 'right', 'right', 'right', 'right', 'down', 'down']) {
			await page.evaluate((dd) => window.__game.movePlayer(dd), d);
		}
		// 東側（skeleton の右）から西向きに突く＝ガードがロックしている 'left'（西向き
		// にガード＝西からの攻撃を防ぐ）とは逆の方向からの攻撃。
		await page.evaluate(() => window.__game.setHeroDir('left'));
		await page.evaluate(() => window.__game.swordAttack());
		await stepN(page, 1);
		const after = await getSkeleton(page);
		expect(after.hp, '側面/背後からの攻撃はガードで守られないはず').toBeLessThan(hpBefore);
	});
});
