// Hit-location -> impulse effectiveness (pure functions, no DOM; used by the game and by the tests).
import { EFFECT, bump, preferredXForCue, preferredYForFamiliarity } from './experiment.js';

/**
 * u = horizontal position on the clicked face (0 left .. 1 right), v = vertical position (0 bottom .. 1 top).
 * Returns the two contributions separately, the preferred positions and the total multiplier.
 */
export function effectiveness({ cue, familiarity, u, v, phase = 'initial' }) {
  const preferredX = preferredXForCue(cue, phase), preferredY = preferredYForFamiliarity(familiarity);
  const gH = bump(u - preferredX, EFFECT.horizontalWidth), gV = bump(v - preferredY, EFFECT.verticalWidth);   // 0..1 closeness to the optimum
  if (EFFECT.model === 'product') return { baseline: EFFECT.baseline, horizontal: gH, vertical: gV, multiplier: EFFECT.baseline + (EFFECT.peak - EFFECT.baseline) * gH * gV, preferredX, preferredY };
  const horizontal = EFFECT.horizontalAmplitude * gH, vertical = EFFECT.verticalAmplitude * gV;
  return { baseline: EFFECT.baseline, horizontal, vertical, multiplier: EFFECT.baseline + horizontal + vertical, preferredX, preferredY };
}

/**
 * Which face of a box (size [w,h,d]) a block-frame point lies on, and its normalised coordinates on that face as the player sees it:
 * u runs left->right, v bottom->top. Front (+z) and right side (+x) are the faces visible from the fixed camera. For the +x face, "right" is -z.
 * A hit on the top face counts as v = 1 (top of the block); its u follows x.
 * `normal` (optional) = the face normal from the raycast, otherwise the nearest face is used.
 */
export function faceCoordinates(size, local, normal = null) {
  const [w, h, d] = size, half = [w / 2, h / 2, d / 2];
  let axis, sign;
  if (normal) { axis = Math.abs(normal.x) > 0.5 ? 0 : Math.abs(normal.y) > 0.5 ? 1 : 2; sign = Math.sign([normal.x, normal.y, normal.z][axis]); }
  else { const p = [local.x, local.y, local.z]; const gap = p.map((x, i) => half[i] - Math.abs(x)); axis = gap.indexOf(Math.min(...gap)); sign = Math.sign(p[axis]) || 1; }
  const clamp = t => Math.min(1, Math.max(0, t));
  const face = (sign > 0 ? '+' : '-') + 'xyz'[axis];
  let u, v;
  if (axis === 2) { u = local.x / w + 0.5; v = local.y / h + 0.5; if (sign < 0) u = 1 - u; }          // front / back
  else if (axis === 0) { u = 0.5 - local.z / d; v = local.y / h + 0.5; if (sign < 0) u = 1 - u; }       // right / left side
  else { u = local.x / w + 0.5; v = 1; }                                                                // top / bottom
  return { face, u: clamp(u), v: sign < 0 && axis === 1 ? 0 : clamp(v) };
}
