// Rank candidate towers under a physics setting: hits to clear with optimal vs random placement (2 random assignments each). usage: node tools/rank_towers.mjs <towers.json> '<overrides>' <max> > ranked.json
import fs from 'node:fs';
import { initPhysics, Simulation } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { PHYS, EFFECT } from '../src/experiment.js';
import { effectiveness } from '../src/effectiveness.js';
import { mulberry32 } from '../src/rng.js';
await initPhysics();
const towers = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).slice(0, +(process.argv[4] ?? 60)); const ov = JSON.parse(process.argv[3] ?? '{}');
if (ov.mass) PHYS.blockMass = ov.mass; if (ov.impulse) CONFIG.impulseMagnitude = ov.impulse; if (ov.friction) CONFIG.block.friction = ov.friction; if (ov.platformFriction) CONFIG.platform.friction = ov.platformFriction; if (ov.effect) Object.assign(EFFECT, ov.effect);
const dir = { x: -0.5714, y: 0, z: -0.8207 }, CUES = [0, 0.25, 0.5, 0.75, 1]; const rng = mulberry32(11);
const settle = sim => { let rest = 0, t = 0; for (let i = 0; i < 720; i++) { sim.step(); t += 1 / 120; rest = sim.isAtRest() ? rest + 1 / 120 : 0; if (rest >= CONFIG.settle.seconds || t >= CONFIG.settle.maxWaitSeconds) break; } return t; };
function play(tower, strategy) {
  const sim = new Simulation(tower); let hits = 0, time = 0;
  while (hits < 50) {
    const cand = sim.blocks.filter(b => !b.cleared && b.props.actionable); if (!cand.length) return { hits, time };
    const b = cand.reduce((a, c) => (c.body.translation().y < a.body.translation().y ? c : a)); const pref = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u: 0.5, v: 0.5 });
    const [u, v] = strategy === 'optimal' ? [pref.preferredX, pref.preferredY] : [rng(), rng()]; const e = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u, v }); const p = b.body.translation(), [w, h, d] = b.size;
    sim.applyImpulseAtPoint(b, { x: p.x + (u - 0.5) * w, y: p.y + (v - 0.5) * h, z: p.z + d / 2 }, dir, CONFIG.impulseMagnitude * e.multiplier); hits++; time += settle(sim);
  }
  return { hits: 50, time };
}
const out = [];
towers.forEach((t, k) => { const rows = [];
  for (let a = 0; a < 2; a++) { const tower = { blocks: t.blocks.map(b => b.image ? { ...b, cue: CUES[Math.floor(rng() * 5)], familiarity: rng() < 0.5 ? 'novel' : 'familiar', imageId: 'x', actionable: true, color: 0 } : { ...b, cue: null, imageId: null, actionable: false, color: 0 }) };
    rows.push([play(tower, 'optimal'), play(tower, 'random')]); }
  const m = i => rows.reduce((s, r) => s + r[i].hits, 0) / rows.length;
  out.push({ ...t, optimal: m(0), random: m(1) }); console.error(k, t.metrics.n, 'blocks', t.metrics.images, 'img  optimal', m(0).toFixed(1), 'random', m(1).toFixed(1)); });
console.log(JSON.stringify(out));
