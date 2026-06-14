// ゲームページのコンソールエラーを確認するスクリプト
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
const logs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });

await page.goto('http://localhost:18080/blade-of-lumia/game/');
await page.waitForTimeout(5000);

console.log('=== Page errors ===');
errors.forEach(e => console.log(e));
console.log('=== Console errors ===');
logs.forEach(l => console.log(l));

await browser.close();
