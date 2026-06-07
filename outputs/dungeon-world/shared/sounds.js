// ── Dungeon World – Shared Sound System ──────────────────────
// one-step-dungeon と同じ Web Audio API ベースのサウンド

let audioContext = null;

export function getAudioContext() {
	if (!audioContext) {
		audioContext = new (window.AudioContext || window.webkitAudioContext)();
	}
	return audioContext;
}

export function tone(ctx, start, frequency, duration, type, volume) {
	const osc = ctx.createOscillator();
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

// ── ダンジョンBGM（ループ） ───────────────────────────────────
let _bgmTimer = null;
let _bgmPlaying = false;
let _bgmGain = null; // BGM専用 GainNode（音量制御用）

function _getBgmGain(ctx) {
	if (!_bgmGain) {
		_bgmGain = ctx.createGain();
		_bgmGain.connect(ctx.destination);
	}
	return _bgmGain;
}

// BGM用 tone（BGM GainNode 経由で出力）
function bgmTone(ctx, start, frequency, duration, type, volume) {
	if (!_bgmPlaying) return;
	const osc  = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(frequency, start);
	gain.gain.setValueAtTime(volume, start);
	gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
	osc.connect(gain);
	gain.connect(_getBgmGain(ctx)); // destination ではなく BGM GainNode に接続
	osc.start(start);
	osc.stop(start + duration + 0.01);
}

// ダンジョンBGM 1ループ分を鳴らす（約16秒）
function _playBgmLoop(ctx) {
	if (!_bgmPlaying) return;
	const now = ctx.currentTime;
	const vol = 0.035;

	const bass = [110, 82.41, 98, 73.42];
	bass.forEach((f, i) => {
		bgmTone(ctx, now + i * 2.0,       f,       1.8, 'sawtooth', vol * 0.9);
		bgmTone(ctx, now + i * 2.0 + 0.9, f * 1.5, 0.5, 'sawtooth', vol * 0.4);
	});

	const mel = [
		[220.00, 0.5], [261.63, 0.5], [293.66, 0.5], [329.63, 1.0],
		[293.66, 0.5], [261.63, 0.5], [220.00, 1.0],
		[196.00, 0.5], [220.00, 0.5], [261.63, 0.5], [293.66, 1.5],
		[261.63, 0.5], [246.94, 0.5], [220.00, 1.5],
	];
	let t = now + 0.5;
	for (const [freq, dur] of mel) {
		bgmTone(ctx, t, freq, dur * 0.85, 'triangle', vol * 0.75);
		t += dur;
	}

	bgmTone(ctx, now,     55.00, 8.0, 'sawtooth', vol * 0.25);
	bgmTone(ctx, now + 8, 55.00, 8.0, 'sawtooth', vol * 0.25);

	[1.0, 3.0, 5.5, 7.0, 9.0, 11.5, 13.0, 15.0].forEach(bt => {
		bgmTone(ctx, now + bt, 80, 0.08, 'square', vol * 0.5);
	});

	const loopLen = 16;
	_bgmTimer = setTimeout(() => _playBgmLoop(ctx), loopLen * 1000 - 200);
}

export function playBgm() {
	if (_bgmPlaying) return;
	_bgmPlaying = true;
	const ctx = getAudioContext();
	// GainNode の音量を通常に戻す
	_getBgmGain(ctx).gain.setValueAtTime(1, ctx.currentTime);
	_playBgmLoop(ctx);
}

export function stopBgm() {
	_bgmPlaying = false;
	if (_bgmTimer !== null) {
		clearTimeout(_bgmTimer);
		_bgmTimer = null;
	}
	// BGM GainNode の音量を即時0にする（AudioContext は止めない）
	if (audioContext && _bgmGain) {
		_bgmGain.gain.setValueAtTime(0, audioContext.currentTime);
	}
}

export function resumeAudio() {
	// 互換性のために残す（現在は使わないが削除しない）
	if (audioContext && audioContext.state === 'suspended') {
		audioContext.resume();
	}
}

export function playSound(kind) {
	const ctx = getAudioContext();
	const now = ctx.currentTime;
	if (kind === 'move') {
		tone(ctx, now,        360, 0.055, 'triangle', 0.045);
		tone(ctx, now + 0.025, 470, 0.05,  'triangle', 0.035);
	}
	if (kind === 'clear') {
		tone(ctx, now,        440, 0.09, 'sine', 0.055);
		tone(ctx, now + 0.08, 660, 0.11, 'sine', 0.06);
		tone(ctx, now + 0.18, 880, 0.16, 'sine', 0.055);
	}
	if (kind === 'miss') {
		tone(ctx, now,        180, 0.11, 'sawtooth', 0.045);
		tone(ctx, now + 0.08, 120, 0.14, 'sawtooth', 0.04);
	}
	if (kind === 'key') {
		tone(ctx, now,        880,  0.07, 'sine', 0.05);
		tone(ctx, now + 0.07, 1100, 0.09, 'sine', 0.06);
		tone(ctx, now + 0.14, 1320, 0.12, 'sine', 0.055);
	}
	if (kind === 'doorOpen') {
		tone(ctx, now,        440, 0.08, 'triangle', 0.05);
		tone(ctx, now + 0.06, 660, 0.1,  'triangle', 0.06);
		tone(ctx, now + 0.14, 550, 0.18, 'sine',     0.045);
	}
	if (kind === 'switch') {
		tone(ctx, now,        330, 0.06, 'square', 0.04);
		tone(ctx, now + 0.05, 500, 0.08, 'square', 0.05);
	}
	if (kind === 'gateOpen') {
		tone(ctx, now,        220, 0.1,  'sawtooth',  0.04);
		tone(ctx, now + 0.08, 330, 0.12, 'triangle',  0.05);
		tone(ctx, now + 0.18, 440, 0.14, 'sine',      0.05);
	}
	// 剣を振る「シュッ」
	if (kind === 'slash') {
		tone(ctx, now,        800, 0.04, 'sawtooth',  0.06);
		tone(ctx, now + 0.02, 500, 0.06, 'sawtooth',  0.04);
		tone(ctx, now + 0.04, 300, 0.05, 'triangle',  0.03);
	}
	// 剣が命中「ドスッ」
	if (kind === 'hit') {
		tone(ctx, now,        150, 0.06, 'sawtooth',  0.10);
		tone(ctx, now + 0.02, 100, 0.10, 'square',    0.08);
		tone(ctx, now + 0.05, 80,  0.12, 'triangle',  0.05);
	}
	if (kind === 'combat') {
		tone(ctx, now,        220, 0.06, 'sawtooth', 0.055);
		tone(ctx, now + 0.05, 160, 0.08, 'square',   0.04);
	}
	if (kind === 'levelup') {
		tone(ctx, now,        523, 0.08, 'sine', 0.055);
		tone(ctx, now + 0.07, 659, 0.08, 'sine', 0.06);
		tone(ctx, now + 0.14, 784, 0.08, 'sine', 0.06);
		tone(ctx, now + 0.21, 1047,0.14, 'sine', 0.055);
	}
	if (kind === 'chest') {
		tone(ctx, now,        660, 0.07, 'sine', 0.05);
		tone(ctx, now + 0.07, 880, 0.09, 'sine', 0.06);
	}
	if (kind === 'bgm') {
		// ── ダンジョンBGM（内部でループ再生） ──────────────────
		// playBgm() / stopBgm() を使うこと
		return;
	}
	if (kind === 'ending') {
		// ── 荘厳なファンファーレ（0〜1.8秒）─────────────────────
		// C5 → E5 → G5 → C6 の上昇ファンファーレ
		tone(ctx, now + 0.00, 523.25, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.30, 659.25, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.60, 783.99, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.90, 1046.5, 0.70, 'sine', 0.12);
		// 和音でハーモニー
		tone(ctx, now + 0.90, 659.25, 0.70, 'sine', 0.06);
		tone(ctx, now + 0.90, 783.99, 0.70, 'sine', 0.05);
		// ── 勝利のリフレイン（1.7〜4秒）──────────────────────────
		tone(ctx, now + 1.70, 523.25, 0.22, 'triangle', 0.07);
		tone(ctx, now + 1.92, 587.33, 0.22, 'triangle', 0.07);
		tone(ctx, now + 2.14, 659.25, 0.22, 'triangle', 0.07);
		tone(ctx, now + 2.36, 783.99, 0.44, 'triangle', 0.08);
		tone(ctx, now + 2.80, 698.46, 0.22, 'triangle', 0.07);
		tone(ctx, now + 3.02, 659.25, 0.22, 'triangle', 0.07);
		tone(ctx, now + 3.24, 587.33, 0.60, 'triangle', 0.08);
		// ── しっとりメロディー フレーズA（4.2〜7.4秒）────────────
		tone(ctx, now + 4.20, 392.00, 0.38, 'sine', 0.06);
		tone(ctx, now + 4.58, 440.00, 0.38, 'sine', 0.06);
		tone(ctx, now + 4.96, 493.88, 0.38, 'sine', 0.06);
		tone(ctx, now + 5.34, 523.25, 0.76, 'sine', 0.07);
		tone(ctx, now + 6.10, 493.88, 0.38, 'sine', 0.06);
		tone(ctx, now + 6.48, 440.00, 0.76, 'sine', 0.07);
		// ベース A
		tone(ctx, now + 4.20, 196.00, 0.76, 'triangle', 0.04);
		tone(ctx, now + 4.96, 220.00, 0.76, 'triangle', 0.04);
		tone(ctx, now + 5.72, 246.94, 1.14, 'triangle', 0.04);
		// ── フレーズB（7.5〜10.5秒）──────────────────────────────
		tone(ctx, now + 7.50, 349.23, 0.38, 'sine', 0.06);
		tone(ctx, now + 7.88, 392.00, 0.38, 'sine', 0.06);
		tone(ctx, now + 8.26, 440.00, 0.38, 'sine', 0.06);
		tone(ctx, now + 8.64, 523.25, 0.76, 'sine', 0.07);
		tone(ctx, now + 9.40, 493.88, 0.38, 'sine', 0.06);
		tone(ctx, now + 9.78, 440.00, 0.95, 'sine', 0.08);
		// ベース B
		tone(ctx, now + 7.50, 174.61, 0.76, 'triangle', 0.04);
		tone(ctx, now + 8.26, 196.00, 0.76, 'triangle', 0.04);
		tone(ctx, now + 9.02, 220.00, 1.14, 'triangle', 0.04);
		// ── フレーズC 高揚（11〜14.5秒）─────────────────────────
		tone(ctx, now + 11.00, 523.25, 0.32, 'sine', 0.07);
		tone(ctx, now + 11.32, 587.33, 0.32, 'sine', 0.07);
		tone(ctx, now + 11.64, 659.25, 0.32, 'sine', 0.07);
		tone(ctx, now + 11.96, 783.99, 0.76, 'sine', 0.08);
		tone(ctx, now + 12.72, 698.46, 0.38, 'sine', 0.07);
		tone(ctx, now + 13.10, 659.25, 0.38, 'sine', 0.07);
		tone(ctx, now + 13.48, 587.33, 0.95, 'sine', 0.08);
		// ハーモニー C
		tone(ctx, now + 11.00, 329.63, 0.64, 'sine', 0.04);
		tone(ctx, now + 11.64, 392.00, 0.64, 'sine', 0.04);
		tone(ctx, now + 12.28, 440.00, 1.20, 'sine', 0.04);
		// ── フレーズD しっとり解決（14.8〜21秒）─────────────────
		tone(ctx, now + 14.80, 523.25, 0.48, 'sine', 0.06);
		tone(ctx, now + 15.28, 493.88, 0.48, 'sine', 0.06);
		tone(ctx, now + 15.76, 440.00, 0.48, 'sine', 0.06);
		tone(ctx, now + 16.24, 392.00, 1.14, 'sine', 0.07);
		tone(ctx, now + 17.38, 349.23, 0.48, 'sine', 0.06);
		tone(ctx, now + 17.86, 392.00, 0.48, 'sine', 0.06);
		tone(ctx, now + 18.34, 440.00, 2.50, 'sine', 0.07);
		// ベース D
		tone(ctx, now + 14.80, 261.63, 0.96, 'triangle', 0.04);
		tone(ctx, now + 15.76, 246.94, 0.96, 'triangle', 0.04);
		tone(ctx, now + 16.72, 220.00, 0.96, 'triangle', 0.04);
		tone(ctx, now + 17.68, 196.00, 3.00, 'triangle', 0.04);
	}
}
