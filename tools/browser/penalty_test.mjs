// Browser test of the horizontal-error penalty (preset v23). Short session (6 trials, reversal after trial 3). Scripted scenarios on trials 1 (initial rule) and 4 (reversed rule),
// a clearing bot on the others. Checks: penalty = no impulse + exactly one display-only block, sub-threshold clicks fire normally, the optimum follows the current rule, penalty blocks
// are removable by one click anywhere, the trial cannot finish while they remain, towers are unaffected, and the exported JSON/CSV record everything.
// Needs puppeteer-core, Chrome and `npm run dev` on 5174 (or URL=...). Run: node tools/browser/penalty_test.mjs   (TUTORIAL=1 also plays the tutorial and checks the instruction card)
import puppeteer from 'puppeteer-core';
import fs from 'fs'; import os from 'os'; import path from 'path';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', BASE = process.env.URL ?? 'http://localhost:5174/', TUT = process.env.TUTORIAL === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'v2pen_'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await p.goto(`${BASE}?trials=6&reversal=3&seed=41&maxTrial=90&pause=300&order=sequence&towers=1,2,3,4,5,6&tutorial=${TUT ? 1 : 0}`, { waitUntil: 'domcontentloaded' }); await sleep(3500);
const ev = f => p.evaluate(f);
const vis = sel => ev(`(()=>{const e=document.querySelector('${sel}'); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display!=='none'})()`);
const waitFor = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50); } return false; };
const phase = () => ev(() => window.__game.game.phase);
const clickCross = async () => { const r = await ev(() => { const r = document.getElementById('crossBtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await p.mouse.click(r.x, r.y); };
const ready = () => waitFor(async () => (await ev(() => window.__game.game.status)) === 'ready', 5000);
const state = () => ev(() => { const t = window.__log.active, g = window.__game.game; return { phase: g.phase, won: g.won, ending: g.ending, penalties: g.penalties.length, actions: t?.actions.length ?? 0, hits: t?.hits ?? 0, added: t?.penaltyBlocksAdded ?? 0, removed: t?.penaltyBlocksRemoved ?? 0, rule: t?.colorRulePhase, hint: document.getElementById('hintBar').textContent, hintVisible: !document.getElementById('hintBar').classList.contains('hidden') }; });
const lastAction = () => ev(() => { const a = window.__log.active?.actions.at(-1); return a ? JSON.parse(JSON.stringify(a)) : null; });
const imageBlocks = () => ev(() => { const t = window.__log.active; return window.__game.game.sim.blocks.filter(bk => !bk.cleared && bk.props.imageId).map(bk => ({ id: bk.id, cue: bk.props.cue, px: t.blocks[bk.id].preferredX, py: t.blocks[bk.id].preferredY })); });
const positions = () => ev(() => window.__game.game.sim.blocks.map(bk => { const q = bk.body.translation(); return [q.x, q.y, q.z]; }));
async function clickFace(id, u, v) {            // click the +z face at normalised (u, v); returns false if that point is not a front-face point of the block
  const q = await ev(`window.__game.screenPoint(${id},${u - 0.5},${v - 0.5},0.5)`);
  const h = await ev(`(()=>{const x=window.__game.view.pick(${q.x},${q.y}); return x?{id:x.block.id,nz:x.normal.z}:null})()`);
  if (!h || h.id !== id || h.nz < 0.5) return false; await p.mouse.click(q.x, q.y); await sleep(120); return true;
}
const farU = o => (o.px + 0.3 <= 0.97 ? o.px + 0.3 : o.px - 0.3);
async function startTrial() { await waitFor(async () => (await vis('#crossBtn')) || (await vis('#endBox')) || (await vis('#card')), 15000); if (await vis('#card')) { await p.click('#cardBtn'); await sleep(250); return startTrial(); } if (await vis('#endBox')) return false; await clickCross(); await sleep(200); return true; }
async function removeAllPenalties(offsets = [[0, 0, 0.5]]) {
  let n = 0; for (let g = 0; g < 80; g++) { const ids = await ev(() => window.__game.penaltyIds()); if (!ids.length) break; const [fx, fy, fz] = offsets[n % offsets.length];
    const q = await ev(`window.__game.penaltyScreenPoint(${ids[0]},${fx},${fy},${fz})`); await p.mouse.click(q.x, q.y); await sleep(100); n++; } return n;
}
async function clearTower() {            // bot: optimal clicks (with jitter after a weak result); removes penalty blocks only when told to by the caller
  const t0 = Date.now(), poor = {}; const jit = () => (Math.random() - 0.5) * 0.12;
  while (Date.now() - t0 < 120000 && !(await state()).won && (await phase()) === 'play') {
    await ready(); const list = await imageBlocks();
    for (const o of list) { const u = Math.min(0.9, Math.max(0.1, o.px + (poor[o.id] ? jit() : 0))), v = Math.min(0.9, Math.max(0.1, o.py + (poor[o.id] ? jit() : 0)));
      if (await clickFace(o.id, u, v)) { const a = await lastAction(); poor[o.id] = !(a?.effectiveness?.multiplier > 1.0); break; } }
    await sleep(100);
  }
}
async function botTrial() { await clearTower(); await removeAllPenalties(); await waitFor(async () => (await phase()) !== 'play', 10000); }

const res = {};
if (TUT) {            // tutorial: instruction text present, no penalties in tutorial trials
  await p.click('#cardBtn'); await sleep(300); let cardsWithPenaltyText = 0, cardsWithChangeText = 0, cards = 0;
  for (let g = 0; g < 40; g++) { await waitFor(async () => (await vis('#card')) || (await vis('#crossBtn')), 8000); if (await vis('#card')) { const txt = await ev(() => document.getElementById('cardText').textContent); cards++; if (/dark-gray block/.test(txt) && /once to remove/.test(txt) && /AND clear all/.test(txt)) cardsWithPenaltyText++; if (/may sometimes change/.test(txt)) cardsWithChangeText++; const title = await ev(() => document.getElementById('cardTitle').textContent); await p.click('#cardBtn'); await sleep(250); if (/one more hint/i.test(title)) break; continue; }
    await clickCross(); await sleep(200); for (let k = 0; k < 40 && (await phase()) === 'play'; k++) { await ready(); const l = await imageBlocks(); if (l[0]) await clickFace(l[0].id, 0.5, 0.5); await sleep(80); if ((await state()).won) break; } await waitFor(async () => (await phase()) !== 'play', 8000); }
  ok(cardsWithPenaltyText === 1 && cardsWithChangeText === 1, 'tutorial shows one card explaining the dark-gray penalty blocks and one saying the patterns may sometimes change');
}
// ---- trial 1 (initial rule) ----
ok(await startTrial(), 'trial 1 started');
let s0 = await state(); ok(s0.rule === 'initial' && s0.penalties === 0, 'trial 1: initial rule, no penalty blocks');
await ready(); let list = await imageBlocks(); const A = list[0], before = await positions();
ok(await clickFace(A.id, Math.max(0.03, Math.min(0.97, farU(A))), A.py), 'trial 1: clicked image block A with horizontal error 0.30');
await sleep(600); let a = await lastAction(), s1 = await state();
ok(a.result === 'penalty' && a.penaltyTriggered === true && a.impulseApplied === false && a.impulse === null && Math.abs(a.horizontalError - 0.3) < 0.03 && a.targetType === 'image_block', `penalised press logged (result ${a.result}, impulse ${a.impulse}, horizontal error ${a.horizontalError}, target ${a.targetType})`);
ok(s1.penalties === 1 && s1.added === 1 && s1.hits === 0, 'exactly one penalty block was added and no hit was counted');
const after = await positions(); ok(JSON.stringify(before) === JSON.stringify(after), 'no block of the tower moved (zero impulse, penalty block has no physics)');
const boxes = await ev(() => window.__game.penaltyBoxes()); ok(boxes.length === 1 && boxes[0].z > 0.5 && boxes[0].y > 0, 'the penalty block sits in the penalty area at the front of the platform');
await ready(); ok(await clickFace(A.id, Math.max(0.03, Math.min(0.97, A.px + 0.2 * (A.px > 0.5 ? -1 : 1))), A.py), 'clicked block A with horizontal error 0.20'); await sleep(200);
a = await lastAction(); s1 = await state();
ok(a.result === 'fired' && a.penaltyTriggered === false && a.impulseApplied && Math.abs(a.horizontalError - 0.2) < 0.03 && s1.penalties === 1 && s1.hits === 1, `error 0.20 -> normal hit (result ${a.result}, multiplier ${a.effectiveness?.multiplier}), no extra penalty block`);
for (let k = 0; k < 3; k++) { await ready(); const l2 = await imageBlocks(), o = l2[k % l2.length]; if (!o) break; await clickFace(o.id, Math.max(0.03, Math.min(0.97, farU(o))), o.py); await sleep(100); }
s1 = await state(); ok(s1.added >= 3 && s1.penalties === s1.added, `several inaccurate presses add exactly one block each (${s1.added} penalty blocks on the platform)`);
const bx = await ev(() => window.__game.penaltyBoxes()); const S = await ev(() => window.__game.PENALTY.blockSize);
let ov = 0; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) if (Math.abs(bx[i].x - bx[j].x) < S && Math.abs(bx[i].z - bx[j].z) < S && Math.abs(bx[i].y - bx[j].y) < S) ov++;
ok(ov === 0, 'penalty blocks are arranged without overlapping each other');
// the tower objective with penalty blocks outstanding
await clearTower(); await sleep(1800); const sW = await state();
ok(sW.won && sW.phase === 'play' && !sW.ending && sW.penalties >= 3, `tower cleared but the trial does NOT end while ${sW.penalties} penalty blocks remain (phase ${sW.phase})`);
ok(sW.hintVisible && /extra blocks/i.test(sW.hint), `neutral reminder shown: "${sW.hint}"`);
ok(!/left|right|center|centre|too far|optimal/i.test(sW.hint), 'the reminder does not reveal the rule');
await ev(() => document.getElementById('skipBtn').classList.add('hidden'));
const offs = [[0, 0, 0.5], [0.42, 0.42, 0.5], [-0.42, -0.42, 0.5], [0.4, 0.5, 0], [0, 0, -0.5]];
let removedEach = true, noNewPen = true, actionsSame = true; for (let k = 0; k < offs.length; k++) { const st = await state(); if (!st.penalties) break; const ids = await ev(() => window.__game.penaltyIds()); const q = await ev(`window.__game.penaltyScreenPoint(${ids[0]},${offs[k][0]},${offs[k][1]},${offs[k][2]})`); await p.mouse.click(q.x, q.y); await sleep(120); const st2 = await state(); if (st2.penalties !== st.penalties - 1) removedEach = false; if (st.penalties > 1 && st2.added !== st.added) noNewPen = false; if (st.penalties > 1 && st2.actions !== st.actions) actionsSame = false; }
ok(removedEach, 'every click on a penalty block (centre, corners, edge) removed exactly that one block');
ok(noNewPen && actionsSame, 'clicking penalty blocks added no penalty and logged no hit/attempt');
await removeAllPenalties(); ok(await waitFor(async () => (await phase()) !== 'play', 8000), 'once the last penalty block is removed the completed trial ends and the session advances');
res.t1 = true;
// ---- trials 2-3 (bot) ----
for (let t = 2; t <= 3; t++) { await startTrial(); await botTrial(); }
// ---- trial 4 (reversed rule) ----
ok(await startTrial(), 'trial 4 started'); const s4 = await state(); ok(s4.rule === 'reversed', 'trial 4 is in the reversed phase');
await ready(); list = await imageBlocks(); const R = list.find(o => o.cue === 0 || o.cue === 1) ?? list[0];
const initialOpt = 1 - R.px; const wrongRule = Math.abs(initialOpt - R.px) > 0.3;
ok(R.cue === 0 ? Math.abs(R.px - 0.8) < 1e-6 : R.cue === 1 ? Math.abs(R.px - 0.2) < 1e-6 : true, `logged optimum for cue ${R.cue} after the reversal is ${R.px.toFixed(2)}`);
if (wrongRule) { ok(await clickFace(R.id, initialOpt, R.py), 'trial 4: clicked the OLD-rule optimum'); await sleep(300); a = await lastAction(); ok(a.result === 'penalty' && a.colorRulePhase === 'reversed' && Math.abs(a.optimalU - R.px) < 1e-3, `old-rule optimum is penalised after the reversal (error ${a.horizontalError})`);
  await ready(); ok(await clickFace(R.id, R.px, R.py), 'trial 4: clicked the NEW-rule optimum'); await sleep(250); a = await lastAction(); ok(a.result === 'fired' && a.penaltyTriggered === false && a.effectiveness.multiplier > 1.5, `new-rule optimum fires a strong hit (multiplier ${a.effectiveness.multiplier})`); }
else ok(false, 'no strongly coloured block available to test the reversal on trial 4');
await botTrial(); for (let t = 5; t <= 6; t++) { await startTrial(); await botTrial(); }
ok(await waitFor(() => vis('#endBox'), 15000), 'end screen reached');
await p.click('#endJson'); await sleep(600); await p.click('#endEvents'); await sleep(600); await p.click('#endCsv'); await sleep(900);
const files = fs.readdirSync(DL), jf = files.find(f => f.endsWith('.json')), ef = files.find(f => f.endsWith('_events.csv')), tf = files.find(f => f.endsWith('_trials.csv'));
const J = JSON.parse(fs.readFileSync(path.join(DL, jf), 'utf8')), exp = J.trials.filter(t => t.phase === 'experiment'), tut = J.trials.filter(t => t.phase === 'tutorial');
ok(J.session.experimentConfig.penalty.enabled && J.session.experimentConfig.penalty.horizontalThreshold === 0.25 && J.session.experimentConfig.experimentVersion === 'v2.3-horizontal-penalty', 'session config records the penalty settings and version');
ok(exp.length === 6 && exp.every(t => t.completed && t.penaltyOutstandingAtEnd === 0), `all 6 trials completed with zero outstanding penalty blocks (${exp.map(t => t.penaltyBlocksAdded).join(',')} added)`);
ok(exp.every(t => t.penalty.blocks.length === t.penaltyBlocksAdded && t.penaltyBlocksAdded === t.penaltiesTriggered && t.penaltyBlocksAdded === t.actions.filter(x => x.result === 'penalty').length && t.penaltyBlocksRemoved === t.penalty.blocks.filter(q => q.removedAtMs !== null).length && t.penaltyBlocksRemoved === t.penaltyBlocksAdded), 'JSON: penalties added == penalised actions == penalty block records; every block has a removal; counts agree per trial');
ok(exp.every(t => t.penaltyEvents.filter(e => e.eventType === 'penalty_block_added').length === t.penaltyBlocksAdded && t.penaltyEvents.filter(e => e.eventType === 'penalty_block_removed').length === t.penaltyBlocksRemoved && t.penaltyBlockClicks === t.penaltyBlocksRemoved), 'JSON: penaltyEvents hold one "added" and one "removed" event per penalty block, with click counts');
ok(exp.filter(t => t.penaltyBlocksAdded > 0).every(t => t.timeToClearPenaltiesMs >= 0 && t.towerClearedAtMs > 0 && t.penalty.blocks.every(q => q.removedAtMs >= q.addedAtMs && q.msOnPlatform >= 0)), 'JSON: time to clear penalty blocks, tower-cleared time and per-block lifetimes recorded');
ok(exp.every(t => t.actions.every(x => x.targetType !== 'penalty_block' && ['image_block', 'plain_block', 'platform_or_background'].includes(x.targetType))), 'penalty-block clicks are not in the experimental action list (targetType of actions: image/plain block or platform only)');
const pen = exp.flatMap(t => t.actions.filter(x => x.result === 'penalty'));
ok(pen.length >= 5 && pen.every(x => x.penaltyTriggered && x.horizontalError > 0.25 && !x.impulseApplied && x.effectiveness === null && x.penaltyBlockId > 0), `${pen.length} penalised presses: horizontal error > 0.25, no impulse, no effectiveness, penalty block id logged`);
const firedAll = exp.flatMap(t => t.actions.filter(x => x.result === 'fired' && x.hasImage));
ok(firedAll.length > 20 && firedAll.every(x => x.penaltyTriggered === false && x.horizontalError !== null && x.horizontalError <= 0.2501), `${firedAll.length} fired hits: none penalised, all with horizontal error <= 0.25 logged`);
ok(exp.every(t => t.actions.filter(x => x.result === 'penalty').every(x => x.colorRulePhase === t.colorRulePhase && Math.abs(Math.abs(x.clickU - x.optimalU) - x.horizontalError) < 0.002)), 'logged horizontal error = |clickU - optimalU| under the trial\'s own colour rule (initial and reversed)');
ok(exp.every(t => t.actions.filter(x => x.result === 'penalty').every(x => x.first && x.first.impulseOnBlock !== true)), 'a penalised press never counts as the first impulse on a block');
const ecsv = fs.readFileSync(path.join(DL, ef), 'utf8').split('\n')[0].split(','), tcsv = fs.readFileSync(path.join(DL, tf), 'utf8').split('\n')[0].split(',');
ok(['targetType', 'horizontalError', 'penaltyTriggered', 'penaltyBlockId'].every(c => ecsv.includes(c)) && ['penaltyBlocksAdded', 'penaltyBlocksRemoved', 'penaltyBlockClicks', 'timeToClearPenaltiesMs'].every(c => tcsv.includes(c)), 'CSV headers include the penalty columns');
if (TUT) ok(tut.length === 5 && tut.every(t => t.penaltyBlocksAdded === 0 && !t.penalty.active), 'tutorial trials never penalise');
const hits = exp.flatMap(t => t.actions.filter(x => x.hasImage)); ok(hits.every(x => x.presentationNumber >= 1 && ['novel', 'familiar'].includes(x.familiarity)), 'image identity / familiarity logging intact on penalised and fired presses');
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); console.log(fails ? `${fails} FAILED` : 'all passed');
