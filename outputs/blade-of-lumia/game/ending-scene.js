// game/ending-scene.js ── ザーネルを倒した後の場面（キュー108・2026-11-15）
//
// ユーザーの方針：
//   「ザーネルを倒した瞬間スタッフロールになってしまうけど、姫を救い出すシーンをアニメーションで表現するなど、
//    倒しただけでは終わらないようにしたい」「世界の設定はしっかり盛り込もう。あと姫を救っただけで終わらずに
//    姫の復活によって世界を救われていく感じを出せるといいね」。救う相手＝女王ルミア（ユーザー選択）。
//   女王は塔ではなく南東の海の底で石になって眠っている（LORE.md）＝塔から海へ光が届く場面でつなぐ。
//
// 流れ（台詞と場面の一覧はこのファイルの FINALE が単一の真実）：
//   ① 塔の玉座でザーネルの最期の言葉 → 光の柱が立ち、画面が白くなる
//   ② 女王の石碑の島（field 11,19）：石の女王（灰色）に光が降り、色が戻って目覚める → 勇者が光から現れる → 女王が歩み寄って話す
//   ③ 世界が戻っていく：各地の画面で光の輪が広がり、怨念のもや・呪い火・魔物が光になって消え、跡に花が咲く。一行ずつ添える
//   ④ はじまりの村：村の人のひとこと → done()（＝startEnding＝スタッフロール）
//
// 見た目だけの場面＝ゲームの状態は変えない（enterStage で画面を移すだけ・ゲームループは止めたまま）。
// 入力は飲む（game.js getIsCutscene が isBusy を見る）。会話は ui.js openDialog（読み進めはいつもの操作）。
import { makeSprite } from '../shared/sprites.js';
import { putCellSprite } from './render-board.js';
import { TILE } from '../shared/tiles.js';

export const FINALE = {
	zarnel: {
		name: 'ザーネル',
		lines: [
			'……数え終える日は、来なかったな。',
			'ルミア……私はただ、失いたくなかっただけだ。',
			'光の剣を継ぐ者よ。あの方を……深みから……',
		],
	},
	island: { stage: '11,19', queen: { r: 4, c: 5 }, hero: { r: 4, c: 7 } },
	queen: {
		name: '女王ルミア',
		lines: [
			'長い夢を見ていました。暗い水の底で、八つの星が一つずつ灯るのを。',
			'あなたが、光の剣を継ぐ者ですね。',
			'わたしが都に残ったのは、沈みゆく都と、そこで眠る者たちを置いてはいけなかったから。',
			'ザーネルも、光を求めた一人でした。救えなかった名を、もう数えなくていいのです。',
			'地上には、わたしと同じ色の髪を持つ子らがいると聞きます。都の血は、絶えていなかったのですね。',
			'さあ、この地に光を返しましょう。',
		],
	},
	// 世界が戻っていく画面（stage＝field の画面・勇者は描かない）。
	// 光の輪が画面の中心から広がり、輪が通った所で**ゲーム中に実在した悪いもの**が消える
	// ＝怨念のもや（Ψ）が晴れ、呪い火（ψ）と魔物が光になる。地形は汚さず、輪の跡に花が咲く（足し算）。
	// 2026-11-16 ユーザー「ゲーム画面中はこういう有様じゃなかったのに、それが浄化された、っていうのなんか変」
	// ＝場面の中だけで荒れた姿を被せて戻す初版は取り消し。画面は もや・呪い火・魔物が実際に居る所から選んだ。
	// マップのデータとセーブは変えない＝見た目だけ。
	restore: [
		{ stage: '2,1',   text: '森の 呪い火が 消えた' },
		{ stage: '3,16',  text: '砂の 遺跡の 怨念が 晴れた' },
		{ stage: '13,8',  text: '雪原に 静けさが 戻った' },
		{ stage: '11,18', text: '沼の 怨念が 晴れていく' },
		{ stage: '12,0',  text: '火の山の 呪い火が 鎮まった' },
	],
	village: {
		stage: '7,14',
		talks: [
			{ name: '村人 タロ', lines: ['すげえ！ 空が、ずっと光ってる！'] },
			{ name: '諦めた老人', lines: ['……ほれ見い。いけたじゃろ？'] },
			{ name: '老賢者', lines: ['よくぞ……よくぞ成し遂げた、若き勇者よ。', 'ルミアの地に、光が戻ったのじゃ。'] },
		],
	},
};

export const FINALE_MS = { BEAM: 1100, AWAKE: 1600, STEP: 260, SHOW: 1100, WAVE: 2200, HOLD: 1600 };

// 輪の跡に花が咲く地面（下地の絵の名前の頭）。水・溶岩・石畳・物の置かれたマスには咲かない。
const FLOWER_GROUND = /^(grass|sand|snow|mud|ash)/;
const FLOWER_RATE = 0.3;

export function createEndingScene(deps) {
	const {
		getCharLayerEl, getCellPx, getPlayer, setHeroDir,
		enterStage, openDialog, stopGameLoop, playSound,
		getTileAt = () => null,
	} = deps;
	let busy = false;
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	// 会話を閉じると ui.js がゲームループを再開する＝閉じたらすぐ止め直す（game.js gameTick も isBusy で何もしない）
	const say = (name, lines) => new Promise((r) => openDialog(name, lines, null, () => { stopGameLoop(); r(); }));
	const board = () => document.getElementById('board');

	function flash(on) {
		let el = document.getElementById('ending-flash');
		if (!el) { el = document.createElement('div'); el.id = 'ending-flash'; document.body.appendChild(el); }
		el.classList.toggle('on', on);
	}
	function caption(text) {
		let el = document.getElementById('ending-caption');
		if (!el) { el = document.createElement('div'); el.id = 'ending-caption'; document.body.appendChild(el); }
		el.textContent = text ?? '';
		el.classList.toggle('on', !!text);
	}
	function beamAt(r, c, dir = 'in') {
		const layer = getCharLayerEl(); if (!layer) return;
		const cp = getCellPx();
		const el = document.createElement('div');
		el.className = `warpstone-beam warpstone-beam--${dir} ending-beam`;
		el.style.cssText = `position:absolute;left:${(c - 0.1) * cp}px;top:${(r - 1.1) * cp}px;width:${cp * 1.2}px;height:${cp * 2.2}px;z-index:31;pointer-events:none;`;
		layer.appendChild(el);
		setTimeout(() => el.remove(), 900);
	}
	function placeQueen({ r, c }) {
		const layer = getCharLayerEl(); if (!layer) return null;
		const cp = getCellPx();
		const el = document.createElement('div');
		el.className = 'ending-queen stone';
		el.style.cssText = `position:absolute;left:${c * cp}px;top:${r * cp}px;width:${cp}px;height:${cp}px;z-index:6;`;
		// 遊べる絵の正面（queenD）と同じ絵＝旧 npcQueen（refs/女王32b の読み戻し）は崩れていた（2026-11-15 ユーザー指摘）
		putCellSprite(el, makeSprite('queenD', 'queen', true), 'char-sprite');
		layer.appendChild(el);
		return el;
	}

	// ── 世界が戻る：光の輪が広がり、輪が通った所で もや・呪い火・魔物が光になって消え、花が咲く ──
	// 花を咲かせるマスは座標から決める（毎回同じ＝見るたびに変わらない・テストも揺れない）
	const flowerHere = (r, c) => ((r * 73 + c * 151 + r * c * 17) % 100) / 100 < FLOWER_RATE;
	function cleanseBoard(origin) {
		const b = board(); if (!b) return Promise.resolve();
		const cp = getCellPx();
		const cells = [...b.querySelectorAll('.cell')];
		const rows = Math.max(...cells.map((c) => +c.dataset.row)) + 1;
		const cols = Math.max(...cells.map((c) => +c.dataset.col)) + 1;
		const ox = ((origin?.c ?? (cols - 1) / 2) + 0.5) * cp;
		const oy = ((origin?.r ?? (rows - 1) / 2) + 0.5) * cp;
		const maxR = Math.max(...[[0, 0], [cols, 0], [0, rows], [cols, rows]].map(([x, y]) => Math.hypot(x * cp - ox, y * cp - oy))) + cp;
		const dist = (x, y) => Math.hypot(x - ox, y - oy);
		const items = [];
		for (const cell of cells) {
			const r = +cell.dataset.row, c = +cell.dataset.col;
			const d = dist((c + 0.5) * cp, (r + 0.5) * cp);
			items.push({ d, run: () => cell.classList.add('ending-cleansed') });
			if (getTileAt(r, c) === TILE.CURSE_MIST) {
				items.push({ d, run: () => { cell.classList.add('ending-unmist'); burst(b, (c + 0.5) * cp, (r + 0.5) * cp); } });
			} else if (!cell.querySelector('canvas') && FLOWER_GROUND.test(cell.dataset.bgSprite ?? '') && flowerHere(r, c)) {
				items.push({ d: d + cp * 0.6, run: () => flower(cell, r, c) });   // 輪が過ぎた少し後に咲く
			}
		}
		// 魔物（呪い火を含む）＝キャラ層の敵の要素。場面の間はゲームループが止まっている＝動かない
		for (const el of getCharLayerEl()?.querySelectorAll('.char-abs[data-enemy-id]') ?? []) {
			const x = parseFloat(el.style.left) + el.offsetWidth / 2, y = parseFloat(el.style.top) + el.offsetHeight / 2;
			items.push({ d: dist(x, y), run: () => { el.classList.add('ending-vanish'); burst(b, x, y); } });
		}
		items.sort((a, b2) => a.d - b2.d);
		const ring = document.createElement('div');
		ring.className = 'ending-ring';
		b.appendChild(ring);
		return new Promise((resolve) => {
			const t0 = performance.now();
			let i = 0;
			const step = (now) => {
				const k = Math.min(1, (now - t0) / FINALE_MS.WAVE);
				const R = maxR * k;
				ring.style.background = `radial-gradient(circle at ${ox}px ${oy}px, transparent ${Math.max(0, R - cp * 0.9)}px, rgba(255,248,200,0.7) ${R}px, transparent ${R + cp * 0.5}px)`;
				while (i < items.length && (items[i].d <= R || k >= 1)) items[i++].run();
				if (k < 1) { requestAnimationFrame(step); return; }
				ring.remove();
				resolve();
			};
			requestAnimationFrame(step);
		});
	}
	// 消えた所から立ちのぼる光の粒
	function burst(b, x, y) {
		const cp = getCellPx();
		for (let i = 0; i < 6; i++) {
			const el = document.createElement('div');
			el.className = 'ending-mote';
			el.style.left = `${x + (Math.random() - 0.5) * cp * 0.8}px`;
			el.style.top = `${y + (Math.random() - 0.3) * cp * 0.6}px`;
			el.style.animationDelay = `${Math.random() * 300}ms`;
			b.appendChild(el);
		}
	}
	// 花＝1マスに1〜2輪。色は座標で決める（桃・白・黄）
	function flower(cell, r, c) {
		const n = 1 + ((r + c) % 2);
		for (let i = 0; i < n; i++) {
			const el = document.createElement('div');
			el.className = `ending-flower ending-flower--${(r * 3 + c + i) % 3}`;
			el.style.left = `${22 + ((r * 29 + c * 41 + i * 37) % 52)}%`;
			el.style.top = `${26 + ((r * 43 + c * 19 + i * 23) % 48)}%`;
			cell.appendChild(el);
		}
	}

	async function play(done) {
		if (busy) return;
		busy = true;
		stopGameLoop();
		document.body.classList.add('ending-scene');
		try {
			// ① ザーネルの最期
			await say(FINALE.zarnel.name, FINALE.zarnel.lines);
			const p = getPlayer();
			beamAt(Math.round(p.y), Math.round(p.x), 'out');
			playSound('flute');
			await sleep(500);
			flash(true);
			await sleep(FINALE_MS.BEAM);

			// ② 女王の石碑の島
			const I = FINALE.island;
			document.body.classList.add('ending-hide-hero');
			enterStage('field', I.stage, I.hero.r, I.hero.c);
			const queen = placeQueen(I.queen);
			flash(false);
			await sleep(700);
			beamAt(I.queen.r, I.queen.c, 'in');
			playSound('item');
			queen?.classList.remove('stone');   // 灰色 → 色が戻る（CSS の transition）
			await sleep(FINALE_MS.AWAKE);
			beamAt(I.hero.r, I.hero.c, 'in');
			playSound('stageTransition');
			document.body.classList.remove('ending-hide-hero');
			setHeroDir('left');
			await sleep(800);
			// 女王が一歩、勇者へ歩み寄る
			if (queen) { queen.style.transition = `left ${FINALE_MS.STEP * 2}ms linear`; queen.style.left = `${(I.hero.c - 1) * getCellPx()}px`; }
			await sleep(FINALE_MS.STEP * 2 + 200);
			await say(FINALE.queen.name, FINALE.queen.lines);
			flash(true);
			playSound('flute');
			await sleep(FINALE_MS.BEAM);

			// ③ 世界が戻っていく
			document.body.classList.add('ending-montage');
			for (const s of FINALE.restore) {
				enterStage('field', s.stage, 5, 5);
				flash(false);
				await sleep(FINALE_MS.SHOW);   // まずゲーム中と同じ姿（もや・呪い火・魔物が居る）を見せる
				playSound('item');
				caption(s.text);
				await cleanseBoard(s.origin);
				await sleep(FINALE_MS.HOLD);
				caption(null);
			}

			// ④ はじまりの村
			enterStage('field', FINALE.village.stage, 6, 6);
			document.body.classList.remove('ending-montage');
			setHeroDir('down');
			await sleep(600);
			for (const t of FINALE.village.talks) await say(t.name, t.lines);
		} finally {
			caption(null);
			flash(false);
			document.body.classList.remove('ending-scene', 'ending-hide-hero', 'ending-montage');			busy = false;
		}
		done?.();
	}

	return { play, isBusy: () => busy };
}
