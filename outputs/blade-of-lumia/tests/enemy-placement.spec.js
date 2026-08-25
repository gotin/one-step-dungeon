// tests/enemy-placement.spec.js — Phase 5.5m 新規敵15種の本編配置
//
// 5.5k で作った新しい陸上敵は、機構・スプライト・検証ステージまでは出来ていたが
// 本編レイヤーには1体も居なかった（＝カタログにあるのに世界に居ない敵）。
// 5.5m でダンジョン／フィールドへ配置した。ここで固定するのはその配置の性質。
//
// 配置表は `scripts/lib/enemy-placement.mjs`＝migrate（書き込む側）と共有する単一の真実。
// ∴この spec は「表のとおりに盤面がある」だけでなく、表が満たすべき**設計の性質**も測る：
//
//   ① 配置表と盤面が一致する（手編集のドリフト検出。表以外の雑魚が混ざっていないことも見る）
//   ② 非ボスの敵は全種が本編レイヤーに1体以上居る（カタログにあるが世界に居ない敵を作らない）
//   ③ 看板部屋の脅威度が進行順（D1→D2→D3→D4→D6→D5→D8→D7→dark_tower）で単調増加し、
//      鍵の関門部屋（56.0 / 102.0 / 225.0＝8-4 リバランス後、W が居る2部屋は 0d-2.8 で低下）の
//      値を固定した上で、最終関門（225.0）を追い越さない
//   ④ 弱点持ちの敵は、その弱点道具が入手済みの地点以降にしか居ない
//      （δ 分裂スライム＝爆弾／η 術士＝弓。表は `scripts/lib/progression.mjs` と共有）
//   ⑤ 置いた敵は素の床の上に立ち・外周にも出入口の着地セルにも居ない
//      （敵のセルへプレイヤーは進入できない＝着地セルに敵が居ると入室できない）
//   ⑥ enemyDirs に幽霊キーが無く、向き別スプライトの敵には初期の向きがある
//   ⑦ 配置した全ステージが 0 pageerror で開き、敵が spawn する（実ブラウザ）
//
// ⚠️ 敵の配置は接続性/整合性チェッカーの管轄外（敵タイルは「歩ける床」扱い）∴
//    ここが唯一の機械的な番人になる。難易度そのものの是非は実プレイ（ユーザー確認）で決める。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { gameLayerEntries } from '../shared/layers.js';
import { waitForBoard } from './helpers.js';
import {
  NEW_ENEMY_PLACEMENT, SIGNATURE_LADDER, PINNED_STAGES, WEAKNESS_ITEM,
  THREAT_OF, stageThreat, tilesOf,
} from '../scripts/lib/enemy-placement.mjs';
import { UNLOCKED_AT } from '../scripts/lib/progression.mjs';

const GAME = '/blade-of-lumia/game/';
const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const BLOCKING = new Set([TILE.WALL, TILE.WATER, TILE.TREE, TILE.BREAKABLE_WALL, TILE.GATE, TILE.DOOR]);
const isMob = (ch) => !!ENEMY_META[ch] && !ENEMY_META[ch].isBoss;

function stageOf(layer, key) {
  const st = MAP.layers?.[layer]?.stages?.[key];
  expect(st, `${layer}/${key} が無い`).toBeTruthy();
  return st;
}

// 部屋の敵セル（タイル→ posKey の一覧）
function enemyCellsOf(stage) {
  const out = {};
  tilesOf(stage).forEach((row, r) => row.forEach((ch, c) => {
    if (!ENEMY_META[ch]) return;
    (out[ch] ??= []).push(`${r},${c}`);
  }));
  return out;
}

test.describe('Phase 5.5m – 新規敵15種の本編配置', () => {

  test('① 配置表と盤面が一致する（表以外の雑魚が混ざっていない）', () => {
    for (const entry of NEW_ENEMY_PLACEMENT) {
      const id = `${entry.layer}/${entry.stage}`;
      expect(PINNED_STAGES.has(id), `${id} は関門部屋∴配置表に載せてはいけない`).toBe(false);
      const stage = stageOf(entry.layer, entry.stage);
      const cells = enemyCellsOf(stage);
      for (const [tile, keys] of Object.entries(entry.place)) {
        for (const key of keys) {
          expect(cells[tile] ?? [], `${id} の ${key} に '${tile}' が居ない（盤面が表とずれた）`).toContain(key);
        }
      }
      if (entry.mode !== 'replace') continue;
      // replace の部屋は「表に書いた敵だけ」＝置き換えたはずの旧敵が残っていない
      const planned = new Set(Object.entries(entry.place).flatMap(([t, ks]) => ks.map(k => `${t}@${k}`)));
      const actual = Object.entries(cells)
        .filter(([t]) => isMob(t))
        .flatMap(([t, ks]) => ks.map(k => `${t}@${k}`));
      expect(new Set(actual), `${id} に表に無い雑魚が居る（置き換え漏れ）`).toEqual(planned);
    }
  });

  test('② 非ボスの敵は全種が本編レイヤーに居る（カタログにあるが世界に居ない敵を作らない）', () => {
    const placed = {};
    for (const [, layer] of gameLayerEntries(MAP)) {
      for (const stage of Object.values(layer.stages ?? {})) {
        for (const row of tilesOf(stage)) {
          for (const ch of row) if (isMob(ch)) placed[ch] = (placed[ch] ?? 0) + 1;
        }
      }
    }
    const missing = Object.entries(ENEMY_META)
      .filter(([tile, meta]) => !meta.isBoss && !placed[tile])
      .map(([tile, meta]) => `${tile}(${meta.name})`);
    expect(missing, '本編レイヤーに1体も居ない雑魚が残っている').toEqual([]);
  });

  test('③ 看板部屋の脅威度が進行順で単調増加し、関門部屋を追い越さない', () => {
    const ladder = SIGNATURE_LADDER.map(({ layer, stage }) => {
      const entry = NEW_ENEMY_PLACEMENT.find(e => e.layer === layer && e.stage === stage);
      expect(entry, `${layer}/${stage} が配置表に無い`).toBeTruthy();
      const threat = stageThreat(stageOf(layer, stage), ENEMY_META);
      // 表の設計値と実データが一致する（値そのものは ENEMY_META から導出）
      expect(threat, `${layer}/${stage} の脅威度が設計値と違う`).toBeCloseTo(entry.threat, 6);
      return { id: `${layer}/${stage}`, threat };
    });
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].threat,
        `看板部屋の難化が崩れた（${ladder[i - 1].id} ${ladder[i - 1].threat} → ${ladder[i].id} ${ladder[i].threat}）`)
        .toBeGreaterThan(ladder[i - 1].threat);
    }
    // 関門部屋（dungeon-key-gate ⑨ が固定）は 5.5m で触っていない＝盤面の敵は1体も動いていない。
    // ⚠️ あちらの式は**ボスも足す**（D1 の 56.0 = 魔物 48.0 + パトロール2体）∴同じ式で測る
    //    （看板部屋にはボスが居ない∴雑魚だけの stageThreat と一致する）。
    // ⚠️ 数値は Phase 8-4（2026-08-23）のリバランス後の実測値（24.0/36.0/50.0 → 116.0/162.0/225.0）。
    //    敵の hp/atk/def を一斉に引き直しただけ＝盤面の敵は1体も動かしていない。
    // ⚠️ さらに 8-4 (4) 0d-2.8（2026-08-25）で W 魔物を hp 72→48・atk 3→2 に下げた
    //    ＝W の脅威度 108.0 → 48.0∴W が居る2部屋が下がった（D1 116→56・D7 162→102）。
    //    看板部屋には W が居ない∴上のはしごの設計値は変わっていない。
    const withBosses = (stage) => tilesOf(stage).flat()
      .reduce((t, ch) => t + (ENEMY_META[ch] ? THREAT_OF(ENEMY_META[ch]) : 0), 0);
    expect(withBosses(stageOf('dungeon_1', '1,0')), 'D1 の関門').toBe(56);
    expect(withBosses(stageOf('dungeon_7', '1,0')), 'D7 の関門').toBe(102);
    expect(withBosses(stageOf('dark_tower', '1,2')), 'dark_tower の関門').toBe(225);
    // 看板部屋の最高（dark_tower[0,1]）が最終関門（225.0）を超えない＝最終試験が最難のまま
    expect(ladder[ladder.length - 1].threat, '看板部屋が最終関門より重い')
      .toBeLessThan(withBosses(stageOf('dark_tower', '1,2')));
  });

  test('④ 弱点持ちの敵は、その弱点道具が入手済みの地点以降にしか居ない', () => {
    const bad = [];
    for (const [layerName, layer] of gameLayerEntries(MAP)) {
      for (const [sk, stage] of Object.entries(layer.stages ?? {})) {
        for (const [tile, keys] of Object.entries(enemyCellsOf(stage))) {
          const meta = ENEMY_META[tile];
          if (meta.isBoss || !meta.weakness) continue;
          const item = WEAKNESS_ITEM[meta.weakness.type];
          expect(item, `'${tile}' の弱点 ${meta.weakness.type} に対応する道具が表に無い`).toBeTruthy();
          // field は地域ごとに到達時期が違う＝空集合扱い∴弱点持ちを置くには地域別の表が必要
          const unlocked = UNLOCKED_AT[layerName] ?? new Set();
          if (!unlocked.has(item)) bad.push(`${layerName}/${sk} ${keys.join('・')} '${tile}'（要 ${item}）`);
        }
      }
    }
    expect(bad, '弱点道具を持っていない地点に弱点持ちの敵が居る（機構の答えが無い戦闘）').toEqual([]);
  });

  test('⑤ 置いた敵は素の床の上・外周や出入口の着地セルを塞がない', () => {
    for (const entry of NEW_ENEMY_PLACEMENT) {
      const id = `${entry.layer}/${entry.stage}`;
      const stage = stageOf(entry.layer, entry.stage);
      const tiles = tilesOf(stage);
      const rows = tiles.length, cols = tiles[0].length;
      expect(rows, `${id} の行数`).toBe(10);
      expect(cols, `${id} の列数`).toBe(12);

      // 出入口＝外周の歩けるセル。その1つ内側が着地セル（フィールドは全周が入口∴内側は数えない）
      const landings = new Set();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const onEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
          if (!onEdge || BLOCKING.has(tiles[r][c])) continue;
          landings.add(`${r},${c}`);
          if (entry.layer === 'field') continue;
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (!BLOCKING.has(tiles[nr][nc])) landings.add(`${nr},${nc}`);
          }
        }
      }

      let enemyCount = 0, openCount = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ch = tiles[r][c];
          if (!BLOCKING.has(ch)) openCount++;
          if (!ENEMY_META[ch]) continue;
          enemyCount++;
          const key = `${r},${c}`;
          const onEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
          expect(onEdge, `${id} (${key}) の敵が外周に居る`).toBe(false);
          expect(landings.has(key), `${id} (${key}) の敵が出入口の着地セルを塞いでいる`).toBe(false);
          // 水の上に陸上敵が立っていない（水は bgTiles 単一ソース）
          const meta = ENEMY_META[ch];
          const onWater = stage.bgTiles?.[key] === TILE.WATER;
          if (meta.move !== 'water' && meta.move !== 'air') {
            expect(onWater, `${id} (${key}) の陸上敵が水の上に居る（動けない置物になる）`).toBe(false);
          }
        }
      }
      // 逃げ場（歩ける床 ÷ 敵）＝密度の下限。狭い通路（cave_1）でも 10 は確保する
      expect(openCount / enemyCount, `${id} の密度が高すぎる（逃げ場が無い）`).toBeGreaterThanOrEqual(10);
    }
  });

  test('⑥ enemyDirs に幽霊キーが無く、向き別スプライトの敵には向きがある', () => {
    for (const entry of NEW_ENEMY_PLACEMENT) {
      const id = `${entry.layer}/${entry.stage}`;
      const stage = stageOf(entry.layer, entry.stage);
      const cells = enemyCellsOf(stage);
      const byKey = new Map();
      for (const [tile, keys] of Object.entries(cells)) for (const k of keys) byKey.set(k, tile);
      for (const key of Object.keys(stage.enemyDirs ?? {})) {
        expect(byKey.has(key), `${id} の enemyDirs ${key} に敵が居ない（幽霊キー）`).toBe(true);
      }
      for (const [key, tile] of byKey) {
        if (!ENEMY_META[tile].directional) continue;
        expect(stage.enemyDirs?.[key],
          `${id} (${key}) は向き別スプライトの敵∴初期の向きが必要（無いと 'down' 固定になる）`).toBeTruthy();
      }
      // 表に書いた向きがそのまま入っている
      for (const [key, dir] of Object.entries(entry.dirs ?? {})) {
        expect(stage.enemyDirs?.[key], `${id} (${key}) の向きが表とずれた`).toBe(dir);
      }
    }
  });

  test('⑦ 配置した全ステージが 0 pageerror で開き、敵が spawn する', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    for (const entry of NEW_ENEMY_PLACEMENT) {
      const id = `${entry.layer}/${entry.stage}`;
      const stage = stageOf(entry.layer, entry.stage);
      const tiles = tilesOf(stage);
      // プレイヤーの置き場＝敵も物も無い素の床（無ければ表の設計が壊れている）
      let spawn = null;
      for (let r = 1; r < 9 && !spawn; r++) {
        for (let c = 1; c < 11; c++) if (tiles[r][c] === TILE.FLOOR) { spawn = [r, c]; break; }
      }
      expect(spawn, `${id} に素の床が無い`).toBeTruthy();

      const p = new URLSearchParams({
        fromEditor: '1', layer: entry.layer, stage: entry.stage,
        row: String(spawn[0]), col: String(spawn[1]),
      });
      await page.goto(`${GAME}?${p.toString()}`);
      await waitForBoard(page);

      const seen = await page.evaluate(() => {
        window.__game.step(3);   // 数 tick 進めて各機構の初期化（潜行・開閉・二相）を通す
        return window.__game.getEnemies().map(e => e.type).sort();
      });
      const expected = Object.entries(enemyCellsOf(stage))
        .flatMap(([t, ks]) => ks.map(() => t)).sort();
      // 歯の確認＝両方空だと素通りする∴「敵が居る部屋を測っている」ことを先に固定する
      expect(expected.length, `${id} は敵が居ない部屋（この本が空虚になる）`).toBeGreaterThan(0);
      expect(seen, `${id} で spawn した敵が盤面と一致しない`).toEqual(expected);
      expect(errors, `${id} を開いた時点で pageerror`).toEqual([]);
    }
  });
});
