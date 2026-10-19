// Session plan builder (pure): decides in advance, from a seed and a configuration, which tower, images (novel / repeated at a given lag) and colour cues each
// experimental trial gets. Pre-assigning everything makes the intended familiarity of every presentation explicit and reproducible, and it is logged.
import { ImageHistory } from './history.js';
import { mulberry32, shuffled, pick } from './rng.js';

/**
 * config: { nTrials, towers (array of tower specs), towerOrder (indices into towers), orderMode ('shuffle' | 'sequence'), imageIds (pool), novelProportion (0..1),
 *           lagChoices (array of trial lags for repeated images), cueValues, cuePolicy ('balanced' | 'random'), explicitTrials (optional) , seed }
 * explicitTrials[t] = { tower: index, slots: [ { image: 'novel' | 'familiar' | { lag: n } | '<imageId>', cue: number } ... ] }  (slots follow the image blocks of the tower in order;
 * any omitted trial/slot is generated automatically).
 * Returns { trials: [ { trialNumber, towerIndex, slots: [ { blockIndex, imageId, cue, role, lagTarget, fallback } ] } ], stats }.
 */
export const MAX_PRESENTATIONS = 2;   // strict per-session limit: once as novel, at most once more as familiar

/** Checks a complete plan: throws if any image is scheduled more than MAX_PRESENTATIONS times, twice in one trial, or if the 2nd presentation is not marked familiar. Returns the per-image counts. */
export function validatePlan(plan) {
  const counts = {}, errors = [];
  for (const tr of plan.trials) {
    const seen = new Set();
    for (const s of tr.slots) {
      if (seen.has(s.imageId)) errors.push(`${s.imageId} appears twice in trial ${tr.trialNumber}`); seen.add(s.imageId);
      counts[s.imageId] = (counts[s.imageId] ?? 0) + 1;
      const expected = counts[s.imageId] === 1 ? 'novel' : 'familiar';
      if (s.expected && s.expected.familiarity !== expected) errors.push(`${s.imageId} presentation ${counts[s.imageId]} (trial ${tr.trialNumber}) is logged as ${s.expected.familiarity}`);
    }
  }
  for (const [id, n] of Object.entries(counts)) if (n > MAX_PRESENTATIONS) errors.push(`${id} is scheduled ${n} times (limit ${MAX_PRESENTATIONS})`);
  if (errors.length) throw new Error('Invalid session plan: ' + errors.slice(0, 10).join('; '));
  return counts;
}

export function buildPlan(config) {
  const rng = mulberry32(config.seed ?? 1);
  const { towers, nTrials, imageIds, novelProportion = 0.5, lagChoices = [1, 2, 3], cueValues = [0, 0.25, 0.5, 0.75, 1], cuePolicy = 'balanced' } = config;
  const order = config.towerOrder ?? towers.map((_, i) => i);
  // tower sequence
  const seq = []; let bag = [];
  while (seq.length < nTrials) {
    if (config.orderMode === 'sequence') { seq.push(order[seq.length % order.length]); continue; }
    if (!bag.length) { bag = shuffled(order, rng); if (seq.length && bag[0] === seq.at(-1) && bag.length > 1) bag.push(bag.shift()); }   // no immediate tower repeat across passes
    seq.push(bag.shift());
  }
  const hist = new ImageHistory(); const novelQueue = shuffled(imageIds, rng); let cueBag = [];
  const nextCue = () => { if (cuePolicy === 'random') return pick(cueValues, rng); if (!cueBag.length) cueBag = shuffled(cueValues, rng); return cueBag.pop(); };
  const trials = []; let nNovel = 0, nFamiliar = 0, fallbacks = 0;
  for (let t = 1; t <= nTrials; t++) {
    const ti = config.explicitTrials?.[t - 1]?.tower ?? seq[t - 1], tower = towers[ti];
    const slotsBlocks = tower.blocks.map((b, k) => [b, k]).filter(([b]) => b.image);
    const used = new Set(), slots = [];
    slotsBlocks.forEach(([blk, k], si) => {
      const ex = config.explicitTrials?.[t - 1]?.slots?.[si] ?? {};
      let want = ex.image ?? (blk.image === 'novel' || blk.image === 'familiar' ? blk.image : null);
      let lagTarget = null, imageId = null, role = null, fallback = null;
      if (typeof want === 'string' && want !== 'novel' && want !== 'familiar') { imageId = want; role = 'explicit'; if ((hist.counts[imageId] ?? 0) >= MAX_PRESENTATIONS) throw new Error(`Explicit image ${imageId} on trial ${t} would be its presentation number ${hist.counts[imageId] + 1}; the limit is ${MAX_PRESENTATIONS} per session.`); }
      else {
        if (want && typeof want === 'object') { lagTarget = want.lag; want = 'familiar'; }
        if (!want) want = (t > 1 && rng() >= novelProportion) ? 'familiar' : 'novel';
        if (want === 'familiar') {
          const lags = lagTarget ? [lagTarget] : shuffled(lagChoices, rng);
          for (const L of lags) { const prevImgs = t - L >= 1 ? (hist.trials[t - L - 1] ?? []).filter(x => !used.has(x) && hist.last[x] === t - L && hist.counts[x] === 1) : []; if (prevImgs.length)   /* candidates: images last shown exactly L trials ago */ { imageId = pick(prevImgs, rng); lagTarget = L; role = 'familiar'; break; } }
          if (!imageId) { fallback = 'novel_because_no_once_shown_image_at_a_listed_lag'; fallbacks++; want = 'novel'; }
        }
        if (want === 'novel') {
          imageId = novelQueue.find(x => !(hist.counts[x] > 0) && !used.has(x)); role = 'novel';
          if (!imageId) throw new Error(`Image pool exhausted on trial ${t}: ${imageIds.length} images are not enough for this many novel presentations; add images or lower novelProportion/nTrials.`);
        }
      }
      used.add(imageId);
      const cue = ex.cue ?? (typeof blk.cue === 'number' ? blk.cue : blk.cue === 'blue' ? 0 : blk.cue === 'red' ? 1 : nextCue());
      slots.push({ blockIndex: k, imageId, cue, role, lagTarget, fallback });
    });
    const { info } = hist.present(slots.map(s => s.imageId));
    slots.forEach(s => { s.expected = info[s.imageId]; if (s.expected.familiarity === 'novel') nNovel++; else nFamiliar++; });
    trials.push({ trialNumber: t, towerIndex: ti, slots });
  }
  const plan = { trials, stats: { nTrials, novelPresentations: nNovel, familiarPresentations: nFamiliar, fallbacks, distinctImages: Object.keys(hist.counts).length, seed: config.seed ?? 1 } };
  validatePlan(plan);
  return plan;
}
