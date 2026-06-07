# Dungeon World – New Game+ 実装タスク

## 概要

エンディングに到達したプレイヤーが次回ゲームを起動すると、
「New Game+」として遊べるようにする。

### ストーリー反転

| 通常プレイ | New Game+ |
|---|---|
| 操作キャラ：勇者（hero） | 操作キャラ：姫（princess） |
| 助ける対象：姫（TILE.PRINCESS） | 助ける対象：勇者（TILE.PRINCESS ← 見た目だけ変える） |
| ボス：魔王（DARK_LORD） | ボス：真の魔王（魔王の2周目、ステータス強化） |
| 装備引き継ぎ：なし | 装備引き継ぎ：あり（1周目クリア時の装備） |

---

## 現在のコード状況

### ファイル構成

```
outputs/dungeon-world/
├── game/
│   ├── game.js         ← ★ 主な実装場所
│   ├── game.css        ← 必要に応じて修正
│   └── index.html      ← 変更なし
└── shared/
    ├── sprites.js      ← PAL・SPRITES を参照
    ├── enemies.js      ← 敵パラメータ（DARK_LORD）
    └── sounds.js       ← 変更なし
```

### 関連する既存の定数・関数

```js
// sprites.js
SPRITES.princess   // 姫スプライト（ロングドレス・長髪）
PAL.princess       // 姫パレット（白ピンク）
SPRITES.heroD      // 勇者（正面）
SPRITES.heroR/L/U  // 勇者（方向別）
PAL.hero           // 勇者パレット

// enemies.js
ENEMY_META[TILE.DARK_LORD] = { hp: 50, atk: 50, def: 5, ... }

// game.js
const SAVE_KEY = 'dungeonWorldSaveData';  // 通常セーブ
// New Game+ 用のキーを別途追加する：
const NG_PLUS_KEY = 'dungeonWorldNewGamePlus';
```

---

## 実装手順

### Step 1: NgPlus フラグと装備を保存する

エンディング到達時（`startEnding()` の最後 `doReset()` の前）に以下を実行：

```js
// エンディング到達フラグ + 装備を別キーで保存
localStorage.setItem('dungeonWorldNewGamePlus', JSON.stringify({
    version: 1,
    cleared: true,
    weapon: player.weapon,  // { name, atk } or null
    armor:  player.armor,   // { name, def } or null
    lv:     player.lv,      // 引き継ぎレベル（任意）
}));
// 通常セーブデータをクリア（New Game+ で使うのは NG_PLUS_KEY のみ）
clearSaveData();
```

**場所**: `game.js` の `doReset()` 関数（`endingOverlayEl.classList.add('hidden')` の直前）

---

### Step 2: 起動時に New Game+ 判定する

`Boot` セクションで、通常セーブデータがない場合に NG_PLUS を確認：

```js
// 現在のコード（game.js Boot部分）:
const hasSave = !stageParam && loadGameState();
if (!hasSave) {
    enterStage(startKey, startRow, startCol);
}

// 変更後:
const hasSave = !stageParam && loadGameState();
if (!hasSave) {
    const ngPlus = loadNgPlus();
    if (ngPlus) {
        startNgPlus(ngPlus, startKey, startRow, startCol);
    } else {
        enterStage(startKey, startRow, startCol);
    }
}
```

---

### Step 3: `loadNgPlus()` 関数を追加

```js
const NG_PLUS_KEY = 'dungeonWorldNewGamePlus';

function loadNgPlus() {
    const raw = localStorage.getItem(NG_PLUS_KEY);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!data?.cleared) return null;
        return data;
    } catch { return null; }
}

function clearNgPlus() {
    localStorage.removeItem(NG_PLUS_KEY);
}
```

---

### Step 4: `startNgPlus(ngPlusData, startKey, startRow, startCol)` 関数を追加

```js
/** New Game+ を開始する */
function startNgPlus(ngPlusData, startKey, startRow, startCol) {
    // プレイヤーを初期化（装備のみ引き継ぎ）
    player = {
        row: 0, col: 0,
        hp: 20, maxHp: 20,
        atk: 4 + (ngPlusData.weapon?.atk ?? 0),
        def: 1 + (ngPlusData.armor?.def ?? 0),
        lv: 1, exp: 0, keys: 0,
        weapon: ngPlusData.weapon ?? null,
        armor:  ngPlusData.armor  ?? null,
        ngPlus: true,  // New Game+ フラグ
    };
    heroDir = 'down';
    stageState = {};  // 敵・宝箱・鍵はすべてリセット（装備のみ引き継ぎ）
    enterStage(startKey, startRow, startCol);
    pulse('⭐ New Game+ 開始！装備を引き継いでいます');
}
```

> **仕様メモ**: エンディング後は `stageState = {}` でステージ状態を全リセットします。
> 引き継ぐのは `player.weapon` と `player.armor` のみです。
> 敵の生死、宝箱の開封状態、鍵の取得状態はすべてリセットされます。

---

### Step 5: プレイヤーのスプライトを姫に切り替える

`render()` 関数内のプレイヤー描画部分を修正：

```js
// 現在のコード（render() 内）:
if (r === player.row && c === player.col) {
    const dirKey = { right: 'R', left: 'L', up: 'U', down: 'D' };
    const sname  = 'hero' + (dirKey[heroDir] || 'D');
    const cv = makeSprite(sname, 'hero', true);
    ...
}

// 変更後:
if (r === player.row && c === player.col) {
    const dirKey = { right: 'R', left: 'L', up: 'U', down: 'D' };
    let sname, palName;
    if (player.ngPlus) {
        // New Game+: 姫スプライト（方向は全部 princess で共通）
        sname   = 'princess';
        palName = 'princess';
    } else {
        sname   = 'hero' + (dirKey[heroDir] || 'D');
        palName = 'hero';
    }
    const cv = makeSprite(sname, palName, true);
    ...
}
```

---

### Step 6: フェーズ2エンディング（THE END 画面）の描画を切り替える

`startEnding()` 内のフェーズ2スプライト描画部分を修正：

```js
// 現在のコード:
drawSprite(hero2CanvasEl,    SPRITES['heroD'],    PAL['hero']);
drawSprite(princessCanvasEl, SPRITES['princess'], PAL['princess']);

// 変更後:
if (player.ngPlus) {
    // New Game+: 姫（プレイヤー）が助けた勇者と一緒に
    drawSprite(hero2CanvasEl,    SPRITES['princess'], PAL['princess']); // 操作キャラ（姫）
    drawSprite(princessCanvasEl, SPRITES['heroD'],    PAL['hero']);      // 助けられた勇者
} else {
    drawSprite(hero2CanvasEl,    SPRITES['heroD'],    PAL['hero']);
    drawSprite(princessCanvasEl, SPRITES['princess'], PAL['princess']);
}
```

---

### Step 7: PRINCESS タイルのダイアログを New Game+ 用に変更

`move()` 内の姫接触処理を修正：

```js
// 現在のコード:
if (t === TILE.PRINCESS) {
    stopBgm();
    playSound('key');
    showItemDialog('👸 姫', 'ありがとう！あなたのおかげで助かりました！', () => {
        startEnding();
    });
    return;
}

// 変更後:
if (t === TILE.PRINCESS) {
    stopBgm();
    playSound('key');
    if (player.ngPlus) {
        showItemDialog('⚔️ 勇者', '姫…！来てくれたのか！脱出しよう！', () => {
            startEnding();
        });
    } else {
        showItemDialog('👸 姫', 'ありがとう！あなたのおかげで助かりました！', () => {
            startEnding();
        });
    }
    return;
}
```

---

### Step 8: 魔王のステータス強化（New Game+用）

`buildEnemies()` 内で、New Game+ 時は DARK_LORD のステータスを強化：

```js
// enemies.push({...}) の部分を修正:
const isNgBoss = player.ngPlus && t === TILE.DARK_LORD;
enemies.push({
    id: id++, row: r, col: c, type: t,
    hp:    isNgBoss ? (custom.hp  ?? base.hp)  * 2 : (custom.hp  ?? base.hp),
    maxHp: isNgBoss ? (custom.hp  ?? base.hp)  * 2 : (custom.hp  ?? base.hp),
    atk:   isNgBoss ? (custom.atk ?? base.atk) + 10 : (custom.atk ?? base.atk),
    def:   isNgBoss ? (custom.def ?? base.def) + 3  : (custom.def ?? base.def),
    exp:   custom.exp ?? base.exp,
    aggressive: base.aggressive,
});
```

---

### Step 9: セーブデータに `ngPlus` フラグを含める

`saveGameState()` と `loadGameState()` で `player.ngPlus` を保存・復元する：

```js
// saveGameState() の save オブジェクト:
const save = {
    version: 1,
    player: { ...player },  // ngPlus フラグも含まれる
    ...
};

// loadGameState() で復元後、player.ngPlus が true なら render() に反映される
// （player オブジェクトをそのまま復元しているので自動で動く）
```

---

### Step 10: エンディング後 NG_PLUS_KEY をクリアする

`doReset()` 内で、エンディング到達フラグをクリア（2周目のエンディング後は通常リセット）：

```js
function doReset() {
    clearNgPlus(); // NG+ フラグをクリア（次回は通常プレイ or 再度 NG+）
    endingOverlayEl.classList.add('hidden');
    ...
}
```

---

## 実装チェックリスト

- [ ] Step 1: `startEnding()` → `doReset()` の前に NG_PLUS_KEY に装備を保存
- [ ] Step 2: Boot セクションで `loadNgPlus()` を呼ぶ
- [ ] Step 3: `loadNgPlus()` / `clearNgPlus()` 関数を追加
- [ ] Step 4: `startNgPlus()` 関数を追加
- [ ] Step 5: `render()` でプレイヤースプライトを姫に切り替え
- [ ] Step 6: フェーズ2エンディング描画を切り替え
- [ ] Step 7: 姫接触ダイアログを New Game+ 用に変更
- [ ] Step 8: `buildEnemies()` で魔王ステータスを強化
- [ ] Step 9: セーブ/ロードに `ngPlus` フラグが含まれることを確認（自動）
- [ ] Step 10: `doReset()` で `clearNgPlus()` を呼ぶ

---

## 注意事項

- `player.ngPlus` フラグは `saveGameState()` で自動保存される（player オブジェクトに含まれる）
- New Game+ 中にゲームオーバーになっても `loadGameState()` で復元するため `ngPlus` フラグは維持される
- `sprites.js` の `princess` スプライトは方向別（heroR/L/U/D）がないため、全方向で `princess` を使用する（見た目の制限として許容）
- `no-multiline-shell` ルール：複数行シェルは使わない（ファイルに書き出してから実行）
