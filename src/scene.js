// Rendering layer (Three.js): scene, fixed camera, lights, block meshes, picking. No physics logic.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { IMAGES } from './experiment.js';

export class SceneView {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.background);

    const c = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, 1, 0.1, 100);
    this.camera.position.set(...c.position);
    this.camera.lookAt(...c.target);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9da4, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-4, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 7, bottom: -4, near: 1, far: 30 });
    sun.shadow.radius = 4; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    this._buildPlatform();
    this.group = new THREE.Group();   // block meshes of the current tower
    this.scene.add(this.group);
    this.meshes = [];   // pickable mesh per block (for soft blocks: the deformable inner box)
    this.roots = [];    // object whose pose follows the body (== mesh)
    this._texCache = new Map();
    this.raycaster = new THREE.Raycaster();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** (Re)build the platform slab; `plat` = { size, center, color } (defaults to CONFIG.platform). */
  _buildPlatform(plat = CONFIG.platform) {
    if (this.platform) { this.scene.remove(this.platform); this.platform.geometry.dispose(); this.platform.material.dispose(); this.platform.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); }
    const [w, h, d] = plat.size;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: CONFIG.platform.color, roughness: 0.9 }));
    mesh.position.set(plat.center[0], -h / 2, plat.center[1]);
    mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x6f737c })));
    this.platform = mesh;
    this.scene.add(mesh);
  }
  setPlatform(plat) { this._buildPlatform(plat ?? CONFIG.platform); }

  /**
   * Upside-down presentation: the camera is rolled 180 degrees about its viewing axis. The physics world is untouched
   * (gravity, impulse, geometry identical); the screen shows exactly the original video rotated by 180 degrees
   * (platform at the top, blocks "falling" upward). Only ever changed when a tower is loaded.
   */
  setInverted(inverted) {
    this.camera.up.set(0, inverted ? -1 : 1, 0);
    this.camera.position.set(...CONFIG.camera.position);
    this.camera.lookAt(...CONFIG.camera.target);
    this.camera.updateMatrixWorld(true);
  }

  /** Canvas texture for one face: the block's colour cue as background with the natural image inset in the middle (never covering the whole face). */
  _faceTexture(img, colorHex, aspect) {
    const key = `${img.src}|${colorHex}|${aspect}`; if (this._texCache.has(key)) return this._texCache.get(key);
    const H = 256, W = Math.round(H * aspect), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#' + colorHex.toString(16).padStart(6, '0'); g.fillRect(0, 0, W, H);
    const s = Math.round(H * IMAGES.faceFraction); g.drawImage(img, (W - s) / 2, (H - s) / 2, s, s);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this._texCache.set(key, tex); return tex;
  }

  /** Hide/show the whole scene (tower and platform): the tower must not be visible behind the start cross. */
  setSceneVisible(on) { this.group.visible = on; this.platform.visible = on; }

  /** Create meshes for every block of a Simulation. `images` maps imageId -> loaded HTMLImageElement. */
  buildBlocks(sim, images) {
    this.clearBlocks();
    for (const b of sim.blocks) {
      const [sx, sy, sz] = b.size;
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const color = new THREE.Color(b.props.color);
      const plain = () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 });
      let mats;
      if (b.props.imageId) {   // BoxGeometry face order: +x, -x, +y, -y, +z, -z ; image on the four side faces, plain colour on top/bottom
        const img = images[b.props.imageId], hex = b.props.color;
        const side = new THREE.MeshStandardMaterial({ map: this._faceTexture(img, hex, sz / sy), roughness: 0.55 });
        const front = new THREE.MeshStandardMaterial({ map: this._faceTexture(img, hex, sx / sy), roughness: 0.55 });
        mats = [side, side, plain(), plain(), front, front];
      } else mats = plain();
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(0.28) })));
      mesh.userData.block = b;
      this.group.add(mesh); this.roots[b.id] = mesh;
      this.meshes[b.id] = mesh;
    }
    this.sync(sim);
  }

  clearBlocks() {
    for (const m of this.meshes) {
      m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
      m.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
    }
    this.group.clear(); this.meshes = []; this.roots = [];
  }

  /** Copy physics poses onto meshes. */
  sync(sim) {
    for (const b of sim.blocks) {
      const m = this.meshes[b.id], root = this.roots[b.id];
      if (b.removed) { root.visible = false; continue; }
      const t = b.body.translation(), q = b.body.rotation();
      root.position.set(t.x, t.y, t.z);
      root.quaternion.set(q.x, q.y, q.z, q.w);
    }
    this.group.updateMatrixWorld(true);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  /** Nearest visible block surface under a client-space pixel. Returns { block, localPoint, normal (face normal in the block frame) } or null if the
   *  platform/background is hit first; in that case `this.lastPlatformHit` holds the platform point under the ray (or null). */
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([this.platform, ...this.meshes.filter((m, i) => this.roots[i].visible)], false);
    this.lastPlatformHit = null;
    if (!hits.length) return null;
    if (!hits[0].object.userData.block) { this.lastPlatformHit = hits[0].point.clone(); return null; }
    const h = hits[0];
    return { block: h.object.userData.block, localPoint: h.object.worldToLocal(h.point.clone()), normal: h.face.normal.clone() };
  }

  worldPointOf(blockId, localPoint) { return this.meshes[blockId].localToWorld(localPoint.clone()); }

  /** Horizontal unit vector pointing from the camera into the scene (+ optional elevation). */
  pushDirection() {
    const t = new THREE.Vector3(...CONFIG.camera.target), p = this.camera.position;
    const d = new THREE.Vector3(t.x - p.x, 0, t.z - p.z).normalize();
    const e = THREE.MathUtils.degToRad(CONFIG.impulseElevationDeg);
    return new THREE.Vector3(d.x * Math.cos(e), Math.sin(e), d.z * Math.cos(e));
  }

  screenPointOf(world) {
    const v = world.clone().project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h, c = CONFIG.camera;
    this.camera.aspect = aspect;
    // keep the whole scene in view on narrow windows
    const minAspect = 1.5;
    this.camera.fov = aspect >= minAspect ? c.fov
      : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * minAspect / aspect));
    this.camera.updateProjectionMatrix();
  }
}
