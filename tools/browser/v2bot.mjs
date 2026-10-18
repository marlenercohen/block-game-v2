// Click-bot playthrough for Version 2: clicks only blocks that show an image (like a player who has learned the rule).
// Also taps with touch emulation. Needs `npm run dev` on port 5174. Edit CHROME for your machine. Run: node tools/browser/v2bot.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(process.env.URL ?? 'http://localhost:5174', { waitUntil: 'domcontentloaded' }); await sleep(3500);
const ev = f => p.evaluate(f); const log = (...a) => console.log(...a);
const sel = i => ev(`(()=>{const s=document.getElementById('tower'); s.value='${i}'; s.dispatchEvent(new Event('change'))})()`);
const waitReady = async () => { for (let k = 0; k < 300; k++) { if ((await ev(() => window.__game.game.status)) === 'ready') return; await sleep(50); } };
for (let round = 0; round < 2; round++) for (let t = 0; t < 6; t++) {
  await sel(t); await sleep(500);
  const cls = await ev(() => window.__game.game.sim.blocks.filter(b => b.props.imageId).map(b => b.props.familiarity));
  let clicks = 0, guard = 0;
  while (guard++ < 80) {
    const st = await ev(() => ({ won: window.__game.game.won, stuck: window.__game.game.stuck }));
    if (st.won || st.stuck) break;
    await waitReady();
    const ids = await ev(() => window.__game.game.sim.blocks.filter(b => !b.cleared && b.props.imageId).map(b => b.id));
    let done = false;
    for (const id of ids) { const q = await ev(`window.__game.screenPoint(${id},0,0,0.5)`); const h = await ev(`(()=>{const x=window.__game.view.pick(${q.x},${q.y}); return x?x.block.id:-1})()`);
      if (h === id) { await p.mouse.move(q.x, q.y); await p.mouse.down(); await sleep(30); await p.mouse.up(); clicks++; done = true; break; } }
    if (!done) await sleep(400);
    await sleep(150);
  }
  const r = await ev(() => { const g = window.__game.game; const t = window.__log.data.trials.at(-1); return { won: g.won, stuck: g.stuck, remaining: g.sim.remaining, nonActionable: t.nonActionable }; });
  log(`round ${round + 1} Tower ${t + 1}: image blocks ${JSON.stringify(cls)} -> ${r.won ? 'cleared' : r.stuck ? 'stuck (only blocks without image left)' : 'not finished'} with ${clicks} clicks (remaining ${r.remaining})`);
}
// touch
await p.setViewport({ width: 1000, height: 650, hasTouch: true }); await sleep(300);
await ev(`window.__game.loadTower(0)`); await sleep(500);
const info = await ev(() => window.__game.game.sim.blocks.map(b => ({ id: b.id, img: !!b.props.imageId })));
const q1 = await ev(`window.__game.screenPoint(${info.find(x => !x.img).id},0,0,0.5)`); await p.touchscreen.tap(q1.x, q1.y); await sleep(200);
const q2 = await ev(`window.__game.screenPoint(${info.find(x => x.img).id},0,0,0.5)`); await p.touchscreen.tap(q2.x, q2.y); await sleep(300);
log('touch: taps logged as', JSON.stringify(await ev(() => window.__log.data.trials.at(-1).actions.map(a => ({ type: a.pointerType, result: a.result })))));
log('errors:', errs); await b.close();
