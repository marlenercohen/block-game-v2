// Obstruction study: plays towers with several click strategies and reports (a) HARD deadlocks (no reachable, horizontally-allowed point on any remaining image block, so every click
// would only add a penalty block) and (b) the distribution of hits needed to clear. usage (env): TOWERS=11 (1-based list, default all) N=40 STRATS=best,random,sloppy PHASES=initial,reversed
//   PATCH='{"11":{"4":{"pos":[1.1,1.95,-0.65]}}}'  (override block fields of a tower: tower number -> block index -> fields)    node tools/obstruction_study.mjs
import { initPhysics } from '../src/physics.js';
import { applyPreset } from '../src/presets.js';
import { TOWERS } from '../src/towers.js';
import { playTower, assign } from './obstruction_lib.mjs';
await initPhysics(); applyPreset('v23');
const N = +(process.env.N ?? 40), STRATS = (process.env.STRATS ?? 'best,random,sloppy').split(','), PHASES = (process.env.PHASES ?? 'initial,reversed').split(','), CAP = +(process.env.CAP ?? 150);
const SEL = (process.env.TOWERS ?? '').split(',').filter(Boolean).map(Number), PATCH = JSON.parse(process.env.PATCH ?? '{}');
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
export function patched(t, ti) { const pt = PATCH[String(ti + 1)]; return pt ? { ...t, blocks: t.blocks.map((b, i) => (pt[i] ? { ...b, ...pt[i] } : b)) } : t; }
const rows = [];
for (const phase of PHASES) for (const strat of STRATS) for (let ti = 0; ti < TOWERS.length; ti++) { if (SEL.length && !SEL.includes(ti + 1)) continue;
  for (let k = 0; k < N; k++) { const r = playTower(assign(patched(TOWERS[ti], ti), 1000 * ti + k + 7), strat, phase, 1000 * ti + k + 7, CAP);
    if (r.state === 'HARD' && process.env.DUMP) { console.log(`--- HARD ${phase} ${strat} tower ${ti + 1} run ${k} after ${r.hits} hits`); r.sim.blocks.forEach(b => { if (b.cleared) return; const t = b.body.translation(); console.log(`   ${b.id} ${b.props.actionable ? 'IMG' : 'gray'} ${b.size.join('x')} pos ${[t.x, t.y, t.z].map(x => x.toFixed(2))}`); }); }
    rows.push({ phase, strat, ti: ti + 1, hits: r.hits, state: r.state }); } }
for (const phase of PHASES) for (const strat of STRATS) { const R = rows.filter(r => r.phase === phase && r.strat === strat); if (!R.length) continue; const C = R.filter(r => r.state === 'cleared').map(r => r.hits);
  console.log(`${phase.padEnd(8)} ${strat.padEnd(7)} runs ${String(R.length).padStart(4)} cleared ${String(C.length).padStart(4)}  HARD ${String(R.filter(r => r.state === 'HARD').length).padStart(3)}  CAP ${String(R.filter(r => r.state === 'CAP').length).padStart(3)}  hits to clear: mean ${(C.reduce((a, x) => a + x, 0) / Math.max(1, C.length)).toFixed(1)} p10 ${pct(C, 0.1)} p25 ${pct(C, 0.25)} median ${pct(C, 0.5)} p75 ${pct(C, 0.75)} p90 ${pct(C, 0.9)}`);
  if (SEL.length === 0) { const h = {}; R.filter(r => r.state === 'HARD').forEach(r => { h[r.ti] = (h[r.ti] ?? 0) + 1; }); if (Object.keys(h).length) console.log('           HARD by tower', JSON.stringify(h)); } }
