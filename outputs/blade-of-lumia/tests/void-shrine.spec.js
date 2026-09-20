// 虚空の祠（void_shrine）＝聖剣（swordTier 3）の寄道／最後の剣強化
//
// 盤面（scripts/migrate-void-shrine-holy-sword.mjs が生成・自己検証済み）:
//   0,0 「虚空の石車堂」 …… test_mechanics 26,0（ユーザーが editor で確定・実プレイ合格）の移植。
//        赤門 '('(5,2) と青門 ')'(5,7) は同時には開かない。石 '*'×4 をボタン 'S'×4 に
//        乗せると T 門（奥の扉 (8,5) と東の壁 (6,7)）が開く。笛で石だけ初期位置に戻る。
//   1,0 「聖剣の間」 …… 番人5体（μ×2・ζ×2・ψ）を全滅させると killAll 封印が解け、
//        宝箱 (1,5) から聖剣（ATK+12・ビーム＋貫通）が出る。
//
// 入口（field 8,1 東台地の '>'(6,9)）は虚空 SKY(cols 4-7) の向こう＝翼の羽衣で飛ばないと
// 立てない。同じ migrate で終盤フローの必須修理2件も入れた：
//   ① field 7,1 (3,6) の祭壇 '^' の復活（'o' に潰れていた＝翼の羽衣を授かれなかった）
//   ② field 8,0 (3,2) の塔の扉（mapEnter はあるのにタイルが 'M' で踏めなかった）
//
// ここで守るもの（migrate の状態空間検証は「盤面が解ける」ことしか言えない。
// **実エンジンで本当にその手順が通るか**は別物∴実プレイで通す）:
//   ① データ契約（部屋・境界・報酬・封印・敵の向き・進行表・field の3修理）
//   ② 東台地は飛行でしか渡れない／扉に乗ると石車堂へ入れる
//   ③ 赤門と青門は同時には開かない（色スイッチを叩いた色だけが開く）
//   ④ 笛を吹くと石が座を忘れる（fluteEffect resetStones）
//   ⑤ 脱出ゲート T(6,7) はロック前は壁として振る舞う（移植元のソフトロック修理）
//   ⑥ 封印は全滅で解け、聖剣（tier3・ATK = BASE_ATK + 12）と貫通ビームが手に入る
//   ⑦ 祭壇 → 翼の羽衣 → 塔の扉が踏めて空島へ渡れる（「クリア不能」バグの回帰ロック）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { waitForBoard } from './helpers.js';
import { SWORD_TIERS, BASE_ATK } from '../shared/items.js';
import { ENEMY_META } from '../shared/enemies.js';
import { countTriforces } from '../shared/triforce.js';
import { gameLayerEntries } from '../shared/layers.js';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { toolsUsableIn } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const STAGES = MAP.layers.void_shrine.stages;
const FIELD = MAP.layers.field.stages;
const GAME = '/blade-of-lumia/game/';

const rowStr = (st, r) => st.tiles[r].join('');
const tileAt = (st, r, c) => st.tiles[r][c];
/** 盤面から指定タイルの座標を全部拾う（手書きの座標表を腐らせない）。 */
function cellsOf(st, ch) {
  const out = [];
  st.tiles.forEach((row, r) => row.forEach((t, c) => { if (t === ch) out.push(`${r},${c}`); }));
  return out.sort();
}

/** 道具込みのプレビュー URL（羽衣で来る終盤の寄道＝全道具所持が前提）。 */
function previewUrl(stage, row, col, extra = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'void_shrine', stage,
    row: String(row), col: String(col),
    ps_weapon: '1', ...extra,
  });
  return `${GAME}?${p.toString()}`;
}
/** field 側のプレビュー URL。 */
function fieldUrl(stage, row, col, extra = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'field', stage,
    row: String(row), col: String(col), ...extra,
  });
  return `${GAME}?${p.toString()}`;
}

/** n タイル歩く（1 タイル = movePlayer 2回・MOVE_STEP 0.5）。 */
async function walkTiles(page, dir, tiles = 1) {
  await page.evaluate(({ d, n }) => {
    for (let i = 0; i < n * 2; i++) { window.__game.movePlayer(d); window.__game.step(1); }
  }, { d: dir, n: tiles });
}
/** プレイヤーの整数タイル座標（toTileRow/Col と同じ floor(v+0.5)）。 */
const at = (page) => page.evaluate(() => {
  const p = window.__game.getState().player;
  return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});
/** 同じ部屋の中で座標だけ移す（enterStage は同一ステージなら石も色も保持する）。 */
const teleport = (page, r, c) => page.evaluate(({ rr, cc }) => {
  window.__game.enterStage('void_shrine', '0,0', rr, cc);
  window.__game.step(1);
}, { rr: r, cc: c });
/** 指定方向を向いて剣を振る（色スイッチ '[' ']' は壁扱い＝踏めないので叩く）。 */
async function slash(page, dir) {
  await page.evaluate((d) => {
    window.__game.movePlayer(d);          // 向きだけ変わる（先が壁なら進まない）
    window.__game.step(1);
    window.__game.swordAttack();
    window.__game.step(2);
  }, dir);
}
const ss = (page) => page.evaluate(() => window.__game.getStageState());

test.describe('Blade of Lumia – 虚空の祠（聖剣）', () => {

  test('① データ契約：2部屋・移植した盤面・報酬は聖剣・field の3修理', () => {
    expect(Object.keys(STAGES).sort()).toEqual(['0,0', '1,0']);

    // tiles は「文字配列の配列」（join した行文字列だとテストが緑でもゲームが落ちる）。
    for (const [k, st] of Object.entries(STAGES)) {
      expect(Array.isArray(st.tiles), `${k} の tiles が配列でない`).toBe(true);
      for (const row of st.tiles) {
        expect(Array.isArray(row), `${k} の行が文字配列でない`).toBe(true);
        for (const ch of row) expect(String(ch).length).toBe(1);
      }
      expect(Array.isArray(st.links), `${k} の links は配列（{} は refreshGates を殺す）`).toBe(true);
    }

    // ── 石車堂（移植した盤面をバイト単位で固定する）─────────────────
    const hall = STAGES['0,0'];
    expect(hall.tiles.map((_, r) => rowStr(hall, r))).toEqual([
      '############',
      '#>.i########',
      '##.#########',
      '#S.*.....S##',
      '#.#.#.#*#.##',
      '#.(....)..##',
      '#..#*#.T*.##',
      '#S....#..S##',
      '##]##T>#[###',
      '############',
    ]);
    expect(cellsOf(hall, 'S'), 'ボタン4座').toEqual(['3,1', '3,9', '7,1', '7,9']);
    expect(cellsOf(hall, '*'), '石4個').toEqual(['3,3', '4,7', '6,4', '6,8']);
    expect(cellsOf(hall, '('), '赤門').toEqual(['5,2']);
    expect(cellsOf(hall, ')'), '青門').toEqual(['5,7']);
    expect(cellsOf(hall, ']'), '青スイッチ').toEqual(['8,2']);
    expect(cellsOf(hall, '['), '赤スイッチ').toEqual(['8,8']);
    // T 門は2枚＝奥の扉 (8,5) と、移植元のソフトロックを修理した脱出口 (6,7)。
    expect(cellsOf(hall, 'T')).toEqual(['6,7', '8,5']);
    expect(hall.fluteEffect, '笛の救済（石を初期位置に戻す）').toEqual({ type: 'resetStones' });
    expect(hall.signData['1,3']?.lines?.length, '石車堂の碑が無言看板').toBeGreaterThan(0);

    // ── 聖剣の間（報酬と封印）───────────────────────────────
    const sword = STAGES['1,0'];
    expect(sword.chestContents['1,5']).toEqual({ type: 'weapon', swordTier: 3 });
    expect(sword.showConditions['1,5']).toEqual({ trigger: 'killAll' });
    expect(SWORD_TIERS[3].name, '聖剣が tier3').toBe('聖剣');
    expect(SWORD_TIERS[3].beam && SWORD_TIERS[3].pierce, '聖剣はビーム＋貫通').toBe(true);
    expect(sword.signData['4,5']?.lines?.length, '聖剣の碑が無言看板').toBeGreaterThan(0);

    // 敵：向き別スプライトには向きがあり、enemyDirs に幽霊キーが無い。
    const enemyCells = {};
    sword.tiles.forEach((row, r) => row.forEach((ch, c) => {
      if (ENEMY_META[ch]) enemyCells[`${r},${c}`] = ch;
    }));
    expect(Object.keys(enemyCells).length, '番人の数').toBe(5);
    for (const k of Object.keys(sword.enemyDirs)) expect(enemyCells[k], `幽霊キー ${k}`).toBeTruthy();
    for (const [k, ch] of Object.entries(enemyCells)) {
      if (!ENEMY_META[ch].directional) continue;
      expect(sword.enemyDirs[k], `${k} '${ch}' は向き別スプライト∴向きが必要`).toBeTruthy();
    }
    // 着地セル (8,5) とその隣接に敵を置かない（入室即被弾を防ぐ）。
    for (const k of ['8,5', '7,5', '8,4', '8,6']) expect(enemyCells[k], `着地際の敵 ${k}`).toBeUndefined();

    // 脅威度は「寄道の最重」より重く「本編の最重」より軽い＝最後の寄道の位置。
    const threat = stageThreat(sword, ENEMY_META);
    const sideMax = stageThreat(MAP.layers.secret_grotto.stages['2,0'], ENEMY_META);
    const mainMax = stageThreat(MAP.layers.dark_tower.stages['1,2'], ENEMY_META);
    expect(threat).toBeGreaterThan(sideMax);
    expect(threat).toBeLessThan(mainMax);

    // 表の外に作った敵部屋＝EXTRA_ENEMY_ROOMS に宣言しておく（無いと各機構 spec が赤くなる）。
    expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === 'void_shrine' && e.stage === '1,0'),
      '聖剣の間が EXTRA_ENEMY_ROOMS に宣言されていない').toBe(true);
    // 羽衣より後に来る部屋＝全道具所持（弱点判定の基準表）。
    // （2026-09-05・0g で手書き表を廃止＝実マップの報酬配置からの導出で測る）
    const usable = toolsUsableIn(MAP).void_shrine;
    for (const item of ['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']) {
      expect(usable?.has(item), `void_shrine の地点で ${item} を持っていない`).toBe(true);
    }

    // ── mapEnter の対応（id/destId が両側で噛み合う）──────────────
    const registry = {};
    for (const [lk, ld] of gameLayerEntries(MAP)) {
      for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
        for (const [pk, me] of Object.entries(sd.mapEnters ?? {})) {
          expect(registry[me.id], `mapEnter id が重複: ${me.id}`).toBeUndefined();
          registry[me.id] = { layer: lk, stage: sk, pos: pk, destId: me.destId };
        }
      }
    }
    for (const id of ['fieldToVoidShrine', 'voidShrine', 'voidShrineStoneHall', 'voidShrineSwordHall']) {
      expect(registry[id], `${id} が登録されていない`).toBeTruthy();
      expect(registry[registry[id].destId], `${id} の行き先が無い`).toBeTruthy();
      expect(registry[registry[id].destId].destId, `${id} が相互リンクになっていない`).toBe(id);
    }
    expect(registry.fieldToVoidShrine).toMatchObject({ layer: 'field', stage: '8,1', pos: '6,9' });
    expect(registry.voidShrine).toMatchObject({ layer: 'void_shrine', stage: '0,0', pos: '1,1' });

    // ── field の3修理 ─────────────────────────────────────
    // 入口：東台地の '>'（虚空の向こう＝飛ばないと立てない）と、石碑への追記。
    expect(tileAt(FIELD['8,1'], 6, 9), '祠の扉が置かれていない').toBe('>');
    expect(rowStr(FIELD['8,1'], 6).slice(4, 8), '虚空 SKY が埋まっている').toBe('%%%%');
    expect(FIELD['8,1'].signData['7,2'].lines.join('\n'), '石碑に祠の案内が無い').toContain('もう 一つの 扉');
    // 修理①：古代の祭壇（'o' に潰れていた＝翼の羽衣を授かれなかった）。
    expect(tileAt(FIELD['7,1'], 3, 6), '祭壇 ^ が復活していない').toBe('^');
    let altars = 0;
    for (const [, ld] of gameLayerEntries(MAP)) {
      for (const sd of Object.values(ld.stages ?? {})) {
        for (const row of sd.tiles ?? []) altars += row.filter((ch) => ch === '^').length;
      }
    }
    expect(altars, '本編レイヤーに祭壇が1つも無い＝翼の羽衣が手に入らない').toBeGreaterThanOrEqual(1);
    // 修理②：塔の扉（mapEnter はあるのにタイルが 'M' で踏めなかった）。
    expect(tileAt(FIELD['8,0'], 3, 2), '塔の扉が踏めるタイルになっていない').toBe('>');
    expect(FIELD['8,0'].mapEnters['3,2']).toEqual({ id: 'fieldToTower', destId: 'darkTower' });
  });

  test('② 東台地は飛行でしか渡れず、扉に乗ると石車堂へ入れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 羽衣なし：虚空(cols 4-7)の手前で止まる＝歩いては辿り着けない。
    await page.goto(fieldUrl('8,1', 6, 2));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await page.evaluate(() => window.__game.getState().player.flying)),
      '羽衣なしで飛べた').toBe(false);
    await walkTiles(page, 'right', 8);
    expect((await at(page)).c, '歩いて虚空を越えた').toBeLessThan(4);

    // 羽衣あり：飛んで谷を渡り、台地 (6,8) に降りてから扉 (6,9) に乗る。
    await page.goto(fieldUrl('8,1', 6, 2, { ps_wingrobe: '1' }));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await page.evaluate(() => window.__game.getState().player.flying))).toBe(true);
    await walkTiles(page, 'right', 6);
    expect(await at(page), '虚空を越えられていない').toEqual({ r: 6, c: 8 });
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await page.evaluate(() => window.__game.getState().player.flying)),
      '台地に降りられていない').toBe(false);

    await walkTiles(page, 'right', 1);
    await page.waitForFunction(() => window.__game.getState().currentLayer === 'void_shrine',
      null, { timeout: 3000 });
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.stageKey).toBe('0,0');
    expect(await at(page), '石車堂の入口に着地していない').toEqual({ r: 1, c: 1 });
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('③ 赤門と青門は同時には開かない（叩いた色だけが開く）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 赤門 '('(5,2) の西 (5,1) から測る（門だけを単独で見る）。
    await page.goto(previewUrl('0,0', 5, 1));
    await waitForBoard(page);

    expect((await ss(page)).activeColor, '初期はどちらの色も点いていない').toBeNull();
    await walkTiles(page, 'right', 2);
    expect(await at(page), '色の点いていない赤門を通り抜けた').toEqual({ r: 5, c: 1 });

    // 青スイッチ ']'(8,2) を (7,2) から下に叩く → 青が点く。
    await teleport(page, 7, 2);
    await slash(page, 'down');
    expect((await ss(page)).activeColor, '青スイッチが効かない').toBe('blue');

    // 青が点いている間は赤門は閉じたまま（＝同時には開かない）。
    await teleport(page, 5, 1);
    await walkTiles(page, 'right', 2);
    expect(await at(page), '青が点いているのに赤門を通れた').toEqual({ r: 5, c: 1 });

    // 赤スイッチ '['(8,8) を (7,8) から下に叩く → 赤に移り、赤門が開く。
    await teleport(page, 7, 8);
    await slash(page, 'down');
    expect((await ss(page)).activeColor, '赤スイッチが効かない').toBe('red');
    await teleport(page, 5, 1);
    await walkTiles(page, 'right', 2);
    expect(await at(page), '赤が点いているのに赤門を通れない').toEqual({ r: 5, c: 3 });
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('④ 笛を吹くと石が座を忘れる（詰みからの救済）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 石 '*'(3,3) の西 (3,2) から右へ押す（石押しは実ループ＋押しっぱなしで動く）。
    await page.goto(previewUrl('0,0', 3, 2, { ps_flute: '1' }));
    await waitForBoard(page);
    expect((await page.evaluate(() => window.__game.getState().player.activeSubItem))).toBe('flute');

    await page.evaluate(() => window.__game.queueInput('right'));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__game.releaseInput('right'));
    await page.waitForTimeout(200);

    let st = await ss(page);
    expect(Object.keys(st.stonePositions).length, '石が動いていない').toBeGreaterThan(0);
    expect(st.stonesLocked, '押しただけでロックされた').toBe(false);

    // 笛 → 石だけが初期位置に戻る（プレイヤーは動かない）。
    const before = await at(page);
    await page.evaluate(() => { window.__game.useSubItem(); window.__game.step(2); });
    st = await ss(page);
    expect(Object.keys(st.stonePositions).length, '笛で石が戻らない').toBe(0);
    expect(st.activeColor, '笛で色が消えない').toBeNull();
    expect(await at(page), '笛でプレイヤーが飛ばされた').toEqual(before);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑤ 脱出ゲート T(6,7) はロック前は壁として振る舞う', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 東の袋 (7,7) から北へ。T は「石4個が4座に乗る」まで開かない＝解いている間は壁。
    await page.goto(previewUrl('0,0', 7, 7));
    await waitForBoard(page);

    const st = await ss(page);
    expect(st.openGates, 'ロック前から脱出ゲートが開いている').not.toContain('6,7');
    expect(st.openGates, 'ロック前から奥の扉が開いている').not.toContain('8,5');

    await walkTiles(page, 'up', 2);
    expect(await at(page), '閉じた脱出ゲートを通り抜けた').toEqual({ r: 7, c: 7 });
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑥ 封印は全滅で解け、聖剣（ATK = BASE + 12）と貫通ビームが手に入る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 宝箱 (1,5) の真下 (2,5)＝壁龕の口から始める。
    await page.goto(previewUrl('1,0', 2, 5));
    await waitForBoard(page);

    const spawned = await page.evaluate(() => {
      window.__game.step(3);   // 各機構の初期化（盾騎士の構え・呪い火の浮遊）を通す
      return window.__game.getEnemies().map((e) => e.type).sort();
    });
    expect(spawned, '設計どおりの番人が spawn しない').toEqual(['ζ', 'ζ', 'μ', 'μ', 'ψ']);

    // 封印中：宝箱に乗っても開かない。
    await walkTiles(page, 'up', 1);
    expect(await at(page)).toEqual({ r: 1, c: 5 });
    let st = await ss(page);
    expect(st.openedChests, '全滅前に宝箱が開いた').not.toContain('1,5');
    expect((await page.evaluate(() => window.__game.getState().player.swordTier)),
      '全滅前に聖剣を渡した').not.toBe(3);

    // 全滅 → 封印が解ける。
    await page.evaluate(() => {
      for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 9999);
    });
    await page.waitForFunction(() => window.__game.getEnemies().length === 0, null,
      { timeout: 15_000 });

    // 一度降りて乗り直す（handleTileEvent は「そのセルに入った」時に走る）。
    await walkTiles(page, 'down', 1);
    await walkTiles(page, 'up', 1);
    await page.waitForFunction(() => (window.__game.getState().player.swordTier ?? -1) === 3,
      null, { timeout: 3000 });

    st = await ss(page);
    expect(st.openedChests, '宝箱が開封済みになっていない').toContain('1,5');
    const atk = await page.evaluate(() => window.__game.getPlayer().atk);
    expect(atk, 'ATK が BASE_ATK + 聖剣になっていない').toBe(BASE_ATK + SWORD_TIERS[3].atk);

    // 手に入れた聖剣で満タンチャージ → ビームが2体を貫く（tier の flag が実弾に届く）。
    // ⚠️ getProjectiles() のスナップショットは**ホワイトリスト**＝piercing は観測できない
    //    ∴一直線に並べた2体が両方倒れることで貫通を測る（row3 は東西に開けた床）。
    await walkTiles(page, 'down', 2);
    expect(await at(page)).toEqual({ r: 3, c: 5 });
    const ids = await page.evaluate(() => [
      window.__game.injectEnemy(7, 3, 1),
      window.__game.injectEnemy(8, 3, 1),
    ]);
    await page.evaluate(() => {
      window.__game.setHeroDir('right');
      window.__game.startCharge();
      window.__game.step(6);          // 満タン
      window.__game.releaseCharge();
      window.__game.step(10);
    });
    const alive = await page.evaluate((list) => {
      const es = window.__game.getEnemies();
      return list.filter((id) => es.some((e) => e.id === id));
    }, ids);
    expect(alive, '聖剣の満タンビームが2体を貫通していない').toEqual([]);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑦ 祭壇で翼の羽衣を授かり、塔の扉を踏んで空島へ渡れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const total = countTriforces(MAP);
    expect(total, '星の欠片が1つも無い').toBeGreaterThan(0);

    // 羽衣が無いうちは塔の扉（field 8,0 の '>'(3,2)）を踏んでも渡れない。
    await page.goto(fieldUrl('8,0', 3, 1));
    await waitForBoard(page);
    await walkTiles(page, 'right', 1);
    await page.evaluate(() => window.__game.step(30));
    expect((await page.evaluate(() => window.__game.getState().stageKey)),
      '羽衣なしで塔の扉を通れた').toBe('8,0');

    // 星の欠片を全部持って祭壇 '^'(field 7,1 の 3,6) に乗る → 翼の羽衣。
    await page.goto(fieldUrl('7,1', 4, 6, { ps_triforce: String(total) }));
    await waitForBoard(page);
    expect((await page.evaluate(() => window.__game.getState().player.hasWingRobe))).toBe(false);
    await walkTiles(page, 'up', 1);
    await page.waitForFunction(() => window.__game.getState().player.hasWingRobe === true,
      null, { timeout: 3000 });

    // そのまま塔の扉へ（同じ page ＝羽衣を持ったまま）→ 空島 8,1 へ渡れる。
    await page.evaluate(() => { window.__game.enterStage('field', '8,0', 3, 1); window.__game.step(1); });
    await walkTiles(page, 'right', 1);
    await page.waitForFunction(() => window.__game.getState().stageKey === '8,1', null,
      { timeout: 3000 });
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.currentLayer).toBe('field');
    expect(st.stageKey).toBe('8,1');
    expect(errors, 'pageerror が出た').toEqual([]);
  });
});
