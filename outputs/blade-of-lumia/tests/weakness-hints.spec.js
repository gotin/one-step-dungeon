import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { bfsLayer, findEntrances, firstWalkable, SOLVABLE_GATES } from '../scripts/lib/connectivity.mjs';
import { ENEMY_META } from '../shared/enemies.js';
import { READABLE_SIGN_TILES } from '../shared/tiles.js';
import { SWORD_TIERS } from '../shared/items.js';
import { ORDER, presetsFrom } from '../shared/progression.js';
import { WEAKNESS_ITEM } from '../scripts/lib/enemy-placement.mjs';

// Phase 8-4 (4) 0d-2.11 (A)（2026-08-27）＝**ボスの弱点を本編の中で知れるか**の番人。
//
// 守るのは文面ではなく2つの構造：
//   ① 弱点は、その敵と戦う地点で**撃てる**種別であること（＝死んだ弱点を作らない）
//   ② 入口からボス部屋までの**強制経路**に、その弱点を示す本文が1件以上あること
//
// ⚠️ 敵・部屋・経路・所持品はすべて `ENEMY_META` / 実マップ / `shared/progression.js` から
//    **導出**する（敵一覧・部屋キー・持ち物の手書き表を作らない＝手書き表は必ず腐る。
//    敵タイル一覧を手で数えて13タイル漏らした前例がある）。
//
// ①が無いと②は無意味になる＝「矢で射抜け」と書いてあるのに弓を持てない地点なら、
// ヒントは嘘になる。実際にこのテストを書く時点で G（爆弾＝D6 の報酬なのに D1 のボス）と
// J（光の刃＝剣ティア1なのに D3 のボス）の2体が嘘だった∴弱点そのものを差し替えた。

const MAP = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const PRESETS = presetsFrom(MAP);

/** 弱点持ちのボス × それが実際に置かれている本編レイヤー（test_mechanics は検証用∴除く） */
function bossTargets() {
  const out = [];
  for (const [tile, meta] of Object.entries(ENEMY_META)) {
    if (!meta.isBoss || !meta.weakness) continue;
    for (const [layer, l] of Object.entries(MAP.layers ?? {})) {
      if (layer === 'test_mechanics') continue;
      const rooms = Object.entries(l.stages ?? {})
        .filter(([, s]) => (s.tiles ?? []).some((row) => [...row].includes(tile)))
        .map(([k]) => k);
      for (const room of rooms) out.push({ tile, meta, layer, room });
    }
  }
  return out;
}

const TARGETS = bossTargets();

/**
 * その弱点を「この地点で撃てるか」＝進行順から導出する。
 *   window 付き（例：攻撃硬直に斬る）… 道具が要らない∴常に撃てる
 *   'sword' … 木の剣は必携（profilesAt が min にも入れる）
 *   'beam'  … 剣のティアが光の刃を撃てるか（`shared/items.js` から導出）
 *   その他  … `WEAKNESS_ITEM` の道具をボス戦の時点で持っているか
 */
function actionable(target) {
  const w = target.meta.weakness;
  const i = ORDER.findIndex((cp) => cp.layer === target.layer);
  const profile = (i >= 0 ? (PRESETS[i]?.boss ?? PRESETS[i]?.min) : null);
  if (!profile) return { ok: false, how: `進行順に ${target.layer} が無い` };
  if (w.window) return { ok: true, how: `窓（${w.window}）＝道具不要` };
  if (w.type === 'sword') return { ok: true, how: '剣は必携' };
  if (w.type === 'beam') {
    return { ok: !!SWORD_TIERS[profile.sword]?.beam, how: `swordTier=${profile.sword}` };
  }
  const item = WEAKNESS_ITEM[w.type];
  return { ok: !!item && profile.items.includes(item), how: `${item ?? '(表に無い)'} ⊂ [${profile.items}]` };
}

/** 入口からボス部屋への強制経路（塞ぐと到達不能になる部屋）＝入口・関節・ボス部屋 */
function forcedRoute({ layer, room }) {
  const stages = MAP.layers[layer].stages;
  const entrance = findEntrances(MAP, layer)[0];
  const start = { stage: entrance, ...firstWalkable(stages[entrance]) };
  // ゲート（鍵扉・スイッチ扉・爆弾壁・ボス扉）は「いずれ開く」前提で開けて歩く＝
  // 閉じたままだとボス部屋がそもそも到達不能になり「全部屋が関節」に化ける。
  const opts = { withLadder: true, openTiles: SOLVABLE_GATES, followMapEnters: true };
  const joints = Object.keys(stages).filter((k) => {
    if (k === entrance || k === room) return false;
    return !bfsLayer(stages, start, { ...opts, blockedRoom: k }).reachedRooms.has(room);
  });
  return [entrance, ...joints, room];
}

/** 弱点を示す「行い」の語彙＝道具名の説明ではなく行いで書く（D7 の先例） */
const WEAKNESS_WORDS = {
  sword:     /[隙斬硬直止]/,
  arrow:     /[矢弓射]/,
  fire:      /[炎火灯焼]/,
  boomerang: /(ブーメラン|[刃旋投])/,
  bomb:      /[爆砕]/,
  beam:      /[光閃]/,
};

/** 敵の名前を「の」で割った部分＝どの敵の話かを指す語（岩のゴーレム → 岩 / ゴーレム） */
function nameSegments(name) {
  return name.split('の').filter((s) => s.length > 0);
}

test.describe('Blade of Lumia – ボスの弱点は本編で知れる（0d-2.11 (A)）', () => {
  test('０ 弱点持ちのボスが本編に居る（導出が空振りしていない）', () => {
    expect(TARGETS.length).toBeGreaterThanOrEqual(8);
  });

  for (const target of TARGETS) {
    const label = `${target.tile} ${target.meta.name} / ${target.layer} ${target.room}`;

    test(`① ${label} の弱点は その地点で撃てる`, () => {
      const { ok, how } = actionable(target);
      const w = target.meta.weakness;
      expect(ok, `${label} の弱点 ${w.type}${w.window ? `/${w.window}` : ''} は撃てない（${how}）` +
        '＝死んだ弱点。弱点を差し替えるか、道具の入手順を変える').toBe(true);
    });

    test(`② ${label} の強制経路に弱点を示す本文がある`, () => {
      const w = target.meta.weakness;
      const words = WEAKNESS_WORDS[w.type];
      expect(words, `弱点 ${w.type} の語彙が WEAKNESS_WORDS に無い`).toBeTruthy();
      const segs = nameSegments(target.meta.name);
      const route = forcedRoute(target);
      const lines = route.flatMap((k) => Object.entries(MAP.layers[target.layer].stages[k].signData ?? {})
        .flatMap(([pk, sd]) => (Array.isArray(sd?.lines) ? sd.lines.map((t) => ({ k, pk, t })) : [])));
      // 敵の名（の一部）と、効く行いが**同じ行**にあること＝「誰に何をするか」が1行で読める。
      const hit = lines.find(({ t }) => segs.some((s) => t.includes(s)) && words.test(t));
      expect(hit, `${label}：強制経路 [${route.join(' ')}] に「${segs.join('/')}」と ` +
        `${w.type} の行いを同じ行に書いた立札が無い\n読める行:\n` +
        lines.map(({ k, pk, t }) => `  ${k}@${pk} ${t}`).join('\n')).toBeTruthy();
      // 本文つきの立札は読める立て物（看板 'i'・石碑 '†'・転移の石碑 '‡'＝キュー27）の上＝実際に読める位置にあること。
      const s = MAP.layers[target.layer].stages[hit.k];
      const [r, c] = hit.pk.split(',').map(Number);
      expect(READABLE_SIGN_TILES.has(s.tiles[r][c]), `${hit.k}@${hit.pk} が読める立て物でない＝本文が読めない`).toBe(true);
    });
  }
});
