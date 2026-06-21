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

### 2026-06-21 — Phase 5-3（設計＋実装）：敵を使ったパズルは「敵が石を押す→既存の checkStoneOnSwitch でボタンON」で実装する
- **決定（仕組み・ユーザー選択）：** Phase 5-3「敵を使ったパズル」は、提示した3案（①重し式：敵がボタンに乗っている間だけON ②ラッチ式：一度踏めば恒久ON ③**敵が石を押すギミック**）のうち、ユーザーが**③敵が石を押す**を選択。敵が移動経路上の石にぶつかると、プレイヤーの石押しと同じ向きに石を1マス押し出す。押された石がボタン（`BUTTON`）に乗ると、**既存の `checkStoneOnSwitch`（conditions.js）が「石 or プレイヤーが乗っていればON」**と判定して連動ゲート（`links`）を開く。つまりパズルの後半（石→ボタン→ゲート）は**完全に既存資産**で、新規実装は「敵に石を押させる」前半だけ。
- **なぜこの設計が最小か：**
  - 石がボタンを押し下げる機構（`checkStoneOnSwitch`・`ss.stoneSwitches` での石ON/OFFリセット）は石押しパズルで実装済み。**敵が押した石も `ss.stonePositions` に同じ形式で記録すれば、ボタン判定はそのまま流用できる**（石の出所がプレイヤーか敵かを区別しない）。
  - 敵の石押しは、プレイヤーの `tryPushStone`（player.js:168）と**同じ規則**（押し先が `tilePassable` かつ他の石・敵がいない）で1マス移動させ、`checkStoneOnSwitch()`＋`evaluateConditions()`＋`renderBoard/renderChars` を呼ぶだけ。
- **実装箇所（enemy-ai.js）：** 通常追跡 `enemyChase` の移動ループで、候補マスが `isPassableForEnemy` で塞がれたとき、その塞いだ原因が**石**なら `tryEnemyPushStone(e, my, mx)` を試す。押せたら敵もそのマスへ前進する。`enemyChase` は `Math.random` を一切使わない決定論的ロジックなので、`step()` ベースのテストで「敵が石をボタンへ押す→ゲートが開く」を再現できる（boss の hitAndAway は乱数依存なので、石押しは**通常敵＝CHASERなど非ボス**に持たせる）。
- **暴走防止（重要）：** 敵が石を押し続けて盤外やパズル外へ運ぶのを防ぐため、(a) 押せるのは1tickにつき石移動のクールダウン（プレイヤーと同じ実時間ガードではなく、敵 accum ベースの自然な間引き）、(b) 石の押し先がボタン上または通常床のときのみ許可（水/穴/壁は `tilePassable` が false なので自然にブロック）、(c) **敵が石を押す対象は「プレイヤーへ向かう経路上で石に当たったとき」だけ**（石を探しには行かない）。これでパズル設計者は「敵の追跡経路上に石とボタンを置く」だけで誘導パズルを作れる。
- **代替案：** ①重し式（敵がボタンに乗る）は `checkStoneOnSwitch` に敵位置チェックを足すだけでより簡単だが、ユーザーは「石を押す」方がパズルとして面白いと判断。②ラッチ式は 5-1 の色スイッチや射撃スイッチと機構が被るため不採用。
- **結果／影響：** `enemy-ai.js` に `tryEnemyPushStone` を新設し `enemyChase` から呼ぶ。`createEnemyAi` の deps に `getCurrentLayer`/`getStageKey`/`getSS`/`tilePassable`/`checkStoneOnSwitch`/`evaluateConditions`/`renderBoard`/`renderChars` を追加。`getStageStateSnapshot()` に `stonePositions` を追加（テスト観測用）。パズルは dungeon ステージに「CHASER + STONE + BUTTON + GATE(links)」で配置する。

### 2026-06-20 — Phase 5-1（設計）：色スイッチ・色ゲートは「ステージ単位の activeColor 1個＋色別 GATE タイル」の状態機械で実装する
- **決定（仕組み・ユーザー選択）：** 「**色セレクタ式**」を採用する。色ごとに専用スイッチタイルを置き（`SWITCH_RED`・`SWITCH_BLUE`、将来 `SWITCH_GREEN` 等）、**武器で叩くとそのステージの「アクティブ色 `ss.activeColor`」がその色に切り替わる**（トグルではなく**セット**）。ゲートも色別タイル（`GATE_RED`・`GATE_BLUE`…）にし、**`GATE_<c>` は `ss.activeColor === c` のときだけ通行可（＝開いて見える）**、それ以外は壁（閉じて見える）。これにより「赤を叩く→赤ゲート開・他色ゲート閉／青を叩く→青だけ開」という**排他切替パズル**が成立する。
- **既存スイッチとの決定的な違い（なぜ `links` を使わないか）：** 既存の `BUTTON`/`SWITCH`＋`links`（switchId→gateId）は**加算式**（スイッチON→そのゲートが開く・各リンクは独立）で、「ある色を開くと他色が閉じる」という**排他**を素直に表現できない。色ギミックの本質は「同時に1色だけ通れる」排他制御なので、`links` で個別ゲートを開閉するのではなく、**ステージに `activeColor` という単一の状態を持たせ、各ゲートが自分の色と一致するかだけを見る**のが最小かつ決定論的。`links` 機構には一切手を入れない（既存パズルに無影響）。
- **データ構造（最小）：**
  - 状態：`ss.activeColor`（文字列 `'red'|'blue'|...`／未設定時は `null`）。**1ステージにつき1個**。
  - 初期色：`stageData.initActiveColor`（例 `'red'`）。`getSS()` の初期化で `litTorches` の `initLitTorches` 種まきと同じ要領でセットする。未指定なら `null`（＝どの色ゲートも閉じた状態から開始）。
  - 永続化：`save.js` の createStageState / serialize / deserialize に `activeColor`（**プリミティブ文字列**なので Set↔配列変換は不要・そのまま代入）を追加。
  - スナップショット：`getStageStateSnapshot()` に `activeColor` を追加（テストで観測するため）。
- **タイル（セーブ互換のため新文字を割り当て・既存文字は不変）：** 実装フェーズで `shared/tiles.js` の TILE 一覧を grep して衝突なしを確認し、**以下の文字に最終確定**した：`SWITCH_RED='['`・`SWITCH_BLUE=']'`・`GATE_RED='('`・`GATE_BLUE=')'`（ASCII 記号4文字、既存タイルとは衝突しない）。
- **作用箇所（既存の SWITCH 経路に「色版」を1分岐ずつ足す）：**
  - **叩く＝色セット**：`player.js` に `setActiveColor(r, c)` を新設（`toggleSwitch` の隣）。前方タイルが `SWITCH_<c>` なら `ss.activeColor = c`＋SE＋`evaluateConditions()`＋再描画＋`saveGame()`。`combat.js`（剣）・`projectile.js`（矢・ビーム・※ブーメランも可）の **SWITCH ヒット分岐の隣に** 「色スイッチなら `setActiveColor`」を足す。ビーム貫通は既存 `proj._switchedCells` で1セル1回に制御（同じ仕組みを流用）。
  - **通行可否**：`passable.js` の GATE 分岐の隣に `if (tile===GATE_RED) return ss.activeColor==='red'; …` を追加（`openGates` は見ない＝色ゲートは links と独立）。
  - **描画**：`render-board.js` の GATE 分岐に倣い、色ゲートは「`activeColor` 不一致なら閉じたゲートスプライト（色付き）を描く・一致なら床」。色スイッチは「`activeColor===自色` のとき点灯フレーム」。スプライトは既存 `gateG`/`lever` のパレットを**色違い**にするだけ（[[blade-tile-sprite-single-source]] のとおり `shared/tile-sprites.js` の単一表に `{spr,pal}` を足す。絵文字は使わない）。
- **クリア判定（任意）：** `conditions.js` に新トリガー `activeColorIs`（`cond.color === ss.activeColor` で達成）を追加できる（torchesLit と同型）。ただし色ゲートを通り抜けて先に進む構造なら新トリガー無しでもパズルは成立するため、**最初は通行ギミックだけで実装し、必要になったらトリガーを足す**（YAGNI）。
- **エディタ対応：** 色スイッチ/色ゲートはタイルなので `shared/tiles.js` に足せばパレットに自動で出る。`stageData.initActiveColor` を `editor-canvas.js`/`editor-props.js` のステージ設定に1項目足す（`fluteEffect` と同じ要領）。`links` UI は色ギミックでは使わない（既存のまま）。
- **代替案：** (A) ユーザー提示の「クリスタル式（1種・赤青トグル）」→ 2色固定で実装は最小だが3色以上に拡張できず、スイッチ位置で色を撃ち分ける面白さが出ない。色セレクタ式なら色を足すだけで拡張できるので採用。(B) 既存 `links` を色対応に拡張（link に `color` を持たせ activeColor 一致時のみ開く）→ ゲートを links 経由で開閉する設計と、色ゲートを「自色が active か」で判定する設計が二重化し複雑。**色ゲートは links に依存させず自己完結させる**方が単純。(C) `activeColor` を複数色同時 ON（Set）にする→「同時に1色」という排他の手触りが消える。単一値が正解。
- **結果／影響（実装フェーズ＝⚡ Sonnet の作業見積り）：** `shared/tiles.js`（色スイッチ2＋色ゲート2タイル＋META）・`shared/tile-sprites.js`（4タイルの{spr,pal}）・`shared/sprites-tiles.js`（色違いパレット）・`game/save.js`（activeColor 3箇所）・`game/game.js`（getSS で initActiveColor 種まき・snapshot に activeColor・配線）・`game/player.js`（`setActiveColor`）・`game/combat.js`＋`game/projectile.js`（色スイッチヒット分岐）・`game/passable.js`（色ゲート通行判定）・`game/render-board.js`（色ゲート/色スイッチ描画）・editor 2ファイル・`work/blade-of-lumia.json`（パズル1つ：1本道を赤青ゲートで交互に塞ぎ、離れた色スイッチを撃ち分けて進む配置・石碑ヒント）。`tests/color-switch.spec.js`（赤を叩くと赤ゲートが通行可・青ゲートが不可／青を叩くと反転／activeColor が snapshot に出る）。**新サブシステムは `activeColor` 1個だけ**で、既存の SWITCH/GATE 経路に色分岐を足す形に収める。

### 2026-06-20 — Phase 4-5 ①（呼称・見た目の整理）：踏むやつを「ボタン」、武器で押すやつを「スイッチ」に。スイッチは剣でもトグル可
- **決定（ユーザー指示）：** ギミックを2タイルに**呼び分け**る。(1) 従来の「乗っている間だけ ON」のモーメンタリ式＝**ボタン `BUTTON`**（タイル文字 `'S'`）。(2) 新設した「武器の攻撃で ON↔OFF トグル」＝**スイッチ `SWITCH`**（タイル文字 `'Y'`）。**見た目も分ける**：ボタンは押し込み式で、プレイヤー/石が乗っている（ON）ときに「押された」見た目（沈み込み＋発光、従来の光る効果は維持）。スイッチは ON のとき発光（紫系の的）。さらに**スイッチは矢だけでなく剣・剣ビームなど武器の攻撃でもトグル**できるようにする。
- **理由：** 直前の実装（2026-06-20 前エントリ）で「踏む＝SWITCH／矢＝ARROW_SWITCH」という命名にしたが、ユーザーの語感では**踏むのは『ボタン』・武器で作動させるのが『スイッチ』**が自然。呼称と見た目を合わせることで役割が直感的になる。「スイッチは剣でも反応」はゼルダの目玉/クリスタルスイッチの手触りに近く、矢が無くても解けるようにして詰みを防ぐ。
- **実装：** タイル文字はセーブ/JSON 互換のため `'S'`（BUTTON）・`'Y'`（SWITCH）のまま。状態 Set は `switchStates`（ボタン・モーメンタリ、従来名を維持）と `switchToggles`（スイッチ・トグル、旧 `arrowSwitches` から改名）に分離。剣トグルは `combat.js` の `swordAttack` で前方タイルが SWITCH なら `toggleSwitch(tr,tc)` を呼ぶ（ボタン BUTTON は剣では無反応＝役割分離）。剣ビーム（貫通）は `proj._switchedCells` で「1セル1回」だけトグル。矢は当たって消滅＝1本1トグル。ボタンの「乗っている間 ON」挙動（`checkSwitchOff`・石スイッチ `conditions.js`）は BUTTON タイルを参照するよう更新（挙動は不変）。
- **代替案：** (A) スイッチを矢専用のままにする → 矢を持たないと解けず詰みやすい。武器全般でトグル可にして回避。(B) ボタンとスイッチを1タイルでフラグ切替 → 見た目・判定・パズル設計が分岐だらけになる。タイルを分ける方が明快（前エントリの判断を踏襲）。
- **結果／影響：** `shared/tiles.js`（BUTTON/SWITCH 呼び分け）・`game/player.js`（`toggleSwitch`・checkSwitchOff は BUTTON）・`game/combat.js`（剣トグル）・`game/projectile.js`（矢/ビームトグル）・`game/conditions.js`（BUTTON 参照）・`game/game.js`（配線・snapshot の `switchToggles`）・`game/save.js`（`switchToggles`）・`game/render-board.js`＋`render-chars.js`＋`css/board.css`（ボタン押し込み／スイッチ発光）・editor 3ファイル・`work/blade-of-lumia.json`（hint 文言）。`tests/arrow-switch.spec.js` 4本（剣トグル追加）。**全84テストグリーン**。テストで `switchStates['6,9']` が undefined＝**ボタン機構に無作用**を回帰固定。

### 2026-06-20 — Phase 4-5 ①（設計修正）：矢で撃つスイッチは既存 SWITCH を流用せず、専用タイル ARROW_SWITCH を新設する
> ※ このエントリの直後（同日）に、呼称を「ボタン（踏む）／スイッチ（武器）」へ整理し直した（上記エントリ参照）。`ARROW_SWITCH('Y')` は `SWITCH('Y')` に、旧 `SWITCH('S')` は `BUTTON('S')` に改名。状態 Set `arrowSwitches`→`switchToggles`。
- **決定：** 「弓矢で撃つスイッチ」は **既存の踏みスイッチ `SWITCH('S')` を流用せず、新タイル `ARROW_SWITCH('Y')` を新設**して実装する。矢が当たるたび ON↔OFF を**トグル**し、プレイヤーが乗っても無反応。状態は `ss.arrowSwitches`（ON のものだけ保持する Set）で `switchStates` とは完全に分離する。
- **理由（ユーザー指摘で当初設計を撤回）：** 当初の設計（DECISIONS 2026-06-19 ①）は「既存 SWITCH を矢で撃ったら `ss.shotSwitches` に記録してラッチ ON にし、`checkSwitchOff` の OFF 対象から除外する」だった。しかし**既存の踏みスイッチは「プレイヤー（または石）が乗っている間だけ ON＝モーメンタリ式」という性質そのものでパズルが成立している**（例：スイッチに乗り続ける／石を乗せる必要がある謎解き）。これを矢でラッチ ON できるようにすると、「踏みっぱなしでないのに ON 状態」が作れてしまい**既存パズルが破綻する**。種別が違う2つの挙動を同一タイルにフラグで同居させるべきではない。
- **代替案：** (A) 既存 SWITCH にラッチ挙動を足す（当初案）→ 上記のとおりモーメンタリ前提の既存パズルを壊すので却下。(B) ステージデータで「このスイッチは矢ラッチ可」とフラグ指定 → 同一タイルに2挙動が同居し描画・判定が分岐だらけになる。タイルを分ければ判定も描画もパズル設計も明快。
- **実装：** `toggleArrowSwitch(r,c)` を player.js に新設（既存 `handleTileEvent` の SWITCH 分岐・`checkSwitchOff` は**無改修**＝モーメンタリ挙動を保全）。`projectile.js` の矢サブステップで「ARROW_SWITCH に当たったらトグルして矢消滅」。連動ゲートは既存 `links`（switchId→gateId）をそのまま使い `openGates` を開閉（ON→add／OFF→delete）。描画は render-board に分岐＋紫系フィルタの的（CSS）。save.js に `arrowSwitches` を永続化。
- **結果／影響：** `shared/tiles.js`（ARROW_SWITCH）・`game/player.js`（toggleArrowSwitch・既存 SWITCH は無改修）・`game/projectile.js`・`game/game.js`・`game/main.js`・`game/save.js`・`game/render-board.js`・`game/css/board.css`・`editor/editor-palette.js`・`work/blade-of-lumia.json`（dungeon_1 2,2 にパズル）。`tests/arrow-switch.spec.js` 3本（ON でゲート開／移動後も ON 維持＝トグルでモーメンタリでない／再射で OFF＆ゲート閉）。テストで `switchStates['6,9']` が `undefined`＝**既存スイッチ機構に一切作用しない**ことを保証。**全83テストグリーン**。
- **学び：** 「既存の仕組みを再利用して新サブシステムを増やさない」は良い原則だが、**再利用先の挙動がパズルの前提になっている場合は流用してはいけない**。挙動の意味が異なる（モーメンタリ vs トグル/ラッチ）なら、タイルを分けて状態 Set も分けるのが正解。共通核（投擲物→タイル状態）は保ちつつ、作用先のタイルだけ別にする。

### 2026-06-19 — Phase 4-5（設計）：組み合わせギミックは「投擲物/爆弾がタイル状態に作用する」共通核で実装し、新サブシステムを増やさない
- **決定（仕組み設計）：** Phase 4-5 の3サブギミック（①弓矢で遠くのスイッチを撃つ ②ブーメランで炎を操作 ③爆弾＋特定タイルの組み合わせ）は、**「投擲物・爆弾が『敵/壁』だけでなく『タイルの状態』に作用する」** という1つの核に集約して実装する。新しい飛翔体ループや専用パズル管理機構は作らず、既存の `projectileTick`／`boomerangStep`／`explodeBomb`／`showConditions` に最小の分岐を足す。
- **① 弓矢で遠くのスイッチを撃つ（既存 SWITCH を再利用）：**
  - 新タイルは作らず既存 `SWITCH('S')` を流用。`projectile.js` の直線投擲物のサブステップ補間ループ（トンネリング防止で既に毎セルを通過チェックしている箇所）に、**「矢が `SWITCH` セルを通過したらそのスイッチを ON にする」** 分岐を足す。
  - **「撃って ON にしたスイッチ」は離れても OFF にならない（ラッチ）**：踏むスイッチ（プレイヤー/石）は離れると `checkSwitchOff` で OFF になるが、矢で撃ったものは `ss.shotSwitches`（新 Set）に記録し、`checkSwitchOff` の OFF 対象から除外する。これで「徒歩では届かない位置のスイッチを矢で撃って恒久的にゲートを開ける」謎解きが成立する（踏みっぱなしが要らない＝初代ゼルダの「目玉スイッチ」相当）。
  - ON 処理は既存の `SWITCH` 踏み処理（`handleTileEvent` の switch 分岐）と**同じロジック**（`ss.switchStates[pk]=true` → links の `openGates.add(gateId)` → `evaluateConditions()`）を共通ヘルパー化して矢からも呼ぶ。`playSound('switch')`。
  - **対象を弓矢だけにするか**：当面は弓矢（arrow）のみ。ブーメランは②で炎用途に使うため、スイッチ撃ちは矢に限定して役割を分ける（必要なら後でブーメランも撃てるよう緩める）。
- **② ブーメランで炎を操作（新タイル TORCH）：**
  - 新タイル **`TORCH('Y')`（かがり火）** を追加。点灯/消灯状態は **`ss.litTorches`（新 Set・save.js でシリアライズして永続）** で管理（初期点灯はステージデータ側で `litTorches` 初期値を持たせるか、`objects`/専用フィールドで指定）。描画は点灯＝明るい炎・消灯＝暗い台座（render-board の addCellSprite に分岐／当面は CSS/絵文字フォールバックでも可）。通行は基本不可（台座）か通行可かは配置設計で選べるようにする（初期は通行不可の障害物兼ギミックスイッチとして扱う）。
  - **ブーメランが「火を運ぶ」**：`boomerangStep` の通過セル処理（既に `collectFieldItem` を呼んでいる箇所）に炎運搬を足す。ブーメランが**点いた TORCH を通過すると `proj.flaming=true`（火を拾う）**、**消えた TORCH を通過しているとき `proj.flaming` なら点火**（`ss.litTorches.add`→`evaluateConditions()`）。逆に「炎を消す」演出にしたい場合は、水セル通過で `proj.flaming=false`、点いた TORCH 通過で消灯、という対称ルールも選べる（初期実装は**点火方向**＝「離れたかがり火に火を運んで全部点ける」を主軸にする＝初代ゼルダのロウソク/松明パズルに近い）。
  - ロウソク（前方炎）・爆弾AOE でも TORCH を点火できるようにし、「火種をどう運ぶか」を複数アイテムで解ける設計にする（ブーメランは"遠くまで運ぶ"、ロウソクは"隣接で点ける"、爆弾は"範囲で一気に"）。
- **③ 爆弾＋特定タイルの組み合わせ：**
  - `explodeBomb` の AOE ループは既に「壊せる壁 BREAKABLE_WALL を壊す」「敵にダメージ」を行っている。ここに **「AOE 内の TORCH を点火する」** 分岐を足す（②と同じ `ss.litTorches.add`→`evaluateConditions()`）。これで「爆弾を置いて一帯のかがり火を同時点火」という組み合わせが作れる。
  - 追加の特定タイルが必要になれば同じ AOE ループに分岐を足すだけで拡張できる（例：ひび割れ床 `CRACKED_FLOOR` を爆弾で開ける等は将来 Phase 5 で）。今回は TORCH 点火だけに絞る。
- **クリア（ギミック達成）判定：** `showConditions` に**新トリガー `torchesLit`** を足す（笛 `flutePlayed`・ロウソク `bushBurned`・既存 `allSwitchesOn` と同型）。`met = (ステージ内 TORCH の総数>0) && すべて ss.litTorches に含まれる`。これで「全かがり火点灯で隠し扉/宝箱が出現」が gate できる。`conditionsMet` が永続性を担うので一度達成したら戻らない。
- **既存システムの再利用が肝（新サブシステムを作らない）：**
  - スイッチ：既存 `switchStates`/`links`/`openGates`/`checkSwitchOff` をそのまま使い、ラッチ用の `shotSwitches` を1つ足すだけ。
  - 炎運搬・点火：`boomerangStep`/`explodeBomb`/`playCandle` の既存ループに「TORCH を litTorches に追加」する分岐を足すだけ。新しい火管理ループは作らない。
  - 発見/達成：`showConditions`/`conditionsMet` の hide/reveal パイプライン（笛・ロウソクで確立済み）に `torchesLit` トリガー1個を足すだけ。隠し入口の遷移ゲート（`checkStageTransition` の showConditions 判定）もトリガー非依存なのでそのまま効く。
  - 永続化：`save.js` の `serializeStageState`/`deserializeStageState` に `litTorches`（Set→配列）と `shotSwitches` を追加（`cutBushes`/`brokenWalls` と同じ要領）。
- **代替案：**
  - (A) スイッチを矢で撃ったら「一定時間だけ ON（タイマー式）」→ 論理時間タイマー管理が増え、テストも非決定的になりやすい。**ラッチ（撃ったら恒久 ON）**にして状態を1 Set で表す方が単純で謎解きとしても素直。必要になればタイマー式は別途。
  - (B) 炎を `player` のフラグや専用エフェクト管理で持つ → ブーメランが火を運ぶので状態は**投擲物オブジェクトの `proj.flaming`** に持たせるのが自然（投擲物消滅で火種も消える）。TORCH の点灯状態だけ ss に永続させる。
  - (C) TORCH を作らず既存タイルで代用（例：かがり火＝スイッチ扱い）→ 「炎を運ぶ」という視覚的・意味的に独立したギミックなので専用タイルを足す方が分かりやすい。タイル追加コストは tiles.js に1行＋描画分岐だけで軽い。
  - (D) 3ギミックを別々の独立機構で作る → 「投擲物/爆弾→タイル状態」という共通核を見落として重複実装になる。核を1つにして分岐で表現する。
- **エディタ対応（Phase 4 共通ルール）：** 新タイル TORCH をパレットに追加（tiles.js の TILE/TILE_META に足せば自動でパレット表示）。`showConditions` のトリガー選択に **`torchesLit`** を追加（editor-props.js）。プレビュー設定トグルは新アイテムを増やさない（弓矢・ブーメラン・爆弾・ロウソクは既存）ので**追加不要**だが、テスト用に「TORCH 初期点灯」をステージデータで指定できるようにする。**[[blade-preview-settings-duplicated]]** は新トグルを足さないので今回は無関係。
- **実装の進め方（次フェーズ ⚡ Sonnet・1サブギミックずつ）：** ①弓矢スイッチ（最も既存資産で完結・低リスク）→ ②TORCH タイル＋ブーメラン炎運搬 → ③爆弾点火＋`torchesLit` トリガー の順。各ステップで `tests/` にスモークを足してグリーン確認（①矢で離れたスイッチが ON になりゲートが開く＋離れても ON 維持／②ブーメランで消えた TORCH が点く／③爆弾AOEで TORCH が点く・全点灯で `torchesLit` の隠し要素が出る）。
- **結果／影響（予定）：** `shared/tiles.js`（TORCH）・`game/projectile.js`（矢のスイッチ点火・ブーメラン炎運搬）・`game/player.js` or `game/game.js`（共通スイッチ ON ヘルパー・`shotSwitches` ラッチ）・`game/conditions.js`（torchesLit トリガー）・`game/game.js`（playCandle で TORCH 点火）・`game/save.js`（litTorches/shotSwitches シリアライズ）・`game/render-board.js`（TORCH 描画）・`editor/editor-props.js`（torchesLit トリガー）・`work/blade-of-lumia.json`（3ギミックのパズル配置）。実装は次セッション（Sonnet）で1サブギミックずつ。

### 2026-06-18 — Phase 4-3：ロウソクは「笛と同型の active magic サブアイテム」とし、既存の cutBushes 機構を再利用、発見は showConditions の新トリガー bushBurned で行う
- **決定（仕組み設計）：** ロウソク（candle）は **笛（flute）と完全に同型の active magic サブアイテム**（`subItems.candle`・`type:'magic'`・`uses:Infinity`・`hasCandle` フラグは作らない）。使うと **前方セル（heroDir 由来）の茂み（BUSH）を燃やす**：既存の「剣で茂みを切る」機構 `ss.cutBushes`（Set）に posKey を追加して通行可化し、描画も既存の render-board の cutBushes 分岐に乗せる（新しい消去ロジックを作らない）。さらに燃やしたら **ステージ単位の `ss.bushBurned=true`** を立て `evaluateConditions()` を呼ぶ。`showConditions` に新トリガー **`bushBurned`** を足し、これで gate された隠し通路・隠し入口 `>`・隠しアイテムが出現する（笛の `flutePlayed` トリガーと1対1で同型）。
- **「剣で切る」と「ロウソクで燃やす」の役割分担：** 両者とも `cutBushes` で通行可化するが、**`bushBurned` を立てるのはロウソクだけ**。これで「剣でも茂みは退けられる（通行可）が、ロウソクで燃やさないと隠し通路は現れない」という発見専用の役割をロウソクに持たせられる。combat.js の茂み切り（`swordAttack`）は `bushBurned` を触らないので既存挙動は不変。
- **既存システムの再利用が肝（新サブシステムを作らない）：** (1) 燃焼＝`cutBushes`（剣切りと共有・save.js でシリアライズ済み＝燃やした茂みは永続）。(2) 発見＝`showConditions`/`conditionsMet` の hide/reveal パイプライン（笛と同じ・`conditionsMet` が永続性を担い `bushBurned` 自体は揮発フラグで save 不要）。(3) 隠し入口の遷移ゲートも笛で追加済みの「`checkStageTransition` の MAP_ENTER 分岐で `showConditions` 未達なら遷移しない」をそのまま流用（トリガー非依存なので `bushBurned` でも効く）。新規実装は「`playCandle()`＋炎演出＋`bushBurned` トリガー1個」のみ。
- **炎演出は再描画の後に出す（ハマりどころ）：** `showCandleFireEffect` は炎 div を `charLayerEl` に append するが、**`renderBoard()`/`renderChars()` は charLayerEl を作り直す**ため、先に append すると再描画で消える（笛の warp 演出は遷移するので顕在化しなかった）。`evaluateConditions()→renderBoard()→renderChars()` の**後**に演出を出すことで解決。前方が茂みでない（再描画しない）分岐では先に出してよい。
- **代替案：** (A) `player.hasCandle` フラグ＋専用ボタン → 笛と同じくサブアイテム導線に乗らず UI が増えるので却下（active サブアイテム化で既存の装備切替・モバイルボタンに相乗り）。(B) 燃焼用に新しい焼却済みフラグ Set を新設 → `cutBushes` が既に同じ役割（通行可化＋描画消去）なので二重実装になり却下。(C) 剣でも `bushBurned` を立てる → ロウソク固有の「発見」価値が消えるため却下（剣＝通行可化のみ・ロウソク＝通行可化＋発見、で役割分離）。
- **エディタ対応（Phase 4 共通ルール）：** プレビュー設定に「🕯 ロウソク」トグル（`ps-candle`・デフォルト ON）を **両方の getPreviewSettings（editor-io.js と editor.js の重複定義）に追加**（[[blade-preview-settings-duplicated]]）。宝箱内容に「ロウソク」選択肢、showConditions のトリガーに「bushBurned」を追加。
- **結果／影響：** `shared/items.js`（candle）・`game/conditions.js`（bushBurned）・`game/game.js`（`playCandle()`/`showCandleFireEffect()`・useSubItem 分岐・ps_candle・getState の hasCandle）・`shared/sounds.js`（`fire` SE）・`game/css/effects.css`（`.candle-fire`）・editor 4ファイル・`work/blade-of-lumia.json`（field 2,0 にロウソク宝箱＋茂み＋bushBurned 隠し入口→secret_grotto を再利用）。`tests/candle.spec.js` 4本（所持/active・燃やすまで遷移しない・燃やすと出現して遷移・前方が茂みでなければ出現しない）＋**全75テストグリーン**。

### 2026-06-17 — Phase 4-2：笛は「active サブアイテム＋ステージ単位の `fluteEffect` データ駆動」で実装し、reveal は showConditions、warp は exitRegistry を再利用する
- **決定（仕組み設計）：** 笛（フルート）は **active サブアイテム**（ブーメラン/弓矢と同型・`useSubItem` で発動・`type:'magic'`・`uses:Infinity`）。`player.hasFlute` のような専用フラグは作らず `player.subItems.flute` で管理する（save/load は player 丸ごと JSON 化で自動対応）。効果は **ステージ単位のデータ `stageData.fluteEffect`** で表す：
  - `{ type:'reveal' }` → そのステージの `ss.flutePlayed=true` にして `evaluateConditions()` を呼ぶ。`showConditions` に新トリガー **`'flutePlayed'`** を足し、これで gate された隠しタイル（隠しダンジョン入口 `>`・隠しアイテム等）が出現する。
  - `{ type:'warp', destId }` → `exitRegistry[destId]` の登録先へワープ（`checkStageTransition` の MAP_ENTER 分岐と同じ `enterStage` 遷移を再利用）。ワープ着地点は宛先ステージの `mapEnters` に `id` だけ登録すれば `'>'` タイル無しでも exitRegistry に載る（描画・VRT に影響しない）。
  - `fluteEffect` 無し → 「ここでは何も起きない」とメッセージのみ（笛の音 SE は鳴らす）。
- **既存システムの再利用が肝（新サブシステムを作らない）：**
  - reveal は **showConditions の hide/reveal 描画パイプライン**（render-board.js が `conditionsMet` 未達のタイルを描画しない）をそのまま使う。`conditionsMet` は save.js でシリアライズ済みなので、**一度笛で出した入口は再訪・リロード後も出たまま**になる（`flutePlayed` 自体は揮発フラグで save 不要＝conditionsMet が永続性を担う）。
  - warp は **exitRegistry + enterStage**（ダンジョン入口と同じ）を再利用。新しいワープ管理機構は作らない。
- **「特定の場所」はセル単位でなくステージ単位にした理由：** 初代ゼルダの笛（レベル7出現・湖の near で吹けば反応）も実質エリア単位。セル完全一致を要求すると「正しいマスを総当たり」になりストレス。ステージに居れば吹いて反応する方が探索の手触りが良い（どのステージで吹くかが謎解き）。1ステージ1効果に限定すると reveal/warp が衝突せず実装も単純。
- **代替案：** (A) `player.hasFlute` フラグ＋専用ボタン → サブアイテムスロットの既存導線（装備切替・モバイルボタン）に乗らず UI が増える。active サブアイテム化で既存導線に相乗りできるため却下。(B) セル単位 `fluteSpots{"r,c":...}` → 上記の総当たりストレス＋編集も煩雑で却下。(C) reveal 専用の新しい可視化フラグ → showConditions が既に同じことをしており二重実装になるため却下（`flutePlayed` トリガー1個追加で済む）。
- **エディタ対応（Phase 4 共通ルール）：** プレビュー設定に「🎵 笛」トグル（`ps-flute`・デフォルト ON）を **両方の getPreviewSettings（editor-io.js と editor.js の重複定義）に追加**（[[blade-preview-settings-duplicated]] の教訓）。宝箱内容に「笛」選択肢、右パネルに `fluteEffect` 編集セクションを追加。
- **結果／影響：** `shared/items.js`（flute）・`game/game.js`（`playFlute()`・useSubItem 分岐・ps_flute・getState）・`game/conditions.js`（flutePlayed トリガー）・`game/css/effects.css`（ワープ渦巻き演出）・editor 4ファイル・`work/blade-of-lumia.json`（笛宝箱＋reveal/warp デモ）。`tests/flute.spec.js` を追加。

### 2026-06-16 — Phase 4-1b：はしごは「常設の地形」ではなく「渡っている間だけ足元に出る一時的な橋」として描く
- **決定：** はしご（初代ゼルダの伝説式）の描画は「**プレイヤーが1マス幅の水/穴に踏み込んでいる間だけ、その足元の橋セルに1枚出す。渡り切ると消す**」。常設しない・プレイヤー要素にも入れない（追従させない）。char-layer 内の `.char-ladder`（セル固定・`transition:none`・`z-index:-1`）として描き、毎更新で全削除→今の足元セルだけ敷き直す。向きはセルの地形（左右地上＝横／上下地上＝縦）、z-index はセル描画より上・プレイヤー/敵より下（ユーザー指定）。
- **理由（2回外した反省）：** v1 はプレイヤー要素内に入れて「張り付いて一緒に動く」誤り。v2（私の誤実装）は「セル固定」を「**常設**」と取り違え、架かりうる橋セル全部に出しっぱなしにした（水路に縦にはしごが並び続けた）。正しくは「セル固定＝そのセルに留まる」だが「**渡っている間だけ存在する一時的な橋**」であること。出現条件は「隣接」ではなく「プレイヤーの体がその水/穴セルに重なっている」。
- **代替案：** ①「橋セルを永続的に渡れる地形にする」＝常設描画（v2）→ 初代ゼルダの手触りと違う・水路が常時はしごで埋まる。②「プレイヤー要素の子に入れる」（v1）→ 追従して別セルへ動く。いずれも却下。採用は「char-layer にセル固定の独立要素・毎回敷き直し」。
- **結果／影響：** `passable.js` に `ladderOrientationAt(r,c)` を新設・export し描画と通行判定で橋ロジックを共有。`render-chars.js` の `updateLadderOverlay()` が `updatePlayerCharEl`/`renderChars` から呼ばれる。テストは「常設」を緑にしていた誤りを正し「渡り中だけ出る／渡り切ると消える」に書き直し（テストが仕様の取り違えを追認していた＝仕様を口で言う前に1ステップずつ言語化してユーザー確認すべきという教訓）。全58テストグリーン。

### 2026-06-16 — Phase 3-2（採用）：大型ボスは「向き切替＋揺れアニメ」で動かし、欠片整合は `dropsTriforce` フラグで一般化する
- **決定（ユーザー方針）：** 岩のゴーレム（2×2）を**正式採用して dungeon_1（最初のダンジョン）のボスにする**。さらに**大型敵を複数種つくる**方針。ただし「正面固定で止まって見える」のが不満なので、まず1体目を「**動く大型ボス**」として完成させてから量産に入る（型を固める）。
- **「動いてる感じ」は (a) 向き切替 (b) 待機揺れアニメ の2本立てで出す：** (a) ボス化して `hitAndAway` AI に乗せると、毎tick プレイヤー方向へ `e.sprite` を `rockGolem{D/R/L/U}` に切替（左は flipX）。ゴーレムは正面シルエットが左右対称なので**向きエイリアス4つは同じ絵を流用**（`ENEMY_SPRITES.rockGolemR = rockGolem` 等）。(b) `board.css` に `@keyframes golem-lumber`（上下＋左右ロール＋わずかな伸縮）を追加し `.char-abs.large-enemy canvas.sprite` に適用、`applyEnemySize` で wrapper に `large-enemy` クラスを付与。向き切替だけだと遠距離で止まって見え、揺れだけだと方向感が出ないため両方入れる。
- **AI のスプライト差し替えは大型サイズを吹き飛ばすので再適用が必要：** `bossTickHitAndAway` の向き切替は canvas を remove → `makeSprite` で作り直して insert する。新 canvas は CSS の `width: var(--cell) !important` で 1セルに縮むため、差し替え箇所で `e.w/e.h>1` なら `setProperty('width','100%','important')` を再適用する。揺れアニメは wrapper の `large-enemy` クラス経由（アニメ対象は内側 canvas）なので差し替えても効き続ける。
- **欠片整合は汎用フラグ `dropsTriforce` に一般化：** ボスの「撃破で星の欠片を落とす」「全収集の必要数にカウントする」を、従来の `boss.type === TILE.DARK_LORD` 決め打ちから `ENEMY_META[type].dropsTriforce` 参照に変更（`onBossDefeated` のドロップ分岐・`calcTotalTriforces` のカウント両方）。dungeon_1 の魔王 X×1 を G に置換しても、X×6 + G×1 + 直接欠片2 = **合計9個のまま不変**。これで大型ボスを複数種足してもタイル文字ごとに boss.js を条件分岐で汚さずに済む。
- **代替案：** (A) 大型ボスを `enemyChase`（通常追跡）のまま置く → 向きが変わらず「動いて見えない」不満が残る。`hitAndAway` に乗せて向き切替を得た。(B) 向きごとに別の絵を描く（4方向×2フレーム=8枚）→ 1体目は対称シルエットで足りるので流用。非対称な2体目以降で必要になったら描く。(C) 欠片ドロップを `isFinalBoss` のようにタイル種別で分岐し続ける → 種類が増えるたび分岐が増えるため `dropsTriforce` フラグで一般化した。
- **結果／影響：** dungeon_1 ボス部屋 `2,0` の X を G に置換、開始村の試作 G は撤去。実機（一時 spec・確認後削除）でゴーレムが 2×2 描画・`large-enemy` クラス・ボス部屋ロック演出・AI 40step エラーなし・右隣で `rockGolemR` 向き切替＋大型維持を確認。**全45テストグリーン**（VRT は試作G撤去で起動画面が元に戻り更新）。**大型敵の“型”が確立**：size＋dropsTriforce＋揺れアニメ＋向きエイリアスで「動く大型ボス」が作れる。次は2体目以降をテーマ別ダンジョンボスとして量産（スプライト→meta→エイリアス→配置の反復）。

### 2026-06-16 — Phase 3-2：大型ボスは「ENEMY_META.size:{w,h} の汎用機構」で実装し、まず新規 2×2 敵1体で検証する
- **決定（ユーザー方針）：** 既存ボスをいきなり大型化せず、**汎用の `size:{w,h}` 機構を入れた上で新規に 2×2 敵を1体だけ作って動作確認**する。うまく作れることを確認してから「どのステージのボスに size を付けるか／複数種の大型敵を作るか」を改めて決める。試作の `ROCK_GOLEM('G')`「岩のゴーレム」は**当面 `isBoss:false` の大型通常敵**にして、ボス演出（HPバー・部屋ロック・撃破ドロップ）を絡めず size 機構そのものだけを純粋検証する。
- **size は ENEMY_META の任意フィールド（省略時 1×1）：** `buildEnemies` が `e.w = m.size?.w ?? 1` / `e.h = ...` を付与。既存の全敵は size 未指定なので自動的に 1×1 となり挙動不変。「2つ目以降の大型敵」も meta に `size:{w:2,h:2}` を足すだけで増やせる。
- **当たり判定はすべて「占有範囲(AABB)」ベースに一般化し、1×1 では従来挙動と完全一致させる：** 共通ヘルパー `game/hitbox.js` を新設。
  - `enemyPointHit(e, px, py, margin)`：点が敵の箱に入るか。**1×1 のとき `|px-e.x|<margin && |py-e.y|<margin` と完全一致**（halfX=halfY=0）。w/h が大きいほど箱が body 中心へ移り半幅が `(w-1)/2+margin` に広がる。投擲物/ビームの `checkProjHit`（margin 0.6）と接触ダメージ `checkEnemyContact`（margin 0.9）に適用。
  - 剣 `swordAttack`：敵中心 `enemyCenter(e)` への射影距離・直交距離で判定する既存ロジックに、**攻撃方向に沿った body 半サイズ `halfFwd` を届く距離に・直交方向の半サイズ `halfSide` を横の許容幅に加算**。1×1 では halfFwd=halfSide=0 で従来と一致し、大型敵は「中心が遠くても手前の面で当たる」。
- **敵の移動判定 `isPassableForEnemy` を w×h 占有に拡張：** 占有セル全部を壁チェック、石・他敵・プレイヤーとの重なりは AABB 重なり判定にした。プレイヤー側 `isPassable` の「敵セルに入れない」判定も、大型敵の占有 w×h セル全部をブロックするよう変更（プレイヤーが大型敵にめり込めない）。
- **描画は wrapper を w×h セルに拡げ canvas を全面追従：** `render-chars.js` に `applyEnemySize(wrapper, e, cellPx)` を追加。CSS の `canvas.sprite { width/height: 1セル !important }` を `100% !important` で上書きし、wrapper を `w*cellPx × h*cellPx`・`z-index:6`（前面）に。スプライトは 24×24（2×2 セル相当）の `rockGolem` を `sprites-enemies.js` に新規作成（眼が光る岩塊・2フレーム）。
- **代替案：** (A) ザーネル/全魔王を即 2×2 化 → 8ボス部屋のレイアウト整合確認が要り影響大。ユーザーが「まず1体試作」を選択したため却下。(B) 大型ボス専用の当たり判定関数を別建て → 1×1 と分岐が二重化しデグレ源になる。占有範囲ヘルパーで一本化し「1×1 は箱が潰れて従来一致」にした方が安全。(C) スプライトを後回しで絵文字フォールバック → 大型は見た目のインパクトが要点なので 24×24 ドット絵を先に作った。
- **結果／影響：** 新規 `tests/large-enemy.spec.js` 3本（2×2 のビーム手前面ヒット・剣リーチが body 半分ぶん拡大・1×1 デグレなし）＋**全46テストグリーン**。実機（一時 spec・確認後削除）で field 1,0 に置いた `G` が wrapper 144×144px（=2×72セル）・24×24 canvas・JSエラーなしで描画されることを確認。**試作ゴーレムは開始村（field 1,0 row3,col8）に配置**したので歩いてすぐ戦える（VRT 起動画面が変わるため基準画像 `game-start.png` を更新）。**次の判断ポイント：** 動作確認後、どのボスに size を適用するか・大型敵を複数種作るかをユーザーと決める（試作ゴーレムは検証用なので、本採用しないなら撤去 or ダンジョン敵化する）。

### 2026-06-16 — Phase 3-1：チャージ攻撃は「押下で即剣＋論理時間チャージ」、ビームは既存投擲物に相乗りで実装する
- **決定（仕様・ユーザー確定）：** 攻撃ボタンを**押した瞬間に必ず通常の剣**を出す（既存 `swordAttack()` をそのまま発火）。同時に**押しっぱなしでチャージ開始**し、**離した時のチャージ量**で発射を決める：1/4(`CHARGE_MIN_RATIO`)未満=ビームなし／1/4以上=弱ビーム（剣ATK・非貫通）／満タン(`CHARGE_FULL_MS`)=強ビーム（剣ATK×`BEAM_STRONG_MULT`・貫通）。**チャージ中は移動できるが移動速度0.5倍**。初代ゼルダの「HP満タンでビーム」より自由度が高く、ALttP のスピン斬りチャージに近い手応えにする。
- **チャージ状態は論理時間 `gameNow()` 基準の `_chargeStart` 1個で表す：** 押下時刻を記録し、離した時に `(gameNow()-_chargeStart)/CHARGE_FULL_MS` で割合を出すだけ。Phase 0-1 の `step()` でフレームを進めれば決定的にテストできる（飛行 `player.flying` と同じ "1状態＋トグル" パターンの再利用）。`startCharge` はキーリピート対策で「既にチャージ中なら何もしない」。
- **ビームは新規の飛翔体システムを作らず、既存 `projectile.js` の `addProjectile({type:'beam'})` に相乗りさせる：** トンネリング防止の区間補間・境界/壁判定・`checkProjHit` がそのまま効く。新規対応は2点だけ——(1) `createProjEl` に beam の CSS 描画分岐（専用スプライト未作成のため `.sword-beam`/`.beam-strong` で光の刃を描く。横/縦で width/height を入替）、(2) `checkProjHit` に**貫通対応**（`proj.piercing` のときは `_hitIds` Set で同一敵の二重ヒットを防ぎつつ消えずに飛び続ける）。
- **`piercing` は弓矢で既に宣言されていたが checkProjHit で未実装だった**（矢は実際には最初の敵で消えていた）。今回ビームのために貫通ロジックを正しく実装した。矢の挙動は据え置き（当面ビームのみ満タンで貫通）。
- **モバイルの「押しっぱなし」は `click` では取れない：** 剣ボタンを touchstart/touchend + mousedown/up/leave に変え、`_swordHeld` フラグで多重 press を防ぎ、touchcancel/mouseleave での release 漏れも塞いだ。PC はキーボードなので「攻撃キー長押し＋方向キー移動」が自然に両立する。
- **新モジュール `charge.js`（`createCharge` factory）に隔離：** Phase 0-2 の factory + getter 注入方式を踏襲（deps は `gameNow`/`getPlayer`/`getHeroDir`/各種フラグ getter/`addProjectile`/`hasCleared`）。`game.js` 側は addProjectile 設定後に生成し、`gameTick` で `tickCharge()`（オーラ更新）・`enterStage` で `cancelCharge()`（遷移で中断）を呼ぶ。`input.js` の `processHeldKeys` は移動量に `getChargeMoveSpeedFactor()` を乗算して減速。
- **代替案：** (A) HP満タン式（初代ゼルダ準拠・チャージ操作不要）→ ユーザーが段階チャージ式を選択したため却下。(B) ビーム用に専用の飛翔体ループを新設 → 投擲物と当たり判定/トンネリング対策が二重化するため却下（既存 addProjectile に乗せた）。(C) チャージ割合を連続スケールで威力に反映 → プレイヤーが手応えを区別しにくく・テストも非決定的になりやすいため、離散2段階（弱/強）にした。(D) ドット絵スプライトを先に作る → SPRITES_NEEDED.md の P3/FX1/FX2 は未作成。既存スラッシュ/爆発と同じく CSS 演出で代用し、専用スプライトは後回し（Phase 0-5 スプライトエディタ/人手の管轄）。
- **結果／影響：** 「押下＝剣／長押し＝チャージ／離す＝ビーム」が一本に繋がり、チャージ中は半速で位置取りしながら溜められる。`tests/charge-beam.spec.js` 3本（1/4未満で発射なし・十分溜めて beam 前方生成・満タンビームの貫通で hp=1 の2体同時撃破）＋全42テストグリーン（VRT 起動画面に差分なし＝オーラはチャージ中のみ表示のため基準画像不変）。実機で aura ready/full クラス・beam DOM 生成・離脱後のオーラ消去・JSエラーなしを確認。残課題なし（次は 3-2 ボス大型化＝複数セル当たり判定の設計）。

### 2026-06-15 — Phase 1-5：飛行は「player 専用の passable 緩和」、塔接続は「MAP_ENTER テレポート」で実装する
- **決定：** 翼の羽衣による飛行を**フル実装**する（ユーザー選択。1-3 の元方針どおり）。`player.flying` フラグ1個＋`toggleFlight()`（F キー/モバイル🪽）で離着陸し、飛行中は新タイル `SKY('%')` と `WATER` を越えられる。暗黒の塔は新レイヤー `dark_tower`（入口フロア→ボス部屋）とし、フィールドからの接続は**ステージ端の縁遷移ではなく MAP_ENTER テレポート**で行う。塔へ渡る空島（field 4,0）は虚空 `SKY` の谷で分断し、飛行でしか越えられない構造にする。
- **飛行の実装場所：** 通行判定は2系統ある——プレイヤーは `isPassable`、敵は `isPassableForEnemy`。飛行緩和を `isPassable` 側にだけ足せば敵には一切影響しない（敵は飛べないまま）。地上の真実 `tilePassable` は据え置きで `SKY` を明示ブロックに加え、「徒歩では不可・`player.flying` なら越える」を `isPassable` の早期 return 緩和で両立させた。これにより既存の壁・木・水の判定ロジックを壊さず最小差分で飛行を追加できる。
- **飛び越えられる障害物の範囲（後日ユーザーと相談して拡張）：** 当初は `SKY`/`WATER` のみ越えられる最小実装だったが、「飛んでるのに木で止まるのは不自然」というユーザー指摘を受け、**自然物（`SKY`/`WATER`/`TREE`/`BUSH`/`FENCE`）は飛び越え可・山/壁/家(`HOUSE_*`)/閉じた門・扉は不可**に拡張した。実装は `passable.js` の `FLYABLE_OVER` Set 1個で**タイル種別分類するだけ**（per-instance のデータ追加は不要）。ルールが「自然は越える、山と建造物は越えられない」と直感的で、山がこれまでどおり「飛んでも越えられない境界ツール」として残る点が決め手。代替案として「per-tile に flyable フラグを持たせる」も検討したが、種別で十分分類できるためデータを増やさない方を採った。
- **場外クランプの安全ネット（飛行拡張の副作用対策）：** フィールド境界は山(M)だけでなく木(t)でも塞いでいるため、木を飛び越え可にすると「隣ステージの無い縁」へ飛んで出られ場外で詰む恐れがある。`checkStageTransition` に「遷移先ステージが無い端に出たら `player.x/y` をマップ内 (margin 0.5) にクランプして引き戻す」分岐を追加した。翼の羽衣は全収集後＝最終盤にしか手に入らないため、この自由探索（victory lap）でマップが壊れるリスクは低いが、詰み防止として明示的に守る。
- **自動着陸ルール：** `enterStage` で「到着セルが地上(`tilePassable`)なら着陸、空/水なら飛行維持」とする。空島入口に着地して即着陸すると虚空の上で詰むため、到着タイルを見て分岐するのが必須。離着陸は手動トグルだが、ステージ間移動だけは安全側に自動化した。
- **塔接続をテレポートにした理由（ハマりどころ）：** 当初は field に新ステージ `4,0` を足し、3,0 の右端 `.` から縁遷移で渡す設計にした。しかし **field 3,0 の右端 `.` は内部から木・柵で隔離されており、内部から縁にそもそも到達できなかった**（BFS で発覚）。フィールドの「開いて見える縁」は内部到達性を保証しない。ダンジョン入口と同じ MAP_ENTER テレポート（到達可能な床に portal を置く）に切り替えて解決。新エリア追加時は「縁遷移」より「到達可能床に portal」が確実。
- **ゲートの置き場所：** `hasWingRobe` ゲートは `checkStageTransition` で `enter.destId === DARK_TOWER_EXIT_ID('darkTower')` のときに適用する（1-3 で予約した契約どおり）。field 3,0 の portal の `destId` を `'darkTower'` にすることでゲートが効く。空島自体も虚空で守られているが、明示ゲートを二重の安全策として残した。
- **代替案：** (A) 飛行を実装せず塔入口を単純な `hasWingRobe` ゲートだけにする（1-4 の A 案的な最小版）→ ユーザーがフル飛行を選択したため却下。(B) 飛行を `tilePassable` 自体に `flying` 分岐を入れて実装 → 敵の通行判定にも漏れる/`tilePassable` が状態依存になり純粋性が下がるため却下（`isPassable` 側の緩和に留めた）。(C) field の縁遷移で塔へ繋ぐ → 内部到達性が無く却下。
- **結果／影響：** 「全収集→祭壇で翼の羽衣→飛行で虚空を越える→暗黒の塔→ザーネル撃破→エンディング」が一本に繋がり Phase 1 が完結。検証は BFS スクリプト（徒歩/飛行で到達可否を機械確認）＋ Playwright スモーク3本＋実ブラウザ（ザーネル撃破→エンディング・空島描画）。`SKY` は `calcTotalTriforces()` のカウント対象外（`Q`/`X` のみ）なので欠片必要数には影響しない。VRT 基準画像（起動直後 field 1,0）は変化なしで更新不要だった。

### 2026-06-15 — Phase 1-4：古代の祭壇は「専用ステージ」でなく「フィールドのタイル1個」で実装する（A案）
- **決定：** 古代の祭壇を、MAP_ENTER で往復する専用ステージ（B案）ではなく、**フィールドに祭壇タイル `ALTAR='^'` を1個置くだけ（A案）**で実装する。乗ると `boss.js` の `offerAtAltar()` が発火し、星の欠片を全収集（`calcTotalTriforces()` 個）していれば `player.hasWingRobe=true`＋光柱演出＋メッセージ、不足なら拒否メッセージを出す。1-3 で抽象化しておいた `altarExists()` を「MAP_ENTER id 検出」→「祭壇タイル `^` の検出」に変更（専用ステージ id も併用フォールバック）。
- **理由：** (1) 祭壇は「乗って捧げる」単一インタラクションで、専用ステージにするほどの空間的コンテンツが無い。(2) B案は新ステージ作成＋双方向 MAP_ENTER リンク＋戻り口の管理が要り重い。A案はタイル1個＋ `handleTileEvent` に1分岐＋ `offerAtAltar()` で完結し1セッションで実プレイ可能。(3) 1-3 で「ステージ名をハードコードせず祭壇の“存在”で判定する」設計にしていたため、判定対象をタイルに差し替えるだけで誘導フローがそのまま繋がる。
- **代替案：** (B) 専用祭壇ステージ＋MAP_ENTER 往復 → 却下（コンテンツ量に対し過剰・実装が重い）。将来、祭壇を荘厳な専用空間として演出したくなったら B に拡張できる（`altarExists()` は既に MAP_ENTER id 併用フォールバックを持つ）。
- **連続発火の抑止：** 祭壇は拾うと消えるアイテムと違い「再訪できるが乗りっぱなしで連打させたくない」タイル。`player.js` に `_lastAltarPosKey` を持ち、同じセルに居る間は1回だけ `offerAtAltar()` を呼び、別タイルへ移動したらガードを解除する方式にした。将来のワープタイル等にも転用できるパターン。
- **結果／影響：** 「全収集 → 祭壇に乗る → 翼の羽衣（`hasWingRobe`）入手」まで実プレイで通る（saveGame で永続化）。描画は専用スプライト未作成のため `⛩` 絵文字フォールバック（render-board.js）。祭壇は画面外 row8 配置なので VRT 基準画像更新は不要だった。**残課題：** 羽衣取得後はまだ塔が無くエンディングに繋がらない（`checkTriforceClear` が `hasWingRobe=true` で何もしないため）。1-5 で暗黒の塔＋ザーネルを配置すれば一本に繋がる。

### 2026-06-15 — Phase 1-3：終盤フローは「後方互換フォールバック付きの状態機械」で設計する
- **決定：** 終盤を「星の欠片を全収集 → 古代の祭壇へ誘導 → 翼の羽衣を授かる → 暗黒の塔解放 → ラスボス ザーネル撃破 → エンディング」の状態機械にする。ただし祭壇・塔・ザーネルがまだマップに配置されていない現状でも**従来どおり「全収集 → 即エンディング」で完走できるフォールバック**を必ず残す。Phase 1-3 では「設計＋安全な基盤実装」までを行い、ステージ本体の配置は 1-4（祭壇）/ 1-5（塔・ザーネル）に委ねる。
- **状態の表現：**
  - 進行フラグは **`player.hasWingRobe`**（翼の羽衣＝塔の鍵）1個だけで表す。`player` オブジェクトは `saveGame` が丸ごと JSON 化するので、フラグ追加だけで save/load に自動対応する（専用のシリアライズ追加不要）。`startNewGame` 側の player 初期化にも `hasWingRobe:false` を足して二重初期化の齟齬を防ぐ。
  - 祭壇・塔への遷移は既存の **MAP_ENTER + `exitRegistry`（`enter.id`→宛先）** の仕組みに乗せる。`constants.js` に予約 id（`ALTAR_EXIT_ID='altar'` / `DARK_TOWER_EXIT_ID='darkTower'`）を定義し、1-4/1-5 はこの id を入り口に設定する“契約”とする。コード側はこの id を持つ入り口が `exitRegistry` に登場したかどうかでフェーズ遷移を判定する（ステージ名のハードコードを避ける）。
- **分岐の置き場所（boss.js）：**
  - `checkTriforceClear()`：全収集時、(a) `hasWingRobe=true` なら何もしない（祭壇は済・以降はザーネル撃破がエンディングを出す）、(b) 祭壇 id が `exitRegistry` にあれば**エンディングを出さず祭壇へ誘導するメッセージのみ**、(c) どちらでもなければ**従来どおり即エンディング**（フォールバック）。
  - `onBossDefeated()`：撃破した敵の `ENEMY_META[type].isFinalBoss` が真なら、欠片演出ではなく**エンディングを発火**する。これによりラスボスと通常ダンジョンボスの終端処理が `isFinalBoss` フラグ1個で分離できる。
- **ラスボスは新タイル ZARNEL（`Z`）で表現：** 既存の `DARK_LORD`（`X`）を流用せず新タイルを追加。理由：`DARK_LORD` は「撃破で星の欠片を落とすダンジョンボス」、`ZARNEL` は「撃破でエンディングを出す最終ボス」で**終端処理が逆**。同一タイルにフラグで両義を持たせると `onBossDefeated`・`calcTotalTriforces`（`X` を欠片数にカウントしている）の双方が条件分岐だらけになり破綻しやすい。タイルを分ければ `calcTotalTriforces` は `X` を数え続け（＝ザーネルは欠片源に含めない）、`isFinalBoss` 判定もタイプ一致で済む。専用スプライトは未作成のため当面 darklord を流用（新規スプライトは Phase 0-4 / スプライトエディタの管轄＝最優先5点の1つ）。
- **代替案：** (A) `DARK_LORD` を最終ボス兼用にしフラグ（bossStage 等）で区別 → 却下（上記の終端処理の二重化）。(B) 欠片数を「8固定」にハードコード → 却下（現状ダンジョン2つでは詰むうえ、`calcTotalTriforces()` の動的カウントが既にあり 8ダンジョン化で自動的に8になる）。(C) 終盤フェーズを別の独立した進行変数（`gamePhase` enum 等）で管理 → 過剰。`hasWingRobe` + 祭壇 id の有無 + `isFinalBoss` の3点で状態は十分に決まる。
- **結果／影響：** Phase 1-4 で祭壇ステージの入り口に `id:'altar'` を置いた瞬間、`checkTriforceClear` が自動的に「誘導モード」に切り替わる。1-5 でザーネル（`Z`）を塔最奥に置けばエンディング発火も繋がる。現状（祭壇・ザーネル未配置）は従来エンディングのまま壊れない（29 Playwright テスト＋分岐ロジックの一時 Node テスト5ケースで確認）。**残課題：** 祭壇インタラクション（捧げる→`hasWingRobe=true`）と塔入り口の `hasWingRobe` ゲート（飛行移動方式）は 1-4/1-5 で実装する。

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
