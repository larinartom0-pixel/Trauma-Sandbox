import * as THREE from 'three';
import { GoreDollRig } from './models';
import { LimbId } from './types';
import { WallCollider } from './world';

// ============================================================================
// 1. PROCEDURAL CHARACTER ANIMATION (11-Joint Skeletal Kinematics)
// ============================================================================

export interface ProceduralAnimState {
  walkPhase: number;
  idlePhase: number;
  hipsY: number;
  hipsPitch: number;
  hipsRoll: number;
  hipsYaw: number;
  spinePitch: number;
  spineYaw: number;
  spineRoll: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  lArmPitch: number;
  lArmYaw: number;
  lArmRoll: number;
  lElbowPitch: number;
  rArmPitch: number;
  rArmYaw: number;
  rArmRoll: number;
  rElbowPitch: number;
  lLegPitch: number;
  lLegRoll: number;
  lKneePitch: number;
  rLegPitch: number;
  rLegRoll: number;
  rKneePitch: number;
}

export interface ProceduralPoseInput {
  dt: number;
  moveSpeed: number;
  crouchFactor: number;
  aiming: boolean;
  crawling: boolean;
  surrendering: boolean;
  healing: boolean;
  reloading: boolean;
  woundedFrac: number;
  legInjured: boolean;
  recoilPulse: number;
  flinchPitch: number;
  flinchRoll: number;
  twoHandedWeapon: boolean;
  infected?: boolean;
}

export function createProceduralAnimState(): ProceduralAnimState {
  return {
    walkPhase: Math.random() * Math.PI * 2,
    idlePhase: Math.random() * Math.PI * 2,
    hipsY: 0.9,
    hipsPitch: 0,
    hipsRoll: 0,
    hipsYaw: 0,
    spinePitch: 0,
    spineYaw: 0,
    spineRoll: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    lArmPitch: 0,
    lArmYaw: 0,
    lArmRoll: 0.06,
    lElbowPitch: -0.28,
    rArmPitch: 0,
    rArmYaw: 0,
    rArmRoll: -0.06,
    rElbowPitch: -0.32,
    lLegPitch: 0,
    lLegRoll: 0,
    lKneePitch: 0.06,
    rLegPitch: 0,
    rLegRoll: 0,
    rKneePitch: 0.06,
  };
}

export function resetGoreDollPose(rig: GoreDollRig) {
  const j = rig.joints;
  j.hips.position.set(0, 0.9, 0);
  j.hips.quaternion.identity();
  j.spine.position.set(0, 0.11, 0);
  j.spine.quaternion.identity();
  j.head.position.set(0, 0.47, 0);
  j.head.quaternion.identity();
  j.leftArm.position.set(-0.27, 0.35, 0);
  j.leftArm.quaternion.identity();
  j.leftElbow.position.set(0, -0.28, 0);
  j.leftElbow.quaternion.identity();
  j.rightArm.position.set(0.27, 0.35, 0);
  j.rightArm.quaternion.identity();
  j.rightElbow.position.set(0, -0.28, 0);
  j.rightElbow.quaternion.identity();
  j.leftLeg.position.set(-0.115, -0.05, 0);
  j.leftLeg.quaternion.identity();
  j.leftKnee.position.set(0, -0.38, 0);
  j.leftKnee.quaternion.identity();
  j.rightLeg.position.set(0.115, -0.05, 0);
  j.rightLeg.quaternion.identity();
  j.rightKnee.position.set(0, -0.38, 0);
  j.rightKnee.quaternion.identity();
}

export function stepProceduralCharacterAnim(
  rig: GoreDollRig,
  s: ProceduralAnimState,
  inp: ProceduralPoseInput,
) {
  const dt = Math.min(0.05, Math.max(0.001, inp.dt));
  const speedNorm = Math.min(1.4, inp.moveSpeed / 3.1);
  const isMoving = inp.moveSpeed > 0.15;

  s.idlePhase = (s.idlePhase + dt * (1.8 + inp.woundedFrac * 1.1)) % (Math.PI * 200);
  if (isMoving) {
    const freq = inp.crawling ? 4.8 : 4.2 + speedNorm * 4.9;
    s.walkPhase = (s.walkPhase + dt * freq) % (Math.PI * 200);
  }

  const breath = Math.sin(s.idlePhase);
  const idleSway = Math.sin(s.idlePhase * 0.55);
  const wSin = Math.sin(s.walkPhase);
  const wCos = Math.cos(s.walkPhase);
  const doubleStep = Math.abs(wSin);

  // Target joint angles (Three.js right-handed +X/+Y/+Z: negative X pitches limb forward/up, positive X bends knee backward)
  let tHipsY = 0.9;
  let tHipsPitch = 0;
  let tHipsRoll = 0;
  let tHipsYaw = 0;

  let tSpinePitch = breath * 0.025 + inp.woundedFrac * 0.18;
  let tSpineYaw = idleSway * 0.035;
  let tSpineRoll = 0;

  let tHeadPitch = -breath * 0.02 + inp.woundedFrac * 0.08;
  let tHeadYaw = Math.sin(s.idlePhase * 0.42) * 0.14;
  let tHeadRoll = Math.sin(s.idlePhase * 0.35) * 0.04;

  let tLArmPitch = -0.05;
  let tLArmYaw = 0;
  let tLArmRoll = 0.07;
  let tLElbowPitch = -0.26 - breath * 0.04;

  let tRArmPitch = -0.06;
  let tRArmYaw = 0;
  let tRArmRoll = -0.07;
  let tRElbowPitch = -0.3 - breath * 0.04;

  let tLLegPitch = 0;
  let tLLegRoll = 0.02;
  let tLKneePitch = 0.05;

  let tRLegPitch = 0;
  let tRLegRoll = -0.02;
  let tRKneePitch = 0.05;

  if (inp.crawling) {
    // Realistic prone belly-crawl with elbow drag and bending knees
    tHipsY = 0.25 + (isMoving ? Math.abs(wCos) * 0.03 : 0);
    tHipsPitch = 1.28;
    tHipsRoll = isMoving ? wSin * 0.12 : 0;
    tHipsYaw = isMoving ? wCos * 0.14 : 0;

    tSpinePitch = -0.18;
    tSpineYaw = isMoving ? -wSin * 0.18 : 0;
    tHeadPitch = -0.82 + breath * 0.04;
    tHeadYaw = isMoving ? wSin * 0.12 : idleSway * 0.2;

    if (isMoving) {
      tLArmPitch = -1.75 + wSin * 0.48;
      tLElbowPitch = -1.05 - Math.max(0, wCos) * 0.45;
      tRArmPitch = -1.75 - wSin * 0.48;
      tRElbowPitch = -1.05 - Math.max(0, -wCos) * 0.45;

      tLLegPitch = -0.25 - Math.max(0, -wSin) * 0.55;
      tLKneePitch = 0.45 + Math.max(0, -wSin) * 0.95;
      tRLegPitch = -0.25 - Math.max(0, wSin) * 0.55;
      tRKneePitch = 0.45 + Math.max(0, wSin) * 0.95;
    } else {
      tLArmPitch = -1.65;
      tLElbowPitch = -1.15;
      tRArmPitch = -1.65;
      tRElbowPitch = -1.15;
      tLKneePitch = 0.35;
      tRKneePitch = 0.35;
    }
  } else {
    // Upright / Crouched Gait & Upper Body Stances
    const crouch = inp.crouchFactor;

    if (isMoving) {
      const limpAsym = inp.legInjured ? 0.52 : 1.0 - inp.woundedFrac * 0.18;
      const strideAmp = (0.44 + speedNorm * 0.24) * (1 - crouch * 0.25);

      // Left leg forward when wSin > 0; right leg forward when wSin < 0
      const lSwing = Math.max(0, wSin);
      const rSwing = Math.max(0, -wSin);
      const lPush = Math.max(0, -wCos);
      const rPush = Math.max(0, wCos);

      tLLegPitch = -wSin * strideAmp - crouch * 0.85;
      tRLegPitch = wSin * strideAmp * limpAsym - crouch * 0.85;

      // Knee bends during swing clearance + push-off, straightens gently on heel strike
      tLKneePitch = 0.14 + lSwing * 0.88 + lPush * 0.38 + crouch * 1.48;
      tRKneePitch =
        0.14 + (rSwing * 0.88 + rPush * 0.38) * limpAsym + crouch * 1.48;

      // Pelvis bob, roll, and counter-yaw
      tHipsY =
        0.9 -
        crouch * 0.28 +
        (doubleStep - 0.5) * 0.045 * Math.min(1, speedNorm) -
        (inp.legInjured ? Math.max(0, -wSin) * 0.055 : 0);
      tHipsRoll = wSin * (0.045 + (inp.legInjured ? 0.065 : 0));
      tHipsYaw = wSin * 0.08 * Math.min(1, speedNorm);

      // Torso leans forward into stride & counter-rotates shoulders
      tSpinePitch += 0.07 * speedNorm + crouch * 0.24;
      tSpineYaw -= wSin * 0.11 * Math.min(1, speedNorm);
      tSpineRoll = -wSin * 0.035;

      // Head stabilizes horizon
      tHeadPitch -= 0.05 * speedNorm + crouch * 0.18;

      // Natural arm swing when not aiming/healing/reloading/surrendering
      tLArmPitch = wSin * strideAmp * 0.72;
      tLElbowPitch = -0.34 - Math.max(0, wSin) * 0.48;
      tRArmPitch = -wSin * strideAmp * 0.72;
      tRElbowPitch = -0.34 - Math.max(0, -wSin) * 0.48;
    } else if (crouch > 0.05) {
      tHipsY = 0.9 - crouch * 0.3;
      tLLegPitch = -crouch * 0.86;
      tRLegPitch = -crouch * 0.86;
      tLKneePitch = 0.12 + crouch * 1.5;
      tRKneePitch = 0.12 + crouch * 1.5;
      tSpinePitch += crouch * 0.22;
      tHeadPitch -= crouch * 0.16;
    } else {
      // Subtle weight-shift stance while standing idle
      tHipsRoll = idleSway * 0.025;
      tLLegRoll = 0.04 + idleSway * 0.015;
      tRLegRoll = -0.04 + idleSway * 0.015;
      tLKneePitch = 0.08 + Math.max(0, idleSway) * 0.06;
      tRKneePitch = 0.08 + Math.max(0, -idleSway) * 0.06;
    }

    // Upper-body behavioral overrides
    if (inp.surrendering) {
      tLArmPitch = -2.42 + breath * 0.05;
      tLArmRoll = 0.32;
      tLElbowPitch = -0.58;
      tRArmPitch = -2.42 + breath * 0.05;
      tRArmRoll = -0.32;
      tRElbowPitch = -0.58;
      tHeadYaw = Math.sin(s.idlePhase * 1.35) * 0.32;
      tSpinePitch = Math.max(tSpinePitch, 0.08);
    } else if (inp.healing) {
      const wrap = Math.sin(s.idlePhase * 4.2) * 0.24;
      tSpinePitch += 0.22;
      tHeadPitch += 0.28;
      tLArmPitch = -1.05 + wrap;
      tLArmYaw = 0.38;
      tLElbowPitch = -1.25 - wrap * 0.5;
      tRArmPitch = -1.08 - wrap;
      tRArmYaw = -0.38;
      tRElbowPitch = -1.25 + wrap * 0.5;
    } else if (inp.reloading) {
      const magPump = Math.sin(s.idlePhase * 5.2);
      tSpineYaw -= 0.14;
      tHeadPitch += 0.16;
      tRArmPitch = -0.95;
      tRArmYaw = -0.22;
      tRElbowPitch = -0.82;
      tLArmPitch = -0.88 + magPump * 0.18;
      tLArmYaw = 0.42;
      tLElbowPitch = -1.25 + magPump * 0.32;
    } else if (inp.infected && inp.aiming) {
      // Infected lunge / clawing posture
      const claw = Math.sin(s.idlePhase * 3.4) * 0.18;
      tSpinePitch += 0.28;
      tHeadRoll = Math.sin(s.idlePhase * 1.7) * 0.22;
      tLArmPitch = -1.25 + claw;
      tLElbowPitch = -0.68;
      tRArmPitch = -1.25 - claw;
      tRElbowPitch = -0.68;
    } else if (inp.aiming) {
      // Tactical weapon aim (two-handed rifle grip vs pistol/melee guard)
      tSpineYaw -= 0.18;
      tHeadYaw = 0.14;
      tRArmPitch = -1.36;
      tRArmYaw = -0.06;
      tRArmRoll = -0.05;
      tRElbowPitch = -0.24;
      if (inp.twoHandedWeapon) {
        tLArmPitch = -1.14;
        tLArmYaw = 0.44;
        tLArmRoll = 0.08;
        tLElbowPitch = -0.88;
      } else {
        tLArmPitch = -0.78;
        tLArmYaw = 0.28;
        tLElbowPitch = -1.08;
      }
    } else if (inp.woundedFrac > 0.35) {
      // Wounded arm clutching ribs/torso while staggering
      tLArmPitch = -0.76;
      tLArmYaw = 0.46;
      tLElbowPitch = -1.32;
    }
  }

  // Weapon recoil kickback & bullet hit flinch
  if (inp.recoilPulse > 0.005) {
    tRArmPitch -= inp.recoilPulse * 0.32;
    tRElbowPitch -= inp.recoilPulse * 0.24;
    if (inp.twoHandedWeapon) {
      tLArmPitch -= inp.recoilPulse * 0.22;
    }
    tSpinePitch -= inp.recoilPulse * 0.12;
    tHeadPitch -= inp.recoilPulse * 0.08;
  }
  tSpinePitch += inp.flinchPitch;
  tSpineRoll += inp.flinchRoll;
  tHeadPitch += inp.flinchPitch * 0.85;
  tHeadRoll += inp.flinchRoll * 0.9;

  // Exponential damping for silky transitions across every joint
  const k = 12.5;
  const kFast = 22;
  s.hipsY = THREE.MathUtils.damp(s.hipsY, tHipsY, k, dt);
  s.hipsPitch = THREE.MathUtils.damp(s.hipsPitch, tHipsPitch, k, dt);
  s.hipsRoll = THREE.MathUtils.damp(s.hipsRoll, tHipsRoll, k, dt);
  s.hipsYaw = THREE.MathUtils.damp(s.hipsYaw, tHipsYaw, k, dt);

  s.spinePitch = THREE.MathUtils.damp(s.spinePitch, tSpinePitch, kFast, dt);
  s.spineYaw = THREE.MathUtils.damp(s.spineYaw, tSpineYaw, k, dt);
  s.spineRoll = THREE.MathUtils.damp(s.spineRoll, tSpineRoll, kFast, dt);

  s.headPitch = THREE.MathUtils.damp(s.headPitch, tHeadPitch, k, dt);
  s.headYaw = THREE.MathUtils.damp(s.headYaw, tHeadYaw, k, dt);
  s.headRoll = THREE.MathUtils.damp(s.headRoll, tHeadRoll, k, dt);

  s.lArmPitch = THREE.MathUtils.damp(s.lArmPitch, tLArmPitch, k, dt);
  s.lArmYaw = THREE.MathUtils.damp(s.lArmYaw, tLArmYaw, k, dt);
  s.lArmRoll = THREE.MathUtils.damp(s.lArmRoll, tLArmRoll, k, dt);
  s.lElbowPitch = THREE.MathUtils.damp(s.lElbowPitch, tLElbowPitch, k, dt);

  s.rArmPitch = THREE.MathUtils.damp(s.rArmPitch, tRArmPitch, kFast, dt);
  s.rArmYaw = THREE.MathUtils.damp(s.rArmYaw, tRArmYaw, k, dt);
  s.rArmRoll = THREE.MathUtils.damp(s.rArmRoll, tRArmRoll, k, dt);
  s.rElbowPitch = THREE.MathUtils.damp(s.rElbowPitch, tRElbowPitch, kFast, dt);

  s.lLegPitch = THREE.MathUtils.damp(s.lLegPitch, tLLegPitch, k, dt);
  s.lLegRoll = THREE.MathUtils.damp(s.lLegRoll, tLLegRoll, k, dt);
  s.lKneePitch = THREE.MathUtils.damp(s.lKneePitch, tLKneePitch, k, dt);

  s.rLegPitch = THREE.MathUtils.damp(s.rLegPitch, tRLegPitch, k, dt);
  s.rLegRoll = THREE.MathUtils.damp(s.rLegRoll, tRLegRoll, k, dt);
  s.rKneePitch = THREE.MathUtils.damp(s.rKneePitch, tRKneePitch, k, dt);

  const j = rig.joints;
  j.hips.position.set(0, s.hipsY, 0);
  j.hips.rotation.set(s.hipsPitch, s.hipsYaw, s.hipsRoll);
  j.spine.position.set(0, 0.11, 0);
  j.spine.rotation.set(s.spinePitch, s.spineYaw, s.spineRoll);
  j.head.position.set(0, 0.47, 0);
  j.head.rotation.set(s.headPitch, s.headYaw, s.headRoll);

  j.leftArm.position.set(-0.27, 0.35, 0);
  j.leftArm.rotation.set(s.lArmPitch, s.lArmYaw, s.lArmRoll);
  j.leftElbow.position.set(0, -0.28, 0);
  j.leftElbow.rotation.set(s.lElbowPitch, 0, 0);

  j.rightArm.position.set(0.27, 0.35, 0);
  j.rightArm.rotation.set(s.rArmPitch, s.rArmYaw, s.rArmRoll);
  j.rightElbow.position.set(0, -0.28, 0);
  j.rightElbow.rotation.set(s.rElbowPitch, 0, 0);

  j.leftLeg.position.set(-0.115, -0.05, 0);
  j.leftLeg.rotation.set(s.lLegPitch, 0, s.lLegRoll);
  j.leftKnee.position.set(0, -0.38, 0);
  j.leftKnee.rotation.set(s.lKneePitch, 0, 0);

  j.rightLeg.position.set(0.115, -0.05, 0);
  j.rightLeg.rotation.set(s.rLegPitch, 0, s.rLegRoll);
  j.rightKnee.position.set(0, -0.38, 0);
  j.rightKnee.rotation.set(s.rKneePitch, 0, 0);
}

// ============================================================================
// 2. ARTICULATED 11-NODE RAGDOLL WITH ANTI-COLLAPSE JOINT LIMITS
// ============================================================================

export interface RagdollNode {
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  limbId: LimbId;
}

export interface RagdollState {
  // [0] pelvis, [1] chest, [2] head, [3] leftElbow, [4] leftHand,
  // [5] rightElbow, [6] rightHand, [7] leftKnee, [8] leftFoot, [9] rightKnee, [10] rightFoot
  nodes: RagdollNode[];
  rightAxis: THREE.Vector3;
  settledTime: number;
}

// Anatomical bone lengths matching GoreDollRig geometry
const LEN_PELVIS_CHEST = 0.46;
const LEN_CHEST_HEAD = 0.30;
const LEN_UPPER_ARM = 0.28;
const LEN_FOREARM = 0.29;
const LEN_THIGH = 0.38;
const LEN_SHIN = 0.42;

const _rdX = new THREE.Vector3();
const _rdY = new THREE.Vector3();
const _rdZ = new THREE.Vector3();
const _rdMat = new THREE.Matrix4();
const _rdDir = new THREE.Vector3();
const _rdMid = new THREE.Vector3();
const _rdShoulderL = new THREE.Vector3();
const _rdShoulderR = new THREE.Vector3();
const _rdHipL = new THREE.Vector3();
const _rdHipR = new THREE.Vector3();
const _qHipsWorld = new THREE.Quaternion();
const _qHipsInv = new THREE.Quaternion();
const _qSpineWorld = new THREE.Quaternion();
const _qSpineInv = new THREE.Quaternion();
const _qArmLWorld = new THREE.Quaternion();
const _qArmRWorld = new THREE.Quaternion();
const _qLegLWorld = new THREE.Quaternion();
const _qLegRWorld = new THREE.Quaternion();
const _qParentInv = new THREE.Quaternion();
const _qChildWorld = new THREE.Quaternion();
const _bX = new THREE.Vector3();
const _bY = new THREE.Vector3();
const _bZ = new THREE.Vector3();

function mkNode(
  limbId: LimbId,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
): RagdollNode {
  return {
    limbId,
    pos: new THREE.Vector3(x, y, z),
    prevPos: new THREE.Vector3(x - vx, y - vy, z - vz),
  };
}

export function createRagdollState(
  pos: THREE.Vector3,
  yaw: number,
  crouchFactor: number,
  impulse?: THREE.Vector3,
): RagdollState {
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const rightX = cosY;
  const rightZ = -sinY;
  const fwdX = sinY;
  const fwdZ = cosY;
  const crouchY = 0.26 * crouchFactor;

  const imp = impulse
    ? impulse.clone().clampLength(0, 9).multiplyScalar(0.026)
    : new THREE.Vector3(
        (Math.random() - 0.5) * 0.032,
        0.008,
        (Math.random() - 0.5) * 0.032,
      );

  // Give torso a natural topple angular velocity (backwards or sideways) so body falls over instead of crumpling straight down
  const toppleDirX = (imp.lengthSq() > 0.0002 ? imp.x * 1.4 : -fwdX * 0.032) + (Math.random() - 0.5) * 0.022;
  const toppleDirZ = (imp.lengthSq() > 0.0002 ? imp.z * 1.4 : -fwdZ * 0.032) + (Math.random() - 0.5) * 0.022;

  const bx = pos.x;
  const bz = pos.z;

  // Knees start slightly bent forward (+fwd) so legs buckle naturally
  const kneeFwd = 0.08 + crouchFactor * 0.14;
  const elbowBack = -0.06;

  const nodes: RagdollNode[] = [
    // [0] pelvis
    mkNode('torso', bx, 0.9 - crouchY, bz, imp.x * 0.55, imp.y * 0.25, imp.z * 0.55),
    // [1] chest (shoulder line)
    mkNode(
      'torso',
      bx,
      1.36 - crouchY,
      bz,
      imp.x * 1.05 + toppleDirX,
      imp.y * 0.45,
      imp.z * 1.05 + toppleDirZ,
    ),
    // [2] head
    mkNode(
      'head',
      bx,
      1.66 - crouchY,
      bz,
      imp.x * 1.28 + toppleDirX * 1.35,
      imp.y * 0.6,
      imp.z * 1.28 + toppleDirZ * 1.35,
    ),
    // [3] leftElbow
    mkNode(
      'leftArm',
      bx - rightX * 0.30 + fwdX * elbowBack,
      1.08 - crouchY,
      bz - rightZ * 0.30 + fwdZ * elbowBack,
      imp.x * 0.75 + toppleDirX * 0.8 - rightX * 0.015,
      0,
      imp.z * 0.75 + toppleDirZ * 0.8 - rightZ * 0.015,
    ),
    // [4] leftHand
    mkNode(
      'leftArm',
      bx - rightX * 0.33 + fwdX * 0.05,
      0.79 - crouchY * 0.6,
      bz - rightZ * 0.33 + fwdZ * 0.05,
      imp.x * 0.55 - rightX * 0.022,
      0,
      imp.z * 0.55 - rightZ * 0.022,
    ),
    // [5] rightElbow
    mkNode(
      'rightArm',
      bx + rightX * 0.30 + fwdX * elbowBack,
      1.08 - crouchY,
      bz + rightZ * 0.30 + fwdZ * elbowBack,
      imp.x * 0.75 + toppleDirX * 0.8 + rightX * 0.015,
      0,
      imp.z * 0.75 + toppleDirZ * 0.8 + rightZ * 0.015,
    ),
    // [6] rightHand
    mkNode(
      'rightArm',
      bx + rightX * 0.33 + fwdX * 0.08,
      0.79 - crouchY * 0.6,
      bz + rightZ * 0.33 + fwdZ * 0.08,
      imp.x * 0.55 + rightX * 0.022,
      0,
      imp.z * 0.55 + rightZ * 0.022,
    ),
    // [7] leftKnee
    mkNode(
      'leftLeg',
      bx - rightX * 0.13 + fwdX * kneeFwd,
      0.47 - crouchY * 0.35,
      bz - rightZ * 0.13 + fwdZ * kneeFwd,
      imp.x * 0.25 + fwdX * 0.015,
      0,
      imp.z * 0.25 + fwdZ * 0.015,
    ),
    // [8] leftFoot
    mkNode(
      'leftLeg',
      bx - rightX * 0.14,
      0.065,
      bz - rightZ * 0.14,
      0,
      0,
      0,
    ),
    // [9] rightKnee
    mkNode(
      'rightLeg',
      bx + rightX * 0.13 + fwdX * kneeFwd,
      0.47 - crouchY * 0.35,
      bz + rightZ * 0.13 + fwdZ * kneeFwd,
      imp.x * 0.25 + fwdX * 0.015,
      0,
      imp.z * 0.25 + fwdZ * 0.015,
    ),
    // [10] rightFoot
    mkNode(
      'rightLeg',
      bx + rightX * 0.14,
      0.065,
      bz + rightZ * 0.14,
      0,
      0,
      0,
    ),
  ];

  return {
    nodes,
    rightAxis: new THREE.Vector3(rightX, 0, rightZ),
    settledTime: 0,
  };
}

export function wakeRagdoll(ragdoll: RagdollState) {
  ragdoll.settledTime = 0;
}

export function shiftRagdoll(
  ragdoll: RagdollState,
  dx: number,
  dy: number,
  dz: number,
  velImpulse?: THREE.Vector3,
) {
  ragdoll.settledTime = 0;
  for (const n of ragdoll.nodes) {
    n.pos.x += dx;
    n.pos.y += dy;
    n.pos.z += dz;
    if (velImpulse) {
      n.prevPos.copy(n.pos).sub(velImpulse);
    } else {
      n.prevPos.x += dx;
      n.prevPos.y += dy;
      n.prevPos.z += dz;
    }
  }
}

function solveDistPair(
  a: THREE.Vector3,
  b: THREE.Vector3,
  targetDist: number,
  minOnly = false,
  weightA = 0.5,
) {
  _rdDir.subVectors(b, a);
  const len = _rdDir.length();
  if (len < 1e-5) return;
  if (minOnly && len >= targetDist) return;
  const diff = (len - targetDist) / len;
  _rdDir.multiplyScalar(diff);
  a.addScaledVector(_rdDir, weightA);
  b.addScaledVector(_rdDir, -(1 - weightA));
}

function computeStabilizedBoneWorldQuat(
  upY: THREE.Vector3,
  refX: THREE.Vector3,
  refZ: THREE.Vector3,
  outQuat: THREE.Quaternion,
) {
  _bY.copy(upY);
  if (_bY.lengthSq() < 1e-6) _bY.set(0, 1, 0);
  else _bY.normalize();

  _bZ.crossVectors(refX, _bY);
  if (_bZ.lengthSq() < 1e-4) {
    _bX.crossVectors(_bY, refZ);
    if (_bX.lengthSq() < 1e-4) _bX.set(1, 0, 0);
    else _bX.normalize();
    _bZ.crossVectors(_bX, _bY).normalize();
  } else {
    _bZ.normalize();
    _bX.crossVectors(_bY, _bZ).normalize();
  }

  _rdMat.makeBasis(_bX, _bY, _bZ);
  outQuat.setFromRotationMatrix(_rdMat);
}

export function stepArticulatedRagdoll(
  ragdoll: RagdollState,
  rig: GoreDollRig,
  botPos: THREE.Vector3,
  colliders: WallCollider[],
  resolveNodeCollisions: (pos: THREE.Vector3, radius: number, cols: WallCollider[]) => void,
  dt: number,
  pinPelvis?: THREE.Vector3,
) {
  const nodes = ragdoll.nodes;
  if (nodes.length < 11) return;

  // Skip physics step if corpse has completely settled on the floor (unless held)
  if (!pinPelvis && ragdoll.settledTime > 0.65) {
    return;
  }

  const grav = 16.5 * dt * dt;
  let totalMotionSq = 0;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (i === 0 && pinPelvis) {
      n.prevPos.copy(n.pos);
      n.pos.copy(pinPelvis);
      continue;
    }
    const groundR = i <= 2 ? 0.135 : i === 3 || i === 5 || i === 7 || i === 9 ? 0.08 : 0.065;
    const onGround = n.pos.y <= groundR + 0.024;
    const dampXZ = onGround ? 0.68 : 0.982;
    const dampY = onGround ? 0.45 : 0.982;
    const vx = (n.pos.x - n.prevPos.x) * dampXZ;
    const vy = (n.pos.y - n.prevPos.y) * dampY;
    const vz = (n.pos.z - n.prevPos.z) * dampXZ;
    totalMotionSq += vx * vx + vy * vy + vz * vz;
    n.prevPos.copy(n.pos);
    n.pos.x += vx;
    n.pos.y += vy - grav;
    n.pos.z += vz;
  }

  const pelvis = nodes[0].pos;
  const chest = nodes[1].pos;
  const head = nodes[2].pos;
  const lElbow = nodes[3].pos;
  const lHand = nodes[4].pos;
  const rElbow = nodes[5].pos;
  const rHand = nodes[6].pos;
  const lKnee = nodes[7].pos;
  const lFoot = nodes[8].pos;
  const rKnee = nodes[9].pos;
  const rFoot = nodes[10].pos;

  // Compute current torso orthonormal basis for socket anchors & anatomical joint pole limits
  const updateTorsoBasis = () => {
    _rdY.subVectors(chest, pelvis);
    if (_rdY.lengthSq() < 1e-5) _rdY.set(0, 1, 0);
    else _rdY.normalize();

    // Blend hip/elbow spread with persistent rightAxis so chest never twists 180 deg randomly
    _rdX.subVectors(rKnee, lKnee).multiplyScalar(0.55);
    _rdDir.subVectors(rElbow, lElbow).multiplyScalar(0.45);
    _rdX.add(_rdDir);
    _rdX.addScaledVector(_rdY, -_rdX.dot(_rdY));
    if (_rdX.lengthSq() < 0.015) {
      _rdX.copy(ragdoll.rightAxis);
      _rdX.addScaledVector(_rdY, -_rdX.dot(_rdY));
    }
    if (_rdX.lengthSq() < 1e-5) _rdX.set(1, 0, 0);
    else _rdX.normalize();

    // Align polarity with previous rightAxis to prevent spin inversion
    if (_rdX.dot(ragdoll.rightAxis) < 0) _rdX.negate();
    ragdoll.rightAxis.lerp(_rdX, 0.35).normalize();

    _rdZ.crossVectors(_rdX, _rdY).normalize();
    _rdX.crossVectors(_rdY, _rdZ).normalize();
  };

  for (let iter = 0; iter < 5; iter++) {
    if (pinPelvis) {
      pelvis.copy(pinPelvis);
    }
    // 1. Spine & Head lengths
    solveDistPair(pelvis, chest, LEN_PELVIS_CHEST, false, pinPelvis ? 0.0 : 0.5);
    solveDistPair(chest, head, LEN_CHEST_HEAD, false, 0.45);
    // Keep spine + neck from folding into a tight V
    solveDistPair(pelvis, head, 0.68, true, pinPelvis ? 0.0 : 0.5);

    // 2. Refresh torso basis & exact anatomical sockets
    updateTorsoBasis();
    _rdShoulderL.copy(chest).addScaledVector(_rdX, -0.27);
    _rdShoulderR.copy(chest).addScaledVector(_rdX, 0.27);
    _rdHipL.copy(pelvis).addScaledVector(_rdX, -0.115).addScaledVector(_rdY, -0.05);
    _rdHipR.copy(pelvis).addScaledVector(_rdX, 0.115).addScaledVector(_rdY, -0.05);

    // Upper arms anchored to shoulder sockets (small feedback into chest)
    solveDistPair(_rdShoulderL, lElbow, LEN_UPPER_ARM, false, 0.12);
    chest.addScaledVector(_rdShoulderL.sub(chest).addScaledVector(_rdX, 0.27), 0.6);
    solveDistPair(_rdShoulderR, rElbow, LEN_UPPER_ARM, false, 0.12);
    chest.addScaledVector(_rdShoulderR.sub(chest).addScaledVector(_rdX, -0.27), 0.6);

    // Forearms
    solveDistPair(lElbow, lHand, LEN_FOREARM, false, 0.45);
    solveDistPair(rElbow, rHand, LEN_FOREARM, false, 0.45);

    // Thighs anchored to hip sockets
    solveDistPair(_rdHipL, lKnee, LEN_THIGH, false, 0.14);
    solveDistPair(_rdHipR, rKnee, LEN_THIGH, false, 0.14);

    // Shins
    solveDistPair(lKnee, lFoot, LEN_SHIN, false, 0.45);
    solveDistPair(rKnee, rFoot, LEN_SHIN, false, 0.45);

    // 3. Anti-Collapse Joint Angle Limits (stop bodies from folding flat!)
    // Knees: max realistic flexion (~115 deg -> hip-to-foot >= 0.48), never fold heels into chest/pelvis!
    solveDistPair(pelvis, lFoot, 0.48, true, 0.35);
    solveDistPair(pelvis, rFoot, 0.48, true, 0.35);
    solveDistPair(chest, lKnee, 0.56, true, 0.4);
    solveDistPair(chest, rKnee, 0.56, true, 0.4);
    solveDistPair(chest, lFoot, 0.78, true, 0.4);
    solveDistPair(chest, rFoot, 0.78, true, 0.4);

    // Elbows: keep hands from collapsing into chest/shoulder & prevent arms clipping through torso
    solveDistPair(chest, lHand, 0.34, true, 0.25);
    solveDistPair(chest, rHand, 0.34, true, 0.25);
    solveDistPair(pelvis, lHand, 0.32, true, 0.35);
    solveDistPair(pelvis, rHand, 0.32, true, 0.35);
    solveDistPair(pelvis, lElbow, 0.32, true, 0.3);
    solveDistPair(pelvis, rElbow, 0.32, true, 0.3);

    // Bilateral limb separation so left/right legs and arms don't scissors-merge
    solveDistPair(lKnee, rKnee, 0.20, true, 0.5);
    solveDistPair(lFoot, rFoot, 0.18, true, 0.5);
    solveDistPair(lHand, rHand, 0.26, true, 0.5);

    // Anatomical Knee Hinge Pole: knee bends FORWARD (+_rdZ), never hyperextends backwards
    _rdMid.lerpVectors(pelvis, lFoot, 0.5);
    const lKneeFwd = _rdDir.subVectors(lKnee, _rdMid).dot(_rdZ);
    if (lKneeFwd < 0.03) {
      lKnee.addScaledVector(_rdZ, (0.03 - lKneeFwd) * 0.45);
    }
    _rdMid.lerpVectors(pelvis, rFoot, 0.5);
    const rKneeFwd = _rdDir.subVectors(rKnee, _rdMid).dot(_rdZ);
    if (rKneeFwd < 0.03) {
      rKnee.addScaledVector(_rdZ, (0.03 - rKneeFwd) * 0.45);
    }

    // Anatomical Elbow Pole: elbows bend slightly backward (-_rdZ) & outward so arms don't invert
    _rdMid.lerpVectors(chest, lHand, 0.5);
    const lElbowBack = _rdDir.subVectors(lElbow, _rdMid).dot(_rdZ);
    if (lElbowBack > -0.02) {
      lElbow.addScaledVector(_rdZ, (-0.02 - lElbowBack) * 0.35);
    }
    _rdMid.lerpVectors(chest, rHand, 0.5);
    const rElbowBack = _rdDir.subVectors(rElbow, _rdMid).dot(_rdZ);
    if (rElbowBack > -0.02) {
      rElbow.addScaledVector(_rdZ, (-0.02 - rElbowBack) * 0.35);
    }

    // 4. World wall, prop, and floor collision resolution
    for (let i = 0; i < nodes.length; i++) {
      const groundR = i <= 2 ? 0.135 : i === 3 || i === 5 || i === 7 || i === 9 ? 0.08 : 0.065;
      resolveNodeCollisions(nodes[i].pos, groundR, colliders);
    }
  }

  // Sleep tracking once kinetic energy dissipates on floor
  if (totalMotionSq < 0.000018) {
    ragdoll.settledTime += dt;
  } else {
    ragdoll.settledTime = 0;
  }

  // Update logical bot ground position to pelvis XZ
  botPos.set(pelvis.x, 0, pelvis.z);

  // Map solved 11 nodes cleanly onto the connected GoreDollRig hierarchy
  rig.root.position.set(0, 0, 0);
  rig.root.rotation.set(0, 0, 0);

  updateTorsoBasis();

  // Hips + Spine share the stabilized world torso basis (limbs stay 100% locked in sockets!)
  _rdMat.makeBasis(_rdX, _rdY, _rdZ);
  _qHipsWorld.setFromRotationMatrix(_rdMat);
  _qSpineWorld.copy(_qHipsWorld);

  const j = rig.joints;
  j.hips.position.copy(pelvis);
  j.hips.quaternion.copy(_qHipsWorld);
  _qHipsInv.copy(_qHipsWorld).invert();

  j.spine.position.set(0, 0.11, 0);
  j.spine.quaternion.copy(_qHipsInv).multiply(_qSpineWorld);
  _qSpineInv.copy(_qSpineWorld).invert();

  // Head (local +Y points chest -> head)
  j.head.position.set(0, 0.47, 0);
  _rdDir.subVectors(head, chest);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qChildWorld);
  j.head.quaternion.copy(_qSpineInv).multiply(_qChildWorld);

  // Recompute exact world shoulder & hip socket origins after final iteration
  _rdShoulderL.copy(chest).addScaledVector(_rdX, -0.27);
  _rdShoulderR.copy(chest).addScaledVector(_rdX, 0.27);
  _rdHipL.copy(pelvis).addScaledVector(_rdX, -0.115).addScaledVector(_rdY, -0.05);
  _rdHipR.copy(pelvis).addScaledVector(_rdX, 0.115).addScaledVector(_rdY, -0.05);

  // Left Upper Arm (local -Y points shoulder -> elbow => local +Y = elbow -> shoulder)
  j.leftArm.position.set(-0.27, 0.35, 0);
  _rdDir.subVectors(_rdShoulderL, lElbow);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qArmLWorld);
  j.leftArm.quaternion.copy(_qSpineInv).multiply(_qArmLWorld);

  // Left Forearm (child of leftArm)
  j.leftElbow.position.set(0, -0.28, 0);
  _rdDir.subVectors(lElbow, lHand);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qChildWorld);
  _qParentInv.copy(_qArmLWorld).invert();
  j.leftElbow.quaternion.copy(_qParentInv).multiply(_qChildWorld);

  // Right Upper Arm
  j.rightArm.position.set(0.27, 0.35, 0);
  _rdDir.subVectors(_rdShoulderR, rElbow);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qArmRWorld);
  j.rightArm.quaternion.copy(_qSpineInv).multiply(_qArmRWorld);

  // Right Forearm
  j.rightElbow.position.set(0, -0.28, 0);
  _rdDir.subVectors(rElbow, rHand);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qChildWorld);
  _qParentInv.copy(_qArmRWorld).invert();
  j.rightElbow.quaternion.copy(_qParentInv).multiply(_qChildWorld);

  // Left Thigh (child of hips)
  j.leftLeg.position.set(-0.115, -0.05, 0);
  _rdDir.subVectors(_rdHipL, lKnee);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qLegLWorld);
  j.leftLeg.quaternion.copy(_qHipsInv).multiply(_qLegLWorld);

  // Left Shin (child of leftLeg)
  j.leftKnee.position.set(0, -0.38, 0);
  _rdDir.subVectors(lKnee, lFoot);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qChildWorld);
  _qParentInv.copy(_qLegLWorld).invert();
  j.leftKnee.quaternion.copy(_qParentInv).multiply(_qChildWorld);

  // Right Thigh (child of hips)
  j.rightLeg.position.set(0.115, -0.05, 0);
  _rdDir.subVectors(_rdHipR, rKnee);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qLegRWorld);
  j.rightLeg.quaternion.copy(_qHipsInv).multiply(_qLegRWorld);

  // Right Shin (child of rightLeg)
  j.rightKnee.position.set(0, -0.38, 0);
  _rdDir.subVectors(rKnee, rFoot);
  computeStabilizedBoneWorldQuat(_rdDir, _rdX, _rdZ, _qChildWorld);
  _qParentInv.copy(_qLegRWorld).invert();
  j.rightKnee.quaternion.copy(_qParentInv).multiply(_qChildWorld);
}
