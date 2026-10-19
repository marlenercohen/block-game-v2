// Headless checks for Version 2 (location-dependent impulse effectiveness). usage: node tools/v2_checks.mjs   (npm run check)
import { execSync } from 'node:child_process';
import { initPhysics, Simulation } from '../src/physics.js';
import { TOWERS } from '../src/towers.js';
import { Presenter } from '../src/trial.js';
import { PHYS, EFFECT, CUE, FAMILIARITY, colorForCue, preferredXForCue, preferredYForFamiliarity, ruleForTrial } from '../src/experiment.js';
import { effectiveness, faceCoordinates } from '../src/effectiveness.js';
import { CONFIG } from '../src/config.js';
import { ImageHistory } from '../src/history.js';
import { buildPlan, validatePlan } from '../src/plan.js';
import { IMAGES, TUTORIAL_IMAGES } from '../src/experiment.js';
import { SESSION, applyUrlOverrides } from '../src/session_config.js';
import { TUTORIAL_STEPS, TUTORIAL_TOWERS } from '../src/tutorial.js';
import { BlockTracker } from '../src/analysis.js';
import { applyPreset, PRESETS } from '../src/presets.js';
import { faceVisibility } from './visibility.mjs';
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
      if (!near(m, PHYS.blockMass, 1e-5) || Math.hypot(c.x, c.y, c.z) > 1e-6 || Iact.some((v, i) => !near(v, Iexp[i], 1e-4))) bad++; } }
  ok(bad === 0, `${n} blocks in ${TOWERS.length} towers (with and without images, all colours, various sizes): mass = ${PHYS.blockMass}, centre of mass at the geometric centre, solid-box inertia (${bad} deviations)`); }

console.log('--- 2. blue favours left hits, red favours right hits (same vertical position and familiarity)');
{ const rows = [[0, 'blue'], [1, 'red']].map(([cue, name]) => { const l = E(cue, 'novel', 0.2, 0.2).multiplier, r = E(cue, 'novel', 0.8, 0.2).multiplier; console.log(`  ${name}: multiplier at u=0.2 (left) ${l.toFixed(3)}, at u=0.8 (right) ${r.toFixed(3)}`); return [l, r]; });
  ok(rows[0][0] > rows[0][1] && rows[1][1] > rows[1][0], 'blue: left > right; red: right > left');
  ok(near(rows[0][0], rows[1][1]) && near(rows[0][1], rows[1][0]), 'blue and red are mirror images of each other');
  // and in the real physics: initial speed after the hit scales with the multiplier
  const hit = (cue, u) => { const e = E(cue, 'novel', u, 0.5); const s = new Simulation({ platform: PLAT, blocks: [{ size: [1.2, 1.2, 0.9], pos: [0, 0.6, 0], cue, color: 0 }] }); const b = s.blocks[0];
    s.applyImpulseAtPoint(b, { x: 0, y: 0.6, z: 0.45 }, { x: 0, y: 0, z: -1 }, CONFIG.impulseMagnitude * e.multiplier); const v = b.body.linvel(); return { v: Math.hypot(v.x, v.z), mult: e.multiplier }; };
  const bl = hit(0, 0.2), br = hit(0, 0.8), rl = hit(1, 0.2), rr = hit(1, 0.8);
  console.log(`  physical speed right after the hit (J = 3.0 x multiplier, block mass ${PHYS.blockMass}): blue left ${bl.v.toFixed(2)}, blue right ${br.v.toFixed(2)}, red left ${rl.v.toFixed(2)}, red right ${rr.v.toFixed(2)} m/s`);
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
  const gold = [[[0, 'novel', 0.2, 0.2], 2.2], [[0, 'novel', 0.8, 0.2], 1.2111], [[1, 'novel', 0.2, 0.2], 1.2111], [[0.25, 'familiar', 0.35, 0.8], 2.2], [[0.75, 'familiar', 0.8, 0.8], 1.9548], [[0.5, 'novel', 0.5, 0.5], 1.5247], [[0, 'familiar', 0.9, 0.1], 0.2044]];
  const dev = gold.map(([a, m]) => Math.abs(E(...a).multiplier - m)); console.log('  max deviation from reference multipliers:', Math.max(...dev).toFixed(3));
  ok(Math.max(...dev) < 0.0006, 'effectiveness function gives the reference multipliers (v2.1: baseline 0.2, amplitudes 1.0, widths 0.2, preferred x 0.2..0.8, y 0.2/0.8); only the amplitudes changed, not geometry or coordinates');
  ok(near(CONFIG.impulseMagnitude, 3.2) && near(PHYS.blockMass, 1.0) && near(CONFIG.block.friction, 0.5) && near(CONFIG.platform.friction, 0.5) && near(CONFIG.fixedDt, 1 / 120) && near(CONFIG.gravity, -9.81), 'v2.1 physics: base impulse 3.2, block mass 1.0, friction 0.5/0.5; 1/120 s step and gravity unchanged');
  const f = faceCoordinates([1.2, 1.2, 0.9], { x: 0.3, y: -0.3, z: 0.45 }, { x: 0, y: 0, z: 1 }); ok(near(f.u, 0.75) && near(f.v, 0.25) && f.face === '+z', 'object-centred face coordinates unchanged'); }

console.log('--- 12. history, plan, tutorial pool');
{ const h = new ImageHistory(); const r1 = h.present(['a', 'b']), r2 = h.present(['c']), r3 = h.present(['d', 'e']), r4 = h.present(['a', 'x']);
  ok(r1.info.a.familiarity === 'novel' && r4.info.a.familiarity === 'familiar' && r4.info.a.presentationNumber === 2 && r4.info.a.lagTrials === 3 && r4.info.a.interveningTrials === 2 && r4.info.a.interveningDistinctImages === 3 && r4.info.x.familiarity === 'novel', 'ImageHistory: presentation numbers, lag (3 trials), intervening trials (2) and intervening distinct images (c, d, e = 3)');
  const before = JSON.stringify(h.counts); ok(true, 'familiarity depends only on presentation history (no click information enters ImageHistory)'); }
{ const cfg = { towers: TOWERS, nTrials: 24, towerOrder: [...TOWERS.keys()], orderMode: 'shuffle', imageIds: IMAGES.ids, novelProportion: 0.5, lagChoices: [1, 2, 3], seed: 42 };
  const a = buildPlan(cfg), b = buildPlan(cfg), c = buildPlan({ ...cfg, seed: 43 }), a48 = buildPlan({ ...cfg, nTrials: 48 });
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c), 'plan is reproducible from its seed and differs for another seed');
  const ids = a.trials.flatMap(t => t.slots.map(s => s.imageId)); ok(ids.every(id => IMAGES.ids.includes(id) && !TUTORIAL_IMAGES.ids.includes(id)), 'experimental plan uses only experimental-pool images (no tutorial images)');
  ok(a.trials.every(t => new Set(t.slots.map(s => s.imageId)).size === t.slots.length), 'no image appears twice within one tower');
  const fam = a.stats.familiarPresentations / (a.stats.familiarPresentations + a.stats.novelPresentations); console.log(`  planned: ${a.stats.novelPresentations} novel / ${a.stats.familiarPresentations} familiar (${(100 * fam).toFixed(0)}% familiar, target 50%), fallbacks ${a.stats.fallbacks}`);
  ok(Math.abs(fam - 0.5) < 0.2, 'proportion of familiar presentations is close to the configured 1 - novelProportion');
  const hist = new ImageHistory(); const lagErr = []; for (const t of a.trials) { const { info } = hist.present(t.slots.map(s => s.imageId)); for (const s of t.slots) { const e = info[s.imageId]; if (e.familiarity !== s.expected.familiarity) lagErr.push('status'); if (s.lagTarget && !s.fallback && e.lagTrials !== s.lagTarget) lagErr.push(`lag ${s.imageId}`); if (s.role === 'novel' && e.familiarity !== 'novel') lagErr.push('role'); if (s.role === 'familiar' && e.familiarity !== 'familiar') lagErr.push('role2'); } }
  ok(lagErr.length === 0, `replaying the plan through ImageHistory reproduces every intended novel/familiar status and requested lag (${lagErr.length} mismatches)`);
  const lagsUsed = new Set(a48.trials.flatMap(t => t.slots.filter(s => s.lagTarget).map(s => s.lagTarget))); ok([1, 2, 3].every(l => lagsUsed.has(l)), `repetition lags manipulated: lags used ${[...lagsUsed].sort().join(',')}`);
  const forced = buildPlan({ ...cfg, nTrials: 4, explicitTrials: [{ tower: 0, slots: [{ image: 'cc0_grasshopper', cue: 0.25 }] }, { tower: 1, slots: [{ image: 'novel', cue: 1 }, { image: 'cc0_grasshopper' }] }], seed: 1 });
  ok(forced.trials[0].slots[0].imageId === 'cc0_grasshopper' && forced.trials[0].slots[0].cue === 0.25 && forced.trials[1].slots.some(s => s.imageId === 'cc0_grasshopper' && s.expected.familiarity === 'familiar' && s.expected.lagTrials === 1), 'explicit per-trial configuration (image id, cue, novel/repeat) is honoured');
  let threw = false; try { buildPlan({ ...cfg, nTrials: 80, novelProportion: 1, seed: 1 }); } catch (e) { threw = /pool exhausted/.test(e.message); } ok(threw, 'an image pool that is too small for the requested novel presentations is reported, not silently recycled');
  { let bad = 0, nov = 0, fam = 0, lagsSeen = new Set(), maxCount = 0, seeds = 0;
    for (let seed = 1; seed <= 300; seed++) { for (const lc of [[1, 2, 3, 5], [1, 2, 3]]) { seeds++;
      const pl = buildPlan({ ...cfg, nTrials: 24, lagChoices: lc, seed }); const cnt = {};
      for (const tr of pl.trials) for (const s of tr.slots) { cnt[s.imageId] = (cnt[s.imageId] ?? 0) + 1; if (s.expected.familiarity === 'novel') nov++; else { fam++; lagsSeen.add(s.expected.lagTrials); } }
      maxCount = Math.max(maxCount, ...Object.values(cnt)); if (Object.values(cnt).some(n => n > 2)) bad++; try { validatePlan(pl); } catch { bad++; } } }
    ok(bad === 0 && maxCount === 2, `two-presentation limit: ${seeds} plans (300 seeds x 2 lag sets) -> no image scheduled more than twice (max ${maxCount})`);
    ok([1, 2, 3, 5].every(l => lagsSeen.has(l)) && lagsSeen.size === 4, `repetition lags are exactly 1, 2, 3, 5 (no off-list lags) (seen ${[...lagsSeen].sort((a, b) => a - b).join(',')})`);
    ok(Math.abs(nov / (nov + fam) - 0.5) < 0.1, `novel/familiar ratio stays near 50/50 (${(100 * nov / (nov + fam)).toFixed(1)}% novel)`);
    const plTut = buildPlan({ ...cfg, seed: 5 }); ok(!plTut.trials.some(tr => tr.slots.some(s => TUTORIAL_IMAGES.ids.includes(s.imageId))), 'no tutorial image appears in the experimental plan');
    const broken = buildPlan({ ...cfg, seed: 9 }); broken.trials[10].slots[0].imageId = broken.trials[0].slots[0].imageId; broken.trials[11].slots[0].imageId = broken.trials[0].slots[0].imageId;
    let caught = false; try { validatePlan(broken); } catch (e) { caught = /more|times|logged/.test(e.message); } ok(caught, 'validatePlan reports an error when an image is scheduled a third time'); }
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

console.log('--- 13. presets: the first-pilot version can be reproduced and is recorded');
{ const gold1 = [[[0, 'novel', 0.2, 0.2], 2.2], [[0, 'novel', 0.8, 0.2], 1.2487], [[0.75, 'familiar', 0.8, 0.8], 1.9978], [[0, 'familiar', 0.9, 0.1], 0.2623]];   // first-pilot values (baseline 0.25, amplitudes 0.975, width 0.22)
  applyPreset('pilot1'); const dev = gold1.map(([a, m]) => Math.abs(E(...a).multiplier - m)); const sim = new Simulation({ platform: PLAT, blocks: [{ size: [1.2, 1.2, 0.9], pos: [0, 0.6, 0], cue: 0.5, color: 0 }] });
  ok(Math.max(...dev) < 0.005 && near(PHYS.blockMass, 0.432) && near(sim.blocks[0].body.mass(), 0.432, 1e-5) && near(CONFIG.impulseMagnitude, 1.2) && TOWERS.length === 10, `preset pilot1 restores the first-pilot parameters (mass 0.432, impulse 1.2, effect 0.25/0.975/0.22, 10 simple towers); max multiplier deviation ${Math.max(...dev).toFixed(4)}`);
  applyPreset('v21'); ok(near(PHYS.blockMass, 1.0) && TOWERS.length === 12 && near(E(0, 'novel', 0.2, 0.2).multiplier, 2.2), `preset v21 restored (${TOWERS.length} towers)`); }

console.log('--- 14. tower design: real 3-D structures, not stacks of 2-3 blocks or independent blocks');
{ const top = b => b.pos[1] + b.size[1] / 2, bot = b => b.pos[1] - b.size[1] / 2; let bad = 0; const rows = [];
  TOWERS.forEach((t, i) => { const B = t.blocks, n = B.length, edges = [];
    B.forEach((a, x) => B.forEach((b, y) => { if (x !== y && Math.abs(bot(b) - top(a)) < 0.02 && Math.abs(a.pos[0] - b.pos[0]) < (a.size[0] + b.size[0]) / 2 - 1e-3 && Math.abs(a.pos[2] - b.pos[2]) < (a.size[2] + b.size[2]) / 2 - 1e-3) edges.push([x, y]); }));
    const levels = new Set(B.map(b => Math.round(bot(b) * 10))).size, grounded = B.filter(b => bot(b) < 0.01).length, height = Math.max(...B.map(top));
    // connectivity through support or side contact
    const adj = B.map(() => []); B.forEach((a, x) => B.forEach((b, y) => { if (x < y && Math.abs(a.pos[0] - b.pos[0]) <= (a.size[0] + b.size[0]) / 2 + 0.02 && Math.abs(a.pos[1] - b.pos[1]) <= (a.size[1] + b.size[1]) / 2 + 0.02 && Math.abs(a.pos[2] - b.pos[2]) <= (a.size[2] + b.size[2]) / 2 + 0.02) { adj[x].push(y); adj[y].push(x); } }));
    const seen = new Set([0]), q = [0]; while (q.length) { const c = q.pop(); for (const d of adj[c]) if (!seen.has(d)) { seen.add(d); q.push(d); } }
    const images = B.filter(b => b.image).length, supporters = new Set(edges.map(e => e[0])).size, zs = B.map(b => b.pos[2]), xs = B.map(b => b.pos[0]);
    const vis = faceVisibility(B), minVis = Math.min(...B.map((b, k) => (b.image ? Math.max(vis[k].front, vis[k].right) : 1)));
    const good = n >= 6 && n <= 9 && levels >= 3 && seen.size === n && edges.length >= n - grounded && supporters >= 2 && images >= 2 && images <= 4 && height <= 4.6 && Math.max(...zs) - Math.min(...zs) > 0.2 && Math.max(...xs) - Math.min(...xs) > 0.8 && minVis >= 0.6;
    if (!good) bad++; rows.push(`Tower ${i + 1}: ${n} blocks, ${levels} levels, ${images} images, ${supporters} supporting blocks, one connected structure ${seen.size === n}, height ${height.toFixed(1)}, min image visibility ${(100 * minVis).toFixed(0)}%${good ? '' : '  <-- FAILS'}`); });
  console.log('  ' + rows.join('\n  ')); ok(bad === 0, `all ${TOWERS.length} towers have 6-9 blocks on >= 3 levels, support relations, a single connected structure, depth and width variation, visible images`); }

console.log('--- 15. hit contrast and difficulty (physics simulations on every tower)');
{ const dir = { x: -0.5714, y: 0, z: -0.8207 }, CUES = [0, 0.25, 0.5, 0.75, 1]; const rngA = (() => { let a = 17; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  const build = t => ({ ...t, blocks: t.blocks.map(b => b.image ? { ...b, cue: CUES[Math.floor(rngA() * 5)], familiarity: rngA() < 0.5 ? 'novel' : 'familiar', imageId: 'x', actionable: true, color: 0 } : { ...b, cue: null, imageId: null, actionable: false, color: 0 }) });
  const hit = (sim, b, u, v) => { const e = E(b.props.cue, b.props.familiarity, u, v), p = b.body.translation(), [w, h, d] = b.size; sim.applyImpulseAtPoint(b, { x: p.x + (u - 0.5) * w, y: p.y + (v - 0.5) * h, z: p.z + d / 2 }, dir, CONFIG.impulseMagnitude * e.multiplier); return e; };
  const settle = sim => { let rest = 0, t = 0; for (let i = 0; i < 720; i++) { sim.step(); t += 1 / 120; rest = sim.isAtRest() ? rest + 1 / 120 : 0; if (rest >= CONFIG.settle.seconds || t >= CONFIG.settle.maxWaitSeconds) break; } return t; };
  const stat = { opt: { d: 0, moved: 0, cleared: 0, n: 0 }, bad: { d: 0, moved: 0, cleared: 0, n: 0 } }; const hitsOpt = [], hitsRnd = [], hitsPoor = [], secs = [];
  TOWERS.forEach(t => { const tower = build(t); const probe = new Simulation(tower);
    for (const id of probe.blocks.filter(b => b.props.actionable).map(b => b.id)) for (const mode of ['opt', 'bad']) { const sim = new Simulation(tower), b = sim.blocks[id], p0 = sim.blocks.map(x => ({ ...x.body.translation() }));
      const pref = E(b.props.cue, b.props.familiarity, 0.5, 0.5); const [u, v] = mode === 'opt' ? [pref.preferredX, pref.preferredY] : [1 - pref.preferredX, 1 - pref.preferredY]; hit(sim, b, u, v); for (let i = 0; i < 360; i++) sim.step();
      let moved = 0; sim.blocks.forEach((x, i) => { if (!x.removed && Math.hypot(...['x', 'y', 'z'].map(k => x.body.translation()[k] - p0[i][k])) > 0.15) moved++; }); const q = b.removed ? null : b.body.translation();
      stat[mode].d += q ? Math.min(6, Math.hypot(q.x - p0[id].x, q.y - p0[id].y, q.z - p0[id].z)) : 6; stat[mode].moved += moved; stat[mode].cleared += sim.blocks.filter(x => x.cleared).length; stat[mode].n++; }
    for (const [strategy, arr] of [['optimal', hitsOpt], ['random', hitsRnd], ['poor', hitsPoor]]) { const sim = new Simulation(tower); let hits = 0, time = 0;
      while (hits < 60) { const c = sim.blocks.filter(b => !b.cleared && b.props.actionable); if (!c.length) break; const b = c.reduce((a, x) => (x.body.translation().y < a.body.translation().y ? x : a)); const pref = E(b.props.cue, b.props.familiarity, 0.5, 0.5);
        const [u, v] = strategy === 'optimal' ? [pref.preferredX, pref.preferredY] : strategy === 'poor' ? [1 - pref.preferredX, 1 - pref.preferredY] : [rngA(), rngA()]; hit(sim, b, u, v); hits++; time += settle(sim); }
      arr.push(hits); if (strategy === 'optimal') secs.push(time); } });
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length, o = stat.opt, w = stat.bad;
  console.log(`  FIRST hit on an image block (${o.n} hits): optimal placement moves the block ${(o.d / o.n).toFixed(2)} m, displaces ${(o.moved / o.n).toFixed(2)} blocks, clears ${(o.cleared / o.n).toFixed(2)}; poor placement ${(w.d / w.n).toFixed(2)} m, ${(w.moved / w.n).toFixed(2)} blocks, ${(w.cleared / w.n).toFixed(2)} cleared`);
  console.log(`  hits to clear a tower (mean over ${TOWERS.length} towers): optimal ${mean(hitsOpt).toFixed(1)}, random ${mean(hitsRnd).toFixed(1)}, deliberately poor ${mean(hitsPoor).toFixed(1)} (cap 60); per-tower optimal ${hitsOpt.join(' ')}; physics-only time of the optimal strategy ${mean(secs).toFixed(1)} s`);
  ok(o.d / o.n > 3 * (w.d / w.n) && o.cleared / o.n > 3 * (w.cleared / w.n) && o.moved / o.n > 1.5 * (w.moved / w.n), 'well-placed first hits move blocks/structures far more than poorly placed ones (displacement > 3x, blocks cleared > 3x, blocks disturbed > 1.5x)');
  ok(mean(hitsOpt) >= 5 && mean(hitsOpt) <= 11 && hitsOpt.every(h => h >= 3), 'optimal placement still needs several deliberate hits per tower (mean 5-11, none below 3)');
  ok(mean(hitsRnd) >= 1.6 * mean(hitsOpt) && mean(hitsPoor) >= 3 * mean(hitsOpt), 'placing hits randomly takes >= 1.6x as many hits as optimal placement; deliberately poor placement >= 3x'); }

console.log('--- 16. v2.2: weaker weak hits, 100 trials, colour-rule reversal after trial 60');
{ applyPreset('v21'); const oldMax = E(0, 'novel', 0.2, 0.2).multiplier; const grid = []; for (let u = 0; u <= 1.0001; u += 0.05) for (let v = 0; v <= 1.0001; v += 0.05) grid.push([u, v]);
  const oldVals = grid.map(([u, v]) => E(0.3, 'novel', u, v).multiplier), oldFloor = E(0, 'novel', 0.8, 0.8).multiplier, oldCentre = E(0, 'novel', 0.5, 0.5).multiplier, oldMod = E(0, 'novel', 0.35, 0.35).multiplier;
  applyPreset('v22'); const P = (c, f, u, v, ph = 'initial') => effectiveness({ cue: c, familiarity: f, u, v, phase: ph });
  const maxM = P(0, 'novel', 0.2, 0.2).multiplier, floorM = P(0, 'novel', 0.8, 0.8).multiplier, centre = P(0, 'novel', 0.5, 0.5).multiplier;
  console.log(`  old: max ${oldMax.toFixed(2)}, floor ${oldFloor.toFixed(2)}, face centre ${oldCentre.toFixed(2)} | new: max ${maxM.toFixed(2)}, floor ${floorM.toFixed(2)}, face centre ${centre.toFixed(2)}`);
  ok(near(SESSION.nTrials, 100) && SESSION.reversalAfterTrial === 60 && EFFECT.model === 'product', 'preset v22: 100 experimental trials, reversal after trial 60, multiplicative effect model');
  ok(near(maxM, oldMax, 1e-9), `optimal hit keeps the previous maximum impulse (multiplier ${maxM.toFixed(2)} = ${oldMax.toFixed(2)})`);
  ok(floorM / maxM >= 0.10 && floorM / maxM <= 0.20, `very inaccurate hits deliver ${(100 * floorM / maxM).toFixed(0)}% of the maximum impulse (target 10-20%)`);
  let maxStep = 0; for (let u = 0; u < 1; u += 0.005) maxStep = Math.max(maxStep, Math.abs(P(0.5, 'familiar', u + 0.005, 0.8).multiplier - P(0.5, 'familiar', u, 0.8).multiplier));
  ok(maxStep < 0.1, `effectiveness is continuous (largest change per 0.005 of face width: ${maxStep.toFixed(3)})`);
  ok(P(0, 'novel', 0.2, 0.2).multiplier > P(0, 'novel', 0.3, 0.2).multiplier && P(0, 'novel', 0.3, 0.2).multiplier > P(0, 'novel', 0.4, 0.2).multiplier && P(0, 'novel', 0.4, 0.2).multiplier > P(0, 'novel', 0.5, 0.2).multiplier, 'effectiveness falls smoothly with distance from the optimum (graded intermediate values)');
  const newVals = grid.map(([u, v]) => P(0.3, 'novel', u, v).multiplier), meanOf = a => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`  mean multiplier over a uniform grid of click locations: old ${meanOf(oldVals).toFixed(2)} -> new ${meanOf(newVals).toFixed(2)}; moderately inaccurate (colour off 0.15, vertical off 0.15): old ${oldMod.toFixed(2)} -> new ${P(0, 'novel', 0.35, 0.35).multiplier.toFixed(2)}`);
  ok(meanOf(newVals) < 0.6 * meanOf(oldVals) && P(0, 'novel', 0.5, 0.2).multiplier < 0.35 * maxM, 'weak and moderate hits are substantially weaker than before (grid mean < 60% of old; right height + wrong colour position < 35% of max)');
  // colour rule phases
  const cues = [0, 0.25, 0.5, 0.75, 1];
  ok(cues.map(c => preferredXForCue(c, 'initial')).every((x, i) => near(x, [0.2, 0.35, 0.5, 0.65, 0.8][i])), 'initial rule: blue 0.2 ... red 0.8, intermediate colours interpolate linearly');
  ok(cues.map(c => preferredXForCue(c, 'reversed')).every((x, i) => near(x, [0.8, 0.65, 0.5, 0.35, 0.2][i])), 'reversed rule: blue 0.8 ... red 0.2, intermediate colours interpolate linearly in the opposite direction');
  ok([1, 30, 59, 60].every(n => ruleForTrial(n, 60) === 'initial') && [61, 62, 100].every(n => ruleForTrial(n, 60) === 'reversed') && ruleForTrial(null, 60) === 'initial' && ruleForTrial(5, null) === 'initial', 'the rule switches exactly between experimental trial 60 and 61 (tutorial / free play never reversed)');
  ok(['novel', 'familiar'].every(f => near(preferredYForFamiliarity(f), f === 'novel' ? 0.2 : 0.8)) && cues.every(c => ['novel', 'familiar'].every(f => near(P(c, f, 0.5, 0.5, 'initial').preferredY, P(c, f, 0.5, 0.5, 'reversed').preferredY))), 'the vertical (familiarity) rule is identical in both phases (novel 0.2, familiar 0.8)');
  ok(near(P(0, 'novel', 0.8, 0.2, 'reversed').multiplier, maxM) && P(0, 'novel', 0.2, 0.2, 'reversed').multiplier < 0.35 * maxM && near(P(1, 'familiar', 0.2, 0.8, 'reversed').multiplier, maxM), 'the impulse calculation uses the current phase: after the reversal blue is strongest at 0.8 and red at 0.2');
  ok(near(P(0.5, 'novel', 0.5, 0.2, 'initial').multiplier, P(0.5, 'novel', 0.5, 0.2, 'reversed').multiplier), 'the middle colour (cue 0.5, also used in the tutorial) is unaffected by the reversal');
  // participant instructions
  const txt = TUTORIAL_STEPS.map(s => s.text).join('\n'); ok(/may sometimes change/.test(txt) && !/revers|after trial|trial 60|blue.*left|left.*blue|red.*right/i.test(txt), 'instructions say the patterns may sometimes change without revealing the colour mapping, the familiarity mapping beyond the tutorial, or the reversal trial');
  // plan: 100 trials
  const cfg = { towers: TOWERS, nTrials: SESSION.nTrials, orderMode: 'shuffle', imageIds: IMAGES.ids, novelProportion: 0.5, lagChoices: SESSION.lagChoices, phaseBreakAfter: SESSION.reversalAfterTrial };
  let bad = 0, worstNovel = [0.5, 0.5], worstCue = 0, lagsSeen = new Set(), tmax = 0, distinct = 0, minDistinct = 1e9; const N = 60;
  for (let seed = 1; seed <= N; seed++) { const pl = buildPlan({ ...cfg, seed }); if (pl.trials.length !== 100 || pl.trials.some((tr, i) => tr.trialNumber !== i + 1)) bad++; try { validatePlan(pl); } catch { bad++; }
    const cnt = {}; for (const tr of pl.trials) for (const s of tr.slots) cnt[s.imageId] = (cnt[s.imageId] ?? 0) + 1; if (Object.values(cnt).some(n => n > 2)) bad++; distinct = Math.max(distinct, Object.keys(cnt).length); minDistinct = Math.min(minDistinct, Object.keys(cnt).length);
    [[1, 60], [61, 100]].forEach(([a, b], k) => { let nv = 0, fm = 0; const cc = {}; for (const tr of pl.trials.filter(t => t.trialNumber >= a && t.trialNumber <= b)) for (const s of tr.slots) { if (s.expected.familiarity === 'novel') nv++; else { fm++; lagsSeen.add(s.expected.lagTrials); } cc[s.cue] = (cc[s.cue] ?? 0) + 1; }
      const sh = nv / (nv + fm); if (Math.abs(sh - 0.5) > Math.abs(worstNovel[k] - 0.5)) worstNovel[k] = sh; const c = Object.values(cc); if (c.length !== 5) bad++; worstCue = Math.max(worstCue, (Math.max(...c) - Math.min(...c)) / meanOf(c)); }); }
  ok(bad === 0, `default session plan: exactly 100 experimental trials (numbered 1-100), every image at most twice, validatePlan passes (${N} seeds)`);
  ok(worstNovel.every(x => x > 0.42 && x < 0.62), `novel share stays near 50% within each phase in every seed (worst: trials 1-60 ${(100 * worstNovel[0]).toFixed(1)}%, trials 61-100 ${(100 * worstNovel[1]).toFixed(1)}%)`);
  ok(worstCue < 0.12, `all five colour cues are used in both phases and balanced (largest max-min spread ${(100 * worstCue).toFixed(1)}% of the mean count)`);
  ok([...lagsSeen].every(l => [1, 2, 3, 5].includes(l)) && lagsSeen.size === 4, `repetition lags are only 1, 2, 3, 5 (seen ${[...lagsSeen].sort((a, b) => a - b)})`);
  ok(distinct < IMAGES.ids.length - 20, `image pool (${IMAGES.ids.length}) is large enough: a 100-trial session uses up to ${distinct} distinct images (min ${minDistinct})`);
  ok(!IMAGES.ids.some(id => TUTORIAL_IMAGES.ids.includes(id)), 'tutorial and experimental image pools do not overlap');
  // physics: contrast and clearability with the new effect
  const dir = { x: -0.5714, y: 0, z: -0.8207 }; let seedv = 29; const rA = () => { seedv = (seedv * 16807) % 2147483647; return seedv / 2147483647; };
  const build = t => ({ ...t, blocks: t.blocks.map(b => b.image ? { ...b, cue: cues[Math.floor(rA() * 5)], familiarity: rA() < 0.5 ? 'novel' : 'familiar', imageId: 'x', actionable: true, color: 0 } : { ...b, cue: null, imageId: null, actionable: false, color: 0 }) });
  const hit = (sim, b, u, v) => { const e = P(b.props.cue, b.props.familiarity, u, v), p = b.body.translation(), [w, h, d] = b.size; sim.applyImpulseAtPoint(b, { x: p.x + (u - 0.5) * w, y: p.y + (v - 0.5) * h, z: p.z + d / 2 }, dir, CONFIG.impulseMagnitude * e.multiplier); };
  const settle = sim => { let rest = 0, tt = 0; for (let i = 0; i < 720; i++) { sim.step(); tt += 1 / 120; rest = sim.isAtRest() ? rest + 1 / 120 : 0; if (rest >= CONFIG.settle.seconds || tt >= CONFIG.settle.maxWaitSeconds) break; } };
  const res = { optimal: [], ignoreColor: [], random: [], poor: [] }, won = { optimal: 0 }; let offPlatformByPoor = 0, poorHits = 0;
  TOWERS.forEach(t => { const tower = build(t);
    for (const strategy of Object.keys(res)) { const sim = new Simulation(tower); let hits = 0;
      while (hits < 100) { const c = sim.blocks.filter(b => !b.cleared && b.props.actionable); if (!c.length) break; const b = c.reduce((a, x) => (x.body.translation().y < a.body.translation().y ? x : a)); const pref = P(b.props.cue, b.props.familiarity, 0.5, 0.5);
        const [u, v] = strategy === 'optimal' ? [pref.preferredX, pref.preferredY] : strategy === 'poor' ? [1 - pref.preferredX, 1 - pref.preferredY] : strategy === 'ignoreColor' ? [0.5, pref.preferredY] : [rA(), rA()]; const before = sim.blocks.filter(x => x.cleared).length; hit(sim, b, u, v); hits++; settle(sim);
        if (strategy === 'poor') { poorHits++; offPlatformByPoor += sim.blocks.filter(x => x.cleared).length - before; } }
      res[strategy].push(hits); if (strategy === 'optimal' && !sim.blocks.some(b => !b.cleared && b.props.actionable)) won.optimal++; } });
  console.log(`  hits to clear (mean of ${TOWERS.length} towers, cap 100): optimal ${meanOf(res.optimal).toFixed(1)}, ignoring the colour rule ${meanOf(res.ignoreColor).toFixed(1)}, random ${meanOf(res.random).toFixed(1)}, deliberately poor ${meanOf(res.poor).toFixed(1)}; blocks knocked off per poor hit ${(offPlatformByPoor / poorHits).toFixed(3)}`);
  ok(won.optimal === TOWERS.length && meanOf(res.optimal) >= 5 && meanOf(res.optimal) <= 11, `towers can be cleared with well-placed hits (all ${TOWERS.length} cleared; mean ${meanOf(res.optimal).toFixed(1)} hits)`);
  ok(meanOf(res.ignoreColor) >= 2.5 * meanOf(res.optimal) && meanOf(res.random) >= 3.5 * meanOf(res.optimal) && meanOf(res.poor) >= 8 * meanOf(res.optimal), 'ignoring the colour rule, random clicking and deliberately poor clicking take >= 2.5x / 3.5x / 8x as many hits as optimal placement');
  ok(offPlatformByPoor / poorHits < 0.05, 'repeated ineffective hits rarely knock blocks off the platform (< 0.05 blocks per poor hit, from the physics alone)');
  applyPreset('v21'); }

console.log('--- 10. Version 1 is untouched');
try { const v1 = new URL('../../block_game', import.meta.url).pathname;
  const dirty = execSync(`git -C "${v1}" status --porcelain`).toString().trim(), head = execSync(`git -C "${v1}" rev-parse --short HEAD`).toString().trim();
  ok(dirty === '', `block_game has no uncommitted changes (HEAD ${head}; last known V1 commit 072b27e)`); ok(head === '072b27e', 'block_game HEAD is still the published commit 072b27e'); } catch (e) { console.log('  (block_game not found next to this folder; skipped)'); }

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
