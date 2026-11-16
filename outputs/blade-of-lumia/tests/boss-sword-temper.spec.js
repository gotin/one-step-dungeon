// キュー110：ボスが強い剣に「溶ける」のを抑える規則（shared/boss-sword-temper.js）の番人。
//
// ユーザーの条件（2026-11-15）＝「剣がつよくなったほうがそうじゃないときより難しくなるようなことは
// したくない。基本剣が強い方が有利にはしたい」。
//   ① 監査（scripts/audit-balance.mjs --json）＝ボス部屋のボスは全部、5本の剣の順に振り数が必ず減る・
//      周回の ×1.2 を混ぜても増えない／ザーネルは最強の剣でも 20 振り以上（溶けない）・木の剣は 60 のまま
//   ② 決まり（純関数）＝木の剣以下は抑えない・道具（矢・爆弾・炎・ブーメラン）は抑えない・
//      ボス部屋の外（道中の中ボス）は抑えない・端数を持ち越す（聖剣とルミアの剣が同じ数に並ばない）
//   ③ 実機＝ボス部屋で聖剣の剣は抑えた数だけ減る・矢は素のまま／ボス部屋の外では剣も素のまま
import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { waitForBoard } from './helpers.js';
import { ENEMY_META } from '../shared/enemies.js';
import {
	isTempered, temperFactor, temperDamage, swingsToKill, swordAtkOfTier,
} from '../shared/boss-sword-temper.js';

const repoFile = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const MAP = JSON.parse(readFileSync(repoFile('../work/blade-of-lumia.json'), 'utf8'));
const REPORT = JSON.parse(execFileSync('node', [repoFile('../scripts/audit-balance.mjs'), '--json'], {
	cwd: repoFile('..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}));

test.describe('① 監査：剣の順', () => {
	test('ボス部屋のボスは全部、剣が強いほど振り数が減る（崩れ 0 件）', () => {
		expect(REPORT.swordOrder.length).toBeGreaterThanOrEqual(13);
		expect(REPORT.swordOrderViolations).toEqual([]);
	});

	test('ザーネル＝木の剣は 60 振りのまま・最強の剣でも 20 振り以上', () => {
		const z = REPORT.swordOrder.find((s) => s.tile === 'Z');
		const plain = z.cols.filter((c) => !c.cleared).sort((a, b) => a.tier - b.tier);
		expect(plain[0].swings).toBe(60);
		expect(plain.at(-1).swings).toBeGreaterThanOrEqual(20);
		expect(plain.at(-1).swings).toBeLessThan(plain[0].swings / 2);
	});

	test('欠陥 0 件（max で出ていた BOSS_MELT も消える）', () => {
		expect(REPORT.defects).toEqual([]);
		const melt = REPORT.encounters.filter((r) => r.maxOnlyFlags.includes('BOSS_MELT')).map((r) => r.tile);
		expect(melt).toEqual([]);
	});
});

test.describe('② 決まり', () => {
	test('対象＝ボス部屋のボスへの剣とビームだけ', () => {
		const z = ENEMY_META.Z;
		expect(isTempered(z, 'sword', true)).toBe(true);
		expect(isTempered(z, 'beam', true)).toBe(true);
		for (const t of ['arrow', 'bomb', 'fire', 'boomerang', undefined]) expect(isTempered(z, t, true)).toBe(false);
		expect(isTempered(z, 'sword', false), '道中（ボス部屋の外）は抑えない').toBe(false);
		expect(isTempered(ENEMY_META.E, 'sword', true), '雑魚は抑えない').toBe(false);
	});

	test('基準の剣以下は抑えない（木の剣・剣なし・Ω に聖剣）', () => {
		expect(temperFactor(swordAtkOfTier(0), 2)).toBe(1);
		expect(temperFactor(swordAtkOfTier(-1), 2)).toBe(1);
		expect(temperFactor(swordAtkOfTier(3), ENEMY_META['Ω'].def, ENEMY_META['Ω'].swordTemperRef)).toBe(1);
		expect(ENEMY_META['Ω'].swordTemperRef).toBe(4);
	});

	test('端数を持ち越す＝聖剣とルミアの剣がザーネルで同じ数に並ばない（丸めるだけだと並ぶ）', () => {
		const { hp, def } = ENEMY_META.Z;
		const holy = swingsToKill(hp, swordAtkOfTier(3), def);
		const lumia = swingsToKill(hp, swordAtkOfTier(4), def);
		expect(lumia).toBeLessThan(holy);
		// 対照：持ち越さずに毎回丸めると同じ数になる
		const rounded = (atk) => Math.ceil(hp / Math.max(1, Math.round((atk - def) * temperFactor(atk, def))));
		expect(rounded(swordAtkOfTier(3))).toBe(rounded(swordAtkOfTier(4)));
		// 持ち越しは1発ごとに 0 以上 1 未満
		let carry = 0;
		for (let i = 0; i < 20; i++) {
			const r = temperDamage(12, temperFactor(14, 2), carry);
			expect(r.dmg).toBeGreaterThanOrEqual(1);
			expect(r.carry).toBeGreaterThanOrEqual(0);
			expect(r.carry).toBeLessThan(1);
			carry = r.carry;
		}
	});
});

// ── ③ 実機 ─────────────────────────────────────────────────────
// ボス部屋（D1 岩のゴーレムの部屋）と、ボス部屋でない D1 の画面を実マップから引く。
function findStage(layer, pred) {
	for (const [key, sd] of Object.entries(MAP.layers[layer].stages)) {
		if (!Array.isArray(sd.tiles) || !pred(sd)) continue;
		for (let r = 1; r < sd.tiles.length - 1; r++) {
			for (let c = 1; c < sd.tiles[r].length - 1; c++) if (sd.tiles[r][c] === '.') return { key, row: r, col: c };
		}
	}
	throw new Error(`stage not found in ${layer}`);
}
const BOSS_ROOM = findStage('dungeon_1', (sd) => sd.isBossRoom && sd.tiles.some((row) => row.includes('G')));
const PLAIN_ROOM = findStage('dungeon_1', (sd) => !sd.isBossRoom);

async function hitsOn(page, where, atkType, n) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`/blade-of-lumia/game/?fromEditor=1&layer=dungeon_1&stage=${where.key}`
		+ `&row=${where.row}&col=${where.col}&ps_weapon=1&ps_sword=3&ps_hearts=20`);
	await waitForBoard(page);
	const r = await page.evaluate(({ atkType, n }) => {
		const g = window.__game;
		// 守り 0 の G を置く（type 'G'＝isBoss）・歩かない・攻撃しない
		const id = g.injectEnemy(1, 1, 1000, 1, 1, 'G');
		const atk = g.getPlayer().atk;
		const lost = [];
		for (let i = 0; i < n; i++) {
			const before = g.getEnemies().find((e) => e.id === id).hp;
			g.dealDamage(id, atk, atkType);
			lost.push(before - g.getEnemies().find((e) => e.id === id).hp);
		}
		return { atk, lost };
	}, { atkType, n });
	return { ...r, errors };
}

test.describe('③ 実機', () => {
	test('ボス部屋：聖剣の剣は抑えた数だけ減る（端数の持ち越しまで決まりどおり）', async ({ page }) => {
		const r = await hitsOn(page, BOSS_ROOM, 'sword', 6);
		expect(r.atk).toBe(swordAtkOfTier(3));
		const f = temperFactor(r.atk, 0);
		let carry = 0;
		const want = [];
		for (let i = 0; i < 6; i++) { const t = temperDamage(r.atk, f, carry); want.push(t.dmg); carry = t.carry; }
		expect(r.lost).toEqual(want);
		expect(r.lost.every((d) => d < r.atk), '抑えていない').toBe(true);
		expect(r.errors).toEqual([]);
	});

	test('ボス部屋：矢は抑えない（素のまま）', async ({ page }) => {
		const r = await hitsOn(page, BOSS_ROOM, 'arrow', 3);
		expect(r.lost).toEqual([r.atk, r.atk, r.atk]);
		expect(r.errors).toEqual([]);
	});

	test('ボス部屋の外：剣も素のまま', async ({ page }) => {
		const r = await hitsOn(page, PLAIN_ROOM, 'sword', 3);
		expect(r.lost).toEqual([r.atk, r.atk, r.atk]);
		expect(r.errors).toEqual([]);
	});
});
