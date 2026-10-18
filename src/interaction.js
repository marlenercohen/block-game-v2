// Interaction pipeline, split into separable steps so that a gaze-contingent input can replace mouse/touch later without touching physics or logging:
//   1. input source        -> PointerInput (mouse/touch) produces "press" requests {x, y, pointerType}. A gaze source would produce the same after a dwell of N ms.
//   2. target identification -> targetOf(): which block face is under that screen position (raycast), plus the platform point for misses
//   3. qualification        -> classifyPress(): does this press count as an attempted hit (actionable, ready, not paused ...)?  (rules unchanged from before)
//   4. hit coordinates      -> faceCoordinates() in effectiveness.js (object-centred u, v)
//   5. effectiveness        -> effectiveness() in effectiveness.js
//   6. applying the impulse -> Simulation.applyImpulseAtPoint() in physics.js
//   7. recording            -> Logger (logger.js)
// main.js wires these steps together; the behaviour is identical to the earlier monolithic handler.

/** Mouse / touch / pen source. handlers: { onPress({x, y, pointerType}), onRelease() }. */
export class PointerInput {
  constructor(canvas, handlers) {
    this.handlers = handlers;
    canvas.addEventListener('pointerdown', e => { if (e.button === 0) handlers.onPress({ x: e.clientX, y: e.clientY, pointerType: e.pointerType }); });
    const release = () => handlers.onRelease();
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', release);
    document.addEventListener('mouseleave', release);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
}

/** Step 2: identify the targeted block face (or a miss). Returns { hit: {block, localPoint, normal} | null, platformPoint }. */
export function targetOf(view, x, y) {
  const hit = view.pick(x, y);
  return { hit, platformPoint: hit ? null : view.lastPlatformHit };
}

/** Step 3: why a press does nothing, or null if it starts an action. state: { hasHold, ready, allowWhileMoving, paused, ended } */
export function classifyPress(hit, state) {
  const hasImage = !!hit?.block.props.imageId;
  if (hit && !hasImage) return 'non_actionable';          // block without an image: no effect, no hit consumed (but logged with its location)
  if (!state.ready && !state.allowWhileMoving) return 'ignored_busy';
  if (state.paused) return 'ignored_paused';
  if (state.ended) return 'ignored_after_clear';
  if (state.hasHold) return 'ignored_hold_active';
  if (!hit) return 'miss';
  return null;
}
