//  Blade of Lumia  triggers.js
//  showConditions（関門＝出現条件）の trigger 名の単一ソース。
//
//  game/conditions.js evaluateConditions が評価できる trigger 名はここに並べたものだけ。
//  ここに無い名前を書いた関門は**永久に成立しない**（evaluateConditions は未知の名前を
//  黙って読み飛ばす）。2026-09-28 に dungeon_8 3,3 の宝箱 `trigger:'stonesPushed'`
//  （存在しない名前）で実害を確認した＝その部屋の宝箱は一度も出現できなかった。
//  しかもエディタの選択肢には逆に**エンジンに無い** `killGroup` が載っていて、
//  killAllAndFlute / bossYielded / stonesPlaced は選べなかった（手書きの表が3箇所で食い違い）。
//
//  読み手（ここから導く＝手書きの表を持たない）：
//   ・editor/editor-props.js の trigger 選択肢
//   ・scripts/check-dungeon-integrity.mjs の検査(10)＝未知の trigger 名を error にする
//   ・game/conditions.js の未知 trigger 警告
//  ⚠️ trigger を新設するときは evaluateConditions の分岐とここの両方に足す。

export const CONDITION_TRIGGERS = [
	{ value: 'killAll',         label: '敵全滅（killAll）' },
	{ value: 'flutePlayed',     label: '笛を吹いた（flutePlayed）' },
	{ value: 'killAllAndFlute', label: '敵全滅＋笛（killAllAndFlute）' },
	{ value: 'bushBurned',      label: 'ロウソクで茂みを燃やした（bushBurned）' },
	{ value: 'bossYielded',     label: 'ボスに認められた（bossYielded）' },
	{ value: 'switchOn',        label: 'ボタン/スイッチON（switchOn）' },
	{ value: 'allSwitchesOn',   label: '全ボタンON（allSwitchesOn）' },
	{ value: 'stonesPlaced',    label: '全ボタンに石（stonesPlaced）' },
	{ value: 'torchesLit',      label: '全かがり火点灯（torchesLit）' },
	{ value: 'wallBroken',      label: '壁破壊（wallBroken）' },
	{ value: 'hasItem',         label: 'アイテム所持（hasItem）' },
];

export const KNOWN_TRIGGERS = new Set(CONDITION_TRIGGERS.map((t) => t.value));
