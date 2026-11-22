// scripts/migrate-q112b-lock-stones-at.mjs
// キュー112b（2026-11-22）：D8 `2,4`（底なし沼の石）の泥橋の先（宝箱の小島）に乗ったら石を固める指定を足す。
// 経緯＝ユーザーの問い「逆に脱出できなくなるステージはない？」を状態空間で測ると、宝箱の小島（沈めた石の泥橋で
// 渡る）で笛を吹くと橋が消えて戻れない状態があった → ユーザー判断「解いた状態になったら石は動かなくすれば良さそう」。
// 冪等・自己検証つき。使い方：node scripts/migrate-q112b-lock-stones-at.mjs [--write]
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
export const LAYER = 'dungeon_8';
export const ROOM = '2,4';
export const CHEST = '8,6';
// 乗ったら石を固めるマス＝泥橋の先（はしごで渡る水 (7,6) と宝箱 (8,6)）。橋が完成しないと乗れない。
export const LOCK_CELLS = ['7,6', '8,6'];

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const st = map.layers[LAYER].stages[ROOM];
const row = st.tiles[8]; const ch = Array.isArray(row) ? row[6] : row[6];
if (ch !== 'B') { console.error(`✗ ${ROOM} の (8,6) が宝箱でない: ${ch}`); process.exit(1); }
if (st.fluteEffect?.type !== 'resetStones') { console.error(`✗ ${ROOM} の笛が石を戻す指定でない`); process.exit(1); }
const before = JSON.stringify(st.lockStonesAt ?? null);
delete st.lockStonesOnChest;   // 初版の指定（宝箱を開けたら）＝はしごの上 (7,6) を守れなかった
st.lockStonesAt = LOCK_CELLS;
console.log(`${LAYER} ${ROOM} lockStonesAt: ${before} → ${JSON.stringify(st.lockStonesAt)}`);
if (process.argv.includes('--write')) {
	writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`);
	console.log('書き込んだ');
}
