import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  HeartPulse,
  Hand,
  PackageOpen,
  Pause,
  RotateCcw,
  Sliders,
  Eye,
  EyeOff,
  Check,
  Camera,
  Flashlight,
  Sun,
  Moon,
  Activity,
  Backpack,
  Maximize2,
  Minimize2,
  ExternalLink,
} from 'lucide-react';
import {
  corruptText,
  DEFAULT_HUD_LAYOUT,
  detectTouchMode,
  GESTURE_DEFS,
  getFullscreenElement,
  toggleFullscreenCompat,
  WEAPON_DEFS,
} from '../game/data';
import { getEffectiveLimbBleed } from '../game/physiology';
import {
  GameSnapshot,
  GestureId,
  HudLayoutConfig,
  HudWidgetId,
  LimbId,
  WeaponId,
} from '../game/types';

interface GameHudProps {
  snapshot: GameSnapshot;
  hudConfig: HudLayoutConfig;
  editMode: boolean;
  onExitEditMode: () => void;
  onUpdateConfig: (next: HudLayoutConfig) => void;
  onPause: () => void;
  onOpenMedical: () => void;
  onOpenInventory: () => void;
  onOpenLoot: () => void;
  onSelectWeapon: (w: WeaponId) => void;
  onTriggerGesture: (g: GestureId) => void;
  onTouchMove: (x: number, y: number) => void;
  onTouchLookDelta: (dx: number, dy: number) => void;
  onTouchFire: (held: boolean) => void;
  onToggleAds: () => void;
  onReload: () => void;
  onJump: () => void;
  onCrouch: () => void;
  onCrusherThrow: () => void;
  onCycleCamera: () => void;
  onToggleFlashlight: () => void;
  onAdvanceTime: () => void;
  onPerformCpr: () => void;
}

const WIDGET_LABELS: Record<HudWidgetId, string> = {
  vitals: 'Здоров’я / Vitals',
  weapon: 'Зброя / Weapon',
  joystick: 'Джойстик / Stick',
  btn_fire: 'Вогонь / Fire',
  btn_ads: 'Приціл / ADS',
  btn_reload: 'Перезарядка',
  btn_jump: 'Стрибок / Jump',
  btn_crouch: 'Присісти / Crouch',
  btn_interact: 'Лут / Interact',
  btn_med: 'Медицина / Med',
  btn_inventory: 'Інвентар / Bag',
  btn_gesture: 'Жести / Gestures',
  btn_crusher_push: 'Кидок / Fling',
};

function buildSawtoothCirclePath(
  cx: number,
  cy: number,
  radius: number,
  teethCount: number,
  amp: number,
  progressFrac: number,
  phaseShift = 0,
): string {
  const clamped = Math.max(0, Math.min(1, progressFrac));
  if (clamped <= 0.005) return '';
  const steps = Math.max(2, Math.round(teethCount * 2 * clamped));
  const totalAngle = Math.PI * 2 * clamped;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / (teethCount * 2);
    const angle = -Math.PI / 2 + Math.min(totalAngle, t * Math.PI * 2);
    const toothPhase = (i + Math.round(phaseShift)) % 2;
    const r = radius + (toothPhase === 0 ? amp : -amp);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  if (clamped >= 0.995) d += ' Z';
  return d;
}

export const GameHud: React.FC<GameHudProps> = ({
  snapshot,
  hudConfig,
  editMode,
  onExitEditMode,
  onUpdateConfig,
  onPause,
  onOpenMedical,
  onOpenInventory,
  onOpenLoot,
  onSelectWeapon,
  onTriggerGesture,
  onTouchMove,
  onTouchLookDelta,
  onTouchFire,
  onToggleAds,
  onReload,
  onJump,
  onCrouch,
  onCrusherThrow,
  onCycleCamera,
  onToggleFlashlight,
  onAdvanceTime,
  onPerformCpr,
}) => {
  const [gestureOpen, setGestureOpen] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<HudWidgetId>('vitals');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    Boolean(getFullscreenElement()),
  );
  const [fsBlockedMsg, setFsBlockedMsg] = useState(false);
  const [fxPhase, setFxPhase] = useState(0);
  const [glitchSeed, setGlitchSeed] = useState(1);

  useEffect(() => {
    const onFs = () => {
      const active = Boolean(getFullscreenElement());
      setIsFullscreen(active);
      if (active) setFsBlockedMsg(false);
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  const toggleFullscreen = async () => {
    const res = await toggleFullscreenCompat();
    setIsFullscreen(res.active);
    if (res.blocked) {
      setFsBlockedMsg(true);
    }
  };

  // Auto-detect touch capability when controlMode === 'auto'
  const isTouch = detectTouchMode(hudConfig.controlMode);

  // Keyboard 'G' toggles gesture wheel on PC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        snapshot.phase !== 'playing' ||
        editMode ||
        snapshot.physiology.consciousness === 'unconscious' ||
        snapshot.physiology.consciousness === 'cardiacArrest'
      ) {
        return;
      }
      if (e.code === 'KeyG') {
        setGestureOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snapshot.phase, snapshot.physiology.consciousness, editMode]);

  // Virtual Joystick state
  const joyPointerId = useRef<number | null>(null);
  const joyOrigin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Right-side Touch Aim Pad state
  const aimPointerId = useRef<number | null>(null);
  const lastAimPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // HUD Editor drag state
  const dragWidgetRef = useRef<{
    id: HudWidgetId;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const startWidgetDrag = (id: HudWidgetId, e: React.PointerEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    setSelectedWidget(id);
    const w = hudConfig.widgets[id];
    dragWidgetRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: w.xPct,
      origY: w.yPct,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const moveWidgetDrag = (e: React.PointerEvent) => {
    if (!editMode || !dragWidgetRef.current) return;
    const d = dragWidgetRef.current;
    const dxPct = ((e.clientX - d.startX) / window.innerWidth) * 100;
    const dyPct = ((e.clientY - d.startY) / window.innerHeight) * 100;
    const nextX = Math.max(2, Math.min(98, d.origX + dxPct));
    const nextY = Math.max(3, Math.min(97, d.origY + dyPct));
    onUpdateConfig({
      ...hudConfig,
      widgets: {
        ...hudConfig.widgets,
        [d.id]: { ...hudConfig.widgets[d.id], xPct: nextX, yPct: nextY },
      },
    });
  };

  const endWidgetDrag = () => {
    dragWidgetRef.current = null;
  };

  const widgetStyle = (id: HudWidgetId): React.CSSProperties => {
    const w = hudConfig.widgets[id];
    return {
      left: `${w.xPct}%`,
      top: `${w.yPct}%`,
      opacity: editMode ? Math.max(0.45, w.opacity) : w.opacity,
      transform: `translate(-50%, -50%) scale(${w.scale})`,
      display: !w.visible && !editMode ? 'none' : undefined,
    };
  };

  const { physiology: phys, inventory, activeWeapon } = snapshot;
  const activeDef = WEAPON_DEFS[activeWeapon];

  const totalBleed = (Object.keys(phys.limbs) as LimbId[]).reduce(
    (sum, k) => sum + getEffectiveLimbBleed(phys, phys.limbs[k]),
    0,
  );

  // Casualties: Unknown style inward crimson tunnel-vision vignette + Pre-Blackout Clouding + Post-Wake & Brain Hallucination FX
  const isKnockedOut =
    phys.consciousness === 'unconscious' ||
    phys.consciousness === 'cardiacArrest' ||
    phys.consciousness === 'dead';
  const bloodLossRatio = Math.max(0, 1 - phys.bloodVolumeMl / 5000);
  const lowConscRatio = Math.max(0, (82 - phys.consciousnessPct) / 56);
  const cloudFrac = !isKnockedOut
    ? Math.max(0, Math.min(1, (78 - phys.consciousnessPct) / 48))
    : 0;
  const postWakeFrac = Math.max(0, Math.min(1, phys.postWakeDebuffTimer / 8.5));
  const visionImpairFrac = Math.max(postWakeFrac, cloudFrac * 0.96);
  const hallucFrac = Math.max(0, Math.min(1, phys.hallucinationLevel / 100));
  const odAlpha =
    phys.overdose === 'lethal'
      ? 0.65
      : phys.overdose === 'severe'
        ? 0.42
        : phys.overdose === 'mild'
          ? 0.2
          : 0;
  const vignetteStrength = Math.min(
    0.98,
    bloodLossRatio * 1.15 + lowConscRatio * 0.85 + odAlpha + visionImpairFrac * 0.78,
  );
  const tunnelRadiusPct = Math.max(
    10,
    Math.round(52 - vignetteStrength * 34 - visionImpairFrac * 18),
  );
  const eyelidHeightPct =
    cloudFrac > 0.24
      ? Math.min(42, (cloudFrac - 0.24) * 44)
      : 0;
  const dimVeilOpacity =
    cloudFrac > 0.22
      ? Math.min(0.66, (cloudFrac - 0.22) * 0.68)
      : 0;

  // Tick sawtooth wake-up timer ONLY while unconscious / in cardiac arrest
  useEffect(() => {
    if (
      phys.consciousness !== 'unconscious' &&
      phys.consciousness !== 'cardiacArrest'
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setFxPhase((p) => (p + 0.22) % (Math.PI * 20));
    }, 140);
    return () => window.clearInterval(id);
  }, [phys.consciousness]);

  // Lightweight text-corruption tick ONLY when actively hallucinating while awake
  useEffect(() => {
    if (isKnockedOut || phys.hallucinationLevel <= 18) return;
    const id = window.setInterval(() => {
      setGlitchSeed((s) => (s + 1) % 997);
    }, 280);
    return () => window.clearInterval(id);
  }, [isKnockedOut, phys.hallucinationLevel]);

  const txt = (str: string, boost = 0) =>
    hallucFrac > 0.16
      ? corruptText(str, Math.min(1, hallucFrac + boost), glitchSeed)
      : str;

  const wakeProgress =
    phys.unconsciousMaxSec > 0
      ? Math.max(0.03, Math.min(1, phys.unconsciousTimerSec / phys.unconsciousMaxSec))
      : 0;
  const wakeRemainingSec = Math.max(
    1,
    Math.ceil(phys.unconsciousMaxSec - phys.unconsciousTimerSec),
  );
  const sawTrackPath = buildSawtoothCirclePath(90, 90, 70, 34, 5.5, 1, 0);
  const sawActivePath = buildSawtoothCirclePath(
    90,
    90,
    70,
    34,
    5.5,
    wakeProgress,
    fxPhase * 2,
  );
  const isWakeDanger =
    phys.unconsciousDanger || phys.consciousness === 'cardiacArrest';

  const worstOrgan = (
    [
      ['brain', 'Мозок'],
      ['heart', 'Серце'],
      ['lungs', 'Легені'],
      ['liver', 'Печінка'],
      ['kidneys', 'Нирки'],
    ] as const
  ).reduce(
    (best, [key, label]) => {
      const val = phys.organs[key];
      return val < best.val ? { key, label, val } : best;
    },
    { key: 'brain' as string, label: 'Мозок', val: 100 },
  );

  const anyFracture = (Object.keys(phys.limbs) as LimbId[]).some(
    (k) => phys.limbs[k].fractured && !phys.limbs[k].splinted,
  );
  const anyShrapnel = (Object.keys(phys.limbs) as LimbId[]).some(
    (k) => phys.limbs[k].shrapnel > 0,
  );

  const editBoxClass = editMode
    ? 'ring-2 ring-sky-400 cursor-move pointer-events-auto'
    : '';

  return (
    <div className="fixed inset-0 z-20 pointer-events-none overflow-hidden">
      {/* Overhead World-Space Bot & Phantom Speech Bubbles */}
      {!editMode &&
        snapshot.phase === 'playing' &&
        !isKnockedOut &&
        snapshot.speechBubbles.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            {snapshot.speechBubbles.map((b) => {
              const scale = Math.max(0.68, Math.min(1.04, 1.12 - b.dist * 0.015));
              const bubbleCls =
                b.tone === 'danger'
                  ? 'bg-red-950/92 border-red-400/75 text-red-100'
                  : b.tone === 'warn'
                    ? 'bg-amber-950/92 border-amber-400/75 text-amber-100'
                    : b.tone === 'friendly'
                      ? 'bg-emerald-950/92 border-emerald-400/75 text-emerald-100'
                      : 'bg-[#0b0e14]/92 border-white/25 text-slate-100';
              const tailCls =
                b.tone === 'danger'
                  ? 'bg-red-950/92 border-red-400/75'
                  : b.tone === 'warn'
                    ? 'bg-amber-950/92 border-amber-400/75'
                    : b.tone === 'friendly'
                      ? 'bg-emerald-950/92 border-emerald-400/75'
                      : 'bg-[#0b0e14]/92 border-white/25';
              return (
                <div
                  key={b.id}
                  className="absolute flex flex-col items-center pointer-events-none"
                  style={{
                    left: `${b.xPct.toFixed(2)}%`,
                    top: `${b.yPct.toFixed(2)}%`,
                    transform: `translate(-50%, -100%) scale(${scale.toFixed(2)})`,
                    transformOrigin: 'bottom center',
                  }}
                >
                  <div
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold shadow-lg whitespace-nowrap max-w-[230px] truncate ${bubbleCls}`}
                  >
                    {txt(b.text)}
                  </div>
                  <div className={`w-2 h-2 rotate-45 -mt-1 border-r border-b ${tailCls}`} />
                </div>
              );
            })}
          </div>
        )}

      {/* Lightweight GPU Pre-Blackout Clouding & Post-Wake Tunnel Haze (no backdrop-filter blur) */}
      {visionImpairFrac > 0.05 && !isKnockedOut && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle, rgba(220,226,238,${(visionImpairFrac * 0.14).toFixed(2)}) ${tunnelRadiusPct}%, rgba(6, 7, 12, ${(0.45 + visionImpairFrac * 0.45).toFixed(2)}) ${Math.min(95, tunnelRadiusPct + 24)}%)`,
          }}
        />
      )}

      {/* Pre-Blackout Dimming Veil + Drooping Eyelids */}
      {dimVeilOpacity > 0.04 && !isKnockedOut && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-200"
          style={{ backgroundColor: `rgba(3, 4, 8, ${dimVeilOpacity.toFixed(2)})` }}
        >
          {eyelidHeightPct > 1 && (
            <>
              <div
                className="absolute inset-x-0 top-0 pointer-events-none transition-all duration-300"
                style={{
                  height: `${eyelidHeightPct.toFixed(1)}%`,
                  background:
                    'linear-gradient(to bottom, rgba(2, 3, 6, 0.98) 45%, rgba(2, 3, 6, 0) 100%)',
                }}
              />
              <div
                className="absolute inset-x-0 bottom-0 pointer-events-none transition-all duration-300"
                style={{
                  height: `${eyelidHeightPct.toFixed(1)}%`,
                  background:
                    'linear-gradient(to top, rgba(2, 3, 6, 0.98) 45%, rgba(2, 3, 6, 0) 100%)',
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Pre-Blackout Warning Banner when consciousness is actively fading */}
      {!editMode &&
        snapshot.phase === 'playing' &&
        !isKnockedOut &&
        cloudFrac >= 0.34 && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-25 pointer-events-none px-3">
            <div
              className={`px-3.5 py-1.5 rounded border text-xs font-bold tracking-wide shadow-lg whitespace-nowrap animate-pulse ${
                cloudFrac >= 0.68
                  ? 'bg-red-950/92 border-red-500/80 text-red-200'
                  : 'bg-amber-950/90 border-amber-400/70 text-amber-200'
              }`}
            >
              {cloudFrac >= 0.68
                ? txt(`⚠ ТЕМНІЄ В ОЧАХ (${Math.round(phys.consciousnessPct)}%) — ВТРАТА СВІДОМОСТІ!`)
                : txt(`😵 ПАМОРОЧИТЬСЯ ГОЛОВА (${Math.round(phys.consciousnessPct)}%) — СВІДОМІСТЬ ЗГАСАЄ`)}
            </div>
          </div>
        )}

      {/* Lightweight Edge Distortion Tint during Brain Damage (3D Phantoms handle illusions in-world) */}
      {hallucFrac > 0.18 && !isKnockedOut && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            boxShadow: `inset 0 0 ${Math.round(50 + hallucFrac * 85)}px rgba(${Math.round(135 + hallucFrac * 75)}, 14, ${Math.round(75 + hallucFrac * 110)}, ${(0.18 + hallucFrac * 0.36).toFixed(2)})`,
          }}
        />
      )}

      {/* Inward Tunnel-Vision Vignette (Blood loss / Consciousness / Post-Wake / Overdose) */}
      {vignetteStrength > 0.04 && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle, transparent ${tunnelRadiusPct}%, rgba(${
              phys.overdose !== 'none'
                ? '72, 18, 95'
                : visionImpairFrac > 0.28
                  ? '10, 8, 16'
                  : '58, 8, 12'
            }, ${Math.min(0.97, vignetteStrength * 0.92)}) ${Math.min(96, tunnelRadiusPct + 24)}%, rgba(6, 2, 4, 0.99) 100%)`,
          }}
        />
      )}

      {/* Touch Aim Pad (covers right half of viewport behind touch buttons) */}
      {isTouch && !editMode && snapshot.phase === 'playing' && (
        <div
          className="absolute top-0 right-0 w-[58%] h-full pointer-events-auto touch-none"
          onPointerDown={(e) => {
            if (aimPointerId.current !== null) return;
            aimPointerId.current = e.pointerId;
            lastAimPt.current = { x: e.clientX, y: e.clientY };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (aimPointerId.current !== e.pointerId) return;
            const dx = e.clientX - lastAimPt.current.x;
            const dy = e.clientY - lastAimPt.current.y;
            lastAimPt.current = { x: e.clientX, y: e.clientY };
            onTouchLookDelta(dx, dy);
          }}
          onPointerUp={(e) => {
            if (aimPointerId.current === e.pointerId) {
              aimPointerId.current = null;
            }
          }}
          onPointerCancel={(e) => {
            if (aimPointerId.current === e.pointerId) {
              aimPointerId.current = null;
            }
          }}
        />
      )}

      {/* Unconscious / Cardiac Arrest Blackout Overlay — Wait-Only (No actions, no vitals inspection) */}
      {!editMode &&
        snapshot.phase === 'playing' &&
        (phys.consciousness === 'unconscious' ||
          phys.consciousness === 'cardiacArrest') && (
          <div
            className={`absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-auto ${
              isWakeDanger ? 'bg-[#120306]/98' : 'bg-[#030508]/98'
            }`}
          >
            <div
              className={`max-w-md w-full rounded-lg bg-[#0a0d14] border p-5 text-center shadow-2xl ${
                isWakeDanger ? 'border-red-500/70' : 'border-amber-400/45'
              }`}
            >
              <div
                className={`text-xs font-mono-num uppercase tracking-widest mb-1 ${
                  isWakeDanger ? 'text-red-400' : 'text-amber-300'
                }`}
              >
                {phys.consciousness === 'cardiacArrest'
                  ? 'ЗУПИНКА СЕРЦЯ / CARDIAC ARREST'
                  : 'ВТРАТА СВІДОМОСТІ / UNCONSCIOUS'}
              </div>

              <h3 className="font-display text-xl font-bold text-white mb-3">
                {phys.consciousness === 'cardiacArrest'
                  ? 'Серце зупинилось!'
                  : 'Ви знепритомніли'}
              </h3>

              {/* Circular Gauge with Sawtooth ("Пила") Edge Line */}
              <div className="relative w-44 h-44 mx-auto mb-3 flex items-center justify-center">
                <svg viewBox="0 0 180 180" className="w-full h-full overflow-visible">
                  <circle
                    cx="90"
                    cy="90"
                    r="70"
                    fill="rgba(8, 12, 20, 0.9)"
                    stroke={isWakeDanger ? 'rgba(239,68,68,0.22)' : 'rgba(245,158,11,0.18)'}
                    strokeWidth="2"
                  />
                  {/* Background sawtooth ring track */}
                  <path
                    d={sawTrackPath}
                    fill="none"
                    stroke={isWakeDanger ? 'rgba(239,68,68,0.28)' : 'rgba(245,158,11,0.22)'}
                    strokeWidth="2"
                    strokeLinejoin="miter"
                  />
                  {/* Active animated sawtooth ("пила") wake-up progress ring */}
                  {sawActivePath && (
                    <path
                      d={sawActivePath}
                      fill="none"
                      stroke={
                        isWakeDanger
                          ? '#ef4444'
                          : wakeProgress > 0.72
                            ? '#34d399'
                            : '#f59e0b'
                      }
                      strokeWidth="3.2"
                      strokeLinejoin="miter"
                      style={{
                        filter: isWakeDanger
                          ? 'drop-shadow(0 0 8px rgba(239,68,68,0.85))'
                          : 'drop-shadow(0 0 6px rgba(245,158,11,0.65))',
                      }}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4">
                  <span
                    className={`font-mono-num text-2xl font-extrabold leading-none ${
                      isWakeDanger ? 'text-red-400' : 'text-amber-300'
                    }`}
                  >
                    {phys.consciousness === 'cardiacArrest'
                      ? `${Math.max(0, Math.ceil(16 - phys.cardiacArrestTimer))}с`
                      : `~${wakeRemainingSec}с`}
                  </span>
                  <span className="text-[10px] text-slate-300 mt-1 leading-tight">
                    {phys.consciousness === 'cardiacArrest'
                      ? 'критичний стан'
                      : 'орієнтовно до пробудження'}
                  </span>
                </div>
              </div>

              {isWakeDanger && (
                <div className="mb-3 px-3 py-1.5 rounded bg-red-950/90 border border-red-500/60 text-[11px] text-red-200 font-semibold">
                  ⚠ Червона лінія: критичний стан — є шанс не прокинутись вчасно!
                </div>
              )}

              <p className="text-xs text-slate-400 leading-relaxed">
                У несвідомому стані лікування, інвентар та огляд стану недоступні — залишається лише чекати.
              </p>
            </div>
          </div>
        )}

      {/* Non-blocking PC Pointer-Lock Hint when unlocked */}
      {!isTouch &&
        !editMode &&
        snapshot.phase === 'playing' &&
        !isKnockedOut &&
        !snapshot.pointerLocked && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-25 pointer-events-none px-3">
            <div className="px-3 py-1 rounded bg-[#0b0e14]/82 border border-white/15 text-[11px] text-slate-200 whitespace-nowrap shadow">
              Натисніть на екран для захвату миші · Або затисніть ПКМ/ЛКМ для огляду
            </div>
          </div>
        )}

      {/* Center Tactical Crosshair (no disposition color spoilers) */}
      {!editMode && snapshot.phase === 'playing' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center">
          <div
            className={`w-2 h-2 rounded-full border ${
              activeWeapon === 'reality_crusher'
                ? 'border-sky-400 bg-sky-400/40 w-3 h-3'
                : 'border-white/90 bg-white/40'
            }`}
          />
          {snapshot.isReloading && (
            <span className="mt-3 text-[11px] font-mono-num text-amber-300 bg-[#0b0e14]/85 px-2 py-0.5 rounded">
              Перезарядка / Reloading…
            </span>
          )}
        </div>
      )}

      {/* Top-Right Compact Utility Controls (only Fullscreen & Pause when unconscious) */}
      <div className="absolute top-3 right-3 z-35 flex items-center gap-1.5 pointer-events-auto">
        {(editMode ||
          (phys.consciousness !== 'unconscious' &&
            phys.consciousness !== 'cardiacArrest')) && (
          <>
            <button
              type="button"
              onClick={onAdvanceTime}
              title="Перемотати час (+4 год) [T]"
              className="min-h-[44px] px-2.5 rounded bg-[#0b0e14]/88 hover:bg-[#171d28] border border-white/15 text-slate-200 text-[11px] font-mono-num flex items-center gap-1.5 cursor-pointer"
            >
              {snapshot.timeOfDay >= 6 && snapshot.timeOfDay < 19 ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-sky-300" />
              )}
              <span>{String(Math.floor(snapshot.timeOfDay)).padStart(2, '0')}:00</span>
            </button>

            <button
              type="button"
              onClick={onCycleCamera}
              title="Змінити камеру (1P / 3P / Free) [V]"
              className={`min-h-[44px] px-2.5 rounded border text-[11px] font-mono-num flex items-center gap-1.5 cursor-pointer ${
                snapshot.cameraMode === 'free'
                  ? 'bg-sky-900/85 border-sky-400/50 text-sky-200'
                  : snapshot.cameraMode === 'third'
                    ? 'bg-emerald-950/85 border-emerald-400/40 text-emerald-200'
                    : 'bg-[#0b0e14]/88 hover:bg-[#171d28] border-white/15 text-slate-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>
                {snapshot.cameraMode === 'first'
                  ? '1P'
                  : snapshot.cameraMode === 'third'
                    ? '3P'
                    : 'FREE'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleFlashlight}
              title="Ліхтарик / Flashlight [F]"
              className={`min-h-[44px] min-w-[44px] px-2.5 rounded border text-[11px] font-mono-num flex items-center justify-center gap-1 cursor-pointer ${
                snapshot.flashlightOn
                  ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                  : 'bg-[#0b0e14]/88 hover:bg-[#171d28] border-white/15 text-slate-300'
              }`}
              aria-label="Flashlight"
            >
              <Flashlight className="w-4 h-4" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          title="Повний екран / Fullscreen"
          className="min-h-[44px] min-w-[44px] px-2.5 rounded bg-[#0b0e14]/88 hover:bg-[#171d28] border border-white/15 text-slate-200 flex items-center justify-center cursor-pointer"
          aria-label="Fullscreen"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-sky-300" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>

        <button
          type="button"
          onClick={onPause}
          className="min-h-[44px] min-w-[44px] px-3 rounded bg-[#0b0e14]/88 hover:bg-[#171d28] border border-white/15 text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
          aria-label="Pause"
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>

      {fsBlockedMsg && (
        <div className="absolute top-16 right-3 z-40 max-w-xs rounded-lg bg-[#101622]/96 border border-amber-400/50 p-3 shadow-2xl text-xs text-slate-200 pointer-events-auto flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span>
              Вбудований фрейм блокує повний екран. Натисніть <strong className="text-white">F11</strong> або відкрийте гру в окремій вкладці:
            </span>
            <button
              type="button"
              onClick={() => setFsBlockedMsg(false)}
              className="text-slate-400 hover:text-white px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Відкрити в новій вкладці</span>
          </a>
        </div>
      )}

      {/* Combat & Medical Event Feed (Top Center-Right; Bot speech moved overhead) */}
      {!editMode && snapshot.feed.length > 0 && (
        <div className="absolute top-16 right-3 max-w-xs space-y-1 pointer-events-none text-right">
          {snapshot.feed.slice(0, 3).map((msg) => (
            <div
              key={msg.id}
              className={`px-2.5 py-1 rounded text-[11px] font-medium bg-[#0b0e14]/88 border ${
                msg.tone === 'danger'
                  ? 'border-red-500/40 text-red-200'
                  : msg.tone === 'warn'
                    ? 'border-amber-500/40 text-amber-200'
                    : msg.tone === 'friendly'
                      ? 'border-emerald-500/40 text-emerald-200'
                      : 'border-white/10 text-slate-200'
              }`}
            >
              {txt(msg.text)}
            </div>
          ))}
        </div>
      )}

      {/* Widget 1: Player Vitals & 6-Limb Trauma Mini-Diagram */}
      <div
        style={{
          ...widgetStyle('vitals'),
          transform: `translate(0, 0) scale(${hudConfig.widgets.vitals.scale})`,
          transformOrigin: 'top left',
        }}
        onPointerDown={(e) => startWidgetDrag('vitals', e)}
        onPointerMove={moveWidgetDrag}
        onPointerUp={endWidgetDrag}
        className={`absolute rounded-md bg-[#0b0e14]/88 border border-white/12 p-2.5 text-xs pointer-events-auto ${editBoxClass}`}
      >
        <div className="flex items-center gap-3">
          {/* Mini 6-Limb Status Silhouette */}
          <svg
            width="28"
            height="42"
            viewBox="0 0 28 42"
            onClick={() => !editMode && onOpenMedical()}
            className="cursor-pointer shrink-0"
          >
            {(
              [
                ['head', 10, 1, 8, 8],
                ['torso', 8, 10, 12, 14],
                ['leftArm', 21, 10, 5, 13],
                ['rightArm', 2, 10, 5, 13],
                ['leftLeg', 15, 25, 5, 15],
                ['rightLeg', 8, 25, 5, 15],
              ] as [LimbId, number, number, number, number][]
            ).map(([lid, x, y, w, h]) => {
              const l = phys.limbs[lid];
              const bleed = getEffectiveLimbBleed(phys, l);
              const fill =
                bleed > 4
                  ? '#ef4444'
                  : bleed > 0.4 || l.fractured || l.shrapnel > 0
                    ? '#f59e0b'
                    : '#10b981';
              return <rect key={lid} x={x} y={y} width={w} height={h} rx="1.5" fill={fill} />;
            })}
          </svg>

          <div className="space-y-0.5 min-w-[148px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">{txt('Кров')}</span>
              <span className="font-mono-num font-bold text-red-400">
                {hallucFrac > 0.55 && glitchSeed % 5 === 0
                  ? txt('??? mL', 0.22)
                  : txt(`${Math.round(phys.bloodVolumeMl)} mL`)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">{txt('Пульс / SpO2')}</span>
              <span className="font-mono-num font-bold text-emerald-400">
                {hallucFrac > 0.58 && glitchSeed % 4 === 1
                  ? txt(`${Math.round(phys.heartRateBpm + 42)} · ??%`, 0.2)
                  : txt(`${Math.round(phys.heartRateBpm)} · ${Math.round(phys.oxygenPct)}%`)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">{txt('Свід. / Орг.')}</span>
              <span
                className={`font-mono-num font-bold ${
                  phys.consciousnessPct < 45 || phys.organHealth < 45
                    ? 'text-red-400'
                    : 'text-sky-300'
                }`}
              >
                {txt(`${Math.round(phys.consciousnessPct)}% · ${Math.round(phys.organHealth)}%`)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">{txt('Імунітет')}</span>
              <span
                className={`font-mono-num font-bold ${
                  phys.immunityPct < 35
                    ? 'text-red-400'
                    : phys.immunityPct < 65
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                }`}
              >
                {txt(
                  `${Math.round(phys.immunityPct)}%${phys.antibioticLevel > 2 ? ' · АБХ' : ''}`,
                )}
              </span>
            </div>
            {(totalBleed > 0.3 || phys.internalBleedRate > 0.2) && (
              <div className="text-[11px] font-mono-num text-red-400 font-semibold">
                {txt(`Кровотеча: -${(totalBleed + phys.internalBleedRate).toFixed(1)} mL/s`)}
              </div>
            )}
            {phys.infectionPhase === 2 && (
              <div className="text-[11px] font-semibold text-lime-300">
                {txt(`☣ ІНФЕКЦІЯ Ф.2 (${Math.round(phys.sepsis)}% сепсис)`)}
              </div>
            )}
            {worstOrgan.val < 78 && (
              <div
                className={`text-[11px] font-semibold ${
                  worstOrgan.val < 42 ? 'text-red-400' : 'text-amber-300'
                }`}
              >
                {txt(`⚠ ${worstOrgan.label}: ${Math.round(worstOrgan.val)}%`)}
              </div>
            )}
            {phys.postWakeDebuffTimer > 0 && (
              <div className="text-[11px] font-semibold text-sky-300">
                {txt(`😵 Дезорієнтація (${Math.ceil(phys.postWakeDebuffTimer)}с)`)}
              </div>
            )}
            {phys.overdose !== 'none' && (
              <div className="text-[11px] font-semibold text-purple-300">
                {txt(`ПЕРЕДОЗ (${phys.overdose.toUpperCase()})`)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Widget 2: Weapon & Scavenged Arsenal Switcher */}
      <div
        style={{
          ...widgetStyle('weapon'),
          transform: `translate(-100%, -100%) scale(${hudConfig.widgets.weapon.scale})`,
          transformOrigin: 'bottom right',
        }}
        onPointerDown={(e) => startWidgetDrag('weapon', e)}
        onPointerMove={moveWidgetDrag}
        onPointerUp={endWidgetDrag}
        className={`absolute rounded-md bg-[#0b0e14]/88 border border-white/12 p-2.5 text-right pointer-events-auto ${editBoxClass}`}
      >
        <div className="text-xs font-display font-bold text-white">
          {txt(activeDef.nameUk)}
        </div>
        <div className="text-[11px] text-slate-400 mb-1.5">
          {activeDef.kind === 'firearm' ? (
            <span className="font-mono-num text-sm font-bold text-amber-300">
              {hallucFrac > 0.56 && glitchSeed % 6 === 2
                ? txt('?? / ??', 0.2)
                : txt(`${inventory.magAmmo[activeWeapon]} / ${inventory.reserveAmmo[activeDef.caliber]}`)}
            </span>
          ) : activeDef.id === 'frag_grenade' ? (
            <span className="font-mono-num text-sm font-bold text-amber-300">
              {txt(`x${inventory.reserveAmmo.frag}`)}
            </span>
          ) : (
            <span>{txt(activeDef.nameEn)}</span>
          )}
        </div>
        {/* Weapon strip */}
        <div className="flex flex-wrap justify-end gap-1 max-w-[260px]">
          {inventory.ownedWeapons.map((wid) => (
            <button
              key={wid}
              type="button"
              onClick={() => !editMode && onSelectWeapon(wid)}
              className={`px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer ${
                wid === activeWeapon
                  ? 'bg-red-600 border-red-400 text-white'
                  : 'bg-[#161c26] border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {WEAPON_DEFS[wid].nameUk.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Widget: Med Bay Quick Button */}
      <button
        type="button"
        style={widgetStyle('btn_med')}
        onPointerDown={(e) => {
          if (editMode) startWidgetDrag('btn_med', e);
        }}
        onPointerMove={moveWidgetDrag}
        onPointerUp={endWidgetDrag}
        onClick={() => !editMode && onOpenMedical()}
        className={`absolute min-h-[44px] px-3 py-2 rounded-md bg-[#0b0e14]/90 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 pointer-events-auto cursor-pointer ${editBoxClass}`}
      >
        <HeartPulse className="w-4 h-4" />
        <span>Медицина (Tab)</span>
      </button>

      {/* Widget: Backpack Inventory Button */}
      <button
        type="button"
        style={widgetStyle('btn_inventory')}
        onPointerDown={(e) => {
          if (editMode) startWidgetDrag('btn_inventory', e);
        }}
        onPointerMove={moveWidgetDrag}
        onPointerUp={endWidgetDrag}
        onClick={() => !editMode && onOpenInventory()}
        className={`absolute min-h-[44px] px-3 py-2 rounded-md bg-[#0b0e14]/90 border border-sky-500/40 text-sky-300 text-xs font-semibold flex items-center gap-1.5 pointer-events-auto cursor-pointer ${editBoxClass}`}
      >
        <Backpack className="w-4 h-4" />
        <span>
          Інвентар (I) · {inventory.totalWeightKg.toFixed(1)}kg
        </span>
      </button>

      {/* Widget: Gesture Communication Button */}
      <button
        type="button"
        style={widgetStyle('btn_gesture')}
        onPointerDown={(e) => {
          if (editMode) startWidgetDrag('btn_gesture', e);
        }}
        onPointerMove={moveWidgetDrag}
        onPointerUp={endWidgetDrag}
        onClick={() => !editMode && setGestureOpen((v) => !v)}
        className={`absolute min-h-[44px] px-3 py-2 rounded-md bg-[#0b0e14]/90 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 pointer-events-auto cursor-pointer ${editBoxClass}`}
      >
        <Hand className="w-4 h-4" />
        <span>Жести (G)</span>
      </button>

      {/* Casualties: Unknown Bottom Moodle Status Strip (PC & non-edit) */}
      {!editMode && snapshot.phase === 'playing' && (
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={onOpenMedical}
            title="Відкрити панель здоров’я (Tab)"
            className="w-9 h-9 rounded bg-[#141920]/95 border-2 border-emerald-500/70 flex items-center justify-center text-emerald-400 hover:bg-[#1b2430] cursor-pointer"
          >
            <HeartPulse className="w-4 h-4" />
          </button>

          {totalBleed + phys.internalBleedRate > 0.3 && (
            <div
              title={`Кровотеча -${(totalBleed + phys.internalBleedRate).toFixed(1)} mL/s`}
              className="w-8 h-8 rounded-full bg-red-900/95 border-2 border-white/85 flex items-center justify-center text-[11px] font-bold text-red-100"
            >
              🩸
            </div>
          )}
          {phys.pain > 20 && (
            <div
              title={`Біль ${Math.round(phys.pain)}%`}
              className="w-8 h-8 rounded-full bg-amber-800/95 border-2 border-white/85 flex items-center justify-center text-[11px] font-bold text-amber-100"
            >
              ⚡
            </div>
          )}
          {phys.shockLevel > 22 && (
            <div
              title={`Шок ${Math.round(phys.shockLevel)}%`}
              className="w-8 h-8 rounded-full bg-red-950/95 border-2 border-white/85 flex items-center justify-center text-[11px] font-bold text-red-200"
            >
              !
            </div>
          )}
          {anyFracture && (
            <div
              title="Перелом кінцівки"
              className="w-8 h-8 rounded-full bg-orange-800/95 border-2 border-white/85 flex items-center justify-center text-[11px] font-bold text-orange-100"
            >
              🦴
            </div>
          )}
          {anyShrapnel && (
            <div
              title="Стороннє тіло / Уламок"
              className="w-8 h-8 rounded-full bg-stone-800/95 border-2 border-white/85 flex items-center justify-center text-[11px] font-bold text-amber-200"
            >
              ✕
            </div>
          )}
          {phys.oxygenPct < 88 && (
            <div
              title={`Гіпоксія ${Math.round(phys.oxygenPct)}%`}
              className="w-8 h-8 rounded-full bg-cyan-900/95 border-2 border-white/85 flex items-center justify-center text-[10px] font-bold text-cyan-100"
            >
              O₂
            </div>
          )}
          {phys.infectionPhase === 2 && (
            <div
              title={`Інфекція Фаза 2 · Сепсис ${Math.round(phys.sepsis)}%`}
              className="w-8 h-8 rounded-full bg-lime-900/95 border-2 border-lime-400 flex items-center justify-center text-[10px] font-bold text-lime-100"
            >
              ☣2
            </div>
          )}
          {phys.overdose !== 'none' && (
            <div
              title={`Передозування: ${phys.overdose}`}
              className="w-8 h-8 rounded-full bg-purple-900/95 border-2 border-white/85 flex items-center justify-center text-[10px] font-bold text-purple-100"
            >
              ☣
            </div>
          )}
        </div>
      )}

      {/* Gesture Communication Radial / Grid Popover */}
      {gestureOpen && !editMode && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-80 max-w-[92vw] rounded-lg bg-[#0d1118]/96 border border-white/20 p-3 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-xs font-bold text-white uppercase">
              Комунікація з ботами / Gestures
            </span>
            <button
              type="button"
              onClick={() => setGestureOpen(false)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {GESTURE_DEFS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onTriggerGesture(g.id);
                  setGestureOpen(false);
                }}
                className="min-h-[48px] p-2 rounded bg-[#161d29] hover:bg-[#202a3b] border border-white/10 text-left cursor-pointer"
              >
                <div className="text-xs font-bold text-white">{g.nameUk}</div>
                <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                  {g.hintUk}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contextual Nearby Loot / Bot Prompt */}
      {(snapshot.nearbyPrompt || editMode) && (
        <button
          type="button"
          style={widgetStyle('btn_interact')}
          onPointerDown={(e) => {
            if (editMode) startWidgetDrag('btn_interact', e);
          }}
          onPointerMove={moveWidgetDrag}
          onPointerUp={endWidgetDrag}
          onClick={() => {
            if (editMode) return;
            if (snapshot.nearbyPrompt?.type === 'loot') onOpenLoot();
            else setGestureOpen(true);
          }}
          className={`absolute min-h-[44px] px-4 py-2 rounded-md bg-[#0b0e14]/92 border border-amber-400/50 text-white text-xs font-semibold flex items-center gap-2 pointer-events-auto cursor-pointer ${editBoxClass}`}
        >
          <PackageOpen className="w-4 h-4 text-amber-400" />
          <span>
            {editMode
              ? 'Кнопка дії / Interact'
              : snapshot.nearbyPrompt?.type === 'loot'
                ? txt(`[E] Обшукати: ${snapshot.nearbyPrompt.labelUk}`)
                : txt(`${snapshot.nearbyPrompt?.labelUk ?? ''} — [G] Жести`)}
          </span>
        </button>
      )}

      {/* Touch Controls (Rendered in Touch Mode or HUD Edit Mode) */}
      {(isTouch || editMode) && (
        <>
          {/* Virtual Dynamic Movement Joystick */}
          <div
            style={widgetStyle('joystick')}
            onPointerDown={(e) => {
              if (editMode) {
                startWidgetDrag('joystick', e);
                return;
              }
              joyPointerId.current = e.pointerId;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              joyOrigin.current = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (editMode) {
                moveWidgetDrag(e);
                return;
              }
              if (joyPointerId.current !== e.pointerId) return;
              const maxR = 44;
              let dx = e.clientX - joyOrigin.current.x;
              let dy = e.clientY - joyOrigin.current.y;
              const dist = Math.hypot(dx, dy);
              if (dist > maxR) {
                dx = (dx / dist) * maxR;
                dy = (dy / dist) * maxR;
              }
              setJoyKnob({ x: dx, y: dy });
              onTouchMove(dx / maxR, dy / maxR);
            }}
            onPointerUp={(e) => {
              if (editMode) {
                endWidgetDrag();
                return;
              }
              if (joyPointerId.current === e.pointerId) {
                joyPointerId.current = null;
                setJoyKnob({ x: 0, y: 0 });
                onTouchMove(0, 0);
              }
            }}
            onPointerCancel={() => {
              joyPointerId.current = null;
              setJoyKnob({ x: 0, y: 0 });
              onTouchMove(0, 0);
            }}
            className={`absolute w-28 h-28 rounded-full bg-[#0b0e14]/70 border-2 border-white/20 flex items-center justify-center pointer-events-auto touch-none ${editBoxClass}`}
          >
            <div
              className="w-11 h-11 rounded-full bg-white/80 border border-slate-900 pointer-events-none"
              style={{
                transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
              }}
            />
          </div>

          {/* Touch Fire Button */}
          <button
            type="button"
            style={widgetStyle('btn_fire')}
            onPointerDown={(e) => {
              if (editMode) {
                startWidgetDrag('btn_fire', e);
                return;
              }
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              onTouchFire(true);
            }}
            onPointerMove={moveWidgetDrag}
            onPointerUp={() => {
              if (editMode) endWidgetDrag();
              else onTouchFire(false);
            }}
            onPointerCancel={() => onTouchFire(false)}
            className={`absolute w-16 h-16 rounded-full bg-red-600/88 border-2 border-red-300/70 text-white flex items-center justify-center pointer-events-auto touch-none ${editBoxClass}`}
            aria-label="Fire"
          >
            <Crosshair className="w-7 h-7" />
          </button>

          {/* Touch ADS Button */}
          <button
            type="button"
            style={widgetStyle('btn_ads')}
            onPointerDown={(e) => editMode && startWidgetDrag('btn_ads', e)}
            onPointerMove={moveWidgetDrag}
            onPointerUp={endWidgetDrag}
            onClick={() => !editMode && onToggleAds()}
            className={`absolute min-w-[48px] min-h-[48px] rounded-full bg-[#0b0e14]/85 border border-white/25 text-[11px] font-bold text-white pointer-events-auto ${editBoxClass}`}
          >
            ADS
          </button>

          {/* Touch Reload Button */}
          <button
            type="button"
            style={widgetStyle('btn_reload')}
            onPointerDown={(e) => editMode && startWidgetDrag('btn_reload', e)}
            onPointerMove={moveWidgetDrag}
            onPointerUp={endWidgetDrag}
            onClick={() => !editMode && onReload()}
            className={`absolute min-w-[46px] min-h-[46px] rounded-full bg-[#0b0e14]/85 border border-white/25 text-white flex items-center justify-center pointer-events-auto ${editBoxClass}`}
            aria-label="Reload"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Touch Jump */}
          <button
            type="button"
            style={widgetStyle('btn_jump')}
            onPointerDown={(e) => editMode && startWidgetDrag('btn_jump', e)}
            onPointerMove={moveWidgetDrag}
            onPointerUp={endWidgetDrag}
            onClick={() => !editMode && onJump()}
            className={`absolute min-w-[46px] min-h-[46px] rounded-full bg-[#0b0e14]/85 border border-white/25 text-[11px] font-bold text-white pointer-events-auto ${editBoxClass}`}
          >
            UP
          </button>

          {/* Touch Crouch */}
          <button
            type="button"
            style={widgetStyle('btn_crouch')}
            onPointerDown={(e) => editMode && startWidgetDrag('btn_crouch', e)}
            onPointerMove={moveWidgetDrag}
            onPointerUp={endWidgetDrag}
            onClick={() => !editMode && onCrouch()}
            className={`absolute min-w-[46px] min-h-[46px] rounded-full bg-[#0b0e14]/85 border border-white/25 text-[10px] font-bold text-white pointer-events-auto ${editBoxClass}`}
          >
            {snapshot.isCrouching ? 'STAND' : 'DUCK'}
          </button>

          {/* Reality Crusher Fling Button */}
          {(snapshot.crusherHolding || editMode) && (
            <button
              type="button"
              style={widgetStyle('btn_crusher_push')}
              onPointerDown={(e) =>
                editMode && startWidgetDrag('btn_crusher_push', e)
              }
              onPointerMove={moveWidgetDrag}
              onPointerUp={endWidgetDrag}
              onClick={() => !editMode && onCrusherThrow()}
              className={`absolute min-h-[44px] px-3 rounded-md bg-sky-600/90 border border-sky-300 text-xs font-bold text-white pointer-events-auto ${editBoxClass}`}
            >
              Кинути / Fling
            </button>
          )}
        </>
      )}

      {/* HUD Layout Customizer Floating Inspector Bar */}
      {editMode && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[94vw] max-w-xl rounded-lg bg-[#0d1118]/96 border border-sky-400/50 p-3 shadow-2xl pointer-events-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-300">
              <Sliders className="w-4 h-4" />
              <span>
                Редактор HUD: перетягуйте елементи · Обрано:{' '}
                <span className="text-white">{WIDGET_LABELS[selectedWidget]}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateConfig(structuredClone(DEFAULT_HUD_LAYOUT))}
                className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[11px] text-white cursor-pointer"
              >
                Скинути
              </button>
              <button
                type="button"
                onClick={onExitEditMode}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Готово</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center text-[11px] text-slate-300">
            <label className="flex flex-col gap-1">
              <span>Розмір: {Math.round(hudConfig.widgets[selectedWidget].scale * 100)}%</span>
              <input
                type="range"
                min={0.6}
                max={1.5}
                step={0.05}
                value={hudConfig.widgets[selectedWidget].scale}
                onChange={(e) =>
                  onUpdateConfig({
                    ...hudConfig,
                    widgets: {
                      ...hudConfig.widgets,
                      [selectedWidget]: {
                        ...hudConfig.widgets[selectedWidget],
                        scale: parseFloat(e.target.value),
                      },
                    },
                  })
                }
                className="accent-sky-400"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Прозорість: {Math.round(hudConfig.widgets[selectedWidget].opacity * 100)}%</span>
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.05}
                value={hudConfig.widgets[selectedWidget].opacity}
                onChange={(e) =>
                  onUpdateConfig({
                    ...hudConfig,
                    widgets: {
                      ...hudConfig.widgets,
                      [selectedWidget]: {
                        ...hudConfig.widgets[selectedWidget],
                        opacity: parseFloat(e.target.value),
                      },
                    },
                  })
                }
                className="accent-sky-400"
              />
            </label>

            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  ...hudConfig,
                  widgets: {
                    ...hudConfig.widgets,
                    [selectedWidget]: {
                      ...hudConfig.widgets[selectedWidget],
                      visible: !hudConfig.widgets[selectedWidget].visible,
                    },
                  },
                })
              }
              className="min-h-[38px] px-2 rounded bg-[#161e2b] border border-white/15 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {hudConfig.widgets[selectedWidget].visible ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Видимий</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Схований</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
