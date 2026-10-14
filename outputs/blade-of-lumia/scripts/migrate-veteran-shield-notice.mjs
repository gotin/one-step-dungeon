#!/usr/bin/env node
/**
 * migrate-veteran-shield-notice.mjs（実行キュー64・2026-10-14）
 *
 * 老兵ガルド（field 6,13 (8,10)）の「盾を手にした後」の版（`item:shield`）に、未読の印を出す
 * フラグ `notifyAfterBoss['item:shield'] = true` を付ける。
 * ユーザー提案「このメッセージはマップ位置のことじゃないから吹き出しはでないんだね。でもこのケースも
 * 吹き出しあった方がいい気がする」→ 合意＝版ごとに opt-in（台詞が変わったら一律、は不可＝キュー61）。
 * 冪等：既に付いていれば何もしない。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dir, '../work/blade-of-lumia.json');
const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

const vet = map.layers.field.stages['6,13']?.npcData?.['8,10'];
if (vet?.name !== '老兵 ガルド') throw new Error('field 6,13 (8,10) に老兵ガルドがいない');
if (!vet.linesAfterBoss?.['item:shield']?.length) throw new Error('老兵に盾の版の本文が無い');
if (vet.notifyAfterBoss?.['item:shield'] === true) { console.log('既に付いている＝何もしない'); process.exit(0); }
vet.notifyAfterBoss = { ...(vet.notifyAfterBoss ?? {}), 'item:shield': true };

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');
console.log('老兵ガルドの盾の版に未読の印を付けました');
