// ── Blade of Lumia – Sound System ────────────────────────────
// Dungeon World の sounds.js を継承し、アクションRPG用 SE を追加

let audioContext = null;

export function getAudioContext() {
	if (!audioContext) {
		audioContext = new (window.AudioContext || window.webkitAudioContext)();
	}
	return audioContext;
}

export function tone(ctx, start, frequency, duration, type, volume) {
	const osc  = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(frequency, start);
	gain.gain.setValueAtTime(volume, start);
	gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(start);
	osc.stop(start + duration + 0.01);
}

// ── BGM 管理 ──────────────────────────────────────────────────
let _bgmTimer   = null;
let _bgmPlaying = false;
let _bgmKey     = null;
let _bgmGain    = null;

function _getBgmGain(ctx) {
	if (!_bgmGain) {
		_bgmGain = ctx.createGain();
		_bgmGain.connect(ctx.destination);
	}
	return _bgmGain;
}

function bgmTone(ctx, start, frequency, duration, type, volume) {
	if (!_bgmPlaying) return;
	const osc  = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(frequency, start);
	gain.gain.setValueAtTime(volume, start);
	gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
	osc.connect(gain);
	gain.connect(_getBgmGain(ctx));
	osc.start(start);
	osc.stop(start + duration + 0.01);
}

// ── フィールド BGM（明るめ）─────────────────────────────────────
function _playFieldBgmLoop(ctx) {
	if (!_bgmPlaying || _bgmKey !== 'field') return;
	const now = ctx.currentTime;
	const vol = 0.035;

	const bass = [130.81, 98, 110, 87.31];
	bass.forEach((f, i) => {
		bgmTone(ctx, now + i * 2.0,       f,       1.8, 'triangle', vol * 0.8);
		bgmTone(ctx, now + i * 2.0 + 0.9, f * 1.5, 0.5, 'triangle', vol * 0.3);
	});

	const mel = [
		[261.63, 0.5], [329.63, 0.5], [392.00, 0.5], [440.00, 1.0],
		[392.00, 0.5], [349.23, 0.5], [329.63, 1.0],
		[293.66, 0.5], [329.63, 0.5], [349.23, 0.5], [392.00, 1.5],
		[349.23, 0.5], [329.63, 0.5], [293.66, 1.5],
	];
	let t = now + 0.3;
	for (const [freq, dur] of mel) {
		bgmTone(ctx, t, freq, dur * 0.8, 'sine', vol * 0.7);
		t += dur;
	}

	[0.5, 2.0, 4.0, 5.5, 7.5, 9.0, 11.0, 13.0].forEach(bt => {
		bgmTone(ctx, now + bt, 100, 0.06, 'square', vol * 0.3);
	});

	_bgmTimer = setTimeout(() => _playFieldBgmLoop(ctx), 16000 - 200);
}

// ── ダンジョン BGM（初代ゼルダ風・不気味な短調）──────────────────
// Aマイナー基調。重い低音ドローン＋不気味なアルペジオ＋メロディー
function _playDungeonBgmLoop(ctx) {
	if (!_bgmPlaying || _bgmKey !== 'dungeon') return;
	const now = ctx.currentTime;
	const vol = 0.032;

	// ── 低音ドローン（重く暗い）──────────────────────────────────
	// 55Hz (A1) と 110Hz (A2) の重低音を全体に敷く
	bgmTone(ctx, now,      55.00, 16.0, 'sawtooth', vol * 0.20);
	bgmTone(ctx, now,     110.00, 16.0, 'triangle', vol * 0.15);

	// ── ベースライン（Amマイナースケール）──────────────────────────
	// A2=110, E2=82.4, G2=98, F2=87.3, Am低域
	const bassLine = [
		[110.00, 1.5], [82.41, 0.5], [98.00, 1.0], [87.31, 1.0],
		[110.00, 1.0], [73.42, 1.0], [87.31, 0.5], [82.41, 1.5],
	];
	let bt = now;
	for (const [f, dur] of bassLine) {
		bgmTone(ctx, bt, f,       dur * 0.85, 'sawtooth', vol * 0.75);
		bgmTone(ctx, bt, f * 2.0, dur * 0.5,  'square',   vol * 0.18);
		bt += dur;
	}

	// ── 不気味なアルペジオ（Amコード: A3,C4,E4）──────────────────
	// 220, 261.63, 329.63 Hz
	const arpNotes = [220.00, 261.63, 329.63, 261.63];
	const arpTimes = [0.0, 0.3, 0.6, 0.9]; // 1小節
	for (let bar = 0; bar < 4; bar++) {
		arpTimes.forEach((offset, idx) => {
			bgmTone(ctx, now + bar * 1.2 + offset, arpNotes[idx], 0.22, 'square', vol * 0.35);
		});
	}
	// 後半4小節：Emアルペジオ (E3=164.8, G3=196, B3=246.9)
	const arpE = [164.81, 196.00, 246.94, 196.00];
	for (let bar = 0; bar < 4; bar++) {
		arpTimes.forEach((offset, idx) => {
			bgmTone(ctx, now + 4.8 + bar * 1.2 + offset, arpE[idx], 0.22, 'square', vol * 0.30);
		});
	}

	// ── 主メロディー（初代ゼルダ「地下洞窟」風 短調） ────────────
	// Am スケール（A,B,C,D,E,F,G）で暗いフレーズ
	const melody = [
		[440.00, 0.4], [392.00, 0.2], [349.23, 0.4], [329.63, 0.4],
		[293.66, 0.4], [261.63, 0.4], [246.94, 0.8],
		[261.63, 0.4], [293.66, 0.4], [329.63, 0.4], [349.23, 0.4],
		[329.63, 0.4], [293.66, 0.4], [261.63, 1.2],
		[246.94, 0.4], [261.63, 0.4], [293.66, 0.4], [329.63, 0.4],
		[293.66, 0.4], [261.63, 0.4], [220.00, 1.6],
	];
	let mt = now + 1.5;
	for (const [freq, dur] of melody) {
		bgmTone(ctx, mt, freq, dur * 0.80, 'triangle', vol * 0.70);
		mt += dur;
	}

	// ── タイコ（重い一拍） ─────────────────────────────────────────
	[0, 1.2, 2.4, 3.6, 4.8, 6.0, 7.2, 8.4, 9.6, 10.8, 12.0, 13.2, 14.4, 15.6].forEach(t => {
		bgmTone(ctx, now + t, 60, 0.12, 'square', vol * 0.60);
	});
	// 裏拍（弱く）
	[0.6, 1.8, 3.0, 4.2, 5.4, 6.6, 7.8, 9.0, 10.2, 11.4, 12.6, 13.8, 15.0].forEach(t => {
		bgmTone(ctx, now + t, 45, 0.07, 'square', vol * 0.25);
	});

	_bgmTimer = setTimeout(() => _playDungeonBgmLoop(ctx), 16000 - 200);
}

// ── ボス BGM（激しい）─────────────────────────────────────────────
function _playBossBgmLoop(ctx) {
	if (!_bgmPlaying || _bgmKey !== 'boss') return;
	const now = ctx.currentTime;
	const vol = 0.04;

	const bass = [55, 55, 65.41, 55, 49, 55, 65.41, 73.42];
	bass.forEach((f, i) => {
		bgmTone(ctx, now + i * 1.0,       f,       0.9, 'sawtooth', vol);
		bgmTone(ctx, now + i * 1.0 + 0.4, f * 2,   0.2, 'square',   vol * 0.5);
	});

	const mel = [
		[110, 0.25], [130.81, 0.25], [146.83, 0.5],
		[130.81, 0.25], [110, 0.5], [98, 0.25], [110, 0.5],
		[130.81, 0.25], [146.83, 0.25], [164.81, 0.5],
		[146.83, 0.5], [130.81, 1.0],
	];
	let t = now + 0.1;
	for (const [freq, dur] of mel) {
		bgmTone(ctx, t, freq, dur * 0.7, 'sawtooth', vol * 0.6);
		t += dur;
	}

	[0, 0.25, 0.5, 1.0, 1.25, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0,
	 5.5, 6.0, 6.5, 7.0, 7.5].forEach(bt => {
		bgmTone(ctx, now + bt, 55, 0.08, 'square', vol * 0.7);
	});

	_bgmTimer = setTimeout(() => _playBossBgmLoop(ctx), 8000 - 100);
}

// ── エンディング BGM（ハッピーエンド・明るいCメジャー）────────────
function _playEndingBgmLoop(ctx) {
	if (!_bgmPlaying || _bgmKey !== 'ending') return;
	const now = ctx.currentTime;
	const vol = 0.030;

	// ── 低音弦（暖かみのあるベース）─────────────────────────────────
	// C2=65.4, G2=98, F2=87.3, Am2=110 進行
	const bassLine = [
		[65.41, 2.0], [98.00, 2.0], [87.31, 2.0], [110.00, 2.0],
		[65.41, 2.0], [98.00, 2.0], [87.31, 1.0], [73.42,  1.0],
	];
	let bt = now;
	for (const [f, dur] of bassLine) {
		bgmTone(ctx, bt, f,       dur * 0.7, 'triangle', vol * 0.55);
		bgmTone(ctx, bt, f * 2.0, dur * 0.4, 'sine',     vol * 0.20);
		bt += dur;
	}

	// ── ハープ風アルペジオ（Cメジャーコード: C4=261.6, E4=329.6, G4=392）─
	// I - V - IV - VIm コード進行
	const chords = [
		[261.63, 329.63, 392.00], // C
		[196.00, 246.94, 293.66], // G
		[174.61, 220.00, 261.63], // F
		[220.00, 261.63, 329.63], // Am
	];
	chords.forEach((chord, ci) => {
		const base = now + ci * 4.0;
		// 32分音符刻みのアルペジオ
		[0.0, 0.18, 0.36, 0.54, 0.72, 0.90, 1.08, 1.26,
		 1.6, 1.78, 1.96, 2.14, 2.32, 2.50, 2.68, 2.86].forEach((offset, oi) => {
			const note = chord[oi % 3];
			bgmTone(ctx, base + offset, note, 0.15, 'sine', vol * 0.30);
		});
	});

	// ── 主旋律（明るく軽快なCメジャースケール）────────────────────
	// "勝利のテーマ"っぽいファンファーレ風フレーズ
	const melody = [
		// フレーズA（上昇）
		[261.63, 0.25], [329.63, 0.25], [392.00, 0.25], [523.25, 0.50],
		[493.88, 0.25], [523.25, 0.25], [587.33, 0.50],
		[523.25, 0.25], [493.88, 0.25], [440.00, 0.25], [392.00, 0.50],
		[440.00, 0.25], [392.00, 0.25], [349.23, 0.25], [329.63, 0.75],
		// フレーズB（流れるように）
		[392.00, 0.25], [440.00, 0.25], [493.88, 0.25], [523.25, 0.50],
		[440.00, 0.25], [493.88, 0.25], [523.25, 0.50],
		[587.33, 0.25], [523.25, 0.25], [493.88, 0.25], [440.00, 0.50],
		[392.00, 0.25], [349.23, 0.25], [329.63, 0.25], [261.63, 1.50],
	];
	let mt = now + 0.5;
	for (const [freq, dur] of melody) {
		bgmTone(ctx, mt, freq, dur * 0.75, 'sine', vol * 0.75);
		// オクターブ上のハーモニー（薄く）
		bgmTone(ctx, mt, freq * 2, dur * 0.55, 'sine', vol * 0.15);
		mt += dur;
	}

	// ── 鐘のような高音（きらきら感）─────────────────────────────────
	[0.5, 1.25, 2.5, 4.0, 5.5, 7.0, 8.5, 10.0, 12.0, 14.0].forEach(t => {
		bgmTone(ctx, now + t, 1046.5, 0.4, 'sine', vol * 0.20);
		bgmTone(ctx, now + t + 0.05, 1318.5, 0.3, 'sine', vol * 0.12);
	});

	// ── リズム（軽いパーカッション）─────────────────────────────────
	for (let i = 0; i < 16; i++) {
		bgmTone(ctx, now + i * 1.0,       220, 0.05, 'square', vol * 0.18);
		bgmTone(ctx, now + i * 1.0 + 0.5, 180, 0.04, 'square', vol * 0.10);
	}

	_bgmTimer = setTimeout(() => _playEndingBgmLoop(ctx), 16000 - 200);
}

export function playBgm(key = 'field') {
	if (_bgmPlaying && _bgmKey === key) return;
	stopBgm();
	_bgmPlaying = true;
	_bgmKey = key;
	const ctx = getAudioContext();
	_getBgmGain(ctx).gain.setValueAtTime(1, ctx.currentTime);
	if (key === 'field')        _playFieldBgmLoop(ctx);
	else if (key === 'dungeon') _playDungeonBgmLoop(ctx);
	else if (key === 'boss')    _playBossBgmLoop(ctx);
	else if (key === 'ending')  _playEndingBgmLoop(ctx);
	else _playFieldBgmLoop(ctx); // fallback
}

export function stopBgm() {
	_bgmPlaying = false;
	_bgmKey = null;
	if (_bgmTimer !== null) {
		clearTimeout(_bgmTimer);
		_bgmTimer = null;
	}
	if (audioContext && _bgmGain) {
		// ゲインを即座に 0 にして切断
		try { _bgmGain.gain.setValueAtTime(0, audioContext.currentTime); } catch (_) {}
		try { _bgmGain.disconnect(); } catch (_) {}
		_bgmGain = null;
	}
	// AudioContext を閉じて再生成することで、スケジュール済みの
	// 全オシレーターを強制停止する（これが最も確実な方法）
	if (audioContext) {
		try { audioContext.close(); } catch (_) {}
		audioContext = null;
	}
}

export function resumeAudio() {
	if (audioContext && audioContext.state === 'suspended') {
		audioContext.resume();
	}
}

// ── SE オプション ─────────────────────────────────────────────
// 移動音 ON/OFF フラグ（true で有効）
export let MOVE_SOUND_ENABLED = false;

// ── SE ──────────────────────────────────────────────────────────
export function playSound(kind) {
	const ctx = getAudioContext();
	const now = ctx.currentTime;

	// 移動（軽いクリック音）※ MOVE_SOUND_ENABLED が true のときのみ鳴らす
	if (kind === 'move') {
		if (!MOVE_SOUND_ENABLED) return;
		tone(ctx, now, 800, 0.018, 'square', 0.018);
	}
	// 剣振り「シュッ」
	if (kind === 'slash') {
		tone(ctx, now,        800, 0.04, 'sawtooth', 0.06);
		tone(ctx, now + 0.02, 500, 0.06, 'sawtooth', 0.04);
		tone(ctx, now + 0.04, 300, 0.05, 'triangle', 0.03);
	}
	// 命中「ドスッ」
	if (kind === 'hit') {
		tone(ctx, now,        150, 0.06, 'sawtooth', 0.10);
		tone(ctx, now + 0.02, 100, 0.10, 'square',   0.08);
		tone(ctx, now + 0.05, 80,  0.12, 'triangle', 0.05);
	}
	// 弱点ヒット「ガキィン！」（Phase 8-4 (4) 0d-2.11）
	// 弱点は**文字で言わない**（2026-08-26 ユーザー確定）∴音だけで「今のは特別だった」と
	// 分かる必要がある。通常の hit（150→100→80Hz の鈍い低音）と**帯域で切り分ける**＝
	// 低音の芯は残しつつ、1568Hz 以上の金属倍音を重ねて上へ跳ねさせる。
	// ⚠️ 鍵（key: 880→1100→1320Hz の sine）とも別物にする＝ここは長らく key の流用で、
	//    「宝箱を開けたのと同じ音」に聞こえていた（0d-2.11 で専用化）。
	if (kind === 'weakHit') {
		tone(ctx, now,        180,  0.05, 'square',   0.10);   // 芯（当たった重み）
		tone(ctx, now,        1568, 0.10, 'square',   0.055);  // 金属質の高音（G6）
		tone(ctx, now + 0.03, 2093, 0.12, 'sawtooth', 0.045);  // 上へ跳ねる（C7）
		tone(ctx, now + 0.09, 2637, 0.16, 'sine',     0.05);   // 抜けの残響（E7）
	}
	// プレイヤーダメージ「ドン」
	if (kind === 'playerHit') {
		tone(ctx, now,        200, 0.08, 'square',   0.12);
		tone(ctx, now + 0.04, 150, 0.12, 'sawtooth', 0.10);
		tone(ctx, now + 0.10, 100, 0.15, 'triangle', 0.06);
	}
	// 敵撃破
	if (kind === 'enemyDie') {
		tone(ctx, now,        440, 0.05, 'sawtooth', 0.07);
		tone(ctx, now + 0.04, 330, 0.08, 'sawtooth', 0.06);
		tone(ctx, now + 0.10, 220, 0.12, 'triangle', 0.05);
	}
	// アイテム取得
	if (kind === 'item') {
		tone(ctx, now,        660, 0.07, 'sine', 0.05);
		tone(ctx, now + 0.07, 880, 0.09, 'sine', 0.06);
	}
	// ロウソクの炎「ボッ…ゴォォ」（Phase 4-3：茂みを燃やす）
	if (kind === 'fire') {
		tone(ctx, now,        180, 0.05, 'sawtooth', 0.06);
		tone(ctx, now + 0.03, 120, 0.12, 'sawtooth', 0.05);
		tone(ctx, now + 0.08, 90,  0.22, 'triangle', 0.045);
		tone(ctx, now + 0.10, 220, 0.18, 'sawtooth', 0.03);
	}
	// 宝箱
	if (kind === 'chest') {
		tone(ctx, now,        660, 0.07, 'sine', 0.05);
		tone(ctx, now + 0.07, 880, 0.09, 'sine', 0.06);
		tone(ctx, now + 0.16, 1100,0.12, 'sine', 0.05);
	}
	// 鍵
	if (kind === 'key') {
		tone(ctx, now,        880,  0.07, 'sine', 0.05);
		tone(ctx, now + 0.07, 1100, 0.09, 'sine', 0.06);
		tone(ctx, now + 0.14, 1320, 0.12, 'sine', 0.055);
	}
	// 扉を開ける
	if (kind === 'doorOpen') {
		tone(ctx, now,        440, 0.08, 'triangle', 0.05);
		tone(ctx, now + 0.06, 660, 0.1,  'triangle', 0.06);
		tone(ctx, now + 0.14, 550, 0.18, 'sine',     0.045);
	}
	// ゲート開閉
	if (kind === 'gateOpen') {
		tone(ctx, now,        220, 0.1,  'sawtooth', 0.04);
		tone(ctx, now + 0.08, 330, 0.12, 'triangle', 0.05);
		tone(ctx, now + 0.18, 440, 0.14, 'sine',     0.05);
	}
	// スイッチ
	if (kind === 'switch') {
		tone(ctx, now,        330, 0.06, 'square', 0.04);
		tone(ctx, now + 0.05, 500, 0.08, 'square', 0.05);
	}
	// ブーメラン投擲「ヒュン」
	if (kind === 'boomerangThrow') {
		tone(ctx, now,        600, 0.04, 'triangle', 0.05);
		tone(ctx, now + 0.03, 800, 0.04, 'triangle', 0.04);
		tone(ctx, now + 0.06, 700, 0.06, 'triangle', 0.03);
	}
	// ブーメランキャッチ
	if (kind === 'boomerangCatch') {
		tone(ctx, now,        500, 0.05, 'sine', 0.04);
		tone(ctx, now + 0.04, 700, 0.07, 'sine', 0.05);
	}
	// 爆弾爆発「ドカン」
	if (kind === 'bombExplosion') {
		tone(ctx, now,        120, 0.04, 'sawtooth', 0.15);
		tone(ctx, now + 0.02, 80,  0.12, 'square',   0.12);
		tone(ctx, now + 0.06, 50,  0.20, 'triangle', 0.08);
	}
	// NPC 会話
	if (kind === 'talk') {
		tone(ctx, now,        880, 0.04, 'sine', 0.04);
		tone(ctx, now + 0.03, 660, 0.04, 'sine', 0.03);
	}
	// 突進の溜め「グルルル…ガッ」（#14 突進猪・windup 360ms のあいだの予告）
	// ⚠️ 激突音（doorLock の流用）とは別の音にする＝プレイヤーが聞き分けるのは
	//    「これから来る（避けろ）」と「止まった（殴れる）」の2つ∴同じ音では機構が読めない。
	// ★ 低音を段で上げる＝溜まっていくことを音程で伝える（3 tick = 360ms に収める）。
	//   合間の短い高音2発＝蹄で地面を掻く音。
	if (kind === 'dashWindup') {
		tone(ctx, now,        70,  0.13, 'sawtooth', 0.050);
		tone(ctx, now + 0.11, 88,  0.13, 'sawtooth', 0.055);
		tone(ctx, now + 0.22, 110, 0.16, 'sawtooth', 0.060);
		tone(ctx, now + 0.05, 320, 0.03, 'square',   0.030);
		tone(ctx, now + 0.24, 300, 0.03, 'square',   0.030);
	}
	// 剣の振り上げ「シャリィィ…」（Phase 8-4 (4) 0d-2.6・ボスの近接攻撃の予告 360ms のあいだ）
	// ⚠️ 突進の溜め（dashWindup の低い段）とは別の音にする＝避け方が違う
	//    （剣＝間合いを外す／突進＝軸から外れる）∴音でも聞き分けられるようにする。
	// ★ 金属を擦り上げる高音のグリッサンド＝「刃が上がっていく」を音程の上昇で伝える
	//   （3 tick = 360ms に収める）。最後の一撃は無音＝振り下ろしは剣エフェクトが見せる。
	if (kind === 'swordWindup') {
		tone(ctx, now,        520,  0.09, 'triangle', 0.035);
		tone(ctx, now + 0.09, 660,  0.09, 'triangle', 0.040);
		tone(ctx, now + 0.18, 840,  0.10, 'triangle', 0.045);
		tone(ctx, now + 0.28, 1050, 0.06, 'sine',     0.030);
	}
	// 剣を持たない敵の近接の溜め「グググ…」（2026-08-26・`wieldsSword` を宣言していない敵）
	// ⚠️ 剣の振り上げ（swordWindup の金属の擦り上げ）とは別の音にする＝ユーザー指摘
	//    「こいつらは体当たり攻撃で、その予備動作はいままでどおりサイズの収縮でよかった」＝
	//    絵（`.slam-windup` の収縮）と音の両方が「体で来る」ことを告げる。
	// ★ 音程を**下降**させる＝体を沈めて縮む絵に合わせる（剣・ブレスの予告は上昇＝逆向き）。
	//   突進の溜め（dashWindup）は上昇する低音の段＝こちらは滑らかに下がる唸りで聞き分ける。
	//   予告の窓（MELEE_WINDUP_MS 480ms）に収める。
	if (kind === 'maulWindup') {
		tone(ctx, now,        130, 0.17, 'sawtooth', 0.040);
		tone(ctx, now + 0.16, 104, 0.17, 'sawtooth', 0.045);
		tone(ctx, now + 0.32, 82,  0.14, 'square',   0.040);
	}
	// 炎のブレスの溜め「スゥゥ…（吸い込み）」（Phase 8-4 (4) 0d-3・A 炎のサラマンドラ）
	// ⚠️ 吐く音（`fire`）とは別の音＝プレイヤーが聞き分けるのは「これから来る（射線から出ろ）」と
	//    「出た（もう安全・殴れる）」の2つ（GUIDE §7-6）。
	// ★ `fire` が**下降**（180→120→90Hz の唸り＝噴き出し）なのに対し、こちらは**上昇**させる
	//   ＝息を吸い込んでいく形。予告の窓（windupMs 720ms）に収める（最後の音の終わりが 0.66s）。
	if (kind === 'breathWindup') {
		tone(ctx, now,        110, 0.16, 'sine',     0.045);
		tone(ctx, now + 0.16, 150, 0.16, 'sine',     0.050);
		tone(ctx, now + 0.32, 200, 0.18, 'triangle', 0.050);
		tone(ctx, now + 0.50, 260, 0.16, 'triangle', 0.045);
	}
	// 砂から浮上「ズバッ…シャァ」（Phase 8-4 (4) 0d-3・N 砂嵐の蠍王の潜行待ち伏せ）
	// ⚠️ これは**結果の音**（出た＝殴れる／殴られる）＝予告の音ではない（GUIDE §7-6）。
	//    潜る側では鳴らさない＝聞き分けるのは「今どこに出たか」の1点だけ。
	// ⚠️ 近接の溜め（maulWindup の 130→104→82 の遅い低音の下降）とは別の音にする＝
	//    蠍王は浮上した直後に鉗肢を振る∴2つが続けて鳴る。register（音域）を分ける＝
	//    こちらは低音の一撃（砂を突き破る）＋**高音の速い下降**（砂が散る）。
	if (kind === 'sandBurst') {
		tone(ctx, now,        90,   0.05, 'square',   0.090);
		tone(ctx, now + 0.03, 1400, 0.05, 'sawtooth', 0.030);
		tone(ctx, now + 0.08, 900,  0.06, 'sawtooth', 0.026);
		tone(ctx, now + 0.14, 520,  0.10, 'triangle', 0.022);
	}
	// 締め上げの予告「クルクルクル…」（Phase 8-4 (4) 0d-3・J 深海の海蛇の巻きつきが閉じる）
	// ⚠️ 予告は**輪の絵と音の2経路**で出す（GUIDE §7-6）。輪は床に描かれる＝画面の端に
	//    プレイヤーが居ても音で「今から閉じる」が分かる必要がある。
	// ⚠️ 他の予告と形で切り分ける＝dashWindup（上昇する低音の段）・swordWindup（金属の
	//    擦り上げ）・maulWindup（滑らかに下がる唸り）・breathWindup（吸い込む上昇）。
	// ★ こちらは**2音を速く往復させる**（水が渦を巻く）＝上昇でも下降でもない「回っている」形。
	//   往復のたびに上の音だけ少し上げる＝輪が狭くなっていくことを音程差の広がりで伝える。
	//   予告の窓（crushWindupMs 720ms）に収める（最後の音の終わりが 0.66s）。
	if (kind === 'coilWindup') {
		tone(ctx, now,        300, 0.10, 'sine',     0.040);
		tone(ctx, now + 0.11, 420, 0.10, 'sine',     0.042);
		tone(ctx, now + 0.22, 300, 0.10, 'sine',     0.044);
		tone(ctx, now + 0.33, 440, 0.10, 'sine',     0.046);
		tone(ctx, now + 0.44, 300, 0.10, 'triangle', 0.046);
		tone(ctx, now + 0.55, 470, 0.11, 'triangle', 0.048);
	}
	// 輪が締まる軋み（Phase 8-4 (4) 0d-3・`tightenCues` の段を越えるたびに1回）。
	// ⚠️ 予告（coilWindup の渦）・締め上げ（coilCrush の低音の塊）とは別の**短い1音**＝
	//    「まだ縮んでいる／もうすぐ来る」の合図。**画面を見ていなくても近づきが分かる**ように、
	//    輪が赤くなるのと同じ拍で鳴らす（2026-08-29 ユーザー判定＝「攻撃がきそうな感じ」）。
	// ⚠️ 短く（0.09s×2）・音量も控えめ＝1周期に2回鳴っても耳障りにならない。
	if (kind === 'coilTighten') {
		tone(ctx, now,        520, 0.09, 'triangle', 0.030);
		tone(ctx, now + 0.05, 660, 0.09, 'triangle', 0.026);   // 上がる＝締まっていく
	}
	// 締め上げ「ゴシャッ」（Phase 8-4 (4) 0d-3・輪が閉じて内側を潰した瞬間＝結果の音）
	// ⚠️ 予告（coilWindup の渦）とは別の音＝聞き分けるのは「閉じる（外へ出ろ）」と
	//    「閉じ切った（硬直中＝殴れる）」の2つ。
	// ⚠️ 砂から浮上（sandBurst＝低音の一撃＋高音の速い下降）とも別にする＝こちらは
	//    水が押し潰される**帯域の狭い低音の塊**（高音の散る成分を持たない）。
	if (kind === 'coilCrush') {
		tone(ctx, now,        140, 0.06, 'square',   0.110);
		tone(ctx, now + 0.04, 96,  0.14, 'sawtooth', 0.095);
		tone(ctx, now + 0.10, 62,  0.22, 'triangle', 0.070);
		tone(ctx, now + 0.14, 210, 0.12, 'sine',     0.030);   // 水が絞り出される薄い倍音
	}
	// 扉ロック（ボス部屋）
	if (kind === 'doorLock') {
		tone(ctx, now,        180, 0.08, 'sawtooth', 0.08);
		tone(ctx, now + 0.06, 130, 0.12, 'square',   0.07);
		tone(ctx, now + 0.12, 100, 0.18, 'sawtooth', 0.06);
	}
	// ゲームオーバー
	if (kind === 'gameover') {
		tone(ctx, now,        220, 0.12, 'sawtooth', 0.08);
		tone(ctx, now + 0.10, 196, 0.15, 'sawtooth', 0.07);
		tone(ctx, now + 0.22, 164, 0.20, 'sawtooth', 0.07);
		tone(ctx, now + 0.40, 110, 0.35, 'sawtooth', 0.07);
	}
	// ルピー取得
	if (kind === 'rupee') {
		tone(ctx, now,        990, 0.04, 'sine', 0.05);
		tone(ctx, now + 0.03, 1320,0.06, 'sine', 0.05);
	}
	// 回復
	if (kind === 'heal') {
		tone(ctx, now,        523, 0.07, 'sine', 0.05);
		tone(ctx, now + 0.07, 659, 0.08, 'sine', 0.06);
		tone(ctx, now + 0.14, 784, 0.10, 'sine', 0.055);
	}
	// ステージ遷移
	if (kind === 'stageTransition') {
		tone(ctx, now,        440, 0.05, 'sine', 0.04);
		tone(ctx, now + 0.04, 550, 0.05, 'sine', 0.04);
		tone(ctx, now + 0.08, 660, 0.08, 'sine', 0.04);
	}
	// 出現（条件達成ギミック出現）
	if (kind === 'appear') {
		tone(ctx, now,        440, 0.06, 'triangle', 0.05);
		tone(ctx, now + 0.05, 660, 0.08, 'triangle', 0.06);
		tone(ctx, now + 0.12, 880, 0.10, 'sine',     0.05);
	}
	// 色スイッチ不発「ブブッ」（閉じる側のゲートに石が乗っていて切替が通らない・低く短い2音）
	if (kind === 'switchDenied') {
		tone(ctx, now,        180, 0.08, 'square', 0.06);
		tone(ctx, now + 0.09, 140, 0.10, 'square', 0.06);
	}
	// 盾ブロック「カーン」
	if (kind === 'shieldBlock') {
		tone(ctx, now,        1200, 0.01, 'square',   0.12);
		tone(ctx, now + 0.01, 900,  0.04, 'triangle', 0.10);
		tone(ctx, now + 0.04, 1400, 0.02, 'square',   0.07);
		tone(ctx, now + 0.06, 700,  0.10, 'sine',     0.06);
	}
	// エンディング（Dungeon World 継承）
	if (kind === 'flute') {
			// 魔法の音色。原作の笛を彷彿とさせる、上昇して締めくくる短いフレーズ
			// （木管風＝sine 基音＋薄いオクターブ上の倍音）。
			// [周波数, 開始オフセット(s), 長さ(s)]
			const phrase = [
				[587.33,  0.00, 0.14],  // D5
				[880.00,  0.13, 0.14],  // A5
				[1174.66, 0.26, 0.14],  // D6
				[987.77,  0.39, 0.14],  // B5
				[1174.66, 0.52, 0.16],  // D6
				[1318.51, 0.66, 0.45],  // E6
			];
			for (const [freq, off, dur] of phrase) {
				tone(ctx, now + off, freq, dur, 'sine', 0.07);
				tone(ctx, now + off, freq * 2, dur * 0.7, 'triangle', 0.018);
			}
		}
	if (kind === 'ending') {
		tone(ctx, now + 0.00, 523.25, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.30, 659.25, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.60, 783.99, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.90, 1046.5, 0.70, 'sine', 0.12);
		tone(ctx, now + 0.90, 659.25, 0.70, 'sine', 0.06);
		tone(ctx, now + 0.90, 783.99, 0.70, 'sine', 0.05);
	}
}
