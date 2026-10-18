import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DL = fs.mkdtempSync(path.join('/private/tmp/claude-503/-Users-marlenecohen-Desktop-dougcode/dce51772-11b9-4326-b365-34004ee1a05e/scratchpad/pp', 'dl_'));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await p.goto('http://localhost:5180', { waitUntil: 'domcontentloaded' }); await sleep(3000);
const ev = f => p.evaluate(f); const log = (...a) => console.log(...a);
const waitReady = async () => { for (let k = 0; k < 400; k++) { if ((await ev(() => window.__game.game.status)) === 'ready') return; await sleep(50); } };
const clickBlock = async (id, wait = true) => { const q = await ev(`window.__game.screenPoint(${id},0,0,0.5)`); await p.mouse.move(q.x, q.y); await p.mouse.down(); await sleep(40); await p.mouse.up(); if (wait) await waitReady(); return q; };
const tr = () => ev(() => JSON.parse(JSON.stringify(window.__log.data.trials)));
const sel = i => ev(`(()=>{const s=document.getElementById('tower'); s.value='${i}'; s.dispatchEvent(new Event('change'))})()`);
const sid = await ev(() => window.__log.data.session.sessionId);
log('session:', JSON.stringify(await ev(() => { const s = window.__log.data.session; return { sessionId: s.sessionId, appVersion: s.appVersion, browser: s.observed.browser, os: s.observed.os, screen: [s.observed.screenWidth, s.observed.screenHeight], dpr: s.observed.devicePixelRatio, orientation: s.observed.orientation, category: s.inferred.deviceCategory }; })));
// ---- A. tower 1 (click mode), real mouse: miss, hit, press while busy, then clear the tower
await ev(() => { window.__game.CONFIG.holdMs = 0; });
const tStart = Date.now();
await p.mouse.click(40, 600); await sleep(100);                                              // miss: empty background
const q = await clickBlock(4, false); await p.mouse.click(q.x, q.y); await sleep(100);        // hit, then press again immediately (blocks moving)
await waitReady();
let guard = 0;
while (!(await ev(() => window.__game.game.won)) && guard++ < 40) {
  const ids = await ev(() => window.__game.game.sim.blocks.filter(b => !b.cleared).map(b => b.id)); let done = false;
  for (const id of ids.reverse()) { const qq = await ev(`window.__game.screenPoint(${id},0,0,0.5)`); const h = await ev(`(()=>{const x=window.__game.view.pick(${qq.x},${qq.y}); return x?x.block.id:-1})()`); if (h >= 0) { await clickBlock(id); done = true; break; } }
  if (!done) { await sleep(1500); if (!(await ev(() => window.__game.game.won))) break; }
}
const wallMs = Date.now() - tStart; let T = await tr(); const t1 = T[0];
log('A. trial 1:', JSON.stringify({ tower: t1.towerId, config: t1.configId, inverted: t1.inverted, outcome: t1.outcome, completed: t1.completed, durationMs: Math.round(t1.durationMs), wallClockMsSinceFirstClick: wallMs, attempts: t1.attempts, hits: t1.hits, misses: t1.misses, ignored: t1.ignored }));
const byResult = {}; t1.actions.forEach(a => byResult[a.result] = (byResult[a.result] || 0) + 1);
log('   action results:', JSON.stringify(byResult), '| game.actions counter (fired impulses) =', await ev(() => window.__game.game.actions));
log('   sample fired action:', JSON.stringify(t1.actions.find(a => a.result === 'fired')));
log('   sample miss action:', JSON.stringify(t1.actions.find(a => a.result === 'miss')));
log('   sample ignored action:', JSON.stringify(t1.actions.find(a => a.result.startsWith('ignored'))));
// ---- B. reset an unfinished trial
await sel(3); await sleep(500); await clickBlock(13, false); await sleep(200); await p.click('#reset'); await sleep(400);
T = await tr(); log('B. Tower 4: clicked one block then Reset -> trial', T[1].trialNumber, 'tower', T[1].towerId, 'outcome', T[1].outcome, 'attempts', T[1].attempts, 'hits', T[1].hits, '| new trial', T[2].trialNumber, 'outcome', T[2].outcome, '(null = in progress)');
// ---- C. switch tower mid-trial
await sel(1); await sleep(400); T = await tr(); log('C. switched Tower 4 -> Tower 2: previous trial outcome', T[2].outcome, '| attempts', T[2].attempts);
// ---- D. hold mode: early release and a full hold
await ev(() => { window.__game.CONFIG.holdMs = 500; }); await waitReady();
const q2 = await ev(`window.__game.screenPoint(5,0,0,0.5)`); await p.mouse.move(q2.x, q2.y); await p.mouse.down(); await sleep(200); await p.mouse.up(); await sleep(200);
await p.mouse.down(); await sleep(800); await p.mouse.up(); await sleep(200);
T = await tr(); const cur = T[T.length - 1]; log('D. hold mode (500 ms) actions:', JSON.stringify(cur.actions.map(a => ({ result: a.result, holdMs: a.holdMs }))));
await ev(() => { window.__game.CONFIG.holdMs = 0; });
// ---- E. inverted tower flagged correctly
await sel(13); await sleep(500); T = await tr(); const inv = T[T.length - 1]; log('E. Tower 14 trial:', JSON.stringify({ towerId: inv.towerId, configId: inv.configId, inverted: inv.inverted }));
await sel(14); await sleep(500); T = await tr(); log('   Tower 15 trial:', JSON.stringify({ towerId: T[T.length - 1].towerId, configId: T[T.length - 1].configId, inverted: T[T.length - 1].inverted }));
await sel(6); await sleep(500); T = await tr(); log('   Tower 7 trial (upright original):', JSON.stringify({ towerId: T[T.length - 1].towerId, configId: T[T.length - 1].configId, inverted: T[T.length - 1].inverted }));
// ---- F. Demo Mode across trials (forced clears through the real success condition)
await p.click('#demo'); await sleep(500);
for (let n = 0; n < 3; n++) { await ev(() => window.__game.game.sim.blocks.forEach(b => { b.cleared = true; })); await sleep(2300); }
await p.click('#demo'); T = await tr();
log('F. last trials with Demo Mode:', JSON.stringify(T.slice(-5).map(t => ({ n: t.trialNumber, tower: t.towerId, config: t.configId, inv: t.inverted, demo: t.demoMode, outcome: t.outcome, ms: t.durationMs === null ? null : Math.round(t.durationMs) }))));
// ---- G. touch
await p.setViewport({ width: 900, height: 600, hasTouch: true }); await sleep(300); await ev(() => window.__game.loadTower(0)); await sleep(500);
const qt = await ev(`window.__game.screenPoint(4,0,0,0.5)`); await p.touchscreen.tap(qt.x, qt.y); await sleep(300); T = await tr(); const tt = T[T.length - 1];
log('G. touch tap:', JSON.stringify(tt.actions.map(a => ({ type: a.pointerType, result: a.result, material: a.material }))), '| session inputObserved', JSON.stringify(await ev(() => window.__log.data.session.inputObserved)));
// ---- H. download buttons
await p.click('#dlJson'); await sleep(500); await p.click('#dlCsv'); await sleep(1500);
const files = fs.readdirSync(DL); log('H. downloaded files:', files);
const jf = files.find(f => f.endsWith('.json')), cf = files.find(f => f.endsWith('.csv'));
const J = JSON.parse(fs.readFileSync(path.join(DL, jf), 'utf8'));
log('   JSON parses; schema', J.schema, '| trials', J.trials.length, '| actions total', J.trials.reduce((s, t) => s + t.actions.length, 0), '| trials in memory after download:', (await tr()).length, '(unchanged)');
log('   CSV head:\n       ' + fs.readFileSync(path.join(DL, cf), 'utf8').split('\n').slice(0, 3).join('\n       '));
fs.writeFileSync(path.join(DL, 'example_head.json'), JSON.stringify({ session: J.session, firstTrial: { ...J.trials[0], actions: J.trials[0].actions.slice(0, 3) } }, null, 1));
// ---- I. refresh keeps the data
const before = (await tr()).length; await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(3000);
T = await tr(); log('I. after page reload: same session', (await ev(() => window.__log.data.session.sessionId)) === sid, '| trials', before, '->', T.length, '| restores', await ev(() => window.__log.data.session.restores), '| trial active at reload is now:', T[before - 1].outcome);
log('download dir:', DL);
log('errors:', errs); await b.close();
