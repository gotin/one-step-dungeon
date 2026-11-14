// tests/story-approach.spec.js
// 「ボスを倒した後の次はどこ」をキャラクターの出来事で示す仕組みの番人（2026-11-14 / PLAN 実行キュー 103）。
//
// きっかけ（ユーザー）＝「洞窟を攻略してボスを倒して、洞窟を出た後から彷徨うしかなくて結構つらいかも」
// → 方針「ボスを倒してから洞窟から出るとなんらかのキャラクターがやってきて話しかけてくる」。
//
// 守るもの:
//   ① 判定（shared/story-events.js）＝条件のキーは会話の版と同じ書き方・出現は showWhen 全部かつ hideWhen どれも
//   ② 会話の版＝出来事の版（`flag:…`）が版の選択肢に入り、成り立てば台詞が変わる
//   ③ セーブ＝壊れた storyFlags / approachedNpcs を直す
//   ④ 実ゲーム＝L を倒す前の field 15,4 には使いが居ない（描かない・通れる・話せない）
//   ⑤ 実ゲーム＝L を倒した後に入ると、使いが歩いてきて話しかける（演出中は入力を飲む）→ 読み終えると
//      出来事が記され・沼地の神殿の印が付き・使いは去る（もう描かない・通れる）→ セーブに残る
//   ⑥ 一度来た人は二度来ない（同じ画面に入り直しても）
//   ⑦ エディタ＝使いの欄に居る条件・居なくなる条件・話しかけに来る・記す出来事が出て、編集が保存に載る
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { conditionKeyHolds, npcPresent, listStoryFlags, flagVariantKey, pendingApproach } from '../shared/story-events.js';
import { variantOptions, readEntryVariants, VARIANT_KIND } from '../shared/dialog-variants.js';
import { sanitizeLoadedPlayer } from '../game/save.js';
import { ITEM_META } from '../shared/items.js';
import { Q103_MESSENGER } from '../scripts/migrate-q103-ice-messenger.mjs';
import { Q104_TARO } from '../scripts/migrate-q104-d3-taro.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const M = Q103_MESSENGER;
const POS = `${M.r},${M.c}`;
const ENTRY = map.layers[M.layer].stages[M.stage].npcData[POS];

const P = (o = {}) => ({ defeatedBosses: new Set(o.bosses ?? []), triforceCount: o.tri ?? 0, storyFlags: o.flags ?? [], subItems: {} });

test.describe('出来事 ①②③（データと判定）', () => {
	test('① 条件のキー＝ボス・default・after・道具・出来事。出現は showWhen 全部かつ hideWhen どれも', () => {
		expect(conditionKeyHolds('L', P({ bosses: ['L'] }))).toBe(true);
		expect(conditionKeyHolds('L', P())).toBe(false);
		expect(conditionKeyHolds('default', P({ bosses: ['G'] }))).toBe(true);
		expect(conditionKeyHolds('after', P({ tri: 1 }))).toBe(true);
		expect(conditionKeyHolds('flag:x', P({ flags: ['x'] }))).toBe(true);
		expect(conditionKeyHolds('flag:x', P({ flags: ['y'] }))).toBe(false);
		expect(conditionKeyHolds('item:ladder', { ...P(), hasLadder: true })).toBe(true);

		expect(npcPresent(undefined, P()), '条件の無い人はいつでも居る').toBe(true);
		expect(npcPresent({ name: '村人' }, P())).toBe(true);
		const e = { showWhen: ['L'], hideWhen: ['flag:f', 'I'] };
		expect(npcPresent(e, P()), 'L の前は居ない').toBe(false);
		expect(npcPresent(e, P({ bosses: ['L'] })), 'L の後は居る').toBe(true);
		expect(npcPresent(e, P({ bosses: ['L'], flags: ['f'] })), '出来事の後は居ない').toBe(false);
		expect(npcPresent(e, P({ bosses: ['L', 'I'] })), '沼地の神殿の主を倒した後も居ない').toBe(false);
	});

	test('① 試作のデータ＝field 15,4 の使い（L の後だけ・来る・出来事を記す・沼地の神殿の印）', () => {
		const sd = map.layers[M.layer].stages[M.stage];
		expect(sd.tiles[M.r][M.c]).toBe(M.tile);
		expect(ENTRY.showWhen).toEqual(['L']);
		expect(ENTRY.hideWhen).toEqual([`flag:${M.flag}`, 'I']);
		expect(ENTRY.approach).toBe(true);
		expect(ENTRY.setsFlag).toBe(M.flag);
		expect(ENTRY.mark).toMatchObject({ layer: 'field', stage: '10,14', label: '沼地の神殿' });
		// 入口の画面の出入り口（西の端の行4・5）を塞がない
		expect(M.r === 4 || M.r === 5, '西の出入り口の行に置いた').toBe(false);
		expect(listStoryFlags(map).map((f) => f.name)).toContain(M.flag);
		// 印は1目的地1提供元（check-dialog-integrity ⑤b）＝沼地の神殿の印は使いが渡す。エルンの L の版からは外した
		expect(map.layers.field.stages['13,5'].npcData['4,5'].markAfterBoss?.L, 'エルンも沼地の神殿の印を渡している').toBeUndefined();
		const isNpc = (t) => t === 'a';
		expect(pendingApproach(sd, M.layer, M.stage, P(), isNpc), 'L の前に来た').toBe(null);
		expect(pendingApproach(sd, M.layer, M.stage, P({ bosses: ['L'] }), isNpc)?.posKey).toBe(POS);
		expect(pendingApproach(sd, M.layer, M.stage, { ...P({ bosses: ['L'] }), approachedNpcs: [`${M.layer}:${M.stage}:${POS}`] }, isNpc),
			'一度来た人がまた来る').toBe(null);
	});

	test('② 出来事の版＝選択肢に入る・キーの順のまま読める', () => {
		const opts = variantOptions(map);
		const o = opts.find((x) => x.key === flagVariantKey(M.flag));
		expect(o?.kind).toBe(VARIANT_KIND.FLAG);
		expect(o?.supportsMark).toBe(true);
		const entry = { lines: ['基本'], linesAfterBoss: { L: ['L の後'], 'flag:未知': ['未知'], [flagVariantKey(M.flag)]: ['知らせの後'] } };
		const vs = readEntryVariants(entry, opts);
		expect(vs.map((v) => v.key)).toEqual(['L', 'flag:未知', flagVariantKey(M.flag)]);
		expect(vs[1].kind, '誰も記さない出来事をボスの版として読んだ').toBe(VARIANT_KIND.FLAG);
	});

	test('③ セーブ＝壊れた storyFlags / approachedNpcs を直す', () => {
		const fix = (k, v) => { const p = { subItems: {}, [k]: v }; sanitizeLoadedPlayer(p, ITEM_META); return p[k]; };
		for (const k of ['storyFlags', 'approachedNpcs']) {
			expect(fix(k, undefined)).toEqual([]);
			expect(fix(k, 'x')).toEqual([]);
			expect(fix(k, ['a', 'a', 3, null, '', 'b'])).toEqual(['a', 'b']);
		}
	});
});

// ── 実ゲーム ─────────────────────────────────────────────
// 氷の廃墟の入口 `>`(4,6) の南 (5,6) に立つ＝ダンジョンから出てきた所。
const ENTER = (defeated) => `${GAME_URL}?fromEditor=1&layer=field&stage=15,4&row=5&col=6&ps_weapon=1${defeated ? `&ps_defeated=${defeated}` : ''}`;
const look = (page) => page.evaluate(([r, c]) => {
	const s = window.__game.getState(), pl = window.__game.getPlayer();
	return {
		stage: s.stageKey,
		dialog: !document.getElementById('dialog-overlay').classList.contains('hidden'),
		name: document.getElementById('dialog-name')?.textContent ?? '',
		text: document.getElementById('dialog-text')?.textContent ?? '',
		busy: !!s.player.storyApproachBusy,
		flags: [...(pl.storyFlags ?? [])],
		approached: [...(pl.approachedNpcs ?? [])],
		marks: (pl.mapMarks ?? []).map((m) => `${m.layer}:${m.stage}`),
		homeArt: !!document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"] > canvas.char-sprite`),
		walkers: document.querySelectorAll('.story-walker').length,
	};
}, [M.r, M.c]);
async function readAll(page) {
	for (let i = 0; i < 12 && (await look(page)).dialog; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(80); }
}

test.describe('出来事 ④⑤⑥（実ゲーム・field 15,4 の使い）', () => {
	test('④ L を倒す前は使いが居ない（描かない・話せない・通れる）', async ({ page }) => {
		await page.goto(ENTER('G,N,J,A,O'));
		await waitForBoard(page);
		await page.waitForTimeout(1200);
		let s = await look(page);
		expect(s.homeArt, 'まだ来ていない使いが描かれた').toBe(false);
		expect(s.dialog || s.busy || s.walkers > 0, 'L の前に話しかけに来た').toBe(false);
		// 通れる＝使いのセルの東 (7,2) から西へ歩いて (7,1) に乗れる
		await page.evaluate(() => { const p = window.__game.getPlayer(); p.x = 2; p.y = 7; });
		for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__game.movePlayer('left')); await page.waitForTimeout(60); }
		const pl = await page.evaluate(() => { const p = window.__game.getPlayer(); return [Math.round(p.y), Math.round(p.x)]; });
		expect(pl, '居ない人のセルに乗れない').toEqual([7, 1]);
	});

	test('⑤ L の後に入ると歩いてきて話しかける → 読むと出来事・印・去る → セーブに残る', async ({ page }) => {
		await page.goto(ENTER('G,N,J,A,O,L'));
		await waitForBoard(page);
		// 歩いている間＝演出中（入力を飲む）・見た目だけの人が char-layer に居る・元のセルの絵は隠す
		await page.waitForFunction(() => document.querySelectorAll('.story-walker').length === 1, null, { timeout: 3000 });
		let s = await look(page);
		expect(s.busy, '歩いている間に演出中になっていない').toBe(true);
		const before = await page.evaluate(() => { const p = window.__game.getPlayer(); return [p.x, p.y]; });
		await page.keyboard.press('ArrowLeft');
		await page.waitForTimeout(100);
		const after = await page.evaluate(() => { const p = window.__game.getPlayer(); return [p.x, p.y]; });
		expect(after, '演出中に勇者が動いた').toEqual(before);
		// ループは止めてあるので歩けないのは当然＝入力を飲んでいる証拠はポーズが開かないこと
		// （開くと、ポーズの上で会話が始まる）
		await page.keyboard.press('Escape');
		await page.waitForTimeout(80);
		expect(await page.evaluate(() => document.getElementById('pause-overlay').classList.contains('hidden')),
			'演出中にポーズが開いた').toBe(true);

		// 隣に来て話しかける
		await page.waitForFunction(() => !document.getElementById('dialog-overlay').classList.contains('hidden'), null, { timeout: 6000 });
		s = await look(page);
		expect(s.name).toBe('エルンの使い');
		expect(s.text).toContain('勇者どの');
		const walker = await page.evaluate(() => {
			const w = document.querySelector('.story-walker'); const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
			return { r: Math.round(parseFloat(w.style.top) / cell), c: Math.round(parseFloat(w.style.left) / cell) };
		});
		const pl = await page.evaluate(() => { const p = window.__game.getPlayer(); return { r: Math.round(p.y), c: Math.round(p.x) }; });
		expect(Math.abs(walker.r - pl.r) + Math.abs(walker.c - pl.c), '使いが勇者の隣まで来ていない').toBe(1);

		await readAll(page);
		s = await look(page);
		expect(s.flags, '読み終えても出来事が記されない').toEqual([M.flag]);
		expect(s.marks, '沼地の神殿の印が付かない').toContain('field:10,14');
		expect(s.approached).toEqual([`${M.layer}:${M.stage}:${POS}`]);
		// 去る＝見た目の人が消え、元のセルにも描かれない
		await page.waitForFunction(() => document.querySelectorAll('.story-walker').length === 0, null, { timeout: 6000 });
		s = await look(page);
		expect(s.homeArt, '去った使いが元のセルに残った').toBe(false);
		expect(s.busy).toBe(false);
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('blade-of-lumia-save') ?? 'null')?.player);
		expect(saved?.storyFlags, 'セーブに出来事が残らない').toEqual([M.flag]);
		expect(saved?.approachedNpcs).toEqual([`${M.layer}:${M.stage}:${POS}`]);
	});

	test('⑥ 一度来た人は二度来ない（聞く前に居なくならない人でも）', async ({ page }) => {
		await page.goto(ENTER('G,N,J,A,O,L'));
		await waitForBoard(page);
		await page.waitForFunction(() => !document.getElementById('dialog-overlay').classList.contains('hidden'), null, { timeout: 8000 });
		await readAll(page);
		await page.waitForFunction(() => document.querySelectorAll('.story-walker').length === 0, null, { timeout: 6000 });
		// 出来事だけ消して「まだ居る」状態に戻しても、来た記録があるので来ない
		await page.evaluate(() => { window.__game.getPlayer().storyFlags = []; });
		await page.evaluate(([lk, sk]) => window.__game.enterStage?.(lk, sk, 5, 6), [M.layer, M.stage]);
		await page.waitForTimeout(1500);
		const s = await look(page);
		expect(s.dialog || s.busy || s.walkers > 0, '一度来た人がまた来た').toBe(false);
	});
});

// ── キュー104 ①：水の迷宮のボス部屋に駆けつけるタロ ─────────────────────
const T = Q104_TARO;
test.describe('出来事 ⑧（D3 ボス部屋に駆けつけるタロ）', () => {
	test('⑧ データ＝J の後だけ・来る・記す・炎の神殿の印は1か所・村のタロに出来事の版', () => {
		const e = map.layers[T.layer].stages[T.stage].npcData[`${T.r},${T.c}`];
		expect(map.layers[T.layer].stages[T.stage].tiles[T.r][T.c]).toBe(T.tile);
		expect(e).toMatchObject({ showWhen: ['J'], hideWhen: [`flag:${T.flag}`, 'A'], approach: true, setsFlag: T.flag });
		expect(e.mark).toMatchObject({ layer: 'field', stage: '12,2', label: '炎の神殿' });
		const post = map.layers.field.stages['10,0'];
		expect((post.signData?.['5,5'] ?? post.npcData?.['5,5']).mark, '灰境の道標も炎の神殿の印を渡している').toBeUndefined();
		const keys = Object.keys(map.layers.field.stages['7,14'].npcData['3,5'].linesAfterBoss);
		expect(keys.indexOf(`flag:${T.flag}`), '村のタロの出来事の版が J のすぐ下に無い').toBe(keys.indexOf('J') + 1);
	});

	test('⑧ 実ゲーム＝J を倒すと扉の内側から駆けつけて話し、印を付けて去る', async ({ page }) => {
		await page.goto(`${GAME_URL}?fromEditor=1&layer=${T.layer}&stage=${T.stage}&row=5&col=8&ps_weapon=1&ps_map=1`);
		await waitForBoard(page);
		await page.waitForTimeout(500);
		let s = await page.evaluate(([r, c]) => ({
			art: !!document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"] > canvas.char-sprite`),
			walkers: document.querySelectorAll('.story-walker').length,
		}), [T.r, T.c]);
		expect(s.art || s.walkers > 0, '戦う前にタロが居る').toBe(false);
		const boss = await page.evaluate(() => window.__game.getEnemies().find((e) => e.type === 'J')?.id);
		expect(boss, 'ボス J が居ない').toBeTruthy();
		// 扉から入る前に、自分のセル（扉の左上）へ一瞬描かれないこと（2026-11-14 ユーザー指摘）。
		// 盤は撃破の瞬間に描き直される∴DOM の変化を見張って、自分のセルに絵が置かれたら記録する。
		await page.evaluate(([r, c]) => {
			window.__homeFlash = false;
			new MutationObserver(() => {
				if (document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"] > canvas.char-sprite`)) window.__homeFlash = true;
			}).observe(document.getElementById('board'), { childList: true, subtree: true });
		}, [T.r, T.c]);
		await page.evaluate((id) => window.__game.dealDamage(id, 9999, 'sword'), boss);
		await page.waitForFunction(() => document.querySelectorAll('.story-walker').length === 1, null, { timeout: 15000 });
		// 下の扉（approachFrom 9,5）の外から入ってくる＝現れた瞬間は扉の行より下に居る
		const firstRow = await page.evaluate(() => {
			const w = document.querySelector('.story-walker'); const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
			return Math.round(parseFloat(w.style.top) / cell);
		});
		expect(firstRow, 'タロが扉の外から入ってこない').toBeGreaterThanOrEqual(9);
		await page.waitForFunction(() => !document.getElementById('dialog-overlay').classList.contains('hidden'), null, { timeout: 8000 });
		expect(await page.evaluate(() => document.getElementById('dialog-name').textContent)).toBe('村人 タロ');
		for (let i = 0; i < 10 && await page.evaluate(() => !document.getElementById('dialog-overlay').classList.contains('hidden')); i++) {
			await page.keyboard.press('Space'); await page.waitForTimeout(80);
		}
		const pl = await page.evaluate(() => { const p = window.__game.getPlayer(); return { flags: p.storyFlags, marks: p.mapMarks.map((m) => m.stage) }; });
		expect(pl.flags).toContain(T.flag);
		expect(pl.marks).toContain('12,2');
		await page.waitForFunction(() => document.querySelectorAll('.story-walker').length === 0, null, { timeout: 6000 });
		s = await page.evaluate(([r, c]) => !!document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"] > canvas.char-sprite`), [T.r, T.c]);
		expect(s, '去ったタロが残った').toBe(false);
		expect(await page.evaluate(() => window.__homeFlash), '扉から入る前のタロが自分の場所に一瞬描かれた').toBe(false);
	});
});

test.describe('出来事 ⑦（エディタ）', () => {
	test('⑦ 使いの欄に出来事の項目が出て、編集が保存に載る', async ({ page }) => {
		await page.goto('/blade-of-lumia/editor/');
		await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(map));
		await page.reload();
		await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
		const [x, y] = M.stage.split(',');
		await page.locator('#world-grid .world-cell').filter({ has: page.locator('.cell-coord', { hasText: `(${x},${y})` }) }).first().click();
		await page.locator('#btn-edit-stage').click();
		const item = page.locator('#npc-list .link-item').filter({ has: page.locator('.link-item-header', { hasText: `NPC (${POS})` }) });
		await expect(item).toHaveCount(1);
		const show = item.locator('.story-cond-list[data-cond="showWhen"] select');
		const hide = item.locator('.story-cond-list[data-cond="hideWhen"] select');
		await expect(show).toHaveCount(1);
		expect(await show.first().inputValue()).toBe('L');
		await expect(hide).toHaveCount(2);
		expect(await hide.first().inputValue()).toBe(`flag:${M.flag}`);
		await expect(item.locator('[data-f="approach"]')).toBeChecked();
		await expect(item.locator('[data-f="setsFlag"]')).toHaveValue(M.flag);
		// 看板・石碑には出さない（人だけの項目）
		await expect(page.locator('#npc-list .link-item').filter({ hasText: '鐘楼の石碑' }).locator('.story-event-fields')).toHaveCount(0);

		// 編集：居なくなる条件の2つ目（I）を消す・話しかけに来るを外す・記す出来事を変える
		await item.locator('.story-cond-list[data-cond="hideWhen"] .story-cond-row').nth(1).locator('button').click();
		await item.locator('[data-f="approach"]').uncheck();
		await item.locator('[data-f="setsFlag"]').fill('別の知らせ');
		// 保存は確認のダイアログを出す＝断る（ファイルには書かせない・localStorage の控えだけ読む）
		page.on('dialog', (d) => d.dismiss());
		await page.locator('#btn-save').click();
		await page.waitForTimeout(300);
		const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData')));
		const e = saved.layers[M.layer].stages[M.stage].npcData[POS];
		expect(e.hideWhen).toEqual([`flag:${M.flag}`]);
		expect('approach' in e, '外した「話しかけに来る」が残った').toBe(false);
		expect(e.setsFlag).toBe('別の知らせ');
		expect(e.showWhen).toEqual(['L']);
	});
});
