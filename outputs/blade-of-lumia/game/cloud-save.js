// ── ログインしてセーブを預ける（キュー117・2026-11-23）──────────────────────────────
// サイト（smallisle.works）の API にセーブを預け、別のブラウザでも続けられるようにする。
// 設計は PLAN.md キュー117「設計」。要点：
//  - 送るのは進み具合の4キーだけ（CLOUD_KEYS）。音の設定・ポーズのタブ・プレイメモ・マップの控えは端末ごと。
//  - 手元の localStorage は今までどおり作業用の写し。保存の時機（saveGame を呼ぶ所）は変えない。
//    ここは数秒ごとに4キーを見て、前に送ったものと違えば送る＝書く口（saveGame・クリアの印・引き継ぎ・
//    自己ベスト・はじめから）を1つずつ直さなくても、どの口の書き込みも漏れない。
//  - 起動時、ログイン中なら claim（この画面を「書ける画面」にする）→ ログイン先にセーブがあれば
//    手元の4キーを上書き（ログイン先を優先＝ユーザー決定）・無ければ手元を上げる。
//  - 後から別の画面が開かれると、この画面の保存は 409 になる → onTakenOver（ゲームを止めて知らせる）。
//  - API に届かない（開発用の vite サーバは /api を HTML で返す・通信が切れた）ときは黙って手元だけで遊ぶ。
import { SAVE_KEY, CLEARED_KEY, BEST_TIME_KEY } from './constants.js';
import { CARRY_KEY } from './carry-over.js';

export const CLOUD_KEYS = [SAVE_KEY, CLEARED_KEY, CARRY_KEY, BEST_TIME_KEY];
const API = '/api/game/blade-of-lumia';
/** 手元の変化を見に行く間隔。保存は部屋の出入りなどで起きる＝数秒遅れても困らない */
export const CLOUD_PUSH_INTERVAL_MS = 3000;
/** タブを閉じるときの keepalive の fetch は本文が 64KB まで＝それより大きいと送らない（直前の数秒を諦める） */
const KEEPALIVE_MAX_CHARS = 60_000;

/** ポーズからログインしたとき（キュー118）＝戻ってきたら、ログイン先のセーブを読まずに手元を上げる印。
 *  タブの中だけで生きればよい（Google の画面へ移って戻るまで）∴ sessionStorage。 */
const UPLOAD_LOCAL_FLAG = 'blade-of-lumia-login-upload-local';

const state = {
	available: false,   // サイトの API に届くか（届かなければ今までどおり手元だけ）
	user: null,         // { name, email } ログイン中の人
	token: null,        // claim でもらった「書ける画面」の印
	lastSent: null,     // 最後に送った（または受け取った）4キーの JSON
	stopped: false,     // 別の画面に取られた／ログアウトした＝もう送らない
	timer: null,
	onTakenOver: null,
};

function readLocal() {
	const data = {};
	for (const k of CLOUD_KEYS) {
		try { data[k] = localStorage.getItem(k); } catch { data[k] = null; }
	}
	return data;
}

function writeLocal(data) {
	for (const k of CLOUD_KEYS) {
		const v = data?.[k];
		try {
			if (typeof v === 'string') localStorage.setItem(k, v);
			else localStorage.removeItem(k);
		} catch { /* 書けなくても続ける */ }
	}
}

const hasAnyLocal = (data) => CLOUD_KEYS.some((k) => typeof data[k] === 'string');

async function fetchJson(url, init) {
	const res = await fetch(url, { credentials: 'same-origin', ...init });
	const type = res.headers.get('content-type') ?? '';
	const body = type.includes('application/json') ? await res.json().catch(() => null) : null;
	return { res, isJson: type.includes('application/json'), body };
}

/**
 * 起動時に1回呼ぶ（loadGame の前）。ログイン中なら claim して、ログイン先のセーブを手元に写す。
 * @param {{ onTakenOver: () => void }} opts
 * @returns {Promise<{ available: boolean, user: {name: string, email: string} | null }>}
 */
export async function initCloudSave({ onTakenOver } = {}) {
	state.onTakenOver = onTakenOver ?? null;
	try {
		const { res, isJson, body } = await fetchJson('/api/auth/get-session/');
		if (!res.ok || !isJson) return getCloudStatus();
		state.available = true;
		if (!body?.user) return getCloudStatus();
		const claim = await fetchJson(`${API}/claim/`, { method: 'POST' });
		if (!claim.res.ok || !claim.body?.token) return getCloudStatus();
		state.user = { name: body.user.name ?? '', email: body.user.email ?? '' };
		state.token = claim.body.token;
		let uploadLocal = false;
		try {
			uploadLocal = sessionStorage.getItem(UPLOAD_LOCAL_FLAG) === '1';
			sessionStorage.removeItem(UPLOAD_LOCAL_FLAG);
		} catch { /* 読めなければ今までどおり */ }
		if (claim.body.data && !uploadLocal) {
			writeLocal(claim.body.data);
			state.lastSent = JSON.stringify(readLocal());
		} else {
			// ログイン先にまだ無い＝手元を上げる（初めてログインしたブラウザ）。手元も空なら送らない。
			// ポーズからログインした（uploadLocal）ときも、押した瞬間に保存した手元を上げる＝ログイン先は上書き（キュー118）
			const local = readLocal();
			state.lastSent = hasAnyLocal(local) ? null : JSON.stringify(local);
			await pushIfChanged();
		}
		state.timer = setInterval(() => { pushIfChanged(); }, CLOUD_PUSH_INTERVAL_MS);
		window.addEventListener('pagehide', pushOnPageHide);
	} catch (e) {
		console.warn('[cloud-save] init failed:', e);
	}
	return getCloudStatus();
}

export function getCloudStatus() {
	return { available: state.available, user: state.user, stopped: state.stopped };
}

function stop() {
	state.stopped = true;
	if (state.timer) { clearInterval(state.timer); state.timer = null; }
	window.removeEventListener('pagehide', pushOnPageHide);
}

let pushing = null;
/** 手元の4キーが前に送ったものと違えば送る。送っている途中ならそれを待つ（二重に送らない） */
export async function pushIfChanged() {
	if (pushing) return pushing;
	if (!state.token || state.stopped) return;
	const data = readLocal();
	const json = JSON.stringify(data);
	if (json === state.lastSent) return;
	pushing = (async () => {
		try {
			const { res } = await fetchJson(`${API}/save/`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: state.token, data }),
			});
			if (res.ok) { state.lastSent = json; return; }
			if (res.status === 409) {
				stop();
				state.onTakenOver?.();
				return;
			}
			if (res.status === 401) { stop(); return; }   // 別の所でログアウトした＝黙って手元だけに戻る
			// それ以外（通信・サーバの一時的な失敗）は次の回に送り直す
		} catch (e) {
			console.warn('[cloud-save] push failed:', e);
		} finally {
			pushing = null;
		}
	})();
	return pushing;
}

function pushOnPageHide() {
	if (!state.token || state.stopped) return;
	const data = readLocal();
	const json = JSON.stringify(data);
	if (json === state.lastSent) return;
	const body = JSON.stringify({ token: state.token, data });
	if (body.length > KEEPALIVE_MAX_CHARS) return;
	try {
		fetch(`${API}/save/`, {
			method: 'PUT', keepalive: true, credentials: 'same-origin',
			headers: { 'content-type': 'application/json' }, body,
		});
	} catch { /* 閉じる途中＝何もできない */ }
}

/**
 * Google でログインする（Google の画面へ移り、終わるとこの画面に戻ってくる）。
 * @param {{ uploadLocal?: boolean }} [opts] uploadLocal＝戻ったらログイン先のセーブを読まずに手元を上げる（ポーズから・キュー118）
 */
export async function signInWithGoogle({ uploadLocal = false } = {}) {
	try {
		if (uploadLocal) sessionStorage.setItem(UPLOAD_LOCAL_FLAG, '1');
		else sessionStorage.removeItem(UPLOAD_LOCAL_FLAG);
	} catch { /* 書けなければ今までどおり（ログイン先を優先） */ }
	const { body } = await fetchJson('/api/auth/sign-in/social/', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ provider: 'google', callbackURL: location.pathname + location.search }),
	});
	if (body?.url) location.href = body.url;
	else throw new Error('ログインを始められなかった');
}

/** ログアウト：手元の変化を送りきってから。手元のセーブは残る */
export async function signOut() {
	await pushIfChanged();
	stop();
	await fetchJson('/api/auth/sign-out/', {
		method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
	});
	location.reload();
}

/** 退会：ログイン先のセーブとアカウントを消す。手元のセーブは残る */
export async function deleteCloudAccount() {
	stop();
	const { res } = await fetchJson('/api/game/account/', { method: 'DELETE' });
	if (!res.ok) throw new Error(`退会できなかった（${res.status}）`);
	location.reload();
}
