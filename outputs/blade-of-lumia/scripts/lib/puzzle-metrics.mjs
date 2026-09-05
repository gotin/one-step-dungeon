#!/usr/bin/env node
/**
 * puzzle-metrics.mjs — PUZZLE-DESIGN.md §4 の4軸を測る測定コア（単一ソース）
 *
 * measure-puzzle.mjs（実マップ検証）と generate-sokoban.mjs（逆算生成の選別）が
 * **同じ4軸ロジック**を使うために切り出した。ゴール判定（goalTest）と
 * ヒューリスティック（h）は呼び出し側が渡す＝パズル種別に依らず4軸を測れる。
 *
 *   軸① 深さ L        … 入口→ゴール の最短手数（BFS 距離）
 *   軸② 気づきにくさ   … 貪欲法（h を増やさない手だけ選ぶ）で解けるか＝insight
 *   軸③ デッドロック D … 到達状態のうち「もうゴールへ戻れない」非ゴール状態の数
 *   軸④ 解の細さ      … 最短解の本数＋強制手率（ゴールへ進む手が1つの状態の割合）
 *
 * 加えて（軸ではなく**成立条件**）：
 *   noEscape … 到達状態のうち「画面外へ戻れない」状態の数＝ハードロック検査
 *              （PUZZLE-DESIGN.md §3-2e の I3）。`escapeTest` を渡したときだけ測る。
 */

const WAY_CAP = 1e9;

/**
 * @param {object} S       makeSolver の戻り値（nextStates/encode/exitCells...）
 * @param {string[]} starts 入口状態（encode 済み）
 * @param {(state:string)=>boolean} goalTest ゴール（報酬取得）状態か
 * @param {(state:string)=>number}  h        貪欲法のヒューリスティック（小さいほどゴールに近い）
 * @param {number} guardMax 状態数の上限（超えたら throw）
 * @param {(S:object, starts:string[], goalTest:Function)=>boolean} [greedyFn]
 *        軸②の貪欲モデルを差し替える。既定は1手単位のヒルクライム（h を使う）。
 *        倉庫番は「石の裏へ回り込む歩行」が必ず h を増やす＝1手単位では常に詰まり、
 *        軸②が空虚になる∴石パズルは押し単位のマクロ貪欲を渡す（呼び出し側で実装）。
 * @param {(state:string)=>boolean} [escapeTest]
 *        「画面外へ出られる状態」（プレイヤーが `S.exitCells` に立っている）か。
 *        渡すとハードロック検査（I3）を測る＝到達状態から逆到達で塗り、塗られなかった
 *        状態数を `noEscape` で返す。⚠️ 歩行だけの静的検査で代用しないこと
 *        （石や色で閉じ込められる状態を見逃す＝2026-08-02 の訂正）。
 */
export function measureMetrics(S, starts, goalTest, h, { guardMax = 6000000, greedyFn, escapeTest } = {}) {
  // BFS：距離・逆辺・最短解本数。
  const dist = new Map();
  const rev = new Map();
  const ways = new Map();
  const q = [];
  for (const s of starts) if (!dist.has(s)) { dist.set(s, 0); ways.set(s, 1); q.push(s); }
  let head = 0, guard = 0;
  while (head < q.length) {
    if (++guard > guardMax) throw new Error('状態空間が大きすぎる');
    const st = q[head++];
    const d = dist.get(st);
    for (const nx of S.nextStates(st)) {
      if (!rev.has(nx)) rev.set(nx, []);
      rev.get(nx).push(st);
      if (!dist.has(nx)) {
        dist.set(nx, d + 1);
        ways.set(nx, Math.min(WAY_CAP, ways.get(st)));
        q.push(nx);
      } else if (dist.get(nx) === d + 1) {
        ways.set(nx, Math.min(WAY_CAP, ways.get(nx) + ways.get(st)));
      }
    }
  }
  const seen = q;                        // 到達順（BFS 順）
  const goals = seen.filter(goalTest);

  // 軸①：最短手数 L。
  let L = Infinity;
  for (const g of goals) L = Math.min(L, dist.get(g));

  // 軸④a：最短解の本数（dist===L のゴール状態への本数の和）。
  let solCount = 0;
  for (const g of goals) if (dist.get(g) === L) solCount += ways.get(g);

  // 軸③：デッドロック。ゴールから逆到達で「ゴールへ戻れる」を塗り、非ゴールで
  // 塗られなかった＝デッドロック（誤手で入る回復不能状態＝再入リセットでのみ回復）。
  const canReachGoal = new Set(goals);
  const rq = [...goals];
  let rhead = 0;
  while (rhead < rq.length) {
    const st = rq[rhead++];
    for (const prev of rev.get(st) ?? []) {
      if (!canReachGoal.has(prev)) { canReachGoal.add(prev); rq.push(prev); }
    }
  }
  const goalSet = new Set(goals);
  const deadlocks = seen.filter((st) => !canReachGoal.has(st) && !goalSet.has(st));

  // 成立条件（I3）：どの到達状態からも画面外へ戻れるか。デッドロックと同じ rev グラフを
  // 使い、脱出できる状態から逆に塗る。塗られなかった状態＝**ハードロック**（石をリセット
  // する手段が無い＝倉庫番の「やり直せる詰み」ではなく本当の詰み）。
  // ⚠️ ゴール状態も除外しない＝宝を取った後に出られない盤面も不可（`T` は解けば開いたまま）。
  let noEscape = null;
  if (escapeTest) {
    const escaped = seen.filter(escapeTest);
    const canEscape = new Set(escaped);
    const eq = [...escaped];
    let ehead = 0;
    while (ehead < eq.length) {
      for (const prev of rev.get(eq[ehead++]) ?? []) {
        if (!canEscape.has(prev)) { canEscape.add(prev); eq.push(prev); }
      }
    }
    noEscape = seen.reduce((n, st) => n + (canEscape.has(st) ? 0 : 1), 0);
  }

  // 軸④b：強制手率。ゴールへ戻れる非ゴール状態のうち「ゴールへ進む後継が1つだけ」の割合。
  let forced = 0, branchTotal = 0;
  for (const st of seen) {
    if (!canReachGoal.has(st) || goalSet.has(st)) continue;
    branchTotal++;
    const good = S.nextStates(st).filter((nx) => canReachGoal.has(nx));
    if (good.length <= 1) forced++;
  }
  const forcedRatio = branchTotal ? forced / branchTotal : 0;

  // 軸②：貪欲法で解けるか。既定は1手単位のヒルクライム（h を増やす手しか無い＝行き詰まり）。
  const greedy = greedyFn ? greedyFn(S, starts, goalTest) : greedySolvable(S, starts, goalTest, h);

  return {
    states: seen.length,
    L: L === Infinity ? null : L,
    greedy,
    deadlocks: deadlocks.length,
    solCount: solCount >= WAY_CAP ? `≥${WAY_CAP}` : solCount,
    forcedRatio: Number(forcedRatio.toFixed(2)),
    goals: goals.length,
    noEscape,                              // null = 未測定（escapeTest を渡していない）
  };
}

function greedySolvable(S, starts, goalTest, h) {
  for (const start of starts) {
    let cur = start;
    const visited = new Set([cur]);
    for (let step = 0; step < 4000; step++) {
      if (goalTest(cur)) return true;
      const cand = S.nextStates(cur).filter((s) => !visited.has(s));
      if (!cand.length) break;
      let best = cand[0], bestH = h(best);
      for (const s of cand) { const hs = h(s); if (hs < bestH) { best = s; bestH = hs; } }
      if (bestH > h(cur)) break;         // h を増やすしか無い＝貪欲は詰まる
      visited.add(best); cur = best;
    }
  }
  return false;
}

/**
 * 石パズル（倉庫番型）用の軸②の貪欲モデル＝**押し単位のマクロ貪欲**（単一ソース）。
 *
 * 既定の `greedySolvable` は1手単位のヒルクライムで、石の裏へ回り込む歩行が必ず h を増やす
 * ∴石パズルでは常に「貪欲では解けない」になり軸②が空虚になる。ここでは
 *   ・石を1個も動かさない歩きは自由（同じ石配置のあいだは h を見ない）
 *   ・押しは「石とボタンの割当（最小マンハッタン和）が必ず減る押し」だけ許す
 * とし、それで解けたら「考えずに手が進む＝作業ゲー」と判定する。
 *
 * ⚠️ 2026-09-05（0o-3）にここへ集約した。それまでは鍵部屋の生成スクリプト各々に写しが
 *    あるだけで（generate-sokoban-playable / generate-key-room-d4,d6,d8,dark-tower-43 /
 *    migrate-test-sokoban-tiers）、`measureMetrics` に渡し忘れた測定（0o-2 の錠の間・
 *    tests/darklord-prison.spec.js の②）が「貪欲では解けない」を空虚に主張していた。
 *    上記スクリプトは一度きりの生成物（実行済み）なので写しはそのまま残す＝**新規の
 *    石パズル測定はここから import する**。
 *
 * @param {string[]} buttons ボタンのセル（"r,c"）
 * @returns {(S:object, starts:string[], goalTest:Function)=>boolean} greedyFn
 */
export function makeGreedyPush(buttons) {
  const parse = (s) => s.split(',').map(Number);
  const bpos = buttons.map(parse);
  const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const perms = (xs) => xs.length <= 1 ? [xs]
    : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
  const BPERM = perms(bpos.map((_, i) => i));
  const potential = (stones) => {
    const sp = stones.map(parse);
    let best = Infinity;
    for (const p of BPERM) {
      let sum = 0;
      for (let i = 0; i < sp.length; i++) sum += man(sp[i], bpos[p[i]]);
      best = Math.min(best, sum);
    }
    return best;
  };
  const stonesOf = (state) => { const f = state.split('|')[1]; return f ? f.split(';') : []; };
  const macroKey = (state) => state.split('|').slice(0, 2).join('|');
  return (S, starts, goalTest) => {
    const q = [...starts];
    const seen = new Set(q.map(macroKey));
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      const curStones = stonesOf(cur).join(';');
      const p0 = potential(stonesOf(cur));
      const walk = new Set([cur]), wq = [cur];
      for (let j = 0; j < wq.length; j++) {
        if (goalTest(wq[j])) return true;
        for (const nx of S.nextStates(wq[j])) {
          if (stonesOf(nx).join(';') === curStones) {
            if (!walk.has(nx)) { walk.add(nx); wq.push(nx); }
            continue;
          }
          if (potential(stonesOf(nx)) >= p0) continue;
          const k = macroKey(nx);
          if (!seen.has(k)) { seen.add(k); q.push(nx); }
        }
      }
    }
    return false;
  };
}

/**
 * ユーザーの難易度の軸「読みの深さ（順序が一意）」を測る（0o-3・2026-09-05 に追加）。
 *
 * 最短解 DAG（`dist + distToGoal === L` の状態だけ）の上で「ボタンが**初めて**石で埋まる
 * 順序」を全部集める。1通りしか無い＝プレイヤーは順序を読みで決めるしかない。2通り以上＝
 * どちらでもよい＝順序は考えなくてよい（0o-2 の錠の間がそれだった）。
 *
 * @param {object} S makeSolver の戻り値
 * @param {string[]} starts 入口状態
 * @param {(state:string)=>boolean} goalTest
 * @param {string[]} buttons ボタンのセル（"r,c"）＝返る順序はこの配列の添字
 * @returns {{L:number|null, orders:number[][]}} orders は添字列の集合（辞書順）
 */
export function buttonFillOrders(S, starts, goalTest, buttons) {
  const dist = new Map(), rev = new Map(), q = [];
  for (const s of starts) if (!dist.has(s)) { dist.set(s, 0); q.push(s); }
  for (let i = 0; i < q.length; i++) {
    const d = dist.get(q[i]);
    for (const nx of S.nextStates(q[i])) {
      if (!rev.has(nx)) rev.set(nx, []);
      rev.get(nx).push(q[i]);
      if (!dist.has(nx)) { dist.set(nx, d + 1); q.push(nx); }
    }
  }
  const goals = q.filter(goalTest);
  if (!goals.length) return { L: null, orders: [] };
  const L = Math.min(...goals.map((g) => dist.get(g)));
  // ゴールからの逆距離＝最短解 DAG の判定に使う。
  const dtg = new Map(), bq = [];
  for (const g of goals) if (!dtg.has(g)) { dtg.set(g, 0); bq.push(g); }
  for (let i = 0; i < bq.length; i++) {
    const d = dtg.get(bq[i]);
    for (const p of rev.get(bq[i]) ?? []) if (!dtg.has(p)) { dtg.set(p, d + 1); bq.push(p); }
  }
  const onOpt = (s) => dtg.has(s) && dist.get(s) + dtg.get(s) === L;
  const bIdx = new Map(buttons.map((b, i) => [b, i]));
  const filled = (s) => {
    const f = s.split('|')[1];
    return new Set((f ? f.split(';') : []).filter((p) => bIdx.has(p)).map((p) => bIdx.get(p)));
  };
  const orders = new Map();
  for (const s of starts) if (onOpt(s)) orders.set(s, new Set(['']));
  for (const st of q.filter(onOpt).sort((a, b) => dist.get(a) - dist.get(b))) {
    const cur = orders.get(st);
    if (!cur) continue;
    const fromFilled = filled(st);
    for (const nx of S.nextStates(st)) {
      if (!onOpt(nx) || dist.get(nx) !== dist.get(st) + 1) continue;
      const gained = [...filled(nx)].filter((i) => !fromFilled.has(i));
      if (!orders.has(nx)) orders.set(nx, new Set());
      const dst = orders.get(nx);
      for (const seq of cur) {
        const have = seq ? seq.split(',').map(Number) : [];
        let out = seq;
        for (const g of gained) if (!have.includes(g)) out = out ? `${out},${g}` : `${g}`;
        dst.add(out);
      }
    }
  }
  const full = new Set();
  for (const g of goals) if (dist.get(g) === L) for (const seq of orders.get(g) ?? []) full.add(seq);
  return { L, orders: [...full].sort().map((s) => (s ? s.split(',').map(Number) : [])) };
}

/**
 * 下限条件（PUZZLE-DESIGN §2・v1）:
 *   L ≥ 6 かつ (insight>0 or deadlock>0) かつ 強制手率 ≤ 0.7 かつ 貪欲で解けない。
 * @returns {{pass:boolean, label:string}}
 */
export function verdict(m) {
  if (m.L === null) return { pass: false, label: '✗ 解なし（ゴール到達不能）' };
  const insight = !m.greedy;
  const pass = m.L >= 6 && (insight || m.deadlocks > 0) && m.forcedRatio <= 0.7 && !m.greedy;
  const reasons = [];
  if (m.L < 6) reasons.push(`L=${m.L}<6`);
  if (m.greedy) reasons.push('貪欲で解ける');
  if (!insight && m.deadlocks === 0) reasons.push('insight=0 かつ deadlock=0');
  if (m.forcedRatio > 0.7) reasons.push(`強制手率${m.forcedRatio}>0.7`);
  return { pass, label: pass ? '✅ 高難度（下限クリア）' : `✗ 未達（${reasons.join(' / ')}）` };
}
