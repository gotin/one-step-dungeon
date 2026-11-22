// キュー108（2026-11-15 ユーザー指定「ザーネルを倒した瞬間スタッフロールになってしまう…倒しただけでは終わらないようにしたい」
// 「姫の復活によって世界を救われていく感じを」）：ザーネルを倒す → 最期の言葉 → 女王の石碑の島で女王が目覚めて話す
// → 世界が戻っていく（各地の画面＋一行）→ はじまりの村 → スタッフロール。場面の一覧は game/ending-scene.js FINALE。
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { FINALE } from '../game/ending-scene.js';

test('ザーネルを倒すと、最期の言葉 → 女王の目覚め → 世界が戻る → 村 → スタッフロールの順', async ({ page }) => {
	test.setTimeout(120000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(`${GAME_URL}?fromEditor=1&layer=dark_tower&stage=5,3&row=7&col=5&ps_weapon=1&ps_defeated=G,N,J,A,O,L,I,U`);
	await waitForBoard(page);
	await page.waitForTimeout(800);
	const z = await page.evaluate(() => window.__game.getEnemies().find((e) => e.type === 'Z')?.id);
	expect(z, 'ザーネルが居ない').toBeTruthy();
	await page.evaluate((id) => window.__game.dealDamage(id, 9999, 'sword'), z);

	// 2026-11-16 ユーザー「ゲーム画面中はこういう有様じゃなかったのに、それが浄化された、っていうのなんか変」
	// ＝各画面はゲーム中と同じ姿（魔物・呪い火・怨念のもやが居る）で始まり、光の輪で魔物ともやが消え、花が咲く
	const seen = { names: [], captions: [], queenOnIsland: false, stoneFirst: false, pulses: new Set(), foes: new Set(), cleared: new Set(), unmist: new Set(), flowers: new Set() };
	// 2026-11-15 ユーザー報告「シーンの間に毒をうけたと表示されてた」＝場面の間に世界が進まない（HP も減らない）
	const hp0 = await page.evaluate(() => window.__game.getPlayer().hp);
	const t0 = Date.now();
	let ended = false;
	while (Date.now() - t0 < 100000 && !ended) {
		await page.waitForTimeout(250);
		const st = await page.evaluate(() => ({
			dlg: !document.getElementById('dialog-overlay').classList.contains('hidden'),
			name: document.getElementById('dialog-name')?.textContent,
			cap: document.getElementById('ending-caption')?.classList.contains('on') ? document.getElementById('ending-caption').textContent : '',
			queen: !!document.querySelector('.ending-queen'),
			stone: !!document.querySelector('.ending-queen.stone'),
			ending: !document.getElementById('ending-overlay').classList.contains('hidden'),
			msg: document.getElementById('msg-bar')?.classList.contains('hidden') ? '' : document.getElementById('msg-bar')?.textContent,
			hp: window.__game.getPlayer().hp,
			stage: (document.getElementById('hud-stage-label')?.textContent ?? '').replace(/^\[\w+\]\s*/, ''),
			montage: document.body.classList.contains('ending-montage'),
			foes: document.querySelectorAll('#char-layer .char-abs[data-enemy-id]').length,
			vanished: document.querySelectorAll('#char-layer .char-abs[data-enemy-id].ending-vanish').length,
			allClean: document.querySelectorAll('#board .cell').length > 0
				&& document.querySelectorAll('#board .cell.ending-cleansed').length === document.querySelectorAll('#board .cell').length,
			unmist: document.querySelectorAll('#board .cell.ending-unmist').length,
			flowers: document.querySelectorAll('#board .ending-flower').length,
		}));
		if (st.montage && st.foes > 0 && st.vanished === 0) seen.foes.add(st.stage);
		if (st.montage && st.allClean && st.foes > 0 && st.vanished === st.foes) seen.cleared.add(st.stage);
		if (st.montage && st.unmist > 0) seen.unmist.add(st.stage);
		if (st.montage && st.flowers > 0) seen.flowers.add(st.stage);
		if (st.msg) seen.pulses.add(st.msg);
		if (!st.ending) expect(st.hp, '場面の間に HP が減った').toBe(hp0);
		if (st.stone && !seen.queenOnIsland) seen.stoneFirst = true;
		if (st.queen) seen.queenOnIsland = true;
		if (st.cap && seen.captions.at(-1) !== st.cap) seen.captions.push(st.cap);
		if (st.dlg) {
			if (seen.names.at(-1) !== st.name) seen.names.push(st.name);
			await page.keyboard.press('Space');
		}
		ended = st.ending;
	}
	expect(errors).toEqual([]);
	expect([...seen.pulses].filter((m) => /毒|ダメージ|拾った|手に入れた/.test(m)), '場面の間に世界の出来事の知らせが出た').toEqual([]);
	expect(ended, 'スタッフロールまで行かない').toBe(true);
	expect(seen.names).toEqual([FINALE.zarnel.name, FINALE.queen.name, ...FINALE.village.talks.map((t) => t.name)]);
	expect(seen.stoneFirst, '女王が石（灰色）から始まらない').toBe(true);
	expect(seen.captions).toEqual(FINALE.restore.map((s) => s.text));
	// THE END までは明るい終わりのまま（キュー116：呪いの移りは「つづき…」の先）
	await expect(page.locator('#ending-msg')).toContainText('ルミアの地に平和が訪れた', { timeout: 60_000 });
	await expect(page.locator('#ending-restart')).toHaveText('つづき…');

	// 「つづき…」＝女王の島で剣士が石になる場面 → 女王の言葉 → はじまりの村で女王の周回が始まる
	await page.locator('#ending-restart').click();
	await expect(page.locator('#ending-overlay')).toBeHidden();
	await expect(page.locator('#ending-caption')).toHaveText(FINALE.curse.caption);
	await expect(page.locator('.ending-hero.stone')).toHaveCount(1, { timeout: 10_000 });
	// キュー116 ③：女王の周回だけ出る島の石の剣士（npcData）は、場面の間は出さない＝石になる前の剣士と重ならない
	await expect(page.locator('#board canvas[data-pal="heroStone"]')).toHaveCount(0);
	await expect(page.locator('#char-player')).toBeHidden();   // 遊ぶ側（もう女王の絵）は場面の間は隠す
	await expect(page.locator('#dialog-name')).toHaveText(FINALE.queen.name, { timeout: 10_000 });
	await expect(page.locator('#dialog-text')).toContainText(FINALE.curse.lines[0].slice(0, 6));
	const curseSave = await page.evaluate(() => localStorage.getItem('blade-of-lumia-save'));
	expect(curseSave, '場面の間にセーブを書いた（島に立ったセーブが残る）').toBeNull();
	for (let i = 0; i < 40 && await page.evaluate(() => document.body.classList.contains('ending-scene')); i++) {
		if (await page.locator('#dialog-overlay').isVisible()) await page.keyboard.press('Space');
		await page.waitForTimeout(200);
	}
	const after = await page.evaluate(() => ({
		stage: window.__game.getState().stageKey ?? null,
		pal: document.querySelector('#char-player canvas')?.dataset?.pal,
		hero: document.querySelectorAll('.ending-hero').length,
		save: JSON.parse(localStorage.getItem('blade-of-lumia-save') ?? 'null'),
	}));
	expect(after.pal, '周回の勇者が女王の絵でない').toMatch(/^queen/);
	expect(after.hero, '場面の剣士の絵が残った').toBe(0);
	expect(after.stage, '周回がはじまりの村から始まらない').toBe('7,14');
	expect(after.save, '島の場面のセーブが残った（ふつうの「はじめから」と同じく、歩き出すまで書かない）').toBeNull();
	expect(errors).toEqual([]);
	const restoreStages = FINALE.restore.map((s) => s.stage);
	const sorted = (s) => [...s].filter((k) => restoreStages.includes(k)).sort();
	expect(sorted(seen.foes), '魔物（呪い火）が居る姿で始まらない画面がある').toEqual([...restoreStages].sort());
	expect(sorted(seen.cleared), '光の輪の後に魔物が全部消えない画面がある').toEqual([...restoreStages].sort());
	expect(sorted(seen.unmist), '怨念のもやが晴れない').toEqual(['11,18', '3,16']);
	expect(sorted(seen.flowers), '花が咲かない画面がある').toEqual([...restoreStages].sort());
});

// キュー108：場面の途中でタブを閉じた場合。直す前は場面の画面替え（enterStage）が毎回セーブを書き、
// 「島や村に立った・ザーネル撃破済み・未クリア」のセーブが残った＝続きからでエンディングに二度と行けなかった。
// 今＝倒した時点で「場面待ち」の印（玉座の間）を書き、場面の間は書かない → 続きからで場面を最初から流す。
test('場面の途中で閉じても、続きからで場面を最初から流してスタッフロールまで行く', async ({ page }) => {
	test.setTimeout(150000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(`${GAME_URL}?fromEditor=1&layer=dark_tower&stage=5,3&row=7&col=5&ps_weapon=1&ps_defeated=G,N,J,A,O,L,I,U`);
	await waitForBoard(page);
	await page.waitForTimeout(800);
	const z = await page.evaluate(() => window.__game.getEnemies().find((e) => e.type === 'Z')?.id);
	await page.evaluate((id) => window.__game.dealDamage(id, 9999, 'sword'), z);

	// 世界が戻る場面（島の後・画面替えを何度か通った後）まで進めてからセーブを読む
	const t0 = Date.now();
	while (Date.now() - t0 < 60000) {
		await page.waitForTimeout(250);
		const st = await page.evaluate(() => ({
			dlg: !document.getElementById('dialog-overlay').classList.contains('hidden'),
			cap: document.getElementById('ending-caption')?.classList.contains('on'),
		}));
		if (st.cap) break;
		if (st.dlg) await page.keyboard.press('Space');
	}
	const save = await page.evaluate(() => JSON.parse(localStorage.getItem('blade-of-lumia-save') ?? 'null'));
	expect(save?.player?.finalePending, '「場面待ち」の印が無い').toBe(true);
	expect([save?.currentLayer, save?.stageKey], '場面の画面替えがセーブに残った').toEqual(['dark_tower', '5,3']);

	// タブを閉じた＝素の URL で開き直して「続きから」
	await page.goto(GAME_URL);
	await page.locator('#btn-continue').click();
	const seen = [];
	let ended = false;
	const t1 = Date.now();
	while (Date.now() - t1 < 110000 && !ended) {
		await page.waitForTimeout(250);
		const st = await page.evaluate(() => ({
			dlg: !document.getElementById('dialog-overlay').classList.contains('hidden'),
			name: document.getElementById('dialog-name')?.textContent,
			ending: !document.getElementById('ending-overlay').classList.contains('hidden'),
		}));
		if (st.dlg) {
			if (seen.at(-1) !== st.name) seen.push(st.name);
			await page.keyboard.press('Space');
		}
		ended = st.ending;
	}
	expect(errors).toEqual([]);
	expect(ended, '続きからでスタッフロールまで行かない').toBe(true);
	expect(seen).toEqual([FINALE.zarnel.name, FINALE.queen.name, ...FINALE.village.talks.map((t) => t.name)]);
	// スタッフロールに入ったらセーブは消え、クリアの印が残る（次は女王で遊べる）
	const after = await page.evaluate(() => ({ save: localStorage.getItem('blade-of-lumia-save'), cleared: localStorage.getItem('blade-of-lumia-cleared') }));
	expect(after).toEqual({ save: null, cleared: '1' });
});
