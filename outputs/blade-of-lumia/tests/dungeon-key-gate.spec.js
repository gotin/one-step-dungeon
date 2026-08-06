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
      'dungeon_4/1,0':  'killAll',      // → C 倉庫番① 5.5e
      'dungeon_5/1,0':  'killAll',      // → B 道具型③（はしご）5.5d
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
    await startAt(page, { row: KEY_R, col: 5 });
    // board が描画されている＝refreshGates が例外を投げていない。
    const cells = await page.locator('#board .cell').count();
    expect(cells).toBe(map.layers[LAYER].stages[ROOM].rows * map.layers[LAYER].stages[ROOM].cols);
    expect(errors).toEqual([]);
  });

});
