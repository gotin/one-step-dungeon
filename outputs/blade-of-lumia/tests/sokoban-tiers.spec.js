// tests/sokoban-tiers.spec.js — Phase 4.6: 石パズルお試し4枚（易/中/難/激難）の実プレイ検証＋
// 2026-08-02 のバグ修正「閉じた門の中に立って石を押せない」の回帰（24,0 をフィクスチャに流用）
//
// 目的は「難易度の数字」と「実ゲーム」が一致していることの担保。
// 生成器（scripts/generate-sokoban-playable.mjs）と移設スクリプト
// （scripts/migrate-test-sokoban-tiers.mjs）は状態空間ソルバー
// （scripts/lib/blade-solver.mjs）の上で 4軸を測っている。ソルバーが実エンジンから
// ズレていると「測定では深いのに実機では一瞬で解ける（またはそもそも解けない）」に
// なる＝このセッションで実際に踏んだ罠（T ゲートを常に通行可として測っていた）。
// ∴ここでは次の4種を検証する：
//   ① 静的：ゲートを閉じたままでは宝に届かない（報酬が飾りでない＝空虚なテスト防止）
//   ②' 静的：記録された L（ステージ comment）が帯の順に単調増加している
//      （＝あとで盤面を差し替えたときに「激難のほうが浅い」に気づける。BFS を回さない安い検査）
//   ② 実機：4枚が pageerror 0 で開き、初期状態ではゲートが閉じている
//   ③ 実機：ソルバーの最短手順を**実際の入力経路で再生**すると、
//      ゲートが開き・石がロックされ・宝が取れる（＝測定した解が実機で通る）
//   ④ 回帰：最後の1個を「プレイヤーが踏んだ」だけでは石ロックが立たない
//      （Phase 4.6 でロック条件を「全ボタンに石」へ絞った理由。ここが緩むと
//       石を n-1 個運んで自分で踏む＝倉庫番として成立しない）

import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { ROWS, COLS, makeSolver } from '../scripts/lib/blade-solver.mjs';
import { TILE } from '../shared/tiles.js';
import { GAME_URL, SAVE_KEY, waitForBoard } from './helpers.js';
import { TEST_LAYER, stageKey } from './test-stage-keys.js';

const MAP = JSON.parse(fs.readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));

// 入口＝連絡通路(row1)から部屋へ入る手前のセル。生成時の測定は (1,0) 始点だが、
// テストは外周セルに立たせない（ステージ遷移判定を巻き込まないため）ので (1,2) から測り直す。
const ENTRY = { r: 1, c: 2 };

// stones ＝その帯の石（＝ボタン）の個数。激難だけ石4個（§3-2c の上限）で、
// 「難より一段上げる主役は壁の広さでも L でもなく石数」というのが Phase 4.6 の結論。
// expectL ＝生成時の実測 L（migrate が EXPECT として記録し、ステージ comment に焼いた値）。
const TIERS = [
	{ name: 'sokoban_easy',    label: '易',   reward: 30,  stones: 3, expectL: 33 },
	{ name: 'sokoban_medium',  label: '中',   reward: 50,  stones: 3, expectL: 40 },
	{ name: 'sokoban_hard',    label: '難',   reward: 100, stones: 3, expectL: 56 },
	{ name: 'sokoban_extreme', label: '激難', reward: 200, stones: 4, expectL: 89 },
	// ⚠️ 5枚目（24,0 sokoban_color）は帯に含めない＝パズルとして未成立（解なし）。
	// 詳細はファイル末尾の「バグ回帰」describe。
];

// 石数で一段上げた帯（＝激難）＝TIERS の末尾。名前で指す（帯の並びを変えても壊れない）。
const STONE4_TIER = 'sokoban_extreme';

const key = (r, c) => `${r},${c}`;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** ライブマップから検証ステージを読み、ボタン/ゲート/宝/床を割り出す。 */
function loadStage(name) {
	const sd = MAP.layers[TEST_LAYER].stages[stageKey(name)];
	expect(sd, `${name} がライブマップに無い`).toBeTruthy();
	expect(sd.rows).toBe(ROWS);
	expect(sd.cols).toBe(COLS);
	// タイルは「文字配列の配列」でなければならない（行文字列だと実ゲームが落ちる）。
	expect(Array.isArray(sd.tiles[0]), 'tiles は文字配列の配列').toBe(true);
	const buttons = [], gates = [], stones = [], floors = new Set();
	// 色ゲート '('/')' は「開けば通れる」＝floors に入れる（＝閉のままでは通れないことは
	// ソルバー側が activeColor で判定する）。色スイッチ '['/']' は踏める床。
	const colorGates = [], colorSwitches = [];
	let chest = null;
	for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
		const ch = sd.tiles[r][c];
		if (ch === TILE.WALL) continue;
		if (ch === TILE.GATE) { gates.push(key(r, c)); continue; }
		floors.add(key(r, c));
		if (ch === TILE.BUTTON) buttons.push(key(r, c));
		if (ch === TILE.STONE) stones.push(key(r, c));
		if (ch === TILE.CHEST) chest = key(r, c);
		if (ch === TILE.GATE_RED || ch === TILE.GATE_BLUE) colorGates.push(key(r, c));
		if (ch === TILE.SWITCH_RED || ch === TILE.SWITCH_BLUE) colorSwitches.push(key(r, c));
	}
	return { sd, buttons, gates, stones, floors, chest, colorGates, colorSwitches };
}

/** ゲート閉のまま入口から歩いて到達できるセル集合。 */
function reachableWithGatesClosed(st) {
	const seen = new Set([key(ENTRY.r, ENTRY.c)]), q = [...seen];
	for (let i = 0; i < q.length; i++) {
		const [r, c] = q[i].split(',').map(Number);
		for (const [dr, dc] of DIRS) {
			const nk = key(r + dr, c + dc);
			if (seen.has(nk) || !st.floors.has(nk)) continue;
			seen.add(nk); q.push(nk);
		}
	}
	return seen;
}

/**
 * ソルバーで「全ボタンに石を乗せて宝に立つ」最短手順を求め、
 * 1手ずつの {dir, to:{r,c}, push} 列に変換する（実機再生用）。
 */
function shortestPlan(st) {
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const linkSpec = (st.sd.links ?? []).map((l) => [l.switchId, [l.gateId]]);
	const S = makeSolver(st.sd.tiles, bg, linkSpec, {}, new Set(), { hasLadder: false });
	const start = S.encode(ENTRY.r, ENTRY.c, S.initStones, 0, 0, 0);
	const goalTest = (state) => {
		const f = state.split('|');
		return f[0] === st.chest && f[5] === '1';   // 宝セルに立ち、かつ石ロック済み
	};
	const prev = new Map([[start, null]]);
	const q = [start];
	let goal = null;
	for (let i = 0; i < q.length && goal === null; i++) {
		for (const nx of S.nextStates(q[i])) {
			if (prev.has(nx)) continue;
			prev.set(nx, q[i]);
			if (goalTest(nx)) { goal = nx; break; }
			q.push(nx);
		}
	}
	expect(goal, '最短解が見つかる（＝実プレイ形で解ける盤面）').toBeTruthy();
	const chain = [];
	for (let s = goal; s !== null; s = prev.get(s)) chain.push(s);
	chain.reverse();
	const steps = [];
	for (let i = 1; i < chain.length; i++) {
		const [pos0, stones0] = chain[i - 1].split('|');
		const [pos1, stones1] = chain[i].split('|');
		const [r0, c0] = pos0.split(',').map(Number);
		const [r1, c1] = pos1.split(',').map(Number);
		// ソルバーは道具の使用も遷移に含むが、この盤面には Y/'!'/H が無いので
		// 遷移は必ず「歩き」か「石押し」＝プレイヤーが1セル動く手だけになる。
		expect(Math.abs(r1 - r0) + Math.abs(c1 - c0), '1手＝1セル移動').toBe(1);
		const dir = r1 < r0 ? 'up' : r1 > r0 ? 'down' : c1 < c0 ? 'left' : 'right';
		steps.push({ dir, to: { r: r1, c: c1 }, push: stones0 !== stones1 });
	}
	return steps;
}

/**
 * セーブを仕込んで検証ステージから開始する（＝debugMode OFF の素の状態で遊ぶ）。
 * at で開始セルを変えられる（色ゲートの検証は部屋の奥から始めたい＝入口から
 * 20 手歩かせると押しクールダウン込みでテストが長くなるだけ）。
 */
async function startAt(page, name, at = ENTRY) {
	await page.addInitScript(({ k, v }) => {
		try { localStorage.setItem(k, v); } catch { /* noop */ }
	}, {
		k: SAVE_KEY,
		v: JSON.stringify({
			player: {
				x: at.c, y: at.r,
				hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
				weapon: 'sword', shield: null, armor: null,
				subItems: {}, activeSubItem: null, rupees: 0, triforceCount: 0,
			},
			stageState: {},
			currentLayer: TEST_LAYER,
			stageKey: stageKey(name),
			heroDir: 'down',
		}),
	});
	await page.goto(GAME_URL);
	const cont = page.locator('#btn-continue');
	await cont.waitFor({ state: 'visible', timeout: 5000 });
	await cont.click();
	await waitForBoard(page);
}

const playerPos = (page) => page.evaluate(() => {
	const p = window.__game.getState().player;
	return { x: p.x, y: p.y, rupees: p.rupees };
});

/**
 * 手順を実際の入力経路（movePlayer）で再生する。
 * 通常移動は半セル刻み（1セル＝2回）、石押しは1回で1セル動くが実時間クールダウン
 * （STONE_PUSH_COOLDOWN_MS=600）がある∴押しの後だけ長く待つ。
 * 到達判定は「セル中心＝整数座標の一致」で行う（floor で丸めると半セル位置を
 * 隣セルと誤認して以降ずっと非整列になり、縦の石押しが発火しなくなる）。
 */
async function replay(page, steps) {
	for (let i = 0; i < steps.length; i++) {
		const s = steps[i];
		await page.evaluate((d) => window.__game.setHeroDir(d), s.dir);
		for (let guard = 0; guard < 6; guard++) {
			const p = await playerPos(page);
			if (p.x === s.to.c && p.y === s.to.r) break;
			await page.evaluate((d) => window.__game.movePlayer(d), s.dir);
			await page.waitForTimeout(s.push ? 650 : 30);
		}
		const p = await playerPos(page);
		expect(`${p.y},${p.x}`, `手順${i + 1}（${s.dir}${s.push ? '・石押し' : ''}）で ${s.to.r},${s.to.c} へ`)
			.toBe(`${s.to.r},${s.to.c}`);
	}
}

test.describe('Phase 4.6 – 石パズルお試し4枚（易/中/難/激難）', () => {
	for (const tier of TIERS) {
		test(`${tier.label}：ゲートを開けない限り宝に届かない（静的）`, () => {
			const st = loadStage(tier.name);
			expect(st.buttons.length, `ボタン${tier.stones}個`).toBe(tier.stones);
			expect(st.stones.length, `石${tier.stones}個`).toBe(tier.stones);
			expect(st.gates.length, 'ゲート1個以上').toBeGreaterThan(0);
			expect(st.chest, '宝がある').toBeTruthy();
			expect(st.sd.chestContents?.[st.chest]?.value, '宝の中身が入っている').toBe(tier.reward);

			const reach = reachableWithGatesClosed(st);
			expect(reach.has(st.chest), 'ゲート閉のままでは宝に届かない').toBe(false);
			for (const b of st.buttons) {
				expect(reach.has(b), `ボタン ${b} は最初から到達できる（入って詰まない）`).toBe(true);
			}
			// ボタン↔ゲートが隣接していると、足踏みで開いた瞬間に1歩で抜けられてしまう。
			for (const b of st.buttons) for (const g of st.gates) {
				const [br, bc] = b.split(',').map(Number);
				const [gr, gc] = g.split(',').map(Number);
				expect(Math.abs(br - gr) + Math.abs(bc - gc), `ボタン ${b} とゲート ${g} は2以上離す`)
					.toBeGreaterThan(1);
			}
		});

		test(`${tier.label}：実機で開き、初期状態ではゲートが閉じている`, async ({ page }) => {
			const errors = [];
			page.on('pageerror', (e) => errors.push(String(e)));
			const st = loadStage(tier.name);
			await startAt(page, tier.name);

			const state = await page.evaluate(() => window.__game.getState());
			expect(state.currentLayer, '検証レイヤーで始まる').toBe(TEST_LAYER);
			expect(state.stageKey, 'seed したステージで始まる').toBe(stageKey(tier.name));

			const ss = await page.evaluate(() => window.__game.getStageState());
			for (const g of st.gates) expect(ss.openGates, `ゲート ${g} は閉じている`).not.toContain(g);
			expect(ss.stonesLocked, '初期状態はロックされていない').toBeFalsy();
			expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
		});
	}

	// ②' 帯が実際に「深くなる順」に並んでいるか（静的・BFS 不要）。
	// 各ステージの comment には migrate が実測値（L / デッドロック / 強制手率）を焼いている。
	// 盤面を差し替えたとき comment の L も一緒に書き換わる∴ここで単調増加を見ておけば
	// 「激難が難より浅い」まま気づかずに置く事故を防げる。
	test('帯の実測 L が 易 < 中 < 難 < 激難 の順に深くなる（記録値）', () => {
		const Ls = TIERS.map((tier) => {
			const sd = MAP.layers[TEST_LAYER].stages[stageKey(tier.name)];
			const m = /L=(\d+)/.exec(sd.comment ?? '');
			expect(m, `${tier.label} の comment に実測 L の記録が無い`).toBeTruthy();
			expect(Number(m[1]), `${tier.label} の記録 L が生成時の実測と一致`).toBe(tier.expectL);
			return Number(m[1]);
		});
		for (let i = 0; i + 1 < Ls.length; i++) {
			expect(Ls[i + 1], `${TIERS[i + 1].label}(L=${Ls[i + 1]}) は ${TIERS[i].label}(L=${Ls[i]}) より深い`)
				.toBeGreaterThan(Ls[i]);
		}
		// 激難は石数でも一段上（石を増やすのが難を超える主役＝§3-2c）。
		expect(TIERS.find((t) => t.name === STONE4_TIER).stones, '激難は石4個').toBe(4);
	});

	// ③ 測定した最短解が実機でそのまま通ることの実証。
	// 易だけを再生する：中/難/激難は状態空間が 20万〜235万で BFS が重く、実機再生も
	// 手数×押しクールダウンで長くなる（激難は L=89・押しだけで 60 秒超）。
	// 「ソルバー＝実エンジン」の担保は 1 枚で足りる
	// （4枚は同じ規則・同じ生成器で作られている）。
	test('易：ソルバーの最短手順を実機で再生すると宝まで取れる', async ({ page }) => {
		test.setTimeout(180_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		const st = loadStage('sokoban_easy');
		const steps = shortestPlan(st);
		expect(steps.length, '手数が下限（§2: L≥6）を満たす').toBeGreaterThanOrEqual(6);

		await startAt(page, 'sokoban_easy');
		await replay(page, steps);

		const ss = await page.evaluate(() => window.__game.getStageState());
		for (const b of st.buttons) {
			const onStone = Object.values(ss.stonePositions).some((s) => `${s.r},${s.c}` === b);
			expect(onStone, `ボタン ${b} に石が乗っている`).toBe(true);
			expect(ss.switchStates[b], `ボタン ${b} が ON`).toBe(true);
		}
		for (const g of st.gates) expect(ss.openGates, `ゲート ${g} が開く`).toContain(g);
		expect(ss.stonesLocked, '全ボタンを石で埋めたのでロックされる').toBe(true);

		// 宝箱が開いたことは報酬で見る（getStageStateSnapshot は openedChests を返さない）。
		const p = await playerPos(page);
		expect(p.rupees, '宝の報酬（ルピー30）が入る').toBe(30);
		expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	// ④ ロック条件の回帰（Phase 4.6 の絞り込み）。
	// 実機の refreshGates() を直接呼ぶ（盤面を 30手以上再生せずに条件だけを突く）。
	// 「全ボタン ON でゲートは開く」が「石で全部埋まっていなければロックしない」を確認。
	test('最後の1個を足で踏んだだけではロックしない（ゲートは離すと閉じる）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		await startAt(page, 'sokoban_easy');

		const st = loadStage('sokoban_easy');
		const result = await page.evaluate(async ({ tiles, buttons, gates }) => {
			const { createConditions } = await import('/blade-of-lumia/game/conditions.js');
			const stageData = { rows: tiles.length, cols: tiles[0].length, tiles, links: [] };
			const ss = { openGates: new Set(), switchStates: {}, switchToggles: new Set(), stonePositions: {} };
			const cond = createConditions({
				getStageData: () => stageData,
				getEnemies: () => [],
				getPlayer: () => ({ x: 0, y: 0 }),
				getCurrentLayer: () => 'test',
				getStageKey: () => '0,0',
				getSS: () => ss,
				toTileRow: (y) => Math.round(y),
				toTileCol: (x) => Math.round(x),
				renderBoard: () => {},
				renderChars: () => {},
			});
			// 石2個をボタンへ、残り1個のボタンはプレイヤーの足踏みで ON。
			ss.stonePositions['9,9'] = { r: Number(buttons[0].split(',')[0]), c: Number(buttons[0].split(',')[1]) };
			ss.stonePositions['9,8'] = { r: Number(buttons[1].split(',')[0]), c: Number(buttons[1].split(',')[1]) };
			for (const b of buttons) ss.switchStates[b] = true;    // 3個目は足踏み相当
			cond.refreshGates();
			const footOn = { open: [...ss.openGates], locked: !!ss.stonesLocked };
			// 足を離す（＝モーメンタリで OFF）→ ゲートは閉じる
			ss.switchStates[buttons[2]] = false;
			cond.refreshGates();
			const footOff = { open: [...ss.openGates], locked: !!ss.stonesLocked };
			// 3個目も石で埋める → ここで初めてロック
			ss.stonePositions['9,7'] = { r: Number(buttons[2].split(',')[0]), c: Number(buttons[2].split(',')[1]) };
			ss.switchStates[buttons[2]] = true;
			cond.refreshGates();
			const allStones = { open: [...ss.openGates], locked: !!ss.stonesLocked };
			return { footOn, footOff, allStones, gates };
		}, { tiles: st.sd.tiles, buttons: st.buttons, gates: st.gates });

		for (const g of st.gates) {
			expect(result.footOn.open, `足踏みでも全ボタン ON ならゲート ${g} は開く`).toContain(g);
		}
		expect(result.footOn.locked, '石で埋まっていないのでロックはしない').toBe(false);
		for (const g of st.gates) {
			expect(result.footOff.open, `足を離すとゲート ${g} は閉じる（恒久開放されない）`).not.toContain(g);
		}
		expect(result.allStones.locked, '全ボタンを石で埋めるとロックする').toBe(true);
		for (const g of st.gates) {
			expect(result.allStones.open, `ロック後はゲート ${g} が開いたまま`).toContain(g);
		}
		expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});

// ── バグ回帰: 閉じた門の中に立って石を押せない（2026-08-02） ─────────────────
//
// ユーザー報告：「石がしまってるゲートをとおれるし、そのときはプレーヤーも通れてしまう」。
// 実体＝押し成功時、player.js は**通行判定なしで**プレイヤーを石の元セルへ移していた
// ＝閉じた門の中に立てる。∴「開いた門へ石を押し込む → 門を閉じる → 閉じた門の中に立って
// さらに押す」で閉じた門越しに石とプレイヤーを渡せた。色ゲートに限らず T ゲート／潮ゲート
// `=` でも同型＝背骨のバグ。Phase 5-1 の合成パズル（24,0・旧 L=91）はこの抜け道の上に
// 成立していた＝**盤面ごと撤回した**。
//
// 修正（player.js / enemy-ai.js の押し判定＋passable.js statefulTileClosed）：
//   ・押した後にプレイヤー（敵）が入る「石の元セル」の**下地**が閉じていたら押せない。
// ⚠️ 一度は「石は開いていても門へ押し込めない」という強い規則も入れたが**撤回した**＝
//    廊下C3（`field 15,14`）が「石でボタンを押さえて開けた潮ゲートを通して別の石を運ぶ」
//    設計で、強い規則はこの出荷済みパズルを壊した。**開いた門への押し込みは正当**。
// 24,0 はその回帰フィクスチャとして残す（石 (4,4) が赤ゲート (4,5) の隣＝抜け道を実機で
// 直接踏める唯一のジオメトリ）。パズルとしては解なし＝帯（TIERS）には含めない。
test.describe('バグ回帰 – 閉じた門の中に立って石を押せない（旧 Phase 5-1 合成盤面を流用）', () => {
	const AIRLOCK = { red: '4,5', blue: '4,6' };   // 直列に並んだ色ゲート2枚

	/** フィクスチャ盤面のソルバー（実エンジンの押し規則の写し）。 */
	function fixtureSolver(st) {
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		return makeSolver(st.sd.tiles, bg, [], {}, new Set(), { hasLadder: false });
	}
	const stonesOf = (state) => state.split('|')[1];

	test('Ⓐ フィクスチャのジオメトリ：色ゲート直列2枚と、その手前に石がある（静的）', () => {
		const st = loadStage('sokoban_color');
		expect(st.colorGates.sort(), '色ゲートは (4,5) 赤 → (4,6) 青 の直列2枚')
			.toEqual([AIRLOCK.red, AIRLOCK.blue].sort());
		expect(st.sd.tiles[4][5], '(4,5) は赤ゲート').toBe(TILE.GATE_RED);
		expect(st.sd.tiles[4][6], '(4,6) は青ゲート').toBe(TILE.GATE_BLUE);
		// 色を替えられなければゲートは開けられない＝スイッチは両色そろっている必要がある。
		const kinds = new Set(st.colorSwitches.map((k) => {
			const [r, c] = k.split(',').map(Number);
			return st.sd.tiles[r][c];
		}));
		expect(kinds.has(TILE.SWITCH_RED), '赤スイッチがある').toBe(true);
		expect(kinds.has(TILE.SWITCH_BLUE), '青スイッチがある').toBe(true);
		// 抜け道を踏むための本体：石 (4,4) が赤ゲート (4,5) の**真西**に隣接している。
		expect(st.stones, '石 (4,4) がエアロックの手前にある').toContain('4,4');
		expect(st.sd.tiles[4][3], '(4,3) は床＝石 (4,4) を東へ押す立ち位置がある').toBe(TILE.FLOOR);
	});

	test('Ⓑ ソルバー：この盤面は解なし（旧 L=91 はバグ依存だった）', () => {
		const st = loadStage('sokoban_color');
		const S = fixtureSolver(st);
		// 「全ボタンに石を乗せて宝に立つ」を BFS で探す（修正前は L=91 で解けていた）。
		const start = S.encode(ENTRY.r, ENTRY.c, S.initStones, 0, 0, 0);
		const seen = new Set([start]);
		const q = [start];
		let goal = null;
		for (let i = 0; i < q.length && goal === null; i++) {
			for (const nx of S.nextStates(q[i])) {
				if (seen.has(nx)) continue;
				seen.add(nx);
				const f = nx.split('|');
				if (f[0] === st.chest && f[5] === '1') { goal = nx; break; }
				q.push(nx);
			}
		}
		expect(goal, '閉じた門の中に立てない∴エアロックを抜けられず解けない').toBeNull();
		// 状態数まで固定する＝押し規則が緩むと状態が増えるので、解の有無より早く気づける。
		expect(seen.size, '到達状態数（修正後の実測値）').toBe(46836);
	});

	test('Ⓒ ソルバー：開いた門へは押し込めるが、閉じた門の中に立つ押しは出ない', () => {
		const st = loadStage('sokoban_color');
		const S = fixtureSolver(st);
		// ① 赤（color=1）で赤ゲート (4,5) は**開いている**∴石 (4,4) を押し込めるのが正当
		//    （廊下C3 と同じ語彙＝これを禁じると出荷済みパズルが壊れる）。
		const atRedOpen = S.encode(4, 3, S.initStones, 0, 0, 0, 0, 1);
		const intoOpen = S.nextStates(atRedOpen).some((nx) => stonesOf(nx).split(';')[0] === '4,5');
		expect(intoOpen, '開いた赤ゲートへは石を押し込める').toBe(true);
		// ② ★本体：石が赤ゲート (4,5) に乗った状態で青に替える（＝赤が閉じる）と、
		//    行き先 (4,6) は開いていても押せない＝プレイヤーが入る (4,5) が閉じているから。
		const onRedGate = ['4,5', ...S.initStones.slice(1)];
		const closedBehind = S.encode(4, 4, onRedGate, 0, 0, 0, 0, 2);
		for (const nx of S.nextStates(closedBehind)) {
			expect(stonesOf(nx), '閉じた門の中に立つ押しは遷移に出ない').not.toContain('4,6');
		}
		// ③ 過剰ブロックの回帰：門が絡まない普通の押し（石 (4,4) を北の床 (3,4) へ）は通る。
		const plain = S.encode(5, 4, S.initStones, 0, 0, 0, 0, 0);
		const pushed = S.nextStates(plain).some((nx) => stonesOf(nx).includes('3,4'));
		expect(pushed, '床への普通の押しは今も成立する（修正が押し全体を壊していない）').toBe(true);
	});

	test('Ⓓ 色ゲートが閉じたままでも入口から全床へ歩ける（ハードロックしない）', () => {
		const st = loadStage('sokoban_color');
		// ゲート T は開いた状態で見る（T の奥＝宝室は解いた後にしか入れない＝閉じ込めの元に
		// ならない）。色ゲートだけを壁として扱い、入口から全床に届くことを確認する。
		const pass = (k) => (st.floors.has(k) || st.gates.includes(k)) && !st.colorGates.includes(k);
		const seen = new Set([key(ENTRY.r, ENTRY.c)]), q = [...seen];
		for (let i = 0; i < q.length; i++) {
			const [r, c] = q[i].split(',').map(Number);
			for (const [dr, dc] of DIRS) {
				const nk = key(r + dr, c + dc);
				if (seen.has(nk) || !pass(nk)) continue;
				seen.add(nk); q.push(nk);
			}
		}
		for (const f of st.floors) {
			if (st.colorGates.includes(f)) continue;
			expect(seen.has(f), `色ゲート閉でも ${f} から出られる`).toBe(true);
		}
	});

	// Ⓔ 実機（この修正の本体）。盤面:
	//   3 #[...#....S#     [=赤スイッチ(3,1)  ]=青スイッチ(5,1)/(5,6)  [=赤(5,10)
	//   4 #.#.*().#*.#     石(4,4) / 赤ゲート(4,5) / 青ゲート(4,6) / 石(4,9)
	//   5 #]...#]...[#
	//   6 #.#.*#..#..#     石(6,4)
	// 確認するのは4つ（A→D の順に実際に歩く）：
	//   A 青（＝赤ゲート閉）では石 (4,4) を (4,5) へ押せない（押し先が閉じている）
	//   B 赤（＝赤ゲート開）にすれば押し込める＝**開いた門への押し込みは正当**
	//     （廊下C3 と同じ語彙。ここを禁じた強い規則は撤回した）
	//   C ★本体：そのまま青に戻す（赤ゲートが閉じる）と、押し先 (4,6) が開いていても
	//     石 (4,5) を押せない＝プレイヤーが入る (4,5) が閉じているから
	//     （修正前はここで閉じた赤ゲートの中に立って石を東へ渡せた＝ユーザー報告のバグ）
	//   D 過剰ブロックの回帰：門が絡まない普通の押し（石 (6,4)→(5,4)）は今も通る
	test('Ⓔ 実機：閉じた門の中に立って石を押せない（開いた門へは押せる）', async ({ page }) => {
		test.setTimeout(120_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		// (5,2) から開始＝青スイッチ (5,1) の隣。
		await startAt(page, 'sokoban_color', { r: 5, c: 2 });

		const stoneAt = () => page.evaluate(() => {
			const ss = window.__game.getStageState();
			return Object.entries(ss.stonePositions).map(([k, v]) => `${k}→${v.r},${v.c}`).sort().join(' ');
		});
		const color = () => page.evaluate(() => window.__game.getStageState().activeColor);
		// 剣で色スイッチを叩く。入場直後は gameNow() がまだ 0 付近で
		// `now - lastSwordTime < SWORD_COOLDOWN_MS(100)` が成立してしまい**初回の一振りが
		// 空振りになる**（combat.js:305）∴色が変わるまで振り直す。
		const hitSwitch = async (dir, want) => {
			await page.evaluate((d) => window.__game.setHeroDir(d), dir);
			for (let guard = 0; guard < 4; guard++) {
				if (await color() === want) break;
				await page.evaluate(() => window.__game.swordAttack());
				await page.waitForTimeout(150);   // SWORD_COOLDOWN_MS=100
			}
		};
		const tryPush = async (dir) => {
			await page.evaluate((d) => window.__game.setHeroDir(d), dir);
			await page.evaluate((d) => window.__game.movePlayer(d), dir);
			await page.waitForTimeout(650);   // STONE_PUSH_COOLDOWN_MS=600
		};

		expect(await playerPos(page), '(5,2) から開始').toMatchObject({ x: 2, y: 5 });
		expect(await color(), '入場時は activeColor 未設定＝色ゲートは両方閉').toBeFalsy();

		// A 青にする → 赤ゲート (4,5) は閉じる∴石 (4,4) を東へ押せない（押し先が閉じている）
		await hitSwitch('left', 'blue');
		expect(await color(), '青スイッチ (5,1) を剣で叩くと青').toBe('blue');
		await replay(page, [
			{ dir: 'right', to: { r: 5, c: 3 }, push: false },
			{ dir: 'up', to: { r: 4, c: 3 }, push: false },
		]);
		const before = await stoneAt();
		await tryPush('right');
		expect(await playerPos(page), '赤ゲートが閉じているので押しは失敗しプレイヤーも動かない')
			.toMatchObject({ x: 3, y: 4 });
		expect(await stoneAt(), '石は動いていない').toBe(before);

		// B 赤にする（＝赤ゲートが**開く**）→ 石は押し込める。開いた門への押し込みは正当な
		//   語彙（廊下C3 = field 15,14 が「石でボタンを押さえて開けた潮ゲートを通して別の石を
		//   運ぶ」設計）∴ここを禁じる強い規則は入れない（一度入れて出荷済みパズルを壊した）。
		await replay(page, [
			{ dir: 'up', to: { r: 3, c: 3 }, push: false },
			{ dir: 'left', to: { r: 3, c: 2 }, push: false },
		]);
		await hitSwitch('left', 'red');
		expect(await color(), '赤スイッチ (3,1) を叩くと赤（青は閉じる＝排他）').toBe('red');
		await replay(page, [
			{ dir: 'right', to: { r: 3, c: 3 }, push: false },
			{ dir: 'down', to: { r: 4, c: 3 }, push: false },
			{ dir: 'right', to: { r: 4, c: 4 }, push: true },
		]);
		expect(await stoneAt(), '開いた赤ゲートへは石を押し込める（石 (4,4)→(4,5)）')
			.toContain('4,4→4,5');

		// C ★本体：青に戻す（＝赤ゲート (4,5) が閉じ、押し先の青ゲート (4,6) が開く）。
		//   それでも石 (4,5) は押せない＝押した後にプレイヤーが入る (4,5) が閉じているから。
		//   修正前はここで閉じた赤ゲートの中に立って石を東へ渡せた（＝ユーザー報告のバグ）。
		await replay(page, [
			{ dir: 'down', to: { r: 5, c: 4 }, push: false },
			{ dir: 'left', to: { r: 5, c: 3 }, push: false },
			{ dir: 'left', to: { r: 5, c: 2 }, push: false },
		]);
		await hitSwitch('left', 'blue');
		expect(await color(), '青に戻すと赤ゲート (4,5) が閉じる').toBe('blue');
		await replay(page, [
			{ dir: 'right', to: { r: 5, c: 3 }, push: false },
			{ dir: 'right', to: { r: 5, c: 4 }, push: false },
			{ dir: 'up', to: { r: 4, c: 4 }, push: false },
		]);
		await tryPush('right');
		expect(await stoneAt(), '閉じた赤ゲートの中に立てない∴石は (4,5) のまま')
			.toContain('4,4→4,5');
		expect(await playerPos(page), '押しは失敗しプレイヤーも (4,4) に留まる')
			.toMatchObject({ x: 4, y: 4 });

		// D 過剰ブロックの回帰：門が絡まない普通の押し（石 (6,4) を北の床 (5,4) へ）は今も通る。
		await replay(page, [
			{ dir: 'down', to: { r: 5, c: 4 }, push: false },
			{ dir: 'left', to: { r: 5, c: 3 }, push: false },
			{ dir: 'down', to: { r: 6, c: 3 }, push: false },
			{ dir: 'down', to: { r: 7, c: 3 }, push: false },
			{ dir: 'right', to: { r: 7, c: 4 }, push: false },
			{ dir: 'up', to: { r: 6, c: 4 }, push: true },
		]);
		expect(await stoneAt(), '床への普通の押しは成立する（石 (6,4)→(5,4)）')
			.toContain('6,4→5,4');
		expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});
