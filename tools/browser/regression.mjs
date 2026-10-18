import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5180', { waitUntil: 'domcontentloaded' }); await sleep(3000);
const ev = f => p.evaluate(f);
await ev(() => { window.__game.CONFIG.holdMs = 500; });
const poses = () => ev(() => window.__game.game.sim.blocks.map(b => b.removed ? null : (t => [t.x, t.y, t.z].map(v => +v.toFixed(4)))(b.body.translation())));
const state = () => ev(() => { const g = window.__game.game; return { rem: g.sim.remaining, act: g.actions, st: g.status, won: g.won }; });
const waitReady = async (max = 20000) => { const t = Date.now(); while (Date.now() - t < max) { if ((await state()).st === 'ready') return true; await sleep(100); } return false; };
const load = async i => { await ev(`window.__game.loadTower(${i})`); await sleep(200); };
const pt = (id, fx, fy, fz) => ev(`window.__game.screenPoint(${id},${fx},${fy},${fz})`);
async function press(x, y, ms) { await p.mouse.move(x, y); await p.mouse.down(); await sleep(ms); await p.mouse.up(); }
const log = (...a) => console.log(...a);

// 1 stability
for (let i = 0; i < 16; i++) { await load(i); const a = await poses(); await sleep(2500); const c = await poses();
  const d = Math.max(...a.map((q, k) => Math.hypot(q[0]-c[k][0], q[1]-c[k][1], q[2]-c[k][2]))); log(`T${i+1} stable drift`, d.toFixed(5), 'blocks', a.length); }
// 2 short hold
await load(0); let q = await pt(4, 0, 0, 0.5); const before = await poses();
await press(q.x, q.y, 300); await sleep(1200); let s = await state(); log('short hold -> actions', s.act, 'moved', JSON.stringify(before) !== JSON.stringify(await poses()));
// click mode
await ev(() => { window.__game.CONFIG.holdMs = 0; }); await load(0); q = await pt(4, 0, 0, 0.5); await press(q.x, q.y, 30); await sleep(200); log('click mode (30ms press) -> actions', (await state()).act);
await ev(() => { window.__game.CONFIG.holdMs = 500; }); await load(0);
// 3 long hold (1500ms) -> exactly one impulse
await press(q.x, q.y, 1500); await sleep(300); s = await state(); log('1500ms hold -> actions', s.act);
await waitReady(); s = await state(); log('settled; remaining', s.rem, 'st', s.st);
// 4 different spots -> different rotation
const res = [];
for (const fy of [-0.4, 0, 0.4]) for (const fx of [-0.4, 0.4]) {
  await load(0); q = await pt(4, fx, fy, 0.5); await press(q.x, q.y, 560); await sleep(150);
  res.push([fx, fy, await ev(() => { const w = window.__game.game.sim.blocks[4].body.angvel(), v = window.__game.game.sim.blocks[4].body.linvel(); return [w.x, w.y, w.z, v.x, v.z].map(x => +x.toFixed(2)); })]); }
log('angvel/linvel by (fx,fy):'); res.forEach(r => log(JSON.stringify(r)));
// 5 determinism + reset restore
await load(0); const orig = await poses(); q = await pt(3, 0.1, 0.1, 0.5); await press(q.x, q.y, 520); await waitReady(); const after1 = await poses();
await ev(`document.getElementById('reset').click()`); await sleep(300); log('reset restores', JSON.stringify(orig) === JSON.stringify(await poses()), 'actions', (await state()).act);
await press(q.x, q.y, 520); await waitReady(); const after2 = await poses(); log('repeat identical outcome', JSON.stringify(after1) === JSON.stringify(after2));

// --- materials ---
await load(4); log('masses T5 (blue,blue,blue,gray,blue):', await ev(() => window.__game.game.sim.blocks.map(b => +b.mass.toFixed(3))));
await ev(() => { window.__game.loadTower(8, 0); }); await sleep(300);
const rowMass = await ev(() => window.__game.game.sim.blocks.map(b => b.mass));
// deformation + recovery: strike pink pillar (T6 block 0) and sample
await load(5);
const meshScale = id => ev(`(()=>{const m=window.__game.view.meshes[${id}]; return [m.scale.x,m.scale.y,m.scale.z].map(v=>+v.toFixed(3))})()`);
log('pink pillar rest scale', await meshScale(0));
q = await pt(0, 0, 0, 0.5); await p.mouse.move(q.x, q.y); await p.mouse.down(); await sleep(540); 
let minScale = [9,9,9]; const samples = [];
for (let k = 0; k < 14; k++) { const sc = await meshScale(0); minScale = minScale.map((v, i) => Math.min(v, sc[i])); await sleep(60); }
await p.mouse.up(); await waitReady(); log('pink pillar min scale during strike', minScale, 'after settle', await meshScale(0), 'actions', (await state()).act);
// comparison mode: same action, different variant
const outcomes = [];
for (const vi of [0,1,2,3]) { await ev(`window.__game.loadTower(8, ${vi})`); await sleep(250);
  q = await pt(0, 0, -0.3, 0.5); await press(q.x, q.y, 530); await waitReady(25000); const s2 = await state(); outcomes.push(`${vi}:remaining=${s2.rem}`); }
log('comparison (hit low on left support):', outcomes.join('  '));
// reset restores undeformed
await ev(`window.__game.loadTower(5)`); await sleep(300); const sc0 = await meshScale(0); const orig6 = await poses();
q = await pt(2, 0, 0, 0.5); await press(q.x, q.y, 530); await waitReady(); await ev(`document.getElementById('reset').click()`); await sleep(400);
log('reset restores T6 (poses, scale):', JSON.stringify(orig6) === JSON.stringify(await poses()), JSON.stringify(sc0) === JSON.stringify(await meshScale(0)));

// 6 play every tower to completion by clicking visible blocks
for (let t = 0; t < 16; t++) { await load(t); let n = 0;
  while (!(await state()).won && n < 120) { await waitReady();
    const cand = await ev(() => { const g = window.__game; return g.game.sim.blocks.filter(b => !b.cleared).map(b => b.id); });
    let acted = false;
    for (const id of cand.reverse()) { for (const [fx, fy] of [[0,0],[0.3,0.2],[-0.3,-0.2],[0.3,-0.3]]) { for (const fz of [0.5]) {
      const qq = await pt(id, fx, fy, fz); const hit = await ev(`(()=>{const h=window.__game.view.pick(${qq.x},${qq.y}); return h? h.block.id : -1})()`);
      if (hit >= 0) { await press(qq.x, qq.y, 520); acted = true; break; } } if (acted) break; } if (acted) break; }
    if (!acted) { log('no pickable block, remaining', (await state()).rem); break; } n++; await sleep(100); }
  s = await state(); log(`T${t+1} play: won=${s.won} actions=${s.act} remaining=${s.rem}`);  }
log('errors:', errs.filter(e => !/404/.test(e)));
await b.close();
