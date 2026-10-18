// Per-trial bookkeeping used to add first-hit indicators and block-state fields to the event log. Observation only: it never changes the physics or the interaction.
export const ANALYSIS = {
  // a block counts as "previously moved/disturbed" once, before a given hit, it has been displaced / rotated / has moved faster than these thresholds
  movedMeters: 0.03, rotatedDeg: 3, speed: 0.15,
};
const deg = r => (r * 180) / Math.PI;
const quatAngleDeg = (a, b) => deg(2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w))));
const r3 = v => Math.round(v * 1000) / 1000;

export class BlockTracker {
  constructor(sim) {
    this.init = sim.blocks.map(b => ({ p: { ...b.body.translation() }, q: { ...b.body.rotation() } }));
    const n = sim.blocks.length, z = () => new Array(n).fill(0);
    this.maxSpeed = z(); this.attempts = z(); this.actionableAttempts = z(); this.impulses = z();
    this.totalImpulses = 0; this.impulsedBlocks = new Set();
  }
  /** Call every frame (cheap): remembers the fastest each block has moved so far. */
  update(sim) {
    sim.blocks.forEach((b, i) => { if (b.removed) return; const v = b.body.linvel(); const s = Math.hypot(v.x, v.y, v.z); if (s > this.maxSpeed[i]) this.maxSpeed[i] = s; });
  }
  /** Pose of a block now and how much it has been disturbed since the tower appeared. */
  stateOf(block) {
    const i = block.id, p = block.body.translation(), q = block.body.rotation(), I = this.init[i];
    const disp = Math.hypot(p.x - I.p.x, p.y - I.p.y, p.z - I.p.z), rot = quatAngleDeg(q, I.q);
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);                                 // world-y component of the block's own up axis
    const tilt = deg(Math.acos(Math.max(-1, Math.min(1, upY))));
    return {
      position: { x: r3(p.x), y: r3(p.y), z: r3(p.z) }, quaternion: { x: r3(q.x), y: r3(q.y), z: r3(q.z), w: r3(q.w) }, tiltDeg: r3(tilt),
      displacementFromInitial: r3(disp), rotationFromInitialDeg: r3(rot), maxSpeedSoFar: r3(this.maxSpeed[i]),
      previouslyMoved: disp > ANALYSIS.movedMeters || rot > ANALYSIS.rotatedDeg || this.maxSpeed[i] > ANALYSIS.speed,
    };
  }
  /** First-attempt indicators for a press that landed on block i (call once per press, before the press is counted). */
  flagsForAttempt(i, actionable) {
    const first = { attemptOnBlock: this.attempts[i] === 0, actionableAttemptOnBlock: actionable && this.actionableAttempts[i] === 0, impulseOnBlock: null };
    this.attempts[i]++; if (actionable) this.actionableAttempts[i]++;
    return first;
  }
  /** Trial history at the moment of the press. */
  context(i) { return { priorImpulsesOnTrial: this.totalImpulses, priorImpulseOnOtherBlock: [...this.impulsedBlocks].some(k => k !== i) }; }
  /** An impulse was applied to block i: returns true if it is the first impulse that block received. */
  noteImpulse(i) { const first = this.impulses[i] === 0; this.impulses[i]++; this.totalImpulses++; this.impulsedBlocks.add(i); return first; }
}
