// @ts-check
// 実行キュー82⑩（2026-10-18・Fable 実装レビュー #8）。
// 関門の条件「アイテム所持（hasItem）」は、道具の所持の単一の真実 `shared/items.js ownsItem` で判定する。
// 直す前＝`conditions.js` が `player.subItems[item] || player.weapon === item` を自前で見ていた＝
// はしご・疾風の靴・金の装束・盾（所持を別の旗で持つ道具＝ITEM_OWNED_FLAG）は永遠に「持っていない」になり、
// エディタで置いた関門が警告も無く開かなかった（今のマップに hasItem の関門は 0 件＝実害はまだ無い）。
// 判定はページの中で `createConditions` を偽の deps で組んで回す（成立すると効果音を鳴らす＝ブラウザが要る）。
import { test, expect } from '@playwright/test';
import { GAME_URL, waitForBoard } from './helpers.js';
import { ITEM_OWNED_FLAG } from '../shared/items.js';

const cases = [
  // 別の旗で持つ道具（盾は equipShieldTier が 'shield' を入れる）
  ...Object.entries(ITEM_OWNED_FLAG).map(([item, flag]) => ({ item, patch: { [flag]: flag === 'shield' ? 'shield' : true }, want: true })),
  // サブアイテム・武器は今までどおり
  { item: 'bow', patch: { subItems: { bow: { count: 3 } } }, want: true },
  { item: 'sword', patch: { weapon: 'sword' }, want: true },
  // 持っていなければ成立しない
  ...[...Object.keys(ITEM_OWNED_FLAG), 'bow'].map((item) => ({ item, patch: {}, want: false })),
];

test('hasItem の関門は ownsItem と同じ基準で成立する', async ({ page }) => {
  await page.goto(`${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1`);
  await waitForBoard(page);
  const got = await page.evaluate(async (cases) => {
    const { createConditions } = await import('/blade-of-lumia/game/conditions.js');
    return cases.map(({ item, patch }) => {
      const player = { x: 0, y: 0, subItems: {}, weapon: null, ...patch };
      const ss = { conditionsMet: new Set(), stonePositions: {}, switchStates: {} };
      const stage = { rows: 1, cols: 1, tiles: [['.']], showConditions: { '0,0': { trigger: 'hasItem', item } } };
      const { evaluateConditions } = createConditions({
        getStageData: () => stage, getEnemies: () => [], getPlayer: () => player,
        getCurrentLayer: () => 'field', getStageKey: () => '0,0', getSS: () => ss,
        toTileRow: (v) => Math.floor(v + 0.5), toTileCol: (v) => Math.floor(v + 0.5),
        renderBoard: () => {}, renderChars: () => {},
      });
      evaluateConditions();
      return ss.conditionsMet.has('0,0');
    });
  }, cases);
  cases.forEach((c, i) => expect(got[i], `${c.item} ${JSON.stringify(c.patch)}`).toBe(c.want));
});
