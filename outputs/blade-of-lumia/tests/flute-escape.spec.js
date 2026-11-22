// tests/flute-escape.spec.js
// 笛で石を戻す部屋（fluteEffect.type === 'resetStones'）で、笛を吹いたせいで部屋から出られなくなる場所が無いことの番人。
//
// 経緯：キュー112b（2026-11-22）。ユーザーの問い「逆に脱出できなくなるステージはない？」を状態空間で測ると、
// D8 `2,4` で閉じ込めが見つかった（沈めた石の足場の上で吹く／泥橋の先で吹く）。ユーザー判断＝作る段階で検知し、
// その場所では笛を不発にするか、理想の状態になったら石を固める（`lockStonesAt`）。
// 測り方は scripts/lib/flute-escape.mjs（笛が効く立ち位置を全部集め、吹いた後に口へ戻れるかを1つずつ測る）。
//
// 守るもの：
// ① 本編の笛で石を戻す部屋すべてで、笛の後に口へ戻れない立ち位置が 0（新しく部屋を作っても自動で対象になる）
// ② 検査の歯：D8 `2,4` から石を固めるマスの指定を外すと、泥橋の先 (7,6)(8,6) が閉じ込めとして出る
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { measureFluteEscape } from '../scripts/lib/flute-escape.mjs';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const rooms = [];
for (const [lk, layer] of Object.entries(map.layers)) {
	if (lk === 'test_mechanics') continue;   // 試し場は本編に出ない
	for (const [sk, st] of Object.entries(layer.stages ?? {})) {
		if (st?.fluteEffect?.type === 'resetStones') rooms.push([lk, sk, st]);
	}
}

test.describe('Blade of Lumia – 笛で石を戻しても部屋から出られなくならない（キュー112b）', () => {
	test('① 本編の笛で石を戻す部屋すべてで、笛の後に口へ戻れない立ち位置が 0', () => {
		test.setTimeout(180_000);
		expect(rooms.length, '笛で石を戻す部屋が見つからない（指定の読み方が変わった？）').toBeGreaterThanOrEqual(9);
		const bad = [];
		for (const [lk, sk, st] of rooms) {
			const m = measureFluteEscape(st);
			expect(m.fluteCells.length, `${lk} ${sk}：笛が効く場所が無い（測り方が壊れた？）`).toBeGreaterThan(0);
			if (m.trapped.length) bad.push(`${lk} ${sk}: ${m.trapped.join(' ')}`);
		}
		expect(bad, `笛の後に出られなくなる立ち位置（そこでは笛を不発にするか lockStonesAt で石を固める）:\n${bad.join('\n')}`).toEqual([]);
	});

	test('② 検査の歯：D8 2,4 から石を固めるマスの指定を外すと閉じ込めが出る', () => {
		const st = structuredClone(map.layers.dungeon_8.stages['2,4']);
		expect(st.lockStonesAt, '前提：2,4 に石を固めるマスの指定がある').toEqual(['7,6', '8,6']);
		delete st.lockStonesAt;
		expect(measureFluteEscape(st).trapped).toEqual(['7,6', '8,6']);
	});
});
