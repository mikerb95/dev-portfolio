import { chromium } from '@playwright/test';
const dir = process.argv[2];
const b = await chromium.launch();
const rutas = ['/en/', '/tools', '/notes', '/lab', '/security', '/paginas-web', '/contact'];
for (const r of rutas) {
  const p = await b.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:4321' + r, { waitUntil: 'networkidle' });
  const m = await p.evaluate(() => {
    const de = document.documentElement;
    const over = de.scrollWidth > de.clientWidth;
    let culpables = [];
    if (over) {
      for (const el of document.querySelectorAll('body *')) {
        const rc = el.getBoundingClientRect();
        if (rc.right > de.clientWidth + 1 && rc.width > 0)
          culpables.push(el.tagName + '.' + (el.className.toString().slice(0, 60)) + ' right=' + Math.round(rc.right));
      }
    }
    const bar = document.querySelector('header > div');
    return { over, barOver: bar ? bar.scrollWidth > bar.clientWidth : null, culpables: culpables.slice(0, 6) };
  });
  console.log(r, JSON.stringify(m));
  if (r === '/en/') await p.screenshot({ path: `${dir}/nav-en-360.png`, clip: { x: 0, y: 0, width: 360, height: 90 } });
  await p.close();
}
await b.close();
