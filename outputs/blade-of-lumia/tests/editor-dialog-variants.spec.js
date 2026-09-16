// ── tests/editor-dialog-variants.spec.js ── 実行キュー23 ─────────────────
// 不変条件：**進行で切り替わるセリフ／目的地を、エディタだけで読み書きできる**。
// これが無いと、キュー17 の残り7帯は「1行直すために移行スクリプトを1本書く」ことになる。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 実データが持っている版が画面に出ない／並びが実ゲームの優先順と違う
//      （並び＝**会話1件ごとのキーの順**＝`readEntryVariants()` が読み、`game/ui.js
//       pickDialogVariant` が同じ順で解く。∴画面で▲▼で組んだ順が保存される＝⑬⑬-2⑭）
//   ⑬⑬-2⑭ 版を並べ替えられない／並べ替えても保存されない／読み戻しで勝手に整えられる
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
import { variantOptions, bossVariantOptions, readEntryVariants, applyEntryVariants } from '../shared/dialog-variants.js';
import { ENEMY_META } from '../shared/enemies.js';
import { bossesDefeatedUpTo } from '../shared/progression.js';
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

		// `default` の版は印を持てる／`linesAfter` の版は持てない（データの形に置き場が無い）
		const defIdx = expected.findIndex((v) => v.key === 'default');
		await expect(variantBlock(item, defIdx).locator('[data-vf="markStage"]')).toHaveCount(1);
		const taro = npcItem(page, TARO.pos);
		const taroVars = readEntryVariants(entryOf(TARO.stage, TARO.pos), OPTIONS);
		const afterIdx = taroVars.findIndex((v) => v.key === 'after');
		expect(afterIdx, 'タロの `linesAfter` が消えた＝別の相手で測り直す').toBeGreaterThanOrEqual(0);
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

	test('⑥ 版を持つ16エントリは、無編集の往復で1バイトも変わらない', () => {
		// エディタの読み書きは `readEntryVariants` → `applyEntryVariants` の往復∴
		// 実データ全件でこの往復が恒等写像であることを押さえる（キーの並びまで含めて比べる）。
		const targets = [];
		for (const [ln, layer] of Object.entries(MAP.layers)) {
			for (const [sk, st] of Object.entries(layer.stages ?? {})) {
				for (const src of ['signData', 'npcData']) {
					for (const [pos, v] of Object.entries(st[src] ?? {})) {
						if (!v || typeof v !== 'object') continue;
						if (v.linesAfter === undefined && !v.linesAfterBoss && !v.markAfterBoss) continue;
						targets.push({ where: `${ln}/${sk}/${src}/${pos}`, entry: v });
					}
				}
			}
		}
		// 13 → 14（2026-09-15＝エディタで「諦めた老人」に U 撃破後の版を1件足した）
		// → 16（同日＝寄道の踏破で語りが変わる看板2枚＝淵の伝承碑 V／湖の岩の標 X）。
		// この数は「増えたことに気づくため」の目印∴増やすときは PLAN の記述も一緒に直す。
		expect(targets.length, '版を持つエントリの数が変わった（PLAN の記述も直す）').toBe(16);
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

	test('⑧ ボスの版は「星の欠片を得た後」の版より先に選ばれる', async ({ page }) => {
		// タロは `linesAfter`（欠片1つ以上）と `linesAfterBoss.G` の両方を持つ＝優先順が出る相手。
		const taro = entryOf(TARO.stage, TARO.pos);
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

		// 欠片だけ＝`linesAfter`
		await talkToTaro([], 1);
		await expect(page.locator('#dialog-text')).toContainText(taro.linesAfter[0]);
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

	test('⑬-2 星の欠片の版は動かせない（データのキーの順に位置を持てない）', async ({ page }) => {
		await gotoEditorWithMap(page);
		await openStageInEditor(page, TARO.stage);
		const item = npcItem(page, TARO.pos);
		const vars = readEntryVariants(entryOf(TARO.stage, TARO.pos), OPTIONS);
		expect(vars[0]?.key, 'タロの先頭が `after` でない＝別の相手で測り直す').toBe('after');

		// `after` の版＝▲▼ともに押せない
		await expect(variantBlock(item, 0).locator('[data-vf="up"]')).toBeDisabled();
		await expect(variantBlock(item, 0).locator('[data-vf="down"]')).toBeDisabled();
		// その直下の版＝`after` の上へは行けない（▲は押せない）／下へは動ける
		await expect(variantBlock(item, 1).locator('[data-vf="up"]')).toBeDisabled();
		await expect(variantBlock(item, 1).locator('[data-vf="down"]')).toBeEnabled();
		// 一番下の版＝▼は押せない
		await expect(variantBlock(item, vars.length - 1).locator('[data-vf="down"]')).toBeDisabled();
	});

	test('⑭ 版の並びはエントリのキーの順そのもの（並べ替えない・印だけの版も位置を保つ）', () => {
		// 純関数の検査＝実マップを細工せずに「進行順と違う並び」を測れる唯一の口。
		// （実データは全16エントリが進行順∴実ゲームでは差が出ない＝ここが並びの番人になる）
		const entry = {
			lines: ['基本'],
			linesAfter: ['欠片'],
			linesAfterBoss: { U: ['U の版'], default: ['default の版'], G: ['G の版'] },
			markAfterBoss:  { U: { stage: '9,9', label: '印', kind: 'cave', layer: 'field' } },
		};
		const got = readEntryVariants(entry, OPTIONS).map((v) => v.key);
		// `after` は単独キー＝位置を持てない∴常に先頭。あとはキーの順のまま（進行順に直さない）
		expect(got, 'キーの順を並べ替えた（進行順に直してしまった）').toEqual(['after', 'U', 'default', 'G']);

		// 印だけを持つ版（本文が無い）も自分の位置に戻る＝末尾へ追い出さない
		const markOnly = {
			linesAfterBoss: { G: ['G の版'], U: ['U の版'] },
			markAfterBoss:  { G: { stage: '9,9' }, N: { stage: '9,9' }, U: { stage: '9,9' } },
		};
		expect(readEntryVariants(markOnly, OPTIONS).map((v) => v.key), '印だけの版が位置を失った')
			.toEqual(['G', 'N', 'U']);

		// 書き戻しは渡した順でキーを書く＝画面の並びがそのまま保存される
		const out = {};
		applyEntryVariants(out, [
			{ key: 'U', lines: ['U'] }, { key: 'default', lines: ['d'] }, { key: 'G', lines: ['G'] },
		]);
		expect(Object.keys(out.linesAfterBoss), '書き戻しがキーの順を勝手に整えた').toEqual(['U', 'default', 'G']);
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
