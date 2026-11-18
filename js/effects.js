window.ZetsuIssen = window.ZetsuIssen || {};

window.ZetsuIssen.Effects = (() => {
  class EffectManager {
    constructor() {
      this.decals = [];
      this.slicedHalves = [];
      this.voidRifts = [];
      this.slashTrails = [];
      this.particles = [];
      this.shockwaves = [];
      this.floatingTexts = [];
      this.brushCutIns = [];
      this.lightningBolts = [];
      this.ambientEmbers = [];

      // Screen & Post-Process states
      this.beatPulse = 0;
      this.bgRotation = 0;
      this.chromaticTimer = 0;
      this.chromaticStrength = 0;
      this.flashAlpha = 0;
      this.flashColor = '#ffffff';
      this.screenSplitTimer = 0;
      this.screenSplitAngle = 0;

      this._initAmbientEmbers();
    }

    _initAmbientEmbers() {
      this.ambientEmbers = [];
      for (let i = 0; i < 95; i++) {
        this.ambientEmbers.push({
          x: Math.random() * 2000,
          y: Math.random() * 1200,
          vx: (Math.random() - 0.5) * 40,
          vy: -40 - Math.random() * 110,
          size: 1.8 + Math.random() * 4.2,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 5,
          hueType: i % 3
        });
      }
    }

    reset() {
      this.decals = [];
      this.slicedHalves = [];
      this.voidRifts = [];
      this.slashTrails = [];
      this.particles = [];
      this.shockwaves = [];
      this.floatingTexts = [];
      this.brushCutIns = [];
      this.lightningBolts = [];
      this.beatPulse = 0;
      this.chromaticTimer = 0;
      this.flashAlpha = 0;
      this.screenSplitTimer = 0;
    }

    onBeat(stylePhase) {
      this.beatPulse = stylePhase === 3 ? 1.0 : (stylePhase === 2 ? 0.65 : 0.28);
      if (stylePhase === 3) {
        // Spawn background lightning arc on beat during Rank SS/SSS Trance!
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.spawnLightning(
          Math.random() * w,
          0,
          Math.random() * w,
          h,
          Math.random() < 0.5 ? '#ffbe2e' : '#ff1e42',
          3.5
        );
      }
    }

    triggerChromatic(strength = 8, duration = 0.18) {
      this.chromaticStrength = Math.max(this.chromaticStrength, strength);
      this.chromaticTimer = Math.max(this.chromaticTimer, duration);
    }

    triggerFlash(color = '#ffffff', alpha = 0.4) {
      this.flashColor = color;
      this.flashAlpha = Math.max(this.flashAlpha, alpha);
    }

    triggerScreenSplit(angle = 0, duration = 0.45) {
      this.screenSplitAngle = angle;
      this.screenSplitTimer = duration;
    }

    spawnBrushCutIn(kanji, subtext = '', color = '#ffbe2e') {
      this.brushCutIns.push({
        kanji,
        subtext,
        color,
        life: 1.55,
        maxLife: 1.55,
        scale: 1.65
      });
    }

    spawnInkDecal(x, y, radius, isGold = false) {
      if (this.decals.length > 70) this.decals.shift();
      const blobs = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
        const d = radius * (0.4 + Math.random() * 0.9);
        blobs.push({
          ox: Math.cos(a) * d,
          oy: Math.sin(a) * d,
          r: radius * (0.25 + Math.random() * 0.45)
        });
      }
      this.decals.push({
        x,
        y,
        radius,
        isGold,
        blobs,
        life: 9.0,
        maxLife: 9.0
      });
    }

    // Corpse Pinball: Bisected enemy halves fly out and bowl into other enemies!
    spawnSlicedBody(x, y, radius, color, slashAngle, damage, isExplosiveCorpse = false) {
      const perp = slashAngle + Math.PI / 2;
      [-1, 1].forEach((dir) => {
        const flyAngle = slashAngle + dir * 0.28 + (Math.random() - 0.5) * 0.15;
        const speed = 580 + Math.random() * 180;
        this.slicedHalves.push({
          x: x + Math.cos(perp) * dir * 4,
          y: y + Math.sin(perp) * dir * 4,
          vx: Math.cos(flyAngle) * speed,
          vy: Math.sin(flyAngle) * speed,
          radius,
          color,
          slashAngle,
          half: dir,
          damage,
          isExplosiveCorpse,
          hitIds: new Set(),
          life: 0.55,
          maxLife: 0.55
        });
      });
    }

    spawnVoidRift(x1, y1, x2, y2, damage, duration = 2.6, hasBlackHole = false) {
      if (this.voidRifts.length > 28) this.voidRifts.shift();
      this.voidRifts.push({
        x1,
        y1,
        x2,
        y2,
        mx: (x1 + x2) / 2,
        my: (y1 + y2) / 2,
        damage,
        life: duration,
        maxLife: duration,
        tickTimer: 0.1,
        hasBlackHole
      });
    }

    spawnSlashTrail(x1, y1, x2, y2, colorCore, colorGlow, width = 8, duration = 0.48) {
      if (this.slashTrails.length > 110) this.slashTrails.shift();
      this.slashTrails.push({
        x1,
        y1,
        x2,
        y2,
        colorCore,
        colorGlow,
        width,
        life: duration,
        maxLife: duration
      });
    }

    spawnParticles(x, y, count, color, speedMin = 80, speedMax = 420, sizeMin = 2, sizeMax = 6) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= 750) this.particles.shift();
        const a = Math.random() * Math.PI * 2;
        const spd = speedMin + Math.random() * (speedMax - speedMin);
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          color,
          size: sizeMin + Math.random() * (sizeMax - sizeMin),
          life: 0.25 + Math.random() * 0.45,
          maxLife: 0.70,
          drag: 0.91
        });
      }
    }

    spawnShockwave(x, y, maxRadius, color = '#00f0ff', lineWidth = 4, duration = 0.32) {
      this.shockwaves.push({
        x,
        y,
        radius: 10,
        maxRadius,
        color,
        lineWidth,
        life: duration,
        maxLife: duration
      });
    }

    spawnLightning(x1, y1, x2, y2, color = '#00f0ff', width = 3) {
      const pts = [{ x: x1, y: y1 }];
      const steps = 6;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        pts.push({
          x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * 34,
          y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * 34
        });
      }
      pts.push({ x: x2, y: y2 });
      this.lightningBolts.push({
        pts,
        color,
        width,
        life: 0.24,
        maxLife: 0.24
      });
    }

    addFloatingText(x, y, text, color = '#ffffff', size = 20, vy = -95) {
      if (this.floatingTexts.length > 75) this.floatingTexts.shift();
      this.floatingTexts.push({
        x,
        y,
        text,
        color,
        size,
        vy,
        life: 0.80,
        maxLife: 0.80
      });
    }

    update(dt, rawDt, gameContext) {
      const { enemies, stylePhase, W, H, onCorpseBowlHit, onVoidRiftTick, onVoidRiftCollapse } = gameContext;

      this.beatPulse = Math.max(0, this.beatPulse - rawDt * 3.8);
      this.bgRotation += rawDt * (stylePhase === 3 ? 0.85 : (stylePhase === 2 ? 0.45 : 0.15));
      this.chromaticTimer = Math.max(0, this.chromaticTimer - rawDt);
      this.flashAlpha = Math.max(0, this.flashAlpha - rawDt * 2.4);
      this.screenSplitTimer = Math.max(0, this.screenSplitTimer - rawDt);

      // Ambient Embers / Neon Sakura update
      const emberSpeedMult = stylePhase === 3 ? 3.0 : (stylePhase === 2 ? 1.8 : 0.7);
      this.ambientEmbers.forEach((em) => {
        em.x += em.vx * rawDt * emberSpeedMult;
        em.y += em.vy * rawDt * emberSpeedMult;
        em.angle += em.spin * rawDt;
        if (em.y < -20) {
          em.y = H + 20;
          em.x = Math.random() * W;
        }
        if (em.x < -20) em.x = W + 20;
        if (em.x > W + 20) em.x = -20;
      });

      // Decals
      for (let i = this.decals.length - 1; i >= 0; i--) {
        this.decals[i].life -= dt;
        if (this.decals[i].life <= 0) this.decals.splice(i, 1);
      }

      // Brush Calligraphy Cut-Ins
      for (let i = this.brushCutIns.length - 1; i >= 0; i--) {
        const bc = this.brushCutIns[i];
        bc.life -= rawDt;
        bc.scale += (1.0 - bc.scale) * Math.min(1, rawDt * 14);
        if (bc.life <= 0) this.brushCutIns.splice(i, 1);
      }

      // Sliced Halves (Corpse Pinball Bowling!)
      for (let i = this.slicedHalves.length - 1; i >= 0; i--) {
        const sh = this.slicedHalves[i];
        sh.life -= rawDt;
        sh.x += sh.vx * rawDt;
        sh.y += sh.vy * rawDt;
        sh.vx *= 0.93;
        sh.vy *= 0.93;

        // Check bowling collision against alive enemies
        if (sh.life > 0.12 && enemies && onCorpseBowlHit) {
          for (let j = 0; j < enemies.length; j++) {
            const e = enemies[j];
            if (!e.dead && !sh.hitIds.has(e.id)) {
              const d = Math.hypot(e.x - sh.x, e.y - sh.y);
              if (d < e.radius + sh.radius + 6) {
                sh.hitIds.add(e.id);
                onCorpseBowlHit(e, sh);
              }
            }
          }
        }

        if (sh.life <= 0) this.slicedHalves.splice(i, 1);
      }

      // Void Rifts (Action D: Spatial Fissures)
      for (let i = this.voidRifts.length - 1; i >= 0; i--) {
        const vr = this.voidRifts[i];
        vr.life -= dt;
        vr.tickTimer -= dt;
        if (vr.tickTimer <= 0) {
          vr.tickTimer = 0.16;
          if (onVoidRiftTick) onVoidRiftTick(vr);
        }
        if (vr.life <= 0) {
          if (onVoidRiftCollapse) onVoidRiftCollapse(vr);
          this.voidRifts.splice(i, 1);
        }
      }

      // Slash Trails
      for (let i = this.slashTrails.length - 1; i >= 0; i--) {
        this.slashTrails[i].life -= rawDt;
        if (this.slashTrails[i].life <= 0) this.slashTrails.splice(i, 1);
      }

      // Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life -= rawDt;
        pt.x += pt.vx * rawDt;
        pt.y += pt.vy * rawDt;
        pt.vx *= pt.drag;
        pt.vy *= pt.drag;
        if (pt.life <= 0) this.particles.splice(i, 1);
      }

      // Shockwaves
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.life -= rawDt;
        sw.radius += (sw.maxRadius - sw.radius) * 14 * rawDt;
        if (sw.life <= 0) this.shockwaves.splice(i, 1);
      }

      // Lightning Bolts
      for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
        this.lightningBolts[i].life -= rawDt;
        if (this.lightningBolts[i].life <= 0) this.lightningBolts.splice(i, 1);
      }

      // Floating Texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.life -= rawDt;
        ft.y += ft.vy * rawDt;
        ft.vy *= 0.91;
        if (ft.life <= 0) this.floatingTexts.splice(i, 1);
      }
    }

    // ==========================================
    // LAYER 1 & 2: COMBO-TRANCE BACKGROUND & GIANT BRUSH CUT-INS
    // ==========================================
    drawBackground(ctx, W, H, stageTheme, stylePhase, isBulletTime, isUlt100) {
      // 100% Ultimate ('千本桜・墨嵐') inverts canvas into stark white Sumi-e parchment!
      if (isUlt100) {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(-50, -50, W + 100, H + 100);
      } else if (isBulletTime) {
        ctx.fillStyle = '#030407';
        ctx.fillRect(-50, -50, W + 100, H + 100);
      } else {
        ctx.fillStyle = stylePhase === 3 ? '#170712' : (stylePhase === 2 ? '#0f060e' : '#07080c');
        ctx.fillRect(-50, -50, W + 100, H + 100);
      }

      // Beat-Synced Stage Geometric Motif
      ctx.save();
      ctx.translate(W / 2, H / 2);
      const pulseScale = 1.0 + this.beatPulse * 0.08;
      ctx.scale(pulseScale, pulseScale);

      const alphaBase = isUlt100 ? 0.16 : (stylePhase === 3 ? 0.24 : (stylePhase === 2 ? 0.14 : 0.05));
      const strokeCol = isUlt100
        ? `rgba(15, 23, 42, ${alphaBase})`
        : (stylePhase === 3
          ? `rgba(255, 190, 46, ${alphaBase})`
          : (stylePhase === 2 ? `rgba(0, 240, 255, ${alphaBase})` : `rgba(255, 255, 255, ${alphaBase})`));

      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = stylePhase >= 2 ? 2.0 : 1.2;

      if (stageTheme === 'bamboo') {
        // Stage 1: Cyber Stone Grid & Glowing Bamboo Stalks
        const gridStep = 110;
        for (let x = -W * 0.6; x <= W * 0.6; x += gridStep) {
          ctx.beginPath();
          ctx.moveTo(x, -H * 0.6);
          ctx.lineTo(x, H * 0.6);
          ctx.stroke();
        }
        for (let r = 130; r < Math.max(W, H) * 0.7; r += 140) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (stageTheme === 'clockwork') {
        // Stage 2: Rotating Golden Clockwork Gears
        ctx.rotate(this.bgRotation);
        [150, 280, 420].forEach((r, idx) => {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
          const teeth = 12 + idx * 6;
          for (let t = 0; t < teeth; t++) {
            const a = (t / teeth) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
            ctx.lineTo(Math.cos(a) * (r + 14), Math.sin(a) * (r + 14));
            ctx.stroke();
          }
        });
      } else {
        // Stage 3 & Endless: Rotating Sacred Mandala & Cyber Torii Rings
        ctx.rotate(this.bgRotation);
        for (let r = 110; r < Math.max(W, H) * 0.75; r += 115) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        const spokes = 12;
        for (let s = 0; s < spokes; s++) {
          const a = (s / spokes) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * W * 0.6, Math.sin(a) * W * 0.6);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Ambient Embers / Neon Sakura Petals (Multiplies in visibility at Rank A/S/SS/SSS)
      const emberCount = stylePhase === 3 ? 95 : (stylePhase === 2 ? 60 : 22);
      for (let i = 0; i < emberCount; i++) {
        const em = this.ambientEmbers[i];
        ctx.save();
        ctx.translate(em.x % W, em.y % H);
        ctx.rotate(em.angle);
        ctx.globalAlpha = stylePhase === 3 ? 0.75 : (stylePhase === 2 ? 0.50 : 0.20);
        ctx.fillStyle = em.hueType === 0 ? '#ff1e42' : (em.hueType === 1 ? '#ffbe2e' : '#00f0ff');
        ctx.beginPath();
        ctx.ellipse(0, 0, em.size, em.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Layer 2A: Floor Sumi-e Ink & Gold Leaf Decals
      this.decals.forEach((d) => {
        const alpha = Math.min(1, d.life / 2.0) * 0.65;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = isUlt100 ? 'rgba(15, 23, 42, 0.35)' : (d.isGold ? 'rgba(255, 190, 46, 0.16)' : 'rgba(18, 22, 34, 0.85)');
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        d.blobs.forEach((b) => {
          ctx.arc(d.x + b.ox, d.y + b.oy, b.r, 0, Math.PI * 2);
        });
        ctx.fill();
        ctx.restore();
      });

      // Layer 2B: Giant Brush Calligraphy Background Cut-Ins ('覚醒', '修羅', '鬼神降臨')
      this.brushCutIns.forEach((bc) => {
        const alpha = Math.min(1, bc.life / bc.maxLife);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(bc.scale, bc.scale);
        ctx.globalAlpha = alpha * 0.32;
        ctx.font = '900 135px "Hiragino Kaku Gothic ProN", "Noto Sans JP", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = bc.color;
        ctx.fillText(bc.kanji, 0, 0);
        if (bc.subtext) {
          ctx.font = '900 24px sans-serif';
          ctx.letterSpacing = '0.3em';
          ctx.fillText(bc.subtext, 0, 88);
        }
        ctx.restore();
      });
    }

    // ==========================================
    // LAYER 4 & 7: SLICED HALVES & DIMENSIONAL VOID RIFTS
    // ==========================================
    drawSlicedHalves(ctx) {
      this.slicedHalves.forEach((sh) => {
        const alpha = Math.max(0, sh.life / sh.maxLife);
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(sh.slashAngle);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = sh.color;
        ctx.beginPath();
        if (sh.half > 0) {
          ctx.arc(0, 0, sh.radius, 0, Math.PI);
        } else {
          ctx.arc(0, 0, sh.radius, Math.PI, Math.PI * 2);
        }
        ctx.closePath();
        ctx.fill();

        // Glowing hot cut edge
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-sh.radius - 2, 0);
        ctx.lineTo(sh.radius + 2, 0);
        ctx.stroke();
        ctx.restore();
      });
    }

    drawVoidRifts(ctx) {
      this.voidRifts.forEach((vr) => {
        const alpha = Math.min(1, vr.life / 0.4);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;

        // Outer crimson/purple tear
        ctx.strokeStyle = vr.hasBlackHole ? '#d946ef' : '#ff1e42';
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(vr.x1, vr.y1);
        ctx.lineTo(vr.x2, vr.y2);
        ctx.stroke();

        // Inner jagged white spatial crack
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(vr.x1, vr.y1);
        const steps = 7;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          ctx.lineTo(
            vr.x1 + (vr.x2 - vr.x1) * t + (Math.random() - 0.5) * 14,
            vr.y1 + (vr.y2 - vr.y1) * t + (Math.random() - 0.5) * 14
          );
        }
        ctx.lineTo(vr.x2, vr.y2);
        ctx.stroke();

        // Black hole gravity well if awakened
        if (vr.hasBlackHole) {
          ctx.fillStyle = '#030406';
          ctx.strokeStyle = '#ffbe2e';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(vr.mx, vr.my, 24 + Math.sin(vr.life * 14) * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    // ==========================================
    // LAYER 10, 11, 12: ADDITIVE VFX, CALLOUTS & POST-PROCESS
    // ==========================================
    drawAdditiveVfx(ctx, stylePhase) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Shockwaves
      this.shockwaves.forEach((sw) => {
        const alpha = Math.max(0, sw.life / sw.maxLife);
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = alpha * 0.85;
        ctx.lineWidth = sw.lineWidth * alpha;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Slash Trails (Multi-layered neon bloom; rainbow/gold shift in Phase 3!)
      this.slashTrails.forEach((st) => {
        const alpha = Math.max(0, st.life / st.maxLife);
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';

        ctx.strokeStyle = stylePhase === 3 && st.life < st.maxLife * 0.5 ? '#ffbe2e' : st.colorGlow;
        ctx.lineWidth = st.width * 2.2 * alpha;
        ctx.beginPath();
        ctx.moveTo(st.x1, st.y1);
        ctx.lineTo(st.x2, st.y2);
        ctx.stroke();

        ctx.strokeStyle = st.colorCore;
        ctx.lineWidth = Math.max(1.5, st.width * 0.65 * alpha);
        ctx.beginPath();
        ctx.moveTo(st.x1, st.y1);
        ctx.lineTo(st.x2, st.y2);
        ctx.stroke();
      });

      // Lightning Bolts
      this.lightningBolts.forEach((lb) => {
        const alpha = Math.max(0, lb.life / lb.maxLife);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = lb.color;
        ctx.lineWidth = lb.width;
        ctx.beginPath();
        lb.pts.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      });

      // Spark Particles
      this.particles.forEach((pt) => {
        const alpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      });

      ctx.restore();
    }

    drawFloatingTexts(ctx) {
      this.floatingTexts.forEach((ft) => {
        const alpha = Math.max(0, ft.life / ft.maxLife);
        const popScale = ft.life > ft.maxLife * 0.75 ? 1.25 : 1.0;
        ctx.save();
        ctx.translate(ft.x, ft.y);
        ctx.scale(popScale, popScale);
        ctx.globalAlpha = alpha;
        ctx.font = `900 ${ft.size}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000000';
        ctx.fillText(ft.text, 2, 2);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, 0, 0);
        ctx.restore();
      });
    }

    drawPostEffects(ctx, W, H, stylePhase, isBulletTime) {
      // 1. Manga Speed Lines around screen perimeter in Phase 2 (Awakened) & Phase 3 (Kishin Trance)
      if (stylePhase >= 2 || isBulletTime) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        const count = stylePhase === 3 ? 68 : 42;
        const outerR = Math.hypot(W, H) * 0.55;
        const innerR = Math.min(W, H) * (stylePhase === 3 ? 0.36 : 0.42);

        ctx.strokeStyle = isBulletTime
          ? 'rgba(0, 240, 255, 0.22)'
          : (stylePhase === 3 ? 'rgba(255, 190, 46, 0.32)' : 'rgba(255, 255, 255, 0.16)');
        ctx.lineWidth = stylePhase === 3 ? 2.5 : 1.5;

        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + (performance.now() * 0.001) % 0.2;
          const jitter = ((i * 19) % 10) * 6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (innerR + jitter), Math.sin(a) * (innerR + jitter));
          ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 2. Blazing Neon Screen Frame Aura in Phase 3 (Rank SS / SSS)
      if (stylePhase === 3) {
        ctx.save();
        const borderAlpha = 0.25 + this.beatPulse * 0.35;
        ctx.strokeStyle = `rgba(255, 190, 46, ${borderAlpha})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, W - 10, H - 10);
        ctx.restore();
      }

      // 3. RGB Chromatic Aberration Glitch Ring on Detonation
      if (this.chromaticTimer > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const shift = this.chromaticStrength * (this.chromaticTimer / 0.18);
        ctx.strokeStyle = 'rgba(255, 30, 66, 0.45)';
        ctx.lineWidth = 6;
        ctx.strokeRect(shift, 0, W - shift * 2, H);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
        ctx.strokeRect(-shift, 0, W + shift * 2, H);
        ctx.restore();
      }

      // 4. Screen Split Slash Line during 200% Ultimate ('絶・虚空一文字')
      if (this.screenSplitTimer > 0) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 14 * (this.screenSplitTimer / 0.45);
        ctx.shadowColor = '#ffbe2e';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        ctx.restore();
      }

      // 5. Full-screen Impact Flash
      if (this.flashAlpha > 0) {
        ctx.save();
        ctx.fillStyle = this.flashColor;
        ctx.globalAlpha = this.flashAlpha;
        ctx.fillRect(-40, -40, W + 80, H + 80);
        ctx.restore();
      }
    }
  }

  return new EffectManager();
})();
