// game/combat.js ── 剣攻撃・ダメージ・ゲームオーバー（Phase 0-2 Step 5）
// createCombat(deps) factory で生成する。
// swordAttack / dealDamageToEnemy / takeDamage を提供。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';
import { playSound, resumeAudio, stopBgm } from '../shared/sounds.js';
import { makeSprite } from '../shared/sprites.js';
import { SWORD_TIERS, ownsItem } from '../shared/items.js';
import {
	MOVE_STEP, DIR_DELTA, SWORD_REACH, SWORD_COOLDOWN_MS, INVINCIBLE_MS,
	ATTACK_POSE_MS,
} from './constants.js';
import { enemyW, enemyH, enemyCenter } from './hitbox.js';
// Phase 8-4 (4) 0d-2.11 (A): 攻撃硬直の窓（＝反撃の窓）の判定＝enemy-ai.js の `.attack-recover`
// と共有する（enemy-state.js が単一の真実）。`weakness.window: 'recover'` の弱点で使う。
// isSoaring も同じ理由でそこから読む（0d-3 6体目 U＝浮いている絵と「矢しか届かない」を一致させる）。
import { isInRecoverWindow, isSoaring } from './enemy-state.js';

/**
 * createCombat(deps) – factory
 *
 * deps:
 *   getStageData()               – stageData
 *   getPlayer()                  – player
 *   getEnemies()                 – enemies 配列
 *   setEnemies(v)                – enemies setter
 *   getCurrentLayer()            – currentLayer
 *   getStageKey()                – stageKey
 *   getHeroDir()                 – heroDir
 *   getCharLayerEl()             – charLayerEl
 *   getIsDialog()                – isDialog
 *   getIsPaused()                – isPaused
 *   getIsGameover()              – isGameover
 *   setIsGameover(v)             – isGameover setter
 *   getInvincibleUntil()         – invincibleUntil
 *   setInvincibleUntil(v)        – setter
 *   getLastSwordTime()           – 最後に剣を使った論理時間
 *   setLastSwordTime(v)          – setter
 *   getDebugMode()               – debugMode
 *   gameNow()                    – 論理時間
 *   getCellPx()                  – セルサイズ(px)
 *   toTileRow(y) / toTileCol(x) – float → タイル座標
 *   getSS(lk, sk)                – ステージ状態取得
 *   evaluateConditions()         – 条件評価
 *   removeCharEl(id)             – キャラ要素の削除
 *   updatePlayerCharEl()         – プレイヤースプライトの再描画（攻撃ポーズ切替・Phase 5.5g3）
 *   updateHud()                  – HUD 更新
 *   pulse(text, dur)             – メッセージ表示
 *   saveGame()                   – セーブ
 *   stopGameLoop()               – ゲームループ停止
 *   startGameLoop()              – ゲームループ開始
 *   onBossDefeated(boss)         – ボス撃破演出（boss.js から注入）
 *   shouldBossYield(boss)        – yieldAt ボスが合格ラインに達したか（Phase 9-6）
 *   onBossYielded(boss)          – yieldAt ボスの戦闘終了＝合格演出（Phase 9-6）
 *   updateBossHpBar(boss)        – ボスHPバー更新
 *   checkBossPhase(boss)         – ボスフェーズチェック
 *   openShop(shopData)           – ショップ
 *   startDialog(r, c, tile)      – ダイアログ
 *   hasCleared()                 – クリア済み判定
 *   isShieldBlockingDir(dx, dy)  – 盾ブロック判定
 *   isPassable(nx, ny)           – 通行可否（Phase 5.5k k-4: 正面ブロックの弾きでプレイヤーを押す先の確認）
 *   tilePassable(r, c)           – 地形の通行可否（Phase 5.5k k-5: 分裂した小型の置き場所の選択）
 *   detachLeech(e)               – 張り付きを剥がす（同上・状態機械の持ち主は enemy-ai.js）
 *   moveCharEl(id, x, y)         – キャラ要素の位置更新（同上・弾いた後のプレイヤー再配置）
 *   showShieldBlockEffect(x, y)  – 盾ブロックエフェクト
 *   spawnDropEffect(r, c, icon, color) – ドロップエフェクト（視覚のみ）
 *   spawnFloorDrop(r, c, type)        – フロアドロップ配置（踏んで拾う・Phase 9-5c）
 *   getStageMoves()              – player.stageMoves を返す（Phase 9-5b: lastKillMove 記録用）
 *   gameoverOverlayEl            – ゲームオーバーオーバーレイ DOM
 *   isSwordSealed()              – 剣封じの窓が立っているか（Phase 5.5k k-7・game/debuff.js）
 */
export function createCombat(deps) {
	const {
		getStageData, getPlayer, getEnemies, setEnemies,
		getCurrentLayer, getStageKey,
		getHeroDir, getCharLayerEl,
		getIsDialog, getIsPaused, getIsGameover, setIsGameover,
		getInvincibleUntil, setInvincibleUntil,
		getLastSwordTime, setLastSwordTime,
		getDebugMode,
		gameNow, getCellPx,
		toTileRow, toTileCol,
		getSS,
		evaluateConditions,
		removeCharEl,
		updateHud, pulse, saveGame,
		stopGameLoop, startGameLoop,
		onBossDefeated,
		shouldBossYield, onBossYielded,
		updateBossHpBar, checkBossPhase,
		openShop, startDialog,
		hasCleared,
		isShieldBlockingDir, showShieldBlockEffect,
		spawnDropEffect,
		getStageMoves,
		gameoverOverlayEl,
		// Phase 5.5k k-7: 剣封じ（#13 呪い火）＝窓の持ち主は game/debuff.js
		isSwordSealed,
	} = deps;

	// ── 剣エフェクト（Phase 5.5g3）────────────────────────────
	// 旧実装は CSS グラデーションの光線（`.sword-thrust`）で「まっすぐのビーム」に
	// 見えていた（ユーザー指摘）。初代ゼルダと同じ2レイヤー構成に置き換える：
	//   ① プレイヤー本体＝剣を構えたポーズ（heroDAtk 等・game.js getHeroSpriteName）
	//   ② その手の先に剣そのもののスプライト（swordHeld*＝ティアパレット）
	// ※ `.sword-thrust` は敵の攻撃演出（enemy-ai.js）が今も使うので CSS は残す。
	//
	// 位置は「プレイヤーのセル左上」を原点にしたセル単位のオフセット（ox, oy）で持つ。
	// 剣の柄がポーズの手の位置に来て、刃が前方のセルへ食い込む長さになるよう向きごとに
	// 出し分ける（初代ゼルダの突きと同じ「1セル弱だけ前に出る」長さ）。
	//   幅 0.24 セル・長さ 0.84 セル＝スプライト 8×28 の比率をそのまま保つ
	// ⚠️ canvas.sprite は board.css で transform:translate(-50%,-50%) が掛かっている
	//    （`.char-abs` 配下だけ transform:none で打ち消されている）。ここは .char-abs では
	//    ないので、transform を明示的に none へ戻さないと半分ずれる。
	const SWORD_HELD_THIN = 0.24;
	const SWORD_HELD_LONG = SWORD_HELD_THIN * 28 / 8;   // = 0.84
	const L = SWORD_HELD_LONG, T = SWORD_HELD_THIN;
	// プレイヤーは左利き（初代ゼルダと同じ）＝**剣は左手・盾は右手**。
	// ∴ 下向き（正面）では剣が我々から見て「右」に、上向き（背面）では「左」に来る
	//   （盾はその反対側＝render-chars.js SHIELD_ATK_GEO と必ず対になる）。
	// zi＝z-index。上向き（背面）だけ **プレイヤーより後ろ**（-1）に置く：
	//   背面では剣は体の向こう側にある∴頭や上げた腕の上に剣が乗るのはおかしい。
	//   char-layer 内で z-index:-1＝盤面セルより上・.char-abs（z-index auto）より下
	//   （はしごオーバーレイと同じ手）。
	const SWORD_HELD_GEO = {
		//        スプライト名        ox      oy      w  h   flipX   zi
		down:  { spr: 'swordHeldDown',  ox:  0.47, oy:  0.64, w: T, h: L, flipX: false, zi: '8'  },
		// 上向きは剣を「頭の真裏」に立てる＝柄と手は頭に隠れ、刃だけが頭上に出る
		// （前へ突き出した手は奥にある∴カメラからは頭の陰＝sprites-player heroUAtk）。
		up:    { spr: 'swordHeldUp',    ox:  0.36, oy: -0.34, w: T, h: L, flipX: false, zi: '-1' },
		right: { spr: 'swordHeldRight', ox:  0.78, oy:  0.61, w: L, h: T, flipX: false, zi: '8'  },
		left:  { spr: 'swordHeldRight', ox: -0.62, oy:  0.61, w: L, h: T, flipX: true,  zi: '8'  },
	};

	// 構えている剣を「今の向き」で描き直す（既にあれば捨ててから作る）。
	// Phase 5.5g6: 寿命は setTimeout（実時間）ではなく攻撃ポーズの窓（_atkUntil・論理時間）
	// が持つ＝game.js tickAttackPose が消す。理由は2つ：
	//   ① チャージ中はポーズの窓を延長する＝剣を出しっぱなしにしたいので、実時間 180ms で
	//      勝手に消えられると絵とポーズが食い違う（窓を2つ持つと必ずずれる）。
	//   ② ポーズ中は世界が止まっていれば剣も止まる（ポーズ・ダイアログ中に消えない）。
	function drawSwordHeld() {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		clearSwordHeld();
		const heroDir = getHeroDir();
		const cellPx  = getCellPx();
		const player  = getPlayer();
		const tier    = SWORD_TIERS[player?.swordTier ?? -1];
		const geo     = SWORD_HELD_GEO[heroDir] ?? SWORD_HELD_GEO.down;

		const cv = makeSprite(geo.spr, tier?.pal ?? 'sword', false, geo.flipX);
		if (!cv) return;

		const el = document.createElement('div');
		el.className    = `sword-held dir-${heroDir}${tier ? ` tier-${tier.key}` : ''}`;
		el.dataset.tier = tier?.key ?? '';
		el.style.cssText = `position:absolute;pointer-events:none;z-index:${geo.zi ?? '8'};`
			+ `left:${Math.round((player.x + geo.ox) * cellPx)}px;`
			+ `top:${Math.round((player.y + geo.oy) * cellPx)}px;`
			+ `width:${Math.round(geo.w * cellPx)}px;height:${Math.round(geo.h * cellPx)}px;`;

		cv.style.cssText = 'position:absolute;left:0;top:0;transform:none;'
			+ 'image-rendering:pixelated;pointer-events:none;';
		cv.style.setProperty('width',  '100%', 'important');
		cv.style.setProperty('height', '100%', 'important');
		// 上位ティアだけ淡く光らせる（形は同じで格の差を出す）
		if ((player?.swordTier ?? -1) >= 2) {
			cv.style.filter = `drop-shadow(0 0 ${Math.round(cellPx * 0.12)}px ${tier.key === 'holy' ? '#fff080' : '#c0e8ff'})`;
		}
		el.appendChild(cv);
		charLayerEl.appendChild(el);
	}

	// 構えている剣を消す（攻撃ポーズの窓が切れたときに game.js から呼ぶ）
	function clearSwordHeld() {
		document.querySelectorAll('.sword-held').forEach(el => el.remove());
	}

	// 出ていなければ描く（チャージ中の「出しっぱなし」維持用。
	// 毎tick作り直すとちらつくので、無いときだけ描く）
	function ensureSwordHeld() {
		if (document.querySelector('.sword-held')) return;
		drawSwordHeld();
	}

	// ── ダメージポップアップ ──────────────────────────────
	function showDmgPopupFloat(ex, ey, dmg, isEnemy, isWeak = false) {
		const charLayerEl = getCharLayerEl();
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = `dmg-popup ${isEnemy ? 'enemy-dmg' : 'player-dmg'}${isWeak ? ' weak-dmg' : ''}`;
		// ⚠️ 弱点でも**文字は増やさない**（2026-08-26 ユーザー確定「文字は出さない」）。
		//    旧実装は `WEAK! -8` と英語で言っていた＝ゲーム中に他の英字表示は無く浮いていた。
		//    弱点の手応えは数字の大きさ・色・跳ね（.weak-dmg）と閃光・音で出す。
		el.textContent = `-${dmg}`;
		el.style.cssText = `
			position:absolute;
			left:${(ex + 0.5) * cellPx}px;
			top:${(ey - 0.3) * cellPx}px;
			transform:translateX(-50%);
			z-index:30;
		`;
		charLayerEl?.appendChild(el);
		setTimeout(() => el.remove(), 700);
	}

	// ── 弱点ヒットの閃光エフェクト（0d-2.11 で「クリティカル」らしく作り直し）──────
	// 文字を出さない代わりに**3枚重ね**で当たりの特別さを出す：
	//   ・weak-burst-star  ＝8方向へ伸びる放射刃（クリティカルの記号）
	//   ・weak-burst-flash ＝黄橙の閃光（旧 .weak-burst の見た目を引き継ぐ）
	//   ・weak-burst-ring  ＝白い衝撃波リング（一瞬で外へ抜ける）
	// ⚠️ 親（.weak-burst）は**大きさを持たない位置合わせだけの箱**にする＝親を拡大すると
	//    子の拡大率まで掛け算になり、3枚が同じ動きに潰れる。子ごとに別の keyframes を当てる。
	// ⚠️ 消すのは親1つだけ（子ごとに setTimeout を張ると消し漏れが出る）。
	function showWeaknessBurst(e) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const { cx, cy } = enemyCenter(e);
		const el = document.createElement('div');
		el.className = 'weak-burst';
		el.style.left = `${cx * cellPx}px`;
		el.style.top  = `${cy * cellPx}px`;
		// ⚠️ 大きさは**敵の見た目に合わせて決める**（固定 px にすると 2×2 のボスの上では
		//    胴体の中に埋まって「小さな火花」に見える＝0d-2.11 の目視で確認）。
		el.style.setProperty('--weak-size',
			`${cellPx * Math.max(e.w ?? 1, e.h ?? 1) * 0.9}px`);
		// DOM の順＝重なりの順（後が上）。刃 → 閃光 → リング。
		for (const cls of ['weak-burst-star', 'weak-burst-flash', 'weak-burst-ring']) {
			const part = document.createElement('div');
			part.className = cls;
			el.appendChild(part);
		}
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 500);
	}

	// ── Phase 5.5k k-5: 撃破の記録（分裂で生まれた小型の扱い）──────────────
	// 通常の敵の id はタイル座標（`"r,c"`）＝`ss.defeatedEnemies` に入れれば
	// buildEnemies が次回その座標に敵を作らない（＝倒したまま）。分裂で生まれた小型は
	// タイルに存在しない∴自分の id を記録しても意味がなく、親の posKey を
	// `_splitFrom` として引き継いでいる。
	// ∴小型は「兄弟が1体も残っていないときだけ親の posKey を記録する」。
	// 片方に寄せると必ず壊れる：
	//   ・分裂の瞬間に親の posKey を記録する → 1回殴って部屋を出て戻れば敵が消える
	//   ・何も記録しない → 小型を全部倒した部屋へ戻ると親が丸ごと復活する
	function recordDefeated(ss, e) {
		if (e._splitFrom == null) { ss.defeatedEnemies.add(e.id); return; }
		// ⚠️ ここは setEnemies より前に呼ばれる＝自分もまだ配列に居るので除外して数える
		const siblings = getEnemies().filter(x => x !== e && x._splitFrom === e._splitFrom);
		if (siblings.length === 0) ss.defeatedEnemies.add(e._splitFrom);
	}

	// ── Phase 5.5k k-5: 吸われたルピーの払い戻し（ルピー喰い）───────────────
	// 「倒すと一部戻る」＝倒す動機（PLAN 名簿 #11「倒す優先度を強制する」）。
	// ⚠️ 部屋を出ると敵は作り直される＝吸われたまま消える（＝逃げると取り戻せない）。
	function refundLeech(e, meta) {
		const stolen = e._stolenRupees ?? 0;
		if (!meta?.leech || stolen <= 0) return;
		const back = Math.floor(stolen * (meta.leech.refund ?? 0.5));
		if (back <= 0) return;
		const player = getPlayer();
		player.rupees = (player.rupees ?? 0) + back;
		updateHud();
		playSound('rupee');
		pulse(`{{rupee}} ルピー ×${back} を取り戻した！`, 1200);
	}

	// ── 敵を倒す ──────────────────────────────────────────
	function killEnemy(e) {
		const meta = ENEMY_META[e.type];
		if (meta?.isBoss) {
			onBossDefeated(e);
			return;
		}
		playSound('enemyDie');
		const _ss = getSS(getCurrentLayer(), getStageKey());
		recordDefeated(_ss, e);
		// Phase 9-5b: 撃破時点の stageMoves を記録してリスポーンタイマーを開始する。
		_ss.lastKillMove = getStageMoves?.() ?? 0;
		removeCharEl(`enemy-${e.id}`);
		setEnemies(getEnemies().filter(x => x !== e));
		refundLeech(e, meta);
		evaluateConditions();
		// ── 雑魚ドロップ（矢/爆弾/ハート/ルピー）────────────────
		if (Math.random() < 0.35) {
			const player = getPlayer();
			const maxB = player.maxBombs ?? 8;
			const maxA = player.maxArrows ?? 8;
			const bombCount  = player.subItems?.bomb?.count ?? 0;
			const arrowCount = player.subItems?.bow?.count  ?? 0;
			// 所持数に応じた重み（満タンなら0）
			const wBomb  = bombCount  >= maxB ? 0 : bombCount  < maxB / 2 ? 4 : 2;
			// 実行キュー19: 弓を手にしていない間は矢を落とさせない（矢の残弾は
			// `subItems.bow` に載る∴弓入手前に渡すと弓が撃てるようになる）。爆弾は
			// 単体で使える道具∴この関門は要らない（弾＝能力）。
			const wArrow = !ownsItem(player, 'bow') ? 0
				: arrowCount >= maxA ? 0 : arrowCount < maxA / 2 ? 4 : 2;
			const wHeart  = 2;
			const wRupee  = 2;
			const total = wBomb + wArrow + wHeart + wRupee;
			let r = Math.random() * total;
			const dr = Math.round(toTileRow(e.y));
			const dc = Math.round(toTileCol(e.x));
			let dropType = null;
			if ((r -= wBomb) < 0)        dropType = 'bomb';
			else if ((r -= wArrow) < 0)  dropType = 'arrow';
			else if ((r -= wHeart) < 0)  dropType = 'heart';
			else                         dropType = 'rupee';
			deps.spawnFloorDrop?.(dr, dc, dropType);
		}
		saveGame();
	}

	// ── 敵にダメージ ──────────────────────────────────────
	// atkType: 攻撃種別（'sword'|'beam'|'arrow'|'boomerang'|'bomb'）。
	//   ENEMY_META[type].weakness.type と一致すれば multiplier 倍のダメージ。
	//   省略時（undefined）は弱点判定なし＝従来挙動（後方互換）。
	// Phase 5.5k: 陸上敵のガード（DECISIONS 2026-08-10・実効化）。
	// e._guarding の間、e._guardDir（プレイヤー方向へロック済み）と一致する方向からの
	// 攻撃だけを無効化する（盾ブロックと同じ判定形＝dx/dyの主軸をカーディナル4方向に潰して比較）。
	// 側面・背後・無方向（爆発等・srcX/srcY省略）は素通り＝回り込みが意味を持つ。
	// 攻撃者が敵から見てどちら側にいるか（カーディナル4方向）。tickGuard / tickFaceLock の
	// 向き決定と同じ計算式＝「向き」と「入射方向」を同じ土俵で比べられる。
	// 判定できない（発生源が無い＝爆風などの無方向 / 完全に重なっている）ときは null。
	function attackerDirFrom(e, srcX, srcY) {
		if (srcX == null || srcY == null) return null;
		const dx = srcX - e.x, dy = srcY - e.y;
		if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return null;
		return Math.abs(dx) >= Math.abs(dy)
			? (dx > 0 ? 'right' : 'left')
			: (dy > 0 ? 'down' : 'up');
	}

	function isGuardBlockingDir(e, srcX, srcY) {
		if (!e._guarding || !e._guardDir) return false;
		// ロックした向きと一致＝攻撃者は敵が向いている側＝正面ヒット。
		return attackerDirFrom(e, srcX, srcY) === e._guardDir;
	}

	// Phase 5.5k k-4: 向き固定の常時ブロック（盾騎士）。
	// tickGuard の一時的なガード（攻撃クールダウン中だけ構える）と違い、**meta.blockFacing を
	// 持つ敵は常に正面をブロックしている**＝崩す手段は側面/背後へ回り込むことだけ。
	// 向きは enemy-ai.js tickFaceLock が turnMs ごとにだけ更新する（毎tick向き直らない）。
	function isBlockFacingDir(e, meta, srcX, srcY) {
		if (!meta?.blockFacing) return false;
		const dir = e._blockDir ?? e.dir;
		if (!dir) return false;
		return attackerDirFrom(e, srcX, srcY) === dir;
	}

	// Phase 5.5k k-4: 甲羅に籠もっている間は全ダメージ無効（火吐き亀）。
	// **方向も攻撃種別も問わない**＝開くのを待つしかない（時間で開閉する窓）。
	// 隠れ（e.hidden）と違って姿は消えない＝攻撃対象にはなる＝0ダメージの弾きが返る
	// ＝プレイヤーは手応えで「今は無駄」と分かる（無音で返す hidden とは意図的に別扱い）。
	function isShellClosed(e, meta) {
		return !!(meta?.shell && e._shellClosed);
	}

	// Phase 8-4 (4) 0d-3（6体目 U 嵐の鷲王）: 空に居るあいだは**届く攻撃が1つだけ**になる。
	// 甲羅（時間で開くのを待つ）と違い、こちらは**手段が答え**＝弓で射抜く（`soar.reachedBy`）。
	//   ・窓の判定は enemy-state.js `isSoaring` が単一の真実＝浮いている絵（`.soaring`）と一致
	//   ・届く種別はデータが持つ（δ 分裂スライムの `split.blockedBy` と同じ作法）＝
	//     「弱点＝矢」と「空へ届くのは矢」が meta の同じブロックで読める
	//   ・隠れ（`e.hidden`）とは別扱い＝姿は見えている∴無音で返さず 0 ダメージを返す
	//     （空振りの音＝「今は無駄・弓を出せ」がプレイヤーへ伝わる。甲羅と同じ考え）
	function isSoarOutOfReach(e, meta, atkType) {
		if (!isSoaring(e, meta)) return false;
		return atkType !== (meta.soar.reachedBy ?? 'arrow');
	}

	// Phase 5.5k k-4: 正面ブロックの跳ね返し＝**プレイヤーを1歩下がらせる**。
	// ダメージは 0 のまま（弾かれるだけ）だが、剣の間合いから押し出される＝もう一度
	// 正面から殴っても同じことになる、と体で分かる。
	//   ・押す向き＝敵→プレイヤーのカーディナル1方向（入射方向の裏返し）
	//   ・通れないマス（壁/水/敵）へは押し込まない＝壁際で詰まっても安全
	//   ・剣（近接）でブロックされたときだけ弾く＝遠くから撃った矢で自分が下がるのは変
	function knockbackPlayerFrom(e, meta, atkType) {
		const cells = meta?.blockFacing?.knockback ?? 0;
		if (!cells || atkType !== 'sword') return;
		const player = getPlayer();
		const dx = player.x - e.x, dy = player.y - e.y;
		if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
		const [ux, uy] = Math.abs(dx) >= Math.abs(dy)
			? [Math.sign(dx), 0]
			: [0, Math.sign(dy)];
		const steps = Math.max(1, Math.round(cells / MOVE_STEP));
		let moved = false;
		for (let k = 0; k < steps; k++) {
			const nx = player.x + ux * MOVE_STEP;
			const ny = player.y + uy * MOVE_STEP;
			if (!deps.isPassable?.(nx, ny)) break;
			player.x = nx; player.y = ny; moved = true;
		}
		if (moved) deps.moveCharEl?.('player', player.x, player.y);
	}

	// ── Phase 5.5k k-5: 被弾トリガー（殴った結果が「HP が減る」だけで終わらない敵）──
	// 分裂スライム（#3）とルピー喰い（#11）は、被弾そのものが機構の引き金になる。
	// ダメージ計算の漏斗（dealDamageToEnemy）には**フック点を1つだけ**作る
	// ＝新しい「被弾で起きること」を足す場所を1か所に固定する（PLAN 5.5k k-5）。
	//   戻り値 true … この被弾は killEnemy へ流さない（分裂＝倒れる代わりに分かれた）
	function onEnemyDamaged(e, meta, atkType) {
		// ルピー喰い：殴られると張り付きが剥がれる＝吸われ続けない（反撃が効く）。
		// 生きていても倒れていても剥がす（倒れた場合は払い戻しが killEnemy 側で走る）。
		if (meta?.leech && e._attached) deps.detachLeech?.(e);
		// U 嵐の鷲王：滞空中に矢が刺さると**墜落する**（＝弱点が倍率だけでなく機構の解除鍵）。
		// ここに置く理由＝弱点の倍率を引いた**後**（∴矢の弱点判定と二重にならない）で、かつ
		// 倒れていないときだけ（`hp > 0`）＝倒した敵を墜落させて気絶を残さない。
		// 届いた矢だけがここに来る（上の `isSoarOutOfReach` が矢以外を先に弾いている）。
		if (meta?.soar && e.hp > 0) deps.crashSoar?.(e, meta);
		// 分裂スライム：HP が尽きた瞬間だけが引き金。
		if (e.hp <= 0 && meta?.split) return trySplitEnemy(e, meta, atkType);
		return false;
	}

	// 小型の置き場所を「親のセル → 上下左右 → 斜め」の順に count 個選ぶ。
	// 除外＝地形が通れないセル／他の敵が占有しているセル／プレイヤーのセル
	// （プレイヤーのセルへ湧かせると isPassable の重なり防止でプレイヤーが動けなくなる）。
	function pickSplitCells(e, count) {
		const player = getPlayer();
		const pr = toTileRow(e.y), pc = toTileCol(e.x);
		const plr = toTileRow(player.y), plc = toTileCol(player.x);
		const others = getEnemies().filter(x => x !== e);
		const OFF = [[0,0],[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
		const out = [];
		for (const [dr, dc] of OFF) {
			if (out.length >= count) break;
			const r = pr + dr, c = pc + dc;
			if (!deps.tilePassable?.(r, c)) continue;
			if (r === plr && c === plc) continue;
			const taken = others.some(x => {
				const ec = toTileCol(x.x), er = toTileRow(x.y);
				return c >= ec && c < ec + (x.w ?? 1) && r >= er && r < er + (x.h ?? 1);
			});
			if (taken) continue;
			out.push({ r, c });
		}
		return out;
	}

	// 倒れる代わりに小型 count 体へ分かれる。分裂できたときだけ true。
	function trySplitEnemy(e, meta, atkType) {
		const cfg = meta.split;
		// 弱点（爆弾）で潰したときは分裂しない＝弱点は「倍率」だけでなく**機構の解除鍵**
		// （PLAN 名簿 #3「爆弾なら分裂させずに潰せる」）。
		if (cfg.blockedBy && atkType === cfg.blockedBy) return false;
		// 小型はもう分裂しない（無限増殖の防止・名簿「小型は分裂しない」）。
		if (e._splitFrom != null) return false;
		const cells = pickSplitCells(e, cfg.count ?? 2);
		if (cells.length === 0) return false;   // 置き場所が無い＝素直に倒れる
		const childHp = cfg.childHp ?? 2;
		const rest = getEnemies().filter(x => x !== e);
		const children = cells.map((cell, i) => ({
			// 親のタイル座標を含む id（`"3,4#s1"`）＝posKey とは絶対に衝突しない。
			// DOM の id は `char-enemy-<id>` で getElementById 参照のみ＝`#` を含んでも安全。
			id:    `${e.id}#s${i + 1}`,
			type:  e.type,
			x:     cell.c, y: cell.r,
			hp:    childHp, maxHp: childHp,
			atk:   cfg.childAtk ?? e.atk, def: cfg.childDef ?? 0,
			speed: e.speed, move: e.move, moveSpeed: e.moveSpeed,
			hidden: false,
			sprite: cfg.childSprite ?? e.sprite, pal: e.pal,
			w: 1, h: 1,
			accum: 0,
			dir:   e.dir,
			el:    null,
			_splitFrom: e.id,
		}));
		setEnemies([...rest, ...children]);
		// 動的に湧いた敵の DOM は renderChars（char-layer を作り直す）でしか生えない。
		deps.renderChars();
		playSound('appear');
		pulse('分裂した！', 900);
		return true;
	}

	function dealDamageToEnemy(e, dmg, atkType, srcX, srcY) {
		if (e.hp <= 0) return;
		const meta = ENEMY_META[e.type];
		// Phase 9-6 深洋O: 合格済みの yieldAt ボス（海の主）はもう傷つかない。
		// onBossYielded は async（await sleep を挟む）∴演出中も攻撃は届き続ける。
		// _yielded で弾かないと「合格 → 追撃で HP0 → killEnemy」＝倒せてしまう。
		if (e._yielded) {
			showDmgPopupFloat(e.x, e.y, 0, true, false);
			return;
		}
		// 隠れ中（潜行＝水中／地中＝土の下／滞空＝跳躍の最中）は全ての攻撃が無効。
		// 出た瞬間だけ殴れる＝リズム戦闘。
		// Phase 9-6 の submerge（水棲専用）を 5.5k k-3 で陸/空へ一般化したもの。
		// ⚠ ここは「最後の安全網」＝呼び出し側（剣の対象選定・投擲物の当たり判定・
		// 爆風・かがり火の炎）が隠れ中の敵を対象から外すのが本線。**無音で返す**＝
		// 「-0」ポップアップを出すと当たっていないのに当たったように見える
		// （2026-08-14 ユーザー報告「地中にいる間にブーメランを投げると当たる」の一因）。
		if (e.hidden) return;
		// meleeOnly: only sword and fire damage goes through; everything else is nullified.
		if (meta?.meleeOnly && atkType && atkType !== 'sword' && atkType !== 'fire') {
			showDmgPopupFloat(e.x, e.y, 0, true, false);
			return;
		}
		// Phase 5.5k k-4: 甲羅に籠もっている間は方向も種別も問わず全ダメージ無効（火吐き亀）。
		// 向き依存の判定より先に見る＝籠もり中は「どこから殴っても」弾かれる。
		if (isShellClosed(e, meta)) {
			playSound('shieldBlock');
			showShieldBlockEffect(e.x, e.y);
			showDmgPopupFloat(e.x, e.y, 0, true, false);
			return;
		}
		// Phase 8-4 (4) 0d-3（6体目 U）: 滞空中は矢以外が届かない（甲羅の次＝向き依存の判定より
		// 前に見る＝「どこから殴っても」届かない。答えは回り込みではなく**弓**）。
		if (isSoarOutOfReach(e, meta, atkType)) {
			playSound('soarWhiff');
			showDmgPopupFloat(e.x, e.y, 0, true, false);
			return;
		}
		// Phase 5.5k: ガード方向からの攻撃は無効化＋盾で跳ね返す音（既存の盾ブロックSEを共有）。
		if (isGuardBlockingDir(e, srcX, srcY)) {
			playSound('shieldBlock');
			showShieldBlockEffect(e.x, e.y);
			showDmgPopupFloat(e.x, e.y, 0, true, false);
			return;
		}
		// Phase 5.5k k-4: 向き固定の常時ブロック（盾騎士）＝正面からは 0 ダメージ＋弾き返す。
		if (isBlockFacingDir(e, meta, srcX, srcY)) {
			playSound('shieldBlock');
			showShieldBlockEffect(e.x, e.y);
			showDmgPopupFloat(e.x, e.y, 0, true, false);
			knockbackPlayerFrom(e, meta, atkType);
			return;
		}
		const weakness = meta?.weakness;
		// Phase 8-4 (4) 0d-2.11 (A): 弱点に「窓」を持たせられる（`weakness.window`）。
		// `'recover'`＝攻撃硬直の間だけ弱点が乗る＝道具ではなく**タイミング**が答えになる弱点。
		// これで D1（サブアイテムが1つも無い地点）のボスにも成立する弱点が置ける
		// （G 岩のゴーレムの旧・爆弾弱点は爆弾が D6 の報酬＝D1 では永久に使えなかった）。
		// 窓の判定は enemy-state.js が単一の真実＝`.attack-recover`（沈む絵）と必ず一致する。
		const windowOpen = weakness?.window !== 'recover' || isInRecoverWindow(e, gameNow());
		const isWeak = !!(atkType && weakness && weakness.type === atkType && windowOpen);
		const effective = isWeak ? Math.round(dmg * (weakness.multiplier ?? 2)) : dmg;
		const actual = Math.max(1, effective - e.def);
		// Phase 9-6: yieldAt ボスの HP は合格ラインより下へは落とさない。
		// 大ダメージ1発で 0 まで飛ぶと HP バーが空＝見た目は「倒した」になる。
		// 床を張れば「HP を残して戦いが終わった」が画面上でも読める。
		const yieldFloor = meta?.yieldAt ? Math.max(1, Math.ceil(e.maxHp * meta.yieldAt)) : null;
		e.hp = yieldFloor != null ? Math.max(yieldFloor, e.hp - actual) : e.hp - actual;
		if (isWeak) {
			playSound('weakHit');      // 弱点専用SE（0d-2.11。以前は鍵の音 'key' の流用だった）
			showWeaknessBurst(e);
		} else {
			playSound('hit');
		}
		showDmgPopupFloat(e.x, e.y, actual, true, isWeak);
		if (meta?.isBoss) {
			updateBossHpBar(e);
			checkBossPhase(e);
			// Phase 9-6: yieldAt を持つボス（海の主）は HP0 を待たず、閾値以下で
			// 戦闘終了＝合格に分岐する。撃破（killEnemy → 爆発 → 欠片）には流さない。
			if (shouldBossYield?.(e)) { onBossYielded?.(e); return; }
		}
		// Phase 5.5k k-5: 被弾トリガーのフック点（分裂・張り付きの剥がれ）。
		// killEnemy の直前＝「HP を引いた後」に置く∴分裂は HP0 を見て判断できる。
		if (onEnemyDamaged(e, meta, atkType)) return;
		if (e.hp <= 0) killEnemy(e);
	}

	// ── プレイヤー点滅 ────────────────────────────────────
	function showPlayerBlink() {
		let blinkTimer = null;
		if (blinkTimer) clearInterval(blinkTimer);
		let cnt = 0;
		blinkTimer = setInterval(() => {
			const el = document.getElementById('char-player');
			if (el) el.style.opacity = (cnt % 2 === 0) ? '0.2' : '1';
			cnt++;
			if (cnt >= 10) {
				clearInterval(blinkTimer); blinkTimer = null;
				const el2 = document.getElementById('char-player');
				if (el2) el2.style.opacity = '1';
			}
		}, 150);
	}

	// ── ゲームオーバー ───────────────────────────────────
	function gameOver() {
		setIsGameover(true); stopGameLoop(); stopBgm(); playSound('gameover');
		gameoverOverlayEl.classList.remove('hidden');
	}

	// ── プレイヤーダメージ ────────────────────────────────
	// **プレイヤーが HP を失う唯一の入口**（体当たり・投擲物・炎・毒はすべてここを通る）。
	// Phase 5.5k k-7: 毒（DoT）のために無敵窓の扱いを呼び出し側から変えられるようにした。
	//   opts.ignoreInvincible … 無敵窓中でも通す（毒は無敵で止まらない）
	//   opts.noInvincible     … このダメージでは無敵窓を張らない（毒を盾にできない）
	// 既定（opts なし）は従来どおり＝無敵中は無効・当たれば INVINCIBLE_MS の無敵を張る
	// ∴既存の呼び出しは1行も変わらない。理由の詳細は game/debuff.js の冒頭。
	function takeDamage(amount, opts = {}) {
		if (getDebugMode()) return;
		if (getIsGameover()) return;
		if (!opts.ignoreInvincible && gameNow() < getInvincibleUntil()) return;
		const player = getPlayer();
		const effectiveDef = hasCleared() ? player.def * 2 : player.def;
		const actual = Math.max(1, amount - effectiveDef);
		player.hp = Math.max(0, player.hp - actual);
		if (!opts.noInvincible) setInvincibleUntil(gameNow() + INVINCIBLE_MS);
		playSound('playerHit');
		showPlayerBlink();
		updateHud();
		if (player.hp <= 0) gameOver();
	}

	// ── 剣攻撃 ───────────────────────────────────────────
	function swordAttack() {
		if (getIsDialog() || getIsPaused() || getIsGameover()) return;

		const player    = getPlayer();
		const stageData = getStageData();
		const heroDir   = getHeroDir();
		const [dy, dx]  = DIR_DELTA[heroDir];
		const ndx = dx / MOVE_STEP;
		const ndy = dy / MOVE_STEP;

		// NPC・ギミックとのインタラクション（剣なしでも可能）
		const tr = toTileRow(player.y + ndy);
		const tc = toTileCol(player.x + ndx);
		const tile = stageData.tiles[tr]?.[tc];
		const posKey3 = `${tr},${tc}`;

		if (tile === TILE.NPC_SHOP) {
			const shopData = stageData.shopData?.[posKey3];
			if (shopData) { openShop(shopData, posKey3); } else { startDialog(tr, tc, tile); }
			return;
		}
		if (tile && NPC_SPRITE_MAP[tile]) { startDialog(tr, tc, tile); return; }

		// 看板を読む
		if (tile === TILE.SIGN) {
			const signData = stageData.signData?.[posKey3] ?? stageData.npcData?.[posKey3] ?? { name: '看板', lines: ['（何も書かれていない）'] };
			deps.openSignDialog(signData);
			return;
		}

		// 以降は剣が必要な操作
		if (!player.weapon) { pulse('剣を持っていない！'); return; }

		// Phase 5.5k k-7: 剣封じ（#13 呪い火）。**この位置に置くのが要点**＝上の
		// NPC/店/看板の分岐より後・剣を振る処理より前。封じられている間も人と話し
		// 看板は読める（会話が止まると詰みかねない）が、剣だけが振れない。
		// サブアイテム（弓/爆弾/ブーメラン）は input.js の別経路∴封じの対象外
		// ＝PLAN 5.5k 名簿 #13「妨害特化＝弓/爆弾で処理」。
		if (isSwordSealed?.()) { pulse('剣が封じられている！'); return; }

		// クールダウンチェック
		const now = gameNow();
		if (now - getLastSwordTime() < SWORD_COOLDOWN_MS) return;
		setLastSwordTime(now);
		resumeAudio(); playSound('slash');

		// 剣エフェクト＝①構えのポーズ（本体スプライト差し替え）②剣スプライト
		// ポーズは論理時間で切れる（game.js gameTick の tickAttackPose が戻す）
		// ＝step() の手動 tick でも実時間ループでも同じ挙動になる。
		player._atkUntil = now + ATTACK_POSE_MS;
		deps.updatePlayerCharEl?.();
		drawSwordHeld();

		// Phase 4-5 ①／5-1：スイッチ判定は「0.5 だけ重なった手前セル」も対象にする。
		// tr/tc（前方1マス固定オフセット）は、プレイヤーが半セルだけそのセルへ入り込んだ
		// 状態だと本来のセルを1マス飛び越えてしまう（狭い通路では1歩離れて向きだけ変える
		// 動きができず、0.5セル重なった位置から叩くしかないケースが実在する＝ユーザー報告）。
		// 手前（0.5 先＝プレイヤーに近い側）を先に見て、無ければ従来の tr/tc（1マス先）を見る
		// ＝両方がスイッチのときは近い方を優先する（ユーザー指定の優先順）。
		const isSwitchTile = (t) => t === TILE.SWITCH || t === TILE.SWITCH_RED || t === TILE.SWITCH_BLUE;
		const nearR = toTileRow(player.y + ndy * 0.5);
		const nearC = toTileCol(player.x + ndx * 0.5);
		const nearTile = stageData.tiles[nearR]?.[nearC];
		const [swR, swC, swTile] = isSwitchTile(nearTile) ? [nearR, nearC, nearTile] : [tr, tc, tile];
		if (swTile === TILE.SWITCH && deps.toggleSwitch) {
			deps.toggleSwitch(swR, swC);
			return;
		}
		if ((swTile === TILE.SWITCH_RED || swTile === TILE.SWITCH_BLUE) && deps.setActiveColor) {
			deps.setActiveColor(swR, swC);
			return;
		}

		// 当たり判定
		const enemies = getEnemies();
		const pcx = player.x + 0.5;
		const pcy = player.y + 0.5;

		// 剣が届いているか（＝この1か所だけが「剣の当たり判定」の持ち主）。
		// 戻り値＝振った向きに沿った距離（近い方が優先される）／届かないなら null。
		// 占有範囲（AABB）対応：大型敵は中心が遠く半身が広いので、
		// body の半幅ぶんだけ「届く距離」と「横の許容幅」を広げる。
		// 1×1 敵では halfFwd=halfSide=0 となり従来挙動と一致する。
		// ⚠️ Phase 8-4 (4) 0d-3（12体目 Z）: **幻影（`mirage`）にも同じ関数を通す**ために
		//    切り出した＝像は敵ではない（`getEnemies()` に居ない）が、剣の間合いだけは
		//    本体と1文字も違ってはいけない（違うと「像だけ届かない位置」が生まれて
		//    見分けられる＝機構が死ぬ）。判定を2つ書かないための切り出し。
		const reachOf = (t) => {
			const { cx: ecx, cy: ecy } = enemyCenter(t);
			const relX = ecx - pcx;
			const relY = ecy - pcy;

			const dot = relX * ndx + relY * ndy;
			if (dot < 0) return null;

			// 攻撃方向(ndx,ndy)に沿った body 半サイズ・直交方向の body 半サイズ
			const halfW = (enemyW(t) - 1) / 2;
			const halfH = (enemyH(t) - 1) / 2;
			const halfFwd  = Math.abs(ndx) * halfW + Math.abs(ndy) * halfH;
			const halfSide = Math.abs(ndy) * halfW + Math.abs(ndx) * halfH;

			const projDist = dot;
			if (projDist - halfFwd > SWORD_REACH) return null;

			const perpX = relX - ndx * projDist;
			const perpY = relY - ndy * projDist;
			const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
			if (perpDist > 0.8 + halfSide) return null;

			return projDist;
		};

		let hitEnemy = null;
		let hitDist  = Infinity;
		for (const e of enemies) {
			// Phase 5.5k k-3: 隠れ中（潜行/地中/滞空）は攻撃対象にしない＝剣は空を切る。
			// ここで外さないと「無敵の敵が剣を吸う」＝背後の茂み切り（下の return 前）や
			// 別の敵への攻撃まで潰れる（2026-08-14 ユーザー報告の同型）。
			if (e.hidden) continue;
			const d = reachOf(e);
			if (d != null && d < hitDist) { hitDist = d; hitEnemy = e; }
		}

		// Phase 8-4 (4) 0d-3（12体目 Z）: 幻影＝**HP を持たない置き物**∴剣の一撃で消える
		// （ダメージの計算も無敵窓も通らない）。同じ距離なら**本物が勝つ**（`<` で比較＝
		// 重なって見えるときに剣が像に吸われて本体を殴れない、を作らない）。
		let hitMirage = null;
		for (const m of (deps.getMirages?.() ?? [])) {
			const d = reachOf(m);
			if (d != null && d < hitDist) { hitDist = d; hitMirage = m; hitEnemy = null; }
		}
		if (hitMirage) { deps.destroyMirage?.(hitMirage.id); return; }

		// 二周目は攻撃力2倍
		const swordAtk = hasCleared() ? player.atk * 2 : player.atk;
		if (hitEnemy) { dealDamageToEnemy(hitEnemy, swordAtk, 'sword', player.x, player.y); return; }

		// 茂みを切る
		if (tile === TILE.BUSH) {
			const ss = getSS(getCurrentLayer(), getStageKey());
			if (!ss.cutBushes) ss.cutBushes = new Set();
			if (!ss.cutBushes.has(posKey3)) {
				ss.cutBushes.add(posKey3);
				playSound('slash');
				const rand = Math.random();
				if (rand < 0.12) {
					player.hp = Math.min(player.maxHp, player.hp + 1);
					updateHud();
					spawnDropEffect(tr, tc, 'heart', '#ff4040', '❤');
					pulse('{{bush}} {{heart}} HP+1');
				} else if (rand < 0.16) {
					player.rupees += 1;
					updateHud();
					spawnDropEffect(tr, tc, 'rupee', '#20c040', '◆');
					pulse('{{bush}} ルピー ×1');
				}
				deps.renderBoard(); deps.renderChars(); saveGame();
			}
			return;
		}
	}

	return {
		swordAttack,
		drawSwordHeld,
		clearSwordHeld,
		ensureSwordHeld,
		dealDamageToEnemy,
		isBlockFacingDir,   // Phase 5.5k k-4: 向き固定の常時ブロック（テスト用）
		isShellClosed,      // Phase 5.5k k-4: 甲羅の籠もり（テスト用）
		isSoarOutOfReach,   // Phase 8-4 (4) 0d-3: 滞空中は矢以外が届かない（テスト用）
		onEnemyDamaged,     // Phase 5.5k k-5: 被弾トリガーのフック点（テスト用）
		trySplitEnemy,      // Phase 5.5k k-5: 分裂（テスト用）
		pickSplitCells,     // Phase 5.5k k-5: 小型の置き場所の選択（テスト用）
		takeDamage,
		gameOver,
		showDmgPopupFloat,
		killEnemy,
	};
}
