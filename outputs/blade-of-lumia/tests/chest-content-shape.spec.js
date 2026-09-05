// tests/chest-content-shape.spec.js
// 宝箱データの形式検査（2026-08-07 / ユーザー報告バグ回帰）。
//
// 報告＝「D8 の宝箱の中身が shield なのに盾として認識されず、Bボタンのサブアイテムとして
// 登録されている風で、Bボタンを押しても何も起きない」。
//
// 実体＝`chestContents` に **誤形式**が3件混在していた：
//   dungeon_1 [3,0] (3,10) … {type:'armor', tier:0}          （正: armorTier）
//   dungeon_5 [0,1] (4,6)  … {type:'item', item:'shield', shieldTier:1}
//   dungeon_8 [0,0] (7,3)  … {type:'item', item:'shield', tier:2, name:'ミラーシールド'}
//
// `game/player.js grantReward()` は `content.type` で分岐する（'weapon'/'armor'/'shield'/
// 'boomerang'/'item'/...）。**盾/鎧/剣/ブーメランの装備系は `type` をその装備種別自体に
// する**（`type:'weapon', swordTier`／`type:'armor', armorTier`／`type:'shield', shieldTier`／
// `type:'boomerang', boomerangTier`）。`type:'item'` は `giveSubItem(content.item)` を呼ぶ
// **通常サブアイテム専用**の経路＝装備系の id を渡すと `ITEM_META['shield']` には
// `type`/`uses` が無い（`EQUIP_META['shield']` の方にしか無い）ので
// `giveSubItem` の `meta?.type === 'passive'` にも当たらず、無条件に
// `player.subItems.shield = {count:1}` を作って `activeSubItem` に登録してしまう
// （＝報告どおり「Bボタンのサブアイテムとして認識される」）。`useSubItem()` は
// `id==='shield'` の分岐を持たない（盾は着脱でなく `equipShieldTier` で装備するもの）ので
// **Bボタンを押しても何も起きない**（末尾の `pulse('たて を使用！')` すら出ない場合は
// dispatch のどの分岐にも当たらず何も実行されていないことを意味する）。
//
// この検査は「壁テンプレ」ではなく**データの形式**を全ダンジョン横断で縛る＝
// 個別の部屋を直しても同じ誤形式が別の部屋にまた紛れ込むのを機械的に防ぐ。
//
// ── 2026-09-05 の追記（ユーザー報告「escape のサブ画面に rupee と文字列で出る」）──
// `type:'item', item:'rupee'` の宝箱が **22件**（`coin` 2件・`redPotion`/`healPotionL` 8件も）
// 世界中に散っていた。ルピーは所持金（`player.rupees`）でサブアイテムではない∴
// `giveSubItem('rupee')` が `ITEM_META` に無い id でスロットを作り、ポーズ画面が
// スプライトも名前も引けず生の id を文字で並べていた（`game/ui.js` は `ITEM_META[id]?.name ?? id`）。
// 直したのは `scripts/migrate-chest-contents.mjs`（データ）＋ `giveSubItem` のガード（エンジン）。
// ここに増やした検査は **type だけでなく item / value の中身**まで縛る＝type が正しくても
// 渡せない id・数でない額面なら同じ実害が出る。
//
// ⚠️ 検査の対象は**全レイヤー**（`test_` を含む）。以前は「test_ は死んだデータでも無害」として
// 除外していたが、ギミック検証ステージは今やライブマップの `test_mechanics` レイヤーそのもので
// テストが実際に歩く場所＝除外したせいで `test_mechanics/7,0@2,10` の旧形式
// `{items:[{type:'compass'}]}`（開けても無言の宝箱）を1年近く見逃していた。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { ITEM_META } from '../shared/items.js';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const PLAYER_SRC = readFileSync(fileURLToPath(new URL('../game/player.js', import.meta.url)), 'utf8');

const ALL_LAYERS = Object.entries(map.layers);

/** 全レイヤーの宝箱を1件ずつ返す（`{ where, content }`）。 */
function* eachChest() {
  for (const [layerName, layer] of ALL_LAYERS) {
    for (const [room, stage] of Object.entries(layer.stages)) {
      for (const [cell, content] of Object.entries(stage.chestContents ?? {})) {
        yield { where: `${layerName}[${room}](${cell})`, content };
      }
    }
  }
}

// content.type ごとに必須の tier フィールド名（EQUIP_META 系＝装備の持ち替え判定）。
// ⚠️ boomerang はここに入れない＝初回入手は `type:'item', item:'boomerang'`
//   （`ITEM_META.boomerang` 経由の通常サブアイテム）が正しい形。`type:'boomerang'`＋
//   `boomerangTier` はブーメランの**ティア差し替え報酬**（海の主の銀ブーメラン）専用で、
//   dungeon_2 の初回入手はこれではない＝boomerang は weapon/armor/shield と同列に扱えない。
const TIER_FIELD = {
  weapon: 'swordTier',
  armor: 'armorTier',
  shield: 'shieldTier',
};
// type:'item' の item に来てはいけない装備系 id（EQUIP_META にしかない＝ITEM_META 側に
// type/uses が無く giveSubItem が誤って通常サブアイテム扱いしてしまう＝報告バグの実体）。
const EQUIP_ONLY_IDS = new Set(['sword', 'armor', 'shield']);

// grantReward が実際に受け付ける種別＝**エンジンのソースから導出する**（手書きの表を持たない）。
// 手書きにすると分岐を増減したときに表が静かに古くなって検査が緩む∴唯一の真実は
// `game/player.js grantReward()` の `content.type === '…'` そのもの。
const GRANTABLE_TYPES = (() => {
  const from = PLAYER_SRC.indexOf('function grantReward(content)');
  const body = PLAYER_SRC.slice(from, PLAYER_SRC.indexOf('\n\t// ── 宝箱を開ける', from));
  return new Set([...body.matchAll(/content\.type === '([a-zA-Z]+)'/g)].map((m) => m[1]));
})();

test.describe('Blade of Lumia – 宝箱データの形式（chestContents）', () => {

  test('装備系（weapon/armor/shield）の中身は type がその装備種別自体になっている（type:"item" ではない）', () => {
    const violations = [];
    for (const { where, content } of eachChest()) {
      if (content.type === 'item' && EQUIP_ONLY_IDS.has(content.item)) {
        violations.push(`${where}: type:'item', item:'${content.item}' ` +
          `（正: type:'${content.item === 'sword' ? 'weapon' : content.item}'）`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  test('装備系の中身は正しい tier フィールド名を持っている（tier ではなく swordTier/armorTier/shieldTier/boomerangTier）', () => {
    const violations = [];
    for (const { where, content } of eachChest()) {
      const tierField = TIER_FIELD[content.type];
      if (!tierField) continue;
      if (!(tierField in content)) {
        violations.push(`${where}: type:'${content.type}' に ` +
          `${tierField} が無い（あるキー: ${Object.keys(content).join(',')}）`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  test('chestContents の type は grantReward が知っている種別だけ（typo で永久に無反応の宝箱を作らない）', () => {
    const violations = [];
    for (const { where, content } of eachChest()) {
      if (!GRANTABLE_TYPES.has(content.type)) {
        violations.push(`${where}: 未知の type '${content.type}'`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  // ⚠️ 上の検査は種別の一覧を `game/player.js` のソースから導出している（手書きの表を持たない）。
  // 導出そのものが空振り（正規表現が当たらない・関数を切り出した等）だと検査が黙って
  // 全通しになる∴**導出できた中身**を明示的に固定しておく。エンジンに分岐を増減したら
  // ここが落ちる＝「宝箱の新しい種別を足した」ことをレビューで必ず通す関門になる。
  test('種別の一覧が grantReward から導出できている（導出の空振りで検査が緩まない）', () => {
    expect([...GRANTABLE_TYPES].sort(), 'grantReward の分岐が変わった（意図した変更ならこの一覧を更新する）')
      .toEqual(['armor', 'boomerang', 'heartContainer', 'item', 'ladder', 'rupee', 'shield', 'weapon']);
  });

  test("type:'item' の item は ITEM_META に在る id だけ（rupee のような綴りが持ち物欄にゴミを作らない）", () => {
    const violations = [];
    for (const { where, content } of eachChest()) {
      if (content.type !== 'item') continue;
      if (!ITEM_META[content.item]) {
        violations.push(`${where}: ITEM_META に無い item '${content.item}'`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  // 地図・コンパスは床タイル専用（`pickDungeonItem` が `player.dungeonItems` に立てる）。
  // `giveSubItem` の passive 分岐はこの2つを扱わない∴宝箱に入れても何も起きない
  // ＝「開けたのに手に入らない」宝箱をデータで作れないようにする。
  test("type:'item' の item は grantable な id だけ（地図・コンパスは宝箱から渡せない）", () => {
    const violations = [];
    for (const { where, content } of eachChest()) {
      if (content.type !== 'item') continue;
      if (ITEM_META[content.item]?.grantable === false) {
        violations.push(`${where}: 宝箱から渡せない item '${content.item}'（床タイル専用）`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  // `player.rupees += content.value` ＝数でない額面（旧データの `value:'large'`）は
  // **文字列連結**になり所持ルピーが "12large" に化けて HUD もセーブも壊れる。
  test("type:'rupee' の額面は有限の正の数（'large' のような文字列で所持金を壊さない）", () => {
    const violations = [];
    for (const { where, content } of eachChest()) {
      if (content.type !== 'rupee') continue;
      if (!Number.isFinite(content.value) || content.value <= 0) {
        violations.push(`${where}: 額面が数でない/0以下 value=${JSON.stringify(content.value)}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

});

// ── エンジン側の受け口（データを直しても、また同じ指定をされたら弾く）─────────
const GAME = '/blade-of-lumia/game/';
const D7_RUPEE = { stage: '2,4', chest: { r: 2, c: 5 }, value: 5 };  // ユーザーが報告した部屋そのもの

/** n タイル歩く（1 タイル = movePlayer 2回・MOVE_STEP 0.5）。 */
async function walkTiles(page, dir, tiles = 1) {
  await page.evaluate(({ d, n }) => {
    for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
  }, { d: dir, n: tiles });
}

test.describe('Blade of Lumia – 宝箱の報酬（エンジン）', () => {

  test('ルピーの宝箱は所持金だけを増やし、サブアイテム欄を1つも増やさない（報告バグの本体）', async ({ page }) => {
    const p = new URLSearchParams({
      fromEditor: '1', layer: 'dungeon_7', stage: D7_RUPEE.stage,
      row: String(D7_RUPEE.chest.r + 2), col: String(D7_RUPEE.chest.c),
    });
    await page.goto(`${GAME}?${p.toString()}`);
    await waitForBoard(page);

    const before = await page.evaluate(() => ({
      rupees: window.__game.getPlayer().rupees,
      slots:  Object.keys(window.__game.getPlayer().subItems).length,
    }));

    await walkTiles(page, 'up', 2);
    expect(await page.evaluate(() => {
      const pl = window.__game.getState().player;
      return { r: Math.floor(pl.y + 0.5), c: Math.floor(pl.x + 0.5) };
    }), '宝箱のセルに立てていない').toEqual({ r: D7_RUPEE.chest.r, c: D7_RUPEE.chest.c });

    const after = await page.evaluate(() => ({
      rupees: window.__game.getPlayer().rupees,
      slots:  Object.keys(window.__game.getPlayer().subItems),
    }));
    expect(after.rupees - before.rupees, 'ルピーが額面どおり増えていない').toBe(D7_RUPEE.value);
    expect(after.slots.length, 'ルピーでサブアイテム欄が増えた').toBe(before.slots);
    expect(after.slots, 'rupee がサブアイテムとして登録された').not.toContain('rupee');

    // ポーズ画面（Escape のサブ画面）に "rupee" の文字が出ない＝報告の見た目そのもの。
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.getState().isPaused === true, null, { timeout: 3000 });
    expect(await page.locator('#pause-items').innerText(), 'ポーズ画面に生の id が出ている')
      .not.toContain('rupee');
  });

  test('ITEM_META に無い id／渡せない id の宝箱はスロットを作らず「手に入れた！」とも言わない', async ({ page }) => {
    await page.goto(`${GAME}?fromEditor=1&layer=dungeon_7&stage=${D7_RUPEE.stage}&row=5&col=5`);
    await waitForBoard(page);
    const res = await page.evaluate(() => {
      const out = [];
      for (const id of ['rupee', 'coin', 'redPotion', 'dungeonMap', 'compass']) {
        const msg   = window.__game.grantReward({ type: 'item', item: id, name: `にせ${id}` });
        out.push({ id, msg, has: id in window.__game.getPlayer().subItems });
      }
      return out;
    });
    for (const r of res) {
      expect(r.has, `${r.id} のスロットが作られた`).toBe(false);
      expect(r.msg, `${r.id} で「手に入れた！」と嘘をついた`).toBe('');
    }
  });

  test('数でないルピー額面でも所持金は数のまま（文字列連結で HUD とセーブを壊さない）', async ({ page }) => {
    await page.goto(`${GAME}?fromEditor=1&layer=dungeon_7&stage=${D7_RUPEE.stage}&row=5&col=5`);
    await waitForBoard(page);
    const after = await page.evaluate(() => {
      const before = window.__game.getPlayer().rupees;
      window.__game.grantReward({ type: 'rupee', value: 'large' });
      return { before, now: window.__game.getPlayer().rupees };
    });
    expect(typeof after.now, '所持ルピーが数でなくなった').toBe('number');
    expect(after.now, '数でない額面が既定の 1 として足されていない').toBe(after.before + 1);
  });

  test('既に汚染されたセーブはロード時に自己修復する（sanitizeLoadedPlayer が未知 id を落とす）', async ({ page }) => {
    await page.goto(`${GAME}?fromEditor=1&layer=dungeon_7&stage=${D7_RUPEE.stage}&row=5&col=5`);
    await waitForBoard(page);
    const out = await page.evaluate(async () => {
      const { sanitizeLoadedPlayer } = await import('/blade-of-lumia/game/save.js');
      const { ITEM_META } = await import('/blade-of-lumia/shared/items.js');
      const player = sanitizeLoadedPlayer({
        subItems: { rupee: { count: 6 }, bomb: { count: 9 }, heartContainer: { count: 3 } },
        activeSubItem: 'rupee',
      }, ITEM_META);
      return { keys: Object.keys(player.subItems), active: player.activeSubItem };
    });
    expect(out.keys, '未知 id（rupee）が残っている').not.toContain('rupee');
    expect(out.keys, 'passive（heartContainer）が残っている').not.toContain('heartContainer');
    expect(out.keys, '正しいサブアイテムまで消した').toContain('bomb');
    expect(out.active, '選択中のサブアイテムが未知 id のまま').toBe('bomb');
  });

});
