// D8 二色の鐘の間（dungeon_8 3,0）に矢の壺を2つ置く（2026-11-15）
//
// ■ きっかけ（ユーザー指摘）
//   「このステージって矢がなくなったらつまない？」→ 実際に詰む：鐘を遠くから鳴らせるのは矢と剣のビーム
//   （銅の剣以上・寄り道の forest_cave）だけ。木の剣のまま撃ち尽くすと、右上の区画（出入りの門が2枚とも
//   遠くの鐘でしか開かない）と、宝箱の区画＋北の廊下（赤は隣で叩けるが青に届かない）に閉じ込められる。
//   作った時のソルバーは矢を無限として数えていた。
//   ユーザーの方針＝「決まった数の矢を置くだけじゃだめ…矢の数が0になったら矢が自動的に現れるツボ」。
//
// ■ 置く場所（矢0本・剣で隣の鐘を叩くだけ、で壺に届くかは tests/arrow-pot.spec.js が全状態で確かめる）
//      0 ############
//      1 #0..#..#..0#   ← 宝箱の区画の角 (1,1)・右上の区画の角 (1,10)
//      2 #.B.)[.(...#
//   ・右上の区画：赤なら北の廊下へ、青なら南東へ＝どちらの色でもここに戻れる。
//   ・宝箱の区画：南西からは赤門 (4,2)、北の廊下からは青門 (2,4)＝北の廊下は隣の赤い鐘を剣で叩いて右上へも行ける。
//
// 使い方:
//   node scripts/migrate-d8-3-0-arrow-pots.mjs --dry
//   node scripts/migrate-d8-3-0-arrow-pots.mjs
// 再実行しても同じ結果（冪等）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

export const D8_ARROW_POTS = { layer: 'dungeon_8', stage: '3,0', pots: [[1, 1], [1, 10]], tile: '0' };
const SIGN_POS = '8,4';
const SIGN_HINT = '矢 尽きし者には 壺が 矢を 授ける。';

function main() {
	const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const { layer, stage, pots, tile } = D8_ARROW_POTS;
	const sd = map.layers?.[layer]?.stages?.[stage];
	if (!sd) throw new Error(`${layer} ${stage} が無い`);
	for (const [r, c] of pots) {
		const before = sd.tiles[r][c];
		if (before !== '.' && before !== tile) throw new Error(`(${r},${c}) が床でも壺でもない: ${before}`);
		if (sd.bgTiles?.[`${r},${c}`]) throw new Error(`(${r},${c}) に下地（${sd.bgTiles[`${r},${c}`]}）がある`);
		sd.tiles[r][c] = tile;
		console.log(`${layer} ${stage} (${r},${c}): '${before}' → '${tile}'（矢の壺）`);
	}
	const sign = sd.signData?.[SIGN_POS];
	if (sign?.name !== '二色の 鐘') throw new Error('二色の鐘の石碑が無い');
	if (!sign.lines.includes(SIGN_HINT)) sign.lines.push(SIGN_HINT);
	console.log(`石碑 (${SIGN_POS})：最後の行「${SIGN_HINT}」`);

	if (DRY) { console.log('--dry：書き込まない'); return; }
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));   // 末尾に改行を足さない
	console.log('書き込んだ');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
