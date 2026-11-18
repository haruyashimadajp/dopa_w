window.ZetsuIssen = window.ZetsuIssen || {};

window.ZetsuIssen.Game = (() => {
  const Config = window.ZetsuIssen.Config;
  const Audio = window.ZetsuIssen.Audio;
  const Effects = window.ZetsuIssen.Effects;
  const Entities = window.ZetsuIssen.Entities;

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  let W = window.innerWidth;
  let H = window.innerHeight;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return dist(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return dist(px, py, ax + t * dx, ay + t * dy);
  }

  // ==========================================
  // 1. PERSISTENT SAVE DATA (localStorage)
  // ==========================================
  const SAVE_KEY = 'zetsu_issen_save_v2';
  const defaultSave = {
    soulCoins: 500,
    highScore: 0,
    maxChainRecord: 0,
    clearedStages: [false, false, false],
    unlockedBlades: ['byakuya'],
    selectedBlade: 'byakuya',
    selectedStage: 0,
    dojoLevels: {
      lockRadius: 0,
      focusMax: 0,
      attackPower: 0,
      maxHp: 0,
      xpGain: 0,
      startingUlt: 0
    }
  };

  let saveData = loadSave();
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultSave));
      const parsed = JSON.parse(raw);
      return {
        ...defaultSave,
        ...parsed,
        dojoLevels: { ...defaultSave.dojoLevels, ...(parsed.dojoLevels || {}) }
      };
    } catch (_) {
      return JSON.parse(JSON.stringify(defaultSave));
    }
  }

  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    } catch (_) {}
  }

  // ==========================================
  // 2. RUNTIME GAME STATE
  // ==========================================
  const state = {
    mode: 'TITLE', // TITLE | DOJO | PLAY | LEVELUP | RESULT
    stageIdx: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    maxComboTimer: 4.5,
    maxChainThisRun: 0,
    totalKills: 0,
    parryCount: 0,
    maxSingleIaiKills: 0,
    reachedRankS: false,
    rankIdx: 0,
    stylePhase: 1,
    stageTimer: 150,
    formationTimer: 0,
    formationCursor: 0,
    hitstop: 0,
    shake: 0,
    cameraZoom: 1.0,
    sheathePause: 0,
    pendingDetonation: null,
    chainSlowTimer: 0,
    // Ultimate 100% & 200% states
    ult100Timer: 0,
    ult200Phase: 0, // 0: off, 1: blackhole suction, 2: swipe wait
    ult200Timer: 0,
    // Level-Up 0.45s Anti-Misclick Guard
    levelUpOpenTime: 0,
    levelUpUnlocked: false,
    currentChoices: [],
    // Scroll Jackpot Banner
    jackpotTimer: 0,
    // Gem pickup streak
    gemStreak: 0,
    gemStreakTimer: 0
  };

  const player = {
    x: W / 2,
    y: H / 2,
    radius: Config.PARAMS.PLAYER_RADIUS,
    hp: 4,
    maxHp: 4,
    invuln: 0,
    level: 1,
    xp: 0,
    xpNext: 8,
    ultGauge: 0, // 0 to 200
    focus: 100,
    maxFocus: 100,
    focusRegen: 46,
    overheatTimer: 0,
    thunderCharge: 0, // 0 to 3 stacks from Action B
    activeChargedStacks: 0,
    trail: [],
    // Derived stats
    atk: 1.0,
    lockRadius: 52,
    magnetRadius: 190,
    explosionRadius: 95,
    bChainStreak: 0,
    skills: {},
    awakenedSkills: new Set(),
    // Pointer & Aiming
    pointerDown: false,
    pointerDownTime: 0,
    pointerDownX: 0,
    pointerDownY: 0,
    pointerX: W / 2,
    pointerY: H / 2,
    isAiming: false,
    aimPoints: [],
    lockedTargets: [],
    // High-speed 0.22s Iai Dash
    isDashing: false,
    dashQueue: [],
    dashTotal: 0,
    dashIndex: 0,
    dashStepDuration: 0.02,
    dashStepTimer: 0
  };

  const keys = {};
  let enemies = [];
  let bullets = [];
  let friendlyBlades = [];
  let gems = [];
  let scrolls = [];
  let boss = null;

  // Bind Audio beat callback to Effects beat pulse
  Audio.setOnBeatCallback((stylePhase) => {
    if (state.mode === 'PLAY') {
      Effects.onBeat(stylePhase);
    }
  });

  function getSelectedBlade() {
    return Config.BLADES.find((b) => b.id === saveData.selectedBlade) || Config.BLADES[0];
  }

  function getSelectedStage() {
    return Config.STAGES[state.stageIdx] || Config.STAGES[0];
  }

  function getCurrentRankObj() {
    let idx = 0;
    for (let i = 0; i < Config.STYLE_RANKS.length; i++) {
      if (state.combo >= Config.STYLE_RANKS[i].minCombo) idx = i;
    }
    return { idx, obj: Config.STYLE_RANKS[idx] };
  }

  function addShake(amt) {
    state.shake = Math.min(28, Math.max(state.shake, amt));
  }

  // ==========================================
  // 3. START / RESET STAGE
  // ==========================================
  function startGame(stageIndex = saveData.selectedStage) {
    Audio.init();
    state.stageIdx = stageIndex;
    saveData.selectedStage = stageIndex;
    writeSave();

    const stageObj = getSelectedStage();
    const blade = getSelectedBlade();
    const dojo = saveData.dojoLevels;

    state.mode = 'PLAY';
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.maxChainThisRun = 0;
    state.totalKills = 0;
    state.parryCount = 0;
    state.maxSingleIaiKills = 0;
    state.reachedRankS = false;
    state.rankIdx = 0;
    state.stylePhase = 1;
    state.stageTimer = stageObj.duration;
    state.formationTimer = 2.0;
    state.formationCursor = 0;
    state.hitstop = 0;
    state.shake = 0;
    state.cameraZoom = 1.0;
    state.sheathePause = 0;
    state.pendingDetonation = null;
    state.chainSlowTimer = 0;
    state.ult100Timer = 0;
    state.ult200Phase = 0;
    state.ult200Timer = 0;
    state.jackpotTimer = 0;

    player.x = W / 2;
    player.y = H * 0.70;
    player.pointerX = player.x;
    player.pointerY = player.y;
    player.maxHp = blade.hp + dojo.maxHp;
    player.hp = player.maxHp;
    player.invuln = 1.2;
    player.level = 1;
    player.xp = 0;
    player.xpNext = 8;
    player.ultGauge = dojo.startingUlt * 25;
    player.maxFocus = Math.round(100 * (1 + dojo.focusMax * 0.12));
    player.focus = player.maxFocus;
    player.focusRegen = 46 * (1 + dojo.focusMax * 0.12);
    player.overheatTimer = 0;
    player.thunderCharge = 0;
    player.activeChargedStacks = 0;
    player.trail = [];
    player.atk = blade.atk * (1 + dojo.attackPower * 0.15);
    player.lockRadius = Config.PARAMS.A_LOCK_RADIUS_BASE * blade.lockRadiusMult * (1 + dojo.lockRadius * 0.10);
    player.magnetRadius = 195 * (1 + dojo.xpGain * 0.18);
    player.explosionRadius = 98;
    player.bChainStreak = 0;
    player.skills = {};
    player.awakenedSkills = new Set();
    if (blade.startSkill) {
      player.skills[blade.startSkill] = 1;
    }

    player.pointerDown = false;
    player.isAiming = false;
    player.aimPoints = [];
    player.lockedTargets = [];
    player.isDashing = false;
    player.dashQueue = [];

    enemies = [];
    bullets = [];
    friendlyBlades = [];
    gems = [];
    scrolls = [];
    boss = null;
    Effects.reset();

    // Hide all overlays & show HUD
    document.getElementById('title-overlay').classList.add('hidden');
    document.getElementById('dojo-overlay').classList.add('hidden');
    document.getElementById('levelup-overlay').classList.add('hidden');
    document.getElementById('result-overlay').classList.add('hidden');
    document.getElementById('hud').classList.remove('hud-hidden');
    document.getElementById('boss-hud').classList.add('hidden');
    document.getElementById('jackpot-banner').classList.add('hidden');

    // Opening 0-Second 23-Target Double Ring Bonanza right in front of the player!
    Entities.spawnOpeningBonanza(W, H, player.x, player.y, enemies);
    Effects.spawnBrushCutIn('抜刀開戦', stageObj.name, '#00f0ff');

    Audio.setBgmIntensity(Config.STYLE_RANKS[0], 0);
    Audio.startBgm();
    renderSkillStrip();
    updateHud();
  }

  // ==========================================
  // 4. INPUT HANDLING: FLICK (B) vs DIRECT HOLD-DRAG (A)
  // ==========================================
  function onPointerDown(x, y) {
    if (state.mode !== 'PLAY') return;
    Audio.init();

    // If waiting for 200% Ultimate ('絶・虚空一文字') horizontal slash!
    if (state.ult200Phase === 2) {
      executeUlt200Supernova();
      return;
    }

    if (player.isDashing || state.sheathePause > 0) return;
    if (player.overheatTimer > 0) {
      Effects.addFloatingText(player.x, player.y - 24, '息切れ中！(敵弾かすりで即回復)', '#ff1e42', 14, -60);
      return;
    }

    player.pointerDown = true;
    player.pointerDownTime = performance.now();
    player.pointerDownX = x;
    player.pointerDownY = y;
    player.pointerX = x;
    player.pointerY = y;
  }

  function onPointerMove(x, y) {
    player.pointerX = x;
    player.pointerY = y;

    if (state.mode !== 'PLAY') return;

    // During 100% Ultimate ('千本桜・墨嵐'), moving cursor carves automatic Void Rifts!
    if (state.ult100Timer > 0) {
      if (Math.random() < 0.45) {
        const ang = Math.random() * Math.PI * 2;
        const len = 140 + Math.random() * 120;
        const x1 = x - Math.cos(ang) * len;
        const y1 = y - Math.sin(ang) * len;
        const x2 = x + Math.cos(ang) * len;
        const y2 = y + Math.sin(ang) * len;
        Effects.spawnSlashTrail(x1, y1, x2, y2, '#ffffff', '#ff1e42', 11, 0.35);
        Effects.spawnVoidRift(x1, y1, x2, y2, player.atk * 1.4, 0.9, false);
        Audio.playPinballSlash(state.combo, 2);
      }
      return;
    }

    if (!player.pointerDown || player.isDashing || state.sheathePause > 0) return;

    const heldMs = performance.now() - player.pointerDownTime;
    const dragDist = dist(player.pointerDownX, player.pointerDownY, x, y);

    // Transition into Action A (Bullet-Time Direct Cursor Lock-On)
    if (!player.isAiming && (heldMs >= Config.PARAMS.HOLD_THRESHOLD_MS || dragDist >= 75)) {
      enterBulletTimeAim(x, y);
    }

    if (player.isAiming) {
      updateBulletTimeAim(x, y);
    }
  }

  function onPointerUp(x, y) {
    if (!player.pointerDown) return;
    player.pointerDown = false;

    if (state.mode !== 'PLAY') return;
    if (state.ult200Phase === 2) {
      executeUlt200Supernova();
      return;
    }

    if (player.isAiming) {
      releaseIaiSlash();
    } else {
      // Short Tap / Flick -> Execute Action B: Rapid Pinball Slash ('迅雷')!
      executePinballSlashB(x, y);
    }
  }

  // ==========================================
  // 5. ACTION B: RAPID PINBALL SLASH ('迅雷') + FOCUS COST + THUNDER CHARGE
  // ==========================================
  function executePinballSlashB(targetX, targetY) {
    if (player.overheatTimer > 0 || player.isDashing) return;

    const blade = getSelectedBlade();
    const skillGodspeed = player.skills.godspeed || 0;
    const phaseDiscount = state.stylePhase === 3 ? 0.5 : 1.0;
    const cost = Config.PARAMS.B_FOCUS_COST * blade.bCostMult * Math.max(0.45, 1 - skillGodspeed * 0.1) * phaseDiscount;

    player.focus = Math.max(0, player.focus - cost);

    // Determine dash angle (if tap was close to player, dash toward cursor; if flicked, use flick vector)
    const flickD = dist(player.pointerDownX, player.pointerDownY, targetX, targetY);
    let angle = flickD > 24
      ? Math.atan2(targetY - player.pointerDownY, targetX - player.pointerDownX)
      : Math.atan2(targetY - player.y, targetX - player.x);

    const maxRange = Config.PARAMS.B_DISTANCE * (1 + skillGodspeed * 0.14 + Math.min(0.6, player.bChainStreak * 0.08));

    // Magnetic Homing Assist toward nearest enemy within cone
    let bestEnemy = null;
    let bestDist = Config.PARAMS.B_HOMING_RANGE * (1 + skillGodspeed * 0.12);
    enemies.forEach((e) => {
      if (e.dead) return;
      const d = dist(player.x, player.y, e.x, e.y);
      if (d <= bestDist) {
        const eAng = Math.atan2(e.y - player.y, e.x - player.x);
        const diff = Math.abs(Math.atan2(Math.sin(eAng - angle), Math.cos(eAng - angle)));
        if (diff <= 0.62) {
          bestDist = d;
          bestEnemy = e;
        }
      }
    });

    let nx, ny;
    if (bestEnemy) {
      angle = Math.atan2(bestEnemy.y - player.y, bestEnemy.x - player.x);
      const travel = Math.min(maxRange, dist(player.x, player.y, bestEnemy.x, bestEnemy.y) + 38);
      nx = player.x + Math.cos(angle) * travel;
      ny = player.y + Math.sin(angle) * travel;
    } else {
      nx = player.x + Math.cos(angle) * maxRange;
      ny = player.y + Math.sin(angle) * maxRange;
    }

    nx = Math.max(28, Math.min(W - 28, nx));
    ny = Math.max(36, Math.min(H - 36, ny));

    const ox = player.x;
    const oy = player.y;

    // Draw blazing neon slash ribbon
    const lineW = (blade.id === 'dankai' ? 14 : 8) * (state.stylePhase >= 2 ? 1.35 : 1.0);
    Effects.spawnSlashTrail(ox, oy, nx, ny, blade.colorCore, blade.colorGlow, lineW, state.stylePhase === 3 ? 1.15 : 0.55);

    // Phase 3 (Rank SS/SSS) or Awakened Shadow Clones add parallel slash lines
    const totalHits = blade.multiHit + (state.stylePhase === 3 ? 2 : 0) + (player.skills.shadow_clone || 0);
    if (totalHits > 1) {
      Effects.spawnSlashTrail(ox + 14, oy - 14, nx + 14, ny - 14, '#ffffff', '#ff1e42', 6, 0.5);
    }

    // Check hits along capsule segment (ox, oy) -> (nx, ny)
    const hitWidth = (blade.id === 'dankai' ? 62 : 42) * (state.stylePhase >= 2 ? 1.35 : 1.0);
    let hitCount = 0;
    let killCount = 0;

    // 1. Check enemies
    enemies.forEach((e) => {
      if (e.dead) return;
      if (pointToSegmentDist(e.x, e.y, ox, oy, nx, ny) <= e.radius + hitWidth) {
        hitCount++;
        // Counter-Slash 3x bonus if hitting Berserk Ronin during charge warning!
        const counterMult = e.type === 'ronin' && e.chargeWarningTimer > 0 ? 3.0 : 1.0;
        if (counterMult > 1) {
          Effects.addFloatingText(e.x, e.y - 26, 'カウンター一閃!! ×3', '#ffbe2e', 22, -100);
        }
        const dmg = player.atk * 1.45 * totalHits * counterMult;
        e.hp -= dmg;
        e.lastSlashAngle = angle;
        Effects.spawnParticles(e.x, e.y, 10, blade.colorGlow, 90, 320, 2, 5);
        if (e.hp <= 0) {
          killEnemy(e, angle, 1);
          killCount++;
        } else {
          incrementCombo(totalHits);
          Effects.addFloatingText(e.x, e.y - 14, `-${Math.round(dmg)}`, '#ffbe2e', 16, -75);
        }
      }
    });

    // 2. Check Boss body & Weak Cores
    if (boss) {
      if (pointToSegmentDist(boss.x, boss.y, ox, oy, nx, ny) <= boss.radius + hitWidth) {
        hitCount++;
        const dmg = player.atk * 1.5 * totalHits * (boss.stunTimer > 0 ? 1.8 : 1.0);
        damageBoss(dmg, angle);
      }
      boss.cores.forEach((c) => {
        if (!c.broken && pointToSegmentDist(c.x, c.y, ox, oy, nx, ny) <= c.radius + hitWidth) {
          hitCount++;
          damageBoss(player.atk * 1.2, angle);
        }
      });
    }

    // 3. Check Enemy Bullets (Parry into Friendly Homing Kunai!)
    bullets.forEach((b) => {
      if (!b.dead && pointToSegmentDist(b.x, b.y, ox, oy, nx, ny) <= b.radius + hitWidth) {
        b.dead = true;
        hitCount++;
        parryBullet(b.x, b.y, angle);
      }
    });

    // Move player
    player.x = nx;
    player.y = ny;
    player.invuln = Math.max(player.invuln, 0.26);

    // Spawn Void Rift (Action D) if Dankai blade, Phase 3, or Void Rift skill proc
    const voidLv = player.skills.void_rift || 0;
    if (blade.alwaysVoid || state.stylePhase === 3 || (voidLv > 0 && Math.random() < voidLv * 0.25)) {
      Effects.spawnVoidRift(ox, oy, nx, ny, player.atk * 0.9, 2.2 + voidLv * 0.3, player.awakenedSkills.has('awk_void'));
      Audio.playVoidSlash();
    }

    // Fire Crescent Sword Waves if skill unlocked
    spawnCrescentWaves(nx, ny, angle);

    if (hitCount > 0) {
      // Refund Focus, build Pinball streak, and add Thunder Charge stack!
      player.focus = Math.min(
        player.maxFocus,
        player.focus + Config.PARAMS.B_FOCUS_REFUND + killCount * Config.PARAMS.B_KILL_REFUND
      );
      player.bChainStreak++;
      if (player.thunderCharge < 3) {
        player.thunderCharge++;
        if (player.thunderCharge === 3) {
          Effects.addFloatingText(player.x, player.y - 30, '⚡ 迅雷MAX帯電（居合威力2倍！）⚡', '#ffbe2e', 18, -80);
        }
      }
      state.chainSlowTimer = Config.PARAMS.B_CHAIN_SLOW_TIME;
      state.hitstop = 0.025;
      addShake(6 + Math.min(10, hitCount * 1.5));
      Audio.playPinballSlash(state.combo, player.thunderCharge);

      // Phase 2+ (Awakened Rank A/S/SS/SSS): Pinball impact shockwave ring!
      if (state.stylePhase >= 2) {
        const waveR = 88 * (1 + (player.skills.crimson_nova || 0) * 0.22);
        Effects.spawnShockwave(nx, ny, waveR, blade.colorGlow, 4, 0.28);
        enemies.forEach((e) => {
          if (!e.dead && dist(nx, ny, e.x, e.y) <= waveR) {
            e.hp -= player.atk * 1.1;
            if (e.hp <= 0) killEnemy(e, angle, 1);
          }
        });
      }

      // Awakened Godspeed ('【極意】縮地・光速残像陣') auto-chains to a nearby enemy!
      if (player.awakenedSkills.has('awk_godspeed')) {
        triggerChainLightning(nx, ny, 3, player.atk * 1.4);
      }
    } else {
      // Missed! Reset B streak and check Overheat penalty
      player.bChainStreak = 0;
      Audio.playPinballSlash(0, 0);
      if (player.focus < 10) {
        player.overheatTimer = Config.PARAMS.OVERHEAT_DURATION;
        player.focus = 0;
        Effects.addFloatingText(player.x, player.y - 26, '息切れ OVERHEAT!', '#ff1e42', 18, -75);
      }
    }
  }

  // ==========================================
  // 6. ACTION A: BULLET-TIME DIRECT CURSOR LOCK-ON & 0.22s CAP IAI
  // ==========================================
  function enterBulletTimeAim(x, y) {
    player.isAiming = true;
    player.aimPoints = [{ x, y }];
    player.lockedTargets = [];
    enemies.forEach((e) => (e.lockCount = 0));
    bullets.forEach((b) => (b.locked = false));
    if (boss) boss.cores.forEach((c) => (c.locked = false));

    // Awakened Wide Iai ('【極意】森羅万象・全天ロック') auto-locks all enemies within 300px on hold start!
    if (player.awakenedSkills.has('awk_iai')) {
      Effects.spawnShockwave(x, y, 310, '#ffbe2e', 5, 0.35);
      enemies.forEach((e) => {
        if (!e.dead && dist(x, y, e.x, e.y) <= 310) {
          lockEnemyTarget(e);
        }
      });
    }

    scanDirectCursorForLocks(x, y, x, y);
  }

  function updateBulletTimeAim(x, y) {
    if (!player.isAiming) return;
    const last = player.aimPoints[player.aimPoints.length - 1] || { x, y };
    const d = dist(last.x, last.y, x, y);
    if (d < 5) return;

    const blade = getSelectedBlade();
    // Rank SSS (鬼神) makes Bullet-Time Iai cost ZERO Focus!
    if (state.rankIdx < 5) {
      const drain = d * Config.PARAMS.A_FOCUS_DRAIN_PER_PX * blade.aCostMult * (state.stylePhase === 3 ? 0.5 : 1.0);
      player.focus = Math.max(0, player.focus - drain);
      if (player.focus <= 0) {
        releaseIaiSlash();
        return;
      }
    }

    player.aimPoints.push({ x, y });
    if (player.aimPoints.length > 110) player.aimPoints.shift();

    scanDirectCursorForLocks(last.x, last.y, x, y);
  }

  function getEffectiveLockRadius() {
    const skillWide = player.skills.wide_iai || 0;
    const chargeMult = Config.PARAMS.CHARGE_MULT_RADIUS[player.thunderCharge] || 1.0;
    const phaseMult = state.stylePhase >= 2 ? 1.32 : 1.0;
    return player.lockRadius * (1 + skillWide * 0.22) * chargeMult * phaseMult;
  }

  function lockEnemyTarget(e) {
    if (e.dead || e.lockCount >= e.hp) return;
    e.lockCount++;
    player.lockedTargets.push({ kind: 'enemy', ref: e, x: e.x, y: e.y });

    const skillWide = player.skills.wide_iai || 0;
    const refund = Config.PARAMS.A_FOCUS_REFUND_PER_LOCK * (1 + skillWide * 0.20);
    player.focus = Math.min(player.maxFocus, player.focus + refund);

    const isBombOrGimmick = e.type === 'bomb' || e.isGimmick;
    Audio.playLockOn(player.lockedTargets.length - 1, isBombOrGimmick);
    Effects.spawnParticles(e.x, e.y, 7, isBombOrGimmick ? '#ffbe2e' : '#00f0ff', 50, 170, 2, 4);

    // If Bomb Lantern or Powder Barrel is locked, automatically chain-lock nearby enemies!
    if (e.type === 'bomb' || e.type === 'barrel') {
      const chainRad = player.explosionRadius * 1.45;
      Effects.spawnShockwave(e.x, e.y, chainRad, '#ffbe2e', 2.5, 0.22);
      enemies.forEach((other) => {
        if (other !== e && !other.dead && other.lockCount < other.hp && dist(e.x, e.y, other.x, other.y) <= chainRad) {
          other.lockCount++;
          player.lockedTargets.push({ kind: 'enemy', ref: other, x: other.x, y: other.y });
          Audio.playLockOn(player.lockedTargets.length - 1, false);
        }
      });
    }
  }

  function scanDirectCursorForLocks(ax, ay, bx, by) {
    const effR = getEffectiveLockRadius();

    // 1. Scan enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || e.lockCount >= e.hp) continue;
      if (pointToSegmentDist(e.x, e.y, ax, ay, bx, by) <= e.radius + effR) {
        lockEnemyTarget(e);
      }
    }

    // 2. Scan Boss Weak Cores (弱点核)
    if (boss && !boss.inExecution) {
      boss.cores.forEach((c) => {
        if (!c.broken && !c.locked) {
          if (pointToSegmentDist(c.x, c.y, ax, ay, bx, by) <= c.radius + effR) {
            c.locked = true;
            player.lockedTargets.push({ kind: 'boss_core', ref: c, x: c.x, y: c.y });
            player.focus = Math.min(player.maxFocus, player.focus + 28);
            Audio.playLockOn(player.lockedTargets.length - 1, true);
            Effects.spawnParticles(c.x, c.y, 12, '#ffbe2e', 80, 240, 2.5, 5);
          }
        }
      });
    }

    // 3. Scan Enemy Bullets (Parry lock!)
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.dead || b.locked) continue;
      if (pointToSegmentDist(b.x, b.y, ax, ay, bx, by) <= b.radius + effR * 0.9) {
        b.locked = true;
        player.lockedTargets.push({ kind: 'bullet', ref: b, x: b.x, y: b.y });
        player.focus = Math.min(player.maxFocus, player.focus + 16);
        Audio.playLockOn(player.lockedTargets.length - 1, false);
      }
    }
  }

  function releaseIaiSlash() {
    if (!player.isAiming) return;
    player.isAiming = false;

    if (player.lockedTargets.length > 0) {
      // Consume Thunder Charge stacks to empower this Iai!
      player.activeChargedStacks = player.thunderCharge;
      player.thunderCharge = 0;

      player.isDashing = true;
      player.dashQueue = player.lockedTargets.slice();
      player.dashTotal = player.dashQueue.length;
      player.dashIndex = 0;
      // MANDATORY 0.22s Total Traversal Time Cap so even 60 targets are sliced in a lightning instant!
      player.dashStepDuration = Math.min(0.022, Config.PARAMS.A_MAX_TOTAL_DASH_TIME / Math.max(1, player.dashTotal));
      player.dashStepTimer = 0;
      player.invuln = Math.max(player.invuln, 0.55);
      player.aimPoints = [];
      return;
    }

    // If no targets were locked, perform a quick dash toward cursor tip
    if (player.aimPoints.length > 0) {
      const tip = player.aimPoints[player.aimPoints.length - 1];
      executePinballSlashB(tip.x, tip.y);
    }
    player.aimPoints = [];
  }

  function stepIaiDash(rawDt) {
    if (!player.isDashing) return;
    player.dashStepTimer -= rawDt;
    const blade = getSelectedBlade();

    while (player.dashStepTimer <= 0 && player.dashQueue.length > 0) {
      player.dashStepTimer += player.dashStepDuration;
      const target = player.dashQueue.shift();
      player.dashIndex++;

      const tx = target.ref ? target.ref.x : target.x;
      const ty = target.ref ? target.ref.y : target.y;
      const slashAngle = Math.atan2(ty - player.y, tx - player.x);

      const isCharged = player.activeChargedStacks > 0;
      const glowCol = isCharged ? '#ffbe2e' : blade.colorGlow;
      const trailW = (isCharged ? 12 : 8) * (blade.id === 'dankai' ? 1.5 : 1.0);

      Effects.spawnSlashTrail(
        player.x,
        player.y,
        tx,
        ty,
        '#ffffff',
        glowCol,
        trailW,
        state.stylePhase === 3 ? 1.25 : 0.65
      );

      // Phase 3 (Rank SS/SSS) or Dankai Blade converts every Iai segment into a Dimensional Void Rift (Action D)!
      if (blade.alwaysVoid || state.stylePhase === 3) {
        Effects.spawnVoidRift(
          player.x,
          player.y,
          tx,
          ty,
          player.atk * 0.85,
          2.4,
          player.awakenedSkills.has('awk_void')
        );
      }

      player.x = tx;
      player.y = ty;
      player.invuln = 0.45;

      Audio.playIaiStep(player.dashIndex, player.dashTotal);
      Effects.spawnParticles(tx, ty, 7, '#ffffff', 90, 280, 2, 4);

      if (target.kind === 'bullet' && target.ref && !target.ref.dead) {
        target.ref.dead = true;
        parryBullet(tx, ty, slashAngle);
      } else if (target.kind === 'enemy' && target.ref && !target.ref.dead) {
        target.ref.sliced = true;
        target.ref.lastSlashAngle = slashAngle;
      } else if (target.kind === 'boss_core' && target.ref) {
        target.ref.sliced = true;
      }
    }

    if (player.dashQueue.length === 0) {
      player.isDashing = false;
      triggerSheathePause(player.dashTotal, player.activeChargedStacks);
    }
  }

  function triggerSheathePause(chainCount, chargedStacks) {
    spawnCrescentWaves(player.x, player.y, Math.random() * Math.PI * 2);
    Audio.playSheatheClick();

    // White cross katana sheathe glint on player
    Effects.spawnSlashTrail(player.x - 45, player.y, player.x + 45, player.y, '#ffffff', '#00f0ff', 5, 0.25);
    Effects.spawnSlashTrail(player.x, player.y - 45, player.x, player.y + 45, '#ffffff', '#00f0ff', 5, 0.25);

    state.sheathePause = chainCount >= 3 ? Config.PARAMS.A_SHEATHE_PAUSE : 0.04;
    state.pendingDetonation = { chainCount, chargedStacks };
  }

  function executeSimultaneousDetonation(chainCount, chargedStacks) {
    const blade = getSelectedBlade();
    const chargeDmgMult = Config.PARAMS.CHARGE_MULT_DMG[chargedStacks] || 1.0;
    const awkIaiMult = player.awakenedSkills.has('awk_iai') ? 2.5 : 1.0;

    Audio.playDetonation(chainCount, chargedStacks > 0);
    addShake(Math.min(28, 8 + chainCount * 1.3 + chargedStacks * 4));
    state.hitstop = Math.min(0.11, 0.03 + chainCount * 0.004);
    state.cameraZoom = Math.min(1.14, 1.03 + chainCount * 0.005);

    if (chainCount >= 5 || chargedStacks >= 2) {
      Effects.triggerChromatic(7 + chargedStacks * 2, 0.20);
      Effects.triggerFlash(chargedStacks >= 2 ? '#ffbe2e' : blade.colorGlow, Math.min(0.42, 0.16 + chainCount * 0.01));
    }

    // Phase 2+ (Awakened) spawns a massive connecting Dimensional Void Rift on 5+ chain Iai!
    if (state.stylePhase >= 2 && chainCount >= 5) {
      const ang = Math.random() * Math.PI;
      Effects.spawnVoidRift(
        player.x - Math.cos(ang) * 220,
        player.y - Math.sin(ang) * 220,
        player.x + Math.cos(ang) * 220,
        player.y + Math.sin(ang) * 220,
        player.atk * 1.4,
        2.6,
        player.awakenedSkills.has('awk_void')
      );
    }

    // Chain Lightning skill ('雷鳴抜刀' / '【極意】建御雷・天罰落雷')
    const lightLv = player.skills.chain_lightning || 0;
    if (lightLv > 0 || chargedStacks === 3) {
      const extraTargets = lightLv * 2 + (chargedStacks === 3 ? 4 : 0);
      triggerChainLightning(player.x, player.y, extraTargets, player.atk * (1.2 + lightLv * 0.3));
    }

    // 1. Check Boss Weak Cores for One-Stroke 'ALL BREAK!!'
    if (boss && !boss.inExecution) {
      let slicedCoreCount = 0;
      boss.cores.forEach((c) => {
        if (c.locked || c.sliced) {
          c.locked = false;
          c.sliced = false;
          c.broken = true;
          slicedCoreCount++;
          damageBoss(player.atk * 2.2 * chargeDmgMult, 0);
          Effects.spawnShockwave(c.x, c.y, 85, '#ffbe2e', 5, 0.3);
        }
      });

      const allBroken = boss.cores.every((c) => c.broken);
      if (allBroken && slicedCoreCount > 0) {
        // ONE-STROKE ALL BREAK!!
        const breakDmg = boss.maxHp * 0.18;
        boss.stunTimer = 4.0;
        damageBoss(breakDmg, 0);
        player.ultGauge = Math.min(200, player.ultGauge + 40);
        Effects.spawnBrushCutIn('部位全破壊', 'ALL BREAK!! -18% HP & STUN', '#ffbe2e');
        Effects.triggerChromatic(14, 0.30);
        addShake(26);
        for (let g = 0; g < 22; g++) {
          spawnGem(boss.x + (Math.random() - 0.5) * 80, boss.y + (Math.random() - 0.5) * 80, 1, true);
        }
      }
    }

    // 2. Detonate all sliced enemies simultaneously!
    const shadowHits = (player.skills.shadow_clone || 0) + (player.awakenedSkills.has('awk_shadow') ? 4 : 0);
    let simultaneousKills = 0;

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.sliced && !e.dead) {
        const hits = Math.max(1, e.lockCount) + shadowHits + (blade.multiHit - 1);
        const dmg = hits * player.atk * chargeDmgMult * awkIaiMult;
        e.hp -= dmg;
        e.lockCount = 0;
        e.sliced = false;

        // 3-Stack Thunder Charge drops a golden lightning pillar on every target!
        if (chargedStacks >= 3 || player.awakenedSkills.has('awk_lightning')) {
          Effects.spawnLightning(e.x, 0, e.x, e.y, '#ffbe2e', 4);
        }

        if (e.hp <= 0) {
          killEnemy(e, e.lastSlashAngle || 0, chainCount);
          simultaneousKills++;
        } else {
          incrementCombo(hits);
          Effects.addFloatingText(e.x, e.y - 16, `-${Math.round(dmg)}`, '#ffbe2e', 18, -80);
          Effects.spawnParticles(e.x, e.y, 10, e.color, 70, 240, 2, 5);
        }
      }
    }

    if (simultaneousKills > state.maxSingleIaiKills) {
      state.maxSingleIaiKills = simultaneousKills;
    }

    // 3. 5+ Simultaneous Kills triggers TORNADO SOUL GEM VACUUM & Callout!
    if (simultaneousKills >= 5) {
      gems.forEach((g) => {
        g.tornado = true;
      });
    }

    if (simultaneousKills >= 3) {
      let title = `${simultaneousKills}連斬・一閃!!`;
      let col = '#00f0ff';
      if (simultaneousKills >= 20) {
        title = `天衣無縫・${simultaneousKills}連極一閃!!`;
        col = '#ffbe2e';
        Effects.spawnBrushCutIn('天衣無縫', `${simultaneousKills} CHAIN OBLITERATION`, '#ffbe2e');
      } else if (simultaneousKills >= 12) {
        title = `無双絶景・${simultaneousKills}連爆砕!!`;
        col = '#ff1e42';
        Effects.spawnBrushCutIn('無双絶景', `${simultaneousKills} SIMULTANEOUS KILLS`, '#ff1e42');
      } else if (simultaneousKills >= 6) {
        title = `神速・${simultaneousKills}連爆砕!!`;
        col = '#ffbe2e';
      }
      Effects.addFloatingText(player.x, Math.max(75, player.y - 46), title, col, 28, -70);
    }
  }

  // ==========================================
  // 7. KILL ENEMY, CORPSE PINBALL, GIMMICK DETONATION & SCROLL DROP
  // ==========================================
  function killEnemy(e, slashAngle = 0, chainBonus = 1) {
    if (e.dead) return;
    e.dead = true;
    state.totalKills++;

    const blade = getSelectedBlade();
    incrementCombo(blade.multiHit);

    const { obj: rankObj } = getCurrentRankObj();
    const gainedScore = Math.round(e.score * rankObj.mult * (1 + chainBonus * 0.08));
    state.score += gainedScore;

    // Charge Ultimate Gauge (0% -> 200%)
    const ultMult = state.rankIdx >= 3 ? 1.5 : 1.0;
    player.ultGauge = Math.min(200, player.ultGauge + (e.isElite ? 8.0 : 1.8) * ultMult);

    // 1. Floor Sumi-e Ink & Gold Leaf Decal
    Effects.spawnInkDecal(e.x, e.y, e.radius * 1.7, state.rankIdx >= 3);

    // 2. Corpse Pinball Bisection (Halves launch at 680 px/s and bowl into other enemies!)
    const isExplosiveCorpse = player.awakenedSkills.has('awk_nova');
    Effects.spawnSlicedBody(e.x, e.y, e.radius, e.color, slashAngle, player.atk * 1.5, isExplosiveCorpse);
    Effects.spawnParticles(e.x, e.y, 16, e.color, 80, 380, 2.5, 6);

    const novaLv = player.skills.crimson_nova || 0;
    const baseBlastR = (e.type === 'bomb' || e.type === 'barrel' ? 145 : 52) * (1 + novaLv * 0.28);
    Effects.spawnShockwave(e.x, e.y, baseBlastR, e.color, 3.5, 0.28);
    Effects.addFloatingText(e.x + (Math.random() - 0.5) * 20, e.y - 10, `+${gainedScore.toLocaleString()}`, '#ffffff', 14, -75);

    // 3. Stage Gimmick & Bomb Chain Reactions
    if (e.type === 'bomb' || e.type === 'barrel' || novaLv > 0 || isExplosiveCorpse) {
      const aoeR = e.type === 'bomb' || e.type === 'barrel' || isExplosiveCorpse ? baseBlastR : baseBlastR * 0.85;
      enemies.forEach((other) => {
        if (!other.dead && dist(e.x, e.y, other.x, other.y) <= aoeR) {
          other.hp -= player.atk * (e.type === 'barrel' ? 3.5 : 1.8);
          if (other.hp <= 0) killEnemy(other, Math.atan2(other.y - e.y, other.x - e.x), chainBonus + 1);
        }
      });
    }

    if (e.type === 'lantern') {
      // Thunder Lantern gimmick shocks 6 nearby enemies!
      triggerChainLightning(e.x, e.y, 6, player.atk * 3.0);
    } else if (e.type === 'crystal') {
      // Void Crystal gimmick spawns a giant Cross Dimensional Void Rift (Action D)!
      Effects.spawnVoidRift(e.x - 170, e.y, e.x + 170, e.y, player.atk * 1.8, 3.0, true);
      Effects.spawnVoidRift(e.x, e.y - 170, e.x, e.y + 170, player.atk * 1.8, 3.0, true);
      Audio.playVoidSlash();
    }

    // 4. Splitter Ninja spawns 3 mini targets
    if (e.type === 'splitter') {
      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * Math.PI * 2 + Math.random();
        const mini = Entities.createEnemy('swarm', e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, 1.0);
        mini.radius = 11;
        mini.color = '#00f0ff';
        enemies.push(mini);
      }
    }

    // 5. Elite Enemy drops Golden Jackpot Scroll ('秘伝の巻物')!
    if (e.isElite) {
      scrolls.push({
        x: e.x,
        y: e.y,
        radius: 18,
        pulse: 0
      });
      Effects.addFloatingText(e.x, e.y - 26, '📜 秘伝の巻物ドロップ!!', '#ffbe2e', 18, -65);
    }

    // 6. Parry Master bonus homing kunai every 8 kills
    const parryLv = player.skills.parry_master || 0;
    if (parryLv > 0 && state.totalKills % 8 === 0) {
      spawnHomingKunai(e.x, e.y, parryLv + 1);
    }

    // 7. Drop Soul Gems
    const gemCount = Math.round(e.xp * (state.stylePhase === 3 ? 2 : 1));
    for (let g = 0; g < gemCount; g++) {
      spawnGem(e.x, e.y, 1, chainBonus >= 5);
    }
  }

  function spawnGem(x, y, value = 1, tornado = false) {
    const a = Math.random() * Math.PI * 2;
    const spd = 70 + Math.random() * 160;
    gems.push({
      x,
      y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      value,
      magnetized: tornado,
      tornado,
      angle: a
    });
  }

  function parryBullet(x, y, slashAngle) {
    state.parryCount++;
    incrementCombo(2);
    player.ultGauge = Math.min(200, player.ultGauge + 2.8);
    Audio.playParry();
    Effects.addFloatingText(x, y - 12, '弾斬り! PARRY', '#00f0ff', 15, -80);

    const parryLv = player.skills.parry_master || 0;
    spawnHomingKunai(x, y, 2 + parryLv * 2, slashAngle);
  }

  function spawnHomingKunai(x, y, count, baseAngle = 0) {
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (Math.random() - 0.5) * 1.5;
      friendlyBlades.push({
        x,
        y,
        vx: Math.cos(a) * 560,
        vy: Math.sin(a) * 560,
        isWave: false,
        radius: 11,
        damage: player.atk * 1.1,
        life: 1.7
      });
    }
  }

  function spawnCrescentWaves(x, y, baseAngle) {
    const waveLv = player.skills.crescent_wave || 0;
    if (waveLv <= 0) return;
    const count = waveLv * 2;
    const isAwakened = player.awakenedSkills.has('awk_wave');
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i / count) * Math.PI * 2;
      friendlyBlades.push({
        x,
        y,
        vx: Math.cos(a) * 640,
        vy: Math.sin(a) * 640,
        isWave: true,
        bounce: isAwakened,
        leaveVoid: isAwakened,
        radius: 28 + waveLv * 4,
        damage: player.atk * 1.35,
        life: isAwakened ? 2.8 : 1.3
      });
    }
  }

  function triggerChainLightning(originX, originY, maxChains, dmg) {
    let curX = originX;
    let curY = originY;
    const hitSet = new Set();

    for (let c = 0; c < maxChains; c++) {
      let nearest = null;
      let bestD = 360;
      enemies.forEach((e) => {
        if (!e.dead && !hitSet.has(e.id)) {
          const d = dist(curX, curY, e.x, e.y);
          if (d < bestD) {
            bestD = d;
            nearest = e;
          }
        }
      });
      if (!nearest) break;
      hitSet.add(nearest.id);
      Effects.spawnLightning(curX, curY, nearest.x, nearest.y, '#00f0ff', 3.5);
      nearest.hp -= dmg;
      if (nearest.hp <= 0) {
        killEnemy(nearest, Math.atan2(nearest.y - curY, nearest.x - curX), 1);
      }
      curX = nearest.x;
      curY = nearest.y;
    }
  }

  // ==========================================
  // 8. COMBO & STYLE RANK ESCALATION (C -> B -> A -> S -> SS -> SSS 鬼神)
  // ==========================================
  function incrementCombo(amount) {
    const prevRank = state.rankIdx;
    const prevCombo = state.combo;
    state.combo += amount;

    if (state.combo > state.maxChainThisRun) {
      state.maxChainThisRun = state.combo;
    }

    // Cursed Blade Shiden ('妖刀・紫電') heals +1 HP every 100 chains!
    if (getSelectedBlade().id === 'shiden' && Math.floor(state.combo / 100) > Math.floor(prevCombo / 100)) {
      if (player.hp < player.maxHp) {
        player.hp++;
        Effects.addFloatingText(player.x, player.y - 34, '妖刀吸命 HP+1!!', '#00f5a8', 20, -80);
      }
    }

    const { idx, obj } = getCurrentRankObj();
    state.rankIdx = idx;
    state.stylePhase = obj.phase;
    state.maxComboTimer = obj.decayTime;
    state.comboTimer = state.maxComboTimer;

    if (idx >= 3) state.reachedRankS = true;

    // Trigger Giant Brush Calligraphy Cut-In on Rank-Up!
    if (idx > prevRank) {
      Audio.setBgmIntensity(obj, idx);
      if (idx === 2) Effects.spawnBrushCutIn('覚醒・閃光', 'STYLE RANK A — 衝撃波＆次元斬解禁', '#00f0ff');
      else if (idx === 3) Effects.spawnBrushCutIn('修羅覚醒', 'STYLE RANK S — 魂倍率 ×3.5', '#ffbe2e');
      else if (idx === 4) Effects.spawnBrushCutIn('夜叉降臨', 'STYLE RANK SS — 紅蓮分身＆全軌跡次元斬', '#ff1e42');
      else if (idx === 5) Effects.spawnBrushCutIn('鬼神降臨', 'STYLE RANK SSS — 集中消費ゼロ＆極限トランス', '#ffbe2e');
    }

    const comboEl = document.getElementById('combo-container');
    comboEl.style.transform = 'scale(1.24)';
    setTimeout(() => {
      comboEl.style.transform = 'scale(1)';
    }, 70);
  }

  // ==========================================
  // 9. TWO-TIER ULTIMATE SYSTEM (100% & 200% OVERCHARGE)
  // ==========================================
  function triggerUltimate() {
    if (state.mode !== 'PLAY' || player.ultGauge < 100) return;
    Audio.init();

    if (player.ultGauge >= 200) {
      // Tier 2 (200% OVERCHARGE): '第弐奥義：絶・虚空一文字' (Black Hole Suction -> Screen Split Supernova!)
      player.ultGauge = 0;
      state.ult200Phase = 1;
      state.ult200Timer = 1.15;
      player.invuln = 3.5;
      Effects.spawnBrushCutIn('虚空収束', '第弐奥義：絶・虚空一文字', '#ffbe2e');
      Audio.playVoidSlash();
      addShake(16);
    } else {
      // Tier 1 (100%): '第壱奥義：千本桜・墨嵐' (3.2s Sumi-e White Inversion + Auto Void Slash Storm!)
      player.ultGauge -= 100;
      state.ult100Timer = 3.2;
      player.invuln = 3.6;
      Effects.spawnBrushCutIn('千本桜・墨嵐', 'カーソル移動で無制限・空間次元斬！！', '#ff1e42');
      Audio.playLevelUp(true);
      addShake(14);
    }
    updateHud();
  }

  function executeUlt200Supernova() {
    if (state.ult200Phase !== 2) return;
    state.ult200Phase = 0;
    state.ult200Timer = 0;

    // Split screen horizontally, trigger massive chromatic flash & supernova!
    Effects.triggerScreenSplit(0, 0.55);
    Effects.triggerChromatic(20, 0.40);
    Effects.triggerFlash('#ffbe2e', 0.65);
    Effects.spawnBrushCutIn('絶・虚空一文字', '天地二分割・超新星爆砕！！', '#ffbe2e');
    Effects.spawnShockwave(W / 2, H / 2, Math.max(W, H) * 0.8, '#ffbe2e', 14, 0.55);
    Audio.playSheatheClick();
    Audio.playDetonation(30, true);
    addShake(28);
    state.hitstop = 0.16;

    // Obliterate all regular/elite enemies and shower soul gems!
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e.dead && !e.isGimmick) {
        killEnemy(e, 0, 25);
      }
    }
    bullets = [];
    gems.forEach((g) => (g.tornado = true));

    if (boss) {
      boss.stunTimer = 4.5;
      damageBoss(player.atk * 45, 0);
    }
  }

  // ==========================================
  // 10. LEVEL UP (With 0.45s Anti-Misclick Lock) & SCROLL JACKPOT
  // ==========================================
  function checkLevelUp() {
    if (player.xp >= player.xpNext && state.mode === 'PLAY') {
      player.xp -= player.xpNext;
      player.level++;
      player.xpNext = Math.floor(8 + (player.level - 1) * 6 + Math.pow(player.level - 1, 1.42) * 2);
      player.pointerDown = false;
      player.isAiming = false;
      player.aimPoints = [];
      openLevelUpModal();
    }
  }

  function getAvailableUpgrades() {
    const awakenings = [];
    const normals = [];

    Config.SKILLS.forEach((sk) => {
      const curLv = player.skills[sk.id] || 0;
      const isAwakened = player.awakenedSkills.has(sk.awakenId);

      // Check if eligible for Vampire-Survivors-style LvMAX Awakening!
      if (curLv >= sk.maxLv && !isAwakened) {
        let reqMet = true;
        if (sk.awakenReqSkill && (player.skills[sk.awakenReqSkill] || 0) < 1) reqMet = false;
        if (sk.id === 'parry_master' && state.parryCount < 10) reqMet = false;
        if (sk.id === 'crimson_nova' && state.maxSingleIaiKills < 10) reqMet = false;
        if (sk.id === 'void_rift' && !state.reachedRankS) reqMet = false;

        if (reqMet) {
          awakenings.push({
            isAwakening: true,
            skill: sk
          });
        }
      } else if (curLv < sk.maxLv) {
        normals.push({
          isAwakening: false,
          skill: sk,
          nextLv: curLv + 1
        });
      }
    });

    const shuffledNormals = normals.sort(() => Math.random() - 0.5);
    const choices = [...awakenings, ...shuffledNormals].slice(0, 3);

    // Fallback if all skills maxed
    while (choices.length < 3) {
      choices.push({
        isAwakening: false,
        isBonusHeal: true,
        skill: {
          id: 'bonus_heal',
          tag: '秘伝回復',
          name: '剣聖の息吹',
          desc: '命盾（HP）を2回復し、攻撃力＋15% ＆ 奥義ゲージ＋40%！'
        }
      });
    }
    return choices;
  }

  function openLevelUpModal() {
    state.mode = 'LEVELUP';
    state.levelUpOpenTime = performance.now();
    state.levelUpUnlocked = false;
    state.currentChoices = getAvailableUpgrades();

    const hasAwakening = state.currentChoices.some((c) => c.isAwakening);
    Audio.playLevelUp(hasAwakening);

    const grid = document.getElementById('upgrade-grid');
    grid.innerHTML = '';

    state.currentChoices.forEach((choice, idx) => {
      const sk = choice.skill;
      const card = document.createElement('div');
      card.className = 'upgrade-card locked-guard' + (choice.isAwakening ? ' awakening-card' : '');
      card.style.animationDelay = `${idx * 0.06}s`;

      const tagText = choice.isAwakening
        ? `⚡ [${idx + 1}] 極意進化 AWAKENING!! ⚡`
        : `[${idx + 1}] ${sk.tag} — ${choice.isBonusHeal ? '極意' : 'LV.' + choice.nextLv}`;
      const titleText = choice.isAwakening ? sk.awakenName : sk.name;
      const descText = choice.isAwakening ? sk.awakenDesc : sk.desc;

      card.innerHTML = `
        <div>
          <div class="upg-tag">${tagText}</div>
          <div class="upg-title">${titleText}</div>
          <div class="upg-desc">${descText}</div>
        </div>
        <div style="margin-top:14px;font-size:11px;font-weight:900;color:var(--neon-cyan);">
          クリック / キー [${idx + 1}] で習得 ➔
        </div>
      `;
      card.addEventListener('click', () => selectUpgradeChoice(choice));
      grid.appendChild(card);
    });

    document.getElementById('levelup-guard-text').textContent = '誤タップ防止ロック中 (0.45s)...';
    document.getElementById('levelup-guard-fill').style.width = '0%';
    document.getElementById('levelup-overlay').classList.remove('hidden');
  }

  function selectUpgradeChoice(choice) {
    if (state.mode !== 'LEVELUP') return;
    // MANDATORY 450ms (0.45s) Anti-Misclick Guard Check
    if (performance.now() - state.levelUpOpenTime < Config.PARAMS.LEVELUP_LOCK_MS) {
      return;
    }

    applyUpgrade(choice);
    document.getElementById('levelup-overlay').classList.add('hidden');
    state.mode = 'PLAY';
    player.focus = player.maxFocus;
    player.invuln = 1.0;
    renderSkillStrip();
    updateHud();
    checkLevelUp();
  }

  function applyUpgrade(choice) {
    const sk = choice.skill;
    if (choice.isBonusHeal) {
      player.hp = Math.min(player.maxHp, player.hp + 2);
      player.atk *= 1.15;
      player.ultGauge = Math.min(200, player.ultGauge + 40);
      return;
    }

    if (choice.isAwakening) {
      player.awakenedSkills.add(sk.awakenId);
      Effects.spawnBrushCutIn('極意開眼', sk.awakenName, '#ffbe2e');
    } else {
      player.skills[sk.id] = (player.skills[sk.id] || 0) + 1;
      if (sk.id === 'parry_master') {
        player.hp = Math.min(player.maxHp, player.hp + 1);
      } else if (sk.id === 'godspeed') {
        player.magnetRadius *= 1.22;
      }
    }
  }

  // Non-pausing Scroll Jackpot Slot Machine ('秘伝の巻物')
  function triggerScrollJackpot() {
    Audio.playLevelUp(true);
    const banner = document.getElementById('jackpot-banner');
    const reel = document.getElementById('jackpot-reel');
    banner.classList.remove('hidden');
    state.jackpotTimer = 2.4;

    const roll = Math.random();
    const numUpgrades = roll < 0.18 ? 3 : (roll < 0.55 ? 2 : 1);
    const tierNames = { 1: '【一閃賞】奥義1種強化！', 2: '【二天賞】奥義2種同時強化！！', 3: '【鬼神大当たり】奥義3種強化＆全回復！！' };

    const choices = getAvailableUpgrades().slice(0, numUpgrades);
    const upgradedNames = choices.map((c) => {
      applyUpgrade(c);
      return c.isAwakening ? c.skill.awakenName : c.skill.name;
    });

    player.hp = Math.min(player.maxHp, player.hp + (numUpgrades === 3 ? player.maxHp : 1));
    player.ultGauge = Math.min(200, player.ultGauge + numUpgrades * 20);
    Effects.spawnShockwave(player.x, player.y, 260, '#ffbe2e', 7, 0.38);

    reel.textContent = `${tierNames[numUpgrades]} ➔ ${upgradedNames.join(' ＆ ')}`;
    renderSkillStrip();
  }

  function renderSkillStrip() {
    const strip = document.getElementById('skill-strip');
    strip.innerHTML = '';

    const blade = getSelectedBlade();
    const bladeBadge = document.createElement('div');
    bladeBadge.className = 'skill-badge';
    bladeBadge.style.borderColor = blade.colorGlow;
    bladeBadge.innerHTML = `⚔️ ${blade.name}`;
    strip.appendChild(bladeBadge);

    Config.SKILLS.forEach((sk) => {
      const lv = player.skills[sk.id] || 0;
      const isAwk = player.awakenedSkills.has(sk.awakenId);
      if (lv > 0 || isAwk) {
        const badge = document.createElement('div');
        badge.className = 'skill-badge' + (isAwk ? ' awakened' : '');
        badge.innerHTML = isAwk
          ? `★ ${sk.awakenName}`
          : `${sk.name} <span class="gold-text">Lv.${lv}</span>`;
        strip.appendChild(badge);
      }
    });
  }

  // ==========================================
  // 11. BOSS DAMAGE, EXECUTION & STAGE CLEAR
  // ==========================================
  function spawnStageBoss() {
    const stageObj = getSelectedStage();
    const bossId = stageObj.bossId === 'endless'
      ? ['kurogane', 'gokuen', 'mumyo'][Math.floor(Math.random() * 3)]
      : stageObj.bossId;

    // Clear non-gimmick mobs & announce Boss
    enemies.forEach((e) => {
      if (!e.isGimmick) e.dead = true;
    });

    boss = Entities.createBoss(bossId, W, H, 1 + state.stageIdx * 0.35);
    Effects.spawnBrushCutIn('強敵出現', boss.name, '#ff1e42');
    Effects.triggerChromatic(12, 0.28);
    Audio.playDetonation(12, true);
    document.getElementById('boss-hud').classList.remove('hidden');
  }

  function damageBoss(dmg, slashAngle) {
    if (!boss) return;
    if (boss.inExecution) {
      // During 2.5s EXECUTION bonus fury, every slash showers gold particles and score!
      state.score += Math.round(1500 * getCurrentRankObj().obj.mult);
      incrementCombo(3);
      Effects.spawnParticles(boss.x + (Math.random() - 0.5) * 60, boss.y + (Math.random() - 0.5) * 60, 18, '#ffbe2e', 100, 420, 3, 7);
      return;
    }

    boss.hp = Math.max(0, boss.hp - dmg);
    incrementCombo(1);
    Effects.spawnParticles(boss.x, boss.y, 10, '#ff1e42', 80, 280, 2, 5);
    Effects.addFloatingText(boss.x + (Math.random() - 0.5) * 40, boss.y - 24, `-${Math.round(dmg)}`, '#ffbe2e', 20, -85);

    if (boss.hp <= 0 && !boss.inExecution) {
      // Enter 2.5s EXECUTION ('処刑フィニッシュ') Fury Time!
      boss.inExecution = true;
      boss.executionTimer = 2.4;
      Effects.spawnBrushCutIn('トドメを刺せ', 'EXECUTION — 斬り刻め！！', '#ff1e42');
      Audio.playLevelUp(true);
    }
  }

  function finishBossExecution() {
    if (!boss) return;
    const bx = boss.x;
    const by = boss.y;
    boss = null;
    document.getElementById('boss-hud').classList.add('hidden');

    Audio.playSheatheClick();
    Audio.playDetonation(35, true);
    Effects.triggerChromatic(20, 0.38);
    Effects.triggerFlash('#ffbe2e', 0.65);
    Effects.spawnShockwave(bx, by, 520, '#ffbe2e', 12, 0.5);
    Effects.spawnParticles(bx, by, 90, '#ffbe2e', 100, 580, 3, 8);
    addShake(28);

    const stageObj = getSelectedStage();
    if (stageObj.id === 3) {
      // In Endless Mode, reward 500 coins and continue!
      saveData.soulCoins += 500;
      writeSave();
      Effects.spawnBrushCutIn('鬼将撃破', '+500両 獲得！無間獄続行', '#ffbe2e');
    } else {
      saveData.clearedStages[stageObj.id] = true;
      writeSave();
      setTimeout(() => showResultModal(true), 650);
    }
  }

  // ==========================================
  // 12. MAIN UPDATE LOOP
  // ==========================================
  function update(rawDt) {
    // Update Level-Up 0.45s Anti-Misclick Guard Bar even while game is paused in LEVELUP
    if (state.mode === 'LEVELUP' && !state.levelUpUnlocked) {
      const elapsed = performance.now() - state.levelUpOpenTime;
      const pct = Math.min(100, (elapsed / Config.PARAMS.LEVELUP_LOCK_MS) * 100);
      document.getElementById('levelup-guard-fill').style.width = `${pct}%`;
      if (elapsed >= Config.PARAMS.LEVELUP_LOCK_MS) {
        state.levelUpUnlocked = true;
        document.getElementById('levelup-guard-text').textContent = '★ 奥義選択可能！ (1 / 2 / 3 キー または クリック)';
        document.querySelectorAll('.upgrade-card').forEach((c) => c.classList.remove('locked-guard'));
      }
      return;
    }

    if (state.mode !== 'PLAY') return;

    // Hitstop freeze
    if (state.hitstop > 0) {
      state.hitstop -= rawDt;
      return;
    }

    // Sheathe Pause ('カチッ…！') before simultaneous detonation
    if (state.sheathePause > 0) {
      state.sheathePause -= rawDt;
      if (state.sheathePause <= 0 && state.pendingDetonation) {
        const { chainCount, chargedStacks } = state.pendingDetonation;
        state.pendingDetonation = null;
        executeSimultaneousDetonation(chainCount, chargedStacks);
      }
      return;
    }

    // 200% Ultimate Phase 1 (Black Hole Suction) & Phase 2 (Wait for Horizontal Swipe)
    if (state.ult200Phase === 1) {
      state.ult200Timer -= rawDt;
      enemies.forEach((e) => {
        if (!e.dead && !e.isGimmick) {
          e.x += (W / 2 - e.x) * 6.5 * rawDt;
          e.y += (H / 2 - e.y) * 6.5 * rawDt;
        }
      });
      bullets.forEach((b) => {
        b.x += (W / 2 - b.x) * 8 * rawDt;
        b.y += (H / 2 - b.y) * 8 * rawDt;
      });
      if (state.ult200Timer <= 0) {
        state.ult200Phase = 2;
        state.ult200Timer = 1.5;
        Effects.addFloatingText(W / 2, H / 2 - 75, '⚡ 画面を横にスワイプ / クリックして一閃せよ！！ ⚡', '#ffbe2e', 24, 0);
      }
      return;
    } else if (state.ult200Phase === 2) {
      state.ult200Timer -= rawDt;
      if (state.ult200Timer <= 0) {
        executeUlt200Supernova();
      }
      return;
    }

    // Determine World Time Scale (Bullet-Time Aiming: 0.10x, Action B Chain Window: 0.22x)
    if (state.chainSlowTimer > 0) state.chainSlowTimer -= rawDt;
    const worldScale = player.isAiming
      ? Config.PARAMS.A_TIME_SCALE
      : (player.isDashing ? 0.18 : (state.chainSlowTimer > 0 ? 0.24 : 1.0));
    const dt = rawDt * worldScale;

    // Camera & timers
    state.shake = Math.max(0, state.shake - rawDt * 45);
    const targetZoom = player.isAiming ? 1.045 : 1.0;
    state.cameraZoom += (targetZoom - state.cameraZoom) * Math.min(1, rawDt * 9);

    if (state.ult100Timer > 0) {
      state.ult100Timer -= rawDt;
      if (state.ult100Timer <= 0) {
        // Finisher glass shatter blast at end of 100% Ultimate!
        Audio.playDetonation(20, true);
        Effects.triggerChromatic(15, 0.25);
        Effects.triggerFlash('#ff1e42', 0.45);
        enemies.forEach((e) => {
          if (!e.dead && !e.isGimmick) {
            e.hp -= player.atk * 14;
            if (e.hp <= 0) killEnemy(e, 0, 10);
          }
        });
      }
    }

    if (state.jackpotTimer > 0) {
      state.jackpotTimer -= rawDt;
      if (state.jackpotTimer <= 0) {
        document.getElementById('jackpot-banner').classList.add('hidden');
      }
    }

    if (state.gemStreakTimer > 0) {
      state.gemStreakTimer -= rawDt;
      if (state.gemStreakTimer <= 0) state.gemStreak = 0;
    }

    // Player Focus Regen, Overheat Recovery & Hover Movement
    if (player.invuln > 0) player.invuln -= rawDt;
    if (player.overheatTimer > 0) {
      player.overheatTimer -= rawDt;
      player.focus = Math.min(player.maxFocus, player.focus + player.focusRegen * 0.9 * rawDt);
      if (player.overheatTimer <= 0) {
        player.focus = Math.max(42, player.focus);
      }
    } else if (!player.isAiming && !player.isDashing) {
      player.focus = Math.min(player.maxFocus, player.focus + player.focusRegen * rawDt);
    }

    // Non-Attack Smooth Hover Movement (Cursor Follow + WASD / Arrow Keys)
    if (!player.isAiming && !player.isDashing) {
      const skillGodspeed = player.skills.godspeed || 0;
      const moveSpd = Config.PARAMS.PLAYER_SPEED * (1 + skillGodspeed * 0.12);
      let kx = 0;
      let ky = 0;
      if (keys.KeyW || keys.ArrowUp) ky -= 1;
      if (keys.KeyS || keys.ArrowDown) ky += 1;
      if (keys.KeyA || keys.ArrowLeft) kx -= 1;
      if (keys.KeyD || keys.ArrowRight) kx += 1;

      if (kx !== 0 || ky !== 0) {
        const kLen = Math.hypot(kx, ky);
        player.x += (kx / kLen) * moveSpd * rawDt;
        player.y += (ky / kLen) * moveSpd * rawDt;
      } else {
        const dToCursor = dist(player.x, player.y, player.pointerX, player.pointerY);
        if (dToCursor > 20) {
          const ang = Math.atan2(player.pointerY - player.y, player.pointerX - player.x);
          const step = Math.min(dToCursor - 18, moveSpd * rawDt);
          player.x += Math.cos(ang) * step;
          player.y += Math.sin(ang) * step;
        }
      }

      player.x = Math.max(24, Math.min(W - 24, player.x));
      player.y = Math.max(32, Math.min(H - 32, player.y));

      // Awakened Godspeed leaves blazing blue afterimage rifts while walking!
      if (player.awakenedSkills.has('awk_godspeed') && Math.random() < 0.25 && player.trail.length > 2) {
        const lastT = player.trail[player.trail.length - 2];
        Effects.spawnVoidRift(lastT.x, lastT.y, player.x, player.y, player.atk * 0.5, 1.1, false);
      }
    }

    // Record scarf trail
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > 10) player.trail.shift();

    // AwakenedShadow Clone ('【極意】千手観音・無間連斬') auto-slashes nearby enemies!
    if (player.awakenedSkills.has('awk_shadow') && Math.random() < 0.22 && enemies.length > 0) {
      const target = enemies[Math.floor(Math.random() * enemies.length)];
      if (target && !target.dead && dist(player.x, player.y, target.x, target.y) < 260) {
        const a = Math.random() * Math.PI * 2;
        Effects.spawnSlashTrail(
          target.x - Math.cos(a) * 45,
          target.y - Math.sin(a) * 45,
          target.x + Math.cos(a) * 45,
          target.y + Math.sin(a) * 45,
          '#ffffff',
          '#ff1e42',
          5,
          0.25
        );
        target.hp -= player.atk * 0.9;
        if (target.hp <= 0) killEnemy(target, a, 1);
      }
    }

    // Step High-Speed 0.22s Iai Dash
    if (player.isDashing) {
      stepIaiDash(rawDt);
    }

    // Combo Timer Decay (Paused during Bullet-Time Aiming, Dashing, or Boss Execution!)
    if (state.combo > 0 && !player.isAiming && !player.isDashing && !(boss && boss.inExecution)) {
      state.comboTimer -= rawDt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.rankIdx = 0;
        state.stylePhase = 1;
        Audio.setBgmIntensity(Config.STYLE_RANKS[0], 0);
      }
    }

    // Stage Countdown Timer & Formation Spawning
    const stageObj = getSelectedStage();
    if (!boss) {
      state.stageTimer -= dt;
      if (state.stageTimer <= 0 && stageObj.id !== 3) {
        state.stageTimer = 0;
        spawnStageBoss();
      } else if (stageObj.id === 3 && Math.floor(state.stageTimer) % 75 === 0 && state.stageTimer < 999990) {
        spawnStageBoss();
      }
    }

    // Maintain high enemy density (26-65 enemies) using the 5 Geometric Formations!
    state.formationTimer -= dt;
    const activeEnemyCount = enemies.filter((e) => !e.isGimmick).length;
    if (!boss && (state.formationTimer <= 0 || activeEnemyCount < stageObj.minEnemies)) {
      state.formationTimer = 2.8;
      if (activeEnemyCount < stageObj.maxEnemies) {
        const waveScale = 1 + state.stageIdx * 0.35 + (stageObj.duration - state.stageTimer) * 0.004;
        Entities.spawnFormation(state.formationCursor % 5, W, H, stageObj, waveScale, enemies);
        state.formationCursor++;
      }
    }

    // Update Boss
    if (boss) {
      if (boss.inExecution) {
        boss.executionTimer -= rawDt;
        if (boss.executionTimer <= 0) {
          finishBossExecution();
        }
      } else {
        Entities.updateBoss(boss, dt, W, H, player, bullets, Effects, (x1, y1, x2, y2) => {
          Effects.spawnVoidRift(x1, y1, x2, y2, 0, 1.2, false);
        });
      }
    }

    // Update Enemies & Check '見切り (GRAZE!)' Paper-Thin Dodge
    const grazeMargin = Config.PARAMS.GRAZE_MARGIN * (1 + (player.skills.godspeed || 0) * 0.12);
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) {
        enemies.splice(i, 1);
        continue;
      }

      e.pulse += rawDt * 5;
      if (e.grazeCd > 0) e.grazeCd -= rawDt;

      if (!e.isGimmick) {
        const ang = Math.atan2(player.y - e.y, player.x - e.x);
        e.angle = ang;

        // Berserk Ronin charge telegraph
        if (e.type === 'ronin') {
          e.chargeCd -= dt;
          if (e.chargeCd <= 0 && e.chargeWarningTimer <= 0) {
            e.chargeWarningTimer = 0.65;
            e.chargeTargetX = player.x + Math.cos(ang) * 140;
            e.chargeTargetY = player.y + Math.sin(ang) * 140;
          }
          if (e.chargeWarningTimer > 0) {
            e.chargeWarningTimer -= dt;
            if (e.chargeWarningTimer <= 0) {
              e.vx = Math.cos(ang) * 480;
              e.vy = Math.sin(ang) * 480;
              e.chargeCd = 2.4;
            }
          }
        }

        e.x += (Math.cos(ang) * e.speed + e.vx) * dt;
        e.y += (Math.sin(ang) * e.speed + e.vy) * dt;
        e.vx *= 0.9;
        e.vy *= 0.9;

        // Shooter fires deflectable red bullets
        if (e.type === 'shooter') {
          e.shootCd -= dt;
          if (e.shootCd <= 0 && dist(e.x, e.y, player.x, player.y) < 540) {
            e.shootCd = 2.2 + Math.random();
            bullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(ang) * 235,
              vy: Math.sin(ang) * 235,
              radius: 7.5,
              locked: false,
              grazeCd: 0,
              dead: false
            });
          }
        }

        // Player Hit vs Graze Check
        if (!player.isDashing && !player.isAiming && !e.sliced) {
          const d = dist(e.x, e.y, player.x, player.y);
          const hitDist = e.radius + player.radius - 3;
          if (d < hitDist && player.invuln <= 0) {
            damagePlayer();
            break;
          } else if (d >= hitDist && d <= hitDist + grazeMargin && e.grazeCd <= 0) {
            e.grazeCd = Config.PARAMS.GRAZE_COOLDOWN;
            triggerGraze(e.x, e.y);
          }
        }
      }
    }

    // Update Enemy Bullets & Awakened Parry Shield + Graze Check
    const hasParryShield = player.awakenedSkills.has('awk_parry');
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.dead || b.x < -50 || b.x > W + 50 || b.y < -50 || b.y > H + 50) {
        bullets.splice(i, 1);
        continue;
      }
      if (b.grazeCd > 0) b.grazeCd -= rawDt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      const d = dist(b.x, b.y, player.x, player.y);
      if (hasParryShield && d < 52) {
        b.dead = true;
        parryBullet(b.x, b.y, Math.atan2(b.y - player.y, b.x - player.x));
        continue;
      }

      if (!player.isDashing && !player.isAiming && !b.locked) {
        const hitDist = b.radius + player.radius - 2;
        if (d < hitDist && player.invuln <= 0) {
          b.dead = true;
          damagePlayer();
        } else if (d >= hitDist && d <= hitDist + grazeMargin && b.grazeCd <= 0) {
          b.grazeCd = Config.PARAMS.GRAZE_COOLDOWN;
          triggerGraze(b.x, b.y);
        }
      }
    }

    // Update Friendly Homing Kunai & Crescent Sword Waves
    for (let i = friendlyBlades.length - 1; i >= 0; i--) {
      const fb = friendlyBlades[i];
      fb.life -= rawDt;
      if (fb.life <= 0) {
        friendlyBlades.splice(i, 1);
        continue;
      }

      if (!fb.isWave && enemies.length > 0) {
        let nearest = null;
        let bestD = 9999;
        enemies.forEach((e) => {
          if (!e.dead) {
            const d = dist(fb.x, fb.y, e.x, e.y);
            if (d < bestD) {
              bestD = d;
              nearest = e;
            }
          }
        });
        if (nearest) {
          const ta = Math.atan2(nearest.y - fb.y, nearest.x - fb.x);
          fb.vx += Math.cos(ta) * 1650 * rawDt;
          fb.vy += Math.sin(ta) * 1650 * rawDt;
          const spd = Math.hypot(fb.vx, fb.vy);
          if (spd > 620) {
            fb.vx = (fb.vx / spd) * 620;
            fb.vy = (fb.vy / spd) * 620;
          }
        }
      }

      fb.x += fb.vx * rawDt;
      fb.y += fb.vy * rawDt;

      // Boomerang bounce for Awakened Crescent Wave
      if (fb.bounce) {
        if (fb.x < 20 || fb.x > W - 20) fb.vx *= -1;
        if (fb.y < 20 || fb.y > H - 20) fb.vy *= -1;
        if (fb.leaveVoid && Math.random() < 0.25) {
          Effects.spawnVoidRift(fb.x - 20, fb.y - 20, fb.x + 20, fb.y + 20, player.atk * 0.5, 0.9, false);
        }
      }

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (!e.dead && dist(fb.x, fb.y, e.x, e.y) < e.radius + fb.radius) {
          e.hp -= fb.damage;
          Effects.spawnParticles(e.x, e.y, 5, '#00f0ff', 60, 180, 2, 4);
          if (e.hp <= 0) killEnemy(e, Math.atan2(fb.vy, fb.vx), 1);
          if (!fb.isWave) {
            fb.life = 0;
            break;
          }
        }
      }
    }

    // Update Golden Jackpot Scrolls ('秘伝の巻物')
    for (let i = scrolls.length - 1; i >= 0; i--) {
      const sc = scrolls[i];
      sc.pulse += rawDt * 6;
      const d = dist(sc.x, sc.y, player.x, player.y);
      if (d < player.magnetRadius * 0.9) {
        const a = Math.atan2(player.y - sc.y, player.x - sc.x);
        sc.x += Math.cos(a) * 520 * rawDt;
        sc.y += Math.sin(a) * 520 * rawDt;
      }
      if (d < player.radius + sc.radius + 10) {
        scrolls.splice(i, 1);
        triggerScrollJackpot();
      }
    }

    // Update Soul Gems (With Tornado Spiral Vacuum on 5+ Simultaneous Kills!)
    const xpMult = 1 + saveData.dojoLevels.xpGain * 0.18;
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      const d = dist(g.x, g.y, player.x, player.y);
      if (d < player.magnetRadius || state.stylePhase === 3) {
        g.magnetized = true;
      }
      if (g.tornado || g.magnetized) {
        const ang = Math.atan2(player.y - g.y, player.x - g.x);
        const swirl = g.tornado ? 0.42 : 0.15;
        const speed = g.tornado ? 1450 : 920;
        g.vx = Math.cos(ang + swirl) * speed;
        g.vy = Math.sin(ang + swirl) * speed;
      } else {
        g.vx *= 0.91;
        g.vy *= 0.91;
      }
      g.x += g.vx * rawDt;
      g.y += g.vy * rawDt;

      if (d < player.radius + 18) {
        player.xp += g.value * xpMult;
        Audio.playGemPickup(state.gemStreak++);
        state.gemStreakTimer = 0.45;
        gems.splice(i, 1);
        checkLevelUp();
      }
    }

    // Update Effects (including Corpse Pinball Bowling & Dimensional Void Rifts)
    Effects.update(dt, rawDt, {
      enemies,
      stylePhase: state.stylePhase,
      W,
      H,
      onCorpseBowlHit: (enemy, half) => {
        // Corpse Pinball Bowling Hit!
        enemy.hp -= half.damage;
        enemy.vx += half.vx * 0.45;
        enemy.vy += half.vy * 0.45;
        Effects.spawnParticles(enemy.x, enemy.y, 8, '#ffbe2e', 70, 240, 2, 5);
        if (enemy.hp <= 0) {
          killEnemy(enemy, Math.atan2(half.vy, half.vx), 2);
        }
      },
      onVoidRiftTick: (vr) => {
        // Dimensional Void Rift slices touching enemies & pulls them in if Awakened!
        enemies.forEach((e) => {
          if (e.dead) return;
          if (vr.hasBlackHole && dist(e.x, e.y, vr.mx, vr.my) < 180) {
            e.x += (vr.mx - e.x) * 0.18;
            e.y += (vr.my - e.y) * 0.18;
          }
          if (pointToSegmentDist(e.x, e.y, vr.x1, vr.y1, vr.x2, vr.y2) <= e.radius + 26) {
            e.hp -= vr.damage;
            Effects.spawnParticles(e.x, e.y, 4, '#ff1e42', 50, 160, 2, 4);
            if (e.hp <= 0) killEnemy(e, 0, 1);
          }
        });
      },
      onVoidRiftCollapse: (vr) => {
        // Spatial Collapse Explosion along the rift!
        Effects.spawnShockwave(vr.mx, vr.my, 95, '#d946ef', 3.5, 0.25);
        enemies.forEach((e) => {
          if (!e.dead && pointToSegmentDist(e.x, e.y, vr.x1, vr.y1, vr.x2, vr.y2) <= e.radius + 65) {
            e.hp -= vr.damage * 2.2;
            if (e.hp <= 0) killEnemy(e, 0, 2);
          }
        });
      }
    });

    updateHud();
  }

  function triggerGraze(ex, ey) {
    player.focus = Math.min(player.maxFocus, player.focus + Config.PARAMS.GRAZE_FOCUS_GAIN);
    player.overheatTimer = 0; // Graze immediately cancels Overheat!
    player.ultGauge = Math.min(200, player.ultGauge + Config.PARAMS.GRAZE_ULT_GAIN);
    state.score += 500;
    Audio.playGraze();
    Effects.spawnShockwave(player.x, player.y, 42, '#00f0ff', 3, 0.2);
    Effects.spawnParticles((player.x + ex) / 2, (player.y + ey) / 2, 8, '#00f0ff', 80, 240, 2, 4);
    Effects.addFloatingText(player.x, player.y - 22, '見切り GRAZE! +集中', '#00f0ff', 15, -80);
  }

  function damagePlayer() {
    player.hp--;
    player.invuln = 1.4;
    player.isAiming = false;
    player.aimPoints = [];
    player.overheatTimer = 0;
    player.focus = player.maxFocus;

    // Combo is halved rather than zeroed so momentum stays exciting
    state.combo = Math.floor(state.combo * 0.5);
    Audio.playDamage();
    addShake(22);
    Effects.triggerChromatic(12, 0.25);
    Effects.triggerFlash('#ff1e42', 0.42);

    // Clear nearby bullets & push back enemies
    bullets = bullets.filter((b) => dist(b.x, b.y, player.x, player.y) > 210);
    enemies.forEach((e) => {
      const d = dist(e.x, e.y, player.x, player.y);
      if (d < 220 && !e.isGimmick) {
        const a = Math.atan2(e.y - player.y, e.x - player.x);
        e.vx += Math.cos(a) * 440;
        e.vy += Math.sin(a) * 440;
      }
    });

    updateHud();
    if (player.hp <= 0) {
      showResultModal(false);
    }
  }

  // ==========================================
  // 13. 12-LAYER RENDER PIPELINE
  // ==========================================
  function draw() {
    ctx.save();

    const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;
    const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(state.cameraZoom, state.cameraZoom);
    ctx.translate(-W / 2, -H / 2);

    const stageObj = getSelectedStage();
    const blade = getSelectedBlade();
    const isUlt100 = state.ult100Timer > 0;

    // Layer 1 & 2: Combo-Trance Background, Decals & Giant Brush Cut-Ins
    Effects.drawBackground(ctx, W, H, stageObj.theme, state.stylePhase, player.isAiming, isUlt100);

    // 200% Ultimate Black Hole Suction Visual
    if (state.ult200Phase > 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#ffbe2e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 58 + Math.sin(performance.now() * 0.02) * 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (state.ult200Phase === 2) {
        ctx.strokeStyle = '#ff1e42';
        ctx.lineWidth = 4;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(-W / 2, 0);
        ctx.lineTo(W / 2, 0);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Layer 3: Soul Gems & Golden Jackpot Scrolls
    gems.forEach((g) => {
      ctx.fillStyle = g.tornado ? '#00f0ff' : '#00f5a8';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - 5.5);
      ctx.lineTo(g.x + 5.5, g.y);
      ctx.lineTo(g.x, g.y + 5.5);
      ctx.lineTo(g.x - 5.5, g.y);
      ctx.closePath();
      ctx.fill();
    });

    scrolls.forEach((sc) => {
      ctx.save();
      ctx.translate(sc.x, sc.y);
      const r = sc.radius + Math.sin(sc.pulse) * 3;
      ctx.fillStyle = '#ffbe2e';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#07080c';
      ctx.font = '900 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('巻物', 0, 1);
      ctx.restore();
    });

    // Layer 4: Bisected Enemy Halves (Corpse Pinball)
    Effects.drawSlicedHalves(ctx);

    // Layer 5: Alive Enemies, Stage Gimmicks & Giant Boss
    enemies.forEach((e) => Entities.drawEnemy(ctx, e, isUlt100));
    if (boss) Entities.drawBoss(ctx, boss);

    // Layer 6: Enemy Bullets & Friendly Homing Kunai / Crescent Waves
    bullets.forEach((b) => {
      ctx.fillStyle = b.locked ? '#00f0ff' : '#ff1e42';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      if (b.locked) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    friendlyBlades.forEach((fb) => {
      ctx.save();
      ctx.translate(fb.x, fb.y);
      ctx.rotate(Math.atan2(fb.vy, fb.vx));
      ctx.strokeStyle = '#00f0ff';
      ctx.fillStyle = '#ffffff';
      if (fb.isWave) {
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(0, 0, fb.radius, -Math.PI * 0.42, Math.PI * 0.42);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(-6, 5);
        ctx.lineTo(-6, -5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });

    // Layer 7: Dimensional Void Rifts (Action D)
    Effects.drawVoidRifts(ctx);

    // Layer 8: Bullet-Time Direct Cursor Aiming Reticle & Chain Laser Connections
    if (player.isAiming) {
      if (player.lockedTargets.length > 0) {
        ctx.save();
        ctx.strokeStyle = player.thunderCharge >= 2 ? '#ffbe2e' : 'rgba(0, 240, 255, 0.85)';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        player.lockedTargets.forEach((t) => {
          const tx = t.ref ? t.ref.x : t.x;
          const ty = t.ref ? t.ref.y : t.y;
          ctx.lineTo(tx, ty);
        });
        ctx.lineTo(player.pointerX, player.pointerY);
        ctx.stroke();

        // Numbered Lock Badges
        player.lockedTargets.forEach((t, idx) => {
          const tx = t.ref ? t.ref.x : t.x;
          const ty = t.ref ? t.ref.y : t.y;
          ctx.fillStyle = '#ffbe2e';
          ctx.font = '900 12px sans-serif';
          ctx.fillText(`#${idx + 1}`, tx + 14, ty - 14);
        });
        ctx.restore();
      }

      // Direct Cursor Aiming Circle (Shows generous magnetic lock-on radius around finger/cursor)
      const effR = getEffectiveLockRadius();
      ctx.save();
      ctx.strokeStyle = player.thunderCharge > 0 ? '#ffbe2e' : '#00f0ff';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(player.pointerX, player.pointerY, effR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Layer 9: Cyber-Ronin Player & Focus Ring
    Entities.drawPlayer(ctx, player, blade, state.stylePhase);

    // Layer 10: Additive Neon Slash Trails, Lightning & Sparks
    Effects.drawAdditiveVfx(ctx, state.stylePhase);

    // Layer 11: Floating Damage & Callouts
    Effects.drawFloatingTexts(ctx);

    // Layer 12: Post-Process Speed Lines, Blazing Border, RGB Chromatic Aberration & Flash
    Effects.drawPostEffects(ctx, W, H, state.stylePhase, player.isAiming);

    ctx.restore();
  }

  // ==========================================
  // 14. HUD & MODAL UI UPDATES
  // ==========================================
  function updateHud() {
    if (state.score > saveData.highScore) {
      saveData.highScore = state.score;
    }
    if (state.maxChainThisRun > saveData.maxChainRecord) {
      saveData.maxChainRecord = state.maxChainThisRun;
    }

    document.getElementById('hud-score').textContent = state.score.toLocaleString();
    document.getElementById('hud-best').textContent = saveData.highScore.toLocaleString();
    document.getElementById('hud-coins').textContent = `${saveData.soulCoins.toLocaleString()}両`;

    // HP Pips
    const hpWrap = document.getElementById('hp-container');
    if (hpWrap.children.length !== player.maxHp) {
      hpWrap.innerHTML = '';
      for (let i = 0; i < player.maxHp; i++) {
        const pip = document.createElement('div');
        pip.className = 'hp-pip';
        hpWrap.appendChild(pip);
      }
    }
    Array.from(hpWrap.children).forEach((pip, idx) => {
      pip.className = 'hp-pip' + (idx < player.hp ? (player.hp === 1 ? ' active low' : ' active') : '');
    });

    // Thunder Charge Pips (Action B -> Action A Synergy)
    const chargePips = document.getElementById('charge-pips').children;
    for (let i = 0; i < 3; i++) {
      chargePips[i].className = 'charge-pip' + (i < player.thunderCharge ? ' lit' : '');
    }
    const multVal = Config.PARAMS.CHARGE_MULT_DMG[player.thunderCharge] || 1.0;
    document.getElementById('charge-bonus-text').textContent =
      player.thunderCharge === 3 ? '⚡MAX帯電 居合×2.1' : `居合威力 ×${multVal.toFixed(1)}`;

    // XP Bar
    document.getElementById('hud-level').textContent = `LV.${player.level} 剣士`;
    document.getElementById('hud-xp-text').textContent = `${Math.floor(player.xp)} / ${player.xpNext}`;
    document.getElementById('hud-xp-fill').style.width = `${Math.min(100, (player.xp / player.xpNext) * 100)}%`;

    // 2-Tier Ultimate Gauge (0% -> 100% -> 200%)
    const ultPct = Math.floor(player.ultGauge);
    document.getElementById('hud-ult-pct').textContent = `${ultPct}%`;
    document.getElementById('hud-ult-fill-100').style.width = `${Math.min(100, ultPct)}%`;
    document.getElementById('hud-ult-fill-200').style.width = `${Math.max(0, Math.min(100, ultPct - 100))}%`;

    const ultWrap = document.getElementById('ult-btn-wrap');
    const ultBtn = document.getElementById('btn-ult-trigger');
    const ultTitle = document.getElementById('ult-btn-title');
    if (ultPct >= 100 && state.mode === 'PLAY') {
      ultWrap.classList.remove('hidden');
      if (ultPct >= 200) {
        ultBtn.classList.add('tier-200');
        ultTitle.textContent = '⚡ 第弐奥義：絶・虚空一文字 (200% MAX) ⚡';
      } else {
        ultBtn.classList.remove('tier-200');
        ultTitle.textContent = `第壱奥義：千本桜・墨嵐 (${ultPct}%)`;
      }
    } else {
      ultWrap.classList.add('hidden');
    }

    // Stage Timer & Boss Bar
    const stageObj = getSelectedStage();
    document.getElementById('hud-stage-name').textContent = stageObj.name;
    if (stageObj.id === 3) {
      document.getElementById('hud-timer').textContent = '∞ 無限修羅';
    } else {
      const sec = Math.max(0, Math.ceil(state.stageTimer));
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      document.getElementById('hud-timer').textContent = `${m}:${s}`;
    }

    if (boss) {
      document.getElementById('boss-name-text').textContent = boss.name;
      document.getElementById('boss-hp-fill').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
      const coresRow = document.getElementById('boss-cores-row');
      coresRow.innerHTML = '';
      boss.cores.forEach((c, idx) => {
        const b = document.createElement('span');
        b.className = 'boss-core-pip' + (c.broken ? ' broken' : '');
        b.textContent = `弱点核${idx + 1}`;
        coresRow.appendChild(b);
      });
    }

    // Style Rank & Combo
    const { obj: rankObj } = getCurrentRankObj();
    const rankBox = document.getElementById('rank-box');
    rankBox.className = `rank-box rank-${rankObj.id}`;
    document.getElementById('hud-rank-title').textContent = rankObj.title;
    document.getElementById('hud-rank-letter').textContent = rankObj.letter;
    document.getElementById('hud-phase-badge').textContent = rankObj.phaseName;

    document.getElementById('hud-combo-num').textContent = state.combo;
    const cPct = state.combo > 0 ? (state.comboTimer / state.maxComboTimer) * 100 : 0;
    document.getElementById('hud-combo-timer').style.width = `${cPct}%`;
    document.getElementById('hud-multiplier').textContent = `SCORE & 魂 ×${rankObj.mult.toFixed(1)}`;
  }

  function renderTitleModal() {
    state.mode = 'TITLE';
    Audio.stopBgm();
    document.getElementById('hud').classList.add('hud-hidden');
    document.getElementById('ult-btn-wrap').classList.add('hidden');
    document.getElementById('dojo-overlay').classList.add('hidden');
    document.getElementById('result-overlay').classList.add('hidden');
    document.getElementById('title-overlay').classList.remove('hidden');

    document.getElementById('title-highscore').textContent = saveData.highScore.toLocaleString();
    document.getElementById('title-maxchain').textContent = saveData.maxChainRecord;
    document.getElementById('title-coins').textContent = `${saveData.soulCoins.toLocaleString()}両`;
    document.getElementById('title-blade-name').textContent = getSelectedBlade().name;

    const grid = document.getElementById('stage-select-grid');
    grid.innerHTML = '';
    Config.STAGES.forEach((st) => {
      const card = document.createElement('div');
      card.className = 'stage-card' + (saveData.selectedStage === st.id ? ' selected' : '');
      const clearedTag = saveData.clearedStages[st.id] ? ' ★討伐済' : '';
      card.innerHTML = `
        <div class="stage-card-tag">${st.tag}${clearedTag}</div>
        <div class="stage-card-title">${st.name}</div>
        <div class="stage-card-desc">${st.desc}</div>
      `;
      card.addEventListener('click', () => {
        saveData.selectedStage = st.id;
        writeSave();
        renderTitleModal();
      });
      grid.appendChild(card);
    });
  }

  function renderDojoModal() {
    state.mode = 'DOJO';
    document.getElementById('title-overlay').classList.add('hidden');
    document.getElementById('result-overlay').classList.add('hidden');
    document.getElementById('dojo-overlay').classList.remove('hidden');
    document.getElementById('dojo-coins').textContent = `${saveData.soulCoins.toLocaleString()}両`;

    // 1. Blades Grid
    const bGrid = document.getElementById('blade-grid');
    bGrid.innerHTML = '';
    Config.BLADES.forEach((bl) => {
      const unlocked = saveData.unlockedBlades.includes(bl.id);
      const equipped = saveData.selectedBlade === bl.id;
      const card = document.createElement('div');
      card.className = 'blade-card' + (equipped ? ' equipped' : '');

      let btnHtml = '';
      if (equipped) {
        btnHtml = `<button class="action-mini-btn" disabled>★ 現在装備中</button>`;
      } else if (unlocked) {
        btnHtml = `<button class="action-mini-btn" data-equip="${bl.id}">この刀を装備する</button>`;
      } else {
        const canBuy = saveData.soulCoins >= bl.cost;
        btnHtml = `<button class="action-mini-btn" data-buy-blade="${bl.id}" ${canBuy ? '' : 'disabled'}>解放する (${bl.cost.toLocaleString()}両)</button>`;
      }

      card.innerHTML = `
        <div>
          <div style="font-size:11px;font-weight:900;color:${bl.colorGlow};">${bl.sub}</div>
          <div style="font-size:17px;font-weight:900;margin:3px 0 6px;">${bl.name}</div>
          <div style="font-size:12px;color:var(--text-muted);line-height:1.45;">${bl.desc}</div>
        </div>
        ${btnHtml}
      `;
      bGrid.appendChild(card);
    });

    bGrid.querySelectorAll('[data-equip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        saveData.selectedBlade = btn.getAttribute('data-equip');
        writeSave();
        Audio.playSheatheClick();
        renderDojoModal();
      });
    });

    bGrid.querySelectorAll('[data-buy-blade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-buy-blade');
        const bl = Config.BLADES.find((x) => x.id === id);
        if (bl && saveData.soulCoins >= bl.cost) {
          saveData.soulCoins -= bl.cost;
          saveData.unlockedBlades.push(bl.id);
          saveData.selectedBlade = bl.id;
          writeSave();
          Audio.playLevelUp(true);
          renderDojoModal();
        }
      });
    });

    // 2. Dojo Upgrades Grid
    const dGrid = document.getElementById('dojo-grid');
    dGrid.innerHTML = '';
    Config.DOJO_UPGRADES.forEach((up) => {
      const lv = saveData.dojoLevels[up.id] || 0;
      const isMax = lv >= 5;
      const nextCost = isMax ? 0 : up.costs[lv];
      const canBuy = !isMax && saveData.soulCoins >= nextCost;

      const item = document.createElement('div');
      item.className = 'dojo-item';
      item.innerHTML = `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;">
            <span>${up.name}</span>
            <span class="gold-text">Lv.${lv}/5</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${up.desc}</div>
        </div>
        <button class="action-mini-btn" data-upg-dojo="${up.id}" ${canBuy ? '' : 'disabled'}>
          ${isMax ? '★ 極伝完了 (MAX)' : `鍛錬する (${nextCost.toLocaleString()}両)`}
        </button>
      `;
      dGrid.appendChild(item);
    });

    dGrid.querySelectorAll('[data-upg-dojo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-upg-dojo');
        const up = Config.DOJO_UPGRADES.find((x) => x.id === id);
        const lv = saveData.dojoLevels[id] || 0;
        if (up && lv < 5 && saveData.soulCoins >= up.costs[lv]) {
          saveData.soulCoins -= up.costs[lv];
          saveData.dojoLevels[id] = lv + 1;
          writeSave();
          Audio.playParry();
          renderDojoModal();
        }
      });
    });
  }

  function showResultModal(isClear) {
    state.mode = 'RESULT';
    Audio.stopBgm();
    if (isClear) Audio.playLevelUp(true);

    const earnedCoins =
      Math.floor(state.score / 220) + state.totalKills * 2 + (isClear ? 450 : 60);
    saveData.soulCoins += earnedCoins;
    writeSave();

    document.getElementById('result-eyebrow').textContent = isClear ? 'STAGE CLEAR — 敵将討伐' : 'SLASH ENDED — 再起せよ';
    document.getElementById('result-title').textContent = isClear ? '天晴・敵将討ち取ったり！！' : '力尽きた…（魂貨はすべて持ち帰り！）';
    document.getElementById('result-subtitle').textContent = isClear
      ? `${getSelectedStage().name} を完全制覇！獲得した魂貨で新たな名刀を解放し、次の幕へ挑め！`
      : '稼いだ魂貨はすべて保持されます。鍛冶場・道場で基礎ステータスや新しい刀を解放してリベンジしましょう！';

    document.getElementById('res-score').textContent = state.score.toLocaleString();
    document.getElementById('res-chain').textContent = state.maxChainThisRun;
    document.getElementById('res-kills').textContent = state.totalKills;
    document.getElementById('res-coins').textContent = `+${earnedCoins.toLocaleString()}両`;

    const nextBtnLabel = document.getElementById('btn-result-next-label');
    if (isClear && state.stageIdx < 3) {
      saveData.selectedStage = Math.min(3, state.stageIdx + 1);
      writeSave();
      nextBtnLabel.textContent = `次の幕へ出陣 — ${Config.STAGES[saveData.selectedStage].name}`;
    } else {
      nextBtnLabel.textContent = 'もう一度斬る — RETRY (SPACE)';
    }

    document.getElementById('result-overlay').classList.remove('hidden');
  }

  // ==========================================
  // 15. EVENT LISTENERS & MAIN RAF LOOP
  // ==========================================
  function getPointerPos(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      e.preventDefault();
      triggerUltimate();
      return;
    }
    if (e.button !== 0) return;
    const p = getPointerPos(e);
    onPointerDown(p.x, p.y);
  });

  window.addEventListener('mousemove', (e) => {
    const p = getPointerPos(e);
    onPointerMove(p.x, p.y);
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      onPointerUp(e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const p = getPointerPos(e);
    onPointerDown(p.x, p.y);
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (state.mode === 'PLAY') e.preventDefault();
    const p = getPointerPos(e);
    onPointerMove(p.x, p.y);
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    const touch = (e.changedTouches && e.changedTouches[0]) || { clientX: player.pointerX, clientY: player.pointerY };
    onPointerUp(touch.clientX, touch.clientY);
  });

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
      if (state.mode === 'PLAY') {
        e.preventDefault();
        triggerUltimate();
      } else if (state.mode === 'TITLE' || state.mode === 'RESULT') {
        e.preventDefault();
        startGame(saveData.selectedStage);
      }
    } else if (e.code === 'KeyR' && state.mode === 'PLAY') {
      startGame(state.stageIdx);
    } else if (state.mode === 'LEVELUP' && state.currentChoices.length > 0) {
      if (e.key === '1' && state.currentChoices[0]) selectUpgradeChoice(state.currentChoices[0]);
      if (e.key === '2' && state.currentChoices[1]) selectUpgradeChoice(state.currentChoices[1]);
      if (e.key === '3' && state.currentChoices[2]) selectUpgradeChoice(state.currentChoices[2]);
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // UI Button Bindings
  document.getElementById('btn-start-game').addEventListener('click', () => startGame(saveData.selectedStage));
  document.getElementById('btn-open-dojo').addEventListener('click', () => {
    Audio.init();
    renderDojoModal();
  });
  document.getElementById('btn-close-dojo').addEventListener('click', renderTitleModal);
  document.getElementById('btn-gift-coins').addEventListener('click', () => {
    Audio.init();
    saveData.soulCoins += 5000;
    writeSave();
    Audio.playLevelUp(true);
    renderDojoModal();
  });

  document.getElementById('btn-sound').addEventListener('click', (e) => {
    const muted = Audio.toggleMute();
    e.currentTarget.textContent = muted ? '🔇 音響 OFF' : '🔊 音響 ON';
  });

  document.getElementById('btn-retry-quick').addEventListener('click', () => startGame(state.stageIdx));
  document.getElementById('btn-to-title').addEventListener('click', renderTitleModal);
  document.getElementById('btn-ult-trigger').addEventListener('click', triggerUltimate);

  document.getElementById('btn-result-dojo').addEventListener('click', renderDojoModal);
  document.getElementById('btn-result-retry').addEventListener('click', () => startGame(saveData.selectedStage));

  // Initial Title Render & Main Animation Loop
  renderTitleModal();
  let lastTime = performance.now();
  function loop(now) {
    const rawDt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(rawDt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    startGame
  };
})();
