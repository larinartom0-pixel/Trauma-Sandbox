import * as THREE from 'three';
import {
  createProceduralAnimState,
  createRagdollState,
  ProceduralAnimState,
  RagdollState,
  resetGoreDollPose,
  stepArticulatedRagdoll,
  stepProceduralCharacterAnim,
  wakeRagdoll,
} from './animation';
import { soundEngine } from './audio';
import { WEAPON_DEFS } from './data';
import { buildGridFromLoot, syncLootFromGrid } from './inventory';
import { createGoreDollModel, createWeaponMesh, GoreDollRig } from './models';
import { NavMeshGrid } from './navmesh';
import {
  applyBandageStroke,
  applyLimbTrauma,
  createInitialPhysiology,
  getEffectiveLimbBleed,
  tickPhysiology,
} from './physiology';
import {
  BackpackTierId,
  BotAIState,
  BotArchetype,
  BotDisposition,
  CaliberId,
  GestureId,
  LimbId,
  LootBundle,
  MedItemId,
  PhysiologyState,
  WeaponId,
} from './types';
import { BuildingZone, DynamicProp, WallCollider, WORLD_BOUND } from './world';

export interface BotEntity {
  id: string;
  nameUk: string;
  nameEn: string;
  archetype: BotArchetype;
  disposition: BotDisposition;
  aiState: BotAIState;
  trust: number;
  rig: GoreDollRig;
  animState: ProceduralAnimState;
  recoilPulse: number;
  flinchPitch: number;
  flinchRoll: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  phys: PhysiologyState;
  weapon: WeaponId;
  ammoInMag: number;
  fireCooldown: number;
  reloadTimer: number;
  healingTimer: number;
  patrolTarget: THREE.Vector3;
  lastKnownPlayerPos: THREE.Vector3 | null;
  stateTimer: number;
  lookAroundTimer: number;
  coverPos: THREE.Vector3 | null;
  coverTimer: number;
  strafeDir: number;
  strafeTimer: number;
  crouchFactor: number;
  path: THREE.Vector3[];
  pathIndex: number;
  pathGoal: THREE.Vector3;
  repathTimer: number;
  stuckTimer: number;
  lastProgressPos: THREE.Vector3;
  ragdoll: RagdollState | null;
  loot: LootBundle;
  lootDropped: boolean;
  grabbedByCrusher: boolean;
  deadTimer: number;
  aggroBotId: string | null;
  aggroBotTimer: number;
  speechText: string | null;
  speechTone: 'neutral' | 'warn' | 'danger' | 'friendly';
  speechTimer: number;
}

const _tmpVec = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _botFwd = new THREE.Vector3();
const _sepVec = new THREE.Vector3();

function lerpAngleStep(current: number, target: number, maxStep: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

function rayIntersectsAABBDist(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  c: WallCollider,
): number {
  let tmin = 0;
  let tmax = maxDist;

  if (Math.abs(dx) < 1e-6) {
    if (ox < c.minX || ox > c.maxX) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (c.minX - ox) * inv;
    let t2 = (c.maxX - ox) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  if (Math.abs(dy) < 1e-6) {
    if (oy < c.minY || oy > c.maxY) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (c.minY - oy) * inv;
    let t2 = (c.maxY - oy) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  if (Math.abs(dz) < 1e-6) {
    if (oz < c.minZ || oz > c.maxZ) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (c.minZ - oz) * inv;
    let t2 = (c.maxZ - oz) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  return tmin >= 0 && tmin <= maxDist ? tmin : -1;
}

function resolveBotWalls(pos: THREE.Vector3, colliders: WallCollider[], radius = 0.48) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (pos.y > c.maxY || pos.y + 1.72 < c.minY) continue;
      const closestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const closestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          pos.x += (dx / dist) * push;
          pos.z += (dz / dist) * push;
        } else {
          // Center fell inside collider: push out via nearest AABB face
          const dLeft = Math.abs(pos.x - c.minX);
          const dRight = Math.abs(c.maxX - pos.x);
          const dBack = Math.abs(pos.z - c.minZ);
          const dFront = Math.abs(c.maxZ - pos.z);
          const minD = Math.min(dLeft, dRight, dBack, dFront);
          if (minD === dLeft) pos.x = c.minX - radius;
          else if (minD === dRight) pos.x = c.maxX + radius;
          else if (minD === dBack) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
      }
    }
  }
  pos.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.x));
  pos.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.z));
}

function resolveRagdollNodeCollisions(
  pos: THREE.Vector3,
  radius: number,
  colliders: WallCollider[],
) {
  if (pos.y < radius) pos.y = radius;
  for (const c of colliders) {
    if (pos.y - radius > c.maxY || pos.y + radius < c.minY) continue;
    if (
      pos.x + radius > c.minX &&
      pos.x - radius < c.maxX &&
      pos.z + radius > c.minZ &&
      pos.z - radius < c.maxZ
    ) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq > 1e-6) {
        const d = Math.sqrt(dSq);
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        pos.y = Math.max(pos.y, c.maxY + radius);
      }
    }
  }
  pos.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.x));
  pos.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.z));
}

export class BotManager {
  bots: BotEntity[] = [];
  navMesh: NavMeshGrid;
  private scene: THREE.Scene;
  private shadowTex: THREE.Texture;
  private colliders: WallCollider[];
  private patrolPoints: THREE.Vector3[];
  private dynamicProps: DynamicProp[];
  private cachedRaycastMeshes: THREE.Mesh[] = [];
  private meshesDirty = true;
  private lastKnownGlobalPlayerPos = new THREE.Vector3();
  private botSpawnSeq = 100;
  private respawnCheckTimer = 14;
  private readonly targetActiveBots = 8;
  private onPlayerHit: (
    limb: LimbId,
    damage: number,
    bleed: number,
    fractureChance: number,
    fromPos: THREE.Vector3,
  ) => void;
  private onBotSpeech: (text: string, tone: 'neutral' | 'warn' | 'danger' | 'friendly') => void;
  private onSpawnBlood: (pos: THREE.Vector3, count: number) => void;
  private onSpawnMedDrop: (pos: THREE.Vector3, med: MedItemId) => void;
  private onSpawnSpark?: (pos: THREE.Vector3) => void;

  constructor(
    scene: THREE.Scene,
    shadowTex: THREE.Texture,
    colliders: WallCollider[],
    patrolPoints: THREE.Vector3[],
    callbacks: {
      onPlayerHit: BotManager['onPlayerHit'];
      onBotSpeech: BotManager['onBotSpeech'];
      onSpawnBlood: BotManager['onSpawnBlood'];
      onSpawnMedDrop: BotManager['onSpawnMedDrop'];
      onSpawnSpark?: (pos: THREE.Vector3) => void;
    },
    coverPoints: THREE.Vector3[] = [],
    dynamicProps: DynamicProp[] = [],
    buildings: BuildingZone[] = [],
  ) {
    this.scene = scene;
    this.shadowTex = shadowTex;
    this.colliders = colliders;
    this.patrolPoints = patrolPoints;
    this.dynamicProps = dynamicProps;
    this.navMesh = new NavMeshGrid(colliders, coverPoints, buildings);
    this.onPlayerHit = callbacks.onPlayerHit;
    this.onBotSpeech = callbacks.onBotSpeech;
    this.onSpawnBlood = callbacks.onSpawnBlood;
    this.onSpawnMedDrop = callbacks.onSpawnMedDrop;
    this.onSpawnSpark = callbacks.onSpawnSpark;
  }

  /**
   * Spawns a sparse, well-spaced population across the 400x400m town & outskirts.
   * No glowing beacons or disposition tags — players must read posture & communicate!
   */
  spawnInitialTownBots() {
    const specs: {
      archetype: BotArchetype;
      disposition: BotDisposition;
      weapon: WeaponId;
      x: number;
      z: number;
      nameUk: string;
      nameEn: string;
      meds: Partial<Record<MedItemId, number>>;
      ammo: Partial<Record<CaliberId, number>>;
      backpacks?: BackpackTierId[];
    }[] = [
      {
        archetype: 'medic',
        disposition: 'friendly',
        weapon: 'pistol_9mm',
        x: -16,
        z: -24,
        nameUk: 'Незнайомець у халаті',
        nameEn: 'Town Medic',
        meds: {
          bandage: 3,
          blood_bag: 1,
          transfusion_tube: 1,
          antibiotics: 1,
          syringe_immunobooster: 1,
          syringe_naloxone: 1,
        },
        ammo: { '9mm': 12 },
      },
      {
        archetype: 'survivor',
        disposition: 'cautious',
        weapon: 'pistol_9mm',
        x: 22,
        z: -6,
        nameUk: 'Озброєний сталкер',
        nameEn: 'Armed Wanderer',
        meds: { bandage: 2, splint: 1, syringe_morphine: 1, transfusion_tube: 1 },
        ammo: { '9mm': 16 },
      },
      {
        archetype: 'survivor',
        disposition: 'cautious',
        weapon: 'crowbar',
        x: -18,
        z: 42,
        nameUk: 'Мандрівник',
        nameEn: 'Scavenger',
        meds: { bandage: 2, tweezers: 1, syringe_procoagulant: 1, antibiotics: 1 },
        ammo: { '9mm': 8 },
        backpacks: ['tactical'],
      },
      {
        archetype: 'raider',
        disposition: 'hostile',
        weapon: 'rifle_556',
        x: -36,
        z: -98,
        nameUk: 'Невідомий боєць',
        nameEn: 'Armed Raider',
        meds: { bandage: 2, syringe_adrenaline: 1, blood_bag: 1 },
        ammo: { '556': 28 },
      },
      {
        archetype: 'enforcer',
        disposition: 'friendly',
        weapon: 'shotgun_12ga',
        x: 34,
        z: -95,
        nameUk: 'Охоронець периметра',
        nameEn: 'Patrol Guard',
        meds: { bandage: 2, tourniquet: 1, syringe_immunobooster: 1 },
        ammo: { '12ga': 8 },
      },
      {
        archetype: 'raider',
        disposition: 'hostile',
        weapon: 'pistol_9mm',
        x: 98,
        z: -18,
        nameUk: 'Мародер у капюшоні',
        nameEn: 'Hooded Scav',
        meds: { bandage: 2, tourniquet: 1, syringe_morphine: 1, antibiotics: 1 },
        ammo: { '9mm': 18 },
      },
      {
        archetype: 'raider',
        disposition: 'hostile',
        weapon: 'shotgun_12ga',
        x: 38,
        z: 102,
        nameUk: 'Озброєний невідомий',
        nameEn: 'Highway Raider',
        meds: { bandage: 2, syringe_procoagulant: 1, transfusion_tube: 1 },
        ammo: { '12ga': 10 },
      },
      {
        archetype: 'infected',
        disposition: 'hostile',
        weapon: 'hands',
        x: -96,
        z: -14,
        nameUk: 'Заражений',
        nameEn: 'Feral Infected',
        meds: { bandage: 1 },
        ammo: {},
      },
    ];

    specs.forEach((s, idx) => {
      this.spawnBotFromSpec(`bot_${idx}`, s);
    });
  }

  private spawnBotFromSpec(
    id: string,
    s: {
      archetype: BotArchetype;
      disposition: BotDisposition;
      weapon: WeaponId;
      x: number;
      z: number;
      nameUk: string;
      nameEn: string;
      meds: Partial<Record<MedItemId, number>>;
      ammo: Partial<Record<CaliberId, number>>;
      backpacks?: BackpackTierId[];
    },
  ) {
    const rig = createGoreDollModel(id, s.archetype, this.shadowTex);
    const safeSpawn =
      this.navMesh.findNearestWalkable(s.x, s.z) ?? new THREE.Vector3(s.x, 0, s.z);
    rig.root.position.copy(safeSpawn);
    this.scene.add(rig.root);

    if (s.weapon !== 'hands') {
      const wMesh = createWeaponMesh(s.weapon);
      wMesh.scale.setScalar(0.86);
      rig.weaponMount.add(wMesh);
    }

    const initPatrol =
      this.patrolPoints[Math.floor(Math.random() * this.patrolPoints.length)]?.clone() ??
      safeSpawn.clone();
    const yaw = Math.random() * Math.PI * 2;

    const bot: BotEntity = {
      id,
      nameUk: s.nameUk,
      nameEn: s.nameEn,
      archetype: s.archetype,
      disposition: s.disposition,
      aiState: 'patrol',
      trust: s.disposition === 'friendly' ? 65 : s.disposition === 'cautious' ? 15 : -80,
      rig,
      animState: createProceduralAnimState(),
      recoilPulse: 0,
      flinchPitch: 0,
      flinchRoll: 0,
      pos: safeSpawn.clone(),
      vel: new THREE.Vector3(),
      yaw,
      targetYaw: yaw,
      phys: createInitialPhysiology(),
      weapon: s.weapon,
      ammoInMag: WEAPON_DEFS[s.weapon].magSize,
      fireCooldown: 0.5 + Math.random() * 0.6,
      reloadTimer: 0,
      healingTimer: 0,
      patrolTarget: initPatrol,
      lastKnownPlayerPos: null,
      stateTimer: 2 + Math.random() * 3,
      lookAroundTimer: 0,
      coverPos: null,
      coverTimer: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: 1.4 + Math.random() * 1.4,
      crouchFactor: 0,
      path: [],
      pathIndex: 0,
      pathGoal: initPatrol.clone(),
      repathTimer: Math.random() * 0.5,
      stuckTimer: 0,
      lastProgressPos: safeSpawn.clone(),
      ragdoll: null,
      loot: {
        id: `loot_${id}`,
        labelUk: `Спорядження: ${s.nameUk}`,
        labelEn: `Corpse Loot: ${s.nameEn}`,
        kind: 'corpse',
        weapons: s.weapon !== 'hands' ? [s.weapon] : [],
        ammo: s.ammo,
        meds: s.meds,
        backpacks: s.backpacks ?? [],
        grid: buildGridFromLoot(
          s.weapon !== 'hands' ? [s.weapon] : [],
          s.ammo,
          s.meds,
          s.backpacks ?? [],
        ),
        searched: false,
      },
      lootDropped: false,
      grabbedByCrusher: false,
      deadTimer: 0,
      aggroBotId: null,
      aggroBotTimer: 0,
      speechText: null,
      speechTone: 'neutral',
      speechTimer: 0,
    };
    this.bots.push(bot);
    this.meshesDirty = true;
  }

  private tryRespawnFarBot(playerPos: THREE.Vector3) {
    const farPoints = this.patrolPoints.filter(
      (pt) => pt.distanceTo(playerPos) >= 56,
    );
    const pool =
      farPoints.length > 0
        ? farPoints
        : this.patrolPoints.filter((pt) => pt.distanceTo(playerPos) >= 40);
    if (pool.length === 0) return;

    const spot = pool[Math.floor(Math.random() * pool.length)];
    const roll = Math.random();
    const templates: {
      archetype: BotArchetype;
      disposition: BotDisposition;
      weapon: WeaponId;
      nameUk: string;
      nameEn: string;
      meds: Partial<Record<MedItemId, number>>;
      ammo: Partial<Record<CaliberId, number>>;
      backpacks?: BackpackTierId[];
    }[] = [
      {
        archetype: 'raider',
        disposition: 'hostile',
        weapon: Math.random() < 0.5 ? 'pistol_9mm' : 'rifle_556',
        nameUk: 'Мародер з околиць',
        nameEn: 'Outskirts Raider',
        meds: {
          bandage: 2,
          blood_bag: Math.random() < 0.5 ? 1 : 0,
          antibiotics: 1,
        },
        ammo: { '9mm': 14, '556': 20 },
        backpacks: Math.random() < 0.25 ? ['tactical'] : [],
      },
      {
        archetype: 'survivor',
        disposition: 'cautious',
        weapon: Math.random() < 0.6 ? 'pistol_9mm' : 'shotgun_12ga',
        nameUk: 'Мандрівний сталкер',
        nameEn: 'Drifter',
        meds: {
          bandage: 2,
          transfusion_tube: 1,
          syringe_immunobooster: Math.random() < 0.5 ? 1 : 0,
        },
        ammo: { '9mm': 12, '12ga': 6 },
      },
      {
        archetype: 'medic',
        disposition: 'friendly',
        weapon: 'pistol_9mm',
        nameUk: 'Польовий санітар',
        nameEn: 'Field Medic',
        meds: {
          bandage: 2,
          blood_bag: 1,
          transfusion_tube: 1,
          antibiotics: 1,
          syringe_immunobooster: 1,
        },
        ammo: { '9mm': 10 },
        backpacks: Math.random() < 0.3 ? ['expedition'] : [],
      },
      {
        archetype: 'infected',
        disposition: 'hostile',
        weapon: 'hands',
        nameUk: 'Заражений блукач',
        nameEn: 'Feral Infected',
        meds: { bandage: 1 },
        ammo: {},
      },
    ];

    const tpl =
      roll < 0.45
        ? templates[0]
        : roll < 0.72
          ? templates[1]
          : roll < 0.88
            ? templates[2]
            : templates[3];

    const id = `bot_${this.botSpawnSeq++}`;
    this.spawnBotFromSpec(id, {
      ...tpl,
      x: spot.x + (Math.random() - 0.5) * 4,
      z: spot.z + (Math.random() - 0.5) * 4,
    });
  }

  getAllRaycastMeshes(): THREE.Mesh[] {
    if (this.meshesDirty) {
      this.cachedRaycastMeshes.length = 0;
      for (const b of this.bots) {
        (Object.keys(b.rig.limbMeshes) as LimbId[]).forEach((lid) => {
          if (!b.phys.limbs[lid].severed) {
            this.cachedRaycastMeshes.push(...b.rig.limbMeshes[lid]);
          }
        });
      }
      this.meshesDirty = false;
    }
    return this.cachedRaycastMeshes;
  }

  private totalBleed(phys: PhysiologyState): number {
    return (Object.keys(phys.limbs) as LimbId[]).reduce(
      (sum, k) => sum + getEffectiveLimbBleed(phys, phys.limbs[k]),
      0,
    );
  }

  damageBotLimb(
    botId: string,
    limbId: LimbId,
    damage: number,
    bleedPower: number,
    fractureChance: number,
    severChance: number,
    impulseDir: THREE.Vector3,
    attackerIsPlayer: boolean,
    attackerBotId?: string,
  ): { severed: boolean; killed: boolean } {
    const bot = this.bots.find((b) => b.id === botId);
    if (!bot) return { severed: false, killed: false };

    const { fracturedNow, severedNow } = applyLimbTrauma(
      bot.phys,
      limbId,
      damage,
      bleedPower,
      fractureChance,
      severChance,
      Math.random() < 0.22 ? 1 : 0,
    );

    bot.vel.addScaledVector(impulseDir, Math.min(7, damage * 0.08));

    // Procedural hit flinch along impact direction relative to bot facing
    const sinY = Math.sin(bot.yaw);
    const cosY = Math.cos(bot.yaw);
    const hitFwd = impulseDir.x * sinY + impulseDir.z * cosY;
    const hitRight = impulseDir.x * cosY - impulseDir.z * sinY;
    const flinchStrength = Math.min(0.6, 0.22 + damage * 0.008);
    bot.flinchPitch = hitFwd * flinchStrength;
    bot.flinchRoll = -hitRight * flinchStrength;

    if (severedNow && limbId !== 'torso') {
      bot.rig.limbs[limbId].visible = false;
      this.meshesDirty = true;
      this.onSpawnBlood(bot.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 18);
      if (limbId === 'rightArm') {
        bot.weapon = 'hands';
        bot.rig.weaponMount.clear();
      }
    }

    if (fracturedNow && limbId === 'rightArm' && Math.random() < 0.7) {
      bot.weapon = 'hands';
      bot.rig.weaponMount.clear();
      this.speak(bot, 'Рука зламана! Зброя випала!', 'neutral', 3.4);
    }

    if (
      attackerIsPlayer &&
      bot.aiState !== 'dead' &&
      bot.aiState !== 'unconscious'
    ) {
      if (bot.disposition !== 'hostile') {
        bot.disposition = 'hostile';
        bot.trust = -100;
        this.speak(bot, 'Контакт! Займаю укриття!', 'danger', 3.4);
      }
      bot.lastKnownPlayerPos = this.lastKnownGlobalPlayerPos.clone();

      // React tactically like a real player: dash for cover if not infected!
      if (bot.archetype !== 'infected' && bot.aiState !== 'crawl') {
        const cover = this.navMesh.findBestCover(
          bot.pos,
          this.lastKnownGlobalPlayerPos,
          (a, b) => this.hasLineOfSight(a, b),
          28,
        );
        if (cover) {
          bot.coverPos = cover;
          bot.coverTimer = 2.6 + Math.random() * 1.4;
          bot.aiState = 'takeCover';
          bot.repathTimer = 0;
        } else {
          bot.aiState = 'engage';
          bot.strafeDir = -bot.strafeDir;
        }
      } else {
        bot.aiState = 'engage';
      }
    } else if (
      attackerBotId &&
      attackerBotId !== bot.id &&
      bot.aiState !== 'dead' &&
      bot.aiState !== 'unconscious' &&
      bot.aiState !== 'surrender'
    ) {
      // Immediately notice & fight back against the rival bot shooting us!
      const attacker = this.bots.find((b) => b.id === attackerBotId);
      if (attacker && attacker.aiState !== 'dead') {
        bot.aggroBotId = attackerBotId;
        bot.aggroBotTimer = 18;
        bot.targetYaw = Math.atan2(
          attacker.pos.x - bot.pos.x,
          attacker.pos.z - bot.pos.z,
        );
        if (bot.archetype !== 'infected' && bot.aiState !== 'crawl' && Math.random() < 0.55) {
          const cover = this.navMesh.findBestCover(
            bot.pos,
            attacker.pos,
            (a, b) => this.hasLineOfSight(a, b),
            24,
          );
          if (cover) {
            bot.coverPos = cover;
            bot.coverTimer = 2.0 + Math.random() * 1.2;
            bot.aiState = 'takeCover';
            bot.repathTimer = 0;
          } else {
            bot.aiState = 'engage';
          }
        } else {
          bot.aiState = 'engage';
        }
        if (bot.pos.distanceTo(this.lastKnownGlobalPlayerPos) < 34) {
          this.speak(bot, 'По мені стріляють! Вогонь у відповідь!', 'warn', 3.2);
        }
      }
    }

    if (bot.phys.consciousness === 'dead') {
      this.killBot(bot, impulseDir);
      return { severed: severedNow, killed: true };
    }

    if (
      bot.phys.consciousness === 'unconscious' ||
      bot.phys.consciousness === 'cardiacArrest'
    ) {
      this.dropBotUnconscious(bot);
    }

    return { severed: severedNow, killed: false };
  }

  private initRagdollNodes(bot: BotEntity, impulse?: THREE.Vector3) {
    bot.ragdoll = createRagdollState(bot.pos, bot.yaw, bot.crouchFactor, impulse);
  }

  private resetRigToStanding(bot: BotEntity) {
    bot.ragdoll = null;
    bot.rig.contactShadow.visible = true;
    bot.rig.root.position.copy(bot.pos);
    bot.rig.root.rotation.set(0, bot.yaw, 0);
    resetGoreDollPose(bot.rig);
  }

  private stepRagdoll(bot: BotEntity, dt: number, pinPelvis?: THREE.Vector3) {
    if (!bot.ragdoll) return;
    stepArticulatedRagdoll(
      bot.ragdoll,
      bot.rig,
      bot.pos,
      this.colliders,
      resolveRagdollNodeCollisions,
      dt,
      pinPelvis,
    );
  }

  stepGrabbedRagdoll(bot: BotEntity, pinPos: THREE.Vector3, dt: number) {
    if (!bot.ragdoll) return;
    wakeRagdoll(bot.ragdoll);
    this.stepRagdoll(bot, dt, pinPos);
  }

  private dropBotUnconscious(bot: BotEntity) {
    if (bot.aiState === 'dead' || bot.aiState === 'unconscious') return;
    bot.aiState = 'unconscious';
    bot.lootDropped = true;
    bot.rig.contactShadow.visible = false;
    this.initRagdollNodes(bot);
    bot.rig.root.traverse((c) => {
      c.userData.lootId = bot.loot.id;
    });
  }

  killBot(bot: BotEntity, impulse?: THREE.Vector3) {
    if (bot.aiState === 'dead') {
      if (bot.ragdoll && impulse) {
        wakeRagdoll(bot.ragdoll);
        const imp = impulse.clone().clampLength(0, 8).multiplyScalar(0.025);
        bot.ragdoll.nodes[1].prevPos.sub(imp);
        bot.ragdoll.nodes[2].prevPos.sub(imp);
      }
      return;
    }
    bot.aiState = 'dead';
    bot.phys.consciousness = 'dead';
    bot.rig.contactShadow.visible = false;
    if (!bot.ragdoll) {
      this.initRagdollNodes(bot, impulse);
    } else if (impulse) {
      wakeRagdoll(bot.ragdoll);
      const imp = impulse.clone().clampLength(0, 8).multiplyScalar(0.025);
      bot.ragdoll.nodes[1].prevPos.sub(imp);
      bot.ragdoll.nodes[2].prevPos.sub(imp);
    }
    bot.lootDropped = true;
    bot.rig.root.traverse((c) => {
      c.userData.lootId = bot.loot.id;
    });
  }

  alertBotsToGunshot(origin: THREE.Vector3, radius = 44) {
    for (const bot of this.bots) {
      if (
        bot.aiState === 'dead' ||
        bot.aiState === 'unconscious' ||
        bot.aiState === 'surrender' ||
        bot.aiState === 'flee'
      ) {
        continue;
      }
      if (bot.pos.distanceTo(origin) <= radius) {
        const shifted =
          !bot.lastKnownPlayerPos || bot.lastKnownPlayerPos.distanceTo(origin) > 2.5;
        bot.lastKnownPlayerPos = origin.clone();
        if (
          bot.disposition === 'hostile' &&
          (bot.aiState === 'patrol' || bot.aiState === 'search' || bot.aiState === 'alert')
        ) {
          if (bot.aiState === 'patrol' || shifted) {
            bot.repathTimer = 0;
          }
          bot.aiState = 'search';
          bot.stateTimer = 10.0;
          bot.lookAroundTimer = 0;
        } else if (bot.disposition === 'cautious' && bot.aiState === 'patrol') {
          bot.aiState = 'warn';
          bot.stateTimer = 4.5;
        }
      }
    }
  }

  handlePlayerGesture(
    gesture: GestureId,
    playerPos: THREE.Vector3,
    playerForward: THREE.Vector3,
    playerArmed: boolean,
  ) {
    let reacted = false;
    for (const bot of this.bots) {
      if (bot.aiState === 'dead' || bot.aiState === 'unconscious') continue;
      const dist = bot.pos.distanceTo(playerPos);
      if (dist > 18) continue;

      _toTarget.subVectors(bot.pos, playerPos).normalize();
      if (_toTarget.dot(playerForward) < 0.15 && dist > 6) continue;

      reacted = true;

      if (gesture === 'peace') {
        if (bot.disposition === 'cautious') {
          bot.trust = Math.min(100, bot.trust + 40);
          bot.aiState = 'patrol';
          if (bot.trust >= 50) {
            bot.disposition = 'friendly';
            this.speak(bot, 'Гаразд, тепер я тобі довіряю.', 'friendly', 3.8);
          } else {
            this.speak(bot, 'Зрозумів, я не ворог.', 'neutral', 3.4);
          }
        } else if (bot.disposition === 'friendly') {
          this.speak(bot, 'Прикрию якщо що!', 'friendly', 3.2);
        } else {
          this.speak(bot, 'Пізно домовлятись!', 'danger', 3.0);
        }
      } else if (gesture === 'follow') {
        if (bot.disposition === 'friendly') {
          bot.aiState = 'follow';
          bot.repathTimer = 0;
          this.speak(bot, 'Йду за тобою!', 'friendly', 3.4);
        } else if (bot.disposition === 'cautious') {
          this.speak(bot, 'Тримайся сам.', 'warn', 3.2);
        }
      } else if (gesture === 'hold') {
        if (bot.disposition === 'friendly') {
          bot.aiState = 'hold';
          this.speak(bot, 'Чекаю тут.', 'friendly', 3.2);
        }
      } else if (gesture === 'intimidate') {
        if (bot.archetype === 'infected') {
          bot.aiState = 'engage';
          continue;
        }
        const botWeak =
          bot.phys.bloodVolumeMl < 3600 ||
          bot.weapon === 'hands' ||
          bot.phys.limbs.leftLeg.fractured ||
          bot.phys.limbs.rightLeg.fractured;
        if (
          playerArmed &&
          (bot.disposition === 'cautious' || (bot.disposition === 'hostile' && botWeak))
        ) {
          bot.aiState = 'surrender';
          bot.weapon = 'hands';
          bot.rig.weaponMount.clear();
          bot.lootDropped = true;
          bot.rig.root.traverse((c) => {
            c.userData.lootId = bot.loot.id;
          });
          this.speak(bot, 'Тільки не стріляй! Здаюсь!', 'warn', 4.0);
        } else if (bot.disposition === 'cautious') {
          bot.disposition = 'hostile';
          bot.aiState = 'engage';
          bot.lastKnownPlayerPos = playerPos.clone();
          this.speak(bot, 'Погрожуєш мені?!', 'danger', 3.4);
        }
      } else if (gesture === 'request_med') {
        if (bot.disposition === 'friendly') {
          const medKeys = Object.keys(bot.loot.meds) as MedItemId[];
          const avail = medKeys.find((k) => (bot.loot.meds[k] ?? 0) > 0);
          if (avail) {
            const gIdx = bot.loot.grid.items.findIndex(
              (it) => it.category === 'med' && it.medId === avail,
            );
            if (gIdx !== -1) {
              bot.loot.grid.items[gIdx].quantity -= 1;
              if (bot.loot.grid.items[gIdx].quantity <= 0) {
                bot.loot.grid.items.splice(gIdx, 1);
              }
              syncLootFromGrid(bot.loot);
            } else {
              bot.loot.meds[avail] = (bot.loot.meds[avail] ?? 1) - 1;
            }
            const dropPos = bot.pos
              .clone()
              .addScaledVector(
                new THREE.Vector3().subVectors(playerPos, bot.pos).normalize(),
                1.2,
              );
            this.onSpawnMedDrop(dropPos, avail);
            this.speak(bot, 'Тримай медикаменти!', 'friendly', 3.6);
          } else {
            this.speak(bot, 'Аптечка вже порожня!', 'neutral', 3.2);
          }
        } else {
          this.speak(bot, 'Знайдеш у місті сам!', 'warn', 3.2);
        }
      } else if (gesture === 'taunt') {
        if (bot.disposition === 'cautious') {
          bot.disposition = 'hostile';
        }
        if (bot.disposition === 'hostile') {
          bot.aiState = 'engage';
          bot.lastKnownPlayerPos = playerPos.clone();
          this.speak(bot, 'Ну давай!', 'danger', 3.2);
        }
      }
    }

    if (!reacted) {
      void this.onBotSpeech;
    }
  }

  private speak(
    bot: BotEntity,
    text: string,
    tone: 'neutral' | 'warn' | 'danger' | 'friendly',
    duration = 3.4,
  ) {
    bot.speechText = text;
    bot.speechTone = tone;
    bot.speechTimer = duration;
  }

  /**
   * Exact Ray-AABB Line-of-Sight check: returns true if clear, false if wall/car blocks!
   */
  public hasLineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    fromY = 1.45,
    toY = 1.45,
  ): boolean {
    const ox = from.x;
    const oz = from.z;
    const dx = to.x - ox;
    const dy = toY - fromY;
    const dz = to.z - oz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.4) return true;
    const ndx = dx / dist;
    const ndy = dy / dist;
    const ndz = dz / dist;

    for (const c of this.colliders) {
      if (rayIntersectsAABBDist(ox, fromY, oz, ndx, ndy, ndz, dist - 0.25, c) >= 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Raycast a bot's actual fired bullet against colliders so player cover blocks shots!
   */
  private castShotAgainstColliders(
    ox: number,
    oy: number,
    oz: number,
    ndx: number,
    ndy: number,
    ndz: number,
    maxDist: number,
  ): THREE.Vector3 | null {
    let bestT = maxDist;
    let hit = false;
    for (const c of this.colliders) {
      const t = rayIntersectsAABBDist(ox, oy, oz, ndx, ndy, ndz, bestT, c);
      if (t >= 0 && t < bestT) {
        bestT = t;
        hit = true;
      }
    }
    if (!hit) return null;
    return new THREE.Vector3(ox + ndx * bestT, oy + ndy * bestT, oz + ndz * bestT);
  }

  /**
   * Vision cone check (~115 deg FOV) + exact wall occlusion + crouching stealth radius.
   */
  private canBotDetectPlayer(
    bot: BotEntity,
    playerPos: THREE.Vector3,
    playerCrouching: boolean,
    playerMovingFast: boolean,
  ): boolean {
    const dist = bot.pos.distanceTo(playerPos);
    if (dist > 36) return false;
    const targetEyeY = playerCrouching ? 0.95 : 1.45;
    if (!this.hasLineOfSight(bot.pos, playerPos, 1.45, targetEyeY)) return false;

    const hearDist = playerCrouching ? 1.4 : playerMovingFast ? 6.2 : 2.6;
    if (dist <= hearDist) return true;

    _botFwd.set(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
    _toTarget.subVectors(playerPos, bot.pos).setY(0).normalize();
    const dot = _botFwd.dot(_toTarget);
    return dot >= 0.4;
  }

  /**
   * Follows the NavMesh A* waypoint path and recomputes smoothly when needed or when stuck.
   */
  private followNavPath(bot: BotEntity, desiredGoal: THREE.Vector3, dt: number): THREE.Vector3 | null {
    bot.repathTimer -= dt;
    const goalMoved = bot.pathGoal.distanceTo(desiredGoal) > 2.2;

    if (bot.repathTimer <= 0 || goalMoved || bot.path.length === 0) {
      bot.pathGoal.copy(desiredGoal);
      bot.path = this.navMesh.findPath(bot.pos.x, bot.pos.z, desiredGoal.x, desiredGoal.z);
      bot.pathIndex = 0;
      // Stagger repaths so bots never spike the same frame
      bot.repathTimer = 0.48 + Math.random() * 0.35;
    }

    while (
      bot.pathIndex < bot.path.length &&
      Math.hypot(bot.pos.x - bot.path[bot.pathIndex].x, bot.pos.z - bot.path[bot.pathIndex].z) < 1.15
    ) {
      bot.pathIndex++;
    }

    if (bot.pathIndex < bot.path.length) {
      return bot.path[bot.pathIndex];
    }
    return desiredGoal;
  }

  private pickWorstBleedLimb(phys: PhysiologyState): LimbId | null {
    let worst: LimbId | null = null;
    let bestBleed = 0.25;
    (Object.keys(phys.limbs) as LimbId[]).forEach((lid) => {
      const b = getEffectiveLimbBleed(phys, phys.limbs[lid]);
      if (b > bestBleed) {
        bestBleed = b;
        worst = lid;
      }
    });
    return worst;
  }

  private fireBotWeaponAt(
    bot: BotEntity,
    targetPos: THREE.Vector3,
    targetIsPlayer: boolean,
    targetBot: BotEntity | null,
    playerCrouching: boolean,
  ) {
    if (bot.weapon === 'hands') return;
    const def = WEAPON_DEFS[bot.weapon];

    if (def.kind === 'melee') {
      bot.fireCooldown = 0.85;
      bot.recoilPulse = 1.0;
      soundEngine.playMeleeSwing(false);
      if (targetIsPlayer) {
        const limbs: LimbId[] = ['torso', 'leftArm', 'rightArm', 'leftLeg'];
        this.onPlayerHit(
          limbs[Math.floor(Math.random() * limbs.length)],
          16,
          1.6,
          0.18,
          bot.pos,
        );
      } else if (targetBot) {
        const dir = _tmpVec.subVectors(targetBot.pos, bot.pos).normalize();
        this.damageBotLimb(
          targetBot.id,
          'torso',
          18,
          1.5,
          0.2,
          0,
          dir,
          false,
          bot.id,
        );
      }
      return;
    }

    // Real magazine tracking + reload!
    if (bot.ammoInMag <= 0) {
      bot.reloadTimer = def.reloadTimeSec;
      bot.aiState = 'reload';
      const cover = this.navMesh.findBestCover(
        bot.pos,
        targetPos,
        (a, b) => this.hasLineOfSight(a, b),
        24,
      );
      if (cover) {
        bot.coverPos = cover;
        bot.repathTimer = 0;
      }
      if (bot.pos.distanceTo(this.lastKnownGlobalPlayerPos) < 28) {
        this.speak(bot, 'Перезаряджаюсь!', 'neutral', 2.4);
      }
      return;
    }

    bot.ammoInMag -= 1;
    bot.recoilPulse = 1.0;
    bot.fireCooldown =
      def.id === 'rifle_556'
        ? 0.22 + (bot.ammoInMag % 3 === 0 ? 0.45 : 0)
        : Math.max(0.42, (def.fireRateMs / 1000) * 1.95);
    soundEngine.playGunshot(bot.weapon);

    // Honest ballistic raycast with realistic spread & cover occlusion
    const muzzleY = bot.crouchFactor > 0.5 ? 1.05 : 1.38;
    const aimY = targetIsPlayer ? (playerCrouching ? 0.78 : 1.28) : 1.25;
    const dx = targetPos.x - bot.pos.x;
    const dy = aimY - muzzleY;
    const dz = targetPos.z - bot.pos.z;
    const dist = Math.hypot(dx, dy, dz) || 1;

    const spread = def.spread * (bot.archetype === 'enforcer' ? 1.15 : 1.45);
    const ndx = dx / dist + (Math.random() - 0.5) * spread;
    const ndy = dy / dist + (Math.random() - 0.5) * spread * 0.65;
    const ndz = dz / dist + (Math.random() - 0.5) * spread;
    const nLen = Math.hypot(ndx, ndy, ndz) || 1;
    const rdx = ndx / nLen;
    const rdy = ndy / nLen;
    const rdz = ndz / nLen;

    // Check if bullet hits a wall, car, or barrier before reaching the target!
    const wallHit = this.castShotAgainstColliders(
      bot.pos.x,
      muzzleY,
      bot.pos.z,
      rdx,
      rdy,
      rdz,
      dist,
    );
    if (wallHit) {
      this.onSpawnSpark?.(wallHit);
      return;
    }

    // Even a near-miss shot alerts the target bot that someone is shooting at them!
    if (targetBot && targetBot.aiState !== 'dead' && targetBot.aiState !== 'unconscious') {
      targetBot.aggroBotId = bot.id;
      targetBot.aggroBotTimer = Math.max(targetBot.aggroBotTimer, 10);
    }

    // Distance + lateral miss check
    const hitChance = Math.max(0.22, Math.min(0.74, 0.78 - dist * 0.015));
    if (Math.random() > hitChance) return;

    if (targetIsPlayer) {
      const limbs: LimbId[] = ['torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'head'];
      const picked = limbs[Math.floor(Math.random() * limbs.length)];
      this.onPlayerHit(
        picked,
        def.damage * 0.52,
        def.bleedPower * 0.85,
        def.fractureChance * 0.45,
        bot.pos,
      );
    } else if (targetBot) {
      const dir = _tmpVec.set(rdx, rdy, rdz);
      this.damageBotLimb(
        targetBot.id,
        Math.random() < 0.22 ? 'head' : 'torso',
        def.damage * 0.65,
        def.bleedPower * 0.75,
        def.fractureChance * 0.5,
        def.severChance * 0.3,
        dir,
        false,
        bot.id,
      );
    }
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerAimingAtBotId: string | null,
    playerArmed: boolean,
    playerCrouching: boolean,
    playerMovingFast: boolean,
    timeElapsed: number,
    activeLootBundleId?: string | null,
  ) {
    this.lastKnownGlobalPlayerPos.copy(playerPos);

    // Periodic cleanup of old corpses (only when player is far & not looting) + far-from-player respawn
    let livingBots = 0;
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (b.aiState === 'dead') {
        b.deadTimer += dt;
        if (
          b.deadTimer >= 75 &&
          !b.grabbedByCrusher &&
          b.loot.id !== activeLootBundleId &&
          b.pos.distanceTo(playerPos) > 26
        ) {
          this.scene.remove(b.rig.root);
          this.bots.splice(i, 1);
          this.meshesDirty = true;
        }
      } else {
        livingBots++;
      }
    }

    if (livingBots < this.targetActiveBots) {
      this.respawnCheckTimer -= dt;
      if (this.respawnCheckTimer <= 0) {
        this.respawnCheckTimer = 14 + Math.random() * 6;
        this.tryRespawnFarBot(playerPos);
      }
    }

    for (const bot of this.bots) {
      if (bot.speechTimer > 0) {
        bot.speechTimer -= dt;
        if (bot.speechTimer <= 0) {
          bot.speechText = null;
        }
      }

      if (bot.aiState === 'dead') {
        bot.speechText = null;
        if (bot.ragdoll && !bot.grabbedByCrusher) {
          this.stepRagdoll(bot, dt);
        }
        continue;
      }

      // Tick bot physiology (bleeding, shock, organ failure, unconsciousness)
      tickPhysiology(bot.phys, dt);
      if (bot.phys.consciousness === 'dead') {
        this.killBot(bot);
        continue;
      }

      if (
        bot.phys.consciousness === 'unconscious' ||
        bot.phys.consciousness === 'cardiacArrest'
      ) {
        bot.speechText = null;
        this.dropBotUnconscious(bot);
        if (bot.ragdoll && !bot.grabbedByCrusher) {
          this.stepRagdoll(bot, dt);
        }
        continue;
      } else if (bot.aiState === 'unconscious') {
        bot.aiState = 'crawl';
        this.resetRigToStanding(bot);
      }

      const legBroken =
        bot.phys.limbs.leftLeg.fractured ||
        bot.phys.limbs.rightLeg.fractured ||
        bot.phys.limbs.leftLeg.severed ||
        bot.phys.limbs.rightLeg.severed;
      if (legBroken) {
        bot.aiState = 'crawl';
      }

      const distToPlayer = bot.pos.distanceTo(playerPos);
      const seesPlayer = this.canBotDetectPlayer(
        bot,
        playerPos,
        playerCrouching,
        playerMovingFast,
      );

      if (seesPlayer) {
        bot.lastKnownPlayerPos = playerPos.clone();
      }

      // Self-preservation checks: bleed -> bandage; critical trauma -> flee!
      const bleedRate = this.totalBleed(bot.phys);
      const bandagesLeft = bot.loot.meds.bandage ?? 0;

      if (
        bot.aiState !== 'surrender' &&
        bot.aiState !== 'crawl' &&
        bot.aiState !== 'heal' &&
        bot.aiState !== 'reload' &&
        bot.archetype !== 'infected'
      ) {
        if (bleedRate > 1.25 && bandagesLeft > 0) {
          bot.aiState = 'heal';
          bot.healingTimer = 2.6;
          if (seesPlayer) {
            bot.coverPos = this.navMesh.findBestCover(
              bot.pos,
              playerPos,
              (a, b) => this.hasLineOfSight(a, b),
              26,
            );
            bot.repathTimer = 0;
          }
          if (distToPlayer < 26) {
            this.speak(bot, 'Перев’язую рану!', 'neutral', 2.8);
          }
        } else if (
          (bot.phys.bloodVolumeMl < 2750 || bot.phys.organHealth < 45) &&
          bandagesLeft <= 0 &&
          bot.aiState !== 'flee'
        ) {
          bot.aiState = 'flee';
          const awayDir = _tmpVec.subVectors(bot.pos, playerPos).setY(0).normalize();
          const fleeGoal = bot.pos.clone().addScaledVector(awayDir, 45);
          bot.patrolTarget.copy(
            this.navMesh.findNearestWalkable(fleeGoal.x, fleeGoal.z, 8) ??
              this.patrolPoints[Math.floor(Math.random() * this.patrolPoints.length)],
          );
          bot.repathTimer = 0;
          if (distToPlayer < 26) {
            this.speak(bot, 'Відступаю!', 'warn', 2.8);
          }
        }
      }

      // Disposition & Social transitions
      if (
        bot.disposition === 'cautious' &&
        bot.aiState !== 'surrender' &&
        bot.aiState !== 'heal' &&
        bot.aiState !== 'flee'
      ) {
        if (seesPlayer && distToPlayer < 16) {
          if (playerAimingAtBotId === bot.id && playerArmed) {
            bot.trust -= dt * 32;
            if (bot.aiState !== 'warn') {
              bot.aiState = 'warn';
              this.speak(bot, 'Прибери ствол!', 'warn', 3.0);
            }
            if (bot.trust <= -20) {
              bot.disposition = 'hostile';
              bot.aiState = 'engage';
              this.speak(bot, 'Ти сам напросився!', 'danger', 3.0);
            }
          } else if (distToPlayer < 6.5 && playerArmed) {
            bot.aiState = 'warn';
          }
        }
      } else if (
        bot.disposition === 'hostile' &&
        bot.aiState !== 'surrender' &&
        bot.aiState !== 'crawl' &&
        bot.aiState !== 'heal' &&
        bot.aiState !== 'reload' &&
        bot.aiState !== 'takeCover' &&
        bot.aiState !== 'flee'
      ) {
        if (seesPlayer) {
          if (bot.aiState !== 'flank') {
            bot.aiState = 'engage';
          }
        } else if (bot.aiState === 'engage' && bot.lastKnownPlayerPos) {
          // Instead of walking into a wall, attempt a tactical flank or NavMesh search!
          if (bot.archetype !== 'infected' && Math.random() < 0.65) {
            const flankPt = this.navMesh.findFlankPoint(
              bot.pos,
              bot.lastKnownPlayerPos,
              bot.strafeDir,
            );
            if (flankPt) {
              bot.aiState = 'flank';
              bot.coverPos = flankPt;
              bot.stateTimer = 6.5;
              bot.repathTimer = 0;
            } else {
              bot.aiState = 'search';
              bot.stateTimer = 8.0;
            }
          } else {
            bot.aiState = 'search';
            bot.stateTimer = 8.0;
          }
        }
      }

      // Bidirectional bot-vs-bot combat awareness (retaliation + faction skirmishes)
      if (bot.aggroBotTimer > 0) {
        bot.aggroBotTimer -= dt;
        if (bot.aggroBotTimer <= 0) bot.aggroBotId = null;
      }

      let combatTargetBot: BotEntity | null = null;
      if (bot.aggroBotId) {
        const aggro = this.bots.find(
          (b) =>
            b.id === bot.aggroBotId &&
            b.aiState !== 'dead' &&
            b.aiState !== 'unconscious' &&
            b.aiState !== 'surrender',
        );
        if (aggro && bot.pos.distanceTo(aggro.pos) < 48) {
          combatTargetBot = aggro;
        } else {
          bot.aggroBotId = null;
        }
      }

      if (!combatTargetBot && bot.aiState !== 'surrender' && bot.aiState !== 'flee') {
        let bestDist = bot.disposition === 'friendly' ? 32 : 28;
        for (const other of this.bots) {
          if (
            other.id === bot.id ||
            other.aiState === 'dead' ||
            other.aiState === 'unconscious' ||
            other.aiState === 'surrender'
          ) {
            continue;
          }
          const isRival =
            (bot.disposition === 'friendly' && other.disposition === 'hostile') ||
            (bot.disposition === 'hostile' &&
              (other.disposition === 'friendly' ||
                (bot.archetype === 'infected' && other.disposition === 'cautious')));
          if (!isRival) continue;

          const d = bot.pos.distanceTo(other.pos);
          if (d < bestDist && this.hasLineOfSight(bot.pos, other.pos)) {
            bestDist = d;
            combatTargetBot = other;
          }
        }
      }

      // Strafe side switcher
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 1.3 + Math.random() * 1.6;
      }

      // Decide movement target & tactical actions
      let desiredGoal: THREE.Vector3 | null = null;
      let directMoveVec: THREE.Vector3 | null = null;
      let moveSpeed = 2.55;
      let wantCrouch = false;
      bot.fireCooldown -= dt;

      if (bot.aiState === 'crawl') moveSpeed = 1.05;
      else if (bot.aiState === 'engage' || bot.aiState === 'flank' || bot.aiState === 'takeCover') {
        moveSpeed = bot.archetype === 'infected' ? 4.6 : 3.55;
      } else if (bot.aiState === 'flee') {
        moveSpeed = 4.35;
      } else if (bot.aiState === 'search' || bot.aiState === 'alert') {
        moveSpeed = 3.1;
      }

      if (bot.aiState === 'surrender') {
        moveSpeed = 0;
      } else if (bot.aiState === 'heal') {
        wantCrouch = true;
        if (bot.coverPos && bot.pos.distanceTo(bot.coverPos) > 1.6) {
          desiredGoal = bot.coverPos;
        } else {
          moveSpeed = 0;
          bot.healingTimer -= dt;
          if (bot.healingTimer <= 0) {
            const limb = this.pickWorstBleedLimb(bot.phys);
            if (limb && (bot.loot.meds.bandage ?? 0) > 0) {
              applyBandageStroke(bot.phys, limb, 70);
              const bIdx = bot.loot.grid.items.findIndex(
                (it) => it.category === 'med' && it.medId === 'bandage',
              );
              if (bIdx !== -1) {
                bot.loot.grid.items.splice(bIdx, 1);
                syncLootFromGrid(bot.loot);
              } else {
                bot.loot.meds.bandage = (bot.loot.meds.bandage ?? 1) - 1;
              }
              if (distToPlayer < 24) soundEngine.playBandageSwipe();
            }
            bot.coverPos = null;
            bot.aiState = seesPlayer ? 'engage' : 'search';
          }
        }
      } else if (bot.aiState === 'reload') {
        wantCrouch = true;
        if (bot.coverPos && bot.pos.distanceTo(bot.coverPos) > 1.6) {
          desiredGoal = bot.coverPos;
        } else {
          moveSpeed = 0;
        }
        bot.reloadTimer -= dt;
        if (bot.reloadTimer <= 0) {
          bot.ammoInMag = WEAPON_DEFS[bot.weapon].magSize;
          bot.coverPos = null;
          bot.aiState = seesPlayer ? 'engage' : 'search';
        }
      } else if (bot.aiState === 'flee') {
        desiredGoal = bot.patrolTarget;
        if (bot.pos.distanceTo(bot.patrolTarget) < 3.0) {
          bot.patrolTarget.copy(
            this.patrolPoints[Math.floor(Math.random() * this.patrolPoints.length)],
          );
        }
      } else if (combatTargetBot) {
        const d = bot.pos.distanceTo(combatTargetBot.pos);
        const seesRival = this.hasLineOfSight(bot.pos, combatTargetBot.pos);
        bot.targetYaw = Math.atan2(
          combatTargetBot.pos.x - bot.pos.x,
          combatTargetBot.pos.z - bot.pos.z,
        );
        const isMelee =
          bot.weapon === 'hands' ||
          bot.archetype === 'infected' ||
          WEAPON_DEFS[bot.weapon].kind === 'melee';
        if (!seesRival || d > (isMelee ? 1.7 : 12)) {
          desiredGoal = combatTargetBot.pos;
        } else if (!isMelee) {
          // Strafe carefully along walkable navmesh while engaging rival bot
          const toX = (combatTargetBot.pos.x - bot.pos.x) / Math.max(0.1, d);
          const toZ = (combatTargetBot.pos.z - bot.pos.z) / Math.max(0.1, d);
          const candDir = new THREE.Vector3(-toZ * bot.strafeDir, 0, toX * bot.strafeDir);
          const tx = bot.pos.x + candDir.x * 1.6;
          const tz = bot.pos.z + candDir.z * 1.6;
          if (this.navMesh.isWalkableWorld(tx, tz)) {
            directMoveVec = candDir;
            moveSpeed = 2.4;
          } else {
            bot.strafeDir = -bot.strafeDir;
            moveSpeed = 0;
          }
        }
        if (seesRival && bot.fireCooldown <= 0) {
          if (!isMelee || d < 2.2) {
            this.fireBotWeaponAt(bot, combatTargetBot.pos, false, combatTargetBot, false);
          }
        }
      } else if (bot.aiState === 'follow') {
        bot.targetYaw = Math.atan2(playerPos.x - bot.pos.x, playerPos.z - bot.pos.z);
        if (distToPlayer > 4.2) desiredGoal = playerPos;
      } else if (bot.aiState === 'hold' || bot.aiState === 'warn') {
        bot.targetYaw = Math.atan2(playerPos.x - bot.pos.x, playerPos.z - bot.pos.z);
        moveSpeed = 0;
      } else if (bot.aiState === 'takeCover') {
        bot.coverTimer -= dt;
        if (bot.coverPos && bot.pos.distanceTo(bot.coverPos) > 1.5) {
          desiredGoal = bot.coverPos;
        } else {
          wantCrouch = true;
          moveSpeed = 0;
          if (bot.lastKnownPlayerPos) {
            bot.targetYaw = Math.atan2(
              bot.lastKnownPlayerPos.x - bot.pos.x,
              bot.lastKnownPlayerPos.z - bot.pos.z,
            );
          }
          // Peek & suppress if player enters sightlines!
          if (seesPlayer && bot.fireCooldown <= 0) {
            wantCrouch = false;
            this.fireBotWeaponAt(bot, playerPos, true, null, playerCrouching);
          }
        }
        if (bot.coverTimer <= 0) {
          bot.coverPos = null;
          bot.aiState = seesPlayer ? 'engage' : 'flank';
          if (bot.aiState === 'flank' && bot.lastKnownPlayerPos) {
            bot.coverPos = this.navMesh.findFlankPoint(
              bot.pos,
              bot.lastKnownPlayerPos,
              bot.strafeDir,
            );
            bot.stateTimer = 5.5;
          }
        }
      } else if (bot.aiState === 'flank') {
        bot.stateTimer -= dt;
        if (seesPlayer && distToPlayer < 18) {
          bot.aiState = 'engage';
          bot.coverPos = null;
        } else if (bot.coverPos) {
          desiredGoal = bot.coverPos;
          if (bot.pos.distanceTo(bot.coverPos) < 2.0 || bot.stateTimer <= 0) {
            bot.coverPos = null;
            bot.aiState = 'search';
            bot.stateTimer = 6.0;
          }
        } else {
          bot.aiState = 'search';
        }
      } else if (bot.aiState === 'engage' || bot.aiState === 'crawl') {
        if (seesPlayer) {
          bot.targetYaw = Math.atan2(playerPos.x - bot.pos.x, playerPos.z - bot.pos.z);
          const isMelee =
            bot.weapon === 'hands' ||
            bot.archetype === 'infected' ||
            WEAPON_DEFS[bot.weapon].kind === 'melee';
          const optDist = isMelee ? 1.5 : bot.weapon === 'shotgun_12ga' ? 7.5 : 13.5;

          if (isMelee || bot.aiState === 'crawl') {
            if (distToPlayer > 1.5) desiredGoal = playerPos;
          } else {
            // Tactical strafing + spacing like a real FPS player!
            const toX = (playerPos.x - bot.pos.x) / Math.max(0.1, distToPlayer);
            const toZ = (playerPos.z - bot.pos.z) / Math.max(0.1, distToPlayer);
            const radial =
              distToPlayer > optDist + 3.5 ? 0.55 : distToPlayer < optDist - 3.5 ? -0.65 : 0;
            const candDir = new THREE.Vector3(
              toX * radial - toZ * bot.strafeDir * 0.85,
              0,
              toZ * radial + toX * bot.strafeDir * 0.85,
            );
            if (candDir.lengthSq() > 0.05) {
              candDir.normalize();
              const stepTestX = bot.pos.x + candDir.x * 1.6;
              const stepTestZ = bot.pos.z + candDir.z * 1.6;
              if (this.navMesh.isWalkableWorld(stepTestX, stepTestZ)) {
                directMoveVec = candDir;
                moveSpeed = 2.65;
              } else {
                bot.strafeDir = -bot.strafeDir;
              }
            }
          }

          if (bot.fireCooldown <= 0) {
            if (isMelee) {
              if (distToPlayer < 2.2) {
                this.fireBotWeaponAt(bot, playerPos, true, null, playerCrouching);
              }
            } else {
              this.fireBotWeaponAt(bot, playerPos, true, null, playerCrouching);
            }
          }
        } else if (bot.lastKnownPlayerPos) {
          desiredGoal = bot.lastKnownPlayerPos;
        }
      } else if ((bot.aiState === 'search' || bot.aiState === 'alert') && bot.lastKnownPlayerPos) {
        if (seesPlayer && bot.disposition === 'hostile') {
          bot.aiState = 'engage';
        } else if (bot.lookAroundTimer > 0) {
          // Arrived at noise / last-seen spot: scan left & right!
          moveSpeed = 0;
          bot.lookAroundTimer -= dt;
          bot.targetYaw += Math.sin(timeElapsed * 2.6) * dt * 2.4;
          if (bot.lookAroundTimer <= 0) {
            bot.lastKnownPlayerPos = null;
            bot.aiState = 'patrol';
          }
        } else {
          desiredGoal = bot.lastKnownPlayerPos;
          bot.stateTimer -= dt;
          if (bot.pos.distanceTo(bot.lastKnownPlayerPos) < 2.0) {
            bot.lookAroundTimer = 3.0;
          } else if (bot.stateTimer <= 0) {
            bot.lastKnownPlayerPos = null;
            bot.aiState = 'patrol';
          }
        }
      } else {
        // Patrol via NavMesh across town & building doorways
        if (bot.pos.distanceTo(bot.patrolTarget) < 2.5) {
          bot.lookAroundTimer = 1.6 + Math.random() * 1.4;
          bot.patrolTarget.copy(
            this.patrolPoints[Math.floor(Math.random() * this.patrolPoints.length)],
          );
          bot.repathTimer = 0;
        }
        if (bot.lookAroundTimer > 0) {
          moveSpeed = 0;
          bot.lookAroundTimer -= dt;
          bot.targetYaw += Math.sin(timeElapsed * 1.8) * dt * 1.4;
        } else {
          desiredGoal = bot.patrolTarget;
        }
      }

      // Execute NavMesh or direct tactical strafe movement
      let moving = false;
      if (!bot.grabbedByCrusher && moveSpeed > 0) {
        let stepDir: THREE.Vector3 | null = null;
        if (directMoveVec) {
          stepDir = directMoveVec;
        } else if (desiredGoal) {
          const wp = this.followNavPath(bot, desiredGoal, dt);
          if (wp) {
            _tmpVec.subVectors(wp, bot.pos).setY(0);
            const dist = _tmpVec.length();
            if (dist > 0.2) {
              _tmpVec.divideScalar(dist);
              stepDir = _tmpVec;
              // Face movement direction when patrolling/searching/fleeing
              if (
                bot.aiState === 'patrol' ||
                bot.aiState === 'search' ||
                bot.aiState === 'alert' ||
                bot.aiState === 'flee' ||
                bot.aiState === 'flank' ||
                bot.aiState === 'takeCover'
              ) {
                if (!seesPlayer) {
                  bot.targetYaw = Math.atan2(_tmpVec.x, _tmpVec.z);
                }
              }
            }
          }
        }

        if (stepDir) {
          // Local separation from nearby bots & dynamic props so doorways never jam
          _sepVec.set(0, 0, 0);
          for (const other of this.bots) {
            if (other.id === bot.id || other.aiState === 'dead') continue;
            const dx = bot.pos.x - other.pos.x;
            const dz = bot.pos.z - other.pos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < 1.35 * 1.35 && dSq > 1e-4) {
              const d = Math.sqrt(dSq);
              _sepVec.x += (dx / d) * (1.35 - d) * 1.8;
              _sepVec.z += (dz / d) * (1.35 - d) * 1.8;
            }
          }
          for (const prop of this.dynamicProps) {
            if (prop.exploded) continue;
            const dx = bot.pos.x - prop.pos.x;
            const dz = bot.pos.z - prop.pos.z;
            const minR = prop.radius + 0.55;
            const dSq = dx * dx + dz * dz;
            if (dSq < minR * minR && dSq > 1e-4) {
              const d = Math.sqrt(dSq);
              _sepVec.x += (dx / d) * (minR - d) * 2.2;
              _sepVec.z += (dz / d) * (minR - d) * 2.2;
            }
          }

          const totalMoveX = (stepDir.x * moveSpeed + _sepVec.x) * dt;
          const totalMoveZ = (stepDir.z * moveSpeed + _sepVec.z) * dt;
          const moveLen = Math.hypot(totalMoveX, totalMoveZ);
          const subSteps = Math.max(1, Math.ceil(moveLen / 0.16));
          for (let s = 0; s < subSteps; s++) {
            bot.pos.x += totalMoveX / subSteps;
            bot.pos.z += totalMoveZ / subSteps;
            resolveBotWalls(bot.pos, this.colliders, 0.48);
          }
          moving = true;

          // Stuck Watchdog: detect stalled progress, route cleanly out of buildings, and force repath
          bot.stuckTimer += dt;
          if (bot.stuckTimer >= 0.65) {
            if (bot.pos.distanceTo(bot.lastProgressPos) < 0.35) {
              bot.strafeDir = -bot.strafeDir;
              bot.repathTimer = 0;
              const buildingExit = this.navMesh.getDoorExitForPos(bot.pos.x, bot.pos.z);
              if (buildingExit) {
                bot.path = this.navMesh.findPath(
                  bot.pos.x,
                  bot.pos.z,
                  buildingExit.x,
                  buildingExit.z,
                );
                bot.pathIndex = 0;
                bot.pathGoal.copy(buildingExit);
              } else {
                const candX = bot.pos.x - stepDir.z * bot.strafeDir * 0.5;
                const candZ = bot.pos.z + stepDir.x * bot.strafeDir * 0.5;
                if (this.navMesh.isWalkableWorld(candX, candZ)) {
                  bot.pos.x = candX;
                  bot.pos.z = candZ;
                  resolveBotWalls(bot.pos, this.colliders, 0.48);
                }
                if (bot.aiState === 'patrol') {
                  bot.patrolTarget.copy(
                    this.patrolPoints[Math.floor(Math.random() * this.patrolPoints.length)],
                  );
                }
              }
            }
            bot.lastProgressPos.copy(bot.pos);
            bot.stuckTimer = 0;
          }
        }
      }

      if (!bot.grabbedByCrusher) {
        const velLen = bot.vel.length() * dt;
        const velSteps = Math.max(1, Math.ceil(velLen / 0.16));
        for (let s = 0; s < velSteps; s++) {
          bot.pos.addScaledVector(bot.vel, dt / velSteps);
          resolveBotWalls(bot.pos, this.colliders, 0.48);
        }
        bot.vel.multiplyScalar(Math.max(0, 1 - dt * 7));
      }

      // Smooth human-like turning, crouch posture, & full 11-joint procedural body animation
      bot.yaw = lerpAngleStep(bot.yaw, bot.targetYaw, dt * 7.5);
      bot.crouchFactor = THREE.MathUtils.damp(bot.crouchFactor, wantCrouch ? 1 : 0, 10, dt);
      bot.recoilPulse = THREE.MathUtils.damp(bot.recoilPulse, 0, 16, dt);
      bot.flinchPitch = THREE.MathUtils.damp(bot.flinchPitch, 0, 13, dt);
      bot.flinchRoll = THREE.MathUtils.damp(bot.flinchRoll, 0, 13, dt);

      bot.rig.root.position.copy(bot.pos);
      bot.rig.root.rotation.set(0, bot.yaw, 0);

      const totalPainOrBloodLoss =
        Math.max(0, 1 - bot.phys.bloodVolumeMl / 5000) * 0.8 +
        Math.min(1, bot.phys.pain / 100) * 0.5;
      const twoHanded =
        bot.weapon === 'rifle_556' ||
        bot.weapon === 'shotgun_12ga' ||
        bot.weapon === 'sniper_762';

      stepProceduralCharacterAnim(bot.rig, bot.animState, {
        dt,
        moveSpeed: moving ? moveSpeed : bot.vel.length(),
        crouchFactor: bot.crouchFactor,
        aiming:
          bot.aiState === 'engage' ||
          bot.aiState === 'warn' ||
          bot.aiState === 'takeCover' ||
          Boolean(combatTargetBot),
        crawling: bot.aiState === 'crawl',
        surrendering: bot.aiState === 'surrender',
        healing: bot.aiState === 'heal',
        reloading: bot.aiState === 'reload',
        woundedFrac: Math.min(1, totalPainOrBloodLoss),
        legInjured: legBroken,
        recoilPulse: bot.recoilPulse,
        flinchPitch: bot.flinchPitch,
        flinchRoll: bot.flinchRoll,
        twoHandedWeapon: twoHanded,
        infected: bot.archetype === 'infected',
      });
    }
  }
}
