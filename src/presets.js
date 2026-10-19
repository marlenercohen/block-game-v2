// Named parameter presets: the physics/effectiveness/tower-set versions of the experiment, so that behaviour can be compared across pilot versions.
// 'v23' (default) = v22 plus the horizontal-error penalty (PENALTY in experiment.js).
// 'v22' = third pilot: same physics and towers as v21, much weaker weak hits (multiplicative effectiveness), 100 trials, unannounced colour-rule reversal after trial 60.
// 'v21' = second pilot version: heavier blocks, stronger impulse, more friction, much stronger hit-location contrast, 3-D towers of 6-8 blocks.
// 'pilot1'        = the version used for the first human pilot session (git tag pilot1-first-human-session): light blocks, subtle effect, simple towers.
// Select with ?preset=pilot1 in the address (or SESSION.preset in session_config.js). The active preset and all its values are saved in every data file.
import { PHYS, EFFECT, PENALTY } from './experiment.js';
import { CONFIG } from './config.js';
import { selectTowerSet } from './towers.js';
import { SESSION } from './session_config.js';

export const PRESETS = {
  v23: {
    description: 'fourth pilot: v2.2 plus a horizontal-error penalty (no impulse and one extra block to clear when the horizontal error exceeds 0.25)',
    towerSet: 'v21', towerOrder: null,
    blockMass: 1.0, impulse: 3.2, blockFriction: 0.5, platformFriction: 0.5,
    effect: { model: 'product', baseline: 0.25, peak: 2.2, horizontalWidth: 0.15, verticalWidth: 0.15 },
    maxTrialSeconds: 90, skipButtonAfterSeconds: 30, nTrials: 100, reversalAfterTrial: 60, penalty: { enabled: true, horizontalThreshold: 0.25 },
  },
  v22: {
    description: 'third pilot: v2.1 physics and towers, much weaker weak hits (multiplicative effectiveness, floor 0.25, peak 2.2, widths 0.15), 100 trials, colour rule reversed after trial 60',
    towerSet: 'v21', towerOrder: null,
    blockMass: 1.0, impulse: 3.2, blockFriction: 0.5, platformFriction: 0.5,
    effect: { model: 'product', baseline: 0.25, peak: 2.2, horizontalWidth: 0.15, verticalWidth: 0.15 },
    maxTrialSeconds: 90, skipButtonAfterSeconds: 30, nTrials: 100, reversalAfterTrial: 60, penalty: { enabled: false, horizontalThreshold: 0.25 },
  },
  v21: {
    description: 'second pilot: 3-D towers (6-8 blocks), heavier blocks, stronger impulse, higher friction, stronger hit-location contrast',
    towerSet: 'v21', towerOrder: null,
    blockMass: 1.0, impulse: 3.2, blockFriction: 0.5, platformFriction: 0.5,
    effect: { model: 'additive', baseline: 0.2, horizontalAmplitude: 1.0, verticalAmplitude: 1.0, horizontalWidth: 0.2, verticalWidth: 0.2 },
    maxTrialSeconds: 90, skipButtonAfterSeconds: 30, nTrials: 24, reversalAfterTrial: null, penalty: { enabled: false, horizontalThreshold: 0.25 },
  },
  pilot1: {
    description: 'first human pilot (2026-10-18): simple 2-4 block towers, block mass 0.432, impulse 1.2, effect 0.25..2.2',
    towerSet: 'pilot1', towerOrder: [0, 1, 3, 4, 5, 6, 7, 8, 9],
    blockMass: 0.432, impulse: 1.2, blockFriction: 0.4, platformFriction: 0.4,
    effect: { model: 'additive', baseline: 0.25, horizontalAmplitude: 0.975, verticalAmplitude: 0.975, horizontalWidth: 0.22, verticalWidth: 0.22 },
    maxTrialSeconds: 60, skipButtonAfterSeconds: 25, nTrials: 24, reversalAfterTrial: null, penalty: { enabled: false, horizontalThreshold: 0.25 },
  },
};
export const EXPERIMENT_VERSION = { v23: 'v2.3-horizontal-penalty', v22: 'v2.2-weak-hits-100-trials-reversal', v21: 'v2.1-3d-towers-heavy-contrast', pilot1: 'v2.0-pilot1' };

export function applyPreset(name) {
  const p = PRESETS[name]; if (!p) throw new Error(`unknown preset "${name}"`);
  PHYS.blockMass = p.blockMass; CONFIG.impulseMagnitude = p.impulse; CONFIG.block.friction = p.blockFriction; CONFIG.platform.friction = p.platformFriction;
  Object.assign(EFFECT, p.effect); selectTowerSet(p.towerSet);
  SESSION.towerOrder = p.towerOrder; SESSION.maxTrialSeconds = p.maxTrialSeconds; SESSION.skipButtonAfterSeconds = p.skipButtonAfterSeconds; SESSION.nTrials = p.nTrials; SESSION.reversalAfterTrial = p.reversalAfterTrial; Object.assign(PENALTY, p.penalty); SESSION.presetName = name;
  return p;
}
