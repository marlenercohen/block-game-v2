// Browser test of the Back / Next navigation through the instruction and tutorial screens. Needs puppeteer-core, Chrome and `npm run dev` on 5174 (or URL=...).
// Checks: Back is hidden on the first card and visible and clearly styled elsewhere; Back never re-runs a practice trial (no start cross, no new trial record), never changes trial data
// or image history; going forward again skips completed practice trials; Back is not available once the experiment starts; the exported JSON lists the moves in instructionNavigation.
import puppeteer from 'puppeteer-core';
import fs from 'fs'; import os from 'os'; import path from 'path';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', BASE = process.env.URL ?? 'http://localhost:5174/';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'v2nav_'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await p.goto(`${BASE}?trials=1&seed=5&order=sequence&towers=1&maxTrial=3&pause=300&skipAfter=60`, { waitUntil: 'domcontentloaded' }); await sleep(3500);
const ev = f => p.evaluate(f);
const vis = sel => ev(`(()=>{const e=document.querySelector('${sel}'); if(!e) return false; const r=e.getBoundingClientRect(); return !e.classList.contains('hidden') && getComputedStyle(e).display!=='none' && r.width>0 && r.height>0})()`);
const waitFor = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(40); } return false; };
const cardTitle = () => ev(() => document.getElementById('cardTitle').textContent);
const nTrials = () => ev(() => window.__log.data.trials.length);
const phase = () => ev(() => window.__game.game.phase);
const waitCard = () => waitFor(() => vis('#card'));
const next = async () => { await p.click('#cardBtn'); await sleep(250); }, back = async () => { await p.click('#cardBack'); await sleep(250); };
const clickCross = async () => { const r = await ev(() => { const r = document.getElementById('crossBtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await p.mouse.click(r.x, r.y); await sleep(200); };
async function practice() {        // click the picture block (middle height; the tutorial uses the neutral cue) until the trial ends
  await waitFor(() => vis('#crossBtn')); await clickCross();
  for (let g = 0; g < 80 && (await phase()) === 'play'; g++) { await waitFor(async () => (await ev(() => window.__game.game.status)) === 'ready' || (await phase()) !== 'play', 4000); const id = await ev(() => { const bk = window.__game.game.sim.blocks.find(x => !x.cleared && x.props.imageId); return bk ? bk.id : -1; });
    if (id >= 0) { const q = await ev(`window.__game.screenPoint(${id},0,-0.25,0.5)`); await p.mouse.click(q.x, q.y); } await sleep(150); }
  await waitFor(async () => (await phase()) !== 'play', 8000);
}
// ---- intro card ----
ok(await waitCard() && (await cardTitle()) === 'Block game', 'intro card shown first');
ok(!(await vis('#cardBack')), 'no Back button on the very first card');
await next();
ok((await cardTitle()) === 'Welcome!' && await vis('#cardBack'), 'second card (Welcome) shows a Back button');
const st = await ev(() => { const e = document.getElementById('cardBack'), s = getComputedStyle(e), r = e.getBoundingClientRect(), n = document.getElementById('cardBtn').getBoundingClientRect(); return { w: r.width, h: r.height, color: s.color, bg: s.backgroundColor, border: s.borderTopWidth + ' ' + s.borderTopColor, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, sameRow: Math.abs(r.top - n.top) < 4, fs: s.fontSize }; });
ok(st.w >= 90 && st.h >= 30 && st.inView && st.sameRow && st.border.startsWith('2px') && st.color !== st.bg, `Back button is clearly visible (${Math.round(st.w)}x${Math.round(st.h)} px, ${st.fs}, ${st.border}, text ${st.color} on ${st.bg}) next to Next`);
await back(); ok((await cardTitle()) === 'Block game' && !(await vis('#cardBack')), 'Back from the Welcome card returns to the intro card (no Back there)');
await next(); await next();             // intro -> welcome -> practice trial 1 (cross)
ok(await waitFor(() => vis('#crossBtn')), 'Next on the Welcome card starts the first practice trial (start cross)');
const t0 = await nTrials(); ok(t0 === 1, 'one tutorial trial record so far'); await practice();
// ---- after practice 1: card 2 ----
await waitCard(); ok((await cardTitle()) === 'Where you click matters' && await vis('#cardBack'), 'card after the first practice trial has Back');
const before = await ev(() => JSON.stringify(window.__log.data.trials.map(t => [t.trialId, t.tutorialStep, t.outcome, t.hits, t.blocks.map(x => [x.imageId, x.familiarity, x.presentationNumber])])));
await back(); ok((await cardTitle()) === 'Welcome!', 'Back shows the previous card (review)');
ok(!(await vis('#crossBtn')) && (await phase()) === 'idle' && (await nTrials()) === t0, 'going back does not start a trial or add a trial record, and the game stays idle');
await next(); ok((await cardTitle()) === 'Where you click matters' && !(await vis('#crossBtn')), 'moving forward again goes straight to the next card: the completed practice trial is NOT repeated');
ok((await nTrials()) === t0, 'still exactly one tutorial trial record');
// ---- play on: cards 2..; trial for each step that has one ----
const seq = [];
for (let g = 0; g < 20; g++) { const title = await cardTitle(); seq.push(title); if (title === 'One more hint') break; await next();
  if (await waitFor(() => vis('#crossBtn'), 1200)) { await practice(); await waitCard(); } }
ok(seq.join('|') === 'Where you click matters|Blocks without pictures|New pictures|Familiar pictures|Extra blocks|One more hint', `cards visited in order: ${seq.join(' > ')}`);
ok((await nTrials()) === 5, `five practice trials in total (${await nTrials()}) after all steps`);
// back twice from the last card and forward again: no trial is re-run
await back(); await back(); ok((await cardTitle()) === 'Familiar pictures', 'two Backs from the last card show the "Familiar pictures" card');
await next(); await next(); ok((await cardTitle()) === 'One more hint' && !(await vis('#crossBtn')) && (await nTrials()) === 5, 'two Nexts return to the last card without repeating anything');
ok(await ev(() => document.getElementById('cardBtn').textContent) === 'Begin', 'the last card still has the Begin button');
await back(); ok((await cardTitle()) === 'Extra blocks', 'Back from the last card shows the penalty explanation'); await next();
const tutorialData = await ev(() => JSON.stringify(window.__log.data.trials.map(t => [t.trialId, t.tutorialStep, t.outcome, t.hits, t.blocks.map(x => [x.imageId, x.familiarity, x.presentationNumber])])));
const tutorialFirst = JSON.parse(tutorialData)[0]; const beforeFirst = JSON.parse(before)[0];
ok(JSON.stringify(tutorialFirst) === JSON.stringify(beforeFirst), 'the first practice trial record is unchanged by all the navigation');
const tj = JSON.parse(tutorialData); ok(tj[3][4][0][1] === 'novel' && tj[4][4][0][1] === 'familiar' && tj[3][4][0][0] === tj[4][4][0][0] && tj[3][4][0][2] === 1 && tj[4][4][0][2] === 2, 'image history is unaffected: the "New pictures" trial is a first presentation and the "Familiar pictures" trial shows the same picture as its second presentation');
// ---- start the experiment ----
await next(); ok(await waitFor(() => vis('#crossBtn')), 'Begin starts the experiment (start cross)');
ok(!(await vis('#cardBack')) && !(await vis('#card')), 'no Back button once the experiment has started');
await clickCross(); ok(await waitFor(async () => (await phase()) !== 'play' && (await vis('#endBox')), 30000), 'experimental trial ran and the end screen appeared');
await p.click('#endJson'); await sleep(700);
const jf = fs.readdirSync(DL).find(f => f.endsWith('.json')), J = JSON.parse(fs.readFileSync(path.join(DL, jf), 'utf8'));
const nav = J.session.instructionNavigation, backs = nav.filter(x => x.action === 'back').length;
ok(Array.isArray(nav) && backs === 5 && nav.filter(x => x.action === 'next').length === 13 && nav.every(x => typeof x.tSessionMs === 'number'), `session.instructionNavigation lists every move (${nav.length} moves, ${backs} Back)`);
ok(J.trials.filter(t => t.phase === 'tutorial').length === 5 && J.trials.filter(t => t.phase === 'experiment').length === 1 && J.trials.filter(t => t.phase === 'tutorial').every((t, i) => t.tutorialTrialNumber === i + 1), 'exported data: 5 tutorial trials (numbered 1-5, none repeated) and 1 experimental trial');
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); console.log(fails ? `${fails} FAILED` : 'all passed');
