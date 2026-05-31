const DIRS = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

const ONE_WAY_CHARS = {
	"^": "up",
	v: "down",
	"<": "left",
	">": "right",
};

const LEVELS = [
	{
		name: "追跡者を誘う",
		size: 7,
		map: [
			"#######",
			"#P....#",
			"#.###.#",
			"#...#G#",
			"#.#...#",
			"#.....#",
			"#######",
		],
		enemies: [{ type: "chaser", x: 5, y: 4 }],
	},
	{
		name: "横切る影",
		size: 7,
		map: [
			"#######",
			"#P....#",
			"#.###.#",
			"#...G.#",
			"#.###.#",
			"#.....#",
			"#######",
		],
		enemies: [
			{
				type: "patrol",
				route: [
					[2, 1],
					[3, 1],
					[4, 1],
					[5, 1],
				],
				index: 0,
				forward: true,
			},
			{ type: "sentry", x: 5, y: 5, dir: "left" },
		],
	},
	{
		name: "巡回を待つ",
		size: 6,
		map: ["######", "#P...#", "#.##.#", "#K...#", "#D.G.#", "######"],
		enemies: [
			{
				type: "patrol",
				route: [
					[3, 1],
					[4, 1],
					[4, 2],
					[4, 3],
					[3, 3],
				],
				index: 0,
				forward: true,
			},
		],
	},
	{
		name: "視線をふさぐ石",
		size: 10,
		map: [
			"##########",
			"#P.....###",
			"#.......##",
			"#...B.G.S#",
			"#........#",
			"#........#",
			"#........#",
			"#........#",
			"#........#",
			"##########",
		],
		enemies: [{ type: "sentry", x: 8, y: 3, dir: "left" }],
	},
	{
		name: "巡回兵の隙をつく",
		size: 8,
		map: [
			"########",
			"#P.....#",
			"#......#",
			"#...K..#",
			"#.....##",
			"#####D##",
			"#####G##",
			"########",
		],
		enemies: [
			{
				type: "patrol",
				route: [
					[2, 3],
					[3, 3],
					[4, 3],
					[5, 3],
					[6, 3],
				],
				index: 0,
				forward: true,
			},
		],
	},
	{
		name: "鍵を先に",
		size: 7,
		map: [
			"#######",
			"#P#...#",
			"#.#.#G#",
			"#...#D#",
			"#.###.#",
			"#K....#",
			"#######",
		],
		enemies: [{ type: "sentry", x: 3, y: 3, dir: "right" }],
	},
	{
		name: "一方通行の石",
		size: 10,
		map: [
			"##########",
			"#P....####",
			"#..B>.####",
			"#..T>XG###",
			"#......###",
			"#........#",
			"#........#",
			"#........#",
			"#........#",
			"##########",
		],
		enemies: [],
	},
	{
		// Microban #38 ベース / 17手
		name: "四方への配達",
		size: 12,
		map: [
			"############",
			"#.##########",
			"#.##T#######",
			"#.#.BB.T####",
			"#.T.PB....X#",
			"#####.####.#",
			"##########.#",
			"##########G#",
		],
		enemies: [],
	},
	{
		name: "見張りの廊下",
		size: 6,
		map: ["######", "#P...#", "#..S.#", "#.##K#", "#GD..#", "######"],
		enemies: [{ type: "sentry", x: 3, y: 2, dir: "left" }],
	},
	{
		name: "色と矢印",
		size: 11,
		map: [
			"###########",
			"#P.....####",
			"#..B>..####",
			"#..T.X.YG##",
			"#..U#######",
			"#....B....#",
			"#....^....#",
			"#.........#",
			"#.........#",
			"#.........#",
			"###########",
		],
		enemies: [],
	},
	{
		name: "鍵と石",
		size: 10,
		map: [
			"##########",
			"#P...K####",
			"#....#####",
			"#..B.DXG##",
			"#..T######",
			"#........#",
			"#........#",
			"#........#",
			"#........#",
			"##########",
		],
		enemies: [],
	},
	{
		name: "二色の倉庫",
		size: 10,
		map: [
			"##########",
			"#P....####",
			"#..B..####",
			"#..T.XYG##",
			"#..U######",
			"#...B....#",
			"#........#",
			"#........#",
			"#........#",
			"##########",
		],
		enemies: [],
	},
	{
		// Microban #17 をベースに変換 / 最小8手
		name: "横並びを崩せ",
		size: 7,
		map: [
			"#######",
			"#.P..##",
			"#TTT.XG",
			"#BBB..#",
			"#.....#",
			"#.....#",
			"#######",
		],
		enemies: [],
	},
	{
		// 緑と青のゲートを別々の石で維持する空気室 / 最小28手
		name: "二色の空気室",
		size: 12,
		map: [
			"############",
			"#P..B.....#",
			"#.##.###..#",
			"#..T...#..#",
			"###.##.#..#",
			"#...B..U..#",
			"#.####.##Y#",
			"#....K.DXG#",
			"#.#########",
			"#.........#",
			"#.........#",
			"############",
		],
		enemies: [],
	},
	{
		name: "石の置き場所",
		size: 8,
		map: [
			"########",
			"#P...###",
			"#..B.###",
			"#..#.XG#",
			"#..T.###",
			"#......#",
			"#......#",
			"########",
		],
		enemies: [],
	},
	{
		name: "石で遮る",
		size: 8,
		map: [
			"########",
			"#P.....#",
			"#.B.T..#",
			"#...B..#",
			"#S....##",
			"#####X##",
			"#####G##",
			"########",
		],
		enemies: [{ type: "sentry", x: 1, y: 4, dir: "right" }],
	},
	{
		name: "見張りと巡回兵",
		size: 8,
		map: [
			"########",
			"#P.....#",
			"#....K.#",
			"#..B...#",
			"#S....##",
			"####D###",
			"####G###",
			"########",
		],
		enemies: [
			{
				type: "patrol",
				route: [
					[2, 2],
					[3, 2],
					[4, 2],
					[5, 2],
					[6, 2],
				],
				index: 0,
				forward: true,
			},
			{ type: "sentry", x: 1, y: 4, dir: "right" },
		],
	},
	{
		// Microban #31 (David W. Skinner / Public Domain) 本物のデータ
		// 石3つ・スイッチ3つ / 最小24手
		name: "斜めの置き場",
		size: 8,
		map: [
			"  ####  ",
			" ##  #  ",
			"##PBT###",
			"# BB  # ",
			"# T T ##",
			"###   XG",
			"  ######",
		],
		enemies: [],
	},
	{
		// 迷路倉庫番 / 69手
		name: "大迷宮",
		size: 14,
		map: [
			"##############",
			"#P...........#",
			"#B.......B..B#",
			"#.#########..#",
			"#.#.......#..#",
			"#.#.#####.#..#",
			"#.#.#...#.#..#",
			"#.#.#...#.#..#",
			"#...#...#.#..#",
			"#...#...###..#",
			"#...#........#",
			"#T.......T..T#",
			"########X#####",
			"########G#####",
		],
		enemies: [],
	},
	{
		// 石2つ・スイッチ2つ / 最小21手
		name: "石は一個でいい",
		size: 7,
		map: [
			"######.",
			"#    #.",
			"# ##T#.",
			"# #  #.",
			"# BB ##",
			"## PTXG",
			"#######",
		],
		enemies: [],
	},
	{
		// Microban #45 をベースに変換 / 最小4手
		name: "縦に積む",
		size: 8,
		map: [
			"########",
			"#TTT. ##",
			"#.B...##",
			"#.#B..##",
			"#.B...##",
			"#.P..X##",
			"#####G##",
			"########",
		],
		enemies: [],
	},
	{
		// 小部屋で3つのスイッチを処理する高密度ステージ / 評価74
		name: "三倉庫の押し順",
		size: 7,
		map: [
			"####   ",
			"#  ### ",
			"# BB # ",
			"#TTT  #",
			"# PB XG",
			"#   ###",
			"#######",
		],
		enemies: [],
	},
	{
		// Microban #30 (David W. Skinner / Public Domain) 本物のデータ
		// 石3つ・スイッチ3つ / 最小28手
		name: "三つの帰り道",
		size: 7,
		map: [
			"####   ",
			"#  ### ",
			"# BB # ",
			"#TTT ##",
			"# PB XG",
			"#   ###",
			"#######",
		],
		enemies: [],
	},
	{
		// Microban #40 本物 / 24手
		name: "足場はスイッチ",
		size: 9,
		map: [
			" #####   ",
			" #   #   ",
			"##   ###.",
			"# BBB ###",
			"# T+T XG#",
			"#########",
		],
		enemies: [],
	},
	{
		name: "鍵と石の詰め",
		size: 11,
		map: [
			"###########",
			"#P....K####",
			"#.....#####",
			"#.B.DXG####",
			"##T########",
			"#....BT...#",
			"#.........#",
			"#.........#",
			"#.........#",
			"#.........#",
			"###########",
		],
		enemies: [],
	},
	{
		// Microban #34 本物 / 36手
		name: "最後の一押し",
		size: 11,
		map: [
			"  ####",
			"###  ####",
			"#       ###",
			"#PB***T XG#",
			"#       ###",
			"#########",
		],
		enemies: [],
	},
	{
		// Microban #6 ベース
		name: "二つの部屋",
		size: 12,
		map: [
			"######.#####",
			"#....###...#",
			"#.BB.....#P#",
			"#.B.#TTT...#",
			"#...######X#",
			"##########G#",
		],
		enemies: [],
	},
	{
		// 斜め配置の石を処理し、鍵扉と見張りの視線を抜ける / 評価74
		name: "斜めの鍵監視",
		size: 9,
		map: [
			"  ####   ",
			" ##  #   ",
			"##PBT### ",
			"# BB  #  ",
			"# T T K##",
			"###   DXG",
			"  #######",
		],
		enemies: [{ type: "sentry", x: 4, y: 1, dir: "down" }],
	},
	{
		// Microban #6 ベースに鍵扉を追加。石を解いたあと鍵を戻りで回収する / 最小112手
		name: "鍵つき二部屋",
		size: 12,
		map: [
			"######.#####",
			"#....###...#",
			"#.BB..K..#P#",
			"#.B.#TTT...#",
			"#...######X#",
			"##########DG",
		],
		enemies: [],
	},
	{
		// Microban #33 本物 / 49手
		name: "対称の罠",
		size: 9,
		map: [
			"#########",
			"#T #  ###",
			"#  B  ###",
			"#T B#P XG",
			"#  B  ###",
			"#T #  ###",
			"#########",
		],
		enemies: [],
	},
	{
		// Microban #33 ベース。対称配置の押し順を読む / 評価81
		name: "対称の押し順",
		size: 9,
		map: [
			"#########",
			"#T #  ###",
			"#  B  ###",
			"#T B#P XG",
			"#  B  ###",
			"#T #  ###",
			"#########",
		],
		enemies: [],
	},
	{
		// Microban #26
		name: "遠回りの石",
		size: 8,
		map: [
			" #####",
			" # P #",
			" #   ###",
			"###B XG#",
			"# TTT###",
			"# BB #",
			"###  #",
			" #####",
		],
		enemies: [],
	},
	{
		// Microban #30 をベースに、巡回兵のタイミング待ちを追加 / 最小37手
		name: "三つの帰り道と巡回",
		size: 7,
		map: [
			"####   ",
			"#  ### ",
			"# BB # ",
			"#TTT ##",
			"# PB XG",
			"#   ###",
			"#######",
		],
		enemies: [
			{
				type: "patrol",
				route: [
					[4, 5],
					[3, 5],
					[2, 5],
					[1, 5],
				],
				index: 1,
				forward: true,
			},
		],
	},
	{
		// Microban #27
		name: "二股の道",
		size: 9,
		map: [
			"######",
			"#   T#",
			"# ## ####",
			"#  BBPXG#",
			"# #   ###",
			"#T  ###",
			"#####",
		],
		enemies: [],
	},
	{
		// Microban #13 / size=9
		name: "縦一列に",
		size: 9,
		map: [
			"####",
			"#T ##",
			"#TP ###",
			"#T BXG#",
			"##B ###",
			"## B  #",
			"##    #",
			"##  ###",
			"#####",
		],
		enemies: [],
	},
	{
		// Microban #29 本物 / 109手
		name: "長い旅路",
		size: 11,
		map: [
			"     #####.",
			"   ###   ##",
			"   #GX    #",
			" ######   #",
			"##     #T #",
			"# B B P  ##",
			"# ######T #",
			"#         #",
			"###########",
		],
		enemies: [],
	},
	{
		// Microban #29 ベースに鍵扉を追加。長い戻り道の管理が必要 / 最小119手
		name: "長い旅路の鍵",
		size: 11,
		map: [
			"     #####.",
			"   ### K ##",
			"   #GX    #",
			" ######   #",
			"##     #T #",
			"# B B P  ##",
			"# ######T #",
			"#       D #",
			"###########",
		],
		enemies: [],
	},
];

const boardEl = document.querySelector("#board");
const messageEl = document.querySelector("#message");
const titleEl = document.querySelector("#level-title");
const moveEl = document.querySelector("#move-count");
const keyEl = document.querySelector("#key-state");
const undoBtn = document.querySelector("#undo");
const resetBtn = document.querySelector("#reset");
const waitBtn = document.querySelector("#wait");
const stageListEl = document.querySelector("#stage-list");
const clearDialogEl = document.querySelector("#clear-dialog");
const clearEyebrowEl = clearDialogEl.querySelector(".eyebrow");
const clearTitleEl = document.querySelector("#clear-title");
const clearDetailEl = document.querySelector("#clear-detail");
const nextStageBtn = document.querySelector("#next-stage");
const replayStageBtn = document.querySelector("#replay-stage");

let levelIndex = 0;
let state = null;
let history = [];
let best = JSON.parse(localStorage.getItem("one-step-best-v12") || "{}");
let touchStart = null;
let audioContext = null;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadLevel(index) {
	const level = LEVELS[index];
	const walls = new Set();
	let player = { x: 1, y: 1 };
	let goal = null;
	let key = null;
	let door = null;
	const switches = [];
	const gates = [];
	const blocks = [];
	const oneWays = [];

	level.map.forEach((row, y) => {
		[...row].forEach((ch, x) => {
			if (ch === "#") walls.add(posKey(x, y));
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

	state = {
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
		enemies: clone(level.enemies),
		moves: 0,
		won: false,
		lost: false,
	};
	updateSwitches();
	history = [];
	hideMessage();
	hideClearDialog();
	render();
}

function snapshot() {
	return {
		levelIndex: state.levelIndex,
		size: state.size,
		walls: [...state.walls],
		player: clone(state.player),
		goal: clone(state.goal),
		key: clone(state.key),
		door: clone(state.door),
		switches: clone(state.switches),
		gates: clone(state.gates),
		blocks: clone(state.blocks),
		oneWays: clone(state.oneWays),
		gatesOpen: state.gatesOpen,
		enemies: clone(state.enemies),
		moves: state.moves,
		won: state.won,
		lost: state.lost,
	};
}

function restore(snap) {
	state = {
		...snap,
		walls: new Set(snap.walls),
	};
	render();
}

function posKey(x, y) {
	return `${x},${y}`;
}

function same(a, b) {
	return a && b && a.x === b.x && a.y === b.y;
}

function isBlocked(x, y, ignoreDoor = false) {
	if (x < 0 || y < 0 || x >= state.size || y >= state.size) return true;
	if (state.walls.has(posKey(x, y))) return true;
	if (hasBlockAt(x, y)) return true;
	if (
		!ignoreDoor &&
		state.door &&
		!state.door.open &&
		same({ x, y }, state.door)
	)
		return true;
	if (
		!ignoreDoor &&
		state.gates?.some((gate) => same({ x, y }, gate) && !isGateOpen(gate))
	)
		return true;
	return false;
}

function isGateOpen(gate) {
	return Boolean(state.gatesOpen?.[gate.color]);
}

function currentEnemyPos(enemy) {
	if (enemy.type === "patrol") {
		const [x, y] = enemy.route[enemy.index];
		return { x, y };
	}
	return { x: enemy.x, y: enemy.y };
}

function hasEnemyAt(x, y) {
	return state.enemies.some((enemy) => same(currentEnemyPos(enemy), { x, y }));
}

function blockAt(x, y) {
	return state.blocks.find((block) => same(block, { x, y }));
}

function hasBlockAt(x, y) {
	return Boolean(blockAt(x, y));
}

function oneWayAt(pos) {
	return state.oneWays.find((tile) => same(tile, pos));
}

function canLeave(pos, dirName) {
	const tile = oneWayAt(pos);
	return !tile || tile.dir === dirName;
}

function nextPatrol(enemy) {
	let nextIndex = enemy.index + (enemy.forward ? 1 : -1);
	let forward = enemy.forward;
	if (nextIndex >= enemy.route.length || nextIndex < 0) {
		forward = !forward;
		nextIndex = enemy.index + (forward ? 1 : -1);
	}
	const [x, y] = enemy.route[nextIndex];
	if (isBlocked(x, y)) return { ...enemy, forward: !forward };
	return { ...enemy, index: nextIndex, forward };
}

function nextChaser(enemy, player) {
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
	const next = options.find((p) => !isBlocked(p.x, p.y));
	return { ...enemy, x: next.x, y: next.y };
}

function projectEnemies(player = state.player) {
	return state.enemies.map((enemy) => {
		if (enemy.type === "patrol") return nextPatrol(enemy);
		if (enemy.type === "chaser") return nextChaser(enemy, player);
		return { ...enemy };
	});
}

function sightCells(enemies = state.enemies) {
	const cells = new Map();
	enemies.forEach((enemy) => {
		if (enemy.type !== "sentry") return;
		const start = currentEnemyPos(enemy);
		const dir = DIRS[enemy.dir];
		let x = start.x + dir.x;
		let y = start.y + dir.y;
		while (!isBlocked(x, y, true)) {
			cells.set(posKey(x, y), enemy.dir);
			if (state.door && !state.door.open && same({ x, y }, state.door)) break;
			if (
				state.gates?.some((gate) => same({ x, y }, gate) && !isGateOpen(gate))
			)
				break;
			x += dir.x;
			y += dir.y;
		}
	});
	return cells;
}

function move(dirName) {
	if (state.won || state.lost) return;
	const dir = DIRS[dirName];
	if (!canLeave(state.player, dirName)) {
		playSound("miss");
		return pulse("矢印の向きにしか進めません");
	}
	const nextPlayer = { x: state.player.x + dir.x, y: state.player.y + dir.y };
	const pushedBlock = blockAt(nextPlayer.x, nextPlayer.y);
	if (pushedBlock) {
		if (!canLeave(pushedBlock, dirName)) {
			playSound("miss");
			return pulse("石は矢印の向きにしか押せません");
		}
		const nextBlock = { x: pushedBlock.x + dir.x, y: pushedBlock.y + dir.y };
		if (
			isBlocked(nextBlock.x, nextBlock.y) ||
			hasEnemyAt(nextBlock.x, nextBlock.y)
		) {
			playSound("miss");
			return pulse("石を押せません");
		}
		history.push(snapshot());
		pushedBlock.x = nextBlock.x;
		pushedBlock.y = nextBlock.y;
		state.player = nextPlayer;
		state.moves += 1;
		playSound("move");
		applyPlayerTileEffects();
		updateSwitches();
		state.enemies = projectEnemies(state.player);
		resolveTurn();
		render();
		return;
	}

	if (
		isBlocked(nextPlayer.x, nextPlayer.y) ||
		hasEnemyAt(nextPlayer.x, nextPlayer.y)
	) {
		playSound("miss");
		return pulse(
			hasEnemyAt(nextPlayer.x, nextPlayer.y)
				? "敵のいるマスには入れません"
				: "そこは通れません",
		);
	}

	history.push(snapshot());
	state.player = nextPlayer;
	state.moves += 1;
	playSound("move");

	applyPlayerTileEffects();
	updateSwitches();

	const futureEnemies = projectEnemies(state.player);
	state.enemies = futureEnemies;
	resolveTurn();
	render();
}

function waitTurn() {
	if (state.won || state.lost) return;
	history.push(snapshot());
	state.moves += 1;
	playSound("move");
	state.enemies = projectEnemies(state.player);
	resolveTurn();
	render();
}

function applyPlayerTileEffects() {
	if (state.key && !state.key.taken && same(state.player, state.key)) {
		state.key.taken = true;
		if (state.door) state.door.open = true;
	}
}

function updateSwitches() {
	const colors = [...new Set(state.gates.map((gate) => gate.color))];
	state.gatesOpen = Object.fromEntries(
		colors.map((color) => {
			const switches = state.switches.filter(
				(button) => button.color === color,
			);
			const open =
				switches.length > 0 &&
				switches.every(
					(button) =>
						same(button, state.player) ||
						state.blocks.some((block) => same(block, button)),
				);
			return [color, open];
		}),
	);
}

function resolveTurn() {
	const occupied = state.enemies.some((enemy) =>
		same(currentEnemyPos(enemy), state.player),
	);
	const seen = sightCells().has(posKey(state.player.x, state.player.y));
	if (occupied || seen) {
		state.lost = true;
		playSound("miss");
		return pulse("捕まりました。Undoで1手戻れます。", true);
	}
	if (same(state.player, state.goal)) {
		state.won = true;
		const key = LEVELS[state.levelIndex].name;
		if (!best[key] || state.moves < best[key]) {
			best[key] = state.moves;
			localStorage.setItem("one-step-best-v12", JSON.stringify(best));
		}
		playSound("clear");
		showClearDialog();
		pulse("クリア。読み切り成功です。", true);
	}
}

function getAudioContext() {
	if (!audioContext) {
		audioContext = new (window.AudioContext || window.webkitAudioContext)();
	}
	if (audioContext.state === "suspended") audioContext.resume();
	return audioContext;
}

function tone(ctx, start, frequency, duration, type, volume) {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(frequency, start);
	gain.gain.setValueAtTime(0.0001, start);
	gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(start);
	osc.stop(start + duration + 0.02);
}

function playSound(kind) {
	const ctx = getAudioContext();
	const now = ctx.currentTime;
	if (kind === "move") {
		tone(ctx, now, 360, 0.055, "triangle", 0.045);
		tone(ctx, now + 0.025, 470, 0.05, "triangle", 0.035);
	}
	if (kind === "clear") {
		tone(ctx, now, 440, 0.09, "sine", 0.055);
		tone(ctx, now + 0.08, 660, 0.11, "sine", 0.06);
		tone(ctx, now + 0.18, 880, 0.16, "sine", 0.055);
	}
	if (kind === "miss") {
		tone(ctx, now, 180, 0.11, "sawtooth", 0.045);
		tone(ctx, now + 0.08, 120, 0.14, "sawtooth", 0.04);
	}
}

function showClearDialog() {
	const isLast = levelIndex >= LEVELS.length - 1;
	clearEyebrowEl.textContent = isLast ? "All Stages Clear" : "Stage Clear";
	clearTitleEl.textContent = isLast ? "ONE STEP MASTER" : "ステージクリア";
	clearDetailEl.textContent = isLast
		? `全${LEVELS.length}ステージ踏破 / 最終ステージ ${state.moves}手`
		: `${LEVELS[levelIndex].name} / ${state.moves}手`;
	nextStageBtn.textContent = isLast ? "最初から →" : "次へ →";
	clearDialogEl.classList.toggle("ending", isLast);
	clearDialogEl.classList.add("show");
	clearDialogEl.setAttribute("aria-hidden", "false");
}

function hideClearDialog() {
	clearDialogEl.classList.remove("show");
	clearDialogEl.classList.remove("ending");
	clearDialogEl.setAttribute("aria-hidden", "true");
}

function isClearDialogOpen() {
	return clearDialogEl.classList.contains("show");
}

function pulse(text, persistent = false) {
	messageEl.textContent = text;
	messageEl.classList.add("show");
	if (!persistent) {
		window.setTimeout(hideMessage, 850);
	}
}

function hideMessage() {
	messageEl.classList.remove("show");
	messageEl.textContent = "";
}

function render() {
	const level = LEVELS[levelIndex];
	titleEl.textContent = level.name;
	moveEl.textContent = `${state.moves}手`;
	keyEl.textContent = state.key?.taken ? "鍵あり" : "鍵なし";
	undoBtn.disabled = history.length === 0;
	boardEl.style.setProperty("--size", state.size);
	boardEl.innerHTML = "";

	const currentSight = sightCells();
	const nextEnemies = projectEnemies();
	const nextEnemyCells = new Set(
		nextEnemies.map((enemy) => {
			const p = currentEnemyPos(enemy);
			return posKey(p.x, p.y);
		}),
	);

	for (let y = 0; y < state.size; y += 1) {
		for (let x = 0; x < state.size; x += 1) {
			const cell = document.createElement("div");
			cell.className = "cell";
			if (state.walls.has(posKey(x, y))) cell.classList.add("wall");
			if (currentSight.has(posKey(x, y)))
				cell.classList.add("sight", `sight-${currentSight.get(posKey(x, y))}`);
			if (nextEnemyCells.has(posKey(x, y))) cell.classList.add("next");
			if (state.won && same({ x, y }, state.goal))
				cell.classList.add("escaped");
			if (isStackedCell(x, y)) cell.classList.add("stacked");
			addGlyphs(cell, x, y);
			boardEl.append(cell);
		}
	}

	renderStages();
}

function isStackedCell(x, y) {
	const p = { x, y };
	const hasFloorItem =
		same(p, state.goal) ||
		(state.door && !state.door.open && same(p, state.door)) ||
		state.gates?.some((gate) => same(p, gate)) ||
		state.switches?.some((button) => same(p, button)) ||
		state.oneWays?.some((tile) => same(p, tile)) ||
		(state.key && !state.key.taken && same(p, state.key));
	const hasOccupant =
		same(p, state.player) ||
		hasBlockAt(x, y) ||
		state.enemies.some((enemy) => same(currentEnemyPos(enemy), p));
	return Boolean(hasFloorItem && hasOccupant);
}

function addGlyphs(cell, x, y) {
	const p = { x, y };
	if (state.won && same(p, state.goal)) {
		cell.append(glyph("escape", ""));
		return;
	}

	if (same(p, state.goal)) cell.append(glyph("goal", "◆"));
	state.oneWays?.forEach((tile) => {
		if (same(p, tile))
			cell.append(
				glyph(
					"one-way",
					tile.dir === "right"
						? "→"
						: tile.dir === "left"
							? "←"
							: tile.dir === "down"
								? "↓"
								: "↑",
				),
			);
	});
	if (state.door && !state.door.open && same(p, state.door))
		cell.append(glyph("door", "▥"));
	state.gates?.forEach((gate) => {
		if (same(p, gate))
			cell.append(
				glyph(`gate ${gate.color}${isGateOpen(gate) ? " open" : ""}`, "▦"),
			);
	});
	state.switches?.forEach((button) => {
		if (same(p, button)) cell.append(glyph(`switch ${button.color}`, "●"));
	});
	if (state.key && !state.key.taken && same(p, state.key))
		cell.append(glyph("key", "⚿"));
	state.blocks?.forEach((block) => {
		if (same(p, block)) cell.append(glyph("block", "■"));
	});

	state.enemies.forEach((enemy) => {
		if (!same(currentEnemyPos(enemy), p)) return;
		const mark =
			enemy.type === "patrol" ? "•" : enemy.type === "chaser" ? "!" : "◉";
		cell.append(glyph(enemy.type, mark, enemy.dir));
	});

	if (same(p, state.player)) cell.append(glyph("hero", "●"));
}

function glyph(name, text, dir) {
	const el = document.createElement("span");
	el.className = `glyph ${name}${dir ? ` dir-${dir}` : ""}`;
	el.textContent = text;
	return el;
}

function renderStages() {
	stageListEl.innerHTML = "";
	LEVELS.forEach((level, index) => {
		const button = document.createElement("button");
		button.type = "button";
		button.classList.toggle("active", index === levelIndex);
		button.innerHTML = `<span>${index + 1}. ${level.name}</span><span class="best">${best[level.name] ? `${best[level.name]}手` : "-"}</span>`;
		button.addEventListener("click", () => {
			levelIndex = index;
			loadLevel(levelIndex);
		});
		stageListEl.append(button);
	});
}

document.addEventListener("keydown", (event) => {
	if (isClearDialogOpen() && (event.key === "Enter" || event.key === " ")) {
		event.preventDefault();
		nextStageBtn.click();
		return;
	}
	const keyMap = {
		ArrowUp: "up",
		ArrowDown: "down",
		ArrowLeft: "left",
		ArrowRight: "right",
		w: "up",
		s: "down",
		a: "left",
		d: "right",
	};
	if (keyMap[event.key]) {
		event.preventDefault();
		move(keyMap[event.key]);
	}
	if (event.key === " " || event.key === ".") {
		event.preventDefault();
		waitTurn();
	}
	if (event.key === "z") undo();
	if (event.key === "r") loadLevel(levelIndex);
});

document.querySelectorAll("[data-dir]").forEach((button) => {
	button.addEventListener("click", () => move(button.dataset.dir));
});

undoBtn.addEventListener("click", undo);
resetBtn.addEventListener("click", () => loadLevel(levelIndex));
waitBtn.addEventListener("click", waitTurn);

boardEl.addEventListener("pointerdown", (event) => {
	touchStart = { x: event.clientX, y: event.clientY };
});

boardEl.addEventListener("pointerup", (event) => {
	if (!touchStart) return;
	const dx = event.clientX - touchStart.x;
	const dy = event.clientY - touchStart.y;
	touchStart = null;
	if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
	if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
	else move(dy > 0 ? "down" : "up");
});

function undo() {
	const snap = history.pop();
	if (!snap) return;
	hideMessage();
	hideClearDialog();
	restore(snap);
}

nextStageBtn.addEventListener("click", () => {
	levelIndex = levelIndex >= LEVELS.length - 1 ? 0 : levelIndex + 1;
	loadLevel(levelIndex);
});

replayStageBtn.addEventListener("click", () => loadLevel(levelIndex));

loadLevel(levelIndex);
