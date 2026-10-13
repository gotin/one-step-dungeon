// ── プレイメモの受け口（実行キュー57）──────────────────────────────
// プレビュー（`fromEditor=1`）で遊びながら書いたメモを `work/playtest-notes.json` へ書く
// vite 開発サーバのミドルウェア。読むのは Claude（ファイルを開いて直す）。
//
// なぜサーバで書くか＝ブラウザの File System Access は**ページを開くたびに**フォルダを
// 選び直させる（エディタのプレビューは毎回 iframe を作り直す＝メモ1件ごとに選ぶ羽目になる）。
// 開発サーバは手元のファイルを直接書ける∴メモは書いた瞬間にファイルへ届く。
//
// 口は1つ（`/__playtest-notes`）：
//   GET              → メモの配列
//   POST {notes:[…]} → 末尾に足す（id・createdAt はサーバが振る）→ { count, ids }
//   DELETE ?id=…     → その1件を消す → { count }
// ⚠️ 開発サーバでしか動かない（本番＝vercel の静的配信には無い）。ゲーム側は失敗したら
//    localStorage に控えを残し、次に書けたときにまとめて送る（game/playtest-notes.js）。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const NOTES_ENDPOINT = '/__playtest-notes';

export function readNotes(file) {
	if (!existsSync(file)) return [];
	try {
		const arr = JSON.parse(readFileSync(file, 'utf8'));
		return Array.isArray(arr) ? arr : [];
	} catch {
		// 壊れたファイルを黙って空として上書きしない＝呼び出し側で止める
		throw new Error(`${file} が JSON として読めません（手で直してから書き足してください）`);
	}
}

function writeNotes(file, notes) {
	writeFileSync(file, JSON.stringify(notes, null, 2) + '\n');
}

/** 受け取ったメモを形を揃えて足す。本文が空のものは捨てる。 */
export function appendNotes(file, incoming) {
	const notes = readNotes(file);
	const ids = [];
	for (const n of incoming) {
		const text = String(n?.text ?? '').trim();
		if (!text) continue;
		const id = randomUUID();
		notes.push({
			id,
			createdAt: typeof n.createdAt === 'string' ? n.createdAt : new Date().toISOString(),
			layer: n.layer ?? null,
			stage: n.stage ?? null,
			row: Number.isFinite(n.row) ? n.row : null,
			col: Number.isFinite(n.col) ? n.col : null,
			text,
			// 再現用＝プレビュー設定（ps_ で始まる URL パラメータ）をそのまま残す
			preview: typeof n.preview === 'string' ? n.preview : '',
		});
		ids.push(id);
	}
	if (ids.length) writeNotes(file, notes);
	return { count: notes.length, ids };
}

export function deleteNote(file, id) {
	const notes = readNotes(file);
	const rest = notes.filter((n) => n.id !== id);
	if (rest.length !== notes.length) writeNotes(file, rest);
	return { count: rest.length };
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (c) => { body += c; });
		req.on('end', () => resolve(body));
		req.on('error', reject);
	});
}

function send(res, status, obj) {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.end(JSON.stringify(obj));
}

/** vite プラグイン。`file` は書き込み先の絶対パス。 */
export function playtestNotesPlugin({ file }) {
	return {
		name: 'blade-of-lumia-playtest-notes',
		config() {
			// 書くたびに vite がファイル変更として拾わないようにする（念のため）
			return { server: { watch: { ignored: [file] } } };
		},
		configureServer(server) {
			server.middlewares.use(NOTES_ENDPOINT, async (req, res) => {
				try {
					if (req.method === 'GET') return send(res, 200, readNotes(file));
					if (req.method === 'POST') {
						const data = JSON.parse((await readBody(req)) || '{}');
						const incoming = Array.isArray(data.notes) ? data.notes : [];
						return send(res, 200, appendNotes(file, incoming));
					}
					if (req.method === 'DELETE') {
						const id = new URL(req.url, 'http://x').searchParams.get('id');
						if (!id) return send(res, 400, { error: 'id がありません' });
						return send(res, 200, deleteNote(file, id));
					}
					return send(res, 405, { error: 'method not allowed' });
				} catch (e) {
					return send(res, 500, { error: String(e?.message ?? e) });
				}
			});
		},
	};
}
