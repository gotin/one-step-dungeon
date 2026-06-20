//  Blade of Lumia  conditions.js
//  条件評価・石スイッチ・ゲート連動（Phase 0-2 Step 2 で game.js から切り出し）
//
//  passable.js と同じく、再代入される可変状態（stageData/enemies/player/
//  currentLayer/stageKey）を参照するため「状態 getter と依存関数を注入する
//  factory」形式にする。playSound / renderBoard / renderChars といった副作用
//  関数も注入で受け取り、呼び出し側（game.js）の改修を不要にする。
import { TILE } from '../shared/tiles.js';
import { playSound } from '../shared/sounds.js';

/**
 * 条件評価関数群を生成する。
 * @param {object} d 依存（状態 getter と関数）
 * @param {() => object} d.getStageData    現在のステージデータ
 * @param {() => Array}  d.getEnemies      敵配列
 * @param {() => object} d.getPlayer       プレイヤー
 * @param {() => string} d.getCurrentLayer 現在レイヤー
 * @param {() => string} d.getStageKey     現在ステージキー
 * @param {(lk:string, sk:string) => object} d.getSS ステージ状態取得
 * @param {(y:number) => number} d.toTileRow
 * @param {(x:number) => number} d.toTileCol
 * @param {() => void} d.renderBoard
 * @param {() => void} d.renderChars
 * @returns {{checkStoneOnSwitch, evaluateConditions}}
 */
export function createConditions(d) {
	const {
		getStageData, getEnemies, getPlayer, getCurrentLayer, getStageKey,
		getSS, toTileRow, toTileCol, renderBoard, renderChars,
	} = d;

	// 石がスイッチの上に乗っているかチェックしてスイッチ状態を更新
	function checkStoneOnSwitch() {
		const stageData = getStageData();
		const player    = getPlayer();
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (!ss.stonePositions) return;
		// まずスイッチ状態を「石によるON」をリセット（石がないスイッチはOFF）
		// ただしプレイヤーが踏んでいる場合は維持する
		for (let r = 0; r < stageData.rows; r++) {
			for (let c = 0; c < stageData.cols; c++) {
				if (stageData.tiles[r][c] !== TILE.BUTTON) continue;
				const pk = `${r},${c}`;
				// 石がこのスイッチの上にあるか確認
				const stoneHere = Object.values(ss.stonePositions).some(st => st.r === r && st.c === c);
				// プレイヤーが踏んでいるか確認
				const playerHere = toTileRow(player.y) === r && toTileCol(player.x) === c;
				if (stoneHere || playerHere) {
					if (!ss.switchStates[pk]) {
						ss.switchStates[pk] = true;
						// スイッチに連動するゲートを開く
						for (const link of stageData.links ?? []) {
							if (link.switchId === pk) {
								ss.openGates.add(link.gateId);
								playSound('gateOpen');
							}
						}
					}
				} else {
					// 石もプレイヤーもいない → スイッチを最初に踏んだプレイヤーによる永続ONでない場合のみOFF
					// ※ STONE タイル元位置でのスイッチ（石が最初からスイッチの上）は永続ON扱い
					// プレイヤーが踏んでONになったスイッチは石が離れてもON維持
					// → 石による一時スイッチ = ss.stoneSwitches に記録している場合のみリセット
					if (!ss.stoneSwitches) ss.stoneSwitches = new Set();
					if (ss.stoneSwitches.has(pk)) {
						ss.switchStates[pk] = false;
						// 閉じるゲート処理
						for (const link of stageData.links ?? []) {
							if (link.switchId === pk) ss.openGates.delete(link.gateId);
						}
					}
				}
			}
		}
		// 今石が乗っているスイッチを stoneSwitches に記録
		if (!ss.stoneSwitches) ss.stoneSwitches = new Set();
		for (const st of Object.values(ss.stonePositions)) {
			const pk = `${st.r},${st.c}`;
			if (stageData.tiles[st.r]?.[st.c] === TILE.BUTTON) {
				ss.stoneSwitches.add(pk);
			}
		}
	}

	// ── 条件評価 ──────────────────────────────────────────────────
	function evaluateConditions() {
		const stageData = getStageData();
		if (!stageData?.showConditions) return;
		const enemies = getEnemies();
		const player  = getPlayer();
		const ss = getSS(getCurrentLayer(), getStageKey());
		for (const [posKey, cond] of Object.entries(stageData.showConditions)) {
			if (ss.conditionsMet.has(posKey)) continue;
			let met = false;
			if (cond.trigger === 'killAll')    met = enemies.length === 0;
			else if (cond.trigger === 'flutePlayed') met = ss.flutePlayed === true;  // Phase 4-2: 笛を吹いた
			else if (cond.trigger === 'bushBurned') met = ss.bushBurned === true;  // Phase 4-3: ロウソクで茂みを燃やした
			else if (cond.trigger === 'switchOn') met = ss.switchStates?.[cond.switchId] === true;
			else if (cond.trigger === 'wallBroken') met = ss.brokenWalls?.has(cond.wallId);
			else if (cond.trigger === 'hasItem') met = !!player.subItems[cond.item] || player.weapon === cond.item;
			else if (cond.trigger === 'allSwitchesOn') {
				const allSw = [];
				for (let _r = 0; _r < stageData.rows; _r++) {
					for (let _c = 0; _c < stageData.cols; _c++) {
						if (stageData.tiles[_r][_c] === TILE.BUTTON) allSw.push(`${_r},${_c}`);
					}
				}
				met = allSw.length > 0 && allSw.every(pk => ss.switchStates?.[pk] === true);
			}
			if (met) {
				ss.conditionsMet.add(posKey);
				playSound('appear');
				renderBoard(); renderChars();
			}
		}
	}

	return { checkStoneOnSwitch, evaluateConditions };
}
