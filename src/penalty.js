// Horizontal-error penalty: pure helpers (no DOM, no three.js) used by the game and by the tests.
import { PENALTY, preferredXForCue } from './experiment.js';

/** Absolute horizontal distance between the click (u, normalised face coordinate) and the optimum for this cue under the given colour-rule phase. */
export const horizontalError = (u, cue, phase = 'initial') => Math.abs(u - preferredXForCue(cue, phase));

/** True if the error is strictly greater than the threshold. A tiny tolerance keeps an error of exactly 0.25 (e.g. 0.45 vs 0.20) from tripping on floating-point noise. */
export const exceedsThreshold = (err, threshold = PENALTY.horizontalThreshold) => err > threshold + 1e-9;

/** Slot of the i-th penalty block in the display area at the front edge of the platform (clear of the tower): a front row, then a row behind it, then further layers on top.
 *  Returns the world position of the cube centre. Rows hold 12 cubes at 0.34 spacing (x from -1.87 to 1.87). */
export const PENALTY_LAYOUT = { cols: 12, spacing: 0.34, rowZ: [1.0, 0.70], perLayer: 24 };
export function penaltySlotPosition(i, size = PENALTY.blockSize) {
  const L = PENALTY_LAYOUT, layer = Math.floor(i / L.perLayer), k = i % L.perLayer, row = Math.floor(k / L.cols), col = k % L.cols;
  return { x: (col - (L.cols - 1) / 2) * L.spacing, y: size / 2 + layer * size, z: L.rowZ[row] };
}
