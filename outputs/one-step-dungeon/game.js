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
		// 石2つ・スイッチ1つ / 最小36手
		name: "折り返し搬送",
		size: 9,
		map: [
			"######.",
			"#    #.",
			"# ##T###",
			"# #    #",
			"# BB   ##",
			"## PT XG#",
			"#########",
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
	{
		// Microban #34 + 巡回兵 / 55手 score≈107
		name: "一直線の攻防",
		size: 11,
		map: [
			"  ####     ",
			"###  ####  ",
			"#       ###",
			"#PB***T XG#",
			"#       ###",
			"#########  ",
		],
		enemies: [
			{
				type: "patrol",
				route: [
					[1, 2],
					[2, 2],
					[3, 2],
					[4, 2],
				],
				index: 0,
				forward: true,
			},
		],
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
const stageSelectEl = document.querySelector("#stage-select");
const clearDialogEl = document.querySelector("#clear-dialog");
const clearEyebrowEl = clearDialogEl.querySelector(".eyebrow");
const clearTitleEl = document.querySelector("#clear-title");
const clearDetailEl = document.querySelector("#clear-detail");
const nextStageBtn = document.querySelector("#next-stage");
const replayStageBtn = document.querySelector("#replay-stage");

let levelIndex = 0;
let state = null;
let history = [];
let heroDir = "right";
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
		same({ x, y }, state.door) &&
		!state.key?.taken
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
	heroDir = dirName;
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
		playSound("key");
		pulse("🔑 鍵を拾った！扉が開けられる", false);
		// door stays closed until player reaches it
	}
	if (state.door && !state.door.open && state.key?.taken && same(state.player, state.door)) {
		state.door.open = true;
		playSound("doorOpen");
		// trigger opening animation on next render via flag
		state.door.opening = true;
		window.setTimeout(() => {
			if (state.door) state.door.opening = false;
		}, 400);
	}
}

function updateSwitches() {
	const colors = [...new Set(state.gates.map((gate) => gate.color))];
	const prevGatesOpen = state.gatesOpen || {};
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
	// スイッチ状態が変わった時に音とアニメーション
	colors.forEach((color) => {
		if (!prevGatesOpen[color] && state.gatesOpen[color]) {
			playSound("gateOpen");
			// ゲートに opening フラグを設定
			state.gates.forEach((gate) => {
				if (gate.color === color) {
					gate.opening = true;
					window.setTimeout(() => { gate.opening = false; }, 350);
				}
			});
		} else if (state.gatesOpen[color] !== prevGatesOpen[color]) {
			playSound("switch");
		}
	});
	// スイッチを踏んだ音（まだゲートが開いていない場合）
	state.switches.forEach((button) => {
		if (same(button, state.player) && !state.gatesOpen[button.color]) {
			playSound("switch");
		}
	});
}

function resolveTurn() {
	// ゲートが閉じてプレイヤーがその上に立ってしまった場合は移動をキャンセル
	const standingOnClosedGate = state.gates?.some(
		(gate) => same(gate, state.player) && !isGateOpen(gate),
	);
	if (standingOnClosedGate) {
		// 移動前の状態に巻き戻す
		const prev = history.pop();
		if (prev) {
			state.player = clone(prev.player);
			state.moves = prev.moves;
			state.gatesOpen = prev.gatesOpen;
			// スイッチ状態も戻す
			state.blocks = clone(prev.blocks);
		}
		playSound("miss");
		pulse("スイッチから離れるとゲートが閉まります");
		return;
	}
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
	if (kind === "key") {
		tone(ctx, now, 880, 0.07, "sine", 0.05);
		tone(ctx, now + 0.07, 1100, 0.09, "sine", 0.06);
		tone(ctx, now + 0.14, 1320, 0.12, "sine", 0.055);
	}
	if (kind === "doorOpen") {
		tone(ctx, now, 440, 0.08, "triangle", 0.05);
		tone(ctx, now + 0.06, 660, 0.1, "triangle", 0.06);
		tone(ctx, now + 0.14, 550, 0.18, "sine", 0.045);
	}
	if (kind === "switch") {
		tone(ctx, now, 330, 0.06, "square", 0.04);
		tone(ctx, now + 0.05, 500, 0.08, "square", 0.05);
	}
	if (kind === "gateOpen") {
		tone(ctx, now, 220, 0.1, "sawtooth", 0.04);
		tone(ctx, now + 0.08, 330, 0.12, "triangle", 0.05);
		tone(ctx, now + 0.18, 440, 0.14, "sine", 0.05);
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

// ── Pixel-art sprite system ─────────────────────────────
// Each sprite is a 12-wide × 16-tall array of palette indices (Mario-scale)
// Palette: 0=transparent, 1=dark, 2=mid, 3=light, 4=accent, 5=accent2

const PAL = {
	// hero: 7-color palette from work/images p_down/p_left PNGs
	// 0=transparent,1=outline(#000),2=hair(#ff9500),3=skin(#f1d7c9),
	// 4=jacket(#4cd964),5=pants(#5856d6),6=skin2(#edd1c3)
	hero: ["transparent", "#000000", "#ff9500", "#f1d7c9", "#4cd964", "#5856d6", "#edd1c3"],
	block: ["transparent", "#0a0a14", "#6a7470", "#9aa3a0", "#b8bfbc", "#ffffff"],
	goal: ["transparent", "#0a0a14", "#c09020", "#f2c14e", "#ffe080", "#ffffff"],
	door: ["transparent", "#0a0a14", "#5a3010", "#9b7048", "#c09060", "#ffe0a0"],
	key: ["transparent", "#0a0a14", "#b08030", "#f2c14e", "#ffe080", "#ffffff"],
	swG: ["transparent", "#0a0a14", "#2a6020", "#5a9a40", "#84c76e", "#c0ffa0"],
	swB: ["transparent", "#0a0a14", "#1a3870", "#3a6aaa", "#6aa7df", "#a0d0ff"],
	gateG: ["transparent", "#0a0a14", "#8a4010", "#d78a50", "#f0b070", "#ffffff"],
	gateB: ["transparent", "#0a0a14", "#1a3060", "#4070b0", "#6a9fd0", "#a0d0ff"],
	patrol: [
		"transparent",
		"#0a0a14",
		"#1a4070",
		"#4888c0",
		"#80c0f0",
		"#ffffff",
	],
	chaser: [
		"transparent",
		"#0a0a14",
		"#6a0808",
		"#c03030",
		"#e86060",
		"#ffa0a0",
	],
	sentry: [
		"transparent",
		"#0a0a14",
		"#501880",
		"#9040c0",
		"#b989e8",
		"#ffd0ff",
	],
	escape: [
		"transparent",
		"#0a0a14",
		"#c09020",
		"#f2c14e",
		"#6fd3c4",
		"#ffffff",
	],
};

// 12-wide × 16-tall sprite frames (like classic Mario proportions)
// 0=transparent,1=outline,2=shirt/body,3=skin,4=pants,5=hair/shoes
const SPRITES = {
	// ── HERO ──────────────────────────────────────────────
	// 16w×24h, MOTHER-style:
	// PAL.hero: 0=transparent,1=outline(#1a1a24),2=skin(#f5c09a),
	//           3=gold hair(#f0c840),4=dark hair shadow(#b89010),
	//           5=blue jacket(#1a4898),6=red tie(#d83030),7=brown pants(#604838)
	//
	// heroD = front face – 21×32 dot data from OriginalCharacters1-128.png
	// palette indices match PAL.hero exactly
heroD: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3, 3, 1, 3, 3, 1, 3, 3, 3, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 1, 3, 3, 1, 3, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 1, 1, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 6, 4, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 4, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 6, 1, 1, 1, 1, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 6, 1, 0, 0, 1, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		],
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 3, 2, 2, 3, 3, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3, 1, 3, 3, 1, 3, 3, 3, 3, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 1, 3, 3, 1, 3, 3, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 1, 1, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 3, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 6, 1, 1, 1, 1, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 1, 0, 1, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		],
	],
	heroL: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 1, 3, 3, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 1, 3, 3, 2, 3, 3, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 3, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 1, 0, 1, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		],
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 3, 3, 3, 2, 3, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 3, 3, 3, 2, 3, 3, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 4, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 1, 1, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 0, 0, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		],
	],
	heroR: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 1, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 3, 3, 2, 3, 3, 1, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 3, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 1, 0, 1, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		],
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 3, 2, 3, 3, 3, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 3, 3, 2, 3, 3, 3, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 4, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 1, 1, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 0, 0, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		],
	],
	heroU: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 6, 4, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 4, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 6, 1, 1, 1, 1, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 6, 1, 0, 0, 1, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		],
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 3, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 6, 1, 1, 1, 1, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 1, 0, 1, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		],
	],
	// ── BLOCK ─────────────────────────────────────────────
	block: [
		[
			[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
			[1, 3, 4, 3, 3, 3, 3, 3, 3, 4, 3, 1],
			[1, 3, 4, 3, 1, 1, 3, 3, 3, 4, 3, 1], // crack top
			[1, 3, 4, 3, 3, 1, 3, 1, 3, 4, 3, 1],
			[1, 3, 4, 3, 3, 3, 3, 1, 3, 4, 3, 1],
			[1, 3, 4, 3, 1, 3, 3, 3, 3, 4, 3, 1], // crack mid
			[1, 3, 4, 3, 1, 3, 3, 3, 3, 4, 3, 1],
			[1, 3, 4, 3, 3, 3, 3, 1, 3, 4, 3, 1],
			[1, 3, 4, 3, 3, 3, 1, 1, 3, 4, 3, 1], // crack bot
			[1, 3, 4, 3, 3, 3, 3, 3, 3, 4, 3, 1],
			[1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		],
	],
	// ── GOAL ──────────────────────────────────────────────
	goal: [
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0],
			[1, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 1],
			[1, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 1],
			[1, 4, 3, 3, 0, 4, 4, 0, 3, 3, 4, 1],
			[1, 4, 3, 3, 4, 4, 4, 4, 3, 3, 4, 1],
			[1, 4, 3, 3, 0, 4, 4, 0, 3, 3, 4, 1],
			[1, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 1],
			[1, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 1],
			[1, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 1],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1],
			[0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0],
			[0, 0, 1, 1, 1, 4, 4, 1, 1, 1, 0, 0], // step
			[0, 0, 0, 1, 1, 4, 4, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			// pulse frame
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
			[1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
			[1, 3, 4, 4, 0, 5, 5, 0, 4, 4, 3, 1],
			[1, 3, 4, 4, 5, 5, 5, 5, 4, 4, 3, 1],
			[1, 3, 4, 4, 0, 5, 5, 0, 4, 4, 3, 1],
			[1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
			[1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
			[1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 0, 1, 1, 1, 3, 3, 1, 1, 1, 0, 0],
			[0, 0, 0, 1, 1, 3, 3, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── DOOR ──────────────────────────────────────────────
	door: [
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 1, 4, 4, 4, 4, 4, 4, 4, 1, 0, 0],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0],
			[1, 4, 2, 2, 2, 2, 2, 2, 2, 4, 1, 0],
			[1, 4, 2, 1, 1, 1, 1, 1, 2, 4, 1, 0],
			[1, 4, 2, 1, 0, 0, 0, 1, 2, 4, 1, 0],
			[1, 4, 2, 1, 0, 0, 0, 1, 2, 4, 1, 0],
			[1, 4, 2, 1, 1, 1, 1, 1, 2, 4, 1, 0],
			[1, 4, 2, 2, 2, 2, 2, 2, 2, 4, 1, 0],
			[1, 4, 2, 2, 5, 2, 2, 2, 2, 4, 1, 0], // knob
			[1, 4, 2, 2, 2, 2, 2, 2, 2, 4, 1, 0],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
		],
	],
	// ── KEY ───────────────────────────────────────────────
	key: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 1, 0, 0, 0, 0],
			[0, 0, 1, 3, 0, 0, 3, 1, 0, 0, 0, 0],
			[0, 0, 1, 3, 0, 0, 3, 1, 0, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 1, 0, 0, 0, 0],
			[0, 0, 0, 1, 3, 3, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 1, 3, 1, 4, 4, 1, 0, 0],
			[0, 0, 0, 0, 0, 1, 3, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 1, 3, 1, 4, 1, 0, 0],
			[0, 0, 0, 0, 0, 0, 1, 3, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			// shimmer
			[0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0],
			[0, 0, 1, 4, 4, 4, 4, 1, 0, 0, 0, 0],
			[0, 0, 1, 4, 0, 0, 4, 1, 0, 5, 0, 0],
			[0, 0, 1, 4, 0, 0, 4, 1, 0, 0, 0, 0],
			[0, 0, 1, 4, 4, 4, 4, 1, 0, 0, 0, 0],
			[0, 0, 0, 1, 4, 4, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 1, 4, 1, 4, 4, 1, 0, 0],
			[0, 0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 1, 4, 1, 4, 1, 0, 0],
			[0, 0, 0, 0, 0, 0, 1, 4, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── SWITCH GREEN ──────────────────────────────────────
	swG: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 3, 3, 1, 0, 0],
			[0, 0, 1, 3, 4, 4, 4, 4, 3, 1, 0, 0], // lit
			[0, 0, 1, 3, 4, 5, 5, 4, 3, 1, 0, 0],
			[0, 0, 1, 3, 4, 4, 4, 4, 3, 1, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
			[0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
			[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			// dim frame
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 1, 2, 2, 2, 2, 2, 2, 1, 0, 0],
			[0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0],
			[0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0],
			[0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
			[0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
			[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── SWITCH BLUE ───────────────────────────────────────
	swB: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 3, 3, 1, 0, 0],
			[0, 0, 1, 3, 4, 4, 4, 4, 3, 1, 0, 0],
			[0, 0, 1, 3, 4, 5, 5, 4, 3, 1, 0, 0],
			[0, 0, 1, 3, 4, 4, 4, 4, 3, 1, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
			[0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
			[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 1, 2, 2, 2, 2, 2, 2, 1, 0, 0],
			[0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0],
			[0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0],
			[0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0],
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
			[0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0],
			[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── GATE GREEN (closed) ───────────────────────────────
	gateG: [
		[
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── GATE GREEN (open) ─────────────────────────────────
	gateGopen: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
			[0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
			[0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── GATE BLUE (closed) ────────────────────────────────
	gateB: [
		[
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 4, 1, 4, 1, 4, 1, 4, 1, 4, 1, 1],
			[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── PATROL ────────────────────────────────────────────
	patrol: [
		[
			// frame 0
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 1, 1, 3, 3, 3, 3, 1, 1, 3, 1], // eyes
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 1, 3, 3, 1, 1, 1, 1, 3, 3, 1, 0],
			[0, 1, 3, 1, 0, 0, 0, 0, 1, 3, 1, 0], // legs
			[0, 0, 1, 3, 0, 0, 0, 0, 3, 1, 0, 0],
			[0, 0, 1, 3, 0, 0, 0, 0, 3, 1, 0, 0],
			[0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			// frame 1 – bounce up
			[0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 3, 3, 1, 0, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 1, 3, 1, 3, 3, 3, 3, 1, 3, 1, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 0, 1, 3, 3, 3, 3, 3, 3, 1, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 3, 3, 1, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 3, 3, 1, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 3, 3, 1, 0, 0],
			[0, 0, 1, 3, 1, 1, 1, 1, 3, 1, 0, 0],
			[0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0],
			[0, 0, 1, 3, 0, 0, 0, 0, 3, 1, 0, 0],
			[0, 0, 1, 3, 0, 0, 0, 0, 3, 1, 0, 0],
			[0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── CHASER ────────────────────────────────────────────
	chaser: [
		[
			// frame 0
			[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 1, 1, 1, 3, 3, 1, 1, 1, 3, 1], // angry brows
			[1, 3, 3, 1, 3, 3, 3, 3, 1, 3, 3, 1], // eyes
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 1, 0, 1, 3, 3, 1, 0, 1, 3, 1], // teeth
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 0, 1, 3, 3, 1, 1, 3, 3, 1, 0, 0],
			[0, 0, 1, 3, 1, 0, 0, 1, 3, 1, 0, 0],
			[0, 0, 0, 1, 3, 0, 0, 3, 1, 0, 0, 0],
			[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			// frame 1 – rage flash
			[0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1],
			[1, 4, 1, 1, 1, 4, 4, 1, 1, 1, 4, 1],
			[1, 4, 4, 1, 4, 4, 4, 4, 1, 4, 4, 1],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1],
			[1, 4, 1, 0, 1, 4, 4, 1, 0, 1, 4, 1],
			[1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1],
			[0, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 0],
			[0, 0, 1, 4, 4, 1, 1, 4, 4, 1, 0, 0],
			[0, 0, 1, 4, 1, 0, 0, 1, 4, 1, 0, 0],
			[0, 0, 0, 1, 4, 0, 0, 4, 1, 0, 0, 0],
			[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── SENTRY RIGHT ──────────────────────────────────────
	sentryR: [
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 1], // sensor eye R
			[1, 2, 2, 4, 5, 4, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 0, 0, 0, 1, 4, 4, 4, 1, 0, 0, 0], // arrow →
			[0, 0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 5, 5, 5, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 5, 4, 5, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 5, 5, 5, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 0, 0, 0, 1, 4, 4, 4, 1, 0, 0, 0],
			[0, 0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── SENTRY LEFT ───────────────────────────────────────
	sentryL: [
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 4, 4, 4, 2, 2, 1], // sensor eye L
			[1, 2, 2, 2, 2, 2, 4, 5, 4, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 4, 4, 4, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 0, 0, 1, 4, 4, 4, 1, 0, 0, 0, 0], // arrow ←
			[0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 5, 5, 5, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 5, 4, 5, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 5, 5, 5, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 0, 0, 1, 4, 4, 4, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── SENTRY UP ─────────────────────────────────────────
	sentryU: [
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[1, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 1], // sensor eye top
			[1, 2, 2, 4, 5, 4, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0], // arrow ↑
			[0, 0, 0, 0, 1, 4, 4, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[1, 3, 3, 5, 5, 5, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 5, 4, 5, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 5, 5, 5, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 1, 4, 4, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── SENTRY DOWN ───────────────────────────────────────
	sentryD: [
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 1], // sensor eye bottom
			[1, 2, 2, 4, 5, 4, 2, 2, 2, 2, 2, 1],
			[1, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 1],
			[0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 0, 0, 0, 1, 4, 4, 1, 0, 0, 0, 0], // arrow ↓
			[0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
		[
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 5, 5, 5, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 5, 4, 5, 3, 3, 3, 3, 3, 1],
			[1, 3, 3, 5, 5, 5, 3, 3, 3, 3, 3, 1],
			[0, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0],
			[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
			[0, 0, 0, 0, 1, 4, 4, 1, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
	// ── ONE-WAY RIGHT ─────────────────────────────────────
	oneWayR: [
		[
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 1, 3, 3, 1, 0, 0, 0, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 1, 0, 0, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 1, 0, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 3, 1, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 3, 1, 0, 0, 0, 0],
			[0, 0, 1, 3, 3, 3, 1, 0, 0, 0, 0, 0],
			[0, 0, 1, 3, 3, 1, 0, 0, 0, 0, 0, 0],
			[0, 0, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		],
	],
};

// Animation frame counter
let animFrame = 0;
let animTimer = null;

function startAnimLoop() {
	if (animTimer) return;
	animTimer = setInterval(() => {
		animFrame = (animFrame + 1) % 2;
		// re-draw all canvas sprites in current board
		boardEl.querySelectorAll("canvas[data-sprite]").forEach((cv) => {
			const sname = cv.dataset.sprite;
			const pal = cv.dataset.pal;
			const frames = getSpriteFrames(sname);
			if (frames && frames.length > 1) {
				drawSprite(cv, frames, PAL[pal] || PAL.hero);
			}
		});
	}, 400);
}

function getSpriteFrames(name) {
	return SPRITES[name] || null;
}

function drawSprite(canvas, frames, palette) {
	const f = animFrame % frames.length;
	const grid = frames[f];
	const rows = grid.length;
	const cols = grid[0].length;
	canvas.width = cols;
	canvas.height = rows;
	const ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, cols, rows);
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const idx = grid[row][col];
			if (idx === 0) continue;
			ctx.fillStyle = palette[idx];
			ctx.fillRect(col, row, 1, 1);
		}
	}
}

function makeSprite(spriteName, palName, animated) {
	const frames = SPRITES[spriteName];
	if (!frames) return null;
	const canvas = document.createElement("canvas");
	canvas.className = "sprite";
	if (animated) {
		canvas.dataset.sprite = spriteName;
		canvas.dataset.pal = palName;
	}
	drawSprite(canvas, frames, PAL[palName] || PAL.hero);
	return canvas;
}

function addGlyphs(cell, x, y) {
	const p = { x, y };
	if (state.won && same(p, state.goal)) {
		const cv = makeSprite("goal", "escape", true);
		if (cv) {
			cv.className = "sprite escaped-sprite";
			cell.append(cv);
		}
		return;
	}

	// Floor items (background layer)
	if (same(p, state.goal)) {
		const cv = makeSprite("goal", "goal", true);
		if (cv) cell.append(cv);
	}
	state.oneWays?.forEach((tile) => {
		if (!same(p, tile)) return;
		const dirMap = { right: "R", left: "L", up: "U", down: "D" };
		const sname = "oneWay" + dirMap[tile.dir];
		const cv = SPRITES[sname] ? makeSprite(sname, "hero", false) : null;
		if (cv) {
			cv.className = "sprite oneway";
			cell.append(cv);
		} else {
			const sp = document.createElement("span");
			sp.className = "glyph one-way";
			sp.textContent =
				tile.dir === "right"
					? "→"
					: tile.dir === "left"
						? "←"
						: tile.dir === "down"
							? "↓"
							: "↑";
			cell.append(sp);
		}
	});
	if (state.door && !state.door.open && same(p, state.door)) {
		const cv = makeSprite("door", "door", false);
		if (cv) {
			let cls = "sprite";
			if (state.key?.taken && state.door.opening) cls += " door-opening";
			else if (state.key?.taken) cls += " door-unlocked";
			cv.className = cls;
			cell.append(cv);
		}
	}
	state.gates?.forEach((gate) => {
		if (!same(p, gate)) return;
		const open = isGateOpen(gate);
		const sname = open
			? "gateGopen"
			: gate.color === "blue"
				? "gateB"
				: "gateG";
		const palName = gate.color === "blue" ? "gateB" : "gateG";
		const cv = makeSprite(sname, palName, !open);
		if (cv) {
			if (gate.opening) cv.classList.add("gate-opening");
			cell.append(cv);
		}
	});
	state.switches?.forEach((button) => {
		if (!same(p, button)) return;
		const sname = button.color === "blue" ? "swB" : "swG";
		const palName = button.color === "blue" ? "swB" : "swG";
		const cv = makeSprite(sname, palName, true);
		if (cv) {
			cv.className = "sprite switch-sprite";
			cell.append(cv);
		}
	});
	if (state.key && !state.key.taken && same(p, state.key)) {
		const cv = makeSprite("key", "key", true);
		if (cv) {
			cv.className = "sprite key-sprite";
			cell.append(cv);
		}
	}

	// Blocks
	state.blocks?.forEach((block) => {
		if (!same(p, block)) return;
		const cv = makeSprite("block", "block", false);
		if (cv) cell.append(cv);
	});

	// Enemies
	state.enemies.forEach((enemy) => {
		if (!same(currentEnemyPos(enemy), p)) return;
		let sname, palName;
		if (enemy.type === "patrol") {
			sname = "patrol";
			palName = "patrol";
		} else if (enemy.type === "chaser") {
			sname = "chaser";
			palName = "chaser";
		} else {
			const d = enemy.dir || "right";
			const sentryDirKey = { right: "R", left: "L", up: "U", down: "D" };
			sname = "sentry" + (sentryDirKey[d] || "R");
			palName = "sentry";
		}
		const cv = makeSprite(sname, palName, true);
		if (cv) cell.append(cv);
	});

	// Hero
	if (same(p, state.player)) {
		const dirKey = { right: "R", left: "L", up: "U", down: "D" };
		const sname = "hero" + (dirKey[heroDir] || "R");
		const cv = makeSprite(sname, "hero", true);
		if (cv) cell.append(cv);
	}
}

function glyph(name, text, dir) {
	const el = document.createElement("span");
	el.className = `glyph ${name}${dir ? ` dir-${dir}` : ""}`;
	el.textContent = text;
	return el;
}

function renderStages() {
	stageSelectEl.innerHTML = "";
	LEVELS.forEach((level, index) => {
		const option = document.createElement("option");
		option.value = index;
		option.selected = index === levelIndex;
		const bestStr = best[level.name] ? ` (${best[level.name]}手)` : "";
		option.textContent = `${index + 1}. ${level.name}${bestStr}`;
		stageSelectEl.append(option);
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
stageSelectEl.addEventListener("change", () => {
	levelIndex = Number(stageSelectEl.value);
	loadLevel(levelIndex);
});

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

// ── How-to sprite injection ─────────────────────────────
function renderHowto() {
	const howtoSprites = [
		{ id: "howto-sprite-player", sname: "heroD", pal: "hero" },
		{ id: "howto-sprite-goal", sname: "goal", pal: "goal" },
		{ id: "howto-sprite-key", sname: "key", pal: "key" },
		{ id: "howto-sprite-door", sname: "door", pal: "door" },
		{ id: "howto-sprite-patrol", sname: "patrol", pal: "patrol" },
		{ id: "howto-sprite-chaser", sname: "chaser", pal: "chaser" },
		{ id: "howto-sprite-sentry", sname: "sentryR", pal: "sentry" },
		{ id: "howto-sprite-block", sname: "block", pal: "block" },
		{ id: "howto-sprite-swG", sname: "swG", pal: "swG" },
		{ id: "howto-sprite-gateG", sname: "gateG", pal: "gateG" },
		{ id: "howto-sprite-swB", sname: "swB", pal: "swB" },
		{ id: "howto-sprite-gateB", sname: "gateB", pal: "gateB" },
	];
	howtoSprites.forEach(({ id, sname, pal }) => {
		const wrap = document.getElementById(id);
		if (!wrap) return;
		const cv = makeSprite(sname, pal, false);
		if (cv) {
			cv.className = "howto-sprite";
			wrap.innerHTML = "";
			wrap.append(cv);
		}
	});
}

// ── モバイル誤操作防止 ──────────────────────────────────
const gamePanel = document.querySelector(".game-panel");
if (gamePanel) {
	gamePanel.addEventListener("contextmenu", (e) => e.preventDefault());
	gamePanel.addEventListener("selectstart", (e) => e.preventDefault());
}

startAnimLoop();
loadLevel(levelIndex);
renderHowto();
