// ── Blade of Lumia – save.js ──────────────────────────────────
// セーブ/ロードの「純粋な変換ロジック」を集約するモジュール。
// （Phase 0-2 Step 1b：状態の再代入は game.js 側に残し、シリアライズ/
//   デシリアライズの純粋関数だけをここへ切り出す。ESModule の read-only
//   binding 問題を回避するための設計。）
//
// 方針：
//  - この関数群は「状態オブジェクトを受け取り、変換した値を返す」純粋関数。
//  - localStorage への read/write や状態の再代入は game.js 側で行う
//    （SAVE_KEY を使った保存・player 等への代入は呼び出し側の責務）。

// 新規ステージ状態エントリを生成する（getSS が未登録キーで使う初期値）。
export function createStageState() {
	return {
		visited:         false,
		openGates:       new Set(),
		pickedKeys:      new Set(),
		defeatedEnemies: new Set(),
		openedChests:    new Set(),
		objects:         {},
		switchStates:    {},
		brokenWalls:     new Set(),
		conditionsMet:   new Set(),
		openedDoors:     new Set(),  // 鍵で開いたドア
		stonePositions:       {},    // { 'r,c': {r, c} } 石の移動後位置
		solvedStonePositions: null,  // 全ボタン充足時の石位置スナップショット（再入時に復元）
		switchToggles:   new Set(),  // Phase 4-5 ①: 武器の攻撃で ON にしたトグルスイッチ
		litTorches:      new Set(),  // Phase 4-5 ②: 点灯したかがり火
		activeColor:     null,       // Phase 5-1: 現在アクティブな色（'red'|'blue'|null）
	};
}

// stageState（Set を含む実行時形式）を localStorage 保存用のプレーン形式
// （Set → 配列）に変換する純粋関数。
export function serializeStageState(stageState) {
	const ss = {};
	for (const [k, v] of Object.entries(stageState)) {
		ss[k] = {
			visited:         v.visited ?? false,
			openGates:       [...v.openGates],
			pickedKeys:      [...v.pickedKeys],
			defeatedEnemies: [...v.defeatedEnemies],
			openedChests:    [...v.openedChests],
			objects:         v.objects,
			switchStates:    v.switchStates,
			brokenWalls:     [...v.brokenWalls],
			conditionsMet:   [...v.conditionsMet],
			doorwayStates:   v.doorwayStates ?? {},        // Phase 6.5
			cutBushes:       [...(v.cutBushes ?? [])],      // Phase 8.2
			openedDoors:     [...(v.openedDoors ?? [])],    // 鍵で開いたドア
			stonePositions:       v.stonePositions ?? {},
			solvedStonePositions: v.solvedStonePositions ?? null,
			switchToggles:   [...(v.switchToggles ?? [])],  // Phase 4-5 ①
			litTorches:      [...(v.litTorches ?? [])],     // Phase 4-5 ②
			activeColor:     v.activeColor ?? null,          // Phase 5-1
		};
	}
	return ss;
}

// 保存用プレーン形式（配列）を実行時形式（Set）へ復元する純粋関数。
// ※ stonePositions は常にリセット（セーブデータを引き継がない）。
export function deserializeStageState(rawSS) {
	const stageState = {};
	for (const [k, v] of Object.entries(rawSS ?? {})) {
		stageState[k] = {
			visited:         v.visited ?? false,
			openGates:       new Set(v.openGates ?? []),
			pickedKeys:      new Set(v.pickedKeys ?? []),
			defeatedEnemies: new Set(v.defeatedEnemies ?? []),
			openedChests:    new Set(v.openedChests ?? []),
			objects:         v.objects ?? {},
			switchStates:    v.switchStates ?? {},
			brokenWalls:     new Set(v.brokenWalls ?? []),
			conditionsMet:   new Set(v.conditionsMet ?? []),
			doorwayStates:   v.doorwayStates ?? {},          // Phase 6.5
			cutBushes:       new Set(v.cutBushes ?? []),      // Phase 8.2
			openedDoors:     new Set(v.openedDoors ?? []),    // 鍵で開いたドア
			stonePositions:       v.solvedStonePositions ?? {},  // パズル解決済みなら復元
			solvedStonePositions: v.solvedStonePositions ?? null,
			switchToggles:   new Set(v.switchToggles ?? []),  // Phase 4-5 ①
			litTorches:      new Set(v.litTorches ?? []),     // Phase 4-5 ②
			activeColor:     v.activeColor ?? null,            // Phase 5-1
		};
	}
	return stageState;
}

// ロードした player から、passive アイテム（heartContainer 等）が subItems に
// 混入していた旧セーブデータを修正する純粋関数（player を直接書き換える）。
// itemMeta は items.js の ITEM_META を渡す（純粋性のため引数で受け取る）。
export function sanitizeLoadedPlayer(player, itemMeta) {
	for (const k of Object.keys(player.subItems ?? {})) {
		if (itemMeta[k]?.type === 'passive') {
			delete player.subItems[k];
		}
	}
	if (player.activeSubItem && itemMeta[player.activeSubItem]?.type === 'passive') {
		player.activeSubItem = Object.keys(player.subItems)[0] ?? null;
	}
	return player;
}
