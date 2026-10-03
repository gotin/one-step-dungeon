// 「石碑」と呼んでいる看板 `i` を石碑 `†` に、選んだ8枚を転移の石碑 `‡` に置き換える移行スクリプト（実行キュー27・2026-10-03）
//
// なぜ：「〜の石碑」も「道標」も同じ木の看板の絵だった（2026-09-20 ユーザー指摘「そもそも、『石碑』
//   じゃないよね？看板じゃんただの。石碑らしい見た目の、看板とは違うギミックをつくるべき」）。
//   ✅ 2026-10-03 ユーザー判定＝絵は碑・機構は「転移の石碑」（選んだ8枚だけ・石碑から石碑へ）。
//
// 石碑にする規則＝本文（signData か npcData）の名前が碑を名指ししているもの：
//   碑・石標・刻み・環状（石）・ザーネルの記憶。ただし道標・立札・書き置き・手記・覚え書き
//   （木の看板・紙）は看板のまま。祠・門柱・〜の間 など物の種類を言わない名前も看板のまま。
//   `test_mechanics`（検証ステージ）は触らない。
// 本文・名前・版・印は1文字も変えない（タイル文字だけ）。読み方は看板と同じ（READABLE_SIGN_TILES）。
//
// 転移碑の8枚（✅ ユーザー判定「この8つで OK」）＝本編ダンジョンの入口のそば＋村＋最後の塔。
//   ③ field 9,9 は「新設」の案だったが、着手後の再集計で同じ画面の D3 入口の隣に既存の
//   「水の迷宮の石碑」（本文が npcData 側＝最初の集計から漏れていた）があると分かった∴それを使う。
//
// 使い方：node scripts/migrate-q27-monuments.mjs          … 数えるだけ
//         node scripts/migrate-q27-monuments.mjs --write  … 書き込む

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { TILE } from '../shared/tiles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = resolve(HERE, '../work/blade-of-lumia.json');
const WRITE = process.argv.includes('--write');

const WOOD  = /道標|道しるべ|立札|立て札|書き置き|手記|覚え書き/;
const STONE = /碑|石標|刻み|環状|ザーネルの記憶/;
export const isStoneName = (n) => !WOOD.test(n ?? '') && STONE.test(n ?? '');

// [画面, セル, 名前（取り違え防止の照合用）]
const WARP = [
	['6,14',  '4,4', '村を見守る碑'],
	['2,15',  '6,5', '砂漠の神殿の石碑'],
	['9,9',   '3,9', '水の迷宮の石碑'],
	['12,0',  '6,6', '火口の 石碑'],
	['3,5',   '1,9', '苔むした石碑'],
	['15,4',  '6,5', '鐘楼の石碑'],
	['10,13', '2,3', '沼の 関の 石標'],
	['8,1',   '7,2', '天空の石碑'],
];

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const setTile = (sd, r, c, ch) => {
	if (typeof sd.tiles[r] === 'string') sd.tiles[r] = sd.tiles[r].slice(0, c) + ch + sd.tiles[r].slice(c + 1);
	else sd.tiles[r][c] = ch;
};

let monuments = 0;
const perLayer = {};
for (const [lk, ld] of Object.entries(map.layers)) {
	if (lk === 'test_mechanics') continue;
	for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
		sd.tiles.forEach((row, r) => {
			for (let c = 0; c < row.length; c++) {
				if (row[c] !== TILE.SIGN) continue;
				const k = `${r},${c}`;
				const name = (sd.signData?.[k] ?? sd.npcData?.[k])?.name;
				if (!isStoneName(name)) continue;
				setTile(sd, r, c, TILE.MONUMENT);
				monuments++;
				perLayer[lk] = (perLayer[lk] ?? 0) + 1;
			}
		});
	}
}

for (const [sk, k, want] of WARP) {
	const sd = map.layers.field.stages[sk];
	const [r, c] = k.split(',').map(Number);
	const name = (sd.signData?.[k] ?? sd.npcData?.[k])?.name;
	if (sd.tiles[r][c] !== TILE.MONUMENT || name !== want) {
		throw new Error(`転移碑の照合に失敗: field ${sk} (${k}) tile=${sd.tiles[r][c]} name=${name}（期待 ${want}）`);
	}
	setTile(sd, r, c, TILE.WARP_STONE);
	monuments--;
}

console.log(`石碑 ${monuments} 枚・転移の石碑 ${WARP.length} 枚`, perLayer);
if (WRITE) {
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));   // 元のファイルに末尾改行は無い
	console.log('書き込んだ:', MAP_PATH);
} else {
	console.log('（数えただけ。書き込むには --write）');
}
