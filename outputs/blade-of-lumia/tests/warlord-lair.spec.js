// 魔将の巣（warlord_lair）＝伝説の鎧（armorTier 2）の寄道／魔将 V の一対一
//
// 何のためのテストか（実行キュー 0h・2026-09-05）：魔将 V は 2026-09-05 まで
// dark_tower 2,3・3,3 の**道中に3体**居る中ボスで、伝説の鎧（ARMOR_TIERS[2]）は
// 世界のどこにも置かれていなかった（監査の🔴＝未配置ティア）。0h で V を「寄道の主」へ
// 格上げし、新設の寄道 `warlord_lair` の主の間に1体だけ置いて、その撃破報酬に伝説の鎧を
// 置いた。盤面は scripts/migrate-warlord-lair.mjs が生成・自己検証している。
//
// 盤面:
//   0,0 「岩窟の入口」…… 空島（field 8,1）の扉 (8,9) から降りてくる部屋。中央の岩塊を
//        回り込んで**東辺 rows 4-5**（2行の通路＝着地 footprint が跨れる幅）から主の間へ抜ける。
//        敵は置かない＝主との一対一を薄めない。
//   1,0 「魔将の間」…… isBossRoom。入室で `:`（西辺 4,0/5,0）が閉じ、V を倒すと
//        killAll 封印が解けて宝箱 (1,10) から伝説の鎧（DEF 3）が出る。
//
// 入場ゲートは地形そのもの＝虚空の祠（void_shrine）と同型で、field 8,1 の虚空 SKY を
// 翼の羽衣で飛んで越えないと扉 (8,9) に立てない（完了条件 e）。
//
// ここで守るもの（migrate の自己検証は「データがそう書けている」ことしか言えない。
// **実エンジンでその手順が通るか**は別物∴実プレイで通す）:
//   ① データ契約（2部屋・盤面・報酬・封印・敵の向き・進行表・field 側の扉と石碑）
//   ② 空島の南は飛行でしか渡れない／扉に乗ると岩窟へ入れる（＝羽衣ゲート）
//   ③ 入口から東へ抜けて主の間に入ると `:` が閉じて HP バーが出る（一対一の一戦）
//   ④ V を倒すと封印が解け、伝説の鎧（ARMOR_TIERS[2]・DEF 3）が手に入る
//   ⑤ dark_tower 2,3・3,3 に V は居らず、差し替えた敵が実機で spawn する
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { waitForBoard } from './helpers.js';
import { ARMOR_TIERS, BASE_DEF } from '../shared/items.js';
import { ENEMY_META } from '../shared/enemies.js';
import { gameLayerEntries } from '../shared/layers.js';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { ORDER, toolsUsableIn } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const STAGES = MAP.layers.warlord_lair.stages;
const FIELD = MAP.layers.field.stages;
const DT = MAP.layers.dark_tower.stages;
const GAME = '/blade-of-lumia/game/';

const rowStr = (st, r) => st.tiles[r].join('');
const tileAt = (st, r, c) => st.tiles[r][c];
/** 盤面から指定タイルの座標を全部拾う（手書きの座標表を腐らせない）。 */
function cellsOf(st, ch) {
  const out = [];
  st.tiles.forEach((row, r) => row.forEach((t, c) => { if (t === ch) out.push(`${r},${c}`); }));
  return out.sort();
}
/** 盤面に置かれた敵を { "r,c": タイル } で拾う。 */
function enemiesOf(st) {
  const out = {};
  st.tiles.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) out[`${r},${c}`] = ch; }));
  return out;
}

/** 魔将の巣のプレビュー URL（羽衣で来る終盤の寄道＝DT min 相当の装備で入る）。 */
function previewUrl(stage, row, col, extra = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'warlord_lair', stage,
    row: String(row), col: String(col),
    ps_weapon: '1', ps_hearts: '15', ps_shield: '2', ...extra,
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
/** dark_tower 側のプレビュー URL（⑤ の差し替え確認）。 */
function towerUrl(stage, row, col) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'dark_tower', stage,
    row: String(row), col: String(col), ps_weapon: '1', ps_hearts: '15',
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
const ss = (page) => page.evaluate(() => window.__game.getStageState());
const stageOf = (page) => page.evaluate(() => window.__game.getState().stageKey);
/**
 * ボス扉の見た目（`:` のセルに付く class）を読む。
 * ⚠️ `getStageState()` のスナップショットは**ホワイトリスト**＝`doorwayStates` は載っていない
 *    ∴内部名で読むと undefined で静かに嘘をつく。プレイヤーに見えている DOM の class で測る。
 */
const doorLooks = (page, cells) => page.evaluate((ks) => ks.map((k) => {
  const [r, c] = k.split(',');
  const el = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
  if (!el) return 'none';
  if (el.classList.contains('doorway-boss-closed')) return 'closed';
  if (el.classList.contains('doorway-boss')) return 'open';
  return 'none';
}), cells);

/**
 * 端まで歩いて隣のステージへ渡る（遷移は setTimeout(…,100) 越しに確定する∴1手ごとに待つ）。
 * @returns {Promise<string>} 渡った後の stageKey（渡れていなければ元のキー）
 */
async function walkAcross(page, dir, tries = 6) {
  const from = await stageOf(page);
  for (let k = 0; k < tries; k++) {
    await page.evaluate((d) => { window.__game.movePlayer(d); window.__game.step(1); }, dir);
    try {
      await page.waitForFunction((s) => window.__game.getState().stageKey !== s, from, { timeout: 400 });
      break;
    } catch { /* まだ端に着いていない＝次の一歩 */ }
  }
  return stageOf(page);
}

test.describe('Blade of Lumia – 魔将の巣（伝説の鎧）', () => {

  test('① データ契約：2部屋・報酬は伝説の鎧・V は世界に1体・field 側の扉と石碑', () => {
    expect(Object.keys(STAGES).sort()).toEqual(['0,0', '1,0']);
    expect(MAP.layers.warlord_lair.name, 'レイヤー名（HUD と進行地点のラベルの出所）').toBe('魔将の巣');
    expect(MAP.layers.warlord_lair.bossStage, '主の間が bossStage として登録されていない').toBe('1,0');

    // tiles は「文字配列の配列」（join した行文字列だとテストが緑でもゲームが落ちる）。
    for (const [k, st] of Object.entries(STAGES)) {
      expect(Array.isArray(st.tiles), `${k} の tiles が配列でない`).toBe(true);
      expect(st.tiles.length, `${k} の行数`).toBe(10);
      for (const row of st.tiles) {
        expect(Array.isArray(row), `${k} の行が文字配列でない`).toBe(true);
        expect(row.length, `${k} の列数`).toBe(12);
        for (const ch of row) expect(String(ch).length).toBe(1);
      }
      expect(Array.isArray(st.links), `${k} の links は配列（{} は refreshGates を殺す）`).toBe(true);
      expect(st.cols).toBe(12);
      expect(st.rows).toBe(10);
    }

    // ── 岩窟の入口（盤面を行リテラルで固定する）─────────────────────
    const gate = STAGES['0,0'];
    expect(gate.tiles.map((_, r) => rowStr(gate, r))).toEqual([
      '############',
      '#>.i.......#',
      '#..........#',
      '#..######..#',
      '#..######...',
      '#..######...',
      '#..######..#',
      '#..........#',
      '#..........#',
      '############',
    ]);
    expect(gate.isBossRoom ?? false, '入口がボス部屋になっている').toBe(false);
    expect(enemiesOf(gate), '入口に敵を置いている（主との一対一を薄める）').toEqual({});
    expect(gate.signData['1,3']?.lines?.length, '入口の刻み文が無言看板').toBeGreaterThan(0);
    // 主の間への通路＝東辺 rows 4-5 の2行（1行だけだと着地 footprint が弾かれる）。
    for (const r of [4, 5]) {
      expect(tileAt(gate, r, 11), `入口の東辺 (${r},11) が塞がっている`).toBe('.');
      expect(tileAt(gate, r, 10), `通路の内側 (${r},10) が壁＝着地が拒否される`).toBe('.');
    }
    for (const r of [1, 2, 3, 6, 7, 8]) {
      expect(tileAt(gate, r, 11), `東辺 (${r},11) が開いている（通路は rows 4/5 だけ）`).toBe('#');
    }

    // ── 魔将の間（報酬と封印）───────────────────────────────
    const lair = STAGES['1,0'];
    expect(lair.tiles.map((_, r) => rowStr(lair, r))).toEqual([
      '############',
      '#....i....B#',
      '#..........#',
      '#..........#',
      ':.......V..#',
      ':..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '############',
    ]);
    expect(lair.isBossRoom, '主の間が isBossRoom でない＝扉が閉じない／HP バーが出ない').toBe(true);
    // `:`（DOORWAY_BOSS）が無いと「🔓 扉が開いた！」が出ない＝入口側の通路と噛み合う位置に2枚。
    expect(cellsOf(lair, ':'), 'ボス扉の2枚が入口の通路（rows 4/5）と噛み合っていない')
      .toEqual(['4,0', '5,0']);
    expect(lair.chestContents['1,10'])
      .toEqual({ type: 'armor', armorTier: 2, name: ARMOR_TIERS[2].name });
    expect(lair.showConditions['1,10'], '伝説の鎧が killAll 封印になっていない')
      .toEqual({ trigger: 'killAll' });
    expect(ARMOR_TIERS[2].name, '伝説の鎧が防具の最上位ティア').toBe('伝説の鎧');
    expect(ARMOR_TIERS[2].def, '伝説の鎧の DEF').toBe(3);
    expect(lair.signData['1,5']?.lines?.length, '魔将の碑が無言看板').toBeGreaterThan(0);

    // 主は1体だけ＝雑魚を1体でも足すと killAll 封印が「雑魚だけ倒して開く」抜け道になる。
    const cells = enemiesOf(lair);
    expect(cells, '主の間の敵が V 1体でない').toEqual({ '4,8': 'V' });
    expect(ENEMY_META.V.isBoss, 'V が isBoss でない').toBe(true);
    // 向き別スプライトには向きが要る／enemyDirs に幽霊キーが無い。
    for (const k of Object.keys(lair.enemyDirs)) expect(cells[k], `幽霊キー ${k}`).toBeTruthy();
    expect(lair.enemyDirs['4,8'], 'V は向き別スプライト∴向きが必要').toBe('left');
    // 着地セル（西辺の ':' 2枚）とその隣接に敵を置かない（入室即被弾を防ぐ）。
    for (const k of ['4,0', '5,0', '4,1', '5,1', '3,0', '6,0']) {
      expect(cells[k], `着地際の敵 ${k}`).toBeUndefined();
    }
    // stageThreat はボスを数えない∴「寄道に雑魚が居ない」ことがそのまま 0 で出る。
    expect(stageThreat(lair, ENEMY_META), '主の間に雑魚が居る（脅威度が 0 でない）').toBe(0);

    // V は世界に1体だけ（test_mechanics は進行に存在しない検証ステージ∴数えない）。
    const vAt = [];
    for (const [lk, ld] of gameLayerEntries(MAP)) {
      for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
        for (const [k, ch] of Object.entries(enemiesOf(sd))) if (ch === 'V') vAt.push(`${lk}/${sk} ${k}`);
      }
    }
    expect(vAt, 'V が世界に1体だけになっていない（道中に残っている／複数置いた）')
      .toEqual(['warlord_lair/1,0 4,8']);

    // 表の外に作った敵部屋＝EXTRA_ENEMY_ROOMS に宣言しておく（無いと各機構 spec が赤くなる）。
    for (const [layer, stage] of [['warlord_lair', '1,0'], ['dark_tower', '2,3'], ['dark_tower', '3,3']]) {
      expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === layer && e.stage === stage),
        `${layer} ${stage} が EXTRA_ENEMY_ROOMS に宣言されていない`).toBe(true);
    }

    // ── 進行表（寄道として ORDER に載る）─────────────────────────
    const ids = ORDER.map((o) => o.id);
    const i = ids.indexOf('warlord_lair');
    expect(i, 'warlord_lair が ORDER に無い＝監査もエディタのプリセットも出ない')
      .toBeGreaterThan(-1);
    expect(ORDER[i].optional, '寄道でない（下限に数えると DT の判定諸元が動く）').toBe(true);
    expect(ids[i - 1], 'warlord_lair の直前が虚空の祠でない').toBe('void_shrine');
    expect(ids[i + 1], 'warlord_lair の直後が暗黒の塔でない＝DT min が動く').toBe('dark_tower');
    // 羽衣で来る部屋＝全道具所持（弱点判定の基準表）。
    const usable = toolsUsableIn(MAP).warlord_lair;
    for (const item of ['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']) {
      expect(usable?.has(item), `warlord_lair の地点で ${item} を持っていない`).toBe(true);
    }

    // ── mapEnter の対応（id/destId が両側で噛み合う・世界で一意）──────────
    const registry = {};
    for (const [lk, ld] of gameLayerEntries(MAP)) {
      for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
        for (const [pk, me] of Object.entries(sd.mapEnters ?? {})) {
          expect(registry[me.id], `mapEnter id が重複: ${me.id}`).toBeUndefined();
          registry[me.id] = { layer: lk, stage: sk, pos: pk, destId: me.destId };
        }
      }
    }
    for (const id of ['fieldToWarlordLair', 'warlordLair']) {
      expect(registry[id], `${id} が登録されていない`).toBeTruthy();
      expect(registry[registry[id].destId], `${id} の行き先が無い`).toBeTruthy();
      expect(registry[registry[id].destId].destId, `${id} が相互リンクになっていない`).toBe(id);
    }
    expect(registry.fieldToWarlordLair).toMatchObject({ layer: 'field', stage: '8,1', pos: '8,9' });
    expect(registry.warlordLair).toMatchObject({ layer: 'warlord_lair', stage: '0,0', pos: '1,1' });

    // ── field 側（空島の南＝虚空の向こうに扉／石碑の追記）──────────────
    expect(tileAt(FIELD['8,1'], 8, 9), '巣の扉が置かれていない').toBe('>');
    expect(rowStr(FIELD['8,1'], 8).slice(4, 8), '虚空 SKY が埋まっている＝歩いて行ける').toBe('%%%%');
    const stele = FIELD['8,1'].signData['7,2'].lines;
    expect(stele.join('\n'), '石碑に魔将の案内が無い').toContain('魔将');
    // 既存の案内（虚空の祠＝void_shrine spec が参照している行）を壊していない。
    expect(stele.join('\n'), '祠の案内を上書きしている').toContain('もう一つの扉');

    // ── dark_tower の差し替え（V を抜いた跡が空き部屋になっていない）────────
    for (const sk of ['2,3', '3,3']) {
      expect(Object.values(enemiesOf(DT[sk])), `dark_tower ${sk} に V が残っている`)
        .not.toContain('V');
      expect(Object.keys(enemiesOf(DT[sk])).length, `dark_tower ${sk} が空き部屋になっている`)
        .toBeGreaterThan(0);
      for (const k of Object.keys(DT[sk].enemyDirs)) {
        expect(enemiesOf(DT[sk])[k], `dark_tower ${sk} の enemyDirs に幽霊キー ${k}`).toBeTruthy();
      }
    }
    // 2F より 3F が重い（登るほど重くなる）／最終関門より軽い。
    const t2 = stageThreat(DT['2,3'], ENEMY_META);
    const t3 = stageThreat(DT['3,3'], ENEMY_META);
    expect(t2, '2F の脅威度が 0（差し替えで雑魚が消えた）').toBeGreaterThan(0);
    expect(t3, '3F が 2F より軽い（登るほど重くなっていない）').toBeGreaterThan(t2);
    expect(t3, '3F が最終関門（dark_tower 1,2）より重い')
      .toBeLessThan(stageThreat(DT['1,2'], ENEMY_META));
  });

  test('② 空島の南は飛行でしか渡れず、扉に乗ると岩窟へ入れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 羽衣なし：虚空(cols 4-7)の手前で止まる＝歩いては辿り着けない（完了条件 e）。
    await page.goto(fieldUrl('8,1', 8, 2));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await page.evaluate(() => window.__game.getState().player.flying)),
      '羽衣なしで飛べた').toBe(false);
    await walkTiles(page, 'right', 8);
    expect((await at(page)).c, '歩いて虚空を越えた').toBeLessThan(4);
    expect(await page.evaluate(() => window.__game.getState().currentLayer),
      '歩いて魔将の巣へ入れた').toBe('field');

    // 羽衣あり：飛んで谷を渡り、台地 (8,8) に降りてから扉 (8,9) に乗る。
    await page.goto(fieldUrl('8,1', 8, 2, { ps_wingrobe: '1' }));
    await waitForBoard(page);
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await page.evaluate(() => window.__game.getState().player.flying))).toBe(true);
    await walkTiles(page, 'right', 6);
    expect(await at(page), '虚空を越えられていない').toEqual({ r: 8, c: 8 });
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await page.evaluate(() => window.__game.getState().player.flying)),
      '台地に降りられていない').toBe(false);

    await walkTiles(page, 'right', 1);
    await page.waitForFunction(() => window.__game.getState().currentLayer === 'warlord_lair',
      null, { timeout: 3000 });
    const st = await page.evaluate(() => window.__game.getState());
    expect(st.stageKey, '扉の行き先が入口の部屋でない').toBe('0,0');
    expect(await at(page), 'mapEnter の着地セル (1,1) でない').toEqual({ r: 1, c: 1 });
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('③ 入口から東へ抜けて主の間に入ると扉が閉じて HP バーが出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 着地セル (1,1) から岩塊を回り込む＝row 2 を東へ → 東辺 rows 4-5 の通路へ南下。
    // ⚠️ 看板 'i'(1,3) は**実エンジンでは通行不可**（`game/passable.js` が false を返す。
    //    `shared/tiles.js` の passable:true はエディタの表）∴row 1 は東へ抜けられない。
    //    回り込みの本線は全開の row 2（この部屋が塞がっていないのはそちらの行）。
    await page.goto(previewUrl('0,0', 1, 1));
    await waitForBoard(page);
    expect(await page.evaluate(() => window.__game.getEnemies().length),
      '入口に敵が spawn した（一対一を薄める）').toBe(0);
    await walkTiles(page, 'right', 9);
    expect((await at(page)).c, '看板をすり抜けて row 1 を東へ進めた').toBe(2);
    await walkTiles(page, 'down', 1);
    await walkTiles(page, 'right', 8);
    expect(await at(page), 'row 2 を東へ抜けられない').toEqual({ r: 2, c: 10 });
    await walkTiles(page, 'down', 2);
    expect(await at(page), '東側の縦通路を降りられない').toEqual({ r: 4, c: 10 });

    // 東辺を越えて主の間へ（歩いて渡る＝mapEnter ではない）。
    expect(await walkAcross(page, 'right'), '主の間へ渡れない（東辺の通路が繋がっていない）')
      .toBe('1,0');
    expect(await page.evaluate(() => window.__game.getState().currentLayer)).toBe('warlord_lair');

    // 入室で一戦が始まる＝V が spawn し、`:` が閉じ、HP バーが出る（setTimeout 400+800ms 越し）。
    expect(await page.evaluate(() => window.__game.getEnemies().map((e) => e.type)),
      '主の間に V が spawn しない').toEqual(['V']);
    await page.waitForFunction(
      () => !document.getElementById('boss-hpbar')?.classList.contains('hidden'), null,
      { timeout: 5000 });
    expect(await page.evaluate(() => window.__game.getState().bossRoomLocked),
      'ボス部屋がロックされていない（扉が閉じない）').toBe(true);
    expect(await doorLooks(page, ['4,0', '5,0']), '西のボス扉2枚が閉じていない')
      .toEqual(['closed', 'closed']);

    // 閉じた扉は壁として振る舞う＝入口へ逃げ戻れない（逃げ場は無い）。
    expect(await walkAcross(page, 'left', 4), '閉じたボス扉から入口へ逃げ戻れた').toBe('1,0');
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('④ V を倒すと封印が解け、伝説の鎧（DEF 3）が手に入る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 主の間の西側（着地際）から始める＝入室と同じ条件でロックが掛かる。
    await page.goto(previewUrl('1,0', 5, 1));
    await waitForBoard(page);
    await page.waitForFunction(
      () => !document.getElementById('boss-hpbar')?.classList.contains('hidden'), null,
      { timeout: 5000 });

    const before = await page.evaluate(() => window.__game.getPlayer());
    expect(before.armorTier ?? -1, '前提：伝説の鎧を持っていない').toBeLessThan(2);

    // 封印中：宝箱まで歩いても開かない（V が生きているあいだ）。
    let st = await ss(page);
    expect(st.conditionsMet ?? [], 'V が生きているのに封印が解けている').not.toContain('1,10');

    // 撃破 → killAll 封印が解ける（撃破演出のあいだ game loop は止まる∴長めに待つ）。
    await page.evaluate(() => {
      const v = window.__game.getEnemies().find((e) => e.type === 'V');
      window.__game.dealDamage(v.id, 9999, 'sword');
    });
    await page.waitForFunction(() => window.__game.getEnemies().length === 0, null,
      { timeout: 20_000 });
    await page.waitForFunction(
      () => (window.__game.getStageState().conditionsMet ?? []).includes('1,10'), null,
      { timeout: 10_000 });
    expect(await page.evaluate(() => window.__game.getState().bossRoomLocked),
      '撃破後もロックが解けない（出られない）').toBe(false);
    expect(await doorLooks(page, ['4,0', '5,0']), '撃破後もボス扉が閉じたまま')
      .toEqual(['open', 'open']);

    // 宝箱 (1,10) まで歩いて受け取る（合格しただけでは渡らない）。
    const p0 = await at(page);
    await walkTiles(page, 'right', 10 - p0.c);
    await walkTiles(page, 'up', (await at(page)).r - 1);
    expect(await at(page), '宝箱のセルに立てていない').toEqual({ r: 1, c: 10 });
    await page.waitForFunction(() => window.__game.getPlayer().armorTier === 2, null,
      { timeout: 5000 });

    st = await ss(page);
    expect(st.openedChests, '宝箱が開封済みになっていない').toContain('1,10');
    const after = await page.evaluate(() => window.__game.getPlayer());
    expect(after.armorTier, '伝説の鎧（ティア2）になっていない').toBe(2);
    expect(after.def, 'DEF が防具ティア2 から導出されていない').toBe(BASE_DEF + ARMOR_TIERS[2].def);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑤ dark_tower 2,3・3,3 は V の代わりに差し替えた敵が spawn する', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const [stage, want] of [['2,3', ['λ', 'λ']], ['3,3', ['μ', 'μ', 'π']]]) {
      await page.goto(towerUrl(stage, 1, 5));
      await waitForBoard(page);
      const spawned = await page.evaluate(() => {
        window.__game.step(3);              // 各機構の初期化（構え・投擲の間合い）を通す
        return window.__game.getEnemies().map((e) => e.type).sort();
      });
      expect(spawned, `dark_tower ${stage} の敵が設計と違う`).toEqual(want);
      expect(spawned, `dark_tower ${stage} に V が残っている`).not.toContain('V');
      expect(await page.evaluate(() => window.__game.getState().bossRoomLocked),
        `dark_tower ${stage} でボス戦が始まった（道中の部屋）`).toBe(false);
    }
    expect(errors, 'pageerror が出た').toEqual([]);
  });

});
