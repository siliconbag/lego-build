/*
 * parts-sheet.js
 * Inventory page of every part in LEGO.LIB, in the booklet's style. 1920 x 1500.
 * Open index.html?view=parts to see it.
 */
(function (root) {
  'use strict';

  const LEGO = root.LEGO;
  const W = 1920;
  const H = 1500;
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const INK = '#1F2328';
  const COLS = 8;
  const TINTS = ['red', 'blue', 'yellow', 'green', 'orange', 'azure', 'lime', 'white', 'lbg', 'dbg', 'tan', 'blo', 'darkOrange', 'black'];

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(ctx) {
    const ids = LEGO.ORDER;
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = INK;
    ctx.font = 'bold 60px ' + FONT;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Детали', 80, 112);
    ctx.fillStyle = '#5B6470';
    ctx.font = '28px ' + FONT;
    ctx.fillText(ids.length + ' деталей lego.js, номера по каталогу BrickLink. Каждая нарисована кодом', 80, 160);

    const gap = 16;
    const x0 = 80;
    const y0 = 200;
    const rows = Math.ceil(ids.length / COLS);
    const cw = (W - 2 * x0 - (COLS - 1) * gap) / COLS;
    const ch = (H - y0 - 60 - (rows - 1) * gap) / rows;
    ids.forEach((id, i) => {
      const x = x0 + (i % COLS) * (cw + gap);
      const y = y0 + Math.floor(i / COLS) * (ch + gap);
      rrect(ctx, x, y, cw, ch, 12);
      ctx.fillStyle = '#F7F9FC';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#D4DBE5';
      ctx.stroke();
      const spec = { id, color: TINTS[i % TINTS.length] };
      const e = LEGO.partSize(spec, 45, 30);
      const art = ch - 78;
      const s = Math.min(40, (cw - 36) / e.w, (art - 16) / e.h);
      LEGO.drawPart(ctx, spec, x + cw / 2, y + 8 + art / 2, s, { theta: 45, phi: 30 });
      ctx.fillStyle = INK;
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillText(id, x + 14, y + ch - 44);
      ctx.fillStyle = '#39414B';
      let size = 17;
      ctx.font = size + 'px ' + FONT;
      while (size > 12 && ctx.measureText(LEGO.LIB[id].ru).width > cw - 26) ctx.font = --size + 'px ' + FONT;
      ctx.fillText(LEGO.LIB[id].ru, x + 14, y + ch - 18);
    });
    ctx.restore();
  }

  root.PARTS_SHEET = { W, H, draw };
})(typeof window !== 'undefined' ? window : globalThis);
