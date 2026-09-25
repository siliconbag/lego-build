/*
 * mosaic.js
 * Photo to LEGO mosaic, the way LEGO Art portraits are made. The photo is cropped square,
 * shrunk to a grid of studs, and every stud gets a real LEGO part and colour, round tile 1x1
 * (98138) or tile 1x1 (3070), so that from a few steps away the mosaic looks like the photo.
 *
 * - colours are compared in CIELAB with CIEDE2000, close to how the eye judges differences;
 * - the palette is picked per photo: the few LEGO colours that explain this photo best;
 * - dithering (Floyd-Steinberg, in linear light) mixes neighbouring tiles into in-between tones;
 * - a round tile leaves the black plate showing around it, so it is matched as that mix.
 *
 *   const res = MOSAIC.build({ data, width, height }, { size: 64, colors: 12 });
 *   res.cells[row * res.n + col] -> index into res.cands (colour, shape, rgb)
 *
 * Pure maths on RGBA arrays, no DOM: runs in the browser and in Node.
 */
(function (root) {
  'use strict';

  const MOSAIC = (root.MOSAIC = root.MOSAIC || {});
  const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

  // Solid colours the 1x1 tiles are made in (BrickLink catalogue, checked 25.09.2026).
  // r = round tile 1x1 (98138), s = tile 1x1 (3070). Discontinued, neon and new colours with
  // uncertain RGB are left out. RGB values after Rebrickable / LDraw.
  const COLORS = [
    ['White', 'Белый', 'FFFFFF', 'rs'],
    ['Light Bluish Gray', 'Светло-серый', 'A0A5A9', 'rs'],
    ['Dark Bluish Gray', 'Темно-серый', '6C6E68', 'rs'],
    ['Black', 'Черный', '05131D', 'rs'],
    ['Light Nougat', 'Светлый нуга', 'F6D7B3', 'rs'],
    ['Very Light Orange', 'Очень светлый оранжевый', 'F3CF9B', 's'],
    ['Tan', 'Бежевый', 'E4CD9E', 'rs'],
    ['Nougat', 'Нуга', 'D09168', 'rs'],
    ['Medium Nougat', 'Средний нуга', 'AA7D55', 'rs'],
    ['Dark Tan', 'Темно-бежевый', '958A73', 'rs'],
    ['Reddish Brown', 'Красно-коричневый', '582A12', 'rs'],
    ['Dark Brown', 'Темно-коричневый', '352100', 'rs'],
    ['Dark Orange', 'Темно-оранжевый', 'A95500', 'rs'],
    ['Orange', 'Оранжевый', 'FE8A18', 'rs'],
    ['Bright Light Orange', 'Светло-оранжевый', 'F8BB3D', 'rs'],
    ['Yellow', 'Желтый', 'F2CD37', 'rs'],
    ['Bright Light Yellow', 'Светло-желтый', 'FFF03A', 'rs'],
    ['Coral', 'Коралловый', 'FF698F', 'rs'],
    ['Red', 'Красный', 'C91A09', 'rs'],
    ['Dark Red', 'Темно-красный', '720E0F', 'rs'],
    ['Bright Pink', 'Светло-розовый', 'E4ADC8', 'rs'],
    ['Dark Pink', 'Темно-розовый', 'C870A0', 'rs'],
    ['Magenta', 'Пурпурный', '923978', 'rs'],
    ['Lavender', 'Лавандовый', 'E1D5ED', 'rs'],
    ['Medium Lavender', 'Средний лавандовый', 'AC78BA', 'rs'],
    ['Dark Purple', 'Темно-фиолетовый', '3F3691', 'rs'],
    ['Yellowish Green', 'Желто-зеленый', 'DFEEA5', 'rs'],
    ['Lime', 'Лаймовый', 'BBE90B', 'rs'],
    ['Olive Green', 'Оливковый', '9B9A5A', 'rs'],
    ['Sand Green', 'Песочно-зеленый', 'A0BCAC', 's'],
    ['Bright Green', 'Ярко-зеленый', '4B9F4A', 'rs'],
    ['Green', 'Зеленый', '237841', 'rs'],
    ['Dark Green', 'Темно-зеленый', '184632', 'rs'],
    ['Dark Turquoise', 'Темно-бирюзовый', '008F9B', 'rs'],
    ['Light Aqua', 'Светлая аква', 'ADC3C0', 'rs'],
    ['Bright Light Blue', 'Светло-голубой', '9FC3E9', 'rs'],
    ['Medium Azure', 'Лазурный', '36AEBF', 'rs'],
    ['Dark Azure', 'Темно-лазурный', '078BC9', 'rs'],
    ['Medium Blue', 'Голубой', '5A93DB', 'rs'],
    ['Sand Blue', 'Песочно-синий', '6074A1', 'rs'],
    ['Blue', 'Синий', '0055BF', 'rs'],
    ['Dark Blue', 'Темно-синий', '0A3463', 'rs'],
  ].map(([name, ru, h, shapes], i) => ({ i, name, ru, hex: '#' + h, rgb: hex(h), shapes }));
  MOSAIC.COLORS = COLORS;

  // Portrait palette: neutrals, skin, hair and a few muted background colours.
  // Loud colours, pinks, coral and dark red included, sprinkle stray tiles over cheeks and glasses,
  // so they stay out unless asked for.
  MOSAIC.PORTRAIT = [
    'White', 'Light Bluish Gray', 'Dark Bluish Gray', 'Black', 'Light Nougat', 'Very Light Orange', 'Tan',
    'Nougat', 'Medium Nougat', 'Dark Tan', 'Reddish Brown', 'Dark Brown', 'Dark Orange', 'Bright Light Orange',
    'Sand Blue', 'Light Aqua', 'Sand Green', 'Olive Green',
  ];

  // A black and white photo gets only the neutral tiles, in-between greys come from dithering.
  MOSAIC.GRAYS = ['White', 'Light Bluish Gray', 'Dark Bluish Gray', 'Black'];

  // How much of its stud square a tile covers; the rest shows the plate.
  const SHAPES = {
    r: { id: '98138', ru: 'Круглая плитка 1×1', cover: 0.75 },
    s: { id: '3070', ru: 'Плитка 1×1', cover: 0.95 },
  };
  MOSAIC.SHAPES = SHAPES;
  MOSAIC.PLATE = { id: '91405', ru: 'Пластина 16×16', name: 'Black', rgb: hex('05131D') };

  // ---------------------------------------------------------------- colour science

  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const toByte = (v) => {
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return s <= 0 ? 0 : s >= 1 ? 255 : Math.round(s * 255);
  };
  const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const labFi = (f) => (f * f * f > 216 / 24389 ? f * f * f : (116 * f - 16) / (24389 / 27));

  function labOfLin(r, g, b) {
    const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
    const fx = labF(x / 0.95047);
    const fy = labF(y);
    const fz = labF(z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function linOfLab(L, a, b) {
    const fy = (L + 16) / 116;
    const x = 0.95047 * labFi(fy + a / 500);
    const y = labFi(fy);
    const z = 1.08883 * labFi(fy - b / 200);
    const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
    const bb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
    return [Math.max(0, r), Math.max(0, g), Math.max(0, bb)];
  }

  const D2R = Math.PI / 180;
  // CIEDE2000 colour difference.
  function de2000(L1, a1, b1, L2, a2, b2) {
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cb7 = Math.pow((C1 + C2) / 2, 7);
    const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + 6103515625)));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    let h1p = Math.atan2(b1, a1p) / D2R;
    if (h1p < 0) h1p += 360;
    let h2p = Math.atan2(b2, a2p) / D2R;
    if (h2p < 0) h2p += 360;
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * D2R);
    const Lbp = (L1 + L2) / 2;
    const Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) > 180) hbp += hbp < 360 ? 360 : -360;
      hbp /= 2;
    }
    const T =
      1 - 0.17 * Math.cos((hbp - 30) * D2R) + 0.24 * Math.cos(2 * hbp * D2R) +
      0.32 * Math.cos((3 * hbp + 6) * D2R) - 0.2 * Math.cos((4 * hbp - 63) * D2R);
    const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Cbp7 = Math.pow(Cbp, 7);
    const Rc = 2 * Math.sqrt(Cbp7 / (Cbp7 + 6103515625));
    const L50 = (Lbp - 50) * (Lbp - 50);
    const Sl = 1 + (0.015 * L50) / Math.sqrt(20 + L50);
    const Sc = 1 + 0.045 * Cbp;
    const Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTh * D2R) * Rc;
    const l = dLp / Sl;
    const c = dCp / Sc;
    const h = dHp / Sh;
    return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
  }
  MOSAIC.de2000 = de2000;
  MOSAIC.labOfLin = labOfLin;

  // ---------------------------------------------------------------- the build

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function percentile(arr, p) {
    const s = Float32Array.from(arr).sort();
    return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  }

  // Every (colour, shape) pair allowed, with the colour it shows from afar: tile over black plate.
  function candidates(shape, palette, exclude) {
    const shapes = shape === 'mixed' ? ['r', 's'] : [shape === 'square' ? 's' : 'r'];
    const plate = MOSAIC.PLATE.rgb.map((v) => LIN[v]);
    const out = [];
    for (const c of COLORS) {
      if (palette === 'portrait' && !MOSAIC.PORTRAIT.includes(c.name)) continue;
      if (palette === 'gray' && !MOSAIC.GRAYS.includes(c.name)) continue;
      if (exclude && exclude.includes(c.name)) continue;
      for (const sh of shapes) {
        if (!c.shapes.includes(sh)) continue;
        const f = SHAPES[sh].cover;
        const lin = c.rgb.map((v, k) => f * LIN[v] + (1 - f) * plate[k]);
        out.push({ color: c, shape: sh, part: SHAPES[sh].id, rgb: c.rgb, lin, lab: labOfLin(lin[0], lin[1], lin[2]) });
      }
    }
    return out;
  }

  /*
   * img: { data: RGBA bytes, width, height }
   * o.size   studs per side, a multiple of 16 (the 16 x 16 plates)
   * o.zoom   crop zoom, 1 = the largest centred square; o.dx, o.dy shift it (fractions of the photo)
   * o.contrast 0..1 levels stretch to the palette's range, o.sharpen 0..1, o.saturation, o.brightness (L*)
   * o.colors how many LEGO colours to use, o.palette 'portrait' | 'all', o.shape 'round' | 'square' | 'mixed'
   * o.dither 0..1, o.clean 0..2 passes that drop lone dither specks (lines survive, they have neighbours)
   */
  MOSAIC.build = function build(img, o) {
    const opt = Object.assign(
      { size: 64, zoom: 1, dx: 0, dy: 0, contrast: 0.5, sharpen: 0.5, saturation: 0.9, brightness: 0, colors: 12, palette: 'portrait', shape: 'mixed', dither: 0.5, clean: 1, exclude: [] },
      o || {}
    );
    const n = opt.size;
    const N = n * n;
    const W = img.width;
    const H = img.height;

    // crop square, then average the photo into n x n cells in linear light
    const side = Math.min(W, H) / Math.max(1, opt.zoom);
    const cx = clamp(W / 2 + opt.dx * W, side / 2, W - side / 2);
    const cy = clamp(H / 2 + opt.dy * H, side / 2, H - side / 2);
    const x0 = cx - side / 2;
    const y0 = cy - side / 2;
    const acc = new Float64Array(N * 3);
    const cnt = new Float64Array(N);
    const ys = Math.max(0, Math.floor(y0));
    const ye = Math.min(H, Math.ceil(y0 + side));
    const xs = Math.max(0, Math.floor(x0));
    const xe = Math.min(W, Math.ceil(x0 + side));
    for (let y = ys; y < ye; y++) {
      const gy = Math.floor(((y + 0.5 - y0) / side) * n);
      if (gy < 0 || gy >= n) continue;
      for (let x = xs; x < xe; x++) {
        const gx = Math.floor(((x + 0.5 - x0) / side) * n);
        if (gx < 0 || gx >= n) continue;
        const i = (y * W + x) * 4;
        const c = gy * n + gx;
        acc[c * 3] += LIN[img.data[i]];
        acc[c * 3 + 1] += LIN[img.data[i + 1]];
        acc[c * 3 + 2] += LIN[img.data[i + 2]];
        cnt[c]++;
      }
    }

    const Ls = new Float32Array(N);
    const As = new Float32Array(N);
    const Bs = new Float32Array(N);
    for (let c = 0; c < N; c++) {
      const k = cnt[c] || 1;
      const lab = labOfLin(acc[c * 3] / k, acc[c * 3 + 1] / k, acc[c * 3 + 2] / k);
      Ls[c] = lab[0];
      As[c] = lab[1] * opt.saturation;
      Bs[c] = lab[2] * opt.saturation;
    }

    // a photo with next to no colour is black and white: keep tinted tiles out of it
    let palette = opt.palette;
    if (palette === 'portrait') {
      const chroma = new Float32Array(N);
      for (let c = 0; c < N; c++) chroma[c] = Math.hypot(As[c], Bs[c]);
      if (percentile(chroma, 0.95) < 6) palette = 'gray';
    }
    const cands = candidates(opt.shape, palette, opt.exclude);
    let lo = Infinity;
    let hi = -Infinity;
    for (const k of cands) {
      lo = Math.min(lo, k.lab[0]);
      hi = Math.max(hi, k.lab[0]);
    }

    // levels: stretch the photo's lightness to what the palette can show, then sharpen it
    const p1 = percentile(Ls, 0.01);
    const p99 = percentile(Ls, 0.99);
    const span = Math.max(1, p99 - p1);
    for (let c = 0; c < N; c++) {
      const stretched = lo + ((Ls[c] - p1) / span) * (hi - lo);
      Ls[c] = clamp(Ls[c] + opt.contrast * (stretched - Ls[c]) + opt.brightness, 0, 100);
    }
    if (opt.sharpen > 0) {
      const blur = new Float32Array(N);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          let s = 0;
          let w = 0;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const xx = x + i;
              const yy = y + j;
              if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
              const k = (2 - Math.abs(i)) * (2 - Math.abs(j));
              s += Ls[yy * n + xx] * k;
              w += k;
            }
          }
          blur[y * n + x] = s / w;
        }
      }
      for (let c = 0; c < N; c++) Ls[c] = clamp(Ls[c] + opt.sharpen * 1.5 * (Ls[c] - blur[c]), 0, 100);
    }

    // palette: greedily add the LEGO colour that lowers the total difference the most
    const K = cands.length;
    const dist = new Float32Array(N * K);
    for (let c = 0; c < N; c++) {
      for (let k = 0; k < K; k++) dist[c * K + k] = de2000(Ls[c], As[c], Bs[c], cands[k].lab[0], cands[k].lab[1], cands[k].lab[2]);
    }
    const byColor = new Map();
    cands.forEach((k, idx) => {
      if (!byColor.has(k.color.i)) byColor.set(k.color.i, []);
      byColor.get(k.color.i).push(idx);
    });
    const want = Math.min(opt.colors, byColor.size);
    const best = new Float32Array(N).fill(Infinity);
    const chosen = [];
    while (chosen.length < want) {
      let bestColor = -1;
      let bestTotal = Infinity;
      for (const [ci, idxs] of byColor) {
        if (chosen.includes(ci)) continue;
        let total = 0;
        for (let c = 0; c < N; c++) {
          let m = best[c];
          for (const k of idxs) if (dist[c * K + k] < m) m = dist[c * K + k];
          total += m;
        }
        if (total < bestTotal) {
          bestTotal = total;
          bestColor = ci;
        }
      }
      chosen.push(bestColor);
      for (let c = 0; c < N; c++) for (const k of byColor.get(bestColor)) if (dist[c * K + k] < best[c]) best[c] = dist[c * K + k];
    }
    const use = [];
    for (const ci of chosen) use.push(...byColor.get(ci));

    // dithering: the error each tile leaves spreads to its neighbours, in linear light
    const tgt = [];
    for (let c = 0; c < N; c++) tgt.push(linOfLab(Ls[c], As[c], Bs[c]));
    const err = new Float32Array(N * 3);
    const cells = new Int16Array(N);
    const strength = clamp(opt.dither, 0, 1);
    for (let y = 0; y < n; y++) {
      const ltr = y % 2 === 0;
      for (let s = 0; s < n; s++) {
        const x = ltr ? s : n - 1 - s;
        const c = y * n + x;
        const r = Math.max(0, tgt[c][0] + err[c * 3]);
        const g = Math.max(0, tgt[c][1] + err[c * 3 + 1]);
        const b = Math.max(0, tgt[c][2] + err[c * 3 + 2]);
        const lab = labOfLin(r, g, b);
        let pick = use[0];
        let pd = Infinity;
        for (const k of use) {
          const d = de2000(lab[0], lab[1], lab[2], cands[k].lab[0], cands[k].lab[1], cands[k].lab[2]);
          if (d < pd) {
            pd = d;
            pick = k;
          }
        }
        cells[c] = pick;
        if (!strength) continue;
        const e = [r - cands[pick].lin[0], g - cands[pick].lin[1], b - cands[pick].lin[2]].map((v) => clamp(v * strength, -0.2, 0.2));
        const push = (xx, yy, w) => {
          if (xx < 0 || xx >= n || yy >= n) return;
          const t = (yy * n + xx) * 3;
          err[t] += e[0] * w;
          err[t + 1] += e[1] * w;
          err[t + 2] += e[2] * w;
        };
        const dir = ltr ? 1 : -1;
        push(x + dir, y, 7 / 16);
        push(x - dir, y + 1, 3 / 16);
        push(x, y + 1, 5 / 16);
        push(x + dir, y + 1, 1 / 16);
      }
    }

    // lone specks: a tile none of whose eight neighbours match gives way to the neighbours' majority,
    // if that colour is nearly as close to the photo. Thin lines keep their neighbours and stay.
    for (let pass = 0; pass < (opt.clean | 0); pass++) {
      const next = Int16Array.from(cells);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const c = y * n + x;
          const tally = new Map();
          let same = 0;
          let total = 0;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              if (!i && !j) continue;
              const xx = x + i;
              const yy = y + j;
              if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
              const k = cells[yy * n + xx];
              total++;
              if (k === cells[c]) same++;
              tally.set(k, (tally.get(k) || 0) + 1);
            }
          }
          if (same > 0) continue;
          let major = -1;
          let votes = 0;
          for (const [k, v] of tally) if (v > votes) [major, votes] = [k, v];
          if (votes * 2 < total) continue;
          const here = dist[c * K + cells[c]];
          if (dist[c * K + major] < here + 10) next[c] = major;
        }
      }
      cells.set(next);
    }

    // parts list, most used first
    const counts = new Map();
    for (let c = 0; c < N; c++) counts.set(cells[c], (counts.get(cells[c]) || 0) + 1);
    const parts = [...counts.entries()]
      .map(([k, count]) => ({ cand: k, count, part: cands[k].part, shape: cands[k].shape, color: cands[k].color }))
      .sort((a, b) => b.count - a.count);
    parts.forEach((p, i) => (p.symbol = i + 1));
    const symbolOf = new Map(parts.map((p) => [p.cand, p.symbol]));

    // pictures: the target after levels, the tiles' own colours, and the mix seen from afar
    const picture = (fn) => {
      const out = new Uint8ClampedArray(N * 4);
      for (let c = 0; c < N; c++) {
        const lin = fn(c);
        out[c * 4] = toByte(lin[0]);
        out[c * 4 + 1] = toByte(lin[1]);
        out[c * 4 + 2] = toByte(lin[2]);
        out[c * 4 + 3] = 255;
      }
      return out;
    };
    const colorsUsed = new Set(parts.map((p) => p.color.i)).size;
    return {
      n,
      crop: { x: x0, y: y0, side },
      cands,
      cells,
      parts,
      symbolOf,
      colorsUsed,
      palette,
      plates: (n / 16) * (n / 16),
      target: picture((c) => tgt[c]),
      tiles: picture((c) => cands[cells[c]].rgb.map((v) => LIN[v])),
      seen: picture((c) => cands[cells[c]].lin),
      error: best.reduce((s, v) => s + v, 0) / N,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
