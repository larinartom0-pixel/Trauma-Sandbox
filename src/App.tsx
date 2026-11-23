import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { LootModal } from './components/LootModal';
import { MedicalModal } from './components/MedicalModal';
import { PauseDeathModal } from './components/PauseDeathModal';
import { TitleScreen } from './components/TitleScreen';
import { detectTouchMode, loadHudLayout, saveHudLayout } from './game/data';
import { TraumaSandboxEngine } from './game/engine';
import { GameSnapshot, HudLayoutConfig } from './game/types';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TraumaSandboxEngine | null>(null);

  const [hudConfig, setHudConfig] = useState<HudLayoutConfig>(() =>
    loadHudLayout(),
  );
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [hudEditMode, setHudEditMode] = useState(false);

  const updateHudConfig = useCallback((next: HudLayoutConfig) => {
    setHudConfig(next);
    saveHudLayout(next);
    engineRef.current?.setSensitivity(next.sensitivity);
    engineRef.current?.setMuted(next.muted);
    engineRef.current?.setControlMode(next.controlMode);
  }, []);

  useEffect(() => {
    if (!canvasMountRef.current) return;
    const engine = new TraumaSandboxEngine(
      canvasMountRef.current,
      (snap) => setSnapshot(snap),
      hudConfig.sensitivity,
      hudConfig.muted,
      hudConfig.controlMode,
    );
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartFromTitle = useCallback(() => {
    const isTouch = detectTouchMode(hudConfig.controlMode);
    engineRef.current?.startPlay(!isTouch);
  }, [hudConfig.controlMode]);

  const handleOpenHudEditorFromTitle = useCallback(() => {
    engineRef.current?.startPlay(false);
    setHudEditMode(true);
  }, []);

  const phase = snapshot?.phase ?? 'title';
  const isConscious =
    snapshot !== null &&
    snapshot.physiology.consciousness !== 'unconscious' &&
    snapshot.physiology.consciousness !== 'cardiacArrest' &&
    snapshot.physiology.consciousness !== 'dead';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0b0e13]">
      {/* Isolated WebGL Viewport Container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Title Screen */}
      {phase === 'title' && (
        <TitleScreen
          onStart={handleStartFromTitle}
          onOpenSettings={handleOpenHudEditorFromTitle}
          controlMode={hudConfig.controlMode}
          onChangeControlMode={(mode) =>
            updateHudConfig({ ...hudConfig, controlMode: mode })
          }
          muted={hudConfig.muted}
          onToggleMute={() =>
            updateHudConfig({ ...hudConfig, muted: !hudConfig.muted })
          }
        />
      )}

      {/* Active Gameplay HUD & Customizer */}
      {snapshot && phase !== 'title' && (
        <GameHud
          snapshot={snapshot}
          hudConfig={hudConfig}
          editMode={hudEditMode}
          onExitEditMode={() => {
            setHudEditMode(false);
            if (!detectTouchMode(hudConfig.controlMode)) {
              engineRef.current?.requestPointerLock();
            }
          }}
          onUpdateConfig={updateHudConfig}
          onPause={() => engineRef.current?.pauseGame()}
          onOpenMedical={() => engineRef.current?.openMedical()}
          onOpenInventory={() => engineRef.current?.openInventory()}
          onOpenLoot={() => engineRef.current?.openNearbyLoot()}
          onSelectWeapon={(w) => engineRef.current?.selectWeapon(w)}
          onTriggerGesture={(g) => engineRef.current?.triggerGesture(g)}
          onTouchMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
          onTouchLookDelta={(dx, dy) =>
            engineRef.current?.addTouchLookDelta(dx, dy)
          }
          onTouchFire={(held) => engineRef.current?.setTouchFire(held)}
          onToggleAds={() => engineRef.current?.toggleAds()}
          onReload={() => engineRef.current?.triggerReload()}
          onJump={() => engineRef.current?.triggerJump()}
          onCrouch={() => engineRef.current?.toggleCrouch()}
          onCrusherThrow={() => engineRef.current?.crusherThrow()}
          onCycleCamera={() => engineRef.current?.cycleCameraMode()}
          onToggleFlashlight={() => engineRef.current?.toggleFlashlight()}
          onAdvanceTime={() => engineRef.current?.advanceTimeOfDay(4)}
          onPerformCpr={() => engineRef.current?.performCprAction()}
        />
      )}

      {/* Interactive Medical / Trauma & Overdose Workbench (Real-Time, Non-Pausing) */}
      {snapshot && phase === 'medical' && isConscious && (
        <MedicalModal
          phys={snapshot.physiology}
          inventory={snapshot.inventory}
          onClose={() => engineRef.current?.closeMedical()}
          onOpenInventory={() => engineRef.current?.openInventory()}
          onBandageSwipe={(limb, pct, itemUid) =>
            engineRef.current?.performBandageSwipe(limb, pct, itemUid)
          }
          onToggleTourniquet={(limb, itemUid) =>
            engineRef.current?.performTourniquet(limb, itemUid)
          }
          onApplySplint={(limb, itemUid) =>
            engineRef.current?.performSplint(limb, itemUid)
          }
          onExtractShrapnel={(limb) =>
            engineRef.current?.performExtractShrapnel(limb)
          }
          onWoundSlip={(limb) => engineRef.current?.performWoundSlip(limb)}
          onSyringeStep={(medId, limb, frac, fin, broken, itemUid) =>
            engineRef.current?.performSyringeStep(
              medId,
              limb,
              frac,
              fin,
              broken,
              itemUid,
            )
          }
          onBloodTransfusion={(limb, viaUsedSyringe, bagUid, conduitUid) =>
            engineRef.current?.performBloodTransfusion(
              limb,
              viaUsedSyringe,
              bagUid,
              conduitUid,
            )
          }
          onTakeAntibiotics={(itemUid) =>
            engineRef.current?.performTakeAntibiotics(itemUid)
          }
          onPerformCpr={() => engineRef.current?.performCprAction()}
        />
      )}

      {/* Grid-Slot Backpack Inventory OR Scavenging Loot Modal (Real-Time, Non-Pausing) */}
      {snapshot &&
        isConscious &&
        (phase === 'inventory' || (phase === 'loot' && snapshot.activeLoot)) && (
          <LootModal
            mode={phase === 'loot' ? 'loot' : 'inventory'}
            inventory={snapshot.inventory}
            activeWeapon={snapshot.activeWeapon}
            bundle={snapshot.activeLoot}
            onMoveBackpackItem={(uid, x, y) =>
              engineRef.current?.moveBackpackItem(uid, x, y) ?? false
            }
            onDropBackpackItem={(uid) =>
              engineRef.current?.dropBackpackItem(uid)
            }
            onUseBackpackItem={(uid) => engineRef.current?.useBackpackItem(uid)}
            onEquipBackpackItem={(uid, source) =>
              engineRef.current?.equipBackpackFromItem(uid, source) ?? false
            }
            onTransferLootItem={(uid, x, y) =>
              engineRef.current?.transferLootItem(uid, x, y) ?? false
            }
            onTakeAll={() => engineRef.current?.takeAllLoot()}
            onOpenMedical={() => engineRef.current?.openMedical()}
            onClose={() =>
              phase === 'inventory'
                ? engineRef.current?.closeInventory()
                : engineRef.current?.resumeGame()
            }
          />
        )}

      {/* Pause or Death Screen */}
      {snapshot && (phase === 'paused' || phase === 'dead') && (
        <PauseDeathModal
          mode={phase}
          causeOfDeath={snapshot.physiology.causeOfDeath}
          bloodMl={snapshot.physiology.bloodVolumeMl}
          hudConfig={hudConfig}
          onResume={() => engineRef.current?.resumeGame()}
          onRestart={() => engineRef.current?.restartWorld()}
          onOpenHudEditor={() => {
            engineRef.current?.resumeGame(false);
            setHudEditMode(true);
          }}
          onUpdateConfig={updateHudConfig}
        />
      )}
    </div>
  );
}
