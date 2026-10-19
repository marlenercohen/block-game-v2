// How many hits do the tutorial towers need with random / centre / optimal placement (current physics)? usage: node tools/tutorial_check.mjs
import { initPhysics, Simulation } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { TUTORIAL_TOWERS } from '../src/tutorial.js';
import { effectiveness } from '../src/effectiveness.js';
import { mulberry32 } from '../src/rng.js';
import { applyPreset } from '../src/presets.js';
applyPreset(process.env.PRESET ?? 'v22');   // the tutorial is played with the physics/effect of the default preset
await initPhysics();
const dir = { x: -0.5714, y: 0, z: -0.8207 }, rng = mulberry32(3);
function play(tower, fam, strategy) {
  const sim = new Simulation({ ...tower, blocks: tower.blocks.map(b => b.image ? { ...b, imageId: 'x', actionable: true, cue: 0.5, familiarity: fam, color: 0 } : { ...b, imageId: null, actionable: false, cue: null, color: 0 }) }); let hits = 0;
  while (hits < 40) { const c = sim.blocks.filter(b => !b.cleared && b.props.actionable); if (!c.length) return hits; const b = c[0];
    const pref = effectiveness({ cue: 0.5, familiarity: fam, u: 0.5, v: 0.5 }); const [u, v] = strategy === 'optimal' ? [pref.preferredX, pref.preferredY] : strategy === 'centre' ? [0.5, 0.5] : [rng(), rng()];
    const e = effectiveness({ cue: 0.5, familiarity: fam, u, v }), p = b.body.translation(), [w, h, d] = b.size;
    sim.applyImpulseAtPoint(b, { x: p.x + (u - 0.5) * w, y: p.y + (v - 0.5) * h, z: p.z + d / 2 }, dir, CONFIG.impulseMagnitude * e.multiplier); hits++;
    let rest = 0, t = 0; for (let i = 0; i < 720; i++) { sim.step(); t += 1 / 120; rest = sim.isAtRest() ? rest + 1 / 120 : 0; if (rest >= CONFIG.settle.seconds || t >= CONFIG.settle.maxWaitSeconds) break; } }
  return 40;
}
for (const [name, tw] of Object.entries(TUTORIAL_TOWERS)) for (const fam of ['novel', 'familiar']) {
  const row = ['optimal', 'centre', 'random'].map(s => { const a = Array.from({ length: s === 'random' ? 40 : 1 }, () => play(tw, fam, s)); return `${s} ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}${s === 'random' ? ' (max ' + Math.max(...a) + ')' : ''}`; });
  console.log(`${name.padEnd(9)} ${fam.padEnd(8)} hits to clear: ${row.join(' | ')}`);
}
