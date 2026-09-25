// Checks a model the way a builder would: no two parts overlap, and every part is held,
// through a chain of stud connections, by something standing on the ground.
//   node tools/check-model.cjs cat
// Two parts connect when one sits on the other with their footprints overlapping, or when a
// studs-sideways part (up other than +z) touches the part behind its studs.
const path = require('path');
global.window = global;
require(path.resolve(__dirname, '../src/lego.js'));
const name = process.argv[2] || 'cat';
require(path.resolve(__dirname, '../src/models', name + '.js'));
const LEGO = window.LEGO;
const model = window.MODELS[name];
if (!model) {
  console.error(`no model "${name}" in src/models/${name}.js`);
  process.exit(1);
}

const EPS = 1e-6;
const specs = model.steps.flat();
const parts = specs.map((s) => LEGO.place(s));
const box = (p) => {
  const d = p.def;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const x of [0, d.w]) {
    for (const y of [0, d.d]) {
      for (const z of [0, d.h]) {
        const v = [0, 1, 2].map((k) => p.M[k][0] * x + p.M[k][1] * y + p.M[k][2] * z + p.off[k]);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], v[k]);
          hi[k] = Math.max(hi[k], v[k]);
        }
      }
    }
  }
  return { lo, hi };
};
const B = parts.map(box);
const label = (i) => `step ${1 + model.steps.findIndex((st) => st.includes(specs[i]))}: ${specs[i].id} ${specs[i].color} at [${specs[i].at}]`;
const overlap = (a, b, k) => Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]);
// the world axis a part's studs point along, or -1 for ordinary upright parts
const sideAxis = (i) => {
  const up = specs[i].up;
  return !up || up === '+z' ? -1 : 'xyz'.indexOf(up[1]);
};

let problems = 0;
const links = B.map(() => []);
for (let i = 0; i < B.length; i++) {
  for (let j = i + 1; j < B.length; j++) {
    const a = B[i];
    const b = B[j];
    if ([0, 1, 2].every((k) => overlap(a, b, k) > EPS)) {
      problems++;
      console.log('OVERLAP  ' + label(i) + '  |  ' + label(j));
      continue;
    }
    const stacked = overlap(a, b, 0) > EPS && overlap(a, b, 1) > EPS &&
      (Math.abs(a.hi[2] - b.lo[2]) < EPS || Math.abs(b.hi[2] - a.lo[2]) < EPS);
    let side = false;
    for (const [p, q] of [[i, j], [j, i]]) {
      const k = sideAxis(p);
      if (k < 0) continue;
      const others = [0, 1, 2].filter((m) => m !== k);
      const touching = Math.abs(B[p].hi[k] - B[q].lo[k]) < EPS || Math.abs(B[p].lo[k] - B[q].hi[k]) < EPS;
      if (touching && others.every((m) => overlap(B[p], B[q], m) > EPS)) side = true;
    }
    if (stacked || side) {
      links[i].push(j);
      links[j].push(i);
    }
  }
}

const held = new Uint8Array(B.length);
const queue = [];
B.forEach((b, i) => {
  if (Math.abs(b.lo[2]) < EPS) {
    held[i] = 1;
    queue.push(i);
  }
});
while (queue.length) {
  const i = queue.shift();
  for (const j of links[i]) {
    if (!held[j]) {
      held[j] = 1;
      queue.push(j);
    }
  }
}
held.forEach((h, i) => {
  if (!h) {
    problems++;
    console.log('FLOATS   ' + label(i));
  }
});

console.log(`${name}: ${parts.length} parts, ${model.steps.length} steps, ` + (problems ? `${problems} problem(s)` : 'no overlaps, everything is held'));
process.exit(problems ? 1 : 0);
