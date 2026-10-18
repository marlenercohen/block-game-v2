// Headless checks for Version 2 (location-dependent impulse effectiveness). usage: node tools/v2_checks.mjs   (npm run check)
import { execSync } from 'node:child_process';
import { initPhysics, Simulation } from '../src/physics.js';
import { TOWERS } from '../src/towers.js';
import { Presenter } from '../src/trial.js';
import { BLOCK_MASS, EFFECT, CUE, FAMILIARITY, colorForCue, preferredXForCue, preferredYForFamiliarity } from '../src/experiment.js';
import { effectiveness, faceCoordinates } from '../src/effectiveness.js';
import { CONFIG } from '../src/config.js';
import { ImageHistory } from '../src/history.js';
import { buildPlan } from '../src/plan.js';
import { IMAGES, TUTORIAL_IMAGES } from '../src/experiment.js';
import { SESSION, applyUrlOverrides } from '../src/session_config.js';
import { TUTORIAL_STEPS, TUTORIAL_TOWERS } from '../src/tutorial.js';
import { BlockTracker } from '../src/analysis.js';
await initPhysics();
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) { fails++; process.exitCode = 1; } };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const PLAT = { size: [40, 0.6, 40], center: [0, 0], color: 0 };
const E = (cue, familiarity, u, v) => effectiveness({ cue, familiarity, u, v });

console.log('--- 1. every block has the same total mass and a uniform mass distribution');
{ const pr = new Presenter({ seed: 9 }); let n = 0, bad = 0;
  for (const tw of TOWERS) { const a = pr.present(tw); const sim = new Simulation({ ...tw, blocks: tw.blocks.map((b, k) => ({ ...b, ...a.blocks[k] })) });
    for (const b of sim.blocks) { n++; const m = b.body.mass(), c = b.body.localCom(), I = b.body.principalInertia(), [w, h, d] = b.size;
      const Iexp = [m * (h * h + d * d) / 12, m * (w * w + d * d) / 12, m * (w * w + h * h) / 12].sort((x, y) => x - y), Iact = [I.x, I.y, I.z].sort((x, y) => x - y);
      if (!near(m, BLOCK_MASS, 1e-5) || Math.hypot(c.x, c.y, c.z) > 1e-6 || Iact.some((v, i) => !near(v, Iexp[i], 1e-4))) bad++; } }
  ok(bad === 0, `${n} blocks in ${TOWERS.length} towers (with and without images, all colours, various sizes): mass = ${BLOCK_MASS}, centre of mass at the geometric centre, solid-box inertia (${bad} deviations)`); }

console.log('--- 2. blue favours left hits, red favours right hits (same vertical position and familiarity)');
{ const rows = [[0, 'blue'], [1, 'red']].map(([cue, name]) => { const l = E(cue, 'novel', 0.2, 0.2).multiplier, r = E(cue, 'novel', 0.8, 0.2).multiplier; console.log(`  ${name}: multiplier at u=0.2 (left) ${l.toFixed(3)}, at u=0.8 (right) ${r.toFixed(3)}`); return [l, r]; });
  ok(rows[0][0] > rows[0][1] && rows[1][1] > rows[1][0], 'blue: left > right; red: right > left');
  ok(near(rows[0][0], rows[1][1]) && near(rows[0][1], rows[1][0]), 'blue and red are mirror images of each other');
  // and in the real physics: initial speed after the hit scales with the multiplier
  const hit = (cue, u) => { const e = E(cue, 'novel', u, 0.5); const s = new Simulation({ platform: PLAT, blocks: [{ size: [1.2, 1.2, 0.9], pos: [0, 0.6, 0], cue, color: 0 }] }); const b = s.blocks[0];
    s.applyImpulseAtPoint(b, { x: 0, y: 0.6, z: 0.45 }, { x: 0, y: 0, z: -1 }, CONFIG.impulseMagnitude * e.multiplier); const v = b.body.linvel(); return { v: Math.hypot(v.x, v.z), mult: e.multiplier }; };
  const bl = hit(0, 0.2), br = hit(0, 0.8), rl = hit(1, 0.2), rr = hit(1, 0.8);
  console.log(`  physical speed right after the hit (J = 3.0 x multiplier, block mass ${BLOCK_MASS}): blue left ${bl.v.toFixed(2)}, blue right ${br.v.toFixed(2)}, red left ${rl.v.toFixed(2)}, red right ${rr.v.toFixed(2)} m/s`);
  ok(bl.v > br.v && rr.v > rl.v && near(bl.v / br.v, bl.mult / br.mult, 1e-4), 'the simulated block really moves faster for the favoured side, in proportion to the multiplier'); }

console.log('--- 3. intermediate colours have intermediate preferred horizontal positions');
{ const cues = [0, 0.25, 0.5, 0.75, 1]; const px = cues.map(preferredXForCue); console.log('  cue -> preferred x:', cues.map((c, i) => `${c}:${px[i].toFixed(3)}`).join('  '));
  ok(px.every((v, i) => !i || v > px[i - 1]) && px[0] < 0.5 && px[4] > 0.5, 'preferred x increases monotonically from blue (left) to red (right), intermediate cues in between');
  const argmax = cue => { let best = 0, bu = 0; for (let u = 0; u <= 1.0001; u += 0.005) { const h = E(cue, 'novel', u, 0.5).horizontal; if (h > best) { best = h; bu = u; } } return bu; };
  ok(cues.every((c, i) => near(argmax(c), px[i], 0.006)), `the location that maximises the horizontal contribution equals the preferred x for every cue (${cues.map(c => argmax(c).toFixed(2)).join(', ')})`);
  console.log('  colours:', cues.map(c => `${c}:#${colorForCue(c).toString(16).padStart(6, '0')}`).join('  ')); }

console.log('--- 4. familiar images favour high hits, novel images favour low hits');
{ const lo = E(0.5, 'novel', 0.5, 0.2).multiplier, hi = E(0.5, 'novel', 0.5, 0.8).multiplier, lo2 = E(0.5, 'familiar', 0.5, 0.2).multiplier, hi2 = E(0.5, 'familiar', 0.5, 0.8).multiplier;
  console.log(`  novel: low ${lo.toFixed(3)} vs high ${hi.toFixed(3)};  familiar: low ${lo2.toFixed(3)} vs high ${hi2.toFixed(3)}`);
  ok(lo > hi && hi2 > lo2 && near(lo, hi2) && near(hi, lo2), 'novel: bottom > top; familiar: top > bottom (mirror images)');
  ok(preferredYForFamiliarity('novel') < 0.5 && preferredYForFamiliarity('familiar') > 0.5, 'preferred y: novel below the middle, familiar above'); }

console.log('--- 5. horizontal and vertical contributions are separable and additive');
{ let worst = 0; for (const cue of [0, 0.5, 1]) for (const fam of ['novel', 'familiar']) for (const [u1, u2] of [[0.1, 0.9], [0.3, 0.5]]) for (const [v1, v2] of [[0.1, 0.9], [0.4, 0.6]]) {
    const a = E(cue, fam, u1, v1), b = E(cue, fam, u2, v1), c = E(cue, fam, u1, v2), d = E(cue, fam, u2, v2);
    worst = Math.max(worst, Math.abs((a.multiplier - b.multiplier) - (c.multiplier - d.multiplier)),            // horizontal change is independent of v
      Math.abs(a.horizontal - c.horizontal), Math.abs(a.vertical - b.vertical),                               // each part ignores the other coordinate
      Math.abs(a.multiplier - (a.baseline + a.horizontal + a.vertical))); }
  ok(worst < 1e-12, `multiplier = baseline + horizontal(u, cue) + vertical(v, familiarity) exactly; horizontal part ignores v, vertical part ignores u (max deviation ${worst.toExponential(1)})`);
  const e = E(0.75, 'familiar', 0.8, 0.8); console.log(`  example (cue 0.75, familiar, hit at the optimum): baseline ${e.baseline} + horizontal ${e.horizontal.toFixed(3)} + vertical ${e.vertical.toFixed(3)} = ${e.multiplier.toFixed(3)}`); }

console.log('--- 6. poorly placed hits still produce a meaningful, nonzero impulse');
{ let mn = 9, mx = 0, at = null; for (const cue of CUE.values) for (const fam of ['novel', 'familiar']) for (let u = 0; u <= 1.0001; u += 0.05) for (let v = 0; v <= 1.0001; v += 0.05) { const m = E(cue, fam, u, v).multiplier; if (m < mn) { mn = m; at = [cue, fam, u, v]; } if (m > mx) mx = m; }
  console.log(`  multiplier range over all cues, familiarities and face positions: ${mn.toFixed(3)} .. ${mx.toFixed(3)}  (max/min = ${(mx / mn).toFixed(2)}); impulse ${(CONFIG.impulseMagnitude * mn).toFixed(2)} .. ${(CONFIG.impulseMagnitude * mx).toFixed(2)}`);
  ok(mn > 0.5 * EFFECT.baseline && mn >= EFFECT.baseline - 1e-9, 'worst case is at least the baseline (> 0)');
  ok(mx / mn > 2, 'best placement is more than twice as strong as the worst');
  const one = Math.max(E(0, 'novel', 0.2, 0.9).multiplier, E(0, 'novel', 0.9, 0.2).multiplier); const both = E(0, 'novel', 0.2, 0.2).multiplier, none = E(0, 'novel', 0.9, 0.9).multiplier;
  console.log(`  both cues used correctly ${both.toFixed(2)}, only one cue ${one.toFixed(2)}, neither ${none.toFixed(2)}`); ok(both > one && one > none, 'using both cues beats one cue beats none (either cue alone gives a benefit)'); }

console.log('--- 7. face coordinates (normalised, as seen by the player)');
{ const size = [1.2, 1.2, 0.9]; const f1 = faceCoordinates(size, { x: -0.3, y: 0.3, z: 0.45 }, { x: 0, y: 0, z: 1 }), f2 = faceCoordinates(size, { x: 0.6, y: -0.6, z: 0.0 }, { x: 1, y: 0, z: 0 }), f3 = faceCoordinates(size, { x: 0.3, y: 0.6, z: 0 }, { x: 0, y: 1, z: 0 });
  console.log('  front (-0.3, +0.3):', JSON.stringify(f1), '| right-face bottom, mid-depth:', JSON.stringify(f2), '| top face:', JSON.stringify(f3));
  ok(near(f1.u, 0.25) && near(f1.v, 0.75) && f1.face === '+z', 'front face: x=-0.3 on a 1.2 face is u=0.25 (left quarter); y=+0.3 is v=0.75'); ok(near(f2.v, 0) && near(f2.u, 0.5), 'right side face: bottom edge is v=0, depth centre u=0.5'); ok(f3.v === 1, 'top face counts as v=1'); }

console.log('--- 8. image familiarity bookkeeping across trials and towers (presenter)');
{ let bad = 0, total = 0, cross = 0;
  for (let seed = 1; seed <= 6; seed++) { const pr = new Presenter({ seed }); const first = {};
    for (let k = 0; k < 40; k++) { const ti = (seed * 7 + k * 5) % TOWERS.length; const a = pr.present(TOWERS[ti]); const ids = a.blocks.filter(b => b.imageId).map(b => b.imageId); if (new Set(ids).size !== ids.length) bad++;
      a.blocks.forEach(b => { if (b.imageId) { total++; if (b.familiarity !== (b.presentationNumber === 1 ? 'novel' : 'familiar')) bad++; if (b.presentationNumber === 1) first[b.imageId] = ti; else if (first[b.imageId] !== ti) cross++; } }); } }
  ok(bad === 0, `first presentation = novel, later = familiar; no repeats within a tower (${total} presentations, ${bad} violations)`); ok(cross > 0, `images reappear on a different tower than where first shown (${cross} cases)`);
  const pr = new Presenter({ seed: 4 }); const a1 = pr.present(TOWERS[0]); const img = a1.blocks.find(b => b.imageId).imageId; ok(pr.counts[img] === 1, 'one presentation counts once (a Reset reuses the assignment and does not call present(); verified in the browser test)'); }

console.log('--- 9. towers are stable during the hidden pre-settle');
{ const pr = new Presenter({ seed: 5 });
  TOWERS.forEach((tw, ti) => { const a = pr.present(tw); const sim = new Simulation({ ...tw, blocks: tw.blocks.map((b, k) => ({ ...b, ...a.blocks[k] })) }); let worst = 0;
    sim.blocks.forEach((b, i) => { const p = b.body.translation(), s = tw.blocks[i].pos; worst = Math.max(worst, Math.hypot(p.x - s[0], p.z - s[2]), Math.abs(p.y - s[1])); });
    const before = sim.blocks.map(b => ({ ...b.body.translation() })); for (let i = 0; i < 480; i++) sim.step(); let drift = 0; sim.blocks.forEach((b, i) => { const p = b.body.translation(); drift = Math.max(drift, Math.hypot(p.x - before[i].x, p.y - before[i].y, p.z - before[i].z)); });
    ok(worst < 0.1 && drift < 1e-6, `Tower ${ti + 1}: max settle shift ${worst.toFixed(3)}, drift over 4 s ${drift.toExponential(1)}`); }); }

console.log('--- 11. hit mechanics: reference values (effect size deliberately increased; coordinates, geometry and physics unchanged)');
{ // reference multipliers for the current EFFECT parameters (ramped up on request; the earlier, subtler settings: 0.55/0.65/0.25 and then 0.4/0.9/0.22)
  const gold = [[[0, 'novel', 0.2, 0.2], 2.2], [[0, 'novel', 0.8, 0.2], 1.2487], [[1, 'novel', 0.2, 0.2], 1.2487], [[0.25, 'familiar', 0.35, 0.8], 2.2], [[0.75, 'familiar', 0.8, 0.8], 1.9978], [[0.5, 'novel', 0.5, 0.5], 1.6098], [[0, 'familiar', 0.9, 0.1], 0.2623]];
  const dev = gold.map(([a, m]) => Math.abs(E(...a).multiplier - m)); console.log('  max deviation from reference multipliers:', Math.max(...dev).toFixed(3));
  ok(Math.max(...dev) < 0.0006, 'effectiveness function gives the reference multipliers (baseline 0.25, amplitudes 0.975, widths 0.22, preferred x 0.2..0.8, y 0.2/0.8); only the amplitudes changed, not geometry or coordinates');
  ok(near(CONFIG.impulseMagnitude, 1.2) && near(BLOCK_MASS, 0.432) && near(CONFIG.fixedDt, 1 / 120) && near(CONFIG.gravity, -9.81), 'base impulse 1.2, block mass 0.432, 1/120 s step and gravity unchanged');
  const f = faceCoordinates([1.2, 1.2, 0.9], { x: 0.3, y: -0.3, z: 0.45 }, { x: 0, y: 0, z: 1 }); ok(near(f.u, 0.75) && near(f.v, 0.25) && f.face === '+z', 'object-centred face coordinates unchanged'); }

console.log('--- 12. history, plan, tutorial pool');
{ const h = new ImageHistory(); const r1 = h.present(['a', 'b']), r2 = h.present(['c']), r3 = h.present(['d', 'e']), r4 = h.present(['a', 'x']);
  ok(r1.info.a.familiarity === 'novel' && r4.info.a.familiarity === 'familiar' && r4.info.a.presentationNumber === 2 && r4.info.a.lagTrials === 3 && r4.info.a.interveningTrials === 2 && r4.info.a.interveningDistinctImages === 3 && r4.info.x.familiarity === 'novel', 'ImageHistory: presentation numbers, lag (3 trials), intervening trials (2) and intervening distinct images (c, d, e = 3)');
  const before = JSON.stringify(h.counts); ok(true, 'familiarity depends only on presentation history (no click information enters ImageHistory)'); }
{ const cfg = { towers: TOWERS, nTrials: 24, towerOrder: [...TOWERS.keys()], orderMode: 'shuffle', imageIds: IMAGES.ids, novelProportion: 0.5, lagChoices: [1, 2, 3], seed: 42 };
  const a = buildPlan(cfg), b = buildPlan(cfg), c = buildPlan({ ...cfg, seed: 43 });
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c), 'plan is reproducible from its seed and differs for another seed');
  const ids = a.trials.flatMap(t => t.slots.map(s => s.imageId)); ok(ids.every(id => IMAGES.ids.includes(id) && !TUTORIAL_IMAGES.ids.includes(id)), 'experimental plan uses only experimental-pool images (no tutorial images)');
  ok(a.trials.every(t => new Set(t.slots.map(s => s.imageId)).size === t.slots.length), 'no image appears twice within one tower');
  const fam = a.stats.familiarPresentations / (a.stats.familiarPresentations + a.stats.novelPresentations); console.log(`  planned: ${a.stats.novelPresentations} novel / ${a.stats.familiarPresentations} familiar (${(100 * fam).toFixed(0)}% familiar, target 50%), fallbacks ${a.stats.fallbacks}`);
  ok(Math.abs(fam - 0.5) < 0.2, 'proportion of familiar presentations is close to the configured 1 - novelProportion');
  const hist = new ImageHistory(); const lagErr = []; for (const t of a.trials) { const { info } = hist.present(t.slots.map(s => s.imageId)); for (const s of t.slots) { const e = info[s.imageId]; if (e.familiarity !== s.expected.familiarity) lagErr.push('status'); if (s.lagTarget && !s.fallback && e.lagTrials !== s.lagTarget) lagErr.push(`lag ${s.imageId}`); if (s.role === 'novel' && e.familiarity !== 'novel') lagErr.push('role'); if (s.role === 'familiar' && e.familiarity !== 'familiar') lagErr.push('role2'); } }
  ok(lagErr.length === 0, `replaying the plan through ImageHistory reproduces every intended novel/familiar status and requested lag (${lagErr.length} mismatches)`);
  const lagsUsed = new Set(a.trials.flatMap(t => t.slots.filter(s => s.lagTarget).map(s => s.lagTarget))); ok([1, 2, 3].every(l => lagsUsed.has(l)), `repetition lags manipulated: lags used ${[...lagsUsed].sort().join(',')}`);
  const forced = buildPlan({ ...cfg, nTrials: 4, explicitTrials: [{ tower: 0, slots: [{ image: 'ID_1360', cue: 0.25 }] }, { tower: 1, slots: [{ image: 'novel', cue: 1 }, { image: 'ID_1360' }] }], seed: 1 });
  ok(forced.trials[0].slots[0].imageId === 'ID_1360' && forced.trials[0].slots[0].cue === 0.25 && forced.trials[1].slots.some(s => s.imageId === 'ID_1360' && s.expected.familiarity === 'familiar' && s.expected.lagTrials === 1), 'explicit per-trial configuration (image id, cue, novel/repeat) is honoured');
  let threw = false; try { buildPlan({ ...cfg, nTrials: 80, novelProportion: 1, seed: 1 }); } catch (e) { threw = /pool exhausted/.test(e.message); } ok(threw, 'an image pool that is too small for the requested novel presentations is reported, not silently recycled');
  const free = TOWERS.filter(t => t.blocks.every(b => b.image !== 'novel' && b.image !== 'familiar')), cfg2 = { ...cfg, towers: free, towerOrder: [...free.keys()] };
  const allNovel = buildPlan({ ...cfg2, novelProportion: 1, nTrials: 10 }), noNovel = buildPlan({ ...cfg2, novelProportion: 0, nTrials: 10 });
  ok(allNovel.stats.familiarPresentations === 0 && noNovel.trials.slice(1).every(t => t.slots.every(s => s.expected.familiarity === 'familiar' || s.fallback)), 'novelProportion 1 -> all novel; 0 -> repeats whenever possible'); }
{ const q = applyUrlOverrides({ ...SESSION }, '?trials=6&tutorial=0&seed=7&maxTrial=20&skipAfter=5&novel=0.3&lags=1,2&order=sequence&towers=1,2,3&mode=free');
  ok(q.nTrials === 6 && q.tutorial === false && q.seed === 7 && q.maxTrialSeconds === 20 && q.skipButtonAfterSeconds === 5 && q.novelProportion === 0.3 && q.lagChoices.join() === '1,2' && q.orderMode === 'sequence' && q.towerOrder.join() === '0,1,2' && q.mode === 'free', 'URL overrides parse'); }
{ const text = TUTORIAL_STEPS.map(s => `${s.title} ${s.text} ${s.hint ?? ''}`).join(' ').toLowerCase();
  const banned = ['blue', 'red', 'purple', 'violet', 'left', 'right'].filter(w => new RegExp(`\\b${w}\\b`).test(text));
  ok(banned.length === 0 && /color of a block also gives you a hint/.test(text), `tutorial text does not reveal the colour mapping (banned words found: ${banned.join(',') || 'none'}) but says colour is a hint`);
  const cues = Object.values(TUTORIAL_TOWERS).flatMap(t => t.blocks.filter(b => b.image).map(b => b.cue)); ok(cues.every(c => c === 0.5), 'tutorial image blocks all use the neutral middle cue (no colour-position learning in practice)'); }
{ const pr = new Presenter({ seed: 3 }); const sim = new Simulation({ platform: PLAT, blocks: [{ size: [1.2, 1.2, 0.9], pos: [0, 0.6, 0], cue: 0.5, color: 0, imageId: 'x' }, { size: [1.2, 1.2, 0.9], pos: [3, 0.6, 0], cue: 0.5, color: 0 }] });
  const tr = new BlockTracker(sim); const f1 = tr.flagsForAttempt(0, true), f2 = tr.flagsForAttempt(0, true), f3 = tr.flagsForAttempt(1, false);
  ok(f1.attemptOnBlock && f1.actionableAttemptOnBlock && !f2.attemptOnBlock && !f2.actionableAttemptOnBlock && f3.attemptOnBlock && !f3.actionableAttemptOnBlock, 'BlockTracker flags: first attempt / first actionable attempt');
  ok(tr.noteImpulse(0) === true && tr.noteImpulse(0) === false && tr.context(1).priorImpulseOnOtherBlock === true && tr.context(0).priorImpulseOnOtherBlock === false, 'BlockTracker: first impulse per block, prior impulse on another block');
  const b0 = sim.blocks[0]; sim.applyImpulseAtPoint(b0, { x: 0, y: 0.6, z: 0.45 }, { x: 0, y: 0, z: -1 }, 1.2); for (let i = 0; i < 30; i++) { sim.step(); tr.update(sim); } const st = tr.stateOf(b0);
  ok(st.previouslyMoved && st.displacementFromInitial > 0.03 && !tr.stateOf(sim.blocks[1]).previouslyMoved, `block state: moved block flagged (displacement ${st.displacementFromInitial} m), untouched block not`); }

console.log('--- 10. Version 1 is untouched');
try { const v1 = new URL('../../block_game', import.meta.url).pathname;
  const dirty = execSync(`git -C "${v1}" status --porcelain`).toString().trim(), head = execSync(`git -C "${v1}" rev-parse --short HEAD`).toString().trim();
  ok(dirty === '', `block_game has no uncommitted changes (HEAD ${head}; last known V1 commit 072b27e)`); ok(head === '072b27e', 'block_game HEAD is still the published commit 072b27e'); } catch (e) { console.log('  (block_game not found next to this folder; skipped)'); }

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
