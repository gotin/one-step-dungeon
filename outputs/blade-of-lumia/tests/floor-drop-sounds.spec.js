// tests/floor-drop-sounds.spec.js – キュー90（2026-10-19）敵の落とし物を拾った音
//
// ユーザー依頼「ゲットしたときに音がなったほうがいい。アイテムごとにそのアイテムらしい違う音」。
// 旧＝4種とも共通の 'item'（剣・盾など 27 か所と同じ控えめな音）＋増えなかったときは無音。
//   ① 4種がそれぞれ自分の音を鳴らす（ルピー＝マップのルピーと同じ 'rupee'）・4つとも互いに違う
//   ② 満タン・上限で増えなかったときは 'dropFull'（ユーザー判定 2026-10-19「Bで。」＝同じ音にしない・無音にしない）
//   ③④ 試し場 test_mechanics 0,2（増える）・1,2（満タン）＝画面データの testSetup で入るたびに床へ置く
//   ⑤ testSetup はテスト層の画面にしか書かない
// 観測＝AudioContext を張り子に差し替えて鳴った周波数の列を記録（weakness-feedback.spec.js と同じ型）。
// 期待値の周波数は shared/sounds.js から読む＝音を作り直しても番人を書き換えずに済む（列の一致で見る）。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY, freezeGameLoop } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const SOUNDS = readFileSync(fileURLToPath(new URL('../shared/sounds.js', import.meta.url)), 'utf8');
// `if (kind === 'xxx') { tone(ctx, t, 周波数, ...) ... }` の周波数の列
function tonesOf(kind) {
  const s = SOUNDS.indexOf(`if (kind === '${kind}') {`);
  expect(s, `${kind} の音が無い`).toBeGreaterThan(0);
  const body = SOUNDS.slice(s, SOUNDS.indexOf('\n\t}', s));
  return [...body.matchAll(/tone\(ctx,[^,]+,\s*(\d+),/g)].map((m) => Number(m[1]));
}

function makeSave(over = {}) {
  return JSON.stringify({
    player: {
      x: 5, y: 5, hp: 4, maxHp: 6, maxHearts: 3, atk: 10, def: 0, keys: 0,
      weapon: 'sword', shield: null, armor: null,
      subItems: { bomb: { count: 2 }, bow: { count: 2 } }, activeSubItem: null,
      rupees: 0, triforceCount: 0, maxArrows: 8, maxBombs: 8,
      hasWingRobe: false, flying: false, hasLadder: false, defeatedBosses: [],
      swordTier: -1, armorTier: -1, shieldTier: -1, gachaPulls: {},
      ...over,
    },
    stageState: {}, currentLayer: 'field', stageKey: '7,14', heroDir: 'down',
  });
}

async function boot(page, save) {
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
    window.__tones = [];
    const osc = () => ({ type: '', frequency: { setValueAtTime(f) { window.__tones.push(f); } }, connect() {}, start() {}, stop() {} });
    const gain = () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} });
    window.AudioContext = function () {
      return { currentTime: 0, state: 'running', destination: {}, createOscillator: osc, createGain: gain, resume() { return Promise.resolve(); }, suspend() { return Promise.resolve(); }, close() {} };
    };
    window.webkitAudioContext = window.AudioContext;
  }, { key: SAVE_KEY, value: save });
  await page.goto(GAME_URL);
  await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#btn-continue').click();
  await page.waitForFunction(() => document.getElementById('board')?.children.length > 0);
}

// 1マス先に落とし物を置いて拾い、その間に鳴った周波数の列を返す
async function pickTones(page, type) {
  return page.evaluate((type) => {
    const g = window.__game;
    g.spawnFloorDrop(2, 2, type);
    const d = g.getFloorDrops().find((x) => x.type === type);
    window.__tones = [];
    g.pickupFloorDrop(d.r, d.c);
    return [...window.__tones];
  }, type);
}

const KIND = { rupee: 'rupee', heart: 'dropHeart', bomb: 'dropBomb', arrow: 'dropArrow' };

test('① 4種がそれぞれ自分の音を鳴らす（4つとも互いに違う・共通の item ではない）', async ({ page }) => {
  await boot(page, makeSave());
  const heard = {};
  for (const [type, kind] of Object.entries(KIND)) {
    heard[type] = await pickTones(page, type);
    expect(heard[type], `${type} を拾って ${kind} が鳴らない`).toEqual(tonesOf(kind));
    expect(heard[type], `${type} が共通の item のまま`).not.toEqual(tonesOf('item'));
  }
  const sigs = Object.values(heard).map((t) => t.join(','));
  expect(new Set(sigs).size, '同じ音のアイテムがある').toBe(4);
});

test('② 満タン・上限で増えなかったときは dropFull（無音でも同じ音でもない）', async ({ page }) => {
  await boot(page, makeSave({ hp: 6, subItems: { bomb: { count: 8 }, bow: { count: 8 } } }));
  for (const type of ['heart', 'bomb', 'arrow']) {
    const t = await pickTones(page, type);
    expect(t, `${type} が上限のとき dropFull が鳴らない`).toEqual(tonesOf('dropFull'));
  }
  const full = tonesOf('dropFull').join(',');
  for (const kind of Object.values(KIND)) expect(tonesOf(kind).join(','), `${kind} と dropFull が同じ`).not.toBe(full);
});

// ── 試し場（test_mechanics 0,2・1,2＝画面データの testSetup で入るたびに床へ置く） ──

async function bootArena(page, name) {
  await freezeGameLoop(page);
  await page.addInitScript(() => {
    window.__tones = [];
    const osc = () => ({ type: '', frequency: { setValueAtTime(f) { window.__tones.push(f); } }, connect() {}, start() {}, stop() {} });
    const gain = () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} });
    window.AudioContext = function () {
      return { currentTime: 0, state: 'running', destination: {}, createOscillator: osc, createGain: gain, resume() { return Promise.resolve(); }, suspend() { return Promise.resolve(); }, close() {} };
    };
    window.webkitAudioContext = window.AudioContext;
  });
  const p = new URLSearchParams({ fromEditor: '1', layer: TEST_LAYER, stage: stageKey(name), row: '7', col: '6', ps_weapon: '1' });
  await page.goto(`/blade-of-lumia/game/?${p}`);
  await page.waitForFunction(() => window.__game?.getFloorDrops && document.getElementById('board')?.children.length > 0);
}
// 床の落とし物を全部、置かれた順に拾って、1つごとに鳴った周波数の列を返す
async function pickAll(page) {
  return page.evaluate(() => {
    const g = window.__game;
    return g.getFloorDrops().map((d) => {
      window.__tones = [];
      g.pickupFloorDrop(d.r, d.c);
      return { type: d.type, tones: [...window.__tones] };
    });
  });
}

test('③ 試し場 0,2：4種が床に置かれ、時間が経っても消えず、拾うと4種とも増える音', async ({ page }) => {
  await bootArena(page, 'drop_sounds');
  const types = (await page.evaluate(() => window.__game.getFloorDrops().map((d) => d.type))).sort();
  expect(types).toEqual(['arrow', 'bomb', 'heart', 'rupee']);
  // 通常の落とし物は 5 秒（120ms × 42 tick）で消える＝60 tick 回しても残る
  const left = await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__game.step(1); return window.__game.getFloorDrops().length; });
  expect(left, '試し場の落とし物が時間で消えた').toBe(4);
  const before = await page.evaluate(() => window.__game.getPlayer().hp);
  expect(before, 'HP が 2 で始まっていない＝ハートが満タン扱いになる').toBe(2);
  for (const { type, tones } of await pickAll(page)) expect(tones, `${type}`).toEqual(tonesOf(KIND[type]));
  expect(await page.evaluate(() => window.__game.getFloorDrops().length)).toBe(0);
});

test('④ 試し場 1,2：満タンで始まり、ハート・爆弾・矢とも増えなかった音', async ({ page }) => {
  await bootArena(page, 'drop_sounds_full');
  const picked = await pickAll(page);
  expect(picked.map((x) => x.type).sort()).toEqual(['arrow', 'bomb', 'heart']);
  for (const { type, tones } of picked) expect(tones, `${type}`).toEqual(tonesOf('dropFull'));
});

test('⑤ testSetup はテスト層の画面にしか書かれていない（ゲームの層では効かない約束）', () => {
  const map = JSON.parse(readFileSync(fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url)), 'utf8'));
  const found = [];
  for (const [ln, L] of Object.entries(map.layers)) for (const [k, s] of Object.entries(L.stages ?? {})) if (s.testSetup) found.push(`${ln}/${k}`);
  expect(found.sort()).toEqual([`${TEST_LAYER}/${stageKey('drop_sounds')}`, `${TEST_LAYER}/${stageKey('drop_sounds_full')}`].sort());
});
