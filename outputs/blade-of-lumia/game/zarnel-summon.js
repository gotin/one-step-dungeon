// game/zarnel-summon.js ── 女王の周回の闇のザーネルが手下を呼び出す（キュー116 ⑤・2026-11-22）
//
// ユーザーの言葉＝「闇のザーネルは何か少し強くなった要素をたせるといいかも？たとえば、ランダムに敵キャラを
// 生み出してくるとか（ただし最大でステージ内に3匹ぐらいまで？）」。
// 1周目のザーネル（石つぶて＋剣・HP 66%/33% で速くなり幻影）はそのまま。女王の周回（player.queenRun）だけ、
// 戦いの間に塔の敵を1体ずつ呼び出す。呼ぶ前に床へ予告（暗い渦）を出す＝いきなり隣に湧く理不尽を作らない。
//
// 規則：
//   ・手下（_summoned）が部屋に max 体未満のときだけ呼ぶ（倒せば次が来る＝呼ばれ続けるが、溜まらない）
//   ・最初の1体は戦いが始まって firstMs 後、以後は前の1体が現れてから intervalMs 後
//   ・場所＝床の上・他の敵と重ならない（isPassableForEnemy）・勇者から keepMin マス以上
//   ・ザーネルを倒したら手下は消える（boss.js onBossDefeated）
// 時間はゲームの時間（gameNow）＝ポーズや会話の間は進まない。
import { ENEMY_META } from '../shared/enemies.js';

export const ZARNEL_SUMMON = {
	// 塔に実際に出る敵から、広い玉座の間で戦える3種（骸骨剣士・跳躍蜘蛛・呪い火）
	pool: ['θ', 'β', 'ψ'],
	max: 3,
	firstMs: 3000,
	intervalMs: 6000,
	warnMs: 900,
	keepMin: 3,
};

export function createZarnelSummon(deps) {
	const {
		getEnemies, addEnemy, getPlayer, getStageData, isPassableForEnemy, makeEnemy,
		gameNow, getCharLayerEl, getCellPx, playSound, isBossDefeating,
		random = Math.random,
	} = deps;
	const C = ZARNEL_SUMMON;
	let nextAt = null;
	let pending = null;   // { r, c, type, at, el }
	let seq = 0;

	function clearWarn() {
		pending?.el?.remove();
		document.getElementById('summon-warn')?.remove();
	}
	function reset() {
		clearWarn();
		pending = null;
		nextAt = null;
	}
	// 予告の渦（renderChars が char-layer を作り直す＝毎 tick 貼り直す）
	function ensureWarnEl() {
		if (!pending) return;
		if (pending.el?.isConnected) return;
		const layer = getCharLayerEl(); if (!layer) return;
		const cp = getCellPx();
		const el = document.createElement('div');
		el.id = 'summon-warn';
		el.className = 'summon-warn';
		el.style.cssText = `position:absolute;left:${pending.c * cp}px;top:${pending.r * cp}px;width:${cp}px;height:${cp}px;`;
		layer.appendChild(el);
		pending.el = el;
	}
	function pickSpot() {
		const sd = getStageData(); if (!sd) return null;
		const p = getPlayer();
		const spots = [];
		for (let r = 1; r < sd.tiles.length - 1; r++) {
			for (let c = 1; c < (sd.tiles[r]?.length ?? 0) - 1; c++) {
				if (sd.tiles[r][c] !== '.' && !ENEMY_META[sd.tiles[r][c]]) continue;
				if (Math.hypot(r - p.y, c - p.x) < C.keepMin) continue;
				if (!isPassableForEnemy(r, c, { w: 1, h: 1 })) continue;
				spots.push({ r, c });
			}
		}
		if (!spots.length) return null;
		return spots[Math.floor(random() * spots.length)];
	}
	function spawn() {
		const { r, c, type } = pending;
		clearWarn();
		pending = null;
		if (isPassableForEnemy(r, c, { w: 1, h: 1 })) {
			const e = makeEnemy(type, r, c, `summon-${++seq}`);
			e._summoned = true;
			e.alwaysAlert = true;   // 呼ばれた手下は最初から勇者に気づいている
			addEnemy(e);
			playSound('appear');
		}
		nextAt = gameNow() + C.intervalMs;
	}

	function tick() {
		const p = getPlayer();
		const boss = getEnemies().find((e) => e.type === 'Z');
		if (!p?.queenRun || !boss || isBossDefeating()) { if (nextAt !== null || pending) reset(); return; }
		const now = gameNow();
		if (nextAt === null) nextAt = now + C.firstMs;
		if (pending) {
			if (now >= pending.at) spawn(); else ensureWarnEl();
			return;
		}
		if (now < nextAt) return;
		if (getEnemies().filter((e) => e._summoned).length >= C.max) { nextAt = now + 1000; return; }
		const spot = pickSpot();
		if (!spot) { nextAt = now + 1000; return; }
		pending = { ...spot, type: C.pool[Math.floor(random() * C.pool.length)], at: now + C.warnMs, el: null };
		playSound('decreeCast');
		ensureWarnEl();
	}

	return { tick, reset };
}
