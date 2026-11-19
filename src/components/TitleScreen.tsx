import React, { useEffect, useState } from 'react';
import { Sliders, Volume2, VolumeX, Play, Maximize2, Minimize2, ExternalLink } from 'lucide-react';
import { getFullscreenElement, toggleFullscreenCompat } from '../game/data';
import { ControlMode } from '../game/types';

interface TitleScreenProps {
  onStart: () => void;
  onOpenSettings: () => void;
  controlMode: ControlMode;
  onChangeControlMode: (mode: ControlMode) => void;
  muted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStart,
  onOpenSettings,
  controlMode,
  onChangeControlMode,
  muted,
  onToggleMute,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    Boolean(getFullscreenElement()),
  );
  const [fsBlockedMsg, setFsBlockedMsg] = useState(false);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-between p-6 md:p-12 pointer-events-auto bg-gradient-to-r from-[#090c10]/92 via-[#090c10]/65 to-transparent">
      {/* Top quiet header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <svg
            width="34"
            height="34"
            viewBox="0 0 36 36"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect
              x="2"
              y="2"
              width="32"
              height="32"
              rx="4"
              stroke="#dc2626"
              strokeWidth="2"
            />
            <path
              d="M18 8V28M8 18H28"
              stroke="#e2e8f0"
              strokeWidth="3"
              strokeLinecap="square"
            />
            <path
              d="M7 24L13 24L16 14L20 26L23 19L29 19"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-display text-sm tracking-widest text-slate-300 uppercase">
            Trauma Sandbox
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-[#12161e]/90 border border-white/10 text-slate-300 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            aria-label="Повний екран / Fullscreen"
            title="Повний екран / Fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 text-sky-300" />
            ) : (
              <Maximize2 className="w-5 h-5" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-[#12161e]/90 border border-white/10 text-slate-300 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            aria-label={muted ? 'Увімкнути звук / Unmute' : 'Вимкнути звук / Mute'}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {fsBlockedMsg && (
        <div className="fixed top-16 right-6 z-50 max-w-sm rounded-lg bg-[#101622]/96 border border-amber-400/50 p-3 shadow-2xl text-xs text-slate-200 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span>
              Браузер або вікно перегляду блокує повний екран (іноді й маус-лок). Натисніть <strong className="text-white">F11</strong> або відкрийте гру в окремій вкладці:
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

      {/* Center-Left Hero Lockup */}
      <div className="max-w-xl my-auto">
        <p className="text-xs md:text-sm font-medium text-amber-400/95 tracking-wide mb-3">
          Покинуте містечко · Фізика тіл · Реалістична травматологія
        </p>

        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.04] text-balance mb-5">
          ТРАВМА-ПІСОЧНИЦЯ
          <span className="block text-xl sm:text-2xl font-semibold text-red-500 mt-2 tracking-normal">
            Gore &amp; Physiology Sandbox
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-lg mb-7">
          Величезний відкритий світ (400×400м) із 4 районами, зміною дня і ночі,
          реалістичними регдолами та смертельною системою травм. Жодних підказок, хто
          з ботів ворожий, а хто дружній — перевіряйте жестами та обшукуйте локації.
        </p>

        {/* Input Mode Selector */}
        <div className="mb-6">
          <div className="text-xs text-slate-400 mb-2">
            Режим керування / Control Profile
          </div>
          <div className="inline-flex p-1 rounded-md bg-[#11151d]/95 border border-white/10 gap-1">
            {(
              [
                ['auto', 'Авто / Auto'],
                ['pc', 'ПК Миша+WASD'],
                ['touch', 'Сенсор / Touch'],
              ] as [ControlMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeControlMode(mode)}
                className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap cursor-pointer ${
                  controlMode === mode
                    ? 'bg-red-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Primary CTA + Settings */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onStart}
            className="min-h-[48px] px-7 py-3 rounded-md bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-display font-bold text-base tracking-wide flex items-center gap-2.5 transition-all cursor-pointer shadow-lg shadow-red-950/50"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Почати гру / Start</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[48px] px-5 py-3 rounded-md bg-[#141923]/95 hover:bg-[#1c2331] border border-white/15 text-slate-200 font-medium text-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
            <span>Налаштувати HUD / Edit HUD</span>
          </button>
        </div>
      </div>

      {/* Bottom single-line control hint */}
      <div className="text-xs text-slate-400 font-mono-num">
        WASD Рух · Миша/Свайп Огляд · V Камера · F Ліхтар · T Час · E Лут · I Інвентар · G Жести · Tab Медицина
      </div>
    </div>
  );
};
