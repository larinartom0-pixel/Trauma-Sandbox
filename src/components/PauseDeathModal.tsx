import React, { useEffect, useState } from 'react';
import {
  RotateCcw,
  Sliders,
  Volume2,
  VolumeX,
  Play,
  Maximize2,
  Minimize2,
  ExternalLink,
  Users,
  Copy,
  Check,
  LogOut,
  Crown,
} from 'lucide-react';
import { getFullscreenElement, toggleFullscreenCompat } from '../game/data';
import { ControlMode, HudLayoutConfig, MultiplayerSnapshot } from '../game/types';

interface PauseDeathModalProps {
  mode: 'paused' | 'dead';
  causeOfDeath: string | null;
  bloodMl: number;
  hudConfig: HudLayoutConfig;
  multiplayer: MultiplayerSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onRespawnMultiplayer: () => void;
  onLeaveMultiplayer: () => void;
  onOpenHudEditor: () => void;
  onUpdateConfig: (next: HudLayoutConfig) => void;
}

export const PauseDeathModal: React.FC<PauseDeathModalProps> = ({
  mode,
  causeOfDeath,
  bloodMl,
  hudConfig,
  multiplayer,
  onResume,
  onRestart,
  onRespawnMultiplayer,
  onLeaveMultiplayer,
  onOpenHudEditor,
  onUpdateConfig,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    Boolean(getFullscreenElement()),
  );
  const [fsBlockedMsg, setFsBlockedMsg] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

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

  const handleToggleFullscreen = async () => {
    const res = await toggleFullscreenCompat();
    setIsFullscreen(res.active);
    if (res.blocked) setFsBlockedMsg(true);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#070a0f]/90 pointer-events-auto">
      <div className="w-full max-w-md rounded-lg bg-[#0e131b] border border-white/15 p-6 shadow-2xl space-y-5">
        {mode === 'dead' ? (
          <div>
            <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">
              Клінічна смерть · Flatline
            </div>
            <h2 className="font-display text-3xl font-extrabold text-white">
              ПЕРСОНАЖ ЗАГИНУВ
            </h2>
            <p className="text-sm text-slate-300 mt-2">
              Причина / Cause:{' '}
              <span className="text-red-300 font-semibold">
                {causeOfDeath ?? 'Критична травма / Critical Trauma'}
              </span>
            </p>
            <p className="text-xs font-mono-num text-slate-400 mt-1">
              Залишок крові / Blood Volume: {Math.round(bloodMl)} mL
            </p>
          </div>
        ) : (
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Пауза та Налаштування · Pause
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Керування, чутливість та редактор інтерфейсу
            </p>
          </div>
        )}

        {mode === 'paused' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Режим керування / Control Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['auto', 'Авто'],
                    ['pc', 'ПК Миша'],
                    ['touch', 'Сенсор'],
                  ] as [ControlMode, string][]
                ).map(([cm, lbl]) => (
                  <button
                    key={cm}
                    type="button"
                    onClick={() =>
                      onUpdateConfig({ ...hudConfig, controlMode: cm })
                    }
                    className={`min-h-[40px] rounded text-xs font-semibold cursor-pointer ${
                      hudConfig.controlMode === cm
                        ? 'bg-red-600 text-white'
                        : 'bg-[#151c27] text-slate-300 hover:text-white'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Чутливість огляду / Sensitivity</span>
                <span className="font-mono-num">
                  {hudConfig.sensitivity.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.4}
                max={2.2}
                step={0.05}
                value={hudConfig.sensitivity}
                onChange={(e) =>
                  onUpdateConfig({
                    ...hudConfig,
                    sensitivity: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-red-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({ ...hudConfig, muted: !hudConfig.muted })
                }
                className="flex-1 min-h-[44px] px-3 rounded bg-[#151c27] hover:bg-[#1e2736] text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                {hudConfig.muted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
                <span>{hudConfig.muted ? 'Звук вимкнено' : 'Звук увімкнено'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenHudEditor}
                className="flex-1 min-h-[44px] px-3 rounded bg-[#151c27] hover:bg-[#1e2736] text-xs font-semibold text-sky-300 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sliders className="w-4 h-4" />
                <span>Редактор HUD</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="w-full min-h-[42px] px-3 rounded bg-[#151c27] hover:bg-[#1e2736] text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-sky-300" />
              ) : (
                <Maximize2 className="w-4 h-4 text-sky-300" />
              )}
              <span>
                {isFullscreen ? 'Вийти з повного екрана' : 'Повний екран / Fullscreen'}
              </span>
            </button>

            {fsBlockedMsg && (
              <div className="rounded bg-amber-950/60 border border-amber-400/40 p-2.5 text-[11px] text-amber-100 flex items-center justify-between gap-2">
                <span>Повний екран заблоковано вікном перегляду (натисніть F11).</span>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Нова вкладка</span>
                </a>
              </div>
            )}
          </div>
        )}

        {multiplayer.connected && (
          <div className="rounded-md bg-[#121823] border border-sky-500/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                <Users className="w-3.5 h-3.5" />
                <span className="truncate">{multiplayer.roomName}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (multiplayer.roomId) {
                    void navigator.clipboard?.writeText(multiplayer.roomId);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 1800);
                  }
                }}
                className="px-2 py-1 rounded bg-[#090d14] border border-white/10 text-[10px] font-mono-num text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copiedId ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Скопійовано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>ID: {multiplayer.roomId}</span>
                  </>
                )}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30 text-emerald-200 inline-flex items-center gap-1">
                {multiplayer.isHost && <Crown className="w-3 h-3 text-amber-300" />}
                {multiplayer.playerName} (Ви)
              </span>
              {multiplayer.peers.map((p) => (
                <span
                  key={p.id}
                  className="px-2 py-0.5 rounded bg-[#0a0f18] border border-white/10 text-slate-200 inline-flex items-center gap-1"
                >
                  {p.isHost && <Crown className="w-3 h-3 text-amber-300" />}
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          {mode === 'paused' && (
            <button
              type="button"
              onClick={onResume}
              className="min-h-[48px] w-full rounded bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Продовжити / Resume</span>
            </button>
          )}
          {mode === 'dead' && multiplayer.connected && (
            <button
              type="button"
              onClick={onRespawnMultiplayer}
              className="min-h-[48px] w-full rounded bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Відродитись у кімнаті</span>
            </button>
          )}
          {(!multiplayer.connected || multiplayer.isHost) && mode !== 'dead' && (
            <button
              type="button"
              onClick={onRestart}
              className="min-h-[46px] w-full rounded bg-white/10 hover:bg-white/20 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Перезапустити світ / Restart Town</span>
            </button>
          )}
          {!multiplayer.connected && mode === 'dead' && (
            <button
              type="button"
              onClick={onRestart}
              className="min-h-[46px] w-full rounded bg-white/10 hover:bg-white/20 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Перезапустити світ / Restart Town</span>
            </button>
          )}
          {multiplayer.connected && (
            <button
              type="button"
              onClick={onLeaveMultiplayer}
              className="min-h-[44px] w-full rounded bg-red-950/70 hover:bg-red-900/80 border border-red-500/35 text-red-200 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Вийти з кімнати (P2P)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
