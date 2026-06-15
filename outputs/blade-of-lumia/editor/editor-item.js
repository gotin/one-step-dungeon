// ── editor-item.js ── アイテム定義エディタ ───────────────────────
import { ITEM_META, EQUIP_META } from '../shared/items.js';

// ── 内部状態 ───────────────────────────────────────────────────
let currentSection = null;  // 'item' | 'equip'
let currentKey = null;
let itemBuffer = {};
let equipBuffer = {};

// ── ユーティリティ ──────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function valueToJs(v) {
	if (v === Infinity) return 'Infinity';
	if (v === null) return 'null';
	if (typeof v === 'boolean') return String(v);
	if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
	return String(v);
}

function usesOpt(uses) {
	if (uses === Infinity) return 'infinity';
	if (uses === null) return 'null';
	return 'number';
}

// ── アイテムリストを描画 ─────────────────────────────────────────
function renderItemList() {
	const listEl = el('item-list');
	if (!listEl) return;
	listEl.innerHTML = '';

	const subTitle = document.createElement('div');
	subTitle.className = 'item-section-title';
	subTitle.textContent = '📦 サブアイテム';
	listEl.appendChild(subTitle);

	Object.entries(itemBuffer).forEach(([key, meta]) => {
		const div = document.createElement('div');
		div.className = 'item-list-item' + (currentSection === 'item' && currentKey === key ? ' active' : '');
		div.innerHTML = `
			<span class="item-icon">${meta.icon || ''}</span>
			<div>
				<div class="item-name">${meta.name}</div>
				<div class="item-type-tag">${meta.type}</div>
			</div>
		`;
		div.addEventListener('click', () => {
			currentSection = 'item';
			currentKey = key;
			renderItemList();
			renderEditor();
		});
		listEl.appendChild(div);
	});

	const equipTitle = document.createElement('div');
	equipTitle.className = 'item-section-title';
	equipTitle.style.marginTop = '12px';
	equipTitle.textContent = '⚔ 装備';
	listEl.appendChild(equipTitle);

	Object.entries(equipBuffer).forEach(([key, meta]) => {
		const div = document.createElement('div');
		div.className = 'item-list-item' + (currentSection === 'equip' && currentKey === key ? ' active' : '');
		div.innerHTML = `
			<span class="item-icon">${meta.icon || ''}</span>
			<div>
				<div class="item-name">${meta.name}</div>
				<div class="item-type-tag">${meta.slot}</div>
			</div>
		`;
		div.addEventListener('click', () => {
			currentSection = 'equip';
			currentKey = key;
			renderItemList();
			renderEditor();
		});
		listEl.appendChild(div);
	});
}

// ── エディタパネルを描画 ─────────────────────────────────────────
function renderEditor() {
	const panelEl = el('item-editor-panel');
	if (!panelEl) return;
	if (!currentKey) {
		panelEl.innerHTML = '<p class="hint">アイテムを選択してください</p>';
		return;
	}
	if (currentSection === 'item') renderItemForm(panelEl);
	else renderEquipForm(panelEl);
}

// ── ITEM_META 用フォーム ─────────────────────────────────────────
function renderTypeFields(meta) {
	const parts = [];
	if (meta.type === 'throwable' || meta.type === 'placeable') {
		parts.push(`<div class="form-row">
			<label>breakPower <input id="item-breakPower" type="number" min="0" value="${meta.breakPower ?? 0}" class="input-small"></label>
		</div>`);
	}
	if (meta.type === 'throwable') {
		parts.push(`<div class="form-row">
			<label class="checkbox-label">
				<input id="item-piercing" type="checkbox" ${meta.piercing ? 'checked' : ''}> 貫通（piercing）
			</label>
		</div>`);
	}
	if (meta.type === 'placeable') {
		parts.push(`<div class="form-row">
			<label>爆風半径（aoeRadius）<input id="item-aoeRadius" type="number" min="0" step="0.5" value="${meta.aoeRadius ?? 0}" class="input-small"></label>
			<label>ダメージ（damage） <input id="item-damage" type="number" min="0" value="${meta.damage ?? 0}" class="input-small"></label>
		</div>`);
	}
	if (meta.type === 'consumable') {
		parts.push(`<div class="form-row">
			<label>回復量（healAmount） <input id="item-healAmount" type="number" min="0" value="${meta.healAmount ?? 0}" class="input-small"></label>
		</div>`);
	}
	return parts.join('') || '<p class="hint">このタイプに追加フィールドはありません</p>';
}

function renderItemForm(panelEl) {
	const meta = itemBuffer[currentKey];
	const types = ['throwable', 'placeable', 'consumable', 'passive'];
	const opt = usesOpt(meta.uses);

	panelEl.innerHTML = `
		<div class="char-form">
			<h3 class="panel-title">基本情報</h3>
			<div class="form-row">
				<label>名前 <input id="item-name" type="text" value="${meta.name}" class="input-med"></label>
				<label>アイコン <input id="item-icon" type="text" value="${meta.icon || ''}" class="input-small"></label>
				<label>キー <input id="item-key" type="text" value="${currentKey}" class="input-small" readonly></label>
			</div>
			<div class="form-row">
				<label>スプライト名 <input id="item-sprite" type="text" value="${meta.sprite || ''}" class="input-med"></label>
				<label>パレット名 <input id="item-pal" type="text" value="${meta.pal || ''}" class="input-med" placeholder="（省略可）"></label>
			</div>
			<div class="form-row">
				<label>タイプ
					<select id="item-type" class="input-med">
						${types.map(t => `<option value="${t}" ${meta.type === t ? 'selected' : ''}>${t}</option>`).join('')}
					</select>
				</label>
			</div>

			<h3 class="panel-title">使用回数</h3>
			<div class="form-row">
				<label>uses
					<select id="item-uses-type" class="input-med">
						<option value="infinity" ${opt === 'infinity' ? 'selected' : ''}>Infinity（無制限）</option>
						<option value="null" ${opt === 'null' ? 'selected' : ''}>null（スタック管理）</option>
						<option value="number" ${opt === 'number' ? 'selected' : ''}>数値</option>
					</select>
				</label>
				<label id="item-uses-num-wrap" class="${opt === 'number' ? '' : 'hidden'}">
					回数 <input id="item-uses-num" type="number" min="1" value="${typeof meta.uses === 'number' ? meta.uses : 1}" class="input-small">
				</label>
			</div>

			<h3 class="panel-title">タイプ別設定</h3>
			<div id="item-type-fields">${renderTypeFields(meta)}</div>

			<div class="char-form-actions">
				<button id="btn-item-apply" class="btn btn-primary">✔ 変更を適用</button>
			</div>
		</div>
	`;

	el('item-uses-type')?.addEventListener('change', () => {
		const wrap = el('item-uses-num-wrap');
		if (wrap) wrap.classList.toggle('hidden', el('item-uses-type').value !== 'number');
	});

	el('item-type')?.addEventListener('change', () => {
		const fieldsEl = el('item-type-fields');
		if (fieldsEl) fieldsEl.innerHTML = renderTypeFields({ ...meta, type: el('item-type').value });
	});

	el('btn-item-apply')?.addEventListener('click', applyItemChanges);
}

// ── EQUIP_META 用フォーム ─────────────────────────────────────────
function renderSlotFields(meta) {
	if (meta.slot === 'weapon') {
		return `<div class="form-row">
			<label>ATKボーナス（atkBonus） <input id="equip-atkBonus" type="number" min="0" value="${meta.atkBonus ?? 0}" class="input-small"></label>
		</div>`;
	}
	if (meta.slot === 'shield') {
		return `<div class="form-row">
			<label>ダメージ軽減（damageReduction）<br><small>0.0〜1.0（例: 0.5 = 50%軽減）</small>
				<input id="equip-damageReduction" type="number" min="0" max="1" step="0.05" value="${meta.damageReduction ?? 0}" class="input-small">
			</label>
		</div>`;
	}
	if (meta.slot === 'armor') {
		return `<div class="form-row">
			<label>DEFボーナス（defBonus） <input id="equip-defBonus" type="number" min="0" value="${meta.defBonus ?? 0}" class="input-small"></label>
		</div>`;
	}
	return '<p class="hint">スロットを選択してください</p>';
}

function renderEquipForm(panelEl) {
	const meta = equipBuffer[currentKey];
	const slots = ['weapon', 'shield', 'armor'];

	panelEl.innerHTML = `
		<div class="char-form">
			<h3 class="panel-title">基本情報</h3>
			<div class="form-row">
				<label>名前 <input id="equip-name" type="text" value="${meta.name}" class="input-med"></label>
				<label>アイコン <input id="equip-icon" type="text" value="${meta.icon || ''}" class="input-small"></label>
				<label>キー <input id="equip-key" type="text" value="${currentKey}" class="input-small" readonly></label>
			</div>
			<div class="form-row">
				<label>スロット
					<select id="equip-slot" class="input-med">
						${slots.map(s => `<option value="${s}" ${meta.slot === s ? 'selected' : ''}>${s}</option>`).join('')}
					</select>
				</label>
			</div>

			<h3 class="panel-title">スロット別ステータス</h3>
			<div id="equip-slot-fields">${renderSlotFields(meta)}</div>

			<div class="char-form-actions">
				<button id="btn-equip-apply" class="btn btn-primary">✔ 変更を適用</button>
			</div>
		</div>
	`;

	el('equip-slot')?.addEventListener('change', () => {
		const fieldsEl = el('equip-slot-fields');
		if (fieldsEl) fieldsEl.innerHTML = renderSlotFields({ ...meta, slot: el('equip-slot').value });
	});

	el('btn-equip-apply')?.addEventListener('click', applyEquipChanges);
}

// ── 変更を適用 ──────────────────────────────────────────────────
function applyItemChanges() {
	const key = currentKey;
	const meta = { ...itemBuffer[key] };

	meta.name   = el('item-name')?.value.trim() || meta.name;
	meta.icon   = el('item-icon')?.value || meta.icon;
	meta.sprite = el('item-sprite')?.value.trim() || meta.sprite;
	const palVal = el('item-pal')?.value.trim();
	if (palVal) meta.pal = palVal;
	else delete meta.pal;
	meta.type = el('item-type')?.value || meta.type;

	const opt = el('item-uses-type')?.value;
	if (opt === 'infinity') meta.uses = Infinity;
	else if (opt === 'null') meta.uses = null;
	else meta.uses = parseInt(el('item-uses-num')?.value, 10) || 1;

	if (meta.type === 'throwable' || meta.type === 'placeable') {
		meta.breakPower = parseFloat(el('item-breakPower')?.value) || 0;
	} else { delete meta.breakPower; }

	if (meta.type === 'throwable') {
		const piercing = el('item-piercing')?.checked;
		if (piercing) meta.piercing = true;
		else delete meta.piercing;
	} else { delete meta.piercing; }

	if (meta.type === 'placeable') {
		meta.aoeRadius = parseFloat(el('item-aoeRadius')?.value) || 0;
		meta.damage    = parseFloat(el('item-damage')?.value) || 0;
	} else { delete meta.aoeRadius; delete meta.damage; }

	if (meta.type === 'consumable') {
		meta.healAmount = parseFloat(el('item-healAmount')?.value) || 0;
	} else { delete meta.healAmount; }

	itemBuffer[key] = meta;
	generateExportCode();
	renderItemList();
	alert('適用しました。エクスポートコードをコピーして items.js に貼り付けてください。');
}

function applyEquipChanges() {
	const key = currentKey;
	const meta = { ...equipBuffer[key] };

	meta.name = el('equip-name')?.value.trim() || meta.name;
	meta.icon = el('equip-icon')?.value || meta.icon;
	meta.slot = el('equip-slot')?.value || meta.slot;

	delete meta.atkBonus; delete meta.damageReduction; delete meta.defBonus;
	if (meta.slot === 'weapon') {
		meta.atkBonus = parseFloat(el('equip-atkBonus')?.value) || 0;
	} else if (meta.slot === 'shield') {
		meta.damageReduction = parseFloat(el('equip-damageReduction')?.value) || 0;
	} else if (meta.slot === 'armor') {
		meta.defBonus = parseFloat(el('equip-defBonus')?.value) || 0;
	}

	equipBuffer[key] = meta;
	generateExportCode();
	renderItemList();
	alert('適用しました。エクスポートコードをコピーして items.js に貼り付けてください。');
}

// ── エクスポートコード生成 ────────────────────────────────────────
function metaEntryToJs(key, meta, fieldOrder) {
	const done = new Set();
	const lines = [];
	for (const f of fieldOrder) {
		if (f in meta) { lines.push(`\t\t${f}: ${valueToJs(meta[f])}`); done.add(f); }
	}
	for (const [k, v] of Object.entries(meta)) {
		if (!done.has(k)) lines.push(`\t\t${k}: ${valueToJs(v)}`);
	}
	return `\t${key}: {\n${lines.join(',\n')},\n\t}`;
}

const ITEM_FIELD_ORDER = ['name', 'icon', 'sprite', 'pal', 'type', 'breakPower', 'aoeRadius', 'damage', 'piercing', 'healAmount', 'uses'];
const EQUIP_FIELD_ORDER = ['name', 'icon', 'slot', 'atkBonus', 'damageReduction', 'defBonus'];

function generateExportCode() {
	const textareaEl = el('item-export-code');
	if (!textareaEl || !currentKey) { if (textareaEl) textareaEl.value = ''; return; }

	let code = '';
	if (currentSection === 'item') {
		const entry = metaEntryToJs(currentKey, itemBuffer[currentKey], ITEM_FIELD_ORDER);
		const all = Object.entries(itemBuffer).map(([k, v]) => metaEntryToJs(k, v, ITEM_FIELD_ORDER)).join(',\n');
		code = `// ── 選択中のエントリ（ITEM_META に貼り付け） ──\n${entry},\n\n// ── Export All: ITEM_META ──\nexport const ITEM_META = {\n${all},\n};`;
	} else {
		const entry = metaEntryToJs(currentKey, equipBuffer[currentKey], EQUIP_FIELD_ORDER);
		const all = Object.entries(equipBuffer).map(([k, v]) => metaEntryToJs(k, v, EQUIP_FIELD_ORDER)).join(',\n');
		code = `// ── 選択中のエントリ（EQUIP_META に貼り付け） ──\n${entry},\n\n// ── Export All: EQUIP_META ──\nexport const EQUIP_META = {\n${all},\n};`;
	}
	textareaEl.value = code;
}

// ── 初期化・エクスポート ──────────────────────────────────────────
export function initItemEditor() {
	itemBuffer = structuredClone(ITEM_META);
	equipBuffer = structuredClone(EQUIP_META);

	el('btn-item-copy-code')?.addEventListener('click', () => {
		const code = el('item-export-code')?.value;
		if (code) navigator.clipboard.writeText(code).catch(() => {});
	});

	renderItemList();
	renderEditor();
}

export function onLeaveItemEditor() {}
