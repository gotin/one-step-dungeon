// tests/enemy-sword-beast.spec.js — Phase 5.5k #7 剣獣（SWORD_BEAST）
//
// 剣獣＝陸上通常敵の最強格（dark_tower[1,2] の戦闘部屋に集める枠）。
// 検証する機構は3つ：
//   ① swordBeam（飛ぶ斬撃）＝縦横が揃ったときだけ owner:'enemy' の 'beam' を飛ばす
//   ② 揃っていないときは撃たない（斜めには飛ばさない＝プレイヤーは列/行を外して避ける）
//   ③ guards:false＝ガード状態機械に乗らない（高機動の敵は立ち止まって構えない）
//
// 検証ステージ＝test_mechanics[27,0]（`sword_beast`）。幾何の芯は水路で隔てること：
// 陸上敵は水に入れない（passable.js enemyTilePassable）が投擲物は飛び越える
// （isTilePassableForProj は壁だけで止まる）∴速度 FAST の剣獣に密着される前に
// 遠隔攻撃だけを観測できる。ステージの詳細は scripts/migrate-test-sword-beast.mjs。
import { test, expect } from '@playwright/test';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { stageKey } from './test-stage-keys.js';

const LAYER = 'test_mechanics';
const KEY   = stageKey('sword_beast'); // '27,0'
const BEAST_TILE = 'μ';
const BEAST_R = 4, BEAST_C = 8;   // 剣獣の初期位置（東の廊下）

// hp/maxHp を上げられるようにしてある：飛ぶ斬撃は 3 ダメージ ∴ hp6 のままだと
// 2 発で gameover になり、gameover 中は step() が世界を止める（game.js gameTick の
// 早期 return）＝「そのあと近接モードが来る」といった**時間の経過そのものが観測できない**。
// ⚠️ hp を上げるのは「時間を進めるため」だけ。難易度の主張には使わない。
async function startAt(page, { x, y, dir = 'right', hp = 6, maxHp = 6, stage = KEY }) {
	await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
		key: SAVE_KEY,
		value: JSON.stringify({
			player: {
				x, y, hp, maxHp, maxHearts: Math.max(3, Math.ceil(maxHp / 2)),
				atk: 2, def: 0, keys: 0,
				weapon: 'sword', swordTier: 0,
				shield: null, shieldTier: -1, armor: null,
				subItems: {}, activeSubItem: null,
				rupees: 0, triforceCount: 0,
			},
			stageState: {},
			currentLayer: LAYER,
			stageKey: stage,
			heroDir: dir,
		}),
	});
	await page.goto(GAME_URL);
	const cont = page.locator('#btn-continue');
	await cont.waitFor({ state: 'visible', timeout: 5000 });
	await cont.click();
	await page.waitForTimeout(200);
	// 盤面が出たら即止める（走らせると剣獣は速度 FAST で寄ってくる）。
	await page.evaluate(() => window.__game.pause());
}

const getBeast = (page) => page.evaluate(
	(t) => window.__game.getEnemies().find(e => e.type === t),
	BEAST_TILE,
);
const enemyBeams = (page) => page.evaluate(
	() => window.__game.getProjectiles().filter(p => p.owner === 'enemy' && p.type === 'beam'),
);
const playerHp = (page) => page.evaluate(() => window.__game.getState().player.hp);

async function stepN(page, n) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__game.step(1)); }

// n tick 進めながら敵ビームを集める（cooldown 1500ms / TICK_MS 120ms ∴ 初弾まで十数tick）。
async function collectBeams(page, ticks) {
	const seen = [];
	for (let i = 0; i < ticks; i++) {
		await page.evaluate(() => window.__game.step(1));
		for (const b of await enemyBeams(page)) {
			if (!seen.some(s => s.id === b.id)) seen.push(b);
		}
	}
	return seen;
}

test.describe('Phase 5.5k #7 – 剣獣（SWORD_BEAST）', () => {
	test('検証ステージに剣獣が1体だけ居る（ステージ幾何の裏取り）', async ({ page }) => {
		await startAt(page, { x: 2, y: 4 });
		const list = await page.evaluate(
			(t) => window.__game.getEnemies().filter(e => e.type === t),
			BEAST_TILE,
		);
		expect(list.length, '剣獣は1体').toBe(1);
		// ⚠️ 初期位置ぴったりを assert してはいけない＝Continue クリック後 pause() までの
		// 実時間（200ms）で速度 FAST の剣獣は既に西へ動いている（実測 x=7.5）。
		// 動かない不変条件（廊下の行・水路を渡れないこと）だけを見る。
		expect(list[0].y, `剣獣は row ${BEAST_R} の廊下から出られない`).toBeCloseTo(BEAST_R, 1);
		expect(list[0].x, '水路（col 5）より東・初期位置より西には来ている').toBeGreaterThan(5.5);
		expect(list[0].x).toBeLessThanOrEqual(BEAST_C);
	});

	test('水路越しに行が揃うと飛ぶ斬撃（owner:enemy の beam）を撃つ', async ({ page }) => {
		// プレイヤー(4,2) と剣獣(4,8) は row 4 で揃う＝距離 6（minRange 2.5 以上・range 9 以内）。
		await startAt(page, { x: 2, y: 4 });
		const beams = await collectBeams(page, 40);
		expect(beams.length, `飛ぶ斬撃が観測されるはず（40tick）`).toBeGreaterThan(0);
		// 西（プレイヤー側）へ真横に飛ぶ＝斜め成分を持たない。
		expect(beams[0].dx, 'プレイヤーの居る西向き（dx=-1）').toBe(-1);
		expect(beams[0].dy, '縦成分は持たない').toBe(0);
		expect(beams[0].atk, '威力は ENEMY_META.atk（剣獣=3）').toBe(3);
	});

	test('飛ぶ斬撃は水路を飛び越えてプレイヤーに当たる（陸上敵が渡れない距離でも削られる）', async ({ page }) => {
		await startAt(page, { x: 2, y: 4 });
		const before = await playerHp(page);
		let hp = before;
		for (let i = 0; i < 80 && hp === before; i++) {
			await page.evaluate(() => window.__game.step(1));
			hp = await playerHp(page);
		}
		expect(hp, '飛ぶ斬撃が水路越しに命中して hp が減るはず').toBeLessThan(before);
		// 近接ではないことの裏取り＝剣獣は水路（col 5）を渡れず東側に留まっている。
		const b = await getBeast(page);
		expect(b.x, '剣獣は水路を渡れない＝col 6 より東に留まる').toBeGreaterThan(5.5);
	});

	test('行も列も揃っていなければ撃たない（空虚でない陰性＝陽性と同じtick数で見る）', async ({ page }) => {
		// プレイヤー(2,2)。剣獣は east 廊下 row 4 の cols 6-10 にしか居られない
		// （migrate スクリプトが幾何を検査済み）∴|dy|=2, |dx|>=4＝永遠に揃わない。
		await startAt(page, { x: 2, y: 2 });
		const beams = await collectBeams(page, 40);
		expect(beams.length, '斜めには撃たない').toBe(0);
		const b = await getBeast(page);
		expect(Math.abs(b.y - 2), '剣獣は row 4 の廊下から出られない').toBeGreaterThanOrEqual(1);
	});

	test('guards:false＝近接されても構えない（ガード状態に入らずダメージも無効化しない）', async ({ page }) => {
		// 東の廊下の中（4,10）から寄らせる。二相化（2026-08-12）後は最初の近接モードが
		// 最悪 40 tick 目に来る ∴ 60 tick 見る（Atk ポーズは遠隔モードの斬撃でも出る）。
		await startAt(page, { x: 10, y: 4, dir: 'left' });
		let sawGuard = false, sawAtkPose = false;
		for (let i = 0; i < 60; i++) {
			await page.evaluate(() => window.__game.step(1));
			const b = await getBeast(page);
			if (b.guarding || b.sprite?.endsWith('Guard')) sawGuard = true;
			if (b.sprite?.endsWith('Atk')) sawAtkPose = true;
		}
		expect(sawGuard, 'guards:false の敵は構えない').toBe(false);
		expect(sawAtkPose, '近接圏に入れば攻撃ポーズは出る（＝近づいている＝空虚でない）').toBe(true);
	});

	test('構えないので正面から剣で殴れば必ずダメージが通る（ガードで無効化されない）', async ({ page }) => {
		// 近接モードの窓を待つ間に飛ぶ斬撃で死なないよう hp を上げる（下の startAt の注記）。
		await startAt(page, { x: 10, y: 4, dir: 'left', hp: 90, maxHp: 90 });
		// 剣獣が SWORD_REACH(1.2) 圏へ寄るまで進める。
		// ⚠️ 2026-08-12 以降は**近接モードの窓が来るまで寄って来ない**（遠隔モード中は
		// keepMin 3.0 を保つ）。遠隔 3000ms ＋ 位相ずれ（最大 rangedMs+meleeMs=4800ms）
		// ∴最初の近接モードは最悪 40 tick 目に始まる ∴ 60 tick 待つ。
		let b = null;
		for (let i = 0; i < 60; i++) {
			await page.evaluate(() => window.__game.step(1));
			b = await getBeast(page);
			if (Math.abs(b.x - 10) <= 1.2 && Math.abs(b.y - 4) < 0.5) break;
		}
		expect(Math.abs(b.x - 10), '剣獣が剣の届く距離まで寄るはず').toBeLessThanOrEqual(1.2);
		const hpBefore = b.hp;
		await page.evaluate(() => window.__game.setHeroDir('left'));
		await page.evaluate(() => window.__game.swordAttack());
		await stepN(page, 1);
		const after = await getBeast(page);
		expect(after.hp, '構えない敵は正面からでもダメージが通る').toBeLessThan(hpBefore);
	});

	test('向き別スプライト機構に乗っている（swordBeast{D,R,U} 系が解決される・Guard は存在しない）', async ({ page }) => {
		await startAt(page, { x: 2, y: 4 });
		await stepN(page, 5);
		const b = await getBeast(page);
		expect(b.sprite, 'directional:true＝向き別の名前が解決される').toMatch(/^swordBeast[DRU]/);
		expect(b.sprite?.endsWith('Guard'), 'Guard フレームは持たない').toBe(false);
	});
});

// ── 2026-08-12 ユーザー指摘の4点（遮蔽ゼロの闘技場 28,0 で測る）───────────────
//   ① 攻撃動作中は動かない（攻撃硬直）
//   ② 遠隔攻撃を持つのに 1 セルまで詰めてくる＝常にくっついてくる → 遠隔／近接の二相
//   ③ 飛ぶ斬撃をまったく撃ってこない → 遠隔モード中は minRange より外を保つので撃てる
//   ④ 追従が完璧すぎて逃げ切れない → プレイヤーより遅い（speed 0.85）＋硬直で隙ができる
// 幾何が遮蔽ゼロ（scripts/migrate-test-sword-beast-arena.mjs が検査）＝
// 敵が止まった/離れたのは壁のせいではなく AI のせい、と言い切れる。
test.describe('Phase 5.5k #7 – 剣獣の遠隔／近接の二相と攻撃硬直（開けた闘技場）', () => {
	const ARENA = stageKey('sword_beast_arena'); // '28,0'
	// 硬直の観測に必要な hp（斬撃3ダメージで死ぬと step が止まって時間が進まない）
	const TOUGH = { hp: 90, maxHp: 90 };

	const snap = (page) => page.evaluate(() => {
		const e = window.__game.getEnemies().find(x => x.type === 'μ');
		const p = window.__game.getState().player;
		return {
			now: window.__game.getState().gameTime,
			x: e.x, y: e.y, sprite: e.sprite, cmode: e.cmode, freezeUntil: e.freezeUntil,
			px: p.x, py: p.y,
			dist: Math.hypot(p.x - e.x, p.y - e.y),
		};
	});

	test('攻撃動作中は動かない（攻撃硬直の窓では座標が1ミリも変わらない）', async ({ page }) => {
		await startAt(page, { x: 2, y: 4, dir: 'right', stage: ARENA, ...TOUGH });
		let frozenSamples = 0;
		let prev = await snap(page);
		for (let i = 0; i < 90; i++) {
			await page.evaluate(() => window.__game.step(1));
			const s = await snap(page);
			// 「この tick が硬直か」は **直前の tick が持っていた期限** と **この tick の now**
			// で判定する。gameTick は「移動 → enemyAttack（ここで初めて _freezeUntil =
			// now + 360 が立つ）」の順に走る ∴ 攻撃した tick 自身は期限を持つが既に移動済み。
			// prev.now で判定すると硬直明けの tick まで巻き込んで 1 tick 多く縛る
			// （実測 t=66 で x 3.5→3.0 を誤検出した）。
			if (prev.freezeUntil != null && s.now < prev.freezeUntil) {
				expect(s.x, `硬直中に x が動いた（t=${i}）`).toBe(prev.x);
				expect(s.y, `硬直中に y が動いた（t=${i}）`).toBe(prev.y);
				frozenSamples++;
			}
			prev = s;
		}
		// 空虚でない陰性の担保＝硬直窓そのものが観測できていること
		expect(frozenSamples, '硬直窓が一度も立たないなら上の assert は何も守っていない')
			.toBeGreaterThan(3);
	});

	test('遠隔モードでは minRange より内側に入らない＝遮蔽ゼロでも飛ぶ斬撃を撃ってくる', async ({ page }) => {
		// プレイヤー(4,2)・剣獣(4,9)＝row 4 で揃い距離 7（keepMax 6.5 の外＝まず寄る）。
		await startAt(page, { x: 2, y: 4, dir: 'right', stage: ARENA, ...TOUGH });
		const beams = [];
		let rangedSamples = 0;
		let minRangedDist = Infinity;
		for (let i = 0; i < 40; i++) {
			await page.evaluate(() => window.__game.step(1));
			const s = await snap(page);
			if (s.cmode === 'ranged') {
				rangedSamples++;
				minRangedDist = Math.min(minRangedDist, s.dist);
			}
			for (const b of await enemyBeams(page)) if (!beams.some(x => x.id === b.id)) beams.push(b);
		}
		expect(rangedSamples, '遠隔モードの tick が観測できている').toBeGreaterThan(10);
		// swordBeam の minRange は 2.5。keepMin 3.0 を保つので、半セル刻みの揺れを含めても
		// 2.5 を割らない＝遠隔モード中は常に「撃てる間合い」に居る。
		expect(minRangedDist, '遠隔モード中に minRange(2.5) より近づいてはいけない').toBeGreaterThanOrEqual(2.5);
		expect(beams.length, '遮蔽が無くても（＝水路トリック無しでも）飛ぶ斬撃が出る').toBeGreaterThan(0);
	});

	test('遠隔↔近接が交互に切り替わる（近接の窓だけ間合いを詰めてくる）', async ({ page }) => {
		await startAt(page, { x: 2, y: 4, dir: 'right', stage: ARENA, ...TOUGH });
		const seq = [];       // モードの遷移列
		let minMelee = Infinity, minRanged = Infinity;
		// 遠隔モードの間合いは「モードが変わった直後」では測れない。近接の窓の終わりで
		// 剣獣は距離 1.0 に居る ∴ 遠隔へ戻った瞬間はまだ 1.0〜1.5 で、keepMin 3.0 まで
		// 退がるのに 0.425 セル/tick で 5〜8 tick かかる（これは「詰めてくる」ではなく
		// 「退がる途中」）。∴ 切替から 10 tick 以上経った**落ち着いた**遠隔サンプルを見る。
		const SETTLE_TICKS = 10;
		let settled = 0, sinceFlip = 0;
		for (let i = 0; i < 100; i++) {
			await page.evaluate(() => window.__game.step(1));
			const s = await snap(page);
			if (seq[seq.length - 1] !== s.cmode) { seq.push(s.cmode); sinceFlip = 0; }
			else sinceFlip++;
			if (s.cmode === 'melee')  minMelee  = Math.min(minMelee, s.dist);
			if (s.cmode === 'ranged' && sinceFlip >= SETTLE_TICKS) {
				minRanged = Math.min(minRanged, s.dist);
				settled++;
			}
		}
		expect(seq.slice(0, 3), '遠隔→近接→遠隔と巡る').toEqual(['ranged', 'melee', 'ranged']);
		expect(minMelee, '近接モードでは剣の間合い(1.5)まで詰めてくる').toBeLessThanOrEqual(1.5);
		expect(settled, '落ち着いた遠隔サンプルが取れている（空虚でない）').toBeGreaterThan(5);
		// 落ち着いた遠隔モード中は swordBeam の minRange(2.5) より内側に入らない
		// ＝「遠隔攻撃を持つのに 1 セルまで詰めてくる」状態ではない。
		expect(minRanged, '遠隔モードでは詰めてこない（撃てる間合いを保つ）').toBeGreaterThanOrEqual(2.5);
	});

	test('密着から真っすぐ逃げれば振り切れる（追従はプレイヤーと同速ではない）', async ({ page }) => {
		// ⚠️ 測定の幾何が要点。ユークリッド距離だけを見ると**縦のずれ**が混ざって
		// 「逃げているのに距離が縮む」ように見える（実測：遠隔モード中に剣獣が row 1 まで
		// 退がっていて、近接モードでその縦 3 セルを食いながら追ってくる ∴ dist 3.0→2.12）。
		// ∴ **食える縦横のずれが残っていない状態＝近接モードで密着（dist ≤ 1.5＝剣の間合い）**
		// まで待ってから測る（行が揃っているとは限らない：剣獣は真上の隣接セルから斬ってくる
		// こともある。密着していれば向きに関係なくずれの余地は無い）。
		// プレイヤーはその間立ち止まる（hp 90 ＝ 無敵 1500ms 込みで 200 tick 耐える）。
		await startAt(page, { x: 8, y: 4, dir: 'left', stage: ARENA, ...TOUGH });
		let s = await snap(page);
		let waited = 0;
		const contact = (t) => t.cmode === 'melee' && t.dist <= 1.5;
		while (waited < 200 && !contact(s)) {
			await page.evaluate(() => window.__game.step(1));
			s = await snap(page);
			waited++;
		}
		expect(contact(s), `近接モードで密着するのを待てているか（cmode=${s.cmode} dist=${s.dist.toFixed(2)} waited=${waited}）`).toBe(true);

		// 左キーを押しっぱなしで逃げる（processHeldKeys が毎tick 0.5セル動かす＝実操作と同じ）。
		// 12 tick ＝プレイヤーは 6 セル西へ（x 8→2）＝壁(col 0)に張り付く前に測り終わる。
		const start = s;
		let beastCells = 0, playerCells = 0;
		await page.evaluate(() => window.__game.queueInput('left'));
		let prev = s;
		for (let i = 0; i < 12; i++) {
			await page.evaluate(() => window.__game.step(1));
			const t = await snap(page);
			beastCells  += Math.abs(t.x - prev.x) + Math.abs(t.y - prev.y);
			playerCells += Math.abs(t.px - prev.px) + Math.abs(t.py - prev.py);
			prev = t;
		}
		await page.evaluate(() => window.__game.releaseInput('left'));
		const after = prev;

		expect(playerCells, 'プレイヤーは実際に走っている（測定が空虚でない）').toBeGreaterThan(5.5);
		expect(after.px, '壁(col 0)に張り付く前に測り終わっている').toBeGreaterThan(1);
		expect(beastCells, '剣獣も止まってはいない（＝追ってくる敵を測っている）').toBeGreaterThan(1);
		// 速度 0.85（＋硬直）＝ accum が 1.0 を超えた tick だけ 0.5 セル動く ∴ 12 tick で
		// 約 5.0 セル（プレイヤーは 6.0）。
		// ⚠️ 歯の実測（2026-08-12）：速度を ENEMY_SPEED_FAST（1.0）に戻すと**赤くなるのは
		// 下の「間合いが開く」assert**（1.50→1.80 しか開かない）。移動量の方は硬直で削られる
		// ので同速でも通ってしまう ∴ 「振り切れる」ことの担保は下の assert が本体。
		expect(beastCells, `剣獣の移動量はプレイヤーより少ない（beast=${beastCells.toFixed(2)} / player=${playerCells.toFixed(2)}）`)
			.toBeLessThanOrEqual(playerCells * 0.9);
		expect(after.dist, `密着から逃げれば間合いが開く（before=${start.dist.toFixed(2)}）`)
			.toBeGreaterThan(start.dist + 0.5);
	});
});
