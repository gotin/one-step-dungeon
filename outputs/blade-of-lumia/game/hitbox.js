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
 */
export function enemyCenter(e) {
	return { cx: e.x + enemyW(e) / 2, cy: e.y + enemyH(e) / 2 };
}

/**
 * 2つの矩形（top-left 座標 + サイズ）が重なるか。
 */
export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
	return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
