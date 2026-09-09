// tests/ui-icons.spec.js — UI の絵文字を自前スプライトに置き換えた（キュー10番 10e）
//
// 何を守るテストか：
//   ① `{{key}}` マーカーは必ず `shared/ui-icons.js UI_ICON` に在る
//      （コード・マップデータの両方。書き間違えると画面に `{{sword}}` と literal が出る）。
//   ② UI_ICON の全エントリは SPRITES / PAL に実在する（絵の無いキーを表に置かない）。
//   ③ `pulse()` に渡す文と、マップデータの本文（message / npcData.lines）には
//      「絵がある物の絵文字」を書かない＝絵文字が復活したら赤になる。
//      静的 HTML の絵文字は `data-icon` を持つ要素の中（＝絵に差し替わる保険）だけ許す。
//   ④ 実描画：HUD・ポーズ画面・モバイルボタンに実際に <canvas> が出ている
//      （表が合っていても mountIconEls / updateHud を呼び忘れたら絵文字のまま∴目で見る）。
//
// ⚠️ 絵が無い物の絵文字は残す（⏸ PAUSED・🏪 みせ・📦 入れ物・🎨 パレット等）。
//    ∴③の許可リストは「絵が無い／その物ではない」理由付きで持つ。

import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { UI_ICON, EMOJI_TO_ICON } from '../shared/ui-icons.js';
import { SPRITES, PAL } from '../shared/sprites.js';
import { gotoFreshGame } from './helpers.js';

const ROOT = new URL('../', import.meta.url);
const MAP_JSON = readFileSync(new URL('work/blade-of-lumia.json', ROOT), 'utf8');
const MAP = JSON.parse(MAP_JSON);

function readDirFiles(dir, exts) {
	const base = new URL(`${dir}/`, ROOT);
	return readdirSync(base)
		.filter((f) => exts.some((e) => f.endsWith(e)))
		.map((f) => ({ path: `${dir}/${f}`, text: readFileSync(new URL(f, base), 'utf8') }));
}

const CODE_FILES = [
	...readDirFiles('game', ['.js']),
	...readDirFiles('editor', ['.js']),
	...readDirFiles('shared', ['.js']),
];

/** マップデータの「プレイヤーに見える本文」を全部集める（message / npcData.lines）。 */
function mapTexts() {
	const out = [];
	for (const [ln, ld] of Object.entries(MAP.layers ?? {})) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			const at = `${ln}/${sk}`;
			for (const [k, c] of Object.entries(sd.showConditions ?? {})) {
				if (typeof c?.message === 'string') out.push({ at: `${at} showConditions[${k}]`, text: c.message });
			}
			if (typeof sd.fluteEffect?.message === 'string') out.push({ at: `${at} fluteEffect`, text: sd.fluteEffect.message });
			for (const [k, nd] of Object.entries(sd.npcData ?? {})) {
				if (Array.isArray(nd?.lines)) {
					nd.lines.forEach((l, i) => { if (typeof l === 'string') out.push({ at: `${at} npcData[${k}].lines[${i}]`, text: l }); });
				}
			}
			for (const [k, sg] of Object.entries(sd.signData ?? {})) {
				const lines = Array.isArray(sg) ? sg : (Array.isArray(sg?.lines) ? sg.lines : []);
				lines.forEach((l, i) => { if (typeof l === 'string') out.push({ at: `${at} signData[${k}][${i}]`, text: l }); });
			}
		}
	}
	return out;
}

test.describe('10e: UI アイコンの単一の真実', () => {
	test('① `{{key}}` マーカーは全て UI_ICON に在る（コード・マップデータ）', () => {
		const bad = [];
		for (const { path, text } of CODE_FILES) {
			for (const m of text.matchAll(/\{\{([a-zA-Z]+)\}\}/g)) {
				if (!UI_ICON[m[1]]) bad.push(`${path}: {{${m[1]}}}`);
			}
		}
		for (const { at, text } of mapTexts()) {
			for (const m of text.matchAll(/\{\{([a-zA-Z]+)\}\}/g)) {
				if (!UI_ICON[m[1]]) bad.push(`${at}: {{${m[1]}}}`);
			}
		}
		expect(bad, `UI_ICON に無いマーカー:\n${bad.join('\n')}`).toEqual([]);
		// マーカーが実際に使われていること自体も数える（0 件なら移行が消えている）
		const used = mapTexts().filter(({ text }) => /\{\{[a-zA-Z]+\}\}/.test(text)).length;
		expect(used).toBeGreaterThanOrEqual(70);
	});

	test('② UI_ICON の全エントリは SPRITES / PAL に実在する', () => {
		const bad = [];
		for (const [key, it] of Object.entries(UI_ICON)) {
			if (!SPRITES[it.spr]) bad.push(`${key}: SPRITES['${it.spr}'] が無い`);
			else if (!Array.isArray(SPRITES[it.spr][0])) bad.push(`${key}: SPRITES['${it.spr}'] にフレームが無い`);
			if (!PAL[it.pal]) bad.push(`${key}: PAL['${it.pal}'] が無い`);
		}
		expect(bad, `絵が引けない UI_ICON:\n${bad.join('\n')}`).toEqual([]);
		// EMOJI_TO_ICON の行き先も同じく実在すること（機械置換の行き先が壊れていない）
		for (const [emoji, key] of Object.entries(EMOJI_TO_ICON)) {
			expect(UI_ICON[key], `${emoji} → ${key} が UI_ICON に無い`).toBeTruthy();
		}
	});

	test('③ pulse() の文とマップデータの本文に「絵がある物の絵文字」が残っていない', () => {
		const emojis = Object.keys(EMOJI_TO_ICON);
		const bad = [];
		// pulse(...) / pulse?.(...) を含む行に絵文字があれば赤（＝メッセージバーに絵文字が出る）
		for (const { path, text } of CODE_FILES) {
			text.split('\n').forEach((line, i) => {
				if (!/pulse\??\.?\(/.test(line)) return;
				for (const e of emojis) if (line.includes(e)) bad.push(`${path}:${i + 1}: ${e} … ${line.trim()}`);
			});
		}
		for (const { at, text } of mapTexts()) {
			for (const e of emojis) if (text.includes(e)) bad.push(`${at}: ${e} … ${text}`);
		}
		expect(bad, `絵があるのに絵文字のまま:\n${bad.join('\n')}`).toEqual([]);
	});

	test('③-2 静的 HTML の絵文字は data-icon の中だけ（絵が無い物は許可リスト）', () => {
		// 絵が無い or その物ではない＝置き換えない絵文字。
		//   🗺 タイル／タイルバリエーション … ダンジョン地図の絵ではなく「タイル」の飾り
		const ALLOW = ['🗺 タイル', '🗺 タイルバリエーション'];
		const emojis = Object.keys(EMOJI_TO_ICON);
		const bad = [];
		for (const page of ['game/index.html', 'editor/index.html']) {
			let text = readFileSync(new URL(page, ROOT), 'utf8');
			// data-icon を持つ要素の中身（＝絵に差し替わる保険の絵文字）を取り除いてから数える
			text = text.replace(/<span[^>]*\bdata-icon=[^>]*>[^<]*<\/span>/g, '')
				.replace(/<button[^>]*\bdata-icon=[^>]*>[^<]*<\/button>/g, '');
			for (const a of ALLOW) text = text.split(a).join('');
			text.split('\n').forEach((line, i) => {
				for (const e of emojis) if (line.includes(e)) bad.push(`${page}:${i + 1}: ${e} … ${line.trim()}`);
			});
		}
		expect(bad, `data-icon の外に絵文字が残っている:\n${bad.join('\n')}`).toEqual([]);
	});

	test('④ 実描画：HUD・モバイルボタン・ポーズ画面に絵（canvas）が出る', async ({ page }) => {
		await gotoFreshGame(page);
		// HUD：装備3枠・財布（ルピー／星の欠片）
		for (const id of ['hud-equip-sword', 'hud-equip-shield', 'hud-equip-armor']) {
			await expect(page.locator(`#${id} canvas`), `#${id} に絵が無い`).toHaveCount(1);
			await expect(page.locator(`#${id}`)).not.toContainText(/[⚔🛡⚚]/);
		}
		expect(await page.locator('#hud-wallet canvas').count()).toBe(2);
		expect(await page.locator('#hud-hearts canvas').count()).toBeGreaterThan(0);
		// モバイルボタン（剣・盾）
		for (const id of ['btn-sword', 'btn-shield']) {
			await expect(page.locator(`#${id} canvas`), `#${id} に絵が無い`).toHaveCount(1);
		}
		// ポーズ画面：持ち物とステータス行（ハート・ルピー・装備）
		await page.keyboard.press('Escape');
		await expect(page.locator('#pause-overlay')).toBeVisible();
		expect(await page.locator('#pause-stats canvas').count()).toBeGreaterThan(3);
		// 文字の情報は残っている＝絵に置き換えて読めなくなっていない
		// （新規開始は未装備∴装備欄は「なし」。ATK 表記は装備してから出る）
		await expect(page.locator('#pause-stats')).toContainText('なし');
		await expect(page.locator('#pause-stats')).not.toContainText(/[⚔🛡⚚💰❤]/);
	});
});

// ── 10e-2（2026-09-09・ユーザー指摘への対処）─────────────────────
// ⑤ HUD の絵は「文字と同じ単位」で伸縮する。PC の HUD の文字は vw 指定
//    （game/css/responsive.css）∴絵を固定 px で描くと**ビューポートが広いほど絵だけ
//    相対的に縮む**（10e 直後の見かけ縮小の原因）。CSS 変数 --hud-icon を経由して
//    いれば幅を変えた分だけ絵も大きくなる。
// ⑥ 防具ティア0（布の服）の HUD の絵は専用スプライト（armorCloth）＝金属の胸当て
//    （armor）の色替えではない。「HUD の3枠目が何なのか読めない」の再発を防ぐ。
test.describe('10e-2: HUD の絵の大きさと防具ティア0の絵', () => {
	test('⑤ HUD の絵はビューポート幅で伸縮し、SUB: の文字より大きい', async ({ page }) => {
		const widthsAt = async (vw) => {
			await page.setViewportSize({ width: vw, height: 800 });
			await page.waitForTimeout(50);
			return page.evaluate(() => {
				// 絵は ink で正規化される＝**長辺**が --hud-icon になる（細い絵は幅が小さい）
				// ∴大きさの比較は長辺で行う（幅で測るとルピーだけ落ちる）。
				const w = (sel) => {
					const cv = document.querySelector(sel);
					if (!cv) return null;
					const cs = getComputedStyle(cv);
					return Math.max(parseFloat(cs.width), parseFloat(cs.height));
				};
				return {
					armor:  w('#hud-equip-armor canvas'),
					sword:  w('#hud-equip-sword canvas'),
					wallet: w('#hud-wallet canvas'),
					subFont: parseFloat(getComputedStyle(document.getElementById('hud-sub-label')).fontSize),
				};
			});
		};
		await gotoFreshGame(page);
		const narrow = await widthsAt(800);
		const wide   = await widthsAt(1600);
		for (const k of ['armor', 'sword', 'wallet']) {
			expect(narrow[k], `#hud の ${k} の絵が無い`).toBeGreaterThan(0);
			// 幅を2倍にしたら絵も約2倍（vw 追従）。固定 px だと同じ値のまま＝赤。
			expect(wide[k] / narrow[k], `${k} の絵がビューポート幅に追従していない`).toBeCloseTo(2, 1);
			// 「SUB: の文字より少し大きい」（ユーザー確定 2026-09-09）
			expect(wide[k], `${k} の絵が SUB: の文字より小さい`).toBeGreaterThan(wide.subFont);
		}
	});

	test('⑥ 防具ティア0の HUD の絵は布の服（armorCloth）＝胸当ての色替えではない', async ({ page }) => {
		await page.goto('/blade-of-lumia/game/?fromEditor=1&ps_armor=0');
		// ⚠️ 起動時の mountIconEls が先に UI_ICON.armor（胸当て）の canvas を置く∴
		//    canvas の存在だけで待つと updateHud より前を測ってしまう（フレーク）。
		//    装備済みの印（has-item は updateHud が付ける）が付くまで待つ。
		await page.waitForFunction(() =>
			document.querySelector('#hud-equip-armor.has-item canvas') !== null);
		const got = await page.evaluate(async () => {
			const ui = await import('/blade-of-lumia/shared/ui-icons.js');
			const cv = document.querySelector('#hud-equip-armor canvas');
			return {
				drawn: { w: cv.width, h: cv.height },
				cloth: ui.iconInk('armorCloth'),
				plate: ui.iconInk('armor'),
			};
		});
		// 前提：2つの絵は形が違う（同じなら以下の比較は歯が無い）
		expect(got.cloth, 'armorCloth スプライトが無い').toBeTruthy();
		expect([got.cloth.w, got.cloth.h], '布の服と胸当ての ink が同じ＝この検査は形の違いを見ていない')
			.not.toEqual([got.plate.w, got.plate.h]);
		// canvas の実ドット数は ink をそのまま切り出した値＝どの絵を描いたかが判る
		expect(got.drawn, 'HUD の防具枠が布の服の絵になっていない').toEqual({ w: got.cloth.w, h: got.cloth.h });
	});
});
