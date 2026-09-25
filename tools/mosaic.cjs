// Photo to LEGO mosaic from the command line, through mosaic.html in headless Chromium.
//   node tools/mosaic.cjs photo.jpg [--size 64] [--colors 12] [--shape mixed|round|square] [--dither 0.5]
//        [--contrast 0.5] [--sharpen 0.5] [--palette portrait|all] [--zoom 1] [--dx 0] [--dy 0]
//        [--video] [--format horizontal|vertical] [--name portrait]
// Writes exports/<name>-compare.png (photo, grid, LEGO), <name>-lego.png, <name>-map.png,
// <name>-parts.md and with --video <name>-build.mp4 (or -build-vertical.mp4).
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const photo = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || args[i - 1] === '--video'));
if (!photo) {
  console.error('usage: node tools/mosaic.cjs photo.jpg [--size 64] [--video] ...');
  process.exit(1);
}
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const num = ['size', 'colors', 'dither', 'contrast', 'sharpen', 'brightness', 'saturation', 'zoom', 'dx', 'dy'];
const opts = {};
for (const k of num) if (arg('--' + k) != null) opts[k] = Number(arg('--' + k));
for (const k of ['shape', 'palette']) if (arg('--' + k) != null) opts[k] = arg('--' + k);
const name = arg('--name', path.basename(photo).replace(/\.[^.]+$/, ''));
const format = arg('--format', 'horizontal');
const out = path.resolve(__dirname, '../exports');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../mosaic.html') + '?render=1');
  await page.waitForFunction(() => window.READY === true);
  const ext = path.extname(photo).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const dataURL = `data:image/${ext};base64,` + fs.readFileSync(photo).toString('base64');
  await page.evaluate((u) => window.MOSAIC_APP.load(u), dataURL);
  await page.evaluate((o) => window.MOSAIC_APP.set(o), opts);
  const t = Date.now();
  const sum = await page.evaluate(() => window.MOSAIC_APP.run());
  console.log(`${sum.n}x${sum.n}, ${sum.colors} colours, ${Date.now() - t} ms`);

  for (const kind of ['compare', 'lego', 'map']) {
    const b64 = await page.evaluate((k) => window.MOSAIC_APP.png(k).slice(22), kind);
    fs.writeFileSync(path.join(out, `${name}-${kind}.png`), Buffer.from(b64, 'base64'));
  }
  const lines = sum.parts.map((p) => `| ${p.n} | ${p.ru} (${p.name}) | ${p.part} | ${p.count} |`);
  fs.writeFileSync(
    path.join(out, `${name}-parts.md`),
    `# Детали портрета ${sum.n}×${sum.n}\n\n| № | Цвет | Деталь | Штук |\n|---|---|---|---|\n${lines.join('\n')}\n| | Black | 91405 пластина 16×16 | ${sum.plates} |\n`
  );
  console.log('pictures and parts list in', out);

  if (args.includes('--video')) {
    const f = await page.evaluate((fm) => window.MOSAIC_APP.film(fm), format);
    const fps = 30;
    const frames = Math.round(f.duration * fps);
    const file = path.join(out, `${name}-build${format === 'vertical' ? '-vertical' : ''}.mp4`);
    const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t1 = Date.now();
    for (let i = 0; i < frames; i++) {
      const b64 = await page.evaluate((tt) => { window.drawAt(tt); return window.CANVAS.toDataURL('image/png').slice(22); }, i / fps);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 60 === 0) console.log(`frame ${i}/${frames}`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log(`${file} (${frames} frames, ${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
