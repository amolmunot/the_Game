import * as THREE from "three";
import type { GameState } from "../game/types";
import { createFighter, updateFighter, type FighterRig } from "./Fighter3D";

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

// Pre-allocated reusables
const _shake = new THREE.Vector3();

export class ThreeGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  playerRig: FighterRig;
  aiRig: FighterRig;
  private camX = 0;        // smooth x
  private camBase = new THREE.Vector3(0, 4.2, 12.5);
  private camTarget = new THREE.Vector3(0, 1.7, 0);
  private particles: Particle[] = [];
  private prevPlayerHp = 100;
  private prevAiHp = 100;

  constructor(canvas: HTMLCanvasElement) {
    const W = canvas.clientWidth || 900;
    const H = canvas.clientHeight || 500;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setSize(W, H, false);
    this.renderer.setPixelRatio(1);               // always 1 — biggest single perf win
    this.renderer.shadowMap.enabled = false;       // no shadows
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x7ab8d4);

    this.scene = new THREE.Scene();
    // No fog — removes per-pixel cost

    this.camera = new THREE.PerspectiveCamera(54, W / H, 0.1, 80);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camTarget);

    this.setupLights();
    this.createArena();

    this.playerRig = createFighter(true);
    this.playerRig.root.position.set(-2.3, 0.22, 0);
    this.scene.add(this.playerRig.root);

    this.aiRig = createFighter(false);
    this.aiRig.root.position.set(2.3, 0.22, 0);
    this.scene.add(this.aiRig.root);
  }

  private setupLights() {
    // Two lights only — no shadows
    this.scene.add(new THREE.AmbientLight(0x5a6575, 1.3));

    const sun = new THREE.DirectionalLight(0xfff8e0, 1.8);
    sun.position.set(5, 12, 8);
    sun.castShadow = false;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8899cc, 0.45);
    fill.position.set(-8, 4, -3);
    this.scene.add(fill);
  }

  private createArena() {
    // MeshBasicMaterial for static scene objects (no lighting cost)
    const bmat = (c: number) => new THREE.MeshBasicMaterial({ color: c });
    const fmat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), bmat(0x3d6b35));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Ring platform (low-poly, 6 sides)
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 8.1, 0.3, 6, 1), bmat(0xd4ccb8));
    platform.position.y = 0.15;
    this.scene.add(platform);

    // Stone path
    const path = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 5.5, 1, 1, 1), bmat(0xb0a898));
    path.position.y = 0.03;
    this.scene.add(path);

    // Corner posts (boxes, fast)
    const postMat = bmat(0x55443a);
    const padMat  = bmat(0xcc2211);
    const corners: [number, number][] = [[-5.8, -5.8], [5.8, -5.8], [-5.8, 5.8], [5.8, 5.8]];
    for (const [x, z] of corners) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 0.25, 1, 1, 1), postMat);
      post.position.set(x, 2.0, z);
      this.scene.add(post);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4, 1, 1, 1), padMat);
      pad.position.set(x, 2.8, z);
      this.scene.add(pad);
    }

    // Ropes — 3 heights, only front+back sides (4 ropes × 3 = 12 total, simple boxes)
    const ropeCols = [0xcc3333, 0xddaa22, 0xffffff];
    for (let i = 0; i < 3; i++) {
      const y = 0.85 + i * 0.56;
      const rm = bmat(ropeCols[i]);
      const rLen = 11.6;
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(rLen, 0.08, 0.08, 1, 1, 1), rm);
      r1.position.set(0, y, -5.8); this.scene.add(r1);
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(rLen, 0.08, 0.08, 1, 1, 1), rm);
      r2.position.set(0, y,  5.8); this.scene.add(r2);
      const r3 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, rLen, 1, 1, 1), rm);
      r3.position.set(-5.8, y, 0); this.scene.add(r3);
      const r4 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, rLen, 1, 1, 1), rm);
      r4.position.set( 5.8, y, 0); this.scene.add(r4);
    }

    // Mountains (5, MeshBasicMaterial — no lighting)
    const mData: [number, number, number, number][] = [
      [-22, 8,  -16, 0x6B8EAD],
      [ 22, 10, -15, 0x5a7a9a],
      [  0, 6,  -20, 0x7a9eb5],
      [-12, 9,  -18, 0x4a6a85],
      [ 14, 7,  -17, 0x6B8EAD],
    ];
    for (const [x, h, z, col] of mData) {
      const mt = new THREE.Mesh(new THREE.ConeGeometry(h * 0.7, h, 4, 1), bmat(col));
      mt.position.set(x, h * 0.38, z);
      mt.rotation.y = x * 0.3;
      this.scene.add(mt);
    }

    // Trees (4: two cherry blossom, two green) — using simple cones + box
    const treeSets: [number, number, boolean][] = [
      [-11, -8, true], [11, -8, true], [-12, 5, false], [12, 5, false]
    ];
    for (const [x, z, pink] of treeSets) {
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.3, 1, 1, 1), bmat(0x5C3317));
      trunk.position.set(x, 0.9, z);
      this.scene.add(trunk);
      const col = pink ? 0xffb6c1 : 0x3d7a3d;
      const f1 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.5, 5, 1), fmat(col));
      f1.position.set(x, 2.6, z);
      this.scene.add(f1);
      const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 5, 1), fmat(col));
      f2.position.set(x, 3.7, z);
      this.scene.add(f2);
    }

    // Simple torii gate (just 3 boxes)
    const torii = bmat(0xcc3311);
    this.scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4, 1,1,1), torii), { position: new THREE.Vector3(-2, 2.5, -20) }));
    this.scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4, 1,1,1), torii), { position: new THREE.Vector3( 2, 2.5, -20) }));
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.38, 0.42, 1,1,1), torii);
    topBar.position.set(0, 5.2, -20);
    this.scene.add(topBar);
  }

  spawnHitParticles(worldX: number, worldZ: number, isPlayerHit: boolean) {
    const color = isPlayerHit ? 0xff4400 : 0x44aaff;
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.08, 0);
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? color : 0xffdd00 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(worldX, 1.5 + Math.random() * 0.4, worldZ);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.16,
          0.05 + Math.random() * 0.12,
          (Math.random() - 0.5) * 0.12
        ),
        life: 400 + Math.random() * 300,
        maxLife: 700,
      });
    }
  }

  private tickParticles(dt: number) {
    let i = this.particles.length;
    while (i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 0.00035 * dt;
      p.mesh.position.addScaledVector(p.vel, dt * 0.06);
      p.mesh.rotation.x += 0.05;
    }
  }

  update(state: GameState, dt: number) {
    const { player, ai } = state;

    updateFighter(this.playerRig, player.state, dt, player.hitFlash);
    updateFighter(this.aiRig, ai.state, dt, ai.hitFlash);

    // Hit particle burst when HP drops
    if (player.hp < this.prevPlayerHp && player.hp > 0) this.spawnHitParticles(-2.3, 0, true);
    if (ai.hp < this.prevAiHp    && ai.hp > 0)    this.spawnHitParticles(2.3, 0, false);
    this.prevPlayerHp = player.hp;
    this.prevAiHp = ai.hp;

    // Dodge Z offsets
    const pZ = player.state === "DODGING_LEFT" ? 1.4 : player.state === "DODGING_RIGHT" ? -1.4 : 0;
    this.playerRig.root.position.z += (pZ - this.playerRig.root.position.z) * 0.12;
    const aZ = ai.state === "DODGING_LEFT" ? -1.4 : ai.state === "DODGING_RIGHT" ? 1.4 : 0;
    this.aiRig.root.position.z += (aZ - this.aiRig.root.position.z) * 0.12;

    // Smooth camera X drift
    this.camX += (0 - this.camX) * 0.05;
    const camPos = this.camBase.clone();
    camPos.x = this.camX;

    // Camera shake: smooth sine wave — NOT random (avoids 60Hz jitter)
    if (state.screenShake > 0) {
      const now = performance.now() * 0.001;
      const amt = Math.min(state.screenShake, 8) * 0.004; // capped + reduced
      _shake.set(
        Math.sin(now * 38) * amt,
        Math.cos(now * 29) * amt * 0.6,
        0
      );
      this.camera.position.copy(camPos).add(_shake);
    } else {
      this.camera.position.copy(camPos);
    }
    this.camera.lookAt(this.camTarget);

    this.tickParticles(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.dispose();
  }
}
