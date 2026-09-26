// Photo to LEGO mosaic from the command line, through mosaic.html in headless Chromium.
//   node tools/mosaic.cjs photo.jpg [--size 64] [--colors 12] [--shape mixed|round|square] [--dither 0.5]
//        [--contrast 0.5] [--sharpen 0.5] [--saturation 0.9] [--brightness 0] [--palette portrait|all]
//        [--zoom 1] [--dx 0] [--dy 0] [--video] [--frames 3,9,15] [--format horizontal|vertical]
//        [--name portrait] [--out folder]
// Writes into --out (default: exports/ of this project) <name>-compare.png (photo, grid, LEGO),
// <name>-lego.png, <name>-map.png, <name>-parts.md, with --frames single film frames
// <name>-frame-<t>.png, and with --video <name>-build.mp4 (or <name>-build-vertical.mp4).
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const USAGE = 'usage: node tools/mosaic.cjs photo.jpg [--size 64] [--video] [--format vertical] ... (see the top of this file)';
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const args = process.argv.slice(2);
const WITH_VALUE = new Set(['--size', '--colors', '--shape', '--dither', '--contrast', '--sharpen', '--saturation', '--brightness',
  '--palette', '--zoom', '--dx', '--dy', '--frames', '--format', '--name', '--out']);
const FLAGS = new Set(['--video']);
const values = {};
const loose = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (WITH_VALUE.has(a)) {
    if (i + 1 >= args.length) fail(`${a} needs a value\n${USAGE}`);
    values[a.slice(2)] = args[++i];
  } else if (FLAGS.has(a)) values[a.slice(2)] = true;
  else if (a.startsWith('--')) fail(`unknown option ${a}\n${USAGE}`);
  else loose.push(a);
}
if (loose.length !== 1) fail(USAGE);
const photo = path.resolve(loose[0]);
if (!fs.existsSync(photo)) fail(`no such file: ${photo}`);

// options go to MOSAIC.build as they are, so check them here
const RANGES = {
  size: [16, 256], colors: [1, 42], dither: [0, 1], contrast: [0, 1], sharpen: [0, 2], saturation: [0, 3],
  brightness: [-50, 50], zoom: [1, 20], dx: [-0.5, 0.5], dy: [-0.5, 0.5],
};
const opts = {};
for (const [k, [lo, hi]] of Object.entries(RANGES)) {
  if (values[k] == null) continue;
  const v = Number(values[k]);
  if (!Number.isFinite(v) || v < lo || v > hi) fail(`--${k} must be a number from ${lo} to ${hi}, got ${values[k]}`);
  opts[k] = v;
}
if (opts.size != null && opts.size % 16) fail(`--size must be a multiple of 16 (the base is made of 16 x 16 plates), got ${opts.size}`);
if (opts.colors != null) opts.colors = Math.round(opts.colors);
const ENUMS = { shape: ['mixed', 'round', 'square'], palette: ['portrait', 'all'], format: ['horizontal', 'vertical'] };
for (const [k, list] of Object.entries(ENUMS)) {
  if (values[k] != null && !list.includes(values[k])) fail(`--${k} must be one of ${list.join(', ')}, got ${values[k]}`);
}
for (const k of ['shape', 'palette']) if (values[k] != null) opts[k] = values[k];
const format = values.format || 'horizontal';
const frames = (values.frames || '').split(',').filter(Boolean).map(Number);
if (frames.some((t) => !Number.isFinite(t) || t < 0)) fail('--frames takes times in seconds, like 3,9,15');

const MIME = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif', bmp: 'bmp', avif: 'avif', svg: 'svg+xml' };
const ext = path.extname(photo).slice(1).toLowerCase();
if (!MIME[ext]) fail(`cannot read .${ext} photos, save it as JPEG, PNG or WebP (HEIC from an iPhone is not supported)`);

const name = values.name || path.basename(photo).replace(/\.[^.]+$/, '');
const out = path.resolve(values.out || path.join(__dirname, '../exports'));
fs.mkdirSync(out, { recursive: true });

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  fail('Playwright is missing: run npm install and npx playwright install chromium in this folder');
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname, '../mosaic.html')).href + '?render=1');
  await page.waitForFunction(() => window.READY === true);
  const dataURL = `data:image/${MIME[ext]};base64,` + fs.readFileSync(photo).toString('base64');
  const loaded = await page.evaluate((u) => window.MOSAIC_APP.load(u).then(() => '', (e) => (e && e.message) || 'cannot decode'), dataURL);
  if (loaded) {
    await browser.close();
    fail(`cannot open ${photo}: ${loaded}`);
  }
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

  if (frames.length) {
    const f = await page.evaluate((fm) => window.MOSAIC_APP.film(fm), format);
    for (const tt of frames) {
      const b64 = await page.evaluate((x) => { window.drawAt(x); return window.CANVAS.toDataURL('image/png').slice(22); }, Math.min(tt, f.duration));
      const file = path.join(out, `${name}${format === 'vertical' ? '-vertical' : ''}-frame-${tt}.png`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(file);
    }
  }

  if (values.video) {
    const f = await page.evaluate((fm) => window.MOSAIC_APP.film(fm), format);
    const fps = 30;
    const count = Math.round(f.duration * fps);
    const file = path.join(out, `${name}-build${format === 'vertical' ? '-vertical' : ''}.mp4`);
    const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    let broken = null;
    ff.on('error', (e) => (broken = e));
    ff.stdin.on('error', (e) => (broken = broken || e));
    const closed = new Promise((r) => ff.on('close', r));
    const t1 = Date.now();
    for (let i = 0; i < count && !broken; i++) {
      const b64 = await page.evaluate((tt) => { window.drawAt(tt); return window.CANVAS.toDataURL('image/png').slice(22); }, i / fps);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), closed]);
      if (i % 60 === 0) console.log(`frame ${i}/${count}`);
    }
    ff.stdin.end();
    const code = await closed;
    await browser.close();
    if (broken && broken.code === 'ENOENT') fail('ffmpeg not found: install it or set FFMPEG to its path');
    if (broken || code !== 0) fail(`ffmpeg failed${code != null ? ' with code ' + code : ''}${broken ? ': ' + broken.message : ''}`);
    console.log(`${file} (${count} frames, ${((Date.now() - t1) / 1000).toFixed(1)} s)`);
    return;
  }
  await browser.close();
})().catch((e) => fail(e && e.message ? e.message : String(e)));
