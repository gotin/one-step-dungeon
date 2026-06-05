// ── Sword Duel – game.js ────────────────────────────────

// ── Palettes ──────────────────────────────────────────────
const PAL_HERO = ["transparent","#000000","#ff9500","#f1d7c9","#4cd964","#5856d6","#edd1c3"];
const PAL_ENEMY = ["transparent","#000000","#c03030","#f1d7c9","#8a1a1a","#3a0a0a","#edd1c3"];

// ── Sprite data (heroR, 32×32, 2 walk frames) ────────────
const SPRITE_HERO_R = [
	[
		[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,1,2,2,2,2,2,2,1,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,3,3,3,0,2,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,3,3,3,3,3,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,3,3,1,3,3,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,2,2,2,3,3,2,3,3,1,3,3,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,2,2,2,3,3,3,3,3,3,3,3,3,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,1,1,3,3,3,3,3,3,3,3,1,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,1,3,3,3,3,3,3,1,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,4,4,4,4,1,1,1,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,4,4,4,4,4,4,3,1,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,4,3,1,4,4,4,4,4,4,4,4,1,1,1,1,1,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,1,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,1,5,5,5,5,5,5,1,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,1,5,5,5,5,5,5,1,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,3,1,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,1,3,3,1,0,1,3,3,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0],
	],
	[
		[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,1,2,2,2,2,2,2,1,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,3,2,2,2,2,2,1,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,3,3,3,0,2,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,3,3,3,3,3,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,2,2,2,2,2,3,2,3,3,3,1,3,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,2,2,2,3,3,2,3,3,3,1,3,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,2,2,2,2,3,3,3,3,3,3,3,3,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,1,1,3,3,3,3,3,3,3,3,1,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,1,3,3,3,3,3,3,1,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,4,4,4,4,4,4,4,4,4,4,4,4,4,4,1,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,1,3,4,1,4,4,4,4,4,4,4,4,1,4,3,1,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,1,1,1,4,4,4,4,4,4,4,4,1,1,1,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,5,5,5,5,5,5,5,5,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,1,5,5,5,5,5,5,5,5,1,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,1,3,1,1,1,1,3,1,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,1,3,1,0,0,1,3,1,0,0,0,0,0,0,0,0,0,0,0,0],
		[0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0],
	],
];

// ── Arena constants ───────────────────────────────────────
const AW = 320;
const AH = 180;
const GROUND = AH - 20;
const GRAVITY = 0.55;
const JUMP_VY = -6.5;
const JUMP_VX = 2.8;
const WALK_SPD = 2.2;
const SPRITE_W = 32;
const SPRITE_H = 32;
const SCALE = 2;

// ── Slash animation constants ─────────────────────────────
const SLASH_ANGLE_START = -Math.PI * 0.55;
const SLASH_ANGLE_END   =  Math.PI * 0.45;
const SLASH_DURATION    = 30;   // 500ms @ 60fps：振り開始〜完了
// ダメージ判定は振りの約60%地点（角度0.05π ≈ 前方向）= 約300ms
// → 人間の反応時間 ~200ms あれば「見てからガード」が間に合う
// ※ 0.28π にすると剣先が下を向きすぎて相手の体に届かなくなるため小さい値を使う
const SLASH_HIT_ANGLE   =  Math.PI * 0.05;
const REBOUND_DURATION  = 36;  // 盾パリィ後のペナルティ（0.6sec）
const SLASH_COOLDOWN    = 22;  // 通常スラッシュ後のインターバル（0.37sec）
const GUARD_DURATION    = 999;
const SWORD_LEN = 38;
const SWORD_W   = 4;

// ── Grab constants ────────────────────────────────────────
const GRAB_REACH       = 68;  // 投げの間合い（真の密着のみ）
// ※ キャラ幅 = SPRITE_W * SCALE = 64px → 68px はほぼ完全に接触した状態のみ
const GRAB_DURATION    = 18;  // 投げモーション（成功・失敗共通）
const GRABBED_DURATION = 30;  // 吹き飛び時間（0.5sec）
const KNOCKED_DURATION = 36;  // 倒れている時間（0.6sec）無敵
const WAKEUP_DURATION  = 24;  // 起き上がりモーション（0.4sec）無敵
// 合計 90フレーム = 約1.5秒（ストリートファイター系の標準的な長さ）
const GRAB_MISS_DURATION = 28; // 投げ失敗時の自分の硬直（約0.5秒 = 相手に反撃の機会）
const GRAB_DAMAGE      = 18;  // 投げ成功ダメージ（剣より少し少なめ）
// 投げ成功後のクールダウン：敵の完全回復時間（90f）より少し長く設定
// これにより「投げ→クールダウン切れ→即再投げ」を防止
const GRAB_COOLDOWN       = 30;  // 投げ失敗・空振り後のクールダウン（0.5sec）
const GRAB_HIT_COOLDOWN   = 100; // 投げ成功後のクールダウン（1.67sec > 回復90f）

// ── Web Audio ─────────────────────────────────────────────
let audioCtx = null;
function getAudioCtx() {
	if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	return audioCtx;
}

// 汎用トーン生成
function tone(ctx, start, freq, dur, type, gain) {
	const osc = ctx.createOscillator();
	const g   = ctx.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(freq, start);
	g.gain.setValueAtTime(gain, start);
	g.gain.exponentialRampToValueAtTime(0.001, start + dur);
	osc.connect(g);
	g.connect(ctx.destination);
	osc.start(start);
	osc.stop(start + dur + 0.02);
}

// ── 剣を振る「シュッ」
function sfxSlash() {
	const ctx = getAudioCtx();
	const t = ctx.currentTime;
	// ノイズっぽい高めのスウィープ
	tone(ctx, t,       800,  0.04, "sawtooth",  0.06);
	tone(ctx, t+0.02,  500,  0.06, "sawtooth",  0.04);
	tone(ctx, t+0.04,  300,  0.05, "triangle",  0.03);
}

// ── 盾を構える「ガシャン」
function sfxGuard() {
	const ctx = getAudioCtx();
	const t = ctx.currentTime;
	tone(ctx, t,      260,  0.07, "square",    0.05);
	tone(ctx, t+0.03, 180,  0.09, "square",    0.04);
	tone(ctx, t+0.06, 120,  0.08, "triangle",  0.03);
}

// ── 剣が盾に当たる「キィン」
function sfxParry() {
	const ctx = getAudioCtx();
	const t = ctx.currentTime;
	tone(ctx, t,       1200, 0.06, "sine",      0.08);
	tone(ctx, t+0.01,  900,  0.10, "sine",      0.06);
	tone(ctx, t+0.04,  600,  0.12, "triangle",  0.04);
	tone(ctx, t+0.08,  400,  0.10, "triangle",  0.03);
}

// ── 剣が相手に当たる「ドスッ」
function sfxHit() {
	const ctx = getAudioCtx();
	const t = ctx.currentTime;
	tone(ctx, t,       150,  0.06, "sawtooth",  0.10);
	tone(ctx, t+0.02,  100,  0.10, "square",    0.08);
	tone(ctx, t+0.05,  80,   0.12, "triangle",  0.05);
}

// ── 投げ成功「ドン！」
function sfxGrabHit() {
	const ctx = getAudioCtx();
	const t = ctx.currentTime;
	tone(ctx, t,       90,   0.05, "square",    0.12);
	tone(ctx, t+0.03,  60,   0.10, "sawtooth",  0.10);
	tone(ctx, t+0.08,  40,   0.14, "triangle",  0.06);
}

// ── 投げ失敗「スカッ」
function sfxGrabMiss() {
	const ctx = getAudioCtx();
	const t = ctx.currentTime;
	tone(ctx, t,       600,  0.04, "sawtooth",  0.04);
	tone(ctx, t+0.03,  300,  0.05, "triangle",  0.03);
}

// ── Fighter factory ───────────────────────────────────────
function makeFighter(x, facingRight) {
	return {
		x, y: GROUND - SPRITE_H * SCALE,
		vx: 0, vy: 0,
		facingRight,
		onGround: true,
		hp: 100, maxHp: 100,
		// state: idle | walk | jump | guard | slash | rebound | hurt | dead
		state: "idle",
		stateTimer: 0,
		slashCooldown: 0,   // スラッシュ後の待機フレーム
		grabCooldown: 0,    // 投げ後の待機フレーム
		slashAngle: SLASH_ANGLE_START,
		slashHit: false,
		grabRotDir: 1,   // 投げられた方向（+1=時計回り、-1=反時計回り）
		animFrame: 0,
		animTimer: 0,
		moveLeft: false, moveRight: false,
	};
}

// ── Global ────────────────────────────────────────────────
let player, enemy;
let phase = "title";
let animReqId = null;

// ── Canvas ────────────────────────────────────────────────
const arenaEl = document.getElementById("arena");
const ctx = arenaEl.getContext("2d");
arenaEl.width  = AW;
arenaEl.height = AH;

// ── Overlay ───────────────────────────────────────────────
const overlayEl  = document.getElementById("overlay");
const overlayTxt = document.getElementById("overlay-text");
const overlayBtn = document.getElementById("overlay-btn");

function showOverlay(text, btn) {
	overlayTxt.textContent = text;
	overlayBtn.textContent = btn;
	overlayEl.classList.add("show");
}
function hideOverlay() { overlayEl.classList.remove("show"); }

// ── HUD ───────────────────────────────────────────────────
function updateHud() {
	const pPct = Math.max(0, player.hp / player.maxHp * 100);
	const ePct = Math.max(0, enemy.hp  / enemy.maxHp  * 100);
	document.getElementById("hp-bar-p").style.width = pPct + "%";
	document.getElementById("hp-bar-e").style.width = ePct + "%";
	document.getElementById("hp-num-p").textContent = Math.ceil(player.hp);
	document.getElementById("hp-num-e").textContent = Math.ceil(enemy.hp);
	const pBar = document.getElementById("hp-bar-p");
	pBar.style.background = pPct < 30 ? "#e85f5c" : pPct < 60 ? "#f2c14e" : "#6fd3c4";
}

// ── Init ──────────────────────────────────────────────────
function startFight() {
	player = makeFighter(40, true);
	enemy  = makeFighter(AW - 40 - SPRITE_W * SCALE, false);
	phase  = "fight";
	hideOverlay();
	updateHud();
}

// ── Physics ───────────────────────────────────────────────
function applyPhysics(f) {
	if (!f.onGround) f.vy += GRAVITY;
	f.x += f.vx;
	f.y += f.vy;
	const groundY = GROUND - SPRITE_H * SCALE;
	if (f.y >= groundY) { f.y = groundY; f.vy = 0; f.onGround = true; }
	f.x = Math.max(0, Math.min(AW - SPRITE_W * SCALE, f.x));
}

// ── Fighter update ────────────────────────────────────────
function updateFighter(f, opponent) {
	if (f.state === "dead") return;

	if (f.stateTimer > 0) f.stateTimer--;
	if (f.slashCooldown > 0) f.slashCooldown--;
	if (f.grabCooldown > 0) f.grabCooldown--;

	// resolve timed states
	if (f.stateTimer <= 0) {
		if (f.state === "hurt" || f.state === "rebound" || f.state === "grab") {
			f.state = "idle";
		} else if (f.state === "grabbed") {
			// 吹き飛び終了 → 倒れ状態へ
			f.state = "knocked";
			f.stateTimer = KNOCKED_DURATION;
			f.vx = 0;
			f.vy = 0;
			// 地面に強制スナップ（空中で grabbed タイマーが切れた場合の保険）
			f.y = GROUND - SPRITE_H * SCALE;
			f.onGround = true;
		} else if (f.state === "knocked") {
			// 倒れ終了 → 起き上がりへ
			f.state = "wakeup";
			f.stateTimer = WAKEUP_DURATION;
		} else if (f.state === "wakeup") {
			// 起き上がり完了 → idle
			f.state = "idle";
		}
	}

	// ── Slash animation progress ──────────────────────────
	if (f.state === "slash") {
		const progress = 1 - f.stateTimer / SLASH_DURATION;
		f.slashAngle = SLASH_ANGLE_START + (SLASH_ANGLE_END - SLASH_ANGLE_START) * progress;
		if (f.stateTimer <= 0) {
			f.state = "idle";
			f.slashHit = false;
			f.slashAngle = SLASH_ANGLE_START;
			f.slashCooldown = SLASH_COOLDOWN; // 振り終えたらクールダウン開始
		}
	}

	// ── Movement (blocked during action states) ───────────
	const canMove = (f.state === "idle" || f.state === "walk" || f.state === "jump");
	// grabbed / knocked は吹き飛び慣性を保持（vx をリセットしない）
	const preserveVelocity = (f.state === "grabbed" || f.state === "knocked");

	if (canMove) {
		if (f.state !== "jump") {
			if (f.moveLeft && !f.moveRight) {
				f.vx = -WALK_SPD;
				if (f.onGround) f.state = "walk";
			} else if (f.moveRight && !f.moveLeft) {
				f.vx = WALK_SPD;
				if (f.onGround) f.state = "walk";
			} else {
				f.vx = 0;
				if (f.state === "walk" && f.onGround) f.state = "idle";
			}
		} else {
			// air – allow directional adjustment
			if (f.moveLeft && !f.moveRight) f.vx = -JUMP_VX;
			else if (f.moveRight && !f.moveLeft) f.vx = JUMP_VX;
		}
	} else if (!preserveVelocity) {
		// grabbed/knocked 以外のアクション中は横移動を止める
		f.vx = 0;
	}
	// grabbed/knocked 中は空気抵抗で自然減速
	if (preserveVelocity) {
		f.vx *= 0.88;
	}

	applyPhysics(f);

	// always face opponent
	if (opponent) f.facingRight = opponent.x > f.x;

	// jump state tracking
	// grabbed / knocked / wakeup は空中にいても jump に上書きしない
	const lockStates = ["slash","guard","hurt","rebound","grab","grabbed","knocked","wakeup"];
	if (!f.onGround && !lockStates.includes(f.state)) {
		f.state = "jump";
	}

	// anim
	f.animTimer++;
	if (f.animTimer >= 10) { f.animTimer = 0; f.animFrame = (f.animFrame + 1) % 2; }
}

// ── Sword tip position ────────────────────────────────────
// スプライトは 32×32、2倍スケールなので実描画は 64×64px
// 頭は上部 ~8行、肩は ~14行付近 → py = f.y + 14*SCALE = f.y + 28
function swordTip(f) {
	const dir = f.facingRight ? 1 : -1;
	// 肩の横位置: スプライト中心より少し前（向いている側）
	const px = f.x + SPRITE_W * SCALE / 2 + dir * 6;
	// 肩の縦位置: スプライト上端から約14ピクセル（スケール前）= 28px
	const py = f.y + 14 * SCALE;
	const angle = f.facingRight ? f.slashAngle : Math.PI - f.slashAngle;
	const tx = px + Math.cos(angle) * SWORD_LEN;
	const ty = py + Math.sin(angle) * SWORD_LEN;
	return { px, py, tx, ty, angle };
}

// ── Slash/parry check ─────────────────────────────────────
const SLASH_DAMAGE  = 20;
const GUARD_DAMAGE  = 2;   // chip damage through guard

function checkSlashHit(attacker, defender) {
	if (attacker.state !== "slash" || attacker.slashHit) return;
	// grabbed / knocked / wakeup / grab 中は無敵（完全起き上がりまで追加ダメージなし）
	if (defender.state === "grabbed" || defender.state === "knocked"
		|| defender.state === "wakeup" || defender.state === "grab") return;
	// Only deal damage when swing reaches hit angle
	if (attacker.slashAngle < SLASH_HIT_ANGLE) return;

	const tip = swordTip(attacker);

	// ── Check if tip hits defender's shield ──────────────
	if (defender.state === "guard") {
		const shieldX = defender.facingRight
			? defender.x + SPRITE_W * SCALE         // shield on the right (facing right = facing attacker)
			: defender.x;                            // shield on the left
		const shieldY  = defender.y + 8;
		const shieldH  = SPRITE_H * SCALE * 0.75;
		const shieldW  = 16;

		const hitX = tip.tx;
		const hitY = tip.ty;

		if (hitX > shieldX - shieldW && hitX < shieldX + shieldW &&
		    hitY > shieldY && hitY < shieldY + shieldH) {
			// Parried! rebound attacker
			attacker.slashHit = true;
			attacker.state = "rebound";
			attacker.stateTimer = REBOUND_DURATION;
			attacker.slashAngle = SLASH_ANGLE_START;
			defender.hp = Math.max(0, defender.hp - GUARD_DAMAGE);
			updateHud();
			sfxParry();
			return;
		}
	}

	// ── Check body hit ────────────────────────────────────
	const bx = defender.x + 4;
	const bw = SPRITE_W * SCALE - 8;
	const by = defender.y + 4;
	const bh = SPRITE_H * SCALE - 8;

	if (tip.tx > bx && tip.tx < bx + bw && tip.ty > by && tip.ty < by + bh) {
		attacker.slashHit = true;
		defender.hp = Math.max(0, defender.hp - SLASH_DAMAGE);
		defender.state = "hurt";
		defender.stateTimer = 20;
		defender.vx = attacker.facingRight ? 3.5 : -3.5;
		updateHud();
		sfxHit();
		if (defender.hp <= 0) defender.state = "dead";
	}
}

// ── Player actions ────────────────────────────────────────
function playerJump() {
	if (phase !== "fight" || player.state === "dead") return;
	if (!player.onGround) return;
	if (player.state === "slash" || player.state === "guard" || player.state === "rebound") return;
	player.vy = JUMP_VY;
	player.onGround = false;
	player.state = "jump";
	if (player.moveLeft && !player.moveRight)      player.vx = -JUMP_VX;
	else if (player.moveRight && !player.moveLeft) player.vx =  JUMP_VX;
}

let guardHeld = false;
function playerGuardStart() {
	if (phase !== "fight" || player.state === "dead") return;
	if (player.state === "slash" || player.state === "rebound" || player.state === "hurt") return;
	if (player.state === "guard") return; // already guarding
	guardHeld = true;
	player.state = "guard";
	player.stateTimer = 1;
	player.vx = 0;
	sfxGuard();
}
function playerGuardEnd() {
	guardHeld = false;
	if (player.state === "guard") player.state = "idle";
}

function playerSlash() {
	if (phase !== "fight" || player.state === "dead") return;
	// jump 中は振れる（空中斬り）。guard / rebound / hurt / grab 中は不可
	if (player.state === "slash" || player.state === "guard" || player.state === "rebound"
		|| player.state === "hurt" || player.state === "grab" || player.state === "grabbed") return;
	if (player.slashCooldown > 0) return;
	player.state = "slash";
	player.stateTimer = SLASH_DURATION;
	player.slashAngle = SLASH_ANGLE_START;
	player.slashHit = false;
	player.vx = 0;
	sfxSlash();
}

function playerGrab() {
	if (phase !== "fight" || player.state === "dead") return;
	if (player.state !== "idle" && player.state !== "walk") return;
	if (player.grabCooldown > 0) return; // クールダウン中は投げ不可
	// 距離チェックをここでは行わない → checkGrabHit で判定し、
	// 届かなければ失敗硬直（GRAB_MISS_DURATION）が必ず発生する
	player.state = "grab";
	player.stateTimer = GRAB_DURATION;
	player.vx = 0;
}

// ── Grab check ────────────────────────────────────────────
function checkGrabHit(attacker, defender) {
	if (attacker.state !== "grab") return;
	// grabbed / knocked / wakeup 中は無敵
	if (defender.state === "grabbed" || defender.state === "knocked" || defender.state === "wakeup") return;
	// grab 開始後すぐ（stateTimer が GRAB_DURATION-1 〜 GRAB_DURATION-3）のみ判定
	// ※ updateFighter でデクリメント後に呼ばれるため -1 がスタート値
	// 判定は開始から1フレーム目のみ（timer === GRAB_DURATION - 1）
	if (attacker.stateTimer !== GRAB_DURATION - 1) return;

	const dist = Math.abs(attacker.x - defender.x);
	if (dist > GRAB_REACH) {
		attacker.state = "hurt";
		attacker.stateTimer = GRAB_MISS_DURATION;
		attacker.grabCooldown = GRAB_COOLDOWN;
		sfxGrabMiss();
		return;
	}

	// slash 中の相手への投げ：
	//   判定前（angle < SLASH_HIT_ANGLE）→ 投げ成功（相手の攻撃を封じる）
	//   判定発生中（angle >= SLASH_HIT_ANGLE）→ 投げ失敗（攻撃を受けてしまう）
	//   これにより「投げと剣ダメージが同時に発生する」矛盾を防ぐ
	if (defender.state === "slash" && defender.slashAngle >= SLASH_HIT_ANGLE) {
		// 剣の判定が出ている → 投げは失敗
		attacker.state = "hurt";
		attacker.stateTimer = GRAB_MISS_DURATION;
		attacker.grabCooldown = GRAB_COOLDOWN;
		sfxGrabMiss();
		return;
	}

	const grabDir = attacker.facingRight ? 1 : -1;
	defender.state = "grabbed";
	defender.stateTimer = GRABBED_DURATION;
	// slash/rebound の場合は剣をリセット
	defender.slashAngle = SLASH_ANGLE_START;
	defender.hp = Math.max(0, defender.hp - GRAB_DAMAGE);
	defender.vx = grabDir * 3.5;
	defender.vy = -2.5;
	defender.onGround = false;
	// 回転方向を保存（grabbed→knocked遷移後も使えるように）
	defender.grabRotDir = grabDir;  // 右投げ=+1(時計), 左投げ=-1(反時計)
	attacker.grabCooldown = GRAB_HIT_COOLDOWN;
	updateHud();
	sfxGrabHit();
	if (defender.hp <= 0) defender.state = "dead";
}

// keep guard alive while held
function refreshGuard(f) {
	if (f === player && guardHeld && f.state === "guard") {
		f.stateTimer = 2; // reset timer so it doesn't expire
	}
}

// ── Enemy AI ──────────────────────────────────────────────
// 「知覚→遅延→行動」モデル
// 人間の反応時間：
//   最速アスリート: ~100ms (6f)、一般人: ~200ms (12f)、遅め: ~350ms (21f)
// AIは 12〜24フレームの正規分布ライクな遅延を持つ
function humanDelay() {
	// 12〜24フレームの範囲で、中央値18フレーム(約300ms)
	// 複数の乱数を足すことで正規分布に近い分布を実現
	return 12 + (Math.random() * 6 | 0) + (Math.random() * 6 | 0);
}

let aiDecisionTimer  = 20;   // 次に行動を検討するまでのフレーム
let aiPendingIntent  = null; // 遅延待ちの行動意図
let aiPendingDelay   = 0;    // 残り遅延フレーム
let aiCurrentIntent  = "idle"; // 現在実行中の意図

// ガードへの反応用（攻撃を見てからガードを出すまでの遅延）
let aiReactQueued = false;
let aiReactDelay  = 0;

function updateAI() {
	if (enemy.state === "dead" || player.state === "dead") return;

	// タイマーカウントダウン
	if (aiDecisionTimer  > 0) aiDecisionTimer--;
	if (aiPendingDelay   > 0) aiPendingDelay--;
	if (aiReactDelay     > 0) aiReactDelay--;

	const dist = Math.abs(enemy.x - player.x);
	const slashRange = SWORD_LEN + SPRITE_W * SCALE * 0.7;
	const comfortDist = 85;

	// ── 状況を観察して「行動意図」を決定（遅延付き）──────────
	// 意図の決定は decisionTimer が切れたときのみ行い、
	// 決定してから humanDelay() フレーム後に実際に行動する
	if (aiDecisionTimer <= 0 && aiPendingIntent === null) {
		const r = Math.random();
		let intent;
		if (dist > comfortDist * 1.6) {
			intent = "approach";
		} else if (dist < slashRange * 0.5) {
			// 密着: 投げ・斬り・後退
			if (player.state === "guard" && r < 0.35) intent = "grab"; // 盾を見たら投げを狙う
			else intent = r < 0.5 ? "slash" : "retreat";
		} else if (dist < slashRange * 1.1) {
			if (r < 0.30) intent = "slash";
			else if (r < 0.50) intent = "guard";
			else if (r < 0.62 && player.state === "guard") intent = "grab"; // 相手が盾の時に投げ判断
			else intent = "approach";
		} else {
			intent = r < 0.55 ? "approach" : "retreat";
		}
		// 意図を「知覚」し、人間らしい遅延後に実行予約
		aiPendingIntent = intent;
		aiPendingDelay  = humanDelay();
	}

	// 遅延経過後に意図を実行に移す
	if (aiPendingIntent !== null && aiPendingDelay <= 0) {
		aiCurrentIntent = aiPendingIntent;
		aiPendingIntent = null;
		// 次の観察タイミングを設定（16〜32フレーム後）
		aiDecisionTimer = 16 + (Math.random() * 16 | 0);
	}

	enemy.facingRight = player.x > enemy.x;
	enemy.moveLeft = false;
	enemy.moveRight = false;

	// ── プレイヤー攻撃への反応ガード（人間らしい遅延付き）──────
	// 振り始めを「見た」瞬間に一定確率で反応開始
	// 遅延は humanDelay() = 12〜24フレーム（200〜400ms）
	if (player.state === "slash" && !aiReactQueued
		&& player.slashAngle > SLASH_ANGLE_START + 0.3
		&& Math.random() < 0.4) {
		aiReactQueued = true;
		aiReactDelay  = humanDelay(); // 人間と同じランダム遅延
	}
	if (aiReactQueued && aiReactDelay <= 0) {
		aiReactQueued = false;
		// 遅延後もまだ相手が振り中なら間に合う
		if (player.state === "slash"
			&& enemy.state !== "guard" && enemy.state !== "slash"
			&& enemy.state !== "hurt" && enemy.state !== "rebound") {
			enemy.state = "guard";
			enemy.stateTimer = 2;
			aiCurrentIntent = "guard";
			aiDecisionTimer = 20;
		}
	}
	if (player.state !== "slash") aiReactQueued = false;

	// 行動中は何もしない（grabbed/knocked/wakeup も含む）
	if (enemy.state === "slash" || enemy.state === "hurt" || enemy.state === "rebound") return;
	if (enemy.state === "grabbed" || enemy.state === "knocked" || enemy.state === "wakeup" || enemy.state === "grab") return;
	if (enemy.state === "guard") {
		if (enemy.stateTimer <= 0) enemy.state = "idle";
		return;
	}

	// ── 現在の意図を実行 ─────────────────────────────────────
	switch (aiCurrentIntent) {
		case "approach":
			if (enemy.facingRight) enemy.moveRight = true;
			else enemy.moveLeft = true;
			if (enemy.onGround && Math.random() < 0.006) {
				enemy.vy = JUMP_VY * 0.9; enemy.onGround = false; enemy.state = "jump";
			}
			break;
		case "retreat":
			if (enemy.facingRight) enemy.moveLeft = true;
			else enemy.moveRight = true;
			break;
		case "slash":
			if (dist < slashRange * 1.2 && enemy.state !== "slash" && enemy.slashCooldown <= 0) {
				enemy.state = "slash";
				enemy.stateTimer = SLASH_DURATION;
				enemy.slashAngle = SLASH_ANGLE_START;
				enemy.slashHit = false;
			}
			break;
		case "guard":
			if (enemy.state !== "guard") {
				enemy.state = "guard";
				enemy.stateTimer = 28;
			}
			break;
		case "grab":
			// 密着していて idle/walk の時のみ投げを実行
			if (dist <= GRAB_REACH
				&& (enemy.state === "idle" || enemy.state === "walk")) {
				enemy.state = "grab";
				enemy.stateTimer = GRAB_DURATION;
				enemy.vx = 0;
			}
			break;
	}
}

// ── Draw ──────────────────────────────────────────────────
function drawPixelSprite(frames, palette, frame, x, y, flipX) {
	const grid = frames[frame % frames.length];
	const rows = grid.length, cols = grid[0].length;
	ctx.save();
	if (flipX) {
		ctx.translate(x + cols * SCALE, y);
		ctx.scale(-1, 1);
	} else {
		ctx.translate(x, y);
	}
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const idx = grid[r][c];
			if (!idx) continue;
			ctx.fillStyle = palette[idx];
			ctx.fillRect(c * SCALE, r * SCALE, SCALE, SCALE);
		}
	}
	ctx.restore();
}

function drawShield(f) {
	if (f.state !== "guard") return;
	// Shield always on the FRONT side (facing opponent = facingRight side)
	const dir = f.facingRight ? 1 : -1;
	const cx = f.x + SPRITE_W * SCALE / 2 + dir * (SPRITE_W * SCALE * 0.42);
	const cy = f.y + 8;
	const sw = 14, sh = 36;

	ctx.fillStyle = "#6fd3c4";
	ctx.beginPath();
	ctx.roundRect(cx - sw / 2, cy, sw, sh, 3);
	ctx.fill();
	ctx.strokeStyle = "#354047";
	ctx.lineWidth = 1;
	ctx.stroke();
	// rim
	ctx.strokeStyle = "rgba(255,255,255,0.25)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.roundRect(cx - sw / 2 + 2, cy + 2, sw - 4, sh - 4, 2);
	ctx.stroke();
}

function drawSword(f) {
	if (f.state !== "slash" && f.state !== "rebound") return;
	const { px, py, tx, ty } = swordTip(f);

	// handle position (between pivot and tip)
	const hx = px + (tx - px) * 0.18;
	const hy = py + (ty - py) * 0.18;

	// blade
	ctx.save();
	ctx.strokeStyle = f.state === "rebound" ? "#a0c0d8" : "#d0e8f8";
	ctx.lineWidth = SWORD_W;
	ctx.lineCap = "round";
	ctx.shadowColor = f.state === "rebound" ? "rgba(0,80,160,0.5)" : "rgba(180,230,255,0.6)";
	ctx.shadowBlur = 4;
	ctx.beginPath();
	ctx.moveTo(hx, hy);
	ctx.lineTo(tx, ty);
	ctx.stroke();
	ctx.restore();

	// guard (cross piece)
	const perpX = -(ty - py) / SWORD_LEN * 8;
	const perpY =  (tx - px) / SWORD_LEN * 8;
	ctx.fillStyle = "#f2c14e";
	ctx.beginPath();
	ctx.moveTo(hx + perpX, hy + perpY);
	ctx.lineTo(hx - perpX, hy - perpY);
	ctx.lineWidth = 3;
	ctx.strokeStyle = "#f2c14e";
	ctx.stroke();

	// handle
	ctx.strokeStyle = "#7a5030";
	ctx.lineWidth = 5;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(px, py);
	ctx.lineTo(hx, hy);
	ctx.stroke();
}

function drawFighter(f, palette) {
	if (f.state === "dead") {
		ctx.save();
		ctx.globalAlpha = 0.55;
		ctx.translate(f.x + SPRITE_W * SCALE / 2, f.y + SPRITE_H * SCALE / 2);
		ctx.rotate(Math.PI / 2);
		drawPixelSprite(SPRITE_HERO_R, palette, 0, -SPRITE_W * SCALE / 2, -SPRITE_H * SCALE / 2, !f.facingRight);
		ctx.restore();
		return;
	}

	// knocked 状態：地面に横倒し
	// 上を向いて倒れた最終形（grabbed の回転が完了した状態）
	// 90°回転後、スプライトの「頭側」が横になる。床に体が乗るよう位置調整。
	if (f.state === "knocked") {
		// 90°回転後、スプライト上部の空白4行が「底面」側に来るため視覚的に浮いて見える。
		// 空白行分（4行 × SCALE = 8px）だけ cy を下にずらして床面に接するよう補正する。
		// 90°回転後の最下端Y = cy + W/2*SCALE (= cy + 32)
		// 床面に接するには cy = GROUND - 32
		// f.y = GROUND - H*SCALE = GROUND - 64 のとき
		// cy = f.y + H*SCALE/2 + offset = GROUND - 64 + 32 + offset = GROUND - 32 + offset
		// → offset = 0 が必要。つまり cy = GROUND - SPRITE_W*SCALE/2
		// スプライトの右端の実際のコンテンツは列24（0-indexed）
		// 90°回転後の最下点Y = cy + (24*SCALE - SPRITE_W*SCALE/2) = cy + 16
		// 床面に接するには cy = GROUND - 16
		const cx = f.x + SPRITE_W * SCALE / 2;
		const cy = GROUND - 16;
		const finalAngle = f.grabRotDir * Math.PI / 2;
		ctx.save();
		ctx.globalAlpha = 0.75;
		ctx.translate(cx, cy);
		ctx.rotate(finalAngle);
		ctx.shadowColor = "rgba(106,167,223,0.6)";
		ctx.shadowBlur = 8;
		drawPixelSprite(SPRITE_HERO_R, palette, 0, -SPRITE_W * SCALE / 2, -SPRITE_H * SCALE / 2, !f.facingRight);
		ctx.restore();
		return;
	}

	// wakeup 状態：点滅して起き上がり中を表現（無敵）
	if (f.state === "wakeup") {
		if (Math.floor(f.stateTimer / 5) % 2 === 0) return; // 点滅
	}

	// grabbed 状態：回転しながら倒れるアニメーション
	// 投げられた方向に倒れる（右向き＝右に飛ぶ＝反時計回りで-90°、左向き＝左に飛ぶ＝時計回りで+90°）
	// facingRight のとき：相手（attacker）は左側→右方向に飛ぶ→右上向きに転倒 → -90°（上向き）
	// !facingRight のとき：左方向に飛ぶ → +90°（上向き）
	if (f.state === "grabbed") {
		const progress = 1 - f.stateTimer / GRABBED_DURATION;
		const angle = (Math.PI / 2) * f.grabRotDir * progress;
		// 回転角度に応じてスプライトの「見かけの半高さ」を計算
		// これで回転中も最下端が常に GROUND を超えないよう中心Yを調整する
		const absAngle = Math.abs(angle);
		const halfH = (Math.abs(Math.cos(absAngle)) * SPRITE_H + Math.abs(Math.sin(absAngle)) * SPRITE_W) * SCALE / 2;
		const cx = f.x + SPRITE_W * SCALE / 2;
		const cy = GROUND - halfH;
		ctx.save();
		ctx.globalAlpha = 0.85;
		ctx.translate(cx, cy);
		ctx.rotate(angle);
		drawPixelSprite(SPRITE_HERO_R, palette, 0, -SPRITE_W * SCALE / 2, -SPRITE_H * SCALE / 2, !f.facingRight);
		ctx.restore();
		return;
	}

	// grab 状態：黄色グロー
	if (f.state === "grab") {
		ctx.save();
		ctx.shadowColor = "rgba(242,193,78,0.8)";
		ctx.shadowBlur = 14;
	}

	if (f.state === "hurt" && Math.floor(f.stateTimer / 4) % 2 === 0) {
		// hurt フラッシュ（早期 return の前に save してあるので restore が必要）
	}

	const frame = f.state === "walk" ? f.animFrame : 0;

	drawPixelSprite(SPRITE_HERO_R, palette, frame, f.x, f.y, !f.facingRight);
	drawSword(f);
	drawShield(f);

	if (f.state === "grab") ctx.restore();
	if (f.state === "hurt" && Math.floor(f.stateTimer / 4) % 2 === 0) ctx.restore();
}

function drawArena() {
	const sky = ctx.createLinearGradient(0, 0, 0, AH);
	sky.addColorStop(0, "#0d1a2a");
	sky.addColorStop(1, "#1a2838");
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, AW, AH);

	ctx.fillStyle = "#1e2c38";
	for (let px = 30; px < AW; px += 60) ctx.fillRect(px, 10, 8, GROUND - 10);

	ctx.fillStyle = "#2a3540";
	ctx.fillRect(0, GROUND, AW, AH - GROUND);
	ctx.fillStyle = "#6fd3c4";
	ctx.fillRect(0, GROUND, AW, 2);

	const t = Date.now() / 120;
	[40, AW - 40].forEach(tx => {
		const flicker = 0.7 + 0.3 * Math.sin(t * 7 + tx);
		ctx.fillStyle = `rgba(242,193,78,${0.28 * flicker})`;
		ctx.beginPath();
		ctx.ellipse(tx, GROUND - 40, 12 * flicker, 20, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "#f2c14e";
		ctx.fillRect(tx - 2, GROUND - 50, 4, 12);
	});
}

function render() {
	ctx.clearRect(0, 0, AW, AH);
	drawArena();
	drawFighter(enemy, PAL_ENEMY);
	drawFighter(player, PAL_HERO);
}

// ── Game loop ─────────────────────────────────────────────
function tick() {
	if (phase === "fight") {
		refreshGuard(player);
		updateAI();
		updateFighter(player, enemy);
		updateFighter(enemy, player);

		// ── Fighter vs Fighter collision (push apart) ─────
		// 盾も含めてキャラ同士が重ならないよう押し戻す
		const pLeft  = player.x;
		const pRight = player.x + SPRITE_W * SCALE;
		const eLeft  = enemy.x;
		const eRight = enemy.x + SPRITE_W * SCALE;
		const overlap = Math.min(pRight, eRight) - Math.max(pLeft, eLeft);
		if (overlap > 0) {
			const push = overlap / 2 + 1;
			if (player.x < enemy.x) {
				player.x -= push;
				enemy.x  += push;
			} else {
				player.x += push;
				enemy.x  -= push;
			}
			// 壁クランプ再適用
			player.x = Math.max(0, Math.min(AW - SPRITE_W * SCALE, player.x));
			enemy.x  = Math.max(0, Math.min(AW - SPRITE_W * SCALE, enemy.x));
		}

		checkSlashHit(player, enemy);
		checkSlashHit(enemy, player);
		checkGrabHit(player, enemy);
		checkGrabHit(enemy, player);

		if (player.state === "dead") {
			phase = "lose";
			setTimeout(() => showOverlay("💀 DEFEAT", "もう一度"), 600);
		} else if (enemy.state === "dead") {
			phase = "win";
			setTimeout(() => showOverlay("🏆 VICTORY!", "もう一度"), 600);
		}
	}
	render();
	animReqId = requestAnimationFrame(tick);
}

// ── Keyboard ──────────────────────────────────────────────
const keys = {};
document.addEventListener("keydown", e => {
	if (keys[e.key]) return;
	keys[e.key] = true;
	switch (e.key) {
		case "ArrowLeft":  player.moveLeft  = true; break;
		case "ArrowRight": player.moveRight = true; break;
		case "ArrowUp": e.preventDefault(); playerJump(); break;
		case "a": case "A": playerGuardStart(); break;
		case "s": case "S": playerSlash(); break;
		case "d": case "D": playerGrab(); break;
		case " ": e.preventDefault(); playerJump(); break;
	}
});
document.addEventListener("keyup", e => {
	keys[e.key] = false;
	if (e.key === "ArrowLeft")  player.moveLeft  = false;
	if (e.key === "ArrowRight") player.moveRight = false;
	if (e.key === "a" || e.key === "A") playerGuardEnd();
});

// ── Touch / buttons ───────────────────────────────────────
function bindBtn(id, onDown, onUp) {
	const el = document.getElementById(id);
	const dn = ev => { ev.preventDefault(); el.classList.add("pressed"); onDown && onDown(); };
	const up = ev => { ev.preventDefault(); el.classList.remove("pressed"); onUp && onUp(); };
	el.addEventListener("pointerdown", dn);
	el.addEventListener("pointerup",   up);
	el.addEventListener("pointerleave", up);
}

bindBtn("btn-left",  () => { player.moveLeft  = true; }, () => { player.moveLeft  = false; });
bindBtn("btn-right", () => { player.moveRight = true; }, () => { player.moveRight = false; });
bindBtn("btn-jump",  () => playerJump(), null);
bindBtn("btn-guard", () => playerGuardStart(), () => playerGuardEnd());
bindBtn("btn-slash", () => playerSlash(), null);
bindBtn("btn-grab",  () => playerGrab(), null);

// ── Overlay / boot ────────────────────────────────────────
overlayBtn.addEventListener("click", () => {
	if (phase === "title" || phase === "win" || phase === "lose") {
		cancelAnimationFrame(animReqId);
		startFight();
		tick();
	}
});

showOverlay("⚔️ Sword Duel", "はじめる");
animReqId = requestAnimationFrame(function boot() {
	if (phase === "title") {
		player = makeFighter(40, true);
		enemy  = makeFighter(AW - 40 - SPRITE_W * SCALE, false);
		render();
		animReqId = requestAnimationFrame(boot);
	} else {
		tick();
	}
});
