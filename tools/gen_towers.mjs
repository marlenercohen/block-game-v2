// Random tower generator + stability filter (used once to find candidate tower designs; the chosen designs are frozen as data in src/towers_v21.js).
// usage: node tools/gen_towers.mjs <nCandidates> <seed> > candidates.json
import { initPhysics, Simulation } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { PHYS } from '../src/experiment.js';
import { mulberry32, pick } from '../src/rng.js';
await initPhysics();
const N = +(process.argv[2] ?? 200), rng = mulberry32(+(process.argv[3] ?? 1)), MIN_N = +(process.argv[4] ?? 5), MAX_N = +(process.argv[5] ?? 9);
const CUBE = [1.2, 1.2, 0.9];
const PIECES = [
  { size: CUBE, image: true, w: 4 }, { size: CUBE, image: false, w: 2 },
  { size: [2.6, 0.5, 0.9], image: false, w: 2 }, { size: [3.2, 0.5, 0.9], image: false, w: 1 }, { size: [1.5, 0.5, 1.5], image: false, w: 1 },
  { size: [0.7, 0.7, 0.7], image: false, w: 1 }, { size: [0.6, 1.2, 0.6], image: false, w: 1 },
];
const wpick = () => { const tot = PIECES.reduce((s, p) => s + p.w, 0); let r = rng() * tot; for (const p of PIECES) { r -= p.w; if (r <= 0) return p; } return PIECES[0]; };
const top = b => b.pos[1] + b.size[1] / 2, bottom = b => b.pos[1] - b.size[1] / 2;
const overlapXZ = (a, b, eps = 1e-3) => Math.abs(a.pos[0] - b.pos[0]) < (a.size[0] + b.size[0]) / 2 - eps && Math.abs(a.pos[2] - b.pos[2]) < (a.size[2] + b.size[2]) / 2 - eps;
function generate() {
  const blocks = []; const n = MIN_N + Math.floor(rng() * (MAX_N - MIN_N + 1));
  for (let i = 0; i < n; i++) {
    const piece = i < 2 ? PIECES[rng() < 0.7 ? 0 : 1] : wpick();
    let x, z;
    if (i === 0) { x = (rng() - 0.5) * 1.6; z = -0.55 + (rng() - 0.5) * 0.5; }
    else if (i === 1 && rng() < 0.7) { const b0 = blocks[0]; x = b0.pos[0] + (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.5); z = b0.pos[2] + (rng() - 0.5) * 0.6; }   // second ground piece
    else { const base = pick(blocks, rng); x = base.pos[0] + (rng() - 0.5) * 1.3; z = base.pos[2] + (rng() - 0.5) * 0.7; }
    z = Math.max(-1.1, Math.min(0.1, z)); x = Math.max(-1.9 + piece.size[0] / 2 - 0.0, Math.min(1.9 - piece.size[0] / 2 + 0.0, x));
    const cand = { size: piece.size, pos: [x, 0, z], image: piece.image, cue: 0.5 };
    // drop onto the highest top below in this footprint
    let base = 0; for (const b of blocks) if (overlapXZ(cand, b)) base = Math.max(base, top(b));
    cand.pos[1] = base + piece.size[1] / 2; blocks.push(cand);
  }
  return blocks;
}
function metrics(blocks) {
  const edges = []; blocks.forEach((a, i) => blocks.forEach((b, j) => { if (i !== j && Math.abs(bottom(b) - top(a)) < 0.02 && overlapXZ(a, b)) edges.push([i, j]); }));
  const levels = new Set(blocks.map(b => Math.round(bottom(b) * 10) / 10)).size;
  const grounded = blocks.filter(b => bottom(b) < 0.01).length, height = Math.max(...blocks.map(top));
  const supporters = new Set(edges.map(e => e[0])).size;
  return { n: blocks.length, edges: edges.length, levels, grounded, height: +height.toFixed(2), supporters, images: blocks.filter(b => b.image).length };
}
const out = [];
for (let k = 0; k < N; k++) {
  const blocks = generate(); const m = metrics(blocks);
  if (m.n < MIN_N || m.levels < 3 || m.images < 2 || m.images > 4 || m.height > 4.7 || m.grounded > 3 || m.edges < m.n - m.grounded) continue;
  // spawn stability under the CURRENT physics parameters
  const tower = { blocks: blocks.map(b => ({ ...b, cue: 0.5, color: 0, imageId: b.image ? 'x' : null, actionable: b.image })) };
  const sim = new Simulation(tower); let shift = 0; if (sim.blocks.some(b => b.removed || b.cleared || b.body.translation().y < 0)) continue; sim.blocks.forEach((b, i) => { const p = b.body.translation(), s = blocks[i].pos; shift = Math.max(shift, Math.hypot(p.x - s[0], p.z - s[2]), Math.abs(p.y - s[1])); });
  const before = sim.blocks.map(b => ({ ...b.body.translation() })); for (let i = 0; i < 360; i++) sim.step(); let drift = 0; if (sim.blocks.some(b => b.removed)) continue; sim.blocks.forEach((b, i) => { const p = b.body.translation(); drift = Math.max(drift, Math.hypot(p.x - before[i].x, p.y - before[i].y, p.z - before[i].z)); });
  if (shift > 0.05 || drift > 1e-6) continue;
  out.push({ blocks: blocks.map(b => ({ size: b.size, pos: b.pos.map(v => +v.toFixed(3)), image: b.image })), metrics: m });
}
console.error(`generated ${out.length} stable candidates out of ${N} attempts`);
console.log(JSON.stringify(out));
