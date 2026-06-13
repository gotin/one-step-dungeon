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
	// 盾ブロック「カーン」
	if (kind === 'shieldBlock') {
		tone(ctx, now,        1200, 0.01, 'square',   0.12);
		tone(ctx, now + 0.01, 900,  0.04, 'triangle', 0.10);
		tone(ctx, now + 0.04, 1400, 0.02, 'square',   0.07);
		tone(ctx, now + 0.06, 700,  0.10, 'sine',     0.06);
	}
	// エンディング（Dungeon World 継承）
	if (kind === 'ending') {
		tone(ctx, now + 0.00, 523.25, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.30, 659.25, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.60, 783.99, 0.30, 'sine', 0.10);
		tone(ctx, now + 0.90, 1046.5, 0.70, 'sine', 0.12);
		tone(ctx, now + 0.90, 659.25, 0.70, 'sine', 0.06);
		tone(ctx, now + 0.90, 783.99, 0.70, 'sine', 0.05);
	}
}
