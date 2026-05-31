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
						)
					)
						continue;
					newBlocks = newBlocks.map((b, i) =>
						i === pushedIdx ? { x: bnx, y: bny } : b,
					);
					newPlayer = { x: nx, y: ny };
				} else {
					if (isBlocked(nx, ny, size, walls, newBlocks, gO, gates, newDoor))
						continue;
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
						)
					)
						continue;
					newBlocks = newBlocks.map((b, i) =>
						i === pushedIdx ? { x: bnx, y: bny } : b,
					);
					newPlayer = { x: nx, y: ny };
				} else {
					if (isBlocked(nx, ny, size, walls, newBlocks, gO, gates, newDoor))
						continue;
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
