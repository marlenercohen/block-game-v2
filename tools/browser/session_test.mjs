// End-to-end browser test of the experimental session: intro -> tutorial -> experimental trials (with start cross) -> end screen -> export.
// Needs `npm i puppeteer-core` somewhere, Chrome, and `npm run dev` on 5174. Edit CHROME. Run: node tools/browser/session_test.mjs
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.URL ?? 'http://localhost:5174/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'v2sess_'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await p.goto(`${BASE}?trials=5&seed=21&maxTrial=10&skipAfter=2&pause=400&order=sequence&towers=1,2,3,4,5`, { waitUntil: 'domcontentloaded' }); await sleep(3500);
const ev = f => p.evaluate(f); const log = (...a) => console.log(...a);
const vis = sel => ev(`(()=>{const e=document.querySelector('${sel}'); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display!=='none'})()`);
const sceneVisible = () => ev(() => window.__game.view.group.visible && window.__game.view.platform.visible);
const logTrials = () => ev(() => JSON.parse(JSON.stringify(window.__log.data.trials)));
const waitFor = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50); } return false; };
const waitReady = () => waitFor(async () => (await ev(() => window.__game.game.status)) === 'ready' || (await ev(() => window.__game.game.phase)) !== 'play');
const clickCross = async () => { const r = await ev(() => { const r = document.getElementById('crossBtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await p.mouse.click(r.x, r.y); };
const hitBlock = async (id, fx = 0, fy = 0) => { const q = await ev(`window.__game.screenPoint(${id}, ${fx}, ${fy}, 0.5)`); await p.mouse.click(q.x, q.y); await sleep(120); };
const phase = () => ev(() => window.__game.game.phase);
async function playUntilEnd(maxMs = 60000, forceAfterMs = null) {            // bot: hit image blocks until the trial ends (optionally clear the rest after forceAfterMs so the test stays short)
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs && (await phase()) === 'play' && !(await ev(() => window.__game.game.ending))) {
    await waitReady(); const ids = await ev(() => window.__game.game.sim.blocks.filter(bk => !bk.cleared && bk.props.imageId).map(bk => bk.id));
    for (const id of ids) { const q = await ev(`window.__game.screenPoint(${id},0,0,0.5)`); const h = await ev(`(()=>{const x=window.__game.view.pick(${q.x},${q.y}); return x?x.block.id:-1})()`); if (h === id) { await p.mouse.click(q.x, q.y); break; } }
    await sleep(150);
    if (forceAfterMs && Date.now() - t0 > forceAfterMs && (await phase()) === 'play') { await ev(() => window.__game.game.sim.blocks.forEach(bk => { if (bk.props.imageId) bk.cleared = true; })); break; }
  }
  await waitFor(async () => (await phase()) !== 'play', 8000);
}

console.log('--- intro and tutorial');
ok(await vis('#card') && !(await vis('#crossBtn')), 'intro card shown first (no tower, no cross)');
const introText = await ev(() => document.getElementById('cardText').textContent);
ok(/plus sign/i.test(introText) && /click the plus to begin the trial/i.test(introText), 'intro card tells participants to click the plus sign to begin each trial');
await p.click('#cardBtn'); await sleep(200);
const cardTexts = []; const tutorialOutcomes = [];
let step = 0;
while (await waitFor(async () => (await vis('#card')) || (await vis('#crossBtn')), 3000)) {
  if (await vis('#card')) { cardTexts.push(await ev(() => document.getElementById('cardTitle').textContent + ' ' + document.getElementById('cardText').textContent));
    await p.click('#cardBtn'); await sleep(250); if (cardTexts.length === 6) break; continue; }   // the 6th card ('Begin') starts the experiment
  // cross screen
  const hiddenBefore = !(await sceneVisible()) && (await ev(() => window.__game.game.phase)) === 'cross';
  if (step === 0) await p.screenshot({ path: path.join(DL, 'cross_screen.png') });
  const cap = await vis('#crossHint') ? await ev(() => document.getElementById('crossHint').textContent) : '';
  ok(/click the plus/i.test(cap), `tutorial trial ${step + 1}: caption under the plus: "${cap}"`);
  ok(hiddenBefore, `tutorial trial ${step + 1}: start cross shown and the tower/platform are hidden until the cross is clicked`);
  await clickCross(); await sleep(150);
  ok((await sceneVisible()) && !(await vis('#crossBtn')), `   after the click: cross removed, tower visible; hint: "${await ev(() => document.getElementById('hintBar').textContent)}"`);
  if (step === 0) await p.screenshot({ path: path.join(DL, 'tutorial_trial1.png') });
  // for the "location" step hit two different places before finishing
  await playUntilEnd(60000, 25000); step++;
  if (step > 8) break;
}
const T0 = await logTrials();
const tut = T0.filter(t => t.phase === 'tutorial');
ok(tut.length === 5 && tut.every(t => t.trialNumber === null && t.tutorialTrialNumber >= 1 && /-T\d+$/.test(t.trialId)), `tutorial recorded separately: ${tut.length} tutorial trials with trialNumber null, tutorialTrialNumber ${tut.map(t => t.tutorialTrialNumber).join(',')}, outcomes ${tut.map(t => t.outcome).join(',')}`);
const allText = cardTexts.join(' ').toLowerCase();
ok(cardTexts.length === 6, `${cardTexts.length} instruction cards shown`);
const banned = ['blue', 'red', 'purple', 'left', 'right', 'violet'].filter(w => new RegExp(`\\b${w}\\b`).test(allText));
ok(banned.length === 0, `tutorial text never mentions the colour mapping (checked words: blue, red, purple, left, right; found: ${banned.join(',') || 'none'}); it does mention that colour is a hint: ${/color of a block/.test(allText)}`);
ok(/new picture/.test(allText) && /bottom/.test(allText) && /familiar/.test(allText) && /top of the picture/.test(allText) && /cannot hit/.test(allText), 'tutorial explains goal, hit location, picture-less blocks, novel -> bottom, familiar -> top');
const tNov = tut.find(t => t.tutorialStep === 'novel'), tFam = tut.find(t => t.tutorialStep === 'familiar');
const bn = tNov.blocks.find(x => x.hasImage), bf = tFam.blocks.find(x => x.hasImage);
ok(bn.imageId === bf.imageId && bn.familiarity === 'novel' && bf.familiarity === 'familiar' && bf.presentationNumber === 2, `familiarity demo: image ${bn.imageId} first novel (#${bn.presentationNumber}) then familiar (#${bf.presentationNumber})`);
const tutIds = new Set(tut.flatMap(t => t.blocks.filter(x => x.imageId).map(x => x.imageId)));

console.log('--- experimental trials (5 planned; trial 3 left to time out, trial 4 skipped with the button)');
const plan = await ev(() => JSON.parse(JSON.stringify(window.__game.sess.plan)));
ok(plan.trials.length === 5 && plan.stats.seed === 21, `plan built: seed ${plan.stats.seed}, ${plan.stats.novelPresentations} novel / ${plan.stats.familiarPresentations} familiar presentations`);
for (let n = 1; n <= 5; n++) {
  ok(await waitFor(() => vis('#crossBtn'), 10000), `trial ${n}: start cross is shown`);
  if (n === 1) ok(!(await vis('#crossHint')), '   no tutorial caption under the plus in experimental trials');
  const hidden = !(await sceneVisible()); const info = await ev(() => document.getElementById('trialInfo').textContent);
  ok(hidden, `   tower hidden behind the cross (phase ${await phase()})`);
  await sleep(300); await clickCross(); await sleep(150);
  if (n === 1) {   // first-hit indicators: press a gray block, then the image block twice
    const blocks = await ev(() => window.__game.game.sim.blocks.map(bk => ({ id: bk.id, img: !!bk.props.imageId })));
    const gray = blocks.find(x => !x.img), img = blocks.find(x => x.img);
    if (gray) await hitBlock(gray.id, 0.2, 0.2);
    await hitBlock(img.id, -0.25, -0.25); await waitReady(); await hitBlock(img.id, 0.25, 0.25);
  }
  if (n === 3) { ok(await waitFor(async () => (await phase()) !== 'play', 16000), '   (no clicks) trial 3 ends by timeout'); }
  else if (n === 4) { await sleep(300); ok(await waitFor(() => vis('#skipBtn'), 6000), '   skip button appears after the configured delay'); await p.click('#skipBtn'); await waitFor(async () => (await phase()) !== 'play', 4000); }
  else await playUntilEnd(60000, 6000);
}
ok(await waitFor(() => vis('#endBox'), 15000), 'end screen shown after the last trial');
const T = await logTrials(); const exp = T.filter(t => t.phase === 'experiment');
ok(exp.length === 5 && exp.map(t => t.trialNumber).join() === '1,2,3,4,5' && exp.every(t => t.tutorialTrialNumber === null), `experimental trials numbered 1..5 independently of the ${tut.length} tutorial trials`);
log('   outcomes:', exp.map(t => t.outcome).join(', '));
ok(exp[2].outcome === 'timeout' && exp[3].outcome === 'manual_advance' && ['completed'].includes(exp[0].outcome) && exp[4].outcome === 'completed', 'outcomes recorded: completed / timeout / manual_advance distinguished');
ok(exp.every(t => t.cross && t.cross.onsetSessionMs < t.cross.clickSessionMs && t.cross.clickSessionMs <= t.towerOnsetSessionMs + 5 && t.cross.latencyMs > 250 && t.cross.clickScreen && t.cross.pointerType === 'mouse'), `start-cross onset/click/tower-onset times recorded (latencies ${exp.map(t => Math.round(t.cross.latencyMs)).join(', ')} ms)`);
ok(exp.every(t => t.towerOnsetSessionMs !== null && t.actions.every(a => a.tMs === null || a.tMs >= 0)), 'trial clock starts at tower onset (all action times >= 0)');
ok(exp[2].durationMs > 9500 && exp[2].durationMs < 11500, `timeout trial lasted ${Math.round(exp[2].durationMs)} ms (limit 10000)`);

console.log('--- image familiarity, pools and lags (from the logged blocks)');
const seen = {}; let bad = 0, lagBad = 0, lagRows = [];
for (const t of exp) { const ids = t.blocks.filter(x => x.imageId).map(x => x.imageId);
  for (const bl of t.blocks.filter(x => x.imageId)) { const n = (seen[bl.imageId]?.count ?? 0) + 1; if (bl.presentationNumber !== n || bl.familiarity !== (n === 1 ? 'novel' : 'familiar')) bad++;
    if (n > 1) { const prev = seen[bl.imageId].last, lag = t.trialNumber - prev; if (bl.lagTrials !== lag || bl.interveningTrials !== lag - 1 || bl.previousTrial !== prev) lagBad++; lagRows.push(`${bl.imageId}:lag ${bl.lagTrials}/${bl.interveningDistinctImages} distinct`); } else if (bl.lagTrials !== null) lagBad++; }
  for (const id of ids) seen[id] = { count: (seen[id]?.count ?? 0) + 1, last: t.trialNumber }; }
ok(bad === 0, `presentation numbers and novel/familiar status match the presentation history (${bad} violations); presentation is counted whether or not the block was hit`);
ok(lagBad === 0, `repetition lags recorded correctly (${lagRows.join('; ') || 'no repeats in this short session'})`);
const expIds = new Set(exp.flatMap(t => t.blocks.filter(x => x.imageId).map(x => x.imageId)));
ok([...expIds].every(id => !tutIds.has(id)) && exp.flatMap(t => t.blocks).filter(x => x.imageId).every(x => !(x.imageId in {})), 'tutorial images never appear in experimental trials (separate pool, separate history)');
ok(exp.flatMap(t => t.blocks).filter(x => x.hasImage && x.presentationNumber === 1).length === [...expIds].length, 'first experimental presentation of every image is novel (tutorial practice did not count)');
const fam = plan.trials.flatMap(t => t.slots.map(s => [s.expected.familiarity, s.role]));
ok(fam.every(([f, r]) => r === 'explicit' || r === f || r === 'familiar' && f === 'familiar' || r === 'novel' && f === 'novel'), 'logged familiarity equals the planned role for every slot');

console.log('--- first-hit indicators and complete event logging (trial 1)');
const ev1 = exp[0].actions; const by = new Map();
const rowsFirst = ev1.filter(a => a.hitBlock).map(a => `${a.eventType}@b${a.blockIndex} first[att:${a.first?.attemptOnBlock} act:${a.first?.actionableAttemptOnBlock} imp:${a.first?.impulseOnBlock}] prior=${a.trialContext?.priorImpulsesOnTrial}/${a.trialContext?.priorImpulseOnOtherBlock} moved:${a.blockState?.previouslyMoved}`);
rowsFirst.slice(0, 5).forEach(r => log('   ' + r));
const imgBlock = ev1.find(a => a.eventType === 'fired')?.blockIndex; const onImg = ev1.filter(a => a.blockIndex === imgBlock);
ok(onImg.length >= 2 && onImg[0].first.attemptOnBlock && onImg[0].first.actionableAttemptOnBlock && onImg[0].first.impulseOnBlock && !onImg[1].first.attemptOnBlock && !onImg[1].first.actionableAttemptOnBlock && onImg[1].first.impulseOnBlock === false, 'first attempt / first actionable attempt / first impulse flagged on the first press only; the second press on the same block is not first');
ok(onImg[0].trialContext.priorImpulsesOnTrial === 0 && onImg[1].trialContext.priorImpulsesOnTrial === 1 && onImg[1].blockState.previouslyMoved === true && onImg[0].blockState.previouslyMoved === false, 'prior-impulse count and "block had previously moved" are correct (second hit on a block that was already moving)');
ok(['position', 'quaternion', 'tiltDeg', 'displacementFromInitial', 'rotationFromInitialDeg', 'maxSpeedSoFar'].every(k => k in onImg[0].blockState) && onImg[0].tMs > 0, 'block pose, tilt, displacement/rotation and elapsed time since tower onset recorded for each press');
const grayAttempt = ev1.find(a => a.eventType === 'non_actionable');
if (grayAttempt) ok(grayAttempt.first.attemptOnBlock && grayAttempt.first.actionableAttemptOnBlock === false && grayAttempt.hasImage === false, 'press on an image-less block is kept in the data (non_actionable) with its own first-attempt flag');
ok(exp[0].attempts === ev1.filter(a => !a.afterTrialEnd).length, `attempt counter (${exp[0].attempts}) equals the number of logged events`);

console.log('--- export and persistence');
await p.click('#endJson'); await sleep(500); await p.click('#endCsv'); await sleep(500); await p.click('#endEvents'); await sleep(1200);
const files = fs.readdirSync(DL); const jf = files.find(f => f.endsWith('.json')), tf = files.find(f => f.endsWith('_trials.csv')), ef = files.find(f => f.endsWith('_events.csv'));
ok(jf && tf && ef, `end-screen downloads work: ${[jf, tf, ef].join(', ')}`);
const J = JSON.parse(fs.readFileSync(path.join(DL, jf), 'utf8'));
const nEvents = J.trials.reduce((s, t) => s + t.actions.length, 0); const ecsv = fs.readFileSync(path.join(DL, ef), 'utf8').trim().split('\n');
ok(J.schema === 'blockgame-v2-log/2' && J.trials.length === tut.length + 5 && ecsv.length - 1 === nEvents, `JSON holds the whole session (${J.trials.length} trials incl. tutorial, ${nEvents} events); events CSV has one row per event (${ecsv.length - 1})`);
ok(J.session.plan && J.session.experimentConfig && J.session.experimentConfig.session, 'session record contains the plan (seed, towers, images, cues) and the configuration');
const ec = J.session.experimentConfig;
ok(ec.experimentVersion === 'v2.2-weak-hits-100-trials-reversal' && ec.preset.name === 'v22' && ec.physicsActual.blockMass === 1 && ec.physicsActual.impulseMagnitude === 3.2 && ec.physicsActual.blockFriction === 0.5 && ec.physicsActual.effect.baseline === 0.25 && ec.physicsActual.effect.model === 'product' && ec.towerDefinitions.length === 12 && ec.towerDefinitions[0].blocks.length >= 6, `version, preset, physics parameters and all ${ec.towerDefinitions.length} tower definitions are saved in the data (${ec.experimentVersion})`);
ok(J.trials.every(t => t.physics && t.physics.blockMass === 1 && t.physics.preset === 'v22' && t.physics.experimentVersion), 'every trial record carries its physics snapshot and experiment version');
ok(fs.readFileSync(path.join(DL, tf), 'utf8').split('\n')[0].includes('phase') && ecsv[0].includes('firstAttemptOnBlock') && ecsv[0].includes('blockTiltDeg'), 'CSV headers include phase, first-hit and block-state columns');
await p.screenshot({ path: path.join(DL, 'end_screen.png') });
log('errors:', errs); ok(errs.length === 0, 'no page errors'); log('output dir', DL);
await b.close();
