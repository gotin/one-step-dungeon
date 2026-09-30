// field 9,9 にルピーの使い道を足す（2026-09-30 / PLAN 実行キュー13 ③・ユーザー確定＝DECISIONS 2026-09-29（3））
//
// ■ 何をするか
//   ① 旅の商人（6,7）の品に 妖精の瓶（100 ルピー）を足し、ブーメランを外す
//      （ブーメランは D2 の宝箱の報酬＝進行の道具。ユーザー判定 2026-09-30「店で売らない」）。
//   ② 情報屋（新しい店 '$'）を 4,9 に置く。品＝キュー13 で中身を差し替えた宝箱8つの「うわさ」。
//      買うとその画面に目的地マーク（kind 'item'）が立つ（`game/ui.js buyRumor`）。
//      値段＝中身の重さで差をつける（ユーザー判定 2026-09-30「疾風の靴の噂は3000・他も最低で1000ぐらい」）：
//        ハートのかけら 1200／爆弾袋・矢筒 1000／疾風の靴 3000
//   ③ すみっこずき（1,11）の3行目「何も買わなくてもクリアできる」を、情報屋と妖精の瓶の案内に書き換える。
//
// ■ 4,9 を選んだ理由
//   商人（6,7）・くじ（6,9）の並びの右端 6,11 は**東の端のセル**＝隣の画面から入ってきた
//   プレイヤーの着地セルを店が塞ぐ。4,9 は端でなく、5 行目の通りから向き合える。
//
// 使い方（outputs/blade-of-lumia/ で）：
//   node scripts/migrate-field-q13-rupee-sinks.mjs --dry   # 書き込まずに差分と検証
//   node scripts/migrate-field-q13-rupee-sinks.mjs         # 書き込み（冪等）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE } from '../shared/tiles.js';
import { ITEM_META } from '../shared/items.js';
import { SHOP_NPC_SPRITES } from '../shared/npcs.js';
import { SUB_ITEM_KEYS } from '../shared/progression.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');
const LAYER = 'field';
const HUB = '9,9';
const MERCHANT_CELL = '6,7';
const BROKER_CELL = '4,9';

const FAIRY_GOOD = { id: 'fairy', count: 1, price: 100 };

// 封印つきの宝箱には「どうすれば出るか」の一言を添える（印だけだと、着いても宝箱が見えない）
const HINT_FLUTE  = '笛の 音で 姿を 現すらしい。';
const HINT_SWITCH = 'そばの 仕掛けを 動かすと 現れるらしい。';

// [画面, 宝箱のセル, 中身の id, 場所の名前, 値段, 一言]
const RUMORS = [
	['15,0',  '3,5', 'heartPiece', '果ての火口跡', 1200, null],
	['4,0',   '1,5', 'heartPiece', '崖端の見台',   1200, null],
	['3,19',  '4,5', 'heartPiece', '世界の縁',     1200, null],
	['13,8',  '6,5', 'heartPiece', '氷下の鐘',     1200, HINT_FLUTE],
	['11,17', '7,8', 'bombBag',    '都の裏門',     1000, null],
	['15,5',  '3,4', 'bombBag',    '風の裂け目',   1000, null],
	['15,7',  '7,5', 'quiver',     '潮境の氷丘',   1000, HINT_SWITCH],
	['15,19', '6,7', 'swiftBoots', '沈んだ宝物庫', 3000, HINT_FLUTE],
];
// 印の名前（HUD の矢印の横に出る）は短く＝場所の名前だけでは何の印か分からない∴品の略称を添える
const SHORT = { heartPiece: 'かけら', bombBag: '爆弾袋', quiver: '矢筒', swiftBoots: '靴' };

const rumorGood = ([stage, cell, id, place, price, hint]) => ({
	id: 'rumor',
	name: `うわさ：${place}の ${ITEM_META[id].name}`,
	price,
	rumor: { layer: LAYER, stage, cell, label: `${place}（${SHORT[id]}）`, ...(hint ? { hint } : {}) },
});
// 店の '$' は npcData を持たない（商人・くじと同じ＝剣を振ると店が開くだけ）
// sprite＝専用の見た目（refs/情報屋1.png・2.png から起こした npcInfo。shared/npcs.js SHOP_NPC_SPRITES）
const BROKER_SHOP = { name: '情報屋', sprite: 'npcInfo', items: RUMORS.map(rumorGood) };

const SUMI_CELL = '1,11';
const SUMI_OLD = 'でも正直何も買わなくても普通にこのゲームはクリアできると思う。多分。まだこのゲームはバランスがイマイチなんだよね。';
const SUMI_NEW = '最近は 物知りな 情報屋も 来てて、地図を 持ってれば ルピーで 宝の ありかを 書き込んでくれるんだって。商人の 妖精の瓶は、倒れたとき 一度だけ 助けてくれるらしいよ。';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const id of ['fairy', ...Object.keys(SHORT)]) {
	if (!ITEM_META[id]?.name) die(`ITEM_META.${id} が無い`);
}

const data = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const stages = data.layers?.[LAYER]?.stages;
if (!stages) die(`${LAYER} が無い`);
const hub = stages[HUB];
if (!hub) die(`${LAYER} ${HUB} が無い`);

const log = [];

// ① 旅の商人に妖精の瓶
{
	const shop = hub.shopData?.[MERCHANT_CELL];
	if (shop?.name !== '旅の商人') die(`${HUB} (${MERCHANT_CELL}) が旅の商人でない ${JSON.stringify(shop)}`);
	const cur = shop.items.find(g => g.id === 'fairy');
	if (cur && same(cur, FAIRY_GOOD)) log.push(`  ${HUB} (${MERCHANT_CELL}) 旅の商人：変更なし＝既に 妖精の瓶`);
	else if (cur) die(`旅の商人の 妖精の瓶 が想定外 ${JSON.stringify(cur)}（手で確かめる）`);
	else { shop.items.push(FAIRY_GOOD); log.push(`  ${HUB} (${MERCHANT_CELL}) 旅の商人：妖精の瓶（${FAIRY_GOOD.price}）を足した`); }
	const n = shop.items.length;
	shop.items = shop.items.filter(g => g.id !== 'boomerang');
	log.push(n === shop.items.length
		? `  ${HUB} (${MERCHANT_CELL}) 旅の商人：変更なし＝ブーメランは売っていない`
		: `  ${HUB} (${MERCHANT_CELL}) 旅の商人：ブーメランを外した`);
}

// ② 情報屋
{
	const [r, c] = BROKER_CELL.split(',').map(Number);
	const t = hub.tiles?.[r]?.[c];
	if (t === TILE.NPC_SHOP) {
		const cur = hub.shopData?.[BROKER_CELL];
		// 前の版（見た目なし・仮の値段）との比較は「値段と見た目を除いた形」で行う
		const shape = (s) => JSON.stringify({ name: s?.name, items: (s?.items ?? []).map(({ price: _p, ...g }) => g) });
		if (same(cur, BROKER_SHOP)) {
			log.push(`  ${HUB} (${BROKER_CELL}) 情報屋：変更なし＝既に置いてある`);
		} else if (shape(cur) === shape(BROKER_SHOP)) {
			// 2026-09-30 の前の版（見た目なし／仮の値段 150・120・300）で書き込んだマップ
			const oldPrices = cur.items.map(g => g.price).join('/');
			hub.shopData[BROKER_CELL] = BROKER_SHOP;
			log.push(`  ${HUB} (${BROKER_CELL}) 情報屋：見た目 '${cur.sprite ?? '（なし）'}'→'${BROKER_SHOP.sprite}'・値段 ${oldPrices} → ${BROKER_SHOP.items.map(g => g.price).join('/')}`);
		} else {
			die(`${HUB} (${BROKER_CELL}) に想定外の店がある（手で確かめる）`);
		}
	} else if (t === TILE.FLOOR) {
		hub.tiles[r][c] = TILE.NPC_SHOP;
		hub.shopData[BROKER_CELL] = BROKER_SHOP;
		log.push(`  ${HUB} (${BROKER_CELL}) 情報屋：'.' → '$'（うわさ ${RUMORS.length} 件）`);
	} else {
		die(`${HUB} (${BROKER_CELL}) が床でない（'${t}'）`);
	}
}

// ③ すみっこずきの台詞
{
	const npc = hub.npcData?.[SUMI_CELL];
	if (npc?.name !== 'すみっこずき') die(`${HUB} (${SUMI_CELL}) がすみっこずきでない`);
	const i = npc.lines.indexOf(SUMI_OLD);
	if (npc.lines.includes(SUMI_NEW)) log.push(`  ${HUB} (${SUMI_CELL}) すみっこずき：変更なし＝既に書き換え済み`);
	else if (i >= 0) { npc.lines[i] = SUMI_NEW; log.push(`  ${HUB} (${SUMI_CELL}) すみっこずき：${i + 1} 行目を書き換えた`); }
	else die(`すみっこずきの書き換え前の行が見つからない（手で確かめる）`);
}

// ── 検証 ──
const verify = [];
const check = (cond, msg) => verify.push([cond, msg]);
for (const [stage, cell, id] of RUMORS) {
	const st = stages[stage];
	const [r, c] = cell.split(',').map(Number);
	check(st?.tiles?.[r]?.[c] === TILE.CHEST, `${stage} (${cell}) が宝箱`);
	check(st?.chestContents?.[cell]?.type === 'item' && st.chestContents[cell].item === id,
		`${stage} (${cell}) の中身が ${ITEM_META[id].name}`);
}
check(new Set(RUMORS.map(x => x[0])).size === RUMORS.length, 'うわさの画面が重複しない（印は画面単位）');
{
	const [r, c] = BROKER_CELL.split(',').map(Number);
	check(hub.tiles[r][c] === TILE.NPC_SHOP && hub.shopData[BROKER_CELL]?.items?.length === RUMORS.length, `情報屋の店が ${BROKER_CELL} にある`);
	check(SHOP_NPC_SPRITES[hub.shopData[BROKER_CELL]?.sprite], `情報屋の見た目 '${hub.shopData[BROKER_CELL]?.sprite}' が SHOP_NPC_SPRITES にある`);
}
check(hub.shopData[MERCHANT_CELL].items.filter(g => g.id === 'fairy').length === 1, '旅の商人の妖精の瓶が1件');
{
	// 進行の道具（SUB_ITEM_KEYS）はどの店でも売らない＝宝箱・ボスの報酬の意味が消える
	const sold = [];
	for (const [lk, ld] of Object.entries(data.layers)) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [cell, shop] of Object.entries(sd.shopData ?? {})) {
				for (const g of shop.items ?? []) if (SUB_ITEM_KEYS.includes(g.id)) sold.push(`${lk}/${sk} (${cell}) ${g.id}`);
			}
		}
	}
	check(sold.length === 0, `進行の道具を売る店が無い${sold.length ? `（${sold.join('・')}）` : ''}`);
}

console.log(log.join('\n'));
console.log('検証：');
let ok = true;
for (const [cond, msg] of verify) { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) ok = false; }
if (!ok) die('検証に失敗＝書き込まない');

if (DRY) { console.log('(--dry：書き込みなし)'); process.exit(0); }
writeFileSync(MAP_PATH, JSON.stringify(data, null, 2));   // [[blade-map-json-indent-two-spaces]]
console.log(`書き込み：${MAP_PATH}`);
