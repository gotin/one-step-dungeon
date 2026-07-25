#!/usr/bin/env node
/**
 * migrate-test-layer-to-live.mjs  (2026-07-25 ユーザー確定)
 *
 * Moves the gimmick-test stages from tests/fixtures/test-stages.json into the LIVE map
 * (work/blade-of-lumia.json) as a dedicated `test_mechanics` layer, re-keying every
 * stage from its descriptive name (`lurk_shark`) to a grid coordinate (`x,y`).
 *
 * WHY. The fixture file could not be opened in the editor, so every test stage had to be
 * hand-edited as raw JSON (ユーザー指摘: 「それじゃ作業しづらいからやめてよ。テスト用の
 * レイヤーつくればいいじゃん」). Living in the live map means the editor's layer tab,
 * world grid, canvas painting and preview button all work on test stages for free.
 *
 * WHY GRID KEYS. editor/editor-world.js parses stage keys with `k.split(',').map(Number)`
 * (getWorldSize / insertRow / insertCol / renderWorldGrid), so a name key becomes NaN and
 * the stage never appears in the world grid — i.e. the whole point of the move would fail.
 * The name→coord mapping is printed here and recorded in the spec headers.
 *
 * LAYOUT. One stage per column on a single row (y=0) in the historical fixture order, so
 * coordinates stay stable when stages are appended later (a new stage takes the next x).
 * ⚠️ Adjacent columns are edge-scroll neighbours in-engine, but that is harmless here:
 * these stages are isolated test rooms, and the ones with open edges (torch_relay etc.)
 * only ever get walked in the middle of the room by their specs.
 *
 * WHY IT'S SAFE (the three global sweeps that would otherwise break the real game):
 *   1. shared/triforce.js countTriforces()  — the fixture holds TWO dropsTriforce bosses
 *      ('J' in ladder_water2, 'L' in melee_only_boss). Counting them would raise the
 *      required 星の欠片 from 8 to 10 = unwinnable. Fixed by gameLayerEntries().
 *   2. game/boss.js altarExists() — same sweep for the ALTAR tile.
 *   3. scripts/lib/field-quality.mjs warpEnterLandings() — the fixture's `candle_gate_exit`
 *      points at `candle_gate_dest`, which has no receiver, so it would register as a new
 *      unresolved warp landing (red).
 *   All three now filter through shared/layers.js isTestLayer() (single source of truth).
 *
 * SIGN BODIES. The fixture has five sign ('i') tiles with no body text. That was invisible
 * while they lived outside the live map, but tests/no-empty-signs.spec.js sweeps EVERY layer
 * of work/blade-of-lumia.json, so importing them as-is turns it red. The invariant is worth
 * more than the shortcut, so this script gives each of the five a real {name, lines} body
 * (SIGN_BODIES below) instead of teaching the test to skip test layers.
 *
 * SELF-VERIFY (throws rather than writing a broken map):
 *   - every fixture stage lands in the live map byte-identical (deep-equal)
 *     except `comment` (name prefix) and the five SIGN_BODIES entries
 *   - the live map's own layers are byte-identical before vs after
 *   - countTriforces(live) is unchanged (the 8-欠片 invariant)
 *   - no test-layer stage key collides, and every key parses as a grid coord
 *
 * ⚠️ 実行済み・再実行はできない（2026-07-25 に1回だけ流し、入力の
 * tests/fixtures/test-stages.json はそのコミットで削除した）。他の migrate-*.mjs と
 * 同じく「何をどう動かしたか」の記録として残してある。移設後の不変条件は
 * tests/test-layer.spec.js が守る。
 *
 * Usage:  node scripts/migrate-test-layer-to-live.mjs [--dry]
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { countTriforces } from '../shared/triforce.js';
import { isTestLayer } from '../shared/layers.js';
import { TEST_LAYER, TEST_STAGE_KEYS } from '../tests/test-stage-keys.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const LIVE_PATH    = join(ROOT, 'work/blade-of-lumia.json');
const FIXTURE_PATH = join(ROOT, 'tests/fixtures/test-stages.json');

const DRY = process.argv.includes('--dry');

// 本文の無い看板('i')に与える本文。fixture 由来の5枚（no-empty-signs.spec.js の不変条件）。
// 置き場は npcData：エディタの看板編集 UI が読み書きするのは npcData（editor-props.js:206）で、
// signData は game/combat.js:279 が読むだけ＝エディタから編集できない。
// 本文は「テスト用ステージだ」と現地で分かる文にしておく（本編の看板と混ざらないように）。
const SIGN_BODIES = {
  bomb_wall: {
    '4,8': { name: '立て看板', lines: ['爆弾テストの部屋。', '壊せる壁は左上にある。'] },
    '7,8': { name: '立て看板', lines: ['ロウソクで 茂みを 燃やせ。', '隠し入口は 右の壁ぎわ。'] },
  },
  ladder_pit: {
    '1,9': { name: '立て看板', lines: ['はしごテストの部屋。', '宝箱は 左下にある。'] },
    '7,1': { name: '立て看板', lines: ['穴には はしごを 架けよ。', '縦に続く水は 横橋だけ。'] },
  },
  bow_gate: {
    '8,1': { name: '立て看板', lines: ['弓テストの部屋。', '右上の的を 下から 射よ。'] },
  },
};

const live    = JSON.parse(readFileSync(LIVE_PATH, 'utf8'));
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const fxStages = fixture.layers?.[TEST_LAYER]?.stages;
if (!fxStages || !Object.keys(fxStages).length) {
  throw new Error(`fixture に ${TEST_LAYER} のステージが無い: ${FIXTURE_PATH}`);
}

// ── before スナップショット（自己検証用）───────────────────────
const beforeGameLayers = JSON.stringify(
  Object.fromEntries(Object.entries(live.layers).filter(([lk]) => !isTestLayer(lk))),
);
const beforeTriforces = countTriforces(live);

// ── 名前キー → グリッド座標。対応表は tests/test-stage-keys.js が唯一の定義 ──
const mapping = Object.keys(fxStages).map(name => {
  const key = TEST_STAGE_KEYS[name];
  if (!key) throw new Error(`tests/test-stage-keys.js に ${name} の座標が無い`);
  return { name, key };
});
const extra = Object.keys(TEST_STAGE_KEYS).filter(n => !(n in fxStages));
if (extra.length) throw new Error(`fixture に無いステージが表にある: ${extra.join(', ')}`);

const stages = {};
for (const { name, key } of mapping) {
  if (stages[key]) throw new Error(`ステージキー衝突: ${key}`);
  const [x, y] = key.split(',').map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`グリッド座標として解釈できないキー: ${key}`);
  }
  const sd = structuredClone(fxStages[name]);
  // エディタ/テストが「どのテストのステージか」を追えるよう、元の名前を残す。
  // comment は既存 fixture が持っているフィールドなので新規プロパティを増やさない。
  sd.comment = sd.comment ? `[${name}] ${sd.comment}` : `[${name}]`;

  // 本文の無い看板に本文を与える（no-empty-signs の不変条件を守る）。
  for (const [pk, body] of Object.entries(SIGN_BODIES[name] ?? {})) {
    if (sd.tiles?.[Number(pk.split(',')[0])]?.[Number(pk.split(',')[1])] !== 'i') {
      throw new Error(`${name} @${pk} は看板('i')ではない＝SIGN_BODIES が古い`);
    }
    if (!sd.npcData) sd.npcData = {};
    if (sd.npcData[pk] || sd.signData?.[pk]) {
      throw new Error(`${name} @${pk} には既に本文がある＝SIGN_BODIES から外すこと`);
    }
    sd.npcData[pk] = body;
  }

  stages[key] = sd;
}

live.layers[TEST_LAYER] = {
  name: 'ギミック検証（テスト専用）',
  bgm: 'dungeon',
  stages,
};

// ── 自己検証 ──────────────────────────────────────────────────
const afterGameLayers = JSON.stringify(
  Object.fromEntries(Object.entries(live.layers).filter(([lk]) => !isTestLayer(lk))),
);
if (afterGameLayers !== beforeGameLayers) {
  throw new Error('本編レイヤーが変化した（このマイグレーションは追加のみのはず）');
}

const afterTriforces = countTriforces(live);
if (afterTriforces !== beforeTriforces) {
  throw new Error(
    `星の欠片の数が ${beforeTriforces} → ${afterTriforces} に変わった＝` +
    'countTriforces がテストレイヤーを除外していない（shared/layers.js を通すこと）',
  );
}

for (const { name, key } of mapping) {
  const orig = fxStages[name];
  const moved = structuredClone(live.layers[TEST_LAYER].stages[key]);
  // 意図した書き換えだけを巻き戻して比較する（comment 接頭辞・看板本文）。
  moved.comment = orig.comment;
  if (orig.comment === undefined) delete moved.comment;
  for (const pk of Object.keys(SIGN_BODIES[name] ?? {})) delete moved.npcData[pk];
  if (orig.npcData === undefined && !Object.keys(moved.npcData ?? {}).length) delete moved.npcData;
  if (JSON.stringify(moved) !== JSON.stringify(orig)) {
    throw new Error(`ステージ内容が変化した: ${name} → ${key}`);
  }
}

// 看板本文の不変条件（no-empty-signs.spec.js と同じ判定）をここでも通す。
for (const [key, sd] of Object.entries(live.layers[TEST_LAYER].stages)) {
  const tiles = sd.tiles ?? [];
  for (let r = 0; r < tiles.length; r++) {
    for (let c = 0; c < (tiles[r] ?? []).length; c++) {
      if (tiles[r][c] !== 'i') continue;
      const pk = `${r},${c}`;
      const body = sd.signData?.[pk] || sd.npcData?.[pk];
      const ok = body && Array.isArray(body.lines)
        && body.lines.some(l => typeof l === 'string' && l.trim());
      if (!ok) throw new Error(`本文の無い看板: ${TEST_LAYER}/${key} @${pk}`);
    }
  }
}

// ── 出力 ──────────────────────────────────────────────────────
console.log(`テストレイヤー '${TEST_LAYER}' を ${DRY ? '(dry) ' : ''}ライブマップへ移設`);
console.log(`星の欠片 ${beforeTriforces} → ${afterTriforces}（不変であること）`);
console.log('名前キー → グリッド座標:');
for (const { name, key } of mapping) console.log(`  ${key.padEnd(5)} ${name}`);

if (DRY) {
  console.log('\n--dry ∴ 書き込みなし');
} else {
  writeFileSync(LIVE_PATH, JSON.stringify(live, null, 2) + '\n');
  console.log(`\n書き込み完了: ${LIVE_PATH}`);
}
