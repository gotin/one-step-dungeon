/**
 * BFS solver for One Step Dungeon stages.
 * State: { player, blocks, gatesOpen, enemies, key, door }
 * Returns minimum moves to reach goal, or -1 if unsolvable (within limit).
 */

const DIRS = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

const ONE_WAY_CHARS = { "^": "up", v: "down", "<": "left", ">": "right" };

function parseLevel(level) {
	const walls = new Set();
	let player = null,
		goal = null,
		key = null,
		door = null;
	const switches = [],
		gates = [],
		blocks = [],
		oneWays = [];

	level.map.forEach((row, y) => {
		[...row].forEach((ch, x) => {
			if (ch === "#") walls.add(`${x},${y}`);
			if (ch === "P") player = { x, y };
			if (ch === "G") goal = { x, y };
			if (ch === "K") key = { x, y, taken: false };
			if (ch === "D") door = { x, y, open: false };
			if (ch === "T") switches.push({ x, y, color: "green" });
			if (ch === "X") gates.push({ x, y, color: "green" });
			if (ch === "U") switches.push({ x, y, color: "blue" });
			if (ch === "Y") gates.push({ x, y, color: "blue" });
			if (ch === "B") blocks.push({ x, y });
			if (ch === "*") {
				blocks.push({ x, y });
				switches.push({ x, y, color: "green" });
			}
			if (ch === "+") {
				player = { x, y };
				switches.push({ x, y, color: "green" });
			}
			if (ONE_WAY_CHARS[ch]) oneWays.push({ x, y, dir: ONE_WAY_CHARS[ch] });
		});
	});

	return {
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
		enemies: level.enemies || [],
	};
}

function posKey(x, y) {
	return `${x},${y}`;
}
function same(a, b) {
	return a && b && a.x === b.x && a.y === b.y;
}

function computeGatesOpen(switches, blocks, player, gates) {
	const colors = [...new Set(gates.map((g) => g.color))];
	const result = {};
	for (const color of colors) {
		const sw = switches.filter((s) => s.color === color);
		result[color] =
			sw.length > 0 &&
			sw.every((s) => same(s, player) || blocks.some((b) => same(b, s)));
	}
	return result;
}

function isBlocked(
	x,
	y,
	size,
	walls,
	blocks,
	gatesOpen,
	gates,
	door,
	ignoreDoor = false,
) {
	if (x < 0 || y < 0 || x >= size || y >= size) return true;
	if (walls.has(posKey(x, y))) return true;
	if (blocks.some((b) => same(b, { x, y }))) return true;
	if (!ignoreDoor && door && !door.open && same({ x, y }, door)) return true;
	if (
		!ignoreDoor &&
		gates.some((g) => same({ x, y }, g) && !gatesOpen[g.color])
	)
		return true;
	return false;
}

function canLeavePos(x, y, dirName, oneWays) {
	const tile = oneWays.find((t) => same(t, { x, y }));
	return !tile || tile.dir === dirName;
}

// Sentry sight check (static sentries only for BFS simplification)
function isInSight(
	px,
	py,
	size,
	walls,
	blocks,
	gatesOpen,
	gates,
	door,
	enemies,
) {
	for (const e of enemies) {
		if (e.type !== "sentry") continue;
		const dir = DIRS[e.dir];
		let x = e.x + dir.x,
			y = e.y + dir.y;
		while (
			!isBlocked(x, y, size, walls, blocks, gatesOpen, gates, door, true)
		) {
			if (door && !door.open && same({ x, y }, door)) break;
			if (gates.some((g) => same({ x, y }, g) && !gatesOpen[g.color])) break;
			if (x === px && y === py) return true;
			x += dir.x;
			y += dir.y;
		}
	}
	return false;
}

// Patrol next position
function nextPatrol(e, size, walls, blocks, gatesOpen, gates, door) {
	let idx = e.index + (e.forward ? 1 : -1);
	let fwd = e.forward;
	if (idx >= e.route.length || idx < 0) {
		fwd = !fwd;
		idx = e.index + (fwd ? 1 : -1);
	}
	const [nx, ny] = e.route[idx];
	if (isBlocked(nx, ny, size, walls, blocks, gatesOpen, gates, door))
		return { ...e, forward: !fwd };
	return { ...e, index: idx, forward: fwd };
}

// Chaser next position
function nextChaser(e, px, py, size, walls, blocks, gatesOpen, gates, door) {
	const dx = Math.sign(px - e.x),
		dy = Math.sign(py - e.y);
	const opts =
		Math.abs(px - e.x) >= Math.abs(py - e.y)
			? [
					{ x: e.x + dx, y: e.y },
					{ x: e.x, y: e.y + dy },
				]
			: [
					{ x: e.x, y: e.y + dy },
					{ x: e.x + dx, y: e.y },
				];
	opts.push({ x: e.x, y: e.y });
	const next = opts.find(
		(p) => !isBlocked(p.x, p.y, size, walls, blocks, gatesOpen, gates, door),
	);
	return { ...e, x: next.x, y: next.y };
}

function currentEnemyPos(e) {
	if (e.type === "patrol") {
		const [x, y] = e.route[e.index];
		return { x, y };
	}
	return { x: e.x, y: e.y };
}

function hasEnemyAt(enemies, x, y) {
	return enemies.some((e) => same(currentEnemyPos(e), { x, y }));
}

function makeStartState(parsed) {
	const blocks = parsed.blocks.map((b) => ({ ...b }));
	const key = parsed.key ? { ...parsed.key } : null;
	const door = parsed.door ? { ...parsed.door } : null;
	return {
		player: { ...parsed.player },
		blocks,
		key,
		door,
		gatesOpen: computeGatesOpen(
			parsed.switches,
			blocks,
			parsed.player,
			parsed.gates,
		),
		enemies: JSON.parse(JSON.stringify(parsed.enemies)),
		moves: 0,
	};
}

function advance(parsed, cur, action) {
	const {
		size,
		walls,
		switches,
		gates,
		oneWays,
		enemies: _initEnemies,
	} = parsed;
	let newPlayer = { ...cur.player };
	let newBlocks = cur.blocks.map((b) => ({ ...b }));
	let newKey = cur.key ? { ...cur.key } : null;
	let newDoor = cur.door ? { ...cur.door } : null;
	let gO = { ...cur.gatesOpen };
	let pushed = false;
	let keyTaken = false;

	if (action !== "wait") {
		const dir = DIRS[action];
		if (!canLeavePos(newPlayer.x, newPlayer.y, action, oneWays)) return null;
		const nx = newPlayer.x + dir.x;
		const ny = newPlayer.y + dir.y;
		const pushedIdx = newBlocks.findIndex((b) => same(b, { x: nx, y: ny }));

		if (pushedIdx >= 0) {
			const pb = newBlocks[pushedIdx];
			if (!canLeavePos(pb.x, pb.y, action, oneWays)) return null;
			const bnx = pb.x + dir.x;
			const bny = pb.y + dir.y;
			if (
				isBlocked(
					bnx,
					bny,
					size,
					walls,
					newBlocks.filter((_, i) => i !== pushedIdx),
					gO,
					gates,
					newDoor,
				) ||
				hasEnemyAt(cur.enemies, bnx, bny)
			)
				return null;
			newBlocks = newBlocks.map((b, i) =>
				i === pushedIdx ? { x: bnx, y: bny } : b,
			);
			newPlayer = { x: nx, y: ny };
			pushed = true;
		} else {
			if (isBlocked(nx, ny, size, walls, newBlocks, gO, gates, newDoor))
				return null;
			if (hasEnemyAt(cur.enemies, nx, ny)) return null;
			newPlayer = { x: nx, y: ny };
		}

		if (newKey && !newKey.taken && same(newPlayer, newKey)) {
			newKey = { ...newKey, taken: true };
			keyTaken = true;
			if (newDoor) newDoor = { ...newDoor, open: true };
		}
	}

	const prevGates = JSON.stringify(gO);
	gO = computeGatesOpen(switches, newBlocks, newPlayer, gates);
	const gateChanged = JSON.stringify(gO) !== prevGates;
	const newEnemies = cur.enemies.map((e) => {
		if (e.type === "patrol")
			return nextPatrol(e, size, walls, newBlocks, gO, gates, newDoor);
		if (e.type === "chaser")
			return nextChaser(
				e,
				newPlayer.x,
				newPlayer.y,
				size,
				walls,
				newBlocks,
				gO,
				gates,
				newDoor,
			);
		return { ...e };
	});
	if (newEnemies.some((e) => same(currentEnemyPos(e), newPlayer))) return null;
	if (
		isInSight(
			newPlayer.x,
			newPlayer.y,
			size,
			walls,
			newBlocks,
			gO,
			gates,
			newDoor,
			newEnemies,
		)
	)
		return null;
	// ゲートが閉じてプレイヤーがその上に立ってしまった場合は無効
	if (gates.some((g) => same(g, newPlayer) && !gO[g.color])) return null;

	return {
		state: {
			player: newPlayer,
			blocks: newBlocks,
			key: newKey,
			door: newDoor,
			gatesOpen: gO,
			enemies: newEnemies,
			moves: cur.moves + 1,
		},
		pushed,
		keyTaken,
		gateChanged,
	};
}

function stateKey(player, blocks, key, door, gatesOpen, enemies) {
	const b = blocks
		.map((b) => `${b.x},${b.y}`)
		.sort()
		.join("|");
	const g = JSON.stringify(gatesOpen);
	const k = key ? (key.taken ? "1" : "0") : "-";
	const d = door ? (door.open ? "1" : "0") : "-";
	const ep = enemies
		.map((e) => {
			const p = currentEnemyPos(e);
			return `${p.x},${p.y}`;
		})
		.join("|");
	return `${player.x},${player.y};${b};${k};${d};${g};${ep}`;
}

export function solve(level, maxMoves = 30) {
	const parsed = parseLevel(level);
	const {
		size,
		walls,
		goal,
		switches,
		gates,
		oneWays,
		enemies: initEnemies,
	} = parsed;

	// Initial state
	const initBlocks = parsed.blocks.map((b) => ({ ...b }));
	const initKey = parsed.key ? { ...parsed.key } : null;
	const initDoor = parsed.door ? { ...parsed.door } : null;
	const initGatesOpen = computeGatesOpen(
		switches,
		initBlocks,
		parsed.player,
		gates,
	);
	const initEnemiesCopy = JSON.parse(JSON.stringify(initEnemies));

	const startState = {
		player: { ...parsed.player },
		blocks: initBlocks,
		key: initKey,
		door: initDoor,
		gatesOpen: initGatesOpen,
		enemies: initEnemiesCopy,
		moves: 0,
	};

	const visited = new Set();
	visited.add(
		stateKey(
			startState.player,
			startState.blocks,
			startState.key,
			startState.door,
			startState.gatesOpen,
			startState.enemies,
		),
	);

	const queue = [startState];

	while (queue.length > 0) {
		const cur = queue.shift();
		if (cur.moves >= maxMoves) continue;

		const actions = ["up", "down", "left", "right", "wait"];
		for (const action of actions) {
			let newPlayer = { ...cur.player };
			let newBlocks = cur.blocks.map((b) => ({ ...b }));
			let newKey = cur.key ? { ...cur.key } : null;
			let newDoor = cur.door ? { ...cur.door } : null;
			let gO = { ...cur.gatesOpen };

			if (action === "wait") {
				// just advance enemies
			} else {
				const dir = DIRS[action];
				// Check can leave current cell
				if (!canLeavePos(newPlayer.x, newPlayer.y, action, oneWays)) continue;

				const nx = newPlayer.x + dir.x,
					ny = newPlayer.y + dir.y;
				const pushedIdx = newBlocks.findIndex((b) => same(b, { x: nx, y: ny }));

				if (pushedIdx >= 0) {
					// pushing a block
					const pb = newBlocks[pushedIdx];
					if (!canLeavePos(pb.x, pb.y, action, oneWays)) continue;
					const bnx = pb.x + dir.x,
						bny = pb.y + dir.y;
					if (
						isBlocked(
							bnx,
							bny,
							size,
							walls,
							newBlocks.filter((_, i) => i !== pushedIdx),
							gO,
							gates,
							newDoor,
						) ||
						hasEnemyAt(cur.enemies, bnx, bny)
					)
						continue;
					newBlocks = newBlocks.map((b, i) =>
						i === pushedIdx ? { x: bnx, y: bny } : b,
					);
					newPlayer = { x: nx, y: ny };
				} else {
					if (isBlocked(nx, ny, size, walls, newBlocks, gO, gates, newDoor))
						continue;
					if (hasEnemyAt(cur.enemies, nx, ny)) continue;
					newPlayer = { x: nx, y: ny };
				}

				// Key pickup
				if (newKey && !newKey.taken && same(newPlayer, newKey)) {
					newKey = { ...newKey, taken: true };
					if (newDoor) newDoor = { ...newDoor, open: true };
				}
			}

			// Update gates
			gO = computeGatesOpen(switches, newBlocks, newPlayer, gates);

			// Advance enemies
			const newEnemies = cur.enemies.map((e) => {
				if (e.type === "patrol")
					return nextPatrol(e, size, walls, newBlocks, gO, gates, newDoor);
				if (e.type === "chaser")
					return nextChaser(
						e,
						newPlayer.x,
						newPlayer.y,
						size,
						walls,
						newBlocks,
						gO,
						gates,
						newDoor,
					);
				return { ...e };
			});

			// Check loss: enemy on player
			const occupied = newEnemies.some((e) =>
				same(currentEnemyPos(e), newPlayer),
			);
			if (occupied) continue;

			// Check loss: in sentry sight
			if (
				isInSight(
					newPlayer.x,
					newPlayer.y,
					size,
					walls,
					newBlocks,
					gO,
					gates,
					newDoor,
					newEnemies,
				)
			)
				continue;

			// Check win
			if (same(newPlayer, goal)) {
				return cur.moves + 1;
			}

			const sk = stateKey(
				newPlayer,
				newBlocks,
				newKey,
				newDoor,
				gO,
				newEnemies,
			);
			if (visited.has(sk)) continue;
			visited.add(sk);

			queue.push({
				player: newPlayer,
				blocks: newBlocks,
				key: newKey,
				door: newDoor,
				gatesOpen: gO,
				enemies: newEnemies,
				moves: cur.moves + 1,
			});
		}
	}
	return -1; // unsolvable within maxMoves
}

export function solveWithPath(level, maxMoves = 30) {
	const parsed = parseLevel(level);
	const {
		size,
		walls,
		goal,
		switches,
		gates,
		oneWays,
		enemies: initEnemies,
	} = parsed;
	const initBlocks = parsed.blocks.map((b) => ({ ...b }));
	const initKey = parsed.key ? { ...parsed.key } : null;
	const initDoor = parsed.door ? { ...parsed.door } : null;
	const initGatesOpen = computeGatesOpen(
		switches,
		initBlocks,
		parsed.player,
		gates,
	);
	const initEnemiesCopy = JSON.parse(JSON.stringify(initEnemies));
	const startState = {
		player: { ...parsed.player },
		blocks: initBlocks,
		key: initKey,
		door: initDoor,
		gatesOpen: initGatesOpen,
		enemies: initEnemiesCopy,
		moves: 0,
		path: [],
	};
	const visited = new Set();
	visited.add(
		stateKey(
			startState.player,
			startState.blocks,
			startState.key,
			startState.door,
			startState.gatesOpen,
			startState.enemies,
		),
	);
	const queue = [startState];
	while (queue.length > 0) {
		const cur = queue.shift();
		if (cur.moves >= maxMoves) continue;
		for (const action of ["up", "down", "left", "right", "wait"]) {
			let newPlayer = { ...cur.player };
			let newBlocks = cur.blocks.map((b) => ({ ...b }));
			let newKey = cur.key ? { ...cur.key } : null;
			let newDoor = cur.door ? { ...cur.door } : null;
			let gO = { ...cur.gatesOpen };
			if (action !== "wait") {
				const dir = DIRS[action];
				if (!canLeavePos(newPlayer.x, newPlayer.y, action, oneWays)) continue;
				const nx = newPlayer.x + dir.x,
					ny = newPlayer.y + dir.y;
				const pushedIdx = newBlocks.findIndex((b) => same(b, { x: nx, y: ny }));
				if (pushedIdx >= 0) {
					const pb = newBlocks[pushedIdx];
					if (!canLeavePos(pb.x, pb.y, action, oneWays)) continue;
					const bnx = pb.x + dir.x,
						bny = pb.y + dir.y;
					if (
						isBlocked(
							bnx,
							bny,
							size,
							walls,
							newBlocks.filter((_, i) => i !== pushedIdx),
							gO,
							gates,
							newDoor,
						) ||
						hasEnemyAt(cur.enemies, bnx, bny)
					)
						continue;
					newBlocks = newBlocks.map((b, i) =>
						i === pushedIdx ? { x: bnx, y: bny } : b,
					);
					newPlayer = { x: nx, y: ny };
				} else {
					if (isBlocked(nx, ny, size, walls, newBlocks, gO, gates, newDoor))
						continue;
					if (hasEnemyAt(cur.enemies, nx, ny)) continue;
					newPlayer = { x: nx, y: ny };
				}
				if (newKey && !newKey.taken && same(newPlayer, newKey)) {
					newKey = { ...newKey, taken: true };
					if (newDoor) newDoor = { ...newDoor, open: true };
				}
			}
			gO = computeGatesOpen(switches, newBlocks, newPlayer, gates);
			const newEnemies = cur.enemies.map((e) => {
				if (e.type === "patrol")
					return nextPatrol(e, size, walls, newBlocks, gO, gates, newDoor);
				if (e.type === "chaser")
					return nextChaser(
						e,
						newPlayer.x,
						newPlayer.y,
						size,
						walls,
						newBlocks,
						gO,
						gates,
						newDoor,
					);
				return { ...e };
			});
			if (newEnemies.some((e) => same(currentEnemyPos(e), newPlayer))) continue;
			if (
				isInSight(
					newPlayer.x,
					newPlayer.y,
					size,
					walls,
					newBlocks,
					gO,
					gates,
					newDoor,
					newEnemies,
				)
			)
				continue;
			// ゲートが閉じてプレイヤーがその上に立ってしまった場合は無効
			if (gates.some((g) => same(g, newPlayer) && !gO[g.color])) continue;
			if (same(newPlayer, goal)) return [...cur.path, action];
			const sk = stateKey(
				newPlayer,
				newBlocks,
				newKey,
				newDoor,
				gO,
				newEnemies,
			);
			if (visited.has(sk)) continue;
			visited.add(sk);
			queue.push({
				player: newPlayer,
				blocks: newBlocks,
				key: newKey,
				door: newDoor,
				gatesOpen: gO,
				enemies: newEnemies,
				moves: cur.moves + 1,
				path: [...cur.path, action],
			});
		}
	}
	return null;
}

const ACTION_MARKS = {
	up: "↑",
	down: "↓",
	left: "←",
	right: "→",
	wait: "…",
};

const OPPOSITE = {
	up: "down",
	down: "up",
	left: "right",
	right: "left",
};

function legalActionCount(parsed, state) {
	return ["up", "down", "left", "right", "wait"].filter((action) =>
		advance(parsed, state, action),
	).length;
}

function countReachableArea(parsed) {
	const queue = [parsed.player];
	const seen = new Set([posKey(parsed.player.x, parsed.player.y)]);
	while (queue.length) {
		const cur = queue.shift();
		for (const dir of Object.values(DIRS)) {
			const next = { x: cur.x + dir.x, y: cur.y + dir.y };
			const key = posKey(next.x, next.y);
			if (seen.has(key)) continue;
			if (
				next.x < 0 ||
				next.y < 0 ||
				next.x >= parsed.size ||
				next.y >= parsed.size ||
				parsed.walls.has(key)
			)
				continue;
			seen.add(key);
			queue.push(next);
		}
	}
	return seen.size;
}

function longestRun(actions) {
	let best = 0;
	let current = 0;
	let previous = null;
	for (const action of actions) {
		if (action === previous) current += 1;
		else current = 1;
		best = Math.max(best, current);
		previous = action;
	}
	return best;
}

export function analyzeLevel(level, maxMoves = 220) {
	const parsed = parseLevel(level);
	const path = solveWithPath(level, maxMoves);
	if (!path) {
		return { name: level.name, solved: false };
	}

	let state = makeStartState(parsed);
	let pushes = 0;
	let keyPickups = 0;
	let gateChanges = 0;
	let branchTotal = 0;
	let forcedSteps = 0;
	const visitedCells = new Set([posKey(state.player.x, state.player.y)]);
	const blockCells = new Set(
		state.blocks.map((block) => posKey(block.x, block.y)),
	);

	for (const action of path) {
		const branches = legalActionCount(parsed, state);
		branchTotal += branches;
		if (branches <= 1) forcedSteps += 1;
		const result = advance(parsed, state, action);
		if (!result) throw new Error(`Path replay failed on ${level.name}`);
		state = result.state;
		if (result.pushed) pushes += 1;
		if (result.keyTaken) keyPickups += 1;
		if (result.gateChanged) gateChanges += 1;
		visitedCells.add(posKey(state.player.x, state.player.y));
		state.blocks.forEach((block) => blockCells.add(posKey(block.x, block.y)));
	}

	let directionChanges = 0;
	let immediateBacktracks = 0;
	let actionChanges = 0;
	for (let i = 1; i < path.length; i += 1) {
		if (path[i] !== path[i - 1]) actionChanges += 1;
		if (path[i] !== "wait" && path[i - 1] !== "wait") {
			if (path[i] !== path[i - 1]) directionChanges += 1;
			if (OPPOSITE[path[i - 1]] === path[i]) immediateBacktracks += 1;
		}
	}

	const moves = path.length;
	const area = countReachableArea(parsed);
	const density = moves / Math.max(area, 1);
	const turnRate = directionChanges / Math.max(moves - 1, 1);
	const actionChangeRate = actionChanges / Math.max(moves - 1, 1);
	const pushRate = pushes / Math.max(moves, 1);
	const backtrackRate = immediateBacktracks / Math.max(moves - 1, 1);
	const branchAverage = branchTotal / Math.max(moves, 1);
	const forcedRate = forcedSteps / Math.max(moves, 1);
	const run = longestRun(path);
	const runRate = run / Math.max(moves, 1);
	const stateChanges = keyPickups + gateChanges;
	const explorationRate = visitedCells.size / Math.max(area, 1);
	const blockMobility = blockCells.size / Math.max(parsed.blocks.length || 1, 1);
	const noEnemyPath =
		(level.enemies?.length || 0) > 0
			? solveWithPath({ ...level, enemies: [] }, maxMoves)
			: null;
	const enemyImpact = noEnemyPath
		? Math.abs(noEnemyPath.length - moves) + (noEnemyPath.join(",") === path.join(",") ? 0 : 2)
		: 0;
	const hasKeyDoor = level.map.some((row) => row.includes("K") || row.includes("D"));
	const noKeyPath = hasKeyDoor
		? solveWithPath(
				{
					...level,
					map: level.map.map((row) => row.replace(/K/g, ".").replace(/D/g, ".")),
				},
				maxMoves,
			)
		: null;
	const keyImpact = noKeyPath
		? Math.abs(noKeyPath.length - moves) + (noKeyPath.join(",") === path.join(",") ? 0 : 2)
		: 0;

	const score =
		density * 18 +
		turnRate * 12 +
		actionChangeRate * 6 +
		pushRate * 22 +
		Math.log2(stateChanges + 1) * 8 +
		Math.log2(blockMobility + 1) * 5 +
		enemyImpact * 1.5 +
		Math.min(keyImpact, 8) * 1.5 +
		branchAverage * 2.5 +
		explorationRate * 4 -
		forcedRate * 5 -
		runRate * 7 -
		backtrackRate * 4;

	return {
		name: level.name,
		solved: true,
		score: Number(score.toFixed(2)),
		moves,
		area,
		density: Number(density.toFixed(2)),
		pushes,
		pushRate: Number(pushRate.toFixed(2)),
		directionChanges,
		turnRate: Number(turnRate.toFixed(2)),
		immediateBacktracks,
		branchAverage: Number(branchAverage.toFixed(2)),
		forcedRate: Number(forcedRate.toFixed(2)),
		longestRun: run,
		stateChanges,
		enemyImpact,
		keyImpact,
		blockMobility: Number(blockMobility.toFixed(2)),
		path: path.map((action) => ACTION_MARKS[action]).join(" "),
	};
}

if (process.argv[1]?.endsWith("solver.mjs")) {
	const fs = await import("node:fs");
	const vm = await import("node:vm");

	// 引数パース: ファイルパスと任意のステージ番号フィルタを分離
	// 使い方例:
	//   node solver.mjs                          → 全ステージ (game.js)
	//   node solver.mjs game.js                  → 全ステージ
	//   node solver.mjs game.js 37               → ステージ37のみ
	//   node solver.mjs game.js 37 38            → ステージ37・38
	//   node solver.mjs game.js 1-5              → ステージ1〜5
	//   node solver.mjs game.js 1-5 37 38        → 混在可
	//   node solver.mjs 37 38                    → game.jsを暗黙使用 + ステージ指定
	const args = process.argv.slice(2);
	let file = "outputs/one-step-dungeon/game.js";
	const stageTokens = [];

	for (const arg of args) {
		if (arg.endsWith(".js") || arg.endsWith(".mjs") || arg.includes("/") || arg.includes("\\")) {
			file = arg;
		} else {
			stageTokens.push(arg);
		}
	}

	// ステージ番号セットを構築 (1-based)
	const targetSet = new Set();
	for (const token of stageTokens) {
		if (token.includes("-")) {
			const [from, to] = token.split("-").map(Number);
			for (let i = from; i <= to; i++) targetSet.add(i);
		} else {
			targetSet.add(Number(token));
		}
	}
	const filterAll = targetSet.size === 0;

	const source = fs.readFileSync(file, "utf8");
	const match = source.match(/const LEVELS = (\[[\s\S]*?\n\]);/);
	if (!match) throw new Error("LEVELS not found");
	const context = {};
	vm.createContext(context);
	vm.runInContext(`levels = ${match[1]}`, context);

	const targets = context.levels
		.map((level, i) => ({ level, index: i }))
		.filter(({ index }) => filterAll || targetSet.has(index + 1));

	if (targets.length === 0) {
		console.error(`指定したステージが見つかりません: ${[...targetSet].join(", ")}`);
		process.exit(1);
	}

	const analyses = targets.map(({ level, index }) => ({
		stageNum: index + 1,
		...analyzeLevel(level, 240),
	}));

	analyses.forEach((a) => {
		if (!a.solved) {
			console.log(`${a.stageNum}. ${a.name}: UNSOLVED`);
			return;
		}
		console.log(
			[
				`${a.stageNum}. ${a.name}`,
				`score=${a.score}`,
				`moves=${a.moves}`,
				`density=${a.density}`,
				`pushes=${a.pushes}`,
				`turnRate=${a.turnRate}`,
				`branch=${a.branchAverage}`,
				`run=${a.longestRun}`,
				`state=${a.stateChanges}`,
				`enemy=${a.enemyImpact}`,
				`key=${a.keyImpact}`,
			].join(" | "),
		);
	});
}
