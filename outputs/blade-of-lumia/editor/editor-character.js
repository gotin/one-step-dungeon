// ── editor-character.js ── キャラクター定義エディタ ───────────
import { TILE } from '../shared/tiles.js';
import { ENEMY_META, ENEMY_SPEED_SLOW, ENEMY_SPEED_NORMAL, ENEMY_SPEED_FAST } from '../shared/enemies.js';

// ── 内部状態（このモジュールに閉じ込める） ─────────────────────
let currentEnemyKey = null;  // 編集中の敵キー（TILE.PATROL など）
let editBuffer = {};         // 編集中のデータ（ENEMY_META のコピー）

// ── DOM参照 ───────────────────────────────────────────────────
const enemyListEl = document.getElementById('char-enemy-list');
const editorPanelEl = document.getElementById('char-editor-panel');
const exportTextarea = document.getElementById('char-export-code');
const btnCopyCode = document.getElementById('btn-char-copy-code');
const btnAddEnemy = document.getElementById('btn-add-enemy');

// ── 敵リストを描画 ─────────────────────────────────────────────
function renderEnemyList() {
	if (!enemyListEl) return;
	enemyListEl.innerHTML = '';

	Object.entries(ENEMY_META).forEach(([key, meta]) => {
		const item = document.createElement('div');
		item.className = 'char-enemy-item' + (currentEnemyKey === key ? ' active' : '');
		item.innerHTML = `
			<div class="char-enemy-name">${meta.name}</div>
			<div class="char-enemy-stats">HP:${meta.hp} ATK:${meta.atk} DEF:${meta.def}</div>
		`;
		item.addEventListener('click', () => {
			currentEnemyKey = key;
			editBuffer = structuredClone(meta);  // 深いコピー
			renderEnemyList();
			renderEditor();
		});
		enemyListEl.appendChild(item);
	});
}

// ── エディタパネルを描画 ───────────────────────────────────────
function renderEditor() {
	if (!editorPanelEl || !currentEnemyKey) {
		if (editorPanelEl) editorPanelEl.innerHTML = '<p class="hint">敵を選択してください</p>';
		return;
	}

	const meta = editBuffer;
	const attackType = meta.attack?.type || 'charge';
	const hasAttacks = Array.isArray(meta.attacks);

	editorPanelEl.innerHTML = `
		<div class="char-form">
			<h3 class="panel-title">基本情報</h3>
			<div class="form-row">
				<label>名前 <input id="char-name" type="text" value="${meta.name}" class="input-med"></label>
				<label>タイルキー <input id="char-key" type="text" value="${currentEnemyKey}" class="input-small" readonly></label>
			</div>
			<div class="form-row">
				<label>HP <input id="char-hp" type="number" min="1" value="${meta.hp}" class="input-small"></label>
				<label>ATK <input id="char-atk" type="number" min="0" value="${meta.atk}" class="input-small"></label>
				<label>DEF <input id="char-def" type="number" min="0" value="${meta.def}" class="input-small"></label>
				<label>EXP <input id="char-exp" type="number" min="0" value="${meta.exp}" class="input-small"></label>
			</div>

			<h3 class="panel-title">スプライト・パレット</h3>
			<div class="form-row">
				<label>スプライト名 <input id="char-sprite" type="text" value="${meta.sprite}" class="input-med"></label>
				<label>パレット名 <input id="char-pal" type="text" value="${meta.pal}" class="input-med"></label>
			</div>

			<h3 class="panel-title">移動・行動</h3>
			<div class="form-row">
				<label>速度
					<select id="char-speed" class="input-med">
						<option value="${ENEMY_SPEED_SLOW}" ${meta.speed === ENEMY_SPEED_SLOW ? 'selected' : ''}>低速 (0.25)</option>
						<option value="${ENEMY_SPEED_NORMAL}" ${meta.speed === ENEMY_SPEED_NORMAL ? 'selected' : ''}>通常 (0.5)</option>
						<option value="${ENEMY_SPEED_FAST}" ${meta.speed === ENEMY_SPEED_FAST ? 'selected' : ''}>高速 (1.0)</option>
						<option value="custom">カスタム</option>
					</select>
				</label>
				<label id="char-speed-custom-wrap" class="${meta.speed !== ENEMY_SPEED_SLOW && meta.speed !== ENEMY_SPEED_NORMAL && meta.speed !== ENEMY_SPEED_FAST ? '' : 'hidden'}">
					カスタム速度 <input id="char-speed-custom" type="number" step="0.05" value="${meta.speed}" class="input-small">
				</label>
			</div>
			<div class="form-row">
				<label class="checkbox-label">
					<input id="char-is-boss" type="checkbox" ${meta.isBoss ? 'checked' : ''}> ボス敵
				</label>
				<label class="checkbox-label">
					<input id="char-hit-and-away" type="checkbox" ${meta.hitAndAway ? 'checked' : ''}> ヒット&アウェイ行動
				</label>
				<label class="checkbox-label">
					<input id="char-aura" type="checkbox" ${meta.aura ? 'checked' : ''}> オーラエフェクト
				</label>
			</div>

			<h3 class="panel-title">攻撃設定</h3>
			<div class="form-row">
				<label class="checkbox-label">
					<input id="char-use-attacks-array" type="checkbox" ${hasAttacks ? 'checked' : ''}> 複数攻撃パターン（attacks配列）を使用
				</label>
			</div>

			<!-- 単一攻撃（attack） -->
			<div id="char-single-attack" class="${hasAttacks ? 'hidden' : ''}">
				<div class="form-row">
					<label>攻撃タイプ
						<select id="char-attack-type" class="input-med">
							<option value="charge" ${attackType === 'charge' ? 'selected' : ''}>突進 (charge)</option>
							<option value="sword" ${attackType === 'sword' ? 'selected' : ''}>近接剣 (sword)</option>
							<option value="spear" ${attackType === 'spear' ? 'selected' : ''}>槍投げ (spear)</option>
							<option value="stone" ${attackType === 'stone' ? 'selected' : ''}>石投げ (stone)</option>
						</select>
					</label>
				</div>
				<div id="char-single-attack-params" class="${attackType === 'charge' ? 'hidden' : ''}">
					<div class="form-row">
						<label>射程 <input id="char-attack-range" type="number" step="0.5" value="${meta.attack?.range || 1.5}" class="input-small"></label>
						<label>クールダウン(ms) <input id="char-attack-cooldown" type="number" step="100" value="${meta.attack?.cooldown || 1000}" class="input-small"></label>
						<label id="char-attack-speed-wrap" class="${attackType === 'spear' || attackType === 'stone' ? '' : 'hidden'}">
							飛翔速度 <input id="char-attack-speed" type="number" step="0.1" value="${meta.attack?.projectileSpeed || 1.0}" class="input-small">
						</label>
					</div>
				</div>
			</div>

			<!-- 複数攻撃（attacks配列） -->
			<div id="char-multiple-attacks" class="${hasAttacks ? '' : 'hidden'}">
				<div id="char-attacks-list"></div>
				<button id="btn-add-attack" class="btn btn-sm">＋ 攻撃パターン追加</button>
			</div>

			<!-- フェーズ設定 -->
			<h3 class="panel-title">フェーズ（HP閾値で変化）</h3>
			<div id="char-phases-list"></div>
			<button id="btn-add-phase" class="btn btn-sm">＋ フェーズ追加</button>

			<div class="char-form-actions">
				<button id="btn-apply-changes" class="btn btn-primary">✔ 変更を適用</button>
				<button id="btn-reset-changes" class="btn">↺ リセット</button>
			</div>
		</div>
	`;

	// イベントリスナー設定
	setupEditorEvents();
	renderAttacksList();
	renderPhasesList();
}

// ── エディタ内のイベントリスナー ───────────────────────────────
function setupEditorEvents() {
	// 速度プリセット変更
	const speedSelect = document.getElementById('char-speed');
	const speedCustomWrap = document.getElementById('char-speed-custom-wrap');
	if (speedSelect) {
		speedSelect.addEventListener('change', (e) => {
			if (e.target.value === 'custom') {
				speedCustomWrap.classList.remove('hidden');
			} else {
				speedCustomWrap.classList.add('hidden');
			}
		});
	}

	// 攻撃タイプ変更
	const attackTypeSelect = document.getElementById('char-attack-type');
	if (attackTypeSelect) {
		attackTypeSelect.addEventListener('change', (e) => {
			const type = e.target.value;
			const paramsDiv = document.getElementById('char-single-attack-params');
			const speedWrap = document.getElementById('char-attack-speed-wrap');
			if (type === 'charge') {
				paramsDiv.classList.add('hidden');
			} else {
				paramsDiv.classList.remove('hidden');
				if (type === 'spear' || type === 'stone') {
					speedWrap.classList.remove('hidden');
				} else {
					speedWrap.classList.add('hidden');
				}
			}
		});
	}

	// 複数攻撃切り替え
	const useAttacksCheckbox = document.getElementById('char-use-attacks-array');
	if (useAttacksCheckbox) {
		useAttacksCheckbox.addEventListener('change', (e) => {
			const singleDiv = document.getElementById('char-single-attack');
			const multiDiv = document.getElementById('char-multiple-attacks');
			if (e.target.checked) {
				singleDiv.classList.add('hidden');
				multiDiv.classList.remove('hidden');
				if (!Array.isArray(editBuffer.attacks)) {
					editBuffer.attacks = [];
				}
			} else {
				singleDiv.classList.remove('hidden');
				multiDiv.classList.add('hidden');
			}
			renderAttacksList();
		});
	}

	// 変更適用
	const btnApply = document.getElementById('btn-apply-changes');
	if (btnApply) {
		btnApply.addEventListener('click', applyChanges);
	}

	// リセット
	const btnReset = document.getElementById('btn-reset-changes');
	if (btnReset) {
		btnReset.addEventListener('click', () => {
			editBuffer = structuredClone(ENEMY_META[currentEnemyKey]);
			renderEditor();
		});
	}

	// 攻撃パターン追加
	const btnAddAttack = document.getElementById('btn-add-attack');
	if (btnAddAttack) {
		btnAddAttack.addEventListener('click', () => {
			if (!Array.isArray(editBuffer.attacks)) editBuffer.attacks = [];
			editBuffer.attacks.push({ type: 'sword', range: 1.5, cooldown: 1000 });
			renderAttacksList();
		});
	}

	// フェーズ追加
	const btnAddPhase = document.getElementById('btn-add-phase');
	if (btnAddPhase) {
		btnAddPhase.addEventListener('click', () => {
			if (!Array.isArray(editBuffer.phases)) editBuffer.phases = [];
			editBuffer.phases.push({ hpThreshold: 0.5, speedMultiplier: 1.0 });
			renderPhasesList();
		});
	}
}

// ── 攻撃リスト描画 ─────────────────────────────────────────────
function renderAttacksList() {
	const listEl = document.getElementById('char-attacks-list');
	if (!listEl) return;
	listEl.innerHTML = '';

	if (!Array.isArray(editBuffer.attacks)) return;

	editBuffer.attacks.forEach((atk, idx) => {
		const item = document.createElement('div');
		item.className = 'char-attack-item';
		item.innerHTML = `
			<div class="form-row">
				<label>タイプ
					<select class="input-med char-attack-type-multi" data-idx="${idx}">
						<option value="charge" ${atk.type === 'charge' ? 'selected' : ''}>突進</option>
						<option value="sword" ${atk.type === 'sword' ? 'selected' : ''}>近接剣</option>
						<option value="spear" ${atk.type === 'spear' ? 'selected' : ''}>槍投げ</option>
						<option value="stone" ${atk.type === 'stone' ? 'selected' : ''}>石投げ</option>
					</select>
				</label>
				<label class="${atk.type === 'charge' ? 'hidden' : ''} char-attack-range-wrap">
					射程 <input type="number" step="0.5" value="${atk.range || 1.5}" class="input-small char-attack-range-multi" data-idx="${idx}">
				</label>
				<label class="${atk.type === 'charge' ? 'hidden' : ''} char-attack-cooldown-wrap">
					CD(ms) <input type="number" step="100" value="${atk.cooldown || 1000}" class="input-small char-attack-cooldown-multi" data-idx="${idx}">
				</label>
				<label class="${atk.type === 'spear' || atk.type === 'stone' ? '' : 'hidden'} char-attack-projspeed-wrap">
					飛翔速度 <input type="number" step="0.1" value="${atk.projectileSpeed || 1.0}" class="input-small char-attack-projspeed-multi" data-idx="${idx}">
				</label>
				<button class="btn btn-sm btn-danger char-remove-attack" data-idx="${idx}">🗑</button>
			</div>
		`;
		listEl.appendChild(item);
	});

	// 攻撃タイプ変更イベント
	listEl.querySelectorAll('.char-attack-type-multi').forEach(sel => {
		sel.addEventListener('change', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			const type = e.target.value;
			editBuffer.attacks[idx].type = type;
			renderAttacksList();
		});
	});

	// 値変更イベント
	listEl.querySelectorAll('.char-attack-range-multi').forEach(inp => {
		inp.addEventListener('input', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			editBuffer.attacks[idx].range = parseFloat(e.target.value) || 1.5;
		});
	});
	listEl.querySelectorAll('.char-attack-cooldown-multi').forEach(inp => {
		inp.addEventListener('input', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			editBuffer.attacks[idx].cooldown = parseInt(e.target.value) || 1000;
		});
	});
	listEl.querySelectorAll('.char-attack-projspeed-multi').forEach(inp => {
		inp.addEventListener('input', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			editBuffer.attacks[idx].projectileSpeed = parseFloat(e.target.value) || 1.0;
		});
	});

	// 削除ボタン
	listEl.querySelectorAll('.char-remove-attack').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			editBuffer.attacks.splice(idx, 1);
			renderAttacksList();
		});
	});
}

// ── フェーズリスト描画 ─────────────────────────────────────────
function renderPhasesList() {
	const listEl = document.getElementById('char-phases-list');
	if (!listEl) return;
	listEl.innerHTML = '';

	if (!Array.isArray(editBuffer.phases) || editBuffer.phases.length === 0) {
		listEl.innerHTML = '<p class="hint">フェーズなし（全HPで同じ挙動）</p>';
		return;
	}

	editBuffer.phases.forEach((phase, idx) => {
		const item = document.createElement('div');
		item.className = 'char-phase-item';
		item.innerHTML = `
			<div class="form-row">
				<label>HP閾値
					<input type="number" step="0.05" min="0" max="1" value="${phase.hpThreshold || 0.5}" class="input-small char-phase-threshold" data-idx="${idx}">
				</label>
				<label>速度倍率
					<input type="number" step="0.1" value="${phase.speedMultiplier || 1.0}" class="input-small char-phase-speed" data-idx="${idx}">
				</label>
				<label>攻撃CD倍率
					<input type="number" step="0.1" value="${phase.attackCooldownMultiplier || 1.0}" class="input-small char-phase-cd" data-idx="${idx}">
				</label>
				<button class="btn btn-sm btn-danger char-remove-phase" data-idx="${idx}">🗑</button>
			</div>
		`;
		listEl.appendChild(item);
	});

	// 値変更イベント
	listEl.querySelectorAll('.char-phase-threshold').forEach(inp => {
		inp.addEventListener('input', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			editBuffer.phases[idx].hpThreshold = parseFloat(e.target.value) || 0.5;
		});
	});
	listEl.querySelectorAll('.char-phase-speed').forEach(inp => {
		inp.addEventListener('input', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			editBuffer.phases[idx].speedMultiplier = parseFloat(e.target.value) || 1.0;
		});
	});
	listEl.querySelectorAll('.char-phase-cd').forEach(inp => {
		inp.addEventListener('input', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			editBuffer.phases[idx].attackCooldownMultiplier = parseFloat(e.target.value) || 1.0;
		});
	});

	// 削除ボタン
	listEl.querySelectorAll('.char-remove-phase').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			editBuffer.phases.splice(idx, 1);
			renderPhasesList();
		});
	});
}

// ── 変更を適用 ─────────────────────────────────────────────────
function applyChanges() {
	// フォームから値を読み取る
	const name = document.getElementById('char-name').value;
	const hp = parseInt(document.getElementById('char-hp').value) || 1;
	const atk = parseInt(document.getElementById('char-atk').value) || 0;
	const def = parseInt(document.getElementById('char-def').value) || 0;
	const exp = parseInt(document.getElementById('char-exp').value) || 0;
	const sprite = document.getElementById('char-sprite').value;
	const pal = document.getElementById('char-pal').value;

	const speedSelect = document.getElementById('char-speed').value;
	let speed = parseFloat(speedSelect);
	if (speedSelect === 'custom') {
		speed = parseFloat(document.getElementById('char-speed-custom').value) || 0.5;
	}

	const isBoss = document.getElementById('char-is-boss').checked;
	const hitAndAway = document.getElementById('char-hit-and-away').checked;
	const aura = document.getElementById('char-aura').checked;

	const useAttacksArray = document.getElementById('char-use-attacks-array').checked;

	// 編集バッファを更新
	editBuffer.name = name;
	editBuffer.hp = hp;
	editBuffer.atk = atk;
	editBuffer.def = def;
	editBuffer.exp = exp;
	editBuffer.sprite = sprite;
	editBuffer.pal = pal;
	editBuffer.speed = speed;
	editBuffer.isBoss = isBoss;
	editBuffer.hitAndAway = hitAndAway;
	editBuffer.aura = aura;

	// 攻撃設定
	if (!useAttacksArray) {
		const attackType = document.getElementById('char-attack-type').value;
		const attack = { type: attackType };
		if (attackType !== 'charge') {
			attack.range = parseFloat(document.getElementById('char-attack-range').value) || 1.5;
			attack.cooldown = parseInt(document.getElementById('char-attack-cooldown').value) || 1000;
			if (attackType === 'spear' || attackType === 'stone') {
				attack.projectileSpeed = parseFloat(document.getElementById('char-attack-speed').value) || 1.0;
			}
		}
		editBuffer.attack = attack;
		delete editBuffer.attacks;
	} else {
		// attacks配列は既にrenderAttacksList内で編集済み
		// attack（フォールバック）を最初の要素に設定
		if (editBuffer.attacks && editBuffer.attacks.length > 0) {
			editBuffer.attack = { ...editBuffer.attacks[0] };
		}
	}

	// ENEMY_METAに反映（注意：ページリロードで消える）
	ENEMY_META[currentEnemyKey] = structuredClone(editBuffer);

	// コードをエクスポート領域に表示
	generateExportCode();

	alert('変更を適用しました。エクスポートコードをコピーして enemies.js を更新してください。');
}

// ── エクスポートコード生成 ─────────────────────────────────────
function generateExportCode() {
	if (!exportTextarea) return;

	let code = `// ── 生成されたキャラクター定義コード ────────────────────────\n`;
	code += `// 以下を enemies.js の ENEMY_META に貼り付けてください\n\n`;

	Object.entries(ENEMY_META).forEach(([key, meta]) => {
		code += `\t[TILE.${getTileConstantName(key)}]: ${JSON.stringify(meta, null, 2).replace(/\n/g, '\n\t')},\n`;
	});

	exportTextarea.value = code;
}

// ── TILEキーから定数名を取得 ───────────────────────────────────
function getTileConstantName(tileKey) {
	// TILE定数の逆引き
	for (const [name, value] of Object.entries(TILE)) {
		if (value === tileKey) return name;
	}
	return tileKey;
}

// ── クリップボードコピー ───────────────────────────────────────
function copyCodeToClipboard() {
	if (!exportTextarea) return;
	exportTextarea.select();
	document.execCommand('copy');
	alert('コードをクリップボードにコピーしました');
}

// ── 初期化（editor.jsから呼ばれる） ───────────────────────────
export function initCharacterEditor() {
	renderEnemyList();

	if (btnCopyCode) {
		btnCopyCode.addEventListener('click', copyCodeToClipboard);
	}

	if (btnAddEnemy) {
		btnAddEnemy.addEventListener('click', () => {
			alert('新規敵の追加は将来実装予定です。既存の敵を編集してください。');
		});
	}
}

// ── ビューを離れる時の処理 ─────────────────────────────────────
export function onLeaveCharacterEditor() {
	// 特に何もしない（将来的に未保存警告等を実装可能）
}
