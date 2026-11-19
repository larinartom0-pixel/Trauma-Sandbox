import { BACKPACK_TIERS, MED_ITEM_DEFS, WEAPON_DEFS } from './data';
import {
  BackpackTierId,
  CaliberId,
  GridContainer,
  GridInventoryItem,
  InventoryState,
  LootBundle,
  MedItemId,
  WeaponId,
} from './types';

let itemUidSeq = 1;
const nextUid = () => `itm_${itemUidSeq++}_${Math.random().toString(36).slice(2, 6)}`;

export const WEAPON_GRID_SPEC: Record<
  WeaponId,
  { w: number; h: number; weightKg: number; accent: string }
> = {
  hands: { w: 1, h: 1, weightKg: 0, accent: '#64748b' },
  reality_crusher: { w: 2, h: 1, weightKg: 2.8, accent: '#0ea5e9' },
  crowbar: { w: 2, h: 1, weightKg: 1.9, accent: '#dc2626' },
  katana: { w: 3, h: 1, weightKg: 1.3, accent: '#e2e8f0' },
  fire_axe: { w: 2, h: 1, weightKg: 2.5, accent: '#b91c1c' },
  pistol_9mm: { w: 2, h: 1, weightKg: 0.95, accent: '#f59e0b' },
  shotgun_12ga: { w: 3, h: 1, weightKg: 3.6, accent: '#d97706' },
  rifle_556: { w: 3, h: 2, weightKg: 3.4, accent: '#fbbf24' },
  sniper_762: { w: 4, h: 1, weightKg: 4.4, accent: '#f97316' },
  frag_grenade: { w: 1, h: 1, weightKg: 0.45, accent: '#4d7c0f' },
};

export const AMMO_GRID_SPEC: Record<
  CaliberId,
  { w: number; h: number; weightPerUnitKg: number; nameUk: string; nameEn: string; accent: string }
> = {
  none: { w: 1, h: 1, weightPerUnitKg: 0, nameUk: '', nameEn: '', accent: '#64748b' },
  '9mm': { w: 1, h: 1, weightPerUnitKg: 0.012, nameUk: 'Набої 9мм', nameEn: '9mm Box', accent: '#38bdf8' },
  '12ga': { w: 1, h: 1, weightPerUnitKg: 0.045, nameUk: 'Дріб 12 кал.', nameEn: '12ga Shells', accent: '#ef4444' },
  '556': { w: 1, h: 1, weightPerUnitKg: 0.014, nameUk: 'Набої 5.56', nameEn: '5.56mm Box', accent: '#f59e0b' },
  '762': { w: 1, h: 1, weightPerUnitKg: 0.025, nameUk: 'Набої 7.62', nameEn: '7.62mm Box', accent: '#fb923c' },
  frag: { w: 1, h: 1, weightPerUnitKg: 0.42, nameUk: 'Граната РГД-5', nameEn: 'RGD-5 Frag', accent: '#84cc16' },
};

export const MED_GRID_SPEC: Record<
  MedItemId,
  { w: number; h: number; weightKg: number }
> = {
  bandage: { w: 1, h: 1, weightKg: 0.18 },
  tourniquet: { w: 1, h: 1, weightKg: 0.22 },
  splint: { w: 2, h: 1, weightKg: 0.45 },
  tweezers: { w: 1, h: 1, weightKg: 0.12 },
  syringe_morphine: { w: 1, h: 1, weightKg: 0.08 },
  syringe_adrenaline: { w: 1, h: 1, weightKg: 0.08 },
  syringe_procoagulant: { w: 1, h: 1, weightKg: 0.09 },
  syringe_saline: { w: 1, h: 2, weightKg: 0.35 },
  syringe_naloxone: { w: 1, h: 1, weightKg: 0.08 },
  syringe_immunobooster: { w: 1, h: 1, weightKg: 0.08 },
  blood_bag: { w: 1, h: 2, weightKg: 0.52 },
  transfusion_tube: { w: 1, h: 1, weightKg: 0.14 },
  used_syringe: { w: 1, h: 1, weightKg: 0.04 },
  antibiotics: { w: 1, h: 1, weightKg: 0.09 },
};

export function createGridWeaponItem(weaponId: WeaponId): GridInventoryItem {
  const def = WEAPON_DEFS[weaponId];
  const spec = WEAPON_GRID_SPEC[weaponId];
  return {
    uid: nextUid(),
    category: 'weapon',
    weaponId,
    nameUk: def.nameUk,
    nameEn: def.nameEn,
    x: 0,
    y: 0,
    w: spec.w,
    h: spec.h,
    weightKg: spec.weightKg,
    quantity: 1,
    conditionPct: 100,
    accentColor: spec.accent,
  };
}

export function createGridAmmoItem(caliber: CaliberId, quantity: number): GridInventoryItem {
  const spec = AMMO_GRID_SPEC[caliber];
  return {
    uid: nextUid(),
    category: 'ammo',
    caliber,
    nameUk: spec.nameUk,
    nameEn: spec.nameEn,
    x: 0,
    y: 0,
    w: spec.w,
    h: spec.h,
    weightKg: Number((spec.weightPerUnitKg * quantity).toFixed(2)),
    quantity,
    conditionPct: 100,
    accentColor: spec.accent,
  };
}

export function createGridMedItem(
  medId: MedItemId,
  quantity = 1,
  conditionPct = 100,
): GridInventoryItem {
  const def = MED_ITEM_DEFS[medId];
  const spec = MED_GRID_SPEC[medId];
  return {
    uid: nextUid(),
    category: 'med',
    medId,
    nameUk: def.nameUk,
    nameEn: def.nameEn,
    x: 0,
    y: 0,
    w: spec.w,
    h: spec.h,
    weightKg: spec.weightKg,
    quantity,
    conditionPct,
    accentColor: def.accentColor,
  };
}

export function createGridBackpackItem(tier: BackpackTierId): GridInventoryItem {
  const def = BACKPACK_TIERS[tier];
  return {
    uid: nextUid(),
    category: 'backpack',
    backpackTier: tier,
    nameUk: def.nameUk,
    nameEn: def.nameEn,
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    weightKg: def.weightKg,
    quantity: 1,
    conditionPct: 100,
    accentColor: def.accentColor,
  };
}

export function canPlaceAt(
  grid: GridContainer,
  x: number,
  y: number,
  w: number,
  h: number,
  ignoreUid?: string,
): boolean {
  if (x < 0 || y < 0 || x + w > grid.cols || y + h > grid.rows) return false;
  for (const item of grid.items) {
    if (item.uid === ignoreUid) continue;
    const overlapX = x < item.x + item.w && x + w > item.x;
    const overlapY = y < item.y + item.h && y + h > item.y;
    if (overlapX && overlapY) return false;
  }
  return true;
}

export function findFreeSlot(
  grid: GridContainer,
  w: number,
  h: number,
): { x: number; y: number } | null {
  for (let y = 0; y <= grid.rows - h; y++) {
    for (let x = 0; x <= grid.cols - w; x++) {
      if (canPlaceAt(grid, x, y, w, h)) return { x, y };
    }
  }
  return null;
}

export function addItemToGrid(
  grid: GridContainer,
  item: GridInventoryItem,
): boolean {
  // Stack identical ammo in same cell (up to 60 rounds)
  if (item.category === 'ammo' && item.caliber) {
    const existing = grid.items.find(
      (i) => i.category === 'ammo' && i.caliber === item.caliber && i.quantity < 60,
    );
    if (existing) {
      const addAmt = Math.min(60 - existing.quantity, item.quantity);
      existing.quantity += addAmt;
      existing.weightKg = Number(
        (existing.quantity * AMMO_GRID_SPEC[item.caliber].weightPerUnitKg).toFixed(2),
      );
      item.quantity -= addAmt;
      if (item.quantity <= 0) return true;
      item.weightKg = Number(
        (item.quantity * AMMO_GRID_SPEC[item.caliber].weightPerUnitKg).toFixed(2),
      );
    }
  }

  // Stack non-partial meds (except bandages which track individual % durability!)
  if (item.category === 'med' && item.medId && item.medId !== 'bandage') {
    const existing = grid.items.find(
      (i) => i.category === 'med' && i.medId === item.medId && i.quantity < 4,
    );
    if (existing) {
      const addAmt = Math.min(4 - existing.quantity, item.quantity);
      existing.quantity += addAmt;
      item.quantity -= addAmt;
      if (item.quantity <= 0) return true;
    }
  }

  const slot = findFreeSlot(grid, item.w, item.h);
  if (!slot) return false;
  item.x = slot.x;
  item.y = slot.y;
  grid.items.push(item);
  return true;
}

export function buildGridFromLoot(
  weapons: WeaponId[],
  ammo: Partial<Record<CaliberId, number>>,
  meds: Partial<Record<MedItemId, number>>,
  backpacks: BackpackTierId[] = [],
): GridContainer {
  const grid: GridContainer = { cols: 6, rows: 4, items: [] };
  for (const w of weapons) {
    if (w !== 'hands') addItemToGrid(grid, createGridWeaponItem(w));
  }
  for (const bp of backpacks) {
    addItemToGrid(grid, createGridBackpackItem(bp));
  }
  (Object.keys(ammo) as CaliberId[]).forEach((cal) => {
    const amt = ammo[cal] ?? 0;
    if (amt > 0) addItemToGrid(grid, createGridAmmoItem(cal, amt));
  });
  (Object.keys(meds) as MedItemId[]).forEach((med) => {
    const cnt = meds[med] ?? 0;
    if (med === 'bandage') {
      for (let i = 0; i < cnt; i++) {
        addItemToGrid(grid, createGridMedItem('bandage', 1, 100));
      }
    } else if (cnt > 0) {
      addItemToGrid(grid, createGridMedItem(med, cnt, 100));
    }
  });
  return grid;
}

export function computeGridWeight(grid: GridContainer): number {
  let total = 0;
  for (const it of grid.items) {
    if (it.category === 'med') {
      const pctFactor = it.medId === 'bandage' ? Math.max(0.15, it.conditionPct / 100) : 1;
      total += it.weightKg * it.quantity * pctFactor;
    } else {
      total += it.weightKg;
    }
  }
  return Number(total.toFixed(2));
}

/**
 * Rebuilds flat `ownedWeapons`, `reserveAmmo`, `meds`, and `totalWeightKg` from Backpack Grid
 * so all existing weapon/medical systems stay 100% synchronized with grid slots.
 */
export function syncInventoryFromGrid(inv: InventoryState): void {
  const weaponsSet = new Set<WeaponId>(['hands']);
  const ammoTotals: Record<CaliberId, number> = {
    none: 0,
    '9mm': 0,
    '12ga': 0,
    '556': 0,
    '762': 0,
    frag: 0,
  };
  const medTotals: Record<MedItemId, number> = {
    bandage: 0,
    tourniquet: 0,
    splint: 0,
    tweezers: 0,
    syringe_morphine: 0,
    syringe_adrenaline: 0,
    syringe_procoagulant: 0,
    syringe_saline: 0,
    syringe_naloxone: 0,
    syringe_immunobooster: 0,
    blood_bag: 0,
    transfusion_tube: 0,
    used_syringe: 0,
    antibiotics: 0,
  };

  for (const item of inv.backpack.items) {
    if (item.category === 'weapon' && item.weaponId) {
      weaponsSet.add(item.weaponId);
    } else if (item.category === 'ammo' && item.caliber) {
      ammoTotals[item.caliber] += item.quantity;
    } else if (item.category === 'med' && item.medId) {
      medTotals[item.medId] += item.quantity;
    }
  }

  inv.ownedWeapons = Array.from(weaponsSet);
  inv.reserveAmmo = ammoTotals;
  inv.meds = medTotals;
  inv.totalWeightKg = computeGridWeight(inv.backpack);
}

export function equipBackpackTier(
  inv: InventoryState,
  newTier: BackpackTierId,
): BackpackTierId | null {
  const prevTier = inv.backpackTier;
  if (prevTier === newTier) return null;
  const spec = BACKPACK_TIERS[newTier];
  const testGrid: GridContainer = { cols: spec.cols, rows: spec.rows, items: [] };
  for (const it of inv.backpack.items) {
    const clone = structuredClone(it);
    if (canPlaceAt(testGrid, clone.x, clone.y, clone.w, clone.h)) {
      testGrid.items.push(clone);
    } else if (!addItemToGrid(testGrid, clone)) {
      return null;
    }
  }
  inv.backpackTier = newTier;
  inv.backpack = testGrid;
  inv.maxWeightKg = spec.maxWeightKg;
  syncInventoryFromGrid(inv);
  return prevTier;
}

/**
 * Syncs loot legacy counts from its grid so empty/searched checks remain accurate.
 */
export function syncLootFromGrid(bundle: LootBundle): void {
  const weapons: WeaponId[] = [];
  const ammo: Partial<Record<CaliberId, number>> = {};
  const meds: Partial<Record<MedItemId, number>> = {};
  const backpacks: BackpackTierId[] = [];

  for (const item of bundle.grid.items) {
    if (item.category === 'weapon' && item.weaponId) {
      weapons.push(item.weaponId);
    } else if (item.category === 'ammo' && item.caliber) {
      ammo[item.caliber] = (ammo[item.caliber] ?? 0) + item.quantity;
    } else if (item.category === 'med' && item.medId) {
      meds[item.medId] = (meds[item.medId] ?? 0) + item.quantity;
    } else if (item.category === 'backpack' && item.backpackTier) {
      backpacks.push(item.backpackTier);
    }
  }

  bundle.weapons = weapons;
  bundle.ammo = ammo;
  bundle.meds = meds;
  bundle.backpacks = backpacks;
}

/**
 * Consumes `usedPct` from the active bandage roll in the backpack grid (Casualties: Unknown partial dressing!).
 */
export function consumeBandageDurability(
  inv: InventoryState,
  usedPct: number,
  preferredUid?: string,
): number {
  const bandages = inv.backpack.items
    .filter((i) => i.category === 'med' && i.medId === 'bandage')
    .sort((a, b) => a.conditionPct - b.conditionPct);

  if (bandages.length === 0) return 0;
  const activeRoll =
    (preferredUid ? bandages.find((b) => b.uid === preferredUid) : undefined) ??
    bandages[0];
  activeRoll.conditionPct = Math.max(0, activeRoll.conditionPct - usedPct);
  if (activeRoll.conditionPct <= 0.5) {
    const idx = inv.backpack.items.findIndex((i) => i.uid === activeRoll.uid);
    if (idx !== -1) inv.backpack.items.splice(idx, 1);
  }
  syncInventoryFromGrid(inv);
  return activeRoll.conditionPct;
}

/**
 * Consumes 1 unit of a non-bandage med item or ammo round from the backpack grid.
 */
export function consumeOneMedFromGrid(
  inv: InventoryState,
  medId: MedItemId,
  preferredUid?: string,
): boolean {
  if (medId === 'bandage') {
    return consumeBandageDurability(inv, 100, preferredUid) >= 0;
  }
  const item =
    (preferredUid
      ? inv.backpack.items.find(
          (i) => i.uid === preferredUid && i.category === 'med' && i.medId === medId && i.quantity > 0,
        )
      : undefined) ??
    inv.backpack.items.find(
      (i) => i.category === 'med' && i.medId === medId && i.quantity > 0,
    );
  if (!item) return false;
  item.quantity -= 1;
  if (item.quantity <= 0) {
    const idx = inv.backpack.items.findIndex((i) => i.uid === item.uid);
    if (idx !== -1) inv.backpack.items.splice(idx, 1);
  }
  syncInventoryFromGrid(inv);
  return true;
}

export function consumeAmmoFromGrid(
  inv: InventoryState,
  caliber: CaliberId,
  amount: number,
): number {
  let needed = amount;
  for (let i = inv.backpack.items.length - 1; i >= 0 && needed > 0; i--) {
    const item = inv.backpack.items[i];
    if (item.category === 'ammo' && item.caliber === caliber && item.quantity > 0) {
      const take = Math.min(needed, item.quantity);
      item.quantity -= take;
      needed -= take;
      item.weightKg = Number(
        (item.quantity * AMMO_GRID_SPEC[caliber].weightPerUnitKg).toFixed(2),
      );
      if (item.quantity <= 0) {
        inv.backpack.items.splice(i, 1);
      }
    }
  }
  syncInventoryFromGrid(inv);
  return amount - needed;
}

export function createInitialPlayerInventory(): InventoryState {
  const backpack: GridContainer = { cols: 6, rows: 5, items: [] };
  addItemToGrid(backpack, createGridWeaponItem('reality_crusher'));
  addItemToGrid(backpack, createGridWeaponItem('crowbar'));
  addItemToGrid(backpack, createGridWeaponItem('pistol_9mm'));
  addItemToGrid(backpack, createGridAmmoItem('9mm', 12));
  addItemToGrid(backpack, createGridMedItem('bandage', 1, 100));
  addItemToGrid(backpack, createGridMedItem('bandage', 1, 75));
  addItemToGrid(backpack, createGridMedItem('tourniquet', 1));
  addItemToGrid(backpack, createGridMedItem('splint', 1));
  addItemToGrid(backpack, createGridMedItem('tweezers', 1));
  addItemToGrid(backpack, createGridMedItem('syringe_morphine', 1));
  addItemToGrid(backpack, createGridMedItem('syringe_adrenaline', 1));
  addItemToGrid(backpack, createGridMedItem('syringe_saline', 1));
  addItemToGrid(backpack, createGridMedItem('syringe_naloxone', 1));

  const inv: InventoryState = {
    ownedWeapons: [],
    magAmmo: {
      hands: 0,
      reality_crusher: 0,
      crowbar: 0,
      katana: 0,
      fire_axe: 0,
      pistol_9mm: 8,
      shotgun_12ga: 0,
      rifle_556: 0,
      sniper_762: 0,
      frag_grenade: 0,
    },
    reserveAmmo: {
      none: 0,
      '9mm': 0,
      '12ga': 0,
      '556': 0,
      '762': 0,
      frag: 0,
    },
    meds: {
      bandage: 0,
      tourniquet: 0,
      splint: 0,
      tweezers: 0,
      syringe_morphine: 0,
      syringe_adrenaline: 0,
      syringe_procoagulant: 0,
      syringe_saline: 0,
      syringe_naloxone: 0,
      syringe_immunobooster: 0,
      blood_bag: 0,
      transfusion_tube: 0,
      used_syringe: 0,
      antibiotics: 0,
    },
    backpackTier: 'starter',
    backpack,
    totalWeightKg: 0,
    maxWeightKg: BACKPACK_TIERS.starter.maxWeightKg,
  };
  syncInventoryFromGrid(inv);
  return inv;
}
