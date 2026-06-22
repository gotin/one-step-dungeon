// game/combat.js ── 剣攻撃・ダメージ・ゲームオーバー（Phase 0-2 Step 5）
// createCombat(deps) factory で生成する。
// swordAttack / dealDamageToEnemy / takeDamage を提供。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';
import { playSound, resumeAudio, stopBgm } from '../shared/sounds.js';
import {
	MOVE_STEP, DIR_DELTA, SWORD_REACH, SWORD_COOLDOWN_MS, INVINCIBLE_MS,
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
 *   updateHud()                  – HUD 更新
 *   pulse(text, dur)             – メッセージ表示
 *   saveGame()                   – セーブ
 *   stopGameLoop()               – ゲームループ停止
 *   startGameLoop()              – ゲームループ開始
 *   onBossDefeated(boss)         – ボス撃破演出（boss.js から注入）
 *   updateBossHpBar(boss)        – ボスHPバー更新
 *   checkBossPhase(boss)         – ボスフェーズチェック
 *   openShop(shopData)           – ショップ
 *   startDialog(r, c, tile)      – ダイアログ
 *   hasCleared()                 – クリア済み判定
 *   isShieldBlockingDir(dx, dy)  – 盾ブロック判定
 *   showShieldBlockEffect(x, y)  – 盾ブロックエフェクト
 *   spawnDropEffect(r, c, icon, color) – ドロップエフェクト
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
		updateBossHpBar, checkBossPhase,
		openShop, startDialog,
		hasCleared,
		isShieldBlockingDir, showShieldBlockEffect,
		spawnDropEffect,
		gameoverOverlayEl,
	} = deps;

	// ── 剣エフェクト ────────────────────────────────────────
	function showSwordSlashFloat(fx, fy) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const heroDir  = getHeroDir();
		const cellPx   = getCellPx();
		const player   = getPlayer();
		const tierKey  = (player?.swordTier ?? -1) >= 0
			? ['wood','bronze','silver','holy'][player.swordTier] ?? ''
			: '';
		const el = document.createElement('div');
		el.className    = `sword-thrust dir-${heroDir}${tierKey ? ` tier-${tierKey}` : ''}`;
		el.style.left   = `${fx * cellPx}px`;
		el.style.top    = `${fy * cellPx}px`;
		el.style.width  = `${cellPx}px`;
		el.style.height = `${cellPx}px`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 260);
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
		getSS(getCurrentLayer(), getStageKey()).defeatedEnemies.add(e.id);
		removeCharEl(`enemy-${e.id}`);
		setEnemies(getEnemies().filter(x => x !== e));
		evaluateConditions();
		saveGame();
	}

	// ── 敵にダメージ ──────────────────────────────────────
	// atkType: 攻撃種別（'sword'|'beam'|'arrow'|'boomerang'|'bomb'）。
	//   ENEMY_META[type].weakness.type と一致すれば multiplier 倍のダメージ。
	//   省略時（undefined）は弱点判定なし＝従来挙動（後方互換）。
	function dealDamageToEnemy(e, dmg, atkType) {
		if (e.hp <= 0) return;
		const meta = ENEMY_META[e.type];
		const weakness = meta?.weakness;
		const isWeak = !!(atkType && weakness && weakness.type === atkType);
		const effective = isWeak ? Math.round(dmg * (weakness.multiplier ?? 2)) : dmg;
		const actual = Math.max(1, effective - e.def);
		e.hp -= actual;
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

		// 剣エフェクト
		const slashX = player.x + ndx * 0.7;
		const slashY = player.y + ndy * 0.7;
		showSwordSlashFloat(slashX, slashY);

		// Phase 4-5 ①：前方がスイッチ（SWITCH）なら剣でトグルする（矢と同じ作用）。
		// ボタン（BUTTON）はモーメンタリ式なので剣では反応しない＝役割分離。
		if (tile === TILE.SWITCH && deps.toggleSwitch) {
			deps.toggleSwitch(tr, tc);
			return;
		}
		// Phase 5-1：前方が色スイッチなら剣で activeColor をセット。
		if ((tile === TILE.SWITCH_RED || tile === TILE.SWITCH_BLUE) && deps.setActiveColor) {
			deps.setActiveColor(tr, tc);
			return;
		}

		// 当たり判定
		const enemies = getEnemies();
		const pcx = player.x + 0.5;
		const pcy = player.y + 0.5;

		let hitEnemy = null;
		let hitDist  = Infinity;
		for (const e of enemies) {
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
		if (hitEnemy) { dealDamageToEnemy(hitEnemy, swordAtk, 'sword'); return; }

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
		dealDamageToEnemy,
		takeDamage,
		gameOver,
		showDmgPopupFloat,
		killEnemy,
	};
}
