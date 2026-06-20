// shared/triforce.js ── 星の欠片カウント（ゲーム/エディタ共通ヘルパー）
// boss.js calcTotalTriforces と editor-world.js updateShardSummary の
// 「欠片の数え方」を単一定義に集約する（blade-tile-sprite-single-source 方針）。

import { TILE } from './tiles.js';
import { ENEMY_META } from './enemies.js';

/**
 * mapData 全レイヤーを横断して「集めるべき星の欠片の総数」を返す。
 * 対象：
 *   - ITEM_TRIFORCE_PIECE('Q') タイル：直接拾える欠片
 *   - DARK_LORD('X') タイル：撃破で欠片を落とす魔王
 *   - ENEMY_META[tile].dropsTriforce === true なタイル：大型ボス等
 * ZARNEL('Z') は isFinalBoss で欠片を落とさないため含めない。
 */
export function countTriforces(mapData) {
	if (!mapData) return 0;
	let total = 0;
	for (const ld of Object.values(mapData.layers ?? {})) {
		for (const sd of Object.values(ld.stages ?? {})) {
			for (const row of sd.tiles ?? []) {
				for (const tile of row) {
					if (tile === TILE.ITEM_TRIFORCE_PIECE) { total++; continue; }
					if (tile === TILE.DARK_LORD) { total++; continue; }
					if (ENEMY_META[tile]?.dropsTriforce) total++;
				}
			}
		}
	}
	return total;
}

/**
 * mapData 全レイヤーを横断して欠片の所在リストを返す。
 * 各エントリ: { kind: 'piece'|'boss', tile, label, layer, stage, r, c }
 */
export function listTriforceEntries(mapData) {
	if (!mapData) return [];
	const entries = [];
	for (const [lk, ld] of Object.entries(mapData.layers ?? {})) {
		for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
			const tiles = sd.tiles ?? [];
			for (let r = 0; r < tiles.length; r++) {
				const row = tiles[r] ?? [];
				for (let c = 0; c < row.length; c++) {
					const tile = row[c];
					if (tile === TILE.ITEM_TRIFORCE_PIECE) {
						entries.push({ kind: 'piece', tile, label: '星の欠片', layer: lk, stage: sk, r, c });
					} else if (tile === TILE.DARK_LORD) {
						entries.push({ kind: 'boss', tile, label: '魔王', layer: lk, stage: sk, r, c });
					} else if (ENEMY_META[tile]?.dropsTriforce) {
						const name = ENEMY_META[tile]?.name ?? `ボス(${tile})`;
						entries.push({ kind: 'boss', tile, label: `${name}（ボス撃破）`, layer: lk, stage: sk, r, c });
					}
				}
			}
		}
	}
	return entries;
}
