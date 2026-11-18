/* ==========================================================================
 * CHAIN SLASH : 絶・一閃 (ZETSU-ISSEN)  v2.0
 * [4] js/audio.js — 超重厚 Web Audio API 多層DSPエンジン
 *     マスタリングチェーン：WaveShaper歪み ／ Convolver残響 ／ Compressor
 *     効果音：風切りノイズ＋金属倍音＋歪みサブベース＋和音チャイムの多層合成
 *     BGM：和太鼓4つ打ち＋サイバーアシッドベース（Dマイナーペンタ）＋ハット＋琴アルペジオ
 *          ランク連動テンポ（A128→S138→SS148→SSS160）＋キック毎に onBeatPulse()
 * 単一オシレーターを destination へ直結するような単音ビープは一切使用しない。
 * 公開: window.ZetsuIssen.Audio = { SoundEngine }
 * ========================================================================== */
(function () {
  'use strict';
  const ZI = (window.ZetsuIssen = window.ZetsuIssen || {});
  const CFG = ZI.Config;
  const MUTE_KEY = 'zetsu_issen_mute';

  const YONA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const D_MIN_PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]; // D F G A C
  // 4小節のベース進行（Dマイナーペンタ構成音の度数インデックス）
  const BASS_PROG = [
    [0, 0, 2, 0, 3, 0, 2, 4],
    [0, 0, 2, 0, 1, 0, 3, 2],
    [3, 3, 4, 3, 2, 2, 1, 0],
    [0, 0, 2, 3, 4, 3, 2, 1]
  ];

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage unavailable */ }
      this._last = {};
      this.bgmOn = false;
      this.intensity = 0;
      this.bpm = 120;
      this.targetBpm = 120;
      this.step = 0;
      this.bar = 0;
      this.timer = null;
      this.seed = 1;
    }

    /** 最初のユーザー操作で呼ぶ（自動再生制限対策） */
    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }

      /* ===== 9.1 マスタリングDSPチェーン（仕様書のコードレシピ通り） ===== */
      // 1. マスターコンプレッサー（音割れを防ぎつつ全体の音圧を太くする）
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);
      this.compressor.connect(this.ctx.destination);

      // 2. プロシージャル・ホールリバーブ（ConvolverNode 用のインパルス応答バッファを自動生成）
      this.convolver = this.ctx.createConvolver();
      const irRate = this.ctx.sampleRate;
      const irLength = Math.floor(irRate * 1.1); // 1.1秒の残響
      const irBuffer = this.ctx.createBuffer(2, irLength, irRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = irBuffer.getChannelData(ch);
        for (let i = 0; i < irLength; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 2.8);
        }
      }
      this.convolver.buffer = irBuffer;
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.28; // 美しい金属余韻
      this.convolver.connect(this.reverbGain);
      this.reverbGain.connect(this.compressor);

      // 3. WaveShaper ディストーションカーブ（爆発音や重低音キックを太く歪ませる）
      this.distortion = this.ctx.createWaveShaper();
      const curve = new Float32Array(44100);
      for (let i = 0; i < 44100; i++) {
        const x = (i * 2) / 44100 - 1;
        curve[i] = ((3 + 25) * x * 20 * (Math.PI / 180)) / (Math.PI + 25 * Math.abs(x));
      }
      this.distortion.curve = curve;
      this.distortion.oversample = '2x';
      this.distortion.connect(this.compressor);

      // 4. 2秒間のホワイトノイズバッファ（刀の風切り音・爆発クラッシュ音で再利用）
      const noiseLen = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
      const noiseData = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;

      /* ===== 送りバス（ミュート制御もここで行う） ===== */
      const ctx = this.ctx;
      this.dry = ctx.createGain();    // → compressor
      this.wet = ctx.createGain();    // → convolver（リバーブ送り）
      this.drive = ctx.createGain();  // → distortion（歪み送り）
      this.dry.connect(this.compressor);
      this.wet.connect(this.convolver);
      this.drive.connect(this.distortion);
      this.bgm = ctx.createGain();
      this.bgm.gain.value = 0.42;
      this.bgmDry = ctx.createGain(); this.bgmDry.gain.value = 1;
      this.bgmWet = ctx.createGain(); this.bgmWet.gain.value = 0.18;
      this.bgm.connect(this.bgmDry); this.bgmDry.connect(this.dry);
      this.bgm.connect(this.bgmWet); this.bgmWet.connect(this.wet);
      this._applyMute(true);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }

    get ready() { return !!this.ctx && this.ctx.state === 'running'; }

    _applyMute(instant) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      for (const [node, on] of [[this.dry, 0.9], [this.wet, 0.9], [this.drive, 0.85]]) {
        node.gain.cancelScheduledValues(t);
        if (instant) node.gain.setValueAtTime(this.muted ? 0 : on, t);
        else node.gain.setTargetAtTime(this.muted ? 0 : on, t, 0.02);
      }
    }

    toggleMute() { this.setMuted(!this.muted); return this.muted; }
    setMuted(m) {
      this.muted = m;
      try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* ignore */ }
      this._applyMute(false);
    }
    setPaused(p) {
      if (!this.ctx) return;
      if (p) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {});
    }

    /* ------------------------------------------------------------------
     * 多層合成ヘルパー
     * sends: { dry, wet, drive } それぞれの送りレベル
     * ---------------------------------------------------------------- */
    _rate(key, ms) {
      const now = performance.now();
      if (this._last[key] && now - this._last[key] < ms) return false;
      this._last[key] = now;
      return true;
    }

    _route(node, sends) {
      const s = sends || { dry: 1 };
      if (s.dry) { const g = this.ctx.createGain(); g.gain.value = s.dry; node.connect(g); g.connect(this.dry); }
      if (s.wet) { const g = this.ctx.createGain(); g.gain.value = s.wet; node.connect(g); g.connect(this.wet); }
      if (s.drive) { const g = this.ctx.createGain(); g.gain.value = s.drive; node.connect(g); g.connect(this.drive); }
    }

    _env(g, t, vol, attack, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    }

    /** オシレーター層（ピッチスイープ・フィルター・FM 任意） */
    _osc(o) {
      const ctx = this.ctx;
      const t = (o.at != null ? o.at : ctx.currentTime) + (o.delay || 0);
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(10, o.f0), t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + (o.sweep || o.dur));
      if (o.detune) osc.detune.value = o.detune;
      let mod = null;
      if (o.fm) {
        // FM変調（金属アタック）
        mod = ctx.createOscillator();
        const mg = ctx.createGain();
        mod.frequency.value = o.fm.freq;
        mg.gain.setValueAtTime(o.fm.depth, t);
        mg.gain.exponentialRampToValueAtTime(Math.max(1, o.fm.depth * 0.05), t + o.dur);
        mod.connect(mg); mg.connect(osc.frequency);
      }
      let node = osc;
      if (o.filter) {
        const f = ctx.createBiquadFilter();
        f.type = o.filter;
        f.frequency.setValueAtTime(o.ff0 || 2000, t);
        if (o.ff1) f.frequency.exponentialRampToValueAtTime(o.ff1, t + (o.fsweep || o.dur));
        f.Q.value = o.q == null ? 0.8 : o.q;
        node.connect(f);
        node = f;
      }
      const g = ctx.createGain();
      node.connect(g);
      this._env(g, t, o.vol || 0.2, o.attack || 0.003, o.dur);
      this._route(g, o.sends);
      const end = t + (o.attack || 0.003) + o.dur + 0.06;
      osc.start(t); osc.stop(end);
      if (mod) { mod.start(t); mod.stop(end); }
    }

    /** ノイズ層（noiseBuffer 再利用） */
    _noise(o) {
      const ctx = this.ctx;
      const t = (o.at != null ? o.at : ctx.currentTime) + (o.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'bandpass';
      f.frequency.setValueAtTime(o.f0 || 2000, t);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep || o.dur));
      f.Q.value = o.q == null ? 1 : o.q;
      const g = ctx.createGain();
      src.connect(f); f.connect(g);
      this._env(g, t, o.vol || 0.2, o.attack || 0.002, o.dur);
      this._route(g, o.sends);
      src.start(t, Math.random() * 1.5);
      src.stop(t + (o.attack || 0.002) + o.dur + 0.05);
    }

    _semi(base, s) { return base * Math.pow(2, s / 12); }
    _chainSemi(i) {
      const S = CFG.AUDIO.SEMITONES;
      return i < S.length ? S[i] : S[S.length - 1] + (i - S.length + 1) * 0.5;
    }

    /* ==================================================================
     * 9.2 効果音レシピ
     * ================================================================ */

    /** ① ロックオン音階チャイム：三角波基本音＋1oct上sine＋完全5度＋FM金属アタック（ドライ＋リバーブ） */
    playLockOn(chainIndex, isBomb) {
      if (!this.ready || !this._rate('lock', 16)) return;
      const f = Math.min(9000, this._semi(CFG.AUDIO.BASE_FREQ, this._chainSemi(chainIndex)));
      const S = { dry: 0.9, wet: 0.65 };
      this._osc({ type: 'triangle', f0: f, dur: 0.32, vol: 0.13, sends: S });                     // ① 基本音
      this._osc({ type: 'sine', f0: Math.min(16000, f * 2), dur: 0.26, vol: 0.06, sends: S });    // ② 1オクターブ上
      this._osc({ type: 'sine', f0: Math.min(16000, f * 1.5), dur: 0.24, vol: 0.05, sends: S });  // ③ 完全5度
      this._osc({ type: 'sine', f0: 3200, dur: 0.035, vol: 0.06, fm: { freq: f * 3.5, depth: 1800 }, attack: 0.001, sends: { dry: 1, wet: 0.4 } }); // ④ 金属アタック
      if (chainIndex >= 29) {
        this._osc({ type: 'sine', f0: Math.min(16000, f * 3.01), dur: 0.6, vol: 0.035, sends: { dry: 0.5, wet: 1 } });
        this._osc({ type: 'sine', f0: Math.min(16000, f * 4.2), dur: 0.45, vol: 0.025, delay: 0.02, sends: { dry: 0.5, wet: 1 } });
      }
      if (isBomb) {
        this._osc({ type: 'sine', f0: 180, f1: 55, dur: 0.18, vol: 0.25, sends: { dry: 0.6, drive: 0.7 } });
        this._noise({ filter: 'lowpass', f0: 1600, f1: 200, dur: 0.12, vol: 0.12, sends: { dry: 1 } });
      }
    }

    /** ② 重厚な刀の斬撃音：風切り（BP Q3.5 2800→420Hz）＋刃の金属鳴り（saw 920→240 ＋ sine 3400→1800） */
    _slash(scale, pitch, vol) {
      // レイヤー①：風切り音「シュパッ！」
      this._noise({ filter: 'bandpass', q: 3.5, f0: 2800 * pitch, f1: 420 * pitch, dur: 0.09 * scale, vol: 0.42 * vol, sends: { dry: 1, wet: 0.25 } });
      // レイヤー②：刃の金属鳴り「シャキィン！」（リバーブへも送る）
      this._osc({ type: 'sawtooth', f0: 920 * pitch, f1: 240 * pitch, dur: 0.12 * scale, vol: 0.07 * vol, filter: 'lowpass', ff0: 6000, ff1: 1500, sends: { dry: 0.8, wet: 0.6 } });
      this._osc({ type: 'sine', f0: 3400 * pitch, f1: 1800 * pitch, dur: 0.22 * scale, vol: 0.05 * vol, sends: { dry: 0.6, wet: 0.9 } });
    }

    playPinballSlash(comboCount) {
      if (!this.ready || !this._rate('pin', 18)) return;
      this._slash(1, 1, 1);
      // 連続ピンボールで音階が1段ずつ上昇する和音チャイム
      const f = this._semi(CFG.AUDIO.BASE_FREQ, this._chainSemi(Math.min(comboCount, 40)));
      this._osc({ type: 'triangle', f0: f, dur: 0.16, vol: 0.06, delay: 0.01, sends: { dry: 0.8, wet: 0.5 } });
      this._osc({ type: 'sine', f0: f * 1.5, dur: 0.14, vol: 0.03, delay: 0.01, sends: { dry: 0.6, wet: 0.5 } });
    }

    playIaiStep(stepIndex, totalSteps) {
      if (!this.ready || !this._rate('iai', 12)) return;
      const p = totalSteps > 1 ? stepIndex / (totalSteps - 1) : 1;
      this._slash(0.55, 1 + p * 0.6, 0.7);
    }

    /** ③ 納刀「カチッ…！」：square 3800→1100 ＋ triangle 620→180 ＋ BPノイズ4500Hz（深いリバーブ） */
    playSheatheClick() {
      if (!this.ready) return;
      const S = { dry: 1, wet: 1.2 };
      this._osc({ type: 'square', f0: 3800, f1: 1100, sweep: 0.035, dur: 0.035, vol: 0.12, attack: 0.001, sends: S });
      this._osc({ type: 'triangle', f0: 620, f1: 180, sweep: 0.07, dur: 0.07, vol: 0.2, attack: 0.001, sends: S });
      this._noise({ filter: 'bandpass', f0: 4500, q: 2, dur: 0.025, vol: 0.3, attack: 0.001, sends: S });
    }

    /** ④ 同時大爆砕「ズバァァァン！！」：歪みサブベース＋LPクラッシュ＋（5連以上）パワーコード和音 */
    playDetonation(chainCount, isBossBreak) {
      if (!this.ready || !this._rate('det', 40)) return;
      const big = isBossBreak ? 1.3 : 1;
      // レイヤー①：sine＋triangle 160→26Hz（0.55秒）を WaveShaper へ
      this._osc({ type: 'sine', f0: 160, f1: 26, sweep: 0.55, dur: 0.55 * big, vol: 0.55, sends: { drive: 1, dry: 0.25 } });
      this._osc({ type: 'triangle', f0: 160, f1: 26, sweep: 0.55, dur: 0.55 * big, vol: 0.35, sends: { drive: 1 } });
      // レイヤー②：爆発クラッシュノイズ LP 3600→180Hz（0.48秒）
      this._noise({ filter: 'lowpass', f0: 3600, f1: 180, sweep: 0.48, dur: 0.48 * big, vol: 0.45, q: 0.7, sends: { dry: 1, wet: 0.35 } });
      // レイヤー③：脳汁勝利パワーコード
      if ((chainCount || 0) >= CFG.AUDIO.POWER_CHORD_MIN_CHAIN || isBossBreak) {
        CFG.AUDIO.POWER_CHORD.forEach((f, i) => {
          this._osc({ type: 'sawtooth', f0: f, dur: 1.1 * big, vol: 0.045, attack: 0.01, delay: 0.02 + i * 0.012, filter: 'lowpass', ff0: 5200, ff1: 900, q: 1.2, detune: (i % 2 ? 6 : -6), sends: { dry: 0.8, wet: 0.9 } });
        });
      }
      if (isBossBreak) {
        this._osc({ type: 'sawtooth', f0: 73.42, f1: 36.7, dur: 1.0, vol: 0.2, filter: 'lowpass', ff0: 900, ff1: 120, sends: { drive: 0.8, dry: 0.3 } });
        this._noise({ filter: 'bandpass', f0: 800, f1: 3200, dur: 0.6, vol: 0.2, delay: 0.05, sends: { dry: 0.6, wet: 0.8 } });
      }
    }

    /** 次元斬：空間裂傷音 */
    playVoidSlash() {
      if (!this.ready || !this._rate('void', 45)) return;
      this._noise({ filter: 'bandpass', q: 3.5, f0: 1600, f1: 7200, dur: 0.22, vol: 0.28, sends: { dry: 1, wet: 0.5 } });
      this._osc({ type: 'sawtooth', f0: 1800, f1: 160, dur: 0.28, vol: 0.06, filter: 'bandpass', ff0: 2600, ff1: 420, q: 3, sends: { dry: 0.6, wet: 0.8 } });
      this._osc({ type: 'sine', f0: 90, f1: 40, dur: 0.22, vol: 0.2, sends: { drive: 0.8 } });
    }

    /** 次元斬：空間閉鎖爆発（バチン！！） */
    playVoidCollapse() {
      if (!this.ready || !this._rate('voidc', 50)) return;
      this._noise({ filter: 'bandpass', f0: 500, f1: 4600, dur: 0.06, vol: 0.32, q: 1.2, sends: { dry: 1, wet: 0.6 } });
      this._osc({ type: 'sine', f0: 120, f1: 28, dur: 0.34, vol: 0.4, sends: { drive: 1, dry: 0.2 } });
      this._noise({ filter: 'lowpass', f0: 3200, f1: 200, dur: 0.3, vol: 0.22, delay: 0.03, sends: { dry: 1 } });
    }

    /** パリィ：金属反響（非整数倍音クラスター＋高域ノイズ＋リバーブ） */
    playParry() {
      if (!this.ready || !this._rate('parry', 28)) return;
      this._noise({ filter: 'highpass', f0: 6000, dur: 0.02, vol: 0.22, attack: 0.001, sends: { dry: 1, wet: 0.5 } });
      [1240, 1873, 2651, 3720].forEach((f, i) => {
        this._osc({ type: 'sine', f0: f, dur: 0.5 - i * 0.08, vol: 0.06 - i * 0.01, sends: { dry: 0.7, wet: 1 } });
      });
      this._osc({ type: 'triangle', f0: 1240, dur: 0.04, vol: 0.08, fm: { freq: 3100, depth: 1400 }, sends: { dry: 1 } });
    }

    /** 見切り（GRAZE!）「キィン！」 */
    playGraze() {
      if (!this.ready || !this._rate('graze', 40)) return;
      this._osc({ type: 'sine', f0: 2600, f1: 3100, dur: 0.22, vol: 0.07, fm: { freq: 5200, depth: 900 }, attack: 0.001, sends: { dry: 0.8, wet: 1 } });
      this._osc({ type: 'sine', f0: 3900, dur: 0.18, vol: 0.04, sends: { dry: 0.5, wet: 1 } });
      this._noise({ filter: 'highpass', f0: 7000, dur: 0.05, vol: 0.18, sends: { dry: 1, wet: 0.3 } });
    }

    /** 魂ジェム吸引：クリスタル三和音アルペジオ */
    playGemPickup(streakIndex) {
      if (!this.ready || !this._rate('gem', 20)) return;
      const i = streakIndex % 15;
      const oct = Math.floor(streakIndex / 15) % 2;
      const f = Math.min(7000, this._semi(CFG.AUDIO.GEM_BASE, YONA[i % YONA.length] + oct * 12));
      this._osc({ type: 'sine', f0: f, dur: 0.06, vol: 0.06, attack: 0.002, sends: { dry: 0.8, wet: 0.7 } });
      this._osc({ type: 'sine', f0: f * 2, dur: 0.05, vol: 0.02, attack: 0.002, sends: { dry: 0.5, wet: 0.7 } });
      this._osc({ type: 'triangle', f0: f * 1.5, dur: 0.05, vol: 0.02, attack: 0.002, sends: { dry: 0.5, wet: 0.5 } });
    }

    /** 竜巻バキューム：スロット大当たりのような高速クリスタル連続音 */
    playTornado(count) {
      if (!this.ready) return;
      const n = Math.min(28, 10 + (count | 0));
      const t0 = this.ctx.currentTime;
      for (let i = 0; i < n; i++) {
        const f = Math.min(8000, this._semi(880, YONA[i % YONA.length] + Math.floor(i / YONA.length) * 12));
        this._osc({ type: 'sine', f0: f, dur: 0.07, vol: 0.05, at: t0, delay: i * 0.028, sends: { dry: 0.7, wet: 0.8 } });
        this._osc({ type: 'triangle', f0: f * 2, dur: 0.05, vol: 0.015, at: t0, delay: i * 0.028, sends: { wet: 1 } });
      }
      this._noise({ filter: 'bandpass', q: 2, f0: 400, f1: 5200, dur: 0.6, vol: 0.12, sends: { dry: 0.7, wet: 0.6 } });
    }

    /** 帯電スタック付与（バチッ） */
    playCharge(stacks) {
      if (!this.ready || !this._rate('charge', 60)) return;
      const f = 600 + stacks * 300;
      this._noise({ filter: 'bandpass', q: 4, f0: 3000 + stacks * 800, f1: 1200, dur: 0.1, vol: 0.18, sends: { dry: 1, wet: 0.4 } });
      this._osc({ type: 'sawtooth', f0: f, f1: f * 2.4, dur: 0.12, vol: 0.05, filter: 'lowpass', ff0: 5000, sends: { dry: 0.8, wet: 0.6 } });
      if (stacks >= 3) this._osc({ type: 'sine', f0: 1320, dur: 0.35, vol: 0.05, fm: { freq: 2640, depth: 600 }, sends: { dry: 0.6, wet: 1 } });
    }

    /** 息切れ（OVERHEAT） */
    playOverheat() {
      if (!this.ready || !this._rate('oh', 200)) return;
      this._osc({ type: 'sawtooth', f0: 220, f1: 70, dur: 0.35, vol: 0.12, filter: 'lowpass', ff0: 1400, ff1: 200, sends: { drive: 0.6, dry: 0.4 } });
      this._noise({ filter: 'lowpass', f0: 900, f1: 200, dur: 0.3, vol: 0.18, sends: { dry: 1 } });
    }

    playUiDeny() {
      if (!this.ready || !this._rate('uid', 80)) return;
      this._osc({ type: 'square', f0: 180, dur: 0.12, vol: 0.05, filter: 'lowpass', ff0: 900, sends: { dry: 1 } });
      this._osc({ type: 'triangle', f0: 120, dur: 0.14, vol: 0.06, sends: { dry: 1, wet: 0.2 } });
    }

    /** 第壱奥義『千本桜・墨嵐』 */
    playUltimate100() {
      if (!this.ready) return;
      this.duck(0.5);
      this._osc({ type: 'sine', f0: 55, f1: 30, dur: 1.2, vol: 0.5, sends: { drive: 1, dry: 0.3 } });
      this._noise({ filter: 'bandpass', f0: 300, f1: 6000, dur: 0.8, vol: 0.28, q: 0.7, sends: { dry: 1, wet: 0.6 } });
      [261.63, 311.13, 392, 466.16, 523.25].forEach((f, i) => {
        this._osc({ type: 'sawtooth', f0: f, dur: 1.4, vol: 0.045, filter: 'lowpass', ff0: 600, ff1: 5000, delay: i * 0.04, sends: { dry: 0.7, wet: 1 } });
      });
      [196, 293.66, 392.9, 587.3].forEach((f) => this._osc({ type: 'sine', f0: f, dur: 2.4, vol: 0.05, delay: 0.1, sends: { dry: 0.4, wet: 1.2 } }));
    }

    /** 第弐奥義『絶・虚空一文字』（重力収束の吸引） */
    playUltimate200() {
      if (!this.ready) return;
      this.duck(3.2);
      this._osc({ type: 'sawtooth', f0: 30, f1: 220, sweep: 1.2, dur: 1.25, vol: 0.18, filter: 'lowpass', ff0: 200, ff1: 1800, sends: { drive: 0.8, dry: 0.4 } });
      this._osc({ type: 'sine', f0: 40, f1: 25, dur: 1.4, vol: 0.5, sends: { drive: 1 } });
      this._noise({ filter: 'bandpass', f0: 200, f1: 3000, dur: 1.2, vol: 0.28, q: 2, attack: 0.6, sends: { dry: 0.8, wet: 0.8 } });
    }

    playUlt200Slash() {
      if (!this.ready) return;
      this._slash(2.2, 0.8, 1.4);
      this._osc({ type: 'square', f0: 3000, f1: 600, dur: 0.06, vol: 0.1, sends: { dry: 1, wet: 0.8 } });
    }

    playSupernova() {
      if (!this.ready) return;
      this._osc({ type: 'sine', f0: 140, f1: 20, dur: 1.4, vol: 0.7, sends: { drive: 1, dry: 0.3 } });
      this._osc({ type: 'triangle', f0: 140, f1: 20, dur: 1.4, vol: 0.4, sends: { drive: 1 } });
      this._noise({ filter: 'lowpass', f0: 8000, f1: 120, dur: 1.6, vol: 0.5, q: 0.5, sends: { dry: 1, wet: 0.6 } });
      CFG.AUDIO.POWER_CHORD.forEach((f, i) => {
        this._osc({ type: 'sawtooth', f0: f, dur: 1.9, vol: 0.05, filter: 'lowpass', ff0: 6000, ff1: 500, delay: 0.02 * i, sends: { dry: 0.8, wet: 1 } });
        this._osc({ type: 'sine', f0: f * 2, dur: 2.2, vol: 0.025, delay: 0.1 + 0.05 * i, sends: { wet: 1.2 } });
      });
    }

    /** ガラス破砕（パリン！！） */
    playGlassShatter() {
      if (!this.ready) return;
      this._noise({ filter: 'highpass', f0: 3000, dur: 0.5, vol: 0.35, sends: { dry: 1, wet: 0.8 } });
      for (let i = 0; i < 10; i++) {
        this._osc({ type: 'sine', f0: 2000 + Math.random() * 5000, dur: 0.12 + Math.random() * 0.3, vol: 0.035, delay: Math.random() * 0.25, sends: { dry: 0.6, wet: 1 } });
      }
      this._osc({ type: 'sine', f0: 90, f1: 30, dur: 0.5, vol: 0.45, sends: { drive: 1 } });
    }

    playHurt() {
      if (!this.ready || !this._rate('hurt', 120)) return;
      this._osc({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.3, vol: 0.18, filter: 'lowpass', ff0: 1800, ff1: 200, sends: { drive: 0.7, dry: 0.5 } });
      this._noise({ filter: 'lowpass', f0: 1200, dur: 0.2, vol: 0.25, sends: { dry: 1 } });
    }

    playWarning() {
      if (!this.ready) return;
      for (let i = 0; i < 3; i++) {
        this._osc({ type: 'square', f0: 330, dur: 0.32, vol: 0.05, delay: i * 0.6, filter: 'lowpass', ff0: 1400, sends: { dry: 0.8, wet: 0.6 } });
        this._osc({ type: 'square', f0: 311, dur: 0.32, vol: 0.05, delay: i * 0.6 + 0.02, filter: 'lowpass', ff0: 1400, sends: { dry: 0.8, wet: 0.6 } });
        this._osc({ type: 'sine', f0: 55, f1: 40, dur: 0.5, vol: 0.4, delay: i * 0.6, sends: { drive: 1 } });
      }
    }

    playLevelUp() {
      if (!this.ready) return;
      [0, 4, 7, 12, 16].forEach((s, i) => {
        this._osc({ type: 'triangle', f0: this._semi(523.25, s), dur: 0.3, vol: 0.09, delay: i * 0.05, sends: { dry: 0.8, wet: 0.8 } });
        this._osc({ type: 'sine', f0: this._semi(1046.5, s), dur: 0.25, vol: 0.03, delay: i * 0.05, sends: { wet: 1 } });
      });
    }

    playAwaken() {
      if (!this.ready) return;
      [0, 7, 12, 19, 24, 31].forEach((s, i) => {
        this._osc({ type: 'sawtooth', f0: this._semi(261.63, s), dur: 0.9, vol: 0.04, filter: 'lowpass', ff0: 3000, delay: i * 0.06, sends: { dry: 0.7, wet: 1 } });
        this._osc({ type: 'sine', f0: this._semi(523.25, s), dur: 1.0, vol: 0.05, delay: i * 0.06, sends: { dry: 0.6, wet: 1 } });
      });
      this._taiko(0, 1);
    }

    playUiClick() {
      if (!this.ready || !this._rate('ui', 40)) return;
      this._osc({ type: 'triangle', f0: 1320, dur: 0.05, vol: 0.06, sends: { dry: 1, wet: 0.3 } });
      this._osc({ type: 'sine', f0: 2640, dur: 0.03, vol: 0.02, sends: { dry: 1 } });
      this._noise({ filter: 'highpass', f0: 6000, dur: 0.015, vol: 0.08, sends: { dry: 1 } });
    }

    playLightning() {
      if (!this.ready || !this._rate('zap', 45)) return;
      this._noise({ filter: 'bandpass', f0: 3500, f1: 1200, dur: 0.14, vol: 0.2, q: 4, sends: { dry: 1, wet: 0.5 } });
      this._osc({ type: 'sawtooth', f0: 1400, f1: 300, dur: 0.12, vol: 0.05, sends: { dry: 0.7, drive: 0.3 } });
    }

    playExplosionSmall() {
      if (!this.ready || !this._rate('exs', 35)) return;
      this._osc({ type: 'sine', f0: 140, f1: 32, dur: 0.24, vol: 0.32, sends: { drive: 1 } });
      this._noise({ filter: 'lowpass', f0: 2800, f1: 200, dur: 0.24, vol: 0.2, sends: { dry: 1, wet: 0.2 } });
    }

    playExecutionHit(i) {
      if (!this.ready || !this._rate('exe', 26)) return;
      this._slash(0.6, 1 + (i % 8) * 0.05, 0.9);
      const f = this._semi(392, YONA[i % YONA.length]);
      this._osc({ type: 'triangle', f0: f * 2, dur: 0.1, vol: 0.05, sends: { dry: 0.8, wet: 0.6 } });
    }

    playBossDeath() {
      if (!this.ready) return;
      this._osc({ type: 'sine', f0: 90, f1: 18, dur: 2.2, vol: 0.7, sends: { drive: 1, dry: 0.3 } });
      this._noise({ filter: 'lowpass', f0: 7000, f1: 80, dur: 2.4, vol: 0.5, q: 0.4, sends: { dry: 1, wet: 0.7 } });
      CFG.AUDIO.POWER_CHORD.forEach((f, i) => this._osc({ type: 'sine', f0: f, dur: 2.6, vol: 0.045, delay: 0.15 + i * 0.08, sends: { dry: 0.5, wet: 1.2 } }));
    }

    playKunai() {
      if (!this.ready || !this._rate('kun', 30)) return;
      this._noise({ filter: 'bandpass', q: 3.5, f0: 6000, f1: 2000, dur: 0.04, vol: 0.1, sends: { dry: 1, wet: 0.3 } });
      this._osc({ type: 'sine', f0: 3400, f1: 2200, dur: 0.05, vol: 0.02, sends: { wet: 1 } });
    }

    playCounter() {
      if (!this.ready) return;
      this._osc({ type: 'square', f0: 1800, f1: 500, dur: 0.08, vol: 0.1, sends: { dry: 1, wet: 0.6 } });
      this._osc({ type: 'sine', f0: 660, dur: 0.5, vol: 0.1, delay: 0.02, sends: { dry: 0.6, wet: 1 } });
      this._osc({ type: 'sine', f0: 990, dur: 0.5, vol: 0.07, delay: 0.04, sends: { dry: 0.6, wet: 1 } });
    }

    /** 巨大毛筆カットイン（大太鼓＋銅鑼） */
    playBrushCutin(phase) {
      if (!this.ready) return;
      this._taiko(0, 1.3);
      this._taiko(0.12, 1.0);
      const base = phase >= 3 ? 73.42 : 98;
      [1, 1.5, 2, 3.01].forEach((m, i) => this._osc({ type: 'sine', f0: base * 2 * m, dur: 1.8, vol: 0.05 - i * 0.008, delay: 0.02, sends: { dry: 0.4, wet: 1.2 } }));
      if (phase >= 3) this._noise({ filter: 'bandpass', q: 1, f0: 300, f1: 4000, dur: 0.9, vol: 0.2, sends: { dry: 0.6, wet: 0.8 } });
    }

    /** 秘伝開眼スロット：回転中の太鼓連打＋チャイム */
    playSlotSpin(dur) {
      if (!this.ready) return;
      const t0 = this.ctx.currentTime;
      const n = Math.floor(dur / 0.075);
      for (let i = 0; i < n; i++) {
        this._osc({ type: 'triangle', f0: this._semi(1046.5, YONA[(i * 3) % YONA.length] % 12), dur: 0.04, vol: 0.035, at: t0, delay: i * 0.075, sends: { dry: 0.8, wet: 0.4 } });
        if (i % 2 === 0) this._taiko(i * 0.075, 0.45, t0);
      }
    }

    /** 秘伝開眼スロット：ファンファーレ（当たり等級 0〜2） */
    playSlotWin(tier) {
      if (!this.ready) return;
      const notes = tier >= 2 ? [0, 4, 7, 12, 16, 19, 24] : tier === 1 ? [0, 4, 7, 12, 16] : [0, 7, 12];
      notes.forEach((s, i) => {
        this._osc({ type: 'sawtooth', f0: this._semi(392, s), dur: 0.5, vol: 0.04, filter: 'lowpass', ff0: 4000, delay: i * 0.06, sends: { dry: 0.7, wet: 1 } });
        this._osc({ type: 'sine', f0: this._semi(784, s), dur: 0.6, vol: 0.04, delay: i * 0.06, sends: { dry: 0.5, wet: 1 } });
      });
      for (let i = 0; i <= tier; i++) this._taiko(i * 0.14, 1.1);
      if (tier >= 2) this.playDetonation(12, true);
    }

    /** 和太鼓（低域ドン＋皮の打撃ノイズ） */
    _taiko(delay, vol, at) {
      const t = (at != null ? at : this.ctx.currentTime);
      this._osc({ type: 'sine', f0: 120, f1: 48, sweep: 0.18, dur: 0.32, vol: 0.55 * vol, at: t, delay, sends: { drive: 0.6, dry: 0.6, wet: 0.2 } });
      this._noise({ filter: 'lowpass', f0: 900, f1: 200, dur: 0.08, vol: 0.2 * vol, at: t, delay, sends: { dry: 1 } });
    }

    /** BGMを一時的に消す（静寂演出） */
    duck(sec) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.bgm.gain.cancelScheduledValues(t);
      this.bgm.gain.setTargetAtTime(0.03, t, 0.03);
      this.bgm.gain.setTargetAtTime(0.42, t + sec, 0.25);
    }

    /* ==================================================================
     * 9.2-5 スタイルランク連動・和風サイバービートBGM
     * ================================================================ */
    startBgm(stageId) {
      if (!this.ctx) return;
      this.stopBgm();
      this.bgmOn = true;
      this.stage = stageId | 0;
      this.step = 0;
      this.bar = 0;
      this.seed = 11 + this.stage * 37;
      this.bpm = this.targetBpm;
      this.nextNoteTime = this.ctx.currentTime + 0.08;
      this.bgm.gain.cancelScheduledValues(this.ctx.currentTime);
      this.bgm.gain.setValueAtTime(0.42, this.ctx.currentTime);
      this.timer = setInterval(() => this._schedule(), 25);
    }

    stopBgm() {
      this.bgmOn = false;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    /** styleRank: 0=C 1=B 2=A 3=S 4=SS 5=SSS */
    setBgmIntensity(styleRank) {
      this.intensity = Math.max(0, Math.min(5, styleRank | 0));
      this.targetBpm = CFG.STYLE_RANKS[this.intensity].bpm;
    }

    _rnd() {
      this.seed = (this.seed * 16807) % 2147483647;
      return (this.seed - 1) / 2147483646;
    }

    _schedule() {
      if (!this.bgmOn || !this.ctx || this.ctx.state !== 'running') return;
      const ahead = 0.14;
      while (this.nextNoteTime < this.ctx.currentTime + ahead) {
        this._playStep(this.step, this.nextNoteTime);
        this.bpm += (this.targetBpm - this.bpm) * 0.08;
        this.nextNoteTime += 60 / this.bpm / 4; // 16分音符
        this.step = (this.step + 1) % 16;
        if (this.step === 0) this.bar = (this.bar + 1) % 4;
      }
      if (this.nextNoteTime < this.ctx.currentTime - 0.3) this.nextNoteTime = this.ctx.currentTime + 0.05;
    }

    _beatPulse(t) {
      // キックが実際に鳴る瞬間に背景脈動を同期させる
      const delay = Math.max(0, (t - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        const G = window.ZetsuIssen && window.ZetsuIssen.Game;
        if (G && typeof G.onBeatPulse === 'function') G.onBeatPulse();
      }, delay);
    }

    _playStep(s, t) {
      const I = this.intensity;
      const B = this.bgm;
      // 和太鼓ローキック（4つ打ち）
      if (s % 4 === 0) { this._bKick(t, B); this._beatPulse(t); }
      if (I >= 4 && (s === 14 || s === 7)) this._bKick(t, B, 0.6);
      // クラップ（2・4拍）
      if (I >= 1 && (s === 4 || s === 12)) this._bClap(t, B, 1);
      if (I >= 3 && s === 15) this._bClap(t, B, 0.5);
      // ハイハット刻み（常時8分、S以上は16分）
      if (s % 2 === 0 || I >= 3) this._bHat(t, B, s % 4 === 2 ? 0.08 : 0.045, s === 6 || s === 14);
      // 太鼓ロール（SS以上）
      if (I >= 4 && (s === 2 || s === 3 || s === 10 || s === 11)) this._bTom(t, B, 95 + (s % 2) * 25);
      // サイバーアシッドベース（Dマイナーペンタ D2 F2 G2 A2 C3）
      const prog = BASS_PROG[this.bar];
      if (s % 2 === 0 || I >= 4) {
        const idx = prog[(s >> 1) % 8];
        const oct = (I >= 2 && s % 4 === 3) ? 2 : 1;
        this._bAcid(t, B, CFG.AUDIO.BASS_NOTES[idx] * oct, I, s % 2 === 1);
      }
      // パッド（小節頭）
      if (s === 0) this._bPad(t, B, CFG.AUDIO.BASS_NOTES[prog[0]] * 2, 60 / this.bpm * 4);
      // 高域の和風琴アルペジオ（Rank A以上で追加、ランクと共に密度上昇）
      if (I >= 2) {
        const pattern = I >= 5 ? 1 : I >= 4 ? (s % 2 === 0 ? 1 : 0.5) : I >= 3 ? (s % 2 === 0 ? 1 : 0) : (s % 4 === 0 ? 1 : s % 2 === 0 ? 0.4 : 0);
        if (this._rnd() < pattern) {
          const deg = D_MIN_PENTA[(Math.floor(s / 2) + this.bar * 2 + (I >= 4 ? Math.floor(this._rnd() * 3) : 0)) % D_MIN_PENTA.length];
          this._bKoto(t, B, 293.66 * Math.pow(2, deg / 12), I);
        }
      } else if (s % 8 === 4 && this._rnd() < 0.5) {
        this._bKoto(t, B, 293.66 * Math.pow(2, D_MIN_PENTA[Math.floor(this._rnd() * 6)] / 12), I);
      }
    }

    _bKick(t, dest, v) {
      const ctx = this.ctx;
      const vol = v || 1;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.95 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      o.connect(g); g.connect(dest);
      // 歪み送りで和太鼓の胴鳴りを太く
      const d = ctx.createGain(); d.gain.value = 0.35 * vol; g.connect(d); d.connect(this.drive);
      o.start(t); o.stop(t + 0.36);
      // 皮の打撃
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.25 * vol, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      n.connect(f); f.connect(ng); ng.connect(dest);
      n.start(t, Math.random()); n.stop(t + 0.06);
    }
    _bClap(t, dest, v) {
      const ctx = this.ctx;
      for (let k = 0; k < 3; k++) {
        const tt = t + k * 0.011;
        const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.32 * v * (k === 2 ? 1 : 0.6), tt);
        g.gain.exponentialRampToValueAtTime(0.001, tt + (k === 2 ? 0.18 : 0.03));
        src.connect(f); f.connect(g); g.connect(dest);
        src.start(tt, Math.random()); src.stop(tt + 0.2);
      }
    }
    _bHat(t, dest, vol, open) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7800;
      const g = ctx.createGain();
      const d = open ? 0.13 : 0.03;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t, Math.random()); src.stop(t + d + 0.02);
    }
    _bTom(t, dest, f0) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.2);
      g.gain.setValueAtTime(0.42, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o.connect(g); g.connect(dest);
      const d = ctx.createGain(); d.gain.value = 0.25; g.connect(d); d.connect(this.drive);
      o.start(t); o.stop(t + 0.26);
    }
    /** アシッドベース：鋸波＋共振ローパスのエンベロープスイープ（ランクでカットオフ上昇） */
    _bAcid(t, dest, f, I, accent) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator();
      const fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      o2.type = 'square'; o2.frequency.setValueAtTime(f * 0.5, t);
      const og2 = ctx.createGain(); og2.gain.value = 0.35;
      fl.type = 'lowpass'; fl.Q.value = 9 + I * 1.5;
      const peak = 500 + I * 420 + (accent ? 600 : 0);
      fl.frequency.setValueAtTime(peak, t);
      fl.frequency.exponentialRampToValueAtTime(140, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(fl); o2.connect(og2); og2.connect(fl); fl.connect(g); g.connect(dest);
      if (I >= 3) { const d = ctx.createGain(); d.gain.value = 0.25; g.connect(d); d.connect(this.drive); }
      o.start(t); o2.start(t); o.stop(t + 0.22); o2.stop(t + 0.22);
    }
    _bPad(t, dest, f, dur) {
      const ctx = this.ctx;
      [1, 1.5, 2.0].forEach((m, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = f * m;
        o.detune.value = (i - 1) * 7;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(dest);
        o.start(t); o.stop(t + dur + 0.05);
      });
    }
    /** 琴（コト）：三角波＋デチューン鋸波のプラック＋リバーブ */
    _bKoto(t, dest, f, I) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = f;
      o2.type = 'sawtooth'; o2.frequency.value = f * 1.004;
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(6000, t); fl.frequency.exponentialRampToValueAtTime(800, t + 0.3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06 + I * 0.006, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(dest);
      const w = ctx.createGain(); w.gain.value = 0.6; g.connect(w); w.connect(this.wet);
      o.start(t); o2.start(t); o.stop(t + 0.55); o2.stop(t + 0.55);
    }
  }

  ZI.Audio = { SoundEngine };
})();
