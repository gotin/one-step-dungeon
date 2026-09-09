// ── ui.js ─────────────────────────────────────────────────────
// Phase 0-2 Step 4: HUD・ポーズ・ダイアログ・ショップを game.js から切り出し
//
// export: createUi(deps) → {
//   updateHud, pulse, updateDungeonHud, updateShieldHud,
//   startDialog, showDialogLine, advanceDialog,
//   togglePause, renderPauseMenu, pauseSelectPrev, pauseSelectNext,
//   openShop, closeShop, renderShop, shopSelectPrev, shopSelectNext, shopBuy,
//   getIsDialog, getIsShop, getIsPaused, getIsShielding,
// }
//
// deps は以下の getter・setter・関数を注入する：
//   getPlayer()        → player
//   getMapData()       → mapData
//   getCurrentLayer()  → currentLayer
//   getStageKey()      → stageKey
//   getSS(lk, sk)      → ステージ状態オブジェクト
//   startGameLoop()
//   stopGameLoop()
//   saveGame()
//   // 状態フラグの getter/setter（game.js の let 変数と同期するため）
//   getIsDialog()  / setIsDialog(v)
//   getIsShop()    / setIsShop(v)
//   getIsPaused()  / setIsPaused(v)
//   getIsShielding() / setIsShielding(v)
// SPRITES / PAL / ITEM_META / HP_PER_HEART / makeSprite は直接 import

import { HP_PER_HEART } from './constants.js';
import { SPRITES, PAL, makeSprite } from '../shared/sprites.js';
import { ITEM_META, EQUIP_META, BOOMERANG_TIERS, SWORD_TIERS, SHIELD_TIERS, ARMOR_TIERS } from '../shared/items.js';
import { iconCanvas, iconText, iconPxOf } from '../shared/ui-icons.js';
import { playSound } from '../shared/sounds.js';

// HUD のハート（heart/heartEmpty/heartHalf）の表示サイズ。Phase 10d-3 で
// 絵を32ドット化した際、絵の中の透明余白が増えた分だけ見かけが縮むのを補う
// （旧8×8は ink が canvas の 1.0×0.875 を占めていたが、新32×32は 0.531×0.5＝
// この箱をそのままにすると旧の約55%の大きさに見える）。
// 10e-2：数値ではなく CSS 変数を渡す＝PC では vw 指定（game/css/responsive.css）で
// 文字と同じ比で伸縮する。基準値（16 × 旧ink/新ink ≒ 29px）は hud.css 側にある。
const HEART_ICON_PX = 'var(--hud-heart)';
// 装備3枠・SUBアイテム・ルピー・星の欠片の絵の大きさ（同じく CSS 変数）。
const HUD_ICON_PX = 'var(--hud-icon)';

// ハート3種の絵を返す（HUD とポーズの体力欄で共用）。
// 3種は同じ大きさで並ばなければならない∴ink 正規化ではなく **固定箱**（fit:'box'）で描く
// ＝tests/obj-dot32-items.spec.js ⑩「HUD のハート3種は同じ表示サイズ」を守るため。
function heartIconCanvas(hpForThis) {
	const key = hpForThis >= HP_PER_HEART ? 'heart' : (hpForThis === 1 ? 'heartHalf' : 'heartEmpty');
	return iconCanvas(key, HEART_ICON_PX, { fit: 'box' });
}

// サブアイテム・装備の絵（ポーズ／HUD で共用）。ティアで色が変わる物は
// SWORD_TIERS 等の `pal` を優先する（形は共通・色だけ違う＝shared/items.js の作法）。
// ⚠️ 形も違うティアがある（布の服＝armorCloth）∴`sprite` も表から引く。絵が無い名前が
//    書かれていたら EQUIP_META の絵に落ちる＝ティア表に嘘を書いても無言の空欄にならない。
function equipIconCanvas(kind, player, px) {
	const meta = EQUIP_META[kind];
	if (!meta?.sprite) return null;
	const tiers = kind === 'sword' ? SWORD_TIERS : (kind === 'shield' ? SHIELD_TIERS : ARMOR_TIERS);
	const tierIdx = kind === 'sword' ? player?.swordTier : (kind === 'shield' ? player?.shieldTier : player?.armorTier);
	const tier = tiers?.[tierIdx];
	const pal = tier?.pal ?? meta.pal;
	const spr = tier?.sprite && SPRITES[tier.sprite] ? tier.sprite : meta.sprite;
	return iconCanvas({ spr, pal }, px);
}

function subItemIconCanvas(id, player, px) {
	const meta = ITEM_META[id];
	if (!meta?.sprite) return null;
	// ブーメランはティアで色が変わる（木＝茶／銀＝銀）
	const pal = id === 'boomerang'
		? (BOOMERANG_TIERS[player?.boomerangTier ?? 0]?.pal ?? meta.pal)
		: (meta.pal ?? meta.sprite);
	return iconCanvas({ spr: meta.sprite, pal }, px);
}

// ── サブアイテムの表示名（Phase 9-6）───────────────────────────
// ブーメランはティア（木／銀）で名前が変わる。他のアイテムは ITEM_META の名前。
// HUD のツールチップとポーズのアイテム一覧で共用する。
function subItemDisplayName(id, player) {
	if (id === 'boomerang') {
		const tier = BOOMERANG_TIERS[player?.boomerangTier ?? 0];
		if (tier) return tier.name;
	}
	return ITEM_META[id]?.name ?? id;
}

/**
 * UI 関数群を生成して返す factory。
 */
export function createUi(deps) {
	const {
		getPlayer,
		getMapData,
		getCurrentLayer,
		getStageKey,
		getSS,
		startGameLoop,
		stopGameLoop,
		saveGame,
		// 状態フラグ getter/setter（game.js の let 変数と同期するため注入）
		getIsDialog,  setIsDialog,
		getIsShop,    setIsShop,
		getIsPaused,  setIsPaused,
		getIsShielding, setIsShielding,
	} = deps;

	// ── ui.js ローカル状態（game.js 側フラグには影響しない） ──
	let dialogLines   = [];
	let dialogLineIdx = 0;
	let pauseItemKeys = [];
	let pauseItemIdx  = 0;
	let shopGoods     = [];
	let shopIdx       = 0;
	let msgTimer      = null;
	let pendingPulse  = null; // オーバーレイ表示中に来た pulse() は閉じるまで保留

	// ── DOM 参照 ──────────────────────────────────────────────
	const heartsEl         = document.getElementById('hud-hearts');
	const equipSwordEl     = document.getElementById('hud-equip-sword');
	const equipShieldEl    = document.getElementById('hud-equip-shield');
	const equipArmorEl     = document.getElementById('hud-equip-armor');
	const subIconEl        = document.getElementById('hud-sub-icon');
	const subCountEl       = document.getElementById('hud-sub-count');
	const msgBarEl         = document.getElementById('msg-bar');
	const dialogOverlayEl  = document.getElementById('dialog-overlay');
	const dialogNameEl     = document.getElementById('dialog-name');
	const dialogTextEl     = document.getElementById('dialog-text');
	const pauseOverlayEl   = document.getElementById('pause-overlay');
	const pauseItemsEl     = document.getElementById('pause-items');
	const pauseStatsEl     = document.getElementById('pause-stats');
	const dungeonInfoEl    = document.getElementById('hud-dungeon-info');
	const dungeonNameEl    = document.getElementById('hud-dungeon-name');
	const dungeonItemsEl   = document.getElementById('hud-dungeon-items');
	const pauseDungeonMapEl= document.getElementById('pause-dungeon-map');
	const pauseMapCanvasEl = document.getElementById('pause-map-canvas');
	const pauseMapHintEl   = document.getElementById('pause-map-hint');
	const shopOverlayEl    = document.getElementById('shop-overlay');
	const shopItemsEl      = document.getElementById('shop-items');
	const shopResultEl     = document.getElementById('shop-result');
	const shopRupeesEl     = document.getElementById('shop-rupees');

	// ── HUD ───────────────────────────────────────────────────
	function updateHud() {
		const player = getPlayer();
		heartsEl.innerHTML = '';
		for (let i = 0; i < player.maxHearts; i++) {
			const cv = heartIconCanvas(player.hp - i * HP_PER_HEART);
			if (cv) heartsEl.appendChild(cv);
		}
		// 装備欄の絵はティアで色が変わる∴持ち替えのたびに描き直す（10e）。
		for (const [kind, el] of [['sword', equipSwordEl], ['shield', equipShieldEl], ['armor', equipArmorEl]]) {
			if (!el) continue;
			const cv = equipIconCanvas(kind, player, iconPxOf(el, HUD_ICON_PX));
			if (cv) { el.textContent = ''; el.appendChild(cv); }
		}
		equipSwordEl.classList.toggle('has-item',  !!player.weapon);
		equipShieldEl.classList.toggle('has-item', !!player.shield);
		equipArmorEl.classList.toggle('has-item',  !!player.armor);
		// Phase 1-5: 翼の羽衣を授かったら飛行ボタンを表示。飛行中はハイライト。
		const flyBtn = document.getElementById('btn-fly');
		if (flyBtn) {
			flyBtn.classList.toggle('hidden', !player.hasWingRobe);
			flyBtn.classList.toggle('defending', !!player.flying);
		}
		document.getElementById('hud-rupees').textContent   = player.rupees;
		document.getElementById('hud-triforce').textContent = player.triforceCount;
		const ai = player.activeSubItem;
		if (ai && player.subItems[ai]) {
			const meta = ITEM_META[ai];
			const cv = subItemIconCanvas(ai, player, HUD_ICON_PX);
			if (cv) { subIconEl.textContent = ''; subIconEl.appendChild(cv); }
			else subIconEl.textContent = meta?.icon ?? ai;
			// Phase 9-6: ブーメランはティア名（木／銀）を表示名にする
			subIconEl.title        = subItemDisplayName(ai, player);
			const cnt = player.subItems[ai].count;
			subCountEl.textContent = (cnt && cnt !== Infinity) ? `×${cnt}` : '';
		} else {
			subIconEl.textContent  = '—';
			subIconEl.title        = '';
			subCountEl.textContent = '';
		}
	}

	function pulse(text, duration = 2000) {
		// オーバーレイ（ダイアログ／ショップ／ポーズ）が開いている間は、消灯タイマーが
		// 実時間で進んでしまい閉じた頃には消えている（2026-08-21 ユーザー報告）＝
		// 保留して閉じた瞬間に出し直す（消灯タイマーもそこから数える）。
		if (getIsDialog() || getIsShop() || getIsPaused()) {
			pendingPulse = { text, duration };
			return;
		}
		if (msgTimer) clearTimeout(msgTimer);
		// 10e: 本文中の `{{key}}`（例 `{{key}}を手に入れた！`）を絵に差し替える。
		// ⚠️ 文字はテキストノードとして残る∴`#msg-bar` の textContent を見るテストは緑のまま
		//    （絵は canvas＝文字を持たない）。未知のキーは `{{key}}` のまま出る＝書き間違いが
		//    黙って消えない（shared/ui-icons.js iconText の注記）。
		iconText(msgBarEl, text, 18);
		msgBarEl.classList.remove('hidden');
		msgTimer = setTimeout(() => msgBarEl.classList.add('hidden'), duration);
	}

	function flushPendingPulse() {
		if (!pendingPulse) return;
		const { text, duration } = pendingPulse;
		pendingPulse = null;
		pulse(text, duration);
	}

	function updateDungeonHud(lk) {
		const mapData = getMapData();
		const player  = getPlayer();
		const ld = mapData.layers[lk];
		const layerName = ld?.name ?? '';
		if (layerName) {
			dungeonInfoEl.classList.remove('hidden');
			dungeonNameEl.textContent = layerName;
			const dm = player.dungeonItems?.[lk];
			dungeonItemsEl.textContent = '';
			for (const [have, key, emoji] of [[dm?.hasMap, 'map', '🗺'], [dm?.hasCompass, 'compass', '🧭']]) {
				if (!have) continue;
				const cv = iconCanvas(key, 14);
				if (cv) dungeonItemsEl.appendChild(cv);
				else dungeonItemsEl.appendChild(document.createTextNode(emoji));
			}
		} else {
			dungeonInfoEl.classList.add('hidden');
		}
	}

	function updateShieldHud() {
		document.getElementById('btn-shield')?.classList.toggle('defending', getIsShielding());
	}

	// ── ダイアログ ────────────────────────────────────────────
	function startDialog(r, c, tileChar, stageData, npcDefaultDialog, player) {
		const posKey = `${r},${c}`;
		const data   = stageData.npcData?.[posKey] ?? npcDefaultDialog[tileChar] ?? { name: 'NPC', lines: ['…'] };
		// Phase 6-1b: 個別ボス撃破台詞 linesAfterBoss[type] → default → linesAfter → lines
		const defeated = player?.defeatedBosses;
		let lines = null;
		if (defeated && data.linesAfterBoss) {
			for (const [bossType, bossLines] of Object.entries(data.linesAfterBoss)) {
				if (bossType !== 'default' && defeated.has(bossType)) { lines = bossLines; break; }
			}
			if (!lines && defeated.size > 0 && data.linesAfterBoss.default) {
				lines = data.linesAfterBoss.default;
			}
		}
		if (!lines) {
			const hasSeenBoss = (player?.triforceCount ?? 0) > 0;
			lines = (hasSeenBoss && data.linesAfter) ? data.linesAfter : (data.lines ?? ['…']);
		}
		dialogLines = lines;
		dialogLineIdx = 0;
		setIsDialog(true); stopGameLoop();
		dialogNameEl.textContent = data.name ?? '';
		showDialogLine();
		dialogOverlayEl.classList.remove('hidden');
		playSound('talk');
	}

	function showDialogLine() {
		// 10e: 台詞も `{{key}}` を絵に差し替える（会話で道具の名を出す看板・NPC 用）。
		iconText(dialogTextEl, dialogLines[dialogLineIdx] ?? '', 18);
		const isLast = dialogLineIdx >= dialogLines.length - 1;
		document.getElementById('dialog-next').textContent =
			isLast ? '▼ 閉じる（Spaceキー）' : '▼ 次へ（Spaceキー）';
	}

	function advanceDialog() {
		dialogLineIdx++;
		if (dialogLineIdx >= dialogLines.length) {
			setIsDialog(false); dialogOverlayEl.classList.add('hidden'); startGameLoop();
			flushPendingPulse();
		} else { showDialogLine(); playSound('talk'); }
	}

	// ダイアログを外部から開く（ヒント・サブアイテム説明など）
	function openDialog(name, lines) {
		dialogLines   = lines;
		dialogLineIdx = 0;
		setIsDialog(true); stopGameLoop();
		dialogNameEl.textContent = name;
		showDialogLine();
		dialogOverlayEl.classList.remove('hidden');
		playSound('talk');
	}

	// ── ポーズ ────────────────────────────────────────────────
	function togglePause() {
		if (getIsDialog()) return;
		const newPaused = !getIsPaused();
		setIsPaused(newPaused);
		if (newPaused) {
			stopGameLoop(); pauseOverlayEl.classList.remove('hidden'); renderPauseMenu();
		} else {
			pauseOverlayEl.classList.add('hidden'); startGameLoop();
			flushPendingPulse();
		}
	}

	function renderPauseMenu() {
		const player    = getPlayer();
		const mapData   = getMapData();
		const currentLayer = getCurrentLayer();
		const stageKey     = getStageKey();

		pauseItemKeys = Object.keys(player.subItems).filter(k => {
			const s = player.subItems[k];
			if (!s || (s.count !== Infinity && s.count <= 0)) return false;
			const meta = ITEM_META[k];
			if (meta?.type === 'passive') return false;
			return true;
		});
		if (pauseItemIdx >= pauseItemKeys.length) pauseItemIdx = 0;
		pauseItemsEl.innerHTML = '';
		if (pauseItemKeys.length === 0) {
			pauseItemsEl.innerHTML = '<div style="color:#4a6a8a;font-size:13px;">サブアイテムなし</div>';
		} else {
			for (let i = 0; i < pauseItemKeys.length; i++) {
				const id  = pauseItemKeys[i];
				const meta = ITEM_META[id];
				const cnt  = player.subItems[id].count;
				const div  = document.createElement('div');
				div.className = `pause-item-slot${i === pauseItemIdx ? ' selected' : ''}`;
				const iconDiv = document.createElement('div');
				iconDiv.className = 'pause-item-icon';
				const cv = subItemIconCanvas(id, player, 24);
				if (cv) iconDiv.appendChild(cv);
				else iconDiv.textContent = meta?.icon ?? id;
				div.appendChild(iconDiv);
				const nameDiv = document.createElement('div');
				nameDiv.className = 'pause-item-name';
				nameDiv.textContent = subItemDisplayName(id, player);
				div.appendChild(nameDiv);
				const cntDiv = document.createElement('div');
				cntDiv.className = 'pause-item-count';
				cntDiv.textContent = cnt === Infinity ? '∞' : `×${cnt}`;
				div.appendChild(cntDiv);
				div.addEventListener('click', () => {
					pauseItemIdx = i; player.activeSubItem = pauseItemKeys[i];
					updateHud(); togglePause();
				});
				pauseItemsEl.appendChild(div);
			}
		}

		pauseStatsEl.innerHTML = '';
		const heartRow = document.createElement('div');
		heartRow.style.cssText = 'display:flex;align-items:center;gap:2px;margin-bottom:4px;';
		for (let i = 0; i < player.maxHearts; i++) {
			const cv = heartIconCanvas(player.hp - i * HP_PER_HEART);
			if (cv) heartRow.appendChild(cv);
		}
		pauseStatsEl.appendChild(heartRow);

		// 所持金・装備の行（10e）＝絵文字の代わりに絵（canvas）を混ぜる。
		// 装備の絵はティアの色（木／銀…）になる∴equipIconCanvas を通す。
		const statsLine = document.createElement('div');
		statsLine.style.cssText = 'display:flex;align-items:center;gap:2px;flex-wrap:wrap;';
		const putIcon = (cv, fallback) => {
			if (cv) statsLine.appendChild(cv);
			else statsLine.appendChild(document.createTextNode(fallback));
		};
		const putText = (t) => statsLine.appendChild(document.createTextNode(t));
		putIcon(iconCanvas('rupee', 16), '💰');
		putText(`${player.rupees}　`);
		const equipLabels = [
			['sword',  player.weapon, player.weapon ? `${player._equip?.swordName ?? '剣'}(ATK${player.atk})` : 'なし', '⚔'],
			['armor',  player.armor,  player.armor  ? `${player._equip?.armorName ?? '防具'}(DEF${player.def})` : 'なし', '⚚'],
			['shield', player.shield, player.shield ? `${player._equip?.shieldName ?? 'たて'}` : 'なし', '🛡'],
		];
		for (const [kind, , label, emoji] of equipLabels) {
			putIcon(equipIconCanvas(kind, player, 16), emoji);
			putText(`${label}　`);
		}
		pauseStatsEl.appendChild(statsLine);
		renderPauseDungeonMap();
	}

	function renderPauseDungeonMap() {
		const player    = getPlayer();
		const mapData   = getMapData();
		const currentLayer = getCurrentLayer();
		const stageKey     = getStageKey();

		const lk = currentLayer;
		const dm = player.dungeonItems?.[lk];
		if (!dm?.hasMap) { pauseDungeonMapEl.classList.add('hidden'); return; }
		pauseDungeonMapEl.classList.remove('hidden');

		const ld = mapData.layers[lk];
		const hasCompass  = !!dm.hasCompass;
		const bossStageKey = ld?.bossStage ?? null;
		const stages = Object.keys(ld.stages ?? {});
		if (stages.length === 0) { pauseDungeonMapEl.classList.add('hidden'); return; }

		const coords = stages.map(k => k.split(',').map(Number));
		const minX = Math.min(...coords.map(c => c[0]));
		const maxX = Math.max(...coords.map(c => c[0]));
		const minY = Math.min(...coords.map(c => c[1]));
		const maxY = Math.max(...coords.map(c => c[1]));

		const CELL = 24, PAD = 3;
		const cw = (maxX - minX + 1) * (CELL + PAD) + PAD;
		const ch = (maxY - minY + 1) * (CELL + PAD) + PAD;
		pauseMapCanvasEl.width  = cw;
		pauseMapCanvasEl.height = ch;
		pauseMapCanvasEl.style.width  = `${cw * 2}px`;
		pauseMapCanvasEl.style.height = `${ch * 2}px`;

		const ctx = pauseMapCanvasEl.getContext('2d');
		ctx.clearRect(0, 0, cw, ch);
		ctx.fillStyle = '#0a0e12';
		ctx.fillRect(0, 0, cw, ch);

		const [curX, curY] = stageKey.split(',').map(Number);
		const stageSet = new Set(stages);

		stages.forEach(sk => {
			const [sx, sy] = sk.split(',').map(Number);
			const x = PAD + (sx - minX) * (CELL + PAD);
			const y = PAD + (sy - minY) * (CELL + PAD);
			const isCurrent = (sx === curX && sy === curY);
			const isBoss    = (sk === bossStageKey && hasCompass);
			const isVisited = getSS(lk, sk).visited || isCurrent;

			if (isCurrent)   ctx.fillStyle = '#80c0f0';
			else if (isBoss) ctx.fillStyle = '#c04040';
			else             ctx.fillStyle = isVisited ? '#3a5060' : '#1a2a38';
			ctx.fillRect(x, y, CELL, CELL);

			const PASS_W = Math.floor(CELL * 0.4), PASS_H = PAD;
			const passColor = isCurrent ? '#80c0f0' : (isVisited ? '#3a5060' : '#1a2a38');
			ctx.fillStyle = passColor;
			const t = ld.stages[sk].tiles;
			if (stageSet.has(`${sx + 1},${sy}`) && (t[4][11] !== '#' || t[5][11] !== '#')) ctx.fillRect(x + CELL, y + (CELL - PASS_W) / 2, PASS_H, PASS_W);
			if (stageSet.has(`${sx},${sy + 1}`) && (t[9][5] !== '#' || t[9][6] !== '#')) ctx.fillRect(x + (CELL - PASS_W) / 2, y + CELL, PASS_W, PASS_H);
			if (stageSet.has(`${sx - 1},${sy}`) && (t[4][0] !== '#' || t[5][0] !== '#')) ctx.fillRect(x - PASS_H, y + (CELL - PASS_W) / 2, PASS_H, PASS_W);
			if (stageSet.has(`${sx},${sy - 1}`) && (t[0][5] !== '#' || t[0][6] !== '#')) ctx.fillRect(x + (CELL - PASS_W) / 2, y - PASS_H, PASS_W, PASS_H);

			if (isBoss) {
				ctx.fillStyle = '#ffffff';
				ctx.font = `${CELL - 4}px sans-serif`;
				ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
				ctx.fillText('!', x + CELL / 2, y + CELL / 2 + 1);
			}
			if (isCurrent) {
				ctx.fillStyle = '#0a1418';
				const s = 4;
				ctx.fillRect(x + CELL / 2 - s / 2, y + CELL / 2 - s / 2, s, s);
			}
		});

		if (hasCompass && bossStageKey && ld.stages[bossStageKey]) {
			pauseMapHintEl.classList.remove('hidden');
		} else {
			pauseMapHintEl.classList.add('hidden');
		}
	}

	function pauseSelectPrev() {
		const player = getPlayer();
		if (!pauseItemKeys.length) return;
		pauseItemIdx = (pauseItemIdx - 1 + pauseItemKeys.length) % pauseItemKeys.length;
		player.activeSubItem = pauseItemKeys[pauseItemIdx];
		playSound('switch');
		updateHud(); renderPauseMenu();
	}

	function pauseSelectNext() {
		const player = getPlayer();
		if (!pauseItemKeys.length) return;
		pauseItemIdx = (pauseItemIdx + 1) % pauseItemKeys.length;
		player.activeSubItem = pauseItemKeys[pauseItemIdx];
		playSound('switch');
		updateHud(); renderPauseMenu();
	}

	// ── ショップ ──────────────────────────────────────────────
	function openShop(shopData, posKey) {
		if (!shopData?.items?.length) return;
		setIsShop(true);
		shopGoods = shopData.items.map(g => g.gacha ? { ...g, _posKey: posKey ?? '' } : g);
		shopIdx   = 0;
		shopResultEl.className = 'hidden';
		stopGameLoop();
		renderShop();
		shopOverlayEl.classList.remove('hidden');
		playSound('talk');
	}

	function closeShop() {
		setIsShop(false);
		shopResultEl.className = 'hidden';
		shopOverlayEl.classList.add('hidden');
		startGameLoop();
		flushPendingPulse();
	}

	function renderShop() {
		const player = getPlayer();
		shopRupeesEl.textContent = player.rupees;
		shopItemsEl.innerHTML = '';
		shopGoods.forEach((g, i) => {
			const meta = ITEM_META[g.id];
			const price = g.gacha ? g.gacha.price : g.price;
			const name = g.name ?? meta?.name ?? g.id;
			const row  = document.createElement('div');
			const canBuy = player.rupees >= price;
			row.className = `shop-item-row${i === shopIdx ? ' selected' : ''}${canBuy ? '' : ' cannot-afford'}`;
			// 10e: 絵文字ではなく絵（canvas）を並べる。innerHTML では canvas を差せない∴
			// DOM を組む（品名は `g.name` にステージ由来の文字列が入る∴HTML 埋め込みも避けたい）。
			const iconSpan = document.createElement('span');
			iconSpan.className = 'shop-item-icon';
			const iconCv = g.gacha ? iconCanvas('dice', 22) : subItemIconCanvas(g.id, player, 22);
			if (iconCv) iconSpan.appendChild(iconCv);
			else iconSpan.textContent = meta?.icon ?? (g.gacha ? '🎲' : g.id);
			const nameSpan = document.createElement('span');
			nameSpan.className = 'shop-item-name';
			nameSpan.textContent = `${name}${g.count ? ` ×${g.count}` : ''}`;
			const priceSpan = document.createElement('span');
			priceSpan.className = 'shop-item-price';
			const priceCv = iconCanvas('rupee', 16);
			if (priceCv) priceSpan.appendChild(priceCv);
			else priceSpan.appendChild(document.createTextNode('💰'));
			priceSpan.appendChild(document.createTextNode(String(price)));
			row.append(iconSpan, nameSpan, priceSpan);
			row.addEventListener('click', () => { shopIdx = i; renderShop(); shopBuy(); });
			shopItemsEl.appendChild(row);
		});
	}

	function shopSelectPrev() {
		if (!shopGoods.length) return;
		shopIdx = (shopIdx - 1 + shopGoods.length) % shopGoods.length;
		renderShop();
	}

	function shopSelectNext() {
		if (!shopGoods.length) return;
		shopIdx = (shopIdx + 1) % shopGoods.length;
		renderShop();
	}

	function shopBuy(giveSubItemFn, updateHudFn, grantRewardFn, getLayerFn, getStageFn) {
		const player = getPlayer();
		const g = shopGoods[shopIdx];
		if (!g) return;

		// ガチャ分岐（good に gacha プロパティがある場合）
		if (g.gacha) {
			const gacha = g.gacha;
			if (player.rupees < gacha.price) { pulse('ルピーが足りない！', 1500); return; }
			player.rupees -= gacha.price;
			const layer = getLayerFn ? getLayerFn() : '';
			const stageKey = getStageFn ? getStageFn() : '';
			const posKey = g._posKey ?? '';
			const gachaKey = `${layer}:${stageKey}:${posKey}`;
			if (!player.gachaPulls) player.gachaPulls = {};
			player.gachaPulls[gachaKey] = (player.gachaPulls[gachaKey] ?? 0) + 1;
			const pulls = player.gachaPulls[gachaKey];
			let reward;
			if (pulls >= gacha.pityCount) {
				reward = gacha.pityReward;
				player.gachaPulls[gachaKey] = 0;
			} else {
				// 重み付き抽選
				const random = gacha._random ?? Math.random;
				const totalWeight = gacha.pool.reduce((s, e) => s + e.weight, 0);
				let roll = random() * totalWeight;
				reward = gacha.pool[gacha.pool.length - 1].reward;
				for (const entry of gacha.pool) {
					roll -= entry.weight;
					if (roll <= 0) { reward = entry.reward; break; }
				}
			}
			const msg = grantRewardFn ? grantRewardFn(reward) : '';
			const matchedEntry = gacha.pool.find(e => e.reward === reward);
			const isRare = reward === gacha.pityReward || (matchedEntry?.weight ?? 100) <= 10;
			const isMiss = reward.type === 'rupee' && (reward.value ?? 0) < gacha.price;
			playSound(isRare ? 'appear' : 'item');
			if (isMiss) {
				shopResultEl.className = 'miss';
				shopResultEl.textContent = `はずれ… ${msg || 'ルピーが少し戻ってきた'}`;
			} else {
				shopResultEl.className = '';
				shopResultEl.textContent = `✨ あたり！ ${msg || '何かを手に入れた！'}`;
			}
			if (updateHudFn) updateHudFn(); else updateHud();
			saveGame();
			renderShop();
			return;
		}

		if (player.rupees < g.price) { pulse('ルピーが足りない！', 1500); return; }
		player.rupees -= g.price;
		const meta = ITEM_META[g.id];
		if (g.id === 'bomb') {
			if (!player.subItems.bomb) player.subItems.bomb = { count: 0 };
			player.subItems.bomb.count = Math.min(player.subItems.bomb.count + (g.count ?? 1), player.maxBombs ?? 8);
			if (!player.activeSubItem) player.activeSubItem = 'bomb';
		} else if (g.id === 'healPotion' || g.id === 'bigHealPotion') {
			if (giveSubItemFn) giveSubItemFn(g.id);
		} else if (g.id === 'boomerang') {
			if (!player.subItems.boomerang) player.subItems.boomerang = { count: Infinity };
			if (!player.activeSubItem) player.activeSubItem = 'boomerang';
			// Phase 9-6: 店売りは木ティア。既に銀を持っていれば下げない。
			if ((player.boomerangTier ?? -1) < 0) player.boomerangTier = 0;
		} else {
			if (giveSubItemFn) giveSubItemFn(g.id);
		}
		playSound('item');
		pulse(`${meta?.name ?? g.id} を購入した！`, 1500);
		if (updateHudFn) updateHudFn(); else updateHud();
		saveGame();
		renderShop();
	}

	return {
		// 状態 getter（input.js から参照）
		getIsDialog,
		getIsShop,
		getIsPaused,
		getIsShielding,
		setIsShielding,
		// HUD
		updateHud,
		pulse,
		updateDungeonHud,
		updateShieldHud,
		// ダイアログ
		startDialog,
		showDialogLine,
		advanceDialog,
		openDialog,
		// ポーズ
		togglePause,
		renderPauseMenu,
		renderPauseDungeonMap,
		pauseSelectPrev,
		pauseSelectNext,
		// ショップ
		openShop,
		closeShop,
		renderShop,
		shopSelectPrev,
		shopSelectNext,
		shopBuy,
	};
}
