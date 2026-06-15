//  Blade of Lumia  passable.js
//  通行可否判定（Phase 0-2 Step 2 で game.js から切り出し）
//
//  これらの関数は stageData / enemies / player / currentLayer / stageKey /
//  debugMode といった「再代入される可変状態」を参照する。ESModule の
//  named import は read-only binding のため値を直接 import できない。
//  そこで「状態 getter と依存関数を注入する factory」形式にし、game.js が
//  起動時に一度だけ createPassable(deps) を呼んで関数群を生成する。
//  getter 経由で常に最新状態を読むので、呼び出し側の改修は不要。
import { TILE } from '../shared/tiles.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';

// Phase 1-5: 翼の羽衣で飛行中に「上を飛び越えられる」障害物タイル。
// ルール：自然物（空・水・木・茂み・柵）は飛び越え可。
//        山・壁・建造物（家）・閉じた門/扉は飛んでも越えられない＝マップ境界として機能し続ける。
// ※ per-instance のデータ追加は不要（タイル種別だけで分類できる）。
const FLYABLE_OVER = new Set([
	TILE.SKY, TILE.WATER, TILE.TREE, TILE.BUSH, TILE.FENCE,
]);

/**
 * 通行可否判定関数群を生成する。
 * @param {object} d 依存（状態 getter と関数）
 * @param {() => object} d.getStageData   現在のステージデータ
 * @param {() => Array}  d.getEnemies     敵配列
 * @param {() => object} d.getPlayer      プレイヤー
 * @param {() => string} d.getCurrentLayer 現在レイヤー
 * @param {() => string} d.getStageKey    現在ステージキー
 * @param {() => boolean} d.getDebugMode  デバッグモード
 * @param {(lk:string, sk:string) => object} d.getSS ステージ状態取得
 * @param {(y:number) => number} d.toTileRow
 * @param {(x:number) => number} d.toTileCol
 * @returns {{isPassable, tilePassable, isPassableForEnemy}}
 */
export function createPassable(d) {
	const {
		getStageData, getEnemies, getPlayer, getCurrentLayer, getStageKey,
		getDebugMode, getSS, toTileRow, toTileCol,
	} = d;

	// キャラは 1×1 セルの大きさ
	//
	// キャラが占めるタイル範囲：
	//   列方向: floor(x) 〜 floor(x + 0.999)  （x が整数のとき 1列、0.5のとき 2列）
	//   行方向: floor(y) 〜 floor(y + 0.999)
	//
	// 例: x=1.5 → 列 1 と 列 2 に跨る → 両方チェック
	function isPassable(nx, ny) {
		const stageData = getStageData();
		if (!stageData) return false;
		const c0 = Math.floor(nx);
		const c1 = Math.floor(nx + 0.999);
		const r0 = Math.floor(ny);
		const r1 = Math.floor(ny + 0.999);

		// Phase 1-5: 翼の羽衣で飛行中は「空（SKY）」「水（WATER）」を越えられる。
		// 飛行は player 専用（敵は isPassableForEnemy 経由なので地上判定のまま）。
		const flying = !!getPlayer()?.flying;

		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				// マップ外 → ステージ端遷移なので通行可として扱う
				if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) continue;
				if (!tilePassable(r, c)) {
					// 飛行中は自然物（空・水・木・茂み・柵）の上を飛び越えられる。
					// 山・壁・家・閉じた門/扉などは飛んでもブロック（マップ境界を維持）。
					const t = stageData.tiles[r]?.[c];
					if (flying && FLYABLE_OVER.has(t)) continue;
					return false;
				}
			}
		}

		const debugMode = getDebugMode();
		// デバッグモード中は敵すり抜け可能
		if (debugMode) return true;

		// 移動後の石があるセルには移動できない（範囲チェック）
		if (stageData && !debugMode) {
			const _ssp = getSS(getCurrentLayer(), getStageKey());
			for (const st of Object.values(_ssp.stonePositions ?? {})) {
				if (st.r >= r0 && st.r <= r1 && st.c >= c0 && st.c <= c1) return false;
			}
		}

		// 敵と同じタイルセルには移動できない（重なり防止）
		// ※ 「0.6未満」判定だと半セル移動時に動けなくなるため、タイル単位で比較する
		for (const e of getEnemies()) {
			if (toTileRow(ny) === toTileRow(e.y) && toTileCol(nx) === toTileCol(e.x)) return false;
		}

		return true;
	}

	function tilePassable(r, c) {
		const stageData = getStageData();
		const tile   = stageData.tiles[r]?.[c];
		if (!tile) return false;
		const posKey = `${r},${c}`;
		const ss     = getSS(getCurrentLayer(), getStageKey());
		const debugMode = getDebugMode();
		if (tile === TILE.WALL) return false;
		if (tile === TILE.WATER) return false;
		if (tile === TILE.SKY) return false;  // 空（虚空）：地上では通れない（飛行は isPassable で許可）
		if (tile === TILE.GATE   && !ss.openGates.has(posKey)) return false;
		// デバッグモード中はドアを素通り（鍵不要）
		if (tile === TILE.DOOR   && !ss.openedDoors?.has(posKey) && !debugMode) return false;
		if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) return false;
		if (NPC_SPRITE_MAP[tile]) return false;
		// Phase 8: フィールドタイル通行判定
		if (tile === TILE.TREE)        return false;
		if (tile === TILE.MOUNTAIN)    return false;
		if (tile === TILE.FENCE)       return false;
		if (tile === TILE.HOUSE_WALL)  return false;
		if (tile === TILE.HOUSE_ROOF)  return false;
		if (tile === TILE.SIGN)        return false; // 看板は通行不可（隣接して剣で読む）
		if (tile === TILE.BUSH) {
			// 茂み：切られていれば通行可
			if (ss.cutBushes?.has(posKey)) return true;
			return false;
		}
		// 石（STONE）の通行判定：元のタイル位置で判断
		if (tile === TILE.STONE) {
			const _ss = getSS(getCurrentLayer(), getStageKey());
			// stonePositions に登録されていれば石は移動済み → 元の位置は床として通行可
			if (_ss.stonePositions?.[posKey]) return true;
			return false; // 移動されていない → 石がある → 通れない
		}
		// Phase 6.5: ドアウェイの通行判定
		if (tile === TILE.DOORWAY_BOSS || tile === TILE.DOORWAY_LOCKED) {
			const dwState = ss.doorwayStates?.[posKey];
			// DOORWAY_LOCKED: 閉じている間は通れない
			if (tile === TILE.DOORWAY_LOCKED) {
				const state = dwState ?? 'closed';
				if (state !== 'open') return false;
			}
			// DOORWAY_BOSS: boss_closed 状態は通れない
			if (tile === TILE.DOORWAY_BOSS) {
				if (dwState === 'boss_closed') return false;
			}
		}
		return true;
	}

	// 敵向けの通行可否（同じ 1セル占有チェック）
	function isPassableForEnemy(ny, nx, self) {
		const stageData = getStageData();
		if (!stageData) return false;
		const c0 = Math.floor(nx);
		const c1 = Math.floor(nx + 0.999);
		const r0 = Math.floor(ny);
		const r1 = Math.floor(ny + 0.999);

		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				if (r < 0 || r >= stageData.rows || c < 0 || c >= stageData.cols) return false;
				if (!tilePassable(r, c)) return false;
			}
		}
		// 移動後の石があるセルには通れない
		if (stageData) {
			const _sspe = getSS(getCurrentLayer(), getStageKey());
			for (const st of Object.values(_sspe.stonePositions ?? {})) {
				if (toTileRow(ny) === st.r && toTileCol(nx) === st.c) return false;
			}
		}
		// 他の敵と大きく重なっているなら通れない
		for (const e of getEnemies()) {
			if (e === self) continue;
			if (Math.abs(e.x - nx) < 0.6 && Math.abs(e.y - ny) < 0.6) return false;
		}
		// プレイヤーと同じタイルセルには移動できない（重なり防止）
		// 隣接セルへの移動は許可するので体当たり攻撃は成立する
		const player = getPlayer();
		if (toTileRow(ny) === toTileRow(player.y) && toTileCol(nx) === toTileCol(player.x)) return false;
		return true;
	}

	return { isPassable, tilePassable, isPassableForEnemy };
}
