// 実行キュー49 — field の敵の「強さの段」と、敵の少ない画面を埋める配置表（単一の真実）
//
// 背景（2026-10-12 実測）：field 320 画面のうち敵0体が 214（67%）。9-6 の地域作り込みで
// 敵が 506 → 154 体に減ったのが原因で、敵の密度を目標として決めた記録は無かった。
// ユーザー判定＝①敵0体の画面は約2割まで減らす ②強さは「村からの距離」を基本に地域の順番も効かせる。
//
// ここに置くもの：
//   ・tierOf(stageKey)        … 画面の強さの段（1〜5）
//   ・TIER_THREAT_CAP          … 段ごとの1画面の脅威度（THREAT_OF の合計）の上限
//   ・TIER_ENEMIES             … 段ごとに置ける敵（下の段の敵は上の段でも置ける）
//   ・FIELD_ENEMY_FILL         … 1画面ずつ設計して足した敵の配置表（migrate と検査の両方が読む）
//   ・KEEP_EMPTY               … 敵を置かずに空けておく画面とその理由
// 検査＝`tests/field-enemy-tiers.spec.js`。

import { regionOf } from './field-quality.mjs';

export const VILLAGE = Object.freeze({ x: 7, y: 14 });
// 村からこの距離（マンハッタン・画面単位）以内は段1 で固定＝村を出てすぐ強い敵に会わない。
export const SAFE_RADIUS = 3;

// 距離の段＝村からのマンハッタン距離 1-3→1・4-7→2・8-11→3・12-15→4・16+→5。
export function distanceTier(d) {
	return d <= 3 ? 1 : d <= 7 ? 2 : d <= 11 ? 3 : d <= 15 ? 4 : 5;
}

// 地域の段＝その地域のダンジョンの進行順（D1→D2→D3→D4→D6→D5→D8→D7）から。
// ラベルは field-quality.mjs regionOf() のもの（G0〜G7＝草原のサブ地域・O＝深洋・P＝沼）。
export const REGION_TIER = Object.freeze({
	V: 1, G0: 1, G1: 1, G2: 1, G3: 1, G4: 1, G7: 1,
	G5: 2, G6: 2, D: 2, W: 2,
	L: 3, F: 3,
	S: 4, M: 4, P: 4, O: 4,
	K: 5, T: 5,
});

/** 画面の強さの段（1〜5）＝ceil((距離の段＋地域の段)÷2)。村から SAFE_RADIUS 以内は段1。 */
export function tierOf(stageKey) {
	const [x, y] = stageKey.split(',').map(Number);
	const d = Math.abs(x - VILLAGE.x) + Math.abs(y - VILLAGE.y);
	if (d <= SAFE_RADIUS) return 1;
	const r = REGION_TIER[regionOf(stageKey)];
	if (r === undefined) throw new Error(`REGION_TIER に無い地域: ${regionOf(stageKey)} (${stageKey})`);
	return Math.ceil((distanceTier(d) + r) / 2);
}

// 1画面の脅威度の上限。今ある画面に合わせた値（村の隣 9,14 の E+F+C＝46 は実プレイで問題なし）。
export const TIER_THREAT_CAP = Object.freeze({ 1: 50, 2: 70, 3: 90, 4: 120, 5: 150 });

// 上限を超えていても動かさない既存の画面（理由つき）。
export const CAP_EXEMPT = Object.freeze({
	'2,16': '段2・84。D2 入口 2,15 の南の精鋭の画面（キュー49 より前から在る・実プレイ済み）。',
	'12,19': '海の主 { ＝field の中ボス（0m・0n で作り込み済み）。',
});

// 段ごとに新しく置けるようになる敵。段 n では TIER_NEW[1..n] の和集合を置ける。
// η の弱点＝弓（D3 以降）・δ の弱点＝爆弾（D6 以降）は段で遅らせる。
export const TIER_NEW = Object.freeze({
	1: ['ξ', '&', 'ψ', 'E', 'Γ', 'α', 'β', 'F', 'C'],
	2: ['θ', '/', 'σ', 'π', '<'],
	3: ['η', 'φ'],
	4: ['ζ', 'λ', 'ω', 'δ'],
	5: ['μ'],
});

export function enemiesAllowedAt(tier) {
	const out = new Set();
	for (let t = 1; t <= tier; t++) for (const ch of TIER_NEW[t]) out.add(ch);
	return out;
}

// 敵を置かずに空けておく画面（役目のある画面）。キュー49 で敵0体のまま残すのはここに載せた画面だけ。
export const KEEP_EMPTY = Object.freeze({
	'7,14': '村（開始地点）。',
	'7,15': '石押しの謎の画面（石 * でボタン S を押して門 T の宝箱を開ける）。',
	'6,14': '転移の石碑 ‡ の画面＝休む場所。',
});

// 1画面ずつ設計して足した敵。place＝{ 敵タイル: ['r,c', ...] }。
// 置くセルは床（'.'）。水棲の敵（move:'water'）は bgTiles が水のセル。
// 画面の端から2マス以内には置かない（入ってきた瞬間に当たらない）。
export const FIELD_ENEMY_FILL = [
	// ── ① G0 村まわり（段1）────────────────────────────────
	{
		stage: '7,12', place: { 'ξ': ['3,6', '3,9', '7,5'] },
		why: '村の北の草原。岩のくぼみの宝箱は茂み (4,7) を切らないと開かない＝切っている間にコウモリがまとわりつく。脅威度 6。',
	},
	{
		stage: '6,12', place: { 'E': ['4,7', '5,3'] },
		why: '村の北口の木立ち。村と北を行き来するたびに通る画面＝リスポーンしても邪魔にならない軽い巡回2体。脅威度 8。',
	},
	{
		stage: '5,13', place: { '&': ['3,5', '5,6'], 'E': ['7,3'] },
		why: '村の北西の池。橋 (4,6) を渡る間に池の魚群が跳ねる＝水の中の敵の初出は村のそばで弱く。南の草地に巡回1体。脅威度 8。',
	},
	{
		stage: '5,14', place: { 'β': ['5,9'] },
		why: '村の西の小川。小川の東の草地に跳躍蜘蛛1体＝開けた所で溜めを見て横へ外す。β は D1 の前に field で会っておく相手（D1 3,1 は柵で見切りを教える部屋）。脅威度 16。',
	},
	{
		stage: '5,15', place: { 'E': ['2,3', '6,7'] },
		why: '村の南西の池のほとり。池の北と南を巡回2体。脅威度 8。',
	},
	{
		stage: '6,15', place: { 'C': ['2,8'] },
		why: '村の南の木立ち。真ん中の木の塊のまわりをチェイサーが追ってくる＝木を挟んで回り込む。脅威度 24。',
	},
	{
		stage: '8,14', place: { 'α': ['4,4'] },
		why: '村の東。看板の先の岩のくぼみの宝箱へ向かう道に地中蟲1体（茂み (4,6) を切る前に出てくる）。脅威度 9。',
	},
];
