// play-time.js — プレイ時間（クリアタイム）の純粋関数（実行キュー65・2026-10-14）
//
// 計るのは「遊んでいた時間だけ」（ユーザー決定）＝ゲームの世界が進んでいる時間。
// 足すのは game.js step() の `gameTime += TICK_MS` と同じ所（ポーズ・会話・遷移・
// ゲームオーバーの間は step が早期 return する∴数えない）。値は `player.playMs`
// としてセーブに乗る。自己ベストは周回をまたいで残すので別キー（BEST_TIME_KEY）。

// セーブ由来の値を 0 以上の整数ミリ秒にそろえる。導入前のセーブ（undefined）や
// 壊れた値（文字列・負・NaN）は 0。
export function sanitizePlayMs(v) {
	const n = Math.floor(Number(v));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// ms → "h:mm:ss"（時間は桁を切らない＝100時間でも "100:00:00"）。
export function formatPlayTime(ms) {
	const total = Math.floor(sanitizePlayMs(ms) / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// クリアタイムを自己ベストと比べ、短ければ書き換える。
// 戻り値 { ms, best, isNewBest }＝best は比べた後の自己ベスト。
// 初クリア（ベスト未記録）も isNewBest＝true（比べる相手がいない＝記録として残す）。
export function recordClearTime(ms, storage, key) {
	const clear = sanitizePlayMs(ms);
	let prev = null;
	try {
		const raw = storage.getItem(key);
		if (raw != null) {
			const n = sanitizePlayMs(raw);
			if (n > 0) prev = n;
		}
	} catch { /* 読めなければ未記録扱い */ }
	const isNewBest = prev == null || clear < prev;
	const best = isNewBest ? clear : prev;
	if (isNewBest) {
		try { storage.setItem(key, String(clear)); } catch { /* 書けなくても表示は出す */ }
	}
	return { ms: clear, best, isNewBest };
}
