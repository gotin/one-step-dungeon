// Phase 4-3: ロウソク（キャンドル）のスモークテスト
//
// デモ配置（work/blade-of-lumia.json）：
//   field 6,13 … (6,10) に茂み 'u'。(6,11) に bushBurned で gate された
//                隠し入口 '>'（destId='hidden_cave'）。
//   ❌ 失効（2026-08-20・9,9 declutter）＝旧デモ配置は field 9,9 の (4,7)茂み
//   → (4,8)隠し入口（destId='secret_grotto'）だったが、ユーザー指摘「洞窟の
//   入口をここに集結させすぎ」でテスト用に作った茂み焼き系入口ごと削除した
//   （`scripts/migrate-field-9-9-declutter.mjs`）。9,9 に残る笛reveal系入口
//   (5,3) はロア「空中の遺跡」の本編要素∴bushBurned の検証には使わない。
//   今どうすべきか＝同じ機構の別の実データ（field 6,13）に向け直した。
//
// 検証：
//  1) ps_candle=1 でロウソクを所持してプレビューを開始できる
//  2) 隠し入口は茂みを燃やすまで遷移しない（踏んでも別ステージへ行かない）
//  3) ロウソクで前方の茂みを燃やすと隠し入口が出現し、踏むと hidden_cave へ遷移する
//  4) 前方に茂みがなければ何も出現しない（bushBurned が立たない）
//  5) 茂みの上の敵は「茂みを燃やす」では無傷・燃え跡に置いた炎で焼ける（2026-08-31）
//  6) 炎が弱点の敵（氷のリヴァイアサン L）は倍率ダメージを受ける（Phase 4-3b）
//  7) 2×2 の敵は占有する4タイルの**どれを向いても**炎が通る（2026-08-30 の修正・下記）
//  8) 占有していないタイルを向いたら当たらない（当たり箱を広げすぎていないことの裏取り）
//
// ── 2026-08-30 の修正（ユーザーの実プレイ報告「きつい・どう倒すのこれ」から出た）─────────
// `game/game.js playCandle` の敵判定は `toTileRow(e.y) === tr && toTileCol(e.x) === tc`＝
// 敵の座標（占有範囲の**左上**）とタイルの完全一致だった∴**2×2 の敵は左上タイルを向いた
// ときだけ**炎が通り、他の3タイルを向くと無音・無表示の 0 ダメージだった。
// 炎が弱点の敵は O 古森の巨人・L 氷のリヴァイアサン・I 沼地の大蝦蟇＝**3体とも 2×2**＝
// 弱点が向き次第で死んでいた（剣は hitbox.js 経由で4方向とも当たる＝弱点だけが不利）。
// 判定を `enemyOccupiesTile()`（hitbox.js）に寄せた＝占有範囲で見る。
//
// ── 2026-08-31 の変更（ユーザー実プレイ報告「炎が連打できてしまう」から出た）─────────
// ロウソクは「押した瞬間に前方を殴る道具」から**炎を置く道具**になった。1つの炎は1体の敵に
// 1回だけ・同時3つまで・寿命 CANDLE_FLAME_MS。∴このファイルの「炎が当たる」系テストは
// すべて**置いた炎の初回判定**を見ている（置いた瞬間に重なっている敵へ1回）。
// 機構そのもの（上限・寿命・後から踏んだ敵・連打の上限）は `tests/candle-flame.spec.js`。
import { test, expect } from '@playwright/test';
import { waitForBoard, SAVE_KEY } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import { CANDLE_FIRE_DMG } from '../game/constants.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';

function previewUrl({ layer = 'field', stage = '9,9', row, col, candle = true }) {
	const p = new URLSearchParams({
		fromEditor: '1', layer, stage,
		row: String(row), col: String(col),
	});
	if (candle) p.set('ps_candle', '1');
	return `${GAME}?${p.toString()}`;
}

async function walk(page, dir, n) {
	for (let i = 0; i < n; i++) {
		await page.evaluate(d => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
}

test.describe('Blade of Lumia – ロウソク', () => {
	test('ps_candle=1 でロウソクを所持しアクティブになる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ stage: '6,13', row: 6, col: 9, candle: true }));
		await waitForBoard(page);

		const st = await page.evaluate(() => window.__game.getState());
		expect(st.player.hasCandle).toBe(true);
		expect(st.player.activeSubItem).toBe('candle');
		expect(errors).toEqual([]);
	});

	test('隠し入口は茂みを燃やすまで遷移しない', async ({ page }) => {
		// (6,9) スポーン → 右へ歩く。隠し入口 (6,11) はまだ出ていない（茂み (6,10) が塞ぐ）
		// ので別ステージへ行かない。
		await page.goto(previewUrl({ stage: '6,13', row: 6, col: 9, candle: true }));
		await waitForBoard(page);

		await walk(page, 'right', 6);
		await page.waitForTimeout(300);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('field');
		expect(st.stageKey).toBe('6,13');
	});

	test('ロウソクで茂みを燃やすと隠し入口が出現し hidden_cave へ入れる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(previewUrl({ stage: '6,13', row: 6, col: 9, candle: true }));
		await waitForBoard(page);

		// 右を向く（壁/茂みで動けなくても heroDir は右になる）
		await page.evaluate(() => window.__game.movePlayer('right'));
		await page.evaluate(() => window.__game.step(1));
		// 前方 (6,10) の茂みを燃やす → bushBurned → (6,11) の隠し入口が出現
		await page.evaluate(() => window.__game.useSubItem());
		await page.evaluate(() => window.__game.step(1));

		// 燃えた茂み (6,10) を通り、隠し入口 (6,11) に乗る
		await walk(page, 'right', 4);
		await page.waitForFunction(() => {
			const s = window.__game.getState();
			return s.currentLayer === 'hidden_cave';
		}, { timeout: 3000 });

		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('hidden_cave');
		expect(errors).toEqual([]);
	});

	test('前方に茂みがなければ隠し入口は出現しない', async ({ page }) => {
		// (6,9) で下を向いて使う（前方 (7,9) は床）→ bushBurned は立たない。
		await page.goto(previewUrl({ stage: '6,13', row: 6, col: 9, candle: true }));
		await waitForBoard(page);

		await page.evaluate(() => window.__game.movePlayer('down'));
		await page.evaluate(() => window.__game.step(1));
		// 元の位置 (6,9) に戻る（隠し入口の判定を素直にするため上に戻す）
		await page.evaluate(() => window.__game.movePlayer('up'));
		await page.evaluate(() => window.__game.step(1));
		await page.evaluate(() => window.__game.useSubItem());
		await page.evaluate(() => window.__game.step(1));

		// 隠し入口 (6,11) は出ていないので、右へ歩いても遷移しない
		await walk(page, 'right', 6);
		await page.waitForTimeout(300);
		const st = await page.evaluate(() => window.__game.getState());
		expect(st.currentLayer).toBe('field');
		expect(st.stageKey).toBe('6,13');
	});

	// ⚠️ 2026-08-31 に意味が変わったテスト。前方の敵は「ロウソクを使った瞬間に殴られる」の
	// ではなく**置いた炎に焼かれる**（`game/game.js placeFlameAhead` → projectile.js）。
	// ここで向く (4,7) は**茂み 'u'**（field 9,9 の実データ）∴1回目は茂みが燃えるだけで
	// 敵は無傷になる＝「かがり火/茂みを向いて連打すれば上限を無視して殴れる」穴を
	// 塞いだことの裏取り（ユーザー報告「ロウソクの炎が連打できてしまう」への対処）。
	// 燃え尽きた茂みは床と同じ扱い∴2回目で炎が置けて敵が焼ける。
	test('茂みの上の敵は茂みを燃やすだけでは無傷・燃えた跡に置いた炎で焼ける', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		// (4,6) スポーン・右向き → 右移動で player.x=6.5 → 前方 tc = toTileCol(6.5+1) = toTileCol(7.5) = 7
		// 敵を (x=7, y=4) に注入 → toTileCol(7)=7, toTileRow(4)=4 で一致
		await page.goto(previewUrl({ row: 4, col: 6, candle: true }));
		await waitForBoard(page);

		await page.evaluate(() => window.__game.step(2)); // クールダウン対策
		const result = await page.evaluate(() => {
			const HP = 30;
			// 右を向く・移動（(4,6) → 動けない場合も heroDir='right' になる）
			window.__game.movePlayer('right');
			window.__game.step(1);
			// player.x は 6 か 6.5。前方 tc は toTileCol(player.x + 1)。
			// player.x=6.5 → toTileCol(7.5)=7。player.x=6 → toTileCol(7)=7。
			// どちらも tc=7 なので敵を (x=7, y=4) に注入する。
			const id = window.__game.injectEnemy(7, 4, HP);
			const hpOf = () => (window.__game.getEnemies().find(x => x.id === id)?.hp ?? -1);
			window.__game.useSubItem();   // 1回目＝前方の茂みが燃える（敵は焼けない）
			window.__game.step(1);
			const hpAfterBush = hpOf();
			const flamesAfterBush = window.__game.getPlacedFlames().length;
			window.__game.useSubItem();   // 2回目＝燃え跡に炎を置く（重なっている敵へ1回）
			window.__game.step(1);
			return {
				hpBefore: HP, hpAfterBush, hpAfterFlame: hpOf(),
				flamesAfterBush, flamesAfterFlame: window.__game.getPlacedFlames().length,
			};
		});
		expect(result.hpAfterBush, '茂みを燃やしただけで敵が焼けている＝連打の穴が残っている')
			.toBe(result.hpBefore);
		expect(result.flamesAfterBush, '茂みを燃やしたときに炎まで置いている').toBe(0);
		expect(result.hpAfterFlame, '置いた炎が重なっている敵を焼いていない').toBeLessThan(result.hpBefore);
		expect(result.flamesAfterFlame).toBe(1);
		expect(errors).toEqual([]);
	});

	test('炎が弱点の敵（氷のリヴァイアサン L）は倍率ダメージを受ける', async ({ page }) => {
		// weakness.spec.js と同じ injectEnemy + dealDamage パターンで
		// fire(×3) vs sword(×1) のダメージ差を確認する。
		const saveData = JSON.stringify({
			player: {
				x: 2, y: 5,
				hp: 6, maxHp: 6, maxHearts: 3,
				atk: 2, def: 0, keys: 0,
				weapon: 'sword', shield: null, armor: null,
				subItems: {}, activeSubItem: null,
				rupees: 0, triforceCount: 0,
			},
			stageState: {},
			currentLayer: 'field',
			stageKey: '7,14',
			heroDir: 'right',
		});
		await page.addInitScript(({ key, value }) => {
			try { localStorage.setItem(key, value); } catch { /* noop */ }
		}, { key: SAVE_KEY, value: saveData });
		await page.goto('/blade-of-lumia/game/');
		await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
		await page.locator('#btn-continue').click();
		await page.waitForFunction(() => {
			const b = document.getElementById('board');
			return !!b && b.children.length > 0;
		});

		const losses = await page.evaluate(() => {
			const HP = 200;
			const swordId = window.__game.injectEnemy(8, 8, HP, 2, 2, 'L');
			window.__game.dealDamage(swordId, 10, 'sword');
			const eSword = window.__game.getEnemies().find(x => x.id === swordId);
			const swordLoss = HP - (eSword ? eSword.hp : 0);

			const fireId = window.__game.injectEnemy(8, 8, HP, 2, 2, 'L');
			window.__game.dealDamage(fireId, 10, 'fire');
			const eFire = window.__game.getEnemies().find(x => x.id === fireId);
			const fireLoss = HP - (eFire ? eFire.hp : 0);

			return { swordLoss, fireLoss };
		});
		// 氷のリヴァイアサンは fire が弱点(×3)。sword(×1) の3倍ダメージ
		expect(losses.fireLoss).toBe(losses.swordLoss * 3);
	});

	// ── 2×2 の敵に炎が当たる向き（2026-08-30 の修正）────────────────────────────
	// 実配置で測る＝`bal_forest_giant`（`test_mechanics 28,1`）に居る O 古森の巨人。
	// 注入敵ではなく出荷データの敵を使う（size/def/weakness をテスト側で作らない）。
	const GIANT = 'O';
	const gm = ENEMY_META[GIANT];
	// 弱点が乗ったときの1回の減り＝`dealDamageToEnemy` と同じ式（丸め→防御を引く→最低1）。
	const FIRE_LOSS = Math.max(1, Math.round(CANDLE_FIRE_DMG * (gm.weakness?.multiplier ?? 1)) - gm.def);

	// 実時間ループを起動させない（ボスが動くと「どのタイルを向いたか」が測れない）。
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

	function giantUrl(row, col) {
		const p = new URLSearchParams({
			fromEditor: '1', layer: TEST_LAYER, stage: stageKey('bal_forest_giant'),
			row: String(row), col: String(col), ps_candle: '1', ps_weapon: '1', ps_sword: '0',
		});
		return `${GAME}?${p.toString()}`;
	}

	// 巨人の左上タイルを読む（湧きは盤面データが決める∴座標を書かない）。
	async function giantTopLeft(page) {
		return await page.evaluate((t) => {
			const e = window.__game.getEnemies().find(x => x.type === t);
			return e ? { r: Math.floor(e.y + 0.5), c: Math.floor(e.x + 0.5), hp: e.hp } : null;
		}, GIANT);
	}

	// (row,col) に立って dir を向いてロウソクを使い、巨人の HP の減りを返す。
	async function candleAt(page, row, col, dir) {
		await gotoFrozen(page, giantUrl(row, col));
		const pos = await page.evaluate(() => {
			const p = window.__game.getPlayer();
			return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5), item: p.activeSubItem };
		});
		expect(pos, `(${row},${col}) に立てていない＝湧き位置が塞がれている`).toEqual({ r: row, c: col, item: 'candle' });
		const before = await giantTopLeft(page);
		await page.evaluate((d) => { window.__game.setHeroDir(d); window.__game.useSubItem(); }, dir);
		const after = await giantTopLeft(page);
		return { loss: before.hp - after.hp, giant: before };
	}

	test('2×2 の敵は占有する4タイルのどれを向いても炎が当たる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		// 巨人の左上タイルを実データから読み、そこから「占有4タイル × 4方向」の立ち位置を作る。
		await gotoFrozen(page, giantUrl(4, 4));
		const g = await giantTopLeft(page);
		expect(g, `${TEST_LAYER} ${stageKey('bal_forest_giant')} に ${GIANT} が居ない`).not.toBeNull();
		expect({ w: gm.size?.w, h: gm.size?.h }, '前提＝2×2 の敵で測る').toEqual({ w: 2, h: 2 });

		// 4タイルを別々の向きから焼く＝「左上以外でも通る」と「向きに依らない」を同時に見る。
		const cases = [
			{ tile: '左上', row: g.r,     col: g.c - 1, dir: 'right' },
			{ tile: '右上', row: g.r - 1, col: g.c + 1, dir: 'down'  },
			{ tile: '右下', row: g.r + 1, col: g.c + 2, dir: 'left'  },
			{ tile: '左下', row: g.r + 2, col: g.c,     dir: 'up'    },
		];
		for (const c of cases) {
			const { loss } = await candleAt(page, c.row, c.col, c.dir);
			expect(loss, `${c.tile}タイルを ${c.dir} から焼いて通っていない`
				+ '（占有範囲でなく左上タイルだけ見ている？）').toBe(FIRE_LOSS);
		}
		expect(errors).toEqual([]);
	});

	test('占有していないタイルを向いたら炎は当たらない', async ({ page }) => {
		await gotoFrozen(page, giantUrl(4, 4));
		const g = await giantTopLeft(page);
		// 巨人の左上タイルの1つ外側（斜めに隣接する床）を向く＝占有範囲の外。
		const { loss } = await candleAt(page, g.r - 1, g.c - 1, 'down');
		expect(loss, '占有していないタイルでも当たっている＝当たり箱を広げすぎている').toBe(0);
	});
});
