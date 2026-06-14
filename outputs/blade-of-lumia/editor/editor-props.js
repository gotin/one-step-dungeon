// ── editor-props.js ── 右パネル（ゲート・宝箱・NPC・条件等） ──
import { TILE, TILE_META } from '../shared/tiles.js';
import { getCurrentStage, findTilePositions } from './editor-state.js';

// ── 右パネル統合呼び出し ──────────────────────────────────────
export function renderSidePanel() {
	const sd = getCurrentStage();
	if (!sd) return;
	renderLinks(sd);
	renderEquipItems(sd);
	renderChests(sd);
	renderNPCs(sd);
	renderShops(sd);
	renderMapEnters(sd);
	renderConditions(sd);
	renderBreakableWalls(sd);
	renderDoorways(sd);
}

// ── ゲート/スイッチリンク ──────────────────────────────────────
function renderLinks(sd) {
	const el = document.getElementById('links-list');
	el.innerHTML = '';
	(sd.links ?? []).forEach((link, i) => {
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header">
				<span>連動 #${i+1}</span>
				<button class="btn btn-sm btn-danger">削除</button>
			</div>
			<label>ゲートID（行,列）<input type="text" value="${link.gateId ?? ''}" data-field="gateId" data-idx="${i}" placeholder="例: 3,5"></label>
			<label>スイッチID（行,列）<input type="text" value="${link.switchId ?? ''}" data-field="switchId" data-idx="${i}" placeholder="例: 5,3"></label>
		`;
		item.querySelector('.btn-danger').addEventListener('click', () => { sd.links.splice(i, 1); renderLinks(sd); });
		item.querySelectorAll('input').forEach(inp => {
			inp.addEventListener('input', () => { sd.links[parseInt(inp.dataset.idx)][inp.dataset.field] = inp.value; });
		});
		el.appendChild(item);
	});
}

export function initLinksEvents() {
	document.getElementById('btn-add-link').addEventListener('click', () => {
		const sd = getCurrentStage(); if (!sd) return;
		if (!sd.links) sd.links = [];
		sd.links.push({ gateId: '', switchId: '' });
		renderLinks(sd);
	});
}

// ── 剣・防具のフロアアイテム設定 ────────────────────────────
function renderEquipItems(sd) {
	const el = document.getElementById('equip-flooritems-list');
	if (!el) return;
	el.innerHTML = '';
	const swordItems = findTilePositions(sd, TILE.ITEM_SWORD).map(p => ({ ...p, tile: TILE.ITEM_SWORD }));
	const armorItems = findTilePositions(sd, TILE.ITEM_ARMOR).map(p => ({ ...p, tile: TILE.ITEM_ARMOR }));
	const allItems   = [...swordItems, ...armorItems];
	if (!allItems.length) { el.innerHTML = '<div class="hint">剣・防具なし</div>'; return; }
	for (const { r, c, tile } of allItems) {
		const key  = `${r},${c}`;
		const data = sd.floorItems?.[key] ?? {};
		const isSword = tile === TILE.ITEM_SWORD;
		const label   = isSword ? `⚔ 剣 (${r},${c})` : `⚚ 防具 (${r},${c})`;
		const field   = isSword ? 'atkBonus' : 'defBonus';
		const stat    = isSword ? 'ATK+' : 'DEF+';
		const defVal  = data[field] ?? (isSword ? 2 : 2);
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>${label}</span></div>
			<label>名前 <input type="text" value="${data.name ?? ''}" data-key="${key}" data-f="name" placeholder="例: 光の剣"></label>
			<label>${stat}ボーナス <input type="number" min="1" max="99" value="${defVal}" data-key="${key}" data-f="${field}"></label>
		`;
		item.querySelectorAll('input').forEach(inp => {
			inp.addEventListener('input', e => {
				if (!sd.floorItems) sd.floorItems = {};
				if (!sd.floorItems[key]) sd.floorItems[key] = {};
				const f = inp.dataset.f;
				sd.floorItems[key][f] = (f === field) ? (parseInt(inp.value, 10) || 1) : inp.value;
			});
		});
		el.appendChild(item);
	}
}

// ── 宝箱の内容 ────────────────────────────────────────────────
const CHEST_ITEM_OPTIONS = [
	{ value: 'healPotion',    label: '回復薬（小）' },
	{ value: 'bigHealPotion', label: '回復薬（大）' },
	{ value: 'boomerang',     label: 'ブーメラン' },
	{ value: 'bomb',          label: '爆弾' },
	{ value: 'bow',           label: '弓矢' },
	{ value: 'heartContainer',label: 'ハートコンテナ' },
	{ value: 'dungeonMap',    label: 'ダンジョン地図' },
	{ value: 'compass',       label: 'コンパス' },
];
const CHEST_TYPE_OPTIONS = [
	{ value: 'item',   label: 'アイテム（サブ）' },
	{ value: 'weapon', label: '武器（剣）' },
	{ value: 'armor',  label: '防具' },
	{ value: 'rupee',  label: 'ルピー' },
	{ value: 'heartContainer', label: 'ハートコンテナ' },
];

function renderChests(sd) {
	const el = document.getElementById('chest-list');
	el.innerHTML = '';
	const chests = findTilePositions(sd, TILE.CHEST);
	if (!chests.length) { el.innerHTML = '<div class="hint">宝箱なし</div>'; return; }
	for (const { r, c } of chests) {
		const key  = `${r},${c}`;
		const cont = sd.chestContents?.[key] ?? { type: 'item', item: 'healPotion', name: '', value: 0, count: 1 };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>宝箱 (${r},${c})</span></div>
			<label>種類
				<select data-key="${key}" data-f="type">
					${CHEST_TYPE_OPTIONS.map(o => `<option value="${o.value}"${cont.type===o.value?' selected':''}>${o.label}</option>`).join('')}
				</select>
			</label>
			<label class="item-id-row" style="${cont.type==='item'?'':'display:none'}">アイテム
				<select data-key="${key}" data-f="item">
					${CHEST_ITEM_OPTIONS.map(o => `<option value="${o.value}"${cont.item===o.value?' selected':''}>${o.label}</option>`).join('')}
				</select>
			</label>
			<label>個数 <input type="number" min="1" max="99" value="${cont.count??1}" data-key="${key}" data-f="count"></label>
			<label>名前 <input type="text" value="${cont.name??''}" data-key="${key}" data-f="name" placeholder="（省略可）"></label>
			<label>値（ルピー等）<input type="number" min="0" value="${cont.value??0}" data-key="${key}" data-f="value"></label>
		`;
		item.querySelector('select[data-f="type"]').addEventListener('change', e => {
			if (!sd.chestContents) sd.chestContents = {};
			if (!sd.chestContents[key]) sd.chestContents[key] = {};
			sd.chestContents[key].type = e.target.value;
			item.querySelector('.item-id-row').style.display = e.target.value === 'item' ? '' : 'none';
		});
		item.querySelectorAll('[data-f]:not([data-f="type"])').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.chestContents) sd.chestContents = {};
				if (!sd.chestContents[key]) sd.chestContents[key] = {};
				const f = inp.dataset.f;
				sd.chestContents[key][f] = (f === 'count' || f === 'value') ? parseInt(inp.value,10) : inp.value;
			});
		});
		el.appendChild(item);
	}
}

// ── NPC 会話設定（SIGN含む） ───────────────────────────────────
function renderNPCs(sd) {
	const el = document.getElementById('npc-list');
	el.innerHTML = '';
	const npcTiles = [TILE.NPC_A, TILE.NPC_B, TILE.PRINCESS, TILE.SIGN];
	const npcs = npcTiles.flatMap(t => findTilePositions(sd, t).map(p => ({ ...p, tile: t })));
	if (!npcs.length) { el.innerHTML = '<div class="hint">NPC・看板なし</div>'; return; }
	for (const { r, c, tile } of npcs) {
		const key  = `${r},${c}`;
		const data = sd.npcData?.[key] ?? { name: '', lines: [] };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>NPC (${r},${c}) ${TILE_META[tile]?.icon??''}</span></div>
			<label>キャラ名 <input type="text" value="${data.name??''}" data-key="${key}" data-f="name" placeholder="例: 村人 タロ"></label>
			<label>スプライト
				<select data-key="${key}" data-f="sprite">
					<option value="npcA" ${(data.sprite??'npcA')==='npcA'?'selected':''}>npcA（村人）</option>
					<option value="npcB" ${(data.sprite??'')==='npcB'?'selected':''}>npcB（商人）</option>
					<option value="princess" ${(data.sprite??'')==='princess'?'selected':''}>princess（姫）</option>
				</select>
			</label>
			<label>セリフ（1行=1ページ）
				<textarea data-key="${key}" data-f="lines" rows="4">${(data.lines??[]).join('\n')}</textarea>
			</label>
		`;
		item.querySelectorAll('[data-key]').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.npcData) sd.npcData = {};
				if (!sd.npcData[key]) sd.npcData[key] = { name: '', lines: [] };
				const f = inp.dataset.f;
				if (f === 'lines') {
					sd.npcData[key].lines = inp.value.split('\n').filter(l => l.trim());
				} else {
					sd.npcData[key][f] = inp.value;
				}
			});
		});
		el.appendChild(item);
	}
}

// ── ショップ設定 ───────────────────────────────────────────────
function renderShops(sd) {
	const el = document.getElementById('shop-list');
	el.innerHTML = '';
	const shops = findTilePositions(sd, TILE.NPC_SHOP);
	if (!shops.length) { el.innerHTML = '<div class="hint">ショップ NPC なし</div>'; return; }
	for (const { r, c } of shops) {
		const key  = `${r},${c}`;
		const data = sd.shopData?.[key] ?? { name: '道具屋', items: [] };
		const item = document.createElement('div');
		item.className = 'link-item';
		const itemsJson = JSON.stringify(data.items ?? [], null, 2);
		item.innerHTML = `
			<div class="link-item-header"><span>ショップ (${r},${c})</span></div>
			<label>店名 <input type="text" value="${data.name??''}" data-key="${key}" data-f="name"></label>
			<label>商品リスト（JSON）
				<textarea data-key="${key}" data-f="items" rows="6" style="font-family:monospace;font-size:0.65rem">${itemsJson}</textarea>
			</label>
		`;
		item.querySelectorAll('[data-key]').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.shopData) sd.shopData = {};
				if (!sd.shopData[key]) sd.shopData[key] = { name: '', items: [] };
				const f = inp.dataset.f;
				if (f === 'items') {
					try { sd.shopData[key].items = JSON.parse(inp.value); } catch { /* invalid JSON */ }
				} else {
					sd.shopData[key][f] = inp.value;
				}
			});
		});
		el.appendChild(item);
	}
}

// ── MAP_ENTER 出口設定 ─────────────────────────────────────────
function renderMapEnters(sd) {
	const el = document.getElementById('mapenter-list');
	el.innerHTML = '';
	const enters = findTilePositions(sd, TILE.MAP_ENTER);
	if (!enters.length) { el.innerHTML = '<div class="hint">MAP_ENTER なし</div>'; return; }
	for (const { r, c } of enters) {
		const key  = `${r},${c}`;
		const data = sd.mapEnters?.[key] ?? { id: '', destId: '' };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>出口 (${r},${c})</span></div>
			<label>出口ID（このMAP_ENTERのID） <input type="text" value="${data.id??''}" data-key="${key}" data-f="id" placeholder="半角英数字（例: town_to_dungeon）"></label>
			<label>遷移先ID（どこに繋ぐか） <input type="text" value="${data.destId??''}" data-key="${key}" data-f="destId" placeholder="接続先の出口ID（例: dungeon_to_town）"></label>
		`;
		item.querySelectorAll('[data-key]').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.mapEnters) sd.mapEnters = {};
				if (!sd.mapEnters[key]) sd.mapEnters[key] = { id: '', destId: '' };
				sd.mapEnters[key][inp.dataset.f] = inp.value;
			});
		});
		el.appendChild(item);
	}
}

// ── 表示条件（showConditions）設定 ───────────────────────────
const TRIGGER_OPTIONS = [
	{ value: 'killAll',     label: '敵全滅（killAll）' },
	{ value: 'killGroup',   label: '指定グループ全滅（killGroup）' },
	{ value: 'switchOn',    label: 'スイッチON（switchOn）' },
	{ value: 'allSwitchesOn', label: '全スイッチON（allSwitchesOn）' },
	{ value: 'wallBroken',  label: '壁破壊（wallBroken）' },
	{ value: 'hasItem',     label: 'アイテム所持（hasItem）' },
];

function renderConditions(sd) {
	const el = document.getElementById('condition-list');
	el.innerHTML = '';
	const conds = sd.showConditions ?? {};
	if (!Object.keys(conds).length) { el.innerHTML = '<div class="hint">条件なし</div>'; }
	for (const [posKey, cond] of Object.entries(conds)) {
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header">
				<span>位置 ${posKey} <span class="cond-badge">${cond.trigger}</span></span>
				<button class="btn btn-sm btn-danger">削除</button>
			</div>
			<label>対象座標（行,列）<input type="text" value="${posKey}" data-f="posKey" readonly></label>
			<label>トリガー
				<select data-f="trigger">
					${TRIGGER_OPTIONS.map(o => `<option value="${o.value}"${cond.trigger===o.value?' selected':''}>${o.label}</option>`).join('')}
				</select>
			</label>
			<label class="extra-param">追加パラメータ（JSON）
				<input type="text" value="${extraCondParam(cond)}" data-f="extra" placeholder="例: {&quot;switchId&quot;:&quot;3,4&quot;}">
			</label>
		`;
		item.querySelector('.btn-danger').addEventListener('click', () => {
			delete sd.showConditions[posKey];
			renderConditions(sd);
		});
		item.querySelector('[data-f="trigger"]').addEventListener('change', e => {
			sd.showConditions[posKey].trigger = e.target.value;
		});
		item.querySelector('[data-f="extra"]').addEventListener('input', e => {
			try {
				const extra = JSON.parse(e.target.value || '{}');
				Object.assign(sd.showConditions[posKey], extra);
			} catch { /* invalid JSON */ }
		});
		el.appendChild(item);
	}
}

function extraCondParam(cond) {
	const extra = {};
	for (const [k, v] of Object.entries(cond)) {
		if (k === 'trigger') continue;
		extra[k] = v;
	}
	return Object.keys(extra).length ? JSON.stringify(extra) : '';
}

export function initConditionEvents() {
	document.getElementById('btn-add-condition').addEventListener('click', () => {
		const sd = getCurrentStage(); if (!sd) return;
		const posKey = prompt('対象セルの座標（行,列）を入力してください（例: 3,5）');
		if (!posKey || !/^\d+,\d+$/.test(posKey)) return;
		if (!sd.showConditions) sd.showConditions = {};
		sd.showConditions[posKey] = { trigger: 'killAll' };
		renderConditions(sd);
	});
}

// ── 壊せる壁 設定 ─────────────────────────────────────────────
function renderBreakableWalls(sd) {
	const el = document.getElementById('breakwall-list');
	el.innerHTML = '';
	const walls = findTilePositions(sd, TILE.BREAKABLE_WALL);
	if (!walls.length) { el.innerHTML = '<div class="hint">壊せる壁なし</div>'; return; }
	for (const { r, c } of walls) {
		const key  = `${r},${c}`;
		const data = sd.breakableWalls?.[key] ?? { breakDef: 2 };
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>壊せる壁 (${r},${c})</span></div>
			<label>breakDef（強度）
				<select data-key="${key}">
					<option value="1" ${data.breakDef===1?'selected':''}>1（軽い）</option>
					<option value="2" ${(data.breakDef??2)===2?'selected':''}>2（中）爆弾で破壊可</option>
					<option value="3" ${data.breakDef===3?'selected':''}>3（重い）強力な爆弾のみ</option>
				</select>
			</label>
		`;
		item.querySelector('select').addEventListener('change', e => {
			if (!sd.breakableWalls) sd.breakableWalls = {};
			if (!sd.breakableWalls[key]) sd.breakableWalls[key] = {};
			sd.breakableWalls[key].breakDef = parseInt(e.target.value, 10);
		});
		el.appendChild(item);
	}
}

// ── ドアウェイ設定 ─────────────────────────────────────────────
function renderDoorways(sd) {
	const el = document.getElementById('doorway-list');
	el.innerHTML = '';
	const locked = findTilePositions(sd, TILE.DOORWAY_LOCKED);
	const boss   = findTilePositions(sd, TILE.DOORWAY_BOSS);
	const all    = [...boss.map(p => ({...p, type:'boss'})), ...locked.map(p => ({...p, type:'locked'}))];

	if (!all.length) { el.innerHTML = '<div class="hint">ドアウェイなし</div>'; }

	for (const { r, c, type } of all) {
		const key  = `${r},${c}`;
		const item = document.createElement('div');
		item.className = 'link-item';
		if (type === 'boss') {
			item.innerHTML = `
				<div class="link-item-header"><span>BOSS扉 (${r},${c}) 🔒</span></div>
				<p class="hint" style="margin:2px 0">ボス入室で自動ロック・撃破で自動解除</p>
			`;
		} else {
			const cond = (sd.showConditions ?? {})[key] ?? null;
			const condText = cond ? `${cond.trigger}` : '（条件なし）';
			item.innerHTML = `
				<div class="link-item-header">
					<span>条件扉 (${r},${c}) <span class="cond-badge">${condText}</span></span>
					<button class="btn btn-sm" data-action="set-cond">条件設定</button>
				</div>
				<p class="hint" style="margin:2px 0">表示条件パネルで条件を設定すると連動して開きます</p>
			`;
			item.querySelector('[data-action="set-cond"]').addEventListener('click', () => {
				if (!sd.showConditions) sd.showConditions = {};
				if (!sd.showConditions[key]) {
					sd.showConditions[key] = { trigger: 'killAll' };
				}
				renderConditions(sd);
				document.getElementById('condition-list').closest('.props-section')
					.scrollIntoView({ behavior: 'smooth' });
			});
		}
		el.appendChild(item);
	}
}

export function initDoorwayEvents() {
	document.getElementById('btn-add-doorway-cond').addEventListener('click', () => {
		const sd = getCurrentStage(); if (!sd) return;
		const posKey = prompt('DOORWAY_LOCKED の座標（行,列）を入力してください（例: 4,9）');
		if (!posKey || !/^\d+,\d+$/.test(posKey)) return;
		if (!sd.showConditions) sd.showConditions = {};
		sd.showConditions[posKey] = { trigger: 'killAll' };
		const sdFresh = getCurrentStage();
		renderConditions(sdFresh);
		renderDoorways(sdFresh);
	});
}
