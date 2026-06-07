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
