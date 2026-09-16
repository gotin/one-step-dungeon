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
//   [error] 印の行き先が実在しない＝会話の `mark` / `markAfterBoss`（キュー17-2）が
//           無い層・無い画面を指している（ゲーム側は警告して捨てる＝黙って消えたように見える）
//   [error] 本文に「絵がある物の絵文字」が生のまま在る＝`{{key}}` マーカーで書くべき所が
//           絵文字に戻っている（キュー24・2026-09-10 の退行の検知）
//
// ⚠️ `test_mechanics` レイヤーは検証専用ステージ＝対象外（PLAN.md 17 ②）。
//    ただし**絵文字の検査だけは全レイヤーを見る**（`tests/ui-icons.spec.js` ③ が
//    test_mechanics も見る＝ここで除外すると「この検査は緑なのにテストは赤」になる）。
//
// Usage:
//   node scripts/check-dialog-integrity.mjs
//
import { readFileSync } from 'fs';
import { TILE } from '../shared/tiles.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';
import { ORDER, labelOf } from '../shared/progression.js';
import { normalizeDialogMarks } from '../shared/marks.js';
import { findRawIconEmoji, countIconMarkers } from '../shared/map-texts.js';

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

// ── 4. 印の行き先の実在（キュー17-2）────────────────────────────────────
// `mark` は静的な1組、`markAfterBoss[ボス種別]` は進行で切り替わる版。後者は
// 「そのボスを倒すまで誰も見ない」∴書き間違いが一番長く残る場所＝機械で見る。
let markCount = 0;
// 行き先（`layer:stage`）→ その印を教える会話とラベルの一覧＝**同じ画面に別のラベルを教える
// 相手が2人以上いないか**を見る（2026-09-15 に実害＝老賢者が `field 7,1` を「古代の祭壇」、
// 諦めた老人が同じ画面を「石の台」と教えていた。印は1画面に1つ（`shared/marks.js addMark` が
// 上書きして false を返す）∴**話した順で地図のラベルが入れ替わり、後から話した方では
// 「地図に記した！」も出ない**＝プレイヤーから見ると教えたのに何も起きない）。
const markDests = new Map();
for (const [layerName, layer] of Object.entries(d.layers)) {
  if (EXCLUDED_LAYERS.has(layerName)) continue;
  for (const [stageKey, stage] of Object.entries(layer.stages ?? {})) {
    for (const store of ['signData', 'npcData']) {
      for (const [posKey, entry] of Object.entries(stage[store] ?? {})) {
        if (!entry || typeof entry !== 'object') continue;
        const sources = [];
        if (entry.mark !== undefined) sources.push(['mark', entry.mark]);
        for (const [boss, mk] of Object.entries(entry.markAfterBoss ?? {})) {
          sources.push([`markAfterBoss[${boss}]`, mk]);
        }
        for (const [label, raw] of sources) {
          const norm = normalizeDialogMarks(raw, layerName);
          if (!norm.length) {
            err(`[${layerName} ${stageKey}] (${posKey}) の ${label} の形が不正：${JSON.stringify(raw)}`);
            continue;
          }
          for (const m of norm) {
            markCount++;
            if (!d.layers[m.layer]?.stages?.[m.stage]) {
              err(`[${layerName} ${stageKey}] (${posKey}) の ${label} が実在しない画面を指す：${m.layer}/${m.stage}（${m.label}）`);
            }
            const dest = `${m.layer}:${m.stage}`;
            if (!markDests.has(dest)) markDests.set(dest, []);
            markDests.get(dest).push({ at: `${layerName} ${stageKey} (${posKey}) ${label}`, label: m.label });
          }
        }
      }
    }
  }
}

// 同じ行き先を**別の会話が別のラベルで**教えていないか（上記の実害の再発検知）。
// 1つの会話の中で版ごとにラベルが違うのは正当＝進行で言い方が変わる（同時には出ない）∴
// 「会話の位置が2つ以上」かつ「ラベルが2種類以上」のときだけ言う。
for (const [dest, uses] of markDests) {
  const labels = new Set(uses.map(u => u.label));
  const speakers = new Set(uses.map(u => u.at.replace(/ (mark|markAfterBoss\[.+\])$/, '')));
  if (labels.size < 2 || speakers.size < 2) continue;
  warn(`印の行き先 ${dest} を別のラベルで教える会話が ${speakers.size} つある`
    + `（地図のラベルは話した順で入れ替わり、後の相手では「地図に記した！」が出ない）：`
    + uses.map(u => `${u.at}＝「${u.label}」`).join(' / '));
}

// ── ⑤ 本文の絵文字（実行キュー24・2026-09-16）─────────────────────────────
// なぜ検査をここに足すか＝この退行（`{{key}}` マーカー75件が絵文字へ巻き戻った）は
// `tests/ui-icons.spec.js` ①③ が5日間赤で知らせていたのに、データを触る作業では
// 速い node の check-* しか回さないので誰も気付かなかった（報告では「既知の失敗」に
// された）。∴**データを触ったら必ず回す検査**の側にも同じ歯を置く。
// 対象は全レイヤー（`test_mechanics` も含む）＝上のコメントの理由。
const rawEmoji = findRawIconEmoji(d);
for (const f of rawEmoji) {
  err(`本文に絵文字が残っている（{{${f.key}}} と書く）：${f.at}「${f.text}」`);
}
const iconMarkers = countIconMarkers(d);
for (const u of iconMarkers.unknown) {
  err(`shared/ui-icons.js UI_ICON に無いマーカー {{${u.key}}}：${u.at}「${u.text}」`);
}

// ── CLI ──────────────────────────────────────────────────────────────────
const errors = issues.filter(i => i.level === 'error');
const warns  = issues.filter(i => i.level === 'warn');

const badge = errors.length ? '❌' : warns.length ? '⚠️ ' : '✅';
console.log(`${badge} check-dialog-integrity`);
for (const e of errors) console.log(`   ❌ ${e.msg}`);
for (const w of warns)  console.log(`   ⚠️  ${w.msg}`);
if (!issues.length) console.log('   すべてのチェックに合格');

console.log(`\n── 合計: ❌ ${errors.length} エラー / ⚠️  ${warns.length} 警告`
  + `（見た印 ${markCount} 件 / アイコンマーカー ${iconMarkers.total} 個・${iconMarkers.texts} 本文）──`);
process.exit(errors.length > 0 ? 1 : 0);
