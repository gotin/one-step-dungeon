// 実行キュー49 — field の敵の「強さの段」と、敵の少ない画面を埋める配置の番人
//
// 単一の真実＝scripts/lib/field-enemy-tiers.mjs（段の計算・上限・置ける敵・配置表・空けておく画面）。
// 盤面へ書くのは scripts/migrate-field-enemies-fill.mjs。
//
// ① 段の計算が設計（PLAN キュー49）どおりか
// ② field の全画面で、脅威度が段の上限以内・置いてある敵がその段で置ける敵か
// ③ 配置表の敵が盤面に在る（表と盤面のずれ＝手編集のドリフトを検出）
// ④ 敵0体の画面の数のラチェット（地域を1つ埋めるたびに締める）
// ⑤ 実機：配置表の画面を開くと、表どおりの数・種類の敵が出る

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { ENEMY_META, isEnemyTile } from '../shared/enemies.js';
import { stageThreat } from '../scripts/lib/enemy-placement.mjs';
import {
	tierOf, distanceTier, TIER_THREAT_CAP, CAP_EXEMPT, enemiesAllowedAt,
	FIELD_ENEMY_FILL, KEEP_EMPTY,
} from '../scripts/lib/field-enemy-tiers.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const MAP = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const STAGES = MAP.layers.field.stages;
const enemiesOf = (s) => s.tiles.flat().filter(isEnemyTile);

// 敵0体で、KEEP_EMPTY にも載っていない画面の数の上限。地域を1つ埋めるたびに締める。
// 2026-10-12：キュー49 着手前 211 → ① G0 村まわりで 204。最終目標＝0（空けておく画面は全部 KEEP_EMPTY に理由つきで載せる）。
const UNFILLED_ZERO_BASELINE = 204;

test.describe('① 強さの段の計算', () => {
	test('距離の段の境目', () => {
		expect([1, 3, 4, 7, 8, 11, 12, 15, 16, 22].map(distanceTier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
	});

	test('村まわりは段1・沼の村側の端は段1で奥ほど上がる・北の塔の周りは段5', () => {
		expect(tierOf('7,14')).toBe(1); // 村
		expect(tierOf('9,15')).toBe(1); // 沼 P の村側の端（距離3）
		expect(tierOf('11,17')).toBe(3); // 沼 P の奥（距離7・地域4 → ceil(6/2)）
		expect(tierOf('7,0')).toBe(5); // 空島 K（距離14・地域5 → ceil(9/2)）
		expect(tierOf('0,0')).toBe(4); // 森 F の北西の隅（距離21・地域3 → 4）
	});

	test('field の全画面に段が付く（知らない地域ラベルで落ちない）', () => {
		for (const k of Object.keys(STAGES)) expect([1, 2, 3, 4, 5]).toContain(tierOf(k));
	});
});

test.describe('② 段の上限と置ける敵（field 全画面）', () => {
	test('1画面の脅威度が段の上限以内（CAP_EXEMPT を除く）', () => {
		const over = [];
		for (const [k, s] of Object.entries(STAGES)) {
			const t = stageThreat(s, ENEMY_META);
			if (t > TIER_THREAT_CAP[tierOf(k)] && !CAP_EXEMPT[k]) over.push(`${k}(段${tierOf(k)} ${t})`);
		}
		expect(over).toEqual([]);
	});

	test('置いてある雑魚がその画面の段で置ける敵', () => {
		const bad = [];
		for (const [k, s] of Object.entries(STAGES)) {
			const allowed = enemiesAllowedAt(tierOf(k));
			for (const ch of enemiesOf(s)) if (!ENEMY_META[ch].isBoss && !allowed.has(ch)) bad.push(`${k}:${ch}`);
		}
		expect(bad).toEqual([]);
	});

	test('KEEP_EMPTY の画面には敵が居ない', () => {
		for (const k of Object.keys(KEEP_EMPTY)) expect(enemiesOf(STAGES[k]), k).toEqual([]);
	});
});

test.describe('③ 配置表と盤面', () => {
	test('配置表の敵が表どおりのセルに在る', () => {
		for (const { stage, place } of FIELD_ENEMY_FILL) {
			const s = STAGES[stage];
			for (const [ch, cells] of Object.entries(place)) {
				for (const cell of cells) {
					const [r, c] = cell.split(',').map(Number);
					expect(s.tiles[r][c], `${stage} (${cell})`).toBe(ch);
					if (ENEMY_META[ch].move === 'water') expect(s.bgTiles?.[cell], `${stage} (${cell}) は水`).toBe('~');
				}
			}
		}
	});

	test('配置表の敵は画面の端から2マス以内に居ない', () => {
		for (const { stage, place } of FIELD_ENEMY_FILL) {
			const s = STAGES[stage];
			for (const cells of Object.values(place)) {
				for (const cell of cells) {
					const [r, c] = cell.split(',').map(Number);
					expect(r >= 2 && c >= 2 && r <= s.rows - 3 && c <= s.cols - 3, `${stage} (${cell})`).toBe(true);
				}
			}
		}
	});
});

test('④ 敵0体のまま残っている画面の数のラチェット', () => {
	const unfilled = Object.entries(STAGES).filter(([k, s]) => enemiesOf(s).length === 0 && !KEEP_EMPTY[k]);
	expect(unfilled.length).toBeLessThanOrEqual(UNFILLED_ZERO_BASELINE);
});

test.describe('⑤ 実機：配置表の画面を開くと表どおりの敵が出る', () => {
	const GAME = '/blade-of-lumia/game/';
	for (const { stage } of FIELD_ENEMY_FILL) {
		test(`field ${stage}`, async ({ page }) => {
			const errors = [];
			page.on('pageerror', (e) => errors.push(e.message));
			const s = STAGES[stage];
			const want = enemiesOf(s).sort();
			// 開始セル＝敵から離れた行1 の床（プレビューは debug＝通行自由だが、床から始める）。
			const col = s.tiles[1].findIndex((ch) => ch === '.');
			const q = new URLSearchParams({ fromEditor: '1', layer: 'field', stage, row: '1', col: String(col) });
			await page.goto(`${GAME}?${q}`);
			await waitForBoard(page);
			await page.waitForFunction((n) => window.__game.getEnemies().length === n, want.length);
			const types = await page.evaluate(() => window.__game.getEnemies().map((e) => e.type));
			expect(types.sort()).toEqual(want);
			expect(errors).toEqual([]);
		});
	}
});
