/*
 * microduck.js
 * A mini Microduck, the Pollen Robotics biped from the victor/microduck-lego-booklet:
 * 54 parts in 17 steps. MODELS.microduck is the model; LEGO.booklet() turns it into a film.
 */
(function (root) {
  'use strict';

  const S = (id, color, at, o) => Object.assign({ id, color, at }, o || {});

  // The eye: a round 2 x 2 tile with a printed lens, mounted studs forward on the black face.
  const EYE = [
    { c: [1, 1, 0.4], n: [0, 0, 1], r: 0.64, color: 'black' },
    { c: [0.7, 1.32, 0.4], n: [0, 0, 1], r: 0.13, color: 'white' },
  ];

  // x to the right, y away from the viewer, z up in plates. The robot faces -y.
  const STEPS = [
    // feet
    [S('3020', 'blo', [0, -1, 0], { rot: 1 }), S('3020', 'blo', [4, -1, 0], { rot: 1 })],
    [
      S('3021', 'orange', [0, 0, 1], { rot: 1 }), S('3021', 'orange', [4, 0, 1], { rot: 1 }),
      S('3069', 'orange', [0, -1, 1]), S('3069', 'orange', [4, -1, 1]),
    ],
    // ankles, holes to the sides
    [
      S('3700', 'lbg', [0, 1, 2], { rot: 1 }), S('3700', 'lbg', [1, 1, 2], { rot: 1 }),
      S('3700', 'lbg', [4, 1, 2], { rot: 1 }), S('3700', 'lbg', [5, 1, 2], { rot: 1 }),
    ],
    // shins, knees, thighs
    [S('3003', 'lbg', [0, 1, 5]), S('3003', 'lbg', [4, 1, 5])],
    [S('3022', 'dbg', [0, 1, 8]), S('3022', 'dbg', [4, 1, 8])],
    [S('3003', 'white', [0, 1, 9]), S('3003', 'white', [4, 1, 9])],
    // hips
    [S('3795', 'dbg', [0, 1, 12])],
    // trunk: black floor, dark battery base, white shell
    [S('3032', 'black', [0, 0, 13])],
    [
      S('3009', 'dbg', [0, 0, 14]), S('3009', 'dbg', [0, 3, 14]),
      S('3004', 'dbg', [0, 1, 14], { rot: 1 }), S('3004', 'dbg', [5, 1, 14], { rot: 1 }),
    ],
    [S('3032', 'white', [0, 0, 17]), S('2456', 'white', [0, 0, 18]), S('2456', 'white', [0, 2, 18])],
    // shoulders and neck
    [
      S('3068', 'white', [0, 0, 21]), S('3068', 'white', [4, 0, 21]), S('3068', 'white', [0, 2, 21]),
      S('3068', 'white', [4, 2, 21]), S('3069', 'white', [2, 0, 21]), S('3069', 'white', [2, 3, 21]),
      S('3003', 'dbg', [2, 1, 21]),
    ],
    // head: orange floor, lower shell with the black face, upper shell, roof, dome
    [S('3032', 'orange', [0, 0, 24]), S('3666', 'orange', [0, -1, 24])],
    [
      S('3009', 'orange', [0, 3, 25]), S('3622', 'orange', [0, 0, 25], { rot: 1 }),
      S('3622', 'orange', [5, 0, 25], { rot: 1 }), S('3009', 'black', [0, -1, 25]),
    ],
    [
      S('3009', 'white', [0, 3, 28]), S('3622', 'white', [0, 0, 28], { rot: 1 }),
      S('3622', 'white', [5, 0, 28], { rot: 1 }), S('3009', 'black', [0, -1, 28]),
    ],
    [S('3795', 'white', [0, -1, 31]), S('3795', 'white', [0, 1, 31]), S('3666', 'white', [0, 3, 31])],
    [
      S('15068', 'white', [0, -1, 32]), S('15068', 'white', [2, -1, 32]), S('15068', 'white', [4, -1, 32]),
      S('15068', 'white', [0, 2, 32], { rot: 2 }), S('15068', 'white', [2, 2, 32], { rot: 2 }),
      S('15068', 'white', [4, 2, 32], { rot: 2 }), S('3666', 'white', [0, 1, 32]), S('6636', 'white', [0, 1, 33]),
    ],
    // the eye slides in from the front
    [S('14769', 'blo', [1, -1.4, 25.5], { up: '-y', prints: EYE, from: [0, -3.2, 0] })],
  ];

  root.MODELS = root.MODELS || {};
  root.MODELS.microduck = { title: 'Microduck', theta: 45, phi: 30, steps: STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
