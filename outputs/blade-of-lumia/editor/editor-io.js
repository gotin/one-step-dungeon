// ── editor-io.js ── 保存・読み込み・プレビュー ─────────────────
import { state, cellInfoEl, getCurrentStages, getCurrentStage } from './editor-state.js';
import { canvas } from './editor-canvas.js';
import {
	SUB_ITEM_KEYS, presetsFrom, bossesDefeatedAt, bossesDefeatedUpTo,
} from '../shared/progression.js';
import { bossVariantOptions } from '../shared/dialog-variants.js';
import { normalizeMapIconMarkers } from '../shared/map-texts.js';

// ── 保存データ構築 ────────────────────────────────────────────
export function buildSaveData() {
	// startPos：fieldレイヤーの最初のステージのPLAYERタイル位置
	let startPos = { layer: 'field', stage: '0,0', row: 1, col: 1 };
	const { TILE } = await_TILE_import();
	outer: for (const [sk, sd] of Object.entries(state.mapData.layers.field?.stages ?? {})) {
		for (let r = 0; r < sd.rows; r++) {
			for (let c = 0; c < sd.cols; c++) {
				if (sd.tiles[r][c] === TILE.PLAYER) {
					startPos = { layer: 'field', stage: sk, row: r, col: c };
					break outer;
				}
			}
		}
	}
	return {
		version: state.mapData.version ?? 1,
		startPos,
		layers: state.mapData.layers,
	};
}

// TILE は同期インポートが必要なため外部からの注入で渡す
let _TILE = null;
function await_TILE_import() { return _TILE; }
export function setTILE(t) { _TILE = t; }

// 実行キュー24：保存の直前に本文の絵文字を `{{key}}` マーカーへ直した件数（保存の報告に出す）。
let _lastIconFixes = [];
export function getLastIconFixes() { return _lastIconFixes; }

export function buildSaveDataSync(TILE) {
	// 実行キュー24（エディタの入口の層＝[[blade-bad-data-fix-five-layers]]）＝
	// **書き出す前に**本文の「絵がある物の絵文字」を `{{key}}` マーカーへ直す。
	// なぜここか＝保存・プレビューの3経路が全部この関数を通る∴1箇所で塞げる。
	// ⚠️ 直すのは絵文字だけ＝日本語の文言は変えない（変わったら `shared/map-texts.js` が例外）。
	_lastIconFixes = normalizeMapIconMarkers(state.mapData).changes;

	let startPos = { layer: 'field', stage: '0,0', row: 1, col: 1 };
	outer: for (const [sk, sd] of Object.entries(state.mapData.layers.field?.stages ?? {})) {
		for (let r = 0; r < sd.rows; r++) {
			for (let c = 0; c < sd.cols; c++) {
				if (sd.tiles[r][c] === TILE.PLAYER) {
					startPos = { layer: 'field', stage: sk, row: r, col: c };
					break outer;
				}
			}
		}
	}
	return {
		version: state.mapData.version ?? 1,
		startPos,
		layers: state.mapData.layers,
	};
}

// ── データ読み込み ────────────────────────────────────────────
export function loadMapData(data, renderLayerTabs, renderDungeonMeta, renderWorldGrid) {
	if (!data || !data.layers) { alert('データ形式が無効です'); return; }
	state.mapData     = { version: data.version ?? 1, layers: data.layers };
	state.currentLayer = 'field';
	state.currentCoord = null;
	renderLayerTabs();
	renderDungeonMeta();
	document.getElementById('world-cols').value = 3;
	document.getElementById('world-rows').value = 3;
	renderWorldGrid();
	// 進行地点プリセットの選択肢を組み立て直す＝「ボス直前」はマップの isBossRoom を見て
	// 出す／出さないが決まる∴読み込み前に作った選択肢では足りない（0d-2.8）。
	buildPreviewPresetOptions();
	// 撃破済みボスの選択肢も同じ理由で組み立て直す（ボスは実マップのボス部屋から導出する）。
	buildDefeatedOptions();
	// showView は editor.js 側で注入する
	document.dispatchEvent(new CustomEvent('editor:showWorld'));
}

// ── File System Access API で保存 ───────────────────────────
let _workDirHandle = null;

async function saveToFile(json) {
	try {
		if (!window.showDirectoryPicker) throw new Error('unsupported');
		if (!_workDirHandle) {
			_workDirHandle = await window.showDirectoryPicker({
				id: 'blade-of-lumia-work',
				mode: 'readwrite',
				startIn: 'documents',
			});
		}
		const fh = await _workDirHandle.getFileHandle('blade-of-lumia.json', { create: true });
		const wr = await fh.createWritable();
		await wr.write(json);
		await wr.close();
		return true;
	} catch (e) {
		if (e.name === 'AbortError') return false;
		return false;
	}
}

// ── ファイルの鮮度（実行キュー24・退行の入口を塞ぐ）─────────────────
// なぜ要るか＝**エディタは localStorage の控えからしか復元しない**（`tryRestoreFromStorage`）。
// ∴移行スクリプト／git pull／別のセッションでファイルだけが新しくなっても、エディタは
// 古い盤面を抱えたままで、そのまま保存すると**ファイル側の変更が黙って巻き戻る**。
// 2026-09-10 に実際にこれが起きた（`3e71a24` が `{{key}}` マーカー75件を巻き戻した）。
//
// 方針＝「ファイルが単一の真実」（ゲーム側は既にそう＝`game/game.js` は必ず json を fetch する）。
//   ① 起動時にファイルを読み、控えと違えば**帯で見せる**（勝手に上書きしない＝未保存の編集を消さない）
//   ② 保存の直前に「エディタが同期した時点のファイル」と今のファイルを比べ、
//      変わっていれば**確認してから**書く（＝巻き戻す瞬間に止める）
// ⚠️ 控えを黙って捨てない・ファイルを黙って捨てない＝どちらも人が選ぶ。
const MAP_FILE_URL = new URL('../work/blade-of-lumia.json', import.meta.url);
const FILE_SIG_KEY = 'bladeOfLumiaMapFileSig';

/** 内容の指紋（長さ＋FNV-1a）。中身を持たずに「変わったか」だけを見るため。 */
export function mapFileSig(text) {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `${text.length}-${h.toString(16)}`;
}

/** work/blade-of-lumia.json を読む（読めなければ null＝file:// や配信されていない環境）。 */
async function readMapFileText() {
	try {
		const res = await fetch(`${MAP_FILE_URL.href}?t=${Date.now()}`, { cache: 'no-store' });
		if (!res.ok) return null;
		return await res.text();
	} catch { return null; }
}

function setBanner(msg) {
	const el = document.getElementById('stale-file-banner');
	if (!el) return;
	if (!msg) { el.classList.add('hidden'); return; }
	document.getElementById('stale-file-msg').textContent = msg;
	el.classList.remove('hidden');
}

/**
 * 起動時の鮮度チェック。ファイルと控えが違えば帯を出す（読み込むかはユーザーが選ぶ）。
 * 同じなら「同期済み」として指紋を控える＝以降の保存でファイルの変化を検知できる。
 */
export async function initFileFreshnessCheck(renderLayerTabs, renderDungeonMeta, renderWorldGrid) {
	const text = await readMapFileText();
	if (!text) return;                       // 配信されていない＝比べる相手が居ない
	const sig = mapFileSig(text);
	let fileData = null;
	try { fileData = JSON.parse(text); } catch { return; }

	// 比べるのは `layers` だけ＝`startPos` はエディタ側がプレイヤータイルから作り直す（違って当然）。
	// また `version` も保存時に補われる∴盤面と本文の実体だけを見る。
	if (JSON.stringify(fileData.layers) === JSON.stringify(state.mapData.layers)) {
		localStorage.setItem(FILE_SIG_KEY, sig);
		setBanner('');
		return;
	}

	const stageCount = (d) => Object.values(d?.layers ?? {})
		.reduce((n, l) => n + Object.keys(l?.stages ?? {}).length, 0);
	setBanner(`⚠️ work/blade-of-lumia.json（${stageCount(fileData)} 画面）が、この画面の控え`
		+ `（${stageCount(state.mapData)} 画面）と違います。`
		+ `このまま保存するとファイル側の変更が失われます。`);

	document.getElementById('btn-stale-load')?.addEventListener('click', () => {
		loadMapData(fileData, renderLayerTabs, renderDungeonMeta, renderWorldGrid);
		localStorage.setItem('bladeOfLumiaMapData', text);
		localStorage.setItem(FILE_SIG_KEY, sig);
		setBanner('');
	}, { once: true });
	document.getElementById('btn-stale-ignore')?.addEventListener('click', () => setBanner(''), { once: true });
}

/**
 * 保存の直前の門＝「エディタが同期した時点のファイル」と今のファイルが違えば確認する。
 * 指紋が控えられていない（＝一度も同期していない）ときは黙って通す＝起動時の帯が担当。
 * @returns true なら書いてよい
 */
async function confirmOverwriteIfFileChanged() {
	const known = localStorage.getItem(FILE_SIG_KEY);
	if (!known) return true;
	const text = await readMapFileText();
	if (!text) return true;
	if (mapFileSig(text) === known) return true;
	return confirm('⚠️ work/blade-of-lumia.json が、このエディタで読み込んだ後に変わっています'
		+ '（移行スクリプト・git pull・別のセッションなど）。\n'
		+ 'このまま保存するとその変更が失われます。上書きしますか？');
}

// ── プレビュー状態 ────────────────────────────────────────────
let _previewPending = false;
export function getPreviewPending() { return _previewPending; }
export function setPreviewPending(v) {
	_previewPending = v;
	if (!v) {
		canvas.style.cursor  = '';
		canvas.style.outline = '';
		if (cellInfoEl) cellInfoEl.textContent = '';
	}
}

// ── 進行地点プリセット（実行キュー 0f・2026-08-25）─────────────────
// 「その進行地点の想定装備」でプレビューできるようにする道具。ボスの数値を判定するには
// ハート数・剣/盾/防具ティア・持っている道具を実際の進行どおりに揃えて戦う必要がある
// （手で URL に値を書くと取り違える＝実際に部屋番号と水没で2回外した）。
//
// ⚠️ 値は手書きしない＝`shared/progression.js` が実マップ（宝箱・床置き・欠片タイル）から導出する。
// ⚠️ 埋めるのは**ダイアログの入力欄そのもの**∴読み手（getPreviewSettings と editor.js の
//    クリック位置プレビュー）は改修不要＝ここ1箇所で両経路に効く（ps_* を足すときの
//    「2箇所に書く」ルールの例外はこれが理由）。
//
// 0d-2.8（2026-08-25）で3つめの variant「ボス直前」を足した。min は「そのダンジョンへ入った
// 瞬間」＝ダンジョン内の拾い物を含まない∴ボス戦の想定装備としては下限を外していた
// （D1 の G＝革の鎧 def1・木の盾・ハートの器がボス部屋の前に置いてある）。
// ⚠️「ボス直前」は **isBossRoom の部屋を持つレイヤーの地点だけ**に出す＝ボス部屋の無い寄道と
//    開始直後には出さない（死んだ選択肢を作らない）。∴選択肢の組み立てはマップ読み込み後にやり直す。
//    ⚠️ 「寄道はボス部屋を持たない」は 0h（2026-09-05）で崩れた＝`warlord_lair`（魔将の巣）の
//       主の間は `isBossRoom` ∴寄道でも「ボス直前」が1つ出る（判定は実マップだけを見る）。
const PROGRESS_VARIANTS = [
	{ key: 'min',  label: 'min 本編のみ' },
	{ key: 'boss', label: 'ボス直前' },
	{ key: 'max',  label: 'max 全回収' },
];

export function initPreviewPresetSelect() {
	buildDefeatedOptions();
	const sel = document.getElementById('ps-progress');
	if (!sel) return;
	buildPreviewPresetOptions();
	sel.addEventListener('change', () => applyProgressPreset(sel.value));
}

// ── 撃破済みボスの選択肢（実行キュー23・2026-09-15）─────────────────
// 会話の「進行で切り替わる版」を実ゲームで見るための口。選ぶのは「**そこまで進めた**1点」で、
// `bossesDefeatedUpTo()` が「それより前の必須ボス＋自分自身」へ展開する∴一覧は1つ選ぶ形にする
// （チェックボックスの束にすると倒す組み合わせを手で作らせることになる）。
// ラベルは会話パネルの版と同じ導出（`shared/dialog-variants.js`）＝2通りの言い方を残さない。
export function buildDefeatedOptions() {
	const sel = document.getElementById('ps-defeated');
	if (!sel) return;
	const keep = sel.value;
	for (const opt of [...sel.querySelectorAll('option[data-generated]')]) opt.remove();
	for (const b of bossVariantOptions(state.mapData)) {
		const opt = document.createElement('option');
		opt.value = b.key;
		// 寄道のボス（魔将 V・魔王 X）も会話の版を持てる（2026-09-15）∴ここで選べば
		// 「寄道の版が出る」「寄道の版が無い相手では本編の版が残る」の両方を実機で確かめられる。
		opt.textContent = `${b.label} まで撃破${b.optional ? '（寄道）' : ''}`;
		opt.dataset.generated = '1';
		sel.appendChild(opt);
	}
	sel.value = [...sel.options].some((o) => o.value === keep) ? keep : '';
}

// 選択肢を組み立て直す（先頭の「指定なし」は index.html 側の静的 option＝残す）。
// マップがまだ無い初回は「ボス直前」を出せない（ボス部屋が分からない）∴min/max だけになる。
export function buildPreviewPresetOptions() {
	const sel = document.getElementById('ps-progress');
	if (!sel) return;
	const keep = sel.value;
	for (const opt of [...sel.querySelectorAll('option[data-generated]')]) opt.remove();
	// `presetsFrom` は ORDER と同じ順・同じ長さで返す＝ここは返り値をそのまま並べればよい。
	// ラベルは実マップのレイヤー名から導出済み（0g・2026-09-05＝ORDER は名前を持たない）。
	for (const preset of presetsFrom(state.mapData)) {
		for (const v of PROGRESS_VARIANTS) {
			if (!preset[v.key]) continue;      // boss が null の地点＝選択肢を作らない
			const opt = document.createElement('option');
			opt.value = `${preset.id}:${v.key}`;
			opt.textContent = `${preset.label}（${v.label}）`;
			opt.dataset.generated = '1';
			sel.appendChild(opt);
		}
	}
	// 作り直しで消えた選択肢を選んでいた場合は「指定なし」へ戻る。
	sel.value = [...sel.options].some((o) => o.value === keep) ? keep : '';
}

function applyProgressPreset(value) {
	if (!value) return;                       // 「指定なし」＝下の値をそのまま使う
	const [cpId, variant] = value.split(':');
	const preset = presetsFrom(state.mapData).find((p) => p.id === cpId);
	if (!preset) return;
	const p = preset[variant];
	if (!p) return;

	const setVal   = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
	const setCheck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

	setVal('ps-hearts',   p.hearts);
	setVal('ps-triforce', p.triforce);
	// 撃破済みボス＝その地点へ**到達した時点**（自分のボスはまだ倒していない）。
	// 実行キュー23：これが埋まらないと「D5 まで進んだ装備なのに1体も倒していない」＝
	// 会話が序盤の版に戻る（進行で切り替わる台詞の確認にならない）。
	const defeated = bossesDefeatedAt(state.mapData, cpId);
	setVal('ps-defeated', defeated.length ? defeated[defeated.length - 1] : '');
	// ティア番号をそのまま入れる（ATK/DEF はゲーム側が装備から導出する∴ここでは触らない）。
	setVal('ps-sword',  p.sword);
	setVal('ps-shield', p.shield);
	setVal('ps-armor',  p.armor);
	setCheck('ps-weapon', p.sword >= 0);
	for (const k of SUB_ITEM_KEYS) setCheck(`ps-${k}`, p.items.includes(k));
	// 銀のブーメランはティア（別軸）／翼の羽衣は宝箱に無く祭壇で授かる＝欠片の数から導出済み。
	setCheck('ps-silverboomerang', p.boomerang >= 1);
	setCheck('ps-wingrobe', p.wingrobe);
	// `ps-map`（地図）はプリセットで動かさない＝地図は層ごとの拾い物で進行の段と1対1にならず、
	// かつ「印が見えるか」を確かめるための確認用の口∴ユーザーの指定をそのまま残す。
}

// ── プレビュー設定ダイアログ ──────────────────────────────────
function showPreviewSettingsDialog(onStart) {
	const overlay = document.getElementById('preview-settings-overlay');
	overlay.classList.remove('hidden');
	const btnStart  = document.getElementById('ps-btn-start');
	const btnCancel = document.getElementById('ps-btn-cancel');
	const newStart  = btnStart.cloneNode(true);
	const newCancel = btnCancel.cloneNode(true);
	btnStart.replaceWith(newStart);
	btnCancel.replaceWith(newCancel);

	newStart.addEventListener('click', () => {
		overlay.classList.add('hidden');
		onStart(getPreviewSettings());
	});
	newCancel.addEventListener('click', () => {
		overlay.classList.add('hidden');
		setPreviewPending(false);
	});
}

function getPreviewSettings() {
	return {
		atk:       parseInt(document.getElementById('ps-atk').value, 10) || 2,
		def:       parseInt(document.getElementById('ps-def').value, 10) || 0,
		rupees:    parseInt(document.getElementById('ps-rupees').value, 10) || 0,
		triforce:  parseInt(document.getElementById('ps-triforce').value, 10) || 0,
		// 2026-08-24: ハートの器の数。editor.js の ps 定義にも同じ行がある（両方に足す）。
		hearts:    parseInt(document.getElementById('ps-hearts').value, 10) || 3,
		// 2026-08-24: 剣ティア（-1＝指定なし）。editor.js の ps 定義にも同じ行がある。
		sword:     parseInt(document.getElementById('ps-sword').value, 10),
		weapon:    document.getElementById('ps-weapon').checked,
		// 2026-08-25: 盾/防具は**ティア番号**（-1＝なし）。旧チェックボックスではティア1が
		// 指定できず、OFF でもティア0 を装備していた。editor.js の ps 定義にも同じ行がある。
		shield:    parseInt(document.getElementById('ps-shield').value, 10),
		armor:     parseInt(document.getElementById('ps-armor').value, 10),
		bow:       document.getElementById('ps-bow').checked,
		boomerang: document.getElementById('ps-boomerang').checked,
		// Phase 9-6: 銀のブーメラン（ティア1）。editor.js の ps 定義にも必ず追加する。
		silverboomerang: document.getElementById('ps-silverboomerang').checked,
		bomb:      document.getElementById('ps-bomb').checked,
		flute:     document.getElementById('ps-flute').checked,
		candle:    document.getElementById('ps-candle').checked,
		ladder:    document.getElementById('ps-ladder').checked,
		wingrobe:  document.getElementById('ps-wingrobe').checked,
		// 2026-09-19：地図（目的地マークの見え方の確認用）。editor.js の ps 定義にも同じ行がある。
		map:       document.getElementById('ps-map')?.checked ?? true,
		cleared:   document.getElementById('ps-cleared').checked,
		// 実行キュー23: 撃破済みボス（タイル文字の配列）。選ぶのは「最も後に倒した1体」で、
		// そこまでの必須ダンジョンのボスは導出して足す。editor.js の ps 定義にも同じ行がある。
		defeated:  bossesDefeatedUpTo(state.mapData, document.getElementById('ps-defeated')?.value || ''),
	};
}

export function openPreview(stX, stY, row, col, ps, TILE) {
	const json = JSON.stringify(buildSaveDataSync(TILE), null, 2);
	localStorage.setItem('bladeOfLumiaMapData', json);
	const overlayEl = document.getElementById('preview-overlay');
	const frameEl   = document.getElementById('preview-frame');

	let url = `../game/index.html?layer=${encodeURIComponent(state.currentLayer)}&stage=${stX},${stY}&row=${row}&col=${col}&fromEditor=1&t=${Date.now()}`;
	if (ps) {
		url += `&ps_atk=${ps.atk}&ps_def=${ps.def}&ps_rupees=${ps.rupees}&ps_triforce=${ps.triforce}`;
		url += `&ps_hearts=${ps.hearts ?? 3}`;
		// 剣ティアは「指定なし（-1）」のときは付けない＝ゲーム側は従来の ps_atk を使う。
		if (Number.isInteger(ps.sword) && ps.sword >= 0) url += `&ps_sword=${ps.sword}`;
		// 盾/防具も同じ＝ティア番号をそのまま載せ、「なし（-1）」なら付けない（＝装備しない）。
		if (Number.isInteger(ps.shield) && ps.shield >= 0) url += `&ps_shield=${ps.shield}`;
		if (Number.isInteger(ps.armor)  && ps.armor  >= 0) url += `&ps_armor=${ps.armor}`;
		url += `&ps_weapon=${ps.weapon?1:0}`;
		url += `&ps_bow=${ps.bow?1:0}&ps_boomerang=${ps.boomerang?1:0}&ps_bomb=${ps.bomb?1:0}&ps_cleared=${ps.cleared?1:0}`;
		url += `&ps_ladder=${ps.ladder?1:0}&ps_wingrobe=${ps.wingrobe?1:0}&ps_flute=${ps.flute?1:0}`;
		url += `&ps_candle=${ps.candle?1:0}`;
		url += `&ps_map=${ps.map?1:0}`;
		url += `&ps_silverboomerang=${ps.silverboomerang?1:0}`;
		// 撃破済みボス＝タイル文字をカンマで並べる（空なら付けない＝1体も倒していない）。
		if (ps.defeated?.length) url += `&ps_defeated=${encodeURIComponent(ps.defeated.join(','))}`;
	}
	frameEl.src = 'about:blank';
	requestAnimationFrame(() => {
		frameEl.src = url;
		overlayEl.classList.remove('hidden');
	});
}

// ── イベント登録 ──────────────────────────────────────────────
export function initIOEvents(renderLayerTabs, renderDungeonMeta, renderWorldGrid, showView, TILE) {
	// 進行地点プリセット（ダイアログの入力欄を埋める＝2つのプレビュー経路の両方に効く）
	initPreviewPresetSelect();

	// 保存
	document.getElementById('btn-save').addEventListener('click', async () => {
		const json = JSON.stringify(buildSaveDataSync(TILE), null, 2);
		// localStorage への控えは**常に**書く＝編集を落とさない（門はファイルの書き込みだけに置く）。
		localStorage.setItem('bladeOfLumiaMapData', json);
		// 実行キュー24：直した絵文字の件数を報告に足す（黙って直すと気付けない）。
		const fixes = getLastIconFixes();
		const fixNote = fixes.length ? `\n（本文の絵文字 ${fixes.length} 件を {{アイコン}} 表記へ直しました）` : '';

		// 実行キュー24：ファイルが読み込み後に変わっていたら書く前に確認する（退行の入口②）。
		if (!await confirmOverwriteIfFileChanged()) {
			alert('保存を中止しました。この画面の控えは残っています'
				+ '（ファイルを取り込むにはページを再読み込みして帯の「ファイルを読み込む」を押してください）。');
			return;
		}

		const saved = await saveToFile(json);
		if (saved) {
			localStorage.setItem(FILE_SIG_KEY, mapFileSig(json));
			alert(`work/blade-of-lumia.json に保存しました！${fixNote}`);
			return;
		}
		const blob = new Blob([json], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'blade-of-lumia.json';
		a.click();
		alert(`保存しました！（ダウンロードされたファイルを work/ に配置してください）${fixNote}`);
	});

	// 読み込み
	document.getElementById('btn-load').addEventListener('click', () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.addEventListener('change', e => {
			const file = e.target.files[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = ev => {
				try {
					const data = JSON.parse(ev.target.result);
					loadMapData(data, renderLayerTabs, renderDungeonMeta, renderWorldGrid);
					localStorage.setItem('bladeOfLumiaMapData', ev.target.result);
				} catch {
					alert('JSON の読み込みに失敗しました');
				}
			};
			reader.readAsText(file);
		});
		input.click();
	});

	// プレビューボタン
	document.getElementById('btn-preview').addEventListener('click', () => {
		const stages = getCurrentStages();
		if (!state.currentCoord) {
			const firstKey = Object.keys(stages)[0];
			if (!firstKey) { alert('ステージを選択してください'); return; }
			const [x, y] = firstKey.split(',').map(Number);
			state.currentCoord = { x, y };
		}
		const json = JSON.stringify(buildSaveDataSync(TILE), null, 2);
		localStorage.setItem('bladeOfLumiaMapData', json);

		const viewStageEl = document.getElementById('view-stage');
		if (viewStageEl.classList.contains('hidden')) {
			showPreviewSettingsDialog(ps => {
				openPreview(state.currentCoord.x, state.currentCoord.y, 1, 1, ps, TILE);
			});
		} else {
			setPreviewPending(true);
			canvas.style.cursor  = 'crosshair';
			canvas.style.outline = '3px solid #f0c040';
			if (cellInfoEl) cellInfoEl.textContent = '▶ クリックした位置からプレビューを開始します';
		}
	});

	// プレビュー終了
	document.getElementById('btn-exit-preview').addEventListener('click', () => {
		document.getElementById('preview-overlay').classList.add('hidden');
		document.getElementById('preview-frame').src = '';
		setPreviewPending(false);
	});

	// editor:resetPreview（editor-world.js から dispatch される）
	document.addEventListener('editor:resetPreview', () => {
		setPreviewPending(false);
		document.getElementById('preview-overlay').classList.add('hidden');
		document.getElementById('preview-frame').src = '';
	});

	// editor:showWorld（loadMapData から dispatch される）
	document.addEventListener('editor:showWorld', () => showView('world'));
}

// ── localStorage から復元 ─────────────────────────────────────
export function tryRestoreFromStorage(renderLayerTabs, renderDungeonMeta, renderWorldGrid) {
	const saved = localStorage.getItem('bladeOfLumiaMapData');
	if (saved) {
		try { loadMapData(JSON.parse(saved), renderLayerTabs, renderDungeonMeta, renderWorldGrid); } catch { /* 無視 */ }
	}
}
