# Block Game Version 2.1 - handoff

Status as of 2026-10-18. Repo: https://github.com/marlenercohen/block-game-v2 (branch `main`, auto-deployed by GitHub Actions) - site: https://marlenercohen.github.io/block-game-v2/ (participants: add `?kiosk=1`). Version 1 (`../block_game`, its own repo/site) is untouched at commit `072b27e`; `npm run check` verifies that.

## What it is
Three.js + Rapier (physics) + Vite. Participants click image-bearing blocks of a 3-D tower; hit effectiveness depends on where on the face the block is hit (blue/red cue -> horizontal position, novel/familiar -> vertical position). Session = intro card -> 5 tutorial trials -> N experimental trials (each started by clicking a central "+") -> end screen with JSON/CSV downloads. `?mode=free` = single-tower free play. Data stay in the participant's browser until downloaded (no server).

## History
1. First human pilot (tag `pilot1-first-human-session`, preset `pilot1`): game too easy.
2. v2.1 (commit `564a5b7`): 12 new 3-D towers (`src/towers_v21.js`, 6-8 blocks, 3-4 image blocks), mass 0.432->1.0, impulse 1.2->3.2, friction 0.4->0.5, effect `baseline 0.2, amps 1.0/1.0, widths 0.2/0.2` (was 0.25/0.975/0.22), timeouts 90 s / skip after 30 s, image pool 35->75. Optimal placement ~8 hits per tower, random ~17, deliberately poor ~53; first-hit displacement optimal vs poor ~3.6x.
3. Planner cap (commit `f0e6d9b`): strict maximum of two presentations per image per session (see below).

## Image presentation rule (src/plan.js)
- Each image appears once as novel and at most once more as familiar; after two presentations it is never scheduled again. Tutorial images are a separate pool/history.
- Familiar slots reuse an image shown exactly once and last shown exactly L trials ago, L from `lagChoices` (1, 2, 3, 5). If no such image exists at any listed lag, the slot becomes novel (logged `fallback: novel_because_no_once_shown_image_at_a_listed_lag`). Consequence: ~56-57% of presentations are novel rather than 50% (the old fallback that reused any earlier image gave off-list lags up to 23 trials and is removed).
- `validatePlan(plan)` runs at the end of `buildPlan` and throws if an image is scheduled >2 times or twice in one trial, or if presentation 2 is not familiar. Explicit images in `explicitTrials` that would exceed 2 throw.
- Tested: 600 plans (300 seeds x lag lists [1,2,3,5] and [1,2,3]) never exceed 2; lags are exactly {1,2,3,5}.
- Pool: 75 experimental images; 24 trials need ~50 distinct. `trials` much above ~35 can exhaust the pool and throws "Image pool exhausted" (add images to `public/images` and `src/image_ids.js`).
- Note: the planner change is not a new `experimentVersion` string; data from sessions before `f0e6d9b` can contain images presented >2 times and off-list lags. Compare by the `plan` stored in each JSON.

## Key files
- `src/presets.js` presets `v21` (default) / `pilot1` (`?preset=pilot1`); `src/experiment.js` (`EFFECT`, `PHYS.blockMass`, cue/familiarity maps, image pools); `src/config.js` (impulse, friction, settling); `src/session_config.js` (trials, lags, seed, timing; URL overrides `?trials=&seed=&maxTrial=&skipAfter=&novel=&lags=&order=&towers=&kiosk=1&preset=`); `src/plan.js`, `src/history.js`; `src/towers.js` / `towers_v21.js`; `src/main.js` (flow), `src/interaction.js`, `src/analysis.js`, `src/logger.js` (schema `blockgame-v2-log/2`).
- Exported JSON records `experimentVersion`, `preset`, `physicsActual`, `towerDefinitions`, the full plan, and per-trial physics snapshots, so versions are comparable. Per block: imageId, familiarity, presentationNumber, lag fields; per press: first-hit flags, block state, effectiveness, response.

## Tuning
- Hit contrast: `EFFECT`; overall strength: `CONFIG.impulseMagnitude`, `PHYS.blockMass`; stickiness: friction in `config.js`.
- Difficulty: `towerOrder`, or new towers via `node tools/gen_towers.mjs N seed minBlocks maxBlocks` then `node tools/rank_towers.mjs`; `node tools/eval_physics.mjs` gives hits-to-clear per bot strategy.
- Do not change hit rules, image rendering, face behaviour or coordinates without reason: `npm run check` has frozen reference values for them.

## Tests / run
```
npm install; npm run dev        # http://localhost:5174
npm run check                   # headless: physics, hit mechanics, plan/history, towers, V1 untouched
npm run build                   # production build (base /block-game-v2/)
```
Browser tests (need `puppeteer-core` and Chrome; edit the Chrome path inside; dev server on 5174 or `URL=` to test a deployed site, no query string in the URL): `tools/browser/session_test.mjs`, `v2test.mjs` (with `?mode=free`), `v2bot.mjs`. Last full browser run (session test on the live site) was before the planner commit; after it only `npm run check` and the build were run.

## Open items / caveats
- Gaze/monkey version is structured for (start control, press pipeline) but not implemented.
- THINGS image licence should be checked before wide public use.
- Pages caches HTML ~10 min (hard-refresh after deploys). Tower 1 is the easy "gateway"; tallest towers are ~4.4 high and fit the default camera.
