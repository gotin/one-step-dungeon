// ── editor-props.js ── 右パネル（ゲート・宝箱・NPC・条件等） ──
import { TILE, TILE_META, FLOOR_STACK_TILES, READABLE_SIGN_TILES } from '../shared/tiles.js';
import { ITEM_META } from '../shared/items.js';
import { getCurrentStage, findTilePositions, state, stageKey } from './editor-state.js';
import { buildExitRegistry, resolveExit, reverseRefs, resolveFluteWarp } from '../shared/exits.js';
import { mountIconEls, iconText } from '../shared/ui-icons.js';
import { MARK_KINDS, DEFAULT_MARK_KIND, isStageKey } from '../shared/marks.js';
import { variantOptions, readEntryVariants, applyEntryVariants } from '../shared/dialog-variants.js';
import { CONDITION_TRIGGERS, KNOWN_TRIGGERS } from '../shared/triggers.js';
import { SHOP_NPC_SPRITES } from '../shared/npcs.js';

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
	renderTorches(sd);
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

// ── 床置きアイテムの個別設定（剣・防具・盾のティア／矢束・爆弾の本数）────────
// Phase 7-2: 剣・防具・盾はティア番号で段階を指定する（SWORD/ARMOR/SHIELD_TIERS）。
// 実行キュー19（2026-09-21）: 矢束・爆弾は「本数」を持つ（`floorItems[key].count`）＝
// ティアと同じ枠で編集する。どのタイルが本数を持つかは `FLOOR_STACK_TILES` が単一の
// 真実＝ここに手書きの一覧を作らない。
// 10e: 見出しの絵は `data-icon`（shared/ui-icons.js が絵に差し替える）。中の
// 絵文字は絵が引けなかった時の保険として残す。
const TIER_FIELD = {
	[TILE.ITEM_SWORD]:  { f: 'swordTier',  names: ['木の剣','銅の剣','銀の剣','聖剣'],          iconKey: 'sword',  emoji: '⚔', label: '剣' },
	[TILE.ITEM_ARMOR]:  { f: 'armorTier',  names: ['布の服','青銅の鎧','伝説の鎧'],            iconKey: 'armor',  emoji: '⚚', label: '防具' },
	[TILE.ITEM_SHIELD]: { f: 'shieldTier', names: ['木の盾','鉄の盾','ミラーシールド'],          iconKey: 'shield', emoji: '🛡', label: '盾' },
};
function renderEquipItems(sd) {
	const el = document.getElementById('equip-flooritems-list');
	if (!el) return;
	el.innerHTML = '';
	const tiles    = [...Object.keys(TIER_FIELD), ...Object.keys(FLOOR_STACK_TILES)];
	const allItems = tiles.flatMap(t => findTilePositions(sd, t).map(p => ({ ...p, tile: t })));
	if (!allItems.length) { el.innerHTML = '<div class="hint">剣・防具・盾・矢束・爆弾なし</div>'; return; }
	for (const { r, c, tile } of allItems) {
		const key   = `${r},${c}`;
		const data  = sd.floorItems?.[key] ?? {};
		const stack = FLOOR_STACK_TILES[tile];
		const spec  = TIER_FIELD[tile] ?? {
			f: 'count', iconKey: stack.icon, emoji: TILE_META[tile]?.icon ?? '',
			label: TILE_META[tile]?.label ?? tile,
		};
		const field = spec.f;
		const item = document.createElement('div');
		item.className = 'link-item';
		// 本数は空欄可＝そのとき既定（ITEM_META[item].defaultStack）で拾える。
		const valueRow = stack
			? `<label>本数
					<input type="number" min="1" value="${data.count ?? ''}" data-key="${key}" data-f="count"
						placeholder="既定 ${ITEM_META[stack.item]?.defaultStack ?? 1}">
				</label>`
			: `<label>ティア
					<select data-key="${key}" data-f="${field}">
						${spec.names.map((n, i) => `<option value="${i}"${(data[field] ?? 0)===i?' selected':''}>${i}: ${n}</option>`).join('')}
					</select>
				</label>`;
		item.innerHTML = `
			<div class="link-item-header"><span><span data-icon="${spec.iconKey}" data-icon-px="16">${spec.emoji}</span> ${spec.label} (${r},${c})</span></div>
			<label>名前 <input type="text" value="${data.name ?? ''}" data-key="${key}" data-f="name" placeholder="（省略可）"></label>
			${valueRow}
		`;
		mountIconEls(item);
		item.querySelectorAll('input,select').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.floorItems) sd.floorItems = {};
				if (!sd.floorItems[key]) sd.floorItems[key] = {};
				const f = inp.dataset.f;
				if (f !== field) { sd.floorItems[key][f] = inp.value; return; }
				// 本数は空欄で「既定に戻す」＝欄を消す（0 を書いて拾えないタイルを作らない）。
				if (f === 'count' && inp.value === '') { delete sd.floorItems[key].count; return; }
				sd.floorItems[key][f] = parseInt(inp.value, 10) || 0;
			});
		});
		el.appendChild(item);
	}
}

// ── 宝箱の内容 ────────────────────────────────────────────────
// 宝箱に入れられるサブアイテムは `ITEM_META` から導出する（手書きの表を持たない
// ＝[[blade-tile-sprite-single-source]] と同じ作法）。`grantable: false`（地図・コンパス
// ＝床タイル専用）は除く＝**選べる物とエンジンが実際に渡せる物を一致させる**
// （2026-09-05：ここに載っていない `rupee` を指定した宝箱が持ち物欄にゴミを作っていた）。
const CHEST_ITEM_OPTIONS = Object.entries(ITEM_META)
	.filter(([, meta]) => meta.grantable !== false)
	.map(([value, meta]) => ({ value, label: meta.name }));
const CHEST_TYPE_OPTIONS = [
	{ value: 'item',   label: 'アイテム（サブ）' },
	{ value: 'weapon', label: '武器（剣）' },
	{ value: 'armor',  label: '防具' },
	{ value: 'shield', label: '盾' },
	{ value: 'rupee',  label: 'ルピー' },
	{ value: 'heartContainer', label: 'ハートの器' },
	{ value: 'ladder', label: 'はしご' },
];
// Phase 7-2: ティア装備（剣/防具/盾）はティア番号で段階を指定する
const CHEST_TIER_FIELD = {
	weapon: { f: 'swordTier',  names: ['木の剣','銅の剣','銀の剣','聖剣'] },
	armor:  { f: 'armorTier',  names: ['布の服','青銅の鎧','伝説の鎧'] },
	shield: { f: 'shieldTier', names: ['木の盾','鉄の盾','ミラーシールド'] },
};

function renderChests(sd) {
	const el = document.getElementById('chest-list');
	el.innerHTML = '';
	const chests = findTilePositions(sd, TILE.CHEST);
	if (!chests.length) { el.innerHTML = '<div class="hint">宝箱なし</div>'; return; }
	for (const { r, c } of chests) {
		const key  = `${r},${c}`;
		const cont = sd.chestContents?.[key] ?? { type: 'item', item: 'healPotion', name: '', value: 0, count: 1 };
		const tierSpec = CHEST_TIER_FIELD[cont.type];
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
			<label class="tier-row" style="${tierSpec?'':'display:none'}">ティア
				<select data-key="${key}" data-f="tier">
					${(tierSpec?.names ?? []).map((n, i) => {
						const cur = tierSpec ? (cont[tierSpec.f] ?? 0) : 0;
						return `<option value="${i}"${cur===i?' selected':''}>${i}: ${n}</option>`;
					}).join('')}
				</select>
			</label>
			<label>個数 <input type="number" min="1" max="99" value="${cont.count??1}" data-key="${key}" data-f="count"></label>
			<label>名前 <input type="text" value="${cont.name??''}" data-key="${key}" data-f="name" placeholder="（省略可）"></label>
			<label>値（ルピー等）<input type="number" min="0" value="${cont.value??0}" data-key="${key}" data-f="value"></label>
		`;
		// ティア選択を現在の種類に合わせて再構築する
		function refreshTierRow(type) {
			const spec = CHEST_TIER_FIELD[type];
			const row  = item.querySelector('.tier-row');
			row.style.display = spec ? '' : 'none';
			if (!spec) return;
			const sel = row.querySelector('select[data-f="tier"]');
			const cur = (sd.chestContents?.[key]?.[spec.f]) ?? 0;
			sel.innerHTML = spec.names.map((n, i) => `<option value="${i}"${cur===i?' selected':''}>${i}: ${n}</option>`).join('');
		}
		item.querySelector('select[data-f="type"]').addEventListener('change', e => {
			if (!sd.chestContents) sd.chestContents = {};
			if (!sd.chestContents[key]) sd.chestContents[key] = {};
			sd.chestContents[key].type = e.target.value;
			item.querySelector('.item-id-row').style.display = e.target.value === 'item' ? '' : 'none';
			refreshTierRow(e.target.value);
		});
		item.querySelector('select[data-f="tier"]').addEventListener('change', e => {
			if (!sd.chestContents) sd.chestContents = {};
			if (!sd.chestContents[key]) sd.chestContents[key] = {};
			const spec = CHEST_TIER_FIELD[sd.chestContents[key].type];
			if (spec) sd.chestContents[key][spec.f] = parseInt(e.target.value, 10) || 0;
		});
		item.querySelectorAll('[data-f]:not([data-f="type"]):not([data-f="tier"])').forEach(inp => {
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
// ⚠️ 看板の本文の置き場所は2つある（実測 2026-09-13）＝`sd.signData[key]` と
//    `sd.npcData[key]`。ゲーム（combat.js）は **signData を先に見る**∴signData に
//    本文がある看板を npcData 側で直しても画面は変わらない（黙って無視される）。
//    ∴このパネルは「その看板の本文が今ある場所」を読み書きする（新規は signData）。
// ⚠️ signData は文字列だけの古い形式も混じる（[[blade-sign-two-formats]]）∴読むときに
//    { name, lines } へ直してから並べる（＝編集すると新しい形式に揃う）。
function npcDataHome(sd, key, tile) {
	if (!READABLE_SIGN_TILES.has(tile)) return 'npcData';
	if (sd.signData?.[key] !== undefined) return 'signData';
	if (sd.npcData?.[key]  !== undefined) return 'npcData';
	return 'signData';
}

function readNpcEntry(sd, key, tile) {
	const raw = sd[npcDataHome(sd, key, tile)]?.[key];
	if (typeof raw === 'string') return { name: READABLE_SIGN_TILES.has(tile) ? TILE_META[tile].label : '', lines: [raw] };
	return raw ?? { name: '', lines: [] };
}

// ── 印の入力欄（基本の `mark` と、進行で切り替わる版の `markAfterBoss[…]` で同じ形）────
// 属性名だけを差し替えて使い回す＝基本は `data-f`（既存のまま）・版は `data-vf`
// （同じ `data-f` を版にも使うと、基本の欄を指す既存の探索が版の欄まで拾う）。
const escAttr = (s) => String(s ?? '')
	.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function markFieldsHtml(attr, extra, mark) {
	const kindOpts = Object.entries(MARK_KINDS).map(([k, v]) =>
		`<option value="${k}" ${(mark.kind ?? DEFAULT_MARK_KIND) === k ? 'selected' : ''}>${v.label}</option>`).join('');
	return `
		<label>画面（x,y） <input type="text" value="${escAttr(mark.stage ?? '')}"${extra} ${attr}="markStage" placeholder="例: 6,13"></label>
		<label>印の名前 <input type="text" value="${escAttr(mark.label ?? '')}"${extra} ${attr}="markLabel" placeholder="例: 草原の洞窟"></label>
		<label>種類 <select${extra} ${attr}="markKind">${kindOpts}</select></label>
		<label>層（空ならこの会話がある層） <input type="text" value="${escAttr(mark.layer ?? '')}"${extra} ${attr}="markLayer" placeholder="例: field"></label>
	`;
}

/** 入力欄から印1件を作る。画面が空＝印なし（`null`）＝取り消しの手段を1つに寄せる。 */
function readMarkFields(scope, attr) {
	const get = (f) => scope.querySelector(`[${attr}="${f}"]`).value.trim();
	const stage = get('markStage');
	if (!stage) return null;
	const mark = { stage, label: get('markLabel') || '目的地', kind: get('markKind') };
	const layer = get('markLayer');
	if (layer) mark.layer = layer;
	return mark;
}

// 印が付かない入力は赤くする＝ゲーム側で黙って捨てられる前に気づける
// （検査は tests 側にもあるが、書いた瞬間に分かるのが一番安い）。赤くする条件は3つ：
//   ①画面の形が違う（`6,13` でない） ②存在しない層 ③その層にその画面が無い。
function paintMarkFields(scope, attr) {
	const stageEl = scope.querySelector(`[${attr}="markStage"]`);
	const layerEl = scope.querySelector(`[${attr}="markLayer"]`);
	if (!stageEl || !layerEl) return;
	const sv     = stageEl.value.trim();
	const lv     = layerEl.value.trim();
	const layers = state.mapData?.layers ?? {};
	const lk     = lv || state.currentLayer;      // 空欄＝この会話がある層
	const layerOk = !lv || lv in layers;
	// 層が既に赤いときは画面まで赤くしない（原因が1つに見えるようにする）。
	const stageOk = !sv || (isStageKey(sv) && (!layerOk || sv in (layers[lk]?.stages ?? {})));
	stageEl.style.borderColor = stageOk ? '' : '#f08080';
	layerEl.style.borderColor = layerOk ? '' : '#f08080';
}

// ── 進行で切り替わる版（実行キュー23）──────────────────────────────
// 版の一覧・条件の選択肢・ボスの表示名は `shared/dialog-variants.js` が導出する（手書きしない）。
// ⚠️ **並びは勝手に整えない**＝この画面の上下がそのまま実ゲームの優先順（下ほど強い）で、
//    データのキーの順として保存される（2026-09-15＝▲▼で組み替えられるようにした）。
//    ∴ここで `sort()` を掛け直すと、ユーザーが組んだ優先順を黙って壊す。
//    2026-09-16（キュー25）＝星の欠片の版（`after`）も `linesAfterBoss` の予約キーへ畳んだ∴
//    **他の版と同じように▲▼で動かせる**（ボスの版より下に置けば「欠片を拾った後」が勝つ）。
function renderDialogVariants(host, entryOf, variants, options) {
	host.innerHTML = '';
	if (!variants.length) {
		host.innerHTML = '<div class="hint">版なし（基本のセリフだけが出る）</div>';
		return;
	}
	variants.forEach((v, i) => {
		const box = document.createElement('div');
		box.className = 'dialog-variant';
		// 同じ条件を2つの版に持たせられないようにする（同じキーへ二重に書けば片方が消える）。
		const used = new Set(variants.filter((_, j) => j !== i).map((o) => o.key));
		const opts = options.filter((o) => !used.has(o.key) || o.key === v.key);
		const known = opts.some((o) => o.key === v.key);
		// 動かせるか＝端でないかだけ（どの版も同じキーの列に住む＝位置を持てない版はもう無い）。
		const upOk   = i > 0;
		const downOk = i < variants.length - 1;
		box.innerHTML = `
			<div class="link-item-header">
				<!-- ⚠️ 見出しに説明を足さない＝サイドバーの幅（約200px）で折り返し、削除ボタンが
				     縦2行に潰れて版ごとに行の高さが不揃いになる（実測で直した）。優先の向きは
				     一覧の上のヒント1箇所で言う。 -->
				<span>版 #${i + 1}</span>
				<span class="variant-order">
					<button class="btn btn-sm" data-vf="up" title="1つ上へ（優先を下げる）" ${upOk ? '' : 'disabled'}>▲</button>
					<button class="btn btn-sm" data-vf="down" title="1つ下へ（優先を上げる）" ${downOk ? '' : 'disabled'}>▼</button>
					<button class="btn btn-sm btn-danger" data-vf="del">削除</button>
				</span>
			</div>
			<label>条件
				<select data-vf="cond">
					${known ? '' : `<option value="${escAttr(v.key)}" selected>${escAttr(v.label)}</option>`}
					${opts.map((o) => `<option value="${o.key}" ${o.key === v.key ? 'selected' : ''}>${o.label}</option>`).join('')}
				</select>
			</label>
			<label>セリフ（1行=1ページ）
				<textarea data-vf="lines" rows="3">${escAttr(v.lines.join('\n'))}</textarea>
			</label>
			${v.supportsMark
				? `<div class="hint">この版のときに教える目的地（画面を空にすると印なし）</div>${markFieldsHtml('data-vf', '', v.mark ?? {})}`
				: '<div class="hint">この条件は目的地を持てない（星の欠片の版は印を持たないと決めた＝ゲームは無視する）</div>'}
		`;
		const commit = () => applyEntryVariants(entryOf(), variants);
		box.querySelector('[data-vf="del"]').addEventListener('click', () => {
			variants.splice(i, 1);
			commit();
			renderDialogVariants(host, entryOf, variants, options);
		});
		// 並べ替え＝隣と入れ替えるだけ（並びがそのまま優先順＝保存されるキーの順）。
		const move = (to) => {
			if (to < 0 || to >= variants.length) return;
			[variants[i], variants[to]] = [variants[to], variants[i]];
			commit();
			renderDialogVariants(host, entryOf, variants, options);
		};
		box.querySelector('[data-vf="up"]').addEventListener('click', () => move(i - 1));
		box.querySelector('[data-vf="down"]').addEventListener('click', () => move(i + 1));
		box.querySelector('[data-vf="cond"]').addEventListener('change', (e) => {
			const opt = options.find((o) => o.key === e.target.value);
			// 選択肢に無いキー（不明なボス）はそのまま持ち続ける＝勝手に別のボスへ移さない。
			v.key = e.target.value;
			if (opt) { v.kind = opt.kind; v.label = opt.label; v.supportsMark = opt.supportsMark; }
			if (!v.supportsMark) v.mark = null;
			commit();
			renderDialogVariants(host, entryOf, variants, options);   // 印の欄が出る/消える
		});
		box.querySelectorAll('[data-vf]').forEach((inp) => {
			const f = inp.dataset.vf;
			if (f === 'del' || f === 'cond' || f === 'up' || f === 'down') return;
			const handler = () => {
				if (f === 'lines') v.lines = inp.value.split('\n').filter((l) => l.trim());
				else { v.mark = readMarkFields(box, 'data-vf'); paintMarkFields(box, 'data-vf'); }
				commit();
			};
			inp.addEventListener('input', handler);
			if (inp.tagName === 'SELECT') inp.addEventListener('change', handler);
		});
		paintMarkFields(box, 'data-vf');
		host.appendChild(box);
	});
}

function renderNPCs(sd) {
	const el = document.getElementById('npc-list');
	el.innerHTML = '';
	const npcTiles = [TILE.NPC_A, TILE.NPC_B, TILE.PRINCESS, ...READABLE_SIGN_TILES];
	const npcs = npcTiles.flatMap(t => findTilePositions(sd, t).map(p => ({ ...p, tile: t })));
	if (!npcs.length) { el.innerHTML = '<div class="hint">NPC・看板なし</div>'; return; }
	for (const { r, c, tile } of npcs) {
		const key  = `${r},${c}`;
		const home = npcDataHome(sd, key, tile);
		const data = readNpcEntry(sd, key, tile);
		const mark = data.mark ?? {};
		// キュー23: 進行で切り替わる版（`linesAfterBoss` / `markAfterBoss` / `linesAfter`）も
		// この下の「進行で切り替わる版」で編集する（旧実装は「持っている」ことを告げるだけで
		// 編集する道が無く、17番の帯作業で直したい1行のために移行スクリプトを書く羽目になっていた）。
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header"><span>NPC (${r},${c}) ${TILE_META[tile]?.icon??''}</span><span class="hint">${home}</span></div>
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
			<div class="hint">教える目的地（話を聞き終えると地図に印が付く。画面を空にすると印なし）</div>
			${markFieldsHtml('data-f', ` data-key="${key}"`, mark)}
			<div class="hint">進行で切り替わる版（▲▼で並べ替え＝条件が両方合うときは<b>下にある版が勝つ</b>）</div>
			${data.linesAfter !== undefined
				? '<div class="hint" style="color:#f08080">⚠️ 旧形式の <code>linesAfter</code> が残っている＝この本文はゲームに出ない。'
					+ '<code>node scripts/migrate-dialog-after-key.mjs</code> を実行して「星の欠片…」の版へ移す。</div>'
				: ''}
			<div class="dialog-variant-list"></div>
			<button class="btn btn-sm btn-add-variant">＋版を追加</button>
		`;
		// 保存先の実体を用意する（文字列形式の看板は、いま画面に出している形へ置き換える）。
		const entry = () => {
			if (!sd[home]) sd[home] = {};
			const cur = sd[home][key];
			// 無い／文字列形式のときだけ、いま画面に出している形（{name, lines}）で作り直す。
			if (!cur || typeof cur === 'string') sd[home][key] = { name: data.name ?? '', lines: data.lines ?? [] };
			return sd[home][key];
		};
		const writeMark = () => {
			const e = entry();
			const m = readMarkFields(item, 'data-f');
			// 画面が空＝印なし（欄を消せば取り消せる＝入力の取り消し手段を1つにする）。
			if (!m) delete e.mark; else e.mark = m;
		};
		paintMarkFields(item, 'data-f');
		item.querySelectorAll('[data-key]').forEach(inp => {
			const handler = () => {
				const f = inp.dataset.f;
				if (f.startsWith('mark')) { writeMark(); paintMarkFields(item, 'data-f'); return; }
				const e = entry();
				if (f === 'lines') e.lines = inp.value.split('\n').filter(l => l.trim());
				else e[f] = inp.value;
			};
			inp.addEventListener('input', handler);
			// select は input を出さないブラウザもある∴change も拾う。
			if (inp.tagName === 'SELECT') inp.addEventListener('change', handler);
		});
		// 進行で切り替わる版（キュー23）。読むのは実データ・書くのは `applyEntryVariants`
		// ＝空の版（`{}` / `[""]`）を作らない・親キーが空になったら消す。
		const vOptions  = variantOptions(state.mapData);
		const vList     = readEntryVariants(data, vOptions);
		const vHost     = item.querySelector('.dialog-variant-list');
		renderDialogVariants(vHost, entry, vList, vOptions);
		item.querySelector('.btn-add-variant').addEventListener('click', () => {
			// 空いている条件のうち選択肢の一番上を既定にする（あとは▲▼で好きな位置へ動かす）。
			// ⚠️ 足す位置は**末尾**＝押した場所に出る（並びを整え直すと、組んだ優先順が壊れる）。
			const used = new Set(vList.map((v) => v.key));
			const opt  = vOptions.find((o) => !used.has(o.key));
			if (!opt) return;                       // 全条件が埋まっている
			vList.push({ ...opt, lines: [], mark: null });
			renderDialogVariants(vHost, entry, vList, vOptions);
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
		// 見た目の差し替え（shopData.sprite）。候補は shared/npcs.js SHOP_NPC_SPRITES から導く＝手書きしない。
		// 表に無い名前が入っていたら「（不明）」として残す＝黙って既定に戻さない。
		const spriteOpts = [['', '既定（商人の絵）'], ...Object.entries(SHOP_NPC_SPRITES).map(([k, v]) => [k, v.label])];
		if (data.sprite && !SHOP_NPC_SPRITES[data.sprite]) spriteOpts.push([data.sprite, `（不明：${data.sprite}＝既定で描く）`]);
		const spriteSel = spriteOpts.map(([k, lb]) => `<option value="${k}"${(data.sprite ?? '') === k ? ' selected' : ''}>${lb}</option>`).join('');
		item.innerHTML = `
			<div class="link-item-header"><span>ショップ (${r},${c})</span></div>
			<label>店名 <input type="text" value="${data.name??''}" data-key="${key}" data-f="name"></label>
			<label>見た目 <select data-key="${key}" data-f="sprite">${spriteSel}</select></label>
			<label>商品リスト（JSON）
				<textarea data-key="${key}" data-f="items" rows="6" style="font-family:monospace;font-size:0.65rem">${itemsJson}</textarea>
			</label>
		`;
		item.querySelectorAll('[data-key]').forEach(inp => {
			inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
				if (!sd.shopData) sd.shopData = {};
				if (!sd.shopData[key]) sd.shopData[key] = { name: '', items: [] };
				const f = inp.dataset.f;
				if (f === 'items') {
					try { sd.shopData[key].items = JSON.parse(inp.value); } catch { /* invalid JSON */ }
				} else if (f === 'sprite') {
					// 既定＝キーごと消す（空文字を残さない）。盤面はアニメーションループ（400ms ごとの
					// renderStageCanvas）が描き直す＝ここで個別に描かなくても選んだ絵がすぐ出る。
					if (inp.value) sd.shopData[key].sprite = inp.value;
					else delete sd.shopData[key].sprite;
				} else {
					sd.shopData[key][f] = inp.value;
				}
			});
		});
		el.appendChild(item);
	}
}

// ── MAP_ENTER 出口設定（2026-09-05 実行キュー 0w＝「どこに繋がるか」を解決して表示）──
// レイヤー表示名は実マップの `layers[x].name` から導出する（手書きしない＝shared/progression.js
// labelOf と同じ理由）。辺遷移（同レイヤーの隣画面）はここに出さない＝世界グリッドが既に見せている。
function layerDisplayName(lk) {
	return state.mapData?.layers?.[lk]?.name ?? lk;
}
function describeDest(dest) {
	if (!dest) return null;
	return `${layerDisplayName(dest.layer)} ${dest.stage} (${dest.cell})`;
}
function renderResolvedLine(el, layer, stage, key, registry) {
	const r = resolveExit(state.mapData, layer, stage, key, registry);
	if (!r || !r.destId) {
		el.textContent = '着地専用（相手から来るだけ・destId 未指定）';
		el.className = 'hint mapenter-resolved mapenter-resolved-neutral';
		return;
	}
	if (r.resolved) {
		el.textContent = `→ ${describeDest(r.resolved)}`;
		el.className = 'hint mapenter-resolved mapenter-resolved-ok';
	} else {
		el.textContent = `❌ 繋がっていない（destId "${r.destId}" を持つ MAP_ENTER が世界にない）`;
		el.className = 'hint mapenter-resolved mapenter-resolved-bad';
	}
}
function renderReverseLine(el, id, registry) {
	if (!id) { el.textContent = ''; return; }
	const refs = reverseRefs(state.mapData, id).map(
		(ref) => `${layerDisplayName(ref.layer)} ${ref.stage} (${ref.cell})`
	);
	el.textContent = refs.length
		? `← このIDを destId に指す側：${refs.join(' / ')}`
		: `← このIDを destId に指す側：なし`;
	el.className = 'hint mapenter-reverse';
}

function renderMapEnters(sd) {
	const el = document.getElementById('mapenter-list');
	el.innerHTML = '';

	const layer = state.currentLayer;
	const stage = state.currentCoord ? stageKey(state.currentCoord.x, state.currentCoord.y) : null;
	const registry = buildExitRegistry(state.mapData);

	// 笛ワープ（fluteEffect: {type:'warp'}）＝MAP_ENTER とは別経路の接続先も同じ欄に出す。
	const flute = layer && stage ? resolveFluteWarp(state.mapData, layer, stage, registry) : null;
	if (flute) {
		const fluteEl = document.createElement('div');
		fluteEl.className = 'hint mapenter-resolved ' + (flute.resolved ? 'mapenter-resolved-ok' : 'mapenter-resolved-bad');
		// 10e: `{{flute}}` は笛の絵に差し替わる（絵が引けなければ `{{flute}}` のまま出る）。
		iconText(fluteEl, flute.resolved
			? `{{flute}} 笛ワープ → ${layerDisplayName(flute.layer)} ${flute.stage} (${flute.row},${flute.col})`
			: `{{flute}} 笛ワープ → ❌ 繋がっていない（destId "${flute.destId}"）`, 16);
		el.appendChild(fluteEl);
	}

	// > タイルの座標 + mapEnters 既存エントリ（タイルなし含む）をマージ
	const tileKeys = new Set(findTilePositions(sd, TILE.MAP_ENTER).map(({r,c}) => `${r},${c}`));
	const dataKeys = new Set(Object.keys(sd.mapEnters ?? {}));
	const allKeys  = [...new Set([...tileKeys, ...dataKeys])].sort();

	if (!allKeys.length && !flute) { el.innerHTML = '<div class="hint">MAP_ENTER なし</div>'; }

	for (const key of allKeys) {
		const hasTile = tileKeys.has(key);
		const data    = sd.mapEnters?.[key] ?? { id: '', destId: '' };
		const item    = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<div class="link-item-header">
				<span>出口 (${key})${hasTile ? '' : ' <span class="cond-badge">タイルなし</span>'}</span>
				<button class="btn btn-sm btn-danger" data-del="${key}">削除</button>
			</div>
			<label>出口ID（このMAP_ENTERのID）
				<input type="text" value="${data.id??''}" data-key="${key}" data-f="id" placeholder="例: town_to_dungeon">
			</label>
			<label>遷移先ID（どこに繋ぐか）
				<input type="text" value="${data.destId??''}" data-key="${key}" data-f="destId" placeholder="接続先の出口ID">
			</label>
			<label>着地 row（任意）
				<input type="number" value="${data.row??''}" data-key="${key}" data-f="row" placeholder="省略可">
			</label>
			<label>着地 col（任意）
				<input type="number" value="${data.col??''}" data-key="${key}" data-f="col" placeholder="省略可">
			</label>
			<div class="mapenter-resolved" data-resolved="${key}"></div>
			<div class="mapenter-reverse" data-reverse="${key}"></div>
		`;
		if (layer && stage) {
			renderResolvedLine(item.querySelector(`[data-resolved="${key}"]`), layer, stage, key, registry);
			renderReverseLine(item.querySelector(`[data-reverse="${key}"]`), data.id, registry);
		}
		item.querySelectorAll('[data-key]').forEach(inp => {
			inp.addEventListener('input', () => {
				if (!sd.mapEnters) sd.mapEnters = {};
				if (!sd.mapEnters[key]) sd.mapEnters[key] = { id: '', destId: '' };
				const val = inp.value.trim();
				if (inp.dataset.f === 'row' || inp.dataset.f === 'col') {
					if (val === '') delete sd.mapEnters[key][inp.dataset.f];
					else sd.mapEnters[key][inp.dataset.f] = Number(val);
				} else {
					sd.mapEnters[key][inp.dataset.f] = val;
				}
				// 解決結果は入力ごとにその場で引き直す（IDの表全体は再構築しない＝入力欄のフォーカスを保つ）。
				const freshRegistry = buildExitRegistry(state.mapData);
				if (layer && stage) {
					renderResolvedLine(item.querySelector(`[data-resolved="${key}"]`), layer, stage, key, freshRegistry);
					renderReverseLine(item.querySelector(`[data-reverse="${key}"]`), sd.mapEnters[key].id, freshRegistry);
				}
			});
		});
		item.querySelector('[data-del]').addEventListener('click', () => {
			if (sd.mapEnters) delete sd.mapEnters[key];
			renderMapEnters(sd);
		});
		el.appendChild(item);
	}

	// 「＋ 追加」ボタン
	const addBtn = document.createElement('button');
	addBtn.className = 'btn btn-sm';
	addBtn.textContent = '＋ 追加（タイルなし）';
	addBtn.addEventListener('click', () => {
		const pos = prompt('追加する座標を入力（例: 4,4）');
		if (!pos || !/^\d+,\d+$/.test(pos.trim())) return;
		const k = pos.trim();
		if (!sd.mapEnters) sd.mapEnters = {};
		if (!sd.mapEnters[k]) sd.mapEnters[k] = { id: '', destId: '' };
		renderMapEnters(sd);
	});
	el.appendChild(addBtn);
}

// ── 表示条件（showConditions）設定 ───────────────────────────
// 選択肢は shared/triggers.js（エンジンが評価できる名前の単一ソース）から導く。
// ⚠️ 2026-09-28 まで手書きの表で、エンジンに無い `killGroup` が選べ、逆に
//    killAllAndFlute / bossYielded / stonesPlaced は選べなかった。
const TRIGGER_OPTIONS = CONDITION_TRIGGERS;

// データの trigger が未知の名前だと、<select> は先頭（killAll）を選んだように見える＝
// 壊れた関門がエディタ上では正常に見える。未知の名前は「⚠️ 未知」として選択肢に足して見せる。
function triggerOptionsFor(cond) {
	if (!cond.trigger || KNOWN_TRIGGERS.has(cond.trigger)) return TRIGGER_OPTIONS;
	return [{ value: cond.trigger, label: `⚠️ 未知（${cond.trigger}）＝永久に成立しない` }, ...TRIGGER_OPTIONS];
}

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
					${triggerOptionsFor(cond).map(o => `<option value="${o.value}"${cond.trigger===o.value?' selected':''}>${o.label}</option>`).join('')}
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

// ── かがり火 初期点灯設定 ──────────────────────────────────────
function renderTorches(sd) {
	const el = document.getElementById('torch-list');
	if (!el) return;
	el.innerHTML = '';
	const torches = findTilePositions(sd, TILE.TORCH);
	if (!torches.length) { el.innerHTML = '<div class="hint">かがり火なし</div>'; return; }
	const initLit = new Set(sd.initLitTorches ?? []);
	for (const { r, c } of torches) {
		const key  = `${r},${c}`;
		const item = document.createElement('div');
		item.className = 'link-item';
		item.innerHTML = `
			<label style="display:flex;align-items:center;gap:6px;">
				<input type="checkbox" data-key="${key}" ${initLit.has(key) ? 'checked' : ''}>
				(${r},${c}) 初期点灯
			</label>
		`;
		item.querySelector('input').addEventListener('change', e => {
			if (!sd.initLitTorches) sd.initLitTorches = [];
			if (e.target.checked) {
				if (!sd.initLitTorches.includes(key)) sd.initLitTorches.push(key);
			} else {
				sd.initLitTorches = sd.initLitTorches.filter(k => k !== key);
			}
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
