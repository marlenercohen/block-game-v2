// Lightweight local behavioural logger. It only OBSERVES the game (main.js calls it); it never changes how actions are triggered or
// how the physics runs. Data live in memory and in sessionStorage (so an accidental refresh keeps them) and are downloaded by the
// player as JSON/CSV. Nothing is ever sent anywhere. No names, e-mails, IPs or fingerprinting; the session ID is random.
//
// JSON layout (schema blockgame-v2-log/2):  { schema, session: {...}, trials: [ { ...trial summary..., cross: {...}, blocks: [...], actions: [ {...action...} ] } ], archivedSessions: [...] }
//   trial.phase: 'experiment' | 'tutorial' | 'free'.  trialNumber counts experimental (and free-play) trials only; tutorial trials have trialNumber null and tutorialTrialNumber 1..n.
//   trial.outcome: 'completed' | 'timeout' | 'manual_advance' (participant used the skip button) | 'stuck' (platform not clear but no block with an image left to hit) | 'reset' | 'switched_tower' | 'abandoned' (page closed/reloaded) | 'dev_reload'
//   trial.cross: start-cross onset/click (session-relative ms, ISO times, click position and latency). Trial clock zero = tower onset (right after the cross click); action.tMs is relative to it.
//   action.first / blockState / trialContext: first-hit indicators, block pose and prior disturbance at the moment of the press, and trial history (see main.js).
//   action.result: 'fired' (a hit: impulse applied to a block with an image) | 'non_actionable' (press on a block WITHOUT an image: nothing happens, no hit consumed) |
//                  'miss' (press on empty space/platform) | 'ignored_busy' | 'ignored_paused' |
//                  'ignored_after_clear' | 'ignored_hold_active' | 'released_early' (hold shorter than required, nothing fired)
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const SCHEMA = 'blockgame-v2-log/2';
const KEY = 'blockgame_v2_log', ARCHIVE_KEY = 'blockgame_v2_log_archive';   // different from Version 1's key so the two never share stored data

const randomId = () => { const a = new Uint8Array(6); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
const iso = () => new Date().toISOString();
const r3 = v => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000);

/** What the browser reports (observed) and what we guess from it (inferred). */
function environment() {
  const ua = navigator.userAgent || '';
  const uad = navigator.userAgentData;
  const brand = (uad?.brands || []).filter(b => !/not.?a.?brand/i.test(b.brand)).map(b => `${b.brand} ${b.version}`)[0];
  const browser = brand ?? (/Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'unknown');
  const os = uad?.platform || (/Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown');
  const touchPoints = navigator.maxTouchPoints || 0;
  const coarse = matchMedia('(pointer: coarse)').matches, hover = matchMedia('(hover: hover)').matches;
  const shortSide = Math.min(screen.width, screen.height);
  // Inference only: browsers cannot tell a phone from a tablet or a trackpad from a mouse reliably.
  const category = touchPoints > 0 && coarse ? (shortSide < 600 ? 'phone' : 'tablet') : 'desktop/laptop';
  return {
    observed: {
      browser, os, userAgentDataAvailable: !!uad,
      screenWidth: screen.width, screenHeight: screen.height, devicePixelRatio: window.devicePixelRatio,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      orientation: screen.orientation?.type ?? (innerWidth >= innerHeight ? 'landscape' : 'portrait'),
      maxTouchPoints: touchPoints, pointerCoarse: coarse, hoverCapable: hover,
    },
    inferred: { deviceCategory: category, note: 'deviceCategory is a heuristic guess from touch support and screen size; trackpad vs mouse cannot be distinguished. Actual input devices are in session.inputObserved (counts of pointerdown by pointerType).' },
  };
}

export class Logger {
  /** resume: true (free play) continues a session found in sessionStorage after a refresh; false (experimental sessions) archives it and starts a new session. */
  constructor({ resume = true } = {}) {
    this.active = null; this.lastEnded = null; this.t0 = null; this.perfOrigin = performance.now();
    let restored = null;
    try { restored = JSON.parse(sessionStorage.getItem(KEY)); } catch { /* ignore */ }
    this.archive = []; try { this.archive = JSON.parse(sessionStorage.getItem(ARCHIVE_KEY)) ?? []; } catch { /* ignore */ }
    if (restored?.schema === SCHEMA && resume) {
      this.data = restored;
      for (const t of this.data.trials) if (!t.endedAt) { t.outcome = 'abandoned'; t.completed = false; t.note = 'page reloaded or closed before the trial ended'; }
      this.data.session.restores = (this.data.session.restores ?? 0) + 1;
    } else {
      if (restored?.schema === SCHEMA && restored.trials?.length) {   // keep the earlier (interrupted) session's data instead of overwriting it
        for (const t of restored.trials) if (!t.endedAt) { t.outcome = 'abandoned'; t.completed = false; t.note = 'page reloaded or closed before the trial ended'; }
        this.archive.push(restored); try { sessionStorage.setItem(ARCHIVE_KEY, JSON.stringify(this.archive)); } catch { /* ignore */ }
      }
      this.data = { schema: SCHEMA, session: { sessionId: randomId(), startedAt: iso(), appVersion: APP_VERSION, ...environment(), inputObserved: { mouse: 0, touch: 0, pen: 0, other: 0 }, restores: 0 }, trials: [] };
    }
    this.counts = { experiment: 0, tutorial: 0, free: 0 };
    for (const t of this.data.trials) this.counts[t.phase ?? 'free']++;
    addEventListener('pagehide', () => { this.endTrial('abandoned'); this.persist(); });
    this.persist();
  }

  get sessionId() { return this.data.session.sessionId; }
  sessionMs() { return r3(performance.now() - this.perfOrigin); }

  /** meta: { phase, towerId, set, towerIndex, configId, inverted, variant, demoMode, physics, blocks, ... }. The trial exists from cross onset on; its clock starts at towerOnset(). */
  beginTrial(meta) {
    const phase = meta.phase ?? 'free';
    const n = ++this.counts[phase];
    const t = {
      sessionId: this.sessionId, phase, trialIndexOverall: this.data.trials.length + 1,
      trialNumber: phase === 'tutorial' ? null : n, tutorialTrialNumber: phase === 'tutorial' ? n : null,
      trialId: `${this.sessionId}-${phase === 'tutorial' ? 'T' : phase === 'experiment' ? 'E' : 'F'}${n}`,
      ...meta,
      startedAt: iso(), startSessionMs: this.sessionMs(), cross: null, towerOnsetAt: null, towerOnsetSessionMs: null,
      endedAt: null, endSessionMs: null, durationMs: null, timeToCompletionMs: null, completed: false, outcome: null,
      viewport: { width: innerWidth, height: innerHeight, orientation: screen.orientation?.type ?? (innerWidth >= innerHeight ? 'landscape' : 'portrait') },
      attempts: 0, hits: 0, nonActionable: 0, misses: 0, ignored: 0, releasedEarly: 0, actions: [],
      // horizontal-error penalty (v2.3). Penalty-block clicks are NOT in `actions` (they are not hits and must not enter the familiarity / colour-location analyses): they are in `penaltyEvents`.
      penaltiesTriggered: 0, penaltyBlocksAdded: 0, penaltyBlocksRemoved: 0, penaltyBlockClicks: 0, penaltyOutstandingAtEnd: null, towerClearedAtMs: null, timeToClearPenaltiesMs: null,
      penalty: { active: !!meta.penaltyActive, threshold: meta.penaltyThreshold ?? null, blocks: [] }, penaltyEvents: [],
    };
    this.t0 = null; this.lastEnded = null; this.data.trials.push(t); this.active = t; this.persist();
  }

  /** Start cross shown. */
  markCrossOnset(mode = 'click') {
    const t = this.active; if (!t) return;
    t.cross = { mode, onsetAt: iso(), onsetSessionMs: this.sessionMs(), clickAt: null, clickSessionMs: null, latencyMs: null, clickScreen: null, pointerType: null };
    this.persist();
  }
  /** The participant started the trial through the cross (click/tap now; later possibly a completed gaze fixation). info: { x, y, pointerType } */
  markCrossClick(info = {}) {
    const t = this.active; if (!t?.cross) return;
    const now = this.sessionMs(); Object.assign(t.cross, { clickAt: iso(), clickSessionMs: now, latencyMs: r3(now - t.cross.onsetSessionMs), clickScreen: info.x != null ? { x: r3(info.x), y: r3(info.y) } : null, pointerType: info.pointerType ?? null });
    if (info.pointerType && info.pointerType in this.data.session.inputObserved) this.data.session.inputObserved[info.pointerType]++;
    this.persist();
  }
  /** Tower is shown: the trial clock starts. */
  towerOnset() {
    const t = this.active; if (!t) return;
    this.t0 = performance.now(); t.towerOnsetAt = iso(); t.towerOnsetSessionMs = this.sessionMs(); this.persist();
  }

  /**
   * Called on every primary press on the canvas (blocks with or without image, and misses). Returns the action record (completed later).
   * a: { pointerType, x, y (screen), world, local, block info (blockIndex, hasImage, imageId, presentationNumber, familiarity, cue, color), face, u, v, result,
   *      first, blockState, trialContext (analysis fields, see main.js) }
   */
  logAttempt(a) {
    // A press that arrives after the trial ended (e.g. during the pause that shows the cleared tower) is still recorded, flagged afterTrialEnd.
    const late = !this.active, t = this.active ?? this.lastEnded; if (!t) return null;
    if (late) t.lateAttempts = (t.lateAttempts ?? 0) + 1; else t.attempts++;
    const pt = a.pointerType in this.data.session.inputObserved ? a.pointerType : 'other';
    this.data.session.inputObserved[pt]++;
    const xyz = q => (q ? { x: r3(q.x), y: r3(q.y), z: r3(q.z) } : null);
    const blk = a.hasImage && a.blockIndex !== null && a.blockIndex !== undefined ? t.blocks?.[a.blockIndex] : null;
    const rec = {
      sessionId: this.sessionId, trialId: t.trialId, phase: t.phase, trialNumber: t.trialNumber, tutorialTrialNumber: t.tutorialTrialNumber, trialIndexOverall: t.trialIndexOverall,
      actionNumber: t.actions.length + 1, afterTrialEnd: late, tMs: r3(this.t0 === null ? null : performance.now() - this.t0), tSessionMs: this.sessionMs(),
      eventType: a.result, result: a.result,   // event type: fired | non_actionable | miss | ignored_* | released_early
      pointerType: a.pointerType, screen: { x: r3(a.x), y: r3(a.y) },
      world: xyz(a.world),                 // 3D hit point (for a miss: the platform point under the pointer, if the ray reaches the platform)
      local: xyz(a.local),                 // hit point in the block's own frame (0 = geometric centre)
      blockIndex: a.blockIndex ?? null, hitBlock: a.blockIndex !== null && a.blockIndex !== undefined, hasImage: a.hasImage ?? null,
      imageId: a.imageId ?? null, presentationNumber: a.presentationNumber ?? null, familiarity: a.familiarity ?? null,
      cue: a.cue ?? null, color: a.color ?? null,
      face: a.face ?? null, u: r3(a.u), v: r3(a.v),     // clicked face and normalised coordinates on it (object-centred): u 0 left..1 right, v 0 bottom..1 top
      actionable: a.hasImage ?? null, impulseApplied: false, effectiveness: null, impulse: null, holdMs: null, response: null,
      first: a.first ?? null, blockState: a.blockState ?? null, trialContext: a.trialContext ?? null,
      // explicit rule-reconstruction fields (v2.2): rule phase of this trial, the optimum for THIS block under THIS trial's rule, the actual click, and the image's history
      experimentalTrialNumber: t.phase === 'experiment' ? t.trialNumber : null, colorRulePhase: t.colorRulePhase ?? 'initial',
      optimalU: blk?.preferredX ?? null, optimalV: blk?.preferredY ?? null, clickU: r3(a.u), clickV: r3(a.v),
      previousPresentationTrial: blk?.previousTrial ?? null, lagTrials: blk?.lagTrials ?? null,
      targetType: a.targetType ?? (a.blockIndex === null || a.blockIndex === undefined ? 'platform_or_background' : a.hasImage ? 'image_block' : 'plain_block'),   // 'penalty_block' clicks are in penaltyEvents
      horizontalError: null, penaltyTriggered: false, penaltyBlockId: null,
    };
    if (!late) { if (rec.result === 'miss') t.misses++; else if (rec.result === 'non_actionable') t.nonActionable++; else if (rec.result?.startsWith('ignored')) t.ignored++; }
    t.actions.push(rec); this.persist(); return rec;
  }

  /** The press turned into an impulse. impulse: { magnitude, dir, effectiveness: {baseline, horizontal, vertical, multiplier, preferredX, preferredY}, initialSpeed, initialAngularSpeed } */
  markFired(rec, impulse, holdMs) {
    if (!rec || !this.active) return;
    rec.result = 'fired'; rec.eventType = 'fired'; rec.impulseApplied = true; rec.holdMs = r3(holdMs);
    rec.impulse = { magnitude: r3(impulse.magnitude), direction: { x: r3(impulse.dir.x), y: r3(impulse.dir.y), z: r3(impulse.dir.z) } };
    const e = impulse.effectiveness; rec.effectiveness = e ? Object.fromEntries(Object.entries(e).map(([k, x]) => [k, r3(x)])) : null;
    rec.response = { initialSpeed: r3(impulse.initialSpeed), initialAngularSpeed: r3(impulse.initialAngularSpeed), blocksClearedAfter: null, struckBlockDisplacement: null, struckBlockLeftPlatform: null };
    this.active.hits++; this.persist();
  }

  /** A press on an image block whose horizontal error exceeded the threshold: no impulse, one penalty block added. Returns the new penalty block id. */
  markPenalty(rec, { horizontalError, threshold }) {
    const t = this.active; if (!rec || !t) return null;
    const id = t.penaltyBlocksAdded + 1, tMs = r3(performance.now() - this.t0);
    rec.result = 'penalty'; rec.eventType = 'penalty'; rec.impulseApplied = false; rec.holdMs = 0; rec.horizontalError = r3(horizontalError); rec.penaltyThreshold = threshold; rec.penaltyTriggered = true; rec.penaltyBlockId = id;
    t.penaltiesTriggered++; t.penaltyBlocksAdded++;
    t.penalty.blocks.push({ penaltyBlockId: id, addedAtMs: tMs, triggerActionNumber: rec.actionNumber, triggerBlockIndex: rec.blockIndex, triggerImageId: rec.imageId, horizontalError: rec.horizontalError, removedAtMs: null, removalClicks: 0, msOnPlatform: null });
    t.penaltyEvents.push({ eventType: 'penalty_block_added', targetType: 'penalty_block', penaltyBlockId: id, tMs, tSessionMs: this.sessionMs(), triggerActionNumber: rec.actionNumber, outstandingAfter: t.penaltyBlocksAdded - t.penaltyBlocksRemoved });
    this.persist(); return id;
  }
  /** Record the horizontal error on a press that was NOT penalised (the impulse is applied). */
  noteHorizontalError(rec, err, threshold) { if (rec) { rec.horizontalError = r3(err); rec.penaltyThreshold = threshold; } }
  /** A click on a penalty block (always removes it). */
  markPenaltyRemoved(id, { pointerType, x, y }) {
    const t = this.active; if (!t) return;
    const b = t.penalty.blocks.find(q => q.penaltyBlockId === id), tMs = r3(performance.now() - this.t0); t.penaltyBlockClicks++;
    if (b) { b.removedAtMs = tMs; b.removalClicks = 1; b.msOnPlatform = r3(tMs - b.addedAtMs); t.penaltyBlocksRemoved++; }
    t.penaltyEvents.push({ eventType: 'penalty_block_removed', targetType: 'penalty_block', penaltyBlockId: id, tMs, tSessionMs: this.sessionMs(), pointerType, screen: { x: r3(x), y: r3(y) }, clickNumber: t.penaltyBlockClicks, outstandingAfter: t.penaltyBlocksAdded - t.penaltyBlocksRemoved });
    if (t.penaltyBlocksRemoved === t.penaltyBlocksAdded) { const from = Math.max(t.towerClearedAtMs ?? 0, ...t.penalty.blocks.map(q => q.addedAtMs)); t.timeToClearPenaltiesMs = r3(tMs - from); }
    this.persist();
  }
  /** The main tower objective was just completed (all image blocks gone). */
  markTowerCleared() { const t = this.active; if (t && t.towerClearedAtMs === null) { t.towerClearedAtMs = r3(performance.now() - this.t0); this.persist(); } }

  markReleasedEarly(rec, holdMs) {
    if (!rec || rec.result === 'fired' || !this.active) return;
    rec.result = 'released_early'; rec.holdMs = r3(holdMs); this.active.releasedEarly++; this.persist();
  }

  /** Close the current trial (no-op if already closed, so an ended trial is never overwritten). */
  endTrial(outcome) {
    const t = this.active; if (!t) return;
    for (const a of t.actions) if (a.result === 'pending') a.result = 'interrupted';   // press still undecided when the trial ended
    t.penaltyOutstandingAtEnd = t.penaltyBlocksAdded - t.penaltyBlocksRemoved;
    t.endedAt = iso(); t.endSessionMs = this.sessionMs(); t.durationMs = this.t0 === null ? null : r3(performance.now() - this.t0);
    t.outcome = outcome; t.completed = outcome === 'completed'; if (t.completed) t.timeToCompletionMs = t.durationMs;
    this.lastEnded = t; this.active = null; this.persist();
  }

  persist() { try { sessionStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage full/unavailable: keep in memory */ } }

  fileStem() { return `blockgame2_${this.sessionId}_${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`; }

  json() { return JSON.stringify({ ...this.data, archivedSessions: this.archive, exportedAt: iso() }, null, 1); }

  /** Trial summary: one row per trial. */
  csv() {
    const cols = ['sessionId', 'trialId', 'phase', 'trialNumber', 'colorRulePhase', 'tutorialTrialNumber', 'trialIndexOverall', 'towerId', 'configId', 'inverted', 'demoMode', 'startedAt', 'endedAt', 'crossOnsetSessionMs', 'crossClickSessionMs', 'crossLatencyMs', 'towerOnsetSessionMs', 'durationMs', 'timeToCompletionMs', 'outcome', 'completed', 'attempts', 'hits', 'nonActionable', 'misses', 'ignored', 'releasedEarly', 'imagesShown', 'novelImages', 'familiarImages', 'meanMultiplier', 'penaltiesTriggered', 'penaltyBlocksAdded', 'penaltyBlocksRemoved', 'penaltyBlockClicks', 'penaltyOutstandingAtEnd', 'towerClearedAtMs', 'timeToClearPenaltiesMs'];
    const physics = ['impulseMagnitude', 'holdMs'];
    const mean = m => (m.length ? +(m.reduce((a, b) => a + b, 0) / m.length).toFixed(3) : '');
    const val = (t, c) => c === 'meanMultiplier' ? mean(t.actions.filter(a => a.effectiveness).map(a => a.effectiveness.multiplier))
      : c === 'imagesShown' ? t.blocks?.filter(b => b.imageId).length : c === 'novelImages' ? t.blocks?.filter(b => b.familiarity === 'novel').length : c === 'familiarImages' ? t.blocks?.filter(b => b.familiarity === 'familiar').length
      : c === 'crossOnsetSessionMs' ? t.cross?.onsetSessionMs : c === 'crossClickSessionMs' ? t.cross?.clickSessionMs : c === 'crossLatencyMs' ? t.cross?.latencyMs : t[c];
    return [[...cols, ...physics].join(','), ...this.data.trials.map(t => [...cols.map(c => val(t, c)), ...physics.map(p => t.physics?.[p])].map(csvCell).join(','))].join('\n');
  }

  /** Event table: one row per action (attempted hit / click), with the trial identifiers and the flattened analysis fields. */
  eventsCsv() {
    const cols = ['sessionId', 'trialId', 'phase', 'trialNumber', 'tutorialTrialNumber', 'trialIndexOverall', 'towerId', 'configId', 'actionNumber', 'afterTrialEnd', 'eventType', 'tMs', 'tSessionMs', 'pointerType',
      'screenX', 'screenY', 'worldX', 'worldY', 'worldZ', 'blockIndex', 'hasImage', 'imageId', 'presentationNumber', 'familiarity', 'cue', 'color', 'face', 'u', 'v', 'experimentalTrialNumber', 'colorRulePhase', 'optimalU', 'optimalV', 'clickU', 'clickV', 'previousPresentationTrial', 'lagTrials', 'targetType', 'horizontalError', 'penaltyThreshold', 'penaltyTriggered', 'penaltyBlockId', 'actionable', 'impulseApplied',
      'effBaseline', 'effHorizontal', 'effVertical', 'effMultiplier', 'preferredX', 'preferredY', 'impulseMagnitude', 'impulseDirX', 'impulseDirY', 'impulseDirZ', 'holdMs',
      'firstAttemptOnBlock', 'firstActionableAttemptOnBlock', 'firstImpulseOnBlock', 'priorImpulsesOnTrial', 'priorImpulseOnOtherBlock',
      'blockPreviouslyMoved', 'blockDisplacementM', 'blockRotationDeg', 'blockMaxSpeed', 'blockX', 'blockY', 'blockZ', 'blockQx', 'blockQy', 'blockQz', 'blockQw', 'blockTiltDeg',
      'initialSpeed', 'initialAngularSpeed', 'blocksClearedAfter', 'struckBlockDisplacement', 'struckBlockLeftPlatform'];
    const row = (t, a) => ({
      ...a, towerId: t.towerId, configId: t.configId, screenX: a.screen?.x, screenY: a.screen?.y, worldX: a.world?.x, worldY: a.world?.y, worldZ: a.world?.z,
      effBaseline: a.effectiveness?.baseline, effHorizontal: a.effectiveness?.horizontal, effVertical: a.effectiveness?.vertical, effMultiplier: a.effectiveness?.multiplier,
      preferredX: a.effectiveness?.preferredX, preferredY: a.effectiveness?.preferredY, impulseMagnitude: a.impulse?.magnitude, impulseDirX: a.impulse?.direction.x, impulseDirY: a.impulse?.direction.y, impulseDirZ: a.impulse?.direction.z,
      firstAttemptOnBlock: a.first?.attemptOnBlock, firstActionableAttemptOnBlock: a.first?.actionableAttemptOnBlock, firstImpulseOnBlock: a.first?.impulseOnBlock,
      priorImpulsesOnTrial: a.trialContext?.priorImpulsesOnTrial, priorImpulseOnOtherBlock: a.trialContext?.priorImpulseOnOtherBlock,
      blockPreviouslyMoved: a.blockState?.previouslyMoved, blockDisplacementM: a.blockState?.displacementFromInitial, blockRotationDeg: a.blockState?.rotationFromInitialDeg, blockMaxSpeed: a.blockState?.maxSpeedSoFar,
      blockX: a.blockState?.position?.x, blockY: a.blockState?.position?.y, blockZ: a.blockState?.position?.z,
      blockQx: a.blockState?.quaternion?.x, blockQy: a.blockState?.quaternion?.y, blockQz: a.blockState?.quaternion?.z, blockQw: a.blockState?.quaternion?.w, blockTiltDeg: a.blockState?.tiltDeg,
      initialSpeed: a.response?.initialSpeed, initialAngularSpeed: a.response?.initialAngularSpeed, blocksClearedAfter: a.response?.blocksClearedAfter,
      struckBlockDisplacement: a.response?.struckBlockDisplacement, struckBlockLeftPlatform: a.response?.struckBlockLeftPlatform,
    });
    const rows = this.data.trials.flatMap(t => t.actions.map(a => { const r = row(t, a); return cols.map(c => csvCell(r[c])).join(','); }));
    return [cols.join(','), ...rows].join('\n');
  }

  download(kind) {
    const text = kind === 'events' ? this.eventsCsv() : kind === 'csv' ? this.csv() : this.json();
    const blob = new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${this.fileStem()}${kind === 'events' ? '_events' : kind === 'csv' ? '_trials' : ''}.${kind === 'json' ? 'json' : 'csv'}`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

function csvCell(v) { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
