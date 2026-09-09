// tests/obj-dot32-arrow-shield.spec.js — 矢・盾側面/背面の 32 ドット化／キュー10番 10d-4
//
// 何を守るテストか（tests/obj-dot32-items.spec.js と同型）：
//   ① 矢(arrow・飛翔中)／盾側面(shieldSide)／盾背面(shieldBack)は 8×8／4×8／8×5 の絵を
//      固定ピクセル箱（cellPx比の定数）に入れていた＝1ドットの粗さが揃わない。
//      ∴32×32 で描き直した（10d-3 積み残し・PLAN 10d-4）。
//   ② 絵は1つの連結成分・意図しない透明の穴が無い・四方に余白がある。
//   ③ 単一の真実：古いリテラルが残っていない（SPRITES は OBJ32 と同一物）。
//   ④ 「絵が floor 以外の固定ピクセル箱で使われる」＝矢は投擲物(cellPx*0.35 の正方形)、
//      盾側面/背面は装備オーバーレイ（idle/attack で計4つの箇所）。固定箱は dot32 の
//      自動補正が効かない∴新旧の ink 比の食い違いを打ち消す拡大係数（PROJ_SPRITE_SCALE／
//      SHIELD_SIDE_32_SCALE／SHIELD_BACK_32_SCALE）が実際に効いていることを実測する。

import { test, expect } from '@playwright/test';
import { SPRITES, PAL } from '../shared/sprites.js';
import { OBJ32_SPRITES } from '../shared/sprites-obj32.js';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const N = 32;

const KINDS = [
	{ spr: 'arrow',      pal: 'arrow', label: '矢(飛翔)' },
	{ spr: 'shieldSide', pal: 'shield', label: '盾(側面)' },
	{ spr: 'shieldBack', pal: 'shield', label: '盾(背面)' },
];

function inkBox(g) {
	let r0 = N, r1 = -1, c0 = N, c1 = -1;
	for (let r = 0; r < g.length; r++) {
		for (let c = 0; c < g[r].length; c++) {
			if (!g[r][c]) continue;
			if (r < r0) r0 = r;
			if (r > r1) r1 = r;
			if (c < c0) c0 = c;
			if (c > c1) c1 = c;
		}
	}
	return { r0, r1, c0, c1, w: c1 - c0 + 1, h: r1 - r0 + 1 };
}

function inkComponents(g) {
	const seen = g.map(row => row.map(() => false));
	let n = 0;
	for (let r = 0; r < N; r++) {
		for (let c = 0; c < N; c++) {
			if (!g[r][c] || seen[r][c]) continue;
			n++;
			const st = [[r, c]];
			seen[r][c] = true;
			while (st.length) {
				const [cr, cc] = st.pop();
				for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nr = cr + dr, nc = cc + dc;
					if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
					if (seen[nr][nc] || !g[nr][nc]) continue;
					seen[nr][nc] = true;
					st.push([nr, nc]);
				}
			}
		}
	}
	return n;
}

function transparentHoles(g) {
	const seen = g.map(row => row.map(() => false));
	const st = [];
	for (let i = 0; i < N; i++) {
		for (const [r, c] of [[0, i], [N - 1, i], [i, 0], [i, N - 1]]) {
			if (!g[r][c] && !seen[r][c]) { seen[r][c] = true; st.push([r, c]); }
		}
	}
	while (st.length) {
		const [cr, cc] = st.pop();
		for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nr = cr + dr, nc = cc + dc;
			if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
			if (seen[nr][nc] || g[nr][nc]) continue;
			seen[nr][nc] = true;
			st.push([nr, nc]);
		}
	}
	const holes = [];
	for (let r = 0; r < N; r++) {
		for (let c = 0; c < N; c++) if (!g[r][c] && !seen[r][c]) holes.push(`${r},${c}`);
	}
	return holes;
}

test.describe('矢・盾側面/背面 – 32 ドットの絵', () => {

	test('① 32×32 の格子・単一フレーム', () => {
		for (const { spr, label } of KINDS) {
			const fs = SPRITES[spr];
			expect(fs, `${label}（${spr}）の絵が無い`).toBeTruthy();
			expect(fs.length, `${label} のコマ数が1でない`).toBe(1);
			expect(fs[0].length, `${label} の行数が32でない`).toBe(N);
			for (const row of fs[0]) expect(row.length, `${label} の列数が32でない`).toBe(N);
		}
	});

	test('② ink は四方に透明の余白が残る', () => {
		for (const { spr, label } of KINDS) {
			const b = inkBox(SPRITES[spr][0]);
			expect(b.r0, `${label} の上に余白が無い`).toBeGreaterThan(0);
			expect(b.c0, `${label} の左に余白が無い`).toBeGreaterThan(0);
			expect(b.r1, `${label} の下に余白が無い`).toBeLessThan(N - 1);
			expect(b.c1, `${label} の右に余白が無い`).toBeLessThan(N - 1);
		}
	});

	test('③ 使う色番号はすべてパレットに定義済み', () => {
		for (const { spr, pal, label } of KINDS) {
			const p = PAL[pal];
			expect(p, `${label} のパレット ${pal} が無い`).toBeTruthy();
			const used = new Set();
			for (const row of SPRITES[spr][0]) for (const v of row) if (v) used.add(v);
			for (const v of used) {
				expect(p[v], `${label} が未定義の色番号 ${v} を使っている`).toBeTruthy();
			}
		}
	});

	test('④ 絵は1つの連結成分・内側に意図しない透明の穴が無い', () => {
		for (const { spr, label } of KINDS) {
			const g = SPRITES[spr][0];
			expect(inkComponents(g), `${label} の絵が分断されている（浮いた粒がある）`).toBe(1);
			expect(transparentHoles(g), `${label} の内側に透明の穴があり地面が透ける`).toEqual([]);
		}
	});

	test('⑤ 古いリテラルの絵が残っていない（単一の真実は OBJ32_SPRITES）', () => {
		for (const { spr, label } of KINDS) {
			expect(SPRITES[spr], `${label} の絵が別の場所のリテラルで上書きされている`).toBe(OBJ32_SPRITES[spr]);
		}
	});

});

test.describe('矢・盾側面/背面 – 2経路で1セットの拡大補正', () => {

	// arrow_switch ステージ（矢のパズル検証用）に弓装備で降り立ち、矢を放った瞬間の
	// canvas サイズを測る。矢は speed 4.5（1tick で約4.5セル）＝1step でも的（3セル先）
	// に届いて消えるので、生成直後（useSubItem 呼び出し直後・step する前）に測る
	// （tests/projectile.spec.js 条件1と同じ作法＝「使用直後：arrow が1つ存在する」）。
	test('⑥ 飛翔中の矢は無補正（新旧 ink 比の平均が約1.0・PROJ_SPRITE_SCALE 未登録で正しい）', async ({ page }) => {
		const p = new URLSearchParams({
			fromEditor: '1', layer: TEST_LAYER, stage: stageKey('arrow_switch'), row: '5', col: '9', ps_bow: '1',
		});
		await page.goto(`${GAME}?${p.toString()}`);
		await waitForBoard(page);
		const found = await page.evaluate(() => {
			window.__game.useSubItem();
			const cv = document.querySelector('[id^="proj-"] canvas.sprite');
			if (!cv) return null;
			const cs = getComputedStyle(cv);
			const anyCell = document.querySelector('#board .cell');
			return {
				cssW: parseFloat(cs.width),
				cellPx: anyCell ? anyCell.getBoundingClientRect().width : null,
			};
		});
		expect(found, '矢の投擲物 canvas が見つからない').toBeTruthy();
		expect(found.cssW / found.cellPx, '矢の飛翔中の大きさが cellPx*0.35（無補正）でない')
			.toBeCloseTo(0.35, 1);
	});

	// equip-visual-tiers.spec.js と同じ seed 作法（save data 直書き）で盾を装備し、
	// 向きごとの盾オーバーレイ canvas サイズを測る。
	async function seedShield(page, { heroDir = 'down', attacking = false } = {}) {
		const saveData = JSON.stringify({
			player: {
				x: 4, y: 5,
				hp: 6, maxHp: 6, maxHearts: 3,
				atk: 4, def: 0, keys: 0,
				weapon: 'sword', swordTier: 3,
				shield: 'shield', shieldTier: 2,
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
		await page.evaluate(() => { window.__game.pause(); window.__game.step(3); });
		if (attacking) await page.evaluate(() => window.__game.swordAttack());
	}

	const shieldOverlaySize = (page) => page.evaluate(() => {
		const cv = document.querySelector('#char-player canvas.shield-overlay');
		if (!cv) return null;
		const cs = getComputedStyle(cv);
		const anyCell = document.querySelector('#board .cell');
		return {
			spr: cv.dataset.shieldSpr,
			cssW: parseFloat(cs.width),
			cssH: parseFloat(cs.height),
			cellPx: anyCell ? anyCell.getBoundingClientRect().width : null,
		};
	});

	test('⑦ 盾側面（idle・右/左向き）は SHIELD_SIDE_32_SCALE 分だけ拡大済み', async ({ page }) => {
		for (const dir of ['right', 'left']) {
			await seedShield(page, { heroDir: dir });
			const s = await shieldOverlaySize(page);
			expect(s, `${dir} の待機で盾オーバーレイが無い`).toBeTruthy();
			expect(s.spr, `${dir} の待機の盾の面`).toBe('shieldSide');
			// SHIELD_SIDE_32_SCALE = 1.76
			expect(s.cssW / s.cellPx, `${dir} の盾側面の幅が補正係数どおりでない`).toBeCloseTo(0.17 * 1.76, 1);
			expect(s.cssH / s.cellPx, `${dir} の盾側面の高さが補正係数どおりでない`).toBeCloseTo(0.44 * 1.76, 1);
		}
	});

	test('⑧ 盾側面（attack・上/下向き）は SHIELD_SIDE_32_SCALE 分だけ拡大済み', async ({ page }) => {
		for (const dir of ['down', 'up']) {
			await seedShield(page, { heroDir: dir, attacking: true });
			const s = await shieldOverlaySize(page);
			expect(s, `${dir} の攻撃中に盾オーバーレイが無い`).toBeTruthy();
			expect(s.spr, `${dir} の攻撃中の盾の面`).toBe('shieldSide');
			expect(s.cssW / s.cellPx, `${dir} の攻撃中の盾側面の幅が補正係数どおりでない`).toBeCloseTo(0.17 * 1.76, 1);
			expect(s.cssH / s.cellPx, `${dir} の攻撃中の盾側面の高さが補正係数どおりでない`).toBeCloseTo(0.44 * 1.76, 1);
		}
	});

	test('⑨ 盾背面（attack・左向き）は SHIELD_BACK_32_SCALE 分だけ拡大済み', async ({ page }) => {
		await seedShield(page, { heroDir: 'left', attacking: true });
		const s = await shieldOverlaySize(page);
		expect(s, '左向きの攻撃中に盾オーバーレイが無い').toBeTruthy();
		expect(s.spr, '左向きの攻撃中の盾の面').toBe('shieldBack');
		// SHIELD_BACK_32_SCALE = 1.67
		expect(s.cssW / s.cellPx, '盾背面の幅が補正係数どおりでない').toBeCloseTo(0.34 * 1.67, 1);
		expect(s.cssH / s.cellPx, '盾背面の高さが補正係数どおりでない').toBeCloseTo(0.21 * 1.67, 1);
	});

	// shieldSide は10d-5で片凸（表面側だけ凸）に描き直した＝flipXは絵のピクセルに
	// 焼かれる（CSS transformでは検出できない・[[derive-geometry-per-direction]]）ため
	// canvasの不透明ピクセルの左右分布から凸側を判定する。
	test('⑩ 盾側面（attack・下/上向き）の凸は常に外側（キャラから離れる側）＝flipXで反転しない', async ({ page }) => {
		// down: 盾は画面左に配置＝外側=左。up: 盾は画面右に配置＝外側=右
		// （ユーザー実プレイ指摘＝「上向きと下向きで凹凸が逆」への回帰防止）。
		const cases = [
			{ dir: 'down', outerSide: 'left' },
			{ dir: 'up',   outerSide: 'right' },
		];
		for (const { dir, outerSide } of cases) {
			await seedShield(page, { heroDir: dir, attacking: true });
			const bias = await page.evaluate(() => {
				const cv = document.querySelector('#char-player canvas.shield-overlay');
				const ctx = cv.getContext('2d');
				const { width, height } = cv;
				const data = ctx.getImageData(0, 0, width, height).data;
				let left = 0, right = 0;
				for (let y = 0; y < height; y++) {
					for (let x = 0; x < width; x++) {
						if (!data[(y * width + x) * 4 + 3]) continue;
						if (x < width / 2) left++; else right++;
					}
				}
				return { left, right };
			});
			const heavierSide = bias.left > bias.right ? 'left' : 'right';
			expect(heavierSide, `${dir} 攻撃中の盾側面の凸が外側(${outerSide})にない（left=${bias.left} right=${bias.right}）`).toBe(outerSide);
		}
	});

});
