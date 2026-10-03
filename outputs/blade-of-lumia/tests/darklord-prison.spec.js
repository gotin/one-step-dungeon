// 魔王の岩牢（darklord_prison）＝X 魔王を世界に置いた寄道／報酬はルミアの剣とハートの器
//
// 何のためのテストか（実行キュー 0o・2026-09-05）：X 魔王は機構（追跡・詔 lockstep・
// 剣の構え・二段フェーズ）まで実装済みなのに、**世界のどのレイヤーにも置かれていなかった**
// ＝闘技場（test_mechanics 23,1）でしか会えない敵で、監査 `scripts/audit-balance.mjs` の
// 唯一の 🔴 だった。0o で「新設の寄道の主（V 魔将と同型）」として置き場を作った
// （ユーザー確定・2026-09-05）。盤面は scripts/migrate-darklord-prison.mjs が生成・自己検証する。
//
// ⚠️ 0o-2（2026-09-05・ユーザーの再考「報酬がハートの器だけではしょぼい／もう一部屋増やして
//    パズルステージを追加したい」）で **2部屋 → 3部屋**になり、報酬も組み替わった。
//    書き込むのは `scripts/migrate-darklord-prison-puzzle.mjs`。
//
// 盤面（ステージキーは `"col,row"`∴縦に降りる並びは 0,0 → 0,1 → 0,2）:
//   0,0 「岩牢の口」…… 南湖（field 9,10）の**湖に浮かぶ黒い岩の岩礁**の扉 (1,2) から入る前室。
//        row 1-2 が前室（着地 (1,1)・刻み文 (2,1)・回復薬（大）(1,10)）、rows 3-4 の漏斗を経て
//        rows 5-9 の 2 列幅（cols 5-6）の竪坑を下り、南辺から錠の間へ降りる。敵は置かない。
//   0,1 「二色の錠の間」… 色スイッチ＋色門＋石車のパズル（ユーザー確定の組み合わせ）。
//        石3個を色門の奥のボタン3個へ据えると T (7,5)/(7,6) が開いて主の間へ降りられる。
//        **ハートの器はここへ移した**（封印なし＝解いて到達すれば開く。killAll ではない）。
//   0,2 「封魔の間」…… isBossRoom。入室で `:`（北辺 0,5/0,6）が閉じ、X を倒すと killAll
//        封印が解けて宝箱 (8,10) から**ルミアの剣（剣 tier4）**が出る。
//
// 入場ゲートは地形そのもの＝虚空の祠・魔将の巣と同じ翼の羽衣の関門。0o-2 (c)（2026-09-05・
// ユーザーの再考「洞窟の入り口が全部 8,1 なのも変。分散させたい」）で入口を空島（field 8,1 の
// 浮岩 (5,6)）から**南湖の岩礁**（field 9,10 の (1,2)）へ移した＝扉の対応は id
// （`fieldToDarklordPrison`）で解決される∴岩牢側の盤面は1セルも動いていない。
// 岩礁は湖の水面 row 1 / cols 1-4 の**1行だけ**＝橋も陸も繋がっていない。
// ⚠️ **2行にしてはいけない**＝はしごは「水1枚の両岸が陸」なら渡れる（`isLadderBridgeCell`）∴
//    row 2 まで陸にすると 橋 row 4 →水 row 3 →陸 row 2 が1枚渡りになって、D5 のはしごを
//    持った時点で羽衣ゲートが消える。1行なら水が2枚（rows 2-3）残る∴はしごでは渡れない
//    （① がデータで・③ が実エンジンで、はしご所持でも渡れないことを測る）。
//
// ⚠️ X は星の欠片を落とさない。岩牢は羽衣＝古代の祭壇で欠片を全部捧げた後にしか入れない
//    ∴落とすと総数が 8 → 9 になり祭壇（`triforce >= total` で羽衣を授ける）が永久に開かない
//    循環になる。0o で `game/boss.js` と `shared/triforce.js` のタイル名決め打ちを撤去して
//    `ENEMY_META[tile].dropsTriforce` の一本にした＝⑦ でその帰結を実機で測る。
//
// ⚠️ 0o-3（2026-09-05・ユーザーの実プレイ判定「ちょっとまって、パズル簡単すぎない？
//    こんな簡単なパズルならない方がいいでしょ。もっと難しくしてよ」）で錠の間の盤面を
//    **全面的に作り直した**（石2→3・ボタン2→3・L 32→120・ボタンの充填順は A→B→C の1通り）。
//    書き込むのは `scripts/rebuild-lock-room.mjs`。
//    ⚠️ このとき「デッドロック 0」の設計方針を**捨てた**（浅さの主犯だった＝幅1レーンで
//    石の奥へ回り込めない＝読む余地が無い）。代わりに `fluteEffect:{type:'resetStones'}` を
//    部屋に付け、**詰んだら笛で石を初期位置へ戻せる**ようにした∴② が測るのは
//    「デッドロックが 0 であること」ではなく「笛を吹けば必ず立て直せること」。
//    ⚠️ 石を戻す手段は笛**だけではない**＝未解決のまま部屋を出れば `enterStage`
//    （`game/game.js:296-324`）が `stonePositions` を空に戻す（解けている／`stonesLocked`
//    のときだけ保たれる）∴笛は「歩いて出入りする手間を省く救済」。恒久詰みになるのは
//    「詰みのせいで出口にも戻れない」場合だけ∴② が測るのはそこ（`noEscape` の中身）。
//
// ここで守るもの（migrate の自己検証は「データがそう書けている」ことしか言えない。
// **実エンジンでその手順が通るか**は別物∴実プレイで通す）:
//   ① データ契約（3部屋・盤面・報酬・封印・敵の向き・進行表・field 側の岩礁と標）
//   ② 錠の間のパズルが状態空間で成立している（石を押さないと届かない／マクロ貪欲で解けない／
//      ボタンの充填順が1通り／詰んでも笛で立て直せる）
//   ③ 岩礁は飛行でしか行けない（徒歩✗・はしご✗）／扉に乗ると岩牢へ入れる（＝羽衣ゲート）
//   ④ 前室で回復薬（大）を拾い、竪坑を下ると錠の間に着く（T は閉じ・色門も両方閉）
//   ⑤ 錠の間：ソルバーの最短手順（剣だけ）を実機で再生すると T が開き、器で最大ハート +1
//   ⑧ 錠の間：石を動かした後は笛（`fluteEffect`）で初期配置に戻る／動かす前は不発
//      （解いた後に不発なのは ⑤ の末尾で測る＝解いたパズルを笛で壊せない）
//   ⑥ 主の間：X を倒すと封印が解け、ルミアの剣（ATK 16・4フレームで満タンビーム）が出る
//   ⑦ X を倒しても星の欠片は現れない（祭壇の総数 8 が動かない）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { waitForBoard } from './helpers.js';
import { ITEM_META, SWORD_TIERS, BASE_ATK } from '../shared/items.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { SWORD_COOLDOWN_MS } from '../game/constants.js';
import { gameLayerEntries } from '../shared/layers.js';
import { countTriforces } from '../shared/triforce.js';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { measureMetrics, makeGreedyPush, buttonFillOrders } from '../scripts/lib/puzzle-metrics.mjs';
import { EXTRA_ENEMY_ROOMS, stageThreat } from '../scripts/lib/enemy-placement.mjs';
import { ORDER, toolsUsableIn } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const STAGES = MAP.layers.darklord_prison.stages;
const FIELD = MAP.layers.field.stages;
const GAME = '/blade-of-lumia/game/';

const ENTRANCE = '0,0';   // 岩牢の口
const PUZZLE = '0,1';     // 二色の錠の間
const CELL = '0,2';       // 封魔の間
const HEART_CELL = '8,3';         // 錠の間の宝箱（ハートの器）
const SWORD_CELL = '8,10';        // 主の間の宝箱（ルミアの剣）
const SWORD_TIER = 4;
const PUZZLE_ENTRY = { r: 0, c: 6 };          // 竪坑から降りてくるセル（東側）
const PUZZLE_EXIT = ['9,5', '9,6'];           // 主の間へ降りるセル
/**
 * 「石が乗れて／プレイヤーが立てる」タイル＝押しの成立幾何を数えるための集合。
 * ⚠️ 看板 `i` は**通行不可**（`game/passable.js` の「隣接して剣で読む」）∴入れない。
 *    色スイッチは石を通さないが**プレイヤーは立てる**＝押しの足場になり得る∴入れる。
 */
const PUSHABLE = new Set([TILE.FLOOR, TILE.BUTTON, TILE.SWITCH_RED, TILE.SWITCH_BLUE, 'B', TILE.STONE]);

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

/**
 * 岩牢のプレビュー URL（羽衣で来る終盤の寄道＝祭壇を終えた装備で入る）。
 * ⚠️ `ps_weapon` だけでは `swordTier` が -1 のまま＝ビームも貫通も出ない∴`ps_sword` で
 *    聖剣（tier3）を持たせる＝**ルミアの剣がその上位として実際に持ち替わる**ことを
 *    ⑥ で測れる条件（tier4 → 2+14=16・満タンは 480ms）。
 */
function previewUrl(stage, row, col, extra = {}) {
  const p = new URLSearchParams({
    fromEditor: '1', layer: 'darklord_prison', stage,
    row: String(row), col: String(col),
    ps_weapon: '1', ps_sword: '3', ps_hearts: '15', ps_shield: '2', ...extra,
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
async function step(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }

/**
 * 目標セルまで「東へ寄せて南へ下る」で歩く（障害物の無い広間だけで使う）。
 * ⚠️ 1回の walkTiles では届かないことがある＝X の攻撃のノックバックや半セル位置ずれで
 *    歩数がずれる（旧 spec は差分を1回だけ歩いて c=9 で止まり赤くなった）∴収束させる。
 */
async function walkTo(page, to, guard = 8) {
  for (let g = 0; g < guard; g++) {
    const p = await at(page);
    if (p.r === to.r && p.c === to.c) return;
    if (p.c !== to.c) await walkTiles(page, p.c < to.c ? 'right' : 'left', Math.abs(to.c - p.c));
    else await walkTiles(page, p.r < to.r ? 'down' : 'up', Math.abs(to.r - p.r));
  }
}

/**
 * ダイアログを閉じる。道具入りの宝箱（type:'item'）は giveSubItem → maybeShowSubItemHint が
 * ダイアログを開き、**閉じるまで movePlayer が丸ごと無視される**（player.js:380 の
 * getIsDialog ガード）＝拾った直後に足が止まる。`window.__game` に advanceDialog は
 * 出ていないので実キー（input.js）で送る（field 系 spec と同じ書き方）。
 */
async function dismissDialog(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.evaluate(() => window.__game.getState().isDialog))) return;
    await page.keyboard.press('Enter');
    await step(page, 1);
  }
  expect(await page.evaluate(() => window.__game.getState().isDialog), 'ダイアログが閉じない').toBe(false);
}

/** プレイヤーの整数タイル座標（toTileRow/Col と同じ floor(v+0.5)）。 */
const at = (page) => page.evaluate(() => {
  const p = window.__game.getState().player;
  return { r: Math.floor(p.y + 0.5), c: Math.floor(p.x + 0.5) };
});
/**
 * そのセルに石（岩）の絵が描かれているか。
 * ⚠️ 石はクラスではなく **canvas スプライト**（`makeSprite('block')`）で描かれ、
 *    `stonePositions` にそのセルがあるあいだは描かれない（動いた石は char-layer が描く）
 *    ∴「クラス名に stone が入る」等では測れない＝盤のセルの子 canvas を数える。
 */
const stoneDrawnAt = (page, r, c) => page.evaluate(({ r: rr, c: cc }) => {
  const el = document.querySelector(`#board .cell[data-row="${rr}"][data-col="${cc}"]`);
  return !!el && el.querySelectorAll('canvas.obj-sprite').length > 0;
}, { r, c });
/** 石押しの整列判定用＝生の座標（floor で丸めると半セル位置を隣セルと誤認する）。 */
const rawPos = (page) => page.evaluate(() => {
  const p = window.__game.getState().player;
  return { x: p.x, y: p.y };
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

// ── 錠の間のソルバー（実マップの盤面をそのまま読む＝盤面を直したら測り直る）──────
/**
 * 錠の間のソルバーを作る。`noTools:true` は「弓/ブーメランで色スイッチを撃つ手を許さない」
 * ＝剣で隣接して叩く解だけを探す（⑤ の実機再生が movePlayer と swordAttack だけで済む）。
 */
function puzzleSolver(opt = {}) {
  const pz = STAGES[PUZZLE];
  const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
  return makeSolver(pz.tiles, bg, [], {}, new Set(), { hasLadder: false, ...opt });
}
const posOf = (state) => state.split('|')[0];
/** 幅優先で最短の状態列を1本求める（見つからなければ null）。 */
function shortestChain(S, starts, goalTest) {
  const prev = new Map(starts.map((s) => [s, null]));
  const q = [...starts];
  let goal = null;
  for (let i = 0; i < q.length && goal === null; i++) {
    for (const nx of S.nextStates(q[i])) {
      if (prev.has(nx)) continue;
      prev.set(nx, q[i]);
      if (goalTest(nx)) { goal = nx; break; }
      q.push(nx);
    }
  }
  if (goal === null) return null;
  const chain = [];
  for (let s = goal; s !== null; s = prev.get(s)) chain.push(s);
  return chain.reverse();
}
/**
 * 状態列を実機再生用の手順へ変換する。
 * 位置が動かない遷移＝色スイッチを叩いた手（`{type:'hit'}`）、動く遷移＝歩き／石押し。
 */
function toSteps(chain) {
  const pz = STAGES[PUZZLE];
  const findSwitchDir = (r, c, color) => {
    const want = color === 1 ? TILE.SWITCH_RED : TILE.SWITCH_BLUE;
    for (const [dir, dr, dc] of [['up', -1, 0], ['down', 1, 0], ['left', 0, -1], ['right', 0, 1]]) {
      if (pz.tiles[r + dr]?.[c + dc] === want) return dir;
    }
    return null;
  };
  const steps = [];
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1].split('|');
    const b = chain[i].split('|');
    const [r0, c0] = a[0].split(',').map(Number);
    const [r1, c1] = b[0].split(',').map(Number);
    if (r0 === r1 && c0 === c1) {
      const color = Number(b[6]);
      const dir = findSwitchDir(r0, c0, color);
      expect(dir, `色スイッチが隣接する（${r0},${c0}・color=${color}）`).toBeTruthy();
      steps.push({ type: 'hit', dir, color });
    } else {
      expect(Math.abs(r1 - r0) + Math.abs(c1 - c0), '1手＝1セル移動').toBe(1);
      const dir = r1 < r0 ? 'up' : r1 > r0 ? 'down' : c1 < c0 ? 'left' : 'right';
      steps.push({ type: 'move', dir, to: { r: r1, c: c1 }, push: a[1] !== b[1] });
    }
  }
  return steps;
}
/**
 * 手順を実際の入力経路で再生する。
 * 歩きは半セル刻み（1セル＝2回）、石押しは1回で1セル動くが実時間クールダウン
 * （STONE_PUSH_COOLDOWN_MS=600）がある∴押しの後だけ長く待つ。
 * 叩きは setHeroDir → swordAttack（入場直後は剣のクールダウンに食われて空振りするので
 * activeColor が目的の色になるまで振り直す＝sokoban-tiers.spec.js と同じ規則）。
 */
async function replay(page, steps) {
  const color = () => page.evaluate(() => window.__game.getStageState().activeColor);
  const wantColor = (c) => (c === 1 ? 'red' : 'blue');
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === 'hit') {
      await page.evaluate((d) => window.__game.setHeroDir(d), s.dir);
      const want = wantColor(s.color);
      for (let guard = 0; guard < 4 && await color() !== want; guard++) {
        await page.evaluate(() => window.__game.swordAttack());
        await page.waitForTimeout(SWORD_COOLDOWN_MS + 50);
      }
      expect(await color(), `手順${i + 1}（色スイッチ${s.dir}）で ${want} になる`).toBe(want);
      continue;
    }
    await page.evaluate((d) => window.__game.setHeroDir(d), s.dir);
    for (let guard = 0; guard < 6; guard++) {
      const p = await rawPos(page);
      if (p.x === s.to.c && p.y === s.to.r) break;
      await page.evaluate((d) => window.__game.movePlayer(d), s.dir);
      await page.waitForTimeout(s.push ? 650 : 30);
    }
    const p = await rawPos(page);
    expect(`${p.y},${p.x}`, `手順${i + 1}（${s.dir}${s.push ? '・石押し' : ''}）で ${s.to.r},${s.to.c} へ`)
      .toBe(`${s.to.r},${s.to.c}`);
  }
}

test.describe('Blade of Lumia – 魔王の岩牢（X 魔王）', () => {

  test('① データ契約：3部屋・報酬はルミアの剣とハートの器・X は世界に1体・岩礁は四方が水', () => {
    expect(Object.keys(STAGES).sort()).toEqual([ENTRANCE, PUZZLE, CELL]);
    expect(MAP.layers.darklord_prison.name, 'レイヤー名（HUD と進行地点のラベルの出所）').toBe('魔王の岩牢');
    expect(MAP.layers.darklord_prison.bossStage, '主の間が bossStage として登録されていない').toBe(CELL);

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

    // ── 岩牢の口（盤面を行リテラルで固定する）─────────────────────
    const gate = STAGES[ENTRANCE];
    expect(gate.tiles.map((_, r) => rowStr(gate, r))).toEqual([
      '############',
      '#>........B#',
      '#†.........#',   // 岩牢の刻み文＝石碑（キュー27 で看板 'i' から分けた）
      '###......###',
      '####....####',
      '#####..#####',
      '#####..#####',
      '#####..#####',
      '#####..#####',
      '#####..#####',
    ]);
    expect(gate.isBossRoom ?? false, '前室がボス部屋になっている').toBe(false);
    expect(enemiesOf(gate), '前室に敵を置いている（主との一対一を薄める）').toEqual({});
    expect(gate.signData['2,1']?.lines?.length, '前室の刻み文が無言看板').toBeGreaterThan(0);
    // 竪坑の底が錠の間になった＝刻み文がそれを案内している（0o-2 で書き直した）。
    expect(gate.signData['2,1'].lines.join('\n'), '前室の刻み文が錠の間に触れていない').toContain('錠');
    // 関門前の一息＝回復薬（大）は封印なしで置く（DT の各階と同じ作法）。
    expect(gate.chestContents['1,10'])
      .toEqual({ type: 'item', item: 'bigHealPotion', name: ITEM_META.bigHealPotion.name });
    expect(gate.showConditions?.['1,10'], '前室の回復薬に封印が付いている').toBeUndefined();
    // 錠の間への道＝竪坑（cols 5-6）だけ。南辺の他の列は塞がっている。
    for (const c of [5, 6]) {
      expect(tileAt(gate, 9, c), `竪坑の出口 (9,${c}) が塞がっている`).toBe('.');
    }
    for (const c of [1, 2, 3, 4, 7, 8, 9, 10]) {
      expect(tileAt(gate, 9, c), `南辺 (9,${c}) が開いている（出口は cols 5-6 だけ）`).toBe('#');
    }

    // ── 二色の錠の間（0o-2 で新設したパズル部屋）───────────────────
    const pz = STAGES[PUZZLE];
    expect(pz.tiles.map((_, r) => rowStr(pz, r))).toEqual([
      '#####..#####',
      '#..........#',
      '#.##.#†.##.#',   // 錠の間の刻み文＝石碑（キュー27）
      '#S)..(...(S#',
      '###.##.#####',
      '#....*.....#',
      '#.*#.*)..(S#',
      '#.[##TT...]#',
      '###B(..#####',
      '#####..#####',
    ]);
    expect(pz.isBossRoom ?? false, '錠の間がボス部屋になっている').toBe(false);
    expect(enemiesOf(pz), '錠の間に敵を置いている（石を押す部屋に戦闘を混ぜない）').toEqual({});
    // 部品の座標（手書きの表ではなく盤面から拾う）。
    expect(cellsOf(pz, TILE.BUTTON), 'ボタンは色門の奥に3個（A/B/C）').toEqual(['3,1', '3,10', '6,10']);
    expect(cellsOf(pz, TILE.STONE), '石は3個').toEqual(['5,5', '6,2', '6,5']);
    expect(cellsOf(pz, TILE.GATE), 'T は主の間への南口の手前に2枚').toEqual(['7,5', '7,6']);
    expect(cellsOf(pz, TILE.SWITCH_RED), '色スイッチ（赤）が1枚でない').toEqual(['7,2']);
    expect(cellsOf(pz, TILE.SWITCH_BLUE), '色スイッチ（青）が1枚でない').toEqual(['7,10']);
    expect(cellsOf(pz, TILE.GATE_RED), '赤門の枚数・位置が変わった').toEqual(['3,5', '3,9', '6,9', '8,4']);
    expect(cellsOf(pz, TILE.GATE_BLUE), '青門の枚数・位置が変わった').toEqual(['3,2', '6,6']);
    // 初期色を持たせない＝両門とも閉から始まる（まず色スイッチを叩くのが第一歩）。
    expect(pz.initActiveColor, '錠の間に初期色が付いている').toBeUndefined();
    // ⚠️ 0o-3 で「デッドロック 0」は捨てた（笛 `fluteEffect:{type:'resetStones'}` で戻せる）∴
    //    守るのは「デッドロックが無いこと」ではなく **笛で立て直せること**＝以下の幾何。
    expect(pz.fluteEffect, '笛で石を戻せない＝デッドロックが本当の詰みになる')
      .toEqual({ type: 'resetStones' });
    // (a) col 3 の縦穴 (3,3)/(5,3) は**プレイヤー専用**＝上下 (2,3)/(6,3) が壁で石を押し込めない。
    //     ここを掘ると石1個で広間と帯が永久に分断される（笛を吹くまで戻れない）。
    for (const k of ['2,3', '6,3']) {
      const [r, c] = k.split(',').map(Number);
      expect(tileAt(pz, r, c), `縦穴の上下 (${k}) を掘った＝石が縦穴に入って道を塞ぐ`).toBe(TILE.WALL);
    }
    // (b) 直列に並ぶ異色の門のあいだは床2枚（1枚だと最後の押し位置が他色の門の上＝解けない）。
    expect(rowStr(pz, 3).slice(2, 6), 'row 3 の「青・床・床・赤」が崩れた').toBe(')..(');
    expect(rowStr(pz, 6).slice(6, 10), 'row 6 の「青・床・床・赤」が崩れた').toBe(')..(');
    // (c) 連絡通路（竪坑からの入口・主の間への南口）へ石を押し出せない＝押しの成立幾何が無い。
    //     押し出せると通路が石で塞がり、上下の部屋を行き来できなくなる（笛は錠の間でしか吹けない）。
    const at = (r, c) => pz.tiles[r]?.[c];
    for (const k of ['0,5', '0,6', ...PUZZLE_EXIT]) {
      const [r, c] = k.split(',').map(Number);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const from = at(r - dr, c - dc), stand = at(r - 2 * dr, c - 2 * dc);
        expect(PUSHABLE.has(from) && PUSHABLE.has(stand),
          `石を連絡通路 ${k} へ押し込める（${r - dr},${c - dc} の石を ${r - 2 * dr},${c - 2 * dc} から押す）`)
          .toBe(false);
      }
    }
    // (d) ボタンは T に隣接しない（隣接すると足踏みで T を跨げて石を据えずに抜けられる）。
    for (const b of cellsOf(pz, TILE.BUTTON)) {
      const [br, bc] = b.split(',').map(Number);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        expect(tileAt(pz, br + dr, bc + dc), `ボタン ${b} が T に隣接`).not.toBe(TILE.GATE);
      }
    }
    // ⚠️ 主の間への南口は色で仕切らない＝閉じ込め（ハードロック）が起きない。
    for (const k of PUZZLE_EXIT) {
      const [r, c] = k.split(',').map(Number);
      expect(tileAt(pz, r, c), `南口 (${k}) が床でない`).toBe(TILE.FLOOR);
    }
    // ハートの器はここへ移した（封印なし＝赤門の奥に置くこと自体が「解いた見返り」）。
    expect(pz.chestContents[HEART_CELL])
      .toEqual({ type: 'heartContainer', name: ITEM_META.heartContainer.name });
    expect(pz.showConditions?.[HEART_CELL], '錠の間の宝箱に封印が付いている').toBeUndefined();
    // 看板は 0o-3 で (2,6)（広間から見上げる位置）へ移した＝笛の案内を載せている。
    expect(pz.signData['4,3'], '旧位置 (4,3) の看板が残っている').toBeUndefined();
    expect(pz.signData['2,6']?.lines?.length, '錠の間の刻み文が無言看板').toBeGreaterThan(0);
    expect(pz.signData['2,6'].lines.join('\n'), '刻み文が笛（詰んだときの戻し方）に触れていない')
      .toContain('笛');
    expect(stageThreat(pz, ENEMY_META), '錠の間に雑魚が居る').toBe(0);

    // ── 封魔の間（報酬と封印）───────────────────────────────
    const cell = STAGES[CELL];
    expect(cell.tiles.map((_, r) => rowStr(cell, r))).toEqual([
      '#####::#####',
      '#..........#',
      '#..........#',
      '#..........#',
      '#.......X..#',
      '#..........#',
      '#†.........#',   // 封魔の碑＝石碑（キュー27）
      '#..........#',
      '#.........B#',
      '############',
    ]);
    expect(cell.isBossRoom, '主の間が isBossRoom でない＝扉が閉じない／HP バーが出ない').toBe(true);
    // `:`（DOORWAY_BOSS）が無いと「🔓 扉が開いた！」が出ない＝錠の間の南口と噛み合う位置に2枚。
    expect(cellsOf(cell, ':'), 'ボス扉の2枚が錠の間の南口（cols 5-6）と噛み合っていない')
      .toEqual(['0,5', '0,6']);
    // 報酬＝ルミアの剣（0o-2 でハートの器から差し替えた）。
    expect(cell.chestContents[SWORD_CELL]).toEqual({ type: 'weapon', swordTier: SWORD_TIER });
    expect(cell.showConditions[SWORD_CELL], '主の間の宝箱が killAll 封印になっていない')
      .toEqual({ trigger: 'killAll' });
    expect(Object.values(cell.chestContents).some((c) => c.type === 'heartContainer'),
      '主の間にハートの器が残っている（錠の間へ移した）').toBe(false);
    expect(cell.signData['6,1']?.lines?.length, '封魔の碑が無言看板').toBeGreaterThan(0);
    expect(cell.signData['6,1'].lines.join('\n'), '碑文が剣の在処に触れていない').toContain('剣');

    // 剣ティア4（ルミアの剣）は世界に1本だけ＝ここ。
    expect(SWORD_TIERS[SWORD_TIER]?.name, '剣ティア4の名前が変わった').toBe('ルミアの剣');
    expect(SWORD_TIERS[SWORD_TIER].chargeMs, 'ルミアの剣の売り＝溜めの速さ（480ms）が消えた').toBe(480);
    const swordAt = [];
    for (const [lk, ld] of gameLayerEntries(MAP)) {
      for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
        for (const [k, c] of Object.entries(sd.chestContents ?? {})) {
          if (c.type === 'weapon' && c.swordTier === SWORD_TIER) swordAt.push(`${lk}/${sk} ${k}`);
        }
      }
    }
    expect(swordAt, 'ルミアの剣が世界に1本だけになっていない').toEqual([`darklord_prison/${CELL} ${SWORD_CELL}`]);

    // 主は1体だけ＝雑魚を1体でも足すと killAll 封印が「雑魚だけ倒して開く」抜け道になる。
    const cells = enemiesOf(cell);
    expect(cells, '主の間の敵が X 1体でない').toEqual({ '4,8': 'X' });
    expect(ENEMY_META.X.isBoss, 'X が isBoss でない').toBe(true);
    expect(ENEMY_META.X.isFinalBoss ?? false, 'X が isFinalBoss＝倒すとエンディングが始まる').toBe(false);
    expect(ENEMY_META.X.dropsTriforce ?? false,
      'X が星の欠片を落とす＝祭壇（総数8）より後の寄道に置けない').toBe(false);
    expect(countTriforces(MAP), '星の欠片の総数が 8 でない（祭壇の授与条件が壊れる）').toBe(8);
    // 向き別スプライトには向きが要る／enemyDirs に幽霊キーが無い。
    expect(ENEMY_META.X.directional, 'X が directional でない＝向きの前提が変わった').toBe(true);
    for (const k of Object.keys(cell.enemyDirs)) expect(cells[k], `幽霊キー ${k}`).toBeTruthy();
    expect(cell.enemyDirs['4,8'], 'X は降りてくる側（北）を向いて待つ').toBe('up');
    // 着地セル（北辺の ':' 2枚）とその隣接に敵を置かない（入室即被弾を防ぐ）。
    for (const k of ['0,5', '0,6', '1,5', '1,6', '0,4', '0,7']) {
      expect(cells[k], `着地際の敵 ${k}`).toBeUndefined();
    }
    // stageThreat はボスを数えない∴「寄道に雑魚が居ない」ことがそのまま 0 で出る。
    expect(stageThreat(cell, ENEMY_META), '主の間に雑魚が居る（脅威度が 0 でない）').toBe(0);

    // X は世界に1体だけ（test_mechanics は進行に存在しない検証ステージ∴数えない）。
    const xAt = [];
    for (const [lk, ld] of gameLayerEntries(MAP)) {
      for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
        for (const [k, ch] of Object.entries(enemiesOf(sd))) if (ch === 'X') xAt.push(`${lk}/${sk} ${k}`);
      }
    }
    expect(xAt, 'X が世界に1体だけになっていない（未配置に戻った／複数置いた）')
      .toEqual([`darklord_prison/${CELL} 4,8`]);

    // 表の外に作った敵部屋＝EXTRA_ENEMY_ROOMS に宣言しておく（無いと各機構 spec が赤くなる）。
    expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === 'darklord_prison' && e.stage === CELL),
      `darklord_prison ${CELL} が EXTRA_ENEMY_ROOMS に宣言されていない`).toBe(true);

    // ── 進行表（寄道として ORDER に載る）─────────────────────────
    const ids = ORDER.map((o) => o.id);
    const i = ids.indexOf('darklord_prison');
    expect(i, 'darklord_prison が ORDER に無い＝監査もエディタのプリセットも出ない')
      .toBeGreaterThan(-1);
    expect(ORDER[i].optional, '寄道でない（下限に数えると DT の判定諸元が動く）').toBe(true);
    expect(ids[i - 1], '岩牢の直前が魔将の巣でない（同じ羽衣ゲートの寄道が並ぶ）').toBe('warlord_lair');
    expect(ids[i + 1], '岩牢の直後が暗黒の塔でない').toBe('dark_tower');
    // 羽衣で来る部屋＝全道具所持（弱点判定の基準表）。
    const usable = toolsUsableIn(MAP).darklord_prison;
    for (const item of ['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']) {
      expect(usable?.has(item), `darklord_prison の地点で ${item} を持っていない`).toBe(true);
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
    for (const id of ['fieldToDarklordPrison', 'darklordPrison']) {
      expect(registry[id], `${id} が登録されていない`).toBeTruthy();
      expect(registry[registry[id].destId], `${id} の行き先が無い`).toBeTruthy();
      expect(registry[registry[id].destId].destId, `${id} が相互リンクになっていない`).toBe(id);
    }
    expect(registry.fieldToDarklordPrison).toMatchObject({ layer: 'field', stage: '9,10', pos: '1,2' });
    expect(registry.darklordPrison).toMatchObject({ layer: 'darklord_prison', stage: ENTRANCE, pos: '1,1' });

    // ── field 側（南湖の岩礁＝四方が水／標の案内）───────────────────
    const lake = FIELD['9,10'];
    expect(tileAt(lake, 1, 2), '岩礁の上に扉が置かれていない').toBe(TILE.MAP_ENTER);
    for (const c of [1, 2, 3, 4]) {
      // 見える地面は bgTiles（tiles ではない）＝岩肌 `c` で青一色の湖に黒く見える。
      expect(lake.bgTiles[`1,${c}`], `岩礁 (1,${c}) の下地が岩肌でない＝湖と同じ色で気づけない`)
        .toBe(TILE.ASH);
      if (c !== 2) expect(tileAt(lake, 1, c), `岩礁 (1,${c}) が床でない`).toBe(TILE.FLOOR);
    }
    // 足場が扉のセルだけになっていない＝岩牢から戻った直後に扉へ吸い込まれ続けない
    // （mapEnter は 1500ms のクールダウン明けに再発火する∴降りる先が要る）。
    expect([1, 3, 4].filter((c) => tileAt(lake, 1, c) === TILE.FLOOR).length,
      '岩礁の足場が足りない（戻ってきた瞬間に扉へ吸い込まれ続ける）').toBeGreaterThanOrEqual(2);

    // 岩礁は**1行だけ**＝南岸（橋 row 4）との間に水が2枚（rows 2-3）残る。
    // ⚠️ ここが1枚になると **はしご（D5 の報酬＝羽衣よりずっと早い）で渡れてしまい**
    //    羽衣ゲートが消える（`isLadderBridgeCell`＝水1枚の両岸が陸なら渡れる）。
    //    「橋を架けていない」だけでは足りない∴水の**枚数**を固定する。
    for (const c of [1, 2, 3, 4]) {
      for (const r of [2, 3]) {
        expect(lake.bgTiles[`${r},${c}`], `(${r},${c}) が水でない＝岩礁と南岸の間の水が2枚を割った`)
          .toBe(TILE.WATER);
        expect(tileAt(lake, r, c), `(${r},${c}) に橋/陸を架けた＝はしごか徒歩で岩礁へ渡れる`)
          .toBe(TILE.FLOOR);
      }
    }
    // 岩礁の左右と北も水＝横からの1枚渡りも無い（row 0 は画面の縁＝全面が水）。
    for (const [r, c] of [[1, 0], [1, 5], [0, 1], [0, 2], [0, 3], [0, 4]]) {
      expect(lake.bgTiles[`${r},${c}`], `岩礁の隣 (${r},${c}) が水でない＝歩いて渡れる陸が生えた`)
        .toBe(TILE.WATER);
    }

    // 標＝十字路の北の行き止まり（葉セル）に立てる。看板 `i` は**実エンジンでは通行不可**∴
    // 経路上に置くと道を塞ぐ（`game/passable.js` が false を返す＝tiles.js の表とは別）。
    expect(tileAt(lake, 3, 6), '湖の標が立っていない＝岩礁に気づけない').toBe(TILE.SIGN);
    const mark = lake.signData['3,6'].lines.join('\n');
    expect(mark, '標が岩の島に触れていない').toContain('島');
    expect(mark, '標が「飛べ」と言っていない').toContain('空');
    expect(mark, '標が牢（魔王）に触れていない').toContain('牢');

    // 旧入口（空島 field 8,1 の浮岩 (5,6)）は撤去済み＝2箇所から入れる二重の口を残さない。
    const sky = FIELD['8,1'];
    expect(Object.keys(sky.mapEnters ?? {}).sort(), '空島の扉が3枚（塔への戻り／塔の入口／虚空の祠）でない')
      .toEqual(['3,2', '3,9', '6,9']);
    expect(rowStr(sky, 5).slice(4, 8), '空島の浮岩が虚空に戻っていない').toBe('%%%%');
    expect(rowStr(sky, 4).slice(4, 8), '空島の浮岩（北の行）が虚空に戻っていない').toBe('%%%%');
    const stele = FIELD['8,1'].signData['7,2'].lines;
    expect(stele.join('\n'), '空島の石碑に魔王の案内が残っている（入口は南湖へ移した）')
      .not.toContain('魔王');
    // 既存の案内（虚空の祠の spec が参照している行）を壊していない。
    expect(stele.join('\n'), '祠の案内を上書きしている').toContain('もう 一つの 扉');
  });

  test('② 錠の間：石を押さないと届かず・貪欲では解けず・順序が一意（状態空間）', () => {
    // 1 部屋で 190 万状態を4回測る＝重い（合計 40 秒台）。既定の 30 秒では落ちる。
    test.setTimeout(180_000);
    const S = puzzleSolver();
    const entries = [[0, 5], [0, 6]].map(([r, c]) => S.encode(r, c, S.initStones, 0, 0, 0));
    const atExit = (s) => PUZZLE_EXIT.includes(posOf(s));
    const atChest = (s) => posOf(s) === HEART_CELL;
    const escapeTest = (s) => ['0,5', '0,6', ...PUZZLE_EXIT].includes(posOf(s));
    const BUTTONS = cellsOf(STAGES[PUZZLE], TILE.BUTTON);   // 盤面から拾う（手書きしない）
    const h = (goal) => {
      const [gr, gc] = goal.split(',').map(Number);
      const btn = BUTTONS.map((b) => b.split(',').map(Number));
      const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
      return (state) => {
        const [pos, stonesStr] = state.split('|');
        const [pr, pc] = pos.split(',').map(Number);
        let acc = man([pr, pc], [gr, gc]);
        for (const s of (stonesStr ? stonesStr.split(';') : [])) {
          const sp = s.split(',').map(Number);
          acc += Math.min(...btn.map((b) => man(sp, b)));
        }
        return acc;
      };
    };
    // ⚠️ `greedyFn` を渡さないと既定の1手ヒルクライムになり、石の裏へ回り込む歩行が必ず h を
    //    悪化させる＝**どんな倉庫番でも「貪欲では解けない」**になり軸②が空虚になる
    //    （0o-2 のこのテストが実際にそうなっていた）∴押し単位のマクロ貪欲を渡す。
    const opt = { guardMax: 6000000, escapeTest, greedyFn: makeGreedyPush(BUTTONS) };

    // 必須性：石を押せない（noPush）と南口にも宝箱にも届かない＝パズルも報酬も飾りでない。
    const NP = puzzleSolver({ noPush: true });
    const seen = new Set([[0, 5], [0, 6]].map(([r, c]) => NP.encode(r, c, NP.initStones, 0, 0, 0)));
    const q = [...seen];
    for (let i = 0; i < q.length; i++) {
      for (const nx of NP.nextStates(q[i])) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
    }
    expect([...seen].some(atExit), '石を押さずに主の間へ行けてしまう（パズルが飾り）').toBe(false);
    expect([...seen].some(atChest), '石を押さずに宝箱へ届いてしまう（報酬が飾り）').toBe(false);

    const exitM = measureMetrics(S, entries, atExit, h(PUZZLE_EXIT[0]), opt);
    const chestM = measureMetrics(S, entries, atChest, h(HEART_CELL), opt);
    // 軸①：深さ。0o-3（ユーザーの「こんな簡単なパズルならない方がいい。もっと難しくしてよ」）で
    // 32 → 120 に組み直した＝数字が動いたら盤面を触った合図∴測り直して DECISIONS に残す。
    expect(exitM.L, '南口までの最短手数が変わった（盤面を触ったら測り直す）').toBe(120);
    expect(chestM.L, '宝箱までの最短手数が変わった').toBe(122);
    // 軸②：押し単位のマクロ貪欲でも解けない＝「ボタンへ近づける押し」だけでは詰む。
    expect(exitM.greedy, 'マクロ貪欲で解けてしまう（insight=0＝作業ゲー）').toBe(false);
    expect(chestM.greedy, 'マクロ貪欲で宝箱まで行けてしまう').toBe(false);
    // 軸③：デッドロックは**在ってよい**（0o-3 で笛を付けた）＝0 は「幅1レーンに戻った」合図。
    expect(exitM.deadlocks, 'デッドロックが 0＝考える余地の無い一本道に戻っている').toBeGreaterThan(0);
    // 軸④：解が細い（最短解の本数・強制手率）。一本道でもなく、無数の解でもない。
    expect(exitM.forcedRatio, '強制手率が高すぎる＝ほぼ一本道').toBeLessThanOrEqual(0.7);
    expect(Number(exitM.solCount), '最短解が多すぎる＝どう押しても最短になる').toBeLessThan(5000);
    // 詰みの扱い：ハードロックは笛（`fluteEffect`）で解く＝noEscape は 0 でなくてよいが、
    // 「笛を吹いても出られない」は不可∴笛の直後の盤面（石＝初期位置・両色門閉・T 開）で
    // 全床が歩けることを静的に測る（① の (a)-(d) と合わせて笛の効き目を保証する）。
    const pz = STAGES[PUZZLE];
    const walk = (pass, stop = new Set()) => {
      const wq = ['0,5', '0,6'], vis = new Set(wq);
      for (let i = 0; i < wq.length; i++) {
        const [r, c] = wq[i].split(',').map(Number);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
          if (vis.has(k)) continue;
          const ch = pz.tiles[nr]?.[nc];
          if (ch === undefined || stop.has(ch)) continue;
          if (!PUSHABLE.has(ch) && !pass.has(ch)) continue;
          if (ch === TILE.STONE) continue;                     // 笛の直後＝石は初期位置＝壁と同じ
          vis.add(k); wq.push(k);
        }
      }
      return vis;
    };
    const base = walk(new Set([TILE.GATE]));                   // T だけ開いた盤面で歩ける床
    const withoutT = walk(new Set([TILE.GATE_RED, TILE.GATE_BLUE]), new Set([TILE.GATE]));
    pz.tiles.forEach((row, r) => row.forEach((ch, c) => {
      const k = `${r},${c}`;
      if (!PUSHABLE.has(ch) || base.has(k)) return;
      if (ch === TILE.STONE
        && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => base.has(`${r + dr},${c + dc}`))) return;
      expect(withoutT.has(k), `笛を吹いても立て直せないセル ${k}（色門の奥／初期石で孤立）`).toBe(false);
    }));

    // ユーザーの難易度の軸「読みの深さ（順序が一意）」＝最短解 DAG 上で、ボタンが初めて石で
    // 埋まる順序が1通りしか無い（0o-2 は2通り＝どちらでもよい＝読む必要が無かった）。
    const { orders } = buttonFillOrders(S, entries, atExit, BUTTONS);
    expect(orders, 'ボタンを埋める順序が一意でない＝順序を読む必要が無い').toEqual([[0, 1, 2]]);

    // 剣だけ（弓/ブーメランを持たない）でも解ける＝⑤ の実機再生が成立する条件。
    const melee = puzzleSolver({ noTools: true });
    const meleeM = measureMetrics(
      melee, [[0, 5], [0, 6]].map(([r, c]) => melee.encode(r, c, melee.initStones, 0, 0, 0)),
      atChest, h(HEART_CELL), opt);
    expect(meleeM.L, '剣だけで宝箱まで行く最短手数が変わった').toBe(126);
    expect(meleeM.greedy, '剣だけならマクロ貪欲で解けてしまう').toBe(false);
  });

  test('③ 岩礁は飛行でしか行けず（徒歩✗・はしご✗）、扉に乗ると岩牢へ入れる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 南湖の十字路には敵が3体（C (3,5)／F (4,7)／C (6,6)）居る＝ノックバックで座標が動くと
    // 「歩いて越えたか」の測定が嘘になる∴どの経路でも先に片付けてから測る。
    const clearScreen = async () => {
      await page.evaluate(() => {
        for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 9999, 'sword');
      });
      await page.waitForFunction(() => window.__game.getEnemies().length === 0, null,
        { timeout: 10_000 });
    };
    // 橋 row 4 の cols 1-4（岩礁の真下の4列）から北へ歩き続けても row 4 に留まる＝水を越えられない。
    // ⚠️ 1列だけで測ってはいけない＝別の列だけを陸に塗り替えた壊し方を緑で通してしまう
    //    （歯の確認で実測＝bgTiles を1列だけ `g` にする改変は col 1 だけの測定では捕まらない）。
    // ⚠️ 逆に「tiles に橋 `v` を1本架ける」だけでは渡れない＝`passable.js tilePassable` は
    //    `isWaterAt()`（bgTiles の水も見る）を橋の判定より**先**に false で返す∴渡れる形に
    //    するには bgTiles を陸に塗り替えるしかない。つまり守るべき不変条件は
    //    「橋を架けていない」ではなく **bgTiles の水の枚数**（① がそれを固定している）。
    const cannotWalkNorth = async (extra, col) => {
      await page.goto(fieldUrl('9,10', 4, col, { ps_weapon: '1', ps_hearts: '15', ...extra }));
      await waitForBoard(page);
      await clearScreen();
      // ⚠️ `ps_ladder` が実際にプレイヤーへ届いていることを先に測る＝届いていなければ
      //    「はしごでも渡れない」は歯の無い測定になる（持たせ忘れを緑で通してしまう）。
      expect(await page.evaluate(() => !!window.__game.getPlayer().hasLadder),
        `ps_ladder が届いていない（${JSON.stringify(extra)}）`).toBe(extra.ps_ladder === '1');
      await page.evaluate(() => window.__game.toggleFlight());
      expect((await page.evaluate(() => window.__game.getState().player.flying)),
        `羽衣なしで飛べた（${JSON.stringify(extra)}）`).toBe(false);
      await walkTiles(page, 'up', 4);
      expect((await at(page)).r, `col ${col} から北へ歩いて岩礁へ渡れた（${JSON.stringify(extra)}）`).toBe(4);
      expect(await page.evaluate(() => window.__game.getState().currentLayer),
        `col ${col} から歩いて魔王の岩牢へ入れた（${JSON.stringify(extra)}）`).toBe('field');
    };

    for (const col of [1, 2, 3, 4]) {
      // 羽衣なし：水（rows 2-3）の手前で止まる＝歩いては岩礁に立てない（完了条件 c の前提）。
      await cannotWalkNorth({}, col);
      // はしごを持っていても渡れない＝**水が2枚**あるから（1枚だと `isLadderBridgeCell` で
      // 渡れてしまい、D5 の報酬を取った時点で羽衣ゲートが消える）。ここが (c) の本命の歯。
      await cannotWalkNorth({ ps_ladder: '1' }, col);
    }

    // 羽衣あり：飛んで水を越え、岩礁 (1,1) に降りてから扉 (1,2) に乗る。
    await page.goto(fieldUrl('9,10', 4, 1, { ps_weapon: '1', ps_hearts: '15', ps_wingrobe: '1' }));
    await waitForBoard(page);
    await clearScreen();
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await page.evaluate(() => window.__game.getState().player.flying))).toBe(true);
    await walkTiles(page, 'up', 3);
    expect(await at(page), '水を越えて岩礁まで飛べていない').toEqual({ r: 1, c: 1 });
    await page.evaluate(() => window.__game.toggleFlight());
    expect((await page.evaluate(() => window.__game.getState().player.flying)),
      '岩礁に降りられていない').toBe(false);

    await walkTiles(page, 'right', 1);
    await page.waitForFunction(() => window.__game.getState().currentLayer === 'darklord_prison',
      null, { timeout: 3000 });
    expect(await stageOf(page), '扉の行き先が前室でない').toBe(ENTRANCE);
    expect(await at(page), 'mapEnter の着地セル (1,1) でない').toEqual({ r: 1, c: 1 });
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('④ 前室で回復薬（大）を拾い、竪坑を下ると錠の間に着く（T は閉じ・色門も両方閉）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(previewUrl(ENTRANCE, 1, 1));
    await waitForBoard(page);
    expect(await page.evaluate(() => window.__game.getEnemies().length),
      '前室に敵が spawn した（一対一を薄める）').toBe(0);

    // 関門前の一息＝宝箱 (1,10) まで歩いて回復薬（大）を受け取る（封印なし）。
    await walkTiles(page, 'right', 9);
    expect(await at(page), '前室の東端まで歩けない').toEqual({ r: 1, c: 10 });
    await page.waitForFunction(() => !!window.__game.getPlayer().subItems?.bigHealPotion, null,
      { timeout: 5000 });
    expect(await page.evaluate(() => window.__game.getPlayer().subItems.bigHealPotion.count),
      '回復薬（大）が手に入っていない').toBe(1);
    await dismissDialog(page);   // 道具の入手ヒントは閉じるまで movePlayer が無視される

    // 漏斗を通って竪坑（cols 5-6）へ回り込み、南辺まで下る。
    await walkTiles(page, 'down', 1);
    await walkTiles(page, 'left', 4);
    expect(await at(page), '前室の row 2 を西へ戻れない').toEqual({ r: 2, c: 6 });
    await walkTiles(page, 'down', 7);
    expect(await at(page), '竪坑を降りられない（漏斗が塞がっている）').toEqual({ r: 9, c: 6 });

    // 南辺を越えて錠の間へ（歩いて渡る＝mapEnter ではない）。
    expect(await walkAcross(page, 'down'), '錠の間へ降りられない（竪坑が繋がっていない）')
      .toBe(PUZZLE);
    expect(await page.evaluate(() => window.__game.getState().currentLayer)).toBe('darklord_prison');
    expect(await page.evaluate(() => window.__game.getEnemies().length), '錠の間に敵が spawn した').toBe(0);

    // 初期状態＝T は閉じ、activeColor は未設定（両色門とも閉）。
    const st = await ss(page);
    expect(st.openGates ?? [], '入った時点で T が開いている（パズルが成立しない）').toEqual([]);
    expect(st.activeColor, '初期色が入っている（両門とも閉から始める設計）').toBeNull();
    expect(st.stonesLocked, '入った時点で石がロックされている').toBeFalsy();

    // T が閉じているあいだは主の間へ降りられない（南へ歩いても row 6 で止まる）。
    await walkTiles(page, 'down', 8);
    expect((await at(page)).r, '閉じた T を通り抜けた').toBeLessThanOrEqual(6);
    expect(await walkAcross(page, 'down', 3), 'T を開けずに主の間へ降りられた').toBe(PUZZLE);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑤ 錠の間：ソルバーの最短手順（剣だけ）を実機で再生すると T が開き、器で最大ハート +1', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 0o-3 で手順が 37 → 126 手になった（石押しは 650ms 待ち・叩きは剣のクールダウン待ち）∴
    // 既定の 30 秒では再生しきれない。
    test.setTimeout(240_000);

    // 手順はソルバー（noTools＝剣で隣接して叩く解だけ）から起こす。
    // ⚠️ 実機の開始セルと同じ1点から探す（両入口の min を再生すると初手が噛み合わない）。
    const S = puzzleSolver({ noTools: true });
    const start = S.encode(PUZZLE_ENTRY.r, PUZZLE_ENTRY.c, S.initStones, 0, 0, 0);
    const chain = shortestChain(S, [start], (s) => posOf(s) === HEART_CELL);
    expect(chain, '剣だけで宝箱まで届く手順が無い（盤面が解けなくなった）').toBeTruthy();
    const steps = toSteps(chain);

    // 笛も持たせる＝末尾で「解いた後は笛が不発」を測る（`activeSubItem` は笛になる）。
    await page.goto(previewUrl(PUZZLE, PUZZLE_ENTRY.r, PUZZLE_ENTRY.c, { ps_flute: '1' }));
    await waitForBoard(page);
    const before = await page.evaluate(() => window.__game.getPlayer());
    expect(before.maxHearts, '前提：ps_hearts でハート数が入っていない').toBe(15);

    await replay(page, steps);

    // 石が3個ともボタンに乗った＝T が開き、石は恒久ロックされる（足踏みでは ON にならない）。
    const st = await ss(page);
    expect(st.stonesLocked, '石がロックされていない（ボタンに乗っていない）').toBe(true);
    expect([...(st.openGates ?? [])].sort(), 'T (7,5)/(7,6) が開いていない').toEqual(['7,5', '7,6']);
    expect(st.activeColor, '宝箱の前の赤門を開けたまま到達していない').toBe('red');

    // ハートの器で最大ハートが 1 つ増える（封印なし＝到達で開く）。
    await page.waitForFunction((n) => window.__game.getPlayer().maxHearts === n + 1,
      before.maxHearts, { timeout: 5000 });
    expect((await ss(page)).openedChests, '宝箱が開封済みになっていない').toContain(HEART_CELL);
    const after = await page.evaluate(() => window.__game.getPlayer());
    expect(after.maxHp, '最大 HP がハート数から導出されていない')
      .toBe(before.maxHp + (before.maxHp / before.maxHearts));

    // 解いた後に笛を吹いても石は戻らない＝笛は救済であって「解き直し」ではない
    // （`playFlute` の allSolved / stonesLocked ガード。ここが抜けると T が閉じて詰む）。
    await page.evaluate(() => window.__game.useSubItem());
    await step(page, 2);
    const afterFlute = await ss(page);
    expect(afterFlute.stonesLocked, '解いた後に笛で石が動いた').toBe(true);
    expect([...(afterFlute.openGates ?? [])].sort(), '解いた後に笛を吹いたら T が閉じた')
      .toEqual(['7,5', '7,6']);

    // T を開けた後は南口から主の間へ降りられる（赤門 (8,4) を通って戻る）。
    await walkTiles(page, 'right', 2);
    expect(await at(page), '宝箱の小部屋から南口の列へ戻れない').toEqual({ r: 8, c: 5 });
    expect(await walkAcross(page, 'down', 4), 'T を開けたのに主の間へ降りられない').toBe(CELL);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑥ X を倒すと封印が解け、ルミアの剣（ATK 16・4フレームで満タンビーム）が出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 北辺の扉のすぐ内側から始める＝入室と同じ条件でロックが掛かる。
    await page.goto(previewUrl(CELL, 1, 6));
    await waitForBoard(page);
    await page.waitForFunction(
      () => !document.getElementById('boss-hpbar')?.classList.contains('hidden'), null,
      { timeout: 5000 });
    expect(await page.evaluate(() => window.__game.getState().bossRoomLocked),
      'ボス部屋がロックされていない（扉が閉じない）').toBe(true);
    expect(await doorLooks(page, ['0,5', '0,6']), '北のボス扉2枚が閉じていない')
      .toEqual(['closed', 'closed']);

    // 前提：聖剣（tier3）で入る＝ルミアの剣はその上位として持ち替わる。
    const before = await page.evaluate(() => window.__game.getPlayer());
    expect(before.swordTier, '前提：ps_sword で聖剣を持っていない').toBe(3);
    expect(before.atk, '前提の ATK が聖剣（BASE 2 + 12）でない').toBe(BASE_ATK + SWORD_TIERS[3].atk);

    // 封印中：X が生きているあいだは宝箱の封印が解けていない。
    expect((await ss(page)).conditionsMet ?? [], 'X が生きているのに封印が解けている')
      .not.toContain(SWORD_CELL);

    // 撃破 → killAll 封印が解ける（撃破演出のあいだ game loop は止まる∴長めに待つ）。
    await page.evaluate(() => {
      const x = window.__game.getEnemies().find((e) => e.type === 'X');
      window.__game.dealDamage(x.id, 9999, 'sword');
    });
    await page.waitForFunction(() => window.__game.getEnemies().length === 0, null,
      { timeout: 20_000 });
    await page.waitForFunction((k) => (window.__game.getStageState().conditionsMet ?? []).includes(k),
      SWORD_CELL, { timeout: 10_000 });
    expect(await page.evaluate(() => window.__game.getState().bossRoomLocked),
      '撃破後もロックが解けない（出られない）').toBe(false);
    expect(await doorLooks(page, ['0,5', '0,6']), '撃破後もボス扉が閉じたまま')
      .toEqual(['open', 'open']);

    // 宝箱 (8,10) まで歩いて受け取る（合格しただけでは渡らない）。
    await walkTo(page, { r: 8, c: 10 });
    expect(await at(page), '宝箱のセルに立てていない').toEqual({ r: 8, c: 10 });
    await page.waitForFunction((t) => window.__game.getPlayer().swordTier === t, SWORD_TIER,
      { timeout: 5000 });
    expect((await ss(page)).openedChests, '宝箱が開封済みになっていない').toContain(SWORD_CELL);

    // ルミアの剣＝ATK は最小の刻みだけ上がり（14 → 16）、溜めは 480ms で満タンになる。
    const after = await page.evaluate(() => window.__game.getPlayer());
    expect(after.atk, 'ATK がティア表から導出されていない')
      .toBe(BASE_ATK + SWORD_TIERS[SWORD_TIER].atk);
    expect(after.atk - before.atk, 'ATK の上げ幅が「ちょっとだけ」でない（ユーザー確定）').toBe(2);

    // 「溜めが速い」は外から**貫通**で見える（fireBeam: piercing = full && tier.pierce）
    // ∴この部屋で拾った剣が本当に 4 フレーム（480ms）で満タンになるかを敵2体で測る。
    // ⚠️ `getProjectiles()` のスナップショットは**ホワイトリスト**＝`strong`/`piercing` は
    //    載っていない∴フラグを読むと常に undefined＝静かに緑になる（帰結で測る）。
    // ⚠️ 敵を注入するのは killAll 封印が解けた後（先に入れると封印の頭数が増える）。
    const ids = await page.evaluate(() => [
      window.__game.injectEnemy(8, 8, 1),
      window.__game.injectEnemy(6, 8, 1),
    ]);
    await page.evaluate(() => window.__game.setHeroDir('left'));
    await page.evaluate(() => window.__game.startCharge());
    await step(page, 4);   // gameTime は TICK_MS=120 刻み＝4 フレームで 480ms
    await page.evaluate(() => window.__game.releaseCharge());
    await step(page, 10);
    const alive = await page.evaluate((xs) => xs.filter(
      (id) => !!window.__game.getEnemies().find((e) => e.id === id)), ids);
    expect(alive, 'ルミアの剣が 480ms で満タンにならない（貫通せず奥の敵が残った）').toEqual([]);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑦ X を倒しても星の欠片は現れない（祭壇の総数 8 が動かない）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 岩牢は羽衣＝祭壇で 8 枚全部を捧げた後にしか入れない∴その状態を再現して入る。
    await page.goto(previewUrl(CELL, 1, 6, { ps_triforce: '8', ps_wingrobe: '1' }));
    await waitForBoard(page);
    await page.waitForFunction(
      () => !document.getElementById('boss-hpbar')?.classList.contains('hidden'), null,
      { timeout: 5000 });
    expect(await page.evaluate(() => window.__game.getPlayer().triforceCount)).toBe(8);

    await page.evaluate(() => {
      const x = window.__game.getEnemies().find((e) => e.type === 'X');
      window.__game.dealDamage(x.id, 9999, 'sword');
    });
    await page.waitForFunction(() => window.__game.getEnemies().length === 0, null,
      { timeout: 20_000 });
    // 欠片を落とすボスは #pending-triforce-piece（◭）を置く＝X は置かない。
    // 演出は sleep(600) → pulse → setTimeout(1500) 越しに出る∴出ないことを確かめるには待つ。
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => !!document.getElementById('pending-triforce-piece')),
      'X が星の欠片を落とした＝祭壇の総数 8 と噛み合わず羽衣が永久に手に入らなくなる').toBe(false);
    expect(await page.evaluate(() => window.__game.getPlayer().triforceCount),
      '欠片の所持数が増えた').toBe(8);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

  test('⑧ 錠の間：石を動かした後は笛で初期配置に戻る（動かす前は不発）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 0o-3 の錠の間はデッドロックを**許す**設計＝救済は笛だけ（再入室では石は戻らない）∴
    // 「笛が実エンジンで本当に効くか」は ② の静的検査とは別に実機で測る必要がある。
    // 縦穴の南（5,3）から始める＝石 (5,5) を1回押せる位置。
    await page.goto(previewUrl(PUZZLE, 5, 3, { ps_flute: '1' }));
    await waitForBoard(page);
    expect(await page.evaluate(() => window.__game.getPlayer().subItems.flute?.count > 0),
      '前提：ps_flute で笛を持っていない').toBe(true);

    // ① まだ石を動かしていない＝笛は不発（石の初期配置は stonePositions が空で表される）。
    expect((await ss(page)).stonePositions, '前提：入った時点で石が動いている').toEqual({});
    await page.evaluate(() => window.__game.useSubItem());
    await step(page, 2);
    expect((await ss(page)).stonePositions, '石を動かす前に笛が石を「戻した」').toEqual({});

    // ② 石を1回押す＋色スイッチを叩く → 笛で石も色も初期状態へ戻る。
    await walkTiles(page, 'right', 1);
    expect(await at(page), '縦穴の南から東へ歩けない').toEqual({ r: 5, c: 4 });
    await page.evaluate(() => window.__game.movePlayer('right'));
    await step(page, 6);   // 石押しのクールダウン（600ms）＝TICK_MS 120 × 5
    await page.evaluate(() => window.__game.movePlayer('right'));
    await step(page, 6);
    const pushed = await ss(page);
    expect(Object.values(pushed.stonePositions).map((s) => `${s.r},${s.c}`),
      '石 (5,5) を東へ押せていない（笛の効き目を測る前提が崩れた）').toContain('5,6');
    // 押した後は元のセルに石の絵が無い（`stonePositions` があるセルは render-board が描かない）。
    expect(await stoneDrawnAt(page, 5, 5), '押した後も (5,5) に石が描かれている').toBe(false);

    // ③ 笛 → 石が初期位置に戻り、activeColor も消える（`resetStones` は色も戻す）。
    await page.evaluate(() => window.__game.useSubItem());
    await step(page, 2);
    const reset = await ss(page);
    expect(reset.stonePositions, '笛を吹いても石が初期位置に戻らない（詰みが本当の詰みになる）')
      .toEqual({});
    expect(reset.activeColor, '笛を吹いても色が残っている（門の開閉が石とずれる）').toBeNull();
    expect(reset.openGates ?? [], '笛で T が開いた').toEqual([]);
    // 盤面の描画も戻る＝石は元の岩のセルに描かれている（renderBoard を呼び忘れると盤だけ古い）。
    expect(await stoneDrawnAt(page, 5, 5),
      '笛の後も (5,5) に石が描かれない（renderBoard の呼び忘れ＝状態と盤がずれる）').toBe(true);
    expect(errors, 'pageerror が出た').toEqual([]);
  });

});
