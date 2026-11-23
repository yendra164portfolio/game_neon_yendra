import type { GameSettings } from './types';

export class NeonAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private musicTimerId: number | null = null;
  private musicPlaying = false;
  private stepIndex = 0;

  private settings: GameSettings;

  constructor(initialSettings: GameSettings) {
    this.settings = { ...initialSettings };
  }

  public updateSettings(next: GameSettings): void {
    this.settings = { ...next };
    if (this.masterGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.03);
      if (this.musicGain) {
        this.musicGain.gain.setTargetAtTime(this.settings.musicVolume * 0.42, t, 0.04);
      }
      if (this.sfxGain) {
        this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume * 0.7, t, 0.04);
      }
    }
    if (this.settings.muted && this.musicPlaying) {
      // Keep timer running silently or pause gain; gain is 0 so it's silent
    }
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.masterGain.gain.value = this.settings.muted ? 0 : 1;
      this.musicGain.gain.value = this.settings.musicVolume * 0.42;
      this.sfxGain.gain.value = this.settings.sfxVolume * 0.7;

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public startMusic(): void {
    this.unlock();
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.stepIndex = 0;

    // 132 BPM 16th-note pulse (~113ms per step)
    const bassNotes = [55, 55, 110, 55, 65.41, 65.41, 130.81, 65.41, 73.42, 73.42, 146.83, 73.42, 61.74, 65.41, 73.42, 82.41];
    const arpNotes = [220, 261.63, 329.63, 440, 261.63, 329.63, 392, 523.25, 293.66, 349.23, 440, 587.33, 246.94, 329.63, 392, 493.88];

    const scheduleStep = () => {
      if (!this.musicPlaying) return;
      if (this.ctx && this.musicGain && !this.settings.muted && this.ctx.state === 'running') {
        const now = this.ctx.currentTime;
        const step = this.stepIndex % 16;

        // Driving synthwave bass
        const bassFreq = bassNotes[step];
        const bassOsc = this.ctx.createOscillator();
        const bassFilter = this.ctx.createBiquadFilter();
        const bassEnv = this.ctx.createGain();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(bassFreq, now);
        bassFilter.type = 'lowpass';
        bassFilter.frequency.setValueAtTime(step % 4 === 0 ? 520 : 340, now);
        bassFilter.frequency.exponentialRampToValueAtTime(140, now + 0.1);
        bassEnv.gain.setValueAtTime(0.001, now);
        bassEnv.gain.linearRampToValueAtTime(0.24, now + 0.01);
        bassEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        bassOsc.connect(bassFilter);
        bassFilter.connect(bassEnv);
        bassEnv.connect(this.musicGain);
        bassOsc.start(now);
        bassOsc.stop(now + 0.12);

        // Kick on quarter notes
        if (step % 4 === 0) {
          const kickOsc = this.ctx.createOscillator();
          const kickEnv = this.ctx.createGain();
          kickOsc.type = 'sine';
          kickOsc.frequency.setValueAtTime(128, now);
          kickOsc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
          kickEnv.gain.setValueAtTime(0.32, now);
          kickEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
          kickOsc.connect(kickEnv);
          kickEnv.connect(this.musicGain);
          kickOsc.start(now);
          kickOsc.stop(now + 0.14);
        }

        // Crisp synth arpeggio on off-beats
        if (step % 2 === 1) {
          const arpFreq = arpNotes[step];
          const arpOsc = this.ctx.createOscillator();
          const arpEnv = this.ctx.createGain();
          arpOsc.type = 'triangle';
          arpOsc.frequency.setValueAtTime(arpFreq, now);
          arpEnv.gain.setValueAtTime(0.001, now);
          arpEnv.gain.linearRampToValueAtTime(0.11, now + 0.01);
          arpEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          arpOsc.connect(arpEnv);
          arpEnv.connect(this.musicGain);
          arpOsc.start(now);
          arpOsc.stop(now + 0.16);
        }

        // Closed hi-hat on off-16ths
        if (step % 2 === 1 && this.noiseBuffer) {
          const hat = this.ctx.createBufferSource();
          hat.buffer = this.noiseBuffer;
          const hp = this.ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 6500;
          const hatEnv = this.ctx.createGain();
          hatEnv.gain.setValueAtTime(0.055, now);
          hatEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          hat.connect(hp);
          hp.connect(hatEnv);
          hatEnv.connect(this.musicGain);
          hat.start(now);
          hat.stop(now + 0.05);
        }

        this.stepIndex++;
      }
      this.musicTimerId = window.setTimeout(scheduleStep, 114);
    };

    scheduleStep();
  }

  public stopMusic(): void {
    this.musicPlaying = false;
    if (this.musicTimerId !== null) {
      window.clearTimeout(this.musicTimerId);
      this.musicTimerId = null;
    }
  }

  public playUiClick(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(1080, now + 0.045);
    env.gain.setValueAtTime(0.14, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playLaneShift(): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const jitter = 0.94 + Math.random() * 0.12;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(480 * jitter, now + 0.05);
    env.gain.setValueAtTime(0.12, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playJump(): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const jitter = 0.94 + Math.random() * 0.12;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(580 * jitter, now + 0.16);
    env.gain.setValueAtTime(0.22, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playSlide(): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(1600, now);
    bp.frequency.exponentialRampToValueAtTime(380, now + 0.24);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.22, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    src.connect(bp);
    bp.connect(env);
    env.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.28);
  }

  public playCoin(combo: number): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const stepPitch = Math.min(1.45, 1 + Math.min(combo, 10) * 0.035);
    const f1 = 987.77 * stepPitch;
    const f2 = 1318.51 * stepPitch;

    const osc1 = this.ctx.createOscillator();
    const env1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(f1, now);
    osc1.frequency.setValueAtTime(f2, now + 0.055);
    env1.gain.setValueAtTime(0.22, now);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(env1);
    env1.connect(this.sfxGain);
    osc1.start(now);
    osc1.stop(now + 0.23);
  }

  public playCollision(): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;

    // Sub impact
    const sub = this.ctx.createOscillator();
    const subEnv = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(160, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.36);
    subEnv.gain.setValueAtTime(0.45, now);
    subEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    sub.connect(subEnv);
    subEnv.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.4);

    // Crash noise burst
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, now);
      lp.frequency.exponentialRampToValueAtTime(220, now + 0.35);
      const nEnv = this.ctx.createGain();
      nEnv.gain.setValueAtTime(0.38, now);
      nEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      noise.connect(lp);
      lp.connect(nEnv);
      nEnv.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.38);
    }
  }

  public playUnlock(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      const start = now + idx * 0.06;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      env.gain.setValueAtTime(0.18, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(env);
      env.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  public dispose(): void {
    this.stopMusic();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
