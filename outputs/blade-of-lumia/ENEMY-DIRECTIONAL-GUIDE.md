# 陸上敵の directional 機構（向き別スプライト・攻撃・ガード）実装ガイド

skeleton（骸骨剣士）で確立した「向き別スプライト＋剣攻撃＋実効ガード」の機構をまとめる。
残り14種の陸上敵（5.5k）を実装するときは、**着手前に必ずこの文書を読む**。
機構自体（`ENEMY_META.directional` フラグを立てて `attack.type:'sword'` を設定すれば動く）は
skeletonで完成済みなので、新しい敵は基本的にデータ追加だけで済むはず。ここに書く罠を踏まなければ
①エンジン基盤の実装は速い（今回は手戻りに時間を使った・後述）。

初出＝2026-08-10（5.5k・skeletonの①エンジン基盤＋ガード実効化＋②量子化共通スケール化）。
関連＝`SPRITE-PIPELINE.md`（スプライト生成・量子化の手順書）／DECISIONS.md 2026-08-10 各エントリ。

---

## 1. 機構の全体像

- `shared/enemies.js` の `ENEMY_META[TILE]` に `directional: true` を立て、`attack: { type: 'sword', range, cooldown }` を設定すると、以下が自動で有効になる（`game/enemy-ai.js`）：
  - **向き別スプライト解決**＝`resolveEnemySprite(e, meta, now)`。`${base}${Dir}`（通常）／`${base}${Dir}Atk`（攻撃中）／`${base}${Dir}Guard`（ガード中）を返す。`base` は `meta.sprite` から `D/R/L/U/Atk/Guard` サフィックスを剥いた名前。
  - **向き差替の同期**＝`syncDirectionalSprite(e, meta)`。`enemyTick()` が directional な敵だけ毎tick呼ぶ（DOM の canvas を差し替える）。
  - **ガードの状態機械**＝`tickGuard(e, meta, now)`。後述。
- `directional:true` を持たない既存敵（patrol/chaser/sentry や各ボス）は影響を受けない（後方互換・従来の `e.sprite` 固定＋flipX のまま）。

## 2. スプライト命名規則（実データが必要な組み合わせ）

`base` を敵の基本名（例 `skeleton`）とすると、必要なスプライト名は：

```
{base}D  {base}R  {base}U        … 通常（Lは無し。既存 dirSuffix マップ〈left→'R'〉どおり R を flipX して代用）
{base}DAtk {base}RAtk {base}UAtk … 攻撃ポーズ
{base}DGuard {base}RGuard {base}UGuard … 構えポーズ
```

`shared/sprites-enemies.js` にこれら9個を登録する（`ENEMY_SPRITES.xxx = ...`）。**まだ向き別の実描画が無い段階では、既存ボスと同じ「参照エイリアス」方式で先に機構だけ通す**（例：`ENEMY_SPRITES.skeletonR = ENEMY_SPRITES.skeleton`）。エイリアスは後で実データに差し替えれば済む＝データとエンジンの検証を分離できる（skeletonでもこの順で進めた）。

## 3. ガードの実効化（★最重要・最初の実装で見た目だけにしてダメ出しされた）

**ガードは見た目の演出ではなく、実際にダメージを無効化する機構にする。** 初回実装で見た目（`_guardUntil` の窓だけ）にしてユーザーに「防御全然してくれない」と指摘された。正しい設計：

- ガード中は**①移動しない②攻撃しない③向きをロック**（ガード開始の瞬間だけ `e.dir` を確定し、以後プレイヤーが動いても向き直らない）。
- ロックした向きから見て**攻撃者がその方向にいるときだけ無効化**（`game/combat.js isGuardBlockingDir(e, srcX, srcY)`）。側面・背後からは通常どおり通る＝プレイヤーが回り込む戦略が意味を持つ。
- **ブーメラン命中は常にスタン＋ガード強制解除**（`game/projectile.js`）。ダメージが正面ブロックされてもスタン効果は貫通する＝「ブーメランで動きを止めてガード不能にしてから殴る」がプレイヤー側の攻略手段になる。

実装箇所：
- `game/enemy-ai.js tickGuard(e, meta, now)` — ガード状態機械。戻り値 `true` ならその tick の `enemyChase`/`enemyAttack` を丸ごとスキップする（`enemyTick()` 側で分岐）。
- `game/combat.js isGuardBlockingDir(e, srcX, srcY)` — 攻撃発生源座標から見た方向とロック方向が一致するか判定。`dealDamageToEnemy()` の無効化チェック列に入る（`meleeOnly`/`submerged` と同じ漏斗）。
- ダメージを与える全ての呼び出し元（剣・矢・ブーメラン・貫通弾・ロウソク）が **攻撃発生源の座標（`srcX, srcY`）を `dealDamageToEnemy()` に渡す**必要がある。新しい攻撃手段を敵に追加するときは、この配線を忘れない。

### 3-1. ★ guardRange の罠（ここで一番時間を溶かした）

`tickGuard` の「ガードに入る距離」（`guardRange`）は、**プレイヤーの攻撃が実際に届く距離（`SWORD_REACH` や `sword.range`）と一致させる**。

最初の実装は「見た目だけの威圧」用に `guardRange = sword.range * 1.6`（射程より広い）にしていた。これを実効化しても直さなかったため、**ガード中の敵は常に剣の射程外にいる**状態になり、「ガード判定を有効にしても無効にしても、そもそも当たっていないので hp が変化しない」という**歯のないテスト**を書いてしまった（潰しても緑のまま＝何も検証していないのに気づかず進めてしまった）。

**チェックリスト**：
1. ガード開始距離とプレイヤーの攻撃到達距離を数値で比較する（`guardRange <= sword.range` になっているか）。
2. 「歯の確認」（判定コードを一時的に `if (false && ...) ` で潰して赤くなるか）をやる前に、**まず判定を有効にした状態で実際にダメージが変化する筋（＝当たっている）を1つ実機で確認してから**、無効化ロジックを検証する。当たってもいないのに「潰しても緑」を「機構が正しい証拠」と誤読しない。

### 3-2. ★ 敵と同じタイルへプレイヤーは進入できない（回り込み経路を作るときの制約）

`game/passable.js isPassable()` は「敵と同じタイルセルへの進入」を重なり防止でブロックする（大型敵は占有セル全部）。**ガードで位置固定された敵の真横（同じ行・同じ列）を直接すり抜けて反対側へ回り込むことはできない**。テストやレベルデザインで「側面/背後に回り込む」経路を作るときは、敵の周囲1マス以上离れた迂回路を用意する（内側の通路を使う・南北どちらかにオフセットするなど）。これに気づかず「動くはずの movePlayer が3回目だけ動かない」と何度も経路を変えて試行錯誤した。

## 4. テスト実装の注意点

- `game/game.js getEnemiesSnapshot()`（`__game.getEnemies()` の実体）に、新しい状態を観測するフィールドを追加する（`dir`/`sprite`/`atkUntil`/`guardUntil`/`guarding`/`guardDir` は既に追加済み）。新しい状態を作ったら同じ要領でここに追加してからテストを書く。
- **`animFrame`（歩行アニメの2フレーム目切り替え）は実時間の `setInterval`（`shared/sprites.js startAnimLoop`・400ms）で進む。`__game.step(n)`（論理時間）では進まない。** 見た目のフレーム切り替えを確認したいときは `page.waitForTimeout(450)` のように実時間を待つ（`.scratch/shot-skel-walk2.mjs` が実例）。
- 「歯の確認」をする前に、まず判定を有効にした状態で実機ログ（`.scratch/` の使い捨てスクリプト）を取り、対象の値（hp・座標・フラグ）が期待どおり変化する1本の筋を先に固める。それから無効化して赤くなることを確認する（§3-1 と同じ理由）。

## 5. 新しい敵を追加するときの手順（まとめ）

1. `shared/enemies.js` の `ENEMY_META` に `directional:true` を立てて追加（既存の脅威度・攻撃タイプ定義はそのまま）。
2. `shared/sprites-enemies.js` に9個のスプライト名を登録（最初はエイリアスで良い＝§2）。
3. 攻撃タイプが `sword` 以外（分裂・突進・遠隔等の新機構）を持つ敵は、`tickGuard`/`resolveEnemySprite` がそれらの攻撃タイプにも対応しているか確認する（現状は `sword` 前提の実装＝新しい機構を足すときはこの前提を崩さないよう分岐を追加する）。
4. `guardRange` を実際の攻撃到達距離と一致させる（§3-1）。
5. ダメージを与える新しい攻撃経路を作るなら、`srcX, srcY` を `dealDamageToEnemy()` に渡す配線を忘れない（§3）。
6. 実機で「当たる筋」を先に1本確認してから、テスト＋歯の確認を書く（§3-1・§4）。
7. スプライトを実データにする際は `SPRITE-PIPELINE.md` の手順＋`quantize-shared.mjs`（複数フレームは必ずこれ・§3-★参照）を使う。
