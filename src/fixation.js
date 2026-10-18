// Trial start control. Human version: the participant clicks/taps the central plus. A future monkey version will replace the body of waitForStart() with
// "gaze stays inside the plus region for `durationMs`" (e.g. 200-300 ms) while keeping the same contract: it resolves with { x, y, pointerType|'gaze', mode, timeMs }.
// Nothing else in the game depends on how the trial was started. GAZE CONTROL IS NOT IMPLEMENTED.
export class ClickStart {
  constructor(element) { this.el = element; this.mode = 'click'; }
  /** Resolves when the participant starts the trial. */
  waitForStart() {
    return new Promise(resolve => {
      const handler = e => { e.preventDefault(); this.el.removeEventListener('pointerdown', handler); resolve({ x: e.clientX, y: e.clientY, pointerType: e.pointerType, mode: this.mode, timeMs: performance.now() }); };
      this.el.addEventListener('pointerdown', handler);
    });
  }
  cancel() { /* nothing to cancel for clicks */ }
}

export function createStartControl(element, cfg = { mode: 'click', durationMs: 0 }) {
  if (cfg.mode === 'click') return new ClickStart(element);
  // if (cfg.mode === 'gaze') return new GazeFixationStart(element, { durationMs: cfg.durationMs, gazeSource });   // future monkey version
  throw new Error(`start control mode "${cfg.mode}" is not implemented`);
}
