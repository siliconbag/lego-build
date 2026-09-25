/*
 * cat.js
 * A fat ginger tabby sitting down, built from real LEGO parts only: no invented prints.
 * Every part and colour below is in the BrickLink catalogue (checked 25.09.2026).
 * The face hangs on side studs: 87087 bricks in the face rows carry the whisker pads
 * (round plates 2 x 2), the nose and the eyes (round tiles 1 x 1).
 * 106 parts in 17 steps. MODELS.cat is the model; LEGO.booklet() turns it into a film.
 */
(function (root) {
  'use strict';

  const S = (id, color, at, o) => Object.assign({ id, color, at }, o || {});
  const O = 'orange';
  const D = 'darkOrange';
  const WH = 'white';
  const IN = [0, -3, 0]; // face parts slide in from the front

  // x to the right, y away from the viewer, z up in plates. The cat faces -y.
  // Body 9 wide (x -1..8), head 7 wide (x 0..7), both flush at the front (y 0).
  const STEPS = [
    // base, front paws with their toes out
    [
      S('3023', O, [-1, 0, 0]), S('3022', WH, [1, -1, 0]), S('3024', WH, [3, 0, 0]), S('3022', WH, [4, -1, 0]),
      S('3023', O, [6, 0, 0]), S('3958', O, [-1, 1, 0]), S('3795', O, [5, 1, 0], { rot: 1 }), S('3666', O, [7, 1, 0], { rot: 1 }),
    ],
    // lower body, white chest over the paws
    [
      S('3004', O, [-1, 0, 1]), S('3004', WH, [1, 0, 1]), S('3005', WH, [3, 0, 1]), S('3004', WH, [4, 0, 1]),
      S('3004', O, [6, 0, 1]), S('2456', O, [-1, 1, 1], { rot: 1 }), S('2456', O, [1, 1, 1], { rot: 1 }),
      S('2456', O, [3, 1, 1], { rot: 1 }), S('2456', O, [5, 1, 1], { rot: 1 }), S('3009', O, [7, 1, 1], { rot: 1 }),
    ],
    // tabby stripe
    [
      S('3023', D, [-1, 0, 4]), S('3023', WH, [1, 0, 4]), S('3024', WH, [3, 0, 4]), S('3023', WH, [4, 0, 4]),
      S('3023', D, [6, 0, 4]), S('3958', D, [-1, 1, 4]), S('3795', D, [5, 1, 4], { rot: 1 }), S('3666', D, [7, 1, 4], { rot: 1 }),
    ],
    // upper body, joints shifted, the white bib narrows
    [
      S('3622', O, [-1, 0, 5]), S('3622', WH, [2, 0, 5]), S('3622', O, [5, 0, 5]),
      S('3009', O, [-1, 1, 5], { rot: 1 }), S('2456', O, [0, 1, 5], { rot: 1 }),
      S('2456', O, [2, 1, 5], { rot: 1 }), S('2456', O, [4, 1, 5], { rot: 1 }), S('2456', O, [6, 1, 5], { rot: 1 }),
    ],
    // round back, shoulders
    [
      S('15068', O, [-1, 5, 8], { rot: 2 }), S('15068', O, [1, 5, 8], { rot: 2 }), S('15068', O, [3, 5, 8], { rot: 2 }),
      S('15068', O, [5, 5, 8], { rot: 2 }), S('11477', O, [7, 5, 8], { rot: 2 }),
      S('2431', O, [-1, 0, 8], { rot: 1 }), S('3070', O, [-1, 4, 8]), S('2431', O, [7, 0, 8], { rot: 1 }), S('3070', O, [7, 4, 8]),
    ],
    // striped tail along the right side
    [
      S('3023', D, [8, 5, 0], { rot: 1 }), S('3023', O, [8, 3, 0], { rot: 1 }), S('11477', D, [8, 1, 0]),
      S('3069', D, [8, 5, 1], { rot: 1 }), S('3069', O, [8, 3, 1], { rot: 1 }),
    ],
    // head floor
    [S('3032', O, [0, 1, 8]), S('3710', O, [6, 1, 8], { rot: 1 }), S('3666', O, [0, 0, 8]), S('3024', O, [6, 0, 8])],
    // muzzle row: four side studs for the whisker pads
    [
      S('3005', O, [0, 0, 9]), S('87087', WH, [1, 0, 9]), S('87087', WH, [2, 0, 9]), S('3005', WH, [3, 0, 9]),
      S('87087', WH, [4, 0, 9]), S('87087', WH, [5, 0, 9]), S('3005', O, [6, 0, 9]),
      S('3001', O, [0, 1, 9], { rot: 1 }), S('3001', O, [2, 1, 9], { rot: 1 }), S('3001', O, [4, 1, 9], { rot: 1 }),
      S('3010', O, [6, 1, 9], { rot: 1 }),
    ],
    // nose row
    [
      S('3622', O, [0, 0, 12]), S('87087', WH, [3, 0, 12]), S('3622', O, [4, 0, 12]),
      S('3010', O, [0, 1, 12], { rot: 1 }), S('3001', O, [1, 1, 12], { rot: 1 }), S('3001', O, [3, 1, 12], { rot: 1 }),
      S('3001', O, [5, 1, 12], { rot: 1 }),
    ],
    // eye row, side studs either side of the nose
    [
      S('3004', O, [0, 0, 15]), S('87087', O, [2, 0, 15]), S('3005', O, [3, 0, 15]), S('87087', O, [4, 0, 15]),
      S('3004', O, [5, 0, 15]),
      S('3001', O, [0, 1, 15], { rot: 1 }), S('3001', O, [2, 1, 15], { rot: 1 }), S('3001', O, [4, 1, 15], { rot: 1 }),
      S('3010', O, [6, 1, 15], { rot: 1 }),
    ],
    // forehead with the tabby marks
    [
      S('3004', O, [0, 0, 18]), S('3005', D, [2, 0, 18]), S('3005', O, [3, 0, 18]), S('3005', D, [4, 0, 18]),
      S('3004', O, [5, 0, 18]),
      S('3010', O, [0, 1, 18], { rot: 1 }), S('3001', O, [1, 1, 18], { rot: 1 }), S('3001', O, [3, 1, 18], { rot: 1 }),
      S('3001', O, [5, 1, 18], { rot: 1 }),
    ],
    // rounded top: curved slopes down both sides, a striped ridge between them
    [
      S('63864', O, [2, 0, 21]),
      S('15068', O, [0, 1, 21], { rot: 3 }), S('15068', O, [0, 3, 21], { rot: 3 }),
      S('15068', O, [5, 1, 21], { rot: 1 }), S('15068', O, [5, 3, 21], { rot: 1 }),
      S('3710', O, [2, 1, 21], { rot: 1 }), S('3710', O, [3, 1, 21], { rot: 1 }), S('3710', O, [4, 1, 21], { rot: 1 }),
    ],
    [S('2431', D, [2, 1, 22], { rot: 1 }), S('2431', O, [3, 1, 22], { rot: 1 }), S('2431', D, [4, 1, 22], { rot: 1 })],
    // ears
    [S('3044c', O, [0, 0, 21], { rot: 1 }), S('3044c', O, [5, 0, 21], { rot: 1 })],
    // face: whisker pads on the muzzle row, nose, then the eyes
    [
      S('4032', WH, [1, -0.4, 9.5], { up: '-y', from: IN }),
      S('4032', WH, [4, -0.4, 9.5], { up: '-y', from: IN }),
    ],
    [S('98138', 'pink', [3, -0.4, 12.5], { up: '-y', from: IN })],
    [
      S('98138', 'black', [2, -0.4, 15.5], { up: '-y', from: IN }),
      S('98138', 'black', [4, -0.4, 15.5], { up: '-y', from: IN }),
    ],
  ];

  root.MODELS = root.MODELS || {};
  root.MODELS.cat = { title: 'Котик', theta: 35, phi: 28, steps: STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
