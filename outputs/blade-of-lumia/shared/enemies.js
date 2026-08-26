// ── Blade of Lumia – Enemy Definitions ───────────────────────
// Dungeon World から継承し、速度・攻撃タイプを拡張
import { TILE } from './tiles.js';

// ── 行動モード初期重み ────────────────────────────────────────
// pickApproachMode がこの値を参照して初期重みを決定する
// stone 攻撃なし敵: { flank, direct, wander }
// stone 攻撃あり敵: { flank, direct, wander, strafe }

// ── 速度定数 ─────────────────────────────────────────────────
export const ENEMY_SPEED_SLOW   = 0.25; // 鈍足敵
export const ENEMY_SPEED_NORMAL = 0.5;  // 通常敵
export const ENEMY_SPEED_FAST   = 1.0;  // 高速敵

// ── 敵パラメータ ──────────────────────────────────────────────
// attack.type: 'charge' | 'spear' | 'stone' | 'sword' | 'swordBeam' | 'waterShot' | 'waterBlade'
//            | 'bombThrow' | 'boomerangThrow' | 'magicBolt'
//   magicBolt（Phase 5.5k k-8c #5 術士）… **挙動は 'stone' と完全に同じ**（任意角へ飛ぶ・
//   盾で防げる・壁で消える）＝enemy-ai.js の分岐も stone と同居している。違うのは
//   投擲物の絵とパレットだけ（ITEM_SPRITES/ITEM_PAL.magicBolt＝藍＋金）。
//   ⚠️ stone の絵を塗り替えて代用してはいけない（stone は岩投げ系の敵と共有）。
//   swordBeam（Phase 5.5k #7 剣獣）… 縦横が揃ったときだけ撃つ「飛ぶ斬撃」。
//   プレイヤーのビーム剣と同じ 'beam' 投擲物を owner:'enemy' で飛ばす。
//   bombThrow（Phase 5.5k k-6 #6 爆弾鬼）… 投げた瞬間のプレイヤーのセルへ**放物線**で
//   落ちる爆弾（`thrownBomb`・proj.lob）。飛翔中は壁も水も無視し、着弾で範囲爆発する
//   （attack.blast = { radius, damage, breakPower }）＝盾では防げない・遮蔽が効かない。
//   boomerangThrow（Phase 5.5k k-6 #10 ブーメラン鬼）… 縦横が揃ったときだけ投げる
//   **往復する**ブーメラン（`boomerang`・proj.returnsToOwner）。プレイヤーの
//   ブーメランと同じ boomerangStep を通る＝行きと帰りの2回当たり判定がある。
//   attack.maxRange で折り返す距離を指定する。
//
// attack.range   … この距離以内なら出す（上限）
// attack.minRange（任意・Phase 9-6）… この距離より近いと出さない（下限）。
//   近接と遠隔を1体に持たせるとき「隣接では遠隔を撃たず噛みつきに切り替わる」を
//   宣言的に書くためのフィールド。省略時は下限なし＝従来挙動（後方互換）。
//
// ⚠️ range / minRange は **body の端からプレイヤーまでの距離**（Phase 8-4 (4) 0d-2.5 で
//   統一）。1×1 の敵では「自分のセルからの距離」と同値∴従来の数値の意味は変わらない。
//   2×2 の大型ボスは**それまで左上角から測っていた**＝西/北から測ると体の幅ぶん（1セル）
//   遠く出る＝プレイヤーには見えない「安全な面」ができていた。端から測る形に直したとき、
//   9体の近接 range をすべて **-1.0** した（例：G 2.2 → 1.2）＝直す前の実効リーチ
//   （東/南から測った値）と同じにするため。∴プレイヤーの剣（SWORD_REACH 1.2・
//   combat.js も端から測る）と直接比べられる数字になっている。
//
// attack.windupMs（任意・Phase 8-4 (4) 0d-2.6）… 近接（sword）の**前動作（予告）**の長さ。
//   到達距離に入った tick に剣を振り上げ（`.swing-windup`＋SE）、windupMs 後の tick に
//   もう一度到達判定をして当てる＝**離れれば空振りになる**（プレイヤーは反応で避けられる）。
//   ⚠️ **省略時は MELEE_WINDUP_MS（480ms＝4 tick）＝予告は全敵の既定**（0d-2.7 で変更）。
//     旧仕様の「省略した攻撃は届いた tick に即ダメージ」は 2026-08-25 に失効した＝予告の
//     無い近接はプレイヤーには接触ダメージと区別できず「どの敵も接触でダメージ」と報告された。
//     `windupMs: 0` を明示すれば即ダメージに戻せる（今この指定を使っている敵は無い）。
//   ⚠️ ボスは 600ms（5 tick）以上にする。**360ms（3 tick）は実プレイで「全然よけられない」
//     と判定された**（2026-08-25 ユーザー・0d-2.6 の2回目の調整）＝間合いを外す操作に要する
//     2 tick（TICK_MS 120・MOVE_STEP 0.5）だけでは足りず、「振り上げを見る → どちらへ
//     逃げるか決める」ぶんの人の反応（およそ 300ms）を予告の中に含める必要がある。
//   ⚠️ 予告は `attackFreezeMs`（攻撃後の硬直）と**対で効く**。予告だけでは「避けられるが
//     殴り返せない」＝剣の間合いが互角（G 1.2 ＝ SWORD_REACH 1.2）だと、当てにいくと必ず
//     刺し違える。硬直＝振り下ろした後の隙が、避けた側の反撃の窓になる。
//
// attackFreezeMs（任意）… 攻撃が解決してから動けない時間（＝プレイヤーが殴り返す窓）。
//   **近接（sword / charge）の省略時は MELEE_FREEZE_MS（360ms＝3 tick）**（0d-2.7 で既定化）。
//   遠隔の省略時は従来どおり（directional なら ATTACK_POSE_MS・それ以外 0）＝撃つたびに
//   固まると「間合いを保って撃つ」挙動が壊れるため近接だけに掛ける。ここに数字を書いた敵は
//   近接／遠隔の区別なくその値になる（＝投擲の硬直を長くしている 423・464 の意図を保つ）。
//
// inflict（Phase 5.5k k-7・任意）: { type, ... } ＝**攻撃を当てたプレイヤーに立てる一時デバフ窓**
//   type 'sealSword' … { ms } … その間 剣が振れない・チャージもできない（サブ武器は使える）
//   type 'poison'    … { ms, tickMs, damage, decay } … 論理時間で刻む継続ダメージ
//   適用は敵の攻撃が当たった1か所（enemy-ai.js tickSlam＝体当たりの解決）→ game/debuff.js。
//   ⚠️ k-7.5 で接触ダメージを廃止した∴**触れただけでは立たない**（予告モーション中に
//      隣接していた場合だけ立つ）。
//   ⚠️ デバフは無敵窓では防げない（無敵は HP を守る窓）。理由は debuff.js の冒頭。
//
// blink（Phase 5.5k k-8・任意）: { shownMs, goneMs, castDelayMs, range, style }
//   ＝**瞬間移動**（#5 術士）。姿がある(shown)→消える(gone・無敵)→プレイヤーから
//   range セル離れたカーディナルのセルへ跳んで再出現→castDelayMs の詠唱→また shown。
//   実装は enemy-ai.js tickBlink。歩かない敵（speed 0）の唯一の移動手段として使う。
//
// dash（Phase 5.5k k-9・任意）: { windupMs, speed, maxCells, alignTol, hitRange,
//                                minRange, maxRange, stunMs, cooldownMs }
//   ＝**直線突進＋壁ヒット気絶**（#14 突進猪）。プレイヤーが自分の行/列（直交ずれ
//   alignTol 以内）に入ると溜め(windup)→高速直線突進(run)の2拍で走る。
//   走り終わりは3通り＝①プレイヤーに接触（体当たりのダメージ＝気絶しない）
//   ②地形に激突（stunMs の気絶＝**プレイヤーの反撃の窓**）③maxCells 走り切る（空振り）。
//   実装は enemy-ai.js tickDash。体当たり（attack:{type:'charge'}）の強化版＝
//   密着では従来どおり slam が出る（dash.minRange > slam の到達距離で棲み分ける）。
//
// weakness（Phase 3-3・任意）: { type, multiplier }
//   type … 弱点となる攻撃種別 'sword' | 'beam' | 'arrow' | 'boomerang' | 'bomb'
//   multiplier … その攻撃でのダメージ倍率（def 適用前の素ダメージに掛ける）
//   弱点ヒット時は combat.js の dealDamageToEnemy が倍率＋専用エフェクト/SE を出す。
//   未定義なら弱点なし＝全攻撃が等倍（後方互換）。
//
// stunnable（Phase 8-4 (2)・2026-08-23・任意 boolean）: **ブーメランで硬直するか**の明示。
//   省略時は `!isBoss` から導出＝ザコは硬直する／ボスは硬直しない（ダメージだけ通る）。
//   ・ボスを硬直させない理由＝ブーメランの往復（木 6マス≒0.7秒／銀 12マス≒0.6秒）が
//     スタン時間 1500ms（game/constants.js BOOMERANG_STUN_MS）より短い∴投げ続けるだけで
//     永久に固められ、ブーメラン＋剣の連打で全ボスに勝ててしまう（実プレイで確認）。
//   ・ザコは硬直したままにする＝「ブーメランでガードを崩して斬る」がザコ戦の設計の核。
//   ・例外を書くための穴＝`stunnable: true` を立てたボスは硬直する／`false` を立てた
//     ザコは硬直しない。**一覧を手書きしない**（導出が既定・明示は例外だけ）。
//   実装は game/projectile.js の boomerang 分岐（1か所）。
// ── Phase 8-4（2026-08-23）リバランスの前提 ────────────────────────
// hp/atk/def はここで**一斉に**引き直した。根拠は `scripts/audit-balance.mjs`
// （実マップ由来の「初めて会う地点 × その時点の最弱プレイヤー」で測る監査）。
//   ① 判定は **min プロファイル**＝本編だけを進んだプレイヤー（木の剣 ATK 4・防具なし）。
//      銅/銀/聖剣はすべて寄道（forest_cave / secret_grotto / void_shrine）にしか無い
//      ＝取らずにクリアできる∴下限は最後まで ATK 4。寄道の剣で溶けるのは**報酬**（設計どおり）。
//   ② 剣のクールダウンを 100ms → 300ms にした（game/constants.js）＝敵に被弾無敵が無いため
//      1秒あたりの手数が3分の1になった∴同じ体感にするには hp が要る。ボスの hp を
//      2〜3倍にしたのはこの分（30〜60振り＝9〜18秒＝機構が数巡する長さ）。
//   ③ 敵の def は **2 以下**に抑える。被ダメは `max(1, dmg - def)` の減算∴def 3-4 は
//      木の剣（4）を 1 まで削る＝「殴っても減らない」になる（ザーネル def 4 が実例）。
//   ④ 雑魚は 2〜6振り。1振りで消えて良いのは意図した最弱枠だけ
//      （E / ξ / & / δ / ψ ＝ audit-balance.mjs の ONE_SWING_OK に理由付きで列挙）。
// ⚠️ 脅威度 `hp*atk/(def+1)`（scripts/lib/enemy-placement.mjs）は配置の重さの指標＝
//    ここの数値を触ると `tests/enemy-placement.spec.js` ③ の梯子と
//    `tests/dungeon-key-gate.spec.js` ⑨ の関門の期待値が動く（必ず同じ回で直す）。
export const ENEMY_META = {
	[TILE.PATROL]: {
		name: 'パトロール',
		hp: 4, atk: 1, def: 0, exp: 3,        // 脅威度 4.0（最弱枠＝木の剣1振りで倒せることを教える）
		speed: ENEMY_SPEED_SLOW,
		sprite: 'patrol',
		pal:    'patrol',
		isBoss: false,
		attack: { type: 'charge' },
	},
	[TILE.CHASER]: {
		name: 'チェイサー',
		hp: 12, atk: 2, def: 0, exp: 5,       // 脅威度 24.0（木の剣3振り）
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'chaser',
		pal:    'chaser',
		isBoss: false,
		attack: { type: 'charge' },
	},
	[TILE.SENTRY]: {
		name: 'センチネル',
		hp: 12, atk: 3, def: 1, exp: 8,       // 脅威度 18.0（木の剣4振り）
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'sentry',
		pal:    'sentry',
		isBoss: false,
		attack: {
			type:            'spear',
			range:           4,       // 射程（セル数）
			cooldown:        3000,    // 攻撃間隔（ms）
			projectileSpeed: 1.5,     // 飛翔速度（セル/tick）
		},
	},
	[TILE.SKELETON]: {
		// 骸骨剣士（陸上通常敵・5.5k 新規）。DECISIONS 2026-08-10「陸上敵の真4方向＋攻撃/ガードポーズ機構」の
		// 最初の適用対象＝directional:true で resolveEnemySprite() 経由の向き差替・攻撃/ガードポーズに乗る。
		// スプライトは当面 skeletonD/R/L/U（正面絵のエイリアス）＝機構が先・向き別描画は次段。
		name: '骸骨剣士',
		hp: 12, atk: 3, def: 1, exp: 6,       // 脅威度 18.0（木の剣4振り）
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'skeletonD',
		pal:    'skeleton',
		isBoss: false,
		directional: true,
		attack: { type: 'sword', range: 1.5, cooldown: 900 },
	},
	[TILE.SWORD_BEAST]: {
		// 剣獣（陸上通常敵の最強格・5.5k #7）。dark_tower [1,2] の戦闘部屋に集める用＝
		// 「通常陸上敵が3種しか無く最終盤に置く最強格の選択肢が無い」を解消する敵。
		// 特徴＝①高速で詰めてくる（ENEMY_SPEED_FAST）②離れていると「飛ぶ斬撃」
		// （swordBeam）を撃つ＝逃げ回るだけでは安全にならない。
		// guards:false＝高機動の敵が立ち止まって盾を構えるのは設計と矛盾する∴
		// ガード状態機械には乗せない（ガード役は #4 盾騎士の担当）。∴向き別スプライトは
		// 3方向×(通常/攻撃)の6枚だけで足りる（Guard フレーム不要）。
		name: '剣獣',
		hp: 18, atk: 5, def: 1, exp: 20,      // 脅威度 45.0 ＝**通常敵の最強格**（木の剣6振り）
		                                      // ⚠️ tests/dungeon-key-gate.spec.js ⑨ が
		                                      // 「雑魚の脅威度の最大＝剣獣」を固定している∴他の雑魚より必ず高くする。
		// 2026-08-12（ユーザー指摘で修正）：ENEMY_SPEED_FAST(1.0) はプレイヤーと**完全同速**
		// （プレイヤーは 1 tick に MOVE_STEP=0.5 進む＝速度換算 1.0）∴ 密着されたら
		// 原理的に振り切れない＝「逃げ切れない」。0.85 にして「速いが引き離せる」にする。
		speed: ENEMY_SPEED_FAST * 0.85,
		sprite: 'swordBeastD',
		pal:    'swordBeast',
		isBoss: false,
		directional: true,
		guards: false,
		// 攻撃硬直（2026-08-12）＝斬った/撃った直後は動けない。プレイヤーの
		// 「剣を構えている間は足を止める」（player.js movePlayer）と対称。
		// ポーズの窓（180ms）より長くして、高機動の代償としての隙をはっきり作る。
		attackFreezeMs: 360,
		// 遠隔／近接の二相（2026-08-12・ユーザー指摘「近づくモードと遠隔攻撃モードが
		// ある感じにしないと常にくっついてくるキャラになる」）。
		//   keepMin 3.0 … swordBeam の minRange 2.5 より外＝遠隔モード中は必ず撃てる距離を保つ
		//   keepMax 6.5 … range 9 の内側＝射程の端で棒立ちにならない
		//   周期は固定値（乱数なし）＝プレイヤーがリズムを読める／テストが決定論的
		combat: { keepMin: 3.0, keepMax: 6.5, rangedMs: 3000, meleeMs: 1800, startMode: 'ranged' },
		attacks: [
			{ type: 'sword',     range: 1.5, cooldown: 700 },
			// 飛ぶ斬撃＝縦横に揃ったときだけ撃つ飛び道具（beam）。minRange で
			// 「隣接している間は撃たず近接に切り替わる」を宣言する（SENTRY の spear と同型）。
			{ type: 'swordBeam', range: 9, minRange: 2.5, cooldown: 1500, projectileSpeed: 2.0 },
		],
		attack: { type: 'sword', range: 1.5, cooldown: 700 },
	},
	// ── Phase 5.5k k-3: 「隠れ↔出現の無敵窓」を持つ陸/空の敵 3種 ──────────
	// 共通の考え方＝**プレイヤーが殴れる窓が時間で開閉する**（＝ずっと殴り続けられない）。
	// 窓を開閉させる駆動が敵ごとに違う：
	//   地中蟲   … `hide`（タイマー駆動。潜伏↔浮上を一定周期で繰り返す）
	//   跳躍蜘蛛 … `leap`（行動駆動。跳躍の滞空中だけ隠れ＝着地の硬直が反撃の窓）
	//   コウモリ群 … 窓を持たない代わりに `move:'air'` ＋ ジグザグ飛行で狙いを付けにくい
	[TILE.BURROW_WORM]: {
		// 地中蟲（陸上通常敵・脅威 低）。潜み鮫の潜行を陸に持ってきた敵＝
		// 潜伏中は地面の下を進み（無敵・攻撃なし＝体当たりも空振りする）浮上した一瞬だけ
		// 噛みつく／噛める。逃げる相手ではなく「タイミングを合わせる相手」。
		// 弱点なし（PLAN 5.5k 名簿）。directional にしない＝土から出る蟲に「向き別の
		// 構え」は無い（絵は1方向＋左右反転で足りる）∴ガード状態機械にも乗らない。
		name: '地中蟲',
		hp: 9, atk: 2, def: 1, exp: 6,        // 脅威度 hp*atk/(def+1) = 9.0（低・木の剣3振り）
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'burrowWorm',
		pal:    'burrowWorm',
		isBoss: false,
		// 浮上（1000ms）より潜伏（1600ms）を長くする＝殴れる窓の方が短い。
		hide: { hiddenMs: 1600, shownMs: 1000, style: 'burrow' },
		attack: { type: 'sword', range: 1.4, cooldown: 900 },
	},
	[TILE.LEAP_SPIDER]: {
		// 跳躍蜘蛛（陸上通常敵・脅威 低〜中）。地上では鈍いが、間合いに入ると
		// 溜め（windup）→ 跳躍（滞空＝当たり判定消失）→ 着地硬直 の3拍で詰めてくる。
		// leap: { windupMs, cells, airSpeed, cooldownMs, minRange, maxRange }
		//   windupMs   … 溜め（プレイヤーへの予告。この間は動かない・向きが確定する）
		//   cells      … 跳ぶ距離（セル）／airSpeed … 滞空中の速度（セル/tick）
		//   cooldownMs … 着地後の硬直＝**プレイヤーが殴れる窓**（隠れが解ける）
		//   minRange/maxRange … 跳躍を始める間合い（近すぎ/遠すぎでは跳ばない）
		// 体当たり（charge）のみ（飛び道具なし）＝跳んで体を当てるのが攻撃。
		name: '跳躍蜘蛛',
		hp: 8, atk: 2, def: 0, exp: 8,        // 脅威度 16.0（低〜中・木の剣2振り）
		speed: ENEMY_SPEED_SLOW,              // 地上は鈍足＝距離を詰める手段が跳躍しかない
		sprite: 'leapSpider',
		pal:    'leapSpider',
		isBoss: false,
		leap: {
			windupMs: 360,      // 3 tick（TICK_MS 120）＝プレイヤーが見て避けられる予告
			cells: 3,           // 3セル跳ぶ
			airSpeed: 1.0,      // 1 tick に MOVE_STEP×2＝3 tick で着地（滞空 360ms）
			cooldownMs: 1000,   // 着地硬直＝殴れる窓（滞空 360ms より長い）
			minRange: 1.8,      // 密着では跳ばない（すり抜けて意味が無い）
			maxRange: 6.0,      // 遠すぎると跳んでも届かない
			style: 'air',       // 滞空中の隠れ表現（CSS `hide-air`）
		},
		attack: { type: 'charge' },
	},
	[TILE.BAT_SWARM]: {
		// コウモリ群（飛行通常敵・脅威 低）。単体は極めて脆いが、
		//   ①`move:'air'` ＝水/溶岩/空（虚空）を飛び越える＝地形で隔離できない
		//   ②`zigzag` ＝進路が左右に振れる＝狙いを付けにくい（真っすぐ来ない）
		// の2点で「数で押す空の敵」になる。体当たり（charge）のみ。
		// zigzag: { amplitude, periodMs } … プレイヤーの脇 amplitude セルを目標に取り、
		//   periodMs ごとに左右を入れ替える（位相は e.id から決定的＝乱数なし）。
		//   periodMs は「横へ振り切るのに要る時間」で決める：1手おきに横へ振る＝横方向の
		//   実効速度は 0.167 セル/tick（speed 0.7 → 1.5 tick に1手・その半分が横）。
		//   ∴入れ替えが速すぎると片側へ振り切る前に折り返して振り幅が出ない（720ms では
		//   ±0.5 セル・1200ms でも -1.5〜0 の片側だけ、と実測）。
		//   amplitude 1.0・periodMs 1440（12 tick）＝12 tick で 2.0 セル横移動できる
		//   ＝−1.0↔+1.0 をちょうど往復する＝左右対称に 2 セル幅で蛇行する。
		name: 'コウモリ群',
		hp: 2, atk: 1, def: 0, exp: 4,        // 脅威度 2.0（低・1体は脆い）
		speed: ENEMY_SPEED_FAST * 0.7,        // 速いがプレイヤーより必ず遅い（GUIDE §7-2）
		sprite: 'batSwarm',
		pal:    'batSwarm',
		sideView: true,                       // 横向きシルエット＝プレイヤーの左右で反転
		isBoss: false,
		move:   'air',                        // 飛行＝壁だけが障害（水/溶岩/空は越える）
		zigzag: { amplitude: 1.0, periodMs: 1440 },
		attack: { type: 'charge' },
	},
	// ── Phase 5.5k k-4: 「方向依存の被ダメ」を持つ陸上敵 2種 ──────────────
	// 共通の考え方＝**ダメージが通る面／通る瞬間が限られている**（正面から殴り続けても
	// 削れない）。既存の tickGuard（骸骨剣士のガード）は「攻撃クールダウン中だけ構える」
	// ＝時間の窓が短い一時状態だったが、この2体は無効化が常設で、崩す鍵が敵ごとに違う：
	//   盾騎士   … `blockFacing`（向きで決まる。常時ブロック＝側面/背後へ回り込むしかない）
	//   火吐き亀 … `shell`（時間で決まる。籠もると全方向無効＝開く瞬間を待つしかない）
	[TILE.SHIELD_KNIGHT]: {
		// 盾騎士（陸上通常敵・脅威 中〜高）。PLAN 5.5k 名簿 #4。
		// blockFacing = { turnMs, knockback } ＝**向きを固定して構える**敵。
		//   ・正面（e.dir と一致する方向）からの攻撃は常に 0 ダメージ＋プレイヤーを弾く
		//     （combat.js isBlockFacingDir / knockbackPlayerFrom）
		//   ・向き直りは turnMs ごとの離散的な判断＝プレイヤーが横へ動いた直後は隙が空く
		//     ∴回り込みが成立する（毎tick向き直る敵には回り込めない）
		//   ・自分の剣も**正面にしか振れない**（enemy-ai.js enemyAttack の向きゲート）＝
		//     側面に居るプレイヤーを殴れない＝回り込みに報酬がある
		// 弱点なし＝位置取りで崩す敵（PLAN 名簿）。ガード状態機械には乗せない
		// （guards:false）＝ブロックは常設で、盾は素の絵の一部（∴Guard フレーム不要
		//  ＝向き3方向×(通常/攻撃)の6枚で足りる。GUIDE §2）。
		name: '盾騎士',
		// 8-4: def は 2 → 1。硬さは blockFacing（正面無効）で表す敵∴減算防御まで高いと
		// 「回り込んでも減らない」＝機構の報酬が消える。
		hp: 18, atk: 4, def: 1, exp: 18,      // 脅威度 hp*atk/(def+1) = 36.0（中〜高・剣獣 45 未満）
		speed: ENEMY_SPEED_SLOW,              // 重装＝鈍い（プレイヤーが回り込める前提条件）
		sprite: 'shieldKnightD',
		pal:    'shieldKnight',
		isBoss: false,
		directional: true,
		guards: false,
		blockFacing: {
			turnMs:    720,   // 6 tick（TICK_MS 120）ごとにだけ向き直る＝回り込みの猶予
			knockback: 0.5,   // 弾かれてプレイヤーが下がる距離（セル・MOVE_STEP 1歩ぶん）
		},
		attack: { type: 'sword', range: 1.5, cooldown: 1100 },
	},
	[TILE.FIRE_TURTLE]: {
		// 火吐き亀（陸上通常敵・脅威 中〜高）。PLAN 5.5k 名簿 #12。
		// shell = { closedMs, openMs, breathCells, breathAtk } ＝**甲羅の開閉**で
		// 無敵窓が時間で開閉する敵。盾騎士と同じ「殴れない敵」だが崩し方が逆：
		//   ・closed … 甲羅に籠もる＝**向きに関係なく全ダメージ無効**・移動も攻撃もしない
		//   ・open   … 甲羅を開く＝殴れる。**開いた瞬間に正面へ炎を吐く**（breathCells セル）
		//              ∴「開くのを待って殴る」だけでは炎を浴びる＝正面から待ってはいけない
		// 地中蟲（hide）との違い＝隠れないので**常に殴りに行ける**（無敵なだけ）＝
		// 甲羅を叩いた手応え（0ダメージの弾き）でプレイヤーに状態を伝える。
		// 弱点なし（PLAN 名簿）。directional にしない＝甲羅の絵は開/閉の2枚で足りる
		// （向き別9枚は不要）∴ガード状態機械にも乗らない。
		name: '火吐き亀',
		// 8-4: def は 2 → 1（硬さは shell の無敵窓で表す＝減算防御では表さない）。
		hp: 15, atk: 4, def: 1, exp: 16,      // 脅威度 30.0（中〜高・木の剣5振り）
		speed: ENEMY_SPEED_SLOW,              // 鈍足＝逃げ切れる代わりに硬い
		sprite: 'fireTurtle',
		pal:    'fireTurtle',
		isBoss: false,
		shell: {
			closedMs:    1400,  // 籠もる時間（無敵）＝殴れる時間より長い
			openMs:      1000,  // 開いている時間＝殴れる窓
			breathCells: 2,     // 炎の届くセル数（正面のカーディナル1方向）
			breathAtk:   4,     // 炎のダメージ（体当たりの meta.atk と同値＝8-4 で 3→4）
			breathMs:    420,   // 炎の見た目が出ている実時間（CSS .enemy-fire-breath と対）
		},
		attack: { type: 'charge' },            // 飛び道具は持たない（炎は shell が撃つ）
	},
	// ── Phase 5.5k k-5: 「被弾したことが引き金になる」陸上敵 2種 ────────────
	// 共通の考え方＝**殴った結果が「HP が減る」だけで終わらない**（k-4 の2体が「殴っても
	// 減らない」だったのに対し、こちらは「殴ると状況が変わる」）。引き金は combat.js
	// dealDamageToEnemy の**1か所のフック**（onEnemyDamaged）で受ける：
	//   分裂スライム … `split`（倒した瞬間が引き金。倒れる代わりに小型2体へ分かれる）
	//   ルピー喰い   … `leech`（被弾が引き金。張り付きが剥がれる＝吸われ続けない）
	[TILE.SPLIT_SLIME]: {
		// 分裂スライム（陸上通常敵・脅威 中）。PLAN 5.5k 名簿 #3。
		// split = { count, childHp, ..., blockedBy } ＝**倒した瞬間に分裂する**敵。
		//   ・剣（や矢）で HP を 0 にすると killEnemy を通らず、小型 count 体へ置き換わる
		//     （combat.js trySplitEnemy）＝1発で片付いたつもりが増える
		//   ・小型は `_splitFrom`（親の posKey）を持つ＝**もう分裂しない**（無限に増えない／
		//     PLAN 名簿の但し書き）。同じ印が「撃破の記録は兄弟が0になったときだけ親の posKey へ」
		//     の判定にも使われる（combat.js recordDefeated）＝1発＋部屋の出入りで消えない
		//   ・**弱点 bomb だけは分裂させない**（blockedBy:'bomb'）＝爆弾なら一撃で終わる
		//     ＝弱点が「倍率」ではなく「機構を飛ばす鍵」として効く（この敵の設計の核）
		// hp 4 ＝木の剣（player.atk = BASE_ATK 2 + wood 2 = 4）の一撃で分裂まで届く
		// ＝名簿の「剣で1回叩くと2体の小型へ分裂」をそのまま数字にしたもの。
		name: '分裂スライム',
		// 8-4: hp 4 は**動かさない**（木の剣1振りで分裂に届くのが機構そのもの）∴
		// 重さは atk（2→3）で付ける＝「増える敵に囲まれると痛い」方向に寄せた。
		hp: 4, atk: 3, def: 0, exp: 8,        // 脅威度 hp*atk/(def+1) = 12.0（中・剣獣 45 未満）
		speed: ENEMY_SPEED_SLOW,              // 鈍い＝増えても逃げられる（数で押す敵の前提）
		sprite: 'splitSlime',
		pal:    'splitSlime',
		isBoss: false,
		weakness: { type: 'bomb', multiplier: 2 },
		split: {
			count:       2,             // 分かれる小型の数
			childHp:     2,             // 小型は木の剣1発で倒せる（増えた数を捌ける）
			childAtk:    2,             // 体当たりのダメージは親の 2/3＝囲まれても即死しない（8-4 で 1→2）
			childDef:    0,
			childExp:    3,
			childSprite: 'splitSlimeSmall',
			blockedBy:   'bomb',        // 弱点で潰したときは分裂しない（弱点＝機構の解除鍵）
		},
		attack: { type: 'charge' },     // 体当たりのみ（飛び道具は持たない）
	},
	[TILE.RUPEE_EATER]: {
		// ルピー喰い（陸上通常敵・脅威 中）。PLAN 5.5k 名簿 #11。
		// 「盾を奪う」は理不尽∴**ルピーを吸う**に変更（ユーザー確定 2026-08-10）。
		// leech = { attachRange, drainMs, amount, refund, cooldownMs } ＝**張り付いて吸う**敵。
		//   ・attachRange まで詰めると張り付く（enemy-ai.js tickLeech）＝以後プレイヤーに
		//     重なって移動する＝逃げても振り解けない（passable.js が重なりを例外扱いする）
		//   ・張り付いている間 drainMs ごとに amount ルピーを吸う＝放置するほど損が増える
		//     ∴「倒す優先度を強制」（名簿）
		//   ・**被弾で剥がれる**（combat.js の被弾フック → enemy-ai.js detachLeech）＝叩けば止まるが cooldownMs 後に
		//     また張り付く＝離れるか倒すかを選ばせる
		//   ・倒すと吸われたぶんの refund 割合が戻る（combat.js killEnemy）
		// 弱点なし（名簿）＝属性で楽にならない敵。
		name: 'ルピー喰い',
		hp: 15, atk: 3, def: 1, exp: 10,      // 脅威度 hp*atk/(def+1) = 22.5（中・木の剣5振り）
		speed: ENEMY_SPEED_NORMAL,            // 張り付きに来る＝寄れる速さは要る（ただし鈍足では無い）
		sprite: 'rupeeEater',
		pal:    'rupeeEater',
		isBoss: false,
		leech: {
			attachRange: 1.1,   // 張り付く距離。**隣接（1.0）で成立する値**にする＝敵はプレイヤーの
			                    // セルへ踏み込めない（passable.js isPassableForEnemy）∴自力で寄れる
			                    // 限界は距離 1.0。ここを 1.0 未満にすると永久に張り付けない
			drainMs:     600,   // 吸う間隔（5 tick＝TICK_MS 120 の整数倍＝観測 tick が揺れない）
			amount:      2,     // 1回に吸うルピー
			refund:      0.5,   // 倒したときに戻る割合（吸われた総額に対して）
			cooldownMs:  1200,  // 剥がされてから再び張り付けるまで（10 tick）＝叩く手が意味を持つ
		},
		attack: { type: 'charge' },   // 体当たりのみ（張り付き中は吸うのが攻撃＝HPは減らない）
	},
	// ── Phase 5.5k k-6: 「投げるものが飛び方を持つ」陸上敵 2種 ─────────────
	// 共通の考え方＝**飛び道具そのものに新しい飛び方を足す**（既存の stone/waterShot は
	// 「まっすぐ飛んで当たったら消える」の1種類しか無かった）。2種の飛び方は
	// projectile.js の1か所に集約する（lob＝放物線／returnsToOwner＝往復）：
	//   爆弾鬼       … `bombThrow`（着弾点で範囲爆発。壁を越えて飛ぶ＝遮蔽が効かない）
	//   ブーメラン鬼 … `boomerangThrow`（行きと帰りの2回判定＝避け方を2回読ませる）
	[TILE.BOMB_OGRE]: {
		// 爆弾鬼（陸上通常敵・脅威 中〜高）。PLAN 5.5k 名簿 #6。
		// attack.type:'bombThrow' ＝**投げた瞬間のプレイヤーのセルへ放物線で落ちる**爆弾。
		//   ・飛翔中は壁も水も無視して飛ぶ（放物線＝上を通る）∴**遮蔽の裏に隠れても届く**
		//   ・着弾で範囲爆発（blast.radius）＝プレイヤーの盾では防げない（点で飛んで来る
		//     投擲物ではない）∴**避ける＝その場を離れる**しか手が無い
		//   ・爆風は `!`（壊せる壁）も壊す（blast.breakPower）＝プレイヤーの爆弾と同じ扱い
		//   ・**他の敵は巻き込まない**（味方撃ちは実装しない＝DECISIONS 2026-08-16）
		// 「距離を取ると危険＝間合いを詰める圧」（名簿）を数字で作る：minRange 2.0 より
		// 近いと投げられない＝密着すれば爆弾は止まる（代わりに体当たりの atk 3 を食う）。
		// 弱点なし（名簿）。
		name: '爆弾鬼',
		hp: 18, atk: 4, def: 1, exp: 16,      // 脅威度 hp*atk/(def+1) = 36.0（中〜高・剣獣 45 未満）
		speed: ENEMY_SPEED_SLOW,              // 鈍足＝詰め寄れば投げさせずに済む（機構と対の速度）
		sprite: 'bombOgreD',
		pal:    'bombOgre',
		isBoss: false,
		directional: true,
		guards: false,          // 投擲手は盾を構えない＝Guard の3枚は不要（GUIDE §1/§2）
		attackFreezeMs: 480,    // 投げる間は動かない（4 tick）＝剣獣 360 より長い＝踏み込む窓
		combat: {               // GUIDE §7-3: 遠隔を持つ敵は二相にする（でないと密着して撃たない）
			keepMin:   2.5,     // minRange 2.0 の**外**に置く（§7-3 の罠）
			keepMax:   6.0,     // range 7 の内側＝間合いに入ったら止まって投げる
			rangedMs:  3600,    // 遠隔相（30 tick）＝投擲 cooldown 2160 の1.6倍＝相の中で必ず1回投げる
			meleeMs:   1200,    // 近接相は短い（10 tick）＝鈍足なので長くしても詰められない
			startMode: 'ranged',
		},
		attack: {
			type:            'bombThrow',
			range:           7,      // 投げられる最大距離
			minRange:        2.0,    // これより近いと投げない（自爆しない距離＝密着で機構が止まる）
			cooldown:        2160,   // 18 tick（TICK_MS 120 の整数倍＝観測 tick が揺れない）
			projectileSpeed: 1.0,    // 飛翔速度（セル/tick）＝落ちるまでに逃げる猶予を作る
			blast: {
				radius:     1.5,     // 爆風半径（セル）＝着弾セルの十字1マスまで
				damage:     6,       // 爆風ダメージ（def で軽減される＝takeDamage 経由）。8-4 で 4→6
				                     // ＝体当たり atk 4 より重い＝「爆風が本体」を数字でも示す。
				breakPower: 3,       // `!` を壊す力（プレイヤーの爆弾 ITEM_META.bomb と同値）
			},
		},
	},
	[TILE.BOOMERANG_OGRE]: {
		// ブーメラン鬼（ゴーリヤ型・陸上通常敵・脅威 中）。PLAN 5.5k 名簿 #10。
		// attack.type:'boomerangThrow' ＝**プレイヤーのブーメランと同じエンジン**で往復する
		// 投擲物（projectile.js boomerangStep）を owner:'enemy' で飛ばす。
		//   ・**縦横が揃ったときだけ投げる**（swordBeam と同じ＝行/列を外して避けられる）
		//   ・maxRange まで飛ぶ／壁に当たると折り返す → **投げた本人へ帰る**
		//     ∴行きを避けても帰りが来る＝「二度読み」（名簿）
		//   ・投げた本人が死んだら投擲位置へ帰って消える（returnsToOwner の実装）
		//   ・敵のブーメランはアイテムを拾わない／ロウソクに火を点けない
		//     （collectAlongBoomerang は owner==='player' 限定）
		// 弱点なし（名簿）。
		name: 'ブーメラン鬼',
		hp: 15, atk: 3, def: 1, exp: 12,      // 脅威度 hp*atk/(def+1) = 22.5（中・木の剣5振り）
		speed: ENEMY_SPEED_NORMAL,            // 間合いを取り直す速さは要る（爆弾鬼より速い）
		sprite: 'boomerangOgreD',
		pal:    'boomerangOgre',
		isBoss: false,
		directional: true,
		guards: false,          // 投擲手は盾を構えない（爆弾鬼と同じ・6枚で足りる）
		attackFreezeMs: 360,    // 投げる間は動かない（3 tick＝剣獣と同じ）
		combat: {
			keepMin:   2.5,     // minRange 2.0 の外（§7-3）
			keepMax:   3.5,     // maxRange 4.5 の内側で構える＝帰りの軌道に自分が居る間合い
			rangedMs:  3000,    // 遠隔相（25 tick）
			meleeMs:   1500,    // 近接相（12.5 tick）
		},
		attack: {
			type:            'boomerangThrow',
			range:           4.0,    // 投げる上限距離
			minRange:        2.0,    // これより近いと投げない（往復の意味が無くなる距離）
			cooldown:        2400,   // 20 tick（整数倍）
			projectileSpeed: 2.0,    // プレイヤーのブーメランと同じ速さ
			maxRange:        4.5,    // 折り返す距離（range より少し外＝間合いの端でも帰る）
		},
	},
	// ── Phase 5.5k k-7: 「プレイヤー側に一時デバフ窓を立てる」陸上敵 2種 ─────
	// 共通の考え方＝**攻撃の結果が HP の減少だけで終わらない**。敵の `_atkUntil`
	// （攻撃ポーズの論理時間窓）と同型の窓を player 側に置き、窓が立っている間だけ
	// プレイヤーの手を1つ削る／毒が刻む。デバフの中身は `meta.inflict` の1か所に
	// 宣言し、適用は攻撃が当たった1か所（enemy-ai.js tickSlam＝体当たりの解決）で行う
	// ＝敵ごとに散らさない（新しいデバフを足すのは meta と debuff.js の1行ずつ）。
	// ⚠️ k-7.5（2026-08-17）以降は**触れただけでは掛からない**＝予告モーション（拡大縮小
	//    2往復）の解決時に隣接していた場合だけ掛かる。「触れると〜」の旧記述はこの意味。
	//   呪い火     … `inflict:{ type:'sealSword' }`（剣が振れない・チャージもできない）
	//   毒沼ヒル   … `inflict:{ type:'poison' }`（論理時間で刻む継続ダメージ）
	// ⚠️ デバフは**無敵窓では防げない**（無敵は HP を守る窓＝「当てられたら封じられる／
	//    毒を受ける」は当たった事実に紐づく）。詳細は game/debuff.js の冒頭。
	[TILE.CURSE_FIRE]: {
		// 呪い火（バブル型・陸上通常敵・脅威 中(妨害)）。PLAN 5.5k 名簿 #13。
		// 「触れると数秒剣が使えなくなる（ダメージ小）。妨害特化＝弓/爆弾で処理」を数字にする：
		//   ・atk 1＝体当たりの痛みは最小（**この敵の攻撃は封印そのもの**）
		//   ・`move:'air'`＝炎の玉は地形に縛られない（水/溶岩/空を越えて追ってくる）
		//     ∴「水路の向こうへ逃げる」では撒けない＝封じられた剣の代わりに
		//     弓/爆弾を選ぶか、走って距離を取るかの二択になる
		//   ・速度は NORMAL（プレイヤーより遅い＝GUIDE §7-2）＝走れば必ず振り切れる
		// ⚠️ 脅威度の式 `hp*atk/(def+1)` は 3.0（低）だが、名簿の「中(妨害)」は
		//    **式の外**にある（式は体当たりのダメージしか値踏みしない＝剣を封じる価値を
		//    数えない）。ダンジョンの脅威度合計に「妨害」を混ぜないための割り切り。
		name: '呪い火',
		hp: 3, atk: 1, def: 0, exp: 8,        // 脅威度 hp*atk/(def+1) = 3.0（式の上では低）
		speed: ENEMY_SPEED_NORMAL,            // 追ってくる（GUIDE §7-2＝プレイヤーより遅い）
		sprite: 'curseFire',                  // 剣を飲み込んだ紫の炎（k-7b・.scratch/draw-k7.mjs）
		pal:    'curseFire',
		isBoss: false,
		move:   'air',                        // 飛行＝壁だけが障害（水/溶岩/空は越える）
		inflict: {
			type: 'sealSword',
			ms:   3000,   // 封印の長さ（25 tick＝TICK_MS 120 の整数倍＝観測 tick が揺れない）
		},
		attack: { type: 'charge' },            // 体当たり（charge）のみ（封印が本体＝遠隔攻撃は持たない）
	},
	[TILE.POISON_LEECH]: {
		// 毒沼ヒル（陸上通常敵・脅威 中）。PLAN 5.5k 名簿 #15。
		// 「遅延毒(DoT)＝体当たりで継続ダメージの毒を付与（時間で減衰）。鈍足だが後を引く」：
		//   ・鈍足（SLOW）＝出会った瞬間は無害に見える。近づいて殴るのは安全な相手に見えるが
		//     体当たり1回の実効ダメージは **体当たり 1 ＋ 毒 3 ＝ 4**（＝atk4 相当の敵）
		//   ・「時間で減衰」＝毒の1刻みが `decay` ずつ弱まる（下限 1）。tick 間隔は固定∴
		//     「最初の刻みが痛く、後は弱く長く」＝逃げてから回復を考える余裕が残る
		//   ・毒は**無敵窓を貫通する**（被弾後の無敵の間も刻む）が**無敵を与えない**
		//     ＝毒を盾に使えない（debuff.js の項）
		// ⚠️ 脅威度の式は 3.0 だが実効は 4 相当（式は毒を数えない＝呪い火と同じ割り切り）。
		//    HP 6 の初期プレイヤー（3ハート）で「体当たり1回＝2ハート」に収まるよう
		//    体当たりの atk を 1 に落としている（毒と体当たりの両方を 2 にすると
		//    1回もらうだけで即死級になる）。
		name: '毒沼ヒル',
		hp: 9, atk: 1, def: 1, exp: 10,       // 脅威度 hp*atk/(def+1) = 4.5（実効は毒込みで atk 4 相当）
		speed: ENEMY_SPEED_SLOW,              // 鈍足＝機構（後を引く毒）と対の速度
		sprite: 'poisonLeech',                // 背に毒の縞を持つヒル（k-7b・.scratch/draw-k7.mjs）
		pal:    'poisonLeech',
		isBoss: false,
		inflict: {
			type:   'poison',
			ms:     2400,   // 毒が続く長さ（20 tick）
			tickMs: 1200,   // 刻む間隔（10 tick＝整数倍）→ 窓の中で 2 回刻む
			damage: 2,      // 1刻み目のダメージ
			decay:  1,      // 1刻みごとに弱まる量（下限 1）＝2 → 1 で計 3
		},
		attack: { type: 'charge' },            // 体当たり（charge）のみ（毒が本体）
	},
	[TILE.SORCERER]: {
		// 術士（陸上通常敵・脅威 中）。PLAN 5.5k 名簿 #5。
		// 「瞬間移動して撃つ＝一定間隔で消え別セルに再出現→魔弾」を数字にする：
		//   ・speed 0＝**歩かない**。移動手段は瞬間移動（meta.blink）だけ＝壁や水で
		//     経路を切っても寄って来る／逆に追いかけても間合いは詰まらない
		//   ・魔弾は `magicBolt` 型＝挙動は `stone`（任意角の投擲物）と同じ＝盾で防げる
		//     遠隔攻撃。絵とパレットだけ藍＋金（k-8c。灰色の石が飛ぶのをやめた）
		//   ・出現→詠唱（castDelayMs の硬直）→1発。1回の出現で撃つのは1発だけ
		//     （castDelayMs + cooldown > shownMs＝拍が読める）
		//   ・弱点 arrow（×2）＝消える前に弓で落とす＝「詠唱を潰す」遊び
		// ⚠️ GUIDE §7-2「敵はプレイヤーより遅い」の例外ではない＝瞬間移動は移動速度では
		//    なく**距離のリセット**∴逃げても間合いは戻る。代わりに shownMs の間は
		//    完全に無防備（歩かない＝殴りに行ける）でバランスを取る。
		name: '術士',
		hp: 12, atk: 3, def: 1, exp: 14,      // 脅威度 hp*atk/(def+1) = 18.0（中・剣獣 45.0 未満）
		speed: 0,                             // 歩かない（移動は blink だけ＝enemyChase は accum が伸びない）
		sprite: 'sorcerer',                   // k-8b で実絵（32×32・待機2枚）。詠唱の 3 tick だけ
		                                      // `sorcererCast` へ差し替わる（enemy-ai.js syncCastSprite）
		pal:    'sorcerer',
		isBoss: false,
		weakness: { type: 'arrow', multiplier: 2 },  // 弓で詠唱を潰す＝サブ武器の使い所
		blink: {
			shownMs:     1440,  // 姿がある時間（12 tick）＝殴れる窓／魔弾を撃つ窓
			goneMs:       720,  // 消えている時間（6 tick）＝無敵・攻撃なし
			castDelayMs:  360,  // 出現直後の詠唱＝反応の猶予（3 tick・体当たりの予告 280ms と同型）
			range:          3,  // 再出現するプレイヤーからの距離（剣の間合い 1.5 の外・魔弾の射程内）
			style:    'warp',   // 見た目の種別（CSS `.char-abs.hiding.hide-warp`＝魔法陣が残る）
		},
		attack: {
			type:            'magicBolt', // 魔弾（任意角の投擲物・盾で防げる＝stone と同じ挙動）
			range:           6.5,       // 射程（瞬間移動の距離 3 より十分長い＝出現直後は必ず届く）
			minRange:        2.0,       // 近すぎると撃たない（密着したら殴れる＝近接の答えが残る）
			cooldown:        1200,      // 10 tick（castDelayMs 込みで shownMs を超える＝1出現1発）
			projectileSpeed: 1.4,       // 飛翔速度（セル/tick）
		},
	},
	[TILE.CHARGE_BOAR]: {
		// 突進猪（陸上通常敵・脅威 中〜高）。PLAN 5.5k 名簿 #14。
		// 「直線突進＋壁ヒット気絶＝プレイヤーの行/列に入ると高速直線突進、壁に当たると気絶
		//  （そこが好機）」を数字にする：
		//   ・歩きは鈍足（SLOW）＝**間合いを詰める手段は突進だけ**（GUIDE §7-2「敵はプレイヤー
		//     より遅い」を守る＝速いのは突進の窓の中だけ・その窓は予告付き）
		//   ・行/列に入る（直交ずれ alignTol 0.8 以内）と溜め 3 tick → 突進（1.5セル/tick）
		//   ・当たれば体当たりのダメージ（気絶しない）／外して壁に激突すると 12 tick 気絶
		//     ＝**殴り放題の窓**。∴プレイヤーの答えは「軸から1セル外れて壁へ誘導する」
		//   ・弱点なし（気絶させたときだけが弱点＝PLAN 名簿の「弱点なし（気絶時のみ）」）
		// ⚠️ 密着（dash.minRange 2.0 未満）では突進しない＝そこは体当たり（charge＝slam）の
		//    間合い。dash.minRange > SLAM_RANGE(1.5) で棲み分ける（両方が同じ距離で出ると
		//    「予告が2種類同時に立つ」＝どちらを避けたのか読めない）。
		name: '突進猪',
		hp: 18, atk: 4, def: 1, exp: 18,      // 脅威度 hp*atk/(def+1) = 36.0（中〜高・剣獣 45.0 未満）
		speed: ENEMY_SPEED_SLOW,              // 歩きは鈍足（突進だけが速い）
		sprite: 'chargeBoar',                 // k-9b の実絵（待機2枚＋Windup＋Stun・横向き）
		pal:    'chargeBoar',
		sideView: true,                       // 横向きシルエット（猪は横からしか読めない）
		isBoss: false,
		dash: {
			windupMs:   360,   // 溜め＝3 tick（TICK_MS 120）＝見て軸から外れられる予告
			speed:      1.5,   // 突進中の速度（セル/tick）＝1 tick に MOVE_STEP×3
			maxCells:    10,   // 走る上限（1画面の内寸 10 より大きい＝開けた部屋では必ず壁に届く）
			alignTol:   0.8,   // 行/列に入ったと見なす直交ずれ（slam の SLAM_PERP と同じ数字
			                   // ＝**突進が始まる幅＝当たる幅**。ここを広げると「始まるのに
			                   // 当たらない」＝歯の無い予告になる＝GUIDE §3-1 guardRange の罠）
			hitRange:   1.0,   // 突進が当たる距離＝重なり禁止（k-7.5 決定①）での最接近そのもの
			minRange:   2.0,   // 密着では突進しない（SLAM_RANGE 1.5 の外＝slam と棲み分ける）
			maxRange:   9.0,   // 遠すぎでは突進しない（1画面の対角より短い）
			stunMs:    1440,   // 壁に激突したときの気絶＝12 tick の反撃の窓（溜めの4倍）
			cooldownMs: 1200,  // 突進のあとの硬直＝10 tick（連続突進で詰め切られない）
		},
		attack: { type: 'charge' },            // 密着したら従来どおり体当たり（予告→解決）
	},
	[TILE.MONSTER]: {
		name: '魔物',
		// 8-4: ボスの hp は「木の剣（ATK 4）で 30〜60 振り＝9〜18 秒」で引いた。
		// 8-4 0d-2.8: 魔物は中ボス格＝ボス帯を意図的に下回る 16 振り（5秒）。
		// D1 の道中に2体居る（ボス部屋の G より前）∴ボス帯のままだと G に着く前に
		// 消耗しきる。atk も 3 → 2＝素の HP6 で「2 発死」から「3 発死」になる。
		hp: 48, atk: 2, def: 1, exp: 18,
		speed: ENEMY_SPEED_FAST * 0.45,  // 魔将より大幅に遅い (0.45)
		sprite: 'monsterD',
		pal:    'monster',
		isBoss: true,
		// ── 向き（2026-08-26 ユーザー報告「常に右を向いてしまっている」の修正）─────
		// 絵は勇者の流用＝monsterD/R/U は**本当に別の絵**（`monster` は heroR＝右向き）。
		// にもかかわらず向きの機構を宣言していなかった∴移動 AI が e.dir を毎 tick 更新して
		// いても絵が右向きのまま固定されていた。
		// ⚠️ 旧データ（hitAndAway: true）では bossTickHitAndAway の中の**独自の差替ブロック**が
		//    たまたま絵を切り替えていた＝0d-3 で `hitAndAway: false`（combat の二相）へ替えた
		//    瞬間にその経路を通らなくなり、向きが死んだ。∴移動 AI の分岐に依らない唯一の窓口
		//    ＝`directional: true`（enemyTick 末尾の syncDirectionalSprite）に載せる。
		// ⚠️ `guards: false`＝ガード絵（monster*Guard）を持たない（剣獣と同じ理由付け）。
		//    外すと tickGuard が立ち上がり①未登録の絵で敵が消える②0d-3 で測った
		//    「間合いを保つ二相」が「立ち止まって構える」に化ける。
		directional: true,
		guards:      false,
		// ── Phase 8-4 (4) 0d-3 層2（2026-08-25）＝W の「見せ場」＝**間合いを保つ二相**。
		// ⚠️ `hitAndAway: false`＝**前半は張り付かない**（旧データは 13 体と同じ
		//    「ヒット＆アウェイ＋剣＋石」のテンプレートだった＝ユーザーの「全部同じ動き」）。
		//    G 岩のゴーレム（D1 のボス）が「まっすぐ来て振り下ろす」型∴W はその逆＝
		//    **離れて石を投げ、周期的にだけ踏み込む**型にして、道中で先に出る中ボスの側に
		//    「近づき方が違う敵が居る」を教える役を持たせる。
		// ⚠️ 移動 AI の選択は `hitAndAway` が `combat` より優先される（enemy-ai.js の
		//    enemyTick の分岐）∴二相を効かせるには `hitAndAway` を**明示的に false** にする。
		hitAndAway: false,
		// 遠隔相＝keepMin〜keepMax を保ち、行/列を揃えて石を投げる／近接相＝詰めて斬る。
		//   keepMin 2.5 … 自分の剣（range 1.5）とプレイヤーの剣（SWORD_REACH 1.2）の
		//                 どちらも届かない外側＝**遠隔相は殴り合いにならない**
		//   keepMax 3.6 … 石の range 4 の内側＝**遠隔相は必ず撃てる位置に居る**
		//                 （GUIDE §7-3 の罠＝「遠隔モードなのに撃てない位置に居る」の回避）
		//   rangedMs 3000 … 石の cooldown 2800 より長い＝1相に必ず1発は飛ぶ
		//   meleeMs 1800 … 速度 0.45 で 3.6 → 1.5 まで詰めて1回振れる長さ（実測で調整）
		// 周期は固定（乱数なし）＝プレイヤーが「今は引く番／今は殴り返す番」を読める。
		combat: { keepMin: 2.5, keepMax: 3.6, rangedMs: 3000, meleeMs: 1800, startMode: 'ranged' },
		attacks: [
			{
				type:     'sword',
				range:    1.5,
				cooldown: 600,    // 近接剣（魔将より遅い）
			},
			{
				type:            'stone',
				range:           4,
				cooldown:        2800,  // 石投げ（魔将より頻度低）
				projectileSpeed: 1.0,
				// 投げた直後は固まらない（2026-08-26）。`directional: true` を絵のために立てると
				// 遠隔の硬直の既定が 0 → ATTACK_POSE_MS(180ms) に化け、遠隔相の入り口で
				// 「引く番」が 1〜2 tick 遅れる（実測：剣の間合いに居る時間が 19%→23%）。
				// 間合いの設計（0d-3 で測った二相）は絵のフラグに左右させない∴明示 0。
				freezeMs: 0,
			},
		],
		attack: { type: 'sword', range: 1.5, cooldown: 600 },
		// ⚠️ `initialModeWeights` は置かない＝前半は `hitAndAway: false`＝寄り方の抽選を
		//    一度も通らない（`resolveModeWeights` を読むのは `bossTickHitAndAway` だけ）∴
		//    ここに書くと「効いていないのに効いているように見える」死んだ数値になる。
		//    後半の寄り方は下の `phases[].modeWeights` に置く＝**使う場所に書く**。
		phases: [
			// HP50%以下＝**移動アルゴリズムそのものを差し替える**（層1 の口を使う）。
			// 二相をやめて張り付き型へ＝「間合いを取る敵」から「回り込んで来る敵」に変わる。
			{
				hpThreshold:     0.5,
				speedMultiplier: 1.3,
				hitAndAway:      true,
				combat:          false,
				// 寄り方＝**背後回り込み（flank）主体**。
				// ⚠️ strafe を主にしたら破綻した（2026-08-25 の実測）＝strafe の目標地点は
				//    プレイヤーから 4.0〜6.0 の側方（`bossTickHitAndAway`）∴石の射程 4 の外で
				//    7秒間ただ周回する案山子になった。strafe/wander は「崩し」の少数派に留める。
				// ⚠️ direct を主にすると G 岩のゴーレム（まっすぐ来て振り下ろす）と同じ型に
				//    なる∴旧値（direct 1.5・flank 0.2）へは戻さない。
				modeWeights: { flank: 1.6, direct: 0.7, strafe: 0.25, wander: 0.15 },
			},
		],
	},
	[TILE.BOSS]: {
		name: '魔将',
		hp: 96, atk: 4, def: 2, exp: 30,      // 8-4: 木の剣で 48 振り（14秒）
		speed: ENEMY_SPEED_FAST,
		sprite: 'escapeD',
		pal:    'escape',
		isBoss: true,
		// 向き（2026-08-26）＝魔物 W と同じ理由でここでも宣言する。escapeD/R/U は本当に別の絵
		// ∴宣言が無いと bossTickHitAndAway の独自差替に頼った状態＝移動 AI を替えた瞬間に
		// 向きが死ぬ（W で実際に起きた）。guards: false ＝escape*Guard を持たない。
		directional: true,
		guards:      false,
		hitAndAway: true,   // ヒット＆アウェイ行動
		// attacks: 配列で複数攻撃パターン。cooldown は各攻撃個別に管理
		attacks: [
			{
				type:     'sword',
				range:    1.5,
				cooldown: 400,    // 近接剣攻撃
			},
			{
				type:            'stone',
				range:           5,
				cooldown:        1800,  // 中距離から石投げ
				projectileSpeed: 1.2,
			},
		],
		// 後方互換用（単体参照される場合のフォールバック）
		attack: { type: 'sword', range: 1.5, cooldown: 400 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5 }, // HP50%以下で加速
		],
	},
	[TILE.DARK_LORD]: {
		name: '魔王',
		// 8-4: def 3 → 2（木の剣 4 が 1 まで削られる＝「殴っても減らない」を避ける）。
		// ⚠️ この敵は**世界のどこにも配置されていない**（scripts/audit-balance.mjs の
		//    unplacedEnemies が検出）。ザーネル（Z）と同格の数値にして配置待ちの状態にしてある。
		hp: 120, atk: 8, def: 2, exp: 100,    // 木の剣で 60 振り（18秒）
		speed: ENEMY_SPEED_SLOW,  // デバッグ用に低速化
		sprite: 'darklordD',
		pal:    'darklord',
		isBoss: true,
		directional: true,   // 向き（2026-08-26）＝魔物 W と同じ理由。guards: false は下
		guards:      false,  // darklord*Guard を持たない
		aura:   true,   // 魔王オーラエフェクト
		hitAndAway: true,   // ヒット＆アウェイ行動
		attacks: [
			{
				type:            'stone',
				range:           6,
				cooldown:        2000,
				projectileSpeed: 1.0,
			},
			{
				type:     'sword',
				range:    1.5,
				cooldown: 800,    // 近距離に来たら剣も使う
			},
		],
		attack: { type: 'stone', range: 6, cooldown: 2000, projectileSpeed: 1.0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5 },
			{ hpThreshold: 0.25, attackCooldownMultiplier: 0.6 }, // HP25%以下で攻撃頻度UP
		],
	},
	// ── ラスボス：ザーネル（Phase 1-3）─────────────────────────
	// 暗黒の塔の最奥で待ち受ける最終ボス。撃破するとエンディングへ。
	// isFinalBoss: true が boss.js のエンディング発火分岐の目印になる。
	// 専用スプライトは未作成のため当面 darklord を流用（新規スプライトは
	// Phase 0-4 / スプライトエディタの管轄。最優先5点の1つ）。
	[TILE.ZARNEL]: {
		name: 'ザーネル',
		// 8-4: def 4 → 2。木の剣（ATK 4）の一撃が max(1, 4-4) = 1 に落ちていた＝
		// 寄道の剣を取らずに塔へ入ると 80 発（24秒）殴るだけの作業になっていた。
		// hp 120 / def 2 ＝木の剣 60 振り（18秒）＝目標帯（30〜60振り）の上端＝ラスボスの位置。
		hp: 120, atk: 8, def: 2, exp: 0,  // 撃破でクリアなので exp は不要
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'darklordD',
		pal:    'darklord',
		isBoss: true,
		isFinalBoss: true,  // ← ラスボス。撃破でエンディング
		directional: true,   // 向き（2026-08-26）＝魔物 W と同じ理由。guards: false は下
		guards:      false,  // darklord*Guard を持たない
		aura:   true,
		hitAndAway: true,
		attacks: [
			{
				type:            'stone',
				range:           7,
				cooldown:        1600,
				projectileSpeed: 1.2,
			},
			{
				type:     'sword',
				range:    1.5,
				cooldown: 700,
			},
		],
		attack: { type: 'stone', range: 7, cooldown: 1600, projectileSpeed: 1.2 },
		phases: [
			{ hpThreshold: 0.66, speedMultiplier: 1.3 },
			{ hpThreshold: 0.33, speedMultiplier: 1.6, attackCooldownMultiplier: 0.55 },
		],
	},
	// ── 炎のサラマンドラ（Phase 3-2）：2×2 大型ボス・dungeon_4（炎の神殿）─────
	// 炎をまとった巨大トカゲ型の守護者。体全体が溶岩のように輝き、
	// 尻尾の一撃と炎の石投げで戦う。hitAndAway でジグザグに接近する。
	// dropsTriforce:true で撃破時に星の欠片を落とす。
	[TILE.FIRE_SALAMANDER]: {
		name: '炎のサラマンドラ',
		hp: 96, atk: 5, def: 1, exp: 50,      // 8-4: 木の剣で 32 振り（10秒）。矢（弱点×2）なら 12 本
		speed: ENEMY_SPEED_SLOW * 1.2,   // ゴーレムより少し速い
		sprite: 'fireSalamander',
		pal:    'fireSalamander',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'arrow', multiplier: 2 },  // 矢で炎を射抜く
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 1.2, cooldown: 800 },   // 尻尾なぎ払い
			{ type: 'stone', range: 7, cooldown: 2200, projectileSpeed: 1.2 }, // 炎の石
		],
		attack: { type: 'sword', range: 1.2, cooldown: 800 },
		initialModeWeights: { flank: 0.3, direct: 1.3, wander: 0.3, strafe: 0.1 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5, attackCooldownMultiplier: 0.8 },
		],
	},
	// ── 氷のリヴァイアサン（Phase 3-2）：2×2 大型ボス・dungeon_5（氷の廃墟）──
	// 凍てつく海竜。全身が霜に覆われた巨体で、氷の息と咬みつきで戦う。
	// 動きは遅いが防御力が高く、遠距離からの石投げが主な攻撃手段。
	// dropsTriforce:true で撃破時に星の欠片を落とす。
	[TILE.ICE_LEVIATHAN]: {
		name: '氷のリヴァイアサン',
		hp: 96, atk: 4, def: 2, exp: 55,      // 8-4: def 3→2（木の剣が 1 に落ちるのを避ける）＝48 振り（14秒）
		speed: ENEMY_SPEED_SLOW,          // 重厚で鈍足
		sprite: 'iceLeviathan',
		pal:    'iceLeviathan',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'fire', multiplier: 3 },   // ロウソクの炎で氷が溶ける
		meleeOnly: true,           // 遠隔（arrow/beam/boomerang/bomb）は無効
		reflectsProjectiles: true, // 投擲物はそのままプレイヤーへ打ち返す
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 1.5, cooldown: 1100 },  // 咬みつき（リーチが長い）
			{ type: 'stone', range: 8, cooldown: 2800, projectileSpeed: 0.9 }, // 氷の礫
		],
		attack: { type: 'sword', range: 1.5, cooldown: 1100 },
		initialModeWeights: { flank: 0.2, direct: 1.6, wander: 0.2, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.75 },
		],
	},
	// ── 砂嵐の蠍王（Phase 3-2）：2×2 大型ボス・dungeon_2（砂漠の神殿）──
	// 砂漠の守護者。8本の鉗肢と曲がった毒針を持つ巨大蠍。
	// 打撃と毒針投げで戦い、HP半減で猛スピードで突進してくる。
	[TILE.SAND_SCORPION]: {
		name: '砂嵐の蠍王',
		hp: 90, atk: 5, def: 1, exp: 45,      // 8-4: 木の剣で 30 振り（9秒）＝ボスの下限帯
		speed: ENEMY_SPEED_SLOW * 1.1,
		sprite: 'sandScorpion',
		pal:    'sandScorpion',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'boomerang', multiplier: 3 },  // 旋回刃で鉗肢を断つ
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 1.3, cooldown: 750 },   // 鉗肢なぎ払い
			{ type: 'stone', range: 7, cooldown: 2400, projectileSpeed: 1.3 }, // 毒針投げ
		],
		attack: { type: 'sword', range: 1.3, cooldown: 750 },
		initialModeWeights: { flank: 0.4, direct: 1.2, wander: 0.2, strafe: 0.2 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.6, attackCooldownMultiplier: 0.75 },
		],
	},
	// ── 深海の海蛇（Phase 3-2）：2×2 大型ボス・dungeon_3（水の迷宮）──
	// 深淵から召喚された巨大海蛇。長い胴体を波打たせて接近し、
	// 咬みつきと水球投げで圧倒する。鱗の防御力が高い。
	[TILE.SEA_SERPENT]: {
		name: '深海の海蛇',
		hp: 84, atk: 4, def: 2, exp: 52,      // 8-4: def 3→2＝木の剣で 42 振り（13秒）
		speed: ENEMY_SPEED_SLOW * 0.95,
		sprite: 'seaSerpent',
		pal:    'seaSerpent',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'beam', multiplier: 2 },   // 光の刃で鱗を貫く
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 1.6, cooldown: 1000 },  // 咬みつき（リーチ長）
			{ type: 'stone', range: 8, cooldown: 2600, projectileSpeed: 1.0 }, // 水球
		],
		attack: { type: 'sword', range: 1.6, cooldown: 1000 },
		initialModeWeights: { flank: 0.2, direct: 1.5, wander: 0.3, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.4, attackCooldownMultiplier: 0.7 },
		],
	},
	// ── 古森の巨人（Phase 3-2）：2×2 大型ボス・dungeon_6（森の聖域）──
	// 大樹の精霊が宿った樹人の守護者。巨木の腕で叩きつけ、
	// 木の実や胞子弾を飛ばして広範囲を制圧する。
	[TILE.FOREST_GIANT]: {
		name: '古森の巨人',
		hp: 96, atk: 5, def: 2, exp: 58,      // 8-4: 木の剣で 48 振り（14秒）
		speed: ENEMY_SPEED_SLOW * 0.9,
		sprite: 'forestGiant',
		pal:    'forestGiant',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'fire', multiplier: 2 },   // 炎で樹皮を焼き払う
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 1.4, cooldown: 950 },   // 枝腕なぎ払い
			{ type: 'stone', range: 6, cooldown: 2200, projectileSpeed: 0.9 }, // 木の実投げ
		],
		attack: { type: 'sword', range: 1.4, cooldown: 950 },
		initialModeWeights: { flank: 0.15, direct: 1.7, wander: 0.15, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.8 },
		],
	},
	// ── 嵐の鷲王（Phase 3-2）：2×2 大型ボス・dungeon_7（空中の遺跡）──
	// 嵐を纏う翼王。翼から放つ雷撃と突進で戦場を制圧する。
	// 素早く動き回り、HP半減後は雷撃の頻度が大幅に増加する。
	[TILE.STORM_EAGLE]: {
		name: '嵐の鷲王',
		hp: 108, atk: 6, def: 1, exp: 55,     // 8-4: 木の剣で 36 振り（11秒）
		speed: ENEMY_SPEED_SLOW * 1.3,   // 鷲なので速め
		sprite: 'stormEagle',
		pal:    'stormEagle',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'arrow', multiplier: 2 },  // 矢で翼を射落とす
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 1.1, cooldown: 700 },   // 鉤爪（速い）
			{ type: 'stone', range: 7, cooldown: 2000, projectileSpeed: 1.4 }, // 雷撃弾
		],
		attack: { type: 'sword', range: 1.1, cooldown: 700 },
		initialModeWeights: { flank: 0.5, direct: 1.0, wander: 0.3, strafe: 0.2 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.7, attackCooldownMultiplier: 0.65 },
		],
	},
	// ── 岩のゴーレム（Phase 3-2）：2×2 大型ボス ──────────────────
	// size:{w,h} を持つ最初の大型敵。dungeon_1（最初のダンジョン）の
	// ボスとして採用。hitAndAway AI で接近戦闘し、向きを変えながら戦う
	// （正面固定にならないよう左右反転＋CSS の巨体揺れアニメを併用）。
	// dropsTriforce: true で撃破時に星の欠片を落とす（DARK_LORD と同等）。
	// スプライトは 2×2 セル相当の 24×24（向きエイリアス rockGolemR/L/D/U）。
	[TILE.ROCK_GOLEM]: {
		name: '岩のゴーレム',
		// 8-4 0d-2.8: hp 90 → 60。木の剣で 30 振り（9秒）＝ボス帯（30〜60 振り）の下限。
		// atk 4 は据え置き＝D1 は世界に盾が無い地点（盾は D2 の報酬）だが、D1 内で拾える
		// 革の鎧（def 1）とハートの器を持って来れば 4→3 ダメージ／HP8 で 3 発耐えられる。
		// ∴耐久側は装備の回収で解き、ここでは殴り合いの長さだけを削る。
		// 爆弾（弱点×3）なら 2 個（1個で 58 ダメージ＝残り 2）。
		hp: 60, atk: 4, def: 2, exp: 40,
		speed: ENEMY_SPEED_SLOW,   // 大型なので鈍重
		sprite: 'rockGolem',
		pal:    'rockGolem',
		size:   { w: 2, h: 2 },    // ← 2×2 セルを占有
		isBoss: true,
		dropsTriforce: true,       // 撃破で星の欠片を落とす（boss.js が参照）
		weakness: { type: 'bomb', multiplier: 3 },  // 爆弾で岩体を砕く
		hitAndAway: true,          // 接近→攻撃→後退（向きも切り替わる）
		// 攻撃硬直（Phase 8-4 (4) 0d-2.6・2026-08-25 の2回目の調整）＝振り下ろした後の隙。
		// ユーザー実プレイ判定：「攻撃がおわったあともちょっと動けない時間をつくるとかしないと、
		// 剣を当てること自体がほぼ不可能。攻撃をあてようとすると自分が絶対ダメージをくらう状況」。
		// ∴予告（windupMs）で避けられるようにしただけでは足りない＝G の剣の間合い 1.2 は
		// プレイヤーの SWORD_REACH 1.2 と互角∴「殴れる位置」＝「殴られる位置」で、避けた後に
		// 詰める余裕が無いと必ず刺し違える。480ms（4 tick）＝プレイヤーが1歩踏み込んで
		// 剣を振り（攻撃ポーズ 180ms は足が止まる）1歩下がるのにちょうど足りる長さ。
		// ⚠️ 硬直は攻撃の**成立時**から数える（enemy-ai.js markAttack）＝空振りでも入る
		//    ＝「予告を見て避ける → 硬直に殴り返す」がこのボスの戦い方になる。
		attackFreezeMs: 480,
		attacks: [
			// windupMs: 600 ＝剣を振り上げてから当たる（Phase 8-4 (4) 0d-2.6）。
			// 最初のダンジョンのボス＝プレイヤーはまだ盾を持っていない（盾は D1 の報酬）∴
			// 即ダメージだと「ダメージを受けずに殴る」がほぼ不可能だった。
			// ⚠️ 初版の 360ms（3 tick）は実プレイで「振り上げから攻撃までが短すぎる・全然
			//    よけられない」と判定された（2026-08-25）∴5 tick へ延ばした。人が振り上げを
			//    見てから逃げる向きを決める時間を予告に含める（詳細は attack.windupMs の項）。
			{ type: 'sword', range: 1.2, cooldown: 900, windupMs: 600 },
			{ type: 'stone', range: 6, cooldown: 2600, projectileSpeed: 1.0 }, // 岩投げ
		],
		attack: { type: 'sword', range: 1.2, cooldown: 900, windupMs: 600 },
		// 直進寄り（大型は回り込みより正面から押す）
		initialModeWeights: { flank: 0.2, direct: 1.4, wander: 0.4, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.4 }, // HP50%以下で加速
		],
	},
	// ── 沼地の大蝦蟇（Phase 9-2c）：2×2 大型ボス・cave_1（沼地の洞窟）────
	// 沼地の主＝膨れ上がった毒蝦蟇。長い舌の打撃と毒沫の投擲で戦う。
	// 鈍重だが体力が高く、HP半減で跳ねるように加速する。
	// 8体目の dropsTriforce ボス（cave_1）。これで「大型ボス8＝欠片8」が揃う。
	// 弱点は炎（ロウソク＝cave_1 入場前に入手済み）。剣でも倒せる。
	[TILE.SWAMP_TOAD]: {
		name: '沼地の大蝦蟇',
		hp: 96, atk: 5, def: 2, exp: 56,      // 8-4: 木の剣で 48 振り（14秒）
		speed: ENEMY_SPEED_SLOW,          // 鈍重
		sprite: 'swampToad',
		pal:    'swampToad',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'fire', multiplier: 2 },   // 炎で焼かれると弱い両生類
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 1.4, cooldown: 900 },   // 舌の打撃（リーチ長）
			{ type: 'stone', range: 7, cooldown: 2400, projectileSpeed: 1.1 }, // 毒沫
		],
		attack: { type: 'sword', range: 1.4, cooldown: 900 },
		initialModeWeights: { flank: 0.25, direct: 1.4, wander: 0.35, strafe: 0 },
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5, attackCooldownMultiplier: 0.8 },
		],
	},

	// ── Phase 9-6 深洋O: 海棲雑魚 ─────────────────────────────────
	// move: 敵の移動媒体を表す（passable.js / enemy-ai.js が参照）。
	//   undefined | 'land' … 従来の陸棲（水/溶岩/空は通れない）。既存の全敵はこれ。
	//   'water'            … 水棲（水は泳げる／乾いた陸には上がれない）。溶岩/空は不可。
	//   'amphibious'       … 両生（水も陸も通れる。moveSpeed で地形別に速度を変える）。
	//   'air'              … 飛行（Phase 5.5k k-3）。水/溶岩/空（虚空）を飛び越える＝
	//                        壁・閉じた門など「陸上敵も通れない構造物」だけが障害になる。
	// moveSpeed: { water, land } … amphibious 専用。地形ごとの速度倍率（省略時は speed）。
	[TILE.FISH_SCHOOL]: {
		name: '魚群',
		hp: 2, atk: 1, def: 0, exp: 4,     // 1体は脆い＝数で包囲する
		speed: ENEMY_SPEED_FAST,           // 素早く群がる
		sprite: 'fishSchool',
		pal:    'fishSchool',
		isBoss: false,
		move:   'water',                   // 水しか泳げない＝陸に上がれない（海の顔）
		attack: { type: 'charge' },        // 体当たり（charge）のみ（飛び道具なし）
	},
	// ── ②接近型：潜み鮫（潜行↔浮上のリズム戦闘）────────────────
	// hide: { hiddenMs, shownMs, style } … 隠れ↔出現を繰り返す敵の周期（enemy-ai.js が管理）。
	//   2026-08-13（5.5k k-3）に水棲専用の `submerge` から陸/空も含む汎用機構へ一般化した
	//   （style: 'water' 潜行／'burrow' 地中／'air' 滞空。CSS クラス `hide-<style>` になる）。
	//   隠れ中（e.hidden=true）＝隠れて寄ってくるが「無敵・攻撃なし＝体当たりも空振りする」。
	//   出現中（e.hidden=false）＝噛みつき（sword）で攻撃し、こちらの攻撃も通る。
	// ∴「浮上した瞬間だけ殴れる」＝海のリズム戦闘（ユーザー確定 2026-07-25）。
	//
	// 攻撃は二段構え＝**離れていれば遠隔（水刃）・隣接すれば噛みつき**（ユーザー確定 2026-07-25）。
	//   理由＝鮫は move:'water' で陸に上がれない∴近接だけだと「岸から2マス離れて立つ」
	//   だけで完全に無害な置物になる（敵単体で成立しない）。遠隔を持たせて岸から離れた
	//   プレイヤーも狙う＝海が危ないという体験になる。
	//   代替案（飛びかかって陸に乗る）は却下＝論理座標が陸に出ると move:'water' の通行判定を
	//   破りスタックする（ユーザー指摘）。∴座標は水から出さず、届く手段を増やす。
	[TILE.LURK_SHARK]: {
		name: '潜み鮫',
		hp: 15, atk: 3, def: 1, exp: 12,   // 浮上の一瞬に殴る＝手数が限られるぶん硬め（脅威度 22.5）
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'lurkShark',
		pal:    'lurkShark',
		sideView: true,                    // 横向きシルエット＝プレイヤーの左右で反転する
		isBoss: false,
		move:   'water',
		hide:   { hiddenMs: 2000, shownMs: 1200, style: 'water' },
		attacks: [
			// 噛みつき（岸のプレイヤーに届く）。minRange 無し＝どんなに近くても出る。
			{ type: 'sword', range: 1.6, cooldown: 800 },
			// 水刃＝噛みつきリーチの外だけで撃つ（minRange）。射水魚の水弾より
			// 重く遅い1発＝「連射で削る射水魚」との役割差。
			{ type: 'waterBlade', minRange: 1.6, range: 6, cooldown: 1800, projectileSpeed: 1.4 },
		],
		// 単発 attack も残す＝attacks を持たないコード経路（テスト・将来の参照）向けの代表値。
		attack: { type: 'sword', range: 1.6, cooldown: 800 },
	},
	// ── ③遠隔型：射水魚（水中から水弾を任意角で撃つ）──────────
	// attack.type:'waterShot' は 'stone' と同じ「任意角へ飛ばす」型（斜めにも撃つ）。
	// 投擲物スプライトは ITEM_SPRITES.waterShot / ITEM_PAL.waterShot（projectile.js の
	// createProjEl が makeSprite(proj.type, proj.type) を呼ぶ＝type 名がスプライト名も兼ねる）。
	[TILE.ARCHER_FISH]: {
		name: '射水魚',
		hp: 8, atk: 2, def: 0, exp: 8,     // 脆いが遠くから削る＝近づけば早く潰せる（脅威度 16.0・木の剣2振り）
		speed: ENEMY_SPEED_SLOW,           // 撃つのが仕事＝あまり動かない
		sprite: 'archerFish',
		pal:    'archerFish',
		sideView: true,                    // 横向きシルエット＝プレイヤーの左右で反転する
		isBoss: false,
		move:   'water',
		attack: { type: 'waterShot', range: 6, cooldown: 2200, projectileSpeed: 1.2 },
	},

	// ── Phase 9-6 深洋O: 海の主（2×2 ミニボス・聖域の門番）───────────
	// デルタ最奥の聖域を守る巨大クジラ。既存8ボスと決定的に違うのは
	// **倒すのではなく「認められる」** こと（ユーザー確定 2026-07-26）：
	//   ・dropsTriforce を持たない … 星の欠片の総数8を狂わせない
	//   ・isFinalBoss を持たない   … エンディングを誤発火しない
	//   ・yieldAt: 0.25（新設）    … HP が 25% 以下になった時点で戦闘終了＝合格。
	//     killEnemy（爆発→消滅）ではなく「戦闘終了→報酬授与→深みへ退場」に分岐する
	//     （combat.js の dealDamageToEnemy が yieldAt を見て boss.js の yieldBoss を呼ぶ）。
	//   ・報酬は stageData.bossReward（データ駆動）… 何を配るかは stage JSON 側が決める。
	//     ∴ ここは「配るタイミング（yieldAt）」だけを定義し、中身を知らない。
	// move:'amphibious' … クジラなので水では速く、陸に乗り上げると鈍い（moveSpeed）。
	// 弱点は持たない＝「腕試し」なので特定装備の有無で難度が激変しないようにする。
	[TILE.SEA_LORD]: {
		name: '海の主',
		// 8-4: def 4 → 2（木の剣が 1 まで削られていた＝腕試しが作業になっていた）。
		// hp 100・yieldAt 0.25 ＝実際に削るのは 75 ＝木の剣で 38 振り（11秒）。
		hp: 100, atk: 5, def: 2, exp: 0,   // exp0＝撃破しない相手（経験値の概念で報われない）
		speed: ENEMY_SPEED_SLOW,
		sprite: 'seaLord',
		pal:    'seaLord',
		size:   { w: 2, h: 2 },
		isBoss: true,
		// 撃破ではなく合格。HP 25% 以下で戦闘終了する。
		yieldAt: 0.25,
		move:   'amphibious',
		moveSpeed: { water: 1.0, land: 0.5 },   // 水では定速・陸では半速
		hitAndAway: true,
		attacks: [
			{ type: 'sword', range: 1.8, cooldown: 1100 },   // 巨体の体当たり
			// 潮吹き＝水弾（射水魚と同じ waterShot 型。任意角へ飛ぶ）
			{ type: 'waterShot', range: 8, cooldown: 2400, projectileSpeed: 1.3 },
		],
		attack: { type: 'sword', range: 1.8, cooldown: 1100 },
		initialModeWeights: { flank: 0.3, direct: 1.4, wander: 0.3, strafe: 0 },
		phases: [
			// 半分削ると本気になる（＝合格ラインの 25% までが一番の山場）
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.75 },
		],
	},
};

// ── 敵タイルの集合（ENEMY_META から自動導出＝単一の真実）────────────
// 「このタイルは敵か？」を判定したい側（エディタのステージ情報の敵カウント等）は
// タイル文字を並べたローカル表を持たず、必ずここを使う。
// 理由＝ハードコードした表は敵を足すたびに更新漏れが起きる（実例：記号タイルの
// 海棲雑魚 & < / だけでなく、名前付きボス Z A L N J O U G I も
// エディタの敵カウントから漏れていた＝13種が 0 と表示されていた）。
export const ENEMY_TILES = Object.freeze(Object.keys(ENEMY_META));
export function isEnemyTile(tileChar) {
	return Object.hasOwn(ENEMY_META, tileChar);
}

// 投擲物のスプライト対応表
export const PROJECTILE_SPRITE = {
	spear:     'spear',
	stone:     'stone',
	boomerang: 'boomerang',
	arrow:     'arrow',
	waterShot: 'waterShot',  // Phase 9-6: 射水魚の水弾（ITEM_SPRITES/ITEM_PAL に同名で存在）
	waterBlade: 'waterBlade', // Phase 9-6: 潜み鮫の水刃（尾で薙いだ三日月型の衝撃波）
	thrownBomb: 'thrownBomb', // Phase 5.5k k-6: 爆弾鬼が投げる爆弾（放物線・着弾で範囲爆発）
	magicBolt: 'magicBolt',   // Phase 5.5k k-8c: 術士の魔弾（stone と同じ挙動・絵だけ藍＋金）
};
