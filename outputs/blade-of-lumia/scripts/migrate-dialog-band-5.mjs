// キュー17（会話の語り＋目的地マーク）／子タスク 17-6＝帯5 の流し込み。
//
// 帯5 ＝ D6 森の聖域（`dungeon_6` 22 室）＋ 寄道 `forest_cave`（樹海の岩室 2 室）＋
//        森の field 画面（会話があるのは 10 画面／11 エントリ）。
//
// PLAN.md ⑩ の手順どおり：棚卸し → 3分類 → 叩き台 → **ユーザー承認**（2026-09-18）→ このスクリプト。
// 盤面の手編集はしない（会話も看板タイルもここだけで動かす）。
//
// ユーザー判断（2026-09-18）＝
//   #1 `field 2,0`（風の環状列石）は印を付けず帯8（D7）に譲る
//   #2 道具は実名で「爆弾」（帯4 の「火薬」は据え置き）
//   #3 `forest_cave 1,0` で「銅の剣」の名を出す
//   #4 新設看板は `dungeon_6 1,1` の門の手前（石押しの部屋 `1,0` の中には置かない）
//
// 実測で裏取りした事実（すべて work/blade-of-lumia.json・shared/*.js を直読み）＝
//   ・D6 の背骨＝`1,3`（入口）→ `1,2` の櫃で爆弾を得て `!`×2 を崩す → `1,1` の火3で門が開く
//     → `1,0` の石3・踏み板3で鍵 → `D`2枚 → `0,0` 古森の巨人。
//   ・`field 0,0` の `!`(3,2) は `breakDef 2`＝爆弾のみ。その奥が `forest_cave` の入口 `>`(1,2)。
//   ・方角（画面グラフ BFS）＝`0,2`→`0,0` は北2／`3,1`→崖 `0,0` は北1西3／`3,1` の東は
//     森が切れる `4,1`【森辺の四つ辻】／`2,4`→D5 入口 `13,5` は南1東11（＝「北東」は誤り）。
//   ・`forest_cave 1,0` の封印宝箱は `swordTier 1`＝銅の剣（`SWORD_TIERS[1]`）。
//
// ⚠️ 触らないもの
//   ・`dungeon_6 0,0`「ザーネルの記憶 其の五」（`tests/lore-tablets.spec.js` が番号を要求）
//   ・`dungeon_6 1,3 (3,5)` の本文（3行目「巨人の樹皮は 炎で焼き払える。」＝
//     `tests/weakness-hints.spec.js` ② が「敵の名＋弱点の行いが同じ1行」を要求する）＝印だけ足す
//   ・`field 2,4 (6,4)`【砂漠の神殿】（帯2 で承認済み）／`field 2,0` 風の環状列石（#1）
//
// ⚠️ 座標の convention＝`signData`/`npcData` の pos キーは "row,col"（行,列）。
//    ステージキー "x,y"（南が正の y）とは別物。
//
// 冪等：本文・印・タイルが既に新版なら書かない（skip と数える）。
// 事前条件：旧版の name／lines[0]（冪等のため新版も許す）とタイルが実データと一致することを確かめる。
// 自己検証：書き終えた後にファイルを読み直し、全エントリの形とマークの行き先の実在を確かめる。
//
// Run from: outputs/blade-of-lumia/

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizeDialogMarks } from '../shared/marks.js';
import { itemVariantKey } from '../shared/dialog-variants.js';

const __dir = dirname(fileURLToPath(import.meta.url));
// BLADE_MAP_PATH＝別のファイルに対して試すための口（本番前に .scratch のコピーで空撃ちする）。
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '../work/blade-of-lumia.json');

/** 印の表記は既存と完全一致で固定（検査⑤の「同じ行き先を別ラベルで教える」重複警告を避ける）。 */
const MARK_D6   = { layer: 'field', stage: '2,4',  label: '森の聖域',   kind: 'dungeon' };
const MARK_D5   = { layer: 'field', stage: '13,5', label: '氷の廃墟',   kind: 'dungeon' };
// 帯5 で新しく名前を与える寄道＝`layers.forest_cave.name` と同じ「樹海の岩室」で統一する
// （この名前が本文に載ることで検査②の導線ゼロ警告 4 件のうち 1 件が消える）。
const MARK_CAVE = { layer: 'field', stage: '0,0',  label: '樹海の岩室', kind: 'cave' };

const K_CANDLE = itemVariantKey('candle');
const K_BOMB   = itemVariantKey('bomb');
const K_LADDER = itemVariantKey('ladder');
const K_FLUTE  = itemVariantKey('flute');

/**
 * 新設する会話＝床 '.' のセルをタイル 'i'（看板）に変え、会話を新設する。
 * 置き場所の選び方（承認 #4）：
 *   dungeon_6 1,1 (3,9) … 鍵の部屋 `1,0` へ渡る門 '>'(4,9) の真上の床。開けた部屋の内側∴
 *     接続も石押しのレーンも塞がない。隣接床 (2,9)/(3,8)/(3,10) は遷移タイルでない＝読める
 *     （帯4 申し送り①＝`dungeon_4 1,0 (8,9)` の「隣が '>' だけ」の罠を避ける）。
 *     ⚠️ `1,0` の中は 1マス幅の通路と石の押し経路でできている∴看板を置くと詰む危険がある。
 */
const CREATES = [
  {
    layer: 'dungeon_6', stage: '1,1', pos: '3,9', home: 'signData',
    name: '鍵番の 書き置き',
    lines: [
      'この 先は 石と 踏み板の 間。',
      '三つの 石を 三つの 踏み板へ 送れば {{key}} 鍵が 現れる。',
      '石を 壁へ 詰ませれば 道は 閉じる。慎重に 送れ。',
    ],
    // 笛は D8 の物＝この時点では持っていない∴基本の本文では笛に触れない（道具の版で足す）。
    // `dungeon_6 1,0` の fluteEffect{type:'resetStones'} は実在。
    linesAfterBoss: {
      [K_FLUTE]: [
        'この 先は 石と 踏み板の 間。',
        '三つの 石を 三つの 踏み板へ 送れば {{key}} 鍵が 現れる。',
        'その {{flute}} 笛を 吹けば 石は 元の 座へ 戻る。',
      ],
    },
  },
];

/**
 * 書き換える会話。
 *   expectName／expectFirstLine … 事前条件（配列＝旧版と新版の両方を許す＝冪等のため）
 *   name／lines … 省略したら触らない（＝本文温存で印だけ足す形）
 *   linesAfterBoss … 指定したキーだけ差し替え／追加（他のキーは触らない）
 */
const EDITS = [
  // ── field（森・樹海・崖）──
  {
    // 寄道の入口画面。ここで初めて「樹海の岩室」という名前が世界の中で語られる。
    layer: 'field', stage: '0,0', pos: '5,1', home: 'signData',
    expectName: '崖の道標',
    expectFirstLine: ['【岩室の裂け目】', '【樹海の岩室】'],
    lines: [
      '【樹海の岩室】',
      '崖の 岩肌に 割れ目の 跡が ある。',
      '硬い 岩は 爆ぜる 音を 待っている。',   // '!'(3,2) は breakDef 2＝爆弾のみ
    ],
    linesAfterBoss: {
      [K_BOMB]: [
        '【樹海の岩室】',
        '崖の 岩肌の 割れ目――今の {{bomb}} 爆弾なら 砕けよう。',
        '奥に 岩室が 眠っている。',
      ],
    },
    // 2026-09-19 ユーザー決定で `mark: MARK_CAVE` を外した＝**この看板は 0,0 に在る**∴
    // 0,0 を指す印は「目の前の物」を指すだけで「どこへ向かえばいいか」を教えない
    // （印の役目は遠くの行き先だけ）。岩室の場所は `0,2`（北2）と `3,1`（北1西3）が教える。
  },
  {
    // 3行目が `0,0` と同文だった（同じ情報の重複）∴方角に振り替える＝北2 は実測どおり。
    layer: 'field', stage: '0,2', pos: '5,5', home: 'signData',
    expectName: '古道の道標',
    expectFirstLine: '【苔むした古道】',
    lines: [
      '【苔むした古道】',
      'この 石畳は 森の民が 敷いたもの。',
      '北へ 二つ 登れば 崖の 割れ目。',
    ],
    mark: MARK_CAVE,
  },
  {
    // 本文2行は温存（祠・森の民＝世界観）。方角だけ足す（南3 は実測どおり）。
    layer: 'field', stage: '2,1', pos: '8,9', home: 'signData',
    expectName: '森の祠',
    expectFirstLine: '朽ちた祠が苔むしている。',
    lines: [
      '朽ちた祠が苔むしている。',
      '古き森の民が祈りを捧げた場所だという。',
      '南へ 三つ 下れば 森の聖域。',
    ],
    mark: MARK_D6,
  },
  {
    // 食い違い①＝「北へ登れば 崖」（実際は北1西3）「東へ下れば 深き樹海」（東は森が切れる四つ辻）。
    layer: 'field', stage: '3,1', pos: '8,2', home: 'signData',
    expectName: '樹海の道標',
    expectFirstLine: '【樹海の道標】',
    lines: [
      '【樹海の道標】',
      '刈り開いた 先に 古い 道標が 埋もれていた。',
      '「北へ 登り 西へ 辿れば 崖の 割れ目。東は 森が 切れ 四つ辻」',
    ],
    mark: MARK_CAVE,
  },
  {
    // 本文2行は温存（H×2＋showConditions{torchesLit} と一致＝真）。方角＋ロウソクの版。
    layer: 'field', stage: '1,4', pos: '8,2', home: 'signData',
    expectName: '古びた立て札',
    expectFirstLine: '「炎を絶やすな」',
    lines: [
      '「炎を絶やすな」',
      'かがり火にロウソクの火を移せば、森が応えるという。',
      '東へ 一つ 行けば 森の聖域。',
    ],
    linesAfterBoss: {
      [K_CANDLE]: [
        '「炎を絶やすな」',
        'その {{candle}} ロウソクの 火を 二つの かがり火へ 移せ。森が 応える。',
        '東へ 一つ 行けば 森の聖域。',
      ],
    },
    mark: MARK_D6,
  },
  {
    // D6 の現地のしおり。同じ画面にもう1枚（(6,4)【砂漠の神殿】＝帯2 が直した）が居る∴
    // name を分けて呼び分けられるようにする。
    // 版O の「次は北東の雪原へ」は誤り＝D5 入口 `13,5` は南1東11＝東の果て。
    layer: 'field', stage: '2,4', pos: '4,3', home: 'npcData',
    expectName: ['石碑', '森の聖域の石碑'],
    expectFirstLine: '【森の聖域】',
    name: '森の聖域の石碑',
    lines: [
      '【森の聖域】',
      '深い森の奥に潜む謎の聖域。',
      '古代の守護者が星の欠片を秘めているとされる。',
      '閉ざされた 門は 中の 火が 開く。',   // かがり火の門は D6 の内側（`dungeon_6 1,1`）
      '← 入口は左。',
    ],
    linesAfterBoss: {
      O: [
        '【森の聖域】攻略済み。',
        '次は 東の 果て、雪の 原へ。',
        '氷の 廃墟の 壁は {{bomb}} 爆弾で 崩せ。奥に 欠片がある。',
      ],
    },
    // 2026-09-19 ユーザー決定で静的な `mark: MARK_D6` を外した＝この石碑は `field 2,4`
    // ＝森の聖域の入口の画面そのものに在る（自分の画面を指す印は作らない）。踏破後に
    // **次の地（D5）** を指す `markAfterBoss.O` は遠くを指す∴これは残す。
    markAfterBoss: { O: MARK_D5 },
  },
  {
    // 本文温存（西1・穴 'x'×2 とはしご＝真）。印とはしごの版だけ。
    layer: 'field', stage: '3,4', pos: '1,9', home: 'signData',
    expectName: '森の道標',
    expectFirstLine: '西へ行けば 森の聖域。',
    linesAfterBoss: {
      [K_LADDER]: [
        '西へ行けば 森の聖域。',
        'その {{ladder}} はしごを 架ければ この 穴も 渡れる。',
      ],
    },
    mark: MARK_D6,
  },
  {
    // 本文温存（謎かけの型）。印だけ。
    layer: 'field', stage: '3,5', pos: '1,9', home: 'signData',
    expectName: '苔むした石碑',
    expectFirstLine: '「木々の声を聴く者に、森は道を開く」',
    mark: MARK_D6,
  },
  {
    // 食い違い＝「石畳が円を描いている」＝実際は 'o' が3マスだけ（円ではない）。
    layer: 'field', stage: '2,8', pos: '1,9', home: 'signData',
    expectName: '森の奥の遺構',
    expectFirstLine: ['崩れた石畳が円を描いている。', '崩れた 石畳が 点々と 残っている。'],
    lines: [
      '崩れた 石畳が 点々と 残っている。',
      'かつてここに聖樹の社があったのかもしれない。',
      '北へ 四つ 戻れば 森の聖域。',
    ],
    mark: MARK_D6,
  },

  // ── dungeon_6（森の聖域）──
  {
    // 旧本文は1つの文字列の中に改行を埋め込んでいた（2行に割れていない）。
    // 門 '>'(4,9)＝東側・showConditions{torchesLit}・H×3 と一致。
    layer: 'dungeon_6', stage: '1,1', pos: '8,1', home: 'signData',
    expectName: '聖樹のかがり火の間',
    expectFirstLine: ['全ての火を灯せ。\n道が開ける。', '【聖樹のかがり火の間】'],
    lines: [
      '【聖樹のかがり火の間】',
      '三つの 火が 揃うまで、東の 門は 開かぬ。',
      '灯を 持つ 者だけが 巨人の 間へ 進める。',
    ],
  },
  {
    // name:"ヒント" の3枚目のうち1枚。部屋の実物＝F センチネル（槍・range 4）。
    // 盾は enemy の投擲物と同じ共通経路で効く（projectile.js の isShieldBlockingDir）＝真。
    layer: 'dungeon_6', stage: '2,1', pos: '8,1', home: 'signData',
    expectName: ['ヒント', '槍衾の 覚え書き'],
    expectFirstLine: ['盾でガードせよ。', '長柄の 番兵が 遠くから 突いてくる。'],
    name: '槍衾の 覚え書き',
    lines: [
      '長柄の 番兵が 遠くから 突いてくる。',
      '{{shield}} 盾を 正面に 立てれば 穂先は 弾ける。',
    ],
  },
  {
    // 旧本文も改行埋め込み。部屋の実物＝櫃(2,5) に爆弾／'!'(1,5)(1,6) が北の唯一の道を塞ぐ。
    layer: 'dungeon_6', stage: '1,2', pos: '8,1', home: 'signData',
    expectName: ['ヒント', '爆弾の 櫃の 間'],
    expectFirstLine: ['壁を打ち砕く力を\n森が授ける。', '此処の 櫃に 森の 授け物＝{{bomb}} 爆弾が 眠る。'],
    name: '爆弾の 櫃の 間',
    lines: [
      '此処の 櫃に 森の 授け物＝{{bomb}} 爆弾が 眠る。',
      '北を 塞ぐ 二枚の 岩壁は それでしか 崩れぬ。',
    ],
  },
  {
    // 本文は温存（3行目が weakness-hints ② の不変条件）。踏破後の印だけ足す＝
    // 帯4 が `dungeon_4 1,3 (3,5)` にやったのと同じ「次の地を指す」導線。
    layer: 'dungeon_6', stage: '1,3', pos: '3,5', home: 'signData',
    expectName: '森の聖域・入口の石碑',
    expectFirstLine: 'ここは古森の巨人が眠る聖域。',
    markAfterBoss: { O: MARK_D5 },
  },
  {
    // 同じ部屋の石碑(3,5) と内容が重複していた（炎と爆弾を二度言う）∴入口室の手記の型に替える
    // （D2「砂に埋もれた手記」／D3「水に滲んだ手記」と同じ位置づけ・番号はボス部屋系列だけの物）。
    layer: 'dungeon_6', stage: '1,3', pos: '1,9', home: 'npcData',
    expectName: ['森の聖域の入口', '森に 遺された 手記'],
    expectFirstLine: ['ロウソクの炎が 道を開く。', '森の民は 聖樹の 火を 絶やさぬ 番人だった。'],
    name: '森に 遺された 手記',
    lines: [
      '森の民は 聖樹の 火を 絶やさぬ 番人だった。',
      '巨人は その 守り手として 遺されたはずだ。',
      '心を 失った 王が 番人を 魔物へ 変えた 日に、火は 消えた。',
    ],
  },
  {
    // name:"ヒント" ＋「石を押して スイッチを踏め。」は `dungeon_4 3,3`／`dungeon_7 3,0` と同文だった
    // ∴文を変えて重複を解く（'S' は踏み板＝スイッチ 'Y' ではない。「ボタン」は検査③の禁止語）。
    layer: 'dungeon_6', stage: '3,0', pos: '7,1', home: 'signData',
    expectName: ['ヒント', '石と 門の 刻み文'],
    expectFirstLine: ['石を押して スイッチを踏め。', '一つの 石、一つの 踏み板。'],
    name: '石と 門の 刻み文',
    lines: [
      '一つの 石、一つの 踏み板。',
      '石が 板を 押さえている 間だけ 門は 上がる。',
    ],
  },

  // ── forest_cave（樹海の岩室）──
  {
    // 既存4行は実物と一致（岩溝2本・石車2つ・恒久ロック）∴温存し、語っていなかった
    // 西の爆弾壁（breakableWalls{"7,2":{breakDef:2}}）だけ足す。
    layer: 'forest_cave', stage: '0,0', pos: '7,5', home: 'signData',
    expectName: '石車の碑',
    expectFirstLine: '【石車の前室】',
    lines: [
      '【石車の前室】',
      '二つの岩溝に 石車を落とせ。',
      '二つとも据わったとき 門は開いたまま止まる。',
      '片方と己の足では 門は待ってくれない。',
      '西の 岩壁は 爆ぜる 音を 待っている。',
    ],
  },
  {
    // 3行目「灯を持つ者だけが ここへ来られる」＝この部屋に**来る**のに灯は要らない
    // （必要なのは石車2つ）∴「壁が開かぬ」に直す。承認 #3 ＝報酬の名前（銅の剣）を出す。
    layer: 'forest_cave', stage: '1,0', pos: '2,6', home: 'signData',
    expectName: '岩室の碑',
    expectFirstLine: '【かがり火の岩室】',
    lines: [
      '【かがり火の岩室】',
      '三つの火が揃うまで 壁は宝を離さない。',
      '灯を 持たぬ 者に この 壁は 開かぬ。',
      '{{sword}} 銅の 剣が 眠るという。',
    ],
  },
];

// ── ここから下は道具 ──────────────────────────────────────

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const asList = (v) => (Array.isArray(v) ? v : [v]);

function stageOf(layer, stage) {
  const st = map.layers?.[layer]?.stages?.[stage];
  if (!st) throw new Error(`ステージが無い: ${layer} ${stage}`);
  return st;
}

/** tiles は「文字配列の配列」＝行を文字列にすると実ゲームが落ちる（[[field-tiles-are-char-arrays]]）。 */
function setTile(st, pos, ch) {
  const [r, c] = pos.split(',').map(Number);
  if (!Array.isArray(st.tiles[r])) throw new Error(`tiles[${r}] が文字配列でない`);
  st.tiles[r][c] = ch;
}
function tileAt(st, pos) {
  const [r, c] = pos.split(',').map(Number);
  const row = st.tiles[r];
  return (Array.isArray(row) ? row : String(row).split(''))[c];
}

let created = 0, updated = 0, skipped = 0;

// ── 新設 ─────────────────────────────────────────────────
for (const c of CREATES) {
  const st = stageOf(c.layer, c.stage);
  const home = (st[c.home] ??= {});
  const cur = home[c.pos];
  const want = {
    name: c.name,
    lines: c.lines,
    ...(c.linesAfterBoss ? { linesAfterBoss: c.linesAfterBoss } : {}),
    ...(c.mark ? { mark: c.mark } : {}),
  };
  if (cur && eq(cur, want) && tileAt(st, c.pos) === 'i') {
    console.log(`  skip  新設済み ${c.layer} ${c.stage} (${c.pos}) ${c.name}`);
    skipped++;
    continue;
  }
  // 事前条件＝まだ何も無い床（既に別の会話が居るなら黙って潰さない）
  if (cur && cur.name !== c.name) {
    throw new Error(`${c.layer} ${c.stage} (${c.pos}) に別の会話が居る: ${JSON.stringify(cur.name)}`);
  }
  const t = tileAt(st, c.pos);
  if (t !== '.' && t !== 'i') {
    throw new Error(`${c.layer} ${c.stage} (${c.pos}) のタイルが '.' でない: '${t}'`);
  }
  setTile(st, c.pos, 'i');
  home[c.pos] = want;
  console.log(`  作成  ${c.layer} ${c.stage} (${c.pos}) ${c.name}${c.mark ? ' ＋印' : ''}`);
  created++;
}

// ── 書き換え ─────────────────────────────────────────────
for (const e of EDITS) {
  const st = stageOf(e.layer, e.stage);
  const entry = st[e.home]?.[e.pos];
  if (!entry) throw new Error(`会話が無い: ${e.layer} ${e.stage} (${e.pos}) [${e.home}]`);
  if (Array.isArray(entry)) throw new Error(`${e.layer} ${e.stage} (${e.pos}) が古い文字列配列形式`);

  // 事前条件（旧版・新版のどちらでも通す＝冪等）
  if (!asList(e.expectName).includes(entry.name)) {
    throw new Error(`name が想定と違う: ${e.layer} ${e.stage} (${e.pos}) = ${JSON.stringify(entry.name)}`);
  }
  if (!asList(e.expectFirstLine).includes(entry.lines?.[0])) {
    throw new Error(`1行目が想定と違う: ${e.layer} ${e.stage} (${e.pos}) = ${JSON.stringify(entry.lines?.[0])}`);
  }
  // 読める位置か（'i' か NPC タイル）＝死データを作らない
  const t = tileAt(st, e.pos);
  if (!'iPab$'.includes(t)) {
    throw new Error(`${e.layer} ${e.stage} (${e.pos}) のタイル '${t}' は読めない`);
  }

  let changed = false;
  if (e.name !== undefined && entry.name !== e.name) { entry.name = e.name; changed = true; }
  if (e.lines !== undefined && !eq(entry.lines, e.lines)) { entry.lines = e.lines; changed = true; }
  if (e.linesAfterBoss) {
    const lab = (entry.linesAfterBoss ??= {});
    for (const [k, v] of Object.entries(e.linesAfterBoss)) {
      if (!eq(lab[k], v)) { lab[k] = v; changed = true; }
    }
  }
  if (e.mark && !eq(entry.mark, e.mark)) { entry.mark = e.mark; changed = true; }
  if (e.markAfterBoss) {
    const mab = (entry.markAfterBoss ??= {});
    for (const [k, v] of Object.entries(e.markAfterBoss)) {
      if (!eq(mab[k], v)) { mab[k] = v; changed = true; }
    }
  }
  if (!changed) { console.log(`  skip  変化なし ${e.layer} ${e.stage} (${e.pos}) ${entry.name}`); skipped++; continue; }
  console.log(`  更新  ${e.layer} ${e.stage} (${e.pos}) ${entry.name}`);
  updated++;
}

if (created + updated === 0) {
  console.log(`\n変更なし（skip ${skipped} 件）＝既に適用済み。`);
  process.exit(0);
}

writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き込み: ${MAP_PATH}（作成 ${created} / 更新 ${updated} / skip ${skipped}）`);

// ── 自己検証（書いた後に読み直す）────────────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const errs = [];

for (const c of CREATES) {
  const st = after.layers[c.layer].stages[c.stage];
  if (tileAt(st, c.pos) !== 'i') errs.push(`${c.layer} ${c.stage} (${c.pos}) が 'i' でない`);
  const en = st[c.home]?.[c.pos];
  if (!en || en.name !== c.name || !eq(en.lines, c.lines)) errs.push(`新設が読み直せない: ${c.layer} ${c.stage} (${c.pos})`);
}
for (const e of EDITS) {
  const st = after.layers[e.layer].stages[e.stage];
  const en = st[e.home]?.[e.pos];
  if (!en) { errs.push(`書き換えが消えた: ${e.layer} ${e.stage} (${e.pos})`); continue; }
  if (e.name !== undefined && en.name !== e.name) errs.push(`name 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  if (e.lines !== undefined && !eq(en.lines, e.lines)) errs.push(`lines 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  for (const [k, v] of Object.entries(e.linesAfterBoss ?? {})) {
    if (!eq(en.linesAfterBoss?.[k], v)) errs.push(`版 ${k} 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  }
  if (e.mark && !eq(en.mark, e.mark)) errs.push(`印 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  for (const [k, v] of Object.entries(e.markAfterBoss ?? {})) {
    if (!eq(en.markAfterBoss?.[k], v)) errs.push(`踏破後の印 ${k} 不一致: ${e.layer} ${e.stage} (${e.pos})`);
  }
}

// 触らないと決めたものが動いていないか（帯5 の不可侵＝3件）
const KEEP = [
  { layer: 'dungeon_6', stage: '0,0', pos: '1,5', home: 'signData', name: 'ザーネルの記憶 其の五' },
  { layer: 'field', stage: '2,4', pos: '6,4', home: 'npcData', name: '石碑', first: '【砂漠の神殿】' },
  { layer: 'field', stage: '2,0', pos: '6,2', home: 'signData', name: '風の環状列石' },
];
for (const k of KEEP) {
  const en = after.layers[k.layer].stages[k.stage][k.home]?.[k.pos];
  if (!en || en.name !== k.name) { errs.push(`不可侵のエントリが変わった: ${k.layer} ${k.stage} (${k.pos})`); continue; }
  if (k.first && en.lines?.[0] !== k.first) errs.push(`不可侵の本文が変わった: ${k.layer} ${k.stage} (${k.pos})`);
  if (en.mark) errs.push(`不可侵のエントリに印が付いた: ${k.layer} ${k.stage} (${k.pos})`);
}
// weakness-hints ② の不変条件（O 古森の巨人＝名前＋炎が同じ1行）
{
  const sd = after.layers.dungeon_6.stages['1,3'].signData?.['3,5'];
  const ok = (sd?.lines ?? []).some((t) => /古森|巨人/.test(t) && /[炎火灯焼]/.test(t));
  if (!ok) errs.push('dungeon_6 1,3 (3,5) に「巨人＋炎」が同じ行に無い（weakness-hints ② が落ちる）');
}

// tiles が文字配列のまま（[[field-tiles-are-char-arrays]]）
for (const [ln, ld] of Object.entries(after.layers)) {
  for (const [sk, st] of Object.entries(ld.stages ?? {})) {
    for (let r = 0; r < (st.tiles ?? []).length; r++) {
      if (!Array.isArray(st.tiles[r])) { errs.push(`${ln} ${sk} tiles[${r}] が文字配列でない`); break; }
    }
  }
}

// マップ全体の印の行き先が実在するか（会話 1 件に静的＋踏破後の複数）
let markCount = 0;
for (const [ln, ld] of Object.entries(after.layers)) {
  for (const [sk, st] of Object.entries(ld.stages ?? {})) {
    for (const home of ['signData', 'npcData']) {
      for (const [pos, en] of Object.entries(st[home] ?? {})) {
        if (!en || Array.isArray(en)) continue;
        const marks = [en.mark, ...Object.values(en.markAfterBoss ?? {})].filter(Boolean);
        for (const m of marks) {
          markCount++;
          const norm = normalizeDialogMarks({ mark: m }, ln)[0] ?? { layer: m.layer ?? ln, stage: m.stage };
          if (!after.layers[norm.layer]?.stages?.[norm.stage]) {
            errs.push(`印の行き先が無い: ${ln} ${sk} (${pos}) → ${norm.layer} ${norm.stage}`);
          }
        }
      }
    }
  }
}

if (errs.length) {
  console.error('\n❌ 自己検証で不整合:');
  for (const m of errs) console.error(`   - ${m}`);
  process.exit(1);
}
console.log(`✅ 自己検証 OK（マップ全体の印 ${markCount} 件すべて実在する画面を指している）`);
