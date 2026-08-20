// 進行順に沿った「その地点で持っている道具」の表（単一の真実）。
//
// 元は `scripts/check-dungeon-integrity.mjs` の内部定数だったが、Phase 5.5m（敵配置）で
// 「弱点持ちの敵はその弱点道具が入手済みの地点以降にしか置かない」の判定にも同じ表が必要に
// なった∴共有ライブラリへ出した（二重管理すると片方だけ腐る）。
//
// 読み手＝`scripts/check-dungeon-integrity.mjs`（道具で封鎖される出口の検出）／
//         `scripts/migrate-place-new-enemies.mjs`・`tests/enemy-placement.spec.js`（弱点の関門）
//
// 意味＝そのダンジョンレイヤーへ**入る時点**で持っている道具（＝前のダンジョンまでの報酬）。
// 進行順は PLAN 9-1 の D1→D2→D3→D4→D6→D5→D8→D7→（祭壇）→dark_tower。cave_1 は寄道。
export const UNLOCKED_AT = {
  dungeon_1: new Set([]),
  dungeon_2: new Set(['boomerang']),
  dungeon_3: new Set(['boomerang', 'bow']),
  dungeon_4: new Set(['boomerang', 'bow', 'candle']),
  dungeon_5: new Set(['boomerang', 'bow', 'candle', 'bomb', 'ladder']),
  dungeon_6: new Set(['boomerang', 'bow', 'candle', 'bomb']),
  dungeon_8: new Set(['boomerang', 'bow', 'candle', 'bomb', 'ladder']),
  cave_1:    new Set(['boomerang', 'bow', 'candle', 'ladder', 'bomb']),
  dungeon_7: new Set(['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']),
  // 空中の遺跡（寄道）。入口は field 9,9 の笛 reveal（showConditions flutePlayed）＝
  // **笛を持っていなければ入口そのものが現れない**∴ここに立てる時点で全道具を持っている。
  // このエントリが無いと `?? new Set()` で空集合になり、tests/enemy-placement.spec.js ④
  // が「弱点（矢）持ちの術士 η が弓の無い地点に居る」と誤検出する。
  secret_grotto: new Set(['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']),
  // 樹海の岩室（寄道）。入口は field 0,0 の爆弾で割る岩 '!'＝**爆弾（D6 の報酬）以降**にしか
  // 入れない。進行順（D1→D2→D3→D4→D6→D5…）ではしごは D5 の報酬∴ここでは持っていない前提で
  // 設計してある（はしご・笛を要る形にしない）。ロウソクは D4 の報酬＝所持済み。
  forest_cave: new Set(['boomerang', 'bow', 'candle', 'bomb']),
  // 最終ダンジョン。ここに来る時点で全アイテム所持（PLAN 9-1 の進行順）。
  // ⚠️ このエントリが無いと unlocked が空集合になり「はしご必須の水で出口封鎖」を
  //    誤検出する。そもそも dark_tower は 2026-08-05 まで検査対象から漏れていた。
  dark_tower: new Set(['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']),
};
