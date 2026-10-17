// @ts-check
// 2026-10-17 ユーザー指摘：
//   (1)「目的地表示が小さすぎる。右の SUB: の表示と同じか少し小さいかぐらいでよさそう」
//   (2)「ゲーム画面にオーバーレイしてると重なってるところが見づらくて邪魔。左側か右側のレーンに移動するかした方がいいかも」
// 大きい画面（600px 以上）では目的地表示（#hud-mark-guide）の寸法を `--mark-u` ごと拡大し（responsive.css）、
// 盤面の左の余白（レーン）が十分あればハートの下へ移して2段組みにする（game.js placeMarkGuide）。
//   ① 広いレーン＝文字は SUB: の 7〜9割・矢印の箱も同じ比で大きい
//   ② 小さい画面＝今までどおり上の中央・11px（スマホの HUD の段組みを崩さない）
//   ③ レーンがあれば盤面に1ドットも重ならない・名前は1行（細いレーンでは縮めて収める）
//   ④ レーンが無い比率の画面では上の中央（今まで）
import { test, expect } from '@playwright/test';
import { waitForBoard, GAME_URL } from './helpers.js';

async function measure(page, width, height, label = '草原の洞窟') {
  await page.setViewportSize({ width, height });
  await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=5,14&row=1&col=5&ps_weapon=1&ps_map=1&ps_flute=1`);
  await waitForBoard(page);
  await page.evaluate((label) => {
    const g = window.__game;
    const pl = g.getPlayer();
    pl.mapMarks = [{ layer: 'field', stage: '7,12', label, kind: 'dungeon' }];
    pl.selectedMarkId = 'field:7,12';
    g.updateHud();
  }, label);
  await expect(page.locator('#hud-mark-guide')).toBeVisible();
  return page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    const fs = (id) => parseFloat(getComputedStyle(el(id)).fontSize);
    const g = el('hud-mark-guide').getBoundingClientRect();
    const b = el('board').getBoundingClientRect();
    const label = el('hud-mark-label').getBoundingClientRect();
    return {
      parent: el('hud-mark-guide').parentElement.id,
      inLane: el('hud-mark-guide').classList.contains('in-lane'),
      guide: fs('hud-mark-guide'), sub: fs('hud-sub-label'),
      arrowBox: el('hud-mark-arrow').getBoundingClientRect().height,
      guideRight: g.right, guideLeft: g.left, boardLeft: b.left, labelH: label.height,
      // 名前の規則は「1行・はみ出しは … で省略」＝縮めないと途中で切れる（折り返しにはならない）
      // 許容 4px＝括弧などの字形が箱から少しはみ出す分（折り返して全文が見えていても 2px 出た）
      labelClipped: el('hud-mark-label').scrollWidth > el('hud-mark-label').clientWidth + 4,
    };
  });
}

test('① 広いレーン：目的地表示の文字は SUB: と同じか少し小さい・矢印の箱も拡大', async ({ page }) => {
  const r = await measure(page, 2000, 1100);
  expect(r.inLane, '前提：レーンに置かれている').toBe(true);
  expect(r.guide / r.sub, `文字 ${r.guide}px / SUB: ${r.sub}px`).toBeGreaterThanOrEqual(0.7);
  expect(r.guide / r.sub).toBeLessThanOrEqual(0.9);
  expect(r.arrowBox / r.guide, '矢印の箱が文字と同じ比で大きくなっていない（11px 基準で 22/11＝2）').toBeCloseTo(2, 1);
});

test('② 小さい画面：今までどおり上の中央・11px', async ({ page }) => {
  const r = await measure(page, 390, 844);
  expect(r.parent).toBe('hud-center');
  expect(r.inLane).toBe(false);
  expect(r.guide).toBe(11);
  expect(r.arrowBox).toBe(22);
});

test('③ レーンがあれば：ハートの下に置き、盤面に重ならず、名前は1行（細いレーンは縮める）', async ({ page }) => {
  for (const [w, h] of [[2000, 1100], [1440, 900]]) {
    const r = await measure(page, w, h);
    expect(r.parent, `${w}×${h}`).toBe('hud-left');
    expect(r.inLane, `${w}×${h}`).toBe(true);
    expect(r.guideRight, `${w}×${h} 盤面に重なっている`).toBeLessThanOrEqual(r.boardLeft);
    expect(r.guideLeft).toBeGreaterThanOrEqual(0);
    expect(r.labelH, `${w}×${h} 名前が折り返している（${r.guide}px）`).toBeLessThan(r.guide * 1.6);
    expect(r.labelClipped, `${w}×${h} 名前が途中で切れている（…）`).toBe(false);
  }
});

test('③b 長い名前（実データ最長11文字）は細いレーンで2行まで折り返し、切れない', async ({ page }) => {
  const r = await measure(page, 1440, 900, '果ての火口跡（かけら）');
  expect(r.inLane).toBe(true);
  expect(r.labelClipped, '名前が途中で切れている').toBe(false);
  expect(r.labelH, '3行以上に折り返している').toBeLessThan(r.guide * 1.6 * 2);
  expect(r.guideRight, '盤面に重なっている').toBeLessThanOrEqual(r.boardLeft);
});

test('④ レーンが無い比率の画面では上の帯（盤面はその下）・目的地は帯の中央', async ({ page }) => {
  const r = await measure(page, 1000, 900);
  expect(r.parent).toBe('hud-center');
  expect(r.inLane).toBe(false);
});

// 2026-10-17 ユーザー判定「オーバーレイしてると重なってるところが見づらくて邪魔」→ 決定「画面の形で切り替える」：
// 横長＝左右レーン／正方形〜縦長＝上の帯。どちらでも HUD のどの部品も盤面に重ならない（ハートは最大級の 24 個）。
test('⑤ どの画面の形でも HUD（ハート・座標・目的地・装備/SUB/所持金）が盤面に重ならない', async ({ page }) => {
  const cases = [[2000, 1100, 'hud-lane'], [1440, 900, 'hud-lane'], [1200, 1000, 'hud-band'], [900, 1000, 'hud-band'], [650, 900, 'hud-band']];
  for (const [w, h, mode] of cases) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${GAME_URL}?fromEditor=1&layer=field&stage=7,14&row=3&col=4&ps_weapon=1&ps_map=1&ps_hearts=24`);
    await waitForBoard(page);
    await page.evaluate(() => {
      const g = window.__game;
      const pl = g.getPlayer();
      pl.mapMarks = [{ layer: 'field', stage: '7,14', label: 'はじまりの村', kind: 'town' }];
      pl.selectedMarkId = 'field:7,14';
      g.updateHud();
    });
    await page.waitForTimeout(300);   // ResizeObserver の合わせ直しを待つ
    const r = await page.evaluate(() => {
      const b = document.getElementById('board').getBoundingClientRect();
      const over = ['hud-hearts', 'hud-stage-label', 'hud-mark-guide', 'hud-right'].filter((id) => {
        const e = document.getElementById(id);
        if (getComputedStyle(e).display === 'none') return false;
        const q = e.getBoundingClientRect();
        return !(q.right <= b.left + 1 || q.left >= b.right - 1 || q.bottom <= b.top + 1 || q.top >= b.bottom - 1);
      });
      const lab = document.getElementById('hud-mark-label');
      return { mode: document.getElementById('hud').className, over, boardBottom: b.bottom, boardRight: b.right,
        // ハートが1列に伸びて目的地表示を押しつぶすと名前が … で切れる（帯方式でハートを折り返す理由）
        labelClipped: lab.scrollWidth > lab.clientWidth + 2,
        // 帯方式の目的地表示の中心（ハートを折り返さないと1列に伸びて右へ押し出される）
        guideCenter: (() => { const q = document.getElementById('hud-mark-guide').getBoundingClientRect(); return (q.left + q.right) / 2; })() };
    });
    expect(r.mode, `${w}×${h}`).toBe(mode);
    expect(r.over, `${w}×${h} 盤面に重なっている部品`).toEqual([]);
    expect(r.boardBottom, `${w}×${h} 盤面が画面の下にはみ出す`).toBeLessThanOrEqual(h + 2);
    expect(r.boardRight).toBeLessThanOrEqual(w + 2);
    expect(r.labelClipped, `${w}×${h} 目的地の名前が押しつぶされて切れている`).toBe(false);
    if (mode === 'hud-band') expect(Math.abs(r.guideCenter - w / 2), `${w}×${h} 帯の目的地表示が中央からずれている`).toBeLessThanOrEqual(w * 0.15);
  }
});
