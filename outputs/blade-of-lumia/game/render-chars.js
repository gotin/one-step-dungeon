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
//   getHeroSpriteName() → 'heroD' | 'heroR' | 'heroU'
//   getHeroPalName()    → 'hero' | 'princess'
//
// TILE / SPRITES / PAL / ENEMY_META / makeSprite は直接 import する。

import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL, makeSprite } from '../shared/sprites.js';
import { ENEMY_META } from '../shared/enemies.js';

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
		ladderOrientationAt,
	} = deps;

	// 石の canvas を描画するヘルパー（stoneDiv に追加する）
	function makeStoneCanvas(cellPx) {
		const stSize = Math.round(cellPx * 0.7) + 'px';
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
	function addShieldOverlay(div) {
		const player  = getPlayer();
		const heroDir = getHeroDir();
		if (!player.shield) return;

		let spriteName = 'shield';
		let flipX = false;
		if (heroDir === 'right') { spriteName = 'shieldSide'; }
		else if (heroDir === 'left') { spriteName = 'shieldSide'; flipX = true; }

		const cv = makeSprite(spriteName, 'shield', false, flipX);
		if (!cv) return;
		cv.style.position       = 'absolute';
		cv.style.imageRendering = 'pixelated';
		cv.style.pointerEvents  = 'none';
		const cellPx = getCellPx();

		if (heroDir === 'down') {
			const sz = Math.round(cellPx * 0.40) + 'px';
			cv.style.setProperty('width',  sz, 'important');
			cv.style.setProperty('height', sz, 'important');
			cv.style.zIndex = '4';
			cv.style.left   = `${Math.round(cellPx * 0.08 + 1)}px`;
			cv.style.top    = `${Math.round(cellPx * 0.48 + 1)}px`;
			cv.style.transform = 'none';
		} else if (heroDir === 'right') {
			const w = Math.round(cellPx * 0.17) + 'px';
			const h = Math.round(cellPx * 0.44) + 'px';
			cv.style.setProperty('width',  w, 'important');
			cv.style.setProperty('height', h, 'important');
			cv.style.zIndex = '4';
			cv.style.right  = '7px';
			cv.style.left   = 'auto';
			cv.style.top    = '50%';
			cv.style.transform = 'none';
		} else if (heroDir === 'left') {
			const w = Math.round(cellPx * 0.17) + 'px';
			const h = Math.round(cellPx * 0.44) + 'px';
			cv.style.setProperty('width',  w, 'important');
			cv.style.setProperty('height', h, 'important');
			cv.style.zIndex = '4';
			cv.style.left   = '7px';
			cv.style.top    = '50%';
			cv.style.transform = 'none';
		} else {
			const sz = Math.round(cellPx * 0.34) + 'px';
			cv.style.setProperty('width',  sz, 'important');
			cv.style.setProperty('height', sz, 'important');
			cv.style.setProperty('z-index', '-1', 'important');
			const rPx  = Math.round(cellPx * 0.08) - 3;
			const tPct = Math.round(cellPx * 0.45 + 4);
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
				if (onSwitch) addStoneGlow(stDiv);
				charLayerEl.appendChild(stDiv);
			}
		}

		// 敵
		for (const e of enemies) {
			const wrapper = addCharEl(e.x, e.y, `enemy-${e.id}`, () => {
				return makeSprite(e.sprite, e.pal, true);
			});
			if (wrapper) {
				wrapper.dataset.enemyId = e.id;
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
