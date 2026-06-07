# Dungeon World エンディング実装タスク

## 概要

`outputs/dungeon-world/game/game.js` に DARK_LORD（魔王）を倒した時のエンディング演出を実装する。
HTML・CSS・スプライトデータは既に追加済み。このファイルだけ読めば実装できる。

---

## 現在の実装状況（実装済み）

### HTML (`outputs/dungeon-world/game/index.html`)
エンディング用のオーバーレイが追加済み：

```html
<div id="ending-overlay" class="ending-overlay hidden">
  <!-- フェーズ1 -->
  <div id="ending-phase1" class="ending-phase1">
    <canvas id="ending-stage-canvas" class="ending-stage-canvas"></canvas>
    <div id="ending-battle" class="ending-battle">
      <canvas id="ending-hero-canvas"     class="ending-sprite-canvas"></canvas>
      <canvas id="ending-darklord-canvas" class="ending-sprite-canvas"></canvas>
    </div>
    <div id="ending-scroll-wrap" class="ending-scroll-wrap">
      <div id="ending-scroll" class="ending-scroll"></div>
    </div>
  </div>
  <!-- フェーズ2 -->
  <div id="ending-phase2" class="ending-phase2 hidden">
    <div class="ending-happy-scene">
      <canvas id="ending-hero2-canvas"    class="ending-big-sprite"></canvas>
      <canvas id="ending-princess-canvas" class="ending-big-sprite"></canvas>
    </div>
    <div id="ending-the-end" class="ending-the-end">THE END</div>
  </div>
</div>
```

### CSS (`outputs/dungeon-world/game/game.css`)
以下のクラスが定義済み（変更不要）：
- `.ending-overlay` / `.ending-overlay.hidden`
- `.ending-phase1` / `.ending-stage-canvas` / `.ending-battle` / `.ending-sprite-canvas`
- `.ending-scroll-wrap` / `.ending-scroll` / `@keyframes ending-scroll-up`（60秒スクロール）
- `.ending-phase2.hidden` / `@keyframes ending-phase2-fadein`
- `.ending-happy-scene` / `.ending-big-sprite` / `.ending-the-end`
- `.scroll-title` / `.scroll-role` / `.scroll-name` / `.scroll-divider`

### スプライト (`outputs/dungeon-world/shared/sprites.js`)
- `SPRITES.darklord` = `SPRITES.escape` と同じ形状
- `PAL.darklord` = `['transparent','#000000','#0a0a0a','#d0a060','#8800ff','#f0c040']`（黒紫金）
- `SPRITES.princess` = `SPRITES.heroR` と同じ形状
- `PAL.princess` = `['transparent','#000000','#ff88bb','#f5e0d0','#ffffff','#ff66aa','#fce8d8']`（白ピンク）

### 敵データ (`outputs/dungeon-world/shared/enemies.js`)
```js
[TILE.DARK_LORD]: {
  name: '魔王', hp: 30, atk: 12, def: 5, exp: 40,
  sprite: 'darklord', pal: 'darklord', aggressive: true, aura: true
}
```

---

## 実装が必要な箇所

### 1. `outputs/dungeon-world/shared/sounds.js` にエンディングBGMを追加

`playSound('ending')` を呼ぶとエンディング音楽が流れるようにする。

Web Audio APIで実装。以下の方針で音楽を作る：
- 荘厳なファンファーレで始まり、しっとりしたエンディング曲に繋がる
- `sounds.js` の既存パターンに合わせて `AudioContext` を使う
- ループ不要（1回再生で十分）
- 既存の `playSound` 関数で呼べる形式で追加
- キー: `'ending'`

既存の `sounds.js` の構造を参照して実装すること。

---

### 2. `outputs/dungeon-world/game/game.js` にエンディングロジックを追加

#### 2-1. DARK_LORD 撃破の検出

`playerAttack()` 関数内の「敵を倒した」処理の中に以下を追加：

```js
// 既存コード（倒した敵の処理）：
getSS(stageKey).defeatedEnemies.add(`${enemy.row},${enemy.col}`);
enemies = enemies.filter(e => e.id !== enemy.id);
gainExp(enemy.exp);

// ここに追加：
if (enemy.type === TILE.DARK_LORD) {
  render();
  await sleep(800);
  startEnding();
  _battleBusy = false;
  return;
}
```

#### 2-2. スタッフロールのコンテンツ

以下のHTML文字列を生成する関数を実装すること（変数 `AUTHOR = 'Go Kojima'`）：

```
タイトル: Dungeon World

役割リスト（全員同じ名前）：
- Game Director
- Executive Producer
- Game Designer
- Level Designer
- Programmer
- Lead Programmer
- Character Designer
- Pixel Artist
- Background Artist
- UI/UX Designer
- Sound Designer
- Music Composer
- Story Writer
- World Builder
- Dungeon Architect
- Monster Designer
- Lore Creator
- QA Lead
- Playtester
- Special Thanks

最後に：
- "Thank you for playing!"
- "© 2026 Go Kojima"
```

#### 2-3. `startEnding()` 関数の実装

以下の流れで実装する：

```
async function startEnding() {
  // 1. ゲームの入力を無効化（_battleBusy = true を維持）
  
  // 2. エンディングBGMを再生
  //    playSound('ending')
  
  // 3. エンディングオーバーレイを表示
  //    document.getElementById('ending-overlay').classList.remove('hidden')
  
  // 4. フェーズ1の初期化
  //    4-1. ステージキャンバスに訪問したステージを順番に描画
  //         mapData.stages の全ステージをゲーム画面と同じ40px/セルで描画
  //         3秒ごとにフェードしながら切り替える（cssのopacityアニメーション）
  //    4-2. 戦闘シーンのスプライトを描画
  //         プレイヤー（heroR, hero パレット）と DARK_LORD（darklord, darklord パレット）
  //         drawSprite() を使って canvas に描画
  //         400ms ごとにフレームを切り替えるアニメーション（setInterval）
  //    4-3. スタッフロールのHTMLを生成して挿入
  //         ending-scroll div の innerHTML にスタッフHTMLを設定
  //         CSSアニメーション（ending-scroll-up 60秒）が自動で流れる
  
  // 5. 60秒後にフェーズ2に移行（スタッフロール終了タイミング）
  await sleep(60000)
  
  // 6. フェーズ2を表示
  //    6-1. フェーズ1を非表示
  //    6-2. フェーズ2のクラス hidden を削除（fadein アニメーションが自動で流れる）
  //    6-3. ヒーロー（heroR, hero パレット）と姫（princess, princess パレット）を描画
  
  // 7. 5秒後にタイトルに戻る（ゲームオーバー画面と同じリセット処理を呼ぶ）
  await sleep(5000)
  // overlayBtnEl.click() と同じ処理を実行
}
```

#### 2-4. ステージをキャンバスに描画するヘルパー

`drawEndingStageToCanvas(stageData, canvasEl)` という関数を実装：
- `game.js` の `render()` と同じ背景色でタイルを塗る（`TILE_CHAR[t]?.bg`）
- 40px/セルで canvas に描画
- `canvasCtx` ではなく新しい `const ctx = canvasEl.getContext('2d')` を使う

---

## ゲーム画面のステージ描画参照

`game.js` の `render()` では以下の背景色を使っている：

```js
const TILE_CHAR = {
  [TILE.WALL]:   { bg: '#3a4448' },
  [TILE.FLOOR]:  { bg: '#1a2228' },
  [TILE.WATER]:  { bg: '#0e2040' },
  [TILE.SWITCH]: { bg: '#1a3010' },
  [TILE.GATE]:   { bg: '#1a2c40' },
  [TILE.DOOR]:   { bg: '#2a1a08' },
  [TILE.KEY]:    { bg: '#1a2228' },
  [TILE.CHEST]:  { bg: '#1a2228' },
  [TILE.STONE]:  { bg: '#1a2228' },
  [TILE.PLAYER]: { bg: '#1a2228' },
};
```

---

## スプライト描画の方法

`sprites.js` からインポートできる関数：
```js
import { makeSprite, drawSprite, SPRITES, PAL } from '../shared/sprites.js';
```

`drawSprite(canvasEl, frames, palette)` でキャンバスに直接描画できる：
```js
const frames = SPRITES['heroR'];
const palette = PAL['hero'];
drawSprite(canvasEl, frames, palette);
```

---

## ファイル構成

```
outputs/dungeon-world/
├── game/
│   ├── game.js         ← ★ 主な実装場所
│   ├── game.css        ← 実装済み（変更不要）
│   └── index.html      ← 実装済み（変更不要）
└── shared/
    ├── sounds.js       ← ★ endingBGM追加が必要
    ├── sprites.js      ← 実装済み（変更不要）
    ├── tiles.js        ← 実装済み（変更不要）
    └── enemies.js      ← 実装済み（変更不要）
```

---

## 注意事項

- `game.js` は `type="module"` なので ES Modules の import/export が使える
- `sleep(ms)` 関数はすでに `game.js` に定義されている
- `mapData` はグローバル変数としてステージデータを保持している
- `stageState` には訪問済みステージの状態が入っている（全ステージを表示する場合は `mapData.stages` を使う）
- エンディング中は `_battleBusy = true` のままにして入力を無効化する
- `overlayBtnEl.click()` を呼ぶとゲームオーバーと同じリセット処理が走る（タイトルに戻る用途で使える）
- `no-multiline-shell` ルール：複数行シェルは使わない（ファイルに書き出してから実行）
