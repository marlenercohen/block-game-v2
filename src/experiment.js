// ===== Version 2 experiment parameters. Everything the experimenters are likely to change lives here. =====
import IMAGE_IDS from './image_ids.js';

// ---- mass: every block has the same total mass and a uniform mass distribution ----------------------
// Same total mass for every block, whatever its size or image (mutable object so presets can change it; see src/presets.js).
export const PHYS = { blockMass: 1.0 };

// ---- colour cue (blue -> purple -> red) -------------------------------------------------------------
// A block's cue value c is in [0, 1]: 0 = blue, 1 = red, intermediate values = purples. Set `cue` per block in src/towers.js
// (a number, 'blue', 'red', or 'random' = one of CUE.values). The value determines the colour AND the preferred horizontal hit position.
export const CUE = {
  values: [0, 0.25, 0.5, 0.75, 1],       // values used by 'random' cues
  colorStops: [                          // colour as a function of the cue (linear interpolation between stops, sRGB)
    { cue: 0.0, color: 0x2f7fe0 },       // blue
    { cue: 0.5, color: 0x8c5fb4 },       // purple
    { cue: 1.0, color: 0xd93a2f },       // red
  ],
  // preferred (optimal) horizontal hit position as a function of the cue, in normalised face coordinates (0 = left edge, 1 = right edge).
  // Blue favours hits toward the left, red toward the right, intermediate colours in between (linear interpolation between stops).
  preferredXStops: [{ cue: 0.0, x: 0.2 }, { cue: 1.0, x: 0.8 }],
};
const lerp = (a, b, t) => a + (b - a) * t;
const interp = (stops, key, val, out) => {
  const x = Math.min(stops[stops.length - 1][key], Math.max(stops[0][key], val));
  for (let i = 0; i < stops.length - 1; i++) if (x >= stops[i][key] && x <= stops[i + 1][key]) {
    const t = (x - stops[i][key]) / (stops[i + 1][key] - stops[i][key]); return [stops[i], stops[i + 1], t];
  }
  return [stops.at(-1), stops.at(-1), 0];
};
export function colorForCue(c) {
  const [a, b, t] = interp(CUE.colorStops, 'cue', c);
  const ch = k => Math.round(lerp((a.color >> k) & 255, (b.color >> k) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export function preferredXForCue(c) { const [a, b, t] = interp(CUE.preferredXStops, 'cue', c); return lerp(a.x, b.x, t); }
// Blocks WITHOUT an image can never be hit, so they carry no cue: they are all drawn in this neutral gray.
export const NO_IMAGE_COLOR = 0x80848c;
export const cueOf = v => (typeof v === 'number' ? v : v === 'blue' ? 0 : v === 'red' ? 1 : 0.5);

// ---- familiarity -> preferred vertical hit position -------------------------------------------------
// Normalised face coordinates: 0 = bottom edge, 1 = top edge. Novel images respond best to low hits, familiar images to high hits.
export const FAMILIARITY = { novelPreferredY: 0.2, familiarPreferredY: 0.8 };
export const preferredYForFamiliarity = f => (f === 'familiar' ? FAMILIARITY.familiarPreferredY : FAMILIARITY.novelPreferredY);

// ---- hit effectiveness: multiplier applied to the impulse magnitude ---------------------------------
//   multiplier = baseline + horizontalAmplitude * G(u - preferredX(cue), horizontalWidth) + verticalAmplitude * G(v - preferredY(familiarity), verticalWidth)
// with G a smooth bump: exp(-d^2 / (2 width^2)) (width = standard deviation in normalised face units). Additive: either cue helps by itself.
// Impulse magnitude = CONFIG.impulseMagnitude (config.js, 3.0 as in V1) * multiplier. Direction is unchanged. Worst case ~ baseline (> 0).
export const EFFECT = {
  baseline: 0.2,
  horizontalAmplitude: 1.0,
  verticalAmplitude: 1.0,
  horizontalWidth: 0.2,
  verticalWidth: 0.2,
};
// shape of the bump; replace to try other tuning curves (must return 1 at d = 0 and fall toward 0)
export const bump = (d, width) => Math.exp(-(d * d) / (2 * width * width));

// ---- images and familiarity -----------------------------------------------------------------------
export const IMAGES = {
  ids: IMAGE_IDS,                        // collection (files in public/images/<id>.jpg)
  seed: null,                            // null = random per session; set a number for a reproducible image sequence
  repeatProbability: 0.5,                // for an 'any' image slot: chance to pick an already-seen image (if one exists) instead of a new one
  faceFraction: 0.72,                    // image side as a fraction of the block-face height (rest of the face keeps the colour cue)
};
// Separate pool for the tutorial (files in public/images_tutorial/): practice can never contaminate the familiarity of experimental images.
export const TUTORIAL_IMAGES = { ids: ['ID_1791', 'ID_1952', 'ID_2115', 'ID_2172', 'ID_240', 'ID_241', 'ID_287', 'ID_301', 'ID_4024', 'ID_5037'], dir: 'images_tutorial' };
// 1st presentation of an image in the session = novel; 2nd and later = familiar.
export const familiarityOfPresentation = n => (n === 1 ? 'novel' : 'familiar');

// ---- when is a trial complete? --------------------------------------------------------------------
// 'image_blocks': all blocks that show an image are off the platform (blocks without image are obstacles/scenery that can only be
//                 moved by collisions). 'all_blocks': every block must leave; a trial where only image-less blocks remain ends as 'stuck'.
export const COMPLETION = { rule: 'image_blocks' };
export const isTargetBlock = b => COMPLETION.rule === 'all_blocks' || !!b.props.actionable;
