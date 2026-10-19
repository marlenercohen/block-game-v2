// Evaluate physics/effect parameters on a set of towers (JSON file of candidates or "set:v21"): hit contrast and hits needed per strategy.
// usage: node tools/eval_physics.mjs <towers.json> '<overrides JSON>' [maxTowers=30]
//   overrides: { "mass":1.0, "impulse":2.0, "friction":0.5, "platformFriction":0.5, "effect":{"baseline":0.3,...} }
import fs from 'node:fs';
import { initPhysics, Simulation } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { PHYS, EFFECT, colorForCue } from '../src/experiment.js';
import { effectiveness } from '../src/effectiveness.js';
import { mulberry32 } from '../src/rng.js';
await initPhysics();
import { TOWER_SETS } from '../src/towers.js';
const towers = (process.argv[2].startsWith('set:') ? TOWER_SETS[process.argv[2].slice(4)] : JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))).slice(0, +(process.argv[4] ?? 30));
const ov = JSON.parse(process.argv[3] ?? '{}');
if (ov.mass) PHYS.blockMass = ov.mass; if (ov.impulse) CONFIG.impulseMagnitude = ov.impulse; if (ov.friction) CONFIG.block.friction = ov.friction;
if (ov.platformFriction) CONFIG.platform.friction = ov.platformFriction; if (ov.effect) Object.assign(EFFECT, ov.effect);
const CAP = +(process.env.CAP ?? 60);
const dir = { x: -0.5714, y: 0, z: -0.8207 }; const rng = mulberry32(5);
const CUES = [0, 0.25, 0.5, 0.75, 1];
const build = t => { const bl = t.blocks.map(b => b.image ? { ...b, cue: CUES[Math.floor(rng() * 5)], familiarity: rng() < 0.5 ? 'novel' : 'familiar', imageId: 'x', actionable: true, color: 0 } : { ...b, cue: null, imageId: null, actionable: false, color: 0 }); return { blocks: bl }; };
const settle = sim => { let rest = 0, t = 0; for (let i = 0; i < 720; i++) { sim.step(); t += 1 / 120; rest = sim.isAtRest() ? rest + 1 / 120 : 0; if (rest >= CONFIG.settle.seconds || t >= CONFIG.settle.maxWaitSeconds) break; } };
function hitAt(sim, b, u, v) {
  const p = b.body.translation(), [w, h, d] = b.size;
  const e = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u, v });
  sim.applyImpulseAtPoint(b, { x: p.x + (u - 0.5) * w, y: p.y + (v - 0.5) * h, z: p.z + d / 2 }, dir, CONFIG.impulseMagnitude * e.multiplier); return e;
}
function play(tower, strategy) {
  const sim = new Simulation(tower); let hits = 0;
  while (hits < CAP) {
    const cand = sim.blocks.filter(b => !b.cleared && b.props.actionable); if (!cand.length) return { won: true, hits };
    const b = cand.reduce((a, c) => (c.body.translation().y < a.body.translation().y ? c : a));
    const pref = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u: 0.5, v: 0.5 });
    let u, v; if (strategy === 'optimal') [u, v] = [pref.preferredX, pref.preferredY]; else if (strategy === 'worst') [u, v] = [1 - pref.preferredX, 1 - pref.preferredY]; else if (strategy === 'ignoreColor') [u, v] = [0.5, pref.preferredY]; else if (strategy === 'ignoreFamiliarity') [u, v] = [pref.preferredX, 0.5]; else [u, v] = [rng(), rng()];
    hitAt(sim, b, u, v); hits++; settle(sim);
  }
  return { won: false, hits };
}
function contrast(tower) {            // first hit on each image block of a fresh tower: optimal vs worst location
  const res = { opt: { disp: 0, moved: 0, cleared: 0 }, bad: { disp: 0, moved: 0, cleared: 0 }, n: 0 };
  const probe = new Simulation(tower); const idx = probe.blocks.filter(b => b.props.actionable).map(b => b.id);
  for (const id of idx) for (const mode of ['opt', 'bad']) {
    const sim = new Simulation(tower), b = sim.blocks[id], p0 = sim.blocks.map(x => ({ ...x.body.translation() }));
    const pref = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u: 0.5, v: 0.5 });
    const [u, v] = mode === 'opt' ? [pref.preferredX, pref.preferredY] : [1 - pref.preferredX, 1 - pref.preferredY]; hitAt(sim, b, u, v);
    for (let i = 0; i < 360; i++) sim.step();
    let moved = 0; sim.blocks.forEach((x, i) => { if (!x.removed && Math.hypot(x.body.translation().x - p0[i].x, x.body.translation().z - p0[i].z, x.body.translation().y - p0[i].y) > 0.15) moved++; });
    const q = b.removed ? null : b.body.translation(); res[mode].disp += q ? Math.min(6, Math.hypot(q.x - p0[id].x, q.y - p0[id].y, q.z - p0[id].z)) : 6; res[mode].moved += moved; res[mode].cleared += sim.blocks.filter(x => x.cleared).length;
    if (mode === 'opt') res.n++;
  }
  return res;
}
const agg = { opt: [0, 0, 0], bad: [0, 0, 0], n: 0 }; const STRATS = ['optimal', 'ignoreColor', 'ignoreFamiliarity', 'random', 'worst']; const hitsBy = Object.fromEntries(STRATS.map(s => [s, []])); const wins = Object.fromEntries(STRATS.map(s => [s, 0]));
for (const t of towers) {
  const tower = build(t); const c = contrast(tower); for (const m of ['opt', 'bad']) { agg[m][0] += c[m].disp; agg[m][1] += c[m].moved; agg[m][2] += c[m].cleared; } agg.n += c.n;
  for (const s of STRATS) { const r = play(tower, s); hitsBy[s].push(r.hits); if (r.won) wins[s]++; }
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log(JSON.stringify(ov));
console.log(`  first hit on an image block (avg over ${agg.n} hits): optimal -> block moves ${(agg.opt[0] / agg.n).toFixed(2)} m, ${(agg.opt[1] / agg.n).toFixed(2)} blocks displaced, ${(agg.opt[2] / agg.n).toFixed(2)} cleared | poor -> ${(agg.bad[0] / agg.n).toFixed(2)} m, ${(agg.bad[1] / agg.n).toFixed(2)} displaced, ${(agg.bad[2] / agg.n).toFixed(2)} cleared`);
console.log(`  hits to clear (mean over ${towers.length} towers, cap ${CAP}; won%): ` + STRATS.map(k => `${k} ${mean(hitsBy[k]).toFixed(1)} (${(100 * wins[k] / towers.length).toFixed(0)}%)`).join(' | '));
