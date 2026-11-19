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
      this.reverbGain.gain.value = 0.34; // 鮮烈な金属余韻と空間の広がり
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
      this.bgm.gain.value = 0.48;
      this.bgmDry = ctx.createGain(); this.bgmDry.gain.value = 1;
      this.bgmWet = ctx.createGain(); this.bgmWet.gain.value = 0.22;
      this.bgm.connect(this.bgmDry); this.bgmDry.connect(this.dry);
      this.bgm.connect(this.bgmWet); this.bgmWet.connect(this.wet);
      this._applyMute(true);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }

    get ready() { return !!this.ctx && this.ctx.state === 'running'; }

    _applyMute(instant) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      for (const [node, on] of [[this.dry, 0.95], [this.wet, 0.95], [this.drive, 0.9]]) {
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
      const list = [];
      if (s.dry) { const g = this.ctx.createGain(); g.gain.value = s.dry; node.connect(g); g.connect(this.dry); list.push(g); }
      if (s.wet) { const g = this.ctx.createGain(); g.gain.value = s.wet; node.connect(g); g.connect(this.wet); list.push(g); }
      if (s.drive) { const g = this.ctx.createGain(); g.gain.value = s.drive; node.connect(g); g.connect(this.drive); list.push(g); }
      return list;
    }

    _cleanup(src, nodes) {
      src.onended = () => {
        for (let i = 0; i < nodes.length; i++) {
          try { nodes[i].disconnect(); } catch (e) { /* ignore */ }
        }
      };
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
      const garbage = [osc];
      let mod = null;
      if (o.fm) {
        // FM変調（金属アタック）
        mod = ctx.createOscillator();
        const mg = ctx.createGain();
        mod.frequency.value = o.fm.freq;
        mg.gain.setValueAtTime(o.fm.depth, t);
        mg.gain.exponentialRampToValueAtTime(Math.max(1, o.fm.depth * 0.05), t + o.dur);
        mod.connect(mg); mg.connect(osc.frequency);
        garbage.push(mod, mg);
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
        garbage.push(f);
      }
      const g = ctx.createGain();
      node.connect(g);
      this._env(g, t, o.vol || 0.2, o.attack || 0.003, o.dur);
      const routed = this._route(g, o.sends);
      garbage.push(g, ...routed);
      this._cleanup(osc, garbage);
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
      const routed = this._route(g, o.sends);
      this._cleanup(src, [src, f, g, ...routed]);
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
      if (!this.ready || !this._rate('lock', 14)) return;
      const f = Math.min(9000, this._semi(CFG.AUDIO.BASE_FREQ, this._chainSemi(chainIndex)));
      const S = { dry: 1.0, wet: 0.8 };
      this._osc({ type: 'triangle', f0: f, dur: 0.34, vol: 0.21, sends: S });                        // ① 基本音
      this._osc({ type: 'sine', f0: Math.min(16000, f * 2), dur: 0.28, vol: 0.11, sends: S });      // ② 1オクターブ上
      this._osc({ type: 'sine', f0: Math.min(16000, f * 1.5), dur: 0.25, vol: 0.09, sends: S });    // ③ 完全5度
      this._osc({ type: 'sine', f0: 3600, dur: 0.045, vol: 0.12, fm: { freq: f * 3.5, depth: 2200 }, attack: 0.001, sends: { dry: 1, wet: 0.55 } }); // ④ 金属アタック「キンッ」
      if (chainIndex >= 15) {
        this._osc({ type: 'sine', f0: Math.min(16000, f * 3.01), dur: 0.55, vol: 0.06, sends: { dry: 0.6, wet: 1.1 } });
      }
      if (chainIndex >= 28) {
        this._osc({ type: 'sine', f0: Math.min(16000, f * 4.0), dur: 0.5, vol: 0.05, delay: 0.018, sends: { dry: 0.5, wet: 1.2 } });
      }
      if (isBomb) {
        this._osc({ type: 'sine', f0: 200, f1: 52, dur: 0.2, vol: 0.32, sends: { dry: 0.7, drive: 0.8 } });
        this._noise({ filter: 'lowpass', f0: 1600, f1: 200, dur: 0.12, vol: 0.1, sends: { dry: 1 } });
      }
    }

    /** ② 重厚な刀の斬撃音：鋭い風切り＋鋼鉄FM鳴り＋サブアタック */
    _slash(scale, pitch, vol) {
      const p = Math.max(0.5, Math.min(2.6, pitch || 1));
      // レイヤー①：鋭い風切り音「シュパッ！」（ノイズ過多を防ぎつつキレを出す）
      this._noise({ filter: 'bandpass', q: 4.0, f0: 3200 * p, f1: 480 * p, dur: 0.08 * scale, vol: 0.24 * vol, sends: { dry: 0.9, wet: 0.35 } });
      // レイヤー②：刃の金属鳴り「シャキィン！」（鋼鉄の芯＋FM倍音）
      this._osc({ type: 'sawtooth', f0: 980 * p, f1: 260 * p, dur: 0.13 * scale, vol: 0.15 * vol, filter: 'lowpass', ff0: 7000, ff1: 1600, q: 1.8, sends: { dry: 0.9, wet: 0.75 } });
      this._osc({ type: 'sine', f0: 3600 * p, f1: 2000 * p, dur: 0.24 * scale, vol: 0.12 * vol, fm: { freq: 5400 * p, depth: 1200 }, attack: 0.001, sends: { dry: 0.75, wet: 1.0 } });
      // レイヤー③：斬り込む瞬間の低域インパクト（手応え）
      this._osc({ type: 'sine', f0: 150, f1: 48, sweep: 0.07 * scale, dur: 0.09 * scale, vol: 0.24 * vol, sends: { drive: 0.7, dry: 0.4 } });
    }

    playPinballSlash(comboCount) {
      if (!this.ready || !this._rate('pin', 16)) return;
      const streak = Math.max(0, comboCount || 0);
      // 連続ピンボールで斬撃そのもののピッチも駆け上がる
      const pitch = 1 + Math.min(streak, 14) * 0.055;
      this._slash(1, pitch, 1.05);
      // 音階が1段ずつ駆け上がる和風クリスタル和音チャイム
      const f = Math.min(7200, this._semi(CFG.AUDIO.BASE_FREQ, this._chainSemi(Math.min(streak, 40))));
      this._osc({ type: 'triangle', f0: f, dur: 0.2, vol: 0.15, delay: 0.008, sends: { dry: 0.9, wet: 0.7 } });
      this._osc({ type: 'sine', f0: Math.min(14000, f * 1.5), dur: 0.18, vol: 0.08, delay: 0.01, sends: { dry: 0.7, wet: 0.8 } });
      if (streak >= 3) {
        this._osc({ type: 'sine', f0: Math.min(16000, f * 2), dur: 0.22, vol: 0.07, delay: 0.014, sends: { dry: 0.5, wet: 1.0 } });
      }
    }

    playIaiStep(stepIndex, totalSteps) {
      if (!this.ready || !this._rate('iai', 11)) return;
      const p = totalSteps > 1 ? stepIndex / (totalSteps - 1) : 1;
      this._slash(0.55, 1.05 + p * 0.75, 0.8);
    }

    /** ③ 納刀「カチッ…！」：硬質な鯉口クリック＋金属余韻（深いリバーブ） */
    playSheatheClick() {
      if (!this.ready) return;
      const S = { dry: 1.0, wet: 1.3 };
      this._osc({ type: 'square', f0: 4200, f1: 1200, sweep: 0.032, dur: 0.035, vol: 0.18, attack: 0.001, sends: S });
      this._osc({ type: 'triangle', f0: 740, f1: 210, sweep: 0.065, dur: 0.075, vol: 0.26, attack: 0.001, sends: S });
      this._osc({ type: 'sine', f0: 5200, dur: 0.18, vol: 0.09, fm: { freq: 7800, depth: 900 }, attack: 0.001, sends: { dry: 0.6, wet: 1.4 } });
      this._noise({ filter: 'bandpass', f0: 4800, q: 2.5, dur: 0.022, vol: 0.24, attack: 0.001, sends: S });
    }

    /** ④ 同時大爆砕「ズバァァァン！！」：歪みサブベース＋LPクラッシュ＋脳汁パワーコード＋和風琴グリッサンド */
    playDetonation(chainCount, isBossBreak) {
      if (!this.ready || !this._rate('det', 38)) return;
      const n = chainCount || 0;
      const big = isBossBreak ? 1.35 : (n >= 15 ? 1.18 : 1);
      // レイヤー①：腹に響く歪みサブベース 170→24Hz
      this._osc({ type: 'sine', f0: 170, f1: 24, sweep: 0.55, dur: 0.58 * big, vol: 0.6, sends: { drive: 1, dry: 0.3 } });
      this._osc({ type: 'triangle', f0: 170, f1: 24, sweep: 0.55, dur: 0.55 * big, vol: 0.36, sends: { drive: 1 } });
      // レイヤー②：キレのある爆発クラッシュ（和音を潰さないよう音量整理）
      this._noise({ filter: 'lowpass', f0: 3800, f1: 180, sweep: 0.44, dur: 0.44 * big, vol: 0.3, q: 0.8, sends: { dry: 0.9, wet: 0.4 } });
      // レイヤー③：脳汁勝利パワーコード和音（5連以上）＋高速琴グリッサンド
      if (n >= CFG.AUDIO.POWER_CHORD_MIN_CHAIN || isBossBreak) {
        CFG.AUDIO.POWER_CHORD.forEach((f, i) => {
          this._osc({ type: 'sawtooth', f0: f, dur: 1.15 * big, vol: 0.11, attack: 0.008, delay: 0.015 + i * 0.012, filter: 'lowpass', ff0: 6200, ff1: 1100, q: 1.4, detune: (i % 2 ? 7 : -7), sends: { dry: 0.9, wet: 1.0 } });
          this._osc({ type: 'triangle', f0: f * 2, dur: 0.75 * big, vol: 0.055, attack: 0.004, delay: 0.02 + i * 0.018, sends: { dry: 0.6, wet: 1.1 } });
        });
        // 高速琴グリッサンド「ジャララララン！」
        const glissCount = Math.min(12, 6 + Math.floor(n / 3));
        for (let i = 0; i < glissCount; i++) {
          const gf = this._semi(587.33, D_MIN_PENTA[i % D_MIN_PENTA.length] + Math.floor(i / D_MIN_PENTA.length) * 12);
          this._osc({ type: 'triangle', f0: gf, dur: 0.38, vol: 0.09, attack: 0.002, delay: 0.025 + i * 0.02, sends: { dry: 0.8, wet: 1.1 } });
        }
      }
      if (n >= 15 || isBossBreak) {
        // 超大規模斬撃：天を裂く高域シマー和音
        [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => {
          this._osc({ type: 'sine', f0: f, dur: 1.3 * big, vol: 0.065, delay: 0.06 + i * 0.025, sends: { dry: 0.5, wet: 1.3 } });
        });
      }
      if (isBossBreak) {
        this._osc({ type: 'sawtooth', f0: 73.42, f1: 36.7, dur: 1.0, vol: 0.26, filter: 'lowpass', ff0: 1100, ff1: 140, sends: { drive: 0.9, dry: 0.35 } });
        this._noise({ filter: 'bandpass', f0: 900, f1: 3600, dur: 0.6, vol: 0.18, delay: 0.05, sends: { dry: 0.6, wet: 0.9 } });
      }
    }

    /** 次元斬：空間裂傷音 */
    playVoidSlash() {
      if (!this.ready || !this._rate('void', 45)) return;
      this._noise({ filter: 'bandpass', q: 3.8, f0: 1800, f1: 7800, dur: 0.22, vol: 0.22, sends: { dry: 0.9, wet: 0.65 } });
      this._osc({ type: 'sawtooth', f0: 2000, f1: 180, dur: 0.28, vol: 0.13, filter: 'bandpass', ff0: 3000, ff1: 420, q: 3.2, sends: { dry: 0.8, wet: 0.95 } });
      this._osc({ type: 'sine', f0: 95, f1: 38, dur: 0.24, vol: 0.26, sends: { drive: 0.85 } });
    }

    /** 次元斬：空間閉鎖爆発（バチン！！） */
    playVoidCollapse() {
      if (!this.ready || !this._rate('voidc', 45)) return;
      this._noise({ filter: 'bandpass', f0: 600, f1: 5200, dur: 0.06, vol: 0.24, q: 1.4, sends: { dry: 0.9, wet: 0.7 } });
      this._osc({ type: 'sine', f0: 130, f1: 26, dur: 0.36, vol: 0.45, sends: { drive: 1, dry: 0.25 } });
      this._osc({ type: 'sine', f0: 2400, f1: 880, dur: 0.18, vol: 0.1, fm: { freq: 3600, depth: 1100 }, sends: { dry: 0.7, wet: 1.0 } });
      this._noise({ filter: 'lowpass', f0: 3200, f1: 200, dur: 0.26, vol: 0.18, delay: 0.03, sends: { dry: 0.9 } });
    }

    /** パリィ：金属反響（非整数倍音クラスター＋高域ノイズ＋リバーブ） */
    playParry() {
      if (!this.ready || !this._rate('parry', 26)) return;
      this._noise({ filter: 'highpass', f0: 6200, dur: 0.02, vol: 0.16, attack: 0.001, sends: { dry: 0.9, wet: 0.6 } });
      [1240, 1873, 2651, 3720].forEach((f, i) => {
        this._osc({ type: 'sine', f0: f, dur: 0.55 - i * 0.08, vol: 0.12 - i * 0.018, sends: { dry: 0.8, wet: 1.15 } });
      });
      this._osc({ type: 'triangle', f0: 1240, dur: 0.05, vol: 0.16, fm: { freq: 3100, depth: 1800 }, sends: { dry: 1, wet: 0.6 } });
    }

    /** 見切り（GRAZE!）「キィン！」 */
    playGraze() {
      if (!this.ready || !this._rate('graze', 36)) return;
      this._osc({ type: 'sine', f0: 2800, f1: 3500, dur: 0.26, vol: 0.14, fm: { freq: 5600, depth: 1200 }, attack: 0.001, sends: { dry: 0.9, wet: 1.1 } });
      this._osc({ type: 'sine', f0: 4200, dur: 0.22, vol: 0.08, sends: { dry: 0.6, wet: 1.2 } });
      this._noise({ filter: 'highpass', f0: 7500, dur: 0.04, vol: 0.12, sends: { dry: 0.9, wet: 0.4 } });
    }

    /** 魂ジェム吸引：クリスタル三和音アルペジオ */
    playGemPickup(streakIndex) {
      if (!this.ready || !this._rate('gem', 18)) return;
      const i = streakIndex % 15;
      const oct = Math.floor(streakIndex / 15) % 2;
      const f = Math.min(7200, this._semi(CFG.AUDIO.GEM_BASE, YONA[i % YONA.length] + oct * 12));
      this._osc({ type: 'sine', f0: f, dur: 0.08, vol: 0.1, attack: 0.002, sends: { dry: 0.85, wet: 0.8 } });
      this._osc({ type: 'sine', f0: f * 2, dur: 0.07, vol: 0.04, attack: 0.002, sends: { dry: 0.5, wet: 0.9 } });
      this._osc({ type: 'triangle', f0: f * 1.5, dur: 0.06, vol: 0.035, attack: 0.002, sends: { dry: 0.5, wet: 0.6 } });
    }

    /** 特大魂オーブ回収：通常ジェムよりリッチな和音チャイム（ティアで段数増） */
    playOrbPickup(tier) {
      if (!this.ready || !this._rate('orb', 6)) return;
      const base = CFG.AUDIO.GEM_BASE;
      const chord = tier >= 3 ? [0, 4, 7, 12, 16, 19] : tier === 2 ? [0, 4, 7, 12] : [0, 7, 12];
      chord.forEach((st, i) => {
        const f = Math.min(7200, this._semi(base, st));
        this._osc({ type: 'sine', f0: f, dur: 0.6, vol: 0.075, attack: 0.003, delay: i * 0.035, sends: { dry: 0.7, wet: 1.1 } });
        this._osc({ type: 'triangle', f0: f * 2, dur: 0.35, vol: 0.03, attack: 0.002, delay: i * 0.035, sends: { dry: 0.4, wet: 1.2 } });
      });
    }

    /** 竜巻バキューム：スロット大当たりのような高速クリスタル連続音 */
    playTornado(count) {
      if (!this.ready) return;
      const n = Math.min(28, 12 + (count | 0));
      const t0 = this.ctx.currentTime;
      for (let i = 0; i < n; i++) {
        const f = Math.min(8200, this._semi(880, YONA[i % YONA.length] + Math.floor(i / YONA.length) * 12));
        this._osc({ type: 'sine', f0: f, dur: 0.09, vol: 0.09, at: t0, delay: i * 0.024, sends: { dry: 0.8, wet: 0.95 } });
        this._osc({ type: 'triangle', f0: f * 2, dur: 0.06, vol: 0.035, at: t0, delay: i * 0.024, sends: { wet: 1.1 } });
      }
      this._noise({ filter: 'bandpass', q: 2.2, f0: 500, f1: 5800, dur: 0.6, vol: 0.11, sends: { dry: 0.7, wet: 0.7 } });
    }

    /** 帯電スタック付与（バチッ＋高揚ベル） */
    playCharge(stacks) {
      if (!this.ready || !this._rate('charge', 55)) return;
      const f = 620 + stacks * 320;
      this._noise({ filter: 'bandpass', q: 4, f0: 3200 + stacks * 800, f1: 1200, dur: 0.09, vol: 0.14, sends: { dry: 0.9, wet: 0.5 } });
      this._osc({ type: 'sawtooth', f0: f, f1: f * 2.4, dur: 0.14, vol: 0.11, filter: 'lowpass', ff0: 5500, sends: { dry: 0.9, wet: 0.7 } });
      if (stacks >= 3) {
        this._osc({ type: 'sine', f0: 1320, dur: 0.42, vol: 0.12, fm: { freq: 2640, depth: 900 }, sends: { dry: 0.8, wet: 1.2 } });
        this._osc({ type: 'sine', f0: 1980, dur: 0.38, vol: 0.08, delay: 0.03, sends: { dry: 0.6, wet: 1.2 } });
      }
    }

    /** 息切れ（OVERHEAT） */
    playOverheat() {
      if (!this.ready || !this._rate('oh', 200)) return;
      this._osc({ type: 'sawtooth', f0: 220, f1: 70, dur: 0.35, vol: 0.16, filter: 'lowpass', ff0: 1400, ff1: 200, sends: { drive: 0.6, dry: 0.5 } });
      this._noise({ filter: 'lowpass', f0: 900, f1: 200, dur: 0.28, vol: 0.14, sends: { dry: 0.9 } });
    }

    playUiDeny() {
      if (!this.ready || !this._rate('uid', 80)) return;
      this._osc({ type: 'square', f0: 180, dur: 0.12, vol: 0.08, filter: 'lowpass', ff0: 900, sends: { dry: 1 } });
      this._osc({ type: 'triangle', f0: 120, dur: 0.14, vol: 0.09, sends: { dry: 1, wet: 0.25 } });
    }

    /** 第壱奥義『千本桜・墨嵐』 */
    playUltimate100() {
      if (!this.ready) return;
      this.duck(0.5);
      this._osc({ type: 'sine', f0: 58, f1: 28, dur: 1.2, vol: 0.55, sends: { drive: 1, dry: 0.35 } });
      this._noise({ filter: 'bandpass', f0: 350, f1: 6500, dur: 0.8, vol: 0.22, q: 0.8, sends: { dry: 0.9, wet: 0.7 } });
      [261.63, 311.13, 392, 466.16, 523.25].forEach((f, i) => {
        this._osc({ type: 'sawtooth', f0: f, dur: 1.5, vol: 0.095, filter: 'lowpass', ff0: 700, ff1: 6000, delay: i * 0.035, sends: { dry: 0.8, wet: 1.1 } });
      });
      [196, 293.66, 392.9, 587.3, 783.99].forEach((f) => this._osc({ type: 'sine', f0: f, dur: 2.4, vol: 0.075, delay: 0.08, sends: { dry: 0.5, wet: 1.3 } }));
    }

    /** 第弐奥義『絶・虚空一文字』（重力収束の吸引） */
    playUltimate200() {
      if (!this.ready) return;
      this.duck(3.2);
      this._osc({ type: 'sawtooth', f0: 32, f1: 240, sweep: 1.2, dur: 1.25, vol: 0.24, filter: 'lowpass', ff0: 220, ff1: 2200, sends: { drive: 0.85, dry: 0.45 } });
      this._osc({ type: 'sine', f0: 42, f1: 24, dur: 1.4, vol: 0.55, sends: { drive: 1 } });
      this._noise({ filter: 'bandpass', f0: 200, f1: 3600, dur: 1.2, vol: 0.22, q: 2.2, attack: 0.6, sends: { dry: 0.8, wet: 0.9 } });
    }

    playUlt200Slash() {
      if (!this.ready) return;
      this._slash(2.2, 0.85, 1.45);
      this._osc({ type: 'square', f0: 3400, f1: 620, dur: 0.07, vol: 0.16, sends: { dry: 1, wet: 0.9 } });
    }

    playSupernova() {
      if (!this.ready) return;
      this._osc({ type: 'sine', f0: 150, f1: 20, dur: 1.45, vol: 0.72, sends: { drive: 1, dry: 0.35 } });
      this._osc({ type: 'triangle', f0: 150, f1: 20, dur: 1.45, vol: 0.42, sends: { drive: 1 } });
      this._noise({ filter: 'lowpass', f0: 8000, f1: 120, dur: 1.5, vol: 0.36, q: 0.5, sends: { dry: 0.9, wet: 0.7 } });
      CFG.AUDIO.POWER_CHORD.forEach((f, i) => {
        this._osc({ type: 'sawtooth', f0: f, dur: 2.0, vol: 0.11, filter: 'lowpass', ff0: 6500, ff1: 600, delay: 0.02 * i, sends: { dry: 0.9, wet: 1.1 } });
        this._osc({ type: 'sine', f0: f * 2, dur: 2.3, vol: 0.06, delay: 0.08 + 0.04 * i, sends: { wet: 1.3 } });
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
        this._osc({ type: 'sawtooth', f0: this._semi(261.63, s), dur: 1.0, vol: 0.085, filter: 'lowpass', ff0: 4200, delay: i * 0.055, sends: { dry: 0.8, wet: 1.1 } });
        this._osc({ type: 'sine', f0: this._semi(523.25, s), dur: 1.1, vol: 0.09, delay: i * 0.055, sends: { dry: 0.7, wet: 1.2 } });
      });
      this._taiko(0, 1.2);
    }

    playUiClick() {
      if (!this.ready || !this._rate('ui', 40)) return;
      this._osc({ type: 'triangle', f0: 1320, dur: 0.05, vol: 0.09, sends: { dry: 1, wet: 0.35 } });
      this._osc({ type: 'sine', f0: 2640, dur: 0.035, vol: 0.04, sends: { dry: 1 } });
      this._noise({ filter: 'highpass', f0: 6000, dur: 0.015, vol: 0.07, sends: { dry: 1 } });
    }

    playLightning() {
      if (!this.ready || !this._rate('zap', 42)) return;
      this._noise({ filter: 'bandpass', f0: 3800, f1: 1200, dur: 0.14, vol: 0.18, q: 4, sends: { dry: 0.9, wet: 0.6 } });
      this._osc({ type: 'sawtooth', f0: 1500, f1: 320, dur: 0.13, vol: 0.11, sends: { dry: 0.8, drive: 0.4 } });
      this._osc({ type: 'sine', f0: 2800, f1: 900, dur: 0.1, vol: 0.07, fm: { freq: 4200, depth: 1500 }, sends: { dry: 0.7, wet: 0.8 } });
    }

    playExplosionSmall() {
      if (!this.ready || !this._rate('exs', 35)) return;
      this._osc({ type: 'sine', f0: 150, f1: 30, dur: 0.24, vol: 0.36, sends: { drive: 1 } });
      this._noise({ filter: 'lowpass', f0: 2800, f1: 200, dur: 0.22, vol: 0.18, sends: { dry: 0.9, wet: 0.25 } });
    }

    playExecutionHit(i) {
      if (!this.ready || !this._rate('exe', 24)) return;
      this._slash(0.6, 1 + (i % 8) * 0.06, 0.95);
      const f = this._semi(392, YONA[i % YONA.length]);
      this._osc({ type: 'triangle', f0: f * 2, dur: 0.12, vol: 0.1, sends: { dry: 0.85, wet: 0.75 } });
    }

    playBossDeath() {
      if (!this.ready) return;
      this._osc({ type: 'sine', f0: 95, f1: 18, dur: 2.2, vol: 0.72, sends: { drive: 1, dry: 0.35 } });
      this._noise({ filter: 'lowpass', f0: 7000, f1: 80, dur: 2.2, vol: 0.36, q: 0.4, sends: { dry: 0.9, wet: 0.8 } });
      CFG.AUDIO.POWER_CHORD.forEach((f, i) => {
        this._osc({ type: 'sawtooth', f0: f, dur: 2.5, vol: 0.09, filter: 'lowpass', ff0: 5000, ff1: 600, delay: 0.12 + i * 0.07, sends: { dry: 0.7, wet: 1.2 } });
        this._osc({ type: 'sine', f0: f * 2, dur: 2.8, vol: 0.055, delay: 0.16 + i * 0.08, sends: { dry: 0.5, wet: 1.3 } });
      });
    }

    playCounter() {
      if (!this.ready) return;
      this._osc({ type: 'square', f0: 1900, f1: 520, dur: 0.08, vol: 0.15, sends: { dry: 1, wet: 0.7 } });
      this._osc({ type: 'sine', f0: 660, dur: 0.55, vol: 0.16, delay: 0.02, sends: { dry: 0.7, wet: 1.1 } });
      this._osc({ type: 'sine', f0: 990, dur: 0.55, vol: 0.11, delay: 0.04, sends: { dry: 0.7, wet: 1.1 } });
      this._osc({ type: 'sine', f0: 1320, dur: 0.6, vol: 0.08, delay: 0.06, sends: { wet: 1.2 } });
    }

    /** 巨大毛筆カットイン（大太鼓＋銅鑼＋和風和音） */
    playBrushCutin(phase) {
      if (!this.ready) return;
      this._taiko(0, 1.35);
      this._taiko(0.11, 1.1);
      const base = phase >= 3 ? 73.42 : 98;
      [1, 1.5, 2, 3.01, 4].forEach((m, i) => this._osc({ type: 'sine', f0: base * 2 * m, dur: 2.0, vol: 0.095 - i * 0.012, delay: 0.02, sends: { dry: 0.55, wet: 1.3 } }));
      if (phase >= 3) {
        this._noise({ filter: 'bandpass', q: 1.2, f0: 350, f1: 4500, dur: 0.85, vol: 0.18, sends: { dry: 0.6, wet: 0.9 } });
        [293.66, 440, 587.33, 880].forEach((f, i) => {
          this._osc({ type: 'sawtooth', f0: f, dur: 1.3, vol: 0.07, filter: 'lowpass', ff0: 4500, ff1: 800, delay: 0.04 + i * 0.02, sends: { dry: 0.7, wet: 1.2 } });
        });
      }
    }

    /** 秘伝開眼スロット：回転中の太鼓連打＋チャイム */
    playSlotSpin(dur) {
      if (!this.ready) return;
      const t0 = this.ctx.currentTime;
      const n = Math.floor(dur / 0.075);
      for (let i = 0; i < n; i++) {
        this._osc({ type: 'triangle', f0: this._semi(1046.5, YONA[(i * 3) % YONA.length] % 12), dur: 0.045, vol: 0.07, at: t0, delay: i * 0.075, sends: { dry: 0.85, wet: 0.5 } });
        if (i % 2 === 0) this._taiko(i * 0.075, 0.55, t0);
      }
    }

    /** 秘伝開眼スロット：ファンファーレ（当たり等級 0〜2） */
    playSlotWin(tier) {
      if (!this.ready) return;
      const notes = tier >= 2 ? [0, 4, 7, 12, 16, 19, 24] : tier === 1 ? [0, 4, 7, 12, 16] : [0, 7, 12];
      notes.forEach((s, i) => {
        this._osc({ type: 'sawtooth', f0: this._semi(392, s), dur: 0.55, vol: 0.085, filter: 'lowpass', ff0: 4800, delay: i * 0.055, sends: { dry: 0.8, wet: 1.1 } });
        this._osc({ type: 'sine', f0: this._semi(784, s), dur: 0.65, vol: 0.08, delay: i * 0.055, sends: { dry: 0.6, wet: 1.2 } });
      });
      for (let i = 0; i <= tier; i++) this._taiko(i * 0.14, 1.2);
      if (tier >= 2) this.playDetonation(14, true);
    }

    /** 和太鼓（低域ドン＋皮の打撃ノイズ） */
    _taiko(delay, vol, at) {
      const t = (at != null ? at : this.ctx.currentTime);
      this._osc({ type: 'sine', f0: 125, f1: 46, sweep: 0.18, dur: 0.34, vol: 0.58 * vol, at: t, delay, sends: { drive: 0.65, dry: 0.65, wet: 0.25 } });
      this._noise({ filter: 'lowpass', f0: 950, f1: 200, dur: 0.07, vol: 0.18 * vol, at: t, delay, sends: { dry: 1 } });
    }

    /** BGMを一時的に消す（静寂演出） */
    duck(sec) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.bgm.gain.cancelScheduledValues(t);
      this.bgm.gain.setTargetAtTime(0.03, t, 0.03);
      this.bgm.gain.setTargetAtTime(0.48, t + sec, 0.25);
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
      this.bgm.gain.setValueAtTime(0.48, this.ctx.currentTime);
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
      if (I >= 4 && (s === 14 || s === 7)) this._bKick(t, B, 0.65);
      // クラップ（2・4拍）
      if (I >= 1 && (s === 4 || s === 12)) this._bClap(t, B, 1);
      if (I >= 3 && s === 15) this._bClap(t, B, 0.55);
      // ハイハット刻み（常時8分、S以上は16分）
      if (s % 2 === 0 || I >= 3) this._bHat(t, B, s % 4 === 2 ? 0.085 : 0.048, s === 6 || s === 14);
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
      // 高域の和風琴アルペジオ（Rank A以上で追加、ランクと共に密度と煌めき上昇）
      if (I >= 2) {
        const pattern = I >= 5 ? 1 : I >= 4 ? (s % 2 === 0 ? 1 : 0.55) : I >= 3 ? (s % 2 === 0 ? 1 : 0.25) : (s % 4 === 0 ? 1 : s % 2 === 0 ? 0.45 : 0);
        if (this._rnd() < pattern) {
          const deg = D_MIN_PENTA[(Math.floor(s / 2) + this.bar * 2 + (I >= 4 ? Math.floor(this._rnd() * 3) : 0)) % D_MIN_PENTA.length];
          this._bKoto(t, B, 293.66 * Math.pow(2, deg / 12), I);
        }
      } else if (s % 8 === 4 && this._rnd() < 0.5) {
        this._bKoto(t, B, 293.66 * Math.pow(2, D_MIN_PENTA[Math.floor(this._rnd() * 6)] / 12), I);
      }
      // Rank SS〜SSS（鬼神トランス）：駆け上がるサイバー和風リードメロディ
      if (I >= 4 && (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14)) {
        const leadNotes = [0, 3, 5, 7, 10, 12, 15, 17];
        const deg = leadNotes[(s + this.bar * 3 + (I >= 5 ? 2 : 0)) % leadNotes.length];
        this._bLead(t, B, 587.33 * Math.pow(2, deg / 12), I, 60 / this.bpm * 0.45);
      }
    }

    _bKick(t, dest, v) {
      const ctx = this.ctx;
      const vol = v || 1;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(135, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.95 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      o.connect(g); g.connect(dest);
      // 歪み送りで和太鼓の胴鳴りを太く
      const d = ctx.createGain(); d.gain.value = 0.38 * vol; g.connect(d); d.connect(this.drive);
      this._cleanup(o, [o, g, d]);
      o.start(t); o.stop(t + 0.36);
      // 皮の打撃
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.24 * vol, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      n.connect(f); f.connect(ng); ng.connect(dest);
      this._cleanup(n, [n, f, ng]);
      n.start(t, Math.random()); n.stop(t + 0.06);
    }
    _bClap(t, dest, v) {
      const ctx = this.ctx;
      for (let k = 0; k < 3; k++) {
        const tt = t + k * 0.011;
        const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3 * v * (k === 2 ? 1 : 0.6), tt);
        g.gain.exponentialRampToValueAtTime(0.001, tt + (k === 2 ? 0.18 : 0.03));
        src.connect(f); f.connect(g); g.connect(dest);
        this._cleanup(src, [src, f, g]);
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
      this._cleanup(src, [src, f, g]);
      src.start(t, Math.random()); src.stop(t + d + 0.02);
    }
    _bTom(t, dest, f0) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.2);
      g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o.connect(g); g.connect(dest);
      const d = ctx.createGain(); d.gain.value = 0.28; g.connect(d); d.connect(this.drive);
      this._cleanup(o, [o, g, d]);
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
      const peak = 550 + I * 460 + (accent ? 650 : 0);
      fl.frequency.setValueAtTime(peak, t);
      fl.frequency.exponentialRampToValueAtTime(140, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.19, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(fl); o2.connect(og2); og2.connect(fl); fl.connect(g); g.connect(dest);
      const garbage = [o, o2, og2, fl, g];
      if (I >= 3) { const d = ctx.createGain(); d.gain.value = 0.28; g.connect(d); d.connect(this.drive); garbage.push(d); }
      this._cleanup(o, garbage);
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
        g.gain.linearRampToValueAtTime(0.038, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(dest);
        this._cleanup(o, [o, g]);
        o.start(t); o.stop(t + dur + 0.05);
      });
    }
    /** 琴（コト）：三角波＋デチューン鋸波のプラック＋リバーブ */
    _bKoto(t, dest, f, I) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = f;
      o2.type = 'sawtooth'; o2.frequency.value = f * 1.004;
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(6500, t); fl.frequency.exponentialRampToValueAtTime(900, t + 0.32);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.085 + I * 0.01, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(dest);
      const w = ctx.createGain(); w.gain.value = 0.7; g.connect(w); w.connect(this.wet);
      this._cleanup(o, [o, o2, fl, g, w]);
      o.start(t); o2.start(t); o.stop(t + 0.55); o2.stop(t + 0.55);
    }
    /** 鬼神トランスリード：Rank SS〜SSS で鳴り響く高揚サイバー和風リード */
    _bLead(t, dest, f, I, dur) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      o2.type = 'sawtooth'; o2.frequency.setValueAtTime(f * 1.006, t);
      fl.type = 'lowpass'; fl.Q.value = 3.5;
      fl.frequency.setValueAtTime(4800 + (I >= 5 ? 2000 : 0), t);
      fl.frequency.exponentialRampToValueAtTime(1200, t + dur);
      const peak = I >= 5 ? 0.085 : 0.06;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(dest);
      const w = ctx.createGain(); w.gain.value = 0.85; g.connect(w); w.connect(this.wet);
      this._cleanup(o, [o, o2, fl, g, w]);
      o.start(t); o2.start(t); o.stop(t + dur + 0.04); o2.stop(t + dur + 0.04);
    }
  }

  ZI.Audio = { SoundEngine };
})();
