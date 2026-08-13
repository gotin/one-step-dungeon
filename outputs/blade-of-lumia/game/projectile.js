// game/projectile.js ── 投擲物・爆弾管理（Phase 0-2 Step 5）
// createProjectile(deps) factory で生成する。
// 内部状態（_projectiles / _placedBombs / _nextProjId）はこのモジュールが所有。
// 盾ブロック判定・シールドエフェクトもここに置き、enemy-ai.js へ deps として注入する。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { makeSprite } from '../shared/sprites.js';
import { playSound } from '../shared/sounds.js';
import { MOVE_STEP, BOOMERANG_STUN_MS, SWORD_COOLDOWN_MS } from './constants.js';
import { SHIELD_TIERS } from '../shared/items.js';
import { enemyPointHit, enemyCenter } from './hitbox.js';

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
	let _projectiles = [];
	let _nextProjId  = 1;
	let _placedBombs = [];

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
	//  SHIELD_ATK_GEO）。以前は `SWORD_COOLDOWN_MS`(100ms) で判定していたが、
	// ポーズは `ATTACK_POSE_MS`(180ms) 続く∴差の 80ms は「盾が横を向いて見えているのに
	// 正面から防げる」食い違いになっていた。`_atkUntil` は論理時間∴step() でも一致する。
	// `getLastSwordTime` によるフォールバックは残す（_atkUntil を持たない古いセーブや、
	// swordAttack を経ずに lastSwordTime だけ動く経路のため）。
	function isShieldActive() {
		const player = getPlayer();
		if (!player.shield) return false;
		if (getIsCharging && getIsCharging()) return false;
		if (player._atkUntil != null && gameNow() < player._atkUntil) return false;
		if (getLastSwordTime && (gameNow() - getLastSwordTime() < SWORD_COOLDOWN_MS)) return false;
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

		const cv = makeSprite(proj.type, proj.type, false);  // 静止表示（アニメなし）
		if (cv) {
			const sz = Math.round(cellPx * 0.35) + 'px';
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
		el.style.top  = `${proj.y * cellPx}px`;
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
					const isz = Math.round(getCellPx() * 0.3) + 'px';
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
						// 常に与える（ダメージが正面ブロックされても阻害効果は貫通する）。
						// ユーザー設計＝ブーメランは削りの道具でなくガードを崩すための道具＝
						// 「ブーメランで動きを止めてガード不能にしてから攻撃する」の実体。
						e.stunUntil = gameNow() + BOOMERANG_STUN_MS;
						e._guarding = false;
						showStunEffect(e);
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
	function boomerangStep(proj, step) {
		const SUB_STEP = 0.4;                                   // = HIT_RADIUS(0.5) * 0.8
		const numSubs = Math.max(1, Math.ceil(step / SUB_STEP));
		const player = getPlayer();

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
				collectAlongBoomerang(proj);
				if (hitWall) { proj.returning = true; return; }
			}
			if (dist >= proj.maxRange) proj.returning = true;
			return;
		}

		// 復路：tick 冒頭でプレイヤーに届いていればキャッチ（従来と同じ）
		const tdx0 = player.x - proj.x;
		const tdy0 = player.y - proj.y;
		const d0   = Math.sqrt(tdx0 * tdx0 + tdy0 * tdy0);
		if (d0 < step + 0.3) {
			// Phase 4-6: キャッチ成立＝運搬アイテムをここで確定加算する。
			removeProjEl(proj);
			_projectiles = _projectiles.filter(p => p !== proj);
			playSound('item'); pulse('🪃 ブーメランをキャッチした！');
			if (finalizeCarried) for (const c of (proj.carried || [])) finalizeCarried(c);
			return;
		}
		// 向きは tick 冒頭のプレイヤー位置で決める（プレイヤーは tick 内で動かない）。
		// 往路と同じく座標は「tick 冒頭 + 進捗率」で出す＝累積の丸め誤差を作らない。
		const ux = tdx0 / (d0 || 1), uy = tdy0 / (d0 || 1);
		const rx0 = proj.x, ry0 = proj.y;
		for (let i = 0; i < numSubs; i++) {
			const t = (i + 1) / numSubs;
			proj.x = rx0 + ux * step * t;
			proj.y = ry0 + uy * step * t;
			checkProjHit(proj);  // Phase 4-6: 復路も敵に当たる
			if (!_projectiles.includes(proj)) return;
			collectAlongBoomerang(proj);
		}
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
				pulse('🔥 かがり火に火が灯った！');
				saveGame();
			}
		}
	}

	// ── 投擲物ループ（毎 tick 呼ぶ） ─────────────────────────
	function projectileTick() {
		for (const proj of [..._projectiles]) {
			const step = proj.speed * MOVE_STEP;
			if (proj.type === 'boomerang' && proj.owner === 'player') {
				boomerangStep(proj, step);
				// キャッチ/壁/命中で除去済みなら moveProjEl を呼ばない
				// （呼ぶと moveProjEl の「要素が無ければ再生成」が残骸を復活させる）
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
		const proj = {
			id:    _nextProjId++,
			owner: 'enemy',
			type,
			x: e.x + ndx * 0.8,
			y: e.y + ndy * 0.8,
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
		el.textContent = '💣';
		el.style.fontSize = `${cellPx * 0.55}px`;
		el.style.lineHeight = `${cellPx}px`;
		el.style.textAlign = 'center';
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
		playSound('bombExplosion');

		const sd  = getStageData();
		const AOE = ITEM_META.bomb?.aoeRadius ?? 2;
		const ss  = getSS(getCurrentLayer(), getStageKey());

		let needRenderBoard = false;
		for (let dr = -AOE; dr <= AOE; dr++) {
			for (let dc = -AOE; dc <= AOE; dc++) {
				if (Math.sqrt(dr * dr + dc * dc) > AOE) continue;
				const tr = bomb.r + dr;
				const tc = bomb.c + dc;
				if (tr < 0 || tr >= sd.rows || tc < 0 || tc >= sd.cols) continue;
				const posKey = `${tr},${tc}`;
				const tile   = sd.tiles[tr][tc];

				// 壊せる壁の破壊
				if (tile === TILE.BREAKABLE_WALL && !ss.brokenWalls.has(posKey)) {
					const bwDef = sd.breakableWalls?.[posKey]?.breakDef ?? 1;
					if ((ITEM_META.bomb?.breakPower ?? 3) >= bwDef) {
						ss.brokenWalls.add(posKey);
						evaluateConditions();
						needRenderBoard = true;
					}
				}

				// 敵ダメージ
				for (const e of [...getEnemies()]) {
					if (toTileRow(e.y) === tr && toTileCol(e.x) === tc) {
						dealDamageToEnemy(e, ITEM_META.bomb?.damage ?? 5, 'bomb');
					}
				}
			}
		}

		// renderBoard が必要な場合は先に実行してからエフェクト追加
		if (needRenderBoard) { renderBoard(); renderChars(); }
		showExplosionEffect(bomb.r, bomb.c);
		saveGame();
	}

	function showExplosionEffect(r, c) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = 'explosion-effect';
		el.style.cssText = [
			`position:absolute;`,
			`left:${(c - 1) * cellPx}px;top:${(r - 1) * cellPx}px;`,
			`width:${cellPx * 3}px;height:${cellPx * 3}px;`,
			`z-index:20;pointer-events:none;border-radius:50%;`,
			`background:radial-gradient(circle, rgba(255,220,60,0.92) 0%, rgba(255,100,20,0.7) 40%, rgba(255,40,0,0.3) 70%, transparent 100%);`,
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
	};
}
