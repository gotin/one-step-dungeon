// tests/chest-reward-icon.spec.js
// 宝箱を開けたときの文の頭の絵＝**取った物の絵**（実行キュー37・2026-09-30）。
//
// ユーザー指摘＝「宝箱からアイテムをゲットしたときのメッセージに出すのは宝箱じゃなくて
// ゲットアイテムの絵を出した方がいいよね。ゲットしたのは宝箱じゃないんだから」。
// それまでは `game/player.js openChest` が中身に関係なく `{{chest}}` を頭に付けていた。
//
// 中身 → 絵のキーの単一の真実は `shared/ui-icons.js rewardIconKey`（ITEM_META と
// SWORD_TIERS 等のティア表から導出）。宝箱の絵のまま残すのは「何も取っていない」2つ＝
// 空箱と「もう持てない」（開けない）だけ。
//
// ⚠️ 検査する中身は**実マップの全宝箱から集める**（手書きの一覧を持たない）＝
//    新しい種類の中身を宝箱に入れたら自動で検査に乗る。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { UI_ICON, rewardIconKey } from '../shared/ui-icons.js';
import { SPRITES } from '../shared/sprites.js';
import { ITEM_META, EQUIP_META, SWORD_TIERS, ARMOR_TIERS, SHIELD_TIERS, BOOMERANG_TIERS } from '../shared/items.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// 全レイヤーの宝箱の中身を「種類」ごとに1件ずつ（名前・額面は種類に数えない）。
const KINDS = (() => {
  const seen = new Map();
  for (const [layerName, layer] of Object.entries(map.layers)) {
    for (const [room, stage] of Object.entries(layer.stages)) {
      for (const [cell, content] of Object.entries(stage.chestContents ?? {})) {
        const { name, value, ...rest } = content;
        const sig = JSON.stringify(Object.fromEntries(Object.entries(rest).sort()));
        if (!seen.has(sig)) seen.set(sig, { sig, content, where: `${layerName}[${room}](${cell})` });
      }
    }
  }
  return [...seen.values()];
})();

// その中身の「本当の絵」＝データの持ち主（ITEM_META／ティア表）から直接引く。
// rewardIconKey の導出を写さず、表の値そのものと突き合わせる。
const TIER = {
  weapon:    { tiers: SWORD_TIERS,     field: 'swordTier',     base: EQUIP_META.sword  },
  armor:     { tiers: ARMOR_TIERS,     field: 'armorTier',     base: EQUIP_META.armor  },
  shield:    { tiers: SHIELD_TIERS,    field: 'shieldTier',    base: EQUIP_META.shield },
  boomerang: { tiers: BOOMERANG_TIERS, field: 'boomerangTier', base: ITEM_META.boomerang },
};
function expectedSpec(content) {
  if (content.type === 'item') {
    const m = ITEM_META[content.item];
    return { spr: m.sprite, pal: m.pal };
  }
  const t = TIER[content.type];
  if (t) {
    const tier = t.tiers[content[t.field] ?? 0];
    return { spr: tier.sprite && SPRITES[tier.sprite] ? tier.sprite : t.base.sprite, pal: tier.pal };
  }
  if (content.type === 'rupee') return { spr: 'rupee', pal: 'rupee' };
  if (content.type === 'heartContainer') return { spr: ITEM_META.heartContainer.sprite, pal: ITEM_META.heartContainer.pal };
  if (content.type === 'ladder') return { spr: ITEM_META.ladder.sprite, pal: ITEM_META.ladder.pal };
  return null;
}

test.describe('Blade of Lumia – 宝箱の文の頭の絵（データ）', () => {

  test('① 実マップの全種類の中身が、宝箱でなく取った物の絵のキーになる', () => {
    // 空振り防止＝集めた種類が少なすぎたら集め方が壊れている
    expect(KINDS.length, '宝箱の中身の種類が集められていない').toBeGreaterThan(20);
    const bad = [];
    for (const { sig, content, where } of KINDS) {
      const key = rewardIconKey(content);
      const want = expectedSpec(content);
      const got = UI_ICON[key];
      if (key === 'chest') { bad.push(`${where} ${sig}: 宝箱の絵のまま`); continue; }
      if (!/^[a-zA-Z]+$/.test(key)) { bad.push(`${where} ${sig}: キー '${key}' が {{key}} に乗らない`); continue; }
      if (!got) { bad.push(`${where} ${sig}: UI_ICON に '${key}' が無い`); continue; }
      if (!want || got.spr !== want.spr || got.pal !== want.pal) {
        bad.push(`${where} ${sig}: ${key}=${JSON.stringify(got)}（本当の絵 ${JSON.stringify(want)}）`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('② 矢筒・爆弾袋は専用の絵（矢1本・爆弾1個の借り物ではない）', () => {
    for (const [id, borrowed] of [['quiver', 'arrow'], ['bombBag', 'bombItem']]) {
      const it = UI_ICON[rewardIconKey({ type: 'item', item: id })];
      expect(it.spr, `${id} が ${borrowed} の絵を借りている`).not.toBe(borrowed);
      expect(SPRITES[it.spr], `${id} の絵 ${it.spr} が実在しない`).toBeTruthy();
    }
  });

  test('③ 絵が引けない中身は宝箱の絵に落ちる（空欄・`{{…}}` の生文字にしない）', () => {
    expect(rewardIconKey({ type: 'item', item: 'にせもの' })).toBe('chest');
    expect(rewardIconKey({ type: 'nope' })).toBe('chest');
    expect(rewardIconKey(null)).toBe('chest');
  });

});

// ── 実機：宝箱を実際に開けてメッセージバーの頭の絵を見る ─────────────────
// 部屋は chest-content-shape.spec.js と同じ dungeon_6 2,4 の宝箱 (2,5)（旧 dungeon_7 2,4 は
// 2026-10-04 キュー39 で宝箱を撤去した）。
// 中身だけ `page.route` でマップ応答へ差し込む（マップデータは1バイトも変えない）。
const GAME = '/blade-of-lumia/game/';
const ROOM = { layer: 'dungeon_6', stage: '2,4', chest: '2,5', r: 2, c: 5 };

async function openWith(page, content, before) {
  // ⚠️ `route.fetch()` で取りに行かない＝全体実行の負荷下で巨大な JSON の取得が
  //    `socket hang up` で落ちた（2026-09-30）。上でディスクから読んだマップの複製を返す。
  await page.route('**/work/blade-of-lumia.json', async (route) => {
    const json = structuredClone(map);
    const sd = json.layers[ROOM.layer].stages[ROOM.stage];
    sd.chestContents = { ...(sd.chestContents ?? {}) };
    if (content) sd.chestContents[ROOM.chest] = content;
    else delete sd.chestContents[ROOM.chest];
    await route.fulfill({ json });
  });
  const p = new URLSearchParams({
    fromEditor: '1', layer: ROOM.layer, stage: ROOM.stage, row: String(ROOM.r + 2), col: String(ROOM.c),
  });
  await page.goto(`${GAME}?${p.toString()}`);
  await waitForBoard(page);
  // 道具を初めて手にすると操作ヒントの会話が開き、文は会話を閉じるまで保留される
  // （`game/ui.js pulse`）∴ヒントは出し済みにしておく（arrow-floor-item.spec.js と同じ作法）。
  await page.evaluate(() => { window.__game.getPlayer()._shownSubItemHint = true; });
  if (before) await page.evaluate(before);
  // 2タイル上へ（1タイル＝movePlayer 2回）
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) { window.__game.movePlayer('up'); window.__game.step(1); }
  });
  await page.waitForFunction(() => {
    const bar = document.getElementById('msg-bar');
    return bar && !bar.classList.contains('hidden') && bar.textContent.length > 0;
  }, null, { timeout: 3000 });
}

/**
 * メッセージバーの頭の canvas が、その絵と1ドットも違わないか（＋宝箱の絵と違うか）。
 * @param spec UI_ICON のキー、または { spr, pal }（表の本当の絵＝rewardIconKey を通さない期待値）
 */
async function headIcon(page, key) {
  return page.evaluate(async (k) => {
    const { iconCanvas } = await import('/blade-of-lumia/shared/ui-icons.js');
    const bar = document.getElementById('msg-bar');
    const head = bar.firstChild;
    const url = (cv) => (cv ? cv.toDataURL() : null);
    return {
      isCanvas: head?.nodeName === 'CANVAS',
      text: bar.textContent,
      matches: url(head) === url(iconCanvas(k, 18)),
      isChest: url(head) === url(iconCanvas('chest', 18)),
    };
  }, key);
}

test.describe('Blade of Lumia – 宝箱の文の頭の絵（実機）', () => {

  for (const { sig, content } of KINDS) {
    test(`④ ${sig} の宝箱を開けると、文の頭が取った物の絵になる`, async ({ page }) => {
      await openWith(page, content);
      // 期待値は rewardIconKey を通さない＝導出が間違っても実機の本が道連れで緑にならない
      const want = expectedSpec(content);
      const got = await headIcon(page, want);
      expect(got.isCanvas, `文の頭が絵でない：${got.text}`).toBe(true);
      expect(got.isChest, `宝箱の絵のまま：${got.text}`).toBe(false);
      expect(got.matches, `頭の絵が ${JSON.stringify(want)} でない：${got.text}`).toBe(true);
      expect(got.text, '`{{…}}` が生文字で出ている').not.toContain('{{');
    });
  }

  test('⑤ 空の宝箱は宝箱の絵のまま（何も取っていない）', async ({ page }) => {
    await openWith(page, null);
    const got = await headIcon(page, 'chest');
    expect(got.text).toContain('宝箱は空だった');
    expect(got.isChest, `空箱の頭が宝箱の絵でない：${got.text}`).toBe(true);
  });

  test('⑥ 「もう持てない」で開けない宝箱も宝箱の絵のまま', async ({ page }) => {
    await openWith(page, { type: 'item', item: 'healPotion', name: '回復薬（小）' },
      () => { window.__game.giveSubItem('healPotion'); });
    const got = await headIcon(page, 'chest');
    expect(got.text).toContain('もう持てない');
    expect(got.isChest, `「もう持てない」の頭が宝箱の絵でない：${got.text}`).toBe(true);
  });

});
