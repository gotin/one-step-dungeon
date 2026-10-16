// tests/gold-garb.spec.js
// 金の装束（実行キュー76⑤・2026-10-16）＝金翼の邪竜（裏ボス）の討伐報酬。
//
// 縛るもの：
//   ① 定義と置き場所＝ITEM_META の passive・絵とパレットが実在・所持の判定は `hasGoldGarb`・
//      進行の鍵ではない・世界に1箱だけ＝dragon_lair 1,0 (1,10) の killAll 封印・その部屋の敵は竜1体だけ
//   ② 剣のクールダウン＝装束なしは 3 tick ごと（SWORD_COOLDOWN_MS 300 が 120ms 刻みに丸まる）、
//      装束ありは 2 tick ごと（GOLD_GARB_SWORD_COOLDOWN_MS 240）
//   ③ 盾で跳ね返した弾の速さ＝装束ありで 1.5 倍・装束なしは据え置き
//   ④ 竜を倒すと宝箱が出て、踏むと装束が手に入る＝見た目が金のパレットに変わり、文に効果が出て、
//      ポーズ画面の「だいじなもの」に並び、セーブに残る
//   ⑤ きらめき＝装束ありだけ、服だけの型抜き（.gold-shine）が勇者の絵にぴったり重なり、星（.gold-sparkles）が付く。
//      歩いて作り直されても光の流れが頭から始まらない（負の animation-delay＝実時間の位相）
//   ⑥ 金の髪＝装束ありの勇者は尖った金の髪の絵（`heroDGold` 等）。3向き×歩き2コマともユーザー提供の絵（128×128）。
//     どれも体（首から下）とコマ数は元の勇者のまま・髪が頭の上へ伸びる。向き・構えでも Gold
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';
import { ITEM_META, ITEM_OWNED_FLAG, ownsItem } from '../shared/items.js';
import { SUB_ITEM_KEYS } from '../shared/progression.js';
import { SPRITES, PAL } from '../shared/sprites.js';
import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import {
  TICK_MS, SWORD_COOLDOWN_MS, GOLD_GARB_SWORD_COOLDOWN_MS, GOLD_GARB_REFLECT_SPEED_MULT,
} from '../game/constants.js';

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const LAIR = 'dragon_lair';
const LAIR_STAGE = '1,0';
const CHEST = '1,10';

// 敵も仕掛けも無い広間（tests/swift-boots.spec.js と同じ作業台）。
const ROOM = `${GAME_URL}?fromEditor=1&layer=dungeon_4&stage=3,3&row=2&col=1&ps_weapon=1&ps_sword=0`;

async function open(page, extra = '') {
  await page.goto(`${ROOM}${extra}`);
  await waitForBoard(page);
  await page.evaluate(() => window.__game.pause());
}

// 毎 tick 剣を振ろうとして、実際に振れた回数（`_atkUntil` が新しくなった回数）を数える。
async function countSwings(page, ticks) {
  return page.evaluate((ticks) => {
    let n = 0;
    let prev = window.__game.getPlayer()._atkUntil;
    for (let i = 0; i < ticks; i++) {
      window.__game.swordAttack();
      const cur = window.__game.getPlayer()._atkUntil;
      if (cur != null && cur !== prev) { n++; prev = cur; }
      window.__game.step(1);
    }
    return n;
  }, ticks);
}

test.describe('金の装束（キュー76⑤）', () => {
  test('① 定義と置き場所', () => {
    const meta = ITEM_META.goldGarb;
    expect(meta?.type).toBe('passive');
    expect(SPRITES[meta.sprite], `絵 ${meta.sprite} が無い`).toBeTruthy();
    expect(PAL[meta.pal], `パレット ${meta.pal} が無い`).toBeTruthy();
    // getHeroPalName が返す2つの金版（勇者・姫）が実在する
    expect(PAL.heroGold).toBeTruthy();
    expect(PAL.princessGold).toBeTruthy();
    expect(ITEM_OWNED_FLAG.goldGarb).toBe('hasGoldGarb');
    expect(ownsItem({ hasGoldGarb: true }, 'goldGarb')).toBe(true);
    expect(ownsItem({ subItems: {} }, 'goldGarb')).toBe(false);
    expect(SUB_ITEM_KEYS.includes('goldGarb'), '裏ボスの報酬が進行の鍵になっている').toBe(false);

    const found = [];
    for (const [ln, layer] of Object.entries(MAP.layers)) {
      for (const [sk, st] of Object.entries(layer.stages)) {
        for (const [cell, ct] of Object.entries(st.chestContents ?? {})) {
          if (ct?.item === 'goldGarb') found.push(`${ln} ${sk} ${cell}`);
        }
      }
    }
    expect(found).toEqual([`${LAIR} ${LAIR_STAGE} ${CHEST}`]);
    const st = MAP.layers[LAIR].stages[LAIR_STAGE];
    const [r, c] = CHEST.split(',').map(Number);
    expect(st.tiles[r][c]).toBe(TILE.CHEST);
    expect(st.chestContents[CHEST]).toEqual({ type: 'item', item: 'goldGarb', name: '金の装束' });
    expect(st.showConditions[CHEST]).toEqual({ trigger: 'killAll' });
    // 雑魚を1体でも足すと「雑魚だけ倒して開く」抜け道になる
    const enemies = st.tiles.flat().filter((ch) => ENEMY_META[ch]);
    expect(enemies).toEqual([TILE.GOLD_DRAGON]);
  });

  test('② 剣のクールダウン＝装束なし 3 tick／装束あり 2 tick', async ({ page }) => {
    // 前提の数（刻みに丸まった周期）を定数から導く
    const plainEvery = Math.ceil(SWORD_COOLDOWN_MS / TICK_MS);
    const garbEvery  = Math.ceil(GOLD_GARB_SWORD_COOLDOWN_MS / TICK_MS);
    expect(plainEvery).toBe(3);
    expect(garbEvery).toBe(2);
    const TICKS = 24;

    await open(page);
    expect(await page.evaluate(() => !!window.__game.getPlayer().hasGoldGarb)).toBe(false);
    expect(await countSwings(page, TICKS)).toBe(TICKS / plainEvery);

    await open(page, '&ps_goldgarb=1');
    expect(await page.evaluate(() => !!window.__game.getPlayer().hasGoldGarb)).toBe(true);
    expect(await countSwings(page, TICKS)).toBe(TICKS / garbEvery);
  });

  test('③ 盾で跳ね返した弾＝装束ありで 1.5 倍の速さ', async ({ page }) => {
    const reflectSpeed = async (extra) => {
      await open(page, `&ps_shield=2${extra}`);
      // 右を向かせて、正面（右）から来る弾を注入する
      await page.evaluate(() => window.__game.setHeroDir('right'));
      const p = await page.evaluate(() => ({ x: window.__game.getPlayer().x, y: window.__game.getPlayer().y }));
      await page.evaluate(({ x, y }) => window.__game.injectEnemyProjectile(x, y, -1, 0, 4, 2), p);
      await page.evaluate(() => window.__game.step(1));
      const mine = await page.evaluate(() =>
        window.__game.getProjectiles().filter((q) => q.owner === 'player'));
      expect(mine.length, '跳ね返らなかった').toBe(1);
      return mine[0].speed;
    };
    expect(await reflectSpeed('')).toBe(2);
    expect(await reflectSpeed('&ps_goldgarb=1')).toBe(2 * GOLD_GARB_REFLECT_SPEED_MULT);
  });

  test('④ 竜を倒すと宝箱が出て、踏むと装束が手に入る（見た目・文・ポーズ・セーブ）', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${GAME_URL}?fromEditor=1&layer=${LAIR}&stage=${LAIR_STAGE}&row=4&col=1&ps_weapon=1&ps_hearts=20`);
    await waitForBoard(page);
    await page.evaluate(() => window.__game.pause());

    expect(await page.evaluate(() => !!window.__game.getPlayer().hasGoldGarb)).toBe(false);
    let ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.conditionsMet.includes('1,10'), '竜が生きているのに宝箱が出ている').toBe(false);

    await page.evaluate(() => {
      for (const e of window.__game.getEnemies()) window.__game.dealDamage(e.id, 99999, 'sword');
    });
    // ボスの倒れ方は演出つき（実時間で消える）＝消えるまで待ってから tick を進める
    // 撃破の演出（bossDefeating）が終わるまでは実ループで流す＝終わる前はポーズ画面が開かない
    await page.evaluate(() => window.__game.resume());
    await page.waitForFunction(() => window.__game.getEnemies().length === 0
      && !window.__game.getState().bossDefeating, null, { timeout: 15_000 });
    await page.evaluate(() => window.__game.pause());
    ss = await page.evaluate(() => window.__game.getStageState());
    expect(ss.conditionsMet.includes('1,10'), '竜を倒しても宝箱が出ない').toBe(true);

    // (4,1) → (1,1) → (1,10)。movePlayer 1回＝半マス。
    await page.evaluate(() => {
      for (let i = 0; i < 6; i++) { window.__game.movePlayer('up'); window.__game.step(1); }
      for (let i = 0; i < 18; i++) { window.__game.movePlayer('right'); window.__game.step(1); }
    });
    const pl = await page.evaluate(() => {
      const p = window.__game.getPlayer();
      return { x: p.x, y: p.y, has: !!p.hasGoldGarb };
    });
    expect(pl).toEqual({ x: 10, y: 1, has: true });
    expect(await page.locator('#msg-bar').textContent()).toContain('剣を 振る 速さ');

    // 見た目＝プレイヤーの絵が金のパレット（服の色 #f5c542 のドットがある）
    const goldDots = await page.evaluate(() => {
      const cv = document.querySelector('#char-player canvas');
      if (!cv) return -1;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0xf5 && d[i + 1] === 0xc5 && d[i + 2] === 0x42 && d[i + 3] > 0) n++;
      return n;
    });
    expect(goldDots, 'プレイヤーの絵に金の服のドットが無い').toBeGreaterThan(0);

    // ポーズ画面の「だいじなもの」
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-key-items')).toContainText('金の装束');
    await page.keyboard.press('Escape');

    // セーブに残る
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY);
    expect(saved?.player?.hasGoldGarb, 'セーブに装束が残っていない').toBe(true);
    expect(errors).toEqual([]);
  });

  test('⑤ きらめき＝装束ありだけ、服の型抜きが勇者の絵に重なる', async ({ page }) => {
    const probe = () => page.evaluate(() => {
      const el = document.getElementById('char-player');
      const hero = el.querySelector('canvas.sprite:not(.gold-shine):not(.shield-overlay)');
      const shine = el.querySelector('canvas.gold-shine');
      const rect = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
      return {
        hero: hero && rect(hero),
        shine: shine && rect(shine),
        pal: shine?.dataset.pal ?? null,
        anim: shine ? getComputedStyle(shine).animationName : null,
        delay: shine ? parseFloat(shine.style.animationDelay) : null,
        sparkles: el.querySelectorAll('.gold-sparkles').length,
        // 盾は光より手前（光の型抜きは盾の前に入れる）
        shieldAfter: !!(shine && shine.compareDocumentPosition(el.querySelector('.shield-overlay')) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    });
    await page.goto(`${ROOM}&ps_shield=0`);
    await waitForBoard(page);
    const plain = await probe();
    expect(plain.shine, '装束なしなのに光っている').toBeNull();
    expect(plain.sparkles).toBe(0);

    await page.goto(`${ROOM}&ps_shield=0&ps_goldgarb=1`);
    await waitForBoard(page);
    const garb = await probe();
    expect(garb.shine, '型抜きが勇者の絵からずれている').toEqual(garb.hero);
    expect(garb.pal).toBe('goldShine');
    expect(garb.anim).toBe('gold-shine-sweep');
    expect(garb.delay, '位相が実時間から決まっていない').toBeLessThan(0);
    expect(garb.sparkles).toBe(1);
    expect(garb.shieldAfter).toBe(true);
    // 型抜きは服（4/5）と金の髪（2/7/8/9/10）だけ＝肌（3/6）・輪郭（1）は透明
    const { PAL } = await import('../shared/sprites.js');
    expect(PAL.goldShine.map((c, i) => (c === 'transparent') === ![2, 4, 5, 7, 8, 9, 10].includes(i))).toEqual(PAL.goldShine.map(() => true));

    // 歩いて作り直されても型抜きが付き続ける
    await page.evaluate(() => { window.__game.movePlayer('right'); });
    await page.waitForTimeout(150);
    const moved = await probe();
    expect(moved.shine).toEqual(moved.hero);
    expect(moved.shieldAfter, '歩いた後の描き直しで光が盾より手前に来た').toBe(true);
  });

  test('⑥ 金の髪＝尖った金の髪の絵が、向き・構えのすべてで選ばれる', async ({ page }) => {
    const { SPRITES: SP, PAL: PL } = await import('../shared/sprites.js');
    for (const base of ['heroD', 'heroR', 'heroU', 'heroDAtk', 'heroRAtk', 'heroUAtk']) {
      const src = SP[base], gold = SP[`${base}Gold`];
      expect(gold?.length, `${base}Gold のコマ数`).toBe(src.length);
      gold.forEach((f, i) => {
        // 下向きはユーザー提供の絵を 64×64（半マス刻み）で持つ＝K 倍して元の勇者と比べる
        const K = f.length / 32;
        expect([1, 2, 4]).toContain(K);
        expect(f.every((row) => row.length === f.length), `${base}Gold[${i}] が正方形でない`).toBe(true);
        const body = src[i].slice(20).flatMap((row) => Array(K).fill(row.flatMap((v) => Array(K).fill(v)).join()));
        // 体（首の線＝row 19 より下）は元の絵のまま。首の線そのものは髪の輪郭を閉じる黒点が足されうる
        expect(f.slice(20 * K).map((r) => r.join()), `${base}Gold[${i}] の体が変わった`).toEqual(body);
        // 髪が頭の上（元は空の rows 0-3）へ伸びている
        const above = f.slice(0, 4 * K).flat().filter((v) => [2, 7, 8, 9, 10].includes(v)).length;
        expect(above, `${base}Gold[${i}] の髪が上へ尖っていない`).toBeGreaterThan(6);
        // 使う色番号は金のパレットに全部ある
        const max = Math.max(...f.flat());
        expect(PL.heroGold.length).toBeGreaterThan(max);
        expect(PL.princessGold.length).toBeGreaterThan(max);
      });
    }
    await open(page, '&ps_goldgarb=1');
    const names = await page.evaluate(() => {
      const out = [];
      // movePlayer は先頭で向きを変えて描き直す（setHeroDir は描き直さない）
      for (const d of ['down', 'right', 'left', 'up']) {
        window.__game.movePlayer(d);
        window.__game.step(1);
        out.push(document.querySelector('#char-player canvas.sprite')?.dataset.sprite ?? null);
      }
      return out;
    });
    expect(names, '向きによって金の髪でない絵が選ばれた').toEqual(['heroDGold', 'heroRGold', 'heroRGold', 'heroUGold']);
    await page.evaluate(() => { window.__game.setHeroDir('down'); window.__game.swordAttack(); });
    expect(await page.evaluate(() => document.querySelector('#char-player canvas.sprite')?.dataset.sprite)).toBe('heroDAtkGold');
  });
});
