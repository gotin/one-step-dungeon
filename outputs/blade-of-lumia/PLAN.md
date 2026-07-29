# Blade of Lumia – 開発計画

**目標：** 初代ゼルダの伝説レベルの面白さを持つ、多くの人に「やりたい」と思ってもらえるゲームにする。

---

## 🎯 実行キュー（次にやることの唯一の定義・上から順に1つずつ）

> **このリストが実行順序の単一の真実。** 番号の小さいものから順に実行する。**「AとBのどちらをやるか」をユーザーに尋ねてはいけない**（2026-07-28 ユーザー指摘＝「タスクの実行順序にあいまいさを一切残さないPLAN.mdの書き方にしろと。なんでこっちかこっち、みたいな話が今でてくるんですか？」）。
>
> **運用（例外なし）：**
> - セッション開始時は**このキューの先頭（未完＝`[ ]` の最小番号）を実行する**。他ファイル（PROGRESS の📍現在地など）に「次やること」を書かない＝キューへのポインタだけ書く。
> - 新しいタスクが判明したら、**その場でこのキューに番号付きで挿入し、なぜその位置かを1行書く**。「後で決める」「どちらでもよい」は禁止。
> - 完了したら `[x]` にして日付を入れる。キューから消さない（順序の履歴が判断根拠になる）。
> - ユーザーが割り込みで別タスクを指示した場合は、それを **0番（割り込み枠）** として先に実行し、終わったらキューの先頭へ戻る。

- [x] **1. テストの flaky 2件を安定化する（2026-07-28 完了）**（⚡ Sonnet・`tests/field-corridor-o.spec.js` ⑨／`tests/sea-lord-boss.spec.js` ⑥b）
      **原因＝⑥b は実時間ループ（`setInterval(step,120)`）が手動 `step()` と並走し tick 数が揺れる race。⑨ は28秒の実行時間がデフォルトタイムアウト30秒に近接＝並列負荷での微増でも超過。**
      **対処＝`window.__game.pause()/resume()`（`game.js` の `callStopGameLoop`/`callStartGameLoop` を `main.js` 経由で公開）を⑥bの手動step前後に追加。⑨ に `test.slow()` を追加（90秒に緩和・計算量は変えず）。**
      **完了条件＝フル実行3回連続で全緑（398 passed×3）を確認済み。** 詳細は DECISIONS.md 参照。

- [x] **2. ⑥-landing 辺遷移の着地を整数セルにする＋「閉じた門セルへの着地は拒否」をセットで入れる（2026-07-29 完了）**（🧠 Opus・詳細は下記 9-6 ⑥-landing の節）
      **入れたもの＝(a) 着地・押し戻しを整数セル化（`game.js checkStageTransition`）／(b) 着地判定の状態チェックを `passable.js` の `statefulTileClosed()` に単一化して `tilePassable` と共有／(c) 検査側 `connectivity.mjs edgeLanding` も整数化し `footprintBlocked`/`FOOTPRINT_BASELINE` を 0 に締めた。**
      **完了条件＝`footprintBlocked` 0（全ダンジョン層・field）／新規 `tests/arrival-landing.spec.js` 28件／フル実行 426 passed ×3 連続。** 詳細は DECISIONS.md 2026-07-29 参照。

- [ ] **3. 深洋O ④＝25画面配置の残り 14画面（デルタ）**（🧠 Opus・詳細は下記 9-6 ⑥ 深洋O の節）

- [ ] **4. ⑥-完了検査**（下記 9-6 ⑥-完了検査の節＝全指標 0 の機械的証明）

- [ ] **5. 9-6-BASE 外周解体＋隣接地域編入**（外周 105画面の格上げ。**`footprintBlocked` は 2番（⑥-landing）で既に 0 になった**＝このタスクの目的は外周画面の格上げだけ）

**⚠️ H-1 ④（下記）は「次プロンプトで注入を1回目視する」だけの確認項目＝キューの番号を消費しない**（作業ではないので、どのセッションでも気づいたときに消す）。

---

## 🚨 ハーネス改善（2026-07-11 ユーザー指示・ゲーム外・完了済み）

> **これはゲーム機能ではなく Claude Code（開発ハーネス）側の改善タスク。実装は 2026-07-11 に完了済み。** 残っているのは H-1 ④の「実セッションで注入を1回目視する」だけ＝作業ではないので上の実行キューの番号を消費しない。**旧記述「9-6 ⑥-5 や 4-6 より先にこれを実装する」は完了により失効**（順序の指示は上の実行キューだけを見る）。

### H-1. モデルに context 利用率を注入する（`UserPromptSubmit` フック）　🧠→⚡　✅ 完了（2026-07-11）

**背景（2026-07-11）：** モデル（Claude）は**デフォルトで自分の context 窓の利用率を見ていない**（クライアント側で計算されユーザーにだけ表示・サブエージェント調査で確認）。そのため長い/重いセッションの終盤でも残量に気づかず「このまま続けますか？」と新規実装の続行を提案してしまった。→ **フックで利用率をモデルの context に毎ターン注入し、逼迫時は区切りを進言できるようにする。**

**方針＝A案（実機検証を先に）：**
- [x] **① 実機でフック入力 JSON を検証済み（2026-07-11）。** 一時フック `_tmp-dump-prompt.sh` で stdin を `/tmp/claude-hook-input.json` にダンプ。**実在フィールド＝`transcript_path`/`session_id`/`cwd`/`prompt_id`/`permission_mode`/`hook_event_name`/`prompt`。`context_window`/`used_percentage` は存在しない（捏造だった）＝裏取りが正解。**
- [x] **② 算出方法を確定（文字数概算より上位の手段を実機で発見）。** transcript JSONL の各 assistant 行に実 `message.usage` が記録されており、**`input_tokens + cache_creation_input_tokens + cache_read_input_tokens`＝その時点でモデルが実際に読んだ context トークン数**。最後の assistant 行のこの和を採用（概算不要・API 呼び出し不要）。
- [x] **③ フック実装（`~/.claude/hooks/context-usage.py`）＋登録済み。** `additionalContext` に `[context] 利用率 ~X% (≈Yk / Ztok)` を返す。**ウィンドウは適応判定**＝used>200k なら 1M 窓（1M-context ベータのセッションで 200% 超になるバグを実機で発見→修正）。エッジ（transcript無/不正JSON/ファイル欠落）は無出力・exit 0 でプロンプトを絶対ブロックしない。`settings.json` の `UserPromptSubmit` に登録・一時診断フックは削除済み。
- [x] **④ 方針を `~/.claude/CLAUDE.md` に追記済み（グローバル＝全セッションで発火するフックと対応）。** 下記 H-2 の文面。
- [ ] **完了条件（残：実セッションでの発火確認）：** 次のプロンプト送信時に system-reminder 内へ `[context] 利用率 ~X%` が注入されるのを1回確認する（オフラインでは全 transcript で正しい値を確認済み＝自セッション~40%/別1M窓~45%）。

### H-2. セッション継続判断のルールを CLAUDE.md に明記　⚡（文面追記のみ）　✅ 完了（2026-07-11・`~/.claude/CLAUDE.md` 冒頭「セッション継続の判断」節）

- [x] 以下の趣旨を CLAUDE.md に追記済み（H-1 フックが無くても効くよう、長さ・読込量からの推論も含める）：
  - 長い/重いセッションの終盤で、新規の重いタスク（実装の新規着手等）を「このまま続けますか？」と提案しない。**利用率（フック注入値）または セッションの長さ・読込量から逼迫を推論し、区切りを進言する**（記録済みなら中断で失われる物はない）。
  - 作業を前に進める提案をデフォルトにしない。「次に何ができるか」より「今ここで区切るべきか」を先に検討する。
  - 中身のない前のめりな愛想（"次も手伝えます"）を書かない。

---

## 📂 ドキュメント構成と運用ルール

長期開発のため、以下のファイルで進捗・判断を管理する：

| ファイル | 役割 | 更新タイミング |
|---|---|---|
| **PLAN.md**（本ファイル） | 何を作るかの計画。チェックボックスで進捗。**冒頭の「🎯 実行キュー」が実行順序の唯一の定義** | タスク完了時にチェック / 計画変更時 / 新タスク判明時（キューに番号を振って挿入） |
| **PROGRESS.md** | 作業ログ（やったこと・学び）。**実行順序は書かない**＝実行キューへのポインタと参考メモだけ | 作業セッションごと |
| **DECISIONS.md** | 設計判断・学び・ハマりどころ（ADR） | 重要な判断・発見・計画変更時 |
| **WORKFLOW.md** | 作業プロンプトのテンプレート集 | フェーズを進める時にコピーして使う |
| **IDEA.md** | アイデア集・ストーリー設定 | アイデア追加時 |

**運用ルール：**
- **セッション開始時**：本ファイル冒頭の「🎯 実行キュー」の先頭（未完＝`[ ]` の最小番号）を実行する。**他ファイルを見て順序を決め直さない・ユーザーに「AとBのどちらか」を尋ねない**
- **セッション終了時**：`PROGRESS.md` に新エントリ（やったこと・学び）を追記する。**「次やること」は書かない**（順序は実行キューだけが持つ）
- **タスク完了時**：`PLAN.md` の該当チェックボックスを `[x]` にし、**実行キューの該当項目も `[x]`＋日付**にする（キューから消さない）
- **新タスク判明時**：その場で実行キューに番号を振って挿入し、**なぜその位置かを1行書く**（「後で決める」「どちらでもよい」は禁止）
- **計画変更時**：`PLAN.md` を直接修正し、`DECISIONS.md` に「なぜ変えたか」を記録する
- **重要な判断・ハマりどころ**：`DECISIONS.md` に追記する

---

## フェーズ概要

| フェーズ | テーマ | 優先度 |
|---|---|---|
| **Phase 0** | **技術基盤・エンジニアリング改善** | **★★★ 最高（最初にやる）** |
| Phase 1 | ストーリー基盤の実装 | ★★★ 最高 |
| Phase 2 | ゲームループ完成（8ダンジョン・エンディング） | ★★★ 最高 |
| Phase 3 | アクション・戦闘の深化 | ★★☆ 高 |
| Phase 4 | サブアイテム拡充 | ★★☆ 高 |
| Phase 5 | 謎解き・パズルギミック | ★★☆ 高 |
| Phase 6 | 世界観・NPC・テキスト | ★★☆ 高 |
| Phase 7 | 成長システム | ★☆☆ 中 |
| Phase 8 | やりこみ・UX改善 | ★☆☆ 中 |

> **⚠️ Phase 0 を先に完了させてから Phase 1 以降に進む。**  
> game.js が 4098 行の状態で新機能を追加し続けるとバグ修正もデバッグも困難になる。  
> モジュール分割が完了して初めて、安全かつ高速に機能追加できる基盤が整う。

---

## 🤖 モデル使い分けガイド（Opus / Sonnet）

各タスクに **推奨モデル** を記載しています。基本方針は以下の通り：

| 推奨 | 向いているタスク | 理由 |
|---|---|---|
| **🧠 Opus** | 設計判断・依存関係の見極め・データ構造設計・問題解決 | 全体を読んで「どう分けるか」を判断する重い思考が必要 |
| **⚡ Sonnet** | パターンが決まった実装・コード移動・量産・単純な追加 | 設計が決まれば機械的に進む作業。速くて低コスト |
| **🧠→⚡** | まずOpusで設計を固め、その後Sonnetで実装 | 設計と実装を分けると効率的 |

> **原則：** 「最初の1つ」「全体に影響する設計」は Opus、「2つ目以降の繰り返し」「決まった作業」は Sonnet。

---

## Phase 0：技術基盤・エンジニアリング改善

**目的：** 長期開発・機能追加に耐えられるコードベースを整備する。**最初に完了させる。**

**現状のファイルサイズ（2026-06-15 実測・Phase 0 完了時点）：**
```
game.js    1268行  ✅ 4098行 → 1268行（約70%削減。0-2b で旧本体削除完了）。
                      オーケストレーション層（状態宣言・factory初期化・export）に収束
game.css   分割済 ✅ → css/ 配下11ファイル + @import エントリ（0-3b 完了）
editor.js  分割済 ✅ → 12モジュール（editor-state/layers/world/palette/canvas/props/io/
                      sprite/character/item/tile + エントリ193行。0-3b/0-5 完了）
sprites.js 分割済 ✅ → sprites-player/enemies/items/tiles + aggregator（0-3 完了）
sounds.js   448行  許容範囲内
enemies.js  142行  OK
items.js     92行  OK
tiles.js    198行  OK
npcs.js      17行  OK

【game.js から切り出し済みのモジュール（全て目標400〜700行内）】
player.js 698 / enemy-ai.js 555 / ui.js 529 / projectile.js 440 / boss.js 376 /
render-board.js 308 / combat.js 291 / render-chars.js 266 / input.js 161 /
passable.js 161 / conditions.js 117 / save.js 87 / main.js 78 / constants.js 36

テストコード  Playwright 29本（起動・移動・セーブ/ロード・遷移・投擲物・石押し・VRT・
                      editor スモーク：起動/作成/パレット/エクスポート＋スプライト/キャラ/
                      アイテム/タイル各エディタ）
```


---

### 0-0. テスト基盤の整備（分割前の安全網）⚠️ 最優先　🧠→⚡（設計はOpus、テスト量産はSonnet）

**背景：** 現状テストが1件もない。game.js を16分割する際にデグレ（既存機能の破壊）が起きても気づけない。  
分割作業の前に、**動作確認の安全網**を用意する。

**採用方針：Playwright を中心に据える**

> このゲームは「移動・衝突・演出・遷移」など**実際に動かさないと品質が確認できない**要素が多い。  
> ロジック単体テストだけでは不十分なため、実ブラウザで動かす E2E（Playwright）を主軸にする。  
> ただし**最初から完璧を目指さず、小さなスモークから始める**（起動・移動・遷移程度）。

#### ① Playwright による E2E テスト（主軸）
- [x] Playwright を導入（`npm i -D @playwright/test`、`npx playwright install chromium`）
- [x] **最小スモークテスト**：ゲームページが**エラーなく起動**し、ボードが描画されるか（`pageerror`・`console.error` を監視）
- [x] **スモークテスト（続き）**：
  - [x] キー入力でプレイヤーが**移動**できるか（4方向のいずれかで座標変化を確認）
  - [x] **セーブ/ロード**（localStorage）が機能するか（seed→続きから→復元を確認）
  - [x] **ステージ遷移**が動くか（遷移先ステージへの移動検証は未着手）
- [x] **ビジュアル回帰テスト（VRT）**：
  - 主要画面のスクリーンショットを基準画像として保存
  - リファクタ前後で**ピクセル差分**を比較（ピクセルアートゲームと相性が良い）
  - `expect(page).toHaveScreenshot()` を活用

#### ② 純粋関数の単体テスト（補助）
- [ ] 分割対象の低リスク純粋関数から：
  - `isPassable()` / `tilePassable()` / `toTileRow()` / `toTileCol()` など
  - テストランナーは Node 標準の `node --test`（追加依存なし）

#### ④ 投擲物テスト（サブアイテム動作スモーク）
- [ ] **弓矢テスト**：弓矢を装備・使用 → N フレーム後に `__game.getProjectiles()` に矢が存在し、座標が前進していることを確認
  - 背景：Phase 0-2 Step 5 の factory 切り出し後、useSubItem が旧ローカル変数に push し続けていたバグ（投擲物が動かない）がテストで検出できず実機確認で発覚した。今後の factory 切り出しでも同種のリグレッションが起きうるため追加
- [ ] **ブーメランテスト**：ブーメランを装備・使用 → N フレーム後に飛翔中の投擲物が存在し、プレイヤー元位置から離れていることを確認（`returning: false` の間は前進）

#### ③ 手動テストチェックリスト（自動化が難しい演出系）
- [ ] ボス撃破演出・エンディング・ダイアログ表示などの確認手順を md 化

> **運用：** 分割の各 Step 完了ごとに Playwright スモーク＋VRT を回し、挙動・見た目が変わっていないことを確認する。

> **段階導入の指針：**
> 1. まず「起動するか」だけの最小スモークを1本通す（ここが一番価値が高い）
> 2. 次に移動・遷移・セーブを追加
> 3. 余裕が出たら VRT（スクショ比較）を主要画面に追加
> 4. 入力→待機→状態確認の制御は地味に難しいので、ヘルパー関数を整備して使い回す


---

### 0-1. 決定論的ゲームループ（フレーム制御可能な構造）　🧠 Opus（コア設計）

**背景：** 現状のゲームループは**壁時計（実時間）に依存**しており、テストしづらい。
```js
setInterval(gameTick, TICK_MS)   // 実時間で駆動
setTimeout(() => {...}, 100)      // 演出も実時間
Date.now()                        // クールダウン・無敵時間も実時間
```
→ テストが「実時間を待つ」必要があり、遅く・不安定（flaky）になる。

**目標：時間を外から注入できる決定論的ループにする**

リアルタイムに動かすのではなく、**テストコードが「何フレーム進めるか」を制御**でき、
特定フレームで入力を注入して結果を検証できる構造を持たせる。

#### 設計の3本柱

1. **ゲームループを「駆動装置」から切り離す**
   ```js
   // 本番：requestAnimationFrame / setInterval が step() を駆動
   // テスト：テストコードが game.step(n) を手動で呼ぶ（実時間ゼロ）
   function step(frames = 1) { /* frames 分だけ世界を進める */ }
   ```

2. **実時間（Date.now）を「論理時間 gameTime」に置き換える**
   ```js
   // ❌ 今: if (Date.now() - lastSwordTime < COOLDOWN)
   // ✅ 後: if (gameTime - lastSwordTime < COOLDOWN)  ← gameTime は step で加算
   ```
   クールダウン・無敵時間・敵AIタイマーをすべて論理時間基準にする。

3. **入力をキューに積み、特定フレームで注入できるようにする**
   ```js
   game.queueInput('right');   // 入力を予約
   game.step(5);               // 5フレーム進める
   expect(game.player.x).toBe(...);  // 決定論的に検証
   ```

#### タスク
- [x] `gameTick` を「実時間駆動」と「1フレーム進める純粋ロジック `step()`」に分離
- [x] `Date.now()` 依存のクールダウン・無敵時間・敵AIタイマーを論理時間 `gameTime` に置換
- [x] 入力をキュー化し、テストから注入できる API（`queueInput` / `step`）を用意
- [x] テスト用フックを公開（`window.__game` 等でテストから状態・stepにアクセス）

#### 効果
| 効果 | 内容 |
|---|---|
| テストが高速・安定 | 実時間を待たない → flaky ゼロ |
| 再現性 | 「右5フレーム→攻撃→3フレーム」が毎回同じ結果 |
| デバッグ性 | バグを「Nフレーム目で再現」と特定できる |
| 将来のリプレイ機能 | 入力列の記録→再生でリプレイ・ゴーストも作れる |

> **⚠️ 演出系の扱い：** 見た目のアニメ（CSS/setTimeout）は実時間のままでよいが、  
> **ゲーム状態に影響する待機**（ボス撃破後の処理再開など）は論理時間に寄せる。  
> 「状態を進めるロジック」と「見た目の演出」を分離するのがコツ。
>
> **段階導入：** 全タイマーを一度に論理時間化するのは大変。  
> まず**移動・攻撃・敵AIなどゲームロジックのコア**から論理時間化し、演出は段階的に。  
> 0-2 のモジュール分割と**同時に進める**と二度手間にならない（どうせ game.js を触るため）。

---

### 0-2. game.js のモジュール分割（最優先）　🧠→⚡（分割設計はOpus、コード移動はSonnet）

**分割方針：1モジュール400行以内を目標**

> **⚠️ 循環参照に注意：** game.js 内の関数は相互に呼び合う（例：combat → boss → combat、player → combat → ui）。  
> 単純にファイルを切り出すと ESModule の循環参照エラーになりうる。  
> 対策として、(a) 共有状態は `state.js` に集約、(b) イベント/コールバックで疎結合化、  
> (c) どうしても相互依存する場合は動的 `import()` を使う、のいずれかで依存方向を一方向に保つ。

```
game/
  main.js          （エントリポイント・初期化・ゲームループ）    ~150行
  state.js         （グローバル状態・定数・プレイヤー定義）     ~100行
  save.js          （セーブ・ロード）                          ~100行
  map.js           （マップ読み込み・ステージ管理・遷移）       ~200行
  render-board.js  （タイルグリッド描画）                      ~300行
  render-chars.js  （キャラクター絶対配置描画・石描画）         ~200行
  player.js        （プレイヤー移動・タイルイベント）           ~350行
  combat.js        （剣攻撃・ダメージ・ゲームオーバー）        ~200行
  projectile.js    （投擲物・爆弾・ブーメラン）                ~300行
  enemy-ai.js      （敵AI・HitAndAway・追跡）                  ~400行
  enemy-attack.js  （敵の攻撃処理）                            ~150行
  boss.js          （ボス戦・HPバー・演出・エンディング）       ~300行
  ui.js            （HUD・ポーズ・ダイアログ・ショップ）       ~350行
  input.js         （キーボード・モバイル操作）                ~150行
  passable.js      （通行可否判定・ドアウェイ）                ~200行
  conditions.js    （条件評価・石スイッチ・ゲート連動）        ~150行
```

**分割手順（段階的に実施）：**

- [x] **Step 1: 状態・定数の分離（副作用ゼロ・低リスク）**
  - [x] **Step 1a**：再代入されない純粋定数を `constants.js` へ切り出し（MOVE_STEP / TICK_MS / INVINCIBLE_MS / HP_PER_HEART / MAP_JSON_URL / SAVE_KEY / CLEARED_KEY / DIR_DELTA / SWORD_REACH / SWORD_COOLDOWN_MS / STONE_PUSH_COOLDOWN_MS）。10テストグリーン
  - [x] **Step 1b**：`save.js` にセーブ/ロードの純粋変換関数を切り出し（`createStageState` / `serializeStageState` / `deserializeStageState` / `sanitizeLoadedPlayer`）。game.js の `getSS` / `saveGame` / `loadGame` がこれらを利用。10テストグリーン
    - ※ 当初想定の「状態コンテナ `state.js` への全面移行」は、`player` 等の参照が数百箇所に及び一括置換のデグレリスクが過大なため見送り。状態の再代入は game.js に残し、save.js は「状態を受け取り変換値を返す純粋関数」に限定した（read-only binding 問題を回避）。完全な状態集約は必要になった時点で再判断

- [x] **Step 2: 判定・ロジック系の分離（純粋関数が多い・低リスク）**
  - [x] `passable.js`：`isPassable()` / `tilePassable()` / `isPassableForEnemy()`
  - [x] `conditions.js`：`evaluateConditions()` / `checkStoneOnSwitch()`
  - ※ これらは `stageData`/`enemies`/`player`/`currentLayer`/`stageKey`/`debugMode` 等の再代入される `let` 状態を参照するため、純粋関数化ではなく **factory + 状態 getter 注入方式**を採用（`createPassable(deps)` / `createConditions(deps)`）。getter 経由で常に最新状態を読むので呼び出し側は無改修。10テストグリーン


- [x] **Step 3: 描画系の分離**
  - `render-board.js`：`renderBoard()` / `setCellClass()` / `addCellSprite()`
  - `render-chars.js`：`renderChars()` / `addCharEl()` / `moveCharEl()`
  - ※ `charLayerElRef = { value }` ラッパーを game.js に導入し、render-board が `.value` に新しい charLayerEl を書き込み、render-chars はそれを読む設計。`addShieldOverlay` / `updatePlayerCharEl` も render-chars.js に同梱。10テストグリーン

- [x] **Step 4: 入力・UI系の分離**
  - `input.js`：キーボード・タッチ・スワイプ
  - `ui.js`：HUD・ポーズ・ダイアログ・ショップ
  - ※ `initInput(deps)` factory でキーボード・モバイル・スワイプリスナーを登録し `heldKeys` / `processHeldKeys` を返す。`createUi(deps)` factory で HUD・ポーズ・ダイアログ・ショップを生成。旧インラインコード（キーボードリスナー・processHeldKeys・モバイルボタン等）を削除し、factory 生成版で全て上書き。`updateShieldHud` / `processHeldKeys` は事前に `let` 宣言を追加して TDZ を回避。10テストグリーン（デグレなし）。

- [x] **Step 5: ゲームロジック系の分離（完了）**
  - `projectile.js`：投擲物・爆弾・盾ブロック判定（`createProjectile` factory）✅
  - `enemy-ai.js`：`enemyTick()` / `bossTickHitAndAway()` / `enemyChase()` / `enemyAttack()` / `checkEnemyContact()`（`createEnemyAi` factory）✅
  - `player.js`：`movePlayer()` / `handleTileEvent()` / `checkSwitchOff()` / `giveSubItem()` / `spawnDropEffect()` 等（`createPlayer` factory）✅
  - `combat.js`：`swordAttack()` / `dealDamageToEnemy()` / `takeDamage()` / `gameOver()` / `showDmgPopupFloat()` 等（`createCombat` factory）✅
  - `boss.js`：`onBossDefeated()` / `startBossBattle()` / `startEnding()` / `checkTriforceClear()` / `checkPendingTriforce()` 等（`createBoss` factory）✅
  - ※ factory + getter 注入方式を踏襲。`_proj.fireEnemyProjectile` / `_proj.isShieldBlockingDir` / `_proj.showShieldBlockEffect` を enemy-ai に deps として渡すことで循環参照フリーな設計を実現。10テストグリーン（デグレなし）

- [x] **Step 6: エントリポイントの整理**
  - `main.js`：`init()` 呼び出し・`window.__game` テストフック・`startAnimLoop()` 呼び出し・`window.addEventListener('resize')` を切り出し。game.js は必要な関数を `export` して main.js が `import` する設計。12テストグリーン（デグレなし）

---

### 0-2b. game.js から重複した旧関数本体を削除する（分割の完遂）　🧠→⚡（依存確認はOpus、削除はSonnet）

> **⚠️ 重要：これまでの Step 2〜5 の分割は「コピー＋factory上書き」方式で進めたため、
> 切り出した関数の本体が game.js にも丸ごと残っており、game.js は 4075 行のままほとんど痩せていない。**
> ファイル数は増えたが「1ファイルを小さくして把握しやすくする」という分割本来の目的が未達成。
> このタスクで game.js 内の死蔵コード（factory版で上書き済みの旧 `function` 本体）を削除し、分割を本当に完了させる。

**現状（2026-06-14 実測）：**
```
game.js     4075行  ← 元4098行からほぼ減っていない（要対応）
player.js    698 / enemy-ai.js 555 / ui.js 529 / projectile.js 440 /
boss.js      376 / render-board.js 308 / combat.js 291 / render-chars.js 266 /
input.js     161 / passable.js 161 / conditions.js 117 / save.js 87 / main.js 78 / constants.js 36
```

**game.js に本体が重複して残っている主な関数（grep 確認済み）：**
`renderBoard`(315) / `movePlayer`(1212) / `swordAttack`(1824) / `takeDamage`(2004) / `onBossDefeated`(2498) / `enemyTick`(2845) / `projectileTick`(3412) ほか多数（各 factory 版が上書きして実際に使われている）

**進め方（安全第一・1モジュールずつ）：**
- [ ] **準備**：削除候補の棚卸し。各分割ファイル（passable/conditions/render-board/render-chars/input/ui/projectile/enemy-ai/player/combat/boss）が公開する関数名と、game.js 内の旧 `function` 本体・旧 `let`/`const` 宣言の対応表を作る
- [ ] **削除は依存の浅い順に1モジュールずつ**実施し、毎回 `npx playwright test`（13本）でデグレ確認：
  - [x] passable.js / conditions.js 分（判定系）※ Step2 時点で既に削除済みだった
  - [x] render-board.js / render-chars.js 分（描画系）※ 旧本体6関数を削除し `let` 事前宣言を追加。4075→3624行（451行減）。13テストグリーン
  - [x] input.js / ui.js 分（旧本体削除済み）
  - [x] projectile.js / enemy-ai.js 分（旧本体削除済み・3631→2726行）
  - [x] player.js / combat.js / boss.js 分 ※ factory 統合（deps配線 + 代入ブロック）→ 旧本体削除を1セットで実施。**2726→1268行（1458行減）**・13テストグリーン


- [ ] **各削除で確認すること**：
  - factory が確実にその関数を上書きしている（`xxx = _mod.xxx` が存在する）
  - 削除する旧本体が他から直接参照されていない（クロージャ変数への依存が残っていないか）
  - 旧本体だけが参照していたヘルパー関数・変数が「使われなくなったゴミ」になっていないか（あれば一緒に削除）
- [ ] **目標**：game.js を 4075行 → **大幅に削減**（理想は ~400〜800行のオーケストレーション層：状態宣言・factory初期化・export のみ）
- [ ] 完了後、PLAN.md 冒頭「現状のファイルサイズ」表と「現在の実装状態」表の game.js 行数を更新

> **学びとして DECISIONS.md にも記録済み：** 「コピー＋上書き」方式は動作の安全性は高い（旧実装を残したまま新実装に切り替えられる）が、**旧本体の削除を別ステップとして必ず実施しないと分割が完了しない**。今後の切り出しは「コピー→テスト→旧削除→テスト」を1セットにする。

---

### 0-3. sprites.js の分割　⚡ Sonnet（機械的なファイル分け）


- [x] `sprites.js`（1440行）を機能別に分割：
  - `sprites-player.js`：プレイヤー・NPC・escape/monster/darklord/princess（~340行）
  - `sprites-enemies.js`：patrol/chaser/sentry（~120行）
  - `sprites-items.js`：sword/shield/boomerang/arrow/spear/stone/key/chest/rupee/triforce/heart（~250行）
  - `sprites-tiles.js`：block/door/switch/gate/water/mapEnter/doorway系＋フィールドタイル（~400行）
  - `sprites.js` → aggregator（サブファイルをマージして再エクスポート、~100行）
- ※ HUD・UI要素は items.js・tiles.js に自然に収まったため sprites-ui.js は作成せず
- 13テストグリーン（デグレなし）

---

### 0-3b. editor.js・game.css の分割　🧠→⚡（editor.jsの分割設計はOpus、CSSはSonnet）

**editor.js（1581行）：**
- [x] 機能別に分割（マップ編集 / ステージ管理 / プレビュー / エクスポート など）
- [x] 目標：各ファイル400行以内
- ※ editor.js（1581行）を8モジュールに分割：editor-state(62) / editor-layers(85) / editor-world(289) / editor-palette(134) / editor-canvas(327) / editor-props(409) / editor-io(248) / editor.js(142=エントリ)。editor スモークテスト4本追加（起動・ステージ作成・タイルパレット・JSONエクスポート）。**17テストグリーン**（デグレなし）

**game.css（1660行）：**
- [x] CSS を機能別に分割（レイアウト / HUD / キャラ・スプライト / アニメーション / オーバーレイ など）
- [x] 目標：各ファイル400行以内
- [x] `@import` または `<link>` 複数で読み込む
- ※ `game.css` を `@import` のみのエントリファイルにし、`css/` 配下へ11ファイルに分割（base / hud / board / effects / overlays / mobile / responsive / shop / boss / ending / tiles）。@import 順は元のソース順（カスケード）を厳密に維持（特に `#boss-hpbar` の bottom が `@media(PC)` より後で後勝ちになる挙動を保つため boss.css を responsive.css の後に配置）。index.html は無改修。13テストグリーン（VRT含む＝見た目差分なし）


---

### 0-4. 必要なスプライト・モーション一覧の洗い出し　🧠 Opus（何が必要かの企画判断）　✅ 完了

> **成果物：`SPRITES_NEEDED.md`**（プレイヤーモーション/テーマ別タイル/新ボス・敵/新アイテム・エフェクトを優先度付きで洗い出し）

- [x] プレイヤー：4方向歩行2フレームは実装済みと確認 → 追加候補（剣振り/被ダメ/チャージ構え/翼の羽衣飛行/やられ）を整理
- [x] ダンジョンテーマ別背景タイル（水・炎・氷・森・砂漠・空中/闇）→ パレット差し替え方式を基本方針に
- [x] 新ボス・敵スプライト（ザーネル最優先、炎/岩の大型2×2ボス、通常敵4種）
- [x] 新アイテム（翼の羽衣・はしご・笛・ロウソク・剣ビーム等のエフェクト）
- [x] **最優先5点を抽出**（翼の羽衣 / 古代の祭壇 / ザーネル / 飛行モーション / 星の欠片）
- [x] Phase 0-5 スプライトエディタへの要件フィードバックを記載（対応グリッドサイズ・マルチフレーム・パレット差し替え等）


---

### 0-5. エディタ機能拡張（スプライト・キャラクター・タイル作成支援）　🧠→⚡（UI設計はOpus、各エディタ実装はSonnet）

**背景：**  
- プレイヤーモーションの追加、新キャラクター・敵・アイテムの増加を予定
- スプライトデータ（ピクセルアート）・キャラクター定義・敵定義・アイテム定義は、AIが自動生成するには限界があり、**人間が手作業で作成・調整**する必要がある
- 現在のエディタはステージマップ編集のみ対応
- これらの作業を効率化する支援ツールをエディタに追加する

**追加する機能：**

#### スプライトエディタ ✅ 完了（2026-06-14）
- [x] ピクセルアートを**ブラウザ上でドット絵として描けるエディタ**
  - [x] グリッド表示（32×32/16×16/12×16/8×8/6×6/64×64 をプリセットで選択可）
  - [x] カラーパレット選択（`PAL` の配列形式：先頭 transparent + 任意色。色追加・選択色変更に対応）
  - [x] フレームごとの描画（アニメ対応：追加/複製/削除＋プレビュー再生）
  - [x] 左右反転・クリア機能（コピー＝フレーム複製で代替）
  - [x] 既存スプライト（heroD 等）を読み込んで編集
- [x] 描いたスプライトを `sprites.js` の配列形式にエクスポート（パレット行 + `SPRITES.xxx = [...]`）→ textarea 表示 →「クリップボードにコピー」
- [x] 既存スプライト/パレットの選択・読込・編集
- ※ 実装：`editor/index.html`（🎨タブ＋`#view-sprite`）/ `editor/editor-sprite.js`（自己完結モジュール）/ `editor/editor-sprite.css`。スモークテスト2本追加。**19テストグリーン**

#### キャラクター定義エディタ ✅ 完了（2026-06-15）
- [x] プレイヤー・敵のキャラクター定義（`enemies.js` の中身）をフォームで編集できる
  - [x] HP・ATK・DEF・速度・スプライト名・パレット名の設定
  - [x] 攻撃パターン（sword/spear/stone + range + cooldown）の設定
  - [x] 複数攻撃パターン（attacks配列）の編集
  - [x] ボスフラグ・ヒット&アウェイ・オーラエフェクトのチェックボックス
  - [x] フェーズ設定（HP閾値・速度倍率・攻撃CD倍率）
- [x] 定義内容を JS コードとしてエクスポート
- ※ 実装：`editor/index.html`（🧙タブ＋`#view-character`）/ `editor/editor-character.js`（492行）/ `editor/editor-character.css`（117行）。スモークテスト3本追加。**23テストグリーン**（デグレなし）

#### アイテム定義エディタ ✅ 完了（2026-06-15）
- [x] アイテムの定義（`items.js`）をフォームで編集できる
  - アイテム名・アイコン・タイプ（throwable/placeable/consumable/passive）
  - 効果値（healAmount / aoeRadius / damage / breakPower / piercing / atkBonus / defBonus / damageReduction）
  - スプライト名・パレット名・uses（Infinity/null/数値）
  - EQUIP_META（sword/shield/armor のスロット別ステータス）も編集可能
- [x] 定義内容を JS コードとしてエクスポート
- ※ 実装：`editor/index.html`（📦タブ＋`#view-item`）/ `editor/editor-item.js`（自己完結モジュール）/ `editor/editor-item.css`。スモークテスト3本追加。**26テストグリーン**（デグレなし）

#### 背景タイルスプライト編集機能　⚡ Sonnet（実装のみ）　← **次タスク（2026-07-04 時点）**
> **目的：** `sprites-tiles.js` の `TILE_SPRITES.grass` 等をコード直書きせずにブラウザ上で編集できるようにする。既存のスプライトエディタ（`editor-sprite.js`）を流用・拡張するのが最小コスト。
>
> **実装方針（確認済み）：**
> - 実装先：`editor/editor-tile.js`（既存タイルエディタに追記）+ `editor/index.html`（🗺タブ内）
> - `editor-sprite.js` のピクセルグリッド描画ロジックを **コピーせずに import して流用**（または同一ファイル内で再利用）
> - 対象タイル：`TILE_SPRITE_MAP`（`shared/tile-sprites.js`）に登録済みの全エントリ（grass/sand/stone/snow/ash/mud 等）
> - スプライトは **8×8・2フレーム**（既存の TILE_SPRITES 形式に合わせる）
> - パレットは **4色**（既存の TILE_PAL 形式に合わせる）
>
> **参照すべきファイル（実装前に必ず読む）：**
> - `editor/editor-sprite.js`（ピクセルグリッドUI・パレット編集・エクスポートのリファレンス実装）
> - `editor/editor-tile.js`（追記先・TILE_PAL 読み込み・テーマプレビュー実装の参考）
> - `shared/tile-sprites.js`（TILE_SPRITE_MAP・TILE_SPRITES・TILE_PAL の実データ）
> - `editor/index.html`（🗺タブ `#view-tile` のDOM構造確認）
- [x] 「🗺 タイル」タブ（`#view-tile`）に「背景スプライト編集」セクションを追加
  - ドロップダウン or リストで編集対象タイルを選択（`TILE_SPRITE_MAP` に登録済みのもの）
  - 選択するとスプライトエディタ（8×8・2フレーム）が開く
  - 既存スプライト（`TILE_SPRITES[spr]`）と既存パレット（`TILE_PAL[pal]`）を読み込んで編集可能
- [x] エクスポート：`TILE_SPRITES.xxx = [...]` + `TILE_PAL.xxx = [...]` 形式で textarea 出力 → クリップボードコピー
- [x] スモークテスト（タブ表示・セクション存在確認）を追加

#### タイルバリエーション設計支援 ✅ 完了（2026-06-15）
- [x] ダンジョンテーマ別タイルセットのプレビュー表示
  - 「炎テーマ」「水テーマ」「氷テーマ」などで色パレットを切り替えてプレビュー
  - テーマ用パレットを設定して一括で壁・床タイルの見た目を変更できる
  - ※ 実装：`editor/index.html`（🗺タブ＋`#view-tile`）/ `editor/editor-tile.js` / `editor/editor-tile.css`。テーマプリセット8種（デフォルト/炎/水/氷/森/砂漠/空中/闇）。スモークテスト3本追加。**29テストグリーン**（デグレなし）

---

### 0-6. TypeScript・ビルドの検討（分割完了後）　🧠 Opus（採用判断）　✅ 完了（2026-06-15）

**結論：当面は plain ESModule のまま維持する（TS も `vite build` も導入しない）。Phase 0 をクローズ。**

- [x] TypeScript 採用可否を判断 → **見送り**（理由は DECISIONS.md 参照：分割済みで可読性問題は解消・Phase 1+ はコンテンツ中心で型化の費用対効果が低い・移行コスト大）
- [x] esbuild / `vite build`（bundle+minify）採用可否を判断 → **見送り**
  - 本番 Vercel は `outputs/` を素ファイルのまま静的配信（ビルドなし）。計測で本番同等構成の起動時間を実測：time-to-board は RTT 0ms=269ms / 30ms=482ms / 75ms=817ms。
  - ボトルネックは転送量（gzip後70KBで軽量）ではなく **JS27本の import 連鎖 × RTT**。`vite build` で 300〜500ms 短縮の見込みだが、無ビルド運用の手軽さ喪失・4ゲーム同居の Vercel 設定整合コストに見合わないと判断。
- [x] 再判断トリガーを記録：起動が体感で重い声／モバイル比率上昇時 → **新ツールを足さず `vite build` を blade 内で完結**させ Vercel 配信先を dist に切替（esbuild 単独導入は不要＝Vite 内部で esbuild が動くため）。

> **再判断時のメモ：**
> ```
> # blade-of-lumia 内で完結させる場合（将来）
> vite build   # 内部で esbuild(minify) + Rollup(bundle) → dist/
> ```

---

### 0-7. ギミック検証ステージをライブマップの `test_` レイヤーへ移設　🧠 Opus　✅ 完了（2026-07-25・ユーザー指摘）

**背景：** 検証ステージは `tests/fixtures/test-stages.json`（ライブマップ非参照）に隔離していたが、**fixture はエディタで開けない**＝直すたびに生 JSON の手編集になる。ユーザー指摘＝「それじゃ作業しづらいからやめてよ。テスト用のレイヤーつくればいいじゃん。別に問題ないよね？」→ **fixture を廃止し、ライブマップ `work/blade-of-lumia.json` に `test_mechanics` レイヤーを新設して18ステージ全部を移設**（ユーザー確定＝全部移設・キーはグリッド座標に振り直し）。

- [x] **`shared/layers.js` 新設＝`test_` 接頭辞のレイヤーを本編から除外する単一の判定点**（`isTestLayer` / `gameLayerEntries`）。**全レイヤー横断の3箇所を経由させた＝`countTriforces`/`listTriforceEntries`（`shared/triforce.js`）・`altarExists`（`game/boss.js`）・`warpEnterLandings`（`scripts/lib/field-quality.mjs`）。** 未対応だと（a) 検証用ボス `J`/`L` が数えられて必要な星の欠片が 8→10＝**クリア不能**、(b) テスト用祭壇で終盤フローが誤作動、(c) 受け側の無いテスト用ワープが不正着地で赤。
- [x] **移設＝`scripts/migrate-test-layer-to-live.mjs`（自己検証型・実行済み／入力 fixture は削除済みで再実行不可）。** 本編レイヤーが byte 不変・`countTriforces` 不変・各ステージが comment 接頭辞と看板本文以外 deep-equal であることを assert してから書き込む。**本文の無い看板5枚には実文を与えた**（`no-empty-signs.spec.js` は全レイヤーを走査する＝不変条件を弱めるより本文を書くほうが正しい）。
- [x] **キーはグリッド座標。** `editor/editor-world.js` が `k.split(',').map(Number)` でキーを座標として解釈する（`getWorldSize`/`insertRow`/`insertCol`/`renderWorldGrid`）∴名前キーは NaN でワールドグリッドに出ない＝移設の意味が無くなる。**名前↔座標の対応表は `tests/test-stage-keys.js` が唯一の定義**（spec も migrate もここを読む）＝下表はその写し。ステージの `comment` 先頭に `[元の名前]` を残してエディタで判別できるようにした。

  | 座標 | 名前 | 座標 | 名前 |
  |---|---|---|---|
  | `0,0` | color_switch | `9,0` | bow_gate |
  | `1,0` | torch_relay | `10,0` | double_door |
  | `2,0` | arrow_switch | `11,0` | candle_gate |
  | `3,0` | bomb_wall | `12,0` | melee_only_boss（👑 isBossRoom） |
  | `4,0` | enemy_stone | `13,0` | fish_swim |
  | `5,0` | hidden_cave_test | `14,0` | fish_swim_bg |
  | `6,0` | ladder_isolated | `15,0` | lurk_shark |
  | `7,0` | ladder_pit | `16,0` | archer_fish |
  | `8,0` | ladder_water2 | `17,0` | ladder_bg_bridge |

  **新ステージは次の空き列（`18,0`）に足し、`tests/test-stage-keys.js` に1行足す。**
- [x] **`ps_mapSrc`（プレビュー URL でマップ JSON を差し替える口）を撤去**（`game/game.js`）＝fixture を読ませるためだけの機構で、移設後は不要。プレビュー URL は本編と同じ `?fromEditor=1&layer=test_mechanics&stage=<座標>&row=&col=&ps_*=1`。
- [x] **13 spec を再配線**（arrow-switch/color-switch/torch/bomb-torch/enemy-stone-puzzle/hidden-passages/bow-gate/candle-gate/double-door/melee-only-boss/ladder/aquatic-enemy/sea-enemies）＝`stageKey(名前)` 経由で座標を解決する（座標をハードコードしない）。「まだ本編に配置していない」系の走査（aquatic-enemy⑤・sea-enemies⑨・swamp-boss④）は `gameLayerEntries` 経由に変更。
- [x] **不変条件を新 spec で固定＝`tests/test-layer.spec.js`（5本）：** ①欠片総数8＋**除外なしで数えると10になることも assert**（vacuous pass 防止）／②`test_` 接頭辞の規約／③全キーが整数グリッド座標／④対応表とライブマップの一致＋`comment` の `[名前]`／⑤`startPos` は本編 field。**全326テスト緑**（321＋5）。
- [x] **実ブラウザ確認：** エディタに `test_mechanics` タブ（全14レイヤー）／ワールドグリッドに18セル（`(0,0)`〜`(17,0)`・`(12,0)`は👑）／セルを開いて `#btn-edit-stage` でキャンバス描画／欠片サマリは 8 のまま／ゲームは通常起動＝field `7,14`・プレビューで `test_mechanics/15,0` に潜み鮫が出る／0 pageerror。
- [x] **エディタの `@` 重複排除をレイヤー内に限定**（`editor/editor-canvas.js`）＝全レイヤー走査のままだと、検証ステージに `@` を置いた瞬間に**本編の開始位置が消える**（各検証ステージは自前の `@` が要る）。
- [x] **エディタの「敵」カウントが新敵を数えない問題を修正（2026-07-25・🧠 Opus）✅**（移設前からの既存挙動。当初「記号タイル3種（`&`/`<`/`/`）が漏れる」と記録したが、実際は**手書き表が6文字だけ＝13タイルが漏れていた**：名前付きボス `Z A L N J O U G I` ＋記号敵 `& < /`）
  - `shared/enemies.js` に**単一の真実**を追加＝`ENEMY_TILES`（`Object.keys(ENEMY_META)`・全18）と `isEnemyTile()`。`editor/editor-canvas.js`（ステージ情報パネル）と `editor/editor-world.js`（ワールドグリッドのサマリ）の手書き表を差し替え。
  - 同じ手書き表が `scripts/lib/field-quality.mjs` にも2つあった（`_THREAT` 18行の脅威度表・`ELITE_TILES`）ので **`ENEMY_META` からの導出に置換**：`_THREAT = hp*atk/(def+1)`、`ELITE_TILES = isBoss || SENTRY`。置換前後で値・集合が完全一致することを数値で確認済み（`field-invariants` も W1 0／W2 0／2軸未満 108／重複 7／trap 0 でベースライン同値）。
  - 回帰テスト：`tests/field-quality-lib.spec.js` に4本（全18タイルが `battleScore` で >0／脅威比が `hp*atk/(def+1)` と一致／`isBoss` は単体で `combat` 軸が立つ／非ボス雑魚は立たない）、`tests/editor.spec.js` に1本（`&`/`<`/`L`/`E` を置いたステージで敵カウント＝4、ワールドグリッドとステージ情報の両方）。**全336テスト緑**・実ブラウザで敵カウント 4 を確認。
  - **∴ 以後「敵タイルの一覧」を手書きしない**（→ DECISIONS ADR）。

---

## Phase 1：ストーリー基盤の実装

**目的：** ゲームにストーリーの骨格を与え、「なぜ旅をするか」が分かるようにする。

### 1-1. テキスト・名称の変更　⚡ Sonnet（単純な置換）　✅ 完了（2026-06-15）
- [x] 「トライフォースのかけら」→「星の欠片（せいのかけら）」に全置換
  - **影響範囲が広いので注意**：表示テキスト（game.js）・`tiles.js`（`ITEM_TRIFORCE_PIECE`・ラベル）・`items.js`・既存JSONマップデータ（`Q` タイル）に及ぶ
  - **方針：表示名のみ「星の欠片」に変更し、内部の変数名・タイル文字（`Q`/`ITEM_TRIFORCE_PIECE`/`triforceCount`）は当面そのまま残す**
    - 理由：既存のセーブデータ・JSONマップとの互換性を壊さないため
    - 完全リネームは Phase 0 の分割完了後に安全に実施（やるなら一括置換＋テスト）
  - ※ 変更箇所：`shared/tiles.js`（ラベル）・`game/boss.js`（pulse×2・エンディング文）・`game/player.js`（pulse）・`work/blade-of-lumia.json`（NPC台詞）。内部変数名は維持。29テストグリーン（デグレなし）
- [x] エンディングメッセージを新ストーリーに合わせて書き直す
  - 「魔王を倒し...」→「ザーネルを倒し、すべての星の欠片を集め、女王ルミアの呪いを解いた。光が世界に戻り、ルミアの地に平和が訪れた……」

### 1-2. 序盤：老賢者との出会い　🧠→⚡（台詞・導入の設計はOpus、配置実装はSonnet）　✅ 完了（2026-06-15）
- [x] 開始直後（最初の村）に老賢者NPCを配置
  - field `1,0`（最初の村）のプレイヤー開始位置（row2,col2）の真南 row3,col2 に NPC タイル `b`（茶系パレット＝老人風）を配置
  - 専用スプライトは未作成（新規スプライトは Phase 0-4 管轄）のため既存 `b` を流用し、名前・台詞で「老賢者」と分かるようにした
- [x] 老賢者の台詞でストーリー導入（`npcData["3,2"]` に5行）
  - 「女王ルミアが魔術師ザーネルの呪いで石になった」
  - 「星の欠片を8つ集めて古代の祭壇に捧げれば呪いは解ける」
  - 「ザーネルがダンジョンに魔物を放ち欠片を封じている」「旅に出よ、若き勇者よ」
  - ※ 既存の村人タロ（道案内）と役割分担：タロは方向案内、老賢者がストーリーを語る

### 1-3. ゲーム終盤フローの変更　🧠 Opus（状態遷移の設計）　✅ 完了（2026-06-15）
- [x] 8個集まった時のフローを変更：
  - 現在：8個集まるとすぐエンディング
  - 変更後：「古代の祭壇」があるステージに誘導 → 捧げると「翼の羽衣」入手 → 暗黒の塔解放 → ラスボス → エンディング
- ※ **設計＋安全な基盤実装**を実施（祭壇・塔・ザーネルの本体配置は 1-4/1-5）。後方互換のフォールバックを残す方針：
  - `constants.js`：終盤フローの MAP_ENTER 予約 id（`ALTAR_EXIT_ID='altar'` / `DARK_TOWER_EXIT_ID='darkTower'`）を定義。1-4/1-5 はこの id を `mapEnters.<pos>.id` に設定する契約
  - `tiles.js`：ラスボス `ZARNEL`（タイル `Z`）追加。`DARK_LORD`（`X`）は「星の欠片を落とすダンジョンボス」として分離
  - `enemies.js`：`ZARNEL` の ENEMY_META 追加（`isFinalBoss:true`・HP80・2フェーズ。専用スプライト未作成のため darklord 流用）
  - `game.js`：`player.hasWingRobe` フラグ追加（初期化2箇所）。`saveGame` は player 全体を JSON 化するため save/load は自動対応。createBoss deps に `getExitRegistry` 注入
  - `boss.js`：`checkTriforceClear` を分岐化（**祭壇 id があれば祭壇へ誘導／無ければ従来エンディング**・羽衣取得済なら何もしない）。`onBossDefeated` に **`isFinalBoss` 撃破でエンディング発火**を追加
  - 検証：29 Playwright テストグリーン＋分岐ロジックの一時 Node テスト5ケース（祭壇有無×収集状況×羽衣有無）グリーン（確認後削除）

### 1-4. 古代の祭壇の実装　🧠→⚡（仕組み設計はOpus、実装はSonnet）　✅ 完了（2026-06-15・最小版/タイル方式A案）
- [x] 古代の祭壇を**フィールドに祭壇タイル（`ALTAR='^'`）1個**として配置（専用ステージ方式ではなく A 案）。最初の村 field `1,0` の row8,col6
  - ※ 1-3 の `altarExists()` を「MAP_ENTER id 検出」→「祭壇タイル `^` の検出」に変更（専用ステージ id も併用フォールバック）。これで全収集時に「祭壇へ向かおう」誘導が出る
- [x] 祭壇インタラクション：星の欠片を全部（`calcTotalTriforces()` 個）持っていれば捧げられる（`boss.js` の `offerAtAltar()`）。不足時は「あと N つ足りない」、取得済は「すでに授かった」
- [x] 捧げた時の演出：光柱フラッシュ（`showAltarLightPillar()`）・fanfare・「翼の羽衣を授かった！」メッセージ・`player.hasWingRobe = true`（saveGame で永続化）
- ※ 描画は専用スプライト未作成のため絵文字 `⛩` フォールバック（render-board.js）。専用スプライトは Phase 0-4 SPRITES_NEEDED.md の最優先5点
- ※ 検証：全29テストグリーン＋エディタプレビュー（`ps_triforce=3` で全収集スポーン）で祭壇に乗り「翼の羽衣」付与・hasWingRobe がセーブに永続化を実ブラウザ確認（一時 spec、確認後削除）

### 1-5. 暗黒の塔（ラストダンジョン）　🧠→⚡（飛行・入場ロジックはOpus、ステージ作成はSonnet）　✅ 完了（2026-06-15）
- [x] 暗黒の塔ステージを作成（`dark_tower` レイヤー：入口フロア `0,1` → ボス部屋 `0,0`）
  - 入口は MAP_ENTER テレポート方式（field の閉じた縁に依存しない）。field `3,0` の到達可能な床(2,2)に portal MAP_ENTER（`id:'fieldToTower'`/`destId:'darkTower'`）を配置 → `destId==='darkTower'`(=`DARK_TOWER_EXIT_ID`) なので game.js が `hasWingRobe` ゲートを適用
  - **飛行移動システムを実装**（ユーザー選択：フル実装）：`player.flying` フラグ・`toggleFlight()`（F キー / モバイル🪽ボタン）。飛行中は**自然物（`SKY`/`WATER`/`TREE`/`BUSH`/`FENCE`）を飛び越えられる**が、**山・壁・家・閉じた門/扉は越えられない**（`passable.js` の `FLYABLE_OVER` Set で種別分類・per-instance データ追加なし）。着陸は地上タイルの上だけ・ステージ遷移で自動着陸（到着が空/水なら飛行維持）。飛行で木境界を越えて遷移先の無い端に出た場合はマップ内へクランプして詰みを防ぐ
  - field `4,0`（空島）：到着足場(3,2) → 虚空 `SKY` の谷(cols4-7) → 浮島の塔入口(3,9)。谷は全行 SKY で分断＝翼の羽衣の飛行でしか渡れない（BFS で「徒歩では塔到達不可・飛行で到達可」を検証）
  - 通常より難しい敵配置（入口フロアに追跡者×2・騎士×2）
  - 最上階のボス部屋にラスボス **`ZARNEL`（タイル `Z`）** を配置（ボス用ドアウェイ `:` で入室ロック・撃破で boss.js の `isFinalBoss` 分岐がエンディング発火）
- [x] ザーネルとの決戦後、女王復活のエンディングに繋げる（`onBossDefeated` の `isFinalBoss` 分岐で発火・実ブラウザで撃破→エンディング発火を確認）
- ※ 実装：`shared/tiles.js`（`SKY`）・`game/passable.js`（飛行通過）・`game/player.js`（`toggleFlight`）・`game/game.js`（飛行ゲート・自動着陸・flying 初期化/state・ps_wingrobe）・`game/input.js`（F/🪽）・`game/ui.js`（飛行ボタン表示）・`game/render-board.js`＋`game/css/tiles.css`（空タイル描画）・`game/render-chars.js`＋`game/css/board.css`（飛行浮遊演出）・`work/blade-of-lumia.json`（field 4,0・dark_tower レイヤー）。スモークテスト3本追加（`tests/dark-tower.spec.js`）。**全32テストグリーン**

#### 1-5 改善 TODO（後日対応）
- [ ] **ステージ遷移で飛行状態をリセットしないようにする** 🧠→⚡
  - 現状：`game/game.js` の `enterStage` が「到着セルが地上なら自動着陸（`player.flying=false`）、空/水なら飛行維持」になっている。そのため**飛んだまま地上のあるステージへ渡ると、毎回着地させられて飛行が解除される**（境界の木を越えてフィールドを飛び回るとき、ステージをまたぐたびに着陸して再離陸が必要＝煩わしい）
  - あるべき挙動：**プレイヤーが飛行中なら、ステージが切り替わっても飛行状態を維持する**。着陸はプレイヤーの操作（F/🪽トグル）でのみ行う
  - 注意点：自動着陸を撤廃しても「空/水の上に着地スポーンしても飛行維持で詰まない」現行の安全性は保たれる（飛行中なので移動可能）。逆に、遷移先で**飛行中のまま地上に降り立ちたい**ケースはトグルで対応すれば足りる
  - テスト：飛行中にステージ端遷移（または MAP_ENTER）した直後 `player.flying === true` のままであることを確認する spec を `tests/dark-tower.spec.js` に追加

---

## Phase 2：ゲームループ完成（8ダンジョン）

**目的：** 「8つのダンジョンを攻略して欠片を集める」という核となるゲームループを完成させる。

> ⚠️ **2026-06-22 見直し（重要）：** Phase 2 は「8ダンジョンの器（入口部屋＋ボス部屋の2部屋スタブ）」を作っただけで、**ゲームとしての進行設計（背骨）が無いまま「完了」扱いになっていた**。実態は本物のダンジョンは dungeon_1（12部屋）のみで、dungeon_2〜7・cave_1 は各2部屋スタブ。**この問題は新設の Phase 9（進行設計＆ダンジョン作り込み）で本格的に解消する。** 詳細は DECISIONS.md 2026-06-22「Phase 9（設計）」を参照。

### 2-1. ダンジョン数の拡張　⚡ Sonnet（エディタでのステージ作成が主）　✅ 完了（2026-06-15）
- [x] 現在のダンジョン数を確認し、8つになるまで追加
  - dungeon_1（草原の洞窟）/ cave_1（砂漠系）/ dark_tower（ラスト）に加え dungeon_2〜dungeon_7 を追加。計8ダンジョン体制へ
- [x] 各ダンジョンにテーマを設定（最小構成：入口部屋 1,0 + ボス部屋 0,0）：
  1. 草原の洞窟（dungeon_1 — 既存）
  2. 砂漠の神殿（dungeon_2 — field 1,2 row7 から入場）
  3. 水の迷宮（dungeon_3 — field 2,0 row3 から入場）
  4. 炎の神殿（dungeon_4 — field 0,1 row8 から入場）
  5. 氷の廃墟（dungeon_5 — field 2,1 row8 から入場）
  6. 森の聖域（dungeon_6 — field 1,2 row4 から入場）
  7. 空中の遺跡（dungeon_7 — field 2,0 row7 から入場）
  8. cave_1（既存）/ dark_tower（ラスト）
  ※ `calcTotalTriforces()` が動的カウントするため DARK_LORD `X` 7体分が星の欠片9個に反映される（直接2個 + 魔王7体）。祭壇では「あと○つ足りない」と正確に表示される
  ※ BFS で全6新規入口の到達可能性を検証。遷移テスト2本（dungeon_2/dungeon_5）追加。**全35テストグリーン**

### 2-2. ダンジョンボス　🧠→⚡（ボス設計はOpus、配置・調整はSonnet）　✅ 完了（2026-06-16）
- [x] 各ダンジョンに固有ボスを配置（現在の実装を活用・拡張）
  - dungeon_2〜7 を完全リデザイン：entry room `0,0`（テーマ地形・敵・宝箱・石碑）+ boss room `1,0`（isBossRoom=true・DARK_LORD X・DOORWAY_BOSS `:`）
  - ステージ構成：entry `0,0` 右端開口 col11 → boss `1,0`（x>=cols 遷移）。boss `1,0` 左端 `:` → entry `0,0`（x<0 遷移）
  - テーマ：砂漠の神殿(2)・水の迷宮(3)・炎の神殿(4)・氷の廃墟(5)・森の聖域(6)・空中の遺跡(7)
  - フィールド接続は entry `0,0` の MAP_ENTER（`id:'dungeon_X'`）に集約。exitRegistry で正しく解決される
- [x] ボス撃破後に「星の欠片」が出現する演出を実装
  - 既存の `onBossDefeated` が DARK_LORD 撃破で `Q`（星の欠片）を drop する実装を活用（既実装）
  ※ デバッグ用一時テストファイル（debug-boss*.spec.js）を削除。**全37テストグリーン**

### 2-3. ダンジョン進行のヒント　⚡ Sonnet（テキスト配置）　✅ 完了（2026-06-16）
- [x] ダンジョンの入り口付近に「ここに何があるか」を匂わせる石碑・看板
  - 全8ダンジョン入口付近に石碑（看板 `i`）を配置（ダンジョン名・テーマ説明・入口方向）
- [x] NPCの噂話が次のダンジョンの方向を示す（フィールドNPCの台詞設計）
  - タロ・すみっこずき・賢者エルン・ピンクあたまに方向ヒント台詞を追加

### 2-4. フィールドマップ拡張　🧠→⚡（マップ全体設計はOpus、作成はSonnet）　✅ 完了（2026-06-16）
- [x] フィールドを広げて8つのダンジョンへの道を整備
  - BFS（`scripts/check-field-connectivity.mjs`）でワールドマップ全体の徒歩到達性を機械検証。8ダンジョン中6つは徒歩で直接到達済み、残り2つは**既存のギミック付きの道**だと判明：
    - dungeon_4（炎の神殿, field 0,1）：field 1,1 西端の**爆弾で壊せる壁** `!` 経由（NPCハナが明示）
    - cave_1（沼地の洞窟, field 3,1）：field 3,0 の**鍵のかかった扉** `D`（鍵 `K` は東の魔物が守る）＋石押しパズル経由
    - field 4,0（空島）は飛行のみ＝終盤仕様（到達不可は意図どおり）
  - **唯一の穴：field 3,0 のヒントが皆無**だった（鍵・扉の存在が分からず詰む恐れ）→ 補完（下記）
- [x] 各ダンジョンへの道のりに小さな謎・ギミックを配置
  - 既存ギミック（爆弾壁・鍵扉・石押し）は前フェーズで配置済みと確認。本タスクでは**沼地への道のヒントを補完**：
    - field 3,0 (8,5) に石碑追加：「鍵のかかった扉・鍵は東の魔物が守る・扉は南の柵の切れ目」を案内
    - field 2,0 すみっこずきに「東の先に沼地の道・鍵扉の先に古い洞窟」の噂を追加
  - **回帰テスト固定**：`tests/field-connectivity.spec.js`（データレベルBFS）で全8ダンジョン入口の徒歩到達性（ギミック解放込み）＋沼地ヒント石碑の存在を保証。**全39テストグリーン**

---

## Phase 3：アクション・戦闘の深化

**目的：** 戦闘を「ただ殴るだけ」から「考えて戦う」ものにする。

### 3-1. チャージ攻撃（剣ビーム）　🧠→⚡（チャージ機構の設計はOpus、実装はSonnet）　✅ 完了（2026-06-16）
- [x] 攻撃ボタン長押しでエネルギーゲージが溜まる
  - 押した瞬間に通常の剣が出る（既存 `swordAttack()`）→ 押しっぱなしでチャージ開始（論理時間 `gameNow` 基準）
  - 離した時のチャージ量で発射を判定：**1/4未満=ビームなし／1/4以上=弱ビーム（剣ATK・非貫通）／満タン=強ビーム（剣ATK×2・貫通）**
  - チャージ中は移動速度 0.5倍（`getChargeMoveSpeedFactor`）
- [x] ゲージ満タンで「剣ビーム」を発動
  - 正面方向に光の剣撃を飛ばす（満タンは貫通）。ビームは projectile.js の `addProjectile({type:'beam'})` に乗せ、`checkProjHit` に貫通対応（`piercing` + `_hitIds` で二重ヒット防止）を追加
- [x] チャージ中のゲージ表示・エフェクト追加
  - プレイヤー上の CSS オーラ（`.charge-aura` → ready/full クラス）＋ビーム本体（`.sword-beam` / `.beam-strong`）。専用ドット絵スプライトは後回し（既存スラッシュ演出と同じ CSS 代用方針）
- ※ 実装：`game/constants.js`（CHARGE_* / BEAM_*）・`game/charge.js`（`createCharge` factory 新設）・`game/game.js`（factory 配線・gameTick で `tickCharge`・enterStage で `cancelCharge`）・`game/input.js`（攻撃キー/剣ボタンの press→剣+startCharge / release→releaseCharge・チャージ中の移動減速）・`game/projectile.js`（beam 描画＋貫通）・`game/css/effects.css`（オーラ・ビーム）・`game/main.js`（テストフック）。`tests/charge-beam.spec.js` 3本追加。**全42テストグリーン**（VRT 含む）

### 3-2. ボスの大型化　🧠 Opus（複数セル当たり判定の設計が難所）　✅ 完了（2026-06-16）
- [x] 2×2セルサイズ以上のボスを実装（**汎用の size:{w,h} 機構**として実装。試作1体で動作確認済み）
  - [x] 当たり判定を複数セルにまたがるよう拡張
    - `ENEMY_META.size:{w,h}`（省略時 1×1）を追加 → `buildEnemies` が `e.w/e.h` を付与
    - 共通ヘルパー `game/hitbox.js`（`enemyPointHit`/`enemyCenter`/`enemyW/H`）で占有範囲(AABB)判定に一般化。**1×1 では従来挙動と完全一致**（デグレなし）
    - 適用：投擲物/ビーム `checkProjHit`・接触 `checkEnemyContact`・剣 `swordAttack`（body 半サイズぶんリーチ拡張）・敵移動 `isPassableForEnemy`（w×h 占有）・プレイヤー `isPassable`（大型敵セルをブロック）
  - [x] スプライトも大型に対応（`render-chars.js` の `applyEnemySize` で wrapper を w×h セルに拡げ canvas を全面追従。24×24 `rockGolem` スプライト新規作成）
  - [x] 試作：新規 2×2 敵 `ROCK_GOLEM('G')`「岩のゴーレム」を定義。**dungeon_1（最初のダンジョン）のボスに正式採用**（isBoss:true・hitAndAway AI・hp30/atk4/def2・近接剣 range2.2＋岩投げ・HP50%加速）。ボス部屋 dungeon_1 `2,0` の魔王 X を G に置換（開始村の試作 G は撤去）
  - [x] **「動いてる感じ」を付与**：(1) hitAndAway AI で向き切替（`rockGolem{D/R/L/U}` エイリアス・左は flipX・差し替え時も大型 100% 維持）、(2) `board.css` の `golem-lumber` 重々しい揺れアニメ（`large-enemy` クラス）、(3) コア/眼の脈動
  - [x] **欠片整合：汎用 `dropsTriforce` フラグ**で担保（`onBossDefeated` ドロップ＋`calcTotalTriforces` カウントを DARK_LORD 決め打ちから一般化）。合計必要数は9個のまま不変
  - [x] テスト：`tests/large-enemy.spec.js` 3本＋全45テストグリーン（VRT 基準画像更新済み）。実機で dungeon_1 ボス部屋のゴーレム描画・ロック演出・AI 向き切替・エラーなしを確認
  - [x] **大型敵を複数種つくる**（2体目・3体目）：
    - **炎のサラマンドラ `FIRE_SALAMANDER('A')`**（dungeon_4 炎の神殿）：24×24スプライト（溶岩色・オレンジ炎系）・hp35/atk5/def2・hitAndAway・近接剣2.2＋炎石投げ・HP50%加速+攻撃頻度UP。向きエイリアス4つ
    - **氷のリヴァイアサン `ICE_LEVIATHAN('L')`**（dungeon_5 氷の廃墟）：24×24スプライト（氷蒼・白氷核脈動）・hp40/atk4/def3・hitAndAway・咬みつき2.5＋氷礫・HP50%加速。向きエイリアス4つ
    - dungeon_4/5 ボス部屋の `X` を `A`/`L` に置換。`dropsTriforce:true` で欠片整合は自動維持
    - `tests/large-enemy.spec.js` に「2×2 注入でエラーなし・wrapper 大型サイズ」テスト追加。**全46テストグリーン**
    - **砂嵐の蠍王 `SAND_SCORPION('N')`**（dungeon_2）・**深海の海蛇 `SEA_SERPENT('J')`**（dungeon_3）・**古森の巨人 `FOREST_GIANT('O')`**（dungeon_6）・**嵐の鷲王 `STORM_EAGLE('U')`**（dungeon_7）の4体を一括追加。64×64スプライト・ENEMY_META・向きエイリアス・JSON配置。**全46テストグリーン**（変更なし）
    - **Phase 3-2 完了。全8ダンジョンボスが固有大型ボスに**

### 3-3. ボスの弱点属性　🧠→⚡（データ構造設計はOpus、各ボス設定はSonnet）　✅ 完了（2026-06-16）
- [x] **`enemies.js` の `ENEMY_META` に `weakness` フィールドを新設**
  - `weakness: { type, multiplier }`（type='sword'|'beam'|'arrow'|'boomerang'|'bomb'）。未定義なら弱点なし＝全攻撃等倍（後方互換）
- [x] 各ボス（8大型ボス）に「弱点アイテム」を設定（武器をバラけさせて使い分けを促す）
  - 岩のゴーレム→爆弾(×3) / 氷のリヴァイアサン→爆弾(×3) / 炎のサラマンドラ→弓矢(×2) / 嵐の鷲王→弓矢(×2) / 深海の海蛇→剣ビーム(×2) / 古森の巨人→爆弾(×2) / 砂嵐の蠍王→ブーメラン(×3)
- [x] `dealDamageToEnemy()` で攻撃種別 `atkType` を受け取り、弱点なら倍率を適用するよう改修
  - 攻撃元が種別を渡す：剣→`'sword'`・投擲物→`proj.type`（'arrow'/'boomerang'/'beam'）・爆弾→`'bomb'`。倍率は def 適用前の素ダメージに乗算
- [x] 弱点ヒット時に特別なエフェクト・SEを出す（プレイヤーへのフィードバック）
  - ダメージポップアップを「WEAK! -N」のオレンジ大文字（`.weak-dmg`）に・敵中心に放射状フラッシュ（`.weak-burst`）・高めの SE（`key` 音を代用）
- ※ 実装：`shared/enemies.js`（weakness フィールド＋8ボス設定）・`game/combat.js`（`dealDamageToEnemy(e,dmg,atkType)` 弱点判定＋`showWeaknessBurst`）・`game/projectile.js`（proj.type/bomb を atkType として渡す）・`game/game.js`（wrapper に atkType・`dealDamageToEnemyById`/`injectTestEnemy` の type 引数）・`game/main.js`（`__game.dealDamage`/`injectEnemy` の type）・`game/css/effects.css`（weak-dmg/weak-burst）。`tests/weakness.spec.js` 4本追加。**全50テストグリーン**

### 3-4. ブーメランのスタン効果　⚡ Sonnet（既存処理への追加）
- [x] ブーメランが敵に当たった時、一定時間スタン（動けなくなる）
- [x] スタン中は ⭐ エフェクト表示・敵の移動・攻撃をスキップ（BOOMERANG_STUN_MS=1500ms）

---

## Phase 4：サブアイテム拡充

**目的：** 「どのアイテムをどこで使うか」という楽しさを増やす。

> **⚠️ 共通ルール（新アイテム実装時）：エディタのプレビュー設定に所持トグルを必ず追加する**
> 新しいサブアイテム/能力（はしご・笛・ロウソク等）を実装したら、ユーザーが動作確認できるよう
> **エディタの「▶ プレビュー設定」ダイアログにチェックボックスを追加**する（`editor/index.html` の
> `#preview-settings-grid` に `<input id="ps-xxx">`、`editor/editor-io.js` の `getPreviewSettings()` と
> `openPreview()` の URL 組み立てに `ps_xxx` を追加、`game/game.js` の `fromEditor` 分岐で `ps_xxx` を解釈）。
> 動作確認を前提にした能力（移動・探索系）はデフォルトでチェック ON にしておくと確認が楽。
> 参考実装：はしご（`ps_ladder`・デフォルト ON）／翼の羽衣（`ps_wingrobe`・デフォルト OFF）。

### 4-1. はしご　🧠→⚡（通行判定への影響設計はOpus、実装はSonnet）　✅ 完了（2026-06-16）
- [x] 「はしご」アイテムを実装（**自動わたり方式**＝初代ゼルダ式。所持しているだけで効果）
  - 操作不要：両隣（交差軸）が地上の水/穴を1セルだけ自動で渡れる
  - **2連続の水/穴は渡れない**（橋脚＝交差軸の隣が地上にならないため自然にブロック）
  - 対象タイル：水（WATER）＋**新タイル 穴（PIT='x'）**。穴は徒歩通行不可なので「落下」は発生しない（構造的に踏み込めない＝安全）
- [x] はしごが必要なパズルステージの追加（dungeon_3 0,0 最下段：はしご宝箱→単セルの穴2つを渡って報酬宝箱）
- ※ 実装：`shared/tiles.js`（PIT タイル）・`shared/items.js`（ladder 定義）・`game/passable.js`（`LADDER_OVER`／`isLadderBridge`／`isLadderBank`／PIT ブロック）・`game/game.js`（`player.hasLadder` フラグ初期化2箇所・`ps_ladder` プレビュー・getState 公開）・`game/player.js`（宝箱 `type:'ladder'`／giveSubItem passive 分岐）・`game/render-board.js`＋`css/tiles.css`（穴の描画）・`game/render-chars.js`（水/穴上のはしごオーバーレイ）・`editor/editor-props.js`（宝箱の「はしご」選択肢）・`work/blade-of-lumia.json`（dungeon_3 パズル）。`tests/ladder.spec.js` 4本追加。**全57テストグリーン**
- ※ 取得管理は `hasWingRobe` と同型のブールフラグ（save/load 自動対応・passive サブアイテムスロットの混乱を回避）

### 4-1b. はしごの描画を「セル固定」に修正する　⚡ Sonnet（描画位置の修正のみ）　✅ 完了（2026-06-16）
> **背景（ユーザー指摘・2026-06-16）：** 現状のはしご描画は**プレイヤーに張り付くオーバーレイ**になっており、
> プレイヤーが乗っている1セルにだけ・プレイヤーと一緒に動いてしまう（＝はしごがプレイヤーを追従する）。
> **これは誤り。** 初代ゼルダの伝説のように、はしごは「**架かっているセル（水/穴セル）の上に固定で描画**」され、
> プレイヤーはその上を歩く（はしごはプレイヤーの移動に追従しない）のが正しい。
>
> **現状の実装：** `game/render-chars.js` の `addLadderOverlay(div)` が、**プレイヤーの char-abs 要素の中**に
> ladder スプライトを `z-index:-1` で入れている。プレイヤーが乗っている水/穴セルにだけ・移動と一緒に動く。
>
> **あるべき実装（修正方針）：**
> - はしごは **board 側（セル）に描画**する。プレイヤー要素には入れない。
> - **「はしごが架かっている水/穴セル」を判定して、そのセルに ladder スプライトを敷く**。
>   - 「架かっている」の定義：はしご所持中（`player.hasLadder`）で、その水/穴セルが `isLadderBridge`（交差軸の両隣が地上）を満たすセル。
>   - 向き（縦 `ladderV` / 横 `ladderH`）は**そのセル自身の地形**で決める（プレイヤーの向きではない）：左右が地上なら横向き、上下が地上なら縦向き。
>     ※ プレイヤーの移動方向に合わせるのは誤り。セルの「橋がどっち向きに架かるか」で決まる。
> - 描画タイミング：`render-board.js`（セル描画）に組み込むか、`render-chars.js` の `renderChars` で**水/穴セルごとに**敷く。
>   - 注意：`passable.js` の `isLadderBridge`/`isLadderBank` は factory 内ローカル関数。描画側から同じ判定を使えるよう、(a) `createPassable` の戻り値に `isLadderBridge` を加えて export するか、(b) 描画側に同等の軽い判定を持たせる、のどちらかにする（(a) を推奨：判定の二重定義を避ける）。
> - **はしごを常時表示するか/所持時のみか**：初代ゼルダは「はしごを持っていて、かつ架かるセルに乗ったとき」だけ表示。
>   ここは「**はしご所持中は、架かるべき全セルに常時表示**」でも「**プレイヤーが乗っているセルだけ表示**」でもよいが、
>   少なくとも「プレイヤーに追従して別セルへ動く」現象は無くすこと。**まず『プレイヤーが乗っている水/穴セルに、そのセル固定で表示』が最小修正**。
> - 既存の `addLadderOverlay`（プレイヤー要素への追加）は削除する。
>
> **テスト：** `tests/ladder.spec.js` に「はしごスプライトがプレイヤー要素の**外**（セル側）に描画される」or「プレイヤーが乗っている水/穴セルの DOM にはしごが付く」ことを確認する spec を追加してもよい（描画位置の回帰防止）。
>
> **スプライト自体は流用可：** `shared/sprites-items.js` の `ladderV` / `ladderH`（16×16・`ladder` パレット）は作成済み。向き判定とアタッチ先だけ直せばよい。

- [x] `addLadderOverlay`（プレイヤー要素内に常時敷く旧実装）を撤去し、**初代ゼルダ式**＝「**渡っている最中だけ・足元の水/穴セルに1枚出て、渡り切ると消える**」に修正
- [x] はしごは char-layer の `.char-ladder`（セル固定・プレイヤー非追従）として描く。プレイヤーが今重なっている水/穴の橋セルにだけ出す
- [x] 向きは**セルの地形**（左右地上＝横／上下地上＝縦）で決める
- [x] `isLadderBridge` を描画側から使えるよう `ladderOrientationAt(r,c)` を新設して `createPassable` の戻り値に追加（向き判定込み・判定の二重定義を避ける）
- [x] z-index：セル描画より上・プレイヤー/敵（char-abs）より下（`.char-ladder` を `z-index:-1`）
- ※ 当初「全橋セルに常設描画」する誤実装をしてユーザー指摘で修正（DECISIONS.md 参照）。常設ではなく「踏み込んだセルだけ・渡り切れば消える」が正
- ※ 実装：`game/passable.js`（`ladderOrientationAt(r,c)` 新設・export）・`game/game.js`（destructure に追加・`createRenderChars` に `ladderOrientationAt` 注入）・`game/render-chars.js`（`updateLadderOverlay()` 新設、`updatePlayerCharEl`/`renderChars` から呼ぶ）・`game/css/tiles.css`（`.ladder-sprite` セル全面）。`tests/ladder.spec.js` に「渡っている最中だけ出る／渡り切ると消える」回帰テスト1本（計5本）。**全58テストグリーン**

### 4-1c. はしごの「進入軸」通行判定に修正する　⚡ Sonnet　✅ 完了（2026-06-17）
> **背景（ユーザー指摘・2026-06-16〜17）：** 4-1b 完了後も2つの不具合が残っている。
>
> **不具合①：連続する水/穴を「渡れてはいけない方向」に渡れてしまう（核心バグ）**
> - 現状の `isLadderBridge(r,c)` は「**横向きの橋（左右が陸）OR 縦向きの橋（上下が陸）のどちらかが成立すれば通行可**」という
>   **方向を問わない**判定になっている。
> - 例：dungeon_3 0,0 の col4 は縦に水が連続している（row2〜7 が `~`）。各水セルは「左右(col3,col5)が陸」なので
>   **横向きの橋としては全部成立**してしまう。その結果、プレイヤーが col4 を**縦（下）方向に歩いても**各セルが
>   横向き橋として通行可になり、**連続した水を縦にスルスル渡れてしまう**。
> - **あるべき仕様：** はしごで渡れるのは「**進行方向に1セルだけ・その先が陸**」のときのみ。
>   水/穴のセルが進行方向に連続している場合、その方向には渡れない。
>
> **あるべき実装（①の核心・唯一の修正点）：**
> - ルールは1つに集約できる：
>   **「陸セルへはどの方向でも移動できる。水/穴セルへ入る移動は『その進入方向の軸で1セル橋（その先が陸）』のときだけ許可する」**
> - 具体：`isPassable` に**移動方向（または進入軸）を渡す**。水/穴セルへ入ろうとするとき、
>   - **横移動（左右）で入る** → そのセルが**横向きの橋**（左右が陸＝1セル幅）のときだけ通行可
>   - **縦移動（上下）で入る** → そのセルが**縦向きの橋**（上下が陸＝1セル幅）のときだけ通行可
>   - `ladderOrientationAt(r,c)` が返す向きと**進入軸が一致**するときだけ許可する。
> - これにより：
>   - col4（縦連続水）で**下**を押す → 縦の橋ではない → **ブロック**（落ちない・①が直る）
>   - col4 で**左右**を押す → 隣が陸 → 渡れる（1セルだけ）
>
> **③「軸ロック」は採用しない（検討の結果ボツ）：**
> - 一度「はしごの上では橋の軸方向にしか動けない」案を検討したが、
>   例えば「横向きはしご・上=陸・下=水」の状況で**上（陸）へ抜けられないのはストレス**になる。
> - 上記①のルール（陸へはいつでも出られる／水・穴への進入だけ軸一致を要求）にすれば、
>   - 連続水を縦に渡るバグは消える（水への進入は軸一致が必要）
>   - かつ、はしごの途中から横の陸へ自由に抜けられる（ストレスなし）
>   ——という両立が**軸ロックなしで自然に**実現できる。よって軸ロックは入れない。
>
> **描画（`updateLadderOverlay`）も同じ条件に揃える：**
> - はしごを出すのは「プレイヤーが乗っている水/穴セルが、**今の進入軸の橋**であるとき」だけにする。
>   向きも進入軸で決める（縦移動で入った縦橋＝`ladderV`／横移動で入った横橋＝`ladderH`）。
> - ※ 現状の描画は「セルの地形だけで向きを決め、軸を問わず出す」ため、通行判定を①に直したら描画条件も合わせる。
>
> **不具合②：プレビュー設定の「はしご保持」が実機で効かない**
> - コード配線自体は存在する（editor の `ps-ladder` チェックボックス → URL `ps_ladder=1` → `game.js` で `player.hasLadder=true`）。
>   テストハーネスでは `ps_ladder=1` で `hasLadder=true` になることを確認済み。
> - だが**実機で効かず、宝箱から取り直さないとはしごが架からなかった**との報告。**次セッションで実際の「編集→プレビュー起動」を再現して原因調査**する。
> - 仮説：(a) ブラウザ／Vite キャッシュ（このプロジェクトの頻出原因）、(b) 編集中マップが localStorage 未保存で別データを見ている、
>   (c) 4-1b の「渡り中だけ表示」に変えたため陸にいる間ははしごが見えず「効いていない」ように見えた。
> - ①を直すと描画条件も変わるので、**①修正後に②を実機再現して確認**する順がよい。
>
> **不変条件（要テスト固定）：はしごは多段に伸びない＝橋の上から交差軸のさらに先の水へは渡れない**
> - 懸念ケース：プレイヤーが**水/穴の橋セルの上**にいて（中身は水）、上下が水・上の水のさらに上が陸、という配置。
>   「上の水セル」を `isLadderBridge` で判定すると `vert` は「上(row-2)=陸 かつ 下(row,c)=**水**」となり、
>   `isLadderBank(row,c)` が**水を橋脚に算入しない**ため false → **上の水へは渡れない**（現状でも防げている）。
> - これは `isLadderBank` の「水/穴は橋脚にしない」が実質「はしごの上から追加で架けられない」役割を果たしている。
>   この**不変条件を回帰テストで固定**しておく（将来 isLadderBank を触ったときに多段はしごを生まないため）。
> - ※ 区別：プレイヤーが**陸セル**にいて上隣が1セル水・その上が陸 ＝ 正しい縦橋なので渡れて正解（バグではない）。
>
> **テスト：** `tests/ladder.spec.js` に
> - 「**縦連続水を縦方向には渡れない**（col4 を下に進んでも止まる）」
> - 「同じ col4 を**横方向には1セルだけ渡れる**」
> - 「横向き橋の上から**上（陸）へ抜けられる**（軸ロックされていない）」
> - 「**橋（水/穴）の上から交差軸のさらに先の水へは渡れない**（はしごが多段に伸びない不変条件）」
> を追加する（①の回帰防止）。

- [x] `isPassable(nx,ny,axis)` に進入軸を渡し、水/穴への進入は「進入軸の橋（その軸の両隣が陸）」のときだけ許可するよう修正。`isLadderCrossable(r,c,axis)` を新設（`isHorizBridge`/`isVertBridge` に分離）
- [x] `ladderOrientationAt(r,c,axis)` を進入軸対応に（軸の橋でなければ null）。描画と通行判定が同じ向き定義を使う
- [x] `updateLadderOverlay`（描画）も `heroDir` から進入軸を出して「進入軸の橋のときだけ出す・向きも軸で決める」条件に揃えた
- [x] 軸ロック（はしご上は橋方向のみ移動可）は**入れない**。代わりに「既に乗っている水/穴セルは進入軸チェック対象外」とし、陸へはどの軸でも抜けられる手触りを実現
- [x] プレビュー設定「はしご保持」が実機で効かない件 → **真因特定・修正済み（2026-06-17 追加修正）**：`editor/editor.js` の canvas クリック経由プレビュー起動ハンドラが `ps` に `ladder`/`wingrobe` を取りこぼしており `ps_ladder=0` になっていた。`editor-io.js` の `getPreviewSettings` と重複定義だったのが温床（直接 URL では効くため当初「正常」と誤判定した）。両フィールドを追加して修正。回帰テスト（canvas クリック経由で `ps_ladder=1` が iframe URL に渡る）を追加
- [x] **描画の追加修正（2026-06-17）**：半セル straddle で2枚出る不具合 → プレイヤー中心に最も近い橋セル1枚に限定。向き変更で消える不具合 → 向きを「セルの地形」で決める（軸非依存）に戻し、軸チェックは通行判定のみに限定
- [x] `tests/ladder.spec.js` に計6本追加（縦連続水は縦に渡れない／横には1セル渡れる／横橋から上の陸へ抜けられる＝軸ロックなし／橋の上から交差軸の先の水へは渡れない＝多段不変条件／半セルで2枚出ない／向きを変えても消えない）＋editor 1本。**全65テストグリーン**

### 4-2. 笛　🧠 Opus（ワープ・隠し出現の仕組み設計）　✅ 完了
- [x] 「笛」アイテムを実装（active サブアイテム・`subItems.flute`・`type:'magic'`・`uses:Infinity`）
  - サブアイテムとして装備し、使用すると魔法の音楽を奏でる（`playFlute()`）
  - 効果1：`stageData.fluteEffect={type:'reveal'}` で `ss.flutePlayed=true`→`showConditions` の新トリガー `flutePlayed` で隠し入口が出現
  - 効果2：`stageData.fluteEffect={type:'warp', destId}` で `exitRegistry` のワープポイントへ移動
- [x] 笛が必要なギミックを各ダンジョン・フィールドに追加（field 2,0 に reveal＋隠し入口、secret_grotto に warp）
- [x] **エディタのプレビュー設定に「🎵 笛」トグルを追加**（getPreviewSettings 2箇所・ステージ fluteEffect 入力・宝箱内容・トリガー）
- [x] flute スモークテスト4本グリーン（全71テストグリーン）

### 4-3. ロウソク　⚡ Sonnet（茂み切り機能の拡張）　✅ 完了（2026-06-18）
- [x] 「ロウソク」アイテムを実装（active magic サブアイテム・`subItems.candle`・`type:'magic'`・`uses:Infinity`。笛と同型）
  - 前方の茂み（BUSH）を燃やせる（既存の `cutBushes` 機構を再利用＝通行可化・再描画も既存パイプライン）
  - 燃やすと `ss.bushBurned=true` → `evaluateConditions()` で `showConditions` の**新トリガー `bushBurned`** で gate された隠し通路・隠し入口・隠しアイテムが出現（笛の `flutePlayed` と同型）
  - **剣で切っても `bushBurned` は立たない**＝ロウソク固有の発見役割（剣＝通行可化のみ／ロウソク＝通行可化＋発見トリガー）
- [x] ロウソクを使った発見ギミックの追加（field 2,0：(2,6) にロウソク宝箱・(4,7) に茂み・(4,8) に `bushBurned` で出現する隠し入口→`secret_grotto`）
- [x] **エディタのプレビュー設定に「🕯 ロウソク」トグルを追加**（`ps-candle`・デフォルト ON・両 getPreviewSettings に追加＝[[blade-preview-settings-duplicated]] の教訓）。宝箱内容に「ロウソク」・トリガーに「bushBurned」も追加
- ※ 実装：`shared/items.js`（candle 定義）・`game/conditions.js`（bushBurned トリガー）・`game/game.js`（`playCandle()`＋`showCandleFireEffect()`・useSubItem 分岐・ps_candle・getState に hasCandle）・`shared/sounds.js`（`fire` SE）・`game/css/effects.css`（`.candle-fire` 炎演出）・エディタ4ファイル（index.html/editor-io.js/editor.js/editor-props.js）・`work/blade-of-lumia.json`（デモ配置）。`tests/candle.spec.js` 4本。**全75テストグリーン**

### 4-3b. ロウソクの炎で敵にダメージ　⚡ Sonnet（既存ダメージ処理への攻撃種別追加）　✅ 完了（2026-06-18）
> **背景：** 4-3 のロウソクは「茂みを燃やす」発見専用。ユーザー方針で**炎で前方の敵にダメージを与える攻撃要素**を追加する（次タスク）。
- [x] `playCandle()` で前方セルに敵がいれば `dealDamageToEnemy(e, dmg, 'fire')` でダメージを与える（攻撃種別 `'fire'` を新設）
  - ダメージ量は控えめに（ロウソクは主に発見用途・剣の補助）。値は実装時に決め、`game/constants.js` に集約候補
  - 茂み燃やしと両立：前方が茂みなら燃やす＋（その先/同セルに敵がいれば）炎ダメージ、という素直な処理にする
- [x] **Phase 3-3 の弱点属性（`weakness.type`）と連動**：`'fire'` を弱点に持つボス/敵を設定できるようにする（例：氷・植物系の敵が炎に弱い）。`shared/enemies.js` の該当敵に `weakness:{type:'fire',multiplier}` を付与
- [x] 炎ヒット時のエフェクト/SE（既存の `.candle-fire` 演出・`fire` SE を流用、必要なら敵中心に着火演出）
- [x] テスト：`tests/candle.spec.js` に「前方の敵に炎ダメージが入る」「炎が弱点の敵には倍率ダメージ」を追加
- ※ 実装：`game/constants.js`（`CANDLE_FIRE_DMG=3`）・`game/game.js`（`playCandle()` に敵判定追加）・`shared/enemies.js`（氷のリヴァイアサン・古森の巨人の弱点を `fire` に変更）。`tests/candle.spec.js` +2本。**全77テストグリーン**

### 4-4. ブーメランでアイテム取得　⚡ Sonnet（既存ブーメラン処理の拡張）
- [x] ブーメランが通過したマスのアイテムを回収できる機能
  - 届かない場所の鍵・ルピーを取れる
- [x] この機能を使わないと解けないパズルを設計
- ※ 実装：`game/projectile.js`（`boomerangStep` に `collectFieldItem` 呼び出し）・`game/player.js`（`collectFieldItem` 新設・K/r/R 対応）・`game/game.js`（deps 配線・`getGameState` に keys/rupees 追加）。`work/blade-of-lumia.json` field `1,1` にブーメランパズル配置（柵に囲まれた鍵K・施錠扉D・宝箱B）。`tests/boomerang-item.spec.js` 3本。**全81テストグリーン**

### 4-5. アイテムの組み合わせギミック　🧠→⚡（ギミック設計はOpus、配置はSonnet）

> **設計確定（2026-06-19・Opus）：DECISIONS.md「Phase 4-5（設計）」参照。**
> 共通核＝**「投擲物・爆弾が『敵/壁』だけでなく『タイルの状態』に作用する」**。新サブシステムは作らず
> 既存 `projectileTick`／`boomerangStep`／`explodeBomb`／`showConditions` に最小分岐を足す。
> 実装は **⚡ Sonnet** で **1サブギミックずつ**（①→②→③の順）。各ステップでスモークテストを足してグリーン確認。

- [x] **① 武器でトグルするスイッチ（タイルを2種に呼び分け）**✅ 2026-06-20
  - ⚠️ **既存スイッチは流用しない**：踏みスイッチは「乗っている間だけ ON＝モーメンタリ」でパズルが成立しているため、武器でラッチ/トグルすると既存パズルが壊れる（ユーザー指摘）。**専用の別タイルを新設**して分離した
  - **タイルを2種に呼び分け（ユーザー指示・2026-06-20）：** 従来の踏みスイッチ＝**ボタン `BUTTON('S')`**（乗っている間だけ ON のモーメンタリ）／武器で押す方＝**スイッチ `SWITCH('Y')`**（矢・剣など武器の攻撃で ON↔OFF トグル・攻撃まで状態維持）。タイル文字はセーブ互換のため `'S'`/`'Y'` のまま
  - **スイッチ（SWITCH）：** 矢・剣ビーム・剣（前方タイル）でトグル。状態は `ss.switchToggles`（ON のものだけ保持する Set）で `switchStates`（ボタン）と完全分離。連動ゲートは既存 `links`（switchId→gateId）。ON のとき発光（紫系の的）
  - **ボタン（BUTTON）：** 押し込み式の見た目。プレイヤー/石が乗って ON のとき「押された」見た目（沈み込み＋発光）。光る効果は従来どおり
  - ※ 実装：`shared/tiles.js`（`BUTTON('S')`/`SWITCH('Y')` に呼び分け）・`game/player.js`（`toggleSwitch(r,c)` 新設・`checkSwitchOff`/handleTileEvent は BUTTON を参照）・`game/combat.js`（剣で前方 SWITCH をトグル）・`game/projectile.js`（矢＝当たって消滅／ビーム＝1セル1回トグル）・`game/conditions.js`（stoneOnButton・allSwitchesOn は BUTTON 参照）・`game/game.js`（配線・`getStageStateSnapshot` の `switchToggles`）・`game/save.js`（`switchToggles`/`litTorches`）・`game/render-board.js`＋`render-chars.js`＋`css/board.css`（ボタン押し込み／スイッチ発光）・`editor/editor-palette.js`＋`editor-world.js`＋`editor-props.js`（ボタン/スイッチ呼び分け・トリガー文言）。`work/blade-of-lumia.json` dungeon_1 `2,2` にスイッチパズル（全幅水堀の南の Y(6,9) を矢/剣で叩く→ゲート 2,1 開・再叩きで閉）。`tests/arrow-switch.spec.js` 4本（矢で ON＋ボタン無作用／移動後 ON 維持＝トグル／再射で OFF／剣でもトグル）。**全84テストグリーン**
- [x] **② ブーメランで炎を操作**（新タイル `TORCH` かがり火・`'H'` 文字を割り当て）✅ 2026-06-20
  - 点灯/消灯は `ss.litTorches`（永続 Set）で管理。`stageData.initLitTorches` 配列で初期点灯を事前設定可能（getSS で種まき）
  - `boomerangStep` に炎運搬追加：点いた TORCH 通過→ `proj.flaming=true`、消えた TORCH 通過時に `proj.flaming` → `litTorches.add`→`evaluateConditions()`→`renderBoard()`→`saveGame()`
  - TORCH タイル追加：`shared/tiles.js`（`TORCH:'H'`・passable=false）・`shared/tile-sprites.js`（TILE_SPRITE_MAP）・`shared/sprites-tiles.js`（2フレーム12×16スプライト）・`game/render-board.js`（frame0=消灯/frame1=点灯）
  - `conditions.js` に `torchesLit` トリガー追加（全 TORCH セルが litTorches に入ったら達成）
  - `editor/editor-props.js` の showConditions トリガードロップダウンに `torchesLit` 追加
  - パズル配置：dungeon_1 ステージ `1,2`（点灯 TORCH `2,3`＋消灯 `2,9`/`7,5`＋宝箱 `7,9` torchesLit 条件付き）
  - `tests/torch.spec.js` 5本（initLitTorches 動作・通過判定・エラーなし）。**全89テストグリーン**
- [x] **③ ロウソクで隣接 TORCH を点灯**（爆弾は不採用→ブーメランパズルの難しさを守るため）✅ 2026-06-20
  - `playCandle()` に TORCH 点灯分岐追加。前方セルが TORCH なら `litTorches.add`→`evaluateConditions()`→`renderBoard()`。点灯済みなら「もう火がついている」メッセージ。`ps_bomb` プレビュー設定も追加（汎用）。dungeon_1 `1,2` (7,3) に石碑ヒント配置。
- [x] **クリア判定：`showConditions` に新トリガー `torchesLit` を追加**（`conditions.js`）✅ 2026-06-20（② に含む）
- [x] **永続化**：`save.js` の serialize/deserialize に `litTorches`・`switchToggles`（Set↔配列）を追加 ✅ 2026-06-20（① 実装時にまとめて追加。`litTorches` は② で使用）
- [x] **エディタ対応**：TORCH をパレットに追加（tiles.js に足せば自動）・`showConditions` トリガーに `torchesLit` を追加（editor-props.js）✅ 2026-06-20（② に含む）
- [x] **パズル配置**（`work/blade-of-lumia.json`）：②ブーメランで離れたかがり火を点ける（dungeon_1 `1,2`）✅ 2026-06-20。③爆弾石碑ヒント (7,3) 追加 ✅ 2026-06-20

### 4-X. バグ修正：ワールドマップの「星の欠片 合計」が大型ボス分を数えていない　⚡ Sonnet
> **症状（ユーザー報告・2026-06-20）：** エディタのワールドマップ右下「星の欠片 合計」が、**直接拾える欠片(Q)と cave_1 のもの程度しか表示されず**、dungeon_1〜7 の大型ボス分が数えられていない。
- [x] **原因（調査済み）：** エディタの `editor/editor-world.js` `updateShardSummary()` は **`ITEM_TRIFORCE_PIECE('Q')` と `DARK_LORD('X')` だけ**を数えていた。しかし現状のダンジョンボスは大型ボス（G/N/J/A/L/O/U）で、これらは `X` ではなく **`ENEMY_META[tile].dropsTriforce:true`** で欠片を落とす。エディタがこのフラグを見ていないため大型ボス分が欠落していた。
- [x] **修正完了：** `shared/triforce.js` を新設（`countTriforces(mapData)` / `listTriforceEntries(mapData)` を export）。`boss.js calcTotalTriforces` と `editor-world.js updateShardSummary` の両方がこのヘルパーを呼ぶ単一の真実に統一。
- [x] 確認：現状マップで合計 **9**（直接Q×2＋ボス7体）・内訳に7ダンジョンのボスが全員表示されることを Node.js スクリプトで確認。**全84テストグリーン**。

### 4-6. ブーメランの投擲物改修（アイテム運搬＝初代ゼルダ式＋復路の攻撃判定復活）　🧠→⚡（機構設計はOpus、実装はSonnet）　🚨 次にすぐやる（2026-07-11 ユーザー指示）

> **⚠️ 着手順（ユーザー確定 2026-07-11）：** このタスクを **9-6 ⑥-5 より先に、次にすぐ実装する**。9-6「新規コード無し」方針（論点3）の例外＝別Phase実装確定タスクを前倒し。詳細な経緯・実コード根拠は `DECISIONS.md` 2026-07-11・`FIELD-FUN-CATALOG.md` 別Phase表「a6改」。
>
> **背景（ユーザー指摘2件・実コード確認済み）：**
> 1. **運搬なし：** `collectFieldItem`（`game/player.js:874`）は**ブーメランが通過した瞬間に即入手**（`player.rupees += 1` 等）＝初代ゼルダの「拾ったアイテムがブーメランにくっついて戻り、キャッチで入手」演出が無い。
> 2. **復路の攻撃判定消失：** `boomerangStep`（`game/projectile.js:310`）の往路（`!returning`・315-321行）は `checkProjHit` を呼ぶが、**復路（else・322-335行）は呼ばない**＝戻り道の敵は素通り。かつ往路で1体に当たると即 `returning=true`（271行）＝1投で当たるのは実質「最初の1体」だけ。

- [x] **① アイテム運搬（入手タイミング＝戻ってキャッチ時・ユーザー確定）：** `collectFieldItem` を「即加算」から「carried 記述子を返す（`player` 加算保留）」へ変更。往路/復路で `r`/`R`/`K` セルを通過したら `proj.carried[]` に積む＋タイルは `pickedKeys` で隠す（運搬アイコンと二重表示させない）。
- [x] **② 付随描画：** `moveProjEl` のブーメラン分岐で拾ったアイテムのアイコン（`.boomerang-carry`・`makeSprite(spr,pal)`）を追従表示。**🔑 `collectFieldItem`/炎点火の `renderBoard()`（char-layer 作り直し）で proj 要素が消えるので `moveProjEl` を "無ければ再生成" に修正**（炎オーラの既存潜在バグも同時に解消）。
- [x] **③ 入手/取り逃し確定：** キャッチ成立（`d < step+0.3`）で `finalizeCarried()` が `player.keys/rupees` に確定加算。取り逃し（`clearProjectiles`＝ステージ遷移で未キャッチ消滅）は `restoreCarried()` でタイルを復活＝**その場に残す**（永久ロス回避）に決定。
- [x] **④ 復路の攻撃判定復活：** `boomerangStep` 復路 else にも `checkProjHit(proj)` を追加。`checkProjHit` のブーメラン分岐に `_hitIds` を導入＝同一敵は1回だけヒット・往路は1体目で即 `returning`（従来挙動維持）・復路は貫通で複数体削れる。
- [x] **テスト：** ①往路で即入手しない（carriedKeys=1・keys=0）②付随アイコン表示 ②戻ってキャッチで入手 ③復路で敵にダメージ ④取り逃し＝入手されずタイルは残り再回収可。`tests/boomerang-item.spec.js` に5本追加（`getProjectiles` snapshot に carriedKeys/carriedRupees 露出）。
- [x] **完了条件：** 全254テスト緑＋実ブラウザで運搬アイコン追従・キャッチ入手・復路ダメージ・0 pageerror を確認。
- ※ **⑥-4 `8,6` のブーメラン島（`R`大ルピー）は現状の通過回収でも成立するので作り直し不要**（本タスク実装後は自然に運搬演出が乗る）。

---

## Phase 5：謎解き・パズルギミック

**目的：** 「頭を使う」楽しさを追加して探索に深みを出す。

### 5-1. 色スイッチ・色ゲート　🧠→⚡（連動ロジック設計はOpus、エディタ対応はSonnet）

> **設計確定（2026-06-20・Opus）：DECISIONS.md「Phase 5-1（設計）」参照。「色セレクタ式」を採用（ユーザー選択）。**
> 仕組み：ステージ単位の `ss.activeColor`（1個）＋色別ゲートタイル。色スイッチを武器で叩くと activeColor をその色に**セット**、`GATE_<c>` は `activeColor===c` のときだけ通行可。`links` 機構には触らない（既存パズルに無影響）。**実装は ⚡ Sonnet**（設計が書き出し済みのため）。

- [x] **タイル追加**（`shared/tiles.js`）：`SWITCH_RED='['`・`SWITCH_BLUE=']'`・`GATE_RED='('`・`GATE_BLUE=')'`（記号文字で衝突なし・DECISIONS に追記済み）
- [x] **スプライト**（`shared/tile-sprites.js` ＋ `shared/sprites-tiles.js`）：既存 `gateG`/`lever` のパレットを色違いにして4タイル分の `{spr,pal}` を単一表に追加（絵文字は使わない＝[[blade-tile-sprite-single-source]]）
- [x] **状態 `ss.activeColor`**（プリミティブ文字列・1ステージ1個）：
  - `save.js` の createStageState / serialize / deserialize に追加（Set変換不要・そのまま代入）
  - `game.js` `getSS()` で `stageData.initActiveColor` を種まき（`initLitTorches` と同要領）
  - `getStageStateSnapshot()` に `activeColor` を追加（テスト観測用）
- [x] **叩く＝色セット**：`player.js` に `setActiveColor(r,c)` を新設。`combat.js`（剣）・`projectile.js`（矢/ビーム・ビーム貫通は `proj._switchedCells` 流用）の SWITCH ヒット分岐の隣に「色スイッチなら setActiveColor」を足す
- [x] **通行判定**：`passable.js` の GATE 分岐の隣に `GATE_<c>` は `activeColor===c` のとき通行可（`openGates` は見ない）
- [x] **描画**：`render-board.js` の GATE 分岐に倣い、色ゲートは不一致なら色付き閉ゲートを描画・一致なら床。色スイッチは自色が active のとき点灯フレーム
- [x] **クリア判定（任意・YAGNI）**：通行ギミックだけで成立するので不要と判断、スキップ
- [x] **エディタ対応**：色タイルは tiles.js に足せば自動でパレットに出る。`initActiveColor` をステージ設定に1項目追加（`editor-canvas.js`・fluteEffect と同要領）
- [x] **パズル配置**（`work/blade-of-lumia.json`）：dungeon_1 ステージ `3,0`（rows=10, cols=12）に配置。row2: SWITCH_RED(2,1)・SWITCH_BLUE(2,9)、row4: GATE_RED(4,3)・GATE_BLUE(4,7)、row6: 石碑ヒント。報酬ステージ `4,0` も追加（宝箱）。`mapEnters` は空（まだ reachable 経路に未接続）
- [x] **テスト**（`tests/color-switch.spec.js`）：赤を叩く→activeColor='red'／赤ゲート通行可（snapshot確認）／青を叩く→activeColor='blue'（排他制御）／snapshot に activeColor フィールドあり／剣でも起動可。5テスト全グリーン（総95テスト）

### 5-2. 隠し通路・隠し入口　⚡ Sonnet（既存ギミックの配置）
- [x] 爆弾で壊せる壁（既存）を使った隠し部屋の増設
- [x] 看板の「何もない」の裏に宝箱を置くフェイクギミック
- [x] ロウソクで草を燃やすと現れる隠し入口

### 5-3. 敵を使ったパズル　🧠 Opus（敵AI・誘導ロジックの設計）

> **設計確定＋実装（2026-06-21・Opus）：DECISIONS.md「Phase 5-3（設計＋実装）」参照。「敵が石を押す」方式を採用（ユーザー選択）。**
> 敵が追跡経路上の石にぶつかると、プレイヤーの石押しと同じ規則で石を1マス押す。押された石がボタンに乗ると**既存の `checkStoneOnSwitch`** がゲートを開く。パズル後半（石→ボタン→ゲート）は完全に既存資産で、新規は「敵に石を押させる」前半だけ。

- [x] 「敵をスイッチの上に誘導する」パズル設計（→「敵が石をボタンへ押し込む」方式に確定）
- [x] **敵の石押し**（`enemy-ai.js`）：`tryEnemyPushStone(e, my, mx)` を新設。`enemyChase` の移動ループで、整数座標かつカーディナル移動が石で塞がれたとき石を1マス押す（プレイヤーの `tryPushStone` と同規則：押し先が `tilePassable` かつ石/敵/プレイヤー不在）。乱数なしの通常追跡 AI なので決定論的
- [x] **配線**（`game.js`）：`createEnemyAi` deps に `getCurrentLayer`/`getStageKey`/`getSS`/`tilePassable`/`checkStoneOnSwitch`/`evaluateConditions`/`renderBoard`/`renderChars` を追加。`getStageStateSnapshot()` に `stonePositions` を追加（テスト観測用）
- [x] **パズル配置**（`work/blade-of-lumia.json`）：dungeon_1 ステージ `5,0`（rows=10,cols=12）に CHASER(2,5)・STONE(3,5)・BUTTON(4,5)・GATE(4,9)・封印宝箱(4,10)・石碑(7,3)。ボタン直下(5,5)を壁で塞ぎ石が越えないように（恒久ON）。`links: [{switchId:'4,5', gateId:'4,9'}]`。`mapEnters` は空（reachable 経路へは Phase 5 末〜6 で接続）
- [x] **テスト**（`tests/enemy-stone-puzzle.spec.js`）：①チェイサーが石をボタンへ押し込む→switchStates['4,5']===true・openGates に '4,9'／②敵を上方へ誘導すると石は乗らずゲート閉のまま（vacuous pass 防止）。2テスト全グリーン（総101テスト）

---

## Phase 6：世界観・NPC・テキスト

**目的：** 世界に「生活感」と「歴史」を与え、探索のモチベーションを高める。

### 6-1. NPCの台詞充実　⚡ Sonnet（テキスト作成・配置）
- [x] 各村・フィールドのNPCに「噂話」台詞を追加
  - 「東の洞窟に奇妙な音がするらしい」→実際に東にダンジョンがある
  - 「星の欠片を集めると古代の祭壇が目覚めると言い伝えがある」
- [x] ボス撃破後に変化するNPCの台詞（「ありがとう！」系）

### 6-1b. 個別ボス撃破フラグ（`defeatedBosses`）⚡ Sonnet
- [x] `player.defeatedBosses`（Set）を追加：`onBossDefeated` でボスのタイル文字を記録
- [x] `save.js` で Set↔配列変換（saveGame で配列化・loadGame で Set 復元）
- [x] `startDialog` で `linesAfterBoss[tileChar]` → `linesAfterBoss.default` → `linesAfter` → `lines` の優先順位で台詞選択
- [x] 各NPCの `npcData` に `linesAfterBoss` を追加（field 1,0 村人タロ・老賢者に G/default）
- [x] テスト：ゴーレム撃破後に対応NPCの台詞が変わることを確認（4本）

### 6-2. 世界の歴史を語る石碑・壁画　🧠→⚡（ストーリー断片の構成はOpus、配置はSonnet）
- [x] ダンジョン内に石碑タイルを追加（既存 SIGN `i` を再利用＝新コード不要）
- [x] 石碑に「ザーネルがかつて何をしたか」の断片テキスト（「ザーネルの記憶」全8断片）
- [x] 読み進めることでザーネルの過去が徐々に分かる（dungeon_1〜7 entry room に其の一〜七＋暗黒の塔 entry に終章）

### 6-3. フィールドの充実　⚡ Sonnet（エディタでのマップ作成）
- [x] 廃城・廃村エリアを追加（かつての戦いの跡）
- [x] 壊れた遺跡エリアを追加

### 6-4. 「嘘をつくNPC」　⚡ Sonnet（テキスト配置）
- [x] 一部NPCが嘘の情報を言う（プレイヤーの裏をかく遊び）
  - field 1,1 (3,2) 通りすがりの冒険者：「ブーメランは役に立たない」「宝箱は何もない」（嘘）
  - field 2,0 (4,5) 怪しい旅人：「茂みの先は行き止まり」「ロウソク不要」（嘘。実際は隠し入口あり）
  - field 1,0 (7,3) 諦めた老人：「祭壇に触っても何も起きない」「女王は助けられない」（嘘）

---

## Phase 7：成長・強化システム

**目的：** 「強くなっていく」実感を与える。

### 7-1. 剣の段階的強化　🧠→⚡（バランス設計はOpus＝完了、各剣の実装はSonnet）✅ 2026-06-22完了
> **設計確定済み（2026-06-22・DECISIONS.md「Phase 7-1（設計）」参照）。** ティア制＋ビーム解禁をティアに紐づける。次は ⚡ Sonnet で実装。
- [x] `shared/items.js` に `SWORD_TIERS`（wood/bronze/silver/holy）を新設＝剣の段階の単一の真実（名前・atk・sprite・slash色・beam可否・pierce可否）
- [x] `player.swordTier`（-1=剣なし）を導入し、player.atk を「基礎2＋ティアatk」の**再計算**に一本化（拾うたび加算をやめる）
- [x] **3経路（ITEM_SWORD タイル／床 floorItems／チェスト weapon）の持ち替えをティア判定に統一**（チェスト経路の無条件加算バグも解消＝下位剣で atk が下がらない）
- [x] 見た目：ティアごとの拾得/HUDスプライト4種（`sprites-items.js`）＋斬撃エフェクト色（`combat.js`/CSS の `.sword-thrust` に `tier-*` クラス）
- [x] **ビーム解禁をティアに紐づけ**（`charge.js`）：木=ビーム不可／銅・銀=弱ビーム可・満タンでも非貫通／聖剣のみ満タン貫通
- [x] ネタ剣（わりばし/ストロー/うまいぼう/アルテマウェポン/atkBonus 10000）を4ティアに整理して再配置（木=開始村、銅・銀・聖=ダンジョン進行順）
- [x] テスト：①下位剣で atk が下がらない ②木ではビーム不可 ③銅/銀は満タンでも非貫通 ④聖剣のみ満タン貫通 ⑤HUD名称/ATKがティアどおり（全6件パス）
- [x] ※ ATK絶対値の最終チューニングは **Phase 8-4**（通しプレイ一括調整）に委ねる。7-1 は枠組みと相対関係まで

### 7-2. 防具・盾の強化版　⚡ Sonnet（既存装備の拡張）✅ 2026-06-22完了
- [x] `shared/items.js` に `ARMOR_TIERS`（cloth/chain/legend・def 2/4/7）と `SHIELD_TIERS`（wood/iron/mirror）を新設＝段階の単一の真実（剣 7-1 と同型）
- [x] `player.armorTier`/`player.shieldTier`（-1=なし）を導入し、`player.def = BASE_DEF + ARMOR_TIERS[tier].def` の**再計算に一本化**（チェスト経路の無条件加算バグも解消）
- [x] 3経路（ITEM_SHIELD/ITEM_ARMOR タイル・チェスト weapon/armor/shield）の持ち替えをティア判定に統一（下位は無視）
- [x] **盾の跳ね返し**：正面ブロックは全ティア共通（剣振り中・チャージ中はオフ）。`reflect`（木=0/鉄=0.5/ミラー=1.0）で**敵の投擲物**を打ち返す（dx/dy 反転・owner→player・atk×reflect。剣＝近接はガードのみ）
- [x] 見た目：ティアごとの拾得スプライト6種（armorCloth/Chain/Legend・shieldWood/Iron/Mirror パレット）＋ポーズ画面に盾ティア名表示
- [x] ネタ装備（ながT/じょうぶな服/伝説のよろい/さいごの鎧）を防具3ティアに再配置。鉄の盾(dungeon_4)・ミラーシールド(暗黒の塔)を新規配置
- [x] エディタ：宝箱に「盾」種別＋ティア選択、フロアアイテムにティア選択を追加
- [x] テスト：①下位防具で def が下がらない ②木の盾は跳ね返さない ③鉄=×0.5跳ね返し ④ミラー=×1.0で背後の敵撃破 ⑤チャージ中は盾オフ ⑥HUD防具名/DEF（全7件パス）
- [x] ※ DEF/reflect の絶対値の最終チューニングは **Phase 8-4** に委ねる

### 7-3. ハートの器の増設　⚡ Sonnet（配置作業）
- [x] 現在より多くのハートの器を隠し場所・強敵撃破報酬に配置
- [x] 最大HP上限を増やす（上限なし・マップ配置数が自然な上限）

### 7-4. リスク・リワード設計　🧠→⚡（完了）
- **① 「扉を開けると強敵が出るが宝もある」選択要素（ゼロコード・配置のみ）：**
  - [x] dungeon_1/3,0 (3,8) に強敵 W、(3,10) に封印宝箱（killAll でゲート・伝説の鎧）配置
  - [x] signData (1,1) に「奥に強き者あり、されど宝も眠る」リスク予告石碑配置
- **② 高難度任意エリアへの報酬配置（ゼロコード・配置のみ）：**
  - [x] dungeon_1/4,0 (2,8) にミラーシールド（難所報酬）配置
- **③ ルピーで報酬を引くガチャNPC（天井つき）＝新規実装：**
  - [x] `player.js` の `grantReward(content)` を新設。`openChest` はこれを呼ぶように変更
  - [x] `ui.js shopBuy` にガチャ分岐（price チェック→pulls カウンタ→天井レア/重み抽選→grantReward→演出）
  - [x] `player.gachaPulls = {}` を player 初期化2箇所に追加
  - [x] field 2,0 (6,9) にガチャ NPC `$` を配置。天井 8回・price 30 のショップデータ追加
  - [x] テスト9本（全パス）：grantReward付与・pulls保持・抽選・天井リセット・killAll配置確認
- [x] ※ price/weight/pityCount の絶対値の最終チューニングは **Phase 8-4** に委ねる

---

## Phase 8：やりこみ・UX改善

**目的：** 二周目の楽しさ・快適さを高める。

### 8-1. ゲームオーバー体験改善　🧠→⚡（ヒント発火条件の設計はOpus、実装はSonnet）
- [ ] ヒントシステム：同じ場所で3回死ぬとフクロウNPCがヒントを言う
- [ ] デスマーカー：死んだ場所に墓が立ち、そこに行くと少しルピーが貰える

### 8-2. スコア・実績　⚡ Sonnet（集計・表示の実装）
- [ ] クリアタイム表示（二周目モード）
- [ ] 探索率・撃破数などのスコア表示

### 8-3. UX・操作感　⚡ Sonnet（既存処理への追加が中心）
- [ ] バイブレーション対応（Web Vibration API）
- [ ] BGM連動：ボス部屋BGMのテンポアップ
- [ ] タッチジェスチャーの改善

### 8-4. ゲーム全体のバランス調整（プレイヤー強さ vs 敵強さ）　🧠 Opus（数値バランスの全体判断）
> **⏭️ 実施順＝全タスクの最後尾（2026-07-04 ユーザー確定）：** リバランスは**一番最後**にやる。コンテンツ（フィールド地形の作り込み・ガイド導線・塔）が完全に出揃い、通しでプレイできる状態になってから初めて数値を触る。それ以前にいじると全体の難易度感がブレて手戻りになる。
> **背景：** 各機能を個別に実装してきたため、プレイヤーが強くなりすぎている箇所がある。
> **ゲームが一通り完成した段階（コンテンツが出揃ってから）にまとめて調整する。**
> 個別に都度いじると全体の難易度感がブレるため、最後にプレイ通しで一括チューニングするのが目的。
- [ ] **既知の要調整点：チャージ攻撃（剣ビーム）が強力すぎる**（Phase 3-1 で実装）。雑魚も比較的簡単に倒せてしまうので、威力・チャージ時間・貫通条件・クールダウン等を見直す
  - 調整候補：満タンビームの倍率（`BEAM_STRONG_MULT`）/ チャージ所要時間（`CHARGE_FULL_MS`）/ 発射のクールダウン追加 / ビームに弱点属性（Phase 3-3）でない敵には等倍 など
- [ ] プレイヤー側の強化要素（剣ランク・ビーム・サブアイテム・二周目2倍）と、敵・ボスのHP/ATK/出現数を**通しプレイで突き合わせて調整**
- [ ] 各ダンジョンの難易度カーブ（序盤→終盤）が緩やかに上がっているか確認・調整
- [ ] ※ 数値は `shared/enemies.js`（ENEMY_META）・`shared/items.js`・`game/constants.js`（CHARGE_*/BEAM_*/SWORD_*）に集約されているので、ここを中心に調整する

---

## Phase 9：進行設計＆ダンジョン作り込み（ゲームの背骨を作る）　★★★ 最高

> **背景（2026-06-23 にユーザーと確認）：** これまでは「ギミックの試作」と「8つの欠片・ボスという器」を用意しただけで、**ゲームとしての進行設計（＝何を動機に・どんな順で進むのか）が存在しない**。本物のダンジョンは dungeon_1（12部屋）のみ、残りは2部屋スタブ。アイテム（ブーメラン/爆弾/はしご/弓矢/笛/ロウソク）も全部最初から拾えてしまい、「アイテムを得て次のエリアが開く」というゼルダの探索ループが成立していない。
>
> **このフェーズで作る背骨：** **ハイブリッド型（緩い連鎖）**。序盤は一本道（アイテムでゲート）、中盤は複数ダンジョンを任意順、終盤は全収集→祭壇→塔。**「ボス＝その部屋の固有アイテムを守る最後の試練／アイテム＝次の扉の鍵」**という連鎖で進行を組む。新アイテムは作らず既存6種を「ダンジョン報酬＝次のゲートの鍵」に再配置する。
>
> **⚠️ 進め方：** 規模（部屋数）は先に決めない。「どんな体験をさせたいか（連鎖の役割）」が決まってから従属的に決める。**ユーザーと対話的に詰めてから PLAN/DECISIONS に記録する。** 設計が重いので各ダンジョンの「最初の1つ」は 🧠 Opus。
>
> **⚠️⚠️ 「量産」ではない（2026-06-23 ユーザー指摘で明確化）：** ボス入りダンジョンは **D1〜D8（dungeon_1〜8）＋ 暗黒の塔の9個だけ**（※ `dungeon_8` は 9-2c の沼地ボス用に新設するレイヤー。`cave_1` は小洞窟＝ボスを置かない・含めない／位置づけ修正 2026-06-24）。これは"一点物の作品"であり、**1つずつ設計意図を持って作り込む**対象。stage を継ぎ足す接続作業は機械的でも、**体験（テーマ地形・固有の謎・難易度カーブ・足止め）は手作業で詰める**。「量産」「機械作業」という表現は誤り。各ダンジョンの作り込みは原則 🧠 Opus で1つずつ設計し、確定した配置データの流し込みのみ ⚡ Sonnet に回す。
>
> **⚠️ dungeon_1 は「お手本（品質基準）」にしない：** dungeon_1 は小さく（6×3＝12部屋）・簡単すぎて、難易度カーブも仕掛けの密度も基準に足りない。dungeon_1 から借りるのは **仕組み（メカニズム）だけ**＝「辺スクロールで部屋を網状に繋ぐ」「既存ギミックタイル（`killAll`/`torchesLit`/ボタン→ゲート`links`/壊せる壁）の使い方」。"使える部品の確認"であって"こう作れという見本"ではない。
>
> **🔑 作り込みどころ（2026-06-23 改訂・古典ゼルダ型）：** 各ダンジョンの背骨は **①雑魚で基本戦闘 → ②そのダンジョンの報酬アイテムを中盤で入手 → ③そのアイテムを使わないと突破できない仕掛け部屋 → ④ボス（そのアイテムが弱点・剣でも可）→ ⑤欠片**。これに加えて ⑥**テーマ地形**（砂漠/水/炎/氷/森…）と固有の謎、⑦**難易度カーブ**（雑魚→仕掛け→中ボス→ボス）と**足止め部屋**を作る。報酬アイテムが**そのダンジョンの主役ギミック**になる（例：D3＝弓を入手→`Y`遠隔スイッチで奥扉を開ける／D4＝ロウソクを入手→`H`かがり火点灯 or 茂み焼きで奥へ／D6＝爆弾を入手→`!`壊せる壁で奥へ／D5＝はしごを入手→水/穴を渡ってボスへ／D8＝笛で隠し入口を出す〔dungeon_8 新設〕）。**⚠️ 旧記述「報酬はボス最奥・ダンジョン内で使わない」は撤回**（古典ゼルダ型へ転換）。連鎖順序は「ダンジョン入口を前ダンジョンの報酬でロック」で保つ。**(A) 後ダンジョンの報酬は要求しない＝ソフトロック厳禁は引き続き厳守。**
>
> **⚠️ 報酬アイテムで「必須化」する仕掛けは配線済みのものに限る（実コード精査・2026-06-23）：** 各報酬がダンジョン内で実際に必須化できることを確認済み — **弓矢(arrow)＝`Y`SWITCH を遠隔トグル可（→`T`ゲート）**／**ロウソク＝`H`かがり火点火・茂み焼き（`bushBurned`/`torchesLit`）**／**爆弾＝`!`BREAKABLE_WALL 破壊**／**はしご＝1セル幅の水/穴を渡る**／**笛＝`flutePlayed` で隠し入口/通路を出す**。⚠️ **ブーメランは `Y`SWITCH をトグルしない**（arrow/beam のみ）＝D2 でブーメラン必須化するなら **①隙間越しの `K`鍵回収（`collectFieldItem`）②炎を運んで `H`かがり火点灯（`torchesLit`）③敵スタン** のいずれかで作る（遠隔スイッチ部屋にはしない）。
>
> **🗺️ 想定するフィールド規模（2026-06-23 ユーザー指定）：** 初代『ゼルダの伝説』のフィールドは **128 画面（16×8）**。**Lumia は最低でも 256 画面（＝初代の約2倍）を目標とし、可能ならさらに広く**を想定して設計・作り込みを進める。**現状の field レイヤーはわずか 10 画面**（`3,0 / 2,0 / 2,1 / 1,0 / 1,1 / 1,2 / 0,1 / 3,1 / 4,0 / 0,2`）なので、9-2 のフィールド拡張は**この目標規模を念頭に大幅な画面追加**が必要（村・各ダンジョン周辺・中盤ハブ・終盤エリアを多数の画面で繋ぐ）。1画面の作り込みより**画面数の確保**を優先し、密度は後から上げる。※ ダンジョン内部（部屋数）はこの「フィールド画面数」とは別カウント。

> **📋 D1〜D8 完成後の大型残タスクの実施順（2026-06-28 ユーザー確定・2026-07-04 更新）：** 以下の順で進める。いずれも 🧠 Opus で設計してから ⚡ Sonnet で流し込む。
> 1. ~~**フィールド256拡張**（画面数）~~ ✅**達成済み**＝320画面（16×20・M1〜M4）。「現状10画面」は古い記述。
> 2. **🚨 フィールドを「ゲームとして成立」させる（9-6）＝最優先・最大の残タスク（2026-07-04 ユーザー強い指摘）：** 現状マップは**エリアごとに床を塗っただけ**で、楽しさ・奥深さ・複雑さが皆無＝ゲームとして成立していない。9-4（地面塗り分け・湖の島橋化）は完了したが、それは「塗り絵」段階にすぎない。**ここからは (i) フィールドをゲームとして面白くする設計と (ii) 無駄ステージ0・接続ミス0 の構造是正 を、複数の設計タスクに分けて対話しながら詰める必要がある。**一発の対話・一発の実装では終わらない。**下記 9-6 が入口（まず「どんな検討タスクが要るか」を対話で洗い出すところから）。** 旧 9-4 の残項目（沼の橋導線・各画面の起伏づくり）はすべて 9-6 に統合する。
> 3. **9-3 序盤チュートリアル＋ガイド導線** — 剣半強制ピックアップ／盾ガード必須配置／NPC・看板・`linesAfterBoss` の誘導。着手時に D3 の番兵`F`配置（盾ガード導線が寄道に埋もれている件・9-2y 指摘）も併せて再検討。
> 4. **暗黒の塔の本格拡張**（28室+）— 現状2フロアスタブ＝ラスダンの風格へ。
> 5. **⏭️ 最後尾：Phase 8-4 リバランス**（ビーム強すぎ・敵弱すぎの本格調整）。**コンテンツが完全に出揃い通しプレイできる状態になってから初めて数値を触る**（2026-07-04 ユーザー確定）。それ以前にやると難易度感がブレて手戻りになる。
> ※ 9-2y の残り未レビュー（D1/D2/D5/D6/D7/D8）は上記と並行して随時。

### 9-1. 進行の背骨（連鎖マップ）の設計　🧠 Opus（対話的に詰める）　✅ 設計完了（2026-06-23）
- [x] **進行構造を決定：ハイブリッド型（緩い連鎖）**（序盤一本道→中盤自由→終盤収束）
- [x] **ゲート方式を確定：「フィールド常時フルオープン＋ダンジョンの入口/奥をアイテムでロック」**（2026-06-23 ユーザー確定）
  - フィールド（ワールドマップ）は最初から**どこへでも歩ける**（NPC でフィールドの道を塞がない）。進行順は**各ダンジョンの「入口」または「奥への通路」を、前のダンジョンで得たアイテムでロック**することで自然に決まる（＝アイテム連鎖）。
  - **NPC・看板は『ガイド』に徹する**（次にどこを目指すか・何が必要かを示す）。`linesAfterBoss[type]`（Phase 6-1b・`defeatedBosses` 連動）で**ボスを倒すたびに台詞が「次の行き先」へ進む**＝ほぼゼロコードで動的ガイドになる。
  - ⚠️ **序盤の「NPC 門番（通行ゲート）」案は撤回**（フィールドを塞ぐのはフルオープン方針と矛盾）。D1→D2 は**ガイドのみ（ソフト誘導）**にし、強い順序強制は D3 以降のアイテムロックで効かせる。
- [x] **🔑 ダンジョン設計の鉄則（2026-06-23 改訂・古典ゼルダ型へ転換）：** 2つの制約を分けて考える。
  - **(A) ＝後のダンジョンの報酬を要求しない（厳守・ソフトロック防止）：** 例 D3 で「はしご＝D5報酬」を要求してはならない。各ダンジョンは「**そのダンジョンの報酬＋それより前のダンジョンの報酬**」だけでクリアできること。D3 内の水は、はしごではなく D3 報酬（弓）や既存橋タイル `v` で渡らせる。
  - **(B) ＝自分の報酬アイテムは "ダンジョン内で先に入手し、それを使って奥／ボスへ進む"（古典ゼルダ型・推奨）：** 報酬アイテムは**ボス最奥ではなくダンジョン中盤**で入手し、**そのアイテムを使わないと奥（＝ボス／欠片）へ進めない部屋**を必ず作る。ボスはそのアイテムが弱点（任意ボーナス・剣でも可）。アイテムは同じダンジョン内で先に手に入るのでソフトロックは起きない（＝(A) と両立）。**欠片だけはボス撃破ドロップのまま**（不変条件）。
  - ⚠️ **旧鉄則「報酬アイテムはボスの最奥に置く／ダンジョン内で使わない」は撤回**（2026-06-23・下記 DECISIONS 参照）。連鎖の順序は「**ダンジョンの入口を前ダンジョンの報酬でロック**」で保つ（入口の話なので (B) と無関係）。
- [x] **序盤の連鎖を確定（村→D1→D2）：**
  - [x] **何も持たずスタート。** 最初のステージに「最初の剣」を置き、**出口が剣の先にある＝通らざるを得ない（半強制ピックアップ）**。剣だけ・盾なしで弱い敵と戦う期間＝ゲームの基本を体得
  - [x] **dungeon_1（草原の洞窟）＝盾を覚える入門ダンジョン。** 報酬は **欠片① ＋ 木の盾（最下位ティア・ガードのみ・跳ね返しなし）** に絞る（進行アイテムは出さない）。跳ね返し付きの上位盾（鉄/ミラー）は後半ダンジョン報酬として温存。**D1・D2 はアイテム不要で入れる**（剣のみ／D1 クリア後は盾あり）。**古典ゼルダ型(B)の適用：** D1 では木の盾を**ボス`G`の手前**で入手し、**ボス`G`は遠隔の岩投げ（range6）持ち＝木の盾でガードして倒す**部屋にする（盾を使う必然を作る。盾なしでも HP30 を削れば倒せる＝詰まない）。
  - [x] **dungeon_2（砂漠の神殿）＝最初の「道を開く」道具。** 報酬は **欠片② ＋ ブーメラン**。アイテム連鎖の起点
- [x] **中盤・終盤の連鎖を確定（影響力の小さい鍵→地形を開く広い鍵→ワープ、の順）：**

  | 順 | ダンジョン（ボス） | 入る/進むのに必要 | 報酬 | アイテム影響力 | ボス弱点との噛み合い（任意ボーナス） |
  |---|---|---|---|---|---|
  | 序 | 村 | — | 剣（半強制） | — | — |
  | 序 | **D1 草原（岩のゴーレム）** | なし | 木の盾＋欠片① | — | （爆弾弱点・剣で可） |
  | 中 | **D2 砂漠（砂嵐の蠍王）** | なし | **ブーメラン**＋欠片② | 狭（回収/遠隔SW/スタン） | （ブーメラン弱点・剣で可） |
  | 中 | **D3 水の迷宮（深海の海蛇）** | **ブーメラン** | **弓矢**＋欠片③ | 狭（遠隔SW/射撃） | （ビーム弱点・剣チャージで可） |
  | 中 | **D4 炎の神殿（炎のサラマンドラ）** | **弓矢** | **ロウソク**＋欠片④ | 狭（点火/茂み焼き） | **弓矢で◎**（D3報酬が活きる） |
  | 中 | **D6 森の聖域（古森の巨人）** | **ロウソク** | **爆弾**＋欠片⑤ | **広（壊せる壁＝新通路）** | **ロウソク炎で◎**（D4報酬が活きる） |
  | 終 | **D5 氷の廃墟（氷のリヴァイアサン）** | **爆弾** | **はしご**＋欠片⑥＋鉄の盾 | **広（水/穴＝新地形）** | **ロウソク炎で◎** |
  | 終 | **D8 沼地（沼地の大蝦蟇＝新規作成）** ※レイヤー新設 | **はしご** | **笛**＋欠片⑦＋ミラーシールド | **最広（ワープ/隠し入口）** | （炎弱点＝ロウソクで◎・剣可） |
  | 終 | **D7 空中の遺跡（嵐の鷲王）** | **笛**（空島へワープ） | 欠片⑧ | — | **弓矢で◎** |
  | 終 | 祭壇（全8欠片）→ **翼の羽衣**（飛行）→ 暗黒の塔 → ラスボス ザーネル | 全欠片 | — | — | — |

  - **🎯 ボス＝欠片の不変条件（2026-06-23 ユーザー確定）：** **欠片は必ず「ボスのいるダンジョンでボスを倒すと得られる」。中ボス（大型ボス）8体＝欠片8、最終ボス（ザーネル）1体＝欠片なし＝ボス計9。** 欠片の入手はボス撃破だけ（チェスト/フロア配置で欠片を撒かない）。
  - **⚠️ 欠片ダンジョンは `dungeon_1〜8` の8個（2026-06-24 修正）：** 当初この欄を「D1〜D7 ＋ cave_1」としていたのは**誤り**。`cave_1` は小さな洞窟用レイヤーで欠片ボスを置く場所ではない。**8つ目の欠片ダンジョンは新設の `dungeon_8`** とし、沼地の大蝦蟇をそのボスにする。`cave_1` は小洞窟のまま据え置き（欠片・ボスを置かない）。
  - **⚠️ 現状とのズレ（9-2 で必ず是正・潜在バグ）：** 現在 `dropsTriforce:true` の大型ボスは **7体のみ**（G/N/J/A/L/O/U＝D1〜D7）＝実質7欠片。**沼地の大蝦蟇 `I`（部品は 9-2c で作成済み・dropsTriforce:true）を新設 `dungeon_8` のボスとして配置すれば8体に揃う**。欠片必要数は `countTriforces()` がマップ上の dropsTriforce ボス実数から動的計算する。配置時に直接拾える `Q` タイルの扱い（撤去等）も確定し、ちょうど8になるよう整える。**現状は直接 `Q` が2枚あり実質9なので、dungeon_8 配置＋Q整理を同時にやって8に揃える。**
  - **設計根拠：** 影響力（世界をどれだけ開けるか）の実測（爆弾＝壊せる壁14・はしご＝水56・笛＝ワープが最強／ブーメラン・弓矢・ロウソクは1ヶ所を開ける狭い鍵）に基づき、**狭い鍵を中盤前半・地形を開く広い鍵を後半・ワープを最後**に配置。早く広い鍵を渡すとショートカットが開きすぎて中盤が簡単になるのを防ぐ。
  - **弱点の噛み合い：** D4/D6/D5/D7 で「直前のダンジョンで得た道具＝そのボスの弱点」になり、"新しいおもちゃを次のボスで使う"ループが成立（弱点は任意ボーナス＝剣でも倒せる前提）。**さらに古典ゼルダ型(B)により、各ダンジョンの報酬は "そのダンジョンのボスの弱点" でもある**（D2 ブーメラン→ボス`N`、D3 弓→… ではなく、報酬を中盤で得てそのダンジョンのボスに使う＝2重のおもちゃ活用）。
  - **⚠️ 報酬の置き場所（2026-06-23 改訂・古典ゼルダ型）：** 表の「報酬」アイテムは**ボス最奥ではなくダンジョン中盤**で入手し、それを使ってボス／欠片へ進む（旧「ボス最奥に置く」は撤回）。**欠片だけはボス撃破ドロップ**（不変条件）。詳細は 9-1 鉄則 (B)・各ダンジョン 9-2 セクション。
  - **各ダンジョンのロック箇所（入口 or 奥）の具体は 9-2 のビルド時に決める**（テーマと既存ギミックタイルに合わせる）。例：D6＝爆弾で壊せる壁の先 / D5＝水/穴をはしごで渡る前提だが**D5 自身は爆弾で入る**（はしごは D5 報酬なので D5 内部ではしごを要求しない）/ D7＝笛ワープでのみ到達。
- [x] **全アイテムの「初期所持 → ダンジョン報酬」への移設方針を確定：** 現状フィールド/各所に散在する6種（ブーメラン/弓矢/ロウソク/爆弾/はしご/笛）の入手箇所を**上表の報酬位置に集約**し、それ以外の初期入手を撤去する。ネタ配置・テスト配置の重複入手も削除。**移設は 9-2/9-3 の実装で実施**（どのチェスト/フロアアイテムを消すかは実データを grep して洗い出す）。

### 9-2. ダンジョンの作り込み＋フィールド大幅拡張（2部屋スタブ → 本物の多部屋ダンジョン）　🧠→⚡

#### 9-2a. dungeon_1 雛形レビュー＋全アイテム移設の撤去対象 洗い出し（2026-06-23・🧠 Opus・コード変更なし）　✅ 完了
- [x] **dungeon_1（12部屋）を「本物のダンジョンの雛形」として言語化。** 構造＝**6×3 のグリッド画面を辺スクロールで接続**（`>` MAP_ENTER は外部マップ/階段専用、部屋間は画面端で隣接座標へスクロール＝初代ゼルダ式）。良い点：①入口[0,0]→ボス[2,0]の最短線とは別に [1,0]→[1,1]→[0,1/0,2]→[1,2]→[2,2] の枝分かれがあり「寄り道で宝・近道で直行」が成立。②ギミックの教科書配置（[1,2]＝かがり火全点灯で宝箱出現 `torchesLit`／[3,0]＝色スイッチ＋封印宝箱 `killAll`／[2,2]・[5,0]＝ボタン/スイッチ→ゲート `links`／[1,0]＝壊せる壁）。③地図`m`・コンパス`n`・道中宝箱・看板`i`・NPCで密度がある。**雛形の型＝「入口・ボス・分岐枝・ギミック部屋・宝部屋・看板/NPC を辺スクロールで網状に繋ぐ」**。改善メモ：[2,1] が素通り廊下＝各ダンジョンに最低1つは"鍵と扉/仕掛けで足止めする部屋"を置くと締まる。
- [x] **全アイテムの「初期所持→報酬」移設の撤去対象を実データで確定**（下表）。9-2/9-3 実装時にこの表どおり撤去＋報酬位置へ再配置する。**座標規約：grid `tiles` は `tiles[row][col]`／`chestContents`・`floorItems` のキーは `"row,col"`。**

  | # | アイテム | 現在の入手箇所（撤去対象） | 種別 | 移設先（9-1 連鎖の報酬位置） |
  |---|---|---|---|---|
  | 1 | ブーメラン | `field/1,1` tile(row4,col1)=`4` ＋ `field/1,0 chestContents["7,6"]`（※B無しの孤児データ）＋ `field/2,0 shopData["6,7"]` items（旅の商人・price50） | タイル+孤児chest+ショップ | **D2 砂漠ボス報酬** |
  | 2 | 爆弾 | `field/1,1` tile(row4,col6)=`5` ＋ `field/1,1 floorItems["4,6"]`(count3) ＋ `field/2,0 shopData["6,7"]` items（price20） | タイル+floorItem+ショップ | **D6 森ボス報酬**（消耗品の補充ショップは後で別途検討可） |
  | 3 | 弓矢 | `dungeon_1/2,1` tile(row4,col4)=`6`・(row4,col7)=`6` ＋ `cave_1/1,0` tile 4枚(row4-5,col4-5)=`6` | タイル多数 | **D3 水ボス報酬** |
  | 4 | ロウソク | `field/2,0 chestContents["2,6"]`（B宝箱あり） | chest | **D4 炎ボス報酬** |
  | 5 | はしご | `dungeon_3/0,0 chestContents["8,1"]`（B宝箱あり） | chest | **D5 氷ボス報酬**（D3 から移す） |
  | 6 | 笛 | `field/2,0 chestContents["4,3"]`（B宝箱あり） | chest | **D8 沼地ボス報酬**（新設 dungeon_8。cave_1 ではない／位置づけ修正 2026-06-24） |

  - **⚠️ 重要な気づき：** ブーメランの `field/1,0 chestContents["7,6"]` は対応する `B` タイルが無い**孤児データ**（その座標の tile は剣`1`）＝実際には拾えない死にデータ。移設時に削除する。
  - **⚠️ D5＝氷ダンジョンは現状 dungeon_5。** はしごは現在 dungeon_3 の宝箱にあるので、9-1 連鎖（D5＝はしご）に合わせ **dungeon_3 → dungeon_5 へ移設**する（D3 の弓矢要求とも整合）。
  - **剣/盾/防具の重複も整理対象（9-3 で）：** 木の剣が `field/0,1 floorItems["4,8"]`・`field/1,2 chestContents["8,10"]` の2か所、聖剣(tier3)が dungeon_1 に2か所(`1,2 chest["4,8"]`・`2,1 floorItems["4,5"]`)、伝説の鎧(tier2)が dungeon_1 に2か所。**最初の剣は「村スタート地点の出口に半強制1本」へ集約**し、上位剣/鎧の重複は撤去 or 後半ダンジョンへ再配分。

- [ ] 9-1 で決めた各ダンジョンの「役割（与えるアイテム・解放する先・テーマ）」に沿って **dungeon_1〜8 を1つずつ作り込む**（`dungeon_8` は新設・沼地。`cave_1` は欠片ダンジョンではない＝小洞窟として別扱い）（量産ではない＝各々が一点物）。各ダンジョンは「テーマ地形＋固有の謎」「直前アイテムを鍵として要求する部屋」「雑魚→仕掛け→中ボス→ボスの難易度カーブ」「足止め部屋を最低1つ」を備え、現状の 12部屋 dungeon_1 より明確に大きく・歯ごたえのある規模にする。**⚠️ dungeon_1 自身も「現状のまま据え置き」ではなく再設計対象**（12部屋＝規模基準未満＋報酬が 9-1 連鎖と矛盾＝下記 9-2a2 でリメイクする）。現状の dungeon_1 は仕組みの参照元であって品質基準ではない
- [ ] **フィールドを目標規模（最低 256 画面・可能ならさらに広く）に向けて大幅拡張**（現状 10 画面）。村・各ダンジョン周辺・中盤ハブ・終盤エリアを多数の画面で繋ぐ。まず画面数を確保し、密度（敵/宝/ギミック/NPC）は後から上げる
  - [x] **設計確定（9-2F1・🧠 Opus・2026-06-28）：** 16×20＝320画面／村を中央〜南 `7,14` へフル再採番／ダンジョン入口テーマ別分散／地理基準図・入口ホーム・M1〜M4 段取り・テスト更新リストを下記「🗺 9-2F1」に明文化
  - [x] **M1（骨格 44画面）：** 村 `7,14`＋全8ダンジョン入口ホーム＋草原回廊敷設・`field-connectivity` 全✓（⚡ Sonnet・2026-06-28）。既存10画面を新座標にフル再採番＋34新規草原回廊。全テスト 184/187 グリーン（3 skip は sky island/tower pending M2）
  - [x] **M2（量 ~128画面）：** 各地域ブロック半充填（Forest/Desert/Water/Lava/Snow/Swamp）126画面・全✓孤立0（⚡ Sonnet・2026-06-28）。全テスト 184/187 グリーン（3 skip 変わらず）
  - [x] **M3（量 210画面）：** 残り84walkable全充填（Forest/Desert/Water/Lava/Snow/Swamp/Grass/Tower/Sky）210画面・全✓孤立0（⚡ Sonnet・2026-06-28）
  - [x] **M4（量 320画面）：** 外周の海/山ボーダー110画面追加・計320画面（⚡ Sonnet・2026-06-28）。connectivity-tool regression テスト更新（border stage 除外）。全テスト 184/187 グリーン（3 skip 変わらず）
  - [x] **質パス：** 敵/宝/ギミック/NPC/秘密で密度up（9-3 と連動）（⚡ Sonnet・2026-06-30）：186画面更新・E319/C138/F49体・宝箱71・ルピー37・茂み64追加。`scripts/migrate-quality-pass.mjs` で決定論的一括流し込み。
- [ ] ※ 各ダンジョンの規模（部屋数）は役割が決まってから決定する（フィールド画面数とは別カウント）

##### 🗺 フィールド規模目標（2026-06-28 ユーザー確定）　🧠 設計 → ⚡ 流し込み
> **背景：** 本作の目標は「初代『ゼルダの伝説』レベルの面白さ」。初代のオーバーワールドは **16×8＝128 画面**。Lumia は**それを超える**規模にする、と以前合意していた（PLAN 9-2 に「最低256画面」と既記載・本節で寸法と段取りを確定）。
- **目標：最低 256 画面・第一候補は 16×16＝256（できればさらに広く）。** 初代(128)の 2 倍を下限とする。
- **現状＝10 画面**（`field` レイヤー・1画面 12×10 タイル固定・`x:0〜4 / y:0〜2` の 5×3 グリッドに 10 セル）＝目標の約 4%。**桁が 2 つ足りない**＝Phase 9 最大の残タスク。
- **⚠️「256 セルを置く」≠「256 画面を面白くする」：** 初代は 128 画面すべてに意味（敵配置・地形変化・秘密）がある。スカスカな埋め草にしないため、**画面数の確保（量）と密度（質）を分けて段階的に進める**。
- **🧠 設計で先に詰めること（数値だけでは流し込めない）：**
  1. **グリッド寸法の確定**（16×16＝256 を基本に、長方形＋海/山の自然境界で形を作るか）。
  2. **地域ブロック区画**（草原/砂漠/水辺/山岳/森/雪原/空 など。各ダンジョン周辺・中盤ハブ・終盤エリアの配置）。
  3. **主要動線**（村→各ダンジョン入口→祭壇→塔の徒歩到達性を 256 規模でも保つ。既存 `tests/field-connectivity.spec.js` の BFS が破綻しないか確認）。
  4. **辺スクロール接続規約**（`sx,sy` の隣接・縦col5,6/横row4,5 開口一致）が 256 画面でも一貫するか・チェッカー（`check-field-connectivity.mjs`）が大規模で動くか。
  5. **段取り（量→質）：** まず空き画面を地形だけで埋めて 256 を確保（接続テスト緑）→ 次に敵/宝/ギミック/NPC/秘密で密度を上げる。マイルストーンを区切る（例：64→128→256）。
- **新規ゲームコードは原則不要**（既存の field レイヤー＋辺スクロール＋ MAP_ENTER で足りる想定）。**作り込みの本体は地形・エンカウント・秘密の手作業**＝ダンジョンと同じく一点物として詰める。
- ※ この大規模拡張の設計は 🧠 Opus で別タスクとして起こす（DECISIONS.md 2026-06-28「フィールド規模目標」参照）。

###### 🗺 9-2F1 フィールド256拡張 — 設計確定（2026-06-28・🧠 Opus／ユーザー確定3点＋実コード精査・コード/JSON 変更なし）

> **このサブ節が「先に詰めること①〜⑤」への回答＝流し込み（⚡ Sonnet）の設計図。** ユーザー確定3点：**(1) 寸法＝16×20＝320画面**（256を下限として超える）／**(2) 座標枠＝村を中央〜南へ再配置（全 stage key と startPos を新フレームへ移す＝フル再採番）**／**(3) ダンジョン入口＝テーマ別に各地へ分散**。

- **(1) グリッド寸法＝16幅×20高＝320画面**（`sx:0〜15` ＝西→東／`sy:0〜19` ＝北→南）。1画面は従来どおり **12×10 タイル固定**。外周を海 `~`・内陸を山 `M`/`#` の自然境界で削るので**実効の歩行可能画面は 256 前後**＝下限256を満たす。
- **(2) 座標枠＝フル再採番（村＝中央〜南）：**
  - **村（startPos）＝ stage `"7,14"`**（幅16の中央 sx7〜8・南寄り sy14）。`startPos:{layer:"field", stage:"7,14", row, col}` へ更新。
  - 既存10画面は破棄せず**新フレームの該当テーマ位置へ「中身ごと」再キーする**（村・空島・塔接近・各ダンジョン入口画面はそのまま移設）。残り約310画面は新規。
  - **⚠️ ダンジョン↔フィールドのワープは id 解決（座標非依存）と実データで確認済み**：各ダンジョンの戻り口は `destId:"field_dungeonX"`、フィールド側は同じ `id` を持つ MAP_ENTER が受ける（`destId:"field_1".."field_dungeon8"`／空島→`fieldToTower`／笛ワープ D7 は `fluteEffect.layer/stage` 直指定）。**∴ フィールド画面を再キーしても入口が迷子にならない**＝再採番の安全性が担保されている。再キー時に直すのは「フィールド側 stage の key」と「テスト内のフィールド座標参照」だけ。
- **(3) 地域ブロック区画＋ダンジオン入口配置（テーマ別分散・進行順 D1→D2→D3→D4→D6→D5→D8→D7→祭壇→塔 を地理に対応）：**

  **地域マップ（1文字＝1画面・あくまで設計の基準図。最終地形は流し込みで調整しチェッカーで担保）**
  凡例：`V`村 `G`草原(ハブ/連絡) `F`森(D6) `D`砂漠(D2) `W`水/湖(D3) `L`火山/炎(D4) `S`雪原(D5) `M`沼地(D8) `^`山(障壁) `~`海(障壁) `K`空島(D7=笛ワープ) `T`暗黒の塔(飛行のみ)
  ```
        sx: 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
  sy 0:      ^  ^  ^  ^  ^  ^  T  K  K  ^  ^  ^  L  ^  ^  ^
  sy 1:      ^  ^  F  ^  ^  G  G  G  G  G  ^  L  L  L  ^  ^
  sy 2:      ^  F  F  F  G  G  G  G  G  G  G  L  L  L  ^  ^
  sy 3:      F  F  F  F  G  G  G  G  G  G  G  G  L  S  ^  ^
  sy 4:      F  F  F  F  G  G  G  G  G  G  G  G  S  S  S  ^
  sy 5:      F  F  F  F  G  G  G  G  G  G  G  S  S  S  S  ^
  sy 6:      F  F  F  G  G  G  G  G  G  G  S  S  S  S  ~  ~
  sy 7:      F  F  F  G  G  G  G  G  G  W  W  S  S  ~  ~  ~
  sy 8:      F  F  F  G  G  G  G  G  W  W  W  W  ~  ~  ~  ~
  sy 9:      F  F  G  G  G  G  G  G  W  W  W  ~  ~  ~  ~  ~
  sy10:      G  G  G  G  G  G  G  G  W  W  W  ~  ~  ~  ~  ~
  sy11:      G  G  G  G  G  G  G  G  G  W  W  ~  ~  ~  ~  ~
  sy12:      D  G  G  G  G  G  G  G  G  G  M  M  ~  ~  ~  ~
  sy13:      D  D  G  G  G  G  G  G  G  M  M  M  ~  ~  ~  ~
  sy14:      D  D  D  G  G  G  G  V  G  G  M  M  ~  ~  ~  ~
  sy15:      D  D  D  G  G  G  G  G  G  M  M  M  ~  ~  ~  ~
  sy16:      D  D  D  D  G  G  G  M  M  M  M  ~  ~  ~  ~  ~
  sy17:      ~  D  D  ~  G  G  G  M  M  ~  ~  ~  ~  ~  ~  ~
  sy18:      ~  ~  ~  ~  ~  G  G  ~  ~  ~  ~  ~  ~  ~  ~  ~
  sy19:      ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~
  ```

  | ダンジョン/施設 | 地域 | 入口ホーム画面(目安) | 入場方法 | 受ける mapEnter id |
  |---|---|---|---|---|
  | 村（start） | 中央草原 | **`7,14`** | startPos | — |
  | D1 入門 | 村外れ草原 | `6,13` | 徒歩 | `field_1` |
  | D2 砂漠 | 南西砂漠 | `2,15` | 徒歩 | `field_dungeon2` |
  | D3 水/湖 | 東の湖 | `9,9` | 徒歩 | `field_dungeon3` |
  | D4 炎/火山 | 北東火山 | `12,2` | 徒歩 | `field_dungeon4` |
  | D6 森 | 西の森 | `2,4` | 徒歩 | `field_dungeon6` |
  | D5 雪 | 北東雪原 | `13,5` | 徒歩 | `field_dungeon5` |
  | D8 沼 | 南東沼地 | `10,14` | 徒歩 | `field_dungeon8` |
  | D7 空 | 空島 | `8,1`(発射元 `K`) | **笛ワープ**（徒歩入口なし） | `fluteEffect.stage` |
  | cave_1 沼洞窟 | 沼地 | `9,15` | 徒歩（鍵/扉ヒント石碑を道中に） | `field_2` |
  | secret_grotto / hidden_cave | 各地 | 草原/森に分散 | 徒歩（茂み/ロウソク） | 既存 id |
  | 祭壇（翼の羽衣） | 北の聖域 | `7,1` | 徒歩（D7 クリア後に開放） | — |
  | 暗黒の塔 | 最北 | `6,0` | **飛行のみ**（翼の羽衣） | `fieldToTower`/`towerEntrance` |

- **(3-主要動線) 徒歩到達性の保証：** 草原 `G` を村 `7,14` から全テーマ地域へ伸びる連絡回廊にし、山 `^`・海 `~` の障壁の「間」を必ず1本は `G` で繋ぐ。D7（笛ワープ）と塔（飛行）以外の **全ダンジョン入口が村から徒歩到達**＝`tests/field-connectivity.spec.js` の `FOOT_DUNGEONS` が緑になる地形にする。チェッカーは BFS で320画面でもそのまま動く（実装非依存）。
- **(4) 辺スクロール接続規約は不変（320でも一貫）：** `sx+1`=東／`sy+1`=南。縦の繋ぎは隣接画面で **col5,6 の開口一致**、横の繋ぎは **row4,5 の開口一致**。`check-field-connectivity.mjs`（デッドエッジ＋孤立画面検出）で全画面を機械検証＝開口が噛み合わない辺は FAIL。
- **(5) 段取り（量→質）＝マイルストーン：**
  - **M1（量・骨格 ~64画面）：** 村 `7,14` ＋全8ダンジョン入口ホーム＋それらを結ぶ草原回廊だけを地形で敷設。`check-field-connectivity` PASS・`field-connectivity.spec` の `FOOT_DUNGEONS` 緑。**ここで「徒歩で全部回れる世界の背骨」を先に通す。**
  - **M2（量 ~128画面）：** 各地域ブロックを半分まで充填（森/砂漠/湖/火山/雪/沼の塊を形にする）。接続緑を維持。
  - **M3（量 ~256画面）：** 16×16 相当のコアを埋め切る。
  - **M4（量 320画面）：** 外周の海/山ボーダー＋秘密画面まで敷いて 320 到達。
  - **質パス（M4 後）：** 地域ごとに 敵エンカウント／宝／ギミック／NPC・看板（ガイド導線）／秘密（茂み・ロウソク・爆弾壁・笛 reveal）で密度を上げる。**この質パスは 9-3（ガイド導線）と連動**＝村〜D1 の序盤チュートリアル配置をここで作り込む。
- **新規ゲームコード不要（実コード精査済み）：** field レイヤー＋辺スクロール＋ MAP_ENTER＋既存ギミックタイルで全て賄える。流し込みは純 JSON（多画面の手作業）＋チェッカー＋テスト座標の更新。
- **⚠️ フル再採番で直すテスト（流し込み時の必須作業・実 grep 済み）：**
  - **フィールド固有座標を参照（内容を見て新キーへ）：** `tests/field-connectivity.spec.js`（start `'1,0'`→`'7,14'`／cave ヒント石碑 `'3,0'`→cave_1 道中の新画面）・`tests/lying-npcs.spec.js`（`'2,0'`/`'1,0'`）・`tests/ruined-areas.spec.js`（要確認）。
  - **汎用ロードアンカーとして `stageKey:'1,0'` を使う単体テスト約17本**（charge-beam/sword-tiers/weakness 等＝戦闘・アイテム検証で「読み込める field 画面」が欲しいだけ）：新・村キー `'7,14'` へ一括置換（地理に依存しないのでどの実在 field キーでも可）。
  - **`connectivity-tool.spec.js` の合成フィクスチャ（`'1,0'` 等）は live マップ非参照＝変更不要**（regression テストは `startPos.stage` を動的参照するので再採番に追従する）。
  - **`scripts/check-stages.mjs` / `scripts/add-dark-tower.mjs`** の `'3,0'` 等参照は流し込み時に確認。
- **流し込みフェーズの推奨：** M1 は 🧠→⚡ の境目（骨格の地理判断が要るので Opus で M1 の画面割りを確定 → M2〜M4 の充填は ⚡ Sonnet）。本節で地理基準図と入口ホームは確定済みなので、**M1 から ⚡ Sonnet 着手可**（判断は接続チェッカーが機械担保）。

##### 📐 全ダンジョン共通の規模基準（2026-06-23 ユーザー確定／2026-06-24 漸増カーブ追記）
- **各ダンジョンは 15〜25 部屋**（初代『ゼルダの伝説』のダンジョン規模に準拠）。dungeon_1（12部屋）は下限未満なので**品質・規模の基準にはしない**。
- **⚠️ 規模は「進むほど大きく」漸増させる（2026-06-24 ユーザー確定・最重要）：** 全ダンジョンを 16 で固定しない。序盤は小さく終盤は大きく＝歯ごたえのカーブを部屋数でも作る。**確定カーブ（緩やかに漸増）：**

  | D | レイヤー | 部屋数 | グリッド目安 | 備考 |
  |---|---|---|---|---|
  | D1 | dungeon_1 | **16** | 4×4 | 入門・流し込み済み（据え置き） |
  | D2 | dungeon_2 | **16** | 4×4 | 起点・流し込み済み（据え置き） |
  | D3 | dungeon_3 | **18** | 5列×4行=20 から2室欠き（`[4,0]`/`[0,3]`） | 弓矢・✅流し込み済み（2026-06-25） |
  | D4 | dungeon_4 | **20** | 5×4 / 4×5 | ロウソク |
  | D5 | dungeon_5 | **20** | 5×4 / 4×5 | はしご |
  | D6 | dungeon_6 | **22** | 5×5 から3室抜き等 | 爆弾 |
  | D7 | dungeon_7 | **22** | 5×5 から3室抜き等 | 空・笛ワープ入場 |
  | D8 | dungeon_8 | **24** | 5×5 から1室抜き等 | 沼地・新設レイヤー |
  | 塔 | dark_tower | **28+** | — | **ラスダン特例＝上限25を超えて明確に広く** |

  - **グリッドは正方形 N×N に縛らない。** 18 なら 5列×4行（=20）から袋小路2室を欠く／4列×5行など、長方形＋一部欠けで部屋数を合わせる（辺スクロール接続は grid 隣接が成立すればよい・欠け部屋は周囲を `#`WALL）。
- **最終ダンジョン（暗黒の塔 dark_tower）は上記カーブの上限（25）も超えて明確に広く**作る（ラスダンの風格・28室以上を目安）。Phase 1-5 で作った dark_tower は2フロアスタブなので、9-2 終盤で本格拡張する。**→ 設計確定（2026-06-30・🧠 Opus・下記 9-2T）：多層垂直登塔30室＋終盤動線の再接続（空島復元・祭壇移設＝現状バグ修正）。**
- 部屋は **10×12 グリッド固定**・**隣接座標への辺スクロールで接続**（`>`MAP_ENTER は外部マップ/階段専用）。部屋を足す＝隣接座標の stage を足す。

#### 9-2pre. ステージ接続チェッカーの共通ツール化＋テスト整備　🧠→⚡（設計＋実装＋テスト）　✅ 完了（2026-06-23）
> **背景（ユーザー提案・2026-06-23）：** 同一マップ（field / dungeon_*）内の**隣り合うステージ間のつながり**は本来 100% 機械検証できるはず。「隣に移動した瞬間に動けなくなる（到着セルが壁＝めり込み）」「そもそもどうやっても到達できない孤立ステージがある」を検出するプログラムを**先に整備**してから 9-2 のダンジョン流し込みに入れば、以降のステージ設計タスクの生産性と安全性が上がる。
>
> **現状の弱点（実コード精査）：** 既存 `check-dungeon-connectivity.mjs`／`check-field-connectivity.mjs` は確かにタイルレベル BFS で辺越えを再現しているが、(1) `BLOCKED` セットを各スクリプト＋テストで**手書きコピー（3箇所）**＝タイル追加でズレる、(2) **デッドエッジ検出が無い**（片側に開口があっても対岸が壁だと黙って BFS が渡らないだけ＝「隣に行くと動けない」を警告しない）、(3) **チェッカー自身のテストが無い**＝「passした」を信用しきれない。

- [x] **共通モジュール化（単一の真実）：** `scripts/lib/connectivity.mjs` を新設。`game/passable.js` の `tilePassable` と同じ静的ブロック判定（鍵/スイッチ/アイテム/敵を未所持として「閉」を全部ブロック扱い）を**1箇所に集約**し、`check-dungeon-connectivity.mjs`／`check-field-connectivity.mjs`／テストが全て import する（手書きコピー廃止）。BLOCKED は `shared/tiles.js` の TILE 定義から導出
- [x] **入口の定義（最重要・到達性の起点）：** `findEntrances(mapData, layerName)`＝**その MAP_ENTER の `id` が「他レイヤーの `destId`」から参照されている部屋＝外界が指して入ってくる扉（複数可）**。同一レイヤー内だけで往復する内部階段は入口に含めない。field は `mapData.startPos`。⚠️ 入口を1部屋当てるヒューリスティックは誤り（dungeon_1 で偶然正答していただけ＝ユーザー指摘②で修正）。
- [x] **検出項目（自動）：** ①各ステージ内の到達可能セル ②**デッドエッジ検出**＝隣接ステージへ「出る辺は開口だが到着セルが壁／到着ステージが無い」場合を**警告**（＝めり込み・場外）③**dead 部屋検出 `findOrphanRooms()`**＝**全入口の和集合**から、全 solvable gate を開いた扱い＋MAP_ENTER テレポートも辿った上で到達不能な部屋（ゲートで閉じてるだけ＝鍵で入れる部屋とは区別。**互いに繋がる島でも入口に繋がらなければ両方 dead**）④全辺が grid 隣接（`|Δsx|+|Δsy|==1`）か ⑤（任意）`--block-room=` で鍵/アイテムゲートの一本道検査 ⑥`overall verdict`＋exit code で全条件まとめた合否
  - ⚠️ **デッドエッジだけでは封印部屋を見逃す**（開口ゼロの部屋はデッドエッジが起きない）。**dead 部屋検出（③）と必ず併用**。最初これを欠いて dungeon_1 `5,0` を緑で見逃した（ユーザー指摘①）。さらに入口を雑に1つ当てていたため `3,0`/`4,0`（相互島）は偶然正答だった（ユーザー指摘②で `findEntrances` に厳密化）。
- [x] **テスト（チェッカー自身の正しさを固定）：** `tests/connectivity-tool.spec.js`（**15本**）。**わざと壊した小さなフィクスチャ**＝(a) 開口ズレ→デッドエッジ赤／(a2) 存在しない隣へ開口→no-stage 赤／(b) 孤立＝未到達／(b2) 封印部屋＝開口ゼロでも orphan で赤／(b3) 鍵扉で繋がる部屋は orphan でない／**(b4) 相互に繋がるが入口に繋がらない島＝両方 dead**／**(b5) 複数入口＝第2入口から到達できる部屋は dead でない**／(c) 正常→緑／ボス出入り口着地は誤検出しない／`--block-room` で一本道／**`findEntrances` がクロスレイヤー参照で外部入口を特定し内部階段を除外する**／**実 dungeon_1 の dead `3,0/4,0/5,0` を実際の入口から検出する regression**（9-2a2 で接続したら赤くなる＝更新の合図）／**実 field は dead 0（入口＝startPos・空島4,0は darkTower ポータルで到達＝dead でない）regression**
- [x] ※ 機械検証の限界も明記：到達可能性・辺整合・孤立検出は**完全自動**。一方「一本道（鍵を取らないとボス不可）」は半自動（`--block-room`）、「面白いか・意図どおりの体験か」は機械では測れない＝人間/Opus 判断
> **この後の運用：** D1〜D8（dungeon_1〜8）・フィールド拡張の流し込み後は必ずこのツール（＋`--block-room`）に通し、デッドエッジ0・孤立0・一本道成立を機械確認してから「接続OK」とする。

#### 9-2pre-2. 接続チェッカー：水タイル着地の未検出盲点を修正　⚡ Sonnet

> **背景（2026-06-30 ユーザー指摘）：** `field/8,9` の下辺・中央以外の列から `8,10` へ辺スクロールすると水 `~` タイルに着地して身動き不能になる（はしご未所持）。現チェッカーは `~` を `arrival-wall` と見なさないため PASS してしまう。詳細は DECISIONS.md 2026-06-30。

- [ ] **盲点の根本原因確認：** `scripts/lib/connectivity.mjs` の BLOCKED 判定に `~`（水）が含まれているか確認。`game/js/passable.js` の `tilePassable` と照合し、はしご未所持時に通行不可になるタイルを全て洗い出す（`~` の他に `x`pit・`%`sky 等）。
- [ ] **修正方針の選択（どちらかまたは両方）：**
  - **(A) チェッカー修正**：`~`/`x`/`%` を BLOCKED に追加（はしご/翼の羽衣なしのデフォルト判定として）。既存の `--with-ladder` フラグを拡張し、はしご所持時は `~` を通行可扱いにする（D5/D8 水堀検査との整合）。
  - **(B) 辺規約の lint 強化**：廊下（縦=col5-6 / 横=row4-5）以外の辺は `#` か `~` で必ず塞ぐ規約を `scripts/lib/connectivity.mjs` の deadeEdge チェックと合わせて明文化。移行スクリプトが廊下以外の開口を作らないよう確認。
- [ ] **テスト追加**：`tests/connectivity-tool.spec.js` に「辺スクロール着地が `~` タイル＝DEAD_EDGE として検出されること」のフィクスチャテストを追加（既存 `arrival-wall '#'` ケースと対で）。
- [ ] **既存フィールドの一括スキャン**：`check-field-connectivity.mjs` を修正後に再実行し、`~` 着地の DEAD_EDGE を全画面で洗い出す。発見した箇所は画面の辺を `#` で塞ぐ or 地形を修正する。

> ⚠️ **着手優先度：** 暗黒の塔拡張・ダンジョンレビュー（9-2y）の後、Phase 9 後半ポリッシュフェーズで対処推奨。それ以前に辺スクロールを多用する新画面を追加する場合は、廊下以外の辺を `#` で手動閉鎖すること。

##### 🔗 ステージ接続の規約（実コード `game.js:977-980` 精査・2026-06-23）── ⚠️ つなぎが壊れる最大の原因
> **ここを Opus で図として確定してから Sonnet に渡す。** 部屋間移動は辺スクロールで、**隣接 grid 座標に stage があれば移動する**だけ＝「出た辺と入る辺の開口が地形的に噛み合うか」は誰もチェックしない。噛み合わないと壁めり込み/詰み/裏口でボス直行（必須化の一本道が破れる）が起きる。
- **stageKey は `"sx,sy"`（sx=列=x軸／sy=行=y軸）。** 右隣＝`sx+1`／左隣＝`sx-1`／下隣＝`sy+1`／上隣＝`sy-1`。
- **辺スクロールで保持される座標：** 上下移動は**列(x)を保持**（`newCol=x`）、左右移動は**行(y)を保持**（`newRow=y`）。
- **∴ 開口位置の一致ルール（厳守）：**
  - **縦の繋ぎ（上下）：** 上の部屋の**下辺(row9)**と下の部屋の**上辺(row0)**を、**同じ列**で開口する。dungeon_1 規約に倣い **col5,6**（中央2マス）で統一。
  - **横の繋ぎ（左右）：** 左の部屋の**右辺(col11)**と右の部屋の**左辺(col0)**を、**同じ行**で開口する。**row4,5**（中央2マス）で統一。
  - 開口＝その端セルを `#`WALL でなく `.`FLOOR 等の通行可にする。**繋ぎたくない辺は `#` で塞ぐ**（裏口防止）。
- **接続グラフの検証（Sonnet 流し込み後に必ず実行・下記スクリプトで機械検査）：**
  1. 全辺が隣接座標（`|Δsx|+|Δsy|==1`）か
  2. ENTRY から全部屋へ到達可能か（孤立・行き止まりの意図確認）
  3. **ボス部屋の隣接は1つだけ**（裏口なし）か
  4. **臨界経路の一本道担保**＝鍵/報酬アイテムの部屋を塞ぐとボスに到達不能になるか（迂回でボス直行できない）
  5. 各辺の両側で開口の列/行が一致しているか（縦=同col・横=同row）
  - **検証ツール：** `scripts/check-dungeon-connectivity.mjs`（タイルレベル BFS で `checkStageTransition` の sx/sy 辺越えを再現＝「辺の開口が噛み合うか」を実地で検査）。`node scripts/check-dungeon-connectivity.mjs dungeon_2` で到達可能部屋・ボス部屋の隣接を出力。`--block-room=1,1` でブーメラン部屋を塞ぎボスが切れるか（一本道）を検査。既存の `check-field-connectivity.mjs`（フィールド用）と対。

##### 🔧 9-2 で「実際に配線されている」仕掛けの確定（実コード精査・2026-06-23）
> ⚠️ **足止め・ロックは下記の "配線済み" 仕掛けだけで作る。** 設計時に未配線タイルを当てにすると詰む。
- ✅ **使える（剣＝武器のみで起動、サブアイテム不要）：**
  - `K`KEY → `D`DOOR（`player.keys`／`openedDoors`。最もクリーンな"鍵で1枚開ける"足止め）
  - `*`STONE を `S`BUTTON へ押し込む → `links`{switchId→gateId} で `T`GATE が開く（押している間 ON。石なら永続 ON）
  - `Y`SWITCH を**剣で叩く**とトグル → `links` で `T`GATE 開閉（状態維持）
  - `[`/`]` 色スイッチを**剣で叩く** → `(`/`)` 色ゲートの開閉（`activeColor` 排他切替＝ナビ謎向き）
  - `showConditions`{trigger:`killAll`/`torchesLit`/`switchOn`/`allSwitchesOn`} → **封印宝箱/隠しアイテムの出現**（※"道"ではなく"報酬"を出す用途。タイル出現は描画のみで、壁を消して道を開く挙動はしない）
  - `:`DOORWAY_BOSS → ボス入室で施錠・撃破で開放（`isBossRoom:true` の部屋に置く）
- ❌ **使えない（死にコード／用途外）：**
  - **`|`DOORWAY_LOCKED は開かない**（`unlockLockedDoor()` が定義済みだが**どこからも呼ばれていない**＝条件達成で 'open' にならない）。**D2 では使用禁止。**（将来、条件で開けたいなら別タスクで配線を実装してから）
  - `!`BREAKABLE_WALL は**爆弾でしか壊せない**＝D2（爆弾未所持）では足止めに使えない（壁としては機能するが"開けられない壁"になる）。

#### 9-2a2. dungeon_1「草原の洞窟」リメイク（D1＝入門ダンジョン・木の盾＋欠片①報酬）　🧠 設計確定（2026-06-23）／⚡ データ流し込み
> ⚠️ **dungeon_1 は "現状のまま据え置き" 不可。** 実データ監査で 9-1 連鎖との重大な矛盾が判明（2026-06-23）：
> - **報酬が連鎖と食い違う：** 9-1 では D1 報酬は「**木の盾（tier0・ガードのみ・reflect:0）＋欠片①**だけ」のはず。だが現状 dungeon_1 には**木の盾が無く**、代わりに **ミラーシールド（tier2・reflect1.0／chest `4,0["2,8"]`）・聖剣tier3×2（chest `1,2["4,8"]`・floor `2,1["4,5"]`）・伝説のよろいtier2×2（chest `0,1["1,1"]`・`3,0["3,10"]`）・銀の剣tier2（floor `0,1["4,9"]`）・さいごの鎧tier2（floor `2,1["3,6"]`）** が散在＝**入門ダンジョンで最強級装備が全部揃う**。9-1 では鉄の盾＝D5報酬・ミラーシールド＝cave_1報酬と決めたので、これらは温存対象。
> - **規模が基準未満：** 12部屋（15〜25 の下限未満）。
> - **欠片①はボス`G`岩のゴーレム（HP30・`dropsTriforce:true`）の撃破ドロップ＝これは正しい**（据え置き）。`triforceId:1`・`bossStage:"2,0"` も維持（再配置するなら更新）。
>
> **役割：** プレイヤーが**最初に攻略する入門ダンジョン**。主題＝**戦闘の基本**（剣だけで雑魚を捌く）＋**木の盾の入手と即実践**。**古典ゼルダ型(B)の適用：** 木の盾を**ボス`G`の手前（中盤の宝箱）**で入手 → **ボス`G`は遠隔の岩投げ（range6）持ち＝木の盾でガードしながら倒す部屋**にして「盾を入手したダンジョンで盾を使い倒す」体験にする。報酬＝**木の盾（tier0）＋欠片①**（欠片はボス`G`撃破ドロップ）。**盾なしでも HP30 を削れば倒せる＝詰まない**（盾は安全装置）。**剣だけで完全クリア可能**（🔑鉄則(A)）。

- [x] **16部屋レイアウト＋接続グラフを確定**（4×4 グリッド・辺スクロール接続・node スクリプトで論理検証済み 2026-06-23：全16室到達／ボス`[0,0]`の隣接は`[0,1]`のみ＝裏口なし／鍵部屋`[1,0]`・扉部屋`[0,1]`を塞ぐとボス到達不能＝一本道）。**stage 座標は `sx,sy`（sx=列／sy=行）。** 役割と接続は下記マップのとおり（D2=9-2b と同粒度）：

  ```
  配置（4列×4行。左上が sx,sy 小）：
    sy\sx   0(西)              1                  2                3(東)
    0(北)  [0,0]BOSS G        [1,0]中ボスW+鍵K    [2,0]寄道ルピー   [3,0]寄道回復(袋小路)
    1      [0,1]D扉→ボス       [1,1]木の盾入手     [2,1]寄道(石→S→T宝) [3,1]コンパス宝(袋小路)
    2      [0,2]torchesLit宝   [1,2]雑魚ハブ       [2,2]分岐ハブ+地図m [3,2]寄道宝(袋小路)
    3      [0,3]寄道(袋小路)    [1,3]ENTRY         [2,3]雑魚         [3,3]寄道(袋小路)

  臨界経路（一本道・検証済み）：
    [1,3]ENTRY →(上)[1,2]雑魚ハブ →(上)[1,1]木の盾入手 →(上)[1,0]中ボスW撃破→鍵K入手
      →(下に戻る)[1,1] →(左)[0,1]D扉部屋（鍵Kで開ける）→(上・Dを抜ける)[0,0]BOSS
    ※ 鍵Kは中ボス部屋[1,0]にのみ存在。[0,1]→[0,0] の D扉は鍵が無いと開かない＝中ボスを倒さないとボスに到達不能（足止め＝1鍵ゲート）。
    ※ ボス[0,0]の grid 隣接は[0,1]のみ＝裏口なし（他の辺は全て #WALL）。
  ```
  - **辺の開口座標（縦の繋ぎ＝同col5,6／横の繋ぎ＝同row4,5・厳守）。全15辺：**
    - `[1,3]ENTRY` 上辺(row0,col5/6) ⇔ `[1,2]` 下辺(row9,col5/6)／左辺(col0,row4/5) ⇔ `[0,3]` 右辺(col11,row4/5)／右辺(col11,row4/5) ⇔ `[2,3]` 左辺(col0,row4/5)
    - `[1,2]雑魚ハブ` 上辺 ⇔ `[1,1]` 下辺(col5,6)／左辺 ⇔ `[0,2]` 右辺(row4,5)／右辺 ⇔ `[2,2]` 左辺(row4,5)
    - `[1,1]木の盾` 上辺 ⇔ `[1,0]` 下辺(col5,6)／左辺 ⇔ `[0,1]` 右辺(row4,5)
    - `[0,1]D扉` 上辺(row0,col5/6) ⇔ `[0,0]BOSS` 下辺(row9,col5/6)。**D扉は[0,1]内の上辺直下（row1,col5/6）に置き、その行の他セルを #WALL で塞ぐ＝北へ抜けるには D を開けるしかない。** `[0,0]BOSS` 下辺は `:`DOORWAY_BOSS（入室で施錠）
    - `[1,0]中ボス` 右辺 ⇔ `[2,0]` 左辺(row4,5)。**⚠️ `[1,0]`の左辺(col0)は #WALL で塞ぐ**（ボス[0,0]右辺との裏口を作らない）
    - `[2,0]寄道` 右辺 ⇔ `[3,0]` 左辺(row4,5)
    - `[2,2]分岐ハブ` 上辺 ⇔ `[2,1]` 下辺(col5,6)／右辺 ⇔ `[3,2]` 左辺(row4,5)
    - `[2,1]寄道` 右辺 ⇔ `[3,1]` 左辺(row4,5)
    - `[2,3]雑魚` 右辺 ⇔ `[3,3]` 左辺(row4,5)
  - **⚠️ 上記15辺以外の全辺は `#`WALL で塞ぐ**（特にボス[0,0]の上下左右のうち[0,1]への下辺以外＝[0,1]top以外は壁・[1,0]の左辺＝[0,0]右への裏口は壁）。
  - **各部屋の役割：** ENTRY`[1,3]`（field 1,1 (8,8) からの戻り出口`>`(id:"dungeon_1")・看板`i`で「奥に盾と欠片」予告）／雑魚ハブ`[1,2]`（`E`/`C`・3方向分岐）／木の盾入手`[1,1]`（宝箱 `{type:'shield',shieldTier:0,name:'木の盾'}`・看板「飛び道具は盾で防げ」）／中ボス+鍵`[1,0]`（`W`MONSTER 撃破→鍵`K`・`E`数体）／D扉`[0,1]`（`D`扉で北の[0,0]へ・鍵K必須）／BOSS`[0,0]`（`isBossRoom:true`・下辺`:`・`G`岩のゴーレム・撃破で`Q`欠片①ドロップ・`bossStage:"0,0"`に更新・ハートの器`B`）／torchesLit宝`[0,2]`（`H`かがり火3つ全点灯で封印宝箱＝既存`torchesLit`／剣でなく道中で点ける）／分岐ハブ+地図`[2,2]`（地図`m`）／石→S→T寄道`[2,1]`（`*`石を`S`ボタンへ→`links`でゲート`T`開・宝）／コンパス`[3,1]`（`n`）／寄道`[2,0][3,0][3,2][0,3][2,3][3,3]`（ルピー`r`/回復薬`7`/雑魚）
- [x] **接続グラフの機械検証スクリプトを通す**（`node scripts/check-dungeon-connectivity.mjs dungeon_1` → PASS・全16室到達。`--block-room=1,0` でボス到達不能を確認。2026-06-23）
- [x] **撤去（9-1 連鎖と矛盾する装備を除去）：** 旧12部屋を全入替（矛盾装備は新レイアウトに引き継がず除去済み）。上位装備の温存先は後続フェーズで配置
- [x] **報酬を木の盾（tier0）＋欠片①に集約：** `[1,1]` に木の盾 `{type:'shield',shieldTier:0}` 配置。欠片①はボス`G`撃破ドロップのまま（`dropsTriforce:true`）
- [x] **16部屋（4×4 グリッド）に拡張完了。** 地図`m`/コンパス`n`/看板`i`・ギミック教科書配置を維持
- [x] **足止め部屋：** `[1,0]`中ボス`W`撃破→鍵`K`→`[0,1]`の`D`扉（鍵1枚ゲート）。寄道ギミック＝`[2,1]`に`C/*/S/T/B`・`[1,2]`に`HHH torchesLit`封印宝箱・`[3,0]`に`[/]/(/)`色スイッチパズル+killAll封印宝箱
- [ ] **🔑鉄則の検算：** D1 はサブアイテム皆無でクリアできること。設計上OK・実プレイ確認は後続セッション
- [ ] **村スタートの剣集約と整合：** 9-3 で整理
- [ ] **動作確認：** `fromEditor=1` プレビューで村→D1入場→ボス→木の盾＋欠片①→帰還

#### 9-2b. dungeon_2「砂漠の神殿」作り込み（D2＝ブーメラン報酬・最初の進行ダンジョン）　🧠 設計確定（2026-06-23・古典ゼルダ型へ改訂）／⚡ データ流し込み
> **役割：** アイテム連鎖の**起点**＋**古典ゼルダ型の最初の見本**。報酬＝**ブーメラン＋欠片②**。**規模＝16部屋**（4×4 グリッド、15〜25 の範囲内・dungeon_1 比 +4）。テーマ＝砂漠（`bgTiles` に `d`SAND を敷く）。ボス＝`N`砂嵐の蠍王（HP32／弱点ブーメラン×3）。
>
> **🎮 古典ゼルダ型(B)の背骨：** 入口→雑魚→**ブーメランを中盤の宝箱で入手** →**ブーメランが無いと突破できない部屋**（下記）→ ボス`N`（ブーメランが弱点＝スタン＋×3／剣でも可）→ 欠片②。**⚠️ ブーメランは `Y`SWITCH をトグルしない**（実コード確認済み）ので、必須化は次のどちらかで作る：
>   - **(案1・採用) 隙間越しの `K`鍵回収：** 2マス幅以上の水/穴 `~`/`x`（**はしご無しでは渡れない＝D5報酬を要求しないので (A) OK**）の対岸に `K`鍵を置く。**ブーメランの `collectFieldItem` で鍵を回収** → その鍵で `D`扉を開けてボスへ。「ブーメランでしか取れない鍵」＝必須化が自然。
>   - （案2・予備）`H`かがり火を対岸/高所に置き、ブーメランで炎を運んで点灯 → `torchesLit` で封印扉の宝（鍵）出現。案1 で十分なら使わない。
>
> **🎓 副主題＝「木の盾の実践」**（D1 で得た盾を使う）。`F`SENTRY（槍を range4 で投げる遠隔兵）を道中に置き、盾でガードして進む場面を作る（剣でも倒せる＝強制でなく誘導）。
>
> **難易度カーブ：** 雑魚`E`/`C` → 仕掛け（石押し`*→S→T`）→ 遠隔兵`F`（盾の出番）→ **ブーメラン入手** → ブーメラン必須の鍵回収部屋 → 中ボス`W` → ボス`N`。
>
> **🔑鉄則の検算（改訂後）：** D2 は「**剣・木の盾・石押し・鍵・ブーメラン（D2 内で入手）**」だけでクリアできること。**後ダンジョンの報酬（弓/ロウソク/爆弾/はしご/笛）を一切要求しない**＝(A) を厳守。ブーメラン入手前の区間はブーメラン不要で進めること（入手場所まで剣だけで到達できる）。

- [x] **16部屋レイアウト＋接続グラフを確定**（4×4 グリッド・辺スクロール接続・node スクリプトで論理検証済み 2026-06-23）。**stage 座標は `sx,sy`（sx=列／sy=行）。** 役割と接続は下記マップのとおり：

  ```
  配置（4列×4行。左上が sx,sy 小）：
    sy\sx   0(西)            1               2               3(東)
    0(北)  [0,0]BOSS        [1,0]中ボスW     [2,0]寄道ルピー  [3,0]寄道回復(袋小路)
    1      [0,1]鍵回収+D扉  [1,1]ブーメラン  [2,1]盾F部屋     [3,1]コンパス宝
    2      [0,2]石押し→T宝  [1,2]雑魚2(ハブ) [2,2]分岐ハブ    [3,2]地図宝
    3      [0,3]寄道(袋小路) [1,3]ENTRY      [2,3]雑魚1       [3,3]寄道(袋小路)

  臨界経路（一本道・検証済み）：
    [1,3]ENTRY →(上)[1,2]雑魚2 →(上)[1,1]ブーメラン入手 →(左)[0,1]鍵回収+D扉 →(上)[0,0]BOSS
    ※ [1,1]ブーメラン部屋を塞ぐとボス到達不能＝ブーメラン必須が接続でも二重保証。
    ※ ボス[0,0]の隣接は[0,1]のみ＝裏口なし。
  ```
  - **辺の開口座標（縦=同col5,6／横=同row4,5・厳守）：**
    - `[1,3]ENTRY` 上辺(row0,col5/6) ⇔ `[1,2]` 下辺(row9,col5/6)／右辺(col11,row4/5) ⇔ `[2,3]` 左辺(col0,row4/5)／左辺(col0,row4/5) ⇔ `[0,3]` 右辺(col11,row4/5)
    - `[2,3]` 上辺 ⇔ `[2,2]` 下辺
    - `[1,2]` 右辺 ⇔ `[2,2]` 左辺／上辺 ⇔ `[1,1]` 下辺／左辺 ⇔ `[0,2]` 右辺
    - `[2,2]` 上辺 ⇔ `[2,1]` 下辺／右辺 ⇔ `[3,2]` 左辺
    - `[3,2]` 上辺 ⇔ `[3,1]` 下辺／下辺 ⇔ `[3,3]` 上辺
    - `[2,1]` 右辺 ⇔ `[3,1]` 左辺
    - `[1,1]` 左辺 ⇔ `[0,1]` 右辺／上辺 ⇔ `[1,0]` 下辺
    - `[1,0]` 右辺 ⇔ `[2,0]` 左辺
    - `[2,0]` 右辺 ⇔ `[3,0]` 左辺
    - `[0,1]` 上辺 ⇔ `[0,0]BOSS` 下辺（**ボスの唯一の入口**）
  - **⚠️ 上記以外の全辺は `#`WALL で塞ぐ**（裏口防止）。各部屋の役割：入口`[1,3]`（field 1,2 の `7,5` から入る `>`戻り出口・看板`i`）／雑魚`[2,3][1,2]`（`E`/`C`・砂地）／盾の出番`[2,1]`（`F`SENTRY＋遮蔽柱）／石押し`[0,2]`（`*→S→T`で宝）／ブーメラン入手`[1,1]`（宝箱 `{type:'item',item:'boomerang'}`）／鍵回収`[0,1]`（2マス幅水/穴の対岸に`K`→ブーメラン回収→`D`扉で[0,0]へ）／中ボス`[1,0]`（`W`撃破でハート器）／ボス`[0,0]`（`isBossRoom:true`・`:`DOORWAY_BOSS・`N`・`Q`欠片②）／宝`[3,2]`地図`m`・`[3,1]`コンパス`n`／寄道`[2,0][3,0][0,3][3,3]`（ルピー/回復薬）
- [x] **接続グラフの機械検証スクリプトを通す**（`node scripts/check-dungeon-connectivity.mjs dungeon_2` → PASS。`--block-room=1,1` でボス到達不能を確認。2026-06-23）
- [ ] **必須化の検算（最重要）：** ブーメラン無しでは鍵が取れない設計になっているか実プレイで確認（水モート幅2マス）
- [ ] **(A) ソフトロック検算：** D2 内で後ダンジョン報酬を要求していないこと
- [x] **アイテム移設（9-2a 表）を反映：** D2 `[1,1]` にブーメラン宝箱配置済み。field 側の旧ブーメラン配置（tile/孤児chest/ショップ）の撤去は 9-3 で整理
- [x] **dungeon_2 の `meta` を整備**（`bossStage:"0,0"` / `triforceId:2` / `name:"砂漠の神殿"` 設定済み）
- [ ] **動作確認：** `fromEditor=1` プレビューで入口→ブーメラン入手→鍵回収→扉→中ボス→ボス→欠片②→field 帰還

#### 9-2{d〜} dungeon_3〜8（D3 水／D4 炎／D6 森／D5 氷／D8 沼地〔レイヤー新設〕／D7 空）の作り込み　🧠 1つずつ設計（古典ゼルダ型）
- [ ] D2 のテンプレ（15〜25部屋・辺スクロール網・配線済み仕掛けのみ・**そのダンジョンの報酬を中盤で入手→必須化部屋→ボス**・(A)ソフトロック厳禁・足止め最低1・欠片はボス撃破）に沿って 1 つずつ作り込む。各ダンジョンの必須化ギミック（配線確認済み）：
  - **D3 水（弓矢）：** 弓を中盤入手 → `Y`SWITCH を**矢で遠隔トグル**→`T`ゲートで奥へ。ボス`J`弱点 beam（剣チャージ可）。内部の水は既存橋 `v` で渡る（はしご＝D5報酬を要求しない＝(A)）。**✅ 流し込み完了（2026-06-25・⚡ Sonnet→🧠 Opus・18部屋・connectivity/integrity 両グリーン・bow-gate実プレイ検証済み）＝下記 9-2d**
  - **D4 炎（ロウソク）：** ロウソク中盤入手 → `H`かがり火を全点灯（`torchesLit`）→ 隠し `>`テレポートでボス翼へ。ボス`A`弱点 arrow（弓＝D3報酬で◎・剣可）。**✅ 流し込み完了（2026-06-25・⚡ Sonnet・20部屋・チェッカー PASS・tests/candle-gate.spec.js 3本グリーン）**
  - **D6 森（爆弾）：** ロウソク（D4報酬）でかがり火全点灯→隠し `>`テレポートで関門突破→中盤で**爆弾入手→ `!`BREAKABLE_WALL を割って奥へ**。ボス`O`弱点 fire（ロウソク＝D4報酬で◎・剣可）。**✅ 設計確定（2026-06-27・🧠 Opus・22部屋・新規ゲームコード/接続チェッカー拡張すべて不要＝D4 の `torchesLit`テレポート＋D5 の `!`爆弾壁の組合せ）＝下記 9-2g**
  - **D5 氷（はしご）：** はしご中盤入手 → 1セル幅の水/穴 `~`/`x` を渡ってボスへ。**D5 入場は爆弾`!`で**（はしごは D5 報酬＝D5 内で入手するので入場には使わない＝(A)）。ボス`L`弱点 fire
  - **D8 沼地（笛）※レイヤー新設：** 笛中盤入手 → `flutePlayed` で隠し入口/通路を出して奥へ。ボス＝沼地の大蝦蟇 `I`（部品は 9-2c 作成済み）。入場は はしご。**`dungeon_8` を新設して配置**（cave_1 ではない＝位置づけ修正 2026-06-24）。テーマ・フィールド入口はゼロから設計。**✅ 設計確定（2026-06-27・🧠 Opus・24部屋・新規ゲームコード/接続チェッカー拡張すべて不要＝`flutePlayed`reveal〔conditions.js:96 実装済み〕＋D5 の `--with-ladder` 水堀入場の組合せ・新設レイヤーなので「8体目のボス`I`配置＋`Q`タイル2枚撤去で欠片ちょうど8」を同時に是正）＝下記 9-2h**
  - **D7 空（報酬は欠片⑧のみ＝新アイテムなし）：** D7 は固有の進行アイテムを配らないので、古典ゼルダ型の「自分の報酬で解く」は適用外。**笛ワープで入る**空島ダンジョンとして、既得アイテム（弓等）の総合ステージにする。ボス`U`弱点 arrow。**✅ 設計確定（2026-06-27・🧠 Opus・9-2i）＝笛ワープ入場＋弓ゲート/爆弾!壁の総合試験・新規コード不要・U 配置済みで欠片是正不要**。**✅ 設計確定（2026-06-27・🧠 Opus・22部屋・笛ワープ入場〔`fluteEffect:warp` 実装済み〕＋既得6道具の総合ステージ〔臨界経路＝弓`Y`→`T`／爆弾`!`壁の2関門〕・新規ゲームコード/接続チェッカー拡張すべて不要・U は配置済みで欠片是正不要）＝下記 9-2i**

#### 9-2d. dungeon_3「水の迷宮」作り込み（D3＝弓矢報酬・2番目の進行ダンジョン）　✅ 完了（2026-06-25・18部屋・流し込み＋実プレイ検証済み）
> **役割：** アイテム連鎖の2段目。報酬＝**弓矢＋欠片③**。**規模＝18部屋**（**漸増カーブ準拠：D1/D2=16 → D3=18**。5列×4行=20 グリッドから袋小路2室 `[4,0]`/`[0,3]` を欠いて18）。テーマ＝水路の迷宮（`bgTiles` に床は石畳 `o`／水路 `~` を縦横に通し `v`BRIDGE で渡る）。ボス＝`J`深海の海蛇（HP38・弱点 **beam** ×2＝剣チャージビームで◎・通常剣でも可）。
>
> **🎮 古典ゼルダ型(B)の背骨：** 入口→雑魚→**弓矢を中盤の宝箱で入手** →**弓が無いと突破できない部屋**（下記）→ ボス`J`（beam 弱点・剣でも可）→ 欠片③。**必須化＝`Y`SWITCH を矢で遠隔トグル→`T`GATE が開く**（実コード確認済み：`combat.js` で矢/剣が `Y` に当たると `toggleSwitch`→`links[{switchId,gateId}]` で `openGates` 開閉）。
>   - **必須化部屋 `[1,1]`（弓ゲート）：** 部屋中央を 2マス幅以上の水堀 `~` で分断し、対岸（プレイヤーが徒歩で立てない側）に `Y`SWITCH を置く。臨界経路の出口（ボス側へ向かう辺）を `T`GATE で塞ぐ。**矢でしか `Y` に届かない**＝弓必須。`links:[{switchId:"<Yのrow,col>", gateId:"<Tのrow,col>"}]`。橋 `v` は渡らせず、対岸へ歩いて行けないように水で囲う（はしご＝D5報酬は要求しない＝(A) OK）。
>   - ⚠️ ブーメランでも `collectFieldItem` は起きるが `Y` はトグルしない（D2 で確認済み）。ここは「飛び道具で当てるスイッチ」なので**弓専用の関門になる**（ブーメランは届く距離が短く maxRange 内に `Y` が無い配置にする＝水堀幅で保証）。
>
> **🎓 副主題＝「水路の読み」**（`v`BRIDGE で渡る経路選択＋`F`SENTRY を盾でいなす）。D2 で得た木の盾／D1 の剣チャージ（beam）をボスで活かす。
>
> **難易度カーブ：** 雑魚`E`/`C` → 水路の渡り（`v`橋・分岐）→ 遠隔兵`F`（盾の出番）→ **弓矢入手** → 弓必須の `Y`→`T` 関門 → 中ボス`W`（鍵`K`ドロップ）→ `D`扉 → ボス`J`。
>
> **🔑鉄則の検算：** D3 は「**剣・木の盾・剣チャージ(beam)・鍵・弓矢（D3 内で入手）**」だけでクリアできること。**後ダンジョンの報酬（ロウソク/はしご/爆弾/笛）を一切要求しない**＝(A) を厳守。弓入手前の区間は弓不要で進めること。内部の水は `v`BRIDGE で渡り、**はしご前提の `x`PIT 渡り・1セル水渡りは臨界経路に置かない**（寄道で置く場合も出口を塞がない＝整合性チェッカー WARNING 止まり）。

- [x] **18部屋レイアウト＋接続グラフを確定**（5列×4行=20 から袋小路2室を欠いて18・辺スクロール接続・`check-dungeon-connectivity.mjs` で論理検証する）。**stage 座標は `sx,sy`（sx=列／sy=行）。** 役割と接続は下記マップのとおり（D2=9-2b と同粒度・列を1本増やして漸増規模に）。**⚠️ 流し込み時に PLAN の接続表から2点修正（ソフトロック防止）：① `[0,2]` は `[1,2]` の左にぶら下がる寄道専用にし、`[0,2]→[0,1]` の縦接続は塞いだ（開けると弓ゲートを迂回して `[0,1]`→ボスに到達できてしまうため）。`[0,1]` は `[1,1]` の `T`ゲート経由でのみ入れる。② `[2,1]` は bottom/right のみ開口（top は壁）。** 詳細 DECISIONS「Phase 9-2d」：

  ```
  配置（5列×4行。左上が sx,sy 小。「──」は欠け部屋＝stage を置かない・周囲は #WALL）：
    sy\sx   0(西)            1                2              3              4(東)
    0(北)  [0,0]BOSS        [1,0]中ボスW+鍵K  [2,0]寄道ルピー [3,0]水路パズル宝 ── (欠け)
    1      [0,1]鍵D扉+前室   [1,1]弓ゲートY→T  [2,1]盾F部屋    [3,1]コンパス宝   [4,1]寄道(袋小路)
    2      [0,2]雑魚2+宝     [1,2]弓矢入手     [2,2]分岐ハブ   [3,2]地図宝       [4,2]寄道回復(袋小路)
    3      ── (欠け)        [1,3]ENTRY        [2,3]雑魚1(水路) [3,3]水路渡り橋   [4,3]寄道ルピー(袋小路)

  実部屋（18）：[0,0][1,0][2,0][3,0] / [0,1][1,1][2,1][3,1][4,1] /
              [0,2][1,2][2,2][3,2][4,2] / [1,3][2,3][3,3][4,3]
  欠け（2）  ：[4,0] / [0,3]

  臨界経路（一本道・要検証）：
    [1,3]ENTRY →(上)[1,2]弓矢入手 →(上)[1,1]弓ゲート(Y→T) →(左)[0,1]鍵D扉前室
      →(上)[0,0]BOSS … ただし [0,1]→[0,0] の D扉は [1,0]中ボスW撃破の鍵Kで開く
    別経路：[1,1]→(上)[1,0]中ボスW撃破→鍵K入手→[1,1]戻る→[0,1]でD扉→[0,0]BOSS
    ※ [1,1]弓ゲートを塞ぐとボス到達不能＝弓必須が接続でも二重保証。
    ※ ボス[0,0]の隣接は[0,1]のみ＝裏口なし。
  ```
  - **臨界経路の確定（弓→中ボス→鍵→扉→ボスの順序を強制・規模拡大でも不変）：**
    1. `[1,3]ENTRY` → `[1,2]` で**弓矢入手**（剣だけで到達可）
    2. `[1,2]` → `[1,1]` の `Y`→`T` ゲートを**矢で開けて通過**（弓必須・左辺出口を `T` で塞ぐ）
    3. `[1,1]` → `[1,0]` で**中ボス`W`撃破→鍵`K`**（`W` は剣で倒せる）
    4. `[1,1]` or 経路上 → `[0,1]` 前室 → `D`扉（鍵で開く）→ `[0,0]BOSS`
    - **接続検証ポイント：** `[1,1]` の `T` を閉じたままだと `[1,0]`（中ボス＝鍵）にも `[0,1]→[0,0]`(ボス)にも行けない＝弓が無いと完全に詰む経路にする。`--block-room=1,1` でボス到達不能を確認する。
    - **東側1列（sx=3,4）は寄道・宝・水路パズルのサブ網**＝臨界経路に絡めない（任意探索でルピー/地図/コンパス/回復）。漸増分の2室は主にここに吸収＝**難所を増やさず探索ボリュームを足す**（D3 は連鎖2段目＝難度は中・規模で歯ごたえを出す）。
  - **辺の開口座標（縦=同col5,6／横=同row4,5・厳守。D2 と同規約）：**
    - `[1,3]ENTRY` 上辺(row0,col5/6) ⇔ `[1,2]` 下辺(row9,col5/6)／右辺(col11,row4/5) ⇔ `[2,3]` 左辺(col0,row4/5)
    - `[2,3]` 上辺 ⇔ `[2,2]` 下辺／右辺 ⇔ `[3,3]` 左辺
    - `[3,3]` 上辺 ⇔ `[3,2]` 下辺／右辺 ⇔ `[4,3]` 左辺
    - `[1,2]` 上辺 ⇔ `[1,1]` 下辺／右辺 ⇔ `[2,2]` 左辺／左辺 ⇔ `[0,2]` 右辺
    - `[2,2]` 上辺 ⇔ `[2,1]` 下辺／右辺 ⇔ `[3,2]` 左辺
    - `[3,2]` 上辺 ⇔ `[3,1]` 下辺／右辺 ⇔ `[4,2]` 左辺
    - `[4,2]` 上辺 ⇔ `[4,1]` 下辺
    - `[2,1]` 右辺 ⇔ `[3,1]` 左辺
    - `[3,1]` 上辺 ⇔ `[3,0]` 下辺
    - `[1,1]` 左辺 ⇔ `[0,1]` 右辺／上辺 ⇔ `[1,0]` 下辺　※ **`[1,1]` の左辺(→[0,1])を `T`GATE で塞ぐ＝弓必須の関門**
    - `[1,0]` 右辺 ⇔ `[2,0]` 左辺
    - `[0,1]` 上辺 ⇔ `[0,0]BOSS` 下辺（**ボスの唯一の入口**・`D`DOOR を前室 `[0,1]` 側に置き鍵で開ける）／下辺 ⇔ `[0,2]` 上辺（探索室への下り）
  - **⚠️ 上記以外の全辺は `#`WALL で塞ぐ（裏口防止）。欠け部屋 `[4,0]`/`[0,3]` は stage を置かず隣接辺を `#` に。** 各部屋の役割：
    - 入口`[1,3]`：field `2,0` の `3,10` から入る `>`戻り出口・看板`i`（「水の流れに逆らうな」系）・既存石碑「ザーネルの記憶 其の三」を移設
    - 雑魚`[2,3]`：`E`/`C`＋`~`水路を `v`橋で渡る基礎
    - 弓矢入手`[1,2]`：宝箱 `{type:'item', item:'bow', name:'弓矢'}`（＋矢の補充 floorItem/chest 任意）
    - **弓ゲート`[1,1]`：** 2マス幅水堀で分断＋対岸に `Y`SWITCH＋左辺出口に `T`GATE＋`links:[{switchId,gateId}]`。矢で `Y` を撃ち `T` を開けて `[0,1]` へ
    - 中ボス`[1,0]`：`W`撃破で鍵`K`（`chestContents` or ドロップ）＋ハートの器チェスト（整合性チェッカー必須）
    - 鍵扉前室`[0,1]`：`D`DOOR（鍵で開く）→ 上辺がボス入口／下辺が `[0,2]`
    - ボス`[0,0]`：`isBossRoom:true`・`:`DOORWAY_BOSS・`J`深海の海蛇・`Q`欠片③
    - 盾`[2,1]`：`F`SENTRY＋遮蔽（盾の出番・剣でも可）
    - 雑魚2+宝`[0,2]`：`E`＋小宝（前室 `[0,1]` 下の探索室）
    - 水路パズル`[3,0]`：`*`石押し→`S`→`T` で寄道宝（東側サブ網の上端）
    - 分岐ハブ`[2,2]`：4方向に開く中継（水路を `v`橋で渡す導線）
    - 水路渡り橋`[3,3]`：`v`BRIDGE 主体の渡り部屋（東側探索の入口）
    - 宝`[3,2]`地図`m`・`[3,1]`コンパス`n`（整合性チェッカー必須）
    - 寄道`[2,0][4,1][4,2][4,3]`：ルピー/回復薬（任意・袋小路・詰みなし）
- [x] **接続グラフの機械検証スクリプトを通す**（`node scripts/check-dungeon-connectivity.mjs dungeon_3` → **PASS**／dead edge 0／orphan 0（実部屋18・欠け `[4,0]`/`[0,3]` は "stage 無し" 扱い）。`--block-room=1,1` で **boss 到達不能を確認（✅ gate holds）**）
- [x] **整合性チェッカーを通す**（`node scripts/check-dungeon-integrity.mjs dungeon_3` → **エラー0・警告6**（全て水`~`の寄道警告＝出口非封鎖で意図どおり）。`bossStage:"0,0"`/`triforceId:3`/`name:"水の迷宮"`／ボス部屋に `J`＋ハート器／地図`m`（`[3,2]`）・コンパス`n`（`[3,1]`）存在）。**⚠️ 整合性チェッカーを1点修正：** room-flood が `T`/`D`/`(`/`)` を「永久壁」扱いしていたため、水堀＋ゲートで出口を作る弓ゲート `[1,1]` を誤って MUST エラーにしていた。connectivity.mjs の SOLVABLE_GATES と思想を揃え、これらを「開けられるゲート＝通行可」に変更（`Y`だけは撃つスイッチで非通行のまま）。D1/D2 は回帰なし
- [x] **dungeon_3 の layer メタを整備：** layer 直下に `bossStage:"0,0"` / `triforceId:3` / `name:"水の迷宮"` / `bgm:"dungeon"` / `bossBgm:"boss"` を設定。旧 `1,0` の `isBossRoom:true` ボス部屋を `0,0` へ再配置
- [x] **必須化の検算（最重要）：** 弓無しでは `Y` に届かず `T` が開かない。**⚠️ 設計を変更（2マス水堀→水島）：** 当初 PLAN の「2マス幅水堀」案は実装したが、**水堀の対岸が歩ける床だと迂回して `Y` を剣で叩けてしまう**バグを発見。→ **`Y(1,10)` を上下左右が水/壁の "水島" に隔離**し、`col10` の通路(row6)から上へ矢を撃つ縦レーン（距離5＞ブーメラン maxRange3）でのみ届く設計に変更。実ブラウザ＋`tests/bow-gate.spec.js`（3本）で「弓で開く／剣・歩行では不可／ブーメランは届かない」を検証
- [x] **(A) ソフトロック検算：** D3 内で後ダンジョン報酬（ロウソク/はしご/爆弾/笛）を要求していない。内部水路は `v`BRIDGE で渡る（はしご前提の渡りは臨界経路に無し）
- [x] **アイテム移設（9-2a 表）を反映：** D3 `[1,2]` に弓矢宝箱（`{type:'item',item:'bow'}`＋floorItems count15）を配置。field 側・他レイヤーの旧弓配置の撤去は 9-3 で整理
- [x] **動作確認：** `fromEditor=1` プレビューで 弓ゲート `[1,1]`（水島＋Y＋T）とボス部屋 `[0,0]`（`J`＋ボスロック＋ハート器）を実ブラウザ描画確認（pageerror なし）。`tests/test-new-dungeons.spec.js` のエントリ遷移（`1,3`→`1,2`）も更新・グリーン

#### 9-2e. dungeon_4「炎の神殿」設計確定＋流し込み完了（D4＝ロウソク報酬・3番目の進行ダンジョン）　✅ 完了（2026-06-25・⚡ Sonnet・20部屋）
> **役割：** アイテム連鎖の3段目。報酬＝**ロウソク＋欠片④**。**規模＝20部屋**（**漸増カーブ準拠：D3=18 → D4=20**。5列×4行=20 グリッド・欠け部屋なし＝フル）。テーマ＝炎の神殿（床は石畳 `o`／`H`かがり火を要所に配置・水`~`/壊せる壁`!`は使わない＝後ダンジョン報酬を要求しないため）。ボス＝`A`炎のサラマンドラ（HP35・弱点 **arrow** ×2＝D3 で得た弓矢で◎・通常剣でも可）。
>
> **🎮 古典ゼルダ型(B)の背骨：** 入口→雑魚→**ロウソクを中盤の宝箱で入手** →**ロウソクが無いと突破できない部屋**（下記）→ ボス`A`（arrow 弱点・剣でも可）→ 欠片④。
>   - **🔑 必須化＝「かがり火を全点灯（`torchesLit`）→ 隠し `>` テレポートが出現」（実コード精査で唯一の "ロウソク専用かつ通行を開く" 配線）：**
>     - **検証した事実（重要）：** ロウソクが**他の手段で代替されない**通行ギミックは「`bushBurned`/`torchesLit` → `showConditions` で隠し `>`MAP_ENTER を出現」だけ。剣は茂みを切れるが `bushBurned` を立てない（`combat.js:310`）／ブーメランの炎運搬は**点いた篝火がある時だけ**点火（`projectile.js:333`）＝**事前点灯ゼロなら torchesLit はロウソク専用**／矢・ビームは篝火を点けない。`torchesLit`/`bushBurned` は `openGates` ではなく `showConditions` の出現だけを駆動し、MAP_ENTER 遷移は `conditionsMet` を見る（`game.js:1017`）＝**篝火を全点灯するまで隠し `>` は描画も遷移もしない**。フィールドの `bushBurned`→`>` と同じ実績ある仕組み。
>     - **必須化部屋 `[1,1]`（かがり火の間）：** 消灯 `H`TORCH を3つ置く（`initLitTorches` は空＝事前点灯ゼロ）。**ロウソクで全点灯すると `torchesLit` 成立** → 同室の隠し `>`（`showConditions:{trigger:"torchesLit"}` で gate）が出現・通行可になり、**ボス翼へワープ**する。`[1,1]` からボス翼へは**この隠しテレポートが唯一の経路**（grid 隣接の壁を全部 `#` で塞ぐ）＝ロウソク必須が接続でも二重保証。
>     - **⚠️ ブーメランによる迂回を断つ：** 篝火を点ける唯一の起点はロウソク（事前点灯ゼロ）。ブーメランは "点いた篝火" からしか炎を拾えないので、最初の1本も含め全点灯にはロウソクが要る。剣・矢は篝火に無効。＝**ロウソク以外では `[1,1]` を開けられない。**
>
> **🎓 副主題＝「弓矢の実践」**（D3 で得た弓を `F`SENTRY の遠隔兵に当てて間合いを作る／ボス`A`の弱点 arrow で活かす）＋木の盾でのガード。
>
> **難易度カーブ：** 雑魚`E`/`C` → 仕掛け（石押し`*→S→T`）→ 遠隔兵`F`（盾＋弓の出番）→ **ロウソク入手** → かがり火全点灯の関門 → 中ボス`W`（鍵`K`ドロップ）→ `D`扉 → ボス`A`。
>
> **🔑鉄則の検算：** D4 は「**剣・木の盾・弓矢・鍵・ロウソク（D4 内で入手）**」だけでクリアできること。**後ダンジョンの報酬（はしご/爆弾/笛）を一切要求しない**＝(A) を厳守（`~`水・`x`穴・`!`壊せる壁を臨界経路に置かない）。ロウソク入手前の区間はロウソク不要で進めること。

- [x] **20部屋レイアウト＋接続グラフを確定**（5列×4行=20・欠けなし・辺スクロール接続・`check-dungeon-connectivity.mjs` で論理検証する）。**stage 座標は `sx,sy`（sx=列／sy=行）。** 役割と接続は下記マップのとおり（D3=9-2d と同粒度・列を1本増やして漸増規模に）：

  ```
  配置（5列×4行。左上が sx,sy 小）：
    sy\sx   0(西)              1                 2               3                4(東)
    0(北)  [0,0]BOSS A        [1,0]中ボスW+鍵K   [2,0]寄道宝     [3,0]寄道(袋小路)  [4,0]寄道(袋小路)
    1      [0,1]雑魚枝         [1,1]ロウソク関門   [2,1]盾F部屋    [3,1]コンパス宝    [4,1]寄道回復(袋小路)
    2      [0,2]宝(枝の先)     [1,2]ロウソク入手   [2,2]分岐ハブ    [3,2]地図宝       [4,2]寄道ルピー(袋小路)
    3      [0,3]寄道(袋小路)   [1,3]ENTRY        [2,3]雑魚1       [3,3]炎の小謎     [4,3]寄道(袋小路)

  ⚠️ ボス翼 = {[1,0]中ボス+鍵, [0,0]BOSS} は "テレポート専用の島"。
     [1,0] の grid 隣接（[2,0]右・[1,1]下）は全て #WALL。[0,0] の [0,1]下も #WALL。
     [1,1]→[1,0] は隠し `>`テレポートのみ。[1,0]→[0,0] は `D`扉（鍵）。

  臨界経路（一本道・要検証）：
    [1,3]ENTRY →(上)[1,2]ロウソク入手 →(上)[1,1]かがり火の間（全点灯→隠し`>`出現）
      →(テレポート)[1,0]中ボスW撃破→鍵K →(左・D扉を鍵で開ける)[0,0]BOSS A →欠片④
    ※ [1,1] を塞ぐとテレポートが消え [1,0]/[0,0] へ到達不能＝ロウソク必須が接続でも二重保証
      （`--block-room=1,1` でボス到達不能を確認＝D3 と同型）。
    ※ ボス[0,0]の隣接は[1,0]のみ（D扉経由）＝裏口なし。
  ```
  - **臨界経路の確定（ロウソク→かがり火全点灯→テレポート→中ボス→鍵→扉→ボスの順序を強制）：**
    1. `[1,3]ENTRY` → `[1,2]` で**ロウソク入手**（剣だけで到達可）
    2. `[1,2]` → `[1,1]` かがり火の間で**3つの `H` を全点灯**（ロウソク専用）→ 隠し `>` 出現
    3. 隠し `>` で**ボス翼 `[1,0]` へワープ** → 中ボス`W`撃破→鍵`K`（`showConditions:killAll` で出現＝D3 と同手法）
    4. `[1,0]` 左辺の `D`扉を鍵で開け `[0,0]BOSS` へ。ボス翼から戻る用に `[1,0]` の `>` は双方向（`id:"d4_bosswing"`/`destId:"d4_gatehall"`）にして詰み防止
    - **⚠️ ロウソク入手の "先取り" を地形で保証：** `[1,1]` の walk 隣接は `[1,2]`（下＝spine入口）と `[0,1]`（左＝枝）だけ（右`[2,1]`・上`[1,0]` は壁）。`[0,1]`/`[0,2]` は `[1,1]` からのみ入れる枝＝`[1,1]` への walk 経路は**必ず `[1,2]`（ロウソク部屋）を通る**。よってロウソクは関門前に確実に手に入る（D3 より強い保証）。
    - **東側1列（sx=4）は寄道・宝のサブ網**＝臨界経路に絡めない（漸増分の +2 室をここに吸収＝難所を増やさず探索ボリュームを足す）。
  - **辺の開口座標（縦=同col5,6／横=同row4,5・厳守。D3 と同規約）。全21辺＋テレポート1組：**
    - `[1,3]ENTRY` 上辺(row0,col5/6) ⇔ `[1,2]` 下辺(row9,col5/6)／右辺(col11,row4/5) ⇔ `[2,3]` 左辺(col0,row4/5)／左辺(col0,row4/5) ⇔ `[0,3]` 右辺(col11,row4/5)
    - `[1,2]` 上辺 ⇔ `[1,1]` 下辺(col5,6)／右辺 ⇔ `[2,2]` 左辺(row4,5)　※ **`[1,2]` 左辺(→[0,2])は `#`WALL**（枝を [1,1] 経由に限定）
    - `[2,3]` 上辺 ⇔ `[2,2]` 下辺(col5,6)／右辺 ⇔ `[3,3]` 左辺(row4,5)
    - `[2,2]` 上辺 ⇔ `[2,1]` 下辺(col5,6)／右辺 ⇔ `[3,2]` 左辺(row4,5)
    - `[2,1]` 上辺 ⇔ `[2,0]` 下辺(col5,6)／右辺 ⇔ `[3,1]` 左辺(row4,5)　※ **`[2,1]` 左辺(→[1,1])は `#`WALL**（[1,2] を迂回する関門裏口を作らない＝最重要）
    - `[3,3]` 上辺 ⇔ `[3,2]` 下辺(col5,6)／右辺 ⇔ `[4,3]` 左辺(row4,5)
    - `[3,2]` 上辺 ⇔ `[3,1]` 下辺(col5,6)／右辺 ⇔ `[4,2]` 左辺(row4,5)
    - `[3,1]` 上辺 ⇔ `[3,0]` 下辺(col5,6)／右辺 ⇔ `[4,1]` 左辺(row4,5)
    - `[3,0]` 右辺 ⇔ `[4,0]` 左辺(row4,5)
    - `[1,1]` 左辺(col0,row4/5) ⇔ `[0,1]` 右辺(col11,row4/5)　※ **`[1,1]` 上辺(→[1,0])・右辺(→[2,1])は `#`WALL＝テレポート以外で翼に入れない**
    - `[0,1]` 下辺 ⇔ `[0,2]` 上辺(col5,6)
    - `[1,0]` 左辺(col0,row4/5) ⇔ `[0,0]BOSS` 右辺(col11,row4/5)　＝ **`D`DOOR を `[1,0]` 左辺直前に置き鍵で開ける（ボスへの唯一の通路）**。`[0,0]` 下辺の `:`DOORWAY_BOSS は不要（左から入るため省略可・置く場合は `[1,0]` 側に `:`）
    - **テレポート：** `[1,1]` の隠し `>`（`{id:"d4_gatehall", destId:"d4_bosswing"}`・`showConditions:{trigger:"torchesLit"}` で gate）⇄ `[1,0]` の `>`（`{id:"d4_bosswing", destId:"d4_gatehall"}`・常時可＝戻り用）
  - **⚠️ 上記以外の全辺は `#`WALL で塞ぐ（裏口防止）。特に ボス翼 `[1,0]`/`[0,0]` の翼外への辺（`[1,0]`右=[2,0]・`[1,0]`下=[1,1]・`[0,0]`下=[0,1]）は全て壁。** 各部屋の役割：
    - 入口`[1,3]`：field `0,1` の `8,5` から入る `>`戻り出口（`{id:"dungeon_4", destId:"field_dungeon4"}` を **`0,0` の `7,2` から `[1,3]` へ移設**）・看板`i`・**既存石碑「ザーネルの記憶 其の四」を `0,0`（旧ボス部屋）から `[1,3]` 入口へ移設**（Phase 6-2 の断片を保全）
    - ロウソク入手`[1,2]`：宝箱 `{type:"item", item:"candle", name:"ロウソク"}`（＝field `2,0` の `2,6` から移設＝9-2a 表）。看板「炎を絶やすな」系
    - **かがり火の間`[1,1]`：** 消灯 `H`TORCH ×3（`initLitTorches` 無し）＋隠し `>`（`showConditions:torchesLit`）。看板「全ての火を灯せば道は開ける」
    - 中ボス`[1,0]`：`W`MONSTER 撃破→鍵`K`（`showConditions:{trigger:"killAll"}` で `K` 出現＝D3 流儀）＋戻り用 `>`
    - ボス`[0,0]`：`isBossRoom:true`・`A`炎のサラマンドラ・**ハートの器チェスト**（整合性チェッカー必須）・`Q`欠片④はボス撃破ドロップ（`dropsTriforce:true`・タイル直置きしない）
    - 盾＋弓`[2,1]`：`F`SENTRY＋遮蔽柱（盾でガード／弓で遠隔・剣でも可）
    - 雑魚`[2,3]`：`E`/`C`（炎の神殿の導入戦）／炎の小謎`[3,3]`：`*`石押し→`S`→`T` で寄道宝
    - 雑魚枝`[0,1]`＋宝`[0,2]`：`E`＋小宝（`[1,1]` からのみ入れる枝＝任意探索）
    - 宝`[3,2]`地図`m`・`[3,1]`コンパス`n`（整合性チェッカー必須）／寄道宝`[2,0]`
    - 寄道`[3,0][4,0][4,1][4,2][4,3][0,3]`：ルピー`r`/回復薬`7`（任意・袋小路・詰みなし）
- [x] **接続グラフの機械検証スクリプトを通す**（`node scripts/check-dungeon-connectivity.mjs dungeon_4` → PASS（dead edge 0／orphan 0／全20室到達）。`--block-room=1,1` で **boss 到達不能（gate holds）** を確認）
- [x] **整合性チェッカーを通す**（`node scripts/check-dungeon-integrity.mjs dungeon_4` → エラー0。`bossStage:"0,0"`/`triforceId:4`/`name:"炎の神殿"`／ボス部屋に `A`＋ハート器／地図`m`（`[3,2]`）・コンパス`n`（`[3,1]`）。`A` は `TRIFORCE_BOSS_TILES` に既登録・`UNLOCKED_AT.dungeon_4={boomerang,bow,candle}` も既存＝チェッカー変更不要）
- [x] **dungeon_4 の layer メタを整備：** layer 直下に `bossStage:"0,0"` / `triforceId:4` / `name:"炎の神殿"` / `bgm:"dungeon"` / `bossBgm:"boss"` を設定。旧 `1,0` の `isBossRoom:true` ボス部屋を `0,0` へ再配置
- [x] **必須化の検算（最重要・D3 の教訓を適用）：** `tests/candle-gate.spec.js`（3本）で「ロウソクで全点灯→conditionsMet[4,9]成立／剣・矢では不可」を実エンジンで固定（全174テストグリーン・2026-06-25）
- [x] **(A) ソフトロック検算：** D4 内で後ダンジョン報酬（はしご/爆弾/笛）を要求していない（`~`水・`x`穴・`!`壊せる壁を臨界経路に置かない）
- [x] **アイテム移設（9-2a 表）を反映：** D4 `[1,2]` にロウソク宝箱を配置（field `2,0` の旧ロウソク宝箱の撤去は 9-3 で整理）
- [ ] **動作確認：** `fromEditor=1` プレビューで かがり火の間 `[1,1]`（点灯→テレポート）→ ボス翼 `[1,0]`（中ボス→鍵）→ `[0,0]`（`A`＋ボスロック＋ハート器）→ 欠片④ → field 帰還

#### 9-2f. dungeon_5「氷の廃墟」流し込み完了（D5＝はしご報酬・終盤1番目／⚠️ 進行順は D4→D6→**D5**→D8→D7）　✅（2026-06-27・20部屋・チェッカー PASS・melee-only-boss テスト7本・全187テストグリーン）
> **役割：** アイテム連鎖の終盤1段目（**入場に爆弾＝D6 報酬が要る**）。報酬＝**はしご＋欠片⑥＋鉄の盾**。**規模＝20部屋**（漸増カーブ：D4=20 → D5=20。5列×4行=20・欠けなし＝フル。D6=22 へ続く）。テーマ＝氷の廃墟（床は石畳 `o`／**凍った湖＝水 `~`・割れた氷＝穴 `x`** を地形の主役にする）。ボス＝`L`氷のリヴァイアサン（2×2・HP40・弱点 **fire**×3＝ロウソク＝D4報酬の炎で氷を溶かす・剣でも可）。
>
> **🎮 古典ゼルダ型(B)の背骨：** 入口→**爆弾で `!` 壁を割って奥へ**→雑魚→**はしごを中盤の宝箱で入手** →**はしごが無いと突破できない水/穴の堀**（下記）→ ボス`L`（fire 弱点・剣でも可）→ 欠片⑥。
>
> **🔑 はしご必須化＝「2つの保証」で作る（実コード精査が決め手・D4 と本質的に違う点に注意）：**
>   1. **〈地形の関門〉1セル幅の水/穴の堀を渡らせる（`passable.js:87-93`）。** はしごは「進入軸の両隣が陸＝1セル幅の水/穴」を1セルだけ渡れる（2連続は不可・`isLadderBridge`）。**必須化部屋 `[1,1]`（氷の堀）に横一文字の水堀 `~`（row3・col1〜10）を張り、上の出口（→`[1,0]`）へはこの堀を縦に渡る以外に道がない**ようにする。**⚠️ D3/D4 と違い接続チェッカーは水/穴を `HARD_BLOCKED`（壁）扱いなので、はしご渡りを臨界経路に置くとデフォルトでは "ボス到達不能" と誤検出する**＝下記の通り**接続チェッカーに "はしご渡り" を教える拡張が必須**（ユーザー指示・9-2f の第2タスク）。
>   2. **〈ボスの関門〉ボス`L` を「近接（剣/炎）でしか倒せない・遠隔は反射」にする（ユーザー指示）。** D5 入場時点でプレイヤーは弓/ブーメラン/剣ビーム/爆弾を全所持＝**水堀の対岸からボスを撃てるなら "はしご必須" にならない**。そこで**ボス`L` に `meleeOnly`＋`reflectsProjectiles` を付与**し、矢/ビーム/ブーメランは**そのままプレイヤーへ打ち返す**（既存の上位盾 reflect 機構 `projectile.js:269-284` を流用）／爆弾は無効（`dealDamageToEnemy` で遮断＝爆弾は `checkProjHit` を通らず `projectile.js:547` 直行のため両方に処理が要る）。**剣・ロウソクの炎は近接でダメージが通る**（`game.js:1194`／`combat.js:307`＝どちらも投擲物を経由しない近接判定）。→ **遠隔が効かない＝はしごで渡って隣接し、剣/炎で殴るしかない**。弱点 fire×3 とも噛み合う（ロウソクが最適解）。
>
> **🎓 副主題＝「氷上の渡り」**（はしごで凍湖を渡る経路選択）＋**鉄の盾の入手**（reflect 0.5＝ボス`L` の氷礫 `stone` 攻撃を跳ね返せる＝終盤の防御強化）。ボス弱点 fire は D4 報酬ロウソクの活用。
>
> **難易度カーブ：** 雑魚`E`/`C`（氷の導入戦）→ 爆弾で `!` 壁 → 仕掛け（氷の小謎 `*`→`S`→`T`）→ 遠隔兵`F`（盾＋弓）→ **はしご入手** → 氷の堀をはしごで渡る関門 → 中ボス`W`（鍵`K`）→ `D`扉 → ボス`L`（近接限定＝はしごで渡って殴る）。
>
> **🔑鉄則の検算：** D5 は「**剣・木の盾／鉄の盾・弓矢・ロウソク・爆弾・鍵・はしご（D5 内で入手）**」だけでクリアできること。**後ダンジョンの報酬（笛）を一切要求しない**＝(A) を厳守。はしご入手前の区間ははしご不要で進めること（`~`水・`x`穴を関門 `[1,1]` 以前の臨界経路に置かない）。**入場の爆弾＝D6 報酬は "前のダンジョン" なので (A) に反しない**（連鎖順 D4→D6→D5）。

- [x] **20部屋レイアウト＋接続グラフを確定**（5列×4行=20・欠けなし・辺スクロール接続・`check-dungeon-connectivity.mjs` で論理検証）。**stage 座標は `sx,sy`（sx=列／sy=行）。** D4=9-2e と同粒度：

  ```
  配置（5列×4行。左上が sx,sy 小）：
    sy\sx   0(西)              1                  2               3                4(東)
    0(北)  [0,0]BOSS L        [1,0]中ボスW+鍵K    [2,0]寄道宝     [3,0]寄道(袋小路)  [4,0]寄道(袋小路)
    1      [0,1]鉄の盾室       [1,1]氷の堀(はしご)  [2,1]雑魚/盾F    [3,1]コンパス宝    [4,1]寄道回復(袋小路)
    2      [0,2]枝宝(袋小路)    [1,2]はしご入手     [2,2]分岐ハブ    [3,2]地図宝       [4,2]寄道ルピー(袋小路)
    3      [0,3]寄道(袋小路)    [1,3]ENTRY(爆弾壁)  [2,3]雑魚1(氷)   [3,3]氷の小謎     [4,3]寄道(袋小路)

  ⚠️ ボス翼 = {[1,0]中ボス+鍵, [0,0]BOSS} は "氷の堀 [1,1] を渡らないと入れない島"。
     [1,0] の grid 隣接（[2,0]右）は #WALL。[0,0] の [0,1]下も #WALL。
     [1,1]→[1,0] は「[1,1] 内の水堀をはしごで縦断 → 上辺」が唯一の経路。
     [1,0]→[0,0] は `D`扉（中ボスW撃破の鍵K）。

  臨界経路（一本道・要検証）：
    [1,3]ENTRY →(爆弾で ! 壁を割る・上)[1,2]はしご入手 →(上)[1,1]氷の堀（はしごで水堀を縦断）
      →(上)[1,0]中ボスW撃破→鍵K →(左・D扉)[0,0]BOSS L →欠片⑥
    ※ [1,1] の水堀（はしご無し）で上半分（→[1,0]）に行けない＝はしご必須が接続でも保証
      （`--with-ladder` 無しで [1,0]/[0,0] 到達不能／`--block-room=1,1` でも到達不能）。
    ※ ボス[0,0]の隣接は[1,0]のみ（D扉経由）＝裏口なし。さらにボスが近接限定＝対岸からの遠隔不可。
  ```
  - **臨界経路の確定（爆弾→はしご入手→氷の堀渡り→中ボス→鍵→扉→近接ボスの順序を強制）：**
    1. `[1,3]ENTRY` → **`!`BREAKABLE_WALL を爆弾で割る**（爆弾＝D6報酬・所持済み）→ `[1,2]` で**はしご入手**（剣だけで到達可）
    2. `[1,2]` → `[1,1]` 氷の堀：**横一文字の水堀 `~`（row3・col1〜10）をはしごで縦断**（はしご専用＝上半分へ唯一の道）
    3. 堀を渡って `[1,1]` 上辺 → `[1,0]` で**中ボス`W`撃破→鍵`K`**（`showConditions:{trigger:"killAll"}` で `K` 出現＝D3/D4 流儀）
    4. `[1,0]` 左辺の `D`扉を鍵で開け `[0,0]BOSS L` へ。ボス`L` は**近接限定＝はしごで渡った先で剣/ロウソク炎で殴る**（遠隔は反射）
    - **⚠️ はしご入手の "先取り" を地形で保証：** `[1,1]` への walk 経路は必ず `[1,2]`（はしご部屋）を通る（`[1,1]` の下辺＝`[1,2]`、左辺＝`[0,1]`枝・右辺/上辺以外は壁）。`[0,1]`鉄の盾室は水堀の**手前（near側）**に接続＝はしご無しで入れる任意ボーナス。
    - **東側2列（sx=3,4）＋ハブ `[2,2]` は寄道・宝のサブ網**＝臨界経路に絡めない（漸増分をここに吸収）。
  - **辺の開口座標（縦=同col5,6／横=同row4,5・厳守。D4 と同規約）。開ける辺は以下だけ・他は全て `#`WALL：**
    - `[1,3]ENTRY` 上辺 ⇔ `[1,2]` 下辺　※ **`[1,3]` の上辺直前に `!`BREAKABLE_WALL を置く＝爆弾必須の入場ゲート**／右辺 ⇔ `[2,3]` 左辺／左辺 ⇔ `[0,3]` 右辺
    - `[1,2]` 上辺 ⇔ `[1,1]` 下辺／右辺 ⇔ `[2,2]` 左辺　※ **`[1,2]` 左辺(→[0,2])は `#`WALL**
    - `[1,1]` 上辺 ⇔ `[1,0]` 下辺　※ **`[1,1]` 内の水堀 `~`(row3) が上下を分断＝はしごで縦断しないと上辺に届かない**／左辺(→[0,1]) ⇔ `[0,1]` 右辺（堀の手前side）　※ **`[1,1]` 右辺(→[2,1])は `#`WALL**（堀の迂回路を作らない＝最重要）
    - `[0,1]` 下辺 ⇔ `[0,2]` 上辺
    - `[1,0]` 左辺 ⇔ `[0,0]BOSS` 右辺　＝ **`D`DOOR を `[1,0]` 左辺直前に置き鍵で開ける（ボスへの唯一の通路）**　※ **`[1,0]` 右辺(→[2,0])は `#`WALL／`[0,0]` 下辺(→[0,1])も `#`WALL＝ボス翼は堀の先の島**
    - `[2,3]` 上辺 ⇔ `[2,2]` 下辺／右辺 ⇔ `[3,3]` 左辺
    - `[2,2]` 上辺 ⇔ `[2,1]` 下辺／右辺 ⇔ `[3,2]` 左辺
    - `[2,1]` 上辺 ⇔ `[2,0]` 下辺／右辺 ⇔ `[3,1]` 左辺
    - `[3,3]` 上辺 ⇔ `[3,2]` 下辺／右辺 ⇔ `[4,3]` 左辺
    - `[3,2]` 上辺 ⇔ `[3,1]` 下辺／右辺 ⇔ `[4,2]` 左辺
    - `[3,1]` 上辺 ⇔ `[3,0]` 下辺／右辺 ⇔ `[4,1]` 左辺
    - `[3,0]` 右辺 ⇔ `[4,0]` 左辺
  - **各部屋の役割：**
    - 入口`[1,3]`：field `2,1` の `8,5` から入る `>`戻り出口（`{id:"dungeon_5", destId:"field_dungeon5"}` を旧 `0,0` の `7,2` から `[1,3]` へ移設）・看板`i`・**石碑「ザーネルの記憶 其の五」を入口へ**（lore-tablets.spec.js が旧 `0,0` 座標を参照していないか流し込み時に確認＝D4 と同じ）。上辺手前に `!`BREAKABLE_WALL（爆弾入場ゲート）
    - はしご入手`[1,2]`：宝箱 `{type:"item", item:"ladder", name:"はしご"}`（＝`dungeon_3/0,0 chestContents["8,1"]` から移設＝9-2a 表）。看板「氷の上は、橋を架けて渡れ」系
    - **氷の堀`[1,1]`：** 横一文字の水堀 `~`（row3・col1〜10）。上下の岸（row2・row4）は床＝**縦の1セル橋**が各列に成立（はしごで渡れる）。看板「凍れる湖に橋を架けよ」
    - 鉄の盾室`[0,1]`：宝箱 `{type:"item", item:"shield", shieldTier:1}`（鉄の盾・reflect0.5）。堀の手前side＝任意ボーナス（`L` の氷礫を跳ね返せる＝ボス戦が楽になる）
    - 中ボス`[1,0]`：`W`MONSTER 撃破→鍵`K`（`showConditions:{trigger:"killAll"}` で `K` 出現）＋戻り用 `>`（任意・ボス翼から堀手前へ戻れるように）
    - **ボス`[0,0]`：** `isBossRoom:true`・`L`氷のリヴァイアサン（2×2）・**ハートの器チェスト**（整合性チェッカー必須）・`Q`欠片⑥はボス撃破ドロップ（`dropsTriforce:true`・タイル直置きしない）。氷柱 `#` を数本置いた開けた氷の闘技場（ボスは徘徊）。**`L` の `meleeOnly`＋`reflectsProjectiles` で「遠隔は反射→近接で殴る」を体感させる**
    - 盾＋弓`[2,1]`：`F`SENTRY＋遮蔽柱（盾でガード／弓で遠隔・剣でも可）／雑魚`[2,3]`：`E`/`C`（氷の導入戦）／氷の小謎`[3,3]`：`*`石押し→`S`→`T` で寄道宝
    - 枝宝`[0,2]`：小宝（`[0,1]` の先の袋小路）／寄道宝`[2,0]`
    - 宝`[3,2]`地図`m`・`[3,1]`コンパス`n`（整合性チェッカー必須）
    - 寄道`[3,0][4,0][4,1][4,2][4,3][0,3]`：ルピー`r`/回復薬`7`（任意・袋小路・詰みなし）
- [x] **接続チェッカーに "はしご渡り" を教える拡張**（ユーザー指示・D5 必須化の前提）：`scripts/lib/connectivity.mjs` に `passable.js` の `isLadderBridge` 相当（1セル幅の水/穴＝進入軸の両隣が陸なら渡れる）を移植する。
  - **デフォルト挙動（はしご前）：** `bfsLayer` の純歩行到達は水/穴を従来どおり通さない（＝はしご無しで [1,0]/[0,0] が unreached＝関門成立を示せる）。
  - **`--with-ladder` フラグ：** `bfsLayer` が**1セル橋の水/穴を通行可**として扱う＝はしご所持後の全到達を検証（D5 はこれで PASS させる）。
  - **デッドエッジ／孤立の判定は常にはしご考慮：** 1セル橋の水/穴を「解ける通路（SOLVABLE 相当）」とみなし、**デッドエッジに誤計上しない・孤立部屋扱いにしない**（はしごはダンジョン内で必ず手に入る＝鍵/ゲートと同格）。多セル幅の水/穴は橋にならず従来どおり壁。
  - **検証プロトコル：** `check-dungeon-connectivity.mjs dungeon_5 --with-ladder` → **PASS**（orphan 0・dead edge 0・boss 到達可）。`dungeon_5`（フラグ無し）→ **[1,0]/[0,0] が unreached＝はしご関門が成立**。`--block-room=1,1` → boss 到達不能（二重保証）。
  - **回帰：** D1〜D4・field の既存チェックに影響しないこと（水/穴を臨界経路で使っていない既存ダンジョンは挙動不変）。`connectivity-tool.spec.js` に「1セル橋ははしごで渡れる／2連続水は渡れない」を追加。
- [x] **ボス`L`「近接限定・遠隔反射」ギミックの実装**（ユーザー指示）：
  - `shared/enemies.js` の `ICE_LEVIATHAN` に `meleeOnly:true`＋`reflectsProjectiles:true` を追加（弱点 fire×3 は据え置き＝ロウソク炎＝近接なので有効）。
  - `game/combat.js` `dealDamageToEnemy`：`meta.meleeOnly` なら `atkType ∈ {sword, fire}` 以外（arrow/beam/boomerang/**bomb**）はダメージ0＝「効かない！」ポップ（爆弾は `checkProjHit` を通らず直接ここへ来るのでこのガードが本丸）。
  - `game/projectile.js` `checkProjHit`：player 投擲物が `reflectsProjectiles` の敵に当たったら、ダメージを与えず**そのまま反射**（`owner→enemy`・dx/dy 反転・既存の盾 reflect コード `:269-284` と同形）。視覚的に「跳ね返る」＝遠隔が効かないと分かる。貫通ビームも反射で打ち消す。
  - **テスト方針：** `tests/melee-only-boss.spec.js`（新設）で「矢/ビーム/ブーメラン/爆弾はボス`L` に効かない（HP 不変）＋反射される／剣・ロウソク炎は通る（HP 減少・fire は×3）」を実エンジンで固定。フィクスチャ `test_mechanics` に近接限定ボス1体の小部屋を追加（ライブマップ非参照＝既存方針）。
- [x] **接続グラフの機械検証**（`check-dungeon-connectivity.mjs dungeon_5 --with-ladder` → PASS／フラグ無しで boss unreached／`--block-room=1,1` で boss 到達不能）
- [x] **整合性チェッカーを通す**（`check-dungeon-integrity.mjs dungeon_5` → エラー0）。**⚠️ チェッカーの `UNLOCKED_AT` を連鎖順に修正（D5 必須・潜在バグ）：** 現状 `dungeon_5=[…,'ladder']`（bomb 無し）・`dungeon_6=[…,'ladder','bomb']` は**数字順**で、実際の進行順（D4→D6→D5）と食い違う。→ **`dungeon_5` に `'bomb'` を追加**（D6 で入手済み＝D5 の `!` 壁/入場ゲートが誤エラーにならない）／**`dungeon_6` から `'ladder'` を除去**（D6 時点で未所持＝D6 が水/穴で詰む設計を将来弾けるように）。D5 はこの修正後にエラー0。
- [x] **dungeon_5 の layer メタを整備：** `bossStage:"0,0"` / `triforceId:6` / `name:"氷の廃墟"` / `bgm:"dungeon"` / `bossBgm:"boss"`。旧 `1,0` の `isBossRoom:true` を `0,0` へ再配置
- [ ] **必須化の検算（最重要）：** はしご無しでは `[1,1]` 水堀を渡れず [1,0]/[0,0] 到達不能（接続チェッカー）。さらにボス`L` は近接限定＝対岸から倒せない（`melee-only-boss.spec.js`）。`fromEditor=1` で「はしごで堀を渡る→中ボス→鍵→D扉→ボスを剣/炎で撃破／遠隔は反射」を実プレイ確認
- [x] **(A) ソフトロック検算：** D5 内で後ダンジョン報酬（笛）を要求しない。入場の爆弾は前ダンジョン D6 の報酬＝(A) OK。はしご入手前に `~`/`x` を臨界経路へ置かない
- [x] **アイテム移設（9-2a 表）を反映：** D5 `[1,2]` にはしご宝箱を配置（`dungeon_3/0,0 chestContents["8,1"]` の旧はしご宝箱を撤去＝D3 は弓ダンジョンなのではしごを置かない＝ソフトロック防止）。鉄の盾を `[0,1]` に配置

#### 9-2g. dungeon_6「森の聖域」流し込み完了（D6＝爆弾報酬・中盤最終／⚠️ 進行順は D4→**D6**→D5→D8→D7）　✅（2026-06-27・22部屋・チェッカー PASS・全187テストグリーン）
> **役割：** アイテム連鎖の中盤最終段（**入場に D4 報酬のロウソクが要る**＝D5「氷」のはしご報酬へ橋渡し）。報酬＝**爆弾＋欠片⑤**。**規模＝22部屋**（漸増カーブ：D5=20 → **D6=22** → D7=22。5列×5行=25 から袋小路3室を欠いて22）。テーマ＝森の聖域（床は草地 `,`/`.`／**かがり火 `H`・茂み `u`・木 `t`** を地形の主役にする）。ボス＝`O`古森の巨人（2×2・**HP42 / atk5 / def2**・`dropsTriforce:true`・`hitAndAway`・弱点 **fire**×2＝ロウソク＝D4報酬の炎で◎・剣でも可）。**`shared/enemies.js:274-297` に定義済み・`TRIFORCE_BOSS_TILES` に `'O'` 登録済み＝新規ボスコード不要。**
>
> **🎮 古典ゼルダ型(B)の背骨：** 入口→雑魚（森の導入戦）→**ロウソクが無いと突破できないかがり火の関門**（下記＝D4 と同型）→ 中盤で**爆弾を宝箱で入手** →**爆弾でしか割れない `!`壁**でボス翼へ →中ボス`W`→鍵`K`→`D`扉→ ボス`O`（fire 弱点＝ロウソク炎で◎・剣でも可）→ 欠片⑤。
>
> **🔑 ロウソク必須化＝D4 と同じ「`torchesLit`→隠し `>`テレポート」方式（ユーザー確定＝堅牢方式・2026-06-27）：** 入場ゲートは **`[1,1]`「聖樹のかがり火の間」に消灯 `H`×3（`initLitTorches` 空＝事前点灯ゼロ）を置き、ロウソクで全点灯（`torchesLit`）→ `showConditions` で隠し `>`MAP_ENTER 出現 → ボス翼の手前 `[1,0]` へワープ**する。**なぜ茂み `u`(bushBurned) ではなく `H`(torchesLit) を選んだか：** 茂みは**剣でも切れて通行可化する**（`combat.js:315` が `cutBushes` に追加＝`bushBurned` は立たないが**先に剣で切ると `cutBushes` 済みでロウソクが "もう燃え尽きている" を返し `bushBurned` が永久に立たない**＝ロウソク必須化が剣で破れるソフトロックの芽／しかも整合性チェッカーは検出できない）。対して **かがり火 `H` は剣で触れられず（`passable.js` で常に passable:false・`combat.js` は `H` を処理しない）＝点灯はロウソク（or 既灯火からのブーメラン運炎だが事前点灯ゼロなので不可）だけ**＝完全にロウソク専用関門。D4 で実証済み・接続/整合性チェッカーともに無改修で PASS。
>
> **🔑 ボス翼ロック＝爆弾 `!`壁（D6 自身の報酬で開ける＝古典ゼルダ型(B)）：** ロウソクのテレポート先 `[1,0]`（中ボス`W`の間）からボス `[0,0]` へは、**`[1,0]` 内で爆弾入手 `[1,2]`→`[1,0]` 動線の途中に置いた `!`BREAKABLE_WALL を割って進む**…のではなく、**爆弾は `[1,2]` で入手し、`[1,1]` かがり火の関門の "前段" に `!`壁を置いて「爆弾→ロウソク」の順序を強制**する（下記臨界経路参照）。接続チェッカーは `!` を **SOLVABLE_GATE（爆弾で開く）として認識済み**（`connectivity.mjs:68`）＝D5 の `!`入場ゲートと同じく無改修で PASS。**⚠️ D6 の `!` は "D6 自身の報酬＝爆弾" で開く**ので、整合性チェッカー `UNLOCKED_AT.dungeon_6=['boomerang','bow','candle','bomb']`（bomb 含む・ladder 無し＝9-2f で修正済み）と整合＝誤エラーにならない。
>
> **🎓 副主題＝「炎で照らす森」**（ロウソク＝D4報酬の再活用＝かがり火点灯でボス翼を開き、ボス`O`の弱点 fire でもう一度活きる＝2重のおもちゃ活用）＋**爆弾の入手と "壊せる壁" の導入**（D5 のはしご地形・D8 の隠し通路へ続く「広い鍵」の入口）。
>
> **難易度カーブ：** 雑魚`E`/`C`（森の導入戦）→ 仕掛け（森の小謎 `*`→`S`→`T`）→ **爆弾入手**`[1,2]` → 爆弾で `!`壁 → **ロウソクでかがり火全点灯の関門**`[1,1]`（→隠し `>`テレポート）→ 遠隔兵`F`（盾＋弓）→ 中ボス`W`（鍵`K`）→ `D`扉 → ボス`O`（hitAndAway・fire 弱点）。
>
> **🔑鉄則の検算：** D6 は「**剣・木の盾・ブーメラン・弓矢・ロウソク・鍵・爆弾（D6 内で入手）**」だけでクリアできること。**後ダンジョンの報酬（はしご/笛）を一切要求しない**＝(A) を厳守（`~`水・`x`穴を臨界経路に置かない＝はしごD5前を要求しない／隠し通路は `flutePlayed` でなく `torchesLit` で出す＝笛D8前を要求しない）。爆弾入手前の区間は爆弾不要で進めること（`!`壁を `[1,2]` 以前の臨界経路に置かない）。**入場のロウソク＝D4 報酬は "前のダンジョン" なので (A) に反しない**（連鎖順 D4→D6）。

- [ ] **22部屋レイアウト＋接続グラフを確定**（5列×5行=25 から袋小路3室を欠いて22・辺スクロール接続・`check-dungeon-connectivity.mjs` で論理検証）。**stage 座標は `sx,sy`（sx=列／sy=行）。** D4/D5 と同粒度：

  ```
  配置（5列×5行=25 から [4,0]/[4,3]/[0,4] の3室を欠いて22。左上が sx,sy 小）：
    sy\sx   0(西)              1                    2               3                4(東)
    0(北)  [0,0]BOSS O        [1,0]中ボスW+鍵K      [2,0]寄道宝     [3,0]森の小謎     （欠：壁）
    1      [0,1]枝宝(袋小路)   [1,1]かがり火関門H×3   [2,1]雑魚/盾F    [3,1]コンパス宝    [4,1]寄道回復(袋小路)
    2      [0,2]枝宝(袋小路)   [1,2]爆弾入手+!壁     [2,2]分岐ハブ    [3,2]地図宝       [4,2]寄道ルピー(袋小路)
    3      [0,3]寄道(袋小路)   [1,3]ENTRY           [2,3]雑魚1(森)   [3,3]森の小謎     （欠：壁）
    4      （欠：壁）          [1,4]寄道宝(袋小路)   [2,4]寄道宝     [3,4]寄道(袋小路)  [4,4]寄道(袋小路)

  ⚠️ ボス翼 = {[1,0]中ボスW+鍵, [0,0]BOSS} は "かがり火関門 [1,1] からの隠し >テレポートでしか入れない島"
     （D4 と同型＝テレポート専用島）。
     [1,0] の grid 隣接（[2,0]右・[1,1]下）は #WALL。[0,0] の [0,1]下も #WALL。
     [1,1]→[1,0] は「[1,1] でかがり火 H×3 全点灯 → 隠し >MAP_ENTER 出現 → [1,0] へワープ」が唯一の経路。
     [1,0]→[0,0] は `D`扉（中ボスW撃破の鍵K）。

  臨界経路（一本道・要検証）：
    [1,3]ENTRY →(上)[1,2]爆弾入手 →(! 壁を爆弾で割る・上)[1,1]かがり火関門
      →(ロウソクで H×3 全点灯 → 隠し >テレポート)[1,0]中ボスW撃破→鍵K
      →(左・D扉)[0,0]BOSS O →欠片⑤
    ※ [1,2]→[1,1] の境界(上辺)直前に `!`BREAKABLE_WALL を置く＝爆弾必須（接続チェッカーは ! を SOLVABLE_GATE と認識）。
    ※ [1,1] のかがり火を点けない限り隠し >テレポートは出ない＝ロウソク必須（D4 と同じ・--block-room=1,1 でボス到達不能）。
    ※ ボス[0,0]の隣接は[1,0]のみ（D扉経由）＝裏口なし。テレポート島なので grid 迂回も不可。
  ```
  - **臨界経路の確定（爆弾入手→爆弾で!壁→ロウソクでかがり火→テレポート→中ボス→鍵→扉→ボスの順序を強制）：**
    1. `[1,3]ENTRY` → `[1,2]` で**爆弾入手**（宝箱 `{type:"item", item:"bomb"}`・剣だけで到達可）
    2. `[1,2]` → `[1,1]` 境界の `!`BREAKABLE_WALL を**爆弾で割る**（爆弾＝D6 自身の報酬・直前で入手）
    3. `[1,1]` かがり火の間で**ロウソクで `H`×3 を全点灯（`torchesLit`）→ 隠し `>`MAP_ENTER 出現**（`showConditions:{trigger:"torchesLit"}`）→ `[1,0]` へワープ（D4 と同じ配線）
    4. `[1,0]` で**中ボス`W`撃破→鍵`K`**（`showConditions:{trigger:"killAll"}` で `K` 出現＝D3/D4/D5 流儀）→ 左辺 `D`扉を鍵で開け `[0,0]BOSS O` へ。ボス`O`は **fire 弱点（ロウソク炎で×2）・剣でも可・hitAndAway**
    - **⚠️ 「爆弾→ロウソク」順序を地形で保証：** `[1,1]` への walk 経路は必ず `[1,2]`（爆弾部屋）を通り、その境界の `!`壁で爆弾を要求＝爆弾を持たずにかがり火関門へは入れない。`[1,2]` の左辺(→[0,2])・右辺(→[2,2]) は枝/ハブへ任意で開くが、`[1,1]` への唯一の動線は `[1,2]` 上辺の `!`壁。
    - **東側2列（sx=3,4）＋下段(sy=4)＋ハブ `[2,2]` は寄道・宝のサブ網**＝臨界経路に絡めない（漸増分の +2室＝D5比をここに吸収）。
  - **辺の開口座標（縦=同col5,6／横=同row4,5・厳守。D4/D5 と同規約）。開ける辺は以下だけ・他は全て `#`WALL：**
    - `[1,3]ENTRY` 上辺 ⇔ `[1,2]` 下辺／右辺 ⇔ `[2,3]` 左辺／左辺 ⇔ `[0,3]` 右辺
    - `[1,2]` 上辺 ⇔ `[1,1]` 下辺　※ **`[1,2]` 上辺直前に `!`BREAKABLE_WALL を置く＝爆弾必須ゲート**／左辺 ⇔ `[0,2]` 右辺／右辺 ⇔ `[2,2]` 左辺／下辺 ⇔ `[1,3]` 上辺（＝上記 ENTRY 接続）
    - `[1,1]` かがり火関門：grid 隣接は **`[1,2]`（下辺・上記）と `[2,1]`（右辺）と `[0,1]`（左辺）のみ開く**。**上辺(→[1,0]) は `#`WALL**（テレポート島なので grid では繋がない）。隠し `>`MAP_ENTER（`showConditions:torchesLit`・destId→`[1,0]` 着地）を室内に1枚
    - `[1,0]` 中ボス：**grid 隣接は全て `#`WALL**（右[2,0]・下[1,1]・上は盤外）＝テレポート着地 `>`（field/内部 id で `[1,1]` の隠し `>` の destId 先）＋左辺 `D`DOOR のみ。左辺 `D` ⇔ `[0,0]BOSS` 右辺（鍵で開ける唯一の通路）。任意で戻り用 `>`（ボス翼→関門手前）
    - `[0,0]BOSS` ：右辺 ⇔ `[1,0]` 左辺（`D`扉）のみ。**下辺(→[0,1])は `#`WALL＝ボス翼はテレポート島**
    - `[0,1]` 下辺 ⇔ `[0,2]` 上辺（枝宝チェーン・袋小路）
    - `[2,3]` 上辺 ⇔ `[2,2]` 下辺／右辺 ⇔ `[3,3]` 左辺／下辺 ⇔ `[2,4]` 上辺
    - `[2,2]` ハブ 上辺 ⇔ `[2,1]` 下辺／右辺 ⇔ `[3,2]` 左辺
    - `[2,1]` 上辺 ⇔ `[2,0]` 下辺／右辺 ⇔ `[3,1]` 左辺
    - `[3,3]` 上辺 ⇔ `[3,2]` 下辺／右辺 ⇔ `[4,3]`…は欠室＝壁／下辺 ⇔ `[3,4]` 上辺
    - `[3,2]` 上辺 ⇔ `[3,1]` 下辺／右辺 ⇔ `[4,2]` 左辺
    - `[3,1]` 上辺 ⇔ `[3,0]` 下辺／右辺 ⇔ `[4,1]` 左辺
    - `[3,0]` 森の小謎：下辺 ⇔ `[3,1]` 上辺のみ（右[4,0]は欠室＝壁・上は盤外）
    - `[4,1]` 左辺 ⇔ `[3,1]` 右辺／下辺 ⇔ `[4,2]` 上辺
    - `[4,2]` 左辺 ⇔ `[3,2]` 右辺／上辺 ⇔ `[4,1]` 下辺
    - `[2,4]` 上辺 ⇔ `[2,3]` 下辺／右辺 ⇔ `[3,4]` 左辺／左辺 ⇔ `[1,4]` 右辺
    - `[1,4]` 右辺 ⇔ `[2,4]` 左辺のみ（袋小路）／`[3,4]` 左辺 ⇔ `[2,4]` 右辺・上辺 ⇔ `[3,3]` 下辺
    - `[4,4]` 上辺 ⇔ `[4,3]`…欠室＝実質 `[3,4]` 経由では繋がらない→ **`[4,4]` は欠室扱いにするか、`[3,4]` 右辺 ⇔ `[4,4]` 左辺で接続**（流し込み時に22室の確定接続を1つに決める＝下記「欠室の確定」）
    - **⚠️ 欠室の確定（22室）：** 25 から **`[4,0]`・`[0,4]`・`[4,4]`** の3室を欠く（いずれも隅の袋小路＝臨界経路非関与）。欠室の周囲辺は全て `#`WALL。残り22室が辺スクロール網で連結（孤立0）になるよう、寄道サブ網（sx=3,4／sy=4）の開口を上記どおり張る。**流し込み後 `check-dungeon-connectivity.mjs dungeon_6` で orphan 0・dead edge 0 を確認**。
  - **各部屋の役割：**
    - 入口`[1,3]`：field `1,2` の `4,2` から入る `>`戻り出口（`{id:"dungeon_6", destId:"field_dungeon6"}` を旧 `0,0` の `7,2` から `[1,3]` へ移設）・看板`i`・**石碑「ザーネルの記憶 ―其の六―」は lore-tablets.spec.js が `dungeon_6 / 0,0 / [1,5]` を参照する**＝⚠️ **石碑だけはボス部屋 `[0,0]` の `[1,5]` に残す**（テストのハードコードを壊さない／D4/D5 と同じく流し込み時に確認・必要ならテスト座標を入口へ更新するか石碑をボス部屋に置く＝後者が安全）
    - 爆弾入手`[1,2]`：宝箱 `{type:"item", item:"bomb"}`（＝`field/1,1 floorItems["4,6"]`(count3) と `field/2,0 shopData["6,7"]` の爆弾を撤去して移設＝9-2a 表 #2）。看板「壁を打ち砕く力を、森が授ける」系。上辺 `!`壁で次室をロック
    - **かがり火関門`[1,1]`：** 消灯 `H`×3（`initLitTorches` 空＝事前点灯ゼロ）。ロウソクで全点灯→隠し `>`MAP_ENTER（`showConditions:{trigger:"torchesLit"}`）出現→ `[1,0]` へワープ。看板「聖樹の火を、すべて灯せ」系
    - 中ボス`[1,0]`：`W`MONSTER 撃破→鍵`K`（`showConditions:{trigger:"killAll"}` で `K` 出現）＋テレポート着地`>`＋左辺 `D`扉。任意で戻り用 `>`
    - **ボス`[0,0]`：** `isBossRoom:true`・`O`古森の巨人（2×2）・**ハートの器チェスト**（整合性チェッカー必須）・**石碑「其の六」`[1,5]`**（上記・テスト準拠）・欠片⑤はボス撃破ドロップ（`dropsTriforce:true`・タイル直置きしない）。大木 `t` を数本置いた森の闘技場（ボスは hitAndAway で接近離脱）。**ロウソク炎で fire×2＝弱点を突ける／剣でも可**
    - 盾＋弓`[2,1]`：`F`SENTRY＋遮蔽柱（盾でガード／弓で遠隔・剣でも可）／雑魚`[2,3]`：`E`/`C`（森の導入戦）／森の小謎`[3,0][3,3]`：`*`石押し→`S`→`T` で寄道宝
    - 分岐ハブ`[2,2]`：寄道サブ網の結節点（東2列・下段へ）／枝宝`[0,1][0,2]`：小宝（`[1,1]` の左の袋小路チェーン）
    - 宝`[3,2]`地図`m`・`[3,1]`コンパス`n`（整合性チェッカー必須）／寄道宝`[2,0][1,4][2,4]`
    - 寄道`[0,3][3,4][4,1][4,2]`：ルピー`r`/回復薬`7`（任意・袋小路・詰みなし）
- [x] **新規ゲームコードは不要であることを確認（D5 との最大の違い）：** D6 の関門は **D4 で実装済みの `torchesLit`→隠し `>`テレポート** と **D5 で使った `!`BREAKABLE_WALL（爆弾）** の組合せ＝新サブシステム不要。
- [x] **接続グラフの機械検証**（`check-dungeon-connectivity.mjs dungeon_6` → PASS：orphan 0・dead edge 0・全22室到達／`--block-room=1,1` で boss `[0,0]` 到達不能＝かがり火関門が成立）
- [x] **整合性チェッカーを通す**（`check-dungeon-integrity.mjs dungeon_6` → ❌0 / ⚠️0）
- [x] **dungeon_6 の layer メタを整備：** `bossStage:"0,0"` / `triforceId:5` / `name:"森の聖域"` / `bgm:"dungeon"` / `bossBgm:"boss"`
- [x] **テスト整備：** heart-containers.spec.js `dungeon_6` ボス部屋 `1,0`→`0,0` 修正。lore-tablets は `0,0 / [1,5]` に石碑配置済み（変更不要）。全187テストグリーン。
- [x] **必須化の検算：** `check-dungeon-connectivity --block-room=1,1` → boss 到達不能 ✅
- [x] **(A) ソフトロック検算：** D6 内に `~`/`x` なし・`flutePlayed` 不使用・爆弾入手前に `!`壁なし ✅
- [x] **アイテム移設（9-2a 表 #2）：** `field/1,1 floorItems["4,6"]` 爆弾撤去・`tile[4][6]='.'`・`field/2,0 shopData["6,7"]` から bomb 撤去 ✅

#### 9-2h. dungeon_8「沼地の神殿」流し込み完了（D8＝笛報酬・終盤2番目・レイヤー新設／⚠️ 進行順は D4→D6→D5→**D8**→D7）　✅（2026-06-27・23部屋・チェッカー PASS・全187テストグリーン）
> **役割：** アイテム連鎖の終盤段（**入場に D5 報酬のはしごが要る**＝D7「空」の笛ワープ入場へ橋渡し）。報酬＝**笛＋欠片⑦＋ミラーシールド**。**規模＝24部屋**（漸増カーブ：D6=22 → **D8=24** → ※カーブ表では D7=22 だが D8=24＝沼地が連鎖の最深ダンジョン。5列×5行=25 から袋小路1室 `[4,0]` を欠いて24）。テーマ＝沼地の神殿（床は沼地 `,`/`.`／**毒沼 `~`水・足場 `x`穴・茂み `u`・木 `t`** を地形の主役にする）。ボス＝`I`沼地の大蝦蟇（2×2・**HP40 / atk5 / def2**・`dropsTriforce:true`・`hitAndAway`・弱点 **fire**×2＝ロウソク＝D4報酬の炎で◎・剣でも可）。**`shared/enemies.js:355-375` に定義済み・`TRIFORCE_BOSS_TILES`/`ALL_BOSS_TILES` に `'I'` 登録済み（`check-dungeon-integrity.mjs:28,30`）・スプライト codegen 済み（`sprites-enemies.js:1116-1257`）＝新規ボスコード不要。**
>
> **⚠️⚠️ レイヤー新設＋欠片の整合是正がこのダンジョン固有の最重要事項（実データ精査 2026-06-27）：** `dungeon_8` はマップに**存在しない**（layers に無い）＝**ゼロから新設**する。現状 `cave_1` は 9-2c の revert で**小洞窟に戻っており、沼地ボス`I` はマップ上のどこにも置かれていない**（`I` の placement 0件）。現在の欠片総数 `countTriforces()`（`shared/triforce.js:16-31`）＝**ボス`dropsTriforce`×7（G/N/J/A/L/O/U）＋直置き `Q` タイル×2（`field/2,0 [6,10]`・`cave_1/1,0 [8,10]`）＝計9**で、8欠片前提とズレている。→ **D8 流し込みで「ボス`I` を `dungeon_8/0,0` に配置（→ボス8体）＋ `Q` タイル2枚を撤去（→直置き0）」を同時にやって `countTriforces()=8` ちょうどに是正する**（PLAN 9-1 の「Q整理」をここで実施）。
>
> **🎮 古典ゼルダ型(B)の背骨：** はしご入場（`~`毒沼の堀を渡る＝D5 と同型）→雑魚（沼地の導入戦）→中盤で**笛を宝箱で入手** →**笛でしか出せない隠し `>`/隠し通路**でボス翼へ（`flutePlayed`）→中ボス`W`→鍵`K`→`D`扉→ ボス`I`（fire 弱点＝ロウソク炎で◎・剣でも可）→ 欠片⑦。
>
> **🔑 入場ロック＝はしごで毒沼の堀を渡る（D5 と同じ "1セル橋" 方式・はしご＝D5報酬で前ダンジョン＝(A) OK）：** 入口 `[1,3]` の手前 or 直後に**横一文字の毒沼 `~`(1セル幅の堀)** を張り、**はしごで縦の1セル橋を渡る以外に奥へ道がない**ようにする（`passable.js:87-93` の `isLadderBridge`＝進入軸の両隣が陸の1セル水/穴を1セルだけ渡れる・2連続不可）。**⚠️ D5 で接続チェッカーに移植済みの `--with-ladder` 拡張をそのまま使う**（`connectivity.mjs` は `~`/`x` を `HARD_BLOCKED` 扱いだが `--with-ladder` で1セル橋を通行可と判定）＝**新規拡張は不要**（D5 の遺産を再利用）。
>
> **🔑 笛必須化＝`flutePlayed`reveal で隠し `>`MAP_ENTER/隠し通路を出す（既存実装・`conditions.js:96`／`game.js:1147-1170`／`render-board.js:139,251,329` で配線済み）：** 中盤 `[1,2]` で笛を宝箱入手 → `[1,1]`「沼の祭壇の間」で**笛を吹く（`fluteEffect:{type:'reveal'}`→`ss.flutePlayed=true`）→ `showConditions:{trigger:'flutePlayed'}` で隠し `>`MAP_ENTER 出現 → ボス翼手前 `[1,0]` へワープ**（D4/D6 の `torchesLit`テレポートと完全に同型・トリガーだけ `flutePlayed` に差し替え）。**なぜ笛で "隠し入口を出す reveal" を選び "warp" 型にしないか：** D8 入場（field→`dungeon_8`）の warp と D8 内部の関門 warp を混同しないため、内部関門は D4/D6 と同じ「reveal で隠し `>` を出す→その `>` の destId で `[1,0]` 着地」方式に統一する（テレポート専用島の作り方が D4/D6 と同一＝検証パターン流用）。
>
> **🔑 笛が「隠し入口を出す」ことの堅牢性（実コード精査・D6 の教訓を適用）：** 笛は**剣で代替できない**（`H`かがり火・茂み `u` と違い、`flutePlayed` フラグは笛を吹く以外に立たない＝`game.js:1162` の reveal 経路のみ）＝**笛専用関門として完全に堅牢**。茂み `u`(bushBurned) を避けた D6 の判断（剣で先に切るとソフトロック）と同じ理由で、隠し通路は `flutePlayed` で出す（`bushBurned`/`cutBushes` は使わない）。
>
> **🎓 副主題＝「見えざる道を音で開く」**（笛＝reveal で隠し入口を出す＝"最も広い鍵=ワープ/隠し入口" の導入。D7「空」の笛ワープ入場へ直結）＋**はしご＝D5報酬の再活用**（毒沼の堀渡り＝"広い鍵=地形" をもう一度使う＝2重のおもちゃ活用）。ボス`I` の弱点 fire はロウソク＝D4報酬でもう一度活きる。
>
> **難易度カーブ：** はしごで毒沼の堀を渡る入場 → 雑魚`E`/`C`（沼地の導入戦）→ 仕掛け（沼の小謎 `*`→`S`→`T`）→ **笛入手**`[1,2]` → 笛で隠し `>` を出す関門`[1,1]`（→隠しテレポート）→ 遠隔兵`F`（盾＋弓）→ 中ボス`W`（鍵`K`）→ `D`扉 → ボス`I`（hitAndAway・毒沫投げ・fire 弱点）。
>
> **🔑鉄則の検算：** D8 は「**剣・木の盾／鉄の盾／ミラーシールド・ブーメラン・弓矢・ロウソク・爆弾・はしご・鍵・笛（D8 内で入手）**」だけでクリアできること。**後ダンジョンの報酬は存在しない**（D7 は新アイテムを配らない＝D8 が連鎖の最後の道具配布）＝(A) を自動的に満たす。笛入手前の区間は笛不要で進めること（隠し `>` を `[1,2]` 以前の臨界経路に置かない）。**入場のはしご＝D5 報酬は "前のダンジョン" なので (A) に反しない**（連鎖順 D4→D6→D5→D8）。

- [x] **23部屋レイアウト＋接続グラフを確定**（5列×5行=25 から `[4,0]`・`[0,4]` の2室を欠いて23・辺スクロール接続・`check-dungeon-connectivity.mjs dungeon_8 --with-ladder` → PASS・orphan 0・dead edge 0・全23室到達・`--block-room=1,1` でボス到達不能 ✅ 2026-06-27）。**stage 座標は `sx,sy`（sx=列／sy=行）。** D5/D6 と同粒度：

  ```
  配置（5列×5行=25 から [4,0] の1室を欠いて24。左上が sx,sy 小）：
    sy\sx   0(西)              1                      2               3                4(東)
    0(北)  [0,0]BOSS I        [1,0]中ボスW+鍵K        [2,0]寄道宝     [3,0]沼の小謎     （欠：壁）
    1      [0,1]枝宝(袋小路)   [1,1]沼の祭壇(笛で隠し>) [2,1]雑魚/盾F    [3,1]コンパス宝    [4,1]寄道回復(袋小路)
    2      [0,2]枝宝(袋小路)   [1,2]笛入手             [2,2]分岐ハブ    [3,2]地図宝       [4,2]寄道ルピー(袋小路)
    3      [0,3]寄道(袋小路)   [1,3]ENTRY(毒沼堀~+はしご) [2,3]雑魚1(沼)  [3,3]沼の小謎     [4,3]寄道宝(袋小路)
    4      （欠：壁）          [1,4]寄道宝(袋小路)      [2,4]寄道宝     [3,4]寄道(袋小路)  [4,4]寄道(袋小路)

  ⚠️ ボス翼 = {[1,0]中ボスW+鍵, [0,0]BOSS I} は "沼の祭壇 [1,1] からの笛・隠し >テレポートでしか入れない島"
     （D4/D6 と同型＝テレポート専用島）。
     [1,0] の grid 隣接（[2,0]右・[1,1]下）は #WALL。[0,0] の [0,1]下も #WALL。
     [1,1]→[1,0] は「[1,1] で笛を吹く（flutePlayed）→ 隠し >MAP_ENTER 出現 → [1,0] へワープ」が唯一の経路。
     [1,0]→[0,0] は `D`扉（中ボスW撃破の鍵K）。
  ```
  - **臨界経路の確定（はしごで毒沼の堀を渡る→笛入手→笛で隠し`>`→テレポート→中ボス→鍵→扉→ボスの順序を強制）：**
    1. `[1,3]ENTRY` に横一文字の毒沼 `~`(row3・1セル幅) を張る。**はしご（D5報酬・入場時所持）で縦の1セル橋を渡る以外にこの部屋の奥（上辺→[1,2]）へ道がない**（`isLadderBridge`）
    2. 渡った先 `[1,2]` で**笛入手**（宝箱 `{type:"item", item:"flute", name:"笛"}`・剣＋はしごだけで到達可）
    3. `[1,2]` → `[1,1]` 沼の祭壇の間で**笛を吹く（`fluteEffect:{type:'reveal'}` → `ss.flutePlayed=true`）→ 隠し `>`MAP_ENTER 出現**（`showConditions:{trigger:"flutePlayed"}`）→ `[1,0]` へワープ（D4/D6 の `torchesLit` 配線をトリガーだけ `flutePlayed` に替えた同型）
    4. `[1,0]` で**中ボス`W`撃破→鍵`K`**（`showConditions:{trigger:"killAll"}` で `K` 出現＝D3/D4/D5/D6 流儀）→ 左辺 `D`扉を鍵で開け `[0,0]BOSS I` へ。ボス`I`は **fire 弱点（ロウソク炎で×2）・剣でも可・hitAndAway・毒沫投げ**
    - **⚠️ 「はしご→笛」順序を地形で保証：** `[1,1]` への walk 経路は必ず `[1,3]ENTRY`（毒沼の堀＝はしご必須）→`[1,2]`（笛入手）を通る。笛を持たずに `[1,1]` で隠し `>` は出ない（`flutePlayed` 必須）。
    - **東側2列（sx=3,4）＋下段(sy=4)＋ハブ `[2,2]` は寄道・宝のサブ網**＝臨界経路に絡めない（漸増分の +2室＝D6比をここに吸収）。
  - **辺の開口座標（縦=同col5,6／横=同row4,5・厳守。D5/D6 と同規約）。開ける辺は以下だけ・他は全て `#`WALL：**
    - `[1,3]ENTRY` 上辺 ⇔ `[1,2]` 下辺　※ **room 内 row3 に横一文字 `~`毒沼（1セル幅の堀）を張り、上辺(→[1,2])へは `~` をはしごで縦断する以外に道なし**／右辺 ⇔ `[2,3]` 左辺／左辺 ⇔ `[0,3]` 右辺。**入口の `>`戻り出口**（`{id:"dungeon_8", destId:"field_dungeon8"}`）を堀の手前側に置く
    - `[1,2]` 上辺 ⇔ `[1,1]` 下辺／左辺 ⇔ `[0,2]` 右辺／右辺 ⇔ `[2,2]` 左辺／下辺 ⇔ `[1,3]` 上辺（＝上記 ENTRY 接続）
    - `[1,1]` 沼の祭壇：grid 隣接は **`[1,2]`（下辺・上記）と `[2,1]`（右辺）と `[0,1]`（左辺）のみ開く**。**上辺(→[1,0]) は `#`WALL**（テレポート島なので grid では繋がない）。隠し `>`MAP_ENTER（`showConditions:flutePlayed`・destId→`[1,0]` 着地）を室内に1枚＋`fluteEffect:{type:'reveal'}` を stageData に設定
    - `[1,0]` 中ボス：**grid 隣接は全て `#`WALL**（右[2,0]・下[1,1]・上は盤外）＝テレポート着地 `>`（`[1,1]` の隠し `>` の destId 先）＋左辺 `D`DOOR のみ。左辺 `D` ⇔ `[0,0]BOSS` 右辺（鍵で開ける唯一の通路）。任意で戻り用 `>`
    - `[0,0]BOSS` ：右辺 ⇔ `[1,0]` 左辺（`D`扉）のみ。**下辺(→[0,1])は `#`WALL＝ボス翼はテレポート島**
    - `[0,1]` 下辺 ⇔ `[0,2]` 上辺（枝宝チェーン・袋小路）
    - `[2,3]` 上辺 ⇔ `[2,2]` 下辺／右辺 ⇔ `[3,3]` 左辺／下辺 ⇔ `[2,4]` 上辺
    - `[2,2]` ハブ 上辺 ⇔ `[2,1]` 下辺／右辺 ⇔ `[3,2]` 左辺
    - `[2,1]` 上辺 ⇔ `[2,0]` 下辺／右辺 ⇔ `[3,1]` 左辺
    - `[3,3]` 上辺 ⇔ `[3,2]` 下辺／右辺 ⇔ `[4,3]` 左辺／下辺 ⇔ `[3,4]` 上辺
    - `[3,2]` 上辺 ⇔ `[3,1]` 下辺／右辺 ⇔ `[4,2]` 左辺
    - `[3,1]` 上辺 ⇔ `[3,0]` 下辺／右辺 ⇔ `[4,1]` 左辺
    - `[3,0]` 沼の小謎：下辺 ⇔ `[3,1]` 上辺のみ（右[4,0]は欠室＝壁・上は盤外）
    - `[4,1]` 左辺 ⇔ `[3,1]` 右辺／下辺 ⇔ `[4,2]` 上辺
    - `[4,2]` 左辺 ⇔ `[3,2]` 右辺／上辺 ⇔ `[4,1]` 下辺／下辺 ⇔ `[4,3]` 上辺
    - `[4,3]` 上辺 ⇔ `[4,2]` 下辺／左辺 ⇔ `[3,3]` 右辺／下辺 ⇔ `[4,4]` 上辺
    - `[2,4]` 上辺 ⇔ `[2,3]` 下辺／右辺 ⇔ `[3,4]` 左辺／左辺 ⇔ `[1,4]` 右辺
    - `[1,4]` 右辺 ⇔ `[2,4]` 左辺のみ（袋小路）／`[3,4]` 左辺 ⇔ `[2,4]` 右辺・上辺 ⇔ `[3,3]` 下辺・下辺 ⇔ `[4,4]` 上辺
    - `[4,4]` 上辺 ⇔ `[4,3]` 下辺・左辺 ⇔ `[3,4]`… のどちらか1辺で寄道サブ網に接続（流し込み時に1つに確定＝孤立0を保証）
    - **⚠️ 欠室の確定（24室）：** 25 から **`[4,0]`** の1室だけを欠く（隅の袋小路＝臨界経路非関与）。欠室の周囲辺は全て `#`WALL。残り24室が辺スクロール網で連結（孤立0）になるよう、寄道サブ網（sx=3,4／sy=4）の開口を上記どおり張る。**流し込み後 `check-dungeon-connectivity.mjs dungeon_8 --with-ladder` で orphan 0・dead edge 0・全24室到達を確認**。
  - **各部屋の役割：**
    - 入口`[1,3]`：field の新フィールド画面（後述）から入る `>`戻り出口（`{id:"dungeon_8", destId:"field_dungeon8"}`）・看板`i`・**毒沼の堀 `~`(row3・はしごで縦断)**。看板「沼に橋を架けて渡れ」系
    - 笛入手`[1,2]`：宝箱 `{type:"item", item:"flute", name:"笛"}`（＝`field/2,0 chestContents["4,3"]` の笛宝箱を撤去して移設＝9-2a 表 #6）。看板「見えざる道は、音が開く」系
    - **沼の祭壇`[1,1]`：** `fluteEffect:{type:'reveal', message:"🎵 祭壇に音が響き、隠し通路が現れた！"}` を stageData に設定。笛を吹く→隠し `>`MAP_ENTER（`showConditions:{trigger:"flutePlayed"}`）出現→ `[1,0]` へワープ。看板「沼の祭壇で、笛を奏でよ」系
    - 中ボス`[1,0]`：`W`MONSTER 撃破→鍵`K`（`showConditions:{trigger:"killAll"}` で `K` 出現）＋テレポート着地`>`＋左辺 `D`扉。任意で戻り用 `>`
    - **ボス`[0,0]`：** `isBossRoom:true`・`I`沼地の大蝦蟇（2×2・`shared/enemies.js:355-375`）・**ハートの器チェスト**（整合性チェッカー必須）・**石碑「ザーネルの記憶 ―其の八―」`[1,5]`**（後述・lore-tablets テスト拡張に合わせる）・**ミラーシールド宝箱**（`{type:"item", item:"shield", tier:2}` 相当＝報酬「ミラーシールド」）・欠片⑦はボス撃破ドロップ（`dropsTriforce:true`・タイル直置きしない）。大木 `t`／毒沼 `~` を配した沼の闘技場（ボスは hitAndAway・毒沫投げ）。**ロウソク炎で fire×2＝弱点を突ける／剣でも可**
    - 盾＋弓`[2,1]`：`F`SENTRY＋遮蔽柱（盾でガード／弓で遠隔・剣でも可）／雑魚`[2,3]`：`E`/`C`（沼地の導入戦）／沼の小謎`[3,0][3,3]`：`*`石押し→`S`→`T` で寄道宝
    - 分岐ハブ`[2,2]`：寄道サブ網の結節点（東2列・下段へ）／枝宝`[0,1][0,2]`：小宝（`[1,1]` の左の袋小路チェーン）
    - 宝`[3,2]`地図`m`・`[3,1]`コンパス`n`（整合性チェッカー必須）／寄道宝`[2,0][1,4][2,4][4,3]`
    - 寄道`[0,3][3,4][4,1][4,2][4,4]`：ルピー`r`/回復薬`7`（任意・袋小路・詰みなし）
- [x] **新規ゲームコードは不要であることを確認（D6 と同じ性質）：** ✅ 確認済み
- [x] **レイヤー新設＋欠片是正（D8 固有・最重要）：** ✅（2026-06-27）`dungeon_8` 新設（bossStage:"0,0"/triforceId:7/name:"沼地の神殿"）・ボス`I` を `[0,0]` に配置（dropsTriforce ボス8体）・`Q`タイル2枚撤去（field/2,0・cave_1/1,0）・`UNLOCKED_AT.dungeon_8` 追加。
- [x] **接続グラフの機械検証** ✅ PASS（orphan 0・dead edge 0・全23室到達・`--block-room=1,1` でボス到達不能）
- [x] **整合性チェッカーを通す** ✅ ❌0 / ⚠️0
- [x] **フィールド入口の新設：** `field/3,1 [2,4]` に `>`MAP_ENTER（`{id:"field_dungeon8", destId:"dungeon_8"}`）を配置 ✅
- [x] **テスト整備：** `heart-containers.spec.js` に `dungeon_8/0,0` 追加・`lore-tablets.spec.js` に D8「其の八」追加（9石碑・ユーザー確認済み）・`swamp-boss.spec.js` ④ を「dungeon_8/0,0 のみ配置」に更新 ✅ 全187テストグリーン
- [x] **必須化の検算：** ✅ `--block-room=1,1` → boss 到達不能
- [x] **(A) ソフトロック検算：** ✅
- [x] **アイテム移設（9-2a 表 #6）＋欠片是正：** ✅ `field/2,0 chestContents["4,3"]` 笛宝箱撤去・D8 `[1,2]` に移設・`Q`タイル2枚撤去済み

#### 9-2i. dungeon_7「空中の遺跡」設計確定（D7＝連鎖の最終ダンジョン・笛ワープ入場・新アイテムなし＝既得6道具の総合ステージ／⚠️ 進行順は D4→D6→D5→D8→**D7**→祭壇）　🧠 設計確定（2026-06-27）／⚡ データ流し込み
> **役割：** アイテム連鎖の**最終段**（**入場に D8 報酬の笛が要る＝笛ワープでしか入れない空島**）。祭壇（全8欠片→翼の羽衣）の直前。報酬＝**欠片⑧のみ（新アイテムは配らない）**。**規模＝22部屋**（漸増カーブ：D8=24 → **D7=22**＝D6 と同じ＝連鎖の最後だが沼地 D8 が最深なので D7 は据え置き気味。5列×5行=25 から袋小路3室 `[4,0]`/`[0,4]`/`[4,4]` を欠いて22＝D6 と同じ欠き方）。テーマ＝空中の遺跡（床は石畳 `o`／**雲の切れ間＝水 `~`・崩れた足場＝穴 `x`** を地形に使い `v`BRIDGE/はしごで渡る。**⚠️ SKY `%` は使わない**＝徒歩通行不可で翼の羽衣（祭壇＝D7 クリア後に入手）が無いと絶対渡れず詰む・実コード `passable.js:134` で確認済み）。ボス＝`U`嵐の鷲王（2×2・**HP36/atk6/def1**・`dropsTriforce:true`・`hitAndAway`・弱点 **arrow**×2＝D3 で得た弓矢で◎・剣でも可・雷撃弾 range7 高速）。**`shared/enemies.js:301-321` に定義済み・スプライト `stormEagle` 完成・`TRIFORCE_BOSS_TILES`/`UNLOCKED_AT.dungeon_7` 登録済み＝新規ボスコード不要。**
>
> **🎮 古典ゼルダ型は適用外（報酬アイテムが無い）＝"既得道具の総合卒業試験"：** D7 は固有の進行アイテムを配らないので「自分の報酬を中盤で入手→必須化」のループは作れない。代わりに**これまでに得た6道具（ブーメラン/弓矢/ロウソク/爆弾/はしご/笛）を全部使う総合ステージ**にする。臨界経路の足止めは**前ダンジョンまでの報酬で解く**＝(A) ソフトロックに反しない（D7 入場時点で全道具所持済み）。背骨＝入場（笛ワープ）→雑魚（空の導入戦）→**弓ゲート `Y`→`T`**（D3 で覚えた遠隔スイッチの応用）→**爆弾 `!`壁**（D6 で覚えた破壊）→中ボス`W`→鍵`K`→`D`扉→ ボス`U`（arrow 弱点＝弓で◎・剣でも可）→ 欠片⑧。
>
> **🔑 入場ロック＝笛ワープ（`fluteEffect.type:'warp'`・実装済み・D8 までの reveal/torchesLit テレポートと別系統）：** 実コード精査（`game.js:1172-1192`）で `fluteEffect:{type:'warp', layer, stage, row, col}`（直接座標）または `{type:'warp', destId}`（exitRegistry 経由）で**別レイヤーへ笛で飛べる**ことを確認（既存 `secret_grotto` が直接座標方式で実証済み）。D7 は**フィールドの特定画面（空島を望む高台等）に `fluteEffect:{type:'warp', layer:'dungeon_7', stage:'1,3'(ENTRY), row, col}` を置き、笛を吹くと dungeon_7 の入口室へワープ**する。**徒歩・飛行では入れない**（笛ワープ専用）＝笛＝D8 報酬が無いと入場不可＝連鎖の最終ロック。**⚠️ 既存「空島 field 4,0→dark_tower（飛行）」動線とは完全に別系統**（あちらは翼の羽衣の飛行ワープ・D7 は笛ワープ）＝衝突しないことを調査で確認済み。
>   - **⚠️ 接続チェッカーの入口認識：** `findEntrances`（`connectivity.mjs:235`）は「他レイヤーの `destId` から参照される `id` を持つ部屋」を入口とする。笛ワープの着地室 `[1,3]` の `>`MAP_ENTER（`{id:"dungeon_7", destId:"field_dungeon7"}`＝戻り出口）が `field` 側の `field_dungeon7`→`destId:"dungeon_7"` から参照される＝**現状の `field/2,0 (7,9)` の入口がそのまま入口認識に効く**。笛ワープの発射元（フィールド側 `fluteEffect`）は MAP_ENTER ではないが、戻り出口の `id:"dungeon_7"` が外部から参照されるので入口判定は成立する＝**接続チェッカーの新規拡張は不要**（D8 の `--with-ladder` のような拡張もいらない＝水/穴は `v`BRIDGE で渡る設計にして純歩行 BFS で PASS させる）。
>
> **🔑 弓ゲートは D3 の "水島" 教訓を踏襲（実装の穴を最初から避ける）：** `Y`SWITCH を**上下左右が水/壁の "水島" に隔離**し、通路から縦/横レーンで矢を撃つ以外に届かないようにする（D3 9-2d で「対岸が床だと剣で叩けて関門が破れる」バグを修正した教訓）。`Y` から `T`GATE への `links:[{switchId,gateId}]` で臨界経路の出口を開ける。ブーメラン（maxRange3）では届かない距離（≥4）に `Y` を置く＝弓専用。
>
> **🎓 副主題＝「これまでの集大成」**（弓の遠隔スイッチ＝D3／爆弾の壊せる壁＝D6／ボス`U`の弱点 arrow＝弓再活用）＋**鏡の盾/ミラーシールド＝D8 報酬の実践**（ボス`U`の雷撃弾 range7 を reflect で打ち返す＝終盤の防御技の見せ場）。
>
> **難易度カーブ：** 笛ワープ入場 → 雑魚`E`/`C`（空の導入戦）→ 仕掛け（崩れ足場の `v`橋渡り＋`*`石押し→`S`→`T`）→ **弓ゲート `Y`→`T`** → 遠隔兵`F`（盾＋弓）→ **爆弾 `!`壁** → 中ボス`W`（鍵`K`）→ `D`扉 → ボス`U`（hitAndAway・雷撃弾・arrow 弱点）。
>
> **🔑鉄則の検算：** D7 は「**剣・全ティアの盾・ブーメラン・弓矢・ロウソク・爆弾・はしご・笛・鍵（D7 入場時点で全所持）**」でクリアできること。**D7 より後の報酬は存在しない**（D7 がアイテム配布の最後＝祭壇直前）＝(A) を自動的に満たす。**SKY `%` を臨界経路にも寄道にも置かない**（翼の羽衣＝祭壇後入手が無いと詰む）。

- [x] **22部屋レイアウト＋接続グラフを確定**（5列×5行=25 から袋小路3室を欠いて22・辺スクロール接続・`check-dungeon-connectivity.mjs` で論理検証）。**stage 座標は `sx,sy`（sx=列／sy=行）。** D6 と同じ欠き方・同粒度：

  ```
  配置（5列×5行=25 から [4,0]/[0,4]/[4,4] の3室を欠いて22。左上が sx,sy 小）：
    sy\sx   0(西)              1                    2               3                4(東)
    0(北)  [0,0]BOSS U        [1,0]中ボスW+鍵K      [2,0]寄道宝     [3,0]空の小謎     （欠：壁）
    1      [0,1]枝宝(袋小路)   [1,1]爆弾!壁→弓ゲート   [2,1]雑魚/盾F    [3,1]コンパス宝    [4,1]寄道回復(袋小路)
    2      [0,2]枝宝(袋小路)   [1,2]弓ゲートY→T       [2,2]分岐ハブ    [3,2]地図宝       [4,2]寄道ルピー(袋小路)
    3      [0,3]寄道(袋小路)   [1,3]ENTRY(笛ワープ着地) [2,3]雑魚1(空)  [3,3]崩れ足場(v橋) （欠：壁）
    4      （欠：壁）          [1,4]寄道宝(袋小路)      [2,4]寄道宝     [3,4]寄道(袋小路)  （欠：壁）

  ⚠️ ボス翼 = {[1,0]中ボスW+鍵, [0,0]BOSS U} は "弓ゲート [1,1] の T を開けて入る島"。
     [1,0] の grid 隣接（[2,0]右）は #WALL。[0,0] の [0,1]下も #WALL。
     [1,1]→[1,0] は「[1,1] で爆弾で ! 壁を割り → 弓で Y を撃ち T を開け → 上辺」が唯一の経路。
     [1,0]→[0,0] は `D`扉（中ボスW撃破の鍵K）。

  臨界経路（一本道・要検証）：
    [1,3]ENTRY(笛ワープ着地) →(上)[1,2]弓ゲート(Y→T)で奥へ →(上)[1,1]爆弾で ! 壁→さらに弓ゲート
      →(上)[1,0]中ボスW撃破→鍵K →(左・D扉)[0,0]BOSS U →欠片⑧
    ※ [1,2] の T（弓で開く）を閉じたままだと上半分（→[1,1]→ボス）へ行けない＝弓必須。
    ※ [1,1] の ! 壁（爆弾）＋ T（弓）で二重関門＝既得道具の総合試験。--block-room=1,2 でボス到達不能。
    ※ ボス[0,0]の隣接は[1,0]のみ（D扉経由）＝裏口なし。
  ```
  - **臨界経路の確定（笛ワープ入場→弓ゲート→爆弾!壁→弓ゲート→中ボス→鍵→扉→ボスの順序を強制）：**
    1. フィールドの発射元で**笛を吹く（`fluteEffect:warp`）→ `[1,3]ENTRY` へワープ**（笛＝D8報酬・所持済み）
    2. `[1,3]` → `[1,2]` 弓ゲート：水島の `Y`SWITCH を**矢で撃って `T`GATE を開け**上へ（弓必須・D3 と同型）
    3. `[1,2]` → `[1,1]`：境界の `!`BREAKABLE_WALL を**爆弾で割る**（爆弾＝D6報酬）→ 室内の弓ゲート（または `T`）を抜けて上へ
    4. `[1,1]` → `[1,0]` で**中ボス`W`撃破→鍵`K`**（`showConditions:{trigger:"killAll"}` で `K` 出現＝D3〜D8 流儀）→ 左辺 `D`扉を鍵で開け `[0,0]BOSS U` へ。ボス`U`は **arrow 弱点（弓で×2）・剣でも可・hitAndAway・雷撃弾 range7**
    - **⚠️ 「弓→爆弾→弓」総合試験を地形で保証：** `[1,3]ENTRY` から `[1,1]` への walk 経路は必ず `[1,2]`（弓ゲート）を通り、`[1,1]` へは `!`壁（爆弾）でロック＝弓・爆弾の両方を持たないとボス翼へ入れない（D7 入場時点で両方所持済み＝(A) OK）。
    - **東側2列（sx=3,4）＋下段(sy=4)＋ハブ `[2,2]` は寄道・宝のサブ網**＝臨界経路に絡めない（探索ボリューム）。
  - **辺の開口座標（縦=同col5,6／横=同row4,5・厳守。D6 と同規約）。開ける辺は以下だけ・他は全て `#`WALL：**
    - `[1,3]ENTRY` 上辺 ⇔ `[1,2]` 下辺／右辺 ⇔ `[2,3]` 左辺／左辺 ⇔ `[0,3]` 右辺。**笛ワープ着地点**（着地 row/col はこの部屋内の床セル）＋`>`戻り出口（`{id:"dungeon_7", destId:"field_dungeon7"}`）を1枚
    - `[1,2]` 弓ゲート：上辺 ⇔ `[1,1]` 下辺　※ **上辺出口を `T`GATE で塞ぎ、室内の水島 `Y` を矢で撃って開ける＝弓必須**／左辺 ⇔ `[0,2]` 右辺／右辺 ⇔ `[2,2]` 左辺／下辺 ⇔ `[1,3]` 上辺（＝ENTRY 接続）
    - `[1,1]` 爆弾!壁＋弓ゲート：grid 隣接は **`[1,2]`（下辺）と `[2,1]`（右辺）と `[0,1]`（左辺）のみ開く**。**上辺(→[1,0]) は爆弾 `!`壁＋`T`GATE の二重ロック**（テレポート島でなく "壁を割って通る" 島）。`!`壁は `[1,1]` 上辺直下に置く
    - `[1,0]` 中ボス：**grid 隣接は `[1,1]`（下辺＝!壁/T 経由）と `[0,0]`（左辺＝D扉）のみ。右辺(→[2,0])は `#`WALL**。左辺 `D` ⇔ `[0,0]BOSS` 右辺（鍵で開ける唯一の通路）
    - `[0,0]BOSS` ：右辺 ⇔ `[1,0]` 左辺（`D`扉）のみ。**下辺(→[0,1])は `#`WALL＝ボス翼は島**
    - `[0,1]` 下辺 ⇔ `[0,2]` 上辺（枝宝チェーン・袋小路）
    - `[2,3]` 上辺 ⇔ `[2,2]` 下辺／右辺 ⇔ `[3,3]` 左辺／下辺 ⇔ `[2,4]` 上辺
    - `[2,2]` ハブ 上辺 ⇔ `[2,1]` 下辺／右辺 ⇔ `[3,2]` 左辺
    - `[2,1]` 上辺 ⇔ `[2,0]` 下辺／右辺 ⇔ `[3,1]` 左辺
    - `[3,3]` 上辺 ⇔ `[3,2]` 下辺／下辺 ⇔ `[3,4]` 上辺　※ 右辺(→[4,3])は欠室＝壁
    - `[3,2]` 上辺 ⇔ `[3,1]` 下辺／右辺 ⇔ `[4,2]` 左辺
    - `[3,1]` 上辺 ⇔ `[3,0]` 下辺／右辺 ⇔ `[4,1]` 左辺
    - `[3,0]` 空の小謎：下辺 ⇔ `[3,1]` 上辺のみ（右[4,0]は欠室＝壁・上は盤外）
    - `[4,1]` 左辺 ⇔ `[3,1]` 右辺／下辺 ⇔ `[4,2]` 上辺
    - `[4,2]` 左辺 ⇔ `[3,2]` 右辺／上辺 ⇔ `[4,1]` 下辺
    - `[2,4]` 上辺 ⇔ `[2,3]` 下辺／左辺 ⇔ `[1,4]` 右辺　※ 右辺(→[3,4])で `[3,4]` と接続
    - `[1,4]` 右辺 ⇔ `[2,4]` 左辺のみ（袋小路）／`[3,4]` 上辺 ⇔ `[3,3]` 下辺・左辺 ⇔ `[2,4]` 右辺
    - **⚠️ 欠室の確定（22室）：** 25 から **`[4,0]`・`[0,4]`・`[4,4]`** の3室を欠く（いずれも隅の袋小路＝臨界経路非関与・D6 と同じ欠き方）。欠室の周囲辺は全て `#`WALL。残り22室が辺スクロール網で連結（孤立0）になるよう寄道サブ網の開口を上記どおり張る。**流し込み後 `check-dungeon-connectivity.mjs dungeon_7` で orphan 0・dead edge 0・全22室到達を確認**。
  - **各部屋の役割：**
    - 入口`[1,3]`：**笛ワープの着地室**（フィールド発射元の `fluteEffect:{type:'warp', layer:'dungeon_7', stage:'1,3', row, col}` の着地）・`>`戻り出口（`{id:"dungeon_7", destId:"field_dungeon7"}` を旧 `0,0` の `7,2` から `[1,3]` へ移設）・看板`i`（「笛の音だけが、雲上への道を開く」系）・**石碑「ザーネルの記憶 ―其の七―」は lore-tablets.spec.js が `dungeon_7 / 0,0 / [1,5]` を参照**＝⚠️ **石碑はボス部屋 `[0,0]` の `[1,5]` に残す**（テスト準拠・D6 と同じ判断＝新ボス部屋 `0,0` がちょうど石碑の所在と一致して好都合）
    - **弓ゲート`[1,2]`：** 水島に隔離した `Y`SWITCH＋上辺出口の `T`GATE＋`links:[{switchId,gateId}]`。矢で `Y` を撃ち `T` を開けて `[1,1]` へ（D3 9-2d の水島方式を踏襲）。看板「遠き的を射よ」系
    - **爆弾!壁＋弓ゲート`[1,1]`：** 上辺直下に `!`BREAKABLE_WALL（爆弾必須）＋`T`GATE。爆弾で壁を割って中ボス翼 `[1,0]` へ。看板「壁の向こうに、王が眠る」系
    - 中ボス`[1,0]`：`W`MONSTER 撃破→鍵`K`（`showConditions:{trigger:"killAll"}` で `K` 出現）＋左辺 `D`扉
    - **ボス`[0,0]`：** `isBossRoom:true`・`U`嵐の鷲王（2×2）・**ハートの器チェスト**（整合性チェッカー必須）・**石碑「其の七」`[1,5]`**（上記・テスト準拠）・欠片⑧はボス撃破ドロップ（`dropsTriforce:true`・タイル直置きしない）。崩れた円柱 `#` を配した雲上の闘技場（ボスは hitAndAway・雷撃弾 range7＝ミラーシールドで反射）。**弓で arrow×2＝弱点を突ける／剣でも可**
    - 盾＋弓`[2,1]`：`F`SENTRY＋遮蔽柱（盾でガード／弓で遠隔・剣でも可）／雑魚`[2,3]`：`E`/`C`（空の導入戦）／崩れ足場`[3,3]`：`~`水/`x`穴を `v`BRIDGE で渡る／空の小謎`[3,0]`：`*`石押し→`S`→`T` で寄道宝
    - 分岐ハブ`[2,2]`：寄道サブ網の結節点／枝宝`[0,1][0,2]`：小宝（`[1,1]` の左の袋小路チェーン）
    - 宝`[3,2]`地図`m`・`[3,1]`コンパス`n`（整合性チェッカー必須）／寄道宝`[2,0][1,4][2,4]`
    - 寄道`[0,3][3,4][4,1][4,2]`：ルピー`r`/回復薬`7`（任意・袋小路・詰みなし）
- [x] **新規ゲームコードは不要であることを確認（D6/D8 と同じ性質・実コード精査済み）：** 笛ワープ（`game.js:1172-1192`・`fluteEffect:warp` 実装済み）＋弓ゲート（D3 既実装 `Y`→`toggleSwitch`→`links`）＋爆弾`!`壁（D6 既実装）＝**新サブシステムゼロ**。ボス`U`（`enemies.js:301-321` 定義・`stormEagle` スプライト・`TRIFORCE_BOSS_TILES`/`UNLOCKED_AT.dungeon_7` 登録済み）＝**ボスコードも不要**。接続チェッカーも `--with-ladder` 等の拡張不要（水/穴は `v`BRIDGE で渡る＝純歩行 BFS で PASS）。→ **流し込みは純 JSON 編集＋テスト座標調整のみ＝⚡ Sonnet 向き。**
- [x] **欠片是正は不要（D8 との違い）：** ボス`U` は現状スタブ `dungeon_7/1,0 (5,2)` に既配置＝`countTriforces()` に既にカウント済み。リメイクで `0,0` へ再配置するだけ（数は不変）。D8 のような `Q`タイル撤去・新規ボス配置は D7 では不要。
- [x] **接続グラフの機械検証（流し込み後）：** ✅ `check-dungeon-connectivity.mjs dungeon_7` → PASS（orphan 0・dead edge 0・全22室到達）／`--block-room=1,2` で boss `[0,0]` 到達不能（弓ゲート関門が成立）
- [x] **整合性チェッカーを通す（流し込み後）：** ✅ `check-dungeon-integrity.mjs dungeon_7` → エラー0・警告0
- [x] **dungeon_7 の layer メタを整備（流し込み時）：** ✅ `bossStage:"0,0"` / `triforceId:8` / `name:"空中の遺跡"` / `bgm:"dungeon"` / `bossBgm:"boss"` 設定済み。ボス`U`を `0,0` に配置。
- [x] **テスト整備（流し込み時）：** ✅ `heart-containers.spec.js:73` の `1,0`→`0,0` 修正。`field-connectivity.spec.js` FOOT_DUNGEONS から dungeon_7 除外（笛ワープ専用）。lore-tablets は `dungeon_7/0,0/[1,5]` に石碑配置済みで変更不要（確認済み）。全187テストグリーン。
- [x] **笛ワープ入場の検算：** ✅ `field/2,0 (7,9)` の徒歩入口を撤去（ユーザー確認済み）。笛ワープ発射元を `field/3,0` に追加（`fluteEffect:warp→dungeon_7/1,3`）。`field/2,0` の `fluteEffect:reveal`（secret_grotto 用）はそのまま保持。
- [x] **(A) ソフトロック検算：** ✅ D7 内に SKY `%` なし・D7 は最後のダンジョン（後の報酬なし）・既得6道具のみで解ける

#### 9-2T. dark_tower「暗黒の塔」本格拡張（ラスダン・2フロアスタブ → 多層垂直登塔30室）　🧠 設計確定（2026-06-30）／⚡ データ流し込み

> **役割＝連鎖の終着・全道具の卒業試験。** 8欠片を集め北の祭壇で翼の羽衣を授かったプレイヤーが、飛行で虚空を越えて入る最終ダンジョン。**新アイテムは無し**＝既得6道具（ブーメラン/弓/ロウソク/爆弾/はしご/笛）の総合関門＋過去8ボスの手下を弔うボスラッシュ→最奥でザーネル決戦→エンディング。規模はカーブ上限25を超える**30室**（ラスダン特例・PLAN「📐 規模基準」の `28+` を満たす）。
>
> **ユーザー確定3点（2026-06-30）：** **(1) 構造＝多層・垂直登塔**（B1F入口→中層フロアを階段 `>`MAP_ENTER で上る→最上階の玉座でザーネル）／**(2) 戦闘＝ボスラッシュ＋闇の手下**（各層に `W`魔物/`V`魔将を関門配置→最上階 `Z`）／**(3) ギミック＝全道具の卒業試験**（各層で異なる既得道具を要求）。

##### 🔴 9-2T-pre. 終盤動線の再接続（最優先・現状バグ＝塔が到達不能）

> **⚠️ M1〜M4 のフィールド再採番（320画面化）で終盤動線が丸ごと欠落していた（2026-06-30・Opus 実データ精査で発覚）。** 塔拡張の前にこれを直さないと、翼の羽衣を得ても塔に入れない（＝ゲームがクリア不能）。**塔拡張タスクは「内部の作り込み」＋「この終盤動線の再接続」の2点セット。**

- [x] **【バグ①】field→塔のワープ発射元が消滅：** `dark_tower/0,1` は今も `destId:"islandToTower"` を指すが、その `id:"islandToTower"` を持つ MAP_ENTER がフィールド側に存在しない（旧 `field 4,0` 空島の `darkTower`/`islandToTower` ポータルが再採番で捨てられた）。→ **空島ステージを新フレームの `field/8,1`（地域図 `K` 空島・D7 笛ワープ発射元の隣）か `field/7,0` 付近に新設**し、旧 `add-dark-tower.mjs` の空島レイアウト（cols1-3=到着足場／cols4-7=虚空 `SKY %`／cols8-10=塔ポータル）を復元する。発射元 `field/X,Y` に `mapEnters{ "r,c": {id:'darkTower', destId:'fieldToTower'} }`（hasWingRobe ゲートが効く＝`destId==='darkTower'`）と、空島内に `{id:'islandToTower', destId:'towerEntrance'}`（塔 B1F `0,1` の `towerEntrance` が受ける）を置く。
  - ⚠️ **ゲート判定の要：** `game.js:1055` は `enter.destId === DARK_TOWER_EXIT_ID('darkTower')` の MAP_ENTER のみ hasWingRobe を要求する。空島へ渡る portal の `destId` は必ず `'darkTower'` にする（旧実装の `field 3,0 [2,2] {id:'fieldToTower', destId:'darkTower'}` を踏襲）。
  - ⚠️ **空島内の虚空 `SKY %` で飛行必須を担保：** 到着足場と塔ポータルの間を `%` の谷で全行分断（飛行＝羽衣でしか渡れない）。`passable.js:86` で `flying && FLYABLE_OVER.has(SKY)` のみ通過。
- [x] **【バグ②】古代の祭壇 `^` が村のド真ん中に誤配置：** 現状 `field/7,14 [8,6]`（村中央）。IDEA throughline は「北の祭壇 `7,1`→さらに北の塔 `6,0`」。→ **祭壇タイル `^` を北の聖域 `field/7,1` 付近へ移設**（村の `[8,6]` は `.` 床へ戻す）。`boss.js:290 altarExists()` は「マップ上に `^` タイルが1個でもあれば終盤フロー」＝座標非依存なので移設で壊れない（移設先がBFSで徒歩到達可能なことだけ確認）。
- [x] **【動線③】塔の「玄関画面」を地域図どおり `field/6,0`（最北 `T`）に置く：** 飛行で空島→塔へ渡る構図。空島（`K`）と塔玄関（`T`）はフィールド上で隣接させ、間を `SKY %`/`~`海 で隔てて飛行のみ。実際の入場は MAP_ENTER テレポート（縁スクロール非依存）なので地理は演出。
- [x] **【動線④】祭壇開放タイミングの確認：** 祭壇は「8欠片を全て集めてから乗ると羽衣を授かる」＝`boss.js` の `calcTotalTriforces()` 動的判定。D7（8番目）クリアで8欠片揃う→祭壇が機能する。祭壇画面 `7,1` は最初から徒歩到達可能でよい（乗っても欠片不足なら何も起きない＝既存仕様）。

##### 🏛 9-2T-1. 塔内部レイアウト（多層垂直・30室）

> **レイヤー構造の方針：** `dark_tower` は単一レイヤー内に「フロアごとに離れた grid 島」を作り、**フロア間は階段 `>`MAP_ENTER テレポートで接続**（D4 ボス翼と同型＝grid 隣接に頼らず島を `#` で囲い、層をまたぐ移動だけ `>` で繋ぐ）。各フロアは辺スクロールで内部の数室を網状に繋ぐ小グリッド。**「登る」感（B1F→4F→玉座）を階段テレポートの段数で表現。**

- [x] **フロア構成（計30室）：**
  - **B1F 入口（4室）：** 空島から `towerEntrance` で着地（`0,1` 据え置き＋拡張）。石碑「ザーネルの記憶 ―終章―」（`signData`・既存 `0,1 [1,1]`＝**lore-tablets.spec.js が `dark_tower/0,1/[1,1]` を参照**＝この座標は動かさない）。雑魚で足慣らし→上り階段。
  - **1F 弓の層（6室）：** 弓ゲート（`Y`遠隔スイッチ→`T`ゲート・D3/D7 方式）で関門。中ボス `W`魔物（過去ボスの幻影＝砂嵐/海蛇の手下）→鍵 `K`→`D`扉→上り階段。
  - **2F 爆弾＋ロウソクの層（6室）：** `!`壊せる壁（爆弾・D6 方式）＋`H`かがり火全点灯（ロウソク・D4 方式 `torchesLit`→隠し `>`）の2重関門。中ボス `V`魔将。
  - **3F はしご＋笛の層（6室）：** **はしご＝`x`PIT（穴）の1セル橋**で渡る（⚠️ **`~`水ではなく `x`穴を使う**＝後述の飛行バイパス対策）。`flutePlayed`→隠し階段 `>` 出現（D8 方式）。中ボス `V`魔将（強化）。
  - **4F 試練の回廊（4室）：** 全道具の混在パズル＋鍵 `K`→`D`扉でボス前室へ。複数中ボス（`W`×2 等）の関門。
  - **最上階 玉座（4室＋ボス間）：** 玉座の間 `0,0`（据え置き＝`Z`ザーネル・`:`DOORWAY_BOSS・`isBossRoom:true`）。手前に控えの間。撃破→`isFinalBoss`でエンディング。
- [x] **⚠️⚠️ 最重要の設計制約＝プレイヤーは「翼の羽衣（飛行）」を持って入塔する：** `passable.js:86,18` 精査で **飛行は `SKY/WATER/TREE/BUSH/FENCE` を越える**（`FLYABLE_OVER`）。∴ **塔内の道具ゲートに `~`水・`%`空を使うと飛行で飛び越えられて関門が崩壊する。**
  - **➡ はしごゲートは必ず `x`PIT（穴）で作る**（飛行は穴を越えられない＝`FLYABLE_OVER` に PIT は無い・`passable.js:24 FLY...`／`LADDER_OVER` には PIT あり）。`~`水は使わない。
  - **➡ 壁・足止めは `#`WALL/`M`/`!`BREAKABLE_WALL/`D`DOOR/`T`GATE で作る**（いずれも飛行を通さない＝`passable.js:132-147`）。これらで臨界経路の一本道を担保すれば飛行があっても崩れない。
  - **➡ ロウソク/弓/笛/爆弾ゲートは飛行と無関係**（`H`点灯・`Y`スイッチ・`flutePlayed`・`!`壁＝状態フラグ/壊せる壁ベース）＝そのまま使える。
- [x] **臨界経路（一本道・全道具を順に使う卒業試験）：**
  `B1F入口(羽衣で着地)→上り階段→1F[弓ゲートY→T]→中ボスW→鍵K→D扉→上り階段→2F[!爆弾壁＋Hロウソク点灯→隠し>]→中ボスV→上り階段→3F[xはしご橋＋笛で隠し階段]→中ボスV→上り階段→4F[混在パズル＋K→D]→上り階段→玉座[:扉]→ザーネルZ→エンディング`
- [x] **寄道・宝：** 地図 `m`・コンパス `n`（整合性チェッカー必須＝塔も対象に含める場合）／各層に小宝（回復薬 `7`・大ルピー `r`・妖精/魔法の薬）／**最終決戦前の補給**として B1F または 4F に回復薬チェストを必ず1つ（ラスダンの作法）。袋小路の寄道は詰み無し（任意）。

##### 🎯 9-2T-2. メタ・テスト・チェッカー（流し込み時の必須作業）

- [x] **layer メタ：** `dark_tower` は **欠片ダンジョンではない**＝`triforceId` を設定しない（ザーネルは `dropsTriforce` 無し＝`countTriforces` 非対象＝欠片必要数に影響なし・確認済み）。`bossStage:"0,0"` は据え置き。`bgm/bossBgm` 据え置き。
- [x] **中ボス `W`/`V` は欠片に影響しない（確認済み）：** `countTriforces`（`shared/triforce.js`）は `Q`/`X`(魔王)/`dropsTriforce` ボスのみカウント。`W`魔物・`V`魔将は対象外＝何体置いても欠片必要数=8 のまま。**`X`魔王と `Q` 欠片タイルは塔内に絶対置かない**（欠片数が狂う）。
- [x] **接続チェッカー：** `check-dungeon-connectivity.mjs dark_tower`＝**現状は対象外**（`dungeon`/`cave_1` のみ）。塔を対象に含めるか、または専用に走らせる。⚠️ **入口の定義：** `findEntrances` は「他レイヤーの destId が指す部屋」＝塔は `towerEntrance`（空島の `islandToTower` が指す）＝`0,1` が入口。フロア間 `>` 階段は同レイヤー内テレポート＝`connectivity.mjs` のテレポート追跡で全室到達を確認（D4 ボス翼島と同じ）。**はしごゲートは `--with-ladder` で検査**（`x`PIT 1セル橋）。一本道は `--block-room` で「弓ゲート前を塞ぐとザーネル到達不能」を確認。
- [x] **整合性チェッカー `check-dungeon-integrity.mjs`：** ⚠️ **現状 `all` は `dungeon*`＋`cave_1` のみ＝`dark_tower` は対象外。** 塔を対象に含めると「`dropsTriforce` ボスがボス部屋にない（ザーネルは落とさない）」「`triforceId` 未設定」でエラーになる＝**塔は整合性チェッカーの対象に含めない**のが正しい（ラスダン特例）。含める場合はチェッカー側に「`isFinalBoss` 部屋は dropsTriforce/triforceId を要求しない」例外を足す（要検討・今回は対象外で進める）。
- [x] **テスト：**
  - `tests/dark-tower.spec.js` の **`.skip` 2本**（空島の虚空越え＝飛行）を、空島再接続後に **`.skip` を外して座標を新空島ステージへ更新**（✅ 2026-06-30: 3本すべて `.skip` 解除・stage:`8,1` に更新・全4本グリーン）。
  - `tests/lore-tablets.spec.js` は `dark_tower/0,1/[1,1]`「終章」を参照＝**石碑をこの座標に残す**（動かさない）。
  - `tests/field-connectivity.spec.js`：塔・空島は飛行/笛ワープ専用＝`FOOT_DUNGEONS` に含めない（現状どおり）。空島へ徒歩到達できる必要はない（飛行で渡る）が、空島の**手前までの徒歩到達**は不要（飛行ワープで届く）。
  - エンディング発火（`Z` 撃破→`isFinalBoss`）は既存スモークで担保済み（`boss.js` 変更なし）。
- [x] **新規ゲームコードは不要（実コード精査済み）：** 階段 `>`MAP_ENTER（フロア間テレポート＝D4 ボス翼で実証）＋既存ギミック（弓 `Y`/爆弾 `!`/ロウソク `H torchesLit`/はしご `x`PIT/笛 `flutePlayed`/鍵 `K`→`D`）＋ザーネル `Z`（`enemies.js:145` 定義済み・`isFinalBoss`）＋中ボス `W`/`V`（定義済み）＝**全て既実装。** 流し込みは純 JSON（多室の手作業）＋終盤動線の再接続（空島復元・祭壇移設）＋テスト座標更新。
- [x] **(A) ソフトロック検算：** 塔は最終ダンジョン＝後の報酬を要求しない（厳守 OK）。要求するのは既得6道具＋羽衣のみ。飛行で関門を飛ばせないこと（`x`PIT・`#`壁で担保）を `--with-ladder`/`--block-room` と実プレイで検算。

#### 9-2x. ダンジョン整合性チェッカー `check-dungeon-integrity.mjs`　✅ 完了（2026-06-23）
> **目的：** ダンジョン作り込み時に「後ダンジョンのアイテムがないと詰む部屋」を機械検出する。Opus の設計・Sonnet の流し込みの両工程でチェッカーを通すことで品質基準を統一する。
- [x] **`scripts/check-dungeon-integrity.mjs` 新設**（`node scripts/check-dungeon-integrity.mjs [dungeon_1|all]`）
  - **[MUST エラー]** `bossStage`・`triforceId` 未設定 / bossStage 部屋が `isBossRoom:true` でない / `dropsTriforce` ボスタイル(A/L/N/J/O/U/G)がボス部屋にない / ハートの器チェストがボス部屋にない
  - **[MUST エラー]** 地図タイル`m`・コンパスタイル`n`がどの部屋にも存在しない
  - **[MUST エラー]** 後ダンジョンアイテムが必要なタイル（`~`水/`x`穴=はしごD5前・`!`壊せる壁=爆弾D6前）が**出口を封鎖**している部屋
  - **[WARNING]** 上記タイルが存在するが出口は塞いでいない（寄道の可能性あり・意図確認）
  - **アイテム解禁順**（PLAN.md 9-1）をハードコード：D1=なし / D2=ブーメラン / D3=弓 / D4=ロウソク / D5=はしご / D6=爆弾 / D8=笛 / D7=なし（※チェッカーの `UNLOCKED_AT` は現状 `cave_1` キー。dungeon_8 新設時に `dungeon_8` キーへ差し替える）
- [x] `dungeon_1` エラー0・警告2（`[1,0]`の`!`寄道宝＋`[2,2]`の水堀スイッチパズル＝いずれも出口非封鎖）
- [x] `dungeon_2` エラー0・警告0
- [x] dungeon_1/2,2 を修正：旧「全幅水堀row3＋Y(6,9)＋T(2,3)→矢スイッチパズル」が left/right 出口(row4,5)を封鎖 → 水堀をrow7に移動・Y(8,9)・T(2,9) に変更（出口row4,5は水堀より上＝到達可能）。地図`m`を(2,3)に配置。`arrow-switch.spec.js` の座標を合わせて更新

> **各ダンジョン作り込み後の必須手順：** `node scripts/check-dungeon-integrity.mjs <layer>` → エラー0 であること。警告は意図確認。

#### 9-2y. ダンジョンごとの Opus レビュー（構造・バランス・体験）　🧠（各ダンジョン作り込み後）
> **目的：** 機械チェック（接続＋整合性）で取れない問題を人間目線で検証する。各ダンジョンを独立した「一点物の体験」として品質を担保する。
- [x] 各ダンジョンの作り込み完了後、🧠 Opus で以下の3段階レビューを実施：（**✅ 全8ダンジョン完了。D3/D4=2026-06-28・D1/D2/D5/D6/D7/D8=2026-07-01。詳細 DECISIONS.md「2026-07-01 Phase 9-2y」**）
  - **① 構造チェック**：臨界経路どおりに進めるか / 鍵ゲートが確実に一本道になっているか / 寄道は任意で詰みにならないか / 後アイテム依存が残っていないか（チェッカーのWARNを目視確認）
  - **② バランスチェック**：難易度カーブ（雑魚→仕掛け→中ボス→ボス）が機能しているか / 剣のみでクリアできるか / 報酬が連鎖（9-1 表）と矛盾しないか
  - **③ プレーヤー体験チェック**：迷子になる導線の穴がないか / 看板・NPCの誘導が足りているか / 「このダンジョンならではの体験」があるか
- [x] レビュー対象ダンジョン（作り込み完了次第追加）：
  - [x] dungeon_1「草原の洞窟」（入門・木の盾・G）（✅Opus 3段階レビュー完了 2026-07-01・合格。木の盾`1,1`が必須チョーク〔封鎖でボス到達不能〕・剣のみクリア可・入門カーブ妥当）
  - [x] dungeon_2「砂漠の神殿」（ブーメラン・N）（✅Opus 3段階レビュー完了 2026-07-01・合格。番兵`F`で盾ガード導線・ボスN hp32 剣可・報酬ブーメラン連鎖整合）
  - [x] dungeon_3「水の迷宮」（弓矢・J）（✅Opus 3段階レビュー完了 2026-06-28・構造/バランス/体験すべて合格・指摘1件＝[2,1]番兵`F`がスタートから孤立寄道で誘導が活きない→2026-06-29 に `[1,3]` 入口室へ移設済み）
  - [x] dungeon_4「炎の神殿」（ロウソク・A）（✅流し込み完了 2026-06-25・9-2e／✅Opus 3段階レビュー完了 2026-06-28・全合格・指摘なし）
  - [x] dungeon_5「氷の廃墟」（はしご・L）（✅流し込み完了 2026-06-27・9-2f／✅Opus 3段階レビュー完了 2026-07-01・合格。はしご必須〔水堀`1,1`封鎖でボス不可〕・ボスL meleeOnly+reflectsProjectiles で遠隔バイパス封じ）
  - [x] dungeon_6「森の聖域」（爆弾・O）（✅流し込み完了 2026-06-27・9-2g／✅Opus 3段階レビュー完了 2026-07-01・合格。爆弾必須〔`!`壁 `1,2`封鎖でボス不可〕・かがり火テレポート・妖精/回復の寄道充実）
  - [x] dungeon_8「沼地の神殿」（笛・I）（✅流し込み完了 2026-06-27・9-2h／✅Opus 3段階レビュー完了 2026-07-01・合格。ただし**23室（spec 24室と差異＝`[4,0]`+`[0,4]`の2室欠き）**を指摘。はしご入場+flutePlayed reveal テレポート・ミラーシールド報酬。詳細 DECISIONS 2026-07-01）
  - [x] dungeon_7「空中の遺跡」（笛ワープ入場・新アイテムなし・U）（✅流し込み完了 2026-06-27・9-2i／✅Opus 3段階レビュー完了 2026-07-01・合格。笛ワープ入場〔徒歩不可〕・弓/爆弾ゲートの総合卒業試験・ボスU弱点arrow）
- **⚠️ 9-2y 指摘の申し送り（改善は任意・後続タスク）：**
  - **[要修正・小] D8 が 23室（spec 24室）：** PLAN 9-2h は「25 から `[4,0]` の1室だけ欠く＝24室」だが実データは `[4,0]`+`[0,4]` の2室欠き＝23室。臨界経路・接続・欠片に影響なし。→ `[0,4]` を1室足すか PLAN を「23室」に是正（ユーザー判断）。
  - **[記述訂正] ハートの器はコードでキャップしない＝配置総数がそのまま最大ハート数（ユーザー確定 2026-07-01）：** `gainHeartContainer()` に上限が無いのは設計どおり（上限を持たせたければ配置数で表現する）。現状の配置総数16個（開始3+16=最大19ハート）が意図した最大値。∴ 当初の「キャップ未実装＝要対処」指摘は撤回。残る整理は軽微＝(a) `tests/heart-containers.spec.js` ヘッダの「②: 上限 MAX_HEARTS=12 で頭打ち」という古い記述（決定と矛盾・テスト②は未実装）を削除/修正、(b) 器の分布（D3/D4/D5 のみ mid-boss に2個目）は総数が意図値なら任意＝統一必須ではない。詳細 DECISIONS 2026-07-01。

#### 9-2c. 8体目の大型ボス（沼地の大蝦蟇）を「部品」として新規作成　🧠→⚡　✅ 部品作成のみ完了（2026-06-24）
> ⚠️ **位置づけの修正（2026-06-24・ユーザー指摘）：** 当初この 9-2c で「cave_1 をボスダンジョン化して沼地ボスを置く」実装をしたが、**これは根本的な誤り**。`cave_1` は**小さな洞窟用に作ったレイヤー**であり、欠片ボスを置く場所ではない。**欠片ダンジョンは `dungeon_1〜8` の8個に統一すべき**（現状 `dungeon_1〜7` ＋ ラスダン `dark_tower` で、`dungeon_8` が欠けている）。→ **cave_1 への配置データは revert（小洞窟のまま維持）し、沼地ボスは新設する dungeon_8 に置く**ことに決定。dungeon_8 の連鎖位置・テーマ・フィールド入口は**ゼロから設計し直す**（9-2{d〜} で実施）。
- [x] **沼地の大蝦蟇を「ボス部品」として作成**（3-2 の型）：スプライト（64×64・2フレーム・codegen 生成）→ `ENEMY_META[TILE.SWAMP_TOAD]`（hp40/atk5/def2＋`size:{2,2}`＋`dropsTriforce:true`＋`weakness:{fire,×2}`）→向きエイリアス4つ→`shared/tiles.js` に `SWAMP_TOAD='I'`＋TILE_META。`scripts/check-dungeon-integrity.mjs` の boss-tile セットにも `'I'` を追加。実ブラウザで 2×2 描画・ボス部屋ロック・HPバーを確認済み（cave_1 に仮配置してスクショ → その後 revert）。
- [x] **⚠️ まだどのマップにも未配置**（`work/blade-of-lumia.json` は HEAD に revert 済み）。`tests/swamp-boss.spec.js`（4本）は「部品の定義が揃っている＋ライブマップに未配置」を検証（誤配置の回帰防止）。
- [ ] **dungeon_8 を新設し、そこに沼地ボスを配置する**（→ 9-2{d〜} / dungeon_8 設計タスク）。配置時に欠片整合（`countTriforces()` が大型ボス8体＝8）を取り、直接拾える `Q` の扱いもそこで確定する。
- [x] ※ ザーネル（Z・dark_tower）は欠片を落とさない最終ボスのまま（最終的に大型ボス8＋最終1＝計9ボス）。

### 9-2z. ダンジョンマップ機能強化（接続表示の正確化＋未探索表示）　⚡ Sonnet
> **背景：** 動作確認で発覚した2つの問題。①現在は「隣にステージが存在すれば接続あり」と見なして通路を描いており、実際に辺が開いているか（壁で塞がれているか）を見ていない → すべての部屋が四方つながって見える。②訪問判定が `defeatedEnemies.size > 0` のため、敵なし部屋（宝部屋・通路部屋）を訪れても「暗い」まま → どこが未探索か分からない。

> **目標：** ゼルダ式のダンジョンマップ（訪問済みは明るく・未訪問は暗く・接続は実際の辺開口を見る）を正しく実装する。コード変更は `ui.js`（描画）と `save.js` または `game.js`（訪問記録）の2か所に限定できる想定。

#### ① 接続表示の正確化
**問題：** `ui.js:403-406` の通路描画が `stageSet.has(隣キー)` だけを見ており、辺の開口（`tiles` の実データ）を確認していない。
**修正方針：** 通路を描く前に、当該部屋の `tiles` で開口確認を追加する。
- 右辺（`sx+1` 方向）: `tiles[4][11] !== '#' || tiles[5][11] !== '#'`
- 左辺（`sx-1` 方向）: `tiles[4][0] !== '#' || tiles[5][0] !== '#'`
- 下辺（`sy+1` 方向）: `tiles[9][5] !== '#' || tiles[9][6] !== '#'`
- 上辺（`sy-1` 方向）: `tiles[0][5] !== '#' || tiles[0][6] !== '#'`

上記の条件が **true のときのみ** 通路セグメントを描画する。`D`DOOR タイルは `#` でないので開口扱いで正しい。

#### ② 未探索ステージ表示（訪問記録）
**問題：** `ui.js:393` の `getSS(lk, sk).defeatedEnemies.size > 0` は敵なし部屋で成立しない。
**修正方針：** ステージ初期化時（入室時）に `visitedStages` を記録し、マップ描画で参照する。

**実装の2択：**
- **案A（軽量）：** `getSS()` の返す stageState に `visited: true` フラグを追加し、ステージ遷移・初期ロード時に `ss.visited = true` をセット。既存の `stageState` 構造に1フィールド追加するだけ。セーブデータは自動的に `stageState` と同じキーで保存済みなので `saveGame()` 変更不要。
- **案B：** 別の `visitedStages` Set を layer レベルで管理。

**→ 案A を採用。** 変更箇所：
1. ステージ遷移・初期化時に `ss.visited = true` をセット（`game.js` のステージ切り替え処理 or `saveGame`/`loadGame` 付近）
2. `ui.js:393` の判定を `getSS(lk, sk).visited === true` に変更

#### チェックリスト
- [x] `ui.js` の通路描画（`renderPauseDungeonMap` 内）を修正：隣ステージの存在確認に加え、**当該部屋の `tiles` で辺の開口を確認**してから通路を描く
- [x] ステージ入室時に `getSS(currentLayer, stageKey).visited = true` をセットする（`game.js:301`）
- [x] `ui.js:393` の訪問判定を `ss.visited === true || isCurrent` に変更
- [x] **テスト：** dungeon_1〜4 で実プレイ確認：①接続のない辺に通路が出ない、②入った部屋だけ明るくなる、③まだ入っていない部屋は暗い（コンパスなしでも部屋の存在は薄く見える）
- [x] 既存テストへの影響確認（stageState を参照するテストが `visited` フィールドに反応しないか）＝全187テストグリーン

### 9-3. 序盤チュートリアル動線＋ガイド導線の実装　🧠→⚡

> **⚠️ 着手順の確定（2026-06-28 ユーザー指摘）：** ガイド導線は「誘導すべき本筋」が無いと中身を書けない。→ **先に全体あらすじ（throughline）を確定**してから着手する。**あらすじ＆マップ移動の流れは `IDEA.md`「🎬 あらすじ」に明文化済み（2026-06-28・🧠 Opus）**。石碑番号は **B＝攻略順に振り直し済み**（其の五=D6森・其の六=D5雪・其の七=D8沼・其の八=D7空／`tests/lore-tablets.spec.js` 更新済み・全緑）。**以後この 9-3 は (a) チュートリアル → (b) ガイド導線 の2段で進める。**

- [x] **あらすじ＆マップ移動の流れを確定**（`IDEA.md`「🎬 あらすじ」・🧠 Opus・2026-06-28）。石碑Bルート振り直し＋D8/D7 本文の進行整合修正・lore-tablets テスト更新済み。

**(a) チュートリアル（あらすじ薄でも作れる・先行実装可・⚡ Sonnet）：**
- [x] 何も持たないスタート → 村 `7,14` 出口に木の剣を半強制ピックアップ（出口が剣の先・歩行で必ず拾う地形）。**現状：木の剣は遠方の `12,2`(火山 floorItem)・`2,4`(森 chest) に2本散在＝村に無い**→村出口へ1本集約＋遠方2本は撤去 or 後半再配分。村の孤児ブーメラン（`7,14 chestContents["7,6"]`＝B タイル無しで拾えない）も撤去。**✅ 2026-06-29: `field/7,14 floorItems["1,6"]` に木の剣追加・`12,2[4,8]` 撤去・`2,4[8,10]` Bタイル含め撤去・孤児ブーメラン撤去。**
- [x] dungeon_1 で木の盾を入手 → ガードを使わないと進めない配置の補強。**現状：木の盾は `dungeon_1/1,1` chest `[3,5]`＝臨界経路上（入口→ボス `0,0` 手前）でOK・ボス`G`は石投げ range6**。盾ピックアップの必然性（chest を経路上に確実に）とボス前の被弾導線を確認・微調整。**✅ 2026-06-29: データ監査で 1,1[3,5] が臨界経路上で B タイル確認済み。追加変更不要。**
- [x] ミラーシールド重複の撤去（`dark_tower/0,1[1,9]` 孤児＝正は `dungeon_8/0,0` 報酬）。**✅ 2026-06-29: 撤去済み。**

**(b) ガイド導線（あらすじ準拠・9-2F1 質パスと連動・⚡ Sonnet）：**
- [x] **ガイド導線（フィールドは塞がない・誘導のみ）：** 村NPC・各ダンジョン入口の看板（`signData`）・`linesAfterBoss[type]` を使い、**「次はどこを目指すか／そこに入るには何が要るか」**を段階的に提示する。✅ 2026-06-29: `scripts/migrate-guide-b.mjs` で老賢者・村人タロ・D1〜D8 各入口看板に `linesAfterBoss` を追加。**あらすじ準拠の全8ボス対応（G→N→J→A→O→L→I→U）＋D8入口看板新規追加・defeated-bosses テスト更新・全184/187緑。**
- [x] ※ 「D1→D2 の NPC 門番（通行ゲート）」案は撤回（フルオープン方針と矛盾）。順序強制は 9-2 のアイテムロックで効かせ、NPC はガイドに徹する
- [x] 着手時に D3 の番兵`F`配置（盾ガード導線が寄道に埋もれている・9-2y 指摘）も併せて再検討。**✅ 2026-06-29: `[2,1]` 寄道の F×2 を `[1,3]` 入口室へ移動（row3,col8 / row5,col8）。入口看板に盾ヒントを追加。`[2,1]` は矢(15)フロアアイテムで探索報酬化。connectivity PASS・全184/187緑。**

**機構メモ（実コード精査済み・新規コード不要）：** `npcData` の台詞選択優先＝`linesAfterBoss[bossChar]→linesAfterBoss.default→linesAfter(triforceCount>0)→lines`（`game/ui.js:174-191`）。`signData`＝`{name,lines}` を `i`SIGN タイルで剣ボタン読み（`combat.js:243`）。`defeatedBosses` はボス撃破で `boss.type`(='G','N'...) を add（`boss.js:190`）・save/load 対応済み（`game.js:215/230`）。NPC タイル＝`a`/`b`/`$`/`P`、看板＝`i`。floorItem は歩行ピックアップ。

> ※ 9-1 の連鎖設計は完了（2026-06-23）。次は 9-2（ダンジョン作り込み）/9-3（チュートリアル＋ガイド導線）の実装。**Phase 8（やりこみ・UX）と Phase 8-4（バランス調整）は Phase 9 の後に回す**（ゲームの背骨が無い状態で UX やバランスを詰めても土台がブレるため）。**特に Phase 8-4 リバランスは全タスクの最後尾＝コンテンツ完成後に着手（2026-07-04 ユーザー確定・上記実施順5番）。** なお Phase 8-1（ゲームオーバー体験改善＝フクロウのヒント／墓）は**スキップ**で合意（詰みポイントが少なく発火しにくい・ヒント手段は石碑/NPCで足りている）。

---

### 9-4. フィールド地形の品質改善（レビュー→再設計）　🧠 設計確定（2026-07-01）／⚡ 流し込み

> **背景（2026-07-01 ユーザー指摘＋実データ監査で裏取り）：** field 320画面は M2〜M4 の機械充填のまま**地形レビュー未実施**（9-2y でレビューしたのはダンジョンのみ）。実データ解析で「雑・水だらけ」の根本原因が4つ判明：
> 1. **🚨 地面が草地でなくダンジョン床：** 全320画面で最頻タイルは `.`FLOOR＝**19,886個**。一方 `g`GRASS は**使用0回**。FLOOR 色は `#2a3540`（暗い地下床）＝オーバーワールド全体が地下迷宮に見える。**これが「雑」の最大要因。**
> 2. **🚨 テーマ地形タイルが存在しない：** 通行可地形は `g`草地/`d`砂地/`o`石畳/`v`橋 のみ。**雪原/火山/沼地/森床の地面タイルが tiles.js に無い**＝雪も火山も沼も全部同じ `.` 床で描き分けられていない（砂漠だけ `d`SAND を1,064個使用）。
> 3. **🚨 水域が「渡れない海」で埋まっている：** 水 `~`＝**11,296個**・橋 `v`＝**0個**。湖(D3周辺)は「中央2列だけ床の細い水路」、沼地M地域の一部は**水100%で島すら無い死に画面**（例 `12,13`/`12,14`/`9,17`）。内側（プレイ領域）252画面のうち **65画面が水6割超**。
> 4. **🚨 地形の作りが単調：** 質パス（`migrate-quality-pass.mjs`）が「オブジェクトを撒く」だけで、地形の起伏・境界・導線が無い＝開けた床に木/敵/宝をパラパラ置いただけ。

> **地域基準図は 9-2F1（上記「🗺 9-2F1」）で確定済み**（村 `7,14` 中央／森=西・砂漠=南西・湖=東・火山=北東・雪=北東・沼=南東・空島/塔=最北）。**再設計はこの区画を変えず、各画面の「地形の中身」を作り直す。**

#### 設計方針（🧠 確定）
- **(A) 地面の基調を地域テーマで塗り分ける（下記 9-4a のテーマ地形タイル新設が前提）：**
  - 草原=`g`草地／森=`g`草地＋木 `t` 多め／砂漠=`d`砂地／雪原=新 `snow`／火山=新 `ash`(火山灰/岩肌)／沼地=新 `mud`(泥)＋水 `~` 点在／湖=`~`水＋島 `g`＋橋 `v`。
  - **`.`FLOOR は field では原則使わない**（`.` はダンジョン床）。既存の全 field 画面の `.` を地域ごとの地面タイルへ一括置換するのが流し込みの主作業。
- **(B) 水域は「渡れる・意味のある水」にする：** 湖/沼の水は①橋 `v` で徒歩導線を通す、②はしご（D5報酬）で1セル渡る関門にする、のどちらかで必ず「渡り方」を用意する。**島の無い水100%画面は廃止**（海ボーダー＝外周を除く）。海 `~`（外周障壁）はそのまま残す。
- **(C) 地形に起伏と導線を作る：** 各画面は「開けた床＋パラパラ」でなく、山 `M`/木 `t`/柵 `f`/水 `~` で自然な通路と小部屋を作り、辺の開口（接続規約 row4,5 / col5,6）を意識した地形にする。密度（敵/宝/ギミック）は地形が決まってから 9-2F1 質パスの手法で上げる。
- **(D) 小ダンジョン（拡充アイテム置き場）を各地に配置：** 下記 9-5 の爆弾袋/矢筒（各3個）を置く**ボスなしの小洞窟**（`cave_*` レイヤー）を各地域に散らす。field 側に徒歩入口 `>` を用意。

#### チェックリスト（⚡ 流し込み）
> **⚠️ 実データ確認で判明（2026-07-04・地面塗り分け着手時）＝PLAN の前提が古かった：** field の**見える地面は `tiles` 層の `.`FLOOR ではなく `bgTiles` 層**が描く（`render-board.js` の `setCellClass` は `.`FLOOR を素通りさせ `applyBgTileClass` で bgTile 色/スプライトを敷く）。M1〜M4 で **bgTiles はすでに大半が `g`草地**に塗られており、診断①「全画面が地下床に見える」は草原地域では既に解消済みだった。残る実欠陥は**テーマ3地域の bgTiles**＝**L(火山)=半分 `.`地下床・S(雪)=大半 `.`地下床・M(沼)=素の草地**の3つだけ。∴ 塗り分けの操作対象は「tiles 層の `.` 一括置換」ではなく **`bgTiles` の L→ash/S→snow/M→mud 再塗り**（純粋に見た目・`passable.js` は tiles 層を読むので接続不変）。
- [x] **9-4a を先に完了**（テーマ地形タイル新設＝下記）。タイルが無いと塗り分けられない。
- [x] **テーマ3地域の bgTiles を地域テーマへ再塗り**（`scripts/migrate-field-terrain.mjs`・2026-07-04）：L→ash `c`／S→snow `s`／M→mud `w`。地面フィラー `.`/`g` のみ置換し、石畳 `o`・砂 `d`・橋 `v`・水 `~` は保持。38画面・4478セル。草原(G/F/W/D)は M1〜M4 で既に草地 bgTile 済みのため対象外。
- [x] **水100%の内側死に画面を作り直す**（島＋橋）。**⚠️ 実データ精査で判明＝PLAN 診断③が古かった：** 「水100%死に画面」と名指しした `12,13`/`9,17` 等は `ZONE_MAP` 上 `~`＝**外周海の意図的ボーダー**（M4 で海に再タイル済み）＝プレイ領域の死に画面ではなく、作り直し対象は存在しなかった。**本当の「雑」は湖(W)地域＝12画面が2種類のスタンプ使い回し**（草の十字レーンを水に貫通しただけ）だった。→ これを島＋橋アームで作り直し（下記）。
- [x] **湖(W地域12画面)に橋 `v` の徒歩導線を敷く**（`scripts/migrate-field-lake.mjs`・2026-07-04）：中央2×2草島＋四方へ2幅の橋アーム（col5,6縦／row4,5横）＝**フィールドマップ初の橋 `v`**。各画面に固有の小島（草 `g`＋橋スパー `v`）を象限に配置し12画面すべて別の見た目に。**接続不変を機械保証：** 橋 `v` は passable＝境界開口(col5,6/row4,5)を橋のまま維持し、小島は内周のみ（境界行/列に触れない）＝到達セル増のみ。`check-field-connectivity.mjs` の reached 209/dead-edge 1203 が **before/after 完全一致**。※沼(M地域)の橋導線は水点在3%と軽微なので別セッション（残）。
- [x] **`check-field-connectivity.mjs` PASS 維持**（bgTile 再塗りは接続に無関係＝exit 0 確認）。
- [x] **全テストグリーン**（`tests/field-terrain.spec.js` 2本新設＝L/S/M に `.`/`g` 地面フィラーが残らない＋各テーマ色が実在。全226テスト通過）。
- [x] **実プレイ確認**（Playwright `enterStage` でスクショ）：雪(13,4)=白青・火山(12,1)=暗赤茶の灰・沼(10,12)=暗緑の泥＝地下床でなく地域テーマに描画されることを目視確認。

#### 9-4a. テーマ地形タイルの新設　✅ 完了（2026-07-02・⚡ Sonnet）
> **目的：** 雪原/火山/沼地/森を地形で描き分けるための通行可地面タイルを追加する。**新規ゲームロジックは不要**（通行可の見た目違いタイル＝`g`GRASS と同じ扱い）。追加は tiles.js + スプライトのみ。
- [x] **タイル追加**（`shared/tiles.js`）：`SNOW('s')`（雪原・白系）・`ASH('c')`（火山灰/岩肌・黒赤系）・`MUD('w')`（泥/沼床・暗緑褐色）の3種を追加。passable:true。BG_TILES にも追加済み。
- [x] **スプライト**（`shared/tile-sprites.js` ＋ `shared/sprites-tiles.js`）：SNOW→grassスプライト+snowパレット、ASH→sandスプライト+ashパレット、MUD→grassスプライト+mudパレット。絵文字不使用。
- [x] **passable.js は変更不要（実コード確認済み）：** ブロックリスト方式∴ 追加不要。
- [x] **エディタ確認**：`editor/editor-palette.js:41` の `PALETTE_CATEGORIES` に SNOW/ASH/MUD を追加。`editor-canvas.js` / `editor-world.js` のハードコード色マップを `TILE_META.color` 参照に統一（新タイルが自動対応）。
- [x] **テスト**：`tests/terrain-tiles.spec.js` 新設（12本・全グリーン）。passable/スプライト参照/パレット/BG_TILES を各タイルで検証。
- [x] **⚠️ 飛行バイパス注意：** 新地形タイルはすべて通行可・ゲート機能なし。

---

### 9-6. フィールドを「ゲームとして成立」させる　🧠 Opus（対話で設計・複数タスクに分割）　⏳ 設計対話フェーズ＝最優先

> **これは最優先タスク。着手時は必ずこのセクションを最初に読むこと。**

> **🚨 割り込み（2026-07-11 ユーザー指示）：** 次にすぐやるのは 9-6 ⑥-5 ではなく **Phase 4-6（ブーメラン投擲物改修＝アイテム運搬＋復路の攻撃判定復活）**。それが終わってから 9-6 ⑥-5 に戻る。

#### ▶▶ 9-6 の前提（★確定と設計①〜⑤の完了記録）

> **⚠️ 実行順序はここに書かない。次にやることは本ファイル冒頭の「🎯 実行キュー」だけを見る**（2026-07-28・順序の定義を1箇所に集約）。旧記述「次候補＝砂漠 or 草原ハブ」のような複数候補の並置は禁止。
>
> **土台是正＋★1〜★4 確定＋設計①〜⑤ すべて完了。** ⑤で確定した型（`FIELD-9-6-DESIGN.md` §8-5）を出発点に、地域ごとに1本の migration スクリプトへ手作業で意図を詰める（🧠 Opus 設計・⚡ Sonnet は流し込みのみ）。
>
> **⚠️「量産」ではない（2026-07-06 ユーザー指摘・9-2 ダンジョン PLAN:955 の鉄則をフィールドにも適用）：** テンプレ・自己検証スクリプトは設計の出発点と安全網であってコピペのスタンプではない（dup検出が同一配置を禁じる）。1枚ずつ「なぜこの画面が要るか」を考えて作る。
>
> **⚠️ ⑤で暫定進行した3論点（§7-5）はまだユーザー未確認**（塔allowlist／ratchet／タイル推定）。⑤着手時に AskUserQuestion したが離席で応答なし＝⑤も暫定デフォルトのまま。⑥/④に入る前にもう一度確認するのが望ましい（テスト定数の差し替えで済む設計は維持）。
>
> **✅ ★確定（2026-07-05・AskUserQuestion・DECISIONS.md 同日エントリに詳細）：**
> | ★ | 確定 |
> |---|---|
> | ★4 外周リング | **全320画面を作り替える**（外周の全水/全山も実プレイ可能に＝B方針の厳密適用）。scope=320画面全部 |
> | ★3 スコープ | **全210画面（＋外周110）を均等に意味づけ**（骨格厚め＋周辺軽めは却下・素通り0） |
> | ★2 面白さの主軸 | **4軸すべて**＝(a)隠し要素の網羅／(b)地形パズルの導線／(c)地域固有体験／(d)戦闘の起伏 |
> | ★1 着手順 | **面白さ設計を先に**（シーム91件潰しより設計優先） |
>
> **∴ 実体の進行順（新体系）：** ①面白さの言語化 ✅ → ①.5 面白要素カタログ ✅ → ②地域テンプレ設計 ✅（§4） → ③地域固有ギミック ✅（§3） → ④不変条件テスト化 ✅（§7・ratchet／`field-quality.mjs`） → **⑤森1地域試作＝密度基準確立＋予告編の道具所持タイミング決着 ✅（§8・`migrate-field-forest.mjs`）** → **⑥【次】各画面を1枚ずつ設計して作り込む（🧠 Opus 設計・⚡ Sonnet 流し込みのみ／§8-5 手順・量産ではない）** ＋ 並行で設計④外周（世界の果て・論点2）は 🧠 Opus。
>
> **⚠️ 3論点はまだユーザー未確認（§7-5・⑤も離席で暫定デフォルト継続）：** 論点1（塔まわり `8,0`/`8,1` を2軸ルールの allowlist で除外＝9-2T に委ねる）／テスト戦略（ratchet 採用）／2軸判定（タイル推定方式）。⑥に入る前にもう一度確認したい（違えばテスト定数の差し替えのみ）。
>
> **⚠️ ⑥は1地域=1 migrationスクリプトずつ・各画面は1枚ずつ手作業で設計**（一括で全画面をスタンプしない＝塗り絵の再来防止）。数が下がるたび `tests/field-invariants.spec.js` の BASELINE を締める。着手前に `FIELD-9-6-DESIGN.md` §8（⑤の型と申し送り）・§4・§7 と本セクションを読む。
>
> **（旧 ★1〜★4 の分岐は役割終了。`FIELD-9-6-DESIGN.md` は設計本体＝⑤⑥完了まで現役。）**

> **背景（2026-07-04 ユーザー強い指摘）：** 「今の状態のマップはクソです。まったくもってゲームとしての楽しさ、奥深さが存在しません。現状はただエリアごとに床をぬってるだけで、複雑さが1mmもありません。」— 9-4（地面塗り分け・湖の島橋化）は完了したが、それは**塗り絵**にすぎず、フィールドはゲームとして成立していない。ここに**楽しさ・奥深さ・複雑さ**を与えて成立させる必要がある。
>
> **⚠️ 進め方の大原則（ユーザー確定）：** **一発の対話・一発の実装で設計しきることは不可能。** まず「**どんな検討タスクが必要かを対話で洗い出す**」ところから始め、設計を複数のサブタスクに分割して1つずつ Opus で詰める。行き当たりばったりで画面を触り始めない（また塗り絵になる）。**まず設計 → 不変条件をコードで固定 → その後に流し込み**の順を厳守。

#### 確定している方針・制約（2026-07-04）

- **🅱️ B方針で確定＝グリッド（16×20＝320画面）を縮小しない。全画面を実プレイ可能ステージにする。** グリッドを実効範囲まで削る A 案は却下（元々ユーザーが 256↑・広く、と指示していた）。初代ゼルダ 16×8＝128 が「全画面が意味を持つ」構造だったのが手本。境界はグリッドの端で表現し、埋め草画面で数を水増ししない。
- **🚫 無駄ステージは1枚も作らない（ゼロが不変条件）。** 無駄＝(W1) 全セル通行不可（右端の全部水・左上の全部山など＝一歩も立てない）／(W2) 歩けるが村から到達不能（orphan）。**現状は W1・W2 が大量に存在**（例：右端のほぼ全水域、左上の全山ステージ）。B方針なのでこれらは削除でなく**実ステージに作り替える**。
- **🚫 接続ミスは1箇所も残さない（ゼロが不変条件）。** 接続ミスの定義（下記）で1件でも出たら red。ユーザー実例：`9,8`↓→`9,9`（下端は歩けるのに 9,9 上端が全部山で着地不可）／`8,17`→右→`9,17`（沼の右端から踏み出すと全水の 9,17 で動けない）。「こういう部分を0にする必要がある」。

#### 🔴 まず直すべき土台＝接続ミスチェッカーが信用できない

> ユーザーが最初に疑ったとおり、**現状の「dead edge 1203件」は信用できない数字**。到達不能画面由来の辺や、外周の海ステージが生む辺まで混ざっている（＝プレイヤーが一生踏めない辺もカウント）。**「実際に踏んで詰む箇所」だけを数える定義に直さないと、規模も進捗も測れない。**

- **接続ミスの正しい定義（3条件すべてを満たすときだけカウント）：**
  1. 出発画面が**村から徒歩到達可能**（`bfsLayer` の reachedRooms に含まれる）
  2. 踏み出す**辺のセル自体が通行可**（そこに立って隣へ押せる）
  3. その辺へ進むと隣画面の反対辺（cross-axis 同座標）へ遷移するが、**着地セルが徒歩通行不可**（`#`壁／`M`山／橋の無い `~`水 等）＝クランプ/めり込みで動けなくなる
- [x] **チェッカーを上記3条件で絞る**（`check-field-connectivity.mjs`）。2026-07-05 実施＝「9-6 honest metrics」セクションを追加（加算的な計測のみ・合否判定は未変更）。生 dead-edge を W1(全不通)/W2(orphan)/本物のシーム破綻 に3分解。
- [x] **「実際に踏める接続ミス」件数と該当ステージ一覧を出す**（規模把握）。2026-07-05＝**本物のシーム破綻=91ペア**（到達可能どうしなのに壁で詰む）と判明。生1203は水増し（W1/W2/外周海ノイズ込み）。これを0にするのが 9-6 の構造ゴール。**★外周リング110画面を境界扱いにするか未確定＝`FIELD-9-6-DESIGN.md` 参照。**
- [x] **無駄ステージ検査を追加：** W1（全セル通行不可）と W2（orphan）を `fieldHonestMetrics()` で列挙（2026-07-05・§7）。両方 0 が目標。
- [x] **不変条件をテスト化：** 2026-07-05 完了（`FIELD-9-6-DESIGN.md` §7）。**設計④＝4不変条件を CI ratchet で固定：** `scripts/lib/field-quality.mjs`（単一の真実）＋`tests/field-invariants.spec.js`（seam/W1/W2/under-2-axis/dup を基準以下で assert・目標0）＋`tests/field-quality-lib.spec.js`（推定ルール自体を fixture で検証）。ratchet 方式＝全320作り替えが終わるまで green を保ち劣化のみ即 red。ベースライン＝seam91/W1・W2各110/under-2-axis110/dup3（全水84/全山13/全壁13＝W1と一致）。**⚠️ 論点1（塔allowlist）・テスト戦略（ratchet）・2軸判定（タイル推定）の3点はユーザー未確認の暫定＝次セッション冒頭で確認（§7-5）。**

#### 設計で洗い出すべき検討タスク（← ★1〜★4 確定後に、対話でこのリスト自体を精緻化する）

> 以下は**叩き台**。**上記 ★2（面白さの主軸）と ★3（スコープ）が確定してから**、対話で「本当に必要な検討項目」を洗い出し・追加・分割する。各項目は独立した設計サブタスク（9-6a, 9-6b, …）になる想定。★未確定のまま着手しない。

- [x] **9-6-設計①「楽しさ・奥深さ・複雑さ」の言語化：** 2026-07-05 起草（`FIELD-9-6-DESIGN.md` §2）。**受け入れ基準＝どの画面も「導線・障害・秘密・戦闘・ランドマーク」のうち2つ以上を満たす（1つ以下＝素通り＝red）。** 4軸(a隠し/b地形パズル/c地域固有/d戦闘)は「画面ごとに主軸1＋副軸1」で配置。素通り126画面の作り替え＝**P1分岐路/P2秘密画面/P3狩り場・関門/P4ランドマーク の4格上げパターン**（配分≒4:3:2:1、正確値は⑤試作で測る）。マクロ構造＝村中心の同心円難度上昇。
- [x] **9-6-設計①.5 フィールド面白要素カタログ（ネタ帳）　🧠 Opus（ブレスト・ユーザー同席）：** 2026-07-05 ユーザー同席ブレストで4軸すべて一巡＝**`FIELD-FUN-CATALOG.md` に確定**。採用ネタ＝隠しa1-6/地形パズルb1-4（b3＝「フィールドはダンジョンの予告編」原則＝看板ギミックをフィールドで先にチラ見せ）/戦闘d1-6（d5ミニボス=noRespawn・d6敵誘導は⑤試作で手触り確認）/世界観NPC e1-7。**実コード検証で d9(ダッシュ無)・d11(滞在で湧くは不可)を却下**。**別Phase＝実装確定だが実装設計が別途要る（やらない候補ではない・ユーザー明言）：** 溶岩/毒沼ダメージ床（`handleTileEvent`+`takeDamage`で軽いと判明も 9-6 は新規コード無し方針で別Phase）・氷滑り（移動モデル改造）・旅NPC 3種（進行/時刻/場所で変わる語り部・敵として現れる・共闘）・砲台型の敵(d10)・弱点限定関門(d7)・賭けの老人。②テンプレの入力にする。
- [x] **9-6-設計②導線と分岐の設計（地域テンプレ設計）：** 2026-07-05 確定（`FIELD-9-6-DESIGN.md` §4）。**P1〜P4 格上げパターンの共通レシピ（4-1）× 9地域スキン(G/F/D/S/L/W/M/^/~) のテンプレ表（4-3）** を作成＝各セルが「実タイル＋ネタ id」の量産型。**b3予告編6ネタを攻略順(D1→D2→D3→D4→D6→D5→D8→D7)に沿って field 画面へ割り付け（4-4）**＝弓ゲート/爆弾壁/かがり火/笛reveal/石押し/はしご水渡り(9-4既存)。辺開口(col5,6/row4,5)噛み合わせは全パターン厳守。④テスト化への不変条件フック（接続シーム0・2軸以上・レイアウト重複0・予告編実在）を申し送り（4-5）。**残論点＝予告編の"道具所持タイミング"は⑤試作で 9-1 連鎖表と突き合わせ最終確定。**
- [x] **9-6-設計③地域ごとの性格（ギミック地形）：** 2026-07-05 実コード精査＋ユーザー裁定で確定（`FIELD-9-6-DESIGN.md` §3）。**地域差は (1)地形パズルの質＋(2)見た目スキン(`s`/`c`/`w`/`d`/`o`)＋(3)敵編成 の3つで出す（全て配線済み・Sonnet量産可能）。9-6 は新規ゲームコードを足さない。** 現状 field は bush64/breakable3/stone10/pit0/switch0 と隠し・地形パズル枠がほぼ未使用＝ここを埋めるのが実作業の中心。**移動感ギミックの扱い（論点3）＝2026-07-05 決着：** 実コード再精査で「溶岩/毒沼ダメージ床は軽い（`handleTileEvent`＋既存`takeDamage`）・氷滑りだけ重い」と判明したが、ユーザーが**「③全部別Phase＝9-6は配線済みのみで最速量産」を選択**＝溶岩/毒沼/氷滑りは3つとも別Phase送りで確定。
- [x] **9-6-設計⑤ 1地域試作で密度基準を確立：** 2026-07-06 完了（`FIELD-9-6-DESIGN.md` §8）。森27画面を理想形に作り替え（`migrate-field-forest.mjs`＝湖 作法＋自己検証①境界開口②内部BFS到達③穴の正当性④dupハッシュ）。**密度基準＝1画面2〜3対話要素・2軸以上・地域の顔パターン厚め（森=P1約50%）を実測。** **4-4予告編の道具所持タイミング決着＝森の正しい予告編はかがり火（`H`+torchesLit）であって爆弾壁ではない（爆弾はD6自身の報酬＝手前で開けられない）。爆弾/はしご予告編は「所持後の再訪近道」に格下げ。** under-2-axis 110→94・seam 91→89（森16素通り→0）・`field-invariants` BASELINE を締め・全ブラウザboot確認。
- [ ] **9-6-設計④外周110の作り替え＝「地域＋外周セット」1トラック（2026-07-07 ユーザー方針確定）：** 右端の全水域(`~`外周海84)・左上/外縁の全山(`^`外周山26)を実ステージに作り替える（B方針）。**🔑 ZONE_MAP は既に全320に地域ラベルを振っており、外周海`~`・外周山`^`はそれ自体が1地域（G/D と同列）＝「純粋な果て」は別枠でなく外周海/山の内側部分にすぎない（当初の2トラック案は誤り・ユーザー指摘で訂正）。** ∴ **1トラック＝全地域(外周海/山含む)を1地域ずつ「地域＋境界の噛み合わせ」で作り込む。** (a)進め方＝**必ず地域＋その外周セット**（外周だけ先行は不可＝地域を見ないと外周の作り方が決まらない・ユーザー確定）。最後に **W1=0/W2=0/seam=0/under-2-axis=0** で「全320がいずれかの地域としてプレイ可能」を機械検査（ユーザー確定の"最後のチェック"）。**⚠️ 残る未確定＝外周海の"歩ける渚"の密度（全画面に渚＋隠しか/一部は桟橋通路だけの軽い画面か）＝外周海1地域を⑤⑥同様に試作して実測後に確定。** 詳細 `FIELD-9-6-DESIGN.md` §10。⑥砂漠の `M`メサ断崖ミラーは境界の暫定の蓋として機能中。
- [ ] **9-6-⑥ 各画面を1枚ずつ丁寧に設計して作り込む（🧠 Opus 設計・⚡ Sonnet は確定データの流し込みのみ）：** **⚠️「量産」ではない（2026-07-06 ユーザー指摘・9-2 ダンジョンの PLAN:955 と同じ鉄則をフィールドにも適用）。** 各画面は「なぜこの画面が存在するか（設計①2軸以上）」を1枚ずつ考えて作る。テンプレ（§4）と密度基準（§8）・自己検証スクリプトは**設計の出発点と安全網であって、コピペのスタンプではない**（dup検出が同一配置を禁じる＝コピペは物理的に不可）。地域ごとに1本の migration スクリプトにまとめるのは接続不変を担保する"作法"であって、中身の各画面は手作業で意図を詰める。**⚡ Sonnet に回してよいのは、Opus が1枚ずつ決めた配置データの流し込み実装だけ。**
  - [x] **砂漠 D2 地域（14画面・2026-07-07・🧠 Opus）✅** `scripts/migrate-field-desert.mjs`。P2遺跡が顔（P2×6/P1×4/P3×2/P4×2）。**接続不変は森と真逆＝「隣をミラー」ルール**（砂漠は外周が全開の砂＝森の細バックボーンだと草原に新シームが開く。∴各外周セルは隣の対向セルが通行可なら床・不通なら`M`メサ＝断崖）。石押し予告編（`*`→`S`→`T`）を D2 入口 `2,15` 隣の `2,14` に配置（砂漠は D2 地域＝所持道具{剣/盾}のみ＝道具不要の予告編だけ可）。`!`爆弾壁は2枚だけ「再訪近道」（sealed niche＋看板ヒント・爆弾はD6報酬）。**under-2-axis 94→80（−14＝14画面全解消）・seam 89→88（ミラーが `2,14→2,13` シーム除去）・W1/W2/dup 不変**。`field-invariants` BASELINE 締め・全46関連テスト green・5画面ブラウザboot 0エラー確認。詳細 `FIELD-9-6-DESIGN.md` §9。
  - **▼ ⑥ 残り地域の確定作業順（番号順にこなせば 9-6 が完了する・選択の余地なし）。** 順序原則＝**攻略順（プレイヤーが道具を得て通る順）**に沿わせる（予告編は「到達時に所持済みの道具」で決まる§8-1＝攻略順に作れば道具依存が自動解決）＋**各地域は「その地域＋接する外周辺」を1セットで**（§10・外周だけ先行は不可）＋草原G(111)は攻略の節目で3ブロック分割。各タスク＝1 migrationスクリプト・完了条件は§8-5（接続緑＋該当不変条件が下がる＋BASELINE締め＋実ブラウザboot）。**各着手時に §4/§8/§9 と本リストを読む。**
    - [x] **⑥-1 森 F（27画面）✅**（2026-07-06・§8・`migrate-field-forest.mjs`）＝密度基準の試作も兼ねる。
    - [x] **⑥-2 砂漠 D（15画面）✅**（2026-07-07・§9・`migrate-field-desert.mjs`）＝ミラールールの確立も兼ねる。
    - [x] **⑥-3 草原G-A 村ハブ＋D1周辺＋南岸（31画面＝ハブ26＋海岸5・2026-07-09・🧠 Opus）✅** `scripts/migrate-field-grassland-a.mjs`。攻略の起点＝放射導線の交差点。**ハブの顔は P1 分岐路**（P1×11/P2×7/P3×5/P4×3＝26画面）＝森=P1迷路・砂漠=P2遺跡と違い「どっちへ行く?」の交差点。**接続不変は砂漠と同じ「隣をミラー」ルール**（草原も全開＝細バックボーンだと新シーム）。石押し予告編（`*`→`S`→`T`）を村 `7,14` 直下の `7,15` に配置（=**D1の石ボタン門の予告編**・道具不要＝ハブで今試せる／実データで D1 に `*→S→T` が1件あることを確認）。**茂み`u`秘密は剣で切れる＝ハブでも"今取れる"報酬**（combat.js:344）・`!`爆弾壁1枚だけ再訪近道（爆弾はD6報酬）。**⚠️ 村`7,14`・D1入口`6,13`は温存**（startPos/老賢者NPC/導線看板）。**🌊 接する南辺の海`~`5枚（`3,17`/`4,18`/`5,19`/`6,19`/`7,18`）を「地域＋外周セット」で歩ける渚に作り込んだ**（§10・当初ミラー封鎖で ⑥-11 に先送りしたのをユーザー指摘で是正）＝海`~`interior＋row1渚＋`v`桟橋＋隠し（bush/killAll宝）。**海岸は sea-interior builder＋`assertCoast`（開辺リング全接続・角セルは外部到達で免除・sea必須）で自己検証。W1 110→105・W2 110→105（海5枚が全不通/孤立→到達可能な渚に）・under-2-axis 80→63（ハブ17素通り全解消・海岸5枚は各3軸）。⚠️ seam は 88 不変**（ハブ8シームは温存した村/D1/D8/cave_1 の角セルに固定＝角は2交差を同時に満たせず除去不能＝砂漠の−1と違う構造的コスト・海岸は追加0）。dup 不変。`field-invariants` BASELINE を w105/w105/under63 に締め・全48関連テスト green・13画面ブラウザboot 0エラー＋3画面スクショ目視。詳細 `FIELD-9-6-DESIGN.md` §11。
    - [x] **⑥-外 外周一括撲滅パス（W1 105枚＝海79/山26・2026-07-10・🧠 Opus）✅** `scripts/migrate-field-outer-ring.mjs`。**⚠️ ユーザー主導の順序変更（当初の「地域＋外周セットで1地域ずつ」から先行して外周を一掃）。** 契機＝ユーザー2大原則の確定：**(1) 入った後に動けなくなるステージ禁止／(2) field 全画面 playable**。⑥-3 で村南の海 `3,17`→`3,18`（オール水）に踏み込める落とし穴を放置したのを指摘され、「地域ごとに外周を取り込む意図が汲めていない＝先に(2)を満たす（オール水/オール山を撲滅）→隣接地域の特徴で作り直す→その後(1)を網羅チェック」へ切替（ユーザー確定）。**W1 105枚を歩ける外周地域に一括作り替え**（隣をミラーの **AND版**＝角セルは全crossing通行可のときだけ開く＝角トラップ防止・`targetOpensCell`で1レベル再帰・内側リング row1/col1/row8/col10 で連結・世界の果ては最外縁1マスだけ壁＝engine がクランプ）。**W1 105→0・W2 105→0（原則2達成・reached 319/320＝残1は 9-2T 塔ワープ`8,1`）。** **新指標 `traps` を `field-quality.mjs` に追加**（原則1＝到達可能画面の開いた辺→着地が hard-blocked＝ソフトロック。旧 seam は行き先W1を除外して見逃していた）＝**146→97**（外周自身の追加 trap は機械確認で 0＝OUTER→OUTER=0。残97は本土内 or 本土→外周＝未リワークの ⑥-4〜⑥-9 が原因＝各地域リワークで落ちる）。BASELINE を w0/w2:0/traps97/under-2-axis168/dup7/seams97 に更新（under-2-axis 63→168・dup 3→7 は外周105枚が到達可能化したが未だ最小歩道のため＝⑥-10/⑥-11 content pass で下げる・回帰ではない）。全246テスト green・6画面ブラウザboot 0 pageerror＋**ユーザー報告 `3,17→3,18` を実際に歩いてソフトロック解消を確認**（スクショ目視）。詳細 `FIELD-9-6-DESIGN.md`（外周パス節）・PROGRESS 2026-07-10。**∴ ⑥-4以降は「接する外周辺」が既に playable＝各地域リワークは trap を本土側で潰す＋under-2-axis/dup を下げる作業に集中でき、外周海/山の content 化（旧⑥-10/⑥-11）は "最小歩道→意味のある画面" の格上げに変わった。**
    - [x] **⑥-4 草原G-B 中央〜東・湖ぎわ（50画面・2026-07-11・🧠 Opus）✅** `scripts/migrate-field-grassland-b.mjs`。row6-12・cols0-9＝⑥の最大ブロック（入口/NPC温存なし＝全50作り替え）。**顔は P1放射導線＋P3軽い狩り場**（P1×23/P2×11/P3×13/P4×3＝広い草原を横断しつつ軽く戦うテンポ）。接続不変は砂漠/ハブと同じ「隣をミラー」OR版（実測 OR 88 < AND 90 traps）。**予告編＝石押しS→Tブロックパズル関門2枚**（`3,8`縦押し/`6,9`横押し・道具不要・実ブラウザで両ゲート開通を関数検証。🔑ボタン先に壁Mで石を止める＝滑り抜けバグ回避）**＋ブーメラン隙間越し回収 `8,6`**（`R`床アイテムを水堀の小島に＝D3水越し回収の予告編・🔑`collectFieldItem`はr/R/K床アイテムのみ回収=chest不可）。**弓ゲート `7,9`**（Y→T・弓D3報酬=come-back近道・実ブラウザで矢が水越しにY点火→ゲート開通を検証）＋爆弾壁`6,11`come-back。**under-2-axis 168→146（G-B 50画面全解消）・seam 97→88・trap 97→88**（G-B発の残trap25件は機械確認で全て角セル=§11-1角限界・隣接未リワーク地域が原因=⑥-5以降で消える）・W1/W2/dup 不変。BASELINE を seam88/trap88/under146 に締め・全249テスト緑・19画面ブラウザboot 0エラー+石2/弓1関数検証。詳細 PROGRESS 2026-07-11。
    - [x] **⑥-5 草原G-C 北・火山/雪ぎわ（rows1-5 の35画面中33作り込み・2026-07-12・🧠 Opus）✅** `scripts/migrate-field-grassland-c.mjs`。北へ登る峠道＝D4火山`12,2`/D5雪`13,5`へ向かう草原。**温存2画面＝`8,1`塔ワープ島（mapEnters・§7-5論点1）＋`5,3`廃城/廃村遺跡（Phase 6-3の石碑2+ハートの器＝既に2軸以上＝塗り絵でない）。** 顔は P1放射導線+P3狩り場（P1×15/P2×9/P3×6/P4×3）。接続不変は「隣をミラー」**AND 固定点版**（ring cell open IFF ALL on-map crossings open・rebuilt 隣同士を rings.Map で相互参照し収束まで反復）。**⚠️ OR 版（初稿）は `7,1→8,1`/`9,1→8,1`/`8,2→8,1` の穴を生んだ＝G-C起因 trap 3件→AND 版で G-C 起因 holes=0 に是正。ユーザー指示＝「地域ごとのタスクで各地域の穴を根絶し、全地域完了後に ⑥-trap チェックが空になるはず」＝各リワークは自地域起因の穴を 0 にする責任を持つ。⚠️ 予告編の道具所持タイミングを §8-1 厳密ルールで PLAN注記から是正＝G-Cは D3後・D4手前＝所持`{剣・盾・ブーメラン・弓}`。∴ (a) 弓ゲート`11,3`（Y→T）は弓所持済み＝try-now（G-Bのcome-backから昇格）／(b) 石押し関門`6,4`（*→S→T・道具不要）＝try-now／(c) かがり火`10,2`（H+torchesLit）は come-back近道＝ロウソクはD4自身の報酬で手前で点けられない（PLAN旧注記"D4手前に置ける"は§8-1と矛盾＝是正）／(d) 爆弾壁`4,2` come-back。** **under-2-axis 146→125（G-C 21素通り全解消）・seam 88→74・trap 88→74**（AND 固定点で G-C 起因 holes=0・残る角セルは未リワーク隣接 F/^/S/L＋1外部 8,0→8,1 village K＝⑥-6以降で消える）・W1/W2/dup 不変。BASELINE を seam74/trap74/under125 に締め・全257テスト緑・14画面ブラウザboot 0エラー+石押し/弓の関数検証（gate 5,4/4,7開通）。**🔑 スクリプトに dead-gate 自己検証を追加**（links の T ゲートを閉じた状態でBFSし、宝が到達可能ならthrow＝G-A/G-Bの「宝が隣から丸見え」轍を機械化）＝`11,3` 弓ゲートの chest東側 open を実際に捕捉→壁化。詳細 `FIELD-9-6-DESIGN.md` §14・PROGRESS 2026-07-12。
    - [x] **⑥-6 湖 W（13画面作り込み・9,9 D3入口温存・2026-07-13・🧠 Opus）✅** `scripts/migrate-field-lake-w.mjs`。村の東・D3(`9,9`)へ渡る湖。顔は P1島渡り（P1×8/P2×3/P3×2）。**🔑 接続不変＝湖専用の「ハイブリッド」規則（草原の mirror-AND は不可）。** 草原の AND 固定点は湖↔湖シームを「両側が開いてないと開かない」＝両側とも水スタートなので**恒久 CLOSED 固定点**に落ちて全閉画面（`9,8`/`10,8`/`9,10`）を孤立させる（＝前回セッションの詰まりの真因）。→ **湖↔陸（温存`9,9`含む）＝ミラー（開→開/閉→veto）／湖↔湖＝標準セル(col5,6/row4,5)を骨格として開く＋OR伝播／角は水固定（§11-1）。** 内部デフォルト水なので開いた ring セルへ橋スパインを自動敷設。**seam 70→64・trap 70→64＝湖起因の seam/trap=0**（残10 trap は隣接未リワーク陸`M`/`t`が湖の開口に面する＝⑥-7以降で消える）・under-2-axis 125→124（`8,9`西ハブ解消）・W1/W2/dup 不変。**予告編（§8-1＝湖はD3前・所持`{剣・盾・ブーメラン}`）＝ブーメラン隙間越し回収 try-now**（`10,7` の水囲い `R` を橋`(2,5)`から2マス投げて回収＝collectFieldItem・**実ブラウザで回収成立を関数検証**）。はしご水渡り(`8,10` `x`+chest)＋茂み封じ(`11,8`)は所持外/再訪。全259テスト緑（lake 予告編2本追加）・湖2画面ブラウザboot 0エラー。旧9-4テスト（border全開 blanket）を trap-free ミラー条件に是正。詳細 `FIELD-9-6-DESIGN.md` §15・PROGRESS 2026-07-13。
    - [x] **⑥-7 山地/沼 M（14画面作り込み・10,14 D8＋9,15 cave_1 温存・2026-07-15・🧠 Opus）✅** `scripts/migrate-field-mountain-m.mjs`。D8沼入口`10,14`とcave_1`9,15`を抱える東の山麓。顔は P1 山の1本道/分岐（`M`山でmud床を刻む）+P3隘路の関門（P1×7/P2×3/P3×2/P4×2）。**🔑 接続不変＝湖のハイブリッドではなく草原の「隣をミラー AND 固定点」（§14-3）。** ⑥-6の申し送りは「M＝水スキン地域∴§15流用」としたが**実データはM＝床デフォルトの山地**（bgTile`w`泥・`M`山で刻む1本道＋局所`~`沼＝水一色の湖と違う）＝ミラーAND固定点が正しく、湖ハイブリッドを当てるとMを第2の湖にしてしまう（申し送りをデータで是正）。**予告編（§8-1＝M は村隣で開始時到達＝所持`{剣・盾}`のみ／D8/cave_1は攻略後半）：石押し1本道関門`10,13`（*→S→T・道具不要・try-now＝D8の石ゲート予告編）。** come-back＝笛reveal沼の祭壇`11,14`（flutePlayed封印B＝笛はD8**自身**の報酬∴再訪）・はしご水渡り`11,15`（`x`+chest＝はしごD5報酬）。ランドマーク＝沼に沈む廃村`8,17`（`#`/`o`+石碑・笛の伏線）。**seam 64→61・trap 64→61＝M起因の seam/trap=0**（残3件はM角セル§11-1＋温存D8柵`f`・未リワーク草原に面する＝⑥-8/⑥-9で消える）・**under-2-axis 124→114（14画面全解消）**・W1/W2/dup 不変。BASELINE を seam61/trap61/under114 に締め・全262テスト緑（`mountain-stone-gate.spec.js` 2本追加＝石ゲート開通の実ブラウザ関数検証＋M2画面0 pageerror boot）。詳細 `FIELD-9-6-DESIGN.md` §16。**接する外周（東/南の海`~`）は ⑥-外 の一括撲滅で既に playable＝ミラーで自動的に噛み合う（追加0）。**
    - [x] **⑥-8 雪 S（13画面作り込み・13,5 D5入口温存・2026-07-15・🧠 Opus）✅** `scripts/migrate-field-snow-s.mjs`。火山Lから海へ下るNE雪高地（cols10-14×rows3-7）。顔は石/迷路（P1×6/P2×4/P3×2/P4×1）。**🔑 接続不変＝草原/山地Mと同じ「ミラー AND 固定点」（§14-3/§16-1）＝雪は床デフォルト地域（bgTile`s`・`M`山で石/迷路を刻む＋局所`~`凍結池）＝湖ハイブリッド不要。** `migrate-field-mountain-m.mjs` をほぼ複製。**予告編（§8-1＝雪はD4後D5前・所持`{剣・盾・ブーメラン・弓・ロウソク}`）：石押し倉庫番`13,4`（道具不要・try-now）／弓ゲート`11,6`（弓所持済み・剣が届かない凍結堀越しに矢で`Y`・try-now）／かがり火`10,6`（ロウソク所持済み・try-now）。come-back＝はしご水渡り`11,7`（はしご=D5自身の報酬∴再訪）＝PLAN旧注記「はしごは予告編にせず石/迷路が顔」を§8-1で確定。** **🆕 9-6-P（パズルの歯ごたえ）初適用＝「1手で自明」を脱する2 showcase：石押し`13,4`は順序依存の2石倉庫番（`allSwitchesOn`で両ボタン同時ON要・石Aを先に押し出さないと石Bが閊えて詰む＝画面再入でリセット recover 可）／弓ゲート`11,6`は`Y`を堀+壁で囲み剣不能＝堀の東から左へ射るしかない射線限定。両者を実ブラウザで関数検証。** **seam 61→43・trap 61→43＝S起因の seam/trap=0**（残43は未リワーク火山L角＋角セル§11-1＝⑥-9で消える）・**under-2-axis 114→110（全13画面≥2軸）**・W1/W2/dup 不変。BASELINE を seam43/trap43/under110 に締め・全265テスト緑（`snow-stone-gate.spec.js` 3本追加）・S代表3画面ブラウザboot 0エラー。詳細 `FIELD-9-6-DESIGN.md` §17。**接する外周（東/南の海`~`）は ⑥-外 の一括撲滅で既に playable＝ミラーで自動的に噛み合う（追加0）。**
    - [x] **⑥-9 火山 L（7画面作り込み・12,2 D4入口温存・2026-07-15・🧠 Opus）✅** `scripts/migrate-field-volcano-l.mjs`。D4「炎の神殿」入口`12,2`を抱えるNE中央の火山高地（caldera=`12,0`頂上）。顔は溶岩足場（P1×2/P2×3/P3×1/P4×1）。**🔑 接続不変＝湖のハイブリッド（§15）ではなく草原/山地M/雪Sと同じ「ミラー AND 固定点」（§14-3/§16-1/§17-1）。** 全L画面は bgTile が `c`（灰）＝**床デフォルト**で、`~`溶岩は局所池/水路にすぎない（`~`は水と同じスキンだが接続クラスは"インテリアが床か水か"だけで決まる＝溶岩の見た目に釣られない §16-1）。`migrate-field-snow-s.mjs` をほぼ複製（floor moat＋mirror-AND＋BFS到達assert＋dup＋dead-gate＋arrival-hole guard＋islet guard）。**予告編（§8-1＝火山はD3後D4前・所持`{剣・盾・ブーメラン・弓}`）：try-now＝弓ゲート`12,1`（弓所持済み・溶岩堀越しに矢で`Y`＝9-6-P射線限定）／ブーメラン隙間越し回収`12,3`（ブーメラン所持済み・溶岩島の`R`大ルピーを投げて回収）。come-back＝かがり火`11,2`（ロウソクはD4自身の報酬∴入場時に灯せない＝G-C `10,2`と同型）・`!`爆弾壁`12,3`（爆弾D6報酬）。** **seam 43→35・trap 43→35＝L起因の seam/trap=0**（arrival-hole guard が throw せず＝機械保証。残35は温存ハブ`7,14`/`6,13`に面する角セル§11-1＝ハブ角の見直し時に消える）・**under-2-axis 110→108（全7画面≥2軸）**・W1/W2/dup 不変。BASELINE を seam35/trap35/under108 に締め・**全272テスト緑**（`volcano-gate.spec.js` 3本＋`lava-tile.spec.js` 4本追加）。**🔴 ユーザー指摘で溶岩を実タイル `l`（TILE.LAVA）として新規追加＝初稿は `~`(青い水)で溶岩を表現しようとしていたが `~` はどこでも青い水で描画される（設計ドキュメント§3の"溶岩スキン"前提が実コードで誤り）。LAVA はほぼ水と同挙動（徒歩不可・飛行越え・投擲物越え・arrival-wall）＋描画のみ赤橙（water形状＋新`lava`パレット）＝実ブラウザで`12,0`カルデラが赤橙描画を確認・接続指標不変。9-6「新規コード無し」方針のユーザー確定例外（溶岩ダメージ床は依然別Phase）。**🪜 2026-07-16 ユーザー判断で「溶岩ははしごで渡れない」に修正（水との唯一の挙動差＝熱くて渡れない直感・進行影響なし＝火山Lは恒久`v`橋で渡る／飛行での溶岩越えは残す＝着地不可で詰み防止）。** 詳細 `FIELD-9-6-DESIGN.md` §18。**接する外周（北/東の山`^`）は ⑥-外の一括撲滅で既に playable＝ミラーで自動的に噛み合う（追加0）。∴ 8地域（森/砂漠/草原G-A〜C/湖/山地M/雪S/火山L）＋外周撲滅の作り込み完了＝残るは ⑥-trap 横断確認・⑥-10/⑥-11 外周格上げ・9-6-P/9-6-N 仕上げ。**
    - [~] **⑥-10 外周山 ^（2026-07-16 に一度作り込んだが 2026-07-18 差し戻し・作り直し確定）** 🔄 `scripts/migrate-field-outer-mtn.mjs` は revert 済み。初稿は「茂み1個で丸見えの宝」「最弱番兵2体で宝箱」＝**under-2-axis 指標を機械的に消しただけで中身が空虚**とユーザー指摘（[[blade-no-mass-production]] 再犯）。→ **⑥-10/⑥-11 の"外周格上げ"という枠組み自体を廃止し、外周ゾーンを解体して隣接地域へ編入する方針に転換**（下記 9-6-BASE）。技術記録＝「内部 6×8 だけ彫れば seam/trap/W1/W2 は構造的に0のまま／dead-gate ガードで宝の封印を機械保証」は有効だったが、"何を彫るか"の設計が空虚だった。詳細 DECISIONS 2026-07-18〜19・`FIELD-BASELINE-BRAINSTORM.md`。
    - [ ] **⑥-11 外周海 ~（旧枠組み・廃止）** 🔄 外周海を「独立地域として作り込む」枠組みは廃止（⑥-10 と同根の失敗を避ける）。外周海84画面は下記 9-6-BASE で各隣接地域の海岸＋新地域「沈んだ古代都市/女王の海」＋純外洋の縮小、に再配分する。
    - [~] **9-6-BASE フィールド面白さベースライン再設計＋ゾーン再構成（2026-07-18〜 🧠 Opus＋ユーザー同席）** ⭐最優先。⑥-10 差し戻しを受けた抜本見直し。**確定済み（`FIELD-BASELINE-BRAINSTORM.md`・DECISIONS 2026-07-18〜19）：** ①ベースラインの粒度＝**地域(エリア)単位**（1画面合格基準は作らない＝指標ハックの轍・出入り接続は既存 field-invariants の別件）。②アイデア137候補を13カテゴリ(A〜M)で列挙・実現不可能を枝刈り・承認3バケツ（タイル/敵AI/NPC）で実現性を実コード監査。③**外周ゾーン(山26+海84=110)を解体し隣接地域の山麓/海岸へ編入**（外周はストーリー役割の無い"縁"＝地域として不成立）。④サイズ均し＝火山L 8→~17・森~35/雪~26/砂漠~24/湖~25・**山地/沼Mを「山地」と「沼/湿地」に2分割(各~25)**・G~124は3分割済据置。⑤**深洋(東端~25)を新地域「沈んだ古代都市＋女王が沈められた海の聖域」に**（其の二/三の舞台・中盤に橋/はしご到達・終章の解呪とは"跡地/記憶"として整合）。**✅完了済：** (1)新 ZONE_MAP 叩き台確定（`analyze-zone-rebalance.mjs`・2026-07-19）。(2)成立条件 v1 確定（3本柱＋密度目安＋アンチパターン・`FIELD-BASELINE-BRAINSTORM.md` 末尾・2026-07-19）。(3)3検査+METRICS.md 実装（`field-quality.mjs`/`generate-field-metrics.mjs`・2026-07-19）。**残作業：** (4)実 ZONE_MAP 書き換え計画（叩き台→実データ・seam/trap 不変手順）→ (5)地域ごと試作（**⚠️ 試作前にユーザーとディスカッション**）。
      - [~] **深洋O（沈んだ古代都市/女王の海・25画面）＝最初の試作地域。** ①エリア設計・②画面役割割り付け骨子・③各セクション設計方針 すべて確定（DESIGN §19-1〜19-10）。**④実装フェーズ 着手（2026-07-22）＝着手順「新規コード基盤を先に」（ユーザー確定）。** ✅ **潮ゲートタイル `TILE.TIDE_GATE`（`=`）完了**（廊下C1〜C4 の潮の満ち引き・GATE 機構流用でタイマー不要・7ファイル・`tide-gate.spec.js` 5本・全292緑・DESIGN §19-11）。**🔴→✅ 潮ゲートの実エンジン確認は 2026-07-25 に完了**（下記。当初は単体ロジックのみ＝ユーザー指摘 2026-07-22。実ゲームで links→toggleSwitch→openGates→再描画 のパイプ全体が繋がることを検証ステージ `test_mechanics/18,0` で裏取り済み）。
      - [x] **潮ゲートの実エンジン動作確認 完了（2026-07-25・🧠 Opus）✅** ライブマップ `test_mechanics/18,0`（`[tide_gate]`）に検証ステージを新設し、`tide-gate.spec.js` に実エンジン5本を追加（⑥閉のまま歩いても壁列 col5 を越えられない／⑦`Y`(3,3) を剣で叩くと `switchToggles` に入り links 経由で `openGates` に `4,5` が入り右半分へ渡れる／⑧見た目＝閉はセルに `water` クラス＋水スプライト・開は両方消える／⑨もう一度叩くと閉じ直して渡れない＝トグル／⑩はしご所持でも閉じた潮ゲートは渡れない）。**ジオメトリの要点＝`col5` を壁の一枚岩にして唯一の切れ目を潮ゲートにする（迂回不能）＋潮ゲートの左右 `4,4`/`4,6` は床＝「もしこのセルが水ならはしごの横橋が成立する」形にして⑩が vacuous pass にならないようにした。** 実ブラウザ目視＝エディタのワールドグリッドに `(18,0)` が出る／ステージ編集で潮ゲート・`Y`・宝箱・連動（ゲートID `4,5`／スイッチID `3,3`）が編集できる／ゲームで閉＝青緑の水・開＝床、0 pageerror。全336テスト緑。**∴ 潮ゲート実装は完了**（2026-07-22 のユーザー指摘「単体ロジックだけ＝実エンジン未確認」を解消）。
      - [x] **④＝19-11-D「敵の足元に水を敷けない」仕組み完了（2026-07-24・🧠 Opus）✅** 水を bgTiles 下地に置ける（`BG_TILES` に WATER 追加）・`isWaterAt(r,c)` 単一判定点。全304テスト緑。詳細 PROGRESS 2026-07-24・DESIGN §19-11-D。
      - [x] **0.5＝既存 tiles 水 → bgTiles 水 移行（水の単一ソース化）完了（2026-07-25・🧠 Opus・方向B＝移行＋アニメ化）✅** 全レイヤーの tiles `~` 5720セル（field/d3/d5/d7/d8）を tiles`.`(FLOOR)＋bgTiles`~` に移行し、水を bgTiles 単一ソースへ集約（tiles`~`=0/bgTiles`~`=5720）。**🔑 移行の隠れコストを2つ発見して両方対応：(1) tiles水は canvas obj-sprite の2フレーム波アニメ／bgTiles水は CSS background で静止だった → `redrawAnimSprites` に bgTiles 水セル（`ANIMATED_BG_SPRITES={water}`）の再描画を追加＝湖/海の波が移行後も動く（Step A）。(2) `connectivity.mjs`／`field-quality.mjs` は tiles 1文字だけで水/壁を判定＝移行後は水を床と誤認する偽の緑になる → `cellTile()`（tiles水 OR bgTiles水を`~`に畳む単一点）／`effectiveFlat()` を新設し、bfsLayer/orphan/firstWalkable/W1/similarity/dup/warp着地を全て経由＝実ゲーム isWaterAt と厳密一致（Step B）。** migrate は自己検証型（`migrate-water-to-bgtiles.mjs --dry`＝全レイヤー reachability〈walk＋ladder〉と field 全指標が移行前後で byte 一致を assert）。`connectivity-tool.spec.js`＋2本・`aquatic-enemy.spec.js`⑫（bgTiles水がアニメ対象）追加＋`field-terrain.spec.js` の湖 border 判定を effCellAt 化。**全307テスト緑（VRT 緑＝見た目不変）**・実ブラウザで field 9,8 湖（bgWater86セル・全て波背景）＋dungeon_5 堀を目視・0 pageerror。詳細 PROGRESS 2026-07-25・DESIGN §19-11-D。
      - [x] **④＝海棲雑魚②接近型 潜み鮫 `<`・③遠隔型 射水魚 `/` 完了（2026-07-25・🧠 Opus）✅** アーム7「海が敵」の残り2種（§19-8-A）。**②潜み鮫＝潜行↔浮上のリズム戦闘（ユーザー確定）＝`ENEMY_META.submerge{hiddenMs:2000,surfacedMs:1200}` 新設・潜行中は追跡だけ続き「無敵・攻撃なし・接触ダメージなし」・浮上1.2秒だけが殴れる窓（噛みつき sword range1.6）。無敵は `dealDamageToEnemy` 冒頭の1箇所で実現＝弓/ブーメラン/爆弾/ビーム全てに自動で効く（`meleeOnly` と同じ漏斗）。状態管理は `stunUntil` と同型の per-enemy 論理時間タイマー∴`step()` で決定論再現可。** **③射水魚＝`attack:{type:'waterShot',range:6,cooldown:2200,projectileSpeed:1.2}`＝`stone` と同じ任意角型（斜めに撃つ）。🔑 `projectile.js` 無改造＝`createProjEl` が `makeSprite(proj.type, proj.type)` を呼ぶ＝`ITEM_SPRITES.waterShot`＋`ITEM_PAL.waterShot` を足すだけで飛翔/衝突/盾ブロック/命中の全経路が既存のまま動く。** 実装11ファイル（tiles/enemies/sprites-enemies/sprites-items/tile-sprites/editor-palette/enemy-ai/combat/render-chars/board.css/game.js）＋`field-quality.mjs` の `_THREAT`/`ENEMY_TILES` に海棲3種（`&`/`<`/`/`）登録（未登録だと深洋25画面が「敵ゼロ」と誤読される）。`tests/sea-enemies.spec.js` 9本＋fixture 2種（`lurk_shark`/`archer_fish`）。**🔴 直後のユーザー指摘2件で設計修正（同日・同セッション）＝(1) 潜み鮫は近接だけでは「置物」＝`move:'water'` で陸に上がれない∴プレイヤーが岸から2マス離れると攻撃手段が皆無。ユーザー確定「距離が離れている時は遠隔攻撃、隣接してる時は噛みつき攻撃」＝`attacks:[]`（前例＝海蛇の sword+stone）で噛みつき（sword range1.6 cd800）＋遠隔「水刃」（`waterBlade` minRange1.6 range6 cd1800 speed1.4）。汎用フィールド `attack.minRange`（下限＝これより近いと出さない）を新設・`minRange` は噛みつきの `range` と同値にして「どちらも出ない隙間」を作らない。飛びかかり案はユーザーの穴指摘（「飛びかかった先が陸の時そのサメどうなるの？」＝陸に論理座標を置くと `enemyTilePassable(...,'water')` で身動き不能）で却下。水刃は新スプライト（8×8 2フレーム三日月・`ITEM_SPRITES/ITEM_PAL.waterBlade`）＋`projectile.js` に `atan2` の連続回転を追加（矢の4方向回転と別処理＝任意角の刃を進行方向へ向ける・射水魚の丸い水弾は役割が違うので流用しない）。(2) 敵スプライトが常に右向き＝新規2種に限らず全敵の既存バグ（`render-chars.js` の敵ループが `makeSprite` に `flipX` を渡していなかった）→ `ENEMY_META.sideView` の opt-in ＋反転条件 `player.x < e.x`（上下移動で左右が固まらないよう `e.dir` は使わない）。適用は2箇所＝生成（render-chars）と毎tick（`enemy-ai.js applySideFacing` が `canvas.dataset.flipX` を書き換え→`redrawAnimSprites` が次フレームで反映）＝片方だけだと「最初だけ正しい」or「再描画で戻る」。** テスト3本追加（⑩遠隔が飛ぶ・⑪minRange で隣接時は噛みつきに切替・⑫左右反転）＝sea-enemies 12本・**全321テスト緑**（318＋3・`--repeat-each=3` で 36/36・VRT 緑）。**⚠️ テストの教訓＝実ゲームループ（`setInterval(step,120)`）も `gameTime` を進める∴tick 数の検証は1回の `page.evaluate` 内で完結させる（await をまたぐと単体緑・ファイル内赤の flaky）。** 実ブラウザ目視＝潜行の半透明+波紋／浮上で実体化／鮫と魚がプレイヤー側を向く／青い三日月が上方向（`rotate(-90deg)`）へ飛ぶ／斜め水弾／エディタパレット3種／0 pageerror。詳細 PROGRESS 2026-07-25・DESIGN §19-11-A/B/C。
      - [x] **④＝海の主ミニボス `SEA_LORD('{')` ＋ 銀のブーメラン 完了（2026-07-26・🧠 Opus）✅** アーム7の最後の海棲＝デルタ最奥 `12,19` の聖域の門番（§19-9）。**既存8ボスと決定的に違うのは「倒す」のでなく「認められる」こと**（ユーザー確定4件・AskUserQuestion）。**①`ENEMY_META.yieldAt`（新設・0.25）＝HP 25% 以下で戦闘終了＝合格**＝`combat.js dealDamageToEnemy` のボス分岐に `shouldBossYield(e)` を1行足し、`killEnemy`（爆発→星の欠片）でなく新設 `boss.js onBossYielded` に分岐（ファンファーレ＋「よくやった、若き剣よ」→報酬→静かにフェードアウト退場・`defeatedBosses` に入れない）。**`yieldAt` を持たない既存8ボスは常に false ＝従来どおり HP0 まで戦う。** **②報酬＝データ駆動 `stageData.bossReward`（新設・`grantReward` 形の配列）**∴ `boss.js` は「何を配るか」を知らない（銀ブーメラン専用コードを持たない）。授与はフェードより**前**（主が消えるのを待たせると何を貰ったか数秒わからない）。**③銀のブーメラン＝ティア方式**（`BOOMERANG_TIERS`＝wood atk3/speed2.0/range3 → silver atk6/**speed5.0**/range6・`player.boomerangTier`・`equipBoomerangTier` は下位ティアを無視）＝`ITEM_META` に別アイテムを足さずサブアイテム枠は1つのまま・表示名だけ `subItemDisplayName()` でティアから引く（`boomerangStep` は `proj.maxRange`/`proj.speed` 参照済み＝飛翔ロジック無改造）。セーブ後方互換＝`sanitizeLoadedPlayer` で `boomerangTier == null` → `subItems.boomerang ? 0 : -1`。**④両生 `move:'amphibious'`＋`moveSpeed:{water:1.0,land:0.5}`＝19-11-A で「定義だけの dead data」と申し送った `moveSpeed` をここで実装**＝`enemy-ai.js resolveEnemySpeed(e, meta)` を新設し `meta.speed` 直読み3箇所を差し替え。**🔑 基準は `meta.speed` でなく `e.speed`**（`checkBossPhase` が `boss.speed` を書き込む∴meta 基準にするとフェーズ加速が消える）。**`dropsTriforce`／`isFinalBoss` は持たない＝`countTriforces(MAP)` は 8 のまま**・`check-dungeon-integrity.mjs` は `ALL_BOSS_TILES` にのみ `{` を追加（`TRIFORCE_BOSS_TILES` には入れない）。**⚠️ `shared/tile-sprites.js` とエディタ「敵」パレットには意図的に登録しない＝2×2 ボスの既存慣例**（既存8ボスも両方に無い）。**全362テスト緑**（336＋`sea-lord-boss.spec.js` 15＋`boomerang-tiers.spec.js` 11・VRT 緑）＋検証ステージ `test_mechanics/19,0`（`[sea_lord]`・右半分 bgTiles 水＝同じ1体で水と陸の速度を比べられる）。**🔴 同日ユーザーの実プレイで「普通に HP0 で倒せる」が発覚→修正済み**＝`onBossYielded` が async ∴合格演出中も攻撃が届き、`_yielded` ガードで false を返す2発目以降が末尾の `if (e.hp <= 0) killEnemy(e)` に落ちていた（8ダメージ×12発で hp48→0）。修正＝`dealDamageToEnemy` 冒頭で `e._yielded` を弾く（`submerged` と同じ漏斗＝全攻撃種に効く）＋yieldAt ボスの HP に床 `ceil(maxHp*yieldAt)` を張る（一撃で飛び越えると HP バーが空＝見た目は撃破）。テスト⑨b（小ダメージ30連打）／⑨c（即死級の一撃）を追加＝修正前は2本とも赤。**🔴 同日ユーザー指摘②「銀ブーメランもっと速くてよさそう」→ 銀 speed 3.0→5.0（20.8セル/秒＝弓矢 18.8 より速い・木は不変・ユーザー確定）。** 高速化には当たり判定の補間が必須＝1tick 2.5セルは敵のヒットボックス 0.6セルを飛び越える∴`boomerangStep` を 0.4セル刻みのサブステップに分割し通過セルの回収を `collectAlongBoomerang()` に抽出。**⚠️ 分割するのは「進む・当たる・拾う」だけ＝「折り返す・キャッチする」の判定は tick 境界のまま**（サブステップ判定にすると木の折り返しが tick4→3・実到達 8.5→7.5＝木の射程が黙って1セル縮む）／**座標は `+=` で累積せず「tick 冒頭＋進捗率×step」で再計算**（累積すると 7.49999… で `toTileCol` が1つ手前を返し鍵を拾えない＝既存の運搬テスト3本が赤くなって発覚）。テスト⑤b（1tick で飛び越える位置の敵に当たる）／⑤c（1tick の通過セル2つを両方拾う）を追加＝修正前は赤。**⚠️ ハマり2件＝(1) ブーメランの実到達距離は `maxRange` より約1.5セル長い**（発射位置 +0.5＋折り返し判定が移動前の距離）∴射程差テストの境界は 7 セル。**(2) `dealDamage` は `dmg - def` を通す**∴`maxHp*0.76` では def4 が引かれて残 31% ＝閾値に届かない（0.9 を渡して残 18.75%）。**部品のみ＝`12,19` への配置は下記 25画面配置で行う。** 詳細 PROGRESS 2026-07-26・DESIGN §19-11-A/-B/-C。
      - [x] **④＝25画面配置のうち アーム7（入口・海の戦闘）7画面 完了（2026-07-27・🧠 Opus・ユーザー確定4件）✅** `scripts/migrate-field-arm-o.mjs`（自己検証型）。本道 `15,8` E0 →`15,9` E1 →`15,10` E2 →`15,11` E3 ＋脇道 `14,9` A1／`14,10` A2／`14,11` A3。**スコープはユーザー確定＝25画面を1セッションで塗らず「1画面ずつ設計して作り込む」**（[[blade-no-mass-production]]）。**🔑 深洋O の作法は湖W と決定的に違う＝「歩ける」を作るのは bgTiles の水を消すこと**（水は bgTiles 単一ソース・`isWaterAt` はどちらかの層が `~` なら水∴bg 水の上に tiles `v` を書いても**渡れない橋**になる＝湖Wの `v` 橋パターンは流用不可）。∴ spec は「bg を陸（`o`/`d`）にするセル」を列挙し、tiles には内容物だけ書く。リングは lake-hybrid（§15-1）で固定点計算＝手書き禁止（spec にリングセルを書くと throw）。**🔴 角セルは「クラスタ単位」で判定（最大のハマり）＝湖Wの「角は常に水」をコピーしたら seams/traps が 0→8**（O の隣接は塗り絵で角が開いた陸∴角を水にするとトラップの発生源が隣画面側になり自画面の検査では出ない）→1つの格子角を共有する最大4画面の角セルを BFS でクラスタ化し「クラスタ外の全隣接が開いている時だけ全部開ける」＋双方向（out/in）の着地壁ガードを追加。**地面スキン＝石畳 `o` ベース＋渚は砂 `d`（ユーザー確定）＝アーム7 の7画面だけ塗った**（残18画面のスキンだけ先に塗るのは塗り絵∴各画面の作り込みと同時に塗る）。**難易度カーブ（§19-8-A）は battleScore で裏取り＝E0 2.93→E1 8.29→E2 10.01→E3 10.96**（脇道 A1 4.26／A2 4.59／A3 4.33）。初稿は E2 9.94 > E3 9.27 ＝設計と逆だったので E3 に魚群と射水魚を各1体追加（宝箱の足場を挟む十字砲火）して逆転＝**設計意図は指標で確認するまで達成していない**。**🔴 先に指標のバグを修正＝`field-quality.mjs effectiveFlat()` が bgTiles 水を無条件に `~` へ畳んでいた∴水上の敵が全指標から消える**（アーム7 全画面が「敵ゼロ」と読まれる）→畳むのは元の tiles が空の時だけ（`_BG_WATER_FOLDABLE`）＝既存データでは挙動不変。**🔑 ランドマークは「指標で立つ」だけでなく「実画面で見える」こと**＝E2 のランドマークを `o`（石畳）で立てたが画面の bg スキンも `o` ∴実ブラウザで周りと見分けが付かず→`h`（家の外壁＝廃都の立ち壁・`LANDMARK_TILES` に含まれる）に変更。**結果＝7画面すべて2軸以上・under-2-axis 108→101**（BASELINE も締めた）・seams/traps/W1/W2 は 0 のまま・dup 7・reached 319 不変。深洋O の密度＝戦闘 0→7・一回性 0→3・アンカー 0→3（パズルは 1＝残18画面の潮ゲート4枚で満たす）。**`tests/field-arm-o.spec.js` 10本＋全372テスト緑**（`sea-enemies.spec.js`⑨/`aquatic-enemy.spec.js`⑤の「未配置」テストを「アーム7に配置済み・かつ必ず bgTiles 水の上」へ差し替え）。**⚠️ テストの教訓＝魚群 `&` は最初の tick で泳ぐ∴座標一致で spawn を検証すると必ず赤になる**（正常動作）→「種類ごとの体数」＋`move==='water'` で見る。実ブラウザ7画面＝0 pageerror・水/渚/石畳/敵/宝箱/爆弾壁/石碑すべて描画。詳細 PROGRESS 2026-07-27・DESIGN §19-11-E。
      - [x] **④＝25画面配置のうち 廊下C1〜C4（4画面）＋深洋O 西外周の封鎖 完了（2026-07-27・🧠 Opus・ユーザー確定4件）✅** `scripts/migrate-field-corridor-o.mjs`（自己検証型）。**①パズルは1画面1テーマで4段階に難化（ユーザー確定）＝C1 `15,12` 潮の教（`Y` を叩けば潮が引く）→C2 `15,13` 石でモーメンタリ `S` を保持→C3 `15,14` 順序依存（保持を2つ直列）→C4 `15,15` 複合（石で前半・`Y` で後半＝潮ゲート2枚の直列）。各画面は自己完結・戦闘ゼロ**（§19-8-B「渡る技術」専用＝パズル/戦闘分離）。**②報酬（ユーザー確定）＝C1 ルピー×20／C2 回復薬（小）／C3 ルピー×30／C4 は物でなく海の石碑**（デルタ導入のロア）＝進行アイテムは置かない。**③封鎖（ユーザー確定＝両方）＝`14,12`〜`14,15` の col14 面＋デルタ西面（`13,16`/`12,17`/`11,18`/`10,19`）＝16画面 248セル**（O側 bgTiles 水／外側 `M`）＝**廊下が唯一の道**（`15,11`→C1→C2→C3→C4→デルタ）かつ**聖域 `11,19` は北 `11,18` も西 `10,19` も閉じて `12,19`（海の主）経由だけ**。封鎖セルは手書きせず「内側↔外側の crossing を全部閉じ、片側だけ壁のセルを固定点まで伝播」で計算＝**arrival-wall を1つも残さない**。**🔑 潮ゲートを「本当に解かないと通れない」形にする3つの罠を実コードから逆算＝(1) `tilePassable` は `TIDE_GATE` の `openGates` 判定より前に `isWaterAt` で弾く∴ゲートセルの bgTiles は必ず陸（bg 水の上に置くと永久に不通）／(2) `isLadderBridge` が幅1の水を橋にする∴ゲート脇に幅1の水路を残すと**はしごで迂回**される→ゲートは2セル幅×2行の1枚・周囲の海は必ず2セル以上／(3) `Y`(SWITCH) は阻止規則が無く**歩ける**・`S`(BUTTON) はモーメンタリ∴自分が乗ったままでは渡れない＝石で保持するのが C2 以降の芯。`showConditions` の `switchOn` は `switchStates`（＝`S` のみ）を見る∴**`Y` に封印宝箱を紐づけると永久に開かない看板になる**（C1 の宝は封印なし＝「渡れた者だけが届く」で守る）。** **🔑 パズルの正しさは静的 BFS では保証できない∴migrate に「(プレイヤー位置 × 石の位置集合)」を状態とする全探索ソルバーを積み、各画面で ①解ける ②詰み状態0 ③解かずに南出口へ到達できない を assert**（C1 100 状態／C2 546／C3 1778／C4 363）。**これが初稿のバグを実際に見つけた**＝C3 は石Bの上へ回り込む唯一の道が row2 で、通ると B が右へ押し出されて永久にレーンから外れた（静的 BFS では全部緑）→回り込みを row1 に移し B の右を水にして横押しを封じ、降り道 col7 を追加。**🔴 指標の穴を2つ先に塞いだ（どちらも「この変更を実際より良く見せる」向き）＝(a) under-2-axis の母集団が strict walk だった∴潮ゲートの奥17画面が母集団から落ちて中身ゼロのまま 101→83 に「改善」した（＝ゲートを置くと未完成画面が隠れる）→母集団を `reachedWithGates`（320）に変更／(b) dup の ratchet が「群の数」だった∴塗り絵の隣接画面の外周に壁を1枚足すと 37画面の群が割れて 7→13 群＝実際の重複は 64→59 と減っているのに悪化と出た→`duplicateLayoutScreenCount`（画面数）に変更。** **結果＝4画面すべて2軸以上・under-2-axis 101→97・dup screens 64→59・seams/traps/W1/W2 は 0 のまま**（BASELINE も締めた）。**`tests/field-corridor-o.spec.js` 9本＋全391テスト緑**（372＋9＋lib 10）。**⚠️ テストの教訓3件＝(1) `MOVE_STEP=0.5` の半セル移動＝`movePlayer` 1回では1タイル進まない∴`handleTileEvent`（ボタン踏み）が発火せず `swordAttack` は1タイル先を狙う→「1タイル=2回」に統一し斬るときは1タイル手前から歩き込む／(2) `ps_ladder` はプレビュー URL に必須＝付け忘れると実プレイより弱い条件で検証する（`14,15` col7 に幅1水路を通す変異が最初は緑だった）→`ps_ladder` を足し直線歩行をバックトラック付き DFS に替えて赤にした／(3) 看板は1行ずつページ送り∴`#dialog-text` を1回読むと必ず失敗する。** 実ブラウザ4画面＝0 pageerror・閉じた潮ゲートが水色ブロックで描画され潮引きで消える／石がボタン上で緑に光る／宝箱・`h`・石碑すべて描画。詳細 PROGRESS 2026-07-27・DESIGN §19-11-F。
      - [ ] **25画面配置の残り 14画面（デルタ）＝1画面ずつ作り込む（🧠 Opus）＝実行キュー 3番**（順序は本ファイル冒頭の「🎯 実行キュー」が唯一の定義＝ここに「次はこれ」と書かない）。未配置の新規部品＝**海の主 `{`（デルタ最奥 `12,19`＝`isBossRoom`＋`bossReward` を本編画面で通す）**＝**実ブラウザ目視**まで。ゾーン分け＝上半＝廃墟の回路パズル／下半＝痕跡ロア探索（§19-8-C）・石碑2枚（海の石碑A `12,18`／B `15,18`）・隠し報酬 `15,19`。**⚠️ 封鎖の計算（`computeSeal`）は「O の `sy>=12`」を内側として固定点を取る∴デルタの境界を触るときは再計算が必要（手で壁を足さない）。**
        **⚠️ ⑥-footprint の作法＝「開いた継ぎ目は境界行/列 と 1つ内側 の両方を空ける」。** 石 `*`・スイッチ `Y`・看板 `i`・家壁 `h` を**継ぎ目の1つ内側に置かない**（置くとその列/行の遷移が無言でキャンセルされる＝見た目に手がかりが無い最悪のバグ）。migrate の `assertNoFootprintWall` が throw するので設計段階から内側1行を通路として空けておく。`field-corridor-o.spec.js` の **⑥-footprint** テストはデルタ側の連鎖（`15,15`→`15,16`）も歩くので、デルタの北の継ぎ目を変えたらこのテストも通ること。
    - [x] **⑥-warp 笛/テレポート系ワープの着地点が「詰み」でないかを検査＋修正（🧠 Opus・2026-07-16 完了）✅** (A) `secret_grotto/0,0` 笛ワープの着地を `field 2,0 (4,4)=M`（山砦の中央）→ **(8,6)=床**（南出口ギャップ直上・外周リング接続・非辺セル）に是正。(B) 再発防止＝`field-quality.mjs` に `warpEnterLandings()` を新設（全 `fluteEffect:warp` ＋全 `mapEnters destId` テレポート着地を `buildExitRegistry`/`playFlute` と同じ解決で辿り、arrival が hard-blocked＝spawn即詰みを列挙／SKY・WATER・LAVA 着地は飛行維持で生存扱いに除外）＋`field-invariants.spec.js` に warp-landing テスト追加。**既知の scope 外 2件は allow-list で温存（回帰したら赤）＝`field/8,1 fieldToTower→8,0(3,2)=M`（9-2T 空島復元 bug①・塔は現状到達不能）／`dungeon_7/1,3 field_dungeon7 unresolved`（9-2i D7 戻り口の field 側受け未配線・D7 は笛ワープ入場なので戻り旅程のみ影響）。** flute.spec.js の warp 往復テストを強化＝着地(6,8)＋西移動で「動ける（壁に埋まっていない）」を実エンジン検証。**全273テスト緑**（+1）。**症状（原文）：** `secret_grotto/0,0` で笛を吹くと `fluteEffect:{type:'warp', layer:'field', stage:'2,0', row:4, col:4}` で `field 2,0` の (4,4) に着地するが、そこは `M`（山ブロックの中央）＝**身動きが取れず詰む**。**根因＝ワープ着地はチェッカーの盲点：** ① `connectivity.mjs` は `mapEnters`（`destId` テレポート）だけ追い、**`fluteEffect` warp を一切追跡していない**（grep 確認＝checker に flute/warp 参照なし）。② `traps` 指標は「開いた辺→着地が壁」＝辺遷移の話で、**笛ワープの着地点は辺遷移でない**ので対象外。③ ∴ ワープ着地の妥当性を検証する仕組みがどこにも無い（9-2T「塔ワープ発射元消滅」と同じ"ワープ系は盲点"パターンの再発）。**実データ＝現状 fluteEffect warp は全ゲームでこの1件のみ**（`secret_grotto/0,0`）、かつ着地 (4,4)=`M`＝この1件が壊れている。**やること：** (A) この着地点を歩けるセルに是正（`field 2,0` は外周撲滅で「歩ける外周リング＋内部は山砦」化された画面＝着地点を外周リングの床セルに変える／or `secret_grotto` の warp 先 row/col を歩けるセルに変える／or 2,0 の着地点セルを床化して周囲と連結。どれが接続不変を壊さないか実測して選ぶ）。(B) **再発防止＝全 `fluteEffect`（warp/reveal 問わず）＋MAP_ENTER 着地点が hard-blocked でないかを機械検査するテストを追加**（`field-quality.mjs` に warp-landing 検査を足すか、専用 spec）。**⚠️ MAP_ENTER の着地（`row`/`col` or 既定 (1,1)）も同種の盲点＝ついでに全 mapEnters 着地点も検査対象にする。** 完了条件＝実ブラウザで笛→着地→4方向移動できることを確認＋warp/enter 着地検査テスト緑。詳細は着手時に DECISIONS へ。
    - [x] **⑥-trap 全マップ「壁に辺が開いている」根絶チェック＋修正（全地域完了後の最終確認・🧠 Opus・2026-07-16 完了）✅** `scripts/migrate-field-trap-corners.mjs`。**全320画面を横断し、残っていた arrival-wall（到達可能画面の開いた辺→着地セルが徒歩不可の壁）を機械的に全列挙→根絶。残 35 traps（== 35 seams）は全て §11-1 の CORNER RESIDUAL＝到達画面の空き角セル`.`が地域境界の隣接画面の壁角（森`t`/山`M`/湖`~`/D8柵`f`）に開いていた（角セルは2つの隣接に同時に答えるので、リワーク時に片方がまだ塗り絵だと解決できず最後に残る）。全隣接が完成した今、地域境界を跨ぐ mirror-AND 固定点で解消：開いた source 角を面する壁に合わせて壁化（54 空き角・`t`/`M`はそのまま・`~`/`f`→`M`）。例外＝温存 D6 入口`2,4`（設計された上部通路）は隣の平地森`2,3`の row9 cols4,7 を`.`に開いてミラー。**結果 seams 43→0・traps 43→0＝両方 GOAL 0 達成**（`field-invariants` の BASELINE を seams:0/traps:0 のハード 0 に締めた）・reached 319 不変（角は装飾ボーダー＝非 load-bearing を BFS で確認）・W1/W2/dup/under-2-axis 不変。**全276テスト緑**（`trap-corners.spec.js` 2本追加＝①D6 approach `2,4`→`2,3` 縦通路が実エンジンで正常遷移②壁化した旧トラップ角 `7,8` 右下が遷移せず留まる＝arrival-wall 消滅の実証）。スクリプトは traps を再計算して mirror-AND を固定点まで反復し 0 を assert する自己検証型。詳細 PROGRESS 2026-07-16。
    - [x] **🔴🔴 ⑥-footprint 着地判定を「エンジンと同じ 2×2 footprint」に揃える＝全72件の見えない壁を根絶（🧠 Opus・2026-07-27 ユーザー実プレイで発覚）** — **2026-07-28 完了（深洋O ぶん 5件を 0 に・検査は全マップに常設）**

      **結果：** 検査を単一点化（`arrivalFootprintBlocked` / `footprintBlockedEdges`）＋ ratchet 常設。深洋O の 5件を実データで解消 → **`footprintBlocked` 71 → 67**。他指標は不変（`seams 0 / traps 0 / W1 0 / W2 0 / reached 302 / gates-open 320`）。テスト **398 passed**。
      直した 5件（＝ユーザーが実プレイで踏んだ領域）：
      - `15,11→15,12 @0,9='Y'` … C1 のトグルを row1→**row2** へ
      - `15,12→15,11 @9,9='i'` … アーム E3 の石碑を南岸 row8 から報酬段へ退避
      - `15,13→15,14 @0,5='*'` … C3 の押しレーンを row1→**row2** へ下げ、row1 を回り込み通路に
      - `15,14→15,15 @0,5='*'` … C4 も同様
      - C2 … 石を row0 へ押せてしまう形を封鎖（**最上段の石は押し戻せない＝継ぎ目を恒久的に塞ぐ**）
      **残り 67件は全部が未リワークの外周の塗り絵**（`M`／`~`）＝**9-6-BASE の外周解体＋隣接地域への編入**で落とす（⑥-10/⑥-11 の"外周格上げ"枠組みは廃止済み）。`dungeon_7 3,2→3,3 @0,6='x'` は `connectivity-tool.spec.js` の `FOOTPRINT_BASELINE` で別途固定。
      ⚠️ **設計ドキュメント側の座標表記に注意：** 以下の分析文は着地セルを `1,5` / `1,9` / `8,9` と書いているが、`footprintBlockedEdges` が報告するのは footprint の**先頭セル**（`0,5` / `0,9` / `9,9`）。指す穴は同じ（`0,5` と `1,5` は同じ2セル footprint の両端）。

      **症状（ユーザー原文）：** 「`15,13` から下に移動したら `15,14` にいけるかと思ったんだけど、なぜかはじかれた。」

      **根因＝辺遷移の着地座標が「境界の行」ではなく「1行内側」で、しかも上下・左右で非対称。** `game/game.js:1144-1147`：

      ```js
      if (y < 0)          { newRow = rows - 1.5; }  // 上入り → y=8.5 → toTileRow=9（辺の行）
      else if (y >= rows) { newRow = 0.5;        }  // 下入り → y=0.5 → toTileRow=1（1行内側）
      else if (x < 0)     { newCol = cols - 1.5; }  // 左入り → x=10.5 → col11
      else if (x >= cols) { newCol = 0.5;        }  // 右入り → x=0.5  → col1
      ```

      プレイヤーの当たり箱は1セル分（`isPassable`/`arrivalIsWall` はどちらも `floor(v)`〜`floor(v+0.999)` の **2×2 footprint**）∴下入りは **row0 と row1 の両方**を占める。`arrivalIsWall`（`game/game.js:1100`）が row1 の石 `*` を `ARRIVAL_WALL_TILES` と判定 → 遷移キャンセル＋押し戻し＝**「石が最上段でないのに弾かれる」**。連続座標では対称（境界から 0.5 内側）だが**論理タイルは非対称**。初版コミット `e9a9ece` からこの形。

      **∴ 実装が要求している不文律＝「開いた辺の交差セルは、境界から2行/2列ぶん空けておく」。** 誰も文書化しておらず、**3つの検査すべてがこれを見ていない**：
      - `scripts/lib/connectivity.mjs cross()` … 着地 **1セルだけ** `isHardBlocked`（`arrival = cellTile(dest, r, c)`）＝エンジンの footprint を模していない
      - `scripts/lib/field-quality.mjs` の `traps`（`reason==='arrival-wall'` を数える）… 上と同じ1セル判定に乗っている∴**traps 0 は「footprint で弾かれる辺が無い」ことを意味しない**
      - migrate 各種の封鎖/着地ガード … 同じ1セル判定
      - `tests/field-corridor-o.spec.js` … プレビュー URL で各画面へ直接入る＝**辺跨ぎの入場を1回も踏んでいない**

      **実測（engine 準拠の footprint で全レイヤー走査・出口側が壁のケースと1セル判定でも壁のケースは除外）＝72件**：
      - **field 71件**。廊下4件＝`15,13→15,14 @1,5='*'`／`15,14→15,15 @1,5='*'`（石が入口レーン col5 を塞ぐ）・`15,11→15,12 @1,9='Y'`（C1 のトグル）・`15,12→15,11 @8,9='i'`（アーム E3 の石碑）。他は既存の塗り絵外周が主（`0,14→0,15 @1,0='M'` 系が多数）・`14,9↔14,10` は bg 水。
      - **dungeon_7 1件**＝`3,2→3,3 @1,6='x'`。
      - **∴ 廊下だけの設計ミスではなく、フィールド全体に前からある同クラスのバグ**（「seams/traps 0」の報告はこの軸を含んでいなかった）。

      **やったこと（この順で・順序に意味があった）：**
      1. ✅ **検査をエンジンに揃える（先にこれ。無いと直しても再発を検知できない）。** 単一点 `arrivalFootprintBlocked(destStage, nRow, nCol)` を `connectivity.mjs` に新設し（`game.js arrivalIsWall` の写し＝`effArrivalTile` の畳み込み・`ARRIVAL_WALL_TILES`・はしご橋の例外まで含める）、`cross()` と `field-quality.mjs` の traps 集計を**両方**そこへ通す。**⚠️ 1セル判定を消すのでなく footprint に置き換える**（1セル版が拾っていたケースは footprint の部分集合）。テスト＝`connectivity-tool.spec.js` に「row1 に石を置いた合成ステージへ下から入れない」を追加＝**修正前は緑になる（＝穴が実在した）ことを確認してから**入れる。
      2. ✅ **新 ratchet を張る。** `field-invariants.spec.js` に `footprintBlocked` の件数を BASELINE 72 で追加（seams/traps と同じ ratchet 方式）。**⚠️ 数字を 0 と書いて全部直すまで赤にしない**（他の 9-6 作業と区別できなくなる）。→ 実測は 71（field ぶん）で張り、修正後 **67 へ締めた**。
      3. ✅ **廊下4件を 0 に。** `15,14`/`15,15` の石 `*` を `1,5`→`1,4` へ（footprint cols5-6/6-7 の外・押し回数 3→2）**か** 石と `S` を row1→row2 へ下げる。C1 の `Y`（`1,9`）とアーム E3 の石碑（`8,9`）も交差レーンの外へ。**どの案でも migrate の状態空間ソルバーを再実行して「解ける／詰み0／迂回不能」を再確認する**（`scripts/migrate-field-corridor-o.mjs`）。
      4. ✅ **回帰テストを実エンジンで。** `field-corridor-o.spec.js` に **⑥-footprint** を追加（`15,11`〜`15,16` の連鎖の全開口を**南北両方向**歩いて `stageKey` が実際に変わるのを確認）＝**辺跨ぎを踏むテストが1本も無かったのが今回の見落ちの直接原因**。
         - ⚠️ 候補の継ぎ目は **旧1セル判定**だけで選ぶ。新 footprint チェッカーで絞ると「チェッカーが OK と言う辺は通れる」の循環になり、チェッカー自身の見落としを検出できない。
         - ⚠️ 開始位置は継ぎ目セル**自身**。1つ内側から歩き出すと、内側に来る潮ゲート帯（C3/C4 の row7-8）で止まったのを「見えない壁」と誤報する。
         - 変異テストで有効性を確認済み：`15,15` の `1,5` に石を仕込むと**この1本だけが赤くなる**。
      5. ✅ **残り 67件は 2026-07-29 の ⑥-landing（整数着地）で一括 0 になった**（データ側の段階的な手当ては不要になった＝原因をエンジンで消したため）。`FOOTPRINT_BASELINE` は全層 0 に締め済み。
         **⚠️ 外周を触る migrate は「境界行/列 と 1つ内側」の両方を空けること**（`footprintBlockedEdges` の ratchet が守るが、設計時点で意識していないと毎回ここで詰まる）。

      **⚠️ 代替案「エンジンの着地座標を整数にする（下入りも `newRow = 0`）」は 2026-07-28 に実測した（当初の却下理由は誤り）。** 却下理由に書いていた「320画面＋全ダンジョンの既存レイアウトが `0.5` 着地を前提に通っている」は**測っていない主張だった**。実際にエンジンを整数着地に差し替えて計測すると **`footprintBlocked` 68 → 0・全 398テスト緑**＝既存レイアウトは半セル着地に依存していない。ただし**別の実害が出る**ので単独では入れられない → 下の **⑥-landing** に分離した。

    - [x] **✅ ⑥-landing 辺遷移の着地を整数セルにする＋「閉じた門セルへの着地は拒否」をセットで入れる（🧠 Opus・2026-07-28 ユーザー指摘で実測 → 2026-07-29 実装完了）**

      **ユーザー指摘（原文）：** 「相変わらず、上から1.5セルの位置にいますね。これでいいんですか？これだと row=1 のところに侵入できない壁があったらおかしなことになりませんか？この条件の場合に上から1セルの位置にいるようにするのはできないのでしょうか？」
      **∴ 指摘が正しい。** ⑥-footprint は「見えない壁」を**データ側で回避**したが、原因（半セル着地で当たり箱が2行に跨る）はエンジンに残っている。データを直し続ける限り、外周 67件も今後の新画面も同じ罠を踏み続ける。

      **実測（2026-07-28・`game.js:1144-1147` と押し戻し `1161-1164` を整数着地に差し替えて計測 → その後エンジンは元に戻した）：**
      - `footprintBlocked` **68 → 0**（field 67→0・dungeon_7 1→0）。**全 398テスト緑**＝レイアウト側の依存は無い。
      - 交差軸が半セルの場合も **86 → 0**。敵タイルへの着地も **0件**。
      - ❗ **ただし 15 crossing が「境界セル＝閉じた解ける門」で、整数着地だとその門の上に降りる。** 実エンジンのプローブ3件（field `5,13→6,13 @6,0='!'`／dungeon_7 `1,0→1,1 @0,5='T'`／`1,1→1,2 @0,5='T'`）で**着地後4方向すべて移動不能＝復帰不能の詰み**を確認。
      - ❗ **現行の半セル着地には逆向きの実害がある**（同じプローブで確認）＝当たり箱が門の行に跨るので、**辺遷移が閉じた門をすり抜けて内側へ入れる**（`5,13→6,13` は割っていない `!` を通過）。∴**どちらの着地も単独では正しくない。**

      **✅ 設計確定（2026-07-29・ユーザーとディスカッション・実装はまだ）：**

      **①「着地セルが閉じた解ける門なら遷移を拒否」というルールの正体＝`arrivalIsWall`（`game.js:1100`）の `ARRIVAL_WALL_TILES` が「タイル種別」で解ける門を判定していて「今の開閉状態」を見ていないだけのバグ。** 2つの独立問題ではなく1つの判定漏れ：`DOORWAY_LOCKED`(`|`) はセットに入っていて**常に壁扱い**（開いていても着地拒否＝過剰ブロック）／`GATE`(`T`)・`TIDE_GATE`(`=`)・`GATE_RED/BLUE`(`(` `)`)・`BREAKABLE_WALL`(`!`) はセットに**入っておらず常に素通り扱い**（閉じていても着地許可＝すり抜け）。直すのは「タイル種別チェック」を「着地先ステージの `ss`（`openGates`/`activeColor`/`brokenWalls` 等）を見て今の状態を判定」に変えるだけ＝**`checkStageTransition` は `newLayer`/`newKey` を既にスコープに持っているので `getSS(newLayer, newKey)` を渡せばよい**（軽微・機械的）。
      - `SWITCH`/`SWITCH_RED`/`SWITCH_BLUE`/`TORCH` は `tilePassable` では通行可だが**着地では今のまま常時ブロックを維持**（`footprintBlocked`/`traps` の既存ベースラインが前提にしている・仕様変更ではない）。
      - `BUSH`（`cutBushes`）・`STONE`（`stonePositions`）も同じ「状態を見ない」漏れがあった＝`tilePassable` と同じ状態チェックを着地判定にも通す。

      **②`DOOR`(`D`) はこの修正の対象外＝現状どおり「常に通行可」扱いのままでよい（伝播処理は不要・撤回）。** 理由＝境界を跨ぐ `D` は物理的に1枚の扉を両画面に別々のタイルとして描いている（例：dungeon_7 `1,0` col0の `D` と `0,0` col11の `D`）。**境界を越えられる時点で必ず source 側で鍵を使ってその `D` を開けている**（source 側の通行判定がそれより先にガードしている＝開けない限り境界セルへ到達できない）。∴着地先の `D` の開閉を別途チェックする意味がなく、常時通行可のままで安全（`ss.openedDoors` を境界越しに伝播させる仕組みは過剰設計だったので導入しない）。
      - **`DOORWAY_BOSS`(`:`) も着地では常に通行可のまま**＝`boss_closed` を着地ブロックにすると、戦闘中に逃げて出た後の再入場が塞がれる。

      **③ dungeon_7 `0,0`（ボス部屋・入口が鍵扉のみ）の到達性ロスは非問題。** ②の結論どおり `D` は着地チェック対象外のままなので、そもそもこのケースは発生しない（「carve-out が要る」という当初の実測は、`D` も含めて一律ブロックする雑なプローブで出た副作用だった）。

      **✅ やったこと（2026-07-29 実装完了・上の設計どおり）：**
      1. ✅ **着地・押し戻しを整数セル化**（`game.js checkStageTransition`）。下入り `newRow = 0` / 上入り `rows - 1` / 右入り `newCol = 0` / 左入り `cols - 1`、押し戻しも同じ境界セルへ対称に。
      2. ✅ **状態チェックを単一点に集約**＝`passable.js` に `STATEFUL_TILES` と `statefulTileClosed(tile, posKey, ss)` を新設し、`tilePassable`（通行判定）と `arrivalTileBlocked`（着地判定・`game.js`）の**両方**がそれを呼ぶ。`ARRIVAL_WALL_TILES` からは `DOORWAY_LOCKED`/`STONE`/`BUSH` を外し（＝状態で判定）、`arrivalIsWall` は `getSS(newLayer, newKey)` を受け取る形にした。`D`/`:` は `STATEFUL_TILES` の外＝常時通行可のまま。
      3. ✅ **debugMode の整合はコード変更不要と確認済み**。`tilePassable` のデバッグバイパスは `TILE.DOOR` **1箇所だけ**で、`D` は着地判定の対象外＝既に整合している。テストで「デバッグ ON でも門は閉のまま」を固定した（`arrival-landing.spec.js` ②）。
      4. ✅ **検査側も整数化**＝`connectivity.mjs edgeLanding` を整数へ、`connectivity-tool.spec.js` の期待値を更新、`BASELINE.footprintBlocked` と `FOOTPRINT_BASELINE` を **0** に締めた。
         - ⚠️ **整数着地では `footprintBlockedEdges()` は「構造的に」空になる**（着地セルが硬い壁のケースは `traps` クラスとして別に数えられ、この掃引は `continue` する）。∴ ratchet だけでは掃引自体が壊れても気づけない。**`landingOf` を注入可能にし、テストは「旧・半セル着地」を流し込んで掃引が今も欠陥を列挙できることを証明する**（本番の呼び出し側は注入しない＝実着地のまま）。
      5. ✅ **回帰テスト＝`tests/arrival-landing.spec.js`（新規・28件）**。① `statefulTileClosed` の全タイル開閉（`T`/`=`/`(`/`)`/`!`/`|`/`u`/`*`・`ss` undefined・`D`/`:` の除外）／② `tilePassable` が同じ単一点と一致すること＋デバッグバイパスは `D` だけ／③ 実エンジンで dungeon_7 の閉じた `T` 境界へは入れない・Y スイッチで開けたら往復できる（vacuous pass 防止）・連打しても再トリガーしない／④ field で4方向すべての着地が境界セルの整数。
         - ⚠️ **実エンジン系は `window.__game.pause()` してから手動 `step()` する**。裏の `setInterval(step, 120)` が走っていると遷移待ちの実時間の間に余分に前進して `y=8.5` のような値が出る。
         - ⚠️ **着地座標は「遷移した瞬間」で測る**（1操作＝0.5セルなので1歩でも余ると整数着地が判定できない）。`walkUntilStage()` がその役。

      **結果：** `footprintBlocked` **68 → 0**（field 67→0・dungeon_7 1→0）。**フル実行 426 passed ×3 連続**（VRT・`field-corridor-o` 含む）。ダンジョン接続チェッカー・field 接続チェッカーとも指標変化なし（`under-2-axis 97` は不変）。

    - [ ] **⑥-完了検査：** `field-invariants` で **W1=0/W2=0/seam=0/traps=0/under-2-axis=0/dup=0/footprintBlocked=0** ＝全320画面プレイ可能かつ「壁に辺が開いた画面0」の機械的証明（ユーザー確定の"最後のチェック"§10-4）。全ブラウザboot・connectivity緑。

### 9-6-P. パズル/仕掛けの難度を「ゲームとして成立」させる（全ギミック横断の見直し）　🧠 Opus 設計・⚡ Sonnet 流し込み　⏳ 新規タスク（2026-07-15 ユーザー強い指摘）

> **背景（2026-07-15 ユーザー2連投・強い指摘）：** 「今まで出てきた石押しは**すべてあまりにも簡単すぎる。倉庫番ゲーム級の難易度があってもいいぐらい、特にダンジョンは。** フィールドのものも私が作ったステージ以外は馬鹿みたいに簡単で面白さが感じられない」「**対象は石押しだけじゃない。ブーメランで鍵をとるのも簡単すぎる、弓矢でスイッチを押すのも簡単すぎる、ロウソクの炎・はしご・ブーメランを組み合わせないと解けないステージ、とかまだまだ工夫の余地があるのに、今の仕掛けはただ作りましたという状態。簡単すぎてゲームとして成り立ってない。全部見直しするタスクとして書いておいて。**」
> **⚠️ これは 9-6 の「素通り画面を無くす（2軸以上）」とは別軸の品質基準＝"仕掛けを置いた画面の、その仕掛け自体の歯ごたえ"。** 現状は「仕掛けの存在を1回教える最小形」ばかりで、パズルとして解く手応え（複数手・逆算・組み合わせ）がゼロ。ユーザー確定＝**既存の自明な仕掛けも作り直す**（新規/今後だけでなく遡って是正）。**着手タイミング＝タスク登録のみ・当面は ⑥ の地域リワークを継続**（⑥完了後 or 並行で本タスクに入る。⑥-8以降の新規仕掛けは"最初からこの基準で"作る）。

> **✅ 実コードで確認済み（新規ゲームコード不要で倉庫番級が作れる根拠・2026-07-15）：**
> - **複数石×複数ボタン同時制覇**（`allSwitchesOn`・`conditions.js:72`）＋**石を乗せている間だけ開く維持型ゲート**（`checkStoneOnSwitch`）が配線済み。
> - **🔑 決定的：`enterStage`（`game.js:287-311`）は未解決の石パズル画面を出ると石を初期位置に全リセットする**（「壁際に挟まって取り出せなくなった石をリセット」）。∴ **石を角に詰ませて deadlock しても画面を出て入り直せば解き直せる＝"入って詰む"ハード原則を破らずに倉庫番級の難しさを1画面に置ける。** ⚠️ リセットは**画面単位**なので**パズルは1画面で完結**させる（複数画面にまたがる倉庫番は不可）。解決済みは `solvedStonePositions` で保存され再入時に復元（gate 開いたまま）。
> - フィールドでも「HP を削らない知恵の関門」＝IDEA「フィールド＝比較的安全」と両立。

**見直し対象の仕掛けと"歯ごたえ"の付け方（設計時に1つずつ詰める）：**

- [ ] **石押し（`*`→`S`→`T` / `allSwitchesOn`）＝倉庫番級へ：** 1石1直線押しをやめ、**複数石を複数ボタンへ・角の deadlock を避ける押し順・壁で折り返す多手**。ダンジョンは特に歯ごたえを上げる。既存の自明な石押し（⑥-3〜⑥-7 の予告編＋各ダンジョンの石ゲート）を棚卸しして作り直す。**予告編（フィールド村近く）は"最小1回学ばせる"意図なので易しくてよいが、それ以外は歯ごたえ有りに。**
- [ ] **ブーメランの鍵取り（`collectFieldItem` の `R`/`K` 隙間越し回収）：** 「橋のすぐ隣に置いてある」現状をやめ、**投げる角度・跳ね返り・障害物越し・複数の島を経由**など回収に工夫が要る配置に。往復の攻撃判定（Phase 4-6）も絡めた「敵を貫通させて奥の鍵」等。
- [ ] **弓のスイッチ（`Y`→`T`・`arrow-switch`）：** 「目の前の Y を撃つだけ」をやめ、**水/壁越し・射線が限定される・複数 Y を1本の矢が貫く・跳弾**など射抜きに読みが要る配置に。
- [ ] **ロウソク/かがり火（`H`+`torchesLit`）・はしご（`x`水渡り）・爆弾（`!`壁）＝単独でも作り込む：** 「1本点ける/1マス渡る/1枚壊す」で終わらせず、順序・本数・分岐を持たせる。
- [ ] **🔑 複数道具の組み合わせパズル（ユーザー明示の最重要要望）：** **ロウソクの炎・はしご・ブーメランを"組み合わせないと解けない"ステージ**を作る（例＝はしごで渡った先のかがり火をブーメランで炎運搬して点灯／爆弾で開けた先の水堀をはしごで渡る、等）。**⚠️ 各組み合わせは設計時に実コード（`projectile.js` 炎運搬・`passable.js` はしご橋・`handleTileEvent`）で"1画面内で実際に連鎖成立するか"を関数検証してから配置**（配線の思い込みで詰みを作らない＝§13-4 の教訓）。主にダンジョン＋一部フィールドの P3 関門。
- [ ] **棚卸し＝現状の全仕掛けを列挙して難度をタグ付け：** フィールド（migrate-field-*.mjs の links/showConditions/`R`/`Y`/`H`/`x`/`!`）＋全ダンジョン（dungeon_1〜8 の同種）を洗い出し、「予告編で易しくてよい」以外を"作り直し対象"にマーキング。**⚠️ ユーザー自作ステージ（温存画面）は触らない。**

> **完了条件（案・着手時に詰める）：** 各仕掛け画面が「1手で自明」でない（複数手 or 組み合わせ or 読みが要る）。deadlock は画面再入で回復可能（1画面完結）。組み合わせパズルは実ブラウザで連鎖成立を関数検証。予告編は易しいまま維持。**⚠️ このタスクは接続不変（seam/trap）を壊さない＝既存の migration スクリプト＋自己検証の上に難度を積む。**

> **⚠️ 現状の 9-4 完了分は「土台の一部」であって面白さではない：** 地面の地域色（9-4 塗り分け）・湖の島橋化（migrate-field-lake）は「見た目の雑さ」を減らしただけ。9-6 はその上に**ゲーム性**を積む作業。

### 9-6-N. 看板・NPCセリフの見直し（語りの質を「ゲームとして成立」させる）　🧠 Opus 設計・ユーザー同席ブレスト必須　⏳ 仕上げタスク（2026-07-15 ユーザー指摘）

> **背景（2026-07-15 ユーザー強い指摘）：** ⑥ で AI が置いてきた看板（例「石を 印へ 運べば 沼路は 開く」「はしごを 渡す 力あらば 越えられよう」）や NPC セリフは、**あまりにも当たり前の"仕掛けの取扱説明"でしかなく、ゲームとして全く成り立っていない。** 9-6-P（パズルが自明すぎる）と同じ病＝**世界観・キャラ・伏線・謎かけ・ユーモア・プレイヤーへの誘い が1mmもない**。ユーザー確定＝**「私とブレーンストーミングしながら面白さについて考え抜いて作るべき。場合によっては私が一つひとつ作るべきかもしれない。」**
>
> **⚠️ このタスクの鉄則＝AI 単独で埋めない（塗り絵の再来防止）。** 看板/NPC は探索の面白さそのもの（謎・嘘・伏線・世界の記憶・キャラの温度感）を担う＝初代ゼルダの謎かけ看板やムジュラの村人のように、**説明でなく体験**にする。∴ **`superpowers:brainstorming` でユーザー同席で1本ずつ練る／必要ならユーザーが直接テキストを書く。** AI は素材整理・候補出し・世界観との整合チェックに徹し、確定文言はユーザー承認を得てから流し込む。

**見直し対象と方針（着手時に1つずつ詰める）：**

- [ ] **棚卸し＝現状の全 signData/npcData を列挙して"語りの質"をタグ付け：** フィールド（`migrate-field-*.mjs` の `sign`/`npcData`）＋全ダンジョン（dungeon_1〜8）＋村NPC（`7,14`老賢者ほか）＋石碑（`lore-tablets` の8＝「ザーネルの記憶」は既に世界観があるので温存候補）を洗い出し、**「取説的で作り直し／既に世界観がある温存／ユーザー自作＝不可侵」**の3分類にマーキング。**⚠️ ユーザー自作ステージ・既存の作り込み石碑は触らない。**
- [ ] **語りの型を決める（ブレストの出発点・AIが叩き台）：** 謎かけ（解を明示せず匂わせる）／嘘看板（a3・裏に宝や罠）／伏線（後のダンジョン・ラスボス・あらすじ §IDEA と呼応）／世界の記憶（廃村・遺跡の背景）／キャラの声（旅NPC 3種＝進行/時刻/場所で変わる語り部・`FIELD-FUN-CATALOG.md` e1-7 と統合）／ユーモア。**"仕掛けの取扱説明"は原則禁止**（ヒントを出すなら謎かけ or キャラの口調で）。
- [ ] **予告編看板の是正：** 9-6-P で難度を上げた仕掛け（石押し倉庫番`13,4`・弓ゲート`11,6` 等）の看板を、解法直述から「その土地の者の言い伝え／挑発／謎かけ」に書き換える（例：現状「二つの 石を 二つの 印へ。片方では 開かぬ」→ 世界観のある一言に）。
- [ ] **旅NPC 3種の導入検討（別Phase候補と統合）：** `FIELD-FUN-CATALOG.md` の「進行/時刻/場所で変わる語り部・敵として現れる・共闘」は実装設計が要る別Phase扱いだったが、本タスクの"語りの質"と直結＝ブレストで**セリフ設計だけ先行**するか、実装ごと本タスクに含めるかをユーザーと決める。

> **完了条件（案・着手時に詰める）：** 作り直し対象の全看板/NPCが「取説でない」（謎・伏線・キャラ・世界観のいずれかを担う）＝ユーザー承認済み。あらすじ（IDEA §🎬）・石碑（B攻略順）と矛盾しない。**⚠️ このタスクはデータ（signData/npcData 文言）のみ＝接続不変・2軸・パズル難度を壊さない。新規ゲームコード不要（テキスト差し替え）。**

> **⚠️ 着手タイミング＝仕上げタスク（登録のみ）。** 当面は ⑥ の地域リワークを継続。⑥完了後 or 並行で、9-6-P（パズル）と本タスク（語り）を「面白さの2大仕上げ」として詰める。**⑥-9以降の新規看板/NPC は最初からこの基準で書く**（取説を書かない）。

### 9-5. 消費アイテム（矢・爆弾）の補充システム＋容量拡充　🧠 設計確定（2026-07-01）／⚡ 実装

> **背景（2026-07-01 ユーザー指摘＋実コード確認）：** 矢・爆弾は `count` 制の消費アイテムで、補充手段が**フィールドに落ちている有限個の floorItem のみ**（`player.js:773-789`）。敵ドロップは皆無（`killEnemy`＝`combat.js:135` は消すだけ）・倒した敵は `defeatedEnemies`（`game.js:377`）で永続撃破＝**再訪しても復活しない**。∴ **弓/爆弾必須ゲート（D3弓・D6/D7爆弾）で弾切れ＝進行不能（詰み）が理論上発生しうる。** ユーザー確定＝**「敵ドロップで無限補充」方式**を採用（使い放題化はしない＝資源管理の緊張感を残す）。

#### 設計の全体像（ユーザー確定）
1. **雑魚敵を N 回のステージ移動で復活させる**（狩り場として機能させる）。
2. **雑魚撃破時に確率でアイテムドロップ**（矢・爆弾・ハート・ルピー）。**ドロップ率は所持数が少ないほど上昇**（弾切れ寸前ほど出やすい＝詰み防止のセーフティネット）。
3. **矢・爆弾に保持上限を設ける**（デフォルト各 **8**）。
4. **容量拡充アイテム（矢筒・爆弾袋）** を各3個ずつゲーム内に配置。1個取ると上限 +8 → **最大 32**（8 + 8×3）。置き場は**ボスなしの小ダンジョン**（9-4D で各地に配置する `cave_*`）。

#### 9-5a. 弾数上限＋容量拡充アイテム　✅ 完了（2026-07-01・⚡ Sonnet）
> **実コードでの実現性：** `player` オブジェクトは save で丸ごと spread 保存される（`game.js:215`）＝新フィールド `maxBombs`/`maxArrows` は追加すれば自動永続。上限は「拾得・ドロップ時に `Math.min(count+n, max)` でクランプ」するだけ。
- [x] **`player` に `maxBombs`/`maxArrows` を追加**（初期値 **8**）。新規ゲーム初期化（`game.js`）とロード時のデフォルト補完（`save.js:sanitizeLoadedPlayer`）に入れた。
- [x] **拾得・ドロップ時に上限クランプ**：`player.js`（爆弾・矢の floorItem 拾得）と `giveSubItem`（bomb/bow の count++）をクランプ。ショップ購入（`ui.js`）も対応。上限到達時は `pulse('もう持てない！')` で通知。
- [x] **容量拡充アイテムを新設**（`shared/items.js` ITEM_META）：`quiver`（矢筒・矢上限+8）・`bombBag`（爆弾袋・爆弾上限+8）を `type:'passive'` で追加。`giveSubItem` passive 分岐に「quiver→maxArrows+=8／bombBag→maxBombs+=8」を追加（heartContainer/ladder と同型）。
- [x] **拡充アイテムのタイル＋スプライト**：`{type:'item', item:'quiver'}` チェスト報酬で流せる（`grantReward` の item 分岐が `giveSubItem` を呼ぶため追加コード不要）。floorItem は既存 ITEM_BOW/BOMB タイルと別の専用タイルが必要＝**配置は 9-4D 連動の課題として残す**。
- [ ] **HUD 表示**：`ui.js:137` の `×${cnt}` を `×${cnt}/${max}` 形式にするか検討（任意・後回し）。
- [ ] **配置（⚠️ 9-4D と連動）：** 矢筒×3・爆弾袋×3 をボスなし小ダンジョンに分散配置。取得順に依存しないよう、序盤〜中盤で徒歩到達できる位置に置く。
- [x] **テスト**：`tests/ammo-capacity.spec.js`（9本・全グリーン）＝上限クランプ・拡充で max 増加・ロード後も max 保持・旧セーブ補完。

#### 9-5b. 雑魚リスポーン（N回ステージ移動で復活）　✅ 完了（2026-07-04・⚡ Sonnet）
> **実コードでの実現性：** ステージ遷移は `enterStage()`（`game.js:266`）が単一チョークポイント＝ここにグローバル移動カウンタを置ける。リスポーン対象＝**`isBoss=false` の E/C/F のみ**（`ENEMY_META` で W中ボス含む他は全て `isBoss=true`＝機械的に区別可能）。撃破記録は `ss.defeatedEnemies`（posKey の Set・`game.js:377` で参照）。
- [x] **グローバル移動カウンタ**：`enterStage()` で「別ステージへ移動した回数」をカウント（`player.stageMoves++`・save 対応は player spread で自動）。`RESPAWN_MOVES=8` を `constants.js` に追加。
- [x] **リスポーン判定**：各 stageState に `ss.lastKillMove` を追加（`save.js` に serialize/deserialize 追加）。`combat.js:killEnemy` で雑魚撃破時に `ss.lastKillMove = getStageMoves()` を記録。`enterStage()` で `field` レイヤー再入時、`stageMoves - ss.lastKillMove >= 8` なら `ss.defeatedEnemies` から `isBoss=false` の posKey を削除して復活。**field のみ・ダンジョンは対象外（最小実装）**。
- [x] **`RESPAWN_MOVES` 定数**を `constants.js` に追加（初期値 8）。
- [x] **テスト**：`tests/enemy-respawn.spec.js`（4本・全グリーン）＝stageMoves 増加・7回移動では復活しない・8回移動後に復活・ダンジョンは復活しない。218本全通過。

#### 9-5c. 雑魚ドロップ（矢/爆弾/ハート/ルピー・所持数連動確率）　⚡ 実装（設計済み）
> **実コードでの実現性：** `killEnemy`（`combat.js:135`）にドロップ処理を足す。既存の「茂み切りドロップ」（`combat.js:321`＝確率でハート/ルピー＋`spawnDropEffect`）が参考実装として使える。ドロップは**その場で即時取得**（floorItem を置くのでなく、撃破時に直接 player に加算＋エフェクト）で最小実装。
- [x] **`killEnemy` にドロップ抽選を追加**（雑魚 E/C/F のみ・isBoss は対象外）。抽選テーブル：矢・爆弾・ハート（HP+1〜2）・ルピー・ハズレ。
- [x] **所持数連動の確率**：矢/爆弾は「現在の所持数が少ないほどドロップ率up」（例：`count===0` なら高確率・`count>=max/2` なら低確率 or 0）。**弾切れ時のセーフティネット**として機能させる（詰み防止の要）。
- [x] **上限クランプ**：ドロップで得た矢/爆弾も 9-5a の `maxBombs`/`maxArrows` でクランプ。
- [x] **エフェクト**：`spawnDropEffect(r,c,icon,color)`（`combat.js:54`）を流用（💣/🏹/❤/◆）。取得音は `playSound('item')`。
- [x] **⚠️ 敵の弱点属性との整合：** ドロップは撃破手段に依存しない（剣で倒しても矢が出る）。弓/爆弾を消費して雑魚を倒す運用でも収支がプラスになる率に調整（プレイで詰める）。
- [x] **テスト**：所持0で撃破→高確率で弾ドロップ（乱数固定 or 多数回試行）／満タン時は弾ドロップしない／ドロップが max を超えない。

> **⚠️ 実施順の推奨：** 9-5a（上限＋拡充・最小）→ 9-5c（ドロップ＝詰み防止の本丸）→ 9-5b（リスポーン＝狩り場化）。9-5c だけでも「倒せば補充」で詰みは防げる。9-5b は「補充機会を増やす」ための追加。field 再設計（9-4）とは独立に進められる。

---

## 実装優先順位まとめ

```
Step 1: まず技術基盤を整える（Phase 0）
  → Phase 0-0: テスト基盤整備（Playwright E2E/VRT）← 分割前の安全網。最初にやる
  → Phase 0-1: 決定論的ゲームループ（フレーム制御可能な構造）← テストしやすさの土台
  → Phase 0-2: game.js モジュール分割（4098行を16モジュールへ）※0-1と同時進行可
  → Phase 0-3: sprites.js / editor.js / game.css 分割
  → Phase 0-4: 必要なスプライト一覧の洗い出し
  → Phase 0-5: エディタ機能拡張（スプライト/キャラ/アイテム作成支援）

  ※ 0-0 のテスト網を先に張ってから分割すること
  ※ 0-1 の決定論ループ化と 0-2 の分割は同じ game.js を触るので同時に進めると効率的
  ※ ここが完了してから初めてゲーム機能を安全に追加できる

Step 2: ゲームの骨格を完成させる（Phase 1〜2）
  → Phase 1: ストーリー基盤（名称変更・老賢者・祭壇・暗黒の塔）
  → Phase 2: 8ダンジョン・エンディングフロー

Step 3: ゲームを面白くする（Phase 3〜6）
  → Phase 3: アクション深化（剣ビーム・大型ボス・弱点属性）
  → Phase 4: サブアイテム拡充（はしご・笛・ロウソク）
  → Phase 5: 謎解きギミック（色スイッチ・隠し通路）
  → Phase 6: 世界観・NPC（噂話・石碑・嘘をつくNPC）

Step 4: 完成度を上げる（Phase 7〜8）
  → Phase 7: 成長システム（剣ランク・強化防具）
  → Phase 8: やりこみ・UX改善

Step 5: 必要になったら（Phase 0後半）
  → TypeScript 採用
  → esbuild バンドル
```

---

## 現在の実装状態（参考）

| 機能 | 状態 |
|---|---|
| フィールド移動 | ✅ 実装済み |
| ダンジョン（複数） | ✅ 一部実装済み |
| 剣攻撃・盾 | ✅ 実装済み |
| ブーメラン・弓矢・爆弾 | ✅ 実装済み |
| ボス戦（DARK_LORD系） | ✅ 実装済み |
| 星の欠片収集→エンディング | ✅ 実装済み（Phase 1-3 で終盤フロー分岐化：祭壇あれば誘導／無ければ従来どおり即エンディング） |
| 8ダンジョン | 🟡 欠片ダンジョンは `dungeon_1〜8` に統一（位置づけ修正 2026-06-24・cave_1 は小洞窟で除外）。大型ボスは7体（D1〜D7）＋9-2c で沼地の大蝦蟇を「部品」作成済み。**dungeon_8 の新設＋沼地ボス配置で8体に揃える**のは 9-2{d〜}。中身の作り込み（D3〜8）も 9-2{d〜} で継続 |
| 古代の祭壇→翼の羽衣→暗黒の塔 | ✅ 完了（1-3 基盤＋1-4 祭壇＋1-5 飛行/暗黒の塔）。全収集→祭壇で翼の羽衣→飛行で虚空を越えて塔→ザーネル→エンディングが一本に繋がる |
| ラスボス ザーネル（最終ボス・撃破でエンディング） | ✅ 完了（dark_tower ボス部屋に `Z` 配置・isFinalBoss 撃破でエンディング発火を実ブラウザ確認） |
| 翼の羽衣による飛行移動 | ✅ 完了（1-5：`player.flying`・F/🪽 トグル・自然物（空/水/木/茂み/柵）飛び越え・山/壁/家/門は不可・地上のみ着陸・自動着陸・場外クランプ） |
| 老賢者のストーリー導入 | ✅ 完了（Phase 1-2：最初の村に老賢者NPC配置・ストーリー導入台詞） |
| チャージ攻撃（剣ビーム） | ✅ 完了（Phase 3-1：押下で剣＋長押しチャージ→離してビーム。1/4以上=弱ビーム/満タン=貫通強ビーム。チャージ中は移動半速。charge.js + CSS オーラ。42テストグリーン） |
| はしご | ✅ 完了（Phase 4-1：自動わたり方式・水/穴を1セル渡れる・PIT タイル追加・dungeon_3 パズル。57テストグリーン） |
| 笛 | ✅ 完了（Phase 4-2：active サブアイテム・reveal（隠し入口出現）/warp（ワープ）の2効果・`stageData.fluteEffect`・showConditions の `flutePlayed` トリガー・エディタ対応・71テストグリーン） |
| ロウソク | ✅ 完了（Phase 4-3：active magic サブアイテム・前方の茂みを燃やす（cutBushes 再利用）・`ss.bushBurned`→showConditions の `bushBurned` トリガーで隠し通路/入口出現・エディタ対応・75テストグリーン） |
| 色スイッチ | ⬜ 未実装 |
| 剣の複数ランク | ⬜ 未実装 |
| テスト基盤（Playwright E2E/VRT） | ✅ Phase 0-0 完了（起動・移動・セーブ/ロード・ステージ遷移の4スモーク＋VRT、計5テストがパス） |
| game.js モジュール分割 | ✅ 完了（4098行 → 1268行・約70%削減。0-2b で旧本体削除済み・13テストグリーン） |
| TypeScript・ビルド検討（0-6） | ✅ 完了（plain ESModule 維持と判断。計測根拠は DECISIONS.md。Phase 0 クローズ） |
| game.css 分割 | ✅ 完了（css/ 配下11ファイル + @import エントリ） |
| sprites.js 分割 | ✅ 完了（player/enemies/items/tiles + aggregator） |
| editor.js 分割 | ✅ 完了（8モジュール：editor-state/layers/world/palette/canvas/props/io + エントリ142行。スモークテスト4本追加。17テストグリーン） |

| スプライトエディタ | ✅ 完了（🎨タブ・グリッド可変・パレット・マルチフレーム・反転・既存読込・コードエクスポート。editor-sprite.js。19テストグリーン） |
| キャラクター定義エディタ | ✅ 完了（🧙タブ・敵リスト選択・HP/ATK/DEF/速度/攻撃パターン/フェーズ編集・JSコード生成。editor-character.js 492行。23テストグリーン） |
| アイテム定義エディタ | ✅ 完了（📦タブ・ITEM_META+EQUIP_META選択・タイプ別フィールド・uses形式切替・JSコード生成。editor-item.js。26テストグリーン） |
| タイルバリエーション設計支援 | ✅ 完了（🗺タブ・テーマプリセット8種・パレット編集・JS出力。editor-tile.js。29テストグリーン） |
