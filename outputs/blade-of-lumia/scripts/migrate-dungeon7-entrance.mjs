#!/usr/bin/env node
/**
 * migrate-dungeon7-entrance.mjs（実行キュー 0x・2026-09-05）
 *
 * 問題: `dungeon_7`（空中の遺跡）には **世界のどこにも入口が無かった**。
 *   `dungeon_7/1,3 @7,2` の `>` は `destId: 'field_dungeon7'` を指しているが、
 *   その `field_dungeon7` を `id` に持つセルが field 側に存在しない＝
 *   `buildExitRegistry()`（`shared/exits.js`）で解決できず、帰りの遷移も発動しない。
 *   D7 のボス U が8個目の星の欠片を落とす∴入れない＝欠片が7個で止まる＝
 *   古代の祭壇の翼の羽衣も暗黒の塔も寄道3つも永久に閉じる＝**クリア不能**だった。
 *
 * 直し方: `field/2,0`「風の環状列石」の内庭 (6,5) を **笛で現れる隠し入口**にする。
 *   ・`tiles[6][5]` を `'>'`（MAP_ENTER）にする
 *   ・`mapEnters['6,5'] = { id: 'field_dungeon7', destId: 'dungeon_7' }`
 *     ＝これで両側が解決する（field→D7 も D7→field も）
 *   ・`showConditions['6,5'] = { trigger: 'flutePlayed' }` ＋ ステージの
 *     `fluteEffect = { type: 'reveal', … }`＝笛を吹くまで見えず通れない
 *     （`game/game.js` の MAP_ENTER 判定と `game/render-board.js` の描画判定の両方が
 *      `showConditions` を見る。`fluteEffect{reveal}` が無いと `flutePlayed` が
 *      立たず永久に開かない＝`tests/field-invariants.spec.js` の関門どおり）
 *
 * なぜ「笛で現れる隠し入口」か（設計判断・DECISIONS.md 2026-09-05 に併記）:
 *   ・`shared/progression.js ORDER` は D8 →(秘密の洞窟)→ D7 の順＝D7 に来る人は
 *     **笛を必ず持っている / 翼の羽衣はまだ持っていない**。∴笛の関門は順序と整合し、
 *     空島（`field/8,1`）に置く案（羽衣が要る＝羽衣は D7 の欠片が要る＝循環）を避ける。
 *   ・PLAN 9-2i の「入場に D8 報酬の笛が要る」という当初の設計意図をそのまま満たす。
 *     D7 の中身（`dungeon_7/1,0` の `killAllAndFlute` 封印・`1,3` の石碑
 *     「笛の音に導かれし者よ」）も笛前提で書かれている。
 *   ・`field/2,0` を選ぶ根拠は実データ2つ＝(1) 看板 (6,2)「風がここへ 人を運ぶという」
 *     (2) `secret_grotto/0,0` の `fluteEffect{warp}` の着地点が既に `field 2,0 (8,6)`
 *     ＝竜巻で降りる画面。「風が人を運ぶ環状列石」から空へ上がるのは同じロアの裏返し。
 *   ・純粋な笛ワープ（`fluteEffect{type:'warp'}`）にしない理由＝それでは
 *     `field_dungeon7` が未解決のまま残り、D7 から**帰れない**（0x の完了条件 (a)）。
 *   ・(6,5) を選ぶ理由＝内庭の4セル (6,5)(6,6)(7,5)(7,6) のうち西側。列 6 が
 *     この画面の南北の通り道（row 9 の出口 cols 5,6 → row 4 の東西廊下）∴
 *     列 6 を素通り用に空けておけば、笛を吹いた後に通り抜ける人が意図せず
 *     空へ飛ばされない。
 *
 * 到達性（0x 完了条件 (b)＝循環依存が無いこと）:
 *   `scripts/lib/connectivity.mjs bfsLayer`（全ゲート閉・道具0）で
 *   村のスタート `7,14 (2,2)` から `field 2,0 (6,5)` まで歩ける＝下で assert する。
 *
 * 自己検証: 書き込み前に (a) 2,0 に mapEnters が無い＝新規である (b) (6,5) が
 *   今は床 '.' である (c) `dungeon_7/1,3 @7,2` が `destId:'field_dungeon7'` である
 *   (d) `field_dungeon7` を id に持つセルが世界中に無い、を assert。書き込み後に
 *   (e) 両向きの id⇔destId が解決する (f) 着地セルが両側とも歩ける
 *   (g) 純粋歩行 BFS で (6,5) に到達できる、を assert する。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { bfsLayer, isBlocked } from './lib/connectivity.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const field = map.layers.field.stages;
const s = field['2,0'];
const d7 = map.layers.dungeon_7?.stages?.['1,3'];

const ROW = 6, COL = 5;
const POS = `${ROW},${COL}`;
const FIELD_ID = 'field_dungeon7';

// ── 事前検証 ──
if (!s) throw new Error('field/2,0 が見つからない');
if (Object.keys(s.mapEnters ?? {}).length) {
  throw new Error(`field/2,0 に既に mapEnters がある: ${JSON.stringify(s.mapEnters)}`);
}
if (s.tiles[ROW][COL] !== '.') {
  throw new Error(`field/2,0 tiles[${ROW}][${COL}] は床 '.' のはず（実際: '${s.tiles[ROW][COL]}'）`);
}
if (s.fluteEffect) throw new Error(`field/2,0 に既に fluteEffect がある: ${JSON.stringify(s.fluteEffect)}`);
if (!d7) throw new Error('dungeon_7/1,3 が見つからない');
if (d7.mapEnters?.['7,2']?.destId !== FIELD_ID || d7.mapEnters['7,2'].id !== 'dungeon_7') {
  throw new Error(`dungeon_7/1,3 @7,2 が想定と違う: ${JSON.stringify(d7.mapEnters?.['7,2'])}`);
}
const idsOf = () => {
  const ids = [];
  for (const [ln, ld] of Object.entries(map.layers)) {
    for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
      for (const [pk, me] of Object.entries(sd.mapEnters ?? {})) ids.push({ id: me.id, destId: me.destId, ln, sk, pk });
    }
  }
  return ids;
};
if (idsOf().some((e) => e.id === FIELD_ID)) {
  throw new Error(`${FIELD_ID} を id に持つセルが既にある＝0x は済んでいる`);
}

// ── 変更 ──
s.tiles[ROW][COL] = '>';
s.mapEnters ??= {};
s.showConditions ??= {};
s.mapEnters[POS] = { id: FIELD_ID, destId: 'dungeon_7' };
s.showConditions[POS] = { trigger: 'flutePlayed' };
s.fluteEffect = {
  type: 'reveal',
  message: '🎵 風が渦を巻き 空へ続く石の門が現れた！',
};
// 看板に笛のヒントを1行足す＝「ここで笛を吹く」に気づく手がかりを画面内に置く
// （隠し入口は手がかり無しでは総当たりになる。`field/9,9` の秘密の洞窟と同じ作法）。
const sign = s.signData?.['6,2'];
if (!sign?.lines) throw new Error('field/2,0 の看板 (6,2) に lines が無い');
const HINT = '環の中で笛を吹けば 風は空へ渡すという。';
if (!sign.lines.includes(HINT)) sign.lines.push(HINT);

// ── 事後検証 ──
if (s.tiles[ROW][COL] !== '>') throw new Error('タイルが MAP_ENTER になっていない');
const all = idsOf();
const byId = new Map(all.map((e) => [e.id, e]));
for (const [from, to] of [[FIELD_ID, 'dungeon_7'], ['dungeon_7', FIELD_ID]]) {
  const e = byId.get(from);
  if (!e) throw new Error(`id=${from} のセルが無い`);
  if (e.destId !== to) throw new Error(`id=${from} の destId が ${to} でない（${e.destId}）`);
  if (!byId.has(to)) throw new Error(`${from} の行き先 ${to} を id に持つセルが無い＝片側だけ`);
}
if (all.filter((e) => e.destId === 'dungeon_7').length !== 1) {
  throw new Error('dungeon_7 への入口が1つでない');
}
// 着地セルが両側とも歩ける（enterStage は壁でもクランプしない＝壁着地は即詰み）
for (const { ln, sk, pk } of [byId.get(FIELD_ID), byId.get('dungeon_7')]) {
  const st = map.layers[ln].stages[sk];
  const [r, c] = pk.split(',').map(Number);
  const ch = st.tiles[r][c];
  if (isBlocked(ch)) throw new Error(`着地セル ${ln}/${sk}@${pk} が徒歩不可 '${ch}'`);
}
// 純粋歩行（全ゲート閉・道具0＝翼の羽衣なし）で入口セルに到達できる
const start = { stage: map.startPos?.stage ?? '1,0', row: map.startPos?.row ?? 2, col: map.startPos?.col ?? 2 };
const { reachedCells } = bfsLayer(field, start);
if (!reachedCells.has(`2,0:${ROW},${COL}`)) {
  throw new Error(`入口セル 2,0:${POS} に徒歩で到達できない（start=${JSON.stringify(start)}）`);
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log(`✅ field/2,0 (${POS}) に D7 の入口（笛で出現する隠し MAP_ENTER）を設置。`);
console.log(`   ${FIELD_ID} ⇔ dungeon_7 の両側が解決・徒歩到達 OK（start=${start.stage} ${start.row},${start.col}）。`);
console.log(`   看板 (6,2) に笛のヒント「${HINT}」を追記。`);
