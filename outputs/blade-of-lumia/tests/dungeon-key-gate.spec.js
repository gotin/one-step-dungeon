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
// 倉庫番型（D4・5.5e）の最短手順を実機で再生するために状態空間ソルバーを使う
// （tests/sokoban-tiers.spec.js と同じ作法＝手順をテストに焼かない）。
import { makeSolver } from '../scripts/lib/blade-solver.mjs';

const MAP_PATH   = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const CHECKER    = fileURLToPath(new URL('../scripts/check-dungeon-integrity.mjs', import.meta.url));
const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url));

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const DUNGEONS = [
  'dungeon_1', 'dungeon_2', 'dungeon_3', 'dungeon_4',
  'dungeon_5', 'dungeon_6', 'dungeon_7', 'dungeon_8', 'dark_tower',
];

// 検証に使う実データの座標。ライブマップの dungeon_1 [1,0]（中ボス W の部屋）。
// ⚠️ 以前はここに dungeon_5 [1,0] を使っていたが、5.5d で switchOn（はしご2段）に
//    差し替えたため、汎用の killAll 挙動テストは D1（§7-2 ⑥＝据え置き確定）に移した。
const LAYER = 'dungeon_1';
const ROOM  = '1,0';
const KEY_R = 8, KEY_C = 9;

/** セーブを仕込んで「つづきから」で入る＝debugMode OFF の素の状態。 */
async function startAt(page, { row, col, boomerang = false, bow = false, layer = LAYER, room = ROOM, dir = 'right' }) {
  const subItems = {};
  if (boomerang) subItems.boomerang = { count: 99 };
  if (bow) subItems.bow = { count: 99 };
  const active = boomerang ? 'boomerang' : bow ? 'bow' : null;
  const save = JSON.stringify({
    player: {
      x: col, y: row,
      hp: 6, maxHp: 6, maxHearts: 3, atk: 99, def: 0, keys: 0,
      weapon: 'sword', shield: null, armor: null,
      subItems,
      activeSubItem: active,
      rupees: 0, triforceCount: 0,
    },
    stageState: {},
    currentLayer: layer,
    stageKey: room,
    heroDir: dir,
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

  test('① 10個の鍵すべてに、その部屋の型どおりの関門が付いている', () => {
    // キュー5番では全部 killAll で背骨を通し、5.5 で1部屋ずつ本物の型へ差し替える
    // （型の割り当ては PUZZLE-DESIGN.md §7-4）。**差し替え済みの部屋はその型を固定し、
    // 未着手の部屋は killAll のまま**であることを明示的に縛る＝どちらの方向の
    // 事故（強化の取り消し／未着手部屋の放置）も検出する。
    // 5.5c 以降、部屋を1つ強化するたびにこの表を1行書き換える。
    const EXPECTED = {
      'dungeon_1/1,0':  'killAll',      // A 戦闘型
      'dungeon_2/0,1':  'torchesLit',   // B 道具型①（ブーメランで炎を運ぶ・5.5b 済）
      'dungeon_3/1,0':  'switchOn',     // B 道具型②（弓の2段関門・5.5c 済）
      'dungeon_4/1,0':  'stonesPlaced', // C 倉庫番①（石3・純・5.5e 済）
      'dungeon_5/1,0':  'switchOn',     // B 道具型③（はしご水路の2段関門・5.5d 済）
      'dungeon_6/1,0':  'killAll',      // → C+B（倉庫番＋爆弾壁）5.5f
      'dungeon_7/1,0':  'killAll',      // → A 戦闘型（強化）5.5h
      'dungeon_8/1,0':  'killAll',      // → C 倉庫番② 5.5g
      'dark_tower/1,2': 'killAll',      // → A 戦闘型（強化）5.5h
      'dark_tower/4,3': 'killAll',      // → D 複合 5.5i
    };
    const found = {};
    for (const layerName of DUNGEONS) {
      for (const [stageKey, stage] of Object.entries(map.layers[layerName].stages)) {
        for (let r = 0; r < stage.rows; r++) {
          for (let c = 0; c < stage.cols; c++) {
            if (stage.tiles[r]?.[c] !== 'K') continue;
            const id = `${layerName}/${stageKey}`;
            const cond = stage.showConditions?.[`${r},${c}`];
            expect(cond?.trigger, `${id} (${r},${c}) の鍵の関門`).toBe(EXPECTED[id]);
            found[id] = (found[id] ?? 0) + 1;
          }
        }
      }
    }
    // 鍵が消える方向の回帰（K を消せば「全ての鍵に関門」は自明に真になる）も防ぐ。
    expect(Object.keys(found).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.values(found).reduce((a, b) => a + b, 0), 'ダンジョン内の鍵の総数').toBe(10);
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
    await walk(page, 'right', 8);   // movePlayer 1回＝0.5セル ∴ col5 → col9
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

    await walk(page, 'right', 8);   // movePlayer 1回＝0.5セル ∴ col5 → col9
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.keys).toBe(1);
    expect(errors).toEqual([]);
  });

  test('② 敵を倒す前：ブーメランでも鍵を運べない（描画ガードだけでは塞げない抜け道）', async ({ page }) => {
    // 木のブーメランの maxRange=3 なので、KEY_C(9) から3セル以内の col6 に立つ。
    await startAt(page, { row: KEY_R, col: 6, boomerang: true });

    const before = await page.evaluate(() => {
      const keys = window.__game.getState().player.keys;
      window.__game.useSubItem();      // 右向きに投げる → (8,6)〜(8,9) を通過
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

  // ── ③ D2 の鍵部屋＝道具型①「ブーメランで炎を運ぶ」（キュー 5.5b） ────────
  //
  // 盤面（dungeon_2 [0,1]）：L(6,4) だけが initLitTorches で点灯。A(6,6) は L と
  // 同じ行、B(4,6) は A と同じ列だが L とは行も列も共有しない。ブーメランは
  // 「通過した点灯 H から炎を拾い、消えた H を通ると点火する」＝直線上しか運べない
  // ので、L→A を点けてから投げ位置を変えて A→B を点ける2段手順になる。
  // 全点灯（torchesLit）で鍵 (5,5) が出現する。
  const D2 = { layer: 'dungeon_2', room: '0,1', key: { r: 5, c: 5 } };
  const LIT0 = '6,4', TORCH_A = '6,6', TORCH_B = '4,6';

  /** D2 の鍵部屋に入り、外周の追跡敵を消してから実時間ループを止める。 */
  async function startD2(page, { row, col, boomerang = true }) {
    await startAt(page, { row, col, boomerang, layer: D2.layer, room: D2.room });
    await page.evaluate(() => {
      for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 9999);
    });
    await page.waitForFunction(() => window.__game.getEnemies().length === 0, null, { timeout: 15_000 });
    await page.evaluate(() => window.__game.pause());   // 手動 step だけで進める
  }

  /** movePlayer 1回＝0.5セル ∴ n セル進むには 2n 回。 */
  async function walkCells(page, dir, cells) {
    await walk(page, dir, cells * 2);
  }

  /** dir を向いてブーメランを投げ、targetPk が点灯するまで tick を進める。 */
  async function throwAt(page, dir, targetPk) {
    const res = await page.evaluate(({ d, pk }) => {
      window.__game.setHeroDir(d);
      window.__game.useSubItem();
      for (let i = 0; i < 40; i++) {
        window.__game.step(1);
        const lit = window.__game.getStageState().litTorches ?? [];
        if (lit.includes(pk)) return { ok: true, ticks: i + 1, lit };
      }
      return { ok: false, lit: window.__game.getStageState().litTorches ?? [] };
    }, { d: dir, pk: targetPk });
    return res;
  }

  test('③ D2：盤面の幾何が「2投・順序強制」を保っている', () => {
    // 実機リプレイ（次のテスト）は「解ける」ことしか示さない。1投で両方点いてしまう
    // 配置に戻る劣化（＝段数1へ落ちる）を止めるのは幾何の不変条件なので別に縛る。
    const stage = map.layers[D2.layer].stages[D2.room];
    const torches = [];
    for (let r = 0; r < stage.rows; r++) {
      for (let c = 0; c < stage.cols; c++) if (stage.tiles[r]?.[c] === 'H') torches.push(`${r},${c}`);
    }
    expect(torches.sort()).toEqual([LIT0, TORCH_B, TORCH_A].sort());
    expect(stage.initLitTorches, '火元は1本だけ').toEqual([LIT0]);

    const [lr, lc] = LIT0.split(',').map(Number);
    const [ar, ac] = TORCH_A.split(',').map(Number);
    const [br, bc] = TORCH_B.split(',').map(Number);
    // A は火元と同一直線上＝1投で運べる。
    expect(ar === lr || ac === lc, 'A が火元と同じ行/列にない＝1投目が成立しない').toBe(true);
    // B は火元と行も列も共有しない＝A を先に点けないと運べない（順序が強制される）。
    expect(br === lr || bc === lc, 'B が火元と同じ行/列にある＝連鎖が強制されない').toBe(false);
    // B は A と同一直線上＝連鎖の2投目が成立する。
    expect(br === ar || bc === ac, 'B が A と同じ行/列にない＝2投目が成立しない').toBe(true);
  });

  test('③ D2：敵を全滅させても鍵は出ない（関門は敵ではなく炎）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startD2(page, { row: 6, col: 3 });

    const ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.conditionsMet ?? [], '敵全滅では torchesLit を満たさない').not.toContain(
      `${D2.key.r},${D2.key.c}`);
    expect(ss.litTorches ?? [], '火元だけが点いている状態で始まる').toEqual([LIT0]);
    const sprite = await page.locator(
      `.cell[data-row="${D2.key.r}"][data-col="${D2.key.c}"] .item-sprite`).count();
    expect(sprite, '鍵はまだ描かれない').toBe(0);
    expect(errors).toEqual([]);
  });

  test('③ D2：ブーメラン2投で炎を連鎖させると鍵が出現し、拾える', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startD2(page, { row: 6, col: 3 });

    // 1投目：(6,3) から右へ。射線 (6,4)(6,5)(6,6) ＝ 火元 L から A へ運ぶ。
    const first = await throwAt(page, 'right', TORCH_A);
    expect(first.ok, `1投目で ${TORCH_A} が点かない（litTorches=${first.lit}）`).toBe(true);

    // この時点では B が消えている＝関門は未成立。
    let ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.litTorches.sort()).toEqual([LIT0, TORCH_A].sort());
    expect(ss.conditionsMet ?? []).not.toContain(`${D2.key.r},${D2.key.c}`);

    // 2投目：投げ位置を (7,6) へ移して上へ。射線 (6,6)(5,6)(4,6) ＝ A から B へ。
    await walkCells(page, 'down', 1);    // (6,3) → (7,3)
    await walkCells(page, 'right', 3);   // (7,3) → (7,6)
    const pos = await page.evaluate(() => window.__game.getState().player);
    expect([Math.round(pos.y), Math.round(pos.x)], '2投目の立ち位置').toEqual([7, 6]);

    const second = await throwAt(page, 'up', TORCH_B);
    expect(second.ok, `2投目で ${TORCH_B} が点かない（litTorches=${second.lit}）`).toBe(true);

    // 全点灯 → 鍵が出現して描画される。
    ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.litTorches.sort()).toEqual([LIT0, TORCH_A, TORCH_B].sort());
    expect(ss.conditionsMet ?? [], 'torchesLit 成立で鍵が出現する').toContain(
      `${D2.key.r},${D2.key.c}`);
    const sprite = await page.locator(
      `.cell[data-row="${D2.key.r}"][data-col="${D2.key.c}"] .item-sprite`).count();
    expect(sprite, '鍵が描画される').toBe(1);

    // 拾いに行く（(6,6) はかがり火＝通れないので (7,5) 経由で北上）。
    await walkCells(page, 'left', 1);    // (7,6) → (7,5)
    await walkCells(page, 'up', 2);      // (7,5) → (5,5) ＝ 鍵
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.keys, '鍵を拾えた').toBe(1);
    expect(errors).toEqual([]);
  });

  test('③ D2：剣ではかがり火に火が点かない（ブーメラン無しでは解けない）', async ({ page }) => {
    // D2 時点でロウソク（D4 の道具）は未所持なので、点火手段はブーメランだけ。
    // 「隣で剣を振れば点く」抜け道が無いことを実機で確かめる。
    await startD2(page, { row: 6, col: 5, boomerang: false });

    const lit = await page.evaluate(() => {
      for (const d of ['left', 'right', 'up', 'down']) {
        window.__game.setHeroDir(d);
        window.__game.swordAttack();
        window.__game.step(6);
      }
      return window.__game.getStageState().litTorches ?? [];
    });
    expect(lit, '剣を振っても火元以外は点かない').toEqual([LIT0]);
  });

  // ── ④ D3 の鍵部屋＝道具型②「弓の2段関門」（キュー 5.5c） ────────────────
  //
  // 盤面（dungeon_3 [1,0]）：Y①(2,3) は水(1,3)(2,2)(2,4)(3,3)で完全隔離＝隣接セルが
  // 全て水/壁なので剣では絶対に叩けない。row4 の (4,3) から矢を上へ飛ばすと水を
  // 越えて Y① に当たり、links で gate T(5,8) が開く。開いたゲートの奥（チャンバー2）
  // に入って (6,9) から矢を下へ飛ばすと、水(7,9)(8,8)(8,10)で隔離された Y②(8,9) に
  // 当たる。showConditions(switchOn) で鍵(6,10) が出現する。
  const D3 = { layer: 'dungeon_3', room: '1,0', key: { r: 6, c: 10 } };
  const Y1_D3 = '2,3', GATE_D3 = '5,8', Y2_D3 = '8,9';

  test('④ D3：盤面の幾何が「弓必須・段数2」を保っている', () => {
    const stage = map.layers[D3.layer].stages[D3.room];
    const [y1r, y1c] = Y1_D3.split(',').map(Number);
    const [y2r, y2c] = Y2_D3.split(',').map(Number);

    // Y①/Y②とも4近傍が全て水/壁＝剣で絶対に叩けない。
    for (const [r, c, label] of [[y1r, y1c, 'Y①'], [y2r, y2c, 'Y②']]) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const t = stage.tiles[r + dr]?.[c + dc];
        expect(['~', '#', undefined], `${label}(${r},${c}) の隣接(${r + dr},${c + dc})`).toContain(t);
      }
    }
    // links: Y① → gate T。
    expect(stage.links).toEqual([{ switchId: Y1_D3, gateId: GATE_D3 }]);
    // showConditions: 鍵は Y② の switchOn。
    expect(stage.showConditions[`${D3.key.r},${D3.key.c}`]).toEqual({ trigger: 'switchOn', switchId: Y2_D3 });
  });

  test('④ D3：通り抜けの本道（東入口↔南出口）はゲートの状態に関わらず常時通行可', () => {
    // 整合性チェッカー・接続チェッカーが機械的に保証している内容を、鍵部屋の
    // 位相（PUZZLE-DESIGN §7-2＝通り抜け部屋）としてここでも明示的に固定する。
    const stage = map.layers[D3.layer].stages[D3.room];
    const rows = stage.tiles.map(r => r.join(''));
    expect(rows[4][11], '東入口 row4').toBe('.');
    expect(rows[5][11], '東入口 row5').toBe('.');
    expect(rows[9][5], '南出口 col5').toBe('.');
    expect(rows[9][6], '南出口 col6').toBe('.');
    // row4 の本道（col2〜col10）はゲート/水/壁を含まない（col1 は入口寄りの壁の内側）。
    for (let c = 2; c <= 10; c++) {
      expect('~#TYK'.includes(rows[4][c]), `row4 col${c} が本道を塞いでいる: '${rows[4][c]}'`).toBe(false);
    }
  });

  test('④ D3：Y①を矢で撃つ前は gate T が閉じ、チャンバー2（Y②/鍵）に入れない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startAt(page, { row: 4, col: 3, layer: D3.layer, room: D3.room, bow: true });

    const ss0 = await page.evaluate(() => window.__game.getStageState());
    expect(ss0.openGates ?? []).not.toContain(GATE_D3);

    // gate 手前 (4,8) まで歩けるが、T(5,8) を越えてチャンバー2へは入れない。
    await walk(page, 'right', 10);   // (4,3) → (4,8)
    const pos = await page.evaluate(() => window.__game.getState().player);
    expect(Math.round(pos.x), 'gate 手前まで歩ける').toBe(8);

    await walk(page, 'down', 4);     // T(5,8) を越えようとする
    const posAfter = await page.evaluate(() => window.__game.getState().player);
    expect(Math.round(posAfter.y), '閉じた gate を越えられない').toBeLessThan(6);
    expect(errors).toEqual([]);
  });

  test('④ D3：Y①→Y②の順に矢を撃つと gate が開き鍵が出現し、拾える', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startAt(page, { row: 4, col: 3, layer: D3.layer, room: D3.room, bow: true });
    await page.evaluate(() => window.__game.pause());   // 手動 step だけで進める

    // 1本目：(4,3) から北へ矢を飛ばす → 水を越えて Y①(2,3) に当たる。
    await page.evaluate(() => window.__game.setHeroDir('up'));
    await page.evaluate(() => window.__game.step(1));
    await page.evaluate(() => window.__game.useSubItem());
    await page.evaluate(() => window.__game.step(10));

    let ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchToggles, 'Y① が矢でトグルされる').toContain(Y1_D3);
    expect(ss.openGates, 'gate T が開く').toContain(GATE_D3);
    expect(ss.conditionsMet ?? [], 'まだ鍵は出現しない').not.toContain(`${D3.key.r},${D3.key.c}`);

    // gate が開いたのでチャンバー2へ進む：(4,3)→(4,8)→(6,8)→(6,9)。
    await walk(page, 'right', 10);   // (4,3) → (4,8)
    await walk(page, 'down', 4);     // (4,8) → (6,8)
    await walk(page, 'right', 2);    // (6,8) → (6,9)
    const pos = await page.evaluate(() => window.__game.getState().player);
    expect([Math.round(pos.y), Math.round(pos.x)], 'チャンバー2の射撃位置に到達').toEqual([6, 9]);

    // 2本目：(6,9) から南へ矢を飛ばす → 水を越えて Y②(8,9) に当たる。
    await page.evaluate(() => window.__game.setHeroDir('down'));
    await page.evaluate(() => window.__game.step(1));
    await page.evaluate(() => window.__game.useSubItem());
    await page.evaluate(() => window.__game.step(10));

    ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchToggles, 'Y② が矢でトグルされる').toContain(Y2_D3);
    expect(ss.conditionsMet ?? [], 'switchOn 成立で鍵が出現する').toContain(`${D3.key.r},${D3.key.c}`);
    const sprite = await page.locator(
      `.cell[data-row="${D3.key.r}"][data-col="${D3.key.c}"] .item-sprite`).count();
    expect(sprite, '鍵が描画される').toBe(1);

    // 拾いに行く：(6,9) → (6,10)。
    await walk(page, 'right', 2);
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.keys, '鍵を拾えた').toBe(1);
    expect(errors).toEqual([]);
  });

  test('④ D3：剣ではYに届かない（Y①/Y②とも隣接セルが水/壁で歩いて近づけない）', async ({ page }) => {
    // 弓なしで Y① へ最短で近づこうとしても、水(1,3)(2,2)(2,4)(3,3)に阻まれて
    // Y①(2,3) の隣に立てない＝剣が届く範囲に入れない。
    await startAt(page, { row: 4, col: 3, layer: D3.layer, room: D3.room, bow: false });
    await walk(page, 'up', 4);
    const pos = await page.evaluate(() => window.__game.getState().player);
    expect(pos.y, '水に阻まれて Y① の隣まで進めない').toBeGreaterThanOrEqual(3);

    const ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchToggles ?? []).not.toContain(Y1_D3);
    expect(ss.openGates ?? []).not.toContain(GATE_D3);
  });

  test('② dungeon_5 に入って落ちない（links:{} の入室即死クラッシュの回帰）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startAt(page, { row: 5, col: 5, layer: 'dungeon_5', room: '1,0' });
    // board が描画されている＝refreshGates が例外を投げていない。
    const cells = await page.locator('#board .cell').count();
    expect(cells).toBe(map.layers.dungeon_5.stages['1,0'].rows * map.layers.dungeon_5.stages['1,0'].cols);
    expect(errors).toEqual([]);
  });

  // ── ⑤ D5 の鍵部屋＝道具型③「はしごで水路を渡る2段関門」（キュー 5.5d） ─────
  //
  // 盤面（dungeon_5 [1,0]）：Y①(4,8) は水(3,9)で対岸(4,9)から隔離＝はしごが無いと
  // 対岸に立てず叩けない。叩くと links で gate T(5,9) が開く→奥のチャンバー2へ
  // 入れる→そこも水(7,9)で隔離した Y②(8,8) をはしごで渡って対岸(8,9)から叩く→
  // showConditions(switchOn) で鍵(6,10) が出現する。
  const D5 = { layer: 'dungeon_5', room: '1,0', key: { r: 6, c: 10 } };
  const Y1_D5 = '4,8', GATE_D5 = '5,9', Y2_D5 = '8,8';

  /** はしご所持でセーブを仕込む（startAt は subItems しか持たせないので player.hasLadder を後付け）。 */
  async function startD5(page, { row, col, ladder }) {
    await startAt(page, { row, col, layer: D5.layer, room: D5.room });
    if (ladder) {
      await page.evaluate(() => { window.__game.getPlayer().hasLadder = true; });
    }
    await page.evaluate(() => window.__game.pause());   // 手動 step だけで進める
  }

  test('⑤ D5：盤面の幾何が「はしご必須・段数2」を保っている', () => {
    const stage = map.layers[D5.layer].stages[D5.room];
    const [y1r, y1c] = Y1_D5.split(',').map(Number);
    const [y2r, y2c] = Y2_D5.split(',').map(Number);

    // Y①/Y②とも、通行可能な隣接セルは水の対岸1か所だけ（迂回の立ち位置が無い）。
    for (const [r, c, label] of [[y1r, y1c, 'Y①'], [y2r, y2c, 'Y②']]) {
      const passable = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const t = stage.tiles[r + dr]?.[c + dc];
        if (t !== undefined && t !== '#' && t !== '~') passable.push(`${r + dr},${c + dc}`);
      }
      expect(passable.length, `${label}(${r},${c}) の通行可能な隣接セル数`).toBe(1);
    }
    // links: Y① → gate T。
    expect(stage.links).toEqual([{ switchId: Y1_D5, gateId: GATE_D5 }]);
    // showConditions: 鍵は Y② の switchOn。
    expect(stage.showConditions[`${D5.key.r},${D5.key.c}`]).toEqual({ trigger: 'switchOn', switchId: Y2_D5 });
  });

  test('⑤ D5：本道（南入口↔西出口）はパズルの状態に関わらず常時通行可', () => {
    const stage = map.layers[D5.layer].stages[D5.room];
    const rows = stage.tiles.map(r => r.join(''));
    expect(rows[9][5], '南入口 col5').toBe('.');
    expect(rows[9][6], '南入口 col6').toBe('.');
    expect(rows[4][0], '西出口 row4').toBe('.');
    expect(rows[5][0], '西出口 row5').toBe('.');
    // 広間（col1〜6）はゲート/水/壁を含まない＝パズル分岐(col7以降)と独立している。
    for (let r = 1; r <= 8; r++) {
      for (let c = 1; c <= 6; c++) {
        expect('~#TYK'.includes(rows[r][c]), `(${r},${c}) が本道を塞いでいる: '${rows[r][c]}'`).toBe(false);
      }
    }
  });

  test('⑤ D5：はしご無しでは水を渡れず、Y①の対岸に立てない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startD5(page, { row: 1, col: 1, ladder: false });

    // 広間(1,1)からYの対岸(4,9)方向へ最短で寄る：(1,1)→(1,7)→(4,7)は壁なので
    // 実際に到達できるのは (1,7)（戸口）まで。水(3,9)を越えられず (4,9) には行けない。
    await walk(page, 'right', 12);   // (1,1) → (1,7) 付近まで
    await walk(page, 'down', 6);     // 南下を試みる（水/壁で止まるはず）
    const pos = await page.evaluate(() => window.__game.getState().player);
    // (4,9) に到達していない＝はしご無しで水を渡れていない。
    expect([Math.round(pos.y), Math.round(pos.x)]).not.toEqual([4, 9]);

    const ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchToggles ?? []).not.toContain(Y1_D5);
    expect(ss.openGates ?? []).not.toContain(GATE_D5);
    expect(errors).toEqual([]);
  });

  test('⑤ D5：はしご有り・gate閉のときはチャンバー2（Y②/鍵）に入れない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startD5(page, { row: 4, col: 9, ladder: true });

    const ss0 = await page.evaluate(() => window.__game.getStageState());
    expect(ss0.openGates ?? []).not.toContain(GATE_D5);

    // gate T(5,9) を越えてチャンバー2へ入ろうとする。
    await walk(page, 'down', 6);
    const pos = await page.evaluate(() => window.__game.getState().player);
    expect(Math.round(pos.y), '閉じた gate を越えられない').toBeLessThan(6);
    expect(errors).toEqual([]);
  });

  test('⑤ D5：Y①→Y②の順に叩くと gate が開き鍵が出現し、拾える（はしご必須）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startD5(page, { row: 4, col: 9, ladder: true });

    // Y①(4,8) は西隣＝(4,9) から左を向いて剣で叩く。
    await page.evaluate(() => window.__game.setHeroDir('left'));
    await page.evaluate(() => window.__game.step(1));
    await page.evaluate(() => window.__game.swordAttack());
    await page.evaluate(() => window.__game.step(6));

    let ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchToggles, 'Y① が剣でトグルされる').toContain(Y1_D5);
    expect(ss.openGates, 'gate T が開く').toContain(GATE_D5);
    expect(ss.conditionsMet ?? [], 'まだ鍵は出現しない').not.toContain(`${D5.key.r},${D5.key.c}`);

    // gate が開いたのでチャンバー2へ進む：(4,9)→(6,9)→(8,9)。
    await walk(page, 'down', 8);
    const pos = await page.evaluate(() => window.__game.getState().player);
    expect([Math.round(pos.y), Math.round(pos.x)], 'チャンバー2の対岸に到達').toEqual([8, 9]);

    // Y②(8,8) は西隣＝(8,9) から左を向いて剣で叩く。
    await page.evaluate(() => window.__game.setHeroDir('left'));
    await page.evaluate(() => window.__game.step(1));
    await page.evaluate(() => window.__game.swordAttack());
    await page.evaluate(() => window.__game.step(6));

    ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.switchToggles, 'Y② が剣でトグルされる').toContain(Y2_D5);
    expect(ss.conditionsMet ?? [], 'switchOn 成立で鍵が出現する').toContain(`${D5.key.r},${D5.key.c}`);
    const sprite = await page.locator(
      `.cell[data-row="${D5.key.r}"][data-col="${D5.key.c}"] .item-sprite`).count();
    expect(sprite, '鍵が描画される').toBe(1);

    // 拾いに行く：(8,9) → (6,9) → (6,10)。
    await walk(page, 'up', 4);
    await walk(page, 'right', 2);
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.player.keys, '鍵を拾えた').toBe(1);
    expect(errors).toEqual([]);
  });

  // ── ⑥ D4 の鍵部屋＝倉庫番型①「石3・純」（キュー 5.5e） ───────────────────
  //
  // 盤面（dungeon_4 [1,0]・孤島＝ワープ `>`(7,9) で入る）：ボタン S 3個（1,1 / 4,4 / 8,7）
  // すべてに石 '*' 3個（3,1 / 7,6 / 8,2）を乗せると showConditions(`stonesPlaced`) で
  // 鍵(5,7) が出現し、西の鍵扉 D(4,0)(5,0) からボス部屋へ進める。
  //
  // ここで守る肝は3つ。
  //   ⑥-a 幾何：東列（宝箱 2,9 とワープ 7,9 を含む前室）へ**石を押し込める向きが1つも無い**
  //        ＝詰み救済のワープを石で塞げない（笛の resetStones は D8 の報酬＝D4 では使えない）。
  //        口は2つ以上（1つだと口の手前に石が居座った瞬間に脱出できない）。
  //   ⑥-b 関門の芯：**足踏みでは成立しない。** 石2個をボタンに乗せ、残る1個のボタンを
  //        プレイヤーが踏むと switchStates は全 ON になる（＝`allSwitchesOn` なら成立して
  //        しまう）が `stonesPlaced` は石だけを数えるので鍵は出ない。§7-5 がこの
  //        トリガーを新設した理由そのものなので、実機で明示的に縛る。
  //   ⑥-c 実機再生：ソルバーの最短手順を実際の入力で再生すると鍵が出て拾える
  //        （＝測定した解が実機で通る）。
  const D4 = { layer: 'dungeon_4', room: '1,0', key: { r: 5, c: 7 } };
  const D4_BUTTONS = ['1,1', '4,4', '8,7'];
  const D4_STONES  = ['3,1', '7,6', '8,2'];
  const D4_WARP = '7,9', D4_CHEST = '2,9';
  const D4_EXPECT_L = 32;   // migrate-key-room-d4.mjs が記録した実測 L（ワープ始点・帯 20〜35）
  // 実機再生の始点＝ワープの1つ北（前室の中）。
  // ⚠️ ワープセル(7,9) に立って始めることはできない：MAP_ENTER の再遷移クールダウンは
  //    「ワープで到着した直後」だけ効くので、そこへ歩き込むと即座に隣室へ飛ばされる
  //    （実測で確認＝room が 1,1 に変わる）。∴再生用の手順は (6,9) 始点で別に求める。
  const D4_REPLAY_START = '6,9';
  // 前室（安全地帯）＝石が絶対に入れない区画。generate-key-room-d4.mjs のテンプレの ',' と一致。
  const D4_SAFE = ['2,9', '3,8', '3,9', '4,9', '5,9', '6,8', '6,9', '7,9', '8,9'];
  const D4_KEY_PK = `${D4.key.r},${D4.key.c}`;

  /** D4 鍵部屋のタイル。鍵扉 'D' は鍵ゼロでは壁＝ソルバーにも壁として渡す（'D' は解ける関門扱いなので素通りされる）。 */
  function d4Tiles() {
    const sd = map.layers[D4.layer].stages[D4.room];
    expect(Array.isArray(sd.tiles[0]), 'tiles は文字配列の配列').toBe(true);
    return sd.tiles.map(row => row.map(ch => (ch === 'D' ? '#' : ch)));
  }

  /**
   * 石パズルの最短手順を求めて {dir,to,push} 列にする（tests/sokoban-tiers.spec.js と同じ作法）。
   * goalKind: 'solve' ＝全ボタンに石が乗り鍵セルに立つ／
   *           'footFake' ＝石2個がボタン上・残る1個のボタンをプレイヤーが踏んでいる（⑥-b用）。
   */
  function d4Plan(startPk, goalKind) {
    const tiles = d4Tiles();
    const bg = Array.from({ length: 10 }, () => Array(12).fill('g'));
    const S = makeSolver(tiles, bg, [], {}, new Set(), { hasLadder: false });
    const [sr, sc] = startPk.split(',').map(Number);
    const start = S.encode(sr, sc, S.initStones, 0, 0, 0);
    const onButtons = (stonesField) => {
      const stones = stonesField ? stonesField.split(';') : [];
      return stones.filter(s => D4_BUTTONS.includes(s)).length;
    };
    const goalTest = goalKind === 'solve'
      ? (state) => { const f = state.split('|'); return f[0] === D4_KEY_PK && f[5] === '1'; }
      : (state) => {
        const f = state.split('|');
        const stones = f[1] ? f[1].split(';') : [];
        // 石2個がボタン上・プレイヤーは「石が乗っていない残り1個のボタン」を踏んでいる。
        return f[5] === '0' && onButtons(f[1]) === 2
          && D4_BUTTONS.includes(f[0]) && !stones.includes(f[0]);
      };
    const prev = new Map([[start, null]]);
    const q = [start];
    let goal = null;
    for (let i = 0; i < q.length && goal === null; i++) {
      for (const nx of S.nextStates(q[i])) {
        if (prev.has(nx)) continue;
        prev.set(nx, q[i]);
        if (goalTest(nx)) { goal = nx; break; }
        q.push(nx);
      }
    }
    expect(goal, `${goalKind} の手順が見つかる`).toBeTruthy();
    const chain = [];
    for (let s = goal; s !== null; s = prev.get(s)) chain.push(s);
    chain.reverse();
    const steps = [];
    for (let i = 1; i < chain.length; i++) {
      const [pos0, stones0] = chain[i - 1].split('|');
      const [pos1, stones1] = chain[i].split('|');
      const [r0, c0] = pos0.split(',').map(Number);
      const [r1, c1] = pos1.split(',').map(Number);
      // この部屋には Y/'!'/H が無い＝遷移は必ず「歩き」か「石押し」＝1セル移動。
      expect(Math.abs(r1 - r0) + Math.abs(c1 - c0), '1手＝1セル移動').toBe(1);
      const dir = r1 < r0 ? 'up' : r1 > r0 ? 'down' : c1 < c0 ? 'left' : 'right';
      steps.push({ dir, to: { r: r1, c: c1 }, push: stones0 !== stones1 });
    }
    // 再生用の手順がワープセルを踏むと隣室へ飛ばされて再生が壊れる（＝手順ではなく
    // テストの前提が崩れる）ので、踏まないことを明示的に確かめる。
    if (startPk !== D4_WARP) {
      for (const s of steps) {
        expect(`${s.to.r},${s.to.c}`, '再生手順がワープセルを踏まない').not.toBe(D4_WARP);
      }
    }
    return steps;
  }

  /**
   * 手順を実際の入力（movePlayer）で再生する。通常移動は半セル刻み（1セル＝2回）、
   * 石押しは1回で1セル動くが実時間クールダウン（STONE_PUSH_COOLDOWN_MS=600）がある
   * ∴押しの後だけ長く待つ（tests/sokoban-tiers.spec.js の replay と同じ）。
   * ⚠️ pause() しない＝押しクールダウンは実時間で進むため。この部屋に敵は居ないので安全。
   */
  async function d4Replay(page, steps) {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await page.evaluate(d => window.__game.setHeroDir(d), s.dir);
      for (let guard = 0; guard < 6; guard++) {
        const p = await page.evaluate(() => {
          const pl = window.__game.getState().player;
          return { x: pl.x, y: pl.y };
        });
        if (p.x === s.to.c && p.y === s.to.r) break;
        await page.evaluate(d => window.__game.movePlayer(d), s.dir);
        await page.waitForTimeout(s.push ? 650 : 30);
      }
      const p = await page.evaluate(() => {
        const pl = window.__game.getState().player;
        return { x: pl.x, y: pl.y };
      });
      expect(`${p.y},${p.x}`, `手順${i + 1}（${s.dir}${s.push ? '・石押し' : ''}）で ${s.to.r},${s.to.c} へ`)
        .toBe(`${s.to.r},${s.to.c}`);
    }
  }

  test('⑥ D4：盤面が「石3・純倉庫番」の形（ボタン3・石3・敵なし・ゲートなし）', () => {
    const stage = map.layers[D4.layer].stages[D4.room];
    const cells = (ch) => {
      const out = [];
      for (let r = 0; r < stage.rows; r++) {
        for (let c = 0; c < stage.cols; c++) if (stage.tiles[r]?.[c] === ch) out.push(`${r},${c}`);
      }
      return out;
    };
    expect(cells('S').sort(), 'ボタン3個').toEqual([...D4_BUTTONS].sort());
    expect(cells('*').sort(), '石3個').toEqual([...D4_STONES].sort());
    expect(cells('T'), 'ゲート T は無い（関門は showConditions＝物理ゲートではない）').toEqual([]);
    expect(cells('K'), '鍵は1個').toEqual([D4_KEY_PK]);
    expect(cells('>'), 'ワープ（詰み救済の出口）は1個').toEqual([D4_WARP]);
    expect(stage.showConditions[D4_KEY_PK]).toEqual({ trigger: 'stonesPlaced' });
    expect(stage.links, 'links は空配列（{} は refreshGates を殺す）').toEqual([]);
    expect(stage.chestContents?.[D4_CHEST]?.type, 'ハートの器は前室に残っている').toBe('heartContainer');
    expect(stage.mapEnters?.[D4_WARP]?.destId, 'ワープは隣室へ抜ける（＝石リセットの救済）').toBeTruthy();
    expect(stage.fluteEffect, '笛の resetStones（再訪時の保険）').toEqual({ type: 'resetStones' });
    // 敵が居てはいけない（enemy-ai.js tryEnemyPushStone が石を押す＝測定した解が崩れる）。
    const flat = stage.tiles.flat().join('');
    expect(/[WECFVXZALNJOUGI]/.test(flat), '倉庫番の部屋に敵を置いていない').toBe(false);
  });

  test('⑥ D4：前室（宝箱＋ワープ）へ石を押し込める向きが1つも無い／口は2つ以上', () => {
    // ワープはこの孤島で唯一の脱出口＝石で塞がれたら本当のハードロック（笛は D8 の報酬）。
    // 「石が前室に入れない」ことは幾何で決まる＝実機テストでは示せないので静的に縛る。
    const stage = map.layers[D4.layer].stages[D4.room];
    const isFloor = (pk) => {
      const [r, c] = pk.split(',').map(Number);
      const t = stage.tiles[r]?.[c];
      return t !== undefined && t !== '#' && t !== 'D';
    };
    const safe = new Set(D4_SAFE);
    expect(safe.has(D4_WARP) && safe.has(D4_CHEST), 'ワープと宝箱は前室の中').toBe(true);
    for (const pk of D4_SAFE) expect(isFloor(pk), `前室 ${pk} が床`).toBe(true);
    for (const s of D4_STONES) expect(safe.has(s), `石 ${s} が前室の外から始まる`).toBe(false);

    // 押し＝プレイヤー X-2d → 石 X-d → 行き先 X。外（前室以外）から入る押しが存在しないこと。
    for (const x of D4_SAFE) {
      const [xr, xc] = x.split(',').map(Number);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const src = `${xr - dr},${xc - dc}`;
        const stand = `${xr - 2 * dr},${xc - 2 * dc}`;
        if (safe.has(src)) continue;                    // 前室の中→中は「入れない」ので無関係
        const canPush = isFloor(src) && isFloor(stand);
        expect(canPush, `前室 ${x} へ外から石を押し込める（石 ${src} をプレイヤー ${stand} から）`).toBe(false);
      }
    }
    // 口（前室と本体の境界）が2つ以上＝片方の手前に石が居座っても反対から脱出できる。
    const mouths = [];
    for (const x of D4_SAFE) {
      const [xr, xc] = x.split(',').map(Number);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nk = `${xr + dr},${xc + dc}`;
        if (isFloor(nk) && !safe.has(nk)) mouths.push(`${nk}→${x}`);
      }
    }
    expect(mouths.length, `前室と本体の口（${mouths.join(' ')}）は2つ以上`).toBeGreaterThanOrEqual(2);
  });

  test('⑥ D4：ソルバーの最短解が記録値 L=32（帯 20〜35）と一致する', () => {
    // migrate-key-room-d4.mjs が焼いた実測値のアンカー。盤面を触って浅く（または解なしに）
    // なったら赤くなる。BFS だけなので安い（状態 12万台）。
    const steps = d4Plan(D4_WARP, 'solve');
    expect(steps.length, 'ワープ始点の最短手数').toBe(D4_EXPECT_L);
    expect(steps.filter(s => s.push).length, '石を押す手が3個以上ある').toBeGreaterThanOrEqual(3);
    const comment = map.layers[D4.layer].stages[D4.room].comment ?? '';
    expect(comment, 'comment に実測 L が焼かれている').toContain(`L=${D4_EXPECT_L}`);
  });

  test('⑥ D4：入室時は鍵が描画されず、踏んでも拾えない', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // (5,6) は鍵の西隣＝鍵セルへ1歩で踏み込める位置。
    await startAt(page, { row: 5, col: 6, layer: D4.layer, room: D4.room });

    const ss0 = await page.evaluate(() => window.__game.getStageState());
    expect(ss0.conditionsMet ?? [], '入室時点で関門は成立していない').not.toContain(D4_KEY_PK);
    expect(ss0.stonesLocked, '石はロックされていない').toBeFalsy();
    expect(await page.locator(
      `.cell[data-row="${D4.key.r}"][data-col="${D4.key.c}"] .item-sprite`).count(),
    '鍵は描かれない').toBe(0);

    await walk(page, 'right', 2);   // (5,6) → (5,7)＝鍵セルを踏む
    const st = await page.evaluate(() => window.__game.getState());
    expect(Math.round(st.player.x), '鍵セルまで歩けている').toBe(D4.key.c);
    expect(st.player.keys, '見えない鍵は踏んでも拾えない').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑥ D4：未出現の鍵はブーメランでも運べない', async ({ page }) => {
    await startAt(page, { row: 5, col: 6, layer: D4.layer, room: D4.room, boomerang: true });
    const res = await page.evaluate(() => {
      const before = window.__game.getState().player.keys;
      window.__game.setHeroDir('right');
      window.__game.useSubItem();     // (5,7) の鍵の上を通過する
      window.__game.step(12);
      return { before, after: window.__game.getState().player.keys };
    });
    expect(res.after, 'ブーメランでも運べない（描画ガードだけでは塞げない抜け道）').toBe(res.before);
  });

  test('⑥ D4：石2個＋最後のボタンを足で踏んでも鍵は出ない（stonesPlaced は石だけ数える）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // ボタンはモーメンタリ＝プレイヤーが踏んでも switchStates は ON になる。
    // ∴`allSwitchesOn` を鍵に使うと「石を2個運び、最後は自分が踏む」で1手飛ばせてしまう。
    const steps = d4Plan(D4_REPLAY_START, 'footFake');
    await startAt(page, { row: 6, col: 9, layer: D4.layer, room: D4.room });
    await d4Replay(page, steps);

    const ss = await page.evaluate(() => window.__game.getStageState());
    const onFoot = await page.evaluate(() => {
      const p = window.__game.getState().player;
      return `${Math.round(p.y)},${Math.round(p.x)}`;
    });
    expect(D4_BUTTONS, 'プレイヤーは残る1個のボタンを踏んでいる').toContain(onFoot);
    // 全ボタンが（石2＋足踏み1で）ON になっている＝allSwitchesOn なら成立してしまう状態。
    for (const b of D4_BUTTONS) expect(ss.switchStates?.[b], `ボタン ${b} は ON`).toBe(true);
    // それでも鍵は出ない／石もロックされない。
    expect(ss.conditionsMet ?? [], '足踏みでは stonesPlaced は成立しない').not.toContain(D4_KEY_PK);
    expect(ss.stonesLocked, '足踏みでは石ロックも立たない').toBeFalsy();
    expect(await page.locator(
      `.cell[data-row="${D4.key.r}"][data-col="${D4.key.c}"] .item-sprite`).count(),
    '鍵は描かれない').toBe(0);
    expect(errors).toEqual([]);
  });

  test('⑥ D4：ソルバーの最短手順を再生すると鍵が出現し、拾える', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const steps = d4Plan(D4_REPLAY_START, 'solve');
    await startAt(page, { row: 6, col: 9, layer: D4.layer, room: D4.room });
    await d4Replay(page, steps);

    const ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.conditionsMet ?? [], '全ボタンに石が乗って stonesPlaced が成立').toContain(D4_KEY_PK);
    expect(ss.stonesLocked, '石は恒久ロックされる（崩して詰まない）').toBe(true);
    const st = await page.evaluate(() => window.__game.getState());
    // 最後の手順で鍵セルに立つ＝出現した鍵をその足で拾っている。
    expect(st.player.keys, '鍵を拾えた').toBe(1);
    expect(st.currentLayer, '途中でワープしていない').toBe(D4.layer);
    expect(st.stageKey, '途中でワープしていない').toBe(D4.room);
    expect(errors).toEqual([]);
  });

  test('⑤ D5：本道は Y①/Y②のパズルの状態に関わらず西出口まで通れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startD5(page, { row: 4, col: 5, ladder: false });

    // (4,5) から西へ歩く → (4,0) の西出口へ。はしご無し・パズル未着手でも通れる。
    await walk(page, 'left', 10);
    const pos = await page.evaluate(() => window.__game.getState().player);
    expect(Math.round(pos.x), '西出口まで歩ける').toBe(0);
    expect(errors).toEqual([]);
  });

});
