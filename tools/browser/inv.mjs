import puppeteer from 'puppeteer-core';
import fs from 'fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = '/Users/marlenecohen/Desktop/dougcode/block_game/diagnostics/';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5180', { waitUntil: 'domcontentloaded' }); await sleep(3000);
const ev = f => p.evaluate(f);
const log = (...a) => console.log(...a);
await ev(() => { window.__game.CONFIG.holdMs = 500; });
const load = async i => { await ev(`window.__game.game.paused=false; window.__game.loadTower(${i})`); await sleep(500); };
// ---------- freeze helper: run the same scripted action, freeze at sim time T after fire, screenshot ----------
async function frame(towerIdx, blk, T, file) {
  await load(towerIdx);
  const poses = await ev(`(()=>{const G=window.__game, g=G.game; g.paused=true; const b=g.sim.blocks[${blk}];
    G.fireDirect(${blk}, new G.view.meshes[${blk}].position.constructor(0, 0.1*b.size[1], 0.5*b.size[2]));
    for (let i=0;i<${Math.round(T * 120)};i++) g.sim.step();
    G.view.sync(g.sim); G.view.render(); return g.sim.blocks.map(k=>k.removed?null:(t=>[t.x,t.y,t.z])(k.body.translation()));})()`);
  await sleep(150); await p.screenshot({ path: file });
  await ev(() => { window.__game.game.paused = false; });
  return poses;
}
// ---------- 1+2: inverted towers vs originals: identical physics, image rotated 180 degrees ----------
const pairs = [[2, 13, 7, 'tower3'], [6, 14, 4, 'tower7'], [11, 15, 0, 'tower12']];
for (const [orig, inv, blk, tag] of pairs) {
  for (const T of [0.0, 0.3, 1.0]) {
    const a = await frame(orig, blk, T, D + `inv_${tag}_orig_t${T}.png`);
    const c = await frame(inv, blk, T, D + `inv_${tag}_inverted_t${T}.png`);
    const same = JSON.stringify(a) === JSON.stringify(c);
    log(`${tag} t=${T}s  body poses identical orig vs inverted: ${same}`);
  }
}
// numeric screen-space "falls upward" check on tower 3 vs inverted: screen y of block 7 (top block) after strike
for (const [idx, name] of [[2, 'original'], [13, 'inverted']]) {
  await load(idx); const y0 = await ev(() => window.__game.screenPoint(7, 0, 0, 0).y);
  await ev(`window.__game.fireDirect(7, new window.__game.view.meshes[7].position.constructor(0,0,0.3))`);
  const ys = []; for (let k = 0; k < 6; k++) { await sleep(250); ys.push(Math.round(await ev(() => window.__game.screenPoint(7, 0, 0, 0).y))); }
  log(`${name} tower 3, top block screen y (px) before ${Math.round(y0)}, then every 250ms:`, ys.join(' '), '  (increasing = falls down the screen, decreasing = falls up)');
}
// real-mouse targeting in the inverted tower
await load(13); { const q = await ev(() => window.__game.screenPoint(7, 0, 0, 0.5)); const hit = await ev(`(()=>{const h=window.__game.view.pick(${q.x},${q.y}); return h?h.block.id:-1})()`);
  await ev(() => { window.__game.CONFIG.holdMs = 0; }); await p.mouse.move(q.x, q.y); await p.mouse.down(); await sleep(50); await p.mouse.up(); await sleep(300);
  log('inverted tower 14: ray pick at block 7 centre ->', hit, '; click registered actions =', await ev(() => window.__game.game.actions)); }
log('errors:', errs);
await b.close();
