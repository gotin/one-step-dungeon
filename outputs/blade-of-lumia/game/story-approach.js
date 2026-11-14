// game/story-approach.js ── 向こうから歩いてきて話しかける人（実行キュー103）
//
// `npcData` に `approach: true` を持つ人が今そこに居て（`shared/story-events.js npcPresent`）、
// まだ話しかけに来ていなければ、勇者の隣まで歩いてきて会話を始める。読み終えたら元の場所へ
// 戻っていき、その時点で居なくなる人（`hideWhen` が成り立った＝例：知らせを伝え終えた使い）は
// 歩きながら消える。
//
// 起こす時＝ゲームの tick の頭（`gameTick`）。画面に入った直後・ボスを倒した直後・出来事を記した直後の
// どれも、ループが回り出した最初の tick でここに来る∴入口を1つにした（呼び忘れる口を作らない）。
//
// ⚠️ 歩く絵は見た目だけ＝人のデータ上の位置（`npcData` のセル）は動かない。通行・会話の判定は
//    元のセルのまま。歩いているあいだは世界を止め（ループ停止）、入力も飲む（`isBusy` を
//    input の `getIsCutscene` に足す）∴見た目と判定のズレを遊び手が突けない。
// ⚠️ 歩く絵は char-layer に置く＝`renderBoard()` が char-layer を作り直すと消える
//    （[[blade-renderboard-pairs-renderchars]]）。戻り道で消えても困らない（元のセルの絵は
//    renderBoard が状態から描き直す）∴戻り道の各歩で `isConnected` を見て黙って終える。

import { pendingApproach, approachId, npcPresent } from '../shared/story-events.js';
import { npcSpriteOf, NPC_SPRITE_MAP } from '../shared/npcs.js';
import { makeSprite } from '../shared/sprites.js';
import { putCellSprite } from './render-board.js';

/** 1マス歩く時間（ms）。駆け寄ってくる速さ＝勇者の歩き（半マス×tick）より少し速く見える程度。 */
export const APPROACH_STEP_MS = 170;
/** 気づいて「！」を出してから歩き出すまで（ms）。 */
export const APPROACH_NOTICE_MS = 450;

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * @param {object} deps
 * @param {()=>object} deps.getPlayer
 * @param {()=>object} deps.getStageData
 * @param {()=>string} deps.getCurrentLayer
 * @param {()=>string} deps.getStageKey
 * @param {()=>HTMLElement|null} deps.getCharLayerEl
 * @param {()=>number} deps.getCellPx
 * @param {(r:number,c:number)=>boolean} deps.tilePassable
 * @param {(y:number)=>number} deps.toTileRow
 * @param {(x:number)=>number} deps.toTileCol
 * @param {(r:number,c:number,tile:string,onClose:Function)=>void} deps.startDialog
 * @param {()=>void} deps.stopGameLoop
 * @param {()=>void} deps.startGameLoop
 * @param {()=>void} deps.cancelCharge
 * @param {(dir:string)=>void} deps.faceHero
 * @param {()=>void} deps.saveGame
 * @param {()=>void} deps.refreshUnreadMarks
 */
export function createStoryApproach(deps) {
	let busy = false;

	const isNpcTile = (t) => !!(t && NPC_SPRITE_MAP[t]);

	// 元のセルに描かれている人の絵（render-board が `char-sprite` で置く）
	function homeCanvas(r, c) {
		return document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"] > canvas.char-sprite`);
	}
	// 元のセル（人が出歩いている間は `story-away`＝人の絵と未読の吹き出しを隠す・CSS は board.css）。
	// 吹き出しは refreshUnreadMarks が状態から付け直す∴個々の要素ではなくセルの印で隠す。
	function homeCell(r, c) {
		return document.querySelector(`#board .cell[data-row="${r}"][data-col="${c}"]`);
	}

	// 人のセルから「勇者の隣（上下左右）」までの最短の道（両端を含む）。人の元のセルは通れない
	// 扱い（FOOT_SOLID）なので出発点だけ特別に許す。道が無ければ null（その場で話す）。
	function findPath(from, playerCell) {
		const sd = deps.getStageData();
		const goal = (r, c) => Math.abs(r - playerCell.r) + Math.abs(c - playerCell.c) === 1;
		if (goal(from.r, from.c)) return [from];
		const key = (r, c) => `${r},${c}`;
		const prev = new Map([[key(from.r, from.c), null]]);
		const q = [from];
		while (q.length) {
			const cur = q.shift();
			for (const [dr, dc] of DIRS) {
				const r = cur.r + dr, c = cur.c + dc;
				if (r < 0 || c < 0 || r >= sd.rows || c >= sd.cols) continue;
				if (r === playerCell.r && c === playerCell.c) continue;
				const k = key(r, c);
				if (prev.has(k)) continue;
				if (!deps.tilePassable(r, c)) continue;
				prev.set(k, cur);
				const next = { r, c };
				if (goal(r, c)) {
					const path = [next];
					for (let p = cur; p; p = prev.get(key(p.r, p.c))) path.unshift(p);
					return path;
				}
				q.push(next);
			}
		}
		return null;
	}

	function placeWalker(el, cell, cellPx) {
		el.style.left = `${cell.c * cellPx}px`;
		el.style.top  = `${cell.r * cellPx}px`;
	}

	function makeWalker(sd, posKey, tile, at) {
		const layer = deps.getCharLayerEl();
		if (!layer) return null;
		const meta = npcSpriteOf(sd, posKey, tile);
		const cellPx = deps.getCellPx();
		const el = document.createElement('div');
		el.className = 'story-walker';
		el.dataset.npc = posKey;
		el.style.width  = `${cellPx}px`;
		el.style.height = `${cellPx}px`;
		el.style.transition = `left ${APPROACH_STEP_MS}ms linear, top ${APPROACH_STEP_MS}ms linear, opacity ${APPROACH_STEP_MS * 3}ms linear`;
		placeWalker(el, at, cellPx);
		// 元のセルの絵と同じ当て方（putCellSprite＝32 ドットの絵は dot32）＝歩き出しても大きさが変わらない
		const cv = meta ? makeSprite(meta.sprite, meta.pal, true) : null;
		putCellSprite(el, cv, 'char-sprite')?.classList.add('story-walker-body');
		layer.appendChild(el);
		return el;
	}

	const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

	async function walk(el, path) {
		const cellPx = deps.getCellPx();
		for (let i = 1; i < path.length; i++) {
			if (!el.isConnected) return;
			placeWalker(el, path[i], cellPx);
			await sleep(APPROACH_STEP_MS);
		}
	}

	function dirFromTo(a, b) {
		if (b.r < a.r) return 'up';
		if (b.r > a.r) return 'down';
		if (b.c < a.c) return 'left';
		return 'right';
	}

	async function run(found) {
		const sd = deps.getStageData();
		const layer = deps.getCurrentLayer();
		const stage = deps.getStageKey();
		const player = deps.getPlayer();
		const { r, c, posKey, entry } = found;
		const tile = sd.tiles[r][c];
		const home = { r, c };

		// 来たことを先に記す＝演出の途中で画面を出ても（入力は飲んでいるので出られないが）二度来ない。
		if (!Array.isArray(player.approachedNpcs)) player.approachedNpcs = [];
		player.approachedNpcs.push(approachId(layer, stage, posKey));

		const playerCell = { r: deps.toTileRow(player.y), c: deps.toTileCol(player.x) };
		const path = findPath(home, playerCell) ?? [home];

		const homeCv = homeCanvas(r, c);
		const walker = makeWalker(sd, posKey, tile, home);
		if (walker) {
			homeCell(r, c)?.classList.add('story-away');
			const bubble = makeSprite('markBubble', 'markBubble', false);
			// 未読の吹き出しと同じ絵・同じ置き方（`.mark-bubble`）＝「この人が何か言いたい」の合図を1つにする
			if (bubble) { bubble.className = 'mark-bubble story-walker-notice'; walker.appendChild(bubble); }
			await sleep(APPROACH_NOTICE_MS);
			bubble?.remove();
			walker.classList.add('walking');
			await walk(walker, path);
			walker.classList.remove('walking');
		}
		// 勇者を話し相手の方へ向ける（隣に来た人と向き合う）
		const stop = path[path.length - 1];
		deps.faceHero(dirFromTo(playerCell, stop));

		busy = false;
		deps.startDialog(r, c, tile, () => {
			deps.saveGame();
			deps.refreshUnreadMarks();
			void leave(walker, homeCv, path, entry, home);
		});
	}

	// 読み終えたら元の場所へ戻る。もう居ない人（hideWhen が成り立った）は歩きながら消える。
	async function leave(walker, homeCv, path, entry, home) {
		const gone = !npcPresent(entry, deps.getPlayer());
		const cell = homeCell(home.r, home.c);
		if (gone) { homeCv?.remove(); cell?.querySelector(':scope > canvas.mark-bubble')?.remove(); }
		if (!walker) return;
		if (gone) walker.style.opacity = '0';
		walker.classList.add('walking');
		await walk(walker, [...path].reverse());
		cell?.classList.remove('story-away');
		walker.remove();
	}

	/**
	 * 話しかけに来る人が居れば演出を始めて true（この tick の残りは走らせない）。
	 * 演出中も true（世界は止めてある）。
	 */
	function tryStart() {
		if (busy) return true;
		const sd = deps.getStageData();
		if (!sd) return false;
		const found = pendingApproach(sd, deps.getCurrentLayer(), deps.getStageKey(), deps.getPlayer(), isNpcTile);
		if (!found) return false;
		busy = true;
		deps.cancelCharge();
		deps.stopGameLoop();
		run(found).catch((err) => {
			console.error('[story-approach]', err);
			busy = false;
			deps.startGameLoop();
		});
		return true;
	}

	return { tryStart, isBusy: () => busy };
}
