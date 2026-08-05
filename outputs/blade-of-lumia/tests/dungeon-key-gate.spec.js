// tests/dungeon-key-gate.spec.js
// ダンジョン進行の背骨（鍵）の不変条件テスト（2026-08-05 / PLAN 実行キュー5番）。
//
// 守るものは2つ。
//
// ① データ：全ダンジョンで「鍵の数 == 鍵扉の枚数」「links は配列」「全ての鍵に関門」
//    「鍵ゼロから全ての扉を開けきれる」。これは scripts/check-dungeon-integrity.mjs が
//    単一の判定点なので、テストは checker を実行して終了コードで縛る。
//    ⚠️ ここが緑でなかった頃、D5〜D8 は鍵0個で鍵扉があり**ボスに永久に到達できず**、
//       D5/D8 は links:{} で**入室した瞬間に TypeError で落ちていた**。それを
//       どのテストも検出しなかった＝「検査していない軸は必ず壊れる」の実例。
//
// ② 挙動：関門（showConditions killAll）が付いた鍵は、条件を満たすまで
//    「描画されない」「歩いても拾えない」「ブーメランでも運べない」。
//    3つ全部を塞がないと関門が意味を失う（描画だけ隠しても見えない鍵の上を歩けば拾える）。
//
// ⚠️ fromEditor=1 プレビューは debugMode=true ＝鍵無しで扉を素通りできるので、
//    鍵まわりの検証には使えない。セーブを仕込んで「つづきから」で入る（debugMode OFF）。
import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY } from './helpers.js';

const MAP_PATH   = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const CHECKER    = fileURLToPath(new URL('../scripts/check-dungeon-integrity.mjs', import.meta.url));
const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url));

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const DUNGEONS = [
  'dungeon_1', 'dungeon_2', 'dungeon_3', 'dungeon_4',
  'dungeon_5', 'dungeon_6', 'dungeon_7', 'dungeon_8', 'dark_tower',
];

// 検証に使う実データの座標。ライブマップの dungeon_5 [1,0]（中ボス W の部屋）。
const LAYER = 'dungeon_5';
const ROOM  = '1,0';
const KEY_R = 5, KEY_C = 7;

/** セーブを仕込んで「つづきから」で入る＝debugMode OFF の素の状態。 */
async function startAt(page, { row, col, boomerang = false }) {
  const save = JSON.stringify({
    player: {
      x: col, y: row,
      hp: 6, maxHp: 6, maxHearts: 3, atk: 99, def: 0, keys: 0,
      weapon: 'sword', shield: null, armor: null,
      subItems: boomerang ? { boomerang: { count: 99 } } : {},
      activeSubItem: boomerang ? 'boomerang' : null,
      rupees: 0, triforceCount: 0,
    },
    stageState: {},
    currentLayer: LAYER,
    stageKey: ROOM,
    heroDir: 'right',
  });
  await page.addInitScript(({ k, v }) => {
    try { localStorage.setItem(k, v); } catch { /* noop */ }
  }, { k: SAVE_KEY, v: save });
  await page.goto(GAME_URL);
  await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#btn-continue').click();
  await page.waitForFunction(() => {
    const b = document.getElementById('board');
    return !!b && b.children.length > 0;
  });
}

async function walk(page, dir, n) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(d => window.__game.movePlayer(d), dir);
    await page.evaluate(() => window.__game.step(1));
  }
}

/**
 * 部屋の敵を全員倒す（killAll 条件の成立トリガー）。
 *
 * ⚠️ 鍵部屋の番人は中ボス（W = isBoss）なので、HP0 でも即座には消えない。
 *    boss.js onBossDefeated が点滅→爆発→ファンファーレの**実時間**演出（await sleep）を
 *    挟んでから enemies から除去し、そこで evaluateConditions を呼ぶ。
 *    ∴ __game.step(n) の手動 tick では進まない＝実時間で待つ必要がある。
 */
async function killEveryEnemy(page) {
  await page.evaluate(() => {
    for (const e of window.__game.getEnemies()) {
      window.__game.dealDamage(e.id, 9999);
    }
  });
  await page.waitForFunction(() => window.__game.getEnemies().length === 0, null, { timeout: 15_000 });
}

test.describe('Blade of Lumia – ダンジョンの鍵（進行の背骨）', () => {

  test('① 整合性チェッカーが全ダンジョンで緑（鍵の収支・links・関門・順序）', () => {
    // 落ちたときに何がおかしいのかを読めるよう、標準出力をそのまま添える。
    let out = '';
    try {
      out = execFileSync('node', [CHECKER], { cwd: PROJECT_DIR, encoding: 'utf8' });
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      throw new Error(`check-dungeon-integrity.mjs が失敗した:\n${out}`);
    }
    expect(out).toContain('❌ 0 エラー');
  });

  test('① links は全ダンジョン全部屋で配列（{} は refreshGates を TypeError で殺す）', () => {
    for (const layerName of DUNGEONS) {
      for (const [stageKey, stage] of Object.entries(map.layers[layerName].stages)) {
        if (stage.links === undefined) continue;
        expect(Array.isArray(stage.links), `${layerName} [${stageKey}] の links`).toBe(true);
      }
    }
  });

  test('① 全ての鍵に killAll 関門が付いている（床置きの鍵ゼロ）', () => {
    let total = 0;
    for (const layerName of DUNGEONS) {
      for (const [stageKey, stage] of Object.entries(map.layers[layerName].stages)) {
        for (let r = 0; r < stage.rows; r++) {
          for (let c = 0; c < stage.cols; c++) {
            if (stage.tiles[r]?.[c] !== 'K') continue;
            total++;
            const cond = stage.showConditions?.[`${r},${c}`];
            expect(cond?.trigger, `${layerName} [${stageKey}] (${r},${c}) の鍵の関門`).toBe('killAll');
          }
        }
      }
    }
    // 鍵が消える方向の回帰（K を消せば「全ての鍵に関門」は自明に真になる）も防ぐ。
    expect(total, 'ダンジョン内の鍵の総数').toBe(10);
  });

  test('② 敵を倒す前：鍵は描画されず、踏んでも拾えない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startAt(page, { row: KEY_R, col: 5 });

    // 描画されていない（item-sprite が無い）。
    const spriteBefore = await page.locator(
      `.cell[data-row="${KEY_R}"][data-col="${KEY_C}"] .item-sprite`
    ).count();
    expect(spriteBefore).toBe(0);

    // 鍵のセルまで歩いて踏む。見えない鍵の上を歩いても拾えないこと。
    await walk(page, 'right', 4);   // movePlayer 1回＝0.5セル ∴ col5 → col7
    const st = await page.evaluate(() => window.__game.getState());
    expect(Math.round(st.player.x)).toBe(KEY_C);
    expect(st.player.keys).toBe(0);
    const ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.pickedKeys ?? []).not.toContain(`${KEY_R},${KEY_C}`);
    expect(errors).toEqual([]);
  });

  test('② 敵を全滅させると鍵が出現し、踏んで拾える', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startAt(page, { row: KEY_R, col: 5 });

    await killEveryEnemy(page);
    const ssAfterKill = await page.evaluate(() => window.__game.getStageState());
    expect(ssAfterKill.conditionsMet ?? []).toContain(`${KEY_R},${KEY_C}`);
    const spriteAfter = await page.locator(
      `.cell[data-row="${KEY_R}"][data-col="${KEY_C}"] .item-sprite`
    ).count();
    expect(spriteAfter).toBe(1);

    await walk(page, 'right', 4);   // movePlayer 1回＝0.5セル ∴ col5 → col7
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.keys).toBe(1);
    expect(errors).toEqual([]);
  });

  test('② 敵を倒す前：ブーメランでも鍵を運べない（描画ガードだけでは塞げない抜け道）', async ({ page }) => {
    await startAt(page, { row: KEY_R, col: 5, boomerang: true });

    const before = await page.evaluate(() => {
      const keys = window.__game.getState().player.keys;
      window.__game.useSubItem();      // 右向きに投げる → (5,6) (5,7) を通過
      window.__game.step(12);          // 往復しきるまで進める
      return { keys, after: window.__game.getState().player.keys };
    });
    expect(before.after).toBe(before.keys);

    // 全滅後は同じ投げ方で運べる＝ガードが「条件未達のときだけ」効いている確認。
    await killEveryEnemy(page);
    const after = await page.evaluate(() => {
      window.__game.useSubItem();
      window.__game.step(12);
      return window.__game.getState().player.keys;
    });
    expect(after).toBe(1);
  });

  test('② dungeon_5 に入って落ちない（links:{} の入室即死クラッシュの回帰）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startAt(page, { row: KEY_R, col: 5 });
    // board が描画されている＝refreshGates が例外を投げていない。
    const cells = await page.locator('#board .cell').count();
    expect(cells).toBe(map.layers[LAYER].stages[ROOM].rows * map.layers[LAYER].stages[ROOM].cols);
    expect(errors).toEqual([]);
  });

});
