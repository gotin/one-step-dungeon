// tests/audit-balance-boss-profile.spec.js – 数値監査のボス判定（実行キュー 0d-2.9・2026-08-25）
//
// 何のためのテストか：`scripts/audit-balance.mjs` は 2026-08-24 まで**すべての敵を `min`
// （そのレイヤーへ入った瞬間の装備）で判定**していた。ボスにこれを当てるのは
// 「D1 の革の鎧も木の盾もハートの器も捨ててボス部屋へ直行する」という起こらない下限で、
// ユーザーの実プレイ報告（2026-08-25「実際これどうやって D1 min 装備で倒せばいいと思う？」）の
// 真因がこの取り違えだった。∴ボスの行は「ボス直前」（min ＋ ボス部屋の外の報酬）で測る。
//
// 併せて「ボス部屋に居ないボス」＝中ボス（道中に複数回出る）をボス帯 30〜60 振りで測るのを止める。
// **中ボスの一覧は手書きしない**＝実マップの `isBossRoom` から導出する（このテストも独立に
// 実マップから導出して突き合わせる＝スクリプト側にタイル文字を書いたら落ちる）。
//
// 検証内容：
//   ①: 判定プロファイルの割り当て＝ボスだけ「ボス直前」／雑魚・中ボスは min
//   ②: G 岩のゴーレムが「ボス直前」の諸元（革の鎧・木の盾・器1）で測られている
//       （min なら DEF 0・最大HP 6＝過去の誤った下限に戻ったら落ちる）
//   ③: 中ボスの分類が実マップの `isBossRoom` から導出されている（手書きのタイル文字が無い）
//   ④: ボス部屋が ORDER の外にあるボス（field の { 海の主）は min に落ちるが**黙って落ちない**
//   ⑤: 帯と閾値の整合＝中ボスは下限だけボスより緩い／MELT の床も中ボスの方が低い
//   ⑥: 欠陥 0 件（0d-2.9 の完了条件＝数値を戻さずに W の BOSS_MELT が消える）

import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENEMY_META } from '../shared/enemies.js';
import { ARMOR_TIERS, BASE_DEF, BASE_ATK, SWORD_TIERS } from '../shared/items.js';
import { HP_PER_HEART, SWORD_COOLDOWN_MS, INVINCIBLE_MS } from '../game/constants.js';
import { ORDER, presetsFrom } from '../shared/progression.js';

const repoFile = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readRepo = (rel) => readFileSync(repoFile(rel), 'utf8');

const MAP = JSON.parse(readRepo('../work/blade-of-lumia.json'));
const AUDIT_SRC = readRepo('../scripts/audit-balance.mjs');

const REPORT = JSON.parse(execFileSync('node', [repoFile('../scripts/audit-balance.mjs'), '--json'], {
  cwd: repoFile('..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}));
const rowOf = (tile) => REPORT.encounters.find((r) => r.tile === tile);

// ── テスト側でも実マップから独立に導出する（スクリプトの答え合わせをしない）──────
// 敵タイルごとに「ボス部屋（isBossRoom）の中に1体でも置かれているか」を数える。
// 検証ステージ（test_mechanics）は進行に存在しない∴監査と同じく除外する。
function bossRoomTilesFromMap() {
  const inBossRoom = new Set();
  const placed = new Set();
  for (const [layerName, layer] of Object.entries(MAP.layers)) {
    if (layerName === 'test_mechanics') continue;
    for (const st of Object.values(layer.stages ?? {})) {
      for (const row of st.tiles ?? []) {
        for (const ch of (Array.isArray(row) ? row : String(row).split(''))) {
          if (!ENEMY_META[ch]) continue;
          placed.add(ch);
          if (st.isBossRoom) inBossRoom.add(ch);
        }
      }
    }
  }
  return { inBossRoom, placed };
}

test.describe('数値監査：ボスは「ボス直前」で測る（0d-2.9）', () => {

  test('①: 判定プロファイルはボスだけ「ボス直前」（雑魚・中ボスは min）', () => {
    expect(REPORT.encounters.length, '遭遇表が空（監査が走っていない）').toBeGreaterThan(0);
    for (const r of REPORT.encounters) {
      if (r.kind === 'boss') continue;
      expect(r.judgeVariant, `${r.tile} ${r.name}（${r.kind}）が min 以外で判定されている`).toBe('min');
    }
    // ボスは「ボス直前」が作れる限りそちらで測る＝作れない例外は ④ で個別に固定する
    const bosses = REPORT.encounters.filter((r) => r.kind === 'boss');
    expect(bosses.length, 'ボスの行が無い').toBeGreaterThan(0);
    const byVariant = bosses.filter((r) => r.judgeVariant === 'boss').map((r) => r.tile);
    expect(byVariant.length, 'ボス直前で測られたボスが1体も無い').toBeGreaterThan(0);
    // 判定プロファイルは ORDER 上の地点（＝初遭遇地点）の boss variant と一致する
    const presets = presetsFrom(MAP);
    for (const r of bosses) {
      const p = presets.find((x) => x.id === r.at);
      if (r.judgeVariant !== 'boss') continue;
      expect(p.boss, `${r.tile}: ${r.at} にボス直前が無いのにボス直前で測っている`).not.toBeNull();
      expect(r.def.judge, `${r.tile}: 判定 DEF がボス直前の防具ティアと違う`)
        .toBe(BASE_DEF + (p.boss.armor >= 0 ? ARMOR_TIERS[p.boss.armor].def : 0));
      expect(r.maxHp.judge, `${r.tile}: 判定の最大HP がボス直前のハート数と違う`)
        .toBe(p.boss.hearts * HP_PER_HEART);
      expect(r.atk.judge, `${r.tile}: 判定 ATK がボス直前の剣ティアと違う`)
        .toBe(BASE_ATK + SWORD_TIERS[p.boss.sword].atk);
    }
  });

  test('②: G 岩のゴーレムは「ボス直前」の諸元で測られる（min の誤った下限に戻ったら落ちる）', () => {
    const g = rowOf('G');
    expect(g, 'G の行が無い').toBeTruthy();
    expect(g.kind, 'G がボスに分類されていない').toBe('boss');
    expect(g.at, 'G の初遭遇地点が D1 でない').toBe('dungeon_1');
    expect(g.judgeVariant, 'G が min で判定されている（0d-2.9 で直した取り違え）').toBe('boss');

    // D1 ボス直前＝革の鎧 tier0・木の盾 tier0・ハートの器1（実マップ：ボス部屋 0,0 の外）
    const d1 = REPORT.checkpoints.find((c) => c.id === 'dungeon_1');
    expect(d1.boss.armor,  'D1 ボス直前で革の鎧を持っていない').toBe(0);
    expect(d1.boss.shield, 'D1 ボス直前で木の盾を持っていない').toBe(0);
    expect(d1.boss.hearts, 'D1 ボス直前のハート数（3 ＋ ボス部屋の外の器1）').toBe(4);

    // 判定の諸元＝DEF 1 / 最大HP 8（min は DEF 0 / 最大HP 6＝ここが差＝テストの歯）
    expect(g.def.judge,   'G の判定 DEF が革の鎧ぶん（+1）乗っていない').toBe(BASE_DEF + ARMOR_TIERS[0].def);
    expect(g.maxHp.judge, 'G の判定の最大HP がハート4ぶんでない').toBe(4 * HP_PER_HEART);
    expect(d1.min.def,    'D1 min の DEF（判定と同じなら差が無い＝このテストは歯を失う）').toBe(BASE_DEF);
    expect(d1.min.maxHp,  'D1 min の最大HP').toBe(3 * HP_PER_HEART);
    expect(g.def.judge).toBeGreaterThan(d1.min.def);
    expect(g.maxHp.judge).toBeGreaterThan(d1.min.maxHp);

    // 被弾側もボス直前で出る＝1発 max(1, G の atk - DEF)・死ぬまでの被弾回数と TTD
    const perHit = Math.max(1, ENEMY_META.G.atk - g.def.judge);
    expect(g.judge.perHit, 'G の1発ダメージが判定 DEF から出ていない').toBe(perHit);
    expect(g.judge.hits,   'G に何発で死ぬかが判定の最大HP から出ていない')
      .toBe(Math.ceil(g.maxHp.judge / perHit));
    expect(g.judge.ttdMs,  'TTD が無敵時間の床を踏んでいない').toBe(g.judge.hits * INVINCIBLE_MS);

    // 攻撃側＝剣ティアはボス直前でも木の剣（D1 の中に剣は無い）∴振り数は min と同じ
    const swordDmg = Math.max(1, g.atk.judge - ENEMY_META.G.def);
    expect(g.judge.swings, 'G の振り数が実データ（hp / 1振りダメージ）と違う')
      .toBe(Math.ceil(ENEMY_META.G.hp / swordDmg));
    expect(g.judge.ttkMs).toBe(g.judge.swings * SWORD_COOLDOWN_MS);
    expect(g.flags, 'G に欠陥が出ている（ボス直前で測れば帯の中）').toEqual([]);
  });

  test('③: 中ボス＝ボス部屋に居ないボス（実マップから導出・スクリプトに手書きしない）', () => {
    const { inBossRoom, placed } = bossRoomTilesFromMap();
    // テスト側の導出（実マップ）と監査の分類が一致する
    const wantMid = [...placed].filter((t) => ENEMY_META[t].isBoss && !inBossRoom.has(t)).sort();
    const wantBoss = [...placed].filter((t) => ENEMY_META[t].isBoss && inBossRoom.has(t)).sort();
    const gotMid  = REPORT.encounters.filter((r) => r.kind === 'midBoss').map((r) => r.tile).sort();
    const gotBoss = REPORT.encounters.filter((r) => r.kind === 'boss').map((r) => r.tile).sort();
    expect(gotMid,  '中ボスの集合が実マップの isBossRoom から導出できていない').toEqual(wantMid);
    expect(gotBoss, 'ボスの集合が実マップの isBossRoom から導出できていない').toEqual(wantBoss);
    // 2026-08-25 の実データ＝W 魔物（D1/D2/D7/cave_1 の道中）と V 魔将（dark_tower 2,3・3,3）
    expect(wantMid, '中ボスが実データと違う（マップを動かしたなら記述も直す）').toEqual(['V', 'W']);

    // `isBoss` だけでは分けられない＝両者とも isBoss true（フラグ頼みだとボス帯で測ってしまう）
    for (const t of wantMid) expect(ENEMY_META[t].isBoss, `${t} は isBoss でない`).toBe(true);

    // スクリプトが分類にタイル文字を手書きしていない（`isBossRoom` から導出する）
    expect(AUDIT_SRC, '監査が isBossRoom を見ていない').toContain('isBossRoom');
    const classify = AUDIT_SRC.slice(AUDIT_SRC.indexOf('function kindOf'));
    const body = classify.slice(0, classify.indexOf('\n}'));
    for (const t of [...wantMid, ...wantBoss]) {
      expect(body, `kindOf に ${t} が手書きされている（実マップから導出していない）`)
        .not.toContain(`'${t}'`);
    }
  });

  test('④: ボス部屋が進行順の外にあるボスは min に落ちるが、判定列にそう出る', () => {
    // `{ 海の主` のボス部屋は field（ORDER では「開始直後」＝レイヤー無し）∴ボス直前が作れない。
    const sea = rowOf('{');
    expect(sea, '{ 海の主 の行が無い').toBeTruthy();
    expect(sea.kind, '{ 海の主 がボスに分類されていない（field のボス部屋に居る）').toBe('boss');
    expect(sea.inBossRoom, '{ 海の主 がボス部屋に居ることを拾えていない').toBe(true);
    expect(sea.judgeVariant, 'ボス直前が作れないのに boss で測ったことになっている').toBe('min');
    expect(REPORT.checkpoints.find((c) => c.id === sea.at).boss,
      '開始直後にボス直前が生えている').toBeNull();
    // 「判定」列が人の目に見える＝黙って min に落とさない（表側の固定）
    const text = execFileSync('node', [repoFile('../scripts/audit-balance.mjs')], {
      cwd: repoFile('..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    expect(text, '遭遇表にボス直前の判定列が出ていない').toContain('ボス直前');
    expect(text, '遭遇表が中ボスを分けていない').toContain('遭遇表：中ボス');
    const seaLine = text.split('\n').find((l) => l.startsWith('  { 海の主'));
    expect(seaLine, '{ 海の主 の行が表に出ていない').toBeTruthy();
    expect(seaLine, '{ 海の主 の判定が min であることが表から読めない').toContain('min');
  });

  test('⑤: 中ボスの帯は下限だけボスより緩い／MELT の床も中ボスの方が低い', () => {
    // 帯・閾値はスクリプト内の定数∴静的に読む（数値の写しをここに増やさない）。
    const band = (key) => {
      const m = AUDIT_SRC.match(new RegExp(`${key}:\\s*\\[(\\d+),\\s*(\\d+)\\]`));
      expect(m, `${key} の帯が読めない`).toBeTruthy();
      return [Number(m[1]), Number(m[2])];
    };
    const mid = band('midBossSwings'), boss = band('bossSwings');
    expect(mid[0], '中ボスの下限がボスより緩くない（道中で複数回出る敵にボスの長さを課している）')
      .toBeLessThan(boss[0]);
    expect(mid[1], '中ボスの上限がボスと違う（殴る時間の水増しは同じ基準で見る）').toBe(boss[1]);
    expect(mid[0], '中ボスの下限が雑魚の上限（6振り）以下＝雑魚と区別がつかない').toBeGreaterThan(6);

    const melt = (key) => {
      const m = AUDIT_SRC.match(new RegExp(`${key}:[^\\n]*ttkMs < (\\d+)`));
      expect(m, `${key} の閾値が読めない`).toBeTruthy();
      return Number(m[1]);
    };
    expect(melt('MIDBOSS_MELT'), '中ボスの MELT の床がボスと同じ（道中の敵にボスの床を課している）')
      .toBeLessThan(melt('BOSS_MELT'));
    // 実データ＝W 16振り／V 48振り＝どちらも中ボスの帯の中（V は 2026-08-24 に【現状維持】確定）
    for (const t of ['W', 'V']) {
      const r = rowOf(t);
      expect(r.judge.swings, `${t} が中ボスの帯 ${mid.join('〜')} の外`).toBeGreaterThanOrEqual(mid[0]);
      expect(r.judge.swings, `${t} が中ボスの帯 ${mid.join('〜')} の外`).toBeLessThanOrEqual(mid[1]);
      expect(r.flags, `${t} に欠陥が出ている`).toEqual([]);
    }
  });

  test('⑥: 判定プロファイルでの欠陥は 0 件（数値を戻さずに W の BOSS_MELT が消えた）', () => {
    const listed = REPORT.defects.map((r) => `${r.tile} ${r.name} ${r.flags.join(',')}`);
    expect(listed, `欠陥が残っている: ${listed.join(' / ')}`).toEqual([]);
    // W の HP は 0d-2.8 で下げた値のまま（監査を通すために戻していない）
    expect(ENEMY_META.W.hp, 'W の HP が 0d-2.8 の調整前に戻っている').toBe(48);
    // 全地点ぶんのボス直前が checkpoints に載っている（ボス部屋を持つレイヤーだけ）
    const withBoss = REPORT.checkpoints.filter((c) => c.boss).map((c) => c.id);
    expect(withBoss, 'ボス直前を持つ地点が実データと違う')
      .toEqual(ORDER.filter((o) => presetsFrom(MAP).find((p) => p.id === o.id).boss).map((o) => o.id));
  });

});
