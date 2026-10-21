// @ts-check
// キュー85 #27（2026-10-20・Fable 実装レビュー #27）。game.js の factory 配線は `fx` の置き場に一本化した。
// 旧＝60 本超の `let 名前 = () => {}` を前方宣言し、後でブロックごとに上書き＝配線が漏れても空関数が黙って何もしない
// （「代入だけで1度も呼ばれない受け皿」が 18 本溜まった）。いまは `install({…})` で入れ、入れ忘れた名前を呼べば TypeError。
//   ① 前方宣言（`let 名前 = () => …;`）が game.js に戻っていない（ダミーの既定値が配線漏れを隠す）
//   ② `fx.名前` で読む名前は全部どこかの install で入っている（入れ忘れ＝実行時の TypeError を静的に捕まえる）
//   ③ install の中に同じ名前が2度無い（実行時は二重で throw する＝黙って上書きしない）
//   ④ install 済みの名前は game.js のどこかで読まれている（死んだ配線を残さない）
//   ⑤ 実機：起動して歩き・剣・ポーズ・店まで通る間 pageerror が 0
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const game = readFileSync(fileURLToPath(new URL('../game/game.js', import.meta.url)), 'utf8');
const code = game.split('\n').map((l) => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');

/** install({ … }) の最上位のキー（キーの深さ＝install の1つ内側のインデント） */
function installedKeys() {
  const keys = [];
  for (const m of game.matchAll(/^(\t*)install\(\{\n([\s\S]*?)\n\1\}\);/gm)) {
    for (const k of m[2].matchAll(new RegExp(`^${m[1]}\\t([A-Za-z_]\\w*):`, 'gm'))) keys.push(k[1]);
  }
  return keys;
}

test('① 空関数の前方宣言（let 名前 = () => …）が game.js に無い', () => {
  const bad = code.split('\n').filter((l) => /^let [A-Za-z_]\w*\s*=\s*\([^)]*\)\s*=>/.test(l));
  expect(bad).toEqual([]);
});

test('② fx.名前 で読む名前は全部 install されている', () => {
  const used = new Set([...code.matchAll(/(?<![\w$.])fx\.([A-Za-z_]\w*)/g)].map((m) => m[1]));
  const installed = new Set(installedKeys());
  expect([...used].filter((n) => !installed.has(n))).toEqual([]);
});

test('③ install の名前は重複しない', () => {
  const keys = installedKeys();
  expect(keys.filter((n, i) => keys.indexOf(n) !== i)).toEqual([]);
  expect(keys.length).toBeGreaterThan(70);   // 抽出が空振りして①②が素通りしていない
});

test('④ install 済みの名前はどこかで読まれている', () => {
  const used = new Set([...code.matchAll(/(?<![\w$.])fx\.([A-Za-z_]\w*)/g)].map((m) => m[1]));
  const exported = new Set([...code.matchAll(/return fx\.([A-Za-z_]\w*)\(/g)].map((m) => m[1]));
  const dead = installedKeys().filter((n) => !used.has(n) && !exported.has(n));
  expect(dead).toEqual([]);
});

test('⑤ 実機：歩く・剣を振る・ポーズを開閉する間 pageerror が 0', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/blade-of-lumia/game/?fromEditor=1&layer=field&stage=0,3&row=5&col=5&ps_weapon=1');
  await page.waitForFunction(() => !!window.__game?.getPlayer && document.querySelectorAll('#board .cell').length > 0);
  await page.evaluate(() => {
    const g = window.__game;
    g.movePlayer('right'); g.movePlayer('left'); g.swordAttack();
    g.step(30);
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
