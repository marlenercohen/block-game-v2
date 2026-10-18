// Game controller (Version 2). Two modes:
//   session (default): intro -> tutorial -> N experimental trials, each preceded by the central start cross -> end screen   (src/session_config.js)
//   free (?mode=free): the original single-tower mode with tower menu, Reset, Demo Mode
// The hit mechanics (location-dependent impulse effectiveness, object-centred hit coordinates, image/colour rendering, physics) are identical in both modes.
import { CONFIG } from './config.js';
import { TOWERS, labelFor } from './towers.js';
import { IMAGES, TUTORIAL_IMAGES, BLOCK_MASS, CUE, EFFECT, FAMILIARITY, COMPLETION, isTargetBlock, colorForCue, NO_IMAGE_COLOR } from './experiment.js';
import { effectiveness, faceCoordinates } from './effectiveness.js';
import { initPhysics, Simulation } from './physics.js';
import { SceneView } from './scene.js';
import { Logger } from './logger.js';
import { Presenter } from './trial.js';
import { SESSION, applyUrlOverrides } from './session_config.js';
import { ImageHistory } from './history.js';
import { buildPlan } from './plan.js';
import { TUTORIAL_TOWERS, TUTORIAL_STEPS, INTRO_CARD, CROSS_CAPTION_TUTORIAL } from './tutorial.js';
import { BlockTracker } from './analysis.js';
import { PointerInput, targetOf, classifyPress } from './interaction.js';
import { createStartControl } from './fixation.js';
import * as ui from './screens.js';

applyUrlOverrides(SESSION);
const SESSION_MODE = SESSION.mode === 'session';
document.body.classList.toggle('session', SESSION_MODE);
document.body.classList.toggle('kiosk', !!SESSION.kiosk);

const $ = id => document.getElementById(id);
const view = new SceneView($('c'));
const logger = new Logger({ resume: !SESSION_MODE });   // experimental sessions never silently continue an earlier (interrupted) one
await initPhysics();

// ---- images (both pools preloaded once; small JPEGs). The pools must not share any image. ----
const images = {};
if (TUTORIAL_IMAGES.ids.some(id => IMAGES.ids.includes(id))) throw new Error('tutorial and experimental image pools overlap');
const load = (dir, id) => new Promise(res => { const im = new Image(); im.onload = () => { images[id] = im; res(); }; im.onerror = () => res(); im.src = `${import.meta.env.BASE_URL}${dir}/${id}.jpg`; });
await Promise.all([...IMAGES.ids.map(id => load('images', id)), ...TUTORIAL_IMAGES.ids.map(id => load(TUTORIAL_IMAGES.dir, id))]);

const sess = logger.data.session;
sess.mode = SESSION.mode;
sess.experimentConfig = {
  blockMass: BLOCK_MASS, cue: CUE, familiarity: FAMILIARITY, effect: EFFECT, completionRule: COMPLETION.rule, impulseMagnitude: CONFIG.impulseMagnitude,
  images: { ids: IMAGES.ids, repeatProbability: IMAGES.repeatProbability, faceFraction: IMAGES.faceFraction, tutorialIds: TUTORIAL_IMAGES.ids },
  block: CONFIG.block, platform: CONFIG.platform, session: { ...SESSION },
};

const game = {
  towerIndex: 0, sim: null, actions: 0, paused: false, assignment: null,
  phase: 'idle',               // 'idle' | 'cross' | 'play'
  status: 'ready',             // 'ready' | 'running'  (after an impulse: ready again after 0.5 s or when settled)
  restTime: 0, runTime: 0,
  hold: null,                  // { blockId, localPoint, normal, t0, rec } while the button is held and not yet fired
  won: false, stuck: false, ending: false,
  tracker: null, towerOnsetPerf: 0, endResolve: null, skipTutorial: false,
  demo: false, demoNextAt: null,
};
const remainingTargets = () => (game.sim ? game.sim.blocks.filter(b => !b.cleared && isTargetBlock(b)).length : 0);
const hex = c => '#' + c.toString(16).padStart(6, '0');
const plainBlock = { imageId: null, presentationNumber: null, familiarity: null, cue: null, color: NO_IMAGE_COLOR, actionable: false };

// ---- consequences of the most recent hit (recorded when the next action or the end of the trial arrives) ----
let pending = null;
function finalizePending() {
  if (!pending) return;
  const { rec, block, clearedBefore, pos0 } = pending; pending = null;
  if (!rec.response) return;
  rec.response.blocksClearedAfter = game.sim.blocks.filter(b => b.cleared).length - clearedBefore;
  rec.response.struckBlockLeftPlatform = block.cleared || block.removed;
  const p = block.removed ? null : block.body.translation();
  rec.response.struckBlockDisplacement = p ? Math.round(Math.hypot(p.x - pos0.x, p.y - pos0.y, p.z - pos0.z) * 1000) / 1000 : null;
  logger.persist();
}

// ---- trial preparation (hidden until the participant starts it) -------------------------------
/** Build the world and meshes for a trial and open its log record. In session mode the scene stays hidden until the start cross is used. */
function prepareTrial({ tower, blocks, meta, phase }) {
  finalizePending();
  game.sim = new Simulation({ ...tower, blocks: tower.blocks.map((b, k) => ({ ...b, ...blocks[k] })) });   // fresh world => exact repeatability
  view.setPlatform(tower.platform); view.setInverted(!!tower.inverted);
  view.buildBlocks(game.sim, images);
  game.tracker = new BlockTracker(game.sim);
  Object.assign(game, { actions: 0, status: 'ready', restTime: 0, runTime: 0, hold: null, won: false, stuck: false, ending: false, demoNextAt: null });
  logger.beginTrial({
    ...meta, phase, completionRule: COMPLETION.rule,
    physics: { impulseMagnitude: CONFIG.impulseMagnitude, holdMs: CONFIG.holdMs, gravity: CONFIG.gravity, fixedDt: CONFIG.fixedDt, blockMass: BLOCK_MASS, effect: { ...EFFECT } },
    // everything needed to reconstruct what the player saw and the properties of every block
    blocks: game.sim.blocks.map((b, k) => {
      const e = b.props.imageId ? effectiveness({ cue: b.props.cue, familiarity: b.props.familiarity, u: 0.5, v: 0.5 }) : null, p = b.props;
      return {
        blockIndex: k, size: b.size, position: b.spec.pos, mass: b.mass, hasImage: !!p.imageId, actionable: !!p.imageId, imageId: p.imageId,
        presentationNumber: p.presentationNumber, familiarity: p.familiarity, cue: p.cue, color: hex(p.color), preferredX: e ? e.preferredX : null, preferredY: e ? e.preferredY : null,
        // repetition history of the image (trials counted within its pool: experiment or tutorial)
        previousTrial: p.previousTrial ?? null, lagTrials: p.lagTrials ?? null, interveningTrials: p.interveningTrials ?? null, interveningDistinctImages: p.interveningDistinctImages ?? null,
        plannedRole: p.plannedRole ?? null, plannedLagTarget: p.lagTarget ?? null, plannedFallback: p.fallback ?? null,
      };
    }),
  });
}
/** The tower appears and the trial clock starts. */
function startPlay() {
  view.setSceneVisible(true); game.phase = 'play'; game.towerOnsetPerf = performance.now(); logger.towerOnset();
  updateHud();
}

// ---- input: press -> target -> qualification -> coordinates -> effectiveness -> impulse -> record ----
function onPress({ x, y, pointerType }) {
  if (game.phase !== 'play') return;
  const { hit, platformPoint } = targetOf(view, x, y);
  const hasImage = !!hit?.block.props.imageId;
  const result = classifyPress(hit, { hasHold: !!game.hold, ready: game.status === 'ready', allowWhileMoving: CONFIG.allowClickWhileMoving, paused: game.paused, ended: game.won || game.stuck || game.ending });
  const fc = hit ? faceCoordinates(hit.block.size, hit.localPoint, hit.normal) : null;
  const pr = hit?.block.props;
  const analysis = hit ? { first: game.tracker.flagsForAttempt(hit.block.id, hasImage), blockState: game.tracker.stateOf(hit.block), trialContext: game.tracker.context(hit.block.id) } : {};
  const rec = logger.logAttempt({
    pointerType, x, y, world: hit ? view.worldPointOf(hit.block.id, hit.localPoint) : platformPoint, local: hit ? hit.localPoint : null,
    blockIndex: hit ? hit.block.id : null, hasImage: hit ? hasImage : null, imageId: pr?.imageId ?? null, presentationNumber: pr?.presentationNumber ?? null,
    familiarity: pr?.familiarity ?? null, cue: pr?.cue ?? null, color: pr ? hex(pr.color) : null, face: fc?.face, u: fc?.u, v: fc?.v, result: result ?? 'pending', ...analysis,
  });
  if (result) return;
  game.hold = { blockId: hit.block.id, localPoint: hit.localPoint, normal: hit.normal, t0: performance.now(), rec };
  if (CONFIG.holdMs <= 0) { const h = game.hold; game.hold = null; fire(h.blockId, h.localPoint, h.rec, 0, h.normal); }   // plain click mode
}
function onRelease() { if (game.hold) logger.markReleasedEarly(game.hold.rec, performance.now() - game.hold.t0); game.hold = null; }
new PointerInput($('c'), { onPress, onRelease });

/** Apply the impulse for a press on an image block: direction as in V1, magnitude = base impulse x location-dependent effectiveness multiplier. */
function fire(blockId, localPoint, rec = null, holdMs = 0, normal = null) {
  finalizePending();
  const block = game.sim.blocks[blockId], pr = block.props;
  const fc = faceCoordinates(block.size, localPoint, normal);
  const eff = effectiveness({ cue: pr.cue, familiarity: pr.familiarity, u: fc.u, v: fc.v });
  const point = view.worldPointOf(blockId, localPoint);
  const dir = view.pushDirection();
  const magnitude = CONFIG.impulseMagnitude * eff.multiplier;
  const pos0 = { ...block.body.translation() }, clearedBefore = game.sim.blocks.filter(b => b.cleared).length;
  game.sim.applyImpulseAtPoint(block, point, dir, magnitude);
  const v = block.body.linvel(), w = block.body.angvel();
  rec ??= logger.logAttempt({
    pointerType: 'synthetic', x: null, y: null, world: point, local: localPoint, blockIndex: blockId, hasImage: true, imageId: pr.imageId,
    presentationNumber: pr.presentationNumber, familiarity: pr.familiarity, cue: pr.cue, color: hex(pr.color), face: fc.face, u: fc.u, v: fc.v, result: 'pending',
    first: game.tracker.flagsForAttempt(blockId, true), blockState: game.tracker.stateOf(block), trialContext: game.tracker.context(blockId),
  });
  const firstImpulse = game.tracker.noteImpulse(blockId); if (rec?.first) rec.first.impulseOnBlock = firstImpulse;
  logger.markFired(rec, { magnitude, dir, effectiveness: eff, initialSpeed: Math.hypot(v.x, v.y, v.z), initialAngularSpeed: Math.hypot(w.x, w.y, w.z) }, holdMs);
  pending = { rec, block, clearedBefore, pos0 };
  game.actions++;
  game.status = 'running'; game.restTime = 0; game.runTime = 0;
}

// ---- main loop --------------------------------------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(now - last, 100) / 1000; last = now;
  if (game.sim && game.phase === 'play') {
    if (game.hold && now - game.hold.t0 >= CONFIG.holdMs) {      // hold elapsed -> exactly one impulse
      const h = game.hold; game.hold = null;
      fire(h.blockId, h.localPoint, h.rec, now - h.t0, h.normal);
    }
    if (!game.paused) {
      let n = 0;
      while (acc >= CONFIG.fixedDt && n < CONFIG.maxStepsPerFrame) { stepOnce(); acc -= CONFIG.fixedDt; n++; }
      if (n === CONFIG.maxStepsPerFrame) acc = 0;
    } else acc = 0;
    game.tracker.update(game.sim);

    // Nothing left that can be hit but the platform is not clear (only with COMPLETION.rule 'all_blocks'): the trial cannot be completed.
    if (!game.won && !game.stuck && game.status === 'ready' && remainingTargets() > 0 && game.sim.blocks.every(b => b.cleared || !b.props.actionable)) {
      game.stuck = true; if (SESSION_MODE) finishTrial('stuck'); else { finalizePending(); logger.endTrial('stuck'); }
    }
    if (SESSION_MODE && !game.ending) {
      if (game.won) finishTrial('completed');
      else {
        const el = (now - game.towerOnsetPerf) / 1000, tutorial = logger.active?.phase === 'tutorial';
        ui.setSkipVisible(el >= SESSION.skipButtonAfterSeconds);
        if (!tutorial && el >= SESSION.maxTrialSeconds) finishTrial('timeout');
      }
    }
    if (!SESSION_MODE && game.demo && (game.won || game.stuck)) {   // Demo Mode (free play): after the end-of-trial feedback, move on
      if (game.demoNextAt === null) game.demoNextAt = now + CONFIG.demoDelayMs;
      else if (now >= game.demoNextAt) loadRandomTower();
    }
  } else acc = 0;
  if (game.sim) { view.sync(game.sim); view.render(); } else view.render();
  updateHud();
  requestAnimationFrame(frame);
}

function stepOnce() {
  const sim = game.sim;
  sim.step();
  if (game.status === 'running') {
    game.runTime += CONFIG.fixedDt;
    game.restTime = sim.isAtRest() ? game.restTime + CONFIG.fixedDt : 0;
    if (game.restTime >= CONFIG.settle.seconds || game.runTime >= CONFIG.settle.maxWaitSeconds) game.status = 'ready';
  }
  if (remainingTargets() === 0 && !game.won) { game.won = true; if (!SESSION_MODE) { finalizePending(); logger.endTrial('completed'); } }
}

// ---- session mode: trials with start cross, tutorial, experiment ---------------------------------
const startControl = SESSION_MODE ? createStartControl($('crossBtn'), SESSION.startControl) : null;
ui.onSkip(() => finishTrial('manual_advance'));

/** End the running trial (outcome: completed | timeout | manual_advance | stuck | dev_skip), keep the tower visible briefly, then resolve runTrial(). */
function finishTrial(outcome) {
  if (game.ending || game.phase !== 'play') return;
  game.ending = true; finalizePending(); logger.endTrial(outcome); ui.setSkipVisible(false);
  if (outcome === 'timeout') ui.setHint("Time's up - on to the next tower.");
  const pause = outcome === 'completed' ? SESSION.completionPauseMs : outcome === 'timeout' ? SESSION.timeoutPauseMs : 200;
  setTimeout(() => { game.phase = 'idle'; game.endResolve?.(outcome); }, pause);
}

async function runTrial({ phase, tower, blocks, meta, hint, label }) {
  ui.setTrialInfo(label); ui.setHint(null); ui.setSkipVisible(false);
  prepareTrial({ tower, blocks, meta, phase });
  view.setSceneVisible(false); game.phase = 'cross';                  // the tower stays hidden behind the start cross
  const el = ui.showCross(phase === 'tutorial' ? CROSS_CAPTION_TUTORIAL : null); logger.markCrossOnset(startControl.mode);   // tutorial trials tell the participant to click the plus
  const info = await startControl.waitForStart();
  logger.markCrossClick(info);                                          // time of the start-cross interaction
  ui.hideScreen();                                                     // remove the cross ...
  const ended = new Promise(res => { game.endResolve = res; });
  startPlay();                                                         // ... present the tower and start the trial clock
  ui.setHint(hint ?? null);
  if (game.skipTutorial && phase === 'tutorial') finishTrial('dev_skip');
  const outcome = await ended;
  view.setSceneVisible(false); ui.setHint(null); ui.setSkipVisible(false);
  return outcome;
}

async function runTutorial() {
  const hist = new ImageHistory();                                      // separate history: practice never counts toward experimental familiarity
  for (const step of TUTORIAL_STEPS) {
    if (game.skipTutorial) return;
    await ui.showCard(step);
    if (game.skipTutorial) return;
    if (!step.tower) continue;
    const tower = TUTORIAL_TOWERS[step.tower], imageId = TUTORIAL_IMAGES.ids[step.image], { info } = hist.present([imageId]);
    const slot = tower.blocks.findIndex(b => b.image);
    const blocks = tower.blocks.map((b, k) => (k === slot ? { imageId, ...info[imageId], cue: 0.5, color: colorForCue(0.5), actionable: true, plannedRole: step.role ?? 'novel' } : plainBlock));
    await runTrial({ phase: 'tutorial', tower, blocks, hint: step.hint, label: 'Practice', meta: { towerId: `tutorial:${step.id}`, set: 'tutorial', towerIndex: null, configId: `tutorial:${step.tower}`, inverted: false, demoMode: false, tutorialStep: step.id } });
  }
}

async function runExperiment() {
  const seed = SESSION.seed ?? Math.floor(Math.random() * 2 ** 32);
  const plan = buildPlan({ towers: TOWERS, nTrials: SESSION.nTrials, towerOrder: SESSION.towerOrder, orderMode: SESSION.orderMode, imageIds: IMAGES.ids, novelProportion: SESSION.novelProportion,
    lagChoices: SESSION.lagChoices, cueValues: SESSION.cueValues, cuePolicy: SESSION.cuePolicy, explicitTrials: SESSION.explicitTrials, seed });
  sess.plan = { seed, stats: plan.stats, trials: plan.trials.map(t => ({ trialNumber: t.trialNumber, towerIndex: t.towerIndex, slots: t.slots })) };
  logger.persist(); $('devPlan').textContent = `plan: seed ${seed}, ${plan.stats.novelPresentations} novel / ${plan.stats.familiarPresentations} familiar presentations, ${plan.stats.distinctImages} images`;
  const hist = new ImageHistory();
  for (const pt of plan.trials) {
    const tower = TOWERS[pt.towerIndex], { info } = hist.present(pt.slots.map(s => s.imageId));
    const blocks = tower.blocks.map((b, k) => { const s = pt.slots.find(x => x.blockIndex === k); return s ? { imageId: s.imageId, ...info[s.imageId], cue: s.cue, color: colorForCue(s.cue), actionable: true, plannedRole: s.role, lagTarget: s.lagTarget, fallback: s.fallback } : plainBlock; });
    await runTrial({ phase: 'experiment', tower, blocks, label: `Trial ${pt.trialNumber} / ${plan.trials.length}`,
      meta: { towerId: pt.towerIndex + 1, set: 'towers', towerIndex: pt.towerIndex, configId: tower.configId ?? pt.towerIndex + 1, inverted: !!tower.inverted, variant: null, demoMode: false, presentation: pt.trialNumber } });
  }
}

async function runSession() {
  ui.setTrialInfo(null); $('devSession').classList.remove('hidden');
  await ui.showCard(INTRO_CARD);
  if (SESSION.tutorial) await runTutorial();
  await runExperiment();
  ui.setTrialInfo(null); sess.completedAt = new Date().toISOString(); logger.persist(); ui.showEnd();
}

// ---- free play (original single-tower mode) -----------------------------------------------------
let presenter = null;
function fillTowerMenu() { const sel = $('tower'); sel.innerHTML = ''; TOWERS.forEach((t, i) => sel.add(new Option(labelFor(i), i))); }

/** reason: how the previous (unfinished) trial ended - 'switched_tower' | 'reset'. A reset keeps the same assignment (same images, colours, familiarity). */
function loadTower(i, reason = 'switched_tower') {
  finalizePending();
  logger.endTrial(reason);
  const tw = TOWERS[i];
  const reuse = reason === 'reset' && game.assignment && game.towerIndex === i;
  const assignment = reuse ? game.assignment : presenter.present(tw);   // a Reset never counts as a new presentation
  game.assignment = assignment; game.towerIndex = i;
  $('force').value = CONFIG.impulseMagnitude; $('forceVal').textContent = (+CONFIG.impulseMagnitude).toFixed(1);
  $('devinfo').textContent = `${tw.name} | ` + assignment.blocks.map((b, k) => `#${k}:${b.imageId ? `${b.imageId} (${b.familiarity}, #${b.presentationNumber})` : 'no image'} cue ${b.cue}`).join('; ');
  $('tower').value = i;
  prepareTrial({ tower: tw, blocks: assignment.blocks, phase: 'free',
    meta: { towerId: i + 1, set: 'towers', towerIndex: i, configId: tw.configId ?? i + 1, inverted: !!tw.inverted, variant: null, demoMode: game.demo, presentation: assignment.presentation, reusedAssignment: reuse } });
  startPlay();
}
function loadRandomTower() { let i; do { i = Math.floor(Math.random() * TOWERS.length); } while (TOWERS.length > 1 && i === game.towerIndex); loadTower(i); }

// ---- HUD ----------------------------------------------------------------------------------------
function updateHud() {
  $('remaining').textContent = remainingTargets();
  $('actions').textContent = game.actions;
  $('status').textContent = game.paused ? 'paused' : game.status === 'ready' ? 'ready' : 'settling...';
  $('msg').textContent = SESSION_MODE ? '' : game.won ? `Cleared in ${game.actions} action${game.actions === 1 ? '' : 's'}!` : game.stuck ? 'Trial over.' : '';
  $('hud').style.visibility = SESSION_MODE && game.phase !== 'play' ? 'hidden' : 'visible';
}

// ---- controls -----------------------------------------------------------------------------------
const force = $('force');
force.value = CONFIG.impulseMagnitude; $('forceVal').textContent = (+force.value).toFixed(1);
force.addEventListener('input', () => { CONFIG.impulseMagnitude = +force.value; $('forceVal').textContent = (+force.value).toFixed(1); });
$('hold').value = CONFIG.holdMs; $('holdVal').textContent = CONFIG.holdMs;
$('hold').addEventListener('input', () => { CONFIG.holdMs = +$('hold').value; $('holdVal').textContent = CONFIG.holdMs; });
$('anytime').checked = CONFIG.allowClickWhileMoving;
$('anytime').addEventListener('change', e => { CONFIG.allowClickWhileMoving = e.target.checked; e.target.blur(); });
for (const [id, kind] of [['dlJson', 'json'], ['dlCsv', 'csv'], ['dlEvents', 'events'], ['endJson', 'json'], ['endCsv', 'csv'], ['endEvents', 'events']]) $(id).addEventListener('click', e => { logger.download(kind); e.target.blur(); });
$('devSkipTutorial').addEventListener('click', () => { game.skipTutorial = true; $('cardBtn').click(); if (game.phase === 'play' && logger.active?.phase === 'tutorial') finishTrial('dev_skip'); });
addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); logger.download('json'); } });   // researcher shortcut (works in kiosk mode too)
$('devSkipTrial').addEventListener('click', () => finishTrial('dev_skip'));

if (!SESSION_MODE) {
  presenter = new Presenter({ seed: IMAGES.seed === null ? undefined : IMAGES.seed + 7919 * (sess.imageSeeds?.length ?? 0), counts: (sess.imageCounts ??= {}) });
  (sess.imageSeeds ??= []).push(presenter.seed);
  logger.persist();
  fillTowerMenu();
  $('tower').addEventListener('change', () => { $('tower').blur(); loadTower(+$('tower').value); });
  $('reset').addEventListener('click', e => { e.target.blur(); loadTower(game.towerIndex, 'reset'); });
  $('pause').addEventListener('click', e => { game.paused = !game.paused; e.target.textContent = game.paused ? 'Resume' : 'Pause'; e.target.blur(); });
  $('demo').addEventListener('change', e => { game.demo = e.target.checked; e.target.blur(); game.demoNextAt = null; if (game.demo) loadRandomTower(); });
}

// Debug/test hooks (console): window.__game, window.__log
window.__log = logger;
window.__game = {
  game, view, CONFIG, loadTower, TOWERS, presenter, images, COMPLETION, EFFECT, SESSION, sess,
  /** client-pixel position of a point on a block (local coords as fractions of its size, e.g. (0,0,0.5) = middle of the +z face) */
  screenPoint(blockId, fx, fy, fz) {
    const b = game.sim.blocks[blockId], m = view.meshes[blockId];
    return view.screenPointOf(m.localToWorld(new m.position.constructor(fx * b.size[0], fy * b.size[1], fz * b.size[2])));
  },
  fireDirect(blockId, localPoint) { fire(blockId, localPoint); },
  finishTrial,
};

requestAnimationFrame(frame);
if (SESSION_MODE) runSession(); else loadTower(0);
