#!/usr/bin/env node
// Phase 9-3 (b): Guide NPC/sign linesAfterBoss — lead the player to the next dungeon.
//
// Each key dungeon-entrance sign and the village sage gain linesAfterBoss entries
// that fire when the relevant boss has been defeated, pointing the player toward
// the NEXT destination in play order:
//   G(D1→D2) → N(D2→D3) → J(D3→D4) → A(D4→D6) →
//   O(D6→D5) → L(D5→D8) → I(D8→D7/笛) → U(D7→祭壇)
//
// Run from: outputs/blade-of-lumia/
//   node scripts/migrate-guide-b.mjs

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const FIELD = data.layers.field.stages;

function npc(stageKey, posKey) {
  const s = FIELD[stageKey];
  if (!s) throw new Error(`stage not found: field/${stageKey}`);
  if (!s.npcData[posKey]) throw new Error(`npcData not found: field/${stageKey}[${posKey}]`);
  return s.npcData[posKey];
}

function setNpc(stageKey, posKey, obj) {
  const s = FIELD[stageKey];
  if (!s) throw new Error(`stage not found: field/${stageKey}`);
  s.npcData[posKey] = obj;
}

// ── 老賢者（村 7,14・tile b at 3,3）────────────────────────────────────────────
// Full replacement: あらすじ準拠の台詞に更新
setNpc('7,14', '3,3', {
  name: '老賢者',
  lines: [
    'おお、目を覚ましたか若き勇者よ。',
    'この国の女王ルミアは、闇の魔術師ザーネルの呪いを受け……石に変えられてしまったのじゃ。',
    '呪いを解く道はただ一つ。各地に散った「星の欠片」を8つ集め、北の古代の祭壇に捧げることじゃ。',
    'まず旅支度を。そこの剣を拾い、村すぐ西の洞窟で力試しをするがよい。',
  ],
  linesAfterBoss: {
    G: [
      '岩のゴーレムを倒したか。よくやった。',
      '次は南西の砂漠じゃ。砂漠の神殿に二つ目の欠片が眠る。',
      '遠くの宝を手繰れる道具があると聞く――役に立つじゃろう。',
    ],
    N: [
      'ブーメランを手に入れたか。使い方が分かってきたじゃろう。',
      '次は東の湖じゃ。水の迷宮に三つ目の欠片がある。',
      '弓矢があれば遠くのスイッチを射れる……覚えておくがよい。',
    ],
    J: [
      '水の迷宮も制したか。じゃが先はまだ長い。',
      '次は北東の火山じゃ。炎の神殿に四つ目の欠片が封じられておる。',
      'ロウソクの炎は暗所を照らすだけでなく、道を開く力も持つとか。',
    ],
    A: [
      '炎の神殿、見事じゃ。これでロウソクを手に入れたじゃろう。',
      '次は西の森じゃ。森の聖域に五つ目の欠片が眠る。',
      'ロウソクでかがり火を灯せば、隠れた道が開くはずじゃ。',
    ],
    O: [
      '古森の巨人を倒したか。爆弾は手に入ったじゃろう。',
      '次は北東の雪原じゃ。氷の廃墟に六つ目の欠片がある。',
      '爆弾で崩せる壁が行く手を塞いでいるとか。',
    ],
    L: [
      '氷のリヴァイアサンを下したか。はしごを手に入れたじゃろう。',
      '次は南東の沼じゃ。沼地の神殿に七つ目の欠片が眠る。',
      '毒の堀もはしごがあれば渡れる。',
    ],
    I: [
      '沼の大蝦蟇を倒し、笛を手に入れたじゃろう。',
      '残る欠片は空の彼方じゃ。笛を吹けば雲上への道が開く。',
      '空島の遺跡に最後の欠片が……嵐の鷲王が守っておる。',
    ],
    U: [
      '全ての欠片が揃った！北の古代の祭壇へ向かうのじゃ。',
      '祭壇に捧げれば、ザーネルの呪いを解く力を授かるはずじゃ。',
    ],
    default: [
      'よくやった。その調子で全ての星の欠片を集めるのじゃ。',
      '各地のダンジョンにはまだ強き者どもが潜んでいる。',
      '油断せず先へ進め。',
    ],
  },
});

// ── 村人タロ（村 7,14・tile a at 3,5）────────────────────────────────────────
// Update linesAfterBoss to be play-order-aware
const taro = npc('7,14', '3,5');
taro.linesAfterBoss = {
  G: [
    'あの岩のゴーレムを倒したんか！すごいな。',
    '次は南西の砂漠だってよ。砂漠の神殿に欠片があるらしい。',
    '気をつけてくれよ！',
  ],
  N: [
    '砂漠のボスまで倒したのか！英雄だな。',
    '東の湖の水の迷宮が次らしいぞ。',
  ],
  J: [
    '水の迷宮もクリアか。あとで自慢話を聞かせてくれよ。',
    '北東の火山に炎の神殿があるってうわさだ。',
  ],
  A: [
    '火山まで行ったのか！熱かっただろ。',
    '西の森に次の欠片があるって聞いたぞ。',
  ],
  O: [
    '森の巨人まで……本当に止まらないな。',
    '雪原の廃墟が次だと賢者さんが言ってたよ。',
  ],
  L: [
    '氷のリヴァイアサンも倒したのか。もう何も怖くないな。',
    '今度は南東の沼地らしいぞ。',
  ],
  I: [
    '沼の大蝦蟇まで！残りはあと一つだって聞いたよ。',
    '笛で空に飛べるらしいじゃないか。すごいな。',
  ],
  U: [
    '全部集めたんだって！？祭壇に行くんだろ。頑張れよ！',
  ],
  default: [
    'ダンジョンのボスを倒したんだって？すごいな！',
    '他にもまだダンジョンがあるらしいぞ。くれぐれも無事でいてくれよ！',
  ],
};

// ── D1入口看板（field 6,13・tile i at 7,8）──────────────────────────────────
const d1sign = npc('6,13', '7,8');
d1sign.linesAfterBoss = {
  G: [
    '【草原の洞窟】攻略済み。',
    '次は南西の砂漠へ。',
    '砂漠の神殿に 星の欠片が眠る。',
  ],
};

// ── D2入口看板（field 2,15・tile i at 3,5）──────────────────────────────────
const d2sign = npc('2,15', '3,5');
d2sign.linesAfterBoss = {
  N: [
    '【砂漠の神殿】攻略済み。',
    '次は東の湖へ。',
    '水の迷宮に 星の欠片が眠る。',
  ],
};

// ── D3入口看板（field 9,9・tile i at 3,9）──────────────────────────────────
const d3sign = npc('9,9', '3,9');
d3sign.linesAfterBoss = {
  J: [
    '【水の迷宮】攻略済み。',
    '次は北東の火山へ。',
    '炎の神殿に 星の欠片が眠る。',
  ],
};

// ── D4入口看板（field 12,2・tile i at 7,5）──────────────────────────────────
const d4sign = npc('12,2', '7,5');
d4sign.linesAfterBoss = {
  A: [
    '【炎の神殿】攻略済み。',
    '次は西の森へ。',
    'ロウソクでかがり火を灯せ。 森の聖域の扉が開く。',
  ],
};

// ── D6入口看板（field 2,4・tile i at 4,3）──────────────────────────────────
const d6sign = npc('2,4', '4,3');
d6sign.linesAfterBoss = {
  O: [
    '【森の聖域】攻略済み。',
    '次は北東の雪原へ。',
    '爆弾で壁を崩せ。 氷の廃墟の奥に欠片がある。',
  ],
};

// ── D5入口看板（field 13,5・tile i at 7,6）──────────────────────────────────
const d5sign = npc('13,5', '7,6');
d5sign.linesAfterBoss = {
  L: [
    '【氷の廃墟】攻略済み。',
    '次は南東の沼へ。',
    'はしごで毒の堀を渡れ。 沼地の神殿に欠片がある。',
  ],
};

// ── D8入口看板（field 10,14・tile i at 8,9）── 新規追加 ─────────────────────
// This tile exists in the map but has no npcData yet.
FIELD['10,14'].npcData['8,9'] = {
  name: '石碑',
  lines: [
    '【沼地の神殿】',
    '毒の沼に沈んだ古代の神殿。',
    'はしごで毒の堀を越えなければ 奥へは進めない。',
    '↑ 入口はすぐ上。',
  ],
  linesAfterBoss: {
    I: [
      '【沼地の神殿】攻略済み。',
      '最後の欠片は 空の彼方に。',
      '笛を吹けば 雲上への道が開く。',
    ],
  },
};

// ── write ────────────────────────────────────────────────────────────────────
writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));
console.log('✓ migrate-guide-b: guide linesAfterBoss applied');

// ── verify: key checks ───────────────────────────────────────────────────────
const checks = [
  ['7,14',  '3,3', 'G',   '砂漠',   '老賢者 G後台詞'],
  ['7,14',  '3,3', 'U',   '祭壇',   '老賢者 U後台詞'],
  ['7,14',  '3,5', 'G',   '砂漠',   'タロ G後台詞'],
  ['6,13',  '7,8', 'G',   '砂漠',   'D1看板 G後台詞'],
  ['2,15',  '3,5', 'N',   '湖',     'D2看板 N後台詞'],
  ['9,9',   '3,9', 'J',   '火山',   'D3看板 J後台詞'],
  ['12,2',  '7,5', 'A',   '森',     'D4看板 A後台詞'],
  ['2,4',   '4,3', 'O',   '雪原',   'D6看板 O後台詞'],
  ['13,5',  '7,6', 'L',   '沼',     'D5看板 L後台詞'],
  ['10,14', '8,9', 'I',   '空',     'D8看板 I後台詞'],
];

let ok = true;
for (const [stage, pos, boss, kw, label] of checks) {
  const entry = FIELD[stage]?.npcData?.[pos]?.linesAfterBoss?.[boss];
  const pass = entry && entry.some(l => l.includes(kw));
  console.log(`  ${pass ? '✓' : '✗'} ${label}`);
  if (!pass) ok = false;
}
process.exitCode = ok ? 0 : 1;
