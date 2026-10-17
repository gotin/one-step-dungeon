// @ts-check
// 実行キュー79（2026-10-17・プレイメモ field 2,4「なんでここ石碑二つあるんだ？…石碑ひとつにしてよさそう」）。
// D6 森の聖域の入口画面（field 2,4）に読める石碑は1つだけ＝入口 `>` の隣の森の聖域の石碑。
// 砂漠の神殿（D2）の迷子石碑は消した（ここに来る頃には攻略済み＝案内として古い・ユーザー決定）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { READABLE_SIGN_TILES } from '../shared/tiles.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(join(__dir, '../work/blade-of-lumia.json'), 'utf8'));
const ST = MAP.layers.field.stages['2,4'];

test('field 2,4 の読める石碑は森の聖域の1つだけ・砂漠の神殿の本文は残っていない', () => {
  const readable = ST.tiles.flatMap((row, r) => row.flatMap((ch, c) => (READABLE_SIGN_TILES.has(ch) ? [`${r},${c}`] : [])));
  expect(readable, '読める石碑の数').toEqual(['4,3']);
  expect(ST.npcData['4,3'].lines[0]).toBe('【森の聖域】');
  expect(ST.npcData['4,3'].linesAfterBoss?.O?.length, '撃破後の文が消えた').toBeGreaterThan(0);
  const texts = JSON.stringify({ npc: ST.npcData, sign: ST.signData ?? {} });
  expect(texts, '砂漠の神殿の本文が残っている（本文だけの幽霊）').not.toContain('砂漠の神殿');
});
