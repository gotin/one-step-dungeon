import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('work/blade-of-lumia.json', 'utf8'));
const field = data.layers.field.stages;
const s10 = field['1,0'];
const s20 = field['2,0'];
console.log('startPos:', JSON.stringify(data.startPos));
console.log('field stages keys:', Object.keys(field).join(', '));
console.log('field 1,0 cols/rows:', s10?.cols, s10?.rows);
console.log('field 2,0 exists:', !!s20);
if (s20) console.log('field 2,0 cols/rows:', s20.cols, s20.rows);
// 1,0 の右端(x>=cols)に行くと 2,0 へ遷移する
// 各ステージの rows を確認（遷移テスト用）
