import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Backpack,
  CheckCircle2,
  Hand,
  RotateCw,
  ShieldAlert,
  Syringe,
  X,
} from 'lucide-react';
import { corruptText, LIMB_META, MED_ITEM_DEFS } from '../game/data';
import { getEffectiveLimbBleed } from '../game/physiology';
import {
  GridInventoryItem,
  InventoryState,
  LimbId,
  MedItemId,
  PhysiologyState,
} from '../game/types';
import { MedItemIcon } from './MedItemIcon';

interface MedicalModalProps {
  phys: PhysiologyState;
  inventory: InventoryState;
  onClose: () => void;
  onOpenInventory: () => void;
  onBandageSwipe: (limb: LimbId, pct: number, itemUid?: string) => void;
  onToggleTourniquet: (limb: LimbId, itemUid?: string) => void;
  onApplySplint: (limb: LimbId, itemUid?: string) => void;
  onExtractShrapnel: (limb: LimbId) => void;
  onWoundSlip: (limb: LimbId) => void;
  onSyringeStep: (
    medId: MedItemId,
    limb: LimbId,
    fractionDelta: number,
    finished: boolean,
    needleBroken: boolean,
    itemUid?: string,
  ) => void;
  onBloodTransfusion: (
    limb: LimbId,
    viaUsedSyringe: boolean,
    bagUid?: string,
    conduitUid?: string,
  ) => void;
  onTakeAntibiotics: (itemUid?: string) => void;
  onPerformCpr: () => void;
}

const SYRINGE_IDS: MedItemId[] = [
  'syringe_morphine',
  'syringe_adrenaline',
  'syringe_procoagulant',
  'syringe_saline',
  'syringe_naloxone',
  'syringe_immunobooster',
];

const LIMB_SHRAPNEL_ANCHORS: Record<LimbId, { x: number; y: number }> = {
  head: { x: 110, y: 34 },
  torso: { x: 110, y: 108 },
  rightArm: { x: 48, y: 118 },
  leftArm: { x: 172, y: 118 },
  rightLeg: { x: 92, y: 205 },
  leftLeg: { x: 128, y: 205 },
};

interface ActiveTreatment {
  item: GridInventoryItem;
  medId: MedItemId;
  limbId: LimbId;
}

interface DragState {
  item: GridInventoryItem;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  moved: boolean;
}

function getLimbFromPoint(clientX: number, clientY: number): LimbId | null {
  const els = document.elementsFromPoint(clientX, clientY);
  for (const el of els) {
    const lid = el.getAttribute('data-limb-id') as LimbId | null;
    if (lid) return lid;
  }
  return null;
}

function isTreatmentValid(
  medId: MedItemId,
  limbId: LimbId,
  phys: PhysiologyState,
  inventory: InventoryState,
): { ok: boolean; reason?: string } {
  const limb = phys.limbs[limbId];
  if (limb.severed) {
    return {
      ok: false,
      reason: `${LIMB_META[limbId].nameUk} ампутована — лікування неможливе!`,
    };
  }
  if (medId === 'tourniquet') {
    if (limbId === 'head' || limbId === 'torso') {
      return {
        ok: false,
        reason: 'Турнікет накладається лише на руки або ноги!',
      };
    }
    return { ok: true };
  }
  if (medId === 'splint') {
    if (limb.splinted) {
      return { ok: false, reason: 'На цій ділянці шина вже зафіксована.' };
    }
    if (!limb.fractured) {
      return { ok: false, reason: 'Перелому на цій ділянці не виявлено.' };
    }
    return { ok: true };
  }
  if (medId === 'tweezers') {
    if (limb.shrapnel <= 0) {
      return {
        ok: false,
        reason: `У ділянці "${LIMB_META[limbId].nameUk}" немає уламків чи голок.`,
      };
    }
    return { ok: true };
  }
  if (medId === 'blood_bag') {
    if (
      inventory.meds.transfusion_tube <= 0 &&
      inventory.meds.used_syringe <= 0
    ) {
      return {
        ok: false,
        reason:
          'Для переливання потрібна стерильна трубка або хоча б використаний шприц!',
      };
    }
    return { ok: true };
  }
  if (medId === 'transfusion_tube') {
    return {
      ok: false,
      reason:
        'Перетягніть на манекен мішок з кров’ю — трубка під’єднається автоматично.',
    };
  }
  if (medId === 'used_syringe') {
    return {
      ok: false,
      reason:
        'Порожній шприц: перетягніть мішок з кров’ю на тіло, щоб перелити через шприц (ризик зараження!).',
    };
  }
  return { ok: true };
}

export const MedicalModal: React.FC<MedicalModalProps> = ({
  phys,
  inventory,
  onClose,
  onOpenInventory,
  onBandageSwipe,
  onToggleTourniquet,
  onApplySplint,
  onExtractShrapnel,
  onWoundSlip,
  onSyringeStep,
  onBloodTransfusion,
  onTakeAntibiotics,
  onPerformCpr,
}) => {
  const [selectedLimb, setSelectedLimb] = useState<LimbId>('torso');
  const [armedItemUid, setArmedItemUid] = useState<string | null>(null);
  const [hoveredDropLimb, setHoveredDropLimb] = useState<LimbId | null>(null);
  const [hoveredShrapnelLimb, setHoveredShrapnelLimb] = useState<LimbId | null>(
    null,
  );
  const [noticeMsg, setNoticeMsg] = useState<{
    text: string;
    tone: 'warn' | 'ok';
  } | null>(null);

  const [activeTreatment, setActiveTreatment] =
    useState<ActiveTreatment | null>(null);

  // Pointer drag state for inventory -> body doll
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // 1. Circular Bandage Wheel state
  const wheelDragging = useRef(false);
  const lastAngle = useRef<number | null>(null);
  const wheelAccDeg = useRef(0);
  const [wheelVisualDeg, setWheelVisualDeg] = useState(0);

  // 2. Splint Mini-Game state (Step 1: align bone, Step 2: tighten 2 straps)
  const [boneOffsetX, setBoneOffsetX] = useState(34);
  const [boneAligned, setBoneAligned] = useState(false);
  const [strap1Pct, setStrap1Pct] = useState(0);
  const [strap2Pct, setStrap2Pct] = useState(0);
  const boneDragStart = useRef<{ x: number; origOffset: number } | null>(null);

  // 3. Tourniquet Mini-Game state (Step 1: strap tension, Step 2: windlass twists)
  const [tqStrapPct, setTqStrapPct] = useState(0);
  const [tqWindlassDeg, setTqWindlassDeg] = useState(0);
  const [tqReleasePct, setTqReleasePct] = useState(0);
  const tqWheelDragging = useRef(false);
  const tqLastAngle = useRef<number | null>(null);

  // 4. Tweezers Extraction Mini-Game state
  const [tweezerPos, setTweezerPos] = useState<{ x: number; y: number }>({
    x: 110,
    y: 172,
  });
  const [tweezerGrabbed, setTweezerGrabbed] = useState(false);
  const [tweezerSlipFlash, setTweezerSlipFlash] = useState(false);
  const lastSlipAt = useRef(0);
  const lastTweezerY = useRef(172);
  const canalCurveOffset = useMemo(() => {
    const seed = selectedLimb.length * 7;
    return (y: number) => 110 + Math.sin((y / 190) * Math.PI * 2 + seed) * 18;
  }, [selectedLimb]);

  // 5. Syringe Mini-Game state (Step 1: Vein Aim, Step 2: Plunger Drag)
  const [veinInserted, setVeinInserted] = useState(false);
  const [veinMissFlash, setVeinMissFlash] = useState(false);
  const [plungerProgress, setPlungerProgress] = useState(0);
  const [needleStress, setNeedleStress] = useState(0);
  const [needleSnapped, setNeedleSnapped] = useState(false);
  const plungerDragging = useRef(false);
  const lastPlungerY = useRef(0);
  const injectedSoFar = useRef(0);

  // 6. Blood Bag Transfusion Mini-Game state
  const [transfusionConduit, setTransfusionConduit] = useState<
    'tube' | 'used_syringe'
  >('tube');
  const [transfusionVeinHit, setTransfusionVeinHit] = useState(false);
  const [transfusionFlowPct, setTransfusionFlowPct] = useState(0);

  // 7. Antibiotics Blister Pack Mini-Game state
  const [abxPopped, setAbxPopped] = useState<[boolean, boolean]>([
    false,
    false,
  ]);

  // CNS / Brain-damage & Post-Wake Mini-Game Complication (tremor & swaying vein)
  const brainImpairment = Math.max(
    (100 - phys.organs.brain) / 100,
    phys.postWakeDebuffTimer > 0
      ? Math.min(0.65, 0.25 + phys.postWakeDebuffTimer * 0.05)
      : 0,
  );
  const [veinOffsetPct, setVeinOffsetPct] = useState(50);
  const hallucFrac = Math.max(0, Math.min(1, phys.hallucinationLevel / 100));
  const [medGlitchSeed, setMedGlitchSeed] = useState(1);

  useEffect(() => {
    if (phys.hallucinationLevel <= 24) return;
    const id = window.setInterval(() => {
      setMedGlitchSeed((s) => (s + 1) % 997);
    }, 300);
    return () => window.clearInterval(id);
  }, [phys.hallucinationLevel]);

  const mTxt = (str: string) =>
    hallucFrac > 0.24 ? corruptText(str, hallucFrac * 0.85, medGlitchSeed) : str;

  // CRT Phosphor-Green ECG Canvas
  const ecgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const showNotice = useCallback(
    (text: string, tone: 'warn' | 'ok' = 'warn') => {
      setNoticeMsg({ text, tone });
    },
    [],
  );

  useEffect(() => {
    if (!noticeMsg) return;
    const t = setTimeout(() => setNoticeMsg(null), 2600);
    return () => clearTimeout(t);
  }, [noticeMsg]);

  useEffect(() => {
    const canvas = ecgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let phase = 0;
    let lastT = performance.now();
    const history: number[] = new Array(150).fill(0);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      const bpm = phys.heartRateBpm;
      const freq = bpm > 0 ? bpm / 60 : 0;
      phase = (phase + dt * freq) % 1;

      let yVal = 0;
      if (phys.consciousness !== 'cardiacArrest' && bpm > 0) {
        if (phase > 0.1 && phase < 0.16) yVal = -0.18;
        else if (phase >= 0.22 && phase < 0.25) yVal = 0.22;
        else if (phase >= 0.25 && phase < 0.29) yVal = -0.95;
        else if (phase >= 0.29 && phase < 0.34) yVal = 0.36;
        else if (phase >= 0.45 && phase < 0.56) yVal = -0.26;
        if (phys.overdose === 'severe' || phys.overdose === 'lethal') {
          yVal += (Math.random() - 0.5) * 0.22;
        }
      }

      history.shift();
      history.push(yVal);

      ctx.fillStyle = '#091510';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(74, 222, 128, 0.13)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < canvas.width; gx += 16) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, canvas.height);
        ctx.stroke();
      }
      for (let gy = 0; gy < canvas.height; gy += 16) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(canvas.width, gy);
        ctx.stroke();
      }

      ctx.strokeStyle =
        phys.consciousness === 'cardiacArrest'
          ? '#ef4444'
          : phys.overdose !== 'none'
            ? '#f59e0b'
            : '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const mid = canvas.height * 0.58;
      history.forEach((v, idx) => {
        const px = (idx / (history.length - 1)) * canvas.width;
        const py = mid + v * (canvas.height * 0.42);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phys.heartRateBpm, phys.consciousness, phys.overdose]);

  const backpackMeds = useMemo(
    () =>
      inventory.backpack.items.filter(
        (it): it is GridInventoryItem & { medId: MedItemId } =>
          it.category === 'med' && Boolean(it.medId),
      ),
    [inventory.backpack.items],
  );

  const resetMiniGameStates = useCallback((medId: MedItemId) => {
    // Bandage
    wheelDragging.current = false;
    lastAngle.current = null;
    wheelAccDeg.current = 0;
    setWheelVisualDeg(0);
    // Splint
    setBoneOffsetX(Math.random() > 0.5 ? 34 : -34);
    setBoneAligned(false);
    setStrap1Pct(0);
    setStrap2Pct(0);
    // Tourniquet
    setTqStrapPct(0);
    setTqWindlassDeg(0);
    setTqReleasePct(0);
    // Tweezers
    setTweezerPos({ x: 110, y: 172 });
    setTweezerGrabbed(false);
    setTweezerSlipFlash(false);
    lastTweezerY.current = 172;
    // Syringe
    setVeinInserted(false);
    setVeinMissFlash(false);
    setPlungerProgress(0);
    setNeedleStress(0);
    setNeedleSnapped(false);
    plungerDragging.current = false;
    injectedSoFar.current = 0;
    // Transfusion
    setTransfusionConduit(
      inventory.meds.transfusion_tube > 0 ? 'tube' : 'used_syringe',
    );
    setTransfusionVeinHit(false);
    setTransfusionFlowPct(0);
    // Antibiotics
    setAbxPopped([false, false]);
    setVeinOffsetPct(50);
    void medId;
  }, [inventory.meds.transfusion_tube]);

  // Animate vein swaying + hand tremor when brain is injured or during post-wake disorientation
  useEffect(() => {
    if (!activeTreatment || brainImpairment <= 0.16) {
      setVeinOffsetPct(50);
      return;
    }
    const isVeinStage =
      (SYRINGE_IDS.includes(activeTreatment.medId) && !veinInserted) ||
      (activeTreatment.medId === 'blood_bag' && !transfusionVeinHit);
    const isTremorStage =
      (activeTreatment.medId === 'tweezers' && tweezerGrabbed) ||
      (activeTreatment.medId === 'splint' && !boneAligned);

    if (!isVeinStage && !isTremorStage) return;

    const id = window.setInterval(() => {
      const now = performance.now() / 1000;
      if (isVeinStage) {
        const amp = Math.min(26, 8 + brainImpairment * 22);
        setVeinOffsetPct(50 + Math.sin(now * 3.1) * amp);
      }
      if (activeTreatment.medId === 'tweezers' && tweezerGrabbed) {
        const jx = (Math.random() - 0.5) * (brainImpairment * 7.5);
        setTweezerPos((p) => ({
          x: Math.max(28, Math.min(192, p.x + jx)),
          y: p.y,
        }));
      }
      if (activeTreatment.medId === 'splint' && !boneAligned && !boneDragStart.current) {
        const jx = (Math.random() - 0.5) * (brainImpairment * 5.2);
        setBoneOffsetX((x) => Math.max(-50, Math.min(50, x + jx)));
      }
    }, 65);
    return () => window.clearInterval(id);
  }, [
    activeTreatment,
    brainImpairment,
    veinInserted,
    transfusionVeinHit,
    tweezerGrabbed,
    boneAligned,
  ]);

  const tryStartTreatment = useCallback(
    (item: GridInventoryItem, limbId: LimbId) => {
      if (!item.medId) return;
      setSelectedLimb(limbId);
      const check = isTreatmentValid(item.medId, limbId, phys, inventory);
      if (!check.ok) {
        showNotice(check.reason ?? 'Дія неможлива', 'warn');
        return;
      }
      setArmedItemUid(null);
      resetMiniGameStates(item.medId);
      setActiveTreatment({ item, medId: item.medId, limbId });
    },
    [inventory, phys, resetMiniGameStates, showNotice],
  );

  // Unified pointer drag for inventory med cards -> anatomical doll limbs
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const dist = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY);
      const moved = cur.moved || dist > 8;
      const next: DragState = {
        ...cur,
        curX: e.clientX,
        curY: e.clientY,
        moved,
      };
      dragRef.current = next;
      setDragState(next);

      if (moved) {
        setHoveredDropLimb(getLimbFromPoint(e.clientX, e.clientY));
      }
    };

    const onUp = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      dragRef.current = null;
      setDragState(null);

      if (cur.moved) {
        const dropLimb = getLimbFromPoint(e.clientX, e.clientY);
        setHoveredDropLimb(null);
        if (dropLimb) {
          tryStartTreatment(cur.item, dropLimb);
        }
      } else {
        // Quick tap/click arms item so player can tap any limb on the doll
        setArmedItemUid((prev) => (prev === cur.item.uid ? null : cur.item.uid));
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [tryStartTreatment]);

  const handleMedCardPointerDown = (
    item: GridInventoryItem,
    e: React.PointerEvent,
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const initial: DragState = {
      item,
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      moved: false,
    };
    dragRef.current = initial;
    setDragState(initial);
  };

  const handleLimbClick = (limbId: LimbId) => {
    setSelectedLimb(limbId);
    if (armedItemUid) {
      const armed = backpackMeds.find((m) => m.uid === armedItemUid);
      if (armed) {
        tryStartTreatment(armed, limbId);
      } else {
        setArmedItemUid(null);
      }
    }
  };

  const handleDirectShrapnelClick = (limbId: LimbId) => {
    setSelectedLimb(limbId);
    const tweezersItem = backpackMeds.find((m) => m.medId === 'tweezers');
    if (!tweezersItem) {
      showNotice('Потрібен хірургічний пінцет у рюкзаку!', 'warn');
      return;
    }
    tryStartTreatment(tweezersItem, limbId);
  };

  // Close active bandage mini-game automatically if that specific roll ran empty
  const activeItemInBag = activeTreatment
    ? backpackMeds.find((m) => m.uid === activeTreatment.item.uid)
    : undefined;

  useEffect(() => {
    if (!activeTreatment) return;
    if (
      activeTreatment.medId === 'bandage' &&
      (!activeItemInBag || activeItemInBag.conditionPct <= 0.5)
    ) {
      showNotice('Цей рулон бинта використано повністю.', 'ok');
      setActiveTreatment(null);
    }
  }, [activeTreatment, activeItemInBag, showNotice]);

  // --- MINI-GAME HANDLERS ---

  // 1. Circular Bandage Wheel
  const getWheelAngle = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.atan2(
      e.clientY - (rect.top + rect.height / 2),
      e.clientX - (rect.left + rect.width / 2),
    );
  };

  const handleWheelDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeTreatment) return;
    wheelDragging.current = true;
    lastAngle.current = getWheelAngle(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleWheelMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wheelDragging.current || lastAngle.current === null || !activeTreatment)
      return;
    const ang = getWheelAngle(e);
    let delta = ang - lastAngle.current;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    lastAngle.current = ang;

    const absDeg = Math.abs((delta * 180) / Math.PI);
    wheelAccDeg.current += absDeg;
    setWheelVisualDeg((d) => (d + (delta * 180) / Math.PI) % 360);

    if (wheelAccDeg.current >= 26) {
      const pctGain = Math.min(12, wheelAccDeg.current * 0.22);
      wheelAccDeg.current = 0;
      onBandageSwipe(
        activeTreatment.limbId,
        pctGain,
        activeTreatment.item.uid,
      );
    }
  };

  const handleWheelUp = () => {
    wheelDragging.current = false;
    lastAngle.current = null;
  };

  // 2. Splint Mini-Game (Bone Alignment + Straps)
  const handleBoneDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (boneAligned) return;
    boneDragStart.current = { x: e.clientX, origOffset: boneOffsetX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleBoneMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!boneDragStart.current || boneAligned) return;
    const dx = e.clientX - boneDragStart.current.x;
    const next = Math.max(-55, Math.min(55, boneDragStart.current.origOffset + dx));
    if (Math.abs(next) <= 6) {
      setBoneOffsetX(0);
      setBoneAligned(true);
      boneDragStart.current = null;
    } else {
      setBoneOffsetX(next);
    }
  };

  const handleBoneUp = () => {
    boneDragStart.current = null;
  };

  const handleStrapDrag = (
    strapIdx: 1 | 2,
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!boneAligned || !activeTreatment) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(
      0,
      Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)),
    );
    const nextS1 = strapIdx === 1 ? (pct >= 90 ? 100 : pct) : strap1Pct;
    const nextS2 = strapIdx === 2 ? (pct >= 90 ? 100 : pct) : strap2Pct;
    if (strapIdx === 1) setStrap1Pct(nextS1);
    else setStrap2Pct(nextS2);

    if (nextS1 === 100 && nextS2 === 100) {
      onApplySplint(activeTreatment.limbId, activeTreatment.item.uid);
      showNotice(
        `Шину накладено на ${LIMB_META[activeTreatment.limbId].nameUk}!`,
        'ok',
      );
      setActiveTreatment(null);
    }
  };

  // 3. Tourniquet Windlass Mini-Game
  const completeTourniquetApply = useCallback(
    (treatment: ActiveTreatment) => {
      onToggleTourniquet(treatment.limbId, treatment.item.uid);
      showNotice(
        `Турнікет затягнуто на ${LIMB_META[treatment.limbId].nameUk}!`,
        'ok',
      );
      setActiveTreatment(null);
    },
    [onToggleTourniquet, showNotice],
  );

  const handleTqWindlassMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tqWheelDragging.current || tqLastAngle.current === null || !activeTreatment)
      return;
    const ang = getWheelAngle(e);
    let delta = ang - tqLastAngle.current;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    tqLastAngle.current = ang;

    const addDeg = Math.abs((delta * 180) / Math.PI);
    setTqWindlassDeg((prev) => {
      const next = prev + addDeg;
      if (next >= 1080) {
        tqWheelDragging.current = false;
        tqLastAngle.current = null;
        completeTourniquetApply(activeTreatment);
        return 1080;
      }
      return next;
    });
  };

  // 4. Tweezers Extraction Mini-Game
  const handleTweezersMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!tweezerGrabbed || !activeTreatment) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(
      24,
      Math.min(196, ((e.clientX - rect.left) / rect.width) * 220),
    );
    const ny = Math.max(
      18,
      Math.min(182, ((e.clientY - rect.top) / rect.height) * 200),
    );

    const safeCenterX = canalCurveOffset(ny);
    const jumpUp = lastTweezerY.current - ny;
    lastTweezerY.current = ny;

    // Wall hit or violent yank penalty
    const hitWall = Math.abs(nx - safeCenterX) > 22;
    const violentPull = jumpUp > 24;
    if (hitWall || violentPull) {
      const now = performance.now();
      if (now - lastSlipAt.current > 480) {
        lastSlipAt.current = now;
        onWoundSlip(activeTreatment.limbId);
        setTweezerSlipFlash(true);
        setTimeout(() => setTweezerSlipFlash(false), 380);
      }
      // Push gently back toward canal center & slight downward slip
      setTweezerPos({
        x: safeCenterX + Math.sign(nx - safeCenterX) * 14,
        y: Math.min(176, ny + 8),
      });
      return;
    }

    setTweezerPos({ x: nx, y: ny });

    // Extracted cleanly at the wound exit!
    if (ny <= 30) {
      setTweezerGrabbed(false);
      const remainingBefore = phys.limbs[activeTreatment.limbId].shrapnel;
      onExtractShrapnel(activeTreatment.limbId);
      if (remainingBefore <= 1) {
        showNotice('Усі уламки чисто витягнуто!', 'ok');
        setActiveTreatment(null);
      } else {
        showNotice(`Уламок витягнуто! Залишилось: ${remainingBefore - 1}`, 'ok');
        setTweezerPos({ x: 110, y: 172 });
        lastTweezerY.current = 172;
      }
    }
  };

  // 5. Syringe Vein Aim + Plunger Drag
  const handleVeinAimClick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (veinInserted) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * 100;
    const ry = ((e.clientY - rect.top) / rect.height) * 100;
    const halfBand = Math.max(8, 16 - brainImpairment * 6.5);
    if (
      rx >= 22 &&
      rx <= 78 &&
      ry >= veinOffsetPct - halfBand &&
      ry <= veinOffsetPct + halfBand
    ) {
      setVeinInserted(true);
      setVeinMissFlash(false);
    } else {
      setVeinMissFlash(true);
      setTimeout(() => setVeinMissFlash(false), 380);
      showNotice('Промах! Поцільте голкою прямо у синю вену.', 'warn');
    }
  };

  const handlePlungerDown = (e: React.PointerEvent) => {
    if (!activeTreatment || !veinInserted || needleSnapped || plungerProgress >= 1)
      return;
    plungerDragging.current = true;
    lastPlungerY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePlungerMove = (e: React.PointerEvent) => {
    if (
      !plungerDragging.current ||
      !activeTreatment ||
      needleSnapped ||
      plungerProgress >= 1
    )
      return;
    const dy = e.clientY - lastPlungerY.current;
    lastPlungerY.current = e.clientY;
    if (dy <= 0) {
      setNeedleStress((s) => Math.max(0, s - 0.08));
      return;
    }

    const stressThreshold = Math.max(9, 15 - brainImpairment * 5);
    const tremorBoost = 1 + brainImpairment * 0.7;
    const speedStress =
      dy > stressThreshold
        ? (dy - (stressThreshold - 1)) * 0.042 * tremorBoost
        : -0.04;
    const nextStress = Math.max(0, Math.min(1.1, needleStress + speedStress));
    setNeedleStress(nextStress);

    if (nextStress >= 1.0) {
      setNeedleSnapped(true);
      plungerDragging.current = false;
      onSyringeStep(
        activeTreatment.medId,
        activeTreatment.limbId,
        0,
        false,
        true,
        activeTreatment.item.uid,
      );
      return;
    }

    const deltaFrac = Math.min(0.25, dy / 170);
    const nextProg = Math.min(1, plungerProgress + deltaFrac);
    const actualDelta = nextProg - injectedSoFar.current;
    if (actualDelta >= 0.04 || nextProg >= 1) {
      injectedSoFar.current = nextProg;
      setPlungerProgress(nextProg);
      const finished = nextProg >= 0.99;
      onSyringeStep(
        activeTreatment.medId,
        activeTreatment.limbId,
        actualDelta,
        finished,
        false,
        activeTreatment.item.uid,
      );
      if (finished) {
        plungerDragging.current = false;
        showNotice(
          `${MED_ITEM_DEFS[activeTreatment.medId].nameUk} повністю введено!`,
          'ok',
        );
        setActiveTreatment(null);
      }
    }
  };

  const handlePlungerUp = () => {
    plungerDragging.current = false;
    setNeedleStress(0);
  };

  const finishPartialSyringe = () => {
    if (!activeTreatment) return;
    if (injectedSoFar.current > 0 && plungerProgress < 1 && !needleSnapped) {
      onSyringeStep(
        activeTreatment.medId,
        activeTreatment.limbId,
        0,
        true,
        false,
        activeTreatment.item.uid,
      );
    }
    setActiveTreatment(null);
  };

  // Derived stats for display
  const limb = phys.limbs[selectedLimb];
  const bleedMlSec = getEffectiveLimbBleed(phys, limb);
  const totalBleedMlSec = (Object.keys(phys.limbs) as LimbId[]).reduce(
    (sum, k) => sum + getEffectiveLimbBleed(phys, phys.limbs[k]),
    0,
  );
  const totalBleedLMin = ((totalBleedMlSec + phys.internalBleedRate) * 60) / 1000;
  const limbBleedLMin = (bleedMlSec * 60) / 1000;
  const bloodPct = Math.round((phys.bloodVolumeMl / phys.maxBloodMl) * 100);
  const diastolicBp = Math.round(phys.systolicBp * 0.65);

  const limbFillColor = (id: LimbId) => {
    const l = phys.limbs[id];
    if (l.severed) return '#280608';
    const b = getEffectiveLimbBleed(phys, l);
    if (b > 4.5) return '#b91c1c';
    if (b > 0.4 || l.fractured || l.shrapnel > 0) return '#991b1b';
    if (l.skin < 75 || l.muscle < 75) return '#92400e';
    return '#7f1d1d';
  };

  const limbStrokeColor = (id: LimbId) => {
    if (hoveredDropLimb === id && dragState?.moved && dragState.item.medId) {
      return isTreatmentValid(dragState.item.medId, id, phys, inventory).ok
        ? '#38bdf8'
        : '#ef4444';
    }
    if (selectedLimb === id) return '#4ade80';
    return '#ffffff';
  };

  const limbStrokeWidth = (id: LimbId) => {
    if (hoveredDropLimb === id && dragState?.moved) return 4;
    if (selectedLimb === id) return 3.5;
    return 2;
  };

  // Armed item or dragged item for helper banner
  const armedItem = armedItemUid
    ? backpackMeds.find((m) => m.uid === armedItemUid) ?? null
    : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-3 pointer-events-auto overflow-y-auto"
      style={{
        background:
          'radial-gradient(circle at 52% 48%, rgba(28, 6, 8, 0.72) 20%, rgba(10, 4, 6, 0.93) 100%)',
      }}
    >
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch my-auto">
        {/* LEFT COLUMN: UNI-HEALTH v2.09 CRT Phosphor-Green Monitor */}
        <div className="lg:col-span-4 rounded-sm bg-[#232930] border-2 border-[#47515c] p-2 shadow-2xl flex flex-col gap-1.5 font-mono-num">
          <div className="bg-[#0a1611] border border-[#3a4a42] px-2.5 py-1.5 text-[#4ade80]">
            <div className="text-[13px] font-extrabold tracking-widest leading-none">
              {mTxt('EXPERIMENT')}
            </div>
            <div className="text-[11px] text-[#34d399] mt-0.5">
              {mTxt('176cm | 24y | #26761')}
            </div>
          </div>

          <div
            className="bg-[#091510] border border-[#3a4a42] p-2.5 text-[#4ade80] flex flex-col gap-2"
            style={{
              backgroundImage:
                'linear-gradient(rgba(74, 222, 128, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(74, 222, 128, 0.05) 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }}
          >
            <div className="text-center text-xs font-bold tracking-widest border-b border-dashed border-[#4ade80]/30 pb-1">
              {mTxt('UNI-HEALTH v2.09')}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold">
                  🧠 СВІД: {Math.round(phys.consciousnessPct)}
                </span>
                <span>{Math.round(phys.organHealth)}%+ ОРГ</span>
              </div>
              <div className="h-2 bg-[#040a07] border border-[#4ade80]/50 p-[1px]">
                <div
                  className={`h-full transition-all ${
                    phys.consciousnessPct < 35 ? 'bg-red-500' : 'bg-[#4ade80]'
                  }`}
                  style={{
                    width: `${Math.max(0, Math.min(100, phys.consciousnessPct))}%`,
                  }}
                />
              </div>
            </div>

            <div className="border-t border-b border-dashed border-[#4ade80]/30 py-1.5 grid grid-cols-12 gap-1 items-center text-[11px]">
              <div className="col-span-8 space-y-0.5">
                <div className="font-bold">
                  🩸 {(phys.bloodVolumeMl / 1000).toFixed(2)}L | {bloodPct}%
                </div>
                <div
                  className={`font-bold ${
                    totalBleedLMin > 0.02 ? 'text-red-400' : 'text-[#4ade80]/75'
                  }`}
                >
                  💧 {totalBleedLMin.toFixed(2)}L/m
                  {phys.internalBleedRate > 0.2 ? ' (ВНУТР!)' : ''}
                </div>
              </div>
              <div className="col-span-4 text-right">
                <div
                  className={`text-[10px] font-bold ${
                    phys.infectionPhase === 2
                      ? 'text-lime-400 animate-pulse'
                      : 'text-[#34d399]'
                  }`}
                >
                  {phys.infectionPhase === 2
                    ? `☣ ІНФ.Ф2 ${Math.round(phys.sepsis)}%`
                    : 'СЕПСИС 0%'}
                </div>
                <div
                  className={`text-xs font-bold ${
                    phys.temperatureC < 35
                      ? 'text-cyan-300'
                      : phys.temperatureC >= 38.4 && phys.infectionPhase === 2
                        ? 'text-amber-300'
                        : 'text-[#4ade80]'
                  }`}
                >
                  🌡 {phys.temperatureC.toFixed(1)}°C
                </div>
              </div>
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span>ШОК / SHOCK</span>
                <span
                  className={
                    phys.shockLevel > 50 ? 'text-red-400 font-bold' : ''
                  }
                >
                  {Math.round(phys.shockLevel)}%
                </span>
              </div>
              <div className="h-1.5 bg-[#040a07] border border-[#4ade80]/40">
                <div
                  className="h-full bg-[#4ade80]"
                  style={{ width: `${Math.max(0, 100 - phys.shockLevel)}%` }}
                />
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <span>🛡 ІМУНІТЕТ / IMMUNITY</span>
                <span
                  className={
                    phys.immunityPct < 35
                      ? 'text-red-400 font-bold'
                      : phys.immunityPct < 65
                        ? 'text-amber-300 font-bold'
                        : 'text-[#4ade80] font-bold'
                  }
                >
                  {Math.round(phys.immunityPct)}%
                  {phys.antibioticLevel > 2 ? ' · АБХ' : ''}
                  {phys.immunityBoostTimer > 0 ? ' · ІМУН+' : ''}
                </span>
              </div>
              <div className="h-1.5 bg-[#040a07] border border-[#4ade80]/40">
                <div
                  className={`h-full ${
                    phys.immunityPct < 35
                      ? 'bg-red-500'
                      : phys.immunityPct < 65
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, phys.immunityPct))}%` }}
                />
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <span>БІЛЬ / PAIN: {Math.round(phys.pain)}%</span>
                <span>⚖ {inventory.totalWeightKg.toFixed(1)}kg</span>
              </div>
            </div>

            <div className="border-t border-b border-dashed border-[#4ade80]/30 py-1.5 flex items-center justify-between text-[11px]">
              <div>
                <div className="font-bold">
                  🫁 ЛЕГЕНІ {Math.round(phys.lungCapacityPct)}%
                </div>
                <div>{Math.round(phys.respRate)}/m resp</div>
              </div>
              <div className="text-right">
                <div
                  className={`font-bold ${
                    phys.overdose !== 'none'
                      ? 'text-amber-300'
                      : 'text-[#4ade80]'
                  }`}
                >
                  ☣ ТОКС {Math.round(phys.toxicity)}%
                </div>
                <div className="text-[10px]">
                  {phys.overdose !== 'none'
                    ? `OD: ${phys.overdose.toUpperCase()}`
                    : 'OK'}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span>
                  ♥ {Math.round(phys.heartRateBpm)} |{' '}
                  {Math.round(phys.systolicBp)}/{diastolicBp}
                </span>
                <span>{Math.round(phys.oxygenPct)}% O₂</span>
              </div>
              <canvas
                ref={ecgCanvasRef}
                width={300}
                height={52}
                className="w-full h-[52px] border border-[#4ade80]/35"
              />
            </div>

            {/* 5-Organ Telemetry Grid */}
            <div className="border-t border-dashed border-[#4ade80]/30 pt-1.5 space-y-1 text-[10px]">
              <div className="flex items-center justify-between font-bold text-[#34d399]">
                <span>ОРГАНИ / ORGANS (ПОВІЛЬНЕ ВІДН.)</span>
                <span>{Math.round(phys.organHealth)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {(
                  [
                    ['brain', 'МОЗОК', phys.organs.brain < 82 ? 'ГАЛЮЦ' : 'OK'],
                    ['heart', 'СЕРЦЕ', phys.organs.heart < 75 ? 'АРИТМ' : 'OK'],
                    ['lungs', 'ЛЕГЕНІ', phys.organs.lungs < 80 ? 'ГІПОКС' : 'OK'],
                    ['liver', 'ПЕЧІНКА', phys.organs.liver < 75 ? 'ТОКС' : 'OK'],
                    ['kidneys', 'НИРКИ', phys.organs.kidneys < 75 ? 'ФІЛЬТР' : 'OK'],
                  ] as const
                ).map(([oid, label, tag]) => {
                  const val = Math.round(phys.organs[oid]);
                  const barCls =
                    val < 42
                      ? 'bg-red-500'
                      : val < 75
                        ? 'bg-amber-400'
                        : 'bg-[#4ade80]';
                  const textCls =
                    val < 42
                      ? 'text-red-400'
                      : val < 75
                        ? 'text-amber-300'
                        : 'text-[#4ade80]';
                  return (
                    <div key={oid} className="space-y-0.5">
                      <div className={`flex justify-between font-bold ${textCls}`}>
                        <span>
                          {mTxt(`${label}${tag !== 'OK' ? ` · ${tag}` : ''}`)}
                        </span>
                        <span>{val}%</span>
                      </div>
                      <div className="h-1 bg-[#040a07] border border-[#4ade80]/30">
                        <div className={`h-full ${barCls}`} style={{ width: `${val}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom CRT Sub-Panel: Selected Limb */}
          <div className="bg-[#091510] border border-[#3a4a42] p-2.5 text-[#4ade80] text-[11px]">
            <div className="text-center font-bold tracking-wider border-b border-dashed border-[#4ade80]/30 pb-1 mb-1.5 uppercase">
              {mTxt(`${LIMB_META[selectedLimb].nameEn} · ${LIMB_META[selectedLimb].nameUk}`)}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-[#040a07] border border-[#4ade80]/50">
                  <div
                    className="h-full bg-[#4ade80]"
                    style={{ width: `${Math.max(0, limb.skin)}%` }}
                  />
                </div>
                <span className="w-14 text-right font-bold">
                  {Math.round(limb.skin)} +
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-[#040a07] border border-[#4ade80]/50">
                  <div
                    className="h-full bg-[#4ade80]"
                    style={{ width: `${Math.max(0, limb.muscle)}%` }}
                  />
                </div>
                <span className="w-14 text-right font-bold">
                  {Math.round(limb.muscle)} 🛡
                </span>
              </div>
            </div>

            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-amber-300">
                {limb.shrapnel > 0 ? `Уламки: ${limb.shrapnel}` : 'Уламки: -'}
                {limb.fractured
                  ? limb.splinted
                    ? ' · Шина'
                    : ' · ПЕРЕЛОМ!'
                  : ''}
                {limb.tourniquet
                  ? ` · Турнікет ${Math.round(limb.tourniquetTime)}s`
                  : ''}
              </span>
              <span
                className={
                  limbBleedLMin > 0.01 ? 'text-red-400 font-bold' : ''
                }
              >
                {limbBleedLMin.toFixed(2)} L/m 💧
              </span>
            </div>

            {limb.tourniquet && (
              <button
                type="button"
                onClick={() => onToggleTourniquet(selectedLimb)}
                className="mt-2 w-full min-h-[34px] px-2 py-1 rounded bg-amber-600/90 hover:bg-amber-500 text-white text-[11px] font-bold cursor-pointer"
              >
                Зняти турнікет з «{LIMB_META[selectedLimb].nameUk}»
              </button>
            )}
          </div>
        </div>

        {/* CENTER COLUMN: Always-Visible Anatomical Doll OR Active Treatment Mini-Game */}
        <div className="lg:col-span-4 flex flex-col justify-between items-center gap-2 py-1 relative">
          {/* Top Controls */}
          <div className="w-full flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onOpenInventory}
              className="min-h-[44px] px-3 rounded bg-[#18202a]/95 hover:bg-[#232e3d] border border-sky-400/40 text-sky-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Backpack className="w-4 h-4" />
              <span>Рюкзак (I)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-3 rounded bg-[#1b2028]/95 hover:bg-[#28303c] border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Закрити (Tab)</span>
            </button>
          </div>

          {(phys.consciousness === 'cardiacArrest' ||
            phys.consciousness === 'unconscious' ||
            phys.consciousnessPct < 45) && (
            <div className="w-full px-3 py-2 rounded bg-red-950/92 border border-red-500/70 flex items-center justify-between gap-2 text-xs text-red-100">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  {phys.consciousness === 'cardiacArrest'
                    ? `ЗУПИНКА СЕРЦЯ (${Math.max(0, Math.ceil(16 - phys.cardiacArrestTimer))}с)`
                    : 'Критичний шок / непритомність!'}
                </span>
              </div>
              <button
                type="button"
                onClick={onPerformCpr}
                className="min-h-[36px] px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>CPR</span>
              </button>
            </div>
          )}

          {phys.overdose !== 'none' && (
            <div className="w-full px-3 py-1.5 rounded bg-purple-950/90 border border-purple-400/60 text-xs text-purple-100 font-semibold text-center">
              ПЕРЕДОЗ: {phys.overdoseReason} — введіть Налоксон!
            </div>
          )}

          {noticeMsg && (
            <div
              className={`w-full px-3 py-1.5 rounded border text-xs font-semibold text-center ${
                noticeMsg.tone === 'ok'
                  ? 'bg-emerald-950/90 border-emerald-400/60 text-emerald-100'
                  : 'bg-amber-950/92 border-amber-400/70 text-amber-100'
              }`}
            >
              {noticeMsg.text}
            </div>
          )}

          {/* CENTER BODY DOLL — ALWAYS VISIBLE UNLESS INSIDE A DROPPED MINI-GAME */}
          {!activeTreatment ? (
            <div className="relative flex flex-col items-center justify-center w-full flex-1 bg-[#0a0d12]/65 border border-white/10 rounded p-2">
              {/* Target / Armed / Shrapnel prompt above doll */}
              <div className="min-h-[28px] flex items-center justify-center mb-1">
                {dragState?.moved && hoveredDropLimb && dragState.item.medId ? (
                  <div
                    className={`px-3 py-1 rounded border text-xs font-bold shadow ${
                      isTreatmentValid(
                        dragState.item.medId,
                        hoveredDropLimb,
                        phys,
                        inventory,
                      ).ok
                        ? 'bg-sky-950/95 border-sky-400 text-sky-100'
                        : 'bg-red-950/95 border-red-400 text-red-100'
                    }`}
                  >
                    {isTreatmentValid(
                      dragState.item.medId,
                      hoveredDropLimb,
                      phys,
                      inventory,
                    ).ok
                      ? `Застосувати на: ${LIMB_META[hoveredDropLimb].nameUk}`
                      : isTreatmentValid(
                          dragState.item.medId,
                          hoveredDropLimb,
                          phys,
                          inventory,
                        ).reason}
                  </div>
                ) : armedItem ? (
                  <div className="px-3 py-1 rounded bg-sky-950/90 border border-sky-400/70 text-xs font-semibold text-sky-100">
                    Обрано: <span className="font-bold">{armedItem.nameUk}</span> — натисніть на частину тіла
                  </div>
                ) : hoveredShrapnelLimb &&
                  phys.limbs[hoveredShrapnelLimb].shrapnel > 0 ? (
                  <div className="px-2.5 py-1 rounded bg-[#0c1015] border border-white/70 text-xs font-bold text-white shadow-lg">
                    Витягти уламок / Remove shrapnel (
                    {phys.limbs[hoveredShrapnelLimb].shrapnel})
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-300 text-center">
                    Перетягніть предмет з рюкзака справа на потрібну частину тіла
                  </div>
                )}
              </div>

              <svg
                viewBox="0 0 220 290"
                className="w-60 h-72 sm:w-64 sm:h-80 select-none touch-none"
              >
                {/* Head */}
                <rect
                  data-limb-id="head"
                  x="88"
                  y="14"
                  width="44"
                  height="46"
                  rx="14"
                  fill={limbFillColor('head')}
                  stroke={limbStrokeColor('head')}
                  strokeWidth={limbStrokeWidth('head')}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleLimbClick('head')}
                />
                {/* Torso */}
                <rect
                  data-limb-id="torso"
                  x="76"
                  y="66"
                  width="68"
                  height="92"
                  rx="12"
                  fill={limbFillColor('torso')}
                  stroke={limbStrokeColor('torso')}
                  strokeWidth={limbStrokeWidth('torso')}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleLimbClick('torso')}
                />
                {/* Right Arm (viewer left) */}
                <rect
                  data-limb-id="rightArm"
                  x="22"
                  y="72"
                  width="48"
                  height="28"
                  rx="9"
                  fill={limbFillColor('rightArm')}
                  stroke={limbStrokeColor('rightArm')}
                  strokeWidth={limbStrokeWidth('rightArm')}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleLimbClick('rightArm')}
                />
                <rect
                  data-limb-id="rightArm"
                  x="18"
                  y="102"
                  width="28"
                  height="52"
                  rx="9"
                  fill={limbFillColor('rightArm')}
                  stroke={limbStrokeColor('rightArm')}
                  strokeWidth={limbStrokeWidth('rightArm')}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleLimbClick('rightArm')}
                />
                {/* Left Arm (viewer right) */}
                <rect
                  data-limb-id="leftArm"
                  x="150"
                  y="72"
                  width="48"
                  height="28"
                  rx="9"
                  fill={limbFillColor('leftArm')}
                  stroke={limbStrokeColor('leftArm')}
                  strokeWidth={limbStrokeWidth('leftArm')}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleLimbClick('leftArm')}
                />
                <rect
                  data-limb-id="leftArm"
                  x="174"
                  y="102"
                  width="28"
                  height="52"
                  rx="9"
                  fill={limbFillColor('leftArm')}
                  stroke={limbStrokeColor('leftArm')}
                  strokeWidth={limbStrokeWidth('leftArm')}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleLimbClick('leftArm')}
                />
                {/* Right Leg */}
                <rect
                  data-limb-id="rightLeg"
                  x="76"
                  y="164"
                  width="31"
                  height="112"
                  rx="10"
                  fill={limbFillColor('rightLeg')}
                  stroke={limbStrokeColor('rightLeg')}
                  strokeWidth={limbStrokeWidth('rightLeg')}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleLimbClick('rightLeg')}
                />
                {/* Left Leg */}
                <rect
                  data-limb-id="leftLeg"
                  x="113"
                  y="164"
                  width="31"
                  height="112"
                  rx="10"
                  fill={limbFillColor('leftLeg')}
                  stroke={limbStrokeColor('leftLeg')}
                  strokeWidth={limbStrokeWidth('leftLeg')}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleLimbClick('leftLeg')}
                />

                {/* On-Limb Bandages, Splints, Tourniquets, Droplets & Shrapnel */}
                {(Object.keys(LIMB_SHRAPNEL_ANCHORS) as LimbId[]).map(
                  (lid) => {
                    const pt = LIMB_SHRAPNEL_ANCHORS[lid];
                    const l = phys.limbs[lid];
                    const b = getEffectiveLimbBleed(phys, l);
                    return (
                      <g key={lid}>
                        {l.bandageCoverage > 15 && (
                          <rect
                            x={pt.x - 14}
                            y={pt.y - 6}
                            width="28"
                            height="12"
                            rx="3"
                            fill="#e2e8f0"
                            stroke="#334155"
                            strokeWidth="1.5"
                            className="pointer-events-none"
                          />
                        )}
                        {l.splinted && (
                          <rect
                            x={pt.x - 12}
                            y={pt.y + 7}
                            width="24"
                            height="6"
                            rx="2"
                            fill="#0ea5e9"
                            stroke="#e0f2fe"
                            strokeWidth="1"
                            className="pointer-events-none"
                          />
                        )}
                        {l.tourniquet && (
                          <rect
                            x={pt.x - 15}
                            y={pt.y - 16}
                            width="30"
                            height="7"
                            rx="2"
                            fill="#f59e0b"
                            stroke="#000"
                            strokeWidth="1"
                            className="pointer-events-none"
                          />
                        )}
                        {b > 0.35 && (
                          <path
                            d={`M ${pt.x} ${pt.y + 8} C ${pt.x - 8} ${pt.y + 22}, ${pt.x + 8} ${pt.y + 22}, ${pt.x} ${pt.y + 8} Z`}
                            fill="#eab308"
                            stroke="#000000"
                            strokeWidth="1.5"
                            className="pointer-events-none"
                          />
                        )}
                        {l.shrapnel > 0 && (
                          <g
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredShrapnelLimb(lid)}
                            onMouseLeave={() => setHoveredShrapnelLimb(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirectShrapnelClick(lid);
                            }}
                          >
                            <polygon
                              points={`${pt.x - 11},${pt.y - 6} ${pt.x},${pt.y - 13} ${pt.x + 12},${pt.y - 4} ${pt.x + 9},${pt.y + 9} ${pt.x - 5},${pt.y + 11} ${pt.x - 13},${pt.y + 3}`}
                              fill="#92400e"
                              stroke="#1c1917"
                              strokeWidth="2"
                            />
                            <text
                              x={pt.x}
                              y={pt.y + 3}
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight="bold"
                              fill="#fef3c7"
                            >
                              {l.shrapnel}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  },
                )}
              </svg>

              <div className="text-[11px] text-slate-400 text-center">
                Клік по уламку на тілі запускає витягування пінцетом
              </div>
            </div>
          ) : (
            /* ACTIVE INTERACTIVE MINI-GAME PANEL FOR (item, limbId) */
            <div
              className="w-full flex-1 flex flex-col justify-between gap-2.5 bg-[#0b0f16] border-2 border-sky-400/50 rounded p-3 shadow-2xl"
              style={
                brainImpairment > 0.28
                  ? {
                      filter: `blur(${Math.min(1.1, (brainImpairment - 0.25) * 1.4).toFixed(2)}px)`,
                    }
                  : undefined
              }
            >
              {/* Mini-Game Header */}
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MedItemIcon
                    medId={activeTreatment.medId}
                    className="w-8 h-8 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {MED_ITEM_DEFS[activeTreatment.medId].nameUk}
                    </div>
                    <div className="text-[11px] text-sky-300 font-semibold truncate">
                      Ціль: {LIMB_META[activeTreatment.limbId].nameUk} (
                      {LIMB_META[activeTreatment.limbId].nameEn})
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTreatment(null)}
                  className="min-h-[36px] px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs text-white font-semibold cursor-pointer shrink-0"
                >
                  Назад
                </button>
              </div>

              {brainImpairment > 0.18 && (
                <div className="px-2.5 py-1 rounded bg-amber-950/85 border border-amber-400/50 text-[11px] text-amber-200 text-center font-semibold">
                  ⚠ Порушення ЦНС: тремор рук і дрейф вени!
                </div>
              )}

              {/* 1. BANDAGE CIRCULAR WINDING MINI-GAME */}
              {activeTreatment.medId === 'bandage' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="text-center text-xs text-slate-200 leading-snug">
                    Натисніть і <span className="text-amber-300 font-bold">водіть по колу</span>, щоб перев’язати рану
                  </div>
                  <div className="px-3 py-1 rounded bg-[#141a22] border border-sky-400/40 text-xs font-mono-num text-sky-200">
                    Залишок рулона:{' '}
                    <span className="font-bold text-white">
                      {Math.round(activeItemInBag?.conditionPct ?? 0)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-4 w-full">
                    <div className="w-20 h-36 rounded-xl bg-[#b98a70]/25 border-2 border-white/40 relative overflow-hidden flex items-center justify-center">
                      <div
                        className="absolute inset-x-0 bottom-0 bg-slate-200/90 transition-all"
                        style={{
                          height: `${phys.limbs[activeTreatment.limbId].bandageCoverage}%`,
                        }}
                      />
                      <div
                        className="w-14 h-4 bg-sky-200/80 border border-slate-700 relative z-10"
                        style={{
                          transform: `rotate(${(wheelVisualDeg % 30) - 15}deg)`,
                        }}
                      />
                      <span className="relative z-10 text-[10px] font-mono-num font-bold text-slate-900 bg-white/85 px-1 rounded">
                        {Math.round(
                          phys.limbs[activeTreatment.limbId].bandageCoverage,
                        )}
                        %
                      </span>
                    </div>

                    <div
                      onPointerDown={handleWheelDown}
                      onPointerMove={handleWheelMove}
                      onPointerUp={handleWheelUp}
                      onPointerCancel={handleWheelUp}
                      className="relative w-44 h-44 rounded-full bg-[#0e1319] border-4 border-sky-400/80 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none shadow-inner"
                    >
                      <div
                        className="absolute inset-1 rounded-full border-4 border-dashed border-slate-200/85 pointer-events-none"
                        style={{ transform: `rotate(${wheelVisualDeg}deg)` }}
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-bold pointer-events-none">
                        ↑
                      </div>
                      <div className="w-16 h-16 rounded-full bg-[#1a2029] border border-white/20 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl leading-none">
                          {getEffectiveLimbBleed(
                            phys,
                            phys.limbs[activeTreatment.limbId],
                          ) > 0.2
                            ? '🩸'
                            : '🩹'}
                        </span>
                        <span className="text-[10px] font-mono-num text-amber-300 mt-0.5">
                          {(
                            (getEffectiveLimbBleed(
                              phys,
                              phys.limbs[activeTreatment.limbId],
                            ) *
                              60) /
                            1000
                          ).toFixed(2)}
                          L/m
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTreatment(null)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Готово (зберегти залишок рулона)</span>
                  </button>
                </div>
              )}

              {/* 2. SPLINT MINI-GAME (Step 1: Align Bone, Step 2: Tighten 2 Straps) */}
              {activeTreatment.medId === 'splint' && (
                <div className="flex-1 flex flex-col justify-between gap-3">
                  <div className="text-center text-xs text-slate-200">
                    {!boneAligned ? (
                      <>
                        Крок 1/2: <span className="text-amber-300 font-bold">Зведіть зміщену кістку</span> у зелений центр
                      </>
                    ) : (
                      <>
                        Крок 2/2: <span className="text-sky-300 font-bold">Затягніть обидва ремені</span> шини до 100%
                      </>
                    )}
                  </div>

                  {/* Interactive X-ray Bone Alignment Box */}
                  <div className="relative h-36 rounded bg-[#07111a] border border-sky-500/35 overflow-hidden flex flex-col items-center justify-center select-none">
                    {/* Alignment target line */}
                    <div
                      className={`absolute inset-y-2 w-0.5 border-l border-dashed ${
                        boneAligned
                          ? 'border-emerald-400'
                          : 'border-emerald-400/50'
                      }`}
                    />
                    {/* Upper fixed bone */}
                    <div className="w-7 h-12 rounded-t-md bg-slate-200 border border-slate-400 mb-1" />
                    {/* Lower draggable broken bone */}
                    <div
                      onPointerDown={handleBoneDown}
                      onPointerMove={handleBoneMove}
                      onPointerUp={handleBoneUp}
                      onPointerCancel={handleBoneUp}
                      style={{
                        transform: `translateX(${boneOffsetX}px) rotate(${boneOffsetX * 0.25}deg)`,
                      }}
                      className={`w-7 h-14 rounded-b-md border-2 flex items-center justify-center touch-none transition-colors ${
                        boneAligned
                          ? 'bg-emerald-200 border-emerald-400 cursor-default'
                          : 'bg-amber-200 border-amber-400 cursor-ew-resize'
                      }`}
                    >
                      {!boneAligned && (
                        <span className="text-[9px] font-bold text-slate-900">
                          ↔
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] font-mono-num text-slate-300">
                      {boneAligned
                        ? '✓ Кістка вирівняна!'
                        : `Зміщення: ${Math.round(boneOffsetX)}мм`}
                    </div>
                  </div>

                  {/* Two Straps to Tighten */}
                  <div className="space-y-2">
                    {[
                      { id: 1 as const, val: strap1Pct, label: 'Ремінь #1' },
                      { id: 2 as const, val: strap2Pct, label: 'Ремінь #2' },
                    ].map((st) => (
                      <div key={st.id} className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-300">
                          <span>{st.label}</span>
                          <span className="font-mono-num font-bold">
                            {st.val}%
                          </span>
                        </div>
                        <div
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            handleStrapDrag(st.id, e);
                          }}
                          onPointerMove={(e) => {
                            if (e.buttons > 0 || e.pointerType === 'touch') {
                              handleStrapDrag(st.id, e);
                            }
                          }}
                          className={`h-8 rounded border relative overflow-hidden touch-none select-none flex items-center justify-center ${
                            boneAligned
                              ? 'bg-[#121a24] border-sky-400/50 cursor-ew-resize'
                              : 'bg-[#0c1015] border-white/10 opacity-45 cursor-not-allowed'
                          }`}
                        >
                          <div
                            className={`absolute inset-y-0 left-0 transition-all ${
                              st.val === 100 ? 'bg-emerald-600/80' : 'bg-sky-600/75'
                            }`}
                            style={{ width: `${st.val}%` }}
                          />
                          <span className="relative z-10 text-[11px] font-bold text-white">
                            {st.val === 100
                              ? 'Зафіксовано ✓'
                              : boneAligned
                                ? 'Тягніть вправо →'
                                : 'Спочатку вирівняйте кістку'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. TOURNIQUET CAT STRAP + WINDLASS MINI-GAME */}
              {activeTreatment.medId === 'tourniquet' && (
                <div className="flex-1 flex flex-col justify-between gap-3">
                  {phys.limbs[activeTreatment.limbId].tourniquet ? (
                    /* Unbuckle existing tourniquet */
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <div className="text-xs text-amber-200 text-center">
                        На кінцівці вже затягнуто турнікет. Протягніть фіксатор, щоб ослабити та зняти:
                      </div>
                      <div
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          if (e.buttons === 0 && e.pointerType === 'mouse')
                            return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pct = Math.max(
                            0,
                            Math.min(
                              100,
                              Math.round(
                                ((e.clientX - rect.left) / rect.width) * 100,
                              ),
                            ),
                          );
                          setTqReleasePct(pct);
                          if (pct >= 92) {
                            onToggleTourniquet(
                              activeTreatment.limbId,
                              activeTreatment.item.uid,
                            );
                            showNotice('Турнікет знято!', 'ok');
                            setActiveTreatment(null);
                          }
                        }}
                        className="w-full h-12 rounded bg-[#141a22] border-2 border-amber-400/60 relative overflow-hidden flex items-center justify-center touch-none select-none cursor-ew-resize"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-amber-600/75"
                          style={{ width: `${tqReleasePct}%` }}
                        />
                        <span className="relative z-10 text-xs font-bold text-white">
                          Відкрити пряжку → ({tqReleasePct}%)
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Apply CAT: Step 1 strap tension -> Step 2 windlass 3 turns */
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-200">
                          <span>Крок 1/2: Затягніть стропу CAT</span>
                          <span className="font-mono-num font-bold text-amber-300">
                            {tqStrapPct}%
                          </span>
                        </div>
                        <div
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pct = Math.max(
                              0,
                              Math.min(
                                100,
                                Math.round(
                                  ((e.clientX - rect.left) / rect.width) * 100,
                                ),
                              ),
                            );
                            setTqStrapPct(pct >= 90 ? 100 : pct);
                          }}
                          onPointerMove={(e) => {
                            if (e.buttons === 0 && e.pointerType === 'mouse')
                              return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pct = Math.max(
                              0,
                              Math.min(
                                100,
                                Math.round(
                                  ((e.clientX - rect.left) / rect.width) * 100,
                                ),
                              ),
                            );
                            setTqStrapPct(pct >= 90 ? 100 : pct);
                          }}
                          className="h-10 rounded bg-[#141922] border border-amber-400/50 relative overflow-hidden flex items-center justify-center touch-none select-none cursor-ew-resize"
                        >
                          <div
                            className={`absolute inset-y-0 left-0 ${
                              tqStrapPct === 100
                                ? 'bg-emerald-600/80'
                                : 'bg-amber-600/80'
                            }`}
                            style={{ width: `${tqStrapPct}%` }}
                          />
                          <span className="relative z-10 text-xs font-bold text-white">
                            {tqStrapPct === 100
                              ? 'Стропа затягнута ✓'
                              : 'Тягніть стропу вправо →'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        <div className="text-xs text-slate-200 text-center">
                          Крок 2/2: Крутіть вороток (
                          <span className="font-mono-num font-bold text-amber-300">
                            {Math.min(3, Math.floor(tqWindlassDeg / 360))} / 3
                          </span>{' '}
                          оберти)
                        </div>
                        <div
                          onPointerDown={(e) => {
                            if (tqStrapPct < 100) return;
                            tqWheelDragging.current = true;
                            tqLastAngle.current = getWheelAngle(e);
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={handleTqWindlassMove}
                          onPointerUp={() => {
                            tqWheelDragging.current = false;
                            tqLastAngle.current = null;
                          }}
                          onPointerCancel={() => {
                            tqWheelDragging.current = false;
                            tqLastAngle.current = null;
                          }}
                          className={`relative w-36 h-36 rounded-full border-4 flex items-center justify-center touch-none select-none ${
                            tqStrapPct === 100
                              ? 'bg-[#0e1319] border-amber-400 cursor-grab active:cursor-grabbing'
                              : 'bg-[#0a0d12] border-white/15 opacity-45 cursor-not-allowed'
                          }`}
                        >
                          {/* Windlass T-bar rotating */}
                          <div
                            className="w-24 h-4 rounded bg-slate-300 border-2 border-slate-700 shadow pointer-events-none flex items-center justify-between px-1.5"
                            style={{
                              transform: `rotate(${tqWindlassDeg}deg)`,
                            }}
                          >
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={tqStrapPct < 100}
                          onClick={() => {
                            setTqWindlassDeg((prev) => {
                              const next = prev + 360;
                              if (next >= 1080) {
                                completeTourniquetApply(activeTreatment);
                                return 1080;
                              }
                              return next;
                            });
                          }}
                          className="min-h-[38px] px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Прокрутити +1 оберт</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 4. TWEEZERS PRECISION EXTRACTION MINI-GAME */}
              {activeTreatment.medId === 'tweezers' && (
                <div className="flex-1 flex flex-col items-center justify-between gap-2">
                  <div className="text-center text-xs text-slate-200 leading-snug">
                    Захопіть уламок і <span className="text-cyan-300 font-bold">плавно ведіть угору</span> по світлому каналу, не торкаючись червоних тканин (уламків:{' '}
                    <span className="font-bold text-amber-300">
                      {phys.limbs[activeTreatment.limbId].shrapnel}
                    </span>
                    )
                  </div>

                  <svg
                    viewBox="0 0 220 200"
                    onPointerMove={handleTweezersMove}
                    onPointerUp={() => setTweezerGrabbed(false)}
                    onPointerCancel={() => setTweezerGrabbed(false)}
                    className={`w-full max-w-[260px] h-48 rounded border-2 touch-none select-none ${
                      tweezerSlipFlash
                        ? 'border-red-500 bg-red-950/75'
                        : 'border-white/20 bg-[#2c0b10]'
                    }`}
                  >
                    {/* Tissue walls */}
                    <rect
                      x="0"
                      y="0"
                      width="220"
                      height="200"
                      fill={tweezerSlipFlash ? '#7f1d1d' : '#450a14'}
                    />
                    {/* Safe extraction channel curve */}
                    <path
                      d={`M ${canalCurveOffset(180)} 180 Q ${canalCurveOffset(130)} 130 ${canalCurveOffset(95)} 95 T ${canalCurveOffset(24)} 24`}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="44"
                      strokeLinecap="round"
                    />
                    <path
                      d={`M ${canalCurveOffset(180)} 180 Q ${canalCurveOffset(130)} 130 ${canalCurveOffset(95)} 95 T ${canalCurveOffset(24)} 24`}
                      fill="none"
                      stroke="#38bdf8"
                      strokeOpacity="0.28"
                      strokeWidth="2"
                      strokeDasharray="5 5"
                    />
                    {/* Top extraction zone */}
                    <rect
                      x="65"
                      y="6"
                      width="90"
                      height="24"
                      rx="6"
                      fill="#064e3b"
                      stroke="#34d399"
                      strokeDasharray="4 3"
                    />
                    <text
                      x="110"
                      y="21"
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="bold"
                      fill="#a7f3d0"
                    >
                      ВИХІД / EXIT ↑
                    </text>

                    {/* Shrapnel / Broken Needle + Tweezers Tip */}
                    <g
                      onPointerDown={(e) => {
                        setTweezerGrabbed(true);
                        lastTweezerY.current = tweezerPos.y;
                        (e.currentTarget.ownerSVGElement as SVGSVGElement)?.setPointerCapture(
                          e.pointerId,
                        );
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <polygon
                        points={`${tweezerPos.x - 9},${tweezerPos.y + 4} ${tweezerPos.x},${tweezerPos.y - 10} ${tweezerPos.x + 10},${tweezerPos.y + 3} ${tweezerPos.x + 2},${tweezerPos.y + 11}`}
                        fill="#d97706"
                        stroke="#fef3c7"
                        strokeWidth="1.5"
                      />
                      {/* Forceps blades gripping the shard */}
                      <line
                        x1={tweezerPos.x - 4}
                        y1={tweezerPos.y - 2}
                        x2={tweezerPos.x - 16}
                        y2={tweezerPos.y - 34}
                        stroke={tweezerGrabbed ? '#38bdf8' : '#e2e8f0'}
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <line
                        x1={tweezerPos.x + 4}
                        y1={tweezerPos.y - 2}
                        x2={tweezerPos.x + 16}
                        y2={tweezerPos.y - 34}
                        stroke={tweezerGrabbed ? '#38bdf8' : '#e2e8f0'}
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={tweezerPos.x}
                        cy={tweezerPos.y}
                        r="18"
                        fill="transparent"
                      />
                    </g>
                  </svg>

                  <div className="text-[11px] text-slate-400 text-center">
                    {tweezerSlipFlash
                      ? '⚠ Зачеплено тканини! Біль і кровотеча!'
                      : tweezerGrabbed
                        ? 'Тягніть обережно вгору до зеленої зони...'
                        : 'Натисніть і утримуйте уламок внизу рани'}
                  </div>
                </div>
              )}

              {/* 5. SYRINGE VEIN AIM + PLUNGER MINI-GAME */}
              {SYRINGE_IDS.includes(activeTreatment.medId) && (
                <div className="flex-1 flex flex-col justify-between gap-2">
                  {!veinInserted ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <div className="text-xs text-slate-200 text-center">
                        Крок 1/2: Торкніться <span className="text-sky-300 font-bold">синьої вени</span>, щоб обережно ввести голку
                      </div>
                      <div
                        onPointerDown={handleVeinAimClick}
                        className={`w-full h-36 rounded border-2 relative overflow-hidden cursor-crosshair select-none touch-none ${
                          veinMissFlash
                            ? 'bg-red-950/75 border-red-500'
                            : 'bg-[#7c4d3e]/45 border-white/25'
                        }`}
                      >
                        {/* Pulsing (and swaying if brain-injured) vein band across the skin */}
                        <div
                          className="absolute inset-x-4 -translate-y-1/2 h-6 rounded-full bg-sky-500/45 border border-sky-300/70 flex items-center justify-center transition-[top] duration-75"
                          style={{ top: `${veinOffsetPct}%` }}
                        >
                          <div className="w-full h-2 bg-sky-400/75 blur-[1px]" />
                        </div>
                        {/* Target ring following vein */}
                        <div
                          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-dashed border-sky-200 flex items-center justify-center pointer-events-none transition-[top] duration-75"
                          style={{ top: `${veinOffsetPct}%` }}
                        >
                          <Syringe className="w-5 h-5 text-sky-100" />
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 text-center">
                        Вводьте у центральну вену (можна колоти в будь-яку неушкоджену ділянку)
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 flex-1 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 flex items-center gap-1">
                          <Syringe className="w-3.5 h-3.5 text-sky-400" /> Крок 2/2: Доза
                        </span>
                        <span className="font-mono-num font-bold text-white">
                          {Math.round(plungerProgress * 100)}% (
                          {Math.round(
                            plungerProgress *
                              MED_ITEM_DEFS[activeTreatment.medId].fluidMl,
                          )}
                          mL)
                        </span>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="text-slate-400">
                            Швидкість введення
                          </span>
                          <span
                            className={
                              needleStress > 0.65
                                ? 'text-red-400 font-bold'
                                : 'text-emerald-400'
                            }
                          >
                            {needleSnapped
                              ? 'ГОЛКА ЗЛАМАНА!'
                              : needleStress > 0.65
                                ? 'ПОВІЛЬНІШЕ!'
                                : 'Стабільно'}
                          </span>
                        </div>
                        <div className="h-2 rounded bg-white/10 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              needleStress > 0.65
                                ? 'bg-red-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${Math.min(100, needleStress * 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div
                        onPointerDown={handlePlungerDown}
                        onPointerMove={handlePlungerMove}
                        onPointerUp={handlePlungerUp}
                        onPointerCancel={handlePlungerUp}
                        className="h-32 rounded border border-white/15 bg-[#121822] flex flex-col items-center justify-center cursor-ns-resize touch-none select-none"
                      >
                        {needleSnapped ? (
                          <span className="text-xs text-red-400 font-semibold px-3 text-center">
                            Голка зламалась всередині! Витягніть пінцетом на манекені.
                          </span>
                        ) : (
                          <>
                            <div className="w-10 h-20 rounded border-2 border-slate-400 relative bg-slate-900 overflow-hidden">
                              <div
                                className="absolute inset-x-0 bottom-0 transition-all"
                                style={{
                                  height: `${(1 - plungerProgress) * 100}%`,
                                  backgroundColor:
                                    MED_ITEM_DEFS[activeTreatment.medId]
                                      .accentColor,
                                  opacity: 0.85,
                                }}
                              />
                              <div
                                className="absolute inset-x-0 h-2 bg-white"
                                style={{ top: `${plungerProgress * 86}%` }}
                              />
                            </div>
                            <span className="mt-1.5 text-[11px] text-slate-300">
                              Тягніть поршень ПЛАВНО вниз ↓
                            </span>
                          </>
                        )}
                      </div>

                      {plungerProgress > 0 &&
                        plungerProgress < 1 &&
                        !needleSnapped && (
                          <button
                            type="button"
                            onClick={finishPartialSyringe}
                            className="w-full min-h-[40px] px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs text-white font-semibold cursor-pointer"
                          >
                            Витягти голку ({Math.round(plungerProgress * 100)}% дози — безпечно)
                          </button>
                        )}
                    </div>
                  )}
                </div>
              )}
              {/* 6. BLOOD BAG TRANSFUSION MINI-GAME */}
              {activeTreatment.medId === 'blood_bag' && (
                <div className="flex-1 flex flex-col justify-between gap-2.5">
                  <div className="text-xs text-slate-200 text-center">
                    Крок 1: Оберіть спосіб підключення мішка до вени
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={inventory.meds.transfusion_tube <= 0}
                      onClick={() => setTransfusionConduit('tube')}
                      className={`p-2 rounded border text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        transfusionConduit === 'tube'
                          ? 'bg-emerald-950/90 border-emerald-400 text-white'
                          : 'bg-[#121822] border-white/15 text-slate-300'
                      }`}
                    >
                      <div className="text-[11px] font-bold">
                        Стерильна трубка (x{inventory.meds.transfusion_tube})
                      </div>
                      <div className="text-[10px] text-emerald-300 mt-0.5">
                        Безпечно · 0% зараження
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={inventory.meds.used_syringe <= 0}
                      onClick={() => setTransfusionConduit('used_syringe')}
                      className={`p-2 rounded border text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        transfusionConduit === 'used_syringe'
                          ? 'bg-amber-950/90 border-amber-400 text-white'
                          : 'bg-[#121822] border-white/15 text-slate-300'
                      }`}
                    >
                      <div className="text-[11px] font-bold">
                        Пустий шприц (x{inventory.meds.used_syringe})
                      </div>
                      <div className="text-[10px] text-red-300 mt-0.5">
                        Нестерильно · ~60% ризик!
                      </div>
                    </button>
                  </div>

                  {!transfusionVeinHit ? (
                    <div
                      onPointerDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const rx = ((e.clientX - rect.left) / rect.width) * 100;
                        const ry = ((e.clientY - rect.top) / rect.height) * 100;
                        const halfBand = Math.max(9, 17 - brainImpairment * 6.5);
                        if (
                          rx >= 18 &&
                          rx <= 82 &&
                          ry >= veinOffsetPct - halfBand &&
                          ry <= veinOffsetPct + halfBand
                        ) {
                          setTransfusionVeinHit(true);
                        } else {
                          showNotice('Натисніть точно на синю вену!', 'warn');
                        }
                      }}
                      className="h-28 rounded border-2 border-white/25 bg-[#7c4d3e]/45 relative overflow-hidden cursor-crosshair flex items-center justify-center touch-none select-none"
                    >
                      <div
                        className="absolute inset-x-4 -translate-y-1/2 h-6 rounded-full bg-sky-500/45 border border-sky-300/75 transition-[top] duration-75"
                        style={{ top: `${veinOffsetPct}%` }}
                      />
                      <span className="relative z-10 text-xs font-bold text-white bg-[#0a0f18]/75 px-2.5 py-1 rounded">
                        Торкніться вени, щоб підключити катетер
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-red-300 font-bold">
                          Переливання +450 mL крові
                        </span>
                        <span className="font-mono-num font-bold text-white">
                          {transfusionFlowPct}%
                        </span>
                      </div>
                      <div
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pct = Math.max(
                            0,
                            Math.min(
                              100,
                              Math.round(((e.clientX - rect.left) / rect.width) * 100),
                            ),
                          );
                          setTransfusionFlowPct(pct);
                        }}
                        onPointerMove={(e) => {
                          if (e.buttons === 0 && e.pointerType === 'mouse') return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pct = Math.max(
                            0,
                            Math.min(
                              100,
                              Math.round(((e.clientX - rect.left) / rect.width) * 100),
                            ),
                          );
                          setTransfusionFlowPct(pct);
                          if (pct >= 94) {
                            const viaUsed = transfusionConduit === 'used_syringe';
                            const conduitItem = backpackMeds.find(
                              (m) =>
                                m.medId ===
                                (viaUsed ? 'used_syringe' : 'transfusion_tube'),
                            );
                            onBloodTransfusion(
                              activeTreatment.limbId,
                              viaUsed,
                              activeTreatment.item.uid,
                              conduitItem?.uid,
                            );
                            showNotice('Переливання крові (+450 mL) завершено!', 'ok');
                            setActiveTreatment(null);
                          }
                        }}
                        className="h-12 rounded bg-[#141922] border-2 border-red-400/70 relative overflow-hidden flex items-center justify-center touch-none select-none cursor-ew-resize"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-red-600/80 transition-all"
                          style={{ width: `${transfusionFlowPct}%` }}
                        />
                        <span className="relative z-10 text-xs font-bold text-white">
                          Протягніть потік крові вправо → ({transfusionFlowPct}%)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 7. ANTIBIOTICS BLISTER PACK MINI-GAME */}
              {activeTreatment.medId === 'antibiotics' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="text-xs text-slate-200 text-center leading-snug">
                    Натисніть на обидві капсули у блістері, щоб прийняти курс антибіотиків
                  </div>
                  <div className="p-4 rounded-xl bg-slate-300/15 border-2 border-slate-400/60 flex items-center gap-4">
                    {[0, 1].map((idx) => {
                      const popped = abxPopped[idx];
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={popped}
                          onClick={() => {
                            const next: [boolean, boolean] = [
                              idx === 0 ? true : abxPopped[0],
                              idx === 1 ? true : abxPopped[1],
                            ];
                            setAbxPopped(next);
                            if (next[0] && next[1]) {
                              onTakeAntibiotics(activeTreatment.item.uid);
                              showNotice(
                                'Антибіотики прийнято! Інфекція пригнічується, імунітет росте.',
                                'ok',
                              );
                              setActiveTreatment(null);
                            }
                          }}
                          className={`w-16 h-24 rounded-full border-2 flex flex-col items-center justify-center transition-all cursor-pointer ${
                            popped
                              ? 'bg-[#0b0f16] border-dashed border-slate-500 text-slate-500 scale-95'
                              : 'bg-gradient-to-b from-cyan-400 to-sky-700 border-white text-white shadow-lg hover:scale-105'
                          }`}
                        >
                          <span className="text-xs font-bold">
                            {popped ? '✓' : 'ABX'}
                          </span>
                          <span className="text-[10px] opacity-80">
                            {popped ? 'Прийн.' : 'Натисн.'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Moodle Strip under center panel */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {totalBleedMlSec + phys.internalBleedRate > 0.3 && (
              <span className="px-2 py-0.5 rounded-full bg-red-900 border border-white/75 text-[11px] text-white font-bold">
                🩸 Кровотеча
              </span>
            )}
            {phys.pain > 20 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-800 border border-white/75 text-[11px] text-white font-bold">
                ⚡ Біль
              </span>
            )}
            {phys.shockLevel > 22 && (
              <span className="px-2 py-0.5 rounded-full bg-red-950 border border-white/75 text-[11px] text-white font-bold">
                ! Шок
              </span>
            )}
            {limb.fractured && !limb.splinted && (
              <span className="px-2 py-0.5 rounded-full bg-orange-800 border border-white/75 text-[11px] text-white font-bold">
                🦴 Перелом
              </span>
            )}
            {phys.infectionPhase === 2 && (
              <span className="px-2 py-0.5 rounded-full bg-lime-900 border border-lime-400 text-[11px] text-lime-100 font-bold">
                ☣ Інфекція Ф.2
              </span>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Real Backpack Medical Inventory (Drag-to-Body-Part) */}
        <div className="lg:col-span-4 rounded-sm bg-[#161c24]/96 border-2 border-[#39434f] p-3 flex flex-col gap-2.5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Медикаменти з рюкзака
              </div>
              <div className="text-[11px] text-slate-400">
                Перетягніть предмет на кінцівку манекена
              </div>
            </div>
            <span className="font-mono-num text-[11px] text-sky-300 font-bold">
              {backpackMeds.length} слот.
            </span>
          </div>

          {backpackMeds.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center bg-[#0c1016] border border-white/10 rounded">
              <ShieldAlert className="w-8 h-8 text-amber-400" />
              <div className="text-xs text-slate-300 leading-relaxed">
                У рюкзаку немає жодних медикаментів. Обшукайте аптечки в будівлях або тіла ботів!
              </div>
              <button
                type="button"
                onClick={onOpenInventory}
                className="min-h-[42px] px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white text-xs font-bold cursor-pointer"
              >
                Відкрити рюкзак (I)
              </button>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 gap-1.5 max-h-[380px] overflow-y-auto pr-0.5">
              {backpackMeds.map((item) => {
                const def = MED_ITEM_DEFS[item.medId];
                const isArmed = armedItemUid === item.uid;
                const isDraggingThis =
                  dragState?.moved && dragState.item.uid === item.uid;
                return (
                  <div
                    key={item.uid}
                    onPointerDown={(e) => handleMedCardPointerDown(item, e)}
                    className={`min-h-[54px] px-2.5 py-1.5 rounded flex items-center gap-2.5 border transition-colors touch-none select-none cursor-grab active:cursor-grabbing ${
                      isDraggingThis
                        ? 'opacity-40 bg-[#1e293b] border-sky-400'
                        : isArmed
                          ? 'bg-[#1d2d40] border-sky-400 text-white'
                          : 'bg-[#0e1319] border-white/15 text-slate-200 hover:bg-[#19212c] hover:border-white/30'
                    }`}
                  >
                    <div
                      className="w-11 h-11 rounded bg-[#080c12] border border-white/15 flex items-center justify-center shrink-0"
                      style={{ borderLeftWidth: 3, borderLeftColor: item.accentColor }}
                    >
                      <MedItemIcon medId={item.medId} className="w-9 h-9" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          {item.nameUk}
                        </span>
                        <span className="font-mono-num text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-sky-200 shrink-0">
                          {item.medId === 'bandage'
                            ? `${Math.round(item.conditionPct)}%`
                            : `x${item.quantity}`}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {def.nameEn}
                        {def.fluidMl > 0 ? ` · ${def.fluidMl}mL` : ''}
                        {' · '}
                        {(
                          item.weightKg *
                          item.quantity *
                          (item.medId === 'bandage'
                            ? Math.max(0.15, item.conditionPct / 100)
                            : 1)
                        ).toFixed(2)}
                        kg
                      </div>

                      {item.medId === 'bandage' && (
                        <div className="mt-1 h-1 bg-white/10 rounded overflow-hidden">
                          <div
                            className="h-full bg-sky-400"
                            style={{ width: `${item.conditionPct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <Hand className="w-4 h-4 text-slate-500 shrink-0" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected / Armed Item Quick Description Box */}
          <div className="bg-[#0c1016] border border-white/10 rounded p-2.5 text-[11px] text-slate-300 leading-snug">
            {armedItem && armedItem.medId ? (
              <>
                <div className="text-xs font-bold text-sky-400 mb-0.5">
                  {MED_ITEM_DEFS[armedItem.medId].nameUk}
                </div>
                {MED_ITEM_DEFS[armedItem.medId].descUk}
              </>
            ) : (
              <>
                <div className="text-xs font-bold text-slate-200 mb-0.5">
                  Інструкція
                </div>
                Потягніть будь-який бинт, шину, турнікет, пінцет чи шприц із рюкзака прямо на уражену кінцівку — відкриється інтерактивна процедура лікування.
              </>
            )}
          </div>
        </div>
      </div>

      {/* FLOATING DRAG GHOST FOLLOWING CURSOR / FINGER */}
      {dragState?.moved && dragState.item.medId && (
        <div
          className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md bg-[#0f172a]/95 border-2 border-sky-400 shadow-2xl flex items-center gap-2"
          style={{ left: dragState.curX, top: dragState.curY }}
        >
          <MedItemIcon medId={dragState.item.medId} className="w-8 h-8" />
          <div className="text-xs font-bold text-white whitespace-nowrap">
            {dragState.item.nameUk}
            {hoveredDropLimb && (
              <span className="ml-1.5 text-sky-300">
                → {LIMB_META[hoveredDropLimb].nameUk}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
