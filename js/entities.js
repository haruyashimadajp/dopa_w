window.ZetsuIssen = window.ZetsuIssen || {};

window.ZetsuIssen.Entities = (() => {
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  // ==========================================
  // 1. ENEMY & GIMMICK FACTORY
  // ==========================================
  function createEnemy(type, x, y, waveScale = 1.0) {
    const specs = {
      swarm: { radius: 14, hp: 1, speed: rand(88, 120), color: '#ff1e42', score: 120, xp: 1 },
      shooter: { radius: 16, hp: 1, speed: rand(55, 75), color: '#ff7b00', score: 200, xp: 2, shootCd: rand(1.3, 2.4) },
      splitter: { radius: 18, hp: 1, speed: rand(95, 125), color: '#00f0ff', score: 220, xp: 2 },
      bomb: { radius: 20, hp: 1, speed: rand(50, 70), color: '#ffbe2e', score: 320, xp: 3 },
      oni: { radius: 26, hp: Math.round(3 * waveScale), speed: rand(48, 65), color: '#e11d48', score: 650, xp: 5, isElite: true },
      ronin: { radius: 20, hp: Math.round(2 * waveScale), speed: rand(110, 140), color: '#d946ef', score: 700, xp: 5, isElite: true, chargeCd: 2.2 },
      // Stage Gimmicks
      barrel: { radius: 22, hp: 1, speed: 0, color: '#ffbe2e', score: 400, xp: 3, isGimmick: true },
      lantern: { radius: 22, hp: 1, speed: 0, color: '#00f0ff', score: 450, xp: 3, isGimmick: true },
      crystal: { radius: 23, hp: 1, speed: 0, color: '#d946ef', score: 500, xp: 4, isGimmick: true }
    };

    const s = specs[type] || specs.swarm;
    return {
      id: Math.random(),
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: s.radius,
      hp: s.hp,
      maxHp: s.hp,
      speed: s.speed,
      color: s.color,
      score: s.score,
      xp: s.xp,
      isElite: Boolean(s.isElite),
      isGimmick: Boolean(s.isGimmick),
      shootCd: s.shootCd || 2.0,
      chargeCd: s.chargeCd || 2.5,
      charging: false,
      chargeWarningTimer: 0,
      chargeTargetX: 0,
      chargeTargetY: 0,
      lockCount: 0,
      sliced: false,
      lastSlashAngle: 0,
      grazeCd: 0,
      angle: 0,
      pulse: Math.random() * Math.PI * 2,
      dead: false
    };
  }

  // ==========================================
  // 2. OPENING BONANZA & 5 GEOMETRIC FORMATION SPAWNER
  // ==========================================
  function spawnOpeningBonanza(W, H, playerX, playerY, enemies) {
    const cx = W / 2;
    const cy = Math.max(150, playerY - 190);

    // Center Powder Barrel
    enemies.push(createEnemy('barrel', cx, cy, 1.0));

    // Inner ring: 8 Swarm Spiders + 2 Bomb Lanterns
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const t = i % 5 === 0 ? 'bomb' : 'swarm';
      enemies.push(createEnemy(t, cx + Math.cos(a) * 58, cy + Math.sin(a) * 58, 1.0));
    }

    // Outer ring: 12 Swarm Spiders
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      enemies.push(createEnemy('swarm', cx + Math.cos(a) * 108, cy + Math.sin(a) * 108, 1.0));
    }
  }

  function spawnFormation(formationIndex, W, H, stageObj, waveScale, enemies) {
    const cx = rand(140, W - 140);
    const cy = rand(130, H - 130);
    const gimmicks = stageObj.gimmickTypes || ['barrel'];
    const gimType = gimmicks[Math.floor(Math.random() * gimmicks.length)];

    if (formationIndex === 0) {
      // Formation 1: S-Curve Daimyo Parade (18 enemies along a sine curve)
      const startX = Math.random() < 0.5 ? 80 : W - 80;
      const dir = startX < W / 2 ? 1 : -1;
      const baseY = rand(140, H - 140);
      for (let i = 0; i < 18; i++) {
        const px = Math.max(40, Math.min(W - 40, startX + dir * i * 32));
        const py = Math.max(50, Math.min(H - 50, baseY + Math.sin(i * 0.55) * 85));
        const t = i === 0 ? (stageObj.id >= 1 ? 'ronin' : 'oni') : (i === 9 ? 'bomb' : 'swarm');
        enemies.push(createEnemy(t, px, py, waveScale));
      }
    } else if (formationIndex === 1) {
      // Formation 2: Gimmick Barrel / Lantern Double Ring (20 enemies)
      enemies.push(createEnemy(gimType, cx, cy, waveScale));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        enemies.push(createEnemy('swarm', cx + Math.cos(a) * 55, cy + Math.sin(a) * 55, waveScale));
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const t = i % 4 === 0 ? 'splitter' : 'swarm';
        enemies.push(createEnemy(t, cx + Math.cos(a) * 102, cy + Math.sin(a) * 102, waveScale));
      }
    } else if (formationIndex === 2) {
      // Formation 3: Diagonal V-Squadron (15 enemies)
      for (let i = -7; i <= 7; i++) {
        const px = Math.max(40, Math.min(W - 40, cx + i * 28));
        const py = Math.max(50, Math.min(H - 50, cy + Math.abs(i) * 22));
        const t = i === 0 ? 'bomb' : (Math.abs(i) % 3 === 0 ? 'splitter' : 'swarm');
        enemies.push(createEnemy(t, px, py, waveScale));
      }
    } else if (formationIndex === 3) {
      // Formation 4: Archimedean Spiral Vortex (24 enemies begging for circular swipe!)
      enemies.push(createEnemy(gimType, cx, cy, waveScale));
      for (let i = 0; i < 22; i++) {
        const a = i * 0.52;
        const r = 28 + i * 5.8;
        const px = Math.max(35, Math.min(W - 35, cx + Math.cos(a) * r));
        const py = Math.max(45, Math.min(H - 45, cy + Math.sin(a) * r));
        enemies.push(createEnemy(i === 21 ? 'oni' : 'swarm', px, py, waveScale));
      }
    } else {
      // Formation 5: Sniper & Elite Fortress (14 enemies)
      enemies.push(createEnemy(stageObj.id >= 1 ? 'ronin' : 'oni', cx, cy, waveScale));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        enemies.push(createEnemy('shooter', cx + Math.cos(a) * 65, cy + Math.sin(a) * 65, waveScale));
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        enemies.push(createEnemy('swarm', cx + Math.cos(a) * 110, cy + Math.sin(a) * 110, waveScale));
      }
    }
  }

  // ==========================================
  // 3. GIANT STAGE BOSSES (With Weak Cores & ALL BREAK + Execution)
  // ==========================================
  function createBoss(bossId, W, H, scale = 1.0) {
    if (bossId === 'kurogane') {
      // Stage 1 Boss: Mecha-Centipede KUROGANE (8 segments, 4 weak cores)
      const maxHp = Math.round(160 * scale);
      const segments = [];
      for (let i = 0; i < 8; i++) {
        segments.push({ x: W / 2, y: -60 - i * 38, radius: i === 0 ? 34 : 28 });
      }
      const cores = [0, 2, 5, 7].map((segIdx, idx) => ({
        id: `core_${idx}`,
        segIdx,
        x: W / 2,
        y: -60,
        radius: 22,
        locked: false,
        broken: false
      }));
      return {
        id: 'kurogane',
        name: 'からくり大百足・黒鉄',
        x: W / 2,
        y: 120,
        vx: 165,
        vy: 115,
        radius: 36,
        hp: maxHp,
        maxHp,
        segments,
        cores,
        stunTimer: 0,
        attackTimer: 2.8,
        phaseAngle: 0,
        inExecution: false,
        executionTimer: 0
      };
    }

    if (bossId === 'gokuen') {
      // Stage 2 Boss: Six-Armed General GOKUEN (Central body + 6 orbiting mecha-arms)
      const maxHp = Math.round(240 * scale);
      const cores = [];
      for (let i = 0; i < 6; i++) {
        cores.push({
          id: `arm_${i}`,
          armIdx: i,
          x: W / 2,
          y: H * 0.3,
          radius: 22,
          locked: false,
          broken: false
        });
      }
      return {
        id: 'gokuen',
        name: '六腕の重装鬼将・獄炎',
        x: W / 2,
        y: H * 0.32,
        vx: 0,
        vy: 0,
        radius: 48,
        hp: maxHp,
        maxHp,
        cores,
        stunTimer: 0,
        attackTimer: 2.5,
        phaseAngle: 0,
        inExecution: false,
        executionTimer: 0
      };
    }

    // Stage 3 Boss: Void Sword Saint MUMYO (Central sword saint + 5 void mirrors = 6 weak cores)
    const maxHp = Math.round(320 * scale);
    const cores = [];
    for (let i = 0; i < 6; i++) {
      cores.push({
        id: `mirror_${i}`,
        mirrorIdx: i,
        x: W / 2,
        y: H * 0.3,
        radius: 21,
        locked: false,
        broken: false
      });
    }
    return {
      id: 'mumyo',
      name: '次元喰らいの剣聖・無明',
      x: W / 2,
      y: H * 0.32,
      vx: 0,
      vy: 0,
      radius: 34,
      hp: maxHp,
      maxHp,
      cores,
      stunTimer: 0,
      attackTimer: 2.2,
      phaseAngle: 0,
      slashWarnings: [],
      inExecution: false,
      executionTimer: 0
    };
  }

  function updateBoss(boss, dt, W, H, player, bullets, effects, onEnemySlashLine) {
    if (!boss || boss.inExecution) return;

    if (boss.stunTimer > 0) {
      boss.stunTimer -= dt;
      if (boss.stunTimer <= 0) {
        // Restore weak cores after stun finishes
        boss.cores.forEach((c) => {
          c.broken = false;
          c.locked = false;
        });
      }
      return;
    }

    boss.phaseAngle += dt * 1.8;

    if (boss.id === 'kurogane') {
      // Centipede slithers smoothly around arena
      boss.x += boss.vx * dt;
      boss.y += boss.vy * dt + Math.sin(boss.phaseAngle * 2.2) * 75 * dt;
      if (boss.x < 90 || boss.x > W - 90) boss.vx *= -1;
      if (boss.y < 90 || boss.y > H - 110) boss.vy *= -1;
      boss.x = Math.max(80, Math.min(W - 80, boss.x));
      boss.y = Math.max(80, Math.min(H - 100, boss.y));

      // Follow segments
      boss.segments[0].x = boss.x;
      boss.segments[0].y = boss.y;
      for (let i = 1; i < boss.segments.length; i++) {
        const prev = boss.segments[i - 1];
        const cur = boss.segments[i];
        const a = Math.atan2(prev.y - cur.y, prev.x - cur.x);
        cur.x = prev.x - Math.cos(a) * 38;
        cur.y = prev.y - Math.sin(a) * 38;
      }
      boss.cores.forEach((c) => {
        const seg = boss.segments[c.segIdx];
        c.x = seg.x;
        c.y = seg.y;
      });
    } else if (boss.id === 'gokuen') {
      // Six-armed warlord hovers and orbits 6 weapon arms
      boss.x = W / 2 + Math.cos(boss.phaseAngle * 0.6) * (W * 0.22);
      boss.y = H * 0.36 + Math.sin(boss.phaseAngle * 0.9) * (H * 0.14);
      boss.cores.forEach((c, idx) => {
        const a = boss.phaseAngle * 1.3 + (idx / 6) * Math.PI * 2;
        const r = 105 + Math.sin(boss.phaseAngle * 2 + idx) * 15;
        c.x = boss.x + Math.cos(a) * r;
        c.y = boss.y + Math.sin(a) * r;
      });
    } else {
      // Sword Saint Mumyo teleports/glides & orbits 5 void mirrors + body core
      boss.x = W / 2 + Math.sin(boss.phaseAngle * 0.85) * (W * 0.26);
      boss.y = H * 0.38 + Math.cos(boss.phaseAngle * 1.1) * (H * 0.18);
      boss.cores.forEach((c, idx) => {
        if (idx === 5) {
          c.x = boss.x;
          c.y = boss.y;
        } else {
          const a = -boss.phaseAngle * 1.6 + (idx / 5) * Math.PI * 2;
          c.x = boss.x + Math.cos(a) * 115;
          c.y = boss.y + Math.sin(a) * rMirror(boss.phaseAngle);
        }
      });
    }

    // Boss bullet barrage (deflectable red bullets for high parry dopamine!)
    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0) {
      boss.attackTimer = boss.id === 'mumyo' ? 1.8 : 2.3;
      const count = boss.id === 'kurogane' ? 10 : (boss.id === 'gokuen' ? 14 : 16);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + boss.phaseAngle;
        bullets.push({
          x: boss.x,
          y: boss.y,
          vx: Math.cos(a) * 235,
          vy: Math.sin(a) * 235,
          radius: 8,
          locked: false,
          grazeCd: 0,
          dead: false
        });
      }
      if (boss.id === 'mumyo' && onEnemySlashLine) {
        onEnemySlashLine(boss.x, boss.y, player.x, player.y);
      }
    }
  }

  function rMirror(phase) {
    return 115 + Math.sin(phase * 3) * 18;
  }

  // ==========================================
  // 4. PROCEDURAL DRAWING OF PLAYER, ENEMIES & BOSSES
  // ==========================================
  function drawEnemy(ctx, e, isUlt100) {
    ctx.save();
    ctx.translate(e.x, e.y);

    // 1. Gimmick Objects (Powder Barrel, Thunder Lantern, Void Crystal)
    if (e.isGimmick) {
      const r = e.radius + Math.sin(e.pulse * 3) * 2.5;
      ctx.fillStyle = e.sliced ? '#ffffff' : e.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      if (e.type === 'barrel') {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#07080c';
        ctx.font = '900 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('火薬', 0, 1);
      } else if (e.type === 'lantern') {
        ctx.beginPath();
        ctx.moveTo(0, -r - 3);
        ctx.lineTo(r + 3, 0);
        ctx.lineTo(0, r + 3);
        ctx.lineTo(-r - 3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#07080c';
        ctx.font = '900 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('紫電', 0, 1);
      } else {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + e.pulse * 0.5;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('虚空', 0, 1);
      }
    } else {
      // 2. Combat Enemies
      // Sniper red aiming laser
      if (e.type === 'shooter' && e.shootCd < 0.75) {
        ctx.save();
        ctx.rotate(e.angle);
        ctx.strokeStyle = 'rgba(255, 30, 66, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(360, 0);
        ctx.stroke();
        ctx.restore();
      }

      // Berserk Ronin crimson charge telegraph line (Counter-Slash window!)
      if (e.type === 'ronin' && e.chargeWarningTimer > 0) {
        ctx.save();
        ctx.strokeStyle = '#ffbe2e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(e.chargeTargetX - e.x, e.chargeTargetY - e.y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = e.sliced ? '#ffffff' : (isUlt100 ? '#090a0f' : e.color);
      ctx.strokeStyle = isUlt100 ? '#ff1e42' : '#ffffff';
      ctx.lineWidth = e.isElite ? 2.5 : 1.4;

      if (e.type === 'oni') {
        // Armored Oni Hexagon + Demon Horns
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + e.angle;
          const px = Math.cos(a) * e.radius;
          const py = Math.sin(a) * e.radius;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'bomb') {
        const r = e.radius + Math.sin(e.pulse * 2.5) * 2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#07080c';
        ctx.font = '900 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('爆', 0, 1);
      } else if (e.type === 'splitter') {
        // Shuriken 4-star ninja
        ctx.rotate(e.pulse);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const r = k % 2 === 0 ? e.radius + 3 : e.radius * 0.45;
          const a = (k / 8) * Math.PI * 2;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (e.type === 'shooter' || e.type === 'ronin') {
        ctx.rotate(e.angle);
        ctx.beginPath();
        ctx.moveTo(e.radius + 5, 0);
        ctx.lineTo(-e.radius * 0.7, e.radius * 0.85);
        ctx.lineTo(-e.radius * 0.4, 0);
        ctx.lineTo(-e.radius * 0.7, -e.radius * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Swarm Spider Drone
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        // Glowing cyber eyes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -3, 3, 3);
        ctx.fillRect(2, -3, 3, 3);
      }
    }

    // Lock-On Reticle
    if (e.lockCount > 0 || e.sliced) {
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2.5;
      const lr = e.radius + 8;
      ctx.beginPath();
      ctx.arc(0, 0, lr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-lr, -lr);
      ctx.lineTo(lr, lr);
      ctx.moveTo(lr, -lr);
      ctx.lineTo(-lr, lr);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBoss(ctx, boss) {
    if (!boss) return;
    ctx.save();

    if (boss.id === 'kurogane') {
      // Draw Centipede segments from tail to head
      for (let i = boss.segments.length - 1; i >= 0; i--) {
        const seg = boss.segments[i];
        ctx.save();
        ctx.translate(seg.x, seg.y);
        ctx.fillStyle = boss.stunTimer > 0 ? '#475569' : (i === 0 ? '#ff1e42' : '#1e293b');
        ctx.strokeStyle = '#ffbe2e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, seg.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Draw Gokuen or Mumyo central body
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.fillStyle = boss.stunTimer > 0 ? '#475569' : (boss.id === 'gokuen' ? '#991b1b' : '#0f172a');
      ctx.strokeStyle = boss.id === 'gokuen' ? '#ffbe2e' : '#00f0ff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + boss.phaseAngle * 0.5;
        const r = boss.radius;
        if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw Golden Weak Cores (弱点核)
    boss.cores.forEach((c, idx) => {
      if (c.broken) return;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.fillStyle = c.locked ? '#00f0ff' : '#ffbe2e';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, c.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#07080c';
      ctx.font = '900 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`核${idx + 1}`, 0, 1);

      if (c.locked) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, c.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });

    // Stunned / Execution status callout
    if (boss.inExecution) {
      ctx.fillStyle = '#ffbe2e';
      ctx.font = '900 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ 処刑（EXECUTION）— 斬り刻め！！ ⚡', boss.x, boss.y - boss.radius - 32);
    } else if (boss.stunTimer > 0) {
      ctx.fillStyle = '#00f0ff';
      ctx.font = '900 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`★ 部位全破壊 BREAK!! (${boss.stunTimer.toFixed(1)}s) ★`, boss.x, boss.y - boss.radius - 26);
    }

    ctx.restore();
  }

  function drawPlayer(ctx, player, bladeObj, stylePhase) {
    ctx.save();

    // 1. Flowing Cyber-Scarf Trail
    if (player.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = bladeObj.colorGlow;
      ctx.lineCap = 'round';
      for (let i = 1; i < player.trail.length; i++) {
        const p0 = player.trail[i - 1];
        const p1 = player.trail[i];
        const ratio = i / player.trail.length;
        ctx.globalAlpha = ratio * 0.55;
        ctx.lineWidth = ratio * 10;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Phase 3 (Rank SS/SSS) Dual Crimson Shadow Clones trailing player
    if (stylePhase === 3 && player.trail.length >= 6) {
      [-1, 1].forEach((side, idx) => {
        const tp = player.trail[Math.max(0, player.trail.length - 3 - idx * 2)];
        ctx.save();
        ctx.translate(tp.x + side * 18, tp.y + side * 12);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ff1e42';
        ctx.beginPath();
        ctx.arc(0, 0, player.radius * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // 3. Awakened Parry Shield ('【極意】八咫鏡・千本クナイ陣')
    if (player.awakenedSkills.has('awk_parry')) {
      ctx.save();
      ctx.translate(player.x, player.y);
      const t = performance.now() * 0.006;
      for (let b = 0; b < 8; b++) {
        const a = t + (b / 8) * Math.PI * 2;
        const bx = Math.cos(a) * 44;
        const by = Math.sin(a) * 44;
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Main Cyber-Ronin Silhouette & Conical Hat (編み笠)
    ctx.translate(player.x, player.y);
    if (player.invuln > 0 && Math.floor(player.invuln * 24) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    // Outer Focus Gauge Ring
    const focusPct = Math.max(0, player.focus / player.maxFocus);
    ctx.strokeStyle = player.overheatTimer > 0
      ? '#ff1e42'
      : (player.thunderCharge >= 3 ? '#ffbe2e' : bladeObj.colorGlow);
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * focusPct);
    ctx.stroke();

    // Thunder Charge Orbiting Golden Lightning Orbs (1-3 stacks)
    if (player.thunderCharge > 0) {
      const orbT = performance.now() * 0.008;
      for (let c = 0; c < player.thunderCharge; c++) {
        const ca = orbT + (c / player.thunderCharge) * Math.PI * 2;
        ctx.fillStyle = '#ffbe2e';
        ctx.beginPath();
        ctx.arc(Math.cos(ca) * (player.radius + 15), Math.sin(ca) * (player.radius + 15), 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Woven Conical Hat (編み笠)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = bladeObj.colorGlow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Radial hat ribs
    ctx.strokeStyle = '#07080c';
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * player.radius, Math.sin(a) * player.radius);
      ctx.stroke();
    }

    // Center apex
    ctx.fillStyle = '#07080c';
    ctx.beginPath();
    ctx.arc(0, 0, player.radius * 0.36, 0, Math.PI * 2);
    ctx.fill();

    // Overheat Warning Label
    if (player.overheatTimer > 0) {
      ctx.fillStyle = '#ff1e42';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('息切れ! (かすりで回復)', 0, player.radius + 26);
    }

    ctx.restore();
  }

  return {
    createEnemy,
    spawnOpeningBonanza,
    spawnFormation,
    createBoss,
    updateBoss,
    drawEnemy,
    drawBoss,
    drawPlayer
  };
})();
