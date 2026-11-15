// キュー104 の後始末：出来事の人へ移した印を、元の提供元にも「予備」として戻す（2026-11-15）
//
// ■ きっかけ（ユーザー報告）
//   本番のセーブで氷の廃墟の主 L を倒した後、賢者エルンが「沼地の神殿に欠片があるはずじゃ」と言うのに
//   地図に印が入らなかった。原因＝キュー103 で沼地の神殿の印をエルンから「エルンの使い」（氷の廃墟の出口
//   field 15,4）へ移した。使いは出口の画面に入ったときに来る＝本番に出す前に L を倒して画面を離れていた
//   セーブは使いに会っておらず、エルンは台詞だけで印をくれない。
//   同じ形の移しがあと2か所＝炎の神殿（灰境の道標→水の迷宮のタロ）・氷の廃墟（エルンの O の版→出来事の版）。
//
// ■ 直し方（ユーザー了承「なるほど。直していい。」）
//   元の提供元に印を戻し、`markFallback` に「予備」と宣言する（scripts/check-dialog-integrity.mjs ⑤b）。
//   出来事で先に付いていれば addMark が false＝「地図に記した」も出ない＝新しい流れを通った人には何も変わらない。
//
// 使い方:
//   node scripts/migrate-q104-mark-fallbacks.mjs --dry   # 差分の確認のみ
//   node scripts/migrate-q104-mark-fallbacks.mjs         # 書き込み
// 再実行しても同じ結果（冪等）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '..', 'work', 'blade-of-lumia.json');
const DRY = process.argv.includes('--dry');

const FIRE_MARK  = { layer: 'field', stage: '12,2',  label: '炎の神殿',   kind: 'dungeon' };
const ICE_MARK   = { layer: 'field', stage: '15,4',  label: '氷の廃墟',   kind: 'dungeon' };
const SWAMP_MARK = { layer: 'field', stage: '10,14', label: '沼地の神殿', kind: 'dungeon' };

export const Q104_FALLBACKS = {
	signpost: { stage: '10,0', pos: '5,5', name: '灰境の道標', key: 'mark', mark: FIRE_MARK },
	ern:      { stage: '13,5', pos: '4,5', name: '賢者 エルン', variants: { O: ICE_MARK, L: SWAMP_MARK } },
};

function addFallbackKey(entry, key) {
	const keys = new Set(entry.markFallback ?? []);
	keys.add(key);
	entry.markFallback = [...keys];
}

function main() {
	const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
	const field = map.layers.field.stages;

	// 灰境の道標（看板＝signData）
	const sp = Q104_FALLBACKS.signpost;
	const sign = field[sp.stage]?.signData?.[sp.pos];
	if (sign?.name !== sp.name) throw new Error(`${sp.name} が居ない`);
	sign.mark = sp.mark;
	addFallbackKey(sign, sp.key);
	console.log(`field ${sp.stage} (${sp.pos}) ${sp.name}：mark（${sp.mark.label}）を予備として戻した`);

	// 賢者エルン（O＝氷の廃墟・L＝沼地の神殿）。版の並び（優先順）は変えない＝印の表の並びだけ。
	const en = Q104_FALLBACKS.ern;
	const ern = field[en.stage]?.npcData?.[en.pos];
	if (ern?.name !== en.name) throw new Error(`${en.name} が居ない`);
	for (const [key, mk] of Object.entries(en.variants)) {
		if (!ern.linesAfterBoss?.[key]) throw new Error(`${en.name} に版 ${key} が無い＝前提が変わった`);
		ern.markAfterBoss = { ...(ern.markAfterBoss ?? {}), [key]: mk };
		addFallbackKey(ern, key);
		console.log(`field ${en.stage} (${en.pos}) ${en.name}：版 ${key} に印（${mk.label}）を予備として戻した`);
	}
	// 印の表は台詞の版と同じ並びにする＝エディタが版の並びで書き直す（無編集の往復で変わらない＝editor-dialog-variants ⑥）
	const order = Object.keys(ern.linesAfterBoss);
	ern.markAfterBoss = Object.fromEntries(Object.entries(ern.markAfterBoss)
		.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)));

	if (DRY) { console.log('--dry：書き込まない'); return; }
	writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));   // 末尾に改行を足さない
	console.log('書き込んだ');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
