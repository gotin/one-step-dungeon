// ── render-board.js ──────────────────────────────────────────
// Phase 0-2 Step 3: タイルグリッド描画を game.js から切り出し
//
// export: createRenderBoard(deps) → { renderBoard, setCellClass, addCellSprite }
//
// deps は以下の getter と参照を注入する（全て game.js スコープの可変状態）：
//   getStageData()    → stageData
//   getCurrentLayer() → currentLayer
//   getStageKey()     → stageKey
//   getSS(lk, sk)     → ステージ状態オブジェクト
//   getBoardEl()      → boardEl（DOM）
//   getStageLabelEl() → stageLabelEl（DOM）
//   getCharLayerElRef() → { value } ラッパー（charLayerEl への書き込み）
//   getDoorwayState(posKey) → ドアウェイ開閉状態
//
// shared モジュール（TILE / SPRITES / PAL / NPC_SPRITE_MAP / drawSpriteFrame / makeSprite）
// は直接 import する（game.js スコープ外・再代入なし）。

import { TILE } from '../shared/tiles.js';
import { SPRITES, PAL, drawSprite, drawSpriteFrame, drawSpriteLayers, makeSprite, applyBgSpriteToCell } from '../shared/sprites.js';
import { TILE_SPRITE_MAP } from '../shared/tile-sprites.js';
import { isConnectTile } from '../shared/tile-connect.js';
import { describeCell, BG_TILE_STYLE } from '../shared/cell-appearance.js';
import { NPC_SPRITE_MAP } from '../shared/npcs.js';

// 末尾の共通スプライト fallback で「静的に描いてよい落ちアイテム」タイルの集合。
// 敵・プレイヤー・NPC は実体として render-chars が描くので含めない（重複描画防止）。
// 専用分岐を持つアイテム（剣/盾/ブーメラン/鍵/ルピー/星の欠片）も含めない。
const ITEM_FALLBACK_TILES = new Set([
	TILE.ITEM_ARMOR, TILE.ITEM_BOMB, TILE.ITEM_BOW,
	TILE.ITEM_HEAL_POTION, TILE.ITEM_BIG_HEAL_POTION,
	TILE.ITEM_HEART_CONTAINER, TILE.ITEM_DUNGEON_MAP, TILE.ITEM_COMPASS,
]);

// tiles 層で「そのタイル自身の絵」を描くフィールドタイル。形と色は TILE_SPRITE_MAP から引く
// ∴ここは一覧だけ（茂みは切り倒し状態を見るので専用分岐に残す）。
// ⚠ 家（外壁 `h`／ドア `e`／屋根 `p`）は 10a-2、柵（`f`）は 10a-3 で連結タイルへ
//    移した＝隣接から部品を選ぶ（下の isConnectTile の分岐が先に処理する）∴この
//    一覧には入れない。ここに残すと、連結タイルの描画が何かの理由で落ちたときに
//    32 ドットの本体が obj-sprite（0.7 セル）で描かれ、1ドット 2.36px＝キャラより
//    細かい絵になる。
// export する理由＝tests/editor-game-parity.spec.js が「ゲームがどのセルで絵の選択を
// dataset に残すか」をこの集合から導く（11b）。手書きの写しを持つと、フィールドタイルを
// 足したときにテストの網から漏れる。
export const FIELD_SPRITE_TILES = new Set([
	TILE.GRASS, TILE.SAND, TILE.STONE_FLOOR, TILE.SNOW, TILE.ASH, TILE.MUD,
	TILE.TREE, TILE.MOUNTAIN, TILE.SIGN,
]);

// 32ドットで描き直した「セルを埋めない絵」（キュー10番 10a-1c）。
// 絵の中に透明の余白を持つ∴canvas はセル全面（field-sprite）に貼る＝1ドットが
// 厳密に cellPx/32 = キャラ・地面と同じ 3.375px になる。見かけの大きさは絵側の
// 余白で決まる（22/32 ≒ 0.69 セル＝従来の obj-sprite 0.7 倍と同じ）。
// 🔴 逆に obj-sprite（0.7 倍＋中央寄せ）へ 32 ドットの絵を入れると 1ドット 2.36px
//    ＝キャラより細かくなる∴この4種は必ず全面で貼る。
const FIELD_ART_32_TILES = new Set([TILE.TREE, TILE.MOUNTAIN, TILE.BUSH, TILE.SIGN]);
const fieldSpriteClass = (tile) => (FIELD_ART_32_TILES.has(tile) ? 'field-sprite' : 'obj-sprite');

// 盤面の「物」の canvas をセルに貼る唯一の入口（キュー10番 10d）。
// 絵が 32×32 なら `dot32`（セル全面）を足す＝1ドットが cellPx/32＝キャラ・地面と同じ
// 粗さになる。見かけの大きさは絵の側の透明余白で作る（shared/sprites-obj32.js）。
// 🔴 判定は「絵そのものの実寸（canvas.width）」から導く＝32 に描き直した絵の一覧を
//    ここに書き写さない。一覧を持つと絵と一覧がずれて「描き直したのに 0.7 倍の箱に
//    入ったまま＝1ドット 2.36px」になる（[[blade-tile-sprite-single-source]] と同じ罠）。
// ⚠ obj-sprite / item-sprite のクラスはそのまま付ける＝テストが「その物が描かれている」
//    目印として数えている。dot32 は大きさだけを上書きする。
export function putCellSprite(cellEl, cv, sizeClass) {
	if (!cv) return null;
	cv.classList.add(sizeClass);
	if (cv.width === 32 && cv.height === 32) cv.classList.add('dot32');
	cellEl.appendChild(cv);
	return cv;
}

/**
 * タイルグリッド描画関数群を生成して返す factory。
 * @param {object} deps
 * @param {()=>object} deps.getStageData
 * @param {()=>string} deps.getCurrentLayer
 * @param {()=>string} deps.getStageKey
 * @param {(lk:string,sk:string)=>object} deps.getSS
 * @param {()=>HTMLElement} deps.getBoardEl
 * @param {()=>HTMLElement} deps.getStageLabelEl
 * @param {{value:HTMLElement|null}} deps.charLayerElRef  ← 書き込み可能な参照ラッパー
 * @param {(posKey:string)=>string} deps.getDoorwayState
 */
export function createRenderBoard(deps) {
	const {
		getStageData,
		getCurrentLayer,
		getStageKey,
		getSS,
		getBoardEl,
		getStageLabelEl,
		charLayerElRef,
		getDoorwayState,
	} = deps;

	// 連結タイル（橋のデッキ）を1セル分描く（内部用）。tiles 層／bgTiles 層のどちらに
	// 置かれていても同じ部品表（shared/tile-connect.js）で描く＝置いた層で見た目が変わらない。
	// セル全体を埋める（0.7倍の中央寄せだと連続配置で隙間が空き「畑」に見える＝キュー10番）。
	// 部品の選択は shared/cell-appearance.js が済ませている（11b）∴ここは描くだけ。
	function drawConnectTile(cellEl, parts) {
		if (!parts) return false;
		// 下地（bgTiles のスプライト）を消し、セル背景をデッキの色にする。
		// デッキは不透明なので下地は見えない…はずだが、8ドットの絵を 75px 等の
		// 非整数倍率へ拡大するとき端の1デバイスピクセルに下地が滲み、セル境界に
		// 草色の格子線が出る（DSF2/4 で実測）。下地を消せば滲みもデッキ色になる。
		// ⚠ 柵（opaque:false）はこれをやらない＝隙間から地面が見える絵なので、
		//   下地を消すと隙間が地面でなく柵の色で塗られてしまう（setCellClass が
		//   先に敷いた bgTiles の見た目をそのまま残す）。
		if (parts.opaque) {
			delete cellEl.dataset.bgSprite;
			delete cellEl.dataset.bgPal;
			cellEl.style.background = PAL[parts.pal]?.[2] ?? '';
		}
		const cv = document.createElement('canvas');
		cv.className = 'sprite tile-sprite';
		cv.dataset.tileEdges   = parts.edgeCode;   // テストが縁の選択を観測できるようにする
		cv.dataset.tileVariant = parts.sprs[0];    // 同じく本体の変種（千鳥）を観測できるように
		cv.dataset.tileSprs    = parts.sprs.join(' ');   // 11b：重ねた部品すべて（3系の比較用）
		cv.dataset.tilePal     = parts.pal;
		drawSpriteLayers(cv, parts.sprs, PAL[parts.pal]);
		cellEl.appendChild(cv);
		return true;
	}

	// bgTile 背景クラス＋スプライトを cellEl に適用するヘルパー（内部用）
	// 何を敷くかは shared/cell-appearance.js の記述（desc）が決める＝エディタ・
	// ワールドプレビューと同じ設計図（11b）。ここは DOM／CSS への当て方だけを持つ。
	function applyBgTileClass(cellEl, desc) {
		// 下地に置かれた連結タイル（エディタのタイルパレットの「橋」は BG_TILES ＝ bgTiles 層へ
		// 書かれる）は、CSS 背景タイル敷きではなく tiles 層の橋と同じ部品で描く。
		// ここを下の背景敷きに任せると、同じ「橋」なのに置いた層で見た目が変わる。
		if (desc.groundConnect && drawConnectTile(cellEl, desc.groundConnect)) return;
		const cls = BG_TILE_STYLE[desc.bgTile]?.cls;
		if (cls) cellEl.classList.add(cls);
		// bgTile のスプライトを CSS background-image でセルに敷く（地面は 32×32 を1枚だけ）。
		// 絵はセルごとの変種を選ぶ（草地は房の位置が違う4種）＝隣のセルと同じ絵が
		// 並ばない＝「地面の模様がパターン化されすぎ」を減らす（bgVariantName）。
		// さらに隣のセルの地面が違う辺では、その色を自分の絵の縁へ食い込ませる
		// （10b・`shared/ground-seams.js`）＝地面の境界が定規で切ったように見えない。
		if (desc.ground) applyBgSpriteToCell(cellEl, desc.ground.spr, desc.ground.pal);
	}

	function setCellClass(cellEl, tile, posKey, ss, desc) {
		const stageData = getStageData();
		const dsc = desc ?? describeCell(stageData, ...posKey.split(',').map(Number), tile);
		const applyBg = () => applyBgTileClass(cellEl, dsc);
		switch (tile) {
			case TILE.WALL:           cellEl.classList.add('wall'); return;
			case TILE.WATER:          cellEl.classList.add('water'); return;
			case TILE.LAVA:           cellEl.classList.add('lava'); return;
			case TILE.GATE:
				// 開いたゲートは床と同じ背景に（bgTile に任せる）。閉じている時だけ gate 色。
				// ※ 以前は開時に switch-on を付けていたが、これはスイッチ ON の緑色で
				//    「ゲート跡が草地っぽく緑になる」誤表示の原因だった。
				if (!ss.openGates.has(posKey)) cellEl.classList.add('gate');
				applyBg(); return;
			case TILE.TIDE_GATE:
				// Phase 9-6 深洋O: 潮ゲート。閉（満潮）＝水の背景／開（引き潮）＝床。
				// 実際の水スプライトは addCellSprite が閉時のみ描く（GATE と同じ構造）。
				if (!ss.openGates.has(posKey)) cellEl.classList.add('water');
				applyBg(); return;
			case TILE.DOOR:
				cellEl.classList.add('door');
				applyBg(); return;
			case TILE.SWITCH_RED:
			case TILE.SWITCH_BLUE:
			case TILE.GATE_RED:
			case TILE.GATE_BLUE:
				// Phase 5-1: 色ゲート・色スイッチの背景は床に任せる
				applyBg(); return;
			case TILE.BUTTON:
			case TILE.SWITCH:
				// 背景は床（bgTile）に任せる。ON/OFF・押下の見た目はスプライト側の
				// クラス（button-pressed / switch-toggle-on）で表現する。
				// ※ 以前はセルに switch-on/off（緑）を付けていたが、これが床を緑に
				//    上書きし「床のはずが草地に見える」＋エディタとの不一致の原因だった。
				applyBg(); return;
			case TILE.BREAKABLE_WALL:
				cellEl.classList.add(ss.brokenWalls.has(posKey) ? 'floor' : 'breakable-wall');
				applyBg(); return;
			case TILE.MAP_ENTER:
				cellEl.classList.add('map-enter');
				applyBg(); return;
			case TILE.SKY:
				cellEl.classList.add('sky'); return;
			case TILE.PIT:
				cellEl.classList.add('pit'); return;
			case TILE.DOORWAY:
				cellEl.classList.add('doorway');
				applyBg(); return;
			case TILE.DOORWAY_BOSS: {
				const dwState = getDoorwayState(posKey);
				cellEl.classList.add(dwState === 'boss_closed' ? 'doorway-boss-closed' : 'doorway-boss');
				applyBg(); return;
			}
			case TILE.DOORWAY_LOCKED: {
				const dwState2 = getDoorwayState(posKey);
				cellEl.classList.add(dwState2 === 'open' ? 'doorway-locked-open' : 'doorway-locked');
				applyBg(); return;
			}
		}
		applyBg();
	}

	function addCellSprite(cellEl, tile, posKey, ss, desc) {
		const stageData    = getStageData();
		const currentLayer = getCurrentLayer();
		const stageKey     = getStageKey();
		const dsc = desc ?? describeCell(stageData, ...posKey.split(',').map(Number), tile);

		if (tile === TILE.WALL || tile === TILE.FLOOR || tile === TILE.PLAYER) return;

		if (tile === TILE.CHEST) {
			// 未開封のときだけ宝箱を描く（開封済みは床）。必ず return すること
			// ＝末尾の共通 fallback が chest を再描画して「開けても宝箱が残る」のを防ぐ。
			if (!ss.openedChests.has(posKey)) {
				const cond = stageData.showConditions?.[posKey];
				if (cond && !ss.conditionsMet.has(posKey)) return;
				// 静物＝ちらつかせない（2026-09-08 ユーザー指摘＝壁と同じ理由）。
				const cv = makeSprite('chest', 'chest', false);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		if (tile === TILE.KEY && !ss.pickedKeys.has(posKey)) {
			// 鍵も showConditions（killAll 等）で出現を遅らせられる＝「関門を解いて得る鍵」。
			// 他のアイテム（itemMap / ITEM_FALLBACK_TILES 側）は既にこの扱いだが、KEY は
			// ここで早期 return するため長らく条件を無視していた（キュー5番で是正）。
			const keyCond = stageData.showConditions?.[posKey];
			if (keyCond && !ss.conditionsMet.has(posKey)) return;
			const cv = makeSprite('key', 'key', true);
			putCellSprite(cellEl, cv, 'item-sprite');
			return;
		}
		if (tile === TILE.BUTTON) {
			// ボタン：丸い床ボタン。frame0=浮いている／frame1=押し込まれ＋発光。
			// プレイヤー/石が乗って ON（switchStates）の間だけ押された見た目にする。
			const frames = SPRITES['button'];
			const pal    = PAL['button'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite';
				drawSpriteFrame(cv, frames, ss.switchStates[posKey] ? 1 : 0, pal);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		if (tile === TILE.SWITCH) {
			// スイッチ：レバー。frame0=OFF（左倒し）／frame1=ON（右倒し＋発光）。
			// 武器の攻撃でトグルする（switchToggles）。
			const frames = SPRITES['lever'];
			const pal    = PAL['lever'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite';
				drawSpriteFrame(cv, frames, ss.switchToggles?.has(posKey) ? 1 : 0, pal);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		if (tile === TILE.GATE) {
			// 閉じている時だけ柵スプライトを描く。開いている時は何も描かない（床）。
			// ※ return を忘れると末尾の共通スプライト fallback が gateG を再描画して
			//    「開いてもゲートが見えたまま」になる（実際に起きたバグ）。
			if (!ss.openGates.has(posKey)) {
				const cv = makeSprite('gateG', 'gateG', false);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		// Phase 5-1: 色ゲート（赤/青）
		// activeColor が自色と一致 → 開いている（床として描かない）。不一致 → 閉じた格子を描く。
		if (tile === TILE.GATE_RED || tile === TILE.GATE_BLUE) {
			const color = tile === TILE.GATE_RED ? 'red' : 'blue';
			if (ss.activeColor !== color) {
				const sprName = tile === TILE.GATE_RED ? 'gateRed' : 'gateBlu';
				const palName = tile === TILE.GATE_RED ? 'gateRed' : 'gateBlu';
				const cv = makeSprite(sprName, palName, false);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		// Phase 5-1: 色スイッチ（赤/青）
		// frame0=非アクティブ（自色でない）／frame1=アクティブ（自色が選ばれている）
		if (tile === TILE.SWITCH_RED || tile === TILE.SWITCH_BLUE) {
			const color    = tile === TILE.SWITCH_RED ? 'red' : 'blue';
			const sprName  = tile === TILE.SWITCH_RED ? 'switchRed' : 'switchBlu';
			const palName  = tile === TILE.SWITCH_RED ? 'switchRed' : 'switchBlu';
			const frames   = SPRITES[sprName];
			const pal      = PAL[palName];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite';
				drawSpriteFrame(cv, frames, ss.activeColor === color ? 1 : 0, pal);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		if (tile === TILE.DOOR) {
			// 横に連なった扉は「1枚の大きな門」に見せる：左セルは doorL、右セルは
			// それを左右反転して描く（外枠が両端だけ・中央は合わせ目で繋がる）。
			// 単独の扉は従来の door スプライト。縦連結は今は単独扱い（横並びのみ対応）。
			// どの絵を選ぶか（連なりと反転）は shared/cell-appearance.js が持つ＝エディタ・
			// プレビューも同じ選択をする（11b：以前はここだけが連なりを見ていた）。
			const isOpen = ss.openedDoors?.has(posKey);
			const flipX   = !!dsc.obj?.flipX;
			const isHalf  = dsc.obj?.spr === 'doorL';
			const sprName = isOpen ? (isHalf ? 'doorLopen' : 'doorOpen') : (isHalf ? 'doorL' : 'door');
			cellEl.dataset.objSprite = `${sprName}${flipX ? '!' : ''}`;   // 11b：3系の比較用
			cellEl.dataset.objPal    = 'door';
			const cv = makeSprite(sprName, 'door', false, flipX);
			putCellSprite(cellEl, cv, 'door-sprite');
			return;
		}
		if (tile === TILE.WATER) {
			const cv = makeSprite('water', 'water', true);
			putCellSprite(cellEl, cv, 'obj-sprite');
			return;
		}
		if (tile === TILE.LAVA) {
			const cv = makeSprite('water', 'lava', true);   // water 形状＋lava 赤橙パレット
			putCellSprite(cellEl, cv, 'obj-sprite');
			return;
		}
		if (tile === TILE.TIDE_GATE) {
			// Phase 9-6 深洋O: 潮ゲート。閉（満潮＝openGates に無い）ときだけ水を描く。
			// 開（引き潮）なら何も描かない＝床（GATE と同じ「閉時のみ描画」構造。
			// return を忘れると末尾 fallback が再描画して「引いても水が残る」バグになる）。
			if (!ss.openGates.has(posKey)) {
				const cv = makeSprite('water', 'tide', true);  // water 形状＋tide 青緑パレット
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		if (tile === TILE.BREAKABLE_WALL) {
			// 未破壊のときだけ壁を描く（破壊後は床）。必ず return すること。
			if (!ss.brokenWalls.has(posKey)) {
				// 壁＝ちらつかせない（2026-09-08 ユーザー指摘＝「壁だよ？動いたら変じゃない？」）。
				const cv = makeSprite('breakableWall', 'breakableWall', false);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		if (tile === TILE.MAP_ENTER) {
			const cond = stageData.showConditions?.[posKey];
			if (cond && !ss.conditionsMet.has(posKey)) return;
			const cv = makeSprite('mapEnter', 'mapEnter', true);
			putCellSprite(cellEl, cv, 'obj-sprite');
			return;
		}
		if (tile === TILE.ALTAR) {
			const cv = makeSprite('altar', 'altar', false);
			putCellSprite(cellEl, cv, 'obj-sprite');
			return;
		}
		if (tile === TILE.TORCH) {
			// frame0=消灯（暗い台座・静止）／frame1,2=点灯（燃える炎・2コマで揺らめく）。
			// 消灯中は data-sprite を付けず animFrame の影響を受けない＝frame0固定。
			// 点灯中だけ data-sprite='torch' + data-frame-start='1' を付け、
			// redrawAnimSprites が frame1/2 だけを animFrame で巡回する（frame0は巡回対象外）。
			const frames = SPRITES['torch'];
			const pal    = PAL['torch'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite';
				if (ss.litTorches?.has(posKey)) {
					cv.dataset.sprite     = 'torch';
					cv.dataset.pal        = 'torch';
					cv.dataset.frameStart = '1';
					drawSprite(cv, frames, pal, false, 1);
				} else {
					drawSpriteFrame(cv, frames, 0, pal);
				}
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		if (tile === TILE.STONE) {
			const _ssSt = getSS(currentLayer, stageKey);
			if (_ssSt.stonePositions?.[posKey]) return;
			const cv = makeSprite('block', 'block', false);
			putCellSprite(cellEl, cv, 'obj-sprite');
			return;
		}
		if (tile === TILE.DOORWAY) {
			const cv = makeSprite('doorway', 'doorway', true);
			putCellSprite(cellEl, cv, 'obj-sprite');
			return;
		}
		if (tile === TILE.DOORWAY_BOSS) {
			const dwState = getDoorwayState(posKey);
			const frames = SPRITES['doorwayBoss'];
			const pal    = PAL['doorwayBoss'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite';
				const frameIdx = (dwState === 'boss_closed') ? 1 : 0;
				drawSpriteFrame(cv, frames, frameIdx, pal);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		if (tile === TILE.DOORWAY_LOCKED) {
			const dwState = getDoorwayState(posKey);
			const frames = SPRITES['doorwayLocked'];
			const pal    = PAL['doorwayLocked'];
			if (frames && pal) {
				const cv = document.createElement('canvas');
				cv.className = 'sprite';
				const frameIdx = (dwState === 'open') ? 1 : 0;
				drawSpriteFrame(cv, frames, frameIdx, pal);
				putCellSprite(cellEl, cv, 'obj-sprite');
			}
			return;
		}
		// NPC
		const npcMeta = NPC_SPRITE_MAP[tile];
		if (npcMeta) {
			const cv = makeSprite(npcMeta.sprite, npcMeta.pal, true);
			if (cv) { cv.classList.add('char-sprite'); cellEl.appendChild(cv); }
			return;
		}
		// 落ちているアイテム（スプライトのあるもの）
		const itemMap = {
			[TILE.ITEM_SWORD]:          ['sword',    'sword'],
			[TILE.ITEM_SHIELD]:         ['shield',   'shield'],
			[TILE.ITEM_BOOMERANG]:      ['boomerang','boomerang'],
			[TILE.ITEM_RUPEE]:          ['rupee',    'rupee'],
			[TILE.ITEM_RUPEE_LARGE]:    ['rupee',    'rupeeBlue'],
			[TILE.ITEM_TRIFORCE_PIECE]: ['triforce', 'triforce'],
		};
		if (itemMap[tile] && !ss.pickedKeys.has(posKey)) {
			const itemCond = stageData.showConditions?.[posKey];
			if (itemCond && !ss.conditionsMet.has(posKey)) return;
			const [spr, pal] = itemMap[tile];
			const cv = makeSprite(spr, pal, false);
			putCellSprite(cellEl, cv, 'item-sprite');
			return;
		}
		// 連結タイル（橋のデッキ）＝隣接状況で部品を重ねる。
		if (isConnectTile(tile) && drawConnectTile(cellEl, dsc.objConnect)) return;
		// フィールドタイル・茂みのスプライト描画。
		// 🔴 どの絵を選ぶか（肌 → 変種）は shared/cell-appearance.js だけが決める（11b）。
		//    形と色の対応は TILE_SPRITE_MAP、肌は tile-skins.js、変種は sprites-tiles.js ＝
		//    その組み立て順まで含めて共通化した∴ここに書き写さない
		//    （[[blade-tile-sprite-single-source]]。以前はエディタ・プレビューが別々に
		//     組み立てていて、プレビューだけ肌も変種も選ばず「同じセルが違う絵」だった）。
		// ⚠ 茂みだけは切り倒し状態（ss.cutBushes）を見る＝状態はゲーム側にしかない。
		if ((FIELD_SPRITE_TILES.has(tile) || tile === TILE.BUSH) && dsc.obj) {
			if (tile === TILE.BUSH && ss.cutBushes?.has(posKey)) return;
			const { spr, pal, skin } = dsc.obj;
			if (skin) {
				cellEl.dataset.artSkin = skin;        // どの肌を選んだかテストから見える
				if (tile === TILE.MOUNTAIN) cellEl.dataset.mountainSkin = skin;
			}
			cellEl.dataset.artSprite = spr;           // どの絵を選んだかテストから見える
			cellEl.dataset.artPal    = pal;           // 11b：3系の比較用（色まで一致させる）
			const ANIMATED_FIELD = new Set([TILE.GRASS, TILE.SAND, TILE.SNOW, TILE.ASH, TILE.MUD, TILE.TREE, TILE.BUSH]);
			const cv = makeSprite(spr, pal, ANIMATED_FIELD.has(tile));
			if (cv) { cv.classList.add(fieldSpriteClass(tile)); cellEl.appendChild(cv); }
			return;
		}
		if (tile === TILE.BUSH) return;   // 絵が引けない茂み（＝作りかけ）は何も描かない
		// 残りの「落ちているアイテム」だけを共通表 TILE_SPRITE_MAP から描く
		// （よろい・爆弾・弓矢・回復薬・地図・コンパス・ハートの器）。
		// ※ 敵（W/E/C/F/ボス）・プレイヤー・NPC も共通表に載っているが、それらは
		//   buildEnemies→render-chars.js が動く実体として描くので、ここで静的描画しては
		//   いけない（盤面に動かない複製が出る不具合になる）。アイテムタイルに限定する。
		if (ITEM_FALLBACK_TILES.has(tile) && !ss.pickedKeys.has(posKey)) {
			const si = TILE_SPRITE_MAP[tile];
			if (si && SPRITES[si.spr]) {
				const itemCond = stageData.showConditions?.[posKey];
				if (itemCond && !ss.conditionsMet.has(posKey)) return;
				const cv = makeSprite(si.spr, si.pal, false);
				putCellSprite(cellEl, cv, 'item-sprite');
			}
		}
	}

	function renderBoard() {
		const stageData    = getStageData();
		const currentLayer = getCurrentLayer();
		const stageKey     = getStageKey();
		const boardEl      = getBoardEl();
		const stageLabelEl = getStageLabelEl();
		if (!stageData) return;

		const { cols, rows, tiles } = stageData;
		const ss = getSS(currentLayer, stageKey);

		boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
		boardEl.style.gridTemplateRows    = `repeat(${rows}, var(--cell))`;
		boardEl.innerHTML = '';

		// char-layer を作成（キャラクター絶対配置コンテナ）
		const newCharLayerEl = document.createElement('div');
		newCharLayerEl.id = 'char-layer';
		boardEl.style.position = 'relative';
		// 参照ラッパーを更新（render-chars.js 側も最新値を読める）
		charLayerElRef.value = newCharLayerEl;

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const tile   = tiles[r][c];
				const posKey = `${r},${c}`;
				const cellEl = document.createElement('div');
				cellEl.className    = 'cell';
				cellEl.dataset.row  = r;
				cellEl.dataset.col  = c;

				// 1セルの「状態に依らない見た目」は1回だけ引く（11b）＝下地と物で2度
				// 同じ計算をしない∴セルあたりの仕事は共通化前より増えない。
				const desc = describeCell(stageData, r, c, tile);
				setCellClass(cellEl, tile, posKey, ss, desc);
				addCellSprite(cellEl, tile, posKey, ss, desc);
				boardEl.appendChild(cellEl);
			}
		}

		// char-layer を board の上に重ねる
		boardEl.appendChild(newCharLayerEl);
		stageLabelEl.textContent = `[${currentLayer}] ${stageKey}`;
	}

	return { renderBoard, setCellClass, addCellSprite };
}
