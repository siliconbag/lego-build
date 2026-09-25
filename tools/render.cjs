// Render a whole film to exports/<model>.mp4, or <model>-16x9.mp4 when horizontal (30 fps, H.264).
//   node tools/render.cjs [--model cat] [--format horizontal] [--fps 30] [--out exports/cat.mp4]
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};

(async () => {
  const fps = Number(arg('--fps', 30));
  const model = arg('--model', 'cat');
  const format = arg('--format', 'vertical');
  const out = path.resolve(__dirname, '..', arg('--out', `exports/${model}${format === 'horizontal' ? '-16x9' : ''}.mp4`));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?render=1&model=' + model + '&format=' + format);
  await page.waitForFunction(() => window.READY === true);
  const dur = await page.evaluate(() => window.VIEW.duration);
  const n = Math.round(dur * fps);
  const ff = spawn(process.env.FFMPEG || 'ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate((t) => { window.drawAt(t); return window.CANVAS.toDataURL('image/png').slice(22); }, i / fps);
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${n}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  console.log(`${out} (${n} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
})().catch((e) => { console.error(e); process.exit(1); });
