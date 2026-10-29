// Version 2.1 towers (second pilot design): 6-8 blocks each, several levels, offsets/overhangs/beams, support relations between blocks.
// Found with tools/gen_towers.mjs (random placement + physics stability filter) and selected with tools/rank_towers.mjs for variety and for a
// meaningful advantage of well-placed hits (ordered here from easier to harder); each is stable at the start (checked by tools/v2_checks.mjs).
// Image blocks are 1.2 x 1.2 x 0.9 cubes; gray (image-less) pieces are beams, slabs, pillars or small cubes. Block fields as in towers.js (pos = centre, y = 0 is the platform top).
const I = (x, y, z) => ({ size: [1.2, 1.2, 0.9], pos: [x, y, z], cue: 'random', image: true });
const P = (size, x, y, z) => ({ size, pos: [x, y, z], cue: 0.5, image: false });

export const V21_TOWERS = [
  // ---- adapted by hand from Version 1's "supporting structure" tower ----
  {
    name: 'v2.1 gateway (adapted from V1 tower 2): two image supports, lintel, block + pillar, cap, small cube',
    blocks: [
      I(-1.1, 0.6, -0.5), I(1.1, 0.6, -0.5),
      P([3.4, 0.5, 0.9], 0, 1.45, -0.5),
      I(-0.7, 2.3, -0.3), P([0.6, 1.2, 0.6], 1.0, 2.3, -0.7),
      P([2.6, 0.4, 0.9], 0.2, 3.1, -0.5),
      P([0.7, 0.7, 0.7], 0.4, 3.65, -0.5),
    ],
  },
  // ---- generated designs (see header) ----
  {
    name: 'v2.1 design 1: 8 blocks, 3 images, 4 levels',
    blocks: [
      P([1.2, 1.2, 0.9], -0.031, 0.6, -0.707),
      P([1.2, 1.2, 0.9], 1.226, 0.6, -0.631),
      I(0.034, 1.8, -0.992),
      I(-0.643, 3, -1.017),
      P([0.7, 0.7, 0.7], -0.144, 3.95, -0.902),
      I(1.3, 1.8, -0.94),
      P([0.6, 1.2, 0.6], 1.574, 3, -1.058),
      P([0.6, 1.2, 0.6], 0.905, 3, -1.043),
    ],
  },
  {
    name: 'v2.1 design 2: 7 blocks, 4 images, 5 levels',
    blocks: [
      I(-0.607, 0.6, -0.732),
      I(0.663, 0.6, -1.022),
      P([0.7, 0.7, 0.7], -0.001, 1.55, -1.047),
      P([1.5, 0.5, 1.5], 0.119, 2.15, -1.1),
      P([2.6, 0.5, 0.9], -0.218, 2.65, -0.831),
      I(0.633, 3.5, -1.1),
      I(-0.607, 3.5, -1.068),
    ],
  },
  {
    name: 'v2.1 design 3: 6 blocks, 3 images, 4 levels',
    blocks: [
      I(-0.056, 0.6, -0.413),
      I(1.3, 0.6, -0.13),
      P([2.6, 0.5, 0.9], 0.6, 1.45, -0.227),
      P([1.2, 1.2, 0.9], -0.211, 2.3, -0.56),
      P([0.7, 0.7, 0.7], 1.009, 2.05, 0.1),
      I(-0.396, 3.5, -0.646),
    ],
  },
  {
    name: 'v2.1 design 4: 7 blocks, 4 images, 4 levels',
    blocks: [
      P([1.2, 1.2, 0.9], -0.537, 0.6, -0.6),
      I(0.853, 0.6, -0.337),
      I(-0.916, 1.8, -0.506),
      I(0.626, 1.8, -0.613),
      P([0.7, 0.7, 0.7], -0.611, 2.75, -0.489),
      P([0.7, 0.7, 0.7], -1.451, 2.75, -0.396),
      I(-1.165, 3.7, -0.719),
    ],
  },
  {
    name: 'v2.1 design 5: 8 blocks, 3 images, 5 levels',
    blocks: [
      I(-0.177, 0.6, -0.63),
      I(1.196, 0.6, -0.394),
      P([0.7, 0.7, 0.7], 0.38, 1.55, -0.453),
      P([0.7, 0.7, 0.7], -0.655, 1.55, -0.765),
      P([2.6, 0.5, 0.9], -0.6, 2.15, -0.703),
      P([0.6, 1.2, 0.6], -0.808, 3, -1.1),
      P([2.6, 0.5, 0.9], -0.047, 2.65, -0.286),
      I(0.392, 3.5, -0.416),
    ],
  },
  {
    name: 'v2.1 design 6: 7 blocks, 3 images, 6 levels',
    blocks: [
      I(-0.599, 0.6, -0.685),
      I(0.622, 0.6, -0.941),
      P([2.6, 0.5, 0.9], -0.247, 1.45, -0.773),
      I(0.272, 2.3, -0.997),
      P([1.5, 0.5, 1.5], 0.034, 3.15, -0.77),
      P([3.2, 0.5, 0.9], -0.3, 3.65, -0.521),
      P([1.5, 0.5, 1.5], -0.604, 4.15, -0.615),
    ],
  },
  {
    name: 'v2.1 design 7: 6 blocks, 4 images, 4 levels',
    blocks: [
      I(-0.795, 0.6, -0.322),
      I(0.604, 0.6, -0.235),
      P([2.6, 0.5, 0.9], -0.6, 1.45, -0.306),
      P([2.6, 0.5, 0.9], 0.6, 1.95, -0.466),
      I(1.21, 2.8, -0.231),
      I(-0.243, 2.8, -0.218),
    ],
  },
  {
    name: 'v2.1 design 8: 8 blocks, 4 images, 5 levels',
    blocks: [
      I(-0.424, 0.6, -0.627),
      I(0.967, 0.6, -0.33),
      P([1.2, 1.2, 0.9], 1.3, 1.8, -0.076),
      I(-1.064, 1.8, -0.924),
      P([2.6, 0.5, 0.9], -0.6, 2.65, -0.845),
      P([1.5, 0.5, 1.5], -0.764, 3.15, -0.844),
      I(1.153, 3, 0.1),
      P([2.6, 0.5, 0.9], -0.6, 3.65, -0.883),
    ],
  },
  {
    name: 'v2.1 design 9: 6 blocks, 3 images, 5 levels',
    blocks: [
      I(-0.698, 0.6, -0.536),
      I(0.614, 0.6, -0.585),
      P([2.6, 0.5, 0.9], -0.6, 1.45, -0.379),
      I(-0.029, 2.3, -0.323),
      P([3.2, 0.5, 0.9], 0.3, 3.15, -0.421),
      P([1.5, 0.5, 1.5], -0.222, 3.65, -0.542),
    ],
  },
  {
    name: 'v2.1 design 10: 8 blocks, 3 images, 6 levels',
    blocks: [
      I(0.792, 0.6, -0.436),
      I(-0.567, 0.6, -0.457),
      P([2.6, 0.5, 0.9], 0.6, 1.45, -0.65),
      P([1.5, 0.5, 1.5], -1.15, 1.95, -0.627),
      P([1.5, 0.5, 1.5], 1.112, 1.95, -0.65),   // v2.3b: was z -0.349 (hanging 0.55 over the beam's front edge); now centred on the beam like the plate on the left, so it no longer falls forward and lands standing on edge in front of the image block (see tools/obstruction_study.mjs)
      I(0.082, 2.8, -0.343),
      P([3.2, 0.5, 0.9], 0.3, 3.65, -0.326),
      P([2.6, 0.5, 0.9], 0.396, 4.15, -0.459),
    ],
  },
  {
    name: 'v2.1 design 11: 8 blocks, 4 images, 6 levels',
    blocks: [
      I(-0.122, 0.6, -0.614),
      I(1.13, 0.6, -0.386),
      I(1.3, 1.8, -0.442),
      I(-0.5, 1.8, -0.725),
      P([2.6, 0.5, 0.9], 0.6, 2.65, -0.27),
      P([2.6, 0.5, 0.9], 0.6, 3.15, -0.168),
      P([2.6, 0.5, 0.9], 0.102, 3.65, -0.297),
      P([2.6, 0.5, 0.9], 0.6, 4.15, -0.249),
    ],
  },
];
