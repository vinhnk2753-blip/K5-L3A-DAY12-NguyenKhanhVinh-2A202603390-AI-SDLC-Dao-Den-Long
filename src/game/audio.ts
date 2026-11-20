/**
 * Procedural Web Audio synthesizer for Đảo Đèn Lồng (zero external audio files).
 * Provides gentle night BGM and all required Ticket-02 sound effects.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private volume = 0.7;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
  }

  startBgm(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.bgmTimer !== null) return;
    // Soft Vietnamese-inspired pentatonic lullaby (D, E, G, A, B)
    const notes = [293.66, 329.63, 392.0, 440.0, 493.88, 440.0, 392.0, 329.63];
    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || !this.masterGain || this.ctx.state !== 'running' || this.volume <= 0.01) return;
      const freq = notes[this.bgmStep % notes.length];
      this.bgmStep += 1;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.35);
    }, 1400);
  }

  stopBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private tone(freq: number, endFreq: number, dur: number, type: OscillatorType, vol = 0.16, delay = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.volume <= 0.01) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playPickup(): void {
    this.tone(660, 990, 0.14, 'sine', 0.14);
  }

  playDeposit(): void {
    this.tone(440, 660, 0.16, 'triangle', 0.14);
  }

  playLanternLit(): void {
    this.tone(440, 440, 0.35, 'triangle', 0.16, 0);
    this.tone(554.37, 554.37, 0.4, 'triangle', 0.16, 0.08);
    this.tone(659.25, 880, 0.5, 'sine', 0.18, 0.16);
  }

  playPulse(): void {
    this.tone(520, 180, 0.32, 'sine', 0.22);
    this.tone(780, 1180, 0.24, 'triangle', 0.12);
  }

  playHit(): void {
    this.tone(180, 72, 0.28, 'sawtooth', 0.18);
  }

  playJump(): void {
    this.tone(260, 520, 0.14, 'sine', 0.12);
  }

  playDash(): void {
    this.tone(360, 740, 0.15, 'triangle', 0.15);
  }

  playCharm(): void {
    this.tone(587.33, 880, 0.2, 'sine', 0.15, 0);
    this.tone(880, 1174.66, 0.25, 'sine', 0.15, 0.1);
  }

  playDrifterSteal(): void {
    this.tone(620, 260, 0.22, 'triangle', 0.15);
  }

  playShadeSpawn(): void {
    this.tone(110, 82, 0.42, 'sawtooth', 0.12);
  }

  playCountdownTick(): void {
    this.tone(880, 880, 0.07, 'square', 0.08);
  }

  playWindWarn(): void {
    this.tone(220, 420, 0.6, 'sine', 0.1);
  }

  playWin(): void {
    this.tone(392, 392, 0.25, 'triangle', 0.16, 0);
    this.tone(493.88, 493.88, 0.25, 'triangle', 0.16, 0.14);
    this.tone(587.33, 587.33, 0.3, 'triangle', 0.16, 0.28);
    this.tone(783.99, 783.99, 0.6, 'sine', 0.2, 0.42);
  }

  playLose(): void {
    this.tone(329.63, 293.66, 0.3, 'sine', 0.16, 0);
    this.tone(293.66, 220, 0.45, 'sine', 0.16, 0.22);
  }
}
