// game/hitbox.js ── 占有範囲（AABB）ベースの当たり判定ヘルパー（Phase 3-2）
//
// 敵は size:{w,h}（省略時 1×1）でセルを占有する。大型敵（2×2 など）でも
// 当たり判定が正しく効くよう、判定を「占有範囲」ベースに一般化する。
//
// 設計の要：1×1 敵では既存の判定（top-left 座標 ± margin の箱）と
// 完全に一致させ、デグレを出さない。w/h が大きいほど箱が広がる。

// 敵の占有幅・高さ（未設定なら 1）
export function enemyW(e) { return e?.w ?? 1; }
export function enemyH(e) { return e?.h ?? 1; }

// ── タイル添字（float 座標 → 最も近いセル）────────────────────────────────
// `game/game.js` の toTileRow/toTileCol はこれを呼ぶ＝**丸めの規則はここが単一の真実**。
// 下の enemyOccupiesTile が同じ規則で占有セルを出せることが要（規則が2か所にあると
// 「タイル判定だけ 1 セルずれる」種類のバグが生える）。
export function toTileIndex(v) { return Math.floor(v + 0.5); }

/**
 * 敵 e の占有範囲がタイル (tr, tc) を含むか。**タイル単位で当たりを見る攻撃**（ロウソクの
 * 炎など「前の1マス」を対象にするもの）はこれを通す。
 *
 * 1×1 の敵では `toTileRow(e.y) === tr && toTileCol(e.x) === tc` と完全に一致する。
 *
 * ⚠️ 敵の座標 `e.x/e.y` は占有範囲の**左上**∴左上タイルだけを見る書き方は 2×2 の残り3タイルを
 *    取りこぼす。2026-08-30 にロウソクの炎で実害を出した＝炎の弱点（O 古森の巨人・L 氷の
 *    リヴァイアサン・I 沼地の大蝦蟇＝**3体とも 2×2**）が、左上タイルを向いたときしか通らず
 *    他の向きでは無音・無表示の 0 ダメージ＝「弱点が無い」ように見えていた。
 */
export function enemyOccupiesTile(e, tr, tc) {
	const r0 = toTileIndex(e.y), c0 = toTileIndex(e.x);
	return tr >= r0 && tr < r0 + enemyH(e) && tc >= c0 && tc < c0 + enemyW(e);
}

/**
 * 点 (px, py) が敵 e の当たり箱（top-left 基準・margin 付き）に入るか。
 * 1×1 のとき: |px - e.x| < margin && |py - e.y| < margin（＝従来挙動と一致）。
 * w×h のとき: 箱の中心が body 中心へ移り、半幅が (w-1)/2 + margin に広がる。
 */
export function enemyPointHit(e, px, py, margin) {
	const w = enemyW(e), h = enemyH(e);
	const halfX = (w - 1) / 2 + margin;
	const halfY = (h - 1) / 2 + margin;
	const cx = e.x + (w - 1) / 2;
	const cy = e.y + (h - 1) / 2;
	return Math.abs(px - cx) < halfX && Math.abs(py - cy) < halfY;
}

/**
 * 敵 e の幾何中心 (x, y)。1×1 のとき (e.x+0.5, e.y+0.5)。
 * ＝**タイルの角**を原点に見た中心（px 変換・エフェクトの置き場所に使う）。
 */
export function enemyCenter(e) {
	return { cx: e.x + enemyW(e) / 2, cy: e.y + enemyH(e) / 2 };
}

// ── Phase 8-4 (4) 0d-2.5: 大型敵の「間合い」を測るための中心と半サイズ ────────────
// 敵の座標 `e.x/e.y` は占有範囲の **左上**。∴`player.x - e.x` は距離ではなく
// 「プレイヤーと左上角の差」＝2×2 では西/北から測ると体の幅ぶん（1セル）遠く出る。
// 機構の発動条件をこれで書くと「向きによって間合いが 1 セル変わる」（0d-2 で実測した罠）。
// ∴間合いを測る側は必ず下の3つを通す。1×1 では halfW=halfH=0 ＝従来の値と一致する。

/**
 * セル添字基準の body 中心。`player.x/y`（セル添字の float）と**直接**比較できる中心。
 * ⚠️ enemyCenter（上）とは 0.5 セルずれる。あちらは「タイルの角」原点＝描画用、
 *    こちらは「セル添字」原点＝プレイヤー座標との比較用。用途の違う2つの中心を混ぜない。
 */
export function enemyCellCenter(e) {
	return { cx: e.x + (enemyW(e) - 1) / 2, cy: e.y + (enemyH(e) - 1) / 2 };
}

/** セル添字基準の body 半サイズ（1×1 で {0,0}）。判定の箱をこの分だけ広げる。 */
export function enemyHalf(e) {
	return { halfW: (enemyW(e) - 1) / 2, halfH: (enemyH(e) - 1) / 2 };
}

/**
 * 点 (px, py) から body の**端**までの距離（body の内側なら 0）。
 * ＝「間合い」の単一の定義。1×1 では中心からの距離と一致する∴既存の敵に差が出ない。
 */
export function enemyEdgeDist(e, px, py) {
	const { cx, cy } = enemyCellCenter(e);
	const { halfW, halfH } = enemyHalf(e);
	const gx = Math.max(0, Math.abs(px - cx) - halfW);
	const gy = Math.max(0, Math.abs(py - cy) - halfH);
	return Math.hypot(gx, gy);
}

/**
 * 2つの矩形（top-left 座標 + サイズ）が重なるか。
 */
export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
	return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
