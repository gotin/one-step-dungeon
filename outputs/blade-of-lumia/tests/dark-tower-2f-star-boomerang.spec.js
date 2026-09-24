// tests/dark-tower-2f-star-boomerang.spec.js
// dark_tower 2F 寄道の2室 `2,4`「代償の廊」／`2,5`「星の間」
// （2026-09-24 / PLAN 実行キュー20b ⑤-b）。
//
// 直す前の実測：`2,4` は壺 r(2,4) 1個だけの素の箱（脅威度 0.0）、`2,5` は宝箱1個だけの
// 素の箱（中身＝回復薬（大）＝塔で4室目＝不変条件(e)「塔の回復薬（大）は3室以下」未達）。
// 2室は 2F の階段 `2,3 (8,4)` を通り過ぎた先の**行き止まりの枝**＝本道ではない
// ∴「寄道に入る代償」と「塔でしか手に入らない報酬」の1組にした。
//
// 新しい機構：
//   2,4  5 #........λ.#   ← 爆弾鬼 λ(5,9)=left を1体（脅威度 36.0）。通路 col5/6 には置かない
//        2 #...r......#   ← 床のルピーは残す（寄道に踏み込む小さな誘い）
//   2,5  4 #....B.....#   ← 柱の菱形の中心に宝箱＝中身は**星のブーメラン**（tier 2）
//
// 守るものは4つ。
//
// ① データ（幾何と中身）：両室の盤面・`enemyDirs`・床のルピー・宝の中身・看板ゼロ・封印ゼロ・
//    境界の開き（部屋間の接続を動かしていない）。
// ② データ（機構が成立している）：λ の投擲（range 7 / minRange 2）が**縦の通路の全セル**を
//    覆う＝走り抜ける間ずっと圧がかかる／通路に敵を置いていない＝倒さずに抜けられる。
//    塔の不変条件 (e) 回復薬（大）3室以下・(d3) 1室162以下・(d4) 非ボス合計900以下。
// ③ データ（報酬の唯一性）：星のブーメランの宝箱は塔 2,5 の1つだけ。ティア番号で渡す
//    報酬の全体像（銀＝field 12,19 の寄道／星＝ここ）。
// ④ 挙動（実機・セーブ経由＝debugMode OFF）：宝箱を開けると **未所持からも銀からも**
//    星（tier 2・ATK12）になる＝報酬が**絶対値** `boomerangTier: 2` である理由は
//    「所持 → ティア」が繋がっていないから（`giveSubItem('boomerang')` は
//    `boomerangTier` を触らない∴木を持っていてもティアは -1＝相対指定「今の1段上」は
//    木を2本目として渡すだけになる。DECISIONS 2026-09-24）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GAME_URL, SAVE_KEY } from './helpers.js';
import { TILE } from '../shared/tiles.js';
import { BOOMERANG_TIERS } from '../shared/items.js';
import { ENEMY_META } from '../shared/enemies.js';
import { THREAT_OF, EXTRA_ENEMY_ROOMS } from '../scripts/lib/enemy-placement.mjs';
import { ROWS, COLS } from '../scripts/lib/blade-solver.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const LAYER = 'dark_tower';
const CORRIDOR = '2,4';
const SHRINE   = '2,5';
const OGRE     = '5,9';
const RUPEE    = '2,4';   // 床のルピー（`r`＝TILE.ITEM_RUPEE。壺ではない＝下の解説）
const CHEST    = '4,5';
const HALL_2F  = 72;     // 2F の最重量（`2,3` の λ×2）＝寄道はこれを超えない

const CORRIDOR_ROWS = [
	'#####..#####',
	'#..........#',
	'#...r......#',
	'#..........#',
	'#..........#',
	'#........λ.#',
	'#..........#',
	'#..........#',
	'#..........#',
	'#####..#####',
];
// 柱は「宝箱の列 col5」を軸に左右対称（部屋幅 12 ＝偶数なので部屋の中心 col5.5 とは
// 両立しない）。最初は部屋の枠に合わせて col3..8 に置いたが、実画面で宝箱が菱形の中で
// 左に半マスずれて見えた∴宝箱を軸にし直した（2026-09-24 自己確認）。
const SHRINE_ROWS = [
	'#####..#####',
	'#..........#',
	'#.#.....#..#',
	'#..#...#...#',
	'#....B.....#',
	'#..#...#...#',
	'#.#.....#..#',
	'#..........#',
	'#..........#',
	'############',
];

const rowsOf = (st) => st.tiles.map((r) => (Array.isArray(r) ? r.join('') : r));
const at = (st, cell) => { const [r, c] = cell.split(',').map(Number); return st.tiles[r][c]; };

function edgeSig(rows) {
	const n = [...rows[0]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const s = [...rows[ROWS - 1]].map((ch, c) => (ch !== '#' ? c : -1)).filter((c) => c >= 0);
	const w = rows.map((r, i) => (r[0] !== '#' ? i : -1)).filter((i) => i >= 0);
	const e = rows.map((r, i) => (r[COLS - 1] !== '#' ? i : -1)).filter((i) => i >= 0);
	return `N[${n}] S[${s}] W[${w}] E[${e}]`;
}

const threatOf = (st) => st.tiles.reduce((t, row) =>
	t + row.reduce((u, ch) => u + (ENEMY_META[ch] ? THREAT_OF(ENEMY_META[ch]) : 0), 0), 0);

test.describe('Blade of Lumia – dark_tower 2F 代償の廊／星の間（キュー20b ⑤-b）', () => {
	// ── ① データ（幾何と中身）──────────────────────────────────────────
	test(`データ：${LAYER} ${CORRIDOR}＝代償の廊`, () => {
		const st = map.layers[LAYER].stages[CORRIDOR];
		expect(rowsOf(st)).toEqual(CORRIDOR_ROWS);
		expect(at(st, OGRE), `(${OGRE}) は爆弾鬼 λ`).toBe('λ');
		// λ は directional＝`enemyDirs` が無いと既定の向きで固まる（ENEMY-DIRECTIONAL-GUIDE）
		expect(st.enemyDirs, '通路（col5/6）を正面に見る向き').toEqual({ [OGRE]: 'left' });
		// ⚠️ `r` は壺ではなく `TILE.ITEM_RUPEE`＝拾うだけのルピー（回復しない。壺のタイルは
		//    そもそも無い）。PLAN 20b ⑤-b の「壺（割ると回復）」は誤り＝2026-09-24 に実データで
		//    確認して PLAN も直した。残す理由は「寄道に踏み込む小さな誘い」。
		expect(at(st, RUPEE), `床のルピー (${RUPEE}) は残してある`).toBe(TILE.ITEM_RUPEE);
		expect(threatOf(st), '脅威度 36.0（λ×1）').toBe(36);
		expect(threatOf(st), `2F の最重量 ${HALL_2F}（2,3）を超えない`)
			.toBeLessThanOrEqual(HALL_2F);
		expect(Object.keys(st.chestContents ?? {}), '宝箱は置かない（報酬は隣室）').toEqual([]);
		expect(Object.keys(st.showConditions ?? {}), '封印は無い').toEqual([]);
		expect(Object.keys(st.mapEnters ?? {}), '階段も無い（階段は 2,3）').toEqual([]);
		expect(rowsOf(st).some((row) => row.includes(TILE.SIGN)), "看板タイル 'i' が無い").toBe(false);
		expect(Object.keys(st.signData ?? {}), 'signData も空').toEqual([]);
		expect(edgeSig(rowsOf(st)), '境界の開きは不変').toBe('N[5,6] S[5,6] W[] E[]');
		// 配置表の外の敵部屋は宣言が要る（無いと tests/enemy-placed.js が「ドリフト」と数える）
		expect(EXTRA_ENEMY_ROOMS.some((e) => e.layer === LAYER && e.stage === CORRIDOR),
			'EXTRA_ENEMY_ROOMS に宣言がある').toBe(true);
	});

	test(`データ：${LAYER} ${SHRINE}＝星の間`, () => {
		const st = map.layers[LAYER].stages[SHRINE];
		expect(rowsOf(st)).toEqual(SHRINE_ROWS);
		expect(at(st, CHEST), `菱形の中心 (${CHEST}) は宝箱 'B'`).toBe(TILE.CHEST);
		expect(st.chestContents, '中身は星のブーメラン（絶対値のティア）').toEqual({
			[CHEST]: { type: 'boomerang', boomerangTier: 2, name: '星のブーメラン' },
		});
		// 北の通路 col5 をまっすぐ下りて宝箱の正面に立てる（菱形の縦の口）
		for (const cell of ['1,5', '2,5', '3,5']) {
			expect(at(st, cell), `(${cell}) は床＝通路から正面に立てる`).toBe(TILE.FLOOR);
		}
		// 柱が宝箱 (4,5) を軸に上下左右対称＝実画面で宝箱が菱形の真ん中に見える
		// （⚠️ 部屋の中心 col5.5 を軸にすると宝箱が半マスずれる＝2026-09-24 に見て直した）
		const pillars = [];
		st.tiles.forEach((row, r) => row.forEach((ch, c) => {
			if (ch === TILE.WALL && r > 0 && r < st.rows - 1 && c > 0 && c < st.cols - 1) {
				pillars.push(`${r},${c}`);
			}
		}));
		const set = new Set(pillars);
		expect(pillars.length, '柱は8本').toBe(8);
		const asym = pillars.filter((k) => {
			const [r, c] = k.split(',').map(Number);
			return !set.has(`${r},${10 - c}`) || !set.has(`${8 - r},${c}`);
		});
		expect(asym, '柱は宝箱 (4,5) を軸に上下左右対称').toEqual([]);
		expect(threatOf(st), '守り手は置かない＝素直な報酬').toBe(0);
		expect(Object.keys(st.showConditions ?? {}), '封印（killAll）も課さない').toEqual([]);
		expect(rowsOf(st).some((row) => row.includes(TILE.SIGN)), "看板タイル 'i' が無い").toBe(false);
		expect(Object.keys(st.signData ?? {}), 'signData も空').toEqual([]);
		expect(st.links ?? [], 'links は空').toEqual([]);
		expect(edgeSig(rowsOf(st)), '境界の開きは不変（南は行き止まり）').toBe('N[5,6] S[] W[] E[]');
	});

	// ── ② データ（機構が成立している）────────────────────────────────────
	test(`データ：λ の投擲は ${CORRIDOR} の縦の通路を丸ごと覆う（走り抜ける間ずっと圧）`, () => {
		const { range, minRange } = ENEMY_META['λ'].attack;
		// ⚠️ 期待値の定数（CORRIDOR_ROWS）ではなく**実データ**から測る＝定数を読むと
		//    「λ を通路へ動かした」変更が緑のまま通り抜ける（2026-09-24 の歯の確認で実際に
		//    抜けていた＝③ が緑のままだった）。
		const st = map.layers[LAYER].stages[CORRIDOR];
		const foes = [];
		st.tiles.forEach((row, r) => row.forEach((ch, c) => { if (ENEMY_META[ch]) foes.push([r, c]); }));
		expect(foes.map((p) => p.join(',')), 'λ が1体だけ・位置は実データで確認').toEqual([OGRE]);
		const [or, oc] = foes[0];
		const corridor = [];
		for (let r = 1; r <= 8; r++) for (const c of [5, 6]) corridor.push([r, c]);
		const dists = corridor.map(([r, c]) => Math.hypot(r - or, c - oc));
		expect(Math.max(...dists), `通路の最遠セルも射程 ${range} の内側`).toBeLessThanOrEqual(range);
		expect(Math.min(...dists), `通路の最近セルも下限 ${minRange} の外側（死角を作らない）`)
			.toBeGreaterThanOrEqual(minRange);
		// ⚠️ 通路そのものには敵を置かない＝倒さずに走り抜けられる（20b ④で関門は打ち止め）
		const onLane = corridor.filter(([r, c]) => ENEMY_META[st.tiles[r][c]]);
		expect(onLane, '通路 col5/6 に敵が1体もいない').toEqual([]);
		// 床のルピーも通路の外＝拾いに行くかは任意（行けば投擲の圏内に長く留まる＝代償が増える）
		expect(at(st, RUPEE), `(${RUPEE}) が実データでも床のルピー`).toBe(TILE.ITEM_RUPEE);
		expect(RUPEE.split(',').map(Number)[1], '床のルピーも通路の外の列').not.toBe(5);
	});

	test('データ：塔の不変条件 (e)(d3)(d4) が保たれている', () => {
		const stages = map.layers[LAYER].stages;
		// (e) 回復薬（大）は3室以下＝この部屋の差し替えで 4室 → 3室になった
		const healRooms = Object.entries(stages)
			.filter(([, st]) => Object.values(st.chestContents ?? {})
				.some((cc) => cc?.item === 'bigHealPotion'))
			.map(([k]) => k).sort();
		expect(healRooms, '回復薬（大）は 0,1／0,4／4,4 の3室だけ').toEqual(['0,1', '0,4', '4,4']);
		// (d3) 1室162以下（例外＝`1,2` 二色の錠の間）／(d4) 非ボス合計900以下
		let total = 0;
		for (const [key, st] of Object.entries(stages)) {
			if (st.isBossRoom) continue;
			const t = threatOf(st);
			total += t;
			if (key !== '1,2') expect(t, `${key} の脅威度が 162 以下`).toBeLessThanOrEqual(162);
		}
		expect(total, '塔の非ボス合計は 900 以下').toBeLessThanOrEqual(900);
		expect(total, 'λ を足したので ⑤-a 完了時（858）より重い').toBeGreaterThan(858);
	});

	// ── ③ データ（報酬の唯一性）──────────────────────────────────────────
	test('データ：星のブーメランは塔 2,5 の1つだけ／ティアで渡す報酬の全体像', () => {
		const found = [];
		for (const [lk, lay] of Object.entries(map.layers ?? {})) {
			for (const [sk, s] of Object.entries(lay.stages ?? {})) {
				for (const src of ['chestContents', 'floorItems']) {
					for (const [cell, cc] of Object.entries(s[src] ?? {})) {
						if (cc?.boomerangTier != null) found.push(`${lk}/${sk}(${cell})=${cc.boomerangTier}`);
					}
				}
			}
		}
		expect(found.filter((f) => f.endsWith('=2')), '星（tier2）は塔 2,5 の宝箱だけ')
			.toEqual([`${LAYER}/${SHRINE}(${CHEST})=2`]);
		// 銀（tier1）は field 12,19 の寄道＝**必須ではない**∴塔に来る人が銀を持っている
		// 保証は無い（検証ステージ test_mechanics 19,0 は本編の外）。
		expect(found.filter((f) => f.endsWith('=1') && !f.startsWith('test_mechanics')),
			'銀（tier1）は field 12,19 だけ').toEqual(['field/12,19(2,5)=1']);
		// 木は `type:'item'`＝ティア番号を持たない（下の ④ の前提）
		const wood = [];
		for (const [lk, lay] of Object.entries(map.layers ?? {})) {
			for (const [sk, s] of Object.entries(lay.stages ?? {})) {
				for (const [cell, cc] of Object.entries(s.chestContents ?? {})) {
					if (cc?.item === 'boomerang') wood.push(`${lk}/${sk}(${cell})`);
				}
			}
		}
		expect(wood, "木のブーメランは D2 1,1 の宝箱（type:'item'）だけ").toEqual(['dungeon_2/1,1(3,5)']);
	});
});

// ── ④ 挙動（実機・セーブ経由＝debugMode OFF）──────────────────────────────
/** セーブを仕込んで「つづきから」で入る＝無敵もすり抜けも無い素の状態。 */
async function startAt(page, { stage, row, col, dir = 'down' }) {
	const save = JSON.stringify({
		player: {
			x: col, y: row,
			hp: 20, maxHp: 20, maxHearts: 10, atk: 99, def: 99, keys: 0,
			weapon: 'sword', swordTier: 1, shield: null, armor: null,
			subItems: {}, activeSubItem: null,
			hasLadder: true, maxArrows: 8, maxBombs: 8,
			rupees: 0, triforceCount: 0,
		},
		stageState: {},
		currentLayer: LAYER,
		stageKey: stage,
		heroDir: dir,
	});
	await page.addInitScript(({ k, v }) => {
		try { localStorage.setItem(k, v); } catch { /* noop */ }
	}, { k: SAVE_KEY, v: save });
	await page.goto(GAME_URL);
	await page.locator('#btn-continue').waitFor({ state: 'visible', timeout: 5000 });
	await page.locator('#btn-continue').click();
	await page.waitForFunction(() => {
		const b = document.getElementById('board');
		return !!b && b.children.length > 0;
	});
	await page.evaluate(() => window.__game.pause());   // 実ループを止める＝経路が揺れない
}

const posOf = (page) => page.evaluate(() => {
	const p = window.__game.getState().player;
	return { x: p.x, y: p.y };
});

/** 目標セルへ歩く。`movePlayer` 1回＝半マス（[[blade-moveplayer-is-half-tile]]）。 */
async function moveTo(page, cell, { guard = 40 } = {}) {
	const [tr, tc] = cell.split(',').map(Number);
	let p = await posOf(page);
	if (p.y !== tr && p.x !== tc) throw new Error(`moveTo は1軸ずつ: (${p.y},${p.x}) → (${cell})`);
	const dir = tr < p.y ? 'up' : tr > p.y ? 'down' : tc < p.x ? 'left' : 'right';
	await page.evaluate((d) => window.__game.setHeroDir(d), dir);
	for (let i = 0; i < guard; i++) {
		p = await posOf(page);
		if (p.x === tc && p.y === tr) break;
		await page.evaluate((d) => window.__game.movePlayer(d), dir);
		await page.evaluate(() => window.__game.step(1));
	}
	p = await posOf(page);
	expect(`${p.y},${p.x}`, `(${cell}) へ到達`).toBe(cell);
}

/** ブーメランを1発投げて飛翔中の諸元を返す。 */
const throwSnapshot = (page) => page.evaluate(() => {
	window.__game.useSubItem();
	const p = window.__game.getProjectiles().find((x) => x.type === 'boomerang');
	return p ? { atk: p.atk, speed: p.speed, maxRange: p.maxRange } : null;
});

test.describe('Blade of Lumia – 星の間の宝箱は実機で星を渡す（キュー20b ⑤-b）', () => {
	test('未所持（tier -1）から開けても星のブーメランになる', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { stage: SHRINE, row: 1, col: 5, dir: 'down' });
		// ⚠️ ここが報酬を**絶対値**にした理由の実演＝木を配っていないセーブのティアは -1。
		//    `giveSubItem('boomerang')` を通った人（D2 で拾った人）も同じ -1 になる∴
		//    「今の1段上」では木が渡ってしまう。
		expect(await page.evaluate(() => window.__game.getPlayer().boomerangTier),
			'入室時はティア -1（未所持）').toBe(-1);

		await moveTo(page, CHEST);
		const st = await page.evaluate(() => {
			const p = window.__game.getPlayer();
			return { tier: p.boomerangTier, active: p.activeSubItem, has: !!p.subItems?.boomerang };
		});
		expect(st.tier, '宝箱で tier 2（星）').toBe(2);
		expect(st.has, 'サブアイテムとして所持もする').toBe(true);
		expect(st.active, 'そのまま使える状態になる').toBeTruthy();

		const proj = await throwSnapshot(page);
		expect(proj, '投げられる').not.toBeNull();
		expect(proj.atk, `星の ATK は ${BOOMERANG_TIERS[2].atk}`).toBe(BOOMERANG_TIERS[2].atk);
		expect(proj.maxRange).toBe(BOOMERANG_TIERS[2].maxRange);
		expect(errors).toEqual([]);
	});

	test('銀（tier 1）から開けても星に上がる／もう一度開けても戻らない', async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { stage: SHRINE, row: 1, col: 5, dir: 'down' });
		await page.evaluate(() => window.__game.equipBoomerangTier(1));   // 銀を持って入る
		expect(await page.evaluate(() => window.__game.getPlayer().boomerangTier)).toBe(1);

		await moveTo(page, CHEST);
		expect(await page.evaluate(() => window.__game.getPlayer().boomerangTier),
			'銀 → 星（絶対値なので下位から来ても上がる）').toBe(2);

		// 開けた宝箱に立ち直っても下位へ戻らない（equipBoomerangTier が下位を拒む）
		await moveTo(page, '3,5');
		await moveTo(page, CHEST);
		expect(await page.evaluate(() => window.__game.getPlayer().boomerangTier),
			'再訪でティアが下がらない').toBe(2);
		expect(errors).toEqual([]);
	});

	test(`${CORRIDOR}：爆弾鬼が通路へ爆弾を投げてくる（代償が実機で通る）`, async ({ page }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await startAt(page, { stage: CORRIDOR, row: 1, col: 5, dir: 'down' });
		// ⚠️ スナップショットの座標は `x`/`y`（列/行）＝`r`/`c` ではない（2026-09-24 実測。
		//    `r`/`c` で読むと undefined になり「敵が居ない」と静かに嘘をつく）。
		const foes = await page.evaluate(() => window.__game.getEnemies()
			.map((e) => `${e.type}(${e.y},${e.x})`));
		expect(foes, '爆弾鬼が1体だけ居る').toEqual([`λ(5,9)`]);

		// 通路の途中（射程の内側）で待つと爆弾が飛んでくる。
		// ⚠️ 投擲は cooldown 2160ms ＝実時間で待つ必要がある∴step を多めに回す。
		await moveTo(page, '4,5');
		let bombs = 0;
		for (let i = 0; i < 400 && bombs === 0; i++) {
			await page.evaluate(() => window.__game.step(1));
			bombs = await page.evaluate(() => window.__game.getProjectiles()
				.filter((p) => p.owner === 'enemy').length);
		}
		expect(bombs, '通路に居るプレイヤーへ投擲が飛んでくる').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});
});
