// Image presentation history (pure logic). Familiarity = prior PRESENTATION of the image within the session pool, never whether it was clicked:
// an image counts as presented once per trial in which a tower showing it appears (repeated frames of the same trial are not extra presentations).
// One instance per pool: the experiment and the tutorial use separate instances so practice cannot contaminate experimental familiarity.
export class ImageHistory {
  constructor() { this.counts = {}; this.last = {}; this.trials = []; }   // trials[i] = image ids shown on (1-based) trial i+1 of this history

  /** Register the images shown on the next trial. Returns { trial, info: { imageId: {...} } } with, per image:
   *  presentationNumber (1 = first ever), familiarity ('novel' | 'familiar'), previousTrial (1-based index in this history or null),
   *  lagTrials (current - previous), interveningTrials (lag - 1), interveningDistinctImages (distinct OTHER images shown in the trials strictly between
   *  the two presentations; images shown alongside it in either of the two trials are not counted). */
  present(imageIds) {
    const t = this.trials.length + 1, info = {};
    for (const id of imageIds) {
      const n = (this.counts[id] ?? 0) + 1, prev = this.last[id] ?? null;
      let lag = null, inter = null, distinct = null;
      if (prev !== null) {
        lag = t - prev; inter = lag - 1; const s = new Set();
        for (let k = prev + 1; k < t; k++) for (const x of this.trials[k - 1]) if (x !== id) s.add(x);
        distinct = s.size;
      }
      info[id] = { presentationNumber: n, familiarity: n === 1 ? 'novel' : 'familiar', previousTrial: prev, lagTrials: lag, interveningTrials: inter, interveningDistinctImages: distinct };
    }
    for (const id of imageIds) { this.counts[id] = (this.counts[id] ?? 0) + 1; this.last[id] = t; }
    this.trials.push([...imageIds]);
    return { trial: t, info };
  }
  toJSON() { return { counts: this.counts, last: this.last, trials: this.trials }; }
}
