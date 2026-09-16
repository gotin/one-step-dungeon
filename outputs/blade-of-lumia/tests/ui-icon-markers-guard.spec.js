// ── tests/ui-icon-markers-guard.spec.js ── 実行キュー24 ─────────────────
// 不変条件：**マップデータの本文に「絵がある物の絵文字」が入り込まない**。
// `tests/ui-icons.spec.js` ①③ が「今のデータが正しいか」を見るのに対し、ここは
// **正しい状態が壊れる経路**を塞げているかを見る（＝退行の入口の番人）。
//
// なぜ要るか＝2026-09-09 に `{{key}}` マーカー75件を入れたのに、翌日 `3e71a24`
// （スプライトの作業）で75件とも絵文字へ巻き戻った。原因は「古い localStorage を
// 抱えたエディタから保存した」＝データを直しても入口が開いていれば必ず戻る
// （[[blade-bad-data-fix-five-layers]] の「エディタの入口」と「検査」の層）。
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① エディタが本文の絵文字をそのまま保存する（`buildSaveDataSync` の正規化を外す）
//   ② 無編集の往復でデータが変わる（正規化が本文を書き換える＝差分が読めなくなる）
//   ③ 読み込んだ後にファイルが変わっていても黙って上書きする（＝巻き戻しの瞬間）
//   ④ ファイルと控えが食い違っていても起動時に何も言わない／帯から取り込めない
//   ⑤ 歩き方（`forEachMapText`）が本文の置き場所を1つでも見落とす／🔥 の文脈判定が壊れる
//
// ⚠️ 歩き方は `shared/map-texts.js` の1本＝エディタ・移行スクリプト・`check-dialog-integrity`
//    が同じ関数を使う。∴ここで穴を測っておかないと3つ同時に穴が空く。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	forEachMapText, emojiToIconMarkers, iconKeyForEmoji, iconMarkerBody,
	normalizeMapIconMarkers, findRawIconEmoji, countIconMarkers,
} from '../shared/map-texts.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const EDITOR_URL = '/blade-of-lumia/editor/';

// 本文を1つ選んで絵文字を入れる相手＝**実データから引く**（座標を手書きすると
// マップの作り込みで場所が動いたときに「無いエントリを直した」で緑になる）。
function firstNpcLines() {
	for (const [ln, ld] of Object.entries(MAP.layers)) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [pos, nd] of Object.entries(sd.npcData ?? {})) {
				if (Array.isArray(nd?.lines) && typeof nd.lines[0] === 'string') return { ln, sk, pos };
			}
		}
	}
	throw new Error('lines を持つ npcData が無い＝測る相手が居ない');
}
const TARGET = firstNpcLines();

/** エディタを（必要なら手を入れた）マップで開く。エディタは localStorage からしか復元しない。 */
async function gotoEditorWith(page, map, extra = {}) {
	await page.goto(EDITOR_URL);
	await page.evaluate(({ json, extra }) => {
		localStorage.setItem('bladeOfLumiaMapData', json);
		for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
	}, { json: JSON.stringify(map), extra });
	await page.reload();
	await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
}

async function savedMapData(page) {
	await page.locator('#btn-save').click();
	const raw = await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData'));
	expect(raw, 'エディタが保存していない').toBeTruthy();
	return JSON.parse(raw);
}

const clone = (o) => JSON.parse(JSON.stringify(o));

test.describe('アイコンマーカーの退行を塞ぐ（キュー24）', () => {
	test('① エディタは本文の絵文字を {{key}} マーカーに直して保存する', async ({ page }) => {
		const dirty = clone(MAP);
		const { ln, sk, pos } = TARGET;
		dirty.layers[ln].stages[sk].npcData[pos].lines[0] = 'この⚔と🛡を持て。🔥のかがり火に気をつけろ。';

		await gotoEditorWith(page, dirty);
		const saved = await savedMapData(page);
		const line = saved.layers[ln].stages[sk].npcData[pos].lines[0];
		expect(line, '絵文字がそのまま保存された＝退行の入口が開いている')
			.toBe('この{{sword}}と{{shield}}を持て。{{torch}}のかがり火に気をつけろ。');
		// マップ全体でも絵文字が0件（他の本文を直したついでに壊していない）
		expect(findRawIconEmoji(saved)).toEqual([]);
	});

	test('② 無編集の往復でデータが変わらない（正規化が本文を触らない）', async ({ page }) => {
		await gotoEditorWith(page, MAP);
		const saved = await savedMapData(page);
		expect(saved.layers, '開いて保存しただけでデータが変わった').toEqual(MAP.layers);
	});

	test('③ 読み込み後にファイルが変わっていたら確認してから書く（取消で中止）', async ({ page }) => {
		// 「エディタが同期した時点のファイル」の指紋を**わざと違う値**にする＝
		// 移行スクリプトや git pull でファイルだけが新しくなった状態と同じ。
		// 控えも実ファイルと違えておく（同じなら起動時の照合が指紋を正しい値へ直してしまう）。
		const stale = clone(MAP);
		const { ln, sk, pos } = TARGET;
		stale.layers[ln].stages[sk].npcData[pos].lines[0] = '古い控えの本文';

		const seen = [];
		page.on('dialog', (d) => { seen.push({ type: d.type(), message: d.message() }); d.dismiss(); });

		await gotoEditorWith(page, stale, { bladeOfLumiaMapFileSig: '0-deadbeef' });
		await page.locator('#btn-save').click();
		await expect.poll(() => seen.length, { message: '保存が何も言わずに通った' }).toBeGreaterThanOrEqual(2);

		expect(seen[0].type, 'ファイルの変化を確認していない').toBe('confirm');
		expect(seen[0].message).toContain('変わっています');
		expect(seen[1].message, '取消したのに中止と言わない').toContain('中止');
		// 控えは残る＝編集を落とさない（門はファイルの書き込みだけに置く）
		const raw = await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData'));
		expect(JSON.parse(raw).layers[ln].stages[sk].npcData[pos].lines[0]).toBe('古い控えの本文');
	});

	test('④ 起動時にファイルと控えの食い違いを帯で見せ、帯から取り込める', async ({ page }) => {
		const stale = clone(MAP);
		const { ln, sk, pos } = TARGET;
		stale.layers[ln].stages[sk].npcData[pos].lines[0] = '古い控えの本文';

		await gotoEditorWith(page, stale);
		const banner = page.locator('#stale-file-banner');
		await expect(banner, 'ファイルが控えと違うのに何も言わない').not.toHaveClass(/hidden/);
		await expect(page.locator('#stale-file-msg')).toContainText('work/blade-of-lumia.json');

		await page.locator('#btn-stale-load').click();
		await expect(banner).toHaveClass(/hidden/);
		const raw = await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData'));
		expect(JSON.parse(raw).layers[ln].stages[sk].npcData[pos].lines[0],
			'帯から読み込んでもファイルの本文にならない')
			.toBe(MAP.layers[ln].stages[sk].npcData[pos].lines[0]);
	});

	test('④-2 ファイルと控えが同じときは帯を出さない（毎回出ると誰も読まなくなる）', async ({ page }) => {
		await gotoEditorWith(page, MAP);
		// 照合は fetch を待つ∴指紋が入るまで待ってから帯を見る。
		await expect.poll(() => page.evaluate(() => localStorage.getItem('bladeOfLumiaMapFileSig')))
			.toBeTruthy();
		await expect(page.locator('#stale-file-banner')).toHaveClass(/hidden/);
	});

	test('⑤ 歩き方は本文の置き場所を全部見る（1つでも落ちたら赤）', () => {
		// 本文が置ける場所を全部1つずつ持つ最小のマップ＝**歩き方の穴**を測る。
		// ⚠️ 会話は「文字列の配列」形式と `{name,lines}` 形式が混在する（[[blade-sign-two-formats]]）。
		const fixture = { layers: { L: { stages: { '0,0': {
			showConditions: { '1,1': { message: 'showCond⚔' } },
			fluteEffect: { message: 'flute🎵' },
			npcData: {
				'2,2': { lines: ['npcLines⚔'], linesAfter: ['npcAfter🛡'], linesAfterBoss: { G: ['npcBossG☐'] } },
				'3,3': ['npcArray🪃'],
			},
			signData: { '4,4': { lines: ['signLines⚔'] }, '5,5': ['signArray🔥の草が燃える'] },
		} } } } };

		const ats = [];
		forEachMapText(fixture, ({ at, text }) => ats.push(`${at}=${text}`));
		// 8 本文＝showCond / flute / npc(lines・linesAfter・linesAfterBoss) / npc配列 / sign / sign配列
		expect(ats.length, '本文の置き場所を見落としている').toBe(8);
		expect(ats.join('\n')).toContain('showConditions[1,1]');
		expect(ats.join('\n')).toContain('fluteEffect');
		expect(ats.join('\n')).toContain('npcData[2,2].linesAfterBoss[G][0]');
		expect(ats.join('\n')).toContain('npcData[3,3][0]');
		expect(ats.join('\n')).toContain('signData[5,5][0]');

		const { changes } = normalizeMapIconMarkers(fixture);
		expect(changes.length, '直せていない本文がある').toBe(8);
		expect(findRawIconEmoji(fixture)).toEqual([]);
		expect(countIconMarkers(fixture).unknown).toEqual([]);
		expect(countIconMarkers(fixture).total).toBe(8);
		// 🔥 は文脈で別の物を指す＝草・茂みが燃える文では茂み（かがり火の絵にしない）。
		expect(fixture.layers.L.stages['0,0'].signData['5,5'][0]).toBe('signArray{{bush}}の草が燃える');
		// 2回目は0件＝冪等（保存のたびに差分が出ない）
		expect(normalizeMapIconMarkers(fixture).changes).toEqual([]);
	});

	test('⑤-2 変換は日本語の本文を変えない（変えたら例外＝黙って文言を書き換えない）', () => {
		expect(iconKeyForEmoji('🔥', 'かがり火に火を灯す')).toBe('torch');
		expect(iconKeyForEmoji('🔥', '茂みが燃える')).toBe('bush');
		// 異体字セレクタ付きの絵文字も1マーカーに畳む（残すと単独で豆腐になる）
		expect(emojiToIconMarkers('⚔️を抜く')).toBe('{{sword}}を抜く');
		// 表に無い記号（⚠ ♪ ✦ …）は物ではない∴そのまま残す
		expect(emojiToIconMarkers('⚠ 気をつけろ ♪')).toBe('⚠ 気をつけろ ♪');
		// 本文の照合は絵文字とマーカーを取り除いた残りで見る＝変換の前後で一致する
		const src = 'この⚔で🌿を刈れ';
		expect(iconMarkerBody(emojiToIconMarkers(src))).toBe(iconMarkerBody(src));
	});
});
