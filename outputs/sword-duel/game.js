// ── Sword Duel – game.js ────────────────────────────────

// ── Palettes ──────────────────────────────────────────────
const PAL_HERO = ["transparent","#000000","#ff9500","#f1d7c9","#4cd964","#5856d6","#edd1c3"];

// ── Enemy palettes per level (index 0 = transparent, 1 = outline, 2 = body, 3 = skin, 4 = armor, 5 = legs, 6 = face) ──
// Lv1:赤  Lv2:橙  Lv3:黄  Lv4:黄緑  Lv5:青  Lv6:紫  Lv7:深紅  Lv8:黒金(魔王)
const ENEMY_PALETTES = [
	// Lv1 – 赤（元の色）
	["transparent","#000000","#c03030","#f1d7c9","#8a1a1a","#3a0a0a","#edd1c3"],
	// Lv2 – 橙
	["transparent","#111111","#d06018","#f5dcc8","#8a3800","#3a1600","#edd1c3"],
	// Lv3 – 黄
	["transparent","#111111","#c0a020","#f5e8c0","#7a6000","#302400","#f0e8c0"],
	// Lv4 – 黄緑
	["transparent","#0a1a0a","#508030","#d8ecc8","#1e4a0a","#0a2004","#d0e8c0"],
	// Lv5 – 青
	["transparent","#000818","#2050b0","#c8d8f4","#0a1a60","#040820","#c0d0f0"],
	// Lv6 – 紫
	["transparent","#0a0018","#7030a0","#e0c8f4","#3a0060","#140020","#d8c0f0"],
	// Lv7 – 深紅
	["transparent","#100000","#900020","#ffc8c8","#500010","#200008","#ffc0c0"],
	// Lv8 – 黒金（魔王）
	["transparent","#000000","#1a1a1a","#f0d090","#0a0a0a","#050505","#f0d890"],
];

// ── Level parameters (index 0 = Lv1) ──────────────────────
// 調整する際はここだけ変えればOK
const LEVEL_PARAMS = [
	// Lv1 – 初心者向け。鈍い・消極的
	{
		name: "GRUNT",
		delayMin: 16, delayRange: 14,   // 反応遅延（フレーム）min + rand*range
		decisionInterval: [28, 24],     // 行動間隔 [min, rand]
		reactChance: 0.15,              // プレイヤー攻撃へのガード反応確率
		slashFreq: 0.30,                // 斬り選択率（中距離）
		guardFreq: 0.20,                // ガード選択率
		grabGuardMult: 0.25,            // 盾中の投げ確率倍率
		longGuardThreshold: 120,        // 長時間ガード判定（フレーム）
		reboundGrabChance: 0.40,        // パリィ後投げ反撃確率
		jumpCounterChance: 0.08,        // 空中接近をスラッシュで迎え撃つ確率
		jumpRetreatChance: 0.15,        // 空中接近を後退で回避する確率
		auraColor: null,                // Lv8専用
	},
	// Lv2 – 少し速い
	{
		name: "BRAWLER",
		delayMin: 13, delayRange: 10,
		decisionInterval: [24, 20],
		reactChance: 0.20,
		slashFreq: 0.35,
		guardFreq: 0.18,
		grabGuardMult: 0.35,
		longGuardThreshold: 100,
		reboundGrabChance: 0.55,
		jumpCounterChance: 0.15,
		jumpRetreatChance: 0.22,
		auraColor: null,
	},
	// Lv3 – 標準
	{
		name: "SOLDIER",
		delayMin: 11, delayRange: 8,
		decisionInterval: [22, 16],
		reactChance: 0.28,
		slashFreq: 0.40,
		guardFreq: 0.16,
		grabGuardMult: 0.50,
		longGuardThreshold: 80,
		reboundGrabChance: 0.70,
		jumpCounterChance: 0.22,
		jumpRetreatChance: 0.30,
		auraColor: null,
	},
	// Lv4 – 今の強さ（デフォルト）
	{
		name: "WARRIOR",
		delayMin: 8, delayRange: 10,
		decisionInterval: [16, 16],
		reactChance: 0.40,
		slashFreq: 0.45,
		guardFreq: 0.15,
		grabGuardMult: 0.72,
		longGuardThreshold: 60,
		reboundGrabChance: 1.00,
		jumpCounterChance: 0.32,
		jumpRetreatChance: 0.40,
		auraColor: null,
	},
	// Lv5 – 盾対策が厳しい
	{
		name: "KNIGHT",
		delayMin: 7, delayRange: 8,
		decisionInterval: [14, 14],
		reactChance: 0.50,
		slashFreq: 0.48,
		guardFreq: 0.14,
		grabGuardMult: 0.80,
		longGuardThreshold: 45,
		reboundGrabChance: 1.00,
		jumpCounterChance: 0.42,
		jumpRetreatChance: 0.50,
		auraColor: null,
	},
	// Lv6 – 速い・連撃あり
	{
		name: "CHAMPION",
		delayMin: 6, delayRange: 7,
		decisionInterval: [12, 12],
		reactChance: 0.60,
		slashFreq: 0.52,
		guardFreq: 0.12,
		grabGuardMult: 0.85,
		longGuardThreshold: 35,
		reboundGrabChance: 1.00,
		jumpCounterChance: 0.52,
		jumpRetreatChance: 0.58,
		auraColor: null,
	},
	// Lv7 – かなり手強い
	{
		name: "WARLORD",
		delayMin: 5, delayRange: 6,
		decisionInterval: [10, 10],
		reactChance: 0.70,
		slashFreq: 0.55,
		guardFreq: 0.10,
		grabGuardMult: 0.90,
		longGuardThreshold: 25,
		reboundGrabChance: 1.00,
		jumpCounterChance: 0.60,
		jumpRetreatChance: 0.65,
		auraColor: null,
	},
	// Lv8 – 魔王。強いが理不尽ではない
	{
		name: "DARK LORD",
		delayMin: 5, delayRange: 5,
		decisionInterval: [8, 10],
		reactChance: 0.75,
		slashFreq: 0.55,
		guardFreq: 0.10,
		grabGuardMult: 0.90,
		longGuardThreshold: 20,
		reboundGrabChance: 1.00,
		jumpCounterChance: 0.68,
		jumpRetreatChance: 0.72,
		auraColor: "#f0c040",           // 金色オーラ
	},
];

const MAX_STAGE = LEVEL_PARAMS.length; // 8

// 現在のステージ（1-indexed）
let currentStage = 1;

function getLvParam() { return LEVEL_PARAMS[currentStage - 1]; }
function getEnemyPalette() { return ENEMY_PALETTES[currentStage - 1]; }

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
const SWORD_LEN = 55;  // 剣の長さを伸ばし、投げより間合いを広くする（38→55）
const SWORD_W   = 4;

// ── Grab constants ────────────────────────────────────────
const GRAB_REACH       = 34;  // 投げの間合い：体幅24px + 余裕10px
// ※ 衝突ヒットボックスを24pxに縮小したので、密着距離≒24px→その少し外が投げ間合い
const FIGHTER_HIT_W    = 24;  // 衝突判定の幅（スプライト64pxより小さい体幅）
const GRAB_DURATION    = 18;  // 投げモーション（失敗時はこのまま）
const GRAB_HIT_DURATION = 90; // 投げ成功後の攻撃者硬直（相手完全回復90fと同じ → 柔道不可）
const GRABBED_DURATION = 30;  // 吹き飛び時間（0.5sec）
const KNOCKED_DURATION = 36;  // 倒れている時間（0.6sec）無敵
const WAKEUP_DURATION  = 24;  // 起き上がりモーション（0.4sec）無敵
// 合計 90フレーム = 約1.5秒（ストリートファイター系の標準的な長さ）
const GRAB_MISS_DURATION = 45; // 投げ失敗時の自分の硬直（0.75sec）= 相手に反撃の機会
const GRAB_DAMAGE      = 18;  // 投げ成功ダメージ（剣より少し少なめ）
// 投げ成功・失敗ともに「硬直 = クールダウン」にして分かりやすく統一
// 柔道防止：成功後硬直50fで相手起き上がり(60f)の直前にやっと動ける
const GRAB_COOLDOWN       = 45;  // 投げ失敗後のクールダウン（硬直と同値）
const GRAB_HIT_COOLDOWN   = 90;  // 投げ成功後のクールダウン（硬直と同値）

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

// ── Stage HUD 更新 ────────────────────────────────────────
// Lv別HPバー色（パレット[2]が暗すぎる場合の補正）
const STAGE_HP_COLORS = [
	"#c03030", // Lv1 赤
	"#d06018", // Lv2 橙
	"#c0a020", // Lv3 黄
	"#508030", // Lv4 黄緑
	"#2050b0", // Lv5 青
	"#7030a0", // Lv6 紫
	"#900020", // Lv7 深紅
	"#c8a000", // Lv8 金（魔王）
];

function updateStageHud() {
	const lv = getLvParam();
	document.getElementById("stage-badge").textContent = `STAGE ${currentStage}`;
	document.getElementById("enemy-name").textContent = lv.name;
	// 敵HPバーの色をステージカラーに合わせる（専用色テーブルを使用）
	document.getElementById("hp-bar-e").style.background = STAGE_HP_COLORS[currentStage - 1];
}

// ── Init ──────────────────────────────────────────────────
function startFight() {
	player = makeFighter(40, true);
	enemy  = makeFighter(AW - 40 - SPRITE_W * SCALE, false);
	phase  = "fight";
	// エフェクトリセット
	resetGrabEffects();
	// AI 変数リセット
	aiDecisionTimer      = 20;
	aiPendingIntent      = null;
	aiPendingDelay       = 0;
	aiCurrentIntent      = "idle";
	aiReactQueued        = false;
	aiReactDelay         = 0;
	aiPlayerGuardFrames  = 0;
	aiReboundGrabQueued  = 0;
	aiFeintTimer         = 0;
	hideOverlay();
	updateHud();
	updateStageHud();
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
			// 起き上がり完了 → idle（HP0の場合はdead）
			f.state = f.hp <= 0 ? "dead" : "idle";
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
	// grabbed / knocked / hurt / grab は慣性を保持（vx をリセットしない）
	// grab も含めることで投げ後の後退モーションが機能する
	const preserveVelocity = (f.state === "grabbed" || f.state === "knocked" || f.state === "hurt" || f.state === "grab");

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
	} else if (f.onGround && f.state === "jump") {
		// 着地したら idle に戻す
		f.state = "idle";
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
	// guard 中かつ攻撃者が正面にいる場合は必ずパリィ
	// （近距離で剣先が盾より後ろに届いても防御できる）
	if (defender.state === "guard") {
		const attackerOnRight = attacker.x > defender.x;
		const defenderFacingAttacker =
			(defender.facingRight && attackerOnRight) ||
			(!defender.facingRight && !attackerOnRight);

		if (defenderFacingAttacker) {
			// 攻撃者が正面 → 必ずパリィ
			attacker.slashHit = true;
			attacker.state = "rebound";
			attacker.stateTimer = REBOUND_DURATION;
			attacker.slashAngle = SLASH_ANGLE_START;
			defender.hp = Math.max(0, defender.hp - GUARD_DAMAGE);
			updateHud();
			sfxParry();
			return;
		}
		// 攻撃者が背後から → 盾は効果なし（そのまま body hit チェックに進む）
	}

	// ── Check body hit ────────────────────────────────────
	const bx = defender.x + 4;
	const bw = SPRITE_W * SCALE - 8;
	const by = defender.y + 4;
	const bh = SPRITE_H * SCALE - 8;

	if (tip.tx > bx && tip.tx < bx + bw && tip.ty > by && tip.ty < by + bh) {
		attacker.slashHit = true;
		defender.hp = Math.max(0, defender.hp - SLASH_DAMAGE);
		// hurt 状態（20f = 0.33sec）のあいだ vx で後退アニメーション
		// SLASH_COOLDOWN=22f より短いので、盾を張れば次の攻撃は届く前に後退完了
		defender.state = "hurt";
		defender.stateTimer = 20;
		// 後退速度: 20フレームで約80px後退
		const kDir = attacker.facingRight ? 1 : -1;
		defender.vx = kDir * 4.5;

		updateHud();
		sfxHit();
		if (defender.hp <= 0) {
			defender.state = "dead";
			// 倒れる方向を攻撃者の向きから設定（grabbed で倒された場合は上書きされない）
			defender.grabRotDir = attacker.facingRight ? 1 : -1;
		}
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
		// 投げ失敗エフェクト：攻撃者の前方に×印
		const missDir = attacker.facingRight ? 1 : -1;
		grabMissEffects.push({
			x: attacker.x + SPRITE_W * SCALE / 2 + missDir * 28,
			y: attacker.y + SPRITE_H * SCALE * 0.4,
			timer: 22, maxTimer: 22,
		});
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

	// ── 投げ成功後の攻撃者硬直（柔道防止）──────────────────────
	// stateTimerをGRAB_HIT_DURATIONに上書きして硬直を延長
	// grab stateはstateTimer切れでidleに戻るため、長くすることで起き上がりに間に合わなくなる
	attacker.stateTimer = GRAB_HIT_DURATION;

	// 攻撃者は投げた方向と逆に大きく押し戻される
	attacker.vx = -grabDir * 5.5;
	// 壁際補正：defender が壁で飛べない場合はさらに強く後退させる
	const defenderNearWall = defender.x <= 4 || defender.x >= AW - SPRITE_W * SCALE - 4;
	if (defenderNearWall) attacker.vx = -grabDir * 8.0;

	attacker.grabCooldown = GRAB_HIT_COOLDOWN;
	// 投げ成功エフェクト：相手の位置に衝撃波
	grabHitEffects.push({
		x: defender.x + SPRITE_W * SCALE / 2,
		y: defender.y + SPRITE_H * SCALE * 0.45,
		timer: 28, maxTimer: 28,
	});
	updateHud();
	sfxGrabHit();
	// HP0でもgrabbed→knockedアニメーションを最後まで再生してからdeadに遷移
	// （即座にdead=停止にせず、wakeup完了後にdeadになる）
	if (defender.hp <= 0) defender.hp = 0; // アニメーションはgrabbed→knocked→wakeupまで継続
}

// keep guard alive while held
function refreshGuard(f) {
	if (f === player && guardHeld && f.state === "guard") {
		f.stateTimer = 2; // reset timer so it doesn't expire
	}
}

// ── Grab effects ──────────────────────────────────────────
// 投げ成功：衝撃波リング
let grabHitEffects  = []; // { x, y, timer, maxTimer }
// 投げ失敗：×印
let grabMissEffects = []; // { x, y, timer, maxTimer, dir }

function resetGrabEffects() {
	grabHitEffects  = [];
	grabMissEffects = [];
}

function updateGrabEffects() {
	grabHitEffects  = grabHitEffects.filter(e  => { e.timer--;  return e.timer > 0; });
	grabMissEffects = grabMissEffects.filter(e => { e.timer--;  return e.timer > 0; });
}

function drawGrabEffects() {
	// ── 投げ成功：衝撃波リング ──────────────────────────────
	for (const e of grabHitEffects) {
		const prog = 1 - e.timer / e.maxTimer;
		const radius = 10 + prog * 55;
		const alpha  = (1 - prog) * 0.85;
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = "#f2c14e";
		ctx.lineWidth   = 3 * (1 - prog * 0.6);
		ctx.shadowColor = "#f2c14e";
		ctx.shadowBlur  = 12;
		ctx.beginPath();
		ctx.ellipse(e.x, e.y, radius, radius * 0.4, 0, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	// ── 投げ失敗：×印 ────────────────────────────────────
	for (const e of grabMissEffects) {
		const prog  = 1 - e.timer / e.maxTimer;
		const alpha = (1 - prog) * 0.9;
		const size  = 10 + prog * 8;
		// 震え（失敗時）
		const shakeX = (e.timer % 4 < 2) ? 3 : -3;
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = "#e85f5c";
		ctx.lineWidth   = 3;
		ctx.lineCap     = "round";
		ctx.shadowColor = "#e85f5c";
		ctx.shadowBlur  = 8;
		ctx.translate(e.x + shakeX, e.y);
		ctx.beginPath();
		ctx.moveTo(-size, -size); ctx.lineTo(size,  size);
		ctx.moveTo( size, -size); ctx.lineTo(-size, size);
		ctx.stroke();
		ctx.restore();
	}
}

// ── Enemy AI ──────────────────────────────────────────────
// 「知覚→遅延→行動」モデル
// 人間の反応時間：
//   最速アスリート: ~100ms (6f)、一般人: ~200ms (12f)、遅め: ~350ms (21f)
// AIは 12〜24フレームの正規分布ライクな遅延を持つ
function humanDelay() {
	const lv = getLvParam();
	return lv.delayMin + (Math.random() * (lv.delayRange / 2) | 0) + (Math.random() * (lv.delayRange / 2) | 0);
}

let aiDecisionTimer  = 20;   // 次に行動を検討するまでのフレーム
let aiPendingIntent  = null; // 遅延待ちの行動意図
let aiPendingDelay   = 0;    // 残り遅延フレーム
let aiCurrentIntent  = "idle"; // 現在実行中の意図

// ガードへの反応用（攻撃を見てからガードを出すまでの遅延）
let aiReactQueued = false;
let aiReactDelay  = 0;

// ── 対盾戦術用 ────────────────────────────────────────────
let aiPlayerGuardFrames  = 0;  // プレイヤーが盾を張り続けたフレーム数
let aiReboundGrabQueued  = 0;  // パリィされた後の反撃投げ遅延（> 0 でキュー中）
let aiFeintTimer         = 0;  // フェイント（近づいて引く）の残りフレーム

function updateAI() {
	if (enemy.state === "dead" || player.state === "dead") return;

	// タイマーカウントダウン
	if (aiDecisionTimer  > 0) aiDecisionTimer--;
	if (aiPendingDelay   > 0) aiPendingDelay--;
	if (aiReactDelay     > 0) aiReactDelay--;
	if (aiReboundGrabQueued > 0) aiReboundGrabQueued--;
	if (aiFeintTimer     > 0) aiFeintTimer--;

	// ── プレイヤーのガード継続時間を追跡 ──────────────────────
	if (player.state === "guard") {
		aiPlayerGuardFrames++;
	} else {
		aiPlayerGuardFrames = 0;
	}

	const dist = Math.abs(enemy.x - player.x);
	const slashRange = SWORD_LEN + SPRITE_W * SCALE * 0.7;
	const comfortDist = 85;

	// ── ① パリィ後の投げ反撃：rebound が終わったら接近して投げ ──
	// rebound 終了直後（stateTimer が 0 になる瞬間）を検出
	if (enemy.state === "rebound" && enemy.stateTimer === 1) {
		// rebound 終了と同時に投げ反撃キューを開始（遅延 8〜14f = 133〜233ms）
		aiReboundGrabQueued = 8 + (Math.random() * 6 | 0);
	}

	// rebound 後の投げ反撃を実行
	if (aiReboundGrabQueued === 1
		&& enemy.state !== "rebound" && enemy.state !== "slash"
		&& enemy.state !== "grabbed" && enemy.state !== "knocked") {
		// 接近意図を即座にセット（クールダウンをリセットして強制）
		aiCurrentIntent = "grab_approach";
		aiPendingIntent = null;
		aiDecisionTimer = 40; // 次の通常判断まで少し長めに猶予を与える
	}

	// ── 状況を観察して「行動意図」を決定（遅延付き）──────────
	if (aiDecisionTimer <= 0 && aiPendingIntent === null) {
		const lv = getLvParam();
		const r = Math.random();
		let intent;

		// レベルパラメータを使った長時間ガード対策
		const playerLongGuard = aiPlayerGuardFrames > lv.longGuardThreshold;
		const playerGuarding = player.state === "guard";
		// 盾中の投げ確率（grabGuardMult を閾値として使用）
		const grabOnGuard = lv.grabGuardMult;

		if (dist > comfortDist * 1.6) {
			intent = "approach";
		} else if (dist < slashRange * 0.5) {
			// 密着距離
			if (playerGuarding) {
				intent = r < grabOnGuard ? "grab" : "retreat";
			} else if (playerLongGuard) {
				intent = r < (grabOnGuard * 0.75) ? "grab" : "slash";
			} else {
				intent = r < lv.slashFreq ? "slash" : "retreat";
			}
		} else if (dist < slashRange * 1.1) {
			if (playerGuarding && r < grabOnGuard * 0.7) {
				intent = "grab_approach";
			} else if (playerLongGuard && r < grabOnGuard * 0.55) {
				intent = "feint_grab";
			} else if (r < lv.slashFreq) {
				intent = "slash";
			} else if (r < lv.slashFreq + lv.guardFreq) {
				intent = "guard";
			} else {
				intent = "approach";
			}
		} else {
			intent = r < 0.55 ? "approach" : "retreat";
		}
		aiPendingIntent = intent;
		aiPendingDelay  = humanDelay();
	}

	// 遅延経過後に意図を実行に移す
	if (aiPendingIntent !== null && aiPendingDelay <= 0) {
		aiCurrentIntent = aiPendingIntent;
		aiPendingIntent = null;
		const lv = getLvParam();
		aiDecisionTimer = lv.decisionInterval[0] + (Math.random() * lv.decisionInterval[1] | 0);
	}

	enemy.facingRight = player.x > enemy.x;
	enemy.moveLeft = false;
	enemy.moveRight = false;

	// ── ② 空中接近への対応（ジャンプ投げ対策）──────────────────
	// プレイヤーが空中で落下中 かつ こちらに近づいている → スラッシュor後退
	{
		const lv = getLvParam();
		const playerFalling = !player.onGround && player.vy > 0; // 落下中
		const playerApproaching = (player.facingRight && player.x < enemy.x)
			|| (!player.facingRight && player.x > enemy.x); // こちらに向かっている
		const jumpThreatRange = GRAB_REACH + SPRITE_W * SCALE * 1.2; // 投げが届きそうな距離+余裕

		if (playerFalling && playerApproaching && dist < jumpThreatRange
			&& enemy.state !== "slash" && enemy.slashCooldown <= 0
			&& enemy.state !== "hurt" && enemy.state !== "rebound") {
			const r2 = Math.random();
			if (r2 < lv.jumpCounterChance) {
				// カウンタースラッシュ：着地する前に斬る
				enemy.state = "slash";
				enemy.stateTimer = SLASH_DURATION;
				enemy.slashAngle = SLASH_ANGLE_START;
				enemy.slashHit = false;
				aiCurrentIntent = "slash";
				aiDecisionTimer = 20;
			} else if (r2 < lv.jumpCounterChance + lv.jumpRetreatChance) {
				// 後退：投げ間合いから外れる
				aiCurrentIntent = "retreat";
				aiDecisionTimer = 14;
			}
		}
	}

	// ── プレイヤー攻撃への反応ガード（人間らしい遅延付き）──────
	if (player.state === "slash" && !aiReactQueued
		&& player.slashAngle > SLASH_ANGLE_START + 0.3
		&& Math.random() < getLvParam().reactChance) {
		aiReactQueued = true;
		aiReactDelay  = humanDelay();
	}
	if (aiReactQueued && aiReactDelay <= 0) {
		aiReactQueued = false;
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

	// 行動中は何もしない
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
			// ④ 直接投げ：密着していれば即投げ、まだ遠ければ接近
			if (dist <= GRAB_REACH && (enemy.state === "idle" || enemy.state === "walk")) {
				enemy.state = "grab";
				enemy.stateTimer = GRAB_DURATION;
				enemy.vx = 0;
			} else if (dist > GRAB_REACH) {
				// まだ届かない → 近づく
				if (enemy.facingRight) enemy.moveRight = true;
				else enemy.moveLeft = true;
			}
			break;
		case "grab_approach":
			// ⑤ 接近して投げ：パリィ後反撃・盾対処
			if (dist <= GRAB_REACH && (enemy.state === "idle" || enemy.state === "walk")) {
				enemy.state = "grab";
				enemy.stateTimer = GRAB_DURATION;
				enemy.vx = 0;
				aiCurrentIntent = "idle";
			} else {
				// まだ遠い → 全力接近
				if (enemy.facingRight) enemy.moveRight = true;
				else enemy.moveLeft = true;
			}
			break;
		case "feint_grab": {
			// ⑥ フェイント：まず接近（攻撃を誘う）→ 盾を張ったところで投げ
			if (aiFeintTimer <= 0) {
				// フェイント開始：20〜30f 間接近する
				aiFeintTimer = 20 + (Math.random() * 10 | 0);
			}
			if (aiFeintTimer > 10) {
				// フェイント前半：接近（盾を誘う）
				if (enemy.facingRight) enemy.moveRight = true;
				else enemy.moveLeft = true;
			} else {
				// フェイント後半：投げに移行
				if (dist <= GRAB_REACH && (enemy.state === "idle" || enemy.state === "walk")) {
					enemy.state = "grab";
					enemy.stateTimer = GRAB_DURATION;
					enemy.vx = 0;
					aiCurrentIntent = "idle";
					aiFeintTimer = 0;
				} else {
					if (enemy.facingRight) enemy.moveRight = true;
					else enemy.moveLeft = true;
				}
			}
			break;
		}
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
		// 地面に横倒し（上向き）。knocked と同じ位置合わせを使う。
		// 90°回転後の最下点が GROUND に接するよう cy を調整
		const dCx = f.x + SPRITE_W * SCALE / 2;
		const dCy = GROUND - 16;
		const deadAngle = f.grabRotDir * Math.PI / 2;
		ctx.save();
		ctx.globalAlpha = 0.45;
		ctx.translate(dCx, dCy);
		ctx.rotate(deadAngle);
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

	// grab 状態：前傾み + 黄色グロー
	if (f.state === "grab") {
		const grabProg = 1 - f.stateTimer / GRAB_HIT_DURATION;
		const leanDir  = f.facingRight ? 1 : -1;
		// 最初の18f（投げ動作）は前傾み、その後は硬直で戻る
		const leanPhase = f.stateTimer > (GRAB_HIT_DURATION - GRAB_DURATION)
			? (GRAB_HIT_DURATION - f.stateTimer) / GRAB_DURATION  // 0→1
			: 1 - (GRAB_HIT_DURATION - f.stateTimer - GRAB_DURATION) / (GRAB_HIT_DURATION - GRAB_DURATION); // 1→0
		// 失敗時（stateTimer > GRAB_HIT_DURATION - GRAB_DURATION は成功時のみ）
		// grab失敗では stateTimer は GRAB_MISS_DURATION から始まる（GRAB_HIT_DURATIONより小）
		// → GRAB_HIT_DURATION - f.stateTimer が負になるため leanPhase が 0 になる
		// 仰け反り：grab失敗（hurt state）では別途処理するため、ここは成功時のみ
		const leanAngle = leanDir * 0.32 * Math.max(0, Math.min(1, leanPhase));
		const cx = f.x + SPRITE_W * SCALE / 2;
		const cy = f.y + SPRITE_H * SCALE;
		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate(leanAngle);
		ctx.translate(-cx, -cy);
		ctx.shadowColor = "rgba(242,193,78,0.8)";
		ctx.shadowBlur = 14;
	}

	// hurt 状態：仰け反り（grab失敗 = 相手方向と逆に傾く）
	if (f.state === "hurt") {
		// hurt の stateTimer は長いもの（GRAB_MISS_DURATION=45f）と短いもの（slash=20f）がある
		// 45f以上の場合は投げ失敗として仰け反り演出
		if (f.stateTimer > 30) {
			const hurtDir = f.facingRight ? -1 : 1; // 相手の逆方向に倒れる
			const hurtPhase = Math.min(1, (GRAB_MISS_DURATION - f.stateTimer) / 12);
			const hurtAngle = hurtDir * 0.28 * hurtPhase;
			const hcx = f.x + SPRITE_W * SCALE / 2;
			const hcy = f.y + SPRITE_H * SCALE;
			ctx.save();
			ctx.translate(hcx, hcy);
			ctx.rotate(hurtAngle);
			ctx.translate(-hcx, -hcy);
		}
	}

	const frame = f.state === "walk" ? f.animFrame : 0;

	drawPixelSprite(SPRITE_HERO_R, palette, frame, f.x, f.y, !f.facingRight);
	drawSword(f);
	drawShield(f);

	if (f.state === "grab") ctx.restore();
	if (f.state === "hurt" && f.stateTimer > 30) ctx.restore();
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

// ── Lv8 魔王オーラエフェクト ──────────────────────────────
function drawDarkLordAura(f) {
	const lv = getLvParam();
	if (!lv.auraColor || f.state === "dead") return;
	const t = Date.now() / 300;
	const cx = f.x + SPRITE_W * SCALE / 2;
	const cy = f.y + SPRITE_H * SCALE / 2;
	// 揺れる光輪を3層描く
	for (let i = 0; i < 3; i++) {
		const phase = t + i * (Math.PI * 2 / 3);
		const rx = 22 + Math.sin(phase * 1.3) * 5;
		const ry = 26 + Math.cos(phase * 0.9) * 4;
		const alpha = 0.18 + Math.sin(phase * 2) * 0.08;
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.shadowColor = lv.auraColor;
		ctx.shadowBlur = 18;
		ctx.strokeStyle = lv.auraColor;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.ellipse(cx, cy, rx + i * 5, ry + i * 4, t * 0.4 + i, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}
	// 足元の煙霧
	const smokeAlpha = 0.12 + Math.sin(t * 3) * 0.05;
	ctx.save();
	ctx.globalAlpha = smokeAlpha;
	ctx.fillStyle = lv.auraColor;
	ctx.shadowColor = lv.auraColor;
	ctx.shadowBlur = 24;
	ctx.beginPath();
	ctx.ellipse(cx, GROUND - 4, 22, 6, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function render() {
	ctx.clearRect(0, 0, AW, AH);
	drawArena();
	// 魔王オーラは敵キャラの後ろに描く
	drawDarkLordAura(enemy);
	drawFighter(enemy, getEnemyPalette());
	drawFighter(player, PAL_HERO);
	// 投げエフェクトはキャラの前に描く
	drawGrabEffects();
}

// ── Game loop ─────────────────────────────────────────────
// タッチボタン用フラグ（毎フレームの keys 同期で上書きされないよう分離）
let touchMoveLeft  = false;
let touchMoveRight = false;

function tick() {
	// キー状態を毎フレーム keys から直接同期（keyup 取りこぼし対策）
	// タッチボタンとOR合成して、どちらかが押されていれば移動
	if (player) {
		player.moveLeft  = !!keys["ArrowLeft"]  || touchMoveLeft;
		player.moveRight = !!keys["ArrowRight"] || touchMoveRight;
	}

	if (phase === "fight") {
		refreshGuard(player);
		updateAI();
		updateFighter(player, enemy);
		updateFighter(enemy, player);

		// ── Fighter vs Fighter collision (push apart) ─────
		// 体幅 FIGHTER_HIT_W (24px) でスプライト中央付近の当たり判定
		const pCx = player.x + SPRITE_W * SCALE / 2;
		const eCx = enemy.x  + SPRITE_W * SCALE / 2;
		const pLeft  = pCx - FIGHTER_HIT_W / 2;
		const pRight = pCx + FIGHTER_HIT_W / 2;
		const eLeft  = eCx - FIGHTER_HIT_W / 2;
		const eRight = eCx + FIGHTER_HIT_W / 2;
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
		updateGrabEffects();

		if (player.state === "dead") {
			phase = "lose";
			setTimeout(() => showOverlay("💀 DEFEAT", "もう一度"), 600);
		} else if (enemy.state === "dead") {
			if (currentStage >= MAX_STAGE) {
				// 全ステージクリア → エンディング
				phase = "ending";
				setTimeout(() => {
					overlayTxt.innerHTML = "👑 ALL STAGES CLEAR!\n\n⚔️ 真の剣士よ、おめでとう！";
					overlayTxt.style.whiteSpace = "pre-line";
					overlayBtn.textContent = "もう一度挑戦";
					overlayEl.classList.add("show");
				}, 800);
			} else {
				// ステージクリア → 次へ
				phase = "stageclear";
				const clearedStage = currentStage;
				setTimeout(() => {
					showOverlay(`✨ STAGE ${clearedStage} CLEAR!`, "次のステージへ");
				}, 600);
			}
		}
	}
	render();
	animReqId = requestAnimationFrame(tick);
}

// ── Keyboard ──────────────────────────────────────────────
const keys = {};

// フォーカスが外れたとき・ページが非表示になったときに全フラグをリセット
function resetAllInputs() {
	for (const k of Object.keys(keys)) keys[k] = false;
	touchMoveLeft  = false;
	touchMoveRight = false;
	if (player) {
		player.moveLeft  = false;
		player.moveRight = false;
	}
	guardHeld = false;
	if (player && player.state === "guard") player.state = "idle";
}
window.addEventListener("blur", resetAllInputs);
document.addEventListener("visibilitychange", () => {
	if (document.hidden) resetAllInputs();
});

document.addEventListener("keydown", e => {
	const wasDown = keys[e.key];
	keys[e.key] = true;
	// 初回押しのみアクション発動（キーリピートは無視）
	if (!wasDown) {
		switch (e.key) {
			case "ArrowUp": e.preventDefault(); playerJump(); break;
			case "a": case "A": playerGuardStart(); break;
			case "s": case "S": playerSlash(); break;
			case "d": case "D": playerGrab(); break;
			case " ": e.preventDefault(); playerJump(); break;
		}
	}
	if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
});
document.addEventListener("keyup", e => {
	keys[e.key] = false;
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

bindBtn("btn-left",  () => { touchMoveLeft  = true; }, () => { touchMoveLeft  = false; });
bindBtn("btn-right", () => { touchMoveRight = true; }, () => { touchMoveRight = false; });
bindBtn("btn-jump",  () => playerJump(), null);
bindBtn("btn-guard", () => playerGuardStart(), () => playerGuardEnd());
bindBtn("btn-slash", () => playerSlash(), null);
bindBtn("btn-grab",  () => playerGrab(), null);

// ── Overlay / boot ────────────────────────────────────────
overlayBtn.addEventListener("click", () => {
	cancelAnimationFrame(animReqId);
	if (phase === "stageclear") {
		// 次のステージへ進む（プレイヤーHPは引き継がない → 全回復）
		currentStage++;
		startFight();
		tick();
	} else if (phase === "ending") {
		// エンディングからやり直し → ステージ1から
		currentStage = 1;
		overlayTxt.style.whiteSpace = "";
		startFight();
		tick();
	} else if (phase === "lose") {
		// 負け → 同じステージをやり直し
		startFight();
		tick();
	} else if (phase === "title") {
		currentStage = 1;
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
