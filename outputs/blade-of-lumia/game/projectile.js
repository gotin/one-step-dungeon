// game/projectile.js ── 投擲物・爆弾管理（Phase 0-2 Step 5）
// createProjectile(deps) factory で生成する。
// 内部状態（_projectiles / _placedBombs / _nextProjId）はこのモジュールが所有。
// 盾ブロック判定・シールドエフェクトもここに置き、enemy-ai.js へ deps として注入する。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { makeSprite } from '../shared/sprites.js';
import { playSound } from '../shared/sounds.js';
import {
	MOVE_STEP, TICK_MS, BOOMERANG_STUN_MS, ATTACK_POSE_MS,
	CANDLE_FIRE_DMG, CANDLE_FLAME_MS, CANDLE_FLAME_MAX,
} from './constants.js';
import { SHIELD_TIERS } from '../shared/items.js';
import { enemyPointHit, enemyCenter, enemyOccupiesTile } from './hitbox.js';

// Phase 10d-3: boomerang・thrownBomb は落ちアイテムと同じ絵を共有する（同じ名前で
// SPRITES を参照）。落ちアイテム側を 32 ドット化した際、絵の中の透明余白が増えた
// （ink が canvas を占める比率が下がった）分だけ、この固定ピクセル箱（cellPx 比の
// 定数）で表示する飛翔中の見かけが縮む。dot32（CSS）で自動補正される床アイコンと
// 違い、飛翔物は cellPx 比の固定サイズなので、ここだけ拡大係数を掛けて相殺する。
// 係数＝旧8×8/16×16の ink 実測比 ÷ 新32×32の ink 実測比（`.scratch/proto-10d3.mjs`
// で算出・PLAN 10d-3 参照）。絵を変えていない他の投擲物（stone/magicBolt/
// waterShot/waterBlade）は係数1（無補正）のまま。
// Phase 10d-4: arrow も32ドット化したが、新旧の ink 比（幅方向は縮む・高さ方向は
// 伸びる）が平均でほぼ1.0（実測≈0.99・`.scratch/proto-10d4.mjs`）＝打ち消し合って
// 補正不要∴意図的にキーを追加していない（無指定→既定の1）。
const PROJ_SPRITE_SCALE = { boomerang: 1.71, thrownBomb: 1.89 };
// ブーメランが拾った床ドロップ（rupee/heart/bombItem/arrow）を追従表示するアイコン
// にも同じ理由の補正が要る（arrow は上と同じ理由で無補正のまま＝係数1）。
const CARRY_SPRITE_SCALE = { rupee: 1.87, heart: 1.82, bombItem: 1.89 };

// Phase 10d-6: ブーメラン飛翔中の回転周期。「多めに回す」固定値ではなく、実際の
// 飛距離/速度から求めた往復（投げてから戻ってキャッチされるまで）の実時間を、
// 往復あたりの回転数（実測して決めた値＝速すぎず遅すぎず）で割って個体ごとに出す。
// ∴木/銀ブーメラン（speed/maxRangeが違う）・敵の boomerangThrow（速度が atk 設定
// で変わる）のどれでも自動で追従する（固定 ms を書かない）。
const BOOMERANG_ROTATIONS_PER_TRIP = 4;
function boomerangSpinMs(proj) {
	const roundTripMs = (2 * proj.maxRange) / (proj.speed * MOVE_STEP) * TICK_MS;
	return Math.max(60, roundTripMs / BOOMERANG_ROTATIONS_PER_TRIP);
}

/**
 * createProjectile(deps) – factory
 *
 * deps:
 *   getStageData()            – stageData
 *   getPlayer()               – player
 *   getEnemies()              – enemies 配列
 *   getCurrentLayer()         – currentLayer
 *   getStageKey()             – stageKey
 *   getHeroDir()              – heroDir
 *   getCharLayerEl()          – charLayerEl DOM 要素
 *   getCellPx()               – セルサイズ(px)
 *   toTileRow(y)              – float → タイル行
 *   toTileCol(x)              – float → タイル列
 *   gameNow()                 – 論理時間
 *   getSS(lk, sk)             – ステージ状態
 *   dealDamageToEnemy(e, dmg) – 敵ダメージ
 *   takeDamage(amount)        – プレイヤーダメージ
 *   evaluateConditions()      – 条件評価
 *   renderBoard()             – ボード再描画
 *   renderChars()             – キャラ再描画
 *   saveGame()                – セーブ
 *   updateHud()               – HUD 更新
 *   pulse(text, dur?)         – メッセージ表示
 *   hasCleared()              – クリア済みか
 *   collectFieldItem(r, c)    – ブーメランが拾えるタイルアイテムがあれば carried 記述子を返す（Phase 4-6）
 *   collectFloorDrop(r, c)    – ブーメランが拾える敵ドロップがあれば carried 記述子を返す（Phase 4-6）
 *   finalizeCarried(carried)  – キャッチ成立時に運搬アイテムを player へ確定加算（Phase 4-6）
 *   restoreCarried(carried)   – 取り逃し時にタイルを復活（Phase 4-6）
 *   toggleSwitch(r, c)        – 矢が当たったスイッチをトグル（Phase 4-5 ①）
 *   setActiveColor(r, c)     – 矢が当たった色スイッチで activeColor をセット（Phase 5-1）
 */
export function createProjectile(deps) {
	const {
		getStageData, getPlayer, getEnemies,
		getCurrentLayer, getStageKey,
		getHeroDir, getCharLayerEl, getCellPx,
		toTileRow, toTileCol, gameNow, getSS,
		dealDamageToEnemy, takeDamage,
		evaluateConditions, renderBoard, renderChars,
		saveGame, updateHud, pulse, hasCleared,
		collectFieldItem, collectFloorDrop, finalizeCarried, restoreCarried, toggleSwitch, setActiveColor,
		// Phase 7-2: 盾は剣振り中・チャージ中はオフ（これらが無ければ常に盾有効）
		getLastSwordTime, getIsCharging,
	} = deps;

	// ── 内部状態 ──────────────────────────────────────────────
	let _projectiles  = [];
	let _nextProjId   = 1;
	let _placedBombs  = [];
	let _placedFlames = [];   // ロウソクで置いた炎（2026-08-31）

	// ── 盾ブロック判定 ────────────────────────────────────────
	// 盾を持っていて、攻撃が来る向きに正面を向いていれば完全ブロック
	// （初代ゼルダ方式：ボタン操作不要、向き合わせでブロック）
	function isShieldBlocking(proj) {
		return isShieldBlockingDir(proj.dx, proj.dy);
	}

	// 盾が今この瞬間に機能するか（Phase 7-2）。
	// 剣を振っている最中・チャージ中は盾オフ＝正面でも食らう。
	// Phase 5.5g3: 無効になる窓は **見た目と同じ 1 つの窓**＝`player._atkUntil`
	// （攻撃ポーズ中は盾が右手側へ回っていて正面を守っていない＝render-chars.js
	//  SHIELD_ATK_GEO）。以前は `SWORD_COOLDOWN_MS`(当時 100ms) で判定していたが、
	// ポーズは `ATTACK_POSE_MS`(180ms) 続く∴差の 80ms は「盾が横を向いて見えているのに
	// 正面から防げる」食い違いになっていた。`_atkUntil` は論理時間∴step() でも一致する。
	// `getLastSwordTime` によるフォールバックは残す（_atkUntil を持たない古いセーブや、
	// swordAttack を経ずに lastSwordTime だけ動く経路のため）。
	// ⚠️ フォールバックの窓も `ATTACK_POSE_MS` で測る（8-4 で SWORD_COOLDOWN_MS が
	//    300ms＝ポーズより長くなった∴クールダウンで測るとポーズが切れた後の 120ms も
	//    盾が効かないままになり、上で直した食い違いが逆向きに復活する）。
	function isShieldActive() {
		const player = getPlayer();
		if (!player.shield) return false;
		if (getIsCharging && getIsCharging()) return false;
		if (player._atkUntil != null && gameNow() < player._atkUntil) return false;
		if (getLastSwordTime && (gameNow() - getLastSwordTime() < ATTACK_POSE_MS)) return false;
		return true;
	}

	// dx/dy（攻撃の飛んでくる方向）に対して盾でブロックできるか判定
	function isShieldBlockingDir(dx, dy) {
		const player  = getPlayer();
		const heroDir = getHeroDir();
		if (!isShieldActive()) return false;
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);
		if (absDx >= absDy) {
			if (dx > 0 && heroDir === 'left')  return true;
			if (dx < 0 && heroDir === 'right') return true;
		} else {
			if (dy > 0 && heroDir === 'up')   return true;
			if (dy < 0 && heroDir === 'down') return true;
		}
		return false;
	}

	// 盾ブロックエフェクト：盾のある側（heroDir 方向）にフラッシュ表示
	function showShieldBlockEffect(_px, _py) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx  = getCellPx();
		const player  = getPlayer();
		const heroDir = getHeroDir();
		const offset  = 0.6;
		const cx = player.x + 0.5;
		const cy = player.y + 0.5;
		let fx = cx, fy = cy;
		if      (heroDir === 'left')  fx = cx - offset;
		else if (heroDir === 'right') fx = cx + offset;
		else if (heroDir === 'up')    fy = cy - offset;
		else if (heroDir === 'down')  fy = cy + offset;
		const el = document.createElement('div');
		el.style.cssText = [
			`position:absolute;`,
			`left:${fx * cellPx}px;top:${fy * cellPx}px;`,
			`width:0;height:0;transform:translate(-50%,-50%);`,
			`z-index:25;pointer-events:none;`,
			`font-size:${Math.round(cellPx * 0.7)}px;line-height:1;`,
			`animation:shield-block-anim 0.35s ease-out forwards;`,
		].join('');
		el.textContent = '✦';
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 380);
	}

	// ブーメランスタンエフェクト：敵中心に ⭐ を浮かばせる
	function showStunEffect(e) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const { cx, cy } = enemyCenter(e);
		const el = document.createElement('div');
		el.className = 'stun-burst';
		el.textContent = '⭐';
		el.style.left = `${cx * cellPx}px`;
		el.style.top  = `${cy * cellPx}px`;
		// 印の長さ＝気絶の長さ（effects.css の既定 1500ms と同値＝見た目は不変）。
		el.style.setProperty('--stun-burst-ms', `${BOOMERANG_STUN_MS}ms`);
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), BOOMERANG_STUN_MS);
	}

	// ── 境界・通行判定 ────────────────────────────────────────
	function isInBounds(x, y) {
		const sd = getStageData();
		if (!sd) return false;
		return x >= 0 && x < sd.cols && y >= 0 && y < sd.rows;
	}

	function isTilePassableForProj(r, c) {
		const sd = getStageData();
		const tile = sd?.tiles[r]?.[c];
		if (!tile) return false;
		if (tile === TILE.WALL) return false;
		const posKey = `${r},${c}`;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) return false;
		return true;
	}

	// ── 投擲物の DOM 要素管理 ────────────────────────────────
	function createProjEl(proj) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const div = document.createElement('div');
		div.className = 'char-abs proj-el';
		div.id = `proj-${proj.id}`;
		div.style.left = `${proj.x * cellPx}px`;
		div.style.top  = `${proj.y * cellPx}px`;

		// 剣ビーム（Phase 3-1）：専用スプライトは未作成のため CSS 演出で描画する。
		// 横/縦向きで光の刃を伸ばし、満タン（strong）は太く明るくする。
		if (proj.type === 'beam') {
			const horizontal = Math.abs(proj.dx) >= Math.abs(proj.dy);
			const beam = document.createElement('div');
			// Phase 5.5k #7: 敵が撃つ飛ぶ斬撃は色を変える（プレイヤーのビームは水色系＝
			// 同じ絵だと「自分の攻撃」と誤読して避けない）。
			beam.className = 'sword-beam'
				+ (proj.strong ? ' beam-strong' : '')
				+ (proj.owner === 'enemy' ? ' beam-enemy' : '');
			const longPx  = Math.round(cellPx * (proj.strong ? 0.95 : 0.7));
			const shortPx = Math.round(cellPx * (proj.strong ? 0.42 : 0.3));
			beam.style.width  = `${horizontal ? longPx : shortPx}px`;
			beam.style.height = `${horizontal ? shortPx : longPx}px`;
			div.appendChild(beam);
			charLayerEl.appendChild(div);
			proj.el = div;
			return;
		}

		// Phase 10d-6b: proj.pal があれば形は共通のままパレットだけ差し替える
		// （ブーメランのティア＝木/銀。剣/防具/盾ティアと同じ「形共通・色だけ差し替え」の
		// 作法＝SHIELD_TIERS参照）。proj.pal を持たない投擲物（矢・爆弾等）は proj.type
		// のまま（既存挙動そのまま）。
		const cv = makeSprite(proj.type, proj.pal ?? proj.type, false);  // 静止表示（アニメなし）
		if (cv) {
			const sz = Math.round(cellPx * 0.35 * (PROJ_SPRITE_SCALE[proj.type] ?? 1)) + 'px';
			cv.style.setProperty('width',  sz, 'important');
			cv.style.setProperty('height', sz, 'important');
			// 矢（arrow）は向きに応じてスプライトを回転する
			if (proj.type === 'arrow') {
				const adx = proj.dx, ady = proj.dy;
				let deg = 0;
				if      (adx > 0 && ady === 0)  deg = 0;
				else if (adx < 0 && ady === 0)  deg = 180;
				else if (ady < 0 && adx === 0)  deg = 270;
				else if (ady > 0 && adx === 0)  deg = 90;
				else if (adx > 0 && ady > 0)    deg = 45;
				else if (adx < 0 && ady > 0)    deg = 135;
				else if (adx < 0 && ady < 0)    deg = 225;
				else if (adx > 0 && ady < 0)    deg = 315;
				if (deg !== 0) cv.style.setProperty('transform', `translate(-50%,-50%) rotate(${deg}deg)`, 'important');
			}
			// Phase 9-6: 水刃（waterBlade）は三日月の刃＝任意角で飛ぶので連続回転する。
			// 素の絵は右向き（進行方向＝右）に膨らむ形なので atan2 をそのまま度に直す。
			if (proj.type === 'waterBlade') {
				const deg = Math.atan2(proj.dy, proj.dx) * 180 / Math.PI;
				cv.style.setProperty('transform', `translate(-50%,-50%) rotate(${deg}deg)`, 'important');
			}
			// Phase 10d-6: ブーメランは飛行中ずっと回転する（実物のブーメランの見た目）。
			// アウラ（.boomerang-flaming）・運搬アイコン（.boomerang-carry）は別要素＝
			// この canvas だけに掛けるので回転しない。
			if (proj.type === 'boomerang') {
				cv.classList.add('boomerang-spin');
				cv.style.setProperty('--spin-ms', `${boomerangSpinMs(proj)}ms`);
			}
			div.appendChild(cv);
		}
		charLayerEl.appendChild(div);
		proj.el = div;
	}

	function moveProjEl(proj) {
		let el = document.getElementById(`proj-${proj.id}`);
		// 飛行中に renderBoard()（char-layer 作り直し）が走ると proj 要素が消える。
		// ブーメランはアイテム回収・炎点火で renderBoard を呼ぶので、消えていたら再生成する。
		if (!el) {
			createProjEl(proj);
			el = document.getElementById(`proj-${proj.id}`);
			if (!el) return;
		}
		const cellPx = getCellPx();
		el.style.left = `${proj.x * cellPx}px`;
		// Phase 5.5k k-6: 放物線の投擲物は「見た目だけ」上へ持ち上げる（4t(1-t) の山＝
		// t=0/1 で 0・t=0.5 で最大）。**当たり判定は持ち上げない**＝爆発は着弾セルで起きる
		// ∴プレイヤーは「弧を描いて自分の足元へ落ちてくる」ものとして読める。
		const lift = proj.lob
			? (proj.arcHeight ?? 1.2) * 4 * (proj._lobT ?? 0) * (1 - (proj._lobT ?? 0))
			: 0;
		el.style.top  = `${(proj.y - lift) * cellPx}px`;
		// Phase 4-5 ②: 炎持ちブーメランにオーラを付ける
		if (proj.type === 'boomerang') {
			let aura = el.querySelector('.boomerang-flaming');
			if (proj.flaming && !aura) {
				aura = document.createElement('div');
				aura.className = 'boomerang-flaming';
				el.appendChild(aura);
			} else if (!proj.flaming && aura) {
				aura.remove();
			}
			// Phase 4-6: 拾ったアイテムを付随アイコンで追従表示（最後に拾った1個）
			const carry = proj.carried?.[proj.carried.length - 1];
			let icon = el.querySelector('.boomerang-carry');
			if (carry && !icon) {
				const cv = makeSprite(carry.spr, carry.pal, false);
				if (cv) {
					cv.className = 'boomerang-carry';
					const isz = Math.round(getCellPx() * 0.3 * (CARRY_SPRITE_SCALE[carry.spr] ?? 1)) + 'px';
					cv.style.setProperty('width',  isz, 'important');
					cv.style.setProperty('height', isz, 'important');
					el.appendChild(cv);
				}
			}
		}
	}

	function removeProjEl(proj) {
		document.getElementById(`proj-${proj.id}`)?.remove();
	}

	// ── 当たり判定 ────────────────────────────────────────────
	function checkProjHit(proj) {
		const enemies = getEnemies();
		if (proj.owner === 'player') {
			for (const e of [...enemies]) {
				// Phase 5.5k k-3: 隠れ中（潜行/地中/滞空）の敵は「そこに居ない」＝
				// 投擲物は一切触れずに素通りする。ダメージだけを無効化していた頃は
				// ブーメランが地中の蟲・滞空の蜘蛛でUターンし、スタン⭐とガード解除まで
				// 掛かっていた（2026-08-14 ユーザー報告）∴当たり判定の側で外す。
				// 副作用として矢も消費されず _hitIds も汚れない（浮上後に当て直せる）。
				if (e.hidden) continue;
				// 占有範囲（AABB）ベース。1×1 敵では従来の 0.6 箱と一致する。
				if (enemyPointHit(e, proj.x, proj.y, 0.6)) {
					const eMeta = ENEMY_META[e.type];
					// reflectsProjectiles: プレイヤーの投擲物をそのまま打ち返す。
					// 盾 reflect（phase 7-2）と同形だが owner の向きが逆（enemy→player）。
					if (eMeta?.reflectsProjectiles) {
						playSound('shieldBlock');
						showShieldBlockEffect(proj.x, proj.y);
						proj.owner = 'enemy';
						proj.ownerId = e.id;
						proj.dx = -proj.dx;
						proj.dy = -proj.dy;
						proj._hitIds = new Set([e.id]); // 打ち返し後の即再ヒット防止
						proj.x += proj.dx * 0.5;
						proj.y += proj.dy * 0.5;
						return; // 消さずに敵の投擲物として飛ばし続ける
					}
					// 貫通する投擲物（満タン剣ビーム等）は同じ敵に二重ヒットしない
					if (proj.piercing) {
						if (!proj._hitIds) proj._hitIds = new Set();
						if (proj._hitIds.has(e.id)) continue;
						proj._hitIds.add(e.id);
						dealDamageToEnemy(e, proj.atk, proj.type, proj.x, proj.y);
						continue;  // 貫通：消えずに飛び続ける
					}
					if (proj.type === 'boomerang') {
						// Phase 4-6: 往路・復路とも敵に当たる。同じ敵への多段ヒットは
						// _hitIds で1回に絞る（往路で1体目に当たったら折り返し、
						// 復路は貫通のように touched した敵を1回ずつ削る）。
						if (!proj._hitIds) proj._hitIds = new Set();
						if (proj._hitIds.has(e.id)) continue;
						proj._hitIds.add(e.id);
						dealDamageToEnemy(e, proj.atk, proj.type, proj.x, proj.y);
						// Phase 5.5k: ブーメランの命中は「動きを止める」＝スタン＋ガード解除を
						// ザコには与える（ダメージが正面ブロックされても阻害効果は貫通する）。
						// ユーザー設計＝ブーメランは削りの道具でなくガードを崩すための道具＝
						// 「ブーメランで動きを止めてガード不能にしてから攻撃する」の実体。
						//
						// Phase 8-4 (2)（2026-08-23・実プレイ検証の結果）：**ボスは硬直しない**。
						// ブーメランの往復は木 6マス≒0.7秒／銀 12マス≒0.6秒＜スタン 1500ms
						// ∴投げ続けるだけでボスを永久に固められ、ブーメラン＋剣の連打だけで
						// 全ボスに勝ててしまっていた（ユーザー報告）。ダメージは残し硬直だけ外す。
						// 判定は ENEMY_META から導出＝`stunnable` が明示されていればそれに従い、
						// 無ければ「ボスでない敵だけ硬直する」（個別の例外を書けるようにしてある）。
						if (eMeta?.stunnable ?? !eMeta?.isBoss) {
							e.stunUntil = gameNow() + BOOMERANG_STUN_MS;
							e._guarding = false;
							showStunEffect(e);
						}
						if (!proj.returning) {
							proj.returning = true;  // 往路：1体目で折り返す（従来挙動）
							return;
						}
						continue;  // 復路：貫通して次の敵も削れるようにする
					}
					dealDamageToEnemy(e, proj.atk, proj.type, proj.x, proj.y);
					removeProjEl(proj);
					_projectiles = _projectiles.filter(p => p !== proj);
					return;
				}
			}
		} else {
			// 敵の投擲物 → プレイヤーに当たるか
			const player = getPlayer();
			if (Math.abs(player.x - proj.x) < 0.5 && Math.abs(player.y - proj.y) < 0.5) {
				const blocked = isShieldBlocking(proj);
				if (blocked) {
					playSound('shieldBlock');
					showShieldBlockEffect(proj.x, proj.y);
					// Phase 7-2: 上位盾（reflect>0）は敵の「投擲物」を打ち返す。
					// dx/dy を反転し owner→player・atk=元atk×reflect にして敵に当てる
					// （剣＝近接攻撃はここを通らないのでガードのみ）。
					const tier = SHIELD_TIERS[player.shieldTier ?? -1];
					const reflect = tier?.reflect ?? 0;
					if (reflect > 0) {
						proj.owner = 'player';
						proj.dx = -proj.dx;
						proj.dy = -proj.dy;
						proj.atk = Math.max(1, Math.round(proj.atk * reflect));
						proj._hitIds = new Set();   // 跳ね返し後の二重ヒット防止用に初期化
						// 跳ね返した投擲物はプレイヤーから少し離して再配置（即自爆防止）
						proj.x += proj.dx * 0.5;
						proj.y += proj.dy * 0.5;
						return;  // 消さずに player の投擲物として飛ばし続ける
					}
				} else {
					takeDamage(proj.atk);
				}
				removeProjEl(proj);
				_projectiles = _projectiles.filter(p => p !== proj);
			}
		}
	}

	// ── ブーメランのステップ処理 ──────────────────────────────
	// 1tick 分の移動を「当たり判定を飛び越えない大きさ」に分割してから進める。
	// 銀のブーメラン（speed 5.0 → 1tick 2.5セル）は当たり判定 0.6 セルの箱を
	// 丸ごと飛び越える∴分割しないと敵・アイテム・かがり火をすり抜ける
	// （非ブーメランの投擲物は projectileTick 側で同じ補間をしている）。
	// ⚠️ 「折り返す／キャッチする」の判定は **tick 境界のまま**にする。
	// 分割ごとに判定すると木のブーメランの実到達・往復時間が変わる（既存挙動の
	// 回帰）∴分割で細かくするのは「進む」「当たる」「拾う」だけ。
	// Phase 5.5k k-6: 「帰る先」＝プレイヤーのブーメランは投げた本人（プレイヤー）、
	// 敵のブーメラン（ブーメラン鬼）は投げた敵。**投げた敵が死んでいたら発射点へ帰る**
	// （追う相手が消えた投擲物が永久に飛び続けるのを防ぐ＝発射点に着いた時点で消える）。
	function boomerangHome(proj) {
		if (proj.owner === 'player') {
			const p = getPlayer();
			return { x: p.x, y: p.y };
		}
		const owner = getEnemies().find(e => e.id === proj.ownerId);
		if (owner) return { x: owner.x, y: owner.y };
		return { x: proj.startX, y: proj.startY };
	}

	function boomerangStep(proj, step) {
		const SUB_STEP = 0.4;                                   // = HIT_RADIUS(0.5) * 0.8
		const numSubs = Math.max(1, Math.ceil(step / SUB_STEP));
		// Phase 5.5k k-6: 通過セルの回収（アイテム・かがり火）は**プレイヤーのブーメランだけ**。
		// 敵のブーメランが床のアイテムを持ち去ったりロウソクに点火したら、ギミックが
		// 敵の手で解けてしまう（剣獣のビームでスイッチが入る抜け道を塞いだのと同じ理由）。
		const collects = proj.owner === 'player';

		if (!proj.returning) {
			// 往路：tick 冒頭の距離で折り返しを決める（従来と同じ）
			const dist = Math.sqrt(
				(proj.x - proj.startX) ** 2 + (proj.y - proj.startY) ** 2,
			);
			// ⚠️ 座標は「tick 冒頭 + 進捗率」で出す（proj.x += sub の累積は禁止）。
			// sub を足し込むと 6.5 + (1/3)*3 = 7.49999… となり toTileCol が 8 でなく
			// 7 を返す＝tick 末尾のセルが1つ手前にずれてアイテムを拾い落とす。
			const x0 = proj.x, y0 = proj.y;
			for (let i = 0; i < numSubs; i++) {
				const t = (i + 1) / numSubs;
				proj.x = x0 + proj.dx * step * t;
				proj.y = y0 + proj.dy * step * t;
				const hitWall = !isInBounds(proj.x, proj.y) ||
					!isTilePassableForProj(toTileRow(proj.y), toTileCol(proj.x));
				checkProjHit(proj);
				if (!_projectiles.includes(proj)) return;   // 命中で除去された
				if (collects) collectAlongBoomerang(proj);
				if (hitWall) { proj.returning = true; return; }
			}
			if (dist >= proj.maxRange) proj.returning = true;
			return;
		}

		// 復路：tick 冒頭で帰る先に届いていればキャッチ（従来と同じ）
		const home = boomerangHome(proj);
		const tdx0 = home.x - proj.x;
		const tdy0 = home.y - proj.y;
		const d0   = Math.sqrt(tdx0 * tdx0 + tdy0 * tdy0);
		if (d0 < step + 0.3) {
			// Phase 4-6: キャッチ成立＝運搬アイテムをここで確定加算する。
			removeProjEl(proj);
			_projectiles = _projectiles.filter(p => p !== proj);
			// Phase 5.5k k-6: 敵が受け取るときは音もメッセージも出さない
			// （「キャッチした！」はプレイヤーの手応えの表示＝敵の手元では嘘になる）。
			if (proj.owner === 'player') {
				playSound('item'); pulse('{{boomerang}} ブーメランをキャッチした！');
				if (finalizeCarried) for (const c of (proj.carried || [])) finalizeCarried(c);
			}
			return;
		}
		// 向きは tick 冒頭の帰る先の位置で決める（プレイヤー・敵とも tick 内で動かない）。
		// 往路と同じく座標は「tick 冒頭 + 進捗率」で出す＝累積の丸め誤差を作らない。
		const ux = tdx0 / (d0 || 1), uy = tdy0 / (d0 || 1);
		const rx0 = proj.x, ry0 = proj.y;
		for (let i = 0; i < numSubs; i++) {
			const t = (i + 1) / numSubs;
			proj.x = rx0 + ux * step * t;
			proj.y = ry0 + uy * step * t;
			checkProjHit(proj);  // Phase 4-6: 復路も敵に当たる
			if (!_projectiles.includes(proj)) return;
			if (collects) collectAlongBoomerang(proj);
		}
	}

	// ── 放物線で投げる投擲物のステップ処理（Phase 5.5k k-6 #6 爆弾鬼） ────────
	// 「まっすぐ飛んで当たったら消える」既存の投擲物と違い、**投げた瞬間に決めた着弾点へ
	// 必ず落ちる**＝飛翔中は壁も水も敵もプレイヤーも一切素通りする（上を通る）。
	// ∴遮蔽の裏に隠れても爆弾は届く／盾では防げない（避けるにはその場を離れる）。
	// ⚠️ 座標は「始点 ＋ 進捗率」で出す（proj.x += … の累積は禁止）＝速度を変えても
	// 着弾セルが1ドットもずれない（[[blade-speed-up-needs-interpolation]] と同じ作法）。
	function lobStep(proj, step) {
		const total = Math.max(0.001, proj._lobTotal ?? Math.sqrt(
			(proj.targetX - proj.startX) ** 2 + (proj.targetY - proj.startY) ** 2,
		));
		proj._lobTotal = total;
		proj._lobT = Math.min(1, (proj._lobT ?? 0) + step / total);
		proj.x = proj.startX + (proj.targetX - proj.startX) * proj._lobT;
		proj.y = proj.startY + (proj.targetY - proj.startY) * proj._lobT;
		if (proj._lobT < 1) return;
		// 着弾＝投げた瞬間に記録したセルで爆発する（プレイヤーが動いていても着弾点は動かない）。
		removeProjEl(proj);
		_projectiles = _projectiles.filter(p => p !== proj);
		const blast = proj.blast ?? {};
		explodeAt(toTileRow(proj.targetY), toTileCol(proj.targetX), {
			radius:       blast.radius     ?? 1.5,
			breakPower:   blast.breakPower ?? 3,
			// Phase 8-4 (4) 0d-3（5体目 O 古森の巨人）: 音と見た目を投げた側から差し替えられる
			// ようにする（既定は爆弾のまま＝爆弾鬼の挙動は1ドットも変わらない）。
			// ⚠️ これが無いと**岩が落ちたのに炎の爆発が出て `bombExplosion` が鳴る**。
			//    O の弱点は fire ∴炎の演出は「弱点が効いた」と取り違えられる＝機構の嘘になる。
			sound:        blast.sound,
			effect:       blast.effect,
			// 敵の爆弾は**他の敵を巻き込まない**（味方撃ちは実装しない＝DECISIONS 2026-08-16）。
			// 理由＝敵同士が潰し合うと「敵を集めた部屋」の脅威度が設計と無関係に崩れる。
			enemyDamage:  proj.owner === 'enemy' ? 0 : (blast.damage ?? 4),
			playerDamage: proj.owner === 'enemy' ? (blast.damage ?? 4) : 0,
		});
	}

	// 通過セルのアイテム回収・かがり火の受け渡し（往路・復路とも1サブステップ毎）
	function collectAlongBoomerang(proj) {
		const cr = toTileRow(proj.y), cc = toTileCol(proj.x);
		if (collectFieldItem) {
			const c = collectFieldItem(cr, cc);
			if (c) (proj.carried = proj.carried || []).push(c);
		}
		// 敵ドロップ（heart/rupee/bomb/arrow）もブーメランで運搬する（Phase 4-6）
		if (collectFloorDrop) {
			const d = collectFloorDrop(cr, cc);
			if (d) (proj.carried = proj.carried || []).push(d);
		}
		// Phase 4-5 ②: ブーメランで炎を運ぶ
		const br  = toTileRow(proj.y);
		const bc  = toTileCol(proj.x);
		const bpk = `${br},${bc}`;
		const bss = getSS(getCurrentLayer(), getStageKey());
		if (getStageData()?.tiles[br]?.[bc] === TILE.TORCH) {
			if (bss.litTorches?.has(bpk)) {
				proj.flaming = true;  // 点いたかがり火から炎を拾う
			} else if (proj.flaming) {
				bss.litTorches.add(bpk);  // 消えたかがり火に点火
				evaluateConditions();
				renderBoard(); renderChars();
				pulse('{{torch}} かがり火に火が灯った！');
				saveGame();
			}
		}
	}

	// ── 投擲物ループ（毎 tick 呼ぶ） ─────────────────────────
	function projectileTick() {
		for (const proj of [..._projectiles]) {
			const step = proj.speed * MOVE_STEP;
			// Phase 5.5k k-6: 往復の経路に乗るのは「プレイヤーのブーメラン」と
			// 「returnsToOwner を持つ投擲物（ブーメラン鬼）」だけ。
			// ⚠️ owner だけで判定していた条件をそのまま `!== 'player'` へ広げてはいけない
			// ＝敵に打ち返されたプレイヤーのブーメラン（reflectsProjectiles）は
			// 従来どおり**まっすぐ飛ぶ**（往復させると打ち返しの意味が変わる＝回帰）。
			// ∴明示のフラグで分ける。
			if (proj.type === 'boomerang' && (proj.owner === 'player' || proj.returnsToOwner)) {
				boomerangStep(proj, step);
				// キャッチ/壁/命中で除去済みなら moveProjEl を呼ばない
				// （呼ぶと moveProjEl の「要素が無ければ再生成」が残骸を復活させる）
				if (!_projectiles.includes(proj)) continue;
			} else if (proj.lob) {
				// 放物線＝壁・水・キャラを素通りして着弾点まで飛ぶ（当たり判定を通さない）
				lobStep(proj, step);
				if (!_projectiles.includes(proj)) continue;
			} else {
				// ── 高速投擲物のトンネリング防止：区間補間チェック ──────
				// 1tick の移動量が大きいと敵のヒットボックス（0.6セル）を
				// 飛び越えて当たり判定が抜ける（トンネリング）。
				// ヒットボックス半径（0.5）以下の小ステップに分割して補間チェックを行う。
				const HIT_RADIUS = 0.5;         // 当たり判定に使う距離
				const SUB_STEP = HIT_RADIUS * 0.8; // 分割ステップ（重複なく全域をカバー）
				const numSubs = Math.max(1, Math.ceil(step / SUB_STEP));
				const dx = proj.dx * step / numSubs;
				const dy = proj.dy * step / numSubs;

				let hit = false;
				for (let i = 0; i < numSubs; i++) {
					proj.x += dx;
					proj.y += dy;
					// 境界チェック
					if (!isInBounds(proj.x, proj.y)) {
						removeProjEl(proj);
						_projectiles = _projectiles.filter(p => p !== proj);
						hit = true;
						break;
					}
					// 壁衝突チェック
					if (!isTilePassableForProj(toTileRow(proj.y), toTileCol(proj.x))) {
						removeProjEl(proj);
						_projectiles = _projectiles.filter(p => p !== proj);
						hit = true;
						break;
					}
					// Phase 4-5 ①：投擲武器がスイッチ（SWITCH）に当たったらトグルする。
					// ・矢（arrow）：当たったら消える（1本＝1トグル）
					// ・剣ビーム（beam）：貫通するので「1セル1回だけ」トグル（proj._switchedCells で重複防止）
					// ボタン（BUTTON）はモーメンタリ式なので投擲武器では反応しない＝役割分離。
					if ((proj.type === 'arrow' || proj.type === 'beam') && proj.owner === 'player' && toggleSwitch) {
						const sr = toTileRow(proj.y), sc = toTileCol(proj.x);
						if (getStageData()?.tiles[sr]?.[sc] === TILE.SWITCH) {
							if (proj.type === 'arrow') {
								toggleSwitch(sr, sc);
								removeProjEl(proj);
								_projectiles = _projectiles.filter(p => p !== proj);
								hit = true;
								break;
							}
							// beam：同じセルを複数サブステップで跨いでも1回だけトグル
							if (!proj._switchedCells) proj._switchedCells = new Set();
							const sk = `${sr},${sc}`;
							if (!proj._switchedCells.has(sk)) {
								proj._switchedCells.add(sk);
								toggleSwitch(sr, sc);
							}
						}
					}
					// Phase 5-1: 投擲武器が色スイッチに当たったら activeColor をセット。
					if ((proj.type === 'arrow' || proj.type === 'beam') && proj.owner === 'player' && setActiveColor) {
						const sr = toTileRow(proj.y), sc = toTileCol(proj.x);
						const stile = getStageData()?.tiles[sr]?.[sc];
						if (stile === TILE.SWITCH_RED || stile === TILE.SWITCH_BLUE) {
							if (proj.type === 'arrow') {
								setActiveColor(sr, sc);
								removeProjEl(proj);
								_projectiles = _projectiles.filter(p => p !== proj);
								hit = true;
								break;
							}
							// beam：同じセルを複数サブステップで跨いでも1回だけセット
							if (!proj._switchedCells) proj._switchedCells = new Set();
							const csk = `${sr},${sc}`;
							if (!proj._switchedCells.has(csk)) {
								proj._switchedCells.add(csk);
								setActiveColor(sr, sc);
							}
						}
					}
					// 当たり判定
					checkProjHit(proj);
					if (!_projectiles.includes(proj)) {
						hit = true;
						break;
					}
				}
				if (hit) continue;
			}
			moveProjEl(proj);
		}
	}

	// ── 投擲物の追加（プレイヤー用） ──────────────────────────
	// ID を自動割り当てし、DOM 要素も作成して追加する
	function addProjectile(config) {
		const proj = { id: _nextProjId++, ...config };
		_projectiles.push(proj);
		createProjEl(proj);
		return proj;
	}

	// ── 敵の飛翔物発射 ────────────────────────────────────────
	// enemy-ai.js の enemyAttack から呼ぶ
	// extra（Phase 5.5k）… 投擲物に追加で載せるフィールド（strong / piercing / range 等）。
	//   剣獣の飛ぶ斬撃や今後の爆弾鬼・ブーメラン鬼が種別ごとの差を渡すための拡張点。
	//   type ごとの分岐をここに増やさず、呼び出し側（ENEMY_META の attacks）で宣言する。
	function fireEnemyProjectile(e, type, ndx, ndy, speed, extra = {}) {
		// Phase 5.5k k-6: 発射点（startX/startY）と撃った本人（ownerId）は**種別を問わず**入れる。
		//   startX/startY … 放物線（lob）の始点／往復（returnsToOwner）の飛距離の基点。
		//                   プレイヤーのブーメラン（addProjectile）も同じ名前を入れている。
		//   ownerId       … 帰る先（撃った敵）を引くための ID。既存の reflectsProjectiles も
		//                   同じ名前で敵の ID を入れている＝新しい名前を増やさない。
		// type ごとの分岐にしない理由＝「投げた場所」は全ての投擲物に意味がある値で、
		// 後から種別を足すたびに書き足すと入れ忘れが起きる（extra の設計と同じ思想）。
		const sx = e.x + ndx * 0.8;
		const sy = e.y + ndy * 0.8;
		const proj = {
			id:    _nextProjId++,
			owner: 'enemy',
			ownerId: e.id,
			type,
			x: sx, y: sy,
			startX: sx, startY: sy,
			dx: ndx, dy: ndy,
			speed,
			atk: ENEMY_META[e.type]?.atk ?? 2,
			...extra,
		};
		_projectiles.push(proj);
		createProjEl(proj);
	}

	// 全投擲物を消去（ステージ遷移時など）
	function clearProjectiles() {
		for (const p of _projectiles) {
			// Phase 4-6: 未キャッチで消えるブーメランの運搬アイテムは取り逃し＝その場に残す。
			if (restoreCarried) for (const c of (p.carried || [])) restoreCarried(c);
			removeProjEl(p);
		}
		_projectiles = [];
	}

	// ── 爆弾 ──────────────────────────────────────────────────
	function clearBombs() {
		for (const b of _placedBombs) b.el?.remove();
		_placedBombs = [];
	}

	// ── 置いた炎（ロウソク・2026-08-31）──────────────────────────────
	// ロウソクは「押した瞬間に前方を殴る道具」から「その場に炎を置く道具」になった。
	// 連打で溶ける穴を**機構で**塞ぐのが目的（理由と数の出どころは constants.js の
	// CANDLE_FLAME_MS / CANDLE_FLAME_MAX のコメント）。
	//   ・1つの炎は 1体の敵に**1回だけ**ダメージを与える（`burned` に敵 id を記録）
	//   ・同時に置けるのは CANDLE_FLAME_MAX 個・寿命は CANDLE_FLAME_MS
	//   ・敵AIは炎を避けない＝踏ませる読み合いはプレイヤー側の仕事
	//   ・プレイヤーは自分の炎で焼けない（かがり火と同じ＝床の飾りではなく罠だが自傷はしない）
	// 爆弾（_placedBombs / bombTick / clearBombs）と同型に揃える＝「置く・毎tick見る・
	// 画面遷移で消す」の3点セット。
	function clearFlames() {
		for (const f of _placedFlames) f.el?.remove();
		_placedFlames = [];
	}

	// 炎の DOM を作る／消えていたら作り直す。
	// ⚠️ renderChars() は char-layer を innerHTML='' で作り直す（render-chars.js:374）∴
	// 置いた炎の要素は再描画で消える。論理上は燃えているのに絵が無い＝「見えない炎に
	// 焼かれる」になる∴毎tick 繋がっているか見て、外れていたら生やし直す。
	function ensureFlameEl(flame) {
		if (flame.el?.isConnected) return;
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = 'candle-flame';
		el.id = `candle-flame-${flame.id}`;
		el.style.cssText = `position:absolute;left:${flame.c * cellPx}px;top:${flame.r * cellPx}px;`
			+ `width:${cellPx}px;height:${cellPx}px;z-index:24;pointer-events:none;`;
		// 残り時間ぶんだけ揺らめかせる（絵の長さの単一の真実は論理時間側＝flame.until）。
		const leftMs = Math.max(0, flame.until - gameNow());
		el.style.animationDuration = `${leftMs}ms`;
		el.style.animationDelay = `-${CANDLE_FLAME_MS - leftMs}ms`;
		charLayerEl.appendChild(el);
		flame.el = el;
	}

	// 炎のタイルに重なっている敵を焼く（その炎で未焼却の敵だけ）。焼いたら true。
	function burnEnemiesOnFlame(flame) {
		let burned = false;
		for (const e of getEnemies()) {
			if (!e || e.hp <= 0) continue;
			if (e.hidden) continue;                       // 潜行/地中/滞空には炎も届かない
			if (flame.burned.has(e.id)) continue;         // この炎ではもう焼いた
			if (!enemyOccupiesTile(e, flame.r, flame.c)) continue;
			flame.burned.add(e.id);
			// 攻撃の発生源は**炎のタイル**（プレイヤーの位置ではない）＝置いたあとに
			// プレイヤーがどこへ動いても向き依存のガード判定（isGuardBlockingDir）が変わらない。
			dealDamageToEnemy(e, CANDLE_FIRE_DMG, 'fire', flame.c, flame.r);
			burned = true;
		}
		return burned;
	}

	// (r, c) に炎を置く。戻り値＝'burned'（置いた瞬間に敵を焼いた）／'placed'／
	// 'exists'（同じタイルが既に燃えている）／'full'（上限）。
	// ⚠️ **置いた瞬間にも判定する**のが要点。これが無いと「動かない敵には炎が一生
	// 当たらない」＝炎弱点のボスが弱点ごと機能停止する（じっと待つのが最適解になる）。
	function placeCandleFlame(r, c) {
		if (_placedFlames.some(f => f.r === r && f.c === c)) return 'exists';
		if (_placedFlames.length >= CANDLE_FLAME_MAX)       return 'full';
		const flame = {
			id: _nextProjId++, r, c,
			until: gameNow() + CANDLE_FLAME_MS,
			burned: new Set(),
			el: null,
		};
		_placedFlames.push(flame);
		ensureFlameEl(flame);
		return burnEnemiesOnFlame(flame) ? 'burned' : 'placed';
	}

	function flameTick() {
		const now = gameNow();
		for (const flame of [..._placedFlames]) {
			if (now >= flame.until) { removeFlame(flame); continue; }
			ensureFlameEl(flame);
			burnEnemiesOnFlame(flame);
		}
	}

	function removeFlame(flame) {
		flame.el?.remove();
		_placedFlames = _placedFlames.filter(f => f !== flame);
	}

	// テスト観測用スナップショット（敵スナップショットと同じホワイトリスト方式）。
	function getPlacedFlames() {
		return _placedFlames.map(f => ({
			id: f.id, r: f.r, c: f.c,
			until: f.until,
			burnedCount: f.burned.size,
			hasEl: !!f.el?.isConnected,
		}));
	}

	function placeBomb() {
		const player = getPlayer();
		const id  = player.activeSubItem;
		const si  = player.subItems[id];
		if (!si || si.count <= 0) { pulse('爆弾がない！'); return; }

		const r = toTileRow(player.y);
		const c = toTileCol(player.x);
		si.count--;
		if (si.count <= 0) {
			delete player.subItems[id];
			player.activeSubItem = Object.keys(player.subItems)[0] ?? null;
		}
		updateHud();

		const charLayerEl = getCharLayerEl();
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = 'char-abs bomb-placed';
		el.id = `bomb-${_nextProjId}`;
		el.style.left = `${c * cellPx}px`;
		el.style.top  = `${r * cellPx}px`;
		el.style.zIndex = '8';
		// 10e: 置いた爆弾は絵文字でなく爆弾の絵（持ち物・ドロップと同じ bombItem）。
		// 大きさは飛翔物と同じ 0.35 ではなくセルの 0.6＝「床に置いてある物」として読める大きさ。
		const bombCv = makeSprite('bombItem', 'bombItem', false);
		if (bombCv) {
			const sz = Math.round(cellPx * 0.6) + 'px';
			bombCv.style.setProperty('width',  sz, 'important');
			bombCv.style.setProperty('height', sz, 'important');
			el.appendChild(bombCv);
		} else {
			el.textContent = '💣';
			el.style.fontSize = `${cellPx * 0.55}px`;
			el.style.lineHeight = `${cellPx}px`;
			el.style.textAlign = 'center';
		}
		charLayerEl?.appendChild(el);

		playSound('item');
		const bomb = { id: _nextProjId++, r, c, fuseEnd: gameNow() + 2000, el };
		_placedBombs.push(bomb);
	}

	function bombTick() {
		const now = gameNow();
		for (const bomb of [..._placedBombs]) {
			if (now < bomb.fuseEnd) continue;
			explodeBomb(bomb);
		}
	}

	function explodeBomb(bomb) {
		bomb.el?.remove();
		_placedBombs = _placedBombs.filter(b => b !== bomb);
		explodeAt(bomb.r, bomb.c);
	}

	// ── 爆発（プレイヤーの爆弾と敵の爆弾で共有・Phase 5.5k k-6 で抽出） ──────
	// 「円形の爆風で `!` を壊し・範囲内のものを傷める・演出を出す」までを1か所に集める。
	// 抽出した理由＝爆弾鬼（#6）の爆弾は**プレイヤーの爆弾と同じ爆風でなければ嘘になる**
	// （壁を壊せる範囲が違えば、プレイヤーは自分の爆弾から範囲を学べない）。
	// opts:
	//   radius       … 爆風半径（セル）。既定＝プレイヤーの爆弾（ITEM_META.bomb.aoeRadius）
	//   breakPower   … `!`（壊せる壁）を壊す力
	//   enemyDamage  … 範囲内の敵に与えるダメージ。**0 なら敵を巻き込まない**
	//   playerDamage … 範囲内のプレイヤーに与えるダメージ。**0 ならプレイヤーを巻き込まない**
	//   sound        … 鳴らす効果音の名前（既定＝爆弾の `bombExplosion`）
	//   effect       … 見た目の種別（既定＝炎の `blast`／`'rock'` は灰色の土煙）
	// ⚠️ 既定は「敵だけを傷める」＝プレイヤーの爆弾の従来挙動と1ドットも変えない
	//   （自爆しない＝Phase 1 からの仕様）。
	function explodeAt(r, c, opts = {}) {
		const {
			radius       = ITEM_META.bomb?.aoeRadius  ?? 2,
			breakPower   = ITEM_META.bomb?.breakPower ?? 3,
			enemyDamage  = ITEM_META.bomb?.damage     ?? 5,
			playerDamage = 0,
			sound        = 'bombExplosion',
			effect       = 'blast',
		} = opts;
		// ⚠️ `sound: undefined` を渡されても既定に落ちる（`= 'bombExplosion'` の分割代入）
		//    ＝呼び出し側は「差し替えたいときだけ」書けばよい。
		playSound(sound);

		const sd = getStageData();
		if (!sd) return;
		const ss = getSS(getCurrentLayer(), getStageKey());

		let needRenderBoard = false;
		const AOE = Math.ceil(radius);
		for (let dr = -AOE; dr <= AOE; dr++) {
			for (let dc = -AOE; dc <= AOE; dc++) {
				if (Math.sqrt(dr * dr + dc * dc) > radius) continue;
				const tr = r + dr;
				const tc = c + dc;
				if (tr < 0 || tr >= sd.rows || tc < 0 || tc >= sd.cols) continue;
				const posKey = `${tr},${tc}`;
				const tile   = sd.tiles[tr][tc];

				// 壊せる壁の破壊
				if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) {
					const bwDef = sd.breakableWalls?.[posKey]?.breakDef ?? 1;
					if (breakPower >= bwDef) {
						ss.brokenWalls.add(posKey);
						evaluateConditions();
						needRenderBoard = true;
					}
				}

				// 敵ダメージ（隠れ中の敵は爆風の対象外＝地中/滞空の敵に爆風は届かない）
				if (enemyDamage > 0) {
					for (const e of [...getEnemies()]) {
						if (e.hidden) continue;
						if (toTileRow(e.y) === tr && toTileCol(e.x) === tc) {
							dealDamageToEnemy(e, enemyDamage, 'bomb');
						}
					}
				}
			}
		}

		// プレイヤーダメージは「セルの走査」ではなく中心からの距離で見る
		// （プレイヤーは半セル位置に立てる＝タイル単位で数えると爆風の縁で1セルずれる）。
		if (playerDamage > 0) {
			const player = getPlayer();
			const pd = Math.sqrt((player.x - c) ** 2 + (player.y - r) ** 2);
			if (pd <= radius) takeDamage(playerDamage);
		}

		// renderBoard が必要な場合は先に実行してからエフェクト追加
		if (needRenderBoard) { renderBoard(); renderChars(); }
		// 絵はダメージ範囲の**上位集合**にする（GUIDE §7-6）＝「何も描かれていない床で殴られた」を
		// 作らない。既定の 3 セル（＝半径 1.5 まで）で足りるのは爆弾と爆弾鬼だけ∴**プレイヤーが
		// 傷む爆風のときだけ**半径から直径を出す（O 古森の巨人の後半の岩は半径 1.6 ＝縁の被弾が
		// 3 セルの円の外に出る）。爆弾の見た目は 1 ドットも変わらない（playerDamage 0）。
		showExplosionEffect(r, c, effect, playerDamage > 0 ? Math.max(3, radius * 2 + 1) : 3);
		saveGame();
	}

	// 爆発の見た目。kind で色を差し替える（形・アニメは共通＝
	// 「爆風の範囲は爆弾から学べる」を崩さない）。
	//   'blast'（既定）… 炎（黄→橙→赤）
	//   'rock'          … 岩が砕けた土煙（灰→茶）＝O 古森の巨人の岩投げ
	// spanCells＝円の直径（セル）。既定 3（＝爆弾の見た目そのまま）。呼び出し側が
	// ダメージ半径から広げる（＝絵がダメージ範囲を覆う・上の explodeAt の⚠️）。
	const EXPLOSION_FILLS = {
		blast: 'radial-gradient(circle, rgba(255,220,60,0.92) 0%, rgba(255,100,20,0.7) 40%, rgba(255,40,0,0.3) 70%, transparent 100%)',
		rock:  'radial-gradient(circle, rgba(235,228,214,0.92) 0%, rgba(150,132,108,0.72) 40%, rgba(96,82,64,0.34) 70%, transparent 100%)',
	};
	function showExplosionEffect(r, c, kind = 'blast', spanCells = 3) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const span = (spanCells > 0 ? spanCells : 3) * cellPx;
		const el = document.createElement('div');
		el.className = `explosion-effect${kind !== 'blast' ? ` explosion-${kind}` : ''}`;
		el.style.cssText = [
			`position:absolute;`,
			// セル (r,c) の中心を円の中心にする（spanCells 3 なら従来と同じ左上）
			`left:${(c + 0.5) * cellPx - span / 2}px;top:${(r + 0.5) * cellPx - span / 2}px;`,
			`width:${span}px;height:${span}px;`,
			`z-index:20;pointer-events:none;border-radius:50%;`,
			`background:${EXPLOSION_FILLS[kind] ?? EXPLOSION_FILLS.blast};`,
			`animation:explosion-anim 0.45s ease-out forwards;`,
		].join('');
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 500);
	}

	// ── 公開 API ──────────────────────────────────────────────
	return {
		getProjectiles:      () => _projectiles,
		projectileTick,
		clearProjectiles,
		addProjectile,
		fireEnemyProjectile,
		isShieldBlocking,
		isShieldBlockingDir,
		showShieldBlockEffect,
		clearBombs,
		placeBomb,
		bombTick,
		showExplosionEffect,
		// 置いた炎（ロウソク・2026-08-31）
		clearFlames,
		placeCandleFlame,
		flameTick,
		getPlacedFlames,
	};
}
