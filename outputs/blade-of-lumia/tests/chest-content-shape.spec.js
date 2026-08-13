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
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// test_mechanics はギミック検証専用レイヤー（プレイヤーが実際に踏む本編コンテンツではない）
// ＝`{items:[...]}` のような別形式の死んだデータが残っていても本編には無関係。
const LIVE_LAYERS = Object.entries(map.layers).filter(([name]) => !name.startsWith('test_'));

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

test.describe('Blade of Lumia – 宝箱データの形式（chestContents）', () => {

  test('装備系（weapon/armor/shield）の中身は type がその装備種別自体になっている（type:"item" ではない）', () => {
    const violations = [];
    for (const [layerName, layer] of LIVE_LAYERS) {
      for (const [room, stage] of Object.entries(layer.stages)) {
        for (const [cell, content] of Object.entries(stage.chestContents ?? {})) {
          if (content.type === 'item' && EQUIP_ONLY_IDS.has(content.item)) {
            violations.push(`${layerName}[${room}](${cell}): type:'item', item:'${content.item}' ` +
              `（正: type:'${content.item === 'sword' ? 'weapon' : content.item}'）`);
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  test('装備系の中身は正しい tier フィールド名を持っている（tier ではなく swordTier/armorTier/shieldTier/boomerangTier）', () => {
    const violations = [];
    for (const [layerName, layer] of LIVE_LAYERS) {
      for (const [room, stage] of Object.entries(layer.stages)) {
        for (const [cell, content] of Object.entries(stage.chestContents ?? {})) {
          const tierField = TIER_FIELD[content.type];
          if (!tierField) continue;
          if (!(tierField in content)) {
            violations.push(`${layerName}[${room}](${cell}): type:'${content.type}' に ` +
              `${tierField} が無い（あるキー: ${Object.keys(content).join(',')}）`);
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  test('chestContents の type は grantReward が知っている種別だけ（typo で永久に無反応の宝箱を作らない）', () => {
    const KNOWN_TYPES = new Set([
      'item', 'weapon', 'armor', 'shield', 'boomerang', 'rupee', 'heartContainer', 'ladder',
    ]);
    const violations = [];
    for (const [layerName, layer] of LIVE_LAYERS) {
      for (const [room, stage] of Object.entries(layer.stages)) {
        for (const [cell, content] of Object.entries(stage.chestContents ?? {})) {
          if (!KNOWN_TYPES.has(content.type)) {
            violations.push(`${layerName}[${room}](${cell}): 未知の type '${content.type}'`);
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

});
