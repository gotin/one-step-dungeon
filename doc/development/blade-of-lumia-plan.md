# Blade of Lumia – 開発プラン

## 概要

Dungeon World をベースにした、**リアルタイムアクション RPG**。
ゼルダの伝説スタイルのゲームシステムに刷新する。

---

## Dungeon World からの変更点・継承点

### 継承するもの

| 要素 | 内容 |
|---|---|
| ワールドマップ構成 | ステージ（マップセル）が上下左右に繋がってワールドを構成 |
| ステージ遷移 | 端に到達すると隣接ステージに移動 |
| エディタ基盤 | タイル編集・ステージ管理・プレビュー機能 |
| スプライト・パレットシステム | `sprites.js` / `PAL` 共通基盤 |
| セーブ・ロード | localStorage ベースのセーブシステム |
| RPG ステータス | HP・攻撃力・防御力 |

### 変更するもの

| 要素 | Dungeon World | Blade of Lumia |
|---|---|---|
| ゲームループ | ターン制 | リアルタイム |
| 敵の行動 | プレイヤーが動くたびに敵が動く | タイマーで常時動作・攻撃 |
| 装備 | 武器・防具（2種） | 剣・たて・防具（3種） |
| 投擲アイテム | なし | ブーメラン（拡張可能設計） |
| NPC | 姫のみ | 複数NPC（会話テキストはエディタで設定） |
| スタート装備 | なし | スタート地点に剣を配置 |

---

## ゲームシステム詳細

### 移動システム（半セル移動）

- Dungeon World は 1 操作 = 1 セル移動だったが、Blade of Lumia は **1 操作 = 0.5 セル移動**
- これにより障害物すれすれを通り抜けるなど、よりアクション的な操作感が生まれる
- 内部座標系は `pixelX / pixelY`（セル単位 × 2 の整数、または小数）で管理
- レンダリング時は `Math.round(pixelX / CELL_SIZE)` でセルに変換して描画

```js
// 移動量の定義
const MOVE_STEP = 0.5; // セル単位（Dungeon World は 1.0）
const ENEMY_SPEED_NORMAL = 0.5; // 通常敵
const ENEMY_SPEED_SLOW   = 0.25; // 鈍足敵
const ENEMY_SPEED_FAST   = 1.0;  // 高速敵
```

### リアルタイム戦闘

- プレイヤーは**矢印キー（またはスワイプ）**で移動
- **スペース / Sキー**で剣を振る（向いている方向に剣判定）
- 敵は**一定間隔（setInterval）**でプレイヤーに向かって移動・攻撃
- プレイヤーが何もしないでいると敵に攻撃されてダメージを受ける
- **たてを持っている場合**、特定のボタン長押しで防御可能（ダメージ軽減）

### 装備システム（3種）

| 装備 | 効果 |
|---|---|
| 剣（sword） | 攻撃力+。スタート地点に初期配置 |
| たて（shield） | 防御ボタン中はダメージ軽減（50%など） |
| 防具（armor） | 防御力+（常時） |

### 投擲アイテム：ブーメラン

- マップ上に配置されたブーメランを拾う
- **B キー / 専用ボタン**で投げる
- 投げた方向に飛んでいき、敵に当たるとダメージ
- ブーメランは**画面端か壁で反射**して戻ってくる（または一定距離で折り返し）
- 戻ってきたらプレイヤーがキャッチして再使用可能
- 拡張例：弓矢（一方向飛ぶが貫通）、爆弾（周囲ダメージ）など

```js
// アイテムの抽象インターフェース（拡張設計）
const ITEM_META = {
  boomerang: { name: 'ブーメラン', icon: '🪃', type: 'throwable', ... },
  bow:       { name: '弓矢',       icon: '🏹', type: 'throwable', ... },
  bomb:      { name: '爆弾',       icon: '💣', type: 'throwable', ... },
};
```

### NPCシステム

- マップ上に NPC を配置可能（エディタで設定）
- プレイヤーが NPC に隣接すると会話ダイアログが表示される
- **会話テキスト・キャラ名はエディタで設定**（JSON に保存）
- NPC は動かない（動くNPCは将来拡張）

---

## ファイル構成（新規）

```
outputs/blade-of-lumia/
├── game/
│   ├── index.html      ← ゲーム本体HTML
│   ├── game.css        ← スタイル
│   └── game.js         ← ゲームロジック（リアルタイムループ含む）
├── editor/
│   ├── index.html      ← エディタHTML（Dungeon Worldエディタを拡張）
│   ├── editor.css      ← スタイル
│   └── editor.js       ← エディタロジック
├── shared/
│   ├── tiles.js        ← タイル定数（NPC・ブーメランタイルを追加）
│   ├── sprites.js      ← スプライト（新規キャラ追加）
│   ├── enemies.js      ← 敵パラメータ
│   ├── items.js        ← ★新規：投擲アイテム定義
│   ├── npcs.js         ← ★新規：NPC定義
│   └── sounds.js       ← サウンド（流用）
└── work/
    └── blade-of-lumia.json ← マップデータ
```

---

## Dungeon World から継承するキャラ・ギミック一覧

### プレイヤー・NPC スプライト（継承）

| スプライト名 | 内容 | 備考 |
|---|---|---|
| `heroD/R/L/U` | 勇者（4方向） | プレイヤーキャラ（通常） |
| `princess` | 姫（正面） | NPC として使用可 |
| `princessR/L/U` | 姫（方向別） | NPC 動作時に使用 |

### 敵キャラ（継承）

| タイル | スプライト | 名前 | 速度 | 行動 |
|---|---|---|---|---|
| `PATROL` | `patrol` | パトロール | 通常 | ランダム移動 |
| `CHASER` | `chaser` | チェイサー | 通常 | プレイヤー追跡 |
| `SENTRY` | `sentry` | センチネル | 通常 | プレイヤー追跡 |
| `BOSS` | `escape` | ボス | 通常 | プレイヤー追跡 |
| `DARK_LORD` | `darklord` | 魔王 | 通常 | プレイヤー追跡 |

### ギミック・オブジェクト（継承）

| タイル | スプライト | 内容 |
|---|---|---|
| `WALL` | - | 壁（通過不可） |
| `FLOOR` | - | 床 |
| `WATER` | `water` | 水（通過不可） |
| `GATE` | `gateG` | ゲート（スイッチで開閉） |
| `DOOR` | `door` | 扉（鍵で開ける） |
| `SWITCH` | `swG` | スイッチ（踏むとゲート開閉） |
| `KEY` | `key` | 鍵（拾って扉を開ける） |
| `CHEST` | `chest` | 宝箱（中身はエディタで設定） |
| `STONE` | `block` | 石（押して移動可） |

---

## タイル定義（Blade of Lumia 追加分）

```js
// tiles.js（Dungeon World の全タイルを継承した上で追加）

// NPC
TILE.NPC_A     = 50  // NPC（種別A）
TILE.NPC_B     = 51  // NPC（種別B）

// マップ上に落ちているアイテム（直接拾える）
TILE.ITEM_SWORD     = 60  // 剣
TILE.ITEM_SHIELD    = 61  // たて
TILE.ITEM_ARMOR     = 62  // 防具
TILE.ITEM_BOOMERANG = 63  // ブーメラン
// 将来拡張用
// TILE.ITEM_BOW    = 64  // 弓矢
// TILE.ITEM_BOMB   = 65  // 爆弾
```

---

## スプライト要件

### 追加が必要なスプライト

| スプライト名 | 内容 | 優先度 |
|---|---|---|
| `sword` | 剣（マップ落ちアイテム表示用） | 高 |
| `shield` | たて（マップ落ちアイテム表示用） | 高 |
| `boomerang` | ブーメラン（マップ落ち＋飛翔アニメーション） | 高 |
| `npcA` | NPC キャラA（村人など） | 中 |
| `npcB` | NPC キャラB（商人など） | 中 |

### アイテム・装備のスプライト方針

- マップ上に**そのまま落ちているアイテム**も、宝箱から出てくるアイテムも同じスプライトを使用
- Dungeon World の `key`・`chest` と同様に 1〜2 フレームのアニメーション
- 剣・たては Dungeon World の既存スプライト（HUD 上の装備表示で使っているアイコン画像）を流用可

### 敵スプライトの速度バリエーション

スプライト自体は共通。速度は `ENEMY_META` で定義する：

```js
// enemies.js（Blade of Lumia 版）
const ENEMY_META = {
  [TILE.PATROL]:    { ..., speed: ENEMY_SPEED_SLOW },   // 鈍足（巡回）
  [TILE.CHASER]:    { ..., speed: ENEMY_SPEED_NORMAL }, // 通常（追跡）
  [TILE.SENTRY]:    { ..., speed: ENEMY_SPEED_NORMAL }, // 通常（追跡）
  [TILE.BOSS]:      { ..., speed: ENEMY_SPEED_FAST },   // 高速
  [TILE.DARK_LORD]: { ..., speed: ENEMY_SPEED_FAST },   // 高速
};
```

---

## 敵の攻撃行動システム

### 攻撃タイプ一覧

| 攻撃タイプ | 説明 | 対象敵 | スプライト |
|---|---|---|---|
| `charge`（体当たり） | プレイヤーに接触することでダメージ | 全敵（基本） | 既存スプライト流用 |
| `spear`（やり投げ） | プレイヤーの方向にやりを飛ばす | SENTRY など | `spear`（新規） |
| `stone`（石つぶて） | 放物線で石を飛ばす | PATROL など | `stone`（新規） |
| `sword`（剣振り） | 隣接時に剣でダメージ（高威力） | BOSS など | 既存スラッシュエフェクト流用 |

### ENEMY_META の拡張定義

```js
const ENEMY_META = {
  [TILE.PATROL]: {
    name: 'パトロール', hp: 3, atk: 1, def: 0, exp: 3,
    speed: ENEMY_SPEED_SLOW,
    attack: { type: 'charge' },         // 体当たりのみ
  },
  [TILE.CHASER]: {
    name: 'チェイサー', hp: 5, atk: 2, def: 0, exp: 5,
    speed: ENEMY_SPEED_NORMAL,
    attack: { type: 'charge' },
  },
  [TILE.SENTRY]: {
    name: 'センチネル', hp: 6, atk: 2, def: 1, exp: 8,
    speed: ENEMY_SPEED_NORMAL,
    attack: {
      type: 'spear',                    // やり投げ
      range: 4,                         // 射程（セル数）
      cooldown: 3000,                   // 攻撃間隔（ms）
      projectileSpeed: 1.5,             // 飛翔速度
    },
  },
  [TILE.BOSS]: {
    name: 'ボス', hp: 20, atk: 4, def: 2, exp: 30,
    speed: ENEMY_SPEED_FAST,
    attack: {
      type: 'sword',                    // 剣攻撃
      range: 1.5,                       // 射程（隣接範囲）
      cooldown: 1500,
    },
  },
  [TILE.DARK_LORD]: {
    name: '魔王', hp: 50, atk: 6, def: 3, exp: 100,
    speed: ENEMY_SPEED_FAST,
    attack: {
      type: 'stone',                    // 石つぶて
      range: 6,
      cooldown: 2000,
      projectileSpeed: 1.0,
      aoe: false,                       // 将来: true で範囲攻撃
    },
  },
};
```

### 投擲物（プロジェクタイル）の共通設計

プレイヤーのブーメランと同じ `projectiles` 配列で管理する：

```js
// projectiles 配列に投擲物を追加
function enemyFireProjectile(e) {
  const dx = Math.sign(player.x - e.x);
  const dy = Math.sign(player.y - e.y);
  projectiles.push({
    id:      nextId++,
    owner:   'enemy',           // 'player' or 'enemy'
    type:    e.attack.type,     // 'spear' / 'stone' / 'boomerang' など
    x: e.x, y: e.y,
    dx, dy,
    speed:   e.attack.projectileSpeed,
    atk:     e.atk,
    sprite:  PROJECTILE_SPRITE[e.attack.type],
  });
}

// 投擲物スプライト対応表
const PROJECTILE_SPRITE = {
  spear:     'spear',
  stone:     'stone',
  boomerang: 'boomerang',
};
```

### 攻撃タイミング・狙いのアルゴリズム

```
【体当たり（charge）】
  毎 tick プレイヤーに向かって移動。接触でダメージ。

【やり投げ（spear）】
  1. 毎 tick: プレイヤーが射程内かつ正面（同列・同行）かチェック
  2. cooldown が経過していれば発射
  3. やりはまっすぐ飛び、壁か端に当たると消滅
  4. プレイヤーに当たるとダメージ

【石つぶて（stone）】
  1. 毎 tick: プレイヤーが射程内かチェック（方向不問）
  2. cooldown が経過していれば、プレイヤーの現在位置を狙って発射
  3. 石は指定方向にまっすぐ飛ぶ（単純化）
  4. 壁か端で消滅、プレイヤーに当たるとダメージ

【剣攻撃（sword）】
  1. 毎 tick: プレイヤーが射程（1.5セル）以内かチェック
  2. cooldown が経過していれば剣振りアニメーション発動
  3. 範囲内のプレイヤーにダメージ（高威力）
  4. たてで防御可能
```

### 追加が必要なスプライト（攻撃系）

| スプライト名 | 内容 | 優先度 |
|---|---|---|
| `spear` | やり（横向き・縦向き 2 フレーム） | 高 |
| `stone` | 石つぶて（丸い、1〜2フレームアニメ） | 高 |
| `swordSlash` | 敵の剣エフェクト（プレイヤーの剣エフェクト流用可） | 中 |

---

## 条件付き出現ギミックシステム

### 概要

特定の行動を達成すると、隠れていた宝箱・アイテム・マップ入り口などが出現する。
出現条件はエディタで各オブジェクトに設定する。

---

### 出現トリガー（条件）の種類

| トリガー種別 | キー | 説明 |
|---|---|---|
| 敵全滅 | `killAll` | ステージ内の敵をすべて倒す |
| 指定敵全滅 | `killGroup` | タグ付きの敵グループをすべて倒す |
| スイッチ踏み | `switchOn` | 指定スイッチが ON になる |
| スイッチ全ON | `allSwitchesOn` | ステージ内の全スイッチが ON になる |
| 壁破壊 | `wallBroken` | 指定の壊せる壁を壊す |
| アイテム所持 | `hasItem` | 指定アイテムを持っている |

### 表示条件の JSON 設計

```js
// stage.showConditions["row,col"] に条件を設定
// 例：敵全滅で宝箱が出現
stage.showConditions["5,3"] = {
  trigger: 'killAll',            // トリガー種別
};

// 例：スイッチ踏みでマップ入り口が出現
stage.showConditions["2,7"] = {
  trigger: 'switchOn',
  switchId: '4,2',               // どのスイッチ（行,列）
};

// 例：特定の壁を爆弾で壊すと鍵が出現
stage.showConditions["8,1"] = {
  trigger: 'wallBroken',
  wallId: '8,0',                 // どの壊せる壁
};

// 例：ステージ内の敵グループ「guard」を全滅させると入り口出現
stage.showConditions["0,5"] = {
  trigger: 'killGroup',
  groupId: 'guard',
};
```

### 壊せる壁（BREAKABLE_WALL）

```js
// tiles.js に追加
TILE.BREAKABLE_WALL = 20  // 壊せる壁（外見は壁だがアイテムで破壊可能）
```

- **外見**：ひびの入った壁スプライト（`breakableWall`）
- **破壊判定**：攻撃に `breakPower` プロパティがあり、壁の `breakDef` 以上であれば破壊
- **破壊後**：`FLOOR` タイルに変化 → 出現条件を持つオブジェクトが出現可能に

```js
// 壊せる壁のパラメータ（エディタで設定）
stage.breakableWalls["row,col"] = {
  breakDef: 2,  // この値以上の breakPower が必要
};

// 各攻撃の breakPower
const ATTACK_BREAK_POWER = {
  sword:     0,  // 剣では壊せない
  boomerang: 0,  // ブーメランでも壊せない
  bomb:      3,  // 爆弾なら壊せる（breakDef 2 以下を破壊）
  // 将来: arrow: 0, hammerBlast: 5 など
};
```

> **例**: `breakDef: 2` の壁は bomb（`breakPower: 3`）で破壊可能。剣・ブーメランでは不可。

### マップ入り口（MAP_ENTER）

```js
TILE.MAP_ENTER = 21  // 別マップへの入り口（洞窟・城など）
```

- プレイヤーが乗るとマップ遷移（別ステージ座標に飛ぶ）
- `stage.mapEnters["row,col"] = { destStage: "5,3", destRow: 1, destCol: 5 }` で遷移先を設定
- 表示条件を設定すれば「特定条件達成後に入り口が現れる」演出が可能

---

### 条件評価ロジック（実装設計）

```js
// ステージ状態に条件達成フラグを保持
stageState[key].conditionsMet = new Set(); // 達成済みトリガーの識別子

// 毎 tick / 敵撃破時・スイッチ操作時に評価
function evaluateConditions() {
  const ss = getSS(stageKey);
  const sd = stageData;

  for (const [posKey, cond] of Object.entries(sd.showConditions ?? {})) {
    if (ss.conditionsMet.has(posKey)) continue; // 既に達成済み

    let met = false;
    if (cond.trigger === 'killAll') {
      met = enemies.length === 0;
    } else if (cond.trigger === 'killGroup') {
      met = enemies.every(e => e.group !== cond.groupId);
    } else if (cond.trigger === 'switchOn') {
      met = ss.switchStates?.[cond.switchId] === true;
    } else if (cond.trigger === 'allSwitchesOn') {
      met = ss.allSwitchesActive === true;
    } else if (cond.trigger === 'wallBroken') {
      met = ss.brokenWalls?.has(cond.wallId);
    } else if (cond.trigger === 'hasItem') {
      met = player.items?.includes(cond.item);
    }

    if (met) {
      ss.conditionsMet.add(posKey);
      // 出現演出（フラッシュ・サウンドなど）
      playSound('appear');
      render();
    }
  }
}
```

### エディタでの設定UI（追加）

- オブジェクト（宝箱・鍵・アイテム・入り口）を配置後、そのセルを選択すると**「表示条件」パネル**が右側に表示される
- トリガー種別をプルダウンで選択 → 追加パラメータを入力
- `stage.showConditions["row,col"]` に保存される
- エディタプレビュー上では「条件付きオブジェクト」は半透明で表示

### 追加タイル（壊せる壁・入り口）のスプライト

| スプライト名 | 内容 | 優先度 |
|---|---|---|
| `breakableWall` | ひびの入った壁（1〜2フレーム） | 高 |
| `mapEnter` | 洞窟・扉などの入り口（アニメあり） | 高 |

---

## サブアイテムシステム

### サブアイテムとは

剣・たて・防具などの**メイン装備**とは別に、マップ上で拾うことで使えるようになる**サブアイテム**。
ゼルダの伝説のブーメラン・爆弾・弓矢などに相当する。

---

### サブアイテム一覧

| アイテムID | 名前 | アイコン | 効果 | breakPower |
|---|---|---|---|---|
| `boomerang` | ブーメラン | 🪃 | 敵にダメージ・折り返して戻る | 0（壁破壊不可） |
| `bomb` | 爆弾 | 💣 | 周囲2セルに爆風ダメージ・壊せる壁を破壊 | 3 |
| `bow` | 弓矢 | 🏹 | 貫通する矢を直線に発射 | 0 |
| `healPotion` | 回復薬（小） | 🧪 | HP を 5 回復 | 0 |
| `bigHealPotion` | 回復薬（大） | 💊 | HP を最大まで回復 | 0 |

> 将来拡張用: ハンマー（`hammer`）・魔法（`magic`）など

---

### ITEM_META の完全定義

```js
export const ITEM_META = {
  boomerang: {
    name: 'ブーメラン', icon: '🪃', sprite: 'boomerang',
    type: 'throwable',        // 投擲系
    breakPower: 0,
    uses: Infinity,           // 回数無制限（戻ってきたら再使用可）
  },
  bomb: {
    name: '爆弾', icon: '💣', sprite: 'bomb',
    type: 'placeable',        // 置き型
    breakPower: 3,
    aoeRadius: 2,             // 爆風半径（セル）
    damage: 5,
    uses: null,               // スタック数で管理
  },
  bow: {
    name: '弓矢', icon: '🏹', sprite: 'arrow',
    type: 'throwable',
    breakPower: 0,
    piercing: true,           // 貫通
    uses: null,               // 矢の本数で管理
  },
  healPotion: {
    name: '回復薬（小）', icon: '🧪', sprite: 'healPotion',
    type: 'consumable',
    healAmount: 5,
    uses: null,               // スタック数で管理
  },
  bigHealPotion: {
    name: '回復薬（大）', icon: '💊', sprite: 'bigHealPotion',
    type: 'consumable',
    healAmount: 999,          // 最大 HP まで回復
    uses: null,
  },
};
```

---

### プレイヤーのアイテム保持データ

```js
// player.subItems: 所持しているサブアイテムと数量
player.subItems = {
  boomerang: { count: 1, has: true },   // 個数が意味を持つ場合 / has のみの場合
  bomb:      { count: 5 },
  bow:       { count: 0 },
  healPotion:{ count: 3 },
};

// player.activeSubItem: 現在選択中のサブアイテムID
player.activeSubItem = 'boomerang';
```

---

## ポーズ＆サブアイテム選択画面

### 仕様

- **Escape キー**（またはモバイルの「MENU」ボタン）でポーズ
- ゲームループ（`setInterval`）を停止し、アイテム選択画面をオーバーレイ表示
- 選択中のサブアイテムを変更して Escape で再開

### UI 設計

```
┌─────────────────────────────────┐
│         ⏸ PAUSED               │
│                                 │
│  所持アイテム:                   │
│  ┌───────┐ ┌───────┐ ┌───────┐ │
│  │  🪃   │ │  💣   │ │  🧪  │ │
│  │ブーメ │ │爆弾×5 │ │回復×3 │ │
│  │ ラン  │ │       │ │      │ │
│  └───────┘ └───────┘ └───────┘ │
│  ← → で選択  Escで決定・再開   │
│                                 │
│  HP: ❤❤❤❤❤ 20/20             │
│  装備: ⚔️ 長剣  🛡 木の盾     │
└─────────────────────────────────┘
```

### 操作方法

| 操作 | PC | モバイル |
|---|---|---|
| ポーズ | Escape | MENU ボタン |
| アイテム選択 | ← → キー | タップ |
| 決定して再開 | Escape / Enter | MENU ボタン |
| サブアイテム使用 | B キー（選択中のもの） | SUB ボタン |

### 実装設計

```js
let isPaused = false;
const pauseOverlayEl = document.getElementById('pause-overlay');

function togglePause() {
  isPaused = !isPaused;
  if (isPaused) {
    clearInterval(gameTimer);  // ゲームループ停止
    pauseOverlayEl.classList.remove('hidden');
    renderItemMenu();
  } else {
    pauseOverlayEl.classList.add('hidden');
    gameTimer = setInterval(gameTick, TICK_MS);  // 再開
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { togglePause(); return; }
  if (isPaused) {
    if (e.key === 'ArrowLeft')  selectPrevItem();
    if (e.key === 'ArrowRight') selectNextItem();
    return;
  }
  // 通常ゲーム操作...
});
```

---

### 回復アイテムの設計

| アイテム | 入手方法 | 回復量 | スタック上限 |
|---|---|---|---|
| 回復薬（小） | 宝箱・マップ落ち・敵ドロップ | HP +5 | 9 個 |
| 回復薬（大） | 宝箱・ボス撃破後 | HP 全回復 | 3 個 |

- 使用はポーズ画面で選択後、B キーまたは SUB ボタンで即時発動
- HP が満タンのときは使用不可（メッセージ表示）
- セーブデータに `player.subItems` として保存される

---

### 追加スプライト（サブアイテム系）

| スプライト名 | 内容 | 優先度 |
|---|---|---|
| `bomb` | 爆弾本体（マップ落ち＋設置アニメ） | 高 |
| `bombExplosion` | 爆発エフェクト（2〜3フレーム） | 高 |
| `arrow` | 矢（横向き・縦向き） | 中 |
| `healPotion` | 回復薬（小）スプライト | 中 |
| `bigHealPotion` | 回復薬（大）スプライト | 中 |

---

## エディタ拡張内容

### 追加するタイルパネル

| カテゴリ | 追加タイル |
|---|---|
| キャラ | NPC_A、NPC_B |
| アイテム | ブーメラン、剣、たて、防具 |
| 敵 | （既存流用＋新規追加） |

### NPC 会話設定UI

- NPC タイルを選択すると右パネルに「会話テキスト設定」が表示される
- キャラ名・セリフ（複数行可）を入力
- JSON: `stage.npcData["row,col"] = { name: "村人", lines: ["やあ！", "気をつけてね"] }`

### アイテム設置UI

- 投擲アイテムタイルをマップに配置するだけ（特別な設定不要）
- チェスト内アイテムとして設定することも可能

---

## ゲームループ設計（リアルタイム）

```js
// リアルタイムループ
const TICK_MS = 100; // 敵行動間隔

setInterval(() => {
  enemyTick();       // 全敵が行動
  projectileTick();  // ブーメラン等の投擲物を移動
  checkCollisions(); // 当たり判定
  render();          // 再描画
}, TICK_MS);

// プレイヤー入力は keydown / keyup イベントで即時反映
document.addEventListener('keydown', handleInput);
```

---

## 実装ステップ（優先順）

### Phase 1: 基盤構築
> **目標**: ファイル構成を作り、マップを読み込んでプレイヤーが動くところまで
> **状態**: ✅ 完了

- [x] `outputs/blade-of-lumia/` ディレクトリ・ファイル作成
- [x] `shared/tiles.js`：全タイル定数定義（Dungeon World 継承 + 新規追加分）
- [x] `shared/sprites.js`：Dungeon World から複製し、新規スプライト定義を追記
- [x] `shared/enemies.js`：速度・攻撃タイプを含む拡張版 ENEMY_META
- [x] `shared/items.js`：ITEM_META・ATTACK_BREAK_POWER を定義
- [x] `shared/sounds.js`：Dungeon World から複製・BGM 追加（field / dungeon / boss の3種）
- [x] `shared/npcs.js`：NPC スプライトマップ・デフォルト会話データ（Phase 1 で追加）
- [x] `game.js`：マップ JSON 読み込み・レイヤー管理（field / dungeon_N）
- [x] プレイヤー移動（**半セル移動** float x/y 座標 + CSS 絶対配置、キーボード + スワイプ + モバイル D-PAD）
- [x] ステージ遷移（画面端で隣接ステージへ）・レイヤー遷移（MAP_ENTER）
- [x] 剣攻撃（sword-thrust エフェクト、DW方式、正面ベクトル当たり判定）
- [x] **ハートシステム**：HP をハート表示・HUD 更新
- [x] **ダメージ無敵時間**：`takeDamage()` で invincible 判定・点滅エフェクト
- [x] リアルタイムループ（`setInterval` TICK_MS で敵行動）
- [x] 敵移動（プレイヤー追跡、半セル単位）
- [x] ゲームオーバー・復帰処理
- [x] セーブ・ロード（localStorage）
- [x] NPC 会話ダイアログ（複数セリフ・次へボタン）
- [x] ポーズ画面（Escape）・サブアイテム選択 UI
- [x] アイテム取得（剣・たて・防具・ブーメラン・ルピー・宝箱）
- [x] 条件付き出現ギミック `evaluateConditions()` 基盤実装
- [x] 起動時タイトルダイアログ（続きから / はじめから確認）
- [x] **剣攻撃クールダウン**（100ms = 1秒10回制限、連打防止）
- [x] **デバッグモード**（G キー：無敵・HUD に [DBG] 表示）※新規追加

> **実装時の仕様変更メモ**：
> - 移動は 1セル単位ではなく **0.5セル（半セル）単位** で実装。キャラはセルフルサイズのまま位置だけ 0.5刻みで動く
> - 剣エフェクトは Dungeon World の `sword-thrust::before` CSS 方式を採用（放射状エフェクトではなく線が伸びる）
> - 剣当たり判定は整数タイル比較ではなく **正面ベクトル内積**（半セル位置対応）
> - Phase 2 の内容（リアルタイムループ・剣攻撃・ハート・無敵・ゲームオーバー）は Phase 1 内で実装済み
> - **デバッグモード**（G キー）を全 Phase を通じての標準機能として追加。新機能実装時は必ずデバッグモードも一緒に対応すること

---

### Phase 2: リアルタイム戦闘基盤
> **目標**: 敵が動いて攻撃し、プレイヤーが剣で倒せる
> **状態**: ✅ Phase 1 内で実装済み

- [x] リアルタイムループ（`setInterval` TICK_MS で敵行動）
- [x] 敵移動（charge / patrol）
- [x] 剣攻撃（方向別スラッシュエフェクト、敵 HP 減少）
- [x] **ハートシステム**：HP をハート表示・HUD 更新
- [x] **ダメージ無敵時間**：`takeDamage()` で invincible 判定・点滅エフェクト
- [x] ゲームオーバー・復帰処理

---

### Phase 3: 装備＋サブアイテム基盤
> **目標**: 剣・たて・防具・ブーメランが使えるようになる
> **状態**: ✅ 完了

- [x] 装備（剣・たて・防具）取得・HUD 反映
- [x] たて防御（ボタン長押し中ダメージ軽減）
- [x] **ブーメラン**：投擲・飛翔・折り返し・当たり判定・アニメーション
- [x] **爆弾**：設置（2秒後爆発）・爆発エフェクト・AOE ダメージ・壊せる壁判定（breakPower）
- [x] **ポーズ画面**：Escape でゲームループ停止・サブアイテム選択 UI
- [x] **回復アイテム**：healPotion / bigHealPotion の使用処理
- [x] セーブデータに `player.subItems` を含める

> **実装時の仕様メモ**：
> - ブーメランは最大射程5セル、壁か射程端で折り返し、敵に当たると即折り返す
> - 爆弾は設置後2秒で爆発、爆風半径2セル（円形）、壊せる壁を破壊可（breakPower:3 >= breakDef:2 以下）
> - 爆弾の自爆ダメージあり（プレイヤーも範囲内なら被弾）
> - ステージ遷移時に飛翔物・設置爆弾を自動クリア
> - 投擲物は `projectiles` 配列で一元管理（Phase 4 の敵弾も同構造で拡張可能）

---

### Phase 4: 敵の高度な行動
> **目標**: やり投げ・石つぶて・剣振りする敵が出る

- [ ] プロジェクタイル（`projectiles` 配列）の共通処理実装
- [ ] やり投げ（spear）敵：射程・同列判定・cooldown
- [ ] 石つぶて（stone）敵：射程・方向算出・cooldown
- [ ] 剣振り（sword）敵：近距離高威力・たてで防御可能
- [ ] 各プロジェクタイルのスプライト・当たり判定

---

### Phase 5: ギミック＆ NPC
> **目標**: スイッチ・壊せる壁・条件付き出現・NPC 会話が動く

- [ ] 壊せる壁（BREAKABLE_WALL）：hitDef 判定・破壊後 FLOOR 化
- [ ] 条件付き出現ギミック：`evaluateConditions()` 実装
- [ ] MAP_ENTER（レイヤー間遷移）の完全実装
- [ ] NPC 接触ダイアログ（複数セリフ・次へボタン）
- [ ] ルピー拾得・`player.rupees` 管理
- [ ] ショップ UI（商品リスト・購入確認・ルピー消費）
- [ ] ハートコンテナ・ルピー・トライフォースのカケラのスプライト追加

---

### Phase 6: ダンジョン＋クリア条件
> **目標**: ダンジョンに入れて、ボスを倒してトライフォースを集めると終わる

- [ ] ダンジョンレイヤー：JSON の layers 構造・BGM 切り替え
- [ ] ダンジョン専用 HUD（地図・コンパス状態表示）
- [ ] コンパス / 地図アイテムの処理（ポーズ画面にマップ表示）
- [ ] トライフォースのカケラ取得 → `player.triforceCount` 更新
- [ ] 全カケラ収集 → `startEnding()`

---

### Phase 7: エディタ拡張
> **目標**: Blade of Lumia 専用の全タイル・設定をエディタで操作できる

- [ ] NPC タイル（NPC_A/B）・会話テキスト編集 UI
- [ ] アイテムタイル（剣・たて・防具・ブーメラン・爆弾・ルピーなど）のパレット
- [ ] 壊せる壁（breakDef 設定 UI）
- [ ] 表示条件（showConditions）設定 UI（トリガー種別選択・追加パラメータ）
- [ ] MAP_ENTER 遷移先設定 UI（レイヤー・ステージ・座標）
- [ ] ショップ商品設定 UI
- [ ] ダンジョンレイヤー作成 UI（新規レイヤー追加）
- [ ] エディタプレビューで全新規タイルをスプライト表示

---

### Phase 8: コンテンツ制作
> **目標**: 実際に遊べる最低限のゲームとして完成させる

- [ ] スタートステージ設計（剣配置・チュートリアル的構成・初 NPC 配置）
- [ ] フィールドワールドマップ設計（複数エリア）
- [ ] ダンジョン 1 設計（ボス・トライフォース・地図・コンパス配置）
- [ ] BGM / SE 追加・音量バランス調整
- [ ] エンディング演出

---

## ハートシステム＋ダメージ無敵時間

### ハート表示

- HP を「ハート」単位で表示（1ハート = 2 HP）
- 最大ハート数は初期 3個、ハートコンテナを拾うと +1
- HUD に ❤❤❤ として表示

```js
// ハート関連の定数・変換
const HP_PER_HEART = 2;
player.maxHp      = 6;   // 初期3ハート分
player.maxHearts  = 3;   // ハート数（HUD 表示用）

// ハートコンテナ取得時
function gainHeartContainer() {
  player.maxHearts++;
  player.maxHp += HP_PER_HEART;
  player.hp = player.maxHp;  // 全回復
}
```

- チェスト内アイテムに `heartContainer` を追加
- タイルとして `TILE.ITEM_HEART_CONTAINER = 70` を追加

### ダメージ無敵時間

- ダメージを受けた直後、**1500ms 間は無敵**（点滅で表示）
- この間は敵・投擲物からのダメージを無効化

```js
let invincibleUntil = 0; // 無敵終了タイムスタンプ

function takeDamage(amount) {
  if (Date.now() < invincibleUntil) return; // 無敵中
  player.hp -= amount;
  invincibleUntil = Date.now() + 1500;
  startBlinkEffect(); // プレイヤースプライトを点滅させる
  if (player.hp <= 0) { player.hp = 0; gameover(); }
}

function startBlinkEffect() {
  let count = 0;
  const timer = setInterval(() => {
    playerEl.style.opacity = (count % 2 === 0) ? '0.3' : '1';
    if (++count >= 10) { clearInterval(timer); playerEl.style.opacity = '1'; }
  }, 150);
}
```

---

## ルピー（お金）＋ショップシステム

### ルピーの仕様

- フィールド・ダンジョンに落ちているルピーを拾う
- 敵を倒すとルピーをドロップすることがある
- `player.rupees` として保持

```js
// tiles.js に追加
TILE.ITEM_RUPEE       = 71  // ルピー（小）：1枚
TILE.ITEM_RUPEE_LARGE = 72  // ルピー（大）：5枚
```

```js
// スプライト
// rupee: 緑のルピー（小）
// rupeeBlue: 青のルピー（大）
```

### ショップNPC

- `TILE.NPC_SHOP` を配置すると「ショップ」として機能
- プレイヤーが話しかけるとショップ画面が開く
- 商品リストはエディタで設定

```js
// stage.shopData["row,col"] にショップ商品を設定
stage.shopData["3,5"] = {
  name: '道具屋',
  items: [
    { id: 'bomb',      count: 5,  price: 20 },
    { id: 'healPotion', count: 1, price: 10 },
    { id: 'arrow',     count: 10, price: 30 },
  ],
};
```

- ショップ UI：商品をカーソルで選択 → 購入確認 → ルピー消費

---

## ダンジョンレイヤーシステム

### フィールドとダンジョンの分離

Blade of Lumia のマップは2レイヤー構造：

| レイヤー | キー | 内容 |
|---|---|---|
| フィールド | `field` | 屋外ワールドマップ。ステージが縦横に繋がる |
| ダンジョン | `dungeon_1` `dungeon_2` … | 地下・洞窟など。独立したマップ群 |

```js
// blade-of-lumia.json の構造
{
  "version": 1,
  "layers": {
    "field": {
      "stages": { "0,0": {...}, "1,0": {...}, ... }
    },
    "dungeon_1": {
      "name": "死の山の洞窟",
      "bgm": "dungeon",
      "stages": { "0,0": {...}, "1,0": {...}, ... }
    },
    "dungeon_2": { ... }
  }
}
```

### レイヤー間遷移の設計思想

**「出口 ID」方式**を採用する。

各 `MAP_ENTER` タイルには **ユニークな ID**（文字列）を付与し、
遷移先も「どの ID へ飛ぶか」で指定する。
これにより **A ↔ B の双方向ペア**が明示的に管理できる。

```js
// MAP_ENTER タイルに「出口ID」と「遷移先ID」を設定する
stage.mapEnters["5,3"] = {
  id:        'cave1_entrance',   // この出口の識別子
  destId:    'cave1_exit',       // 飛び先となる出口の識別子
};

// 飛び先（cave1_exit）の定義（dungeon_1 レイヤーのどこかのステージにある）
stage.mapEnters["1,5"] = {
  id:        'cave1_exit',
  destId:    'cave1_entrance',   // 双方向ペア
};
```

ゲームエンジンは起動時に全レイヤー・全ステージの `mapEnters` を走査し、
`id → { layer, stage, row, col }` のルックアップテーブルを構築する：

```js
// 起動時に構築
const exitRegistry = {}; // { id: { layer, stage, row, col } }

for (const [layerKey, layerData] of Object.entries(mapData.layers)) {
  for (const [stageKey, sd] of Object.entries(layerData.stages)) {
    for (const [posKey, enter] of Object.entries(sd.mapEnters ?? {})) {
      const [row, col] = posKey.split(',').map(Number);
      exitRegistry[enter.id] = { layer: layerKey, stage: stageKey, row, col };
    }
  }
}

// 遷移時
function useMapEnter(enter) {
  const dest = exitRegistry[enter.destId];
  if (!dest) { console.warn('遷移先が見つかりません:', enter.destId); return; }
  changeLayer(dest.layer, dest.stage, dest.row, dest.col);
}
```

---

### エディタでのレイヤー間遷移設定UI

#### ステップ 1：MAP_ENTER タイルを配置する

- エディタで `MAP_ENTER` タイルをマップに配置
- セルを選択すると右パネルに「出口設定」が表示される

#### ステップ 2：出口 ID を入力する

```
┌──────────────────────────────────┐
│ 出口設定                          │
│                                  │
│ 出口ID:  [cave1_entrance       ] │
│ 遷移先ID:[cave1_exit           ] │
│                                  │
│ ※ 遷移先IDは飛び先タイルの      │
│   出口IDと一致させてください      │
└──────────────────────────────────┘
```

- 出口 ID と遷移先 ID はどちらも自由な文字列
- 命名規則の例：`dungeon1_B1F_stairA_down` / `dungeon1_B2F_stairA_up`

#### ステップ 3：飛び先のタイルにも同じように設定する

- 飛び先レイヤー・ステージに移動して MAP_ENTER タイルを配置
- 出口 ID = 遷移先の `destId`、遷移先 ID = 元の `id` を設定

#### ペア確認UI

- 出口 ID と遷移先 ID が両方存在するペアは 🔗 マークで表示
- 片方しかない（未接続）ものは ⚠️ マークで警告表示
- エディタ上部の「遷移一覧」パネルで全ペアを確認できる

---

### マップ遷移（ゲームエンジン）

- ダンジョンに入ると BGM が切り替わる
- ダンジョン内では「ダンジョン専用 HUD」（地図・コンパス状態）を表示可

### コンパス＆地図（ダンジョン内アイテム）

- **地図**（`dungeonMap`）：宝箱から入手 → ポーズ画面にダンジョン全体マップを表示
- **コンパス**（`compass`）：宝箱から入手 → ボス部屋の位置をマップ上に表示

```js
// player.dungeonItems: ダンジョンごとに管理
player.dungeonItems = {
  dungeon_1: { hasMap: false, hasCompass: false },
  dungeon_2: { hasMap: false, hasCompass: false },
};
```

---

## トライフォース / クリア条件

### 設計

- 各ダンジョンのボスを倒すと「トライフォースのカケラ」を1つ入手
- 全 N 個集めるとゲームクリア（エンディングへ）

```js
// player.triforceCount: 集めた数
// player.triforceTotal: 全ダンジョン数（マップデータから取得）

// ボス撃破時
function onBossDefeated() {
  player.triforceCount++;
  showMessage('トライフォースのカケラを手に入れた！');
  if (player.triforceCount >= player.triforceTotal) {
    startEnding(); // エンディングへ
  }
}
```

- HUD に ◇ × N 個 で表示
- タイル: `TILE.ITEM_TRIFORCE_PIECE = 73`（ボス撃破後に出現）

---

## 押せるブロック（秘密の入り口）

### 仕様

- `STONE`（押せる石）を特定の場所に押し込むと、`MAP_ENTER` タイルが出現する
- 表示条件 `showConditions` の `trigger: 'switchOn'` で対応可能

### 設計

Dungeon World の石押し（`STONE` → `SWITCH` 連携）をそのまま拡張：

```js
// STONE を押した先が SWITCH タイルの場合、スイッチが ON になる（既存機能）
// その SWITCH が ON になると showConditions で MAP_ENTER が出現する

stage.showConditions["5,5"] = {
  trigger: 'switchOn',
  switchId: '5,6',  // 石を押し込む先のスイッチ座標
};
// 結果: スイッチ位置に石を押し込むと隠し入り口が現れる
```

> **既存機能の組み合わせで実現可能**。新規タイルは不要。

---

## ボス戦システム

### 概要

ボス部屋に入ると特殊な演出が始まり、ボスを倒すまで部屋から出られない。
ボスは多段フェーズを持ち、弱点アイテムを使う戦略性がある。

---

### ① ボス専用 HP バー

通常敵の HP バー（セル上の細いバー）とは別に、**画面下部に大きな HP ゲージ**を表示する。

```html
<!-- HUD に追加 -->
<div id="boss-hpbar" class="boss-hpbar hidden">
  <span class="boss-name">魔将ガノン</span>
  <div class="boss-hp-track">
    <div id="boss-hp-fill" class="boss-hp-fill"></div>
  </div>
</div>
```

```js
function showBossHpBar(boss) {
  bossHpBarEl.classList.remove('hidden');
  bossNameEl.textContent = ENEMY_META[boss.type].name;
  updateBossHpBar(boss);
}

function updateBossHpBar(boss) {
  bossHpFillEl.style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
}

function hideBossHpBar() {
  bossHpBarEl.classList.add('hidden');
}
```

---

### ② ボス部屋ロック

ボス部屋（`isBossRoom: true` のステージ）に入ると扉が全て閉まり、ボス撃破まで出られない。

```js
// ステージメタ設定（エディタで設定）
stage.isBossRoom = true;   // このステージはボス部屋

// 入室時の処理
function enterStage(key, pRow, pCol) {
  const sd = mapData.stages[key];
  // ...既存処理...
  if (sd.isBossRoom) {
    lockAllDoors();          // 全扉を強制ロック
    startBossBattle(key);    // ボス戦開始
  }
}
```

**エディタUI**: ステージ設定パネルに「ボス部屋」チェックボックスを追加

---

### ③ ボス戦 BGM

ボス部屋に入った瞬間にBGMを切り替える。

```js
function startBossBattle(stageKey) {
  stopBgm();
  playBgm('boss');           // ボス専用 BGM
  // ボス登場演出を開始
  startBossEntrance();
}
```

**エディタUI**: ダンジョン設定パネルに「ボス BGM キー」入力欄を追加（省略時は `'boss'` デフォルト）

---

### ④ ボス登場演出

ボス部屋に入った直後、以下のシーケンスを実行する：

```
1. 入室 → 全扉が閉まる（ガコン！効果音）
2. 0.5秒後 → 画面が一瞬暗くなる
3. テキスト表示：「〇〇 が 現れた！」
4. ボス HP バー がゆっくり出現
5. ボスがアニメーションしながら動き出す
6. ゲームループ再開（プレイヤー操作可能に）
```

```js
async function startBossEntrance() {
  _battleBusy = true;          // プレイヤー操作禁止
  lockAllDoors();
  playSound('doorLock');
  await sleep(500);
  showDarkOverlay();
  await sleep(300);
  hideDarkOverlay();
  const boss = enemies.find(e => ENEMY_META[e.type].isBoss);
  showBossHpBar(boss);
  showMessage(`${ENEMY_META[boss.type].name} が 現れた！`);
  await sleep(1500);
  _battleBusy = false;         // プレイヤー操作再開
}
```

---

### ⑤ ボスの多段フェーズ

ボスの HP が一定以下になると行動が変化する。

```js
// ENEMY_META のボス定義に phases を追加
[TILE.BOSS]: {
  name: 'ボス', hp: 20, atk: 4, def: 2, exp: 30,
  isBoss: true,
  speed: ENEMY_SPEED_FAST,
  attack: { type: 'sword', range: 1.5, cooldown: 1500 },
  phases: [
    {
      hpThreshold: 0.5,   // HP が 50% 以下になったら
      speed: 1.5,          // 速度アップ
      attack: {
        type: 'sword',
        range: 2.0,
        cooldown: 800,     // 攻撃頻度アップ
      },
      onPhaseChange: 'bossEnrage', // 演出ID
    },
  ],
},
```

```js
// 毎 tick でフェーズチェック
function checkBossPhase(boss) {
  const meta = ENEMY_META[boss.type];
  if (!meta.phases) return;
  for (const phase of meta.phases) {
    const ratio = boss.hp / boss.maxHp;
    if (ratio <= phase.hpThreshold && !boss.phasesTriggered?.includes(phase.hpThreshold)) {
      triggerBossPhase(boss, phase);
    }
  }
}

function triggerBossPhase(boss, phase) {
  boss.phasesTriggered = [...(boss.phasesTriggered ?? []), phase.hpThreshold];
  boss.speed  = phase.speed ?? boss.speed;
  boss.attack = phase.attack ?? boss.attack;
  playSound('bossEnrage');
  showMessage('ボスが 怒り狂った！');
  startBlinkEffect(boss); // ボス点滅演出
  updateBossHpBar(boss);
}
```

---

### ⑥ ボス撃破演出

ボスを倒したときの演出シーケンス：

```
1. ボスが点滅（10回、150ms間隔）
2. 爆発エフェクトを3〜5回表示
3. ボスが消える
4. 効果音：fanfare（勝利音）
5. ボス HP バーが消える
6. 扉が開く
7. トライフォースのカケラが出現（中央に）
8. テキスト：「トライフォースのカケラを 手に入れた！」
9. プレイヤーが触れると収得 → 全カケラで endingへ
```

```js
async function onBossDefeated(boss) {
  _battleBusy = true;
  // 点滅
  for (let i = 0; i < 10; i++) {
    boss.visible = !boss.visible;
    render();
    await sleep(150);
  }
  // 爆発
  for (let i = 0; i < 4; i++) {
    showExplosion(boss.row + (Math.random() - 0.5), boss.col + (Math.random() - 0.5));
    await sleep(200);
  }
  playSound('fanfare');
  hideBossHpBar();
  enemies = enemies.filter(e => e.id !== boss.id);
  unlockAllDoors();
  // トライフォース出現
  spawnTriforce(boss.row, boss.col);
  showMessage('トライフォースのカケラを 手に入れた！');
  player.triforceCount++;
  if (player.triforceCount >= player.triforceTotal) {
    await sleep(2000);
    startEnding();
  }
  _battleBusy = false;
}
```

---

### ⑦ ボスの弱点設定

特定のサブアイテムを使うと「気絶状態」になり、その間は剣ダメージが増加する。

```js
// ENEMY_META にボスの弱点を追加
[TILE.BOSS]: {
  // ...
  weakness: {
    item:        'boomerang',  // ブーメランで気絶
    stunDuration: 2000,        // 2秒間気絶
    dmgMultiplier: 2.0,        // 気絶中は剣ダメージ 2倍
  },
},
[TILE.DARK_LORD]: {
  // ...
  weakness: {
    item:        'bomb',       // 爆弾でダメージボーナス
    stunDuration: 0,           // 気絶なし
    dmgMultiplier: 1.5,        // ただしダメージ 1.5倍
  },
},
```

```js
// ブーメラン等がボスに当たったときの処理
function onProjectileHitEnemy(proj, enemy) {
  const meta = ENEMY_META[enemy.type];
  const weakness = meta.weakness;

  if (weakness && proj.type === weakness.item) {
    // 弱点アイテム命中
    if (weakness.stunDuration > 0) {
      enemy.stunUntil = Date.now() + weakness.stunDuration;
      enemy.speed = 0;  // 気絶中は停止
      showMessage(`${meta.name}が 気絶した！`);
    }
    // ダメージボーナス（サブアイテムのダメージにも適用）
    const dmg = calcDamage(proj.atk * weakness.dmgMultiplier, enemy.def);
    enemy.hp -= dmg;
  } else {
    const dmg = calcDamage(proj.atk, enemy.def);
    enemy.hp -= dmg;
  }
}

// 剣攻撃でも気絶中ボーナス適用
function calcSwordDamage(player, enemy) {
  const meta = ENEMY_META[enemy.type];
  const isStunned = enemy.stunUntil && Date.now() < enemy.stunUntil;
  const multiplier = (isStunned && meta.weakness?.dmgMultiplier) ? meta.weakness.dmgMultiplier : 1.0;
  return calcDamage(player.atk * multiplier, enemy.def);
}
```

**エディタUI**: ボス敵タイルを選択 → 「弱点設定」パネル
- 弱点アイテムをプルダウン（ブーメラン / 爆弾 / 弓矢 / なし）
- 気絶時間（ms）を入力
- ダメージ倍率を入力

---

### ボス戦関連のエディタ定義サマリー

| 要素 | JSON キー | エディタUI |
|---|---|---|
| ボス部屋フラグ | `stage.isBossRoom` | ステージ設定 → 「ボス部屋」チェックボックス |
| ボス BGM | `layers[key].bossBgm` | ダンジョン設定 → BGM プルダウン |
| ボスの多段フェーズ | `ENEMY_META[type].phases` | 敵タイル選択 → 「フェーズ設定」パネル |
| ボスの弱点 | `ENEMY_META[type].weakness` | 敵タイル選択 → 「弱点設定」パネル |
| ボスパラメータ上書き | `stage.enemyParams` | 敵タイル選択 → 右パネル（既存） |

---

## エディタ定義マスター一覧

プランに登場する全ゲーム要素について、エディタ上での定義方法を整理する。

---

### ① 敵キャラクターのカスタムパラメータ

Dungeon World で実装済みの `enemyParams` を継承・拡張する。

```js
// stage.enemyParams["row,col"] で個別の敵パラメータを上書き
stage.enemyParams["3,4"] = {
  hp:    10,            // HP 上書き
  atk:   5,            // 攻撃力上書き
  def:   2,            // 防御力上書き
  exp:   20,           // 経験値上書き
  speed: 0.75,         // 速度上書き（ENEMY_META のデフォルトを上書き）
  group: 'boss_guard', // killGroup トリガー用グループID
};
```

**エディタUI**: 敵タイルを選択 → 右パネルに「敵パラメータ設定」を表示
- HP / ATK / DEF / EXP / 速度 を数値入力
- グループID を文字列入力（killGroup トリガーで使用）

---

### ② 宝箱の中身

Dungeon World で実装済みの `chestContents` を継承・拡張する。

```js
// stage.chestContents["row,col"] で宝箱の中身を設定
stage.chestContents["5,2"] = {
  type:  'item',       // 'item' | 'weapon' | 'armor' | 'rupee' | 'heart'
  id:    'boomerang',  // ITEM_META のキー（type='item' の場合）
  count: 1,            // 個数（消耗品の場合）
  name:  'ブーメラン', // 表示名（省略可、ITEM_META から自動取得）
};

// 他の例
stage.chestContents["2,7"] = { type: 'rupee',  value: 50 };
stage.chestContents["8,1"] = { type: 'heart',  value: 1  }; // ハートコンテナ
stage.chestContents["3,3"] = { type: 'weapon', id: 'sword_iron', atk: 3 };
stage.chestContents["4,4"] = { type: 'armor',  id: 'armor_chain', def: 2 };
```

**エディタUI**: 宝箱タイルを選択 → 「中身設定」パネル
- 種別プルダウン（アイテム / 武器 / 防具 / ルピー / ハートコンテナ）
- アイテムID をプルダウン（ITEM_META の一覧から選択）
- 個数・名前を入力

---

### ③ マップ上に落ちているアイテム（直接拾えるもの）

```js
// stage.floorItems["row,col"] でマップ上のアイテムを設定
// TILE.ITEM_SWORD などのタイルを配置するだけでOK
// 個数・バリアントが必要な場合はここで指定
stage.floorItems["7,3"] = {
  id:    'bomb',
  count: 3,   // 爆弾3個まとめて
};
stage.floorItems["2,8"] = {
  id:    'rupee',
  value: 5,   // 5ルピー
};
```

**エディタUI**: アイテムタイル（ITEM_BOMB など）を配置 → 右パネルに「個数・バリアント」設定欄

---

### ④ 敵ドロップ設定

```js
// stage.enemyDrops["row,col"] で各敵のドロップを設定
// 省略時は ENEMY_META のデフォルト（ルピーをランダムドロップ）が使われる
stage.enemyDrops["3,4"] = {
  type:    'rupee',
  value:   5,
  chance:  0.5,   // ドロップ確率（0〜1）
};
stage.enemyDrops["6,2"] = {
  type:    'item',
  id:      'healPotion',
  count:   1,
  chance:  0.3,
};
```

**エディタUI**: 敵タイルを選択 → 「ドロップ設定」パネル
- 種別プルダウン（ルピー / アイテム / なし）
- アイテムID / 個数 / 確率（0〜100%）を入力

---

### ⑤ ショップ商品設定

```js
// stage.shopData["row,col"] でショップを定義（再掲・詳細）
stage.shopData["3,5"] = {
  name: '道具屋のポポ',
  items: [
    { id: 'bomb',       count: 5,  price: 20 },
    { id: 'healPotion', count: 1,  price: 10 },
    { id: 'arrow',      count: 10, price: 30 },
  ],
};
```

**エディタUI**: NPC_SHOP タイルを選択 → 「ショップ設定」パネル
- 店名を入力
- 商品リストを追加（アイテムID / 個数 / 価格）
- 商品の並び替え・削除

---

### ⑥ NPC 会話テキスト

```js
// stage.npcData["row,col"]（再掲・詳細）
stage.npcData["4,6"] = {
  name:   '村人 タロ',
  sprite: 'npcA',       // 使用するスプライト
  lines:  [
    '東の洞窟には危険な魔物がいるよ。',
    '爆弾を持っていないと先に進めないみたい。',
  ],
};
```

**エディタUI**: NPC タイルを選択 → 「会話設定」パネル
- キャラ名を入力
- スプライト種別をプルダウン（npcA / npcB / princess / …）
- セリフを複数行テキストエリアで入力（1行 = 1ページ）

---

### ⑦ 壊せる壁のパラメータ

```js
// stage.breakableWalls["row,col"]（再掲・詳細）
stage.breakableWalls["2,1"] = {
  breakDef: 2,     // 爆弾なら壊せる強さ
  hp:       1,     // 将来: 複数回攻撃が必要な壁（1 = 一撃で壊れる）
};
```

**エディタUI**: BREAKABLE_WALL タイルを選択 → 「壁強度設定」パネル
- breakDef を数値入力（1: 軽い / 2: 中 / 3: 重い）
- 説明プレビュー：「爆弾で壊せる / 壊せない」

---

### ⑧ 表示条件（showConditions）

（既にプラン記載済み。エディタUIも記載済み）

---

### ⑨ MAP_ENTER（レイヤー間遷移）

（既にプラン記載済み。出口ID方式・エディタUIも記載済み）

---

### ⑩ ダンジョンレイヤーのメタ情報

```js
// blade-of-lumia.json の layers 内にダンジョンのメタ情報を設定
"dungeon_1": {
  "name": "死の山の洞窟",    // ダンジョン名（HUD・地図に表示）
  "bgm":  "dungeon",         // ダンジョン BGM キー
  "bossStage": "2,3",        // ボス部屋のステージキー（コンパス表示用）
  "triforceId": 1,           // このダンジョンのトライフォース番号
  "stages": { ... }
}
```

**エディタUI**: レイヤー一覧パネルでダンジョンを選択 → 「ダンジョン設定」パネル
- ダンジョン名を入力
- BGM キーをプルダウン
- ボス部屋ステージキーを入力
- トライフォース番号を入力（1〜N）

---

### ⑪ プレイヤースタート位置

```js
// blade-of-lumia.json に初期スタート位置を定義
"startPos": {
  "layer": "field",
  "stage": "0,0",
  "row":   5,
  "col":   8
}
```

**エディタUI**: フィールドレイヤーで PLAYER タイルを配置するだけ（Dungeon World 継承）

---

### ⑫ ステージの BGM 個別設定

通常はレイヤーの BGM が使われるが、ステージごとに上書き可能：

```js
// stage.bgm = 'bossTheme'  // このステージだけ別 BGM
```

**エディタUI**: ステージ設定パネルに「BGM 上書き」プルダウンを追加

---

### エディタ定義サマリー表

| 要素 | JSON キー | エディタUI | 定義箇所 |
|---|---|---|---|
| 敵パラメータ上書き | `stage.enemyParams` | 敵タイル選択 → 右パネル | ✅ 設計済み |
| 宝箱の中身 | `stage.chestContents` | 宝箱タイル選択 → 右パネル | ✅ 設計済み |
| マップ落ちアイテム詳細 | `stage.floorItems` | アイテムタイル選択 → 右パネル | ✅ 設計済み |
| 敵ドロップ | `stage.enemyDrops` | 敵タイル選択 → ドロップパネル | ✅ 設計済み |
| ショップ商品 | `stage.shopData` | NPC_SHOP 選択 → ショップパネル | ✅ 設計済み |
| NPC 会話 | `stage.npcData` | NPC タイル選択 → 会話パネル | ✅ 設計済み |
| 壊せる壁の強度 | `stage.breakableWalls` | BREAKABLE_WALL 選択 → 右パネル | ✅ 設計済み |
| 表示条件 | `stage.showConditions` | オブジェクト選択 → 表示条件パネル | ✅ 設計済み |
| MAP_ENTER 遷移先 | `stage.mapEnters` | MAP_ENTER 選択 → 出口設定パネル | ✅ 設計済み |
| ダンジョンメタ情報 | `layers[key].name/bgm/bossStage` | レイヤー設定パネル | ✅ 設計済み |
| スタート位置 | `startPos` | PLAYER タイル配置 | ✅ 設計済み |
| ステージ BGM 上書き | `stage.bgm` | ステージ設定パネル | ✅ 設計済み |

---

## 注意事項・設計方針

- **リアルタイムとターン制の共存**は避ける（Blade of Lumiaはリアルタイムに統一）
- **投擲アイテムは `ITEM_META` で一元管理**し、新しいアイテムは定義を追加するだけで拡張可能にする
- **NPC の会話データはマップJSONに含める**（`stage.npcData`）ことでエディタと一体管理
- **no-multiline-shell ルール厳守**（シェルスクリプトはファイルに書き出してから実行）
- エディタは Dungeon World エディタのコードを**最大限再利用**し、差分のみ修正する
