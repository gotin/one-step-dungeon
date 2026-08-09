#!/usr/bin/env node
/**
 * write-candidate-0-1.mjs — 5.5i の検証用に、dark_tower[4,3] 作り直しの候補盤面（純倉庫番・
 * 石4・e1 テンプレ）を test_mechanics[0,1] に書いてプレイ可能にする使い捨て。
 *   ⚠️ 1,0 は torch テスト部屋（使用中）＝触らない。空きの 0,1 に入れる。
 *
 * ⚠️ これは検証段階の候補置き場。本番 dark_tower[4,3] には**まだ入れない**
 *    （ユーザー確認後・濃さ測定で 23,0 超えを確認してから migrate する）。
 * 石配置は .scratch/pick.mjs が出した L押=34 の解ける配置：石 2,5 3,10 4,8 6,4。
 */
import { readFileSync, writeFileSync } from 'fs';

const PATH = new URL('../work/blade-of-lumia.json', import.meta.url);
const j = JSON.parse(readFileSync(PATH, 'utf8'));

// e1 テンプレ（外周・入口 (0,5)(0,6)・鍵扉 DD・鍵 K(7,6)・ボタン S 4隅・不規則ピラー）＋石 '*' 4個。
const tiles = [
  '#####..#####',
  '#S........S#',
  '#.#..*.#...#',
  '#..#.#....*#',
  '##.....#*..#',
  '#..#.#.....#',
  '#.#.*..#.#.#',
  '#S....K...S#',
  '#..#....#..#',
  '#####DD#####',
].map((row) => row.split(''));

j.layers.test_mechanics.stages['0,1'] = {
  comment: '[sokoban_darktower_cand] 5.5i 検証用の候補盤面（純倉庫番・石4・e1 テンプレ・L押=34）。'
    + 'dark_tower[4,3] 作り直しの試作＝**本番未投入**。北入口 (0,5)(0,6) からスポーン。'
    + '石4を4隅ボタン S(1,1)(1,10)(7,1)(7,10) へ乗せると stonesPlaced で鍵 K(7,6) 出現。'
    + '詰みは笛(resetStones)。南鍵扉 DD は links 無し（隣室が無いだけ）。濃さが 23,0 を超えるか'
    + '実プレイで判断する段階。合格したら migrate で dark_tower[4,3] と test_mechanics[24,0] へ同時投入。',
  tiles,
  links: [],
  showConditions: { '7,6': { trigger: 'stonesPlaced' } },
  fluteEffect: { type: 'resetStones' },
  rows: 10,
  cols: 12,
};

writeFileSync(PATH, JSON.stringify(j, null, 2));
console.log('test_mechanics[0,1] に候補盤面を書き込んだ。');
tiles.forEach((row, r) => console.log(String(r).padStart(2), row.join('')));
