// Physics layer (Version 2): wraps Rapier. Rigid bodies only; no rendering / DOM code so it can be run headless.
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from './config.js';
import { PHYS } from './experiment.js';

export async function initPhysics() { await RAPIER.init(); }

export class Simulation {
  /** A fresh world is built for every tower load/reset, so resets are exactly repeatable.
   *  tower.blocks[i]: { size, pos, cue, color, actionable, imageId, ... } (resolved by the presenter). Every block: mass PHYS.blockMass, uniform. */
  constructor(tower) {
    this.world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
    this.world.timestep = CONFIG.fixedDt;
    this.world.numSolverIterations = 8;
    this.world.integrationParameters.contact_natural_frequency = 60;   // stiffer contacts => less stack sag (as in Version 1)
    this.time = 0;

    const plat = tower.platform ?? CONFIG.platform;
    this.plat = plat;
    const [pw, ph, pd] = plat.size;
    const pb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(plat.center[0], -ph / 2, plat.center[1]));
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(pw / 2, ph / 2, pd / 2).setFriction(CONFIG.platform.friction).setRestitution(CONFIG.platform.restitution), pb);

    this.blocks = tower.blocks.map((spec, id) => {
      const [sx, sy, sz] = spec.size;
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(...spec.pos).setCanSleep(true).setCcdEnabled(true));
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
          .setMass(PHYS.blockMass)   // uniform box: centre of mass at the geometric centre, inertia of a solid box of this mass
          .setFriction(CONFIG.block.friction).setRestitution(CONFIG.block.restitution), body);
      return { id, spec, props: spec, size: spec.size, body, mass: body.mass(), cleared: false, removed: false };
    });
    this._preSettle();
  }

  /** Hidden warm-up so the player only ever sees a perfectly still tower; every reset reproduces the same settled state. */
  _preSettle() {
    for (let i = 0; i < 120 * 12 && !this.blocks.every(b => b.body.isSleeping()); i++) this.world.step();
    for (const b of this.blocks) { b.body.setLinvel({ x: 0, y: 0, z: 0 }, false); b.body.setAngvel({ x: 0, y: 0, z: 0 }, false); b.body.sleep(); }
    this.time = 0;
  }

  step() {
    this.world.step();
    this.time += CONFIG.fixedDt;
    for (const b of this.blocks) {
      if (b.removed) continue;
      const y = b.body.translation().y;
      if (!b.cleared && y < CONFIG.clearY) b.cleared = true;
      if (y < CONFIG.removeY) { this.world.removeRigidBody(b.body); b.removed = true; }
    }
  }

  get remaining() { return this.blocks.filter(b => !b.cleared).length; }

  /** A block whose centre is below the platform's top surface and beyond its edge is falling away and can no longer affect the tower. */
  _isOffPlatform(b) {
    const t = b.body.translation(), [w, , d] = this.plat.size, [cx, cz] = this.plat.center;
    return t.y < 0 && (Math.abs(t.x - cx) > w / 2 || Math.abs(t.z - cz) > d / 2);
  }

  /** True when all not-yet-cleared blocks are (nearly) motionless. */
  isAtRest() {
    const { linSpeed, angSpeed } = CONFIG.settle;
    for (const b of this.blocks) {
      if (b.cleared || b.removed || this._isOffPlatform(b)) continue;
      if (b.body.isSleeping()) continue;
      const v = b.body.linvel(), w = b.body.angvel();
      if (Math.hypot(v.x, v.y, v.z) > linSpeed || Math.hypot(w.x, w.y, w.z) > angSpeed) return false;
    }
    return true;
  }

  /** Apply the player's impulse at a world-space point (NOT the centre of mass). */
  applyImpulseAtPoint(block, point, dir, magnitude) {
    block.body.applyImpulseAtPoint({ x: dir.x * magnitude, y: dir.y * magnitude, z: dir.z * magnitude }, point, true);
  }
}
