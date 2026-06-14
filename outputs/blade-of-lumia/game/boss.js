// game/boss.js ── ボス戦・エンディング（Phase 0-2 Step 5）
// createBoss(deps) factory で生成する。
// onBossDefeated / startBossBattle / startEnding を提供。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { makeSprite } from '../shared/sprites.js';
import { playSound, playBgm, stopBgm } from '../shared/sounds.js';
import { SAVE_KEY, CLEARED_KEY } from './constants.js';

/**
 * createBoss(deps) – factory
 *
 * deps:
 *   getStageData()               – stageData
 *   getPlayer()                  – player
 *   getEnemies()                 – enemies 配列
 *   setEnemies(v)                – enemies setter
 *   getMapData()                 – mapData
 *   getCurrentLayer()            – currentLayer
 *   getStageKey()                – stageKey
 *   getCharLayerEl()             – charLayerEl
 *   getBossRoomLocked()          – bossRoomLocked
 *   setBossRoomLocked(v)         – setter
 *   getBossDefeating()           – _bossDefeating フラグ
 *   setBossDefeating(v)          – setter
 *   getPendingTriforcePieceEl()  – _pendingTriforcePieceEl
 *   setPendingTriforcePieceEl(v) – setter
 *   getCellPx()                  – セルサイズ(px)
 *   toTileRow(y) / toTileCol(x) – float → タイル座標
 *   getSS(lk, sk)                – ステージ状態取得
 *   evaluateConditions()         – 条件評価
 *   lockBossDoors()              – ボス扉を閉じる
 *   unlockBossDoors()            – ボス扉を開ける
 *   showBossRoomLockEffect()     – ロックエフェクト
 *   renderBoard()                – ボード再描画
 *   renderChars()                – キャラ再描画
 *   updateHud()                  – HUD 更新
 *   pulse(text, dur)             – メッセージ表示
 *   saveGame()                   – セーブ
 *   stopGameLoop()               – ゲームループ停止
 *   startGameLoop()              – ゲームループ開始
 *   showExplosionEffect(r, c)    – 爆発エフェクト（projectile.js から注入）
 *   bossHpbarEl / bossNameEl / bossHpFillEl – DOM 要素
 *   endingOverlayEl              – エンディングオーバーレイ DOM
 *   hasCleared() / saveCleared() – クリア済み判定・保存
 */
export function createBoss(deps) {
	const {
		getStageData, getPlayer, getEnemies, setEnemies,
		getMapData, getCurrentLayer, getStageKey,
		getCharLayerEl,
		getBossRoomLocked, setBossRoomLocked,
		getBossDefeating, setBossDefeating,
		getPendingTriforcePieceEl, setPendingTriforcePieceEl,
		getCellPx, toTileRow, toTileCol,
		getSS,
		evaluateConditions,
		lockBossDoors, unlockBossDoors,
		renderBoard, renderChars, updateHud,
		pulse, saveGame,
		stopGameLoop, startGameLoop,
		showExplosionEffect,
		bossHpbarEl, bossNameEl, bossHpFillEl,
		endingOverlayEl,
		hasCleared, saveCleared,
	} = deps;

	// ── ユーティリティ ─────────────────────────────────────
	function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

	// ── ボス HP バー ───────────────────────────────────────
	function showBossHpBar(boss) {
		bossHpbarEl.classList.remove('hidden');
		bossNameEl.textContent = ENEMY_META[boss.type]?.name ?? 'ボス';
		updateBossHpBar(boss);
	}

	function updateBossHpBar(boss) {
		const pct = Math.max(0, boss.hp / boss.maxHp * 100);
		bossHpFillEl.style.width = `${pct}%`;
		if (pct < 25) bossHpFillEl.style.background = 'linear-gradient(90deg,#880000,#cc0000)';
		else if (pct < 50) bossHpFillEl.style.background = 'linear-gradient(90deg,#aa2000,#ee4010)';
		else bossHpFillEl.style.background = 'linear-gradient(90deg,#cc2020,#ff5050)';
	}

	function hideBossHpBar() {
		bossHpbarEl.classList.add('hidden');
	}

	// ── ボス多段フェーズ ───────────────────────────────────
	function checkBossPhase(boss) {
		const meta = ENEMY_META[boss.type];
		if (!meta?.phases) return;
		for (const phase of meta.phases) {
			const ratio = boss.hp / boss.maxHp;
			if (ratio <= phase.hpThreshold && !boss.phasesTriggered?.includes(phase.hpThreshold)) {
				if (!boss.phasesTriggered) boss.phasesTriggered = [];
				boss.phasesTriggered.push(phase.hpThreshold);
				if (phase.speedMultiplier) boss.speed = (meta.speed) * phase.speedMultiplier;
				if (phase.attackCooldownMultiplier && boss.attack?.cooldown) {
					boss.attack = { ...boss.attack, cooldown: Math.round(boss.attack.cooldown * phase.attackCooldownMultiplier) };
				}
				const bossEl = document.getElementById(`char-enemy-${boss.id}`);
				if (bossEl) {
					let cnt = 0;
					const t = setInterval(() => {
						bossEl.style.opacity = (cnt % 2 === 0) ? '0.2' : '1';
						if (++cnt >= 8) { clearInterval(t); bossEl.style.opacity = '1'; }
					}, 120);
				}
				pulse(`${meta.name} が 怒り狂った！`, 2500);
			}
		}
	}

	// ── トライフォースのカケラを生成 ──────────────────────
	function spawnTriforcePiece(boss) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.id = 'pending-triforce-piece';
		el.style.cssText = `
			position:absolute;
			left:${boss.x * cellPx}px;
			top:${boss.y * cellPx}px;
			width:${cellPx}px; height:${cellPx}px;
			display:flex; align-items:center; justify-content:center;
			font-size:${Math.round(cellPx * 0.65)}px;
			z-index:12; pointer-events:none;
			animation:triforce-pulse 1.5s ease-in-out infinite;
		`;
		el.textContent = '◭';
		charLayerEl.appendChild(el);
		setPendingTriforcePieceEl(el);
	}

	// ── ボス部屋ロック演出 ────────────────────────────────
	function showBossRoomLockEffect() {
		const flash = document.createElement('div');
		flash.style.cssText = `
			position:fixed;
			inset:0;
			background:rgba(180,0,0,0.45);
			pointer-events:none;
			z-index:50;
			animation:flash-anim 0.4s ease-out forwards;
		`;
		document.body.appendChild(flash);
		setTimeout(() => flash.remove(), 420);
	}

	// ── ボス撃破演出 ─────────────────────────────────────
	async function onBossDefeated(boss) {
		if (getBossDefeating()) return;
		setBossDefeating(true);
		stopGameLoop();

		// 1. ボスを点滅
		const bossEl = document.getElementById(`char-enemy-${boss.id}`);
		if (bossEl) {
			for (let i = 0; i < 10; i++) {
				bossEl.style.opacity = (i % 2 === 0) ? '0.15' : '1';
				await sleep(140);
			}
			bossEl.remove();
		}
		// 2. 爆発エフェクト複数
		const br = toTileRow(boss.y), bc = toTileCol(boss.x);
		for (let i = 0; i < 4; i++) {
			showExplosionEffect(br + (Math.random() - 0.5), bc + (Math.random() - 0.5));
			await sleep(200);
		}
		// 3. BGM 停止・SE
		stopBgm();
		playSound('fanfare');
		// 4. 敵リストから除去
		getSS(getCurrentLayer(), getStageKey()).defeatedEnemies.add(boss.id);
		setEnemies(getEnemies().filter(x => x !== boss));
		// 5. ボス HP バー非表示・ロック解除・ドアウェイ開放
		hideBossHpBar();
		setBossRoomLocked(false);
		const stageData = getStageData();
		const hasBossDoors = stageData?.tiles?.some(row => row.includes(TILE.DOORWAY_BOSS));
		unlockBossDoors();
		if (hasBossDoors) pulse('🔓 扉が開いた！', 2000);
		// 6. 条件評価
		evaluateConditions();
		// 7. トライフォース付与（DARK_LORD のみ）
		if (boss.type === TILE.DARK_LORD) {
			spawnTriforcePiece(boss);
			await sleep(600);
			pulse('◭ トライフォースのカケラが 現れた！', 3000);
			deps.setPendingTriforcePos(null);
			const tfx = boss.x, tfy = boss.y;
			setTimeout(() => { deps.setPendingTriforcePos({ x: tfx, y: tfy }); }, 1500);
			saveGame();
		} else {
			await sleep(400);
			pulse(`${ENEMY_META[boss.type]?.name ?? 'ボス'} を倒した！`, 2500);
			saveGame();
		}
		setBossDefeating(false);
		startGameLoop();
	}

	// ── ボス戦開始 ────────────────────────────────────────
	function startBossBattle(lk, sk) {
		const boss = getEnemies().find(e => ENEMY_META[e.type]?.isBoss);
		if (!boss) {
			setBossRoomLocked(false);
			return;
		}

		setTimeout(() => {
			lockBossDoors();
			showBossRoomLockEffect();
			playSound('stageTransition');
			setBossRoomLocked(true);
			pulse('⚠ 扉が閉じた！ボスを倒さないと出られない！', 3000);

			setTimeout(() => {
				const mapData = getMapData();
				const ld = mapData.layers[lk];
				const bossBgm = ld?.bossBgm ?? 'boss';
				playBgm(bossBgm);
				showBossHpBar(boss);
				pulse(`${ENEMY_META[boss.type].name} が 現れた！`, 2500);
			}, 800);
		}, 400);
	}

	// ── スタッフロール HTML ───────────────────────────────
	function buildStaffRollHtml() {
		const AUTHOR = 'Go Kojima';
		const roles = [
			'Game Director', 'Executive Producer', 'Game Designer',
			'Level Designer', 'Programmer', 'Lead Programmer',
			'Character Designer', 'Pixel Artist', 'Background Artist',
			'UI/UX Designer', 'Sound Designer', 'Music Composer',
			'Story Writer', 'World Builder', 'Dungeon Architect',
			'Monster Designer', 'Lore Creator', 'QA Lead', 'Playtester',
		];
		let html = `<div class="scroll-game-title">⚔ Blade of Lumia</div>`;
		html += `<div class="scroll-subtitle">～ ルミアの剣 ～</div>`;
		for (const role of roles) {
			html += `<div class="scroll-role">${role}</div>`;
			html += `<div class="scroll-name">${AUTHOR}</div>`;
			html += `<div class="scroll-divider"></div>`;
		}
		html += `<div class="scroll-role">Special Thanks to</div>`;
		html += `<div class="scroll-name">Kojima's family</div>`;
		html += `<div class="scroll-divider"></div>`;
		html += `<div class="scroll-thanks">Thank you for playing!</div>`;
		html += `<div class="scroll-copyright">© 2026 ${AUTHOR}</div>`;
		return html;
	}

	// ── トライフォース全収集チェック ──────────────────────
	function calcTotalTriforces() {
		const mapData = getMapData();
		if (!mapData) return 0;
		let total = 0;
		for (const ld of Object.values(mapData.layers ?? {})) {
			for (const sd of Object.values(ld.stages ?? {})) {
				for (const row of sd.tiles ?? []) {
					for (const tile of row) {
						if (tile === TILE.ITEM_TRIFORCE_PIECE) total++;
						if (tile === TILE.DARK_LORD) total++;
					}
				}
			}
		}
		return total;
	}

	function checkTriforceClear() {
		const total = calcTotalTriforces();
		if (total <= 0) return;
		const player = getPlayer();
		if (player.triforceCount >= total) {
			stopGameLoop();
			setTimeout(() => startEnding(), 2500);
		}
	}

	// ── 魔王撃破後トライフォース収集チェック ──────────────
	function checkPendingTriforce() {
		const pendingTriforcePos = deps.getPendingTriforcePos();
		if (!pendingTriforcePos || deps.getCollectingTriforce()) return;
		const player = getPlayer();
		const dist = Math.sqrt(
			(player.x - pendingTriforcePos.x) ** 2 +
			(player.y - pendingTriforcePos.y) ** 2,
		);
		if (dist > 1.0) return;

		deps.setCollectingTriforce(true);
		deps.setPendingTriforcePos(null);

		const el = getPendingTriforcePieceEl();
		if (el) { el.remove(); setPendingTriforcePieceEl(null); }
		document.getElementById('pending-triforce-piece')?.remove();

		player.triforceCount++;
		console.log(`[TRIFORCE] checkPendingTriforce: collected, triforceCount=${player.triforceCount}`, new Error().stack);
		playSound('item');
		pulse('◭ トライフォースのカケラを 手に入れた！', 4000);
		updateHud();
		saveGame();

		deps.setCollectingTriforce(false);
		checkTriforceClear();
	}

	// ── エンディング ──────────────────────────────────────
	async function startEnding() {
		deps.setIsGameover(true);
		stopGameLoop(); stopBgm();

		saveCleared();
		localStorage.removeItem(SAVE_KEY);

		endingOverlayEl.classList.remove('hidden');
		playBgm('ending');

		// フェーズ1：スタッフロール
		const phase1El = document.getElementById('ending-phase1');
		const phase2El = document.getElementById('ending-phase2');
		phase1El.style.display = '';
		phase2El.classList.add('hidden');

		const scrollEl = document.getElementById('ending-scroll');
		scrollEl.innerHTML = buildStaffRollHtml();

		await new Promise(r => {
			scrollEl.addEventListener('animationend', r, { once: true });
		});

		// フェーズ2：THE END シーン
		phase1El.style.display = 'none';
		phase2El.classList.remove('hidden');

		function placeBigSprite(canvasId, spriteName, palName) {
			const container = document.getElementById(canvasId);
			if (!container) return;
			container.innerHTML = '';
			const cv = makeSprite(spriteName, palName, true);
			if (!cv) return;
			container.appendChild(cv);
		}

		placeBigSprite('ending-princess1-canvas', 'princess', 'princess');
		placeBigSprite('ending-hero-canvas',      'heroD',    'hero');
		placeBigSprite('ending-princess2-canvas', 'princess', 'princess');

		const msgEl = document.getElementById('ending-msg');
		if (msgEl) {
			msgEl.innerHTML = '魔王を倒し、すべてのトライフォースのカケラを集めた！<br>ルミアの平和は守られた……';
		}
	}

	return {
		onBossDefeated,
		startBossBattle,
		startEnding,
		updateBossHpBar,
		checkBossPhase,
		checkTriforceClear,
		checkPendingTriforce,
		showBossHpBar,
		hideBossHpBar,
		showBossRoomLockEffect,
	};
}
