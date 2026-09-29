// tests/heart-piece.spec.js
// ハートのかけら（実行キュー13・2026-09-29 ユーザー確定の報酬語彙①）。
//
// 仕様＝`HEART_PIECES_PER_HEART`（4）個集めるとハートの器1個になる。端数は
// `player.heartPieces`（0〜3）に持つ。宝箱には `{ type:'item', item:'heartPiece' }` で書く。
//
// 1セットで縛るもの（[[blade-bad-data-fix-five-layers]] と同じ「層を全部」の考え方）：
//   ① エンジン … 3つ目までは器にならず、4つ目で器1個（maxHearts/maxHp/hp の3点セット）＋端数0
//   ② 文言     … 「あと n つ」／「そろった！」がメッセージに出る
//   ③ セーブ   … 端数がセーブ→ロードで残る。壊れた値は 0〜3 の整数に丸まる
//   ④ 表示     … ポーズ画面に「かけら n/4」が出る（端数0のときは出ない）
//   ⑤ データ   … 世界に置いたかけらの総数が4の倍数（余ったかけらは器にならない＝死に報酬）
//   ⑥ 監査     … `shared/progression.js` がかけらを器に換算して最大ハート数に数える
//                 （レイヤーをまたいで4つ揃う場合も切り捨てない）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { HEART_PIECES_PER_HEART } from '../shared/items.js';
import { collectRewards, fieldRewardsOf, profilesAt, ORDER } from '../shared/progression.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// どこでもよい（grantReward は位置を見ない）＝chest-content-shape.spec.js と同じ部屋。
const START = `${GAME_URL}?fromEditor=1&layer=dungeon_7&stage=2,4&row=5&col=5`;
const PIECE = { type: 'item', item: 'heartPiece', name: 'ハートのかけら' };

test.describe('Blade of Lumia – ハートのかけら（エンジン・表示・セーブ）', () => {

  test('① ② 3つ目までは器にならず「あと n つ」、4つ目で器1個になり端数は0に戻る', async ({ page }) => {
    await page.goto(START);
    await waitForBoard(page);
    const steps = await page.evaluate((piece) => {
      const g = window.__game;
      const snap = () => {
        const p = g.getPlayer();
        return { pieces: p.heartPieces, maxHearts: p.maxHearts, maxHp: p.maxHp, hp: p.hp };
      };
      const before = snap();
      g.getPlayer().hp = 1;  // 器になった瞬間に全快することも見る
      const out = [];
      for (let i = 0; i < 4; i++) out.push({ msg: g.grantReward(piece), ...snap() });
      return { before, out };
    }, PIECE);
    const { before, out } = steps;
    expect(before.pieces, '初期状態の端数が0でない').toBe(0);
    for (let i = 0; i < 3; i++) {
      expect(out[i].pieces, `${i + 1}つ目の端数`).toBe(i + 1);
      expect(out[i].maxHearts, `${i + 1}つ目で器が増えた`).toBe(before.maxHearts);
      expect(out[i].msg, `${i + 1}つ目の文言`).toContain(`あと ${HEART_PIECES_PER_HEART - (i + 1)} つ`);
    }
    expect(out[3].pieces, '4つ目で端数が0に戻らない').toBe(0);
    expect(out[3].maxHearts, '4つ目で器が1個増えていない').toBe(before.maxHearts + 1);
    expect(out[3].maxHp, '最大HPが器1個ぶん増えていない').toBe(before.maxHp + (before.maxHp / before.maxHearts));
    expect(out[3].hp, '器になった瞬間に全快していない').toBe(out[3].maxHp);
    expect(out[3].msg, '4つ目の文言').toContain('ハートの器 になった');
  });

  test('かけらはサブアイテム欄に入らない（passive）', async ({ page }) => {
    await page.goto(START);
    await waitForBoard(page);
    const keys = await page.evaluate((piece) => {
      window.__game.grantReward(piece);
      window.__game.giveSubItem('heartPiece');
      return { slots: Object.keys(window.__game.getPlayer().subItems), pieces: window.__game.getPlayer().heartPieces };
    }, PIECE);
    expect(keys.slots, 'かけらがサブアイテム欄に入った').not.toContain('heartPiece');
    expect(keys.pieces, 'giveSubItem 経由でもかけらが数えられていない').toBe(2);
  });

  test('③ 端数はセーブ→ロードで残り、壊れた値は 0〜3 の整数に丸まる', async ({ page }) => {
    await page.goto(START);
    await waitForBoard(page);
    const out = await page.evaluate(async () => {
      const { sanitizeLoadedPlayer } = await import('/blade-of-lumia/game/save.js');
      const { ITEM_META } = await import('/blade-of-lumia/shared/items.js');
      // saveGame は player を丸ごと JSON にする（`{ ...player }`）＝同じ往復をここで再現する。
      const roundTrip = (p) => sanitizeLoadedPlayer(JSON.parse(JSON.stringify({ subItems: {}, ...p })), ITEM_META).heartPieces;
      return {
        kept:    roundTrip({ heartPieces: 3 }),
        legacy:  roundTrip({}),
        str:     roundTrip({ heartPieces: 'x' }),
        neg:     roundTrip({ heartPieces: -2 }),
        frac:    roundTrip({ heartPieces: 2.7 }),
        over:    roundTrip({ heartPieces: 9 }),
      };
    });
    expect(out.kept, '端数がロードで消えた').toBe(3);
    expect(out.legacy, 'かけら導入前のセーブが 0 にならない').toBe(0);
    expect(out.str, '数でない値が 0 にならない').toBe(0);
    expect(out.neg, '負の値が 0 にならない').toBe(0);
    expect(out.frac, '小数が切り捨てられない').toBe(2);
    expect(out.over, '4 以上が 3 で止まらない').toBe(3);
  });

  test('④ ポーズ画面に「かけら n/4」が出る（端数0では出ない）', async ({ page }) => {
    await page.goto(START);
    await waitForBoard(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.getState().isPaused === true, null, { timeout: 3000 });
    await expect(page.locator('#pause-heart-pieces'), '端数0なのに出ている').toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.getState().isPaused === false, null, { timeout: 3000 });

    await page.evaluate((piece) => { window.__game.grantReward(piece); window.__game.grantReward(piece); }, PIECE);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.getState().isPaused === true, null, { timeout: 3000 });
    await expect(page.locator('#pause-heart-pieces')).toHaveText(`かけら 2/${HEART_PIECES_PER_HEART}`);
    expect(await page.locator('#pause-heart-pieces canvas').count(), '4分割の絵が出ていない').toBe(1);
  });

});

test.describe('Blade of Lumia – ハートのかけら（データ・監査）', () => {

  test(`⑤ 世界に置いたかけらの総数は ${HEART_PIECES_PER_HEART} の倍数（余りは器にならない）`, () => {
    const where = [];
    for (const [layerName, layer] of Object.entries(map.layers)) {
      if (layerName.startsWith('test_')) continue;
      for (const [sk, st] of Object.entries(layer.stages ?? {})) {
        for (const src of ['chestContents', 'floorItems']) {
          for (const [cell, v] of Object.entries(st[src] ?? {})) {
            if (v?.item === 'heartPiece' || v?.type === 'heartPiece') where.push(`${layerName}[${sk}](${cell})`);
          }
        }
      }
    }
    expect(where.length % HEART_PIECES_PER_HEART, `かけらの総数 ${where.length}：\n${where.join('\n')}`).toBe(0);
  });

  test('⑥ 監査はかけらを器に換算する（レイヤーをまたいでも切り捨てない・3つでは増えない）', () => {
    const chest = (item) => ({ tiles: [['.']], chestContents: { '0,0': { type: 'item', item } } });
    const mk = (fieldPieces, d1Pieces) => ({
      layers: {
        field:     { stages: Object.fromEntries([...Array(fieldPieces)].map((_, i) => [`${i},0`, chest('heartPiece')])) },
        dungeon_1: { stages: Object.fromEntries([...Array(d1Pieces)].map((_, i) => [`${i},0`, chest('heartPiece')])) },
      },
    });
    const last = ORDER.length;
    const maxHearts = (m) => {
      const per = collectRewards(m);
      return profilesAt(last, per, fieldRewardsOf(per)).max.hearts;
    };
    const minAfterD1 = (m) => {
      const per = collectRewards(m);
      return profilesAt(ORDER.findIndex((cp) => cp.id === 'dungeon_1') + 1, per, fieldRewardsOf(per)).min.hearts;
    };
    expect(maxHearts(mk(0, 0)), '基準').toBe(3);
    expect(maxHearts(mk(2, 2)), 'field 2＋D1 2 で器1個にならない（レイヤーごとに切り捨てている）').toBe(4);
    expect(maxHearts(mk(3, 0)), '3つで器が増えた').toBe(3);
    expect(maxHearts(mk(4, 4)), '8つで器2個にならない').toBe(5);
    // min（必須レイヤーだけ）はフィールドのかけらを数えない＝D1 の4つだけが効く。
    expect(minAfterD1(mk(4, 4)), 'min に D1 のかけらが数えられていない／field まで数えた').toBe(4);
    // 返す諸元の形はかけら導入前と同じ（途中計算の `pieces` を漏らさない）。
    const per = collectRewards(mk(1, 0));
    expect(Object.keys(profilesAt(last, per, fieldRewardsOf(per)).max), '途中計算のキーが漏れた').not.toContain('pieces');
  });

});
