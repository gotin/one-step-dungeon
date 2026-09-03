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
	// 見据えの予告「ゴォン…」（Phase 8-4 (4) 0d-3・O 古森の巨人が足元に印を押した瞬間）
	// ⚠️ これは**予告の音**＝「そこを見据えられた（印から離れろ）」。岩が落ちる音（rockSmash）
	//    とは別（GUIDE §7-6）。印は床に描かれる＝画面の反対側を見ていても音で気づける必要がある。
	// ⚠️ 他の予告と**形**で切り分ける＝dashWindup（上昇する低音の段）・swordWindup（金属の
	//    擦り上げ）・maulWindup（下がる唸り）・breathWindup（吸い込む上昇）・coilWindup（2音の
	//    往復＝回っている）。∴こちらは**同時に鳴る和音**にする（他はすべて時間差の並び）＝
	//    動きを感じさせない静止した1つの塊＝「見据えられて止まった」形。
	// ★ 低音＋5度上＋2オクターブ上を同時に鳴らす（鐘のような響き）＋薄い高音の余韻。
	//   予告の窓（stampMs 1080ms／後半 720ms）より短く収める＝次の印と重ならない。
	if (kind === 'gazeMark') {
		tone(ctx, now,        58,  0.34, 'triangle', 0.075);   // 巨人の視線＝腹に響く低音
		tone(ctx, now,        87,  0.30, 'sine',     0.040);   // 5度上（同時＝和音になる）
		tone(ctx, now,        232, 0.26, 'sine',     0.022);   // 2オクターブ上の芯
		tone(ctx, now + 0.20, 464, 0.22, 'sine',     0.014);   // 余韻＝印が残っている薄い尾
	}
	// 岩の着弾「ドシャァッ」（Phase 8-4 (4) 0d-3・印の上に岩が落ちて砕けた瞬間＝結果の音）
	// ⚠️ 爆弾の爆発（bombExplosion）とは別の音＝**岩は壁を壊さない**（breakPower 0）∴
	//    同じ音だと「爆弾と同じで `!` が壊れる」と誤って学ばせる。
	// ⚠️ 締め上げ（coilCrush＝帯域の狭い低音の塊）・砂から浮上（sandBurst＝低音の一撃＋高音の
	//    速い下降）とも別にする＝こちらは**破片が不規則に散る**中音域を持つ。
	// ★ 硬い一撃（低音）→中音域の短い音を**不規則な音程で3つ**散らす→低い尾（土煙）。
	if (kind === 'rockSmash') {
		tone(ctx, now,        104, 0.05, 'square',   0.105);   // 岩が地面を叩く
		tone(ctx, now + 0.03, 70,  0.16, 'sawtooth', 0.085);
		tone(ctx, now + 0.05, 610, 0.04, 'square',   0.030);   // 破片（不規則な音程で散る）
		tone(ctx, now + 0.09, 430, 0.04, 'square',   0.026);
		tone(ctx, now + 0.14, 760, 0.03, 'square',   0.020);
		tone(ctx, now + 0.16, 48,  0.26, 'triangle', 0.055);   // 土煙の尾
	}
	// ── Phase 8-4 (4) 0d-3（6体目 U 嵐の鷲王）: 滞空と急降下の4つの音 ──────────────
	// 機構の拍が6つある（地上→舞い上がり→滞空→予告→急降下→着地）ので、**プレイヤーが
	// 判断を変える拍だけ**に音を置く（全部に置くと騒がしくて逆に読めない）：
	//   soarRise  … 舞い上がった（＝剣が届かなくなる。弓に持ち替える合図）
	//   soarDive  … 急降下の予告（＝落ちてくる軸から外れる合図）
	//   soarLand  … 着地した（＝地上に戻った＝殴り返す窓）
	//   soarCrash … 矢で射落とした（＝機構を解いた＝大きな反撃の窓）
	//   soarWhiff … 空に居る敵を近接で殴った（＝「今は無駄・弓を出せ」を手応えで教える）
	//
	// 舞い上がる「バサッ バサッ」（rise の 480ms／後半 360ms に収める）
	// ⚠️ 他の予告と**形**で切り分ける（GUIDE §6-1/§7-6）＝dashWindup（上昇する低音の段）・
	//    swordWindup（金属の擦り上げ）・maulWindup（下がる唸り）・breathWindup（吸い込む上昇）・
	//    coilWindup（2音の往復）・gazeMark（静止した和音）。∴こちらは**極短い打を等間隔に3つ**
	//    ＝羽ばたき（間の無音がリズムを作る＝他のどれも持たない形）。音程は上げる＝上へ行く。
	if (kind === 'soarRise') {
		tone(ctx, now,        150, 0.04, 'sawtooth', 0.070);   // 1打目（風を掴む）
		tone(ctx, now + 0.03, 420, 0.03, 'triangle', 0.022);   // 打の高音成分＝羽の擦れ
		tone(ctx, now + 0.14, 190, 0.04, 'sawtooth', 0.066);   // 2打目
		tone(ctx, now + 0.17, 520, 0.03, 'triangle', 0.020);
		tone(ctx, now + 0.28, 240, 0.05, 'sawtooth', 0.060);   // 3打目＝浮き上がる
		tone(ctx, now + 0.31, 640, 0.04, 'triangle', 0.018);
	}
	// 急降下の予告「ヒュウゥゥ」（aimMs 600ms／後半 480ms に収める＝最後の音の終わりが 0.42s）
	// ⚠️ 舞い上がり（soarRise＝断続した打・上昇）の**裏返し**にする＝こちらは切れ目のない
	//    **高音域の速い下降**（風切り音）。上と下がそのまま「これから来る向き」を表す。
	// ⚠️ 炎（fire）も下降するがあちらは低音の唸り（180→90Hz）＝音域で聞き分けられる。
	if (kind === 'soarDive') {
		tone(ctx, now,        1180, 0.12, 'sawtooth', 0.030);
		tone(ctx, now + 0.10, 880,  0.12, 'sawtooth', 0.034);
		tone(ctx, now + 0.20, 640,  0.12, 'sawtooth', 0.036);
		tone(ctx, now + 0.30, 440,  0.12, 'triangle', 0.038);
	}
	// 着地「ドッ…バサッ」（＝結果の音。ここから landFreezeMs の反撃の窓が開く）
	// ⚠️ 岩の着弾（rockSmash＝破片が不規則に散る中音域）・締め上げ（coilCrush＝帯域の狭い
	//    低音の塊）とは別にする＝こちらは**低音の一撃＋羽ばたきの打1つ**（短い＝すぐ動ける）。
	if (kind === 'soarLand') {
		tone(ctx, now,        112, 0.05, 'square',   0.100);   // 爪が地を打つ
		tone(ctx, now + 0.04, 76,  0.13, 'sawtooth', 0.075);
		tone(ctx, now + 0.12, 220, 0.05, 'sawtooth', 0.040);   // 翼を畳む1打
		tone(ctx, now + 0.18, 58,  0.18, 'triangle', 0.045);   // 土煙の短い尾
	}
	// 射落とした「ギャアッ ドサァ」（矢が滞空に刺さって墜落＝**機構を解いた**瞬間）
	// ⚠️ 着地（soarLand）とは別の音＝聞き分けるのは「自分で降りた（短い窓）」と
	//    「落とした（長い気絶＝大きな窓）」の2つ。∴こちらは**高音の悲鳴（下降）**を頭に置き、
	//    落下の低音を長く伸ばす（＝「大きく崩れた」＝反撃の窓の長さが音の長さで分かる）。
	// ⚠️ 気絶の絵は突進猪と同じ ⭐（showDashStun）＝**気絶の意味は1つ**に保つ。
	if (kind === 'soarCrash') {
		tone(ctx, now,        980, 0.09, 'sawtooth', 0.055);   // 悲鳴（高音から落ちる）
		tone(ctx, now + 0.08, 700, 0.09, 'sawtooth', 0.050);
		tone(ctx, now + 0.16, 460, 0.10, 'sawtooth', 0.045);
		tone(ctx, now + 0.28, 120, 0.06, 'square',   0.105);   // 地面に叩きつけられる
		tone(ctx, now + 0.32, 70,  0.30, 'sawtooth', 0.080);
		tone(ctx, now + 0.40, 46,  0.34, 'triangle', 0.060);   // 長い尾＝長い気絶
	}
	// 空を切る「スカッ」（滞空中の敵を剣/ブーメラン/爆風/炎で殴った＝0 ダメージ）
	// ⚠️ 盾の弾き（shieldBlock＝金属音）とは**別の音**にする＝あちらは「硬いものに当たった」、
	//    こちらは「**そもそも当たっていない**」＝低音成分を持たない薄い高音だけで作る。
	// ⚠️ 隠れている敵（`e.hidden`）は無音で返す（当たっていないのに当たったように見せない）が、
	//    こちらは姿が見えている∴音と 0 ダメージを返す（甲羅と同じ考え＝手応えで理由を教える）。
	if (kind === 'soarWhiff') {
		tone(ctx, now,        1500, 0.03, 'sine',     0.020);
		tone(ctx, now + 0.03, 1900, 0.04, 'triangle', 0.014);
	}
	// 転がり出した「ゴロゴロゴロ…」（Phase 8-4 (4) 0d-3・7体目 G 岩のゴーレムの慣性）
	// ⚠️ これは**予告ではなく状態の音**＝「今この岩は速い（触れたら痛い）」を告げる。速さが
	//    しきい値（heavySpeed）を越えた**瞬間に1回だけ**鳴る（毎 tick 鳴らすと轟音になる）。
	//    止まった側＝壁への激突は既存 `doorLock`（重いものが止まった音）＝聞き分けるのは
	//    「動き出した（避けろ）」と「崩れた（殴れる）」の2つ（GUIDE §7-6）。
	// ⚠️ 他の音と**形**で切り分ける（GUIDE §6-1）＝dashWindup（上昇する低音の段＝これから走る）・
	//    maulWindup（滑らかに下がる唸り）・soarRise（等間隔の3打）。∴こちらは**帯域の狭い低音を
	//    細かく震わせる**（＝転がり続けている＝始まりも終わりも無い形）。上昇も下降もさせない。
	if (kind === 'golemRumble') {
		tone(ctx, now,        58, 0.16, 'sawtooth', 0.075);
		tone(ctx, now + 0.05, 64, 0.16, 'sawtooth', 0.065);
		tone(ctx, now + 0.11, 55, 0.18, 'triangle', 0.070);
		tone(ctx, now + 0.17, 62, 0.20, 'sawtooth', 0.060);
		tone(ctx, now + 0.09, 210, 0.05, 'square',  0.018);   // 小石が跳ねる高音成分
		tone(ctx, now + 0.22, 180, 0.05, 'square',  0.016);
	}
	// ── Phase 8-4 (4) 0d-3（8体目 I 沼地の大蝦蟇）: 舌の3つの音 ────────────────────
	// 機構の拍は5つある（idle→溜め→打ち出し→掴んで引き寄せ→戻す）が、**プレイヤーが判断を
	// 変える拍だけ**に音を置く（GUIDE §7-6）：
	//   tongueCast … 溜め（＝これから舌が来る。横へ歩いて線から外れる合図）
	//   tongueGrab … 掴まれた（＝引き寄せが始まった。噛みつきの間合いに入る前に離れる合図）
	//   tongueSnap … 舌が外れた（＝空振り／限界まで離れて引き剥がした＝もう引かれない）
	//
	// 溜め「グゥゥ…（喉が膨らむ）」（castMs 600ms／後半 480ms に収める＝終わりが 0.44s）
	// ⚠️ 他の予告と**形**で切り分ける（GUIDE §6-1/§7-6）＝dashWindup（上昇する低音の段）・
	//    swordWindup（金属の擦り上げ＝上昇）・maulWindup（滑らかに下がる唸り）・breathWindup
	//    （吸い込む上昇）・coilWindup（2音の往復）・gazeMark（同時に鳴る和音）・soarRise
	//    （等間隔の3打）・golemRumble（狭い低音の細かい震え）。∴こちらは**音程を一切動かさず
	//    音量だけを膨らませる**＝他のどれも持たない形（息を溜めて喉が膨らんでいく）。
	// ★ 絵（`.tongue-windup` の一方向に膨らんで止まる拡大）と同じ「膨らむ」を音で重ねる。
	if (kind === 'tongueCast') {
		tone(ctx, now,        174, 0.12, 'sine',     0.022);
		tone(ctx, now + 0.11, 174, 0.12, 'sine',     0.036);
		tone(ctx, now + 0.22, 174, 0.12, 'triangle', 0.050);
		tone(ctx, now + 0.33, 174, 0.11, 'triangle', 0.062);
	}
	// 掴まれた「ヌチャッ」（＝結果の音。ここから引き寄せの窓が開く）
	// ⚠️ **打撃音にしない**＝舌はダメージを与えない（掴むだけ）∴低音の一撃を持たせると
	//    「殴られた」と誤って学ばせる。締め上げ（coilCrush＝低音の塊）・岩の着弾（rockSmash＝
	//    破片が散る）・着地（soarLand＝低音の一撃＋羽ばたき）とはここで分かれる。
	// ★ 中音域の短い2音＋**粘る尾**（少し長い triangle）＝湿ったものが吸い付いた形。
	if (kind === 'tongueGrab') {
		tone(ctx, now,        320, 0.05, 'sine',     0.048);
		tone(ctx, now + 0.05, 384, 0.07, 'triangle', 0.042);
		tone(ctx, now + 0.11, 296, 0.14, 'triangle', 0.030);   // 粘って離れない尾
	}
	// 舌が外れた「ビュンッ」（空振り／限界まで離れて引き剥がした＝**もう引かれない**の合図）
	// ⚠️ 掴んだ音（tongueGrab＝中音域の粘る2音）の**裏返し**＝こちらは切れ目のない速い上昇＝
	//    ゴムのように縮んで戻る形。聞き分けるのは「掴まれた（抗う）」と「切れた（自由）」の2つ。
	// ⚠️ 空振り（soarWhiff＝1500/1900Hz の薄い高音だけ）とは**音域**で分ける＝こちらは
	//    中音域から立ち上がる sawtooth（あちらは「当たっていない」、こちらは「離れた」）。
	// ⚠️ 急降下の予告（soarDive＝高音の速い**下降**）と向きが逆＝上下がそのまま意味の差。
	if (kind === 'tongueSnap') {
		tone(ctx, now,        480,  0.04, 'sawtooth', 0.038);
		tone(ctx, now + 0.04, 720,  0.04, 'sawtooth', 0.030);
		tone(ctx, now + 0.08, 1000, 0.05, 'triangle', 0.022);
	}
	// ── 2026-09-01（8体目 I）: のしかかりの2つの音 ──────────────────────────────
	// のしかかりは**盾では防げない打点**∴音の役目は「向きを変えろ」ではなく「下がれ」。
	//   toadPounce … 沈んで跳んだ（＝床の範囲から出る合図。ここから 840ms の猶予）
	//   toadLand   … 落ちた（＝当たり判定が出た瞬間＝硬直＝殴り返す窓の始まり）
	//
	// 溜め「グッ…ドゥン（沈んで跳ぶ）」（pounceWindupMs 480ms／後半 360ms に収める）
	// ⚠️ 他の予告と**形**で切り分ける（GUIDE §6-1/§7-6）＝tongueCast（音程を動かさず音量だけ
	//    膨らむ）・maulWindup（下がりながら**減衰する**唸り）・dashWindup（上昇する低音の段）・
	//    coilWindup（2音の往復）。∴こちらは**下降しながら音量が増す**＝重い体が沈み込む形。
	// ★ 最後に短い高音を1つ載せる＝**跳び上がった**合図（他のどの予告も終わりに高音を持たない
	//    ＝「まだ溜めている」と「もう空中に居る」が耳だけで分かれる）。
	if (kind === 'toadPounce') {
		tone(ctx, now,        196, 0.10, 'sawtooth', 0.030);
		tone(ctx, now + 0.10, 147, 0.11, 'sawtooth', 0.046);
		tone(ctx, now + 0.21, 110, 0.13, 'triangle', 0.062);
		tone(ctx, now + 0.34, 660, 0.05, 'square',   0.026);   // 跳び上がった
	}
	// 着地「ドスンッ（泥が跳ねる）」（＝結果の音・当たり判定と同じ tick）
	// ⚠️ 低音の一撃を持つ他の着地音と**尾の音域**で分ける＝soarLand（羽ばたき＝高音の反復）・
	//    coilCrush（低音の塊だけ）・rockSmash（破片が散る高音）。∴こちらは低音の一撃 ＋
	//    **中音域の粘る尾**（＝泥沼に落ちた形）＝I の他の音（tongueGrab の粘り）と地続きにする。
	if (kind === 'toadLand') {
		tone(ctx, now,        82,  0.16, 'sawtooth', 0.088);
		tone(ctx, now + 0.03, 116, 0.13, 'square',   0.052);
		tone(ctx, now + 0.09, 262, 0.16, 'triangle', 0.034);   // 泥が粘る尾
		tone(ctx, now + 0.16, 208, 0.18, 'triangle', 0.026);
	}
	// ── 2026-09-01（9体目 { 海の主）: 打ち寄せの2つの音 ──────────────────────────
	// 掃過は**盾では防げない打点**∴音の役目は「向きを変えろ」ではなく「横へ退け」。
	//   seaSurge … 水を集めて陸へ乗り上げる溜め（＝床の帯から出る合図。ここから 600ms の猶予）
	//   seaCrash … 波が覆い被さった瞬間（＝当たり判定が出た tick）
	//
	// 溜め「ズズ…ザアッ（水位が上がる）」（windupMs 600ms に収める＝絵と同じ長さ）
	// ⚠️ 他の予告と**形**で切り分ける（GUIDE §6-1/§7-6）＝toadPounce（**下降**しながら
	//    音量が増す）・tongueCast（音程を動かさず音量だけ膨らむ）・dashWindup（上昇する
	//    低音の段）・coilWindup（2音の往復）。∴こちらは**低音から中音へ滑らかに上がりながら
	//    音量も増す**＝水が持ち上がる形（＝上がりきった所で波が来る、が耳で分かる）。
	// ★ 上昇の各段を長めに重ねて切れ目を作らない＝「段」に聞こえる dashWindup と別物にする。
	if (kind === 'seaSurge') {
		tone(ctx, now,        98,  0.20, 'sine',     0.030);
		tone(ctx, now + 0.14, 131, 0.20, 'sine',     0.042);
		tone(ctx, now + 0.28, 165, 0.20, 'triangle', 0.054);
		tone(ctx, now + 0.42, 208, 0.18, 'triangle', 0.064);
	}
	// 掃過「ドシャアッ（水が砕けて散る）」（＝結果の音・当たり判定と同じ tick）
	// ⚠️ 低音の一撃を持つ他の着地音と**尾の音域**で分ける＝toadLand（泥＝中音域の粘る尾）・
	//    coilCrush（低音の塊だけ）・soarLand（羽ばたき＝高音の反復）・rockSmash（破片）。
	//    ∴こちらは低音の一撃 ＋ **高音へ散って消える尾**（＝水しぶきが飛ぶ形）。
	if (kind === 'seaCrash') {
		tone(ctx, now,        87,  0.14, 'sawtooth', 0.086);
		tone(ctx, now + 0.03, 175, 0.10, 'square',   0.048);
		tone(ctx, now + 0.08, 587, 0.09, 'triangle', 0.030);   // しぶきが散る
		tone(ctx, now + 0.14, 880, 0.12, 'sine',     0.022);
	}
	// ── 2026-09-02（10体目 L 氷のリヴァイアサン）: 氷結の2音 ────────────────────
	//   iceFreeze … 足を止めて道を敷いた瞬間（＝**剣を入れられる窓**が開いた合図）
	//   iceSpike  … 氷柱が噴き上がった瞬間（＝盾を無視する打点が出た tick）
	//
	// 道を敷く「パキパキ…」（freezeMs 700ms／後半 520ms に収める＝絵と同じ長さ）
	// ⚠️ 他の予告と**形**で切り分ける（GUIDE §6-1/§7-6）＝seaSurge（低音から中音へ滑らかに
	//    上がる）・tongueCast（音程を動かさず音量が膨らむ）・dashWindup（上昇する低音の段）・
	//    coilWindup（2音の往復）・gazeMark（静止した和音）・soarRise（等間隔の3打）。
	//    ∴こちらは**間隔がだんだん詰まる短い高音**＋**下がる音程**＝霜が広がって固まる形
	//    （加速する打は他のどれも持たない＝耳だけで「凍らせている」と分かる）。
	if (kind === 'iceFreeze') {
		tone(ctx, now,        1568, 0.03, 'triangle', 0.030);
		tone(ctx, now + 0.16, 1319, 0.03, 'triangle', 0.032);
		tone(ctx, now + 0.28, 1109, 0.03, 'triangle', 0.034);
		tone(ctx, now + 0.37, 988,  0.03, 'triangle', 0.036);
		tone(ctx, now + 0.43, 831,  0.04, 'triangle', 0.038);
		tone(ctx, now + 0.47, 698,  0.05, 'sine',     0.040);   // 固まった（＝道が出来た）
	}
	// 氷柱「シャキィン」（＝結果の音・当たり判定と同じ tick）
	// ⚠️ 他の結果の音は**すべて低音の一撃を持つ**（seaCrash・rockSmash・coilCrush・toadLand・
	//    soarLand）。∴こちらは**低音を一切持たず高音域だけが下から上へ**駆け上がる＝絵
	//    （`.enemy-frost-spike` が床から突き上がる）と向きが揃う唯一の音。
	if (kind === 'iceSpike') {
		tone(ctx, now,        784,  0.05, 'triangle', 0.050);
		tone(ctx, now + 0.03, 1245, 0.05, 'square',   0.030);
		tone(ctx, now + 0.06, 1661, 0.06, 'triangle', 0.034);
		tone(ctx, now + 0.10, 2093, 0.10, 'sine',     0.026);   // 刃先が鳴る尾
	}
	// ── 2026-09-02（11体目 X 魔王）: 詔（みことのり）の3音 ─────────────────────
	//   decreeCast … 器が満ちて唱え始めた瞬間（＝**錨で止まった＝剣を入れられる窓**の合図。
	//                ただし円の中に留まれば落ちる∴「殴るか退くか」の二択が始まる音）
	//   decreeHit  … 円の中に居た＝盾を無視する打点が入った tick（剣も封じられる）
	//   decreeMiss … 円の外へ歩き切った＝空振り（＝`rootMs` の硬直が開く合図）
	//
	// 唱え始め「ゴォ…ン」（warnMs 1200ms に収める＝床の円の絵と同じ長さ）
	// ⚠️ 他の予告と**形**で切り分ける（GUIDE §6-1/§7-6）＝iceFreeze（間隔が詰まる高音）・
	//    seaSurge（低音から中音へ滑らかに上がる）・tongueCast（音量が膨らむ）・
	//    dashWindup（上昇する低音の段）・coilWindup（2音の往復）・gazeMark（静止した和音）・
	//    soarRise（等間隔の3打）。∴こちらは**低音の鐘が等間隔で3つ鳴り、最後だけ半音下がる**
	//    ＝鐘（減衰の長い低音の連打）は他のどれも持たない＝耳だけで「詔」と分かる。
	if (kind === 'decreeCast') {
		tone(ctx, now,        110, 0.30, 'sine',     0.055);
		tone(ctx, now,        165, 0.18, 'triangle', 0.024);   // 鐘の倍音
		tone(ctx, now + 0.40, 110, 0.30, 'sine',     0.050);
		tone(ctx, now + 0.80, 104, 0.34, 'sine',     0.048);   // 最後だけ半音下がる＝落ちる直前
	}
	// 詔が落ちた（＝結果の音・当たり判定と同じ tick）。低音の一撃＋不協和な高音＝
	// 「盾では消えない」を耳で知らせる（iceSpike は低音を持たない・こちらは持つ＝別の形）。
	if (kind === 'decreeHit') {
		tone(ctx, now,        82,  0.22, 'sawtooth', 0.070);
		tone(ctx, now + 0.02, 233, 0.16, 'square',   0.034);
		tone(ctx, now + 0.06, 311, 0.20, 'triangle', 0.030);   // 増4度＝濁った響き
	}
	// 空振り（＝避けた・`rootMs` の硬直が開く）。**下がって消える**＝結果の音の中で唯一
	// 打点を持たない形（rockSmash/coilCrush/toadLand と混ざらない）。
	if (kind === 'decreeMiss') {
		tone(ctx, now,        294, 0.10, 'triangle', 0.030);
		tone(ctx, now + 0.08, 220, 0.14, 'sine',     0.026);
		tone(ctx, now + 0.18, 147, 0.20, 'sine',     0.020);
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
