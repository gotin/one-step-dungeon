// game/enemy-ai.js ── 敵AI（Phase 0-2 Step 5）
// createEnemyAi(deps) factory で生成する。
// enemyTick / enemyChase / bossTickHitAndAway / enemyAttack / checkEnemyContact を提供。

import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { makeSprite } from '../shared/sprites.js';
import { playSound } from '../shared/sounds.js';
import { MOVE_STEP } from './constants.js';
import { statefulTileClosed } from './passable.js';
import { enemyPointHit } from './hitbox.js';

/**
 * createEnemyAi(deps) – factory
 *
 * deps:
 *   getStageData()               – stageData
 *   getPlayer()                  – player
 *   getEnemies()                 – enemies 配列（変更なし・最新値を毎回取得）
 *   getHeroDir()                 – heroDir
 *   getCharLayerEl()             – charLayerEl
 *   getCellPx()                  – セルサイズ(px)
 *   toTileRow(y)                 – float → タイル行
 *   toTileCol(x)                 – float → タイル列
 *   gameNow()                    – 論理時間
 *   isPassableForEnemy(y, x, e)  – 敵の通行可否判定
 *   moveCharEl(id, x, y)         – キャラ要素の位置更新
 *   takeDamage(amount)           – プレイヤーダメージ
 *   dealDamageToEnemy(e, dmg)    – 敵ダメージ
 *   fireEnemyProjectile(e, type, ndx, ndy, speed) – 敵の投擲物発射
 *   isShieldBlockingDir(dx, dy)  – 盾ブロック方向判定
 *   showShieldBlockEffect(x, y)  – 盾ブロックエフェクト
 *   debugMode                    – デバッグフラグ getter
 *   ── Phase 5-3: 敵が石を押すパズル用 ──
 *   getCurrentLayer()            – 現在レイヤー
 *   getStageKey()                – 現在ステージキー
 *   getSS(layer, key)            – ステージ状態取得
 *   tilePassable(r, c)           – 地形の通行可否（石の押し先判定用）
 *   checkStoneOnSwitch()         – 石→ボタン判定（既存・conditions.js）
 *   evaluateConditions()         – 条件再評価（既存）
 *   renderBoard() / renderChars()– 再描画
 */
export function createEnemyAi(deps) {
	const {
		getStageData, getPlayer, getEnemies,
		getHeroDir, getCharLayerEl, getCellPx,
		toTileRow, toTileCol, gameNow,
		isPassableForEnemy, moveCharEl,
		takeDamage, dealDamageToEnemy,
		fireEnemyProjectile, isShieldBlockingDir, showShieldBlockEffect,
		getDebugMode,
		// Phase 5-3: 敵が石を押すパズル
		getCurrentLayer, getStageKey, getSS, tilePassable,
		checkStoneOnSwitch, evaluateConditions, renderBoard, renderChars,
		// Phase 9-6: 両生敵（amphibious）の地形別速度に使う水判定
		isWaterAt,
	} = deps;

	// ── 速度の解決（Phase 9-6）─────────────────────────────────
	// 敵の1tickあたりの移動量を返す。
	//   基準は **e.speed**（インスタンス値）… boss.js の checkBossPhase が
	//   フェーズ移行で e.speed を書き換えるため。meta.speed を直接読むと
	//   フェーズ加速が無視される（従来の実装はここが meta.speed だった）。
	//   その上に **地形倍率** を掛ける … meta.moveSpeed = { water, land } を持つ
	//   両生敵（海の主）は水では速く陸では鈍い。moveSpeed が無い敵（＝既存の全敵）は
	//   倍率 1 ＝従来どおりの挙動。
	function resolveEnemySpeed(e, meta) {
		const base = e.speed ?? meta?.speed ?? 0;
		const ms = meta?.moveSpeed;
		if (!ms) return base;
		const r = toTileRow(e.y), c = toTileCol(e.x);
		const onWater = isWaterAt ? isWaterAt(r, c) : false;
		const factor = (onWater ? ms.water : ms.land) ?? 1;
		return base * factor;
	}

	// ── Phase 5-3: 敵が石を押す ────────────────────────────────
	// プレイヤーの tryPushStone（player.js）と同じ規則で、敵が移動しようとした
	// マス (er+ndr, ec+ndc) に石があるとき、その先 (er+2ndr, ec+2ndc) が押し先。
	// 押し先が通行可（tilePassable）かつ他の石・敵がいなければ石を1マス押し出す。
	// 押された石がボタンに乗れば既存の checkStoneOnSwitch がゲートを開く。
	// 戻り値：石を押せたら true（呼び出し側で敵もそのマスへ前進させる）。
	function tryEnemyPushStone(e, my, mx) {
		if (!getSS || !tilePassable) return false;        // deps 未注入なら無効（後方互換）
		const ndr = Math.sign(my);
		const ndc = Math.sign(mx);
		if (ndr !== 0 && ndc !== 0) return false;          // 斜めには押さない
		const stageData = getStageData();
		const er = toTileRow(e.y);
		const ec = toTileCol(e.x);
		const sr = er + ndr;   // 石があるはずのマス
		const sc = ec + ndc;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (!ss.stonePositions) ss.stonePositions = {};
		if (ss.stonesLocked) return false;  // Phase 4.56: ロック後は敵も石を押せない

		// (sr,sc) に石があるか（元位置の STONE タイル or 移動済みの石）
		let stoneKey = null;
		if (stageData.tiles[sr]?.[sc] === TILE.STONE && !ss.stonePositions[`${sr},${sc}`]) {
			stoneKey = `${sr},${sc}`;
		} else {
			for (const [k, st] of Object.entries(ss.stonePositions)) {
				if (st.r === sr && st.c === sc) { stoneKey = k; break; }
			}
		}
		if (stoneKey === null) return false;               // そこに石はない

		// 押し先 (dr,dc)
		const dr = sr + ndr;
		const dc = sc + ndc;
		if (dr < 0 || dr >= stageData.rows || dc < 0 || dc >= stageData.cols) return false;
		if (!tilePassable(dr, dc)) return false;           // 壁/水/穴は押せない
		// 2026-08-04（再設計・PLAN 4.7）：色スイッチは石を通さない（player.js と同じ規則）。
		const destTile = stageData.tiles[dr]?.[dc];
		if (destTile === TILE.SWITCH_RED || destTile === TILE.SWITCH_BLUE) return false;
		// 2026-08-02: 敵は押した後 (sr,sc)＝石の元セルへ入る（enemyChase の e.y/e.x 代入）∴下地が
		// 閉じていたら押せない（石を無視して下のタイルだけ見る＝プレイヤー側と同じ判定・片方だけ
		// 直すと敵に押させて「閉じた門越しに石を渡す」抜け道が残る）。
		const underEnemy = stageData.tiles[sr]?.[sc];
		if (underEnemy !== TILE.STONE && statefulTileClosed(underEnemy, `${sr},${sc}`, ss)) return false;
		// 押し先に別の石・敵・プレイヤーがいないか
		for (const st of Object.values(ss.stonePositions)) {
			if (st.r === dr && st.c === dc) return false;
		}
		const player = getPlayer();
		if (toTileRow(player.y) === dr && toTileCol(player.x) === dc) return false;
		for (const other of getEnemies()) {
			if (other === e) continue;
			if (toTileRow(other.y) === dr && toTileCol(other.x) === dc) return false;
		}

		// 石を1マス押し出す
		ss.stonePositions[stoneKey] = { r: dr, c: dc };
		checkStoneOnSwitch?.();
		evaluateConditions?.();
		playSound('move');
		renderBoard?.();
		renderChars?.();
		return true;
	}

	// ── ヒット＆アウェイ AI（アプローチモード選択） ────────────
	function pickApproachMode(e) {
		const meta = e.type ? ENEMY_META[e.type] : null;
		const hasStone = meta?.attacks?.some(a => a.type === 'stone');
		const defaultWeights = meta?.initialModeWeights ?? (hasStone
			? { flank: 0.8, direct: 0.6, wander: 1.0, strafe: 1.2 }
			: { flank: 1.0, direct: 1.0, wander: 1.0, strafe: 0 });
		const w = e._modeWeights ?? defaultWeights;
		const total = (w.flank ?? 0) + (w.direct ?? 0) + (w.wander ?? 0) + (w.strafe ?? 0);
		let r = Math.random() * total;
		if ((r -= (w.flank  ?? 0)) <= 0) return 'flank';
		if ((r -= (w.direct ?? 0)) <= 0) return 'direct';
		if ((r -= (w.strafe ?? 0)) <= 0) return 'strafe';
		return 'wander';
	}

	function bossTickHitAndAway(e, meta) {
		const debugMode = getDebugMode();
		const player    = getPlayer();
		const stageData = getStageData();
		const now = gameNow();

		if (!e._haPhase) {
			e._haPhase = 'approach';
			e._haTimer = now + 2500 + Math.random() * 1500;
			if (!e._modeWeights) {
				const meta2 = e.type ? ENEMY_META[e.type] : null;
				e._modeWeights = meta2?.initialModeWeights
					? { ...meta2.initialModeWeights }
					: { flank: 1.0, direct: 1.0, wander: 1.0 };
			}
			e._approachMode = pickApproachMode(e);
			if (e._approachMode === 'wander') {
				e._wanderX = 1 + Math.random() * ((stageData?.cols ?? 12) - 2);
				e._wanderY = 1 + Math.random() * ((stageData?.rows ?? 10) - 2);
			}
			if (debugMode) console.log(`[AI] ${e.id} approach start mode=${e._approachMode}`);
		}

		const dx = player.x - e.x;
		const dy = player.y - e.y;

		// 向きを常にプレイヤー方向に更新（毎tick）
		{
			const newDir = Math.abs(dy) >= Math.abs(dx)
				? (dy > 0 ? 'down' : 'up')
				: (dx > 0 ? 'right' : 'left');
			if (e.dir !== newDir) {
				e.dir = newDir;
				const baseName = ENEMY_META[e.type]?.sprite ?? e.sprite;
				const base = baseName.replace(/[DRLU]$/, '');
				const dirSuffix = { down:'D', right:'R', left:'R', up:'U' }[newDir] ?? 'D';
				e.sprite = `${base}${dirSuffix}`;
				e.flipX  = (newDir === 'left');
				const el = document.getElementById(`char-enemy-${e.id}`);
				if (el) {
					const oldCv = el.querySelector('canvas.sprite');
					if (oldCv) oldCv.remove();
					const cv = makeSprite(e.sprite, e.pal, true, e.flipX);
					if (cv) {
						// 大型敵（w/h>1）は差し替え後も canvas を wrapper 全面に追従させる
						// （CSS の 1セル !important を上書き。揺れアニメは wrapper の
						//  large-enemy クラス経由で canvas に当たり続ける）
						if ((e.w ?? 1) > 1 || (e.h ?? 1) > 1) {
							cv.style.setProperty('width',  '100%', 'important');
							cv.style.setProperty('height', '100%', 'important');
						}
						el.insertBefore(cv, el.firstChild);
					}
				}
			}
		}

		if (e._haPhase === 'approach') {
			if (now >= e._haTimer) {
				e._haPhase = 'retreat';
				e._haTimer = now + 800 + Math.random() * 600;
				e._approachMode = null;
			} else {
				const mode = e._approachMode ?? 'direct';
				let tdx, tdy;

				if (mode === 'wander') {
					const wx = (e._wanderX ?? player.x) - e.x;
					const wy = (e._wanderY ?? player.y) - e.y;
					const wDist = Math.sqrt(wx*wx + wy*wy);
					if (wDist < 1.0) {
						e._approachMode = 'direct';
						tdx = dx; tdy = dy;
					} else {
						tdx = wx; tdy = wy;
					}
					if (debugMode) {
						e._dbgTick = (e._dbgTick ?? 0) + 1;
						if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} WANDER pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → wander=(${(e._wanderX??0).toFixed(1)},${(e._wanderY??0).toFixed(1)}) dist=${wDist.toFixed(1)}`);
					}
				} else if (mode === 'strafe') {
					if (e._strafeTargetX == null || !e._strafeBasePlayerX
						|| Math.abs(player.x - e._strafeBasePlayerX) > 2.5
						|| Math.abs(player.y - e._strafeBasePlayerY) > 2.5) {
						const heroDir = getHeroDir();
						const STRAFE_DIST = 4.0 + Math.random() * 2.0;
						const stageW = stageData?.cols ?? 12;
						const stageH = stageData?.rows ?? 10;
						const heroFwd = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[heroDir] ?? [0,1];
						const sideA = [-heroFwd[1],  heroFwd[0]];
						const sideB = [ heroFwd[1], -heroFwd[0]];
						const chosenSide = Math.random() < 0.5 ? sideA : sideB;
						const tx = player.x + chosenSide[0] * STRAFE_DIST * 0.94 + heroFwd[0] * STRAFE_DIST * 0.34 * (Math.random() < 0.5 ? 1 : -1);
						const ty = player.y + chosenSide[1] * STRAFE_DIST * 0.94 + heroFwd[1] * STRAFE_DIST * 0.34 * (Math.random() < 0.5 ? 1 : -1);
						e._strafeTargetX = Math.max(1, Math.min(stageW - 2, tx));
						e._strafeTargetY = Math.max(1, Math.min(stageH - 2, ty));
						const dirLen = Math.sqrt(chosenSide[0]**2 + chosenSide[1]**2) || 1;
						e._strafeDirX = chosenSide[0] / dirLen;
						e._strafeDirY = chosenSide[1] / dirLen;
						e._strafeBasePlayerX = player.x;
						e._strafeBasePlayerY = player.y;
						if (debugMode) console.log(`[AI] ${e.id} STRAFE target=(${e._strafeTargetX.toFixed(1)},${e._strafeTargetY.toFixed(1)}) dist=${STRAFE_DIST.toFixed(1)}`);
					}
					const stx = e._strafeTargetX;
					const sty = e._strafeTargetY;
					const toStrafeDist = Math.sqrt((stx-e.x)**2 + (sty-e.y)**2);
					if (toStrafeDist < 1.5) {
						tdx = e._strafeDirX ?? (stx - e.x);
						tdy = e._strafeDirY ?? (sty - e.y);
						if (debugMode) {
							e._dbgTick = (e._dbgTick ?? 0) + 1;
							if (e._dbgTick % 8 === 0) console.log(`[AI] ${e.id} STRAFE continuing dir=(${tdx.toFixed(2)},${tdy.toFixed(2)}) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)})`);
						}
					} else {
						tdx = stx - e.x; tdy = sty - e.y;
						if (debugMode) {
							e._dbgTick = (e._dbgTick ?? 0) + 1;
							if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} STRAFE moving pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → target=(${stx.toFixed(1)},${sty.toFixed(1)}) dist=${toStrafeDist.toFixed(1)}`);
						}
					}
				} else if (mode === 'direct') {
					tdx = dx; tdy = dy;
					if (debugMode) {
						e._dbgTick = (e._dbgTick ?? 0) + 1;
						if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} DIRECT pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → player=(${player.x.toFixed(1)},${player.y.toFixed(1)}) dist=${Math.sqrt(dx*dx+dy*dy).toFixed(1)}`);
					}
				} else {
					// flank（背後回り込み）
					const heroDir = getHeroDir();
					const heroFwd = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[heroDir] ?? [0,1];
					const backX = player.x - heroFwd[0] * 1.5;
					const backY = player.y - heroFwd[1] * 1.5;

					const playerMoved = !e._flankBasePlayerX
						|| Math.abs(player.x - e._flankBasePlayerX) > 2.0
						|| Math.abs(player.y - e._flankBasePlayerY) > 2.0;

					if (e._flankTargetX == null || playerMoved) {
						const sideA = [-heroFwd[1],  heroFwd[0]];
						const sideB = [ heroFwd[1], -heroFwd[0]];
						const BACK_DIST = 1.5;
						const SIDE_DIST = 3.0 + Math.random() * 1.5;
						const stageW = stageData?.cols ?? 12;
						const stageH = stageData?.rows ?? 10;
						const candidates3 = [
							{ x: player.x - heroFwd[0] * BACK_DIST, y: player.y - heroFwd[1] * BACK_DIST },
							{ x: player.x + sideA[0] * SIDE_DIST,   y: player.y + sideA[1] * SIDE_DIST   },
							{ x: player.x + sideB[0] * SIDE_DIST,   y: player.y + sideB[1] * SIDE_DIST   },
						];
						const validCandidates = candidates3.map(p => ({
							x: Math.max(1, Math.min(stageW - 2, p.x)),
							y: Math.max(1, Math.min(stageH - 2, p.y)),
						}));
						const chosen = validCandidates[Math.floor(Math.random() * validCandidates.length)];
						e._flankTargetX = chosen.x;
						e._flankTargetY = chosen.y;
						e._flankBasePlayerX = player.x;
						e._flankBasePlayerY = player.y;
						e._flankDodgeDist = null;
						if (debugMode) {
							const which = ['back','sideA','sideB'];
							const idx = validCandidates.indexOf(chosen);
							console.log(`[AI] ${e.id} FLANK target=(${e._flankTargetX.toFixed(1)},${e._flankTargetY.toFixed(1)}) type=${which[idx] ?? '?'} reason=${playerMoved?'playerMoved':'init'}`);
						}
					}

					const ftx = e._flankTargetX;
					const fty = e._flankTargetY;
					const toTargetDist = Math.sqrt((ftx-e.x)**2 + (fty-e.y)**2);
					const toBkDist = Math.sqrt((backX-e.x)**2 + (backY-e.y)**2);

					if (toBkDist < 1.0) {
						tdx = dx; tdy = dy;
						if (e._flankStep !== 'charge') {
							if (debugMode) console.log(`[AI] ${e.id} FLANK→charge (back reached) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
							e._flankStep = 'charge';
						}
						e._flankTargetX = null;
					} else if (toTargetDist < 0.8) {
						tdx = backX - e.x; tdy = backY - e.y;
						if (e._flankStep !== 'to_back') {
							if (debugMode) console.log(`[AI] ${e.id} FLANK→to_back (target reached) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) back=(${backX.toFixed(1)},${backY.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
							e._flankStep = 'to_back';
						}
					} else {
						tdx = ftx - e.x; tdy = fty - e.y;
						if (e._flankStep !== 'to_target') {
							if (debugMode) console.log(`[AI] ${e.id} FLANK→to_target pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) target=(${ftx.toFixed(1)},${fty.toFixed(1)}) dist=${toTargetDist.toFixed(1)}`);
							e._flankStep = 'to_target';
						}
					}

					if (debugMode) {
						e._dbgTick = (e._dbgTick ?? 0) + 1;
						if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} FLANK step=${e._flankStep} pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) target=(${ftx?.toFixed(1)},${fty?.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
					}
				}

				e.accum = (e.accum ?? 0) + resolveEnemySpeed(e, meta);
				if (e.accum >= 1.0) {
					e.accum -= 1.0;
					const step = MOVE_STEP;
					const candidates = [];
					if (Math.abs(tdy) >= Math.abs(tdx)) {
						if (tdy !== 0) candidates.push([Math.sign(tdy)*step, 0]);
						if (tdx !== 0) { candidates.push([0, Math.sign(tdx)*step]); candidates.push([0, -Math.sign(tdx)*step]); }
						else           { candidates.push([0, step]); candidates.push([0, -step]); }
						if (tdy !== 0) candidates.push([-Math.sign(tdy)*step, 0]);
					} else {
						if (tdx !== 0) candidates.push([0, Math.sign(tdx)*step]);
						if (tdy !== 0) { candidates.push([Math.sign(tdy)*step, 0]); candidates.push([-Math.sign(tdy)*step, 0]); }
						else           { candidates.push([step, 0]); candidates.push([-step, 0]); }
						if (tdx !== 0) candidates.push([0, -Math.sign(tdx)*step]);
					}
					const prevX = e.x, prevY = e.y;
					for (const [my, mx] of candidates) {
						if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
							e.y += my; e.x += mx; break;
						}
					}
					if (e.x === prevX && e.y === prevY) {
						e._stuckTick = (e._stuckTick ?? 0) + 1;
						if (e._stuckTick >= 3) {
							e._stuckTick = 0;
							const escapes = [[step,0],[-step,0],[0,step],[0,-step]];
							for (const [my,mx] of escapes.sort(()=>Math.random()-0.5)) {
								if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
									e.y += my; e.x += mx; break;
								}
							}
						}
						e._directChargeTick = (e._directChargeTick ?? 0) + 1;
						if (e._directChargeTick >= 8) {
							e._directChargeTick = 0;
							e._haPhase = 'retreat';
							e._haTimer = now + 400 + Math.random() * 200;
						}
					} else {
						e._stuckTick = 0;
						e._directChargeTick = 0;
					}
					moveCharEl(`enemy-${e.id}`, e.x, e.y);
				}
			}
		} else {
			// retreat フェーズ
			if (now >= e._haTimer) {
				{
					if (!e._modeWeights) e._modeWeights = { flank: 1.0, direct: 1.0, wander: 1.0 };
					const atk = ENEMY_META[e.type]?.attack;
					const range = atk?.range ?? 1.5;
					const distNow = Math.sqrt(dx*dx + dy*dy);
					const succeeded = (e._approachMode === 'direct' || e._approachMode === 'flank')
						&& distNow <= range + 1.0;
					const mode = e._approachMode;
					if (mode === 'flank' || mode === 'direct') {
						if (succeeded) {
							e._modeWeights[mode] = Math.min(2.0, e._modeWeights[mode] * 1.5);
						} else {
							e._modeWeights[mode] = Math.max(0.2, e._modeWeights[mode] * 0.5);
						}
					}
					if (mode === 'wander') e._modeWeights = { flank: 1.0, direct: 1.0, wander: 1.0 };
				}
				e._haPhase = 'approach';
				e._haTimer = now + 2000 + Math.random() * 1000;
				{
					e._approachMode = pickApproachMode(e);
					if (e._approachMode === 'wander') {
						const stageData2 = getStageData();
						e._wanderX = 1 + Math.random() * ((stageData2?.cols ?? 12) - 2);
						e._wanderY = 1 + Math.random() * ((stageData2?.rows ?? 10) - 2);
					}
					e._dbgTick = 0;
					if (debugMode) {
						const w = e._modeWeights;
						const total = w.flank + w.direct + w.wander;
						console.log(
							`[AI] ${e.id} retreat→approach mode=${e._approachMode}` +
							` weights=F${(w.flank/total*100).toFixed(0)}%` +
							`/D${(w.direct/total*100).toFixed(0)}%` +
							`/W${(w.wander/total*100).toFixed(0)}%` +
							(e._approachMode === 'wander' ? ` wander=(${e._wanderX?.toFixed(1)},${e._wanderY?.toFixed(1)})` : '')
						);
					}
				}
			} else {
				const retreatDist = Math.sqrt(dx*dx + dy*dy);
				if (retreatDist >= 3.0) {
					e._haPhase = 'approach';
					e._haTimer = now + 500 + Math.random() * 500;
					e._approachMode = pickApproachMode(e);
					if (e._approachMode === 'wander') {
						const sd2 = getStageData();
						e._wanderX = 1 + Math.random() * ((sd2?.cols ?? 12) - 2);
						e._wanderY = 1 + Math.random() * ((sd2?.rows ?? 10) - 2);
					}
					e._dbgTick = 0;
					if (debugMode) {
						const w = e._modeWeights ?? { flank:1, direct:1, wander:1 };
						const total = w.flank + w.direct + w.wander;
						console.log(
							`[AI] ${e.id} retreat→approach (dist limit) mode=${e._approachMode}` +
							` dist=${retreatDist.toFixed(1)}` +
							` weights=F${(w.flank/total*100).toFixed(0)}%/D${(w.direct/total*100).toFixed(0)}%/W${(w.wander/total*100).toFixed(0)}%` +
							(e._approachMode === 'wander' ? ` wander=(${e._wanderX?.toFixed(1)},${e._wanderY?.toFixed(1)})` : '')
						);
					}
				} else {
					const rdx = -Math.sign(dx), rdy = -Math.sign(dy);
					const step = MOVE_STEP;
					const cands = Math.abs(dy) >= Math.abs(dx)
						? [[rdy*step,0],[0,rdx*step]] : [[0,rdx*step],[rdy*step,0]];
					e.accum = (e.accum ?? 0) + resolveEnemySpeed(e, meta);
					if (e.accum >= 1.0) {
						e.accum -= 1.0;
						for (const [my,mx] of cands) {
							if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
								e.y += my; e.x += mx; break;
							}
						}
						moveCharEl(`enemy-${e.id}`, e.x, e.y);
					}
				}
			}
		}
	}

	// ── 通常追跡 AI ───────────────────────────────────────────
	function enemyChase(e, speed) {
		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;

		const player = getPlayer();
		const dy = player.y - e.y;
		const dx = player.x - e.x;
		const dist = Math.sqrt(dy * dy + dx * dx);
		if (dist < 0.01) return;

		const step = MOVE_STEP;
		const candidates = [];
		if (Math.abs(dy) >= Math.abs(dx)) {
			candidates.push([Math.sign(dy) * step, 0]);
			candidates.push([0, Math.sign(dx) * step]);
		} else {
			candidates.push([0, Math.sign(dx) * step]);
			candidates.push([Math.sign(dy) * step, 0]);
		}

		// タイル境界に揃っているか（石押しは整数座標のときだけ試す）
		const aligned = Math.abs(e.x - Math.round(e.x)) < 0.01
			&& Math.abs(e.y - Math.round(e.y)) < 0.01;

		for (const [my, mx] of candidates) {
			const ny = e.y + my;
			const nx = e.x + mx;
			if (isPassableForEnemy(ny, nx, e)) {
				e.y = ny; e.x = nx;
				break;
			}
			// Phase 5-3: 塞がれた先が石なら押してみる（整数座標・カーディナルのみ）
			if (aligned && tryEnemyPushStone(e, my, mx)) {
				e.y = ny; e.x = nx;
				break;
			}
		}

		if (Math.abs(dy) >= Math.abs(dx)) e.dir = dy > 0 ? 'down' : 'up';
		else e.dir = dx > 0 ? 'right' : 'left';

		moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// ── 敵の攻撃処理 ──────────────────────────────────────────
	function enemyAttack(e, meta) {
		const attackList = meta.attacks ?? (meta.attack ? [meta.attack] : []);
		if (attackList.length === 0) return;

		const player  = getPlayer();
		const heroDir = getHeroDir();
		const now = gameNow();
		if (!e._attackTimes) e._attackTimes = {};

		const dx = player.x - e.x;
		const dy = player.y - e.y;
		const dist = Math.sqrt(dx * dx + dy * dy);

		for (let i = 0; i < attackList.length; i++) {
			const atk = attackList[i];
			if (!atk || atk.type === 'charge') continue;

			const lastTime = e._attackTimes[i] ?? 0;
			const cooldown = atk.cooldown ?? 3000;
			if (now - lastTime < cooldown) continue;

			if (dist > (atk.range ?? 5)) continue;
			// Phase 9-6: minRange＝近すぎる時はこの攻撃を出さない（下限）。
			// 近接＋遠隔を持つ敵（潜み鮫）で「隣接したら遠隔でなく噛みつき」を宣言的に表す。
			if (atk.minRange !== undefined && dist < atk.minRange) continue;

			if (atk.type === 'spear') {
				const sameCol = Math.abs(dx) < 1.0;
				const sameRow = Math.abs(dy) < 1.0;
				if (!sameCol && !sameRow) continue;
				const ndx = sameCol ? 0 : Math.sign(dx);
				const ndy = sameRow ? 0 : Math.sign(dy);
				fireEnemyProjectile(e, 'spear', ndx, ndy, atk.projectileSpeed ?? 1.5);
				e._attackTimes[i] = now;
			} else if (atk.type === 'stone') {
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, 'stone', ndx, ndy, atk.projectileSpeed ?? 1.0);
				e._attackTimes[i] = now;
			} else if (atk.type === 'waterShot') {
				// Phase 9-6 深洋O: 射水魚の水弾。stone と同じ「任意角へ飛ばす」型
				// （斜めにも撃つ）。投擲物の飛翔・盾ブロック・命中は既存の共通経路。
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, 'waterShot', ndx, ndy, atk.projectileSpeed ?? 1.2);
				e._attackTimes[i] = now;
			} else if (atk.type === 'waterBlade') {
				// Phase 9-6 深洋O: 潜み鮫の水刃（尾で薙いだ衝撃波）。任意角。
				// minRange（上のゲート）で「隣接時は撃たない」＝噛みつきに譲る。
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, 'waterBlade', ndx, ndy, atk.projectileSpeed ?? 1.4);
				e._attackTimes[i] = now;
			} else if (atk.type === 'sword') {
				const range = atk.range ?? 1.5;
				if (dist <= range) {
					const rawDx = player.x - e.x, rawDy = player.y - e.y;
					const absDx = Math.abs(rawDx), absDy = Math.abs(rawDy);
					let ux, uy;
					if (absDy >= absDx) { ux = 0; uy = (rawDy > 0 ? 1 : -1); }
					else                { ux = (rawDx > 0 ? 1 : -1); uy = 0; }
					const projDist = Math.abs(rawDx * ux + rawDy * uy);
					const perpDist = Math.abs(rawDx * (-uy) + rawDy * ux);
					if (projDist <= range && perpDist <= 0.8) {
						let sdx = rawDx, sdy = rawDy;
						if (absDx < 0.01 && absDy < 0.01) {
							const dv = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[e.dir] ?? [0,1];
							sdx = dv[0]; sdy = dv[1];
						}
						const blocked = player.shield && isShieldBlockingDir(sdx, sdy);
						if (blocked) {
							playSound('shieldBlock');
							showShieldBlockEffect(e.x, e.y);
							// 盾ブロック → 現在の approach モードの重みを下げる（学習）
							if (meta.hitAndAway && e._modeWeights && e._approachMode) {
								const m = e._approachMode;
								if (m === 'direct' || m === 'flank') {
									e._modeWeights[m] = Math.max(0.1, e._modeWeights[m] * 0.6);
									if (getDebugMode()) {
										const w = e._modeWeights;
										const total = w.flank + w.direct + w.wander;
										console.log(`[AI] ${e.id} shield-blocked mode=${m} → weights=F${(w.flank/total*100).toFixed(0)}%/D${(w.direct/total*100).toFixed(0)}%/W${(w.wander/total*100).toFixed(0)}%`);
									}
								}
							}
						} else {
							takeDamage(meta.atk);
						}
						showEnemySwordSlash(e);
						e._attackTimes[i] = now;
						if (meta.hitAndAway && e._haPhase === 'approach') {
							e._haPhase = 'retreat';
							e._haTimer = now + 600 + Math.random() * 400;
							break;
						}
					}
				}
			}
		}
	}

	// 敵の剣エフェクト
	function showEnemySwordSlash(e) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const player = getPlayer();
		const dx = player.x - e.x, dy = player.y - e.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < 0.01) return;
		const fx = e.x + dx / dist;
		const fy = e.y + dy / dist;
		const dir = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = `sword-thrust dir-${dir}`;
		el.style.left   = `${fx * cellPx}px`;
		el.style.top    = `${fy * cellPx}px`;
		el.style.width  = `${cellPx}px`;
		el.style.height = `${cellPx}px`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 260);
	}

	// ── Phase 9-6 深洋O: 潜行↔浮上（潜み鮫のリズム戦闘）──────────
	// meta.submerge = { hiddenMs, surfacedMs } を持つ敵は、水中に潜る時間と
	// 浮上する時間を交互に繰り返す。潜行中（e.submerged=true）は
	//   ・攻撃しない（enemyTick が enemyAttack を飛ばす）
	//   ・接触ダメージを与えない（checkEnemyContact が飛ばす）
	//   ・こちらの攻撃も通らない（combat.js dealDamageToEnemy が無効化）
	// 追跡（enemyChase）だけは潜行中も続く＝「水中を潜って迷い寄る」（§19-8-A）。
	// ∴ 浮上した 1.2 秒だけが殴れる窓＝海のリズム戦闘。
	// 時間は gameNow()（論理時間）基準なのでテストから step() で決定論的に再現できる。
	// 初期状態は「潜行」＝タイル名（潜み鮫）どおり水中から現れる。
	function tickSubmerge(e, meta, now) {
		const cfg = meta.submerge;
		if (!cfg) return;
		const hiddenMs   = cfg.hiddenMs   ?? 2000;
		const surfacedMs = cfg.surfacedMs ?? 1200;
		if (e._submergeUntil === undefined) {
			e.submerged = true;
			e._submergeUntil = now + hiddenMs;
			applySubmergedClass(e);
			return;
		}
		if (now < e._submergeUntil) return;
		e.submerged = !e.submerged;
		e._submergeUntil = now + (e.submerged ? hiddenMs : surfacedMs);
		applySubmergedClass(e);
	}

	// 潜行状態を見た目に反映（半透明＋波紋は CSS の .char-abs.submerged が担当）。
	// DOM は charLayerEl 経由でだけ触る（getCharLayerEl() が null の環境＝DOM 無しの
	// ユニットテストでも enemyTick が動くようにするため）。
	// 敵 id は "4,5" のような座標文字列なので querySelector（CSS セレクタ）は使えない。
	function applySubmergedClass(e) {
		const layer = getCharLayerEl();
		const el = layer?.ownerDocument?.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		el.classList.toggle('submerged', !!e.submerged);
	}

	// ── Phase 9-6: 横向き敵の向き（sideView）────────────────────
	// 鮫・魚のような横向きシルエットは、素の絵（右向き）のままだと常に右を向いて
	// 見える＝プレイヤーが左にいると背中で噛みつく不自然な絵になる。
	// ∴ ENEMY_META[type].sideView の敵は、プレイヤーの x 差で canvas を左右反転する。
	//   ・移動方向（e.dir）ではなくプレイヤー位置で決める＝上下移動中も向きが固まらない
	//   ・アニメループ（redrawAnimSprites）が dataset.flipX を読んで再描画するので、
	//     ここで dataset を書き換えるだけで次フレームから反転が反映される
	//   ・renderChars（char-layer 作り直し）側でも同じ判定を持つ＝再描画で戻らない
	function applySideFacing(e, meta) {
		if (!meta?.sideView) return;
		const layer = getCharLayerEl();
		const el = layer?.ownerDocument?.getElementById(`char-enemy-${e.id}`);
		const cv = el?.querySelector?.('canvas.sprite');
		if (!cv) return;
		const flip = getPlayer().x < e.x ? '1' : '';
		if (cv.dataset.flipX !== flip) cv.dataset.flipX = flip;
	}

	// ── 敵との接触ダメージ ────────────────────────────────────
	function checkEnemyContact() {
		const player  = getPlayer();
		const enemies = getEnemies();
		for (const e of enemies) {
			// Phase 9-6: 潜行中の敵は水中＝触れてもダメージを与えない（無敵と対の扱い）
			if (e.submerged) continue;
			// 占有範囲（AABB）ベース。1×1 敵では従来の 0.9 箱と一致する。
			if (enemyPointHit(e, player.x, player.y, 0.9)) {
				takeDamage(ENEMY_META[e.type]?.atk ?? 1);
			}
		}
	}

	// ── 敵ループ（毎 tick 呼ぶ） ──────────────────────────────
	function enemyTick() {
		const enemies = getEnemies();
		const now = gameNow();
		for (const e of enemies) {
			const meta = ENEMY_META[e.type];
			if (!meta) continue;
			if (e.stunUntil && now < e.stunUntil) continue;  // スタン中は移動・攻撃スキップ
			// Phase 9-6: 潜行↔浮上の周期を更新（submerge を持つ敵のみ）
			tickSubmerge(e, meta, now);
			// Phase 9-6: 横向き敵の向きをプレイヤーに合わせる（毎 tick・移動しなくても向き直る）
			applySideFacing(e, meta);
			if (meta.hitAndAway) {
				bossTickHitAndAway(e, meta);
			} else {
				enemyChase(e, resolveEnemySpeed(e, meta));
			}
			// 潜行中は攻撃しない（水中に隠れて寄るだけ）
			if (e.submerged) continue;
			enemyAttack(e, meta);
		}
	}

	return {
		enemyTick,
		enemyChase,
		resolveEnemySpeed,   // Phase 9-6: 地形別速度（両生敵）のテスト用
		bossTickHitAndAway,
		enemyAttack,
		checkEnemyContact,
	};
}
