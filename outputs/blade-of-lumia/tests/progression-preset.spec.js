// tests/progression-preset.spec.js – 進行地点プリセット（実行キュー 0f・2026-08-25）
//
// 何のためのテストか：ボスの数値を判定するには「その進行地点の想定装備」で戦う必要がある
// （ユーザーの言葉＝「その時点のプレーヤーのハート数とか、もってる武器とかもきっちり合わせて
// テストする必要がありそう」）。値を手書きすると必ず腐る／取り違える∴実マップから導出する。
//
// 検証内容：
//   ①: `shared/progression.js` が単一の真実＝`audit-balance.mjs` は import するだけ
//       （ORDER / collectRewards / profilesAt のローカル定義を持たない）
//   ②: `profilesAt()` の返り値が `audit-balance.mjs --json` の checkpoints と一致する
//       （目で比べない＝監査スクリプトを実際に走らせて突き合わせる）
//   ③: サブアイテムの所在が実マップから導出できている（bow→D3 等）＋翼の羽衣の例外
//       （宝箱に無い＝祭壇で授かる∴「全欠片が揃った地点以降」で true になる）
//   ④: `ps_shield` / `ps_armor` は**ティア番号**として読まれる（実エンジン）
//       ＝ティア1 が指定でき、欠落なら装備しない（旧実装は `1`＝ティア0・`0` でもティア0 装備）
//   ⑤: エディタで「🚩進行地点」を選ぶとダイアログの各欄が埋まり、プレビュー URL に載る
//   ⑥: プレビュー設定の shield/armor/progress が必要な箇所すべてに揃っている（静的検査）
//   ⑦: 「ボス直前」＝min ＋ そのレイヤーの**ボス部屋の外**の報酬（0d-2.8・2026-08-25）
//       ＝撃破報酬（ボス部屋のハートの器・欠片・D8 の銀の盾）は含まない／
//         ボス部屋を持たないレイヤー（ボス部屋の無い寄道4つ）と開始直後には作らない
//         （寄道 warlord_lair は主の間が isBossRoom ∴作る＝0h・2026-09-05）
//   ⑧: エディタの選択肢に「ボス直前」が出る（出ない地点には出ない）＋選ぶと欄が埋まる

import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, waitForBoard } from './helpers.js';
import {
  ORDER, SUB_ITEM_KEYS, collectRewards, fieldRewardsOf, profilesAt, totalTriforceOf,
  presetsFrom, bossRoomLayersOf,
} from '../shared/progression.js';
import { ARMOR_TIERS, SHIELD_TIERS, BASE_DEF } from '../shared/items.js';

const repoFile = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readRepo = (rel) => readFileSync(repoFile(rel), 'utf8');

const MAP = JSON.parse(readRepo('../work/blade-of-lumia.json'));
const EDITOR_URL = '/blade-of-lumia/editor/';

// エディタが作る選択肢の数＝各地点の非 null な variant の合計（＋先頭の「指定なし」）。
// ⚠️ ここを定数（ORDER.length × 3）で書くと「ボス直前が全地点に出ている」バグを見逃す
//    ∴プリセット側の実データから数える。
const VARIANT_KEYS = ['min', 'boss', 'max'];
const PRESETS = presetsFrom(MAP);
const VARIANT_TOTAL = PRESETS.reduce((n, p) => n + VARIANT_KEYS.filter((k) => p[k]).length, 0);

function presetsForTest() {
  const perLayer = collectRewards(MAP);
  const fieldRewards = fieldRewardsOf(perLayer);
  return { perLayer, fieldRewards };
}

test.describe('進行地点プリセット', () => {

  test('①: audit-balance は shared/progression.js を import するだけ（定義のコピーを持たない）', () => {
    const audit = readRepo('../scripts/audit-balance.mjs');
    expect(audit, 'shared/progression.js から import していない')
      .toContain("from '../shared/progression.js'");
    // ORDER / collectRewards / profilesAt の**本体**が残っていたら二重管理＝腐る
    expect(audit, 'ORDER のローカル定義が残っている（共有と二重管理）')
      .not.toMatch(/^const ORDER = \[/m);
    expect(audit, 'collectRewards のローカル定義が残っている')
      .not.toMatch(/^function collectRewards\(/m);
    // profilesAt は statsOf を被せる薄いラッパだけが残る（ORDER を歩く本体は共有側）
    // ⚠️ 引数の閉じ括弧まで含めない＝0d-2.9 で第4引数（preBossHere）が増えた。
    //    「共有を呼んでいる」ことだけを固定する（引数の数はここで縛る話ではない）。
    expect(audit, 'profilesAt が共有の rawProfilesAt を呼んでいない')
      .toContain('rawProfilesAt(index, perLayer, fieldRewards');
  });

  test('②: profilesAt の返り値が audit-balance --json の checkpoints と一致する', () => {
    const out = execFileSync('node', [repoFile('../scripts/audit-balance.mjs'), '--json'], {
      cwd: repoFile('..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    const report = JSON.parse(out);
    const { perLayer, fieldRewards } = presetsForTest();

    expect(report.checkpoints.map(c => c.id), '監査の地点列が ORDER と食い違う')
      .toEqual(ORDER.map(o => o.id));

    report.checkpoints.forEach((cp, i) => {
      const { min, max } = profilesAt(i, perLayer, fieldRewards);
      for (const [variant, raw] of [['min', min], ['max', max]]) {
        for (const key of ['sword', 'armor', 'shield', 'hearts']) {
          expect(report.checkpoints[i][variant][key], `${cp.id} ${variant}.${key} が監査と違う`)
            .toBe(raw[key]);
        }
      }
    });

    // DT（最終地点）は判定③でユーザーが実プレイした諸元＝ここが動いたら過去の判定が無効になる
    const dt = report.checkpoints.at(-1);
    expect(dt.id).toBe('dark_tower');
    expect(dt.min.hearts, 'DT min のハート数（2026-08-24 の実プレイは 15）').toBe(15);
    // 下限は木の剣のまま＝寄道の剣（聖剣・ルミアの剣）が min へ漏れていないことの歯。
    expect(dt.min.sword,  'DT min の剣ティア（木の剣＝寄道の剣が下限へ漏れている）').toBe(0);
    expect(dt.min.shield, 'DT min の盾ティア（盾は3つとも必須ダンジョン産＝ティア2）').toBe(2);
    // ⚠️ 旧値は 3（聖剣＝寄道 void_shrine）。0o-2（2026-09-05）で寄道 `darklord_prison`
    //    （X 魔王の封魔の間）に**ルミアの剣＝`SWORD_TIERS[4]`** を置いた∴max（寄道も全部
    //    回収する上限）では DT に入る時点で tier4 を持っている。
    expect(dt.max.sword,  'DT max の剣ティア（寄道 魔王の岩牢のルミアの剣）').toBe(4);
    // ⚠️ 旧値は 1（フィールドの鎖かたびら）＝伝説の鎧が世界のどこにも置かれていなかった時代の値。
    //    0h（2026-09-05）で寄道 `warlord_lair`（魔将 V の主の間）に伝説の鎧＝`ARMOR_TIERS[2]` を
    //    置いた∴max（寄道も全部回収する上限）では DT に入る時点でティア2 を着ている。
    expect(dt.max.armor,  'DT max の防具ティア（寄道 魔将の巣の伝説の鎧）').toBe(2);
    // 下限は動かない＝寄道の報酬は min に数えない（ここが動くと V/Z の判定諸元が変わる）。
    expect(dt.min.armor,  'DT min の防具ティア（寄道の伝説の鎧が下限へ漏れている）').toBe(0);
  });

  test('③: サブアイテムの所在が実マップから導出でき、翼の羽衣は欠片から導出される', () => {
    const { perLayer, fieldRewards } = presetsForTest();

    // 実データ（2026-08-24 に確認）＝各道具はこのレイヤーの宝箱に入っている
    const HOME = {
      boomerang: 'dungeon_2', bow: 'dungeon_3', candle: 'dungeon_4',
      ladder: 'dungeon_5', bomb: 'dungeon_6', flute: 'dungeon_8',
    };
    for (const [item, layer] of Object.entries(HOME)) {
      expect(perLayer.get(layer)?.items ?? [], `${item} が ${layer} から導出できていない`)
        .toContain(item);
    }
    expect(SUB_ITEM_KEYS.slice().sort(), '導出対象の道具リストが実データとずれている')
      .toEqual(Object.keys(HOME).sort());

    // 「その地点で持っている道具」＝入手レイヤーの**次の地点以降**に現れる
    const idxOf = (id) => ORDER.findIndex(o => o.id === id);
    for (const [item, layer] of Object.entries(HOME)) {
      const got = idxOf(layer);
      expect(profilesAt(got, perLayer, fieldRewards).min.items,
        `${item} が入手前（${ORDER[got].id} 到達時点）に持てている`).not.toContain(item);
      expect(profilesAt(got + 1, perLayer, fieldRewards).min.items,
        `${item} が入手後に持てていない`).toContain(item);
    }

    // 翼の羽衣＝宝箱に無い（祭壇で全欠片を捧げて授かる）∴全欠片が揃う地点以降だけ true
    const total = totalTriforceOf(perLayer);
    expect(total, '星の欠片の総数が実マップと違う（本編8ダンジョン）').toBe(8);
    ORDER.forEach((cp, i) => {
      const { min } = profilesAt(i, perLayer, fieldRewards);
      expect(min.wingrobe, `${cp.id}: 翼の羽衣の可否が欠片数（${min.triforce}/${total}）と噛み合わない`)
        .toBe(min.triforce >= total);
    });
    // 最終2地点（虚空の祠・暗黒の塔）は必ず所持＝DT の入口は翼の羽衣で開く
    expect(profilesAt(idxOf('void_shrine'), perLayer, fieldRewards).min.wingrobe,
      '虚空の祠に立てる時点で翼の羽衣を持っていない').toBe(true);
    expect(profilesAt(idxOf('dark_tower'), perLayer, fieldRewards).min.wingrobe,
      'DT に入る時点で翼の羽衣を持っていない').toBe(true);
  });

  test('④: ps_shield / ps_armor はティア番号として読まれる（ティア1 が指定できる）', async ({ page }) => {
    const open = async (extra) => {
      const p = new URLSearchParams({
        fromEditor: '1', layer: 'test_mechanics', stage: '32,0', row: '4', col: '2', ...extra,
      });
      await page.goto(`${GAME_URL}?${p.toString()}`);
      await waitForBoard(page);
      return page.evaluate(() => window.__game.getPlayer());
    };

    // ティア1 が指定できる（旧実装は '1' を「チェックボックス ON＝ティア0」と読んでいた）
    const t1 = await open({ ps_armor: '1', ps_shield: '1' });
    expect(t1.armorTier, 'ps_armor=1 がティア0 に落ちている（旧実装のバグ）').toBe(1);
    expect(t1.shieldTier, 'ps_shield=1 がティア0 に落ちている').toBe(1);
    expect(t1.def, 'DEF が防具ティア1 から導出されていない').toBe(BASE_DEF + ARMOR_TIERS[1].def);

    // 最上位も通る＝DT max の再現（DEF は ps_def の代用ではなく装備から出る）
    const t2 = await open({ ps_armor: '2', ps_shield: '2' });
    expect(t2.armorTier).toBe(2);
    expect(t2.shieldTier).toBe(2);
    expect(t2.def).toBe(BASE_DEF + ARMOR_TIERS[2].def);
    expect(SHIELD_TIERS[t2.shieldTier].reflect, 'ミラーシールドの跳ね返し係数').toBe(1.0);

    // 「なし」＝負値／欠落では装備しない（旧実装は ps_armor=0 でもティア0 を装備していた）
    const none = await open({ ps_armor: '-1', ps_shield: '-1' });
    expect(none.armorTier ?? -1, 'ps_armor=-1 なのに防具を装備している').toBe(-1);
    expect(none.shieldTier ?? -1, 'ps_shield=-1 なのに盾を装備している').toBe(-1);
    expect(none.armor ?? null).toBeFalsy();
    expect(none.shield ?? null).toBeFalsy();

    // 0 は「ティア0 を装備」＝従来どおり（既存テストが依っている意味）
    const t0 = await open({ ps_armor: '0', ps_shield: '0' });
    expect(t0.armorTier).toBe(0);
    expect(t0.shieldTier).toBe(0);
  });

  test('⑤: エディタで進行地点を選ぶと各欄が埋まり、プレビュー URL に載る', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // ⚠️ エディタはマップを**localStorage からしか復元しない**（`tryRestoreFromStorage`）＝
    //    素の新規ページは盤面が空。空のまま ▶プレビューを押すと `getCurrentStages()` が空で
    //    alert('ステージを選択してください') が出てダイアログが開かない（Playwright は alert を
    //    自動で閉じる∴無言で失敗する）。プリセットの値も `state.mapData` からの導出∴実マップが要る。
    //    保存は最小化 JSON で入れる（整形済みの 2.9MB は localStorage の上限に当たる）。
    await page.goto(EDITOR_URL);
    await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(MAP));
    await page.reload();
    await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
    // ⚠️ 選択肢は2段階で建つ（起動時に min/max → マップ読み込みで「ボス直前」を含めて作り直し）
    //    ∴「1つ以上ある」で待つと途中の状態を数えてしまう＝最終の数で待つ。
    await page.waitForFunction((want) => {
      const sel = document.getElementById('ps-progress');
      return !!sel && sel.options.length === want;
    }, VARIANT_TOTAL + 1);

    // 選択肢＝各地点の非 null な variant の合計（＋先頭の「指定なし」）
    const optCount = await page.$eval('#ps-progress', el => el.options.length);
    expect(optCount, '進行地点の選択肢数がプリセットの variant 数と食い違う')
      .toBe(VARIANT_TOTAL + 1);

    // ダイアログを開き（ワールドビュー＝クリック位置を訊かない経路）DT(min) を選ぶ
    await page.click('#btn-preview');
    await expect(page.locator('#preview-settings-overlay')).not.toHaveClass(/hidden/);
    await page.selectOption('#ps-progress', 'dark_tower:min');

    const filled = await page.evaluate(() => {
      const v = (id) => document.getElementById(id).value;
      const c = (id) => document.getElementById(id).checked;
      return {
        hearts: v('ps-hearts'), sword: v('ps-sword'), shield: v('ps-shield'), armor: v('ps-armor'),
        triforce: v('ps-triforce'), weapon: c('ps-weapon'), wingrobe: c('ps-wingrobe'),
        bow: c('ps-bow'), flute: c('ps-flute'), silver: c('ps-silverboomerang'),
      };
    });
    // DT min＝ハート15・木の剣（ティア0）・盾ティア2・防具ティア0・全欠片・翼の羽衣
    expect(filled.hearts).toBe('15');
    expect(filled.sword).toBe('0');
    expect(filled.shield).toBe('2');
    expect(filled.armor).toBe('0');
    expect(filled.triforce).toBe('8');
    expect(filled.weapon).toBe(true);
    expect(filled.wingrobe, 'DT には翼の羽衣で入る∴min でも所持している').toBe(true);
    expect(filled.bow).toBe(true);
    expect(filled.flute).toBe(true);
    expect(filled.silver, '銀のブーメランはフィールド産＝min では持たない').toBe(false);

    // ▶ この設定でプレビュー → iframe の URL に埋めた値がそのまま載る
    await page.click('#ps-btn-start');
    await page.waitForFunction(() => {
      const f = document.getElementById('preview-frame');
      return !!f && f.src.includes('ps_hearts=');
    });
    const src = await page.$eval('#preview-frame', el => el.src);
    expect(src).toContain('ps_hearts=15');
    expect(src).toContain('ps_sword=0');
    expect(src).toContain('ps_shield=2');   // ← ティア番号でそのまま載る（旧実装は 1/0 の真偽値）
    expect(src).toContain('ps_armor=0');
    expect(src).toContain('ps_wingrobe=1');
    expect(errors).toEqual([]);
  });

  test('⑥: shield/armor/進行地点がプレビュー設定の必要箇所すべてに揃っている', () => {
    const editorJs = readRepo('../editor/editor.js');
    const editorIo = readRepo('../editor/editor-io.js');
    const html     = readRepo('../editor/index.html');

    // 盾/防具＝読み手が2経路ある（ステージ全体プレビュー／クリック位置プレビュー）＝両方に要る。
    // ⚠️ セレクトであること（チェックボックスだとティア1 が表現できない＝直したバグに戻る）
    expect(html, '盾がセレクトになっていない').toMatch(/<select id="ps-shield"/);
    expect(html, '防具がセレクトになっていない').toMatch(/<select id="ps-armor"/);
    for (const [name, src] of [['editor.js', editorJs], ['editor-io.js', editorIo]]) {
      expect(src, `${name} が ps-shield をティア番号で読んでいない`)
        .toMatch(/parseInt\(document\.getElementById\('ps-shield'\)\.value, 10\)/);
      expect(src, `${name} が ps-armor をティア番号で読んでいない`)
        .toMatch(/parseInt\(document\.getElementById\('ps-armor'\)\.value, 10\)/);
    }
    expect(editorIo, 'openPreview の URL に ps_shield が無い').toContain('ps_shield=${ps.shield}');
    expect(editorIo, 'openPreview の URL に ps_armor が無い').toContain('ps_armor=${ps.armor}');

    // 進行地点プリセットは**ダイアログの入力欄そのものを埋める**∴読み手側の改修は不要＝
    // editor.js に定義を足す必要がない（他の ps_* と違って1箇所で済む理由をここで固定する）。
    expect(html, 'index.html に ps-progress の選択欄が無い').toContain('id="ps-progress"');
    expect(editorIo, 'editor-io.js にプリセットの配線が無い').toContain('initPreviewPresetSelect');
    expect(editorIo, 'プリセットが shared/progression.js から導出されていない')
      .toContain("from '../shared/progression.js'");
    expect(editorJs, 'editor.js にプリセットの重複定義がある（入力欄を埋める方式なら不要）')
      .not.toContain('ps-progress');

    // 「ボス直前」はマップの isBossRoom を見て出す／出さないが決まる∴読み込み後に組み立て直す。
    // これが抜けると起動時の min/max だけの選択肢が残る＝新 variant が一切出ない。
    expect(editorIo, 'マップ読み込み後に選択肢を組み立て直していない')
      .toMatch(/buildPreviewPresetOptions\(\);[\s\S]{0,400}?editor:showWorld/);
  });

  // ── ⑦ ボス直前プリセット（0d-2.8）─────────────────────────────
  // なぜ足したか：min は「そのダンジョンへ**入った瞬間**」＝ダンジョン内の拾い物を1つも含まない。
  // D1 のボス（岩のゴーレム G）は min（防具なし・盾なし・ハート3）では勝ち筋が無く、
  // ユーザーの実プレイ報告（2026-08-25「実際これどうやって D1 min 装備で倒せばいいと思う？」）の
  // 真因がこの下限の取り違えだった。ボス戦の判定はこの variant で見る。
  test('⑦: ボス直前＝min ＋ ボス部屋の外の報酬（撃破報酬は含まない・ボス部屋が無い地点には作らない）', () => {
    const bossLayers = bossRoomLayersOf(MAP);
    const at = (id) => PRESETS.find((p) => p.id === id);

    // (a) 作る／作らないの境目＝レイヤーがボス部屋を持つかどうかだけで決まる
    for (const cp of ORDER) {
      const has = !!cp.layer && bossLayers.has(cp.layer);
      expect(!!at(cp.id).boss, `${cp.id}: ボス直前の有無がボス部屋の有無（${has}）と食い違う`).toBe(has);
    }
    expect(at('start').boss, '開始直後（レイヤー無し）にボス直前がある').toBeNull();
    for (const id of ['forest_cave', 'cave_1', 'secret_grotto', 'void_shrine']) {
      expect(at(id).boss, `${id}: ボス部屋の無い寄道にボス直前の選択肢を作っている（死んだ選択肢）`).toBeNull();
    }
    // ⚠️ 「寄道はボス部屋を持たない」は 0h（2026-09-05）で崩れた＝`warlord_lair`（魔将の巣）の
    //    主の間は `isBossRoom`（魔将 V の一戦）∴寄道でも「ボス直前」が出るのが正しい。
    //    ここを上の一覧に足すと「寄道なら null」という古い前提に戻る＝(a) と食い違って赤くなる。
    expect(at('warlord_lair').boss,
      'warlord_lair: 主の間（isBossRoom）を持つ寄道にボス直前の選択肢が無い').not.toBeNull();

    // (b) D1＝実データ（革の鎧 3,0／木の盾 1,1／ハートの器 3,3 がボス部屋 0,0 の外）
    const d1 = at('dungeon_1');
    expect(d1.min.armor,  'D1 min は防具なし（鎧は D1 の中にある）').toBe(-1);
    expect(d1.min.shield, 'D1 min は盾なし').toBe(-1);
    expect(d1.min.hearts, 'D1 min のハート数').toBe(3);
    expect(d1.boss.armor,  'D1 ボス直前で革の鎧（ティア0）を持っていない').toBe(0);
    expect(d1.boss.shield, 'D1 ボス直前で木の盾（ティア0）を持っていない').toBe(0);
    expect(d1.boss.hearts, 'D1 ボス直前のハート数（3 ＋ ボス部屋の外の器1）').toBe(4);
    expect(d1.boss.sword,  'D1 ボス直前の剣ティア（木の剣）').toBe(0);

    // (c) 撃破報酬は含まない＝ボス部屋の中身が boss に混ざっていないことを2点で固定する
    //     ・D1 のボス部屋（0,0）のハートの器 → D2 min は D1 boss より 1 多い
    expect(at('dungeon_2').min.hearts, 'D2 min が D1 ボス直前 ＋ ボス撃破報酬の器1 になっていない')
      .toBe(d1.boss.hearts + 1);
    //     ・D8 のボス部屋にはミラーシールド（ティア2）が置いてある → boss は銀の盾（1）のまま
    expect(at('dungeon_8').boss.shield, 'D8 ボス直前でボス部屋のミラーシールドを持っている').toBe(1);
    expect(at('secret_grotto').min.shield, 'D8 撃破後にミラーシールド（ティア2）になっていない').toBe(2);
    //     ・星の欠片はボスのドロップ＝ボス直前では min と同数
    for (const cp of ORDER) {
      const p = at(cp.id);
      if (!p.boss) continue;
      expect(p.boss.triforce, `${cp.id}: ボス直前の欠片数が min と違う（撃破ドロップを数えている）`)
        .toBe(p.min.triforce);
    }

    // (d) 単調性＝ボス直前は必ず min 以上（下回ったら足し算の向きが逆）
    for (const cp of ORDER) {
      const p = at(cp.id);
      if (!p.boss) continue;
      for (const key of ['sword', 'armor', 'shield', 'boomerang', 'hearts']) {
        expect(p.boss[key], `${cp.id}: ボス直前の ${key} が min を下回っている`)
          .toBeGreaterThanOrEqual(p.min[key]);
      }
      for (const k of p.min.items) {
        expect(p.boss.items, `${cp.id}: min で持っている ${k} がボス直前で消えている`).toContain(k);
      }
      expect(SUB_ITEM_KEYS.filter((k) => p.boss.items.includes(k)),
        `${cp.id}: ボス直前の道具の並びが SUB_ITEM_KEYS 順でない`).toEqual(p.boss.items);
    }

    // (e) そのダンジョンで拾う道具はボス直前では**もう持っている**（min では持っていない）
    //     ＝弱点関門の判定が min だと外す例（D6 の爆弾は火山のボス部屋の外にある）
    expect(at('dungeon_6').min.items,  'D6 min で爆弾を持っている（爆弾は D6 の中で拾う）').not.toContain('bomb');
    expect(at('dungeon_6').boss.items, 'D6 ボス直前で爆弾を持っていない').toContain('bomb');
    expect(at('dungeon_3').boss.items, 'D3 ボス直前で弓を持っていない').toContain('bow');
    expect(at('dungeon_5').boss.items, 'D5 ボス直前ではしごを持っていない').toContain('ladder');
  });

  // ── ⑧ エディタ側（選択肢の生成と反映）───────────────────────────
  test('⑧: エディタの選択肢にボス直前が出る（出ない地点には出ない）＋選ぶと欄が埋まる', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(EDITOR_URL);
    await page.evaluate((json) => localStorage.setItem('bladeOfLumiaMapData', json), JSON.stringify(MAP));
    await page.reload();
    await page.waitForSelector('#world-grid .world-cell.has-stage', { state: 'visible' });
    await page.waitForFunction((want) => {
      const sel = document.getElementById('ps-progress');
      return !!sel && sel.options.length === want;
    }, VARIANT_TOTAL + 1);

    const values = await page.$eval('#ps-progress', el => [...el.options].map(o => o.value));
    // 期待する value 集合＝プリセットの非 null な variant そのもの（＋「指定なし」）
    const want = ['', ...PRESETS.flatMap((p) => VARIANT_KEYS.filter((k) => p[k]).map((k) => `${p.id}:${k}`))];
    expect(values, 'エディタの選択肢がプリセットの variant と食い違う').toEqual(want);
    expect(values, 'ボス部屋の無い寄道に「ボス直前」が出ている').not.toContain('forest_cave:boss');
    expect(values, 'D1 に「ボス直前」が出ていない').toContain('dungeon_1:boss');
    // ラベルも確認（value だけ合っていて表示が min のままだと選び間違える）
    const label = await page.$eval('#ps-progress', el =>
      [...el.options].find(o => o.value === 'dungeon_1:boss')?.textContent);
    expect(label, 'D1 ボス直前のラベルが読めない').toContain('ボス直前');

    // 選ぶと欄が埋まる＝D1 ボス直前（革の鎧 ティア0・木の盾 ティア0・ハート4・木の剣）
    await page.click('#btn-preview');
    await expect(page.locator('#preview-settings-overlay')).not.toHaveClass(/hidden/);
    await page.selectOption('#ps-progress', 'dungeon_1:boss');
    const filled = await page.evaluate(() => {
      const v = (id) => document.getElementById(id).value;
      const c = (id) => document.getElementById(id).checked;
      return {
        hearts: v('ps-hearts'), sword: v('ps-sword'), shield: v('ps-shield'), armor: v('ps-armor'),
        triforce: v('ps-triforce'), weapon: c('ps-weapon'), bow: c('ps-bow'), bomb: c('ps-bomb'),
      };
    });
    expect(filled.hearts).toBe('4');
    expect(filled.sword).toBe('0');
    expect(filled.shield, 'D1 の木の盾が反映されていない').toBe('0');
    expect(filled.armor,  'D1 の革の鎧が反映されていない').toBe('0');
    expect(filled.triforce).toBe('0');
    expect(filled.weapon).toBe(true);
    expect(filled.bow, 'D1 では弓を持たない').toBe(false);
    expect(filled.bomb, 'D1 では爆弾を持たない（G の弱点だが D6 の報酬）').toBe(false);

    // URL にもティア番号でそのまま載る
    await page.click('#ps-btn-start');
    await page.waitForFunction(() => {
      const f = document.getElementById('preview-frame');
      return !!f && f.src.includes('ps_hearts=');
    });
    const src = await page.$eval('#preview-frame', el => el.src);
    expect(src).toContain('ps_hearts=4');
    expect(src).toContain('ps_shield=0');
    expect(src).toContain('ps_armor=0');
    expect(errors).toEqual([]);
  });

});
