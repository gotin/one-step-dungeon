#!/usr/bin/env node
// フルテストを分けて1つずつ回す（2026-11-23 ユーザー依頼）。
// きっかけ＝本番の前のフル（約3100本・workers 3）が、PC のメモリ不足で Claude Code に途中で止められた
// （524/3100 本目）。全部を一度に回さず、Playwright の `--shard=i/N` で N 個の塊に分け、塊を1つずつ順に回す。
//
// - 同時に動くのは1つの塊だけ。ブラウザの数（workers）も既定で2に減らす（メモリを食うのは主に workers ぶんの Chromium）。
// - 済んだ塊を記録する。途中で止められても、もう一度実行すれば**残りの塊から続ける**。
//   記録はコードの状態（HEAD のコミット＋未コミットの差分）ごと＝コードを変えたら最初から回し直す。
// - 失敗した塊は「済み」にしない＝次の実行で回し直す。最後に全部の塊の合計を出す。
//
// 使い方（outputs/blade-of-lumia で）：
//   npm run test:shards                     4つに分けて workers 2 で回す（続きがあれば続きから）
//   npm run test:shards -- --shards=6 --workers=1   分け方・ブラウザの数を変える
//   npm run test:shards -- --reset          記録を消して最初から
//   npm run test:shards -- --max=1          この実行では残りの塊を1つだけ回す（少しずつ進めたいとき）
// ログ：.scratch/test-shards/shard-<i>-of-<N>.log（git 管理外）。失敗の画面などは test-results/shard-<i>/。
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
	const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
	return m ? [m[1], m[2] ?? true] : [a, true];
}));
const SHARDS = Number(args.shards ?? 4);
const WORKERS = Number(args.workers ?? 2);
const MAX = args.max ? Number(args.max) : Infinity;
if (!(SHARDS >= 1) || !(WORKERS >= 1)) {
	console.error('--shards と --workers は1以上の数');
	process.exit(2);
}

const DIR = '.scratch/test-shards';
const STATE = join(DIR, 'state.json');
mkdirSync(DIR, { recursive: true });

// コードの状態＝HEAD＋未コミットの差分（テストもコードも含む）。これが変われば記録は使わない
function codeKey() {
	const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
	const diff = execSync('git diff HEAD -- .', { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
	const untracked = execSync('git ls-files --others --exclude-standard -- .', { encoding: 'utf8' });
	return createHash('sha256').update(head).update(diff).update(untracked).digest('hex').slice(0, 16);
}

const key = `${codeKey()}:${SHARDS}`;
let state = { key, done: {} };
if (!args.reset && existsSync(STATE)) {
	try {
		const prev = JSON.parse(readFileSync(STATE, 'utf8'));
		if (prev.key === key) state = prev;
		else console.log('コードか分け方が前回と違う＝最初から回す');
	} catch { /* 壊れていたら最初から */ }
}
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
save();

// ログの最後の集計行（"  12 passed (3.1m)" など）から数を読む
function summarize(log) {
	const text = log.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
	const pick = (word) => Number((new RegExp(`^\\s+(\\d+) ${word}`, 'm').exec(text) ?? [])[1] ?? 0);
	const failedTitles = [...text.matchAll(/^\s+\d+\) (\[chromium\] › .+?)\s*$/gm)].map((m) => m[1]);
	return { passed: pick('passed'), failed: pick('failed'), flaky: pick('flaky'), skipped: pick('skipped'), failedTitles: [...new Set(failedTitles)] };
}

function runShard(i) {
	const log = join(DIR, `shard-${i}-of-${SHARDS}.log`);
	const out = createWriteStream(log);
	return new Promise((resolve) => {
		const child = spawn('nice', ['-n', '10', 'npx', 'playwright', 'test',
			`--shard=${i}/${SHARDS}`, '--reporter=line', `--output=test-results/shard-${i}`], {
			env: { ...process.env, PW_WORKERS: String(WORKERS) },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		child.stdout.pipe(out, { end: false });
		child.stderr.pipe(out, { end: false });
		child.on('close', (code) => {
			out.end(() => resolve({ code, log }));
		});
	});
}

const started = Date.now();
let ran = 0;
console.log(`フルテストを ${SHARDS} つに分けて回す（workers ${WORKERS}）。記録 ${STATE}`);
for (let i = 1; i <= SHARDS; i++) {
	if (state.done[i]) {
		const d = state.done[i];
		console.log(`塊 ${i}/${SHARDS}：済み（${d.passed} 本緑${d.flaky ? `・揺れ ${d.flaky}` : ''}）＝飛ばす`);
		continue;
	}
	if (ran >= MAX) break;
	ran++;
	const t0 = Date.now();
	console.log(`塊 ${i}/${SHARDS}：回す…`);
	const { code, log } = await runShard(i);
	const s = summarize(readFileSync(log, 'utf8'));
	const min = ((Date.now() - t0) / 60000).toFixed(1);
	if (code === 0) {
		state.done[i] = { passed: s.passed, flaky: s.flaky, skipped: s.skipped, at: new Date().toISOString() };
		save();
		console.log(`塊 ${i}/${SHARDS}：緑 ${s.passed} 本${s.flaky ? `・揺れ ${s.flaky}` : ''}（${min} 分）`);
	} else {
		console.log(`塊 ${i}/${SHARDS}：赤 ${s.failed} 本・緑 ${s.passed} 本（${min} 分）。ログ ${log}`);
		for (const t of s.failedTitles) console.log(`  ✘ ${t}`);
	}
}

const left = [...Array(SHARDS).keys()].map((k) => k + 1).filter((i) => !state.done[i]);
const total = Object.values(state.done).reduce((a, d) => ({ passed: a.passed + d.passed, flaky: a.flaky + d.flaky }), { passed: 0, flaky: 0 });
console.log(`\nこの実行 ${((Date.now() - started) / 60000).toFixed(1)} 分。済みの塊の合計：緑 ${total.passed} 本${total.flaky ? `・揺れ ${total.flaky}` : ''}`);
if (left.length) {
	const list = left.length > 10 ? `${left.slice(0, 10).join(', ')} … ほか ${left.length - 10} 個` : left.join(', ');
	console.log(`残りの塊（赤か、まだ回していない）：${list}。赤があれば直してから、もう一度 \`npm run test:shards\`（済みの塊は飛ばす）`);
	process.exit(1);
}
console.log('全部の塊が緑');
