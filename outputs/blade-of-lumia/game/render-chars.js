// ── render-chars.js ──────────────────────────────────────────
// Phase 0-2 Step 3: キャラクター絶対配置描画を game.js から切り出し
//
// export: createRenderChars(deps) → { renderChars, addCharEl, moveCharEl, removeCharEl, addShieldOverlay, updatePlayerCharEl }
//
// deps は以下の getter を注入する（全て game.js スコープの可変状態）：
//   getPlayer()       → player
//   getEnemies()      → enemies
//   getCurrentLayer() → currentLayer
//   getStageKey()     → stageKey
//   getStageData()    → stageData
//   getHeroDir()      → heroDir
//   getSS(lk, sk)     → ステージ状態オブジェクト
//   getCellPx()       → セルサイズ (px)
//   charLayerElRef    → { value: HTMLElement|null } ラッパー（render-board が更新）
//   getHeroSpriteName() → 'heroD' | 'heroR' | 'heroU'（攻撃中は 'heroDAtk' 等）
//   getHeroPalName()    → 'hero' | 'princess'
//   getGameNow()        → 論理時間（攻撃ポーズ中は盾を描かない判定に使う）
//
// TILE / SPRITES / PAL / ENEMY_META / makeSprite は直接 import する。

import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL, makeSprite } from '../shared/sprites.js';
import { ENEMY_META } from '../shared/enemies.js';
import { SHIELD_TIERS } from '../shared/items.js';

/**
 * キャラクター描画関数群を生成して返す factory。
 * @param {object} deps
 * @param {()=>object}  deps.getPlayer
 * @param {()=>Array}   deps.getEnemies
 * @param {()=>string}  deps.getCurrentLayer
 * @param {()=>string}  deps.getStageKey
 * @param {()=>object}  deps.getStageData
 * @param {()=>string}  deps.getHeroDir
 * @param {(lk,sk)=>object} deps.getSS
 * @param {()=>number}  deps.getCellPx
 * @param {{value:HTMLElement|null}} deps.charLayerElRef
 * @param {()=>string}  deps.getHeroSpriteName
 * @param {()=>string}  deps.getHeroPalName
 */
export function createRenderChars(deps) {
	const {
		getPlayer,
		getEnemies,
		getCurrentLayer,
		getStageKey,
		getStageData,
		getHeroDir,
		getSS,
		getCellPx,
		charLayerElRef,
		getHeroSpriteName,
		getHeroPalName,
		getGameNow,
		getIsDashing,
		ladderOrientationAt,
	} = deps;

	// 石の canvas を描画するヘルパー（stoneDiv に追加する）
	function makeStoneCanvas(cellPx) {
		// 石は 32 ドットに描き直した（10d-1）＝canvas はセル全面。絵の中に透明の余白が
		// あるので見かけは従来（0.7 セル）のまま。ここを 0.7 倍にすると、盤面に置かれた
		// 石（render-board.js の .dot32）より小さい石が動く＝押した瞬間に石が縮む。
		const stSize = Math.round(cellPx) + 'px';
		const cv = document.createElement('canvas');
		cv.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${stSize};height:${stSize};image-rendering:pixelated;`;
		const frames = SPRITES['block'];
		const pal    = PAL['block'];
		if (frames && pal) {
			const grid = frames[0];
			cv.width   = grid[0].length;
			cv.height  = grid.length;
			const ctx  = cv.getContext('2d');
			for (let r = 0; r < grid.length; r++) {
				for (let c = 0; c < grid[r].length; c++) {
					const idx = grid[r][c];
					if (idx === 0) continue;
					ctx.fillStyle = pal[idx] ?? 'transparent';
					ctx.fillRect(c, r, 1, 1);
				}
			}
		}
		return cv;
	}

	// スイッチグローオーバーレイを stoneDiv に追加するヘルパー
	function addStoneGlow(div) {
		const glow = document.createElement('div');
		glow.style.cssText = 'position:absolute;inset:0;background:rgba(80,255,100,0.38);border-radius:3px;box-shadow:0 0 8px 4px rgba(60,255,80,0.6);pointer-events:none;z-index:5;animation:stone-glow 1.2s ease-in-out infinite;';
		div.appendChild(glow);
	}

	// Phase 4.56: ロック済みの石は「固定された感」を静的に見せる（動かせないことが分かるように）。
	function addStoneLockedMark(div) {
		div.style.filter = 'brightness(1.15) saturate(0.4)';
		const mark = document.createElement('div');
		mark.style.cssText = 'position:absolute;inset:0;border:2px solid rgba(255,230,140,0.8);border-radius:3px;box-shadow:0 0 4px 2px rgba(255,230,140,0.4);pointer-events:none;z-index:5;';
		div.appendChild(mark);
	}

	// ── 大型敵（w×h）の見た目サイズを適用（Phase 3-2）─────────
	// wrapper（.char-abs）は既定で 1セル四方。w×h 敵はそれを拡げ、
	// 内部 canvas を wrapper 全面に追従させる（CSS の 1セル !important を上書き）。
	function applyEnemySize(wrapper, e, cellPx) {
		const w = e.w ?? 1, h = e.h ?? 1;
		if (w === 1 && h === 1) return;
		wrapper.style.width  = `${w * cellPx}px`;
		wrapper.style.height = `${h * cellPx}px`;
		wrapper.style.zIndex = '6';  // 通常キャラより前面に
		wrapper.classList.add('large-enemy');  // 重々しい揺れアニメ（board.css）
		const cv = wrapper.querySelector('canvas.sprite');
		if (cv) {
			cv.style.setProperty('width',  '100%', 'important');
			cv.style.setProperty('height', '100%', 'important');
		}
	}

	// ── 盾オーバーレイ ───────────────────────────────────────
	// プレイヤーは左利き（初代ゼルダと同じ）＝**盾は右手・剣は左手**。
	// 規則は1つだけ：
	//   待機中＝盾は「向いている方向（正面）」に構える。
	//   攻撃中＝盾がプレイヤーの右手側へ回る（ワールドで 90°）。
	// ∴ 攻撃中に我々に見える面は「プレイヤーの右がカメラに対してどこを向くか」で決まる：
	//   下向き … 右＝我々の左  → 側面が見える（我々の左に置く）
	//   上向き … 右＝我々の右  → 側面が見える（我々の右に置く）
	//   右向き … 右＝カメラ側  → **正面**が見える（手前＝下寄り・プレイヤーより前）
	//   左向き … 右＝奥        → 裏面が見える（奥＝上寄り・プレイヤーより後ろでプレイヤーが重なる）
	// 位置とサイズはセル単位（.char-abs は 1 セル四方）。zi は z-index。
	// 横向き（right/left）は**右手の位置が盾の中心**になるよう置く。左利き＝剣を持つ
	// 左手が進行方向へ伸びる∴右手は必ず「後ろ側」に残る：
	//   右向き … 右手＝我々から見て左（heroR の col 10・row 24 の手）→ 中心 (0.33, 0.77)
	//   左向き … その左右反転（col 21）                              → 中心 (0.67, 0.77)
	// Phase 10d-3: 'shield' の絵を32ドット化した際、絵の中の透明余白が増えた分だけ
	// 固定セル比の箱（cellPx*定数）に入れると見かけが縮む。旧見かけ＝旧ink比(0.875/1.0)
	// を新ink比(0.469/0.594) で割り直した値の平均＝約1.78（`.scratch/proto-10d3.mjs` で算出）。
	const SHIELD_32_SCALE = 1.78;
	// Phase 10d-4: 'shieldSide'/'shieldBack' も32ドット化＝同じ理由で個別に補正係数が
	// 要る（形が違う＝旧ink比からの拡大率も違う）。算出は `.scratch/proto-10d4.mjs`。
	// Phase 10d-5: shieldSide を両凸→片凸に描き直した際に ink が 17×21→12×21 に
	// 変わった（幅だけ縮んだ）＝拡大係数を再計算（旧ink比(0.75/1.0) を新ink比
	// (0.375/0.656) で割った値の平均＝約1.76）。shieldBack は ink 不変＝係数も不変。
	const SHIELD_SIDE_32_SCALE = 1.76;
	// shieldBack: 旧ink比(0.875/1.0) を新ink比(0.531/0.594) で割った値の平均＝約1.67。
	const SHIELD_BACK_32_SCALE = 1.67;
	// down/up/left は x/y が箱の左上原点＝拡大した分だけ中心が右下へ流れる。
	// 旧中心（x+w/2, y+h/2）を保つよう新しい x/y = 旧中心 - 新w/h/2 を計算し直した
	// （right は元コードのとおり既に半分戻し済みの値が入っている）。
	// ⚠️ shieldSide は 10d-5 で片凸（表面側だけ凸）に描き直した＝flipX は絵の
	// 凹凸まで反転させてしまう（左右対称だった旧絵の時代は無害だった副作用）。
	// ❌ 失効（2026-09-09・ユーザー実プレイ指摘「下向き攻撃の凹凸がまだ逆・上向きは
	// 正しい」）＝down/up を同じ flipX にすれば揃うと考えたのは誤り。盾の配置位置が
	// down は画面左（キャラより左）・up は画面右（キャラより右）と逆なので、同じ
	// flipX だと「内側が凸」と「外側が凸」が入れ替わってしまう。✅ 正しい規則＝
	// **常に「キャラから離れる側（外側）」が凸になるよう配置位置に応じて flipX を
	// 決める**（up は元の絵のまま=凸が画面右=外側で正しかった／down は配置が画面
	// 左なので絵を反転して凸を画面左=外側に持ってくる必要がある）。
	const SHIELD_ATK_GEO = {
		down:  { spr: 'shieldSide', flipX: true,  x: 0.095, y: 0.293, w: 0.17 * SHIELD_SIDE_32_SCALE, h: 0.44 * SHIELD_SIDE_32_SCALE, zi: '4'  },
		up:    { spr: 'shieldSide', flipX: false, x: 0.615, y: 0.333, w: 0.17 * SHIELD_SIDE_32_SCALE, h: 0.44 * SHIELD_SIDE_32_SCALE, zi: '4'  },
		// 右向きは盾の正面がカメラ側を向く＝プレイヤーより前面（zi 5）に置く。
		// w/h は SHIELD_32_SCALE 分だけ拡大し、x/y は中心が動かないよう半分だけ戻す。
		right: { spr: 'shield',     flipX: false, x: 0.063, y: 0.503, w: 0.30 * SHIELD_32_SCALE, h: 0.30 * SHIELD_32_SCALE, zi: '5'  },
		// 左向きは右手が奥＝盾の裏面が見え、プレイヤーが上に重なる（zi -1）。
		left:  { spr: 'shieldBack', flipX: false, x: 0.386, y: 0.590, w: 0.34 * SHIELD_BACK_32_SCALE, h: 0.21 * SHIELD_BACK_32_SCALE, zi: '-1' },
	};

	// 盾 canvas を作って共通の属性を付ける（テストから配色/ティアを観測するため）
	function makeShieldCanvas(spriteName, flipX) {
		const player  = getPlayer();
		// Phase 5.5g3: 装備している盾のティアで色を変える（形状は共通）。
		// SHIELD_TIERS[].pal＝'shieldWood'/'shieldIron'/'shieldMirror'。
		const palName = SHIELD_TIERS[player.shieldTier]?.pal ?? 'shield';
		const cv = makeSprite(spriteName, palName, false, flipX);
		if (!cv) return null;
		cv.classList.add('shield-overlay');
		cv.dataset.pal        = palName;
		cv.dataset.shieldTier = String(player.shieldTier ?? -1);
		cv.dataset.shieldSpr  = spriteName;   // どの面が見えているか（正面/側面/裏面）
		cv.style.position       = 'absolute';
		cv.style.imageRendering = 'pixelated';
		cv.style.pointerEvents  = 'none';
		cv.style.transform      = 'none';
		return cv;
	}

	// 攻撃中の盾＝右手側へ回った盾を1枚置く（上の SHIELD_ATK_GEO のとおり）
	function addShieldOverlayAttacking(div, heroDir) {
		const geo = SHIELD_ATK_GEO[heroDir] ?? SHIELD_ATK_GEO.down;
		const cv  = makeShieldCanvas(geo.spr, geo.flipX);
		if (!cv) return;
		const cellPx = getCellPx();
		cv.dataset.shieldState = 'attack';
		cv.style.setProperty('width',  `${Math.round(geo.w * cellPx)}px`, 'important');
		cv.style.setProperty('height', `${Math.round(geo.h * cellPx)}px`, 'important');
		cv.style.setProperty('z-index', geo.zi, 'important');
		cv.style.left = `${Math.round(geo.x * cellPx)}px`;
		cv.style.top  = `${Math.round(geo.y * cellPx)}px`;
		div.appendChild(cv);
	}

	function addShieldOverlay(div) {
		const player  = getPlayer();
		const heroDir = getHeroDir();
		if (!player.shield) return;
		// 攻撃中（剣を構えている間）は盾が右手側へ回る＝別の配置表を使う。
		// 判定は論理時間（_atkUntil）＝盾の防御が無効になる窓と同じ1つの窓を見る
		// （見た目と当たり判定が食い違わないように・projectile.js isShieldActive）。
		if (player._atkUntil != null && getGameNow?.() < player._atkUntil) {
			addShieldOverlayAttacking(div, heroDir);
			return;
		}

		let spriteName = 'shield';
		let flipX = false;
		if (heroDir === 'right') { spriteName = 'shieldSide'; }
		else if (heroDir === 'left') { spriteName = 'shieldSide'; flipX = true; }
		// Phase 10d-5: 上向き待機は「盾を正面に構えた背中側」＝我々には裏面が見える
		// はず（ユーザー指摘＝「裏側が見えているはずなのに表と同じデザイン」）。
		// z-index -1（体の後ろ）に置く配置は元から正しかったが、絵が正面 shield の
		// ままだったため十字紋章が透けて見えていた＝shieldBack に変更する。
		else if (heroDir === 'up') { spriteName = 'shieldBack'; }

		// 未所持（shieldTier=-1）は上の !player.shield で return 済み。
		const cv = makeShieldCanvas(spriteName, flipX);
		if (!cv) return;
		cv.dataset.shieldState = 'idle';
		const cellPx = getCellPx();

		if (heroDir === 'down') {
			// Phase 10d-3: SHIELD_32_SCALE 分だけ箱を拡大し、中心が動かないよう
			// left/top を半分だけ戻す（0.40→0.712・左上原点なので -(delta/2)）。
			const sz = Math.round(cellPx * 0.40 * SHIELD_32_SCALE) + 'px';
			cv.style.setProperty('width',  sz, 'important');
			cv.style.setProperty('height', sz, 'important');
			cv.style.zIndex = '4';
			cv.style.left   = `${Math.round(cellPx * -0.076 + 1)}px`;
			cv.style.top    = `${Math.round(cellPx * 0.324 + 1)}px`;
			cv.style.transform = 'none';
		} else if (heroDir === 'right') {
			// Phase 10d-4: SHIELD_SIDE_32_SCALE 分だけ箱を拡大。right:7px（グリップ側の
			// 縁）は元のまま＝そこから外側へ広がるのは自然（右手位置は動かさない）。
			// top:50% は「上端」基準なので、高さが伸びた分だけ上へ戻して縦の中心を保つ。
			const w = Math.round(cellPx * 0.17 * SHIELD_SIDE_32_SCALE) + 'px';
			const h = Math.round(cellPx * 0.44 * SHIELD_SIDE_32_SCALE) + 'px';
			cv.style.setProperty('width',  w, 'important');
			cv.style.setProperty('height', h, 'important');
			cv.style.zIndex = '4';
			cv.style.right  = '7px';
			cv.style.left   = 'auto';
			cv.style.top    = `calc(50% - ${Math.round(cellPx * 0.22 * (SHIELD_SIDE_32_SCALE - 1))}px)`;
			cv.style.transform = 'none';
		} else if (heroDir === 'left') {
			const w = Math.round(cellPx * 0.17 * SHIELD_SIDE_32_SCALE) + 'px';
			const h = Math.round(cellPx * 0.44 * SHIELD_SIDE_32_SCALE) + 'px';
			cv.style.setProperty('width',  w, 'important');
			cv.style.setProperty('height', h, 'important');
			cv.style.zIndex = '4';
			cv.style.left   = '7px';
			cv.style.top    = `calc(50% - ${Math.round(cellPx * 0.22 * (SHIELD_SIDE_32_SCALE - 1))}px)`;
			cv.style.transform = 'none';
		} else {
			// Phase 10d-5: 上向き待機は shieldBack を使う（上のコメント参照）＝
			// 箱の拡大係数も SHIELD_BACK_32_SCALE に変更（SHIELD_32_SCALE は
			// shieldGrid 専用）。right 基準の座標なので中心を保つには right 側の
			// オフセットを半分だけ減らす（元の考え方は 10d-3 時点のコメントのまま）。
			const sz = Math.round(cellPx * 0.34 * SHIELD_BACK_32_SCALE) + 'px';
			cv.style.setProperty('width',  sz, 'important');
			cv.style.setProperty('height', sz, 'important');
			cv.style.setProperty('z-index', '-1', 'important');
			const rPx  = Math.round(cellPx * -0.0525) - 3;
			const tPct = Math.round(cellPx * 0.3175 + 4);
			cv.style.right  = `${rPx + 4}px`;
			cv.style.left   = 'auto';
			cv.style.top    = `${tPct + 3}px`;
			cv.style.opacity = '1';
			cv.style.transform = 'none';
		}
		div.appendChild(cv);
	}

	// ── プレイヤースプライト差し替え ─────────────────────────
	function updatePlayerCharEl() {
		const heroDir = getHeroDir();
		const el = document.getElementById('char-player');
		if (!el) return;
		el.classList.toggle('flying', !!getPlayer().flying);
		// 疾風の靴で走っている間は位置の補間を tick の長さに伸ばす（board.css `#char-player.dashing`）
		// ＝毎 tick 1マス進む動きが「動いて止まる」でなく流れて見える。見た目だけ＝判定は触らない。
		el.classList.toggle('dashing', !!getIsDashing?.());
		// Phase 5.5k k-7: 一時デバフ（剣封じ・毒）を画面に出す（GUIDE §6-1＝
		// 絵は機構を読ませるためにある。「剣が出ない」だけではバグに見える）。
		// 窓は論理時間∴gameNow と比べる（addShieldOverlay の _atkUntil と同じ作法）。
		const _p = getPlayer();
		const _now = getGameNow?.() ?? 0;
		el.classList.toggle('sealed',   _p._sealUntil   != null && _now < _p._sealUntil);
		el.classList.toggle('poisoned', _p._poisonUntil != null && _now < _p._poisonUntil);
		el.innerHTML = '';

		if (heroDir === 'up') addShieldOverlay(el);

		const spr   = getHeroSpriteName();
		const flipX = heroDir === 'left';
		const cv    = makeSprite(spr, getHeroPalName(), true, flipX);
		if (cv) el.appendChild(cv);

		if (heroDir !== 'up') addShieldOverlay(el);

		// Phase 4-1b: 渡っている最中だけ、足元の水/穴セルにはしごを敷き直す
		updateLadderOverlay();
	}

	// ── はしごオーバーレイ（初代ゼルダ式：渡っている最中だけ足元に出る）───
	// プレイヤー要素には入れない（追従させない）。char-layer に「セル固定」の
	// 別要素として置き、プレイヤーが今乗っている水/穴の橋セルに「1枚だけ」敷く。
	// 渡り切って陸セルだけになれば自然に消える（毎回作り直すため）。
	// Phase 4-1c 修正：
	//   ① 半セル位置で2セルに跨るとき両方に出ていた → プレイヤー中心に最も近い橋セル1枚に限定。
	//   ② 向きは「進入軸（プレイヤーがそのセルへ入ってきた方向の軸）」で決める。
	//      ただし live な heroDir を使うと「上で向きを変える＝向きが変わる／消える」副作用が
	//      出るため、player._ladderAxis（実際に移動できたときだけ更新される軸）をラッチして使う。
	//      → 下から/上から入れば縦はしご、左右から入れば横はしご。向きだけ変えても変わらない。
	//   ③ 進入軸の橋でないセル（例：縦移動で入った横橋しか成立しないセル）は通行判定で弾かれ
	//      乗れないので、ここでは「乗っている橋セルにラッチ軸で描く」だけでよい。
	// z-index は -1＝セル描画より上・プレイヤー/敵（char-abs）より下。
	function updateLadderOverlay() {
		const charLayerEl = charLayerElRef.value;
		if (!charLayerEl) return;
		// 既存のオーバーレイを除去（毎回敷き直す＝渡り切れば消える）
		charLayerEl.querySelectorAll('.char-ladder').forEach(e => e.remove());

		const player = getPlayer();
		if (!player.hasLadder || !ladderOrientationAt) return;
		const stageData = getStageData();
		if (!stageData) return;

		// 進入軸をラッチ値から取得（実際に移動できたときだけ更新される）。
		// 未設定なら null＝セルの地形で向きを決める（フォールバック）。
		const axis = player._ladderAxis ?? null;

		const cellPx = getCellPx();
		// プレイヤーが重なっているセル範囲（0.5 刻み移動で2セルに跨る）
		const c0 = Math.floor(player.x), c1 = Math.floor(player.x + 0.999);
		const r0 = Math.floor(player.y), r1 = Math.floor(player.y + 0.999);
		// プレイヤー中心（セルは 1×1 なので中心は +0.5）
		const pcx = player.x + 0.5, pcy = player.y + 0.5;

		// 跨っている水/穴の橋セルのうち、プレイヤー中心に最も近い1枚だけを選ぶ。
		// 距離が同じ（上下に均等に跨る）ときは「下側のセル」を選ぶ。
		// 上側を選ぶとキャラの足元が水のまま見え、水の上に浮いて見えてしまうため。
		// 向きは「進入軸（axis）」で決める＝下/上から入れば縦・左右から入れば横。
		const EPS = 1e-6;
		let best = null, bestDist = Infinity;
		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				const t = stageData.tiles[r]?.[c];
				// Phase 9-6: 水は tiles 層でも bgTiles 下地でもよい（水の単一ソース化で
				// 湖/海/堀は bgTiles '~' に移行済み）。tiles 水/穴 または bgTiles 水を橋対象にする。
				// 溶岩ははしごで渡れないので対象外（TILE.LAVA は含めない）。
				const isBgWater = stageData.bgTiles?.[`${r},${c}`] === TILE.WATER;
				if (t !== TILE.WATER && t !== TILE.PIT && !isBgWater) continue;
				const orient = ladderOrientationAt(r, c, axis);  // 進入軸で向き決定
				if (!orient) continue;  // 進入軸の橋でない水/穴には出さない
				const d = (c + 0.5 - pcx) ** 2 + (r + 0.5 - pcy) ** 2;
				// より近い、または「ほぼ同距離なら下側（r が大きい方）」を優先
				if (d < bestDist - EPS || (Math.abs(d - bestDist) <= EPS && best && r > best.r)) {
					bestDist = d; best = { r, c, orient };
				}
			}
		}
		if (!best) return;

		const div = document.createElement('div');
		div.className = 'char-abs char-ladder';
		div.dataset.orient = best.orient;  // 'h' / 'v'（テスト・デバッグ用）
		div.style.left = `${best.c * cellPx}px`;
		div.style.top  = `${best.r * cellPx}px`;
		div.style.transition = 'none';   // セル固定（スライドさせない）
		div.style.zIndex = '-1';          // セルより上・プレイヤー/敵より下
		const cv = makeSprite(best.orient === 'h' ? 'ladderH' : 'ladderV', 'ladder', false);
		if (cv) { cv.classList.add('ladder-sprite'); div.appendChild(cv); }
		charLayerEl.appendChild(div);
	}

	// ── float 座標にキャラ要素を配置して返す ──────────────────
	function addCharEl(x, y, id, makeSpriteFn) {
		const charLayerEl = charLayerElRef.value;
		if (!charLayerEl) return null;
		const cellPx = getCellPx();
		const div    = document.createElement('div');
		div.className = 'char-abs';
		div.id        = `char-${id}`;
		div.style.left = `${x * cellPx}px`;
		div.style.top  = `${y * cellPx}px`;
		const cv = makeSpriteFn();
		if (cv) div.appendChild(cv);
		charLayerEl.appendChild(div);
		return div;
	}

	// ── 既存キャラ要素の位置だけ更新 ─────────────────────────
	function moveCharEl(id, x, y) {
		const el = document.getElementById(`char-${id}`);
		if (!el) return;
		const cellPx   = getCellPx();
		el.style.left  = `${x * cellPx}px`;
		el.style.top   = `${y * cellPx}px`;
	}

	// ── キャラ要素を削除 ──────────────────────────────────────
	function removeCharEl(id) {
		const el = document.getElementById(`char-${id}`);
		if (el) el.remove();
	}

	// ── キャラクター全体の再描画 ──────────────────────────────
	function renderChars() {
		const charLayerEl  = charLayerElRef.value;
		if (!charLayerEl) return;
		charLayerEl.innerHTML = '';

		const player       = getPlayer();
		const heroDir      = getHeroDir();
		const currentLayer = getCurrentLayer();
		const stageKey     = getStageKey();
		const stageData    = getStageData();
		const enemies      = getEnemies();
		const cellPx0      = getCellPx();

		// プレイヤー
		const playerDiv = document.createElement('div');
		playerDiv.className = 'char-abs' + (player.flying ? ' flying' : '');
		playerDiv.id        = 'char-player';
		playerDiv.style.left = `${player.x * cellPx0}px`;
		playerDiv.style.top  = `${player.y * cellPx0}px`;
		charLayerEl.appendChild(playerDiv);

		if (heroDir === 'up') addShieldOverlay(playerDiv);
		const heroSpr  = getHeroSpriteName();
		const heroFlip = heroDir === 'left';
		const heroCv   = makeSprite(heroSpr, getHeroPalName(), true, heroFlip);
		if (heroCv) playerDiv.appendChild(heroCv);
		if (heroDir !== 'up') addShieldOverlay(playerDiv);

		// Phase 4-1b: 渡っている最中だけ足元の水/穴セルにはしごを敷く（プレイヤー非追従）
		updateLadderOverlay();

		// 移動済みの石を描画
		{
			const ss = getSS(currentLayer, stageKey);
			const cellPxSt = getCellPx();
			for (const [origKey, st] of Object.entries(ss.stonePositions ?? {})) {
				const stDiv = document.createElement('div');
				stDiv.className = 'char-abs';
				stDiv.id = `char-stone-${origKey.replace(',', '-')}`;
				stDiv.style.left   = `${st.c * cellPxSt}px`;
				stDiv.style.top    = `${st.r * cellPxSt}px`;
				stDiv.style.zIndex = '1';
				stDiv.appendChild(makeStoneCanvas(cellPxSt));
				// 石がボタンの上にある場合はグロー追加（押されている演出）
				const onSwitch = stageData.tiles[st.r]?.[st.c] === TILE.BUTTON;
				if (ss.stonesLocked) addStoneLockedMark(stDiv);
				else if (onSwitch) addStoneGlow(stDiv);
				charLayerEl.appendChild(stDiv);
			}
		}

		// 敵
		for (const e of enemies) {
			// Phase 9-6: 横向きシルエットの敵（sideView）はプレイヤーの左右に合わせて反転する。
			// 素の絵は右向きなので「プレイヤーが左にいる」時だけ flipX。上下移動では向きを
			// 変えない（e.dir を使うと上下移動中に左右が固まる）＝プレイヤーの x 差で判定。
			// ⚠️ 2026-08-26: directional な敵は左右反転を **e.flipX**（syncDirectionalSprite が
			//    書いた今の向き）から引く。プレイヤー位置から引き直すと `${base}R` の絵に
			//    上下向き（D/U）の判定を混ぜてしまい、逆に e.flipX を無視すると
			//    「左を向いているのに再描画で右向きに戻る」（char-layer は作り直される
			//     ＝blade-renderboard-pairs-renderchars と同じ罠）。
			const sideFlip = ENEMY_META[e.type]?.directional
				? !!e.flipX
				: (!!ENEMY_META[e.type]?.sideView && (player.x < e.x));
			const wrapper = addCharEl(e.x, e.y, `enemy-${e.id}`, () => {
				return makeSprite(e.sprite, e.pal, true, sideFlip);
			});
			if (wrapper) {
				wrapper.dataset.enemyId = e.id;
				// 隠れ中の敵（潜行/地中/滞空）は半透明＋痕跡（無敵で寄ってくる状態の可視化）。
				// renderChars は char-layer を作り直すので、隠れ中に再描画されても状態が残るよう
				// ここでもクラスを付ける（enemy-ai.js の applyHideClass と同じクラス）。
				// 痕跡の描き分けは style 別クラス（hide-water/hide-burrow/hide-air）。
				if (e.hidden) {
					const meta = ENEMY_META[e.type];
					const style = meta?.hide?.style ?? meta?.leap?.style ?? 'water';
					wrapper.classList.add('hiding', `hide-${style}`);
				}
				// 大型敵（Phase 3-2）：wrapper を w×h セルに拡げ、canvas を全面に追従させる
				applyEnemySize(wrapper, e, cellPx0);
				if (ENEMY_META[e.type]?.aura) {
					const smoke = document.createElement('div');
					smoke.className = 'dark-lord-aura-smoke';
					wrapper.appendChild(smoke);
					const ring2 = document.createElement('div');
					ring2.className = 'dark-lord-aura-2';
					wrapper.appendChild(ring2);
					const ring1 = document.createElement('div');
					ring1.className = 'dark-lord-aura';
					wrapper.appendChild(ring1);
				}
			}
		}
	}

	return { renderChars, addCharEl, moveCharEl, removeCharEl, addShieldOverlay, updatePlayerCharEl };
}
