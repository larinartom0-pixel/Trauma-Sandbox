import {
  BotAIState,
  BotArchetype,
  ConsciousnessState,
  GestureId,
  LimbId,
  P2PChatMessage,
  P2PPeerInfo,
  P2PRoomInfo,
  P2PRoomMeta,
  WeaponId,
} from './types';

export const SIGNAL_SERVER_URL = 'https://larinarten.pythonanywhere.com';
export const P2P_GAME_ID = 'trauma-sandbox-p2p';
export const P2P_CLIENT_VERSION = '1.0.0';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export interface RemoteBotWireState {
  id: string;
  nUk: string;
  arch: BotArchetype;
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: WeaponId;
  c: number;
  st: BotAIState;
  lL: boolean;
  rL: boolean;
  bMl: number;
}

export type FastPacket =
  | {
      t: 'p';
      x: number;
      y: number;
      z: number;
      yaw: number;
      vx: number;
      vz: number;
      w: WeaponId;
      c: number;
      a: boolean;
      r: boolean;
      f: boolean;
      b: number;
      con: ConsciousnessState;
      lB: boolean;
      wF: number;
    }
  | {
      t: 'bots';
      tod: number;
      list: RemoteBotWireState[];
    };

export type ReliablePacket =
  | { t: 'hello'; name: string; archetype: BotArchetype; tod?: number }
  | { t: 'chat'; name: string; text: string }
  | { t: 'shot'; w: WeaponId; x: number; y: number; z: number; dx: number; dy: number; dz: number }
  | { t: 'melee'; heavy: boolean }
  | { t: 'exp'; x: number; y: number; z: number; radius: number; maxDmg: number }
  | {
      t: 'hit';
      targetId: string;
      attackerName: string;
      limbId: LimbId;
      dmg: number;
      bleed: number;
      frac: number;
      sev: number;
      dx: number;
      dy: number;
      dz: number;
    }
  | {
      t: 'bot_hit';
      botId: string;
      limbId: LimbId;
      dmg: number;
      bleed: number;
      frac: number;
      sev: number;
      dx: number;
      dy: number;
      dz: number;
    }
  | { t: 'bot_speech'; botId: string; text: string; tone: 'neutral' | 'warn' | 'danger' | 'friendly' }
  | { t: 'gest'; g: GestureId }
  | { t: 'time'; tod: number };

interface PeerConnectionSlot {
  id: string;
  name: string;
  archetype: BotArchetype;
  pc: RTCPeerConnection;
  fastChannel: RTCDataChannel | null;
  eventsChannel: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
  remoteDescSet: boolean;
  connected: boolean;
}

export interface NetworkCallbacks {
  onStateChange: () => void;
  onPeerJoin: (peerId: string, name: string, archetype: BotArchetype) => void;
  onPeerLeave: (peerId: string, name: string) => void;
  onFastPacket: (peerId: string, pkt: FastPacket) => void;
  onReliablePacket: (peerId: string, pkt: ReliablePacket) => void;
  onHostChanged: (newHostId: string, amIHost: boolean) => void;
}

function getOrCreateTabPlayerId(): string {
  try {
    const key = 'trauma_p2p_player_id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }
}

export function loadSavedPlayerName(): string {
  try {
    const saved = localStorage.getItem('trauma_p2p_player_name');
    if (saved && saved.trim().length > 0) return saved.trim().slice(0, 20);
  } catch {
    // ignore
  }
  return `Сталкер_${Math.floor(100 + Math.random() * 899)}`;
}

export function savePlayerName(name: string) {
  try {
    localStorage.setItem('trauma_p2p_player_name', name.trim().slice(0, 20));
  } catch {
    // ignore
  }
}

export class P2PNetworkManager {
  readonly playerId: string;
  playerName: string;
  localArchetype: BotArchetype = 'survivor';

  connected = false;
  connecting = false;
  roomId: string | null = null;
  roomName: string | null = null;
  hostId: string | null = null;
  friendlyFire = true;
  botsEnabled = true;
  lastError: string | null = null;

  chatMessages: P2PChatMessage[] = [];
  private chatSeq = 1;

  private peers = new Map<string, PeerConnectionSlot>();
  private callbacks: NetworkCallbacks;
  private pollTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private rosterTimer: number | null = null;
  private pollingInFlight = false;
  private localTimeOfDayProvider: () => number;

  constructor(
    callbacks: NetworkCallbacks,
    getLocalTimeOfDay: () => number,
  ) {
    this.playerId = getOrCreateTabPlayerId();
    this.playerName = loadSavedPlayerName();
    this.callbacks = callbacks;
    this.localTimeOfDayProvider = getLocalTimeOfDay;

    window.addEventListener('beforeunload', this.handleBeforeUnload);
    window.addEventListener('pagehide', this.handleBeforeUnload);
  }

  get isHost(): boolean {
    return this.connected && this.hostId === this.playerId;
  }

  getPeerList(): P2PPeerInfo[] {
    const list: P2PPeerInfo[] = [];
    for (const slot of this.peers.values()) {
      list.push({
        id: slot.id,
        name: slot.name,
        connected: slot.connected,
        isHost: slot.id === this.hostId,
        archetype: slot.archetype,
      });
    }
    return list;
  }

  pushChatMessage(senderId: string, senderName: string, text: string, system = false) {
    this.chatMessages = [
      ...this.chatMessages.slice(-28),
      {
        id: this.chatSeq++,
        senderId,
        senderName,
        text: text.slice(0, 160),
        timestamp: Date.now(),
        system,
      },
    ];
    this.callbacks.onStateChange();
  }

  async checkServerStatus(): Promise<{
    online: boolean;
    roomsCount: number;
    latencyMs: number;
  }> {
    const t0 = performance.now();
    try {
      const res = await fetch(
        `${SIGNAL_SERVER_URL}/api/status?gameId=${encodeURIComponent(P2P_GAME_ID)}`,
        { method: 'GET', cache: 'no-store' },
      );
      if (!res.ok) return { online: false, roomsCount: 0, latencyMs: 0 };
      const data = (await res.json()) as { online?: boolean; roomsCount?: number };
      return {
        online: Boolean(data.online),
        roomsCount: Number(data.roomsCount ?? 0),
        latencyMs: Math.round(performance.now() - t0),
      };
    } catch {
      return { online: false, roomsCount: 0, latencyMs: 0 };
    }
  }

  async fetchRooms(): Promise<P2PRoomInfo[]> {
    try {
      const res = await fetch(
        `${SIGNAL_SERVER_URL}/api/rooms?gameId=${encodeURIComponent(P2P_GAME_ID)}`,
        { method: 'GET', cache: 'no-store' },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as P2PRoomInfo[]) : [];
    } catch {
      return [];
    }
  }

  async createRoom(opts: {
    roomName: string;
    playerName: string;
    maxPlayers: number;
    friendlyFire: boolean;
    botsEnabled: boolean;
    archetype?: BotArchetype;
  }): Promise<{ ok: boolean; error?: string; roomId?: string }> {
    await this.leaveRoom(true);
    this.connecting = true;
    this.lastError = null;
    this.playerName = opts.playerName.trim().slice(0, 20) || this.playerName;
    savePlayerName(this.playerName);
    this.localArchetype = opts.archetype ?? 'survivor';
    this.callbacks.onStateChange();

    const meta: P2PRoomMeta = {
      botsEnabled: opts.botsEnabled,
      friendlyFire: opts.friendlyFire,
      timeOfDay: this.localTimeOfDayProvider(),
    };

    try {
      const res = await fetch(
        `${SIGNAL_SERVER_URL}/api/rooms?gameId=${encodeURIComponent(P2P_GAME_ID)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: P2P_GAME_ID,
            name: opts.roomName.trim().slice(0, 32) || `Кімната ${this.playerName}`,
            hostId: this.playerId,
            hostName: this.playerName,
            version: P2P_CLIENT_VERSION,
            maxPlayers: Math.max(2, Math.min(16, opts.maxPlayers)),
            friendlyFire: opts.friendlyFire,
            meta,
            playerMeta: { archetype: this.localArchetype },
          }),
        },
      );
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        room?: P2PRoomInfo;
      };
      if (!res.ok || !json.success || !json.room) {
        const err = json.error ?? 'Не вдалося створити кімнату';
        this.connecting = false;
        this.lastError = err;
        this.callbacks.onStateChange();
        return { ok: false, error: err };
      }

      this.roomId = json.room.id;
      this.roomName = json.room.name;
      this.hostId = json.room.hostId;
      this.friendlyFire = Boolean(json.room.meta?.friendlyFire ?? json.room.friendlyFire ?? opts.friendlyFire);
      this.botsEnabled = Boolean(json.room.meta?.botsEnabled ?? opts.botsEnabled);
      this.connected = true;
      this.connecting = false;
      this.chatMessages = [];
      this.pushChatMessage('system', 'Система', `Кімнату "${this.roomName}" створено (ID: ${this.roomId}).`, true);
      this.startLoops();
      this.callbacks.onStateChange();
      return { ok: true, roomId: this.roomId };
    } catch {
      const err = 'Сервер сигналізації недоступний. Перевірте з’єднання.';
      this.connecting = false;
      this.lastError = err;
      this.callbacks.onStateChange();
      return { ok: false, error: err };
    }
  }

  async joinRoom(opts: {
    roomId: string;
    playerName: string;
    archetype?: BotArchetype;
  }): Promise<{ ok: boolean; error?: string; meta?: Partial<P2PRoomMeta> }> {
    const cleanId = opts.roomId.trim();
    if (!cleanId) return { ok: false, error: 'Вкажіть ID кімнати' };

    await this.leaveRoom(true);
    this.connecting = true;
    this.lastError = null;
    this.playerName = opts.playerName.trim().slice(0, 20) || this.playerName;
    savePlayerName(this.playerName);
    this.localArchetype = opts.archetype ?? 'survivor';
    this.callbacks.onStateChange();

    try {
      const res = await fetch(
        `${SIGNAL_SERVER_URL}/api/rooms/${encodeURIComponent(cleanId)}/join?gameId=${encodeURIComponent(P2P_GAME_ID)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: P2P_GAME_ID,
            playerId: this.playerId,
            playerName: this.playerName,
            clientVersion: P2P_CLIENT_VERSION,
            playerMeta: { archetype: this.localArchetype },
          }),
        },
      );
      const json = (await res.json()) as {
        success?: boolean;
        errorCode?: string;
        error?: string;
        requiredVersion?: string;
        roomId?: string;
        roomName?: string;
        hostId?: string;
        friendlyFire?: boolean;
        meta?: Partial<P2PRoomMeta>;
        peers?: Array<{ id: string; name: string; meta?: { archetype?: BotArchetype } }>;
      };

      if (!res.ok || !json.success) {
        let err = json.error ?? 'Не вдалося приєднатися до кімнати';
        if (json.errorCode === 'ROOM_NOT_FOUND') {
          err = 'Кімнату не знайдено або вона вже закрита.';
        } else if (json.errorCode === 'ROOM_FULL') {
          err = 'Кімната вже заповнена.';
        } else if (json.errorCode === 'VERSION_OUTDATED') {
          err = `Застаріла версія клієнта (потрібна ${json.requiredVersion ?? P2P_CLIENT_VERSION}).`;
        }
        this.connecting = false;
        this.lastError = err;
        this.callbacks.onStateChange();
        return { ok: false, error: err };
      }

      this.roomId = json.roomId ?? cleanId;
      this.roomName = json.roomName ?? cleanId;
      this.hostId = json.hostId ?? null;
      this.friendlyFire = Boolean(json.meta?.friendlyFire ?? json.friendlyFire ?? true);
      this.botsEnabled = Boolean(json.meta?.botsEnabled ?? true);
      this.connected = true;
      this.connecting = false;
      this.chatMessages = [];
      this.pushChatMessage('system', 'Система', `Підключено до "${this.roomName}".`, true);

      this.startLoops();

      // Offer glare avoidance rule: ONLY newly joining client creates offers to existing peers[]
      const existingPeers = json.peers ?? [];
      for (const peer of existingPeers) {
        if (peer.id === this.playerId) continue;
        const arch = peer.meta?.archetype ?? 'survivor';
        void this.createOfferForPeer(peer.id, peer.name || peer.id, arch);
      }

      this.callbacks.onStateChange();
      return { ok: true, meta: json.meta };
    } catch {
      const err = 'Помилка мережі при підключенні до кімнати.';
      this.connecting = false;
      this.lastError = err;
      this.callbacks.onStateChange();
      return { ok: false, error: err };
    }
  }

  private getOrCreatePeerSlot(
    peerId: string,
    peerName: string,
    archetype: BotArchetype,
  ): PeerConnectionSlot {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const slot: PeerConnectionSlot = {
      id: peerId,
      name: peerName,
      archetype,
      pc,
      fastChannel: null,
      eventsChannel: null,
      pendingIce: [],
      remoteDescSet: false,
      connected: false,
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.roomId) {
        void this.sendSignal(peerId, 'ice', ev.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        slot.connected = true;
        this.callbacks.onStateChange();
      } else if (st === 'failed' || st === 'closed') {
        this.removePeer(peerId);
      }
    };

    pc.ondatachannel = (ev) => {
      this.attachChannel(slot, ev.channel);
    };

    this.peers.set(peerId, slot);
    this.callbacks.onPeerJoin(peerId, peerName, archetype);
    this.callbacks.onStateChange();
    return slot;
  }

  private attachChannel(slot: PeerConnectionSlot, ch: RTCDataChannel) {
    if (ch.label === 'game') {
      slot.fastChannel = ch;
      ch.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const pkt = JSON.parse(ev.data) as FastPacket;
          this.callbacks.onFastPacket(slot.id, pkt);
        } catch {
          // ignore malformed packet
        }
      };
    } else if (ch.label === 'events') {
      slot.eventsChannel = ch;
      ch.onopen = () => {
        slot.connected = true;
        this.sendReliableToPeer(slot.id, {
          t: 'hello',
          name: this.playerName,
          archetype: this.localArchetype,
          tod: this.isHost ? this.localTimeOfDayProvider() : undefined,
        });
        this.callbacks.onStateChange();
      };
      ch.onclose = () => {
        if (this.peers.has(slot.id)) {
          this.removePeer(slot.id);
        }
      };
      ch.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const pkt = JSON.parse(ev.data) as ReliablePacket;
          if (pkt.t === 'hello') {
            slot.name = pkt.name;
            slot.archetype = pkt.archetype;
            this.callbacks.onPeerJoin(slot.id, pkt.name, pkt.archetype);
            this.callbacks.onStateChange();
          } else if (pkt.t === 'chat') {
            this.pushChatMessage(slot.id, pkt.name, pkt.text, false);
          }
          this.callbacks.onReliablePacket(slot.id, pkt);
        } catch {
          // ignore malformed event
        }
      };
    }
  }

  private async createOfferForPeer(
    peerId: string,
    peerName: string,
    archetype: BotArchetype,
  ) {
    const slot = this.getOrCreatePeerSlot(peerId, peerName, archetype);
    // Unordered channel for fast 20Hz state snapshots + reliable channel for hits/events/chat
    const fast = slot.pc.createDataChannel('game', {
      ordered: false,
      maxRetransmits: 0,
    });
    const events = slot.pc.createDataChannel('events', {
      ordered: true,
    });
    this.attachChannel(slot, fast);
    this.attachChannel(slot, events);

    try {
      const offer = await slot.pc.createOffer();
      await slot.pc.setLocalDescription(offer);
      await this.sendSignal(peerId, 'offer', {
        type: offer.type,
        sdp: offer.sdp,
        senderName: this.playerName,
        senderArchetype: this.localArchetype,
      });
    } catch {
      this.removePeer(peerId);
    }
  }

  private async sendSignal(
    targetId: string,
    type: 'offer' | 'answer' | 'ice',
    payload: unknown,
  ) {
    if (!this.roomId) return;
    try {
      await fetch(
        `${SIGNAL_SERVER_URL}/api/rooms/${encodeURIComponent(this.roomId)}/signal/send?gameId=${encodeURIComponent(P2P_GAME_ID)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: P2P_GAME_ID,
            senderId: this.playerId,
            targetId,
            type,
            payload,
          }),
        },
      );
    } catch {
      // ignore transient network errors
    }
  }

  private async pollSignals() {
    if (!this.connected || !this.roomId || this.pollingInFlight) return;
    this.pollingInFlight = true;
    try {
      const res = await fetch(
        `${SIGNAL_SERVER_URL}/api/rooms/${encodeURIComponent(this.roomId)}/signal/poll/${encodeURIComponent(this.playerId)}?gameId=${encodeURIComponent(P2P_GAME_ID)}`,
        { method: 'GET', cache: 'no-store' },
      );
      if (!res.ok) {
        if (res.status === 404) {
          this.pushChatMessage('system', 'Система', 'Кімната закрилась на сервері.', true);
          await this.leaveRoom(true);
        }
        return;
      }
      const list = (await res.json()) as Array<{
        senderId: string;
        type: 'offer' | 'answer' | 'ice';
        payload: unknown;
      }>;
      if (!Array.isArray(list)) return;

      for (const sig of list) {
        await this.handleIncomingSignal(sig.senderId, sig.type, sig.payload);
      }
    } catch {
      // ignore transient poll error
    } finally {
      this.pollingInFlight = false;
    }
  }

  private async handleIncomingSignal(
    senderId: string,
    type: 'offer' | 'answer' | 'ice',
    payload: unknown,
  ) {
    if (!senderId || senderId === this.playerId) return;

    if (type === 'offer') {
      const p = payload as {
        type: RTCSdpType;
        sdp: string;
        senderName?: string;
        senderArchetype?: BotArchetype;
      };
      // Reset old connection cleanly if peer reconnected with same ID
      if (this.peers.has(senderId)) {
        this.removePeer(senderId, true);
      }
      const slot = this.getOrCreatePeerSlot(
        senderId,
        p.senderName ?? senderId,
        p.senderArchetype ?? 'survivor',
      );
      try {
        await slot.pc.setRemoteDescription(
          new RTCSessionDescription({ type: p.type, sdp: p.sdp }),
        );
        slot.remoteDescSet = true;
        await this.flushPendingIce(slot);
        const answer = await slot.pc.createAnswer();
        await slot.pc.setLocalDescription(answer);
        await this.sendSignal(senderId, 'answer', {
          type: answer.type,
          sdp: answer.sdp,
        });
      } catch {
        this.removePeer(senderId);
      }
    } else if (type === 'answer') {
      const slot = this.peers.get(senderId);
      if (!slot) return;
      const p = payload as RTCSessionDescriptionInit;
      try {
        await slot.pc.setRemoteDescription(new RTCSessionDescription(p));
        slot.remoteDescSet = true;
        await this.flushPendingIce(slot);
      } catch {
        this.removePeer(senderId);
      }
    } else if (type === 'ice') {
      const slot = this.peers.get(senderId);
      if (!slot) return;
      const cand = payload as RTCIceCandidateInit;
      if (slot.remoteDescSet) {
        try {
          await slot.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {
          // ignore duplicate/late ICE
        }
      } else {
        slot.pendingIce.push(cand);
      }
    }
  }

  private async flushPendingIce(slot: PeerConnectionSlot) {
    while (slot.pendingIce.length > 0) {
      const cand = slot.pendingIce.shift();
      if (!cand) continue;
      try {
        await slot.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {
        // ignore invalid ICE
      }
    }
  }

  private async sendHeartbeat() {
    if (!this.connected || !this.roomId) return;
    try {
      await fetch(
        `${SIGNAL_SERVER_URL}/api/rooms/${encodeURIComponent(this.roomId)}/heartbeat?gameId=${encodeURIComponent(P2P_GAME_ID)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: P2P_GAME_ID,
            playerId: this.playerId,
          }),
        },
      );
    } catch {
      // ignore transient heartbeat failure
    }
  }

  private async refreshRoomMeta() {
    if (!this.connected || !this.roomId) return;
    const rooms = await this.fetchRooms();
    const current = rooms.find((r) => r.id === this.roomId);
    if (!current) return;
    if (current.hostId && current.hostId !== this.hostId) {
      this.hostId = current.hostId;
      const amIHost = this.hostId === this.playerId;
      this.pushChatMessage(
        'system',
        'Система',
        amIHost
          ? 'Попередній хост вийшов — тепер ви хост кімнати.'
          : `Новий хост кімнати: ${current.hostName}.`,
        true,
      );
      this.callbacks.onHostChanged(this.hostId, amIHost);
      this.callbacks.onStateChange();
    }
  }

  private startLoops() {
    this.stopLoops();
    this.pollTimer = window.setInterval(() => {
      void this.pollSignals();
    }, 600);
    this.heartbeatTimer = window.setInterval(() => {
      void this.sendHeartbeat();
    }, 12000);
    this.rosterTimer = window.setInterval(() => {
      void this.refreshRoomMeta();
    }, 8000);
  }

  private stopLoops() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.rosterTimer !== null) {
      clearInterval(this.rosterTimer);
      this.rosterTimer = null;
    }
  }

  private removePeer(peerId: string, silent = false) {
    const slot = this.peers.get(peerId);
    if (!slot) return;
    this.peers.delete(peerId);
    try {
      slot.fastChannel?.close();
      slot.eventsChannel?.close();
      slot.pc.close();
    } catch {
      // ignore
    }
    if (!silent) {
      this.pushChatMessage('system', 'Система', `${slot.name} від’єднався.`, true);
      this.callbacks.onPeerLeave(peerId, slot.name);
      this.callbacks.onStateChange();
      void this.refreshRoomMeta();
    }
  }

  broadcastFast(pkt: FastPacket) {
    if (!this.connected || this.peers.size === 0) return;
    const raw = JSON.stringify(pkt);
    for (const slot of this.peers.values()) {
      if (slot.fastChannel && slot.fastChannel.readyState === 'open') {
        try {
          slot.fastChannel.send(raw);
        } catch {
          // ignore saturated buffer on unreliable channel
        }
      }
    }
  }

  broadcastReliable(pkt: ReliablePacket) {
    if (!this.connected || this.peers.size === 0) return;
    const raw = JSON.stringify(pkt);
    for (const slot of this.peers.values()) {
      if (slot.eventsChannel && slot.eventsChannel.readyState === 'open') {
        try {
          slot.eventsChannel.send(raw);
        } catch {
          // ignore
        }
      }
    }
  }

  sendReliableToPeer(peerId: string, pkt: ReliablePacket) {
    const slot = this.peers.get(peerId);
    if (slot?.eventsChannel && slot.eventsChannel.readyState === 'open') {
      try {
        slot.eventsChannel.send(JSON.stringify(pkt));
      } catch {
        // ignore
      }
    }
  }

  sendChat(text: string) {
    const clean = text.trim().slice(0, 160);
    if (!clean || !this.connected) return;
    this.pushChatMessage(this.playerId, this.playerName, clean, false);
    this.broadcastReliable({ t: 'chat', name: this.playerName, text: clean });
  }

  async leaveRoom(silent = false) {
    this.stopLoops();
    const prevRoomId = this.roomId;
    this.connected = false;
    this.connecting = false;
    this.roomId = null;
    this.roomName = null;
    this.hostId = null;

    for (const peerId of Array.from(this.peers.keys())) {
      this.removePeer(peerId, true);
      if (!silent) {
        this.callbacks.onPeerLeave(peerId, peerId);
      }
    }

    if (prevRoomId) {
      try {
        await fetch(
          `${SIGNAL_SERVER_URL}/api/rooms/${encodeURIComponent(prevRoomId)}/leave?gameId=${encodeURIComponent(P2P_GAME_ID)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gameId: P2P_GAME_ID,
              playerId: this.playerId,
            }),
          },
        );
      } catch {
        // ignore
      }
    }

    if (!silent) {
      this.callbacks.onStateChange();
    }
  }

  private handleBeforeUnload = () => {
    if (!this.roomId) return;
    const url = `${SIGNAL_SERVER_URL}/api/rooms/${encodeURIComponent(this.roomId)}/leave?gameId=${encodeURIComponent(P2P_GAME_ID)}`;
    const payload = JSON.stringify({
      gameId: P2P_GAME_ID,
      playerId: this.playerId,
    });
    try {
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
    } catch {
      try {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      } catch {
        // ignore
      }
    }
  };

  dispose() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    window.removeEventListener('pagehide', this.handleBeforeUnload);
    void this.leaveRoom(true);
  }
}
