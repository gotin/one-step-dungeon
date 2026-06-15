# Blade of Lumia – 設計判断・学びの記録（ADR）

> **このファイルの役割：** 「なぜそうしたか」という設計判断・重要な学び・ハマりどころを記録する。  
> 後から見て同じ判断を蒸し返さない・同じ失敗を繰り返さないための場所。  
>
> **書くタイミング：** 重要な設計判断をした時／ハマって解決した時／計画を変更した時。  
> **書き方：** 1件1セクション。「決定」「理由」「代替案」「結果」を簡潔に。

---

## テンプレート（コピーして使う）

```
### YYYY-MM-DD — タイトル
- **決定：** 何を決めたか
- **理由：** なぜそう決めたか
- **代替案：** 検討したが採用しなかった案（あれば）
- **結果／影響：** この判断による影響・後で見返すべき点
```

---

## 記録

### 2026-06-15 — Phase 0-6：TypeScript・ビルドは当面導入しない（plain ESModule を維持）
- **決定：** TypeScript も `vite build`（bundle+minify）も**当面導入しない**。本番 Vercel が `outputs/` を素ファイルのまま静的配信する現状（未バンドル・ビルドなし）を維持する。これをもって **Phase 0 をクローズ**する。
- **背景（公開構成）：** このゲームは Vercel で公開済み。`vercel.json` は `{ outputDirectory: "outputs", trailingSlash: true }` のみで**ビルドステップなし**。`outputs/` 配下に blade-of-lumia 以外に3ゲーム（one-step-dungeon / dungeon-world / sword-duel）と共通ランディング `index.html` が同居し、全体が静的配信される。
- **esbuild と Vite の関係（混同しやすい点を整理）：** esbuild は Vite の内部で使われている。dev サーバ（`vite`）は素ファイルを変換せず個別配信し minify しない。本番最適化は `vite build`（内部で esbuild minify + Rollup bundle）が担う。よって「esbuild を別途導入」は不要で、最適化したいなら `vite build` を足すだけ。現状は dev 配信のみで最適化は一切かかっていない。
- **計測（判断の根拠・2026-06-15 実測）：** 本番同等の未バンドル構成を Playwright + CDP で計測（転送量律速を排除するため帯域無制限・RTT のみ注入し、import 連鎖の段数だけを切り出した）。
  - リクエスト総数 30（JS 27 + CSS/JSON/他）。素ファイル合計 297KB / gzip後 70KB（Vercel が gzip/brotli 自動適用）。
  - time-to-board（起動完了）：RTT 0ms=269ms / 30ms=482ms / 75ms=817ms。
  - ボトルネックは**転送量ではなく import 連鎖の段数 × RTT**（`main.js→game.js→各モジュール`の数珠つなぎ27本）。`vite build` で JS を 1〜数本に束ねれば RTT75ms 環境で概ね 300〜500ms 短縮の見込み。
  - ※ Vite dev サーバでの素朴計測は総転送量が約2MB（ソースマップ＋HMR注入で約7倍に水増し）と出るが、これは dev 専用の膨張で**本番とは無関係**（本番は素の297KB）。帯域スロットルすると転送量律速になり誤った結論を導くため、帯域無制限で測り直した。
- **理由：** (1) ゲーム自体が gzip後70KBと軽量で「重くて困る」水準ではない。(2) 改善幅は数百msで体感はするが致命的ではない。(3) 代償として「JS編集→git push→即反映」という無ビルド運用の手軽さを失い、4ゲーム同居の `outputs/` で blade だけ `dist/` 化すると Vercel 設定（`outputDirectory: outputs`）との整合・混在構成の管理コストが発生する。(4) これから入る Phase 1+ はストーリー・コンテンツ中心で型パズルが重い基盤作業ではなく、TS 化（game約5300行＋editor約3400行の移行・factory deps の型付け）の費用対効果が低い。
- **代替案：** (A) `vite build` 導入 → 数百msの起動改善は得られるが上記の運用代償・整合作業に見合わないと判断。(B) TypeScript 導入 → 型安全・補完の利点はあるが、現状モジュールは全て700行以下に分割済みで可読性問題は解消済み、移行コストが Phase 1 のコンテンツ作業を圧迫する。(C) esbuild 単独導入 → Vite を既に使っており二重管理になるため却下。
- **結果／影響：** Phase 0 を完了とする。再判断のトリガーは「起動の体感が遅いという声が出た／モバイル比率が高くロード短縮の価値が上がった」時。その際は **新ツールを足さず `vite build` を blade-of-lumia 内で完結させ Vercel 配信先を dist に切り替える**のが第一候補（esbuild 単独導入は不要）。型安全が必要になったら、育っていくデータ構造（`ENEMY_META`/`ITEM_META`/タイル定義）から部分的に JSDoc + `// @ts-check` で型注釈を入れる軽量策を先に検討する。

### 2026-06-14 — editor.js は factory パターンなし・引数注入 + CustomEvent で分割する
- **決定：** editor.js（1581行）の分割では game.js で使った `createXxx(deps)` factory パターンを採用せず、**引数注入（コールバック渡し）と CustomEvent** を組み合わせる形で疎結合化する。
- **理由：** editor.js はゲームと異なり「1ファイルにすべてが含まれた素直な構造（再代入 `let` 状態なし・ESModule read-only binding 問題なし）」だったため、factory の複雑な deps 配線は不要。各モジュールの関数は `renderWorldGrid` / `renderDungeonMeta` 等の描画関数をコールバックとして受け取るだけで動作できる。`showView` のように「モジュール外のルーティング関数」が必要な箇所は CustomEvent（`editor:resetPreview` / `editor:showWorld` / `editor:previewClickAt`）で editor.js に通知する方式にした。
- **代替案：** (A) factory + deps 注入（game.js と同じ方式）→ 不要な複雑さ。再代入 `let` がないのに `() => val` クロージャ注入を使うのは過剰設計。(B) 単純 import（各モジュールが editor.js の関数を直接 import）→ 循環 import になるため却下。
- **結果／影響：** editor.js（エントリ）が142行のオーケストレーター層になった。各モジュールへの `renderWorldGrid` 等の受け渡しは呼び出し側（editor.js）でラムダ `() => renderWorldGrid()` で包んで渡す。今後エディタ機能を追加するときも同じパターンで新モジュールを追加できる。editor-props.js が409行（目標400行比 +9行）だが、右パネルは論理的に1単位なので分割しないことにした。

### 2026-06-14 — editor スモークテストを分割前に追加する
- **決定：** editor.js を分割する前に、Playwright でエディタの最小スモーク（起動・ステージ作成・タイルパレット・JSONエクスポート）を4本通してから分割を開始する。
- **理由：** エディタは自動テストが0件だったため、分割後のデグレを検知できない。game.js 分割の教訓として「テスト網を先に張ってから分割する」が PLAN.md に明記されている。分割中・分割後に4本が継続してグリーンであればエディタの主要機能が維持されていると判断できる。
- **代替案：** 分割後にスモークを追加 → デグレがあっても分割前か後か特定しにくくなる。手動確認のみ → 機械的な安全網がなくリグレッションを見落とす可能性。
- **結果／影響：** tests/editor.spec.js を追加。17テストグリーン（ゲーム13本＋エディタ4本）で分割完了を確認。

### 2026-06-14 — game.css は @import エントリ + 機能別サブファイルに分割する
- **決定：** `game.css` を `@import` 専用のエントリファイルにし、機能別に `game/css/` 配下へ11ファイル（base / hud / board / effects / overlays / mobile / responsive / shop / boss / ending / tiles）へ分割する。
- **理由：** index.html を無改修にでき（`<link href="game.css">` のまま）、ファイル単位で責務が明確になる。`@import` は CSS 先頭にまとめる制約があるが、エントリを @import 専用にすれば自然に満たせる。
- **代替案：** (A) index.html に `<link>` を複数並べる → index.html を改修する必要があり、読み込み順の管理も HTML 側に漏れる。(B) ビルドツールで結合 → Phase 0-6 まで plain ESModule 方針なので時期尚早。→ いずれも却下。
- **結果／影響：** **@import の順序は元 game.css のソース順（カスケード）を厳密に維持する必要がある。** 特に `#boss-hpbar { bottom: 148px }` は元ソースで `@media(PC){#boss-hpbar{bottom:20px}}` より後に定義され後勝ちになるため、`responsive.css` → `boss.css` の順で読み込む。今後サブファイルを足す/並べ替える際もこのカスケード前提を壊さないこと。VRT（`game-start.png`）が見た目の不変を保証する安全網になった（13テストグリーン）。

### 2026-06-13 — Phase 0（技術基盤）を最優先にする

- **決定：** ゲーム機能追加（Phase 1以降）の前に、技術基盤の整備（Phase 0）を完了させる。
- **理由：** game.js が 4098 行に肥大化しており、この状態で機能を足し続けるとバグ修正・デバッグが困難になる。
- **代替案：** 機能追加を優先し、分割は後回し → 却下（技術的負債が雪だるま式に増える）。
- **結果／影響：** Phase 0 完了までは新ゲーム機能を実装しない方針。

### 2026-06-13 — テストは Playwright（E2E/VRT）を主軸にする
- **決定：** テスト基盤は Playwright を中心に据え、Puppeteer は使わない。
- **理由：** テストランナー内蔵・スクショ比較（VRT）標準対応で、ピクセルアートゲームのE2E/見た目テストに最適。
- **代替案：** Puppeteer + jest → 却下（VRTや待機制御を自前実装する必要があり手間）。
- **結果／影響：** `@playwright/test` を導入。VRTでリファクタ前後の見た目差分を検出する。

### 2026-06-13 — 決定論的ゲームループ（時間注入）を導入する
- **決定：** 実時間依存（setInterval / Date.now）を論理時間（gameTime）に置き換え、テストから `step(frames)` でフレーム制御できる構造にする。
- **理由：** 実時間依存だとテストが遅く・不安定（flaky）になる。フレーム単位で決定論的に検証したい。
- **代替案：** 実時間のまま sleep を多用してテスト → 却下（遅い・不安定）。
- **結果／影響：** 移動・攻撃・敵AIのコアから論理時間化。演出（見た目アニメ）は実時間のまま残してよい。0-2 の分割と同時進行する。

### 2026-06-13 — 「星の欠片」は表示名のみ変更し内部変数は維持する
- **決定：** 「トライフォースのかけら」→「星の欠片」は**表示テキストのみ**変更し、内部の変数名・タイル文字（`Q` / `ITEM_TRIFORCE_PIECE` / `triforceCount`）は当面そのまま残す。
- **理由：** 既存のセーブデータ・JSONマップとの互換性を壊さないため。
- **代替案：** 全部一括リネーム → 保留（分割完了後に安全に実施）。
- **結果／影響：** Phase 1-1 で表示名のみ変更。完全リネームは Phase 0 完了後の課題。

### 2026-06-13 — テスト用ローカルサーバは Vite に統一（Node系で揃える）
- **決定：** E2Eテストのローカルサーバは **Vite** を使う。Playwright の `webServer.command` を `npx vite ../ --port 18080 --strictPort` とし、サーバルートは `outputs/`、ゲームは `http://localhost:18080/blade-of-lumia/game/` で開く。
- **理由：** 利用技術を Node 系に統一したい（実装に使っていない Python を持ち込まない）。普段の手動確認がリポジトリルートで `npx vite outputs --port 18080` のため、テストも同じ構成・同じポートに揃えると認知負荷が下がり、`reuseExistingServer` で手動起動中の dev サーバをそのまま再利用できる。
- **代替案：** `python3 -m http.server`（当初採用）→ 却下（実装で使わない言語の持ち込み）。`http-server` 等の別 npm パッケージ → 却下（Vite で十分かつ手動確認と統一できる）。
- **結果／影響：** `vite` を devDependency に追加。`npm run dev` でも同じサーバを起動可能。Python 依存は撤廃。
- **学び（ハマりどころ）：** サーバルートが `outputs/` なので、テストの URL は `/game/` ではなく `/blade-of-lumia/game/` になる。`game.js` が `../shared` `../work` を相対参照する点と整合する。

### 2026-06-13 — Phase 0-1：論理時間 gameTime と step() 分離の実装方針
- **決定：** (1) 論理時間 `gameTime`(ms) と `gameNow()` を導入し、(2) `gameTick` を「1フレーム進める `step(frames)`」へ分離（driver は `setInterval(() => step(1), TICK_MS)`）、(3) game.js 内の `Date.now()` 全10箇所を `gameNow()` に置換、(4) `window.__game`（step / player / movePlayer / swordAttack / gameTime 等）をテスト用に公開する。
- **理由：** ゲームプレイに影響する時間依存（剣CD・無敵・石押しCD・マップ遷移CD・ボスAI・敵攻撃間隔・爆弾の導火線）はすべて `Date.now()` を使っており、視覚演出（要素削除・点滅・撃破演出）は `setTimeout`/`setInterval` 側で `Date.now()` を使っていない。したがって `Date.now()` → `gameNow()` の全置換はゲームロジックだけを論理時間化でき、演出は実時間のまま残せる（PLAN 0-1 の「状態を進めるロジックと見た目の演出を分離」に合致）。
- **`gameTime` の前進ルール：** `step()` 1フレームにつき `TICK_MS`(=120) 加算。`isPaused/isDialog/isGameover/isTransitioning` の間は世界を凍結（加算しない）＝従来の早期 return を踏襲。これにより既存のしきい値（`SWORD_COOLDOWN_MS=100`・`INVINCIBLE_MS=1500` 等）をそのまま使える。
- **命名：** ヘルパーは `gameNow()`。関数内のローカル `const now = Date.now()` が多数あるため、グローバル名 `now` は衝突回避で避けた。
- **代替案：** `performance.now()` 基準のまま step に時間を渡す → 却下（既存しきい値をそのまま使えず、テストの決定論性も弱い）。
- **結果／影響：** テストは `__game.movePlayer('right'); __game.step(1)` のように実時間ゼロで決定論的に検証できる。入力キュー（`queueInput`）も heldKeys 経由で公開。演出系の `setTimeout` は今回は対象外（段階導入）。

### 2026-06-13 — 石押しクールダウンは論理時間化しない（実時間 Date.now のまま）
- **決定：** 0-1 の `Date.now()→gameNow()` 一括置換の例外として、**石押しクールダウン（`movePlayer` 内 `nowSt`）だけは `Date.now()`（実時間）にする**。他のCD・無敵・敵AI・爆弾は論理時間 `gameNow()`。

- **根本理由：石押しアニメが「CSS transition（実時間駆動）」だから。**
  石押しは、石とプレイヤーを CSS の `transition: left/top ...ms linear`（`_animDuration`≈540ms）で滑らかにスライド移動させる。**CSS transition はブラウザが実時間で再生するもので、論理時間 `gameTime` では一切制御できない**（gameTime を進めても CSS アニメは速くも遅くもならない）。
  クールダウン `STONE_PUSH_COOLDOWN_MS=600ms` は「このアニメ（540ms）が終わるまで次の押し入力をブロックする門番」であり、アニメと同じ時間軸＝実時間でなければ意味をなさない。アニメが実時間なのに門番だけ論理時間にすると、両者の時間軸がズレうる（特に下記の早送り時）。だから門番も実時間に揃える。

- **なぜ「アニメも論理時間化」しないのか（＝CSS transition を捨てない理由）：**
  論理時間で動かすには「毎フレーム手で座標を更新する」方式にする必要があるが、これは
  (1) **スムーズさで CSS transition に基本かなわない**（ブラウザのコンポジタ最適化・サブピクセル補間が使えない）、
  (2) **コードが複雑化する**（イージング・経過時間管理・中断処理を自前実装）、
  (3) **パフォーマンスが落ちやすい**（毎フレーム JS から DOM スタイルを書き換える）。
  見た目の演出は CSS に任せるのが定石なので、ここは CSS transition を維持し、その代償として「クールダウンは実時間」という例外を1点だけ許容する。

- **論理時間にすると具体的に何が起きるか（早送り時の破綻）：**
  通常プレイでは `step()` が `setInterval(120ms)` で実時間駆動されるため、`gameTime` は実時間とほぼ同速で進み、論理時間でも実時間でも挙動はほぼ変わらない。問題はテスト等で `step(100)` を一気に呼んだ時。`gameTime` は瞬時に進むがCSSアニメ（実時間540ms）はまだ再生中 → 門番が `gameNow()` 基準だと即座に解け、アニメ中の石に次の押しが重なって「石要素が重複描画され大きく見える」状態を作れてしまう。実時間門番ならこれが起きない。

- **補足：** develop の実装も石押しは `Date.now()` で一致。
- **再発防止：** `tests/stone-push.spec.js` を追加。ユーザー指定の2条件を「実際の入力経路（押しっぱなし＝queueInput＋実ループ）」で検証する：(1) 石サイズが移動前後で不変（canvas の実描画サイズを実測）、(2) 押しっぱなしで石を連続して押せる（2セル以上前進）。

### 2026-06-13 — 【反省】テストの十分性とデバッグ手順の教訓
- **経緯：** 石押し不具合の報告を受けた際、私は重大な手順ミスを複数犯した。記録して再発を防ぐ。
- **ミス1（テストの十分性）：** 最初の石押しテストは「石要素の個数 ≤1」「movePlayer を800ms間隔で手動2回呼ぶ」だけで、ユーザー指定の2条件（石サイズ不変・連続押下）を**まったく検証していなかった**。にもかかわらず「テスト緑＝正しい」と判断した。→ 教訓：**テストが緑でも、検証内容が要件を満たしていなければ無意味**。テストは「何を保証しているか」を要件と突き合わせて確認する。
- **ミス2（誤診断）：** develop との diff で行範囲をずらして読み、「アニメ4行が欠落」と誤って結論づけた。実際にはコードは develop と一致していた。→ 教訓：diff の行対応は正確に。`git show ref:path` で実物を突き合わせる。
- **ミス3（思い込み）：** 「実機で不成立＝コードが原因」と決めつけた。真因は**ブラウザの古いキャッシュ**だった。→ 教訓：実機差異を見たら、まずハードリロード／キャッシュ無効化を疑う。コードが develop と一致しているなら、環境要因（キャッシュ・サーバ）を先に切り分ける。
- **結果：** game.js のコードは develop と一致しており正常。実機もキャッシュクリアで develop と同じスムーズ動作を確認。テストは2条件を正しく検証する形に作り直して保持（10テスト全グリーン）。

### 2026-06-14 — Phase 0-2 の分割は「定数→状態」の段階方式で進める
- **決定：** PLAN の Step 1（state.js / save.js 切り出し）を **2段階に分解**する。1a=再代入されない純粋定数を `constants.js` へ、1b=可変状態を状態コンテナ方式（`state.js` の単一オブジェクト `S`）へ。まず 1a を実施した。
- **理由：** `player`/`stageKey`/`currentLayer`/`mapData`/`stageState` 等は `loadGame()`・`init()`・`startNewGame()` で**再代入**される。ESModule の named import は **read-only binding** なので、`export let player` を別ファイルから import すると再代入できずエラーになる。したがって「再代入されない定数」と「再代入される状態」は分割の難易度がまったく異なる。低リスクな定数から先に切り出し、影響の大きい状態移行を独立した単位にすることでデグレリスクを抑える（WORKFLOW の「1単位ずつ進める」にも合致）。
- **代替案：** (A) PLAN通り state.js + save.js を一気に切り出す → 却下（数百箇所の `player`→`S.player` 置換が必要で侵襲的）。本セッションでユーザーと相談し B（段階方式）を選択。
- **結果／影響：** `constants.js` に11定数を集約（MOVE_STEP / TICK_MS / INVINCIBLE_MS / HP_PER_HEART / MAP_JSON_URL / SAVE_KEY / CLEARED_KEY / DIR_DELTA / SWORD_REACH / SWORD_COOLDOWN_MS / STONE_PUSH_COOLDOWN_MS）。`lastSwordTime`/`lastStonePushTime` は再代入される `let` なので game.js に残した。DOM参照・`BG_TILE_COLOR_CLASS`（描画密接）も対象外。10テストグリーン。1b は次セッションで状態コンテナ化として実施。

### 2026-06-14 — Phase 0-2 Step 2：passable/conditions は「factory + 状態 getter 注入」で切り出し
- **決定：** `isPassable`/`tilePassable`/`isPassableForEnemy`（→ `passable.js`）と `checkStoneOnSwitch`/`evaluateConditions`（→ `conditions.js`）を、**状態を引数で渡す純粋関数ではなく `createXxx(deps)` ファクトリ + 状態 getter 注入**の形で切り出す。game.js は起動時に一度だけ `createPassable(...)`/`createConditions(...)` を呼び、分割代入で関数群を取得する。**呼び出し側のコードは無改修**（関数名そのまま）。
- **理由：** これらの関数は `stageData`/`enemies`/`player`/`currentLayer`/`stageKey`/`debugMode` という再代入される `let` 状態を多数参照し、呼び出し箇所も多い。save.js のように全状態を引数で渡す純粋関数化だと呼び出し側を全面改修する必要があり侵襲的。`() => stageData` のような getter クロージャを注入すれば、状態が後で再代入されても常に最新値を読めるため、呼び出し側を変えずに切り出せる（低リスク）。
- **代替案：** (A) 全状態を引数で渡す純粋関数化 → 却下（呼び出し箇所の全面改修が必要）。(B) `export let` 直接 import → 不可（read-only binding）。(C) 状態コンテナ `S` への全面移行 → 却下（Step 1b と同じ理由でリスク過大）。
- **結果／影響：** `game/passable.js`（`createPassable`）・`game/conditions.js`（`createConditions`）を新設。注入 deps は状態 getter（getStageData/getEnemies/getPlayer/getCurrentLayer/getStageKey/getDebugMode/getSS）+ ユーティリティ（toTileRow/toTileCol）+ conditions のみ副作用関数（renderBoard/renderChars）。shared の `TILE`/`NPC_SPRITE_MAP`/`playSound` は各ファイルで直接 import。10テストグリーン。今後の描画系（Step 3）以降も同じ注入パターンを適用できる見込み。

### 2026-06-14 — Phase 0-2 Step 1b：状態コンテナ化はやめ、save.js は「純粋変換関数」に限定

- **決定：** Step 1b は当初「可変状態を `state.js` の単一オブジェクト `S` に集約し全参照を `S.xxx` に置換」する予定だったが、**取りやめ**。代わりに **save.js には localStorage にも状態にも触れない純粋変換関数だけを置く**：`createStageState` / `serializeStageState`（Set→配列）/ `deserializeStageState`（配列→Set）/ `sanitizeLoadedPlayer`。`getSS`/`saveGame`/`loadGame` 本体（localStorage I/O と `player`/`stageState` 等への再代入）は game.js に残す。
- **理由：** `player`/`stageData`/`stageState` 等の参照は game.js 全体で数百箇所あり、状態コンテナへの一括置換は (1) デグレリスクが過大、(2) テスト網（10件）では演出・ボス戦など全経路を保証できない、(3) WORKFLOW の「1単位ずつ・一度に詰め込まない」に反する。一方で「状態を受け取り変換値を返す純粋関数」だけなら read-only binding 問題が起きず、低リスクで切り出せる（save.js は引数→戻り値で完結し副作用なし＝テスタブル）。
- **代替案：** (A) 状態コンテナ `S` への全面移行 → 却下（上記リスク）。(B) `export let` を直接 import → 不可（ESModule の named import は read-only binding で再代入できない）。
- **結果／影響：** `game/save.js` を新設（4純粋関数）。`getSS` は `createStageState()`、`saveGame` は `serializeStageState()`、`loadGame` は `deserializeStageState()`+`sanitizeLoadedPlayer()` を使う形に簡約。10テストグリーン（セーブ/ロード復元テストがシリアライズ往復の正しさを担保）。完全な状態集約は将来 Step 2 以降で他モジュールが状態参照を必要としたとき、必要最小限の範囲で再判断する。

### 2026-06-13 — モデル使い分け（Opus / Sonnet）を方針化
- **決定：** 設計・依存判断は Opus、決まった実装・量産は Sonnet。PLAN.md の各タスクに推奨モデルを記載。
- **理由：** コスト効率と品質の両立。「最初の1つ・全体設計」は重い思考、「2つ目以降の繰り返し」は機械的作業。
- **結果／影響：** PLAN.md の各見出しに 🧠 Opus / ⚡ Sonnet / 🧠→⚡ を明記。
