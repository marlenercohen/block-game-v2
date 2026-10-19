// How much of each image block's front (+z) / right (+x) face is visible from the fixed camera? (ray casting against the block boxes)
import { CONFIG } from '../src/config.js';
const cam = CONFIG.camera.position;
function hitBox(o, d, b) {      // ray-AABB: returns distance or Infinity
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) { const lo = b.pos[a] - b.size[a] / 2, hi = b.pos[a] + b.size[a] / 2; if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return Infinity; } else { let u = (lo - o[a]) / d[a], v = (hi - o[a]) / d[a]; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return Infinity; } }
  return t0;
}
/** returns, for every block index, { front, right } = visible fraction of that face (0..1) */
export function faceVisibility(blocks, n = 7) {
  return blocks.map((b, i) => {
    const res = {};
    for (const face of ['front', 'right']) { let vis = 0, tot = 0;
      for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) { const s = (a + 0.5) / n, t = (c + 0.5) / n;
        const p = face === 'front' ? [b.pos[0] + (s - 0.5) * b.size[0], b.pos[1] + (t - 0.5) * b.size[1], b.pos[2] + b.size[2] / 2 + 1e-3] : [b.pos[0] + b.size[0] / 2 + 1e-3, b.pos[1] + (t - 0.5) * b.size[1], b.pos[2] + (s - 0.5) * b.size[2]];
        const d = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]]; const L = Math.hypot(...d); d[0] /= L; d[1] /= L; d[2] /= L;
        let best = Infinity, who = -1; blocks.forEach((o, j) => { const tt = hitBox(cam, d, o); if (tt < best) { best = tt; who = j; } }); tot++; if (who === i) vis++; }
      res[face] = vis / tot; }
    return res;
  });
}
