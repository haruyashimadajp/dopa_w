window.ZetsuIssen = window.ZetsuIssen || {};

window.ZetsuIssen.Audio = (() => {
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.compressor = null;
      this.convolver = null;
      this.reverbGain = null;
      this.distortion = null;
      this.noiseBuffer = null;

      // Japanese Yo-na-nuki Pentatonic + Major hybrid semitone ladder for infinite pitch ramp
      this.scaleSemitones = [
        0, 2, 4, 7, 9,
        12, 14, 16, 19, 21,
        24, 26, 28, 31, 33,
        36, 38, 40, 43, 45
      ];

      // Interactive Beat-Synced BGM state
      this.bgmPlaying = false;
      this.bgmTimer = null;
      this.bgmStep = 0;
      this.currentBpm = 128;
      this.stylePhase = 1;
      this.rankIndex = 0;
      this.onBeatCallback = null;
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this._buildDspChain();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    _buildDspChain() {
      const now = this.ctx.currentTime;

      // 1. Master Dynamics Compressor (Glue & Punch without clipping)
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-16, now);
      this.compressor.knee.setValueAtTime(10, now);
      this.compressor.ratio.setValueAtTime(6, now);
      this.compressor.attack.setValueAtTime(0.002, now);
      this.compressor.release.setValueAtTime(0.14, now);
      this.compressor.connect(this.ctx.destination);

      // 2. Procedural Stereo Hall Reverb (ConvolverNode)
      this.convolver = this.ctx.createConvolver();
      const irRate = this.ctx.sampleRate;
      const irLength = Math.floor(irRate * 1.15);
      const irBuffer = this.ctx.createBuffer(2, irLength, irRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = irBuffer.getChannelData(ch);
        for (let i = 0; i < irLength; i++) {
          const decay = Math.pow(1 - i / irLength, 2.75);
          data[i] = (Math.random() * 2 - 1) * decay;
        }
      }
      this.convolver.buffer = irBuffer;
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.30;
      this.convolver.connect(this.reverbGain);
      this.reverbGain.connect(this.compressor);

      // 3. WaveShaper Saturation / Distortion for Sub-Bass & Taiko Punch
      this.distortion = this.ctx.createWaveShaper();
      const samples = 44100;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + 24) * x * 20 * (Math.PI / 180)) / (Math.PI + 24 * Math.abs(x));
      }
      this.distortion.curve = curve;
      this.distortion.oversample = '2x';
      this.distortion.connect(this.compressor);

      // 4. Shared 2-second White Noise Buffer for Katana Wind & Explosion Crashes
      const noiseLen = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
      const noiseData = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.muted) {
        this.stopBgm();
      } else {
        this.init();
        this.startBgm();
      }
      return this.muted;
    }

    setOnBeatCallback(fn) {
      this.onBeatCallback = fn;
    }

    // 1. Multi-Voice Harmonic Lock-On Chime (Climbs pentatonic scale with lush reverb)
    playLockOn(chainIndex, isBomb = false) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const semi =
        this.scaleSemitones[Math.min(chainIndex, this.scaleSemitones.length - 1)] +
        Math.max(0, chainIndex - 19) * 0.55;
      const rootFreq = (isBomb ? 440.0 : 523.25) * Math.pow(2, semi / 12);

      // Layer A: Fundamental Triangle + Fifth & Octave Harmonics
      const ratios = isBomb ? [1, 1.5, 2, 2.5] : [1, 1.5, 2];
      ratios.forEach((r, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(rootFreq * r, now);
        osc.frequency.exponentialRampToValueAtTime(rootFreq * r * 1.06, now + 0.09);

        const vol = (idx === 0 ? 0.16 : 0.07) / (1 + idx * 0.3);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11 + idx * 0.02);

        osc.connect(gain);
        gain.connect(this.compressor);
        gain.connect(this.convolver);
        osc.start(now);
        osc.stop(now + 0.14);
      });

      // Layer B: Metallic Katana Ping Transient
      const ping = this.ctx.createOscillator();
      const pingGain = this.ctx.createGain();
      ping.type = 'square';
      ping.frequency.setValueAtTime(Math.min(7500, rootFreq * 4.0), now);
      ping.frequency.exponentialRampToValueAtTime(rootFreq * 1.5, now + 0.03);
      pingGain.gain.setValueAtTime(0.055, now);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      ping.connect(pingGain);
      pingGain.connect(this.convolver);
      ping.start(now);
      ping.stop(now + 0.04);
    }

    // 2. Heavy Katana Slash (Wind Bandpass Noise + Metallic Blade Ring + Thunder Charge Layer)
    playPinballSlash(comboCount = 1, chargeStack = 0) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const pitchShift = 1 + Math.min(0.8, comboCount * 0.015) + chargeStack * 0.14;

      // Layer 1: Wind Whoosh (Bandpass-swept Noise "シュパッ！")
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(3.2, now);
      filter.frequency.setValueAtTime(2900 * pitchShift, now);
      filter.frequency.exponentialRampToValueAtTime(380, now + 0.095);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.32, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.compressor);
      nGain.connect(this.convolver);
      noise.start(now, Math.random() * 1.2, 0.11);

      // Layer 2: Metallic Blade Edge ("シャキィン！")
      const blade = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();
      blade.type = 'sawtooth';
      blade.frequency.setValueAtTime(920 * pitchShift, now);
      blade.frequency.exponentialRampToValueAtTime(210, now + 0.085);
      bGain.gain.setValueAtTime(0.16, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      blade.connect(bGain);
      bGain.connect(this.compressor);
      bGain.connect(this.convolver);
      blade.start(now);
      blade.stop(now + 0.095);

      // Layer 3: High Steel Shimmer + Thunder Charge Harmonic
      const shimmer = this.ctx.createOscillator();
      const sGain = this.ctx.createGain();
      shimmer.type = chargeStack > 0 ? 'square' : 'sine';
      shimmer.frequency.setValueAtTime((2800 + chargeStack * 450) * Math.min(1.4, pitchShift), now);
      shimmer.frequency.exponentialRampToValueAtTime(1200, now + 0.075);
      sGain.gain.setValueAtTime(0.07 + chargeStack * 0.025, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      shimmer.connect(sGain);
      sGain.connect(this.convolver);
      shimmer.start(now);
      shimmer.stop(now + 0.085);
    }

    // 3. High-Speed Iai Dash Step (0.22s lightning traversal)
    playIaiStep(stepIndex, totalSteps) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const progress = Math.min(1, stepIndex / Math.max(1, totalSteps));
      const freq = 420 + progress * 1450;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

      osc.connect(gain);
      gain.connect(this.compressor);
      gain.connect(this.convolver);
      osc.start(now);
      osc.stop(now + 0.06);
    }

    // 4. Authentic Katana Sheathe Click ("カチィン…！")
    playSheatheClick() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;

      // Tsuba metallic transient
      const metal = this.ctx.createOscillator();
      const mGain = this.ctx.createGain();
      metal.type = 'square';
      metal.frequency.setValueAtTime(3900, now);
      metal.frequency.exponentialRampToValueAtTime(1080, now + 0.04);
      mGain.gain.setValueAtTime(0.26, now);
      mGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      metal.connect(mGain);
      mGain.connect(this.compressor);
      mGain.connect(this.convolver);
      metal.start(now);
      metal.stop(now + 0.05);

      // Scabbard wooden body thud
      const body = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(640, now);
      body.frequency.exponentialRampToValueAtTime(160, now + 0.065);
      bGain.gain.setValueAtTime(0.24, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      body.connect(bGain);
      bGain.connect(this.compressor);
      body.start(now);
      body.stop(now + 0.075);
    }

    // 5. Massive Simultaneous Detonation ("ズバァァァン！！")
    playDetonation(chainCount = 3, isCharged = false) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const power = Math.min(1.6, 0.7 + chainCount * 0.04 + (isCharged ? 0.35 : 0));

      // Layer 1: Distorted Sub-Bass Drop through WaveShaper
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(165, now);
      sub.frequency.exponentialRampToValueAtTime(25, now + 0.52);
      subGain.gain.setValueAtTime(0.42 * power, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      sub.connect(subGain);
      subGain.connect(this.distortion);
      sub.start(now);
      sub.stop(now + 0.56);

      // Layer 2: Low-Pass Filtered Explosion Crash Noise
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3800, now);
      lp.frequency.exponentialRampToValueAtTime(160, now + 0.46);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.36 * power, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      noise.connect(lp);
      lp.connect(nGain);
      nGain.connect(this.compressor);
      nGain.connect(this.convolver);
      noise.start(now, 0, 0.5);

      // Layer 3: Lush 5-Voice Japanese Minor Pentatonic Power Chord for Big Chains
      const chordFreqs =
        chainCount >= 8 || isCharged
          ? [293.66, 440.0, 587.33, 698.46, 880.0, 1174.66] // D minor 7th power chord
          : [293.66, 440.0, 587.33, 880.0];

      chordFreqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const filt = this.ctx.createBiquadFilter();
        const g = this.ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.012);

        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(4200, now + idx * 0.012);
        filt.frequency.exponentialRampToValueAtTime(650, now + 0.45);

        g.gain.setValueAtTime(0.085, now + idx * 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.44 + idx * 0.03);

        osc.connect(filt);
        filt.connect(g);
        g.connect(this.compressor);
        g.connect(this.convolver);
        osc.start(now + idx * 0.012);
        osc.stop(now + 0.5);
      });
    }

    // 6. Dimensional Void Slash & Collapse (Action D)
    playVoidSlash() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(1680, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.22);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(this.distortion);
      gain.connect(this.convolver);
      osc.start(now);
      osc.stop(now + 0.25);
    }

    // 7. Bullet Parry & Graze Sparks
    playParry() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      [1760, 2637, 3520].forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + i * 0.01);
        g.gain.setValueAtTime(0.13, now + i * 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(g);
        g.connect(this.compressor);
        g.connect(this.convolver);
        osc.start(now + i * 0.01);
        osc.stop(now + 0.15);
      });
    }

    playGraze() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1318.5, now);
      osc.frequency.exponentialRampToValueAtTime(2637, now + 0.07);
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(g);
      g.connect(this.convolver);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    // 8. Soul Gem Pickup (Crystal Arpeggio for Tornado Vacuum)
    playGemPickup(streakIndex = 0) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const semi = this.scaleSemitones[streakIndex % 15];
      const freq = 880 * Math.pow(2, semi / 12);

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.055);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(this.compressor);
      gain.connect(this.convolver);
      osc.start(now);
      osc.stop(now + 0.065);
    }

    // 9. Ultimate & Level-Up Fanfare
    playLevelUp(isAwakening = false) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = isAwakening
        ? [587.33, 698.46, 880, 1174.66, 1396.91, 1760]
        : [587.33, 698.46, 880, 1174.66];
      notes.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.05);
        g.gain.setValueAtTime(0.15, now + idx * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.32);
        osc.connect(g);
        g.connect(this.compressor);
        g.connect(this.convolver);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.34);
      });
    }

    playDamage() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(42, now + 0.28);
      g.gain.setValueAtTime(0.34, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(g);
      g.connect(this.distortion);
      osc.start(now);
      osc.stop(now + 0.32);
    }

    // ==========================================
    // 10. INTERACTIVE BEAT-SYNCED CYBER-TAIKO BGM
    // ==========================================
    setBgmIntensity(rankObj, rankIdx) {
      if (!rankObj) return;
      this.currentBpm = rankObj.bpm || 128;
      this.stylePhase = rankObj.phase || 1;
      this.rankIndex = rankIdx || 0;
    }

    startBgm() {
      if (this.muted || !this.ctx || this.bgmPlaying) return;
      this.bgmPlaying = true;
      this.bgmStep = 0;
      this._scheduleNextStep();
    }

    stopBgm() {
      this.bgmPlaying = false;
      if (this.bgmTimer) {
        clearTimeout(this.bgmTimer);
        this.bgmTimer = null;
      }
    }

    _scheduleNextStep() {
      if (!this.bgmPlaying || this.muted || !this.ctx) return;
      const stepDurationMs = (60 / this.currentBpm / 4) * 1000; // 16th note
      this._playBgmStep(this.bgmStep);
      this.bgmStep = (this.bgmStep + 1) % 16;
      this.bgmTimer = setTimeout(() => this._scheduleNextStep(), stepDurationMs);
    }

    _playBgmStep(step) {
      const now = this.ctx.currentTime;
      // D Minor Japanese Pentatonic Bass Notes (D2, F2, G2, A2, C3)
      const bassPattern = [73.42, 73.42, 87.31, 73.42, 98.0, 73.42, 110.0, 130.81];
      const kotoPattern = [587.33, 698.46, 880.0, 1046.5, 880.0, 698.46, 1174.66, 880.0];

      // 1. Taiko Kick on every Quarter Note (Steps 0, 4, 8, 12) + Sync Beat Pulse!
      if (step % 4 === 0) {
        const kick = this.ctx.createOscillator();
        const kGain = this.ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(125, now);
        kick.frequency.exponentialRampToValueAtTime(36, now + 0.14);
        kGain.gain.setValueAtTime(0.24, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        kick.connect(kGain);
        kGain.connect(this.distortion);
        kick.start(now);
        kick.stop(now + 0.17);

        if (this.onBeatCallback) {
          this.onBeatCallback(this.stylePhase, this.rankIndex);
        }
      }

      // 2. Driving Cyber-Bass on 8th notes (Steps 0, 2, 4, 6, 8, 10, 12, 14)
      if (step % 2 === 0) {
        const freq = bassPattern[(step / 2) % bassPattern.length];
        const bass = this.ctx.createOscillator();
        const filt = this.ctx.createBiquadFilter();
        const bGain = this.ctx.createGain();
        bass.type = 'sawtooth';
        bass.frequency.setValueAtTime(freq, now);

        filt.type = 'lowpass';
        const cutoff = this.stylePhase === 3 ? 1350 : (this.stylePhase === 2 ? 850 : 480);
        filt.frequency.setValueAtTime(cutoff, now);
        filt.frequency.exponentialRampToValueAtTime(140, now + 0.11);

        bGain.gain.setValueAtTime(0.11, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        bass.connect(filt);
        filt.connect(bGain);
        bGain.connect(this.compressor);
        bass.start(now);
        bass.stop(now + 0.13);
      }

      // 3. Hi-Hat Percussion on off-beats (or 16ths in Phase 2+)
      if (step % 4 === 2 || (this.stylePhase >= 2 && step % 2 === 1)) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(6500, now);
        const hGain = this.ctx.createGain();
        hGain.gain.setValueAtTime(0.04, now);
        hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        noise.connect(hp);
        hp.connect(hGain);
        hGain.connect(this.compressor);
        noise.start(now, 0.2, 0.04);
      }

      // 4. Phase 2 & Phase 3 Trance Koto / Cyber Lead Arpeggio!
      if (this.stylePhase >= 2 && (step % 2 === 0 || this.stylePhase === 3)) {
        const noteFreq = kotoPattern[step % kotoPattern.length] * (this.stylePhase === 3 && step % 4 === 0 ? 1.5 : 1);
        const koto = this.ctx.createOscillator();
        const kGain = this.ctx.createGain();
        koto.type = 'triangle';
        koto.frequency.setValueAtTime(noteFreq, now);
        kGain.gain.setValueAtTime(this.stylePhase === 3 ? 0.065 : 0.04, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
        koto.connect(kGain);
        kGain.connect(this.convolver);
        koto.start(now);
        koto.stop(now + 0.11);
      }
    }
  }

  return new SoundEngine();
})();
