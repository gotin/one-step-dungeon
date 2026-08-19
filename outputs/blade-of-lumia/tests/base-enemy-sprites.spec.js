// tests/base-enemy-sprites.spec.js — 既存敵6体の「絵の条件」を 32×32 側へ上げた番人
// （Phase 5.5k k-10・2026-08-19）
//
// 対象＝本編に最初から居る6体（巡回兵 E／追跡者 C／騎士 F／魚群 &／潜み鮫 <／射水魚 /）。
// 新規15種は 32×32 で描かれていたが、この6体だけ 12×16 のまま残っていた＝同じ盤面で
// 「粗い敵」と「細かい敵」が混ざっていた（PLAN 5.5k k-10）。
//
// ⚠️ 表示サイズは変わらない：drawSprite は grid の大きさを canvas の大きさにし、
//   CSS（game/css/board.css の `.char-abs canvas.sprite{width:var(--cell)}`＋
//   image-rendering:pixelated）が1セルに縮める∴12×16→32×32 で大きさではなく細かさが上がる。
//
// ここで固定する不変条件（すべて「絵が機構を読ませられる状態か」を数える）：
//   ① 2フレーム・32×32（他の敵と同じ土台。行数が違うと表示倍率がずれて並ばない）
//   ② 32×32 の canvas を実際に使っている（行 18 以上・列 20 以上）
//      ＝12×16 の絵を隅に貼っただけの「見た目は同じ」回帰を赤くする（12列/16行では通らない）
//   ③ 待機2枚の差が 17ドット以上（SPRITE-PIPELINE.md §6 の下限＝止まって見えない）
//   ④ パレット＝index0 は透明・最大の色番号がパレット末尾と一致（絵と色表の食い違い）
//   ⑤ 背景から浮く：輪郭（index1）は背景より暗い／背景より明るいドットが全体の35%以上
//      ＝石床（stoneFloor 明部）と水（TILE_PAL.water の最明色）を**単一ソースから**引いて測る。
//      ⚠️ 陸の2体は床より暗い色を持つ（追跡者 #6a0808＝28.8／騎士 #501880＝43.4）が、
//         これは「体の内側の陰」＝設計どおり∴色ごとの下限ではなく**明色ドットの割合**で測る。
import { test, expect } from '@playwright/test';
import { ENEMY_SPRITES, ENEMY_PAL } from '../shared/sprites-enemies.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { TILE_PAL } from '../shared/sprites-tiles.js';

const lumOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
// 背景の輝度は shared/sprites-tiles.js のパレットから引く（数字を手書きしない）。
//   石床＝index1（#3a3848=57.6）＝既存スペック（charge-dash / blink-enemy / player-debuff）が
//     使っている「明部」と同じ基準。⚠️ stoneFloor には白(#ffffff)や煉瓦の明色も入っている∴
//     「パレットの最明色」ではなく**この index** を基準にする（基準を上げると他の敵の本と食い違う）。
//   水＝水棲の敵の背景。こちらは**最も明るい水色**（#2a6aaa=97.0）を採る＝厳しい側に振る。
const FLOOR_LUM = lumOf(TILE_PAL.stoneFloor[1]);
const WATER_LUM = Math.max(...TILE_PAL.water.filter(h => h !== 'transparent').map(lumOf));

// 対象6体は**タイルから ENEMY_META 経由で**引く（sprite 名を手書きしない＝改名で黙って
// 素通りしない。memory: 敵の表は ENEMY_META から導出する）。
const BASE_TILES = [TILE.PATROL, TILE.CHASER, TILE.SENTRY, TILE.FISH_SCHOOL, TILE.LURK_SHARK, TILE.ARCHER_FISH];

const dots = (a, b) => {
  let n = 0;
  for (let y = 0; y < a.length; y++) for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) n++;
  return n;
};

test.describe('Phase 5.5k k-10 — 既存敵6体の絵が 32×32 で背景から浮く', () => {

  test('① 6体とも ENEMY_META から絵とパレットが引ける（対象が黙って減らない）', () => {
    expect(BASE_TILES.length, '対象が6体でない').toBe(6);
    for (const tile of BASE_TILES) {
      const m = ENEMY_META[tile];
      expect(m, `ENEMY_META['${tile}'] が無い`).toBeTruthy();
      expect(ENEMY_SPRITES[m.sprite], `${tile}: ENEMY_SPRITES.${m.sprite} が無い`).toBeTruthy();
      expect(ENEMY_PAL[m.pal], `${tile}: ENEMY_PAL.${m.pal} が無い`).toBeTruthy();
    }
  });

  for (const tile of BASE_TILES) {
    const m = () => ENEMY_META[tile];

    test(`② ${tile}（${ENEMY_META[tile].name}）＝2フレーム・32×32・canvas を使い切っている`, () => {
      const frames = ENEMY_SPRITES[m().sprite];
      expect(frames.length, '待機は2フレーム').toBe(2);
      for (const [k, g] of frames.entries()) {
        expect(g.length, `frame${k} の行数が 32 でない＝他の敵と大きさが揃わない`).toBe(32);
        for (const row of g) expect(row.length, `frame${k} の列数が 32 でない`).toBe(32);
      }
      // 12×16 を隅に貼った回帰を赤くする（実測 rows 21-29 / cols 22-30）
      const g = frames[0];
      const rows = g.filter(r => r.some(v => v)).length;
      let cols = 0;
      for (let x = 0; x < 32; x++) if (g.some(r => r[x])) cols++;
      expect(rows, '絵が 18 行未満＝32×32 にしただけで中身が 12×16 のまま').toBeGreaterThanOrEqual(18);
      expect(cols, '絵が 20 列未満＝32×32 にしただけで中身が 12×16 のまま').toBeGreaterThanOrEqual(20);
    });

    test(`③ ${tile}（${ENEMY_META[tile].name}）＝待機2枚が動いて見える（17ドット以上）`, () => {
      const [a, b] = ENEMY_SPRITES[m().sprite];
      expect(dots(a, b), '待機2枚の差が 17ドット未満＝止まって見える（同じ絵の使い回し）')
        .toBeGreaterThanOrEqual(17);
    });

    test(`④ ${tile}（${ENEMY_META[tile].name}）＝パレットと絵が食い違っていない`, () => {
      const pal = ENEMY_PAL[m().pal], frames = ENEMY_SPRITES[m().sprite];
      expect(pal[0], 'index0 は透明').toBe('transparent');
      const maxIdx = Math.max(...frames.flat(2));
      expect(pal.length, `パレットの色数が足りない（最大の色番号 ${maxIdx}）`).toBeGreaterThan(maxIdx);
      expect(maxIdx, 'パレット末尾の色が絵で使われていない＝絵と色表が食い違っている')
        .toBe(pal.length - 1);
    });

    test(`⑤ ${tile}（${ENEMY_META[tile].name}）＝背景（${ENEMY_META[tile].move === 'water' ? '水' : '石床'}）から浮く`, () => {
      const pal = ENEMY_PAL[m().pal], g = ENEMY_SPRITES[m().sprite][0];
      const bg = m().move === 'water' ? WATER_LUM : FLOOR_LUM;
      expect(lumOf(pal[1]), `輪郭（index1）が背景（輝度 ${bg.toFixed(1)}）より明るい＝輪郭線として効かない`)
        .toBeLessThan(bg);
      let painted = 0, bright = 0;
      for (const row of g) for (const v of row) {
        if (!v) continue;
        painted++;
        if (lumOf(pal[v]) > bg) bright++;
      }
      // 実測 48〜68%。下限 35% ＝「体の主要部が背景より明るい」（沈む改変を赤くする）
      expect(bright / painted, `背景より明るいドットが ${(bright / painted * 100).toFixed(0)}%`
        + `＝背景（輝度 ${bg.toFixed(1)}）に沈んで輪郭しか見えない`).toBeGreaterThanOrEqual(0.35);
    });
  }
});
