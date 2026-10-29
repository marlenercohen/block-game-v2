// Obstruction study library: plays a tower with a click strategy on the real physics and reports whether it ends cleared, in a HARD deadlock (no reachable, horizontally-allowed point
// on any remaining image block: every click would only add a penalty block) or at the hit cap. Used by obstruction_study.mjs and by the regression tests (v2_checks.mjs).
import { Simulation } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { effectiveness } from '../src/effectiveness.js';
import { accessibility } from './accessibility.mjs';
import { mulberry32 } from '../src/rng.js';
const dir = { x: -0.5714, y: 0, z: -0.8207 }, CUES = [0, 0.25, 0.5, 0.75, 1];
const settle = sim => { let rest = 0, t = 0; for (let i = 0; i < 720; i++) { sim.step(); t += 1 / 120; rest = sim.isAtRest() ? rest + 1 / 120 : 0; if (rest >= CONFIG.settle.seconds || t >= CONFIG.settle.maxWaitSeconds) break; } };
const fully = sim => { for (let g = 0; g < 720 && !sim.isAtRest(); g++) sim.step(); for (let g = 0; g < 600 && sim.blocks.some(b => !b.cleared && b.props.actionable && sim._isOffPlatform(b)); g++) sim.step(); for (let g = 0; g < 720 && !sim.isAtRest(); g++) sim.step(); };
/** random cue / familiarity for every image block (deterministic from the seed) */
export function assign(towerSpec, seed) { const rng = mulberry32(seed); return { ...towerSpec, blocks: towerSpec.blocks.map(b => b.image ? { ...b, cue: CUES[Math.floor(rng() * 5)], familiarity: rng() < 0.5 ? 'novel' : 'familiar', imageId: 'x', actionable: true, color: 0 } : { ...b, cue: null, imageId: null, actionable: false, color: 0 }) }; }
/** strategies: 'best' (strongest reachable allowed point of the lowest block), 'random' (random reachable allowed point), 'sloppy' (random reachable allowed point with multiplier < 1: deliberately poor) */
export function playTower(tower, strat, phase, seed, cap = 150) {
  const rng = mulberry32(seed * 31 + 5), sim = new Simulation(tower); let hits = 0, state = 'cleared', initialBest = null;
  while (hits < cap) {
    fully(sim); const acc = accessibility(sim, phase).filter(a => !sim._isOffPlatform(sim.blocks[a.id])); if (!acc.length) break;
    const best = Math.max(...acc.map(a => a.bestUseful)); if (initialBest === null) initialBest = best;
    if (best === 0) { state = 'HARD'; break; }
    const cand = acc.filter(a => a.samples.some(s => s.useful)), pick = cand.reduce((a, c) => (sim.blocks[c.id].body.translation().y < sim.blocks[a.id].body.translation().y ? c : a));
    const S = pick.samples.filter(s => s.useful); let s;
    if (strat === 'best') s = S.reduce((a, c) => (c.mult > a.mult ? c : a)); else if (strat === 'sloppy') { const L = S.filter(x => x.mult < 1.0), P = L.length ? L : S; s = P[Math.floor(rng() * P.length)]; } else s = S[Math.floor(rng() * S.length)];
    const b = sim.blocks[pick.id], e = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u: s.u, v: s.v, phase });
    sim.applyImpulseAtPoint(b, { x: s.P.x, y: s.P.y, z: s.P.z }, dir, CONFIG.impulseMagnitude * e.multiplier); hits++; settle(sim);
  }
  if (state === 'cleared' && !sim.blocks.every(b => b.cleared || !b.props.actionable)) state = 'CAP';
  return { state, hits, initialBest, sim };
}
