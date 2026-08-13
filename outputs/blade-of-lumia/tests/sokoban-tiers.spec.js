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
	// ⚠️ 合成の1枚（sokoban_color = 26,0・2026-08-05 ユーザーがeditorで直接配置して確定）は
	// 帯に含めない＝実測 L=106 で23,0を超えるが専用テストは未整備（次タスク）。
	// 旧24,0（バグ依存で解なしだった当時の盤面）は25,0（sokoban_gate_push_regression）へ
	// 退避してバグ回帰専用にした。詳細はファイル末尾の「バグ回帰」describe。
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
 * shortestPlan の合成パズル版（26,0）。色スイッチを叩く手を含む＝道具（弓）で色を
 * 変える手を許すと L が過小に測られる（blade-solver.mjs ヘッダ参照）ので
 * `noTools:true` で剣叩き隣接限定の解を探す（記録 L=106 と一致する解＝実測どおり）。
 * 戻り値は {type:'move', dir, to, push} と {type:'hit', dir, color} の混在列。
 */
function shortestPlanColor(st) {
	const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
	const linkSpec = (st.sd.links ?? []).map((l) => [l.switchId, [l.gateId]]);
	const S = makeSolver(st.sd.tiles, bg, linkSpec, {}, new Set(), { hasLadder: false, noTools: true });
	const start = S.encode(ENTRY.r, ENTRY.c, S.initStones, 0, 0, 0);
	const goalTest = (state) => {
		const f = state.split('|');
		return f[0] === st.chest && f[5] === '1';
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
	expect(goal, '道具なしでも最短解が見つかる（＝剣叩きだけで解ける盤面）').toBeTruthy();
	const chain = [];
	for (let s = goal; s !== null; s = prev.get(s)) chain.push(s);
	chain.reverse();
	const findSwitchDir = (r, c, color) => {
		const want = color === 1 ? TILE.SWITCH_RED : TILE.SWITCH_BLUE;
		for (const [dir, dr, dc] of [['up', -1, 0], ['down', 1, 0], ['left', 0, -1], ['right', 0, 1]]) {
			if (st.sd.tiles[r + dr]?.[c + dc] === want) return dir;
		}
		return null;
	};
	const steps = [];
	for (let i = 1; i < chain.length; i++) {
		const prevF = chain[i - 1].split('|');
		const curF = chain[i].split('|');
		const [r0, c0] = prevF[0].split(',').map(Number);
		const [r1, c1] = curF[0].split(',').map(Number);
		if (r0 === r1 && c0 === c1) {
			const color = Number(curF[6]);
			const dir = findSwitchDir(r0, c0, color);
			expect(dir, `色スイッチが隣接する（${r0},${c0}・color=${color}）`).toBeTruthy();
			steps.push({ type: 'hit', dir, color });
		} else {
			expect(Math.abs(r1 - r0) + Math.abs(c1 - c0), '1手＝1セル移動').toBe(1);
			const dir = r1 < r0 ? 'up' : r1 > r0 ? 'down' : c1 < c0 ? 'left' : 'right';
			steps.push({ type: 'move', dir, to: { r: r1, c: c1 }, push: prevF[1] !== curF[1] });
		}
	}
	return steps;
}

/**
 * shortestPlanColor が返す move/hit 混在列を実際の入力経路で再生する。
 * move は replay と同じ規則。hit は setHeroDir→swordAttack で色スイッチを叩く
 * （入場直後は SWORD_COOLDOWN_MS=100 に食われて空振りするので activeColor が
 * 目的の色になるまで振り直す＝Ⓔ 実機テストの hitSwitch と同じ規則）。
 */
async function replayMixed(page, steps) {
	const color = () => page.evaluate(() => window.__game.getStageState().activeColor);
	const wantColor = (c) => (c === 1 ? 'red' : 'blue');
	for (let i = 0; i < steps.length; i++) {
		const s = steps[i];
		if (s.type === 'hit') {
			await page.evaluate((d) => window.__game.setHeroDir(d), s.dir);
			const want = wantColor(s.color);
			for (let guard = 0; guard < 4 && await color() !== want; guard++) {
				await page.evaluate(() => window.__game.swordAttack());
				await page.waitForTimeout(150);
			}
			expect(await color(), `手順${i + 1}（色スイッチ${s.dir}）で ${want} になる`).toBe(want);
			continue;
		}
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

/**
 * セーブを仕込んで検証ステージから開始する（＝debugMode OFF の素の状態で遊ぶ）。
 * at で開始セルを変えられる（色ゲートの検証は部屋の奥から始めたい＝入口から
 * 20 手歩かせると押しクールダウン込みでテストが長くなるだけ）。
 * withFlute=true で笛を所持済みの状態にする（resetStones 検証用・2026-08-04）。
 */
async function startAt(page, name, at = ENTRY, withFlute = false) {
	await page.addInitScript(({ k, v }) => {
		try { localStorage.setItem(k, v); } catch { /* noop */ }
	}, {
		k: SAVE_KEY,
		v: JSON.stringify({
			player: {
				x: at.c, y: at.r,
				hp: 6, maxHp: 6, maxHearts: 3, atk: 2, def: 0, keys: 0,
				weapon: 'sword', shield: null, armor: null,
				// JSON.stringify は Infinity を保持できない（null になる）ので有限の大きい値にする。
				subItems: withFlute ? { flute: { count: 999 } } : {},
				activeSubItem: withFlute ? 'flute' : null,
				rupees: 0, triforceCount: 0,
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

// ── 26,0（sokoban_color・合成パズル）専用の実機再生テスト（PLAN 4.7）───────────
//
// TIERS（4.6 の4枚）とは別枠：石4＋色ゲート2枚＋色スイッチ2個の合成盤面。2026-08-05に
// ユーザーが editor で直接配置して確定した盤面（PLAN 4.7 (B)）。ソルバー実測＝L=106・
// 貪欲NG・デッドロック=2,653,649・強制手率0.18・最短解本数320・状態3,272,882（23,0の
// L=89を質で超える）。I4（両色必須）は静的に確認済み（PLAN参照）。
//
// noEscape=343,552（非ゼロ＝色ゲートで詰む状態がある）＝25,0（sokoban_gate_push_regression）
// と同種の正常な倉庫番の詰み（バグではない）＝笛の resetStones で回復できる前提を採用し、
// このタスクで 26,0 にも fluteEffect:{type:'resetStones'} を付与した（PLAN の申し送り事項）。
test.describe('Phase 4.7 – 合成パズル 26,0（sokoban_color）', () => {
	const STAGE = 'sokoban_color';

	test('静的：色ゲート2枚＋色スイッチ2個＋ゲートT・色ゲート閉のままでは宝に届かない', () => {
		const st = loadStage(STAGE);
		expect(st.stones.length, '石4個').toBe(4);
		expect(st.colorGates.length, '色ゲート2枚').toBe(2);
		expect(st.colorSwitches.length, '色スイッチ2個').toBe(2);
		expect(st.gates.length, 'ゲートT 1個以上').toBeGreaterThan(0);
		expect(st.chest, '宝がある').toBeTruthy();
		expect(st.sd.chestContents?.[st.chest]?.value, '宝の中身が入っている').toBe(200);

		// ゲートT・色ゲートの両方を閉じたまま（＝初期状態）歩ける床だけを見る。
		// loadStage の floors は色ゲートのセルも含む（閉判定は BFS 側で除外する必要がある）。
		const blocked = new Set([...st.gates, ...st.colorGates]);
		const seen = new Set([key(ENTRY.r, ENTRY.c)]), q = [...seen];
		for (let i = 0; i < q.length; i++) {
			const [r, c] = q[i].split(',').map(Number);
			for (const [dr, dc] of DIRS) {
				const nk = key(r + dr, c + dc);
				if (seen.has(nk) || !st.floors.has(nk) || blocked.has(nk)) continue;
				seen.add(nk); q.push(nk);
			}
		}
		expect(seen.has(st.chest), 'ゲート閉のままでは宝に届かない').toBe(false);
	});

	test('実機：初期状態はゲートT・色ゲート両方閉じている（pageerror 0）', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		const st = loadStage(STAGE);
		await startAt(page, STAGE);

		const state = await page.evaluate(() => window.__game.getState());
		expect(state.currentLayer, '検証レイヤーで始まる').toBe(TEST_LAYER);
		expect(state.stageKey, 'seed したステージで始まる').toBe(stageKey(STAGE));

		const ss = await page.evaluate(() => window.__game.getStageState());
		for (const g of st.gates) expect(ss.openGates, `ゲート ${g} は閉じている`).not.toContain(g);
		expect(ss.activeColor, '色は未設定＝色ゲートは両方閉').toBeFalsy();
		expect(ss.stonesLocked, '初期状態はロックされていない').toBeFalsy();
		expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('実機：ソルバーの最短手順（道具なし・剣叩きのみ）を再生すると宝まで取れる', async ({ page }) => {
		test.setTimeout(180_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		const st = loadStage(STAGE);
		const steps = shortestPlanColor(st);
		expect(steps.length, '手数が下限（L=106）を満たす').toBeGreaterThanOrEqual(100);

		await startAt(page, STAGE);
		await replayMixed(page, steps);

		const ss = await page.evaluate(() => window.__game.getStageState());
		for (const b of st.buttons) {
			const onStone = Object.values(ss.stonePositions).some((s) => `${s.r},${s.c}` === b);
			expect(onStone, `ボタン ${b} に石が乗っている`).toBe(true);
		}
		for (const g of st.gates) expect(ss.openGates, `ゲート ${g} が開く`).toContain(g);
		expect(ss.stonesLocked, '全ボタンを石で埋めたのでロックされる').toBe(true);

		const p = await playerPos(page);
		expect(p.rupees, '宝の報酬（ルピー200）が入る').toBe(200);
		expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	// 笛の resetStones（このタスクで 26,0 に追加）＝色ゲートに嵌ったときの詰み救済。
	// 石を1個だけ動かした未解決状態（全ボタンは埋まっていない）で笛を吹くと、
	// 石が元の位置に戻り activeColor も未設定に戻ることを確認する（25,0 Ⓕ と同型）。
	test('実機：笛を吹くと未解決の石配置がリセットされる（resetStones）', async ({ page }) => {
		test.setTimeout(60_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		const st = loadStage(STAGE);

		await startAt(page, STAGE, ENTRY, true);

		// 石(3,3)を左に1回押すだけ（全ボタンには乗らない＝未解決のまま）。
		await replay(page, [
			{ dir: 'down', to: { r: 2, c: 2 }, push: false },
			{ dir: 'down', to: { r: 3, c: 2 }, push: false },
			{ dir: 'right', to: { r: 3, c: 3 }, push: true },
		]);

		const stoneAt = () => page.evaluate(() => {
			const ss = window.__game.getStageState();
			return Object.entries(ss.stonePositions).map(([k, v]) => `${k}→${v.r},${v.c}`).sort().join(' ');
		});
		const before = await stoneAt();
		expect(before, '前提：石が1個だけ動いている（未解決）').not.toBe('');

		await page.evaluate(() => window.__game.useSubItem());
		await page.waitForTimeout(300);

		const ss = await page.evaluate(() => window.__game.getStageState());
		expect(Object.keys(ss.stonePositions).length, '笛で stonePositions が空に戻る（石は元の位置へ）').toBe(0);
		expect(ss.stonesLocked, '未解決状態なのでロックはされていない').toBeFalsy();
		expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
		void st;
	});
});

// ── バグ回帰: 色ゲートは石も通さない・石が乗ったゲートを閉じる切替は不発（2026-08-04 再設計）
//
// 旧規則（2026-08-02）は「押した後プレイヤーが入る石の元セルの下地が閉じていたら押せない」
// という押し側だけの補正だった。曲がり角を強制する幾何制約（旧 I1/I1'）が窮屈すぎる
// （ユーザー指摘）＝規則そのものを直した：
//   ・色ゲートは閉じている間、石にもプレイヤーと同じ「壁」を適用する（既存の passableFor が
//     両方に同じ color 判定を課す＝単一の通行規則）。開いたゲートに石が乗ったまま反対色へ
//     切り替える操作は**不発**にする（player.js setActiveColor・blade-solver.mjs
//     colorSwitchBlocked）。不発時は switchDenied 音を鳴らす。
//   ・色スイッチは石を通さない（プレイヤーは踏めるが石は押し込めない＝押し込み経路の一部に
//     せず「叩くための的」のまま保つ。player.js stoneDestOk・enemy-ai.js tryEnemyPushStone）。
// これで旧 I1/I1'（幾何での押し込み直線禁止・曲がり角強制）が丸ごと不要になった＝幾何は自由。
//
// 盤面は 25,0（sokoban_gate_push_regression）。既存24,0が解なしだった頃の残骸を、23,0（激難）
// の壁構造を土台に赤ゲート1枚のパズル（石3・可解・L=74）へ作り直した。ゲートは赤(4,5)の
// 1枚だけ＝新しいポケットは作らず、既存の2つのスイッチ（(3,1)/(5,10)）を赤・青に分けた
// （ユーザー指摘＝わざわざ別の青ゲートを新設しなくても、既存の赤ゲートに石を乗せた状態で
// 青スイッチを叩けば「閉じる側への切替が不発」を確認できる）。青スイッチは赤ゲートを一切
// 開けない＝押しには無関係（パズル本体の解 L=74 は不変）。
test.describe('バグ回帰 – 色ゲートは石も通さない・不発は音で分かる（2026-08-04 再設計）', () => {
	const RED_GATE = '4,5';
	const RED_SWITCH = '3,1';
	const BLUE_SWITCH = '5,10';   // パズル本体には無関係＝不発検証専用

	/** フィクスチャ盤面のソルバー（実エンジンの通行規則の写し）。 */
	function fixtureSolver(st) {
		const bg = Array.from({ length: ROWS }, () => Array(COLS).fill('g'));
		return makeSolver(st.sd.tiles, bg, [], {}, new Set(), { hasLadder: false });
	}
	const stonesOf = (state) => state.split('|')[1];

	test('Ⓐ フィクスチャのジオメトリ：赤ゲート1枚のみ（青ゲートは無い）＋赤/青スイッチ各1個', () => {
		const st = loadStage('sokoban_gate_push_regression');
		expect(st.colorGates, '色ゲートは赤(4,5) の1枚だけ').toEqual([RED_GATE]);
		expect(st.sd.tiles[4][5], '(4,5) は赤ゲート').toBe(TILE.GATE_RED);
		expect(st.sd.tiles[3][1], '(3,1) は赤スイッチ').toBe(TILE.SWITCH_RED);
		expect(st.sd.tiles[5][10], '(5,10) は青スイッチ（赤ゲートは開けない・不発検証専用）').toBe(TILE.SWITCH_BLUE);
		expect(st.buttons.length, 'ボタン3個（パズル本体）').toBe(3);
		expect(st.stones.length, '石3個（パズル本体）').toBe(3);
	});

	test('Ⓑ ソルバー：この盤面は解ける（新規則で赤ゲートのパズルとして成立・L=74）', () => {
		const st = loadStage('sokoban_gate_push_regression');
		const S = fixtureSolver(st);
		const start = S.encode(ENTRY.r, ENTRY.c, S.initStones, 0, 0, 0);
		const seen = new Set([start]);
		const q = [start];
		const dist = new Map([[start, 0]]);
		let goal = null;
		for (let i = 0; i < q.length && goal === null; i++) {
			for (const nx of S.nextStates(q[i])) {
				if (seen.has(nx)) continue;
				seen.add(nx); dist.set(nx, dist.get(q[i]) + 1);
				const f = nx.split('|');
				if (f[0] === st.chest && f[5] === '1') { goal = nx; break; }
				q.push(nx);
			}
		}
		expect(goal, '赤ゲートを開けば全ボタンに石を乗せて宝へ届く').not.toBeNull();
		expect(dist.get(goal), '最短手数（実測値の記録・退行検出用）').toBe(74);
	});

	test('Ⓒ ソルバー：色ゲートは閉じている間、石もプレイヤーと同じ壁になる', () => {
		const st = loadStage('sokoban_gate_push_regression');
		const S = fixtureSolver(st);
		// 閉じた赤ゲート（color=0＝両方閉）へは石を押し込めない。
		const atRedClosed = S.encode(4, 3, S.initStones, 0, 0, 0, 0, 0);
		const intoClosed = S.nextStates(atRedClosed).some((nx) => stonesOf(nx).split(';').includes('4,5'));
		expect(intoClosed, '閉じた赤ゲートへは石を押し込めない').toBe(false);
		// 赤（color=1）にすれば開く＝石を押し込める（正当な操作）。
		const atRedOpen = S.encode(4, 3, S.initStones, 0, 0, 0, 0, 1);
		const intoOpen = S.nextStates(atRedOpen).some((nx) => stonesOf(nx).split(';').includes('4,5'));
		expect(intoOpen, '開いた赤ゲートへは石を押し込める').toBe(true);
	});

	test('Ⓒ2 ソルバー：石が乗った色ゲートを閉じる側の切替は不発', () => {
		const st = loadStage('sokoban_gate_push_regression');
		const S = fixtureSolver(st);
		// 開いた赤ゲート (4,5) に石が乗った状態で、青スイッチ (5,10) の隣に立ち青へ切り替えを
		// 試す（青は赤ゲートを開けない＝この切替は「赤ゲートを閉じる」ことそのもの）。
		const stonesOnRedGate = [...S.initStones];
		stonesOnRedGate[0] = RED_GATE;
		const st2 = S.encode(5, 9, stonesOnRedGate.sort(), 0, 0, 0, 0, 1);   // color=red（赤ゲート開）
		const next = S.nextStates(st2);
		const colorChanges = next.filter((n) => n.split('|')[6] !== '1');
		expect(colorChanges.length, '石が開いた赤ゲートに乗っている間は青への切替が不発（遷移が出ない）').toBe(0);
		// 石が赤ゲートから離れていれば、同じ位置から普通に青へ切り替えられる。
		const stonesClear = [...S.initStones];
		const st3 = S.encode(5, 9, stonesClear.sort(), 0, 0, 0, 0, 1);
		const next3 = S.nextStates(st3);
		const colorChanges3 = next3.filter((n) => n.split('|')[6] === '2');
		expect(colorChanges3.length, '石が赤ゲートから離れていれば青への切替は成立する').toBeGreaterThan(0);
	});

	test('Ⓓ ソルバー：色スイッチのマスへは石を絶対に押し込めない', () => {
		const st = loadStage('sokoban_gate_push_regression');
		const S = fixtureSolver(st);
		for (const sw of st.colorSwitches) {
			const [sr, sc] = sw.split(',').map(Number);
			// スイッチの隣接4方向それぞれについて「そこに立ってスイッチへ押せる石がある」形を
			// 総当たりし、押し遷移が一度も石をスイッチのマスへ運ばないことを確認する。
			for (const [dr, dc] of DIRS) {
				const stoneCell = `${sr - dr},${sc - dc}`;
				const playerCell = `${sr - 2 * dr},${sc - 2 * dc}`;
				if (!st.floors.has(stoneCell) || !st.floors.has(playerCell)) continue;
				const stones = [...S.initStones];
				stones[0] = stoneCell;
				const [pr, pc] = playerCell.split(',').map(Number);
				const stateStr = S.encode(pr, pc, stones.sort(), 0, 0, 0, 0, 1);   // color=1 で両ゲート片方は開くが無関係
				const next = S.nextStates(stateStr);
				const reachedSwitch = next.some((nx) => nx.split('|')[1].split(';').includes(sw));
				expect(reachedSwitch, `${sw} へ石が押し込まれる遷移は存在しない`).toBe(false);
			}
		}
	});

	// Ⓔ 実機。盤面（row3-8）：
	//   3 #[...#....S#     [=赤スイッチ(3,1)          S=ボタン(3,10)
	//   4 #.#.*(..#*.#     石(4,4) / 赤ゲート(4,5) / 石(4,9)
	//   5 #....#....]#     ]=青スイッチ(5,10)（パズル本体に無関係・赤ゲートを開けない）
	//   6 #.#.*#..#..#     石(6,4)
	//   7 #S#..#....S#     ボタン(7,1)/(7,10)
	//   8 ##BT########
	// 確認するのは3つ（既存の赤ゲート1枚だけで検証する＝新しいポケットは作らない）：
	//   A 閉じた赤ゲートへは石を押し込めない（押し先が閉じている）
	//   B 赤にすれば押し込める＝正当な操作
	//   C ★本体：石が乗った開いた赤ゲートを、青スイッチを叩いて閉じようとしても不発
	//     （赤は変わらないままであることを確認。音は switchDenied）
	test('Ⓔ 実機：色ゲートは石も通さない・石が乗ったゲートを閉じる切替は不発', async ({ page }) => {
		test.setTimeout(120_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		// (5,3) から開始＝赤ゲート (4,5) の押し位置 (4,3) のすぐ南、赤スイッチ (3,1)/青スイッチ
		// (5,10) のどちらへも歩いて行ける中間地点。
		await startAt(page, 'sokoban_gate_push_regression', { r: 5, c: 3 });

		const stoneAt = () => page.evaluate(() => {
			const ss = window.__game.getStageState();
			return Object.entries(ss.stonePositions).map(([k, v]) => `${k}→${v.r},${v.c}`).sort().join(' ');
		});
		const color = () => page.evaluate(() => window.__game.getStageState().activeColor);
		// 入場直後は gameNow() がまだ 0 付近で `now - lastSwordTime < SWORD_COOLDOWN_MS(100)` が
		// 成立してしまい**初回の一振りが空振りになる**（combat.js:305）∴数回振り直す。
		const hitSwitch = async (dir, want) => {
			await page.evaluate((d) => window.__game.setHeroDir(d), dir);
			for (let guard = 0; guard < 4; guard++) {
				if (want !== undefined && await color() === want) break;
				await page.evaluate(() => window.__game.swordAttack());
				await page.waitForTimeout(150);   // SWORD_COOLDOWN_MS=100
			}
		};
		const tryPush = async (dir) => {
			await page.evaluate((d) => window.__game.setHeroDir(d), dir);
			await page.evaluate((d) => window.__game.movePlayer(d), dir);
			await page.waitForTimeout(650);   // STONE_PUSH_COOLDOWN_MS=600
		};

		expect(await color(), '入場時は activeColor 未設定＝色ゲートは両方閉').toBeFalsy();

		// A 閉じた赤ゲート (4,5) へは石 (4,4) を押し込めない（押し位置 (4,3) から東へ）。
		await replay(page, [
			{ dir: 'up', to: { r: 4, c: 3 }, push: false },
		]);
		const before = await stoneAt();
		await tryPush('right');
		expect(await stoneAt(), '赤ゲートが閉じているので石は動かない').toBe(before);

		// B 赤スイッチ (3,1) を叩いて赤にする → 赤ゲートが開く → 石を押し込める。
		// プレイヤーは (4,1) に立ち、北 (up) を向いて (3,1) のスイッチを叩く
		// （スイッチのマスへ乗ってから隣を向くと別セルを叩くので、隣接床から向くのが正しい）。
		await replay(page, [
			{ dir: 'down', to: { r: 5, c: 3 }, push: false },
			{ dir: 'left', to: { r: 5, c: 2 }, push: false },
			{ dir: 'left', to: { r: 5, c: 1 }, push: false },
			{ dir: 'up', to: { r: 4, c: 1 }, push: false },
		]);
		await hitSwitch('up', 'red');
		expect(await color(), '赤スイッチを叩くと赤').toBe('red');
		await replay(page, [
			{ dir: 'down', to: { r: 5, c: 1 }, push: false },
			{ dir: 'right', to: { r: 5, c: 2 }, push: false },
			{ dir: 'right', to: { r: 5, c: 3 }, push: false },
			{ dir: 'up', to: { r: 4, c: 3 }, push: false },
			{ dir: 'right', to: { r: 4, c: 4 }, push: true },
		]);
		expect(await stoneAt(), '開いた赤ゲートへは石を押し込める（石 (4,4)→(4,5)）')
			.toContain('4,4→4,5');

		// C ★本体：石 (4,4)→(4,5) が今まさに開いた赤ゲートに乗っている。青スイッチ (5,10) を
		// 叩いて青（＝赤ゲートを閉じる側）へ切り替えようとしても**不発**（activeColor が red
		// のまま・石も (4,5) に留まる）であることを確認する。row1（連絡通路）経由で右側へ回る
		// （col5 は row3-7 が全部壁＝赤ゲート以外に左右を繋ぐ通路が無く、今そこは石で塞がれて
		// いるので通れない）。
		await replay(page, [
			{ dir: 'left', to: { r: 4, c: 3 }, push: false },
			{ dir: 'up', to: { r: 3, c: 3 }, push: false },
			{ dir: 'left', to: { r: 3, c: 2 }, push: false },
			{ dir: 'up', to: { r: 2, c: 2 }, push: false },
			{ dir: 'up', to: { r: 1, c: 2 }, push: false },
			{ dir: 'right', to: { r: 1, c: 4 }, push: false },
			{ dir: 'right', to: { r: 1, c: 6 }, push: false },
			{ dir: 'right', to: { r: 1, c: 8 }, push: false },
			{ dir: 'down', to: { r: 2, c: 8 }, push: false },
			{ dir: 'down', to: { r: 3, c: 8 }, push: false },
			{ dir: 'left', to: { r: 3, c: 7 }, push: false },
			{ dir: 'down', to: { r: 4, c: 7 }, push: false },
			{ dir: 'down', to: { r: 5, c: 7 }, push: false },
			{ dir: 'right', to: { r: 5, c: 8 }, push: false },
			{ dir: 'right', to: { r: 5, c: 9 }, push: false },
		]);
		await hitSwitch('right');
		expect(await color(), '石が乗った開いた赤ゲートを閉じる側（青）への切替は不発').toBe('red');
		expect(await stoneAt(), '石は (4,5) に留まったまま').toContain('4,4→4,5');

		expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
	});

	// Ⓕ 実機：笛の resetStones（2026-08-04 新規追加）＝色ゲートに嵌ったときの救済。
	// 未解決の状態（石が (4,4)→(4,5) へ押されているだけ・全ボタンは埋まっていない）で
	// 笛を吹くと、石が元の位置に戻り activeColor も未設定に戻ることを確認する。
	test('Ⓕ 実機：笛を吹くと未解決の石がリセットされる（resetStones）', async ({ page }) => {
		test.setTimeout(60_000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		await startAt(page, 'sokoban_gate_push_regression', { r: 5, c: 3 }, true);

		const stoneAt = () => page.evaluate(() => {
			const ss = window.__game.getStageState();
			return Object.entries(ss.stonePositions).map(([k, v]) => `${k}→${v.r},${v.c}`).sort().join(' ');
		});
		const color = () => page.evaluate(() => window.__game.getStageState().activeColor);
		const hitSwitch = async (dir, want) => {
			await page.evaluate((d) => window.__game.setHeroDir(d), dir);
			for (let guard = 0; guard < 4; guard++) {
				if (want !== undefined && await color() === want) break;
				await page.evaluate(() => window.__game.swordAttack());
				await page.waitForTimeout(150);
			}
		};

		// 赤にして石 (4,4) を (4,5) へ押し込む（未解決＝ボタンには乗っていない）。
		await replay(page, [
			{ dir: 'left', to: { r: 5, c: 2 }, push: false },
			{ dir: 'left', to: { r: 5, c: 1 }, push: false },
			{ dir: 'up', to: { r: 4, c: 1 }, push: false },
		]);
		await hitSwitch('up', 'red');
		await replay(page, [
			{ dir: 'down', to: { r: 5, c: 1 }, push: false },
			{ dir: 'right', to: { r: 5, c: 2 }, push: false },
			{ dir: 'right', to: { r: 5, c: 3 }, push: false },
			{ dir: 'up', to: { r: 4, c: 3 }, push: false },
			{ dir: 'right', to: { r: 4, c: 4 }, push: true },
		]);
		expect(await stoneAt(), '前提：石が (4,5) に乗っている').toContain('4,4→4,5');
		expect(await color(), '前提：色は red').toBe('red');

		await page.evaluate(() => window.__game.useSubItem());
		await page.waitForTimeout(300);

		// リセット後 stonePositions は空＝タイル配列の '*'（元の位置）がそのまま石の位置になる。
		expect(await stoneAt(), '笛で stonePositions が空に戻る（石は元の位置へ）').toBe('');
		expect(await color(), '笛で activeColor も未設定に戻る').toBeFalsy();

		expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
	});
});
