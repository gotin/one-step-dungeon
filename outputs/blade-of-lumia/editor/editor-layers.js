// ── editor-layers.js ── レイヤー管理・ダンジョンメタ ──────────
import { state, layerTabsEl, dungeonMetaPanel, getCurrentLayerData } from './editor-state.js';

// ── レイヤータブ描画 ──────────────────────────────────────────
export function renderLayerTabs(renderWorldGrid, renderDungeonMeta) {
	layerTabsEl.innerHTML = '';
	for (const lk of Object.keys(state.mapData.layers)) {
		const btn = document.createElement('button');
		btn.className = 'layer-tab' + (lk === state.currentLayer ? ' active' : '');
		btn.textContent = lk;
		btn.addEventListener('click', () => {
			state.currentLayer = lk;
			state.currentCoord = null;
			renderLayerTabs(renderWorldGrid, renderDungeonMeta);
			renderDungeonMeta();
			renderWorldGrid();
		});
		// 長押しで削除（fieldは削除不可）
		if (lk !== 'field') {
			const delBtn = document.createElement('span');
			delBtn.textContent = '✕';
			delBtn.style.cssText = 'margin-left:4px;cursor:pointer;opacity:0.5;font-size:0.7rem;';
			delBtn.title = 'レイヤー削除';
			delBtn.addEventListener('click', e => {
				e.stopPropagation();
				if (!confirm(`レイヤー「${lk}」を削除しますか？（全ステージも削除されます）`)) return;
				delete state.mapData.layers[lk];
				if (state.currentLayer === lk) state.currentLayer = 'field';
				renderLayerTabs(renderWorldGrid, renderDungeonMeta);
				renderDungeonMeta();
				renderWorldGrid();
			});
			btn.appendChild(delBtn);
		}
		layerTabsEl.appendChild(btn);
	}
}

// ── ダンジョンメタ情報パネル ──────────────────────────────────
export function renderDungeonMeta() {
	dungeonMetaPanel.classList.remove('hidden');
	const ld = getCurrentLayerData();
	const isField = state.currentLayer === 'field';
	document.querySelectorAll('.dungeon-only').forEach(el => {
		el.style.display = isField ? 'none' : '';
	});
	document.getElementById('dungeon-name').value       = ld?.name      ?? '';
	document.getElementById('dungeon-bgm').value        = ld?.bgm       ?? (isField ? 'field' : 'dungeon');
	document.getElementById('dungeon-bossBgm').value    = ld?.bossBgm   ?? 'boss';
	document.getElementById('dungeon-bossStage').value  = ld?.bossStage ?? '';
}

// ── イベント登録 ──────────────────────────────────────────────
export function initLayerEvents(renderWorldGrid, renderDungeonMeta) {
	document.getElementById('btn-add-layer').addEventListener('click', () => {
		const name = prompt('ダンジョンキーを入力してください（例: dungeon_2）');
		if (!name || state.mapData.layers[name]) return;
		state.mapData.layers[name] = {
			name:    '',
			bgm:     'dungeon',
			bossBgm: 'boss',
			bossStage: '',
			triforceId: Object.keys(state.mapData.layers).filter(k => k !== 'field').length + 1,
			stages: {},
		};
		state.currentLayer = name;
		state.currentCoord = null;
		renderLayerTabs(renderWorldGrid, renderDungeonMeta);
		renderDungeonMeta();
		renderWorldGrid();
	});

	document.getElementById('btn-save-dungeon-meta').addEventListener('click', () => {
		const ld = getCurrentLayerData();
		const isField = state.currentLayer === 'field';
		if (!isField) {
			ld.name      = document.getElementById('dungeon-name').value.trim();
			ld.bossBgm   = document.getElementById('dungeon-bossBgm').value;
			ld.bossStage = document.getElementById('dungeon-bossStage').value.trim();
		}
		ld.bgm = document.getElementById('dungeon-bgm').value;
		renderLayerTabs(renderWorldGrid, renderDungeonMeta);
		alert(`${isField ? 'フィールド' : 'ダンジョン'}設定を保存しました`);
	});
}
