// game/projectile.js ── 投擲物・爆弾管理（Phase 0-2 Step 5）
// createProjectile(deps) factory で生成する。
// 内部状態（_projectiles / _placedBombs / _nextProjId）はこのモジュールが所有。
// 盾ブロック判定・シールドエフェクトもここに置き、enemy-ai.js へ deps として注入する。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { ITEM_META } from '../shared/items.js';
import { makeSprite } from '../shared/sprites.js';
import { playSound } from '../shared/sounds.js';
import { MOVE_STEP, BOOMERANG_STUN_MS } from './constants.js';
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

	// dx/dy（攻撃の飛んでくる方向）に対して盾でブロックできるか判定
	function isShieldBlockingDir(dx, dy) {
		const player  = getPlayer();
		const heroDir = getHeroDir();
		if (!player.shield) return false;
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
			beam.className = 'sword-beam' + (proj.strong ? ' beam-strong' : '');
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
			div.appendChild(cv);
		}
		charLayerEl.appendChild(div);
		proj.el = div;
	}

	function moveProjEl(proj) {
		const el = document.getElementById(`proj-${proj.id}`);
		if (!el) return;
		const cellPx = getCellPx();
		el.style.left = `${proj.x * cellPx}px`;
		el.style.top  = `${proj.y * cellPx}px`;
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
					// 貫通する投擲物（満タン剣ビーム等）は同じ敵に二重ヒットしない
					if (proj.piercing) {
						if (!proj._hitIds) proj._hitIds = new Set();
						if (proj._hitIds.has(e.id)) continue;
						proj._hitIds.add(e.id);
						dealDamageToEnemy(e, proj.atk, proj.type);
						continue;  // 貫通：消えずに飛び続ける
					}
					dealDamageToEnemy(e, proj.atk, proj.type);
					if (proj.type !== 'boomerang') {
						removeProjEl(proj);
						_projectiles = _projectiles.filter(p => p !== proj);
					} else {
						e.stunUntil = gameNow() + BOOMERANG_STUN_MS;
						showStunEffect(e);
						proj.returning = true;  // ブーメランは折り返す
					}
					return;
				}
			}
		} else {
			// 敵の投擲物 → プレイヤーに当たるか
			const player = getPlayer();
			if (Math.abs(player.x - proj.x) < 0.5 && Math.abs(player.y - proj.y) < 0.5) {
				const blocked = player.shield && isShieldBlocking(proj);
				if (blocked) {
					playSound('shieldBlock');
					showShieldBlockEffect(proj.x, proj.y);
				} else {
					takeDamage(proj.atk);
				}
				removeProjEl(proj);
				_projectiles = _projectiles.filter(p => p !== proj);
			}
		}
	}

	// ── ブーメランのステップ処理 ──────────────────────────────
	function boomerangStep(proj, step) {
		const player = getPlayer();
		const dist = Math.sqrt(
			(proj.x - proj.startX) ** 2 + (proj.y - proj.startY) ** 2,
		);
		if (!proj.returning) {
			proj.x += proj.dx * step;
			proj.y += proj.dy * step;
			const hitWall = !isInBounds(proj.x, proj.y) ||
				!isTilePassableForProj(toTileRow(proj.y), toTileCol(proj.x));
			if (hitWall || dist >= proj.maxRange) proj.returning = true;
			checkProjHit(proj);
		} else {
			// 復路：プレイヤーへ向かう
			const tdx = player.x - proj.x;
			const tdy = player.y - proj.y;
			const d   = Math.sqrt(tdx * tdx + tdy * tdy);
			if (d < step + 0.3) {
				removeProjEl(proj);
				_projectiles = _projectiles.filter(p => p !== proj);
				playSound('item'); pulse('🪃 ブーメランをキャッチした！');
				return;
			}
			proj.x += (tdx / d) * step;
			proj.y += (tdy / d) * step;
		}
	}

	// ── 投擲物ループ（毎 tick 呼ぶ） ─────────────────────────
	function projectileTick() {
		for (const proj of [..._projectiles]) {
			const step = proj.speed * MOVE_STEP;
			if (proj.type === 'boomerang' && proj.owner === 'player') {
				boomerangStep(proj, step);
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
	function fireEnemyProjectile(e, type, ndx, ndy, speed) {
		const proj = {
			id:    _nextProjId++,
			owner: 'enemy',
			type,
			x: e.x + ndx * 0.8,
			y: e.y + ndy * 0.8,
			dx: ndx, dy: ndy,
			speed,
			atk: ENEMY_META[e.type]?.atk ?? 2,
		};
		_projectiles.push(proj);
		createProjEl(proj);
	}

	// 全投擲物を消去（ステージ遷移時など）
	function clearProjectiles() {
		for (const p of _projectiles) removeProjEl(p);
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
