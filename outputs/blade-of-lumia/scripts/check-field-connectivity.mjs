// Phase 2-4 / 9-2pre support: BFS over the field world map to verify every
// dungeon entrance is reachable on foot from the start village, and that no edge
// strands the player. Uses the shared core (scripts/lib/connectivity.mjs) which
// mirrors game.js checkStageTransition + game/passable.js tilePassable.
import { readFileSync } from 'fs';
import { bfsLayer, findOrphanRooms, findEntrances } from './lib/connectivity.mjs';
import { fieldHonestMetrics, underTwoAxisScreens, duplicateLayoutGroups } from './lib/field-quality.mjs';

const d = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const field = (d.layers && d.layers.field) || d.field;
const stages = field.stages;

const startStage = (d.startPos && d.startPos.stage) || '1,0';
const startR = d.startPos?.row ?? 2, startC = d.startPos?.col ?? 2;
console.log('start:', startStage, `(row ${startR}, col ${startC})`,
            '=>', JSON.stringify(stages[startStage].tiles[startR][startC]));

const { reachedRooms, deadEdges, entrances } = bfsLayer(stages,
  { stage: startStage, row: startR, col: startC });

console.log('\nReached field stages:', [...reachedRooms].sort().join('  '));
const unreached = Object.keys(stages).filter(k => !reachedRooms.has(k));
console.log('UNREACHED stages    :', unreached.join('  ') || '(none)');

// True orphans: unreachable even with every gimmick gate open + teleports.
const { orphans } = findOrphanRooms(stages, findEntrances(d, 'field'));
if (orphans.length) {
  console.log('\n❌ ORPHAN stages (can NEVER be entered — sealed, not just gated):', orphans.join('  '));
} else {
  console.log('✅ no orphan stages (all reachable once gates are open)');
}

if (deadEdges.length) {
  console.log('\n⚠️ DEAD EDGES (open border but arrival walled / no stage):');
  for (const e of deadEdges)
    console.log(`  ${e.from} ${e.dir} → ${e.to} @ ${e.at}  [${e.reason}${e.tile ? ` '${e.tile}'` : ''}]`);
} else {
  console.log('\n✅ no dead edges');
}

// ── 9-6 HONEST METRICS + 設計④ 不変条件 ──────────────────────────────────────
// The raw deadEdges count (~1203) is NOT trustworthy for gauging 9-6 progress:
// it counts edges that lead into orphan screens and into intended world-border
// screens (all-water / all-mountain) that the player can never step onto anyway.
// The honest breakdown (W1 / W2 / seam bugs) + the 2-axis and dup-layout
// invariants now live in scripts/lib/field-quality.mjs (single source of truth,
// shared with tests/field-invariants.spec.js). See that file for definitions.
const metrics = fieldHonestMetrics(d);
console.log('\n── 9-6 honest metrics (see scripts/lib/field-quality.mjs) ──');
console.log(`  raw dead edges              : ${metrics.rawDeadEdges}  (NOT a real defect count)`);
console.log(`  W1 all-blocked screens      : ${metrics.w1.length}`);
console.log(`  W2 orphan screens           : ${metrics.orphans.length}`);
console.log(`  HONEST seam bugs (→ 0 goal) : ${metrics.seams.length} distinct screen-pairs`);
if (metrics.seams.length)
  console.log('    ' + metrics.seams.join('  '));

// 設計④ 不変条件（2軸以上・レイアウト重複0）。7,14/8,0/8,1 は 論点1 で allowlist。
const under = underTwoAxisScreens(d, { allowlist: ['7,14', '8,0', '8,1'] });
const dups = duplicateLayoutGroups(d);
console.log('\n── 9-6 設計④ invariants ──');
console.log(`  under-2-axis screens (→ 0)  : ${under.length}`);
if (under.length)
  console.log('    ' + under.slice(0, 40).map((u) => `${u.key}[${u.axes.join('/') || 'none'}]`).join('  ')
    + (under.length > 40 ? `  …(+${under.length - 40})` : ''));
console.log(`  duplicate-layout groups (→0): ${dups.length}  (incl. all-water/山/壁 border 塗り絵)`);
if (dups.length)
  console.log('    ' + dups.map((g) => g.join(',')).join('  |  '));

// ── '>' タイルと mapEnters の 1:1（field 版）────────────────────────────────
// game.js checkStageTransition は '>' タイルと mapEnters[pos].destId の両方を要求する。
// 片側だけのものは必ず死んでいる（未登録の '>' ＝踏んでも何も起きない飾りの入口／
// destId があるのにタイルが無い登録 ＝永久に使えない出入口）。
// 2026-09-19 に dark_tower で未登録 '>' 12枚・タイル無し登録3件の実害を確認したので、
// ダンジョン側（check-dungeon-integrity.mjs 検査11）と対になる検査を field にも置く。
// `id` だけのエントリ（他所の '>' の行き先＝着地専用）はタイル不要なので対象外。
{
  const bad = [];
  for (const sk of Object.keys(stages)) {
    const st = stages[sk];
    const arrows = [];
    for (let r = 0; r < st.tiles.length; r++) {
      const row = Array.isArray(st.tiles[r]) ? st.tiles[r] : String(st.tiles[r]).split('');
      for (let c = 0; c < row.length; c++) if (row[c] === '>') arrows.push(`${r},${c}`);
    }
    for (const pos of arrows)
      if (!st.mapEnters?.[pos]) bad.push(`field ${sk} @ ${pos}: '>' が mapEnters に無い（飾りの入口）`);
    for (const [pos, ent] of Object.entries(st.mapEnters || {}))
      if (ent?.destId && !arrows.includes(pos))
        bad.push(`field ${sk} @ ${pos}: destId "${ent.destId}" があるのに '>' タイルが無い（使えない出入口）`);
  }
  console.log('\n── map enters ↔ \'>\' tiles (1:1) ──');
  if (bad.length) {
    console.log(`  ❌ ${bad.length} 件`);
    for (const b of bad) console.log(`    ${b}`);
  } else {
    console.log('  ✅ all 1:1');
  }
}

// ── breakableWalls が壊せる壁を指しているか／形が {breakDef} か（field 版）────
// check-dungeon-integrity.mjs 検査15と同じ実装事実を検査する（field は同スクリプトの
// `all` 対象に入れていない＝checks 1-14 が field で既存の見せかけ開口を100件超検出し
// 本題〈breakableWalls の座標の嘘〉が埋もれるため。field 用にはこの検査だけ単独で置く）。
{
  const bad = [];
  for (const [sk, st] of Object.entries(stages)) {
    for (const [posKey, def] of Object.entries(st.breakableWalls ?? {})) {
      const [r, c] = posKey.split(',').map(Number);
      const row = Array.isArray(st.tiles[r]) ? st.tiles[r] : String(st.tiles[r] ?? '').split('');
      const tile = row[c];
      if (tile !== '!') {
        bad.push(`field ${sk} の breakableWalls[${posKey}] が壊せる壁 '!' を指していない: '${tile}'`);
      }
      if (typeof def !== 'object' || def === null) {
        bad.push(`field ${sk} の breakableWalls[${posKey}] の値が {breakDef} の形でない: ${JSON.stringify(def)}`);
      }
    }
  }
  console.log('\n── breakableWalls 座標の妥当性 ──');
  if (bad.length) {
    console.log(`  ❌ ${bad.length} 件`);
    for (const b of bad) console.log(`    ${b}`);
  } else {
    console.log('  ✅ all breakableWalls point at real \'!\' tiles with {breakDef}');
  }
}

console.log('\nDungeon entrances (✓ reachable on foot from start):');
for (const sk of Object.keys(stages).sort()) {
  const me = stages[sk].mapEnters || {};
  for (const pos of Object.keys(me)) {
    const id = me[pos].destId;
    if (!id) continue;
    const reached = entrances.has(id);
    console.log(`  ${reached ? '✓' : '✗'} ${id.padEnd(14)} field ${sk} @ ${pos}` +
                (reached ? '' : '  [UNREACHABLE]'));
  }
}
