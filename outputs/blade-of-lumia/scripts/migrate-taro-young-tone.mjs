#!/usr/bin/env node
/**
 * migrate-taro-young-tone.mjs（実行キュー56・2026-10-13）
 *
 * はじまりの村（field 7,14）の村人タロは、見た目（村人の共通スプライト＝若者）と名前に
 * 合わない老人口調（〜じゃよ／わし／おぬし）で話していた。ユーザーのプレイメモ
 * 「村人タロ が名前の感じと口調が会ってない感じがする」→ 判断「案B＝タロは若者のまま、
 * 口調を若者に寄せる（長老の見た目は老賢者用に別に作る）」。
 * 中身（案内の内容・方角）は変えない。ボス撃破後の版は既に若者の口調∴触らない。
 *
 * 自己検証：旧文がちょうど1回あることを確かめてから置き換える。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const taro = map.layers.field.stages['7,14']?.npcData?.['3,5'];
if (taro?.name !== '村人 タロ') throw new Error('field 7,14 (3,5) に村人タロがいない');

const LINES = [
	['ここは はじまりの村。草原のへりの、小さな村じゃよ。', 'ここは はじまりの村。草原のへりの、小さな村さ。'],
	['洞窟は村を出て西、そこからひとつ北。草原の窪みに口を開けておる。', '洞窟は村を出て西、そこからひとつ北。草原の窪みに口を開けてるよ。'],
	['旅人が言っておった。西の砂漠に神殿があり、砂嵐が渦を巻いていると。', '旅人が言ってたんだ。西の砂漠に神殿があって、砂嵐が渦を巻いてるって。'],
	['北西の森の奥には 巨きな者の気配があるとも。……わしは近づかんよ。', '北西の森の奥には 巨きな何かがいるらしい。……おれは近づかないけどね。'],
	['この草原の窪みには、火があれば開く「草陰の祠」もあるという噂じゃ。', 'この草原の窪みには、火があれば開く「草陰の祠」もあるって噂だよ。'],
];
const AFTER = [
	['勇者よ、ボスを倒したのか！ありがとう！', 'ボスを倒したのか！ありがとう！'],
	['おぬしのおかげで村人たちも安心して眠れそうじゃ。', 'きみのおかげで、村のみんなも安心して眠れそうだ。'],
	['引き続き他のダンジョンも頼むぞ……！', 'ほかのダンジョンも頼んだよ……！'],
];

function replaceIn(arr, pairs, label) {
	for (const [from, to] of pairs) {
		const idx = arr.map((t, i) => (t === from ? i : -1)).filter((i) => i >= 0);
		if (idx.length !== 1) throw new Error(`${label}：「${from}」が ${idx.length} 回（1回のはず）`);
		arr[idx[0]] = to;
	}
}
replaceIn(taro.lines, LINES, 'lines');
replaceIn(taro.linesAfterBoss.after, AFTER, 'linesAfterBoss.after');

// 老人口調が残っていないか（若者の口調に揃ったか）
const all = [...taro.lines, ...Object.values(taro.linesAfterBoss).flat()];
const left = all.filter((t) => /じゃ(?!ない)|わし|おぬし|おった|ておる/.test(t));
if (left.length) throw new Error(`老人口調が残っている：${left.join(' / ')}`);

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log('村人タロの口調を直しました');
