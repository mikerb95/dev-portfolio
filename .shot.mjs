import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://localhost:4321/docs/presentacion', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const slides = await p.evaluate(() => document.querySelectorAll('.slides > section').length);
console.log('top-level slides:', slides);
for (const [i, s] of [0, 2, 6, 9, 12].entries()) {
  await p.goto(`http://localhost:4321/docs/presentacion#/${s}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `slide-${s}.png` });
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
