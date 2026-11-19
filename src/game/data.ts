import {
  BackpackTierId,
  ControlMode,
  GestureDef,
  HudLayoutConfig,
  LimbId,
  MedItemDef,
  MedItemId,
  WeaponDef,
  WeaponId,
} from './types';

export const BACKPACK_TIERS: Record<
  BackpackTierId,
  {
    id: BackpackTierId;
    nameUk: string;
    nameEn: string;
    cols: number;
    rows: number;
    maxWeightKg: number;
    weightKg: number;
    accentColor: string;
  }
> = {
  starter: {
    id: 'starter',
    nameUk: 'Стандартний рюкзак (6×5)',
    nameEn: 'Standard Pack (6x5)',
    cols: 6,
    rows: 5,
    maxWeightKg: 28,
    weightKg: 0.6,
    accentColor: '#64748b',
  },
  tactical: {
    id: 'tactical',
    nameUk: 'Штурмовий рюкзак (7×6)',
    nameEn: 'Tactical Pack (7x6)',
    cols: 7,
    rows: 6,
    maxWeightKg: 40,
    weightKg: 1.0,
    accentColor: '#0ea5e9',
  },
  expedition: {
    id: 'expedition',
    nameUk: 'Експедиційний рюкзак (8×7)',
    nameEn: 'Expedition Pack (8x7)',
    cols: 8,
    rows: 7,
    maxWeightKg: 56,
    weightKg: 1.4,
    accentColor: '#10b981',
  },
};

export const LIMB_META: Record<
  LimbId,
  { nameUk: string; nameEn: string; bloodWeight: number }
> = {
  head: { nameUk: 'Голова', nameEn: 'Head', bloodWeight: 1.5 },
  torso: { nameUk: 'Тулуб', nameEn: 'Torso', bloodWeight: 1.8 },
  leftArm: { nameUk: 'Ліва рука', nameEn: 'L. Arm', bloodWeight: 0.9 },
  rightArm: { nameUk: 'Права рука', nameEn: 'R. Arm', bloodWeight: 0.9 },
  leftLeg: { nameUk: 'Ліва нога', nameEn: 'L. Leg', bloodWeight: 1.1 },
  rightLeg: { nameUk: 'Права нога', nameEn: 'R. Leg', bloodWeight: 1.1 },
};

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  hands: {
    id: 'hands',
    nameUk: 'Порожні руки',
    nameEn: 'Holstered / Fists',
    kind: 'unarmed',
    caliber: 'none',
    magSize: 0,
    damage: 14,
    bleedPower: 0.1,
    severChance: 0,
    fractureChance: 0.08,
    penetration: 0,
    fireRateMs: 420,
    pellets: 1,
    spread: 0.01,
    recoil: 0.01,
    range: 2.3,
    reloadTimeSec: 0,
  },
  reality_crusher: {
    id: 'reality_crusher',
    nameUk: 'Руйнівник Реальності',
    nameEn: 'Reality Crusher',
    kind: 'physgun',
    caliber: 'none',
    magSize: 0,
    damage: 0,
    bleedPower: 0,
    severChance: 0,
    fractureChance: 0,
    penetration: 0,
    fireRateMs: 120,
    pellets: 1,
    spread: 0,
    recoil: 0.005,
    range: 26,
    reloadTimeSec: 0,
  },
  crowbar: {
    id: 'crowbar',
    nameUk: 'Монтування',
    nameEn: 'Crowbar',
    kind: 'melee',
    caliber: 'none',
    magSize: 0,
    damage: 34,
    bleedPower: 0.6,
    severChance: 0.04,
    fractureChance: 0.45,
    penetration: 0,
    fireRateMs: 520,
    pellets: 1,
    spread: 0.02,
    recoil: 0.025,
    range: 2.7,
    reloadTimeSec: 0,
  },
  katana: {
    id: 'katana',
    nameUk: 'Катана',
    nameEn: 'Katana',
    kind: 'melee',
    caliber: 'none',
    magSize: 0,
    damage: 58,
    bleedPower: 3.4,
    severChance: 0.62,
    fractureChance: 0.15,
    penetration: 0,
    fireRateMs: 460,
    pellets: 1,
    spread: 0.01,
    recoil: 0.02,
    range: 3.1,
    reloadTimeSec: 0,
  },
  fire_axe: {
    id: 'fire_axe',
    nameUk: 'Пожежна сокира',
    nameEn: 'Fire Axe',
    kind: 'melee',
    caliber: 'none',
    magSize: 0,
    damage: 66,
    bleedPower: 2.8,
    severChance: 0.48,
    fractureChance: 0.52,
    penetration: 0,
    fireRateMs: 680,
    pellets: 1,
    spread: 0.015,
    recoil: 0.04,
    range: 2.9,
    reloadTimeSec: 0,
  },
  pistol_9mm: {
    id: 'pistol_9mm',
    nameUk: 'Пістолет 9мм',
    nameEn: 'PM-9 Pistol',
    kind: 'firearm',
    caliber: '9mm',
    magSize: 12,
    damage: 28,
    bleedPower: 1.9,
    severChance: 0.02,
    fractureChance: 0.14,
    penetration: 0.22,
    fireRateMs: 210,
    pellets: 1,
    spread: 0.014,
    recoil: 0.024,
    range: 85,
    reloadTimeSec: 1.4,
  },
  shotgun_12ga: {
    id: 'shotgun_12ga',
    nameUk: 'Дробовик 12 кал.',
    nameEn: 'M870 Shotgun',
    kind: 'firearm',
    caliber: '12ga',
    magSize: 6,
    damage: 19,
    bleedPower: 1.15,
    severChance: 0.14,
    fractureChance: 0.25,
    penetration: 0.18,
    fireRateMs: 760,
    pellets: 8,
    spread: 0.068,
    recoil: 0.068,
    range: 45,
    reloadTimeSec: 2.1,
  },
  rifle_556: {
    id: 'rifle_556',
    nameUk: 'Штурмовий карабін',
    nameEn: 'AK-556 Carbine',
    kind: 'firearm',
    caliber: '556',
    magSize: 30,
    damage: 34,
    bleedPower: 2.4,
    severChance: 0.08,
    fractureChance: 0.22,
    penetration: 0.48,
    fireRateMs: 110,
    pellets: 1,
    spread: 0.022,
    recoil: 0.028,
    range: 120,
    reloadTimeSec: 1.85,
  },
  sniper_762: {
    id: 'sniper_762',
    nameUk: 'Снайперська 7.62',
    nameEn: 'SVD-762 Marksman',
    kind: 'firearm',
    caliber: '762',
    magSize: 10,
    damage: 86,
    bleedPower: 5.5,
    severChance: 0.42,
    fractureChance: 0.72,
    penetration: 0.92,
    fireRateMs: 880,
    pellets: 1,
    spread: 0.004,
    recoil: 0.075,
    range: 180,
    reloadTimeSec: 2.3,
  },
  frag_grenade: {
    id: 'frag_grenade',
    nameUk: 'Осколкова граната',
    nameEn: 'RGD-5 Frag',
    kind: 'throwable',
    caliber: 'frag',
    magSize: 1,
    damage: 110,
    bleedPower: 6.5,
    severChance: 0.55,
    fractureChance: 0.85,
    penetration: 0,
    fireRateMs: 900,
    pellets: 1,
    spread: 0,
    recoil: 0.03,
    range: 28,
    reloadTimeSec: 0,
  },
};

export const MED_ITEM_DEFS: Record<MedItemId, MedItemDef> = {
  bandage: {
    id: 'bandage',
    nameUk: 'Стерильний бинт',
    nameEn: 'Gauze Bandage',
    descUk: 'Водіть пальцем/курсором по кінцівці, щоб перев’язати рану і зупинити зовнішню кровотечу.',
    category: 'dressing',
    fluidMl: 0,
    accentColor: '#e2e8f0',
  },
  tourniquet: {
    id: 'tourniquet',
    nameUk: 'Турнікет CAT',
    nameEn: 'Tourniquet',
    descUk: 'Миттєво перетискає артерію кінцівки. Тримайте не довше 90с, інакше почнеться ішемія.',
    category: 'dressing',
    fluidMl: 0,
    accentColor: '#f59e0b',
  },
  splint: {
    id: 'splint',
    nameUk: 'Шина фіксуюча',
    nameEn: 'Trauma Splint',
    descUk: 'Фіксує перелом кістки та повертає рухливість або точність стрільби.',
    category: 'tool',
    fluidMl: 0,
    accentColor: '#38bdf8',
  },
  tweezers: {
    id: 'tweezers',
    nameUk: 'Хірургічний пінцет',
    nameEn: 'Surgical Tweezers',
    descUk: 'Витягує уламки скла, шрапнель і зламані голки з тканин.',
    category: 'tool',
    fluidMl: 0,
    accentColor: '#94a3b8',
  },
  syringe_morphine: {
    id: 'syringe_morphine',
    nameUk: 'Шприц: Морфін 10мг',
    nameEn: 'Morphine Syringe',
    descUk: 'Знімає сильний біль і тремор. Надлишок пригнічує дихання та викликає смертельне передозування!',
    category: 'syringe',
    fluidMl: 12,
    accentColor: '#a855f7',
  },
  syringe_adrenaline: {
    id: 'syringe_adrenaline',
    nameUk: 'Шприц: Адреналін',
    nameEn: 'Epinephrine Syringe',
    descUk: 'Підіймає пульс та тиск при шоку. Передозування веде до тахікардії і зупинки серця.',
    category: 'syringe',
    fluidMl: 10,
    accentColor: '#ef4444',
  },
  syringe_procoagulant: {
    id: 'syringe_procoagulant',
    nameUk: 'Шприц: Коагулянт',
    nameEn: 'Procoagulant',
    descUk: 'Згущує кров і зупиняє внутрішню кровотечу. Зайва доза підвищує токсичність.',
    category: 'syringe',
    fluidMl: 18,
    accentColor: '#f97316',
  },
  syringe_saline: {
    id: 'syringe_saline',
    nameUk: 'Фізрозчин 250мл',
    nameEn: 'Saline IV Infusion',
    descUk: 'Тимчасово підтримує тиск і зменшує шок, але НЕ відновлює кров (для крові потрібен мішок крові!). Надлишок розріджує кров.',
    category: 'syringe',
    fluidMl: 250,
    accentColor: '#06b6d4',
  },
  syringe_naloxone: {
    id: 'syringe_naloxone',
    nameUk: 'Шприц: Налоксон',
    nameEn: 'Naloxone Antidote',
    descUk: 'Екстрений антидот, що блокує передозування опіоїдами (морфіном) та відновлює дихання.',
    category: 'syringe',
    fluidMl: 10,
    accentColor: '#10b981',
  },
  syringe_immunobooster: {
    id: 'syringe_immunobooster',
    nameUk: 'Шприц: Імуностимулятор',
    nameEn: 'Immuno-Booster',
    descUk: 'Підсилює та відновлює імунітет, допомагаючи організму побороти приховану та активну інфекцію.',
    category: 'syringe',
    fluidMl: 10,
    accentColor: '#22c55e',
  },
  blood_bag: {
    id: 'blood_bag',
    nameUk: 'Мішок з кров’ю (450мл)',
    nameEn: 'Blood Bag O-',
    descUk: 'Єдиний спосіб відновити втрачену кров (+450 мл). Потребує стерильної трубки (безпечно) або використаного шприца (ризик зараження!).',
    category: 'transfusion',
    fluidMl: 450,
    accentColor: '#dc2626',
  },
  transfusion_tube: {
    id: 'transfusion_tube',
    nameUk: 'Трубка для переливання',
    nameEn: 'Transfusion Tubing',
    descUk: 'Стерильна інфузійна система. Потрібна для безпечного переливання мішка з кров’ю без ризику інфекції.',
    category: 'transfusion',
    fluidMl: 0,
    accentColor: '#38bdf8',
  },
  used_syringe: {
    id: 'used_syringe',
    nameUk: 'Використаний шприц',
    nameEn: 'Used Dirty Syringe',
    descUk: 'Порожній використаний шприц. Можна застосувати для екстреного переливання крові замість трубки, але є великий шанс зараження!',
    category: 'tool',
    fluidMl: 0,
    accentColor: '#a16207',
  },
  antibiotics: {
    id: 'antibiotics',
    nameUk: 'Антибіотики',
    nameEn: 'Antibiotics Pack',
    descUk: 'Потужні пігулки, що пригнічують бактеріальне зараження крові (Фаза 1 та 2) та підтримують імунітет.',
    category: 'pill',
    fluidMl: 0,
    accentColor: '#60a5fa',
  },
};

export const GESTURE_DEFS: GestureDef[] = [
  {
    id: 'peace',
    nameUk: 'Мирний жест',
    nameEn: 'Wave / Peace',
    hintUk: 'Ховає зброю й заспокоює насторожених ботів',
  },
  {
    id: 'follow',
    nameUk: 'За мною',
    nameEn: 'Follow Me',
    hintUk: 'Кличе дружніх ботів супроводжувати вас',
  },
  {
    id: 'hold',
    nameUk: 'Стій тут',
    nameEn: 'Hold Position',
    hintUk: 'Наказує союзникам тримати позицію',
  },
  {
    id: 'intimidate',
    nameUk: 'Кинь зброю!',
    nameEn: 'Surrender!',
    hintUk: 'Примушує поранених або слабших ботів здатися',
  },
  {
    id: 'request_med',
    nameUk: 'Дай аптечку',
    nameEn: 'Request Meds',
    hintUk: 'Просить у дружніх медиків поділитись бинтом',
  },
  {
    id: 'taunt',
    nameUk: 'Провокація',
    nameEn: 'Taunt',
    hintUk: 'Виманює ворогів із укриття, злить насторожених',
  },
];

export const DEFAULT_HUD_LAYOUT: HudLayoutConfig = {
  controlMode: 'auto',
  sensitivity: 1.0,
  muted: false,
  widgets: {
    vitals: { xPct: 2, yPct: 3, scale: 1, opacity: 0.94, visible: true },
    weapon: { xPct: 98, yPct: 96, scale: 1, opacity: 0.94, visible: true },
    joystick: { xPct: 12, yPct: 76, scale: 1, opacity: 0.85, visible: true },
    btn_fire: { xPct: 86, yPct: 74, scale: 1.05, opacity: 0.9, visible: true },
    btn_ads: { xPct: 74, yPct: 79, scale: 0.95, opacity: 0.88, visible: true },
    btn_reload: { xPct: 91, yPct: 58, scale: 0.9, opacity: 0.88, visible: true },
    btn_jump: { xPct: 88, yPct: 43, scale: 0.9, opacity: 0.85, visible: true },
    btn_crouch: { xPct: 76, yPct: 90, scale: 0.9, opacity: 0.85, visible: true },
    btn_interact: { xPct: 50, yPct: 68, scale: 1, opacity: 0.95, visible: true },
    btn_med: { xPct: 16, yPct: 30, scale: 0.95, opacity: 0.92, visible: true },
    btn_inventory: { xPct: 16, yPct: 40, scale: 0.95, opacity: 0.92, visible: true },
    btn_gesture: { xPct: 6, yPct: 50, scale: 0.95, opacity: 0.9, visible: true },
    btn_crusher_push: { xPct: 72, yPct: 64, scale: 0.95, opacity: 0.9, visible: true },
  },
};

export const HUD_STORAGE_KEY = 'trauma_sandbox_hud_v2';

export function loadHudLayout(): HudLayoutConfig {
  try {
    const raw =
      localStorage.getItem(HUD_STORAGE_KEY) ??
      localStorage.getItem('trauma_sandbox_hud_v1');
    if (!raw) return structuredClone(DEFAULT_HUD_LAYOUT);
    const parsed = JSON.parse(raw) as Partial<HudLayoutConfig>;
    return {
      controlMode: parsed.controlMode ?? DEFAULT_HUD_LAYOUT.controlMode,
      sensitivity: parsed.sensitivity ?? DEFAULT_HUD_LAYOUT.sensitivity,
      muted: parsed.muted ?? DEFAULT_HUD_LAYOUT.muted,
      widgets: {
        ...structuredClone(DEFAULT_HUD_LAYOUT.widgets),
        ...(parsed.widgets ?? {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_HUD_LAYOUT);
  }
}

export function saveHudLayout(config: HudLayoutConfig): void {
  try {
    localStorage.setItem(HUD_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
}

export function detectTouchMode(controlMode: ControlMode): boolean {
  if (controlMode === 'touch') return true;
  if (controlMode === 'pc') return false;
  const hasCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const hasFine = window.matchMedia?.('(pointer: fine)').matches ?? false;
  if (hasFine && !hasCoarse) return false;
  return hasCoarse;
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

export function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return (
    doc.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  );
}

export async function toggleFullscreenCompat(): Promise<{
  active: boolean;
  blocked: boolean;
}> {
  const doc = document as FullscreenDocument;
  const current = getFullscreenElement();
  if (current) {
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      else if (doc.mozCancelFullScreen) await doc.mozCancelFullScreen();
      else if (doc.msExitFullscreen) await doc.msExitFullscreen();
    } catch {
      // ignore exit errors
    }
    return { active: Boolean(getFullscreenElement()), blocked: false };
  }

  const targets = [
    document.documentElement as FullscreenElement | null,
    document.body as FullscreenElement | null,
    document.getElementById('root') as FullscreenElement | null,
  ].filter((el): el is FullscreenElement => Boolean(el));

  for (const el of targets) {
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        await el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen();
      } else {
        continue;
      }
      if (getFullscreenElement()) {
        return { active: true, blocked: false };
      }
    } catch {
      // try next element or report blocked
    }
  }

  const nowActive = Boolean(getFullscreenElement());
  return { active: nowActive, blocked: !nowActive };
}
