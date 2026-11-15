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
//   ③ 世界が戻っていく：各地の画面が暗い色から明るい色へ戻り、一行ずつ添える（人と魔物は描かない）
//   ④ はじまりの村：村の人のひとこと → done()（＝startEnding＝スタッフロール）
//
// 見た目だけの場面＝ゲームの状態は変えない（enterStage で画面を移すだけ・ゲームループは止めたまま）。
// 入力は飲む（game.js getIsCutscene が isBusy を見る）。会話は ui.js openDialog（読み進めはいつもの操作）。
import { makeSprite } from '../shared/sprites.js';
import { putCellSprite } from './render-board.js';

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
	// 世界が戻っていく画面（stage＝field の画面・r/c＝目印に使うだけ＝勇者は描かない）
	restore: [
		// 森の聖域の入口（2,4）は下地が土で砂漠に見えた（headless の確認）＝木の多い森の画面を使う
		{ stage: '0,4',   text: '森に 聖樹の 火が 戻った' },
		{ stage: '2,15',  text: '砂の 嵐が 止んだ' },
		{ stage: '15,4',  text: '氷の 下で 水が 流れ始めた' },
		{ stage: '10,14', text: '沼の 毒が 澄んでいく' },
		{ stage: '12,17', text: '潮が 引き、沈んだ都が 姿を 現した' },
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

export const FINALE_MS = { BEAM: 1100, AWAKE: 1600, STEP: 260, RESTORE: 1300, HOLD: 1500 };

export function createEndingScene(deps) {
	const {
		getCharLayerEl, getCellPx, getPlayer, setHeroDir,
		enterStage, openDialog, stopGameLoop, playSound,
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
				board()?.classList.add('ending-dim');
				flash(false);
				await sleep(300);
				board()?.classList.remove('ending-dim');   // 暗い色 → 明るい色（CSS の transition）
				caption(s.text);
				await sleep(FINALE_MS.RESTORE + FINALE_MS.HOLD);
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
			document.body.classList.remove('ending-scene', 'ending-hide-hero', 'ending-montage');
			busy = false;
		}
		done?.();
	}

	return { play, isBusy: () => busy };
}
