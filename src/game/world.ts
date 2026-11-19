import * as THREE from 'three';
import { buildGridFromLoot } from './inventory';
import {
  createExplosiveBarrel,
  createLootCrateModel,
  createShippingContainerModel,
  createWreckedCarModel,
} from './models';
import { ProceduralTexturePack } from './textures';
import { LootBundle } from './types';

export interface WallCollider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  thickness: number;
  mesh: THREE.Mesh;
}

export interface DynamicProp {
  id: string;
  kind: 'barrel' | 'crate' | 'barrier';
  mesh: THREE.Object3D;
  hitMesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  radius: number;
  halfHeight: number;
  mass: number;
  isExplosive: boolean;
  hp: number;
  exploded: boolean;
}

export interface WorldLootNode {
  id: string;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  bundle: LootBundle;
  isPermanent?: boolean;
  visualKind?: 'med' | 'police' | 'stash';
  respawnTimer?: number;
}

export interface BuildingZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  doorInside: THREE.Vector3;
  doorOutside: THREE.Vector3;
}

export interface TownWorld {
  colliders: WallCollider[];
  raycastWalls: THREE.Mesh[];
  props: DynamicProp[];
  propHitMeshes: THREE.Mesh[];
  lootNodes: WorldLootNode[];
  coverPoints: THREE.Vector3[];
  patrolPoints: THREE.Vector3[];
  interiorCenters: THREE.Vector3[];
  buildings: BuildingZone[];
  streetLampPositions: THREE.Vector3[];
  lampBulbMat: THREE.MeshStandardMaterial;
}

export const WORLD_BOUND = 195; // 400m x 400m massive playable map!

export function buildAbandonedTown(
  scene: THREE.Scene,
  textures: ProceduralTexturePack,
): TownWorld {
  const colliders: WallCollider[] = [];
  const raycastWalls: THREE.Mesh[] = [];
  const props: DynamicProp[] = [];
  const propHitMeshes: THREE.Mesh[] = [];
  const lootNodes: WorldLootNode[] = [];
  const coverPoints: THREE.Vector3[] = [];
  const interiorCenters: THREE.Vector3[] = [];
  const buildings: BuildingZone[] = [];
  const streetLampPositions: THREE.Vector3[] = [];

  // 1. Massive Extended Ground Terrain (560m x 560m)
  const terrainGeo = new THREE.PlaneGeometry(560, 560);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x2b3329,
    roughness: 0.96,
    metalness: 0.02,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Materials
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: textures.asphalt,
    roughness: 0.88,
    metalness: 0.05,
  });
  textures.asphalt.repeat.set(36, 36);

  const concMat = new THREE.MeshStandardMaterial({
    map: textures.concrete,
    roughness: 0.85,
    metalness: 0.05,
  });
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0x525861,
    roughness: 0.9,
    metalness: 0.04,
  });
  const brickMat = new THREE.MeshStandardMaterial({
    map: textures.brick,
    roughness: 0.86,
    metalness: 0.04,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x242930,
    roughness: 0.82,
    metalness: 0.16,
  });
  const clinicFloorMat = new THREE.MeshStandardMaterial({
    map: textures.clinicTile,
    roughness: 0.55,
    metalness: 0.06,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x3b424d,
    roughness: 0.45,
    metalness: 0.62,
  });
  const rustMat = new THREE.MeshStandardMaterial({
    color: 0x5b3a2e,
    roughness: 0.78,
    metalness: 0.35,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x5c432e,
    roughness: 0.8,
    metalness: 0.05,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1b2026,
    roughness: 0.55,
    metalness: 0.5,
  });
  const ceilingGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 0.65,
    roughness: 0.4,
  });

  // 2. Highway Network + Sidewalks + Instanced Lane Stripes
  const roadDefs: [number, number, number, number][] = [
    [0, 0, 390, 14], // East-West Main Highway
    [0, 0, 14, 390], // North-South Main Avenue
    [0, -95, 230, 11], // North Industrial Avenue
    [0, 95, 230, 11], // South Residential Avenue
    [-95, 0, 11, 220], // West Avenue
    [95, 0, 11, 220], // East Avenue
  ];
  roadDefs.forEach(([rx, rz, sx, sz], idx) => {
    const sw = new THREE.Mesh(
      new THREE.BoxGeometry(sx + (sx > sz ? 0 : 4.2), 0.04, sz + (sz > sx ? 0 : 4.2)),
      sidewalkMat,
    );
    sw.position.set(rx, 0.005 + idx * 0.001, rz);
    sw.receiveShadow = true;
    scene.add(sw);

    const road = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), asphaltMat);
    road.position.set(rx, 0.02 + idx * 0.002, rz);
    road.receiveShadow = true;
    scene.add(road);
  });

  // Instanced highway dashed markings (1 draw call!)
  const stripeGeo = new THREE.BoxGeometry(3.0, 0.015, 0.22);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd4d4c8 });
  const stripeCoords: { x: number; z: number; rotY: number }[] = [];
  for (let d = -180; d <= 180; d += 10) {
    if (Math.abs(d) < 16) continue;
    stripeCoords.push({ x: d, z: 0, rotY: 0 });
    stripeCoords.push({ x: 0, z: d, rotY: Math.PI / 2 });
  }
  for (let d = -105; d <= 105; d += 10) {
    if (Math.abs(d) < 10) continue;
    stripeCoords.push({ x: d, z: -95, rotY: 0 });
    stripeCoords.push({ x: d, z: 95, rotY: 0 });
    stripeCoords.push({ x: -95, z: d, rotY: Math.PI / 2 });
    stripeCoords.push({ x: 95, z: d, rotY: Math.PI / 2 });
  }
  const stripesInst = new THREE.InstancedMesh(stripeGeo, stripeMat, stripeCoords.length);
  const dummy = new THREE.Object3D();
  stripeCoords.forEach((sc, i) => {
    dummy.position.set(sc.x, 0.062, sc.z);
    dummy.rotation.set(0, sc.rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    stripesInst.setMatrixAt(i, dummy.matrix);
  });
  stripesInst.computeBoundingSphere();
  scene.add(stripesInst);

  // Central Plaza Fountain / Monument Island
  const centralPlaza = new THREE.Mesh(new THREE.BoxGeometry(36, 0.055, 36), concMat);
  centralPlaza.position.set(0, 0.028, 0);
  centralPlaza.receiveShadow = true;
  scene.add(centralPlaza);

  const addBoxCollider = (
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    mat: THREE.Material,
    castShadow = true,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    raycastWalls.push(mesh);
    colliders.push({
      minX: cx - sx / 2,
      maxX: cx + sx / 2,
      minY: cy - sy / 2,
      maxY: cy + sy / 2,
      minZ: cz - sz / 2,
      maxZ: cz + sz / 2,
      thickness: Math.min(sx, sz),
      mesh,
    });
    return mesh;
  };

  // Central Town Damaged Monument / Planter Cover
  addBoxCollider(0, 0.45, 0, 3.6, 0.9, 3.6, concMat, true);
  addBoxCollider(0, 1.35, 0, 1.2, 1.4, 1.2, metalMat, true);

  /**
   * Architectural building with cornice roof, doorway (3.4m wide), real window cutouts,
   * interior ceiling glow panel (zero extra PointLight shader overhead!), and interior props.
   */
  const buildEnterableBuilding = (opts: {
    cx: number;
    cz: number;
    w: number;
    d: number;
    h: number;
    doorSide: 'north' | 'south' | 'east' | 'west';
    windowSides?: ('north' | 'south' | 'east' | 'west')[];
    floorMat: THREE.Material;
    wallMat: THREE.Material;
    accentColor: number;
  }) => {
    const {
      cx,
      cz,
      w,
      d,
      h,
      doorSide,
      windowSides = [],
      floorMat,
      wallMat,
      accentColor,
    } = opts;
    const wt = 0.55;
    const doorW = 3.4;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), floorMat);
    floor.position.set(cx, 0.045, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.36, d + 0.8), roofMat);
    roof.position.set(cx, h + 0.18, cz);
    roof.castShadow = true;
    roof.receiveShadow = true;
    scene.add(roof);

    // Rooftop HVAC unit for skyline silhouette
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 1.8), metalMat);
    hvac.position.set(cx + w * 0.2, h + 0.78, cz - d * 0.18);
    scene.add(hvac);

    // Emissive interior light panel (zero shader light cost!)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.9), ceilingGlowMat);
    panel.position.set(cx, h - 0.05, cz);
    scene.add(panel);
    interiorCenters.push(new THREE.Vector3(cx, h - 0.8, cz));

    const signMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.32,
      roughness: 0.45,
    });

    const buildWallSide = (side: 'north' | 'south' | 'east' | 'west') => {
      const isNS = side === 'north' || side === 'south';
      const len = isNS ? w : d;
      const posX = side === 'east' ? cx + w / 2 : side === 'west' ? cx - w / 2 : cx;
      const posZ = side === 'south' ? cz + d / 2 : side === 'north' ? cz - d / 2 : cz;

      if (side === doorSide) {
        const segLen = (len - doorW) / 2;
        if (isNS) {
          addBoxCollider(posX - (doorW / 2 + segLen / 2), h / 2, posZ, segLen, h, wt, wallMat);
          addBoxCollider(posX + (doorW / 2 + segLen / 2), h / 2, posZ, segLen, h, wt, wallMat);
          addBoxCollider(posX, h - 0.55, posZ, doorW, 1.1, wt, wallMat);
          const sign = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.0, 0.38, 0.14), signMat);
          sign.position.set(posX, h - 0.15, posZ + (side === 'south' ? 0.32 : -0.32));
          scene.add(sign);
        } else {
          addBoxCollider(posX, h / 2, posZ - (doorW / 2 + segLen / 2), wt, h, segLen, wallMat);
          addBoxCollider(posX, h / 2, posZ + (doorW / 2 + segLen / 2), wt, h, segLen, wallMat);
          addBoxCollider(posX, h - 0.55, posZ, wt, 1.1, doorW, wallMat);
          const sign = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, doorW + 1.0), signMat);
          sign.position.set(posX + (side === 'east' ? 0.32 : -0.32), h - 0.15, posZ);
          scene.add(sign);
        }
      } else if (windowSides.includes(side) && len >= 10) {
        // Real window opening in the middle (sill 0..1.08m, header 2.45..h)
        const winW = 3.2;
        const segLen = (len - winW) / 2;
        if (isNS) {
          addBoxCollider(posX - (winW / 2 + segLen / 2), h / 2, posZ, segLen, h, wt, wallMat);
          addBoxCollider(posX + (winW / 2 + segLen / 2), h / 2, posZ, segLen, h, wt, wallMat);
          addBoxCollider(posX, 0.54, posZ, winW, 1.08, wt, wallMat, false);
          addBoxCollider(posX, (h + 2.45) * 0.5, posZ, winW, h - 2.45, wt, wallMat, false);
          const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.15, 0.1, wt + 0.14), frameMat);
          sill.position.set(posX, 1.1, posZ);
          scene.add(sill);
        } else {
          addBoxCollider(posX, h / 2, posZ - (winW / 2 + segLen / 2), wt, h, segLen, wallMat);
          addBoxCollider(posX, h / 2, posZ + (winW / 2 + segLen / 2), wt, h, segLen, wallMat);
          addBoxCollider(posX, 0.54, posZ, wt, 1.08, winW, wallMat, false);
          addBoxCollider(posX, (h + 2.45) * 0.5, posZ, wt, h - 2.45, winW, wallMat, false);
          const sill = new THREE.Mesh(new THREE.BoxGeometry(wt + 0.14, 0.1, winW + 0.15), frameMat);
          sill.position.set(posX, 1.1, posZ);
          scene.add(sill);
        }
      } else {
        if (isNS) {
          addBoxCollider(posX, h / 2, posZ, len, h, wt, wallMat);
        } else {
          addBoxCollider(posX, h / 2, posZ, wt, h, len, wallMat);
        }
      }
    };

    buildWallSide('north');
    buildWallSide('south');
    buildWallSide('east');
    buildWallSide('west');

    const doorInside = new THREE.Vector3(
      doorSide === 'east' ? cx + w / 2 - 2.0 : doorSide === 'west' ? cx - w / 2 + 2.0 : cx,
      0,
      doorSide === 'south' ? cz + d / 2 - 2.0 : doorSide === 'north' ? cz - d / 2 + 2.0 : cz,
    );
    const doorOutside = new THREE.Vector3(
      doorSide === 'east' ? cx + w / 2 + 2.5 : doorSide === 'west' ? cx - w / 2 - 2.5 : cx,
      0,
      doorSide === 'south' ? cz + d / 2 + 2.5 : doorSide === 'north' ? cz - d / 2 - 2.5 : cz,
    );
    buildings.push({
      minX: cx - w / 2 + 0.35,
      maxX: cx + w / 2 - 0.35,
      minZ: cz - d / 2 + 0.35,
      maxZ: cz + d / 2 - 0.35,
      doorInside,
      doorOutside,
    });
  };

  // === DISTRICT 1: CENTRAL TOWN ===
  // 1. Central Hospital / Pharmacy (-32, -26)
  buildEnterableBuilding({
    cx: -32,
    cz: -26,
    w: 18,
    d: 14,
    h: 4.5,
    doorSide: 'east',
    windowSides: ['south', 'north'],
    floorMat: clinicFloorMat,
    wallMat: concMat,
    accentColor: 0x10b981,
  });
  // Clinic exam beds + reception counter
  addBoxCollider(-35, 0.45, -29.5, 2.4, 0.8, 1.1, clinicFloorMat, false);
  addBoxCollider(-35, 0.45, -22.5, 2.4, 0.8, 1.1, clinicFloorMat, false);
  addBoxCollider(-28, 0.52, -30.5, 3.2, 1.04, 0.9, woodMat, false);

  // 2. Police Precinct (32, -26)
  buildEnterableBuilding({
    cx: 32,
    cz: -26,
    w: 16,
    d: 14,
    h: 4.5,
    doorSide: 'west',
    windowSides: ['south'],
    floorMat: concMat,
    wallMat: brickMat,
    accentColor: 0x3b82f6,
  });
  addBoxCollider(34.5, 0.55, -26, 1.1, 1.1, 5.0, metalMat, false);
  addBoxCollider(29.5, 0.45, -21.5, 2.6, 0.9, 1.1, woodMat, false);

  // 3. Auto Garage / Workshop (-32, 28)
  buildEnterableBuilding({
    cx: -32,
    cz: 28,
    w: 18,
    d: 16,
    h: 5.0,
    doorSide: 'north',
    windowSides: ['east'],
    floorMat: concMat,
    wallMat: metalMat,
    accentColor: 0xd97706,
  });
  addBoxCollider(-36, 0.52, 31.5, 4.2, 1.04, 1.1, woodMat, false);
  addBoxCollider(-28, 1.5, 28, 0.5, 3.0, 0.5, rustMat, false);

  // 4. Residential Apartment Block (32, 28)
  buildEnterableBuilding({
    cx: 32,
    cz: 28,
    w: 18,
    d: 16,
    h: 4.6,
    doorSide: 'north',
    windowSides: ['west', 'south'],
    floorMat: woodMat,
    wallMat: brickMat,
    accentColor: 0xef4444,
  });
  addBoxCollider(28, 2.3, 28, 6.0, 4.6, 0.45, brickMat, false);
  addBoxCollider(36, 0.42, 24, 2.2, 0.84, 1.2, woodMat, false);

  // === DISTRICT 2: NORTHERN INDUSTRIAL DEPOT & SILOS ===
  buildEnterableBuilding({
    cx: -48,
    cz: -115,
    w: 24,
    d: 18,
    h: 5.6,
    doorSide: 'south',
    windowSides: ['east', 'west'],
    floorMat: concMat,
    wallMat: metalMat,
    accentColor: 0xf59e0b,
  });
  addBoxCollider(-48, 0.65, -115, 4.4, 1.3, 1.4, metalMat, false);

  // Industrial Fuel Silos at North Depot
  for (const [sx, sz] of [
    [-26, -114],
    [-26, -123],
  ]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 8.5, 16), rustMat);
    silo.position.set(sx, 4.25, sz);
    silo.castShadow = true;
    silo.receiveShadow = true;
    scene.add(silo);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), metalMat);
    cap.position.set(sx, 8.5, sz);
    scene.add(cap);
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 8.5, 6.2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.position.set(sx, 4.25, sz);
    scene.add(proxy);
    raycastWalls.push(proxy);
    colliders.push({
      minX: sx - 3.1,
      maxX: sx + 3.1,
      minY: 0,
      maxY: 8.5,
      minZ: sz - 3.1,
      maxZ: sz + 3.1,
      thickness: 6.2,
      mesh: proxy,
    });
  }

  // Shipping containers across industrial yard & outskirts
  const containerSpecs: { x: number; z: number; rotY: number; color: number }[] = [
    { x: 26, z: -114, rotY: 0.1, color: 0x1e40af },
    { x: 34, z: -116, rotY: -0.05, color: 0x991b1b },
    { x: 30, z: -124, rotY: 1.55, color: 0x3f6212 },
    { x: -116, z: -26, rotY: 0, color: 0x9a3412 },
    { x: -116, z: 24, rotY: 0.3, color: 0x334155 },
    { x: -112, z: -85, rotY: 1.57, color: 0x1f2937 },
  ];
  for (const sc of containerSpecs) {
    const cMesh = createShippingContainerModel(sc.color);
    cMesh.position.set(sc.x, 0, sc.z);
    cMesh.rotation.y = sc.rotY;
    scene.add(cMesh);
    const isRot = Math.abs(Math.sin(sc.rotY)) > 0.7;
    const sx = isRot ? 6.2 : 2.6;
    const sz = isRot ? 2.6 : 6.2;
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(sx, 2.7, sz),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.position.set(sc.x, 1.35, sc.z);
    scene.add(proxy);
    raycastWalls.push(proxy);
    colliders.push({
      minX: sc.x - sx / 2,
      maxX: sc.x + sx / 2,
      minY: 0,
      maxY: 2.7,
      minZ: sc.z - sz / 2,
      maxZ: sc.z + sz / 2,
      thickness: 2.6,
      mesh: proxy,
    });
    coverPoints.push(new THREE.Vector3(sc.x + 2.8, 0, sc.z));
  }

  // === DISTRICT 3: EASTERN QUARANTINE CHECKPOINT + GUARD TOWER ===
  buildEnterableBuilding({
    cx: 118,
    cz: -26,
    w: 16,
    d: 14,
    h: 4.3,
    doorSide: 'south',
    windowSides: ['west'],
    floorMat: concMat,
    wallMat: concMat,
    accentColor: 0x10b981,
  });
  // Guard watchtower silhouette
  addBoxCollider(108, 3.2, -16, 3.2, 6.4, 3.2, woodMat, true);

  // === DISTRICT 4: SOUTHERN SUBURBS & GAS STATION ===
  buildEnterableBuilding({
    cx: 48,
    cz: 118,
    w: 18,
    d: 14,
    h: 4.3,
    doorSide: 'north',
    windowSides: ['west', 'east'],
    floorMat: clinicFloorMat,
    wallMat: brickMat,
    accentColor: 0x38bdf8,
  });
  // Gas Station Canopy outside South Store
  const canopyRoof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.45, 7.5), metalMat);
  canopyRoof.position.set(28, 4.4, 114);
  canopyRoof.castShadow = true;
  scene.add(canopyRoof);
  addBoxCollider(24, 2.2, 114, 0.55, 4.4, 0.55, metalMat, false);
  addBoxCollider(32, 2.2, 114, 0.55, 4.4, 0.55, metalMat, false);
  addBoxCollider(28, 0.65, 114, 1.4, 1.3, 0.8, rustMat, false);

  buildEnterableBuilding({
    cx: -55,
    cz: 118,
    w: 16,
    d: 14,
    h: 4.2,
    doorSide: 'east',
    windowSides: ['north'],
    floorMat: woodMat,
    wallMat: brickMat,
    accentColor: 0xeab308,
  });

  // Street Cover Barriers scattered across the vast town
  const barrierSpots: [number, number, number, number][] = [
    [0, -14, 3.8, 0.85],
    [14, 0, 0.85, 3.8],
    [-14, 0, 0.85, 3.8],
    [0, 14, 3.8, 0.85],
    [0, -82, 5.0, 0.9],
    [82, 0, 0.9, 5.0],
    [-82, 0, 0.9, 5.0],
    [0, 82, 5.0, 0.9],
    [95, -24, 4.2, 0.9],
    [-95, 26, 4.2, 0.9],
  ];
  for (const [bx, bz, sx, sz] of barrierSpots) {
    addBoxCollider(bx, 0.55, bz, sx, 1.1, sz, concMat, false);
    coverPoints.push(new THREE.Vector3(bx + 1.5, 0, bz + 1.5));
  }

  // Detailed Wrecked Cars & Ambulances along the highway network
  const carConfigs: { x: number; z: number; rotY: number; color: number; amb?: boolean }[] = [
    { x: -4.5, z: -38, rotY: 0.35, color: 0x4b5563 },
    { x: 5.5, z: 36, rotY: -0.45, color: 0x7f1d1d },
    { x: -24, z: 3.8, rotY: 1.48, color: 0xdbe4ea, amb: true },
    { x: 42, z: -3.5, rotY: 1.75, color: 0x1e3a5f },
    { x: 3.5, z: -96, rotY: 0.22, color: 0xdbe4ea, amb: true },
    { x: 102, z: 4.5, rotY: 1.52, color: 0x374151 },
    { x: -96, z: -48, rotY: 0.85, color: 0x5c2b29 },
    { x: 4.5, z: 108, rotY: -0.25, color: 0x3f4e4f },
  ];
  for (const c of carConfigs) {
    const car = createWreckedCarModel(c.color, textures.contactShadow, Boolean(c.amb));
    car.position.set(c.x, 0, c.z);
    car.rotation.y = c.rotY;
    scene.add(car);
    const isZ = Math.abs(Math.sin(c.rotY)) > 0.7;
    const sx = isZ ? 4.45 : 2.15;
    const sz = isZ ? 2.15 : 4.45;
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(sx, 1.6, sz),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.position.set(c.x, 0.8, c.z);
    scene.add(proxy);
    raycastWalls.push(proxy);
    colliders.push({
      minX: c.x - sx / 2,
      maxX: c.x + sx / 2,
      minY: 0,
      maxY: 1.6,
      minZ: c.z - sz / 2,
      maxZ: c.z + sz / 2,
      thickness: 1.8,
      mesh: proxy,
    });
    coverPoints.push(new THREE.Vector3(c.x + 2.4, 0, c.z));
  }

  // Streetlight Poles (emissive bulbs + coordinates for pooled night PointLight!)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 0.45, metalness: 0.8 });
  const lampBulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    emissive: 0xffb347,
    emissiveIntensity: 0.2,
  });
  const lampCoords: [number, number][] = [
    [-9, -18],
    [9, 18],
    [-22, 9],
    [22, -9],
    [-9, -86],
    [9, 86],
    [88, -9],
    [-88, 9],
    [48, -90],
    [-55, 90],
  ];
  for (const [lx, lz] of lampCoords) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.8, 7), poleMat);
    pole.position.set(lx, 2.9, lz);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 0.09), poleMat);
    arm.position.set(lx + 0.5, 5.75, lz);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.28), poleMat);
    housing.position.set(lx + 0.95, 5.72, lz);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.22), lampBulbMat);
    bulb.position.set(lx + 0.95, 5.64, lz);
    scene.add(pole, arm, housing, bulb);
    streetLampPositions.push(new THREE.Vector3(lx + 0.95, 5.3, lz));
  }

  // Natural Perimeter Forest + Outskirts Boulders (InstancedMesh - zero shadow overhead!)
  const treeCount = 160;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.34, 5.4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2f26, roughness: 0.92 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crownGeo = new THREE.ConeGeometry(1.9, 5.0, 6);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x263829, roughness: 0.88 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const tint = new THREE.Color();

  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
    const dist = 162 + Math.random() * 54;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;
    const scale = 0.85 + Math.random() * 0.65;
    dummy.position.set(tx, 2.7 * scale, tz);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.06);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, 6.0 * scale, tz);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);

    tint.setHSL(0.32, 0.22, 0.15 + Math.random() * 0.08);
    crowns.setColorAt(i, tint);
  }
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  scene.add(trunks, crowns);

  const rockCount = 45;
  const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4b5156, roughness: 0.92 });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  for (let i = 0; i < rockCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 138 + Math.random() * 50;
    const rx = Math.cos(angle) * dist;
    const rz = Math.sin(angle) * dist;
    const s = 0.7 + Math.random() * 1.1;
    dummy.position.set(rx, s * 0.4, rz);
    dummy.rotation.set(Math.random(), Math.random(), Math.random());
    dummy.scale.set(s * 1.2, s * 0.8, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.computeBoundingSphere();
  scene.add(rocks);

  // Dynamic Physics Props: Explosive Barrels & Crates
  const addProp = (id: string, kind: 'barrel' | 'crate', x: number, z: number) => {
    const mesh =
      kind === 'barrel'
        ? createExplosiveBarrel(textures.contactShadow)
        : createLootCrateModel('stash', textures.woodCrate, textures.contactShadow);
    mesh.position.set(x, 0, z);
    scene.add(mesh);

    const hitMesh = new THREE.Mesh(
      kind === 'barrel'
        ? new THREE.CylinderGeometry(0.4, 0.4, 1.1, 8)
        : new THREE.BoxGeometry(0.9, 0.62, 0.6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hitMesh.position.set(x, kind === 'barrel' ? 0.55 : 0.31, z);
    hitMesh.userData.propId = id;
    scene.add(hitMesh);
    propHitMeshes.push(hitMesh);

    props.push({
      id,
      kind,
      mesh,
      hitMesh,
      pos: new THREE.Vector3(x, 0, z),
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
      radius: kind === 'barrel' ? 0.42 : 0.5,
      halfHeight: kind === 'barrel' ? 0.55 : 0.31,
      mass: kind === 'barrel' ? 28 : 18,
      isExplosive: kind === 'barrel',
      hp: kind === 'barrel' ? 40 : 80,
      exploded: false,
    });
  };

  const barrelSpots: [number, number][] = [
    [-8, -6],
    [9, -12],
    [-26, 23],
    [16, 12],
    [-44, -108],
    [29, -110],
    [112, -19],
    [45, 110],
    [-50, 112],
  ];
  barrelSpots.forEach(([bx, bz], i) => addProp(`barrel_${i}`, 'barrel', bx, bz));

  const cratePropSpots: [number, number][] = [
    [-4, 8],
    [7, -5],
    [-38, -112],
    [116, -29],
  ];
  cratePropSpots.forEach(([cx, cz], i) => addProp(`crate_${i}`, 'crate', cx, cz));

  // World Loot Containers across ALL Districts (with Grid-Slot Items & Periodic Respawn!)
  const addLootNode = (
    id: string,
    visualKind: 'med' | 'police' | 'stash',
    x: number,
    z: number,
    bundle: Omit<LootBundle, 'id' | 'searched' | 'kind' | 'grid'>,
  ) => {
    const mesh = createLootCrateModel(visualKind, textures.woodCrate, textures.contactShadow);
    mesh.position.set(x, 0, z);
    mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.userData.lootId = id;
      }
    });
    scene.add(mesh);
    lootNodes.push({
      id,
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      isPermanent: true,
      visualKind,
      respawnTimer: 0,
      bundle: {
        ...bundle,
        id,
        kind: 'container',
        grid: buildGridFromLoot(
          bundle.weapons,
          bundle.ammo,
          bundle.meds,
          bundle.backpacks ?? [],
        ),
        searched: false,
      },
    });
  };

  addLootNode('loot_clinic_1', 'med', -38, -30, {
    labelUk: 'Аптечна шафа #1',
    labelEn: 'Pharmacy Cabinet #1',
    weapons: [],
    ammo: {},
    meds: {
      bandage: 3,
      tourniquet: 1,
      syringe_morphine: 1,
      syringe_naloxone: 2,
      antibiotics: 2,
      tweezers: 1,
    },
  });
  addLootNode('loot_clinic_2', 'med', -38, -22, {
    labelUk: 'Склад інфузій #2',
    labelEn: 'Trauma & Blood Bank #2',
    weapons: [],
    ammo: {},
    meds: {
      blood_bag: 2,
      transfusion_tube: 2,
      syringe_saline: 1,
      syringe_procoagulant: 2,
      syringe_immunobooster: 2,
      splint: 1,
    },
  });
  addLootNode('loot_police_1', 'police', 37, -30, {
    labelUk: 'Поліцейський арсенал',
    labelEn: 'Police Armory Locker',
    weapons: ['shotgun_12ga', 'rifle_556'],
    ammo: { '12ga': 12, '556': 45, '9mm': 24, frag: 2 },
    meds: { tourniquet: 1, bandage: 1, blood_bag: 1 },
    backpacks: ['tactical'],
  });
  addLootNode('loot_garage_1', 'stash', -38, 33, {
    labelUk: 'Склад автомайстерні',
    labelEn: 'Garage Rifle Stash',
    weapons: ['fire_axe', 'sniper_762'],
    ammo: { '762': 15, '9mm': 18 },
    meds: { bandage: 2, tweezers: 1, transfusion_tube: 1 },
  });
  addLootNode('loot_apt_1', 'stash', 37, 33, {
    labelUk: 'Сховок мешканця',
    labelEn: 'Apartment Stash',
    weapons: ['katana'],
    ammo: { '9mm': 16, '12ga': 6 },
    meds: { bandage: 2, antibiotics: 1, syringe_morphine: 1 },
    backpacks: ['tactical'],
  });
  addLootNode('loot_depot_1', 'police', -54, -120, {
    labelUk: 'Промисловий контейнер',
    labelEn: 'Industrial Armory Crate',
    weapons: ['rifle_556', 'frag_grenade'],
    ammo: { '556': 60, '762': 10, frag: 2 },
    meds: { bandage: 2, syringe_procoagulant: 1, blood_bag: 1, transfusion_tube: 1 },
    backpacks: ['expedition'],
  });
  addLootNode('loot_quarantine_1', 'med', 122, -30, {
    labelUk: 'Карантинний медблок',
    labelEn: 'Quarantine Med Locker',
    weapons: [],
    ammo: { '9mm': 15 },
    meds: {
      blood_bag: 2,
      transfusion_tube: 2,
      antibiotics: 2,
      syringe_immunobooster: 2,
      syringe_naloxone: 1,
      syringe_adrenaline: 1,
    },
    backpacks: ['expedition'],
  });
  addLootNode('loot_south_1', 'stash', 52, 122, {
    labelUk: 'Схованка АЗС',
    labelEn: 'Gas Station Stash',
    weapons: ['shotgun_12ga'],
    ammo: { '12ga': 16, '9mm': 12 },
    meds: { bandage: 2, splint: 1, blood_bag: 1, antibiotics: 1 },
  });

  const patrolPoints = [
    new THREE.Vector3(-12, 0, -12),
    new THREE.Vector3(16, 0, -12),
    new THREE.Vector3(18, 0, 18),
    new THREE.Vector3(-18, 0, 18),
    new THREE.Vector3(-32, 0, -25),
    new THREE.Vector3(32, 0, -25),
    new THREE.Vector3(-32, 0, 26),
    new THREE.Vector3(-48, 0, -112),
    new THREE.Vector3(-42, 0, -88),
    new THREE.Vector3(45, 0, -90),
    new THREE.Vector3(96, 0, -16),
    new THREE.Vector3(45, 0, 96),
    new THREE.Vector3(-55, 0, 96),
    new THREE.Vector3(-92, 0, 0),
  ];

  return {
    colliders,
    raycastWalls,
    props,
    propHitMeshes,
    lootNodes,
    coverPoints,
    patrolPoints,
    interiorCenters,
    buildings,
    streetLampPositions,
    lampBulbMat,
  };
}
