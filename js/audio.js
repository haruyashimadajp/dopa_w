/* ==========================================================================
 * CHAIN SLASH : 絶・一閃 (ZETSU-ISSEN)
 * [4] js/audio.js — Web Audio API プロシージャル音響合成エンジン
 *                   （効果音12種＋和風サイバービートBGM）
 * 外部音源ファイルは一切使用しない。全てリアルタイム合成。
 * 公開: window.ZetsuIssen.Audio = { SoundEngine }
 * ========================================================================== */
(function () {
  'use strict';
  const ZI = (window.ZetsuIssen = window.ZetsuIssen || {});
  const CFG = ZI.Config;
  const MUTE_KEY = 'zetsu_issen_mute';

  // BGM 用：都節（陰旋法）音階＋ヨナ抜き
  const IN_SCALE = [0, 1, 5, 7, 8, 12, 13, 17, 19, 20, 24];
  const YONA_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const BAR_ROOTS = [0, 0, -4, -2];

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfx = null;
      this.bgm = null;
      this.noiseBuf = null;
      this.muted = false;
      try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage unavailable */ }
      this._last = {};
      this._voices = 0;
      // BGM state
      this.bgmOn = false;
      this.bgmStage = 0;
      this.intensity = 0;
      this.targetBpm = 100;
      this.bpm = 100;
      this.step = 0;
      this.nextNoteTime = 0;
      this.timer = null;
      this.melodySeed = 1;
      this.duckUntil = 0;
    }

    /** 最初のユーザー操作で呼ぶ（自動再生制限対策） */
    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) { this.ctx = null; return; }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      // 軽いコンプレッサーで音割れ防止
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 18;
      this.comp.ratio.value = 5;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.18;
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);

      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);

      this.bgm = ctx.createGain();
      this.bgm.gain.value = 0.32;
      this.bgm.connect(this.master);

      // ホワイトノイズバッファ（1.5秒）
      const len = Math.floor(ctx.sampleRate * 1.5);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }

    get ready() { return !!this.ctx && this.ctx.state === 'running'; }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    setMuted(m) {
      this.muted = m;
      try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.master && this.ctx) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(m ? 0 : 0.8, t, 0.02);
      }
    }

    setPaused(p) {
      if (!this.ctx) return;
      if (p) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    }

    /* ------------------------------------------------------------------
     * 低レベル合成ヘルパー
     * ---------------------------------------------------------------- */
    _rate(key, ms) {
      const now = performance.now();
      if (this._last[key] && now - this._last[key] < ms) return false;
      this._last[key] = now;
      return true;
    }

    _env(g, t, vol, attack, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    }

    /** 単音オシレーター */
    _tone(o) {
      const ctx = this.ctx;
      const t = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(10, o.f0), t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + (o.sweep || o.dur));
      if (o.detune) osc.detune.value = o.detune;
      let node = osc;
      if (o.filter) {
        const f = ctx.createBiquadFilter();
        f.type = o.filter;
        f.frequency.setValueAtTime(o.ff0 || 2000, t);
        if (o.ff1) f.frequency.exponentialRampToValueAtTime(o.ff1, t + o.dur);
        f.Q.value = o.q || 0.8;
        node.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(o.dest || this.sfx);
      this._env(g, t, o.vol || 0.2, o.attack || 0.004, o.dur);
      osc.start(t);
      osc.stop(t + (o.attack || 0.004) + o.dur + 0.05);
      return osc;
    }

    /** フィルター付きノイズ */
    _noise(o) {
      const ctx = this.ctx;
      const t = ctx.currentTime + (o.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = o.rate || 1;
      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'bandpass';
      f.frequency.setValueAtTime(o.f0 || 2000, t);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
      f.Q.value = o.q || 1;
      const g = ctx.createGain();
      src.connect(f);
      f.connect(g);
      g.connect(o.dest || this.sfx);
      this._env(g, t, o.vol || 0.2, o.attack || 0.003, o.dur);
      const off = Math.random() * 0.5;
      src.start(t, off);
      src.stop(t + (o.attack || 0.003) + o.dur + 0.05);
    }

    _semiFreq(base, semi) { return base * Math.pow(2, semi / 12); }

    /** ヨナ抜きペンタトニック音階上昇（19体目以降は+0.5半音ずつ上限なし） */
    _chainSemi(i) {
      const S = CFG.AUDIO.SEMITONES;
      if (i < S.length) return S[i];
      return S[S.length - 1] + (i - S.length + 1) * 0.5;
    }

    /* ------------------------------------------------------------------
     * 効果音
     * ---------------------------------------------------------------- */
    /** ① ロックオン（カキン、カキン…音階上昇） */
    playLockOn(chainIndex, isBomb) {
      if (!this.ready || !this._rate('lock', 18)) return;
      const semi = this._chainSemi(chainIndex);
      const f = Math.min(14000, this._semiFreq(CFG.AUDIO.BASE_FREQ, semi));
      // 金属的なアタック
      this._tone({ type: 'square', f0: f * 2, f1: f, dur: 0.03, vol: 0.05, filter: 'highpass', ff0: 1800 });
      this._tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.18 });
      this._tone({ type: 'sine', f0: f * 2.005, dur: 0.12, vol: 0.06 });
      if (chainIndex >= 29) {
        // 30チェイン以上：高周波クリスタルチャイム
        this._tone({ type: 'sine', f0: Math.min(16000, f * 3.01), dur: 0.55, vol: 0.05 });
        this._tone({ type: 'sine', f0: Math.min(16000, f * 4.2), dur: 0.4, vol: 0.03, delay: 0.02 });
      }
      if (isBomb) {
        this._tone({ type: 'sine', f0: 180, f1: 60, dur: 0.14, vol: 0.22 });
      }
    }

    /** ② 高速フリック斬撃音 */
    playPinballSlash(comboCount) {
      if (!this.ready || !this._rate('pin', 20)) return;
      const semi = this._chainSemi(Math.min(comboCount, 40));
      const f = this._semiFreq(CFG.AUDIO.BASE_FREQ * 0.5, semi);
      this._noise({ filter: 'bandpass', f0: 2200, f1: 9000, dur: 0.09, vol: 0.32, q: 1.4 });
      this._tone({ type: 'sawtooth', f0: f * 2, f1: f, dur: 0.07, vol: 0.07, filter: 'lowpass', ff0: 5000, ff1: 1200 });
      this._tone({ type: 'triangle', f0: f * 2, dur: 0.12, vol: 0.1, delay: 0.01 });
    }

    /** ③ 居合の高速斬り抜け音 */
    playIaiStep(stepIndex, totalSteps) {
      if (!this.ready || !this._rate('iai', 14)) return;
      const p = totalSteps > 1 ? stepIndex / (totalSteps - 1) : 1;
      this._noise({ filter: 'highpass', f0: 3000 + p * 5000, dur: 0.035, vol: 0.18, q: 0.7 });
      this._tone({ type: 'sine', f0: 900 + p * 1600, f1: 400 + p * 800, dur: 0.03, vol: 0.05 });
    }

    /** ④ 納刀「カチッ！」 2600Hz→720Hz（0.04秒）矩形波＋ハイパスノイズ */
    playSheatheClick() {
      if (!this.ready) return;
      this._tone({ type: 'square', f0: 2600, f1: 720, sweep: 0.04, dur: 0.04, vol: 0.2, attack: 0.001 });
      this._noise({ filter: 'highpass', f0: 5200, dur: 0.035, vol: 0.28, attack: 0.001 });
      this._tone({ type: 'sine', f0: 3400, dur: 0.09, vol: 0.05, delay: 0.005 });
    }

    /** ⑤ 同時爆砕ボム（サブベース＋LPノイズスイープ＋パワーコード） */
    playDetonation(chainCount, isBossBreak) {
      if (!this.ready || !this._rate('det', 40)) return;
      const big = isBossBreak ? 1.35 : 1;
      this._tone({ type: 'sine', f0: 140, f1: 28, sweep: 0.42, dur: 0.42 * big, vol: 0.55 * big, attack: 0.003 });
      this._noise({ filter: 'lowpass', f0: 6000, f1: 160, dur: 0.55 * big, vol: 0.42, q: 0.6 });
      const chord = CFG.AUDIO.POWER_CHORD;
      const n = Math.min(chord.length, 1 + Math.floor((chainCount || 1) / 3));
      for (let i = 0; i < n; i++) {
        this._tone({ type: 'sawtooth', f0: chord[i], dur: 0.6, vol: 0.05, filter: 'lowpass', ff0: 4000, ff1: 600, delay: 0.01 });
        this._tone({ type: 'triangle', f0: chord[i] * 0.5, dur: 0.7, vol: 0.05, delay: 0.01 });
      }
      if (isBossBreak) {
        this._tone({ type: 'sawtooth', f0: 65.4, f1: 32.7, dur: 0.9, vol: 0.18, filter: 'lowpass', ff0: 800, ff1: 120 });
        this._noise({ filter: 'bandpass', f0: 800, f1: 3000, dur: 0.5, vol: 0.2, delay: 0.05 });
      }
    }

    /** ⑥ 次元斬：空間裂傷音 */
    playVoidSlash() {
      if (!this.ready || !this._rate('void', 45)) return;
      this._noise({ filter: 'highpass', f0: 1500, f1: 7000, dur: 0.22, vol: 0.22, q: 2 });
      this._tone({ type: 'sawtooth', f0: 1800, f1: 160, dur: 0.26, vol: 0.06, filter: 'bandpass', ff0: 2400, ff1: 400, q: 3 });
      this._tone({ type: 'square', f0: 60, f1: 40, dur: 0.18, vol: 0.05 });
    }

    /** ⑦ 次元斬：空間閉鎖爆発音（バチン！！） */
    playVoidCollapse() {
      if (!this.ready || !this._rate('voidc', 50)) return;
      this._noise({ filter: 'bandpass', f0: 400, f1: 4200, dur: 0.06, vol: 0.32, q: 1.2 });
      this._tone({ type: 'sine', f0: 110, f1: 30, dur: 0.32, vol: 0.4 });
      this._noise({ filter: 'lowpass', f0: 3000, f1: 200, dur: 0.3, vol: 0.2, delay: 0.03 });
    }

    /** ⑧ パリィ成功：金属反響音 */
    playParry() {
      if (!this.ready || !this._rate('parry', 30)) return;
      this._noise({ filter: 'highpass', f0: 6000, dur: 0.02, vol: 0.2, attack: 0.001 });
      [1240, 1873, 2651, 3720].forEach((f, i) => {
        this._tone({ type: 'sine', f0: f, dur: 0.45 - i * 0.07, vol: 0.07 - i * 0.012 });
      });
    }

    /** ⑨ 魂ジェム吸引：クリスタルアルペジオ */
    playGemPickup(streakIndex) {
      if (!this.ready || !this._rate('gem', 22)) return;
      const i = streakIndex % 15;
      const oct = Math.floor(streakIndex / 15) % 2;
      const f = this._semiFreq(CFG.AUDIO.GEM_BASE, YONA_SCALE[i % YONA_SCALE.length] + oct * 12);
      this._tone({ type: 'sine', f0: Math.min(9000, f), dur: 0.05, vol: 0.09, attack: 0.002 });
      this._tone({ type: 'sine', f0: Math.min(12000, f * 2), dur: 0.04, vol: 0.025, attack: 0.002 });
    }

    /** ⑩ 第壱奥義『千本桜・墨嵐』 */
    playUltimate100() {
      if (!this.ready) return;
      this.duck(0.5);
      this._tone({ type: 'sine', f0: 55, f1: 30, dur: 1.2, vol: 0.5 });
      this._noise({ filter: 'bandpass', f0: 300, f1: 6000, dur: 0.8, vol: 0.25, q: 0.7 });
      [261.63, 311.13, 392, 466.16, 523.25].forEach((f, i) => {
        this._tone({ type: 'sawtooth', f0: f, dur: 1.4, vol: 0.05, filter: 'lowpass', ff0: 600, ff1: 5000, delay: i * 0.04 });
      });
      // 鐘
      [196, 293.66, 392.9, 587.3].forEach((f) => this._tone({ type: 'sine', f0: f, dur: 2.4, vol: 0.06, delay: 0.1 }));
    }

    /** ⑪ 第弐奥義『絶・虚空一文字』（重力収束の吸引音） */
    playUltimate200() {
      if (!this.ready) return;
      this.duck(3.2);
      this._tone({ type: 'sawtooth', f0: 30, f1: 220, sweep: 1.2, dur: 1.25, vol: 0.2, filter: 'lowpass', ff0: 200, ff1: 1800 });
      this._tone({ type: 'sine', f0: 40, f1: 25, dur: 1.4, vol: 0.5 });
      this._noise({ filter: 'bandpass', f0: 200, f1: 3000, dur: 1.2, vol: 0.25, q: 2, attack: 0.6 });
    }

    /** 第弐奥義 一文字斬り＋超新星 */
    playUlt200Slash() {
      if (!this.ready) return;
      this._noise({ filter: 'highpass', f0: 2000, f1: 9000, dur: 0.2, vol: 0.4 });
      this._tone({ type: 'square', f0: 3000, f1: 600, dur: 0.06, vol: 0.12 });
    }
    playSupernova() {
      if (!this.ready) return;
      this._tone({ type: 'sine', f0: 120, f1: 20, dur: 1.4, vol: 0.7 });
      this._noise({ filter: 'lowpass', f0: 8000, f1: 120, dur: 1.6, vol: 0.5, q: 0.5 });
      CFG.AUDIO.POWER_CHORD.forEach((f, i) => {
        this._tone({ type: 'sawtooth', f0: f, dur: 1.8, vol: 0.06, filter: 'lowpass', ff0: 6000, ff1: 500, delay: 0.02 * i });
        this._tone({ type: 'sine', f0: f * 2, dur: 2.2, vol: 0.03, delay: 0.1 + 0.05 * i });
      });
    }

    /** ⑫ ガラス破砕（パリン！！） */
    playGlassShatter() {
      if (!this.ready) return;
      this._noise({ filter: 'highpass', f0: 3000, dur: 0.5, vol: 0.35 });
      for (let i = 0; i < 9; i++) {
        this._tone({ type: 'sine', f0: 2000 + Math.random() * 5000, dur: 0.12 + Math.random() * 0.3, vol: 0.04, delay: Math.random() * 0.25 });
      }
      this._tone({ type: 'sine', f0: 90, f1: 30, dur: 0.5, vol: 0.45 });
    }

    /* その他 UI・戦闘音 */
    playHurt() {
      if (!this.ready || !this._rate('hurt', 120)) return;
      this._tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.3, vol: 0.2, filter: 'lowpass', ff0: 1800, ff1: 200 });
      this._noise({ filter: 'lowpass', f0: 1200, dur: 0.2, vol: 0.25 });
    }
    playWarning() {
      if (!this.ready) return;
      for (let i = 0; i < 3; i++) {
        this._tone({ type: 'square', f0: 330, dur: 0.32, vol: 0.06, delay: i * 0.6, filter: 'lowpass', ff0: 1400 });
        this._tone({ type: 'square', f0: 311, dur: 0.32, vol: 0.06, delay: i * 0.6 + 0.02, filter: 'lowpass', ff0: 1400 });
        this._tone({ type: 'sine', f0: 55, f1: 40, dur: 0.5, vol: 0.4, delay: i * 0.6 });
      }
    }
    playLevelUp() {
      if (!this.ready) return;
      [0, 4, 7, 12, 16].forEach((s, i) => this._tone({ type: 'triangle', f0: this._semiFreq(523.25, s), dur: 0.25, vol: 0.12, delay: i * 0.05 }));
    }
    playAwaken() {
      if (!this.ready) return;
      [0, 7, 12, 19, 24, 31].forEach((s, i) => {
        this._tone({ type: 'sawtooth', f0: this._semiFreq(261.63, s), dur: 0.8, vol: 0.05, filter: 'lowpass', ff0: 3000, delay: i * 0.06 });
        this._tone({ type: 'sine', f0: this._semiFreq(523.25, s), dur: 1.0, vol: 0.06, delay: i * 0.06 });
      });
    }
    playUiClick() {
      if (!this.ready || !this._rate('ui', 40)) return;
      this._tone({ type: 'triangle', f0: 1320, dur: 0.05, vol: 0.08 });
    }
    playUiDeny() {
      if (!this.ready || !this._rate('uid', 80)) return;
      this._tone({ type: 'square', f0: 180, dur: 0.12, vol: 0.06, filter: 'lowpass', ff0: 900 });
    }
    playLightning() {
      if (!this.ready || !this._rate('zap', 45)) return;
      this._noise({ filter: 'bandpass', f0: 3500, f1: 1200, dur: 0.12, vol: 0.18, q: 4 });
      this._tone({ type: 'sawtooth', f0: 1400, f1: 300, dur: 0.1, vol: 0.05 });
    }
    playExplosionSmall() {
      if (!this.ready || !this._rate('exs', 35)) return;
      this._tone({ type: 'sine', f0: 120, f1: 35, dur: 0.22, vol: 0.28 });
      this._noise({ filter: 'lowpass', f0: 2500, f1: 200, dur: 0.22, vol: 0.18 });
    }
    playExecutionHit(i) {
      if (!this.ready || !this._rate('exe', 28)) return;
      const f = this._semiFreq(392, YONA_SCALE[i % YONA_SCALE.length]);
      this._noise({ filter: 'bandpass', f0: 3000, f1: 8000, dur: 0.05, vol: 0.25, q: 1.5 });
      this._tone({ type: 'triangle', f0: f * 2, dur: 0.08, vol: 0.08 });
    }
    playBossDeath() {
      if (!this.ready) return;
      this._tone({ type: 'sine', f0: 80, f1: 18, dur: 2.2, vol: 0.7 });
      this._noise({ filter: 'lowpass', f0: 7000, f1: 80, dur: 2.4, vol: 0.5, q: 0.4 });
      [261.63, 392, 523.25, 783.99, 1046.5].forEach((f, i) => this._tone({ type: 'sine', f0: f, dur: 2.5, vol: 0.05, delay: 0.15 + i * 0.08 }));
    }
    playKunai() {
      if (!this.ready || !this._rate('kun', 30)) return;
      this._noise({ filter: 'highpass', f0: 6000, dur: 0.03, vol: 0.08 });
    }
    playCounter() {
      if (!this.ready) return;
      this._tone({ type: 'square', f0: 1800, f1: 500, dur: 0.08, vol: 0.12 });
      this._tone({ type: 'sine', f0: 660, dur: 0.5, vol: 0.12, delay: 0.02 });
      this._tone({ type: 'sine', f0: 990, dur: 0.5, vol: 0.08, delay: 0.04 });
    }

    /** BGMを一時的に消す（静寂演出） */
    duck(sec) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.bgm.gain.cancelScheduledValues(t);
      this.bgm.gain.setTargetAtTime(0.03, t, 0.03);
      this.bgm.gain.setTargetAtTime(0.32, t + sec, 0.25);
    }

    /* ------------------------------------------------------------------
     * プロシージャル BGM（和風サイバービート）
     * ---------------------------------------------------------------- */
    startBgm(stageId) {
      if (!this.ctx) return;
      this.stopBgm();
      this.bgmOn = true;
      this.bgmStage = stageId;
      this.root = 110 * Math.pow(2, ((CFG.STAGES[stageId] && CFG.STAGES[stageId].bgmRoot) || 0) / 12);
      this.step = 0;
      this.bar = 0;
      this.melodySeed = 7 + stageId * 31;
      this.nextNoteTime = this.ctx.currentTime + 0.08;
      this.bgm.gain.cancelScheduledValues(this.ctx.currentTime);
      this.bgm.gain.setValueAtTime(0.32, this.ctx.currentTime);
      this.timer = setInterval(() => this._schedule(), 25);
    }

    stopBgm() {
      this.bgmOn = false;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    /** スタイルランク(0〜5)に応じてテンポとベースラインが盛り上がる */
    setBgmIntensity(styleRank) {
      this.intensity = Math.max(0, Math.min(5, styleRank | 0));
      this.targetBpm = 104 + this.intensity * 8;
    }

    _rnd() {
      // 決定論的疑似乱数（各小節の旋律を安定させる）
      this.melodySeed = (this.melodySeed * 16807) % 2147483647;
      return (this.melodySeed - 1) / 2147483646;
    }

    _schedule() {
      if (!this.bgmOn || !this.ctx || this.ctx.state !== 'running') return;
      const ahead = 0.14;
      while (this.nextNoteTime < this.ctx.currentTime + ahead) {
        this._playStep(this.step, this.nextNoteTime);
        this.bpm += (this.targetBpm - this.bpm) * 0.05;
        const spb = 60 / this.bpm / 4; // 16分音符
        this.nextNoteTime += spb;
        this.step = (this.step + 1) % 16;
        if (this.step === 0) this.bar = (this.bar + 1) % 4;
      }
      // 遅延が大きすぎる（タブ非アクティブ等）場合は追いつかせる
      if (this.nextNoteTime < this.ctx.currentTime - 0.3) this.nextNoteTime = this.ctx.currentTime + 0.05;
    }

    _playStep(s, t) {
      const I = this.intensity;
      const rootSemi = BAR_ROOTS[this.bar];
      const rootF = this.root * Math.pow(2, rootSemi / 12);
      const dest = this.bgm;

      // キック
      const kick = (s % 4 === 0 && (I >= 1 || s % 8 === 0)) || (I >= 3 && s === 14) || (I >= 5 && s === 10);
      if (kick) this._bKick(t, dest);
      // スネア／クラップ
      if (I >= 1 && (s === 4 || s === 12)) this._bSnare(t, dest);
      if (I >= 4 && s === 15) this._bSnare(t, dest, 0.5);
      // ハット
      if ((I >= 3 ? true : s % 2 === 0)) this._bHat(t, dest, s % 4 === 2 ? 0.07 : 0.04, s === 6 || s === 14);
      // 太鼓ロール（SSS）
      if (I >= 5 && (s === 2 || s === 3 || s === 11)) this._bTom(t, dest, 90 + (s % 2) * 20);
      if (I >= 2 && s === 7 && this.bar === 3) this._bTom(t, dest, 120);

      // ベースライン
      const bassPat = I >= 4 ? [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1]
        : I >= 2 ? [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]
          : [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
      if (bassPat[s]) {
        const octUp = I >= 3 && (s === 6 || s === 14);
        this._bBass(t, dest, rootF * 0.5 * (octUp ? 2 : 1), I);
      }

      // パッド（各小節頭）
      if (s === 0) this._bPad(t, dest, rootF, 60 / this.bpm * 4);

      // 琴（プラック）旋律：密度はランクに比例
      const density = [0.12, 0.2, 0.32, 0.42, 0.55, 0.7][I];
      const r = this._rnd();
      if ((s % 2 === 0 && r < density) || (I >= 4 && s % 2 === 1 && r < density * 0.35)) {
        const sc = I >= 3 ? YONA_SCALE : IN_SCALE;
        const idx = Math.floor(this._rnd() * 8);
        const f = rootF * 2 * Math.pow(2, sc[idx] / 12);
        this._bKoto(t, dest, f);
      }
      // SSS アルペジオ
      if (I >= 5 && s % 2 === 1) {
        const f = rootF * 4 * Math.pow(2, YONA_SCALE[(s >> 1) % 6] / 12);
        this._bArp(t, dest, f);
      }
    }

    _bKick(t, dest) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.3);
    }
    _bSnare(t, dest, v) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35 * (v || 1), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t, Math.random() * 0.5); src.stop(t + 0.18);
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      g2.gain.setValueAtTime(0.18 * (v || 1), t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g2); g2.connect(dest); o.start(t); o.stop(t + 0.12);
    }
    _bHat(t, dest, vol, open) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
      const g = ctx.createGain();
      const d = open ? 0.14 : 0.035;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t, Math.random()); src.stop(t + d + 0.02);
    }
    _bTom(t, dest, f0) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.2);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.27);
    }
    _bBass(t, dest, f, I) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      fl.type = 'lowpass'; fl.Q.value = 6;
      fl.frequency.setValueAtTime(300 + I * 220, t);
      fl.frequency.exponentialRampToValueAtTime(120, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(fl); fl.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.25);
    }
    _bPad(t, dest, f, dur) {
      const ctx = this.ctx;
      [1, 1.5, 2.0].forEach((m, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = f * m;
        o.detune.value = (i - 1) * 6;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.035, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(dest);
        o.start(t); o.stop(t + dur + 0.05);
      });
    }
    _bKoto(t, dest, f) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = f;
      o2.type = 'sawtooth'; o2.frequency.value = f * 1.003;
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(5000, t); fl.frequency.exponentialRampToValueAtTime(700, t + 0.3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(dest);
      o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
    }
    _bArp(t, dest, f) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.1);
    }
  }

  ZI.Audio = { SoundEngine };
})();
