import { chromium } from '@playwright/test';
const dir = process.argv[2];
const b = await chromium.launch();
// panel abierto en móvil
let p = await b.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
await p.click('#navbar-toggle');
await p.waitForTimeout(300);
await p.screenshot({ path: `${dir}/panel-360.png`, clip: { x: 0, y: 0, width: 360, height: 620 } });
await p.close();
// escritorio
p = await b.newPage({ viewport: { width: 1280, height: 700 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
await p.screenshot({ path: `${dir}/nav-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 90 } });
await p.close();
// tablet 768 (nav de escritorio aún oculto, lang visible)
p = await b.newPage({ viewport: { width: 768, height: 700 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
await p.screenshot({ path: `${dir}/nav-768.png`, clip: { x: 0, y: 0, width: 768, height: 90 } });
await p.close();
await b.close();
