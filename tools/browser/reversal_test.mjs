// Browser test of the colour-rule reversal and the rule-reconstruction logging. Short session (8 trials, reversal after trial 4) played by a bot that always clicks the
// optimum for the CURRENT rule (read from the trial log). Checks the exported JSON/CSV: rule phase per trial, optimal positions, click coordinates, recomputed effectiveness and impulse.
// Needs puppeteer-core, Chrome and `npm run dev` on 5174 (or URL=...). Run: node tools/browser/reversal_test.mjs   (TUTORIAL=0 skips the tutorial; default plays it)
import puppeteer from 'puppeteer-core';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { EFFECT } from '../../src/experiment.js';
import { effectiveness } from '../../src/effectiveness.js';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', BASE = process.env.URL ?? 'http://localhost:5174/', TUT = process.env.TUTORIAL !== '0';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'v2rev_'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await p.goto(`${BASE}?trials=8&reversal=4&seed=31&maxTrial=40&pause=300&order=sequence&towers=1,2,3,4,5,6,7,8&tutorial=${TUT ? 1 : 0}`, { waitUntil: 'domcontentloaded' }); await sleep(3500);
const ev = f => p.evaluate(f);
const vis = sel => ev(`(()=>{const e=document.querySelector('${sel}'); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display!=='none'})()`);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50); } return false; };
const phase = () => ev(() => window.__game.game.phase);
const clickCross = async () => { const r = await ev(() => { const r = document.getElementById('crossBtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await p.mouse.click(r.x, r.y); };
async function play(optimal) {
  const t0 = Date.now(), poor = {};   // poor[id]: the last hit on that block was weak (e.g. the point landed on a top face of a tilted block) -> jitter the next attempt
  const jit = () => (Math.random() - 0.5) * 0.16;
  while (Date.now() - t0 < 120000 && (await phase()) === 'play' && !(await ev(() => window.__game.game.ending))) {
    await waitFor(async () => (await ev(() => window.__game.game.status)) === 'ready' || (await phase()) !== 'play', 5000);
    const info = await ev(() => { const t = window.__log.active; return window.__game.game.sim.blocks.filter(bk => !bk.cleared && bk.props.imageId).map(bk => ({ id: bk.id, px: t?.blocks[bk.id]?.preferredX, py: t?.blocks[bk.id]?.preferredY })); });
    for (const o of info) { const [u, v] = optimal ? [o.px + (poor[o.id] ? jit() : 0), o.py + (poor[o.id] ? jit() : 0)] : [0.5, 0.5]; const q = await ev(`window.__game.screenPoint(${o.id},${u - 0.5},${v - 0.5},0.5)`);
      const h = await ev(`(()=>{const x=window.__game.view.pick(${q.x},${q.y}); return x?x.block.id:-1})()`); if (h === o.id) { await p.mouse.click(q.x, q.y); await sleep(60); const last = await ev(() => { const a = window.__log.active?.actions.at(-1); return a?.effectiveness?.multiplier ?? null; }); poor[o.id] = last !== null && last < 1.0; break; } }
    await sleep(150);
  }
  await waitFor(async () => (await phase()) !== 'play', 8000);
}
await p.click('#cardBtn'); await sleep(300);
let cards = 0, trialsSeen = 0;
for (let guard = 0; guard < 80; guard++) {
  if (!(await waitFor(async () => (await vis('#card')) || (await vis('#crossBtn')) || (await vis('#endBox')), 8000))) break;
  if (await vis('#endBox')) break;
  if (await vis('#card')) { const txt = await ev(() => document.getElementById('cardText').textContent); if (/may sometimes change/.test(txt)) cards++; await p.click('#cardBtn'); await sleep(250); continue; }
  await clickCross(); await sleep(150);
  const ph = await ev(() => window.__log.active?.phase); await play(ph === 'experiment'); trialsSeen++;
}
ok(await vis('#endBox'), `session finished (end screen) after ${trialsSeen} trials`);
await p.click('#endJson'); await sleep(600); await p.click('#endEvents'); await sleep(600); await p.click('#endCsv'); await sleep(900);
const files = fs.readdirSync(DL), jf = files.find(f => f.endsWith('.json')), ef = files.find(f => f.endsWith('_events.csv')), tf = files.find(f => f.endsWith('_trials.csv'));
ok(jf && ef && tf, 'JSON, events CSV and trials CSV exported');
const J = JSON.parse(fs.readFileSync(path.join(DL, jf), 'utf8')), exp = J.trials.filter(t => t.phase === 'experiment'), tut = J.trials.filter(t => t.phase === 'tutorial');
ok(cards === (TUT ? 1 : 0) || !TUT, `tutorial's last card contains the "may sometimes change" instruction (${cards} card)`);
ok(exp.length === 8 && exp.every((t, i) => t.trialNumber === i + 1), 'experimental trials are numbered 1..8 in order');
ok(exp.every((t, i) => t.colorRulePhase === (i + 1 <= 4 ? 'initial' : 'reversed')), `trial rule phase: ${exp.map(t => t.colorRulePhase[0]).join('')} (i = initial, r = reversed) - switches between trial 4 and 5`);
ok(tut.every(t => t.colorRulePhase === 'initial'), `tutorial trials (${tut.length}) are all in the initial phase and do not count towards the reversal`);
ok(J.session.experimentConfig.colorRule.reversalAfterTrial === 4 && J.session.experimentConfig.colorRule.preferredXByCue.reversed['0'] === 0.8 && J.session.experimentConfig.colorRule.preferredXByCue.initial['0'] === 0.2, 'session config records the reversal trial and both colour mappings');
Object.assign(EFFECT, J.session.experimentConfig.physicsActual.effect); const imp = J.session.experimentConfig.physicsActual.impulseMagnitude;
let fired = 0, bad = [], impBad = 0, missingFields = 0, beforeOK = 0, afterOK = 0, wrongPhaseOpt = 0;
for (const t of exp) for (const a of t.actions.filter(a => a.result === 'fired')) { fired++;
  for (const k of ['experimentalTrialNumber', 'colorRulePhase', 'optimalU', 'optimalV', 'clickU', 'clickV', 'previousPresentationTrial', 'lagTrials']) if (!(k in a)) missingFields++;
  const e = effectiveness({ cue: a.cue, familiarity: a.familiarity, u: a.u, v: a.v, phase: t.colorRulePhase });
  if (Math.abs(e.multiplier - a.effectiveness.multiplier) > 0.01 || Math.abs(e.preferredX - a.optimalU) > 0.002 || Math.abs(e.preferredY - a.optimalV) > 0.002) bad.push([t.trialNumber, a.actionNumber]);
  if (Math.abs(imp * a.effectiveness.multiplier - a.impulse.magnitude) > 0.01) impBad++;
  if (a.experimentalTrialNumber !== t.trialNumber || a.colorRulePhase !== t.colorRulePhase) wrongPhaseOpt++;
  if (a.cue === 0 && a.hasImage) { if (t.colorRulePhase === 'initial' && Math.abs(a.optimalU - 0.2) < 1e-6) beforeOK++; if (t.colorRulePhase === 'reversed' && Math.abs(a.optimalU - 0.8) < 1e-6) afterOK++; } }
ok(fired > 20 && missingFields === 0, `${fired} fired hits, all with the new rule-reconstruction fields`);
ok(bad.length === 0, `logged multiplier and optimum are reproduced from (cue, familiarity, click u/v, rule phase) for every hit${bad.length ? ' - mismatches: ' + JSON.stringify(bad.slice(0, 5)) : ''}`);
ok(impBad === 0 && wrongPhaseOpt === 0, 'applied impulse = base impulse x multiplier for every hit; per-hit trial number / phase match the trial');
ok(beforeOK > 0 && afterOK > 0, `blue blocks: optimum 0.2 before the reversal (${beforeOK} hits) and 0.8 after it (${afterOK} hits)`);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];   // the bot sometimes cannot reach the optimum (e.g. a tilted block shows only its top face, which counts as v = 1), so judge each trial by its median hit
const strong = ph => { const ts = exp.filter(t => t.colorRulePhase === ph); return ts.filter(t => med(t.actions.filter(a => a.result === 'fired').map(a => a.effectiveness.multiplier)) > 1.7).length / ts.length; };
ok(strong('initial') >= 0.75 && strong('reversed') >= 0.75, `optimal-clicking bot: median hit multiplier > 1.7 in ${(100 * strong('initial')).toFixed(0)}% of initial-phase and ${(100 * strong('reversed')).toFixed(0)}% of reversed-phase trials`);
ok(exp.filter(t => t.completed).length >= 7, `at least 7 of 8 experimental trials cleared by the bot (outcomes: ${exp.map(t => t.outcome[0]).join('')}; hits ${exp.map(t => t.hits).join(',')})`);
const tcsv = fs.readFileSync(path.join(DL, tf), 'utf8').split('\n'), ecsv = fs.readFileSync(path.join(DL, ef), 'utf8').split('\n');
ok(tcsv[0].includes('colorRulePhase') && ['experimentalTrialNumber', 'colorRulePhase', 'optimalU', 'optimalV', 'clickU', 'clickV', 'previousPresentationTrial'].every(c => ecsv[0].split(',').includes(c)), 'trials CSV and events CSV include the rule fields');
const imgs = {}; for (const t of exp) for (const bl of t.blocks.filter(x => x.imageId)) (imgs[bl.imageId] ??= []).push({ n: t.trialNumber, fam: bl.familiarity, prev: bl.previousTrial, lag: bl.lagTrials });
ok(Object.values(imgs).every(a => a.length <= 2 && a[0].fam === 'novel' && (a.length === 1 || (a[1].fam === 'familiar' && a[1].prev === a[0].n && a[1].lag === a[1].n - a[0].n))), 'each image: at most 2 presentations, novel then familiar, with previous-presentation trial and lag logged');
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); console.log(fails ? `${fails} FAILED` : 'all passed');
