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
// wieldsSword（2026-08-26・任意 boolean）… **その敵の絵が剣を持っているか**の宣言。
//   `attack.type: 'sword'` は engine の**近接の総称**（咬みつき・なぎ払い・鉗肢・舌・鉤爪・
//   巨体の体当たりも 'sword' で書いてある）∴型からは「剣を持っているか」は分からない。
//   予告と解決の**見た目と音だけ**をこの宣言で振り分ける（当たり判定・盾ブロック・硬直は
//   宣言に関係なく1つの経路＝resolveSwordHit のまま＝機構を二重化しない）：
//     true  … 剣を頭上へ振り上げる（`.swing-windup`）＋金属の擦り上げ音（swordWindup）＋
//             斬撃の光線（`.sword-thrust`）
//     省略  … 体を縮めて溜める（`.slam-windup`＝体当たりと同じ拡大縮小）＋低く沈む唸り
//             （maulWindup）＋牙/爪の一撃（`.sword-thrust.maul-strike`）
//   ⚠️ 2026-08-26 ユーザー実プレイ報告「地中蟲とかも剣で攻撃するようになっちゃったの？
//     こいつらは体当たり攻撃で、その予備動作はいままでどおりサイズの収縮でよかった。
//     変じゃん。剣もってたら。魔王系と剣を持ってる敵だけでいいんじゃないの？」
//     0d-2.6 が予告の絵を**実際の刃**にし、0d-2.7 がそれを全敵の既定にした結果、
//     剣を持たない 10 体（α 地中蟲・G・N・J・O・U・I・L・<・{）が持っていない剣を
//     振り上げていた。∴宣言があるのは剣の絵を持つ7体だけ（θ・μ・ζ と魔王系 V・W・X・Z）。
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
// weakness（Phase 3-3・任意）: { type, multiplier, window? }
//   type … 弱点となる攻撃種別 'sword' | 'beam' | 'arrow' | 'boomerang' | 'bomb' | 'fire'
//   multiplier … その攻撃でのダメージ倍率（def 適用前の素ダメージに掛ける）
//   window（Phase 8-4 (4) 0d-2.11・任意）… 倍率が乗る**時間の窓**。
//     'recover' … 攻撃硬直中（`attackFreezeMs`）だけ弱点になる＝道具ではなく「間」が鍵。
//     判定は `game/enemy-state.js` isInRecoverWindow（絵 `.attack-recover` と同じ関数）。
//     省略時は窓なし＝いつでも type が一致すれば弱点（従来どおり）。
//   弱点ヒット時は combat.js の dealDamageToEnemy が倍率＋専用エフェクト/SE を出す。
//   未定義なら弱点なし＝全攻撃が等倍（後方互換）。
//   ⚠️ 弱点は**その敵と戦う地点で撃てる**種別にする（進行順は shared/progression.js）。
//      持って来られない道具を弱点にすると「死んだ弱点」になる＝tests/weakness-hints.spec.js
//      がボスについてこれを固定している（0d-2.11 (A) で G/J の死んだ弱点を差し替えた）。
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
		wieldsSword: true,      // 絵に剣がある（skeletonDAtk＝振り下ろしのポーズも持つ）
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
		wieldsSword: true,      // 絵に剣がある（飛ぶ斬撃 swordBeam を撃つ敵）
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
		wieldsSword: true,      // 絵に剣がある（盾＋剣の重装＝shieldKnightDAtk も持つ）
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
		wieldsSword: true,      // 勇者の絵の派生＝剣を持っている（魔王系）
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
		wieldsSword: true,      // 勇者の絵の派生＝剣を持っている（魔王系）
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
		//    層2 の判定は闘技場 `test_mechanics 23,1`（bal_dark_lord）で閉じ、世界への配置は
		//    別タスク（PLAN 実行キュー 0o）が持ち主。
		//
		// 【移動アルゴリズム】Phase 8-4 (4) 0d-3・11体目（2026-09-02 実装 → 2026-09-03 ユーザーの
		// 実プレイ判定を受けて追い作業＝以下は現行の設計。旧設計は下に履歴として残す）。
		// ✅ 現行＝**魔将（`TILE.BOSS` V）と同じ張り付き（`hitAndAway`）＋同じ寄り方の癖**を
		//   丸ごと借りる（`speed: ENEMY_SPEED_FAST`・`initialModeWeights` は魔将の後半と同じ数
		//   ＝flank 主体で背後・側面を取りに来る）。**詔（`lockstep`）は移動の主導権を失っても
		//   「魔法攻撃」として残す**＝器（`_lsHeat` 0〜1）が `fillPerSec` で時間により満ち、
		//   押し戻せるのは**歩いた距離だけ**（`coolPerCell`）∴立ち止まる・盾を構える・
		//   剣を振る（MELEE_FREEZE_MS 360 のあいだ歩けない）はすべて器を満たす。満ちると
		//   錨のように止まって唱え（`warnMs`）、**プレイヤーが唱え始めた瞬間に居たタイル**を
		//   中心に半径 `radius`（端距離）の円が落ちる。この打点は**盾を無視する**唯一の
		//   もの＝X の2つの攻撃（剣・石）はどちらも盾で消えるため、盾を上げたまま待つ
		//   抜け穴を塞ぐのがこの打点の役目（ENEMY-DIRECTIONAL-GUIDE §7-16 の支払い＝
		//   予告 `warnMs` ≧ 逃げ切りに要る歩数・床に描く危険域＝当たり判定と同じタイルの
		//   集合・後半フェーズでも予告を縮めない）。外せば `rootMs` の硬直（＝避けた側の
		//   追加の窓）／当てれば `sealMs` だけ剣を封じる。
		// ∴X は「魔将と同じ速さ＋回り込みで殴りに来る」（強さの実体＝速さと位置取り）に
		//   「立ち止まって待つと盾を無視する魔法が来る」を重ねた形＝殴るか退くかだけでなく
		//   「魔将から逃げ切れない」の上に「待っても安全ではない」が乗る。
		// ❌ 旧設計（2026-09-02〜2026-09-03・失効）＝「歩調＝自分の時計で動かず、プレイヤーが
		//   歩いた距離ぶんだけ進む（`stepRatio` < 1）」。ユーザーの実プレイ判定＝「今までの
		//   ボスに比べるとちょっと簡単すぎるかも…魔将のほうがスピードが早い？早いのに、
		//   こちらの横や背後を取ろうとする動きがあって、盾で防げない位置にこようとするのが
		//   強さになってる。なのに魔王は魔将より遅くて、その強さがまったくなくなってしまってる」
		//   （2026-09-03）＝**プレイヤーが走ると絶対に追いつけず、詔（唯一の強さ）が一度も
		//   起きないまま倒せる**プレイが成立していた＝機構は正しく動いていたが「弱い」という
		//   評価そのものが判定に落ちた（0m/0n の「NG」と同じ重さの追い作業）。
		// ⚠️ GUIDE §7-2「敵の速度をプレイヤーと同速にしてはいけない」に**意図的に触れる**＝
		//   魔将（既存）が既にこの数（`ENEMY_SPEED_FAST`）で同じ違反を冒しており、ユーザーは
		//   その強さを「正解」として指定した∴ここは例外として扱う（`hitAndAway` の
		//   approach/retreat 周期が違反を実プレイ上は緩和している＝退避相のあいだは間合いが
		//   開く＝魔将自身もこの緩和だけで運用されている）。
		// ⚠️ 実プレイ判定は未消化（ユーザー＝「強すぎて倒せないかもしれないけど、一度それで
		//   試してみたい」＝2026-09-03 に一旦この数値で試す前提の変更）。
		// ⚠️ hp 120→60→96（2026-09-03・2段のユーザー実プレイ判定）＝120 は「まだ結構きびしい」
		//   → 60（30振り）まで下げたら「あっさり倒せちゃった。HPはもう少しあげてもいいかも」。
		//   ∴他の後半ボス（A/O/L/I）と同じ帯＝**96（48振り＝14.4秒）**へ引き直した
		//   （120＝Z と同格の最硬・60＝失敗した下げすぎ、の中間＝一発の思いつきの数字ではなく
		//   既存ボスの帯に揃えた）。この数値も実プレイ判定待ち。
		hp: 96, atk: 8, def: 2, exp: 100,    // 木の剣で 48 振り（14.4秒）
		speed: ENEMY_SPEED_FAST,  // 2026-09-03: 魔将と同速に変更（旧 SLOW は歩調の移動用の値）
		sprite: 'darklordD',
		pal:    'darklord',
		isBoss: true,
		wieldsSword: true,      // 勇者の絵の派生＝剣を持っている（魔王系）
		directional: true,   // 向き（2026-08-26）＝魔物 W と同じ理由。guards: false は下
		guards:      false,  // darklord*Guard を持たない
		aura:   true,   // 魔王オーラエフェクト（絵だけの旗＝器の満ちを色で載せる土台）
		// 2026-09-03: 魔将（V）と同じ張り付き（`bossTickHitAndAway`）を借りる。
		// ❌ 旧記述「initialModeWeights は書かない＝魔将と1つも違わない」は失効（同日・
		//   ユーザー実プレイ判定）＝「もっと回り込んでくる動きを積極的にやらせたほうがいい
		//   かも」∴ここは魔将から**意図的に外す**。均等抽選（flank/direct/wander 各1.0）
		//   では回り込み（flank）が1/3しか出ない∴魔将よりも回り込みの主張を強くする。
		// ✅ W 魔物の後半フェーズ（0d-3・1体目）と同じ重みを流用
		//   （`{ flank:1.6, direct:0.7, strafe:0.25, wander:0.15 }`）＝flank が抽選の
		//   約64%を占める既に実測済みの値（新しい数を作らず、実プレイで確認済みの重みを
		//   借りる）。X は最初からこの重みで来る（W は後半だけ）。
		hitAndAway: true,
		initialModeWeights: { flank: 1.6, direct: 0.7, strafe: 0.25, wander: 0.15 },
		// 詔（層2＝「魔法攻撃」）。器の満ち方・器の冷やし方・詔の半径・予告・打点・封じ・硬直。
		//   fillPerSec 0.34 … 止まっていると 2.94 秒で満ちる
		//   coolPerCell 0.30 … 歩くと 1 セルにつき 0.30 冷える（全力で走ると 1.25/秒 ＞ 0.34）
		//   radius 1.6 … 端距離＝中心タイルを 1.6 ぶん膨らませた集合＝21 枚（闘技場の床の 25%）
		//   warnMs 1200 … 予告（10 tick ＝ 5.0 マス）。実測した最悪の逃げ切り 3 マス ＋
		//     剣の硬直 360ms（1.5 マスぶん歩けない）＝ 4.5 マスより長い
		//     （`.scratch/darklord-geom.mjs` ＝闘技場 23,1／Z の 33,1 ともに 3 マス）
		//   sealMs 1200 … INVINCIBLE_MS 1500 より短い＝無敵の最後 300ms は必ず振れる
		//   rootMs 900 … 外したときだけの硬直（避けるのが報われる）
		// ⚠️ `stepRatio` は 2026-09-03 に廃止＝移動は `hitAndAway` が持ち主になった
		//   （`enemyLockstepStride`/`lockstepStepToward` は使い手を失ったので削除した）。
		lockstep: {
			fillPerSec: 0.34, coolPerCell: 0.30,
			radius: 1.6, warnMs: 1200, decreeAtk: 8, sealMs: 1200, rootMs: 900,
		},
		attacks: [
			{
				type:            'stone',
				range:           6,
				// 2026-09-03（ユーザーの実プレイ判定）: 近距離では石を投げない。
				// 剣（range 1.5）と石は cooldown が完全に独立している（`enemyAttack` は
				// 攻撃ごとに個別のクールダウンだけを見る＝GUIDE の既定）＝密着して斬り合って
				// いる最中でも石のクールダウンが明けていれば普通に飛んでくる。密着距離では
				// 予告も回避の間合いも無い（プレイヤーの剣の間合い `SWORD_REACH 1.2` の内側で
				// 投げられると「盾で受けた直後に斬りたいのに、斬っている間に石が刺さる」＝
				// 見てから動けない一撃になっていた。`minRange`（潜み鮫の型＝§9-6）で
				// 「密着では出さない」を宣言する＝魔王の剣 1.5 とプレイヤーの剣 1.2 の
				// どちらより外（η 術士の魔弾 minRange 2.0 と同じ数）＝斬り合っている間は
				// 石の心配をしない／石が来るのは間合いを切ったとき（避ける距離と時間がある）。
				minRange:        2.0,
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
			// 第2形態＝魔将の唯一のフェーズと同じ加速（×1.5）・器が速く満ちる（2.94 秒 → 2.0 秒）。
			//   ⚠️ `radius`/`warnMs`/`decreeAtk`/`sealMs`/`coolPerCell`/`rootMs` は据え置き＝
			//   逃げ切りの算術を後半で1文字も変えない（§7-16「後半フェーズでも予告を短くしない」）。
			//   ⚠️ `lockstep` の差し替えは**丸ごと**＝`resolveLockstep` は前半の値と混ぜない
			//   （L/`{` と同じ作法）∴違うのは1つだけでも全部のキーを書く（書き落とすと既定値へ
			//   落ちる）。`modeWeights` は書かない＝回り込みの癖は前半と同じまま（速さだけ増す）。
			{
				hpThreshold: 0.5,
				speedMultiplier: 1.5,   // 魔将の唯一のフェーズと同じ倍率
				lockstep: {
					fillPerSec: 0.5, coolPerCell: 0.30,
					radius: 1.6, warnMs: 1200, decreeAtk: 8, sealMs: 1200, rootMs: 900,
				},
			},
			{ hpThreshold: 0.25, attackCooldownMultiplier: 0.6 }, // HP25%以下で攻撃頻度UP（剣と石に効く）
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
		wieldsSword: true,      // 勇者の絵の派生＝剣を持っている（魔王系）
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
	// 炎をまとった巨大トカゲ型の守護者。体全体が溶岩のように輝き、炎のブレスと石投げで戦う。
	// dropsTriforce:true で撃破時に星の欠片を落とす。
	//
	// Phase 8-4 (4) 0d-3（2体目・2026-08-26）＝**移動アルゴリズムを車線取り（laneStalk）へ替えた**。
	// 旧＝`hitAndAway: true` ＋ 尻尾（sword 1.2）＋石＝**G 岩のゴーレムと同じ「寄って殴る」型**
	// （`initialModeWeights` も `direct` 主体）∴ユーザー要件「同じパターンだとつまらなすぎる」に
	// 反していた。新しい性格＝**行/列を取りに横歩きし、揃うと立ち止まって炎を吐く**：
	//   ・`laneStalk` … プレイヤーの行 or 列（ずれの小さい軸）へ**直交方向だけ**歩いて乗る。
	//     車線に乗ったら `holdMin`〜`holdMax` の間合いへ調整し、揃っていれば**動かない**。
	//     ∴プレイヤーから見た答えは「射線から外れる（横へ歩く）」＝G の「間合いを外す」と違う。
	//   ・`breath` … 予告（`windupMs`）を経てから正面へ**円錐**の炎（`cells`×`spread`）。
	//     盾では防げない（体当たり/突進と同じ＝答えは避けることだけ）。予告の時点で向きが
	//     固定される＝**予告を見てから射線を外せば空振りする**。
	//   ・近接（尻尾）は**持たせない**＝「寄って殴る」型に戻さないための data 側の宣言。
	//     密着されても円錐の1セル目が隣接セルを覆う∴死角にはならない。
	// ⚠️ `holdMax` は breath の `range` 以下にする（GUIDE §3-1 と同型の「届かない判定距離」）。
	// ⚠️ `hitAndAway: false` は**明示**が必要＝`enemyTick` の移動分岐は `hitAndAway` を
	//    最優先で見る∴書かないと `laneStalk` が一度も使われない（W で踏んだ罠と同じ）。
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
		hitAndAway: false,
		// 車線取り＝lockTol より車線のずれが小さくなったら「乗った」と見る。
		// holdMin（1.6）は**プレイヤーの剣の射程 SWORD_REACH 1.2 の外**＝吐く構えのまま
		// 殴られ続けない／holdMax（3.0）は breath の range と同値＝構えた位置から必ず届く。
		laneStalk: { lockTol: 0.6, holdMin: 1.6, holdMax: 3.0 },
		attacks: [
			// 炎のブレス（円錐）。cells＝軸方向の長さ・spread＝軸から外へ広がるレーン数の上限
			// （体の幅 2 レーン → 2セル目以降は 4 レーン）。breathAtk は書かない＝本体の atk。
			{ type: 'breath', range: 3.0, cooldown: 2600, windupMs: 720, cells: 3, spread: 1,
			  breathMs: 420, freezeMs: 480 },
			{ type: 'stone', range: 7, cooldown: 2200, projectileSpeed: 1.2 }, // 炎の石
		],
		attack: { type: 'breath', range: 3.0, cooldown: 2600, windupMs: 720, cells: 3, spread: 1,
		          breathMs: 420, freezeMs: 480 },
		// 後半（HP50%）＝**同じ車線取りが突進に化ける**（`phases[].dash` で機構を差し替える）。
		// 車線に乗る動きは変えず「揃ったら吐く」が「揃ったら走る」に変わる＝プレイヤーが
		// 覚えた読み（射線を外す）がそのまま効くが、外す猶予が短くなる。
		phases: [
			{ hpThreshold: 0.5, speedMultiplier: 1.5, attackCooldownMultiplier: 0.8,
			  dash: { windupMs: 480, speed: 1.5, maxCells: 8, alignTol: 0.8, hitRange: 1.0,
			          minRange: 2.0, maxRange: 8.0, stunMs: 1200, cooldownMs: 1600 } },
		],
	},
	// ── 氷のリヴァイアサン（Phase 3-2）：2×2 大型ボス・dungeon_5（氷の廃墟）──
	// 凍てつく海竜。全身が霜に覆われた巨体で、氷の息と咬みつきで戦う。
	// 動きは遅いが防御力が高く、遠距離からの石投げが主な攻撃手段。
	// dropsTriforce:true で撃破時に星の欠片を落とす。
	//
	// 【移動アルゴリズム】Phase 8-4 (4) 0d-3・10体目（2026-09-02）
	// 氷結（`glaciate`）＝**自分で作った氷の上しか歩けない**。
	//   凍結相（`freeze`）… 足を止め、体の 4 枚＋進む向きへ `laneTiles` 枚（幅は体と同じ2列）を
	//     凍らせる。この相のあいだ**咬みつきも氷礫も出ない**＝剣を入れる唯一の窓。
	//   歩行相（`walk`）… 凍らせた道の上だけを歩く。道を歩き切る／次の一歩が塞がれた
	//     （プレイヤーの体でも塞がる）時点で終わり、その場で凍結相へ戻る。
	//   氷は敷いてから `spikeMs` 後に**氷柱**となって噴き上がる（最後の `warnMs` が赤い予告）。
	//     氷柱は**盾を無視する**唯一の打点＝L の2つの攻撃（咬みつき・氷礫）はどちらも
	//     盾で消えるため、盾を上げたまま張り付く抜け穴を塞ぐのがこの打点の役目
	//     （ENEMY-DIRECTIONAL-GUIDE §7-16 の支払い＝予告 `warnMs` ≧ 逃げ切りに要る歩数・
	//      床に描く危険域＝当たり判定と同じ1タイル・後半フェーズでも予告を縮めない）。
	// ∴「地形が硬直の長さを決める」`{` 海の主（与えられた地形）とは逆に、**居場所を自分で作る**
	//   唯一のボス＝プレイヤーは①氷の上に立たない②凍結相に殴る③L が道から出られないことを
	//   利用して道の上にロウソクの炎を置く（弱点 fire ×3）という3つの答えを持つ。
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
		// 0d-3（10体目）: 間合いの往復（hitAndAway）は W 巨大蜘蛛の型∴明示的に切る。
		//   ⚠️ true のままだと bossTickHitAndAway が移動を専有して `glaciate` の分岐に
		//   一度も来ない（W/A/N/J/O/U/G/I/`{` で9回踏んだ罠）。
		hitAndAway: false,
		// 氷結（層2）。凍結相の長さ・道の長さ・氷柱までの猶予・予告の長さ・氷柱の攻撃力。
		//   freezeMs 700 … 木の剣 2 振り（SWORD_COOLDOWN_MS 300）が入る窓
		//   laneTiles 3 … 道は体の 4 枚＋前方 3 枚 ＝最大 10 枚（床の 12〜14%）
		//   spikeMs 2400 … 敷いてから噴くまで（20 tick ＝プレイヤーは 10 マス歩ける）
		//   warnMs 1080 … 予告（9 tick ＝ 4.5 マス）。実測した最悪の逃げ切り 4 マスより長い
		//     （`.scratch/leviathan-geom.mjs` ＝闘技場 4／本番 3／melee_only 2 マス）
		glaciate: { freezeMs: 700, laneTiles: 3, spikeMs: 2400, warnMs: 1080, spikeAtk: 4 },
		attacks: [
			{ type: 'sword', range: 1.5, cooldown: 1100 },  // 咬みつき（リーチが長い）
			{ type: 'stone', range: 8, cooldown: 2800, projectileSpeed: 0.9 }, // 氷の礫
		],
		attack: { type: 'sword', range: 1.5, cooldown: 1100 },
		phases: [
			// 第2形態＝凍結相が短くなる（剣の窓が 2 振り→1 振り）・氷柱が早く噴く。
			//   ⚠️ `warnMs` は前半と同じ 1080 のまま＝予告を縮めると逃げ切れない
			//   （§7-16「後半フェーズでも予告を短くしない」）。
			{
				hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.75,
				glaciate: { freezeMs: 520, laneTiles: 3, spikeMs: 1800, warnMs: 1080, spikeAtk: 4 },
			},
		],
	},
	// ── 砂嵐の蠍王（Phase 3-2）：2×2 大型ボス・dungeon_2（砂漠の神殿）──
	// 砂漠の守護者。8本の鉗肢と曲がった毒針を持つ巨大蠍。
	//
	// 【移動アルゴリズム】Phase 8-4 (4) 0d-3・3体目（2026-08-26）
	// 潜行待ち伏せ（`burrowAmbush`）＝**潜っているあいだだけ歩き、地上では1歩も動かない**。
	//   潜行中（e.hidden=true）… 無敵・攻撃なしのまま、プレイヤーの**向こう側**の
	//     待ち伏せ地点（`pickAmbushCell`）へ砂の下を回り込む。着いた瞬間に浮上する。
	//   地上中（e.hidden=false）… **移動を完全に止め**、鉗肢（sword）と毒針（stone）で戦う。
	// ∴移動と交戦が**時間で完全に分離する**型＝G 岩のゴーレム（常に歩いて殴る）・
	//   W 巨大蜘蛛（間合いを往復する）・A 炎のサラマンドラ（車線を取って止まる）の
	//   どれとも別の近づき方になる（歩いているあいだは殴れない／殴れるあいだは歩かない）。
	// 弱点ブーメラン×3 と噛み合う＝浮上している窓がそのまま「ブーメランを当てる窓」。
	[TILE.SAND_SCORPION]: {
		name: '砂嵐の蠍王',
		hp: 90, atk: 5, def: 1, exp: 45,      // 8-4: 木の剣で 30 振り（9秒）＝ボスの下限帯
		// ⚠️ この speed は**潜行中の速度**（地上では 1 歩も動かない）。
		//   回り込みは hiddenMs 2400ms ＝ 20 tick に収める必要がある∴鈍足では
		//   到達できない（旧 0.275 では潜行1回で 2〜3 マスしか進めず回り込めなかった）。
		//   実測（2026-08-26）：0.8 で 20 tick ＝ 16 歩 × MOVE_STEP 0.5 ＝**8 マス**進む
		//   ＝10×12 の部屋を端から回り込める上限。プレイヤーの向こう側へ回るには
		//   体（2×2）が2マス直交へ迂回する∴経路長は直線距離より 4 マス前後長くなる。
		//   プレイヤー（1.0）より必ず遅くする（ENEMY-DIRECTIONAL-GUIDE §7-2）。
		speed: ENEMY_SPEED_FAST * 0.8,
		sprite: 'sandScorpion',
		pal:    'sandScorpion',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'boomerang', multiplier: 3 },  // 旋回刃で鉗肢を断つ
		hitAndAway: false,       // 間合いの往復は W 巨大蜘蛛の型∴明示的に切る
		hide:   { hiddenMs: 2400, shownMs: 2600, style: 'burrow', emergeSound: 'sandBurst' },
		burrowAmbush: { ambushDist: 1 },  // プレイヤーの向こう側・隣接まで回り込む
		attacks: [
			{ type: 'sword', range: 1.3, cooldown: 750 },   // 鉗肢なぎ払い
			{ type: 'stone', range: 7, cooldown: 2400, projectileSpeed: 1.3 }, // 毒針投げ
		],
		attack: { type: 'sword', range: 1.3, cooldown: 750 },
		phases: [
			// 第2形態＝潜行を短くする＝待ち伏せの回数が増える。同時に**無敵の窓も短くなる**
			// ＝プレイヤーにとっては「殴れる時間の割合」が増える方向の強化（一方的に硬くしない）。
			// speedMultiplier は 0.8×1.15=0.92＝プレイヤー（1.0）を超えない範囲に留める。
			// hiddenMs 1400ms ＝ 約12 tick ＝速度 0.92 で約 4.5 マス＝**近い相手にしか
			// 回り込めない**（遠い時は途中で浮上する）＝後半は「距離を詰めてから潜る」形になる。
			{ hpThreshold: 0.5, speedMultiplier: 1.15, attackCooldownMultiplier: 0.75,
			  hide: { hiddenMs: 1400, shownMs: 2600, style: 'burrow', emergeSound: 'sandBurst' } },
		],
	},
	// ── 深海の海蛇（Phase 3-2）：2×2 大型ボス・dungeon_3（水の迷宮）──
	// 深淵から召喚された巨大海蛇。長い胴体を波打たせて**プレイヤーの周りを回り**、
	// 輪を一周ごとに縮めて締め上げる。噛みつきと水球投げを回りながら撒く。
	//
	// 層2（この敵だけの機構）＝`coil`（巻きつき・Phase 8-4 (4) 0d-3 の4体目）。
	//   ・**プレイヤーへ寄らない**＝見つけた地点（`_coilCx/_coilCy`）を中心に接線方向へ回る。
	//   ・半径は時間に比例して**連続に縮む**（`shrinkPerSec`）→ `radiusMin` に届いたら
	//     **締め上げ**（輪の内側を潰す・予告 `crushWindupMs` つき）。
	//     縮み具合（0〜1）は輪の色（青→赤）と軋みの音（`tightenCues`）に出る＝
	//     「あとどれくらいで来るか」が絵と音で連続に読める（2026-08-29 ユーザー判定）。
	//   ・プレイヤーが輪の外（`radius + escapeMargin`）へ出たら中心を捨てて巻き直す
	//     ＝**これがプレイヤー側の答え**（＝間合いの読みではなく「輪の内か外か」の読み）。
	// ∴G 岩のゴーレム（まっすぐ来て振り下ろす）・W 魔物（間合いを往復して石）・
	//   A 炎のサラマンドラ（車線を取って止まる）・N 砂嵐の蠍王（潜行中だけ歩く）の
	//   どれとも別の近づき方＝**そもそも近づいてこない**（囲いを狭めてくる）。
	// 弱点 arrow ×2 と噛み合う＝弓は軸を合わせて撃つ∴立ち止まる必要がある＝
	//   **立ち止まる＝輪の中に留まる**（PLAN「軸に入ると危険な位置へ動く」型の要件）。
	//   輪が縮み切る手前だけ剣も届く（半径 1.6・2×2 の体の端＝中心から 0.6）＝
	//   「締め上げの直前は殴れるが潰される」というトレードになる。
	[TILE.SEA_SERPENT]: {
		name: '深海の海蛇',
		hp: 84, atk: 4, def: 2, exp: 52,      // 8-4: def 3→2＝木の剣で 42 振り（13秒）
		// ⚠️ 0d-3（4体目）で ENEMY_SPEED_SLOW*0.95（0.2375）→ ENEMY_SPEED_FAST*0.7（0.7）。
		//   理由＝`coil` は**輪の周を泳ぐ距離**が時間になる（半周＝πR セル）∴鈍足では
		//   半周に 8 秒以上かかり「回っている」と読めないまま戦闘が終わる（hp84＝木の剣で13秒）。
		//   実測の基準：0.7 ＝ 1.43 tick に 1 歩（MOVE_STEP 0.5）＝半径 2.6 の半周が約 23 tick
		//   （2.8 秒）∴縮み（shrinkPerSec 0.3 ＝ 2.6→1.6 が 3.33 秒）のあいだに**半周以上まわる**
		//   ＝「回りながら締めてくる」が読める（締め上げの予告 0.72 + 硬直 0.48 で 1 周期 4.5 秒）。
		//   速いのに理不尽にならない根拠＝**接線方向にしか動かない**（プレイヤーへ寄らない）∴
		//   走って逃げれば必ず輪の外に出られる（プレイヤー 1.0 より遅い・GUIDE §7-2 も満たす）。
		speed: ENEMY_SPEED_FAST * 0.7,
		sprite: 'seaSerpent',
		pal:    'seaSerpent',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		// 8-4 0d-2.11 (A): beam → arrow。理由＝光の刃は剣のティア1（`forest_cave` の
		// 銀の剣）が要る＝D6 クリア後の任意ダンジョン∴D3 の時点では**永久に撃てない**
		// （＝弱点が死んでいた）。弓は D2 の報酬＝D3 に入る前に必ず持っている。
		weakness: { type: 'arrow', multiplier: 2 },   // 矢で鱗の隙間を貫く
		hitAndAway: false,       // 間合いの往復は W 魔物の型∴明示的に切る（切らないと coil に来ない）
		// 巻きつき（層2）。半径は**中心からの距離**＝2×2 の体の端は 1 セル内側にある
		// ∴半径 2.6 ＝端まで 1.6（プレイヤーの剣 SWORD_REACH 1.2 の外）／
		//   半径 1.6 ＝端まで 0.6（剣が届く）＝縮むにつれて殴れるようになる。
		coil: {
			radius: 2.6,          // 巻き始める半径（＝見つけた地点からの距離）
			radiusMin: 1.6,       // ここまで縮んだら締め上げへ移る
			// ⚠️ 2026-08-29 ユーザー判定で「段（半周ごとに 1.0 縮む）」→「連続」へ変更。
			//   理由＝段だと縮んだ瞬間しか情報が出ず、初見では何が起きるのか読めない。
			//   1秒に 0.3 セル縮む＝2.6→1.6 に 3.33 秒（＝半周以上まわりながら常に縮む）。
			//   ⚠️ 時間あたりで縮む（泳いだ弧ではない）＝攻撃硬直のあいだも輪は止まらない。
			shrinkPerSec: 0.3,
			// 輪の締まり具合（0〜1）がこの値を越えるたびに軋みの音（coilTighten）を1回鳴らす
			// ＝画面の色（青→赤）と同じ拍を音でも出す（予告 coilWindup より前の合図）。
			tightenCues: [0.4, 0.75],
			escapeMargin: 1.0,    // 輪の外＝半径＋この余白を越えられたら巻き直す（答え）
			crushWindupMs: 720,   // 締め上げの予告（水の輪が縮む絵＋SE coilWindup）
			crushMs: 420,         // 締め上げの見た目の長さ
			crushPad: 0.4,        // 潰す範囲＝閉じた半径＋この余白（輪の線の上も含める）
			crushAtk: 4,          // 締め上げのダメージ＝噛みつきと同じ（新しい最大打点を作らない）
			crushFreezeMs: 480,   // 締め上げ後の硬直＝プレイヤーの反撃の窓
			stallLimit: 4,        // 回れない（壁）が続いたら巻き直す＝案山子にならない保険
		},
		attacks: [
			{ type: 'sword', range: 1.6, cooldown: 1000 },  // 咬みつき（リーチ長）
			{ type: 'stone', range: 8, cooldown: 2600, projectileSpeed: 1.0 }, // 水球
		],
		attack: { type: 'sword', range: 1.6, cooldown: 1000 },
		phases: [
			// 第2形態＝**速く締めて、広く潰す**。
			//   ・1秒 0.5 セル（前半 0.3）＝2.6→2.0 が 1.2 秒（前半は 2.6→1.6 の 3.33 秒）
			//     ＝「輪の外に出る」判断を急がされる（予告 720ms は据え置き＝逃げ道は同じ幅）。
			//   ・締め上げに入る半径が 2.0（前半 1.6）＝潰す範囲が 2.4（前半 2.0）に広がる
			//     ＝**踏み込んで殴った位置が危なくなる**（前半は輪の縁まで下がれば安全だった）。
			// ⚠️ 巻き始めの半径は前半と同じ 2.6 にする＝相が切り替わった瞬間に**輪の絵が跳ばない**
			//    （`_coilR` は相をまたいで連続＝縮んでいる途中で 2.2 に広がると読みが壊れる）。
			// ⚠️ 半径 2.0 でも剣は届く（2×2 ∴体の端は中心から 1.0・SWORD_REACH 1.2）＝
			//    後半も「締め上げの直前に殴れる」トレードは残る。
			// speedMultiplier は 0.7×1.3=0.91＝プレイヤー（1.0）を超えない範囲に留める。
			// ⚠️ tightenCues は前半と同じ値＝**色と音の意味を相で変えない**（赤くなったら来る）。
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.7,
			  coil: {
				radius: 2.6, radiusMin: 2.0, shrinkPerSec: 0.5, tightenCues: [0.4, 0.75],
				escapeMargin: 1.0, crushWindupMs: 720, crushMs: 420, crushPad: 0.4,
				crushAtk: 4, crushFreezeMs: 480, stallLimit: 4,
			  } },
		],
	},
	// ── 古森の巨人（Phase 3-2）：2×2 大型ボス・dungeon_6（森の聖域）──
	// 大樹の精霊が宿った樹人の守護者。巨木の腕で叩きつけ、岩を放物線で放り落とす。
	// Phase 8-4 (4) 0d-3（5体目）で移動アルゴリズムを層2の固有機構 `gaze`（見据え）へ差し替えた。
	//   ＝**プレイヤーを追わない。見据えた1点（`_gazeCx/_gazeCy`）だけを追う。**
	//   ①`stampMs` の予告のあいだ床に印が濃くなっていく（＋SE gazeMark）
	//   ②予告が切れた瞬間、その印へ**放物線で岩を放る**（`lob`＝遮蔽が効かない・立ち位置で避ける）
	//   ③岩が着弾して `restMs` 経ってから**次の印を立てる**（＝周期は「印1つ＝岩1つ」で必ず対応する）
	//   ④移動は①〜③のあいだ常に**印へ向かって歩く**（BFS）＝プレイヤーが動き続ければ
	//     巨人は「さっき居た場所」へ踏み込み続ける／立ち止まれば印が足元に来て岩が落ちる
	// ∴プレイヤー側の答えは「印から離れる」＝間合い（G/W）でも射線（A）でも浮上位置（N）でも
	//   輪の内外（J）でもない**「印の内か外か」**の読みになる。弱点 fire（ロウソク＝密着）と噛み合う
	//   ＝焼くには寄る必要があるが、寄って留まると印が自分の足元に立つ（＝岩が落ちる）。
	[TILE.FOREST_GIANT]: {
		name: '古森の巨人',
		hp: 96, atk: 5, def: 2, exp: 58,      // 8-4: 木の剣で 48 振り（14秒）
		// ⚠️ 0d-3（5体目）で `ENEMY_SPEED_SLOW * 0.9`（0.225）→ `ENEMY_SPEED_NORMAL`（0.5）。
		//   理由＝`gaze` は「見据えた地点へ**踏み込む**」移動∴印へ歩き着けないと機構が画面に出ない。
		//   0.225 では 1 周期（予告 1080 + 飛翔 + 余韻 480 ≈ 2.2 秒）に 1.9 セルしか進めず、
		//   プレイヤー（1.0 ＝ 1 tick に MOVE_STEP 0.5 ＝ 4.2 セル/秒）が離れると印に着く前に
		//   次の印が立つ＝**巨人が「さっき」を踏み潰しに来る**が読めない。
		//   0.5 ＝ 2.08 セル/秒 ＝ 1 周期で約 4.5 セル＝印まで歩き着く。プレイヤーより遅い（GUIDE §7-2）。
		speed: ENEMY_SPEED_NORMAL,
		sprite: 'forestGiant',
		pal:    'forestGiant',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		weakness: { type: 'fire', multiplier: 2 },   // 炎で樹皮を焼き払う
		hitAndAway: false,   // 明示（W/A/N/J と同じ罠＝書かないと `gaze` の分岐に来ない）
		// 見据え（層2の固有機構）。**「印1つ＝岩1つ」の1つの時計**で回す（GUIDE §7-7）。
		gaze: {
			stampMs:     1080,  // 印を立ててから岩を放るまで（9 tick）＝プレイヤーが離れる猶予。
			                    // プレイヤーは 9 tick で 4.5 セル走れる ≫ 印の半径 1.2 ＝必ず出られる。
			restMs:       480,  // 着弾から次の印までの余韻（4 tick）＝**殴り返す窓**（硬直と同じ長さ）
			throwFreezeMs: 480, // 岩を放った直後の硬直（＝反撃の窓・`.attack-recover` の絵が出る）
			rockSpeed:    1.2,  // 岩の飛翔速度（`speed × MOVE_STEP` ＝0.6 セル/tick）
			                    // ＝遠くから投げた岩は落ちるまで長くかかる（＝遠距離は安全だが手も出ない）／
			                    //   密着した相手の足元へは 2〜3 tick で落ちる＝**居座りだけが即座に罰される**
			stampRadius:  1.2,  // 着弾で潰れる半径（セル）＝印の絵と同じ数（絵と当たりを1つの数で持つ）
			stampAtk:       5,  // 岩のダメージ＝`atk` と同値（新しい最大打点を作らない＝J の crushAtk と同じ作法）
			arcHeight:    1.6,  // 見た目の弧の高さ（セル）＝当たり判定には効かない
		},
		// ⚠️ 遠隔の `stone`（木の実投げ）は**外した**＝岩投げは `gaze` の周期そのものが持つ∴
		//    別の投擲が混ざると「印＝これから落ちる場所」の読みが壊れる（1つの時計にしない）。
		// ⚠️ `initialModeWeights` も外した（旧値は `direct 1.7` 主体＝G の「まっすぐ来て振り下ろす」型）。
		//    `hitAndAway: false` ＝寄り方の抽選（`resolveModeWeights`）を一度も通らない∴
		//    書いても効かない死んだ数値になる（W で確認済みの作法）。
		attacks: [
			{ type: 'sword', range: 1.4, cooldown: 950 },   // 枝腕なぎ払い（密着した相手だけ）
		],
		attack: { type: 'sword', range: 1.4, cooldown: 950 },
		phases: [
			// 第2形態＝**見据え直しが速く、潰す範囲が広い**（＝印から離れる判断を急がされる）。
			// ⚠️ `stampAtk` は前半と同値＝新しい最大打点を作らない（速さと広さだけで圧を上げる）。
			// ⚠️ 予告 720ms でもプレイヤーは 6 tick ＝ 3.0 セル走れる > 半径 1.6 ＝**間に合う**。
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.8,
			  gaze: {
				stampMs: 720, restMs: 360, throwFreezeMs: 360, rockSpeed: 1.4,
				stampRadius: 1.6, stampAtk: 5, arcHeight: 1.6,
			  } },
		],
	},
	// ── 嵐の鷲王（Phase 3-2）：2×2 大型ボス・dungeon_7（空の神殿）──
	// 嵐を纏う翼王。**地上に長く留まらない**＝舞い上がって旋回し、軸を合わせて急降下する。
	// Phase 8-4 (4) 0d-3（6体目）で層2の固有機構 `soar`（滞空と急降下）を入れた。
	// ⚠️ 旧構成（`hitAndAway: true` ＋ 鉤爪＋雷撃弾＋速度倍率だけ）は G 岩のゴーレムと
	//    同じ「まっすぐ来て振り下ろす」型＝13体で1つの雛形を使い回していた（0d の出発点）。
	[TILE.STORM_EAGLE]: {
		name: '嵐の鷲王',
		hp: 108, atk: 6, def: 1, exp: 55,     // 8-4: 木の剣で 36 振り（11秒）
		speed: ENEMY_SPEED_SLOW * 1.3,   // 鷲なので速め（地上を歩くときの速さ）
		sprite: 'stormEagle',
		pal:    'stormEagle',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		// 弱点＝矢。0d-3（6体目）で**機構の解除鍵**にした＝滞空中は剣が届かず、矢を当てると
		// 墜落して長い気絶（`crashStunMs`）になる（δ 分裂スライムの `blockedBy` と同じ作法＝
		// 弱点は倍率だけでなく「機構を解く鍵」でもある）。D7 のヒント看板
		// 「嵐の鷲王を射抜けば、最後の欠片が得られよう」がそのまま戦い方の説明になる。
		weakness: { type: 'arrow', multiplier: 2 },
		hitAndAway: false,   // 明示（W/A/N/J/O と同じ罠＝書かないと `soar` の分岐に来ない）
		// wieldsSword（2026-08-31・ユーザー確定・既存の剣振り上げを流用）＝鉤爪の予備動作を
		// 体当たり型（`.slam-windup`＝抱えて縮む）ではなく方向性のある振り上げ（`.swing-windup`）
		// にする。**絵に剣は無い**が `directional` を持たない（2×2 ボスは向き別スプライトを
		// 持たない）ため `${sprite}Atk` へのポーズ差し替えは走らない＝CSS の刃オーバーレイと
		// 音・解決の絵だけが変わる（新規スプライト0）。`tests/enemy-melee-windup-by-weapon.spec.js`
		// の①（宣言は絵から導出した集合と一致）に**確認済みの例外**として明記した。
		wieldsSword: true,
		// 滞空と急降下（層2の固有機構）。**空に居るあいだは地上の攻撃が届かない**（矢だけ届く）
		// ＝「近づき方」そのものが他の12体と別になる（寄って来るのは地上に居る短い間だけ）。
		//   ground … 地上＝歩いて寄り鉤爪を振る（＝剣を入れられる窓）
		//   rise   … 舞い上がる溜め（動かない・攻撃しない・**まだ地上＝殴れる**）
		//   air    … 滞空＝旋回して軸（行/列）を合わせる。剣/ブーメラン/爆風/炎は届かない
		//   aim    … 急降下の予告（軸が確定する＝**軸から外れれば避けられる**）
		//   dive   … 急降下＝一直線に落ちてくる（接触でダメージ・ここは殴れる）
		//   land   … 着地硬直＝動かない・攻撃しない（＝反撃の窓）
		soar: {
			groundMs:    1560,  // 13 tick 地上に居る＝剣を入れる窓（プレイヤーが寄る時間も含む）
			riseMs:       480,  // 4 tick 舞い上がる溜め（＝「空へ逃げる」の予告。まだ殴れる）
			// airMs＝滞空の**下限**（2026-08-30 ユーザー指摘で意味が変わった＝DECISIONS
			// 2026-08-30（5）決定5）。「最低これだけ回る」＝旋回は結果として伸びる。
			// 宙吊り防止の保険（軸が最後まで揃わなかったときの強制落下）は別の上限
			// `airMaxMs` が持つ＝旧い意味（上限）を持つ保険を消さずに分けた。
			airMs:       2880,  // 24 tick 滞空の下限（これより早く `aim` へは移らない）
			airMaxMs:    4320,  // 36 tick 保険の上限（airMs の1.5倍・tick境地）＝ここまで
			                    // 揃わなくても `soarAnyVec` で必ず落ちる（宙吊り防止）。
			                    // ⛔ 止まる条件1参照＝sky/ground 比は前半 2.5・後半 2.83（<3）。
			orbitRange:   3.5,  // 旋回で保つ距離（body の端から）＝剣の間合い外・弓の間合い内
			orbitSpeed:   0.75, // 旋回の速さ（セル/tick 換算の歩幅倍率）
			                    // ⚠️ プレイヤー（1.0）より必ず遅くする（GUIDE §7-2）
			alignTol:     0.6,  // 「軸が揃った」と見なす直交ずれ＝急降下を始める条件
			aimMs:        600,  // 5 tick 急降下の予告＝プレイヤーは 2.5 セル走れる ≫ 0.6 ∴避けられる
			diveSpeed:    1.5,  // 急降下の速さ（MOVE_STEP 刻みで補間＝当たりを飛び越さない）
			diveCells:      9,  // 落ち切る距離（部屋を突き抜けない長さ）
			diveHitRange: 1.0,  // 落下軸の前方どこまでが当たるか（body の端から）
			diveAtk:        6,  // 急降下の打点＝`atk` と同値（新しい最大打点を作らない）
			landFreezeMs: 600,  // 5 tick 着地硬直＝**殴り返す窓**（`.attack-recover` の絵が出る）
			crashStunMs: 1800,  // 15 tick 矢で射落としたときの墜落＝気絶（大きな反撃の窓）
			reachedBy: 'arrow', // 滞空中に**唯一届く攻撃**（＝`weakness.type` と同じ＝弓が答え）。
			                    // combat.js `isSoarOutOfReach` が読む。δ の `split.blockedBy` と
			                    // 同じ作法＝「機構を解く手段」をデータ側に1か所だけ書く。
			// 旋回は連続角度で本当に円弧を描く（DECISIONS 2026-08-31（8）＝J 深海の海蛇の
			// `coil`（`_coilAng` を cos/sin で動かす）と同じ仕組みを転用。ユーザー実プレイ
			// 指摘＝「90度に曲がることではなく、本当に円弧を描くように回転する」で
			// 「四角い軌道」は失効した）。中心（`_soarCx/_soarCy`）はプレイヤーに固定せず
			// **緩く追従する**（ユーザー確定＝「きっちり追従させず、動いたら動いた方向に
			// 少しずつ中心軸を移動させる」）。
			centerFollow: 0.12, // 1歩ごとに中心→プレイヤーの差を詰める割合（0〜1・小さいほど緩い追従）
			// 反転（時計回り↔反時計回り）の周期は不規則に見えるようにする（ユーザー確定＝
			// 「不規則（時間や乱数っぽく）」）。ただし乱数は使わない（GUIDE §7-3）＝
			// `e.id` と反転回数から決定的に「ランダムに見える」小数を作る（`soarFlipLaps`）。
			// 1回の周回量は flipLapsMin〜flipLapsMax の間でこの決定的な値から決まる。
			// ⚠️ 1回の滞空（`air`）の長さ自体が短い（前半24〜36 tick）＝1周（360度）を
			//   反転の単位にすると1回の滞空でほぼ反転できない（実測で発見）。**滞空の中で
			//   複数回向きが変わる**ためには反転の単位を1周よりずっと小さくする必要がある。
			flipLapsMin: 0.1,   // 反転までの最短＝約0.1周（36度・約6 tick）
			flipLapsMax: 0.35,  // 反転までの最長＝約0.35周（126度・約20 tick）
		},
		attacks: [
			// 鉤爪＝**地上に居るあいだだけ**振れる（滞空中は近接を出さない＝enemyAttack のゲート）。
			// 予告は全敵の既定（MELEE_WINDUP_MS 480ms・0d-2.7）∴書かない。
			{ type: 'sword', range: 1.1, cooldown: 700 },
			// 雷撃弾＝空からも届く唯一の攻撃＝「待っていれば安全」を消す（弓で落とす動機になる）。
			{ type: 'stone', range: 7, cooldown: 2000, projectileSpeed: 1.4 },
		],
		attack: { type: 'sword', range: 1.1, cooldown: 700 },
		// ⚠️ `initialModeWeights` は外した＝`hitAndAway: false` は寄り方の抽選
		//    （`resolveModeWeights`）を一度も通らない∴書いても効かない死んだ数値になる
		//    （W/O で確認済みの作法）。
		phases: [
			// 第2形態＝**地上に居る時間が短く、旋回が速く、急降下が速い**。
			// ⚠️ 打点（diveAtk）は前半と同値＝速さと滞空の長さだけで圧を上げる。
			// ⚠️ `aimMs` 480ms でもプレイヤーは 4 tick ＝ 2.0 セル走れる > `alignTol` 0.6 ＝間に合う。
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.8,
			  soar: {
				groundMs: 960, riseMs: 360, airMs: 2160, airMaxMs: 3240,
				orbitRange: 3.5, orbitSpeed: 0.95,
				alignTol: 0.6, aimMs: 480, diveSpeed: 1.9, diveCells: 9, diveHitRange: 1.0,
				diveAtk: 6, landFreezeMs: 480, crashStunMs: 1320,
				centerFollow: 0.12, flipLapsMin: 0.1, flipLapsMax: 0.35,
			  } },
		],
	},
	// ── 岩のゴーレム（Phase 3-2）：2×2 大型ボス ──────────────────
	// size:{w,h} を持つ最初の大型敵。dungeon_1（最初のダンジョン）の
	// ボスとして採用。❌ 旧記述「hitAndAway AI で接近戦闘し、向きを変えながら戦う」は
	// 失効（2026-08-31・0d-3 の7体目）＝移動は新機構 `momentum`（慣性）＝下記。
	// dropsTriforce: true で撃破時に星の欠片を落とす（DARK_LORD と同等）。
	// スプライトは 2×2 セル相当の 24×24（向きエイリアス rockGolemR/L/D/U）。
	[TILE.ROCK_GOLEM]: {
		name: '岩のゴーレム',
		// 8-4 0d-2.8: hp 90 → 60。木の剣で 30 振り（9秒）＝ボス帯（30〜60 振り）の下限。
		// atk 4 は据え置き＝D1 は世界に盾が無い地点（盾は D2 の報酬）だが、D1 内で拾える
		// 革の鎧（def 1）とハートの器を持って来れば 4→3 ダメージ／HP8 で 3 発耐えられる。
		// ∴耐久側は装備の回収で解き、ここでは殴り合いの長さだけを削る。
		// 硬直に斬れば（弱点×3）1発 10 ダメージ＝6 振り。通常の 30 振りと 5 倍の差。
		hp: 60, atk: 4, def: 2, exp: 40,
		speed: ENEMY_SPEED_SLOW,   // 大型なので鈍重
		sprite: 'rockGolem',
		pal:    'rockGolem',
		size:   { w: 2, h: 2 },    // ← 2×2 セルを占有
		isBoss: true,
		dropsTriforce: true,       // 撃破で星の欠片を落とす（boss.js が参照）
		// 8-4 0d-2.11 (A): 爆弾 → 「攻撃硬直の窓に剣で斬る」。理由＝爆弾は D6 の報酬＝
		// D1 のボスには**永久に持って来られない**（D1 は再訪しても倒す相手が居ない）∴
		// 弱点が死んでいた。D1 の時点で撃てるのは剣だけ∴道具の代わりに**間（タイミング）**を
		// 弱点にした。`window: 'recover'` ＝硬直中（`attackFreezeMs` 480ms・絵は
		// `.attack-recover` で前かがみに沈む）だけ倍率が乗る。判定は
		// `game/enemy-state.js` isInRecoverWindow ＝絵と同じ関数を共有する。
		// ∴この敵の meta が既に書いている「予告を見て避ける → 硬直に殴り返す」が
		//   そのまま弱点になり、最初のダンジョンで「弱点とは何か」を教えられる。
		weakness: { type: 'sword', window: 'recover', multiplier: 3 },
		// ❌ ここにあった `hitAndAway: true`（接近→攻撃→後退）は失効
		//    （2026-08-31・0d-3 の7体目）＝移動は下の `momentum`（慣性）へ替えた。
		//    今は同じキーを `false` で明示している（下記）＝**同じ物の宣言は1か所**に保つ
		//    （同じオブジェクトに同名キーを2回書くと後勝ちで、読み手が前の行を信じる）。
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
		// Phase 8-4 (4) 0d-3（7体目・2026-08-31）＝**移動アルゴリズムを慣性（momentum）へ替えた**。
		//   ・`hitAndAway: false` … **明示**しないと `momentum` の分岐に一度も来ない
		//     （W/A/N/J/O/U で6回踏んだ罠＝`bossTickHitAndAway` が移動分岐の最優先）。
		//   ・`initialModeWeights` は**外した** … `hitAndAway: false` では寄り方の抽選を
		//     一度も通らない＝書いても効かない死んだ数値（W/O/U と同じ作法）。
		//   ・`momentum` … プレイヤーの**位置ではなく速度**を追う＝止まれず曲がれない。
		//     プレイヤーが横へ退くと大きく通り過ぎ、戻ってくるまでが殴れる時間になる。
		//     `heavySpeed` は**1つの数を3人が読む**しきい値＝①体当たりが成立する速さ
		//     ②壁で自壊する速さ ③土煙（`.momentum-heavy`）が出る速さ∴プレイヤーが覚える
		//     規則は「土煙が出ている岩は危ないが、壁にぶつければ崩れる」の1本だけ。
		//   ・`accel / friction === maxSpeed` … 終端速度と上限を一致させている
		//     （片方だけ動かすと飽和点がずれる＝数を変えるときは必ず両方見る）。
		//     飽和まで 10 tick ≒ 1.2 秒＝助走が見える長さ。
		//   ・`maxSpeed 0.30` セル/tick ＝ 2.5 セル/秒 < プレイヤー 4.17（GUIDE §7-2）。
		//   ・`ramAtk` は `atk` と同値＝新しい最大打点を作らない（U の `diveAtk` と同じ）。
		//   ・`crashStunMs 1800` ＝ 15 tick ＝剣の cd 300ms で 6 振り＝12 ダメージ（HP の 20%）。
		//     ⚠️ **ここに弱点 ×3 は乗せない**（乗せると 60 ダメージ＝即死）＝倍率は
		//     攻撃硬直の窓に一本化する（U の「解除鍵は1つ」と同じ作法）。
		hitAndAway: false,
		momentum: {
			accel: 0.03, maxSpeed: 0.30, friction: 0.10,
			heavySpeed: 0.18, ramRange: 1.0, ramAtk: 4, crashStunMs: 1800,
		},
		phases: [
			// HP50%以下＝**さらに止まれない**（最高速 ×1.4・崩れている時間は短い）。
			// ⚠️ 旧 `speedMultiplier: 1.4` は外した＝`momentum` は `resolveEnemySpeed`
			//    （歩幅の溜め）を一度も読まない＝死んだ数値。1.4 の意図は maxSpeed が継ぐ。
			{ hpThreshold: 0.5, attackCooldownMultiplier: 0.85, momentum: {
				accel: 0.045, maxSpeed: 0.42, friction: 0.09,
				heavySpeed: 0.18, ramRange: 1.0, ramAtk: 4, crashStunMs: 1320,
			} },
		],
	},
	// ── 沼地の大蝦蟇（Phase 9-2c）：2×2 大型ボス・dungeon_8（沼地の遺構）────
	// 沼地の主＝膨れ上がった毒蝦蟇。8体目の dropsTriforce ボス。
	// 弱点は炎（ロウソク＝D4 で入手済み）。剣でも倒せる。
	// Phase 8-4 (4) 0d-3（8体目）: **移動アルゴリズムを `tongue`（舌）に置き換えた**。
	//   ＝13体で唯一「自分ではなく相手を動かす」ボス。自分からは歩いて詰めない
	//   （帯の外に居るときだけ跳ねて寄る）＝舌で**プレイヤーを口元へ引き寄せる**。
	//   舌が出ているあいだ蝦蟇は錨で固定＝引かれている時間がそのまま殴れる窓になる。
	// ⚠️ 旧データは `hitAndAway: true` ＋ `initialModeWeights` ＋ `phases[].speedMultiplier`
	//    だった＝「間合いを往復して寄る」（W と同じ型）∴0d-3 の判定基準（近づき方を1体ずつ
	//    変える）に反する。`tongue` の下では寄り方の抽選も歩幅の溜め（`resolveEnemySpeed`）も
	//    一度も読まれない∴3つとも**外した**（残すと死んだ数値になる）。
	[TILE.SWAMP_TOAD]: {
		name: '沼地の大蝦蟇',
		hp: 96, atk: 5, def: 2, exp: 56,      // 8-4: 木の剣で 48 振り（14秒）
		speed: ENEMY_SPEED_SLOW,          // 鈍重（跳ねる速さは tongue.hopCells/hopMs が決める）
		sprite: 'swampToad',
		pal:    'swampToad',
		size:   { w: 2, h: 2 },
		isBoss: true,
		dropsTriforce: true,
		// 炎で焼かれると弱い両生類。
		// ⚠️ 倍率は 2026-08-31 に ×2 → ×5 へ上げた（ユーザー実プレイ報告「ロウソクの炎が
		//    連打できてしまうので簡単」への対処の後半）。同日にロウソクは**置いた炎**になり
		//    「1つの炎は1体に1回・同時3つまで」＝当てられる回数が機構で縛られた∴1発が軽い
		//    ままでは戦闘が異常に長くなる。`CANDLE_FIRE_DMG 3 × 5 − def 2 = 13`／hp 96 ＝
		//    **8発**（旧＝4ダメージ × 24発を連打で数秒）。
		// ⚠️ 調整は**この倍率**でやる（`CANDLE_FIRE_DMG` を上げると弱点でない雑魚まで
		//    強く焼けてロウソクが汎用武器化する）。
		weakness: { type: 'fire', multiplier: 5 },
		hitAndAway: false,                // ⚠️ **明示する**（書かないと tongue の分岐に来ない）
		attacks: [
			{ type: 'sword', range: 1.4, cooldown: 900 },   // 噛みつき（引き寄せの終点）
			{ type: 'stone', range: 7, cooldown: 2400, projectileSpeed: 1.1 }, // 毒沫
		],
		attack: { type: 'sword', range: 1.4, cooldown: 900 },
		// 舌（＝この敵の移動機構）。数の意味は enemy-ai.js の tickTongue 冒頭に書いてある。
		// ⚠️ 帯の**内端は書かない**＝噛みつきの到達距離（`attacks[]` の sword の range 1.4）が
		//    そのまま内端になる（enemy-ai.js `tongueBiteRange`）。数を2箇所に持つと
		//    「噛みつきも舌も届かない隙間」が生まれる＝実測で踏んだ欠陥（1.4〜1.8 に立つと
		//    蝦蟇は毒沫しか撃てず、引き寄せの終点もその隙間だった＝GUIDE §7-12）。
		// ⚠️ `cells` < 毒沫の range 7 ＝帯の外では毒沫が来る（何も来ない距離を作らない）。
		// ⚠️ `reelSpeed 0.22` < プレイヤーの歩幅 MOVE_STEP 0.5 ＝**歩けば必ず離れられる**
		//    （引き寄せは操作を奪わない＝払うのは時間）。
		// ⚠️ `reelSpeed × (holdMs / TICK_MS) ≥ cells − 噛みつきの到達距離` を満たすこと
		//    （0.22 × 23 tick ＝ 5.06 ≥ 5 − 1.4 ＝ 3.6）＝**帯のどこで掴まれても、歩かなければ
		//    口元まで引かれる**。満たさないと帯の外端で掴まれた人だけ時間切れで解放される
		//    ＝「掴まれたら噛まれる」の規則に穴が空く（cells 6 / holdMs 2400 では 4.4 < 4.6 で
		//    穴があった＝holdMs を伸ばして埋めた）。
		// ⚠️ `cells` は 2026-09-01 に 6 → 5（後半 7 → 6）へ**狭めた**＝ユーザー実プレイ報告
		//    「なぜか全然移動しなかった」。闘技場 `test_mechanics 31,1` は 10×12 ∴帯 6 は部屋の
		//    ほぼ全域＝**跳ねて寄る条件（帯の外）が実戦で一度も成立しない**＝置物に見えていた。
		//    帯を狭めた分だけ「帯の外＝毒沫を撃ちながら跳ねて寄る」姿が見えるようになる。
		//    ∴この数は舌の脅威範囲であると同時に**敵が動いて見えるかを決める数**（GUIDE §7-15）。
		// ⚠️ `pounce*`（のしかかり）は 2026-09-01 に追加＝ユーザー実プレイ報告「舌でひきこまれる、
		//    ろうそくで火をつける／これを繰り返すだけでノーダメージで倒せてしまう（攻撃は盾で
		//    防御できてしまう）」への対処。噛みつき（sword）も毒沫（stone）も**盾が向きだけで
		//    消せる**∴焼くために向くことがそのまま完全防御になっていた（実測＝22.9 秒・被弾 0）。
		//    のしかかりは**盾では防げない**（体当たり・締め上げ・ブレスと同じ扱い）＝答えは
		//    「下がる」だけ。相の並びと判定は enemy-ai.js「のしかかり（pounce）」の節。
		// ⚠️ `pounceRadius ≥ 噛みつきの到達距離`（1.6 ≥ 1.4）＝**引き寄せた先は必ず円の中**
		//    ＝立ち止まっていれば必ず当たる（さもなければ引き寄せの見返りが消える）。
		// ⚠️ 猶予 = `pounceWindupMs + pounceAirMs` ＝840ms ＝7 tick ＝歩いて 3.5 セル ≫
		//    `pounceRadius − 噛みつきの到達距離`（0.2）＝予告を見て下がれば必ず避かる。
		// ⚠️ `pounceAtk` は `atk` と同値（5）＝O の `stampAtk`／U の `diveAtk` と同じ作法
		//    （盾で防げない打点を通常攻撃より重くしない＝避けられる技は避けられる分だけで足る）。
		tongue: {
			castMs: 600, cells: 5, lashSpeed: 1.2,
			reelSpeed: 0.22, holdMs: 2800, retractMs: 360, cooldownMs: 2600,
			hopCells: 1.5, hopMs: 1400,
			pounceWindupMs: 480, pounceAirMs: 360, pounceRadius: 1.6,
			pounceAtk: 5, pounceRecoverMs: 480,
		},
		phases: [
			// 後半＝速く打ち・長く届き・強く引く（`reelSpeed 0.34` でもまだ歩幅より遅い＝
			// 歩いて振り切る前に holdMs が来る＝逃げ道は残るが「歩き」だけでは足りなくなる）。
			// のしかかりは**広く・速く落ちる**（強くはしない＝`pounceAtk` は前半と同じ 5）：
			// 猶予 480 + 300 ＝780ms ＝6 tick ＝歩いて 3.0 セル ＞ 半径 2.0 − 噛みつき 1.4 ＝0.6
			// ∴避けられる余地は残る（避け始めるのが遅れると当たる＝要求が上がるだけ）。
			// ⚠️ `pounceRadius 2.0 ≥ 噛みつきの到達距離 1.4` は前半と同じ不変条件。
			// ⚠️ **`pounceWindupMs` だけは後半でも縮めない**（480＝MELEE_WINDUP_MS の床のまま）。
			//    盾で防げない一撃の予告を床より短くすると「見てから動く」が成立しない＝
			//    後半の強化は円の広さ（1.6 → 2.0）と落ちる速さ（滞空 360 → 300）で払う。
			{ hpThreshold: 0.5, attackCooldownMultiplier: 0.8, tongue: {
				castMs: 480, cells: 6, lashSpeed: 1.4,
				reelSpeed: 0.34, holdMs: 2600, retractMs: 360, cooldownMs: 1800,
				hopCells: 1.5, hopMs: 1100,
				pounceWindupMs: 480, pounceAirMs: 300, pounceRadius: 2.0,
				pounceAtk: 5, pounceRecoverMs: 420,
			} },
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
	// hide: { hiddenMs, shownMs, style, emergeSound } … 隠れ↔出現を繰り返す敵の周期（enemy-ai.js が管理）。
	//   2026-08-13（5.5k k-3）に水棲専用の `submerge` から陸/空も含む汎用機構へ一般化した
	//   （style: 'water' 潜行／'burrow' 地中／'air' 滞空。CSS クラス `hide-<style>` になる）。
	//   隠れ中（e.hidden=true）＝隠れて寄ってくるが「無敵・攻撃なし＝体当たりも空振りする」。
	//   出現中（e.hidden=false）＝噛みつき（sword）で攻撃し、こちらの攻撃も通る。
	// ∴「浮上した瞬間だけ殴れる」＝海のリズム戦闘（ユーザー確定 2026-07-25）。
	//   emergeSound … 浮上した瞬間に1回だけ鳴らす SE 名（省略時は無音）。
	// ⚠️ `hide` 単体は**可視と無敵の切替だけ**で、移動分岐（enemyChase 等）はそのまま走る
	//   ＝隠れていても「まっすぐ寄ってくる」（2026-08-26 に一次資料で確認）。
	//   潜行を**回り込み**にしたいなら移動側の機構も足す＝下記 `burrowAmbush`。
	// burrowAmbush: { ambushDist } … `hide` と組にする移動機構（enemy-ai.js の enemyBurrowAmbush）。
	//   隠れているあいだだけ歩いてプレイヤーの向こう側（ambushDist マス隣接）へ回り込み、
	//   着いたら即浮上する。出現中は 1 歩も動かない＝移動と交戦が時間で分離する。
	//   N 砂嵐の蠍王が使用（Phase 8-4 (4) 0d-3）。
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
		// ⚠️ **明示する**（書かないと surge の分岐に一度も来ない＝W/A/N/J/O/U/G/I で8回踏んだ罠）。
		//    旧値は true ＝汎用の「間合いを詰めて離れる」＝2体目 W と同じ動きだった。
		hitAndAway: false,
		attacks: [
			// 巨体の体当たり。
			// ⚠️ 到達は 1.8 → **1.2**（2026-09-01・実プレイの判断（d））＝プレイヤーの
			//    `SWORD_REACH 1.2` と同値。1.8 は「自分の剣が届かない距離から殴られる」＝
			//    水際に立って斬り合うという攻略の芯が成立しなかった（＋盾は向いている方向しか
			//    守らない∴横へ退く動作が被弾に変わる）。同値なら「届く間合いは殴り合いの間合い」。
			{ type: 'sword', range: 1.2, cooldown: 1100 },
			// 潮吹き＝水弾（射水魚と同じ waterShot 型。任意角へ飛ぶ）
			{ type: 'waterShot', range: 8, cooldown: 2400, projectileSpeed: 1.3 },
		],
		attack: { type: 'sword', range: 1.2, cooldown: 1100 },
		// ⚠️ `initialModeWeights` は **hitAndAway を落としたときに消した**（読み手＝
		//    `resolveModeWeights`／`pickApproachMode` は `bossTickHitAndAway` の中だけ）
		//    ＝死んだ数値をデータに残さない（W 潮鳴りのセイレーンと同じ作法）。
		// 打ち寄せ（＝この敵の移動機構）。相の並びと判定は enemy-ai.js「打ち寄せ（surge）」の節。
		//   ・triggerRange … 乗り上げに入る端距離。**1.2 < 3.5 < 6.7** ＝体当たり（`sword` 1.2）の
		//     外・部屋の対角（闘技場 10×12 で 6.7）の内＝「射程外」が実在する（GUIDE §7-15）。
		//   ・windupMs 720 … 予告。**`MELEE_WINDUP_MS 480` の床より長い**＝6 tick ＝歩いて
		//     3.0 セル ＞ 危険域の半幅（halfW 0.5 ＋ hitRange 0.8 ＝1.3）∴横へ退けば必ず避かる。
		//     ⚠️ 600 → 720（0n）＝**本番の部屋で実測した必要量**。両生にすると主は輪の上にも
		//     立つ∴南北の通り道（rows 1〜2 の2行）に沿う掃過は危険域が2行とも覆う＝逃げ道は
		//     「軸に沿って帯の端まで走る」だけになり、最悪 3 セル歩く必要がある（＝6 tick）。
		//     600 のままだと 2.5 セルしか歩けず 17 通りが避けられない（`.scratch/sea-lord-dodge-budget.mjs`
		//     ＝`scripts/migrate-sea-lord-room-clear-pillars.mjs` の不変条件 ⑤ が番をする）。
		//   ・surgeSpeed 1.1 / surgeCells 3.0 … 掃過の速さと深さ（＝327ms で 3 セル進む）。
		//   ・hitRange 0.8 … 掃過の当たり判定（端距離）。床に描く帯はこの値で膨らませた角丸矩形。
		//   ・strandedMs 1300 … **陸で**掃過を終えたときの完全停止＝反撃の窓（10 tick ＝木の剣で4振り）。
		//   ・strandedWaterMs 400 … **水で**終えたときの窓（3 tick ＝1振り）。0n で新設＝
		//     「地形が硬直の長さを決める」＝水際で殴ると窓が 1/3 ∴岸から引き離すのが正解になる。
		//   ・crawlMs 1400 … 起点まで引き波で戻る上限（速さは `surgeCells / (crawlMs / TICK_MS)` ＝
		//     0.26 セル/tick ＝掃過の約 1/4 ∴「戻りは遅い」が数の関係として出る）。
		//   ・cooldownMs 2600 … 引き波が済んでから次の乗り上げまで。
		// ⚠️ **掃過だけは盾で防げない**（`isShieldBlockingDir` を呼ばない）＝機構の半分。
		//    `{` の攻撃2本（`sword` 1.2・`waterShot` 8）は**どちらも盾で消える**∴これが無いと
		//    正面を向いて待つだけで無傷になる（I 沼地の大蝦蟇で実測した穴・GUIDE §7-16）。
		//    `{` は**弱点を持たない**腕試しのボス∴弱点の代わりに「敵が自分で作る隙（陸で
		//    止まっている 1300ms）」が唯一の攻め口になる＝機構と攻略法が1本に繋がる。
		// ⚠️ 平時は**両生**（水でも陸でも寄る・0n）。旧「水から出ない」は捨てた＝池に閉じた主は
		//    斜めにずれた床へ軸を合わせられず、その床（実測9セル）が永久の安全地帯になった
		//    （2026-09-01 の実プレイ NG）。地形の役割は上の `strandedWaterMs` へ移した。
		// ⚠️ `surgeAtk` は `atk` と同値（5）＝O の `stampAtk`／U の `diveAtk`／I の `pounceAtk` と
		//    同じ作法（盾で防げない打点を通常攻撃より重くしない＝避けられる技は避けられる分で足る）。
		// ⚠️ 水際に立てば陸から剣が届く（水際の端距離 1.0 < `SWORD_REACH 1.2`）＝
		//    「水で待つだけで無敵」を作らない（`triggerRange` を縮めても崩れない床）。
		surge: {
			triggerRange: 3.5, windupMs: 720,
			surgeSpeed: 1.1, surgeCells: 3.0, hitRange: 0.8, surgeAtk: 5,
			strandedMs: 1300, strandedWaterMs: 400, crawlMs: 1400, cooldownMs: 2600,
		},
		phases: [
			// 半分削ると本気になる（＝合格ラインの 25% までが一番の山場）。
			// 打ち寄せは**広く・深く・窓は短く**（`windupMs` と `hitRange` と `surgeAtk` は据え置き）。
			// ⚠️ **後半でも `windupMs` は縮めない**（720 のまま）＝盾で防げない一撃の予告を短くすると
			//    「見てから横へ退く」が成立しない（I の `pounceWindupMs` と同じ規則・GUIDE §7-16）。
			//    後半の強化は**間合い（3.5 → 4.5）と深さ（3.0 → 4.0）と休みの短さ**で払う。
			// ⚠️ 反撃の窓は 1300 → 1000ms（8 tick ＝3振り）＝**窓は残す**（弱点が無い敵から
			//    攻め口を消すと削り切れなくなる＝`yieldAt 0.25` に届かない）。水の窓も
			//    400 → 300ms（＝どちらの地形でも短くなるが、陸と水の差＝攻略の芯は残る）。
			{ hpThreshold: 0.5, speedMultiplier: 1.3, attackCooldownMultiplier: 0.75, surge: {
				triggerRange: 4.5, windupMs: 720,
				surgeSpeed: 1.1, surgeCells: 4.0, hitRange: 0.8, surgeAtk: 5,
				strandedMs: 1000, strandedWaterMs: 300, crawlMs: 1400, cooldownMs: 2000,
			} },
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
