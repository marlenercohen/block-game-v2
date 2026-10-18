// usage: node seq.mjs <set: towers|playground> <index> <variant> <strikeBlock> <fy> <fx> <outprefix> <times comma list>
// Strikes block with a REAL mouse press (click mode), freezes the simulation at given times after the impulse and screenshots each frame.
import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [set, idx, variant, blk, fy, fx, out, times] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:5180', { waitUntil: 'domcontentloaded' }); await sleep(3000);
await p.evaluate(`window.__game.setMode('${set}'); window.__game.loadTower(${idx}, ${variant})`); await sleep(900);
const shot = async n => { const sc = await p.evaluate(`(()=>{const m=window.__game.view.meshes[${blk}]; return [m.scale.x,m.scale.y,m.scale.z].map(v=>+v.toFixed(2))})()`); console.log(out.split('/').pop(), n, 'mesh scale xyz', JSON.stringify(sc)); await p.screenshot({ path: `${out}_${n}.png`, clip: { x: 180, y: 150, width: 760, height: 450 } }); };
await shot('0_before');
await p.evaluate(`(()=>{const g=window.__game.game; window.__fireT=null; const orig=g.sim.step.bind(g.sim); g.sim.step=function(){orig(); if(window.__fireT===null && g.actions>0) window.__fireT=g.sim.time; if(window.__freezeAt!==undefined && window.__fireT!==null && g.sim.time-window.__fireT>=window.__freezeAt){ g.paused=true; window.__frozen=true; }};})()`);
const q = await p.evaluate(`window.__game.screenPoint(${blk},${fx},${fy - 0.5},0.5)`);
await p.mouse.move(q.x, q.y); await p.mouse.down(); await sleep(60); await p.mouse.up();   // plain click (click mode)
for (const t of times.split(',').map(Number)) {
  await p.evaluate(`window.__frozen=false; window.__freezeAt=${t}; window.__game.game.paused=false`);
  for (let k = 0; k < 400 && !(await p.evaluate('window.__frozen')); k++) await sleep(20);
  await sleep(150); await shot(`t${String(t).replace('.', 'p')}`);
}
await b.close();
