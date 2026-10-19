// ===== Session (pilot experiment) configuration. Edit here, or override per run with URL parameters (see applyUrlOverrides). =====
import { CUE } from './experiment.js';

export const SESSION = {
  preset: 'v21',                   // physics/effect/tower-set version (src/presets.js): 'v21' (default) or 'pilot1' (the first human pilot); also ?preset=pilot1
  mode: 'session',                 // 'session' = intro -> tutorial -> N experimental trials -> end screen;  'free' = the original single-tower mode (tower menu, Reset, Demo Mode)
  tutorial: true,                  // run the tutorial before the experimental trials
  nTrials: 24,                     // number of experimental trials
  // which towers (indices into TOWERS in towers.js) are used and in what order: 'shuffle' = shuffled passes through towerOrder (no immediate repeat), 'sequence' = in order, cycling
  towerOrder: null,                // null = every tower of the active set; otherwise indices into TOWERS (the preset sets it)
  orderMode: 'shuffle',
  // images: proportion of image presentations that are novel (first presentation) - the rest are familiar (repeats), at a lag drawn from lagChoices (in trials)
  novelProportion: 0.5,
  lagChoices: [1, 2, 3, 5],
  // colour cues of image blocks whose tower spec says cue: 'random': values from cueValues, 'balanced' (shuffled bag, equal use) or 'random'
  cueValues: CUE.values,
  cuePolicy: 'balanced',
  seed: null,                      // null = random per session (the seed used is logged); a number gives a reproducible plan (towers, images, cues)
  // explicit control of individual trials (optional): explicitTrials[t] = { tower: index, slots: [ { image: 'novel' | 'familiar' | { lag: 3 } | 'ID_1234', cue: 0.25 }, ... ] }
  explicitTrials: null,
  // timing
  maxTrialSeconds: 90,             // a trial ends automatically (outcome 'timeout') after this long
  skipButtonAfterSeconds: 30,      // a small "Next tower" button appears after this long (outcome 'manual_advance')
  completionPauseMs: 1200,         // how long the cleared tower stays visible after the last block leaves
  timeoutPauseMs: 1200,
  // trial start: how the participant starts a trial. Human version: click/tap the central plus. A future monkey version can set mode 'gaze' and
  // hold the gaze on the plus for durationMs (see src/fixation.js; gaze control is NOT implemented).
  startControl: { mode: 'click', durationMs: 0 },
  kiosk: false,                    // true (or ?kiosk=1): hide the Developer panel and the data buttons from the participant (Ctrl+Shift+D downloads the JSON; the end screen keeps its download buttons)
};

/** URL overrides, e.g. ?kiosk=1  ?mode=free  ?trials=6&tutorial=0&seed=7&maxTrial=20&skipAfter=5&novel=0.3&lags=1,2&order=sequence */
export function applyUrlOverrides(cfg, search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search); const num = k => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : undefined);
  if (q.has('kiosk')) cfg.kiosk = q.get('kiosk') !== '0';
  if (q.has('mode')) cfg.mode = q.get('mode') === 'free' ? 'free' : 'session';
  if (q.has('tutorial')) cfg.tutorial = q.get('tutorial') !== '0';
  if (num('trials') !== undefined) cfg.nTrials = num('trials');
  if (num('seed') !== undefined) cfg.seed = num('seed');
  if (num('maxTrial') !== undefined) cfg.maxTrialSeconds = num('maxTrial');
  if (num('skipAfter') !== undefined) cfg.skipButtonAfterSeconds = num('skipAfter');
  if (num('novel') !== undefined) cfg.novelProportion = num('novel');
  if (num('pause') !== undefined) { cfg.completionPauseMs = num('pause'); cfg.timeoutPauseMs = num('pause'); }
  if (q.has('lags')) cfg.lagChoices = q.get('lags').split(',').map(Number).filter(Number.isFinite);
  if (q.has('order')) cfg.orderMode = q.get('order') === 'sequence' ? 'sequence' : 'shuffle';
  if (q.has('towers')) cfg.towerOrder = q.get('towers').split(',').map(x => Number(x) - 1).filter(Number.isFinite);   // 1-based tower numbers
  return cfg;
}
