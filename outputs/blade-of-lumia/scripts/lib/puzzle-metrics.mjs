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
 */

const WAY_CAP = 1e9;

/**
 * @param {object} S       makeSolver の戻り値（nextStates/encode/exitCells...）
 * @param {string[]} starts 入口状態（encode 済み）
 * @param {(state:string)=>boolean} goalTest ゴール（報酬取得）状態か
 * @param {(state:string)=>number}  h        貪欲法のヒューリスティック（小さいほどゴールに近い）
 * @param {number} guardMax 状態数の上限（超えたら throw）
 */
export function measureMetrics(S, starts, goalTest, h, { guardMax = 6000000 } = {}) {
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

  // 軸④b：強制手率。ゴールへ戻れる非ゴール状態のうち「ゴールへ進む後継が1つだけ」の割合。
  let forced = 0, branchTotal = 0;
  for (const st of seen) {
    if (!canReachGoal.has(st) || goalSet.has(st)) continue;
    branchTotal++;
    const good = S.nextStates(st).filter((nx) => canReachGoal.has(nx));
    if (good.length <= 1) forced++;
  }
  const forcedRatio = branchTotal ? forced / branchTotal : 0;

  // 軸②：貪欲法（ヒルクライム）で解けるか。h を増やす手しか無い＝行き詰まり。
  const greedy = greedySolvable(S, starts, goalTest, h);

  return {
    states: seen.length,
    L: L === Infinity ? null : L,
    greedy,
    deadlocks: deadlocks.length,
    solCount: solCount >= WAY_CAP ? `≥${WAY_CAP}` : solCount,
    forcedRatio: Number(forcedRatio.toFixed(2)),
    goals: goals.length,
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
