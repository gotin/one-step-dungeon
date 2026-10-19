// ── enemy-snapshot.js ────────────────────────────────────────
// キュー85 #11（2026-10-19）: 敵のスナップショット（テスト用 `__game.getEnemies()`）を
// 「敵の実体の全欄を写す」形にした。
//
// 旧＝game.js `getEnemiesSnapshot` に 390 行のホワイトリスト（`slamAt: e._slamAt ?? null` を
// 欄の数だけ手で並べる）。機構を足すたびにここへ1行足す約束で、足し忘れた欄はテストから
// 常に undefined に見えた（[[blade-snapshot-api-names]]＝測定が静かに嘘をつく）。
//
// 写し方の約束（これだけ覚えれば読める）：
//   - 名前＝実体の欄の名前から先頭の `_` を1つ外したもの（`e._slamAt` → `slamAt`）。
//     `_` の無い欄（id・type・x・y・hp…）はそのまま。両方あれば `_` の無い方が勝つ。
//   - 値＝深いコピー（配列・オブジェクト・Map・Set）。テストが値を書き換えても敵に響かない。
//   - DOM（`el`）と関数は写さない。
//   - 実体に無い欄は undefined。ただし NULL_WHEN_ABSENT に名前がある欄は null（旧ホワイトリストが
//     `?? null` で出していた欄＝テストに `s.swingAt !== null` のような厳密比較が 178 か所ある。
//     undefined に変えると割れずに意味が反転する∴旧の約束をそのまま残した）。
//     新しく足す欄は名前を足さなくても見える＝テストでは `== null` で読めば足りる。
//   - 下の SNAPSHOT_EXTRAS だけが手書き＝既定値（false／0／1）・派生値・形を変えて出す欄。
//
// 性能：テスト専用（ゲームのループは呼ばない）。

function cloneValue(v) {
	if (v === null || typeof v !== 'object') return v;
	if (Array.isArray(v)) return v.map(cloneValue);
	if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, cloneValue(x)]));
	if (v instanceof Set) return [...v].map(cloneValue);
	const out = {};
	for (const k of Object.keys(v)) out[k] = cloneValue(v[k]);
	return out;
}

const SKIP_KEYS = new Set(['el']);

// 実体に無いとき null で読む欄（旧ホワイトリストで `?? null` だった欄・2026-10-19 に機械抽出）。
const NULL_WHEN_ABSENT = [
	'ambushTo', 'approachMode', 'aspAt', 'aspCounts', 'aspHits', 'aspKind', 'aspPhase', 'aspRetreats',
	'atk', 'atkCdMul', 'atkUntil', 'attacks', 'blinkCount', 'blinkPhase', 'blinkUntil', 'blockDir',
	'breathAt', 'breathDir', 'breathWindupMs', 'castUntil', 'cmode', 'cmodeUntil', 'coil', 'coilArc',
	'coilCx', 'coilCy', 'coilHeat', 'coilR', 'coilSpin', 'coilStall', 'combat', 'crushAt', 'crushR',
	'crushWindupMs', 'dash', 'dashLeft', 'dashPhase', 'dashUntil', 'dir', 'faceUntil', 'freezeUntil',
	'gaze', 'gazeAt', 'gazeCount', 'gazeCx', 'gazeCy', 'gazeHeat', 'gazePhase', 'gazeR', 'gazeSpan',
	'glaciate', 'glAt', 'glBlocked', 'glDx', 'glDy', 'glFreezes', 'glLeft', 'glPhase', 'glSpan',
	'guardDir', 'guardUntil', 'haPhase', 'hide', 'hideUntil', 'hitAndAway', 'lasers', 'leapPhase',
	'leapUntil', 'leechCooldownUntil', 'leechNext', 'lockstep', 'lsAt', 'lsC', 'lsCasts', 'lsHeat',
	'lsHits', 'lsPhase', 'lsR', 'lsSpan', 'lsTravel', 'lsWhiffs', 'mgAt', 'mgC', 'mgConverges',
	'mgHits', 'mgNextAt', 'mgPhase', 'mgR', 'mgSlain', 'mgSpan', 'mgWaves', 'mgWhiffs', 'mirage',
	'modeWeights', 'momCrashes', 'momentum', 'momRams', 'momVx', 'momVy', 'move', 'noticed',
	'roamTarget', 'shellPhase', 'shellUntil', 'slamAt', 'slamWindupMs', 'soar', 'soarAng', 'soarArc',
	'soarAt', 'soarBand', 'soarBandHits', 'soarBreaths', 'soarCrashes', 'soarCx', 'soarCy',
	'soarDives', 'soarFlights', 'soarLeft', 'soarMaxAt', 'soarNextFlip', 'soarPhase', 'soarSpan',
	'soarSpin', 'soarVec', 'speed', 'spikeHits', 'spikes', 'splitFrom', 'sprite', 'stunUntil', 'surge',
	'surgeAfloat', 'surgeAt', 'surgeHits', 'surgeHomeX', 'surgeHomeY', 'surgeLeft', 'surgePhase',
	'surgeReadyAt', 'surges', 'surgeSpan', 'surgeSx', 'surgeSy', 'surgeVx', 'surgeVy', 'swingAt',
	'swingWindupMs', 'thornFollows', 'thornHits', 'thorns', 'thornsBroken', 'thornsCrushed',
	'thornsReleased', 'thornStuns', 'thornWaves', 'toadPounceHits', 'toadPounces', 'tongue',
	'tongueAimX', 'tongueAimY', 'tongueAng', 'tongueAt', 'tongueGrabs', 'tongueLen', 'tonguePhase',
	'tongueSnaps', 'tongueUntil',
];

// 自動の写しの後に上書きする欄（旧ホワイトリストの約束を守るための物だけ）。
// 引数 ctx.landCells ＝その敵が今陸に乗っているセル数（game.js `enemyLandCells`＝水の判定が要る）。
const SNAPSHOT_EXTRAS = {
	// 既定値（実体に無いと undefined ではなく決まった値で読む欄）
	w:              (e) => e.w ?? 1,
	h:              (e) => e.h ?? 1,
	hidden:         (e) => e.hidden ?? false,
	flipX:          (e) => e.flipX ?? false,
	guarding:       (e) => e._guarding ?? false,
	shellClosed:    (e) => e._shellClosed ?? false,
	attached:       (e) => e._attached ?? false,
	tongueAttached: (e) => e._tongueAttached ?? false,
	stolenRupees:   (e) => e._stolenRupees ?? 0,
	phasesTriggered: (e) => [...(e.phasesTriggered ?? [])],
	attackTimes:    (e) => ({ ...(e._attackTimes ?? {}) }),
	// 真偽に畳む欄（実体は seq や {…} を持つ＝テストは「最中か」だけ読む）
	aspRetreating:  (e) => !!e._aspRetreat,
	aspHold:        (e) => !!e._aspHold,
	// 名前を変えて出す欄（目からのレーザー＝予告の形／照射中の形）
	laserWarn:      (e) => cloneValue(e._aspBeamShape ?? null),
	laserFire:      (e) => cloneValue(e._laserShape ?? null),
	// 派生値
	momSpeed:       (e) => (e._momVx != null || e._momVy != null) ? Math.hypot(e._momVx ?? 0, e._momVy ?? 0) : null,
	surgeLand:      (e, ctx) => ctx.landCells,
	frostCount:     (e) => e._frost ? e._frost.size : null,
	frostCells:     (e) => e._frost
		? [...e._frost.values()].map(f => ({
			r: f.r, c: f.c, at: f.at, span: f.span, warn: f.warn,
			spikeAt: f.spikeAt, warnAt: f.spikeAt - f.warn,
		}))
		: null,
	home:           (e) => e._homeX != null ? { r: e._homeY, c: e._homeX } : null,
	// 形を変えて出す欄（実体は [r, c] の配列＝床に描く div と同じ並び）
	lsCells:        (e) => e._lsCells ? e._lsCells.map(([r, c]) => ({ r, c })) : null,
	mgCells:        (e) => e._mgCells ? e._mgCells.map(([r, c]) => ({ r, c })) : null,
};

export function snapshotEnemy(e, ctx) {
	const out = {};
	for (const [k, v] of Object.entries(e)) {
		if (SKIP_KEYS.has(k) || typeof v === 'function') continue;
		const under = k.startsWith('_');
		const name = under ? k.slice(1) : k;
		if (under && Object.hasOwn(e, name)) continue;   // `_` の無い欄が勝つ
		out[name] = cloneValue(v);
	}
	for (const name of NULL_WHEN_ABSENT) out[name] ??= null;
	for (const [name, fn] of Object.entries(SNAPSHOT_EXTRAS)) out[name] = fn(e, ctx);
	return out;
}
