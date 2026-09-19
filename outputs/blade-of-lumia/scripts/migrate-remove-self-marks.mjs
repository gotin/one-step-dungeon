// 「自分が置かれている画面を指す印」を全部消す（2026-09-19 ユーザー決定）。
//
// ユーザーの言葉＝「もともと、地図の印を入れたかったのは、まぁまぁ広いマップだから、どこに向かえば
// いいのか全然わからずにマップを闇雲に移動せざるをえないのは辛すぎるだろうから、ヒントとしてどこに
// 向かえばいいのかを示してあげたい、っていう目的なんだよ。／もう目的地についた状態でそれを記録して
// おきたい、みたいなものは別のユーザマーク機能、みたいなものとしてならあってもいいけど、ゲーム側が
// 自ら現場でマークさせる機能なんていらない。／そんな無駄なマークは削除してください。」
//
// ∴印の役目は**遠くの行き先を教えること**に限る。目の前の物を指す印は情報を増やさない
// （HUD は `◎ この画面` を出すだけ）∴データから消す。到達済み地点を自分で記録する機能が
// 欲しくなったら「プレイヤーが付ける印」として別に設計する（この帯では作らない）。
//
// 対象＝`mark` と `markAfterBoss[*]` のうち、**行き先が「その会話が置かれている画面」と同じもの**。
//   `normalizeDialogMarks(raw, 層)` を通してから比べる（`layer` 省略＝会話と同じ層が既定）。
// 対象外＝本文・`linesAfterBoss`・遠くを指す印（46件）は一切触らない。
//
// 冪等：既に無ければ何もしない（skip）。自己検証：書き直したファイルに自己参照の印が0件。
//
// Run from: outputs/blade-of-lumia/

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizeDialogMarks } from '../shared/marks.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = process.env.BLADE_MAP_PATH || join(__dir, '../work/blade-of-lumia.json');

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

/** その印が「この会話が置かれている画面」を指しているか */
function pointsAtSelf(raw, layerName, stageKey) {
	const norm = normalizeDialogMarks(raw, layerName);
	return norm.length > 0 && norm.every((m) => m.layer === layerName && m.stage === stageKey);
}

function scan(data) {
	const hits = [];
	for (const [layerName, layer] of Object.entries(data.layers ?? {})) {
		for (const [stageKey, stage] of Object.entries(layer.stages ?? {})) {
			for (const store of ['signData', 'npcData']) {
				for (const [posKey, entry] of Object.entries(stage[store] ?? {})) {
					if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
					const where = { layerName, stageKey, store, posKey, entry };
					if (entry.mark !== undefined && pointsAtSelf(entry.mark, layerName, stageKey)) {
						hits.push({ ...where, field: 'mark', label: entry.mark?.label });
					}
					for (const [boss, mk] of Object.entries(entry.markAfterBoss ?? {})) {
						if (pointsAtSelf(mk, layerName, stageKey)) {
							hits.push({ ...where, field: 'markAfterBoss', boss, label: mk?.label });
						}
					}
				}
			}
		}
	}
	return hits;
}

const hits = scan(map);
if (!hits.length) {
	console.log('自分の画面を指す印は無い＝既に適用済み（skip）。');
	process.exit(0);
}

for (const h of hits) {
	const { entry } = h;
	if (h.field === 'mark') {
		delete entry.mark;
	} else {
		delete entry.markAfterBoss[h.boss];
		// 空になった入れ物は残さない（保存の形を増やさない）。
		if (Object.keys(entry.markAfterBoss).length === 0) delete entry.markAfterBoss;
	}
	const what = h.field === 'mark' ? 'mark' : `markAfterBoss[${h.boss}]`;
	console.log(`  削除  ${h.layerName} ${h.stageKey} (${h.posKey}) ${entry.name ?? ''} の ${what}＝「${h.label}」`);
}

writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き込み: ${MAP_PATH}（削除 ${hits.length} 件）`);

// ── 自己検証 ──────────────────────────────────────────────
const after = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const left = scan(after);
if (left.length) {
	console.error(`❌ 自己参照の印が ${left.length} 件残っている`);
	process.exit(1);
}
let remain = 0;
for (const layer of Object.values(after.layers)) {
	for (const stage of Object.values(layer.stages ?? {})) {
		for (const store of ['signData', 'npcData']) {
			for (const entry of Object.values(stage[store] ?? {})) {
				if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
				remain += [entry.mark, ...Object.values(entry.markAfterBoss ?? {})].filter(Boolean).length;
			}
		}
	}
}
console.log(`✅ 自己検証 OK（自己参照 0 件・残った印は ${remain} 件＝すべて別の画面を指す）`);
