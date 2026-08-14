// game/combat.js ── 剣攻撃・ダメージ・ゲームオーバー（Phase 0-2 Step 5）
// createCombat(deps) factory で生成する。
// swordAttack / dealDamageToEnemy / takeDamage を提供。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';
import { playSound, resumeAudio, stopBgm } from '../shared/sounds.js';
import { makeSprite } from '../shared/sprites.js';
import { SWORD_TIERS } from '../shared/items.js';
import {
	MOVE_STEP, DIR_DELTA, SWORD_REACH, SWORD_COOLDOWN_MS, INVINCIBLE_MS,
	ATTACK_POSE_MS,
} from './constants.js';
import { enemyW, enemyH, enemyCenter } from './hitbox.js';

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
 *   showShieldBlockEffect(x, y)  – 盾ブロックエフェクト
 *   spawnDropEffect(r, c, icon, color) – ドロップエフェクト（視覚のみ）
 *   spawnFloorDrop(r, c, type)        – フロアドロップ配置（踏んで拾う・Phase 9-5c）
 *   getStageMoves()              – player.stageMoves を返す（Phase 9-5b: lastKillMove 記録用）
 *   gameoverOverlayEl            – ゲームオーバーオーバーレイ DOM
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
		el.textContent = isWeak ? `WEAK! -${dmg}` : `-${dmg}`;
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

	// ── 弱点ヒットの閃光エフェクト ────────────────────────
	function showWeaknessBurst(e) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const { cx, cy } = enemyCenter(e);
		const el = document.createElement('div');
		el.className = 'weak-burst';
		el.style.left = `${cx * cellPx}px`;
		el.style.top  = `${cy * cellPx}px`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 500);
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
		_ss.defeatedEnemies.add(e.id);
		// Phase 9-5b: 撃破時点の stageMoves を記録してリスポーンタイマーを開始する。
		_ss.lastKillMove = getStageMoves?.() ?? 0;
		removeCharEl(`enemy-${e.id}`);
		setEnemies(getEnemies().filter(x => x !== e));
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
			const wArrow = arrowCount >= maxA ? 0 : arrowCount < maxA / 2 ? 4 : 2;
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
	function isGuardBlockingDir(e, srcX, srcY) {
		if (!e._guarding || !e._guardDir) return false;
		if (srcX == null || srcY == null) return false;
		const dx = srcX - e.x, dy = srcY - e.y;
		if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return false;
		// 攻撃者が敵から見てどちら側にいるか＝e._guardDir と同じ計算式（enemyChase の
		// 向き決定と同型）。ロックした向きと一致＝攻撃者は敵が向いている側＝正面ヒット。
		const attackerDir = Math.abs(dx) >= Math.abs(dy)
			? (dx > 0 ? 'right' : 'left')
			: (dy > 0 ? 'down' : 'up');
		return attackerDir === e._guardDir;
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
		// Phase 5.5k: ガード方向からの攻撃は無効化＋盾で跳ね返す音（既存の盾ブロックSEを共有）。
		if (isGuardBlockingDir(e, srcX, srcY)) {
			playSound('shieldBlock');
			showShieldBlockEffect(e.x, e.y);
			showDmgPopupFloat(e.x, e.y, 0, true, false);
			return;
		}
		const weakness = meta?.weakness;
		const isWeak = !!(atkType && weakness && weakness.type === atkType);
		const effective = isWeak ? Math.round(dmg * (weakness.multiplier ?? 2)) : dmg;
		const actual = Math.max(1, effective - e.def);
		// Phase 9-6: yieldAt ボスの HP は合格ラインより下へは落とさない。
		// 大ダメージ1発で 0 まで飛ぶと HP バーが空＝見た目は「倒した」になる。
		// 床を張れば「HP を残して戦いが終わった」が画面上でも読める。
		const yieldFloor = meta?.yieldAt ? Math.max(1, Math.ceil(e.maxHp * meta.yieldAt)) : null;
		e.hp = yieldFloor != null ? Math.max(yieldFloor, e.hp - actual) : e.hp - actual;
		if (isWeak) {
			playSound('key');          // 弱点ヒットは高めの「キンッ」で区別（専用SE代用）
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
	function takeDamage(amount) {
		if (getDebugMode()) return;
		if (gameNow() < getInvincibleUntil() || getIsGameover()) return;
		const player = getPlayer();
		const effectiveDef = hasCleared() ? player.def * 2 : player.def;
		const actual = Math.max(1, amount - effectiveDef);
		player.hp = Math.max(0, player.hp - actual);
		setInvincibleUntil(gameNow() + INVINCIBLE_MS);
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

		let hitEnemy = null;
		let hitDist  = Infinity;
		for (const e of enemies) {
			// Phase 5.5k k-3: 隠れ中（潜行/地中/滞空）は攻撃対象にしない＝剣は空を切る。
			// ここで外さないと「無敵の敵が剣を吸う」＝背後の茂み切り（下の return 前）や
			// 別の敵への攻撃まで潰れる（2026-08-14 ユーザー報告の同型）。
			if (e.hidden) continue;
			// 占有範囲（AABB）対応：大型敵は中心が遠く半身が広いので、
			// body の半幅ぶんだけ「届く距離」と「横の許容幅」を広げる。
			// 1×1 敵では halfFwd=halfSide=0 となり従来挙動と一致する。
			const { cx: ecx, cy: ecy } = enemyCenter(e);
			const relX = ecx - pcx;
			const relY = ecy - pcy;

			const dot = relX * ndx + relY * ndy;
			if (dot < 0) continue;

			// 攻撃方向(ndx,ndy)に沿った body 半サイズ・直交方向の body 半サイズ
			const halfW = (enemyW(e) - 1) / 2;
			const halfH = (enemyH(e) - 1) / 2;
			const halfFwd  = Math.abs(ndx) * halfW + Math.abs(ndy) * halfH;
			const halfSide = Math.abs(ndy) * halfW + Math.abs(ndx) * halfH;

			const projDist = dot;
			if (projDist - halfFwd > SWORD_REACH) continue;

			const perpX = relX - ndx * projDist;
			const perpY = relY - ndy * projDist;
			const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
			if (perpDist > 0.8 + halfSide) continue;

			if (projDist < hitDist) { hitDist = projDist; hitEnemy = e; }
		}

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
					spawnDropEffect(tr, tc, '❤', '#ff4040');
					pulse('🌿 ❤ HP+1');
				} else if (rand < 0.16) {
					player.rupees += 1;
					updateHud();
					spawnDropEffect(tr, tc, '◆', '#20c040');
					pulse('🌿 ルピー ×1');
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
		takeDamage,
		gameOver,
		showDmgPopupFloat,
		killEnemy,
	};
}
