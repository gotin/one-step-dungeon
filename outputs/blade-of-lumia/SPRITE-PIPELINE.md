# 敵スプライト生成パイプライン（OpenAI 画像 API → 量子化）

Blade of Lumia の敵スプライトを OpenAI 画像 API（`gpt-image-1`）で生成し、既存の描画形式（パレット番号の2次元配列＋パレット・32×32）へ量子化する手順と、実際に #8 骸骨剣士の DOWN 4枚を作って確定させたときの反復知見をまとめる。残り14種＋既存全敵の 32×32 化でも同じ手順を使う。

初出＝2026-08-10（5.5k・#8 骸骨剣士 DOWN 方向の試作で確立）。

---

## 0. 前提・置き場所

- API キー＝`outputs/blade-of-lumia/.env.local` の `OPEN_API_KEY`（gitignore 済み・秘匿・コミットしない）。
- 使い捨てスクリプト・生成物は全て `outputs/blade-of-lumia/.scratch/`（gitignore 済み）に置く。プロジェクト外（`/tmp` 等）に置かない。
- 採用スプライト＝**量子化後の 32×32**（比較画像の下段）。生成 PNG（1024px）はそのままでは使わない。
- 表示サイズは CSS で固定（`.char-abs canvas.sprite{width:var(--cell)}`＋`image-rendering:pixelated`・`game/css/board.css`）∴配列を 32×32 にしても表示サイズは変わらない（`drawSprite()` は `canvas.width=grid[0].length` で配列のドット数を内部解像度に採るだけ）。

## 1. スクリプト3本（すべて `.scratch/`）

- **`gen-enemy-sprite.mjs`** — OpenAI 画像 API を叩いて元絵 PNG を生成。
  - 使い方：`node .scratch/gen-enemy-sprite.mjs "<prompt>" <out.png> [ref1.png,ref2.png,...]`
  - 第4引数に**参照画像**を渡すと `images/edits`（FormData `image[]`）を使い、参照の配色・スタイルに寄せる。無ければ `images/generations`。
  - API パラメータ＝`{model:'gpt-image-1', size:'1024x1024', background:'transparent', n:1}`。
- **`quantize-sprite.mjs`** — 生成 PNG（1024px・透明背景）を 32×32 のパレット番号配列＋パレットに量子化。
  - 使い方：`node .scratch/quantize-sprite.mjs <in.png> <out-basename> [colors]`（既定6色）。
  - 処理＝①α閾値128でグロー/半透明を落とし不透明ピクセルの BBox を取る ②正方パディングで縦横比を保ちつつ 32×32 へ平均縮小（不透明が35%未満のセルは透明）③**最遠点法 k-means（乱数なし決定版）で約6色に量子化**・index0 を transparent 固定・輝度順ソート ④`quant-<base>.json`（palette＋grid）＋拡大再描画 PNG を出力。
- **`compare-multi.mjs`** — 複数ポーズを1枚のグリッドで目視比較（上段=生成PNG／下段=量子化・市松背景）。
  - 使い方：`node .scratch/compare-multi.mjs <outname> "label:inPng:quantBase" ...` → `.scratch/shots/compare-<outname>.png`。
  - （単体用に `compare-sprite.mjs` も有り＝1体を 生成PNG/表示相当48px/拡大 の3枚で。）

## 2. 確定プロンプトの型（DOWN 方向・#8 で成功したもの）

**プリアンブル（HARD CONSTRAINTS）をポーズ語の前に毎回必ず置く。** これが盾2枚・剣消失・黒縁の再発を最も強く抑える。

```
A single pixel-art sprite of a skeleton warrior enemy for a top-down 2D action RPG,
NES Legend of Zelda style, facing DOWN toward the viewer (front view).
Match the two reference images exactly for palette, proportions and line style.
HARD CONSTRAINTS: the skeleton holds a sword with a full visible steel-gray blade
in its LEFT hand (screen-left); exactly ONE round dark-red shield, on the LEFT side
only, never a shield on the right side; NO black outline anywhere; bold flat colors,
no anti-aliasing, no gradients, about 6 colors including the dark-red shield and gray
blade; the figure fills the entire 32x32 frame edge to edge with minimal margin;
fully transparent background, no floor, no shadow, no border, no text.
POSE: <ポーズ差分をここに短く。プリアンブルの後ろ>
```

参照画像は2枚渡す（`images/edits`）：
1. **色・線の基準**＝最初に合格した横向き素材（`openai-skeleton.png`）。
2. **構図・持ち物配置の基準**＝**同じ向きで採用済みのフレーム**（DOWN なら歩行1 `skel-down-f1.png`）。

ポーズ差分の実例（DOWN・全て成功した文言）：
- **歩行2**＝`a front-facing walking frame. The torso, shoulders and skull stay FULLY FRONT-FACING toward the viewer exactly like the reference — do NOT rotate or turn the body to the side, this is NOT a side view. ... ONLY the legs change: one leg is bent and raised (knee up) as if marching in place while still facing forward, the other leg planted.`
- **攻撃**＝`attacking downward — both hands grip the sword in front of the chest and thrust the full blade straight DOWN toward the viewer, the gray blade pointing downward and clearly visible below the hands. The dark-red shield stays on the LEFT side only.`
- **盾ガード**＝`raising the round shield forward on its LEFT side to cover the chest; the full skeleton body stays visible behind the shield (do not hide the skeleton, do not cut a hole); the shield is a SOLID round disc, not hollow; the sword stays visible.`

## 3. 反復で分かった注意点（★＝ハマりどころ）

- **★ 持ち物・利き手・線・色は「ポーズ語の前」に定数として毎回書く**（A案）。ポーズごとに文を作り直すと、この定数が抜けて盾2枚・剣消失・黒縁が再発する。今回の最初の失敗はこれ。
- **★ 参照は2枚（色基準＋同方向の採用済みフレーム）が最適**（B案）。1枚（横向きだけ）だと配色は揃うがポーズが崩れる。正面向きを描くなら正面の採用済みフレームを参照に足す。
- **★ 参照に「出来の悪い絵」を足すと悪い方に引っ張られる**。旧攻撃 PNG（骨だけ寄り・描き込み弱い）を参照に足したら、剣も盾も消えてベージュ一色に退化した。**参照は良い見本だけにする。**
- **★ ポーズは参照から大きく動かさない＝最小変形で指示する**。「swinging downward, arm extended」のように参照から離れた大胆なポーズを言うと、モデルが参照を無視して独自の濃い描き込み（黒縁）を足す。「立ち姿勢のまま剣だけ下に突き出す」のように差分を絞ると参照のスタイルが保たれる。
- **★ 「向き」は明示的に固定する**。DOWN の歩行2で「脚を踏み出す」とだけ言うと、モデルが体ごと横向き（side view）に回して歩かせてしまう。`FULLY FRONT-FACING / do NOT rotate to the side / this is NOT a side view` を明記して初めて正面のまま脚だけ動く絵になった。
- **★ 生成は非決定的＝同一プロンプトでも当たり外れがある**（D案）。特に黒縁は同じプロンプトで出たり出なかったりする。**重要ポーズは同プロンプトで2枚引いて良い方を選ぶ**のが速くて確実。今回も攻撃・歩行2は2枚引きで採った。
- **★ 剣は「刃(full blade)」を明示**。単に「sword」だと持ち手だけ描いて刃が消えることがある。`a full visible steel-gray blade` と書く。
- **量子化パレットで出来を素早く判定できる**。生成 PNG を開く前に `quantize` のログの palette を見て、黒(`#0x...`)が入っていれば黒縁混入の疑い、ベージュ一色なら剣灰・盾赤が消えた疑い＝比較画像を見るまでもなく引き直しを判断できる。
- **量子化の色初期化は最遠点法（k-means++ 決定版・乱数なし）**。明度順均等サンプルにすると面積の大きい色（骨のベージュ）に種が集中し、剣灰・盾赤など少数の重要色を取りこぼす。最遠点法で `#8b3b31`（盾赤）・`#7f7f7e`（剣灰）を正しく捕捉できた。

## 4. 進め方（レビュー駆動）

1. 1体・1方向ずつ作る。一括生成しない（[[blade-no-mass-production]]）。
2. プロンプトをユーザーに報告 → 生成 → 量子化 → `compare-multi.mjs` で比較画像を作る → ユーザーが採用可否を判定。
3. 採用したら確定名にコピー（`skel-<dir>-final-{walk1,walk2,atk,guard}.png` と `quant-<dir>-final-*.json`）。
4. 全方向（DOWN/UP/RIGHT・左は描画時 flipX）が揃ったら `shared/sprites-enemies.js` に登録。

## 5. #8 骸骨剣士 DOWN の確定結果（2026-08-10）

- walk1 = `skel-down-final-walk1.png`（最初に合格した歩行1）
- walk2 = `skel-down-final-walk2.png`（正面向きマーチ＝walk1 と交互で足踏みに見える）
- attack = `skel-down-final-atk.png`（両手で剣を体の前に構え真下へ突き出す）
- guard = `skel-down-final-guard.png`（盾を前に・ソリッド・骨も見える）
- 確定比較＝`.scratch/shots/compare-skel-down-FINAL.png`。
- 残り＝UP・RIGHT 方向（各4枚）→ 4方向表示のエンジン機構（新敵は4方向表示が要る）→ `sprites-enemies.js` 登録。
