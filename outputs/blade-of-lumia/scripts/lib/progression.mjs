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
  // 最終ダンジョン。ここに来る時点で全アイテム所持（PLAN 9-1 の進行順）。
  // ⚠️ このエントリが無いと unlocked が空集合になり「はしご必須の水で出口封鎖」を
  //    誤検出する。そもそも dark_tower は 2026-08-05 まで検査対象から漏れていた。
  dark_tower: new Set(['boomerang', 'bow', 'candle', 'ladder', 'bomb', 'flute']),
};
