import { readFileSync } from 'fs';
const src = readFileSync('/Users/go/Documents/Codex/2026-05-30/ios/outputs/sword-duel/game.js', 'utf8');

// フレーム1の行データを抽出
const frameMatch = src.match(/const SPRITE_HERO_R = \[\n\t\[\n([\s\S]*?)\n\t\],/);
const rows = frameMatch[1].split('\n').filter(r => r.trim().startsWith('['));

let firstRow = -1, lastRow = -1;
for (let i = 0; i < rows.length; i++) {
  if (rows[i].replace(/[,\[\]0\s]/g, '').length > 0) {
    if (firstRow === -1) firstRow = i;
    lastRow = i;
  }
}
console.log('Total rows:', rows.length);
console.log('First non-empty row:', firstRow);
console.log('Last non-empty row:', lastRow);
console.log('Top blank rows:', firstRow);
console.log('Bottom blank rows:', rows.length - 1 - lastRow);
console.log('Visual height (rows):', lastRow - firstRow + 1);
