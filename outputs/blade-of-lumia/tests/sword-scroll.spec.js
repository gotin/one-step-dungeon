// tests/sword-scroll.spec.js
// 剣技の巻物と回転斬り（実行キュー100・2026-11-09 ユーザー確定）。
//
// 仕様＝D1〜D8 の「紋章の次に重い謎の部屋」に剣技の巻物が1個ずつ（全 `SCROLLS_FOR_WIDE_SPIN`＝8個）。
// `SCROLLS_FOR_SPIN`（4）つで、溜めた剣を**満タンで放したとき**ビームと同時に回転斬りが出る
// （新しいキーは足さない＝ユーザー判定「操作を足さない案」）。8つで回転斬りが2マス先まで届く。
// 当たるのは敵（と幻影・棘）だけ＝スイッチ・茂みは叩かない。
//
// 1セットで縛るもの：
//   ① エンジン … 1〜3・5〜7つ目は「n/8」だけ。4つ目で回転斬りを、8つ目で2マス先を言う。欄に入らない
//   ② 当たり   … 3つ＝満タンでも回転斬りは出ない。4つ＝背中・斜め・横の隣に当たり、2マス先は外れ。
//                 満タン未満で放すと出ない。8つ＝2マス先まで当たり、2マス半は外れ
//   ③ スイッチ … 回転斬りは隣のスイッチを叩かない
//   ④ 見た目   … 回転斬りで `.spin-slash` が出る（8つで `.wide`）。出ないときは出ない
//   ⑤ セーブ   … 個数がロードで残る。壊れた値は 0〜8 の整数に丸まる
//   ⑥ 表示     … ポーズの「だいじなもの」に n/8（4つ未満は効果を書かない）、4つで回転斬り・8つで2マス先
//   ⑦ データ   … 巻物は D1〜D8 に1個ずつ・紋章と別の部屋・割り当て表（移行スクリプト）どおり
//   ⑧ 監査     … `collectRewards` が層ごとに巻物を数える
//   ⑨ プレビュー … エディタの「剣技の巻物8つ」で URL に ps_scrolls=8（2つの入口とも）→ ゲームは8つ持って始まる
//   ⑩ 合図     … 溜めが満タン＝回転斬りが出る瞬間だけ、勇者のまわりに光の輪（`.charge-spin-ring`）が回る。
//                 満タン前・巻物3つでは出ない・8つで広い輪・放すと消える（2026-11-09 ユーザー判定＝いつ放せばよいか見えない）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { SCROLLS_FOR_SPIN, SCROLLS_FOR_WIDE_SPIN } from '../shared/items.js';
import { CHARGE_FULL_MS, TICK_MS } from '../game/constants.js';
import { collectRewards } from '../shared/progression.js';
import { Q100_PLAN } from '../scripts/migrate-q100-dungeon-rewards.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const SCROLL = { type: 'item', item: 'scroll', name: '剣技の巻物' };
// field 7,9：スイッチ Y (4,4)。左の (4,1)〜(4,3) は床。銅の剣（ps_sword=1）＝ためビームが撃てる剣。
const ROOM = (col) => `${GAME_URL}?fromEditor=1&layer=field&stage=7,9&row=4&col=${col}&ps_weapon=1&ps_sword=1`;
const FULL_TICKS = Math.ceil(CHARGE_FULL_MS / TICK_MS);

async function open(page, url) {
  await page.goto(url);
  await waitForBoard(page);
  // 実時間ループを止める＝注入した敵が動かない・tick 境界が揺れない。
  await page.evaluate(() => window.__game.pause());
}

// 巻物 n 個で、左を向いて ticks だけ溜めて放す。offsets＝勇者から見た敵の位置 [dx, dy]。
// 戻り値＝各敵の残り HP（99 のまま＝当たっていない）と、回転斬りの絵が出たか。
// ビームは左へ飛ぶ∴敵は左に置かない（放した直後に測る＝ビームはまだ動いていない）。
const spinAt = (page, { scrolls, offsets, ticks = FULL_TICKS }) => page.evaluate(({ scrolls, offsets, ticks }) => {
  const g = window.__game;
  const p = g.getPlayer();
  p.scrolls = scrolls;
  g.setHeroDir('left');
  const ids = offsets.map(([dx, dy]) => g.injectEnemy(p.x + dx, p.y + dy, 99));
  g.step(5);   // 剣のクールダウンを越える
  g.startCharge();
  g.step(ticks);
  g.releaseCharge();
  const hp = ids.map((id) => g.getEnemies().find((e) => e.id === id)?.hp);
  const slash = document.querySelector('.spin-slash');
  const out = { hp, slash: !!slash, wide: !!slash?.classList.contains('wide') };
  for (const id of ids) g.dealDamage(id, 999);   // 片付け
  document.querySelectorAll('.spin-slash').forEach((el) => el.remove());
  return out;
}, { scrolls, offsets, ticks });

test.describe('Blade of Lumia – 剣技の巻物と回転斬り（エンジン・当たり・表示）', () => {

  test('① 4つ目で回転斬り・8つ目で2マス先を言い、それ以外は「n/8」だけ。サブアイテム欄に入らない', async ({ page }) => {
    await open(page, ROOM(2));
    const out = await page.evaluate((scroll) => {
      const g = window.__game;
      const msgs = [];
      for (let i = 0; i < 8; i++) msgs.push({ msg: g.grantReward(scroll), n: g.getPlayer().scrolls });
      return { msgs, slots: Object.keys(g.getPlayer().subItems) };
    }, SCROLL);
    for (let i = 0; i < SCROLLS_FOR_WIDE_SPIN; i++) {
      const n = i + 1;
      expect(out.msgs[i].n, `${n}つ目の個数`).toBe(n);
      if (n === SCROLLS_FOR_SPIN) {
        expect(out.msgs[i].msg, '4つ目で回転斬りを言っていない').toContain('回転斬り を覚えた');
      } else if (n === SCROLLS_FOR_WIDE_SPIN) {
        expect(out.msgs[i].msg, '8つ目の文言').toContain('そろった');
        expect(out.msgs[i].msg, '8つ目で2マス先を言っていない').toContain('2マス先');
      } else {
        expect(out.msgs[i].msg, `${n}つ目の文言`).toContain(`${n}/${SCROLLS_FOR_WIDE_SPIN}`);
        expect(out.msgs[i].msg, `${n}つ目で効果を明かした`).not.toContain('回転斬り');
      }
    }
    expect(out.slots, '巻物がサブアイテム欄に入った').not.toContain('scroll');
  });

  test('② 3つでは出ない／4つで背中・斜め・横の隣に当たり2マス先は外れ・満タン未満は出ない／8つで2マス先まで', async ({ page }) => {
    await open(page, ROOM(2));
    const ring = [[1, 0], [1, 1], [0, -1], [1, -1]];   // 背中・斜め後ろ下・真上・斜め後ろ上
    const three = await spinAt(page, { scrolls: SCROLLS_FOR_SPIN - 1, offsets: ring });
    expect(three.hp, '3つで回転斬りが当たった').toEqual([99, 99, 99, 99]);
    expect(three.slash, '3つで回転斬りの絵が出た').toBe(false);

    const four = await spinAt(page, { scrolls: SCROLLS_FOR_SPIN, offsets: [...ring, [2, 0], [1.5, 0]] });
    for (let i = 0; i < ring.length; i++) expect(four.hp[i], `4つで隣 ${ring[i]} に当たらない`).toBeLessThan(99);
    expect(four.hp[4], '4つで2マス先に届いた').toBe(99);
    expect(four.hp[5], '4つで半マスずれた 1.5 に届いた（剣と同じ間合いのはず）').toBe(99);
    expect(four.slash).toBe(true);
    expect(four.wide, '4つで広い輪が出た').toBe(false);

    const half = await spinAt(page, { scrolls: SCROLLS_FOR_SPIN, offsets: ring, ticks: Math.floor(FULL_TICKS / 2) });
    expect(half.hp, '満タン未満で回転斬りが出た').toEqual([99, 99, 99, 99]);

    const eight = await spinAt(page, { scrolls: SCROLLS_FOR_WIDE_SPIN, offsets: [[2, 0], [2, 2], [0, 2], [2.5, 0]] });
    expect(eight.hp[0], '8つで2マス先に届かない').toBeLessThan(99);
    expect(eight.hp[1], '8つで斜め2マス先に届かない').toBeLessThan(99);
    expect(eight.hp[2], '8つで真下2マス先に届かない').toBeLessThan(99);
    expect(eight.hp[3], '8つで2マス半先まで届いた').toBe(99);
    expect(eight.wide, '8つで広い輪が出ない').toBe(true);
  });

  test('③ 回転斬りは隣のスイッチを叩かない（剣で叩けば切り替わる＝対照）', async ({ page }) => {
    // (4,3) に立つと右隣がスイッチ (4,4)。左を向いて溜めて放す＝回転斬りの輪にスイッチが入る。
    await open(page, `${ROOM(3)}&ps_scrolls=8`);
    const r = await page.evaluate((ticks) => {
      const g = window.__game;
      g.setHeroDir('left');
      g.step(5);
      g.startCharge(); g.step(ticks); g.releaseCharge();
      const bySpin = g.getStageState().switchToggles.includes('4,4');
      g.setHeroDir('right');
      g.step(5);
      g.swordAttack();
      return { bySpin, bySword: g.getStageState().switchToggles.includes('4,4') };
    }, FULL_TICKS);
    expect(r.bySpin, '回転斬りでスイッチが切り替わった').toBe(false);
    expect(r.bySword, '剣でスイッチが叩けない（対照）').toBe(true);
  });

  test('⑩ 満タン（回転斬りが出る瞬間）だけ光の輪が回る。満タン前・巻物3つでは出ない・8つで広い輪・放すと消える', async ({ page }) => {
    await open(page, ROOM(2));
    const ringAt = (n, ticks) => page.evaluate(({ n, ticks }) => {
      const g = window.__game;
      g.getPlayer().scrolls = n;
      g.setHeroDir('left');
      g.step(5);
      g.startCharge();
      g.step(ticks);
      const el = document.querySelector('#char-player .charge-spin-ring');
      const out = { ring: !!el, wide: !!el?.classList.contains('wide') };
      g.releaseCharge();
      out.afterRelease = !!document.querySelector('.charge-spin-ring');
      return out;
    }, { n, ticks });
    expect(await ringAt(SCROLLS_FOR_SPIN, FULL_TICKS - 2), '満タン前に輪が出た').toMatchObject({ ring: false });
    expect(await ringAt(SCROLLS_FOR_SPIN - 1, FULL_TICKS), '巻物3つで輪が出た').toMatchObject({ ring: false });
    expect(await ringAt(SCROLLS_FOR_SPIN, FULL_TICKS), '4つで満タンなのに輪が出ない').toEqual({ ring: true, wide: false, afterRelease: false });
    expect(await ringAt(SCROLLS_FOR_WIDE_SPIN, FULL_TICKS), '8つで広い輪にならない').toEqual({ ring: true, wide: true, afterRelease: false });
  });

  test('⑤ 個数はセーブ→ロードで残り、壊れた値は 0〜8 の整数に丸まる', async ({ page }) => {
    await open(page, ROOM(2));
    const out = await page.evaluate(async () => {
      const { sanitizeLoadedPlayer } = await import('/blade-of-lumia/game/save.js');
      const { ITEM_META } = await import('/blade-of-lumia/shared/items.js');
      const rt = (p) => sanitizeLoadedPlayer(JSON.parse(JSON.stringify({ subItems: {}, ...p })), ITEM_META).scrolls;
      return { kept: rt({ scrolls: 5 }), full: rt({ scrolls: 8 }), legacy: rt({}), str: rt({ scrolls: 'x' }),
        neg: rt({ scrolls: -1 }), frac: rt({ scrolls: 3.9 }), over: rt({ scrolls: 99 }) };
    });
    expect(out.kept).toBe(5);
    expect(out.full).toBe(8);
    expect(out.legacy, '導入前のセーブが 0 にならない').toBe(0);
    expect(out.str).toBe(0);
    expect(out.neg).toBe(0);
    expect(out.frac, '小数が切り捨てられない（4 に丸めると回転斬りが出る）').toBe(3);
    expect(out.over).toBe(8);
  });

  test('⑥ ポーズの「だいじなもの」に n/8、4つで回転斬り・8つで2マス先（4つ未満は効果を書かない）', async ({ page }) => {
    await page.goto(ROOM(2));
    await waitForBoard(page);
    const pauseText = async (n) => {
      await page.evaluate((k) => { window.__game.getPlayer().scrolls = k; }, n);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__game.getState().isPaused === true, null, { timeout: 3000 });
      const loc = page.locator('#pause-key-items');
      const t = (await loc.count()) ? await loc.innerText() : '';
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__game.getState().isPaused === false, null, { timeout: 3000 });
      return t;
    };
    expect(await pauseText(0), '0個なのに出ている').not.toContain('剣技の巻物');
    const t3 = await pauseText(3);
    expect(t3).toContain(`剣技の巻物 3/${SCROLLS_FOR_WIDE_SPIN}`);
    expect(t3, '4つ未満で効果を明かした').not.toContain('回転斬り');
    expect(await pauseText(4)).toContain('溜めて 放つと 回転斬り');
    expect(await pauseText(8)).toContain('回転斬りが 2マス先まで');
  });

});

test.describe('Blade of Lumia – 剣技の巻物（データ・監査）', () => {

  test(`⑦ 巻物は D1〜D8 に1個ずつ・計 ${SCROLLS_FOR_WIDE_SPIN} 個・紋章と別の部屋で、割り当て表どおり`, () => {
    const where = [];
    const emblemRooms = new Set();
    for (const [ln, layer] of Object.entries(map.layers)) {
      for (const [sk, st] of Object.entries(layer.stages ?? {})) {
        for (const src of ['chestContents', 'floorItems']) {
          for (const [cell, v] of Object.entries(st[src] ?? {})) {
            if (v?.item === 'scroll') where.push(`${ln} ${sk} ${cell}`);
            if (v?.item === 'emblem') emblemRooms.add(`${ln} ${sk}`);
          }
        }
      }
    }
    expect(where.length, where.join('\n')).toBe(SCROLLS_FOR_WIDE_SPIN);
    expect(new Set(where.map((w) => w.split(' ')[0])), '1ダンジョン1個になっていない')
      .toEqual(new Set([...Array(8)].map((_, i) => `dungeon_${i + 1}`)));
    for (const w of where) expect(emblemRooms.has(w.split(' ').slice(0, 2).join(' ')), `${w} が紋章と同じ部屋`).toBe(false);
    for (const [layer, room, cell, , after, label] of Q100_PLAN) {
      const cur = map.layers[layer].stages[room].chestContents[cell];
      const ok = after.type === 'rupee' ? cur?.type === 'rupee' && cur.value === after.value : cur?.item === after.item;
      expect(ok, `${layer} ${room} (${cell}) ${label}：${JSON.stringify(cur)}`).toBe(true);
    }
  });

  test('⑧ 監査は層ごとに巻物を数える', () => {
    const per = collectRewards(map);
    for (let i = 1; i <= 8; i++) expect(per.get(`dungeon_${i}`)?.scrolls, `dungeon_${i}`).toBe(1);
    expect(per.get('field')?.scrolls ?? 0).toBe(0);
  });

});

test.describe('Blade of Lumia – 剣技の巻物（プレビュー設定）', () => {

  test('⑨ エディタの「剣技の巻物8つ」→ URL に ps_scrolls=8（2つの入口とも）→ ゲームは8つ持って始まる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/blade-of-lumia/editor/');
    await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(map));
    await page.reload();
    await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
    await page.click('#btn-preview');
    await expect(page.locator('#preview-settings-overlay')).not.toHaveClass(/hidden/);
    await page.setChecked('#ps-scrolls', true);
    await page.click('#ps-btn-start');
    await page.waitForFunction(() => document.getElementById('preview-frame')?.src.includes('ps_scrolls='));
    const src1 = await page.$eval('#preview-frame', (el) => el.src);
    expect(new URL(src1).searchParams.get('ps_scrolls'), 'ツールバーの経路で ps_scrolls=8 にならない').toBe('8');
    await page.click('#btn-exit-preview');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('editor:previewClickAt', { detail: { row: 4, col: 2 } })));
    await expect(page.locator('#preview-settings-overlay')).not.toHaveClass(/hidden/);
    await page.setChecked('#ps-scrolls', true);
    await page.click('#ps-btn-start');
    await page.waitForFunction(() => document.getElementById('preview-frame')?.src.includes('ps_scrolls='));
    const src2 = await page.$eval('#preview-frame', (el) => el.src);
    expect(new URL(src2).searchParams.get('ps_scrolls'), '盤面クリックの経路で ps_scrolls=8 にならない').toBe('8');
    expect(errors).toEqual([]);

    await open(page, `${ROOM(2)}&ps_scrolls=8`);
    expect(await page.evaluate(() => window.__game.getPlayer().scrolls), 'ps_scrolls=8 で8つ持って始まらない').toBe(SCROLLS_FOR_WIDE_SPIN);
    await open(page, `${ROOM(2)}&ps_scrolls=99`);
    expect(await page.evaluate(() => window.__game.getPlayer().scrolls), '上限で丸めない').toBe(SCROLLS_FOR_WIDE_SPIN);
  });

});
