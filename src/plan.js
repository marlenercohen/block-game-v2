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
      if (typeof want === 'string' && want !== 'novel' && want !== 'familiar') { imageId = want; role = 'explicit'; }
      else {
        if (want && typeof want === 'object') { lagTarget = want.lag; want = 'familiar'; }
        if (!want) want = (t > 1 && rng() >= novelProportion) ? 'familiar' : 'novel';
        if (want === 'familiar') {
          const lags = lagTarget ? [lagTarget] : shuffled(lagChoices, rng);
          for (const L of lags) { const prevImgs = t - L >= 1 ? (hist.trials[t - L - 1] ?? []).filter(x => !used.has(x) && hist.last[x] === t - L) : []; if (prevImgs.length)   /* candidates: images last shown exactly L trials ago */ { imageId = pick(prevImgs, rng); lagTarget = L; role = 'familiar'; break; } }
          if (!imageId) { const any = Object.keys(hist.counts).filter(x => !used.has(x)); if (any.length) { imageId = pick(any, rng); role = 'familiar'; fallback = 'any_previous_image'; fallbacks++; } }
          if (!imageId) { fallback = 'novel_because_no_previous_image'; fallbacks++; want = 'novel'; }
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
  return { trials, stats: { nTrials, novelPresentations: nNovel, familiarPresentations: nFamiliar, fallbacks, distinctImages: Object.keys(hist.counts).length, seed: config.seed ?? 1 } };
}
