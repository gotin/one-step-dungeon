// game/boss.js ── ボス戦・エンディング（Phase 0-2 Step 5）
// createBoss(deps) factory で生成する。
// onBossDefeated / startBossBattle / startEnding を提供。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { countTriforces } from '../shared/triforce.js';
import { gameLayerEntries } from '../shared/layers.js';
import { makeSprite } from '../shared/sprites.js';
import { playSound, playBgm, stopBgm } from '../shared/sounds.js';
import { SAVE_KEY, CLEARED_KEY, ALTAR_EXIT_ID } from './constants.js';

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
 *   getExitRegistry()            – MAP_ENTER の id→宛先レジストリ（祭壇誘導判定に使用）
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
 *   grantReward(content)         – 報酬付与の共通口（player.js。bossReward で使用）
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
		getExitRegistry,
		evaluateConditions,
		lockBossDoors, unlockBossDoors,
		renderBoard, renderChars, updateHud,
		pulse, saveGame,
		stopGameLoop, startGameLoop,
		showExplosionEffect,
		// Phase 9-6: stageData.bossReward の授与に使う（player.js の共通付与口）
		grantReward,
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

	// ── 星の欠片を生成 ──────────────────────
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
		// Phase 6-1b: 撃破ボスを記録（NPC 台詞切り替えに使用）
		const player = getPlayer();
		if (!player.defeatedBosses) player.defeatedBosses = new Set();
		player.defeatedBosses.add(boss.type);
		const stageData = getStageData();
		const hasBossDoors = stageData?.tiles?.some(row => row.includes(TILE.DOORWAY_BOSS));
		unlockBossDoors();
		if (hasBossDoors) pulse('🔓 扉が開いた！', 2000);
		// 6. 条件評価
		evaluateConditions();
		// 7a. ラスボス（ザーネル）撃破 → エンディングへ（Phase 1-3）
		const isFinalBoss = ENEMY_META[boss.type]?.isFinalBoss;
		if (isFinalBoss) {
			await sleep(500);
			pulse(`${ENEMY_META[boss.type]?.name ?? 'ザーネル'} を 倒した！`, 3000);
			// 撃破フラグを解除してからエンディング演出へ（ループは startEnding が停止する）
			setBossDefeating(false);
			setTimeout(() => startEnding(), 2500);
			return;
		}
		// 7b. 星の欠片付与（DARK_LORD または dropsTriforce フラグを持つボス）
		// 大型ボス（岩のゴーレム等）も dropsTriforce:true で欠片を落とす。
		const dropsTriforce = boss.type === TILE.DARK_LORD
			|| ENEMY_META[boss.type]?.dropsTriforce;
		if (dropsTriforce) {
			spawnTriforcePiece(boss);
			await sleep(600);
			pulse('◭ 星の欠片が 現れた！', 3000);
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

	// ── ボス戦「合格」演出（Phase 9-6 深洋O・海の主）───────────────
	// ENEMY_META に yieldAt を持つボス専用の終幕。撃破（onBossDefeated）と違い：
	//   ・爆発・撃破 SE を出さない（倒したのではなく認められた）
	//   ・星の欠片を生成しない・defeatedBosses に入れない（＝撃破フラグを立てない）
	//   ・報酬は stageData.bossReward（grantReward 形の配列）を順に授与する
	//     ∴ ここは「何を配るか」を知らない＝ステージ側のデータで決まる
	// 呼び出しは combat.js の dealDamageToEnemy（HP が閾値以下になった瞬間）。
	async function onBossYielded(boss) {
		if (getBossDefeating()) return;
		setBossDefeating(true);
		stopGameLoop();

		const meta = ENEMY_META[boss.type];
		const stageData = getStageData();
		// 1. 「合格」の合図（撃破ではないが節目なのでファンファーレは共通）
		playSound('fanfare');
		pulse('よくやった、若き剣よ', 3000);
		await sleep(700);

		// 2. 報酬授与（データ駆動）。grantReward がメッセージを返すので順に見せる。
		//    ⚠️ 退場フェードより先に配る：主が消えるのを待たせると、プレイヤーは
		//    「何を貰ったか」を数秒後まで知れない。授与→見送りの順が自然。
		for (const content of stageData?.bossReward ?? []) {
			const msg = grantReward ? grantReward(content) : '';
			playSound('item');
			if (msg) pulse(`✨ ${msg}`, 2600);
			updateHud();
			await sleep(900);
		}

		// 3. HP バーを消し、ボス部屋のロックを解く
		hideBossHpBar();
		setBossRoomLocked(false);
		const hasBossDoors = stageData?.tiles?.some(row => row.includes(TILE.DOORWAY_BOSS));
		unlockBossDoors();
		if (hasBossDoors) pulse('🔓 扉が開いた！', 2000);
		evaluateConditions();

		// 4. 深みへ退場（フェードアウト。爆発は出さない）
		//    敵リストから外すのはフェードの前（renderChars が要素を作り直さないように）。
		getSS(getCurrentLayer(), getStageKey()).defeatedEnemies.add(boss.id);
		setEnemies(getEnemies().filter(x => x !== boss));
		const bossEl = document.getElementById(`char-enemy-${boss.id}`);
		if (bossEl) {
			bossEl.style.transition = 'opacity 1.2s ease-out';
			bossEl.style.opacity = '0';
			await sleep(1250);
			bossEl.remove();
		}
		renderBoard(); renderChars(); updateHud();
		if (!(stageData?.bossReward ?? []).length) {
			pulse(`${meta?.name ?? 'ボス'} は 深みへ帰っていった`, 2500);
		}
		saveGame();
		setBossDefeating(false);
		startGameLoop();
	}

	// ボスが「合格ライン」に達したか（combat.js が毎ダメージで問い合わせる）。
	// yieldAt を持たないボス（既存8体）は常に false ＝従来の撃破フローのまま。
	function shouldBossYield(boss) {
		const meta = ENEMY_META[boss.type];
		if (!meta?.yieldAt) return false;
		if (boss._yielded) return false;         // 二重発火防止（連打しても一度だけ）
		if (boss.hp / boss.maxHp > meta.yieldAt) return false;
		boss._yielded = true;
		return true;
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

	// ── 星の欠片・全収集チェック ──────────────────────
	function calcTotalTriforces() {
		return countTriforces(getMapData());
	}

	// 古代の祭壇（タイル ALTAR='^'）がマップ上に存在するか。
	// 存在すれば「全収集 → 祭壇へ誘導」の終盤フロー、無ければ従来の
	// 「全収集 → 即エンディング」フォールバックに分岐する（Phase 1-3/1-4）。
	// ※ 1-4 は専用ステージを作らず、フィールドに祭壇タイルを1個置く方式（A案）。
	//   将来 MAP_ENTER 経由の専用ステージにする場合は ALTAR_EXIT_ID も併用判定する。
	function altarExists() {
		const mapData = getMapData();
		if (!mapData) return false;
		// ⚠️ テストレイヤーは除外（ギミック検証ステージの祭壇で終盤フローが誤作動しない）。
		for (const [, ld] of gameLayerEntries(mapData)) {
			for (const sd of Object.values(ld.stages ?? {})) {
				for (const row of sd.tiles ?? []) {
					if (row.includes(TILE.ALTAR)) return true;
				}
			}
		}
		// フォールバック：専用ステージ方式（MAP_ENTER id）でも誘導扱いにする
		const reg = getExitRegistry?.();
		return !!(reg && reg[ALTAR_EXIT_ID]);
	}

	// ── 古代の祭壇に星の欠片を捧げる（Phase 1-4）──────────────
	// プレイヤーが祭壇タイルに乗ったとき handleTileEvent から呼ばれる。
	// 全収集していれば翼の羽衣を授ける。不足していれば拒否メッセージ。
	function offerAtAltar() {
		const player = getPlayer();
		if (player.hasWingRobe) {
			pulse('⛩ 古代の祭壇 …翼の羽衣は すでに授かった', 2500);
			return;
		}
		const total = calcTotalTriforces();
		if (total <= 0 || player.triforceCount < total) {
			const remain = Math.max(0, total - player.triforceCount);
			pulse(`⛩ 古代の祭壇 …星の欠片が ${remain}つ 足りない`, 3000);
			return;
		}
		// 全収集 → 翼の羽衣を授かる
		player.hasWingRobe = true;
		playSound('fanfare');
		showAltarLightPillar();
		pulse('✦ 古代の祭壇が 光り輝いた！「翼の羽衣」を 授かった！', 5000);
		updateHud();
		saveGame();
	}

	// 祭壇の光柱演出（画面中央から立ち上る光のフラッシュ）
	function showAltarLightPillar() {
		const pillar = document.createElement('div');
		pillar.style.cssText = `
			position:fixed;
			inset:0;
			background:radial-gradient(circle at 50% 60%, rgba(255,250,210,0.85), rgba(255,240,160,0.3) 35%, transparent 70%);
			pointer-events:none;
			z-index:55;
			animation:flash-anim 1.2s ease-out forwards;
		`;
		document.body.appendChild(pillar);
		setTimeout(() => pillar.remove(), 1300);
	}

	function checkTriforceClear() {
		const total = calcTotalTriforces();
		if (total <= 0) return;
		const player = getPlayer();
		if (player.triforceCount < total) return;

		// 既に翼の羽衣を授かっている＝祭壇は済。ここではエンディングを発火しない
		// （ラスボス ザーネル撃破で onBossDefeated 側がエンディングを出す）。
		if (player.hasWingRobe) return;

		if (altarExists()) {
			// Phase 1-4 で配置される古代の祭壇へ誘導する。
			// エンディングはまだ出さず、祭壇で翼の羽衣を授かるよう促す。
			setTimeout(() => {
				pulse('✦ すべての星の欠片が 集まった！古代の祭壇へ向かおう', 4500);
			}, 800);
			return;
		}

		// フォールバック：祭壇が未配置の現状は従来どおり即エンディング。
		stopGameLoop();
		setTimeout(() => startEnding(), 2500);
	}

	// ── 魔王撃破後・星の欠片収集チェック ──────────────
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
		pulse('◭ 星の欠片を 手に入れた！', 4000);
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
			msgEl.innerHTML = 'ザーネルを倒し、すべての星の欠片を集め、女王ルミアの呪いを解いた。<br>光が世界に戻り、ルミアの地に平和が訪れた……';
		}
	}

	return {
		onBossDefeated,
		// Phase 9-6: yieldAt ボス（海の主）の戦闘終了＝合格フロー
		onBossYielded,
		shouldBossYield,
		startBossBattle,
		startEnding,
		updateBossHpBar,
		checkBossPhase,
		checkTriforceClear,
		checkPendingTriforce,
		offerAtAltar,
		showBossHpBar,
		hideBossHpBar,
		showBossRoomLockEffect,
	};
}
