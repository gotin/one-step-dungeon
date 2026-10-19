// @ts-check
// キュー85 #2（2026-10-19・Fable 実装レビュー #2）。`enemyTick` の機構ごとの手書きリスト3本を1か所に寄せた。
//   旧＝①気絶したときの取り消し（15か所の if）②行動ゲート（18個の旗を && で並べた1行）③絵の同期（19か所の if）
//   を enemyTick の中に別々に書いていた＝新しい機構を足すと3か所に足す必要があり、1つ落とすと
//   「気絶中も予告が残る」「専有中なのに歩く」「絵が状態に追いつかない」が黙って生まれる。
//   新＝①③は `ENEMY_MECHANISMS`（1行＝1機構の stun／sync）、②は `busy` の旗＋`holdsTick(busy)`。
//   ① 表の行と並び順（並び順＝呼ぶ順＝絵は後ろの行ほど上書きする）
//   ② enemyTick は機構の絵の同期・取り消しを直接呼ばない（全部表を通す）
//   ③ この tick を専有するかの旗は全部 `busy` に書く（ゲートの外に置かれた旗が無い）
// 各行の中身が実際に効いているかは各機構の番人（charge-dash・slam-attack・boss-move-variety など）が見る
// （歯の確認＝.scratch/teeth/run-teeth-85-2.mjs）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const AI = readFileSync(fileURLToPath(new URL('../game/enemy-ai.js', import.meta.url)), 'utf8');

function block(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  expect(s, `${startMarker} が見つからない`).toBeGreaterThanOrEqual(0);
  const e = src.indexOf(endMarker, s);
  expect(e, `${endMarker} が見つからない`).toBeGreaterThan(s);
  return src.slice(s, e);
}
const TABLE = block(AI, 'const ENEMY_MECHANISMS = [', '\n\t];\n');
const TICK = block(AI, '\tfunction enemyTick() {', '\n\tfunction holdsTick(busy) {');
// コメント行を除いた enemyTick の本体（コメントの中の関数名に反応しない）
const TICK_CODE = TICK.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('① 機構の表の行と並び順', () => {
  const names = [...TABLE.matchAll(/^\t\t\tname: '(\w+)',$/gm)].map((m) => m[1]);
  expect(names).toEqual([
    'guard', 'leap', 'shell', 'blink', 'slam', 'swing', 'breath', 'coil', 'gaze', 'soar',
    'recover', 'dash', 'momentum', 'tongue', 'surge', 'glaciate', 'lockstep', 'mirage', 'aspect',
  ]);
  // 気絶の取り消しを持つ行（持たない行＝跳躍・甲羅・瞬間移動・硬直の絵は、気絶で捨てる物が無い）
  const rows = TABLE.split(/^\t\t\{$/m).slice(1);
  const withStun = rows.filter((r) => /^\t\t\tstun: /m.test(r)).map((r) => r.match(/name: '(\w+)'/)?.[1]);
  expect(withStun).toEqual([
    'guard', 'slam', 'swing', 'breath', 'coil', 'gaze', 'soar',
    'dash', 'momentum', 'tongue', 'surge', 'glaciate', 'lockstep', 'mirage', 'aspect',
  ]);
  for (const r of rows) expect(r, '絵の同期を持たない行がある').toMatch(/^\t\t\tsync: /m);
});

test('② enemyTick は機構の絵の同期・取り消しを直接呼ばない（表を通す）', () => {
  expect(TICK_CODE).toContain('for (const m of ENEMY_MECHANISMS) m.stun?.(e, meta);');
  expect(TICK_CODE).toContain('for (const m of ENEMY_MECHANISMS) m.sync?.(e, meta, now);');
  const syncs = [...TICK_CODE.matchAll(/\b(sync[A-Z]\w*)\(/g)].map((m) => m[1]);
  expect(syncs, '表を通さずに絵を同期している').toEqual([]);
  // 硬直・構えのあいだ慣性を捨てる1か所だけは気絶と別の理由（GUIDE §7-8）＝表の外に残す
  const cancels = [...TICK_CODE.matchAll(/\b(cancel[A-Z]\w*)\(/g)].map((m) => m[1]);
  expect(cancels, '表を通さずに取り消している').toEqual(['cancelMomentum']);
});

test('③ この tick を専有するかの旗は全部 busy に書く', () => {
  expect(TICK_CODE.match(/holdsTick\(busy\)/g), '行動ゲートが1つでない').toHaveLength(1);
  const flags = [...TICK_CODE.matchAll(/^\t\t\tbusy\.(\w+) = /gm)].map((m) => m[1]);
  expect(flags).toEqual([
    'slam', 'swing', 'breath', 'aspect', 'crush', 'tongue', 'lockstep', 'mirage', 'blink',
    'guard', 'frozen', 'leap', 'soar', 'surge', 'glaciate', 'shell', 'leech', 'dash',
  ]);
  // busy の外に置いた値は「専有した」ではない物だけ（増えたら busy に書くべきでないか確かめる）
  const locals = [...TICK_CODE.matchAll(/^\t\t\tconst (\w+) = /gm)].map((m) => m[1]);
  expect(locals).toEqual([
    'meta', 'busy', 'roaming', 'telegraphing', 'cmode',
    'leapBusy', 'soarBusy', 'surgeBusy', 'glaciateBusy', 'dirLocked',
  ]);
});
