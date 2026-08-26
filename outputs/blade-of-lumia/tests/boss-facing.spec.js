// tests/boss-facing.spec.js — 「常に右を向いてしまっている」の再発防止
//
// ユーザー報告（2026-08-26・魔物 W の実プレイ中）＝
//   「常に右を向いてしまっている。プレーヤーが左側にいるなら左を向かせるべき」
//
// 原因＝勇者の絵を流用する3系統（魔将 escape / 魔物 monster / 魔王・ザーネル darklord）は
// `…D`/`…R`/`…U` が**本当に別の絵**（素の `monster` は heroR＝右向き）なのに、向きの機構
// （`directional: true`）を宣言していなかった。向いた絵へ差し替える処理が
// `bossTickHitAndAway` の中にだけ重複して書かれていたため、
// 「`hitAndAway: true` の敵は偶然向く／それ以外の移動 AI では向きが死ぬ」状態だった。
// 0d-3 で W を `hitAndAway: false`（combat の二相）へ替えた瞬間にそれが表に出た。
//
// ∴この本が守るのは2つ：
//   ① **データの不変条件**（導出＝手書きの一覧を作らない）＝
//      「向き別の絵が本当に別絵として登録されている敵は、向きの機構を宣言していること」
//      ＋「directional な敵は向き別3枚と攻撃ポーズ3枚が登録されていること」
//      （未登録だと syncDirectionalSprite が canvas を消したまま作り直せず敵が消える＝
//        ENEMY-DIRECTIONAL-GUIDE §1-2 の罠）
//   ② **実機の見た目**＝魔物 W が東西南北のプレイヤーへ向き直り、左に居るときは
//      canvas に反転が焼かれていること（GUIDE §6-4＝CSS transform では出ない）。
//
// ⚠️ ②は「間合いを保って1歩も動かない相」（combat の遠隔相）でも向くことを見る＝
//    向きを移動の副産物にしていたら落ちる（enemyKeepDistance の e.dir を歩幅の溜めより
//    前に出した理由そのもの）。

import { test, expect } from '@playwright/test';
import { ENEMY_META } from '../shared/enemies.js';
import { SPRITES } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const GAME = '/blade-of-lumia/game/';
const DIRS = ['D', 'R', 'U'];   // L は R の flipX で代用する（専用の絵は持たない）

// meta.sprite から向きの接尾辞を落とした基底名（enemy-ai.js resolveEnemySprite と同じ形）
const baseOf = (name) => name.replace(/(Atk|Guard)?[DRLU](Atk|Guard)?$/, '');

// ── ① データ＝向き別の絵を持つ敵は向きの機構を宣言している ────────────────
test('① 向き別の絵が別絵として登録されている敵は directional を宣言している', () => {
  const offenders = [];
  for (const [tile, m] of Object.entries(ENEMY_META)) {
    if (!m.sprite) continue;
    const base = baseOf(m.sprite);
    const d = SPRITES[`${base}D`], r = SPRITES[`${base}R`];
    if (!d || !r) continue;      // 向き別の絵が無い＝向きの機構の対象外（1枚絵の敵）
    if (d === r) continue;       // 全方向が同じ絵のエイリアス＝向いても見た目が変わらない
    if (!m.directional && !m.sideView) offenders.push(`${tile}（${m.name}・${base}）`);
  }
  expect(offenders,
    `向き別の絵を持つのに向きの機構が無い＝常に同じ向きのまま固まる: ${offenders.join(' / ')}`)
    .toEqual([]);
});

test('② directional な敵は向き別3枚＋攻撃ポーズ3枚が登録されている（欠けると攻撃中に敵が消える）', () => {
  const dirs = Object.entries(ENEMY_META).filter(([, m]) => m.directional);
  expect(dirs.length, 'directional な敵が1体も居ない＝この本が空虚').toBeGreaterThan(0);
  for (const [tile, m] of dirs) {
    const base = baseOf(m.sprite);
    for (const d of DIRS) {
      expect(SPRITES[`${base}${d}`], `${tile}（${m.name}）: ${base}${d} が未登録＝その向きで絵が消える`)
        .toBeTruthy();
      // 攻撃ポーズ＝markAttack が立てる `_atkUntil` の窓で引かれる名前。
      // 未登録だと syncDirectionalSprite が canvas を消した後 makeSprite が null を返し、
      // 窓のあいだ（ATTACK_POSE_MS=180ms）敵が画面から消える。
      expect(SPRITES[`${base}${d}Atk`], `${tile}（${m.name}）: ${base}${d}Atk が未登録＝攻撃中に敵が消える`)
        .toBeTruthy();
    }
    // 構え（Guard）は `guards: false` で降りられる＝絵を持たない敵はそう宣言しているはず。
    if (m.guards !== false) {
      for (const d of DIRS) {
        expect(SPRITES[`${base}${d}Guard`],
          `${tile}（${m.name}）: ${base}${d}Guard が無いのに guards: false を宣言していない`)
          .toBeTruthy();
      }
    }
    // エディタのプレビューも同じ絵を指す（素の `monster` などは右向き＝食い違いになる）
    if (TILE_SPRITE_MAP[tile]) {
      expect(TILE_SPRITE_MAP[tile].spr, `${tile}: スプライトマップの spr がメタと食い違う`)
        .toBe(m.sprite);
    }
  }
});

// ── ③ 実機＝魔物 W が四方のプレイヤーへ向き直る ────────────────────────
// 検証ステージ＝`test_mechanics[21,1]` `bal_monster`（W が (4,8) に1体・遮蔽ゼロ）。
const W_ROW = 4, W_COL = 8;
const D1_MIN = { ps_hearts: '3', ps_sword: '0', ps_weapon: '1' };

// 実時間ループは起動させない（GUIDE §4-2）＝論理 tick だけで測る。
const frozen = new WeakSet();
async function gotoFrozen(page, row, col) {
  if (!frozen.has(page)) {
    await page.addInitScript(() => {
      const native = window.setInterval;
      window.__loopBlocked = 0;
      window.setInterval = function (fn, ms, ...rest) {
        if (/step\s*\(\s*1\s*\)/.test(String(fn))) { window.__loopBlocked++; return 0; }
        return native.call(window, fn, ms, ...rest);
      };
    });
    frozen.add(page);
  }
  const p = new URLSearchParams({
    fromEditor: '1', layer: TEST_LAYER, stage: stageKey('bal_monster'),
    row: String(row), col: String(col), ...D1_MIN,
  });
  await page.goto(`${GAME}?${p.toString()}`);
  await waitForBoard(page);
  expect(await page.evaluate(() => window.__loopBlocked), '実時間ループを止められていない')
    .toBeGreaterThan(0);
}

// n tick 進めて、W の向きと**画面に出ている canvas**（絵の名前・焼き込まれた反転）を読む。
async function facingOf(page, ticks) {
  return page.evaluate((n) => {
    const g = window.__game;
    for (let i = 0; i < n; i++) g.step(1);
    const w = g.getEnemies().find(e => e.type === 'W');
    if (!w) return { error: 'W が居ない' };
    // ⚠️ 敵の id は "行,列"（posKey）＝`#char-enemy-4,8` は CSS セレクタとして不正
    //    ∴getElementById で引く（enemy-ai.js の差替と同じ引き方）。
    const cv = document.getElementById(`char-enemy-${w.id}`)?.querySelector('canvas.sprite');
    return {
      dir: w.dir, sprite: w.sprite, flipX: w.flipX,
      cmode: w.cmode ?? null,
      dom: cv ? { sprite: cv.dataset.sprite, flipX: cv.dataset.flipX } : null,
    };
  }, ticks);
}

const CASES = [
  { name: '西（左）', row: W_ROW,     col: 3,       dir: 'left',  spr: 'monsterR', flip: '1' },
  { name: '東（右）', row: W_ROW,     col: W_COL + 2, dir: 'right', spr: 'monsterR', flip: '' },
  { name: '北（上）', row: 1,         col: W_COL,   dir: 'up',    spr: 'monsterU', flip: '' },
  { name: '南（下）', row: W_ROW + 4, col: W_COL,   dir: 'down',  spr: 'monsterD', flip: '' },
];

for (const c of CASES) {
  test(`③ 魔物 W はプレイヤーが${c.name}に居ると ${c.dir} を向く（絵＝${c.spr}・反転=${c.flip || 'なし'}）`,
    async ({ page }) => {
      await gotoFrozen(page, c.row, c.col);
      const f = await facingOf(page, 3);
      expect(f.error).toBeUndefined();
      expect(f.dir, `向き（e.dir）が ${c.dir} ではない`).toBe(c.dir);
      // 攻撃ポーズの窓に入っている tick もある＝接尾辞 Atk は許す（向きの部分だけ見る）
      expect(f.sprite, `絵の名前が ${c.spr} 系ではない`).toMatch(new RegExp(`^${c.spr}(Atk)?$`));
      expect(f.flipX, '左右反転（e.flipX）が向きと合っていない').toBe(c.flip === '1');
      expect(f.dom, '敵の canvas が無い＝画面から消えている').not.toBeNull();
      expect(f.dom.sprite, 'DOM の絵がエンティティの絵と食い違う').toMatch(new RegExp(`^${c.spr}(Atk)?$`));
      expect(f.dom.flipX, '画面に出ている canvas に反転が焼かれていない（GUIDE §6-4）').toBe(c.flip);
    });
}

// ── ④ 「間合いを保って動かない相」でも向き直る（向きが移動の副産物になっていない）──
// combat の遠隔相は間合いが合うと1歩も動かない＝旧実装（歩幅の溜めの後で e.dir を書く）では
// ここで向きが凍った。プレイヤーを東→西へ跨がせて、W が向き直ることを見る。
test('④ 遠隔相で動かないあいだにプレイヤーが反対側へ回っても向き直る', async ({ page }) => {
  await gotoFrozen(page, W_ROW, W_COL + 3);
  const before = await facingOf(page, 3);
  expect(before.dir, 'まず東を向いているはず').toBe('right');

  // プレイヤーだけを W の西側へ移す（W は動かさない＝同じ tick 数で向きだけが変わる）。
  await page.evaluate((col) => {
    const p = window.__game.getPlayer();
    p.x = col;
  }, W_COL - 3);
  const after = await facingOf(page, 1);
  expect(after.dir, '1 tick で西へ向き直るはず（歩幅の溜めを待たない）').toBe('left');
  expect(after.flipX).toBe(true);
  expect(after.dom.flipX, '画面の canvas にも反転が焼かれているはず').toBe('1');
});

// ── ⑤ 攻撃ポーズの窓でも敵が消えない（未登録の …Atk を踏んだときの実害の番人）──
test('⑤ 攻撃ポーズが出る窓を含め、W の canvas は一度も消えない', async ({ page }) => {
  await gotoFrozen(page, W_ROW, 3);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const w0 = g.getEnemies().find(e => e.type === 'W');
    const id = w0.id;
    let sawAtk = false, missing = 0;
    const names = new Set();
    for (let i = 0; i < 60; i++) {
      g.step(1);
      const w = g.getEnemies().find(e => e.id === id);
      if (!w) break;
      const cv = document.getElementById(`char-enemy-${id}`)?.querySelector('canvas.sprite');
      if (!cv) missing++;
      else names.add(cv.dataset.sprite);
      if (w.sprite?.endsWith('Atk')) sawAtk = true;
    }
    return { sawAtk, missing, names: [...names] };
  });
  expect(r.sawAtk, '60 tick 以内に攻撃ポーズが観測されない＝この本が空虚').toBe(true);
  expect(r.missing, `${r.missing} tick のあいだ canvas が無かった＝攻撃中に敵が消えている`).toBe(0);
  expect(r.names.some(n => n.endsWith('Atk')), '攻撃ポーズの絵が画面に出ていない').toBe(true);
});
