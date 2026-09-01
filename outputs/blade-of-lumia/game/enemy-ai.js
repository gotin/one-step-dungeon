// game/enemy-ai.js ── 敵AI（Phase 0-2 Step 5）
// createEnemyAi(deps) factory で生成する。
// enemyTick / enemyChase / bossTickHitAndAway / enemyAttack を提供。
// （checkEnemyContact＝接触ダメージは Phase 5.5k k-7.5 で廃止＝下の「接触ダメージ」の項）

import { ENEMY_META } from '../shared/enemies.js';
import { TILE } from '../shared/tiles.js';
import { makeSprite } from '../shared/sprites.js';
import { playSound } from '../shared/sounds.js';
import { MOVE_STEP, ATTACK_POSE_MS, TICK_MS, SLAM_RANGE, SLAM_WINDUP_MS, SLAM_COOLDOWN_MS,
	MELEE_WINDUP_MS, MELEE_FREEZE_MS } from './constants.js';
import { statefulTileClosed, overlapArea } from './passable.js';
// Phase 5.5k k-9: 突進が壁に激突した印（⭐）の位置＝敵の中心。中心の取り方は hitbox.js が
// 単一の真実（projectile.js showStunEffect も同じ関数を使う＝印の位置がずれない）。
// Phase 8-4 (4) 0d-2.5: 大型敵の間合いは **左上ではなく中心/端** から測る
// （enemyCellCenter / enemyHalf / enemyEdgeDist ＝hitbox.js が単一の真実）。
import { enemyCenter, enemyCellCenter, enemyHalf, enemyEdgeDist, aabbOverlap } from './hitbox.js';
// Phase 8-4 (4) 0d-2.11 (A): 攻撃硬直の窓（＝反撃の窓）の判定は enemy-state.js が単一の真実。
// この絵（`.attack-recover`）と combat.js の弱点判定（`weakness.window: 'recover'`）が
// 同じ窓を指すため＝どちらか片方だけ書き換えると理不尽な戦闘になる。
import { isInRecoverWindow, isSoaring } from './enemy-state.js';
// Phase 5.5k k-7.5: hitbox.js enemyPointHit の import は接触ダメージ（checkEnemyContact）
// 廃止で不要になった。体当たりの到達判定は slamReachHit（軸ごとの間合い）が持つ。

/**
 * createEnemyAi(deps) – factory
 *
 * deps:
 *   getStageData()               – stageData
 *   getPlayer()                  – player
 *   getEnemies()                 – enemies 配列（変更なし・最新値を毎回取得）
 *   getHeroDir()                 – heroDir
 *   getCharLayerEl()             – charLayerEl
 *   getCellPx()                  – セルサイズ(px)
 *   toTileRow(y)                 – float → タイル行
 *   toTileCol(x)                 – float → タイル列
 *   gameNow()                    – 論理時間
 *   isPassableForEnemy(y, x, e)  – 敵の通行可否判定
 *   isPassable(x, y, axis)       – **プレイヤー側の**通行可否判定（引数の順が敵側と逆＝x が先）
 *                                  Phase 8-4 (4) 0d-3（8体目 I）: 舌の引き寄せでプレイヤーを
 *                                  動かす先の確認に使う（combat.js knockbackPlayerFrom と同じ作法）
 *   moveCharEl(id, x, y)         – キャラ要素の位置更新
 *   takeDamage(amount)           – プレイヤーダメージ
 *   dealDamageToEnemy(e, dmg)    – 敵ダメージ
 *   fireEnemyProjectile(e, type, ndx, ndy, speed) – 敵の投擲物発射
 *   isShieldBlockingDir(dx, dy)  – 盾ブロック方向判定
 *   showShieldBlockEffect(x, y)  – 盾ブロックエフェクト
 *   debugMode                    – デバッグフラグ getter
 *   ── Phase 5-3: 敵が石を押すパズル用 ──
 *   getCurrentLayer()            – 現在レイヤー
 *   getStageKey()                – 現在ステージキー
 *   getSS(layer, key)            – ステージ状態取得
 *   tilePassable(r, c)           – 地形の通行可否（石の押し先判定用）
 *   checkStoneOnSwitch()         – 石→ボタン判定（既存・conditions.js）
 *   evaluateConditions()         – 条件再評価（既存）
 *   renderBoard() / renderChars()– 再描画
 *   ── Phase 5.5k k-5: ルピー喰いの吸血 ──
 *   updateHud()                  – HUD 更新（所持ルピーの表示）
 *   pulse(text, dur)             – メッセージ表示
 *   ── Phase 5.5k k-7: プレイヤー側の一時デバフ ──
 *   inflictDebuff(meta)          – 攻撃を当てた敵の meta.inflict を player 側の窓に立てる
 */
export function createEnemyAi(deps) {
	const {
		getStageData, getPlayer, getEnemies,
		getHeroDir, getCharLayerEl, getCellPx,
		toTileRow, toTileCol, gameNow,
		isPassableForEnemy, moveCharEl,
		// Phase 8-4 (4) 0d-3（8体目 I 沼地の大蝦蟇）: 舌の引き寄せはプレイヤーを動かす∴
		// **プレイヤー側の**通行判定が要る（壁・水・穴・石・敵の手前で止める）。
		isPassable,
		takeDamage, dealDamageToEnemy,
		fireEnemyProjectile, isShieldBlockingDir, showShieldBlockEffect,
		getDebugMode,
		// Phase 5-3: 敵が石を押すパズル
		getCurrentLayer, getStageKey, getSS, tilePassable,
		checkStoneOnSwitch, evaluateConditions, renderBoard, renderChars,
		// Phase 5.5k k-5: ルピー喰いの吸血（所持ルピーが減る＝HUD とメッセージが要る）
		updateHud, pulse,
		// Phase 9-6: 両生敵（amphibious）の地形別速度に使う水判定
		isWaterAt,
		// Phase 5.5k k-7: 敵の攻撃で立てるプレイヤー側の一時デバフ（game/debuff.js）
		inflictDebuff,
	} = deps;

	// ── 速度の解決（Phase 9-6）─────────────────────────────────
	// 敵の1tickあたりの移動量を返す。
	//   基準は **e.speed**（インスタンス値）… boss.js の checkBossPhase が
	//   フェーズ移行で e.speed を書き換えるため。meta.speed を直接読むと
	//   フェーズ加速が無視される（従来の実装はここが meta.speed だった）。
	//   その上に **地形倍率** を掛ける … meta.moveSpeed = { water, land } を持つ
	//   両生敵（海の主）は水では速く陸では鈍い。moveSpeed が無い敵（＝既存の全敵）は
	//   倍率 1 ＝従来どおりの挙動。
	function resolveEnemySpeed(e, meta) {
		const base = e.speed ?? meta?.speed ?? 0;
		const ms = meta?.moveSpeed;
		if (!ms) return base;
		const r = toTileRow(e.y), c = toTileCol(e.x);
		const onWater = isWaterAt ? isWaterAt(r, c) : false;
		const factor = (onWater ? ms.water : ms.land) ?? 1;
		return base * factor;
	}

	// ── Phase 8-4 (4) 層1: 「今この敵が使う表」の解決 ─────────────────
	// ボスのフェーズ（boss.js checkBossPhase）は**エンティティ側にだけ**書く（`e._attacks`
	// など）＝ここが読み手の単一の入口になる。∴新しい行動表を足すときも
	// checkBossPhase と enemy-ai.js の読み出しが二重管理にならない。
	// ⚠️ ボス専用の機構ではない＝`e._attacks` を立てればザコにも同じように効く
	//   （将来「怒ったザコ」を作るときに機構を作り直さない）。
	//
	// resolveAttackList … 攻撃表。優先順は
	//   ① e._attacks（フェーズで差し替えられた表）
	//   ② meta.attacks（複数攻撃）
	//   ③ meta.attack（単体攻撃の後方互換）
	// さらに e._atkCdMul（phases[].attackCooldownMultiplier）があればクールダウンを掛ける。
	// ⚠️ **cooldown を明示していない攻撃は掛けない**＝攻撃種別ごとの既定値
	//   （charge は SLAM_COOLDOWN_MS・他は 3000）を 3000 に固定してしまわないため。
	//   倍率は常に「表の値」から計算する＝フェーズを跨いでも複利で縮まない。
	function resolveAttackList(e, meta) {
		const base = e?._attacks ?? meta?.attacks ?? (meta?.attack ? [meta.attack] : []);
		const mul = e?._atkCdMul;
		if (!mul || mul === 1) return base;
		return base.map(a => (a && a.cooldown != null)
			? { ...a, cooldown: Math.max(1, Math.round(a.cooldown * mul)) }
			: a);
	}

	// resolveModeWeights … ヒット＆アウェイのアプローチ選択の重み。
	// `e._modeWeights` は**学習で書き換わる生きた状態**（成功で上げ・盾で防がれたら下げ）
	// ∴既定値の計算はここに集約し、bossTickHitAndAway の初期化もこれを写して始める。
	// ⚠️ 既定値は `{flank:1, direct:1, wander:1}`（strafe なし）＝**従来の初期化と同じ**。
	//   旧 pickApproachMode には「石投げを持つ敵は strafe 1.2」という別の既定表もあったが、
	//   `bossTickHitAndAway` の初期化が pickApproachMode より必ず先に `_modeWeights` を
	//   立てる∴**一度も読まれない死んだ分岐**だった（2026-08-23 に確認）。ここへ集約する
	//   ときに落とした＝挙動は変わらない（strafe を既定にしたい敵は
	//   `initialModeWeights` に書く＝13 ボスのうち 10 体は既に書いてある）。
	function resolveModeWeights(e, meta) {
		return e?._modeWeights ?? meta?.initialModeWeights ?? { flank: 1.0, direct: 1.0, wander: 1.0 };
	}

	// resolveHitAndAway / resolveCombat … 移動 AI の選択そのものをフェーズで差し替える口。
	// ⚠️ `??` ではなく `!== undefined` で見る＝フェーズが `false`/`null` を書いて
	//   **機構を切る**（ヒット＆アウェイをやめて素の追跡になる等）ことができる。
	function resolveHitAndAway(e, meta) {
		return e?._hitAndAway !== undefined ? e._hitAndAway : meta?.hitAndAway;
	}
	function resolveCombat(e, meta) {
		return e?._combat !== undefined ? e._combat : meta?.combat;
	}
	// resolveDash … 突進の設定そのものをフェーズで差し替える口（Phase 8-4 (4) 0d-3・2体目）。
	// 「後半になったら機構が1つ増える」を層1 の語彙で表すための最小の追加＝A 炎のサラマンドラは
	// 前半 `dash` を持たず、HP50% の相で `phases[].dash` が入って初めて突進を始める。
	// ⚠️ **読む側を1か所に集約する**（`tickDash` と `enemyTick` の2つのガード）＝どれか1つが
	//   `meta.dash` を直接読むと「相で足した突進の絵が出ない/スタンで止まらない」が起きる。
	function resolveDash(e, meta) {
		return e?._dash !== undefined ? e._dash : meta?.dash;
	}
	// resolveHide … 隠れ↔出現の周期そのものをフェーズで差し替える口（Phase 8-4 (4) 0d-3・3体目）。
	// N 砂嵐の蠍王は HP50% の相で `phases[].hide` が入り潜行が短くなる＝待ち伏せの回数が増える。
	// ⚠️ `resolveDash` と同じ理由で**読む側を1か所に集約する**（`tickHide` だけが読む）。
	function resolveHide(e, meta) {
		return e?._hide !== undefined ? e._hide : meta?.hide;
	}
	// resolveCoil … 巻きつきの設定そのものをフェーズで差し替える口（Phase 8-4 (4) 0d-3・4体目）。
	// J 深海の海蛇は HP50% の相で `phases[].coil` が入り「半周で締め上げる」形に変わる。
	// ⚠️ `resolveDash`/`resolveHide` と同じ理由で**読む側を1か所に集約する**
	//   （`enemyCoil` / `tickCoilCrush` / `syncCoilRing` の3つが必ずここを通る）。
	function resolveCoil(e, meta) {
		return e?._coil !== undefined ? e._coil : meta?.coil;
	}
	// resolveGaze … 見据えの設定そのものをフェーズで差し替える口（Phase 8-4 (4) 0d-3・5体目）。
	// O 古森の巨人は HP50% の相で `phases[].gaze` が入り「見据え直しが速く・潰す範囲が広い」形になる。
	// ⚠️ 上3つと同じ理由で**読む側を1か所に集約する**
	//   （`tickGaze` / `enemyGazeStride` / `syncGazeMark` の3つが必ずここを通る）。
	function resolveGaze(e, meta) {
		return e?._gaze !== undefined ? e._gaze : meta?.gaze;
	}
	// resolveSoar … 滞空／急降下の設定をフェーズで差し替える口（Phase 8-4 (4) 0d-3・6体目）。
	// U 嵐の鷲王は HP50% の相で `phases[].soar` が入り「地上に居る時間が短く・旋回と急降下が
	// 速い」形に変わる。⚠️ 上4つと同じ理由で**読む側を1か所に集約する**
	//   （`tickSoar` / `enemySoarStride` / `syncSoarMotion` / `crashSoar` の4つが必ずここを通る）。
	function resolveSoar(e, meta) {
		return e?._soar !== undefined ? e._soar : meta?.soar;
	}

	// ── Phase 5.5k: 攻撃硬直（2026-08-12 ユーザー指摘「攻撃動作中は動かないようにすべき」）──
	// プレイヤーは剣を振っている間（_atkUntil の窓）足が止まる（player.js movePlayer）。
	// 敵側に同じ規則が無かった＝振りながら詰めてくる非対称だった ∴ 攻撃が成立した瞬間に
	// e._freezeUntil を立て、enemyTick がその窓の間は移動も攻撃も止める。
	//   ・**攻撃ごとの `freezeMs`** が最優先（2026-08-26）＝同じ敵の中で近接と遠隔に別の硬直を
	//     与える唯一の口。`meta.attackFreezeMs` は敵単位＝全攻撃に同じ値しか置けないため、
	//     「剣は硬直あり／石は硬直なし」を宣言できなかった。
	//     ⚠️ 追加した理由＝`directional` を**絵のため**（向き別スプライト）に立てると、下の
	//        既定経路で**遠隔の硬直が 0 → ATTACK_POSE_MS に化ける**＝絵のフラグが移動の設計を
	//        書き換える（2026-08-26 に魔物 W で実測：遠隔相で剣の間合いに居る時間が 19%→23%）。
	//   ・meta.attackFreezeMs で敵ごとに延ばせる（高機動の敵は硬直を長くして隙を作る）
	//   ・**近接（sword / charge）の既定＝MELEE_FREEZE_MS**（Phase 8-4 (4) 0d-2.7）＝
	//     殴り返す窓。間合いが互角なら予告だけでは刺し違えが残るため時間で窓を作る。
	//   ・遠隔の既定は従来どおり＝directional なら ATTACK_POSE_MS・それ以外は 0
	//     （撃つたびに MELEE_FREEZE_MS 固まると「間合いを保って撃つ」挙動が壊れる）。
	// ⚠️ 第2引数を省くと従来の（近接でない側の）既定を返す＝既存の呼び出しと互換。
	const MELEE_ATTACK_TYPES = new Set(['sword', 'charge']);
	function resolveAttackFreezeMs(meta, atk) {
		if (atk?.freezeMs != null) return atk.freezeMs;
		if (meta?.attackFreezeMs != null) return meta.attackFreezeMs;
		if (atk && MELEE_ATTACK_TYPES.has(atk.type)) return MELEE_FREEZE_MS;
		return meta?.directional ? ATTACK_POSE_MS : 0;
	}

	// 攻撃が成立したときの共通後処理＝クールダウン記録・攻撃ポーズ窓・攻撃硬直。
	// 攻撃種別ごとに散っていた3行を1か所に集める（＝硬直を入れ忘れた攻撃種が出ない）。
	// 攻撃の種別（近接か遠隔か）は**呼び出し側に持たせず** i から引き直す＝呼び出し箇所が
	// 10 か所以上あるため、渡し忘れた1か所だけ硬直が入らない事故を作らない。
	function markAttack(e, meta, i, now) {
		if (!e._attackTimes) e._attackTimes = {};
		e._attackTimes[i] = now;
		if (meta?.directional) e._atkUntil = now + ATTACK_POSE_MS;
		const atk = resolveAttackList(e, meta)?.[i];
		const freeze = resolveAttackFreezeMs(meta, atk);
		if (freeze > 0) e._freezeUntil = now + freeze;
	}

	// ── Phase 5.5k k-7.5: 体当たり攻撃（slam）─────────────────────
	// 体当たり専門の敵（`attack:{type:'charge'}` の10種）の攻撃。**「隣接＝即ダメージ」ではない**
	// （2026-08-17 ユーザー決定）：
	//   ① 到達距離に入った tick に **予告** を始める（`e._slamAt` ＝解決の論理時刻）
	//   ② 予告中は移動も他の攻撃もしない（enemyTick がこの tick を専有する）＋
	//      拡大縮小2往復のモーションを出す（board.css `.slam-windup`）
	//   ③ 解決の tick に **もう一度** 到達判定をする＝離れていれば空振り
	//   ④ 当たれば `takeDamage`（＋`meta.inflict` のデバフ）→ クールダウン
	// ∴プレイヤーは予告を見て間合いを外せば避けられる＝反応で回避できる攻撃になる。
	// ⚠️ **盾では防げない**（`isShieldBlockingDir` を通さない）＝ユーザー決定④。
	// 盾が効くのは剣攻撃と投擲攻撃だけ＝体当たりは「下がる」以外に答えが無い攻撃。
	const SLAM_PERP = 0.8;   // 主軸に直交する方向の許容ずれ（剣 sword の perpDist と同じ数字）
	// Phase 5.5k k-9: 壁に激突した印（⭐）が消えるまで＝effects.css の stun-burst-anim と同じ長さ。
	const STUN_BURST_MS = 1500;

	// 体当たりの到達判定。剣と同じ「主軸の距離 ≤ range・直交方向のずれ ≤ 0.8」の形
	// （斜めから 1.5 セル離れて殴られないようにする＝箱ではなく十字の間合い）。
	// 大型敵（w×h）は占有範囲の分だけ箱を広げる（hitbox.js enemyPointHit と同じ中心の取り方）。
	function slamReachHit(e, player, range) {
		const { cx, cy } = enemyCellCenter(e);
		const { halfW, halfH } = enemyHalf(e);
		const dx = player.x - cx;
		const dy = player.y - cy;
		const adx = Math.abs(dx), ady = Math.abs(dy);
		if (adx >= ady) return adx <= range + halfW && ady <= SLAM_PERP + halfH;
		return ady <= range + halfH && adx <= SLAM_PERP + halfW;
	}

	// 予告の開始（enemyAttack の charge 分岐から呼ぶ）。
	function startSlam(e, atk, i, now) {
		const player = getPlayer();
		// 突っ込む方向を向く＝向き別スプライトを持つ敵でもモーションの向きが合う
		// （0d-2.5: 向きも**中心から**決める＝2×2 で「西に居るのに下を向く」が出ない）
		const { cx, cy } = enemyCellCenter(e);
		const dx = player.x - cx, dy = player.y - cy;
		if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) {
			e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
		}
		e._slamWindupMs = atk.windupMs ?? SLAM_WINDUP_MS;
		e._slamAt  = now + e._slamWindupMs;
		e._slamIdx = i;
	}

	// 予告の解決。戻り値 true ＝この tick は slam が専有した（移動も他の攻撃もしない）。
	function tickSlam(e, meta, now) {
		if (e._slamAt == null) return false;
		if (now < e._slamAt) return true;                 // まだ予告中
		const list = resolveAttackList(e, meta);
		const i    = e._slamIdx ?? 0;
		const atk  = list[i] ?? {};
		e._slamAt = null; e._slamIdx = null;
		// 隠れ中（潜行・地中・滞空）に解決の時刻が来たら空振りにする＝隠れている間は
		// 攻撃もされない（`e.hidden` は無敵と対＝combat.js の扱いと揃える）。
		if (e.hidden) { markAttack(e, meta, i, now); return true; }
		const player = getPlayer();
		if (slamReachHit(e, player, atk.range ?? SLAM_RANGE)) {
			// e.atk を先に見る＝分裂で生まれた小型（childAtk）は親より弱い（k-5a と同じ作法）
			takeDamage(e.atk ?? meta?.atk ?? 1);
			// 一時デバフ（#13 剣封じ・#15 毒）はここで立てる＝触れた事実ではなく攻撃の結果になった
			// （k-7a は checkEnemyContact で立てていた＝k-7.5 で接触ダメージを廃止したため移設）。
			if (meta?.inflict) inflictDebuff?.(meta);
		}
		// クールダウン・硬直は**解決した時刻から**数える（予告の開始からではない）
		markAttack(e, meta, i, now);
		return true;
	}

	// 予告モーションの見た目を今の状態に合わせる（毎tick・syncDirectionalSprite と同じ作法＝
	// renderChars が要素を作り直しても次の tick で復帰する）。
	// 2026-08-26: この拡大縮小は体当たり（charge）だけのものではなくなった＝**剣を持たない敵の
	// 近接（sword）の予告もここに乗る**（ユーザー指摘「こいつらは体当たり攻撃で、その予備動作は
	// いままでどおりサイズの収縮でよかった」）。∴ここが「体で来る攻撃の予告」の唯一の絵になり、
	// `.swing-windup`（剣を振り上げる）は meta.wieldsSword の敵だけが使う。
	// ⚠️ 2つの予告が同じクラスを取り合わないよう、on/off の判断は**両方の状態を見て**決める
	//    （片方の sync が他方の立てたクラスを消さない＝呼ぶ順に依存しない）。
	function syncSlamMotion(e, meta) {
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		const swingIsBody = e._swingAt != null && !meta?.wieldsSword;
		const on = e._slamAt != null || swingIsBody;
		if (on) {
			// 拡大縮小2往復＝1往復あたり windup の半分（board.css の iteration-count が 2）
			const windupMs = e._slamAt != null
				? (e._slamWindupMs ?? SLAM_WINDUP_MS)
				: (e._swingWindupMs ?? MELEE_WINDUP_MS);
			el.style.setProperty('--slam-pulse-ms', `${Math.round(windupMs / 2)}ms`);
		}
		el.classList.toggle('slam-windup', on);
	}

	// ── Phase 5.5k: 遠隔／近接の二相（2026-08-12 ユーザー指摘）────────────────
	// 「遠隔攻撃を持つ敵が 1 セルまで詰めてくる＝常にくっついてくるキャラ」を直す。
	// meta.combat = { keepMin, keepMax, rangedMs, meleeMs } を持つ敵は
	//   ・遠隔モード … keepMin〜keepMax の距離を保ち、プレイヤーの行/列に自分を揃える
	//                  （揃うと swordBeam の発射条件が満たされる＝ちゃんと撃ってくる）
	//   ・近接モード … 従来どおり詰めて斬る
	// を交互に繰り返す。**周期は固定値（乱数を混ぜない）**＝プレイヤーがリズムを読んで
	// 「今は近づく番だから引く」と対処できる（初代ゼルダ的な読み合い）＋テストが決定論的。
	// 位相だけは敵 id（"行,列" の文字列）から導いてずらす＝同じ部屋の複数体が同時に
	// 近接モードへ入って一斉突撃にならない（乱数を使わないので再現性は保たれる）。
	function phaseOffsetMs(e, span) {
		if (!span) return 0;
		let h = 0;
		for (const ch of String(e.id)) h = (h * 31 + ch.charCodeAt(0)) % 100003;
		return h % span;
	}

	function tickCombatMode(e, meta, now) {
		const cfg = resolveCombat(e, meta);
		if (!cfg) return null;
		const rangedMs = cfg.rangedMs ?? 3000;
		const meleeMs  = cfg.meleeMs  ?? 1800;
		if (e._cmode == null) {
			// 初期は遠隔モード＝「離れた敵が斬撃を飛ばしてくる」から戦闘が始まる。
			e._cmode = cfg.startMode ?? 'ranged';
			e._cmodeUntil = now + rangedMs + phaseOffsetMs(e, rangedMs + meleeMs);
		} else if (now >= e._cmodeUntil) {
			e._cmode = e._cmode === 'ranged' ? 'melee' : 'ranged';
			e._cmodeUntil = now + (e._cmode === 'ranged' ? rangedMs : meleeMs);
		}
		return e._cmode;
	}

	// 遠隔モードの移動＝間合いを保ちながら行/列を揃える。
	//   dist < keepMin  … 後退（近づかれ過ぎたら下がる＝密着し続けない）
	//   dist > keepMax  … 接近（射程外まで離れたら詰める＝棒立ちにならない）
	//   その間          … 直交方向（ずれている軸）を詰めて行/列を揃える。揃っていたら動かない
	//                     ＝「撃つ構えで待つ」＝プレイヤーが列から外れる時間ができる
	function enemyKeepDistance(e, meta, speed, cfg) {
		const player = getPlayer();
		const dx = player.x - e.x, dy = player.y - e.y;

		// 向きは常にプレイヤーを見る（撃つ方向と絵を一致させる）。
		// ⚠️ 2026-08-26: この行は**歩幅の溜め（e.accum）より前**に置く。後ろに置くと
		//    鈍足の敵（魔物 W は speed 0.45＝2〜3 tick に1歩）は向き直りも 2〜3 tick 待ちになり、
		//    さらに「間合いが合っていて1歩も動かない相」では向きが完全に凍る
		//    （＝プレイヤーが回り込んでも見続けない）。向きは移動の副産物ではない。
		e.dir = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');

		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;

		const dist = Math.hypot(dx, dy);
		const step = MOVE_STEP;
		const keepMin = cfg.keepMin ?? 3.0;
		const keepMax = cfg.keepMax ?? 6.5;

		const candidates = [];
		const sy = Math.sign(dy) || 1, sx = Math.sign(dx) || 1;
		if (dist < keepMin) {
			// 後退＝離れる向き優先。塞がれていたら横へ逃げる（壁際で固まらない）
			if (Math.abs(dy) >= Math.abs(dx)) {
				candidates.push([-sy * step, 0], [0, -sx * step], [0, sx * step]);
			} else {
				candidates.push([0, -sx * step], [-sy * step, 0], [sy * step, 0]);
			}
		} else if (dist > keepMax) {
			if (Math.abs(dy) >= Math.abs(dx)) candidates.push([sy * step, 0], [0, sx * step]);
			else                              candidates.push([0, sx * step], [sy * step, 0]);
		} else {
			// 整列＝ずれの小さい軸（＝あと少しで揃う軸）を 0 に近づける。
			// 揃っている（ずれ < 0.5 セル）なら候補ゼロ＝その場で構える。
			const alignRow = Math.abs(dy) <= Math.abs(dx);   // 行を揃える（y を合わせる）
			const offset = alignRow ? Math.abs(dy) : Math.abs(dx);
			if (offset >= 0.5) {
				if (alignRow) candidates.push([sy * step, 0], [0, sx * step]);
				else          candidates.push([0, sx * step], [sy * step, 0]);
			}
		}

		for (const [my, mx] of candidates) {
			if (isPassableForEnemy(e.y + my, e.x + mx, e)) { e.y += my; e.x += mx; break; }
		}
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// ── Phase 8-4 (4) 0d-3（2体目 A 炎のサラマンドラ）: 車線取りの移動 ────────────
	// meta.laneStalk = { lockTol, holdMin, holdMax }。**まっすぐ寄らない**移動アルゴリズム＝
	//   ① プレイヤーの行 or 列（＝ずれの小さい軸）を選び、**直交方向だけ**歩いて乗る（横歩き）
	//   ② 乗ったら車線上で間合いを holdMin〜holdMax に整える（遠ければ詰め・近ければ下がる）
	//   ③ 両方満たしたら**動かない**＝吐く構えで待つ（プレイヤーが車線から出る時間ができる）
	// ∴プレイヤー側の答えは「射線（行/列）から外れる」＝G の「まっすぐ来て振り下ろす」（間合いを
	// 外す）とも W の「間合いを保って石を投げる」（列を外す＋詰める）とも別の読みになる。
	// ⚠️ 間合いは **body の端から**測る（`enemyEdgeDist`）＝2×2 の西/北だけ1セル遠くならない
	//    （0d-2.5 の罠）。車線のずれは **body の中心から**測る＝円錐の芯と一致する。
	// ⚠️ 向きは歩幅の溜め（`e.accum`）より**前**に書く（GUIDE §1-2）＝鈍足でも即座に向き直る。
	//    A は「揃ったら1歩も動かない」相を持つ∴溜めの後に書くと向きが完全に凍る。
	function enemyLaneStalk(e, meta, speed, cfg) {
		const player = getPlayer();
		const lockTol = cfg.lockTol ?? 0.6;
		const holdMin = cfg.holdMin ?? 1.6;
		const holdMax = cfg.holdMax ?? 3.0;
		const { cx, cy } = enemyCellCenter(e);
		const dx = player.x - cx, dy = player.y - cy;
		// 車線＝ずれの小さい軸を選ぶ。行を揃える（alignRow）＝左右へ吐く／列＝上下へ吐く。
		const alignRow = Math.abs(dy) <= Math.abs(dx);
		const off = alignRow ? dy : dx;                  // 車線からの直交ずれ（符号つき）
		e.dir = alignRow ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');

		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;

		const step  = MOVE_STEP;
		const reach = enemyEdgeDist(e, player.x, player.y);
		const sOff   = Math.sign(off) || 1;
		const sAlong = alignRow ? (Math.sign(dx) || 1) : (Math.sign(dy) || 1);
		const candidates = [];
		if (Math.abs(off) > lockTol) {
			// ① 車線を取る＝直交方向だけへ歩く。塞がれていたら車線方向へ回り込む
			//    （壁際で永久に横歩きし続けて何もしない案山子にならない）
			if (alignRow) candidates.push([sOff * step, 0], [0, sAlong * step]);
			else          candidates.push([0, sOff * step], [sAlong * step, 0]);
		} else if (reach > holdMax) {
			// ② 車線に乗った・遠い＝間合いまで詰める（届かない位置で吐き続けない）
			if (alignRow) candidates.push([0, sAlong * step], [sOff * step, 0]);
			else          candidates.push([sAlong * step, 0], [0, sOff * step]);
		} else if (reach < holdMin) {
			// ③ 近すぎる＝車線を保ったまま下がる（＝プレイヤーの剣の射程で棒立ちしない）
			if (alignRow) candidates.push([0, -sAlong * step], [sOff * step, 0]);
			else          candidates.push([-sAlong * step, 0], [0, sOff * step]);
		}
		// ④ 揃って間合いも合った＝候補ゼロ＝その場で構える
		for (const [my, mx] of candidates) {
			if (isPassableForEnemy(e.y + my, e.x + mx, e)) { e.y += my; e.x += mx; break; }
		}
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// ── Phase 8-4 (4) 0d-3（3体目 N 砂嵐の蠍王）: 潜行待ち伏せの移動 ──────────────
	// meta.burrowAmbush = { ambushDist } ＋ meta.hide = { …, style:'burrow' } の組。
	//   潜行中（e.hidden=true）… **歩くのはここだけ**。潜った瞬間に待ち伏せ地点
	//     （`pickAmbushCell`＝プレイヤーの**向こう側**）を1回決め、砂の下を貪欲に向かう。
	//     着いたら `_hideUntil` を今にして**すぐ浮上させる**（hiddenMs を待たない）。
	//   出現中（e.hidden=false）… **1歩も動かない**。向きだけプレイヤーへ合わせて
	//     鉗肢（sword）と毒針（stone）で戦う＝攻撃は enemyAttack に任せる。
	// ∴移動と交戦が時間で完全に分離する＝G（常に歩いて殴る）・W（間合いを往復）・
	//   A（車線を取って止まる）と別の近づき方。プレイヤー側の答えは「浮上を殴る／砂煙を見て
	//   出現地点から離れる」＝間合いの読みではなく**位置の読み**になる。
	// ⚠️ 待ち伏せ地点は潜った時に1回だけ決めて**追尾しない**＝プレイヤーが動き続ければ
	//    空振りする（それが対処法）。追尾すると「無敵のまま張り付く」になる。
	// ⚠️ 塞がれて着けないまま hiddenMs が切れたら tickHide が途中で浮上させる＝
	//    無敵の窓は必ず hiddenMs で終わる（回り込めなくても無敵は伸びない）。
	//    出現先が1つも作れないときは**その tick で浮上させる**＝「行き先が無いから
	//    潜ったまま」＝無償の無敵を作らない（角に追い詰めたプレイヤーが損をしない）。
	// ⚠️ 速度（meta.speed）は**潜行中だけの速度**として読む（地上では歩かない）＝
	//    hiddenMs のあいだに回り込める値が必要。プレイヤー（1.0）より遅くする（GUIDE §7-2）。
	function pickAmbushCell(e, cfg) {
		const player = getPlayer();
		if (!player) return null;
		const d = Math.max(1, Math.round(cfg.ambushDist ?? 1));
		const pr = toTileRow(player.y), pc = toTileCol(player.x);
		const { cx, cy } = enemyCellCenter(e);
		const dx = player.x - cx, dy = player.y - cy;
		// 主軸＝ずれの大きい軸。その**先**（プレイヤーを通り越した側）が本命の待ち伏せ地点。
		const alongRow = Math.abs(dx) >= Math.abs(dy);
		const sMain = alongRow ? (Math.sign(dx) || 1) : (Math.sign(dy) || 1);
		const sPerp = alongRow ? (Math.sign(dy) || 1) : (Math.sign(dx) || 1);
		// ①向こう側 → ②③直交の両脇 → ④手前（＝来た側）。④まで落ちても必ずどこかに出る
		//   ＝閉所で「出られないから無敵のまま」を作らない（tickBlink と同じ趣旨）。
		const dirs = alongRow
			? [[0, sMain], [sPerp, 0], [-sPerp, 0], [0, -sMain]]
			: [[sMain, 0], [0, sPerp], [0, -sPerp], [-sMain, 0]];
		// 0d-2.5 (3) と同じ左上補正＝北/西に出るときは体の幅ぶん下げる（2×2 で
		// 出る方向によって間合いが 1 セル変わらないようにする）。
		const backW = (e.w ?? 1) - 1, backH = (e.h ?? 1) - 1;
		// 距離は d → d+1 の順に試す＝隣接の輪が全滅しても1つ外の輪で必ず**位置が変わる**。
		// ⚠️ 外の輪が要る実例（実測 2026-08-26）：プレイヤーを角 (7,1) に追い詰めると
		//    ①向こう側＝盤外・②直交＝看板タイル・③直交＝下壁・④手前＝**今立っている場所**
		//    で d=1 が全滅した。1つ外の輪なら手前へ1マス退いて出られる。
		for (const dist of [d, d + 1]) {
			for (const [dr, dc] of dirs) {
				const ny = pr + dr * dist + (dr < 0 ? -backH : 0);
				const nx = pc + dc * dist + (dc < 0 ? -backW : 0);
				// **今立っている場所は選ばない**＝潜るたびに必ず位置が変わる（実測 2026-08-26：
				// プレイヤーが動かないと同じセルが選ばれ、着いている＝即浮上で「1 tick だけ
				// 潜る」ちらつきになった）。行き先が本当に無ければ null＝呼び出し側が即浮上させる。
				if (Math.abs(ny - e.y) < 0.01 && Math.abs(nx - e.x) < 0.01) continue;
				if (isPassableForEnemy(ny, nx, e)) return [ny, nx];
			}
		}
		return null;
	}

	// 待ち伏せ地点までの経路を4近傍の BFS で引く（セル単位・戻り値は経過セルの配列）。
	// ⚠️ **貪欲な1歩選択では届かない**（実測 2026-08-26）＝待ち伏せ地点は「プレイヤーの
	//    向こう側」∴直線の途中にプレイヤー自身が立っており、`isPassableForEnemy` は
	//    重なりを拒む（ユーザー確定「重なりはどの位置であろうと絶対に発生させない」）。
	//    2×2 の体はプレイヤーの行を跨げない＝迂回に2セル必要∴1歩先だけ見る貪欲では
	//    「0.5 進んで戻る」の振動になり、潜行の窓を丸ごと使って**回り込めなかった**。
	// ⚠️ プレイヤーは動く∴経路は「引いた瞬間の障害物」しか知らない。塞がれた tick に
	//    引き直す（`_ambushPath = null`）＝追尾はしないが道は直す。
	const BURROW_DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
	function planBurrowPath(e, dest) {
		const start = [Math.round(e.y), Math.round(e.x)];
		if (start[0] === dest[0] && start[1] === dest[1]) return [];
		const key = (r, c) => `${r},${c}`;
		const prev = new Map([[key(start[0], start[1]), null]]);
		const queue = [start];
		for (let head = 0; head < queue.length; head++) {
			const [r, c] = queue[head];
			for (const [dr, dc] of BURROW_DIRS) {
				const nr = r + dr, nc = c + dc, k = key(nr, nc);
				if (prev.has(k)) continue;
				if (!isPassableForEnemy(nr, nc, e)) continue;
				prev.set(k, [r, c]);
				if (nr === dest[0] && nc === dest[1]) {
					const path = [];
					for (let cur = [nr, nc]; cur; cur = prev.get(key(cur[0], cur[1]))) path.push(cur);
					path.pop();                       // 先頭（現在地）は経路に含めない
					return path.reverse();
				}
				queue.push([nr, nc]);
			}
		}
		return null;                                  // 到達不能
	}

	function enemyBurrowAmbush(e, meta, speed, cfg) {
		const player = getPlayer();
		// ── 地上＝動かない（向きだけ合わせる）────────────────────────
		if (!e.hidden) {
			e._ambushTo = null;
			e._ambushPath = null;
			e.accum = 0;                 // 次の潜行が「溜まった状態」で始まらないようにする
			if (player) {
				const { cx, cy } = enemyCellCenter(e);
				const dx = player.x - cx, dy = player.y - cy;
				e.dir = Math.abs(dx) >= Math.abs(dy)
					? (dx > 0 ? 'right' : 'left')
					: (dy > 0 ? 'down' : 'up');
			}
			return;
		}
		// ── 潜行中＝待ち伏せ地点へ回り込む ──────────────────────────
		if (!e._ambushTo) {
			e._ambushTo = pickAmbushCell(e, cfg);
			e._ambushPath = null;
		}
		const dest = e._ambushTo;
		// 到着判定（と行き先なしの判定）は**歩幅の溜めより前**に置く＝着いた tick に必ず
		// 浮上へ入る（溜めの後だと「着いているのに溜まるまで浮上しない」遅れが出る）。
		const arrived = dest && Math.abs(dest[0] - e.y) < 0.01 && Math.abs(dest[1] - e.x) < 0.01;
		if (!dest || arrived) {
			e._hideUntil = gameNow();    // 次の tick で tickHide が浮上させる
			return;                      // 浮上の持ち主は tickHide のまま＝無敵窓の出入口は1か所
		}
		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;
		const step = MOVE_STEP;
		// 経路の先頭のセルへ MOVE_STEP ずつ寄る。塞がれていたら**同じ tick で1回だけ**
		// 引き直して試す（プレイヤーが道に入った直後に1歩ぶん止まらない）。
		for (let attempt = 0; attempt < 2; attempt++) {
			if (!e._ambushPath?.length) e._ambushPath = planBurrowPath(e, dest);
			if (!e._ambushPath?.length) return;       // 到達不能＝その場で待つ（hiddenMs で浮上）
			const [wr, wc] = e._ambushPath[0];
			const my = Math.sign(wr - e.y) * Math.min(step, Math.abs(wr - e.y));
			const mx = Math.sign(wc - e.x) * Math.min(step, Math.abs(wc - e.x));
			if (!isPassableForEnemy(e.y + my, e.x + mx, e)) { e._ambushPath = null; continue; }
			e.y += my; e.x += mx;
			if (Math.abs(wr - e.y) < 0.01 && Math.abs(wc - e.x) < 0.01) e._ambushPath.shift();
			break;
		}
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// ── Phase 8-4 (4) 0d-3（4体目 J 深海の海蛇）: 巻きつき（coil）の移動 ─────────────
	// meta.coil = { radius, radiusMin, shrinkPerSec, escapeMargin, tightenCues,
	//               crushWindupMs, crushMs, crushPad, crushAtk, crushFreezeMs, stallLimit }。
	//   ① **プレイヤーへ寄らない**＝見つけた地点（`_coilCx/_coilCy`＝タイル中心）を輪の中心に
	//      決め、その周りを**接線方向**に泳ぐ（角度 `_coilAng` を1歩ぶんずつ進める）。
	//   ② 半径は**時間に比例して連続に縮む**（`shrinkPerSec` ＝1秒で縮むセル数・縮めるのは
	//      `tickCoilShrink`）。`radiusMin` に届いたら**締め上げ**（`startCoilCrush`）へ移る。
	//   ③ プレイヤーが輪の外（半径＋`escapeMargin`）へ出たら中心を捨てて**巻き直す**
	//      ＝これがプレイヤー側の答え（＝「間合い」ではなく「輪の内か外か」の読み）。
	// ∴速度が速くても理不尽にならない（接線方向にしか動かない＝走れば必ず外に出られる）。
	//
	// ⚠️ 縮み方は**段（半周ごとに1.0 セル）ではなく連続**（2026-08-29 ユーザー判定で変更＝
	//    「輪は段階的に小さくするんじゃなくて、ゆっくりでも常に小さくなっていく感じにしないと
	//    …初見のときに何が起こるのかがわからなさすぎる」）。段だと**縮んだ瞬間しか情報が出ない**
	//    ＝残りの時間が読めない∴毎 tick わずかに縮めて「詰まってきている」を絵で連続的に出す。
	// ⚠️ 縮みは**泳いだ弧ではなく時計**で進める（`tickCoilShrink` を硬直より前で毎 tick 呼ぶ）。
	//    弧に比例させた最初の実装では、攻撃硬直（水弾・噛みつき）の 8 tick ≈ 1秒と歩幅の溜め
	//    （速度 0.7 ＝3 tick に1歩は止まる）のあいだ輪が**止まって見えた**＝「常に小さくなって
	//    いく」にならない（2026-08-29 実測）。∴止めるのは**壁で回れないときだけ**にした。
	// ⚠️ 縮み具合は `_coilHeat`（0〜1＝`radius`→`radiusMin`）に正規化して持つ＝輪の色（青→赤）と
	//    締まりの合図の音（`tightenCues`）が**同じ1つの数**を読む＝絵と音と判定がずれない。
	//
	// ⚠️ 角度は**歩けた tick だけ**進める（`_coilArc` も同じ）＝壁で止まっているあいだに
	//    泳いだ扱いにしない（`_coilStall` が立つ＝縮みも止まる）。
	// ⚠️ 歩けなかったら**回る向きを反転する**（巻き直しではない）＝壁際・角に居るプレイヤーを
	//    囲めない側は往復で掃く∴「回れないから何もしない案山子」にならない（W の strafe が
	//    射程外を7秒周回して案山子になった失敗の対処と同じ理由）。それでも `stallLimit` 回
	//    続けて動けなければ中心を捨てる（最後の保険）。
	// ⚠️ 中心はタイル中心へ丸める（`toTileRow/Col`）＝輪の絵と潰す範囲をセル格子に載せる。
	//    プレイヤーの座標は MOVE_STEP 0.5 刻み∴丸めないと輪が半セルずれて読めない。
	// ⚠️ 半径は**体の中心から**測る（`enemyCellCenter`）＝2×2 の端は 1 セル内側にある
	//    （0d-2.5 の罠）∴「剣が届く半径」は radius − 1 で読む。
	// 「もう来る」に切り替わる締まり具合（＝輪が赤く点滅し始める）。予告（720ms）だけでは
	// 初見で身構えられない∴予告より前に**赤い1段**を挟む（GUIDE §6-1＝機構は伝わってこそ）。
	const COIL_HOT_AT = 0.62;

	// 縮み具合を 0〜1 に正規化する（0＝巻き始めの半径・1＝これ以上縮まない＝締め上げ直前）。
	// **輪の色（`--coil-heat`）・締まりの音（tightenCues）・テストがすべてこの1つの数を読む。**
	function coilHeat(e, cfg) {
		const r0 = cfg?.radius ?? 2.6, rMin = cfg?.radiusMin ?? 1.6;
		if (e._coilR == null || !(r0 > rMin)) return 0;
		return Math.max(0, Math.min(1, (r0 - e._coilR) / (r0 - rMin)));
	}

	function claimCoil(e, cfg) {
		const player = getPlayer();
		if (!player) return;
		e._coilCx = toTileCol(player.x);
		e._coilCy = toTileRow(player.y);
		e._coilR  = cfg.radius ?? 2.6;
		e._coilArc = 0;
		e._coilStall = 0;
		e._coilHeat = 0;
		e._coilCue = 0;      // 締まりの合図を何段まで鳴らしたか（巻き直すと 0 に戻る）
		// 回る向きは **id から決定的に**（GUIDE §7-3＝乱数を入れない・テストが安定する）
		if (e._coilSpin == null) e._coilSpin = (e.id % 2 === 0) ? 1 : -1;
		const { cx, cy } = enemyCellCenter(e);
		const dx = cx - e._coilCx, dy = cy - e._coilCy;
		// 今居る方角から巻き始める＝中心を決めた瞬間に体が輪の反対側へ跳ばない
		e._coilAng = (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) ? 0 : Math.atan2(dy, dx);
	}

	// 輪を**毎 tick** 縮める（硬直より前に呼ぶ＝攻撃で輪が止まって見えない）。
	// ここが持つのは「時計」だけ＝泳ぎ（角度）は `enemyCoil` の担当。
	// ⚠️ 壁で回れないあいだ（`_coilStall > 0`）は縮めない＝泳げていないのに締め上げが来る、
	//    という理不尽を作らない（弧に比例していた旧実装から引き継ぐ唯一の条件）。
	// ⚠️ 予告が立ったら触らない（`_crushR` は予告の瞬間に固定＝プレイヤーが範囲を読める）。
	function tickCoilShrink(e, meta, now) {
		const cfg = resolveCoil(e, meta);
		if (!cfg || e._coilCx == null || e._crushAt != null) return;
		const player = getPlayer();
		if (!player) return;
		// ③ 輪の外へ出られた＝巻き直す（半径も初期値に戻る＝逃げた分だけ猶予が戻る）。
		// 硬直中も判定する＝「輪から出る」という答えがいつでも通る。
		if (Math.hypot(player.x - e._coilCx, player.y - e._coilCy) > e._coilR + (cfg.escapeMargin ?? 1.0)) {
			claimCoil(e, cfg);
			return;
		}
		if ((e._coilStall ?? 0) > 0) return;
		const rMin = cfg.radiusMin ?? 1.6;
		const next = e._coilR - (cfg.shrinkPerSec ?? 0.3) * (TICK_MS / 1000);
		if (next <= rMin) {
			e._coilR = rMin;                      // 縮み切った位置で止めてから予告に入る
			e._coilHeat = 1;
			startCoilCrush(e, cfg, now);
			return;
		}
		e._coilR = next;
		// ── 締まってきたことを音でも段階的に出す（絵の赤さと同じ `heat` を読む）─────
		// ⚠️ 予告（coilWindup）の前に鳴る**別の音**＝「まだ縮んでいる（出る準備をしろ）」。
		//    予告 720ms だけでは初見で「何が起きるのか」が読めない（2026-08-29 ユーザー判定）
		//    ∴輪が赤くなるのと同じ拍で軋みを鳴らす＝画面を見ていなくても近づきが分かる。
		const heat = coilHeat(e, cfg);
		e._coilHeat = heat;
		const cues = cfg.tightenCues ?? [];
		while ((e._coilCue ?? 0) < cues.length && heat >= cues[e._coilCue ?? 0]) {
			e._coilCue = (e._coilCue ?? 0) + 1;
			playSound('coilTighten');
		}
	}

	function enemyCoil(e, meta, speed, cfg) {
		const player = getPlayer();
		if (!player) return;
		// 中心が無い＝巻き始め（縮みと逃げの判定は `tickCoilShrink` が持つ＝ここでは巻くだけ）
		if (e._coilCx == null) claimCoil(e, cfg);

		const { cx, cy } = enemyCellCenter(e);
		// 向きはプレイヤーへ向ける（絵の向きは移動方向ではない＝「見ながら回る」）。
		// ⚠️ 歩幅の溜め（`e.accum`）より**前**に書く（GUIDE §1-2）＝1歩に2 tick かかる速度でも
		//    向き直りが遅れない。J は今は向き別の実データを持たない（エイリアス）が、
		//    実装したときにこの1行がそのまま効く。
		const pdx = player.x - cx, pdy = player.y - cy;
		e.dir = Math.abs(pdx) >= Math.abs(pdy) ? (pdx > 0 ? 'right' : 'left') : (pdy > 0 ? 'down' : 'up');

		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;

		const step = MOVE_STEP;
		const R = e._coilR;
		// 1歩（MOVE_STEP）で進む角度＝弧長 / 半径。速度は `e.accum` が既に効かせている∴
		// ここに掛けない（掛けると速い敵ほど輪から離れた点を追って半径が崩れる）。
		const omega = step / Math.max(0.5, R);
		const nextAng = e._coilAng + e._coilSpin * omega;
		const tx = e._coilCx + Math.cos(nextAng) * R;
		const ty = e._coilCy + Math.sin(nextAng) * R;
		const ddx = tx - cx, ddy = ty - cy;
		const sx = Math.sign(ddx), sy = Math.sign(ddy);
		const candidates = [];
		if (Math.abs(ddx) >= Math.abs(ddy)) {
			if (sx) candidates.push([0, sx * step]);
			if (sy) candidates.push([sy * step, 0]);
		} else {
			if (sy) candidates.push([sy * step, 0]);
			if (sx) candidates.push([0, sx * step]);
		}
		let moved = candidates.length === 0;   // 目標に乗っている＝停滞ではない
		for (const [my, mx] of candidates) {
			if (isPassableForEnemy(e.y + my, e.x + mx, e)) { e.y += my; e.x += mx; moved = true; break; }
		}
		moveCharEl(`enemy-${e.id}`, e.x, e.y);

		if (!moved) {
			// 回れない側（壁・盤外）＝向きを反転して掃き直す。続いたら中心を捨てる。
			e._coilSpin = -e._coilSpin;
			e._coilStall = (e._coilStall ?? 0) + 1;
			if (e._coilStall >= (cfg.stallLimit ?? 4)) claimCoil(e, cfg);
			return;
		}
		e._coilStall = 0;
		e._coilAng = nextAng;
		e._coilArc += omega;
	}

	// 締め上げの予告開始。剣（startSwing）・ブレス（startBreath）と同じ「予告→解決」の2拍。
	// 閉じる半径は**予告の瞬間に固定する**（`_crushR`）＝解決までに縮まない＝
	// プレイヤーは輪の絵を見て「どこまでが危ないか」を予告中に判断できる。
	function startCoilCrush(e, cfg, now) {
		e._crushWindupMs = cfg.crushWindupMs ?? 720;
		e._crushAt = now + e._crushWindupMs;
		e._crushR  = e._coilR;
		// 予告は絵（輪が縮む `.coil-ring-closing`）と音の2経路で出す（GUIDE §7-6）。
		// 締め上げの音（coilCrush）とは別の音＝「来る（輪から出ろ）」と「潰れた（殴れる）」。
		playSound('coilWindup');
	}

	// 締め上げの解決。戻り値 true ＝この tick は締め上げが専有した（移動も攻撃もしない）。
	function tickCoilCrush(e, meta, now) {
		if (e._crushAt == null) return false;
		if (now < e._crushAt) return true;              // まだ溜め中
		const cfg = resolveCoil(e, meta) ?? {};
		e._crushAt = null;
		crushCoil(e, meta, cfg);
		// ⚠️ `markAttack` を通さない＝締め上げは `attacks[]` の1エントリではなく
		//    **巻きつきの周期そのものの帰結**（`shell` の炎と同じ扱い）∴クールダウンの
		//    起点を持たない（次の締め上げは次の周が閉じたときにだけ来る）。
		//    硬直（＝反撃の窓）はここで直接立てる（術士の詠唱 `_freezeUntil` と同型）。
		e._freezeUntil = now + (cfg.crushFreezeMs ?? MELEE_FREEZE_MS);
		// 巻き直す（次の周は新しい中心から）。⚠️ **両方 null にする**＝片方だけ消すと
		// スナップショットに `{coilCx: null, coilCy: 4}` の半端な形が出て「輪が無い」の
		// 判定（`coilCx == null`）とテストの読み方が食い違う（実測 2026-08-29）。
		e._coilCx = null; e._coilCy = null;
		return true;
	}

	// 輪の内側を潰す。**盾では防げない**（体当たり・ブレスと同じ扱い＝k-7.5 決定④の系）
	// ＝答えは「輪の外に出る」だけ。ダメージは何セル重なっても1回。
	function crushCoil(e, meta, cfg) {
		const player = getPlayer();
		const r = (e._crushR ?? cfg.radiusMin ?? 1.6) + (cfg.crushPad ?? 0.4);
		const dmg = cfg.crushAtk ?? e.atk ?? meta.atk ?? 1;
		const ccx = e._coilCx, ccy = e._coilCy;
		if (ccx == null) return;
		const span = Math.ceil(r) + 1;
		for (let dy = -span; dy <= span; dy++) {
			for (let dx = -span; dx <= span; dx++) {
				// ⚠️ 塗るのは「セルの**一番近い点**が円の中」＝当たり判定（下の連続距離）の
				//    **上位集合**にする。セル中心で判定すると隠れダメージが出る＝実測の反例
				//    （2026-08-29）：中心から (dx,dy)=(1.5,1.0) に立つと距離 1.80 ≤ 2.0 で
				//    潰されるのに、丸めたセル (2,1) は中心距離 2.24 > 2.0 で**塗られない**
				//    ＝「何も描かれていない床で殴られた」になる。半セルぶん過剰に警告する方
				//    （塗られたのに無傷）を選ぶ＝GUIDE §6-1「機構はプレイヤーに伝わってこそ」。
				const near = Math.hypot(Math.max(0, Math.abs(dx) - 0.5), Math.max(0, Math.abs(dy) - 0.5));
				if (near > r) continue;
				const fx = ccx + dx, fy = ccy + dy;
				if (!tilePassable(toTileRow(fy), toTileCol(fx))) continue;   // 壁の中は描かない
				showCoilCrushEffect(fx, fy, cfg.crushMs ?? 420);
			}
		}
		// 当たり判定は**中心からの距離**（セル単位の重なりではない）＝輪の絵と同じ形で測る
		if (Math.hypot(player.x - ccx, player.y - ccy) <= r) takeDamage(dmg);
		playSound('coilCrush');
	}

	// 潰れた水の見た目（`.enemy-fire-breath` と同型＝セル1枚の DOM を置いて実時間で消す）。
	function showCoilCrushEffect(fx, fy, durMs) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = 'enemy-coil-crush';
		el.style.cssText = `position:absolute;left:${fx * cellPx}px;top:${fy * cellPx}px;`
			+ `width:${cellPx}px;height:${cellPx}px;z-index:24;pointer-events:none;`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), durMs);
	}

	// ── 輪そのものを床に描く（巻きつきの唯一の告知）─────────────────────────
	// ⚠️ **中心はプレイヤーの居た地点＝敵の体の上には出ない**∴予告を敵の絵に載せる
	//    （`.slam-windup` などの型）だけでは「どこが輪の内側か」が読めない＝機構が
	//    プレイヤーに伝わらない（GUIDE §6-1）。∴輪を床に描くのが本体の告知。
	// ⚠️ 後始末＝`char-enemy-<id>` とは別の DOM ∴J が倒れても残る。実時間の消去タイマを
	//    毎 tick 貼り直す（＝tick が来なくなれば自然に消える）＝炎の見た目と同じ作法で
	//    「巻きつきが終わった／敵が消えた」を待たずに片付く。
	const coilRingTimers = new Map();
	function syncCoilRing(e, meta) {
		const cfg = resolveCoil(e, meta);
		const id = `coil-ring-${e.id}`;
		let el = document.getElementById(id);
		if (!cfg || e._coilCx == null) { if (el) el.remove(); return; }
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		if (!el) {
			el = document.createElement('div');
			el.id = id;
			charLayerEl.appendChild(el);
		}
		const closing = e._crushAt != null;
		const r = closing ? (e._crushR ?? e._coilR) : e._coilR;
		const d = (r * 2 + 1) * cellPx;                       // 直径＝半径2つ＋自セル1枚
		const left = (e._coilCx + 0.5) * cellPx - d / 2;
		const top  = (e._coilCy + 0.5) * cellPx - d / 2;
		// ⚠️ 締まり具合（0〜1）を CSS へ渡して**色を青→赤へ連続に振る**（2026-08-29 ユーザー判定
		//    ＝「小さくなるにつれて輪の色が赤くなるとか、攻撃がきそうな感じにしないとなんだか
		//    わからない」）。数（heat）はエンジンが持ち、色の作り方は CSS が持つ＝閾値を2箇所に
		//    書かない（`coil-ring-hot` の付与だけがこちら側の判断＝「もう来る」の1段）。
		const heat = closing ? 1 : coilHeat(e, cfg);
		el.className = 'enemy-coil-ring'
			+ (heat >= COIL_HOT_AT ? ' coil-ring-hot' : '')
			+ (closing ? ' coil-ring-closing' : '');
		el.style.cssText = `position:absolute;left:${left}px;top:${top}px;`
			+ `width:${d}px;height:${d}px;z-index:2;pointer-events:none;`
			// 長さは状態機械が持つ（CSS 側に持たせない＝swing/breath と同じ作法）
			+ `--coil-windup-ms:${Math.round(e._crushWindupMs ?? 0)}ms;`
			+ `--coil-heat:${heat.toFixed(3)};`
			// 色相を振るのはこちら＝heat を「もう来る」の閾値で 1 に正規化した数。
			// ⚠️ 閾値（COIL_HOT_AT）を CSS 側へ書かないためにここで割る＝赤の到達と
			//    赤い点滅の開始が**必ず同じ tick**になる（別々に調整できてしまう余地を残さない）。
			+ `--coil-warn:${Math.min(1, heat / COIL_HOT_AT).toFixed(3)};`;
		clearTimeout(coilRingTimers.get(id));
		coilRingTimers.set(id, setTimeout(() => el.remove(), 400));
	}

	// ── Phase 8-4 (4) 0d-3（5体目 O 古森の巨人）: 見据え（gaze）─────────────────
	// meta.gaze = { stampMs, restMs, throwFreezeMs, rockSpeed, stampRadius, stampAtk, arcHeight }。
	//   ① **今のプレイヤーを狙わない**＝印（`_gazeCx/_gazeCy`）を「見据えた瞬間に立っていた
	//      タイル」へ1つだけ押す（`claimGaze`）。押した印は**追尾しない**（動かない）。
	//   ② `stampMs` 経ったら印へ向けて岩を**放物線で**投げる（`lob`＝遮蔽も盾も効かない）。
	//      落ちるのは印の上だけ＝`stampRadius` の内側にいた者だけが潰される。
	//   ③ 投げた直後は硬直（`throwFreezeMs`）＝**殴り返す窓**。着弾から `restMs` 空けて次の印。
	//   ④ そのあいだ巨人は**印へ向かって歩く**（プレイヤーではなく印を追う＝BFS）。
	// ∴プレイヤー側の答えは「間合い」でも「輪の内外」でもなく **「印から離れる」**。
	//
	// 他のボスの機構と重ならないことの根拠（0d-3 の要件＝1体ずつ近づき方を変える）：
	//   G＝真っすぐ寄る／W＝間合いを取り直す／A＝車線に入って寄る／N＝潜っている間だけ歩く／
	//   J＝寄らずに周を泳ぐ／**O＝寄る先がプレイヤーではない（1拍前の足跡）**。
	// ⚠️ 印は必ず「1つの印 ⇔ 1つの岩」（`_gazePhase` の 'mark'→'flight'→'rest' の1周）。
	//    印と岩を別々の時計で回すと「印が2つ出て岩が1つ落ちる」が起き得る＝告知が嘘になる。
	// ⚠️ 予告の長さは**押した瞬間に固定する**（`_gazeSpan`）／潰す半径も**押した瞬間に固定**
	//    （`_gazeR`）。∴走っている1周の途中でフェーズが変わっても「絵で見た印」と「落ちる岩の
	//    範囲」がずれない（＝boss.js 側は `_gaze` を書くだけでよい＝coil の `_crushR` と同じ作法）。
	// ⚠️ 時計（`tickGaze`）は**行動ゲートの外**で回す（`tickCoilShrink` と同じ枠）＝投げた直後の
	//    硬直と歩幅の溜めのあいだ印が止まって見えない（GUIDE §7-7）。
	// ⚠️ 印の濃さは `_gazeHeat`（0〜1）に正規化して持つ＝床の絵と音とテストが**同じ1つの数**を読む。

	// 「もう落ちる」に切り替わる濃さ（＝印が赤く点滅し始める）。coil の COIL_HOT_AT と同じ趣旨＝
	// 予告の終わり際に**別の1段**を挟まないと初見で身構えられない（GUIDE §6-1）。
	const GAZE_HOT_AT = 0.66;

	// 印の進み具合を 0〜1 に正規化する（0＝押した瞬間・1＝岩が離れる瞬間）。
	// 飛翔中（'flight'）と着弾待ち（'rest'）は 1 のまま＝「もう落ちる」を下げない。
	function gazeHeat(e, now) {
		if (e._gazePhase == null) return 0;
		if (e._gazePhase !== 'mark') return 1;
		const span = e._gazeSpan ?? 0;
		if (!(span > 0)) return 1;
		return Math.max(0, Math.min(1, 1 - (e._gazeAt - now) / span));
	}

	// 印を押す（＝この機構の唯一の起点）。押す先は**プレイヤーの今のタイル**。
	// ⚠️ タイル中心へ丸める（`toTileRow/Col`）＝プレイヤーは 0.5 刻みに立てる∴丸めないと
	//    印の絵と潰す範囲が半セルずれて読めない（coil の中心と同じ理由）。
	function claimGaze(e, cfg, now) {
		const player = getPlayer();
		if (!player) return;
		e._gazeCx = toTileCol(player.x);
		e._gazeCy = toTileRow(player.y);
		e._gazePhase = 'mark';
		e._gazeSpan = cfg.stampMs ?? 1080;
		e._gazeAt = now + e._gazeSpan;
		e._gazeR = cfg.stampRadius ?? 1.2;
		e._gazeHeat = 0;
		e._gazePath = null;
		// 予告は絵（床の印）と音の2経路で出す（GUIDE §7-6）。岩が砕ける音（rockSmash）とは
		// 別の音＝「見据えられた（そこから離れろ）」と「落ちた（殴り返せる）」。
		playSound('gazeMark');
	}

	// 岩を放る。着弾点は**印**＝プレイヤーが動いても追わない（`lob` の性質そのもの）。
	function throwGazeRock(e, meta, cfg, now) {
		const { cx, cy } = enemyCellCenter(e);
		const tx = e._gazeCx, ty = e._gazeCy;
		const d = Math.hypot(tx - cx, ty - cy) || 1;
		const ndx = (tx - cx) / d, ndy = (ty - cy) / d;
		const speed = cfg.rockSpeed ?? 1.2;
		fireEnemyProjectile(e, 'stone', ndx, ndy, speed, {
			lob: true,
			targetX: tx, targetY: ty,
			arcHeight: cfg.arcHeight ?? 1.6,
			blast: {
				// 潰す範囲は**押した瞬間に固定した半径**（＝床に描いてある印そのもの）。
				radius: e._gazeR ?? cfg.stampRadius ?? 1.2,
				damage: cfg.stampAtk ?? e.atk ?? meta.atk ?? 1,
				// ⚠️ `!`（壊せる壁）は壊さない＝岩投げでボス部屋の地形が変わると、
				//    プレイヤーが学んだ「爆弾で壊せる壁」の意味が濁る（爆弾鬼との差はここ）。
				breakPower: 0,
				sound: 'rockSmash', effect: 'rock',
			},
		});
		// 着弾までの時間は**投擲物の進み方から逆算する**（`projectileTick` は毎 tick
		// `speed × MOVE_STEP` だけ進む）＝印の絵を消す拍と岩が落ちる拍が一致する。
		// ⚠️ `(dist / speed) * TICK_MS` ではない（MOVE_STEP を落とすと倍の見積りになる）。
		const sx = e.x + ndx * 0.8, sy = e.y + ndy * 0.8;   // fireEnemyProjectile と同じ発射点
		const total = Math.max(0.001, Math.hypot(tx - sx, ty - sy));
		const ticks = Math.max(1, Math.ceil(total / (speed * MOVE_STEP)));
		// ⚠️ 岩は**投げた tick のうちに1回進む**（`game.js gameTick` は enemyTick → projectileTick の
		//    順）∴印の絵を消す拍は「残りの tick 数」＝`ceil(…) − 1`。ここを `ceil(…)` のままに
		//    すると岩が砕けた後も印が 1 tick（120ms）残る＝「落ちたのにまだ狙われている」に見える
		//    （＝余韻 `restMs`＝殴り返す窓の始まりも1拍ずれる）。
		e._gazePhase = 'flight';
		e._gazeSpan = Math.max(0, ticks - 1) * TICK_MS;
		e._gazeAt = now + e._gazeSpan;
		e._gazeHeat = 1;
		e._gazeCount = (e._gazeCount ?? 0) + 1;
		// 硬直（＝反撃の窓）はここで直接立てる（締め上げ・詠唱と同型＝`markAttack` は通さない。
		// 岩投げは `attacks[]` の1エントリではなく**見据えの周期そのものの帰結**）。
		e._freezeUntil = now + (cfg.throwFreezeMs ?? MELEE_FREEZE_MS);
	}

	// 見据えの時計（**行動ゲートの外**で毎 tick 呼ぶ）。ここが持つのは周期だけ＝
	// 歩き（`enemyGazeStride`）と絵（`syncGazeMark`）は別の持ち主。
	function tickGaze(e, meta, now) {
		const cfg = resolveGaze(e, meta);
		if (!cfg) return;
		if (e._gazePhase == null) { claimGaze(e, cfg, now); return; }
		e._gazeHeat = gazeHeat(e, now);
		if (now < e._gazeAt) return;
		if (e._gazePhase === 'mark') {
			throwGazeRock(e, meta, cfg, now);
		} else if (e._gazePhase === 'flight') {
			// 着弾＝印は消える（ダメージは投擲物側の爆風が出す＝判定の持ち主は1か所）。
			// 座標は残す＝巨人は「最後に見据えた場所」へ歩き続ける（次の印までの間も止まらない）。
			e._gazePhase = 'rest';
			e._gazeSpan = cfg.restMs ?? 480;
			e._gazeAt = now + e._gazeSpan;
		} else {
			claimGaze(e, cfg, now);
		}
	}

	// 印の候補（体をどう重ねても「印を踏む」になる置き方＋その外周）。
	// ⚠️ 2×2 の座標は**左上**∴印のタイルに左上を置くと体は印の右下側へ 1 セルはみ出す。
	//    4通りの重ね方を先に試す＝どちら側から来ても最短で印に乗れる（0d-2.5 の左上補正と同趣旨）。
	function planGazePath(e, gy, gx) {
		const cands = [
			[gy, gx], [gy - 1, gx], [gy, gx - 1], [gy - 1, gx - 1],
			[gy + 1, gx], [gy, gx + 1], [gy - 2, gx], [gy, gx - 2],
		];
		for (const [r, c] of cands) {
			if (!isPassableForEnemy(r, c, e)) continue;
			const path = planBurrowPath(e, [r, c]);
			if (path) return path;
		}
		return null;                                  // 印に寄れない＝その場で待つ（時計は進む）
	}

	// 印へ向かって歩く（＝**プレイヤーへは寄らない**移動アルゴリズム）。
	// 経路は待ち伏せ（N）と同じ BFS を使う＝2×2 の体で壁とプレイヤーを避けて回り込める
	// （貪欲な1歩選択では往復して届かない＝2026-08-26 の実測）。
	function enemyGazeStride(e, meta, speed, cfg) {
		if (e._gazeCx == null) return;
		const { cx, cy } = enemyCellCenter(e);
		// 向きは**印**へ向ける（「見据えている先」＝機構の名前どおり）。
		// ⚠️ 歩幅の溜め（`e.accum`）より**前**に書く（GUIDE §1-2）＝1歩に2 tick かかる速度でも
		//    向き直りが遅れない。
		const dx = e._gazeCx - cx, dy = e._gazeCy - cy;
		if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
			e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
		}
		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;
		const step = MOVE_STEP;
		// 塞がれていたら**同じ tick で1回だけ**引き直して試す（N と同じ作法＝プレイヤーが
		// 道に入った直後に1歩ぶん止まらない）。
		for (let attempt = 0; attempt < 2; attempt++) {
			if (!e._gazePath?.length) e._gazePath = planGazePath(e, e._gazeCy, e._gazeCx);
			if (!e._gazePath?.length) return;
			const [wr, wc] = e._gazePath[0];
			const my = Math.sign(wr - e.y) * Math.min(step, Math.abs(wr - e.y));
			const mx = Math.sign(wc - e.x) * Math.min(step, Math.abs(wc - e.x));
			if (!isPassableForEnemy(e.y + my, e.x + mx, e)) { e._gazePath = null; continue; }
			e.y += my; e.x += mx;
			if (Math.abs(wr - e.y) < 0.01 && Math.abs(wc - e.x) < 0.01) e._gazePath.shift();
			break;
		}
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// ── 印そのものを床に描く（見据えの唯一の告知）─────────────────────────
	// ⚠️ 印は**プレイヤーが立っていた場所＝敵の体の上には出ない**∴予告を敵の絵に載せる型
	//    （`.slam-windup` など）では「どこに落ちるか」が読めない（coil の輪と同じ理由）。
	// ⚠️ 後始末＝`char-enemy-<id>` とは別の DOM ∴O が倒れても残る。実時間の消去タイマを毎 tick
	//    貼り直す（＝tick が来なくなれば自然に消える）＝輪・炎と同じ作法。
	const gazeMarkTimers = new Map();
	function syncGazeMark(e, meta) {
		const cfg = resolveGaze(e, meta);
		const id = `gaze-mark-${e.id}`;
		let el = document.getElementById(id);
		// 印を描くのは 'mark'（押してから投げるまで）と 'flight'（岩が飛んでいる間）だけ。
		const showing = cfg && e._gazeCx != null && (e._gazePhase === 'mark' || e._gazePhase === 'flight');
		if (!showing) { if (el) el.remove(); return; }
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		if (!el) {
			el = document.createElement('div');
			el.id = id;
			charLayerEl.appendChild(el);
		}
		const r = e._gazeR ?? cfg.stampRadius ?? 1.2;
		const d = (r * 2 + 1) * cellPx;                       // 直径＝半径2つ＋自セル1枚
		const left = (e._gazeCx + 0.5) * cellPx - d / 2;
		const top  = (e._gazeCy + 0.5) * cellPx - d / 2;
		const heat = e._gazeHeat ?? 0;
		el.className = 'enemy-gaze-mark'
			+ (heat >= GAZE_HOT_AT ? ' gaze-mark-hot' : '')
			+ (e._gazePhase === 'flight' ? ' gaze-mark-falling' : '');
		el.style.cssText = `position:absolute;left:${left}px;top:${top}px;`
			+ `width:${d}px;height:${d}px;z-index:2;pointer-events:none;`
			// 濃さ（0〜1）を CSS へ渡す＝色の作り方は CSS 側が持つ（閾値を2箇所に書かない）。
			+ `--gaze-heat:${heat.toFixed(3)};`
			// 今の相の長さ（＝落下中は飛翔時間そのもの）＝影が膨らむアニメの長さ。
			// 長さは状態機械が持つ（CSS 側に持たせない＝swing/breath/coil と同じ作法）。
			+ `--gaze-span-ms:${Math.round(e._gazeSpan ?? 0)}ms;`
			// 「もう落ちる」の閾値で 1 に正規化した数＝赤の到達と赤い点滅の開始が必ず同じ tick。
			+ `--gaze-warn:${Math.min(1, heat / GAZE_HOT_AT).toFixed(3)};`;
		clearTimeout(gazeMarkTimers.get(id));
		gazeMarkTimers.set(id, setTimeout(() => el.remove(), 400));
	}

	// ── Phase 8-4 (4) 0d-3（6体目 U 嵐の鷲王）: 滞空と急降下（soar）───────────────
	// meta.soar = { groundMs, riseMs, airMs, airMaxMs, orbitRange, orbitSpeed, alignTol,
	//               aimMs, diveSpeed, diveCells, diveHitRange, diveAtk, landFreezeMs,
	//               crashStunMs, centerFollow, flipLapsMin, flipLapsMax, reachedBy }
	// 6拍の状態機械。他の12体と違うのは「近づき方」ではなく **どこに居るか**：
	//   ground … 地上（`groundMs`）＝歩いて寄り鉤爪を振る＝**プレイヤーが剣を入れられる窓**
	//   rise   … 舞い上がる溜め（`riseMs`・動かない・攻撃しない・**まだ地上＝殴れる**）
	//   air    … 滞空＝`orbitRange` を保ちながら**部屋を回る旋回**（DECISIONS 2026-08-30（5）
	//             決定6・PLAN 0d-3「6体目 U の追い作業」＝旧仕様「軸へ回り込む」は直線移動を
	//             生み弓の連打を許した反省で置き換えた）。**剣/ブーメラン/爆風/炎は届かない
	//             ＝矢だけが届く**（combat.js isSoarOutOfReach）。`airMs` は**下限**（最低これ
	//             だけ回る）＝下限を過ぎてから軸（行/列）が揃った tick に `aim` へ移る。揃わない
	//             まま `airMaxMs`（保険の上限）を超えたら強制的に落ちる＝宙吊り防止。
	//   aim    … 急降下の予告（`aimMs`）＝落ちる軸をここで確定する∴**軸から外れれば避けられる**
	//   dive   … 急降下（`diveSpeed`）＝接触で `diveAtk`／地形に着けばそこで止まる
	//   land   … 着地硬直（`landFreezeMs`）＝**殴り返す窓**（`.attack-recover` の絵が出る）
	// 戻り値：true ならこの tick の通常移動/攻撃を呼び出し側がスキップする
	//         （＝`rise`/`aim`/`dive`/`land` が専有する。`ground` と `air` は**ゲートを開ける**＝
	//           歩き（`enemySoarStride`）と攻撃（`enemyAttack`）が動く）。
	//
	// ⚠️ 矢が当たると滞空が**墜落**に化ける（`crashSoar`＝combat.js の被弾フックが呼ぶ）＝
	//    弱点（矢 ×2）が倍率だけでなく**機構の解除鍵**になっている（δ 分裂スライムの
	//    `blockedBy` と同型）。D7 の看板「射抜けば」がそのまま戦い方の説明になる。
	// ⚠️ 急降下は tickDash と同じく **1 tick を MOVE_STEP に割って**進める＝速くしても当たりと
	//    壁を飛び越さない（[[blade-speed-up-needs-interpolation]]）。当たり判定も `dashReachHit`
	//    を共有する＝「落ちてくる軸の前方だけ」に当たる（十字の slam を流用すると軸から外れた
	//    避けが無効になる＝0d-2 で実測した罠）。
	// ⚠️ 相の長さは**入った瞬間に固定する**（`_soarSpan`）＝走っている1周の途中で HP が 50% を
	//    割っても、見えている予告と実際の解決がずれない（gaze の `_gazeSpan` と同じ作法）。
	// ⚠️ 間合い（`orbitRange` / `diveHitRange`）は **body の端から**・向きは**中心から**測る
	//    （0d-2.5 の左上の罠＝2×2 は左上基準だと西/北から 1 セル遠くなる）。

	// 相へ入る（長さを固定して終わりの論理時刻を立てる＝この2つが唯一の時計）。
	function enterSoarPhase(e, phase, at, span) {
		e._soarPhase = phase;
		e._soarSpan  = span;
		e._soarAt    = at + span;
	}

	const soarVecDir = ([sy, sx]) => (sx !== 0 ? (sx > 0 ? 'right' : 'left') : (sy > 0 ? 'down' : 'up'));

	// 落ちる軸。プレイヤーが行/列（直交ずれ `alignTol` 以内）に乗っているときだけ
	// カーディナル1方向を返す＝**軸から外れて立っていれば急降下は始まらない**。
	function soarDiveVec(e, player, cfg) {
		if (!player) return null;
		const { cx, cy } = enemyCellCenter(e);
		const { halfW, halfH } = enemyHalf(e);
		const dx = player.x - cx, dy = player.y - cy;
		const vertical = Math.abs(dy) >= Math.abs(dx);
		const off     = vertical ? Math.abs(dx) : Math.abs(dy);
		const halfOff = vertical ? halfW : halfH;
		if (off > (cfg.alignTol ?? 0.6) + halfOff) return null;
		return vertical ? [Math.sign(dy) || 1, 0] : [0, Math.sign(dx) || 1];
	}

	// 滞空の上限を過ぎたときの落ち先＝**成分の大きい軸**（＝軸が揃わなくても必ず落ちる＝
	// 「ずっと空を回っているだけ」で戦いが止まらない）。
	function soarAnyVec(e, player) {
		const { cx, cy } = enemyCellCenter(e);
		const dx = (player?.x ?? cx) - cx, dy = (player?.y ?? cy) - cy;
		return Math.abs(dy) >= Math.abs(dx) ? [Math.sign(dy) || 1, 0] : [0, Math.sign(dx) || 1];
	}

	// 着地＝硬直（反撃の窓）へ。硬直はここで直接立てる（`markAttack` は通さない＝急降下は
	// `attacks[]` の1エントリではなく**滞空の周期そのものの帰結**＝coil の締め上げ・gaze の
	// 岩投げと同じ作法）。
	function landSoar(e, cfg, now) {
		const freezeMs = cfg.landFreezeMs ?? MELEE_FREEZE_MS;
		enterSoarPhase(e, 'land', now, freezeMs);
		e._freezeUntil = now + freezeMs;
		e._soarVec  = null;
		e._soarLeft = 0;
		e._soarDives = (e._soarDives ?? 0) + 1;
		// 空振りでも鳴らす＝「落ちた＝今なら殴れる」が画面を見ていなくても分かる。
		// 予告（soarDive）とは別の音（GUIDE §7-6）。当たった場合はダメージ音が重なる。
		playSound('soarLand');
	}

	// 矢で射落とす＝滞空が墜落に化ける（combat.js の被弾フックが呼ぶ）。
	// 気絶（`e.stunUntil`）＝enemyTick が先頭で全行動を止める窓＝突進猪が壁に激突したときと
	// 同じ語彙（⭐の印も共有する＝「気絶」の意味を1つにする）。
	function crashSoar(e, meta, now = gameNow()) {
		const cfg = resolveSoar(e, meta);
		if (!cfg || !isSoaring(e, meta)) return false;
		const stunMs = cfg.crashStunMs ?? 1800;
		e.stunUntil = now + stunMs;
		e._soarVec  = null;
		e._soarLeft = 0;
		// 落ちた先は地上。⚠️ `ground` の時計は**気絶が明けてから**数える＝立ち上がった瞬間に
		//    また舞い上がる（＝反撃の窓が気絶ぶんしか無い）ことを防ぐ。
		enterSoarPhase(e, 'ground', e.stunUntil, cfg.groundMs ?? 1560);
		e._soarCrashes = (e._soarCrashes ?? 0) + 1;
		syncSoarMotion(e, meta);
		showDashStun(e, stunMs);   // 印の長さ＝墜落の気絶の長さ（1800ms ＞ 既定 1500ms）
		playSound('soarCrash');
		return true;
	}

	function tickSoar(e, meta, now) {
		const cfg = resolveSoar(e, meta);
		if (!cfg) return false;
		const player = getPlayer();
		if (e._soarPhase == null) {
			enterSoarPhase(e, 'ground', now, cfg.groundMs ?? 1560);
			return false;
		}
		if (e._soarPhase === 'dive') {
			const [sy, sx] = e._soarVec ?? [0, 0];
			const steps = Math.max(1, Math.round((cfg.diveSpeed ?? 1.5) / MOVE_STEP));
			const ew = e.w ?? 1, eh = e.h ?? 1;
			let moved = 0, outcome = null;
			for (let k = 0; k < steps && e._soarLeft > 0; k++) {
				// ① 接触が先＝プレイヤーは壁ではない（0d-2 / k-9 と同じ順序の罠）
				if (player && dashReachHit(e, player, [sy, sx], cfg.diveHitRange ?? 1.0,
					cfg.alignTol ?? 0.6)) { outcome = 'hit'; break; }
				const ny = e.y + sy * MOVE_STEP, nx = e.x + sx * MOVE_STEP;
				if (!isPassableForEnemy(ny, nx, e)) {
					const onPlayer = player && overlapArea(nx, ny, ew, eh, player.x, player.y, 1, 1) > 0;
					outcome = onPlayer ? 'hit' : 'terrain';
					break;
				}
				e.y = ny; e.x = nx; e._soarLeft -= MOVE_STEP; moved++;
			}
			if (moved) moveCharEl(`enemy-${e.id}`, e.x, e.y);
			if (outcome === 'hit') {
				// 盾では防げない（体当たり系の答えは「軸から外れる」だけ＝k-7.5 決定④）
				takeDamage(cfg.diveAtk ?? e.atk ?? meta?.atk ?? 1);
				if (meta?.inflict) inflictDebuff?.(meta);
			}
			if (outcome || e._soarLeft <= 0) landSoar(e, cfg, now);
			return true;
		}
		if (e._soarPhase === 'aim') {
			if (now < e._soarAt) return true;
			e._soarPhase = 'dive';
			e._soarSpan  = null;
			e._soarAt    = null;
			e._soarLeft  = cfg.diveCells ?? 9;
			return true;
		}
		if (e._soarPhase === 'air') {
			// airMs は**下限**（DECISIONS 2026-08-30（5）決定5）＝最低限これだけ回るまで
			// 軸合わせを判定しない（旧仕様＝揃った瞬間に打ち切る、を待たせる側へ変えた）。
			// ⚠️ `e._soarAt` はここでは「もう抜けられる時刻」＝下限の終わりの意味に変わった。
			if (now < e._soarAt) return false;   // 旋回は `enemySoarStride`（＝ゲートの中）が持つ
			const vec = soarDiveVec(e, player, cfg);
			// 保険（宙吊り防止）＝下限を過ぎても軸が揃わないまま `airMaxMs` を超えたら
			// `soarAnyVec` で強制的に落とす（旧 airMs の役割を引き継ぐ・別の上限として残した）。
			const maxAt = e._soarMaxAt ?? e._soarAt;
			if (vec || now >= maxAt) {
				e._soarVec = vec ?? soarAnyVec(e, player);
				e.dir = soarVecDir(e._soarVec);
				enterSoarPhase(e, 'aim', now, cfg.aimMs ?? 600);
				playSound('soarDive');
				return true;
			}
			return false;
		}
		if (e._soarPhase === 'rise') {
			if (now < e._soarAt) return true;
			enterSoarPhase(e, 'air', now, cfg.airMs ?? 2880);
			// 保険の上限も**入った瞬間に固定する**（`_soarSpan` と同じ作法）。
			e._soarMaxAt = now + (cfg.airMaxMs ?? (cfg.airMs ?? 2880) * 1.5);
			// 旋回はこの滞空のあいだ毎回その場から巻き直す（中心・角度・反転の周期を初期化）。
			resetSoarOrbit(e, cfg);
			return true;                 // 舞い上がった tick は専有（旋回は次の tick から）
		}
		// land ＝着地硬直（＝反撃の窓）。明けたら**必ず ground へ戻す**。
		// ⚠️ この分岐を書かないと land は下の ground の分岐へ落ちる＝着地の直後に
		//    いきなり `rise`（＝2周目以降、地上の窓＝殴れる窓が消える）。テスト㊴が
		//    「land の次が rise」で検出した実バグ（2026-08-30）。
		if (e._soarPhase === 'land') {
			if (now < e._soarAt) return true;   // 硬直中はこの tick を専有（動かない）
			enterSoarPhase(e, 'ground', now, cfg.groundMs ?? 1560);
			return false;                       // 立ち上がった tick から歩き・鉤爪が動く
		}
		// ground ＝地上に居る（ゲートは開ける＝歩き・鉤爪・雷撃弾が動く）
		if (now < e._soarAt) return false;
		enterSoarPhase(e, 'rise', now, cfg.riseMs ?? 480);
		e._soarFlights = (e._soarFlights ?? 0) + 1;
		playSound('soarRise');
		return true;
	}

	// ⚠️ 敵の `id` は `"行,列"` の文字列（`buildEnemies`）＝そのまま四則演算に使うと NaN に
	//    なる（`"4,7" * 97` → NaN・`"4,7" % 2` も NaN∴常に同じ側に落ちる＝coil の `_coilSpin`
	//    が全個体で `-1` 固定になっていた既存の潜在欠陥と同根＝実測で発見・今回は soar 側だけ
	//    このハッシュで直す＝J の coil は対象外〈scope外〉）。数値シードが要る場所はこれを通す。
	function numericSeedOf(id) {
		let h = 0;
		const s = String(id);
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		return h;
	}
	// 旋回の反転は不規則に見えるようにするが**乱数は使わない**（GUIDE §7-3）。
	// `e.id` と反転回数から決定的に「ランダムに見える」小数（0〜1）を作る＝shader 定番の
	// sin ハッシュ（真の乱数ではない＝同じ入力からは必ず同じ出力＝テストが揺れない）。
	function soarPseudo01(seed) {
		const v = Math.sin(seed * 12.9898) * 43758.5453;
		return v - Math.floor(v);
	}
	// 次の反転までの周回量（ラジアン）＝`flipLapsMin`〜`flipLapsMax` の間から決定的に選ぶ。
	function soarFlipArc(e, cfg) {
		const min = cfg.flipLapsMin ?? 0.4, max = cfg.flipLapsMax ?? 1.6;
		const seed = numericSeedOf(e.id) * 97 + (e._soarFlipCount ?? 0) * 31;
		const laps = min + soarPseudo01(seed) * (max - min);
		return laps * Math.PI * 2;
	}

	// 新しい滞空（`air`）に入るたびに旋回をその場から巻き直す（tickSoar の rise→air が呼ぶ）。
	// 中心はプレイヤーの**今の位置**から始める（`_soarSpin` は敵の生涯で持続＝`_coilSpin` と
	// 同じ作法・`e.id` から決定的に初期化）。
	function resetSoarOrbit(e, cfg) {
		const player = getPlayer();
		e._soarCx = player ? player.x : e.x;
		e._soarCy = player ? player.y : e.y;
		if (e._soarSpin == null) e._soarSpin = (numericSeedOf(e.id) % 2 === 0) ? 1 : -1;
		const { cx, cy } = enemyCellCenter(e);
		const dx = cx - e._soarCx, dy = cy - e._soarCy;
		// 今居る方角から巻き始める＝中心を決めた瞬間に体が輪の反対側へ跳ばない（coil と同じ）。
		e._soarAng = (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) ? 0 : Math.atan2(dy, dx);
		e._soarArc = 0;
		e._soarFlipCount = 0;
		e._soarNextFlip = soarFlipArc(e, cfg);
	}

	// 移動（＝ゲートの中）。相によって**寄り方そのものが変わる**：
	//   ground … 普通に寄る（`enemyChase`）＝地上では他の敵と同じ「追う」
	//   air    … 旋回＝**本当に円弧を描いて回る**（J の `coil` と同じ連続角度の仕組み＝
	//            `_soarAng` を cos/sin で動かす）。ユーザー実プレイ指摘＝「90度に曲がる
	//            ことではなく、本当に円弧を描くように回転する」で旧仕様（四角い軌道・
	//            DECISIONS 2026-08-30（5）決定6）は失効した（詳細＝同（7））。
	//            中心（`_soarCx/_soarCy`）はプレイヤーへ**緩く追従する**（`centerFollow`＝
	//            1歩ごとに差を割合だけ詰める）＝きっちり中心に固定しない（ユーザー確定）。
	//            回る向き（`_soarSpin`）は不規則に見える周期で反転する（`flipLapsMin/Max`・
	//            上の `soarFlipArc` が乱数なしで決める＝ユーザー確定「不規則（時間や乱数
	//            っぽく）」）。壁に当たって回れない側も同じ「反転」として扱う（coil と同じ）。
	function enemySoarStride(e, meta, speed, cfg) {
		if (!cfg) return;
		if (e._soarPhase == null || e._soarPhase === 'ground') { enemyChase(e, speed); return; }
		if (e._soarPhase !== 'air') return;
		const player = getPlayer();
		if (!player) return;
		const { cx, cy } = enemyCellCenter(e);
		const dx = player.x - cx, dy = player.y - cy;
		// 向きはプレイヤーへ（＝「狙われている」が読める）。**移動の角度とは別の値**。
		if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
			e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
		}
		// ⚠️ 2026-08-31 ユーザー実プレイ再指摘＝「まっすぐ飛んでいるように見える」
		// 「なんで X 軸か Y 軸かどちらかにだけ直進移動なの？」＝**実際にそうなっていた**。
		// 旧実装は「1歩先の目標点へ最短軸（4方向）で1マス寄る」（`coil` を丸ごと転用）＝
		// 目標点はごく僅かしか進まない（1歩あたり弧長 MOVE_STEP）のに、`resetSoarOrbit` した
		// 瞬間の体は中心から半径 R ぶん離れていない（`ground` の追いで密着していた）∴
		// **最初の数歩は「弧を追う」のではなく「半径のズレを1本の軸で埋める」動きになり、
		// 見た目はまっすぐな直線**になった（実測＝x だけ数歩→y だけ数歩、の L 字）。
		// ∴**目標点そのものへ毎 tick 連続座標で近づける**（MOVE_STEP のマス目に丸めない）
		// ＝弧が追いつくのを待たず、体そのものが円周上の点を直接なぞる。半径のズレが
		// 大きい最初だけ最大歩幅で近づき、ズレが無くなれば弧の進みと歩幅がほぼ一致する
		// ＝結果として「円に収束してからは円をなぞる」滑らかな動きになる。
		const follow = cfg.centerFollow ?? 0.12;
		// 中心はプレイヤーへ**緩く追従**（毎 tick、差の `centerFollow` 割合だけ詰める）＝
		// きっちり追いかけない＝プレイヤーが動くと中心もゆっくり動いた方向へずれる。
		e._soarCx += (player.x - e._soarCx) * follow;
		e._soarCy += (player.y - e._soarCy) * follow;

		const R = cfg.orbitRange ?? 3.5;
		// 角速度＝旋回の速さ（`orbitSpeed`）を弧長→ラジアンに変換（`enemyCoil` と同じ式）。
		// ⚠️ プレイヤー（1.0）より必ず遅い数にする（GUIDE §7-2）＝データ側のテストで固定する。
		const omega = (cfg.orbitSpeed ?? 0.75) * MOVE_STEP / Math.max(0.5, R);
		const nextAng = e._soarAng + e._soarSpin * omega;
		const halfW = ((e.w ?? 1) - 1) / 2, halfH = ((e.h ?? 1) - 1) / 2;
		const targetX = e._soarCx + Math.cos(nextAng) * R - halfW;
		const targetY = e._soarCy + Math.sin(nextAng) * R - halfH;
		const gdx = targetX - e.x, gdy = targetY - e.y;
		const gap = Math.hypot(gdx, gdy);
		// 1 tick の最大歩幅＝旧仕様の1歩ぶん（MOVE_STEP）と同じ上限にする＝速度の意味を変えない。
		const maxStep = (cfg.orbitSpeed ?? 0.75) * MOVE_STEP;
		const nx = gap <= maxStep || gap < 1e-6 ? targetX : e.x + (gdx / gap) * maxStep;
		const ny = gap <= maxStep || gap < 1e-6 ? targetY : e.y + (gdy / gap) * maxStep;

		const flipNow = () => {
			e._soarSpin = -e._soarSpin;
			e._soarArc = 0;
			e._soarFlipCount = (e._soarFlipCount ?? 0) + 1;
			e._soarNextFlip = soarFlipArc(e, cfg);
		};
		if (!isPassableForEnemy(ny, nx, e)) { flipNow(); return; }   // 壁に当たった側＝反転（coil と同じ）
		e.x = nx; e.y = ny;
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
		e._soarAng = nextAng;
		e._soarArc = (e._soarArc ?? 0) + omega;
		if (e._soarArc >= (e._soarNextFlip ?? Infinity)) flipNow();
	}

	// ── 滞空の告知（機構の唯一の可視化）───────────────────────────────
	// ⚠️ 2×2 ボスは向き別の絵も溜めの絵も1枚も持たない（0d-2 で実測）∴予告は **CSS ＋ SE** で
	//    作る（層2の実装が絵の生成待ちにならない＝A/J/O と同じ方針）。
	// ⚠️ `.soaring`（浮いた体＋真下の影）は「**今は剣が届かない**」の告知∴ダメージ判定と
	//    同じ関数（enemy-state.js `isSoaring`）から出す＝絵と判定が絶対にズレない
	//    （`.attack-recover` と `weakness.window:'recover'` の関係と同じ作法）。
	// ⚠️ 予告の形は体当たり（拡大縮小）・突進（足踏み）・剣（振り上げ）・ブレス（膨らむ玉）と
	//    別にする（GUIDE §6-1）＝避け方が違う（下がる／軸から外れる／間合いを切る／射線から
	//    出る／**落ちて来る軸から外れる**）ものを同じ絵で告知してはいけない。
	function syncSoarMotion(e, meta) {
		const cfg = resolveSoar(e, meta);
		if (!cfg) return;
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		el.classList.toggle('soaring',   isSoaring(e, meta));
		el.classList.toggle('soar-rise', e._soarPhase === 'rise');
		el.classList.toggle('soar-aim',  e._soarPhase === 'aim');
		el.classList.toggle('soar-dive', e._soarPhase === 'dive');
		// 長さは状態機械が単一の真実（CSS 側に持たせない＝swing/breath/coil/gaze と同じ作法）
		if (e._soarPhase === 'rise') el.style.setProperty('--soar-rise-ms', `${Math.round(cfg.riseMs ?? 480)}ms`);
		if (e._soarPhase === 'aim')  el.style.setProperty('--soar-aim-ms',  `${Math.round(cfg.aimMs ?? 600)}ms`);
		// 落ちる軸（±1/0 の無単位値）＝予告の震えと落下の伸びが**その軸に沿う**
		// ＝「どこへ落ちて来るか」の告知（breath の `--breath-ox/oy` と同じ趣旨）。
		const [sy, sx] = e._soarVec ?? [0, 0];
		el.style.setProperty('--soar-vx', String(sx));
		el.style.setProperty('--soar-vy', String(sy));
		// 旋回の予告＝**止めずに絵だけ**で「そろそろ向きを変える」を伝える
		// （DECISIONS 2026-08-30（5）決定1＝止まった敵は連打の的）。`_coilHeat` と同じ作法＝
		// 単一の数（0＝反転直後・1＝次の反転直前）を絵（羽の傾き）・テストが読む。
		if (e._soarPhase === 'air') {
			const heat = Math.min(1, (e._soarArc ?? 0) / (e._soarNextFlip || 1));
			el.style.setProperty('--soar-spin', String(e._soarSpin ?? 1));
			el.style.setProperty('--soar-spin-heat', heat.toFixed(3));
		}
	}

	// ── Phase 5.5k: 陸上敵の向き別スプライト名解決（DECISIONS 2026-08-10）─────
	// プレイヤーの getHeroSpriteName()（game.js）が雛形＝攻撃中/構え中/通常の3段を
	// 1関数に集約する。directional:true の敵だけがこの関数を通る（フラグ無しの既存敵は
	// 従来どおり meta.sprite 固定＝参照エイリアス方式のまま・後方互換）。
	// 攻撃/構えのタイムスタンプは player._atkUntil と同型の論理時間窓（e._atkUntil/e._guardUntil）。
	function resolveEnemySprite(e, meta, now) {
		const baseName = meta?.sprite ?? e.sprite;
		const base = baseName.replace(/(Atk|Guard)?[DRLU](Atk|Guard)?$/, '');
		const dirSuffix = { down: 'D', right: 'R', left: 'R', up: 'U' }[e.dir] ?? 'D';
		if (e._atkUntil != null && now < e._atkUntil) return `${base}${dirSuffix}Atk`;
		if (e._guardUntil != null && now < e._guardUntil) return `${base}${dirSuffix}Guard`;
		return `${base}${dirSuffix}`;
	}

	// directional な敵の見た目（sprite/flipX）を今の状態に揃え、変わっていれば
	// DOM の canvas を差し替える。enemyChase（通常追跡）と向き固定の bossTickHitAndAway
	// 差替ブロックの両方から呼べるよう、差し替え処理そのものをここに集約する。
	function syncDirectionalSprite(e, meta) {
		const now = gameNow();
		const flipX = (e.dir === 'left');
		const spriteName = resolveEnemySprite(e, meta, now);
		if (e.sprite === spriteName && e.flipX === flipX) return;
		e.sprite = spriteName;
		e.flipX  = flipX;
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (el) {
			const oldCv = el.querySelector('canvas.sprite');
			if (oldCv) oldCv.remove();
			const cv = makeSprite(e.sprite, e.pal, true, e.flipX);
			if (cv) {
				if ((e.w ?? 1) > 1 || (e.h ?? 1) > 1) {
					cv.style.setProperty('width',  '100%', 'important');
					cv.style.setProperty('height', '100%', 'important');
				}
				el.insertBefore(cv, el.firstChild);
			}
		}
	}

	// ── Phase 5-3: 敵が石を押す ────────────────────────────────
	// プレイヤーの tryPushStone（player.js）と同じ規則で、敵が移動しようとした
	// マス (er+ndr, ec+ndc) に石があるとき、その先 (er+2ndr, ec+2ndc) が押し先。
	// 押し先が通行可（tilePassable）かつ他の石・敵がいなければ石を1マス押し出す。
	// 押された石がボタンに乗れば既存の checkStoneOnSwitch がゲートを開く。
	// 戻り値：石を押せたら true（呼び出し側で敵もそのマスへ前進させる）。
	function tryEnemyPushStone(e, my, mx) {
		if (!getSS || !tilePassable) return false;        // deps 未注入なら無効（後方互換）
		const ndr = Math.sign(my);
		const ndc = Math.sign(mx);
		if (ndr !== 0 && ndc !== 0) return false;          // 斜めには押さない
		const stageData = getStageData();
		const er = toTileRow(e.y);
		const ec = toTileCol(e.x);
		const sr = er + ndr;   // 石があるはずのマス
		const sc = ec + ndc;
		const ss = getSS(getCurrentLayer(), getStageKey());
		if (!ss.stonePositions) ss.stonePositions = {};
		if (ss.stonesLocked) return false;  // Phase 4.56: ロック後は敵も石を押せない

		// (sr,sc) に石があるか（元位置の STONE タイル or 移動済みの石）
		let stoneKey = null;
		if (stageData.tiles[sr]?.[sc] === TILE.STONE && !ss.stonePositions[`${sr},${sc}`]) {
			stoneKey = `${sr},${sc}`;
		} else {
			for (const [k, st] of Object.entries(ss.stonePositions)) {
				if (st.r === sr && st.c === sc) { stoneKey = k; break; }
			}
		}
		if (stoneKey === null) return false;               // そこに石はない

		// 押し先 (dr,dc)
		const dr = sr + ndr;
		const dc = sc + ndc;
		if (dr < 0 || dr >= stageData.rows || dc < 0 || dc >= stageData.cols) return false;
		if (!tilePassable(dr, dc)) return false;           // 壁/水/穴は押せない
		// 2026-08-04（再設計・PLAN 4.7）：色スイッチは石を通さない（player.js と同じ規則）。
		const destTile = stageData.tiles[dr]?.[dc];
		if (destTile === TILE.SWITCH_RED || destTile === TILE.SWITCH_BLUE) return false;
		// 2026-08-02: 敵は押した後 (sr,sc)＝石の元セルへ入る（enemyChase の e.y/e.x 代入）∴下地が
		// 閉じていたら押せない（石を無視して下のタイルだけ見る＝プレイヤー側と同じ判定・片方だけ
		// 直すと敵に押させて「閉じた門越しに石を渡す」抜け道が残る）。
		const underEnemy = stageData.tiles[sr]?.[sc];
		if (underEnemy !== TILE.STONE && statefulTileClosed(underEnemy, `${sr},${sc}`, ss)) return false;
		// 押し先に別の石・敵・プレイヤーがいないか
		for (const st of Object.values(ss.stonePositions)) {
			if (st.r === dr && st.c === dc) return false;
		}
		const player = getPlayer();
		if (toTileRow(player.y) === dr && toTileCol(player.x) === dc) return false;
		for (const other of getEnemies()) {
			if (other === e) continue;
			if (toTileRow(other.y) === dr && toTileCol(other.x) === dc) return false;
		}

		// 石を1マス押し出す
		ss.stonePositions[stoneKey] = { r: dr, c: dc };
		checkStoneOnSwitch?.();
		evaluateConditions?.();
		playSound('move');
		renderBoard?.();
		renderChars?.();
		return true;
	}

	// ── ヒット＆アウェイ AI（アプローチモード選択） ────────────
	function pickApproachMode(e) {
		const meta = e.type ? ENEMY_META[e.type] : null;
		const w = resolveModeWeights(e, meta);
		const total = (w.flank ?? 0) + (w.direct ?? 0) + (w.wander ?? 0) + (w.strafe ?? 0);
		let r = Math.random() * total;
		if ((r -= (w.flank  ?? 0)) <= 0) return 'flank';
		if ((r -= (w.direct ?? 0)) <= 0) return 'direct';
		if ((r -= (w.strafe ?? 0)) <= 0) return 'strafe';
		return 'wander';
	}

	function bossTickHitAndAway(e, meta) {
		const debugMode = getDebugMode();
		const player    = getPlayer();
		const stageData = getStageData();
		const now = gameNow();

		if (!e._haPhase) {
			e._haPhase = 'approach';
			e._haTimer = now + 2500 + Math.random() * 1500;
			// 生きた重み（学習で書き換わる）を、既定値を写して立てる。
			// ⚠️ フェーズが `_modeWeights` を差し替えた後にここへ来ても上書きしない。
			if (!e._modeWeights) e._modeWeights = { ...resolveModeWeights(e, meta) };
			e._approachMode = pickApproachMode(e);
			if (e._approachMode === 'wander') {
				e._wanderX = 1 + Math.random() * ((stageData?.cols ?? 12) - 2);
				e._wanderY = 1 + Math.random() * ((stageData?.rows ?? 10) - 2);
			}
			if (debugMode) console.log(`[AI] ${e.id} approach start mode=${e._approachMode}`);
		}

		const dx = player.x - e.x;
		const dy = player.y - e.y;

		// 向きを常にプレイヤー方向に更新（毎tick）
		{
			const newDir = Math.abs(dy) >= Math.abs(dx)
				? (dy > 0 ? 'down' : 'up')
				: (dx > 0 ? 'right' : 'left');
			// ⚠️ 2026-08-26: 絵の差替は **directional でない敵だけ**が通る。directional な敵は
			//    enemyTick 末尾の syncDirectionalSprite が唯一の窓口＝ここで差し替えると
			//    攻撃ポーズ（`${base}${Dir}Atk`）を素の向き絵で上書きする／同じ tick に
			//    canvas を2回作り直す。
			//    ※この差替ブロックそのものが「向きが移動 AI の分岐ごとに書かれていた」名残＝
			//      魔物 W を combat の二相（hitAndAway: false）へ替えた瞬間に向きが死んだ原因
			//      （hitAndAway 以外の分岐には同じ処理が無い）。新しい敵は必ず
			//      `directional: true` を宣言する（ENEMY-DIRECTIONAL-GUIDE §1）。
			if (e.dir !== newDir && meta?.directional) {
				e.dir = newDir;
			} else if (e.dir !== newDir) {
				e.dir = newDir;
				const baseName = ENEMY_META[e.type]?.sprite ?? e.sprite;
				const base = baseName.replace(/[DRLU]$/, '');
				const dirSuffix = { down:'D', right:'R', left:'R', up:'U' }[newDir] ?? 'D';
				e.sprite = `${base}${dirSuffix}`;
				e.flipX  = (newDir === 'left');
				const el = document.getElementById(`char-enemy-${e.id}`);
				if (el) {
					const oldCv = el.querySelector('canvas.sprite');
					if (oldCv) oldCv.remove();
					const cv = makeSprite(e.sprite, e.pal, true, e.flipX);
					if (cv) {
						// 大型敵（w/h>1）は差し替え後も canvas を wrapper 全面に追従させる
						// （CSS の 1セル !important を上書き。揺れアニメは wrapper の
						//  large-enemy クラス経由で canvas に当たり続ける）
						if ((e.w ?? 1) > 1 || (e.h ?? 1) > 1) {
							cv.style.setProperty('width',  '100%', 'important');
							cv.style.setProperty('height', '100%', 'important');
						}
						el.insertBefore(cv, el.firstChild);
					}
				}
			}
		}

		if (e._haPhase === 'approach') {
			if (now >= e._haTimer) {
				e._haPhase = 'retreat';
				e._haTimer = now + 800 + Math.random() * 600;
				e._approachMode = null;
			} else {
				const mode = e._approachMode ?? 'direct';
				let tdx, tdy;

				if (mode === 'wander') {
					const wx = (e._wanderX ?? player.x) - e.x;
					const wy = (e._wanderY ?? player.y) - e.y;
					const wDist = Math.sqrt(wx*wx + wy*wy);
					if (wDist < 1.0) {
						e._approachMode = 'direct';
						tdx = dx; tdy = dy;
					} else {
						tdx = wx; tdy = wy;
					}
					if (debugMode) {
						e._dbgTick = (e._dbgTick ?? 0) + 1;
						if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} WANDER pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → wander=(${(e._wanderX??0).toFixed(1)},${(e._wanderY??0).toFixed(1)}) dist=${wDist.toFixed(1)}`);
					}
				} else if (mode === 'strafe') {
					if (e._strafeTargetX == null || !e._strafeBasePlayerX
						|| Math.abs(player.x - e._strafeBasePlayerX) > 2.5
						|| Math.abs(player.y - e._strafeBasePlayerY) > 2.5) {
						const heroDir = getHeroDir();
						const STRAFE_DIST = 4.0 + Math.random() * 2.0;
						const stageW = stageData?.cols ?? 12;
						const stageH = stageData?.rows ?? 10;
						const heroFwd = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[heroDir] ?? [0,1];
						const sideA = [-heroFwd[1],  heroFwd[0]];
						const sideB = [ heroFwd[1], -heroFwd[0]];
						const chosenSide = Math.random() < 0.5 ? sideA : sideB;
						const tx = player.x + chosenSide[0] * STRAFE_DIST * 0.94 + heroFwd[0] * STRAFE_DIST * 0.34 * (Math.random() < 0.5 ? 1 : -1);
						const ty = player.y + chosenSide[1] * STRAFE_DIST * 0.94 + heroFwd[1] * STRAFE_DIST * 0.34 * (Math.random() < 0.5 ? 1 : -1);
						e._strafeTargetX = Math.max(1, Math.min(stageW - 2, tx));
						e._strafeTargetY = Math.max(1, Math.min(stageH - 2, ty));
						const dirLen = Math.sqrt(chosenSide[0]**2 + chosenSide[1]**2) || 1;
						e._strafeDirX = chosenSide[0] / dirLen;
						e._strafeDirY = chosenSide[1] / dirLen;
						e._strafeBasePlayerX = player.x;
						e._strafeBasePlayerY = player.y;
						if (debugMode) console.log(`[AI] ${e.id} STRAFE target=(${e._strafeTargetX.toFixed(1)},${e._strafeTargetY.toFixed(1)}) dist=${STRAFE_DIST.toFixed(1)}`);
					}
					const stx = e._strafeTargetX;
					const sty = e._strafeTargetY;
					const toStrafeDist = Math.sqrt((stx-e.x)**2 + (sty-e.y)**2);
					if (toStrafeDist < 1.5) {
						tdx = e._strafeDirX ?? (stx - e.x);
						tdy = e._strafeDirY ?? (sty - e.y);
						if (debugMode) {
							e._dbgTick = (e._dbgTick ?? 0) + 1;
							if (e._dbgTick % 8 === 0) console.log(`[AI] ${e.id} STRAFE continuing dir=(${tdx.toFixed(2)},${tdy.toFixed(2)}) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)})`);
						}
					} else {
						tdx = stx - e.x; tdy = sty - e.y;
						if (debugMode) {
							e._dbgTick = (e._dbgTick ?? 0) + 1;
							if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} STRAFE moving pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → target=(${stx.toFixed(1)},${sty.toFixed(1)}) dist=${toStrafeDist.toFixed(1)}`);
						}
					}
				} else if (mode === 'direct') {
					tdx = dx; tdy = dy;
					if (debugMode) {
						e._dbgTick = (e._dbgTick ?? 0) + 1;
						if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} DIRECT pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) → player=(${player.x.toFixed(1)},${player.y.toFixed(1)}) dist=${Math.sqrt(dx*dx+dy*dy).toFixed(1)}`);
					}
				} else {
					// flank（背後回り込み）
					const heroDir = getHeroDir();
					const heroFwd = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[heroDir] ?? [0,1];
					const backX = player.x - heroFwd[0] * 1.5;
					const backY = player.y - heroFwd[1] * 1.5;

					const playerMoved = !e._flankBasePlayerX
						|| Math.abs(player.x - e._flankBasePlayerX) > 2.0
						|| Math.abs(player.y - e._flankBasePlayerY) > 2.0;

					if (e._flankTargetX == null || playerMoved) {
						const sideA = [-heroFwd[1],  heroFwd[0]];
						const sideB = [ heroFwd[1], -heroFwd[0]];
						const BACK_DIST = 1.5;
						const SIDE_DIST = 3.0 + Math.random() * 1.5;
						const stageW = stageData?.cols ?? 12;
						const stageH = stageData?.rows ?? 10;
						const candidates3 = [
							{ x: player.x - heroFwd[0] * BACK_DIST, y: player.y - heroFwd[1] * BACK_DIST },
							{ x: player.x + sideA[0] * SIDE_DIST,   y: player.y + sideA[1] * SIDE_DIST   },
							{ x: player.x + sideB[0] * SIDE_DIST,   y: player.y + sideB[1] * SIDE_DIST   },
						];
						const validCandidates = candidates3.map(p => ({
							x: Math.max(1, Math.min(stageW - 2, p.x)),
							y: Math.max(1, Math.min(stageH - 2, p.y)),
						}));
						const chosen = validCandidates[Math.floor(Math.random() * validCandidates.length)];
						e._flankTargetX = chosen.x;
						e._flankTargetY = chosen.y;
						e._flankBasePlayerX = player.x;
						e._flankBasePlayerY = player.y;
						e._flankDodgeDist = null;
						if (debugMode) {
							const which = ['back','sideA','sideB'];
							const idx = validCandidates.indexOf(chosen);
							console.log(`[AI] ${e.id} FLANK target=(${e._flankTargetX.toFixed(1)},${e._flankTargetY.toFixed(1)}) type=${which[idx] ?? '?'} reason=${playerMoved?'playerMoved':'init'}`);
						}
					}

					const ftx = e._flankTargetX;
					const fty = e._flankTargetY;
					const toTargetDist = Math.sqrt((ftx-e.x)**2 + (fty-e.y)**2);
					const toBkDist = Math.sqrt((backX-e.x)**2 + (backY-e.y)**2);

					if (toBkDist < 1.0) {
						tdx = dx; tdy = dy;
						if (e._flankStep !== 'charge') {
							if (debugMode) console.log(`[AI] ${e.id} FLANK→charge (back reached) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
							e._flankStep = 'charge';
						}
						e._flankTargetX = null;
					} else if (toTargetDist < 0.8) {
						tdx = backX - e.x; tdy = backY - e.y;
						if (e._flankStep !== 'to_back') {
							if (debugMode) console.log(`[AI] ${e.id} FLANK→to_back (target reached) pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) back=(${backX.toFixed(1)},${backY.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
							e._flankStep = 'to_back';
						}
					} else {
						tdx = ftx - e.x; tdy = fty - e.y;
						if (e._flankStep !== 'to_target') {
							if (debugMode) console.log(`[AI] ${e.id} FLANK→to_target pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) target=(${ftx.toFixed(1)},${fty.toFixed(1)}) dist=${toTargetDist.toFixed(1)}`);
							e._flankStep = 'to_target';
						}
					}

					if (debugMode) {
						e._dbgTick = (e._dbgTick ?? 0) + 1;
						if (e._dbgTick % 10 === 0) console.log(`[AI] ${e.id} FLANK step=${e._flankStep} pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) target=(${ftx?.toFixed(1)},${fty?.toFixed(1)}) toBkDist=${toBkDist.toFixed(1)}`);
					}
				}

				e.accum = (e.accum ?? 0) + resolveEnemySpeed(e, meta);
				if (e.accum >= 1.0) {
					e.accum -= 1.0;
					const step = MOVE_STEP;
					const candidates = [];
					if (Math.abs(tdy) >= Math.abs(tdx)) {
						if (tdy !== 0) candidates.push([Math.sign(tdy)*step, 0]);
						if (tdx !== 0) { candidates.push([0, Math.sign(tdx)*step]); candidates.push([0, -Math.sign(tdx)*step]); }
						else           { candidates.push([0, step]); candidates.push([0, -step]); }
						if (tdy !== 0) candidates.push([-Math.sign(tdy)*step, 0]);
					} else {
						if (tdx !== 0) candidates.push([0, Math.sign(tdx)*step]);
						if (tdy !== 0) { candidates.push([Math.sign(tdy)*step, 0]); candidates.push([-Math.sign(tdy)*step, 0]); }
						else           { candidates.push([step, 0]); candidates.push([-step, 0]); }
						if (tdx !== 0) candidates.push([0, -Math.sign(tdx)*step]);
					}
					const prevX = e.x, prevY = e.y;
					for (const [my, mx] of candidates) {
						if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
							e.y += my; e.x += mx; break;
						}
					}
					if (e.x === prevX && e.y === prevY) {
						e._stuckTick = (e._stuckTick ?? 0) + 1;
						if (e._stuckTick >= 3) {
							e._stuckTick = 0;
							const escapes = [[step,0],[-step,0],[0,step],[0,-step]];
							for (const [my,mx] of escapes.sort(()=>Math.random()-0.5)) {
								if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
									e.y += my; e.x += mx; break;
								}
							}
						}
						e._directChargeTick = (e._directChargeTick ?? 0) + 1;
						if (e._directChargeTick >= 8) {
							e._directChargeTick = 0;
							e._haPhase = 'retreat';
							e._haTimer = now + 400 + Math.random() * 200;
						}
					} else {
						e._stuckTick = 0;
						e._directChargeTick = 0;
					}
					moveCharEl(`enemy-${e.id}`, e.x, e.y);
				}
			}
		} else {
			// retreat フェーズ
			if (now >= e._haTimer) {
				{
					if (!e._modeWeights) e._modeWeights = { flank: 1.0, direct: 1.0, wander: 1.0 };
					// ⚠️ ここだけは**後方互換の単体 attack の range**を見る（フェーズで差し替わる
					// `attacks` ではない）＝「接近が成功したか」の物差しを 8-4 (4) で変えると
					// 既存13ボスの学習の効き方が変わる（例：ザーネルは attack.range 7 ＝
					// ほぼ常に成功扱い）∴層1の配線では触らない。物差しの見直しは別タスク。
					const atk = ENEMY_META[e.type]?.attack;
					const range = atk?.range ?? 1.5;
					const distNow = Math.sqrt(dx*dx + dy*dy);
					const succeeded = (e._approachMode === 'direct' || e._approachMode === 'flank')
						&& distNow <= range + 1.0;
					const mode = e._approachMode;
					if (mode === 'flank' || mode === 'direct') {
						if (succeeded) {
							e._modeWeights[mode] = Math.min(2.0, e._modeWeights[mode] * 1.5);
						} else {
							e._modeWeights[mode] = Math.max(0.2, e._modeWeights[mode] * 0.5);
						}
					}
					if (mode === 'wander') e._modeWeights = { flank: 1.0, direct: 1.0, wander: 1.0 };
				}
				e._haPhase = 'approach';
				e._haTimer = now + 2000 + Math.random() * 1000;
				{
					e._approachMode = pickApproachMode(e);
					if (e._approachMode === 'wander') {
						const stageData2 = getStageData();
						e._wanderX = 1 + Math.random() * ((stageData2?.cols ?? 12) - 2);
						e._wanderY = 1 + Math.random() * ((stageData2?.rows ?? 10) - 2);
					}
					e._dbgTick = 0;
					if (debugMode) {
						const w = e._modeWeights;
						const total = w.flank + w.direct + w.wander;
						console.log(
							`[AI] ${e.id} retreat→approach mode=${e._approachMode}` +
							` weights=F${(w.flank/total*100).toFixed(0)}%` +
							`/D${(w.direct/total*100).toFixed(0)}%` +
							`/W${(w.wander/total*100).toFixed(0)}%` +
							(e._approachMode === 'wander' ? ` wander=(${e._wanderX?.toFixed(1)},${e._wanderY?.toFixed(1)})` : '')
						);
					}
				}
			} else {
				const retreatDist = Math.sqrt(dx*dx + dy*dy);
				if (retreatDist >= 3.0) {
					e._haPhase = 'approach';
					e._haTimer = now + 500 + Math.random() * 500;
					e._approachMode = pickApproachMode(e);
					if (e._approachMode === 'wander') {
						const sd2 = getStageData();
						e._wanderX = 1 + Math.random() * ((sd2?.cols ?? 12) - 2);
						e._wanderY = 1 + Math.random() * ((sd2?.rows ?? 10) - 2);
					}
					e._dbgTick = 0;
					if (debugMode) {
						const w = e._modeWeights ?? { flank:1, direct:1, wander:1 };
						const total = w.flank + w.direct + w.wander;
						console.log(
							`[AI] ${e.id} retreat→approach (dist limit) mode=${e._approachMode}` +
							` dist=${retreatDist.toFixed(1)}` +
							` weights=F${(w.flank/total*100).toFixed(0)}%/D${(w.direct/total*100).toFixed(0)}%/W${(w.wander/total*100).toFixed(0)}%` +
							(e._approachMode === 'wander' ? ` wander=(${e._wanderX?.toFixed(1)},${e._wanderY?.toFixed(1)})` : '')
						);
					}
				} else {
					const rdx = -Math.sign(dx), rdy = -Math.sign(dy);
					const step = MOVE_STEP;
					const cands = Math.abs(dy) >= Math.abs(dx)
						? [[rdy*step,0],[0,rdx*step]] : [[0,rdx*step],[rdy*step,0]];
					e.accum = (e.accum ?? 0) + resolveEnemySpeed(e, meta);
					if (e.accum >= 1.0) {
						e.accum -= 1.0;
						for (const [my,mx] of cands) {
							if (isPassableForEnemy(e.y+my, e.x+mx, e)) {
								e.y += my; e.x += mx; break;
							}
						}
						moveCharEl(`enemy-${e.id}`, e.x, e.y);
					}
				}
			}
		}
	}

	// ── 通常追跡 AI ───────────────────────────────────────────
	// dirLocked（Phase 5.5k k-4）＝向きが機構で固定されている敵（盾騎士）は移動しても
	// 向き直らない。ここで毎tick e.dir を上書きすると blockFacing の「正面」が常に
	// プレイヤー側になり、回り込みが原理的に成立しなくなる。
	function enemyChase(e, speed, dirLocked = false) {
		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;

		const player = getPlayer();
		const dy = player.y - e.y;
		const dx = player.x - e.x;
		const dist = Math.sqrt(dy * dy + dx * dx);
		if (dist < 0.01) return;

		const step = MOVE_STEP;
		const candidates = [];
		if (Math.abs(dy) >= Math.abs(dx)) {
			candidates.push([Math.sign(dy) * step, 0]);
			candidates.push([0, Math.sign(dx) * step]);
		} else {
			candidates.push([0, Math.sign(dx) * step]);
			candidates.push([Math.sign(dy) * step, 0]);
		}

		// タイル境界に揃っているか（石押しは整数座標のときだけ試す）
		const aligned = Math.abs(e.x - Math.round(e.x)) < 0.01
			&& Math.abs(e.y - Math.round(e.y)) < 0.01;

		for (const [my, mx] of candidates) {
			const ny = e.y + my;
			const nx = e.x + mx;
			if (isPassableForEnemy(ny, nx, e)) {
				e.y = ny; e.x = nx;
				break;
			}
			// Phase 5-3: 塞がれた先が石なら押してみる（整数座標・カーディナルのみ）
			if (aligned && tryEnemyPushStone(e, my, mx)) {
				e.y = ny; e.x = nx;
				break;
			}
		}

		if (!dirLocked) {
			if (Math.abs(dy) >= Math.abs(dx)) e.dir = dy > 0 ? 'down' : 'up';
			else e.dir = dx > 0 ? 'right' : 'left';
		}

		moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// ── 敵の攻撃処理 ──────────────────────────────────────────
	function enemyAttack(e, meta) {
		const attackList = resolveAttackList(e, meta);
		if (attackList.length === 0) return;

		const player  = getPlayer();
		const heroDir = getHeroDir();
		const now = gameNow();
		if (!e._attackTimes) e._attackTimes = {};

		// 0d-2.5 (5): **方向は中心から・間合いは端から**の2つを使い分ける。
		//   dx/dy/dist … 投擲物を飛ばす向き・絵の向きの決定（中心から見た向き）
		//   reach       … range / minRange の判定（body の端からプレイヤーまで）
		// 左上基準のままだと 2×2 は「西/北から 1 セル遠い」＝同じ密着でも向きで間合いが
		// 変わる（＝プレイヤーには見えない安全な面ができる）。1×1 では両方とも従来と同値。
		const { cx, cy } = enemyCellCenter(e);
		const dx = player.x - cx;
		const dy = player.y - cy;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const reach = enemyEdgeDist(e, player.x, player.y);

		for (let i = 0; i < attackList.length; i++) {
			const atk = attackList[i];
			if (!atk) continue;

			// Phase 8-4 (4) 0d-3（6体目 U）: 滞空中は**近接を出さない**（鉤爪は地上だけ）。
			// 空に居るあいだ届くのは遠隔（雷撃弾）だけ＝「こちらの剣が届かない代わりに
			// 向こうの鉤爪も届かない」＝機構が一方的な有利にならない（GUIDE §7-2 の対称）。
			// ⚠️ プレイヤー側の「剣が届かない」判定は combat.js `isSoarOutOfReach` が持つ＝
			//    どちらも enemy-state.js `isSoaring` を読む＝窓が絵と1つにまとまる。
			if (isSoaring(e, meta) && MELEE_ATTACK_TYPES.has(atk.type)) continue;

			// Phase 5.5k k-7.5: 体当たり（charge）＝予告を出すだけ。命中判定は tickSlam が
			// 予告の解決時に行う（ここでダメージを出すと「隣接＝即ダメージ」になってしまう）。
			if (atk.type === 'charge') {
				if (e._slamAt != null) continue;                                  // 予告中は二重に始めない
				const lastSlam = e._attackTimes[i] ?? 0;
				if (now - lastSlam < (atk.cooldown ?? SLAM_COOLDOWN_MS)) continue;
				if (!slamReachHit(e, player, atk.range ?? SLAM_RANGE)) continue;
				startSlam(e, atk, i, now);
				continue;
			}

			const lastTime = e._attackTimes[i] ?? 0;
			const cooldown = atk.cooldown ?? 3000;
			if (now - lastTime < cooldown) continue;

			if (reach > (atk.range ?? 5)) continue;
			// Phase 9-6: minRange＝近すぎる時はこの攻撃を出さない（下限）。
			// 近接＋遠隔を持つ敵（潜み鮫）で「隣接したら遠隔でなく噛みつき」を宣言的に表す。
			if (atk.minRange !== undefined && reach < atk.minRange) continue;

			if (atk.type === 'spear') {
				const sameCol = Math.abs(dx) < 1.0;
				const sameRow = Math.abs(dy) < 1.0;
				if (!sameCol && !sameRow) continue;
				const ndx = sameCol ? 0 : Math.sign(dx);
				const ndy = sameRow ? 0 : Math.sign(dy);
				fireEnemyProjectile(e, 'spear', ndx, ndy, atk.projectileSpeed ?? 1.5);
				markAttack(e, meta, i, now);
			} else if (atk.type === 'swordBeam') {
				// Phase 5.5k #7 剣獣: 飛ぶ斬撃。spear と同じ「縦横が揃ったときだけ撃つ」型
				// （斜めには飛ばさない＝プレイヤーは列/行から外れれば避けられる）。
				// 投擲物はプレイヤーのビーム剣と同じ 'beam'（owner:'enemy' で発射される。
				// スイッチ類のトグルは owner==='player' に限定済み∴敵ビームでは動かない）。
				const sameCol = Math.abs(dx) < 1.0;
				const sameRow = Math.abs(dy) < 1.0;
				if (!sameCol && !sameRow) continue;
				const ndx = sameCol ? 0 : Math.sign(dx);
				const ndy = sameRow ? 0 : Math.sign(dy);
				// 撃つ方向を向く＝向き別スプライトの攻撃ポーズが斬撃の向きと一致する
				e.dir = ndx !== 0 ? (ndx > 0 ? 'right' : 'left') : (ndy > 0 ? 'down' : 'up');
				fireEnemyProjectile(e, 'beam', ndx, ndy, atk.projectileSpeed ?? 2.0);
				// クールダウン記録・剣を振った絵（_atkUntil）・攻撃硬直（_freezeUntil）は markAttack が一括で立てる
				markAttack(e, meta, i, now);
			} else if (atk.type === 'stone' || atk.type === 'magicBolt') {
				// magicBolt（k-8c 術士の魔弾）は stone と**同じ分岐で撃つ**＝任意角・盾で
				// 防げる・壁で消えるという挙動を1行も分けない。違いは投擲物の絵だけ∴
				// type をそのまま渡す（projectile.js の createProjEl が
				// makeSprite(proj.type, proj.type) を呼ぶ＝type 名がスプライト名を兼ねる）。
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, atk.type, ndx, ndy, atk.projectileSpeed ?? 1.0);
				markAttack(e, meta, i, now);
			} else if (atk.type === 'waterShot') {
				// Phase 9-6 深洋O: 射水魚の水弾。stone と同じ「任意角へ飛ばす」型
				// （斜めにも撃つ）。投擲物の飛翔・盾ブロック・命中は既存の共通経路。
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, 'waterShot', ndx, ndy, atk.projectileSpeed ?? 1.2);
				markAttack(e, meta, i, now);
			} else if (atk.type === 'waterBlade') {
				// Phase 9-6 深洋O: 潜み鮫の水刃（尾で薙いだ衝撃波）。任意角。
				// minRange（上のゲート）で「隣接時は撃たない」＝噛みつきに譲る。
				const ndx = dx / dist;
				const ndy = dy / dist;
				fireEnemyProjectile(e, 'waterBlade', ndx, ndy, atk.projectileSpeed ?? 1.4);
				markAttack(e, meta, i, now);
			} else if (atk.type === 'bombThrow') {
				// Phase 5.5k k-6 #6 爆弾鬼: 放物線で投げる爆弾。
				// **着弾点は「投げた瞬間のプレイヤーのセル」で固定する**（追尾しない）＝
				// プレイヤーは「投げられた瞬間に走り出せば避けられる」＝反応の勝負になる。
				// 飛翔中は壁も水も素通りする（projectile.js lobStep）∴遮蔽の裏でも当たる
				// ＝この敵に対しては「隠れる」でなく「間合いを詰める」が答えになる（名簿の設計）。
				const tr = toTileRow(player.y);
				const tc = toTileCol(player.x);
				const ndx = dx / dist;
				const ndy = dy / dist;
				// 投げる方向を向く（任意角なので絵は縦横のうち成分の大きい側へ寄せる）
				e.dir = Math.abs(dx) >= Math.abs(dy)
					? (dx > 0 ? 'right' : 'left')
					: (dy > 0 ? 'down' : 'up');
				fireEnemyProjectile(e, 'thrownBomb', ndx, ndy, atk.projectileSpeed ?? 1.0, {
					lob:       true,
					targetX:   tc,
					targetY:   tr,
					blast:     atk.blast ?? {},
					arcHeight: 1.2,     // 見た目の弧の高さ（セル）＝当たり判定には効かない
				});
				markAttack(e, meta, i, now);
			} else if (atk.type === 'boomerangThrow') {
				// Phase 5.5k k-6 #10 ブーメラン鬼: 往復するブーメラン。
				// swordBeam と同じ「縦横が揃ったときだけ投げる」型＝行/列を外せば避けられる。
				// ⚠️ ただし**帰りの軌道は投げた敵へ向かう**∴行きを横に避けたプレイヤーが
				// そのまま敵へ寄ると帰りに当たる（二度読み＝名簿の設計）。
				const sameCol = Math.abs(dx) < 1.0;
				const sameRow = Math.abs(dy) < 1.0;
				if (!sameCol && !sameRow) continue;
				const ndx = sameCol ? 0 : Math.sign(dx);
				const ndy = sameRow ? 0 : Math.sign(dy);
				e.dir = ndx !== 0 ? (ndx > 0 ? 'right' : 'left') : (ndy > 0 ? 'down' : 'up');
				fireEnemyProjectile(e, 'boomerang', ndx, ndy, atk.projectileSpeed ?? 2.0, {
					// returnsToOwner＝往復の経路（projectile.js boomerangStep）に乗せる明示のフラグ。
					// owner で判定しない理由＝敵に打ち返されたプレイヤーのブーメランを
					// まっすぐ飛ばし続けるため（打ち返しの挙動を変えない）。
					returnsToOwner: true,
					maxRange:       atk.maxRange ?? 4.5,
				});
				markAttack(e, meta, i, now);
			} else if (atk.type === 'breath') {
				// Phase 8-4 (4) 0d-3（2体目 A 炎のサラマンドラ）: 炎のブレス（円錐）。
				// 剣（sword）と同じ**予告→解決の2拍**で出す（`tickBreath` が解決する）：
				//   ① 車線（行/列）に乗っているときだけ予告を始める＝斜めには吐けない
				//   ② 予告の瞬間に**向きを固定**する（`_breathDir`）＝解決時に追尾しない
				//      ∴予告を見てから射線を外せば空振りする＝この攻撃の答えになる
				//   ③ 解決は `tickBreath` → `breatheCone`（壁で止まる・盾では防げない）
				if (e._breathAt != null || e._swingAt != null || e._slamAt != null) continue;
				const bdir = breathLaneDir(e, atk, dx, dy);
				if (!bdir) continue;
				startBreath(e, meta, atk, i, now, bdir);
				continue;
			} else if (atk.type === 'sword') {
				// Phase 8-4 (4) 0d-2.6: 剣は **予告（前動作）を経てから当たる**。
				// 0d-2.7（2026-08-25）で予告を**全敵の既定**にした（旧＝`windupMs` を書いた
				// 敵だけの opt-in ＝岩ゴーレム1体のみ）。予告の無い剣は「到達距離に入った tick に
				// 即ダメージ」＝プレイヤーには接触ダメージと区別できなかった（ユーザー実プレイ報告）。
				// `windupMs: 0` を明示した攻撃だけ従来の即ダメージに戻せる（逃げ道は残す）。
				const windupMs = atk.windupMs ?? MELEE_WINDUP_MS;
				if (windupMs > 0) {
					if (e._swingAt != null || e._slamAt != null) continue;   // 予告は同時に1つだけ
					const reach = swordReach(e, atk);
					if (!reach) continue;
					// Phase 5.5k k-4 の向き固定（盾騎士）は**振り上げも正面限定**にする。
					// 予告だけ側面へ出すと、予告中に turnMs の向き直りが来た敵が
					// 「振り上げた時は側面だったのに解決時は正面」で当ててしまう
					// ＝回り込みの報酬（tests/facing-block-enemies.spec.js ⑧）が消える。
					if (meta.blockFacing && reach.dir !== e.dir) continue;
					startSwing(e, meta, atk, i, now, reach);
					continue;
				}
				if (!resolveSwordHit(e, meta, atk)) continue;
				showEnemyMeleeStrike(e, meta);
				// Phase 5.5k: クールダウン記録・剣を振った絵（${base}${Dir}Atk の窓 _atkUntil）・
				// 攻撃硬直（_freezeUntil）を markAttack で一括して立てる
				// （プレイヤーの player._atkUntil と同型・DECISIONS 2026-08-10 / 2026-08-12）。
				markAttack(e, meta, i, now);
				if (retreatAfterMelee(e, meta, now)) break;
			}
		}
	}

	// ── Phase 8-4 (4) 0d-2.6: 剣（近接）の予告つき攻撃 ─────────────────────
	// 2026-08-25 ユーザー実プレイ報告：「盾を持っていない状態では、G の攻撃を受けずに剣を
	// 当てるのは至難の業。攻撃を瞬時に発生させるのではなく、前動作があってから攻撃が
	// 発生するようにして、避けようと思えばがんばれば避けられる作りにすべき」。
	// ∴体当たり（slam）と同じ3拍を剣にも入れる：
	//   ① 到達距離に入った tick に **予告**（`e._swingAt` ＝解決の論理時刻）＝剣を振り上げる
	//   ② 予告中は移動も他の攻撃もしない（enemyTick がこの tick を専有する）
	//   ③ 解決の tick に **もう一度** 到達判定＝離れていれば空振り
	// ⚠️ ❌ 失効（2026-08-25・0d-2.7）：「予告は `windupMs` を書いた攻撃だけの opt-in ＝
	//    ザコの剣は従来どおり即ダメージ（名簿の脅威度をボス以外で動かさない）」。
	//    ユーザー実プレイ報告＝「どの敵もそうなんだけど、接触しただけでもダメージくらう」＝
	//    予告の無い剣は接触ダメージと区別できない∴**予告は全敵の既定**（MELEE_WINDUP_MS）。
	//    脅威度が下がる代償は承知の上（ユーザー選択・DECISIONS 2026-08-25（5））。
	// ⚠️ 盾ブロック・向き固定・ヒット＆アウェイの学習は **予告あり/なしで同じ1つの経路**
	//    （resolveSwordHit）を通す＝機構が片方にだけ掛かる二重化を作らない。
	const SWORD_PERP = 0.8;   // 主軸に直交する方向の許容ずれ（体当たり SLAM_PERP と同じ数字）

	// 剣の到達判定。届いていれば {ux,uy,dir,sdx,sdy}、届いていなければ null。
	// 形は体当たり（slamReachHit）と同じ「主軸 ≤ range・直交 ≤ 0.8」の十字で、
	// 大型敵は占有範囲の分だけ広げる（0d-2.5: プレイヤー側 combat.js の剣と同じ作法∴
	// 「こちらの剣は届くのに相手の剣は届かない」向きが出ない）。
	// ∴`range` の意味は **body の端からの距離**＝プレイヤーの SWORD_REACH と直接比べられる。
	function swordReach(e, atk) {
		const player = getPlayer();
		const { cx, cy } = enemyCellCenter(e);
		const { halfW, halfH } = enemyHalf(e);
		const range = atk.range ?? 1.5;
		const dx = player.x - cx, dy = player.y - cy;
		const adx = Math.abs(dx), ady = Math.abs(dy);
		let ux, uy;
		if (ady >= adx) { ux = 0; uy = (dy > 0 ? 1 : -1); }
		else            { ux = (dx > 0 ? 1 : -1); uy = 0; }
		const projDist = Math.abs(dx * ux + dy * uy);
		const perpDist = Math.abs(dx * (-uy) + dy * ux);
		const halfFwd  = Math.abs(ux) * halfW + Math.abs(uy) * halfH;
		const halfSide = Math.abs(uy) * halfW + Math.abs(ux) * halfH;
		if (projDist - halfFwd > range) return null;
		if (perpDist > SWORD_PERP + halfSide) return null;
		const dir = uy !== 0 ? (uy > 0 ? 'down' : 'up') : (ux > 0 ? 'right' : 'left');
		// 盾ブロックへ渡す向き＝敵から見たプレイヤーの方向。真上に重なっている異常時は e.dir。
		let sdx = dx, sdy = dy;
		if (adx < 0.01 && ady < 0.01) {
			const dv = { down:[0,1], up:[0,-1], left:[-1,0], right:[1,0] }[e.dir] ?? [0,1];
			sdx = dv[0]; sdy = dv[1];
		}
		return { ux, uy, dir, sdx, sdy };
	}

	// 剣の当たり／盾ブロックの解決。戻り値＝攻撃が成立したか（当てた or 防がれた）。
	// false＝空振り（呼び出し側は予告なしならクールダウンを数えない＝従来どおり）。
	function resolveSwordHit(e, meta, atk) {
		const hit = swordReach(e, atk);
		if (!hit) return false;
		// Phase 5.5k k-4: 向き固定の敵（盾騎士）は**正面にしか剣を振れない**。
		// 向きロックの代償＝側面/背後に回り込んだプレイヤーには手が出ない
		// ＝回り込みに報酬がある（向き直りは tickFaceLock の turnMs 待ち）。
		if (meta.blockFacing && hit.dir !== e.dir) return false;
		const player = getPlayer();
		const blocked = player.shield && isShieldBlockingDir(hit.sdx, hit.sdy);
		if (blocked) {
			playSound('shieldBlock');
			showShieldBlockEffect(e.x, e.y);
			// 盾ブロック → 現在の approach モードの重みを下げる（学習）
			if (resolveHitAndAway(e, meta) && e._modeWeights && e._approachMode) {
				const m = e._approachMode;
				if (m === 'direct' || m === 'flank') {
					e._modeWeights[m] = Math.max(0.1, e._modeWeights[m] * 0.6);
					if (getDebugMode()) {
						const w = e._modeWeights;
						const total = w.flank + w.direct + w.wander;
						console.log(`[AI] ${e.id} shield-blocked mode=${m} → weights=F${(w.flank/total*100).toFixed(0)}%/D${(w.direct/total*100).toFixed(0)}%/W${(w.wander/total*100).toFixed(0)}%`);
					}
				}
			}
		} else {
			takeDamage(meta.atk);
		}
		return true;
	}

	// 当てた（防がれた）後の後退＝ヒット＆アウェイ。戻り値 true ＝後退へ移った
	// （呼び出し側は攻撃ループを抜ける＝1 tick に2発目を出さない従来の挙動）。
	function retreatAfterMelee(e, meta, now) {
		if (!resolveHitAndAway(e, meta) || e._haPhase !== 'approach') return false;
		e._haPhase = 'retreat';
		e._haTimer = now + 600 + Math.random() * 400;
		return true;
	}

	// 予告の開始（enemyAttack の sword 分岐から呼ぶ）。
	function startSwing(e, meta, atk, i, now, reach = null) {
		const hit = reach ?? swordReach(e, atk);
		// 振る方向を向く（向き固定の敵は向き直らない＝正面にしか振れないという制約を壊さない）
		if (hit && !meta.blockFacing) e.dir = hit.dir;
		// 長さは enemyAttack と同じ式で引き直す（既定＝MELEE_WINDUP_MS・0d-2.7）
		e._swingWindupMs = atk.windupMs ?? MELEE_WINDUP_MS;
		e._swingAt  = now + e._swingWindupMs;
		e._swingIdx = i;
		// 予告は絵と音の2経路で出す＝画面の端でも読める。突進の溜め（dashWindup の低い段）とは
		// 別の音＝避け方が違うものを同じ音で告知しない。
		// 2026-08-26: 音も絵も **剣を持っているか**（meta.wieldsSword）で振り分ける＝
		// 剣を持たない敵（地中蟲の咬みつき・巨体の体当たり）は低く沈む唸り（maulWindup）。
		playSound(meta.wieldsSword ? 'swordWindup' : 'maulWindup');
	}

	// 予告の解決。戻り値 true ＝この tick は剣が専有した（移動も他の攻撃もしない）。
	function tickSwing(e, meta, now) {
		if (e._swingAt == null) return false;
		if (now < e._swingAt) return true;                 // まだ振り上げ中
		const list = resolveAttackList(e, meta);
		const i    = e._swingIdx ?? 0;
		const atk  = list[i] ?? {};
		e._swingAt = null; e._swingIdx = null;
		// 隠れ中（潜行・地中・滞空）に解決の時刻が来たら空振り（tickSlam と同じ扱い）
		if (e.hidden) { markAttack(e, meta, i, now); return true; }
		const connected = resolveSwordHit(e, meta, atk);
		// 振り下ろしの絵は当たっても空振りでも出す＝「避けた」ことが画面に出る
		showEnemyMeleeStrike(e, meta);
		// クールダウン・硬直は**解決した時刻から**数える（予告の開始からではない）。
		// 空振りでも数える＝逃げられた直後に予告なしで振り直す連打にならない。
		markAttack(e, meta, i, now);
		if (connected) retreatAfterMelee(e, meta, now);
		return true;
	}

	// 予告モーションの見た目（board.css `.swing-windup`＝剣を頭上へ振り上げる）。
	// 体当たり（`.slam-windup` の拡大縮小）とも突進（`.dash-windup` の足踏み）とも**別の形**
	// ＝どの攻撃の予告なのかが絵で分かる（GUIDE §6-1）。2026-08-25 ユーザー指定＝
	// 「剣の攻撃の予告動作がキャラの拡大縮小だと変」∴剣そのものが上がる形にする。
	// ⚠️ 2026-08-26: この絵は **meta.wieldsSword を宣言した敵だけ**（θ 骸骨剣士・μ 剣獣・
	//    ζ 盾騎士・魔王系 V/W/X/Z）。剣を持たない敵の近接は `.slam-windup`（体の収縮）で出す
	//    ＝ユーザー実プレイ報告「地中蟲とかも剣で攻撃するようになっちゃったの？変じゃん。
	//    剣もってたら」。攻撃そのもの（判定・盾ブロック・硬直）は宣言に関係なく同じ経路。
	function syncSwingMotion(e, meta) {
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		const on = e._swingAt != null && !!meta?.wieldsSword;
		if (on) {
			// 振り上げの長さは状態機械が持つ（CSS 側に長さを書かない＝dash-windup と同じ作法）
			el.style.setProperty('--swing-windup-ms', `${Math.round(e._swingWindupMs ?? 0)}ms`);
			// 剣を持つ側＝振る向き。左/上へ振るときは左右反転する（絵が向きと逆にならない）
			el.style.setProperty('--swing-flip', (e.dir === 'left' || e.dir === 'up') ? '-1' : '1');
		}
		el.classList.toggle('swing-windup', on);
	}

	// 攻撃硬直（`_freezeUntil`）の見た目（board.css `.attack-recover`＝前かがみに沈んで止まる）。
	// 2026-08-25 ユーザー実プレイ判定「攻撃がおわったあともちょっと動けない時間をつくらないと
	// 剣を当てること自体がほぼ不可能」で硬直を反撃の窓として使い始めた∴**窓が見えないと
	// 反撃できない**（GUIDE §6-1「絵は機構を読ませる」）。予告（振り上げ・体当たりの拡大縮小・
	// 突進の足踏み）はどれも動き続ける絵だが、硬直は**動かずに止まる**形＝混ざらない。
	function syncRecoverMotion(e, now) {
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		// 窓の判定は `game/enemy-state.js` の1か所だけが持つ＝弱点（`weakness.window: 'recover'`）と
		// この絵が同じ窓を指すことを保証する（0d-2.11 (A)・予告中は硬直の絵を出さない条件も含む）
		const on = isInRecoverWindow(e, now);
		// ⚠️ 長さは**窓に入った最初の tick だけ**書く（毎 tick 残り時間を書き直すと
		//    animation-duration が縮み続けて沈む姿勢が跳ねる）。硬直は攻撃が成立した tick に
		//    立つ∴最初の tick の残り＝硬直の全長。
		if (on && !el.classList.contains('attack-recover')) {
			el.style.setProperty('--recover-ms', `${Math.max(0, Math.round(e._freezeUntil - now))}ms`);
		}
		el.classList.toggle('attack-recover', on);
	}

	// 敵の近接の解決の絵（当たっても空振りでも出す＝「避けた」ことが画面に出る）。
	// 2026-08-26: 剣を持つ敵（meta.wieldsSword）は斬撃の光線（`.sword-thrust`）、持たない敵は
	// 牙/爪の一撃（`.sword-thrust.maul-strike`＝短く太い衝撃）にする。要素のクラス名 `sword-thrust`
	// は剣から始まった歴史的な名前で、今は「近接の解決の絵」の意味（複数のテストがこの名前で
	// 解決の tick を数えている∴名前は変えない・見た目だけを変種で分ける）。
	function showEnemyMeleeStrike(e, meta) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const player = getPlayer();
		// 0d-2.5: 斬撃の出る位置は **body の中心から**プレイヤーへ 1 セル（左上からだと
		// 2×2 では体の左上角から斬撃が出る＝当たった面と絵が食い違う）。
		const { cx, cy } = enemyCellCenter(e);
		const dx = player.x - cx, dy = player.y - cy;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < 0.01) return;
		const fx = cx + dx / dist;
		const fy = cy + dy / dist;
		const dir = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = `sword-thrust dir-${dir}${meta?.wieldsSword ? '' : ' maul-strike'}`;
		el.style.left   = `${fx * cellPx}px`;
		el.style.top    = `${fy * cellPx}px`;
		el.style.width  = `${cellPx}px`;
		el.style.height = `${cellPx}px`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 260);
	}

	// ── 隠れ↔出現の無敵窓（Phase 9-6 潜み鮫の潜行 → 5.5k k-3 で陸/空へ一般化）──────
	// meta.hide = { hiddenMs, shownMs, style } を持つ敵は、隠れている時間と
	// 出ている時間を交互に繰り返す。隠れ中（e.hidden=true）は
	//   ・攻撃しない（enemyTick が enemyAttack を飛ばす。体当たりの予告も tickSlam が
	//     解決時に `e.hidden` を見て空振りにする＝隠れる直前に立った予告が刺さらない）
	//   ・こちらの攻撃も通らない（combat.js dealDamageToEnemy が無効化）
	// 追跡（enemyChase）だけは隠れ中も続く＝「潜って迷い寄る」（§19-8-A）。
	// ∴ 出ている数秒だけが殴れる窓＝リズム戦闘。
	// style は見た目の種別（'water' 潜行／'burrow' 地中／'air' 滞空）＝CSS が
	// `.char-abs.hiding.hide-<style>` で水面の波紋・土煙・影に描き分ける。
	// 時間は gameNow()（論理時間）基準なのでテストから step() で決定論的に再現できる。
	// 初期状態は「隠れ」＝タイル名（潜み鮫・地中蟲）どおり見えない所から現れる。
	// style は見た目の種別（'water' 潜行／'burrow' 地中／'air' 滞空／'warp' 瞬間移動＝k-8）。
	const HIDE_STYLES = ['water', 'burrow', 'air', 'warp'];

	function tickHide(e, meta, now) {
		const cfg = resolveHide(e, meta);
		if (!cfg) return;
		const hiddenMs = cfg.hiddenMs ?? 2000;
		const shownMs  = cfg.shownMs  ?? 1200;
		const style    = cfg.style ?? 'water';
		if (e._hideUntil === undefined) {
			e.hidden = true;
			e._hideUntil = now + hiddenMs;
			applyHideClass(e, style);
			return;
		}
		if (now < e._hideUntil) return;
		e.hidden = !e.hidden;
		e._hideUntil = now + (e.hidden ? hiddenMs : shownMs);
		applyHideClass(e, style);
		// 浮上した瞬間だけ SE を鳴らす（cfg.emergeSound・省略時は無音＝既存の敵は変わらない）。
		// ⚠️ 潜る側では鳴らさない＝プレイヤーが耳で知りたいのは「出た（殴れる／殴られる）」の方。
		//   `burrowAmbush` は**画面外の背後にも出る**∴音が唯一の予告になる。
		if (!e.hidden && cfg.emergeSound) playSound(cfg.emergeSound);
	}

	// 隠れ状態を見た目に反映（半透明＋波紋/土煙は CSS の .char-abs.hiding が担当）。
	// DOM は charLayerEl 経由でだけ触る（getCharLayerEl() が null の環境＝DOM 無しの
	// ユニットテストでも enemyTick が動くようにするため）。
	// 敵 id は "4,5" のような座標文字列なので querySelector（CSS セレクタ）は使えない。
	function applyHideClass(e, style) {
		const layer = getCharLayerEl();
		const el = layer?.ownerDocument?.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		el.classList.toggle('hiding', !!e.hidden);
		for (const s of HIDE_STYLES) el.classList.toggle(`hide-${s}`, !!e.hidden && s === style);
	}

	// 隠れの切り替え（値が変わったときだけ見た目を触る）。タイマー駆動の tickHide と
	// 行動駆動の tickLeap（跳躍蜘蛛）が同じ無敵窓を共有するための出入口。
	function setEnemyHidden(e, hidden, style) {
		if (!!e.hidden === !!hidden) return;
		e.hidden = !!hidden;
		applyHideClass(e, style);
	}

	// ── Phase 5.5k k-8: 瞬間移動（術士）───────────────────────────
	// meta.blink = { shownMs, goneMs, castDelayMs, range, style }
	// 「歩かない敵」（speed 0）に移動手段として瞬間移動だけを与える3拍の状態機械：
	//   shown … 姿がある＝殴れる窓。この間だけ魔弾（attack.type='magicBolt'＝挙動は
	//           stone と同じ任意角の投擲物・絵だけ藍＋金）を撃つ
	//   gone  … 消える＝無敵（e.hidden＝combat.js dealDamageToEnemy が無効化）・攻撃もしない。
	//           tickHide と同じ `setEnemyHidden` を通る＝無敵窓の出入口は1か所
	//   出現  … プレイヤーから range セル離れたカーディナルのセルへ跳ぶ → 向き直る →
	//           castDelayMs だけ硬直（＝詠唱の予告）→ shown へ戻る
	// 戻り値：true ならこの tick の通常移動/攻撃を呼び出し側がスキップする（gone の間）。
	//
	// ⚠️ 出現先は**4方向からランダムに選ぶ**（2026-08-18 ユーザー指摘＝当初は出現回数で
	//    「北→東→南→西」と巡回させていたが、次の出現位置が完全に読めて簡単すぎた）。
	//    ただし**直前と同じ方向は候補から外す**＝毎回3択。同じセルに2回続けて出ると
	//    「跳んでいない＝バグ」に見え、読めない位置に出るという狙いも半減する。
	// ⚠️ 出現時に `e._attackTimes` を空にする＝「出現したら必ず1発撃つ」を保証する
	//    （前の出現で撃った時刻がクールダウンに残っていると、出現しても撃たない回が出る）。
	//    代わりに castDelayMs の硬直を置く＝出た瞬間に弾が飛ぶ理不尽を作らない
	//    （k-7.5「すべての攻撃はモーションを持つ」と同じ趣旨＝予告のある遠隔攻撃）。
	// ⚠️ 4方向すべて塞がっていたら**その場で出現する**（跳ばない）＝閉所で消え続けて
	//    永久に無敵、という状態を作らない。
	const BLINK_DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];   // 北・東・南・西（この順に意味はない）

	// 出現先＝プレイヤーから range セル離れたカーディナルのセル。
	// 直前と違う方向をランダム順に試し、全部塞がっていたら最後に直前の方向も試す
	// （＝「塞がれていると跳ばない」より「同じ方向に連続で跳ぶ」方が閉所での無敵を作らない）。
	function pickBlinkCell(e, cfg) {
		const player = getPlayer();
		if (!player) return null;
		const d  = cfg.range ?? 3;
		const pr = toTileRow(player.y), pc = toTileCol(player.x);
		const prev  = e._blinkDir ?? -1;
		const order = BLINK_DIRS.map((_, i) => i).filter(i => i !== prev);
		for (let i = order.length - 1; i > 0; i--) {          // Fisher-Yates
			const j = Math.floor(Math.random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		if (prev >= 0) order.push(prev);
		// 0d-2.5 (3): 出現先は「プレイヤーから d セル空けて **body を置く**」＝北/西へ出るときは
		// 体の幅ぶん（w-1 / h-1）だけ余分に下げる。左上をそのまま pr±d に置くと 2×2 では
		// 北/西の出現だけプレイヤーに 1 セル近い（＝出る方向で間合いが変わる）。
		// ⚠️ セルは整数∴「中心を合わせる」ではなく「**手前の端**を d セル離す」で対称にする。
		const backW = (e.w ?? 1) - 1, backH = (e.h ?? 1) - 1;
		for (const i of order) {
			const [dr, dc] = BLINK_DIRS[i];
			const ny = pr + dr * d + (dr < 0 ? -backH : 0);
			const nx = pc + dc * d + (dc < 0 ? -backW : 0);
			if (isPassableForEnemy(ny, nx, e)) { e._blinkDir = i; return [ny, nx]; }
		}
		return null;
	}

	function tickBlink(e, meta, now) {
		const cfg = meta?.blink;
		if (!cfg) return false;
		const shownMs     = cfg.shownMs     ?? 1440;
		const goneMs      = cfg.goneMs      ?? 720;
		const castDelayMs = cfg.castDelayMs ?? 360;
		const style       = cfg.style       ?? 'warp';
		if (!e._blinkPhase) {
			// 初期は「姿がある」＝置いた場所に立っている（消えて始まる tickHide とは逆＝
			// プレイヤーが最初に見るのは術士そのもの。消えるのは1周期目の終わり）。
			e._blinkPhase = 'shown';
			e._blinkUntil = now + shownMs;
			e._blinkCount = 0;
			return false;
		}
		if (e._blinkPhase === 'shown') {
			if (now < e._blinkUntil) return false;    // 姿がある間は通常の攻撃処理に任せる
			e._blinkPhase = 'gone';
			e._blinkUntil = now + goneMs;
			setEnemyHidden(e, true, style);
			return true;
		}
		// gone
		if (now < e._blinkUntil) return true;
		const dest = pickBlinkCell(e, cfg);
		if (dest) {
			e.y = dest[0]; e.x = dest[1];
			moveCharEl(`enemy-${e.id}`, e.x, e.y);
		}
		e._blinkPhase = 'shown';
		e._blinkUntil = now + shownMs;
		e._blinkCount = (e._blinkCount ?? 0) + 1;
		setEnemyHidden(e, false, style);
		// 出現したらプレイヤーを向く（speed 0 ∴ enemyChase は向きを更新しない＝
		// 向きの持ち主は blink 側になる）。
		const player = getPlayer();
		if (player) {
			const dx = player.x - e.x, dy = player.y - e.y;
			if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) {
				e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
			}
		}
		// 出現＝詠唱の始まり（クールダウンを畳んで必ず1発撃つ）。
		// ⚠️ 2026-08-18 実測：今の数値（cooldown 1200・周期 18 tick）ではこの行を消しても
		//    観測差が出ない（自然なクールダウンが同じ tick に落ちる）＝**保険の行**。
		//    cooldown を伸ばすと「出現しても一度も撃たない回」が出るのを防ぐ。
		e._attackTimes = {};
		e._freezeUntil = now + castDelayMs;        // 詠唱の間は動かない・撃たない＝反応の猶予
		// Phase 5.5k k-8b: 詠唱の窓を絵に出すための印（_freezeUntil とは別に持つ＝硬直は
		// 被弾やガードでも立つ汎用の窓∴それに絵を結ぶと「殴られて固まった」でも詠唱に見える）。
		e._castUntil = now + castDelayMs;
		playSound('appear');
		return true;
	}

	// ── Phase 5.5k k-3: 跳躍（跳躍蜘蛛）─────────────────────────
	// meta.leap = { windupMs, cells, airSpeed, cooldownMs, minRange, maxRange, style }
	// 地上では鈍足な敵に「跳んで間合いを詰める」手段を与える4拍の状態機械：
	//   ground  … 通常の（鈍い）接近。間合いが minRange〜maxRange に入ると溜めへ
	//   windup  … 溜め＝動かない・攻撃しない予告の窓（**まだ隠れていない＝殴れる**）
	//   air     … 滞空＝当たり判定が消える（隠れ＝無敵・攻撃なし＝体当たりも空振り）。跳ぶ方向は
	//             溜めで確定したカーディナル1方向∴プレイヤーは軸から外れて避けられる
	//   recover … 着地硬直＝動かない・攻撃しない（**隠れが解ける＝プレイヤーの反撃の窓**）
	// 戻り値：true ならこの tick の通常移動/攻撃を呼び出し側がスキップする。
	// 滞空中の移動は e.accum（速度）を通さない＝跳躍の速さは leap.airSpeed が決める。
	function tickLeap(e, meta, now) {
		const cfg = meta?.leap;
		if (!cfg) return false;
		const windupMs   = cfg.windupMs   ?? 360;
		const cells      = cfg.cells      ?? 3;
		const airSpeed   = cfg.airSpeed   ?? 1.0;
		const cooldownMs = cfg.cooldownMs ?? 1000;
		const minRange   = cfg.minRange   ?? 1.8;
		const maxRange   = cfg.maxRange   ?? 6.0;
		const style      = cfg.style      ?? 'air';
		if (!e._leapPhase) e._leapPhase = 'ground';

		if (e._leapPhase === 'air') {
			const [sy, sx] = e._leapVec ?? [0, 0];
			const steps = Math.max(1, Math.round(airSpeed / MOVE_STEP));
			let moved = 0;
			for (let k = 0; k < steps && e._leapLeft > 0; k++) {
				const ny = e.y + sy * MOVE_STEP, nx = e.x + sx * MOVE_STEP;
				// 跳んだ先が通れない（壁・水）なら、そこで力尽きて落ちる＝硬直へ入る
				if (!isPassableForEnemy(ny, nx, e)) { e._leapLeft = 0; break; }
				e.y = ny; e.x = nx; e._leapLeft -= MOVE_STEP; moved++;
			}
			if (moved) moveCharEl(`enemy-${e.id}`, e.x, e.y);
			if (e._leapLeft <= 0) {
				e._leapPhase = 'recover';
				e._leapUntil = now + cooldownMs;
				setEnemyHidden(e, false, style);
			}
			return true;
		}
		if (e._leapPhase === 'recover') {
			if (now < e._leapUntil) return true;
			e._leapPhase = 'ground';
			return false;
		}
		if (e._leapPhase === 'windup') {
			if (now < e._leapUntil) return true;
			e._leapPhase = 'air';
			e._leapLeft  = cells;
			setEnemyHidden(e, true, style);
			return true;
		}
		const player = getPlayer();
		// 0d-2.5 (1): 発動距離は **body の端から**測る（左上からだと 2×2 は西/北から密着した
		// ときだけ minRange を超える＝「密着なのに 0 セル跳んで無敵窓だけ得る」が出る）。
		// 向きの決定は中心から（左上だと 2×2 で軸の選び方が 0.5 セル偏る）。
		const { cx, cy } = enemyCellCenter(e);
		const dx = player.x - cx, dy = player.y - cy;
		const dist = enemyEdgeDist(e, player.x, player.y);
		// 密着（minRange 未満）では跳ばない＝すり抜けるだけになる。遠すぎ（maxRange 超）
		// でも跳ばない＝届かない跳躍で隙だけ晒すのは敵として不自然。
		if (dist < minRange || dist > maxRange) return false;
		const vertical = Math.abs(dy) >= Math.abs(dx);
		e._leapVec = vertical ? [Math.sign(dy) || 1, 0] : [0, Math.sign(dx) || 1];
		e.dir = vertical ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
		e._leapPhase = 'windup';
		e._leapUntil = now + windupMs;
		return true;
	}

	// ── Phase 5.5k k-9: 直線突進＋壁で気絶（突進猪）──────────────────
	// meta.dash = { windupMs, speed, maxCells, alignTol, hitRange, minRange, maxRange,
	//               stunMs, cooldownMs }
	// 体当たり（slam）の強化版＝**間合いの外から一直線に走って来る**3拍の状態機械：
	//   idle    … 通常の（鈍い）接近。プレイヤーが自分の行/列（直交ずれ alignTol 以内）の
	//              minRange〜maxRange に入ると溜めへ
	//   windup  … 溜め＝動かない・攻撃しない予告の窓（**隠れない＝殴れる**）。突進する方向は
	//              ここで確定するカーディナル1方向∴プレイヤーは軸から外れて避けられる
	//   run     … 突進＝speed セル/tick で直進。終わり方は3通り：
	//              ① プレイヤーに接触 … 体当たりのダメージ（＋meta.inflict）→ 硬直。**気絶しない**
	//              ② 地形に激突     … stunMs の気絶（e.stunUntil＝enemyTick が全行動を止める）
	//                                 ＝**プレイヤーの反撃の窓**（PLAN 名簿「そこが好機」）
	//              ③ maxCells 走り切る … 空振り → 硬直
	//   recover … 硬直（気絶の後もここを通る）＝cooldownMs の間は次の突進を始めない
	// 戻り値：true ならこの tick の通常移動/攻撃を呼び出し側がスキップする。
	//
	// ⚠️ **1 tick を細かい歩幅（MOVE_STEP）に割って進める**＝速度を上げても当たり判定と
	//    壁判定を飛び越さない（[[blade-speed-up-needs-interpolation]]・k-6 の投擲物と同じ話）。
	// ⚠️ **接触の判定を壁判定より先に置く**。重なり禁止（k-7.5 決定①）でプレイヤーは
	//    「通れないもの」になっている∴壁判定を先にすると**立っているプレイヤーが壁の代わりに
	//    なって敵が気絶する**＝避けなかった側がご褒美をもらう逆の設計になる。
	//    進めない理由がプレイヤーだったときも（判定の取りこぼし対策に）接触として扱う。

	// （tickDash が使う当たり判定。本体はこの下）
	// 突進の当たり判定。**体当たり（slamReachHit）を流用してはいけない**（2026-08-18 実測）：
	// slam の間合いは向きを持たない十字＝「主軸 ≤ range・直交 ≤ 0.8」を**両軸それぞれで**見る∴
	// 軸から1セル外れたプレイヤーの横（前方 0.5・横 1.0）を走り抜けるとき、縦軸の腕で当たってしまう
	// ＝**避けたのに轢かれる**（k-9 のプレイヤーの答えそのものが消える）。
	// ∴突進は「走っている軸の前方だけ」に当たる：進行方向の距離が 0〜hitRange、
	// その軸からの直交ずれが alignTol 以内（＝突進が始まる車線＝当たる車線）。
	// 大型敵（w×h）は占有範囲の分だけ広げる（slamReachHit と同じ中心の取り方）。
	function dashReachHit(e, player, vec, hitRange, alignTol) {
		const { cx, cy } = enemyCellCenter(e);
		const { halfW, halfH } = enemyHalf(e);
		const dx = player.x - cx;
		const dy = player.y - cy;
		const [sy, sx] = vec ?? [0, 0];
		const horizontal = sx !== 0;
		const along     = horizontal ? dx * sx : dy * sy;      // 進行方向の距離（後ろは負）
		const off       = Math.abs(horizontal ? dy : dx);      // 走行軸からの直交ずれ
		const halfAlong = horizontal ? halfW : halfH;
		const halfOff   = horizontal ? halfH : halfW;
		if (along < -halfAlong) return false;                  // すでに通り過ぎた＝当たらない
		return along <= hitRange + halfAlong && off <= alignTol + halfOff;
	}

	function tickDash(e, meta, now) {
		// 0d-3（2体目 A）: 突進の設定は**フェーズで後から生える**ことがある∴ここは `meta.dash` を
		// 直接読まず `resolveDash`（e._dash 優先）を通す。enemyTick 側の2つのゲートも同じ。
		const cfg = resolveDash(e, meta);
		if (!cfg) return false;
		const windupMs   = cfg.windupMs   ?? 360;
		const speed      = cfg.speed      ?? 1.5;
		const maxCells   = cfg.maxCells   ?? 10;
		const alignTol   = cfg.alignTol   ?? SLAM_PERP;
		const hitRange   = cfg.hitRange   ?? 1.0;
		const minRange   = cfg.minRange   ?? 2.0;
		const maxRange   = cfg.maxRange   ?? 9.0;
		const stunMs     = cfg.stunMs     ?? 1440;
		const cooldownMs = cfg.cooldownMs ?? 1200;
		if (!e._dashPhase) e._dashPhase = 'idle';

		if (e._dashPhase === 'run') {
			const [sy, sx] = e._dashVec ?? [0, 0];
			const steps  = Math.max(1, Math.round(speed / MOVE_STEP));
			const player = getPlayer();
			const ew = e.w ?? 1, eh = e.h ?? 1;
			let moved = 0, outcome = null;
			for (let k = 0; k < steps && e._dashLeft > 0; k++) {
				// ① 接触（体当たり）が先＝プレイヤーは壁ではない。判定は**走っている軸の前方だけ**
				//    （dashReachHit＝十字の slam を流用すると軸から外れた避けが無効になる）
				if (player && dashReachHit(e, player, [sy, sx], hitRange, alignTol)) { outcome = 'hit'; break; }
				const ny = e.y + sy * MOVE_STEP, nx = e.x + sx * MOVE_STEP;
				if (!isPassableForEnemy(ny, nx, e)) {
					// ② 進めない理由がプレイヤーなら接触・地形なら激突
					const onPlayer = player && overlapArea(nx, ny, ew, eh, player.x, player.y, 1, 1) > 0;
					outcome = onPlayer ? 'hit' : 'wall';
					break;
				}
				e.y = ny; e.x = nx; e._dashLeft -= MOVE_STEP; moved++;
			}
			if (moved) moveCharEl(`enemy-${e.id}`, e.x, e.y);
			if (outcome === 'hit') {
				// 体当たりと同じダメージ（e.atk を先に見る＝分裂の小型は親より弱い・k-5a の作法）。
				// 盾では防げない（k-7.5 決定④＝体当たり系の答えは「下がる」だけ）。
				takeDamage(e.atk ?? meta?.atk ?? 1);
				if (meta?.inflict) inflictDebuff?.(meta);
				markAttack(e, meta, 0, now);   // クールダウン記録は攻撃の共通後処理に通す
				endDash(e, now, cooldownMs);
				return true;
			}
			if (outcome === 'wall') {
				// 気絶＝ブーメランのスタンと同じ窓（enemyTick が先頭で全行動を止める）。
				e.stunUntil = now + stunMs;
				showDashStun(e, stunMs);   // 印の長さ＝気絶の長さ
				playSound('doorLock');
				endDash(e, now, stunMs + cooldownMs);   // 気絶が明けてから硬直ぶん待つ
				return true;
			}
			if (e._dashLeft <= 0) endDash(e, now, cooldownMs);   // ③ 走り切った＝空振り
			return true;
		}
		if (e._dashPhase === 'recover') {
			if (now < e._dashUntil) return true;
			e._dashPhase = 'idle';
			return false;
		}
		if (e._dashPhase === 'windup') {
			if (now < e._dashUntil) return true;
			e._dashPhase = 'run';
			e._dashLeft  = maxCells;
			return true;
		}
		// idle ＝突進を始めるかどうかの判断
		if (e._slamAt != null) return false;      // 体当たりの予告中は突進を始めない（予告は1つ）
		if (e._swingAt != null) return false;     // 剣の予告中も始めない（0d-2.6・上と同じ理由）
		if (e._breathAt != null) return false;    // ブレスの予告中も始めない（0d-3・予告は常に1つ）
		const player = getPlayer();
		if (!player) return false;
		// 0d-2.5 (2): 車線も距離も **中心から** 測り、当たり判定（dashReachHit）と同じだけ
		// body の半サイズで広げる。左上基準のままだと「轢ける車線」より「突進する車線」が
		// 狭い＝**自分の下半分の前に立つプレイヤーには突進して来ない**（0d-2 で実測）。
		const { cx, cy } = enemyCellCenter(e);
		const { halfW, halfH } = enemyHalf(e);
		const dx = player.x - cx, dy = player.y - cy;
		const adx = Math.abs(dx), ady = Math.abs(dy);
		const vertical = ady >= adx;
		const along = vertical ? ady : adx;       // 突進する軸方向の距離
		const off   = vertical ? adx : ady;       // その軸からの直交ずれ
		const halfAlong = vertical ? halfH : halfW;
		const halfOff   = vertical ? halfW : halfH;
		// 行/列に入っていない＝突進しない（プレイヤーの避け方＝軸から1セル外れる）
		if (off > alignTol + halfOff) return false;
		// 距離の上下限は body の端から（＝密着では走らない・届かない距離では走らない）
		if (along - halfAlong < minRange || along - halfAlong > maxRange) return false;
		e._dashVec = vertical ? [Math.sign(dy) || 1, 0] : [0, Math.sign(dx) || 1];
		e.dir = vertical ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
		e._dashPhase = 'windup';
		e._dashUntil = now + windupMs;
		// 予告は絵（.dash-windup ＋ Windup ポーズ）と音の2経路で出す＝画面の端で溜められても
		// 「来る」と分かる。激突音（doorLock）とは別の音（sounds.js dashWindup のコメント）。
		playSound('dashWindup');
		return true;
	}

	// 突進を終える（当たり／激突／走り切り の共通後処理）。
	function endDash(e, now, waitMs) {
		e._dashPhase = 'recover';
		e._dashUntil = now + waitMs;
		e._dashLeft  = 0;
	}

	// 突進の中断（スタン＝ブーメラン等で止められたとき）。溜めも走行も無かったことにする
	// ＝「止めたのに突進が続く」を作らない（体当たりの予告をスタンで消すのと同じ扱い）。
	// ⚠️ 硬直（recover）は消さない＝壁に激突した気絶はこの硬直と**同時に**立っている
	//    （endDash(stunMs + cooldownMs)）∴ここで畳むと「気絶が明けた次の tick に即・再突進」
	//    になり、反撃の窓の直後にもう一度轢かれる。
	function cancelDash(e) {
		if (e._dashPhase == null || e._dashPhase === 'idle' || e._dashPhase === 'recover') return;
		e._dashPhase = 'idle';
		e._dashUntil = 0;
		e._dashLeft  = 0;
	}

	// 溜めの見た目（board.css `.dash-windup`＝前後に細かく揺れる＝走り出す前の足踏み）。
	// slam の拡大縮小（`.slam-windup`）とは別の形にする＝**どちらの予告なのかが絵で分かる**
	// （同じ敵が近距離では体当たり・遠距離では突進を出す∴避け方が違う）。
	function syncDashMotion(e) {
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		el.classList.toggle('dash-windup', e._dashPhase === 'windup');
	}

	// 壁に激突した印（⭐）＝ブーメランのスタンと同じ `.stun-burst`（projectile.js showStunEffect
	// と同じ形）。気絶は「殴り放題の窓」＝プレイヤーが気づかないと機構が死ぬ（GUIDE §6-1）。
	// ⚠️ `stunMs` ＝**その気絶そのものの長さ**を渡す＝印が出ている間＝気絶している間になる
	//    （0d-3 の U で実画面で見つけた欠陥＝墜落の気絶 1800ms に対し印が固定 1.5s で先に
	//    消え、まだ無抵抗なのに終わったように見えた）。CSS 側は `--stun-burst-ms` を読むだけ。
	function showDashStun(e, stunMs = STUN_BURST_MS) {
		const layer = getCharLayerEl();
		if (!layer) return;
		const cellPx = getCellPx();
		const { cx, cy } = enemyCenter(e);
		const el = layer.ownerDocument.createElement('div');
		el.className = 'stun-burst';
		el.textContent = '⭐';
		el.style.left = `${cx * cellPx}px`;
		el.style.top  = `${cy * cellPx}px`;
		el.style.setProperty('--stun-burst-ms', `${stunMs}ms`);
		layer.appendChild(el);
		setTimeout(() => el.remove(), stunMs);   // 消える瞬間＝気絶が明ける瞬間
	}

	// ── Phase 8-4 (4) 0d-3（7体目 G 岩のゴーレム）: 慣性で動く巨体 ──────────
	// meta.momentum = { accel, maxSpeed, friction, heavySpeed, ramRange, ramAtk, crashStunMs }
	// 他の 6 体と違うのは**移動アルゴリズムそのもの**＝プレイヤーの「位置」へ寄るのではなく、
	// 自分の**速度ベクトル**を毎 tick 少しだけプレイヤーの方へ曲げる：
	//   ・accel    … 毎 tick 速度へ足す量（プレイヤーへの単位ベクトル方向）
	//   ・friction … 毎 tick 掛ける減衰（× (1 - friction)）。終端速度＝accel / friction
	//   ・maxSpeed … 上限。`accel / friction === maxSpeed` に揃えている＝上限へ乗るまで
	//                10 tick ≒1.2 秒かかる∴**止まるのにも曲がるのにも時間がかかる**
	//                （これが機構の本体＝プレイヤーは横へ避けて空振りを作れる）
	//   ・heavySpeed … ①体当たりが成立する ②壁で自壊する ③土煙が出る の**同じ1つのしきい値**
	//                ＝プレイヤーが覚える規則を1本にする（「土煙が出た岩は避けて壁へ誘う」）
	// ⚠️ 状態機械を持たない（状態は速度ベクトル1つだけ）＝「相を忘れて宙吊り」の欠陥が
	//    構造的に存在しない（0d-2.7 の跳躍・0d-3 の滞空で踏んだ罠がここには無い）。
	// ⚠️ 速度は `resolveEnemySpeed`（meta.speed / e.speed）を**読まない**＝この敵の速さは
	//    momentum の3つの数だけが決める（`phases[].speedMultiplier` は効かない∴書かない）。
	function resolveMomentum(e, meta) {
		return e?._momentum !== undefined ? e._momentum : meta?.momentum;
	}

	// 今の速さ（ノルム）。体当たりの成立・壁での自壊・土煙・テストが**同じ1つの数**を読む。
	function momentumSpeed(e) {
		return Math.hypot(e._momVx ?? 0, e._momVy ?? 0);
	}

	// 惰性を捨てる（スタン・攻撃硬直・構えの tick に呼ぶ＝`cancelDash` と同じ列）。
	// ⚠️ 「殴り返せる窓では体が本当に止まっている」ことがこの敵の唯一の攻略法∴硬直中に
	//    滑ると窓が窓でなくなる（追いかけながら斬ることになる・GUIDE §7-8）。
	function cancelMomentum(e) {
		e._momVx = 0;
		e._momVy = 0;
	}

	// 壁への激突＝自壊。突進猪（tickDash の 'wall'）と**同じ道具立て**を使う＝気絶の意味を
	// 1つに保つ：`e.stunUntil`（enemyTick が先頭で全行動を止める窓）＋ ⭐ の印（長さ＝気絶の
	// 長さ）＋ 音（既存 `doorLock`＝「重いものが止まった」）。
	// ⚠️ 弱点の ×3 はこの窓には**乗らない**（`weakness.window: 'recover'` ＝攻撃硬直だけ）。
	//    ここに乗せると crashStunMs 1800ms ＝剣 6 振り ×3 ＝ 60 ダメージ＝HP 60 が即死になる。
	function crashMomentum(e, now, cfg) {
		const stunMs = cfg?.crashStunMs ?? 1800;
		cancelMomentum(e);
		e.stunUntil = now + stunMs;
		e._momCrashes = (e._momCrashes ?? 0) + 1;
		showDashStun(e, stunMs);   // 印の長さ＝気絶の長さ
		playSound('doorLock');
	}

	// 慣性の1 tick。呼ぶのは enemyTick の移動ゲート（＝硬直・構え・予告の tick には来ない）。
	function enemyMomentumSlide(e, meta, cfg, now) {
		if (!cfg) return;
		const accel    = cfg.accel      ?? 0.03;
		const maxSpeed = cfg.maxSpeed   ?? 0.30;
		const friction = cfg.friction   ?? 0.10;
		const heavy    = cfg.heavySpeed ?? 0.18;
		const ramRange = cfg.ramRange   ?? 1.0;
		const ew = e.w ?? 1, eh = e.h ?? 1;
		const player = getPlayer();
		// ① 先に減衰（＝惰性が抜ける分）を掛ける。**順序が意味を持つ**＝先に減衰させてから
		//    加速を足すと終端速度がちょうど `accel / friction`（＝素の設定では maxSpeed）に
		//    なる∴「上限は加速と減衰から導かれる数」で、上限の数だけを別に信じなくて済む
		//    （逆順だと終端が accel×(1-friction)/friction ＝上限に**永久に届かない**）。
		e._momVx = (e._momVx ?? 0) * (1 - friction);
		e._momVy = (e._momVy ?? 0) * (1 - friction);
		// ② プレイヤーへの単位ベクトルへ accel を足す（＝位置ではなく**速度**を追う）。
		//    向きは**中心から**測る（左上のままだと 2×2 は軸が 0.5 セル偏る＝0d-2.5 と同じ話）。
		if (player) {
			const { cx, cy } = enemyCellCenter(e);
			const dx = player.x - cx, dy = player.y - cy;
			const d = Math.hypot(dx, dy);
			if (d > 0.01) {
				e._momVx = (e._momVx ?? 0) + (dx / d) * accel;
				e._momVy = (e._momVy ?? 0) + (dy / d) * accel;
			}
		}
		// ③ 上限（後半の相のように `accel / friction` が上限を上回る設定では、ここが効く）
		const sp0 = momentumSpeed(e);
		if (sp0 > maxSpeed) {
			const k = maxSpeed / sp0;
			e._momVx *= k; e._momVy *= k;
		}
		// 絵の向きは持たない（rockGolemD/R/L/U は同じ1枚のエイリアス）が、他の判定が読む
		// `e.dir` は進行方向に合わせる（`enemyChase` が移動で向き直るのと同じ扱い）。
		if (momentumSpeed(e) > 0.01) {
			e.dir = Math.abs(e._momVy) >= Math.abs(e._momVx)
				? (e._momVy > 0 ? 'down' : 'up')
				: (e._momVx > 0 ? 'right' : 'left');
		}
		// 激突するのは**進行方向の主軸が塞がれたとき**だけ＝壁を擦って通り過ぎただけでは
		// 崩れない（そうしないと部屋の隅を回るたびに勝手に自壊する＝誘い込む面白さが消える）。
		const majorX = Math.abs(e._momVx) > Math.abs(e._momVy);
		// 体当たり（＝プレイヤーを轢く）の後処理。**2箇所から呼ぶ**＝「間合いに入った」と
		// 「プレイヤーに行き止められた」の両方が同じ1つの結果になる（下の ⑥/⑦ を参照）。
		const ramPlayer = () => {
			takeDamage(cfg.ramAtk ?? e.atk ?? meta?.atk ?? 1);
			if (meta?.inflict) inflictDebuff?.(meta);
			// クールダウン記録は攻撃の共通後処理に通す＝**体当たりの直後は剣が出ない**、
			// かつ攻撃硬直（`attackFreezeMs`）が立つ＝弱点 ×3 の窓もここで開く
			// （＝轢かれた側に反撃の権利が渡る。弱点の規則は「硬直の窓」の1本に保つ）。
			markAttack(e, meta, 0, now);
			e._momRams = (e._momRams ?? 0) + 1;
			cancelMomentum(e);
		};
		// ④ 1 tick を MOVE_STEP 以下に刻んで**連続座標のまま**進める（グリッドに丸めない＝
		//    GUIDE §7-11）。刻むのは速くしても当たり判定と壁判定を飛び越さないため
		//    （[[blade-speed-up-needs-interpolation]]・tickDash と同じ作法）。
		const steps = Math.max(1, Math.ceil(momentumSpeed(e) / MOVE_STEP));
		let moved = false;
		for (let k = 0; k < steps; k++) {
			const sp = momentumSpeed(e);
			if (sp <= 0) break;
			// ⑥ 体当たり＝**進む前に見る**（プレイヤーは壁ではない＝tickDash と同じ順序）。
			//    速さが heavySpeed 未満のときは当たらない＝「土煙が出ていない岩は触れても痛くない」。
			//    当たったら速度を捨てる＝ぶつかった巨体はそこで止まる。
			if (player && sp >= heavy && enemyEdgeDist(e, player.x, player.y) <= ramRange) {
				ramPlayer();
				break;
			}
			// ⑤ 軸ごとに進める（主軸を先に試す）
			let crashed = false, rammed = false;
			for (const axisX of (majorX ? [true, false] : [false, true])) {
				const v = axisX ? e._momVx : e._momVy;
				if (v === 0) continue;
				const step = v / steps;
				const ny = axisX ? e.y : e.y + step;
				const nx = axisX ? e.x + step : e.x;
				if (isPassableForEnemy(ny, nx, e)) { e.y = ny; e.x = nx; moved = true; continue; }
				// ⑦ 塞いだのが**プレイヤーの体**なら、それは壁ではない＝轢く（自壊しない）。
				// ⚠️ これが無いと機構が**裏返る**：`isPassableForEnemy` はプレイヤーと重なる手前
				//    （端の距離 1.0）で必ず止める∴ ⑥ の間合い（ramRange 1.0）は刻みの端数の分だけ
				//    永久に届かず（実測 1.02）、代わりに下の「主軸が塞がれた＝激突」が
				//    プレイヤーの体に対して発火していた＝**棒立ちのプレイヤーが無傷で
				//    1.8 秒の気絶を取れる**（0d-3 G の初回テストで実測）。
				//    ∴プレイヤーが行き止めた場合だけを先に分岐させ、⑥ と同じ1つの結果に落とす。
				//    重なり判定は passable.js のプレイヤー規則と同じ AABB（hitbox.js が単一の真実）。
				if (player && aabbOverlap(nx, ny, ew, eh, player.x, player.y, 1, 1)) {
					if (sp >= heavy) { ramPlayer(); rammed = true; break; }
					// 遅いときは押し合いにならずその軸だけ 0＝「土煙の出ていない岩は痛くない」
					if (axisX) e._momVx = 0; else e._momVy = 0;
					continue;
				}
				// 半端な座標（0.5 の格子から外れた位置）だと 2×2 は 3 タイルを塞ぐ＝2 マス幅の
				// 通路の口へ入れない∴**直交軸を格子へ寄せて1回だけ試す**（体をまっすぐにして
				// 通す）。これが無いと巨体が通路の口で永久に詰まる＝ボスへ到達できなくなる。
				const sy = axisX ? Math.round(e.y * 2) / 2 : ny;
				const sx = axisX ? nx : Math.round(e.x * 2) / 2;
				if ((sy !== ny || sx !== nx) && isPassableForEnemy(sy, sx, e)) {
					e.y = sy; e.x = sx; moved = true; continue;
				}
				// 塞がれた。主軸を速さ heavySpeed 以上で塞がれたら激突（自壊）、
				// そうでなければ**その軸だけ 0**＝壁に沿って擦る（横向きの惰性は残る）。
				if (axisX === majorX && sp >= heavy) { crashMomentum(e, now, cfg); crashed = true; break; }
				if (axisX) e._momVx = 0; else e._momVy = 0;
			}
			if (crashed || rammed) break;
		}
		if (moved) moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// 土煙（board.css `.momentum-heavy`）＝**今この岩は危ない**の唯一の告知。しきい値は
	// 体当たりが成立する速さ（heavySpeed）と同じ1つの数∴「土煙が出ていない岩に触れても
	// 痛くない」が絵と機構で一致する（GUIDE §6-1）。
	// 音は**越えた瞬間に1回だけ**鳴らす（毎 tick 鳴らすと轟音になる）。激突音（doorLock）とは
	// 別の音＝聞き分けるのは「動き出した（避けろ）」と「止まった（殴れる）」の2つ（GUIDE §7-6）。
	function syncMomentumMotion(e, meta) {
		const cfg = resolveMomentum(e, meta);
		const heavy = cfg?.heavySpeed ?? 0.18;
		const stunned = (e.stunUntil ?? 0) > gameNow();
		const isHeavy = !stunned && momentumSpeed(e) >= heavy;
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (el) el.classList.toggle('momentum-heavy', isHeavy);
		if (isHeavy && !e._momHeavy) playSound('golemRumble');
		e._momHeavy = isHeavy;
	}

	// ── Phase 8-4 (4) 0d-3（8体目 I 沼地の大蝦蟇）: 舌で引き寄せる ─────────────
	// meta.tongue = { castMs, cells, lashSpeed, reelSpeed, holdMs, retractMs,
	//                 cooldownMs, hopCells, hopMs,
	//                 pounceWindupMs, pounceAirMs, pounceRadius, pounceAtk, pounceRecoverMs }
	// 他の7体と違うのは**動くのがプレイヤーの方**＝13体で唯一「自分ではなく相手を動かす」：
	//   ・castMs   … 打つ前の予告（体が膨らむ＝`.tongue-windup`）。この長さの終わりで狙いを固定する
	//                ＝以後**追尾しない**（横へ歩けば空振りする＝避けられる予告・GUIDE §6-1）
	//   ・cells    … 舌の届く帯の外端。帯の内端は**噛みつきの到達距離**（`attacks[]` の sword の
	//                range）＝データに持たない（下の ⚠️）。この帯にプレイヤーが居るときだけ打つ
	//                ＝**帯の外に立つ**が答えの1つになる
	//   ・lashSpeed… 舌が伸びる速さ（セル/tick・当たり判定は MOVE_STEP 以下に刻む）
	//   ・reelSpeed… 引き寄せる速さ。**プレイヤーの歩幅 MOVE_STEP より必ず遅い**＝操作は
	//                一切奪わない（歩けば離れられる＝払うのは時間）。絵の濃さも同じ数を読む
	//   ・holdMs   … 掴んでいられる上限。引き剥がせなくても必ず離される（詰まない保証）
	//   ・pounce*  … 引き寄せた先（＝口元）での**のしかかり**＝盾では防げない唯一の打点。
	//                詳しくは下の「のしかかり（pounce）」の節（2026-09-01 追加）
	//   ・hopCells/hopMs … 帯の**外**に居るときだけ跳ねて寄る速さ（1.07 セル/秒 ≪ プレイヤー
	//                4.17 セル/秒・GUIDE §7-2）＝自分から噛みつきの間合いへは詰めない
	// ⚠️ 舌が出ているあいだ蝦蟇は**1歩も動かず攻撃もしない**（錨＝`tongueBusy` で行動ゲートを
	//    閉じる）∴引かれている時間がそのまま「殴れる窓」になる（G の「硬直で滑らない」と同じ要件）。
	// ⚠️ 速度は `resolveEnemySpeed` を読まない＝`phases[].speedMultiplier` は効かない（∴書かない）。
	// ⚠️ 幾何は**几何中心（enemyCenter）基準の連続座標**で持つ（舌は斜めにも伸びる）。間合いの
	//    判定だけは既存の全機構と同じ `enemyEdgeDist`（セル添字基準）を通す＝到達距離の表
	//    （GUIDE §7-12）が他の攻撃と直接比べられる。
	function resolveTongue(e, meta) {
		return e?._tongue !== undefined ? e._tongue : meta?.tongue;
	}

	// 舌が出ている（＝この tick を専有する）か。相は7つ：
	//   idle → cast → lash → hold →（口元まで引けた）pounce → pounceAir → idle
	//                              →（空振り／引き剥がされた／時間切れ）retract → idle
	// ⚠️ のしかかり（pounce/pounceAir）も busy に含める＝舌は出ていないが**錨は続く**
	//    （沈んでいる蝦蟇が歩いたり噛んだりしない＝溜めの 840ms が殴れる窓になる）。
	function isTongueBusy(e) {
		const p = e?._tonguePhase ?? 'idle';
		return p !== 'idle';
	}

	// 先端がプレイヤーの体（1×1）に触れたと見なす半幅。体の半分（0.5）＋わずかな余裕＝
	// **絵で舌が届いて見えるのに掴めない**を作らない（効果の範囲 ⊇ 判定の範囲・GUIDE §6-1）。
	const TONGUE_GRAB_PAD = 0.55;

	// 中心から body の表面まで（几何座標・向きは単位ベクトル）。斜めでも箱の面で出す。
	function tongueEdgeSpan(e, ux, uy) {
		const w = e.w ?? 1, h = e.h ?? 1;
		let t = Infinity;
		if (Math.abs(ux) > 1e-6) t = Math.min(t, (w / 2) / Math.abs(ux));
		if (Math.abs(uy) > 1e-6) t = Math.min(t, (h / 2) / Math.abs(uy));
		return Number.isFinite(t) ? t : 0;
	}

	// 舌の先端（几何座標）。長さ（`_tongueLen`）は **body の表面から先**の値＝絵とテストと
	// 当たり判定が同じ1つの数を読む。
	function tongueTip(e) {
		const { cx, cy } = enemyCenter(e);
		const ang = e._tongueAng ?? 0;
		const ux = Math.cos(ang), uy = Math.sin(ang);
		const t = tongueEdgeSpan(e, ux, uy) + (e._tongueLen ?? 0);
		return { tx: cx + ux * t, ty: cy + uy * t, ux, uy };
	}

	// 舌が出る**口の位置**（几何座標）＝絵だけが読む基準点。
	// ⚠️ 帯を「body の表面」から描くと絵が体から浮く＝スプライトの体は footprint の内側に
	//    描かれている（2×2 の蝦蟇は各辺 0.2 セルほど内側）∴幾何の表面は絵の輪郭ではない。
	//    しかも表面から描くと出どころが**目の高さ**になり「舌が口から出ていない」ことになる
	//    （実測：`.scratch/toad-mouth.png` で体との隙間と出どころのズレを目視で確認）。
	//    ∴**判定は表面から測ったまま**（`tongueTip`＝`_tongueLen` の単一の真実）で、
	//    絵だけ口元から先端まで引く（絵の先端＝判定の先端∴効果の範囲 ⊇ 判定の範囲は保つ）。
	const TONGUE_MOUTH_DY = 0.3;     // 口の位置＝body の高さに対する中心からの下へのずれ
	function tongueMouth(e) {
		const { cx, cy } = enemyCenter(e);
		return { mx: cx, my: cy + (e.h ?? 1) * TONGUE_MOUTH_DY };
	}

	// 噛みつきの到達距離＝**舌を離す距離**。表（`attacks[]`）から導く＝フェーズで表が
	// 差し替わっても「引き寄せた先で必ず噛める」が保たれる（判定距離＝攻撃到達距離・
	// [[blade-enemy-guard-range-must-match-reach]]／GUIDE §7-12）。
	function tongueBiteRange(e, meta) {
		const list = resolveAttackList(e, meta) ?? [];
		let r = 0;
		for (const a of list) if (a?.type === 'sword') r = Math.max(r, a.range ?? 0);
		return r > 0 ? r : (meta?.attack?.range ?? 1.4);
	}

	// 舌を打つ（＝予告の始まり）。狙いはまだ固定しない（固定するのは castMs の終わり）。
	function castTongue(e, cfg, now) {
		const player = getPlayer();
		e._tonguePhase  = 'cast';
		e._tongueAt     = now + (cfg.castMs ?? 600);
		e._tongueCastMs = cfg.castMs ?? 600;
		e._tongueLen    = 0;
		e._tongueAttached = false;
		if (player) {
			// 打つ前にプレイヤーの方を向く（舌の向きと絵の向きを一致させる＝breatheFire と同じ）
			const { cx, cy } = enemyCellCenter(e);
			const dx = player.x - cx, dy = player.y - cy;
			if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) {
				e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
			}
			const { cx: gcx, cy: gcy } = enemyCenter(e);
			e._tongueAng = Math.atan2((player.y + 0.5) - gcy, (player.x + 0.5) - gcx);
		}
		playSound('tongueCast');
	}

	// 狙いを固定して舌を打ち出す。**この瞬間のプレイヤーの位置**しか見ない＝以後追尾しない。
	function lockTongueAim(e) {
		const player = getPlayer();
		const { cx, cy } = enemyCenter(e);
		const ax = player ? player.x + 0.5 : cx + 1, ay = player ? player.y + 0.5 : cy;
		const dx = ax - cx, dy = ay - cy;
		e._tongueAimX  = player ? player.x : null;
		e._tongueAimY  = player ? player.y : null;
		if (Math.hypot(dx, dy) > 0.01) e._tongueAng = Math.atan2(dy, dx);
		e._tonguePhase = 'lash';
		e._tongueLen   = 0;
		e._tongueAt    = null;
	}

	// 舌が伸びる1 tick。壁で止まり（tilePassable＝炎のブレスと同じ作法）、先端がプレイヤーの
	// 体に触れたら掴む。**MOVE_STEP 以下に刻む**＝速くしても当たり判定を飛び越さない
	// （[[blade-speed-up-needs-interpolation]]）。
	function tickTongueLash(e, cfg, now) {
		const player = getPlayer();
		const cells  = cfg.cells ?? 6;
		const speed  = cfg.lashSpeed ?? 1.2;
		const steps  = Math.max(1, Math.ceil(speed / MOVE_STEP));
		for (let k = 0; k < steps; k++) {
			e._tongueLen = (e._tongueLen ?? 0) + speed / steps;
			const { tx, ty } = tongueTip(e);
			// 壁の向こうへは伸びない（＝遮蔽が意味を持つ）
			if (!tilePassable(Math.floor(ty), Math.floor(tx))) { snapTongue(e, cfg, now); return; }
			if (player
				&& Math.abs((player.x + 0.5) - tx) < TONGUE_GRAB_PAD
				&& Math.abs((player.y + 0.5) - ty) < TONGUE_GRAB_PAD) {
				grabTongue(e, cfg, now);
				return;
			}
			if (e._tongueLen >= cells) { snapTongue(e, cfg, now); return; }
		}
	}

	// 掴んだ（＝結果の音）。ここから holdMs のあいだ引き寄せる＝**蝦蟇は静止した的**。
	function grabTongue(e, cfg, now) {
		e._tonguePhase = 'hold';
		e._tongueAt    = now + (cfg.holdMs ?? 2400);
		e._tongueAttached = true;
		e._tongueGrabs = (e._tongueGrabs ?? 0) + 1;
		playSound('tongueGrab');
		pulse?.('舌に掴まれた！', 900);
	}

	// 空振り／引き剥がされた／時間切れ（＝空振りの音）。舌は retractMs かけて戻る。
	function snapTongue(e, cfg, now) {
		const wasAttached = !!e._tongueAttached;
		e._tonguePhase = 'retract';
		e._tongueAt    = now + (cfg.retractMs ?? 360);
		e._tongueRetractFrom = e._tongueLen ?? 0;
		e._tongueAttached = false;
		e._tongueSnaps = (e._tongueSnaps ?? 0) + 1;
		playSound('tongueSnap');
		if (wasAttached) alignPlayerToGrid(e);
	}

	// 口元まで引き寄せた＝舌を離して**のしかかり**へ渡す（retract を通さない＝引かれた先で
	// 間が空かない）。⚠️ 2026-09-01 までは即 idle にして噛みつき（`attacks[0]`）へ譲っていた＝
	// **その噛みつきは盾で消える**∴「引かれた先で必ず払う」が成立していなかった（下の
	// のしかかりの ⚠️ とユーザー実プレイ報告）。クールダウンの起点も**着地**へ移した
	// ＝1周（打つ→掴む→引く→潰す）が閉じるまでは次の舌を打たない。
	function releaseTongue(e, cfg, now) {
		e._tongueLen   = 0;
		e._tongueAttached = false;
		alignPlayerToGrid(e);
		startPounce(e, cfg, now);
	}

	// ── のしかかり（pounce）＝口元に居る相手を跳んで潰す ───────────────────────────
	// meta.tongue の { pounceWindupMs, pounceAirMs, pounceRadius, pounceAtk, pounceRecoverMs }。
	// ⚠️ 2026-09-01 のユーザー実プレイ報告への対処＝「舌でひきこまれる／ろうそくで火をつける、
	//    これを繰り返すだけでノーダメージで倒せてしまう（攻撃は盾で防御できてしまう）」。
	//    実測で裏取りした（`.scratch/toad-shield-loop.mjs`＝**191 tick ＝22.9 秒で撃破・被弾 0**）。
	//    原因＝I の打点は噛みつき（`sword`）と毒沫（`stone`）の2本しかなく、**どちらも盾が
	//    「向き」だけで消せる**（projectile.js `isShieldBlockingDir`）∴ロウソクで焼くために
	//    蝦蟇を向くことが、そのまま防ぐために向くことになっていた＝完全防御。
	//    ∴**盾では防げない打点**を1つ足す（体当たり `tickSlam`・締め上げ `crushCoil`・
	//    炎のブレス `breatheCone` と同じ扱い＝k-7.5 決定④「盾が効くのは剣攻撃と投擲攻撃だけ」）。
	//    答えは「向き」ではなく **「下がる」** だけ。
	// ⚠️ 新しい機構キーは作らず `tongue` の**相を2つ増やす**（2026-09-01 ユーザー決定）＝
	//    I の型（13体で唯一「相手を動かす」）を保つ／`slam` は `{`（海の主）の候補に空けておく。
	// 規則は1つ＝**口元（端 ≤ 噛みつきの到達距離）に居る相手にのしかかる**。入り口は2つ：
	//   ① 引き寄せの終幕（hold → 口元 → 舌を離す → のしかかり）＝掴まれたら潰される
	//   ② 口元に居座られたとき（idle で打ち終わりの間が明けた tick）
	//      ⚠️ ② が無いと抜け道が残る＝舌は**内端より近い相手には打てない**∴自分から口元へ
	//         踏み込んで盾を構え続ければ一度も掴まれず、報告と同じ完全防御が作れてしまう。
	//         「逃げ切った相手は跳ばれない」（＝掴めたときだけ跳ぶ）は①②とも保たれる。
	// ⚠️ `pounceRadius ≥ 噛みつきの到達距離`（1.6 ≥ 1.4）＝**引き寄せた先は必ず円の中**＝
	//    立ち止まっていれば必ず当たる。逆にすると「引かれた末に空振り」＝引き寄せの見返りが
	//    消える（GUIDE §7-12 の到達距離の表と同じ理屈で、判定距離は攻撃到達距離に合わせる）。
	// ⚠️ 猶予（`pounceWindupMs + pounceAirMs` ＝840ms ＝7 tick ＝歩いて 3.5 セル）は
	//    `pounceRadius − 噛みつきの到達距離`（0.2）を桁で上回る＝予告を見て下がれば必ず避かる
	//    （後半は 660ms ＝2.5 セル ≫ 2.0 − 1.4 ＝0.6）。
	// ⚠️ 跳んでも**蝦蟇は動かない**（その場で沈み・浮き・落ちる）＝跳び先へ体を運ぶと
	//    「自分から噛みつきの間合いへは詰めない」（`tongue` の型）と `TOAD_HOP_KEEP` の床が壊れ、
	//    しかも 2×2 の巨体が相手に貼り付いて離れられなくなる。
	// ⚠️ 相のあいだは `isTongueBusy` が true ＝**錨で固定**（動かない・噛まない）∴予告の 840ms は
	//    そのまま「殴れる窓」でもある（引き寄せている時間と同じ扱い＝GUIDE §7-8）。
	function pounceRadiusOf(cfg) { return cfg.pounceRadius ?? 1.6; }

	function startPounce(e, cfg, now) {
		e._tonguePhase    = 'pounce';
		e._tongueAt       = now + (cfg.pounceWindupMs ?? 480);
		e._tonguePounceMs = cfg.pounceWindupMs ?? 480;   // 絵の長さ（CSS 側に長さを持たせない）
		e._tongueLen      = 0;
		e._tongueAttached = false;
		playSound('toadPounce');
	}

	// 着地＝判定と告知。**盾を通さない**（`isShieldBlockingDir` を呼ばない＝呼べば
	// 報告された完全防御がそのまま戻る）。ダメージは何セル重なっても1回。
	function landPounce(e, meta, cfg, now) {
		const player = getPlayer();
		const r = pounceRadiusOf(cfg);
		e._toadPounces = (e._toadPounces ?? 0) + 1;
		showPounceLandEffect(e, r);
		playSound('toadLand');
		// 着地の硬直＝殴り返す窓（締め上げ `crushFreezeMs`・岩投げ `throwFreezeMs` と同型）。
		// ⚠️ `markAttack` を通さない＝のしかかりは `attacks[]` の1エントリではなく**舌の周期の
		//    帰結**（`crushCoil` と同じ立場）∴クールダウンの起点を持たない。
		e._freezeUntil = now + (cfg.pounceRecoverMs ?? 480);
		if (!player) return;
		// 判定は他の全機構と同じ `enemyEdgeDist`（＝到達距離の表と直接比べられる・GUIDE §7-12）
		if (enemyEdgeDist(e, player.x, player.y) <= r) {
			takeDamage(cfg.pounceAtk ?? e.atk ?? meta?.atk ?? 1);
			e._toadPounceHits = (e._toadPounceHits ?? 0) + 1;
		}
	}

	// 舌を捨てる（スタンの tick に呼ぶ＝`cancelDash`/`cancelMomentum` と同じ列）。
	// ⚠️ ボスはブーメランでスタンしない（`stunnable ?? !isBoss`）∴今の I では観測差が出ない
	//    **二重の守り**＝`tongue` を雑魚に付けたときに効く（tickBlink と同じ立場）。
	function cancelTongue(e) {
		const wasAttached = !!e._tongueAttached;
		e._tonguePhase = 'idle';
		e._tongueLen   = 0;
		e._tongueAt    = null;
		e._tongueAttached = false;
		e._tongueAimX = null; e._tongueAimY = null;
		if (wasAttached) alignPlayerToGrid(e);
	}

	// プレイヤーを 0.5 の格子へ戻す（引き寄せが終わった瞬間に1回だけ）。
	// ⚠️ これが**無いと詰む**：引き寄せは連続座標で動かす∴半端な位置（例 x=4.33）で放すと、
	//    以後プレイヤーの1歩（±MOVE_STEP）は永久に格子へ戻らず、`isPassable` は
	//    floor(x)〜floor(x+0.999) の2列を占有と見る＝**幅1マスの出入口へ二度と入れない**
	//    （ボス部屋から出られなくなる）。盤面は 0.5 格子を前提にしている（player.js）。
	// ⚠️ 寄せる先は**敵側の格子を先に試す**（四捨五入だと最大 0.25/軸だけ敵から離れる＝
	//    実測で踏んだ欠陥：口元まで引き寄せた（間合い 1.27）のに格子合わせで 1.5 へ押し戻され、
	//    噛みつき（到達 1.4）が永久に届かなかった＝引き寄せの見返りが消える）。
	//    敵側が塞がっていれば反対側の格子へ落とす（両方塞がっている軸だけは動かさない＝
	//    格子に乗せるために壁へ埋めることはしない）。
	function alignPlayerToGrid(e) {
		const player = getPlayer();
		if (!player) return;
		const near = e ? enemyCellCenter(e) : null;
		// その軸の候補＝[敵に近い側の格子, 反対側の格子]（既に格子上なら1つだけ）
		const cands = (v, toward) => {
			const lo = Math.floor(v * 2) / 2, hi = Math.ceil(v * 2) / 2;
			if (lo === hi) return [lo];
			return toward > 0 ? [hi, lo] : [lo, hi];
		};
		for (const gx of cands(player.x, near ? near.cx - player.x : 0)) {
			if (gx === player.x || isPassable?.(gx, player.y, 'h')) { player.x = gx; break; }
		}
		for (const gy of cands(player.y, near ? near.cy - player.y : 0)) {
			if (gy === player.y || isPassable?.(player.x, gy, 'v')) { player.y = gy; break; }
		}
		moveCharEl?.('player', player.x, player.y);
	}

	// プレイヤーを body の中心へ `reelSpeed` だけ引き寄せる（1 tick 分）。
	// ⚠️ 通行判定は必ず**プレイヤー側の `isPassable`** を通す（combat.js knockbackPlayerFrom と
	//    同じ作法）＝壁・水・穴・石・敵の手前で止まる∴引き寄せで詰ませない／沼へ落とさない。
	// ⚠️ 操作は一切奪わない（入力ロックを持たない）＝歩けるし剣も振れる。`reelSpeed` <
	//    MOVE_STEP ∴真後ろへ歩けば必ず離れられる（差し引きの分だけ遅く）。
	// 戻り値：実際に動いた距離（セル）＝テストが「引かれたか」「壁で止まったか」を読む数。
	function reelPlayer(e, cfg) {
		const player = getPlayer();
		if (!player) return 0;
		const { cx, cy } = enemyCellCenter(e);
		const dx = cx - player.x, dy = cy - player.y;
		const d = Math.hypot(dx, dy);
		if (d < 0.01) return 0;
		const pull  = cfg.reelSpeed ?? 0.22;
		const steps = Math.max(1, Math.ceil(pull / MOVE_STEP));
		let moved = 0;
		for (let k = 0; k < steps; k++) {
			const sx = (dx / d) * (pull / steps);
			const sy = (dy / d) * (pull / steps);
			// 軸ごとに独立に試す＝壁に沿って引かれる（片側が塞がれても斜めの残り半分は動く）
			if (Math.abs(sx) > 1e-6 && isPassable?.(player.x + sx, player.y, 'h')) {
				player.x += sx; moved += Math.abs(sx);
			}
			if (Math.abs(sy) > 1e-6 && isPassable?.(player.x, player.y + sy, 'v')) {
				player.y += sy; moved += Math.abs(sy);
			}
		}
		if (moved > 0) moveCharEl?.('player', player.x, player.y);
		return moved;
	}

	// 掴んでいる1 tick＝引き寄せ＋離す条件の判定。舌の伸びと向きは**プレイヤーの今の位置**から
	// 出し直す（掴んだ舌は相手に付いて動く＝`_tongueLen` が絵とテストの唯一の真実）。
	function tickTongueHold(e, meta, cfg, now) {
		const player = getPlayer();
		if (!player) { snapTongue(e, cfg, now); return; }
		reelPlayer(e, cfg);
		// 舌の形をプレイヤーへ合わせ直す
		const { cx, cy } = enemyCenter(e);
		const gdx = (player.x + 0.5) - cx, gdy = (player.y + 0.5) - cy;
		const gd  = Math.hypot(gdx, gdy);
		if (gd > 0.01) {
			e._tongueAng = Math.atan2(gdy, gdx);
			e._tongueLen = Math.max(0, gd - tongueEdgeSpan(e, gdx / gd, gdy / gd));
		}
		const d = enemyEdgeDist(e, player.x, player.y);
		// ① 口元まで引き寄せた＝舌を離して噛みつきへ譲る（判定距離＝噛みつきの到達距離）
		if (d <= tongueBiteRange(e, meta)) { releaseTongue(e, cfg, now); return; }
		// ② 引き剥がされた（帯の外へ歩き切った）＝空振りと同じ扱い
		if (d > (cfg.cells ?? 6)) { snapTongue(e, cfg, now); return; }
		// ③ 時間切れ＝掴み続けられない（引き剥がせなくても必ず離される＝詰まない保証）
		if (now >= (e._tongueAt ?? 0)) { snapTongue(e, cfg, now); return; }
	}

	// 舌の時計（1 tick）。**行動ゲートの外**で呼ぶ（`tickCoilShrink`/`tickGaze` と同じ枠＝
	// GUIDE §7-7）＝噛みつきの硬直や毒沫の硬直のあいだも伸びと引き寄せが止まらない
	// （止まると「段階的に引かれる」に見える＝J で実測した罠）。
	// 戻り値：true ならこの tick は移動も攻撃もしない（＝舌が出ているあいだ蝦蟇は錨で固定）。
	function tickTongue(e, meta, now) {
		const cfg = resolveTongue(e, meta);
		if (!cfg) return false;
		// フェーズ差し替え（boss.js applyBossPhase）が相だけ畳んだ場合の後始末＝掴んだままの
		// プレイヤーを格子へ戻す（deps を持つのはこちら側だけ∴boss.js には畳ませない）。
		if (e._tongueAttached && (e._tonguePhase ?? 'idle') !== 'hold') { cancelTongue(e); return false; }
		const phase = e._tonguePhase ?? 'idle';
		if (phase === 'idle') {
			if (now < (e._tongueUntil ?? 0)) return false;      // 打ち終わりの間（cooldownMs）
			const player = getPlayer();
			if (!player || e.hidden) return false;
			const d = enemyEdgeDist(e, player.x, player.y);
			// 帯（噛みつきの到達距離の外 〜 cells）の中だけで打つ＝近ければ噛む・遠ければ
			// 跳ねて寄る（GUIDE §7-12 の到達距離の表）。
			// ⚠️ 内端は**噛みつきの到達距離そのもの**から出す（データに `minRange` を持たない）＝
			//    さもなければ「噛みつきも舌も届かない隙間」ができる。実測で踏んだ欠陥＝
			//    間合い 1.5 に立つと蝦蟇は毒沫しか撃てず、しかも**引き寄せの終点がその隙間**
			//    だった（引かれた末に噛まれない＝機構の見返りが消える）。
			// 口元に居る（＝内端より近い）＝舌ではなく**のしかかり**で答える（居座りへの罰・
			// 上の ⚠️ ②）。打ち終わりの間（cooldownMs）は上で弾いてある∴ここへ来たら跳べる。
			if (d <= tongueBiteRange(e, meta)) { startPounce(e, cfg, now); return true; }
			if (d > (cfg.cells ?? 6)) return false;
			castTongue(e, cfg, now);
			return true;
		}
		if (phase === 'cast') {
			if (now < (e._tongueAt ?? 0)) return true;
			lockTongueAim(e);
			return true;
		}
		if (phase === 'lash')  { tickTongueLash(e, cfg, now); return true; }
		if (phase === 'hold')  {
			tickTongueHold(e, meta, cfg, now);
			// 口元まで引いた tick は 'pounce' へ移っている＝true のまま（錨は続く）。
			// 引き剥がされた／時間切れは 'retract'＝これも true（戻すあいだも動かない）。
			return isTongueBusy(e);
		}
		// のしかかりの溜め（体が沈む＝`.pounce-windup`）。この 840ms は錨＝殴れる窓。
		if (phase === 'pounce') {
			if (now < (e._tongueAt ?? 0)) return true;
			e._tonguePhase = 'pounceAir';
			e._tongueAt    = now + (cfg.pounceAirMs ?? 360);
			return true;
		}
		// 滞空。着地したらそこで判定＝**ここが盾で消えない唯一の打点**。
		if (phase === 'pounceAir') {
			if (now < (e._tongueAt ?? 0)) return true;
			landPounce(e, meta, cfg, now);
			e._tonguePhase = 'idle';
			e._tongueLen   = 0;
			e._tongueAt    = null;
			e._tongueUntil = now + (cfg.cooldownMs ?? 2600);
			return false;
		}
		if (phase === 'retract') {
			const span = Math.max(1, cfg.retractMs ?? 360);
			const left = Math.max(0, (e._tongueAt ?? now) - now);
			e._tongueLen = (e._tongueRetractFrom ?? 0) * (left / span);
			if (now < (e._tongueAt ?? 0)) return true;
			e._tonguePhase = 'idle';
			e._tongueLen   = 0;
			e._tongueAt    = null;
			e._tongueUntil = now + (cfg.cooldownMs ?? 2600);
			return false;
		}
		return false;
	}

	// 跳ねて寄る条件は2つ（どちらも「舌の仕事の外」であること）。
	//   ① 帯の**外**に居る＝舌が届かない∴寄る（毒沫を撃ちながら近づく）
	//   ② 帯の中でも**打ち終わりの間（cooldownMs）だけ**寄る＝**同じ地点から2度引かない**
	// ⚠️ ② は 2026-09-01 のユーザー実プレイ報告「なぜか全然移動しなかった」への対処。
	//    帯（`cells`）が闘技場をほぼ覆う∴①だけでは実戦で一度も成立せず**置物に見えていた**
	//    （帯を狭める対処と組み；`shared/enemies.js` の I の `cells` のコメント／GUIDE §7-15）。
	//    舌が出ているあいだ（cast/lash/hold/retract）は錨で固定＝**殴れる窓は不変**。
	// ⚠️ どちらの場合も**自分から噛みつきの間合いへは詰めない**（`tongue` の型＝寄って来ない敵）
	//    ∴跳ねる距離を「噛みつきの到達距離 ＋ TOAD_HOP_KEEP」で止める。この床は舌の内端
	//    （＝`tongueBiteRange`）より外側∴止まった位置からは**必ず舌が打てる**（無反応にならない）。
	// ⚠️ `resolveEnemySpeed` を読まない＝速さは hopCells/hopMs だけが決める（∴`speedMultiplier`
	//    は効かない）。連続座標のまま MOVE_STEP 以下に刻んで進む（丸めない＝GUIDE §7-11）。
	// ⚠️ 床すれすれ（`dist - keepOut` がほぼ 0）で跳ぶと**0.02 セルの跳び**が hopMs ごとに出る
	//    ＝絵は動かないのに時計だけ消費する（実測：`.scratch/toad-motion.mjs` で 0.02→0.00 の
	//    跳びが並んだ）∴刻みより小さい寄りは「もう十分近い」と同じ扱いにする。
	const TOAD_HOP_KEEP = 0.5;
	const TOAD_HOP_MIN  = 0.05;
	function enemyToadHop(e, meta, cfg, now) {
		if (!cfg) return;
		const player = getPlayer();
		if (!player) return;
		if (isTongueBusy(e)) return;                       // 舌が出ている＝錨（呼び出し側と二重の門）
		const dist    = enemyEdgeDist(e, player.x, player.y);
		const inBand  = dist <= (cfg.cells ?? 6);
		const cooling = now < (e._tongueUntil ?? 0);       // 打ち終わりの間＝次の舌はまだ打てない
		if (inBand && !cooling) return;                    // 帯の中で打てる＝待つ（寄らない）
		const keepOut = tongueBiteRange(e, meta) + TOAD_HOP_KEEP;
		const hop     = Math.min(cfg.hopCells ?? 1.5, dist - keepOut);
		if (hop <= TOAD_HOP_MIN) return;                   // もう十分近い＝これ以上は詰めない
		if (now < (e._toadHopAt ?? 0)) return;
		e._toadHopAt = now + (cfg.hopMs ?? 1400);
		const { cx, cy } = enemyCellCenter(e);
		const dx = player.x - cx, dy = player.y - cy;
		const d  = Math.hypot(dx, dy);
		if (d < 0.01) return;
		const steps = Math.max(1, Math.ceil(hop / MOVE_STEP));
		e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
		let moved = false;
		for (let k = 0; k < steps; k++) {
			const nx = e.x + (dx / d) * (hop / steps);
			const ny = e.y + (dy / d) * (hop / steps);
			if (isPassableForEnemy(ny, nx, e)) { e.x = nx; e.y = ny; moved = true; continue; }
			// 半端な座標だと 2×2 は 3 タイルを塞ぐ＝直交軸を格子へ寄せて1回だけ試す
			// （enemyMomentumSlide と同じ理由＝巨体が通路の口で詰まらないため）。
			const sy = Math.round(ny * 2) / 2, sx = Math.round(nx * 2) / 2;
			if (isPassableForEnemy(sy, sx, e)) { e.x = sx; e.y = sy; moved = true; continue; }
			break;
		}
		if (moved) moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// 舌の帯（`.enemy-tongue`）と打つ前の予告（`.tongue-windup`）を今の状態に揃える。
	// ⚠️ 長さ・角度・濃さは**JS が単一の真実**として渡す（CSS 側に数を持たせない＝
	//    coil/gaze と同じ作法）。濃さ（`--tongue-heat`）は引き寄せの速さそのもの＝
	//    「濃い舌は強く引く」が絵と機構で一致する（GUIDE §6-1）。
	function syncTongueMotion(e, meta) {
		const cfg   = resolveTongue(e, meta);
		const phase = e._tonguePhase ?? 'idle';
		const el  = document.getElementById(`char-enemy-${e.id}`);
		if (el) {
			const casting = phase === 'cast';
			if (casting) el.style.setProperty('--tongue-cast-ms', `${Math.round(e._tongueCastMs ?? 0)}ms`);
			el.classList.toggle('tongue-windup', casting);
			// のしかかりの2相＝**舌の予告とは別の絵**（沈む／浮く）＝避け方が違う
			// （舌は横へ歩いて線から外れる・のしかかりは下がって円から出る＝GUIDE §6-1）。
			if (phase === 'pounce') el.style.setProperty('--pounce-windup-ms', `${Math.round(e._tonguePounceMs ?? 0)}ms`);
			el.classList.toggle('pounce-windup', phase === 'pounce');
			el.classList.toggle('pounce-air',    phase === 'pounceAir');
		}
		syncPounceZone(e, cfg);
		const id = `enemy-tongue-${e.id}`;
		let strip = document.getElementById(id);
		const len = e._tongueLen ?? 0;
		if (!cfg || !isTongueBusy(e) || len <= 0) { if (strip) strip.remove(); return; }
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		if (!strip) {
			strip = document.createElement('div');
			strip.id = id;
			charLayerEl.appendChild(strip);
		}
		// 帯は**口元から先端まで**引く（口→先端＝1本の線）＝体の上に少し重なるのが正しい姿
		// （蝦蟇の舌は口から出て自分の顎の上を通る）。長さは判定より 0.15 セルだけ長く描く
		// ＝効果の範囲 ⊇ 判定の範囲。角度も口元から見た角度＝絵の先端が判定の先端に載る。
		const { tx, ty } = tongueTip(e);
		const { mx, my } = tongueMouth(e);
		const dx = tx - mx, dy = ty - my;
		const ang = Math.atan2(dy, dx);
		const ox = mx * cellPx, oy = my * cellPx;
		const px = (Math.hypot(dx, dy) + 0.15) * cellPx;
		const heat = Math.min(1, (cfg.reelSpeed ?? 0.22) / MOVE_STEP);
		strip.className = 'enemy-tongue' + (e._tongueAttached ? ' tongue-attached' : '');
		strip.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;`
			+ `width:${px}px;height:${Math.max(3, cellPx * 0.22)}px;z-index:24;pointer-events:none;`
			+ `transform:translateY(-50%) rotate(${ang}rad);transform-origin:0 50%;`
			+ `--tongue-heat:${heat.toFixed(3)};`;
	}

	// のしかかりの**危険域を床に描く**（`pounce` と `pounceAir` のあいだ）。
	// ⚠️ 敵の絵に載せる予告（`.pounce-windup`）だけでは「どこまでが円の中か」が読めない＝
	//    J の輪で実測した罠と同じ（GUIDE §6-1）。∴床の告知が本体。
	// ⚠️ 形は**判定と同じ角丸の矩形**にする＝`enemyEdgeDist ≤ r` の集合は「body の箱を r だけ
	//    膨らませた角丸矩形」そのもの（円ではない）∴`border-radius: r` で厳密に一致させられる
	//    ＝隠れダメージ（塗られていない床で殴られる）も過剰警告も出ない。基準点はプレイヤーの
	//    絵の中心（判定が読む `player.x + 0.5` と同じ点）。
	function pounceZoneBox(e, r) {
		const { cx, cy } = enemyCellCenter(e);
		const { halfW, halfH } = enemyHalf(e);
		// セル添字 → 描画座標（タイルの角原点）は +0.5
		return { left: cx + 0.5 - halfW - r, top: cy + 0.5 - halfH - r,
			w: halfW * 2 + r * 2, h: halfH * 2 + r * 2 };
	}

	function syncPounceZone(e, cfg) {
		const id = `toad-pounce-zone-${e.id}`;
		let el = document.getElementById(id);
		const phase = e._tonguePhase ?? 'idle';
		const on = !!cfg && (phase === 'pounce' || phase === 'pounceAir');
		if (!on) { if (el) el.remove(); return; }
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		if (!el) {
			el = document.createElement('div');
			el.id = id;
			charLayerEl.appendChild(el);
		}
		const r = pounceRadiusOf(cfg);
		const box = pounceZoneBox(e, r);
		// 溜め＝薄い警告／滞空＝濃い（＝もう落ちてくる）。閾値ではなく相そのものが色を決める。
		el.className = 'toad-pounce-zone' + (phase === 'pounceAir' ? ' pounce-zone-falling' : '');
		el.style.cssText = `position:absolute;left:${box.left * cellPx}px;top:${box.top * cellPx}px;`
			+ `width:${box.w * cellPx}px;height:${box.h * cellPx}px;`
			+ `border-radius:${r * cellPx}px;z-index:2;pointer-events:none;`
			+ `--pounce-windup-ms:${Math.round(e._tonguePounceMs ?? 0)}ms;`;
	}

	// 着地の衝撃（`.enemy-coil-crush` と同型＝実時間で消える別 DOM ∴敵が倒れても残らない）。
	function showPounceLandEffect(e, r) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const box = pounceZoneBox(e, r);
		const el = document.createElement('div');
		el.className = 'toad-pounce-land';
		el.style.cssText = `position:absolute;left:${box.left * cellPx}px;top:${box.top * cellPx}px;`
			+ `width:${box.w * cellPx}px;height:${box.h * cellPx}px;`
			+ `border-radius:${r * cellPx}px;z-index:23;pointer-events:none;`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), 360);
	}

	// ── Phase 5.5k k-4: 向きを固定して構える（盾騎士）─────────────────
	// meta.blockFacing = { turnMs, knockback } を持つ敵は「向きが常時ブロックの面」＝
	// e.dir がそのままダメージ無効化の方向になる（combat.js isBlockFacingDir）。
	// ∴ **向きは毎tick プレイヤーへ向き直ってはいけない**（それでは正面が常にプレイヤー側＝
	// 回り込む余地が消えて機構が死ぬ）。turnMs ごとの離散的な判断にして、その間に
	// プレイヤーが側面/背後へ回る猶予を作る。
	//   ・初回（_faceUntil が無い）は**マップに置かれた向き（enemyDirs）を尊重する**＝
	//     レベルデザインの「こちらを向いた騎士」がその向きで立つ（検証ステージも同じ）。
	//   ・向き直りはカーディナル4方向（tickGuard の向き決定と同型）。
	// 戻り値：true ならこの tick の向きはロック済み＝移動側（enemyChase）は向きを触らない。
	function tickFaceLock(e, meta, now) {
		const cfg = meta?.blockFacing;
		if (!cfg) return false;
		const turnMs = cfg.turnMs ?? 720;
		if (e._faceUntil == null) {
			// 置かれた向きをそのまま最初の turnMs ぶん維持する（向き直りの起点だけ決める）
			e._faceUntil = now + turnMs;
		} else if (now >= e._faceUntil) {
			const player = getPlayer();
			const dx = player.x - e.x, dy = player.y - e.y;
			if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) {
				e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
			}
			e._faceUntil = now + turnMs;
		}
		e._blockDir = e.dir;
		return true;
	}

	// ── Phase 5.5k k-4: 甲羅の開閉（火吐き亀）───────────────────────
	// meta.shell = { closedMs, openMs, breathCells, breathAtk, breathMs } を持つ敵は
	// 「籠もる（closed＝全ダメージ無効・不動）」と「開く（open＝殴れる）」を交互に繰り返す。
	// 隠れ（meta.hide）との違い＝**姿は消えない**＝いつでも攻撃対象にはなる（甲羅を叩いて
	// 0ダメージの弾きが返る）∴プレイヤーには「今は無駄」が手応えで伝わる。
	// **開いた瞬間に正面へ炎を吐く**＝「開くのを待って正面から殴る」を罰する（PLAN 名簿
	// 「口を開けた瞬間に炎を吐く（そのスキに殴る）」）。
	// 戻り値：true ならこの tick は移動も攻撃もしない（籠もっている間）。
	function tickShell(e, meta, now) {
		const cfg = meta?.shell;
		if (!cfg) return false;
		const closedMs = cfg.closedMs ?? 1400;
		const openMs   = cfg.openMs   ?? 1000;
		if (!e._shellPhase) {
			e._shellPhase  = 'closed';
			e._shellUntil  = now + closedMs;
			e._shellClosed = true;
			return true;
		}
		if (now < e._shellUntil) return e._shellPhase === 'closed';
		if (e._shellPhase === 'closed') {
			e._shellPhase  = 'open';
			e._shellUntil  = now + openMs;
			e._shellClosed = false;
			breatheFire(e, meta, cfg);   // 口を開けた瞬間＝炎
			return false;
		}
		e._shellPhase  = 'closed';
		e._shellUntil  = now + closedMs;
		e._shellClosed = true;
		return true;
	}

	// ── Phase 5.5k k-5: 張り付いてルピーを吸う（ルピー喰い）─────────────────
	// meta.leech = { attachRange, drainMs, amount, refund, cooldownMs }。
	// 「接触で張り付き所持ルピーを吸う／倒すと一部戻る＝倒す優先度を強制する」（PLAN 名簿 #11）。
	//
	// 設計上の急所（この2つを外すと機構が死ぬ）：
	//   ① **張り付いたら速度では振り切れない。** 敵の速度は必ずプレイヤーより遅い
	//      （GUIDE §7-2）∴「寄ってくるだけ」なら走って逃げれば無害＝吸われない。
	//      ∴張り付いている間は移動処理を通さず**プレイヤーの座標へ毎tick貼り付ける**。
	//      剥がす手段は殴ること（combat.js の被弾フック → detachLeech）だけ。
	//   ② **張り付いても体力は削らない。** 「ルピーを吸う」がこの敵の攻撃であって、
	//      体力を削るのは仕事ではない（k-7a までは重なりで接触ダメージが毎tick成立する
	//      ＝即死級になるため `checkEnemyContact` で `_attached` を飛ばしていた。
	//      k-7.5 で接触ダメージ自体を廃止した∴除外は不要になった）。
	// プレイヤーのセルへ乗る（`e.x = player.x`）ので **重なり禁止（k-7.5 決定①）の
	// 唯一の例外**＝`meta.leech` を持つ敵（張り付き中＝`e._attached`）だけは敵側（passable.js）もプレイヤー側
	// （player.js）も重なりを許す（許さないとプレイヤーが1歩も動けず詰む）。
	// 剣は距離0の敵にも当たる（combat.js の当たり判定は dot>=0 かつ射程内∴向きを問わない）。
	// 戻り値：true ならこの tick は移動も攻撃もしない（吸うことが攻撃）。
	function tickLeech(e, meta, now) {
		const cfg = meta?.leech;
		if (!cfg) return false;
		const player = getPlayer();
		if (!e._attached) {
			// 剥がされた直後は再度張り付けない＝反撃した見返りに間合いを立て直す猶予を作る
			if (now < (e._leechCooldownUntil ?? 0)) return false;
			// ⚠️ attachRange は 1.0 以上にする。敵はプレイヤーのセルへ自力で踏み込めない
			//    （isPassableForEnemy）∴自分で詰められる距離は 1.0 まで＝これより狭い値に
			//    すると永遠に張り付けない（GUIDE §3-1 と同型の「届かない判定距離」の罠）。
			// 0d-2.5 (4): 距離は **body の端から**測る（左上基準だと 2×2 は西/北から詰めても
			// 2.0 ＝どんな attachRange でも張り付けない＝同じ「届かない判定距離」の罠）。
			if (enemyEdgeDist(e, player.x, player.y) > (cfg.attachRange ?? 1.1)) return false;
			e._attached = true;
			e._leechNext = now + (cfg.drainMs ?? 600);
			playSound('appear');
			pulse?.('張り付かれた！', 900);
		}
		// プレイヤーへ貼り付く（速度では振り切れない＝①）。
		// 0d-2.5 (4): 大型敵は **body の中心**をプレイヤーへ合わせる（左上を合わせると
		// 2×2 の体が右下へ半セルずれて「掴んでいる絵」に見えない）。1×1 では従来と同値。
		const { halfW, halfH } = enemyHalf(e);
		e.x = player.x - halfW; e.y = player.y - halfH;
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
		if (now >= (e._leechNext ?? 0)) {
			drainRupees(e, cfg, now);
			e._leechNext = now + (cfg.drainMs ?? 600);
		}
		return true;
	}

	// ルピーを amount 吸う。吸うものが無くなったら自分から剥がれる
	// （0ルピーのプレイヤーを永久に拘束しても何も起きない＝ただの無敵状態になる。
	//   剥がれれば通常の体当たり攻撃をする敵として振る舞う＝無害な敵にはならない）。
	function drainRupees(e, cfg, now) {
		const player = getPlayer();
		const amount = Math.min(player.rupees ?? 0, cfg.amount ?? 2);
		if (amount <= 0) {
			detachLeech(e, now);
			pulse?.('吸うルピーが無い！', 900);
			return;
		}
		player.rupees -= amount;
		e._stolenRupees = (e._stolenRupees ?? 0) + amount;
		updateHud?.();
		playSound('rupee');
		pulse?.(`◆ ルピー ×${amount} を吸われた！`, 900);
	}

	// 張り付きを剥がす（被弾＝combat.js の被弾フックから／吸うものが無くなったとき）。
	// `_stolenRupees` は消さない＝倒したときの払い戻し（combat.js refundLeech）の元になる
	// ＝「剥がして放置」ではルピーは戻らない∴倒す動機が残る。
	function detachLeech(e, now = gameNow()) {
		const cfg = ENEMY_META[e.type]?.leech;
		if (!cfg) return;
		e._attached = false;
		e._leechNext = null;
		e._leechCooldownUntil = now + (cfg.cooldownMs ?? 1200);
	}

	// 正面（カーディナル1方向）へ breathCells セルぶん炎を吐く。
	// 投擲物ではない＝**射程の短い一撃**（飛び道具の種別追加は PLAN 5.5k k-6 の担当）。
	//   ・吐く直前にプレイヤーの方を向く＝炎の向きと絵の向きが一致する
	//   ・壁で止まる（tilePassable）＝壁越しには焼かれない
	//   ・当たり判定はセル単位（プレイヤーの中心がそのセルに乗っているか）
	function breatheFire(e, meta, cfg) {
		const player = getPlayer();
		const cells  = cfg.breathCells ?? 2;
		const dmg    = cfg.breathAtk ?? meta.atk ?? 1;
		const dx = player.x - e.x, dy = player.y - e.y;
		if (Math.abs(dx) >= 0.01 || Math.abs(dy) >= 0.01) {
			e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
		}
		const [ux, uy] = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0] }[e.dir] ?? [0, 1];
		for (let k = 1; k <= cells; k++) {
			const fx = e.x + ux * k, fy = e.y + uy * k;
			const r = toTileRow(fy), c = toTileCol(fx);
			if (!tilePassable(r, c)) break;   // 壁で止まる
			showFireBreathEffect(fx, fy, cfg.breathMs ?? 420);
			if (Math.abs(player.x - fx) < 0.9 && Math.abs(player.y - fy) < 0.9) takeDamage(dmg);
		}
		playSound('slash');   // 専用SEは持たない（炎の「シュッ」の代用）
	}

	// 炎の見た目（かがり火の炎 `.candle-fire` と同型＝DOM 要素を1つ置いて実時間で消す）。
	function showFireBreathEffect(fx, fy, durMs) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.className = 'enemy-fire-breath';
		el.style.cssText = `position:absolute;left:${fx * cellPx}px;top:${fy * cellPx}px;`
			+ `width:${cellPx}px;height:${cellPx}px;z-index:25;pointer-events:none;`;
		charLayerEl.appendChild(el);
		setTimeout(() => el.remove(), durMs);
	}

	// ── Phase 8-4 (4) 0d-3（2体目 A 炎のサラマンドラ）: 炎のブレス（円錐）─────────
	// 甲羅（`shell`）の炎（`breatheFire`）から派生した攻撃だが、**別の機構**として書く：
	//   ・`shell` の炎は「開いた瞬間に必ず出る」（周期の副産物・予告は開閉の絵）＝避け方は時間。
	//   ・こちらは `attacks[]` の1エントリ＝**予告→解決**の2拍を持ち、避け方は**射線を外す**。
	//   ・直線1本ではなく**円錐**（軸方向 `cells` × 外へ `spread` レーン）＝1セル横へ避けても
	//     まだ焼かれる∴プレイヤーは「早めに車線から出る」ことを要求される。
	// 共有するのは見た目（`.enemy-fire-breath`）だけ＝`showFireBreathEffect` を再利用する。
	const BREATH_DIR_VEC = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0] };

	// 吐ける車線に居るか＝居れば吐く向き（カーディナル1方向）、居なければ null。
	// ⚠️ 許容ずれは**円錐が実際に覆う幅から導く**（＝`spread` ＋ body の半幅）。
	//    独立した数値にすると「揃ったと判定したのに円錐の外」＝GUIDE §3-1 と同型の
	//    「届かない判定距離」の罠になる（機構が死んでいてもテストは緑になる）。
	function breathLaneDir(e, atk, dx, dy) {
		const { halfW, halfH } = enemyHalf(e);
		const vertical = Math.abs(dy) > Math.abs(dx);
		const off     = vertical ? Math.abs(dx) : Math.abs(dy);
		const halfOff = vertical ? halfW : halfH;
		if (off > (atk.spread ?? 1) + halfOff) return null;
		return vertical ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
	}

	// 予告の開始（enemyAttack の breath 分岐から呼ぶ）。剣（startSwing）と同じ形。
	function startBreath(e, meta, atk, i, now, dir) {
		// 吐く向きは**この瞬間に固定する**＝解決時に追尾しない（射線を外す答えを守る）
		e._breathDir = dir;
		e.dir = dir;
		e._breathWindupMs = atk.windupMs ?? MELEE_WINDUP_MS;
		e._breathAt  = now + e._breathWindupMs;
		e._breathIdx = i;
		// 予告は絵（`.breath-windup` ＝口元で炎の玉が膨らむ）と音の2経路で出す（GUIDE §7-6）。
		// 吸い込む音（breathWindup）と吐く音（fire）は**別の音**＝「来る」と「出た」を聞き分ける。
		playSound('breathWindup');
	}

	// 予告の解決。戻り値 true ＝この tick はブレスが専有した（移動も他の攻撃もしない）。
	function tickBreath(e, meta, now) {
		if (e._breathAt == null) return false;
		if (now < e._breathAt) return true;                // まだ溜め中
		const list = resolveAttackList(e, meta);
		const i    = e._breathIdx ?? 0;
		const atk  = list[i] ?? {};
		const dir  = e._breathDir ?? e.dir;
		e._breathAt = null; e._breathIdx = null;
		// 隠れ中に解決の時刻が来たら空振り（tickSwing / tickSlam と同じ扱い）
		if (e.hidden) { markAttack(e, meta, i, now); return true; }
		breatheCone(e, meta, atk, dir);
		// クールダウン・硬直は**解決した時刻から**数える（空振りでも数える＝連打にならない）
		markAttack(e, meta, i, now);
		return true;
	}

	// 円錐の炎を出す。軸方向は body の**前面**から `cells` セル、横方向は body の幅
	// （`core` レーン）を距離に応じて `spread` レーンぶん外へ広げる（1セル目＝体の幅のまま）。
	// ・**盾では防げない**（`isShieldBlockingDir` を通さない）＝体当たり/突進と同じ扱い＝
	//   答えは「射線から外れる」だけ（k-7.5 決定④の系）。
	// ・壁で止まる。**軸（芯）のレーンが全部塞がれた距離で円錐そのものを打ち切る**＝
	//   正面に壁を挟めば焼かれない（＝遮蔽が意味を持つ）。外側のレーンは各々独立に止まる。
	// ・ダメージは**1回だけ**（何セル重なっても1発）。
	function breatheCone(e, meta, atk, dir) {
		const player = getPlayer();
		const cells  = atk.cells  ?? 3;
		const spread = atk.spread ?? 1;
		const dmg    = atk.breathAtk ?? e.atk ?? meta.atk ?? 1;
		const durMs  = atk.breathMs ?? 420;
		const [ux, uy] = BREATH_DIR_VEC[dir] ?? BREATH_DIR_VEC.down;
		const horizontal = ux !== 0;
		const { cx, cy } = enemyCellCenter(e);
		const { halfW, halfH } = enemyHalf(e);
		const halfFwd = horizontal ? halfW : halfH;          // 中心から前面まで
		const halfOff = horizontal ? halfH : halfW;          // 芯レーンの外端（±halfOff）
		const blocked = new Set();
		let hit = false;
		for (let k = 1; k <= cells; k++) {
			const extra = Math.min(spread, k - 1);           // 1セル目は体の幅のまま＝口元
			let coreOpen = false;
			for (let j = -halfOff - extra; j <= halfOff + extra; j++) {
				if (blocked.has(j)) continue;
				const fx = horizontal ? cx + ux * (halfFwd + k) : cx + j;
				const fy = horizontal ? cy + j : cy + uy * (halfFwd + k);
				if (!tilePassable(toTileRow(fy), toTileCol(fx))) { blocked.add(j); continue; }
				if (Math.abs(j) <= halfOff) coreOpen = true;
				showFireBreathEffect(fx, fy, durMs);
				if (Math.abs(player.x - fx) < 0.9 && Math.abs(player.y - fy) < 0.9) hit = true;
			}
			if (!coreOpen) break;                            // 芯が塞がれた＝ここで炎が止まる
		}
		if (hit) takeDamage(dmg);
		playSound('fire');   // 吐いた音（予告の breathWindup とは別＝結果が耳で分かる）
	}

	// 予告モーションの見た目（board.css `.breath-windup`＝口元で炎の玉が膨らむ）。
	// 体当たり（拡大縮小）・突進（足踏み）・剣（振り上げ）・硬直（沈む）と**別の形**
	// ＝どの攻撃の予告なのかが絵で分かる（GUIDE §6-1）。A は向き別の絵を持たない
	// （`directional` ではない）∴**玉の位置だけが吐く向きを伝える**＝`--breath-o[xy]` に出す。
	function syncBreathMotion(e) {
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (!el) return;
		const on = e._breathAt != null;
		if (on) {
			// 長さは状態機械が持つ（CSS 側に書かない＝swing/dash と同じ作法）
			el.style.setProperty('--breath-windup-ms', `${Math.round(e._breathWindupMs ?? 0)}ms`);
			const dir = e._breathDir ?? e.dir ?? 'down';
			const [ux, uy] = BREATH_DIR_VEC[dir] ?? BREATH_DIR_VEC.down;
			// wrapper は占有セル全体（2×2 なら2セル四方）∴% で口元＝前面の中央を指す
			el.style.setProperty('--breath-ox', `${50 + ux * 50}%`);
			el.style.setProperty('--breath-oy', `${50 + uy * 50}%`);
		}
		el.classList.toggle('breath-windup', on);
	}

	// ── Phase 5.5k k-3c: 跳躍蜘蛛の「溜め」を画面に出す ───────────────
	// tickLeap の windup 相は移動/攻撃を止めるだけで見た目は素の歩行のままだった＝
	// プレイヤーには「敵が止まった」ことしか伝わらず GUIDE §6-1（絵は機構を読ませる）に
	// 反していた。resolveEnemySprite（directional な敵の攻撃/構え窓）と同型＝論理時間の
	// 状態からスプライト名を導き、変わった tick だけ DOM の canvas を差し替える。
	// leapSpider は directional ではない（向き別9枚は不要）ので syncDirectionalSprite は
	// 通らない＝meta.leap を持つ敵専用の新経路。
	function syncLeapSprite(e, meta) {
		const base = meta?.sprite;
		if (!base) return;
		swapEnemySprite(e, (e._leapPhase === 'windup') ? `${base}Windup` : base);
	}

	// ── Phase 5.5k k-4: 火吐き亀の甲羅の開閉を画面に出す ───────────────
	// 籠もっている間（_shellClosed）は「無敵で不動」＝理由が絵で読めないと
	// 「動かないバグ」に見える（GUIDE §6-1）。leap の windup と同じ作法で名前を切り替える。
	function syncShellSprite(e, meta) {
		const base = meta?.sprite;
		if (!base) return;
		swapEnemySprite(e, e._shellClosed ? `${base}Closed` : base);
	}

	// ── Phase 5.5k k-8b: 術士の詠唱を画面に出す ─────────────────────
	// 出現から castDelayMs の間は動かない・撃たない＝**殴れる窓**なのに、絵は待機のままで
	// 「止まっている」ことしか伝わらなかった（GUIDE §6-1）。leap の windup・甲羅の開閉と
	// 同じ作法で、詠唱の窓だけ `${base}Cast`（腕を挙げて宝珠が燃える姿）へ差し替える。
	function syncCastSprite(e, meta) {
		const base = meta?.sprite;
		if (!base) return;
		const casting = (e._castUntil ?? 0) > gameNow();
		swapEnemySprite(e, casting ? `${base}Cast` : base);
	}

	// ── Phase 5.5k k-9b: 突進猪の溜め／気絶を画面に出す ─────────────────
	// 溜め（windup）は 3 tick の予告＝**軸から外れろ**という指示／気絶（stun）は 12 tick の
	// 「殴り放題の窓」。どちらも CSS の揺れ（.dash-windup）と ⭐ だけでは足りない＝
	// 絵そのものが状態を名指す（GUIDE §6-1）。leap の windup・甲羅の開閉と同じ作法。
	// ★ 気絶を溜めより先に見る＝壁への激突は「気絶＋硬直」が同時に立つ（endDash(stunMs+…)）。
	//   ⚠️ 2026-08-19 実測：この順序は今の実装では観測差が出ない（スタンに入った tick の
	//      cancelDash が windup を畳む∴「気絶かつ溜め」が同時に立つ状態が作れない）＝
	//      **二重の守り**。cancelDash の畳み方を変えたときに効く。
	function syncDashSprite(e, meta) {
		const base = meta?.sprite;
		if (!base) return;
		if ((e.stunUntil ?? 0) > gameNow()) swapEnemySprite(e, `${base}Stun`);
		else if (e._dashPhase === 'windup') swapEnemySprite(e, `${base}Windup`);
		else swapEnemySprite(e, base);
	}

	// 状態から導いたスプライト名へ DOM の canvas を差し替える（変わった tick だけ触る）。
	// directional 敵の syncDirectionalSprite と対になる「向きを持たない敵のポーズ差替」。
	function swapEnemySprite(e, spriteName) {
		if (e.sprite === spriteName) return;
		const el = document.getElementById(`char-enemy-${e.id}`);
		if (!el) { e.sprite = spriteName; return; }
		// ⚠️ 未登録の名前では makeSprite が null を返す∴**先に古い canvas を消すと敵が消える**
		//    （ポーズ絵を持たない敵に Cast/Windup/Closed を要求したときの事故）。
		//    先に作って、作れたときだけ差し替える（k-8b で塞いだ）。
		// ⚠️ 反転は**今の canvas から受け継ぐ**（k-9b）。e.flipX は directional 敵しか持たない
		//    ∴sideView の敵（猪・鮫）で `!!e.flipX` を使うと、左を向いていた敵の溜め／気絶が
		//    右向きに戻る＝「左へ走りながら右を向いて溜める」絵になる。
		const oldCv = el.querySelector('canvas.sprite');
		const cv = makeSprite(spriteName, e.pal, true, currentFlipX(e, oldCv));
		if (!cv) return;
		e.sprite = spriteName;
		if (oldCv) oldCv.remove();
		el.insertBefore(cv, el.firstChild);
	}

	// 今 画面に出ている canvas の反転（sideView の敵はここだけが真実）。canvas がまだ無い
	// ときは directional 敵の e.flipX を使う。
	function currentFlipX(e, cv) {
		if (cv) return cv.dataset.flipX === '1';
		return !!e.flipX;
	}

	// ── Phase 5.5k k-3: ジグザグ飛行（コウモリ群）───────────────
	// meta.zigzag = { amplitude, periodMs } を持つ敵は、プレイヤーそのものではなく
	// **プレイヤーの脇 amplitude セル** を目標に取り、periodMs ごとに左右を入れ替える。
	// ∴進路が振れて狙いを付けにくい（真っすぐ来る敵とは避け方が変わる）。
	// 位相は e.id から決定的にずらす（乱数なし＝同種を並べても一斉に来ない・テストが安定。
	// meta.combat の交替と同じ作法＝GUIDE §7-3）。
	function enemyZigzagFly(e, meta, speed, cfg) {
		e.accum = (e.accum ?? 0) + speed;
		if (e.accum < 1.0) return;
		e.accum -= 1.0;

		const player = getPlayer();
		const amplitude = cfg.amplitude ?? 1.5;
		const periodMs  = cfg.periodMs  ?? 720;
		const now = gameNow();
		const t = now + phaseOffsetMs(e, periodMs * 2);
		const sign = Math.floor(t / periodMs) % 2 === 0 ? 1 : -1;

		const dy = player.y - e.y, dx = player.x - e.x;
		const step = MOVE_STEP;
		const half = step / 2;
		// 主軸＝ずれの大きい軸（ここを詰める）／副軸＝それに直交する軸（ここを左右に振る）
		const vertical = Math.abs(dy) >= Math.abs(dx);
		const mainDiff = vertical ? dy : dx;
		const primary = Math.abs(mainDiff) >= half
			? (vertical ? [Math.sign(mainDiff) * step, 0] : [0, Math.sign(mainDiff) * step])
			: null;
		// 副軸の目標＝プレイヤーの脇 amplitude セル（sign が periodMs ごとに入れ替わる）
		const latDiff = vertical
			? (player.x + amplitude * sign) - e.x
			: (player.y + amplitude * sign) - e.y;
		const lateral = Math.abs(latDiff) >= half
			? (vertical ? [0, Math.sign(latDiff) * step] : [Math.sign(latDiff) * step, 0])
			: null;
		// **1手おきに副軸へ振る**＝直線で寄って来ない（残りの手で主軸を詰める）。
		// 毎手を副軸に使うと目標の入れ替わりに追いつけず一歩も近づけない／主軸だけ先に
		// 詰めると「遠距離は直線・密着してから振れる」＝ジグザグが見えない。∴1:1 で交互。
		e._zzMoves = (e._zzMoves ?? 0) + 1;
		const swing = lateral && e._zzMoves % 2 === 1;
		const candidates = (swing ? [lateral, primary] : [primary, lateral]).filter(Boolean);
		for (const [my, mx] of candidates) {
			if (isPassableForEnemy(e.y + my, e.x + mx, e)) { e.y += my; e.x += mx; break; }
		}
		// 向きはプレイヤーを見る（目標点ではなく本体＝絵が「狙っている」ことを伝える）
		e.dir = vertical ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
		moveCharEl(`enemy-${e.id}`, e.x, e.y);
	}

	// ── Phase 9-6: 横向き敵の向き（sideView）────────────────────
	// 鮫・魚のような横向きシルエットは、素の絵（右向き）のままだと常に右を向いて
	// 見える＝プレイヤーが左にいると背中で噛みつく不自然な絵になる。
	// ∴ ENEMY_META[type].sideView の敵は、プレイヤーの x 差で canvas を左右反転する。
	//   ・移動方向（e.dir）ではなくプレイヤー位置で決める＝上下移動中も向きが固まらない
	//   ・アニメループ（redrawAnimSprites）が dataset.flipX を読んで再描画するので、
	//     ここで dataset を書き換えるだけで次フレームから反転が反映される
	//   ・renderChars（char-layer 作り直し）側でも同じ判定を持つ＝再描画で戻らない
	// ⚠️ Phase 5.5k k-9b: dataset を書くだけで足りるのは**複数フレームの絵だけ**。
	//    redrawAnimSprites は `frames.length > 1` しか描き直さない（shared/sprites.js）∴
	//    単一フレームのポーズ絵（猪の溜め `chargeBoarWindup`／気絶 `chargeBoarStun`）では
	//    反転が画面に出ず「左へ突進しながら右を向いて溜める」絵になる。猪は sideView と
	//    ポーズ差替を**同時に持つ最初の敵**＝ここで canvas を作り直して即座に反映する
	//    （アニメループを待たない＝フレーム数に依らず1経路・400ms の遅れも消える）。
	function applySideFacing(e, meta) {
		if (!meta?.sideView) return;
		const layer = getCharLayerEl();
		const el = layer?.ownerDocument?.getElementById(`char-enemy-${e.id}`);
		const cv = el?.querySelector?.('canvas.sprite');
		if (!cv) return;
		const flip = getPlayer().x < e.x ? '1' : '';
		if (cv.dataset.flipX === flip) return;
		cv.dataset.flipX = flip;
		const next = makeSprite(cv.dataset.sprite || e.sprite, cv.dataset.pal || e.pal, true, flip === '1');
		if (!next) return;                 // 作れないときは dataset だけ残す（敵を消さない）
		cv.remove();
		el.insertBefore(next, el.firstChild);
	}

	// ── Phase 5.5k: 陸上敵のガード（実効化・ユーザー指示 2026-08-10）───────────
	// ガードは見た目だけの威圧演出ではなく、実際にダメージを無効化する状態。
	// 判定＝sword 攻撃のクールダウン待ち中（＝次の攻撃まで間がある）かつ近接圏内なら
	// ガード状態に入る。ガード中は①移動しない②攻撃しない③向きをその場でロックする
	// （＝プレイヤーがブーメランで動きを止めてから叩くか、ロックされた向きの側面/背後へ
	// 回り込むかしないと崩せない、というユーザー設計）。クールダウンが明けたら
	// ガードを解いて攻撃へ移る（攻撃直後は再びクールダウン中＝自然にガードへ戻る）。
	// 戻り値：ガード中なら true（呼び出し側はこの tick の移動/攻撃を止める）。
	function tickGuard(e, meta, now) {
		// Phase 5.5k #7: guards:false＝ガードを持たない敵（剣獣のような高機動型は
		// 立ち止まって構えない）。directional な敵でもここで降りる＝${base}${Dir}Guard の
		// スプライトを用意しなくてよくなる（resolveEnemySprite は _guarding を見る）。
		if (meta.guards === false) { e._guarding = false; e._guardDir = null; return false; }
		const attackList = resolveAttackList(e, meta);
		const idx = attackList.findIndex(a => a?.type === 'sword');
		if (idx === -1) { e._guarding = false; e._guardDir = null; return false; }
		const sword = attackList[idx];
		const player = getPlayer();
		const dist = Math.hypot(player.x - e.x, player.y - e.y);
		// ガード圏＝sword.range と同じ（＝プレイヤーの剣が届く距離）。ここを離すと
		// 「ガード中は剣の射程外にいる」＝近接攻撃自体が届かず何もできなくなる
		// （見た目だけの旧設計の名残・実効化するなら間合いを一致させる必要がある）。
		const guardRange = sword.range ?? 1.5;
		if (dist > guardRange) { e._guarding = false; e._guardDir = null; return false; }
		const lastTime = e._attackTimes?.[idx] ?? 0;
		const cooldown = sword.cooldown ?? 3000;
		// 「攻撃可能」＝クールダウン経過 かつ 実際に sword.range 内（ガード圏内でも range 外なら
		// enemyAttack は発火しない∴ここで false にすると毎tick誤って移動側に落ちてしまう）。
		if (now - lastTime >= cooldown && dist <= (sword.range ?? 1.5)) { e._guarding = false; return false; }
		if (!e._guarding) {
			// ガード開始の瞬間だけ向きを決める＝以後はプレイヤーが動いても向き直らない（ロック）。
			const dx = player.x - e.x, dy = player.y - e.y;
			e.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
		}
		e._guarding = true;
		e._guardDir = e.dir;
		e._guardUntil = now + TICK_MS + 40;
		return true;
	}

	// ── 接触ダメージ（Phase 5.5k k-7.5 で廃止） ────────────────
	// ここには `checkEnemyContact()` があった＝プレイヤーの占有点が敵の 0.9 箱に入ったら
	// 毎 tick ダメージ＋デバフ、という「触れたら痛い」の唯一の入口。
	// 2026-08-17 のユーザー決定②「接触だけでは攻撃を受けることはないようにする」で廃止した。
	// 理由（DECISIONS 2026-08-17）＝
	//   ・重なり禁止（決定①）を入れると「接触」は 0.9 箱に入る位置そのものが消える∴定義できない
	//   ・丸め `toTileCol = floor(x+0.5)` の非対称で、接触は西/北の敵だけが成立していた
	//     （プレイヤーが半セル位置のとき西/北は 0.5 まで詰め、東/南は 1.5 で止まる）＝理不尽
	// 今の代わり＝**すべての攻撃はモーションを持つ**。体当たり専門（attack:{type:'charge'}）は
	// `enemyAttack` → `startSlam` → `tickSlam` の予告→解決で当てる（デバフの発火も tickSlam）。

	// ── 敵ループ（毎 tick 呼ぶ） ──────────────────────────────
	function enemyTick() {
		const enemies = getEnemies();
		const now = gameNow();
		for (const e of enemies) {
			const meta = ENEMY_META[e.type];
			if (!meta) continue;
			// Phase 5.5k: スタン中はガードも解除する（ブーメランで動きを止めてガード不能にする、
			// というユーザー設計の実体＝スタンとガードは同時に成立しない）。
			if (e.stunUntil && now < e.stunUntil) {
				e._guarding = false;
				// Phase 5.5k k-7.5: スタンは体当たりの予告も中断する（ガードと同じ扱い＝
				// スタン中に攻撃が成立してはいけない）。ブーメランで止めれば体当たりも消える。
				if (e._slamAt != null) { e._slamAt = null; e._slamIdx = null; syncSlamMotion(e, meta); }
				// Phase 8-4 (4) 0d-2.6: 剣の予告（振り上げ）もスタンで中断する＝上と同じ理由
				// （止めたのに振り下ろされる、を作らない）。
				if (e._swingAt != null) { e._swingAt = null; e._swingIdx = null; syncSwingMotion(e, meta); syncSlamMotion(e, meta); }
				// Phase 8-4 (4) 0d-3: ブレスの予告（膨らむ炎）もスタンで中断する＝上と同じ理由。
				if (e._breathAt != null) { e._breathAt = null; e._breathIdx = null; syncBreathMotion(e); }
				// Phase 8-4 (4) 0d-3: 締め上げの予告（縮む水の輪）もスタンで中断する＝上と同じ理由。
				// 中心も捨てる＝止めたら**輪が解ける**（次の tick から巻き直し）。
				// ⚠️ ボスはブーメランでスタンしない（`stunnable ?? !isBoss`）∴今の J では観測差が
				//    出ない**二重の守り**＝`coil` を雑魚に付けたときに効く（tickBlink と同じ立場）。
				//    中心は `tickCoilCrush` と同じく**両方 null**にする（片方だけ消すと半端な形が
				//    スナップショットに出る＝2026-08-29 に実測で踏んだ罠）。
				if (e._crushAt != null) {
					e._crushAt = null; e._coilCx = null; e._coilCy = null; syncCoilRing(e, meta);
				}
				// Phase 8-4 (4) 0d-3（5体目 O）: 見据えの予告（濃くなる床の印）もスタンで中断する
				// ＝止めたのに岩が落ちてくる、を作らない。**まだ投げていない印だけ**を消す
				// （'flight' の岩は投擲物側が持ち主＝空中の岩は取り消せない∴印も残す＝嘘にならない）。
				// ⚠️ ボスはブーメランでスタンしない（`stunnable ?? !isBoss`）∴今の O では観測差が
				//    出ない**二重の守り**＝`gaze` を雑魚に付けたときに効く（coil と同じ立場）。
				if (e._gazePhase === 'mark') {
					e._gazePhase = null; e._gazeCx = null; e._gazeCy = null;
					e._gazeAt = null; e._gazeHeat = 0; e._gazePath = null;
					syncGazeMark(e, meta);
				}
				// Phase 8-4 (4) 0d-3（6体目 U）: 気絶したら**空には居られない**＝滞空と急降下の予告は
				// 落として地上へ戻す（`ground` の時計は**気絶が明けてから**数える＝立ち上がった
				// 瞬間にまた舞い上がらない＝反撃の窓が気絶ぶんで終わらない）。
				// ⚠️ ここで `crashSoar` を呼んではいけない＝あれは `e.stunUntil` を立て直す∴この
				//    分岐（気絶中）から呼ぶと毎 tick 気絶が延びて永久に明けない。
				// ⚠️ ボスはブーメランでスタンしない（`stunnable ?? !isBoss`）∴今の U で気絶の入口は
				//    矢で射落とす `crashSoar` だけ＝ここは**二重の守り**（coil/gaze と同じ立場）。
				if (isSoaring(e, meta)) {
					e._soarVec = null; e._soarLeft = 0;
					enterSoarPhase(e, 'ground', e.stunUntil, resolveSoar(e, meta)?.groundMs ?? 1560);
					syncSoarMotion(e, meta);
				}
				// Phase 5.5k k-9: 突進もスタンで中断する（溜め中に殴られたら走り出さない・
				// 走行中に止められたらそこで終わる）。壁への激突で立てた気絶もここを通る＝
				// 気絶が明けた tick に走行が再開しないための後始末でもある。
				if (resolveDash(e, meta)) { cancelDash(e); syncDashMotion(e); syncDashSprite(e, meta); }
				// Phase 8-4 (4) 0d-3（7体目 G）: 気絶したら惰性も捨てる＝壁に激突して崩れた巨体が
				// 滑り続けない（＝反撃の窓では本当に止まっている）。土煙の絵も**ここで**消す
				// ＝この分岐は下の同期まで行かず `continue` する∴消し忘れると気絶中も土煙が
				// 出たまま「まだ危ない」に見える（＝殴れる窓を絵が否定する）。
				if (resolveMomentum(e, meta)) { cancelMomentum(e); syncMomentumMotion(e, meta); }
				// Phase 8-4 (4) 0d-3（8体目 I）: 気絶したら舌も捨てる＝掴まれたままにしない
				// （止めたのに引き寄せられる、を作らない）。帯の絵も**ここで**消す＝この分岐は
				// 下の同期まで行かず `continue` する∴消し忘れると気絶中も舌が伸びたまま残る。
				if (resolveTongue(e, meta)) { cancelTongue(e); syncTongueMotion(e, meta); }
				continue;
			}
			// Phase 5.5k k-7.5: 立っている予告は**他の専有状態より先に必ず解決する**
			// （ガード/硬直/跳躍の判定より前＝予告が宙に浮いて後から不意に当たることがない）。
			const slamming = tickSlam(e, meta, now);
			// Phase 8-4 (4) 0d-2.6: 剣の予告（振り上げ）も同じ枠＝立っている予告は先に解決する。
			const swinging = tickSwing(e, meta, now);
			// Phase 8-4 (4) 0d-3: 炎のブレスの予告も同じ枠（立っている予告は先に解決する）。
			const breathing = tickBreath(e, meta, now);
			// Phase 8-4 (4) 0d-3（4体目 J）: 締め上げの予告も同じ枠（立っている予告は先に解決する）。
			// ⚠️ 硬直（`frozen`）より**前**に呼ぶ＝解決が締め上げ自身の硬直を立てる∴後ろに置くと
			//    2回目以降の締め上げが宙吊りになる（跳躍の 0d-2.7 の罠と同型）。
			const crushing = tickCoilCrush(e, meta, now);
			// Phase 8-4 (4) 0d-3（4体目 J）: 輪の縮みは**硬直中も進める時計**（tickHide/tickBlink と
			// 同じ枠）。ここを行動ゲートの中（＝泳ぎと同じ場所）に置くと、攻撃硬直と歩幅の溜めの
			// あいだ輪が止まって見える＝「ゆっくりでも常に小さくなっていく」が崩れる（実測済み）。
			if (meta.coil) tickCoilShrink(e, meta, now);
			// Phase 8-4 (4) 0d-3（5体目 O）: 見据えの周期も**硬直中も進める時計**（上と同じ枠）。
			// ここを行動ゲートの中に置くと、岩を投げた直後の硬直（throwFreezeMs）と歩幅の溜めの
			// あいだ印が止まる＝「印が濃くなっていく」告知が途切れる（J で実測済みの罠）。
			if (meta.gaze) tickGaze(e, meta, now);
			// Phase 8-4 (4) 0d-3（8体目 I）: 舌の相も**硬直中も進める時計**（上と同じ枠）。
			// 噛みつきの硬直（attackFreezeMs 480）と毒沫の硬直のあいだに伸びと引き寄せが
			// 止まると「段階的に引かれる」に見える（J で実測した罠）。
			// ⚠️ 戻り値 true ＝**この tick は移動も攻撃もしない**（錨で固定＝引かれている時間が
			//    そのまま殴れる窓になる）∴下の行動ゲートの条件に `!tongueBusy` を入れる。
			const tongueBusy = meta.tongue ? tickTongue(e, meta, now) : false;
			// 隠れ↔出現の周期を更新（hide を持つ敵のみ＝潜み鮫・地中蟲・N 砂嵐の蠍王）
			tickHide(e, meta, now);
			// Phase 5.5k k-8: 瞬間移動（術士）＝消えている間と出現した tick を専有する。
			// tickHide と同じ「タイマー駆動」の枠で呼ぶ＝硬直中も時計は進める
			//（詠唱の硬直で周期が狂わない＝tickCombatMode と同じ理由）。
			// ⚠️ 2026-08-18 実測：下の行動ゲートの `&& !blinking` は今の術士では観測差が出ない
			//    （消えている間の攻撃は `if (!e.hidden) enemyAttack(...)` が独立に止めており
			//     speed 0 で歩けもしない）＝**二重の守り**。blink を歩く敵に付けたときに効く。
			const blinking = tickBlink(e, meta, now);
			// Phase 9-6: 横向き敵の向きをプレイヤーに合わせる（毎 tick・移動しなくても向き直る）
			applySideFacing(e, meta);
			// Phase 5.5k: directional な敵はガード判定を移動/攻撃より先に行う＝ガード中は
			// 両方スキップする（移動しない・攻撃しない・向きはロックされたまま＝ユーザー設計）。
			const isGuarding = meta.directional ? tickGuard(e, meta, now) : false;
			// Phase 5.5k（2026-08-12）: 攻撃硬直＝攻撃を出した直後の窓は移動も攻撃もしない。
			// プレイヤーの movePlayer が _atkUntil 中に足を止めるのと対称（player.js）。
			const frozen = e._freezeUntil != null && now < e._freezeUntil;
			// Phase 8-4 (4) 0d-3（7体目 G）: 慣性は**硬直と構えのあいだ捨てる**＝殴り返す窓では
			// 体が本当に止まっている（滑りながら硬直すると窓が窓でなくなる＝GUIDE §7-8）。
			// ⚠️ 下の移動ゲートは硬直中に呼ばれない∴ここで捨てないと「硬直が明けた瞬間に
			//    さっきの速さで走り出す」＝プレイヤーから見ると硬直が無かったことになる。
			if ((frozen || isGuarding) && resolveMomentum(e, meta)) cancelMomentum(e);
			// Phase 5.5k（2026-08-12）: 遠隔／近接の二相を持つ敵はどちらのモードかを更新する
			// （硬直中も時計は進める＝硬直でリズムが狂わない）。
			const cmode = tickCombatMode(e, meta, now);
			// Phase 5.5k k-3: 跳躍（跳躍蜘蛛）は溜め〜滞空〜着地硬直の間 移動/攻撃を専有する。
			// ガードや硬直と同じ「この tick は他の行動をしない」枠＝先に判定する。
			// Phase 8-4 (4) 0d-2.7: **始まった跳躍は硬直では止めない**（tickHide/tickBlink と同じ
			// 「時計は進める」枠）。跳躍蜘蛛は attack:'charge' も持つ＝体当たりの予告が立った
			// tick に跳び始めると、予告の解決で立つ攻撃硬直（MELEE_FREEZE_MS）が
			// **滞空前の溜めを宙吊りにする**（実測：溜めが 3 tick → 6 tick に伸びた）。
			// ∴硬直で止めるのは「新しく跳び始めること」だけにする（下の shell/leech/dash と
			// 違い、跳躍は始まると自分の時計だけで完結する状態機械∴宙吊りが観測に出る）。
			const leapBusy = e._leapPhase != null && e._leapPhase !== 'ground';
			const leaping = (!isGuarding && (leapBusy || (!frozen && !slamming && !swinging && !breathing)))
				? tickLeap(e, meta, now) : false;
			// Phase 8-4 (4) 0d-3（6体目 U）: 滞空〜急降下も跳躍と同じ枠＝**始まったら硬直では
			// 止めない**（`soarBusy`＝地上以外の相）。理由も同じ＝着地硬直（`landFreezeMs`）を
			// 自分で立てる状態機械∴硬直で止めると2周目以降が宙吊りになる（0d-2.7 の罠）。
			// 空から雷撃弾を投げた硬直の最中も滞空の時計は進む必要がある（`airMs` の上限と
			// 軸合わせの判定が止まると「ずっと空に居る」に化ける）。
			// ⚠️ 硬直で止めるのは**新しく舞い上がること**だけ（`ground` 相は soarBusy に入れない）
			//    ＝鉤爪を振った直後にいきなり飛ばない＝殴り返す窓が予告なく消えない。
			const soarBusy = e._soarPhase != null && e._soarPhase !== 'ground';
			const soaring = (!isGuarding && !leaping && (soarBusy || (!frozen && !slamming && !swinging && !breathing)))
				? tickSoar(e, meta, now) : false;
			// Phase 5.5k k-4: 甲羅の開閉（火吐き亀）＝籠もっている間は移動も攻撃もしない
			// （ガード/硬直/跳躍と同じ「この tick は他の行動をしない」枠）。開いた瞬間の炎は
			// tickShell の中で出る＝籠もりから開く tick だけ攻撃が起きる。
			const shelled = (!isGuarding && !frozen && !leaping) ? tickShell(e, meta, now) : false;
			// Phase 5.5k k-5: 張り付き（ルピー喰い）＝張り付いている間はプレイヤーへ貼り付いて
			// ルピーを吸うだけ（移動も攻撃もしない）。上と同じ「この tick を専有する」枠。
			const leeching = (!isGuarding && !frozen && !leaping && !shelled) ? tickLeech(e, meta, now) : false;
			// Phase 5.5k k-9: 直線突進（突進猪）＝溜め〜突進〜硬直の間 移動/攻撃を専有する
			// （跳躍と同じ枠）。硬直中も idle へ戻る判断はここで行う＝周期が硬直で狂わない。
			const dashing = (!isGuarding && !frozen && !leaping && !shelled && !leeching)
				? tickDash(e, meta, now) : false;
			// Phase 5.5k k-4: 向き固定（盾騎士）＝turnMs ごとにだけ向き直る。移動より先に
			// 決める（移動側は向きを触らない＝dirLocked を渡す）。
			const dirLocked = tickFaceLock(e, meta, now);
			// ⚠️ `!soaring` ＝`rise`/`aim`/`dive`/`land` の4相はこの tick を専有する。`ground` と
			//    `air` は tickSoar が false を返す＝ここが開く（地上は歩き＋鉤爪、空は旋回＋雷撃弾）。
			if (!isGuarding && !frozen && !leaping && !soaring && !shelled && !leeching && !slamming && !swinging && !breathing && !crushing && !blinking && !dashing && !tongueBusy) {
				if (resolveHitAndAway(e, meta)) {
					bossTickHitAndAway(e, meta);
				} else if (cmode === 'ranged') {
					enemyKeepDistance(e, meta, resolveEnemySpeed(e, meta), resolveCombat(e, meta));
				} else if (meta.laneStalk) {
					// Phase 8-4 (4) 0d-3（2体目 A）: 車線取り＝真っすぐ寄らない移動アルゴリズム。
					// `combat`（間合いの二相・W）より前に置く必要は無い（laneStalk の敵は
					// `combat` を持たない）が、`zigzag`/`chase` より前＝より特殊な機構が勝つ。
					enemyLaneStalk(e, meta, resolveEnemySpeed(e, meta), meta.laneStalk);
				} else if (meta.burrowAmbush) {
					// Phase 8-4 (4) 0d-3（3体目 N）: 潜行待ち伏せ＝潜っている間だけ歩き、
					// 地上では動かない。`hide` と組で意味を持つ（隠れの周期は tickHide が持ち主）。
					enemyBurrowAmbush(e, meta, resolveEnemySpeed(e, meta), meta.burrowAmbush);
				} else if (meta.coil) {
					// Phase 8-4 (4) 0d-3（4体目 J）: 巻きつき＝プレイヤーへ寄らず輪の周を泳ぐ。
					// 設定はフェーズで差し替わる（`resolveCoil`）＝HP50% で「半周で締め上げる」形へ。
					enemyCoil(e, meta, resolveEnemySpeed(e, meta), resolveCoil(e, meta));
				} else if (meta.gaze) {
					// Phase 8-4 (4) 0d-3（5体目 O）: 見据え＝**印**へ寄る（プレイヤーへは寄らない）。
					// 周期そのものは上の `tickGaze`（行動ゲートの外）が持ち主＝ここは歩くだけ。
					enemyGazeStride(e, meta, resolveEnemySpeed(e, meta), resolveGaze(e, meta));
				} else if (meta.soar) {
					// Phase 8-4 (4) 0d-3（6体目 U）: 滞空＝相で寄り方が変わる（地上は追う・
					// 空は `orbitRange` を保って軸へ回り込む）。周期そのものは上の tickSoar が持ち主。
					enemySoarStride(e, meta, resolveEnemySpeed(e, meta), resolveSoar(e, meta));
				} else if (meta.momentum) {
					// Phase 8-4 (4) 0d-3（7体目 G）: 慣性＝プレイヤーの**位置**ではなく自分の
					// **速度**を追う＝止まれない・曲がれない。`resolveEnemySpeed` は渡さない
					// （速さは momentum の3つの数だけが決める・設定はフェーズで差し替わる）。
					enemyMomentumSlide(e, meta, resolveMomentum(e, meta), now);
				} else if (meta.tongue) {
					// Phase 8-4 (4) 0d-3（8体目 I）: 舌＝**動くのは相手**∴舌が出ているあいだは
					// 1歩も歩かない（錨）。跳ねて寄るのは帯の外に居るとき、および帯の中でも
					// **打ち終わりの間（cooldownMs）だけ**＝同じ地点から2度引かない（2026-09-01）。
					// `resolveEnemySpeed` は渡さない＝速さは hopCells/hopMs だけが決める。
					enemyToadHop(e, meta, resolveTongue(e, meta), now);
				} else if (meta.zigzag) {
					enemyZigzagFly(e, meta, resolveEnemySpeed(e, meta), meta.zigzag);
				} else {
					enemyChase(e, resolveEnemySpeed(e, meta), dirLocked);
				}
				// 隠れ中は攻撃しない（隠れて寄るだけ）
				// Phase 8-4 (4) 0d-3（7体目 G）: **走っている巨体は武器を振らない＝体でぶつかる**。
				// ⚠️ これが無いと機構が絵と食い違う（実測してから足した）：剣の間合い 1.2 は体当たりの
				//    間合い 1.0 より**外**∴速いまま寄って来ても必ず剣の間合いで止まって振り、予告の
				//    tick は惰性を捨てる（cancelMomentum）∴接触の瞬間の速さは heavySpeed に届かない
				//    ＝**土煙の告知が一度も実現しない**（素のデータで 120 tick 放置＝体当たり 0 回・
				//    剣は 8 回・間合い 1.3 以内での最大速度 0.157 < heavySpeed 0.18）。
				// ∴速さがしきい値を越えているあいだは攻撃しない＝告知（土煙・地響き）と結果（轢かれる）が
				//    1本に繋がり、止まった／崩れた窓が「殴り合いの窓」になる（PLAN の
				//    「速度が heavySpeed を越えているあいだは体当たりで潰す」の実体）。
				const momFast = meta.momentum
					? momentumSpeed(e) >= (resolveMomentum(e, meta)?.heavySpeed ?? 0.18)
					: false;
				if (!e.hidden && !momFast) enemyAttack(e, meta);
			}
			// Phase 5.5k: directional な敵は毎tick見た目を今の状態（向き/攻撃窓/構え窓）に
			// 揃える＝enemyAttack が同tickで _atkUntil を立てた場合も即座に反映される
			// （プレイヤーの tickAttackPose と同じ「論理時間窓→毎tick同期」の作法）。
			if (meta.directional) syncDirectionalSprite(e, meta);
			// Phase 5.5k k-3c: 跳躍を持つ敵は windup 相の間だけ見た目を差し替える
			// （tickLeap 自体は上で呼んでいる＝ここは絵の同期だけ）。
			if (meta.leap) syncLeapSprite(e, meta);
			// Phase 5.5k k-4: 甲羅を持つ敵は開/閉で絵を切り替える（無敵の理由を見せる）。
			if (meta.shell) syncShellSprite(e, meta);
			// Phase 5.5k k-8b: 瞬間移動を持つ敵は出現直後の詠唱の窓だけ絵を差し替える
			// （殴れる窓を見せる）。隠れている間は canvas を触らない＝差替は姿がある時だけ。
			if (meta.blink && !e.hidden) syncCastSprite(e, meta);
			// Phase 5.5k k-7.5: 体当たりの予告モーション（拡大縮小2往復）を状態に合わせる。
			syncSlamMotion(e, meta);
			// Phase 8-4 (4) 0d-2.6: 剣の予告モーション（剣を振り上げる）を状態に合わせる。
			syncSwingMotion(e, meta);
			// Phase 8-4 (4) 0d-3: 炎のブレスの予告モーション（口元で炎の玉が膨らむ）。
			syncBreathMotion(e);
			// Phase 8-4 (4) 0d-3: 巻きつきの輪を床に描く（機構の唯一の告知＝どこが輪の内側か）。
			if (meta.coil) syncCoilRing(e, meta);
			// Phase 8-4 (4) 0d-3（5体目 O）: 見据えの印を床に描く（どこに岩が落ちるかの唯一の告知）。
			if (meta.gaze) syncGazeMark(e, meta);
			// Phase 8-4 (4) 0d-3（6体目 U）: 滞空の告知（体が浮いて真下に影＝**今は剣が届かない**）。
			if (meta.soar) syncSoarMotion(e, meta);
			// Phase 8-4 (4) 0d-2.6（2回目の調整）: 攻撃硬直の絵（前かがみで止まる＝殴り返す窓）。
			syncRecoverMotion(e, now);
			// Phase 5.5k k-9: 突進の溜めモーション（前後に細かく揺れる）を状態に合わせる。
			// k-9b: 絵そのものも溜め／気絶へ差し替える（揺れと ⭐ だけでは状態が読めない）。
			if (resolveDash(e, meta)) { syncDashMotion(e); syncDashSprite(e, meta); }
			// Phase 8-4 (4) 0d-3（7体目 G）: 慣性の告知（土煙＝**今この岩は危ない**）。
			// 硬直の絵（`.attack-recover`）より後に置く＝速さがしきい値を越えている tick には
			// 硬直は立っていない（硬直中は cancelMomentum で速度 0）∴衝突しないが、
			// 「今どう動いているか」を最後に上書きする順番に揃える（U の滞空と同じ趣旨）。
			if (meta.momentum) syncMomentumMotion(e, meta);
			// Phase 8-4 (4) 0d-3（8体目 I）: 舌の告知（口元から伸びる帯＋打つ前に膨らむ体）。
			// ⚠️ 最後に置く＝「今どう動いているか」を上書きする順番に揃える（G/U と同じ趣旨）。
			if (meta.tongue) syncTongueMotion(e, meta);
		}
	}

	return {
		enemyTick,
		enemyChase,
		resolveEnemySpeed,     // Phase 9-6: 地形別速度（両生敵）のテスト用
		// Phase 8-4 (4) 層1: フェーズで差し替わる表の解決（テスト用・boss.js は書くだけ）
		resolveAttackList,
		resolveModeWeights,
		resolveHitAndAway,
		resolveCombat,
		resolveDash,           // Phase 8-4 (4) 0d-3: 突進の設定（フェーズ差替を含む・テスト用）
		resolveHide,           // Phase 8-4 (4) 0d-3: 隠れの周期（フェーズ差替を含む・テスト用）
		resolveCoil,           // Phase 8-4 (4) 0d-3: 巻きつきの設定（フェーズ差替を含む・テスト用）
		resolveGaze,           // Phase 8-4 (4) 0d-3: 見据えの設定（フェーズ差替を含む・テスト用）
		resolveSoar,           // Phase 8-4 (4) 0d-3: 滞空の設定（フェーズ差替を含む・テスト用）
		resolveMomentum,       // Phase 8-4 (4) 0d-3: 慣性の設定（フェーズ差替を含む・テスト用）
		momentumSpeed,         // Phase 8-4 (4) 0d-3: 今の速さ（土煙/体当たり/自壊と同じ1つの数）
		resolveTongue,         // Phase 8-4 (4) 0d-3: 舌の設定（フェーズ差替を含む・テスト用）
		tickTongue,            // Phase 8-4 (4) 0d-3: 舌の相の時計（5相の1周・テスト用）
		reelPlayer,            // Phase 8-4 (4) 0d-3: 引き寄せ1 tick（通行判定を通す・テスト用）
		enemyToadHop,          // Phase 8-4 (4) 0d-3: 帯の外だけ跳ねて寄る（I 沼地の大蝦蟇・テスト用）
		tongueBiteRange,       // Phase 8-4 (4) 0d-3: 舌を離す距離＝噛みつきの到達距離（テスト用）
		resolveEnemySprite,    // Phase 5.5k: 向き別スプライト名解決のテスト用
		resolveAttackFreezeMs, // Phase 5.5k: 攻撃硬直の長さ（テスト用）
		tickCombatMode,        // Phase 5.5k: 遠隔／近接の二相（テスト用）
		enemyKeepDistance,     // Phase 5.5k: 間合いを保つ移動（テスト用）
		tickHide,              // Phase 5.5k k-3: 隠れ↔出現の無敵窓（テスト用）
		tickLeap,              // Phase 5.5k k-3: 跳躍の状態機械（テスト用）
		enemyZigzagFly,        // Phase 5.5k k-3: ジグザグ飛行（テスト用）
		tickFaceLock,          // Phase 5.5k k-4: 向き固定（盾騎士・テスト用）
		tickShell,             // Phase 5.5k k-4: 甲羅の開閉（火吐き亀・テスト用）
		tickLeech,             // Phase 5.5k k-5: 張り付き＋吸血（ルピー喰い・テスト用）
		tickBlink,             // Phase 5.5k k-8: 瞬間移動の状態機械（術士・テスト用）
		pickBlinkCell,         // Phase 5.5k k-8: 出現先の決定（直前の方角を除く乱択・テスト用）
		tickDash,              // Phase 5.5k k-9: 直線突進の状態機械（突進猪・テスト用）
		syncDashSprite,        // Phase 5.5k k-9b: 溜め／気絶のポーズ差替（テスト用）
		dashReachHit,          // Phase 5.5k k-9: 突進の当たり判定（走行軸の前方だけ・テスト用）
		tickSlam,              // Phase 5.5k k-7.5: 体当たりの予告→解決（テスト用）
		slamReachHit,          // Phase 5.5k k-7.5: 体当たりの到達判定（テスト用）
		tickSwing,             // Phase 8-4 (4) 0d-2.6: 剣の予告→解決（テスト用）
		swordReach,            // Phase 8-4 (4) 0d-2.6: 剣の到達判定（十字・端から測る・テスト用）
		enemyLaneStalk,        // Phase 8-4 (4) 0d-3: 車線取りの移動（A 炎のサラマンドラ・テスト用）
		tickBreath,            // Phase 8-4 (4) 0d-3: ブレスの予告→解決（テスト用）
		breathLaneDir,         // Phase 8-4 (4) 0d-3: 吐ける車線の判定（円錐の幅から導出・テスト用）
		breatheCone,           // Phase 8-4 (4) 0d-3: 円錐の炎（壁で止まる・テスト用）
		enemyCoil,             // Phase 8-4 (4) 0d-3: 巻きつきの移動（J 深海の海蛇・テスト用）
		claimCoil,             // Phase 8-4 (4) 0d-3: 輪の中心を決め直す（巻き直し・テスト用）
		tickCoilCrush,         // Phase 8-4 (4) 0d-3: 締め上げの予告→解決（テスト用）
		crushCoil,             // Phase 8-4 (4) 0d-3: 輪の内側を潰す（中心から測る・テスト用）
		tickGaze,              // Phase 8-4 (4) 0d-3: 見据えの時計（印→岩→休みの1周・テスト用）
		claimGaze,             // Phase 8-4 (4) 0d-3: 印を押し直す（＝機構の起点・テスト用）
		enemyGazeStride,       // Phase 8-4 (4) 0d-3: 印へ寄る移動（O 古森の巨人・テスト用）
		gazeHeat,              // Phase 8-4 (4) 0d-3: 印の濃さ 0〜1（絵と音とテストが読む数）
		tickSoar,              // Phase 8-4 (4) 0d-3: 滞空の状態機械（6拍の1周・テスト用）
		enemySoarStride,       // Phase 8-4 (4) 0d-3: 地上は追う／空は旋回（U 嵐の鷲王・テスト用）
		soarDiveVec,           // Phase 8-4 (4) 0d-3: 落ちる軸の判定（軸から外れれば落ちて来ない・テスト用）
		detachLeech,           // Phase 5.5k k-5: 張り付きを剥がす（combat.js の被弾フックが呼ぶ）
		crashSoar,             // Phase 8-4 (4) 0d-3: 矢で射落とす（combat.js の被弾フックが呼ぶ）
		bossTickHitAndAway,
		enemyAttack,
	};
}
