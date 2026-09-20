// Phase 17-10c（17-10bの型⑧のやり直し）。
//
// ユーザー指摘（2026-09-20）＝「cave系の印を渡す場所は、ゲーム開始直後にゲットできるように
// しちゃうとそこをめざさせてしまってあまりよくないのでは？」17-10bは「洞窟までの遠さ」だけを
// 最適化して「提供元自体が村から近い」を見落としていた（`field 6,14`は村から1画面・
// `field 0,14`は村から7画面＝ゲーム開始直後に読める）。
//
// 実測（`.scratch/17-10c-dual-dist.mjs`／`.scratch/17-10c-warlord.mjs`）で村からの距離も
// 含めて選び直した提供元:
//   樹海の岩室(0,0) ← field 15,5(6,3) 裂け目の石碑（洞窟まで20画面・村から17画面＝雪原帯の深部）
//   魔将の巣(6,0)   ← field 15,19(2,6) 沈んだ 宝物庫（洞窟まで28画面・村から13画面＝沈んだ都の最奥）
//
// `field 6,14`／`field 0,14` は17-10bで足した内容を撤回し、元の文に戻す。
//
// 使い方:
//   node scripts/migrate-dialog-17-10c.mjs
//   BLADE_MAP_PATH=/abs/path/dry.json node scripts/migrate-dialog-17-10c.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = process.env.BLADE_MAP_PATH
	? path.resolve(process.env.BLADE_MAP_PATH)
	: path.join(ROOT, 'work/blade-of-lumia.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
console.log(`対象: ${MAP_PATH}`);

function entry(layer, key, pos) {
	const st = map.layers?.[layer]?.stages?.[key];
	if (!st) throw new Error(`stage が無い: ${layer} ${key}`);
	for (const src of ['signData', 'npcData']) {
		const e = st[src]?.[pos];
		if (e) return { e, src };
	}
	throw new Error(`会話が無い: ${layer} ${key} (${pos})`);
}

function setLines(layer, key, pos, { oldFirst, newLines, label }) {
	const { e, src } = entry(layer, key, pos);
	const cur = e.lines ?? [];
	if (JSON.stringify(cur) === JSON.stringify(newLines)) { console.log(`  = ${label}（既に想定どおり・${src}）`); return; }
	if (cur[0] !== oldFirst) {
		throw new Error(`${label}: 1行目が想定と違う\n  想定: ${JSON.stringify(oldFirst)}\n  実際: ${JSON.stringify(cur[0])}`);
	}
	e.lines = newLines;
	console.log(`  ✔ ${label}（${src} / ${cur.length}行 → ${newLines.length}行）`);
}

function setItemVariantLines(layer, key, pos, item, { oldFirst, newLines, label }) {
	const { e, src } = entry(layer, key, pos);
	const k = `item:${item}`;
	const cur = e.linesAfterBoss?.[k] ?? [];
	if (JSON.stringify(cur) === JSON.stringify(newLines)) { console.log(`  = ${label}（既に想定どおり・${k}・${src}）`); return; }
	if (cur.length && cur[0] !== oldFirst) {
		throw new Error(`${label}: ${k} の1行目が想定と違う\n  想定: ${JSON.stringify(oldFirst)}\n  実際: ${JSON.stringify(cur[0])}`);
	}
	e.linesAfterBoss[k] = newLines;
	console.log(`  ✔ ${label}（${src} / ${k} / ${cur.length}行 → ${newLines.length}行）`);
}

function removeMark(layer, key, pos, { expectStage, label }) {
	const { e, src } = entry(layer, key, pos);
	if (e.mark === undefined) { console.log(`  = ${label}（既に mark 無し・${src}）`); return; }
	if (e.mark.stage !== expectStage) throw new Error(`${label}: mark.stage が想定と違う（想定 ${expectStage} / 実際 ${e.mark.stage}）`);
	delete e.mark;
	console.log(`  ✔ ${label}: mark(${expectStage}) を削除（${src}）`);
}

function setMark(layer, key, pos, mark, label) {
	const { e, src } = entry(layer, key, pos);
	if (JSON.stringify(e.mark) === JSON.stringify(mark)) { console.log(`  = ${label}（既に設定済み・${src}）`); return; }
	if (e.mark) throw new Error(`${label}: mark が別内容で既にある`);
	e.mark = mark;
	console.log(`  ✔ ${label}: mark → ${mark.stage}(${mark.label})（${src}）`);
}

// ══════════════════════════════════════════════════════════════════════════
// ① 撤回＝field 6,14(4,4) 村を見守る碑（村から1画面＝ゲーム開始直後に読めてしまう）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n① field 6,14(4,4) 村を見守る碑＝17-10bの追記を撤回（元の2行に戻す）');
removeMark('field', '6,14', '4,4', { expectStage: '0,0', label: '村を見守る碑（field 6,14）' });
setLines('field', '6,14', '4,4', {
	label: '村を見守る碑（field 6,14）',
	oldFirst: 'ルミアの女王 石に姿を変えられて 久し。',
	newLines: [
		'ルミアの女王 石に姿を変えられて 久し。',
		'旅人よ 星の欠片を八つ 北の祭壇へ。',
	],
});

// ══════════════════════════════════════════════════════════════════════════
// ② 撤回＝field 0,14(2,3) 爆ぜた岩の跡（村から7画面＝D2と同程度に早い）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n② field 0,14(2,3) 爆ぜた岩の跡＝17-10bの追記を撤回（元の2行に戻す・基本版/item:bomb版とも）');
removeMark('field', '0,14', '2,3', { expectStage: '6,0', label: '爆ぜた岩の跡（field 0,14）' });
setLines('field', '0,14', '2,3', {
	label: '爆ぜた岩の跡（field 0,14・基本）',
	oldFirst: 'この 岩壁、火薬の 匂いがする。',
	newLines: ['この 岩壁、火薬の 匂いがする。', '硬い 砂岩は 火薬でしか 崩れぬ。'],
});
setItemVariantLines('field', '0,14', '2,3', 'bomb', {
	label: '爆ぜた岩の跡（field 0,14・item:bomb）',
	oldFirst: 'この 岩壁、火薬の 匂いがする。',
	newLines: ['この 岩壁、火薬の 匂いがする。', '今の 荷なら 砕けよう。'],
});

// ══════════════════════════════════════════════════════════════════════════
// ③ 新設＝樹海の岩室(0,0) ← field 15,5(6,3) 裂け目の石碑（洞窟まで20画面・村から17画面）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n③ field 15,5(6,3) 裂け目の石碑＝樹海の岩室の噂を新設（村から17画面の深部）');
setLines('field', '15,5', '6,3', {
	label: '裂け目の石碑（field 15,5）',
	oldFirst: '【風の裂け目】',
	newLines: [
		'【風の裂け目】',
		'岩の 割れ目に 石室が ある。',
		'素手では 開かぬ。爆ぜる 力を 持って 戻れ。',
		'西の 樹海の 奥に、かがり火を 携えた 岩室が あるという。',
	],
});
setMark('field', '15,5', '6,3', { layer: 'field', stage: '0,0', label: '樹海の岩室', kind: 'cave' }, '裂け目の石碑（field 15,5）');

// ══════════════════════════════════════════════════════════════════════════
// ④ 新設＝魔将の巣(6,0) ← field 15,19(2,6) 沈んだ 宝物庫（洞窟まで28画面・村から13画面）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n④ field 15,19(2,6) 沈んだ 宝物庫＝魔将の巣の噂を新設（村から13画面・沈んだ都の最奥）');
setLines('field', '15,19', '2,6', {
	label: '沈んだ 宝物庫（field 15,19）',
	oldFirst: '壁は 固く 音は 通る。',
	newLines: [
		'壁は 固く 音は 通る。',
		'爆ぜる 火と 笛の 音を もて。',
		'北の 虚空の 淵の 向こう岸に、鎧を 抱いて 眠る 者が いると 伝わる。',
	],
});
setMark('field', '15,19', '2,6', { layer: 'field', stage: '6,0', label: '魔将の巣', kind: 'cave' }, '沈んだ 宝物庫（field 15,19）');

// ══════════════════════════════════════════════════════════════════════════
// 保存
// ══════════════════════════════════════════════════════════════════════════
fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
console.log(`\n書き込み完了: ${MAP_PATH}`);

// ══════════════════════════════════════════════════════════════════════════
// 自己検証
// ══════════════════════════════════════════════════════════════════════════
{
	const after = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
	const problems = [];

	const marks = [];
	for (const [ln, layer] of Object.entries(after.layers)) {
		for (const [sk, st] of Object.entries(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const [pos, e] of Object.entries(st[src] ?? {})) {
					if (!e || typeof e !== 'object') continue;
					const push = (raw, via) => {
						if (!raw) return;
						for (const m of Array.isArray(raw) ? raw : [raw]) marks.push({ ln, sk, pos, via, m });
					};
					push(e.mark, 'mark');
					for (const [k, mv] of Object.entries(e.markAfterBoss ?? {})) push(mv, `markAfterBoss.${k}`);
				}
			}
		}
	}
	const byDest = new Map();
	for (const mk of marks) {
		const layer = mk.m.layer ?? mk.ln;
		if (!after.layers?.[layer]?.stages?.[mk.m.stage]) {
			problems.push(`印の行き先が実在しない: ${mk.ln} ${mk.sk} (${mk.pos}) ${mk.via} → ${layer}/${mk.m.stage}`);
		}
		if (layer === mk.ln && mk.m.stage === mk.sk) problems.push(`自己参照の印: ${mk.ln} ${mk.sk} (${mk.pos}) ${mk.via}`);
		const dk = `${layer}/${mk.m.stage}`;
		if (!byDest.has(dk)) byDest.set(dk, []);
		byDest.get(dk).push(mk);
	}
	for (const [dk, uses] of byDest) {
		if (uses.length > 1) {
			problems.push(`目的地 ${dk} の提供元が ${uses.length} 件ある（1目的地1提供元に反する）: `
				+ uses.map((u) => `${u.ln} ${u.sk} (${u.pos}) ${u.via}`).join(' / '));
		}
	}
	if (byDest.has('field/6,14') || (after.layers.field.stages['6,14'].signData['4,4'].mark)) {
		problems.push('field/6,14 にまだ mark が残っている（撤回できていない）');
	}
	if (after.layers.field.stages['0,14'].signData['2,3'].mark) {
		problems.push('field/0,14 にまだ mark が残っている（撤回できていない）');
	}

	let variantOwners = 0;
	for (const layer of Object.values(after.layers)) {
		for (const st of Object.values(layer.stages ?? {})) {
			for (const src of ['signData', 'npcData']) {
				for (const e of Object.values(st[src] ?? {})) if (e.linesAfterBoss || e.markAfterBoss) variantOwners++;
			}
		}
	}
	if (variantOwners !== 43) problems.push(`版を持つエントリ数が想定と違う（想定43 / 実際 ${variantOwners}）`);

	console.log(`\n自己検証: 印 ${marks.length} 件 / 目的地 ${byDest.size} 種 / 版を持つエントリ ${variantOwners} 件`);
	if (problems.length) {
		console.error('\n❌ 自己検証で問題:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log('✅ 自己検証 OK');
}
