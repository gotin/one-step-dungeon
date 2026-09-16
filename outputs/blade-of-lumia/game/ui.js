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
// field の地図（キュー15）の色。エディタのワールドマップのサムネと**同じ関数**を呼ぶ
// ＝ユーザー判定済み（キュー11c）の見え方がそのまま出て、絵の食い違いが構造的に起きない。
import { cellGlanceColor } from '../shared/cell-appearance.js';
// 目的地マーク（キュー16）＝会話が教えた場所を地図に残し、選択中の1つを HUD で指す。
import { markId, markColor, markGuide, addMark, normalizeDialogMarks, normalizeSavedMarks } from '../shared/marks.js';
// Dn 踏破後台詞の選択規則（17-0 → 2026-09-15 に改訂）＝版の並びと種類は
// `shared/dialog-variants.js` が単一の真実。「条件がヒットした版のうち**一番下**を採る」。
import { variantOptions, readEntryVariants, VARIANT_KIND } from '../shared/dialog-variants.js';

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
	// ポーズのマーク一覧の並び（先頭は '' ＝選択なし＝矢印を消す行）。↑↓ がこの並びを回す。
	// ⚠️ **一覧を描いたときだけ入り、隠したら空にする**（2026-09-15 にモードを廃止した＝
	// ↑↓ が常に生きている∴並びが残っていると、一覧が出ていない層で裏の印が動く）。
	let pauseMarkIds  = [];
	// 会話が教えるマークは**読み終えたとき**に足す（開いた瞬間だと読み飛ばしても
	// 手に入る＝「教わった」感が無い）∴会話中は保留しておく。
	let pendingDialogMarks = [];

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
	const pauseMapLabelEl  = document.getElementById('pause-map-label');
	const pauseMapHereEl   = document.getElementById('pause-map-here');
	const pauseMapMarkSelEl= document.getElementById('pause-map-marksel');
	const pauseMarkListEl  = document.getElementById('pause-mark-list');
	const markGuideEl      = document.getElementById('hud-mark-guide');
	const markGuideDotEl   = document.getElementById('hud-mark-dot');
	const markGuideLabelEl = document.getElementById('hud-mark-label');
	const markGuideArrowEl = document.getElementById('hud-mark-arrow');
	const markGuideDistEl  = document.getElementById('hud-mark-dist');
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
		// 画面が変われば方向と残り画面数も変わる∴HUD の更新に相乗りする（キュー16）。
		// enterStage() は updateHud() を必ず通る＝遷移のたびに呼び直される。
		updateMarkGuide();
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

	// ── 目的地マーク（キュー16）────────────────────────────────
	// 「今どこ」はキュー15 の地図が解いた。ここが解くのは「次どこ」。
	// 置き場所＝`player.mapMarks`（配列）＋`player.selectedMarkId`（層:画面）。
	// ⚠️ Set ではなく配列とプレーン文字列にする＝game.js saveGame() は player を
	//    `{ ...player }` で丸ごと直列化する∴Set を持たせると保存で {} に潰れる
	//    （defeatedBosses が専用の変換を持っているのはそのため）。

	// 地図を持っている層だけがマークを見せる（地図が無いのに矢印だけ出るのは変）。
	function hasLayerMap(lk) { return !!getPlayer().dungeonItems?.[lk]?.hasMap; }

	function getMarks() {
		const player = getPlayer();
		// 壊れたセーブ（旧形式・手で書いた値）はここで一度だけ掃除する。
		if (!Array.isArray(player.mapMarks)) player.mapMarks = [];
		return player.mapMarks;
	}

	/** 今いる層のマークだけを並べる（層をまたいだ矢印は方向が意味を持たない） */
	function marksInLayer(lk) {
		return getMarks().filter(m => m.layer === lk);
	}

	function getSelectedMark() {
		const player = getPlayer();
		const id = player.selectedMarkId ?? '';
		if (!id) return null;
		return getMarks().find(m => markId(m.layer, m.stage) === id) ?? null;
	}

	/**
	 * HUD の方向表示を描き直す（選択中マークが今いる層に無いときは出さない）。
	 * 呼ばれ方＝updateHud()（画面遷移でも必ず通る）＋マーク選択の変更時。
	 */
	function updateMarkGuide() {
		if (!markGuideEl) return;
		const lk   = getCurrentLayer();
		const mark = getSelectedMark();
		const guide = (mark && mark.layer === lk && hasLayerMap(lk))
			? markGuide(getStageKey(), mark.stage)
			: null;
		if (!guide) { markGuideEl.classList.add('hidden'); return; }
		markGuideDotEl.style.background = markColor(mark.kind);
		markGuideLabelEl.textContent    = mark.label;
		markGuideArrowEl.textContent    = guide.arrow;
		// ⚠️ 距離は**数字で出さない**（キュー22）＝矢印の大きさ・太さ・明るさが段を表す。
		// 段の切り方は shared/marks.js・見た目の値は CSS の `.mark-dist-*` が持つ。
		markGuideArrowEl.className      = `mark-dist-${guide.band}`;
		markGuideDistEl.textContent     = guide.here ? 'この画面' : '';
		markGuideEl.classList.remove('hidden');
	}

	/**
	 * 会話が教えたマークを player に足す（会話を読み終えた時に呼ぶ）。
	 * 行き先が実在しない画面ならデータの書き間違い∴警告して捨てる（無言で消さない）。
	 * @returns {number} 新しく足した件数
	 */
	function commitDialogMarks() {
		const list = pendingDialogMarks;
		pendingDialogMarks = [];
		if (!list.length) return 0;
		const player  = getPlayer();
		const mapData = getMapData();
		const marks   = getMarks();
		let added = 0;
		let lastLabel = '';
		for (const m of list) {
			if (!mapData?.layers?.[m.layer]?.stages?.[m.stage]) {
				console.warn(`[marks] 行き先が実在しない: ${m.layer}/${m.stage}（${m.label}）`);
				continue;
			}
			if (addMark(marks, m)) { added++; lastLabel = m.label; }
			// 初めてのマークは自動で選択する（1つしか無いのに選ばせる意味が無い）
			if (!player.selectedMarkId) player.selectedMarkId = markId(m.layer, m.stage);
		}
		if (added) {
			// 地図を持っていないときは黙る＝「地図に記した」が嘘になる（記録自体は残す
			// ∴後で地図を拾えばちゃんと出る）。
			if (hasLayerMap(getCurrentLayer())) {
				pulse(added === 1 ? `{{map}} 地図に「${lastLabel}」を記した！` : `{{map}} 地図に ${added} か所を記した！`);
			}
			updateMarkGuide();
			saveGame();
		}
		return added;
	}

	// ⚠️ モード（Tab でアイテム欄と一覧を往復するフォーカス）は廃止した（2026-09-15 ユーザー決定）。
	// ←→＝アイテム／↑↓＝目的地マークで**常に両方が生きている**＝「今どっちのモードか」が
	// 存在しない∴迷わない。旧 `pauseToggleFocus()` と `pauseFocus` は削除。
	function pauseMarkStep(delta) {
		// 一覧が出ていない層（ダンジョン＝部屋グリッド）では ↑↓ を無反応にする。
		// pauseMarkIds は一覧を描いたときだけ入る＝隠したら空にする（別の層の印を裏で動かさない）。
		if (pauseMarkIds.length <= 1) return;
		const player = getPlayer();
		const cur = pauseMarkIds.indexOf(player.selectedMarkId ?? '');
		const idx = ((cur < 0 ? 0 : cur) + delta + pauseMarkIds.length) % pauseMarkIds.length;
		player.selectedMarkId = pauseMarkIds[idx];
		playSound('switch');
		updateMarkGuide();
		saveGame();
		renderPauseMenu();
	}

	function pauseMarkPrev() { pauseMarkStep(-1); }
	function pauseMarkNext() { pauseMarkStep(1); }

	// ── ダイアログ ────────────────────────────────────────────
	// 台詞とマークの選択規則（2026-09-15 に1本へ統一＝ユーザー決定「エディタで条件がヒットした
	// もののうち下にあるものほど優先。そうすればセリフの内容によってどちらを優先したいのか
	// 設計することができる」）＝
	//   **その会話が持つ版を上から見て、条件がヒットした版で上書きしていく＝最後に残るのが
	//     「一番下でヒットした版」。** 並び＝`readEntryVariants()` が返す順（＝データのキーの順
	//     ＝エディタの版パネルの上下そのまま）∴**並びをここに書き写さない**（2026-09-15＝会話
	//     ごとに並べ替えられるようにした＝ユーザー指示「エディタの版は上下の順番を変更できる
	//     UIも必要」）。`variantOptions(map)` は種類（印を持てるか）と表示名を引くために渡す。
	// 条件のヒットは版ごとに独立＝「その版のボスを倒したか」だけを見る（旧規則は削除済みの
	// `latestDefeatedBossType()` で**版を1つに絞ってから**探したので、絞った先に版が無いと
	// 基本の台詞へ落ちた＝本編8体を倒した後に寄道の魔将を倒すと台詞が序盤へ巻き戻る原因。
	// 新規則では寄道の版を持たない相手では**その上の本編の版が残る**∴巻き戻らない）。
	// 台詞とマークは同じ並びを同じ順で辿る＝本文が次の行き先を名指しするとき記されるマークが
	// その行き先とズレない。⚠️ 「版に印が無い」ときは**その上でヒットした印**が残る（最後に
	// 教わった行き先を保つ）＝印を打ち消す表現はデータの形に無い。
	// NPC タイル（startDialog）・看板タイル（game.js の openSignDialog）の両方から呼ぶ
	// ＝看板タイルは startDialog を通らないため、ここでは呼ばず game.js 側が直接呼ぶ。
	function pickDialogVariant(data, player, map) {
		const defeated    = player?.defeatedBosses;
		const hasDefeated = (defeated?.size ?? 0) > 0;
		const hasSeenBoss = (player?.triforceCount ?? 0) > 0;

		let lines = null;
		let mark  = null;
		for (const v of readEntryVariants(data, variantOptions(map))) {
			let hit;
			if (v.kind === VARIANT_KIND.AFTER)        hit = hasSeenBoss;
			else if (v.kind === VARIANT_KIND.DEFAULT) hit = hasDefeated;
			else                                      hit = !!defeated?.has(v.key);
			if (!hit) continue;
			if (v.lines.length) lines = v.lines;
			// `linesAfter` の版は印を持てない（データに置き場が無い）∴`mark` は最初から null。
			if (v.mark) mark = v.mark;
		}
		if (!lines) lines = data.lines ?? ['…'];
		if (!mark)  mark  = data.mark ?? null;

		return { lines, mark };
	}

	/** 台詞だけが要るとき用の薄い包み（既存の呼び出し元・テストのため残す） */
	function pickDialogLines(data, player, map) {
		return pickDialogVariant(data, player, map).lines;
	}

	function startDialog(r, c, tileChar, stageData, npcDefaultDialog, player) {
		const posKey = `${r},${c}`;
		const data   = stageData.npcData?.[posKey] ?? npcDefaultDialog[tileChar] ?? { name: 'NPC', lines: ['…'] };
		const variant = pickDialogVariant(data, player, getMapData());
		dialogLines = variant.lines;
		dialogLineIdx = 0;
		// キュー16: 会話データの `mark` が教える目的地。ここでは保留するだけで、
		// 記すのは読み終えた時（advanceDialog の閉じる枝）＝話の途中で
		// 「記した！」が会話の後ろに隠れて出てしまうのを避ける。
		// キュー17-2: 進行で本文が変わる相手は `markAfterBoss` でマークも変わる（variant 側で解決済み）。
		pendingDialogMarks = normalizeDialogMarks(variant.mark, getCurrentLayer());
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
			// 閉じた後に呼ぶ＝pulse がそのまま画面に出る（会話中は保留されてしまう）。
			commitDialogMarks();
		} else { showDialogLine(); playSound('talk'); }
	}

	// ダイアログを外部から開く（ヒント・サブアイテム説明など）
	// `mark`＝看板の「教える目的地」（看板は startDialog を通らず game.js から開く）。
	function openDialog(name, lines, mark = null) {
		dialogLines   = lines;
		dialogLineIdx = 0;
		pendingDialogMarks = normalizeDialogMarks(mark, getCurrentLayer());
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
		updatePauseHint();
	}

	// 操作の案内＝**キーと対象の対応をそのまま書く**（2026-09-15 ユーザー決定でモードを廃止）。
	// 一覧が出ていない／印が0件のときだけ ↑↓ の行を出さない（押しても何も起きないキーを案内しない）。
	function updatePauseHint() {
		const hintEl = document.getElementById('pause-hint');
		if (!hintEl) return;
		const hasMarkRows = GLANCE_MAP_LAYERS.has(getCurrentLayer())
			&& hasLayerMap(getCurrentLayer())
			&& marksInLayer(getCurrentLayer()).length > 0;
		hintEl.textContent = hasMarkRows
			? '← → でアイテム　↑ ↓ で目的地　Escape で決定・再開'
			: '← → でアイテム　Escape で決定・再開';
	}

	// ── ポーズ画面の地図 ──────────────────────────────────────────
	// 地図は2系統ある（キュー15・2026-09-13）：
	//   ① 部屋グリッド（ダンジョン）＝1部屋を 24px の四角で描き、通路の点とボスの '!' を足す。
	//   ② 見取り図（field）＝1セル 1px。field は 320画面（16×20）∴①の寸法（1部屋 24+3px）を
	//      掛けると 435×543px・CSS2倍で 870×1086px＝ポーズ枠に収まらない（実測 2026-09-13）。
	//      1画面を 12×10 ドットで描けば全体 192×200px・CSS2倍 384×400px で収まり、
	//      1画面の縦横比は自動的にゲーム画面と同じ 12:10 になる。
	// ⚠️ ②を使うのは field だけ＝**画面が連続した1つの世界を敷き詰めている唯一のレイヤー**。
	//    ダンジョンは部屋が離れていて通路で繋がる∴①の「四角＋通路の点」が情報になる（かつ
	//    ユーザー判定済みの見え方）。ここを「画面数が多いレイヤー」等の条件にすると
	//    test_mechanics（43×2 の検証ステージ置き場）まで巻き込む＝意図しない。
	const GLANCE_MAP_LAYERS = new Set(['field']);
	// 未訪問の画面の色（真っ黒＝行っていない場所は見せない＝探索感を殺さない）。
	const GLANCE_UNVISITED = '#000000';
	// #pause-map-canvas の枠線（overlays.css）の太さ＝現在地マーカーの原点をずらす分。
	const GLANCE_CANVAS_BORDER = 1;

	// 見取り図のオフスクリーン（訪問済みの画面を描き足して持ち回る）。
	// { lk, w, h, canvas, drawn:Set<stageKey> }
	let glanceMapCache = null;

	function renderPauseDungeonMap() {
		const player  = getPlayer();
		const mapData = getMapData();
		const lk = getCurrentLayer();
		const dm = player.dungeonItems?.[lk];
		const hide = () => {
			pauseDungeonMapEl.classList.add('hidden');
			pauseMapHereEl.classList.add('hidden');
			pauseMapMarkSelEl?.classList.add('hidden');
			pauseMarkListEl?.classList.add('hidden');
			// ⚠️ 一覧を隠したら並びも空にする＝↑↓ が**常に生きている**（モード廃止）ので、
			// 消えた一覧の並びが残っていると裏で別の層の印が動く。
			pauseMarkIds = [];
		};
		if (!dm?.hasMap) { hide(); return; }
		const ld = mapData.layers[lk];
		const stages = Object.keys(ld?.stages ?? {});
		if (stages.length === 0) { hide(); return; }
		pauseDungeonMapEl.classList.remove('hidden');
		if (GLANCE_MAP_LAYERS.has(lk)) renderPauseGlanceMap(lk, ld, stages);
		else renderPauseRoomMap(lk, ld, stages, dm);
	}

	// ── ② 見取り図（field）─────────────────────────────────────
	function renderPauseGlanceMap(lk, ld, stages) {
		const stageKey = getStageKey();
		const coords = stages.map(k => k.split(',').map(Number));
		const minX = Math.min(...coords.map(c => c[0]));
		const maxX = Math.max(...coords.map(c => c[0]));
		const minY = Math.min(...coords.map(c => c[1]));
		const maxY = Math.max(...coords.map(c => c[1]));
		const cols = ld.stages[stages[0]].cols;
		const rows = ld.stages[stages[0]].rows;
		const w = (maxX - minX + 1) * cols;
		const h = (maxY - minY + 1) * rows;

		// ⚠️ 全画面ぶんを毎回描き直すと 320画面 × 120セル＝38,400 セルの色決定になり
		//    ポーズを開くたびに詰まる。見取り図が写すのは**実行時に変わらない地形**
		//    （茂みを刈る・扉を開ける等の変化はステージ状態が持つ）∴一度描いた画面は
		//    描き直さない＝訪問が増えたぶんだけ描き足す。
		if (!glanceMapCache || glanceMapCache.lk !== lk || glanceMapCache.w !== w || glanceMapCache.h !== h) {
			const cv = document.createElement('canvas');
			cv.width = w; cv.height = h;
			const c2 = cv.getContext('2d');
			c2.fillStyle = GLANCE_UNVISITED;
			c2.fillRect(0, 0, w, h);
			glanceMapCache = { lk, w, h, canvas: cv, drawn: new Set() };
		}
		const off = glanceMapCache.canvas.getContext('2d');
		for (const sk of stages) {
			if (glanceMapCache.drawn.has(sk)) continue;
			// 未訪問は真っ黒のまま（ダンジョンの地図と同じ作法＝getSS().visited）。
			if (!getSS(lk, sk).visited && sk !== stageKey) continue;
			const sd = ld.stages[sk];
			const [sx, sy] = sk.split(',').map(Number);
			const ox = (sx - minX) * cols, oy = (sy - minY) * rows;
			for (let r = 0; r < sd.rows; r++) {
				for (let c = 0; c < sd.cols; c++) {
					const { base, fg } = cellGlanceColor(sd, r, c, sd.tiles[r][c]);
					off.fillStyle = fg ?? base;
					off.fillRect(ox + c, oy + r, 1, 1);
				}
			}
			glanceMapCache.drawn.add(sk);
		}

		pauseMapCanvasEl.width  = w;
		pauseMapCanvasEl.height = h;
		const ctx = pauseMapCanvasEl.getContext('2d');
		ctx.clearRect(0, 0, w, h);
		ctx.drawImage(glanceMapCache.canvas, 0, 0);

		const scale = glanceMapScale(w, h);
		pauseMapCanvasEl.style.width  = `${w * scale}px`;
		pauseMapCanvasEl.style.height = `${h * scale}px`;

		// 現在地＝白枠＋点滅（点滅は CSS のアニメーション∴ここで時計を回さない）。
		// ⚠️ ダンジョン地図の「現在地を塗り潰す」は流用できない＝field は画面の中身が
		//    絵で埋まっていて、塗ると今いる画面の地形が消える。
		const [curX, curY] = stageKey.split(',').map(Number);
		pauseMapHereEl.style.left   = `${GLANCE_CANVAS_BORDER + (curX - minX) * cols * scale}px`;
		pauseMapHereEl.style.top    = `${GLANCE_CANVAS_BORDER + (curY - minY) * rows * scale}px`;
		pauseMapHereEl.style.width  = `${cols * scale}px`;
		pauseMapHereEl.style.height = `${rows * scale}px`;
		pauseMapHereEl.style.borderWidth = scale >= 2 ? '2px' : '1px';
		pauseMapHereEl.classList.remove('hidden');

		// 目的地マーク（キュー16）＝記号は表示キャンバスへ**上描き**する。
		// ⚠️ オフスクリーン（地形キャッシュ）には描かない＝キャッシュは「実行時に
		//    変わらない地形」だけを持つ約束∴マークを混ぜると消せなくなる。
		drawGlanceMarks(ctx, lk, minX, minY, cols, rows);
		placeSelectedMarkBox(lk, minX, minY, cols, rows, scale);
		renderMarkList(lk);

		if (pauseMapLabelEl) pauseMapLabelEl.textContent = 'ルミア地方の地図';
		// コンパス（ボス部屋あり）は field には無い＝field に bossStage は無い（実測）。
		pauseMapHintEl.classList.add('hidden');
	}

	// 見取り図に描くマークの大きさ（画素＝1セル1px の座標系）。1画面 12×10 に収める。
	const MARK_DOT = 5;

	// マークの記号＝画面の中央に MARK_DOT 角の四角＋暗い縁取り（絵の上でも読める）。
	// ⚠️ 未訪問（真っ黒）の画面にも描く＝行ったことのない場所に印が付くから足が向く
	//    ＝これが「次どこ」への答えの本体（IDEA.md ③）。
	function drawGlanceMarks(ctx, lk, minX, minY, cols, rows) {
		for (const m of marksInLayer(lk)) {
			const [mx, my] = m.stage.split(',').map(Number);
			const cx = (mx - minX) * cols + Math.floor(cols / 2) - Math.floor(MARK_DOT / 2);
			const cy = (my - minY) * rows + Math.floor(rows / 2) - Math.floor(MARK_DOT / 2);
			ctx.fillStyle = '#0a1418';
			ctx.fillRect(cx - 1, cy - 1, MARK_DOT + 2, MARK_DOT + 2);
			ctx.fillStyle = markColor(m.kind);
			ctx.fillRect(cx, cy, MARK_DOT, MARK_DOT);
		}
	}

	// 選択中マークは点滅させる（他は静止）＝現在地と同じ作法で div を重ねる。
	function placeSelectedMarkBox(lk, minX, minY, cols, rows, scale) {
		if (!pauseMapMarkSelEl) return;
		const mark = getSelectedMark();
		if (!mark || mark.layer !== lk) { pauseMapMarkSelEl.classList.add('hidden'); return; }
		const [mx, my] = mark.stage.split(',').map(Number);
		pauseMapMarkSelEl.style.left   = `${GLANCE_CANVAS_BORDER + (mx - minX) * cols * scale}px`;
		pauseMapMarkSelEl.style.top    = `${GLANCE_CANVAS_BORDER + (my - minY) * rows * scale}px`;
		pauseMapMarkSelEl.style.width  = `${cols * scale}px`;
		pauseMapMarkSelEl.style.height = `${rows * scale}px`;
		pauseMapMarkSelEl.style.borderWidth = scale >= 2 ? '2px' : '1px';
		pauseMapMarkSelEl.classList.remove('hidden');
	}

	// マーク一覧（地図の右）。先頭は「（選択なし）」＝矢印を消す行＝**解除の手段**。
	function renderMarkList(lk) {
		if (!pauseMarkListEl) return;
		const player = getPlayer();
		const marks  = marksInLayer(lk);
		pauseMarkListEl.classList.remove('hidden');
		pauseMarkListEl.innerHTML = '';
		pauseMarkIds = ['', ...marks.map(m => markId(m.layer, m.stage))];
		if (!marks.length) {
			pauseMarkIds = [];
			const empty = document.createElement('div');
			empty.id = 'pause-mark-empty';
			empty.textContent = 'マークなし。NPC や看板の話を聞くと目的地が記される。';
			pauseMarkListEl.appendChild(empty);
			return;
		}
		const selId = player.selectedMarkId ?? '';
		const rows = [{ id: '', label: '（選択なし）', kind: null, stage: null }, ...marks.map(m => ({
			id: markId(m.layer, m.stage), label: m.label, kind: m.kind, stage: m.stage,
		}))];
		for (const row of rows) {
			const div = document.createElement('div');
			div.className = `pause-mark-row${row.id === selId ? ' selected' : ''}`;
			const dot = document.createElement('span');
			dot.className = 'pause-mark-dot';
			dot.style.background = row.kind ? markColor(row.kind) : 'transparent';
			if (!row.kind) dot.style.borderColor = 'transparent';
			const name = document.createElement('span');
			name.className = 'pause-mark-name';
			name.textContent = row.label;
			const dist = document.createElement('span');
			const g = row.stage ? markGuide(getStageKey(), row.stage) : null;
			// HUD と同じ段の見た目にする（キュー22）＝一覧に数字を残すと、HUD で隠した
			// 「あと N 画面」がポーズを開くだけで読めてしまう（見取り図の点で位置は分かる∴数字は不要）。
			dist.className = g ? `pause-mark-dist mark-dist-${g.band}` : 'pause-mark-dist';
			dist.textContent = g ? g.arrow : '';
			div.append(dot, name, dist);
			div.addEventListener('click', () => {
				player.selectedMarkId = row.id;
				updateMarkGuide(); saveGame(); renderPauseMenu();
			});
			pauseMarkListEl.appendChild(div);
		}
	}

	// 見取り図の拡大率（整数倍・既定2倍）。窓が低い/狭いときだけ下げる＝ドットが滲まない。
	// 予約分 260px の内訳（実測 2026-09-13・地図なしのポーズ枠は 320×198）＝
	// 見出し 23／アイテム欄 20／ヒント 17／ステータス 56／地図の見出しと余白と枠の padding。
	function glanceMapScale(w, h) {
		const RESERVED_H = 260;
		const availH = (window.innerHeight || 800) - RESERVED_H;
		const availW = (window.innerWidth  || 1280) * 0.9 - 60;
		let s = 2;
		while (s > 1 && (h * s > availH || w * s > availW)) s--;
		return s;
	}

	// ── ① 部屋グリッド（ダンジョン）───────────────────────────────
	function renderPauseRoomMap(lk, ld, stages, dm) {
		const stageKey = getStageKey();
		pauseMapHereEl.classList.add('hidden');
		// マークは見取り図（field）だけの機構＝部屋グリッドには 12×10 ドットの面が無い
		// ∴一覧も選択枠も出さない（キュー16）。
		pauseMapMarkSelEl?.classList.add('hidden');
		pauseMarkListEl?.classList.add('hidden');
		pauseMarkIds = [];
		if (pauseMapLabelEl) pauseMapLabelEl.textContent = 'ダンジョンマップ';
		const hasCompass   = !!dm.hasCompass;
		const bossStageKey = ld?.bossStage ?? null;

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
		pickDialogLines,
		pickDialogVariant,
		// ポーズ
		togglePause,
		renderPauseMenu,
		renderPauseDungeonMap,
		pauseSelectPrev,
		pauseSelectNext,
		// 目的地マーク（キュー16）
		pauseMarkPrev,
		pauseMarkNext,
		updateMarkGuide,
		// ショップ
		openShop,
		closeShop,
		renderShop,
		shopSelectPrev,
		shopSelectNext,
		shopBuy,
	};
}
