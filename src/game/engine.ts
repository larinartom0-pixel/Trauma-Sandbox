import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BotEntity, BotManager } from './ai';
import {
  createProceduralAnimState,
  ProceduralAnimState,
  shiftRagdoll,
  stepProceduralCharacterAnim,
} from './animation';
import { soundEngine } from './audio';
import { BACKPACK_TIERS, detectTouchMode, WEAPON_DEFS } from './data';
import {
  addItemToGrid,
  buildGridFromLoot,
  canPlaceAt,
  consumeAmmoFromGrid,
  consumeBandageDurability,
  consumeOneMedFromGrid,
  createGridBackpackItem,
  createGridMedItem,
  createInitialPlayerInventory,
  equipBackpackTier,
  syncInventoryFromGrid,
  syncLootFromGrid,
} from './inventory';
import {
  createGestureHandMesh,
  createGoreDollModel,
  createLootCrateModel,
  createWeaponMesh,
  GoreDollRig,
  poseGestureHand,
} from './models';
import {
  applyBandageStroke,
  applyLimbSplint,
  applyLimbTrauma,
  breakNeedleInLimb,
  createInitialPhysiology,
  extractLimbShrapnel,
  injectSyringeFraction,
  performChestCpr,
  takeAntibiotics,
  tickPhysiology,
  toggleLimbTourniquet,
  transfuseBloodBag,
} from './physiology';
import { createProceduralTextures, ProceduralTexturePack } from './textures';
import {
  BackpackTierId,
  CaliberId,
  CameraMode,
  ControlMode,
  FeedMessage,
  GamePhase,
  GameSnapshot,
  GestureId,
  InventoryState,
  LimbId,
  LootBundle,
  MedItemId,
  NearbyPrompt,
  OverheadSpeechBubble,
  PhysiologyState,
  WeaponId,
} from './types';
import {
  buildAbandonedTown,
  DynamicProp,
  TownWorld,
  WORLD_BOUND,
} from './world';

interface PooledSlot {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  gravity: number;
}

interface InstancedParticlePool {
  mesh: THREE.InstancedMesh;
  slots: PooledSlot[];
  cursor: number;
}

interface PhantomEntity {
  id: string;
  rig: GoreDollRig;
  animState: ProceduralAnimState;
  recoilPulse: number;
  hitMeshes: THREE.Mesh[];
  active: boolean;
  behavior: 'stalker' | 'runner' | 'ambush';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  life: number;
  maxLife: number;
  aimedTime: number;
  firedFakeShot: boolean;
  speechText: string | null;
  speechTimer: number;
}

interface ThrownGrenade {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
}

const _vec3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
const _rayOrigin = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _skyDay = new THREE.Color(0x6d87a3);
const _skyDusk = new THREE.Color(0x523b42);
const _skyNight = new THREE.Color(0x090d16);
const _skyCur = new THREE.Color();

export class TraumaSandboxEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTexturePack;
  private world!: TownWorld;
  private botManager!: BotManager;
  private isSoftwareGl: boolean;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private flashlight: THREE.SpotLight;
  private flashlightTarget = new THREE.Object3D();
  private flashlightOn = false;
  private timeOfDay = 11.5; // Starts late morning, cycles continuously through Day & Night!

  private frameId = 0;
  private clock = new THREE.Clock();
  private disposed = false;
  private phase: GamePhase = 'title';
  private onSnapshot: (snap: GameSnapshot) => void;
  private lastSnapshotTime = 0;
  private hitstopTimer = 0;

  // Player & Camera state
  private cameraMode: CameraMode = 'first';
  private freeCamPos = new THREE.Vector3(0, 6, 12);
  private playerPos = new THREE.Vector3(0, 0, -2);
  private playerVel = new THREE.Vector3();
  private playerYaw = 0;
  private playerPitch = 0;
  private isGrounded = true;
  private isCrouching = false;
  private isAiming = false;
  private currentEyeHeight = 1.62;
  private recoilPitch = 0;
  private shakeIntensity = 0;
  private swayPhase = 0;
  private playerRig: GoreDollRig | null = null;
  private playerAnimState: ProceduralAnimState = createProceduralAnimState();
  private playerRecoilPulse = 0;

  // Input state (PC + Touch + Drag-to-Look fallback)
  private keys = new Set<string>();
  private touchMove = { x: 0, y: 0 };
  private touchFireHeld = false;
  private mouseFireHeld = false;
  private lastDragPt: { x: number; y: number } | null = null;
  private pointerLocked = false;
  private skipNextLockMove = false;
  private sensitivity = 1.0;
  private controlMode: ControlMode = 'auto';

  // Player Combat & Viewmodel
  private phys: PhysiologyState = createInitialPhysiology();
  private inventory!: InventoryState;
  private activeWeapon: WeaponId = 'pistol_9mm';
  private viewmodelMount = new THREE.Group();
  private weaponViewMesh: THREE.Group | null = null;
  private gestureHandMesh: THREE.Group;
  private activeGesture: GestureId | null = null;
  private gestureTimer = 0;
  private fireCooldownMs = 0;
  private reloadTimer = 0;
  private isReloading = false;
  private viewKickZ = 0;
  private meleeSwingTimer = 0;

  // Reality Crusher hold state
  private grabbedTarget:
    | { kind: 'prop'; prop: DynamicProp; distance: number }
    | { kind: 'bot'; bot: BotEntity; distance: number }
    | null = null;
  private crusherBeam: THREE.Line;

  // Instanced FX pools (4 draw calls total, zero runtime Mesh/Vector3 allocations)
  private bloodPool!: InstancedParticlePool;
  private sparkPool!: InstancedParticlePool;
  private expPool!: InstancedParticlePool;
  private decalMesh!: THREE.InstancedMesh;
  private decalCursor = 0;
  private grenades: ThrownGrenade[] = [];
  private flashLight: THREE.PointLight;
  private phantomFlashLight: THREE.PointLight;
  private phantomFlashTimer = 0;
  private pooledLampLight: THREE.PointLight;
  private pooledRoomLight: THREE.PointLight;
  private flashTimer = 0;
  private bloodGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  private sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  private explosionGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
  private decalGeo = new THREE.PlaneGeometry(1, 1);
  private bloodMat = new THREE.MeshBasicMaterial({ color: 0x991b1b });
  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
  private expMat1 = new THREE.MeshBasicMaterial({ color: 0xf97316 });
  private decalMat!: THREE.MeshBasicMaterial;

  // 3D Phantom hallucination pool (pre-built rigs, zero spawn lag)
  private phantoms: PhantomEntity[] = [];
  private phantomHitMeshes: THREE.Mesh[] = [];
  private cachedAimedBotId: string | null = null;
  private aimRayTimer = 0;

  // Loot & Feed
  private activeLoot: LootBundle | null = null;
  private feed: FeedMessage[] = [];
  private feedSeq = 1;
  private prevInfectionPhase: 0 | 1 | 2 = 0;
  private prevConsciousness: PhysiologyState['consciousness'] = 'awake';
  private conscWarnStage: 0 | 1 | 2 = 0;
  private hallucinationFxTimer = 6;

  constructor(
    container: HTMLElement,
    onSnapshot: (snap: GameSnapshot) => void,
    initialSensitivity = 1.0,
    initialMuted = false,
    initialControlMode: ControlMode = 'auto',
  ) {
    this.container = container;
    this.onSnapshot = onSnapshot;
    this.sensitivity = initialSensitivity;
    this.controlMode = initialControlMode;
    soundEngine.setMuted(initialMuted);

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.25),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6d87a3);
    this.scene.fog = new THREE.FogExp2(0x6d87a3, 0.0085);

    this.camera = new THREE.PerspectiveCamera(
      76,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.08,
      340,
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.hemiLight = new THREE.HemisphereLight(0x9fb8d4, 0x3b332b, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffedd5, 1.55);
    this.sunLight.position.set(42, 65, 28);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(768, 768);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 185;
    const d = 48;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 2 pooled local PointLights instead of 15+ simultaneous lights (massive FPS win!)
    this.pooledLampLight = new THREE.PointLight(0xffd9a0, 0, 28, 1.8);
    this.pooledLampLight.position.set(0, 5.2, 0);
    this.scene.add(this.pooledLampLight);

    this.pooledRoomLight = new THREE.PointLight(0xffe4b5, 0.8, 22, 1.7);
    this.pooledRoomLight.position.set(0, 3.2, 0);
    this.scene.add(this.pooledRoomLight);

    // Tactical Flashlight on player camera
    this.flashlight = new THREE.SpotLight(0xf8fafc, 0, 42, Math.PI / 5.5, 0.45, 1.4);
    this.camera.add(this.flashlight);
    this.flashlight.position.set(0.15, -0.08, -0.15);
    this.flashlightTarget.position.set(0, -0.08, -10);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.textures = createProceduralTextures(
      Math.min(4, this.renderer.capabilities.getMaxAnisotropy()),
    );
    this.decalMat = new THREE.MeshBasicMaterial({
      map: this.textures.bloodDecal,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    this.camera.add(this.viewmodelMount);
    this.gestureHandMesh = createGestureHandMesh();
    this.gestureHandMesh.visible = false;
    this.camera.add(this.gestureHandMesh);

    this.flashLight = new THREE.PointLight(0xffb347, 0, 12, 2);
    this.camera.add(this.flashLight);
    this.flashLight.position.set(0.25, -0.15, -0.7);

    this.phantomFlashLight = new THREE.PointLight(0xffa94d, 0, 14, 2);
    this.scene.add(this.phantomFlashLight);

    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ]);
    this.crusherBeam = new THREE.Line(
      beamGeo,
      new THREE.LineBasicMaterial({ color: 0x0ea5e9 }),
    );
    this.crusherBeam.visible = false;
    this.scene.add(this.crusherBeam);

    this.initWorldAndPlayer();
    this.bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.pushSnapshot(true);
    this.loop();
  }

  private initWorldAndPlayer() {
    this.world = buildAbandonedTown(this.scene, this.textures);
    this.playerRig = createGoreDollModel('player', 'survivor', this.textures.contactShadow);
    this.playerRig.root.visible = false;
    this.scene.add(this.playerRig.root);

    this.botManager = new BotManager(
      this.scene,
      this.textures.contactShadow,
      this.world.colliders,
      this.world.patrolPoints,
      {
        onPlayerHit: (limb, dmg, bleed, frac, fromPos) => {
          if (this.phys.consciousness === 'dead') return;
          applyLimbTrauma(
            this.phys,
            limb,
            dmg,
            bleed,
            frac,
            0.05,
            Math.random() < 0.2 ? 1 : 0,
          );
          soundEngine.playFleshImpact(dmg > 20);
          this.shakeIntensity = Math.min(0.22, this.shakeIntensity + dmg * 0.003);
          this.hitstopTimer = Math.max(this.hitstopTimer, 0.035);
          this.pushFeed(
            `Влучання в ${limb === 'head' ? 'голову' : limb === 'torso' ? 'тулуб' : 'кінцівку'}!`,
            'danger',
          );
          void fromPos;
        },
        onBotSpeech: (text, tone) => this.pushFeed(text, tone),
        onSpawnBlood: (pos, count) => this.spawnBloodBurst(pos, count),
        onSpawnMedDrop: (pos, med) => this.spawnGroundMedCrate(pos, med),
        onSpawnSpark: (pos) => this.spawnSparkBurst(pos),
      },
      this.world.coverPoints,
      this.world.props,
      this.world.buildings,
    );
    this.botManager.spawnInitialTownBots();
    this.initParticleAndPhantomPools();
    this.resetPlayerState();
  }

  private createParticlePool(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    capacity: number,
  ): InstancedParticlePool {
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const slots: PooledSlot[] = [];
    for (let i = 0; i < capacity; i++) {
      mesh.setMatrixAt(i, _zeroMat);
      slots.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        gravity: 14,
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    return { mesh, slots, cursor: 0 };
  }

  private initParticleAndPhantomPools() {
    this.bloodPool = this.createParticlePool(this.bloodGeo, this.bloodMat, 72);
    this.sparkPool = this.createParticlePool(this.sparkGeo, this.sparkMat, 36);
    this.expPool = this.createParticlePool(this.explosionGeo, this.expMat1, 48);

    this.decalMesh = new THREE.InstancedMesh(this.decalGeo, this.decalMat, 48);
    this.decalMesh.frustumCulled = false;
    for (let i = 0; i < 48; i++) {
      this.decalMesh.setMatrixAt(i, _zeroMat);
    }
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.decalCursor = 0;
    this.scene.add(this.decalMesh);

    this.phantoms = [];
    this.phantomHitMeshes = [];
    const archetypes: Array<'raider' | 'enforcer' | 'survivor'> = [
      'raider',
      'enforcer',
      'survivor',
    ];
    const weapons: WeaponId[] = ['rifle_556', 'pistol_9mm', 'shotgun_12ga'];
    for (let i = 0; i < 3; i++) {
      const id = `phantom_${i}`;
      const rig = createGoreDollModel(id, archetypes[i], this.textures.contactShadow);
      rig.root.visible = false;
      rig.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).castShadow = false;
        }
      });
      const wMesh = createWeaponMesh(weapons[i]);
      wMesh.scale.setScalar(0.86);
      rig.weaponMount.add(wMesh);
      this.scene.add(rig.root);

      const hitMeshes = [
        ...rig.limbMeshes.head,
        ...rig.limbMeshes.torso,
        ...rig.limbMeshes.leftArm,
        ...rig.limbMeshes.rightArm,
      ];
      for (const m of hitMeshes) {
        m.userData.phantomId = id;
        delete m.userData.botId;
        this.phantomHitMeshes.push(m);
      }

      this.phantoms.push({
        id,
        rig,
        animState: createProceduralAnimState(),
        recoilPulse: 0,
        hitMeshes,
        active: false,
        behavior: 'stalker',
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        yaw: 0,
        life: 0,
        maxLife: 4,
        aimedTime: 0,
        firedFakeShot: false,
        speechText: null,
        speechTimer: 0,
      });
    }
  }

  private resetPlayerState() {
    this.playerPos.set(0, 0, -2);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = 0;
    this.playerPitch = 0;
    this.isGrounded = true;
    this.isCrouching = false;
    this.isAiming = false;
    this.cameraMode = 'first';
    this.phys = createInitialPhysiology();
    this.prevInfectionPhase = 0;
    this.prevConsciousness = 'awake';
    this.conscWarnStage = 0;
    this.hallucinationFxTimer = 5;
    this.cachedAimedBotId = null;
    for (const ph of this.phantoms) {
      ph.active = false;
      ph.rig.root.visible = false;
      ph.speechText = null;
    }
    this.inventory = createInitialPlayerInventory();
    this.selectWeapon('pistol_9mm');
    this.feed = [];
    this.pushFeed(
      'Велика карта (400м): I — рюкзак, Tab — здоров’я, F — ліхтар.',
      'neutral',
    );
  }

  restartWorld() {
    const toRemove: THREE.Object3D[] = [];
    this.scene.children.forEach((child) => {
      if (
        child !== this.camera &&
        child !== this.crusherBeam &&
        child !== this.sunLight.target &&
        child !== this.phantomFlashLight &&
        !(child as THREE.Light).isLight
      ) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((o) => this.scene.remove(o));
    this.grenades = [];
    this.phantomFlashLight.intensity = 0;

    this.initWorldAndPlayer();
    this.phase = 'playing';
    if (!this.isTouchPrimary()) {
      this.requestPointerLock();
    }
    this.pushSnapshot(true);
  }

  private spawnGroundMedCrate(pos: THREE.Vector3, med: MedItemId) {
    const id = `drop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const mesh = createLootCrateModel('med', this.textures.woodCrate, this.textures.contactShadow);
    mesh.scale.setScalar(0.62);
    mesh.position.set(pos.x, 0, pos.z);
    mesh.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.userData.lootId = id;
    });
    this.scene.add(mesh);
    this.world.lootNodes.push({
      id,
      mesh,
      pos: new THREE.Vector3(pos.x, 0, pos.z),
      bundle: {
        id,
        labelUk: 'Скинутий медпакет',
        labelEn: 'Dropped Med Pouch',
        kind: 'container',
        weapons: [],
        ammo: {},
        meds: { [med]: 1 },
        grid: buildGridFromLoot([], {}, { [med]: 1 }),
        searched: false,
      },
    });
  }

  private pushFeed(text: string, tone: FeedMessage['tone'] = 'neutral') {
    this.feed = [
      { id: this.feedSeq++, text, tone, timestamp: Date.now() },
      ...this.feed.slice(0, 4),
    ];
  }

  // --- Public UI/React Control API ---

  private isKnockedOut(): boolean {
    return (
      this.phys.consciousness === 'unconscious' ||
      this.phys.consciousness === 'cardiacArrest'
    );
  }

  cycleCameraMode() {
    if (this.isKnockedOut()) return;
    const order: CameraMode[] = ['first', 'third', 'free'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.cameraMode = next;
    if (next === 'free') {
      this.freeCamPos.copy(this.camera.position);
      this.pushFeed('Вільна камера (Free Cam): WASD + Space/C', 'neutral');
    } else if (next === 'third') {
      this.pushFeed('Камера від 3-ї особи (3rd Person)', 'neutral');
    } else {
      this.pushFeed('Камера від 1-ї особи (1st Person)', 'neutral');
    }
    this.pushSnapshot(true);
  }

  toggleFlashlight() {
    if (this.isKnockedOut()) return;
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 7.5 : 0;
    soundEngine.playUiClick(this.flashlightOn);
    this.pushSnapshot(true);
  }

  advanceTimeOfDay(hours = 4) {
    if (this.isKnockedOut()) return;
    this.timeOfDay = (this.timeOfDay + hours) % 24;
    this.pushSnapshot(true);
  }

  performCprAction() {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    performChestCpr(this.phys);
    soundEngine.playFleshImpact(false);
    this.pushSnapshot(true);
  }

  startPlay(requestLock = true) {
    this.phase = 'playing';
    if (requestLock && !this.isTouchPrimary()) {
      this.requestPointerLock();
    }
    this.pushSnapshot(true);
  }

  pauseGame() {
    if (
      this.phase === 'playing' ||
      this.phase === 'medical' ||
      this.phase === 'loot' ||
      this.phase === 'inventory'
    ) {
      this.phase = 'paused';
      if (document.pointerLockElement) document.exitPointerLock();
      this.keys.clear();
      this.pushSnapshot(true);
    }
  }

  resumeGame(requestLock = true) {
    if (this.phys.consciousness === 'dead') return;
    this.phase = 'playing';
    this.activeLoot = null;
    if (requestLock && !this.isTouchPrimary()) {
      this.requestPointerLock();
    }
    this.pushSnapshot(true);
  }

  openMedical() {
    if (this.phys.consciousness === 'dead' || this.isKnockedOut()) return;
    this.phase = 'medical';
    if (document.pointerLockElement) document.exitPointerLock();
    this.keys.clear();
    this.pushSnapshot(true);
  }

  closeMedical(requestLock = true) {
    if (this.phys.consciousness === 'dead') return;
    this.phase = 'playing';
    if (requestLock && !this.isTouchPrimary() && !this.isKnockedOut()) {
      this.requestPointerLock();
    }
    this.pushSnapshot(true);
  }

  openInventory() {
    if (this.phys.consciousness === 'dead' || this.isKnockedOut()) return;
    this.phase = 'inventory';
    this.activeLoot = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.keys.clear();
    this.pushSnapshot(true);
  }

  closeInventory(requestLock = true) {
    if (this.phys.consciousness === 'dead') return;
    this.phase = 'playing';
    if (requestLock && !this.isTouchPrimary() && !this.isKnockedOut()) {
      this.requestPointerLock();
    }
    this.pushSnapshot(true);
  }

  openNearbyLoot() {
    if (this.phys.consciousness === 'dead' || this.isKnockedOut()) return;
    const prompt = this.findNearbyInteractable();
    if (!prompt || prompt.type !== 'loot') return;
    const node = this.world.lootNodes.find((l) => l.id === prompt.targetId);
    const bot = this.botManager.bots.find((b) => b.loot.id === prompt.targetId);
    const bundle = node?.bundle ?? bot?.loot ?? null;
    if (!bundle) return;
    bundle.searched = true;
    this.activeLoot = bundle;
    this.phase = 'loot';
    if (document.pointerLockElement) document.exitPointerLock();
    this.keys.clear();
    this.pushSnapshot(true);
  }

  moveBackpackItem(uid: string, targetX: number, targetY: number): boolean {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return false;
    const item = this.inventory.backpack.items.find((i) => i.uid === uid);
    if (!item) return false;
    if (!canPlaceAt(this.inventory.backpack, targetX, targetY, item.w, item.h, uid)) {
      return false;
    }
    item.x = targetX;
    item.y = targetY;
    soundEngine.playUiClick(true);
    this.pushSnapshot(true);
    return true;
  }

  dropBackpackItem(uid: string) {
    const idx = this.inventory.backpack.items.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const item = this.inventory.backpack.items[idx];
    this.inventory.backpack.items.splice(idx, 1);
    syncInventoryFromGrid(this.inventory);
    if (item.category === 'weapon' && item.weaponId && !this.inventory.ownedWeapons.includes(item.weaponId)) {
      if (this.activeWeapon === item.weaponId) {
        this.selectWeapon('hands');
      }
    }
    soundEngine.playUiClick(false);
    this.pushFeed(`Викинуто: ${item.nameUk}`, 'neutral');
    this.pushSnapshot(true);
  }

  useBackpackItem(uid: string) {
    const idx = this.inventory.backpack.items.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const item = this.inventory.backpack.items[idx];
    if (item.category === 'weapon' && item.weaponId) {
      this.selectWeapon(item.weaponId);
      soundEngine.playUiClick(true);
      this.pushSnapshot(true);
    } else if (item.category === 'med') {
      this.openMedical();
    } else if (item.category === 'backpack' && item.backpackTier) {
      this.equipBackpackFromItem(uid, 'backpack');
    }
  }

  equipBackpackFromItem(uid: string, source: 'backpack' | 'loot'): boolean {
    let targetTier: BackpackTierId | undefined;
    if (source === 'backpack') {
      const idx = this.inventory.backpack.items.findIndex((i) => i.uid === uid);
      if (idx === -1) return false;
      const it = this.inventory.backpack.items[idx];
      if (it.category !== 'backpack' || !it.backpackTier) return false;
      targetTier = it.backpackTier;
      if (targetTier === this.inventory.backpackTier) {
        this.pushFeed('Цей рюкзак вже екіпіровано!', 'neutral');
        this.pushSnapshot(true);
        return false;
      }
      this.inventory.backpack.items.splice(idx, 1);
      const prevTier = equipBackpackTier(this.inventory, targetTier);
      if (!prevTier) {
        this.inventory.backpack.items.push(it);
        syncInventoryFromGrid(this.inventory);
        this.pushFeed('Недостатньо місця для перекладання речей!', 'warn');
        this.pushSnapshot(true);
        return false;
      }
      addItemToGrid(this.inventory.backpack, createGridBackpackItem(prevTier));
      syncInventoryFromGrid(this.inventory);
      soundEngine.playUiClick(true);
      this.pushFeed(
        `Екіпіровано: ${BACKPACK_TIERS[targetTier].nameUk}`,
        'friendly',
      );
      this.pushSnapshot(true);
      return true;
    } else if (source === 'loot' && this.activeLoot) {
      const idx = this.activeLoot.grid.items.findIndex((i) => i.uid === uid);
      if (idx === -1) return false;
      const it = this.activeLoot.grid.items[idx];
      if (it.category !== 'backpack' || !it.backpackTier) return false;
      targetTier = it.backpackTier;
      if (targetTier === this.inventory.backpackTier) {
        this.pushFeed('У вас вже такий самий рюкзак!', 'neutral');
        this.pushSnapshot(true);
        return false;
      }
      const prevTier = equipBackpackTier(this.inventory, targetTier);
      if (!prevTier) {
        this.pushFeed('Менший рюкзак не вміщує поточні речі!', 'warn');
        this.pushSnapshot(true);
        return false;
      }
      this.activeLoot.grid.items.splice(idx, 1);
      addItemToGrid(this.activeLoot.grid, createGridBackpackItem(prevTier));
      syncLootFromGrid(this.activeLoot);
      soundEngine.playUiClick(true);
      this.pushFeed(
        `Екіпіровано: ${BACKPACK_TIERS[targetTier].nameUk}`,
        'friendly',
      );
      this.pushSnapshot(true);
      return true;
    }
    return false;
  }

  transferLootItem(uid: string, targetX?: number, targetY?: number): boolean {
    if (!this.activeLoot) return false;
    const idx = this.activeLoot.grid.items.findIndex((i) => i.uid === uid);
    if (idx === -1) return false;
    const sourceItem = this.activeLoot.grid.items[idx];
    const cloned = structuredClone(sourceItem);

    let placed = false;
    if (
      targetX !== undefined &&
      targetY !== undefined &&
      canPlaceAt(this.inventory.backpack, targetX, targetY, cloned.w, cloned.h)
    ) {
      cloned.x = targetX;
      cloned.y = targetY;
      this.inventory.backpack.items.push(cloned);
      placed = true;
    } else {
      placed = addItemToGrid(this.inventory.backpack, cloned);
    }

    if (!placed) {
      this.pushFeed('Рюкзак переповнений! Звільніть ячейки.', 'warn');
      this.pushSnapshot(true);
      return false;
    }

    this.activeLoot.grid.items.splice(idx, 1);
    const hadWeapon =
      sourceItem.category === 'weapon' &&
      sourceItem.weaponId &&
      this.inventory.ownedWeapons.includes(sourceItem.weaponId);

    syncLootFromGrid(this.activeLoot);
    syncInventoryFromGrid(this.inventory);

    if (sourceItem.category === 'weapon' && sourceItem.weaponId && !hadWeapon) {
      this.inventory.magAmmo[sourceItem.weaponId] = WEAPON_DEFS[sourceItem.weaponId].magSize;
      this.selectWeapon(sourceItem.weaponId);
    }

    soundEngine.playUiClick(true);
    this.pushSnapshot(true);
    return true;
  }

  takeLootWeapon(weapon: WeaponId) {
    if (!this.activeLoot) return;
    const item = this.activeLoot.grid.items.find(
      (i) => i.category === 'weapon' && i.weaponId === weapon,
    );
    if (item) this.transferLootItem(item.uid);
  }

  takeLootAmmo(caliber: CaliberId) {
    if (!this.activeLoot) return;
    const items = this.activeLoot.grid.items.filter(
      (i) => i.category === 'ammo' && i.caliber === caliber,
    );
    items.forEach((i) => this.transferLootItem(i.uid));
  }

  takeLootMed(medId: MedItemId) {
    if (!this.activeLoot) return;
    const items = this.activeLoot.grid.items.filter(
      (i) => i.category === 'med' && i.medId === medId,
    );
    items.forEach((i) => this.transferLootItem(i.uid));
  }

  takeAllLoot() {
    if (!this.activeLoot) return;
    const uids = this.activeLoot.grid.items.map((i) => i.uid);
    for (const uid of uids) {
      if (!this.transferLootItem(uid)) break;
    }
    if (this.activeLoot.grid.items.length === 0) {
      this.resumeGame(!this.isTouchPrimary());
    }
  }

  performBandageSwipe(limbId: LimbId, deltaPct: number, itemUid?: string) {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    if (this.inventory.meds.bandage <= 0) return;
    const completed = applyBandageStroke(this.phys, limbId, deltaPct);
    consumeBandageDurability(this.inventory, Math.max(2, deltaPct * 0.85), itemUid);
    soundEngine.playBandageSwipe();
    if (completed) {
      this.pushFeed('Бинт накладено / Bandage wrapped', 'friendly');
    }
    this.pushSnapshot(true);
  }

  performTourniquet(limbId: LimbId, itemUid?: string) {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    const limb = this.phys.limbs[limbId];
    if (!limb.tourniquet && this.inventory.meds.tourniquet <= 0) return;
    const ok = toggleLimbTourniquet(this.phys, limbId);
    if (ok) {
      if (limb.tourniquet) {
        consumeOneMedFromGrid(this.inventory, 'tourniquet', itemUid);
      } else {
        addItemToGrid(this.inventory.backpack, createGridMedItem('tourniquet', 1));
        syncInventoryFromGrid(this.inventory);
      }
      soundEngine.playUiClick(true);
      this.pushSnapshot(true);
    }
  }

  performSplint(limbId: LimbId, itemUid?: string) {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    if (this.inventory.meds.splint <= 0) return;
    if (applyLimbSplint(this.phys, limbId)) {
      consumeOneMedFromGrid(this.inventory, 'splint', itemUid);
      soundEngine.playUiClick(true);
      this.pushSnapshot(true);
    }
  }

  performExtractShrapnel(limbId: LimbId) {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    if (this.inventory.meds.tweezers <= 0) return;
    if (extractLimbShrapnel(this.phys, limbId)) {
      soundEngine.playUiClick(true);
      this.pushSnapshot(true);
    }
  }

  performWoundSlip(limbId: LimbId) {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    applyLimbTrauma(this.phys, limbId, 3, 0.25, 0, 0);
    soundEngine.playFleshImpact(false);
    this.pushSnapshot(true);
  }

  performSyringeStep(
    medId: MedItemId,
    limbId: LimbId,
    fractionDelta: number,
    finishedSyringe: boolean,
    needleBroken: boolean,
    itemUid?: string,
  ) {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    if (this.inventory.meds[medId] <= 0) return;
    if (needleBroken) {
      breakNeedleInLimb(this.phys, limbId);
      consumeOneMedFromGrid(this.inventory, medId, itemUid);
      soundEngine.playSyringeInject(true);
      this.pushFeed('Голка зламалась! / Needle snapped inside limb!', 'danger');
      this.pushSnapshot(true);
      return;
    }

    injectSyringeFraction(this.phys, medId, fractionDelta, limbId);
    soundEngine.playSyringeInject(false);
    if (finishedSyringe) {
      consumeOneMedFromGrid(this.inventory, medId, itemUid);
      // Leave behind an empty used syringe for all syringe injections (except IV saline bag)
      if (medId !== 'syringe_saline') {
        addItemToGrid(this.inventory.backpack, createGridMedItem('used_syringe', 1));
        syncInventoryFromGrid(this.inventory);
      }
    }
    this.pushSnapshot(true);
  }

  performBloodTransfusion(
    limbId: LimbId,
    viaUsedSyringe: boolean,
    bagUid?: string,
    conduitUid?: string,
  ) {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    if (this.inventory.meds.blood_bag <= 0) return;
    const conduitId: MedItemId = viaUsedSyringe ? 'used_syringe' : 'transfusion_tube';
    if (this.inventory.meds[conduitId] <= 0) return;

    consumeOneMedFromGrid(this.inventory, 'blood_bag', bagUid);
    consumeOneMedFromGrid(this.inventory, conduitId, conduitUid);
    transfuseBloodBag(this.phys, limbId, viaUsedSyringe);
    soundEngine.playSyringeInject(false);
    // Do NOT reveal hidden Phase 1 infection status in feed!
    this.pushFeed(
      viaUsedSyringe
        ? 'Кров перелито (+450мл) через використаний шприц'
        : 'Кров безпечно перелито (+450мл) через стерильну трубку',
      viaUsedSyringe ? 'warn' : 'friendly',
    );
    this.pushSnapshot(true);
  }

  performTakeAntibiotics(itemUid?: string) {
    if (this.isKnockedOut() || this.phys.consciousness === 'dead') return;
    if (this.inventory.meds.antibiotics <= 0) return;
    consumeOneMedFromGrid(this.inventory, 'antibiotics', itemUid);
    takeAntibiotics(this.phys);
    soundEngine.playUiClick(true);
    this.pushFeed('Прийнято курс антибіотиків / Antibiotics taken', 'friendly');
    this.pushSnapshot(true);
  }

  selectWeapon(weaponId: WeaponId) {
    if (this.isKnockedOut()) return;
    if (!this.inventory.ownedWeapons.includes(weaponId)) return;
    this.activeWeapon = weaponId;
    this.isReloading = false;
    this.reloadTimer = 0;
    if (this.grabbedTarget) {
      this.releaseCrusherTarget(false);
    }

    if (this.weaponViewMesh) {
      this.viewmodelMount.remove(this.weaponViewMesh);
    }
    this.weaponViewMesh = createWeaponMesh(weaponId);
    this.viewmodelMount.add(this.weaponViewMesh);

    if (this.playerRig) {
      this.playerRig.weaponMount.clear();
      if (weaponId !== 'hands') {
        const w = createWeaponMesh(weaponId);
        w.scale.setScalar(0.86);
        this.playerRig.weaponMount.add(w);
      }
    }
    this.pushSnapshot(true);
  }

  cycleWeapon(dir: 1 | -1 = 1) {
    const list = this.inventory.ownedWeapons;
    const idx = list.indexOf(this.activeWeapon);
    const next = list[(idx + dir + list.length) % list.length];
    this.selectWeapon(next);
  }

  triggerGesture(gesture: GestureId) {
    if (this.phase !== 'playing' || this.isKnockedOut()) return;
    if (gesture === 'peace') {
      this.selectWeapon('hands');
    }
    this.activeGesture = gesture;
    this.gestureTimer = 1.15;
    this.gestureHandMesh.visible = true;
    soundEngine.playUiClick(true);

    _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
    this.botManager.handlePlayerGesture(
      gesture,
      this.playerPos,
      _dir,
      this.activeWeapon !== 'hands',
    );
    this.pushSnapshot(true);
  }

  setTouchMove(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  addTouchLookDelta(dx: number, dy: number) {
    if (this.phase !== 'playing' || this.isKnockedOut()) return;
    const sens = 0.0042 * this.sensitivity;
    this.playerYaw -= dx * sens;
    this.playerPitch = Math.max(
      -1.45,
      Math.min(1.45, this.playerPitch - dy * sens),
    );
  }

  setTouchFire(held: boolean) {
    if (this.isKnockedOut()) {
      this.touchFireHeld = false;
      return;
    }
    const wasHeld = this.touchFireHeld;
    this.touchFireHeld = held;
    if (held && !wasHeld && this.phase === 'playing') {
      this.handlePrimaryFirePress();
    } else if (!held && wasHeld && this.grabbedTarget) {
      this.releaseCrusherTarget(false);
    }
  }

  toggleAds() {
    if (this.isKnockedOut()) return;
    this.isAiming = !this.isAiming;
    this.pushSnapshot(true);
  }

  toggleCrouch() {
    if (this.isKnockedOut()) return;
    this.isCrouching = !this.isCrouching;
    this.pushSnapshot(true);
  }

  triggerJump() {
    if (
      this.isGrounded &&
      this.phase === 'playing' &&
      !this.isKnockedOut() &&
      this.cameraMode !== 'free'
    ) {
      const legBroken =
        this.phys.limbs.leftLeg.fractured && !this.phys.limbs.leftLeg.splinted;
      this.playerVel.y = legBroken ? 3.2 : 6.1;
      this.isGrounded = false;
    }
  }

  triggerReload() {
    if (this.phase !== 'playing' || this.isReloading || this.isKnockedOut()) return;
    const def = WEAPON_DEFS[this.activeWeapon];
    if (def.kind !== 'firearm') return;
    const cur = this.inventory.magAmmo[this.activeWeapon];
    const res = this.inventory.reserveAmmo[def.caliber];
    if (cur >= def.magSize || res <= 0) return;
    this.isReloading = true;
    const armInjured =
      this.phys.limbs.leftArm.fractured || this.phys.limbs.rightArm.fractured;
    const cloudSlow = this.phys.consciousnessPct < 65 ? 1.35 : 1.0;
    this.reloadTimer = def.reloadTimeSec * (armInjured ? 1.45 : 1.0) * cloudSlow;
    soundEngine.playUiClick(false);
    this.pushSnapshot(true);
  }

  crusherThrow() {
    if (this.isKnockedOut()) return;
    if (this.grabbedTarget) {
      this.releaseCrusherTarget(true);
    }
  }

  setSensitivity(s: number) {
    this.sensitivity = s;
  }

  setMuted(m: boolean) {
    soundEngine.setMuted(m);
  }

  setControlMode(mode: ControlMode) {
    this.controlMode = mode;
    if (mode === 'touch' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  requestPointerLock() {
    try {
      const maybePromise = this.renderer.domElement.requestPointerLock?.() as
        | Promise<void>
        | undefined;
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
          // ignore sandboxed iframe or Escape-cooldown pointerlock rejection
        });
      }
    } catch {
      // ignore sandbox pointerlock rejection
    }
  }

  private isTouchPrimary() {
    return detectTouchMode(this.controlMode);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isKnockedOut()) {
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Escape' && this.phase !== 'paused') {
        this.pauseGame();
      }
      return;
    }
    this.keys.add(e.code);
    if (this.phase === 'playing') {
      if (e.code === 'KeyR') this.triggerReload();
      else if (e.code === 'KeyC') this.toggleCrouch();
      else if (e.code === 'Space') this.triggerJump();
      else if (e.code === 'KeyE') this.openNearbyLoot();
      else if (e.code === 'KeyV') this.cycleCameraMode();
      else if (e.code === 'KeyF') this.toggleFlashlight();
      else if (e.code === 'KeyT') this.advanceTimeOfDay(4);
      else if (e.code === 'KeyM' || e.code === 'Tab') {
        e.preventDefault();
        this.openMedical();
      } else if (e.code === 'KeyI') {
        e.preventDefault();
        this.openInventory();
      } else if (e.code === 'Digit1') this.selectWeapon('hands');
      else if (e.code === 'Digit2') this.selectWeapon('reality_crusher');
      else if (e.code === 'Digit3') this.selectWeapon('crowbar');
      else if (e.code === 'Digit4') this.selectWeapon('pistol_9mm');
      else if (e.code === 'Digit5') {
        const heavy: WeaponId[] = [
          'shotgun_12ga',
          'rifle_556',
          'sniper_762',
          'katana',
          'fire_axe',
          'frag_grenade',
        ];
        const found = heavy.find((w) => this.inventory.ownedWeapons.includes(w));
        if (found) this.selectWeapon(found);
      } else if (e.code === 'KeyQ') this.cycleWeapon(1);
      else if (e.code === 'Escape') this.pauseGame();
    } else if (
      this.phase === 'medical' &&
      (e.code === 'Tab' || e.code === 'KeyM' || e.code === 'Escape')
    ) {
      e.preventDefault();
      this.closeMedical();
    } else if (
      this.phase === 'inventory' &&
      (e.code === 'KeyI' || e.code === 'Tab' || e.code === 'Escape')
    ) {
      e.preventDefault();
      this.closeInventory();
    } else if (this.phase === 'loot' && (e.code === 'Escape' || e.code === 'KeyE')) {
      this.resumeGame();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.touchFireHeld = false;
    this.mouseFireHeld = false;
    this.lastDragPt = null;
    this.isAiming = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing' || this.isKnockedOut()) return;
    const sens = 0.0024 * this.sensitivity * (this.isAiming ? 0.55 : 1);
    if (document.pointerLockElement === this.renderer.domElement) {
      if (this.skipNextLockMove) {
        this.skipNextLockMove = false;
        return;
      }
      // Guard against Chromium PointerLock warp spikes when cursor re-centers
      if (Math.abs(e.movementX) > 220 || Math.abs(e.movementY) > 220) {
        return;
      }
      this.playerYaw -= e.movementX * sens;
      this.playerPitch = Math.max(
        -1.45,
        Math.min(1.45, this.playerPitch - e.movementY * sens),
      );
    } else if (this.lastDragPt && this.controlMode !== 'touch') {
      // Fallback drag-to-look if PointerLock is blocked or in cooldown
      const dx = e.clientX - this.lastDragPt.x;
      const dy = e.clientY - this.lastDragPt.y;
      this.lastDragPt = { x: e.clientX, y: e.clientY };
      if (Math.abs(dx) > 160 || Math.abs(dy) > 160) return;
      this.playerYaw -= dx * sens * 1.4;
      this.playerPitch = Math.max(
        -1.45,
        Math.min(1.45, this.playerPitch - dy * sens * 1.4),
      );
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing' || this.isKnockedOut()) return;
    if (e.target !== this.renderer.domElement) return;
    const isLocked = document.pointerLockElement === this.renderer.domElement;
    if (!isLocked && this.controlMode !== 'touch') {
      this.requestPointerLock();
      this.lastDragPt = { x: e.clientX, y: e.clientY };
    }
    if (e.button === 0) {
      this.mouseFireHeld = true;
      this.handlePrimaryFirePress();
    } else if (e.button === 2) {
      if (this.activeWeapon === 'reality_crusher' && this.grabbedTarget) {
        this.releaseCrusherTarget(true);
      } else {
        this.isAiming = true;
      }
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    this.lastDragPt = null;
    if (e.button === 0) {
      this.mouseFireHeld = false;
      if (this.grabbedTarget) {
        this.releaseCrusherTarget(false);
      }
    } else if (e.button === 2) {
      this.isAiming = false;
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing' || this.isKnockedOut()) return;
    if (this.grabbedTarget) {
      this.grabbedTarget.distance = Math.max(
        2.2,
        Math.min(18, this.grabbedTarget.distance - Math.sign(e.deltaY) * 1.1),
      );
    } else {
      this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }
  };

  private onPointerLockChange = () => {
    const wasLocked = this.pointerLocked;
    this.pointerLocked =
      document.pointerLockElement === this.renderer.domElement;
    if (this.pointerLocked && !wasLocked) {
      this.skipNextLockMove = true;
      this.lastDragPt = null;
    }
    this.pushSnapshot(true);
  };

  private onPointerLockError = () => {
    this.pointerLocked =
      document.pointerLockElement === this.renderer.domElement;
    this.pushSnapshot(true);
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.phase === 'playing') e.preventDefault();
  };

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('resize', this.onResize);
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  private handlePrimaryFirePress() {
    if (
      this.phys.consciousness === 'unconscious' ||
      this.phys.consciousness === 'cardiacArrest'
    ) {
      return;
    }
    if (this.activeWeapon === 'reality_crusher') {
      this.tryCrusherGrab();
      return;
    }
    if (this.activeWeapon === 'frag_grenade') {
      this.throwGrenade();
      return;
    }
    this.fireActiveWeapon();
  }

  private tryCrusherGrab() {
    _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
    _rayOrigin.copy(this.camera.position);
    _raycaster.set(_rayOrigin, _dir);
    _raycaster.far = 28;

    const targets = [
      ...this.world.propHitMeshes,
      ...this.botManager.getAllRaycastMeshes(),
    ];
    const hits = _raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return;

    const hit = hits[0];
    if (hit.object.userData.propId) {
      const prop = this.world.props.find((p) => p.id === hit.object.userData.propId);
      if (prop && !prop.exploded) {
        this.grabbedTarget = { kind: 'prop', prop, distance: Math.max(2.6, hit.distance) };
        soundEngine.playCrusherPulse(false);
        this.pushSnapshot(true);
      }
    } else if (hit.object.userData.botId) {
      const bot = this.botManager.bots.find((b) => b.id === hit.object.userData.botId);
      if (bot) {
        bot.grabbedByCrusher = true;
        this.grabbedTarget = { kind: 'bot', bot, distance: Math.max(2.6, hit.distance) };
        soundEngine.playCrusherPulse(false);
        this.pushSnapshot(true);
      }
    }
  }

  private releaseCrusherTarget(fling: boolean) {
    if (!this.grabbedTarget) return;
    _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
    const launchSpeed = fling ? 26 : 1.5;

    if (this.grabbedTarget.kind === 'prop') {
      this.grabbedTarget.prop.vel.copy(_dir).multiplyScalar(launchSpeed);
    } else {
      const bot = this.grabbedTarget.bot;
      bot.grabbedByCrusher = false;
      bot.vel.copy(_dir).multiplyScalar(launchSpeed * 0.75);
      if (bot.ragdoll && bot.ragdoll.nodes.length >= 11) {
        const imp = _dir.clone().multiplyScalar(launchSpeed * 0.015);
        shiftRagdoll(bot.ragdoll, 0, 0.05, 0, imp);
      }
      if (fling && bot.aiState !== 'dead') {
        this.botManager.damageBotLimb(bot.id, 'torso', 42, 1.8, 0.45, 0, _dir, true);
      }
    }
    soundEngine.playCrusherPulse(fling);
    this.grabbedTarget = null;
    this.crusherBeam.visible = false;
    this.pushSnapshot(true);
  }

  private throwGrenade() {
    if (this.fireCooldownMs > 0) return;
    if (this.inventory.reserveAmmo.frag <= 0) {
      this.pushFeed('Гранати закінчилися! / Out of grenades!', 'warn');
      return;
    }
    consumeAmmoFromGrid(this.inventory, 'frag', 1);
    this.fireCooldownMs = 700;
    const mesh = createWeaponMesh('frag_grenade');
    mesh.scale.setScalar(1.4);
    const pos = this.camera.position.clone();
    _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
    pos.addScaledVector(_dir, 0.7);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    const vel = _dir.clone().multiplyScalar(17);
    vel.y += 4.5;
    this.grenades.push({ mesh, pos, vel, fuse: 2.3 });
    soundEngine.playMeleeSwing(false);
    this.pushSnapshot(true);
  }

  private fireActiveWeapon() {
    if (this.fireCooldownMs > 0 || this.isReloading) return;
    const def = WEAPON_DEFS[this.activeWeapon];

    if (def.kind === 'melee' || def.kind === 'unarmed') {
      this.fireCooldownMs = def.fireRateMs;
      this.meleeSwingTimer = 0.24;
      this.playerRecoilPulse = 1.0;
      soundEngine.playMeleeSwing(def.damage > 45);
      _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
      _raycaster.set(this.camera.position, _dir);
      _raycaster.far = def.range;

      const targets = [
        ...this.botManager.getAllRaycastMeshes(),
        ...this.world.propHitMeshes,
      ];
      const hits = _raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hit = hits[0];
        if (hit.object.userData.botId) {
          const { severed } = this.botManager.damageBotLimb(
            hit.object.userData.botId,
            hit.object.userData.limbId,
            def.damage,
            def.bleedPower,
            def.fractureChance,
            def.severChance,
            _dir,
            true,
          );
          soundEngine.playFleshImpact(severed || def.damage > 45);
          this.spawnBloodBurst(hit.point, severed ? 20 : 10);
          this.hitstopTimer = 0.045;
        } else if (hit.object.userData.propId) {
          this.damageProp(hit.object.userData.propId, def.damage, _dir);
        }
      }
      return;
    }

    if (def.kind !== 'firearm') return;
    if (this.inventory.magAmmo[this.activeWeapon] <= 0) {
      this.triggerReload();
      return;
    }

    this.inventory.magAmmo[this.activeWeapon] -= 1;
    this.fireCooldownMs = def.fireRateMs;
    this.viewKickZ = 0.075;
    this.recoilPitch += def.recoil;
    this.playerRecoilPulse = 1.0;
    this.flashLight.intensity = 5.5;
    this.flashTimer = 0.055;
    soundEngine.playGunshot(this.activeWeapon);

    this.botManager.alertBotsToGunshot(this.playerPos, 42);

    const cloudSpread =
      this.phys.consciousnessPct < 75
        ? (75 - this.phys.consciousnessPct) * 0.022
        : 0;
    const brainSpreadPenalty =
      (this.phys.organs.brain < 80 ? (80 - this.phys.organs.brain) * 0.014 : 0) +
      (this.phys.postWakeDebuffTimer > 0 ? 0.85 : 0) +
      cloudSpread;
    const spreadScale =
      (this.isAiming ? 0.38 : 1.0) *
      (1 + this.phys.pain * 0.012 + brainSpreadPenalty);

    const targets = [
      ...this.botManager.getAllRaycastMeshes(),
      ...(this.phantoms.some((ph) => ph.active) ? this.phantomHitMeshes : []),
      ...this.world.propHitMeshes,
      ...this.world.raycastWalls,
    ];

    for (let p = 0; p < def.pellets; p++) {
      _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
      _dir.x += (Math.random() - 0.5) * def.spread * spreadScale;
      _dir.y += (Math.random() - 0.5) * def.spread * spreadScale;
      _dir.z += (Math.random() - 0.5) * def.spread * spreadScale;
      _dir.normalize();

      _raycaster.set(this.camera.position, _dir);
      _raycaster.far = def.range;

      const hits = _raycaster.intersectObjects(targets, false);
      let powerRemaining = 1.0;

      for (const hit of hits) {
        if (hit.object.userData.phantomId) {
          const ph = this.phantoms.find((x) => x.id === hit.object.userData.phantomId);
          if (ph && ph.active) {
            this.dismissPhantom(ph, true);
            break;
          }
        } else if (hit.object.userData.botId) {
          const { severed } = this.botManager.damageBotLimb(
            hit.object.userData.botId,
            hit.object.userData.limbId,
            def.damage * powerRemaining,
            def.bleedPower * powerRemaining,
            def.fractureChance,
            def.severChance,
            _dir,
            true,
          );
          soundEngine.playFleshImpact(severed);
          this.spawnBloodBurst(hit.point, severed ? 18 : 8);
          powerRemaining *= 0.45;
          if (powerRemaining < 0.2) break;
        } else if (hit.object.userData.propId) {
          this.damageProp(hit.object.userData.propId, def.damage * powerRemaining, _dir);
          break;
        } else {
          this.spawnSparkBurst(hit.point);
          const wallCol = this.world.colliders.find((c) => c.mesh === hit.object);
          if (wallCol && def.penetration >= wallCol.thickness) {
            powerRemaining *= 0.55;
            continue;
          }
          break;
        }
      }
    }

    this.pushSnapshot();
  }

  private damageProp(propId: string, damage: number, dir: THREE.Vector3) {
    const prop = this.world.props.find((p) => p.id === propId);
    if (!prop || prop.exploded) return;
    prop.hp -= damage;
    prop.vel.addScaledVector(dir, damage * 0.12);
    if (prop.hp <= 0 && prop.isExplosive) {
      this.explodeAt(prop.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 7.5, 115);
      prop.exploded = true;
      prop.mesh.visible = false;
      prop.hitMesh.position.y = -50;
    }
  }

  private spawnPooledParticle(
    pool: InstancedParticlePool,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    gravity: number,
  ) {
    const slot = pool.slots[pool.cursor];
    pool.cursor = (pool.cursor + 1) % pool.slots.length;
    slot.active = true;
    slot.pos.set(x, y, z);
    slot.vel.set(vx, vy, vz);
    slot.life = life;
    slot.gravity = gravity;
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    pool.mesh.setMatrixAt(
      (pool.cursor + pool.slots.length - 1) % pool.slots.length,
      _dummy.matrix,
    );
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  private stepParticlePool(pool: InstancedParticlePool, dt: number) {
    let anyUpdated = false;
    for (let i = 0; i < pool.slots.length; i++) {
      const pt = pool.slots[i];
      if (!pt.active) continue;
      anyUpdated = true;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        pool.mesh.setMatrixAt(i, _zeroMat);
        continue;
      }
      pt.vel.y -= pt.gravity * dt;
      pt.pos.x += pt.vel.x * dt;
      pt.pos.y += pt.vel.y * dt;
      pt.pos.z += pt.vel.z * dt;
      if (pt.pos.y < 0.04) {
        pt.pos.y = 0.04;
        pt.vel.set(0, 0, 0);
      }
      _dummy.position.copy(pt.pos);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      pool.mesh.setMatrixAt(i, _dummy.matrix);
    }
    if (anyUpdated) {
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private explodeAt(center: THREE.Vector3, radius: number, maxDmg: number) {
    soundEngine.playExplosion();
    this.botManager.alertBotsToGunshot(center, 68);
    this.shakeIntensity = Math.min(0.32, this.shakeIntensity + 0.22);
    this.hitstopTimer = 0.06;

    for (let i = 0; i < 16; i++) {
      this.spawnPooledParticle(
        this.expPool,
        center.x,
        center.y,
        center.z,
        (Math.random() - 0.5) * 14,
        3 + Math.random() * 10,
        (Math.random() - 0.5) * 14,
        0.45 + Math.random() * 0.3,
        16,
      );
    }

    for (const bot of this.botManager.bots) {
      const d = bot.pos.distanceTo(center);
      if (d < radius) {
        const falloff = 1 - d / radius;
        const dir = _vec3.subVectors(bot.pos, center).normalize();
        dir.y = 0.55;
        this.botManager.damageBotLimb(
          bot.id,
          'torso',
          maxDmg * falloff,
          4.8 * falloff,
          0.72 * falloff,
          0.38 * falloff,
          dir,
          true,
        );
      }
    }

    const pd = this.playerPos.distanceTo(center);
    if (pd < radius) {
      const falloff = 1 - pd / radius;
      applyLimbTrauma(
        this.phys,
        'torso',
        maxDmg * 0.58 * falloff,
        2.8 * falloff,
        0.35 * falloff,
        0,
        falloff > 0.35 ? 1 : 0,
        40 * falloff,
      );
    }

    for (const p of this.world.props) {
      if (p.isExplosive && !p.exploded && p.pos.distanceTo(center) < radius * 0.85) {
        p.hp = 0;
        p.exploded = true;
        p.mesh.visible = false;
        p.hitMesh.position.y = -50;
        setTimeout(() => {
          if (!this.disposed) this.explodeAt(p.pos.clone(), radius * 0.9, maxDmg * 0.85);
        }, 140);
      }
    }
  }

  private spawnBloodBurst(pos: THREE.Vector3, count: number) {
    const cap = Math.min(count, this.isSoftwareGl ? 5 : Math.min(10, count));
    for (let i = 0; i < cap; i++) {
      this.spawnPooledParticle(
        this.bloodPool,
        pos.x,
        pos.y,
        pos.z,
        (Math.random() - 0.5) * 5.5,
        1.2 + Math.random() * 3.8,
        (Math.random() - 0.5) * 5.5,
        0.38 + Math.random() * 0.28,
        14,
      );
    }

    const s = 1.05 + Math.random() * 0.65;
    _dummy.position.set(pos.x, 0.035, pos.z);
    _dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    _dummy.scale.set(s, s, 1);
    _dummy.updateMatrix();
    this.decalMesh.setMatrixAt(this.decalCursor, _dummy.matrix);
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.decalCursor = (this.decalCursor + 1) % 48;
  }

  private spawnSparkBurst(pos: THREE.Vector3) {
    for (let i = 0; i < 4; i++) {
      this.spawnPooledParticle(
        this.sparkPool,
        pos.x,
        pos.y,
        pos.z,
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4,
        0.2,
        10,
      );
    }
  }

  private updateDayNightCycle(dt: number) {
    // 1 game hour every ~35 real seconds (24h cycle = ~14 min)
    this.timeOfDay = (this.timeOfDay + dt * (1 / 35)) % 24;
    const sunAngle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(sunAngle); // +1 noon, -1 midnight
    const dayFactor = THREE.MathUtils.clamp((elevation + 0.2) / 0.9, 0, 1);

    // Keep shadow frustum anchored around the player across the 400x400m map
    this.sunLight.target.position.set(this.playerPos.x, 0, this.playerPos.z);
    this.sunLight.position.set(
      this.playerPos.x + Math.cos(sunAngle) * 75,
      Math.max(12, elevation * 85),
      this.playerPos.z + 32,
    );
    this.sunLight.intensity = 0.22 + dayFactor * 1.45;
    this.sunLight.color.setHSL(
      0.08 + dayFactor * 0.04,
      0.55 - dayFactor * 0.35,
      0.65 + dayFactor * 0.3,
    );

    this.hemiLight.intensity = 0.28 + dayFactor * 0.68;

    // Sky & Fog blend: Night -> Dusk -> Day
    if (elevation < 0) {
      _skyCur.copy(_skyNight).lerp(_skyDusk, THREE.MathUtils.clamp(1 + elevation * 2.5, 0, 1));
    } else if (elevation < 0.3) {
      _skyCur.copy(_skyDusk).lerp(_skyDay, elevation / 0.3);
    } else {
      _skyCur.copy(_skyDay);
    }

    (this.scene.background as THREE.Color).copy(_skyCur);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_skyCur);
      this.scene.fog.density = 0.0075 + (1 - dayFactor) * 0.008;
    }

    // Activate pooled streetlamp & nearest room fill light dynamically!
    const nightStrength = Math.max(0, 1 - dayFactor * 1.5);
    this.world.lampBulbMat.emissiveIntensity = 0.15 + nightStrength * 2.4;

    let bestLamp: THREE.Vector3 | null = null;
    let bestLampDist = Infinity;
    for (const lp of this.world.streetLampPositions) {
      const dSq =
        (lp.x - this.playerPos.x) * (lp.x - this.playerPos.x) +
        (lp.z - this.playerPos.z) * (lp.z - this.playerPos.z);
      if (dSq < bestLampDist) {
        bestLampDist = dSq;
        bestLamp = lp;
      }
    }
    if (bestLamp && nightStrength > 0.05) {
      this.pooledLampLight.position.copy(bestLamp);
      this.pooledLampLight.intensity = nightStrength * 9.5;
    } else {
      this.pooledLampLight.intensity = 0;
    }

    let bestRoom: THREE.Vector3 | null = null;
    let bestRoomDist = Infinity;
    for (const rp of this.world.interiorCenters) {
      const dSq =
        (rp.x - this.playerPos.x) * (rp.x - this.playerPos.x) +
        (rp.z - this.playerPos.z) * (rp.z - this.playerPos.z);
      if (dSq < bestRoomDist) {
        bestRoomDist = dSq;
        bestRoom = rp;
      }
    }
    if (bestRoom && bestRoomDist < 26 * 26) {
      this.pooledRoomLight.position.copy(bestRoom);
      this.pooledRoomLight.intensity = 0.9 + nightStrength * 0.85;
    } else {
      this.pooledRoomLight.intensity = 0;
    }
  }

  private loop = () => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const elapsed = this.clock.elapsedTime;

    this.updateDayNightCycle(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
    } else if (this.phase === 'title') {
      const angle = elapsed * 0.09;
      this.camera.position.set(Math.cos(angle) * 28, 8.5, Math.sin(angle) * 28);
      this.camera.lookAt(0, 1.6, 0);
      this.viewmodelMount.visible = false;
      if (this.playerRig) this.playerRig.root.visible = false;
    } else if (
      this.phase === 'playing' ||
      this.phase === 'medical' ||
      this.phase === 'loot' ||
      this.phase === 'inventory'
    ) {
      // Simulation keeps running in real time even inside Health, Inventory, and Loot menus!
      this.stepSimulation(dt, elapsed);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.loop);
    } else {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private refillWorldLootNode(node: TownWorld['lootNodes'][number]) {
    const kind = node.visualKind ?? 'stash';
    const meds: Partial<Record<MedItemId, number>> = {};
    const ammo: Partial<Record<CaliberId, number>> = {};
    const weapons: WeaponId[] = [];
    const backpacks: BackpackTierId[] = [];

    if (kind === 'med') {
      meds.bandage = 2 + (Math.random() < 0.5 ? 1 : 0);
      meds.blood_bag = 1 + (Math.random() < 0.45 ? 1 : 0);
      meds.transfusion_tube = 1 + (Math.random() < 0.5 ? 1 : 0);
      meds.antibiotics = 1 + (Math.random() < 0.5 ? 1 : 0);
      if (Math.random() < 0.65) meds.syringe_immunobooster = 1;
      if (Math.random() < 0.55) meds.syringe_procoagulant = 1;
      if (Math.random() < 0.45) meds.syringe_naloxone = 1;
      if (Math.random() < 0.45) meds.syringe_morphine = 1;
      if (Math.random() < 0.2) backpacks.push('expedition');
    } else if (kind === 'police') {
      ammo['9mm'] = 16;
      ammo['556'] = 25;
      ammo['12ga'] = 8;
      meds.bandage = 2;
      meds.tourniquet = 1;
      if (Math.random() < 0.5) meds.blood_bag = 1;
      if (Math.random() < 0.35) weapons.push(Math.random() < 0.5 ? 'shotgun_12ga' : 'rifle_556');
      if (Math.random() < 0.28) backpacks.push('tactical');
    } else {
      ammo['9mm'] = 12;
      if (Math.random() < 0.45) ammo['762'] = 10;
      meds.bandage = 2;
      if (Math.random() < 0.5) meds.transfusion_tube = 1;
      if (Math.random() < 0.45) meds.antibiotics = 1;
      if (Math.random() < 0.4) meds.blood_bag = 1;
      if (Math.random() < 0.25) backpacks.push('tactical');
    }

    node.bundle.grid = buildGridFromLoot(weapons, ammo, meds, backpacks);
    node.bundle.searched = false;
    syncLootFromGrid(node.bundle);
  }

  private stepSimulation(dt: number, elapsed: number) {
    tickPhysiology(this.phys, dt);
    if (this.phys.infectionPhase === 2 && this.prevInfectionPhase !== 2) {
      this.pushFeed(
        'Тривога! Інфекція перейшла у Фазу 2 (сепсис) — потрібні антибіотики!',
        'danger',
      );
    }
    this.prevInfectionPhase = this.phys.infectionPhase;

    if (
      !this.isKnockedOut() &&
      this.phys.consciousness !== 'dead' &&
      (this.prevConsciousness === 'unconscious' ||
        this.prevConsciousness === 'cardiacArrest')
    ) {
      this.conscWarnStage = 0;
      this.pushFeed(
        'Ви опритомніли! Зір розмитий, координація порушена...',
        'warn',
      );
    }
    this.prevConsciousness = this.phys.consciousness;

    // Pre-blackout warning alerts as consciousness fades
    if (!this.isKnockedOut() && this.phys.consciousness !== 'dead') {
      if (this.phys.consciousnessPct < 45 && this.conscWarnStage < 2) {
        this.conscWarnStage = 2;
        this.pushFeed(
          'Темніє в очах! Ви от-от втратите свідомість!',
          'danger',
        );
      } else if (this.phys.consciousnessPct < 65 && this.conscWarnStage < 1) {
        this.conscWarnStage = 1;
        this.pushFeed(
          'Голова паморочиться, зображення розпливається…',
          'warn',
        );
      } else if (this.phys.consciousnessPct > 74 && this.conscWarnStage > 0) {
        this.conscWarnStage = 0;
      }
    }

    // Believable 3D Visual & Spatial Audio Hallucinations (no spoiler text feed)
    this.stepPhantoms(dt, elapsed);

    if (this.phys.consciousness === 'dead') {
      this.phase = 'dead';
      if (document.pointerLockElement) document.exitPointerLock();
      this.pushSnapshot(true);
      return;
    }

    const preBlackoutCloud = !this.isKnockedOut()
      ? THREE.MathUtils.clamp((78 - this.phys.consciousnessPct) / 48, 0, 1)
      : 0;
    const stress =
      (1 - this.phys.bloodVolumeMl / 5000) * 1.2 +
      this.phys.pain * 0.008 +
      preBlackoutCloud * 0.85 +
      (this.phys.overdose !== 'none' ? 0.45 : 0);
    soundEngine.tickHeartbeat(this.phys.heartRateBpm, stress);

    // Periodic Respawn of Loot Containers when cleared & player is away
    for (const node of this.world.lootNodes) {
      if (!node.isPermanent) continue;
      if (node.bundle.grid.items.length === 0 && node.bundle.searched) {
        node.respawnTimer = (node.respawnTimer ?? 0) + dt;
        if (
          node.respawnTimer >= 95 &&
          this.activeLoot !== node.bundle &&
          this.playerPos.distanceTo(node.pos) >= 14
        ) {
          node.respawnTimer = 0;
          this.refillWorldLootNode(node);
        }
      } else {
        node.respawnTimer = 0;
      }
    }

    const knockedOut = this.isKnockedOut();
    if (knockedOut) {
      // Force-close any open medical/inventory/loot UI & cancel ongoing actions when unconscious
      if (
        this.phase === 'medical' ||
        this.phase === 'inventory' ||
        this.phase === 'loot'
      ) {
        this.phase = 'playing';
        this.activeLoot = null;
        this.pushFeed('Ви втратили свідомість — жодні дії неможливі!', 'danger');
        this.pushSnapshot(true);
      }
      if (this.grabbedTarget) {
        this.releaseCrusherTarget(false);
      }
      this.keys.clear();
      this.touchFireHeld = false;
      this.mouseFireHeld = false;
      this.isAiming = false;
      this.isReloading = false;
    }
    const controlsActive = this.phase === 'playing' && !knockedOut;

    const postWakeFrac = THREE.MathUtils.clamp(
      this.phys.postWakeDebuffTimer / 8.5,
      0,
      1,
    );
    const cloudFrac = !knockedOut
      ? THREE.MathUtils.clamp((78 - this.phys.consciousnessPct) / 48, 0, 1)
      : 0;
    const coordDebuffFrac = Math.max(postWakeFrac, cloudFrac);
    const brainDmgFrac = THREE.MathUtils.clamp(
      (84 - this.phys.organs.brain) / 84,
      0,
      1,
    );

    let moveX = !controlsActive
      ? 0
      : (this.keys.has('KeyD') ? 1 : 0) -
        (this.keys.has('KeyA') ? 1 : 0) +
        this.touchMove.x;
    let moveZ = !controlsActive
      ? 0
      : (this.keys.has('KeyS') ? 1 : 0) -
        (this.keys.has('KeyW') ? 1 : 0) +
        this.touchMove.y;

    // Poor coordination stagger/drift during pre-blackout clouding OR post-wake disorientation
    if (controlsActive && coordDebuffFrac > 0.16) {
      const wobbleAmp = coordDebuffFrac * 0.48;
      moveX += Math.sin(elapsed * 2.8) * wobbleAmp;
      moveZ += Math.cos(elapsed * 2.1) * wobbleAmp * 0.65;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    const sinY = Math.sin(this.playerYaw);
    const cosY = Math.cos(this.playerYaw);

    if (this.cameraMode === 'free') {
      // Free-fly camera movement!
      const flySpeed = this.keys.has('ShiftLeft') ? 26 : 12;
      _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
      const right = new THREE.Vector3(cosY, 0, -sinY);
      this.freeCamPos.addScaledVector(_dir, -moveZ * flySpeed * dt);
      this.freeCamPos.addScaledVector(right, moveX * flySpeed * dt);
      if (controlsActive && this.keys.has('Space')) this.freeCamPos.y += flySpeed * dt;
      if (controlsActive && this.keys.has('KeyC')) {
        this.freeCamPos.y = Math.max(0.5, this.freeCamPos.y - flySpeed * dt);
      }
      this.freeCamPos.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, this.freeCamPos.x));
      this.freeCamPos.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, this.freeCamPos.z));
      this.camera.position.copy(this.freeCamPos);
      this.camera.rotation.set(this.playerPitch, this.playerYaw, 0);
      this.viewmodelMount.visible = false;
      if (this.playerRig) {
        this.playerRig.root.visible = true;
        this.playerRig.root.position.copy(this.playerPos);
        this.playerRig.root.rotation.y = this.playerYaw + Math.PI;
      }
    } else {
      const leftBroken =
        this.phys.limbs.leftLeg.fractured && !this.phys.limbs.leftLeg.splinted;
      const rightBroken =
        this.phys.limbs.rightLeg.fractured && !this.phys.limbs.rightLeg.splinted;
      const limpMult =
        leftBroken || rightBroken ? (leftBroken && rightBroken ? 0.35 : 0.58) : 1.0;
      const sprintMult =
        controlsActive &&
        this.keys.has('ShiftLeft') &&
        !this.isCrouching &&
        !leftBroken &&
        !rightBroken &&
        coordDebuffFrac < 0.38
          ? 1.52
          : 1.0;
      const crouchMult = this.isCrouching ? 0.55 : 1.0;
      const weightRatio =
        this.inventory.totalWeightKg / Math.max(1, this.inventory.maxWeightKg);
      const weightMult =
        weightRatio > 1 ? 0.58 : Math.max(0.76, 1 - weightRatio * 0.18);
      const infectionSlow = this.phys.infectionPhase === 2 ? 0.78 : 1.0;
      const coordSlow = 1 - coordDebuffFrac * 0.44;
      const speed =
        6.0 *
        limpMult *
        sprintMult *
        crouchMult *
        weightMult *
        infectionSlow *
        coordSlow;

      const worldVX = (moveX * cosY + moveZ * sinY) * speed;
      const worldVZ = (-moveX * sinY + moveZ * cosY) * speed;

      this.playerPos.x += worldVX * dt;
      this.playerPos.z += worldVZ * dt;

      if (!this.isGrounded) {
        this.playerVel.y -= 17.5 * dt;
        this.playerPos.y += this.playerVel.y * dt;
        if (this.playerPos.y <= 0) {
          if (this.playerVel.y < -11.5) {
            applyLimbTrauma(this.phys, 'leftLeg', 26, 0.8, 0.55, 0);
            applyLimbTrauma(this.phys, 'rightLeg', 26, 0.8, 0.55, 0);
            soundEngine.playFleshImpact(true);
          }
          this.playerPos.y = 0;
          this.playerVel.y = 0;
          this.isGrounded = true;
        }
      }

      const pRadius = 0.44;
      for (const c of this.world.colliders) {
        if (this.playerPos.y > c.maxY || this.playerPos.y + 1.65 < c.minY) continue;
        const cx = Math.max(c.minX, Math.min(this.playerPos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(this.playerPos.z, c.maxZ));
        const dx = this.playerPos.x - cx;
        const dz = this.playerPos.z - cz;
        const dSq = dx * dx + dz * dz;
        if (dSq < pRadius * pRadius && dSq > 1e-6) {
          const d = Math.sqrt(dSq);
          const push = pRadius - d;
          this.playerPos.x += (dx / d) * push;
          this.playerPos.z += (dz / d) * push;
        }
      }
      this.playerPos.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, this.playerPos.x));
      this.playerPos.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, this.playerPos.z));

      const targetEye = knockedOut
        ? 0.34
        : this.isCrouching
          ? 1.02
          : leftBroken || rightBroken
            ? 1.38
            : 1.62;
      this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 11, dt);
      this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 12, dt);
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 10, dt);

      const odSway =
        (this.phys.overdose === 'severe' || this.phys.sickness > 50
          ? Math.sin(elapsed * 2.2) * 0.045
          : 0) +
        coordDebuffFrac * Math.sin(elapsed * 2.3) * 0.12 +
        brainDmgFrac * Math.sin(elapsed * 3.1) * 0.04;
      const headDroop = cloudFrac * (-0.06 - Math.max(0, Math.sin(elapsed * 1.4)) * 0.07);
      const swimPitch =
        coordDebuffFrac * Math.cos(elapsed * 1.85) * 0.085 +
        headDroop +
        brainDmgFrac * Math.cos(elapsed * 2.7) * 0.028;
      const swimYaw =
        coordDebuffFrac * Math.sin(elapsed * 1.4) * 0.048 +
        brainDmgFrac * Math.sin(elapsed * 1.8) * 0.022;
      const bob =
        len > 0.1 && this.isGrounded && !knockedOut
          ? Math.sin(elapsed * (leftBroken || rightBroken ? 6 : 10)) * 0.035
          : 0;

      this.playerRecoilPulse = THREE.MathUtils.damp(this.playerRecoilPulse, 0, 16, dt);
      if (this.cameraMode === 'third') {
        this.viewmodelMount.visible = false;
        if (this.playerRig) {
          this.playerRig.root.visible = true;
          this.playerRig.root.position.copy(this.playerPos);
          this.playerRig.root.rotation.set(
            knockedOut ? -Math.PI / 2 : 0,
            this.playerYaw + Math.PI,
            0,
          );
          const twoHanded =
            this.activeWeapon === 'rifle_556' ||
            this.activeWeapon === 'shotgun_12ga' ||
            this.activeWeapon === 'sniper_762';
          stepProceduralCharacterAnim(this.playerRig, this.playerAnimState, {
            dt,
            moveSpeed: len > 0.1 && !knockedOut ? speed : 0,
            crouchFactor: this.isCrouching ? 1 : 0,
            aiming: this.activeWeapon !== 'hands' && !knockedOut,
            crawling: (leftBroken && rightBroken) && !knockedOut,
            surrendering: false,
            healing: false,
            reloading: this.isReloading,
            woundedFrac: Math.min(
              1,
              Math.max(0, 1 - this.phys.bloodVolumeMl / 5000) + this.phys.pain / 120,
            ),
            legInjured: leftBroken || rightBroken,
            recoilPulse: this.playerRecoilPulse,
            flinchPitch: 0,
            flinchRoll: 0,
            twoHandedWeapon: twoHanded,
          });
        }
        // Over-the-shoulder chase camera
        const backX = sinY * 2.4 + cosY * 0.55;
        const backZ = cosY * 2.4 - sinY * 0.55;
        this.camera.position.set(
          this.playerPos.x + backX,
          this.playerPos.y + this.currentEyeHeight + 0.38,
          this.playerPos.z + backZ,
        );
        this.camera.rotation.set(
          Math.max(-1.2, Math.min(1.2, this.playerPitch + this.recoilPitch + swimPitch)),
          this.playerYaw + swimYaw,
          odSway,
        );
      } else {
        if (this.playerRig) this.playerRig.root.visible = false;
        this.viewmodelMount.visible = !knockedOut;
        this.camera.position.set(
          this.playerPos.x + (Math.random() - 0.5) * this.shakeIntensity,
          this.playerPos.y + this.currentEyeHeight + bob,
          this.playerPos.z + (Math.random() - 0.5) * this.shakeIntensity,
        );
        this.camera.rotation.set(
          Math.max(-1.45, Math.min(1.45, this.playerPitch + this.recoilPitch + swimPitch)),
          this.playerYaw + odSway * 0.4 + swimYaw,
          knockedOut ? 0.55 : odSway,
        );
      }
    }

    const baseFov = this.isAiming
      ? this.activeWeapon === 'sniper_762'
        ? 38
        : 58
      : 76;
    const tunnelSqueeze = !knockedOut
      ? THREE.MathUtils.clamp((78 - this.phys.consciousnessPct) / 48, 0, 1) * 8.5 +
        postWakeFrac * 5
      : 0;
    const targetFov = Math.max(32, baseFov - tunnelSqueeze);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    if (this.fireCooldownMs > 0) this.fireCooldownMs -= dt * 1000;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashLight.intensity = 0;
    }

    if (
      controlsActive &&
      this.activeWeapon === 'rifle_556' &&
      (this.touchFireHeld || this.mouseFireHeld) &&
      this.fireCooldownMs <= 0
    ) {
      this.fireActiveWeapon();
    }

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const def = WEAPON_DEFS[this.activeWeapon];
        const needed = def.magSize - this.inventory.magAmmo[this.activeWeapon];
        const taken = consumeAmmoFromGrid(this.inventory, def.caliber, needed);
        this.inventory.magAmmo[this.activeWeapon] += taken;
        soundEngine.playUiClick(true);
        this.pushSnapshot(true);
      }
    }

    this.swayPhase += dt * (len > 0.1 ? 8 : 2);
    this.viewKickZ = THREE.MathUtils.damp(this.viewKickZ, 0, 16, dt);
    if (this.meleeSwingTimer > 0) this.meleeSwingTimer -= dt;
    const swingAngle =
      this.meleeSwingTimer > 0 ? Math.sin((this.meleeSwingTimer / 0.24) * Math.PI) * 1.15 : 0;

    const adsX = this.isAiming ? 0.0 : 0.23;
    const adsY = this.isAiming ? -0.14 : -0.21;
    const adsZ = this.isAiming ? -0.34 : -0.44;
    this.viewmodelMount.position.set(
      adsX + Math.cos(this.swayPhase * 0.5) * 0.008,
      adsY + Math.sin(this.swayPhase) * 0.008 - (this.isReloading ? 0.15 : 0),
      adsZ + this.viewKickZ,
    );
    this.viewmodelMount.rotation.set(-swingAngle, 0, swingAngle * 0.35);

    if (this.gestureTimer > 0) {
      this.gestureTimer -= dt;
      poseGestureHand(this.gestureHandMesh, this.activeGesture ?? 'peace', elapsed);
      if (this.gestureTimer <= 0) {
        this.gestureHandMesh.visible = false;
        this.activeGesture = null;
      }
    }

    if (this.grabbedTarget) {
      _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
      const holdPos = _vec3
        .copy(this.camera.position)
        .addScaledVector(_dir, this.grabbedTarget.distance);
      holdPos.y = Math.max(0.4, holdPos.y);

      if (this.grabbedTarget.kind === 'prop') {
        const p = this.grabbedTarget.prop;
        p.pos.lerp(holdPos, Math.min(1, dt * 12));
        p.vel.set(0, 0, 0);
        p.mesh.rotation.y += dt * 1.4;
      } else {
        const b = this.grabbedTarget.bot;
        if (b.ragdoll && b.ragdoll.nodes.length >= 11) {
          this.botManager.stepGrabbedRagdoll(b, holdPos, dt);
        } else {
          b.pos.lerp(holdPos, Math.min(1, dt * 12));
          b.rig.root.position.copy(b.pos);
          b.rig.root.rotation.z = Math.sin(elapsed * 5) * 0.25;
        }
      }

      const start = this.camera.position
        .clone()
        .add(new THREE.Vector3(0.2, -0.15, -0.4).applyEuler(this.camera.rotation));
      const posAttr = this.crusherBeam.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      posAttr.setXYZ(0, start.x, start.y, start.z);
      posAttr.setXYZ(1, holdPos.x, holdPos.y, holdPos.z);
      posAttr.needsUpdate = true;
      this.crusherBeam.visible = true;
    }

    for (const p of this.world.props) {
      if (p.exploded) continue;
      if (this.grabbedTarget?.kind === 'prop' && this.grabbedTarget.prop === p) {
        p.mesh.position.copy(p.pos);
        p.hitMesh.position.set(p.pos.x, p.pos.y + p.halfHeight, p.pos.z);
        continue;
      }
      if (p.pos.y > 0 || p.vel.lengthSq() > 0.02) {
        p.vel.y -= 16 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.vel.x *= Math.max(0, 1 - dt * 2.5);
        p.vel.z *= Math.max(0, 1 - dt * 2.5);

        if (p.pos.y <= 0) {
          const impactSpeed = Math.abs(p.vel.y) + Math.hypot(p.vel.x, p.vel.z);
          p.pos.y = 0;
          p.vel.y = 0;
          if (p.isExplosive && impactSpeed > 13) {
            this.damageProp(p.id, 100, p.vel);
          }
        }

        if (p.vel.lengthSq() > 25) {
          for (const b of this.botManager.bots) {
            if (b.aiState !== 'dead' && b.pos.distanceTo(p.pos) < 1.35) {
              this.botManager.damageBotLimb(
                b.id,
                'torso',
                42,
                2.0,
                0.65,
                0,
                p.vel.clone().normalize(),
                true,
              );
              if (p.isExplosive) this.damageProp(p.id, 100, p.vel);
              p.vel.multiplyScalar(0.35);
            }
          }
        }
      }
      p.mesh.position.copy(p.pos);
      p.hitMesh.position.set(p.pos.x, p.pos.y + p.halfHeight, p.pos.z);
    }

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= 16 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.08) {
        g.pos.y = 0.08;
        g.vel.y *= -0.4;
        g.vel.x *= 0.65;
        g.vel.z *= 0.65;
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 6;
      if (g.fuse <= 0) {
        this.scene.remove(g.mesh);
        this.explodeAt(g.pos, 8.5, 130);
        this.grenades.splice(i, 1);
      }
    }

    this.stepParticlePool(this.bloodPool, dt);
    this.stepParticlePool(this.sparkPool, dt);
    this.stepParticlePool(this.expPool, dt);

    if (this.phantomFlashTimer > 0) {
      this.phantomFlashTimer -= dt;
      if (this.phantomFlashTimer <= 0) {
        this.phantomFlashLight.intensity = 0;
      }
    }

    // Throttle crosshair aimed-bot raycast to ~12 Hz instead of every frame
    this.aimRayTimer -= dt;
    if (this.aimRayTimer <= 0) {
      this.aimRayTimer = 0.085;
      this.cachedAimedBotId = null;
      if (this.activeWeapon !== 'hands' && !knockedOut) {
        _dir.set(0, 0, -1).applyEuler(this.camera.rotation);
        _raycaster.set(this.camera.position, _dir);
        _raycaster.far = 16;
        const hits = _raycaster.intersectObjects(this.botManager.getAllRaycastMeshes(), false);
        if (hits.length > 0 && hits[0].object.userData.botId) {
          this.cachedAimedBotId = hits[0].object.userData.botId;
        }
      }
    }

    const playerMovingFast = len > 0.4 && this.keys.has('ShiftLeft') && !this.isCrouching;
    if (playerMovingFast) {
      this.botManager.alertBotsToGunshot(this.playerPos, 7.5);
    }
    this.botManager.update(
      dt,
      this.playerPos,
      this.cachedAimedBotId,
      this.activeWeapon !== 'hands',
      this.isCrouching,
      playerMovingFast,
      elapsed,
      this.activeLoot?.id ?? null,
    );

    if (elapsed - this.lastSnapshotTime >= 0.115) {
      this.lastSnapshotTime = elapsed;
      this.pushSnapshot();
    }
  }

  private computeStereoPan(worldPos: THREE.Vector3): number {
    _right.set(1, 0, 0).applyEuler(this.camera.rotation).setY(0).normalize();
    _vec3.subVectors(worldPos, this.playerPos).setY(0);
    const len = _vec3.length();
    if (len < 0.01) return 0;
    _vec3.divideScalar(len);
    return Math.max(-1, Math.min(1, _right.dot(_vec3)));
  }

  private dismissPhantom(ph: PhantomEntity, burstStatic: boolean) {
    ph.active = false;
    ph.rig.root.visible = false;
    ph.speechText = null;
    if (burstStatic) {
      this.spawnSparkBurst(
        _vec3.set(ph.pos.x, ph.pos.y + 1.15, ph.pos.z),
      );
      soundEngine.playPhantomWhisper(this.computeStereoPan(ph.pos));
    }
  }

  private spawnPhantomIllusion() {
    const slot = this.phantoms.find((p) => !p.active);
    if (!slot) return;

    const roll = Math.random();
    const behavior: PhantomEntity['behavior'] =
      roll < 0.42 ? 'stalker' : roll < 0.76 ? 'runner' : 'ambush';

    // Pick a believable spot in peripheral/ahead/behind vision (10-24m away)
    const angleOffset =
      behavior === 'runner'
        ? (Math.random() < 0.5 ? 1 : -1) * (0.28 + Math.random() * 0.45)
        : (Math.random() < 0.5 ? 1 : -1) * (0.75 + Math.random() * 1.85);
    const dist = behavior === 'runner' ? 14 + Math.random() * 10 : 10 + Math.random() * 12;
    const spawnAngle = this.playerYaw + Math.PI + angleOffset;
    const rawX = this.playerPos.x + Math.sin(spawnAngle) * dist;
    const rawZ = this.playerPos.z + Math.cos(spawnAngle) * dist;
    const walkable = this.botManager.navMesh.findNearestWalkable(rawX, rawZ, 6);
    if (!walkable) return;
    if (walkable.distanceTo(this.playerPos) < 7.5) return;

    slot.active = true;
    slot.behavior = behavior;
    slot.pos.copy(walkable);
    slot.aimedTime = 0;
    slot.firedFakeShot = false;
    slot.maxLife = behavior === 'runner' ? 2.4 + Math.random() * 1.2 : 4.2 + Math.random() * 2.5;
    slot.life = slot.maxLife;
    slot.speechText = null;
    slot.speechTimer = 0;

    if (behavior === 'runner') {
      const crossYaw = this.playerYaw + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      slot.yaw = crossYaw;
      slot.vel.set(Math.sin(crossYaw) * 4.4, 0, Math.cos(crossYaw) * 4.4);
      soundEngine.playSpatialFootsteps(
        this.computeStereoPan(slot.pos),
        walkable.distanceTo(this.playerPos),
        4,
      );
    } else {
      slot.yaw = Math.atan2(
        this.playerPos.x - slot.pos.x,
        this.playerPos.z - slot.pos.z,
      );
      slot.vel.set(0, 0, 0);
      const pan = this.computeStereoPan(slot.pos);
      const d = walkable.distanceTo(this.playerPos);
      if (Math.random() < 0.5) {
        soundEngine.playSpatialReloadClick(pan, d);
      } else {
        soundEngine.playSpatialFootsteps(pan, d, 2);
      }
      if (this.phys.hallucinationLevel > 48 && Math.random() < 0.45) {
        const lines = ['Я тут…', 'Не обертайся…', 'Бачу тебе.', 'Ти один?'];
        slot.speechText = lines[Math.floor(Math.random() * lines.length)];
        slot.speechTimer = 2.6;
      }
    }

    slot.rig.root.position.copy(slot.pos);
    slot.rig.root.rotation.set(0, slot.yaw, 0);
    slot.rig.root.visible = true;
  }

  private stepPhantoms(dt: number, elapsed: number) {
    const hLevel = this.phys.hallucinationLevel;
    const activeAllowed =
      hLevel > 20 && !this.isKnockedOut() && this.phys.consciousness !== 'dead';

    if (!activeAllowed) {
      for (const ph of this.phantoms) {
        if (ph.active) this.dismissPhantom(ph, false);
      }
      return;
    }

    this.hallucinationFxTimer -= dt;
    if (this.hallucinationFxTimer <= 0) {
      this.hallucinationFxTimer = Math.max(
        3.2,
        13.5 - (hLevel / 100) * 9.0 + Math.random() * 3.5,
      );

      if (Math.random() < 0.68) {
        this.spawnPhantomIllusion();
      } else {
        // Pure spatialized audio illusion behind/beside player
        const sideAngle = this.playerYaw + Math.PI + (Math.random() < 0.5 ? 1.85 : -1.85);
        const audioPos = _vec3.set(
          this.playerPos.x + Math.sin(sideAngle) * 7.5,
          1.4,
          this.playerPos.z + Math.cos(sideAngle) * 7.5,
        );
        const pan = this.computeStereoPan(audioPos);
        const r = Math.random();
        if (r < 0.36) soundEngine.playSpatialFootsteps(pan, 6.5, 3);
        else if (r < 0.68) soundEngine.playSpatialReloadClick(pan, 7.0);
        else if (r < 0.86) soundEngine.playSpatialGunshot('pistol_9mm', pan, 22);
        else soundEngine.playPhantomWhisper(pan);
      }
    }

    _dir.set(0, 0, -1).applyEuler(this.camera.rotation).normalize();
    for (const ph of this.phantoms) {
      if (!ph.active) continue;
      ph.life -= dt;
      if (ph.speechTimer > 0) {
        ph.speechTimer -= dt;
        if (ph.speechTimer <= 0) ph.speechText = null;
      }

      const dist = ph.pos.distanceTo(this.playerPos);
      if (ph.life <= 0 || dist < 4.2) {
        this.dismissPhantom(ph, dist < 4.2);
        continue;
      }

      // Check if player looks directly at the phantom -> fades out believably after brief stare
      _vec3.subVectors(ph.pos, this.playerPos).setY(0).normalize();
      const lookDot = _dir.x * _vec3.x + _dir.z * _vec3.z;
      if (lookDot > 0.94 && dist < 24) {
        ph.aimedTime += dt;
        if (ph.aimedTime > 0.42) {
          this.dismissPhantom(ph, false);
          continue;
        }
      } else {
        ph.aimedTime = Math.max(0, ph.aimedTime - dt * 0.5);
      }

      ph.recoilPulse = THREE.MathUtils.damp(ph.recoilPulse, 0, 14, dt);
      if (ph.behavior === 'runner') {
        ph.pos.addScaledVector(ph.vel, dt);
      } else {
        ph.yaw = Math.atan2(
          this.playerPos.x - ph.pos.x,
          this.playerPos.z - ph.pos.z,
        );
        if (ph.behavior === 'ambush' && !ph.firedFakeShot && ph.life < ph.maxLife * 0.55) {
          ph.firedFakeShot = true;
          ph.recoilPulse = 1.0;
          this.phantomFlashLight.position.set(ph.pos.x, 1.4, ph.pos.z);
          this.phantomFlashLight.intensity = 6.5;
          this.phantomFlashTimer = 0.08;
          this.spawnSparkBurst(_vec3.set(ph.pos.x, 1.38, ph.pos.z));
          soundEngine.playSpatialGunshot('rifle_556', this.computeStereoPan(ph.pos), dist);
        }
      }

      ph.rig.root.position.copy(ph.pos);
      ph.rig.root.rotation.set(0, ph.yaw, 0);
      stepProceduralCharacterAnim(ph.rig, ph.animState, {
        dt,
        moveSpeed: ph.behavior === 'runner' ? ph.vel.length() : 0,
        crouchFactor: ph.behavior === 'ambush' ? 0.35 : 0,
        aiming: ph.behavior !== 'runner',
        crawling: false,
        surrendering: false,
        healing: false,
        reloading: false,
        woundedFrac: 0,
        legInjured: false,
        recoilPulse: ph.recoilPulse,
        flinchPitch: 0,
        flinchRoll: 0,
        twoHandedWeapon: ph.behavior === 'stalker' || ph.behavior === 'ambush',
      });
    }
  }

  private findNearbyInteractable(): NearbyPrompt | null {
    let bestDist = 3.2;
    let bestPrompt: NearbyPrompt | null = null;

    for (const node of this.world.lootNodes) {
      const hasLoot =
        node.bundle.grid.items.length > 0 ||
        node.bundle.weapons.length > 0 ||
        Object.values(node.bundle.ammo).some((v) => (v ?? 0) > 0) ||
        Object.values(node.bundle.meds).some((v) => (v ?? 0) > 0);
      if (!hasLoot && node.bundle.searched) continue;
      const d = this.playerPos.distanceTo(node.pos);
      if (d < bestDist) {
        bestDist = d;
        bestPrompt = {
          type: 'loot',
          targetId: node.id,
          labelUk: node.bundle.labelUk,
          labelEn: node.bundle.labelEn,
        };
      }
    }

    for (const bot of this.botManager.bots) {
      const d = this.playerPos.distanceTo(bot.pos);
      if (d < bestDist) {
        if (
          bot.aiState === 'dead' ||
          bot.aiState === 'unconscious' ||
          bot.aiState === 'surrender'
        ) {
          const hasLoot =
            bot.loot.grid.items.length > 0 ||
            bot.loot.weapons.length > 0 ||
            Object.values(bot.loot.ammo).some((v) => (v ?? 0) > 0) ||
            Object.values(bot.loot.meds).some((v) => (v ?? 0) > 0);
          if (hasLoot || !bot.loot.searched) {
            bestDist = d;
            bestPrompt = {
              type: 'loot',
              targetId: bot.loot.id,
              labelUk: bot.loot.labelUk,
              labelEn: bot.loot.labelEn,
            };
          }
        } else {
          bestDist = d;
          bestPrompt = {
            type: 'bot',
            targetId: bot.id,
            labelUk: bot.nameUk,
            labelEn: bot.nameEn,
            aiState: bot.aiState,
          };
        }
      }
    }

    return bestPrompt;
  }

  private buildOverheadSpeechBubbles(): OverheadSpeechBubble[] {
    if (this.phase !== 'playing' || this.isKnockedOut()) return [];
    const bubbles: OverheadSpeechBubble[] = [];

    const tryProject = (
      id: string,
      pos: THREE.Vector3,
      headY: number,
      text: string,
      tone: OverheadSpeechBubble['tone'],
    ) => {
      const dist = pos.distanceTo(this.playerPos);
      if (dist > 34) return;
      _proj.set(pos.x, pos.y + headY, pos.z).project(this.camera);
      if (_proj.z >= 1 || Math.abs(_proj.x) > 1.02 || Math.abs(_proj.y) > 1.02) return;
      if (!this.botManager.hasLineOfSight(this.playerPos, pos, 1.55, 1.55)) return;
      bubbles.push({
        id,
        text,
        tone,
        xPct: (_proj.x * 0.5 + 0.5) * 100,
        yPct: (-_proj.y * 0.5 + 0.5) * 100,
        dist,
      });
    };

    for (const bot of this.botManager.bots) {
      if (bot.speechText && bot.speechTimer > 0 && bot.aiState !== 'dead') {
        const headY = bot.crouchFactor > 0.5 ? 1.52 : 2.02;
        tryProject(bot.id, bot.pos, headY, bot.speechText, bot.speechTone);
      }
    }

    for (const ph of this.phantoms) {
      if (ph.active && ph.speechText && ph.speechTimer > 0) {
        tryProject(ph.id, ph.pos, 2.02, ph.speechText, 'warn');
      }
    }

    if (bubbles.length > 5) {
      bubbles.sort((a, b) => a.dist - b.dist);
      bubbles.length = 5;
    }
    return bubbles;
  }

  private clonePhysSnapshot(): PhysiologyState {
    return {
      ...this.phys,
      limbs: {
        head: { ...this.phys.limbs.head },
        torso: { ...this.phys.limbs.torso },
        leftArm: { ...this.phys.limbs.leftArm },
        rightArm: { ...this.phys.limbs.rightArm },
        leftLeg: { ...this.phys.limbs.leftLeg },
        rightLeg: { ...this.phys.limbs.rightLeg },
      },
      organs: { ...this.phys.organs },
    };
  }

  private cloneInventorySnapshot(): InventoryState {
    return {
      ...this.inventory,
      ownedWeapons: [...this.inventory.ownedWeapons],
      magAmmo: { ...this.inventory.magAmmo },
      reserveAmmo: { ...this.inventory.reserveAmmo },
      meds: { ...this.inventory.meds },
      backpack: {
        ...this.inventory.backpack,
        items: this.inventory.backpack.items.map((it) => ({ ...it })),
      },
    };
  }

  private pushSnapshot(force = false) {
    if (force) this.lastSnapshotTime = this.clock.elapsedTime;
    this.onSnapshot({
      phase: this.phase,
      physiology: this.clonePhysSnapshot(),
      inventory: this.cloneInventorySnapshot(),
      activeWeapon: this.activeWeapon,
      cameraMode: this.cameraMode,
      flashlightOn: this.flashlightOn,
      timeOfDay: this.timeOfDay,
      isReloading: this.isReloading,
      isAiming: this.isAiming,
      isCrouching: this.isCrouching,
      crusherHolding: Boolean(this.grabbedTarget),
      pointerLocked: this.pointerLocked,
      nearbyPrompt: this.findNearbyInteractable(),
      activeLoot: this.activeLoot
        ? {
            ...this.activeLoot,
            weapons: [...this.activeLoot.weapons],
            ammo: { ...this.activeLoot.ammo },
            meds: { ...this.activeLoot.meds },
            grid: {
              ...this.activeLoot.grid,
              items: this.activeLoot.grid.items.map((it) => ({ ...it })),
            },
          }
        : null,
      activeGesture: this.activeGesture,
      speechBubbles: this.buildOverheadSpeechBubbles(),
      feed: this.feed,
      playerPos: { x: this.playerPos.x, z: this.playerPos.z, yaw: this.playerYaw },
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
