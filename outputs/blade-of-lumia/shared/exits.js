// shared/exits.js ── MAP_ENTER / 笛ワープの接続先解決（単一の真実）
//
// 元は `game/game.js buildExitRegistry()` の手書きの走査だった。実行キュー 0w
// （エディタで「どのステージへ繋がるか」を表示する）でエディタ側にも同じ解決が
// 要るようになった∴共有へ出した（[[blade-tile-sprite-single-source]] と同じ理由＝
// 手書きの対応表を作らない）。**ゲーム側の挙動は1つも変えない**＝`game/game.js` は
// この `buildExitRegistry()` を呼ぶだけに置き換える。
//
// 読み手：
//   ・`game/game.js`（実際の遷移＝`exitRegistry[destId]` を読む唯一の場所）
//   ・`editor/editor-props.js`（MAP_ENTER 欄の「→ どこに繋がるか」表示）

// destId を持つ MAP_ENTER を全部集め、id → 解決先 の対応表を作る。
// 戻り値＝{ [id]: { layer, stage, cell, row, col } }
export function buildExitRegistry(map) {
	const registry = {};
	for (const [lk, ld] of Object.entries(map?.layers ?? {})) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [cell, enter] of Object.entries(sd.mapEnters ?? {})) {
				if (enter.id) {
					const [row, col] = cell.split(',').map(Number);
					registry[enter.id] = { layer: lk, stage: sk, cell, row, col };
				}
			}
		}
	}
	return registry;
}

// 指定 MAP_ENTER（layer/stage/cell）1件の接続先を解決する。
// 戻り値＝{ id, destId, resolved } / タイルが無ければ null。
//   destId が空欄＝「着地専用（相手から来るだけ）」＝ resolved は null（destId も空）。
//   destId があって解決できない＝ resolved は null・destId は非空＝呼び出し側が
//   「繋がっていない」と読む（0x の実害はここで初めて見える）。
export function resolveExit(map, layer, stage, cell, registry = buildExitRegistry(map)) {
	const enter = map?.layers?.[layer]?.stages?.[stage]?.mapEnters?.[cell];
	if (!enter) return null;
	const destId = enter.destId ?? '';
	const resolved = destId ? (registry[destId] ?? null) : null;
	return { id: enter.id ?? '', destId, resolved };
}

// この出口ID（id）を destId に指定している側を全部列挙する（逆引き）。
// 片側だけ結線した状態（相手からは指しているが、こちらの id が無い／別物）を見せる。
export function reverseRefs(map, id) {
	const out = [];
	if (!id) return out;
	for (const [lk, ld] of Object.entries(map?.layers ?? {})) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			for (const [cell, enter] of Object.entries(sd.mapEnters ?? {})) {
				if (enter.destId === id) out.push({ layer: lk, stage: sk, cell });
			}
		}
	}
	return out;
}

// 笛ワープ（`fluteEffect: {type:'warp'}`）の接続先を解決する。
// `game/game.js playFlute` と同じ2形式＝座標直指定 {layer,stage,row,col} と destId。
// 戻り値＝{ layer, stage, row, col, destId } / fluteEffect が warp でなければ null。
//   destId 指定で解決できないときは { destId, resolved:false }。
export function resolveFluteWarp(map, layer, stage, registry = buildExitRegistry(map)) {
	const fx = map?.layers?.[layer]?.stages?.[stage]?.fluteEffect;
	if (!fx || fx.type !== 'warp') return null;
	if (fx.layer && fx.stage) {
		return { layer: fx.layer, stage: fx.stage, row: fx.row ?? 5, col: fx.col ?? 5, destId: null, resolved: true };
	}
	if (fx.destId) {
		const dest = registry[fx.destId];
		return dest ? { ...dest, destId: fx.destId, resolved: true } : { destId: fx.destId, resolved: false };
	}
	return null;
}
