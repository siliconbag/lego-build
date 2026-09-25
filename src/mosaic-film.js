/*
 * mosaic-film.js
 * Draws a MOSAIC.build() result with lego.js: black 16 x 16 plates, a tile on every stud.
 *
 *   MOSAIC.drawTop(ctx, res, x, y, size)          the finished mosaic seen from above
 *   MOSAIC.drawMap(ctx, res, x, y, cell)           the build map: symbol per stud, 16 x 16 sections
 *   MOSAIC.film(res, photo, { format })             { W, H, duration, draw(ctx, t) }
 *
 * The film: plates land, tiles rain onto them row by row until the face appears, the camera
 * rises to straight above, and the photo slides in next to the portrait for comparison.
 * A frame is a pure function of time.
 */
(function (root) {
  'use strict';

  const LEGO = root.LEGO;
  const MOSAIC = root.MOSAIC;
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const INK = '#1F2328';
  const PLATE_RGB = [22, 26, 30]; // black plate, a touch lifted so its studs read
  const TOP_LIGHT = [-0.25, 0.35, 1];

  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const inOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const lerp = (a, b, u) => a + (b - a) * u;

  function plural(n, forms) {
    const a = n % 100;
    const b = n % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    if (b >= 2 && b <= 4) return forms[1];
    return forms[2];
  }

  // Placed parts for a mosaic: the image's top row is the far edge (largest y), so it reads upright from above.
  MOSAIC.scene = function scene(res) {
    const n = res.n;
    const plates = [];
    for (let by = 0; by < n / 16; by++) {
      for (let bx = 0; bx < n / 16; bx++) plates.push(LEGO.place({ id: '91405', rgb: PLATE_RGB, at: [bx * 16, by * 16, 0] }));
    }
    const tiles = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const k = res.cands[res.cells[row * n + col]];
        tiles.push(LEGO.place({ id: k.part, rgb: k.rgb, at: [col, n - 1 - row, 1] }));
      }
    }
    return { n, plates, tiles };
  };

  function topCam(n, cx, cy, size) {
    return LEGO.camera({ theta: 0, phi: 90, scale: size / n, cx, cy, target: [n / 2, n / 2, 0.4], light: TOP_LIGHT });
  }

  const drawOpts = (scale) => ({ fast: true, edgeAlpha: 0.35, lineWidth: Math.max(0.5, scale * 0.03) });

  MOSAIC.drawTop = function drawTop(ctx, res, x, y, size, sc) {
    const s = sc || MOSAIC.scene(res);
    const cam = topCam(s.n, x + size / 2, y + size / 2, size);
    const items = s.plates.map((part) => ({ part, base: true })).concat(s.tiles.map((part) => ({ part })));
    LEGO.draw(ctx, items, cam, drawOpts(cam.scale));
  };

  // Build map in the LEGO Art way: every stud shows the number of its colour, sections of 16 x 16.
  MOSAIC.drawMap = function drawMap(ctx, res, x, y, cell) {
    const n = res.n;
    ctx.save();
    ctx.fillStyle = '#20252B';
    ctx.fillRect(x, y, n * cell, n * cell);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(cell * 0.46) + 'px ' + FONT;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const k = res.cells[row * n + col];
        const c = res.cands[k];
        const cx = x + col * cell + cell / 2;
        const cy = y + row * cell + cell / 2;
        ctx.beginPath();
        if (c.shape === 'r') ctx.arc(cx, cy, cell * 0.44, 0, 2 * Math.PI);
        else ctx.rect(cx - cell * 0.45, cy - cell * 0.45, cell * 0.9, cell * 0.9);
        ctx.fillStyle = c.color.hex;
        ctx.fill();
        const lum = 0.299 * c.rgb[0] + 0.587 * c.rgb[1] + 0.114 * c.rgb[2];
        ctx.fillStyle = lum > 140 ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.82)';
        ctx.fillText(String(res.symbolOf.get(k)), cx, cy + 0.5);
      }
    }
    ctx.strokeStyle = '#FFD21A';
    ctx.lineWidth = Math.max(1.5, cell * 0.12);
    for (let i = 0; i <= n; i += 16) {
      ctx.beginPath();
      ctx.moveTo(x + i * cell, y);
      ctx.lineTo(x + i * cell, y + n * cell);
      ctx.moveTo(x, y + i * cell);
      ctx.lineTo(x + n * cell, y + i * cell);
      ctx.stroke();
    }
    ctx.restore();
  };

  MOSAIC.film = function film(res, photo, o) {
    const opt = Object.assign({ format: 'horizontal', title: 'Портрет из LEGO' }, o || {});
    const LAND = opt.format !== 'vertical';
    const W = LAND ? 1920 : 1080;
    const H = LAND ? 1080 : 1920;
    const sc = MOSAIC.scene(res);
    const n = sc.n;
    const N = n * n;

    // timing
    const T_PLATES = 1.0;
    const BUILD = 10;
    const FALL = 0.3;
    const T_BUILT = T_PLATES + BUILD;
    const T_TOP = T_BUILT + 2.0;
    const T_SIDE = T_TOP + 1.1;
    const DURATION = T_SIDE + 2.6;

    // tiles land in a slanted sweep from the top of the portrait, a little shuffled
    const hash = (i) => {
      let h = Math.imul(i + 1, 0x9e3779b1) ^ 0x5bd1e995;
      h ^= h >>> 15;
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      return (h >>> 0) / 4294967296;
    };
    const SLANT = 0.35;
    const keys = [];
    for (let i = 0; i < N; i++) keys.push([Math.floor(i / n) + (i % n) * SLANT + hash(i) * 1.2, i]);
    keys.sort((a, b) => a[0] - b[0]);
    const start = new Float32Array(N);
    keys.forEach(([, i], rank) => (start[i] = T_PLATES + (rank / N) * (BUILD - FALL)));
    const KEY_MAX = keys[N - 1][0];

    // cameras. Plates land in an overview, then the camera dives in low and close and flies with
    // the building front, pulling up as it goes; at the end it rises straight above the face and
    // finally moves aside for the photo.
    const fitAt = (theta, phi, aw, ah) => {
      const b = { min: [0, 0, 0], max: [n, n, 0.8], center: [n / 2, n / 2, 0.4] };
      const e = LEGO.extent(b, theta, phi);
      return Math.min(aw / e.w, ah / e.h);
    };
    const S_BIG = LAND ? 840 : 960;
    const S_PAIR = LAND ? 800 : 740;
    const photoAt = LAND ? [W / 2 - 40 - S_PAIR / 2, H / 2 + 10] : [W / 2, 200 + S_PAIR / 2];
    const legoAt = LAND ? [W / 2 + 40 + S_PAIR / 2, H / 2 + 10] : [W / 2, 200 + S_PAIR * 1.5 + 100];
    const center = [W / 2, LAND ? H / 2 + 50 : H / 2 + 40];
    const OVER = { theta: 12, phi: 50, scale: fitAt(12, 50, LAND ? 1500 : 980, LAND ? 860 : 1300), target: [n / 2, n / 2, 0.4] };
    const CLOSE = (LAND ? W : H) / 26; // about 26 studs across the frame
    const WIDE = fitAt(18, 60, LAND ? 1600 : 1000, LAND ? 900 : 1400);

    // where the camera looks while flying: just behind the front, drifting left and right
    function flight(p) {
      const k = p * KEY_MAX;
      const row = Math.max(0, Math.min(n - 1, k - SLANT * n * 0.5));
      const pull = Math.pow(p, 1.8);
      const target = [n / 2 + n * 0.26 * Math.sin(Math.PI * (1.6 * p - 0.5)) * (1 - pull), lerp(n - 1 - row + 2.5, n / 2, pull), 0.4];
      return { theta: lerp(-20, 18, p), phi: lerp(36, 60, pull), scale: lerp(CLOSE, WIDE, pull), target };
    }

    const cams = (a, b, u) => ({
      theta: lerp(a.theta, b.theta, u), phi: lerp(a.phi, b.phi, u), scale: lerp(a.scale, b.scale, u),
      target: [0, 1, 2].map((k) => lerp(a.target[k], b.target[k], u)),
    });
    const cam = (c, cx, cy, light) => LEGO.camera({ theta: c.theta, phi: c.phi, scale: c.scale, cx, cy, target: c.target, light });

    function camAt(t) {
      if (t < T_PLATES) return cam(OVER, center[0], center[1]);
      if (t < T_BUILT) {
        const p = (t - T_PLATES) / BUILD;
        const f = flight(p);
        const dive = inOut(clamp((t - T_PLATES) / 1.4));
        return cam(cams(OVER, f, dive), center[0], center[1]);
      }
      const TOP = { theta: 0, phi: 90, scale: S_BIG / n, target: [n / 2, n / 2, 0.4] };
      if (t < T_TOP) {
        const u = inOut(clamp((t - T_BUILT) / (T_TOP - T_BUILT)));
        return cam(cams(flight(1), TOP, u), center[0], center[1], u > 0.5 ? TOP_LIGHT : undefined);
      }
      const u = inOut(clamp((t - T_TOP) / (T_SIDE - T_TOP)));
      return cam({ theta: 0, phi: 90, scale: lerp(S_BIG, S_PAIR, u) / n, target: TOP.target }, lerp(center[0], legoAt[0], u), lerp(center[1], legoAt[1], u), TOP_LIGHT);
    }

    function itemsAt(t) {
      const items = [];
      sc.plates.forEach((part, i) => {
        const t0 = i * (0.5 / sc.plates.length);
        if (t < t0) return;
        const u = clamp((t - t0) / 0.3);
        items.push({ part, base: true, move: [0, 0, 3 * (1 - u * u)], alpha: clamp(u / 0.2) });
      });
      for (let i = 0; i < N; i++) {
        if (t < start[i]) continue;
        const u = clamp((t - start[i]) / FALL);
        items.push({ part: sc.tiles[i], move: u < 1 ? [0, 0, 2.2 * (1 - u * u)] : undefined, alpha: clamp(u / 0.12) });
      }
      return items;
    }

    const COUNT = N + sc.plates.length;
    const subtitle =
      COUNT + ' ' + plural(COUNT, ['деталь', 'детали', 'деталей']) + ' · ' + res.colorsUsed + ' ' +
      plural(res.colorsUsed, ['цвет', 'цвета', 'цветов']) + ' · ' + n + '×' + n;

    function text(ctx, str, x, y, size, color, align, weight) {
      ctx.font = (weight || '') + ' ' + size + 'px ' + FONT;
      ctx.fillStyle = color;
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(str, x, y);
    }

    function draw(ctx, t) {
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      // the photo comes up from under the portrait as it moves aside
      const side = clamp((t - T_TOP) / (T_SIDE - T_TOP));
      if (side > 0 && photo) {
        const u = inOut(side);
        ctx.save();
        ctx.globalAlpha = u * u;
        const px = photoAt[0] - S_PAIR / 2 + (1 - u) * 80;
        const py = photoAt[1] - S_PAIR / 2;
        ctx.drawImage(photo, px, py, S_PAIR, S_PAIR);
        text(ctx, 'Фото', px, py + S_PAIR + 44, 30, '#5B6470');
        text(ctx, 'LEGO', legoAt[0] - S_PAIR / 2, legoAt[1] + S_PAIR / 2 + 44, 30, '#5B6470');
        ctx.restore();
      }
      const c = camAt(t);
      const m = c.scale * 3;
      LEGO.draw(ctx, itemsAt(t), c, Object.assign(drawOpts(c.scale), { cull: [-m, -m, W + m, H + m] }));

      // title, running count, footer
      const head = LAND ? [64, 84] : [60, 110];
      let placed = 0;
      for (let i = 0; i < N; i++) if (t >= start[i] + FALL) placed++;
      const done = t >= T_BUILT;
      const line2 = done ? subtitle : placed + ' из ' + N;
      // a paper card under the title, so it reads over the close-ups
      ctx.font = 'bold ' + (LAND ? 44 : 56) + 'px ' + FONT;
      const tw = ctx.measureText(opt.title).width;
      ctx.font = (LAND ? 28 : 34) + 'px ' + FONT;
      const bw = Math.max(tw, ctx.measureText(line2).width) + 48;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(head[0] - 24, head[1] - (LAND ? 58 : 72), bw, LAND ? 124 : 150, 18);
      ctx.fill();
      ctx.restore();
      text(ctx, opt.title, head[0], head[1], LAND ? 44 : 56, INK, 'left', 'bold');
      text(ctx, line2, head[0], head[1] + (LAND ? 46 : 60), LAND ? 28 : 34, '#5B6470');
      text(ctx, 'Нарисовано кодом · Canvas 2D', LAND ? W - 64 : W / 2, H - (LAND ? 40 : 60), 24, '#8A919B', LAND ? 'right' : 'center');
      ctx.restore();
    }

    return { W, H, duration: DURATION, draw, parts: COUNT };
  };
})(typeof window !== 'undefined' ? window : globalThis);
