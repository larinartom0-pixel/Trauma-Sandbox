import { LIMB_META } from './data';
import {
  LimbId,
  LimbState,
  MedItemId,
  OverdoseSeverity,
  PhysiologyState,
} from './types';

function createLimb(id: LimbId): LimbState {
  return {
    id,
    skin: 100,
    muscle: 100,
    bleedRate: 0,
    fractured: false,
    splinted: false,
    tourniquet: false,
    tourniquetTime: 0,
    bandageCoverage: 0,
    shrapnel: 0,
    burn: 0,
    severed: false,
    infected: 0,
  };
}

export function computeCompositeOrganHealth(phys: PhysiologyState): number {
  const o = phys.organs;
  return (
    o.brain * 0.28 +
    o.heart * 0.26 +
    o.lungs * 0.2 +
    o.liver * 0.14 +
    o.kidneys * 0.12
  );
}

export function createInitialPhysiology(): PhysiologyState {
  return {
    bloodVolumeMl: 5000,
    maxBloodMl: 5000,
    internalBleedRate: 0,
    oxygenPct: 99,
    lungCapacityPct: 100,
    respRate: 16,
    heartRateBpm: 74,
    systolicBp: 120,
    consciousnessPct: 100,
    organHealth: 100,
    organs: {
      brain: 100,
      heart: 100,
      lungs: 100,
      liver: 100,
      kidneys: 100,
    },
    hallucinationLevel: 0,
    shockLevel: 0,
    sepsis: 0,
    temperatureC: 36.6,
    pain: 0,
    toxicity: 0,
    sickness: 0,
    opioidLevel: 0,
    stimulantLevel: 0,
    coagulantLevel: 0,
    fluidDilution: 1.0,
    immunityPct: 86,
    infectionLevel: 0,
    infectionPhase: 0,
    immunityBoostTimer: 0,
    antibioticLevel: 0,
    untreatedBleedTimer: 0,
    cardiacArrestTimer: 0,
    unconsciousTimerSec: 0,
    unconsciousMaxSec: 12,
    unconsciousDanger: false,
    postWakeDebuffTimer: 0,
    consciousness: 'awake',
    overdose: 'none',
    overdoseReason: null,
    causeOfDeath: null,
    limbs: {
      head: createLimb('head'),
      torso: createLimb('torso'),
      leftArm: createLimb('leftArm'),
      rightArm: createLimb('rightArm'),
      leftLeg: createLimb('leftLeg'),
      rightLeg: createLimb('rightLeg'),
    },
  };
}

export function applyLimbTrauma(
  phys: PhysiologyState,
  limbId: LimbId,
  damage: number,
  bleedPower: number,
  fractureChance: number,
  severChance: number,
  shrapnelCount = 0,
  burnAmount = 0,
): { fracturedNow: boolean; severedNow: boolean } {
  const limb = phys.limbs[limbId];
  if (limb.severed) {
    if (limbId !== 'torso') {
      return applyLimbTrauma(
        phys,
        'torso',
        damage * 0.55,
        bleedPower * 0.6,
        0,
        0,
        0,
        burnAmount,
      );
    }
    return { fracturedNow: false, severedNow: false };
  }

  const skinDmg = Math.min(limb.skin, damage * 0.92);
  limb.skin = Math.max(0, limb.skin - skinDmg);
  limb.muscle = Math.max(0, limb.muscle - damage * 0.72);
  limb.burn = Math.min(100, limb.burn + burnAmount);
  limb.shrapnel += shrapnelCount;
  limb.bandageCoverage = Math.max(0, limb.bandageCoverage - damage * 0.85);
  limb.infected = Math.min(100, limb.infected + damage * 0.25 + shrapnelCount * 8);

  const weight = LIMB_META[limbId].bloodWeight;
  const newBleed = bleedPower * weight * (0.75 + (100 - limb.skin) / 110);
  limb.bleedRate = Math.min(110, limb.bleedRate + newBleed);

  // Torso hits damage internal organs (heart, lungs, liver, kidneys) & cause internal hemorrhage!
  if (limbId === 'torso') {
    phys.organs.lungs = Math.max(0, phys.organs.lungs - damage * 0.72);
    phys.organs.heart = Math.max(0, phys.organs.heart - damage * 0.56);
    phys.organs.liver = Math.max(0, phys.organs.liver - damage * 0.64);
    phys.organs.kidneys = Math.max(0, phys.organs.kidneys - damage * 0.52);
    if (damage > 16) {
      phys.internalBleedRate = Math.min(
        45,
        phys.internalBleedRate + bleedPower * 1.15,
      );
      phys.lungCapacityPct = Math.max(
        24,
        phys.lungCapacityPct - damage * 0.48,
      );
    }
  }

  // Head trauma damages the brain directly -> concussion, hallucinations & blackout!
  if (limbId === 'head') {
    phys.organs.brain = Math.max(0, phys.organs.brain - damage * 0.85);
    const nextConsc = phys.consciousnessPct - damage * 1.25;
    phys.consciousnessPct =
      damage < 36 && phys.consciousnessPct > 40
        ? Math.max(36, nextConsc)
        : Math.max(0, nextConsc);
  } else {
    // Acute pain / blast trauma drop to consciousness (enters clouding zone first unless catastrophic)
    const drop = damage > 18 ? damage * 0.45 : damage * 0.22;
    const nextConsc = phys.consciousnessPct - drop;
    phys.consciousnessPct =
      damage < 58 && phys.consciousnessPct > 40
        ? Math.max(36, nextConsc)
        : Math.max(0, nextConsc);
  }

  let fracturedNow = false;
  if (!limb.fractured && limbId !== 'head' && Math.random() < fractureChance) {
    limb.fractured = true;
    limb.splinted = false;
    fracturedNow = true;
    phys.pain = Math.min(100, phys.pain + 28);
    phys.shockLevel = Math.min(100, phys.shockLevel + 18);
    phys.consciousnessPct = Math.max(phys.consciousnessPct > 38 ? 34 : 0, phys.consciousnessPct - 14);
  }

  let severedNow = false;
  const canSever =
    limbId === 'leftArm' ||
    limbId === 'rightArm' ||
    limbId === 'leftLeg' ||
    limbId === 'rightLeg' ||
    limbId === 'head';

  if (canSever && limb.muscle <= 22 && Math.random() < severChance) {
    limb.severed = true;
    limb.bleedRate = Math.max(limb.bleedRate, limbId === 'head' ? 160 : 55);
    severedNow = true;
    phys.pain = Math.min(100, phys.pain + 45);
    phys.shockLevel = Math.min(100, phys.shockLevel + 34);
    phys.consciousnessPct = Math.max(0, phys.consciousnessPct - 35);
  }

  phys.pain = Math.min(100, phys.pain + damage * 0.58 + shrapnelCount * 7);
  phys.shockLevel = Math.min(100, phys.shockLevel + damage * 0.46);
  phys.organHealth = computeCompositeOrganHealth(phys);

  // Instant lethal checks only for truly catastrophic destruction
  if (limbId === 'head' && (limb.severed || limb.muscle <= 8 || damage >= 72 || phys.organs.brain <= 4)) {
    phys.bloodVolumeMl = Math.max(0, phys.bloodVolumeMl - 1500);
    phys.consciousnessPct = 0;
    phys.consciousness = 'dead';
    phys.causeOfDeath = 'Критична черепно-мозкова травма / Fatal Head Trauma';
    return { fracturedNow, severedNow };
  }

  if (
    phys.organHealth <= 4 ||
    phys.organs.heart <= 4 ||
    phys.organs.brain <= 4 ||
    (limbId === 'torso' && limb.muscle <= 0)
  ) {
    phys.consciousnessPct = 0;
    phys.consciousness = 'dead';
    phys.causeOfDeath = 'Руйнування життєво важливих органів / Fatal Organ Destruction';
  }

  return { fracturedNow, severedNow };
}

export function applyBandageStroke(
  phys: PhysiologyState,
  limbId: LimbId,
  amountPct: number,
): boolean {
  const limb = phys.limbs[limbId];
  if (limb.severed && limbId === 'head') return false;
  const prev = limb.bandageCoverage;
  limb.bandageCoverage = Math.min(100, limb.bandageCoverage + amountPct);
  const reduction = (limb.bandageCoverage - prev) * 0.013;
  limb.bleedRate = Math.max(0, limb.bleedRate * (1 - reduction * 0.78));
  limb.infected = Math.max(0, limb.infected - amountPct * 0.25);
  if (limb.bandageCoverage >= 98 && limb.shrapnel === 0) {
    limb.bleedRate = Math.min(limb.bleedRate, 0.25);
  }
  return limb.bandageCoverage >= 100 && prev < 100;
}

export function toggleLimbTourniquet(
  phys: PhysiologyState,
  limbId: LimbId,
): boolean {
  if (limbId === 'head' || limbId === 'torso') return false;
  const limb = phys.limbs[limbId];
  limb.tourniquet = !limb.tourniquet;
  if (!limb.tourniquet) {
    limb.tourniquetTime = 0;
  }
  return true;
}

export function applyLimbSplint(phys: PhysiologyState, limbId: LimbId): boolean {
  const limb = phys.limbs[limbId];
  if (!limb.fractured || limb.splinted || limb.severed) return false;
  limb.splinted = true;
  phys.pain = Math.max(0, phys.pain - 18);
  phys.shockLevel = Math.max(0, phys.shockLevel - 10);
  return true;
}

export function extractLimbShrapnel(phys: PhysiologyState, limbId: LimbId): boolean {
  const limb = phys.limbs[limbId];
  if (limb.shrapnel <= 0) return false;
  limb.shrapnel -= 1;
  limb.bleedRate = Math.min(110, limb.bleedRate + 2.2);
  limb.infected = Math.max(0, limb.infected - 15);
  phys.pain = Math.min(100, phys.pain + 5);
  return true;
}

export function breakNeedleInLimb(phys: PhysiologyState, limbId: LimbId): void {
  const limb = phys.limbs[limbId];
  limb.shrapnel += 1;
  limb.bleedRate = Math.min(110, limb.bleedRate + 5.2);
  limb.skin = Math.max(0, limb.skin - 10);
  limb.infected = Math.min(100, limb.infected + 12);
  phys.pain = Math.min(100, phys.pain + 16);
}

export function performChestCpr(phys: PhysiologyState): void {
  if (phys.consciousness === 'dead') return;
  if (phys.consciousness === 'cardiacArrest') {
    phys.oxygenPct = Math.min(100, phys.oxygenPct + 9.5);
    phys.cardiacArrestTimer = Math.max(0, phys.cardiacArrestTimer - 3.6);
    phys.organs.brain = Math.min(100, phys.organs.brain + 1.2);
    if (
      phys.bloodVolumeMl > 1950 &&
      phys.opioidLevel < 1.35 &&
      phys.stimulantLevel < 1.55 &&
      phys.organs.heart > 10 &&
      Math.random() < 0.36
    ) {
      phys.consciousness = 'unconscious';
      phys.heartRateBpm = 76;
      phys.systolicBp = 82;
      phys.unconsciousTimerSec = 0;
    }
  } else if (phys.consciousnessPct < 36) {
    phys.consciousnessPct = Math.min(100, phys.consciousnessPct + 7);
    phys.oxygenPct = Math.min(100, phys.oxygenPct + 3.5);
  }
}

export function injectSyringeFraction(
  phys: PhysiologyState,
  medId: MedItemId,
  fraction: number,
  limbId: LimbId,
): void {
  const f = Math.max(0.02, Math.min(1, fraction));
  const limb = phys.limbs[limbId];
  const absorption = limb.tourniquet ? 0.14 : 1.0;

  switch (medId) {
    case 'syringe_morphine': {
      phys.opioidLevel += 0.65 * f * absorption;
      phys.fluidDilution = Math.min(1.95, phys.fluidDilution + 0.02 * f);
      phys.toxicity = Math.min(100, phys.toxicity + 13 * f);
      phys.shockLevel = Math.max(0, phys.shockLevel - 18 * f);
      break;
    }
    case 'syringe_adrenaline': {
      phys.stimulantLevel += 0.72 * f * absorption;
      phys.fluidDilution = Math.min(1.95, phys.fluidDilution + 0.015 * f);
      phys.toxicity = Math.min(100, phys.toxicity + 14 * f);
      phys.consciousnessPct = Math.min(100, phys.consciousnessPct + 35 * f);
      if (phys.consciousness === 'cardiacArrest' && f > 0.2) {
        phys.consciousness = 'critical';
        phys.heartRateBpm = 105;
        phys.cardiacArrestTimer = 0;
      }
      break;
    }
    case 'syringe_procoagulant': {
      phys.coagulantLevel = Math.min(2.2, phys.coagulantLevel + 0.9 * f * absorption);
      phys.internalBleedRate = Math.max(0, phys.internalBleedRate - 16 * f * absorption);
      phys.fluidDilution = Math.max(0.88, phys.fluidDilution - 0.09 * f);
      phys.toxicity = Math.min(100, phys.toxicity + 10 * f);
      break;
    }
    case 'syringe_saline': {
      // Saline expands plasma pressure/shock temporarily, does NOT regenerate red blood cells!
      phys.fluidDilution = Math.min(2.0, phys.fluidDilution + 0.16 * f);
      phys.shockLevel = Math.max(0, phys.shockLevel - 16 * f * absorption);
      phys.systolicBp = Math.min(145, phys.systolicBp + 12 * f * absorption);
      phys.temperatureC = Math.max(33, phys.temperatureC - 0.2 * f);
      if (phys.fluidDilution > 1.32) {
        phys.sickness = Math.min(100, phys.sickness + 22 * f);
      }
      break;
    }
    case 'syringe_naloxone': {
      phys.opioidLevel = Math.max(0, phys.opioidLevel - 1.45 * f * absorption);
      phys.toxicity = Math.max(0, phys.toxicity - 24 * f);
      phys.sickness = Math.min(100, phys.sickness + 6 * f);
      if (phys.consciousness === 'cardiacArrest' && phys.opioidLevel < 0.7) {
        phys.consciousness = 'unconscious';
        phys.oxygenPct = Math.max(phys.oxygenPct, 54);
        phys.cardiacArrestTimer = 0;
      }
      break;
    }
    case 'syringe_immunobooster': {
      phys.immunityPct = Math.min(100, phys.immunityPct + 28 * f * absorption);
      phys.immunityBoostTimer = Math.min(140, phys.immunityBoostTimer + 50 * f);
      phys.sickness = Math.max(0, phys.sickness - 14 * f);
      phys.toxicity = Math.min(100, phys.toxicity + 4 * f);
      break;
    }
    default:
      break;
  }
}

export function transfuseBloodBag(
  phys: PhysiologyState,
  limbId: LimbId,
  viaUsedSyringe: boolean,
): { infectedRoll: boolean } {
  const limb = phys.limbs[limbId];
  const absorption = limb.tourniquet ? 0.25 : 1.0;
  phys.bloodVolumeMl = Math.min(
    phys.maxBloodMl,
    phys.bloodVolumeMl + 450 * absorption,
  );
  phys.shockLevel = Math.max(0, phys.shockLevel - 20 * absorption);
  phys.temperatureC = Math.min(37.2, phys.temperatureC + 0.35);
  phys.fluidDilution = Math.max(1.0, phys.fluidDilution - 0.08);

  if (viaUsedSyringe) {
    phys.toxicity = Math.min(100, phys.toxicity + 8);
    phys.pain = Math.min(100, phys.pain + 6);
    if (Math.random() < 0.6) {
      phys.infectionLevel = Math.min(100, phys.infectionLevel + 32);
      if (phys.infectionPhase === 0) {
        phys.infectionPhase = 1; // Starts silently in Phase 1
      }
      return { infectedRoll: true };
    }
  }
  return { infectedRoll: false };
}

export function takeAntibiotics(phys: PhysiologyState): void {
  phys.antibioticLevel = Math.min(2.0, phys.antibioticLevel + 1.15);
  phys.infectionLevel = Math.max(0, phys.infectionLevel - 26);
  phys.sepsis = Math.max(0, phys.sepsis - 14);
  phys.immunityPct = Math.min(100, phys.immunityPct + 6);
  phys.toxicity = Math.min(100, phys.toxicity + 5);
}

export function getEffectiveLimbBleed(
  phys: PhysiologyState,
  limb: LimbState,
): number {
  if (limb.bleedRate <= 0.01) return 0;
  let effective = limb.tourniquet ? limb.bleedRate * 0.08 : limb.bleedRate;
  const shrapnelPenalty = Math.min(0.55, limb.shrapnel * 0.15);
  const bandageFactor = Math.max(
    0.16,
    1 - (limb.bandageCoverage / 100) * (0.82 - shrapnelPenalty),
  );
  effective *= bandageFactor;
  const dilutionMult = Math.max(0.45, phys.fluidDilution - phys.coagulantLevel * 0.28);
  return effective * dilutionMult;
}

export function tickPhysiology(phys: PhysiologyState, dt: number): void {
  if (phys.consciousness === 'dead') return;

  const prevConscState = phys.consciousness;
  phys.postWakeDebuffTimer = Math.max(0, phys.postWakeDebuffTimer - dt);

  // 1. Metabolic clearance (modulated by Liver & Kidneys health!)
  const liverFactor = Math.max(0.28, phys.organs.liver / 100);
  const kidneyFactor = Math.max(0.28, phys.organs.kidneys / 100);
  phys.opioidLevel = Math.max(0, phys.opioidLevel - dt * 0.016 * liverFactor);
  phys.stimulantLevel = Math.max(0, phys.stimulantLevel - dt * 0.022 * liverFactor);
  phys.coagulantLevel = Math.max(0, phys.coagulantLevel - dt * 0.014);
  phys.fluidDilution = Math.max(1.0, phys.fluidDilution - dt * 0.0085 * kidneyFactor);
  phys.toxicity = Math.max(0, phys.toxicity - dt * 0.55 * liverFactor);
  phys.immunityBoostTimer = Math.max(0, phys.immunityBoostTimer - dt);
  phys.antibioticLevel = Math.max(0, phys.antibioticLevel - dt * 0.014);

  // 2. Per-limb clotting, infection/sepsis, tourniquet ischemia
  const internalBleedNow =
    phys.internalBleedRate * Math.max(0.4, phys.fluidDilution - phys.coagulantLevel * 0.35);
  let totalExternalBleed = 0;
  let limbPain = 0;
  let totalInfection = 0;

  (Object.keys(phys.limbs) as LimbId[]).forEach((id) => {
    const limb = phys.limbs[id];

    if (limb.bleedRate > 0) {
      const clotRate =
        (0.05 + phys.coagulantLevel * 0.35 + (limb.bandageCoverage > 55 ? 0.14 : 0)) /
        Math.max(0.8, phys.fluidDilution);
      const minFloor = limb.shrapnel * 0.75 + (limb.severed ? 12 : 0);
      limb.bleedRate = Math.max(minFloor, limb.bleedRate - clotRate * dt);
    }

    if (limb.tourniquet) {
      limb.tourniquetTime += dt;
      if (limb.tourniquetTime > 85) {
        limb.muscle = Math.max(0, limb.muscle - dt * 1.25);
        limbPain += 15;
        phys.toxicity = Math.min(100, phys.toxicity + dt * 0.8);
      }
    }

    if (limb.bleedRate > 1.2 && limb.bandageCoverage < 40) {
      limb.infected = Math.min(100, limb.infected + dt * 0.48);
    }
    if (limb.shrapnel > 0) {
      limbPain += limb.shrapnel * 6;
      limb.infected = Math.min(100, limb.infected + dt * 0.45 * limb.shrapnel);
    }
    if (limb.fractured && !limb.splinted) {
      limbPain += 20;
    }

    totalInfection += limb.infected;
    totalExternalBleed += getEffectiveLimbBleed(phys, limb);
  });

  const totalBleedMlPerSec = internalBleedNow + totalExternalBleed;

  // 3. Internal bleeding slow decay by coagulant
  if (phys.internalBleedRate > 0) {
    phys.internalBleedRate = Math.max(
      0,
      phys.internalBleedRate - (0.015 + phys.coagulantLevel * 0.45) * dt,
    );
  }

  // 4. Blood loss ONLY (blood NEVER regenerates passively — requires Blood Bag + Tubing!)
  phys.bloodVolumeMl = Math.max(0, phys.bloodVolumeMl - totalBleedMlPerSec * dt);
  const bloodRatio = phys.bloodVolumeMl / phys.maxBloodMl;

  // 5. Prolonged Untreated Bleeding -> Infection Seeding
  if (totalExternalBleed > 0.35) {
    phys.untreatedBleedTimer += dt;
    if (phys.untreatedBleedTimer > 18) {
      phys.infectionLevel = Math.min(100, phys.infectionLevel + dt * 2.1);
      if (phys.infectionPhase === 0 && phys.infectionLevel >= 14) {
        phys.infectionPhase = 1; // Hidden Phase 1 begins silently
      }
    }
  } else {
    phys.untreatedBleedTimer = Math.max(0, phys.untreatedBleedTimer - dt * 0.65);
  }

  // 6. Immunity System (weakens from blood loss, shock, cold, toxicity, kidney impairment; fights infection!)
  const immunityGain =
    (phys.immunityBoostTimer > 0 ? 2.4 : 0.28) * (0.5 + kidneyFactor * 0.5);
  const immunityDrain =
    Math.max(0, (0.85 - bloodRatio) * 1.15) +
    Math.max(0, (36.1 - phys.temperatureC) * 0.55) +
    phys.toxicity * 0.016 +
    phys.shockLevel * 0.012 +
    (phys.infectionPhase === 1 ? 0.38 : phys.infectionPhase === 2 ? 0.72 : 0);
  phys.immunityPct = Math.max(
    5,
    Math.min(100, phys.immunityPct + (immunityGain - immunityDrain) * dt),
  );

  // 7. Infection Battle: Phase 1 (Hidden) vs Phase 2 (Severe & Visible)
  if (phys.infectionPhase > 0) {
    const defensePower =
      (phys.immunityPct / 100) * 1.48 + phys.antibioticLevel * 1.85;
    const bacteriaPower =
      0.76 + (1 - bloodRatio) * 0.72 + totalInfection / 340;
    phys.infectionLevel = Math.max(
      0,
      Math.min(100, phys.infectionLevel + (bacteriaPower - defensePower) * dt * 1.5),
    );

    if (phys.infectionPhase === 1) {
      if (phys.infectionLevel <= 1 && phys.untreatedBleedTimer < 5) {
        phys.infectionPhase = 0;
        phys.infectionLevel = 0;
      } else if (phys.infectionLevel >= 52) {
        // Immunity failed to contain Phase 1 -> Escalates to visible Phase 2!
        phys.infectionPhase = 2;
      }
    } else if (phys.infectionPhase === 2) {
      if (phys.infectionLevel < 18) {
        phys.infectionPhase = 1;
      }
    }
  }

  // Only Phase 2 registers clinically on Sepsis / Infection readout; Phase 1 stays stealth!
  const targetSepsis =
    phys.infectionPhase === 2
      ? Math.min(100, 38 + phys.infectionLevel * 0.62)
      : 0;
  phys.sepsis += (targetSepsis - phys.sepsis) * Math.min(1, dt * 0.45);

  const phase1TempBump = phys.infectionPhase === 1 ? 0.35 : 0;
  const targetTemp = Math.max(
    32.2,
    Math.min(
      41.2,
      36.6 - (1 - bloodRatio) * 4.6 + (phys.sepsis / 100) * 3.8 + phase1TempBump,
    ),
  );
  phys.temperatureC += (targetTemp - phys.temperatureC) * Math.min(1, dt * 0.15);

  // 8. Pain & Shock (Phase 2 infection adds strong body ache & septic shock)
  const phase2Pain = phys.infectionPhase === 2 ? 14 : 0;
  const targetPain = Math.min(
    100,
    Math.max(
      0,
      limbPain + phase2Pain + (5000 - phys.bloodVolumeMl) * 0.005 - phys.opioidLevel * 62,
    ),
  );
  phys.pain += (targetPain - phys.pain) * Math.min(1, dt * 2.4);

  const targetShock = Math.min(
    100,
    Math.max(
      0,
      (1 - bloodRatio) * 115 + phys.pain * 0.45 + phys.sepsis * 0.42 - phys.stimulantLevel * 20,
    ),
  );
  phys.shockLevel += (targetShock - phys.shockLevel) * Math.min(1, dt * 0.8);

  // 7. Overdose & Toxicity Evaluation
  let od: OverdoseSeverity = 'none';
  let odReason: string | null = null;

  if (phys.opioidLevel > 1.65) {
    od = 'lethal';
    odReason = 'Гостре передозування опіоїдами / Lethal Opioid Overdose';
  } else if (phys.opioidLevel > 1.15) {
    od = 'severe';
    odReason = 'Тяжке передозування морфіном / Severe Opioid Overdose';
  } else if (phys.opioidLevel > 0.82) {
    od = 'mild';
    odReason = 'Пригнічення дихання (опіоїди) / Opioid Depression';
  }

  if (phys.stimulantLevel > 1.65) {
    od = 'lethal';
    odReason = 'Передозування адреналіном (фібриляція) / Lethal Stimulant Overdose';
  } else if (phys.stimulantLevel > 1.2 && od !== 'lethal') {
    od = 'severe';
    odReason = 'Тахікардія від адреналіну / Severe Adrenaline Overdose';
  } else if (phys.stimulantLevel > 0.9 && od === 'none') {
    od = 'mild';
    odReason = 'Перезбудження стимуляторами / Stimulant Excess';
  }

  if (phys.fluidDilution > 1.44 && od !== 'lethal') {
    od = phys.fluidDilution > 1.7 ? 'severe' : od === 'none' ? 'mild' : od;
    odReason =
      odReason ??
      'Набряк легень та розрідження крові / Pulmonary Edema & Hemodilution';
  }

  if (phys.toxicity > 75 && od !== 'lethal') {
    od = 'severe';
    odReason = odReason ?? 'Системна хімічна інтоксикація / Chemical Toxicity';
  }

  phys.overdose = od;
  phys.overdoseReason = odReason;

  const targetSickness = Math.min(
    100,
    phys.toxicity * 0.72 +
      phys.sepsis * 0.65 +
      Math.max(0, phys.fluidDilution - 1.2) * 135 +
      Math.max(0, phys.opioidLevel - 0.68) * 28,
  );
  phys.sickness += (targetSickness - phys.sickness) * Math.min(1, dt * 1.4);

  // 8. Respiration, Lung Capacity & Oxygen (SpO2) — coupled directly to Lungs organ!
  const edemaPenalty = Math.max(0, phys.fluidDilution - 1.35) * 48;
  const lungCeiling = Math.max(22, phys.organs.lungs * 0.96 + 4);
  const effectiveLung = Math.max(
    14,
    Math.min(lungCeiling, phys.lungCapacityPct) - edemaPenalty,
  );
  phys.lungCapacityPct = Math.min(lungCeiling, phys.lungCapacityPct + dt * 0.22);

  const opioidRespSuppression = Math.max(0, phys.opioidLevel - 0.75) * 14;
  const targetResp =
    phys.consciousness === 'cardiacArrest'
      ? 0
      : Math.max(
          0,
          Math.min(
            34,
            16 +
              phys.shockLevel * 0.14 +
              Math.max(0, 80 - phys.organs.lungs) * 0.16 -
              opioidRespSuppression,
          ),
        );
  phys.respRate += (targetResp - phys.respRate) * Math.min(1, dt * 1.2);

  const respFactor = Math.min(1, phys.respRate / 10);
  const targetOxygen =
    phys.consciousness === 'cardiacArrest'
      ? 6
      : Math.max(
          8,
          Math.min(100, effectiveLung * Math.min(1, bloodRatio * 1.28) * respFactor),
        );
  phys.oxygenPct += (targetOxygen - phys.oxygenPct) * Math.min(1, dt * 0.55);

  // 9. Heart Rate & Blood Pressure — coupled to Heart & Kidneys organs!
  const heartFactor = Math.max(0.32, phys.organs.heart / 100);
  const hypovolemicBoost = Math.max(0, (1 - bloodRatio) * 90);
  const painBoost = phys.pain * 0.35;
  const stimBoost = phys.stimulantLevel * 76;
  const phase2HrBoost = phys.infectionPhase === 2 ? 22 : 0;
  const heartStressArrhythmia =
    phys.organs.heart < 75 ? (75 - phys.organs.heart) * 0.55 : 0;
  const opioidSlow = phys.opioidLevel * 28;
  const targetBpm =
    phys.consciousness === 'cardiacArrest'
      ? 0
      : Math.max(
          22,
          Math.min(
            218,
            72 +
              hypovolemicBoost +
              painBoost +
              stimBoost +
              phase2HrBoost +
              heartStressArrhythmia -
              opioidSlow,
          ),
        );
  phys.heartRateBpm += (targetBpm - phys.heartRateBpm) * Math.min(1, dt * 1.8);

  const targetBp =
    phys.consciousness === 'cardiacArrest'
      ? 0
      : Math.max(
          25,
          Math.min(
            195,
            (120 * bloodRatio * (0.55 + heartFactor * 0.45) +
              phys.stimulantLevel * 28 -
              phys.opioidLevel * 18 -
              phys.shockLevel * 0.25) *
              (0.86 + kidneyFactor * 0.14),
          ),
        );
  phys.systolicBp += (targetBp - phys.systolicBp) * Math.min(1, dt * 1.5);

  // 10. Individual Vital Organs Degradation & Very Slow Passive Self-Regeneration
  const brainDrain =
    (phys.oxygenPct < 62 ? (62 - phys.oxygenPct) * 0.14 : 0) +
    (phys.systolicBp < 64 ? (64 - phys.systolicBp) * 0.08 : 0) +
    (phys.sepsis > 45 ? (phys.sepsis - 40) * 0.045 : 0) +
    (phys.overdose === 'lethal' ? 0.55 : 0);

  const heartDrain =
    (phys.heartRateBpm > 185 ? (phys.heartRateBpm - 180) * 0.11 : 0) +
    (phys.shockLevel > 70 ? (phys.shockLevel - 65) * 0.07 : 0) +
    (phys.bloodVolumeMl < 2500 ? (2500 - phys.bloodVolumeMl) * 0.0007 : 0) +
    (phys.sepsis > 50 ? (phys.sepsis - 45) * 0.04 : 0);

  const lungsDrain =
    (phys.fluidDilution > 1.38 ? (phys.fluidDilution - 1.35) * 1.9 : 0) +
    (phys.toxicity > 70 ? (phys.toxicity - 68) * 0.06 : 0) +
    (phys.sepsis > 50 ? (phys.sepsis - 45) * 0.04 : 0);

  const liverDrain =
    (phys.toxicity > 48 ? (phys.toxicity - 45) * 0.09 : 0) +
    (phys.opioidLevel > 1.1 ? 0.45 : 0) +
    (phys.stimulantLevel > 1.1 ? 0.45 : 0) +
    (phys.sepsis > 45 ? (phys.sepsis - 40) * 0.045 : 0);

  const kidneysDrain =
    (phys.systolicBp < 72 ? (72 - phys.systolicBp) * 0.11 : 0) +
    (phys.shockLevel > 65 ? (phys.shockLevel - 62) * 0.06 : 0) +
    (phys.toxicity > 60 ? (phys.toxicity - 58) * 0.07 : 0) +
    (phys.sepsis > 40 ? (phys.sepsis - 38) * 0.05 : 0);

  const canSlowlyRegen =
    phys.oxygenPct > 80 &&
    phys.systolicBp > 88 &&
    phys.infectionPhase !== 2 &&
    phys.temperatureC >= 34.4 &&
    phys.internalBleedRate <= 0.1;

  const updateOrgan = (val: number, drain: number, regenRate: number) => {
    if (drain > 0.01) {
      return Math.max(0, val - drain * dt);
    }
    if (canSlowlyRegen && val < 100) {
      return Math.min(100, val + regenRate * dt);
    }
    return val;
  };

  phys.organs.brain = updateOrgan(phys.organs.brain, brainDrain, 0.055);
  phys.organs.heart = updateOrgan(phys.organs.heart, heartDrain, 0.06);
  phys.organs.lungs = updateOrgan(phys.organs.lungs, lungsDrain, 0.075);
  phys.organs.liver = updateOrgan(phys.organs.liver, liverDrain, 0.085);
  phys.organs.kidneys = updateOrgan(phys.organs.kidneys, kidneysDrain, 0.07);

  phys.organHealth = computeCompositeOrganHealth(phys);

  // Brain Damage -> Visual Distortion & Hallucinations (0..100)
  const brainDeficit = Math.max(0, 84 - phys.organs.brain);
  const targetHallucination = Math.min(
    100,
    brainDeficit * 1.65 +
      Math.max(0, 68 - phys.oxygenPct) * 0.85 +
      Math.max(0, phys.toxicity - 55) * 0.65,
  );
  phys.hallucinationLevel +=
    (targetHallucination - phys.hallucinationLevel) * Math.min(1, dt * 1.4);

  // 11. Expanded Consciousness Calculation (more realistic parameters trigger blackouts!)
  const painPenalty = Math.max(0, phys.pain - 42) * 0.72;
  const bpPenalty = Math.max(0, 88 - phys.systolicBp) * 0.95;
  const tempPenalty = Math.max(0, 35.4 - phys.temperatureC) * 14;
  const brainPenalty = Math.max(0, 92 - phys.organs.brain) * 0.85;
  const toxSickPenalty = phys.toxicity * 0.24 + phys.sickness * 0.22;
  const bloodPenalty = Math.max(0, 0.88 - bloodRatio) * 65;

  const rawTargetConsciousness = Math.max(
    0,
    Math.min(
      100,
      (phys.oxygenPct / 95) * 100 -
        phys.shockLevel * 0.58 -
        painPenalty -
        bpPenalty -
        tempPenalty -
        brainPenalty -
        toxSickPenalty -
        bloodPenalty -
        (phys.infectionPhase === 2 ? 14 : 0) -
        Math.max(0, phys.opioidLevel - 0.72) * 54 -
        (phys.limbs.head.muscle < 65 ? (65 - phys.limbs.head.muscle) * 0.85 : 0),
    ),
  );

  // 12. Lethal checks (Death ONLY from irreversible failure, NOT instant on unconsciousness!)
  if (phys.bloodVolumeMl <= 1750) {
    phys.consciousnessPct = 0;
    phys.consciousness = 'dead';
    phys.causeOfDeath = 'Геморагічний шок (критична крововтрата) / Exsanguination';
    return;
  }

  if (phys.organHealth <= 5 || phys.organs.brain <= 4 || phys.organs.heart <= 4) {
    phys.consciousnessPct = 0;
    phys.consciousness = 'dead';
    phys.causeOfDeath = 'Поліорганна недостатність / Multiple Organ Failure';
    return;
  }

  if (phys.oxygenPct <= 11) {
    phys.consciousnessPct = 0;
    phys.consciousness = 'dead';
    phys.causeOfDeath = 'Критична гіпоксія мозку / Cerebral Hypoxia';
    return;
  }

  if (
    phys.overdose === 'lethal' &&
    (phys.oxygenPct < 45 || phys.heartRateBpm > 194 || phys.respRate < 3)
  ) {
    phys.consciousness = 'cardiacArrest';
  }

  if (phys.systolicBp < 38 || phys.heartRateBpm < 24 || phys.organs.heart <= 12) {
    phys.consciousness = 'cardiacArrest';
  }

  if (phys.consciousness === 'cardiacArrest') {
    phys.cardiacArrestTimer += dt;
    phys.unconsciousTimerSec += dt;
    phys.unconsciousMaxSec = 18;
    phys.unconsciousDanger = true;
    phys.consciousnessPct = Math.max(0, phys.consciousnessPct - dt * 14);
    phys.oxygenPct = Math.max(0, phys.oxygenPct - dt * 5.4);
    phys.organs.brain = Math.max(0, phys.organs.brain - dt * 2.1);
    phys.organs.heart = Math.max(0, phys.organs.heart - dt * 1.4);
    if (phys.cardiacArrestTimer >= 18 || phys.oxygenPct <= 10 || phys.organs.brain <= 4) {
      phys.consciousness = 'dead';
      phys.causeOfDeath =
        phys.overdoseReason ?? 'Зупинка серця та гіпоксія / Cardiac Arrest & Hypoxia';
    }
    return;
  }

  // Is player currently endangered while knocked out (bleeding out / hypoxic / failing organs)?
  const dangerActive =
    totalBleedMlPerSec > 0.35 ||
    phys.oxygenPct < 58 ||
    phys.bloodVolumeMl < 2500 ||
    phys.organHealth < 38 ||
    phys.organs.brain < 26;
  phys.unconsciousDanger = dangerActive;

  if (prevConscState === 'unconscious') {
    phys.unconsciousTimerSec += dt;
    const estDuration = Math.max(
      7,
      Math.min(
        22,
        8 +
          phys.shockLevel * 0.08 +
          Math.max(0, 85 - phys.organs.brain) * 0.14 +
          (1 - bloodRatio) * 8,
      ),
    );
    phys.unconsciousMaxSec = estDuration;

    if (!dangerActive) {
      // Body gradually recovers consciousness toward wake-up threshold
      const recoveryStep = Math.max(rawTargetConsciousness, 44);
      phys.consciousnessPct +=
        (recoveryStep - phys.consciousnessPct) * Math.min(1, dt * 0.24);
      if (phys.unconsciousTimerSec >= estDuration) {
        phys.consciousnessPct = Math.max(phys.consciousnessPct, 36);
      }
    } else {
      // Danger state: bleeding / hypoxia pushes down or prevents wake-up!
      phys.consciousnessPct +=
        (rawTargetConsciousness - phys.consciousnessPct) * Math.min(1, dt * 0.55);
    }
  } else {
    // Gradual pre-blackout fade below 58% so player sees tunnel vision, blur & stagger before collapsing
    const fadeRate =
      rawTargetConsciousness < phys.consciousnessPct && phys.consciousnessPct < 58
        ? 0.36
        : 0.82;
    phys.consciousnessPct +=
      (rawTargetConsciousness - phys.consciousnessPct) * Math.min(1, dt * fadeRate);
  }

  // Transition states
  const enterUnconscious =
    prevConscState === 'unconscious'
      ? phys.consciousnessPct < 34
      : phys.consciousnessPct < 30;

  if (enterUnconscious) {
    if (prevConscState !== 'unconscious') {
      phys.unconsciousTimerSec = 0;
      phys.unconsciousMaxSec = Math.max(
        8,
        Math.min(
          20,
          9 + phys.shockLevel * 0.08 + Math.max(0, 90 - phys.organs.brain) * 0.12,
        ),
      );
    }
    phys.consciousness = 'unconscious';
  } else {
    // Just woke up from blackout or arrest -> apply severe temporary vision & coordination debuffs!
    if (prevConscState === 'unconscious' || prevConscState === 'cardiacArrest') {
      phys.postWakeDebuffTimer = 8.5;
      phys.unconsciousTimerSec = 0;
    }

    if (
      phys.consciousnessPct < 54 ||
      phys.oxygenPct < 54 ||
      phys.bloodVolumeMl < 2450
    ) {
      phys.consciousness = 'critical';
    } else if (
      phys.consciousnessPct < 80 ||
      phys.oxygenPct < 78 ||
      phys.bloodVolumeMl < 3400 ||
      phys.overdose !== 'none' ||
      phys.sickness > 50 ||
      phys.postWakeDebuffTimer > 0 ||
      phys.hallucinationLevel > 25
    ) {
      phys.consciousness = 'tunnelVision';
    } else {
      phys.consciousness = 'awake';
    }
  }
}
