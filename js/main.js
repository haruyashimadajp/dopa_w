/* ==========================================================================
 * CHAIN SLASH : 絶・一閃 (ZETSU-ISSEN)
 * [7] js/main.js — 入力判定(B:迅雷 / A:居合 / D:次元斬)・スタイルランク進化・
 *                  奥義・ゲームループ・UI/セーブ管理
 * 公開: window.ZetsuIssen.Game
 * ========================================================================== */
(function () {
  'use strict';
  const ZI = window.ZetsuIssen;
  const CFG = ZI.Config;
  const C = CFG.COLORS;
  const P = CFG.PARAMS;
  const U = ZI.Util;
  const E = ZI.Entities;
  const FX = ZI.Effects;
  const TAU = U.TAU;
  const $ = (id) => document.getElementById(id);

  const STATE = {
    TITLE: 'TITLE', DOJO: 'DOJO', PLAYING: 'PLAYING', LEVEL_UP: 'LEVEL_UP', BOSS_INTRO: 'BOSS_INTRO',
    BOSS_EXECUTION: 'BOSS_EXECUTION', STAGE_CLEAR: 'STAGE_CLEAR', GAME_OVER: 'GAME_OVER'
  };

  /* ========================================================================
   * セーブ管理（localStorage: zetsu_issen_save_v1）
   * ====================================================================== */
  class SaveManager {
    constructor() { this.data = this.load(); }
    load() {
      const def = JSON.parse(JSON.stringify(CFG.DEFAULT_SAVE));
      try {
        const raw = localStorage.getItem(CFG.SAVE_KEY);
        if (!raw) return def;
        const d = JSON.parse(raw);
        const out = Object.assign(def, d);
        out.dojoLevels = Object.assign({}, CFG.DEFAULT_SAVE.dojoLevels, d.dojoLevels || {});
        if (!Array.isArray(out.clearedStages) || out.clearedStages.length < 3) out.clearedStages = [false, false, false];
        if (!Array.isArray(out.unlockedBlades) || !out.unlockedBlades.length) out.unlockedBlades = ['byakuya'];
        if (!out.unlockedBlades.includes('byakuya')) out.unlockedBlades.unshift('byakuya');
        if (!CFG.BLADES[out.selectedBlade] || !out.unlockedBlades.includes(out.selectedBlade)) out.selectedBlade = 'byakuya';
        out.soulCoins = Math.max(0, out.soulCoins | 0);
        return out;
      } catch (e) {
        return def;
      }
    }
    save() {
      try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
    }
  }

  /* ========================================================================
   * Game：ステートマシン＆全ゲームロジック
   * ====================================================================== */
  class Game {
    constructor() {
      this.canvas = $('game-canvas');
      this.renderer = new FX.Renderer(this.canvas);
      this.fx = new FX.EffectManager();
      this.fx.ensureAssets();
      this.audio = new ZI.Audio.SoundEngine();
      this.saveMgr = new SaveManager();
      this.save = this.saveMgr.data;

      this.state = STATE.TITLE;
      this.paused = false;
      this.w = this.renderer.w;
      this.h = this.renderer.h;
      this.time = 0;
      this.realTime = 0;
      this.dtReal = 0.016;
      this.worldScale = 1;
      this.frame = 0;
      this.hitstop = 0;
      this.bulletFx = 0;
      this.hurtFx = 0;
      this.pal = { inv: false };
      this.camera = { zoom: 1, base: 1, punch: 0, punchT: 0, shake: 0, sx: 0, sy: 0 };
      this.stageIndex = 0;
      this.stage = CFG.STAGES[0];

      this.player = null;
      this.enemies = [];
      this.bullets = [];
      this.kunais = [];
      this.waves = [];
      this.gems = [];
      this.gimmicks = [];
      this.bosses = [];
      this.blackHoles = [];
      this.formations = [];
      this.scrolls = [];
      this.timers = [];
      this.overheat = 0;
      this.charge = 0;
      this.activeCharge = 0;
      this.slot = null;
      this.pendingSpawns = [];

      this.input = {
        keys: { left: false, right: false, up: false, down: false },
        mode: 'idle', down: false, pointerId: null,
        downT: 0, downX: 0, downY: 0, lastX: 0, lastY: 0, cx: 0, cy: 0,
        drag: 0, touched: new Set(), path: [], lockList: [], strokeId: 0, ignore: false,
        flickCd: 0, queuedFlick: null, autoChain: 0, pointerType: 'mouse', hasMouse: false
      };
      this.iai = null;
      this.sheatheT = 0;

      this.ui = new UI(this);
      this._bindEvents();
      this.resize();
      this.ui.showTitle();
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    /* ------------------------------------------------------------------
     * 派生ステータス
     * ---------------------------------------------------------------- */
    get blade() { return CFG.BLADES[this.save.selectedBlade] || CFG.BLADES.byakuya; }
    dojo(id) { return this.save.dojoLevels[id] || 0; }
    skillLv(id) { return this.run ? (this.run.skills[id] || 0) : 0; }
    hasAwakening(id) { return !!(this.run && this.run.awakenings.has(id)); }
    get rank() { return CFG.STYLE_RANKS[this.run ? this.run.rankIdx : 0]; }
    get phase() { return this.rank.phase; }
    atk() { return this.blade.atk * (1 + 0.12 * this.dojo('attackPower')); }
    get trancePhase() { return this.run ? this.phase : 1; }
    focusMax() { return P.FOCUS_MAX * (1 + 0.12 * this.dojo('focusMax')); }
    focusRegen() { return P.FOCUS_REGEN * (1 + 0.12 * this.dojo('focusMax')); }
    /** ロックオン照準サークル半径（帯電中の居合は最大1.85倍＝MAX帯電で約96px） */
    lockRadius() {
      const w = this.skillLv('wideIai');
      const ch = this.input.mode === 'aim' ? this.activeCharge : this.charge;
      return this.blade.lockRadius * (1 + 0.08 * this.dojo('lockRadius')) * (1 + (w ? CFG.SKILL_TABLE.wideIai.radius[w - 1] : 0))
        * (this.phase >= 2 ? P.PHASE2_LOCK_MULT : 1) * P.CHARGE_LOCK_MULT[ch];
    }
    /** 迅雷1回の集中消費（18／紅蓮-30%／神速-15〜50%／鬼神トランスで半減） */
    flickCost() {
      const g = this.skillLv('godspeed');
      return P.PINBALL_FOCUS_COST * this.blade.flickCostMult * (1 - (g ? CFG.SKILL_TABLE.godspeed.cost[g - 1] : 0)) * (this.phase === 3 ? P.PHASE3_FOCUS_COST_MULT : 1);
    }
    grazeRange() {
      const g = this.skillLv('godspeed');
      return P.GRAZE_RANGE * (1 + (g ? CFG.SKILL_TABLE.godspeed.graze[g - 1] : 0));
    }
    /** 非攻撃時のホバー移動先（PC：カーソル／タッチ：ドラッグ方向） */
    hoverTarget() {
      const inp = this.input;
      const pl = this.player;
      if (!pl || this.ultMode === 'ult200') return null;
      if (inp.pointerType === 'mouse') {
        if (!inp.hasMouse) return null;
        if (inp.mode === 'idle' || inp.mode === 'move' || (inp.mode === 'press' && this.overheat > 0)) return { x: inp.cx, y: inp.cy };
        return null;
      }
      if (inp.down && (inp.mode === 'move' || inp.mode === 'press')) {
        const dx = inp.cx - inp.downX, dy = inp.cy - inp.downY;
        const d = Math.hypot(dx, dy);
        if (d > 8) return { x: pl.x + dx / d * 120, y: pl.y + dy / d * 120 };
      }
      return null;
    }
    lockFocusGain() {
      const w = this.skillLv('wideIai');
      return P.FOCUS_LOCK_GAIN * (this.phase >= 2 ? P.PHASE2_FOCUS_GAIN_MULT : 1) * (1 + (w ? CFG.SKILL_TABLE.wideIai.focus[w - 1] : 0));
    }
    focusCostMult() {
      let m = this.blade.focusCostMult;
      if (this.phase === 3) m *= this.rank.id === 'SSS' ? 0 : P.PHASE3_FOCUS_COST_MULT;
      return m;
    }
    magnetRadius() {
      const g = this.skillLv('godspeed');
      return P.GEM_MAGNET * (1 + 0.15 * this.dojo('xpGain')) * (1 + (g ? CFG.SKILL_TABLE.godspeed.magnet[g - 1] : 0));
    }
    xpMult() { return 1 + 0.15 * this.dojo('xpGain'); }
    dashMult() {
      const g = this.skillLv('godspeed');
      return this.blade.dashMult * (1 + (g ? CFG.SKILL_TABLE.godspeed.dash[g - 1] : 0));
    }
    blastMult() {
      const c = this.skillLv('crimson');
      return 1 + (c ? CFG.SKILL_TABLE.crimson.radius[c - 1] : 0);
    }
    moveSpeedMult() { return 1 + this.skillLv('godspeed') * 0.06; }
    canMove() { return this.state === STATE.PLAYING || this.state === STATE.BOSS_INTRO; }
    isActiveFight() { return this.state === STATE.PLAYING && !this.paused; }
    get magnetAll() { return this.state === STATE.BOSS_INTRO || this.state === STATE.STAGE_CLEAR || (this.exec && this.exec.finished); }

    /* ------------------------------------------------------------------
     * 入力
     * ---------------------------------------------------------------- */
    _bindEvents() {
      window.addEventListener('resize', () => this.resize());
      const cv = this.canvas;
      cv.addEventListener('pointerdown', (e) => this._onPointerDown(e));
      window.addEventListener('pointermove', (e) => this._onPointerMove(e));
      window.addEventListener('pointerup', (e) => this._onPointerUp(e));
      window.addEventListener('pointercancel', (e) => this._onPointerUp(e));
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (e) => this._onKey(e, true));
      window.addEventListener('keyup', (e) => this._onKey(e, false));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && (this.state === STATE.PLAYING || this.state === STATE.BOSS_INTRO) && !this.paused) this.setPaused(true);
      });
      // 最初の操作でオーディオ起動
      const unlock = () => { this.audio.init(); };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
    }

    resize() {
      this.renderer.resize();
      this.w = this.renderer.w;
      this.h = this.renderer.h;
      this.areaScale = U.clamp((this.w * this.h) / (1280 * 720), 0.55, 1.3);
      if (this.player) {
        this.player.x = U.clamp(this.player.x, 16, this.w - 16);
        this.player.y = U.clamp(this.player.y, 16, this.h - 16);
      }
    }

    _toWorld(ev) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
      const cam = this.camera;
      const cx = this.w / 2, cy = this.h / 2;
      return { x: (sx - cx - cam.sx) / cam.zoom + cx, y: (sy - cy - cam.sy) / cam.zoom + cy };
    }

    _onKey(e, down) {
      const k = e.key;
      const keys = this.input.keys;
      const map = { a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right', w: 'up', ArrowUp: 'up', s: 'down', ArrowDown: 'down' };
      const dir = map[k] || map[k.toLowerCase && k.toLowerCase()];
      if (dir) { keys[dir] = down; if (this.state === STATE.PLAYING) e.preventDefault(); return; }
      if (!down) return;
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        if (this.state === STATE.BOSS_EXECUTION) this.execSlash(this.exec ? this.exec.boss.x + U.rand(-60, 60) : 0, this.exec ? this.exec.boss.y + U.rand(-60, 60) : 0, true);
        else if (this.ultMode === 'ult200' && this.ult.phase === 2) this.ult200Trigger();
        else this.tryUltimate();
        return;
      }
      if (this.state === STATE.LEVEL_UP && (k === '1' || k === '2' || k === '3')) {
        this.chooseLevelUp(parseInt(k, 10) - 1);
        return;
      }
      if (k === 'Escape' || k === 'p' || k === 'P') {
        if (this.state === STATE.PLAYING || this.state === STATE.BOSS_INTRO) this.setPaused(!this.paused);
        else if (this.state === STATE.DOJO) this.ui.closeDojo();
        return;
      }
      if (k === 'm' || k === 'M') { this.ui.toggleMute(); }
    }

    _onPointerDown(ev) {
      this.audio.init();
      const inp = this.input;
      const p = this._toWorld(ev);
      inp.cx = p.x; inp.cy = p.y;
      if (ev.pointerType === 'mouse' && ev.button === 2) {
        ev.preventDefault();
        if (this.state === STATE.PLAYING && !this.paused) this.tryUltimate();
        return;
      }
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (inp.pointerId != null && inp.pointerId !== ev.pointerId) return;
      inp.pointerType = ev.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (inp.pointerType === 'mouse') inp.hasMouse = true;
      try { this.canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      inp.pointerId = ev.pointerId;
      inp.down = true;
      inp.downT = performance.now();
      inp.downX = inp.lastX = p.x;
      inp.downY = inp.lastY = p.y;
      inp.drag = 0;
      inp.touched.clear();
      inp.ignore = false;
      if (this.paused) { inp.ignore = true; return; }
      if (this.state === STATE.BOSS_EXECUTION) { this.execSlash(p.x, p.y, true); return; }
      if (this.ultMode === 'ult200') { this.ult.swipeStart = { x: p.x, y: p.y }; return; }
      if (this.state !== STATE.PLAYING || this.ultMode === 'ult100') { inp.ignore = true; return; }
      // 息切れ中は抜刀不可（タッチのドラッグは移動として扱う）
      if (this.overheat > 0 && inp.mode === 'idle') { inp.mode = 'move'; return; }
      if (inp.mode === 'idle') inp.mode = 'press';
      else inp.ignore = true;
    }

    _onPointerMove(ev) {
      const inp = this.input;
      const p = this._toWorld(ev);
      inp.cx = p.x; inp.cy = p.y;
      if (ev.pointerType === 'mouse') { inp.hasMouse = true; if (!inp.down) inp.pointerType = 'mouse'; }
      if (inp.pointerId == null || ev.pointerId !== inp.pointerId || !inp.down) return;
      const dx = p.x - inp.lastX, dy = p.y - inp.lastY;
      const d = Math.hypot(dx, dy);
      if (this.state === STATE.BOSS_EXECUTION) {
        this.exec.acc += d;
        while (this.exec.acc >= 36) { this.exec.acc -= 36; this.execSlash(p.x, p.y, false, Math.atan2(dy, dx)); }
        inp.lastX = p.x; inp.lastY = p.y;
        return;
      }
      if (this.ultMode === 'ult200') {
        if (this.ult.phase === 2 && this.ult.swipeStart && Math.hypot(p.x - this.ult.swipeStart.x, p.y - this.ult.swipeStart.y) > 70) this.ult200Trigger();
        inp.lastX = p.x; inp.lastY = p.y;
        return;
      }
      if (inp.ignore || this.state !== STATE.PLAYING) { inp.lastX = p.x; inp.lastY = p.y; return; }
      if (inp.mode === 'press') {
        inp.drag += d;
        // 押下中に触れた敵を記録（累計90px＆2体以上で居合へ）
        for (const e of this.enemies) {
          if (!e.dead && U.segDist2(e.x, e.y, inp.lastX, inp.lastY, p.x, p.y) < (e.r + 14) * (e.r + 14)) inp.touched.add(e.id);
        }
        if (inp.drag >= P.DRAG_IAI_DIST && inp.touched.size >= P.DRAG_IAI_TOUCH_COUNT) {
          this.enterAim();
          this.processAimSegment(inp.downX, inp.downY, p.x, p.y);
        }
      } else if (inp.mode === 'aim') {
        this.processAimSegment(inp.lastX, inp.lastY, p.x, p.y);
      }
      inp.lastX = p.x; inp.lastY = p.y;
    }

    _onPointerUp(ev) {
      const inp = this.input;
      if (inp.pointerId == null || ev.pointerId !== inp.pointerId) return;
      try { this.canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      inp.pointerId = null;
      inp.down = false;
      const p = this._toWorld(ev);
      if (this.state === STATE.BOSS_EXECUTION) return;
      if (this.ultMode === 'ult200') {
        if (this.ult.phase === 2 && this.ult.swipeStart) this.ult200Trigger();
        return;
      }
      if (inp.ignore) { inp.ignore = false; return; }
      if (inp.mode === 'move') { inp.mode = 'idle'; return; }
      if (this.state !== STATE.PLAYING) { if (inp.mode === 'press' || inp.mode === 'aim') this.cancelAim(); return; }
      if (inp.mode === 'press') {
        inp.mode = 'idle';
        // 135ms未満 → 【B：迅雷】
        let vx = p.x - inp.downX, vy = p.y - inp.downY;
        if (Math.hypot(vx, vy) < P.FLICK_MIN_DIST) { vx = p.x - this.player.x; vy = p.y - this.player.y; }
        if (Math.hypot(vx, vy) < 1) { vx = Math.cos(this.player.facing); vy = Math.sin(this.player.facing); }
        this.doPinball(Math.atan2(vy, vx));
      } else if (inp.mode === 'aim') {
        this.releaseAim();
      }
    }

    /* ------------------------------------------------------------------
     * ゲーム開始／ステート遷移
     * ---------------------------------------------------------------- */
    startStage(index) {
      this.audio.init();
      this.stageIndex = index;
      this.stage = CFG.STAGES[index];
      this.clearWorld();
      const blade = this.blade;
      this.player = new E.Player(this.w / 2, this.h / 2, blade);
      this.player.maxHp = blade.hp + this.dojo('maxHp');
      this.player.hp = this.player.maxHp;
      this.focus = this.focusMax();
      this.ultGauge = Math.min(P.ULT_MAX, this.dojo('startingUlt') * 20);
      this.ultMode = null;
      this.ult = null;
      this.exec = null;
      this.run = {
        score: 0, kills: 0, bossKills: 0, maxChain: 0, combo: 0, comboTimer: 0, rankIdx: 0, maxRankIdx: 0,
        totalParries: 0, totalGrazes: 0, maxIaiKills: 0, reachedSS: false, killsSinceKunai: 0, healMark: 0,
        level: 1, xp: 0, xpNext: CFG.xpForLevel(1), pendingLevelUps: 0,
        skills: {}, awakenings: new Set(), stageTime: 0,
        timeLeft: this.stage.duration, bossPhase: false, bossSpawned: false,
        spawnT: {}, gimmickT: 4, addT: {}, endlessBossT: this.stage.endlessBossEvery || 0, endlessBossCount: 0,
        pinballStreak: 0, chainWindow: 0, lastGemT: 0, gemStreak: 0, explosionBudget: 0, lastCalloutVoid: 0, lastSplit: 0,
        formT: 1.2, lastFormSpawn: -9, cutinShown: new Set(), lastGrazeText: 0, lastCA: 0, slotQueue: 0
      };
      this.overheat = 0;
      this.charge = 0;
      this.activeCharge = 0;
      this.slot = null;
      if (blade.startSkill) this.run.skills[blade.startSkill] = 1;
      this.input.mode = 'idle';
      this.input.lockList = [];
      this.input.path = [];
      this.input.flickCd = 0;
      this.iai = null;
      this.pal.inv = false;
      this.paused = false;
      this.camera.zoom = 1; this.camera.base = 1; this.camera.punch = 0; this.camera.shake = 0;
      this.state = STATE.PLAYING;
      this.ui.showHud();
      // 開幕0秒：ファースト・ドパり二重円陣（火薬樽＋提灯2＋笠蜘蛛20）
      E.spawnFormation(this, 'opening');
      this.audio.startBgm(index);
      this.audio.setBgmIntensity(0);
      this.fx.callout(this.w / 2, this.h * 0.38, `${this.stage.act}『${this.stage.name}』`, '#FFFFFF', Math.min(46, this.w / 16), this.realTime);
      if (this.w >= 760) {
        this.fx.text(this.w / 2, this.h * 0.38 + 50, '短く弾く＝迅雷 ／ 長押しでなぞる＝居合 ／ SPACE・右クリック＝奥義', '#C9D2E3', 15, 'info', 3.2);
      } else {
        this.fx.text(this.w / 2, this.h * 0.62, '短く弾く＝迅雷', '#C9D2E3', 15, 'info', 3.2);
        this.fx.text(this.w / 2, this.h * 0.62 + 22, '長押しでなぞる＝居合', '#C9D2E3', 15, 'info', 3.2);
        this.fx.text(this.w / 2, this.h * 0.62 + 44, '奥義ボタン＝奥義', '#C9D2E3', 15, 'info', 3.2);
      }
    }

    clearWorld() {
      this.enemies.length = 0; this.bullets.length = 0; this.kunais.length = 0; this.waves.length = 0;
      this.gems.length = 0; this.gimmicks.length = 0; this.bosses.length = 0; this.blackHoles.length = 0;
      this.timers.length = 0; this.pendingSpawns.length = 0;
      this.formations.length = 0; this.scrolls.length = 0;
      this.fx.clear();
      this.renderer.splits.length = 0;
      this.renderer.flash = 0;
      this.renderer.brush = null;
      this.renderer.brushQueue.length = 0;
      this.renderer.ca = null;
      if (this.renderer.beatRings) this.renderer.beatRings.length = 0;
      if (this.slot) { this.slot = null; this.ui.hideSlot(); }
    }

    goTitle() {
      this.state = STATE.TITLE;
      this.paused = false;
      this.audio.setPaused(false);
      this.audio.stopBgm();
      this.clearWorld();
      this.player = null;
      this.run = null;
      this.pal.inv = false;
      this.ultMode = null;
      this.ui.showTitle();
    }

    setPaused(p) {
      if (this.state !== STATE.PLAYING && this.state !== STATE.BOSS_INTRO) return;
      this.paused = p;
      this.audio.setPaused(p);
      if (p) this.cancelAim();
      this.ui.showPause(p);
    }

    /* ------------------------------------------------------------------
     * メインループ
     * ---------------------------------------------------------------- */
    loop(now) {
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 0.016;
      dt = Math.min(0.05, dt);
      this.dtReal = dt;
      this.frame++;
      this._adaptQuality(dt);
      try {
        this.update(dt);
        this.renderer.draw(this);
      } catch (err) {
        // 1フレームの例外でループを止めない
        console.error(err);
      }
      requestAnimationFrame((t) => this.loop(t));
    }

    /** 60fps維持のための適応品質：重い端末では画面ズレ演出を自動で省略 */
    _adaptQuality(dt) {
      this.frameEma = this.frameEma == null ? dt : this.frameEma * 0.95 + dt * 0.05;
      const R = this.renderer;
      if (!R.lowFx && this.frameEma > 1 / 42) { this.slowFor = (this.slowFor || 0) + dt; if (this.slowFor > 1.5) { R.lowFx = true; this.slowFor = 0; } }
      else if (R.lowFx && this.frameEma < 1 / 57) { this.fastFor = (this.fastFor || 0) + dt; if (this.fastFor > 6) { R.lowFx = false; this.fastFor = 0; } }
      else { this.slowFor = 0; this.fastFor = 0; }
    }

    update(dt) {
      this.realTime += dt;
      this.renderer.updatePost(dt, this);
      this.fx.phase = this.trancePhase;
      this.fx.goldLeaf = !!(this.run && this.run.rankIdx >= 3);
      this.hurtFx = Math.max(0, this.hurtFx - dt * 2.2);
      const st = this.state;
      if (st === STATE.TITLE || st === STATE.DOJO || st === STATE.LEVEL_UP || st === STATE.STAGE_CLEAR || st === STATE.GAME_OVER || this.paused) {
        this.worldScale = st === STATE.TITLE || st === STATE.DOJO ? 1 : 0;
        if (st === STATE.TITLE || st === STATE.DOJO) {
          this.time += dt;
          this.fx.update(dt, dt);
          this._ambient(dt);
        }
        if (st === STATE.STAGE_CLEAR || st === STATE.GAME_OVER) {
          // リザルト背面でエフェクトだけ流す
          this.fx.update(dt * 0.5, dt);
        }
        this._updateCamera(dt);
        return;
      }

      // ヒットストップ（世界完全停止）
      if (this.hitstop > 0) {
        this.hitstop -= dt * 1000;
        this._updateCamera(dt * 0.25);
        return;
      }

      const inp = this.input;
      // 長押し閾値135ms → 【A：居合】
      if (st === STATE.PLAYING && inp.mode === 'press' && performance.now() - inp.downT >= P.HOLD_THRESHOLD_MS) this.enterAim();

      // ワールド時間倍率
      let ws = 1;
      if (inp.mode === 'aim' || inp.mode === 'iaiDash') ws = P.IAI_TIMESCALE;
      if (inp.mode === 'sheathe') ws = 0;
      if (this.run.chainWindow > 0) { this.run.chainWindow -= dt; ws = Math.min(ws, P.CHAIN_TIMESCALE); }
      if (this.ultMode === 'ult200') ws = this.ult.phase === 1 ? 0.35 : 0;
      if (st === STATE.BOSS_EXECUTION) ws = 0;
      this.worldScale = ws;
      const dtw = dt * ws;
      this.time += dtw;
      const slowTarget = (inp.mode === 'aim' || inp.mode === 'iaiDash' || inp.mode === 'sheathe') ? 1 : (this.run.chainWindow > 0 ? 0.35 : 0);
      this.bulletFx += (slowTarget - this.bulletFx) * Math.min(1, dt * 14);

      // 納刀静止（0.12秒）→ 同時大爆砕
      if (inp.mode === 'sheathe') {
        this.sheatheT -= dt;
        if (this.sheatheT <= 0) this.detonate();
      }

      this._updateTimers(dt, dtw);

      // プレイヤー（実時間）
      if (this.player && st !== STATE.BOSS_EXECUTION) {
        const done = this.player.update(dt, this);
        if (done) this._onDashDone(done);
        if (inp.flickCd > 0) inp.flickCd -= dt;
        if (inp.mode === 'iaiDash') this._updateIaiDash(dt);
      } else if (this.player && st === STATE.BOSS_EXECUTION) {
        this.player.update(dt, this);
      }

      // 息切れ（OVERHEAT）：0.70秒経過でゲージ40まで自動回復
      if (this.overheat > 0) {
        this.overheat -= dt;
        if (this.overheat <= 0) {
          this.overheat = 0;
          this.focus = Math.max(this.focus, P.OVERHEAT_RECOVER);
          if (inp.mode === 'move' && inp.pointerType === 'mouse') inp.mode = 'idle';
        }
      }
      // 集中ゲージ
      if (inp.mode === 'aim') {
        this.focus -= P.FOCUS_COST_PER_SEC * this.focusCostMult() * dt;
        if (this.focus <= 0) { this.focus = 0; this.releaseAim(); }
      } else if (inp.mode !== 'iaiDash' && inp.mode !== 'sheathe' && this.overheat <= 0) {
        this.focus = Math.min(this.focusMax(), this.focus + this.focusRegen() * dt);
      }

      // コンボ維持タイマー（居合中・ボス登場演出中・処刑中は停止）
      const comboPaused = inp.mode === 'aim' || inp.mode === 'iaiDash' || inp.mode === 'sheathe' || st === STATE.BOSS_INTRO || st === STATE.BOSS_EXECUTION || this.ultMode === 'ult200';
      if (!comboPaused && this.run.combo > 0) {
        this.run.comboTimer -= dt;
        if (this.run.comboTimer <= 0) this._resetCombo();
      }

      if (st === STATE.PLAYING) {
        this._updateStage(dtw);
        this._updateSpawner(dtw);
      } else if (st === STATE.BOSS_INTRO) {
        this._updateBossIntro(dt);
      } else if (st === STATE.BOSS_EXECUTION) {
        this._updateExecution(dt);
      }

      // 奥義
      if (this.ultMode === 'ult100') this._updateUlt100(dt);
      else if (this.ultMode === 'ult200') this._updateUlt200(dt);

      // エンティティ
      const dtp = dt * Math.max(ws, 0.4);  // プレイヤーの飛び道具
      if (!(this.ultMode === 'ult200')) {
        for (const e of this.enemies) e.update(dtw, this);
        for (const b of this.bosses) b.update(dtw, this);
        for (const b of this.bullets) b.update(dtw, this);
      } else {
        for (const b of this.bosses) b.baseUpdate(0, this);
      }
      for (const f of this.formations) f.update(st === STATE.BOSS_EXECUTION ? 0 : dtw, this);
      for (const g of this.gimmicks) g.update(dtw);
      for (const sc of this.scrolls) sc.update(dt, this);
      for (const k of this.kunais) k.update(st === STATE.BOSS_EXECUTION ? 0 : dtp, this);
      for (const w of this.waves) w.update(st === STATE.BOSS_EXECUTION ? 0 : dtp, this);
      for (const g of this.gems) g.update(dt, this);
      for (const h of this.blackHoles) h.update(dtw);

      if (st === STATE.PLAYING) {
        this._updateRifts(dtw);
        this._updateAwakenings(dt, dtw);
        this._collisions(dtw);
        this._updateCorpses();
      } else {
        for (const r of this.fx.rifts) r.update(dtw);
      }

      // 生成キュー反映と削除
      if (this.pendingSpawns.length) {
        for (const e of this.pendingSpawns) if (this.enemies.length < P.ENEMY_MAX + 40) this.enemies.push(e);
        this.pendingSpawns.length = 0;
      }
      const alive = (o) => !o.dead;
      U.compact(this.enemies, alive);
      U.compact(this.bullets, alive);
      U.compact(this.kunais, alive);
      U.compact(this.waves, alive);
      U.compact(this.gems, alive);
      U.compact(this.gimmicks, alive);
      U.compact(this.blackHoles, alive);
      U.compact(this.scrolls, alive);
      U.compact(this.formations, (f) => !f.done);
      U.compact(this.fx.rifts, alive);
      U.compact(this.bosses, alive);

      this.fx.update(dt * Math.max(ws, 0.3), dt);
      this.run.explosionBudget = Math.max(0, this.run.explosionBudget - dt * 90);
      this._updateCamera(dt);

      // レベルアップ受付
      if (this.run.pendingLevelUps > 0 && st === STATE.PLAYING && inp.mode === 'idle' && !this.ultMode) this.openLevelUp();
      this.ui.updateHud();
    }

    _ambient(dt) {
      if (Math.random() < dt * 14) {
        const x = Math.random() * this.w, y = this.h + 10;
        this.fx.particle(x, y, U.rand(-10, 10), -U.rand(30, 90), U.rand(2, 5), U.rand(1, 2.2), Math.random() < 0.5 ? C.cyan : C.gold, 1, 0.2);
      }
    }

    later(delay, fn, real) { this.timers.push({ t: delay, fn, real: !!real }); }
    _updateTimers(dt, dtw) {
      if (!this.timers.length) return;
      const list = this.timers;
      this.timers = [];
      for (const tm of list) {
        tm.t -= tm.real ? dt : dtw;
        if (tm.t <= 0) { try { tm.fn(); } catch (e) { console.error(e); } }
        else this.timers.push(tm);
      }
    }

    /* ------------------------------------------------------------------
     * カメラ（ズーム・パンチズーム・シェイク）
     * ---------------------------------------------------------------- */
    _updateCamera(dt) {
      const cam = this.camera;
      const m = this.input.mode;
      const target = (m === 'aim' || m === 'iaiDash' || m === 'sheathe') && this.state === STATE.PLAYING ? P.ZOOM_HOLD : 1;
      cam.base += (target - cam.base) * Math.min(1, dt * 8);
      if (cam.punchT > 0) cam.punchT = Math.max(0, cam.punchT - dt);
      const punch = cam.punch * (cam.punchT / P.ZOOM_RETURN);
      cam.zoom = cam.base + punch;
      cam.shake *= Math.pow(0.05, dt);
      if (cam.shake < 0.05) cam.shake = 0;
      cam.sx = (Math.random() * 2 - 1) * cam.shake;
      cam.sy = (Math.random() * 2 - 1) * cam.shake;
    }
    shake(a) { this.camera.shake = Math.min(P.SHAKE_MAX, this.camera.shake + a); }
    punchZoom(z) {
      this.camera.punch = Math.max(z - 1, this.camera.punch * (this.camera.punchT / P.ZOOM_RETURN));
      this.camera.punchT = P.ZOOM_RETURN;
    }
    doHitstop(ms) { this.hitstop = Math.max(this.hitstop, ms); }

    /* ------------------------------------------------------------------
     * 対象列挙ヘルパー
     * ---------------------------------------------------------------- */
    /** ボスの部位（body parts）と点の最小距離^2 */
    _bossDist2(boss, x, y) {
      let best = Infinity;
      for (const p of boss.parts()) {
        const d = U.dist2(x, y, p.x, p.y) - p.r * p.r;
        if (d < best) best = d;
      }
      return best;
    }
    _bossSegHit(boss, x1, y1, x2, y2, pad) {
      for (const p of boss.parts()) {
        const rr = p.r + pad;
        if (U.segDist2(p.x, p.y, x1, y1, x2, y2) <= rr * rr) return p;
      }
      return null;
    }

    nearestTarget(x, y, maxD) {
      let best = null, bd = maxD * maxD;
      for (const e of this.enemies) {
        if (e.dead || e.pending) continue;
        const d = U.dist2(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      for (const b of this.bosses) {
        if (!b.lockable) continue;
        for (const c of b.cores) {
          if (c.broken) continue;
          const d = U.dist2(x, y, c.x, c.y);
          if (d < bd) { bd = d; best = c; }
        }
        const d = U.dist2(x, y, b.x, b.y);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    }

    /* ------------------------------------------------------------------
     * アクションB：迅雷（高速ピンボール連撃）
     * ---------------------------------------------------------------- */
    doPinball(angle, forcedTarget, isAuto) {
      const pl = this.player;
      const inp = this.input;
      if (!pl) return;
      if (pl.dash) { inp.queuedFlick = { angle, forcedTarget }; return; }
      if (inp.flickCd > 0 && this.run.chainWindow <= 0 && !isAuto) return;
      // 集中ゲージ消費（息切れ中・ゲージ不足は発動不可）。縮地の自動連鎖は無消費
      if (!isAuto) {
        if (this.overheat > 0) { this.audio.playUiDeny(); return; }
        const cost = this.flickCost();
        if (this.focus < cost) {
          this.audio.playUiDeny();
          if (this.realTime - (this.run.lastNoFocus || 0) > 0.5) {
            this.run.lastNoFocus = this.realTime;
            this.fx.text(pl.x, pl.y - 40, '集中不足', C.crimson, 14, 'info', 0.6);
          }
          return;
        }
        this.focus -= cost;
      }
      const killsBefore = this.run.kills;
      const chained = this.run.chainWindow > 0 || isAuto;
      this.run.pinballStreak = chained ? this.run.pinballStreak + 1 : 0;
      const streak = this.run.pinballStreak;
      const bonus = Math.min(P.CHAIN_STEP_MAX, P.CHAIN_STEP_BONUS * streak);
      const p2 = this.phase >= 2 ? P.PHASE2_PINBALL_MULT : 1;
      const width = P.PINBALL_CAPSULE_WIDTH * (1 + bonus) * p2 * this.blade.widthMult;
      const dist = P.PINBALL_DASH_DIST * this.dashMult();
      const range = P.PINBALL_HOMING_RANGE * this.dashMult();
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
      // 磁気ホーミング補正（±32度・340px以内の最も近い敵）
      let target = forcedTarget || null;
      if (!target) {
        let bd = range * range;
        const maxAng = P.PINBALL_HOMING_ANGLE * Math.PI / 180;
        const consider = (o, x, y) => {
          const d2 = U.dist2(pl.x, pl.y, x, y);
          if (d2 > bd || d2 < 16) return;
          const a = Math.atan2(y - pl.y, x - pl.x);
          if (Math.abs(U.angleDiff(angle, a)) > maxAng) return;
          bd = d2; target = { x, y, ref: o };
        };
        for (const e of this.enemies) if (!e.dead && !e.pending && e.age > 0.1) consider(e, e.x, e.y);
        for (const g of this.gimmicks) if (g.lockable) consider(g, g.x, g.y);
        for (const b of this.bosses) {
          if (!b.lockable) continue;
          for (const c of b.cores) if (!c.broken) consider(c, c.x, c.y);
          for (const p of b.parts()) consider(b, p.x, p.y);
        }
      } else {
        target = { x: forcedTarget.x, y: forcedTarget.y, ref: forcedTarget };
      }
      let ex, ey;
      if (target) {
        const a = Math.atan2(target.y - pl.y, target.x - pl.x);
        const d = Math.min(Math.hypot(target.x - pl.x, target.y - pl.y) + 34, range + 34);
        ex = pl.x + Math.cos(a) * d; ey = pl.y + Math.sin(a) * d;
        angle = a;
      } else {
        ex = pl.x + dir.x * dist; ey = pl.y + dir.y * dist;
      }
      ex = U.clamp(ex, 16, this.w - 16); ey = U.clamp(ey, 16, this.h - 16);
      const x0 = pl.x, y0 = pl.y;
      const dur = P.PINBALL_DASH_TIME / ((1 + bonus) * p2);
      pl.startDash(ex, ey, dur, 'pinball');
      pl.invuln = Math.max(pl.invuln, P.PINBALL_INVULN);
      inp.flickCd = P.FLICK_COOLDOWN;
      const bc = this.blade.color;
      this.fx.trail(x0, y0, ex, ey, { width: width * 0.55, color: bc, core: this.blade.core, slash: true });
      if (this.phase === 3) {
        // 紅蓮残像の追撃軌跡
        this.fx.trail(x0 - 14, y0 + 10, ex - 10, ey + 12, { width: width * 0.35, color: C.crimson, slash: true });
        this.fx.trail(x0 + 12, y0 - 12, ex + 12, ey - 10, { width: width * 0.35, color: C.crimson, slash: true });
      }
      const hits = this._resolveSlashLine(x0, y0, ex, ey, width, 'pinball', P.PINBALL_DAMAGE);
      this.audio.playPinballSlash(streak);
      if (hits > 0) {
        // 命中リファンド +10（撃破ごとに +4 追加）
        const kills = this.run.kills - killsBefore;
        if (!isAuto) this.focus = Math.min(this.focusMax(), this.focus + P.PINBALL_REFUND_HIT + kills * P.PINBALL_REFUND_KILL);
        // 迅雷帯電スタック（紅蓮は2倍速）
        if (this.charge < P.CHARGE_MAX) {
          const before = this.charge;
          this.charge = Math.min(P.CHARGE_MAX, this.charge + this.blade.chargeMult);
          this.audio.playCharge(this.charge);
          this.fx.sparks(pl.x, pl.y, 6 + this.charge * 3, C.gold, 300, 0.3);
          if (this.charge >= P.CHARGE_MAX && before < P.CHARGE_MAX) this.fx.text(pl.x, pl.y - 46, '迅雷帯電 MAX!!', C.gold, 18, 'info', 0.9);
        }
        this.run.chainWindow = P.CHAIN_WINDOW;
        this.doHitstop(P.HITSTOP_PINBALL);
        this.shake(4 + Math.min(8, hits));
        // 縮地：自動ホーミング連鎖
        if (this.hasAwakening('shukuchi') && !isAuto) inp.autoChain = 2;
      } else {
        this.run.pinballStreak = 0;
        // 空振り：還元ゼロ。ゲージ0（または10未満）で息切れ
        if (!isAuto && this.focus < P.OVERHEAT_MISS_THRESHOLD) this.startOverheat();
      }
      this._afterAttack(x0, y0, ex, ey, 'pinball', hits);
    }

    /** 息切れ（OVERHEAT）：0.70秒間 抜刀不可・移動のみ */
    startOverheat() {
      if (this.overheat > 0) return;
      this.overheat = P.OVERHEAT_TIME;
      this.input.queuedFlick = null;
      this.audio.playOverheat();
      const pl = this.player;
      this.fx.text(pl.x, pl.y - 52, '息切れ！', C.crimson, 20, 'info', 0.8);
      this.fx.sparks(pl.x, pl.y, 10, '#8A93A8', 160, 0.4);
    }

    /** 死体ボウリング：吹っ飛んだ断面が生存敵に激突 → 1.5×攻撃力の衝突爆発＋ノックバック → さらに連鎖 */
    _updateCorpses() {
      const corpses = this.fx.corpses;
      if (!corpses.length) return;
      const atk = this.atk();
      for (const c of corpses) {
        if (c.dead) continue;
        let hit = null;
        for (const e of this.enemies) {
          if (e.dead || e.pending || e === c.ref) continue;
          const rr = e.r + c.r;
          if (U.segDist2(e.x, e.y, c.tx, c.ty, c.x, c.y) <= rr * rr) { hit = e; break; }
        }
        if (!hit) {
          for (const b of this.bosses) {
            if (b.lockable && this._bossSegHit(b, c.tx, c.ty, c.x, c.y, c.r)) { hit = b; break; }
          }
        }
        if (!hit) continue;
        c.dead = true;
        const a = Math.atan2(c.vy, c.vx);
        if (hit.isEnemy) { hit.knockX += Math.cos(a) * 380; hit.knockY += Math.sin(a) * 380; }
        if (this.run.explosionBudget < 140) {
          this.run.explosionBudget += 0.5;
          this.blast(c.x, c.y, 42 * this.blastMult(), P.CORPSE_DAMAGE * atk, { src: 'corpse', color: C.crimson, small: true, gen: c.gen + 1, angle: a });
        } else {
          this.dealDamage(hit, P.CORPSE_DAMAGE * atk, { src: 'corpse', angle: a, combo: 1, quiet: true, gen: c.gen + 1 });
        }
        this.fx.sparksDir(c.x, c.y, 6, C.crimson, a, 0.7, 420, 0.3);
        if (this.realTime - (this.run.lastBowl || 0) > 0.9 && c.gen >= 1) {
          this.run.lastBowl = this.realTime;
          this.fx.callout(U.clamp(c.x, 120, this.w - 120), U.clamp(c.y - 30, 60, this.h - 60), '死体ボウリング!!', C.crimson, 28, this.realTime);
        }
      }
    }

    /** 魂ジェムの竜巻一斉バキューム */
    tornadoVacuum(kills) {
      const pl = this.player;
      const dir = Math.random() < 0.5 ? 1 : -1;
      let n = 0;
      for (const g of this.gems) { if (!g.tornado) { g.startTornado(pl.x, pl.y, dir); n++; } }
      if (!n) return;
      this.audio.playTornado(n);
      this.fx.ring(pl.x, pl.y, 260, 20, 0.6, C.jade, 4);
      this.fx.text(pl.x, pl.y + 40, `魂竜巻バキューム ×${n}`, C.jade, 18, 'info', 1.0);
    }

    /** 鬼神トランス：強烈なRGB色収差（±9px）＋画面端から中心への放射状ショックウェーブ */
    trancePunch(force) {
      if (!force && this.realTime - this.run.lastCA < 0.15) return;
      this.run.lastCA = this.realTime;
      this.renderer.chromatic(P.CA_PHASE3_PX);
      const R = Math.hypot(this.w, this.h) / 2;
      this.fx.ring(this.w / 2, this.h / 2, R, 40, 0.38, C.gold, 7);
      this.fx.ring(this.w / 2, this.h / 2, R * 0.9, 30, 0.45, C.crimson, 4);
    }

    /** BGMのバスドラムと同期（audio.js から呼ばれる） */
    onBeatPulse() {
      this.renderer.beat = 1;
      if (this.renderer.addBeatRing) this.renderer.addBeatRing(this.trancePhase);
    }

    /** 巨大毛筆カットインの表示開始時（金箔飛沫＋太鼓／鬼神は衝撃波） */
    onBrushStart(b) {
      const cx = this.w / 2, cy = this.h / 2;
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * TAU, sp = U.rand(120, 520);
        this.fx.particle(cx + U.rand(-this.w * 0.3, this.w * 0.3), cy + U.rand(-60, 60), Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.5, 1.2), U.rand(2, 4.5), C.gold, 1, 2.5);
      }
      this.audio.playBrushCutin(b.phase);
      if (b.phase >= 3) {
        this.fx.ring(cx, cy, 30, Math.max(this.w, this.h) * 0.7, 0.7, C.crimson, 9);
        this.fx.ring(cx, cy, 20, Math.max(this.w, this.h) * 0.55, 0.6, C.gold, 6);
        this.renderer.doFlash(0.3, C.gold);
        this.shake(14);
        if (this.run) this.trancePunch(true);
      }
    }

    /** コンボ到達で巨大毛筆カットインを予約 */
    _checkCutins(prev, now, rankUpTo) {
      const run = this.run;
      for (const c of CFG.BRUSH_CUTINS) {
        const key = c.hit ? 'h' + c.hit : 'r' + c.rank;
        if (run.cutinShown.has(key)) continue;
        const ok = c.hit ? (prev < c.hit && now >= c.hit) : (rankUpTo === c.rank);
        if (ok) {
          run.cutinShown.add(key);
          this.renderer.queueBrush(c.text, c.sub, c.phase, this.fx, this.realTime);
        }
      }
    }

    /* ------------------------------------------------------------------
     * 秘伝の巻物スロット（ゲームを止めずに抽選）
     * ---------------------------------------------------------------- */
    collectScroll(sc) {
      this.fx.ring(sc.x, sc.y, 10, 90, 0.4, C.gold, 4);
      this.fx.sparks(sc.x, sc.y, 18, C.gold, 380, 0.5);
      if (this.slot) { this.run.slotQueue++; return; }
      this._startSlot();
    }

    _startSlot() {
      const r = Math.random();
      let acc = 0, prize = CFG.SCROLL_PRIZES[0];
      for (const p of CFG.SCROLL_PRIZES) { acc += p.p; if (r < acc) { prize = p; break; } }
      this.slot = { prize, t: 0 };
      this.ui.showSlot(prize);
      this.audio.playSlotSpin(P.SCROLL_SLOT_TIME);
      this.later(P.SCROLL_SLOT_TIME, () => this._resolveSlot(), true);
    }

    _resolveSlot() {
      if (!this.slot || !this.run) return;
      const prize = this.slot.prize;
      const tier = CFG.SCROLL_PRIZES.indexOf(prize);
      const run = this.run;
      const pl = this.player;
      const gained = [];
      // 極意進化（鬼神大当たりのみ・条件達成済みのもの）を優先
      if (prize.awaken) {
        for (const aw of CFG.AWAKENINGS) {
          if (gained.length >= prize.skills) break;
          if (!run.awakenings.has(aw.id) && aw.check(this)) { run.awakenings.add(aw.id); gained.push(aw.name.replace('【極意】', '極意・')); }
        }
      }
      const pool = U.shuffle(CFG.SKILLS.filter((s) => (run.skills[s.id] || 0) < 5));
      for (const sk of pool) {
        if (gained.length >= prize.skills) break;
        run.skills[sk.id] = (run.skills[sk.id] || 0) + 1;
        gained.push(`${sk.name} Lv${run.skills[sk.id]}`);
      }
      if (!gained.length) { run.score += Math.round(10000 * this.rank.mult); gained.push(`スコア +${Math.round(10000 * this.rank.mult)}`); }
      if (prize.heal === 'full') pl.hp = pl.maxHp; else pl.hp = Math.min(pl.maxHp, pl.hp + prize.heal);
      if (prize.ult) this.addUlt(prize.ult);
      if (prize.shockwave) this.blast(pl.x, pl.y, 180, 2 * this.atk(), { src: 'blast', color: C.gold, big: true, noDecal: true });
      if (prize.lightning) {
        let n = 0;
        for (const e of this.enemies.slice()) {
          if (e.dead || n++ > 40) continue;
          this.fx.beam(e.x, e.y, 26, 0.55, C.gold, true);
          this.dealDamage(e, 3 * this.atk(), { src: 'lightning', combo: 1, quiet: true });
        }
        for (const b of this.bosses) if (b.lockable) { this.fx.beam(b.x, b.y, 50, 0.6, C.gold, true); this.dealDamage(b, 6 * this.atk(), { src: 'lightning', combo: 1 }); }
        this.renderer.doFlash(0.6, C.gold);
        this.shake(18);
      }
      this.audio.playSlotWin(tier);
      this.ui.showSlotResult(prize, gained);
      this.ui.refreshSkills();
      this.later(1.6, () => {
        this.slot = null;
        this.ui.hideSlot();
        if (this.run && this.run.slotQueue > 0) { this.run.slotQueue--; this._startSlot(); }
      }, true);
    }

    /** 見切り（GRAZE!）：紙一重回避で集中+25・奥義+4% */
    graze(o) {
      const pl = this.player;
      o.grazeCd = P.GRAZE_CD;
      this.run.totalGrazes++;
      this.focus = Math.min(this.focusMax(), this.focus + P.GRAZE_FOCUS);
      if (this.overheat > 0) {
        this.overheat = 0;
        this.focus = Math.max(this.focus, P.OVERHEAT_RECOVER);
        if (this.input.mode === 'move' && !this.input.down) this.input.mode = 'idle';
      }
      this.addUlt(P.GRAZE_ULT);
      this.run.score += P.GRAZE_SCORE;
      this.audio.playGraze();
      const a = Math.atan2(o.y - pl.y, o.x - pl.x);
      this.fx.ring(pl.x, pl.y, P.PLAYER_RING_RADIUS, P.PLAYER_RING_RADIUS + 26, 0.25, C.cyan, 3);
      this.fx.sparksDir((pl.x + o.x) / 2, (pl.y + o.y) / 2, 8, '#3AA8FF', a + Math.PI, 0.8, 380, 0.3);
      this.fx.sparks(pl.x, pl.y, 4, C.cyan, 220, 0.25);
      if (this.realTime - this.run.lastGrazeText > 0.18) {
        this.run.lastGrazeText = this.realTime;
        this.fx.text(pl.x + U.rand(-10, 10), pl.y - 30, `GRAZE! +${P.GRAZE_SCORE}`, C.cyan, 16, 'info', 0.7);
      }
    }

    /** 斬撃ライン判定（迅雷用カプセル） */
    _resolveSlashLine(x0, y0, x1, y1, width, src, dmgMul) {
      const half = width / 2;
      const atk = this.atk();
      const hitsPer = this.blade.hits * (this.phase === 3 ? P.PHASE3_CLONE_HITS : 1);
      const perHit = dmgMul * atk;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      let hitCount = 0;
      const hitList = [];
      for (const e of this.enemies) {
        if (e.dead || e.pending) continue;
        const rr = e.r + half;
        if (U.segDist2(e.x, e.y, x0, y0, x1, y1) <= rr * rr) hitList.push(e);
      }
      for (const e of hitList) {
        hitCount++;
        const hx = e.x, hy = e.y;
        this.dealDamage(e, perHit * hitsPer, { src, angle: ang, combo: hitsPer });
        this.fx.sparksDir(hx, hy, 8, this.blade.color, ang, 0.6, 520, 0.3);
        this.fx.sparks(hx, hy, 4, '#FFFFFF', 300, 0.25);
      }
      // ボス
      for (const b of this.bosses) {
        if (!b.lockable) continue;
        let any = false;
        for (const c of b.cores) {
          if (c.broken) continue;
          const rr = c.r + half;
          if (U.segDist2(c.x, c.y, x0, y0, x1, y1) <= rr * rr) {
            this.dealDamage(c, perHit * hitsPer, { src, angle: ang, combo: hitsPer });
            any = true;
          }
        }
        const part = this._bossSegHit(b, x0, y0, x1, y1, half);
        if (part) {
          this.dealDamage(b, perHit * hitsPer, { src, angle: ang, combo: hitsPer, at: part });
          this.fx.sparksDir(part.x, part.y, 10, C.gold, ang, 0.7, 560, 0.35);
          any = true;
        }
        if (any) { hitCount++; hitList.push(b); }
      }
      for (const g of this.gimmicks) {
        if (!g.lockable) continue;
        const rr = g.r + half;
        if (U.segDist2(g.x, g.y, x0, y0, x1, y1) <= rr * rr) { this.triggerGimmick(g); hitCount++; }
      }
      for (const b of this.bullets) {
        if (b.dead) continue;
        const rr = b.r + half;
        if (U.segDist2(b.x, b.y, x0, y0, x1, y1) <= rr * rr) { this.parryBullet(b); hitCount++; }
      }
      // Phase2：着弾点に半径75pxの衝撃波リング
      if (this.phase >= 2 && src === 'pinball') {
        let rings = 0;
        const exclude = new Set(hitList);
        for (const e of hitList) {
          if (rings++ >= 6) break;
          this.blast(e.x, e.y, P.PHASE2_SHOCKWAVE_RADIUS * this.blastMult(), atk, { src: 'shockwave', color: this.blade.color, exclude, noDecal: true });
        }
      }
      // 雷鳴抜刀・影打
      this._onHitSkills(hitList, perHit * hitsPer, ang);
      this.run.lastHitList = hitList;
      return hitCount;
    }

    _onHitSkills(list, hitDmg, ang) {
      const lv = this.skillLv('lightning');
      const sh = this.skillLv('shadow');
      let n = 0;
      for (const t of list) {
        if (n++ >= 8) break;
        if (lv) {
          const T = CFG.SKILL_TABLE.lightning;
          this.chainLightning(t.x, t.y, T.chains[lv - 1], T.dmg[lv - 1] * this.atk(), t);
        }
        if (sh) {
          const T = CFG.SKILL_TABLE.shadow;
          const clones = this.hasAwakening('senju') ? 5 : T.clones[sh - 1];
          const pct = T.dmg[sh - 1];
          for (let i = 0; i < clones; i++) {
            this.later(0.09 + i * 0.07, () => {
              if (t.dead || (t.isBoss && !t.lockable)) return;
              const a = ang + U.rand(-1.2, 1.2) + (i % 2 ? Math.PI : 0);
              const L = (t.r || 16) + 26;
              this.fx.trail(t.x - Math.cos(a) * L, t.y - Math.sin(a) * L, t.x + Math.cos(a) * L, t.y + Math.sin(a) * L, { width: 7, color: '#6C7BA0', core: '#C9D2E3', life: 0.2 });
              this.dealDamage(t, hitDmg * pct, { src: 'shadow', angle: a, combo: 1 });
            });
          }
        }
      }
    }

    chainLightning(x, y, n, dmg, exclude) {
      const hit = new Set([exclude]);
      let cx = x, cy = y;
      for (let i = 0; i < n; i++) {
        let best = null, bd = 260 * 260;
        for (const e of this.enemies) {
          if (e.dead || e.pending || hit.has(e)) continue;
          const d = U.dist2(cx, cy, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        hit.add(best);
        this.fx.bolt(cx, cy, best.x, best.y, C.shiden, 0.22, 2.2);
        cx = best.x; cy = best.y;
        this.dealDamage(best, dmg, { src: 'lightning', combo: 1 });
      }
      if (hit.size > 1) this.audio.playLightning();
    }

    _onDashDone(d) {
      const inp = this.input;
      // ピンボール終点
      if (inp.queuedFlick) {
        const q = inp.queuedFlick;
        inp.queuedFlick = null;
        this.doPinball(q.angle, q.forcedTarget);
        return;
      }
      if (inp.autoChain > 0) {
        inp.autoChain--;
        const t = this.nearestTarget(this.player.x, this.player.y, P.PINBALL_HOMING_RANGE * this.dashMult());
        if (t) this.doPinball(Math.atan2(t.y - this.player.y, t.x - this.player.x), t, true);
        else inp.autoChain = 0;
      }
    }

    /** 全攻撃共通の後処理（真空波・次元斬スキル・縮地） */
    _afterAttack(x0, y0, x1, y1, src, hits) {
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const len = Math.hypot(x1 - x0, y1 - y0);
      // 真空三日月波
      const cl = this.skillLv('crescent');
      if (cl) {
        const T = CFG.SKILL_TABLE.crescent;
        const n = T.count[cl - 1];
        const aw = this.hasAwakening('amenomurakumo');
        for (let i = 0; i < n; i++) {
          const a = ang + (i - (n - 1) / 2) * 0.2;
          this.waves.push(new E.CrescentWave(x1, y1, a, T.size[cl - 1], aw));
        }
      }
      // 虚空の裂け目
      const vl = this.skillLv('voidRift');
      if (vl && len > 20) {
        const T = CFG.SKILL_TABLE.voidRift;
        if (Math.random() < T.chance[vl - 1]) this.spawnRift(x0, y0, x1, y1, T.dur[vl - 1]);
      }
      // Phase3 ピンボール：3連撃ごとにミニ次元斬／大太刀：3連ピンボールで次元斬
      if (src === 'pinball' && len > 20) {
        if (this.blade.alwaysVoid && (this.phase === 3 || this.run.pinballStreak % 3 === 2)) {
          this.spawnRift(x0, y0, x1, y1, P.VOID_DUR);
        } else if (this.phase === 3) {
          this.spawnRift(x0, y0, x1, y1, 1.2, { mini: true, closeMult: 0.6 });
        }
      }
      // 縮地：蒼炎の残像ライン
      if (this.hasAwakening('shukuchi') && len > 10) this.fx.flame(x0, y0, x1, y1, 3.0);
    }

    /* ------------------------------------------------------------------
     * アクションA：居合（時間停止・一筆書きロックオン＆納刀同時爆砕）
     * ---------------------------------------------------------------- */
    enterAim() {
      const inp = this.input;
      if (inp.mode !== 'press') return;
      if (this.overheat > 0) { inp.mode = 'move'; return; }
      inp.mode = 'aim';
      // 迅雷帯電スタックを全消費して『雷光居合』へ
      this.activeCharge = this.charge;
      this.charge = 0;
      if (this.activeCharge > 0) {
        this.audio.playCharge(this.activeCharge);
        this.fx.text(this.player.x, this.player.y - 46, this.activeCharge >= P.CHARGE_MAX ? '雷光居合・極!!' : `雷光居合 ×${this.activeCharge}`, C.gold, 18, 'info', 0.9);
        this.fx.ring(inp.downX, inp.downY, 10, this.lockRadius(), 0.3, C.gold, 3);
      }
      inp.strokeId++;
      inp.lockList = [];
      inp.path = [{ x: inp.downX, y: inp.downY }];
      inp.startX = this.player.x; inp.startY = this.player.y;
      // 森羅万象：半径300px内を自動一斉ロック
      if (this.hasAwakening('shinra')) {
        const pl = this.player;
        const list = this.enemies.filter((e) => e.lockable && !e.pending && U.dist2(pl.x, pl.y, e.x, e.y) < 300 * 300)
          .sort((a, b) => U.dist2(pl.x, pl.y, a.x, a.y) - U.dist2(pl.x, pl.y, b.x, b.y));
        for (const e of list) this._tryLock(e, true);
        this.fx.ring(pl.x, pl.y, 20, 300, 0.5, C.cyan, 3);
      }
    }

    cancelAim() {
      const inp = this.input;
      if (inp.mode === 'press' || inp.mode === 'aim' || inp.mode === 'move') {
        if (inp.mode === 'aim' && this.activeCharge) { this.charge = this.activeCharge; this.activeCharge = 0; }
        inp.mode = 'idle';
        inp.lockList = [];
        inp.path = [];
      }
    }

    processAimSegment(x0, y0, x1, y1) {
      const inp = this.input;
      const d = Math.hypot(x1 - x0, y1 - y0);
      this.focus -= d * P.FOCUS_COST_PER_PX * this.focusCostMult();
      const last = inp.path[inp.path.length - 1];
      if (!last || Math.hypot(x1 - last.x, y1 - last.y) > 6) {
        inp.path.push({ x: x1, y: y1 });
        if (inp.path.length > 600) inp.path.splice(0, 1);
      }
      const R = this.lockRadius();
      const sid = inp.strokeId;
      const test = (t, x, y, r) => {
        const rr = r + R;
        const d2 = U.segDist2(x, y, x0, y0, x1, y1);
        if (t.lockStroke !== sid) { t.lockStroke = sid; t.lockCount = 0; t.inside = false; }
        if (d2 <= rr * rr) {
          if (!t.inside) { t.inside = true; this._tryLock(t); }
        } else if (t.inside && d2 > (rr + 12) * (rr + 12)) {
          t.inside = false;
        }
      };
      for (const e of this.enemies) if (e.lockable && !e.pending) test(e, e.x, e.y, e.r);
      for (const b of this.bullets) if (!b.dead) test(b, b.x, b.y, b.r);
      for (const g of this.gimmicks) if (g.lockable) test(g, g.x, g.y, g.r);
      for (const b of this.bosses) {
        if (!b.lockable) continue;
        for (const c of b.cores) if (c.lockable) test(c, c.x, c.y, c.r);
        // ボス本体：最も近い部位で判定
        let best = null, bd = Infinity;
        for (const p of b.parts()) {
          const dd = U.segDist2(p.x, p.y, x0, y0, x1, y1) - p.r * p.r;
          if (dd < bd) { bd = dd; best = p; }
        }
        if (best) test(b, best.x, best.y, best.r);
      }
      if (this.focus <= 0) { this.focus = 0; this.releaseAim(); }
    }

    _maxLocks(t) {
      if (t.isBoss) return P.BOSS_MAX_LOCKS_PER_STROKE;
      if (t.isBullet || t.isGimmick || t.isCore) return 1;
      const dmg = P.IAI_DAMAGE * this.atk() * this.blade.hits * (this.phase >= 2 ? P.PHASE2_BLAST_MULT : 1);
      return Math.max(1, Math.ceil(t.hp / dmg - 1e-6));
    }

    _tryLock(t, silentRing) {
      const inp = this.input;
      if (t.lockStroke !== inp.strokeId) { t.lockStroke = inp.strokeId; t.lockCount = 0; t.inside = true; }
      if (t.lockCount >= this._maxLocks(t)) return false;
      t.lockCount++;
      inp.lockList.push(t);
      this.focus = Math.min(this.focusMax(), this.focus + this.lockFocusGain());
      this.audio.playLockOn(inp.lockList.length - 1, !!t.isBomb || t.kind === 'barrel');
      if (!silentRing) this.fx.ring(t.x, t.y, (t.r || 10) + 22, (t.r || 10) + 4, 0.18, C.cyan, 2);
      this.fx.sparks(t.x, t.y, 4, C.cyan, 200, 0.2);
      // 提灯お化け：周囲130pxの敵を自動でチェインに巻き込む／火薬樽：120px
      const auto = t.isBomb ? 130 : (t.kind === 'barrel' ? 120 : 0);
      if (auto && t.lockCount === 1) {
        for (const e of this.enemies) {
          if (!e.lockable || e.pending || e === t) continue;
          if (e.lockStroke === inp.strokeId && e.lockCount > 0) continue;
          if (U.dist2(t.x, t.y, e.x, e.y) <= (auto + e.r) * (auto + e.r)) {
            this.fx.bolt(t.x, t.y, e.x, e.y, C.gold, 0.18, 1.5);
            this._tryLock(e, true);
          }
        }
      }
      return true;
    }

    releaseAim() {
      const inp = this.input;
      if (inp.mode !== 'aim') return;
      const list = inp.lockList.filter((t) => !t.dead);
      if (!list.length) {
        // 空振りの居合は帯電を返却
        if (this.activeCharge) { this.charge = this.activeCharge; this.activeCharge = 0; }
        inp.mode = 'idle'; inp.path = []; return;
      }
      inp.mode = 'iaiDash';
      for (const t of list) { if (!t.isBoss) t.pending = true; }
      const n = list.length;
      // 合計0.22秒上限キャップ：stepDuration = min(0.024, 0.22 / max(1, n))
      const per = Math.min(P.IAI_STEP_MAX, P.IAI_TOTAL_MAX / Math.max(1, n));
      this.iai = {
        targets: list, idx: 0, per,
        startX: this.player.x, startY: this.player.y,
        path: inp.path.slice(), lastAng: 0
      };
      this.player.invuln = Math.max(this.player.invuln, 0.5);
      this._iaiNext();
    }

    _iaiTargetPos(t) {
      return { x: t.x, y: t.y };
    }

    /** 斬り抜け開始：各ターゲットの通過時刻を1本のタイムラインに並べる（1フレームで複数体を通過可能） */
    _iaiNext() {
      const iai = this.iai;
      const pl = this.player;
      pl.dash = null;
      iai.t = 0;
      iai.idx = 0;
      iai.fromX = pl.x; iai.fromY = pl.y;
      pl.invuln = Math.max(pl.invuln, 0.5);
      pl.bladeSwing = 1;
    }

    _updateIaiDash(dt) {
      const iai = this.iai;
      if (!iai) return;
      const pl = this.player;
      const n = iai.targets.length;
      iai.t += dt;
      // 通過時刻 (i+1)*stepDuration を過ぎた全ターゲットを今フレームで斬り抜ける
      while (iai.idx < n && iai.t >= (iai.idx + 1) * iai.per) {
        const t = iai.targets[iai.idx];
        const a = Math.atan2(t.y - iai.fromY, t.x - iai.fromX);
        const ex = U.clamp(t.x + Math.cos(a) * 10, 16, this.w - 16);
        const ey = U.clamp(t.y + Math.sin(a) * 10, 16, this.h - 16);
        this.fx.trail(iai.fromX, iai.fromY, ex, ey, { width: 9 * this.blade.widthMult, color: this.activeCharge ? C.gold : this.blade.color, core: this.blade.core, slash: true, curve: 0 });
        this.audio.playIaiStep(iai.idx, n);
        if (iai.idx % 2 === 0 || n < 30) this.fx.sparks(t.x, t.y, 3, '#FFFFFF', 260, 0.2);
        iai.lastAng = a;
        iai.fromX = ex; iai.fromY = ey;
        iai.idx++;
      }
      if (iai.idx >= n) {
        pl.x = iai.fromX; pl.y = iai.fromY;
        this._iaiFinish();
        return;
      }
      // 現在区間を補間して主人公を移動
      const t = iai.targets[iai.idx];
      const k = U.clamp((iai.t - iai.idx * iai.per) / iai.per, 0, 1);
      pl.x = U.lerp(iai.fromX, t.x, k);
      pl.y = U.lerp(iai.fromY, t.y, k);
      pl.facing = Math.atan2(t.y - iai.fromY, t.x - iai.fromX);
    }

    _iaiFinish() {
      const iai = this.iai;
      const inp = this.input;
      if (iai.targets.length >= P.SHEATHE_MIN_LOCKS) {
        // 納刀ポーズ（画面完全静止＋カチッ＋白い十字閃光）
        inp.mode = 'sheathe';
        this.sheatheT = P.SHEATHE_PAUSE;
        this.player.sheathe = P.SHEATHE_PAUSE;
        this.audio.playSheatheClick();
      } else {
        this.detonate();
      }
    }

    /** 斬り抜けた全ての敵が1フレームで同時に大爆発 */
    detonate() {
      const iai = this.iai;
      const inp = this.input;
      inp.mode = 'idle';
      inp.path = [];
      if (!iai) return;
      this.iai = null;
      const targets = iai.targets;
      const n = targets.length;
      const big = n >= P.SHEATHE_MIN_LOCKS;
      const atk = this.atk();
      const phase = this.phase;
      const charge = this.activeCharge;
      this.activeCharge = 0;
      const cMult = P.CHARGE_BLAST_MULT[charge];
      const dmg = P.IAI_DAMAGE * atk * this.blade.hits * (phase >= 2 ? P.PHASE2_BLAST_MULT : 1) * (this.hasAwakening('shinra') ? 2.5 : 1) * cMult;
      const killsBefore = this.run.kills;
      const unique = [];
      const seen = new Set();
      for (const t of targets) {
        t.pending = false;
        if (!seen.has(t)) { seen.add(t); unique.push(t); }
      }
      // ALL BREAK 判定（ダメージ前の状態で）
      const breaks = [];
      for (const b of this.bosses) {
        if (!b.lockable) continue;
        const alive = b.cores.filter((c) => !c.broken);
        if (alive.length >= 2 && alive.every((c) => seen.has(c))) breaks.push(b);
      }
      // 無明：本物と分身をまとめて斬り伏せると特大カウンター
      const counters = [];
      for (const b of this.bosses) {
        if (b.kind === 'saint' && b.clones && b.clones.length && seen.has(b)) {
          const cl = b.clones.filter((c) => !c.dead);
          if (cl.length && cl.every((c) => seen.has(c))) counters.push(b);
        }
      }
      const pl = this.player;
      // 各ロックにダメージ（ALL BREAK 対象の核は allBreak 側で処理）
      for (const t of targets) {
        if (t.dead) continue;
        if (t.isCore && breaks.includes(t.boss)) continue;
        const ang = Math.atan2(t.y - iai.startY, t.x - iai.startX) + U.rand(-0.6, 0.6);
        if (t.isBullet) { this.parryBullet(t); continue; }
        if (t.isGimmick) { this.triggerGimmick(t); continue; }
        this.dealDamage(t, dmg, { src: 'iai', angle: ang, combo: this.blade.hits, quiet: n > 30 });
      }
      // 爆発の範囲（ロック外の敵も巻き込む）
      const blastR = P.IAI_BLAST_RADIUS * (phase >= 2 ? P.PHASE2_BLAST_MULT : 1) * this.blastMult() * cMult;
      const blastD = P.IAI_BLAST_DAMAGE * atk * (phase >= 2 ? P.PHASE2_BLAST_MULT : 1) * cMult;
      let bc = 0;
      for (const t of unique) {
        if (t.isBullet) continue;
        if (bc++ > 40) break;
        this.blast(t.x, t.y, blastR, blastD, { src: 'blast', color: bc % 2 ? C.gold : this.blade.color, exclude: seen, quiet: true });
        this.fx.inkBurst(t.x, t.y, 6, 260);
      }
      for (const b of breaks) this.allBreak(b, n);
      for (const b of counters) this.saintCounter(b);
      // 雷鳴抜刀・影打
      const enemiesHit = unique.filter((t) => t.isEnemy || t.isBoss || t.isCore);
      this._onHitSkills(enemiesHit, dmg, iai.lastAng);
      // 建御雷・天罰落雷
      if (this.hasAwakening('takemikazuchi') && enemiesHit.length) this.takemikazuchi(enemiesHit);
      // MAX帯電：納刀時に黄金の落雷が全標的に直撃
      if (charge >= P.CHARGE_MAX) {
        let nb = 0;
        for (const t of unique) {
          if (nb++ > 40) break;
          this.fx.beam(t.x, t.y, 22, 0.45, C.gold, true);
          this.fx.sparks(t.x, t.y, 6, C.gold, 380, 0.4);
          if (!t.dead && (t.isEnemy || t.isBoss)) this.dealDamage(t, 1.5 * atk, { src: 'lightning', combo: 1, quiet: true });
        }
        this.renderer.doFlash(0.35, C.gold);
        this.audio.playLightning();
      }

      const kills = this.run.kills - killsBefore;
      this.run.maxIaiKills = Math.max(this.run.maxIaiKills, kills);
      // 魂ジェムの竜巻一斉バキューム（5体以上同時撃破）
      if (kills >= P.TORNADO_KILLS) this.tornadoVacuum(kills);
      // RGB色収差：覚醒は5体以上で±5px、鬼神は全爆砕で±9px＋外周からの放射状ショックウェーブ
      if (phase === 3) this.trancePunch(true);
      else if (phase === 2 && kills >= P.CA_PHASE2_KILLS) this.renderer.chromatic(P.CA_PHASE2_PX);
      // ジュース
      if (big) {
        this.doHitstop(Math.min(110, 35 + n * 4));
        this.punchZoom(P.ZOOM_PUNCH_MIN + Math.min(P.ZOOM_PUNCH_MAX - P.ZOOM_PUNCH_MIN, n * 0.003));
        this.shake(Math.min(P.SHAKE_MAX, 8 + n * 0.6 + (phase === 3 ? 12 : 0)));
        this.renderer.doFlash(phase === 3 ? 0.45 : 0.22, '#FFFFFF');
        this.audio.playDetonation(n, false);
        this.fx.ring(pl.x, pl.y, 10, 180 + n * 4, 0.45, this.blade.color, 5);
        if (phase === 3) this.fx.ring(this.w / 2, this.h / 2, 30, Math.max(this.w, this.h) * 0.6, 0.6, C.crimson, 6);
      } else {
        this.audio.playExplosionSmall();
        this.shake(4);
      }
      this._killCallout(kills, pl.x, pl.y - 60);
      // 次元斬
      const endX = pl.x, endY = pl.y;
      if (phase === 3 || this.blade.alwaysVoid) {
        this._pathRifts(iai.path, iai.startX, iai.startY, endX, endY);
      } else if (phase === 2 && n >= P.PHASE2_AUTO_VOID_LOCKS) {
        this.spawnRift(iai.startX, iai.startY, endX, endY, P.VOID_DUR, { thick: true });
      }
      this._afterAttack(iai.startX, iai.startY, endX, endY, 'iai', n);
    }

    /** 一筆書きの軌跡を次元斬へ変換 */
    _pathRifts(path, sx, sy, ex, ey) {
      const pts = path && path.length > 1 ? path : [{ x: sx, y: sy }, { x: ex, y: ey }];
      const segs = [];
      let ax = pts[0].x, ay = pts[0].y, acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (acc >= 70 || i === pts.length - 1) {
          segs.push([ax, ay, pts[i].x, pts[i].y]);
          ax = pts[i].x; ay = pts[i].y; acc = 0;
        }
      }
      const step = Math.max(1, Math.ceil(segs.length / 22));
      const out = [];
      for (let i = 0; i < segs.length; i += step) {
        const s = segs[i], e = segs[Math.min(segs.length - 1, i + step - 1)];
        out.push([s[0], s[1], e[2], e[3]]);
      }
      const dur = P.VOID_DUR;
      out.forEach((s, i) => this.spawnRift(s[0], s[1], s[2], s[3], dur + i * 0.02, { noShift: i > 0 }));
    }

    _killCallout(kills, x, y) {
      for (const c of CFG.CALLOUTS) {
        if (kills >= c.min) {
          this.fx.callout(U.clamp(x, 160, this.w - 160), U.clamp(y, 80, this.h - 80), c.text, c.color, Math.min(c.size, this.w / 9), this.realTime);
          return;
        }
      }
    }

    /* ------------------------------------------------------------------
     * ダメージ・撃破
     * ---------------------------------------------------------------- */
    dealDamage(t, amount, opts) {
      opts = opts || {};
      if (!t || t.dead) return false;
      const combo = opts.combo == null ? 1 : opts.combo;
      if (t.isCore) {
        const boss = t.boss;
        if (t.broken || !boss.lockable) return false;
        t.hp -= Math.max(0.5, amount / this.atk());
        t.hitFlash = 0.1;
        if (combo) this.addCombo(combo);
        this._dmgText(t.x, t.y, amount * 0.5, C.gold);
        this.dealDamage(boss, amount * 0.5, { src: opts.src, combo: 0, quiet: true });
        if (t.hp <= 0 && !t.broken) this.partBreak(t);
        return false;
      }
      if (t.isBoss) {
        if (!t.lockable) return false;
        const a = amount * t.takeDamageMult();
        t.hp -= a;
        t.hitFlash = 0.08;
        if (combo) this.addCombo(combo);
        this.run.score += Math.round(a * 30 * this.rank.mult);
        if (!opts.quiet) this._dmgText((opts.at || t).x, (opts.at || t).y, a, C.gold);
        if (t.hp <= 0) { t.hp = 0; this.startExecution(t); }
        return false;
      }
      if (t.isGimmick) { this.triggerGimmick(t); return true; }
      if (t.isBullet) { this.parryBullet(t); return true; }
      // 通常敵
      let dmg = amount;
      let counter = false;
      if (t.countering && (opts.src === 'pinball' || opts.src === 'iai')) {
        counter = true;
        dmg *= 3;
        this.fx.callout(t.x, t.y - 40, 'カウンター一閃!!', C.gold, 40, this.realTime);
        this.audio.playCounter();
        this.doHitstop(60);
      }
      t.hp -= dmg;
      t.hitFlash = 0.1;
      t.lastHitAt = this.time;
      if (combo) this.addCombo(combo);
      if (!opts.quiet) this._dmgText(t.x, t.y - t.r, dmg, counter ? C.gold : (opts.src === 'lightning' ? C.shiden : '#FFFFFF'));
      if (t.hp <= 0.0001) { this.kill(t, opts, counter); return true; }
      return false;
    }

    _dmgText(x, y, amount, color) {
      const v = Math.max(1, Math.round(amount * 10));
      this.fx.text(x + U.rand(-8, 8), y, String(v), color, v >= 100 ? 22 : v >= 30 ? 18 : 15, 'dmg');
    }

    kill(e, opts, counter) {
      if (e.dead) return;
      e.dead = true;
      e.pending = false;
      opts = opts || {};
      const run = this.run;
      const mult = this.rank.mult;
      run.kills++;
      run.score += Math.round(e.score * mult * (counter ? 3 : 1));
      let ug = e.elite ? P.ULT_ELITE : P.ULT_KILL;
      if (this.run.rankIdx >= 3) ug *= P.ULT_RANK_S_MULT;
      this.addUlt(ug);
      // 魂ジェム
      const val = e.xp * (counter ? 5 : 1);
      this.dropGems(e.x, e.y, val, counter ? 5 : (e.elite ? 3 : 1));
      // 一刀両断の断面分解：爆砕系の撃破は断面が「吹っ飛び肉弾」となり死体ボウリング連鎖
      const ang = opts.angle != null ? opts.angle : Math.random() * TAU;
      const bowl = opts.src === 'iai' || opts.src === 'blast' || opts.src === 'chain' || opts.src === 'chainEnd' || opts.src === 'corpse' || opts.src === 'shockwave' || opts.src === 'pinball';
      if (!(bowl && (opts.gen || 0) < 6 && this.fx.corpse(e, e.x, e.y, ang, (opts.gen || 0)))) this.fx.bisect(e, e.x, e.y, ang);
      // エリート撃破：秘伝の巻物を確定ドロップ
      if (e.elite && (e.type === 'oni' || e.type === 'ronin')) this.scrolls.push(new E.Scroll(e.x, e.y));
      this.fx.inkBurst(e.x, e.y, e.elite ? 14 : 6, 240);
      this.fx.decal(e.x, e.y, e.r * 2.4 + 10, 'ink');
      this.fx.sparks(e.x, e.y, e.elite ? 14 : 5, opts.src === 'lightning' ? C.shiden : C.gold, 380, 0.4);
      // 種別特性
      if (e.type === 'ninja' && !e.mini) {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + Math.random();
          this.pendingSpawns.push(new E.SplitterNinja(e.x, e.y, { mini: true, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260 }));
        }
      }
      if (e.isBomb) {
        this.later(0.05, () => this.blast(e.x, e.y, 130, 1.5 * this.atk(), { src: 'blast', color: C.gold, big: true }));
      }
      // 紅蓮爆砕：誘爆／迦具土：全撃破が連鎖爆弾化
      const cr = this.skillLv('crimson');
      const kagu = this.hasAwakening('kagutsuchi');
      if (cr && (kagu || opts.src === 'iai' || opts.src === 'blast' || opts.src === 'shockwave' || opts.src === 'corpse') && run.explosionBudget < 120) {
        run.explosionBudget += 1;
        const r = 55 * this.blastMult();
        this.later(kagu ? 0.07 : 0.05, () => this.blast(e.x, e.y, r, 0.8 * this.atk(), { src: kagu ? 'chain' : 'chainEnd', color: C.crimson, small: true }));
      }
      // 弾返しの達人：10体ごとに追尾クナイ自動発射
      const pl = this.skillLv('parry');
      if (pl) {
        run.killsSinceKunai++;
        if (run.killsSinceKunai >= CFG.SKILL_TABLE.parry.autoEvery) {
          run.killsSinceKunai = 0;
          const n = CFG.SKILL_TABLE.parry.kunai[pl - 1];
          for (let i = 0; i < n; i++) this.kunais.push(new E.HomingKunai(this.player.x, this.player.y, (i / n) * TAU, P.KUNAI_DAMAGE * this.atk()));
          this.audio.playKunai();
        }
      }
    }

    dropGems(x, y, value, pieces) {
      pieces = Math.max(1, Math.min(6, pieces || 1));
      const each = value / pieces;
      for (let i = 0; i < pieces; i++) {
        if (this.gems.length >= P.GEM_MAX) {
          const g = this.gems[(Math.random() * this.gems.length) | 0];
          g.value += each;
          continue;
        }
        const a = Math.random() * TAU, s = U.rand(40, 140);
        this.gems.push(new E.SoulGem(x, y, each, Math.cos(a) * s, Math.sin(a) * s));
      }
    }

    collectGem(g) {
      const run = this.run;
      if (!run) return;
      run.xp += g.value * this.xpMult();
      if (this.realTime - run.lastGemT < 0.35) run.gemStreak++; else run.gemStreak = 0;
      run.lastGemT = this.realTime;
      this.audio.playGemPickup(run.gemStreak);
      while (run.xp >= run.xpNext) {
        run.xp -= run.xpNext;
        run.level++;
        run.xpNext = CFG.xpForLevel(run.level);
        run.pendingLevelUps++;
      }
    }

    addUlt(v) {
      const before = this.ultGauge;
      this.ultGauge = Math.min(P.ULT_MAX, this.ultGauge + v);
      if (before < 100 && this.ultGauge >= 100) this.fx.text(this.player.x, this.player.y - 50, '奥義 解放!!', C.gold, 20, 'info');
      if (before < 200 && this.ultGauge >= 200) this.fx.text(this.player.x, this.player.y - 70, 'OVERCHARGE 200%!!', C.gold, 22, 'info');
    }

    /** 範囲爆発 */
    blast(x, y, radius, dmg, opts) {
      opts = opts || {};
      const ex = opts.exclude;
      const src = opts.src || 'blast';
      for (const e of this.enemies) {
        if (e.dead || e.pending || (ex && ex.has(e))) continue;
        const rr = radius + e.r;
        if (U.dist2(x, y, e.x, e.y) <= rr * rr) this.dealDamage(e, dmg, { src, angle: opts.angle != null ? opts.angle : Math.atan2(e.y - y, e.x - x), combo: 1, quiet: opts.quiet, gen: opts.gen });
      }
      for (const b of this.bosses) {
        if (!b.lockable || (ex && ex.has(b))) continue;
        if (this._bossDist2(b, x, y) <= radius * radius) this.dealDamage(b, dmg, { src, combo: 1, quiet: true });
      }
      for (const g of this.gimmicks) {
        if (!g.lockable || (ex && ex.has(g))) continue;
        if (U.dist2(x, y, g.x, g.y) <= (radius + g.r) * (radius + g.r)) this.later(0.06, () => this.triggerGimmick(g));
      }
      for (const b of this.bullets) {
        if (!b.dead && !b.pending && U.dist2(x, y, b.x, b.y) <= radius * radius) { b.dead = true; this.fx.sparks(b.x, b.y, 3, C.crimson, 160, 0.2); }
      }
      const col = opts.color || C.gold;
      this.fx.ring(x, y, radius * 0.2, radius, opts.small ? 0.28 : 0.4, col, opts.small ? 3 : 5);
      if (!opts.small) this.fx.sparks(x, y, opts.big ? 22 : 10, col, 420, 0.45);
      else this.fx.sparks(x, y, 5, col, 300, 0.3);
      if (!opts.noDecal) this.fx.decal(x, y, radius * 0.9, 'scorch');
      if (opts.big) { this.shake(10); this.audio.playExplosionSmall(); }
      else if (opts.small) this.audio.playExplosionSmall();
    }

    parryBullet(b) {
      if (b.dead) return;
      b.dead = true;
      b.pending = false;
      const run = this.run;
      run.totalParries++;
      this.addCombo(P.PARRY_COMBO);
      let ug = P.ULT_PARRY;
      if (run.rankIdx >= 3) ug *= P.ULT_RANK_S_MULT;
      this.addUlt(ug);
      run.score += Math.round(50 * this.rank.mult);
      const lv = this.skillLv('parry');
      const n = lv ? CFG.SKILL_TABLE.parry.kunai[lv - 1] : 1;
      const base = Math.atan2(b.vy, b.vx) + Math.PI;
      for (let i = 0; i < n; i++) {
        if (this.kunais.length > 160) break;
        this.kunais.push(new E.HomingKunai(b.x, b.y, base + (i - (n - 1) / 2) * 0.35, P.KUNAI_DAMAGE * this.atk()));
      }
      this.fx.sparks(b.x, b.y, 8, C.cyan, 360, 0.3);
      this.fx.ring(b.x, b.y, 4, 26, 0.2, C.cyan, 2);
      this.audio.playParry();
      if (this.realTime - (run.lastParryText || 0) > 0.35) {
        run.lastParryText = this.realTime;
        this.fx.callout(b.x, b.y - 26, '弾斬り!', C.cyan, 26, this.realTime);
      }
    }

    triggerGimmick(g) {
      if (g.dead) return;
      g.dead = true;
      g.pending = false;
      this.addCombo(1);
      this.run.score += Math.round(200 * this.rank.mult);
      this.fx.bisect(g, g.x, g.y, Math.random() * TAU);
      if (g.kind === 'barrel') {
        this.blast(g.x, g.y, 120 * this.blastMult(), 2 * this.atk(), { src: 'blast', color: C.gold, big: true });
        this.fx.callout(g.x, g.y - 30, '大誘爆!!', C.gold, 32, this.realTime);
      } else if (g.kind === 'thunder') {
        const list = this.enemies.filter((e) => !e.dead && !e.pending)
          .sort((a, b) => U.dist2(g.x, g.y, a.x, a.y) - U.dist2(g.x, g.y, b.x, b.y)).slice(0, 5);
        for (const e of list) {
          this.fx.bolt(g.x, g.y, e.x, e.y, C.shiden, 0.4, 3);
          e.paralyze = 3;
          this.dealDamage(e, this.atk(), { src: 'lightning', combo: 1 });
        }
        this.fx.ring(g.x, g.y, 10, 90, 0.35, C.shiden, 4);
        this.audio.playLightning();
        this.fx.callout(g.x, g.y - 30, '紫電連鎖!!', C.shiden, 30, this.realTime);
      } else if (g.kind === 'crystal') {
        this.spawnRift(g.x - 150, g.y, g.x + 150, g.y, 3.0, { thick: true });
        this.spawnRift(g.x, g.y - 150, g.x, g.y + 150, 3.0, { thick: true, noShift: true });
        this.fx.ring(g.x, g.y, 10, 120, 0.4, '#FFFFFF', 4);
      }
    }

    /* ------------------------------------------------------------------
     * コンボ＆スタイルランク
     * ---------------------------------------------------------------- */
    addCombo(n) {
      const run = this.run;
      if (!run || n <= 0) return;
      const prevCombo = run.combo;
      run.combo += n;
      run.maxChain = Math.max(run.maxChain, run.combo);
      this._checkCutins(prevCombo, run.combo, null);
      let idx = 0;
      for (let i = CFG.STYLE_RANKS.length - 1; i >= 0; i--) { if (run.combo >= CFG.STYLE_RANKS[i].min) { idx = i; break; } }
      const prev = run.rankIdx;
      if (idx !== prev) this._setRank(idx);
      run.comboTimer = CFG.STYLE_RANKS[run.rankIdx].grace;
      // 紫電：100チェインごとにHP1回復
      if (this.blade.healPer100) {
        const mark = Math.floor(run.combo / 100);
        if (mark > run.healMark) {
          run.healMark = mark;
          if (this.player.hp < this.player.maxHp) {
            this.player.hp++;
            this.fx.text(this.player.x, this.player.y - 40, '+1 HP', C.jade, 20, 'info');
          }
        }
      }
    }

    _setRank(idx) {
      const run = this.run;
      const prevPhase = CFG.STYLE_RANKS[run.rankIdx].phase;
      const up = idx > run.rankIdx;
      run.rankIdx = idx;
      run.maxRankIdx = Math.max(run.maxRankIdx, idx);
      if (idx >= 4) run.reachedSS = true;
      this.audio.setBgmIntensity(idx);
      const r = CFG.STYLE_RANKS[idx];
      if (up) this._checkCutins(run.combo, run.combo, r.id);
      if (up) {
        if (this.w >= 760) this.fx.text(this.w - 140, Math.max(200, this.h * 0.28), `RANK ${r.id}  ${r.name}`, r.color, 22, 'info');
        else this.fx.text(this.w / 2, this.h * 0.3 + 58, `RANK ${r.id}  ${r.name}`, r.color, 20, 'info');
        if (r.phase !== prevPhase) {
          const lab = CFG.PHASE_LABELS[r.phase];
          this.fx.callout(this.w / 2, this.h * 0.3, `${lab.jp}!!`, r.phase === 3 ? C.crimson : C.cyan, Math.min(56, this.w / 10), this.realTime);
          this.renderer.doFlash(0.25, r.phase === 3 ? C.crimson : C.cyan);
          this.audio.playAwaken();
        }
      }
      this.ui.rankChanged(up);
    }

    _resetCombo() {
      const run = this.run;
      run.combo = 0;
      run.healMark = 0;
      run.cutinShown.clear();
      if (run.rankIdx !== 0) this._setRank(0);
    }

    /** コンボ半減時：新コンボより上の毛筆カットインを再解禁 */
    _rearmCutins() {
      const run = this.run;
      for (const c of CFG.BRUSH_CUTINS) {
        if (c.hit && run.combo < c.hit) run.cutinShown.delete('h' + c.hit);
        if (c.rank) { const ri = CFG.STYLE_RANKS.findIndex((r) => r.id === c.rank); if (run.rankIdx < ri) run.cutinShown.delete('r' + c.rank); }
      }
    }

    /* ------------------------------------------------------------------
     * 次元斬（Void Rift）
     * ---------------------------------------------------------------- */
    spawnRift(x1, y1, x2, y2, dur, opts) {
      opts = opts || {};
      if (this.hasAwakening('kokujo')) opts.pull = true;
      if (Math.hypot(x2 - x1, y2 - y1) < 8) return null;
      const r = this.fx.rift(x1, y1, x2, y2, dur, opts);
      if (!opts.mini) this.audio.playVoidSlash();
      if (!opts.noShift && !opts.mini) this._split(x1, y1, x2, y2, P.VOID_SHIFT, 0.22);
      // 鬼神トランス：すべての次元斬に強烈なRGB色収差＋放射状ショックウェーブ
      if (this.run && this.phase === 3 && !opts.mini) this.trancePunch(false);
      // 黒縄地獄：裂け目の交差点にミニブラックホール
      if (opts.pull && this.blackHoles.length < 4) {
        const rifts = this.fx.rifts;
        for (let i = rifts.length - 2, c = 0; i >= 0 && c < 30; i--, c++) {
          const o = rifts[i];
          if (o.hostile || o === r) continue;
          const pt = U.segIntersect(x1, y1, x2, y2, o.x1, o.y1, o.x2, o.y2);
          if (pt && this.blackHoles.every((h) => U.dist2(h.x, h.y, pt.x, pt.y) > 90 * 90)) {
            this.blackHoles.push(new E.MiniBlackHole(pt.x, pt.y));
            this.fx.ring(pt.x, pt.y, 80, 10, 0.4, C.crimson, 3);
            break;
          }
        }
      }
      return r;
    }

    _split(x1, y1, x2, y2, off, dur, force) {
      if (!force && this.realTime - (this.run ? this.run.lastSplit : 0) < 0.4) return;
      if (this.run) this.run.lastSplit = this.realTime;
      this.renderer.addSplit(x1, y1, x2, y2, off, dur);
    }

    _updateRifts(dtw) {
      const atk = this.atk();
      for (const r of this.fx.rifts) {
        if (r.dead) continue;
        r.update(dtw);
        if (r.hostile) { if (r.t >= r.dur) r.dead = true; continue; }
        const touch = r.width * (r.thick ? 1.8 : r.mini ? 0.6 : 1);
        // 重力場
        if (r.pull) {
          for (const e of this.enemies) {
            if (e.dead || e.pending) continue;
            const ab = { x: r.x2 - r.x1, y: r.y2 - r.y1 };
            const l2 = ab.x * ab.x + ab.y * ab.y || 1;
            let tt = ((e.x - r.x1) * ab.x + (e.y - r.y1) * ab.y) / l2;
            tt = U.clamp(tt, 0, 1);
            const px = r.x1 + ab.x * tt, py = r.y1 + ab.y * tt;
            const d = Math.hypot(px - e.x, py - e.y);
            if (d < 160 && d > 4) { e.pullX += (px - e.x) / d * 150; e.pullY += (py - e.y) / d * 150; }
          }
        }
        r.tick += dtw;
        if (r.tick >= P.VOID_TICK) {
          r.tick -= P.VOID_TICK;
          const d = P.VOID_TICK_DAMAGE * atk * r.dmgMult;
          for (const e of this.enemies) {
            if (e.dead || e.pending) continue;
            const rr = e.r + touch;
            if (U.segDist2(e.x, e.y, r.x1, r.y1, r.x2, r.y2) <= rr * rr) this.dealDamage(e, d, { src: 'void', angle: r.angle, combo: 1, quiet: true });
          }
          for (const b of this.bosses) {
            if (!b.lockable) continue;
            if (this._bossSegHit(b, r.x1, r.y1, r.x2, r.y2, touch)) this.dealDamage(b, d, { src: 'void', combo: 1, quiet: true });
          }
          for (const g of this.gimmicks) {
            if (g.lockable && U.segDist2(g.x, g.y, r.x1, r.y1, r.x2, r.y2) <= (g.r + touch) * (g.r + touch)) this.triggerGimmick(g);
          }
        }
        // 敵弾はすべて消去
        for (const b of this.bullets) {
          if (!b.dead && !b.pending && U.segDist2(b.x, b.y, r.x1, r.y1, r.x2, r.y2) <= (b.r + touch) * (b.r + touch)) {
            b.dead = true;
            this.fx.sparks(b.x, b.y, 3, '#FFFFFF', 160, 0.2);
          }
        }
        // 空間閉鎖爆発
        if (r.t >= r.dur && !r.closed) {
          r.closed = true;
          r.dead = true;
          this._closeRift(r);
        }
      }
    }

    _closeRift(r) {
      const atk = this.atk();
      const half = P.VOID_CLOSE_WIDTH / 2 * (r.mini ? 0.6 : 1);
      const d = P.VOID_CLOSE_DAMAGE * atk * r.closeMult;
      if (d > 0) {
        for (const e of this.enemies) {
          if (e.dead || e.pending) continue;
          const rr = e.r + half;
          if (U.segDist2(e.x, e.y, r.x1, r.y1, r.x2, r.y2) <= rr * rr) this.dealDamage(e, d, { src: 'void', angle: r.angle, combo: 1, quiet: this.fx.rifts.length > 20 });
        }
        for (const b of this.bosses) {
          if (b.lockable && this._bossSegHit(b, r.x1, r.y1, r.x2, r.y2, half)) this.dealDamage(b, d, { src: 'void', combo: 1 });
        }
      }
      const mx = (r.x1 + r.x2) / 2, my = (r.y1 + r.y2) / 2;
      this.fx.trail(r.x1, r.y1, r.x2, r.y2, { width: r.mini ? 10 : 24, color: r.edge === C.cyan ? C.cyan : C.crimson, core: '#FFFFFF', life: 0.25, curve: 0 });
      if (!r.mini) {
        const n = Math.min(10, Math.floor(r.len / 30));
        for (let i = 0; i <= n; i++) {
          const t = i / Math.max(1, n);
          this.fx.sparks(U.lerp(r.x1, r.x2, t), U.lerp(r.y1, r.y2, t), 2, i % 2 ? '#FFFFFF' : C.crimson, 260, 0.35);
        }
        this.shake(r.thick ? 7 : 4);
        this.audio.playVoidCollapse();
        if (this.realTime - this.run.lastCalloutVoid > 0.7) {
          this.run.lastCalloutVoid = this.realTime;
          this.fx.callout(U.clamp(mx, 120, this.w - 120), U.clamp(my - 30, 60, this.h - 60), '空間断裂!!', '#FFFFFF', 36, this.realTime);
        }
        if (!r.noShift) this._split(r.x1, r.y1, r.x2, r.y2, -P.VOID_SHIFT, 0.2);
      }
    }

    /* ------------------------------------------------------------------
     * 極意進化の常時効果
     * ---------------------------------------------------------------- */
    _updateAwakenings(dt, dtw) {
      const pl = this.player;
      const atk = this.atk();
      const run = this.run;
      // 千手観音：分身が斬った敵へ八方から乱舞斬り
      if (this.hasAwakening('senju')) {
        run.senjuT = (run.senjuT || 0) - dt;
        if (run.senjuT <= 0) {
          run.senjuT = 0.11;
          const cands = this.enemies.filter((e) => !e.dead && !e.pending && this.time - e.lastHitAt < 3);
          const t = cands.length ? U.choice(cands) : null;
          if (t) {
            const a = Math.random() * TAU;
            const L = t.r + 30;
            this.fx.trail(t.x - Math.cos(a) * L, t.y - Math.sin(a) * L, t.x + Math.cos(a) * L, t.y + Math.sin(a) * L, { width: 8, color: '#8A9BC4', core: '#E6ECFA', life: 0.18 });
            this.dealDamage(t, 0.6 * atk, { src: 'shadow', angle: a, combo: 1, quiet: true });
          } else {
            for (const b of this.bosses) {
              if (b.lockable && this.time - (b.lastShadow || -9) > 0.3) {
                b.lastShadow = this.time;
                const a = Math.random() * TAU;
                this.fx.trail(b.x - Math.cos(a) * 60, b.y - Math.sin(a) * 60, b.x + Math.cos(a) * 60, b.y + Math.sin(a) * 60, { width: 8, color: '#8A9BC4', life: 0.18 });
                this.dealDamage(b, 0.6 * atk, { src: 'shadow', combo: 1, quiet: true });
              }
            }
          }
        }
      }
      // 八咫鏡：回転光刃で自動パリィ＋クナイばら撒き
      if (this.hasAwakening('yata')) {
        for (const b of this.bullets) {
          if (!b.dead && !b.pending && U.dist2(pl.x, pl.y, b.x, b.y) < 80 * 80) this.parryBullet(b);
        }
        for (const e of this.enemies) {
          if (e.dead || e.pending) continue;
          const d = Math.hypot(e.x - pl.x, e.y - pl.y);
          if (d < 62 + e.r && d > 40 - e.r && this.time - (e.yataT || -9) > 0.25) {
            e.yataT = this.time;
            this.dealDamage(e, 0.5 * atk, { src: 'yata', combo: 1, quiet: true });
          }
        }
        run.yataT = (run.yataT || 0) - dt;
        if (run.yataT <= 0 && this.kunais.length < 120) {
          run.yataT = 1 / 6;
          this.kunais.push(new E.HomingKunai(pl.x, pl.y, Math.random() * TAU, P.KUNAI_DAMAGE * atk));
        }
      }
      // 黒縄地獄のブラックホール
      for (const h of this.blackHoles) {
        for (const e of this.enemies) {
          if (e.dead || e.pending) continue;
          const d = Math.hypot(h.x - e.x, h.y - e.y);
          if (d < 190 && d > 3) { e.pullX += (h.x - e.x) / d * 230; e.pullY += (h.y - e.y) / d * 230; }
        }
        h.tick += dtw;
        if (h.tick >= 0.2) {
          h.tick = 0;
          for (const e of this.enemies) {
            if (!e.dead && !e.pending && U.dist2(h.x, h.y, e.x, e.y) < (h.r + e.r) * (h.r + e.r)) this.dealDamage(e, atk, { src: 'void', combo: 1, quiet: true });
          }
          for (const b of this.bullets) if (U.dist2(h.x, h.y, b.x, b.y) < h.r * h.r) b.dead = true;
        }
      }
      // 縮地：蒼炎の残像ライン
      for (const f of this.fx.flames) {
        f.tick += dtw;
        if (f.tick >= 0.25) {
          f.tick = 0;
          for (const e of this.enemies) {
            if (!e.dead && !e.pending && U.segDist2(e.x, e.y, f.x1, f.y1, f.x2, f.y2) <= (e.r + 10) * (e.r + 10)) this.dealDamage(e, 0.4 * atk, { src: 'flame', combo: 1, quiet: true });
          }
        }
      }
    }

    takemikazuchi(list) {
      const atk = this.atk();
      let n = 0;
      for (const t of list) {
        if (n++ > 24) break;
        this.fx.beam(t.x, t.y, 26, 0.5, C.gold, true);
        this.fx.ring(t.x, t.y, 10, 70, 0.35, C.gold, 4);
        if (!t.dead) this.dealDamage(t, 2 * atk, { src: 'lightning', combo: 1, quiet: true });
      }
      // 電撃ネット：ロックしていない画面内の敵も一斉感電
      const src = list.filter((t) => !t.dead);
      const from = src.length ? src : list;
      let b = 0;
      for (const e of this.enemies) {
        if (e.dead || e.pending) continue;
        const f = from[(Math.random() * from.length) | 0];
        if (b++ < 30) this.fx.bolt(f.x, f.y, e.x, e.y, C.gold, 0.3, 1.6);
        e.paralyze = Math.max(e.paralyze, 1.5);
        this.dealDamage(e, 0.8 * atk, { src: 'lightning', combo: 1, quiet: true });
      }
      this.renderer.doFlash(0.3, C.gold);
      this.audio.playLightning();
    }

    /* ------------------------------------------------------------------
     * 当たり判定
     * ---------------------------------------------------------------- */
    _collisions() {
      const pl = this.player;
      if (!pl) return;
      const atk = this.atk();
      // 敵との接触（被弾判定：敵半径＋主人公半径12px）＆『見切り（GRAZE!）』
      const canGraze = !pl.dash && this.input.mode !== 'iaiDash' && this.input.mode !== 'sheathe' && !this.ultMode;
      const gr = this.grazeRange();
      let hurt = false;
      for (const e of this.enemies) {
        if (e.dead || e.pending || e.age < 0.3) continue;
        const hitR = e.r + pl.r;
        const d2 = U.dist2(e.x, e.y, pl.x, pl.y);
        if (d2 < hitR * hitR) { if (!hurt) { hurt = true; this.damagePlayer(); } e.grazeIn = true; continue; }
        const band = hitR + gr;
        if (d2 < band * band) {
          if (!e.grazeIn) { e.grazeIn = true; if (canGraze && e.grazeCd <= 0 && pl.invuln <= 0.3) this.graze(e); }
        } else e.grazeIn = false;
      }
      for (const b of this.bullets) {
        if (b.dead || b.pending) continue;
        const hitR = b.r + pl.r;
        const d2 = U.dist2(b.x, b.y, pl.x, pl.y);
        if (d2 >= hitR * hitR) {
          const band = hitR + gr;
          if (d2 < band * band) {
            if (!b.grazeIn) { b.grazeIn = true; if (canGraze && b.grazeCd <= 0) this.graze(b); }
          } else b.grazeIn = false;
        }
      }
      for (const b of this.bosses) {
        if (!b.lockable || b.stun > 0) continue;
        for (const p of b.parts()) {
          const rr = p.r * 0.8 + pl.r;
          if (U.dist2(p.x, p.y, pl.x, pl.y) < rr * rr) { this.damagePlayer(); break; }
        }
      }
      // 敵弾
      for (const b of this.bullets) {
        if (b.dead || b.pending) continue;
        const rr = b.r + pl.r;
        if (U.dist2(b.x, b.y, pl.x, pl.y) < rr * rr) {
          if (pl.invuln > 0 || this.ultMode || this.input.mode === 'iaiDash') continue;
          b.dead = true;
          this.damagePlayer();
        }
      }
      // 追尾クナイ
      for (const k of this.kunais) {
        if (k.dead) continue;
        const t = k.target;
        if (!t || t.dead) continue;
        let hit = false;
        if (t.isBoss) hit = this._bossDist2(t, k.x, k.y) < 64;
        else hit = U.dist2(t.x, t.y, k.x, k.y) < (t.r + 6) * (t.r + 6);
        if (hit) {
          k.dead = true;
          this.dealDamage(t, k.dmg, { src: 'kunai', angle: k.angle, combo: 1, quiet: this.kunais.length > 40 });
          this.fx.sparks(k.x, k.y, 3, C.cyan, 200, 0.2);
        }
      }
      // 真空三日月波（貫通）
      for (const w of this.waves) {
        if (w.dead) continue;
        for (const e of this.enemies) {
          if (e.dead || e.pending) continue;
          const rr = e.r + w.r;
          if (U.dist2(e.x, e.y, w.x, w.y) < rr * rr) {
            const last = w.hitMap.get(e) || -9;
            if (this.time - last > 0.4) { w.hitMap.set(e, this.time); this.dealDamage(e, atk, { src: 'wave', angle: w.angle, combo: 1, quiet: true }); }
          }
        }
        for (const b of this.bosses) {
          if (!b.lockable) continue;
          if (this._bossDist2(b, w.x, w.y) < w.r * w.r) {
            const last = w.hitMap.get(b) || -9;
            if (this.time - last > 0.4) { w.hitMap.set(b, this.time); this.dealDamage(b, atk, { src: 'wave', combo: 1, quiet: true }); }
          }
        }
        for (const b of this.bullets) if (!b.dead && !b.pending && U.dist2(b.x, b.y, w.x, w.y) < w.r * w.r) b.dead = true;
        // 天叢雲：通過軌跡にミニ次元斬
        if (w.awakened) {
          w.riftT += this.dtReal;
          if (w.riftT > 0.22) {
            w.riftT = 0;
            this.spawnRift(w.lx, w.ly, w.x, w.y, 0.8, { mini: true, closeMult: 0.4, noShift: true });
            w.lx = w.x; w.ly = w.y;
          }
        }
      }
    }

    damagePlayer() {
      const pl = this.player;
      if (!pl || pl.invuln > 0 || this.ultMode || this.state !== STATE.PLAYING) return;
      const m = this.input.mode;
      if (m === 'iaiDash' || m === 'sheathe') return;
      pl.hp--;
      pl.invuln = P.PLAYER_HIT_INVULN;
      pl.hurtT = P.PLAYER_HIT_INVULN;
      this.hurtFx = 1;
      // 被弾：コンボ半減
      if (this.run.combo > 0) {
        const before = this.run.combo;
        this.run.combo = Math.floor(this.run.combo / 2);
        let idx = 0;
        for (let i = CFG.STYLE_RANKS.length - 1; i >= 0; i--) { if (this.run.combo >= CFG.STYLE_RANKS[i].min) { idx = i; break; } }
        if (idx !== this.run.rankIdx) this._setRank(idx);
        this._rearmCutins();
        if (before >= 10) this.fx.text(pl.x, pl.y - 36, `CHAIN 半減 ${before}→${this.run.combo}`, C.crimson, 16, 'info');
      }
      this.shake(14);
      this.audio.playHurt();
      this.renderer.doFlash(0.18, C.crimson);
      this.fx.sparks(pl.x, pl.y, 14, C.crimson, 360, 0.4);
      if (m === 'aim' || m === 'press') this.cancelAim();
      if (pl.hp <= 0) {
        pl.hp = 0;
        this.gameOver();
      }
    }

    /* ------------------------------------------------------------------
     * 敵弾・敵生成
     * ---------------------------------------------------------------- */
    spawnBullet(x, y, vx, vy, opts) {
      if (this.bullets.length > 260) return;
      this.bullets.push(new E.EnemyBullet(x, y, vx, vy, opts));
    }

    _edgePoint() {
      const m = 40;
      const side = (Math.random() * 4) | 0;
      if (side === 0) return { x: U.rand(-m, this.w + m), y: -m };
      if (side === 1) return { x: this.w + m, y: U.rand(-m, this.h + m) };
      if (side === 2) return { x: U.rand(-m, this.w + m), y: this.h + m };
      return { x: -m, y: U.rand(-m, this.h + m) };
    }

    spawnEnemyGroup(type, count, mult) {
      if (this.enemies.length >= P.ENEMY_MAX) return;
      const o = mult || {};
      if (type === 'spider') {
        const c = this._edgePoint();
        const toward = Math.atan2(this.h / 2 - c.y, this.w / 2 - c.x);
        const form = (Math.random() * 3) | 0;
        for (let i = 0; i < count; i++) {
          let ox, oy;
          if (form === 0) {          // 円陣
            const a = (i / count) * TAU;
            const R = 50 + count * 3;
            ox = Math.cos(a) * R; oy = Math.sin(a) * R;
          } else if (form === 1) {   // S字
            const t = i / Math.max(1, count - 1) - 0.5;
            const along = t * count * 22, side = Math.sin(t * TAU) * 50;
            ox = -Math.cos(toward) * along - Math.sin(toward) * side;
            oy = -Math.sin(toward) * along + Math.cos(toward) * side;
          } else {                   // 鶴翼の陣（V字）
            const k = i - (count - 1) / 2;
            const along = -Math.abs(k) * 24, side = k * 26;
            ox = Math.cos(toward) * along - Math.sin(toward) * side;
            oy = Math.sin(toward) * along + Math.cos(toward) * side;
          }
          this.enemies.push(new E.SwarmSpider(c.x + ox, c.y + oy, Object.assign({ ox, oy }, o)));
        }
        return;
      }
      const Cls = E.ENEMY_CLASSES[type];
      for (let i = 0; i < count; i++) {
        const c = this._edgePoint();
        this.enemies.push(new Cls(c.x, c.y, o));
      }
    }

    _updateStage(dtw) {
      const run = this.run;
      run.stageTime += dtw;
      if (this.stage.key === 'ex') {
        // EX：90秒ごとに歴代ボスが強化されて乱入
        run.endlessBossT -= dtw;
        if (run.endlessBossT <= 0) {
          run.endlessBossT = this.stage.endlessBossEvery;
          if (this.bosses.length < 2) {
            run.endlessBossCount++;
            const kind = U.choice(['centipede', 'general', 'saint']);
            const lv = run.endlessBossCount;
            const boss = new E.BOSS_CLASSES[kind](this, { level: lv, hpMult: 1 + 0.55 * lv, spdMult: 1 + 0.05 * lv });
            this.bosses.push(boss);
            this.audio.playWarning();
            this.ui.cutin('warning', 'WARNING — 強敵乱入', `${boss.name}（強化 Lv${lv}）`, 2.2);
          }
        }
        return;
      }
      if (!run.bossPhase) {
        run.timeLeft -= dtw;
        if (run.timeLeft <= 0) { run.timeLeft = 0; this.startBossIntro(); }
      }
    }

    _updateSpawner(dtw) {
      const run = this.run;
      const stage = this.stage;
      const area = this.areaScale;
      let spawns = {};
      let formW;
      let formEvery = [P.FORMATION_EVERY_MIN, P.FORMATION_EVERY_MAX];
      let rateMult = 1;
      const opt = {};
      if (run.bossPhase && stage.key !== 'ex') {
        formW = stage.bossAdds.formations;
        formEvery = [stage.bossAdds.every * 0.85, stage.bossAdds.every * 1.15];
      } else {
        const t = run.stageTime;
        const wave = stage.waves.find((w) => t >= w.t0 && t < w.t1) || stage.waves[stage.waves.length - 1];
        spawns = wave.spawns || {};
        formW = wave.formations;
        if (stage.key === 'ex') {
          rateMult = 1 + t / 150;
          opt.hpMult = 1 + t / 360;
          opt.bulletMult = Math.min(1.6, 1 + t / 600);
        }
      }
      // 5大フォーメーション：画面内の敵を常時25〜55体に維持（小画面は密度に合わせ最大30%縮小）
      const dens = U.clamp(area, 0.7, 1);
      const minN = Math.round(P.ENEMY_MIN_ON_SCREEN * dens);
      const maxN = Math.round(P.ENEMY_SOFT_MAX * dens);
      const count = this.enemies.length;
      run.formT -= dtw;
      const starving = count < minN && run.stageTime - run.lastFormSpawn > 0.8;
      if ((run.formT <= 0 && count < maxN) || starving) {
        run.formT = U.rand(formEvery[0], formEvery[1]) / rateMult;
        run.lastFormSpawn = run.stageTime;
        let total = 0;
        for (const k in formW) total += formW[k];
        let r = Math.random() * total, pick = 'sLine';
        for (const k in formW) { r -= formW[k]; if (r <= 0) { pick = k; break; } }
        E.spawnFormation(this, pick, { enemyOpts: opt });
      }
      // 単体援軍（エリート・提灯・忍など）
      for (const type in spawns) {
        const [every, mn, mx] = spawns[type];
        if (run.spawnT[type] == null) run.spawnT[type] = every * U.rand(0.4, 0.9);
        run.spawnT[type] -= dtw;
        if (run.spawnT[type] <= 0) {
          run.spawnT[type] = every * U.rand(0.85, 1.15) / rateMult;
          if (this.enemies.length < maxN + 10) this.spawnEnemyGroup(type, U.randInt(mn, mx), opt);
        }
      }
      // ギミック
      run.gimmickT -= dtw;
      if (run.gimmickT <= 0) {
        run.gimmickT = stage.gimmickEvery * U.rand(0.8, 1.2);
        if (this.gimmicks.length < stage.gimmickMax) {
          const kind = U.choice(stage.gimmicks);
          for (let tries = 0; tries < 8; tries++) {
            const x = U.rand(80, this.w - 80), y = U.rand(Math.min(150, this.h * 0.25), this.h - 80);
            if (U.dist2(x, y, this.player.x, this.player.y) > 140 * 140) {
              this.gimmicks.push(new E.GIMMICK_CLASSES[kind](x, y));
              break;
            }
          }
        }
      }
    }

    /* ------------------------------------------------------------------
     * ボス登場・ALL BREAK・処刑
     * ---------------------------------------------------------------- */
    startBossIntro() {
      const run = this.run;
      run.bossPhase = true;
      this.cancelAim();
      this.state = STATE.BOSS_INTRO;
      this.bossIntroT = P.BOSS_WARNING_TIME;
      // 画面上の雑魚を一掃
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.dead = true;
        this.fx.inkBurst(e.x, e.y, 6, 200);
        this.fx.bisect(e, e.x, e.y, Math.random() * TAU);
        this.dropGems(e.x, e.y, e.xp, 1);
      }
      for (const b of this.bullets) b.dead = true;
      for (const f of this.formations) f.finish();
      this.audio.playWarning();
      const bc = CFG.BOSSES[this.stage.boss];
      this.ui.cutin('warning', 'WARNING — 強敵出現', bc.name, P.BOSS_WARNING_TIME);
    }

    _updateBossIntro(dt) {
      this.bossIntroT -= dt;
      if (this.bossIntroT <= 0) {
        const boss = new E.BOSS_CLASSES[this.stage.boss](this, {});
        this.bosses.push(boss);
        this.run.bossSpawned = true;
        this.state = STATE.PLAYING;
        this.fx.callout(this.w / 2, this.h * 0.25, boss.name, C.crimson, Math.min(42, this.w / 14), this.realTime);
      }
    }

    partBreak(core) {
      const boss = core.boss;
      core.breakCore(12);
      this.addUlt(P.ULT_PART_BREAK);
      boss.hp -= boss.maxHp * 0.04;
      this.run.score += Math.round(5000 * this.rank.mult);
      this.fx.callout(core.x, core.y - 30, '部位破壊!', C.gold, 32, this.realTime);
      this.fx.ring(core.x, core.y, 10, 90, 0.4, C.gold, 5);
      this.fx.sparks(core.x, core.y, 20, C.gold, 420, 0.5);
      this.dropGems(core.x, core.y, 3, 3);
      this.audio.playDetonation(4, false);
      this.shake(8);
      if (boss.hp <= 0) { boss.hp = 0; this.startExecution(boss); }
    }

    /** 『ALL BREAK!!』部位全破壊・詠唱阻止・18%割合ダメージ＋4秒大ダウン */
    allBreak(boss, n) {
      if (!boss.lockable) return;
      for (const c of boss.cores) c.breakCore(P.ALL_BREAK_STUN + 6);
      boss.cancelChant();
      if (boss.charge) boss.charge = null;
      boss.stunFor(P.ALL_BREAK_STUN, true);
      boss.hp -= boss.maxHp * P.ALL_BREAK_PCT;
      this.addUlt(P.ALL_BREAK_ULT);
      this.run.score += Math.round(20000 * this.rank.mult);
      this.dropGems(boss.x, boss.y, 30, 6);
      for (let i = 0; i < 4; i++) this.dropGems(boss.x + U.rand(-60, 60), boss.y + U.rand(-60, 60), 4, 4);
      this.doHitstop(P.HITSTOP_BIG);
      this.punchZoom(P.ZOOM_PUNCH_MAX);
      this.shake(22);
      this.renderer.doFlash(0.6, C.gold);
      this.audio.playDetonation(Math.max(n, 12), true);
      this.fx.ring(boss.x, boss.y, 20, 360, 0.7, C.gold, 8);
      this.fx.ring(boss.x, boss.y, 10, 240, 0.5, '#FFFFFF', 4);
      this.fx.sparks(boss.x, boss.y, 60, C.gold, 700, 0.8);
      this.fx.callout(this.w / 2, this.h * 0.32, 'ALL BREAK!!', C.gold, Math.min(76, this.w / 7), this.realTime);
      this.fx.text(this.w / 2, this.h * 0.32 + 52, '部位全破壊 ― 詠唱阻止・大ダウン', '#FFFFFF', 18, 'info', 1.6);
      if (boss.hp <= 0) { boss.hp = 0; this.startExecution(boss); }
    }

    saintCounter(boss) {
      if (!boss.lockable) return;
      boss.hp -= boss.maxHp * 0.1;
      boss.stunFor(2.0, false);
      for (const c of boss.clones) if (!c.dead) this.kill(c, { src: 'iai' });
      this.fx.callout(this.w / 2, this.h * 0.4, '特大カウンター!!', C.crimson, Math.min(60, this.w / 9), this.realTime);
      this.renderer.doFlash(0.4, '#FFFFFF');
      this.audio.playCounter();
      this.doHitstop(120);
      this.addUlt(20);
      if (boss.hp <= 0) { boss.hp = 0; this.startExecution(boss); }
    }

    bossShockwave(x, y, r) {
      this.fx.ring(x, y, 10, r, 0.4, C.crimson, 8);
      this.fx.decal(x, y, r * 1.2, 'scorch');
      this.fx.sparks(x, y, 24, '#FF7A1E', 400, 0.5);
      this.shake(12);
      this.audio.playExplosionSmall();
      const pl = this.player;
      if (U.dist2(x, y, pl.x, pl.y) < (r + pl.r) * (r + pl.r)) this.damagePlayer();
    }

    bossRiftCut(x1, y1, x2, y2) {
      const r = this.fx.rift(x1, y1, x2, y2, 0.45, { edge: C.crimson, thick: true });
      r.hostile = true;
      this._split(x1, y1, x2, y2, 10, 0.2, true);
      this.audio.playVoidSlash();
      this.shake(10);
      const pl = this.player;
      if (U.segDist2(pl.x, pl.y, x1, y1, x2, y2) < (20 + pl.r) * (20 + pl.r)) this.damagePlayer();
    }

    startExecution(boss) {
      if (boss.executing || boss.dead) return;
      if (this.state !== STATE.PLAYING && this.state !== STATE.BOSS_INTRO) { boss.hp = Math.max(boss.hp, 1); return; }
      boss.executing = true;
      boss.cancelChant();
      boss.telegraphs = [];
      this.cancelAim();
      if (this.iai) {
        for (const t of this.iai.targets) t.pending = false;
        this.iai = null;
      }
      this.input.mode = 'idle';
      if (this.ultMode === 'ult100') this._endUlt100(true);
      this.ultMode = null;
      this.pal.inv = false;
      if (this.player) this.player.invuln = Math.min(this.player.invuln, 2);
      this.state = STATE.BOSS_EXECUTION;
      this.exec = { boss, t: 0, hits: 0, acc: 0, finished: false, finT: 0, wait: 0 };
      // 周囲を一掃
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.dead = true;
        this.fx.inkBurst(e.x, e.y, 5, 200);
        this.dropGems(e.x, e.y, e.xp, 1);
      }
      for (const b of this.bullets) b.dead = true;
      for (const f of this.formations) f.finish();
      this.fx.corpses.length = 0;
      this.doHitstop(P.HITSTOP_BIG);
      this.renderer.doFlash(0.5, '#FFFFFF');
      this.audio.duck(4);
      this.audio.playSheatheClick();
      this.ui.cutin('finish', 'トドメを刺せ！！', 'FINISH HIM!!', 1.4);
    }

    execSlash(x, y, isTap, ang) {
      const ex = this.exec;
      if (!ex || ex.finished) return;
      const b = ex.boss;
      const a = ang != null ? ang : Math.random() * TAU;
      const L = 90;
      const cx = b.x + U.rand(-30, 30), cy = b.y + U.rand(-30, 30);
      this.fx.trail(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L, { width: 14, color: ex.hits % 3 === 0 ? C.gold : this.blade.color, core: '#FFFFFF', slash: true });
      this.fx.sparks(cx, cy, 6, C.gold, 420, 0.35);
      this.fx.inkBurst(cx, cy, 2, 200);
      ex.hits++;
      this.addCombo(1);
      this.run.score += Math.round(500 * this.rank.mult);
      const v = Math.round(this.atk() * 10 * (1 + ex.hits * 0.05));
      this.fx.text(cx + U.rand(-30, 30), cy - 20, String(v), C.gold, 18 + Math.min(14, ex.hits * 0.2), 'dmg');
      this.audio.playExecutionHit(ex.hits);
      this.shake(3);
      b.hitFlash = 0.06;
      if (ex.hits % 20 === 0 && this.realTime - (ex.lastCall || 0) > 0.45) {
        ex.lastCall = this.realTime;
        this.fx.callout(this.w / 2, this.h * 0.22, `百裂斬り ${ex.hits}HIT!!`, C.gold, 40, this.realTime);
      }
    }

    _updateExecution(dt) {
      const ex = this.exec;
      if (!ex) return;
      ex.t += dt;
      ex.boss.updateExecution(dt, this);
      if (!ex.finished) {
        const timeUp = ex.t >= P.EXECUTION_TIME;
        if (timeUp && (!this.input.down || ex.t > P.EXECUTION_TIME + 3)) this._execFinale();
      } else {
        ex.finT += dt;
        if (ex.stage === 1 && ex.finT >= P.SHEATHE_PAUSE) {
          ex.stage = 2;
          this._bossExplode(ex.boss);
        }
        if (ex.stage === 2 && ex.finT >= 2.0) {
          ex.stage = 3;
          this.exec = null;
          if (this.stage.key === 'ex' || this.bosses.some((b) => !b.dead && b !== ex.boss)) {
            this.state = STATE.PLAYING;
          } else {
            this.stageClear();
          }
        }
      }
    }

    _execFinale() {
      const ex = this.exec;
      ex.finished = true;
      ex.finT = 0;
      ex.stage = 1;
      const b = ex.boss;
      // 極太の黄金一閃＋納刀カチッ
      const beam = this.fx.beam(b.x, b.y, 40, 0.7, C.gold, false, -0.25);
      beam.len = Math.max(this.w, this.h) * 1.5;
      this.player.sheathe = P.SHEATHE_PAUSE;
      this.audio.playUlt200Slash();
      this.audio.playSheatheClick();
      this.renderer.doFlash(0.7, '#FFFFFF');
      this._split(b.x - 300, b.y + 75, b.x + 300, b.y - 75, 18, 0.5, true);
    }

    _bossExplode(b) {
      b.dead = true;
      this.run.bossKills++;
      this.run.score += Math.round(50000 * this.rank.mult);
      this.audio.playBossDeath();
      this.doHitstop(P.HITSTOP_BIG);
      this.shake(P.SHAKE_MAX);
      this.punchZoom(P.ZOOM_PUNCH_MAX);
      this.renderer.doFlash(0.9, C.gold);
      for (const p of b.parts()) {
        this.fx.inkBurst(p.x, p.y, 20, 480);
        this.fx.sparks(p.x, p.y, 26, C.gold, 760, 1.0);
        this.fx.decal(p.x, p.y, (p.r || 40) * 3, 'ink');
      }
      for (let i = 0; i < 4; i++) this.fx.ring(b.x, b.y, 20, 200 + i * 120, 0.6 + i * 0.15, i % 2 ? C.gold : '#FFFFFF', 8 - i);
      this.fx.callout(this.w / 2, this.h * 0.3, '絶・一閃!!', 'rainbow', Math.min(80, this.w / 7), this.realTime);
      for (let i = 0; i < 12; i++) this.dropGems(b.x + U.rand(-80, 80), b.y + U.rand(-80, 80), 6, 5);
      this.addUlt(30);
    }

    /* ------------------------------------------------------------------
     * 奥義（第壱 100% ／ 第弐 200%）
     * ---------------------------------------------------------------- */
    tryUltimate() {
      if (this.state !== STATE.PLAYING || this.paused || this.ultMode) return false;
      const m = this.input.mode;
      if (m === 'iaiDash' || m === 'sheathe') return false;
      if (this.ultGauge >= 200) { this.cancelAim(); this.startUlt200(); return true; }
      if (this.ultGauge >= 100) { this.cancelAim(); this.startUlt100(); return true; }
      this.audio.playUiDeny();
      return false;
    }

    /** 第壱奥義『千本桜・墨嵐』 */
    startUlt100() {
      this.ultGauge -= 100;
      this.ultMode = 'ult100';
      this.ult = { t: 0, acc: 0, lx: this.input.cx || this.player.x, ly: this.input.cy || this.player.y };
      this.pal.inv = true;
      this.player.invuln = Math.max(this.player.invuln, P.ULT100_DURATION + 0.4);
      this.audio.playUltimate100();
      this.renderer.doFlash(0.8, '#FFFFFF');
      this.shake(12);
      this.ui.cutin('ult', '千本桜・墨嵐', '第壱奥義 ― SENBONZAKURA SUMIARASHI', 1.1);
    }

    _updateUlt100(dt) {
      const u = this.ult;
      u.t += dt;
      u.acc += dt;
      const rate = 1 / P.ULT100_RIFTS_PER_SEC;
      const cx = this.input.cx, cy = this.input.cy;
      while (u.acc >= rate) {
        u.acc -= rate;
        let x1 = u.lx, y1 = u.ly, x2 = cx, y2 = cy;
        const d = Math.hypot(x2 - x1, y2 - y1);
        if (d < 30) {
          const a = Math.random() * TAU;
          const L = U.rand(120, 200);
          x1 = cx - Math.cos(a) * L; y1 = cy - Math.sin(a) * L; x2 = cx + Math.cos(a) * L; y2 = cy + Math.sin(a) * L;
        } else if (d < 220) {
          const a = Math.atan2(y2 - y1, x2 - x1);
          const ext = (220 - d) / 2;
          x1 -= Math.cos(a) * ext; y1 -= Math.sin(a) * ext; x2 += Math.cos(a) * ext; y2 += Math.sin(a) * ext;
        }
        this.spawnRift(x1, y1, x2, y2, 0.9, { thick: true, noShift: true, closeMult: 0.5 });
        u.lx = cx; u.ly = cy;
      }
      if (u.t >= P.ULT100_DURATION) this._endUlt100(false);
    }

    _endUlt100(silent) {
      this.ultMode = null;
      this.pal.inv = false;
      if (silent) return;
      // 「パリン！！」ガラス・空間が砕け散り、全敵に15×攻撃力
      this.fx.crack(this.w / 2, this.h / 2, 1.0);
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * TAU, s = U.rand(200, 800);
        this.fx.particle(this.w / 2 + U.rand(-200, 200), this.h / 2 + U.rand(-150, 150), Math.cos(a) * s, Math.sin(a) * s - 200, U.rand(0.6, 1.2), U.rand(3, 7), '#E6F0FF', 3, 0.8);
      }
      this.audio.playGlassShatter();
      this.renderer.doFlash(0.9, '#FFFFFF');
      this.doHitstop(P.HITSTOP_BIG);
      this.shake(P.SHAKE_MAX);
      const dmg = P.ULT100_FINISH * this.atk();
      const killsBefore = this.run.kills;
      for (const e of this.enemies.slice()) {
        if (!e.dead && e.x > -30 && e.y > -30 && e.x < this.w + 30 && e.y < this.h + 30) this.dealDamage(e, dmg, { src: 'ult', combo: 1, quiet: true });
      }
      for (const b of this.bosses) if (b.lockable) this.dealDamage(b, dmg, { src: 'ult', combo: 1 });
      for (const b of this.bullets) b.dead = true;
      this._killCallout(this.run.kills - killsBefore, this.w / 2, this.h * 0.35);
    }

    /** 第弐奥義『絶・虚空一文字』 */
    startUlt200() {
      this.ultGauge = 0;
      this.ultMode = 'ult200';
      this.ult = { phase: 1, t: 0, swipeStart: null };
      for (const f of this.formations) f.finish();
      this.player.invuln = 99;
      this.audio.playUltimate200();
      this.renderer.doFlash(0.5, '#000000');
      this.ui.cutin('ult', '絶・虚空一文字', '第弐奥義 ― ZETSU KOKUU ICHIMONJI', 1.0);
      for (const b of this.bosses) if (b.lockable) b.stunFor(P.ULT200_PULL + P.ULT200_SWIPE + 1, false);
    }

    _updateUlt200(dt) {
      const u = this.ult;
      u.t += dt;
      const cx = this.w / 2, cy = this.h / 2;
      if (u.phase === 1) {
        // 重力収束：全てを画面中央へ吸い寄せる
        const k = Math.min(1, dt * (2 + u.t * 5));
        const pull = (o, keep) => {
          o.x += (cx - o.x) * k * (keep || 1) + U.rand(-1, 1);
          o.y += (cy - o.y) * k * (keep || 1) + U.rand(-1, 1);
        };
        for (const e of this.enemies) if (!e.dead) pull(e, 0.9);
        for (const b of this.bullets) pull(b);
        for (const g of this.gems) { g.magnet = false; pull(g, 0.5); }
        for (const b of this.bosses) {
          if (!b.lockable) continue;
          const ox = b.x, oy = b.y;
          const nx = ox + (cx - ox) * k * 0.4, ny = oy + (cy - oy) * k * 0.4;
          const dx = nx - ox, dy = ny - oy;
          if (b.segs) for (const s of b.segs) { s.x += dx; s.y += dy; }
          b.x = nx; b.y = ny;
          for (const c of b.cores) { c.x += dx; c.y += dy; }
        }
        if (Math.random() < 0.6) {
          const a = Math.random() * TAU, r = Math.max(this.w, this.h) * 0.6;
          this.fx.particle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, -Math.cos(a) * 900, -Math.sin(a) * 900, 0.6, 2, C.gold, 0, 0);
        }
        this.shake(1.2);
        if (u.t >= P.ULT200_PULL) { u.phase = 2; u.t = 0; this.ui.cutin('swipe', '一閃せよ！！', 'SWIPE ACROSS!!', P.ULT200_SWIPE); }
      } else if (u.phase === 2) {
        if (u.t >= P.ULT200_SWIPE) this.ult200Trigger();
      } else if (u.phase === 3) {
        if (!u.boomed && u.t >= P.ULT200_SILENCE) { u.boomed = true; this._supernova(); }
        if (u.t >= P.ULT200_SILENCE + 0.9) {
          this.ultMode = null;
          this.ult = null;
          this.player.invuln = 1.0;
          for (const b of this.bosses) if (b.stun > 4) b.stun = 4;
        }
      }
    }

    ult200Trigger() {
      const u = this.ult;
      if (!u || u.phase !== 2) return;
      u.phase = 3;
      u.t = 0;
      this.ui.hideCutin();
      // 画面全体が中央の斬撃線で上下2つにガクッとズレる
      const cx = this.w / 2, cy = this.h / 2;
      this.renderer.addSplit(cx - this.w, cy, cx + this.w, cy, 46, 0.7);
      const s = this.renderer.splits[this.renderer.splits.length - 1];
      s.hold = P.ULT200_SILENCE;
      const beam = this.fx.beam(cx, cy, 30, 0.5, C.gold, false, 0);
      beam.len = this.w * 1.5;
      this.audio.playUlt200Slash();
      this.audio.duck(1.2);
    }

    _supernova() {
      const cx = this.w / 2, cy = this.h / 2;
      const atk = this.atk();
      const dmg = P.ULT200_DAMAGE * atk;
      const killsBefore = this.run.kills;
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        e.hp = Math.min(e.hp, dmg * 0.5);
        this.dealDamage(e, Math.max(dmg, e.hp + 1), { src: 'ult', combo: 1, quiet: true }); // 雑魚・エリート確定即死
      }
      for (const b of this.bosses) {
        if (!b.lockable) continue;
        this.dealDamage(b, dmg, { src: 'ult', combo: 5 });
        if (!b.executing) b.stunFor(4, true);
      }
      for (const b of this.bullets) b.dead = true;
      // 魂ジェムの噴水
      const n = Math.min(220, P.GEM_MAX - this.gems.length);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + U.rand(-1.3, 1.3), s = U.rand(250, 900);
        this.gems.push(new E.SoulGem(cx, cy, 0.5, Math.cos(a) * s, Math.sin(a) * s));
      }
      this.audio.playSupernova();
      this.doHitstop(P.HITSTOP_BIG);
      this.shake(P.SHAKE_MAX);
      this.punchZoom(P.ZOOM_PUNCH_MAX);
      this.renderer.doFlash(1.0, C.gold);
      for (let i = 0; i < 5; i++) this.fx.ring(cx, cy, 20, 160 + i * 140, 0.5 + i * 0.15, i % 2 ? C.crimson : C.gold, 10 - i);
      this.fx.sparks(cx, cy, 120, C.gold, 1100, 1.2);
      this.fx.sparks(cx, cy, 80, C.crimson, 900, 1.0);
      this.fx.decal(cx, cy, 300, 'scorch');
      const kills = this.run.kills - killsBefore;
      this.fx.callout(cx, cy - 90, '絶・虚空一文字!!', 'rainbow', Math.min(64, this.w / 9), this.realTime);
      if (kills) this.fx.text(cx, cy - 40, `${kills} 体 同時撃破`, '#FFFFFF', 22, 'info', 1.6);
    }

    /* 第弐奥義 漆黒の太陽（Layer 7） */
    drawUltWorld(ctx, pal) {
      if (this.ultMode !== 'ult200' || !this.ult) return;
      const u = this.ult;
      if (u.phase === 3 && u.boomed) return;
      const cx = this.w / 2, cy = this.h / 2;
      const grow = u.phase === 1 ? U.easeOutCubic(Math.min(1, u.t / 0.6)) : 1;
      const R = 80 * grow + (u.phase === 2 ? Math.sin(this.realTime * 20) * 3 : 0);
      ctx.save();
      ctx.translate(cx, cy);
      // コロナ
      ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(this.realTime * 0.8);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        const L = R * (1.5 + Math.sin(this.realTime * 7 + i) * 0.3);
        ctx.strokeStyle = U.rgba(i % 3 ? C.gold : C.crimson, 0.45);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.stroke();
      }
      ctx.fillStyle = U.rgba(C.gold, 0.35);
      ctx.beginPath(); ctx.arc(0, 0, R * 1.18, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    /* 第弐奥義ガイドライン・処刑タイマー（Layer 12） */
    drawUltScreen(ctx, pal, w, h) {
      if (this.ultMode === 'ult200' && this.ult && this.ult.phase === 2) {
        const p = this.ult.t / P.ULT200_SWIPE;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const y = h / 2;
        ctx.fillStyle = U.rgba(C.gold, 0.25 + Math.sin(this.realTime * 18) * 0.1);
        ctx.fillRect(0, y - 8, w, 16);
        ctx.fillStyle = C.gold;
        ctx.fillRect(0, y - 1.5, w, 3);
        // 矢印
        const ax = (this.realTime * 900) % (w + 200) - 100;
        ctx.beginPath(); ctx.moveTo(ax + 30, y); ctx.lineTo(ax, y - 16); ctx.lineTo(ax, y + 16); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(0, h - 6, w * (1 - p), 6);
        ctx.restore();
      }
      if (this.state === STATE.BOSS_EXECUTION && this.exec && !this.exec.finished) {
        const p = Math.min(1, this.exec.t / P.EXECUTION_TIME);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(w * 0.2, h - 30, w * 0.6, 10);
        ctx.fillStyle = p >= 1 ? C.gold : C.crimson;
        ctx.fillRect(w * 0.2, h - 30, w * 0.6 * (1 - p), 10);
        ctx.font = '900 16px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(p >= 1 ? '指を離して納刀せよ！' : `百裂斬り ${this.exec.hits} HIT  ― なぞれ！叩け！`, w / 2, h - 40);
        ctx.restore();
      }
      if (this.ultMode === 'ult100' && this.ult) {
        const p = this.ult.t / P.ULT100_DURATION;
        ctx.fillStyle = C.crimson;
        ctx.fillRect(0, 0, w * (1 - p), 5);
      }
    }

    /* ロックオン接続線・予測ルート・番号バッジ（Layer 8） */
    drawLockOverlay(ctx, pal) {
      const inp = this.input;
      const m = inp.mode;
      if (m !== 'aim' && m !== 'iaiDash' && m !== 'sheathe') return;
      const list = m === 'aim' ? inp.lockList : (this.iai ? this.iai.targets : []);
      const t = this.realTime;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // 一筆書きの軌跡
      if (m === 'aim' && inp.path.length > 1) {
        ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
        const path = inp.path;
        const draw = (wd, style) => {
          ctx.strokeStyle = style; ctx.lineWidth = wd;
          ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
          ctx.lineTo(inp.cx, inp.cy);
          ctx.stroke();
        };
        draw(10, U.rgba(C.cyan, 0.12));
        draw(3, U.rgba(C.cyan, 0.6));
        draw(1.2, 'rgba(255,255,255,0.9)');
        ctx.globalCompositeOperation = 'source-over';
      }
      // ダイレクト照準サークル（カーソル／指の位置そのもの。帯電時は黄金で拡大）
      if (m === 'aim') {
        const R = this.lockRadius();
        const cc = this.activeCharge ? C.gold : C.cyan;
        ctx.save();
        ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
        ctx.fillStyle = colA(pal, cc, 0.07);
        ctx.beginPath(); ctx.arc(inp.cx, inp.cy, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = colA(pal, cc, 0.75);
        ctx.lineWidth = 1.6;
        ctx.setLineDash([10, 7]);
        ctx.lineDashOffset = -t * 40;
        ctx.beginPath(); ctx.arc(inp.cx, inp.cy, R, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(inp.cx - 8, inp.cy); ctx.lineTo(inp.cx + 8, inp.cy);
        ctx.moveTo(inp.cx, inp.cy - 8); ctx.lineTo(inp.cx, inp.cy + 8);
        ctx.stroke();
        ctx.restore();
      }
      // 黄金とシアンのレーザーライン：自機 → ロック1体目 → 2体目 → … → 現在のカーソル
      if (list.length || m === 'aim') {
        const start = m === 'aim' ? 0 : (this.iai ? this.iai.idx : 0);
        const laser = (wd, style) => {
          ctx.strokeStyle = style; ctx.lineWidth = wd;
          ctx.beginPath();
          ctx.moveTo(this.player.x, this.player.y);
          for (let i = start; i < list.length; i++) ctx.lineTo(list[i].x, list[i].y);
          if (m === 'aim') ctx.lineTo(inp.cx, inp.cy);
          ctx.stroke();
        };
        ctx.save();
        ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
        const a = m === 'aim' ? 1 : 0.45;
        laser(7, colA(pal, C.gold, 0.16 * a));
        laser(2.4, colA(pal, C.gold, 0.7 * a));
        ctx.setLineDash([5, 9]);
        ctx.lineDashOffset = -t * 120;
        laser(1.4, colA(pal, C.cyan, 0.95 * a));
        ctx.setLineDash([]);
        ctx.restore();
      }
      if (list.length) {
        // 照準（回転菱形＋番号バッジ）
        const firstIdx = new Map();
        const counts = new Map();
        list.forEach((o, i) => { if (!firstIdx.has(o)) firstIdx.set(o, i + 1); counts.set(o, (counts.get(o) || 0) + 1); });
        let drawn = 0;
        ctx.font = '800 11px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const [o, idx] of firstIdx) {
          if (o.dead) continue;
          if (drawn++ > 160) break;
          const r = (o.r || 10) + 8;
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.rotate(t * 3 + idx);
          ctx.strokeStyle = pal.inv ? C.crimson : C.cyan;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
          ctx.stroke();
          ctx.restore();
          const label = counts.get(o) > 1 ? `#${idx}×${counts.get(o)}` : `#${idx}`;
          const bx = o.x + r * 0.9, by = o.y - r * 0.9;
          const tw = ctx.measureText(label).width + 8;
          ctx.fillStyle = pal.inv ? C.crimson : 'rgba(0,30,40,0.85)';
          ctx.fillRect(bx - tw / 2, by - 7, tw, 14);
          ctx.strokeStyle = pal.inv ? C.ink : C.cyan;
          ctx.lineWidth = 1;
          ctx.strokeRect(bx - tw / 2, by - 7, tw, 14);
          ctx.fillStyle = pal.inv ? '#fff' : '#E8FEFF';
          ctx.fillText(label, bx, by + 0.5);
        }
      }
      // ロック数カウンター（カーソル横）
      if (m === 'aim' && list.length) {
        ctx.font = '900 22px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
        const s = `${list.length} LOCK`;
        const tw = ctx.measureText(s).width;
        const flip = inp.cx + 18 + tw > this.w - 8;
        const lx = flip ? inp.cx - 18 - tw : inp.cx + 18;
        const ly = U.clamp(inp.cy - 40, 24, this.h - 10);
        ctx.textAlign = 'left';
        ctx.lineWidth = 4;
        ctx.strokeStyle = pal.inv ? '#fff' : '#000';
        ctx.strokeText(s, lx, ly);
        ctx.fillStyle = pal.inv ? C.crimson : C.cyan;
        ctx.fillText(s, lx, ly);
      }
      ctx.restore();
      function colA(pl, c, a) { return pl.inv ? `rgba(255,30,66,${a})` : U.rgba(c, a); }
    }

    /* ------------------------------------------------------------------
     * レベルアップ（3択スキル）
     * ---------------------------------------------------------------- */
    openLevelUp() {
      const run = this.run;
      const choices = [];
      // 極意進化：確定枠
      for (const aw of CFG.AWAKENINGS) {
        if (!run.awakenings.has(aw.id) && aw.check(this)) choices.push({ kind: 'awaken', data: aw });
      }
      choices.splice(3);
      const base = U.shuffle(CFG.SKILLS.filter((s) => (run.skills[s.id] || 0) < 5));
      for (const s of base) { if (choices.length >= 3) break; choices.push({ kind: 'skill', data: s }); }
      const fill = U.shuffle(CFG.FILLER_CARDS.slice());
      for (const f of fill) { if (choices.length >= 3) break; choices.push({ kind: 'filler', data: f }); }
      this.levelChoices = choices;
      this.state = STATE.LEVEL_UP;
      // 誤タップ防止：開いてから450msは全入力を無視
      this.levelUpOpenTimestamp = performance.now();
      this.input.mode = 'idle';
      this.audio.playLevelUp();
      this.ui.showLevelUp(choices, run.level);
    }

    chooseLevelUp(i) {
      if (this.state !== STATE.LEVEL_UP || !this.levelChoices || !this.levelChoices[i]) return;
      if (performance.now() - this.levelUpOpenTimestamp < P.LEVELUP_LOCK_MS) return;
      const c = this.levelChoices[i];
      const run = this.run;
      if (c.kind === 'skill') {
        run.skills[c.data.id] = (run.skills[c.data.id] || 0) + 1;
        this.audio.playUiClick();
      } else if (c.kind === 'awaken') {
        run.awakenings.add(c.data.id);
        this.audio.playAwaken();
        this.renderer.doFlash(0.5, C.gold);
        this.later(0.05, () => this.fx.callout(this.w / 2, this.h * 0.3, c.data.name.replace('【極意】', '極意・'), C.gold, Math.min(40, this.w / 16), this.realTime), true);
      } else {
        if (c.data.id === 'heal') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
        else if (c.data.id === 'ultCharge') this.addUlt(35);
        else if (c.data.id === 'scoreBlessing') run.score += Math.round(5000 * this.rank.mult);
        this.audio.playUiClick();
      }
      run.pendingLevelUps--;
      this.ui.hideLevelUp();
      this.levelChoices = null;
      this.state = STATE.PLAYING;
      this.input.down = false;
      this.input.pointerId = null;
      this.player.invuln = Math.max(this.player.invuln, 0.6);
      this.ui.refreshSkills();
    }

    /* ------------------------------------------------------------------
     * リザルト
     * ---------------------------------------------------------------- */
    _finishRun(cleared) {
      const run = this.run;
      const coins = CFG.coinsFor(run.score, run.kills, run.bossKills);
      const s = this.save;
      s.soulCoins += coins;
      const newHigh = run.score > s.highScore;
      s.highScore = Math.max(s.highScore, run.score);
      s.maxChainRecord = Math.max(s.maxChainRecord, run.maxChain);
      if (cleared && this.stageIndex < 3) s.clearedStages[this.stageIndex] = true;
      this.saveMgr.save();
      return { coins, newHigh };
    }

    stageClear() {
      this.state = STATE.STAGE_CLEAR;
      this.cancelAim();
      this.audio.stopBgm();
      const r = this._finishRun(true);
      this.ui.showResult(true, r);
    }

    gameOver() {
      this.state = STATE.GAME_OVER;
      this.cancelAim();
      this.ultMode = null;
      this.pal.inv = false;
      this.audio.stopBgm();
      const pl = this.player;
      this.fx.inkBurst(pl.x, pl.y, 40, 400);
      this.fx.sparks(pl.x, pl.y, 40, C.crimson, 500, 0.8);
      this.renderer.doFlash(0.5, C.crimson);
      const r = this._finishRun(false);
      setTimeout(() => this.ui.showResult(false, r), 600);
    }
  }

  /* ========================================================================
   * UI：DOM オーバーレイ管理
   * ====================================================================== */
  class UI {
    constructor(game) {
      this.g = game;
      this.cache = {};
      this.el = {
        hud: $('hud'), title: $('screen-title'), dojo: $('screen-dojo'), levelup: $('screen-levelup'),
        result: $('screen-result'), pause: $('screen-pause'), cutin: $('cutin'),
        score: $('hud-score'), level: $('hud-level'), xpFill: $('hud-xp-fill'), hp: $('hud-hp'),
        ultFill: $('hud-ult-fill'), ultText: $('hud-ult-text'), ultBox: $('hud-ult'),
        stage: $('hud-stage'), timer: $('hud-timer'), timerBox: $('hud-timer-box'),
        boss: $('hud-boss'), bossName: $('hud-boss-name'), bossFill: $('hud-boss-fill'), bossCores: $('hud-boss-cores'),
        rank: $('hud-rank'), rankName: $('hud-rank-name'), combo: $('hud-combo'), comboFill: $('hud-combo-fill'), phase: $('hud-phase'),
        skills: $('hud-skills'), ultBtn: $('btn-ult'), focus: $('hud-focus-fill')
      };
      this._bind();
      this.cutinTimer = null;
    }

    _bind() {
      const g = this.g;
      const click = (id, fn) => {
        const el = $(id);
        if (el) el.addEventListener('click', (e) => { e.preventDefault(); g.audio.init(); g.audio.playUiClick(); fn(e); });
      };
      click('btn-dojo', () => this.openDojo());
      click('btn-dojo-close', () => this.closeDojo());
      click('btn-mute', () => this.toggleMute());
      click('btn-mute-title', () => this.toggleMute());
      click('btn-pause', () => g.setPaused(!g.paused));
      click('btn-resume', () => g.setPaused(false));
      click('btn-pause-retry', () => { g.setPaused(false); g.audio.setPaused(false); this.hideAll(); g.startStage(g.stageIndex); });
      click('btn-pause-title', () => { g.setPaused(false); g.goTitle(); });
      click('btn-result-next', () => {
        const next = g.stageIndex < 2 ? g.stageIndex + 1 : 3;
        this.hideAll();
        g.startStage(next);
      });
      click('btn-result-dojo', () => { g.goTitle(); this.openDojo(); });
      click('btn-result-retry', () => { this.hideAll(); g.startStage(g.stageIndex); });
      click('btn-result-title', () => g.goTitle());
      const ult = this.el.ultBtn;
      ult.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); g.audio.init(); g.tryUltimate(); });
    }

    hideAll() {
      for (const k of ['title', 'dojo', 'levelup', 'result', 'pause']) this.el[k].classList.remove('show');
    }

    toggleMute() {
      const m = this.g.audio.toggleMute();
      document.querySelectorAll('.mute-btn').forEach((b) => { b.textContent = m ? '♪ OFF' : '♪ ON'; b.classList.toggle('off', m); });
    }

    showTitle() {
      this.hideAll();
      this.el.hud.classList.remove('show');
      this.hideCutin();
      const s = this.g.save;
      $('title-high').textContent = s.highScore.toLocaleString();
      $('title-chain').textContent = s.maxChainRecord.toLocaleString();
      $('title-coins').textContent = s.soulCoins.toLocaleString();
      const b = CFG.BLADES[s.selectedBlade];
      $('title-blade').textContent = b.name;
      $('title-blade').style.color = b.color;
      const wrap = $('stage-cards');
      wrap.innerHTML = '';
      CFG.STAGES.forEach((st, i) => {
        const locked = st.key === 'ex' && !s.clearedStages[2] && !s.endlessSwitch;
        const card = document.createElement('button');
        card.className = `stage-card theme-${st.theme}${locked ? ' locked' : ''}${s.clearedStages[i] ? ' cleared' : ''}`;
        card.innerHTML = `<span class="sc-act">${st.act}</span><span class="sc-name">${st.name}</span>` +
          `<span class="sc-meta">${isFinite(st.duration) ? U.fmtTime(st.duration) + ' ＋ ボス' : '時間無制限・90秒ごとにボス乱入'}</span>` +
          `<span class="sc-boss">${st.boss ? 'BOSS：' + CFG.BOSSES[st.boss].name : '歴代ボス強化版が乱入'}</span>` +
          (locked ? '<span class="sc-lock">最終幕クリア or 修羅の門スイッチで解放</span>' : '') +
          (s.clearedStages[i] ? '<span class="sc-clear">踏破</span>' : '');
        card.addEventListener('click', () => {
          this.g.audio.init();
          if (locked) { this.g.audio.playUiDeny(); card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 400); return; }
          this.g.audio.playUiClick();
          this.hideAll();
          this.g.startStage(i);
        });
        card.addEventListener('mouseenter', () => { this.g.stage = st; });
        wrap.appendChild(card);
      });
      const sw = $('ex-switch');
      if (sw) {
        sw.checked = !!s.endlessSwitch;
        sw.onchange = () => { s.endlessSwitch = sw.checked; this.g.saveMgr.save(); this.g.audio.init(); this.g.audio.playUiClick(); this.showTitle(); };
      }
      const muted = this.g.audio.muted;
      document.querySelectorAll('.mute-btn').forEach((bt) => { bt.textContent = muted ? '♪ OFF' : '♪ ON'; bt.classList.toggle('off', muted); });
      this.el.title.classList.add('show');
    }

    openDojo() {
      this.g.state = STATE.DOJO;
      this.hideAll();
      this.renderDojo();
      this.el.dojo.classList.add('show');
    }

    closeDojo() {
      this.g.state = STATE.TITLE;
      this.showTitle();
    }

    renderDojo() {
      const g = this.g, s = g.save;
      $('dojo-coins').textContent = s.soulCoins.toLocaleString();
      const bw = $('dojo-blades');
      bw.innerHTML = '';
      CFG.BLADE_ORDER.forEach((id) => {
        const b = CFG.BLADES[id];
        const owned = s.unlockedBlades.includes(id);
        const sel = s.selectedBlade === id;
        const card = document.createElement('div');
        card.className = `blade-card${sel ? ' selected' : ''}${owned ? '' : ' locked'}`;
        card.style.setProperty('--blade', b.color);
        card.style.setProperty('--blade2', b.core);
        card.innerHTML = `<div class="blade-preview"><span></span></div>` +
          `<div class="blade-name">${b.name}</div><div class="blade-en">${b.en}</div>` +
          `<div class="blade-style">【${b.style}】</div><div class="blade-desc">${b.desc}</div>`;
        const btn = document.createElement('button');
        btn.className = 'btn small';
        if (sel) { btn.textContent = '装備中'; btn.disabled = true; }
        else if (owned) { btn.textContent = '装備する'; }
        else { btn.textContent = `解放 ${b.cost.toLocaleString()}両`; if (s.soulCoins < b.cost) btn.classList.add('poor'); }
        btn.addEventListener('click', () => {
          g.audio.init();
          if (sel) return;
          if (!owned) {
            if (s.soulCoins < b.cost) { g.audio.playUiDeny(); return; }
            s.soulCoins -= b.cost;
            s.unlockedBlades.push(id);
            g.audio.playLevelUp();
          } else g.audio.playUiClick();
          s.selectedBlade = id;
          g.saveMgr.save();
          this.renderDojo();
        });
        card.appendChild(btn);
        bw.appendChild(card);
      });
      const uw = $('dojo-upgrades');
      uw.innerHTML = '';
      CFG.DOJO_UPGRADES.forEach((u) => {
        const lv = s.dojoLevels[u.id] || 0;
        const max = lv >= CFG.DOJO_MAX;
        const cost = max ? 0 : CFG.DOJO_COSTS[lv];
        const row = document.createElement('div');
        row.className = 'upgrade-row';
        let pips = '';
        for (let i = 0; i < CFG.DOJO_MAX; i++) pips += `<i class="${i < lv ? 'on' : ''}"></i>`;
        row.innerHTML = `<div class="up-name">【${u.name}】<small>${u.sub}</small></div>` +
          `<div class="up-pips">${pips}</div><div class="up-val">${u.fmt(lv)}${max ? '' : ` → <b>${u.fmt(lv + 1).replace(/^[^+]*/, '')}</b>`}</div>`;
        const btn = document.createElement('button');
        btn.className = 'btn small';
        if (max) { btn.textContent = '極'; btn.disabled = true; }
        else { btn.textContent = `${cost.toLocaleString()}両`; if (s.soulCoins < cost) btn.classList.add('poor'); }
        btn.addEventListener('click', () => {
          g.audio.init();
          if (max) return;
          if (s.soulCoins < cost) { g.audio.playUiDeny(); return; }
          s.soulCoins -= cost;
          s.dojoLevels[u.id] = lv + 1;
          g.saveMgr.save();
          g.audio.playLevelUp();
          this.renderDojo();
        });
        row.appendChild(btn);
        uw.appendChild(row);
      });
    }

    showHud() {
      this.hideAll();
      this.cache = {};
      this.el.hud.classList.add('show');
      this.el.stage.textContent = `${this.g.stage.act}　${this.g.stage.name}`;
      this.refreshSkills();
    }

    showPause(p) {
      this.el.pause.classList.toggle('show', p);
    }

    _set(key, val, fn) {
      if (this.cache[key] === val) return;
      this.cache[key] = val;
      fn(val);
    }

    updateHud() {
      const g = this.g;
      const run = g.run;
      if (!run || !g.player) return;
      const el = this.el;
      this._set('score', run.score, (v) => { el.score.textContent = v.toLocaleString(); });
      this._set('level', run.level, (v) => { el.level.textContent = `Lv ${v}`; });
      this._set('xp', Math.round(run.xp / run.xpNext * 200), (v) => { el.xpFill.style.width = `${v / 2}%`; });
      this._set('hp', `${g.player.hp}/${g.player.maxHp}`, () => {
        let h = '';
        for (let i = 0; i < g.player.maxHp; i++) h += `<i class="${i < g.player.hp ? 'on' : ''}"></i>`;
        el.hp.innerHTML = h;
      });
      this._set('focus', Math.round(g.focus / g.focusMax() * 100), (v) => { el.focus.style.width = `${v}%`; });
      const ult = Math.floor(g.ultGauge);
      this._set('ult', ult, (v) => {
        el.ultFill.style.width = `${v / 2}%`;
        el.ultText.textContent = `${v}%`;
        el.ultBox.classList.toggle('ready', v >= 100 && v < 200);
        el.ultBox.classList.toggle('over', v >= 200);
        el.ultBtn.classList.toggle('show', v >= 100);
        el.ultBtn.classList.toggle('over', v >= 200);
        el.ultBtn.querySelector('.ult-name').textContent = v >= 200 ? '第弐奥義 絶・虚空一文字' : '第壱奥義 千本桜・墨嵐';
      });
      // 中央上：タイマー or ボスHP
      const boss = g.bosses.find((b) => !b.dead);
      if (boss) {
        this._set('bossMode', 1, () => { el.boss.classList.add('show'); el.timerBox.classList.add('hide'); });
        this._set('bossName', boss.name, (v) => { el.bossName.textContent = v; });
        this._set('bossHp', Math.round(boss.hp / boss.maxHp * 1000), (v) => { el.bossFill.style.width = `${v / 10}%`; });
        const cs = boss.cores.map((c) => (c.broken ? 0 : 1)).join('');
        this._set('bossCores', cs, () => {
          el.bossCores.innerHTML = boss.cores.map((c) => `<i class="${c.broken ? 'broken' : ''}"></i>`).join('') + `<span>弱点核 ${boss.coresAlive.length}/${boss.cores.length}</span>`;
        });
      } else {
        this._set('bossMode', 0, () => { el.boss.classList.remove('show'); el.timerBox.classList.remove('hide'); });
        const tl = g.stage.key === 'ex' ? `${U.fmtTime(run.stageTime).replace('∞', '')}` : U.fmtTime(run.timeLeft);
        this._set('timer', tl, (v) => { el.timer.textContent = g.stage.key === 'ex' ? `経過 ${v}` : v; });
        this._set('timerWarn', g.stage.key !== 'ex' && run.timeLeft < 15, (v) => el.timer.classList.toggle('warn', v));
      }
      // 右上：ランク・コンボ
      const r = g.rank;
      this._set('rank', r.id, () => {
        el.rank.textContent = r.id;
        el.rank.className = `rank-badge rank-${r.id}`;
        el.rankName.textContent = r.id === 'SSS' ? `${r.name} ${r.en}` : `${r.name} ${r.en}`;
      });
      this._set('combo', run.combo, (v) => { el.combo.innerHTML = `${v}<small> CHAIN</small>`; });
      this._set('comboT', Math.round(run.comboTimer / r.grace * 100), (v) => { el.comboFill.style.width = `${run.combo > 0 ? v : 0}%`; });
      this._set('phase', r.phase, (v) => {
        el.phase.textContent = `${CFG.PHASE_LABELS[v].en}：${CFG.PHASE_LABELS[v].jp}`;
        el.phase.className = `phase phase-${v}`;
      });
    }

    rankChanged(up) {
      const el = this.el.rank;
      if (!el) return;
      el.classList.remove('bump');
      void el.offsetWidth;
      if (up) el.classList.add('bump');
    }

    refreshSkills() {
      const g = this.g;
      const run = g.run;
      const w = this.el.skills;
      if (!run) { w.innerHTML = ''; return; }
      let h = '';
      for (const s of CFG.SKILLS) {
        const lv = run.skills[s.id] || 0;
        if (!lv) continue;
        h += `<div class="skill-badge" title="${s.name}"><span class="sk-icon">${s.icon}</span><span class="sk-lv">${lv >= 5 ? 'MAX' : 'Lv' + lv}</span></div>`;
      }
      for (const a of CFG.AWAKENINGS) {
        if (!run.awakenings.has(a.id)) continue;
        h += `<div class="skill-badge awaken" title="${a.name}"><span class="sk-icon">${a.icon}</span><span class="sk-lv">極意</span></div>`;
      }
      w.innerHTML = h;
    }

    showLevelUp(choices, level) {
      const wrap = $('levelup-cards');
      $('levelup-title').textContent = `LEVEL UP!!  Lv ${level - this.g.run.pendingLevelUps + 1}`;
      wrap.innerHTML = '';
      choices.forEach((c, i) => {
        const card = document.createElement('button');
        const g = this.g;
        let cls = 'skill-card', icon = '', name = '', lvText = '', desc = '';
        if (c.kind === 'skill') {
          const cur = g.run.skills[c.data.id] || 0;
          icon = c.data.icon; name = c.data.name;
          lvText = cur === 0 ? 'NEW' : `Lv${cur} → Lv${cur + 1}${cur + 1 === 5 ? ' (MAX)' : ''}`;
          desc = c.data.levelDesc(cur + 1);
          const aw = CFG.AWAKENINGS.find((a) => a.base === c.data.id);
          if (aw) desc += `<small class="aw-hint">極意条件：${aw.cond}</small>`;
        } else if (c.kind === 'awaken') {
          cls += ' awaken';
          icon = c.data.icon; name = c.data.name; lvText = '極意進化 AWAKENING'; desc = c.data.desc;
        } else {
          cls += ' filler';
          icon = c.data.icon; name = c.data.name; lvText = '補給'; desc = c.data.desc;
        }
        card.className = cls;
        card.innerHTML = `<span class="key">${i + 1}</span><span class="card-icon">${icon}</span>` +
          `<span class="card-name">${name}</span><span class="card-lv">${lvText}</span><span class="card-desc">${desc}</span>`;
        card.addEventListener('click', (e) => { e.preventDefault(); this.g.chooseLevelUp(i); });
        wrap.appendChild(card);
      });
      // 0.45秒の入力ロック：黄金バーが満タンになるとカード枠が発光して選択可能に
      const lv = this.el.levelup;
      lv.classList.remove('unlocked');
      const bar = $('levelup-lock-fill');
      const label = $('levelup-lock-label');
      label.textContent = `準備完了まで ${(P.LEVELUP_LOCK_MS / 1000).toFixed(2)}s`;
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth;
      bar.style.transition = `width ${P.LEVELUP_LOCK_MS}ms linear`;
      bar.style.width = '100%';
      clearTimeout(this.lockTimer);
      this.lockTimer = setTimeout(() => { lv.classList.add('unlocked'); label.textContent = '選択可能！'; }, P.LEVELUP_LOCK_MS);
      lv.classList.add('show');
    }

    /* 秘伝開眼スロット（ゲームは止めない） */
    showSlot(prize) {
      const el = $('slot');
      const reels = el.querySelectorAll('.reel');
      const symbols = ['閃', '天', '鬼', '雷', '魂', '極', '斬'];
      const finalSym = { issen: ['閃', '閃', '閃'], niten: ['天', '天', '天'], kishin: ['鬼', '鬼', '鬼'] }[prize.id];
      el.className = 'slot show spinning';
      $('slot-result').textContent = '';
      $('slot-detail').textContent = '';
      clearInterval(this.slotSpin);
      const t0 = performance.now();
      const dur = P.SCROLL_SLOT_TIME * 1000;
      this.slotSpin = setInterval(() => {
        const el2 = performance.now() - t0;
        reels.forEach((r, i) => {
          const stopAt = dur * (0.55 + i * 0.2);
          if (el2 >= stopAt) { r.textContent = finalSym[i]; r.classList.add('stopped'); }
          else { r.textContent = symbols[(Math.random() * symbols.length) | 0]; r.classList.remove('stopped'); }
        });
        if (el2 >= dur) clearInterval(this.slotSpin);
      }, 55);
    }

    showSlotResult(prize, gained) {
      const el = $('slot');
      el.className = `slot show win win-${prize.id}`;
      el.querySelectorAll('.reel').forEach((r) => r.classList.add('stopped'));
      $('slot-result').textContent = `${prize.name}！！`;
      $('slot-detail').textContent = gained.join(' ／ ');
    }

    hideSlot() {
      clearInterval(this.slotSpin);
      $('slot').className = 'slot';
    }

    hideLevelUp() { this.el.levelup.classList.remove('show'); }

    cutin(kind, main, sub, dur) {
      const el = this.el.cutin;
      el.className = `cutin ${kind}`;
      el.innerHTML = `<div class="cutin-band"></div><div class="cutin-main">${main}</div><div class="cutin-sub">${sub}</div>`;
      void el.offsetWidth;
      el.classList.add('show');
      clearTimeout(this.cutinTimer);
      this.cutinTimer = setTimeout(() => this.hideCutin(), (dur || 1.5) * 1000);
    }

    hideCutin() {
      clearTimeout(this.cutinTimer);
      this.el.cutin.classList.remove('show');
    }

    showResult(cleared, info) {
      const g = this.g, run = g.run;
      this.el.hud.classList.remove('show');
      this.hideCutin();
      $('result-title').textContent = cleared ? (g.stageIndex === 2 ? '天下無双 ― 全幕踏破' : '幕　踏　破') : '討　死';
      $('result-title').className = cleared ? 'result-title clear' : 'result-title over';
      $('result-sub').textContent = cleared ? `${g.stage.act}『${g.stage.name}』 CLEAR` : `${g.stage.act}『${g.stage.name}』`;
      const rank = CFG.STYLE_RANKS[run.maxRankIdx];
      const coinsScore = Math.floor(run.score / 250), coinsKills = run.kills * 2, coinsBoss = run.bossKills * 300;
      const rows = [
        ['最終スコア', run.score, info.newHigh ? '<em>NEW RECORD!</em>' : ''],
        ['最大チェイン', run.maxChain, ''],
        ['撃破数', run.kills, ''],
        ['到達スタイルランク', null, `<span class="rank-inline rank-${rank.id}">${rank.id} ${rank.name}</span>`],
        ['獲得魂貨', info.coins, `<small>スコア${coinsScore} ＋ 撃破${coinsKills} ＋ ボス${coinsBoss}</small>`]
      ];
      const tb = $('result-stats');
      tb.innerHTML = '';
      rows.forEach((r, i) => {
        const div = document.createElement('div');
        div.className = 'stat-row';
        div.style.animationDelay = `${i * 0.12}s`;
        div.innerHTML = `<span class="stat-label">${r[0]}</span><span class="stat-val">${r[1] == null ? '' : '0'}</span><span class="stat-extra">${r[2]}</span>`;
        tb.appendChild(div);
        if (r[1] != null) this._countUp(div.querySelector('.stat-val'), r[1], 900 + i * 150, i === 4 ? '両' : '');
      });
      $('result-total-coins').textContent = g.save.soulCoins.toLocaleString();
      const next = $('btn-result-next');
      if (cleared && g.stageIndex < 2) { next.style.display = ''; next.textContent = '次の幕へ進む'; }
      else if (cleared && g.stageIndex === 2) { next.style.display = ''; next.textContent = '無限エンドレスへ'; }
      else next.style.display = 'none';
      this.el.result.classList.add('show');
    }

    _countUp(el, target, ms, suffix) {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        const v = Math.round(target * U.easeOutCubic(p));
        el.textContent = v.toLocaleString() + (suffix || '');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  /* ========================================================================
   * 起動
   * ====================================================================== */
  function boot() {
    const game = new Game();
    ZI.Game = {
      STATE, Game, SaveManager, UI, instance: game,
      /** audio.js のBGMキック発音時に呼ばれ、背景のビートシンク脈動と同期する */
      onBeatPulse: () => game.onBeatPulse()
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
