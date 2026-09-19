// ── tests/field-map-marks.spec.js ── 実行キュー16（距離の見せ方はキュー22）──────
// 不変条件：**「次どこ」が分かる**。NPC・看板の話を聞くと地図に印が残り、印は一覧から
// 選べて、選んだ印の方向と距離感がゲーム画面に出続ける。
// ⚠️ 距離は**数字で出さない**（キュー22・2026-09-14）＝矢印の大きさ・太さ・明るさの4段で伝える。
//    ❌ 旧記述「残り画面数を出す」は失効（数える計算は `markGuide().screens` に残る＝表示だけやめた）。
// ユーザーの言葉（2026-09-13）＝「マークはマークのリストも表示して選択中のマークという
// 概念も追加して、選択してるマークは目立たせる表示ができるといいかも？ あとゲーム画面に
// 選択してるマークがどちらの方向にあるのかを常に表示とかあるといいかも？」
//
// 🔴 当て所（何を壊したら赤くなるべきか）：
//   ① 地図を持っていないのに矢印や一覧が出る（キュー15 と同じ層別のゲート）
//   ② 会話が印を残さない／読み終える前に「記した！」が出る／行き先が実在しないのに黙って通る
//   ③ 一覧が出ない・選択が動かない（↑↓ で選ぶ・先頭は「（選択なし）」＝解除）／
//      ←→ と ↑↓ が互いを奪う（モードは廃止した＝2026-09-15。Tab は無効）
//   ④ 見取り図に印が出ない／**未訪問の画面には出ない**（＝行っていない場所へ足を向ける本体）
//   ⑤ 選択中の印の枠が別の画面にずれる（1画面ずれても絵は自然に見える∴数で押さえる）
//   ⑥ HUD の方向が間違う（8方向）／距離の段が間違う／**数字が画面に出てしまう**（キュー22）
//   ⑦ セーブで壊れる（Set にすると保存で {} に潰れる／壊れたセーブを読んで幽霊が残る）
//   ⑧ データ側の行き先が実在しない画面を指している（マップ全走査）
//
// 意図した差：矢印は**方向だけ**＝道案内はしない（水や山で直進できないのは割り切り）。

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { markGuide, normalizeDialogMarks, MARK_KINDS } from '../shared/marks.js';
import { gotoFreshGame, readSave, SAVE_KEY, GAME_URL, waitForBoard } from './helpers.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// 種として置いた1件（scripts/migrate-seed-map-mark.mjs）＝老賢者が草原の洞窟を教える。
const SAGE_STAGE = '7,14';
const SAGE_RC    = [3, 3];
const DEST_STAGE = '6,13';
const DEST_LABEL = '草原の洞窟';
const DEST_COLOR = MARK_KINDS.dungeon.color;

function fieldGeometry() {
	const ld = MAP.layers.field;
	const keys = Object.keys(ld.stages);
	const coords = keys.map(k => k.split(',').map(Number));
	const minX = Math.min(...coords.map(c => c[0])), maxX = Math.max(...coords.map(c => c[0]));
	const minY = Math.min(...coords.map(c => c[1])), maxY = Math.max(...coords.map(c => c[1]));
	const first = ld.stages[keys[0]];
	return {
		minX, maxX, minY, maxY, cols: first.cols, rows: first.rows,
		w: (maxX - minX + 1) * first.cols, h: (maxY - minY + 1) * first.rows,
	};
}

async function grantMap(page, layerKey) {
	await page.evaluate((lk) => {
		const p = window.__game.getPlayer();
		if (!p.dungeonItems) p.dungeonItems = {};
		p.dungeonItems[lk] = { ...(p.dungeonItems[lk] ?? {}), hasMap: true, hasCompass: false };
	}, layerKey);
}

async function openPause(page) {
	await page.keyboard.press('Escape');
	await expect(page.locator('#pause-overlay')).toBeVisible();
}

function readCanvas(page) {
	return page.locator('#pause-map-canvas').evaluate((cv) => {
		const ctx = cv.getContext('2d');
		const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
		const out = [];
		for (let i = 0; i < d.length; i += 4) {
			out.push(`#${[d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`);
		}
		return { w: cv.width, h: cv.height, out };
	});
}

/** 老賢者に話しかける（隣に立って向きを合わせ、実際の会話の口＝攻撃ボタンで開く） */
async function talkToSage(page) {
	const [sr, sc] = SAGE_RC;
	await page.evaluate(({ sk, r, c }) => window.__game.enterStage('field', sk, r, c),
		{ sk: SAGE_STAGE, r: sr, c: sc + 1 });
	await page.evaluate(() => window.__game.setHeroDir('left'));
	await page.evaluate(() => window.__game.swordAttack());
	await expect(page.locator('#dialog-overlay')).toBeVisible();
}

/** 指定のセーブを書き戻して「続きから」で開く（ロード時の掃除を測るため） */
async function reloadWithSave(page, save) {
	await page.addInitScript(([key, val]) => {
		try { localStorage.setItem(key, val); } catch { /* noop */ }
	}, [SAVE_KEY, JSON.stringify(save)]);
	await page.goto(GAME_URL);
	await page.locator('#btn-continue').click();
	await page.waitForFunction(() => !!document.getElementById('board')?.children.length);
}

/**
 * サブアイテムを2つ持たせる（←→ の対象が2つ以上ないと切替を測れない）。
 * ⚠️ ポーズを **開く前** に呼ぶ＝欄は開いたときに作り直される（描画の口はテストに出ていない）。
 */
async function grantTwoSubItems(page) {
	await page.evaluate(() => {
		const p = window.__game.getPlayer();
		p.subItems.bomb      = { count: 3 };
		p.subItems.boomerang = { count: Infinity };
		p.activeSubItem = 'bomb';
	});
}

const EDITOR_URL = '/blade-of-lumia/editor/';

/**
 * エディタを実マップで開く。
 * ⚠️ エディタはマップを **localStorage からしか復元しない**（`tryRestoreFromStorage`）＝
 *    素で開くと盤面は空（ステージも layer タブも無い）∴入れてから読み直す。
 *    整形済み JSON は容量の上限に当たる∴最小化して入れる。
 */
async function gotoEditorWithMap(page) {
	await page.goto(EDITOR_URL);
	await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(MAP));
	await page.reload();
	await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
}

/** ワールド地図のセルを座標の文字（"(x,y)"）で選び、ステージ編集を開く */
async function openStageInEditor(page, stageKey) {
	const [x, y] = stageKey.split(',');
	const cell = page.locator('#world-grid .world-cell')
		.filter({ has: page.locator('.cell-coord', { hasText: `(${x},${y})` }) });
	await cell.first().click();
	await page.locator('#btn-edit-stage').click();
	await expect(page.locator('#view-stage')).not.toHaveClass(/hidden/);
}

/** NPC・看板パネルの1件（見出しの座標で選ぶ） */
function npcItem(page, posKey) {
	return page.locator('#npc-list .link-item')
		.filter({ has: page.locator('.link-item-header', { hasText: `NPC (${posKey})` }) });
}

/** 保存ボタンを押して localStorage に書かれたマップデータを読む */
async function savedMapData(page) {
	await page.locator('#btn-save').click();
	const raw = await page.evaluate(() => localStorage.getItem('bladeOfLumiaMapData'));
	expect(raw, 'エディタが保存していない').toBeTruthy();
	return JSON.parse(raw);
}

/** 会話を最後まで送る（ページ数はデータ側の都合∴見えなくなるまで送る） */
async function finishDialog(page) {
	for (let i = 0; i < 30; i++) {
		if (await page.locator('#dialog-overlay').isHidden()) return;
		await page.keyboard.press(' ');
	}
	throw new Error('会話が閉じない');
}

test.describe('目的地マーク（一覧・選択・方向表示）', () => {

	test('① 地図を持っていない間は印も矢印も出ない', async ({ page }) => {
		await gotoFreshGame(page);
		// 印は持っているのに地図が無い＝方向表示も一覧も出ないこと（ゲートは地図）
		await page.evaluate((dest) => {
			const p = window.__game.getPlayer();
			p.mapMarks = [{ layer: 'field', stage: dest, label: 'てすと', kind: 'dungeon' }];
			p.selectedMarkId = `field:${dest}`;
			window.__game.updateHud();
		}, DEST_STAGE);
		await expect(page.locator('#hud-mark-guide')).toBeHidden();
		await openPause(page);
		await expect(page.locator('#pause-dungeon-map')).toBeHidden();
		await expect(page.locator('#pause-mark-list')).toBeHidden();

		// 地図を持たせれば同じ状態で出る＝ゲートが地図だけであることの裏取り（空振り防止）
		await page.keyboard.press('Escape');
		await grantMap(page, 'field');
		await page.evaluate(() => window.__game.updateHud());
		await expect(page.locator('#hud-mark-guide')).toBeVisible();
		await openPause(page);
		await expect(page.locator('#pause-mark-list')).toBeVisible();
	});

	test('② 会話を読み終えると印が付く（途中では付かない・保存にも残る）', async ({ page }) => {
		// 種のデータが戻されたら赤くする（空振り防止）
		const seeded = MAP.layers.field.stages[SAGE_STAGE]?.npcData?.[`${SAGE_RC[0]},${SAGE_RC[1]}`]?.mark;
		expect(seeded, '老賢者に mark が無い＝migrate-seed-map-mark.mjs が未実行').toBeTruthy();
		expect(seeded.stage).toBe(DEST_STAGE);

		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await talkToSage(page);

		// 途中では付かない（＝「記した！」が会話の後ろに隠れない）
		const mid = await page.evaluate(() => window.__game.getPlayer().mapMarks.length);
		expect(mid, '会話の途中で印が付いている').toBe(0);

		await finishDialog(page);
		const after = await page.evaluate(() => {
			const p = window.__game.getPlayer();
			return { marks: p.mapMarks, sel: p.selectedMarkId };
		});
		expect(after.marks).toEqual([{ layer: 'field', stage: DEST_STAGE, label: DEST_LABEL, kind: 'dungeon' }]);
		expect(after.sel, '最初の印は自動で選ばれる').toBe(`field:${DEST_STAGE}`);
		await expect(page.locator('#msg-bar')).toContainText(DEST_LABEL);

		// HUD＝老賢者の画面(7,14) から 6,13 は北西・2画面（＝段は near）
		const g = markGuide(SAGE_STAGE, DEST_STAGE);
		expect([g.arrow, g.screens], 'テスト側の期待値の作り直し（shared/marks.js が真実）').toEqual(['↖', 2]);
		await expect(page.locator('#hud-mark-guide')).toBeVisible();
		await expect(page.locator('#hud-mark-label')).toHaveText(DEST_LABEL);
		await expect(page.locator('#hud-mark-arrow')).toHaveText('↖');
		await expect(page.locator('#hud-mark-arrow')).toHaveClass('mark-dist-near');
		// ⚠️ キュー22＝距離は数字で出さない（`この画面` 以外は空）
		await expect(page.locator('#hud-mark-dist')).toHaveText('');

		// ⚠️ 保存は player を丸ごと直列化する∴Set にすると {} に潰れる＝素の配列であること
		const save = await readSave(page);
		expect(save.player.mapMarks, 'セーブに配列として残らない').toEqual(after.marks);
		expect(save.player.selectedMarkId).toBe(`field:${DEST_STAGE}`);

		// 同じ話をもう一度聞いても増えない（同じ画面＝1件）
		await talkToSage(page);
		await finishDialog(page);
		expect(await page.evaluate(() => window.__game.getPlayer().mapMarks.length)).toBe(1);
	});

	test('③ 一覧が地図の右に出て、↑↓ で選べる（モード無し＝←→ はアイテムのまま生きている）', async ({ page }) => {
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await talkToSage(page);
		await finishDialog(page);
		await openPause(page);

		// 一覧は地図の右（枠の高さを増やさない＝地図の右に約160px）
		const layout = await page.evaluate(() => {
			const map  = document.getElementById('pause-map-wrap').getBoundingClientRect();
			const list = document.getElementById('pause-mark-list').getBoundingClientRect();
			return { mapRight: map.right, listLeft: list.left, listW: list.width, listTop: list.top, mapTop: map.top };
		});
		expect(layout.listLeft, '一覧が地図の右にない').toBeGreaterThanOrEqual(layout.mapRight - 1);
		expect(layout.listW, '一覧の幅が約160pxでない').toBeGreaterThan(120);
		expect(Math.abs(layout.listTop - layout.mapTop), '一覧の上端が地図と揃っていない').toBeLessThan(4);

		const rows = page.locator('.pause-mark-row');
		await expect(rows).toHaveCount(2);
		await expect(rows.nth(0)).toContainText('（選択なし）');
		await expect(rows.nth(1)).toContainText(DEST_LABEL);
		await expect(rows.nth(1)).toContainText('↖');
		await expect(rows.nth(1)).toHaveClass(/selected/);
		// キュー22＝一覧にも数字を出さない（HUD で隠した距離がポーズを開くだけで読めてしまう）
		expect(await rows.nth(1).textContent(), '一覧の行に数字が出ている').not.toMatch(/\d/);
		await expect(rows.nth(1).locator('.pause-mark-dist'), '一覧の矢印に段が当たっていない')
			.toHaveClass(/mark-dist-near/);

		// 案内文はキーと対象の対応をそのまま出す（モードが無い＝切替の案内も無い）
		await expect(page.locator('#pause-hint')).toContainText('← → でアイテム');
		await expect(page.locator('#pause-hint')).toContainText('↑ ↓ で目的地');

		// ↓ で「（選択なし）」へ回る＝選択の解除（削除は用意しない）。
		// **Tab を押さずに** 効くこと＝モード廃止の核心（2026-09-15 ユーザー決定）。
		await page.keyboard.press('ArrowDown');
		await expect(page.locator('.pause-mark-row').nth(0)).toHaveClass(/selected/);
		expect(await page.evaluate(() => window.__game.getPlayer().selectedMarkId)).toBe('');
		await expect(page.locator('#pause-map-marksel')).toBeHidden();
		await page.keyboard.press('Escape');
		await expect(page.locator('#hud-mark-guide'), '解除しても矢印が残っている').toBeHidden();

		// ↑ で戻る（開き直しても ↑↓ はそのまま効く＝合わせる操作が要らない）
		await openPause(page);
		await page.keyboard.press('ArrowUp');
		expect(await page.evaluate(() => window.__game.getPlayer().selectedMarkId)).toBe(`field:${DEST_STAGE}`);
		await page.keyboard.press('Escape');
		await expect(page.locator('#hud-mark-guide')).toBeVisible();

		// ←→＝アイテム／↑↓＝目的地が **同じ画面で同時に生きている**（互いを奪わない）
		await grantTwoSubItems(page);
		await openPause(page);
		const activeItem = () => page.evaluate(() => window.__game.getPlayer().activeSubItem);
		const selMark    = () => page.evaluate(() => window.__game.getPlayer().selectedMarkId);
		await page.keyboard.press('ArrowRight');
		expect(await activeItem(), '←→ がアイテムを変えていない').not.toBe('bomb');
		expect(await selMark(), '←→ が目的地まで動かしている').toBe(`field:${DEST_STAGE}`);
		const itemAfter = await activeItem();
		await page.keyboard.press('ArrowDown');
		expect(await selMark(), '↑↓ が目的地を変えていない').toBe('');
		expect(await activeItem(), '↑↓ がアイテムまで動かしている').toBe(itemAfter);

		// Tab はもう何の意味も持たない（モードが無い＝フォーカスの印も付かない）。
		// ⚠️ **フォーカスを1歩も動かさない**ことまで見る（2026-09-15 ユーザー報告）＝
		//    既定動作を通すとフォーカスがボタンへ、やがてブラウザ側へ抜け、カーソルキーが
		//    ゲームに届かなくなる（キーボードだけでは戻れない）。
		await page.keyboard.press('Tab');
		await expect(page.locator('#pause-mark-list')).not.toHaveClass(/focused/);
		expect(await selMark(), 'Tab が選択を動かしている').toBe('');
		expect(await activeItem(), 'Tab が選択を動かしている').toBe(itemAfter);
		expect(
			await page.evaluate(() => document.activeElement?.tagName ?? ''),
			'Tab でフォーカスが body から動いた＝この先カーソルキーが効かなくなる',
		).toBe('BODY');
		// フォーカスが動いていない＝Tab の後もカーソルキーが両方とも効く
		await page.keyboard.press('ArrowUp');
		expect(await selMark(), 'Tab の後に ↑ が効かない').toBe(`field:${DEST_STAGE}`);
		await page.keyboard.press('ArrowLeft');
		expect(await activeItem(), 'Tab の後に ← が効かない').not.toBe(itemAfter);
	});

	test('⑭ 遊んでいる間の Tab はフォーカスを動かさない（ボタンの枠が出ている間だけ通す）', async ({ page }) => {
		await gotoFreshGame(page);
		// ① 通常プレイ中＝飲む。⚠️ デスクトップの窓ではモバイル操作ボタンが display:none で
		//    フォーカスの行き先が無い＝素で押しても body のまま∴**行き先を1つ置いて測る**
		//    （置かずに書いた形は、門を外しても緑だった）。
		await page.evaluate(() => {
			const b = document.createElement('button');
			b.id = 'probe-focusable';
			b.textContent = 'probe';
			document.body.appendChild(b);
		});
		for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
		expect(
			// ⚠️ body の id は空文字＝`??` では tagName に落ちない∴`||` で繋ぐ
			await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || ''),
			'プレイ中の Tab でフォーカスが動いた＝この先カーソルキーで歩けなくなる',
		).toBe('BODY');

		// ② 会話中でも飲む（同じ枠に見えても入力の枝が別∴別に測る）
		await talkToSage(page);
		await page.keyboard.press('Tab');
		expect(
			// ⚠️ body の id は空文字＝`??` では tagName に落ちない∴`||` で繋ぐ
			await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || ''),
			'会話中の Tab でフォーカスが動いた',
		).toBe('BODY');
		await finishDialog(page);

		// ③ ボタンを選ぶ枠（ゲームオーバー）が出ている間は通す＝マウス無しでボタンへ届く道を残す
		await page.evaluate(() => {
			document.getElementById('gameover-overlay')?.classList.remove('hidden');
		});
		await page.keyboard.press('Tab');
		expect(
			await page.evaluate(() => document.activeElement?.id ?? ''),
			'ボタンの枠が出ているのに Tab を飲んでいる＝キーボードでボタンへ届かない',
		).toBe('gameover-retry');
	});

	test('④ 見取り図に印のドットが出る（未訪問の画面にも）', async ({ page }) => {
		const g = fieldGeometry();
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await talkToSage(page);
		await finishDialog(page);

		// 行き先はまだ訪れていない＝地形は真っ黒のまま、印だけが乗る
		await openPause(page);
		const cv = await readCanvas(page);
		const [dx, dy] = DEST_STAGE.split(',').map(Number);
		const ox = (dx - g.minX) * g.cols, oy = (dy - g.minY) * g.rows;
		const at = (x, y) => cv.out[y * cv.w + x];
		const cx = ox + Math.floor(g.cols / 2), cy = oy + Math.floor(g.rows / 2);
		expect(at(cx, cy), '印の中心の色が種類の色でない').toBe(DEST_COLOR);
		// 縁取り（暗色）＝黒地でも絵の上でも読める
		expect(at(cx - 3, cy), '印の縁取りが無い').toBe('#0a1418');
		// 印の外は真っ黒（未訪問の地形は見せない＝キュー15 の約束を壊していない）
		expect(at(ox + 1, oy + 1), '未訪問の地形が見えている').toBe('#000000');

		// 印のドットは1画面（12×10）に収まる＝隣の画面へはみ出さない
		let dots = 0;
		for (let y = oy; y < oy + g.rows; y++) for (let x = ox; x < ox + g.cols; x++) if (at(x, y) === DEST_COLOR) dots++;
		expect(dots, '印の大きさが想定と違う').toBe(25);   // MARK_DOT 5×5
		expect(at(ox - 1, cy), '印が隣の画面へはみ出している').toBe('#000000');
	});

	test('⑤ 選択中の印の枠が行き先の画面とぴったり重なる', async ({ page }) => {
		const g = fieldGeometry();
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await talkToSage(page);
		await finishDialog(page);
		await openPause(page);

		const box = await page.evaluate(() => {
			const wrap = document.getElementById('pause-map-wrap').getBoundingClientRect();
			const cv   = document.getElementById('pause-map-canvas');
			const cvr  = cv.getBoundingClientRect();
			const sel  = document.getElementById('pause-map-marksel').getBoundingClientRect();
			const bw   = parseFloat(getComputedStyle(cv).borderLeftWidth) || 0;
			return {
				sel:    { x: sel.left - wrap.left, y: sel.top - wrap.top, w: sel.width, h: sel.height },
				canvas: { x: cvr.left - wrap.left + bw, y: cvr.top - wrap.top + bw, w: cv.clientWidth },
			};
		});
		const [mx, my] = DEST_STAGE.split(',').map(Number);
		const scale = box.canvas.w / g.w;
		expect(box.sel.w).toBeCloseTo(g.cols * scale, 1);
		expect(box.sel.h).toBeCloseTo(g.rows * scale, 1);
		expect(box.sel.x - box.canvas.x, '選択枠の x').toBeCloseTo((mx - g.minX) * g.cols * scale, 1);
		expect(box.sel.y - box.canvas.y, '選択枠の y').toBeCloseTo((my - g.minY) * g.rows * scale, 1);
		// 現在地（白枠）とは別物＝同じ画面を指していない
		const here = await page.evaluate(() => {
			const h = document.getElementById('pause-map-here').getBoundingClientRect();
			return { x: h.left, y: h.top };
		});
		expect(here.y, '現在地と選択枠が同じ位置＝どちらかが間違い').not.toBeCloseTo(box.sel.y, 1);
	});

	test('⑥ HUD の方向と距離の段が画面ごとに正しい（8方向・4段・数字は出ない）', async ({ page }) => {
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await talkToSage(page);
		await finishDialog(page);

		// 行き先 6,13 に対して四方と斜めを混ぜ、**4段すべてを1度は通す**。
		// ⚠️ 期待値は**手で書く**（markGuide の戻り値をそのまま期待値にすると、矢印の並びが
		//    逆さになっても両側が同じだけ狂って緑のまま＝歯が無い）。
		//    y は下向きが正＝画面グリッドと同じ向き∴「行き先が上にある」なら ↑。
		//    段の境界（キュー22）も手で書く＝near 1〜2／mid 3〜6／far 7〜13／distant 14〜。
		const probes = [
			['6,14', '↑', 1,  'near'],     // 真上
			['7,13', '←', 1,  'near'],     // 真左
			['5,13', '→', 1,  'near'],     // 真右
			['6,12', '↓', 1,  'near'],     // 真下
			['9,15', '↖', 5,  'mid'],      // 左上へ 3+2 画面
			['6,5',  '↓', 8,  'far'],      // 真下へ 8 画面
			['0,0',  '↘', 19, 'distant'],  // 世界の反対側から 6+13 画面
			[DEST_STAGE, '◎', 0, 'here'],
		];
		const seen = new Map();  // 段 → 矢印の実寸（px）
		for (const [sk, arrow, screens, band] of probes) {
			expect(MAP.layers.field.stages[sk], `field/${sk} が実マップに無い`).toBeTruthy();
			// 共有モジュールと手書きの期待値が食い違ったら、どちらが壊れたのか先に分かる
			const g = markGuide(sk, DEST_STAGE);
			expect([g.arrow, g.screens, g.band], `shared/marks.js の markGuide(${sk})`)
				.toEqual([arrow, screens, band]);
			await page.evaluate((s) => window.__game.enterStage('field', s, 4, 1), sk);
			await expect(page.locator('#hud-mark-arrow'), `field/${sk} の矢印`).toHaveText(arrow);
			await expect(page.locator('#hud-mark-arrow'), `field/${sk} の段`)
				.toHaveClass(`mark-dist-${band}`);
			// キュー22＝数字はどこにも出ない（`この画面` だけ許す）
			const dist = await page.locator('#hud-mark-dist').textContent();
			expect(dist, `field/${sk} の距離欄に数字が出ている`).not.toMatch(/\d/);
			expect(dist, `field/${sk} の距離欄`).toBe(screens === 0 ? 'この画面' : '');
			// 実際に効いている見た目（CSS が当たっていないと段は伝わらない）
			seen.set(band, await page.locator('#hud-mark-arrow').evaluate(el => {
				const cs = getComputedStyle(el);
				return { size: parseFloat(cs.fontSize), stroke: parseFloat(cs.webkitTextStrokeWidth) || 0 };
			}));
		}
		// 近いほど大きく・太い（段が見た目に出ていない＝距離が伝わらない）
		const order = ['near', 'mid', 'far', 'distant'];
		for (let i = 1; i < order.length; i++) {
			const a = seen.get(order[i - 1]), b = seen.get(order[i]);
			expect(a.size, `${order[i - 1]} が ${order[i]} より大きくない`).toBeGreaterThan(b.size);
			expect(a.stroke, `${order[i - 1]} が ${order[i]} より太くない`).toBeGreaterThanOrEqual(b.stroke);
		}
		expect(seen.get('near').stroke, '一番近い段が太くなっていない').toBeGreaterThan(0);
		// 箱は固定＝矢印の大きさが変わっても HUD の高さが揺れない（歩くたびにガタつく）
		const heights = new Set();
		for (const sk of ['6,14', '0,0']) {
			await page.evaluate((s) => window.__game.enterStage('field', s, 4, 1), sk);
			heights.add(Math.round(await page.locator('#hud-mark-guide').evaluate(el => el.getBoundingClientRect().height)));
		}
		expect(heights.size, 'HUD の高さが段で変わる＝歩くと画面がガタつく').toBe(1);

		// 別の層に入ったら出さない（層をまたいだ矢印は方向が意味を持たない）
		await page.evaluate(() => window.__game.enterStage('dungeon_1', '2,2', 5, 5));
		await expect(page.locator('#hud-mark-guide')).toBeHidden();
	});

	test('⑦ セーブを読み直しても残り、壊れたセーブは掃除される', async ({ page }) => {
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await talkToSage(page);
		await finishDialog(page);

		// 壊れた要素を混ぜたセーブを読み直させる。
		// ⚠️ gotoFreshGame が仕込む addInitScript は**以後の goto でも毎回**セーブを消す∴
		//    ここは「消した後に書き戻す」init script を足して続きから開く（後から足した方が後に走る）。
		const save = await readSave(page);
		save.player.mapMarks = [
			...save.player.mapMarks,
			{ layer: 'field', stage: 'あ,い', label: '壊れた座標', kind: 'town' },
			{ layer: '', stage: '1,1', label: '層が空', kind: 'town' },
			{ layer: 'field', stage: '6,13', label: '重複', kind: 'town' },
			'ごみ',
		];
		await reloadWithSave(page, save);
		const marks = await page.evaluate(() => window.__game.getPlayer().mapMarks);
		expect(marks, '壊れた要素が残る／重複が増える').toEqual([
			{ layer: 'field', stage: DEST_STAGE, label: DEST_LABEL, kind: 'dungeon' },
		]);
		expect(await page.evaluate(() => window.__game.getPlayer().selectedMarkId)).toBe(`field:${DEST_STAGE}`);
		await expect(page.locator('#hud-mark-guide')).toBeVisible();

		// 選択 id だけが幽霊になっているセーブ＝黙って外す（HUD が存在しない印を指さない）
		const save2 = await readSave(page);
		save2.player.selectedMarkId = 'field:0,0';
		await reloadWithSave(page, save2);
		expect(await page.evaluate(() => window.__game.getPlayer().selectedMarkId)).toBe(null);
		await expect(page.locator('#hud-mark-guide')).toBeHidden();
	});

	// キュー17-2: 進行で切り替わる印（`markAfterBoss`）も同じ検査に入れる＝進行の後ろの
	// 分岐は「ボスを倒すまで誰も見ない」∴データの書き間違いが一番残りやすい場所。
	test('⑧ マップの mark はすべて実在する画面を指している（markAfterBoss も含む）', () => {
		const bad = [];
		let total = 0, afterBossTotal = 0;
		for (const [lk, ld] of Object.entries(MAP.layers)) {
			for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
				for (const home of ['npcData', 'signData']) {
					for (const [pk, entry] of Object.entries(sd[home] ?? {})) {
						if (!entry || typeof entry !== 'object') continue;
						// 「基本の1組」＋進行ごとの版を、どれも同じ形で見る。
						const sources = [];
						if (entry.mark !== undefined) sources.push(['mark', entry.mark]);
						for (const [bossKey, mk] of Object.entries(entry.markAfterBoss ?? {})) {
							sources.push([`markAfterBoss[${bossKey}]`, mk]);
							afterBossTotal++;
						}
						for (const [label, raw] of sources) {
							const norm = normalizeDialogMarks(raw, lk);
							// 正規化で全部落ちた＝座標の形が壊れている
							if (!norm.length) { bad.push(`${lk}/${sk} ${home}[${pk}] ${label} の形が不正`); continue; }
							for (const m of norm) {
								total++;
								if (!MAP.layers[m.layer]?.stages?.[m.stage]) {
									bad.push(`${lk}/${sk} ${home}[${pk}] ${label} → ${m.layer}/${m.stage} が実在しない`);
								}
							}
						}
					}
				}
			}
		}
		expect(bad, '行き先が実在しない mark がある').toEqual([]);
		expect(total, 'mark が1件も無い＝この検査は空振りしている').toBeGreaterThan(0);
		expect(afterBossTotal, 'markAfterBoss が1件も無い＝進行追従の検査は空振りしている').toBeGreaterThan(0);
	});

	// ── エディタの入口（[[blade-bad-data-fix-five-layers]] の4層目）──────────
	// 印を「データを手で書く」しか道が無いと、キュー17 の会話設計で必ず書き間違える∴
	// エディタの欄で読めて・直せて・消せることまでを1セットで押さえる。

	test('⑨ エディタの「教える目的地」欄で印を読み書きできる', async ({ page }) => {
		page.on('dialog', d => d.dismiss());   // 保存はダイアログを出す（File System Access 未対応の道）
		await gotoEditorWithMap(page);
		await openStageInEditor(page, SAGE_STAGE);
		const item = npcItem(page, SAGE_RC.join(','));
		// 種として置いた印が欄に出る（データを読めていない＝空欄なら赤くなる）
		await expect(item.locator('[data-f="markStage"]')).toHaveValue(DEST_STAGE);
		await expect(item.locator('[data-f="markLabel"]')).toHaveValue(DEST_LABEL);
		await expect(item.locator('[data-f="markKind"]')).toHaveValue('dungeon');
		await expect(item.locator('.link-item-header .hint'), 'NPC の本文の置き場所').toHaveText('npcData');

		// 印が付かない入力はその場で赤くなる（ゲーム側で黙って捨てられる前に気づける）
		const RED = 'rgb(240, 128, 128)';
		const stageEl = item.locator('[data-f="markStage"]');
		const layerEl = item.locator('[data-f="markLayer"]');
		// ①画面の形が違う
		await stageEl.fill('ごみ');
		await expect(stageEl).toHaveCSS('border-color', RED);
		await stageEl.fill(DEST_STAGE);
		await expect(stageEl).not.toHaveCSS('border-color', RED);
		// ③形は正しいが、その層にその画面が無い
		await stageEl.fill('99,99');
		await expect(stageEl, '存在しない画面が赤くならない').toHaveCSS('border-color', RED);
		await stageEl.fill(DEST_STAGE);
		// ②存在しない層（層の欄だけが赤くなる＝原因が1つに見える）
		await layerEl.fill('abc');
		await expect(layerEl, '存在しない層が赤くならない').toHaveCSS('border-color', RED);
		await expect(stageEl, '層が原因なのに画面まで赤い').not.toHaveCSS('border-color', RED);
		// 実在する別の層に切り替えると、その層に無い画面として画面側が赤くなる
		await layerEl.fill('dungeon_1');
		await expect(layerEl).not.toHaveCSS('border-color', RED);
		await expect(stageEl, 'dungeon_1 に 6,13 は無いのに赤くならない').toHaveCSS('border-color', RED);
		await layerEl.fill('field');
		await expect(stageEl).not.toHaveCSS('border-color', RED);

		// 直した内容が保存される
		await item.locator('[data-f="markLabel"]').fill('書き換えた名前');
		await item.locator('[data-f="markKind"]').selectOption('cave');
		const saved = await savedMapData(page);
		expect(saved.layers.field.stages[SAGE_STAGE].npcData[SAGE_RC.join(',')].mark)
			.toEqual({ stage: DEST_STAGE, label: '書き換えた名前', kind: 'cave', layer: 'field' });

		// 画面の欄を空にすると印が消える（取り消しの手段はこれ1つ）
		await item.locator('[data-f="markStage"]').fill('');
		const saved2 = await savedMapData(page);
		const sage2 = saved2.layers.field.stages[SAGE_STAGE].npcData[SAGE_RC.join(',')];
		expect(sage2.mark, '画面を空にしても印が残る').toBeUndefined();
		expect(sage2.lines.length, '印を消したらセリフまで消えた').toBeGreaterThan(0);
	});

	test('⑩ signData に本文がある看板でも、その場所に印が書かれる', async ({ page }) => {
		// ⚠️ ゲーム（combat.js）は signData を先に読む∴npcData 側に書くと黙って無視される。
		//    実測で signData に本文がある看板を選ぶ（データが動いたら赤くする）。
		const SIGN_LAYER = 'dungeon_1', SIGN_STAGE = '1,3', SIGN_POS = '3,5', SIGN_DEST = '2,2';
		const before = MAP.layers[SIGN_LAYER].stages[SIGN_STAGE];
		expect(before.signData?.[SIGN_POS], 'signData に本文がある看板が消えた').toBeTruthy();
		expect(before.npcData?.[SIGN_POS], 'この看板は npcData 側にも本文がある＝別の看板を選ぶ').toBeUndefined();
		expect(MAP.layers[SIGN_LAYER].stages[SIGN_DEST], `${SIGN_LAYER}/${SIGN_DEST} が無い`).toBeTruthy();

		page.on('dialog', d => d.dismiss());
		await gotoEditorWithMap(page);
		await page.locator('.layer-tab', { hasText: new RegExp(`^${SIGN_LAYER}`) }).click();
		await openStageInEditor(page, SIGN_STAGE);

		const item = npcItem(page, SIGN_POS);
		await expect(item.locator('.link-item-header .hint'), '本文の置き場所を signData と表示しない').toHaveText('signData');
		await expect(item.locator('[data-f="name"]')).toHaveValue(before.signData[SIGN_POS].name);
		await item.locator('[data-f="markStage"]').fill(SIGN_DEST);
		await item.locator('[data-f="markLabel"]').fill('石の扉');

		const saved = await savedMapData(page);
		const after = saved.layers[SIGN_LAYER].stages[SIGN_STAGE];
		expect(after.signData[SIGN_POS].mark, '印が signData 側に書かれない').toEqual({ stage: SIGN_DEST, label: '石の扉', kind: 'other' });
		expect(after.npcData?.[SIGN_POS], '無視される npcData 側に書いている').toBeUndefined();
		expect(after.signData[SIGN_POS].lines, '本文が失われた').toEqual(before.signData[SIGN_POS].lines);
		// 層を書かなければ「この会話がある層」＝ゲーム側の既定で解決される
		expect(normalizeDialogMarks(after.signData[SIGN_POS].mark, SIGN_LAYER)[0].layer).toBe(SIGN_LAYER);
	});

	// ── 進行に追従する印（キュー17-2 の `markAfterBoss`）────────────────────
	// 不変条件：**語り手が「次はここ」と言ったら、地図の印もそこを指す**。本文だけが進んで
	// 印が最初の1件で止まると、「次どこ」の本体（キュー17 ⑦）が村を出た時点で死ぬ。
	// 🔴 当て所：①印が進行で切り替わらない ②「最初にヒットしたキー」で固定される
	//            ③プレイヤーが選んでいる印を勝手に奪う（ユーザー決定 2026-09-14＝
	//            「地図上のマークリストの選択状態はプレイヤーに操作させる」）

	test('⑪ 老賢者の印は「最も後に倒したボス」に追従する', async ({ page }) => {
		const sage = MAP.layers.field.stages[SAGE_STAGE].npcData[SAGE_RC.join(',')];
		expect(sage.markAfterBoss, '老賢者に markAfterBoss が無い＝migrate-dialog-band-1.mjs が未実行').toBeTruthy();
		const afterG = sage.markAfterBoss.G, afterN = sage.markAfterBoss.N;
		expect([afterG, afterN], '踏破後の印が2件そろっていない').not.toContain(undefined);

		await gotoFreshGame(page);
		await grantMap(page, 'field');
		// 撃破前＝基本の印（草原の洞窟）
		await talkToSage(page);
		await finishDialog(page);
		expect(await page.evaluate(() => window.__game.getPlayer().mapMarks))
			.toEqual([{ layer: 'field', stage: DEST_STAGE, label: DEST_LABEL, kind: 'dungeon' }]);

		// G（D1 のボス）を倒した後＝本文が名指しする次の地が印になる
		await page.evaluate(() => window.__game.addDefeatedBoss('G'));
		await talkToSage(page);
		await finishDialog(page);
		let marks = await page.evaluate(() => window.__game.getPlayer().mapMarks);
		expect(marks, 'G の後に印が増えない＝印が進行に追従していない').toHaveLength(2);
		expect(marks[1]).toEqual({ layer: 'field', stage: afterG.stage, label: afterG.label, kind: afterG.kind });

		// さらに N も倒す＝進行順で「最も後」の N の印になる（G で固定されない）
		await page.evaluate(() => window.__game.addDefeatedBoss('N'));
		await talkToSage(page);
		await finishDialog(page);
		marks = await page.evaluate(() => window.__game.getPlayer().mapMarks);
		expect(marks, 'N の後に印が増えない＝G で固定されている').toHaveLength(3);
		expect(marks[2]).toEqual({ layer: 'field', stage: afterN.stage, label: afterN.label, kind: afterN.kind });
		// 保存にも残る（配列のまま＝Set にすると {} に潰れる）
		const save = await readSave(page);
		expect(save.player.mapMarks).toEqual(marks);
	});

	test('⑫ 新しく教わった印は、選んでいる印を奪わない', async ({ page }) => {
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await talkToSage(page);
		await finishDialog(page);
		// 1件目は選択が空∴自動で選ばれる（選ばせる相手が1つも無い状態を作らないため）
		expect(await page.evaluate(() => window.__game.getPlayer().selectedMarkId)).toBe(`field:${DEST_STAGE}`);

		await page.evaluate(() => window.__game.addDefeatedBoss('G'));
		await talkToSage(page);
		await finishDialog(page);
		const after = await page.evaluate(() => {
			const p = window.__game.getPlayer();
			return { sel: p.selectedMarkId, n: p.mapMarks.length };
		});
		expect(after.n, '2件目の印が付いていない＝この検査は空振り').toBe(2);
		expect(after.sel, '教わった印が選択を奪った（プレイヤーが選んだ印が勝手に変わる）').toBe(`field:${DEST_STAGE}`);
		// HUD も選んでいる印を指し続ける
		await expect(page.locator('#hud-mark-label')).toHaveText(DEST_LABEL);

		// 自分で解除してから聞けば、次の印が自動で選ばれる（＝①の枝が生きていることの裏取り）
		await page.evaluate(() => { window.__game.getPlayer().selectedMarkId = ''; });
		await page.evaluate(() => window.__game.addDefeatedBoss('N'));
		await talkToSage(page);
		await finishDialog(page);
		const sel = await page.evaluate(() => window.__game.getPlayer().selectedMarkId);
		expect(sel, '選択を空にしても自動で選ばれない').not.toBe('');
		expect(sel).not.toBe(`field:${DEST_STAGE}`);
	});

	test('⑬ ダンジョンでは ↑↓ が field の印を動かさない（一覧が消えたら並びも消える）', async ({ page }) => {
		await gotoFreshGame(page);
		await grantMap(page, 'field');
		await talkToSage(page);
		await finishDialog(page);
		expect(await page.evaluate(() => window.__game.getPlayer().selectedMarkId)).toBe(`field:${DEST_STAGE}`);

		// ダンジョンへ入ると一覧は消える（部屋グリッドに印の機構が無い）。
		// ⚠️ モード廃止で ↑↓ は常に生きている∴**並びを空にしていないと裏で field の印が動く**。
		// 地図なし（枠ごと隠す枝）と地図あり（部屋グリッドを描く枝）で消す場所が別∴両方測る。
		// ⚠️ 毎回 field で一覧を描き直してから入る＝並びが入った状態を作らないと空振りする
		//    （前の周回で空になったままだと、消し忘れても赤くならない）。
		for (const withMap of [false, true]) {
			await page.evaluate(({ sk, r, c }) => window.__game.enterStage('field', sk, r, c),
				{ sk: SAGE_STAGE, r: SAGE_RC[0], c: SAGE_RC[1] + 1 });
			await openPause(page);
			await expect(page.locator('#pause-mark-list')).toBeVisible();
			await page.keyboard.press('Escape');

			if (withMap) await grantMap(page, 'dungeon_1');
			await page.evaluate(() => window.__game.enterStage('dungeon_1', '0,0', 1, 1));
			await openPause(page);
			await expect(page.locator('#pause-mark-list')).toBeHidden();
			// ⚠️ ↓と↑を続けて押すと元へ戻る＝動いても気づかない∴**1回ずつ**測る
			for (const key of ['ArrowDown', 'ArrowUp']) {
				await page.keyboard.press(key);
				expect(
					await page.evaluate(() => window.__game.getPlayer().selectedMarkId),
					`ダンジョン（地図${withMap ? 'あり' : 'なし'}）で ${key} が field の印を動かした`,
				).toBe(`field:${DEST_STAGE}`);
			}
			await page.keyboard.press('Escape');
		}
	});

	// ⑮ プレビュー設定の地図（2026-09-19）＝エディタのプレビューを「地図を持った状態」で始められる。
	// ユーザーの言葉＝「field 0,0 の印の見え方をチェックしたいけど、プレビューの設定でルミアの
	// 地図を持った状態を設定できるようにしてくれない？じゃないと簡単にテストできない。」
	// 🔴 当て所：`ps_map` を取りこぼす／1層だけに立てる（層ごとの持ち物）／`enterStage` の後に
	//    立てて最初の HUD が地図なしのまま／`ps_map=0` でも地図を持ってしまう。
	test('⑮ プレビューの ps_map=1 は地図を持った状態で始まる（印がその場で見える）', async ({ page }) => {
		// 読む相手＝`field 0,2`「古道の道標」（行き先は `field 0,0` 樹海の岩室＝**北へ2画面**）。
		// ⚠️ 2026-09-19 のユーザー決定で「自分の画面を指す印」を全部消した∴**遠くを指す印**で
		//    測る（矢印が出るのが本体＝`◎ この画面` では地図を持った甲斐が見えない）。
		const stage = '0,2';
		const st = MAP.layers.field.stages[stage];
		const found = Object.entries(st.signData ?? {}).find(([, e]) => e && !Array.isArray(e) && e.mark);
		expect(found, 'field 0,2 に印を教える看板が無い').toBeTruthy();
		const [pos, sign] = found;
		const [sr, sc] = pos.split(',').map(Number);
		expect(sign.mark.stage, '行き先が自分の画面＝印の作法に反する').not.toBe(stage);
		// 看板の左隣に立って右を向く（実際の読み方と同じ経路で開く）
		expect(st.tiles[sr][sc - 1], '看板の左隣が床でない').toBe('.');
		const url = (on) => `${GAME_URL}?fromEditor=1&layer=field&stage=${stage}&row=${sr}&col=${sc - 1}&ps_map=${on ? 1 : 0}`;

		// `ps_map=0`＝従来どおり地図なし（この口を足したせいで常に持つようになっていないこと）
		await page.goto(url(false));
		await waitForBoard(page);
		expect(await page.evaluate(() => !!window.__game.getPlayer().dungeonItems?.field?.hasMap)).toBe(false);

		await page.goto(url(true));
		await waitForBoard(page);
		// 地図は**層ごと**の持ち物∴マップに在る全層に立てる（ダンジョンから field の印を
		// 確かめる／逆もある＝1層だけだと「見るにはその層に居ろ」という別の壁が残る）。
		const withMap = await page.evaluate(() => {
			const dm = window.__game.getPlayer().dungeonItems ?? {};
			return Object.keys(dm).filter((k) => dm[k]?.hasMap);
		});
		expect(withMap).toContain('field');
		expect(withMap.length).toBe(Object.keys(MAP.layers).length);

		// 看板を読み終えた瞬間に矢印が出る（①の裏返し＝地図が無ければ出ない）
		await expect(page.locator('#hud-mark-guide')).toBeHidden();
		await page.evaluate(() => { window.__game.setHeroDir('right'); window.__game.swordAttack(); });
		await expect(page.locator('#dialog-overlay')).toBeVisible();
		await finishDialog(page);
		await expect(page.locator('#hud-mark-guide')).toBeVisible();
		await expect(page.locator('#hud-mark-label')).toHaveText(sign.mark.label);
		// 行き先は北へ2画面＝矢印は ↑・「この画面」とは出ない（遠くを指しているから見て意味がある）
		await expect(page.locator('#hud-mark-arrow')).toHaveText(markGuide(stage, sign.mark.stage).arrow);
		await expect(page.locator('#hud-mark-dist')).toHaveText('');
	});

	// ⑯ 印の役目（2026-09-19 ユーザー決定）＝**どこへ向かえばいいかを教えること**。
	// ユーザーの言葉＝「まぁまぁ広いマップだから、どこに向かえばいいのか全然わからずにマップを
	// 闇雲に移動せざるをえないのは辛すぎるだろうから、ヒントとしてどこに向かえばいいのかを示して
	// あげたい、っていう目的なんだよ。／もう目的地についた状態でそれを記録しておきたい、みたいな
	// ものは別のユーザマーク機能、みたいなものとしてならあってもいいけど、ゲーム側が自ら現場で
	// マークさせる機能なんていらない。」
	// 🔴 当て所＝帯1〜5 で作った「入口の画面のしおりが自分の画面を記す」型（9件＝
	//    `scripts/migrate-remove-self-marks.mjs` で削除）が、帯6以降や旧スクリプトの
	//    再実行でまた入ってくること。検査は `scripts/check-dialog-integrity.mjs` にもある。
	test('⑯ 印はすべて別の画面を指す（自分の画面を指す印は作らない）', () => {
		const selfMarks = [];
		for (const [ln, ld] of Object.entries(MAP.layers)) {
			for (const [sk, st] of Object.entries(ld.stages ?? {})) {
				for (const home of ['signData', 'npcData']) {
					for (const [pos, en] of Object.entries(st[home] ?? {})) {
						if (!en || Array.isArray(en) || typeof en !== 'object') continue;
						for (const raw of [en.mark, ...Object.values(en.markAfterBoss ?? {})].filter(Boolean)) {
							for (const m of normalizeDialogMarks(raw, ln)) {
								if (m.layer === ln && m.stage === sk) selfMarks.push(`${ln} ${sk} (${pos}) ${en.name}＝「${m.label}」`);
							}
						}
					}
				}
			}
		}
		expect(selfMarks, '自分の画面を指す印がある＝node scripts/migrate-remove-self-marks.mjs').toEqual([]);
	});

});
