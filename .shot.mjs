import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

// Slide de KPIs: avanzar los fragments para verla completa
await p.goto('http://localhost:4321/docs/presentacion#/2', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); }
await p.screenshot({ path: 'shot-kpi.png' });

for (const s of [0, 6, 11]) {
  await p.goto(`http://localhost:4321/docs/presentacion#/${s}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  if (s === 11) for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250); }
  await p.screenshot({ path: `shot-${s}.png` });
}

// Overflow: ¿alguna slide se sale del viewport?
await p.goto('http://localhost:4321/docs/presentacion', { waitUntil: 'networkidle' });
await p.waitForTimeout(600);
const over = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('.slides section').forEach((s, i) => {
    if (s.querySelector('section')) return;
    if (s.scrollHeight > 700) out.push(`${i}: ${s.scrollHeight}px`);
  });
  return out;
});
console.log('slides que exceden 700px de alto:', over.length ? over : 'ninguna');
console.log('errores:', errs.length ? errs : 'ninguno');
await b.close();
