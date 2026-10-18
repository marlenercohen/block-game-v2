// All tunable constants live here. Units are arbitrary "world units" (~metres); density 1 => mass = volume.
export const CONFIG = {
  fixedDt: 1 / 120,          // physics step (s) - fixed for determinism
  maxStepsPerFrame: 12,
  demoDelayMs: 1500,         // Demo Mode: pause after a cleared tower before the next one loads
    gravity: -9.81,

  // ---- THE FORCE: magnitude of the impulse applied to the clicked block (mass*velocity units) ----
  impulseMagnitude: 1.2,
  impulseElevationDeg: 0,    // 0 = purely horizontal, "away from camera"; positive tilts upward
  holdMs: 0,                 // mouse must be held this long before the impulse fires (0 = any click fires at once; the experiment uses 500)

  // A block is cleared once its centre is below this height (platform top is y = 0).
  clearY: -1.5,
  // Cleared bodies are deleted from the physics world below this height.
  removeY: -12,

  // Ready-for-next-action criteria
  // Ready for the next click when EITHER everything has settled (below the speeds for `seconds`) OR `maxWaitSeconds` have passed since the last impulse, whichever comes first.
  settle: { linSpeed: 0.08, angSpeed: 0.2, seconds: 0.3, maxWaitSeconds: 0.5 },
  // Developer option: accept clicks while blocks are still moving (off by default: trials start from a still tower)
  allowClickWhileMoving: false,

  // physical surface properties of every block (V1 blue block values); total mass comes from experiment.js
  block: { friction: 0.4, restitution: 0.05 },

  platform: {
    size: [4.4, 0.6, 3.2],     // full extents x, y, z; top surface sits at y = 0
    center: [0, 0, -0.45],    // x, z of the platform centre
    friction: 0.4,
    restitution: 0.0,
    color: 0xb9bcc2,
  },

  camera: { position: [7.5, 6.2, 10.5], target: [0, 1.3, -0.45], fov: 29 },
  background: 0xe9eaec,
};
