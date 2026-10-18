// How many hits does it take to clear each tower with different hit-placement strategies? usage: node tools/playability.mjs [presentationsPerTower=30]
// Strategy 'optimal' = aim at the preferred position for the block's colour/familiarity; 'centre' = middle of the face; 'worst' = the opposite of the
// preferred position on both axes; 'random' = uniformly random position on the front face. Image blocks only, always the front (+z) face;
// the lowest remaining image block first; waits for the 0.5 s / settled rule between hits. Cap 40 hits.
import { initPhysics, Simulation } from '../src/physics.js';
import { TOWERS } from '../src/towers.js';
import { Presenter } from '../src/trial.js';
import { CONFIG } from '../src/config.js';
import { isTargetBlock } from '../src/experiment.js';
import { effectiveness } from '../src/effectiveness.js';
await initPhysics();
const N = +(process.argv[2] ?? 30); const dir = { x: -0.5714, y: 0, z: -0.8207 };
let seed = 1; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function play(tower, assignment, strategy) {
  const sim = new Simulation({ ...tower, blocks: tower.blocks.map((b, k) => ({ ...b, ...assignment.blocks[k] })) }); let hits = 0, sumMult = 0;
  while (hits < 40) {
    if (sim.blocks.every(b => b.cleared || !isTargetBlock(b))) return { won: true, hits, mult: sumMult / Math.max(1, hits) };
    const cand = sim.blocks.filter(b => !b.cleared && b.props.actionable); if (!cand.length) return { won: false, hits };
    const b = cand.reduce((a, c) => (c.body.translation().y < a.body.translation().y ? c : a));
    const pref = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u: 0.5, v: 0.5 });
    let u, v; if (strategy === 'optimal') [u, v] = [pref.preferredX, pref.preferredY]; else if (strategy === 'centre') [u, v] = [0.5, 0.5];
    else if (strategy === 'worst') [u, v] = [1 - pref.preferredX, 1 - pref.preferredY]; else [u, v] = [rng(), rng()];
    const e = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u, v }); sumMult += e.multiplier;
    const p = b.body.translation(), [w, h, d] = b.size;
    sim.applyImpulseAtPoint(b, { x: p.x + (u - 0.5) * w, y: p.y + (v - 0.5) * h, z: p.z + d / 2 }, dir, CONFIG.impulseMagnitude * e.multiplier); hits++;
    let rest = 0, t = 0; for (let i = 0; i < 120 * 6; i++) { sim.step(); t += 1 / 120; rest = sim.isAtRest() ? rest + 1 / 120 : 0; if (rest >= CONFIG.settle.seconds || t >= CONFIG.settle.maxWaitSeconds) break; }
  }
  return { won: false, hits, mult: sumMult / hits };
}
console.log(`strategy   ${TOWERS.map((_, i) => `T${i + 1}`.padEnd(14)).join('')} overall mean hits (won only)`);
for (const strategy of ['optimal', 'centre', 'random', 'worst']) {
  let allHits = 0, allWon = 0;
  const cols = TOWERS.map((tw, ti) => { let won = 0, hits = 0; const pr = new Presenter({ seed: 100 + ti });
    for (let k = 0; k < N; k++) { const r = play(tw, pr.present(tw), strategy); if (r.won) { won++; hits += r.hits; } }
    allHits += hits; allWon += won; return `${(100 * won / N).toFixed(0)}% ${won ? (hits / won).toFixed(1) : '-'}h`.padEnd(14); });
  console.log(strategy.padEnd(10), cols.join(''), (allHits / allWon).toFixed(2));
}
