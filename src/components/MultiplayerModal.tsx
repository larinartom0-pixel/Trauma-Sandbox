import React, { useCallback, useEffect, useState } from 'react';
import {
  Crown,
  Plus,
  RefreshCw,
  Shield,
  Swords,
  Users,
  Wifi,
  WifiOff,
  X,
  Bot,
  LogIn,
} from 'lucide-react';
import { P2PRoomInfo } from '../game/types';

interface MultiplayerModalProps {
  initialPlayerName: string;
  onClose: () => void;
  onCheckStatus: () => Promise<{
    online: boolean;
    roomsCount: number;
    latencyMs: number;
  }>;
  onFetchRooms: () => Promise<P2PRoomInfo[]>;
  onCreateRoom: (opts: {
    roomName: string;
    playerName: string;
    maxPlayers: number;
    friendlyFire: boolean;
    botsEnabled: boolean;
  }) => Promise<{ ok: boolean; error?: string; roomId?: string }>;
  onJoinRoom: (opts: {
    roomId: string;
    playerName: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  initialPlayerName,
  onClose,
  onCheckStatus,
  onFetchRooms,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [playerName, setPlayerName] = useState(initialPlayerName);
  const [roomName, setRoomName] = useState(`Місто ${initialPlayerName}`);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [friendlyFire, setFriendlyFire] = useState(true);
  const [botsEnabled, setBotsEnabled] = useState(true);
  const [directRoomId, setDirectRoomId] = useState('');

  const [rooms, setRooms] = useState<P2PRoomInfo[]>([]);
  const [serverStatus, setServerStatus] = useState<{
    checked: boolean;
    online: boolean;
    roomsCount: number;
    latencyMs: number;
  }>({ checked: false, online: false, roomsCount: 0, latencyMs: 0 });
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [st, list] = await Promise.all([onCheckStatus(), onFetchRooms()]);
      setServerStatus({ checked: true, ...st });
      setRooms(list);
    } finally {
      setLoading(false);
    }
  }, [onCheckStatus, onFetchRooms]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyAction) return;
    setError(null);
    setBusyAction(true);
    try {
      const res = await onCreateRoom({
        roomName: roomName.trim() || `Кімната ${playerName.trim() || 'Сталкер'}`,
        playerName: playerName.trim() || 'Сталкер',
        maxPlayers,
        friendlyFire,
        botsEnabled,
      });
      if (!res.ok) {
        setError(res.error ?? 'Не вдалося створити кімнату');
      } else {
        onClose();
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleJoin = async (targetRoomId: string) => {
    if (busyAction) return;
    setError(null);
    setBusyAction(true);
    try {
      const res = await onJoinRoom({
        roomId: targetRoomId,
        playerName: playerName.trim() || 'Сталкер',
      });
      if (!res.ok) {
        setError(res.error ?? 'Не вдалося приєднатися');
      } else {
        onClose();
      }
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#06090e]/92 pointer-events-auto overflow-y-auto">
      <div className="w-full max-w-4xl rounded-lg bg-[#0d121a] border border-white/15 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-[#111722]">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white leading-tight">
                Мультиплеєр P2P · WebRTC
              </h2>
              <p className="text-[11px] text-slate-400">
                Пряме P2P з’єднання між гравцями через сервер сигналізації
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`px-2.5 py-1 rounded text-[11px] font-mono-num flex items-center gap-1.5 border ${
                !serverStatus.checked
                  ? 'bg-slate-900 border-white/10 text-slate-400'
                  : serverStatus.online
                    ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/80 border-red-500/40 text-red-300'
              }`}
            >
              {serverStatus.online ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>
                {!serverStatus.checked
                  ? 'Перевірка…'
                  : serverStatus.online
                    ? `Онлайн · ${serverStatus.latencyMs}мс`
                    : 'Офлайн'}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] rounded bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              aria-label="Закрити"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Player Nickname + Error Bar */}
        <div className="px-5 pt-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[#121823] border border-white/10 rounded-md p-3">
            <label className="text-xs font-semibold text-slate-300 shrink-0">
              Ваш позивний:
            </label>
            <input
              type="text"
              maxLength={20}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Введіть ім’я..."
              className="flex-1 bg-[#090d14] border border-white/15 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-400"
            />
            <span className="text-[11px] text-slate-400 font-mono-num">
              Версія 1.0.0
            </span>
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded bg-red-950/90 border border-red-500/60 text-xs font-semibold text-red-200">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Main 2-Column Lobby Body */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Active Rooms List */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider">
                Доступні кімнати ({rooms.length})
              </h3>
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={loading}
                className="px-2.5 py-1.5 rounded bg-[#161e2b] hover:bg-[#1f293a] border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                />
                <span>Оновити</span>
              </button>
            </div>

            {/* Direct Join by ID */}
            <div className="flex gap-2">
              <input
                type="text"
                value={directRoomId}
                onChange={(e) => setDirectRoomId(e.target.value)}
                placeholder="Вставте ID кімнати для швидкого входу…"
                className="flex-1 bg-[#090d14] border border-white/15 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
              />
              <button
                type="button"
                disabled={busyAction || !directRoomId.trim()}
                onClick={() => void handleJoin(directRoomId)}
                className="px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Увійти</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {rooms.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/15 bg-[#0a0e15] p-6 text-center text-xs text-slate-400">
                  {loading
                    ? 'Завантаження списку кімнат…'
                    : 'Наразі активних кімнат немає. Створіть свою кімнату праворуч!'}
                </div>
              ) : (
                rooms.map((r) => {
                  const ff = r.meta?.friendlyFire ?? r.friendlyFire ?? true;
                  const bots = r.meta?.botsEnabled ?? true;
                  const full = r.playerCount >= r.maxPlayers;
                  return (
                    <div
                      key={r.id}
                      className="rounded-md bg-[#121823] border border-white/10 p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm text-white truncate">
                            {r.name}
                          </span>
                          <span className="text-[10px] font-mono-num text-slate-400 bg-black/30 px-1.5 py-0.5 rounded">
                            #{r.id}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <Crown className="w-3 h-3" />
                            {r.hostName}
                          </span>
                          <span className="font-mono-num text-sky-300">
                            {r.playerCount}/{r.maxPlayers} гравців
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                              ff
                                ? 'bg-red-950/80 text-red-300 border border-red-500/30'
                                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {ff ? (
                              <>
                                <Swords className="w-3 h-3" /> PvP Вкл
                              </>
                            ) : (
                              <>
                                <Shield className="w-3 h-3" /> Кооп (Без FF)
                              </>
                            )}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-slate-300">
                            <Bot className="w-3 h-3" />
                            {bots ? 'Боти' : 'Без ботів'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busyAction || full}
                        onClick={() => void handleJoin(r.id)}
                        className="min-h-[38px] px-4 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-xs font-bold text-white cursor-pointer"
                      >
                        {full ? 'Повна' : 'Приєднатися'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Create Room Form */}
          <form
            onSubmit={handleCreate}
            className="lg:col-span-5 rounded-md bg-[#121823] border border-white/10 p-4 space-y-3.5"
          >
            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4 text-red-400" />
              <span>Створити кімнату</span>
            </h3>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Назва кімнати
              </label>
              <input
                type="text"
                maxLength={32}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full bg-[#090d14] border border-white/15 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-red-400"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Макс. гравців: <span className="text-white font-mono-num">{maxPlayers}</span>
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[2, 4, 6, 8, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxPlayers(n)}
                    className={`py-1.5 rounded text-xs font-mono-num font-bold cursor-pointer ${
                      maxPlayers === n
                        ? 'bg-red-600 text-white'
                        : 'bg-[#090d14] text-slate-300 border border-white/10 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-between gap-2 p-2.5 rounded bg-[#090d14] border border-white/10 cursor-pointer">
                <div className="flex items-center gap-2 text-xs text-slate-200">
                  <Swords className="w-4 h-4 text-red-400" />
                  <span>Дружній вогонь (PvP між гравцями)</span>
                </div>
                <input
                  type="checkbox"
                  checked={friendlyFire}
                  onChange={(e) => setFriendlyFire(e.target.checked)}
                  className="accent-red-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between gap-2 p-2.5 rounded bg-[#090d14] border border-white/10 cursor-pointer">
                <div className="flex items-center gap-2 text-xs text-slate-200">
                  <Bot className="w-4 h-4 text-sky-400" />
                  <span>AI-боти у місті (керує хост)</span>
                </div>
                <input
                  type="checkbox"
                  checked={botsEnabled}
                  onChange={(e) => setBotsEnabled(e.target.checked)}
                  className="accent-sky-500 w-4 h-4"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={busyAction}
              className="w-full min-h-[44px] rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-950/40"
            >
              <Plus className="w-4 h-4" />
              <span>{busyAction ? 'Підключення…' : 'Створити та увійти'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
