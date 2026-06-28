import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('work/blade-of-lumia.json', 'utf8'));
const field = data.layers.field.stages;
const s714 = field['7,14'];
const s814 = field['8,14'];
console.log('startPos:', JSON.stringify(data.startPos));
console.log('field stages keys:', Object.keys(field).join(', '));
console.log('field 7,14 cols/rows:', s714?.cols, s714?.rows);
console.log('field 8,14 exists:', !!s814);
if (s814) console.log('field 8,14 cols/rows:', s814.cols, s814.rows);
// 7,14 の右端(x>=cols)に行くと 8,14 へ遷移する
// 各ステージの rows を確認（遷移テスト用）
