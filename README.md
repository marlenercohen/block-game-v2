# Block physics game - Version 2 (experimental): pilot experiment build

A separate copy of the block game (Version 1 lives untouched in `../block_game`, repo `marlenercohen/block-game`; its published site is unchanged). Published (when the steps below are done) as its own project: repository `marlenercohen/block-game-v2`, site https://marlenercohen.github.io/block-game-v2/ - separate from Version 1.

## What the game is
Click (or tap) a block that shows a natural image to hit it and knock the image blocks off the platform. **Where on the image you hit decides how strong the hit is:**
- **Horizontal position <- block colour** (continuous blue -> purple -> red cue): blue favours the left of the image, red the right, purples in between. Not explained to participants.
- **Vertical position <- image familiarity:** an image's first presentation in the session is *novel* (favours hits near the bottom), later presentations are *familiar* (favour hits near the top). Explained in the tutorial.
- Additive rule: `multiplier = baseline + horizontal + vertical`, impulse = base impulse x multiplier (0.25 ... 2.20, an 8.8-fold range; direction unchanged). Blocks without image are gray, cannot be hit (the attempt is logged) and are pushed around by the physics. All blocks have the same mass (0.432).
- Hit coordinates are object-centred (in the block's own frame), exactly as before. Physics, image rendering, face rules: unchanged.

## Experimental session (default mode)
`intro card -> tutorial (5 practice trials) -> N experimental trials -> end screen`.
- **Every trial starts with a central "+"** on a neutral background; the tower is hidden. Clicking/tapping the plus logs the interaction, removes it, shows the tower and starts the trial clock. Tutorial trials use the same sequence; the intro card and a caption under the plus in the tutorial trials tell participants to click the plus to begin each trial.
- A trial ends when all image blocks are off the platform (`completed`), after `maxTrialSeconds` (`timeout`), or when the participant presses the small "Next tower" button that appears after `skipButtonAfterSeconds` (`manual_advance`). The cleared tower stays visible ~1.2 s, then the next plus appears. No manual resets or tower selection.
- Tutorial (src/tutorial.js): goal, clicking pictures, location matters, picture-less blocks cannot be hit, novel -> bottom, familiar -> top (the same picture is shown first as novel, then as familiar), "block colour also gives a hint - you will discover how". It never states the colour mapping (checked by a test). Tutorial images come from a separate pool (`TUTORIAL_IMAGES`, 10 images) with a separate presentation history, and all tutorial image blocks use the neutral middle cue, so practice cannot contaminate experimental familiarity.
- Free play (the earlier single-tower mode with tower menu, Reset, Demo Mode, Developer panel) is still available: add `?mode=free` to the address.

## Run it
Requires Node.js 18+.
```
cd ~/Desktop/dougcode/block_game_v2
npm install
npm run dev          # http://localhost:5174   (Version 1 uses 5173, so both can run at once)
npm run build        # production build into dist/ (relative base)
npm run check        # headless checks (tools/v2_checks.mjs)
```
URL options (also editable in `src/session_config.js`): `?kiosk=1` (hide Developer panel and data buttons from the participant; **Ctrl+Shift+D** downloads the JSON), `?trials=24&tutorial=1&seed=7&maxTrial=60&skipAfter=25&novel=0.5&lags=1,2,3,5&order=shuffle|sequence&towers=1,2,4,...` (1-based tower numbers), `?mode=free`.
Developer panel (bottom-left): impulse size, click-while-moving, hold time, "Skip tutorial", "Skip trial", plan summary.

## Configuring a session (`src/session_config.js`, towers in `src/towers.js`, parameters in `src/experiment.js`)
| What | Setting |
|---|---|
| number of trials | `nTrials` (24) |
| which towers / order | `towerOrder` (indices into `TOWERS`; null = all 12), `orderMode` ('shuffle' passes without immediate repeats, or 'sequence') |
| novel vs familiar images | `novelProportion` (0.5 = half of the image presentations are first presentations) |
| repetition lag (in trials) | `lagChoices` ([1,2,3,5]): each repeated image is one that was last shown exactly L trials earlier |
| specific tower slots | in `towers.js` a block can say `image: 'novel'` or `'familiar'`; `true` follows `novelProportion` |
| colours | block `cue` (0 blue ... 1 red) or `'random'`: drawn from `cueValues` with `cuePolicy` 'balanced' (shuffled bag) or 'random' |
| full manual control | `explicitTrials[t] = { tower, slots: [ { image: 'novel' \| 'familiar' \| {lag: 3} \| 'ID_1234', cue: 0.25 }, ... ] }` |
| reproducibility | `seed` (null = random; the seed is stored in the data) |
| timing | `maxTrialSeconds`, `skipButtonAfterSeconds`, `completionPauseMs`, `timeoutPauseMs` |
| trial start | `startControl: { mode: 'click', durationMs: 0 }` (see "Future gaze version") |
The whole plan (tower, images with intended novel/familiar role and lag, cues for every trial) is generated by `buildPlan()` (src/plan.js) before the first trial, reproducibly from the seed, and saved in `session.plan`. An image pool that is too small for the requested number of novel presentations throws an error instead of recycling images. Hit-effectiveness, colour and familiarity mappings: `src/experiment.js` (`EFFECT`, `CUE`, `FAMILIARITY`); base impulse `CONFIG.impulseMagnitude` (3.2) in `src/config.js`, block mass `PHYS.blockMass` (1.0) in `src/experiment.js`.

## Version 2.1 (current default) and presets
Changes after the first human pilot (too easy): 12 new 3-D towers of 6-8 blocks (`src/towers_v21.js`; 3-4 image blocks, 3-5 levels, offsets/overhangs/support chains, stable at start), heavier blocks (mass 0.432 -> 1.0), stronger impulse (1.2 -> 3.2), friction 0.4 -> 0.5, hit-location effect `baseline 0.2, amplitudes 1.0/1.0, widths 0.2/0.2` (was 0.25 / 0.975 / 0.22), timeouts 90 s / skip button after 30 s (was 60 / 25), image pool 35 -> 75. Hit rules, colour/familiarity mapping, image rendering and the familiarity scheduler are unchanged.
- `?preset=v21` (default) or `?preset=pilot1` (reproduces the first pilot: old towers, physics, effect). Presets live in `src/presets.js`; everything is mutable at runtime.
- Every session's JSON records `experimentVersion`, `preset`, `physicsActual` (mass, impulse, frictions, effect parameters) and `towerDefinitions` (every block of every tower), and each trial has a physics snapshot, so versions can be compared.
- Tuning: hit contrast = `EFFECT` (baseline, amplitudes, widths); overall hit strength = `CONFIG.impulseMagnitude` / `PHYS.blockMass`; stickiness = friction; difficulty = which towers (`towerOrder`) or new towers via `node tools/gen_towers.mjs N seed minBlocks maxBlocks` and `node tools/rank_towers.mjs`; `node tools/eval_physics.mjs` reports hits-to-clear for optimal/random/poor bot strategies (v2.1: ~8 / ~17 / ~53 hits; first-hit displacement optimal vs poor ~3.6x).

## Image familiarity bookkeeping (src/history.js)
Familiarity is the presentation history of the image within its pool in this session, never whether it was clicked: an image counts as presented once per trial in which a tower showing it is set up (immediately before the start cross), even if its block is never hit; repeated frames of a trial are not extra presentations. Per block the trial record has `presentationNumber`, `familiarity`, `previousTrial`, `lagTrials` (current trial minus previous presentation), `interveningTrials` (lag - 1), `interveningDistinctImages` (distinct other images shown in the trials strictly between the two presentations; images shown alongside it in either trial are not counted), plus the planned role/lag. Experiment and tutorial each have their own `ImageHistory`.

## Data (local only; JSON + CSV)
Downloads: faint buttons bottom-right ("Download data" = full JSON, "Trials CSV", "Events CSV"), the same buttons on the end screen, and Ctrl+Shift+D. Files: `blockgame2_<session>_<date-time>.json`, `..._trials.csv` (one row per trial), `..._events.csv` (one row per attempted hit/click). Data are kept in memory and sessionStorage; trials are preserved across trial transitions. Reloading the page starts a *new* experimental session (new ID) and the interrupted one is kept under `archivedSessions` in the JSON. No names/IDs/IP; the session ID is random.
**Schema `blockgame-v2-log/2`** - `{ schema, session, trials[], archivedSessions[], exportedAt }`:
- `session`: sessionId, startedAt, completedAt, appVersion, mode, observed device info (browser, OS, screen, pixel ratio, orientation, touch capability), inferred device category, `inputObserved` (pointer types seen), `plan` (seed, stats, per-trial tower/slots), `experimentConfig` (masses, cue/familiarity/effect parameters, image pools, session config).
- `trial`: `phase` (`tutorial` | `experiment` | `free`), `trialNumber` (experimental/free trials only; tutorial trials have `null` and `tutorialTrialNumber`), `trialIndexOverall`, `trialId`, `tutorialStep`, towerId/towerIndex/configId, `cross` {onsetAt, onsetSessionMs, clickAt, clickSessionMs, latencyMs, clickScreen, pointerType, mode}, `towerOnsetAt/SessionMs` (trial clock zero), `endedAt`, `durationMs`, `timeToCompletionMs`, `outcome` (`completed`, `timeout`, `manual_advance`, `stuck`, `dev_skip`, `abandoned`, `reset`, `switched_tower`), counters (attempts, hits, nonActionable, misses, ignored, releasedEarly, lateAttempts), `physics` snapshot, `completionRule`, and `blocks[]`: the full initial configuration of every block (size, position, mass, hasImage, imageId, presentationNumber, familiarity, lag fields, cue, colour, preferredX/Y).
- `action` (event; `trial.actions[]`): `eventType`/`result` (`fired` = impulse applied | `non_actionable` | `miss` | `ignored_busy|paused|after_clear|hold_active` | `released_early` | `interrupted`), sessionId, trialId, phase, trialNumber, `actionNumber`, `tMs` since tower onset, `tSessionMs`, `afterTrialEnd` (a press during the pause after the trial ended is kept, flagged), pointerType, `screen`, `world` (3D point; for a miss the platform point if any), `local` (block frame), blockIndex, hasImage, imageId, presentationNumber, familiarity, cue, color, `face`, `u`, `v` (object-centred face coordinates), actionable, impulseApplied, `effectiveness` {baseline, horizontal, vertical, multiplier, preferredX, preferredY}, `impulse` {magnitude, direction}, holdMs, `response` {initialSpeed, initialAngularSpeed, blocksClearedAfter, struckBlockDisplacement, struckBlockLeftPlatform}, and the first-hit analysis fields:
  - `first`: `attemptOnBlock` (first press that landed on this block, any outcome), `actionableAttemptOnBlock` (first press on this block while it is an image block), `impulseOnBlock` (first press that actually delivered an impulse; null for presses that cannot).
  - `blockState` at the moment of the press: `position`, `quaternion`, `tiltDeg` (angle between the block's own up axis and world up), `displacementFromInitial`, `rotationFromInitialDeg`, `maxSpeedSoFar`, `previouslyMoved` (displaced > 0.03 m, rotated > 3 degrees or faster than 0.15 m/s at any time before the press; thresholds in `src/analysis.js`).
  - `trialContext`: `priorImpulsesOnTrial`, `priorImpulseOnOtherBlock`.
  The events CSV flattens these (e.g. `firstAttemptOnBlock`, `blockPreviouslyMoved`, `effHorizontal`, `effVertical`, `blockTiltDeg`).

## Code structure / future gaze version (src/interaction.js, src/fixation.js)
The interaction pipeline is split into separable steps: input source (`PointerInput`: mouse/touch) -> target identification (`targetOf`) -> qualification (`classifyPress`) -> hit coordinates (`faceCoordinates`) -> effectiveness (`effectiveness`) -> applying the impulse (`Simulation.applyImpulseAtPoint`) -> recording (`Logger`). A gaze version can supply the same press request after the gaze has stayed on an image face for a minimum dwell time without changing physics or logging. Trial start is behind `createStartControl()` (`ClickStart` now): a gaze version resolves `waitForStart()` after the gaze stays on the plus for `startControl.durationMs`. Gaze control is not implemented.

## Tests
- `npm run check` (headless): equal mass/uniform inertia; blue/red and novel/familiar effect directions, additivity, nonzero worst case; **hit mechanics unchanged** (frozen reference multipliers; also compared 5292 grid points against the previous commit: identical); image history/lag/intervening-image logic; plan builder (seed reproducibility, proportions, lags, explicit trials, pool exhaustion, no tutorial images); tutorial text does not reveal the colour mapping; first-hit tracker; tower stability; Version 1 untouched.
- Browser (need `npm i puppeteer-core` somewhere, Chrome, `npm run dev` on 5174; edit the Chrome path inside): `tools/browser/session_test.mjs` (intro -> 5 tutorial trials -> 5 experimental trials incl. timeout and skip -> end screen -> export; cross/tower visibility, tutorial/experiment separation, familiarity and lags from the logs, first-hit flags, event completeness, downloads); `tools/browser/v2test.mjs` with `URL=http://localhost:5174/?mode=free` (non-actionable/miss/touch logging, effectiveness, reset, Demo Mode); `tools/playability.mjs` (hits per strategy; all towers solvable, 3-6 hits for good placement, ~12 for bad).

## Design decisions that can affect interpretation
See the end of the project report; summary: trial clock starts at tower onset and includes the 0.5 s between-hit rule; presentation is counted when a trial is set up; repeats are chosen by lag from what was last shown L trials earlier, so repeat lags are mostly short early on and Tower images repeat often because each tower has only 1-3 image blocks; plain blocks are gray and a trial is complete when the image blocks are gone (plain blocks may remain); the 0.5 s rule lets a press land on a block that is still moving (`previouslyMoved`); a top-face click counts as the top of the block; timeouts/skips yield incomplete trials; tutorial blocks all use the middle colour; "Blocks remaining" shows only the number of image blocks left.

## Images
75 experimental + 10 tutorial object photographs from the lab's local `THINGS_Images/images_all` (white frame trimmed, square, 384 px; images with people removed). **Check the THINGS licence/terms before publishing them on a public site.**

## Publishing / updating (GitHub Pages, separate from Version 1)
- Repo: https://github.com/marlenercohen/block-game-v2 ; site: https://marlenercohen.github.io/block-game-v2/ (give participants `https://marlenercohen.github.io/block-game-v2/?kiosk=1`, which hides the researcher controls; add e.g. `&trials=24` to change the session length).
- Production builds use the base path `/block-game-v2/` (`vite.config.js`); `npm run dev` still serves from `/`. `.github/workflows/deploy.yml` builds and deploys on every push to `main` (one-time: GitHub repo Settings -> Pages -> Source: "GitHub Actions").
- Update: `cd block_game_v2 && git add -A && git commit -m "..." && git push` (then wait ~1-2 min; hard-refresh the page, Pages caches the HTML for ~10 minutes).
- **Data are NOT stored on any server.** GitHub Pages only hosts static files. Each participant's data stay in their own browser until they press "Download data" on the end screen and send you the file (the end screen says so). If a participant closes the page before the end, the data of the finished trials are lost with the tab unless the same browser tab is reopened (an interrupted session is archived inside the next session's JSON, in the same tab only). Plan for how participants return their file (email, shared form, etc.).
- Image credit/licence: the 45 images are a subset of the THINGS object-image database (Hebart et al., 2019, PLOS ONE); check its terms (research use, attribution) before wide public distribution.
