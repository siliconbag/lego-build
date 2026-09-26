/*
 * lego.js
 * LEGO parts drawn in plain Canvas 2D, in the look of a building-instruction booklet:
 * light from the upper left, thin dark edges, paler parts from earlier steps and a
 * yellow outline around the parts being added.
 *
 * Pure and deterministic: a frame depends only on its inputs, nothing is random and
 * nothing is kept between calls, so it drops into the procedural-film pipeline as is.
 *
 * Units: 1 = one stud pitch (8 mm). Part heights and the z of `at` count plates
 * (1 plate = 0.4, 1 brick = 3 plates = 1.2). x runs right, y away from the viewer, z up.
 *
 *   const part = LEGO.place({ id: '3001', color: 'red', at: [0, 0, 0] });
 *   const cam = LEGO.camera({ theta: 45, phi: 30, scale: 80, cx: 540, cy: 960, target: [2, 1, 0.6] });
 *   LEGO.draw(ctx, [{ part }], cam);
 *
 * An item passed to draw() can also carry move [dx, dy, dz] (world units, for animation),
 * pale 0..1 (earlier steps), halo 0..1 (yellow outline) and alpha 0..1.
 */
(function (root) {
  'use strict';

  const LEGO = (root.LEGO = root.LEGO || {});

  const PLATE = 0.4;
  const STUD_R = 0.3;
  const STUD_H = 0.2;
  const EPS = 1e-4;
  const PI = Math.PI;
  const HALO = '#FFD21A';
  const ZERO = [0, 0, 0];

  LEGO.PLATE = PLATE;

  // ------------------------------------------------------------------ vectors

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const mulMV = (M, v) => [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
  const mulMM = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));

  // ------------------------------------------------------------------ colours

  // Close to the LDraw / Rebrickable values; black is lifted a little so its edges read on paper.
  const PALETTE = {
    white: ['#FFFFFF', 'White', 'Белый'],
    black: ['#2E363D', 'Black', 'Черный'],
    lbg: ['#A3A8AC', 'Light Bluish Gray', 'Светло-серый'],
    dbg: ['#686A66', 'Dark Bluish Gray', 'Темно-серый'],
    orange: ['#E8791A', 'Orange', 'Оранжевый'],
    darkOrange: ['#A95500', 'Dark Orange', 'Темно-оранжевый'],
    blo: ['#FBAC16', 'Bright Light Orange', 'Светло-оранжевый'],
    pink: ['#EF9EBB', 'Bright Pink', 'Розовый'],
    red: ['#C8200E', 'Red', 'Красный'],
    blue: ['#0B5CC2', 'Blue', 'Синий'],
    yellow: ['#F6CC2E', 'Yellow', 'Желтый'],
    green: ['#1F8A4C', 'Green', 'Зеленый'],
    tan: ['#E2CB9A', 'Tan', 'Бежевый'],
    brown: ['#6A3A1F', 'Reddish Brown', 'Коричневый'],
    azure: ['#35AFC2', 'Medium Azure', 'Лазурный'],
    lime: ['#B4DA1F', 'Lime', 'Лаймовый'],
  };
  const COLORS = (LEGO.COLORS = {});
  for (const k of Object.keys(PALETTE)) {
    const [hex, name, ru] = PALETTE[k];
    const n = parseInt(hex.slice(1), 16);
    COLORS[k] = { key: k, hex, name, ru, rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255] };
  }

  const AMB = 0.7;
  const DIF = 0.3;
  const lightOf = (cam, n) => {
    const d = n[0] * cam.L[0] + n[1] * cam.L[1] + n[2] * cam.L[2];
    return AMB + DIF * (d > 0 ? d : 0);
  };
  const byte = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const css = (r, g, b) => 'rgb(' + byte(r) + ',' + byte(g) + ',' + byte(b) + ')';

  function tone(rgb, b, pale) {
    let r = rgb[0] * b;
    let g = rgb[1] * b;
    let u = rgb[2] * b;
    if (pale) {
      r += (255 - r) * pale;
      g += (255 - g) * pale;
      u += (255 - u) * pale;
    }
    return css(r, g, u);
  }

  // Dark lines on light parts, lighter lines on dark parts, all fading with `pale`.
  function edgeTone(rgb, pale) {
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    let e = lum < 0.3 ? rgb.map((c) => c + (255 - c) * 0.42) : rgb.map((c) => c * 0.22 + 26);
    if (pale) e = e.map((c) => c + (255 - c) * pale * 0.62);
    return css(e[0], e[1], e[2]);
  }

  // ------------------------------------------------------------------ parts

  const LIB = (LEGO.LIB = {});
  // Part ids in the order they are defined, family by family (object keys would sort numbers first).
  const ORDER = (LEGO.ORDER = []);
  const reg = (def) => {
    LIB[def.id] = def;
    ORDER.push(def.id);
    return def;
  };

  function grid(w, d, z) {
    const s = [];
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) s.push([i + 0.5, j + 0.5, z]);
    return s;
  }

  function holesToDiscs(def) {
    def.discs = [];
    for (const [x, z] of def.holes || []) {
      def.discs.push({ c: [x, 0, z], n: [0, -1, 0], r: 0.3, kind: 'hole' });
      def.discs.push({ c: [x, def.d, z], n: [0, 1, 0], r: 0.3, kind: 'hole' });
    }
    return def;
  }

  // Box-like parts: a profile in the (y, z) plane pushed along x (w along x, d along y).
  function box(id, ru, w, d, plates, studs, extra) {
    const h = plates * PLATE;
    reg(holesToDiscs(
      Object.assign(
        { id, ru, kind: 'ext', w, d, h, profile: [[0, 0], [d, 0], [d, h], [0, h]], studs: studs ? grid(w, d, h) : [] },
        extra || {}
      )
    ));
  }

  // 45 degree slope, low side toward -y, one row of studs at the back.
  function slope(id, ru, w) {
    const h = 3 * PLATE;
    const studs = [];
    for (let i = 0; i < w; i++) studs.push([i + 0.5, 1.5, h]);
    reg(holesToDiscs({ id, ru, kind: 'ext', w, d: 2, h, profile: [[0, 0], [2, 0], [2, h], [1, h], [0, 0.2]], studs }));
  }

  // Double 45 degree slope: a roof ridge along x, the triangle shows on the end caps.
  function ridge(id, ru) {
    const h = 3 * PLATE;
    reg(holesToDiscs({ id, ru, kind: 'ext', w: 1, d: 2, h, profile: [[0, 0], [2, 0], [2, 0.2], [1, h], [0, 0.2]], studs: [] }));
  }

  // Curved slope 2/3 brick high, a quarter ellipse falling toward -y, no studs.
  function curve(id, ru, w) {
    const h = 2 * PLATE;
    const lip = 0.1;
    const pts = [[0, 0], [2, 0], [2, h]];
    for (let i = 1; i <= 16; i++) {
      const t = ((i / 16) * PI) / 2;
      pts.push([2 - 2 * Math.sin(t), lip + (h - lip) * Math.cos(t)]);
    }
    reg(holesToDiscs({ id, ru, kind: 'ext', w, d: 2, h, profile: pts, studs: [] }));
  }

  function round(id, ru, size, plates, studs) {
    const h = plates * PLATE;
    const s = !studs ? [] : size === 1 ? [[0.5, 0.5, h]] : grid(2, 2, h);
    reg({ id, ru, kind: 'cyl', w: size, d: size, h, r: size / 2 - 0.02, studs: s, discs: [] });
  }

  box('3005', 'Кирпич 1×1', 1, 1, 3, true);
  box('3004', 'Кирпич 1×2', 2, 1, 3, true);
  box('3622', 'Кирпич 1×3', 3, 1, 3, true);
  box('3010', 'Кирпич 1×4', 4, 1, 3, true);
  box('3009', 'Кирпич 1×6', 6, 1, 3, true);
  box('3008', 'Кирпич 1×8', 8, 1, 3, true);
  box('3003', 'Кирпич 2×2', 2, 2, 3, true);
  box('3002', 'Кирпич 2×3', 3, 2, 3, true);
  box('3001', 'Кирпич 2×4', 4, 2, 3, true);
  box('2456', 'Кирпич 2×6', 6, 2, 3, true);
  box('3007', 'Кирпич 2×8', 8, 2, 3, true);

  box('3024', 'Пластина 1×1', 1, 1, 1, true);
  box('3023', 'Пластина 1×2', 2, 1, 1, true);
  box('3623', 'Пластина 1×3', 3, 1, 1, true);
  box('3710', 'Пластина 1×4', 4, 1, 1, true);
  box('3666', 'Пластина 1×6', 6, 1, 1, true);
  box('3460', 'Пластина 1×8', 8, 1, 1, true);
  box('3022', 'Пластина 2×2', 2, 2, 1, true);
  box('3021', 'Пластина 2×3', 3, 2, 1, true);
  box('3020', 'Пластина 2×4', 4, 2, 1, true);
  box('3795', 'Пластина 2×6', 6, 2, 1, true);
  box('3034', 'Пластина 2×8', 8, 2, 1, true);
  box('3031', 'Пластина 4×4', 4, 4, 1, true);
  box('3032', 'Пластина 4×6', 6, 4, 1, true);
  box('3958', 'Пластина 6×6', 6, 6, 1, true);
  box('91405', 'Пластина 16×16', 16, 16, 1, true);

  box('3070', 'Плитка 1×1', 1, 1, 1, false);
  box('3069', 'Плитка 1×2', 2, 1, 1, false);
  box('63864', 'Плитка 1×3', 3, 1, 1, false);
  box('2431', 'Плитка 1×4', 4, 1, 1, false);
  box('6636', 'Плитка 1×6', 6, 1, 1, false);
  box('3068', 'Плитка 2×2', 2, 2, 1, false);
  box('87079', 'Плитка 2×4', 4, 2, 1, false);

  // SNOT brick: one more stud on the front face, 0.7 up from the bottom like a technic hole
  box('87087', 'Кирпич 1×1 с шипом сбоку', 1, 1, 3, true);
  LIB['87087'].studs.push([0.5, 0, 0.7, [0, -1, 0]]);

  box('3700', 'Техник-кирпич 1×2', 2, 1, 3, true, { holes: [[1, 0.7]] });
  box('3701', 'Техник-кирпич 1×4', 4, 1, 3, true, { holes: [[1, 0.7], [2, 0.7], [3, 0.7]] });

  slope('3040', 'Скос 45° 2×1', 1);
  slope('3039', 'Скос 45° 2×2', 2);
  ridge('3044c', 'Двойной скос 45° 2×1');
  curve('11477', 'Изогнутый скос 2×1', 1);
  curve('15068', 'Изогнутый скос 2×2', 2);

  round('4073', 'Круглая пластина 1×1', 1, 1, true);
  round('3062', 'Круглый кирпич 1×1', 1, 3, true);
  round('4032', 'Круглая пластина 2×2', 2, 1, true);
  round('3941', 'Круглый кирпич 2×2', 2, 3, true);
  // both have an axle hole between the four studs
  for (const id of ['4032', '3941']) LIB[id].discs.push({ c: [1, 1, LIB[id].h], n: [0, 0, 1], r: 0.13, kind: 'hole' });
  round('98138', 'Круглая плитка 1×1', 1, 1, false);
  round('14769', 'Круглая плитка 2×2', 2, 1, false);

  // Polyhedron of an extruded part, built once per part type.
  function newell(pts) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      x += (a[1] - b[1]) * (a[2] + b[2]);
      y += (a[2] - b[2]) * (a[0] + b[0]);
      z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return norm([x, y, z]);
  }

  function geomOf(def) {
    if (def._g) return def._g;
    if (def.kind !== 'ext') return (def._g = { kind: 'cyl', base: [def.w / 2, def.d / 2, 0], r: def.r, h: def.h });
    const P = def.profile;
    const m = P.length;
    const V = [];
    for (const q of P) V.push([0, q[0], q[1]]);
    for (const q of P) V.push([def.w, q[0], q[1]]);
    const faces = [P.map((_, i) => i), P.map((_, i) => 2 * m - 1 - i)];
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      faces.push([i, j, m + j, m + i]);
    }
    const cen = [0, 0, 0];
    for (const v of V) for (let k = 0; k < 3; k++) cen[k] += v[k] / V.length;
    const F = faces.map((idx) => {
      const pts = idx.map((i) => V[i]);
      let n = newell(pts);
      const fc = [0, 0, 0];
      for (const p of pts) for (let k = 0; k < 3; k++) fc[k] += p[k] / pts.length;
      if (dot(n, [fc[0] - cen[0], fc[1] - cen[1], fc[2] - cen[2]]) < 0) n = [-n[0], -n[1], -n[2]];
      return { idx, n };
    });
    const map = new Map();
    const E = [];
    F.forEach((f, fi) => {
      for (let k = 0; k < f.idx.length; k++) {
        const a = f.idx[k];
        const b = f.idx[(k + 1) % f.idx.length];
        const key = a < b ? a * 4096 + b : b * 4096 + a;
        const e = map.get(key);
        if (e) e.f2 = fi;
        else {
          const ne = { a, b, f1: fi, f2: -1 };
          map.set(key, ne);
          E.push(ne);
        }
      }
    });
    const cosSmooth = Math.cos((30 * PI) / 180);
    for (const e of E) e.smooth = e.f2 >= 0 && dot(F[e.f1].n, F[e.f2].n) > cosSmooth;
    return (def._g = { kind: 'ext', V, F, E });
  }

  // ------------------------------------------------------------------ placing

  // `up` sends the stud side (local z) to a world axis, then `rot` turns the part about world z.
  const UPS = {
    '+z': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    '-z': [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
    '-y': [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    '+y': [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
    '+x': [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
    '-x': [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  };
  const RZ = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
    [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
  ];

  // spec: { id, color, at: [x, y, zPlates] = min corner of the part's box, rot 0..3, up, prints }
  LEGO.place = function place(spec) {
    const def = LIB[spec.id];
    if (!def) throw new Error('lego.js: unknown part ' + spec.id);
    const col = spec.rgb ? { rgb: spec.rgb } : COLORS[spec.color];
    if (!col) throw new Error('lego.js: unknown colour ' + spec.color);
    const up = UPS[spec.up || '+z'];
    if (!up) throw new Error('lego.js: unknown up ' + spec.up);
    const M = mulMM(RZ[(spec.rot || 0) & 3], up);
    const lo = [Infinity, Infinity, Infinity];
    for (const x of [0, def.w]) {
      for (const y of [0, def.d]) {
        for (const z of [0, def.h]) {
          const v = mulMV(M, [x, y, z]);
          for (let k = 0; k < 3; k++) if (v[k] < lo[k]) lo[k] = v[k];
        }
      }
    }
    const at = spec.at || ZERO;
    const off = [at[0] - lo[0], at[1] - lo[1], at[2] * PLATE - lo[2]];
    return { def, spec, M, off, rgb: col.rgb, color: spec.color || null };
  };

  // ------------------------------------------------------------------ camera

  // Orthographic. theta turns the viewer around the model (45 = front right), phi lifts it.
  LEGO.camera = function camera(o) {
    const th = ((o.theta == null ? 45 : o.theta) * PI) / 180;
    const ph = ((o.phi == null ? 30 : o.phi) * PI) / 180;
    const dir = [Math.sin(th) * Math.cos(ph), -Math.cos(th) * Math.cos(ph), Math.sin(ph)];
    const right = [Math.cos(th), Math.sin(th), 0];
    const up = cross(right, [-dir[0], -dir[1], -dir[2]]);
    const T = o.target || ZERO;
    const s = o.scale || 60;
    const cx = o.cx || 0;
    const cy = o.cy || 0;
    // Light rides with the camera: tops brightest, left faces next, right faces darkest.
    // o.light = [right, up, toward viewer] weights; a mosaic seen from above wants it mostly frontal.
    const lg = o.light || [-0.45, 0.85, 0.5];
    const L = norm(madd(madd(madd([0, 0, 0], right, lg[0]), up, lg[1]), dir, lg[2]));
    const project = (p) => {
      const dx = p[0] - T[0];
      const dy = p[1] - T[1];
      const dz = p[2] - T[2];
      return [
        cx + (dx * right[0] + dy * right[1]) * s,
        cy - (dx * up[0] + dy * up[1] + dz * up[2]) * s,
        dx * dir[0] + dy * dir[1] + dz * dir[2],
      ];
    };
    return { dir, right, up, L, project, scale: s, target: T, cx, cy };
  };

  // ------------------------------------------------------------------ geometry per frame

  function arcPts(c, A, B, t0, t1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const co = Math.cos(t);
      const si = Math.sin(t);
      out.push([c[0] + A[0] * co + B[0] * si, c[1] + A[1] * co + B[1] * si]);
    }
    return out;
  }

  // A cylinder seen by the camera: its two end ellipses, the outline and the visible half of the side.
  function cylGeom(cam, C, ax, R, H) {
    const e1 = Math.abs(ax[2]) > 0.9 ? [1, 0, 0] : norm(cross(ax, [0, 0, 1]));
    const e2 = cross(ax, e1);
    const c0 = cam.project(C);
    const c1 = cam.project(madd(C, ax, H));
    const pa = cam.project(madd(C, e1, R));
    const pb = cam.project(madd(C, e2, R));
    const A = [pa[0] - c0[0], pa[1] - c0[1]];
    const B = [pb[0] - c0[0], pb[1] - c0[1]];
    const rpx = Math.max(Math.hypot(A[0], A[1]), Math.hypot(B[0], B[1]));
    const n = Math.max(10, Math.min(64, Math.ceil(rpx * 0.7)));
    const front = dot(ax, cam.dir) >= 0;
    const g = { e1, e2, c0, c1, A, B, n, capC: front ? c1 : c0, capN: front ? ax : [-ax[0], -ax[1], -ax[2]], side: false };
    const hx = c1[0] - c0[0];
    const hy = c1[1] - c0[1];
    const hl = Math.hypot(hx, hy);
    if (hl > 0.25) {
      const nx = -hy / hl;
      const ny = hx / hl;
      const t1 = Math.atan2(B[0] * nx + B[1] * ny, A[0] * nx + A[1] * ny);
      const tm = t1 + PI / 2;
      const cm = Math.cos(tm);
      const sm = Math.sin(tm);
      const along = (A[0] * cm + B[0] * sm) * hx + (A[1] * cm + B[1] * sm) * hy;
      const s0 = along < 0 ? t1 : t1 + PI;
      g.sil = arcPts(c0, A, B, s0, s0 + PI, n).concat(arcPts(c1, A, B, s0 + PI, s0 + 2 * PI, n));
      const nm = [e1[0] * cm + e2[0] * sm, e1[1] * cm + e2[1] * sm, e1[2] * cm + e2[2] * sm];
      g.vis0 = dot(nm, cam.dir) > 0 ? t1 : t1 + PI;
      g.nx = nx;
      g.ny = ny;
      g.side = true;
    } else {
      g.sil = arcPts(g.capC, A, B, 0, 2 * PI, 2 * n);
    }
    return g;
  }

  function cylBox(C, ax, R, H, mn, mx) {
    const T = madd(C, ax, H);
    for (let k = 0; k < 3; k++) {
      const e = R * Math.sqrt(Math.max(0, 1 - ax[k] * ax[k]));
      mn[k] = Math.min(C[k], T[k]) - e;
      mx[k] = Math.max(C[k], T[k]) + e;
    }
  }

  function hull2(P) {
    const pts = P.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    const hi = [];
    for (const p of pts) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop();
      hi.push(p);
    }
    lo.pop();
    hi.pop();
    return lo.concat(hi);
  }

  function rectOf(pts, pad) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }

  const depthOf = (mn, mx, cam) => dot([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], cam.dir);

  // A stud is hidden when another part's body sits over it. With many bodies the candidates
  // come from a grid index of their footprints instead of the whole list.
  function coverIndex(bodies) {
    if (bodies.length < 200) return null;
    const cells = new Map();
    for (const b of bodies) {
      for (let x = Math.floor(b.min[0]); x < Math.ceil(b.max[0]); x++) {
        for (let y = Math.floor(b.min[1]); y < Math.ceil(b.max[1]); y++) {
          const k = x * 65536 + y;
          const list = cells.get(k);
          if (list) list.push(b);
          else cells.set(k, [b]);
        }
      }
    }
    return cells;
  }

  function covered(q, self, bodies, index) {
    if (index) bodies = index.get(Math.floor(q[0]) * 65536 + Math.floor(q[1])) || [];
    for (const b of bodies) {
      if (b === self) continue;
      if (
        q[0] > b.min[0] + 0.02 && q[0] < b.max[0] - 0.02 &&
        q[1] > b.min[1] + 0.02 && q[1] < b.max[1] - 0.02 &&
        q[2] > b.min[2] - 0.001 && q[2] < b.max[2]
      ) return true;
    }
    return false;
  }

  // Prints are given in the part's own coordinates: a disc { c, n, r } or { c, n, rx, ry },
  // a filled polygon { poly: [[x, y, z]...], n } or a stroke { line: [[x, y, z]...], n, w }.
  function worldPrint(p, off, d) {
    const N = mulMV(p.M, d.n);
    const at = (v) => add(mulMV(p.M, v), off);
    if (d.poly) return { kind: 'poly', N, pts: d.poly.map(at), color: d.color };
    if (d.line) return { kind: 'line', N, pts: d.line.map(at), color: d.color, w: d.w || 0.04 };
    return { kind: d.kind || 'disc', N, C: at(d.c), rx: d.rx || d.r, ry: d.ry || d.r, color: d.color };
  }

  function prep(items, cam, pad, cull) {
    const bodies = [];
    for (const it of items) {
      const p = it.part;
      if (cull && !it.base) {
        const mv0 = it.move || ZERO;
        const a = cam.project([p.off[0] + mv0[0], p.off[1] + mv0[1], p.off[2] + mv0[2]]);
        if (a[0] < cull[0] || a[0] > cull[2] || a[1] < cull[1] || a[1] > cull[3]) continue;
      }
      const g = geomOf(p.def);
      const mv = it.move || ZERO;
      const off = [p.off[0] + mv[0], p.off[1] + mv[1], p.off[2] + mv[2]];
      const pale = it.pale || 0;
      const o = {
        type: 'body', part: p, off, rgb: p.rgb, pale, halo: it.halo || 0, base: it.base ? 0 : 1,
        alpha: it.alpha == null ? 1 : it.alpha, edge: edgeTone(p.rgb, pale),
      };
      const mn = [Infinity, Infinity, Infinity];
      const mx = [-Infinity, -Infinity, -Infinity];
      if (g.kind === 'ext') {
        const Wv = g.V.map((v) => add(mulMV(p.M, v), off));
        for (const w of Wv) {
          for (let k = 0; k < 3; k++) {
            if (w[k] < mn[k]) mn[k] = w[k];
            if (w[k] > mx[k]) mx[k] = w[k];
          }
        }
        o.P = Wv.map(cam.project);
        o.E = g.E;
        o.faces = g.F.map((f) => {
          const n = mulMV(p.M, f.n);
          const vis = dot(n, cam.dir) > 1e-6;
          return { idx: f.idx, vis, fill: vis ? tone(p.rgb, lightOf(cam, n), pale) : null };
        });
        o.hull = hull2(o.P);
      } else {
        const ax = mulMV(p.M, [0, 0, 1]);
        const C = add(mulMV(p.M, g.base), off);
        o.cyl = cylGeom(cam, C, ax, g.r, g.h);
        cylBox(C, ax, g.r, g.h, mn, mx);
        o.hull = o.cyl.sil;
      }
      o.min = mn;
      o.max = mx;
      o.prints = (p.def.discs || []).concat(p.spec.prints || []).map((d) => worldPrint(p, off, d));
      // printed lines (whiskers) may reach past the part, keep them inside its screen box
      const reach = o.hull.slice();
      for (const d of o.prints) if (d.pts) for (const q of d.pts) reach.push(cam.project(q));
      o.rect = rectOf(reach, pad);
      o.depth = depthOf(mn, mx, cam);
      bodies.push(o);
    }
    const objs = bodies.slice();
    const index = coverIndex(bodies);
    for (const b of bodies) {
      const p = b.part;
      for (const s of p.def.studs) {
        // a stud points up the part unless it carries its own axis (studs on the side)
        const ax = mulMV(p.M, s[3] || [0, 0, 1]);
        if (dot(ax, cam.dir) < -0.02) continue;
        const C = add(mulMV(p.M, s), b.off);
        if (cull) {
          const a = cam.project(C);
          if (a[0] < cull[0] || a[0] > cull[2] || a[1] < cull[1] || a[1] > cull[3]) continue;
        }
        if (covered(madd(C, ax, 0.1), b, bodies, index)) continue;
        const mn = [0, 0, 0];
        const mx = [0, 0, 0];
        cylBox(C, ax, STUD_R, STUD_H, mn, mx);
        const cyl = cylGeom(cam, C, ax, STUD_R, STUD_H);
        objs.push({
          type: 'stud', owner: b, rgb: b.rgb, pale: b.pale, halo: b.halo, alpha: b.alpha, edge: b.edge, base: 1,
          cyl, min: mn, max: mx, rect: rectOf(cyl.sil, pad), depth: depthOf(mn, mx, cam), prints: [],
        });
      }
    }
    return objs;
  }

  // ------------------------------------------------------------------ painter's order

  // 1: draw a first, -1: draw b first, 0: no constraint. Uses a separating axis of the two boxes.
  function before(a, b, cam) {
    let v = 0;
    for (let k = 0; k < 3; k++) {
      const d = cam.dir[k];
      if (Math.abs(d) < 1e-9) continue;
      let s;
      if (a.max[k] <= b.min[k] + EPS) s = d > 0 ? 1 : -1;
      else if (b.max[k] <= a.min[k] + EPS) s = d > 0 ? -1 : 1;
      else continue;
      if (v === 0) v = s;
      else if (v !== s) return 0;
    }
    if (v !== 0) return v;
    return a.depth <= b.depth ? 1 : -1;
  }

  function sortObjs(objs, cam) {
    const n = objs.length;
    const succ = [];
    for (let i = 0; i < n; i++) succ.push([]);
    const indeg = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const a = objs[i];
      for (let j = i + 1; j < n; j++) {
        const b = objs[j];
        if (a.rect[2] < b.rect[0] || b.rect[2] < a.rect[0] || a.rect[3] < b.rect[1] || b.rect[3] < a.rect[1]) continue;
        const r = before(a, b, cam);
        if (r > 0) {
          succ[i].push(j);
          indeg[j]++;
        } else if (r < 0) {
          succ[j].push(i);
          indeg[i]++;
        }
      }
    }
    const done = new Uint8Array(n);
    const out = [];
    for (let c = 0; c < n; c++) {
      let best = -1;
      for (let i = 0; i < n; i++) {
        if (!done[i] && indeg[i] <= 0 && (best < 0 || objs[i].depth < objs[best].depth)) best = i;
      }
      if (best < 0) {
        for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || objs[i].depth < objs[best].depth)) best = i;
      }
      done[best] = 1;
      out.push(objs[best]);
      for (const j of succ[best]) indeg[j]--;
    }
    return out;
  }

  // ------------------------------------------------------------------ drawing

  function ptsPath(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function ellPath(ctx, c, A, B, n) {
    for (let i = 0; i <= n; i++) {
      const t = (2 * PI * i) / n;
      const x = c[0] + A[0] * Math.cos(t) + B[0] * Math.sin(t);
      const y = c[1] + A[1] * Math.cos(t) + B[1] * Math.sin(t);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function drawHalo(ctx, o, lw) {
    ctx.save();
    ctx.globalAlpha *= o.halo;
    if (o.type === 'stud') {
      // only the part of a stud that sticks out past its own brick
      ctx.beginPath();
      ctx.rect(-1e5, -1e5, 2e5, 2e5);
      ptsPath(ctx, o.owner.hull);
      ctx.clip('evenodd');
    }
    ctx.beginPath();
    ptsPath(ctx, o.type === 'stud' ? o.cyl.sil : o.hull);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = HALO;
    ctx.lineWidth = lw * 4.6;
    ctx.stroke();
    ctx.restore();
  }

  // Prints and technic holes on a face.
  function drawPrint(ctx, cam, o, d, lw) {
    if (dot(d.N, cam.dir) < 0.03) return;
    const lit = lightOf(cam, d.N);
    if (d.kind === 'poly' || d.kind === 'line') {
      const P = d.pts.map(cam.project);
      ctx.beginPath();
      ctx.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
      if (d.kind === 'poly') {
        ctx.closePath();
        ctx.fillStyle = tone(COLORS[d.color].rgb, lit, o.pale);
        ctx.fill();
      } else {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = tone(COLORS[d.color].rgb, 1, o.pale);
        ctx.lineWidth = Math.max(1, d.w * cam.scale);
        ctx.stroke();
      }
      return;
    }
    // e1 runs level across the face (or along x on a top face), e2 up the face
    const e1 = Math.abs(d.N[2]) > 0.9 ? [1, 0, 0] : norm(cross(d.N, [0, 0, 1]));
    const e2 = cross(d.N, e1);
    const c = cam.project(d.C);
    const pa = cam.project(madd(d.C, e1, d.rx));
    const pb = cam.project(madd(d.C, e2, d.ry));
    const A = [pa[0] - c[0], pa[1] - c[1]];
    const B = [pb[0] - c[0], pb[1] - c[1]];
    const n = Math.max(20, Math.min(96, Math.ceil(Math.max(Math.hypot(A[0], A[1]), Math.hypot(B[0], B[1])) * 1.2)));
    if (d.kind === 'hole') {
      ctx.beginPath();
      ellPath(ctx, c, A, B, n);
      ctx.fillStyle = tone(o.rgb, lit * 0.74, o.pale);
      ctx.fill();
      ctx.strokeStyle = o.edge;
      ctx.lineWidth = lw * 0.85;
      ctx.stroke();
      const ci = cam.project(madd(d.C, d.N, -0.22));
      ctx.beginPath();
      ellPath(ctx, ci, [A[0] * 0.72, A[1] * 0.72], [B[0] * 0.72, B[1] * 0.72], n);
      ctx.fillStyle = tone(o.rgb, lit * 0.42, o.pale);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ellPath(ctx, c, A, B, n);
    ctx.fillStyle = tone(COLORS[d.color].rgb, lit, o.pale);
    ctx.fill();
  }

  function drawExt(ctx, cam, o, lw, ea) {
    const P = o.P;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const f of o.faces) {
      if (!f.vis) continue;
      ctx.beginPath();
      const ix = f.idx;
      ctx.moveTo(P[ix[0]][0], P[ix[0]][1]);
      for (let i = 1; i < ix.length; i++) ctx.lineTo(P[ix[i]][0], P[ix[i]][1]);
      ctx.closePath();
      ctx.fillStyle = f.fill;
      ctx.fill();
      // seal the hairline gaps between facets of the same part
      ctx.lineWidth = 1;
      ctx.strokeStyle = f.fill;
      ctx.stroke();
    }
    for (const d of o.prints) drawPrint(ctx, cam, o, d, lw);
    ctx.beginPath();
    for (const e of o.E) {
      const v1 = o.faces[e.f1].vis;
      const v2 = e.f2 >= 0 && o.faces[e.f2].vis;
      if (!v1 && !v2) continue;
      if (v1 && v2 && e.smooth) continue;
      ctx.moveTo(P[e.a][0], P[e.a][1]);
      ctx.lineTo(P[e.b][0], P[e.b][1]);
    }
    ctx.globalAlpha *= ea;
    ctx.strokeStyle = o.edge;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  function drawCyl(ctx, cam, o, lw, ea) {
    const g = o.cyl;
    ctx.lineJoin = 'round';
    if (g.side) {
      const st = [];
      let qmin = Infinity;
      let qmax = -Infinity;
      for (let k = 0; k <= 10; k++) {
        const t = g.vis0 + (PI * k) / 10;
        const co = Math.cos(t);
        const si = Math.sin(t);
        const q = (g.A[0] * co + g.B[0] * si) * g.nx + (g.A[1] * co + g.B[1] * si) * g.ny;
        const nrm = [g.e1[0] * co + g.e2[0] * si, g.e1[1] * co + g.e2[1] * si, g.e1[2] * co + g.e2[2] * si];
        st.push([q, lightOf(cam, nrm)]);
        if (q < qmin) qmin = q;
        if (q > qmax) qmax = q;
      }
      const c0 = g.c0;
      const gr = ctx.createLinearGradient(c0[0] + g.nx * qmin, c0[1] + g.ny * qmin, c0[0] + g.nx * qmax, c0[1] + g.ny * qmax);
      const span = qmax - qmin || 1;
      for (const [q, b] of st) gr.addColorStop((q - qmin) / span, tone(o.rgb, b, o.pale));
      ctx.beginPath();
      ptsPath(ctx, g.sil);
      ctx.fillStyle = gr;
      ctx.fill();
    }
    ctx.beginPath();
    ellPath(ctx, g.capC, g.A, g.B, 2 * g.n);
    ctx.fillStyle = tone(o.rgb, lightOf(cam, g.capN), o.pale);
    ctx.fill();
    for (const d of o.prints) drawPrint(ctx, cam, o, d, lw);
    ctx.globalAlpha *= ea;
    ctx.strokeStyle = o.edge;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ptsPath(ctx, g.sil);
    ctx.stroke();
    ctx.beginPath();
    ellPath(ctx, g.capC, g.A, g.B, 2 * g.n);
    ctx.stroke();
  }

  // Draw a list of items ({ part, move, pale, halo, alpha, base }) back to front.
  // opt.fast skips the exact painter's order: items marked `base` first, then everything by depth.
  // That is right for flat scenes like mosaics and fast enough for thousands of parts.
  // opt.edgeAlpha fades the dark edges (1 = booklet look).
  LEGO.draw = function draw(ctx, items, cam, opt) {
    const o0 = opt || {};
    const lw = o0.lineWidth || Math.max(1, cam.scale * 0.02);
    const ea = o0.edgeAlpha == null ? 1 : o0.edgeAlpha;
    // opt.cull [x0, y0, x1, y1]: small parts and studs outside this screen box are skipped
    const prepped = prep(items, cam, lw * 2.5, o0.cull);
    const objs = o0.fast ? prepped.sort((a, b) => a.base - b.base || a.depth - b.depth) : sortObjs(prepped, cam);
    for (const o of objs) {
      ctx.save();
      if (o.alpha < 1) ctx.globalAlpha = o.alpha;
      if (o.halo > 0) drawHalo(ctx, o, lw);
      if (o.cyl) drawCyl(ctx, cam, o, lw, ea);
      else drawExt(ctx, cam, o, lw, ea);
      ctx.restore();
    }
    return objs.length;
  };

  // ------------------------------------------------------------------ layout helpers

  // World box of placed parts, studs included.
  LEGO.bounds = function bounds(parts) {
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) {
      const d = p.def;
      const top = d.studs.length ? d.h + STUD_H : d.h;
      for (const x of [0, d.w]) {
        for (const y of [0, d.d]) {
          for (const z of [0, top]) {
            const v = add(mulMV(p.M, [x, y, z]), p.off);
            for (let k = 0; k < 3; k++) {
              if (v[k] < mn[k]) mn[k] = v[k];
              if (v[k] > mx[k]) mx[k] = v[k];
            }
          }
        }
      }
    }
    return { min: mn, max: mx, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
  };

  // Screen size of a world box at scale 1.
  LEGO.extent = function extent(b, theta, phi) {
    const cam = LEGO.camera({ theta, phi, scale: 1, target: b.center });
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const x of [b.min[0], b.max[0]]) {
      for (const y of [b.min[1], b.max[1]]) {
        for (const z of [b.min[2], b.max[2]]) {
          const p = cam.project([x, y, z]);
          if (p[0] < x0) x0 = p[0];
          if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1];
          if (p[1] > y1) y1 = p[1];
        }
      }
    }
    return { w: x1 - x0, h: y1 - y0, x0, x1, y0, y1 };
  };

  // One part on its own, centred on (cx, cy): parts lists, inventories.
  LEGO.drawPart = function drawPart(ctx, spec, cx, cy, scale, opt) {
    const o = opt || {};
    const part = LEGO.place(Object.assign({}, spec, { at: [0, 0, 0] }));
    const b = LEGO.bounds([part]);
    const cam = LEGO.camera({ theta: o.theta, phi: o.phi, scale, cx, cy, target: b.center });
    LEGO.draw(ctx, [{ part, pale: o.pale || 0 }], cam, { lineWidth: o.lineWidth || Math.max(1, scale * 0.028) });
  };

  LEGO.partSize = function partSize(spec, theta, phi) {
    const part = LEGO.place(Object.assign({}, spec, { at: [0, 0, 0] }));
    return LEGO.extent(LEGO.bounds([part]), theta, phi);
  };

  // Booklet arrow: red, white rim, pointing at (x1, y1).
  LEGO.arrow = function arrow(ctx, x0, y0, x1, y1, o) {
    const opt = o || {};
    const w = opt.width || 12;
    const head = opt.head || w * 2.1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L;
    const uy = dy / L;
    const px = -uy;
    const py = ux;
    const bx = x1 - ux * head * 1.5;
    const by = y1 - uy * head * 1.5;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 + (px * w) / 2, y0 + (py * w) / 2);
    ctx.lineTo(bx + (px * w) / 2, by + (py * w) / 2);
    ctx.lineTo(bx + px * head, by + py * head);
    ctx.lineTo(x1, y1);
    ctx.lineTo(bx - px * head, by - py * head);
    ctx.lineTo(bx - (px * w) / 2, by - (py * w) / 2);
    ctx.lineTo(x0 - (px * w) / 2, y0 - (py * w) / 2);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = w * 0.8;
    ctx.stroke();
    ctx.fillStyle = opt.color || '#D7192A';
    ctx.fill();
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
