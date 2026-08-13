import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Regression guard (added 2026-07-06): every sign ('i') tile on EVERY layer must
// carry RENDERABLE body text. A sign reads via openDialog(sd.name, sd.lines ??
// ['（何も書かれていない）']) (game/game.js:896), so it renders blank in two ways:
//   (a) no signData/npcData entry at all, or
//   (b) an entry that is a bare STRING (sd.lines is undefined) — the text is there
//       but in the wrong shape, so the game never shows it.
// Both are invisible to connectivity / axis tests and only surface in-game, so
// they slipped through repeatedly (5 empty in the 9-6 forest prototype, 3 empty in
// dungeon_3/6/7, 4 string-form in dungeon_5/8). This test requires the {name,
// lines:[非空文字列]} shape so either failure mode fails loudly.

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));

test('全レイヤーの看板(i)に本文がある（空看板ゼロ）', () => {
  const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  const empties = [];
  for (const [layer, layerObj] of Object.entries(data.layers)) {
    for (const [key, s] of Object.entries(layerObj.stages || {})) {
      const tiles = s.tiles;
      if (!tiles) continue;
      for (let r = 0; r < tiles.length; r++) {
        const row = Array.isArray(tiles[r]) ? tiles[r] : [...tiles[r]];
        for (let c = 0; c < row.length; c++) {
          if (row[c] !== 'i') continue;
          const pk = `${r},${c}`;
          const body = s.signData?.[pk] || s.npcData?.[pk];
          const ok = body && Array.isArray(body.lines) && body.lines.length > 0
            && body.lines.some((l) => typeof l === 'string' && l.trim().length > 0);
          if (!ok) empties.push(`${layer}/${key} @${pk}`);
        }
      }
    }
  }
  expect(empties, `本文の無い看板が見つかりました:\n${empties.join('\n')}`).toEqual([]);
});
