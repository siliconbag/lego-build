// Render single frames to PNG.
//   node tools/snap.cjs 0.5 3 8.2 [--model cat] [--format horizontal]  -> exports/<model>-<t>.png
//   node tools/snap.cjs --parts                  -> exports/parts.png
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const args = process.argv.slice(2);
  const parts = args.includes('--parts');
  const opt = (name, def) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : def);
  const model = opt('--model', 'cat');
  const format = opt('--format', 'vertical');
  const skip = new Set(['--model', '--format'].map((n) => args.indexOf(n) + 1).filter((i) => i > 0));
  const times = args.filter((a, i) => !a.startsWith('--') && !skip.has(i)).map(Number);
  const out = path.resolve(__dirname, '../exports');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  const url = 'file://' + path.resolve(__dirname, '../index.html') + '?render=1' + (parts ? '&view=parts' : '&model=' + model + '&format=' + format);
  await page.goto(url);
  await page.waitForFunction(() => window.READY === true);
  const list = parts ? [0] : times;
  for (const t of list) {
    const ms = await page.evaluate((tt) => { const a = Date.now(); window.drawAt(tt); return Date.now() - a; }, t);
    const b64 = await page.evaluate(() => window.CANVAS.toDataURL('image/png').slice(22));
    const file = path.join(out, parts ? 'parts.png' : `${model}-${t.toFixed(2)}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(file, ms + ' ms');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
