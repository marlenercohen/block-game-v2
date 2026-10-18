import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5180', { waitUntil: 'domcontentloaded' }); await sleep(3000);
const ev = f => p.evaluate(f); const log = (...a) => console.log(...a);
const idx = () => ev(() => window.__game.game.towerIndex);
const label = () => ev(() => document.getElementById('tower').selectedOptions[0].text);
const msg = () => ev(() => document.getElementById('msg').textContent);
const forceWin = () => ev(() => { window.__game.game.sim.blocks.forEach(b => { b.cleared = true; }); });
// --- demo off: success does NOT advance
await ev(() => window.__game.loadTower(0)); await sleep(400); await forceWin(); await sleep(3500);
log('Demo OFF: after forced success, tower still', await label(), '| message:', JSON.stringify(await msg()));
// --- turn demo on
await p.click('#demo'); await sleep(500); log('Demo ON: started at', await label(), '| checkbox checked:', await ev(() => document.getElementById('demo').checked));
// --- automatic transitions (success condition = remaining blocks 0)
const seq = [await idx()]; const delays = [];
for (let n = 0; n < 10; n++) { await forceWin(); const t0 = Date.now(); await sleep(600); const m1 = await msg(); const still = (await idx()) === seq[seq.length - 1];
  while ((await idx()) === seq[seq.length - 1] && Date.now() - t0 < 5000) await sleep(50);
  delays.push(Date.now() - t0); seq.push(await idx()); if (n < 2) log(`  success feedback at +0.6s: ${JSON.stringify(m1)} (still same tower: ${still})`); await sleep(300); }
log('sequence of tower numbers:', seq.map(i => i + 1).join(' -> '));
log('immediate repeats:', seq.filter((v, i) => i && v === seq[i - 1]).length, '| transition delays (ms):', delays.join(', '), '| towers visited >=14 (inverted ones):', seq.filter(i => i >= 13).length);
// --- manual selection cancels a pending transition
await forceWin(); await sleep(500);
await ev(() => { const s = document.getElementById('tower'); s.value = '3'; s.dispatchEvent(new Event('change')); }); await sleep(3500);
log('manual select during pending transition -> stays on', await label(), '| demo still enabled:', await ev(() => document.getElementById('demo').checked));
// --- reset cancels a pending transition
await forceWin(); await sleep(500); await p.click('#reset'); await sleep(3500);
log('reset during pending transition -> stays on', await label(), '| blocks remaining', await ev(() => window.__game.game.sim.remaining), '| demo enabled:', await ev(() => document.getElementById('demo').checked));
// --- turning demo off cancels a pending transition
await forceWin(); await sleep(500); await p.click('#demo'); await sleep(3500);
log('demo switched off during pending transition -> stays on', await label());
// --- real play with demo on: clear tower 1 with real clicks, expect auto-advance
await ev(() => { const s = document.getElementById('tower'); s.value = '0'; s.dispatchEvent(new Event('change')); }); await p.click('#demo'); await sleep(300);
await ev(() => window.__game.loadTower(0)); await sleep(400);
const startIdx = await idx(); let acts = 0;
for (let k = 0; k < 40 && (await idx()) === startIdx; k++) {
  await ev(() => new Promise(r => { const t = setInterval(() => { if (window.__game.game.status === 'ready') { clearInterval(t); r(); } }, 50); }));
  if ((await idx()) !== startIdx) break;
  const blocks = await ev(() => window.__game.game.sim.blocks.filter(b => !b.cleared).map(b => b.id)); let done = false;
  for (const id of blocks.reverse()) { const q = await ev(`window.__game.screenPoint(${id},0,0,0.5)`); const h = await ev(`(()=>{const x=window.__game.view.pick(${q.x},${q.y}); return x?x.block.id:-1})()`); if (h >= 0) { await p.mouse.move(q.x, q.y); await p.mouse.down(); await sleep(50); await p.mouse.up(); acts++; done = true; break; } }
  if (!done) break; await sleep(200);
}
for (let k = 0; k < 100 && (await idx()) === startIdx; k++) await sleep(50);
log(`real play with Demo ON: cleared tower ${startIdx + 1} in ${acts} clicks -> next tower ${(await idx()) + 1}`);
log('errors:', errs); await b.close();
