// play-stats.js — 遊びの記録（探索率・宝箱・撃破数・倒れた回数）の純粋関数（実行キュー66・2026-10-14）
//
// ユーザー決定（2026-10-14）＝4つとも数え、ポーズ画面と THE END の両方に出す。
//   ・探索率＝訪れた画面 ÷ 本編の全画面。既存の `stageState[k].visited`（ポーズの地図の黒塗りと同じ旗）を数える
//   ・宝箱＝開けた宝箱 ÷ 本編の全宝箱。既存の `openedChests` を数える
//   ・撃破数＝倒した雑魚の延べ数（復活した敵も数える）＝`player.kills`（combat.js killEnemy で足す）
//   ・倒れた回数＝ゲームオーバーの回数＝`player.deaths`（combat.js gameOver で足す・妖精でよみがえった分は数えない）
//
// ⚠️ 分母・分子は**マップデータの側から**数える：
//   ・テストレイヤーは数えない（shared/layers.js gameLayerEntries）
//   ・stageState のキーは `${layer}_${stage}`＝レイヤー名に `_` を含む（dungeon_1）∴キーを割らず、
//     マップの全画面からキーを組み立てて引く
//   ・宝箱は 'B' タイルの位置だけ数える＝古いセーブに残った余計な posKey で分子が分母を超えない

import { gameLayerEntries } from '../shared/layers.js';
import { TILE } from '../shared/tiles.js';

// セーブ由来の回数を 0 以上の整数にそろえる。導入前のセーブ（undefined）や壊れた値は 0。
export function sanitizeCount(v) {
	const n = Math.floor(Number(v));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// 本編の全画面・全宝箱を数え、stageState と player から進み具合を数える。
// stageState は実行時形式（openedChests が Set）でも保存形式（配列）でも読める。
export function collectPlayStats(mapData, stageState, player) {
	let stages = 0, visited = 0, chests = 0, opened = 0;
	for (const [lk, layer] of gameLayerEntries(mapData)) {
		for (const [sk, sd] of Object.entries(layer?.stages ?? {})) {
			stages++;
			const ss = stageState?.[`${lk}_${sk}`];
			if (ss?.visited) visited++;
			const openedSet = new Set(ss?.openedChests ?? []);
			(sd?.tiles ?? []).forEach((row, r) => {
				for (let c = 0; c < row.length; c++) {
					if (row[c] !== TILE.CHEST) continue;
					chests++;
					if (openedSet.has(`${r},${c}`)) opened++;
				}
			});
		}
	}
	return {
		visited, stages, opened, chests,
		kills:  sanitizeCount(player?.kills),
		deaths: sanitizeCount(player?.deaths),
	};
}

// 探索率（%）＝切り捨て。全部回るまで 100% にならない（1画面残しで 100% と出さない）。
export function explorePercent(visited, stages) {
	if (!(stages > 0)) return 0;
	return Math.floor((visited / stages) * 100);
}

// 表示用の項目（ポーズ画面と THE END で同じ文言を使う）。
export function playStatsItems(stats) {
	return [
		{ key: 'explore', label: '探索率', value: `${explorePercent(stats.visited, stats.stages)}%` },
		{ key: 'chests',  label: '宝箱',   value: `${stats.opened}/${stats.chests}` },
		{ key: 'kills',   label: '撃破数', value: `${stats.kills}` },
		{ key: 'deaths',  label: '倒れた回数', value: `${stats.deaths}` },
	];
}
