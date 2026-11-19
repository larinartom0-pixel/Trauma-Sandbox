export type LimbId =
  | 'head'
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg';

export interface LimbState {
  id: LimbId;
  skin: number; // 0..100
  muscle: number; // 0..100
  bleedRate: number; // external mL/s
  fractured: boolean;
  splinted: boolean;
  tourniquet: boolean;
  tourniquetTime: number;
  bandageCoverage: number; // 0..100
  shrapnel: number;
  burn: number; // 0..100
  severed: boolean;
  infected: number; // 0..100 local wound contamination
}

export type ConsciousnessState =
  | 'awake'
  | 'tunnelVision'
  | 'critical'
  | 'unconscious'
  | 'cardiacArrest'
  | 'dead';

export type OverdoseSeverity = 'none' | 'mild' | 'severe' | 'lethal';

export type VitalOrganId = 'brain' | 'heart' | 'lungs' | 'liver' | 'kidneys';

export type VitalOrgansState = Record<VitalOrganId, number>;

export interface PhysiologyState {
  bloodVolumeMl: number; // max 5000
  maxBloodMl: number;
  internalBleedRate: number; // mL/s (stopped ONLY by Procoagulant)
  oxygenPct: number; // 0..100
  lungCapacityPct: number; // 0..100 (pneumothorax / edema lowers cap)
  respRate: number; // breaths/min (0..35)
  heartRateBpm: number; // 0..220
  systolicBp: number; // mmHg
  consciousnessPct: number; // 0..100 (<30 => unconscious blackout)
  organHealth: number; // 0..100 weighted composite of all vital organs
  organs: VitalOrgansState; // individual organ integrity (0..100)
  hallucinationLevel: number; // 0..100 visual distortion & hallucinations from brain trauma/hypoxia
  shockLevel: number; // 0..100 (traumatic + hypovolemic shock)
  sepsis: number; // 0..100 (untreated wounds & shrapnel)
  temperatureC: number; // 32.0..41.5 C
  pain: number; // 0..100
  toxicity: number; // 0..100
  sickness: number; // 0..100
  opioidLevel: number; // 0..2.5+
  stimulantLevel: number; // 0..2.5+
  coagulantLevel: number; // 0..2.0
  fluidDilution: number; // 1.0 baseline; >1.35 causes thin blood + pulmonary edema
  immunityPct: number; // 0..100 immune strength fighting infection
  infectionLevel: number; // 0..100 internal bacterial load
  infectionPhase: 0 | 1 | 2; // 0=clean, 1=hidden phase 1, 2=visible severe phase 2
  immunityBoostTimer: number; // active immunobooster seconds remaining
  antibioticLevel: number; // 0..2.0 active antibiotics
  untreatedBleedTimer: number; // seconds of prolonged untreated bleeding
  cardiacArrestTimer: number; // seconds in arrest before irreversible brain death
  unconsciousTimerSec: number; // seconds spent knocked out in current episode
  unconsciousMaxSec: number; // estimated total seconds until waking up
  unconsciousDanger: boolean; // true = risk of not waking up (sawtooth line turns RED)
  postWakeDebuffTimer: number; // temporary severe blur/tunnel-vision/coordination debuff after waking
  consciousness: ConsciousnessState;
  overdose: OverdoseSeverity;
  overdoseReason: string | null;
  causeOfDeath: string | null;
  limbs: Record<LimbId, LimbState>;
}

export type CaliberId = 'none' | '9mm' | '12ga' | '556' | '762' | 'frag';

export type WeaponId =
  | 'hands'
  | 'reality_crusher'
  | 'crowbar'
  | 'katana'
  | 'fire_axe'
  | 'pistol_9mm'
  | 'shotgun_12ga'
  | 'rifle_556'
  | 'sniper_762'
  | 'frag_grenade';

export interface WeaponDef {
  id: WeaponId;
  nameUk: string;
  nameEn: string;
  kind: 'unarmed' | 'physgun' | 'melee' | 'firearm' | 'throwable';
  caliber: CaliberId;
  magSize: number;
  damage: number;
  bleedPower: number;
  severChance: number;
  fractureChance: number;
  penetration: number;
  fireRateMs: number;
  pellets: number;
  spread: number;
  recoil: number;
  range: number;
  reloadTimeSec: number;
}

export type MedItemId =
  | 'bandage'
  | 'tourniquet'
  | 'splint'
  | 'tweezers'
  | 'syringe_morphine'
  | 'syringe_adrenaline'
  | 'syringe_procoagulant'
  | 'syringe_saline'
  | 'syringe_naloxone'
  | 'syringe_immunobooster'
  | 'blood_bag'
  | 'transfusion_tube'
  | 'used_syringe'
  | 'antibiotics';

export type BackpackTierId = 'starter' | 'tactical' | 'expedition';

export interface MedItemDef {
  id: MedItemId;
  nameUk: string;
  nameEn: string;
  descUk: string;
  category: 'dressing' | 'tool' | 'syringe' | 'transfusion' | 'pill';
  fluidMl: number;
  accentColor: string;
}

export type GridItemCategory = 'weapon' | 'ammo' | 'med' | 'backpack';

export interface GridInventoryItem {
  uid: string;
  category: GridItemCategory;
  weaponId?: WeaponId;
  caliber?: CaliberId;
  medId?: MedItemId;
  backpackTier?: BackpackTierId;
  nameUk: string;
  nameEn: string;
  x: number; // grid column
  y: number; // grid row
  w: number; // width in cells
  h: number; // height in cells
  weightKg: number; // per stack/unit
  quantity: number; // rounds or count
  conditionPct: number; // 1..100 (e.g., partial dressing %)
  accentColor: string;
}

export interface GridContainer {
  cols: number;
  rows: number;
  items: GridInventoryItem[];
}

export interface InventoryState {
  ownedWeapons: WeaponId[];
  magAmmo: Record<WeaponId, number>;
  reserveAmmo: Record<CaliberId, number>;
  meds: Record<MedItemId, number>;
  backpackTier: BackpackTierId;
  backpack: GridContainer;
  totalWeightKg: number;
  maxWeightKg: number;
}

export type BotDisposition = 'hostile' | 'cautious' | 'friendly';

export type BotArchetype =
  | 'raider'
  | 'infected'
  | 'survivor'
  | 'medic'
  | 'enforcer';

export type BotAIState =
  | 'patrol'
  | 'warn'
  | 'alert'
  | 'search'
  | 'engage'
  | 'takeCover'
  | 'flank'
  | 'heal'
  | 'reload'
  | 'follow'
  | 'hold'
  | 'crawl'
  | 'flee'
  | 'surrender'
  | 'unconscious'
  | 'dead';

export type GestureId =
  | 'peace'
  | 'follow'
  | 'hold'
  | 'intimidate'
  | 'request_med'
  | 'taunt';

export interface GestureDef {
  id: GestureId;
  nameUk: string;
  nameEn: string;
  hintUk: string;
}

export interface LootBundle {
  id: string;
  labelUk: string;
  labelEn: string;
  kind: 'container' | 'corpse';
  weapons: WeaponId[];
  ammo: Partial<Record<CaliberId, number>>;
  meds: Partial<Record<MedItemId, number>>;
  backpacks?: BackpackTierId[];
  grid: GridContainer;
  searched: boolean;
}

export type HudWidgetId =
  | 'vitals'
  | 'weapon'
  | 'joystick'
  | 'btn_fire'
  | 'btn_ads'
  | 'btn_reload'
  | 'btn_jump'
  | 'btn_crouch'
  | 'btn_interact'
  | 'btn_med'
  | 'btn_inventory'
  | 'btn_gesture'
  | 'btn_crusher_push';

export interface HudWidgetLayout {
  xPct: number;
  yPct: number;
  scale: number;
  opacity: number;
  visible: boolean;
}

export type ControlMode = 'auto' | 'pc' | 'touch';
export type CameraMode = 'first' | 'third' | 'free';

export interface HudLayoutConfig {
  controlMode: ControlMode;
  sensitivity: number;
  muted: boolean;
  widgets: Record<HudWidgetId, HudWidgetLayout>;
}

export type GamePhase =
  | 'title'
  | 'playing'
  | 'medical'
  | 'inventory'
  | 'loot'
  | 'paused'
  | 'dead';

export interface FeedMessage {
  id: number;
  text: string;
  tone: 'neutral' | 'warn' | 'danger' | 'friendly';
  timestamp: number;
}

export interface NearbyPrompt {
  type: 'loot' | 'bot';
  targetId: string;
  labelUk: string;
  labelEn: string;
  aiState?: BotAIState;
}

export interface GameSnapshot {
  phase: GamePhase;
  physiology: PhysiologyState;
  inventory: InventoryState;
  activeWeapon: WeaponId;
  cameraMode: CameraMode;
  flashlightOn: boolean;
  timeOfDay: number; // 0..24 hours
  isReloading: boolean;
  isAiming: boolean;
  isCrouching: boolean;
  crusherHolding: boolean;
  pointerLocked: boolean;
  nearbyPrompt: NearbyPrompt | null;
  activeLoot: LootBundle | null;
  activeGesture: GestureId | null;
  feed: FeedMessage[];
  playerPos: { x: number; z: number; yaw: number };
}
