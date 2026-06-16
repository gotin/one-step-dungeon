// Phase 2-4 support: BFS over the field world map to verify every dungeon
// entrance is reachable on foot from the start village.
// Walks within a stage (4-dir), crosses to adjacent stages by stepping off an
// edge (mirrors checkStageTransition's sx/sy math), records reachable entrances.
import { readFileSync } from 'fs';

const d = JSON.parse(readFileSync(new URL('../work/blade-of-lumia.json', import.meta.url), 'utf8'));
const field = (d.layers && d.layers.field) || d.field;
const stages = field.stages;

// Blocked tile chars on foot (ground truth — mirrors game/passable.js tilePassable).
// Closed gate(T)/door(D)/breakable(!)/locked-doorway(|) treated blocked (no keys/switches yet).
const BLOCKED = new Set([
  '#',  // WALL
  '~',  // WATER
  '%',  // SKY
  'T',  // GATE (closed)
  'D',  // DOOR (closed)
  '!',  // BREAKABLE_WALL
  'a','b','$',  // NPCs (passable:false in passable.js)
  '*',  // STONE (pushable but blocks until pushed)
  't',  // TREE
  'M',  // MOUNTAIN
  'u',  // BUSH (until cut)
  'f',  // FENCE
  'h',  // HOUSE_WALL
  'p',  // HOUSE_ROOF
  'i',  // SIGN (passable:false in passable.js)
  '|',  // DOORWAY_LOCKED
]);

function isBlocked(ch) {
  if (ch === undefined || ch === ' ') return false; // empty = grass-equivalent floor
  return BLOCKED.has(ch);
}

const startStage = (d.startPos && d.startPos.stage) || '1,0';
const startR = d.startPos?.row, startC = d.startPos?.col;
console.log('start:', startStage, `(row ${startR}, col ${startC})`,
            '=>', JSON.stringify(stages[startStage].tiles[startR][startC]));

const visitedEntrances = new Set();
const visitedStageCells = new Set();
const queue = [];
const cellKey = (sk, r, c) => `${sk}:${r},${c}`;

function enqueue(sk, r, c) {
  const stage = stages[sk];
  if (!stage) return;
  if (r < 0 || c < 0 || r >= stage.rows || c >= stage.cols) return;
  if (isBlocked(stage.tiles[r][c])) return;
  const k = cellKey(sk, r, c);
  if (visitedStageCells.has(k)) return;
  visitedStageCells.add(k);
  queue.push([sk, r, c]);
}

enqueue(startStage, startR, startC);

const reachedStages = new Set();
while (queue.length) {
  const [sk, r, c] = queue.shift();
  reachedStages.add(sk);
  const stage = stages[sk];
  const ch = stage.tiles[r][c];
  if (ch === '>') {
    const me = stage.mapEnters?.[`${r},${c}`];
    if (me) visitedEntrances.add(`${me.destId}`);
  }
  const [sx, sy] = sk.split(',').map(Number);
  enqueue(sk, r-1, c); enqueue(sk, r+1, c); enqueue(sk, r, c-1); enqueue(sk, r, c+1);
  if (r === 0)            enqueue(`${sx},${sy-1}`, stage.rows-1, c);
  if (r === stage.rows-1) enqueue(`${sx},${sy+1}`, 0, c);
  if (c === 0)            enqueue(`${sx-1},${sy}`, r, stage.cols-1);
  if (c === stage.cols-1) enqueue(`${sx+1},${sy}`, r, 0);
}

console.log('\nReached field stages:', [...reachedStages].sort().join('  '));
const unreached = Object.keys(stages).filter(k => !reachedStages.has(k));
console.log('UNREACHED stages    :', unreached.join('  ') || '(none)');

console.log('\nDungeon entrances (✓ reachable on foot from start):');
for (const sk of Object.keys(stages).sort()) {
  const me = stages[sk].mapEnters || {};
  for (const pos of Object.keys(me)) {
    const id = me[pos].destId;
    const reached = visitedEntrances.has(id);
    const cellReached = visitedStageCells.has(cellKey(sk, ...pos.split(',').map(Number)));
    console.log(`  ${reached?'✓':'✗'} ${id.padEnd(14)} field ${sk} @ ${pos}` +
                (reached ? '' : cellReached ? '  [cell reached but stage unreached?]' : '  [UNREACHABLE]'));
  }
}
