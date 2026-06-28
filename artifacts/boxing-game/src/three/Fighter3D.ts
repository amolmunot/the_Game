import * as THREE from "three";
import type { FighterState } from "../game/types";

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface JointSet {
  rootY: number; rootZ: number; tiltZ: number; tiltX: number;
  la: THREE.Vector3; lk: THREE.Vector3; lh: THREE.Vector3;
  ra: THREE.Vector3; rk: THREE.Vector3; rh: THREE.Vector3;
  hc: THREE.Vector3; nb: THREE.Vector3; ht: THREE.Vector3;
  ls: THREE.Vector3; le: THREE.Vector3; lw: THREE.Vector3;
  rs: THREE.Vector3; re: THREE.Vector3; rw: THREE.Vector3;
}

const G: JointSet = {
  rootY: 0, rootZ: 0, tiltZ: 0.05, tiltX: -0.08,
  la: V3(-0.03, 0.12, -0.16), lk: V3(-0.05, 0.58, -0.14), lh: V3(-0.02, 1.07, -0.15),
  ra: V3(-0.01, 0.12,  0.16), rk: V3(-0.04, 0.56,  0.15), rh: V3(-0.02, 1.06,  0.15),
  hc: V3(-0.02, 1.065, 0.00),
  nb: V3( 0.04, 1.60, 0.00), ht: V3(0.04, 1.91, 0.00),
  ls: V3( 0.02, 1.58, -0.36), le: V3(0.06, 1.25, -0.35), lw: V3(0.24, 1.64, -0.28),
  rs: V3( 0.02, 1.58,  0.36), re: V3(0.04, 1.23,  0.35), rw: V3(0.20, 1.61,  0.30),
};

const POSES: Record<FighterState, JointSet> = {
  IDLE: G,
  JABBING: {
    ...G, tiltX: -0.14,
    ls: V3(0.04, 1.55, -0.33), le: V3(0.42, 1.53, -0.27), lw: V3(0.84, 1.51, -0.19),
    nb: V3(0.10, 1.58, 0.00),  ht: V3(0.10, 1.89, 0.00),
  },
  CROSSING: {
    ...G, tiltX: -0.15, tiltZ: -0.07,
    rs: V3(0.07, 1.52, 0.26), re: V3(0.46, 1.48, 0.18), rw: V3(0.90, 1.44, 0.10),
    nb: V3(0.13, 1.56, -0.04), ht: V3(0.13, 1.87, -0.04), hc: V3(0.01, 1.06, 0.04),
    ls: V3(-0.01, 1.60, -0.36), le: V3(0.06, 1.27, -0.34), lw: V3(0.22, 1.64, -0.28),
  },
  BLOCKING: {
    ...G,
    ls: V3(0.04, 1.63, -0.34), le: V3(0.28, 1.66, -0.29), lw: V3(0.56, 1.72, -0.21),
    rs: V3(0.04, 1.63,  0.34), re: V3(0.26, 1.66,  0.29), rw: V3(0.52, 1.72,  0.23),
    nb: V3(0.02, 1.63, 0.00),  ht: V3(0.02, 1.95, 0.00),
  },
  DODGING_LEFT:  { ...G, rootZ: -0.42, tiltZ:  0.22 },
  DODGING_RIGHT: { ...G, rootZ:  0.42, tiltZ: -0.22 },
  HIT: {
    ...G, tiltX: 0.12,
    nb: V3(-0.10, 1.56, 0.00), ht: V3(-0.10, 1.87, 0.00), hc: V3(-0.06, 1.06, 0.00),
    lw: V3(0.04, 1.50, -0.33), rw: V3(0.02, 1.48, 0.34),
  },
  KO: G,
};

export interface FighterRig {
  root: THREE.Group;
  body: THREE.Group;
  allMeshes: THREE.Mesh[];
  meshes: {
    leftUpperArm: THREE.Mesh; leftForearm: THREE.Mesh; leftGlove: THREE.Mesh;
    rightUpperArm: THREE.Mesh; rightForearm: THREE.Mesh; rightGlove: THREE.Mesh;
    leftUpperLeg: THREE.Mesh; leftLowerLeg: THREE.Mesh; leftFoot: THREE.Mesh;
    rightUpperLeg: THREE.Mesh; rightLowerLeg: THREE.Mesh; rightFoot: THREE.Mesh;
    torso: THREE.Mesh; chest: THREE.Mesh; head: THREE.Mesh;
  };
  joints: JointSet;       // current (mutable, deep-cloned)
  targetJoints: JointSet; // target  (mutable, deep-cloned)
  isPlayer: boolean;
  koAngle: number;
  t: number;
}

// ── pre-allocated reusables (zero alloc per frame) ──────────────────
const _dir  = new THREE.Vector3();
const _mid  = new THREE.Vector3();
const _yUp  = new THREE.Vector3(0, 1, 0);
const _tp1  = new THREE.Vector3();

function orientSeg(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 0.001) return;
  _mid.addVectors(a, b).multiplyScalar(0.5);
  m.position.copy(_mid);
  m.quaternion.setFromUnitVectors(_yUp, _dir.normalize());
  m.scale.y = len;
}

function deepClone(j: JointSet): JointSet {
  return {
    rootY: j.rootY, rootZ: j.rootZ, tiltZ: j.tiltZ, tiltX: j.tiltX,
    la: j.la.clone(), lk: j.lk.clone(), lh: j.lh.clone(),
    ra: j.ra.clone(), rk: j.rk.clone(), rh: j.rh.clone(),
    hc: j.hc.clone(), nb: j.nb.clone(), ht: j.ht.clone(),
    ls: j.ls.clone(), le: j.le.clone(), lw: j.lw.clone(),
    rs: j.rs.clone(), re: j.re.clone(), rw: j.rw.clone(),
  };
}

function copyPoseToTarget(src: JointSet, dst: JointSet, bobY: number, swayZ: number) {
  dst.rootY = src.rootY + bobY;
  dst.rootZ = src.rootZ;
  dst.tiltZ = src.tiltZ + swayZ;
  dst.tiltX = src.tiltX;
  dst.la.copy(src.la); dst.lk.copy(src.lk); dst.lh.copy(src.lh);
  dst.ra.copy(src.ra); dst.rk.copy(src.rk); dst.rh.copy(src.rh);
  dst.hc.copy(src.hc); dst.nb.copy(src.nb); dst.ht.copy(src.ht);
  dst.ls.copy(src.ls); dst.le.copy(src.le); dst.lw.copy(src.lw);
  dst.rs.copy(src.rs); dst.re.copy(src.re); dst.rw.copy(src.rw);
}

function lerpJInPlace(cur: JointSet, tgt: JointSet, t: number) {
  cur.rootY += (tgt.rootY - cur.rootY) * t;
  cur.rootZ += (tgt.rootZ - cur.rootZ) * t;
  cur.tiltZ += (tgt.tiltZ - cur.tiltZ) * t;
  cur.tiltX += (tgt.tiltX - cur.tiltX) * t;
  cur.la.lerp(tgt.la, t); cur.lk.lerp(tgt.lk, t); cur.lh.lerp(tgt.lh, t);
  cur.ra.lerp(tgt.ra, t); cur.rk.lerp(tgt.rk, t); cur.rh.lerp(tgt.rh, t);
  cur.hc.lerp(tgt.hc, t); cur.nb.lerp(tgt.nb, t); cur.ht.lerp(tgt.ht, t);
  cur.ls.lerp(tgt.ls, t); cur.le.lerp(tgt.le, t); cur.lw.lerp(tgt.lw, t);
  cur.rs.lerp(tgt.rs, t); cur.re.lerp(tgt.re, t); cur.rw.lerp(tgt.rw, t);
}

function flatMat(c: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: c, flatShading: true });
}

export function createFighter(isPlayer: boolean): FighterRig {
  const skin      = flatMat(0xd4956e);
  const shorts    = flatMat(isPlayer ? 0x1a3cc4 : 0x8B0000);
  const gloves    = flatMat(isPlayer ? 0xcc2211 : 0x2233cc);
  const shoes     = flatMat(isPlayer ? 0x991100 : 0x110099);
  const accentMat = flatMat(isPlayer ? 0xff6644 : 0x4466ff);
  const hairMat   = flatMat(isPlayer ? 0x1a1a1a : 0x222200);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const allMeshes: THREE.Mesh[] = [];

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    body.add(m);
    allMeshes.push(m);
    return m;
  };

  // Unit-height cylinders: scale.y is set per-frame by orientSeg
  const cyl = (r: number, segs = 5): THREE.Mesh =>
    add(new THREE.CylinderGeometry(r * 0.85, r, 1, segs, 1), skin);
  const box = (w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh =>
    add(new THREE.BoxGeometry(w, h, d, 1, 1, 1), mat);

  const meshes = {
    leftUpperArm:  cyl(0.095), leftForearm:   cyl(0.085), leftGlove:  box(0.22, 0.20, 0.20, gloves),
    rightUpperArm: cyl(0.095), rightForearm:  cyl(0.085), rightGlove: box(0.22, 0.20, 0.20, gloves),
    leftUpperLeg:  cyl(0.138, 5), leftLowerLeg: cyl(0.115, 5), leftFoot:  box(0.32, 0.14, 0.20, shoes),
    rightUpperLeg: cyl(0.138, 5), rightLowerLeg: cyl(0.115, 5), rightFoot: box(0.32, 0.14, 0.20, shoes),
    torso: box(0.58, 0.52, 0.42, shorts),
    chest: box(0.68, 0.46, 0.44, skin),
    head:  box(0.38, 0.36, 0.34, skin),
  };

  // Decorative extras (indexed 15+)
  add(new THREE.BoxGeometry(0.40, 0.10, 0.36, 1, 1, 1), hairMat);   // [15] hair
  add(new THREE.BoxGeometry(0.60, 0.08, 0.44, 1, 1, 1), accentMat); // [16] waistband

  if (!isPlayer) root.rotation.y = Math.PI;

  return {
    root, body, allMeshes, meshes,
    joints: deepClone(G),
    targetJoints: deepClone(G),
    isPlayer, koAngle: 0, t: 0,
  };
}

function applyPose(rig: FighterRig, j: JointSet) {
  const { body, meshes: m, allMeshes } = rig;

  body.position.y = j.rootY;
  body.position.z = j.rootZ;
  body.rotation.z = j.tiltZ;
  body.rotation.x = j.tiltX;

  orientSeg(m.leftUpperArm,  j.ls, j.le);
  orientSeg(m.leftForearm,   j.le, j.lw);
  orientSeg(m.rightUpperArm, j.rs, j.re);
  orientSeg(m.rightForearm,  j.re, j.rw);
  orientSeg(m.leftUpperLeg,  j.lh, j.lk);
  orientSeg(m.leftLowerLeg,  j.lk, j.la);
  orientSeg(m.rightUpperLeg, j.rh, j.rk);
  orientSeg(m.rightLowerLeg, j.rk, j.ra);

  // Glove: just past wrist in punch direction
  _dir.subVectors(j.lw, j.le);
  if (_dir.length() > 0.01) {
    m.leftGlove.position.copy(j.lw).addScaledVector(_dir.normalize(), 0.06);
  } else {
    m.leftGlove.position.copy(j.lw);
  }
  _dir.subVectors(j.rw, j.re);
  if (_dir.length() > 0.01) {
    m.rightGlove.position.copy(j.rw).addScaledVector(_dir.normalize(), 0.06);
  } else {
    m.rightGlove.position.copy(j.rw);
  }

  // Feet on ground
  m.leftFoot.position.set(j.la.x - 0.03, 0.07, j.la.z);
  m.rightFoot.position.set(j.ra.x - 0.03, 0.07, j.ra.z);
  m.leftFoot.rotation.set(0, 0, 0);
  m.rightFoot.rotation.set(0, 0, 0);

  // Torso (shorts area) and chest
  _tp1.lerpVectors(j.hc, j.nb, 0.28);
  m.torso.position.copy(_tp1);
  _tp1.lerpVectors(j.hc, j.nb, 0.76);
  m.chest.position.copy(_tp1);

  // Head: midpoint of neck-base to head-top
  m.head.position.lerpVectors(j.nb, j.ht, 0.5);

  // Hair (index 15)
  const hair = allMeshes[15];
  if (hair) hair.position.set(m.head.position.x, m.head.position.y + 0.16, m.head.position.z);
  // Waistband (index 16)
  const belt = allMeshes[16];
  if (belt) belt.position.set(m.torso.position.x, j.hc.y + 0.28, m.torso.position.z);
}

export function updateFighter(
  rig: FighterRig,
  state: FighterState,
  dt: number,
  hitFlash: number
) {
  rig.t += dt * 0.0015;
  const bob   = Math.sin(rig.t * 2.2) * 0.02 + Math.sin(rig.t * 3.6) * 0.008;
  const sway  = Math.sin(rig.t * 1.1) * 0.012;

  // Build target in-place (zero allocation)
  const base = POSES[state] ?? G;
  copyPoseToTarget(base, rig.targetJoints, bob, sway);

  // Lerp current toward target (zero allocation)
  const isPunch = state === "JABBING" || state === "CROSSING";
  const speed   = isPunch ? 0.30 : 0.14;
  const frames  = dt / (1000 / 60);
  const t       = Math.min(1, 1 - Math.pow(1 - speed, frames));
  lerpJInPlace(rig.joints, rig.targetJoints, t);

  // KO fall
  if (state === "KO") {
    rig.koAngle = Math.min(Math.PI * 0.44, rig.koAngle + dt * 0.003);
    rig.root.rotation.z = rig.isPlayer ? rig.koAngle : -rig.koAngle;
    rig.root.position.y = -Math.sin(rig.koAngle) * 0.38;
  } else if (rig.koAngle > 0) {
    rig.koAngle *= 0.95;
    if (rig.koAngle < 0.01) { rig.koAngle = 0; rig.root.rotation.z = 0; rig.root.position.y = 0; }
  }

  // Hit flash: only update when value changes
  const shouldFlash = hitFlash > 0 && hitFlash % 2 === 0;
  const emissiveHex = shouldFlash ? 0x550000 : 0x000000;
  for (const mesh of rig.allMeshes) {
    const mat = mesh.material as THREE.MeshLambertMaterial;
    if (mat.emissive && mat.emissive.getHex() !== emissiveHex) {
      mat.emissive.setHex(emissiveHex);
    }
  }

  applyPose(rig, rig.joints);
}
