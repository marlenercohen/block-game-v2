// Browser test for Version 2 (needs `npm i puppeteer-core` somewhere, Chrome installed, and `npm run dev` on port 5174).
// Edit CHROME for your machine. Run: node tools/browser/v2test.mjs   (URL=... to test another address)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { effectiveness } from '../../src/effectiveness.js';
import { BLOCK_MASS } from '../../src/experiment.js';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'v2dl_'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t;
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await p.goto(process.env.URL ?? 'http://localhost:5174', { waitUntil: 'domcontentloaded' }); await sleep(3500);
const ev = f => p.evaluate(f); const log = (...a) => console.log(...a);
const trials = () => ev(() => JSON.parse(JSON.stringify(window.__log.data.trials)));
const sel = i => ev(`(()=>{const s=document.getElementById('tower'); s.value='${i}'; s.dispatchEvent(new Event('change'))})()`);
const waitReady = async () => { for (let k = 0; k < 300; k++) { if ((await ev(() => window.__game.game.status)) === 'ready') return; await sleep(50); } };
const clickAt = async q => { await p.mouse.move(q.x, q.y); await p.mouse.down(); await sleep(40); await p.mouse.up(); await sleep(150); };
await ev(() => { window.__game.CONFIG.holdMs = 0; });

console.log('--- A. clicks on blocks WITHOUT image: no effect, no hit, but logged with accurate locations');
await sel(0); await sleep(500);
const info = await ev(() => window.__game.game.sim.blocks.map(b => ({ id: b.id, img: !!b.props.imageId, cue: b.props.cue })));
const plain = info.find(x => !x.img), imaged = info.find(x => x.img);
const posBefore = await ev(() => JSON.stringify(window.__game.game.sim.blocks.map(b => b.body.translation())));
const targets = [[-0.3, 0.25], [0.3, -0.25], [0, 0]];                         // (fx, fy) on the +z face -> expected u = fx+0.5, v = fy+0.5
for (const [fx, fy] of targets) { const q = await ev(`window.__game.screenPoint(${plain.id}, ${fx}, ${fy}, 0.5)`); await clickAt(q); const a = (await trials()).at(-1).actions.at(-1);
  ok(a.eventType === 'non_actionable' && a.actionable === false && !a.impulseApplied && a.blockIndex === plain.id && a.hasImage === false && a.imageId === null, `plain-block click at face (${fx + 0.5}, ${fy + 0.5}) logged as non_actionable on block ${a.blockIndex}`);
  ok(near(a.screen.x, q.x, 0.01) && near(a.screen.y, q.y, 0.01) && a.face === '+z' && near(a.u, fx + 0.5, 0.02) && near(a.v, fy + 0.5, 0.02), `   logged screen (${a.screen.x}, ${a.screen.y}) = click (${q.x.toFixed(1)}, ${q.y.toFixed(1)}); face ${a.face} u=${a.u} v=${a.v} (expected ${fx + 0.5}, ${fy + 0.5})`);
  ok(a.world && near(a.world.z, -0.55 + 0.45, 0.01) && a.cue === null && a.color === '#80848c' && a.sessionId && a.trialId && a.actionNumber > 0 && a.tMs > 0, `   world z=${a.world?.z} (front face), no cue and neutral gray ${a.color}, session/trial ids, seq ${a.actionNumber}, t=${a.tMs} ms`); }
const posAfter = await ev(() => JSON.stringify(window.__game.game.sim.blocks.map(b => b.body.translation())));
let t = (await trials()).at(-1);
ok(posBefore === posAfter && await ev(() => window.__game.game.actions) === 0 && t.hits === 0 && t.nonActionable === 3, `tower unchanged, 0 hits consumed, trial counters: ${JSON.stringify({ attempts: t.attempts, hits: t.hits, nonActionable: t.nonActionable })}`);

console.log('--- B. clicks that miss all blocks are logged, and distinguished from non-actionable clicks');
await clickAt({ x: 60, y: 560 }); await clickAt({ x: 1000, y: 120 }); await clickAt({ x: 560, y: 600 });
t = (await trials()).at(-1); const m1 = t.actions.at(-3), m2 = t.actions.at(-2), m3 = t.actions.at(-1);
ok(m3.eventType === 'miss' && m3.world && m3.world.y <= 0.01 && m3.world.y >= -0.6, `click on the bare platform (top or front edge) is a miss with the platform point recorded: ${JSON.stringify(m3.world)}`);
ok(m1.eventType === 'miss' && m2.eventType === 'miss' && m1.blockIndex === null && near(m1.screen.x, 60, 0.01) && near(m1.screen.y, 560, 0.01), `miss logged: ${JSON.stringify({ type: m1.eventType, block: m1.blockIndex, screen: m1.screen, platformPoint: m1.world })}`);
ok(t.misses === 3 && t.nonActionable === 3, `counters keep them apart: misses ${t.misses}, nonActionable ${t.nonActionable}`);

console.log('--- C. a hit on an image block: effectiveness parts, impulse, and the physical response are all logged consistently');
const q = await ev(`window.__game.screenPoint(${imaged.id}, -0.3, -0.3, 0.5)`); await clickAt(q);
t = (await trials()).at(-1); const h = t.actions.at(-1);
const exp = effectiveness({ cue: h.cue, familiarity: h.familiarity, u: h.u, v: h.v });
ok(h.eventType === 'fired' && h.impulseApplied && h.actionable && h.hasImage && h.imageId && (h.presentationNumber === 1) === (h.familiarity === 'novel'), `hit logged: ${JSON.stringify({ type: h.eventType, block: h.blockIndex, image: h.imageId, presentation: h.presentationNumber, familiarity: h.familiarity, cue: h.cue, color: h.color, face: h.face, u: h.u, v: h.v })}`);
ok(near(h.effectiveness.horizontal, exp.horizontal) && near(h.effectiveness.vertical, exp.vertical) && near(h.effectiveness.multiplier, exp.multiplier), `effectiveness logged ${JSON.stringify(h.effectiveness)} = recomputed from the logged cue/familiarity/u/v`);
ok(near(h.impulse.magnitude, 1.2 * h.effectiveness.multiplier, 2e-3) && near(h.response.initialSpeed, h.impulse.magnitude / BLOCK_MASS, 0.02), `impulse magnitude ${h.impulse.magnitude} = base 1.2 x multiplier; initial speed ${h.response.initialSpeed} = impulse / mass ${BLOCK_MASS}; direction ${JSON.stringify(h.impulse.direction)}`);
await waitReady(); await sleep(200);
await ev(`window.__game.loadTower(0)`); await sleep(300);   // next action/trial boundary finalises the consequence fields
h.response = (await trials()).find(tt => tt.trialNumber === t.trialNumber).actions.at(-1).response;
log('   consequences recorded at the end of that trial:', JSON.stringify(h.response));

console.log('--- D. same block, different hit locations -> different impulse and speed (reset restores the same tower between hits)');
await sel(1); await sleep(500);
const blk = await ev(() => window.__game.game.sim.blocks.map(b => ({ id: b.id, img: !!b.props.imageId, cue: b.props.cue, fam: b.props.familiarity })).find(x => x.img));
const res = [];
for (const [fx, fy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) { await p.click('#reset'); await sleep(350); await waitReady(); const qq = await ev(`window.__game.screenPoint(${blk.id}, ${fx}, ${fy}, 0.5)`); await clickAt(qq); const a = (await trials()).at(-1).actions.at(-1);
  res.push({ u: a.u, v: a.v, mult: a.effectiveness?.multiplier, speed: a.response?.initialSpeed, h: a.effectiveness?.horizontal, vert: a.effectiveness?.vertical }); }
log(`   block cue ${blk.cue}, ${blk.fam}:`, res.map(r => `(u ${r.u}, v ${r.v}) -> x${r.mult.toFixed(2)} (H ${r.h.toFixed(2)} + V ${r.vert.toFixed(2)}), speed ${r.speed.toFixed(1)} m/s`).join(' | '));
ok(new Set(res.map(r => r.mult.toFixed(3))).size >= 3 && Math.max(...res.map(r => r.mult)) / Math.min(...res.map(r => r.mult)) > 1.3, 'four locations give clearly different multipliers');

console.log('--- E. familiarity across trials and resets (from the logged data)');
for (const i of [2, 3, 4, 5, 0, 1, 2, 5, 3, 4, 1, 0]) { await sel(i); await sleep(350); }
const T = await trials(); const seen = {}; let bad = 0, nImg = 0, rs = 0, resetBad = 0; const prevBlocks = {};
for (const tt of T) { if (tt.reusedAssignment) { rs++; const prev = T.find(x => x.trialNumber === tt.trialNumber - 1); if (JSON.stringify(prev.blocks.map(b => [b.imageId, b.familiarity, b.cue])) !== JSON.stringify(tt.blocks.map(b => [b.imageId, b.familiarity, b.cue]))) resetBad++; continue; }
  for (const bl of tt.blocks) if (bl.imageId) { nImg++; const n = (seen[bl.imageId] ?? 0) + 1; if (bl.presentationNumber !== n || bl.familiarity !== (n === 1 ? 'novel' : 'familiar')) bad++; seen[bl.imageId] = n; } }
ok(bad === 0 && nImg > 10, `${T.length} trials, ${nImg} image presentations: presentation numbers and novel/familiar status correct (${bad} violations); ${rs} resets re-showed identical images/colours/status (${resetBad} differences) and did not increase presentation counts`);
ok(Object.values(seen).some(n => n >= 2) && T.some(tt => tt.blocks.some(bl => bl.familiarity === 'familiar')), 'familiar images occurred; colour cues present in the session: ' + [...new Set(T.flatMap(tt => tt.blocks.filter(bl => bl.hasImage).map(bl => bl.cue)))].sort().join(', '));
ok(T.every(tt => tt.blocks.every(bl => near(bl.mass, BLOCK_MASS, 1e-5))), `all logged blocks have mass ${BLOCK_MASS}`);

console.log('--- F. touch');
await p.setViewport({ width: 1000, height: 650, hasTouch: true }); await sleep(400);
await ev(`window.__game.loadTower(0)`); await sleep(500);
const inf2 = await ev(() => window.__game.game.sim.blocks.map(b => ({ id: b.id, img: !!b.props.imageId })));
const qa = await ev(`window.__game.screenPoint(${inf2.find(x => !x.img).id}, 0.2, 0.2, 0.5)`); await p.touchscreen.tap(qa.x, qa.y); await sleep(250);
const qb = await ev(`window.__game.screenPoint(${inf2.find(x => x.img).id}, 0.2, 0.2, 0.5)`); await p.touchscreen.tap(qb.x, qb.y); await sleep(250);
await waitReady(); await p.touchscreen.tap(30, 600); await sleep(250);
const ta = (await trials()).at(-1).actions;
ok(ta.map(a => `${a.pointerType}:${a.eventType}`).join(',') === 'touch:non_actionable,touch:fired,touch:miss', 'touch taps logged: ' + ta.map(a => `${a.pointerType}:${a.eventType}@(${a.screen.x.toFixed(0)},${a.screen.y.toFixed(0)})`).join(', '));

console.log('--- G. Demo Mode and download');
await p.click('#demo'); await sleep(500);
const seq = []; for (let n = 0; n < 4; n++) { seq.push(await ev(() => window.__game.game.towerIndex + 1)); await ev(() => window.__game.game.sim.blocks.forEach(bk => { bk.cleared = true; })); await sleep(2300); }
ok(seq.every((v, i) => !i || v !== seq[i - 1]), 'Demo Mode tower sequence ' + seq.join(' -> ') + ' (no immediate repeats)'); await p.click('#demo');
await p.click('#dlJson'); await sleep(1200); const jf = fs.readdirSync(DL).find(f => f.endsWith('.json')); const J = JSON.parse(fs.readFileSync(path.join(DL, jf), 'utf8'));
const fired = J.trials.flatMap(tt => tt.actions).find(a => a.eventType === 'fired');
const need = ['sessionId', 'trialId', 'actionNumber', 'tMs', 'blockIndex', 'hasImage', 'imageId', 'presentationNumber', 'familiarity', 'cue', 'color', 'screen', 'world', 'face', 'u', 'v', 'actionable', 'impulseApplied', 'effectiveness', 'impulse', 'response'];
ok(need.every(k => k in fired) && ['baseline', 'horizontal', 'vertical', 'multiplier'].every(k => k in fired.effectiveness), `downloaded JSON ${jf}: ${J.trials.length} trials; action records contain all required fields`);
ok(['blockIndex', 'size', 'position', 'imageId', 'familiarity', 'presentationNumber', 'cue', 'color', 'mass', 'preferredX', 'preferredY'].every(k => k in J.trials[0].blocks[0]) && J.trials[0].physics.effect && J.session.experimentConfig.cue, 'trial records include the full initial block configuration and the physics/effectiveness parameters; session records the experiment configuration');
log('errors:', errs); ok(errs.length === 0, 'no page errors'); log('download dir', DL);
await b.close();
