// game/boss.js ── ボス戦・エンディング（Phase 0-2 Step 5）
// createBoss(deps) factory で生成する。
// onBossDefeated / startBossBattle / startEnding を提供。

import { TILE } from '../shared/tiles.js';
import { ENEMY_META } from '../shared/enemies.js';
import { countTriforces } from '../shared/triforce.js';
import { gameLayerEntries } from '../shared/layers.js';
import { makeSprite } from '../shared/sprites.js';
import { mountIconEls } from '../shared/ui-icons.js';
import { playSound, playBgm, stopBgm } from '../shared/sounds.js';
import { SAVE_KEY, CLEARED_KEY, ALTAR_EXIT_ID } from './constants.js';

/**
 * createBoss(deps) – factory
 *
 * deps:
 *   getStageData()               – stageData
 *   getPlayer()                  – player
 *   getEnemies()                 – enemies 配列
 *   setEnemies(v)                – enemies setter
 *   getMapData()                 – mapData
 *   getCurrentLayer()            – currentLayer
 *   getStageKey()                – stageKey
 *   getCharLayerEl()             – charLayerEl
 *   getBossRoomLocked()          – bossRoomLocked
 *   setBossRoomLocked(v)         – setter
 *   getBossDefeating()           – _bossDefeating フラグ
 *   setBossDefeating(v)          – setter
 *   getPendingTriforcePieceEl()  – _pendingTriforcePieceEl
 *   setPendingTriforcePieceEl(v) – setter
 *   getCellPx()                  – セルサイズ(px)
 *   toTileRow(y) / toTileCol(x) – float → タイル座標
 *   getSS(lk, sk)                – ステージ状態取得
 *   getExitRegistry()            – MAP_ENTER の id→宛先レジストリ（祭壇誘導判定に使用）
 *   evaluateConditions()         – 条件評価
 *   lockBossDoors()              – ボス扉を閉じる
 *   unlockBossDoors()            – ボス扉を開ける
 *   showBossRoomLockEffect()     – ロックエフェクト
 *   renderBoard()                – ボード再描画
 *   renderChars()                – キャラ再描画
 *   updateHud()                  – HUD 更新
 *   pulse(text, dur)             – メッセージ表示
 *   saveGame()                   – セーブ
 *   stopGameLoop()               – ゲームループ停止
 *   startGameLoop()              – ゲームループ開始
 *   showExplosionEffect(r, c)    – 爆発エフェクト（projectile.js から注入）
 *   grantReward(content)         – 報酬付与の共通口（player.js。bossReward で使用）
 *   bossHpbarEl / bossNameEl / bossHpFillEl – DOM 要素
 *   endingOverlayEl              – エンディングオーバーレイ DOM
 *   hasCleared() / saveCleared() – クリア済み判定・保存
 */
export function createBoss(deps) {
	const {
		getStageData, getPlayer, getEnemies, setEnemies,
		getMapData, getCurrentLayer, getStageKey,
		getCharLayerEl,
		getBossRoomLocked, setBossRoomLocked,
		getBossDefeating, setBossDefeating,
		getPendingTriforcePieceEl, setPendingTriforcePieceEl,
		getCellPx, toTileRow, toTileCol,
		getSS,
		getExitRegistry,
		evaluateConditions,
		lockBossDoors, unlockBossDoors,
		renderBoard, renderChars, updateHud,
		pulse, saveGame,
		stopGameLoop, startGameLoop,
		showExplosionEffect,
		// Phase 9-6: stageData.bossReward の授与に使う（player.js の共通付与口）
		grantReward,
		bossHpbarEl, bossNameEl, bossHpFillEl,
		endingOverlayEl,
		hasCleared, saveCleared,
	} = deps;

	// ── ユーティリティ ─────────────────────────────────────
	function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

	// メッセージを「出して、表示時間ぶん待って、次へ」の直列で見せる。
	// pulse は共有メッセージバー1本（ui.js msgBarEl）＝次の pulse が前を即上書きする∴
	// 待たずに続けて呼ぶと、pulse に渡した表示時間は意味を持たない。
	// 🔴 2026-08-19 ユーザー報告「銀のブーメランがいつの間にか手に入ってた」の原因はこれ
	//    （終幕が sleep(700)/sleep(900) で 3000/2600ms 指定のメッセージを1秒未満で上書きしていた）。
	async function say(text, dur) { pulse(text, dur); await sleep(dur); }

	// ── ボス HP バー ───────────────────────────────────────
	function showBossHpBar(boss) {
		bossHpbarEl.classList.remove('hidden');
		bossNameEl.textContent = ENEMY_META[boss.type]?.name ?? 'ボス';
		updateBossHpBar(boss);
	}

	function updateBossHpBar(boss) {
		const pct = Math.max(0, boss.hp / boss.maxHp * 100);
		bossHpFillEl.style.width = `${pct}%`;
		if (pct < 25) bossHpFillEl.style.background = 'linear-gradient(90deg,#880000,#cc0000)';
		else if (pct < 50) bossHpFillEl.style.background = 'linear-gradient(90deg,#aa2000,#ee4010)';
		else bossHpFillEl.style.background = 'linear-gradient(90deg,#cc2020,#ff5050)';
	}

	function hideBossHpBar() {
		bossHpbarEl.classList.add('hidden');
	}

	// ── ボス多段フェーズ ───────────────────────────────────
	// HP が閾値を下回った瞬間に「ボスの行動の元データ」を差し替える（combat.js の
	// dealDamageToEnemy が毎ダメージで呼ぶ）。
	//
	// ★ Phase 8-4 (4) 層1（2026-08-23）＝**ここは書くだけ・読む場所は enemy-ai.js の
	//   resolve*() 1か所**。フェーズは `boss`（エンティティ）側のフィールドに書き、AI は
	//   毎 tick そこを見る＝「フェーズごとに AI の分岐を足す」形にしない。
	//   書けるもの（すべて任意・書かなければ従来どおり）：
	//     speedMultiplier          … 移動速度（meta.speed に対する倍率）
	//     attackCooldownMultiplier … 攻撃間隔（表の cooldown に対する倍率）
	//     attacks                  … 攻撃表そのものの差し替え（技を入れ替える）
	//     modeWeights              … ヒット＆アウェイの接近の癖
	//     hitAndAway / combat      … 移動 AI の型そのもの（false で機構を切れる）
	//   倍率はどれも**META の値から計算する**＝フェーズを跨いでも複利で増減しない
	//   （0.66 で 1.3 倍・0.33 で 1.6 倍 ＝ 2.08 倍ではなく 1.6 倍）。
	//
	// 🔴 旧実装のバグ（2026-08-23 に判明・8-4 (4) の動機の1つ）＝
	//   `attackCooldownMultiplier` は `boss.attack.cooldown` を書き換えていたが、
	//   ① `buildEnemies()` はエンティティに `attack` を持たせない∴条件が常に偽
	//   ② そもそも AI は `meta.attacks` を読む∴書けても読まれない
	//   の**二重に死んでいた**（13ボスのうち10体がこの倍率を持つ＝10体分の「後半で
	//   攻撃が激しくなる」が1度も起きていなかった）。
	function checkBossPhase(boss) {
		const meta = ENEMY_META[boss.type];
		if (!meta?.phases) return;
		for (const phase of meta.phases) {
			const ratio = boss.hp / boss.maxHp;
			if (ratio <= phase.hpThreshold && !boss.phasesTriggered?.includes(phase.hpThreshold)) {
				if (!boss.phasesTriggered) boss.phasesTriggered = [];
				boss.phasesTriggered.push(phase.hpThreshold);
				applyBossPhase(boss, meta, phase);
				const bossEl = document.getElementById(`char-enemy-${boss.id}`);
				if (bossEl) {
					let cnt = 0;
					const t = setInterval(() => {
						bossEl.style.opacity = (cnt % 2 === 0) ? '0.2' : '1';
						if (++cnt >= 8) { clearInterval(t); bossEl.style.opacity = '1'; }
					}, 120);
				}
				pulse(`${meta.name} が 怒り狂った！`, 2500);
			}
		}
	}

	// フェーズ1つ分をエンティティへ適用する（enemy-ai.js の resolve*() が読む側）。
	function applyBossPhase(boss, meta, phase) {
		if (phase.speedMultiplier) boss.speed = meta.speed * phase.speedMultiplier;
		if (phase.attackCooldownMultiplier) boss._atkCdMul = phase.attackCooldownMultiplier;
		if (phase.attacks) {
			boss._attacks = phase.attacks;
			// 立っている体当たりの予告は捨てる＝表を差し替えた後に**旧 index が新しい表の
			// 別の技として解決する**のを防ぐ（予告→解決の間に相が変わり得る）。
			if (boss._slamAt != null) { boss._slamAt = null; boss._slamIdx = null; }
			// 0d-3: ブレスの予告も同じ理由で捨てる（`_breathIdx` が旧 index を指している）。
			if (boss._breathAt != null) { boss._breathAt = null; boss._breathIdx = null; }
			// ⚠️ `_attackTimes` は消さない＝差し替えた瞬間に全技が一斉発火しない
			//   （クールダウンの起点が 0 に戻ると「相が変わった瞬間に全弾」になる）。
		}
		if (phase.modeWeights) boss._modeWeights = { ...phase.modeWeights };
		if (phase.hitAndAway !== undefined) boss._hitAndAway = phase.hitAndAway;
		if (phase.combat !== undefined) {
			boss._combat = phase.combat;
			// 遠隔/近接の二相は作り直す（新しい周期で数え直す）。位相は id から決まる∴
			// 作り直しても乱数は入らない（enemy-ai.js phaseOffsetMs）。
			boss._cmode = null; boss._cmodeUntil = null;
		}
		// Phase 8-4 (4) 0d-3（2体目 A 炎のサラマンドラ）: **後半で機構そのものが生える**口。
		// 表（`attacks`）の差し替えだけでは「同じ動きで攻撃が増える」しか作れない∴
		// 移動アルゴリズムを変える機構（突進）を相で足せるようにした。
		// ⚠️ 状態機械の変数も**同時に初期化する**＝前半に `_dashPhase` が付いていた敵
		//    （突進を持つボスが表を差し替える形）で相が変わったとき、走行中の残りセル
		//    （`_dashLeft`）を引き継いだまま新しい設定で走り出すのを防ぐ。
		if (phase.dash !== undefined) {
			boss._dash = phase.dash;
			boss._dashPhase = 'idle';
			boss._dashUntil = 0;
			boss._dashLeft  = 0;
		}
		// Phase 8-4 (4) 0d-3（3体目 N 砂嵐の蠍王）: 隠れ↔出現の周期を相で差し替える口
		// （`resolveHide` が読む）。N は後半で潜行が短くなる＝待ち伏せの回数が増える。
		// ⚠️ `_hideUntil` は**触らない**＝走っている窓はそのまま終わらせ、新しい周期は
		//    次の切り替えから効かせる。ここで初期化すると `tickHide` の「未初期化＝隠れで
		//    始まる」経路に落ちて**相が変わった瞬間に無敵になる**（＝殴っていた窓が消える）。
		if (phase.hide !== undefined) boss._hide = phase.hide;
		// Phase 8-4 (4) 0d-3（4体目 J 深海の海蛇）: 巻きつきの設定を相で差し替える口
		// （`resolveCoil` が読む）。J は後半で「半周で締め上げる」形になる。
		// ⚠️ 輪は**巻き直させる**（`_coilCx = null`）＝走っている周をそのまま続けると、
		//    新しい半径（2.2）より外にいる体が旧半径（2.6）の弧を辿り続けて輪が二重に見える。
		//    `_dash` と同じ「状態機械も同時に初期化する」側の扱い（`_hide` とは逆）。
		// ⚠️ 立っている締め上げの予告も捨てる＝予告した半径（`_crushR`）と新しい設定が
		//    食い違ったまま解決すると「輪の外に出たのに潰される」になる。
		if (phase.coil !== undefined) {
			boss._coil = phase.coil;
			boss._coilCx = null; boss._coilCy = null;
			boss._coilArc = 0; boss._coilStall = 0;
			boss._crushAt = null; boss._crushR = null;
		}
		// Phase 8-4 (4) 0d-3（5体目 O 古森の巨人）: 見据えの設定を相で差し替える口
		// （`resolveGaze` が読む）。O は後半で「印が速く・潰す範囲が広い」形になる。
		// ⚠️ 状態機械は**触らない**（`_hide` と同じ側の扱い）＝走っている1周（印→岩→休み）は
		//    そのまま終わらせる。理由＝予告の長さ（`_gazeSpan`）と潰す半径（`_gazeR`）は
		//    **印を押した瞬間に固定してある**∴新しい設定が混ざっても「床に描いてある印」と
		//    「落ちる岩の範囲」がずれない。逆にここで消すと、空中の岩を残したまま印だけが
		//    消える＝**予告なしで岩が落ちてくる**（coil の輪とは事情が違う）。
		if (phase.gaze !== undefined) boss._gaze = phase.gaze;
		// Phase 8-4 (4) 0d-3（6体目 U 嵐の鷲王）: 滞空の設定を相で差し替える口
		// （`resolveSoar` が読む）。U は後半で「地上に居る時間が短く・急降下が速い」形になる。
		// ⚠️ 状態機械は**触らない**（`_hide` / `_gaze` と同じ側の扱い）＝走っている1周
		//    （地上→舞い上がり→滞空→予告→急降下→着地）はそのまま終わらせる。理由＝相の長さは
		//    **入った瞬間に固定してある**（`_soarSpan`）∴新しい設定が混ざっても見えている予告と
		//    実際の解決がずれない。逆にここで消すと**空中で相が消えて宙吊りになる**
		//    （＝滞空したまま何も起きない敵になる。着地の硬直＝反撃の窓も消える）。
		if (phase.soar !== undefined) boss._soar = phase.soar;
		// Phase 8-4 (4) 0d-3（7体目 G 岩のゴーレム）: 慣性の設定を相で差し替える口
		// （`resolveMomentum` が読む）。G は後半で「加速も上限も上がる＝もっと止まれない」形になる。
		// ⚠️ 速度ベクトルは**捨てる**（`_dash` / `_coil` と同じ側の扱い）＝新しい上限
		//    （`maxSpeed`）より速い惰性を引き継いだまま次の tick に入ると、切り上げの1 tick だけ
		//    設定より速く走る＝「相が変わった瞬間に轢かれる」を作らない。捨てても即座に
		//    走り直せる（状態機械ではない∴宙吊りになる相が無い＝`_soar`/`_gaze` とは事情が違う）。
		if (phase.momentum !== undefined) {
			boss._momentum = phase.momentum;
			boss._momVx = 0;
			boss._momVy = 0;
		}
		// Phase 8-4 (4) 0d-3（8体目 I 沼地の大蝦蟇）: 舌の設定を相で差し替える口
		// （`resolveTongue` が読む）。I は後半で「速く打ち・長く届き・強く引く」形になる。
		// ⚠️ 相は**畳む**（`_dash`/`_coil`/`_momentum` と同じ側の扱い）＝伸びている舌は捨てる。
		//    新しい `cells`（7）より長い舌や旧 `holdMs` の掴みを引き継ぐと、見えている帯と
		//    実際の判定が食い違う（「離れたのに引かれる」）。状態機械だが 'idle' からいつでも
		//    打ち直せる∴宙吊りになる相は無い（`_soar`/`_gaze` とは事情が違う）。
		// ⚠️ `_tongueAttached` は**ここでは消さない**＝掴んだままのプレイヤーを 0.5 格子へ
		//    戻す後始末（`alignPlayerToGrid`）は deps を持つ enemy-ai.js 側にしか書けない∴
		//    次の tick の `tickTongue` が「相は畳まれたのに掴んだまま」を見て畳み直す。
		//    ここで消すと**プレイヤーが半端な座標に取り残される**（幅1マスの出入口へ入れない）。
		// ⚠️ 2026-09-01 追加の のしかかり（'pounce'/'pounceAir'）も同じく畳まれる＝跳んでいる
		//    途中で相が変わったら**着地の判定は出ない**（新しい `pounceRadius` で潰すと
		//    「見えていた範囲と違う床で殴られる」）。跳び直せる∴宙吊りにはならない。
		if (phase.tongue !== undefined) {
			boss._tongue = phase.tongue;
			boss._tonguePhase = 'idle';
			boss._tongueLen = 0;
			boss._tongueAt = null;
		}
		// Phase 8-4 (4) 0d-3（9体目 { 海の主）: 打ち寄せの設定を相で差し替える口
		// （`resolveSurge` が読む）。{ は後半で「遠くから乗り上げ・深く届き・早く戻る」形になる。
		// ⚠️ 状態機械は**触らない**（`_hide` / `_gaze` / `_soar` と同じ側の扱い）＝走っている1周
		//    （予告→掃過→陸で停止→這い戻り）はそのまま終わらせる。理由が2つある：
		//    ① 陸に乗り上げている途中で相を畳むと**陸の上で idle に戻る**＝泳ぎしか持たない
		//       移動が陸で立ち往生し、しかも攻撃だけは撃てる「動かない砲台」になる。
		//    ② 相の切り替えは**殴られている最中に起きる**（HP 50% を割る瞬間）∴畳むと
		//       「殴り返す窓（`stranded`）が、殴った本人のせいで消える」＝反撃の窓を潰す。
		//    各相の終わりは入った瞬間に時刻で固定してある（`_surgeAt`）∴設定が混ざっても
		//    見えている予告・停止の長さは縮まない（`_soar` と同じ守り）。
		if (phase.surge !== undefined) boss._surge = phase.surge;
		// Phase 8-4 (4) 0d-3（10体目 L 氷のリヴァイアサン）: 氷結の設定を相で差し替える口
		// （`resolveGlaciate` が読む）。L は後半で「凍結相が短く（剣の窓が 2 振り→1 振り）・
		// 氷柱が早く噴く」形になる。
		// ⚠️ 状態機械も**敷いてある氷も触らない**（`_hide` / `_gaze` / `_soar` / `_surge` と
		//    同じ側の扱い、しかも理由が1つ多い）：
		//    ① 氷を消すと L は**足場を失う**＝氷の上しか歩けない移動が立ち往生し、
		//       攻撃だけ撃てる「動かない砲台」になる（`_surge` の①と同じ穴）。
		//    ② 各氷の噴く時刻は**敷いた瞬間に固定してある**（セルごとの `spikeAt`）∴
		//       設定が混ざっても床に描いてある赤い予告と実際の氷柱がずれない
		//       （`_gaze` の印と同じ守り）。
		//    ③ 相の切り替えは**殴られている最中に起きる**（HP 50% を割る瞬間）∴凍結相を
		//       畳むと「殴り返す窓が、殴った本人のせいで消える」（`_surge` の②と同じ）。
		if (phase.glaciate !== undefined) boss._glaciate = phase.glaciate;
		// Phase 8-4 (4) 0d-3（11体目 X）: 詔（lockstep）の差し替え（2026-09-03: 移動は
		// `hitAndAway`＋`speedMultiplier` へ替えた＝ここは「魔法攻撃」の器・予告・打点の設定のみ）。
		//    ⚠️ 差し替えるのは**設定だけ**＝唱えている相（`_lsPhase`）も器（`_lsHeat`）も
		//       畳まない。理由は上の3つと同じ：
		//       ① 相の切り替えは**殴られている最中に起きる**（HP 50% を割る瞬間）∴唱えている
		//          途中で畳むと「殴り返す窓が、殴った本人のせいで消える」（`_surge`/`_glaciate`
		//          と同じ）。
		//       ② 床に描いた円（`_lsCells`）を残したまま相だけ消すと**予告が落ちない**
		//          ＝告知が嘘になる（`_gaze` の印と同じ守り）。
		//       ③ 器を 0 に戻すと「満ちる寸前に殴って詔を消す」抜け道が生える（＝盾を上げて
		//          待つ穴を塞ぐために作った機構の存在理由が消える）。
		if (phase.lockstep !== undefined) boss._lockstep = phase.lockstep;
		// Phase 8-4 (4) 0d-3（12体目 Z ザーネル）: 幻影（mirage）の差し替え。
		// ⚠️ Z は**素の `ENEMY_META` に `mirage` を持たない**＝この行が「相2で機構が生える」
		//    唯一の口（相1では像が湧かない＝A 後半の `dash` と同じ作法）。
		//    ⚠️ 差し替えるのは**設定だけ**＝湧いている像も収束の相（`_mgPhase`）も畳まない。
		//       理由は上の4つと同じ：
		//       ① 相の切り替えは**殴られている最中に起きる**（HP 33% を割る瞬間）∴収束の予告を
		//          畳むと「殴り返す窓が、殴った本人のせいで消える」（`_surge`/`_glaciate`/
		//          `_lockstep` と同じ）。
		//       ② 床に描いた危険域（`_mgCells`）を残したまま相だけ消すと**収束が落ちない**
		//          ＝告知が嘘になる（`_gaze` の印と同じ守り）。
		//       ③ 像を畳むと「相が上がる瞬間に斬らずに像が消える」＝像を消す作業（＝打点を
		//          削る作業）を無効にする抜け道が生える。
		if (phase.mirage !== undefined) boss._mirage = phase.mirage;
	}

	// ── 星の欠片を生成 ──────────────────────
	function spawnTriforcePiece(boss) {
		const charLayerEl = getCharLayerEl();
		if (!charLayerEl) return;
		const cellPx = getCellPx();
		const el = document.createElement('div');
		el.id = 'pending-triforce-piece';
		el.style.cssText = `
			position:absolute;
			left:${boss.x * cellPx}px;
			top:${boss.y * cellPx}px;
			width:${cellPx}px; height:${cellPx}px;
			display:flex; align-items:center; justify-content:center;
			font-size:${Math.round(cellPx * 0.65)}px;
			z-index:12; pointer-events:none;
			animation:triforce-pulse 1.5s ease-in-out infinite;
		`;
		// 10e: 盤面に置く欠片は絵文字ではなく配置アイテムと同じ triforce スプライト。
		const pieceCv = makeSprite('triforce', 'triforce', false);
		if (pieceCv) {
			const sz = Math.round(cellPx * 0.8) + 'px';
			pieceCv.style.setProperty('width',  sz, 'important');
			pieceCv.style.setProperty('height', sz, 'important');
			pieceCv.style.setProperty('position', 'static', 'important');
			pieceCv.style.setProperty('transform', 'none', 'important');
			el.appendChild(pieceCv);
		} else el.textContent = '◭';
		charLayerEl.appendChild(el);
		setPendingTriforcePieceEl(el);
	}

	// ── ボス部屋ロック演出 ────────────────────────────────
	function showBossRoomLockEffect() {
		const flash = document.createElement('div');
		flash.style.cssText = `
			position:fixed;
			inset:0;
			background:rgba(180,0,0,0.45);
			pointer-events:none;
			z-index:50;
			animation:flash-anim 0.4s ease-out forwards;
		`;
		document.body.appendChild(flash);
		setTimeout(() => flash.remove(), 420);
	}

	// ── ボス撃破演出 ─────────────────────────────────────
	async function onBossDefeated(boss) {
		if (getBossDefeating()) return;
		setBossDefeating(true);
		stopGameLoop();

		// 1. ボスを点滅
		const bossEl = document.getElementById(`char-enemy-${boss.id}`);
		if (bossEl) {
			for (let i = 0; i < 10; i++) {
				bossEl.style.opacity = (i % 2 === 0) ? '0.15' : '1';
				await sleep(140);
			}
			bossEl.remove();
		}
		// 2. 爆発エフェクト複数
		const br = toTileRow(boss.y), bc = toTileCol(boss.x);
		for (let i = 0; i < 4; i++) {
			showExplosionEffect(br + (Math.random() - 0.5), bc + (Math.random() - 0.5));
			await sleep(200);
		}
		// 3. BGM 停止・SE
		stopBgm();
		playSound('fanfare');
		// 4. 敵リストから除去
		getSS(getCurrentLayer(), getStageKey()).defeatedEnemies.add(boss.id);
		setEnemies(getEnemies().filter(x => x !== boss));
		// 5. ボス HP バー非表示・ロック解除・ドアウェイ開放
		hideBossHpBar();
		setBossRoomLocked(false);
		// Phase 6-1b: 撃破ボスを記録（NPC 台詞切り替えに使用）
		const player = getPlayer();
		if (!player.defeatedBosses) player.defeatedBosses = new Set();
		player.defeatedBosses.add(boss.type);
		const stageData = getStageData();
		const hasBossDoors = stageData?.tiles?.some(row => row.includes(TILE.DOORWAY_BOSS));
		unlockBossDoors();
		if (hasBossDoors) pulse('{{doorOpen}} 扉が開いた！', 2000);
		// 6. 条件評価
		evaluateConditions();
		// 7a. ラスボス（ザーネル）撃破 → エンディングへ（Phase 1-3）
		const isFinalBoss = ENEMY_META[boss.type]?.isFinalBoss;
		if (isFinalBoss) {
			await sleep(500);
			pulse(`${ENEMY_META[boss.type]?.name ?? 'ザーネル'} を 倒した！`, 3000);
			// 撃破フラグを解除してからエンディング演出へ（ループは startEnding が停止する）
			setBossDefeating(false);
			setTimeout(() => startEnding(), 2500);
			return;
		}
		// 7b. 星の欠片付与（`ENEMY_META[tile].dropsTriforce` を持つボス＝8ダンジョンのボス）
		// ⚠️ 2026-09-05（実行キュー 0o）まで `boss.type === TILE.DARK_LORD` を or で足していた。
		//    X 魔王は寄道（魔王の岩牢）の主＝**古代の祭壇より後**に会う相手∴欠片を落としてはいけない
		//    （落とすと `calcTotalTriforces()` の総数 8 と噛み合わず、羽衣の授与条件が壊れる）。
		//    判定は `ENEMY_META` の1本に寄せた＝`shared/triforce.js` の数え方と同じ式になる。
		const dropsTriforce = ENEMY_META[boss.type]?.dropsTriforce;
		if (dropsTriforce) {
			spawnTriforcePiece(boss);
			await sleep(600);
			pulse('{{triforce}} 星の欠片が 現れた！', 3000);
			deps.setPendingTriforcePos(null);
			const tfx = boss.x, tfy = boss.y;
			setTimeout(() => { deps.setPendingTriforcePos({ x: tfx, y: tfy }); }, 1500);
			saveGame();
		} else {
			await sleep(400);
			pulse(`${ENEMY_META[boss.type]?.name ?? 'ボス'} を倒した！`, 2500);
			saveGame();
		}
		setBossDefeating(false);
		startGameLoop();
	}

	// ── ボス戦「合格」演出（Phase 9-6 深洋O・海の主）───────────────
	// ENEMY_META に yieldAt を持つボス専用の終幕。撃破（onBossDefeated）と違い：
	//   ・爆発・撃破 SE を出さない（倒したのではなく認められた）
	//   ・星の欠片を生成しない・defeatedBosses に入れない（＝撃破フラグを立てない）
	//   ・報酬は2通り（どちらもステージ側のデータで決まる＝ここは中身を知らない）
	//       a) stageData.bossReward … その場で授与（grantReward 形の配列）
	//       b) showConditions の trigger:'bossYielded' … 封印を解いて宝箱を出す
	//          ＝プレイヤーが歩いて開けて受け取る（2026-08-19 ユーザー確定。「いつの間にか
	//          手に入ってた」＝渡された実感が無い、が a) 単独の問題だった）
	// 呼び出しは combat.js の dealDamageToEnemy（HP が閾値以下になった瞬間）。
	async function onBossYielded(boss) {
		if (getBossDefeating()) return;
		setBossDefeating(true);
		stopGameLoop();

		const meta = ENEMY_META[boss.type];
		const stageData = getStageData();
		const ss = getSS(getCurrentLayer(), getStageKey());
		// 1. 「合格」の合図（撃破ではないが節目なのでファンファーレは共通）
		playSound('fanfare');
		await say('よくやった、若き剣よ', 2600);

		// 2. HP バーを消し、ボス部屋のロックを解く
		hideBossHpBar();
		setBossRoomLocked(false);

		// 3. 深みへ退場（フェードアウト。爆発は出さない）
		//    敵リストから外すのはフェードの前（renderChars が要素を作り直さないように）。
		ss.defeatedEnemies.add(boss.id);
		setEnemies(getEnemies().filter(x => x !== boss));
		const bossEl = document.getElementById(`char-enemy-${boss.id}`);
		if (bossEl) {
			bossEl.style.transition = 'opacity 1.2s ease-out';
			bossEl.style.opacity = '0';
			await sleep(1250);
			bossEl.remove();
		}
		renderBoard(); renderChars(); updateHud();

		// 4. 見送り。⚠️ 旧実装は「bossReward が空のときだけ」出していた＝報酬を持つ本物の
		//    闘技場（field 12,19）では**一度も見られない**台詞だった。報酬の有無と見送りは無関係。
		await say(`${meta?.name ?? 'ボス'} は 深みへ帰っていった`, 2400);

		// 5. その場で授与する報酬（bossReward）。宝箱で渡す報酬はここには入れない（次の 6）。
		for (const content of stageData?.bossReward ?? []) {
			const msg = grantReward ? grantReward(content) : '';
			playSound('item');
			updateHud();
			if (msg) await say(`✨ ${msg}`, 2600);
		}

		// 6. 「主に認められた」条件を立てて封印を解く（showConditions の bossYielded）。
		//    ⚠️ 敵リストから外した**後**に評価する＝旧実装は退場より前に呼んでいたので
		//    killAll 系の封印もここでは成立しなかった。
		//    出現メッセージは showConditions[pk].message から取る＝boss.js は「何が現れたか」を
		//    知らないまま案内できる（従来 message は装飾コメント扱いの dead data だった）。
		ss.bossYielded = true;
		evaluateConditions();
		for (const [pk, cond] of Object.entries(stageData?.showConditions ?? {})) {
			if (cond?.trigger !== 'bossYielded' || !cond.message) continue;
			if (!ss.conditionsMet.has(pk)) continue;
			await say(cond.message, 2600);
		}

		// 7. 扉を開ける。最後のメッセージは待たない＝ここでループを返してプレイヤーを解放する。
		const hasBossDoors = stageData?.tiles?.some(row => row.includes(TILE.DOORWAY_BOSS));
		unlockBossDoors();
		if (hasBossDoors) pulse('{{doorOpen}} 扉が開いた！', 2000);

		saveGame();
		setBossDefeating(false);
		startGameLoop();
	}

	// ボスが「合格ライン」に達したか（combat.js が毎ダメージで問い合わせる）。
	// yieldAt を持たないボス（既存8体）は常に false ＝従来の撃破フローのまま。
	function shouldBossYield(boss) {
		const meta = ENEMY_META[boss.type];
		if (!meta?.yieldAt) return false;
		if (boss._yielded) return false;         // 二重発火防止（連打しても一度だけ）
		if (boss.hp / boss.maxHp > meta.yieldAt) return false;
		boss._yielded = true;
		return true;
	}

	// プレイヤーの占有範囲がボス扉（':'）のセルに重なっているか。
	// 半セル移動があるので「跨いでいる2セル」も見る（isPassable と同じ範囲の取り方）。
	function playerOnBossDoor() {
		const stageData = getStageData();
		const player    = getPlayer();
		if (!stageData || !player) return false;
		const r0 = Math.floor(player.y), r1 = Math.floor(player.y + 0.999);
		const c0 = Math.floor(player.x), c1 = Math.floor(player.x + 0.999);
		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				if (stageData.tiles?.[r]?.[c] === TILE.DOORWAY_BOSS) return true;
			}
		}
		return false;
	}

	// 🔴 2026-09-05 ユーザー報告「darklord_prison 0,2 に入った途端に動けなくなった／ボス扉に
	//    挟まれたような状態」の修正点。ボス扉は**プレイヤーが扉のセルから降りてから**閉める。
	//    理由＝ボス部屋の ':' はどれも**部屋の境界セル**に在り（実マップ8部屋すべて）、端遷移の
	//    着地は境界セルそのもの（game.js checkStageTransition・9-6 ⑥-landing 2026-07-29）∴
	//    着地した瞬間に閉じると**自分が立っているセルが通行不可になる**。isPassable は「今いる
	//    セル」を免除しない（免除は はしごの水/穴だけ）＝半セル動いても必ず扉セルに重なる∴
	//    4方向すべて塞がれ、さらに bossRoomLocked が端遷移も禁じる＝恒久詰み（実測：8部屋全滅）。
	//    ∴閉めるのを「扉から降りるまで」待つ。降りずに引き返した／部屋を出たら閉めずに諦める
	//    （再入室で startBossBattle がもう一度呼ばれる＝passable.js が ':' を着地でブロックしない
	//    のと同じ「逃げた後の再入場」の考え方）。
	function whenClearOfBossDoors(delayMs, run) {
		const startLayer = getCurrentLayer(), startStage = getStageKey();
		const tick = () => {
			// 部屋を出た（＝入室が成立しなかった）ら閉めない
			if (getCurrentLayer() !== startLayer || getStageKey() !== startStage) return;
			if (playerOnBossDoor()) { setTimeout(tick, 100); return; }
			run();
		};
		setTimeout(tick, delayMs);
	}

	// ── ボス戦開始 ────────────────────────────────────────
	function startBossBattle(lk, sk) {
		const boss = getEnemies().find(e => ENEMY_META[e.type]?.isBoss);
		if (!boss) {
			setBossRoomLocked(false);
			return;
		}

		whenClearOfBossDoors(400, () => {
			lockBossDoors();
			showBossRoomLockEffect();
			playSound('stageTransition');
			setBossRoomLocked(true);
			pulse('⚠ 扉が閉じた！ボスを倒さないと出られない！', 3000);

			setTimeout(() => {
				const mapData = getMapData();
				const ld = mapData.layers[lk];
				const bossBgm = ld?.bossBgm ?? 'boss';
				playBgm(bossBgm);
				showBossHpBar(boss);
				pulse(`${ENEMY_META[boss.type].name} が 現れた！`, 2500);
			}, 800);
		});
	}

	// ── スタッフロール HTML ───────────────────────────────
	function buildStaffRollHtml() {
		const AUTHOR = 'Go Kojima';
		const roles = [
			'Game Director', 'Executive Producer', 'Game Designer',
			'Level Designer', 'Programmer', 'Lead Programmer',
			'Character Designer', 'Pixel Artist', 'Background Artist',
			'UI/UX Designer', 'Sound Designer', 'Music Composer',
			'Story Writer', 'World Builder', 'Dungeon Architect',
			'Monster Designer', 'Lore Creator', 'QA Lead', 'Playtester',
		];
		// data-icon＝差し込んだ後に mountIconEls() が絵（canvas）へ差し替える（10e。
		// 中の絵文字は絵が引けなかった時の保険＝index.html のタイトルロゴと同じ作法）。
		let html = `<div class="scroll-game-title"><span data-icon="sword" data-icon-px="26">⚔</span> Blade of Lumia</div>`;
		html += `<div class="scroll-subtitle">～ ルミアの剣 ～</div>`;
		for (const role of roles) {
			html += `<div class="scroll-role">${role}</div>`;
			html += `<div class="scroll-name">${AUTHOR}</div>`;
			html += `<div class="scroll-divider"></div>`;
		}
		html += `<div class="scroll-role">Special Thanks to</div>`;
		html += `<div class="scroll-name">Kojima's family</div>`;
		html += `<div class="scroll-divider"></div>`;
		html += `<div class="scroll-thanks">Thank you for playing!</div>`;
		html += `<div class="scroll-copyright">© 2026 ${AUTHOR}</div>`;
		return html;
	}

	// ── 星の欠片・全収集チェック ──────────────────────
	function calcTotalTriforces() {
		return countTriforces(getMapData());
	}

	// 古代の祭壇（タイル ALTAR='^'）がマップ上に存在するか。
	// 存在すれば「全収集 → 祭壇へ誘導」の終盤フロー、無ければ従来の
	// 「全収集 → 即エンディング」フォールバックに分岐する（Phase 1-3/1-4）。
	// ※ 1-4 は専用ステージを作らず、フィールドに祭壇タイルを1個置く方式（A案）。
	//   将来 MAP_ENTER 経由の専用ステージにする場合は ALTAR_EXIT_ID も併用判定する。
	function altarExists() {
		const mapData = getMapData();
		if (!mapData) return false;
		// ⚠️ テストレイヤーは除外（ギミック検証ステージの祭壇で終盤フローが誤作動しない）。
		for (const [, ld] of gameLayerEntries(mapData)) {
			for (const sd of Object.values(ld.stages ?? {})) {
				for (const row of sd.tiles ?? []) {
					if (row.includes(TILE.ALTAR)) return true;
				}
			}
		}
		// フォールバック：専用ステージ方式（MAP_ENTER id）でも誘導扱いにする
		const reg = getExitRegistry?.();
		return !!(reg && reg[ALTAR_EXIT_ID]);
	}

	// ── 古代の祭壇に星の欠片を捧げる（Phase 1-4）──────────────
	// プレイヤーが祭壇タイルに乗ったとき handleTileEvent から呼ばれる。
	// 全収集していれば翼の羽衣を授ける。不足していれば拒否メッセージ。
	function offerAtAltar() {
		const player = getPlayer();
		if (player.hasWingRobe) {
			pulse('{{altar}} 古代の祭壇 …翼の羽衣は すでに授かった', 2500);
			return;
		}
		const total = calcTotalTriforces();
		if (total <= 0 || player.triforceCount < total) {
			const remain = Math.max(0, total - player.triforceCount);
			pulse(`{{altar}} 古代の祭壇 …星の欠片が ${remain}つ 足りない`, 3000);
			return;
		}
		// 全収集 → 翼の羽衣を授かる
		player.hasWingRobe = true;
		playSound('fanfare');
		showAltarLightPillar();
		pulse('{{wingRobe}} 古代の祭壇が 光り輝いた！「翼の羽衣」を 授かった！', 5000);
		updateHud();
		saveGame();
	}

	// 祭壇の光柱演出（画面中央から立ち上る光のフラッシュ）
	function showAltarLightPillar() {
		const pillar = document.createElement('div');
		pillar.style.cssText = `
			position:fixed;
			inset:0;
			background:radial-gradient(circle at 50% 60%, rgba(255,250,210,0.85), rgba(255,240,160,0.3) 35%, transparent 70%);
			pointer-events:none;
			z-index:55;
			animation:flash-anim 1.2s ease-out forwards;
		`;
		document.body.appendChild(pillar);
		setTimeout(() => pillar.remove(), 1300);
	}

	function checkTriforceClear() {
		const total = calcTotalTriforces();
		if (total <= 0) return;
		const player = getPlayer();
		if (player.triforceCount < total) return;

		// 既に翼の羽衣を授かっている＝祭壇は済。ここではエンディングを発火しない
		// （ラスボス ザーネル撃破で onBossDefeated 側がエンディングを出す）。
		if (player.hasWingRobe) return;

		if (altarExists()) {
			// Phase 1-4 で配置される古代の祭壇へ誘導する。
			// エンディングはまだ出さず、祭壇で翼の羽衣を授かるよう促す。
			setTimeout(() => {
				pulse('{{triforce}} すべての星の欠片が 集まった！古代の祭壇へ向かおう', 4500);
			}, 800);
			return;
		}

		// フォールバック：祭壇が未配置の現状は従来どおり即エンディング。
		stopGameLoop();
		setTimeout(() => startEnding(), 2500);
	}

	// ── 魔王撃破後・星の欠片収集チェック ──────────────
	function checkPendingTriforce() {
		const pendingTriforcePos = deps.getPendingTriforcePos();
		if (!pendingTriforcePos || deps.getCollectingTriforce()) return;
		const player = getPlayer();
		const dist = Math.sqrt(
			(player.x - pendingTriforcePos.x) ** 2 +
			(player.y - pendingTriforcePos.y) ** 2,
		);
		if (dist > 1.0) return;

		deps.setCollectingTriforce(true);
		deps.setPendingTriforcePos(null);

		const el = getPendingTriforcePieceEl();
		if (el) { el.remove(); setPendingTriforcePieceEl(null); }
		document.getElementById('pending-triforce-piece')?.remove();

		player.triforceCount++;
		console.log(`[TRIFORCE] checkPendingTriforce: collected, triforceCount=${player.triforceCount}`, new Error().stack);
		playSound('item');
		pulse('{{triforce}} 星の欠片を 手に入れた！', 4000);
		updateHud();
		saveGame();

		deps.setCollectingTriforce(false);
		checkTriforceClear();
	}

	// ── エンディング ──────────────────────────────────────
	async function startEnding() {
		deps.setIsGameover(true);
		stopGameLoop(); stopBgm();

		saveCleared();
		localStorage.removeItem(SAVE_KEY);

		endingOverlayEl.classList.remove('hidden');
		playBgm('ending');

		// フェーズ1：スタッフロール
		const phase1El = document.getElementById('ending-phase1');
		const phase2El = document.getElementById('ending-phase2');
		phase1El.style.display = '';
		phase2El.classList.add('hidden');

		const scrollEl = document.getElementById('ending-scroll');
		scrollEl.innerHTML = buildStaffRollHtml();
		mountIconEls(scrollEl);   // 10e: タイトル行の data-icon を絵に差し替える

		await new Promise(r => {
			scrollEl.addEventListener('animationend', r, { once: true });
		});

		// フェーズ2：THE END シーン
		phase1El.style.display = 'none';
		phase2El.classList.remove('hidden');

		function placeBigSprite(canvasId, spriteName, palName) {
			const container = document.getElementById(canvasId);
			if (!container) return;
			container.innerHTML = '';
			const cv = makeSprite(spriteName, palName, true);
			if (!cv) return;
			container.appendChild(cv);
		}

		placeBigSprite('ending-princess1-canvas', 'princess', 'princess');
		placeBigSprite('ending-hero-canvas',      'heroD',    'hero');
		placeBigSprite('ending-princess2-canvas', 'princess', 'princess');

		const msgEl = document.getElementById('ending-msg');
		if (msgEl) {
			msgEl.innerHTML = 'ザーネルを倒し、すべての星の欠片を集め、女王ルミアの呪いを解いた。<br>光が世界に戻り、ルミアの地に平和が訪れた……';
		}
	}

	return {
		onBossDefeated,
		// Phase 9-6: yieldAt ボス（海の主）の戦闘終了＝合格フロー
		onBossYielded,
		shouldBossYield,
		startBossBattle,
		startEnding,
		updateBossHpBar,
		checkBossPhase,
		checkTriforceClear,
		checkPendingTriforce,
		offerAtAltar,
		showBossHpBar,
		hideBossHpBar,
		showBossRoomLockEffect,
	};
}
