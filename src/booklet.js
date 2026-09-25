/*
 * booklet.js
 * Turns a model (a list of building steps) into a short film on a booklet page: parts list,
 * step number, parts dropping in, new parts outlined in yellow, earlier parts paler, a red
 * arrow for parts that slide in sideways, then a full turn of the finished model.
 *
 *   const film = LEGO.booklet({ title: 'Котик', theta: 35, phi: 28, steps: [[spec, ...], ...] }, 'horizontal');
 *   film.draw(ctx, t);   // film.W x film.H, a pure function of time
 *
 * Formats: 'vertical' 1080 x 1920 (default) and 'horizontal' 1920 x 1080, laid out like a
 * booklet page with the parts list and step number in a column on the left.
 * A spec with `from: [dx, dy, dz]` slides in from that offset instead of dropping from above.
 */
(function (root) {
  'use strict';

  const LEGO = root.LEGO;
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const INK = '#1F2328';
  const PALE = 0.45;

  const LAYOUTS = {
    vertical: {
      W: 1080,
      H: 1920,
      area: { x0: 70, x1: 1010, y0: 560, y1: 1780 },
      callout: { x: 60, y: 150, maxW: 960 },
      title: { x: 58, y: 300 },
      footer: { x: 540, y: 1862, align: 'center' },
      badgeY: 64,
    },
    horizontal: {
      W: 1920,
      H: 1080,
      area: { x0: 600, x1: 1860, y0: 120, y1: 1020 },
      callout: { x: 60, y: 60, maxW: 480 },
      title: { x: 72, y: 250 },
      footer: { x: 64, y: 1036, align: 'left' },
      badgeY: 48,
    },
  };

  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const inOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const outCubic = (u) => 1 - Math.pow(1 - u, 3);
  const lerp = (a, b, u) => a + (b - a) * u;

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function plural(n, forms) {
    const a = n % 100;
    const b = n % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    if (b >= 2 && b <= 4) return forms[1];
    return forms[2];
  }

  LEGO.booklet = function booklet(model, format) {
    const L = LAYOUTS[format] || LAYOUTS.vertical;
    const W = L.W;
    const H = L.H;
    const THETA = model.theta == null ? 45 : model.theta;
    const PHI = model.phi == null ? 30 : model.phi;
    const STEPS = model.steps;
    const PLACED = STEPS.map((st) => st.map((spec) => LEGO.place(spec)));
    const ALL = PLACED.flat();
    const COUNT = ALL.length;

    // ---------------------------------------------------------------- timing

    const T0 = 0.55; // first step
    const STEP = model.step || 0.85; // one step
    const FALL = 0.3; // a part falling into place
    const HOP = 0.14; // the little hop after it lands
    const LIFT = 2.6; // how high a part starts, in stud pitches
    const T_BUILD = T0 + STEPS.length * STEP;
    const T_SPIN0 = T_BUILD + 0.45;
    const T_SPIN1 = T_SPIN0 + 3.6;
    const DURATION = T_SPIN1 + 1.5;
    const stepStart = (k) => T0 + k * STEP;

    // ---------------------------------------------------------------- camera

    const AREA = L.area;
    const ACX = (AREA.x0 + AREA.x1) / 2;
    const ACY = (AREA.y0 + AREA.y1) / 2;

    function frameFor(parts, thetas, sMax) {
      const b = LEGO.bounds(parts);
      let s = sMax;
      for (const th of thetas) {
        const e = LEGO.extent(b, th, PHI);
        s = Math.min(s, (AREA.x1 - AREA.x0) / e.w, (AREA.y1 - AREA.y0) / e.h);
      }
      return { target: b.center, scale: s };
    }

    const FRAMES = [];
    {
      const acc = [];
      for (const st of PLACED) {
        acc.push(...st);
        FRAMES.push(frameFor(acc, [THETA], 118));
      }
    }
    const SPIN = [];
    for (let i = 0; i < 24; i++) SPIN.push(THETA + i * 15);
    const FINAL = frameFor(ALL, SPIN, 118);

    const mixFrame = (a, b, u) => ({
      target: [lerp(a.target[0], b.target[0], u), lerp(a.target[1], b.target[1], u), lerp(a.target[2], b.target[2], u)],
      scale: lerp(a.scale, b.scale, u),
    });

    function camAt(t) {
      let fr;
      let theta = THETA;
      if (t < T_BUILD) {
        const k = Math.max(0, Math.min(STEPS.length - 1, Math.floor((t - T0) / STEP)));
        const u = inOut(clamp((t - stepStart(k)) / 0.5));
        fr = mixFrame(FRAMES[Math.max(0, k - 1)], FRAMES[k], t < T0 ? 0 : u);
      } else {
        fr = mixFrame(FRAMES[STEPS.length - 1], FINAL, inOut(clamp((t - T_BUILD) / 0.45)));
        theta = THETA + 360 * inOut(clamp((t - T_SPIN0) / (T_SPIN1 - T_SPIN0)));
      }
      return LEGO.camera({ theta, phi: PHI, scale: fr.scale, cx: ACX, cy: ACY, target: fr.target });
    }

    // ---------------------------------------------------------------- parts in motion

    function partStart(k, i) {
      const stagger = Math.min(0.09, 0.4 / STEPS[k].length);
      return stepStart(k) + 0.08 + i * stagger;
    }

    function itemsAt(t) {
      const items = [];
      const built = t >= T_BUILD;
      const settle = clamp((t - T_BUILD) / 0.4);
      const last = STEPS.length - 1;
      for (let k = 0; k < STEPS.length; k++) {
        if (t < stepStart(k)) break;
        const ended = t - (stepStart(k) + STEP);
        for (let i = 0; i < STEPS[k].length; i++) {
          const spec = STEPS[k][i];
          const t0 = partStart(k, i);
          if (t < t0) continue;
          const u = clamp((t - t0) / FALL);
          let move;
          if (spec.from) {
            const e = outCubic(clamp((t - t0) / (FALL * 1.6)));
            move = spec.from.map((c) => c * (1 - e));
          } else {
            const v = (t - t0 - FALL) / HOP;
            const hop = v > 0 && v < 1 ? 0.07 * Math.sin(Math.PI * v) : 0;
            move = [0, 0, LIFT * (1 - u * u) + hop];
          }
          let pale = 0;
          let halo = 0;
          if (!built) {
            const w = clamp(ended / 0.18);
            halo = 1 - w;
            pale = PALE * w;
          } else if (k === last) {
            halo = 1 - settle;
          } else {
            pale = PALE * (1 - settle);
          }
          items.push({ part: PLACED[k][i], move, alpha: clamp(u / 0.12), pale, halo });
        }
      }
      return items;
    }

    // Booklet arrow beside a part that slides in, below its path and clear of it.
    function arrows(ctx, t, cam) {
      for (let k = 0; k < STEPS.length; k++) {
        const s0 = stepStart(k);
        if (t < s0 || t > s0 + STEP) continue;
        STEPS[k].forEach((spec, i) => {
          if (!spec.from) return;
          const b = LEGO.bounds([PLACED[k][i]]);
          const c = b.center;
          const f = spec.from;
          const a = clamp((t - s0) / 0.12) * (1 - clamp((t - (s0 + STEP - 0.2)) / 0.2));
          const p0 = cam.project([c[0] + f[0], c[1] + f[1], c[2] + f[2]]);
          const p1 = cam.project([c[0] + f[0] * 0.2, c[1] + f[1] * 0.2, c[2] + f[2] * 0.2]);
          const dx = p1[0] - p0[0];
          const dy = p1[1] - p0[1];
          const len = Math.hypot(dx, dy) || 1;
          let nx = -dy / len;
          let ny = dx / len;
          if (ny < 0) {
            nx = -nx;
            ny = -ny;
          }
          const e = LEGO.extent(b, THETA, PHI);
          const off = 0.45 * Math.max(e.w, e.h) * cam.scale + 22;
          ctx.save();
          ctx.globalAlpha = a;
          LEGO.arrow(ctx, p0[0] + nx * off, p0[1] + ny * off, p1[0] + nx * off, p1[1] + ny * off, { width: 13 });
          ctx.restore();
        });
      }
    }

    // ---------------------------------------------------------------- page

    function badge(ctx) {
      const label = model.title;
      ctx.save();
      ctx.font = 'bold 34px ' + FONT;
      const tw = ctx.measureText(label).width;
      const h = 64;
      const w = tw + 104;
      const x = W - 56 - w;
      const y = L.badgeY;
      rrect(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = '#FFD21A';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 33, y + h / 2, 22, 0, 2 * Math.PI);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 27px ' + FONT;
      ctx.fillText('1', x + 33, y + h / 2 + 1);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.font = 'bold 34px ' + FONT;
      ctx.fillText(label, x + 66, y + h / 2 + 1);
      ctx.restore();
    }

    // Parts of each step, grouped like the booklet: one picture per part and colour, with a count,
    // flowed into rows that fit the box.
    const PAD = 28;
    const GAP = 34;
    const LABEL = 50;
    const CALLOUTS = STEPS.map((st) => {
      const groups = [];
      const by = new Map();
      for (const s of st) {
        const key = s.id + '|' + s.color + '|' + (s.up || '');
        if (by.has(key)) {
          by.get(key).n++;
          continue;
        }
        const spec = Object.assign({}, s, { at: [0, 0, 0] });
        const e = LEGO.partSize(spec, THETA, PHI);
        const g = { spec, n: 1, w: e.w, h: e.h };
        by.set(key, g);
        groups.push(g);
      }
      const inner = L.callout.maxW - 2 * PAD;
      const s = Math.min(34, inner / Math.max(...groups.map((g) => g.w)));
      const rows = [];
      let row = null;
      for (const g of groups) {
        const w = g.w * s;
        if (!row || row.w + GAP + w > inner) {
          row = { items: [], w: -GAP, h: 0 };
          rows.push(row);
        }
        row.items.push(g);
        row.w += GAP + w;
        row.h = Math.max(row.h, g.h * s);
      }
      const bw = Math.max(...rows.map((r) => r.w)) + 2 * PAD;
      const bh = rows.reduce((acc, r) => acc + r.h + LABEL, 0) + 2 * PAD - 10;
      return { s, rows, bw, bh };
    });

    function callout(ctx, k, a) {
      const c = CALLOUTS[k];
      const x = L.callout.x;
      const y = L.callout.y;
      const pop = 0.94 + 0.06 * outCubic(a);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.scale(pop, pop);
      ctx.translate(-x, -y);
      rrect(ctx, x, y, c.bw, c.bh, 16);
      ctx.fillStyle = '#DDE8F5';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#A9C0DD';
      ctx.stroke();
      let ry = y + PAD;
      for (const r of c.rows) {
        let cx = x + PAD;
        for (const g of r.items) {
          const pw = g.w * c.s;
          const ph = g.h * c.s;
          LEGO.drawPart(ctx, g.spec, cx + pw / 2, ry + r.h - ph / 2, c.s, { theta: THETA, phi: PHI });
          ctx.fillStyle = INK;
          ctx.font = 'bold 30px ' + FONT;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(g.n + 'x', cx, ry + r.h + 42);
          cx += pw + GAP;
        }
        ry += r.h + LABEL;
      }
      ctx.restore();
      return y + c.bh * pop;
    }

    function ui(ctx, t) {
      badge(ctx);
      if (t >= T0 && t < T_BUILD + 0.35) {
        const k = Math.min(STEPS.length - 1, Math.floor((t - T0) / STEP));
        const a = clamp((t - stepStart(k)) / 0.14) * (1 - clamp((t - T_BUILD) / 0.3));
        const bottom = callout(ctx, k, a);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = INK;
        ctx.font = 'bold 128px ' + FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(k + 1), L.callout.x - 2, bottom + 128);
        ctx.restore();
      }
      const end = clamp((t - (T_SPIN1 - 0.6)) / 0.5);
      if (end > 0) {
        const n = STEPS.length;
        ctx.save();
        ctx.globalAlpha = end;
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 112px ' + FONT;
        ctx.fillText(model.title, L.title.x, L.title.y);
        ctx.fillStyle = '#5B6470';
        ctx.font = '40px ' + FONT;
        ctx.fillText(
          COUNT + ' ' + plural(COUNT, ['деталь', 'детали', 'деталей']) + ' · ' + n + ' ' + plural(n, ['шаг', 'шага', 'шагов']),
          L.title.x + 4,
          L.title.y + 72
        );
        ctx.restore();
      }
      ctx.save();
      ctx.fillStyle = '#8A919B';
      ctx.font = '26px ' + FONT;
      ctx.textAlign = L.footer.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('Нарисовано кодом · Canvas 2D', L.footer.x, L.footer.y);
      ctx.restore();
    }

    function draw(ctx, t) {
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      const cam = camAt(t);
      LEGO.draw(ctx, itemsAt(t), cam);
      arrows(ctx, t, cam);
      ui(ctx, t);
      ctx.restore();
    }

    return { W, H, duration: DURATION, draw, parts: COUNT, steps: STEPS.length, title: model.title };
  };
})(typeof window !== 'undefined' ? window : globalThis);
