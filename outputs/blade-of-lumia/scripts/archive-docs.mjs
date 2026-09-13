#!/usr/bin/env node
// PLAN.md / PROGRESS.md の「古い記述」をアーカイブ用ファイルへ機械的に移す。
//
// なぜ使い捨てにしないか＝同じ作業が数か月ごとに発生する（実行キューの完了項目は
// 積み上がり続ける）。∴再利用できる形で scripts/ に置く。冪等（2回実行しても
// 結果が変わらない）＋自己検証（1行でも欠落・重複したら異常終了）。
//
// 移すもの：
//   PLAN.md      実行キューの完了 `- [x]` ブロック全文 → PLAN-ARCHIVE.md
//                （キュー側には1行だけ残す＝番号＋要約＋完了日＋全文へのリンク）
//   PROGRESS.md  ① セッションログのうち KEEP_LOGS_FROM より古いエントリ
//                ② 📍現在地の古いメモ（新しい KEEP_CURRENT 件より前）
//                                                        → PROGRESS-ARCHIVE.md
//
// ⛔ 壊してはいけない不変条件（PLAN 実行キュー14番に明記）：
//   ① 実行順序の単一ソースは PLAN.md 冒頭の実行キュー1箇所
//      ＝アーカイブ側に順序を書かない・キューから項目を消さない（1行に縮めるだけ）
//   ② 過去の記述に必ず辿れる（1行要約にアーカイブへのリンクを必ず付ける）
//   ③ 1バイトも失わない（移した行がアーカイブに1回だけ現れることを検査する）
//
// 使い方：
//   node scripts/archive-docs.mjs            … 検査だけ（何も書かない）
//   node scripts/archive-docs.mjs --write    … 実際に書き換える

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

/** この日付より古いセッションログをアーカイブへ移す（YYYY-MM-DD 文字列比較） */
const KEEP_LOGS_FROM = '2026-09-01';
/** 📍現在地に残す「タスクのメモ」の件数（構造の箇条書きは常に残す） */
const KEEP_CURRENT = 5;

const readLines = (p) => fs.readFileSync(p, 'utf8').split('\n');
/** すでにあるアーカイブの行（無ければ空配列）。**追記のために必ず読む** */
const readArchive = (p) => (fs.existsSync(p) ? readLines(p) : []);
const isBlank = (s) => s.trim() === '';
/** 字下げ行・空行は直前のブロックの続き。列0の非空行が新しいブロックの始まり */
const isContinuation = (s) => isBlank(s) || /^[ \t]/.test(s);

/**
 * 列0の見出し行 startIdx から始まるブロックの終端（次のブロックの開始位置）を返す。
 * 末尾の空行はブロックに含めない。
 */
function blockEnd(lines, startIdx) {
	let end = startIdx + 1;
	while (end < lines.length && isContinuation(lines[end])) end++;
	while (end > startIdx + 1 && isBlank(lines[end - 1])) end--;
	return end;
}

/**
 * `### 2026-…` のセッションログ1エントリの終端。
 * ⚠️ blockEnd は使えない＝ログ本文は「- **やったこと：**」のように**列0**の箇条書きを含む
 *（これで一度、見出し1行だけを移して本文を置き去りにした。2026-09-13）
 * ∴終端は「次の見出し（`### ` か `## `）」で決める。
 */
function logEntryEnd(lines, startIdx, limit) {
	let end = startIdx + 1;
	while (end < limit && !/^#{2,3} /.test(lines[end])) end++;
	while (end > startIdx + 1 && isBlank(lines[end - 1])) end--;
	return end;
}

function sectionRange(lines, headingRe) {
	const start = lines.findIndex((l) => headingRe.test(l));
	if (start < 0) throw new Error(`見出しが見つからない: ${headingRe}`);
	let end = start + 1;
	while (end < lines.length && !/^## /.test(lines[end])) end++;
	return [start, end];
}

// ── 要約の作り方 ────────────────────────────────────────────────
// ⚠️ 意味の圧縮を機械にやらせない（要約が本文と食い違うと記述の失効が起きる）。
// ∴「番号＋最初の1文（上限あり）」だけを機械的に切り出す。
const SUMMARY_MAX = 120;

function entryId(header, used) {
	// ⚠️ 番号は見出しの**先頭**から取る（途中の数字を拾うと 0m が q1 になる。2026-09-13 に踏んだ）
	const m = header.match(/^- \[[x ]\] \*\*([0-9][0-9a-z.\-]*?)[.．]/);
	let base = m ? `q${m[1]}` : null;
	if (!base) {
		const q = header.match(/実行キュー\s*([0-9a-z\-]+)/);
		base = q ? `q${q[1]}` : 'q';
	}
	let id = base;
	for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
	used.add(id);
	return id;
}

/**
 * 見出し先頭の「（2026-09-02 判明・…／完了条件 (c) は未消化）」を落とす。
 * ⚠️ 単純な `[^）)]*` では ASCII の括弧を含む但し書きで途中で切れて文が壊れる
 *（0o が「0o. の実プレイ判定は未消化）X 魔王を…」になった。2026-09-13 に踏んだ）
 * ∴全角括弧だけを見て入れ子を数える。
 */
function stripLeadingNote(t) {
	const chars = [...t];
	let i = 0;
	while (i < chars.length && chars[i] !== '（') {
		if (!/[0-9a-z.．\-\s]/.test(chars[i])) return t;   // 番号以外の文字が来たら但し書きではない
		i++;
	}
	if (i >= chars.length) return t;
	let depth = 0;
	let j = i;
	for (; j < chars.length; j++) {
		if (chars[j] === '（') depth++;
		else if (chars[j] === '）' && --depth === 0) { j++; break; }
	}
	if (depth !== 0) return t;
	return (chars.slice(0, i).join('') + chars.slice(j).join('')).trim();
}

function summarize(header) {
	let t = header.replace(/^- \[[x ]\]\s*/, '').replace(/\*\*/g, '').trim();
	for (let n = 0; n < 4; n++) {   // 但し書きが2つ続く項目がある（0x）
		const s = stripLeadingNote(t);
		if (s === t) break;
		t = s;
	}
	t = t.replace(/^([0-9][0-9a-z.\-]*[.．])(?=\S)/, '$1 ');   // 「0. 剣獣…」＝番号のあとに空白
	const dot = [...t].findIndex((ch) => ch === '。');
	const chars = [...t];
	let cut = dot >= 0 && dot < SUMMARY_MAX ? dot : Math.min(chars.length, SUMMARY_MAX);
	let s = chars.slice(0, cut).join('').trim();
	if (cut < chars.length && dot !== cut) s += '…';
	return s.replace(/\s+/g, ' ');
}

/**
 * 完了日＝見出しの「…2026-09-05 完了」を最優先で採る。
 * ⚠️ ブロック内の最初の日付を採ると「依頼された日」になる（0d は 08-23 依頼→09-05 完了）。
 */
function completionDate(block) {
	const header = block[0];
	// ⚠️ 「最後に現れた日付」ではなく**一番新しい日付**を採る
	//（見出しの後半で古い日付の完了に触れている項目がある。2026-09-13 に踏んだ）
	const done = [...header.matchAll(/(2026-\d\d-\d\d)[^）)]{0,16}?完了/g)].map((m) => m[1]).sort();
	if (done.length) return done[done.length - 1];
	// 見出しに「完了」が無い項目（例＝12番の却下）は本文で一番新しい日付を採る
	const all = block.join('\n').match(/2026-\d\d-\d\d/g);
	if (!all) return null;
	return all.sort()[all.length - 1];
}

// ── PLAN.md ────────────────────────────────────────────────────
function splitPlan(srcOverride, archiveOverride) {
	const file = path.join(ROOT, 'PLAN.md');
	const archiveFile = path.join(ROOT, 'PLAN-ARCHIVE.md');
	// 引数つきで呼ぶのは冪等の検査だけ（ディスクではなく1回目の結果を入力にする）
	const lines = srcOverride ?? readLines(file);
	const [qStart, qEnd] = sectionRange(lines, /^## 🎯 実行キュー/);

	// ⚠️ 既存のアーカイブは**残して後ろに足す**（作り直すと過去分が消える。2026-09-13 に2回目の
	// 実行で 841 KB → 6 KB になりかけた＝バックアップから戻して直した）
	const prevArchive = archiveOverride ?? readArchive(archiveFile);
	const firstEntry = prevArchive.findIndex((l) => /^<a id="/.test(l));
	const prevBody = firstEntry >= 0 ? prevArchive.slice(firstEntry) : [];

	const out = lines.slice(0, qStart + 1);
	const archived = [];
	// アンカー id は既存分と衝突させない
	const used = new Set(prevBody.flatMap((l) => { const m = l.match(/^<a id="([^"]+)"/); return m ? [m[1]] : []; }));
	let i = qStart + 1;
	while (i < qEnd) {
		const line = lines[i];
		if (/^- \[x\] /.test(line)) {
			const end = blockEnd(lines, i);
			const block = lines.slice(i, end);
			// 冪等＝すでに1行に縮めた項目は触らない
			if (block.length === 1 && /PLAN-ARCHIVE\.md#/.test(block[0])) {
				out.push(line);
				i = end;
				continue;
			}
			const id = entryId(line, used);
			const date = completionDate(block);
			archived.push({ id, block, date });
			out.push(`- [x] ${summarize(line)}${date ? `（${date}）` : ''} → [全文](PLAN-ARCHIVE.md#${id})`);
			i = end;
			continue;
		}
		out.push(line);
		i++;
	}
	out.push(...lines.slice(qEnd));

	const header = [
		'# Blade of Lumia – 実行キューの完了項目（アーカイブ）',
		'',
		'> **このファイルの役割：** `PLAN.md` 冒頭「🎯 実行キュー」の**完了済み項目の全文**を保管する場所。',
		'> `PLAN.md` が新しいタスクを読むたびに巨大な履歴を読ませていた（実測 2026-09-13＝キュー 843 KB のうち',
		'> 838 KB が完了項目）ので分けた。**キュー側には1行の要約とこのファイルへのリンクが残っている。**',
		'>',
		'> **⚠️ 実行順序はこのファイルには無い。** 次にやることは `PLAN.md` 冒頭「🎯 実行キュー」だけを見る。',
		'> **⚠️ ここの記述は完了当時のもの。** 後から失効した記述は `PLAN.md` 側・`DECISIONS.md` 側で上書きされている',
		'> ことがある（[[blade-stale-descriptions-after-collab]]）∴引用する前に現物で裏取りする。',
		'>',
		'> **書き足し方：** 手で編集しない。`node scripts/archive-docs.mjs --write` が `PLAN.md` から移す。',
		'',
		'---',
		'',
	];
	const body = [];
	for (const a of archived) {
		body.push(`<a id="${a.id}"></a>`, '');
		body.push(...a.block);
		body.push('', '---', '');
	}
	return { file, out, archiveFile, prevArchive, prevBody, archive: [...header, ...prevBody, ...body], archived };
}

// ── PROGRESS.md ────────────────────────────────────────────────
function splitProgress(srcOverride, archiveOverride) {
	const file = path.join(ROOT, 'PROGRESS.md');
	const archiveFile = path.join(ROOT, 'PROGRESS-ARCHIVE.md');
	const lines = srcOverride ?? readLines(file);
	const [cStart, cEnd] = sectionRange(lines, /^## 📍 現在地/);
	const [lStart, lEnd] = sectionRange(lines, /^## セッションログ/);
	if (!(cEnd <= lStart)) throw new Error('現在地セクションがセッションログより後にある＝前提が崩れている');

	// ⚠️ 既存のアーカイブは**残す**。今回移すぶんは既存分より新しい∴各節の**先頭**に足す
	//（節は「新しい順」で並べている）
	const prevArchive = archiveOverride ?? readArchive(archiveFile);
	const prevCurIdx = prevArchive.findIndex((l) => /^## 📦 古い「現在地」/.test(l));
	const prevLogIdx = prevArchive.findIndex((l) => /^## 📦 .*セッションログ（新しい順）/.test(l));
	const trimEdges = (arr) => {
		let a = 0;
		let b = arr.length;
		while (a < b && (isBlank(arr[a]) || /^-{3,}$/.test(arr[a].trim()))) a++;
		while (b > a && (isBlank(arr[b - 1]) || /^-{3,}$/.test(arr[b - 1].trim()))) b--;
		return arr.slice(a, b);
	};
	const prevCur = prevCurIdx >= 0 && prevLogIdx > prevCurIdx ? trimEdges(prevArchive.slice(prevCurIdx + 1, prevLogIdx)) : [];
	const prevLog = prevLogIdx >= 0 ? trimEdges(prevArchive.slice(prevLogIdx + 1)) : [];
	// すでにアーカイブ済みの件数（表示する数を**累計**にするため）
	const prevCurCount = prevCur.filter((l) => /^- /.test(l)).length;
	const prevLogCount = prevLog.filter((l) => /^### /.test(l)).length;

	const out = [];
	const movedCurrent = [];
	const movedLogs = [];

	out.push(...lines.slice(0, cStart + 1));

	// ① 📍現在地：構造の箇条書きは常に残し、タスクのメモは新しい KEEP_CURRENT 件だけ残す
	const structural = (l) => /進行中フェーズ|▶ 次にやること/.test(l);
	// ⚠️ 前回の実行が残した「📦 …に移した」の目印は**メモとして数えない**（数えると毎回1件ずつ
	// メモがアーカイブへ押し出され、目印自体もアーカイブへ落ちる＝冪等でなくなる。2026-09-13 に踏んだ）
	const marker = (l) => /^- \*\*📦/.test(l);
	let kept = 0;
	let i = cStart + 1;
	while (i < cEnd) {
		const line = lines[i];
		if (/^- /.test(line)) {
			const end = blockEnd(lines, i);
			const block = lines.slice(i, end);
			if (marker(line)) {
				// 目印は毎回作り直す＝捨てる（件数は累計で書き直す）
			} else if (structural(line) || kept < KEEP_CURRENT) {
				if (!structural(line)) kept++;
				out.push(...block, '');
			} else {
				movedCurrent.push(block);
			}
			i = end;
			while (i < cEnd && isBlank(lines[i])) i++;
			continue;
		}
		out.push(line);
		i++;
	}
	while (out.length && isBlank(out[out.length - 1])) out.pop();
	out.push('', `- **📦 これより古い「現在地」のメモ（${prevCurCount + movedCurrent.length} 件）＝[PROGRESS-ARCHIVE.md](PROGRESS-ARCHIVE.md) に移した**（2026-09-13・\`scripts/archive-docs.mjs\`）。`, '');

	out.push(...lines.slice(cEnd, lStart + 1));

	// ② セッションログ：KEEP_LOGS_FROM より古いエントリを移す
	const looseLog = [];
	i = lStart + 1;
	while (i < lEnd) {
		const line = lines[i];
		const m = line.match(/^### (2026-\d\d-\d\d)/);
		if (m) {
			const end = logEntryEnd(lines, i, lEnd);
			const block = lines.slice(i, end);
			if (m[1] < KEEP_LOGS_FROM) movedLogs.push(block);
			else out.push(...block, '');
			i = end;
			while (i < lEnd && isBlank(lines[i])) i++;
			continue;
		}
		// ⚠️ 前回の目印（`### 📦 …`）は日付見出しに一致しない∴放っておくと毎回1本増える
		if (/^### 📦/.test(line)) {
			i = logEntryEnd(lines, i, lEnd);
			while (i < lEnd && isBlank(lines[i])) i++;
			continue;
		}
		// どのエントリにも属さない行（節の前書き）＝あとで検査する
		looseLog.push(line);
		out.push(line);
		i++;
	}
	while (out.length && isBlank(out[out.length - 1])) out.pop();
	out.push(
		'',
		`### 📦 ${KEEP_LOGS_FROM} より前のセッションログ（${prevLogCount + movedLogs.length} エントリ）`,
		'',
		'`PROGRESS-ARCHIVE.md` に移した（2026-09-13・`scripts/archive-docs.mjs`）。',
		''
	);
	out.push(...lines.slice(lEnd));

	const header = [
		'# Blade of Lumia – 作業ログ（アーカイブ）',
		'',
		'> **このファイルの役割：** `PROGRESS.md` の古い記述を保管する場所＝(1) 📍現在地から落ちた古いメモ',
		`> (2) ${KEEP_LOGS_FROM} より前のセッションログ。`,
		'>',
		'> **⚠️ 実行順序はここには無い**（`PLAN.md` 冒頭「🎯 実行キュー」だけを見る）。',
		'> **⚠️ 過去エントリの「▶ 次やること」は書かれた当時の記録＝すべて失効している。**',
		'>',
		'> **書き足し方：** 手で編集しない。`node scripts/archive-docs.mjs --write` が `PROGRESS.md` から移す。',
		'',
		'---',
		'',
		'## 📦 古い「現在地」のメモ（新しい順）',
		'',
	];
	const body = [];
	for (const b of movedCurrent) body.push(...b, '');
	if (prevCur.length) body.push(...prevCur, '');
	body.push('---', '', `## 📦 ${KEEP_LOGS_FROM} より前のセッションログ（新しい順）`, '');
	for (const b of movedLogs) body.push(...b, '');
	if (prevLog.length) body.push(...prevLog, '');

	return {
		file,
		out,
		archiveFile,
		prevArchive,
		looseLog,
		prevBody: [...prevCur, ...prevLog],
		archive: [...header, ...body],
		moved: { current: movedCurrent.length, logs: movedLogs.length },
		movedBlocks: [...movedCurrent, ...movedLogs],
	};
}

// ── 自己検証 ────────────────────────────────────────────────────
/**
 * 「今回移した行」＋「もともとアーカイブにあった行」＝「新しいアーカイブの行」を突き合わせる。
 * ⚠️ 「移した行がアーカイブに1回だけ」では**既存分を消しても緑になる**（2回目の実行でアーカイブを
 * 作り直して 841 KB → 6 KB にしかけた。2026-09-13）∴既存分の行数も期待値に足す。
 */
function verifyMoved(label, movedBlocks, archiveLines, prevArchiveLines = []) {
	// 区切り線（`---`）はアーカイブ側でも足す∴件数一致の検査から外す
	const skip = (l) => isBlank(l) || /^-{3,}$/.test(l.trim());
	const want = new Map();
	for (const b of movedBlocks) for (const l of b) if (!skip(l)) want.set(l, (want.get(l) ?? 0) + 1);
	for (const l of prevArchiveLines) if (!skip(l)) want.set(l, (want.get(l) ?? 0) + 1);
	const got = new Map();
	for (const l of archiveLines) if (!isBlank(l)) got.set(l, (got.get(l) ?? 0) + 1);
	const problems = [];
	for (const [l, n] of want) {
		const g = got.get(l) ?? 0;
		if (g !== n) problems.push(`${g === 0 ? '欠落' : `件数不一致(${n}→${g})`}: ${l.slice(0, 70)}`);
	}
	if (problems.length) {
		console.error(`❌ ${label}: 移した行の検査に失敗 ${problems.length} 件`);
		for (const p of problems.slice(0, 10)) console.error('   ' + p);
		process.exit(1);
	}
	console.log(`✅ ${label}: 移した行はすべてアーカイブに1回だけ存在する（${want.size} 行）`);
}

/**
 * 元ファイルの非空行が「新ファイル＋アーカイブ」の中に元と同じ回数以上あることを確かめる。
 * ＝どこかへ移ったか残ったかのどちらかで、消えた行が1行も無いことの保証。
 */
function verifyNoLoss(label, originalLines, newLines, archiveLines) {
	// 空行・区切り線（`---`）・「📦 …に移した」の目印は構造＝内容ではない∴数えない
	//（目印は毎回作り直す＝件数が累計で書き変わる。区切り線は節の境界で1本増減する）
	// ⚠️ 目印の判定は狭く書く（`📦` は本文の散文にも出る＝広く弾くと検査に穴が空く）
	const isMarker = (l) => /^- \*\*📦 これより古い/.test(l) || /^### 📦 .*セッションログ/.test(l) || l === '`PROGRESS-ARCHIVE.md` に移した（2026-09-13・`scripts/archive-docs.mjs`）。';
	const skip = (l) => isBlank(l) || /^-{3,}$/.test(l.trim()) || isMarker(l);
	const count = (arr) => {
		const m = new Map();
		for (const l of arr) if (!skip(l)) m.set(l, (m.get(l) ?? 0) + 1);
		return m;
	};
	const before = count(originalLines);
	const after = count([...newLines, ...archiveLines]);
	const lost = [];
	for (const [l, n] of before) if ((after.get(l) ?? 0) < n) lost.push(`${l.slice(0, 70)}（${n} → ${after.get(l) ?? 0}）`);
	if (lost.length) {
		console.error(`❌ ${label}: 消えた行 ${lost.length} 件`);
		for (const p of lost.slice(0, 10)) console.error('   ' + p);
		process.exit(1);
	}
	console.log(`✅ ${label}: 元の ${before.size} 行はすべて新ファイルかアーカイブに残っている（消えた行 0）`);
}

function verifyPlan(plan, lines) {
	const [qStart, qEnd] = sectionRange(lines, /^## 🎯 実行キュー/);
	const queue = lines.slice(qStart, qEnd);
	const done = queue.filter((l) => /^- \[x\] /.test(l));
	const linked = done.filter((l) => /→ \[全文\]\(PLAN-ARCHIVE\.md#/.test(l));
	if (done.length !== linked.length) {
		console.error(`❌ PLAN: 完了項目 ${done.length} 件のうちリンクが無いもの ${done.length - linked.length} 件`);
		process.exit(1);
	}
	const open = queue.filter((l) => /^- \[ \] /.test(l));
	console.log(`✅ PLAN: 実行キュー＝完了 ${done.length} 件（全部1行＋リンク）／未完 ${open.length} 件`);
	// 未完ブロックが1文字も変わっていないこと
	const before = readLines(plan.file);
	const [bStart, bEnd] = sectionRange(before, /^## 🎯 実行キュー/);
	const openBefore = [];
	for (let i = bStart + 1; i < bEnd; i++) {
		if (/^- \[ \] /.test(before[i])) {
			const e = blockEnd(before, i);
			openBefore.push(before.slice(i, e).join('\n'));
			i = e - 1;
		}
	}
	const openAfter = [];
	for (let i = qStart + 1; i < qEnd; i++) {
		if (/^- \[ \] /.test(lines[i])) {
			const e = blockEnd(lines, i);
			openAfter.push(lines.slice(i, e).join('\n'));
			i = e - 1;
		}
	}
	if (openBefore.join(' ') !== openAfter.join(' ')) {
		console.error('❌ PLAN: 未完タスクの本文が変わった（この移行は完了項目だけを動かす）');
		process.exit(1);
	}
	console.log('✅ PLAN: 未完タスクの本文は1文字も変わっていない');
}

// ── 実行 ───────────────────────────────────────────────────────
const plan = splitPlan();
const prog = splitProgress();

const kb = (s) => `${(Buffer.byteLength(s, 'utf8') / 1024).toFixed(0)} KB`;
const planBefore = fs.readFileSync(plan.file, 'utf8');
const progBefore = fs.readFileSync(prog.file, 'utf8');
const planAfter = plan.out.join('\n');
const progAfter = prog.out.join('\n');
const planArchive = plan.archive.join('\n');
const progArchive = prog.archive.join('\n');

console.log(`PLAN.md      ${kb(planBefore)} → ${kb(planAfter)}   （完了 ${plan.archived.length} 件を PLAN-ARCHIVE.md ${kb(planArchive)} へ）`);
console.log(`PROGRESS.md  ${kb(progBefore)} → ${kb(progAfter)}   （現在地 ${prog.moved.current} 件・ログ ${prog.moved.logs} 件を PROGRESS-ARCHIVE.md ${kb(progArchive)} へ）`);

verifyMoved('PLAN', plan.archived.map((a) => a.block), plan.archive, plan.prevBody);
verifyMoved('PROGRESS', prog.movedBlocks, prog.archive, prog.prevBody);
// ⚠️ 元ファイルだけでなく**既存のアーカイブ**も「失ってはいけない側」に入れる
verifyNoLoss('PLAN', [...planBefore.split('\n'), ...plan.prevArchive], plan.out, plan.archive);
verifyNoLoss('PROGRESS', [...progBefore.split('\n'), ...prog.prevArchive], prog.out, prog.archive);
verifyPlan(plan, plan.out);

/**
 * セッションログ節の全行が「どれかのエントリ（`### 日付` から次の見出しまで）」に属すること。
 * ⚠️ これが無いと「見出しだけ移して本文を置き去りにする」バグが全部の検査を緑で通り抜ける
 *（置き去りの本文は元ファイルに残る＝消えた行0・移した行も1回だけ。2026-09-13 に踏んだ）
 */
function verifyLogsPartitioned(loose) {
	const allowed = (l) => isBlank(l) || /^<!--/.test(l) || /^>/.test(l) || /^#{2,3} /.test(l) || /^-{3,}$/.test(l.trim());
	const orphans = loose.filter((l) => !allowed(l));
	if (orphans.length) {
		console.error(`❌ PROGRESS: どのエントリにも属さない行 ${orphans.length} 件（見出しだけ移して本文を置き去りにしていないか）`);
		for (const l of orphans.slice(0, 10)) console.error('   ' + l.slice(0, 70));
		process.exit(1);
	}
	console.log('✅ PROGRESS: セッションログ節の全行がエントリに属している（置き去りの本文 0）');
}
verifyLogsPartitioned(prog.looseLog);

// ⚠️ 既存のアーカイブに居る id も数える（リンク先が2つあると辿れない）
const allIds = plan.archive.flatMap((l) => { const m = l.match(/^<a id="([^"]+)"/); return m ? [m[1]] : []; });
const dupIds = allIds.filter((id, i, arr) => arr.indexOf(id) !== i);
if (dupIds.length) {
	console.error(`❌ PLAN: アンカー id が重複 ${[...new Set(dupIds)].join(', ')}`);
	process.exit(1);
}
console.log(`✅ PLAN: アンカー id ${allIds.length} 件すべて一意（今回追加 ${plan.archived.length} 件）`);

/**
 * 冪等＝1回目の結果をそのまま入力にしたとき、何も動かず結果も変わらないこと。
 * ⚠️ これが無いと「毎回1件ずつメモがアーカイブへ押し出される」「目印が毎回1本増える」型の
 * バグが検査を全部緑のまま通り抜ける（2026-09-13 に両方踏んだ）。
 */
function verifyIdempotent() {
	const p2 = splitPlan(plan.out, plan.archive);
	const g2 = splitProgress(prog.out, prog.archive);
	const problems = [];
	if (p2.archived.length) problems.push(`PLAN: 2回目に ${p2.archived.length} 件動く`);
	if (g2.moved.current || g2.moved.logs) problems.push(`PROGRESS: 2回目に 現在地 ${g2.moved.current} 件・ログ ${g2.moved.logs} 件動く`);
	if (p2.out.join('\n') !== planAfter) problems.push('PLAN.md の内容が2回目で変わる');
	if (g2.out.join('\n') !== progAfter) problems.push('PROGRESS.md の内容が2回目で変わる');
	if (p2.archive.join('\n') !== planArchive) problems.push('PLAN-ARCHIVE.md の内容が2回目で変わる');
	if (g2.archive.join('\n') !== progArchive) problems.push('PROGRESS-ARCHIVE.md の内容が2回目で変わる');
	if (problems.length) {
		console.error('❌ 冪等ではない');
		for (const p of problems) console.error('   ' + p);
		process.exit(1);
	}
	console.log('✅ 冪等：1回目の結果を入力に戻しても何も動かず内容も変わらない');
}
verifyIdempotent();

if (!WRITE) {
	console.log('\n（--write が無いので何も書いていない）');
	process.exit(0);
}
fs.writeFileSync(plan.archiveFile, planArchive);
fs.writeFileSync(prog.archiveFile, progArchive);
fs.writeFileSync(plan.file, planAfter);
fs.writeFileSync(prog.file, progAfter);
console.log('\n✍️  書き込んだ: PLAN.md / PLAN-ARCHIVE.md / PROGRESS.md / PROGRESS-ARCHIVE.md');
