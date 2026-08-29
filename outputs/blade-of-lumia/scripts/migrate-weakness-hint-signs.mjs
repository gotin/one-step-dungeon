#!/usr/bin/env node
/**
 * migrate-weakness-hint-signs.mjs
 *
 * Phase 8-4 (4) 0d-2.11 (A)（2026-08-27）＝**ボスの弱点を本編の中で知れるようにする**。
 *
 * 経緯：0d-2.11 (B) で「弱点が当たった瞬間」を音とエフェクトで返すようにしたが、
 * 弱点そのものを**事前に知る手段**は D5（氷のリヴァイアサン）と D7（嵐の鷲王）の
 * 石碑しか無かった＝残る 6 体（G/N/J/A/O/I）は総当たりでしか気づけない。
 * ∴強制経路上の立札に、詩の形で「何をすれば効くか」を1行足す。
 *
 * 文面の作法（D7 の先例に倣う）：
 *   ・道具の名前を説明しない。**行い**を書く（「弓を使え」ではなく「射抜け」）。
 *   ・敵の名（の一部）と、効く行いを**同じ行**に置く＝どの敵の話かが読み取れる。
 *     tests/weakness-hints.spec.js がこの形を実マップから導出して固定している。
 *
 * 置き場所は実マップから導出した強制経路（入口→ボス部屋で「塞ぐと到達不能」になる部屋）
 * の中から選んだ（`bfsLayer(..., { blockedRoom })`・裏取り済み）：
 *   D1 dungeon_1 0,1 @2,7 … **新設**。ボス扉（row1 の列5-6）の**斜め脇**。
 *   D2 dungeon_2 1,1 @7,5 … 既存「ヒント」（ブーメランの使い方）に1行追記。
 *   D3 dungeon_3 0,1 @1,7 … **新設**。ボス扉と**同じ行の東隣**＝文字どおり扉の横。
 *   D4 dungeon_4 1,3 @3,5 … 既存「炎の神殿の入口」に1行追記。
 *   D6 dungeon_6 1,3 @3,5 … 既存「森の聖域・入口の石碑」に1行追記。
 *   D8 dungeon_8 1,3 @7,4 … 既存「沼地の神殿・入口の石碑」に1行追記。
 *
 * ⚠️ D4/D6/D8 のボス直前の部屋（1,0）は倉庫番パズルで盤面が詰まっている∴タイルを
 *    増やさない＝入口の石碑（1,3）への追記で代える（どちらも強制経路上）。
 *
 * ⚠️ 立札は**扉の真下に置かない**（2026-08-29 ユーザー指摘＝「ドアの前に看板おいちゃうの？
 *    ドアの横とかじゃないとドアを通るのに邪魔じゃん」）。初版は D1/D3 とも @2,6 ＝扉の
 *    2枚（列5-6）のうち列6の真下を潰していた＝扉の幅が実質1枚に狭まり、体の大きい
 *    プレイヤーの動線を邪魔していた。∴扉の列を1つも塞がない位置へ寄せた
 *    （D1＝斜め脇 @2,7 / D3＝扉と同じ行の floor @1,7）。`OLD_CELLS` が初版を撤去する。
 *
 * 冪等：文面が既に新版なら何もしない／'i' が既にあれば tile は触らない。
 * Run from: outputs/blade-of-lumia/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

// [layer, stage, "r,c", {name, lines}, 期待するタイル（'i' 新設なら null）]
const SIGNS = [
  // G 岩のゴーレム（sword / window:'recover' ×3）＝道具ではなく**間**が弱点。
  // D1 は世界にサブ道具が1つも無い地点∴「振り下ろした後の隙に斬る」を教える立札。
  ['dungeon_1', '0,1', '2,7', {
    name: '石の扉の脇の立札',
    lines: [
      'この扉の奥に 岩のゴーレムが眠る。',
      '岩の腕は 振り下ろした後 しばし止まる。',
      'その隙に ゴーレムを斬れ。岩肌が砕ける。',
    ],
  }, null],
  // N 砂嵐の蠍王（boomerang ×3）＝ブーメランの部屋の立札に1行足す。
  ['dungeon_2', '1,1', '7,5', {
    name: 'ヒント',
    lines: [
      'このブーメランで遠くの物を回収できる。',
      '水の向こうの鍵も手が届く。',
      '旋る刃は 砂嵐の蠍王の鉗をも 断つ。',
    ],
  }, 'i'],
  // J 深海の海蛇（arrow ×2）＝旧弱点は光の刃（剣ティア1）だったが D3 では永久に撃てない
  // ∴矢へ差し替えた（弓は D2 の報酬）。立札もその行いを書く。
  ['dungeon_3', '0,1', '1,7', {
    name: '水の扉の脇の立札',
    lines: [
      'この扉の奥に 深海の海蛇が潜む。',
      '重ねた鱗は 剣を弾く。',
      '海蛇の鱗の隙を 矢で射抜け。',
    ],
  }, null],
  // A 炎のサラマンドラ（arrow ×2）＝ロウソクの案内（既存）を保ったまま1行足す。
  ['dungeon_4', '1,3', '3,5', {
    name: '炎の神殿の入口',
    lines: [
      '炎は全てを焼き尽くす。',
      'ロウソクが 道を開く。',
      '奥に棲むサラマンドラは 矢で射抜け。',
    ],
  }, 'i'],
  // O 古森の巨人（fire ×2）＝灯りの案内（既存）と同じ石碑に1行足す。
  ['dungeon_6', '1,3', '3,5', {
    name: '森の聖域・入口の石碑',
    lines: [
      'ここは古森の巨人が眠る聖域。',
      '炎を宿す灯りが、閉ざされた道を開くだろう。',
      '巨人の樹皮は 炎で焼き払える。',
    ],
  }, 'i'],
  // I 沼地の大蝦蟇（fire ×2）＝はしごの案内（既存）と同じ石碑に1行足す。
  ['dungeon_8', '1,3', '7,4', {
    name: '沼地の神殿・入口の石碑',
    lines: [
      '沼に橋を架けて渡れ。',
      'はしごを使うのだ。',
      '沼地の大蝦蟇の湿った肌は 炎に焼かれる。',
    ],
  }, 'i'],
];

// 初版（2026-08-27）が扉の真下に立てた立札の撤去。
// [layer, stage, "r,c", その立札だと分かる name]＝name が一致したときだけ消す
// （他人の看板を巻き込まない）。既に無ければ何もしない＝冪等。
const OLD_CELLS = [
  ['dungeon_1', '0,1', '2,6', '石の扉の前の立札'],
  ['dungeon_3', '0,1', '2,6', '水の扉の前の立札'],
];

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
let placed = 0, rewritten = 0, skipped = 0, removed = 0;

for (const [layer, stage, pk, oldName] of OLD_CELLS) {
  const s = data.layers?.[layer]?.stages?.[stage];
  if (!s) throw new Error(`missing stage ${layer}/${stage}`);
  if (s.signData?.[pk]?.name !== oldName) continue;
  delete s.signData[pk];
  const [r, c] = pk.split(',').map(Number);
  if (s.tiles[r][c] === 'i') s.tiles[r][c] = '.';
  removed++;
}

for (const [layer, stage, pk, body, expectTile] of SIGNS) {
  const s = data.layers?.[layer]?.stages?.[stage];
  if (!s) throw new Error(`missing stage ${layer}/${stage}`);
  const [r, c] = pk.split(',').map(Number);
  const tile = s.tiles[r][c];

  if (expectTile === 'i') {
    if (tile !== 'i') throw new Error(`${layer}/${stage} @${pk} は 'i' ではない (=${tile})`);
  } else if (tile !== 'i') {
    if (tile !== '.') throw new Error(`${layer}/${stage} @${pk} は床ではない (=${tile})＝別の物を潰す`);
    if (s.npcData?.[pk] || s.shopData?.[pk]) throw new Error(`${layer}/${stage} @${pk} は他の対話物が居る`);
    if (s.chestContents?.[pk] || s.floorItems?.[pk]) throw new Error(`${layer}/${stage} @${pk} に拾い物がある`);
    s.tiles[r][c] = 'i';
    placed++;
  }

  s.signData = s.signData || {};
  const cur = s.signData[pk];
  if (cur && cur.name === body.name && JSON.stringify(cur.lines) === JSON.stringify(body.lines)) {
    console.log(`skip ${layer}/${stage} @${pk}（既に新版）`);
    skipped++;
    continue;
  }
  s.signData[pk] = body;
  rewritten++;
}

writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log(`removed ${removed} old sign(s), placed ${placed} sign tile(s), wrote ${rewritten} body/bodies, skipped ${skipped}.`);
