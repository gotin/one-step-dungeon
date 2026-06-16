// ── Blade of Lumia – main.js ──────────────────────────────────
// Phase 0-2 Step 6: エントリポイント
// init() の呼び出し・ゲームループ起動・window イベント・テストフック公開のみを担う。
// ゲームロジックは game.js に集約されており、必要な関数を import して使う。

import {
	init,
	updateBoardScale,
	step,
	movePlayer,
	swordAttack,
	useSubItem,
	getProjectiles,
	getGameState,
	getInputModule,
	getEnemiesSnapshot,
	injectTestEnemy,
	dealDamageToEnemyById,
	startAnimLoop,
	redrawAnimSprites,
	startEnding,
	callToggleFlight,
	callStartCharge,
	callReleaseCharge,
} from './game.js';

// ── アニメーション ────────────────────────────────────────────
startAnimLoop(() => { redrawAnimSprites(); });

// ── 起動 ─────────────────────────────────────────────────────
init().catch(err => {
	console.error('init failed:', err);
	document.body.innerHTML = `<p style="color:red;padding:20px">読み込みエラー: ${err.message}</p>`;
});

// ── ウィンドウリサイズ ─────────────────────────────────────────
window.addEventListener('resize', () => updateBoardScale());

// ── デバッグ用：コンソールから呼び出せるようにグローバルに公開 ──
window._debugEnding = () => startEnding();

// ── テスト用フック（Phase 0-1）────────────────────────────────
// E2E テストから決定論的にゲームを操作するための API を公開する。
//   __game.step(n)        : 実時間ゼロで n フレーム進める（gameTime を n*TICK_MS 加算）
//   __game.queueInput(d)  : 方向 d ('up'|'down'|'left'|'right') の押下を予約（次の step で反映）
//   __game.releaseInput(d): 方向 d の押下を解除
//   __game.movePlayer(d)  : プレイヤーを 1 操作分だけ即座に移動
//   __game.swordAttack()  : 剣攻撃を即座に実行
//   __game.getState()     : 現在の主要状態のスナップショット（player 座標・gameTime 等）
// 本番動作には影響しない（読み取り＋既存関数の呼び出しのみ）。
window.__game = {
	step,
	queueInput(dir) {
		const keyMap = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
		const k = keyMap[dir];
		// initInput 後は _inputModule.heldKeys を優先使用（processHeldKeys と同じ Set を操作）
		const _inputModule = getInputModule();
		if (k) (_inputModule ? _inputModule.heldKeys : null)?.add(k);
	},
	releaseInput(dir) {
		const keyMap = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
		const k = keyMap[dir];
		const _inputModule = getInputModule();
		if (k) (_inputModule ? _inputModule.heldKeys : null)?.delete(k);
	},
	movePlayer: (dir) => movePlayer(dir),
	swordAttack: () => swordAttack(),
	// チャージ攻撃（剣ビーム）テスト用（Phase 3-1）
	startCharge: () => callStartCharge(),
	releaseCharge: () => callReleaseCharge(),
	useSubItem: () => useSubItem(),
	toggleFlight: () => callToggleFlight(),
	// 投擲物の現在状態をスナップショットとして返す（テスト用）
	getProjectiles: () => getProjectiles().map(p => ({
		id: p.id, owner: p.owner, type: p.type,
		x: p.x, y: p.y, dx: p.dx, dy: p.dy,
		returning: p.returning ?? false,
	})),
	getState() {
		return getGameState();
	},
	// 敵のスナップショットを返す（テスト用）
	getEnemies: () => getEnemiesSnapshot(),
	// テスト用に任意の座標へ擬似敵を注入する（hp 減少で命中確認）
	// w/h を渡せば大型敵（占有セル）を注入できる（Phase 3-2）
	// type を渡せば実タイプの敵を注入できる（弱点属性 Phase 3-3）
	injectEnemy: (x, y, hp, w, h, type) => injectTestEnemy(x, y, hp, w, h, type),
	// 指定 id の敵に直接ダメージ（弱点属性 Phase 3-3 の検証用）
	dealDamage: (id, dmg, atkType) => dealDamageToEnemyById(id, dmg, atkType),
};
