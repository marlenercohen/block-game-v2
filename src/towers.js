// Version 2 towers. Plain data. Every block:
//   size: [x, y, z] full extents (approximately square front faces so hits can vary both horizontally and vertically)
//   pos:  [x, y, z] centre (y = 0 is the platform top)
//   cue:  (image blocks only) colour cue in [0, 1] (0 = blue ... 1 = red, intermediate = purples; also 'blue' | 'red' | 'random'); it sets the
//         preferred horizontal hit position (experiment.js CUE). Blocks without an image cannot be hit and are always neutral gray.
//   image: false (no image; not hittable)
//          true / 'any'  -> an image chosen by the presenter (new with prob 1-repeatProbability, else a previously seen one)
//          'novel'       -> always an image never shown before in this session (novel images favour hits near the bottom)
//          'familiar'    -> an already-seen image (falls back to novel if none exists yet) (familiar images favour hits near the top)
// All blocks have the same mass (experiment.js BLOCK_MASS). Blocks are listed bottom-up, placed in exact contact.
const W = 1.2, H = 1.2, D = 0.9, Z = -0.55;           // standard block: 1.2 x 1.2 front face
const B = (x, y, extra = {}) => ({ size: [W, H, D], pos: [x, y, Z], cue: 0.5, image: false, ...extra });
const y = k => H / 2 + k * H;                         // centre height of layer k

export const TOWERS = [
  {
    name: 'stack of 3, middle block has an image',
    blocks: [B(0, y(0)), B(0.1, y(1), { cue: 0.25, image: true }), B(-0.1, y(2))],
  },
  {
    name: 'stack of 3, images on bottom and top',
    blocks: [B(0, y(0), { cue: 0.75, image: true }), B(0.12, y(1)), B(-0.1, y(2), { cue: 'random', image: true })],
  },
  {
    name: 'bridge: two image bases, plain span, image cap',
    blocks: [
      B(-1.25, y(0), { cue: 0, image: true }),
      B(1.25, y(0), { cue: 1, image: true }),
      { ...B(0, y(1)), size: [3.5, H, D] },
      B(0.1, y(2), { cue: 0.75, image: true }),
    ],
  },
  {
    name: 'pyramid: two image bases, one block across, image top',
    blocks: [
      B(-0.62, y(0), { cue: 0.25, image: true }), B(0.62, y(0), { cue: 0.75, image: true }),
      B(0, y(1)),
      B(0.05, y(2), { cue: 'random', image: true }),
    ],
  },
  {
    name: 'leaning staircase of 4, images on 2nd and 4th',
    blocks: [
      B(-0.4, y(0)), B(-0.2, y(1), { cue: 0.5, image: true }), B(0, y(2)), B(0.18, y(3), { cue: 'random', image: true }),
    ],
  },
  {
    name: 'two separate stacks: novel / any / familiar images',
    blocks: [
      B(-1.3, y(0)), B(-1.3, y(1), { cue: 0.25, image: 'novel' }),
      B(1.25, y(0)), B(1.25, y(1), { cue: 'random', image: 'any' }), B(1.25, y(2), { cue: 0.75, image: 'familiar' }),
    ],
  },
  // ---- simple towers added for the pilot (few blocks, easy to clear) ----
  { name: 'stack of 2, image on top', blocks: [B(0, y(0)), B(0.08, y(1), { cue: 'random', image: true })] },
  { name: 'stack of 2, image on bottom', blocks: [B(0, y(0), { cue: 'random', image: true }), B(0.08, y(1))] },
  { name: 'row of three separate image blocks', blocks: [B(-1.5, y(0), { cue: 'random', image: true }), B(0, y(0), { cue: 'random', image: true }), B(1.5, y(0), { cue: 'random', image: true })] },
  { name: 'two image blocks side by side with a gray block across the top', blocks: [B(-0.65, y(0), { cue: 'random', image: true }), B(0.65, y(0), { cue: 'random', image: true }), B(0, y(1))] },
];

/** Player-facing label: deliberately uninformative. */
export const labelFor = i => `Tower ${i + 1}`;
