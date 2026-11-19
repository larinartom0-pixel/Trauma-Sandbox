import { WeaponId } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private lastHeartbeatAt = 0;

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  isMuted() {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.noiseBuffer && this.ctx) {
      const len = this.ctx.sampleRate * 1.0;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  playGunshot(weapon: WeaponId) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const isHeavy = weapon === 'shotgun_12ga' || weapon === 'sniper_762';
    const dur = isHeavy ? 0.28 : weapon === 'pistol_9mm' ? 0.14 : 0.18;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isHeavy ? 620 : 1200, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + dur);
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isHeavy ? 0.52 : 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + dur);

    // Low punch oscillator
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isHeavy ? 140 : 190, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(isHeavy ? 0.45 : 0.26, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playMeleeSwing(heavy: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 380 : 680, now);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.2);
  }

  playFleshImpact(severe: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(severe ? 115 : 165, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(severe ? 0.36 : 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  playExplosion() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(950, now);
    lp.frequency.exponentialRampToValueAtTime(75, now + 0.75);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    src.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.82);
  }

  playCrusherPulse(throwing: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(throwing ? 210 : 120, now);
    osc.frequency.exponentialRampToValueAtTime(throwing ? 520 : 185, now + 0.14);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playBandageSwipe() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.095);
  }

  playSyringeInject(broken: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = broken ? 'square' : 'sine';
    osc.frequency.setValueAtTime(broken ? 920 : 480, now);
    osc.frequency.exponentialRampToValueAtTime(broken ? 180 : 620, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(broken ? 0.25 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playUiClick(positive = true) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(positive ? 520 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(positive ? 690 : 210, now + 0.06);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  tickHeartbeat(bpm: number, stress: number) {
    if (this.muted || bpm <= 0) return;
    const nowMs = performance.now();
    const interval = (60 / Math.max(35, Math.min(200, bpm))) * 1000;
    if (nowMs - this.lastHeartbeatAt < interval) return;
    if (stress < 0.3) return;
    this.lastHeartbeatAt = nowMs;

    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.min(0.32, (stress - 0.25) * 0.42);
    for (let beat = 0; beat < 2; beat++) {
      const t = now + beat * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(beat === 0 ? 68 : 54, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.09);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol * (beat === 0 ? 1 : 0.72), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    }
  }

  private connectWithPan(
    ctx: AudioContext,
    source: AudioNode,
    pan: number,
  ) {
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(panner);
      panner.connect(ctx.destination);
    } else {
      source.connect(ctx.destination);
    }
  }

  playSpatialGunshot(weapon: WeaponId, pan: number, dist: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const isHeavy = weapon === 'shotgun_12ga' || weapon === 'sniper_762';
    const dur = isHeavy ? 0.28 : 0.16;
    const atten = Math.max(0.08, Math.min(1, 1 - dist / 46));

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      (isHeavy ? 620 : 1150) * Math.max(0.45, atten),
      now,
    );
    filter.frequency.exponentialRampToValueAtTime(140, now + dur);
    filter.Q.value = 0.85;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime((isHeavy ? 0.45 : 0.3) * atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    this.connectWithPan(ctx, gain, pan);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  playSpatialFootsteps(pan: number, dist: number, steps = 3) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const atten = Math.max(0.12, Math.min(0.95, 1 - dist / 24));
    for (let s = 0; s < steps; s++) {
      const t = now + s * (0.28 + Math.random() * 0.06);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(340 + Math.random() * 140, t);
      bp.Q.value = 1.4;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24 * atten, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);

      src.connect(bp);
      bp.connect(gain);
      this.connectWithPan(ctx, gain, pan);
      src.start(t);
      src.stop(t + 0.095);
    }
  }

  playSpatialReloadClick(pan: number, dist: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const atten = Math.max(0.15, Math.min(1, 1 - dist / 22));
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.14;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(i === 0 ? 1150 : 1580, t);
      osc.frequency.exponentialRampToValueAtTime(340, t + 0.045);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16 * atten, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      this.connectWithPan(ctx, gain, pan);
      osc.start(t);
      osc.stop(t + 0.055);
    }
  }

  playPhantomWhisper(pan: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1750, now);
    bp.frequency.linearRampToValueAtTime(920, now + 0.45);
    bp.Q.value = 4.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

    src.connect(bp);
    bp.connect(gain);
    this.connectWithPan(ctx, gain, pan);
    src.start(now);
    src.stop(now + 0.55);

    // Subtle auditory tinnitus pitch
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2450 + Math.random() * 400, now);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.001, now);
    tGain.gain.linearRampToValueAtTime(0.032, now + 0.08);
    tGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.65);
    osc.connect(tGain);
    this.connectWithPan(ctx, tGain, pan * 0.5);
    osc.start(now);
    osc.stop(now + 0.68);
  }
}

export const soundEngine = new SoundEngine();
