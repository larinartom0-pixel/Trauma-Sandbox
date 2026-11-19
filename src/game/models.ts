import * as THREE from 'three';
import { BotArchetype, GestureId, LimbId, WeaponId } from './types';

export interface GoreDollRig {
  root: THREE.Group;
  limbs: Record<LimbId, THREE.Group>;
  limbMeshes: Record<LimbId, THREE.Mesh[]>;
  weaponMount: THREE.Group;
  contactShadow: THREE.Mesh;
}

const ARCHETYPE_PALETTE: Record<
  BotArchetype,
  { coat: number; pants: number; skin: number; gear: number; headgear: 'hood' | 'helmet' | 'cap' | 'none' }
> = {
  raider: { coat: 0x4b463e, pants: 0x2b2e33, skin: 0xc99c80, gear: 0x26292e, headgear: 'hood' },
  infected: { coat: 0x3b483d, pants: 0x252825, skin: 0x7a8b76, gear: 0x1d201d, headgear: 'none' },
  survivor: { coat: 0x524c40, pants: 0x32373e, skin: 0xd1a488, gear: 0x2c3038, headgear: 'cap' },
  medic: { coat: 0x8d9aa1, pants: 0x2c3c45, skin: 0xd4a68b, gear: 0x27323b, headgear: 'cap' },
  enforcer: { coat: 0x2d3744, pants: 0x1e242d, skin: 0xc99c80, gear: 0x171b22, headgear: 'helmet' },
};

function tagLimb(group: THREE.Object3D, botId: string, limbId: LimbId): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      m.userData.botId = botId;
      m.userData.limbId = limbId;
      m.castShadow = true;
      m.receiveShadow = true;
      meshes.push(m);
    }
  });
  return meshes;
}

/**
 * Builds a high-detail articulated GoreDoll using capsules, cylinders, beveled armor rigs,
 * pouches, boots, and natural headgear — with NO floating good/bad color spoilers.
 */
export function createGoreDollModel(
  botId: string,
  archetype: BotArchetype,
  shadowTex: THREE.Texture,
): GoreDollRig {
  const pal = ARCHETYPE_PALETTE[archetype];
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: pal.skin,
    roughness: 0.68,
    metalness: 0.02,
  });
  const coatMat = new THREE.MeshStandardMaterial({
    color: pal.coat,
    roughness: 0.84,
    metalness: 0.06,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: pal.pants,
    roughness: 0.88,
    metalness: 0.04,
  });
  const gearMat = new THREE.MeshStandardMaterial({
    color: pal.gear,
    roughness: 0.45,
    metalness: 0.55,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x231d19,
    roughness: 0.62,
    metalness: 0.15,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: archetype === 'infected' ? 0x991b1b : 0x111827,
    roughness: 0.25,
    metalness: 0.3,
  });

  // Ground contact shadow
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 1.05),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  // Torso (anatomical chest taper + plate carrier + 3 mag pouches + belt + backpack)
  const torso = new THREE.Group();
  torso.position.set(0, 1.12, 0);

  const upperChest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.18, 0.46, 12),
    coatMat.clone(),
  );
  upperChest.scale.set(1.08, 1, 0.7);
  upperChest.position.y = 0.08;

  const shoulders = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.11, 0.32, 6, 10),
    coatMat.clone(),
  );
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 0.24;

  const vestPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.34, 0.26),
    gearMat,
  );
  vestPlate.position.y = 0.07;

  // Tactical mag pouches
  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.12, 0.05),
      leatherMat,
    );
    pouch.position.set(i * 0.1, -0.02, 0.15);
    torso.add(pouch);
  }

  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.34, 0.14),
    leatherMat,
  );
  backpack.position.set(0, 0.06, -0.18);

  const pelvis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.16, 0.2, 12),
    pantsMat.clone(),
  );
  pelvis.scale.set(1.06, 1, 0.72);
  pelvis.position.y = -0.22;

  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.185, 0.185, 0.055, 12),
    leatherMat,
  );
  belt.scale.set(1.06, 1, 0.74);
  belt.position.y = -0.13;

  torso.add(upperChest, shoulders, vestPlate, backpack, pelvis, belt);
  root.add(torso);

  // Head (sculpted neck + cranium sphere + jaw + nose + eyes + varied headgear)
  const head = new THREE.Group();
  head.position.set(0, 1.48, 0);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.078, 0.12, 10),
    skinMat.clone(),
  );
  neck.position.y = 0.02;

  const cranium = new THREE.Mesh(
    new THREE.SphereGeometry(0.128, 14, 12),
    skinMat.clone(),
  );
  cranium.scale.set(0.92, 1.06, 0.98);
  cranium.position.y = 0.17;

  const jaw = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.1, 0.15),
    skinMat.clone(),
  );
  jaw.position.set(0, 0.1, 0.02);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 6), eyeMat);
  eyeL.position.set(-0.044, 0.17, 0.112);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 6), eyeMat);
  eyeR.position.set(0.044, 0.17, 0.112);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.042, 0.03), skinMat.clone());
  nose.position.set(0, 0.15, 0.125);

  head.add(neck, cranium, jaw, eyeL, eyeR, nose);

  if (pal.headgear === 'helmet') {
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      gearMat,
    );
    helmet.position.y = 0.18;
    const goggleStrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.136, 0.136, 0.045, 12),
      leatherMat,
    );
    goggleStrap.position.y = 0.18;
    head.add(helmet, goggleStrap);
  } else if (pal.headgear === 'hood') {
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.144, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65),
      coatMat.clone(),
    );
    hood.rotation.x = -0.22;
    hood.position.set(0, 0.18, -0.015);
    const mask = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.088, 0.085, 10),
      gearMat,
    );
    mask.position.set(0, 0.1, 0.025);
    head.add(hood, mask);
  } else if (pal.headgear === 'cap') {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      gearMat,
    );
    dome.position.y = 0.19;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.016, 0.11), gearMat);
    brim.position.set(0, 0.21, 0.12);
    head.add(dome, brim);
  }
  root.add(head);

  // Articulated Capsule Arms
  const buildArm = (side: -1 | 1) => {
    const g = new THREE.Group();
    g.position.set(side * 0.27, 1.36, 0);

    const shoulderPad = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      coatMat.clone(),
    );
    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.056, 0.21, 6, 10),
      coatMat.clone(),
    );
    upperArm.position.y = -0.14;

    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.054, 8, 8),
      gearMat,
    );
    elbow.position.y = -0.28;

    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.048, 0.2, 6, 10),
      skinMat.clone(),
    );
    forearm.position.y = -0.41;

    const glove = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.095, 0.095),
      leatherMat,
    );
    glove.position.y = -0.56;

    g.add(shoulderPad, upperArm, elbow, forearm, glove);
    return g;
  };
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.57, 0.12);
  rightArm.add(weaponMount);
  root.add(leftArm, rightArm);

  // Articulated Capsule Legs + Combat Boots
  const buildLeg = (side: -1 | 1) => {
    const g = new THREE.Group();
    g.position.set(side * 0.115, 0.85, 0);

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.078, 0.26, 6, 10),
      pantsMat.clone(),
    );
    thigh.position.y = -0.18;

    const kneePad = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.09, 0.13),
      gearMat,
    );
    kneePad.position.set(0, -0.37, 0.02);

    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.064, 0.25, 6, 10),
      pantsMat.clone(),
    );
    shin.position.y = -0.54;

    const bootAnkle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.072, 0.14, 10),
      leatherMat,
    );
    bootAnkle.position.y = -0.73;

    const bootSole = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.075, 0.25),
      leatherMat,
    );
    bootSole.position.set(0, -0.81, 0.045);

    g.add(thigh, kneePad, shin, bootAnkle, bootSole);
    return g;
  };
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  root.add(leftLeg, rightLeg);

  const limbMeshes: Record<LimbId, THREE.Mesh[]> = {
    head: tagLimb(head, botId, 'head'),
    torso: tagLimb(torso, botId, 'torso'),
    leftArm: tagLimb(leftArm, botId, 'leftArm'),
    rightArm: tagLimb(rightArm, botId, 'rightArm'),
    leftLeg: tagLimb(leftLeg, botId, 'leftLeg'),
    rightLeg: tagLimb(rightLeg, botId, 'rightLeg'),
  };

  return {
    root,
    limbs: { head, torso, leftArm, rightArm, leftLeg, rightLeg },
    limbMeshes,
    weaponMount,
    contactShadow,
  };
}

/**
 * High-detail composite weapons & Reality Crusher viewmodels.
 */
export function createWeaponMesh(weaponId: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const gunSteel = new THREE.MeshStandardMaterial({
    color: 0x262b33,
    roughness: 0.28,
    metalness: 0.88,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x16191e,
    roughness: 0.42,
    metalness: 0.75,
  });
  const polymer = new THREE.MeshStandardMaterial({
    color: 0x1b1e24,
    roughness: 0.72,
    metalness: 0.1,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x694228,
    roughness: 0.76,
    metalness: 0.05,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    roughness: 0.1,
    metalness: 0.9,
  });

  switch (weaponId) {
    case 'reality_crusher': {
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.4), darkMetal);
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.34), gunSteel);
      topRail.position.y = 0.075;
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.044, 0.044, 0.24, 14),
        new THREE.MeshStandardMaterial({
          color: 0x0ea5e9,
          emissive: 0x0284c7,
          emissiveIntensity: 1.6,
          roughness: 0.15,
          metalness: 0.3,
        }),
      );
      core.rotation.x = Math.PI / 2;
      core.position.z = -0.14;
      const coilRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 8, 16), gunSteel);
      coilRing.position.z = -0.21;
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2;
        const prong = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.18), gunSteel);
        prong.position.set(Math.cos(ang) * 0.075, Math.sin(ang) * 0.075, -0.27);
        prong.rotation.z = ang;
        g.add(prong);
      }
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.075), polymer);
      grip.position.set(0, -0.1, 0.1);
      grip.rotation.x = 0.25;
      g.add(chassis, topRail, core, coilRing, grip);
      break;
    }
    case 'pistol_9mm': {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.048, 0.25), gunSteel);
      const barrelTip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 10), darkMetal);
      barrelTip.rotation.x = Math.PI / 2;
      barrelTip.position.set(0, 0.005, -0.13);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.028, 0.21), polymer);
      frame.position.set(0, -0.03, 0.01);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.125, 0.058), polymer);
      grip.position.set(0, -0.09, 0.075);
      grip.rotation.x = 0.24;
      const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.05), darkMetal);
      triggerGuard.position.set(0, -0.055, 0.0);
      const frontSight = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.012, 0.012),
        new THREE.MeshBasicMaterial({ color: 0x10b981 }),
      );
      frontSight.position.set(0, 0.028, -0.11);
      g.add(slide, barrelTip, frame, grip, triggerGuard, frontSight);
      break;
    }
    case 'shotgun_12ga': {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.082, 0.26), darkMetal);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.58, 12), gunSteel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.022, -0.39);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.46, 12), gunSteel);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, -0.015, -0.33);
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.19, 10), wood);
      pump.rotation.x = Math.PI / 2;
      pump.position.set(0, -0.016, -0.29);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.105, 0.3), wood);
      stock.position.set(0, -0.045, 0.24);
      stock.rotation.x = 0.14;
      const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.025), polymer);
      buttPad.position.set(0, -0.065, 0.39);
      g.add(receiver, barrel, tube, pump, stock, buttPad);
      break;
    }
    case 'rifle_556': {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.072, 0.28), darkMetal);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.46, 10), gunSteel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.01, -0.35);
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.065, 10), darkMetal);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0, 0.01, -0.58);
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.058, 0.26), polymer);
      handguard.position.set(0, 0.005, -0.24);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.18, 0.072), polymer);
      mag.position.set(0, -0.1, -0.04);
      mag.rotation.x = -0.24;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.052), polymer);
      grip.position.set(0, -0.08, 0.08);
      grip.rotation.x = 0.28;
      const opticBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 12), gunSteel);
      opticBody.rotation.x = Math.PI / 2;
      opticBody.position.set(0, 0.06, 0);
      const opticLens = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 12), lensMat);
      opticLens.rotation.x = Math.PI / 2;
      opticLens.position.set(0, 0.06, -0.05);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.1, 0.24), polymer);
      stock.position.set(0, -0.015, 0.24);
      g.add(upper, barrel, muzzle, handguard, mag, grip, opticBody, opticLens, stock);
      break;
    }
    case 'sniper_762': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.068, 0.36), wood);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.72, 12), gunSteel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.5);
      const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 12), darkMetal);
      scopeTube.rotation.x = Math.PI / 2;
      scopeTube.position.set(0, 0.074, -0.04);
      const scopeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.09, 12), darkMetal);
      scopeBell.rotation.x = Math.PI / 2;
      scopeBell.position.set(0, 0.074, -0.18);
      const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.01, 12), lensMat);
      scopeLens.rotation.x = Math.PI / 2;
      scopeLens.position.set(0, 0.074, -0.225);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.13, 0.08), darkMetal);
      mag.position.set(0, -0.08, -0.02);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.11, 0.28), wood);
      stock.position.set(0, -0.03, 0.28);
      g.add(body, barrel, scopeTube, scopeBell, scopeLens, mag, stock);
      break;
    }
    case 'katana': {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.034, 0.88),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.12, metalness: 0.96 }),
      );
      blade.position.set(0, 0.02, -0.45);
      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.014, 14), darkMetal);
      tsuba.rotation.x = Math.PI / 2;
      tsuba.position.set(0, 0.02, -0.01);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.25, 10), polymer);
      hilt.rotation.x = Math.PI / 2;
      hilt.position.set(0, 0.02, 0.12);
      g.add(blade, tsuba, hilt);
      break;
    }
    case 'fire_axe': {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.042, 0.74), wood);
      shaft.position.set(0, 0, -0.2);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.18, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45, metalness: 0.55 }),
      );
      head.position.set(0, -0.06, -0.48);
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.17, 0.045),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.92 }),
      );
      edge.position.set(0, -0.06, -0.56);
      g.add(shaft, head, edge);
      break;
    }
    case 'crowbar': {
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.62, 10),
        new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.42, metalness: 0.7 }),
      );
      bar.rotation.x = Math.PI / 2;
      bar.position.z = -0.22;
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.1, 0.08), gunSteel);
      hook.position.set(0, -0.04, -0.52);
      g.add(bar, hook);
      break;
    }
    case 'frag_grenade': {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 14, 12),
        new THREE.MeshStandardMaterial({ color: 0x3b4a33, roughness: 0.65, metalness: 0.35 }),
      );
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10), gunSteel);
      cap.position.y = 0.06;
      const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.065, 0.02), gunSteel);
      spoon.position.set(0.035, 0.02, 0);
      g.add(body, cap, spoon);
      break;
    }
    default: {
      const forearm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.042, 0.22, 6, 10),
        new THREE.MeshStandardMaterial({ color: 0xc99c80, roughness: 0.72 }),
      );
      forearm.rotation.x = Math.PI / 2;
      forearm.position.set(0, -0.04, -0.1);
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.1), polymer);
      glove.position.set(0, -0.04, -0.26);
      g.add(forearm, glove);
      break;
    }
  }
  return g;
}

export function createGestureHandMesh(): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99c80, roughness: 0.72 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2c343f, roughness: 0.85 });
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.24, 6, 10), sleeve);
  arm.rotation.x = Math.PI / 2;
  arm.position.z = 0.1;
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.095, 0.038), skin);
  palm.position.set(0, 0.02, -0.08);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.055, 0.024), skin);
  thumb.position.set(-0.052, 0.03, -0.08);
  g.add(arm, palm, thumb);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.072, 0.02), skin);
    finger.position.set(-0.028 + i * 0.02, 0.092, -0.08);
    g.add(finger);
  }
  return g;
}

export function poseGestureHand(hand: THREE.Group, gesture: GestureId, t: number) {
  if (gesture === 'peace') {
    hand.position.set(-0.05, -0.08 + Math.sin(t * 14) * 0.03, -0.45);
    hand.rotation.set(0.15, 0.2, Math.sin(t * 12) * 0.35);
  } else if (gesture === 'follow') {
    hand.position.set(0.12, -0.1, -0.48 + Math.sin(t * 10) * 0.04);
    hand.rotation.set(0.4 + Math.sin(t * 10) * 0.25, -0.2, 0);
  } else if (gesture === 'hold') {
    hand.position.set(0.05, -0.06, -0.52);
    hand.rotation.set(-0.1, 0, 0);
  } else if (gesture === 'intimidate') {
    hand.position.set(0.08, -0.1, -0.55 - Math.abs(Math.sin(t * 11)) * 0.08);
    hand.rotation.set(0.8, 0, 0);
  } else if (gesture === 'request_med') {
    hand.position.set(-0.08, -0.12 + Math.sin(t * 8) * 0.025, -0.46);
    hand.rotation.set(0.95, 0, Math.PI);
  } else {
    hand.position.set(0.04, -0.08, -0.46);
    hand.rotation.set(0.3, Math.sin(t * 15) * 0.25, 0.25);
  }
}

export function createExplosiveBarrel(shadowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const drumMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.45,
    metalness: 0.48,
  });
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.52,
    metalness: 0.22,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.35,
    metalness: 0.85,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.08, 18), drumMat);
  body.position.y = 0.54;
  body.castShadow = true;
  body.receiveShadow = true;

  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.386, 0.386, 0.16, 18), bandMat);
  stripe.position.y = 0.62;

  for (const ry of [0.28, 0.82, 1.07]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.378, 0.022, 8, 18), rimMat);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = ry;
    g.add(rib);
  }

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), rimMat);
  cap.position.set(0.16, 1.09, 0);

  const shad = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.15),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.45 }),
  );
  shad.rotation.x = -Math.PI / 2;
  shad.position.y = 0.02;

  g.add(body, stripe, cap, shad);
  return g;
}

export function createLootCrateModel(
  kind: 'med' | 'police' | 'stash',
  woodTex: THREE.Texture,
  shadowTex: THREE.Texture,
): THREE.Group {
  const g = new THREE.Group();
  const baseColor =
    kind === 'med' ? 0xdbe4ea : kind === 'police' ? 0x263240 : 0xffffff;
  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    map: kind === 'stash' ? woodTex : null,
    roughness: kind === 'stash' ? 0.8 : 0.42,
    metalness: kind === 'police' ? 0.62 : 0.15,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.54, 0.56), mat);
  box.position.y = 0.27;
  box.castShadow = true;
  box.receiveShadow = true;

  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.08, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.4, metalness: 0.68 }),
  );
  lid.position.y = 0.56;
  lid.castShadow = true;

  // Latches
  for (const lx of [-0.26, 0.26]) {
    const latch = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.14, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.85 }),
    );
    latch.position.set(lx, 0.48, 0.295);
    g.add(latch);
  }

  const emblemColor = kind === 'med' ? 0x10b981 : kind === 'police' ? 0x3b82f6 : 0xd97706;
  const emblem = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.16, 0.03),
    new THREE.MeshStandardMaterial({
      color: emblemColor,
      emissive: emblemColor,
      emissiveIntensity: 0.42,
      roughness: 0.35,
    }),
  );
  emblem.position.set(0, 0.3, 0.29);

  const shad = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.9),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.45 }),
  );
  shad.rotation.x = -Math.PI / 2;
  shad.position.y = 0.02;

  g.add(box, lid, emblem, shad);
  return g;
}

/**
 * Multi-part detailed vehicle with sloped hood/windshield, metallic rims, bumpers, mirrors, and lights.
 */
export function createWreckedCarModel(
  colorHex: number,
  shadowTex: THREE.Texture,
  isAmbulance = false,
): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.55,
    metalness: 0.42,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x17202e,
    roughness: 0.12,
    metalness: 0.82,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x131518,
    roughness: 0.9,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x8a95a5,
    roughness: 0.28,
    metalness: 0.88,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x20242a,
    roughness: 0.5,
    metalness: 0.65,
  });

  // Lower chassis + wheel arches
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.64, 4.45), bodyMat);
  chassis.position.y = 0.55;
  chassis.castShadow = true;
  chassis.receiveShadow = true;

  // Front & rear bumpers
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.2, 0.24), trimMat);
  frontBumper.position.set(0, 0.34, 2.25);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.2, 0.24), trimMat);
  rearBumper.position.set(0, 0.34, -2.25);

  // Grille & Headlights
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 0.06), trimMat);
  grille.position.set(0, 0.58, 2.24);
  for (const hx of [-0.74, 0.74]) {
    const hl = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.15, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.2, metalness: 0.5 }),
    );
    hl.position.set(hx, 0.62, 2.23);
    const tl = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.14, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.3 }),
    );
    tl.position.set(hx, 0.62, -2.23);
    g.add(hl, tl);
  }

  if (isAmbulance) {
    // Box ambulance rear + front cab + red stripe + roof lightbar
    const boxRear = new THREE.Mesh(new THREE.BoxGeometry(2.16, 1.35, 2.95), bodyMat);
    boxRear.position.set(0, 1.35, -0.68);
    boxRear.castShadow = true;
    const redStripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.19, 0.18, 2.98),
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4 }),
    );
    redStripe.position.set(0, 1.02, -0.68);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.85, 1.35), bodyMat);
    cab.position.set(0, 1.18, 1.25);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.52, 0.14), glassMat);
    windshield.position.set(0, 1.24, 1.88);
    windshield.rotation.x = -0.26;
    const lightbar = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.14, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.5 }),
    );
    lightbar.position.set(0, 2.08, 0.85);
    g.add(boxRear, redStripe, cab, windshield, lightbar);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.58, 2.05), bodyMat);
    cabin.position.set(0, 1.15, -0.18);
    cabin.castShadow = true;
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.5, 0.12), glassMat);
    windshield.position.set(0, 1.12, 0.84);
    windshield.rotation.x = -0.52;
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.48, 0.12), glassMat);
    rearGlass.position.set(0, 1.12, -1.2);
    rearGlass.rotation.x = 0.52;
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.42, 1.75), glassMat);
    sideGlass.position.set(0, 1.15, -0.18);
    g.add(cabin, windshield, rearGlass, sideGlass);
  }

  g.add(chassis, frontBumper, rearBumper, grille);

  const wheelPositions: [number, number, number][] = [
    [-1.02, 0.36, 1.4],
    [1.02, 0.36, 1.4],
    [-1.02, 0.36, -1.4],
    [1.02, 0.36, -1.4],
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.28, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, wy, wz);
    g.add(wheel, rim);
  }

  const shad = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 5.6),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 }),
  );
  shad.rotation.x = -Math.PI / 2;
  shad.position.y = 0.02;
  g.add(shad);

  return g;
}

/**
 * Detailed industrial shipping container for the huge map's Depot & Outskirts.
 */
export function createShippingContainerModel(colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.65,
    metalness: 0.42,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x1e2228,
    roughness: 0.5,
    metalness: 0.7,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 6.2), mat);
  body.position.y = 1.35;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  for (let z = -2.7; z <= 2.7; z += 0.6) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(2.68, 2.52, 0.14), mat);
    rib.position.set(0, 1.35, z);
    g.add(rib);
  }
  const frameFront = new THREE.Mesh(new THREE.BoxGeometry(2.68, 2.74, 0.14), trim);
  frameFront.position.set(0, 1.37, 3.08);
  g.add(frameFront);
  return g;
}
