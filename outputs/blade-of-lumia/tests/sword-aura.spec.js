// tests/sword-aura.spec.js
// 光の紋章と剣のオーラ（実行キュー45・2026-10-11 ユーザー確定）。
//
// 仕様＝D1〜D8 の「いちばん深い謎の部屋」に光の紋章が1個ずつ（全 `EMBLEMS_FOR_AURA`＝8個）。
// 8つそろうと剣にオーラが宿り、**敵（と幻影）への**到達距離が `AURA_SWORD_REACH`（2.0＝1マス先）
// になる。スイッチ・色の紋・茂みは今までどおり目の前のマスで決まる（伸びた分では叩けない）。
//
// 1セットで縛るもの：
//   ① エンジン … 7つまでは「n/8」だけ（効果＝オーラは言わない＝そろうまで伏せる・ユーザー判定）、
//                 8つ目で「そろった」と効果。紋章はサブアイテム欄に入らない
//   ② 当たり   … オーラ無し＝1.0 は当たり 1.5/2.0 は外れ。オーラあり＝2.0 は当たり 2.5 は外れ
//   ③ スイッチ … オーラがあっても2マス先のスイッチは叩けない（1マス先は叩ける＝対照）
//   ④ 見た目   … オーラありで剣を振ると剣そのものが光り（`.sword-held.aura`）、`.sword-aura` が切っ先の
//                 1マス先まで伸びる（太さは剣と同じか少し太い・先が尖る）。無しでは出ない
//   ⑤ セーブ   … 個数がロードで残る。壊れた値は 0〜8 の整数に丸まる
//   ⑥ 表示     … ポーズの「だいじなもの」に n/8（そろうまでオーラは言わない）、そろうと「剣に オーラ」
//   ⑦ データ   … 紋章は D1〜D8 に1個ずつ・割り当て表（移行スクリプト）どおり・ルピーの差し替えも表どおり
//   ⑧ 監査     … `collectRewards` が層ごとに紋章を数える
//   ⑨ プレビュー … エディタの「光の紋章8つ」で URL に ps_emblems=8 が載り、ゲームはそれで8つ持って始まる
//                 （2026-10-11 ユーザー報告＝コンソールで __game を触れなかった∴URL だけで試せるようにした）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import { EMBLEMS_FOR_AURA } from '../shared/items.js';
import { AURA_SWORD_REACH, SWORD_REACH, ATTACK_POSE_MS } from '../game/constants.js';
import { collectRewards } from '../shared/progression.js';
import { Q45_PLAN } from '../scripts/migrate-q45-dungeon-rewards.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const EMBLEM = { type: 'item', item: 'emblem', name: '光の紋章' };
// field 7,9：スイッチ Y (4,4)。左の (4,1)〜(4,3) は床＝(4,2) に立って右を向くと2マス先がスイッチ。
const SWITCH_ROOM = (col) => `${GAME_URL}?fromEditor=1&layer=field&stage=7,9&row=4&col=${col}&ps_weapon=1`;

async function open(page, url) {
  await page.goto(url);
  await waitForBoard(page);
  // 実時間ループを止める＝注入した敵が動かない・tick 境界が揺れない。
  await page.evaluate(() => window.__game.pause());
}

const setEmblems = (page, n) => page.evaluate((k) => { window.__game.getPlayer().emblems = k; }, n);

test.describe('Blade of Lumia – 光の紋章と剣のオーラ（エンジン・当たり・表示）', () => {

  test('① 7つまでは「n/8」だけ（オーラは伏せる）、8つ目で「そろった」と効果。サブアイテム欄に入らない', async ({ page }) => {
    await open(page, SWITCH_ROOM(2));
    const out = await page.evaluate((emblem) => {
      const g = window.__game;
      const msgs = [];
      for (let i = 0; i < 8; i++) msgs.push({ msg: g.grantReward(emblem), n: g.getPlayer().emblems });
      return { msgs, slots: Object.keys(g.getPlayer().subItems) };
    }, EMBLEM);
    for (let i = 0; i < EMBLEMS_FOR_AURA - 1; i++) {
      expect(out.msgs[i].n, `${i + 1}つ目の個数`).toBe(i + 1);
      expect(out.msgs[i].msg, `${i + 1}つ目の文言`).toContain(`${i + 1}/${EMBLEMS_FOR_AURA}`);
      expect(out.msgs[i].msg, `${i + 1}つ目でオーラを明かした`).not.toContain('オーラ');
    }
    expect(out.msgs[7].n).toBe(EMBLEMS_FOR_AURA);
    expect(out.msgs[7].msg, '8つ目の文言').toContain('そろった');
    expect(out.msgs[7].msg, '8つ目で効果を言っていない').toContain('1マス 先の 敵まで 届く');
    expect(out.slots, '紋章がサブアイテム欄に入った').not.toContain('emblem');
  });

  test('② オーラ無しは 1.0 だけ、オーラありは 2.0 まで当たる（2.5 は外れ）', async ({ page }) => {
    expect(AURA_SWORD_REACH, '到達は半マス刻みの段に乗る値（2.0＝1マス先）').toBe(2.0);
    expect(SWORD_REACH).toBeLessThan(1.5);
    // 右を向いて (4,1) に立つ＝敵を同じ行の x = 1 + d に置く（床の上・スイッチより手前）。
    await open(page, SWITCH_ROOM(1));
    const hitAt = (dist, emblems) => page.evaluate(({ dist, emblems }) => {
      const g = window.__game;
      g.getPlayer().emblems = emblems;
      g.setHeroDir('right');
      const p = g.getPlayer();
      const id = g.injectEnemy(p.x + dist, p.y, 99);
      g.step(5);   // 剣のクールダウン（300ms）を越える
      g.swordAttack();
      const e = g.getEnemies().find((x) => x.id === id);
      const hp = e?.hp;
      g.dealDamage(id, 999);   // 片付け＝次の測りに残さない
      return hp;
    }, { dist, emblems });
    expect(await hitAt(1.0, 0), 'オーラ無しで隣の敵に当たらない').toBeLessThan(99);
    expect(await hitAt(1.5, 0), 'オーラ無しで半マス先に届いた').toBe(99);
    expect(await hitAt(2.0, 0), 'オーラ無しで1マス先に届いた').toBe(99);
    expect(await hitAt(2.0, 7), '7つでもう届いた').toBe(99);
    expect(await hitAt(2.0, 8), 'オーラありで1マス先に届かない').toBeLessThan(99);
    expect(await hitAt(1.5, 8), 'オーラありで半マス先に届かない').toBeLessThan(99);
    expect(await hitAt(2.5, 8), 'オーラありで1マス半先まで届いた').toBe(99);
  });

  test('③ オーラがあっても2マス先のスイッチは叩けない（1マス先は叩ける）', async ({ page }) => {
    const toggled = async (col) => {
      await open(page, SWITCH_ROOM(col));
      await setEmblems(page, EMBLEMS_FOR_AURA);
      return page.evaluate(() => {
        const g = window.__game;
        g.setHeroDir('right');
        g.step(5);
        g.swordAttack();
        return g.getStageState().switchToggles.includes('4,4');
      });
    };
    expect(await toggled(2), 'オーラの伸びた分でスイッチを叩けた').toBe(false);
    expect(await toggled(3), '隣のスイッチが叩けない（対照）').toBe(true);
  });

  test('④ オーラありで振ると剣が光り、切っ先の1マス先まで剣ほどの太さで尖って伸びる（無しでは出ない）', async ({ page }) => {
    await open(page, SWITCH_ROOM(1));
    const geo = (emblems) => page.evaluate(async (k) => {
      const g = window.__game;
      g.getPlayer().emblems = k;
      g.setHeroDir('right');
      g.step(5);
      g.swordAttack();
      // 動き＝出た瞬間は根元に縮んでいる（伸びのアニメ）∴寸法は伸び切ってから測る。
      // 伸び（親の有限のアニメ）と光の筋（刃の1回目）の長さも取る＝剣が出ている窓に合っているか。
      const auraNow = document.querySelector('.sword-aura');
      const grow = auraNow?.getAnimations({ subtree: false }) ?? [];
      const runs = auraNow?.querySelector('.sword-aura-blade')?.getAnimations() ?? [];
      const timing = { grow: grow.map((a) => a.effect.getTiming().duration), run: runs.map((a) => a.effect.getTiming()) };
      await Promise.all(grow.map((a) => a.finished));
      const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
      const cell = document.querySelector('#board > *')?.getBoundingClientRect().width;
      const held = document.querySelector('.sword-held');
      const glow = held?.classList.contains('aura') && /drop-shadow/.test(held.querySelector('canvas')?.style.filter ?? '');
      const auraEl = document.querySelector('.sword-aura');
      return { sword: rect('.sword-held'), aura: rect('.sword-aura'), cell, glow, clip: auraEl?.querySelector('.sword-aura-blade') ? getComputedStyle(auraEl.querySelector('.sword-aura-blade')).clipPath : null, core: !!auraEl?.querySelector('.sword-aura-core'), timing };
    }, emblems);
    const off = await geo(0);
    expect(off.sword, '剣が描かれていない').not.toBeNull();
    expect(off.aura, 'オーラ無しなのに光った').toBeNull();
    expect(off.glow, 'オーラ無しなのに剣が光った').toBe(false);
    const on = await geo(EMBLEMS_FOR_AURA);
    expect(on.aura, 'オーラが出ない').not.toBeNull();
    // 切っ先から先へ 1 マス（±2px）＝判定（1マス先の敵まで）と見た目が揃う
    expect(Math.abs((on.aura.r - on.sword.r) - on.cell), `切っ先からの伸び ${on.aura.r - on.sword.r}px／1マス ${on.cell}px`).toBeLessThanOrEqual(2);
    expect(on.glow, '剣そのものが光っていない').toBe(true);
    // 太さ＝剣と同じか少し太い（ユーザー判定）＝剣以上・剣の 1.5 倍以下
    const thick = on.aura.b - on.aura.t, blade = on.sword.b - on.sword.t;
    expect(thick, `オーラ ${thick}px が剣 ${blade}px より細い`).toBeGreaterThanOrEqual(blade);
    expect(thick, `オーラ ${thick}px が剣 ${blade}px の 1.5 倍より太い`).toBeLessThanOrEqual(blade * 1.5);
    // 先へ行くほど細い＝先が尖る形（clip-path）
    expect(on.clip, '光の刃が刃の形（先が尖る多角形）になっていない').toMatch(/polygon/);
    expect(on.core, '白い芯が無い').toBe(true);
    // 動き＝剣が出ている窓（ATTACK_POSE_MS）に合わせる（2026-10-11 ユーザー判定＝消える直前に一瞬見えるだけだった）。
    // 伸びは窓の前半 40%、光の筋の1回目は窓いっぱい（消える瞬間に切っ先へ着く）、その後は繰り返す。
    expect(on.timing.grow, '伸びのアニメが窓の前半 40% でない').toEqual([ATTACK_POSE_MS * 0.4]);
    expect(on.timing.run[0]?.duration, '光の筋の1回目が窓と同じ長さでない').toBe(ATTACK_POSE_MS);
    expect(on.timing.run[0]?.iterations, '光の筋の1回目が1回きりでない').toBe(1);
    expect(on.timing.run[1]?.delay, '溜め中の繰り返しが1回目の後に始まらない').toBe(ATTACK_POSE_MS);
    expect(on.timing.run[1]?.iterations, '溜め中に光の筋が繰り返さない').toBe(Infinity);
    // 振り直すと前のオーラは消える（剣と一緒に片付く＝残骸が盤面に残らない）
    expect((await geo(0)).aura, '前に振ったときのオーラが残った').toBeNull();
  });

  test('⑤ 個数はセーブ→ロードで残り、壊れた値は 0〜8 の整数に丸まる', async ({ page }) => {
    await open(page, SWITCH_ROOM(2));
    const out = await page.evaluate(async () => {
      const { sanitizeLoadedPlayer } = await import('/blade-of-lumia/game/save.js');
      const { ITEM_META } = await import('/blade-of-lumia/shared/items.js');
      const rt = (p) => sanitizeLoadedPlayer(JSON.parse(JSON.stringify({ subItems: {}, ...p })), ITEM_META).emblems;
      return { kept: rt({ emblems: 5 }), full: rt({ emblems: 8 }), legacy: rt({}), str: rt({ emblems: 'x' }),
        neg: rt({ emblems: -1 }), frac: rt({ emblems: 7.9 }), over: rt({ emblems: 99 }) };
    });
    expect(out.kept).toBe(5);
    expect(out.full).toBe(8);
    expect(out.legacy, '導入前のセーブが 0 にならない').toBe(0);
    expect(out.str).toBe(0);
    expect(out.neg).toBe(0);
    expect(out.frac, '小数が切り捨てられない（8 に丸めるとオーラが立つ）').toBe(7);
    expect(out.over).toBe(8);
  });

  test('⑥ ポーズの「だいじなもの」に n/8（オーラは伏せる）、そろうと「剣に オーラ」', async ({ page }) => {
    await page.goto(SWITCH_ROOM(2));
    await waitForBoard(page);
    const pauseText = async () => {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__game.getState().isPaused === true, null, { timeout: 3000 });
      const loc = page.locator('#pause-key-items');
      const t = (await loc.count()) ? await loc.innerText() : '';
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__game.getState().isPaused === false, null, { timeout: 3000 });
      return t;
    };
    expect(await pauseText(), '0個なのに出ている').not.toContain('光の紋章');
    await setEmblems(page, 3);
    const t3 = await pauseText();
    expect(t3).toContain(`光の紋章 3/${EMBLEMS_FOR_AURA}`);
    expect(t3, 'そろう前にオーラを明かした').not.toContain('オーラ');
    await setEmblems(page, EMBLEMS_FOR_AURA);
    expect(await pauseText()).toContain('剣に オーラ');
  });

});

test.describe('Blade of Lumia – 光の紋章（データ・監査）', () => {

  test(`⑦ 紋章は D1〜D8 に1個ずつ・計 ${EMBLEMS_FOR_AURA} 個で、割り当て表どおり`, () => {
    const where = [];
    for (const [ln, layer] of Object.entries(map.layers)) {
      for (const [sk, st] of Object.entries(layer.stages ?? {})) {
        for (const src of ['chestContents', 'floorItems']) {
          for (const [cell, v] of Object.entries(st[src] ?? {})) {
            if (v?.item === 'emblem' || v?.type === 'emblem') where.push(`${ln} ${sk} ${cell}`);
          }
        }
      }
    }
    expect(where.length, where.join('\n')).toBe(EMBLEMS_FOR_AURA);
    expect(new Set(where.map((w) => w.split(' ')[0])), '1ダンジョン1個になっていない')
      .toEqual(new Set([...Array(8)].map((_, i) => `dungeon_${i + 1}`)));
    for (const [layer, room, cell, , after, label] of Q45_PLAN) {
      const cur = map.layers[layer].stages[room].chestContents[cell];
      const ok = after.type === 'rupee' ? cur?.type === 'rupee' && cur.value === after.value : cur?.item === after.item;
      expect(ok, `${layer} ${room} (${cell}) ${label}：${JSON.stringify(cur)}`).toBe(true);
    }
  });

  test('⑧ 監査は層ごとに紋章を数える', () => {
    const per = collectRewards(map);
    for (let i = 1; i <= 8; i++) expect(per.get(`dungeon_${i}`)?.emblems, `dungeon_${i}`).toBe(1);
    expect(per.get('field')?.emblems ?? 0).toBe(0);
  });

});

test.describe('Blade of Lumia – 光の紋章（プレビュー設定）', () => {

  test('⑨ エディタの「光の紋章8つ」→ URL に ps_emblems=8 → ゲームは8つ持って始まりオーラが出る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/blade-of-lumia/editor/');
    await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(map));
    await page.reload();
    await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
    const srcWith = async (checked) => {
      await page.click('#btn-preview');
      await expect(page.locator('#preview-settings-overlay')).not.toHaveClass(/hidden/);
      await page.setChecked('#ps-emblems', checked);
      await page.click('#ps-btn-start');
      await page.waitForFunction(() => document.getElementById('preview-frame')?.src.includes('ps_emblems='));
      const src = await page.$eval('#preview-frame', (el) => el.src);
      await page.click('#btn-exit-preview');   // プレビューを閉じて編集に戻る（次の入口を試すため）
      return new URL(src).searchParams.get('ps_emblems');
    };
    expect(await srcWith(true), 'チェックしても ps_emblems=8 にならない').toBe('8');
    // もう1つの入口＝盤面をクリックして開くプレビュー（`editor.js` の `editor:previewClickAt`）。
    // ps の定義が editor-io.js と editor.js に2つある（[[blade-preview-settings-duplicated]]）∴両方を見る。
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('editor:previewClickAt', { detail: { row: 4, col: 2 } })));
    await expect(page.locator('#preview-settings-overlay')).not.toHaveClass(/hidden/);
    await page.setChecked('#ps-emblems', true);
    await page.click('#ps-btn-start');
    await page.waitForFunction(() => document.getElementById('preview-frame')?.src.includes('ps_emblems='));
    const src2 = await page.$eval('#preview-frame', (el) => el.src);
    expect(new URL(src2).searchParams.get('ps_emblems'), '盤面クリックの経路で ps_emblems=8 にならない').toBe('8');
    expect(errors).toEqual([]);

    // ゲーム側＝URL だけで8つ持って始まり、振るとオーラが出る
    await open(page, `${SWITCH_ROOM(2)}&ps_emblems=8`);
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.setHeroDir('right'); g.step(5); g.swordAttack();
      return { n: g.getPlayer().emblems, aura: !!document.querySelector('.sword-aura') };
    });
    expect(r.n, 'ps_emblems=8 で8つ持って始まらない').toBe(EMBLEMS_FOR_AURA);
    expect(r.aura, 'ps_emblems=8 でオーラが出ない').toBe(true);
    await open(page, `${SWITCH_ROOM(2)}&ps_emblems=99`);
    expect(await page.evaluate(() => window.__game.getPlayer().emblems), '上限で丸めない').toBe(EMBLEMS_FOR_AURA);
  });

});
