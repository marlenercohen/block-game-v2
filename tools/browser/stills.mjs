import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = '/Users/marlenecohen/Desktop/dougcode/block_game/diagnostics/';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:5180', { waitUntil: 'domcontentloaded' }); await sleep(3000);
await p.screenshot({ path: D + 'ui_tower1_full.png' });
for (const [set, i] of [['towers',10],['towers',11],['towers',12],['playground',0],['playground',1],['playground',2]]) {
  await p.evaluate(`window.__game.setMode('${set}'); window.__game.loadTower(${i},0)`); await sleep(900);
  await p.screenshot({ path: D + `still_${set}_${i}.png`, clip: { x: 100, y: 100, width: 900, height: 560 } });
}
console.log(await p.evaluate(`(()=>{const o=[...document.getElementById('tower').options].map(x=>x.text); return {options:o, legend: !!document.getElementById('legend'), variantLabels:null}})()`));
await p.evaluate(`window.__game.setMode('towers'); window.__game.loadTower(8,0)`); await sleep(500);
console.log(await p.evaluate(`[...document.getElementById('variant').options].map(x=>x.text)`), await p.evaluate(`document.body.innerText.replace(/\\n+/g,' | ')`));
await b.close();
