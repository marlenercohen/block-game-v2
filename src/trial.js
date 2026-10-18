// Presenter: decides, for each presentation of a tower, which blocks show which image, and from the image's familiarity
// (how many times THAT IMAGE has been presented in this session, on any tower, at any position, in any colour) whether it is novel or familiar.
// Pure logic (no DOM), so it can be tested in Node.
import { IMAGES, CUE, cueOf, colorForCue, familiarityOfPresentation, NO_IMAGE_COLOR } from './experiment.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Presenter {
  /** counts: { imageId: number of presentations so far } (persisted by the logger across page reloads) */
  constructor({ seed = IMAGES.seed, counts = {} } = {}) {
    this.seed = seed ?? Math.floor(Math.random() * 2 ** 32);
    this.rng = mulberry32(this.seed);
    this.counts = counts;
    this.presentationIndex = 0;
  }

  /**
   * One new presentation of `tower`. Counts every image shown as presented once more. A Reset must NOT call this again: it reuses the
   * returned assignment, so the same tower comes back with the same images, masses and colours.
   * Returns { blocks: [ per-block resolved properties ] } where each entry has:
   *   imageId|null, presentationNumber|null, familiarity 'novel'|'familiar'|null, cue (0 blue .. 1 red; null for blocks without image), color (gray without image), actionable
   */
  present(tower) {
    this.presentationIndex++;
    const used = new Set();
    const pickNew = () => {
      const pool = IMAGES.ids.filter(id => !(this.counts[id] > 0) && !used.has(id));
      return pool.length ? pool[Math.floor(this.rng() * pool.length)] : null;
    };
    const pickSeen = () => {
      const pool = IMAGES.ids.filter(id => this.counts[id] > 0 && !used.has(id));
      return pool.length ? pool[Math.floor(this.rng() * pool.length)] : null;
    };
    const choose = slot => {
      let id = null;
      if (slot === 'novel') id = pickNew();
      else if (slot === 'familiar') id = pickSeen() ?? pickNew();
      else id = (this.rng() < IMAGES.repeatProbability ? pickSeen() : null) ?? pickNew() ?? pickSeen();   // 'any'
      return id;
    };
    const blocks = tower.blocks.map(spec => {
      let imageId = null, presentationNumber = null, familiarity = null;
      if (spec.image) {
        imageId = choose(spec.image === true ? 'any' : spec.image);
        if (imageId) {
          used.add(imageId);
          presentationNumber = (this.counts[imageId] ?? 0) + 1;
          familiarity = familiarityOfPresentation(presentationNumber);
        }
      }
      // only image blocks carry a colour cue (blocks without image are neutral gray and cannot be hit)
      const cue = !imageId ? null : spec.cue === 'random' ? CUE.values[Math.floor(this.rng() * CUE.values.length)] : cueOf(spec.cue ?? 0.5);
      return { imageId, presentationNumber, familiarity, cue, color: imageId ? colorForCue(cue) : NO_IMAGE_COLOR, actionable: !!imageId };
    });
    for (const b of blocks) if (b.imageId) this.counts[b.imageId] = (this.counts[b.imageId] ?? 0) + 1;   // presented now
    return { presentation: this.presentationIndex, blocks };
  }
}
