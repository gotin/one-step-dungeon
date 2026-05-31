import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./game.js", import.meta.url), "utf8");
const match = source.match(/const LEVELS = (\[[\s\S]*?\n\]);/);
if (!match) throw new Error("LEVELS not found");

const context = {};
vm.createContext(context);
vm.runInContext(`levels = ${match[1]}`, context);
const levels = context.levels;

const DIRS = {
  up: { x: 0, y: -1, mark: "↑" },
  down: { x: 0, y: 1, mark: "↓" },
  left: { x: -1, y: 0, mark: "←" },
  right: { x: 1, y: 0, mark: "→" },
  wait: { x: 0, y: 0, mark: "…" },
};

const ONE_WAY_CHARS = {
  "^": "up",
  "v": "down",
  "<": "left",
  ">": "right",
};

function same(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function parseLevel(level, index) {
  const walls = new Set();
  const switches = [];
  const gates = [];
  const blocks = [];
  const oneWays = [];
  let player = { x: 1, y: 1 };
  let goal = null;
  let key = null;
  let door = null;

  level.map.forEach((row, y) => {
    if (row.length !== level.size) throw new Error(`Stage ${index + 1} row ${y + 1} has length ${row.length}`);
    [...row].forEach((ch, x) => {
      if (ch === "#") walls.add(keyOf(x, y));
      if (ch === "P") player = { x, y };
      if (ch === "G") goal = { x, y };
      if (ch === "K") key = { x, y, taken: false };
      if (ch === "D") door = { x, y, open: false };
      if (ch === "T") switches.push({ x, y, color: "green" });
      if (ch === "X") gates.push({ x, y, color: "green" });
      if (ch === "U") switches.push({ x, y, color: "blue" });
      if (ch === "Y") gates.push({ x, y, color: "blue" });
      if (ch === "B") blocks.push({ x, y });
      if (ONE_WAY_CHARS[ch]) oneWays.push({ x, y, dir: ONE_WAY_CHARS[ch] });
    });
  });

  return {
    levelIndex: index,
    size: level.size,
    walls,
    player,
    goal,
    key,
    door,
    switches,
    gates,
    blocks,
    oneWays,
    gatesOpen: {},
    enemies: structuredClone(level.enemies),
    moves: 0,
  };
}

function currentEnemyPos(enemy) {
  if (enemy.type === "patrol") {
    const [x, y] = enemy.route[enemy.index];
    return { x, y };
  }
  return { x: enemy.x, y: enemy.y };
}

function hasEnemyAt(state, x, y) {
  return state.enemies.some((enemy) => same(currentEnemyPos(enemy), { x, y }));
}

function blockAt(state, x, y) {
  return state.blocks.find((block) => same(block, { x, y }));
}

function hasBlockAt(state, x, y) {
  return Boolean(blockAt(state, x, y));
}

function isBlocked(state, x, y, ignoreDoor = false) {
  if (x < 0 || y < 0 || x >= state.size || y >= state.size) return true;
  if (state.walls.has(keyOf(x, y))) return true;
  if (hasBlockAt(state, x, y)) return true;
  if (!ignoreDoor && state.door && !state.door.open && same({ x, y }, state.door)) return true;
  if (!ignoreDoor && state.gates.some((gate) => same({ x, y }, gate) && !isGateOpen(state, gate))) return true;
  return false;
}

function isGateOpen(state, gate) {
  return Boolean(state.gatesOpen?.[gate.color]);
}

function oneWayAt(state, pos) {
  return state.oneWays.find((tile) => same(tile, pos));
}

function canLeave(state, pos, action) {
  const tile = oneWayAt(state, pos);
  return !tile || tile.dir === action;
}

function nextPatrol(enemy) {
  let nextIndex = enemy.index + (enemy.forward ? 1 : -1);
  let forward = enemy.forward;
  if (nextIndex >= enemy.route.length || nextIndex < 0) {
    forward = !forward;
    nextIndex = enemy.index + (forward ? 1 : -1);
  }
  return { ...enemy, index: nextIndex, forward };
}

function nextPatrolForState(state, enemy) {
  let nextIndex = enemy.index + (enemy.forward ? 1 : -1);
  let forward = enemy.forward;
  if (nextIndex >= enemy.route.length || nextIndex < 0) {
    forward = !forward;
    nextIndex = enemy.index + (forward ? 1 : -1);
  }
  const [x, y] = enemy.route[nextIndex];
  if (isBlocked(state, x, y)) return { ...enemy, forward: !forward };
  return { ...enemy, index: nextIndex, forward };
}

function nextChaser(state, enemy, player) {
  const options = [];
  const dx = Math.sign(player.x - enemy.x);
  const dy = Math.sign(player.y - enemy.y);
  if (Math.abs(player.x - enemy.x) >= Math.abs(player.y - enemy.y)) {
    options.push({ x: enemy.x + dx, y: enemy.y });
    options.push({ x: enemy.x, y: enemy.y + dy });
  } else {
    options.push({ x: enemy.x, y: enemy.y + dy });
    options.push({ x: enemy.x + dx, y: enemy.y });
  }
  options.push({ x: enemy.x, y: enemy.y });
  const next = options.find((p) => !isBlocked(state, p.x, p.y));
  return { ...enemy, x: next.x, y: next.y };
}

function projectEnemies(state, player = state.player) {
  return state.enemies.map((enemy) => {
    if (enemy.type === "patrol") return nextPatrolForState(state, enemy);
    if (enemy.type === "chaser") return nextChaser(state, enemy, player);
    return { ...enemy };
  });
}

function sightCells(state) {
  const cells = new Set();
  state.enemies.forEach((enemy) => {
    if (enemy.type !== "sentry") return;
    const start = currentEnemyPos(enemy);
    const dir = DIRS[enemy.dir];
    let x = start.x + dir.x;
    let y = start.y + dir.y;
    while (!isBlocked(state, x, y, true)) {
      cells.add(keyOf(x, y));
      if (state.door && !state.door.open && same({ x, y }, state.door)) break;
      if (state.gates.some((gate) => same({ x, y }, gate) && !isGateOpen(state, gate))) break;
      x += dir.x;
      y += dir.y;
    }
  });
  return cells;
}

function encode(state) {
  const enemies = state.enemies.map((enemy) => {
    if (enemy.type === "patrol") return `${enemy.type}:${enemy.index}:${enemy.forward ? 1 : 0}`;
    if (enemy.type === "chaser") return `${enemy.type}:${enemy.x},${enemy.y}`;
    return `${enemy.type}:${enemy.x},${enemy.y}:${enemy.dir}`;
  }).join("|");
  return [
    state.player.x,
    state.player.y,
    state.key?.taken ? 1 : 0,
    state.door?.open ? 1 : 0,
    JSON.stringify(state.gatesOpen),
    state.blocks.map((block) => `${block.x},${block.y}`).join(";"),
    enemies,
  ].join("/");
}

function cloneState(state) {
  return {
    ...state,
    walls: state.walls,
    player: { ...state.player },
    key: state.key ? { ...state.key } : null,
    door: state.door ? { ...state.door } : null,
    switches: state.switches,
    gates: state.gates,
    blocks: structuredClone(state.blocks),
    oneWays: state.oneWays,
    enemies: structuredClone(state.enemies),
  };
}

function applyTileEffects(state) {
  if (state.key && !state.key.taken && same(state.player, state.key)) {
    state.key.taken = true;
    if (state.door) state.door.open = true;
  }
  updateSwitches(state);
}

function updateSwitches(state) {
  const colors = [...new Set(state.gates.map((gate) => gate.color))];
  state.gatesOpen = Object.fromEntries(colors.map((color) => {
    const switches = state.switches.filter((button) => button.color === color);
    const open = switches.length > 0 && switches.every((button) => same(button, state.player) || state.blocks.some((block) => same(block, button)));
    return [color, open];
  }));
}

function step(state, action) {
  const next = cloneState(state);
  const dir = DIRS[action];
  if (action !== "wait" && !canLeave(next, next.player, action)) return null;
  const player = { x: next.player.x + dir.x, y: next.player.y + dir.y };
  const pushedBlock = action !== "wait" ? blockAt(next, player.x, player.y) : null;
  if (pushedBlock) {
    if (!canLeave(next, pushedBlock, action)) return null;
    const nextBlock = { x: pushedBlock.x + dir.x, y: pushedBlock.y + dir.y };
    if (isBlocked(next, nextBlock.x, nextBlock.y) || hasEnemyAt(next, nextBlock.x, nextBlock.y)) return null;
    pushedBlock.x = nextBlock.x;
    pushedBlock.y = nextBlock.y;
  } else if (action !== "wait" && isBlocked(next, player.x, player.y)) {
    return null;
  }
  if (action !== "wait" && hasEnemyAt(next, player.x, player.y)) return null;
  next.player = player;
  next.moves += 1;
  applyTileEffects(next);
  next.enemies = projectEnemies(next, next.player);

  const occupied = next.enemies.some((enemy) => same(currentEnemyPos(enemy), next.player));
  const seen = sightCells(next).has(keyOf(next.player.x, next.player.y));
  if (occupied || seen) return null;
  return next;
}

function solve(level, index) {
  const start = parseLevel(level, index);
  updateSwitches(start);
  const illegalOverlap = start.enemies.some((enemy) => {
    const p = currentEnemyPos(enemy);
    return hasBlockAt(start, p.x, p.y);
  });
  if (illegalOverlap) throw new Error(`Stage ${index + 1} starts with an enemy on a block`);
  const queue = [{ state: start, path: [] }];
  const seen = new Set([encode(start)]);
  while (queue.length) {
    const { state, path } = queue.shift();
    if (same(state.player, state.goal)) return path;
    if (path.length > 80) continue;
    for (const action of ["up", "down", "left", "right", "wait"]) {
      const next = step(state, action);
      if (!next) continue;
      const key = encode(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: next, path: [...path, DIRS[action].mark] });
    }
  }
  return null;
}

let failed = false;
levels.forEach((level, index) => {
  const path = solve(level, index);
  if (!path) {
    failed = true;
    console.log(`${index + 1}. ${level.name}: UNSOLVED`);
  } else {
    console.log(`${index + 1}. ${level.name}: ${path.length}手 ${path.join(" ")}`);
  }
});

if (failed) process.exit(1);
