// @ts-check
// 実行キュー82⑫（2026-10-18・Fable 実装レビュー #18）。
// ヒット＆アウェイ（META の hitAndAway・相の hitAndAway）を持つ敵は必ず `directional: true`。
// enemy-ai.js bossTickHitAndAway は向き（e.dir）だけを書き、絵は syncDirectionalSprite に任せる
// （directional でない敵用の絵の差し替えは到達しない分岐だったので消した）＝この前提が崩れると絵の向きが変わらなくなる。
import { test, expect } from '@playwright/test';
import { ENEMY_META } from '../shared/enemies.js';

test('hitAndAway を持つ敵はすべて directional', () => {
  const bad = Object.entries(ENEMY_META)
    .filter(([, m]) => (m.hitAndAway || (m.phases ?? []).some((p) => p.hitAndAway)) && !m.directional)
    .map(([t]) => t);
  expect(bad, 'directional でない敵に hitAndAway がある（ENEMY-DIRECTIONAL-GUIDE §1）').toEqual([]);
});
