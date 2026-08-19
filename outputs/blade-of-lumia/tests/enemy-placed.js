// Phase 5.5m — 「本編レイヤーに配置済み」を測る共通ヘルパー
//
// 5.5k の各 spec は「まだ本編に置いていない（部品のみ）」を不変条件にしていた。
// 5.5m で配置した∴各 spec のその1本を「配置されている・かつ想定の部屋にだけ居る」へ
// 書き換える（sea-enemies ⑨ が辿った道と同じ）。5本で同じ走査を書き写さないためここへ出す。
//
// 配置の意図そのもの（脅威度の梯子・弱点の関門・着地セル・向き）は
// `tests/enemy-placement.spec.js` が持つ。ここは各機構の spec が自分の敵について
// 「世界に居る」「知らない部屋に湧いていない」だけを見るための最小の道具。

import { NEW_ENEMY_PLACEMENT } from '../scripts/lib/enemy-placement.mjs';
import { gameLayerEntries } from '../shared/layers.js';

// 5.5m の配置表に載っている部屋（`layer/stage`）
export const PLACEMENT_STAGES = new Set(NEW_ENEMY_PLACEMENT.map(e => `${e.layer}/${e.stage}`));

/**
 * 指定タイルが本編レイヤー（test_mechanics 等を除く）のどこに居るかを集める。
 * @returns {Record<string, string[]>} タイル → ['layer/stage (r,c)', ...]
 */
export function placedCells(MAP, tiles) {
  const want = new Set(tiles);
  const out = {};
  for (const t of want) out[t] = [];
  for (const [layerName, layer] of gameLayerEntries(MAP)) {
    for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
      const rows = stage.tiles ?? [];
      for (let r = 0; r < rows.length; r++) {
        const row = Array.isArray(rows[r]) ? rows[r] : String(rows[r]).split('');
        for (let c = 0; c < row.length; c++) {
          if (want.has(row[c])) out[row[c]].push(`${layerName}/${sk} (${r},${c})`);
        }
      }
    }
  }
  return out;
}

/** 'layer/stage (r,c)' → 'layer/stage' */
export const stageIdOf = (loc) => loc.split(' ')[0];
