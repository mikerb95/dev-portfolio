import { chromium } from '@playwright/test';
const dir = process.argv[2];
const b = await chromium.launch();
for (const w of [320, 360, 390, 430, 640]) {
  const p = await b.newPage({ viewport: { width: w, height: 700 }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await p.screenshot({ path: `${dir}/nav-${w}.png`, clip: { x: 0, y: 0, width: w, height: 90 } });
  const m = await p.evaluate(() => {
    const bar = document.querySelector('header > div');
    return { scrollW: bar.scrollWidth, clientW: bar.clientWidth, docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  console.log(w, JSON.stringify(m));
  await p.close();
}
await b.close();
