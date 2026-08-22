/**
 * scripts/fix-flute-reveal-missing.mjs — 笛で開かない「笛の封印」を直す（2026-08-22）
 *
 * `showConditions[k] = { trigger: 'flutePlayed' }` だけでは箱は永久に現れない。
 * `game/game.js` の playFlute（1554行付近）は **現在ステージの `stageData.fluteEffect`**
 * を読み、それが無いと「🎵 不思議な音色が響いた…… 特に何も起きない」で return する
 * ＝`ss.flutePlayed` が立たず evaluateConditions も走らない。
 *
 * 9-6-BASE ⑧（沼P 南岸）で `8,19` を作るときにこの罠を踏み、既存データを走査したところ
 * 同じ欠落が2画面あった：
 *   - `field/11,14`（沼の祭壇跡・ルピー×30）
 *   - `field/13,15`（山地M 東の水落ち ⑦ で作り込んだ石室・ルピー×65）
 * どちらも「笛を吹いても何も起きない＝取れない宝箱」だった∴fluteEffect を補う。
 *
 * ⚠️ dark_tower/3,2 の `showConditions['5,5'] = { type: 'flutePlayed' }` はここでは直さない。
 *    キーが `trigger` でなく `type` ∴conditions.js の判定に一度も入らない別種の残骸で、
 *    対象セル (5,5) にタイルも宝箱も無い（＝直す対象が無い）。塔の作り込み時に扱う。
 *
 * 使い方: node scripts/fix-flute-reveal-missing.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const FIXES = [
  {
    layer: 'field', stage: '11,14',
    fluteEffect: { type: 'reveal', message: '♪ 音色に 応えて 祭壇の 供物が 現れた！' },
  },
  {
    layer: 'field', stage: '13,15',
    fluteEffect: { type: 'reveal', message: '🎵 音色に 応えて 石室の 箱が 現れた！' },
  },
];

const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

for (const fix of FIXES) {
  const st = d.layers[fix.layer]?.stages?.[fix.stage];
  if (!st) throw new Error(`${fix.layer}/${fix.stage} が無い`);
  const sealed = Object.entries(st.showConditions ?? {})
    .filter(([, sc]) => sc.trigger === 'flutePlayed');
  if (!sealed.length)
    throw new Error(`${fix.layer}/${fix.stage}: flutePlayed の封印が無い＝直す対象が無い`);
  if (st.fluteEffect)
    throw new Error(`${fix.layer}/${fix.stage}: 既に fluteEffect がある（${JSON.stringify(st.fluteEffect)}）`);
  st.fluteEffect = fix.fluteEffect;
  console.log(`   ${fix.layer}/${fix.stage} に fluteEffect を補った（封印 ${sealed.map(([k]) => k).join(' ')}）`);
}

// 全レイヤー横断で「笛の封印があるのに fluteEffect が無い」画面が残っていないこと。
const left = [];
for (const [ln, l] of Object.entries(d.layers)) {
  for (const [sk, st] of Object.entries(l.stages ?? {})) {
    const hasSeal = Object.values(st.showConditions ?? {})
      .some((sc) => sc.trigger === 'flutePlayed' || sc.trigger === 'killAllAndFlute');
    if (hasSeal && st.fluteEffect?.type !== 'reveal') left.push(`${ln}/${sk}`);
  }
}
if (left.length) throw new Error(`まだ開かない笛の封印が残っている: ${left.join(' ')}`);

if (!DRY) writeFileSync(MAP_PATH, JSON.stringify(d, null, 2));
console.log(`✅ 笛で開かない封印を解消${DRY ? '（--dry: 書き込みなし）' : ''}`);
