// scripts/migrate-q116-stone-hero.mjs
// キュー116 ③（2026-11-22）：女王の周回のあいだ、女王の島（field 11,19）に石になった剣士が立つ。
// 場所＝周回の始まりの場面で剣士が石になった立ち位置 (4,7)（game/ending-scene.js FINALE.island.hero）。
// 人のタイル 'a'＋npcData（絵＝PERSON_NPC_SPRITES.heroStone・出る条件 showWhen ['queen']）。
// 1周目は居ない＝ただの床（shared/story-events.js npcPresent）。冪等。既定は確認だけ、--write で書く。
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const MAP_PATH = fileURLToPath(new URL('../work/blade-of-lumia.json', import.meta.url));
const WRITE = process.argv.includes('--write');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
export const STONE_HERO = {
	stage: '11,19', r: 4, c: 7,
	entry: {
		name: '石の剣士',
		sprite: 'heroStone',
		lines: [
			'剣を 握ったまま、石に なった 剣士が 立っている。',
			'……冷たい。けれど、かすかに 温もりが 残っている。',
		],
		showWhen: ['queen'],
	},
};
const st = map.layers.field.stages[STONE_HERO.stage];
const { r, c } = STONE_HERO;
const row = st.tiles[r];
const cur = Array.isArray(row) ? row[c] : row[c];
if (cur !== '.' && cur !== 'a') throw new Error(`(${r},${c}) が床でない：${cur}`);
let changed = false;
if (cur !== 'a') {
	if (Array.isArray(row)) row[c] = 'a'; else st.tiles[r] = row.slice(0, c) + 'a' + row.slice(c + 1);
	changed = true;
}
st.npcData ??= {};
const key = `${r},${c}`;
if (JSON.stringify(st.npcData[key]) !== JSON.stringify(STONE_HERO.entry)) { st.npcData[key] = STONE_HERO.entry; changed = true; }
console.log(changed ? '変わる' : '変わらない');
if (WRITE && changed) { writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`); console.log('書いた'); }
