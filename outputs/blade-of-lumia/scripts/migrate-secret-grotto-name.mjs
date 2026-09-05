// 寄道 `secret_grotto` に名前を与える＝「秘密の洞窟」（2026-09-05・実行キュー 0g の未決分・ユーザー確定）
//
// 背景：`secret_grotto` は実マップに `name` を持たない唯一の進行地点だった（`shared/progression.js`
// の `ORDER` にあった `fallbackName`「空中の遺跡」が出ていた）。ところが「空中の遺跡」は
// **`dungeon_7` の実名**∴監査出力に「寄道 空中の遺跡」と「D7 空中の遺跡」が並び、読むたびに
// 取り違える状態だった。寄道の命名はゲーム内容の判断∴0g では保留し、ユーザーが「秘密の洞窟」と確定した。
//
// このスクリプトが直すのは3か所（データ側の名前だけでなく**プレイヤーに見えている名前**も直す
// ＝HUD に「秘密の洞窟」と出るのに石碑が「空中の遺跡」と呼んでいる状態を作らない）：
//   ① `layers.secret_grotto.name = '秘密の洞窟'`（HUD＝`game/ui.js` が読む側／`labelOf()` の出所）
//   ② `field 9,9` の石碑 NPC (7,8)＝この寄道の入口を説明している石碑の見出しと本文
//      （「空を漂う謎の古代遺跡」「雲上への扉」＝D7 の文章を流用したまま残っていた）
//   ③ 同じ画面の NPC「すみっこずき」(1,11) の2行＝同じ名前で寄道を指していた
//      （ついでに方角も実配置に合わせる＝水の迷宮の入口は (3,10)＝すぐ南／
//        秘密の洞窟の入口は (5,3)＝南西の奥。旧文は「水の迷宮は左の下」「遺跡はさらに南」で
//        どちらも実配置と合っていなかった）
//
// ⚠️ `dungeon_7` の名前・石碑・笛ワープは触らない（あちらが「空中の遺跡」の本来の持ち主）。
//
// 使い方:
//   node scripts/migrate-secret-grotto-name.mjs --dry   # 差分のみ
//   node scripts/migrate-secret-grotto-name.mjs         # 書き込み

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH ?? join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const NEW_NAME = '秘密の洞窟';
const OLD_NAME = '空中の遺跡';        // = dungeon_7 の実名（衝突の相手）
const TABLET_CELL = '7,8';            // field 9,9 の石碑（この寄道の入口を説明している）
const HERMIT_CELL = '1,11';           // field 9,9 の NPC「すみっこずき」
const FIELD_STAGE = '9,9';

const TABLET_LINES = [
  `【${NEW_NAME}】`,
  '岩肌に隠された 古い洞窟。',
  '笛の音色だけが その入口を開く。',
  '→ この地で笛を吹け。扉は 北西に現れる。',
  '奥には 銀の刃が 眠るという。',
];

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

// ── 書き込み前の検査 ──────────────────────────────────────────────────────
const grotto = map.layers?.secret_grotto;
if (!grotto) throw new Error('レイヤー secret_grotto が無い');
if (grotto.name && grotto.name !== NEW_NAME)
  throw new Error(`secret_grotto に既に別の名前がある: ${grotto.name}（この移行は名前が無い前提）`);
if (map.layers?.dungeon_7?.name !== OLD_NAME)
  throw new Error(`dungeon_7 の名前が「${OLD_NAME}」でない＝衝突の前提が変わった: ${map.layers?.dungeon_7?.name}`);
for (const [id, layer] of Object.entries(map.layers)) {
  if (id !== 'secret_grotto' && layer?.name === NEW_NAME)
    throw new Error(`「${NEW_NAME}」は既に ${id} が使っている＝また衝突する`);
}

const stage = map.layers?.field?.stages?.[FIELD_STAGE];
if (!stage) throw new Error(`field ${FIELD_STAGE} が無い`);
if (stage.mapEnters?.['5,3']?.destId !== 'secret_grotto')
  throw new Error(`field ${FIELD_STAGE} (5,3) が secret_grotto の入口でない＝石碑の説明対象が違う`);

const tablet = stage.npcData?.[TABLET_CELL];
if (!tablet) throw new Error(`field ${FIELD_STAGE} の石碑 (${TABLET_CELL}) が無い`);

// 再実行（適用済み）＝何も直すものが無い＝エラーではない。
if (grotto.name === NEW_NAME && tablet.lines?.[0] === `【${NEW_NAME}】`) {
  console.log(`# 既に適用済み（secret_grotto.name=${NEW_NAME}・石碑も ${NEW_NAME}）∴書き込みなし`);
  process.exit(0);
}

if (!tablet.lines?.some((l) => l.includes(OLD_NAME)))
  throw new Error(`石碑 (${TABLET_CELL}) が「${OLD_NAME}」を名乗っていない＝直す対象ではない`);
if (!tablet.lines.some((l) => l.includes('銀の刃')))
  throw new Error(`石碑 (${TABLET_CELL}) が銀の剣の寄道を説明していない＝対象を取り違えている`);

const hermit = stage.npcData?.[HERMIT_CELL];
if (!hermit?.lines) throw new Error(`field ${FIELD_STAGE} の NPC (${HERMIT_CELL}) に台詞が無い`);
const hermitHits = hermit.lines.filter((l) => l.includes(OLD_NAME)).length;
if (hermitHits !== 2) throw new Error(`NPC (${HERMIT_CELL}) の「${OLD_NAME}」は2行の想定（実際 ${hermitHits} 行）`);

// ── 書き換え ──────────────────────────────────────────────────────────────
const before = {
  name: grotto.name ?? '(なし)',
  tablet: tablet.lines.slice(),
  hermit: hermit.lines.slice(),
};

grotto.name = NEW_NAME;
tablet.lines = TABLET_LINES.slice();
// 旧文は2行に分かれていて（しかも方角がどちらも実配置と合っていない）∴1行に畳む。
// 実配置＝水の迷宮の入口 (3,10)＝すぐ南／秘密の洞窟の入口 (5,3)＝南西の奥（笛で現れる）。
let folded = false;
hermit.lines = hermit.lines.map((l) => {
  if (l.includes('二つのダンジョンへの入口')) return 'この辺りに 二つの入口があるみたい。';
  if (!l.includes(OLD_NAME)) return l;
  if (folded) return null;                 // 2行目は1行目に畳む
  folded = true;
  return `すぐ南には 水の迷宮の入口。南西の奥には 笛を吹くと現れる ${NEW_NAME}があるらしい。`;
}).filter((l) => l !== null);

if (hermit.lines.some((l) => l.includes(OLD_NAME)))
  throw new Error(`NPC (${HERMIT_CELL}) に「${OLD_NAME}」が残っている`);
if (!hermit.lines.some((l) => l.includes(NEW_NAME)))
  throw new Error(`NPC (${HERMIT_CELL}) が「${NEW_NAME}」を言わない`);

// ── 差分の表示 ────────────────────────────────────────────────────────────
console.log(`# secret_grotto.name: ${before.name} → ${grotto.name}`);
console.log(`# field ${FIELD_STAGE} 石碑 (${TABLET_CELL}):`);
for (const l of before.tablet) console.log(`  - ${l}`);
for (const l of tablet.lines) console.log(`  + ${l}`);
console.log(`# field ${FIELD_STAGE} すみっこずき (${HERMIT_CELL}):`);
for (const l of before.hermit) if (!hermit.lines.includes(l)) console.log(`  - ${l}`);
for (const l of hermit.lines) if (!before.hermit.includes(l)) console.log(`  + ${l}`);

if (DRY) {
  console.log('\n--dry: 書き込みなし');
} else {
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
  console.log('\n書き込み完了:', MAP_PATH);
}
