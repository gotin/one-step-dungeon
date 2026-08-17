// game/enemy-ai.js ── 敵AI（Phase 0-2 Step 5）
// createEnemyAi(deps) factory で生成する。
// enemyTick / enemyChase / bossTickHitAndAway / enemyAttack / checkEnemyContact を提供。

import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { makeSprite } from '../shared/sprites.js';
import { playSound } from '../shared/sounds.js';
import { MOVE_STEP, ATTACK_POSE_MS, TICK_MS } from './constants.js';
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
 *   ── Phase 5.5k k-5: ルピー喰いの吸血 ──
 *   updateHud()                  – HUD 更新（所持ルピーの表示）
 *   pulse(text, dur)             – メッセージ表示
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
		// Phase 5.5k k-5: ルピー喰いの吸血（所持ルピーが減る＝HUD とメッセージが要る）
		updateHud, pulse,
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

	// ── Phase 5.5k: 攻撃硬直（2026-08-12 ユーザー指摘「攻撃動作中は動かないようにすべき」）──
	// プレイヤーは剣を振っている間（_atkUntil の窓）足が止まる（player.js movePlayer）。
	// 敵側に同じ規則が無かった＝振りながら詰めてくる非対称だった ∴ 攻撃が成立した瞬間に
	// e._freezeUntil を立て、enemyTick がその窓の間は移動も攻撃も止める。
	//   ・既定＝ATTACK_POSE_MS（＝攻撃ポーズの絵が出ている間だけ止まる＝絵と挙動が一致）
	//   ・meta.attackFreezeMs で敵ごとに延ばせる（高機動の敵は硬直を長くして隙を作る）
	//   ・directional でない既存敵は硬直 0＝従来どおり（後方互換）
	function resolveAttackFreezeMs(meta) {
		if (meta?.attackFreezeMs != null) return meta.attackFreezeMs;
		return meta?.directional ? ATTACK_POSE_MS : 0;
	}

	// 攻撃が成立したときの共通後処理＝クールダウン記録・攻撃ポーズ窓・攻撃硬直。
	// 攻撃種別ごとに散っていた3行を1か所に集める（＝硬直を入れ忘れた攻撃種が出ない）。
	function markAttack(e, meta, i, now) {
		if (!e._attackTimes) e._attackTimes = {};
		e._attackTimes[i] = now;
		if (meta?.directional) e._atkUntil = now + ATTACK_POSE_MS;
		const freeze = resolveAttackFreezeMs(meta);
		if (freeze > 0) e._freezeUntil = now + freeze;
	}

	// ── Phase 5.5k: 遠隔／近接の二相（2026-08-12 ユーザー指摘）────────────────
	// 「遠隔攻撃を持つ敵が 1 セルまで詰めてくる＝常にくっついてくるキャラ」を直す。
	// meta.combat = { keepMin, keepMax, rangedMs, meleeMs } を持つ敵は
	//   ・遠隔モード … keepMin〜keepMax の距離を保ち、プレイヤーの行/列に自分を揃える
	//                  （揃うと swordBeam の発射条件が満たされる＝ちゃんと撃ってくる）
	//   ・近接モード … 従来どおり詰めて斬る
	// を交互に繰り返す。**周期は固定値（乱数を混ぜない）**＝プレイヤーがリズムを読んで
	// 「今は近づく番だから引く」と対処できる（初代ゼルダ的な読み合い）＋テストが決定論的。
	// 位相だけは敵 id（"行,列" の文字列）から導いてずらす＝同じ部屋の複数体が同時に
	// 近接モードへ入って一斉突撃にならない（乱数を使わないので再現性は保たれる）。
	function phaseOffsetMs(e, span) {
		if (!span) return 0;
		let h = 0;
		for (const ch of String(e.id)) h = (h * 31 + ch.charCodeAt(0)) % 100003;
		return h % span;
	}

	function tickCombatMode(e, meta, now) {
		const cfg = meta?.combat;
		if (!cfg) return null;
		const rangedMs = cfg.rangedMs ?? 3000;
		const meleeMs  = cfg.meleeMs  ?? 1800;
		if (e._cmode == null) {
			// 初期は遠隔モード＝「離れた敵が斬撃を飛ばしてくる」から戦闘が始まる。
			e._cmode = cfg.startMode ?? 'ranged';
			e._cmodeUntil = now + rangedMs + phaseOffsetMs(e, rangedMs + meleeMs);
		} else if (now >= e._cmodeUntil) {
			e._cmode = e._cmode === 'ranged' ? 'melee' : 'ranged';
			e._cmodeUntil = now + (e._cmode === 'ranged' ? rangedMs : meleeMs);
		}
		return e._cmode;
	}

	// 遠隔モードの移動＝間合いを保ちながら行/列を揃える。
	//   dist < keepMin  … 後退（近づかれ過ぎたら下がる＝密着し続けない）
	//   dist > keepMax  … 接近（射程外まで離れたら詰める＝棒立ちにならない）
	//   その間          … 直交方向（ずれている軸）を詰めて行/列を揃える。揃っていたら動かない
	//                     ＝「撃つ構えで待つ」＝プレイヤーが列から外れる時間ができる
	function enemyKeepDistance(e, meta, speed, cfg) {
		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;

		const player = getPlayer();
		const dx = player.x - e.x, dy = player.y - e.y;
		const dist = Math.hypot(dx, dy);
		const step = MOVE_STEP;
		const keepMin = cfg.keepMin ?? 3.0;
		const keepMax = cfg.keepMax ?? 6.5;

		// 向きは常にプレイヤーを見る（撃つ方向と絵を一致させる）
		e.dir = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');

		const candidates = [];
		const sy = Math.sign(dy) || 1, sx = Math.sign(dx) || 1;
		if (dist < keepMin) {
			// 後退＝離れる向き優先。塞がれていたら横へ逃げる（壁際で固まらない）
			if (Math.abs(dy) >= Math.abs(dx)) {
				candidates.push([-sy * step, 0], [0, -sx * step], [0, sx * step]);
			} else {
				candidates.push([0, -sx * step], [-sy * step, 0], [sy * step, 0]);
			}
		} else if (dist > keepMax) {
			if (Math.abs(dy) >= Math.abs(dx)) candidates.push([sy * step, 0], [0, sx * step]);
			else                              candidates.push([0, sx * step], [sy * step, 0]);
		} else {
			// 整列＝ずれの小さい軸（＝あと少しで揃う軸）を 0 に近づける。
			// 揃っている（ずれ < 0.5 セル）なら候補ゼロ＝その場で構える。
			const alignRow = Math.abs(dy) <= Math.abs(dx);   // 行を揃える（y を合わせる）
			const offset = alignRow ? Math.abs(dy) : Math.abs(dx);
			if (offset >= 0.5) {
				if (alignRow) candidates.push([sy * step, 0], [0, sx * step]);
				else          candidates.push([0, sx * step], [sy * step, 0]);
			}
		}

		for (const [my, mx] of candidates) {
			if (isPassableForEnemy(e.y + my, e.x + mx, e)) { e.y += my; e.x += mx; break; }
		}
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// ── Phase 5.5k: 陸上敵の向き別スプライト名解決（DECISIONS 2026-08-10）─────
	// プレイヤーの getHeroSpriteName()（game.js）が雛形＝攻撃中/構え中/通常の3段を
	// 1関数に集約する。directional:true の敵だけがこの関数を通る（フラグ無しの既存敵は
	// 従来どおり meta.sprite 固定＝参照エイリアス方式のまま・後方互換）。
	// 攻撃/構えのタイムスタンプは player._atkUntil と同型の論理時間窓（e._atkUntil/e._guardUntil）。
	function resolveEnemySprite(e, meta, now) {
		const baseName = meta?.sprite ?? e.sprite;
		const base = baseName.replace(/(Atk|Guard)?[DRLU](Atk|Guard)?$/, '');
		const dirSuffix = { down: 'D', right: 'R', left: 'R', up: 'U' }[e.dir] ?? 'D';
		if (e._atkUntil != null && now < e._atkUntil) return `${base}${dirSuffix}Atk`;
		if (e._guardUntil != null && now < e._guardUntil) return `${base}${dirSuffix}Guard`;
		return `${base}${dirSuffix}`;
	}

	// directional な敵の見た目（sprite/flipX）を今の状態に揃え、変わっていれば
	// DOM の canvas を差し替える。enemyChase（通常追跡）と向き固定の bossTickHitAndAway
	// 差替ブロックの両方から呼べるよう、差し替え処理そのものをここに集約する。
	function syncDirectionalSprite(e, meta) {
		const now = gameNow();
		const flipX = (e.dir === 'left');
		const spriteName = resolveEnemySprite(e, meta, now);
		if (e.sprite === spriteName && e.flipX === flipX) return;
		e.sprite = spriteName;
		e.flipX  = flipX;
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (el) {
			const oldCv = el.querySelector('canvas.sprite');
			if (oldCv) oldCv.remove();
			const cv = makeSprite(e.sprite, e.pal, true, e.flipX);
			if (cv) {
				if ((e.w ?? 1) > 1 || (e.h ?? 1) > 1) {
					cv.style.setProperty('width',  '100%', 'important');
					cv.style.setProperty('height', '100%', 'important');
				}
				el.insertBefore(cv, el.firstChild);
			}
		}
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
	// dirLocked（Phase 5.5k k-4）＝向きが機構で固定されている敵（盾騎士）は移動しても
	// 向き直らない。ここで毎tick e.dir を上書きすると blockFacing の「正面」が常に
	// プレイヤー側になり、回り込みが原理的に成立しなくなる。
	function enemyChase(e, speed, dirLocked = false) {
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

		if (!dirLocked) {
			if (Math.abs(dy) >= Math.abs(dx)) e.dir = dy > 0 ? 'down' : 'up';
			else e.dir = dx > 0 ? 'right' : 'left';
		}

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
				markAttack(e, meta, i, now);
			} else if (atk.type === 'swordBeam') {
				// Phase 5.5k #7 剣獣: 飛ぶ斬撃。spear と同じ「縦横が揃ったときだけ撃つ」型
				// （斜めには飛ばさない＝プレイヤーは列/行から外れれば避けられる）。
				// 投擲物はプレイヤーのビーム剣と同じ 'beam'（owner:'enemy' で発射される。
				// スイッチ類のトグルは owner==='player' に限定済み∴敵ビームでは動かない）。
				const sameCol = Math.abs(dx) < 1.0;
				const sameRow = Math.abs(dy) < 1.0;
				if (!sameCol && !sameRow) continue;
				const ndx = sameCol ? 0 : Math.sign(dx);
				const ndy = sameRow ? 0 : Math.sign(dy);
				// 撃つ方向を向く＝向き別スプライトの攻撃ポーズが斬撃の向きと一致する
				e.dir = ndx !== 0 ? (ndx > 0 ? 'right' : 'left') : (ndy > 0 ? 'down' : 'up');
				fireEnemyProjectile(e, 'beam', ndx, ndy, atk.projectileSpeed ?? 2.0);
				// クールダウン記録・剣を振った絵（_atkUntil）・攻撃硬直（_freezeUntil）は markAttack が一括で立てる
				markAttack(e, meta, i, now);
			} else if (atk.type === 'stone') {
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, 'stone', ndx, ndy, atk.projectileSpeed ?? 1.0);
				markAttack(e, meta, i, now);
			} else if (atk.type === 'waterShot') {
				// Phase 9-6 深洋O: 射水魚の水弾。stone と同じ「任意角へ飛ばす」型
				// （斜めにも撃つ）。投擲物の飛翔・盾ブロック・命中は既存の共通経路。
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, 'waterShot', ndx, ndy, atk.projectileSpeed ?? 1.2);
				markAttack(e, meta, i, now);
			} else if (atk.type === 'waterBlade') {
				// Phase 9-6 深洋O: 潜み鮫の水刃（尾で薙いだ衝撃波）。任意角。
				// minRange（上のゲート）で「隣接時は撃たない」＝噛みつきに譲る。
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, 'waterBlade', ndx, ndy, atk.projectileSpeed ?? 1.4);
				markAttack(e, meta, i, now);
			} else if (atk.type === 'bombThrow') {
				// Phase 5.5k k-6 #6 爆弾鬼: 放物線で投げる爆弾。
				// **着弾点は「投げた瞬間のプレイヤーのセル」で固定する**（追尾しない）＝
				// プレイヤーは「投げられた瞬間に走り出せば避けられる」＝反応の勝負になる。
				// 飛翔中は壁も水も素通りする（projectile.js lobStep）∴遮蔽の裏でも当たる
				// ＝この敵に対しては「隠れる」でなく「間合いを詰める」が答えになる（名簿の設計）。
				const tr = toTileRow(player.y);
				const tc = toTileCol(player.x);
				const ndx = dx / dist;
				const ndy = dy / dist;
				// 投げる方向を向く（任意角なので絵は縦横のうち成分の大きい側へ寄せる）
				e.dir = Math.abs(dx) >= Math.abs(dy)
					? (dx > 0 ? 'right' : 'left')
					: (dy > 0 ? 'down' : 'up');
				fireEnemyProjectile(e, 'thrownBomb', ndx, ndy, atk.projectileSpeed ?? 1.0, {
					lob:       true,
					targetX:   tc,
					targetY:   tr,
					blast:     atk.blast ?? {},
					arcHeight: 1.2,     // 見た目の弧の高さ（セル）＝当たり判定には効かない
				});
				markAttack(e, meta, i, now);
			} else if (atk.type === 'boomerangThrow') {
				// Phase 5.5k k-6 #10 ブーメラン鬼: 往復するブーメラン。
				// swordBeam と同じ「縦横が揃ったときだけ投げる」型＝行/列を外せば避けられる。
				// ⚠️ ただし**帰りの軌道は投げた敵へ向かう**∴行きを横に避けたプレイヤーが
				// そのまま敵へ寄ると帰りに当たる（二度読み＝名簿の設計）。
				const sameCol = Math.abs(dx) < 1.0;
				const sameRow = Math.abs(dy) < 1.0;
				if (!sameCol && !sameRow) continue;
				const ndx = sameCol ? 0 : Math.sign(dx);
				const ndy = sameRow ? 0 : Math.sign(dy);
				e.dir = ndx !== 0 ? (ndx > 0 ? 'right' : 'left') : (ndy > 0 ? 'down' : 'up');
				fireEnemyProjectile(e, 'boomerang', ndx, ndy, atk.projectileSpeed ?? 2.0, {
					// returnsToOwner＝往復の経路（projectile.js boomerangStep）に乗せる明示のフラグ。
					// owner で判定しない理由＝敵に打ち返されたプレイヤーのブーメランを
					// まっすぐ飛ばし続けるため（打ち返しの挙動を変えない）。
					returnsToOwner: true,
					maxRange:       atk.maxRange ?? 4.5,
				});
				markAttack(e, meta, i, now);
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
						// Phase 5.5k k-4: 向き固定の敵（盾騎士）は**正面にしか剣を振れない**。
						// 向きロックの代償＝側面/背後に回り込んだプレイヤーには手が出ない
						// ＝回り込みに報酬がある（向き直りは tickFaceLock の turnMs 待ち）。
						if (meta.blockFacing) {
							const swingDir = uy !== 0 ? (uy > 0 ? 'down' : 'up') : (ux > 0 ? 'right' : 'left');
							if (swingDir !== e.dir) continue;
						}
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
						// Phase 5.5k: クールダウン記録・剣を振った絵（${base}${Dir}Atk の窓 _atkUntil）・
						// 攻撃硬直（_freezeUntil）を markAttack で一括して立てる
						// （プレイヤーの player._atkUntil と同型・DECISIONS 2026-08-10 / 2026-08-12）。
						markAttack(e, meta, i, now);
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

	// ── 隠れ↔出現の無敵窓（Phase 9-6 潜み鮫の潜行 → 5.5k k-3 で陸/空へ一般化）──────
	// meta.hide = { hiddenMs, shownMs, style } を持つ敵は、隠れている時間と
	// 出ている時間を交互に繰り返す。隠れ中（e.hidden=true）は
	//   ・攻撃しない（enemyTick が enemyAttack を飛ばす）
	//   ・接触ダメージを与えない（checkEnemyContact が飛ばす）
	//   ・こちらの攻撃も通らない（combat.js dealDamageToEnemy が無効化）
	// 追跡（enemyChase）だけは隠れ中も続く＝「潜って迷い寄る」（§19-8-A）。
	// ∴ 出ている数秒だけが殴れる窓＝リズム戦闘。
	// style は見た目の種別（'water' 潜行／'burrow' 地中／'air' 滞空）＝CSS が
	// `.char-abs.hiding.hide-<style>` で水面の波紋・土煙・影に描き分ける。
	// 時間は gameNow()（論理時間）基準なのでテストから step() で決定論的に再現できる。
	// 初期状態は「隠れ」＝タイル名（潜み鮫・地中蟲）どおり見えない所から現れる。
	const HIDE_STYLES = ['water', 'burrow', 'air'];

	function tickHide(e, meta, now) {
		const cfg = meta.hide;
		if (!cfg) return;
		const hiddenMs = cfg.hiddenMs ?? 2000;
		const shownMs  = cfg.shownMs  ?? 1200;
		const style    = cfg.style ?? 'water';
		if (e._hideUntil === undefined) {
			e.hidden = true;
			e._hideUntil = now + hiddenMs;
			applyHideClass(e, style);
			return;
		}
		if (now < e._hideUntil) return;
		e.hidden = !e.hidden;
		e._hideUntil = now + (e.hidden ? hiddenMs : shownMs);
		applyHideClass(e, style);
	}

	// 隠れ状態を見た目に反映（半透明＋波紋/土煙は CSS の .char-abs.hiding が担当）。
	// DOM は charLayerEl 経由でだけ触る（getCharLayerEl() が null の環境＝DOM 無しの
	// ユニットテストでも enemyTick が動くようにするため）。
	// 敵 id は "4,5" のような座標文字列なので querySelector（CSS セレクタ）は使えない。
	function applyHideClass(e, style) {
		const layer = getCharLayerEl();
		const el = layer?.ownerDocument?.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		el.classList.toggle('hiding', !!e.hidden);
		for (const s of HIDE_STYLES) el.classList.toggle(`hide-${s}`, !!e.hidden && s === style);
	}

	// 隠れの切り替え（値が変わったときだけ見た目を触る）。タイマー駆動の tickHide と
	// 行動駆動の tickLeap（跳躍蜘蛛）が同じ無敵窓を共有するための出入口。
	function setEnemyHidden(e, hidden, style) {
		if (!!e.hidden === !!hidden) return;
		e.hidden = !!hidden;
		applyHideClass(e, style);
	}

	// ── Phase 5.5k k-3: 跳躍（跳躍蜘蛛）─────────────────────────
	// meta.leap = { windupMs, cells, airSpeed, cooldownMs, minRange, maxRange, style }
	// 地上では鈍足な敵に「跳んで間合いを詰める」手段を与える4拍の状態機械：
	//   ground  … 通常の（鈍い）接近。間合いが minRange〜maxRange に入ると溜めへ
	//   windup  … 溜め＝動かない・攻撃しない予告の窓（**まだ隠れていない＝殴れる**）
	//   air     … 滞空＝当たり判定が消える（隠れ＝無敵・接触ダメージなし）。跳ぶ方向は
	//             溜めで確定したカーディナル1方向∴プレイヤーは軸から外れて避けられる
	//   recover … 着地硬直＝動かない・攻撃しない（**隠れが解ける＝プレイヤーの反撃の窓**）
	// 戻り値：true ならこの tick の通常移動/攻撃を呼び出し側がスキップする。
	// 滞空中の移動は e.accum（速度）を通さない＝跳躍の速さは leap.airSpeed が決める。
	function tickLeap(e, meta, now) {
		const cfg = meta?.leap;
		if (!cfg) return false;
		const windupMs   = cfg.windupMs   ?? 360;
		const cells      = cfg.cells      ?? 3;
		const airSpeed   = cfg.airSpeed   ?? 1.0;
		const cooldownMs = cfg.cooldownMs ?? 1000;
		const minRange   = cfg.minRange   ?? 1.8;
		const maxRange   = cfg.maxRange   ?? 6.0;
		const style      = cfg.style      ?? 'air';
		if (!e._leapPhase) e._leapPhase = 'ground';

		if (e._leapPhase === 'air') {
			const [sy, sx] = e._leapVec ?? [0, 0];
			const steps = Math.max(1, Math.round(airSpeed / MOVE_STEP));
			let moved = 0;
			for (let k = 0; k < steps && e._leapLeft > 0; k++) {
				const ny = e.y + sy * MOVE_STEP, nx = e.x + sx * MOVE_STEP;
				// 跳んだ先が通れない（壁・水）なら、そこで力尽きて落ちる＝硬直へ入る
				if (!isPassableForEnemy(ny, nx, e)) { e._leapLeft = 0; break; }
				e.y = ny; e.x = nx; e._leapLeft -= MOVE_STEP; moved++;
			}
			if (moved) moveCharEl(`enemy-${e.id}`, e.x, e.y);
			if (e._leapLeft <= 0) {
				e._leapPhase = 'recover';
				e._leapUntil = now + cooldownMs;
				setEnemyHidden(e, false, style);
			}
			return true;
		}
		if (e._leapPhase === 'recover') {
			if (now < e._leapUntil) return true;
			e._leapPhase = 'ground';
			return false;
		}
		if (e._leapPhase === 'windup') {
			if (now < e._leapUntil) return true;
			e._leapPhase = 'air';
			e._leapLeft  = cells;
			setEnemyHidden(e, true, style);
			return true;
		}
		const player = getPlayer();
		const dx = player.x - e.x, dy = player.y - e.y;
		const dist = Math.hypot(dx, dy);
		// 密着（minRange 未満）では跳ばない＝すり抜けるだけになる。遠すぎ（maxRange 超）
		// でも跳ばない＝届かない跳躍で隙だけ晒すのは敵として不自然。
		if (dist < minRange || dist > maxRange) return false;
		const vertical = Math.abs(dy) >= Math.abs(dx);
		e._leapVec = vertical ? [Math.sign(dy) || 1, 0] : [0, Math.sign(dx) || 1];
		e.dir = vertical ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
		e._leapPhase = 'windup';
		e._leapUntil = now + windupMs;
		return true;
	}

	// ── Phase 5.5k k-4: 向きを固定して構える（盾騎士）─────────────────
	// meta.blockFacing = { turnMs, knockback } を持つ敵は「向きが常時ブロックの面」＝
	// e.dir がそのままダメージ無効化の方向になる（combat.js isBlockFacingDir）。
	// ∴ **向きは毎tick プレイヤーへ向き直ってはいけない**（それでは正面が常にプレイヤー側＝
	// 回り込む余地が消えて機構が死ぬ）。turnMs ごとの離散的な判断にして、その間に
	// プレイヤーが側面/背後へ回る猶予を作る。
	//   ・初回（_faceUntil が無い）は**マップに置かれた向き（enemyDirs）を尊重する**＝
	//     レベルデザインの「こちらを向いた騎士」がその向きで立つ（検証ステージも同じ）。
	//   ・向き直りはカーディナル4方向（tickGuard の向き決定と同型）。
	// 戻り値：true ならこの tick の向きはロック済み＝移動側（enemyChase）は向きを触らない。
	function tickFaceLock(e, meta, now) {
		const cfg = meta?.blockFacing;
		if (!cfg) return false;
		const turnMs = cfg.turnMs ?? 720;
		if (e._faceUntil == null) {
			// 置かれた向きをそのまま最初の turnMs ぶん維持する（向き直りの起点だけ決める）
			e._faceUntil = now + turnMs;
		} else if (now >= e._faceUntil) {
			const player = getPlayer();
			const dx = player.x - e.x, dy = player.y - e.y;
			if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) {
				e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
			}
			e._faceUntil = now + turnMs;
		}
		e._blockDir = e.dir;
		return true;
	}

	// ── Phase 5.5k k-4: 甲羅の開閉（火吐き亀）───────────────────────
	// meta.shell = { closedMs, openMs, breathCells, breathAtk, breathMs } を持つ敵は
	// 「籠もる（closed＝全ダメージ無効・不動）」と「開く（open＝殴れる）」を交互に繰り返す。
	// 隠れ（meta.hide）との違い＝**姿は消えない**＝いつでも攻撃対象にはなる（甲羅を叩いて
	// 0ダメージの弾きが返る）∴プレイヤーには「今は無駄」が手応えで伝わる。
	// **開いた瞬間に正面へ炎を吐く**＝「開くのを待って正面から殴る」を罰する（PLAN 名簿
	// 「口を開けた瞬間に炎を吐く（そのスキに殴る）」）。
	// 戻り値：true ならこの tick は移動も攻撃もしない（籠もっている間）。
	function tickShell(e, meta, now) {
		const cfg = meta?.shell;
		if (!cfg) return false;
		const closedMs = cfg.closedMs ?? 1400;
		const openMs   = cfg.openMs   ?? 1000;
		if (!e._shellPhase) {
			e._shellPhase  = 'closed';
			e._shellUntil  = now + closedMs;
			e._shellClosed = true;
			return true;
		}
		if (now < e._shellUntil) return e._shellPhase === 'closed';
		if (e._shellPhase === 'closed') {
			e._shellPhase  = 'open';
			e._shellUntil  = now + openMs;
			e._shellClosed = false;
			breatheFire(e, meta, cfg);   // 口を開けた瞬間＝炎
			return false;
		}
		e._shellPhase  = 'closed';
		e._shellUntil  = now + closedMs;
		e._shellClosed = true;
		return true;
	}

	// ── Phase 5.5k k-5: 張り付いてルピーを吸う（ルピー喰い）─────────────────
	// meta.leech = { attachRange, drainMs, amount, refund, cooldownMs }。
	// 「接触で張り付き所持ルピーを吸う／倒すと一部戻る＝倒す優先度を強制する」（PLAN 名簿 #11）。
	//
	// 設計上の急所（この2つを外すと機構が死ぬ）：
	//   ① **張り付いたら速度では振り切れない。** 敵の速度は必ずプレイヤーより遅い
	//      （GUIDE §7-2）∴「寄ってくるだけ」なら走って逃げれば無害＝吸われない。
	//      ∴張り付いている間は移動処理を通さず**プレイヤーの座標へ毎tick貼り付ける**。
	//      剥がす手段は殴ること（combat.js の被弾フック → detachLeech）だけ。
	//   ② **張り付き中は接触ダメージを出さない**（checkEnemyContact が `_attached` を飛ばす）。
	//      重なっている＝毎tick接触判定が成立する∴そのままだと即死級になる。
	//      「ルピーを吸う」がこの敵の攻撃であって、体力を削るのは仕事ではない。
	// プレイヤーのセルへ乗る（`e.x = player.x`）ので **passable.js の重なり防止から
	// `_attached` を除外している**（除外しないとプレイヤーが1歩も動けなくなる）。
	// 剣は距離0の敵にも当たる（combat.js の当たり判定は dot>=0 かつ射程内∴向きを問わない）。
	// 戻り値：true ならこの tick は移動も攻撃もしない（吸うことが攻撃）。
	function tickLeech(e, meta, now) {
		const cfg = meta?.leech;
		if (!cfg) return false;
		const player = getPlayer();
		if (!e._attached) {
			// 剥がされた直後は再度張り付けない＝反撃した見返りに間合いを立て直す猶予を作る
			if (now < (e._leechCooldownUntil ?? 0)) return false;
			const dx = player.x - e.x, dy = player.y - e.y;
			// ⚠️ attachRange は 1.0 以上にする。敵はプレイヤーのセルへ自力で踏み込めない
			//    （isPassableForEnemy）∴自分で詰められる距離は 1.0 まで＝これより狭い値に
			//    すると永遠に張り付けない（GUIDE §3-1 と同型の「届かない判定距離」の罠）。
			if (Math.hypot(dx, dy) > (cfg.attachRange ?? 1.1)) return false;
			e._attached = true;
			e._leechNext = now + (cfg.drainMs ?? 600);
			playSound('appear');
			pulse?.('張り付かれた！', 900);
		}
		// プレイヤーへ貼り付く（速度では振り切れない＝①）
		e.x = player.x; e.y = player.y;
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
		if (now >= (e._leechNext ?? 0)) {
			drainRupees(e, cfg, now);
			e._leechNext = now + (cfg.drainMs ?? 600);
		}
		return true;
	}

	// ルピーを amount 吸う。吸うものが無くなったら自分から剥がれる
	// （0ルピーのプレイヤーを永久に拘束しても何も起きない＝ただの無敵状態になる。
	//   剥がれれば通常の接触ダメージの敵として振る舞う＝無害な敵にはならない）。
	function drainRupees(e, cfg, now) {
		const player = getPlayer();
		const amount = Math.min(player.rupees ?? 0, cfg.amount ?? 2);
		if (amount <= 0) {
			detachLeech(e, now);
			pulse?.('吸うルピーが無い！', 900);
			return;
		}
		player.rupees -= amount;
		e._stolenRupees = (e._stolenRupees ?? 0) + amount;
		updateHud?.();
		playSound('rupee');
		pulse?.(`◆ ルピー ×${amount} を吸われた！`, 900);
	}

	// 張り付きを剥がす（被弾＝combat.js の被弾フックから／吸うものが無くなったとき）。
	// `_stolenRupees` は消さない＝倒したときの払い戻し（combat.js refundLeech）の元になる
	// ＝「剥がして放置」ではルピーは戻らない∴倒す動機が残る。
	function detachLeech(e, now = gameNow()) {
		const cfg = ENEMY_META[e.type]?.leech;
		if (!cfg) return;
		e._attached = false;
		e._leechNext = null;
		e._leechCooldownUntil = now + (cfg.cooldownMs ?? 1200);
	}

	// 正面（カーディナル1方向）へ breathCells セルぶん炎を吐く。
	// 投擲物ではない＝**射程の短い一撃**（飛び道具の種別追加は PLAN 5.5k k-6 の担当）。
	//   ・吐く直前にプレイヤーの方を向く＝炎の向きと絵の向きが一致する
	//   ・壁で止まる（tilePassable）＝壁越しには焼かれない
	//   ・当たり判定はセル単位（プレイヤーの中心がそのセルに乗っているか）
	function breatheFire(e, meta, cfg) {
		const player = getPlayer();
		const cells  = cfg.breathCells ?? 2;
		const dmg    = cfg.breathAtk ?? meta.atk ?? 1;
		const dx = player.x - e.x, dy = player.y - e.y;
		if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) {
			e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
		}
		const [ux, uy] = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0] }[e.dir] ?? [0, 1];
		for (let k = 1; k <= cells; k++) {
			const fx = e.x + ux * k, fy = e.y + uy * k;
			const r = toTileRow(fy), c = toTileCol(fx);
			if (!tilePassable(r, c)) break;   // 壁で止まる
			showFireBreathEffect(fx, fy, cfg.breathMs ?? 420);
			if (Math.abs(player.x - fx) < 0.9 && Math.abs(player.y - fy) < 0.9) takeDamage(dmg);
		}
		playSound('slash');   // 専用SEは持たない（炎の「シュッ」の代用）
	}

	// 炎の見た目（かがり火の炎 `.candle-fire` と同型＝DOM 要素を1つ置いて実時間で消す）。
	function showFireBreathEffect(fx, fy, durMs) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = 'enemy-fire-breath';
		el.style.cssText = `position:absolute;left:${fx * cellPx}px;top:${fy * cellPx}px;`
			+ `width:${cellPx}px;height:${cellPx}px;z-index:25;pointer-events:none;`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), durMs);
	}

	// ── Phase 5.5k k-3c: 跳躍蜘蛛の「溜め」を画面に出す ───────────────
	// tickLeap の windup 相は移動/攻撃を止めるだけで見た目は素の歩行のままだった＝
	// プレイヤーには「敵が止まった」ことしか伝わらず GUIDE §6-1（絵は機構を読ませる）に
	// 反していた。resolveEnemySprite（directional な敵の攻撃/構え窓）と同型＝論理時間の
	// 状態からスプライト名を導き、変わった tick だけ DOM の canvas を差し替える。
	// leapSpider は directional ではない（向き別9枚は不要）ので syncDirectionalSprite は
	// 通らない＝meta.leap を持つ敵専用の新経路。
	function syncLeapSprite(e, meta) {
		const base = meta?.sprite;
		if (!base) return;
		swapEnemySprite(e, (e._leapPhase === 'windup') ? `${base}Windup` : base);
	}

	// ── Phase 5.5k k-4: 火吐き亀の甲羅の開閉を画面に出す ───────────────
	// 籠もっている間（_shellClosed）は「無敵で不動」＝理由が絵で読めないと
	// 「動かないバグ」に見える（GUIDE §6-1）。leap の windup と同じ作法で名前を切り替える。
	function syncShellSprite(e, meta) {
		const base = meta?.sprite;
		if (!base) return;
		swapEnemySprite(e, e._shellClosed ? `${base}Closed` : base);
	}

	// 状態から導いたスプライト名へ DOM の canvas を差し替える（変わった tick だけ触る）。
	// directional 敵の syncDirectionalSprite と対になる「向きを持たない敵のポーズ差替」。
	function swapEnemySprite(e, spriteName) {
		if (e.sprite === spriteName) return;
		e.sprite = spriteName;
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		const oldCv = el.querySelector('canvas.sprite');
		if (oldCv) oldCv.remove();
		const cv = makeSprite(e.sprite, e.pal, true, !!e.flipX);
		if (cv) el.insertBefore(cv, el.firstChild);
	}

	// ── Phase 5.5k k-3: ジグザグ飛行（コウモリ群）───────────────
	// meta.zigzag = { amplitude, periodMs } を持つ敵は、プレイヤーそのものではなく
	// **プレイヤーの脇 amplitude セル** を目標に取り、periodMs ごとに左右を入れ替える。
	// ∴進路が振れて狙いを付けにくい（真っすぐ来る敵とは避け方が変わる）。
	// 位相は e.id から決定的にずらす（乱数なし＝同種を並べても一斉に来ない・テストが安定。
	// meta.combat の交替と同じ作法＝GUIDE §7-3）。
	function enemyZigzagFly(e, meta, speed, cfg) {
		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;

		const player = getPlayer();
		const amplitude = cfg.amplitude ?? 1.5;
		const periodMs  = cfg.periodMs  ?? 720;
		const now = gameNow();
		const t = now + phaseOffsetMs(e, periodMs * 2);
		const sign = Math.floor(t / periodMs) % 2 === 0 ? 1 : -1;

		const dy = player.y - e.y, dx = player.x - e.x;
		const step = MOVE_STEP;
		const half = step / 2;
		// 主軸＝ずれの大きい軸（ここを詰める）／副軸＝それに直交する軸（ここを左右に振る）
		const vertical = Math.abs(dy) >= Math.abs(dx);
		const mainDiff = vertical ? dy : dx;
		const primary = Math.abs(mainDiff) >= half
			? (vertical ? [Math.sign(mainDiff) * step, 0] : [0, Math.sign(mainDiff) * step])
			: null;
		// 副軸の目標＝プレイヤーの脇 amplitude セル（sign が periodMs ごとに入れ替わる）
		const latDiff = vertical
			? (player.x + amplitude * sign) - e.x
			: (player.y + amplitude * sign) - e.y;
		const lateral = Math.abs(latDiff) >= half
			? (vertical ? [0, Math.sign(latDiff) * step] : [Math.sign(latDiff) * step, 0])
			: null;
		// **1手おきに副軸へ振る**＝直線で寄って来ない（残りの手で主軸を詰める）。
		// 毎手を副軸に使うと目標の入れ替わりに追いつけず一歩も近づけない／主軸だけ先に
		// 詰めると「遠距離は直線・密着してから振れる」＝ジグザグが見えない。∴1:1 で交互。
		e._zzMoves = (e._zzMoves ?? 0) + 1;
		const swing = lateral && e._zzMoves % 2 === 1;
		const candidates = (swing ? [lateral, primary] : [primary, lateral]).filter(Boolean);
		for (const [my, mx] of candidates) {
			if (isPassableForEnemy(e.y + my, e.x + mx, e)) { e.y += my; e.x += mx; break; }
		}
		// 向きはプレイヤーを見る（目標点ではなく本体＝絵が「狙っている」ことを伝える）
		e.dir = vertical ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
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

	// ── Phase 5.5k: 陸上敵のガード（実効化・ユーザー指示 2026-08-10）───────────
	// ガードは見た目だけの威圧演出ではなく、実際にダメージを無効化する状態。
	// 判定＝sword 攻撃のクールダウン待ち中（＝次の攻撃まで間がある）かつ近接圏内なら
	// ガード状態に入る。ガード中は①移動しない②攻撃しない③向きをその場でロックする
	// （＝プレイヤーがブーメランで動きを止めてから叩くか、ロックされた向きの側面/背後へ
	// 回り込むかしないと崩せない、というユーザー設計）。クールダウンが明けたら
	// ガードを解いて攻撃へ移る（攻撃直後は再びクールダウン中＝自然にガードへ戻る）。
	// 戻り値：ガード中なら true（呼び出し側はこの tick の移動/攻撃を止める）。
	function tickGuard(e, meta, now) {
		// Phase 5.5k #7: guards:false＝ガードを持たない敵（剣獣のような高機動型は
		// 立ち止まって構えない）。directional な敵でもここで降りる＝${base}${Dir}Guard の
		// スプライトを用意しなくてよくなる（resolveEnemySprite は _guarding を見る）。
		if (meta.guards === false) { e._guarding = false; e._guardDir = null; return false; }
		const attackList = meta.attacks ?? (meta.attack ? [meta.attack] : []);
		const idx = attackList.findIndex(a => a?.type === 'sword');
		if (idx === -1) { e._guarding = false; e._guardDir = null; return false; }
		const sword = attackList[idx];
		const player = getPlayer();
		const dist = Math.hypot(player.x - e.x, player.y - e.y);
		// ガード圏＝sword.range と同じ（＝プレイヤーの剣が届く距離）。ここを離すと
		// 「ガード中は剣の射程外にいる」＝近接攻撃自体が届かず何もできなくなる
		// （見た目だけの旧設計の名残・実効化するなら間合いを一致させる必要がある）。
		const guardRange = sword.range ?? 1.5;
		if (dist > guardRange) { e._guarding = false; e._guardDir = null; return false; }
		const lastTime = e._attackTimes?.[idx] ?? 0;
		const cooldown = sword.cooldown ?? 3000;
		// 「攻撃可能」＝クールダウン経過 かつ 実際に sword.range 内（ガード圏内でも range 外なら
		// enemyAttack は発火しない∴ここで false にすると毎tick誤って移動側に落ちてしまう）。
		if (now - lastTime >= cooldown && dist <= (sword.range ?? 1.5)) { e._guarding = false; return false; }
		if (!e._guarding) {
			// ガード開始の瞬間だけ向きを決める＝以後はプレイヤーが動いても向き直らない（ロック）。
			const dx = player.x - e.x, dy = player.y - e.y;
			e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
		}
		e._guarding = true;
		e._guardDir = e.dir;
		e._guardUntil = now + TICK_MS + 40;
		return true;
	}

	// ── 敵との接触ダメージ ────────────────────────────────────
	function checkEnemyContact() {
		const player  = getPlayer();
		const enemies = getEnemies();
		for (const e of enemies) {
			// 隠れ中の敵（潜行・地中・滞空）は触れてもダメージを与えない（無敵と対の扱い）
			if (e.hidden) continue;
			// Phase 5.5k k-5: 張り付き中（ルピー喰い）は接触ダメージを出さない。
			// プレイヤーのセルに重なっている＝毎tick接触が成立する∴そのままだと即死級になる。
			// この敵の攻撃は「ルピーを吸うこと」＝体力を削るのは仕事ではない（tickLeech）。
			if (e._attached) continue;
			// 占有範囲（AABB）ベース。1×1 敵では従来の 0.9 箱と一致する。
			if (enemyPointHit(e, player.x, player.y, 0.9)) {
				// Phase 5.5k k-5: e.atk を先に見る＝分裂で生まれた小型（childAtk）が
				// 親より弱いことを接触ダメージに反映する。buildEnemies は e.atk = meta.atk を
				// 入れる∴既存の敵は従来と同じ値になる（後方互換）。
				takeDamage(e.atk ?? ENEMY_META[e.type]?.atk ?? 1);
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
			// Phase 5.5k: スタン中はガードも解除する（ブーメランで動きを止めてガード不能にする、
			// というユーザー設計の実体＝スタンとガードは同時に成立しない）。
			if (e.stunUntil && now < e.stunUntil) { e._guarding = false; continue; }
			// 隠れ↔出現の周期を更新（meta.hide を持つ敵のみ＝潜み鮫・地中蟲）
			tickHide(e, meta, now);
			// Phase 9-6: 横向き敵の向きをプレイヤーに合わせる（毎 tick・移動しなくても向き直る）
			applySideFacing(e, meta);
			// Phase 5.5k: directional な敵はガード判定を移動/攻撃より先に行う＝ガード中は
			// 両方スキップする（移動しない・攻撃しない・向きはロックされたまま＝ユーザー設計）。
			const isGuarding = meta.directional ? tickGuard(e, meta, now) : false;
			// Phase 5.5k（2026-08-12）: 攻撃硬直＝攻撃を出した直後の窓は移動も攻撃もしない。
			// プレイヤーの movePlayer が _atkUntil 中に足を止めるのと対称（player.js）。
			const frozen = e._freezeUntil != null && now < e._freezeUntil;
			// Phase 5.5k（2026-08-12）: 遠隔／近接の二相を持つ敵はどちらのモードかを更新する
			// （硬直中も時計は進める＝硬直でリズムが狂わない）。
			const cmode = tickCombatMode(e, meta, now);
			// Phase 5.5k k-3: 跳躍（跳躍蜘蛛）は溜め〜滞空〜着地硬直の間 移動/攻撃を専有する。
			// ガードや硬直と同じ「この tick は他の行動をしない」枠＝先に判定する。
			const leaping = (!isGuarding && !frozen) ? tickLeap(e, meta, now) : false;
			// Phase 5.5k k-4: 甲羅の開閉（火吐き亀）＝籠もっている間は移動も攻撃もしない
			// （ガード/硬直/跳躍と同じ「この tick は他の行動をしない」枠）。開いた瞬間の炎は
			// tickShell の中で出る＝籠もりから開く tick だけ攻撃が起きる。
			const shelled = (!isGuarding && !frozen && !leaping) ? tickShell(e, meta, now) : false;
			// Phase 5.5k k-5: 張り付き（ルピー喰い）＝張り付いている間はプレイヤーへ貼り付いて
			// ルピーを吸うだけ（移動も攻撃もしない）。上と同じ「この tick を専有する」枠。
			const leeching = (!isGuarding && !frozen && !leaping && !shelled) ? tickLeech(e, meta, now) : false;
			// Phase 5.5k k-4: 向き固定（盾騎士）＝turnMs ごとにだけ向き直る。移動より先に
			// 決める（移動側は向きを触らない＝dirLocked を渡す）。
			const dirLocked = tickFaceLock(e, meta, now);
			if (!isGuarding && !frozen && !leaping && !shelled && !leeching) {
				if (meta.hitAndAway) {
					bossTickHitAndAway(e, meta);
				} else if (cmode === 'ranged') {
					enemyKeepDistance(e, meta, resolveEnemySpeed(e, meta), meta.combat);
				} else if (meta.zigzag) {
					enemyZigzagFly(e, meta, resolveEnemySpeed(e, meta), meta.zigzag);
				} else {
					enemyChase(e, resolveEnemySpeed(e, meta), dirLocked);
				}
				// 隠れ中は攻撃しない（隠れて寄るだけ）
				if (!e.hidden) enemyAttack(e, meta);
			}
			// Phase 5.5k: directional な敵は毎tick見た目を今の状態（向き/攻撃窓/構え窓）に
			// 揃える＝enemyAttack が同tickで _atkUntil を立てた場合も即座に反映される
			// （プレイヤーの tickAttackPose と同じ「論理時間窓→毎tick同期」の作法）。
			if (meta.directional) syncDirectionalSprite(e, meta);
			// Phase 5.5k k-3c: 跳躍を持つ敵は windup 相の間だけ見た目を差し替える
			// （tickLeap 自体は上で呼んでいる＝ここは絵の同期だけ）。
			if (meta.leap) syncLeapSprite(e, meta);
			// Phase 5.5k k-4: 甲羅を持つ敵は開/閉で絵を切り替える（無敵の理由を見せる）。
			if (meta.shell) syncShellSprite(e, meta);
		}
	}

	return {
		enemyTick,
		enemyChase,
		resolveEnemySpeed,     // Phase 9-6: 地形別速度（両生敵）のテスト用
		resolveEnemySprite,    // Phase 5.5k: 向き別スプライト名解決のテスト用
		resolveAttackFreezeMs, // Phase 5.5k: 攻撃硬直の長さ（テスト用）
		tickCombatMode,        // Phase 5.5k: 遠隔／近接の二相（テスト用）
		enemyKeepDistance,     // Phase 5.5k: 間合いを保つ移動（テスト用）
		tickHide,              // Phase 5.5k k-3: 隠れ↔出現の無敵窓（テスト用）
		tickLeap,              // Phase 5.5k k-3: 跳躍の状態機械（テスト用）
		enemyZigzagFly,        // Phase 5.5k k-3: ジグザグ飛行（テスト用）
		tickFaceLock,          // Phase 5.5k k-4: 向き固定（盾騎士・テスト用）
		tickShell,             // Phase 5.5k k-4: 甲羅の開閉（火吐き亀・テスト用）
		tickLeech,             // Phase 5.5k k-5: 張り付き＋吸血（ルピー喰い・テスト用）
		detachLeech,           // Phase 5.5k k-5: 張り付きを剥がす（combat.js の被弾フックが呼ぶ）
		bossTickHitAndAway,
		enemyAttack,
		checkEnemyContact,
	};
}
