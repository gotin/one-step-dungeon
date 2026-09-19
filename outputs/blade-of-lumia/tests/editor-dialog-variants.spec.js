// ── tests/editor-dialog-variants.spec.js ── 実行キュー23 ─────────────────
// 不変条件：**進行で切り替わるセリフ／目的地を、エディタだけで読み書きできる**。
// これが無いと、キュー17 の残り7帯は「1行直すために移行スクリプトを1本書く」ことになる。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 実データが持っている版が画面に出ない／並びが実ゲームの優先順と違う
//      （並び＝**会話1件ごとのキーの順**＝`readEntryVariants()` が読み、`game/ui.js
//       pickDialogVariant` が同じ順で解く。∴画面で▲▼で組んだ順が保存される＝⑬⑬-2⑭）
//   ⑬⑬-2⑭ 版を並べ替えられない／並べ替えても保存されない／読み戻しで勝手に整えられる
//      （⑬-2＝星の欠片の版 `after` も動かせる＝キュー25 で `linesAfterBoss` の予約キーへ畳んだ）
//   ⑮ 撃破と欠片の2条件が独立に効かない（欠片の版が常に一番弱い位置へ戻る）
//   ② 版のセリフ／目的地を直しても `linesAfterBoss` / `markAfterBoss` に入らない
//      （入る場所を間違える＝`signData` と `npcData` の取り違えも含む）
//   ③ 空の版で `{}` や `[""]` を作る／版を消しても親キーが残る（データの形が壊れる＝⛔）
//   ④ 印にならない入力（存在しない画面・層）が赤くならない
//   ⑤ **無編集の往復でデータが変わる**（開いただけで13エントリが書き換わる＝差分が読めなくなる）
//   ⑥ `ps_defeated` が効かない／エディタの並びと実ゲームの優先順がズレる
//
// ⚠️ 版の一覧・ボスの表示名は**手書きしない**＝実マップから導出する
//    （[[blade-enemy-tables-derive-from-meta]]）∴期待値もここでは導出して作る。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	variantOptions, bossVariantOptions, readEntryVariants, applyEntryVariants,
	itemVariantOptions, itemVariantKey, itemIdOfVariantKey, VARIANT_KIND,
} from '../shared/dialog-variants.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META, ownsItem } from '../shared/items.js';
import { bossesDefeatedUpTo, SUB_ITEM_KEYS } from '../shared/progression.js';
import { waitForBoard } from './helpers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const OPTIONS = variantOptions(MAP);

const EDITOR_URL = '/blade-of-lumia/editor/';
const GAME_URL   = '/blade-of-lumia/game/';
const RED = 'rgb(240, 128, 128)';

// 老賢者＝版が一番多い相手（8ボス＋default・印つき）。石碑＝版が1件だけ（親キーごと消えるかを見る）。
const SAGE  = { stage: '7,14', pos: '3,3', rc: [3, 3] };
const STELE = { stage: '6,13', pos: '7,8' };
const TARO  = { stage: '7,14', pos: '3,5' };
// 村人ハナ＝**欠片の版がボスの版の下**に居る唯一の相手（キュー25 (2) で実データに1件作った）。
// 「倒したが欠片は未回収」と「回収済み」を書き分けている＝2つの条件が独立に効く証拠になる。
const HANA  = { stage: '6,13', pos: '5,7', rc: [5, 6] };

const entryOf = (stage, pos) => MAP.layers.field.stages[stage].npcData[pos];

// 老賢者が持つ版の並び＝画面のブロックの並びと同じ（＝**実データのキーの順**）。
// ⚠️ ブロック番号を**手書きしない**＝並びは 2026-09-15 に「上が一般・下が特殊」へ反転し、
//    さらに**会話ごとに▲▼で組み替えられる**ようになった∴キーから引く。
const SAGE_VARS = readEntryVariants(entryOf(SAGE.stage, SAGE.pos), OPTIONS);
const sageIdx = (key) => {
	const i = SAGE_VARS.findIndex((v) => v.key === key);
	if (i < 0) throw new Error(`老賢者が版 "${key}" を持っていない＝別の相手で測り直す`);
	return i;
};

/** エディタを実マップで開く（エディタは localStorage からしか復元しない） */
async function gotoEditorWithMap(page) {
	await page.goto(EDITOR_URL);
	await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(MAP));
	await page.reload();
	await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
}

async function openStageInEditor(page, stageKey) {
	const [x, y] = stageKey.split(',');
	const cell = page.locator('#world-grid .world-cell')
		.filter({ has: page.locator('.cell-coord', { hasText: `(${x},${y})` }) });
	await cell.first().click();
	await page.locator('#btn-edit-stage').click();
	await expect(page.locator('#view-stage')).not.toHaveClass(/hidden/);
}

function npcItem(page, posKey) {
	return page.locator('#npc-list .link-item')
		.filter({ has: page.locator('.link-item-header', { hasText: `NPC (${posKey})` }) });
}

async function savedMapData(page) {
	await page.locator('#btn-save').click();
	const raw = await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData'));
	expect(raw, 'エディタが保存していない').toBeTruthy();
	return JSON.parse(raw);
}

/** 版のブロック（上から n 番目＝優先順で n 番目） */
const variantBlock = (item, i) => item.locator('.dialog-variant').nth(i);

test.describe('会話の「進行で切り替わる版」をエディタで編集する（キュー23）', () => {
	test('① 実データが持つ版が優先順に並んで出る（ボス名は実マップから導出）', async ({ page }) => {
		const entry    = entryOf(SAGE.stage, SAGE.pos);
		const expected = readEntryVariants(entry, OPTIONS);
		expect(expected.length, '老賢者の版が減った＝別の相手で測り直す').toBe(9);

		await gotoEditorWithMap(page);
		await openStageInEditor(page, SAGE.stage);
		const item = npcItem(page, SAGE.pos);

		await expect(item.locator('.dialog-variant')).toHaveCount(expected.length);
		const conds = await item.locator('[data-vf="cond"]').evaluateAll((els) => els.map((e) => e.value));
		expect(conds, '版の並びが実ゲームの優先順と違う').toEqual(expected.map((v) => v.key));
		// 並びは**上が一般・下が特殊**（下がヒットしたら勝つ）∴一般の版が先頭に来る。
		expect(expected[0].key, '一般の版（default／after）が先頭に来ていない').toBe('default');

		// 条件のラベルにボスの名前が入る（タイル文字だけでは何のボスか分からない）
		const gIdx = sageIdx('G');
		const gLabel = await variantBlock(item, gIdx).locator('[data-vf="cond"] option:checked').textContent();
		expect(gLabel).toContain(ENEMY_META.G.name);
		expect(gLabel).toContain(MAP.layers.dungeon_1.name);

		// セリフと目的地が欄に出る（読めていない＝空欄なら赤くなる）
		await expect(variantBlock(item, gIdx).locator('[data-vf="lines"]'))
			.toHaveValue(entry.linesAfterBoss.G.join('\n'));
		await expect(variantBlock(item, gIdx).locator('[data-vf="markStage"]'))
			.toHaveValue(entry.markAfterBoss.G.stage);
		await expect(variantBlock(item, gIdx).locator('[data-vf="markLabel"]'))
			.toHaveValue(entry.markAfterBoss.G.label);

		// `default` の版は印を持てる／星の欠片の版（`after`）は持てない（欄を出さない＝キュー25 (2)）
		const defIdx = expected.findIndex((v) => v.key === 'default');
		await expect(variantBlock(item, defIdx).locator('[data-vf="markStage"]')).toHaveCount(1);
		const taro = npcItem(page, TARO.pos);
		const taroVars = readEntryVariants(entryOf(TARO.stage, TARO.pos), OPTIONS);
		const afterIdx = taroVars.findIndex((v) => v.key === 'after');
		expect(afterIdx, 'タロの `after` の版が消えた＝別の相手で測り直す').toBeGreaterThanOrEqual(0);
		await expect(variantBlock(taro, afterIdx).locator('[data-vf="markStage"]')).toHaveCount(0);
	});

	test('② 版のセリフと目的地を直すと linesAfterBoss / markAfterBoss に入る', async ({ page }) => {
		page.on('dialog', (d) => d.dismiss());   // 保存はダイアログを出す
		await gotoEditorWithMap(page);
		await openStageInEditor(page, SAGE.stage);
		const item  = npcItem(page, SAGE.pos);
		const block = variantBlock(item, sageIdx('G'));   // G（ゴーレム）の版

		await block.locator('[data-vf="lines"]').fill('書き換えた1行目\n2行目');
		await block.locator('[data-vf="markStage"]').fill('9,9');
		await block.locator('[data-vf="markLabel"]').fill('書き換えた印');
		await block.locator('[data-vf="markKind"]').selectOption('cave');

		const saved = await savedMapData(page);
		const after = saved.layers.field.stages[SAGE.stage].npcData[SAGE.pos];
		expect(after.linesAfterBoss.G).toEqual(['書き換えた1行目', '2行目']);
		expect(after.markAfterBoss.G).toEqual({ stage: '9,9', label: '書き換えた印', kind: 'cave', layer: 'field' });
		// 基本のセリフ・印には触らない（版の編集が土台を壊さない）
		expect(after.lines).toEqual(entryOf(SAGE.stage, SAGE.pos).lines);
		expect(after.mark).toEqual(entryOf(SAGE.stage, SAGE.pos).mark);
		// 他の版も巻き込まない
		expect(after.linesAfterBoss.N).toEqual(entryOf(SAGE.stage, SAGE.pos).linesAfterBoss.N);
	});

	test('③ 印にならない入力は版の欄でもその場で赤くなる', async ({ page }) => {
		await gotoEditorWithMap(page);
		await openStageInEditor(page, SAGE.stage);
		const block   = variantBlock(npcItem(page, SAGE.pos), sageIdx('G'));
		const stageEl = block.locator('[data-vf="markStage"]');
		const layerEl = block.locator('[data-vf="markLayer"]');

		await stageEl.fill('ごみ');
		await expect(stageEl, '画面の形が違うのに赤くならない').toHaveCSS('border-color', RED);
		await stageEl.fill('99,99');
		await expect(stageEl, '存在しない画面が赤くならない').toHaveCSS('border-color', RED);
		await stageEl.fill('9,9');
		await expect(stageEl).not.toHaveCSS('border-color', RED);
		await layerEl.fill('abc');
		await expect(layerEl, '存在しない層が赤くならない').toHaveCSS('border-color', RED);
		await expect(stageEl, '層が原因なのに画面まで赤い').not.toHaveCSS('border-color', RED);
	});

	test('④ 空の版を足しても何も書かれない（{} や [""] を作らない）', async ({ page }) => {
		page.on('dialog', (d) => d.dismiss());
		await gotoEditorWithMap(page);
		await openStageInEditor(page, STELE.stage);
		const item   = npcItem(page, STELE.pos);
		const before = entryOf(STELE.stage, STELE.pos);
		await expect(item.locator('.dialog-variant')).toHaveCount(1);

		await item.locator('.btn-add-variant').click();
		await expect(item.locator('.dialog-variant'), '版が増えていない＝ボタンが効いていない').toHaveCount(2);

		// ⚠️ 足した版は**末尾に残らない**＝並び（優先順）に挿し込まれる∴ブロック番号で掴まず
		//    条件の値で探す（2026-09-15 に並びが「上が一般」へ反転し、足した版が先頭に入った）。
		const conds = await item.locator('[data-vf="cond"]').evaluateAll((els) => els.map((e) => e.value));
		const addKey = conds.find((k) => !readEntryVariants(before, OPTIONS).some((v) => v.key === k));
		expect(addKey, '足した版の条件が見つからない').toBeTruthy();
		// ⚠️ 足しただけでは書き込みが走らない∴**書き込みを起こしてから**測る
		//    （一度書いて消す・空白だけ書く＝どちらも「空の版」として捨てられるべき）。
		const added = variantBlock(item, conds.indexOf(addKey));
		await added.locator('[data-vf="lines"]').fill('いったん書く');
		await added.locator('[data-vf="lines"]').fill('');
		const saved = await savedMapData(page);
		const after = saved.layers.field.stages[STELE.stage].npcData[STELE.pos];
		expect(JSON.stringify(after), '空の版が書き込まれた').toBe(JSON.stringify(before));

		await added.locator('[data-vf="lines"]').fill('   \n\t');
		const saved2 = await savedMapData(page);
		const after2 = saved2.layers.field.stages[STELE.stage].npcData[STELE.pos];
		expect(JSON.stringify(after2), '空白だけの行が書き込まれた（[""] を作った）').toBe(JSON.stringify(before));
	});

	test('⑤ 版を削除するとセリフと印の両方が消え、空になった親キーも消える', async ({ page }) => {
		page.on('dialog', (d) => d.dismiss());
		await gotoEditorWithMap(page);
		await openStageInEditor(page, STELE.stage);
		const item = npcItem(page, STELE.pos);
		const before = entryOf(STELE.stage, STELE.pos);
		expect(Object.keys(before.linesAfterBoss), '石碑の版が増えた＝別の相手で測り直す').toEqual(['G']);

		await variantBlock(item, 0).locator('[data-vf="del"]').click();
		await expect(item.locator('.dialog-variant')).toHaveCount(0);

		const saved = await savedMapData(page);
		const after = saved.layers.field.stages[STELE.stage].npcData[STELE.pos];
		expect(after.linesAfterBoss, '親キー linesAfterBoss が空のまま残った').toBeUndefined();
		expect(after.markAfterBoss, '印だけ消え残った').toBeUndefined();
		expect(after.lines, '基本のセリフまで消えた').toEqual(before.lines);
		expect(after.mark, '基本の印まで消えた').toEqual(before.mark);
	});

	test('⑥ 版を持つ全エントリは、無編集の往復で1バイトも変わらない', () => {
		// エディタの読み書きは `readEntryVariants` → `applyEntryVariants` の往復∴
		// 実データ全件でこの往復が恒等写像であることを押さえる（キーの並びまで含めて比べる）。
		const targets = [];
		for (const [ln, layer] of Object.entries(MAP.layers)) {
			for (const [sk, st] of Object.entries(layer.stages ?? {})) {
				for (const src of ['signData', 'npcData']) {
					for (const [pos, v] of Object.entries(st[src] ?? {})) {
						if (!v || typeof v !== 'object') continue;
						// 版の在り処は `linesAfterBoss` / `markAfterBoss` の2つだけ（キュー25 で
						// 旧 `linesAfter` を畳んだ＝取り残しの検知は check-dialog-integrity ⑥ の仕事）。
						if (!v.linesAfterBoss && !v.markAfterBoss) continue;
						targets.push({ where: `${ln}/${sk}/${src}/${pos}`, entry: v });
					}
				}
			}
		}
		// 13 → 14（2026-09-15＝エディタで「諦めた老人」に U 撃破後の版を1件足した）
		// → 16（同日＝寄道の踏破で語りが変わる看板2枚＝淵の伝承碑 V／湖の岩の標 X）
		// → 21（2026-09-17・実行キュー17-3＝帯2の流し込み＝新設「砂漠の神殿の石碑」1件＋
		//   道具の版（item:bomb/item:ladder）を足した4件＝爆ぜた岩の跡・塩の池の石碑・
		//   石切場の石碑・陥没の砂原の石碑）。
		// → 25（2026-09-17・実行キュー17-4＝帯3の流し込み＝道具の版（item:bow/item:boomerang×2/
		//   item:ladder）を足した4件＝湖畔の的・草原の小池の立札・湖渡りの橋の立札・湖の 飛び石。
		//   「水の迷宮の石碑」は元から linesAfterBoss.J を持つ∴markAfterBoss.J を足しても数は増えない）。
		// → 32（2026-09-17・実行キュー17-5＝帯4の流し込み＝新設2件（灰の 落とし穴 item:ladder／
		//   石送りの間の 書き置き item:flute）＋道具の版を足した4件（消えた かがり火 item:candle・
		//   溶岩の 手向け item:bomb・岩棚の石碑 item:bomb・狼煙台の石碑 item:candle）＋
		//   markAfterBoss.A を新たに持った「炎の神殿の入口」1件。
		//   「石碑」（field 12,2）と「ピンクあたま」は元から linesAfterBoss を持つ∴数は増えない）。
		// → 37（2026-09-19・実行キュー17-6＝帯5の流し込み＝新設1件（鍵番の 書き置き item:flute）＋
		//   道具の版を足した3件（崖の道標 item:bomb・古びた立て札 item:candle・森の道標 item:ladder）＋
		//   markAfterBoss.O を新たに持った「森の聖域・入口の石碑」1件。
		//   「森の聖域の石碑」（field 2,4）は元から linesAfterBoss.O を持つ∴数は増えない）。
		// → 36（2026-09-19・17-7 の後追い＝D5 入口を 15,4 へ移した番で、版（linesAfterBoss.L ＋
		//   markAfterBoss.L）を持っていた「氷の廃墟の石碑」（field 13,5 (7,6)）を削除した＝−1。
		//   受け皿の賢者エルン（field 13,5 (4,5)）は元から linesAfterBoss.after を持つ∴増えない）。
		// → 39（2026-09-19・実行キュー17-8a＝帯7前半（沼）の流し込み＝道具の版を足した3件
		//   （沼の 祭壇跡 item:flute・潮の祭壇の石碑 item:flute・沼の 飛び石 item:ladder）。
		//   「崩れた門柱」に足したのは静的な mark ∴版の数は増えない）。
		// この数は「増えたことに気づくため」の目印∴増やすときは PLAN の記述も一緒に直す。
		expect(targets.length, '版を持つエントリの数が変わった（PLAN の記述も直す）').toBe(39);
		for (const t of targets) {
			const clone = JSON.parse(JSON.stringify(t.entry));
			applyEntryVariants(clone, readEntryVariants(clone, OPTIONS));
			expect(JSON.stringify(clone), `${t.where} が往復で変わった`).toBe(JSON.stringify(t.entry));
		}
	});

	// ── 実ゲーム側（`ps_defeated` と優先順の突き合わせ）────────────────────
	// エディタの並びは `game/ui.js pickDialogVariant` の写し∴**実挙動で裏を取る**
	// （写しがズレたらここが赤くなる＝規則を2箇所に書かない代わりの関門）。
	async function talkToSage(page, defeated, extra = {}) {
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: SAGE.stage,
			row: String(SAGE.rc[0]), col: String(SAGE.rc[1] + 1), ...extra,
		});
		if (defeated.length) p.set('ps_defeated', defeated.join(','));
		await page.goto(`${GAME_URL}?${p.toString()}`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.setHeroDir('left'));
		await page.evaluate(() => window.__game.swordAttack());
		await expect(page.locator('#dialog-overlay')).toBeVisible();
	}

	test('⑦ ps_defeated で実ゲームの版が切り替わる（並び＝実ゲームの優先順）', async ({ page }) => {
		const entry = entryOf(SAGE.stage, SAGE.pos);
		const keys  = OPTIONS.filter((o) => entry.linesAfterBoss?.[o.key] && o.key !== 'default').map((o) => o.key);
		expect(keys.length, '老賢者のボス別の版が減った').toBeGreaterThanOrEqual(8);

		// 1体も倒していない＝基本のセリフ
		await talkToSage(page, []);
		await expect(page.locator('#dialog-text')).toContainText(entry.lines[0]);

		// 隣り合う2つを倒すと、**エディタの並びで後ろにある版**が出る（＝優先順の写しが正しい）
		for (let i = 0; i + 1 < keys.length; i++) {
			const [a, b] = [keys[i], keys[i + 1]];
			await talkToSage(page, [a, b]);
			await expect(page.locator('#dialog-text'), `${a}+${b} で ${b} の版が出ない`)
				.toContainText(entry.linesAfterBoss[b][0]);
		}
	});

	test('⑧ タロは欠片の版が上・G の版が下＝並びのとおり G が勝つ', async ({ page }) => {
		// タロは `linesAfterBoss.after`（欠片1つ以上）と `linesAfterBoss.G` の両方を持つ相手。
		// キュー25 で `after` も同じキーの列に住む∴**勝つのは下にある版**＝実データの並び
		// （`after` → `default` → `G` …）から期待値を導く（並びを手書きしない）。
		const taro = entryOf(TARO.stage, TARO.pos);
		const taroKeys = Object.keys(taro.linesAfterBoss);
		expect(taroKeys.indexOf('after'), 'タロの `after` が `G` より下にある＝期待値が逆になる')
			.toBeLessThan(taroKeys.indexOf('G'));
		const talkToTaro = async (defeated, triforce) => {
			const p = new URLSearchParams({
				fromEditor: '1', layer: 'field', stage: TARO.stage, row: '3', col: '4',
				ps_triforce: String(triforce),
			});
			if (defeated.length) p.set('ps_defeated', defeated.join(','));
			await page.goto(`${GAME_URL}?${p.toString()}`);
			await waitForBoard(page);
			await page.evaluate(() => window.__game.setHeroDir('right'));
			await page.evaluate(() => window.__game.swordAttack());
			await expect(page.locator('#dialog-overlay')).toBeVisible();
		};

		// 欠片だけ＝`linesAfterBoss.after`
		await talkToTaro([], 1);
		await expect(page.locator('#dialog-text')).toContainText(taro.linesAfterBoss.after[0]);
		// 欠片＋ゴーレム撃破＝`linesAfterBoss.G` が勝つ
		await talkToTaro(['G'], 1);
		await expect(page.locator('#dialog-text')).toContainText(taro.linesAfterBoss.G[0]);
	});

	test('⑨ プレビュー設定の「撃破済みボス」＝実マップから導出し、URL に載る', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		// ⚠️ 期待値は `bossVariantOptions`（＝寄道も含む全ボス）から作る＝版の一覧（`OPTIONS`）と
		//    同じ導出・同じ並び（2026-09-15 以降は寄道も版を持てる）。
		const bosses = bossVariantOptions(MAP);

		await gotoEditorWithMap(page);
		// 選択肢は2段階で建つ（起動時＝マップ無し → 読み込みで作り直し）∴最終の数で待つ。
		await page.waitForFunction((want) => {
			const sel = document.getElementById('ps-defeated');
			return !!sel && sel.options.length === want;
		}, bosses.length + 1);
		const values = await page.$eval('#ps-defeated', (el) => [...el.options].map((o) => o.value));
		expect(values, '撃破済みボスの選択肢が実マップのボスと違う').toEqual(['', ...bosses.map((b) => b.key)]);

		await page.click('#btn-preview');
		await expect(page.locator('#preview-settings-overlay')).not.toHaveClass(/hidden/);
		// 進行地点を選ぶと「その地点へ着いた時点」の撃破済みボスが埋まる
		// （D5 氷の廃墟へ着いた時点＝D1..D6 の5体を倒し、D5 の L はまだ）。
		await page.selectOption('#ps-progress', 'dungeon_5:min');
		await expect(page.locator('#ps-defeated'), '進行地点を選んでも撃破済みボスが埋まらない').toHaveValue('O');

		// 選ぶのは「最も後に倒した1体」＝それ以前の必須ダンジョンのボスは導出して載る
		await page.selectOption('#ps-defeated', 'L');
		await page.click('#ps-btn-start');
		await page.waitForFunction(() => document.getElementById('preview-frame')?.src.includes('ps_defeated='));
		const src = await page.$eval('#preview-frame', (el) => el.src);
		expect(decodeURIComponent(new URL(src).searchParams.get('ps_defeated')))
			.toBe('G,N,J,A,O,L');
		expect(errors).toEqual([]);
	});

	test('⑪ 寄道の版を持たない相手では、寄道を倒しても本編の版が残る', async ({ page }) => {
		// 2026-09-15 の実害＝旧規則は「最も後に倒した1体」で版を絞ったので、本編を8体倒した後に
		// 寄道の魔将／魔王を倒すと台詞が**基本（序盤）へ巻き戻った**。新規則は版ごとに条件を見る
		// ∴寄道の版を持たない相手では「その上でヒットした本編の版」が残る＝巻き戻らない。
		const entry = entryOf(SAGE.stage, SAGE.pos);
		const main  = OPTIONS.filter((o) => o.kind === 'boss' && !o.optional).map((o) => o.key);
		const side  = OPTIONS.filter((o) => o.kind === 'boss' && o.optional).map((o) => o.key);
		expect(side.length, '寄道のボスが1体も無い＝この検査は空振りしている').toBeGreaterThan(0);
		// 老賢者が寄道の版を持ってしまったらこの検査は別のものを測る（そのときは相手を替える）。
		for (const k of side) {
			expect(entry.linesAfterBoss?.[k], `老賢者が寄道 ${k} の版を持った＝別の相手で測り直す`).toBeUndefined();
		}

		// ⚠️ 本編の最後は暗黒の塔の `Z`＝老賢者は版を持たない（終幕）∴**版を持つ最後**を採り、
		//    そこまでの撃破状態も導出する（`main` を全部倒すと最後は `Z`＝基本の台詞に戻る＝
		//    この検査が測りたいものと別の理由で赤くなる）。
		const owned = main.filter((k) => entry.linesAfterBoss?.[k]);
		const last  = owned[owned.length - 1];
		const upTo  = bossesDefeatedUpTo(MAP, last);
		await talkToSage(page, upTo);
		await expect(page.locator('#dialog-text')).toContainText(entry.linesAfterBoss[last][0]);
		// 寄道を全部足しても同じ版のまま
		await talkToSage(page, [...upTo, ...side]);
		await expect(page.locator('#dialog-text'), '寄道を倒すと本編の版が消える')
			.toContainText(entry.linesAfterBoss[last][0]);
	});

	// ── 寄道（optional）の踏破で台詞が変わる（2026-09-15 ユーザー決定）──────────
	// 🔴 当て所＝**寄道クリアでセリフが変わる**。寄道は `linesAfterBoss` に同じ形で入る
	//    （キーを分けない）∴ここが赤くなるのは「寄道のボスがヒット判定から漏れた」とき。
	// 相手は実データの看板2枚（進行の版を持たない＝本編の版を隠す心配が無い場所）。
	const SIDE_SIGNS = [
		{ boss: 'V', stage: '6,0',  sign: '8,3', row: 8, col: 4 },   // 淵の伝承碑（魔将の巣を語る）
		{ boss: 'X', stage: '9,10', sign: '3,6', row: 3, col: 7 },   // 湖の岩の標（魔王の岩牢を語る）
	];

	// ⚠️ 本文は**1行1ページ**＝`#dialog-text` には1行しか出ていない∴切り替わる行が最後のページに
	//    あるときは送りながら全ページを集める（先頭だけ見ると変化を見落とす）。
	async function readSign(page, s, defeated) {
		const p = new URLSearchParams({
			fromEditor: '1', layer: 'field', stage: s.stage,
			row: String(s.row), col: String(s.col),
		});
		if (defeated.length) p.set('ps_defeated', defeated.join(','));
		await page.goto(`${GAME_URL}?${p.toString()}`);
		await waitForBoard(page);
		await page.evaluate(() => window.__game.setHeroDir('left'));
		await page.evaluate(() => window.__game.swordAttack());
		await expect(page.locator('#dialog-overlay')).toBeVisible();
		const pages = [];
		for (let i = 0; i < 12; i++) {
			if (!(await page.locator('#dialog-overlay').isVisible())) break;
			pages.push((await page.locator('#dialog-text').textContent())?.trim() ?? '');
			await page.keyboard.press('z');
			await page.waitForTimeout(120);
		}
		return pages;
	}

	for (const s of SIDE_SIGNS) {
		test(`⑫ 寄道 ${s.boss} を倒すと看板の台詞が切り替わる（実データ）`, async ({ page }) => {
			const entry = MAP.layers.field.stages[s.stage].signData[s.sign];
			const after = entry.linesAfterBoss?.[s.boss];
			expect(after, `${s.stage} (${s.sign}) が寄道 ${s.boss} の版を持っていない`).toBeTruthy();
			const opt = OPTIONS.find((o) => o.key === s.boss);
			expect(opt?.optional, `${s.boss} が寄道として並んでいない`).toBe(true);
			// 版の本文は基本と**別物**でなければ切り替わりを測れない（丸ごと同じ＝空振り）。
			const changed = after[after.length - 1];
			expect(entry.lines, '版の本文が基本と同じ＝この検査は空振りしている').not.toContain(changed);

			const base = entry.lines[entry.lines.length - 1];

			// 倒していない＝基本の本文（未討伐の言い伝えが残る）
			expect(await readSign(page, s, []), '基本の本文が出ない').toContain(base);

			// 本編を全部倒しても寄道の版は出ない（寄道は本編と別の条件）
			const main = OPTIONS.filter((o) => o.kind === 'boss' && !o.optional).map((o) => o.key);
			expect(await readSign(page, s, main), '本編の撃破で寄道の版が出た').toContain(base);

			// 寄道を倒すと切り替わる（本編の進行はどこでも良い＝寄道だけを見る）
			expect(await readSign(page, s, [s.boss]), '寄道を倒しても台詞が変わらない').toContain(changed);
			expect(await readSign(page, s, [...main, s.boss]), '本編を進めると寄道の版が消える').toContain(changed);
		});
	}

	// ── 版の並べ替え（2026-09-15 ユーザー指示「エディタの版は上下の順番を変更できるUIも必要」）──
	// 🔴 当て所＝**画面で組んだ上下がデータのキーの順として保存される**（＝実ゲームの優先順）。
	//    ここが赤くなるのは「並びを勝手に整え直した」とき（旧実装は `variantOptions` の順で
	//    `sort()` していた＝▲▼を押しても描き直しで元に戻る）。
	test('⑬ ▲▼で版を並べ替えると、その順が linesAfterBoss のキーの順として保存される', async ({ page }) => {
		page.on('dialog', (d) => d.dismiss());
		await gotoEditorWithMap(page);
		await openStageInEditor(page, SAGE.stage);
		const item   = npcItem(page, SAGE.pos);
		const before = Object.keys(entryOf(SAGE.stage, SAGE.pos).linesAfterBoss);
		expect(before.length, '老賢者の版が減った＝別の相手で測り直す').toBeGreaterThan(2);

		// 先頭（`default`）を1つ下へ＝先頭2つが入れ替わる
		await variantBlock(item, 0).locator('[data-vf="down"]').click();
		const conds = await item.locator('[data-vf="cond"]').evaluateAll((els) => els.map((e) => e.value));
		const want  = [before[1], before[0], ...before.slice(2)];
		expect(conds, '画面の並びが入れ替わっていない（描き直しで元に戻った）').toEqual(want);

		const saved = await savedMapData(page);
		const after = saved.layers.field.stages[SAGE.stage].npcData[SAGE.pos];
		expect(Object.keys(after.linesAfterBoss), '保存されたキーの順が画面の並びと違う').toEqual(want);
		// 本文は動かした版に付いて回る（順だけが変わる＝中身を取り違えない）
		for (const k of want) {
			expect(after.linesAfterBoss[k], `${k} の本文が入れ替わった`)
				.toEqual(entryOf(SAGE.stage, SAGE.pos).linesAfterBoss[k]);
		}

		// 戻すと元のキーの順に戻る（往復で差分が残らない）
		await variantBlock(item, 1).locator('[data-vf="up"]').click();
		const saved2 = await savedMapData(page);
		expect(Object.keys(saved2.layers.field.stages[SAGE.stage].npcData[SAGE.pos].linesAfterBoss)).toEqual(before);
	});

	test('⑬-2 星の欠片の版も他の版と同じように動かせる（キュー25）', async ({ page }) => {
		// 2026-09-16（キュー25）＝`after` は `linesAfterBoss` の予約キーになった∴**位置を持つ**。
		// 🔴 当て所＝旧実装の「`after` は動かせない（▲▼を殺す・常に先頭）」が戻ったら赤くなる。
		page.on('dialog', (d) => d.dismiss());
		await gotoEditorWithMap(page);
		await openStageInEditor(page, TARO.stage);
		const item   = npcItem(page, TARO.pos);
		const before = Object.keys(entryOf(TARO.stage, TARO.pos).linesAfterBoss);
		expect(before[0], 'タロの先頭が `after` でない＝別の相手で測り直す').toBe('after');
		expect(before.length, 'タロの版が減った＝別の相手で測り直す').toBeGreaterThan(2);

		// 先頭＝▲だけが押せない（`after` だからではなく**先頭だから**）／▼は押せる
		await expect(variantBlock(item, 0).locator('[data-vf="up"]')).toBeDisabled();
		await expect(variantBlock(item, 0).locator('[data-vf="down"]'), '`after` の▼が殺されている').toBeEnabled();
		// その直下の版＝`after` の上へ行ける（▲が押せる）
		await expect(variantBlock(item, 1).locator('[data-vf="up"]'), '`after` の上へ行けない').toBeEnabled();
		// 一番下の版＝▼は押せない
		await expect(variantBlock(item, before.length - 1).locator('[data-vf="down"]')).toBeDisabled();

		// `after` を1つ下へ＝画面の並びが入れ替わり、キーの順として保存される
		await variantBlock(item, 0).locator('[data-vf="down"]').click();
		const want  = [before[1], before[0], ...before.slice(2)];
		const conds = await item.locator('[data-vf="cond"]').evaluateAll((els) => els.map((e) => e.value));
		expect(conds, '画面の並びが入れ替わっていない（描き直しで元に戻った）').toEqual(want);
		const saved = await savedMapData(page);
		const after = saved.layers.field.stages[TARO.stage].npcData[TARO.pos];
		expect(Object.keys(after.linesAfterBoss), '`after` を動かした順が保存されない').toEqual(want);
		expect(after.linesAfterBoss.after, '`after` の本文が入れ替わった')
			.toEqual(entryOf(TARO.stage, TARO.pos).linesAfterBoss.after);
		expect(after.linesAfter, '旧形式の linesAfter を書き戻した').toBeUndefined();

		// 戻すと元のキーの順に戻る（往復で差分が残らない）
		await variantBlock(item, 1).locator('[data-vf="up"]').click();
		const saved2 = await savedMapData(page);
		expect(Object.keys(saved2.layers.field.stages[TARO.stage].npcData[TARO.pos].linesAfterBoss)).toEqual(before);
	});

	test('⑭ 版の並びはエントリのキーの順そのもの（並べ替えない・印だけの版も位置を保つ）', () => {
		// 純関数の検査＝実マップを細工せずに「進行順と違う並び」を測れる唯一の口。
		// （実データは全16エントリが進行順∴実ゲームでは差が出ない＝ここが並びの番人になる）
		const entry = {
			lines: ['基本'],
			// `after`（星の欠片）を**先頭でない位置**に置く＝キュー25 で予約キーになった∴位置を持つ。
			linesAfterBoss: { U: ['U の版'], after: ['欠片'], default: ['default の版'], G: ['G の版'] },
			markAfterBoss:  { U: { stage: '9,9', label: '印', kind: 'cave', layer: 'field' } },
		};
		const got = readEntryVariants(entry, OPTIONS).map((v) => v.key);
		// キーの順のまま（進行順に直さない・`after` を先頭へ引き上げない）
		expect(got, 'キーの順を並べ替えた（進行順に直した／`after` を先頭へ動かした）')
			.toEqual(['U', 'after', 'default', 'G']);

		// 印だけを持つ版（本文が無い）も自分の位置に戻る＝末尾へ追い出さない
		const markOnly = {
			linesAfterBoss: { G: ['G の版'], U: ['U の版'] },
			markAfterBoss:  { G: { stage: '9,9' }, N: { stage: '9,9' }, U: { stage: '9,9' } },
		};
		expect(readEntryVariants(markOnly, OPTIONS).map((v) => v.key), '印だけの版が位置を失った')
			.toEqual(['G', 'N', 'U']);

		// 書き戻しは渡した順でキーを書く＝画面の並びがそのまま保存される
		// （`after` も同じ列に書く＝旧 `linesAfter` を復活させない＝キュー25 の ⛔）
		const out = {};
		applyEntryVariants(out, [
			{ key: 'U', lines: ['U'] }, { key: 'after', lines: ['欠片'] },
			{ key: 'default', lines: ['d'] }, { key: 'G', lines: ['G'] },
		]);
		expect(Object.keys(out.linesAfterBoss), '書き戻しがキーの順を勝手に整えた')
			.toEqual(['U', 'after', 'default', 'G']);
		expect(out.linesAfter, '書き戻しが旧形式の linesAfter を作った').toBeUndefined();
		// 星の欠片の版は印を持てない＝渡しても `markAfterBoss.after` を作らない
		const out2 = {};
		applyEntryVariants(out2, [{ key: 'after', lines: ['欠片'], mark: { stage: '9,9', layer: 'field' } }]);
		expect(out2.markAfterBoss, '`markAfterBoss.after` を作った（印を持てない版）').toBeUndefined();
	});

	test('⑮ 撃破と欠片は独立に効く（ハナ＝欠片の版がボスの版の下に居る実データ）', async ({ page }) => {
		// キュー25 が生まれた場面そのもの（ユーザー指摘 2026-09-15）＝ボスを倒しても欠片は
		// その場に落ちるだけ（`game/boss.js`＝拾うまで `triforceCount` は増えない）∴
		// 「倒した直後」と「拾った後」で別の台詞を書ける必要がある。
		// 🔴 当て所＝`after` が常に一番上（一番弱い）に戻ると、`ps_triforce=1` でも G の版に
		//    負けて欠片の台詞が出なくなる＝ここが赤くなる。
		const hana = entryOf(HANA.stage, HANA.pos);
		const keys = Object.keys(hana.linesAfterBoss ?? {});
		// 期待値は実データの並びから導く（並びを手書きしない）＝`after` が `G` の**下**に居ること。
		expect(keys.indexOf('G'), 'ハナが G の版を持っていない＝別の相手で測り直す').toBeGreaterThanOrEqual(0);
		expect(keys.indexOf('G'), 'ハナの `after` が `G` の上に居る＝この検査は空振りする')
			.toBeLessThan(keys.indexOf('after'));
		expect(hana.linesAfterBoss.G[0], '2つの版の1行目が同じ＝切り替わりを測れない')
			.not.toBe(hana.linesAfterBoss.after[0]);

		const talkToHana = async (defeated, triforce) => {
			const p = new URLSearchParams({
				fromEditor: '1', layer: 'field', stage: HANA.stage,
				row: String(HANA.rc[0]), col: String(HANA.rc[1]), ps_triforce: String(triforce),
			});
			if (defeated.length) p.set('ps_defeated', defeated.join(','));
			await page.goto(`${GAME_URL}?${p.toString()}`);
			await waitForBoard(page);
			await page.evaluate(() => window.__game.setHeroDir('right'));
			await page.evaluate(() => window.__game.swordAttack());
			await expect(page.locator('#dialog-overlay')).toBeVisible();
		};

		// ① 何も倒していない＝基本のセリフ
		await talkToHana([], 0);
		await expect(page.locator('#dialog-text')).toContainText(hana.lines[0]);
		// ② 倒したが欠片は未回収＝ボスの版（奥に光が残っていると教える）
		await talkToHana(['G'], 0);
		await expect(page.locator('#dialog-text'), '撃破直後にボスの版が出ない')
			.toContainText(hana.linesAfterBoss.G[0]);
		// ③ 欠片を回収済み＝下に居る欠片の版が勝つ
		await talkToHana(['G'], 1);
		await expect(page.locator('#dialog-text'), '欠片を拾っても版が切り替わらない（`after` が上に戻った？）')
			.toContainText(hana.linesAfterBoss.after[0]);
	});

	// ── 道具の所持を条件にする版（実行キュー26・2026-09-17 ユーザー指示）────────
	// 🔴 当て所＝**「その道具を手にした後」でセリフ／印を切り替えられる**。優先順の規則は
	//    ボスの版とまったく同じ（1本のキーの列・下ほど勝つ）∴規則を別に足していないことも見る。
	//    ⑱は**2状態**で測る（持たない／持つ）＝片方だけだと「常にその版が出る」実装でも緑になる。
	test('⑯ 道具の版は SUB_ITEM_KEYS から導出され、ボスの版より下・印を持てる', () => {
		const items = itemVariantOptions();
		expect(items.map((o) => o.itemId), '道具の一覧が SUB_ITEM_KEYS と違う（手書きの表を作った？）')
			.toEqual([...SUB_ITEM_KEYS]);
		for (const o of items) {
			expect(o.key).toBe(`item:${o.itemId}`);
			expect(itemIdOfVariantKey(o.key), 'キー→道具 id の読み戻しが合わない').toBe(o.itemId);
			expect(o.label, '表示名に道具の名前が入っていない').toContain(ITEM_META[o.itemId].name);
		}
		// キーの名前空間＝ボスのタイル文字1字・予約キーと衝突しない
		expect(itemIdOfVariantKey('G'), 'ボスのタイル文字を道具のキーと読んだ').toBeNull();
		expect(itemIdOfVariantKey('after')).toBeNull();
		expect(itemIdOfVariantKey('default')).toBeNull();

		// 選択肢の並び＝道具の版は**ボスの版より下**（新しく足したとき既定で強い側に入る）
		const keys      = OPTIONS.map((o) => o.key);
		const lastBoss  = Math.max(...OPTIONS.filter((o) => o.kind === VARIANT_KIND.BOSS).map((o) => keys.indexOf(o.key)));
		const firstItem = keys.indexOf(itemVariantKey(SUB_ITEM_KEYS[0]));
		expect(firstItem, '道具の版が選択肢に無い').toBeGreaterThan(-1);
		expect(firstItem, '道具の版がボスの版より上に並んだ（既定の強さが逆）').toBeGreaterThan(lastBoss);
		// 印を持てる（道具を手にしたら行き先を教える表現に使う）
		for (const o of OPTIONS.filter((o) => o.kind === VARIANT_KIND.ITEM)) {
			expect(o.supportsMark, '道具の版が印を持てない').toBe(true);
		}

		// 読み戻しは**位置を保つ**＝道具の版もキーの順そのまま（進行順に直さない）
		const entry = {
			linesAfterBoss: { [itemVariantKey('bomb')]: ['爆弾'], G: ['G'], 'item:hammer': ['未知'] },
		};
		const got = readEntryVariants(entry, OPTIONS);
		expect(got.map((v) => v.key)).toEqual(['item:bomb', 'G', 'item:hammer']);
		// 選択肢に無い道具（打ち間違い・改名）も落とさず「不明な道具」として持つ
		expect(got[2].kind, '未知の道具のキーをボスの版として読んだ').toBe(VARIANT_KIND.ITEM);
		expect(got[2].label).toContain('不明な道具');
	});

	test('⑯-2 所持の判定は道具ごとの置き場を吸収する（はしごは subItems に入らない）', () => {
		// `giveSubItem` の `type:'passive'` ∴はしごは `player.hasLadder`＝`subItems` だけ見る
		// 実装だと**はしごの版が永久にヒットしない**（この行が歯）。
		expect(ownsItem({ subItems: { bomb: { count: 3 } } }, 'bomb')).toBe(true);
		expect(ownsItem({ subItems: {} }, 'bomb')).toBe(false);
		expect(ownsItem({ hasLadder: true, subItems: {} }, 'ladder'), 'はしごの所持を見ていない').toBe(true);
		expect(ownsItem({ hasLadder: false, subItems: {} }, 'ladder')).toBe(false);
		// 数は見ない＝撃ち切っても「手に入れた」は真（看板の文が残弾で行き来しない）
		expect(ownsItem({ subItems: { bomb: { count: 0 } } }, 'bomb'), '残弾 0 で未所持に落ちた').toBe(true);
		expect(ownsItem(null, 'bomb')).toBe(false);
		expect(ownsItem({ subItems: {} }, '')).toBe(false);
	});

	test('⑰ エディタで道具の版を足すと linesAfterBoss["item:bomb"] に入る（往復も不変）', async ({ page }) => {
		page.on('dialog', (d) => d.dismiss());
		const KEY = itemVariantKey('bomb');
		await gotoEditorWithMap(page);
		await openStageInEditor(page, STELE.stage);
		const item   = npcItem(page, STELE.pos);
		const before = entryOf(STELE.stage, STELE.pos);

		await item.locator('.btn-add-variant').click();
		// 足した版を掴む＝元から在るキー以外の条件（並びに挿し込まれる∴番号で掴まない）
		const conds0 = await item.locator('[data-vf="cond"]').evaluateAll((els) => els.map((e) => e.value));
		const addKey = conds0.find((k) => !readEntryVariants(before, OPTIONS).some((v) => v.key === k));
		const added  = variantBlock(item, conds0.indexOf(addKey));

		// 条件の選択肢に道具の版が並んでいる（無ければ選べない＝エディタから書けない）
		const optValues = await added.locator('[data-vf="cond"] option').evaluateAll((els) => els.map((e) => e.value));
		expect(optValues, '条件の選択肢に道具の版が無い').toContain(KEY);
		await added.locator('[data-vf="cond"]').selectOption(KEY);
		await added.locator('[data-vf="lines"]').fill('今の荷なら砕けよう。');
		await added.locator('[data-vf="markStage"]').fill('9,9');
		await added.locator('[data-vf="markLabel"]').fill('崩せる岩');
		await added.locator('[data-vf="markKind"]').selectOption('cave');
		await added.locator('[data-vf="markLayer"]').fill('field');   // 空欄＝その会話の層（既定）

		const saved = await savedMapData(page);
		const after = saved.layers.field.stages[STELE.stage].npcData[STELE.pos];
		expect(after.linesAfterBoss[KEY], '道具の版の本文が入らない').toEqual(['今の荷なら砕けよう。']);
		expect(after.markAfterBoss[KEY], '道具の版の印が入らない')
			.toEqual({ stage: '9,9', label: '崩せる岩', kind: 'cave', layer: 'field' });
		expect(after.lines, '基本のセリフまで変わった').toEqual(before.lines);

		// 読み書きの往復で1バイトも変わらない（ボスの版と同じ扱い＝⑥と同じ不変条件）
		const clone = JSON.parse(JSON.stringify(after));
		applyEntryVariants(clone, readEntryVariants(clone, OPTIONS));
		expect(JSON.stringify(clone), '道具の版が往復で変わった').toBe(JSON.stringify(after));
	});

	// 実ゲームでの2状態＋優先順＝実データにまだ道具の版が1件も無い（帯2＝キュー17-3 で入る）∴
	// **マップ応答を差し替えて**測る（`fromEditor=1` は常に実ファイルを取る＝localStorage では効かない）。
	async function routeSageVariants(page, lab) {
		await page.route('**/work/blade-of-lumia.json', async (route) => {
			const json = await (await route.fetch()).json();
			const e = json.layers.field.stages[SAGE.stage].npcData[SAGE.pos];
			e.linesAfterBoss = lab;
			delete e.markAfterBoss;
			await route.fulfill({ json });
		});
	}

	test('⑱ 実ゲームで「持たない」と「持つ」で本文が変わり、優先順はボスの版と同じ規則', async ({ page }) => {
		const base   = entryOf(SAGE.stage, SAGE.pos).lines[0];
		const BOMB   = itemVariantKey('bomb');
		const LADDER = itemVariantKey('ladder');
		const T = { bomb: '火薬の版', ladder: 'はしごの版', g: 'ゴーレムの版' };

		// ① 道具の版がボスの版より**下**（＝強い）
		await routeSageVariants(page, { G: [T.g], [BOMB]: [T.bomb], [LADDER]: [T.ladder] });
		// 持たない＝基本のセリフ（ここが緑のままでないと②は「常に出る」実装でも通る）
		await talkToSage(page, []);
		await expect(page.locator('#dialog-text'), '道具を持たないのに道具の版が出た').toContainText(base);
		// 持つ＝道具の版
		await talkToSage(page, [], { ps_bomb: '1' });
		await expect(page.locator('#dialog-text'), '爆弾を手にしても版が切り替わらない').toContainText(T.bomb);
		// はしご＝`player.hasLadder`（`subItems` に入らない道具）でも同じように効く
		await talkToSage(page, [], { ps_ladder: '1' });
		await expect(page.locator('#dialog-text'), 'はしごの所持で版が切り替わらない（subItems だけ見ている？）')
			.toContainText(T.ladder);
		// 撃破と所持は独立＝両方ヒットしたら**下にある道具の版**が勝つ
		await talkToSage(page, ['G'], { ps_bomb: '1' });
		await expect(page.locator('#dialog-text'), '下にある道具の版が勝たない').toContainText(T.bomb);
		// 倒しただけ＝ボスの版（道具の版が常に勝つ実装なら赤）
		await talkToSage(page, ['G']);
		await expect(page.locator('#dialog-text'), '道具を持たないのに道具の版が勝った').toContainText(T.g);

		// ② 並びを逆に組む＝道具の版が**上**なら、両方ヒットしてもボスの版が勝つ
		await page.unrouteAll();
		await routeSageVariants(page, { [BOMB]: [T.bomb], G: [T.g] });
		await talkToSage(page, ['G'], { ps_bomb: '1' });
		await expect(page.locator('#dialog-text'), '上に置いた道具の版が勝った（優先順の規則が別になっている）')
			.toContainText(T.g);
		await talkToSage(page, [], { ps_bomb: '1' });
		await expect(page.locator('#dialog-text')).toContainText(T.bomb);
	});

	test('⑩ ps_defeated は2つのプレビュー経路とゲーム側に揃っている（静的検査）', () => {
		const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
		// プレビュー設定は2経路で読まれる（[[blade-preview-settings-duplicated]]）＝両方に要る。
		for (const rel of ['../editor/editor.js', '../editor/editor-io.js']) {
			expect(read(rel), `${rel} が ps-defeated を読んでいない`)
				.toMatch(/getElementById\('ps-defeated'\)/);
		}
		expect(read('../editor/index.html'), '撃破済みボスの欄が無い').toMatch(/<select id="ps-defeated"/);
		expect(read('../editor/editor-io.js'), 'URL に ps_defeated を載せていない').toContain('ps_defeated=');
		expect(read('../game/game.js'), 'ゲーム側に ps_defeated の受け口が無い').toContain("params.get('ps_defeated')");
		// 優先順の並びは会話ごとのキーの順＝**ゲームも `readEntryVariants()` から読む**
		// （ここを `variantOptions()` の順で回す実装に戻すと、▲▼で組んだ優先順が実ゲームで無視
		//  される＝実データが全部進行順の今は他のどのテストでも赤くならない∴静的に縛る）。
		expect(read('../game/ui.js'), 'ゲームが版の並びをデータから読んでいない')
			.toMatch(/readEntryVariants\(data, variantOptions\(map\)\)/);
	});
});
