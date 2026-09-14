// Phase 17-1: Dialog integrity checker.
//
// 実行キュー17（会話の語り直し）に着手する前に、既存の会話データの穴を機械的に
// 検出する。⑧で見つかった2件の「死データ」（読めない本文）を再発させないための
// 恒久チェック（PLAN.md 17-1 参照）。
//
// Checks:
//   [error] 読めない本文＝signData/npcData がタイル i/P/a/b/$ 以外の上にある
//           （ゲームは combat.js の swordAttack / startDialog からしか会話を開けない
//            ＝この5文字以外のタイルに乗った本文は誰にも読まれない）
//   [warn]  導線ゼロ＝shared/progression.js の ORDER に載る進行地点のうち、
//           そのレイヤーの表示名（layers[x].name）を語る会話が field 側に1つも無い
//           （入口はあるのに名前を聞いたことがない＝「次どこ」が生まれない）
//   [warn]  禁止語（操作説明）が帯1（村 field 7,14／草原 field 6,13／hidden_cave／
//           dungeon_1）の外で使われている（「キー」「ボタン」）
//
// ⚠️ `test_mechanics` レイヤーは検証専用ステージ＝対象外（PLAN.md 17 ②）。
//
// Usage:
//   node scripts/check-dialog-integrity.mjs
//
import { readFileSync } from 'fs';
import { TILE } from '../shared/tiles.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';
import { ORDER, labelOf } from '../shared/progression.js';

const MAP_PATH = process.env.BLADE_MAP_PATH
  ? new URL(`file://${process.env.BLADE_MAP_PATH}`)
  : new URL('../work/blade-of-lumia.json', import.meta.url);
const d = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const EXCLUDED_LAYERS = new Set(['test_mechanics']);

// combat.js が会話を開くタイルはこの5文字だけ（swordAttack: NPC_SHOP → NPC_SPRITE_MAP → SIGN）。
const READABLE_TILES = new Set([TILE.SIGN, ...Object.keys(NPC_SPRITE_MAP)]);

// 帯1（PLAN.md 17-⑤ 1番）＝操作説明を許す唯一の帯。
const BAND1_FIELD_STAGES = new Set(['7,14', '6,13']);
const BAND1_LAYERS = new Set(['dungeon_1', 'hidden_cave']);
const FORBIDDEN_WORDS = ['キー', 'ボタン'];

function tileAt(stage, r, c) {
  const row = stage.tiles[r];
  if (row === undefined || row === null) return undefined;
  return (Array.isArray(row) ? row : String(row).split(''))[c];
}

const issues = [];
const err  = msg => issues.push({ level: 'error', msg });
const warn = msg => issues.push({ level: 'warn',  msg });

// ── 1. 読めない本文の検出 ────────────────────────────────────────────────
for (const [layerName, layer] of Object.entries(d.layers)) {
  if (EXCLUDED_LAYERS.has(layerName)) continue;
  for (const [stageKey, stage] of Object.entries(layer.stages ?? {})) {
    for (const store of ['signData', 'npcData']) {
      for (const posKey of Object.keys(stage[store] ?? {})) {
        const [r, c] = posKey.split(',').map(Number);
        const t = tileAt(stage, r, c);
        if (!READABLE_TILES.has(t)) {
          err(`[${layerName} ${stageKey}] (${posKey}) の ${store} が読めないタイル '${t}' の上にある`
            + `（読めるのは i/${Object.keys(NPC_SPRITE_MAP).join('/')} だけ）`);
        }
      }
    }
  }
}

// ── 2. 導線ゼロの検出 ────────────────────────────────────────────────────
// 全会話本文を1つのコーパスにして、進行地点の表示名（layers[x].name＝プレフィクス無し）
// を語っているかを見る。field の看板・NPC が「次どこ」を教える主体（PLAN.md 17 ⑦）。
const allLines = [];
for (const [layerName, layer] of Object.entries(d.layers)) {
  if (EXCLUDED_LAYERS.has(layerName)) continue;
  for (const stage of Object.values(layer.stages ?? {})) {
    for (const store of ['signData', 'npcData']) {
      for (const entry of Object.values(stage[store] ?? {})) {
        for (const line of entry?.lines ?? []) allLines.push(String(line));
      }
    }
  }
}
const corpus = allLines.join('\n');
for (const cp of ORDER) {
  if (!cp.layer) continue; // start（開始直後）は名乗る対象ではない
  const name = d.layers[cp.layer]?.name;
  if (!name) { warn(`進行地点 "${cp.id}" のレイヤー "${cp.layer}" に name が無く導線チェックをスキップ`); continue; }
  if (!corpus.includes(name)) {
    warn(`導線ゼロ：進行地点 "${labelOf(d, cp)}"（${name}）を語る会話が1つも無い`);
  }
}

// ── 3. 禁止語（操作説明）の検出 ──────────────────────────────────────────
for (const [layerName, layer] of Object.entries(d.layers)) {
  if (EXCLUDED_LAYERS.has(layerName)) continue;
  const layerIsBand1 = BAND1_LAYERS.has(layerName);
  for (const [stageKey, stage] of Object.entries(layer.stages ?? {})) {
    const inBand1 = layerIsBand1 || (layerName === 'field' && BAND1_FIELD_STAGES.has(stageKey));
    if (inBand1) continue;
    for (const store of ['signData', 'npcData']) {
      for (const [posKey, entry] of Object.entries(stage[store] ?? {})) {
        for (const line of entry?.lines ?? []) {
          const hit = FORBIDDEN_WORDS.find(w => line.includes(w));
          if (hit) {
            warn(`[${layerName} ${stageKey}] (${posKey}) が帯1の外で操作説明「${hit}」を含む：${JSON.stringify(line)}`);
          }
        }
      }
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────
const errors = issues.filter(i => i.level === 'error');
const warns  = issues.filter(i => i.level === 'warn');

const badge = errors.length ? '❌' : warns.length ? '⚠️ ' : '✅';
console.log(`${badge} check-dialog-integrity`);
for (const e of errors) console.log(`   ❌ ${e.msg}`);
for (const w of warns)  console.log(`   ⚠️  ${w.msg}`);
if (!issues.length) console.log('   すべてのチェックに合格');

console.log(`\n── 合計: ❌ ${errors.length} エラー / ⚠️  ${warns.length} 警告 ──`);
process.exit(errors.length > 0 ? 1 : 0);
