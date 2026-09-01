// 2026-08-31: ロウソクは「炎を置く道具」になった ── その機構の不変条件。
//
// ユーザー実プレイ報告＝「ロウソクの炎が連打できてしまうので比較的簡単になってしまっている」。
// ロウソクは消費なし・クールダウンなし・press-edge のみ∴指の速さだけが上限で、炎が弱点の
// 2×2 ボス（I 沼地の大蝦蟇＝当時 4ダメージ×24発）は数秒で溶けていた。
//
// 対処は「押せる回数を数字で縛る」のではなく**炎を場に残す**こと（constants.js の
// CANDLE_FLAME_MS / CANDLE_FLAME_MAX にその理由を書いた）。ここで守る性質は5つ：
//   F-① 1つの炎は 1体の敵に**1回だけ**ダメージを与える（連打しても増えない）
//   F-② 炎は寿命で消え、消えた跡には置き直せる（＝時間を払えばまた焼ける）
//   F-③ 同時に置けるのは CANDLE_FLAME_MAX 個まで（4つ目は置けない）
//   F-④ **後から炎に入った敵**も焼ける（置き炎が罠として働く＝機構の主目的）
//   F-⑤ 歩けない床（壁など）には置けない／かがり火は点灯であって置き炎にならない
//        ＝「かがり火や茂みを向いて連打する」抜け道が塞がっている
// 併せて、必要ヒット数（弱点倍率）が「連打なしで妥当な戦闘時間」に収まっているかを
// データから算術で押さえる（F-⑥）。
//
// ⚠️ 数の出どころはコードとデータだけ（`CANDLE_FIRE_DMG` / `CANDLE_FLAME_*` / `ENEMY_META`）。
//    期待値をテストに直書きしない＝倍率を調整したときにテストが自動で追随する。
import { test, expect } from '@playwright/test';
import { waitForBoard } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { CANDLE_FIRE_DMG, CANDLE_FLAME_MS, CANDLE_FLAME_MAX, TICK_MS } from '../game/constants.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

// 炎の機構は「敵のいない部屋＋止まっている敵」で測る＝候補は candle_gate（10×12・
// 外周が壁・かがり火 H が (2,3)/(2,7)/(5,5)）。敵は injectEnemy（type 'E'＝ENEMY_META に
// 無い＝AI が何もしない・speed 0）を置く∴step() を進めても敵は動かない。
function gateUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: TEST_LAYER, stage: stageKey('candle_gate'),
		row: String(row), col: String(col), ps_candle: '1', ps_weapon: '1',
	});
	return `${GAME}?${p.toString()}`;
}

// 実データのボスで測る用（I 沼地の大蝦蟇＝2×2・炎が弱点）。
function toadUrl(row, col) {
	const p = new URLSearchParams({
		fromEditor: '1', layer: TEST_LAYER, stage: stageKey('bal_swamp_toad'),
		row: String(row), col: String(col), ps_candle: '1', ps_weapon: '1', ps_sword: '0',
	});
	return `${GAME}?${p.toString()}`;
}

// 実時間ループを起動させない（ボスが動くと「どのタイルが燃えているか」が測れない）。
// candle.spec.js と同じ作法。step() は手で進める＝論理時間で決定論的に測れる。
const frozen = new WeakSet();
async function gotoFrozen(page, url) {
	if (!frozen.has(page)) {
		await page.addInitScript(() => {
			const native = window.setInterval;
			window.__loopBlocked = 0;
			window.setInterval = function (fn, ms, ...rest) {
				if (/step\s*\(\s*1\s*\)/.test(String(fn))) { window.__loopBlocked++; return 0; }
				return native.call(window, fn, ms, ...rest);
			};
		});
		frozen.add(page);
	}
	await page.goto(url);
	await waitForBoard(page);
	expect(await page.evaluate(() => window.__loopBlocked),
		'実時間ループの差し込み阻止が効いていない（game.js startGameLoop の形が変わった？）')
		.toBeGreaterThan(0);
}

async function step(page, n) {
	await page.evaluate((k) => { for (let i = 0; i < k; i++) window.__game.step(1); }, n);
}
async function flames(page) {
	return await page.evaluate(() => window.__game.getPlacedFlames());
}
// 位置を動かさず向きだけ変えてロウソクを使う（何回でも）。
async function candle(page, dir, times = 1) {
	await page.evaluate(([d, n]) => {
		window.__game.setHeroDir(d);
		for (let i = 0; i < n; i++) window.__game.useSubItem();
	}, [dir, times]);
}
async function teleport(page, row, col) {
	await page.evaluate(([r, c]) => {
		const p = window.__game.getPlayer();
		p.x = c; p.y = r;
	}, [row, col]);
}
async function injectAt(page, row, col, hp) {
	return await page.evaluate(([r, c, h]) => window.__game.injectEnemy(c, r, h), [row, col, hp]);
}
async function hpOf(page, id) {
	return await page.evaluate((i) => window.__game.getEnemies().find(x => x.id === i)?.hp ?? -1, id);
}

// 弱点でない敵（type 'E'・def 0）が1回の炎で失う HP。
const PLAIN_LOSS = Math.max(1, CANDLE_FIRE_DMG);
// 炎の寿命を跨ぐのに必要な tick 数（+1 で必ず超える）。
const LIFE_TICKS = Math.ceil(CANDLE_FLAME_MS / TICK_MS) + 1;

test.describe('Blade of Lumia – 置いた炎（ロウソク）', () => {
	test('F-① 1つの炎は同じ敵を1回だけ焼く（連打しても炎は増えず被害も増えない）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await gotoFrozen(page, gateUrl(7, 5));
		const HP = 100;
		const id = await injectAt(page, 6, 5, HP);   // 上を向いた先 (6,5) に置く

		await candle(page, 'up', 10);               // 10連打
		expect(await flames(page), '連打で炎が増えている＝同じタイルに重ねて置けてしまう')
			.toHaveLength(1);
		expect(await hpOf(page, id), '連打の回数だけダメージが入っている＝連打の穴が残っている')
			.toBe(HP - PLAIN_LOSS);

		// 燃えている間ずっと重なっていても2回目は入らない（寿命の手前まで進める）。
		await step(page, LIFE_TICKS - 2);
		expect(await hpOf(page, id), '同じ炎が燃え続けるだけでダメージが積み増しされている')
			.toBe(HP - PLAIN_LOSS);
		expect((await flames(page))[0]?.burnedCount, '「その炎が焼いた敵の数」が1でない').toBe(1);
		expect(errors).toEqual([]);
	});

	test('F-② 炎は寿命で消え、消えた跡には置き直せる（時間を払えばまた焼ける）', async ({ page }) => {
		await gotoFrozen(page, gateUrl(7, 5));
		const HP = 100;
		const id = await injectAt(page, 6, 5, HP);

		await candle(page, 'up');
		expect(await hpOf(page, id)).toBe(HP - PLAIN_LOSS);
		await step(page, LIFE_TICKS);
		expect(await flames(page), '寿命を過ぎても炎が残っている').toHaveLength(0);

		await candle(page, 'up');                    // 置き直し＝新しい炎∴また1回入る
		expect(await flames(page)).toHaveLength(1);
		expect(await hpOf(page, id), '置き直した炎で焼けていない').toBe(HP - PLAIN_LOSS * 2);
	});

	test(`F-③ 同時に置けるのは ${CANDLE_FLAME_MAX} つまで（4方向へ置くと最後は置けない）`, async ({ page }) => {
		await gotoFrozen(page, gateUrl(7, 5));
		// (7,5) の四方 (6,5)/(7,4)/(8,5)/(7,6) はすべて床＝上限だけが効く状況を作る。
		const dirs = ['up', 'left', 'down', 'right'];
		const counts = [];
		for (const d of dirs) {
			await candle(page, d);
			counts.push((await flames(page)).length);
		}
		expect(counts, `${CANDLE_FLAME_MAX} つで止まっていない（上限が効いていない）`)
			.toEqual([1, 2, CANDLE_FLAME_MAX, CANDLE_FLAME_MAX]);
	});

	test('F-④ 後から炎に入った敵も焼ける（置き炎が罠として働く）', async ({ page }) => {
		await gotoFrozen(page, gateUrl(7, 5));
		await candle(page, 'up');                    // 誰も居ない (6,5) に置く
		expect((await flames(page))[0]).toMatchObject({ r: 6, c: 5, burnedCount: 0 });

		const HP = 100;
		const id = await injectAt(page, 6, 5, HP);   // 後から炎の上に来た敵
		expect(await hpOf(page, id), '置いた時点で未来の敵まで焼けている').toBe(HP);
		await step(page, 1);
		expect(await hpOf(page, id), '炎に入った敵が焼けていない＝罠として働いていない')
			.toBe(HP - PLAIN_LOSS);
		expect((await flames(page))[0]?.burnedCount).toBe(1);
	});

	test('F-⑤ 壁には置けず、かがり火は点灯であって置き炎にならない（連打の抜け道が無い）', async ({ page }) => {
		await gotoFrozen(page, gateUrl(1, 1));
		// (1,1) の上 (0,1) は外周の壁。
		await candle(page, 'up', 3);
		expect(await flames(page), '歩けない床（壁）に炎を置けている').toHaveLength(0);

		// かがり火 H(2,3) を (1,3) から下向きに焼く＝点灯するが炎は置かれない。
		await teleport(page, 1, 3);
		await candle(page, 'down', 5);
		expect(await flames(page), 'かがり火を向いて連打すると炎が置ける＝上限を無視できる抜け道')
			.toHaveLength(0);
		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(ss.litTorches, 'かがり火が点かなくなっている（既存ギミックの回帰）').toContain('2,3');
	});

	// ── 実データのボスで測る（I 沼地の大蝦蟇・2×2・炎が弱点）────────────────────
	const TOAD = 'I';
	const tm = ENEMY_META[TOAD];
	const TOAD_LOSS = Math.max(1, Math.round(CANDLE_FIRE_DMG * (tm.weakness?.multiplier ?? 1)) - tm.def);
	const TOAD_HITS = Math.ceil(tm.hp / TOAD_LOSS);

	test('F-⑥ 沼地の大蝦蟇に連打しても1回しか入らない（旧＝押した回数だけ入った）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await gotoFrozen(page, toadUrl(4, 6));
		const before = await page.evaluate((t) =>
			window.__game.getEnemies().find(x => x.type === t)?.hp ?? -1, TOAD);
		expect(before, `${TEST_LAYER} ${stageKey('bal_swamp_toad')} に ${TOAD} が居ない`).toBe(tm.hp);

		// (4,6) の右 (4,7) は蝦蟇の左上タイル＝置いた瞬間に1回焼ける。
		await candle(page, 'right', 12);
		const after = await page.evaluate((t) =>
			window.__game.getEnemies().find(x => x.type === t)?.hp ?? -1, TOAD);
		expect(before - after, '12連打で1回ぶんを超えるダメージが入っている').toBe(TOAD_LOSS);
		expect(await flames(page)).toHaveLength(1);
		expect(errors).toEqual([]);
	});

	test('F-⑦ 弱点倍率は「連打なしで妥当な戦闘時間」に収まっている（データの算術）', () => {
		// 炎で倒すのに必要なヒット数。1サイクル（炎を上限まで置いて燃え尽きるまで）で
		// 最大 CANDLE_FLAME_MAX 回入る∴必要サイクル数 = ceil(hits / MAX)。
		const cycles = Math.ceil(TOAD_HITS / CANDLE_FLAME_MAX);
		const seconds = (cycles * CANDLE_FLAME_MS) / 1000;
		// 上限＝炎だけで押し切って15秒以内。これは「連打が効かなくなった代わりに1発を重く
		// する」という 2026-08-31 の決定そのもの＝倍率を元（×2＝24発＝28秒）へ戻すと落ちる。
		expect(seconds, `炎だけで ${TOAD_HITS} 発＝約 ${seconds} 秒かかる＝1発が軽すぎる（倍率を上げる）`)
			.toBeLessThanOrEqual(15);
		// 下限＝1サイクル（＝置いた炎3つ）で終わらないこと（終わるなら連打時代と同じ手軽さ）。
		expect(TOAD_HITS, '炎3発以下で倒せる＝弱点が強すぎる').toBeGreaterThan(CANDLE_FLAME_MAX);
	});
});
