// 開発サーバ（`npm run dev`＝`vite ../`／リポジトリ直下の `npx vite outputs`）の設定。
// vite はサーバルート（＝この outputs/）の設定ファイルを読む∴どちらの起動方法でも効く。
// 本番（vercel）は outputs/ をそのまま静的配信するだけ＝このファイルは使われない。
import { fileURLToPath } from 'node:url';
import { playtestNotesPlugin } from './blade-of-lumia/scripts/vite-playtest-notes.mjs';

export default {
	plugins: [
		// Blade of Lumia のプレイメモ（実行キュー57）＝プレビューで書いたメモを work/ へ書く
		playtestNotesPlugin({
			file: fileURLToPath(new URL('./blade-of-lumia/work/playtest-notes.json', import.meta.url)),
		}),
	],
};
