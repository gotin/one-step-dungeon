// Phase 9-3 (a): tutorial sword placement + orphan item cleanup
import { readFileSync, writeFileSync } from 'fs';

const PATH = 'outputs/blade-of-lumia/work/blade-of-lumia.json';
const data = JSON.parse(readFileSync(PATH, 'utf8'));

// 1. Add wood sword to village field/7,14 — row1,col6 (north exit corridor = semi-forced pickup)
const village = data.layers.field.stages['7,14'];
village.floorItems['1,6'] = { name: '木の剣', swordTier: 0 };

// 2. Remove orphan boomerang chest from village (no B tile = dead data)
delete village.chestContents['7,6'];

// 3. Remove duplicate wood sword floorItem from field/12,2
const s122 = data.layers.field.stages['12,2'];
delete s122.floorItems['4,8'];

// 4. Remove duplicate wood sword chest from field/2,4 + clear the B tile
const s24 = data.layers.field.stages['2,4'];
delete s24.chestContents['8,10'];
s24.tiles[8][10] = '.';

// 5. Remove orphan mirror shield floorItem from dark_tower/0,1
const dt01 = data.layers.dark_tower.stages['0,1'];
delete dt01.floorItems['1,9'];

writeFileSync(PATH, JSON.stringify(data, null, 2));
console.log('done');
