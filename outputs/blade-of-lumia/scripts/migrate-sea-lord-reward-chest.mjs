#!/usr/bin/env node
/**
 * migrate-sea-lord-reward-chest.mjs  (Phase 9-6 ④ 追補 — 海の主の報酬を宝箱で渡す)
 *
 * 対象は **検証ステージ** `test_mechanics / 19,0`（sea_lord）だけ。
 * 本編の闘技場 `field / 12,19` は scripts/migrate-field-delta-o-lower.mjs が唯一の作り手
 * ∴こちらでは触らない（二重管理を作らない）。
 *
 * ── なぜ変えるか ────────────────────────────────────────────────────────────
 * 2026-08-19 ユーザー報告：「鯨を倒したとき銀のブーメランがいつの間にか手に入ってた。
 * 普通に宝箱が出たりすればいいような気もする」。旧実装は onBossYielded が bossReward を
 * その場で授与する形で、しかもメッセージが 0.7〜0.9 秒で次に上書きされていた
 * ∴受け取った実感が無い。→ 報酬は **宝箱**（歩いて開ける）に移す。
 *
 * ── この検証ステージが固定する形 ───────────────────────────────────────────
 *   ・bossReward       = [ハートの器]                … その場で授与する経路を残して検証する
 *   ・chestContents 2,3 = 銀のブーメラン              … 宝箱で渡す経路を検証する
 *   ・showConditions 2,3 = { trigger:'bossYielded' }  … 合格するまで開かない封印
 * ∴1ステージで「即時授与」と「宝箱」の両方を同時に見られる（本編 12,19 は宝箱だけ）。
 *
 * 検査（すべて throw で止める）：
 *   ① 19,0 が実在し isBossRoom で、海の主 '{' が1体居る
 *   ② 宝箱セル (2,3) が壁でも水でもない（陸の床）
 *   ③ プレイヤー開始位置 (4,2) から (2,3) へ歩いて届く（水/壁を通らない BFS）
 *   ④ 書き込み後の形が期待どおり（tiles/chestContents/showConditions/bossReward）
 *   ⑤ 冪等＝2回流しても同じ結果（'B' の重複配置や器の二重登録が起きない）
 *
 * Usage (run from outputs/blade-of-lumia/):
 *   node scripts/migrate-sea-lord-reward-chest.mjs --dry   # 差分を表示するだけ
 *   node scripts/migrate-sea-lord-reward-chest.mjs         # work/blade-of-lumia.json を書く
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TILE } from '../shared/tiles.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const LAYER = 'test_mechanics';
const STAGE = '19,0';
const CHEST = '2,3';                    // 陸側（cols1-5）の空き床。開始位置 (4,2) から2歩
const START = [4, 2];                   // tests/sea-lord-boss.spec.js の previewUrl と同じ
const BOOMERANG = { type: 'boomerang', boomerangTier: 1, name: '銀のブーメラン' };
const REVEAL = { trigger: 'bossYielded', message: '☐ 主が 沈んだ 淵に 宝箱が 現れた！' };

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stage = data.layers?.[LAYER]?.stages?.[STAGE];
if (!stage) throw new Error(`${LAYER}/${STAGE} が無い`);

// tiles は「文字配列の配列」で持つ（行文字列にするとゲームが落ちる）。
const rows = stage.tiles.length;
const tiles = stage.tiles.map((row) => (Array.isArray(row) ? row.slice() : String(row).split('')));
const cols = tiles[0].length;
const bgAt = (r, c) => stage.bgTiles?.[`${r},${c}`] ?? '';

// ① 前提：ボス部屋で海の主が1体
if (!stage.isBossRoom) throw new Error(`${STAGE} が isBossRoom でない`);
const lords = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
  if (tiles[r][c] === TILE.SEA_LORD) lords.push(`${r},${c}`);
if (lords.length !== 1) throw new Error(`${STAGE} の海の主が1体でない（${lords.join(' ')}）`);

// ② 宝箱セルは陸の床（既に 'B' なら冪等な再実行）
const [chR, chC] = CHEST.split(',').map(Number);
const cur = tiles[chR][chC];
if (cur !== TILE.FLOOR && cur !== TILE.CHEST)
  throw new Error(`宝箱セル ${CHEST} が床でも宝箱でもない（'${cur}'）`);
if (bgAt(chR, chC) === TILE.WATER) throw new Error(`宝箱セル ${CHEST} の下地が水`);

// ③ 開始位置から宝箱まで歩ける（壁 '#' と水を通らない4近傍 BFS）
{
  const walkable = (r, c) =>
    r >= 0 && r < rows && c >= 0 && c < cols &&
    tiles[r][c] !== TILE.WALL && bgAt(r, c) !== TILE.WATER;
  const seen = new Set([START.join(',')]);
  const queue = [START];
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
      if (seen.has(k) || !walkable(nr, nc)) continue;
      seen.add(k); queue.push([nr, nc]);
    }
  }
  if (!seen.has(CHEST)) throw new Error(`宝箱 ${CHEST} へ ${START.join(',')} から歩いて届かない`);
}

// ── 書き換え ────────────────────────────────────────────────────────────────
tiles[chR][chC] = TILE.CHEST;
const next = {
  tiles,
  chestContents: { ...(stage.chestContents ?? {}), [CHEST]: { ...BOOMERANG } },
  showConditions: { ...(stage.showConditions ?? {}), [CHEST]: { ...REVEAL } },
  // 即時授与に残すのはハートの器だけ（銀のブーメランは宝箱へ移した）。
  bossReward: [{ type: 'heartContainer' }],
};

// ④ 期待どおりの形か（書く前に自分で検算する）
if (next.tiles[chR][chC] !== 'B') throw new Error(`検算：${CHEST} が 'B' でない`);
if (next.chestContents[CHEST].boomerangTier !== 1) throw new Error('検算：宝箱の中身が銀のブーメランでない');
if (next.showConditions[CHEST].trigger !== 'bossYielded') throw new Error('検算：封印が bossYielded でない');
if (next.bossReward.some((x) => x.type === 'boomerang'))
  throw new Error('検算：bossReward に銀のブーメランが残っている（二重取得になる）');
if (!next.bossReward.some((x) => x.type === 'heartContainer'))
  throw new Error('検算：bossReward からハートの器が消えた（即時授与の検証経路が無くなる）');
// ⑤ 宝箱は1個だけ（冪等：2回流しても 'B' が増えない）
const chests = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
  if (next.tiles[r][c] === TILE.CHEST) chests.push(`${r},${c}`);
if (chests.length !== 1 || chests[0] !== CHEST)
  throw new Error(`検算：宝箱が ${CHEST} の1個だけでない（${chests.join(' ')}）`);
for (const pk of Object.keys(next.chestContents))
  if (next.tiles[Number(pk.split(',')[0])][Number(pk.split(',')[1])] !== TILE.CHEST)
    throw new Error(`検算：chestContents ${pk} に宝箱が無い`);

const DRY = process.argv.includes('--dry');
console.log(`${LAYER}/${STAGE}（sea_lord）`);
for (let r = 0; r < rows; r++) console.log(' ', String(r).padStart(2), next.tiles[r].join(''));
console.log('  chestContents  :', JSON.stringify(next.chestContents));
console.log('  showConditions :', JSON.stringify(next.showConditions));
console.log('  bossReward     :', JSON.stringify(next.bossReward));

if (DRY) {
  console.log('\n[DRY — not written]');
} else {
  Object.assign(stage, next);
  writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
  console.log('\n海の主の報酬を宝箱へ移した（検証ステージ 19,0）');
}
