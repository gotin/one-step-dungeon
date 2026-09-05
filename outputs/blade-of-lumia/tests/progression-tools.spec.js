// tests/progression-tools.spec.js – 「そのレイヤーの中で使える道具」の導出（実行キュー 0g・2026-09-05）
//
// 何のためのテストか：この表は元々 `scripts/lib/progression.mjs` の**手書き** `UNLOCKED_AT` で、
// `shared/progression.js`（実マップから導出）と同じことを2通り言っていた。実際に1件腐っていた
// ＝`dungeon_8` に `flute`（D8 の報酬）が入っておらず、今は無害（整合性チェッカーが引くのは
// `ladder`/`bomb` だけ）だが**黙って腐る**形だった。0g で手書きを消して導出に一本化した∴
// ここは「導出が意味を保っているか」と「手書きが戻ってきていないか」を固定する。
//
// 表の意味（緩い上限）：`toolsUsableIn(map)[layer]` ＝ **入場時の所持 ∪ そのレイヤー自身の報酬**
//   ＝「そのレイヤーの中に居るあいだに使える道具」。D3 の弓は D3 の報酬だが、D3 の中で拾って
//     D3 の奥の弓ゲートを開ける∴含めるのが正しい。部屋の順序は見ない粒度（レイヤー単位）
//     ∴ソフトロックの厳密判定には使えない＝そこは接続検査／ソルバーの領分。
//
// 検証内容：
//   ①: 手書きの表が消えている（`scripts/lib/progression.mjs` が無い・誰も `UNLOCKED_AT` を import しない）
//   ②: 表の意味＝入場時 ∪ 自分の報酬（実マップの報酬配置から検算）＋必須レイヤーは単調増加
//   ③: 整合性チェッカーが実際に引く2道具のアンカー（はしご＝D5 以降・爆弾＝D6 以降）
//   ④: 寄道の入口要件（入るのに要る道具をその地点で持っている）
//   ⑤: 寄道の報酬は次の地点へ持ち越さない（合成マップで検算＝実マップの寄道は道具を落とさない）
//   ⑥: 進行地点の表示名は実マップの `layers[x].name` から導出（ORDER はダンジョン名を持たない）
//   ⑦: 手書き時代に抜けていた `dungeon_8` の笛が導出では入っている（ズレの回帰）
//   ⑧: レイヤーを持つ地点は全部マップ側に `name` があり、その名前が互いに衝突しない
//       （`secret_grotto` が `dungeon_7` の名前を借りていた回帰＝2026-09-05 に「秘密の洞窟」で解消）

import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { ORDER, SUB_ITEM_KEYS, collectRewards, toolsUsableIn, labelOf, labelsFrom } from '../shared/progression.js';

const repoFile = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readRepo = (rel) => readFileSync(repoFile(rel), 'utf8');

const MAP = JSON.parse(readRepo('../work/blade-of-lumia.json'));
const TABLE = toolsUsableIn(MAP);

test.describe('レイヤーの中で使える道具（導出）', () => {

  test('①: 手書きの表が消えている（scripts/lib/progression.mjs も UNLOCKED_AT の import も無い）', () => {
    expect(existsSync(repoFile('../scripts/lib/progression.mjs')),
      '手書きの表が復活している（shared/progression.js の toolsUsableIn が単一の真実）').toBe(false);
    // ソースのどこかが再び手書きの表を読み始めたら赤くする（コメント中の言及は許す）。
    const dirs = ['../scripts', '../scripts/lib', '../shared', '../game', '../editor', '../tests'];
    const offenders = [];
    for (const dir of dirs) {
      for (const f of readdirSync(repoFile(dir))) {
        if (!/\.(js|mjs)$/.test(f)) continue;
        const src = readFileSync(repoFile(`${dir}/${f}`), 'utf8');
        if (/import\s*\{[^}]*UNLOCKED_AT/.test(src)) offenders.push(`${dir}/${f}`);
      }
    }
    expect(offenders, 'UNLOCKED_AT を import しているファイルが残っている').toEqual([]);
  });

  test('②: 表の意味＝入場時 ∪ そのレイヤー自身の報酬（必須レイヤーは単調増加）', () => {
    const perLayer = collectRewards(MAP);
    const carried = new Set();
    for (const cp of ORDER) {
      if (!cp.layer) continue;
      const set = TABLE[cp.layer];
      expect(set, `${cp.layer} が表に無い（ORDER に載っているレイヤーは必ず出る）`).toBeTruthy();
      // 自分のレイヤーに置いてある道具は必ず含まれる（＝中で拾って中で使える）
      for (const item of perLayer.get(cp.layer)?.items ?? []) {
        expect(set.has(item), `${cp.layer} の報酬 ${item} が自分の表に無い`).toBe(true);
      }
      // 入場時の所持（必須レイヤーの積み上げ）は必ず含まれる＝落ちない
      for (const item of carried) {
        expect(set.has(item), `${cp.layer} で ${item} を失っている（表が単調でない）`).toBe(true);
      }
      // 表に載るのは道具名だけ（剣/盾/防具のティアは別軸＝混ぜない）
      for (const item of set) {
        expect(SUB_ITEM_KEYS, `${cp.layer} に道具でない ${item} が入っている`).toContain(item);
      }
      if (!cp.optional) for (const item of perLayer.get(cp.layer)?.items ?? []) carried.add(item);
    }
  });

  test('③: 整合性チェッカーが引く2道具のアンカー（はしご＝D5 以降・爆弾＝D6 以降）', () => {
    // `scripts/check-dungeon-integrity.mjs` の ITEM_LOCKED_TILES が引くのはこの2つだけ＝
    // ここが動くと「未取得のまま出口が封鎖される」の判定が黙って変わる∴進行順で固定する。
    const has = (layer, item) => TABLE[layer]?.has(item) ?? false;
    // はしごは D5 の報酬＝D5 の中では使える／D5 より前（D1〜D4・D6）では持っていない
    expect(has('dungeon_5', 'ladder'), 'D5 の中ではしごが使えない').toBe(true);
    for (const layer of ['dungeon_1', 'dungeon_2', 'dungeon_3', 'dungeon_4', 'dungeon_6']) {
      expect(has(layer, 'ladder'), `${layer} で はしご を持っている（D5 の報酬より前）`).toBe(false);
    }
    // 爆弾は D6 の報酬＝D6 の中では使える／D6 より前（D1〜D4）では持っていない
    expect(has('dungeon_6', 'bomb'), 'D6 の中で爆弾が使えない').toBe(true);
    for (const layer of ['dungeon_1', 'dungeon_2', 'dungeon_3', 'dungeon_4']) {
      expect(has(layer, 'bomb'), `${layer} で 爆弾 を持っている（D6 の報酬より前）`).toBe(false);
    }
    // D5 は進行順で D6 の後∴爆弾を持っている（進行順 D1→D2→D3→D4→D6→D5）
    expect(has('dungeon_5', 'bomb'), 'D5 で爆弾を持っていない（進行順は D6 → D5）').toBe(true);
  });

  test('④: 寄道は「入口を開ける道具」をその地点で持っている', () => {
    // 各寄道の入口の鍵＝実装済みの仕掛け（PLAN 8.5／9-6）。ここが崩れると入れない寄道になる。
    const NEED = {
      forest_cave:   ['bomb', 'candle'],                                     // 岩を爆弾で割る＋かがり火
      cave_1:        ['bomb', 'ladder'],
      secret_grotto: ['flute'],                                              // 笛 reveal で入口が出る
      void_shrine:   ['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute'], // 羽衣＝全道具の後
      warlord_lair:  ['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute'], // 同じ羽衣ゲート（0h）
    };
    for (const [layer, tools] of Object.entries(NEED)) {
      for (const tool of tools) {
        expect(TABLE[layer]?.has(tool), `${layer} の地点で ${tool} を持っていない`).toBe(true);
      }
    }
  });

  test('⑤: 寄道の報酬は次の地点へ持ち越さない（入らなくてもクリアできる＝下限に数えない）', () => {
    // 実マップの寄道は剣しか落とさない∴実データでは歯が立たない → 合成マップで測る。
    const fake = {
      layers: {
        dungeon_2:   { stages: { '0,0': { chestContents: { '1,1': { item: 'boomerang' } } } } },
        forest_cave: { stages: { '0,0': { chestContents: { '1,1': { item: 'flute' } } } } },
        dungeon_5:   { stages: { '0,0': { chestContents: { '1,1': { item: 'ladder' } } } } },
      },
    };
    const t = toolsUsableIn(fake);
    expect(t.forest_cave.has('flute'), '寄道の中でその寄道の報酬が使えない').toBe(true);
    // forest_cave は ORDER で dungeon_5 より前だが optional ∴ dungeon_5 へ漏れてはいけない
    expect(t.dungeon_5.has('flute'), '寄道の報酬が次の地点へ漏れている（下限が嘘になる）').toBe(false);
    expect(t.dungeon_5.has('boomerang'), '必須レイヤーの報酬が持ち越されていない').toBe(true);
  });

  test('⑥: 進行地点の表示名は実マップのレイヤー名から導出（ORDER は名前を手書きしない）', () => {
    // 手書きの名前は6件が実マップと食い違っていた（D1 森の遺跡／実際は草原の洞窟 など）。
    // `layer.name` は game/ui.js の HUD でプレイヤーに見えている側＝そちらが真実。
    const src = readRepo('../shared/progression.js');
    expect(src, 'ORDER に label が手書きで戻っている').not.toMatch(/\{\s*id:\s*'[a-z_0-9]+',\s*label:/);
    const labels = labelsFrom(MAP);
    for (const cp of ORDER) {
      const name = cp.layer ? MAP.layers?.[cp.layer]?.name : null;
      if (!name) continue;                       // マップに名前が無いレイヤーは fallback（secret_grotto）
      expect(labels.get(cp.id), `${cp.id} のラベルが実マップの名前「${name}」を含まない`).toContain(name);
      expect(labelOf(MAP, cp), `${cp.id} のラベルに進行上の位置（${cp.prefix}）が無い`).toContain(cp.prefix);
    }
  });

  test('⑧: レイヤーを持つ地点は全部マップに名前があり、名前が互いに衝突しない', () => {
    // 2026-09-05 まで `secret_grotto` は `name` を持たず、ORDER の fallback で
    // `dungeon_7` の実名「空中の遺跡」を名乗っていた＝監査出力に同名が2行並び、
    // プレイヤー側でも石碑が寄道を D7 の名前で呼んでいた（実マップの名前とロアを同時に直した）。
    const byName = new Map();
    for (const cp of ORDER) {
      if (!cp.layer) continue;                   // `start` だけはレイヤーを持たない＝fallbackName の領分
      const name = MAP.layers?.[cp.layer]?.name;
      expect(name, `${cp.layer} に name が無い＝ORDER の fallbackName に落ちる`).toBeTruthy();
      const seen = byName.get(name);
      expect(seen, `名前「${name}」が ${seen} と ${cp.layer} で衝突している`).toBeUndefined();
      byName.set(name, cp.layer);
    }
    expect(MAP.layers.secret_grotto.name, '寄道の名前が確定値から変わった').toBe('秘密の洞窟');
    // ORDER 側の fallbackName はもう `start` だけ（レイヤーを持つ地点は実マップが名前を持つ）。
    expect(ORDER.filter((cp) => cp.fallbackName).map((cp) => cp.id),
      'レイヤーを持つ地点に fallbackName が復活している').toEqual(['start']);
  });

  test('⑦: 手書き時代に抜けていた D8 の笛が導出では入っている', () => {
    // 旧 `UNLOCKED_AT.dungeon_8` は 5 道具（笛が無い）だったが、笛は D8 の報酬＝D8 の中では使える。
    // 実害は無かった（引かれない道具）が、これが「黙って腐っていた1件」の実体。
    const rewards = collectRewards(MAP).get('dungeon_8')?.items ?? [];
    expect(rewards, '笛は D8 の報酬ではなくなった（表の前提が変わった）').toContain('flute');
    expect(TABLE.dungeon_8.has('flute'), 'D8 の中で笛が使えない（導出の意味が壊れた）').toBe(true);
    // 笛より前の地点（D5・cave_1）では持っていない
    expect(TABLE.dungeon_5.has('flute'), 'D5 で笛を持っている（D8 の報酬より前）').toBe(false);
    expect(TABLE.dungeon_7.has('flute'), 'D7 で笛を持っていない（D8 の後）').toBe(true);
  });

});
