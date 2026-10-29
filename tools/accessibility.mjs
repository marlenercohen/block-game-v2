// Accessibility of the remaining actionable blocks (pure geometry on top of a Simulation; used by the obstruction investigation and the regression tests).
// For every remaining actionable block we sample points on its faces (object-centred face coordinates u, v exactly as in faceCoordinates), ask whether a click there would
// actually reach the block (the line from the camera to the point is not blocked by any other block, the platform, or the block's own far side), and what hit strength the
// hit-strength function would give there. "Useful" = reachable AND horizontal error <= penalty threshold (otherwise the click only adds a penalty block) AND strong enough.
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { effectiveness } from '../src/effectiveness.js';
import { PENALTY } from '../src/experiment.js';
import { horizontalError } from '../src/penalty.js';

const CAM = new THREE.Vector3(...CONFIG.camera.position);

function obbOf(b) { const t = b.body.translation(), q = b.body.rotation(); const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w); return { c: new THREE.Vector3(t.x, t.y, t.z), q: quat, inv: quat.clone().invert(), h: b.size.map(x => x / 2) }; }
/** entry distance (t >= 0, direction unit) of a ray into an oriented box, or Infinity */
function rayObb(o, d, ob) {
  const lo = o.clone().sub(ob.c).applyQuaternion(ob.inv), ld = d.clone().applyQuaternion(ob.inv); let t0 = 0, t1 = Infinity;
  for (const k of ['x', 'y', 'z']) { const i = { x: 0, y: 1, z: 2 }[k], h = ob.h[i];
    if (Math.abs(ld[k]) < 1e-12) { if (Math.abs(lo[k]) > h) return Infinity; continue; }
    let a = (-h - lo[k]) / ld[k], b = (h - lo[k]) / ld[k]; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; }
  return t0;
}
/** inverse of faceCoordinates: block-local point for (face, u, v); top/bottom faces take an extra z fraction */
export function localPointOf(size, face, u, v, zf = 0.5) {
  const [w, h, d] = size; const sgn = face[0] === '+' ? 1 : -1, ax = face[1];
  if (ax === 'z') return new THREE.Vector3(((sgn > 0 ? u : 1 - u) - 0.5) * w, (v - 0.5) * h, sgn * d / 2);
  if (ax === 'x') return new THREE.Vector3(sgn * w / 2, (v - 0.5) * h, (0.5 - (sgn > 0 ? u : 1 - u)) * d);
  return new THREE.Vector3((u - 0.5) * w, sgn * h / 2, (zf - 0.5) * d);
}

/**
 * Returns, for each remaining actionable block, { id, reachableFraction, bestUseful (max multiplier over reachable points with horizontal error <= threshold),
 * bestAny (max over all reachable points), samples }. phase = colour-rule phase of the trial.
 */
export function accessibility(sim, phase = 'initial', n = 9) {
  const boxes = sim.blocks.map(b => (b.cleared || b.removed ? null : obbOf(b)));
  const plat = sim.plat, platBox = { c: new THREE.Vector3(plat.center[0], -plat.size[1] / 2, plat.center[1]), q: new THREE.Quaternion(), inv: new THREE.Quaternion(), h: [plat.size[0] / 2, plat.size[1] / 2, plat.size[2] / 2] };
  const out = [];
  for (const b of sim.blocks) {
    if (b.cleared || b.removed || !b.props.actionable) continue;
    const me = boxes[b.id]; let total = 0, reach = 0, bestUseful = 0, bestAny = 0; const pts = [];
    for (const face of ['+z', '-z', '+x', '-x', '+y', '-y']) {
      const nrm = new THREE.Vector3(face[1] === 'x' ? 1 : 0, face[1] === 'y' ? 1 : 0, face[1] === 'z' ? 1 : 0).multiplyScalar(face[0] === '+' ? 1 : -1).applyQuaternion(me.q);
      if (nrm.dot(CAM.clone().sub(me.c)) <= 0) continue;                     // faces turned away from the camera cannot be seen
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const u = 0.05 + 0.9 * i / (n - 1), v = 0.05 + 0.9 * j / (n - 1), top = face[1] === 'y';
        const lp = top ? localPointOf(b.size, face, u, face[0] === '+' ? 1 : 0, v) : localPointOf(b.size, face, u, v);
        const P = lp.clone().applyQuaternion(me.q).add(me.c), dir = P.clone().sub(CAM), dist = dir.length(); dir.normalize(); total++;
        let blocked = false;
        for (const ob of [...boxes, platBox]) { if (!ob || ob === me) continue; if (rayObb(CAM, dir, ob) < dist - 1e-4) { blocked = true; break; } }
        if (!blocked && rayObb(CAM, dir, me) < dist - 1e-3) blocked = true;     // the ray enters through another face first
        const fu = top ? u : u, fv = top ? (face[0] === '+' ? 1 : 0) : v;
        const e = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u: fu, v: fv, phase }), herr = horizontalError(fu, b.props.cue, phase);
        const useful = herr <= PENALTY.horizontalThreshold + 1e-9;
        if (!blocked) { reach++; bestAny = Math.max(bestAny, e.multiplier); if (useful) bestUseful = Math.max(bestUseful, e.multiplier); pts.push({ face, u: fu, v: fv, mult: e.multiplier, useful, P }); }
      }
    }
    out.push({ id: b.id, reachableFraction: total ? reach / total : 0, bestUseful, bestAny, samples: pts, occluders: occludersOf(sim, b, boxes, phase, n) });
  }
  return out;
}

/** Which other blocks hide the strong (>= 1.5) and horizontally-allowed points of block b: map blockId -> number of hidden sample points it is first to block. */
function occludersOf(sim, b, boxes, phase, n) {
  const me = boxes[b.id], res = {};
  for (const face of ['+z', '-z', '+x', '-x']) {
    const nrm = new THREE.Vector3(face[1] === 'x' ? 1 : 0, 0, face[1] === 'z' ? 1 : 0).multiplyScalar(face[0] === '+' ? 1 : -1).applyQuaternion(me.q); if (nrm.dot(CAM.clone().sub(me.c)) <= 0) continue;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const u = 0.05 + 0.9 * i / (n - 1), v = 0.05 + 0.9 * j / (n - 1); const e = effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u, v, phase }); if (e.multiplier < 1.5 || horizontalError(u, b.props.cue, phase) > PENALTY.horizontalThreshold) continue;
      const P = localPointOf(b.size, face, u, v).applyQuaternion(me.q).add(me.c), dir = P.clone().sub(CAM), dist = dir.length(); dir.normalize(); let first = null, tmin = dist - 1e-4;
      boxes.forEach((ob, id) => { if (!ob || id === b.id) return; const t = rayObb(CAM, dir, ob); if (t < tmin) { tmin = t; first = id; } });
      if (first !== null) res[first] = (res[first] ?? 0) + 1;
    }
  }
  return res;
}
