import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('work/blade-of-lumia.json', 'utf8'));
// 石タイル 'o'（TILE.STONE）を含むステージを探す
for (const [lk, ld] of Object.entries(data.layers ?? {})) {
  for (const [sk, sd] of Object.entries(ld.stages ?? {})) {
    const tiles = sd.tiles ?? [];
    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        if (tiles[r][c] === '*') {
          console.log(`STONE at layer=${lk} stage=${sk} r=${r} c=${c} (cols=${sd.cols} rows=${sd.rows})`);
        }
      }
    }
  }
}
