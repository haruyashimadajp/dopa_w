/* ==========================================================================
 * CHAIN SLASH : 絶・一閃 (ZETSU-ISSEN)
 * [6] js/entities.js — 主人公・雑魚敵6種・設置ギミック3種・巨大ボス3体
 *                      （部位破壊 ALL BREAK ＆ 処刑演出）クラス群
 * 公開: window.ZetsuIssen.Entities
 * ========================================================================== */
(function () {
  'use strict';
  const ZI = (window.ZetsuIssen = window.ZetsuIssen || {});
  const CFG = ZI.Config;
  const C = CFG.COLORS;
  const P = CFG.PARAMS;
  const U = ZI.Util;
  const TAU = U.TAU;

  /** 白黒反転中は全て漆黒の墨色 */
  const col = (pal, c) => (pal.inv ? C.ink : c);
  const colA = (pal, c, a) => (pal.inv ? `rgba(9,10,15,${a})` : U.rgba(c, a));

  function polygon(ctx, n, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  let ENTITY_ID = 1;

  /* ========================================================================
   * Player：編み笠のサイバー浪人
   * ====================================================================== */
  class Player {
    constructor(x, y, blade) {
      this.id = ENTITY_ID++;
      this.x = x; this.y = y;
      this.r = P.PLAYER_RADIUS;
      this.blade = blade;
      this.maxHp = blade.hp;
      this.hp = blade.hp;
      this.invuln = 1.0;
      this.facing = -Math.PI / 2;
      this.trail = [];          // 過去フレーム座標（マフラー＆分身用）
      for (let i = 0; i < 24; i++) this.trail.push({ x, y });
      this.dash = null;
      this.dashQueue = [];
      this.sheathe = 0;         // 納刀ポーズの残り時間
      this.bladeSwing = 0;
      this.vx = 0; this.vy = 0;
      this.hurtT = 0;
    }

    startDash(x1, y1, dur, kind) {
      this.dash = { x0: this.x, y0: this.y, x1, y1, t: 0, dur: Math.max(0.001, dur), kind: kind || 'pinball' };
      this.facing = Math.atan2(y1 - this.y, x1 - this.x);
      this.bladeSwing = 1;
    }

    /** 実時間で更新（プレイヤーは時間操作の影響を受けない） */
    update(dt, game) {
      if (this.invuln > 0) this.invuln -= dt;
      if (this.sheathe > 0) this.sheathe -= dt;
      if (this.hurtT > 0) this.hurtT -= dt;
      this.bladeSwing = Math.max(0, this.bladeSwing - dt * 5);
      let finished = null;
      if (this.dash) {
        const d = this.dash;
        d.t += dt;
        const p = Math.min(1, d.t / d.dur);
        const e = d.kind === 'iai' ? p : U.easeOutCubic(p);
        this.x = U.lerp(d.x0, d.x1, e);
        this.y = U.lerp(d.y0, d.y1, e);
        if (p >= 1) { finished = d; this.dash = null; }
      } else if (game.canMove() && game.input.mode !== 'iaiDash' && game.input.mode !== 'sheathe') {
        // 非攻撃時のスムーズ移動：WASD／矢印を優先、なければカーソル追従（PC）／ドラッグ方向（タッチ）
        const k = game.input.keys;
        let mx = 0, my = 0;
        if (k.left) mx -= 1;
        if (k.right) mx += 1;
        if (k.up) my -= 1;
        if (k.down) my += 1;
        const sp = P.PLAYER_MOVE_SPEED * game.moveSpeedMult();
        let tvx = 0, tvy = 0;
        if (mx || my) {
          const l = Math.hypot(mx, my);
          tvx = (mx / l) * sp; tvy = (my / l) * sp;
        } else {
          const ht = game.hoverTarget();
          if (ht) {
            const dx = ht.x - this.x, dy = ht.y - this.y;
            const d = Math.hypot(dx, dy);
            if (d > P.HOVER_STOP_DIST) {
              // カーソルとの距離18px以内で停止、手前で滑らかに減速
              const s2 = sp * Math.min(1, (d - P.HOVER_STOP_DIST) / 46);
              tvx = (dx / d) * s2; tvy = (dy / d) * s2;
            }
          }
        }
        const kk = Math.min(1, dt * 14);
        this.vx += (tvx - this.vx) * kk;
        this.vy += (tvy - this.vy) * kk;
        if (Math.hypot(this.vx, this.vy) > 20) this.facing = Math.atan2(this.vy, this.vx);
        this.x += this.vx * dt; this.y += this.vy * dt;
      }
      // 軌跡記録
      const last = this.trail[0];
      if (Math.hypot(this.x - last.x, this.y - last.y) > 0.5 || game.frame % 2 === 0) {
        const tail = this.trail.pop();
        tail.x = this.x; tail.y = this.y;
        this.trail.unshift(tail);
      }
      return finished;
    }

    _drawHat(ctx, pal, x, y, alpha, tint) {
      const R = P.PLAYER_HAT_RADIUS;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha *= alpha;
      ctx.rotate(this.facing + Math.PI / 2);
      // 笠（八角形）
      polygon(ctx, 8, R, Math.PI / 8);
      ctx.fillStyle = pal.inv ? C.ink : (tint || '#151A24');
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = pal.inv ? C.ink : (tint ? tint : '#C9D2E3');
      ctx.stroke();
      // 放射状の笠筋
      ctx.strokeStyle = pal.inv ? 'rgba(243,244,246,0.5)' : 'rgba(201,210,227,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i / 8) * TAU;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      }
      ctx.stroke();
      // 頂点の飾り
      ctx.fillStyle = pal.inv ? C.crimson : this.blade.color;
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
      // 前方の鋭角（向き）
      ctx.beginPath();
      ctx.moveTo(0, -R - 5); ctx.lineTo(4, -R + 2); ctx.lineTo(-4, -R + 2); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    draw(ctx, pal, game) {
      const blink = this.invuln > 0 && this.hurtT > 0 && Math.floor(game.realTime * 20) % 2 === 0;
      const bladeCol = pal.inv ? C.crimson : this.blade.color;
      // Phase3：紅蓮残像（分身）2体
      if (game.phase === 3 || game.ultMode === 'ult100') {
        for (const idx of [7, 14]) {
          const t = this.trail[idx];
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
          ctx.fillStyle = colA(pal, C.crimson, 0.25);
          ctx.beginPath(); ctx.arc(t.x, t.y, 18, 0, TAU); ctx.fill();
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = 0.7;
          this._drawHat(ctx, pal, t.x, t.y, 0.8, '#5A0A16');
          ctx.restore();
        }
      }
      // 千手観音：常時5体の影分身
      if (game.hasAwakening('senju')) {
        for (let i = 0; i < 5; i++) {
          const a = game.realTime * 2.2 + (i / 5) * TAU;
          const x = this.x + Math.cos(a) * 46, y = this.y + Math.sin(a) * 46;
          ctx.save();
          ctx.globalAlpha = 0.45;
          this._drawHat(ctx, pal, x, y, 0.8, '#1B2233');
          ctx.restore();
        }
      }
      // 残像マフラー（過去8フレームを繋いだテーパー付きポリゴン）
      const tr = this.trail;
      const scarfCol = this.blade.id === 'byakuya' || this.blade.id === 'shiden' ? C.cyan : C.crimson;
      ctx.save();
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      const n = 9;
      const left = [], right = [];
      for (let i = 0; i < n; i++) {
        const a = tr[i], b = tr[Math.min(tr.length - 1, i + 1)];
        let ang = Math.atan2(a.y - b.y, a.x - b.x);
        if (a.x === b.x && a.y === b.y) ang = this.facing;
        const wdt = 6 * (1 - i / n) + 0.5;
        const sway = Math.sin(game.realTime * 9 + i * 0.8) * i * 0.6;
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        left.push(a.x + nx * (wdt + sway), a.y + ny * (wdt + sway));
        right.push(a.x - nx * (wdt - sway), a.y - ny * (wdt - sway));
      }
      ctx.beginPath();
      ctx.moveTo(left[0], left[1]);
      for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
      for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
      ctx.closePath();
      ctx.fillStyle = colA(pal, pal.inv ? C.crimson : scarfCol, 0.55);
      ctx.fill();
      ctx.restore();

      if (blink) return;

      // 刀
      const swing = this.bladeSwing;
      const sheathed = this.sheathe > 0;
      ctx.save();
      ctx.translate(this.x, this.y);
      const bAng = sheathed ? this.facing + Math.PI * 0.75 : this.facing + (swing > 0 ? (1 - swing) * 1.6 - 0.8 : 0.6);
      ctx.rotate(bAng);
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      const L = sheathed ? 18 : 30;
      ctx.strokeStyle = colA(pal, bladeCol, 0.35);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(8 + L, 0); ctx.stroke();
      ctx.strokeStyle = pal.inv ? C.crimson : this.blade.core;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(8 + L, 0); ctx.stroke();
      ctx.restore();

      // v3：広視界でも0.1秒で自機を視認できる足元リング＆中心発光コア
      ctx.save();
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      const pulse = 0.75 + Math.sin(game.realTime * 6) * 0.25;
      ctx.strokeStyle = colA(pal, C.cyan, 0.55 * pulse);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y, P.PLAYER_HAT_RADIUS + 3, 0, TAU); ctx.stroke();
      ctx.fillStyle = colA(pal, '#FFFFFF', 0.22);
      ctx.beginPath(); ctx.arc(this.x, this.y, P.PLAYER_HAT_RADIUS + 9, 0, TAU); ctx.fill();
      ctx.restore();
      this._drawHat(ctx, pal, this.x, this.y, 1);
      if (!pal.inv) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(this.x, this.y, 4.2, 0, TAU); ctx.fill();
        ctx.fillStyle = U.rgba(C.cyan, 0.5 * pulse);
        ctx.beginPath(); ctx.arc(this.x, this.y, 8, 0, TAU); ctx.fill();
        ctx.restore();
      }

      // 迅雷帯電：刀と外周に黄金の電撃オーラ（スタック数に比例）
      const ch = game.charge || 0;
      if (ch > 0) {
        ctx.save();
        ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
        const R0 = P.PLAYER_RING_RADIUS + 6;
        ctx.fillStyle = colA(pal, C.gold, 0.08 + ch * 0.06 + Math.random() * 0.05);
        ctx.beginPath(); ctx.arc(this.x, this.y, R0 + ch * 5, 0, TAU); ctx.fill();
        for (let i = 0; i < ch * 3; i++) {
          const a0 = Math.random() * TAU;
          ctx.strokeStyle = pal.inv ? C.crimson : (i % 2 ? '#FFFFFF' : C.gold);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          let r = R0 - 4;
          ctx.moveTo(this.x + Math.cos(a0) * r, this.y + Math.sin(a0) * r);
          for (let k = 1; k <= 4; k++) {
            r = R0 + k * (2 + ch * 1.5) + U.rand(-3, 3);
            const aa = a0 + k * 0.18 + U.rand(-0.15, 0.15);
            ctx.lineTo(this.x + Math.cos(aa) * r, this.y + Math.sin(aa) * r);
          }
          ctx.stroke();
        }
        // 帯電ピップ
        for (let i = 0; i < P.CHARGE_MAX; i++) {
          const a = -Math.PI / 2 + (i - 1) * 0.42;
          const px = this.x + Math.cos(a) * (R0 + 14), py = this.y + Math.sin(a) * (R0 + 14);
          ctx.fillStyle = i < ch ? (pal.inv ? C.crimson : C.gold) : 'rgba(255,190,46,0.15)';
          ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 3, py); ctx.lineTo(px, py + 5); ctx.lineTo(px - 3, py); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      // 集中ゲージリング（半径22px）／息切れ中は赤く点滅
      const f = game.focus / game.focusMax();
      const oh = game.overheat > 0;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = pal.inv ? 'rgba(9,10,15,0.15)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y, P.PLAYER_RING_RADIUS, 0, TAU); ctx.stroke();
      if (oh) {
        const blink = Math.floor(game.realTime * 14) % 2 === 0;
        ctx.strokeStyle = blink ? C.crimson : 'rgba(255,30,66,0.25)';
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(this.x, this.y, P.PLAYER_RING_RADIUS, 0, TAU); ctx.stroke();
        ctx.font = '800 12px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = pal.inv ? '#fff' : '#000';
        ctx.strokeText('息切れ...', this.x, this.y - 34);
        ctx.fillStyle = C.crimson;
        ctx.fillText('息切れ...', this.x, this.y - 34);
      } else {
        const ringCol = f < 0.25 ? C.crimson : game.input.mode === 'aim' ? C.cyan : (pal.inv ? C.ink : '#8FF8FF');
        ctx.strokeStyle = pal.inv ? (f < 0.25 ? C.crimson : C.ink) : ringCol;
        ctx.lineWidth = game.input.mode === 'aim' ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, P.PLAYER_RING_RADIUS, -Math.PI / 2, -Math.PI / 2 + TAU * f);
        ctx.stroke();
        // 迅雷1回分の消費量マーカー
        const cost = game.flickCost ? game.flickCost() / game.focusMax() : 0;
        if (cost > 0 && f >= cost) {
          ctx.strokeStyle = pal.inv ? 'rgba(9,10,15,0.5)' : 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1;
          const a = -Math.PI / 2 + TAU * (f - cost);
          ctx.beginPath();
          ctx.moveTo(this.x + Math.cos(a) * (P.PLAYER_RING_RADIUS - 4), this.y + Math.sin(a) * (P.PLAYER_RING_RADIUS - 4));
          ctx.lineTo(this.x + Math.cos(a) * (P.PLAYER_RING_RADIUS + 4), this.y + Math.sin(a) * (P.PLAYER_RING_RADIUS + 4));
          ctx.stroke();
        }
      }
      ctx.restore();

      // 納刀の白い十字閃光
      if (sheathed) {
        const a = this.sheathe / P.SHEATHE_PAUSE;
        ctx.save();
        ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
        ctx.fillStyle = pal.inv ? C.crimson : `rgba(255,255,255,${a})`;
        const s = 60 * (1.2 - a * 0.2);
        ctx.fillRect(this.x - s, this.y - 1.5, s * 2, 3);
        ctx.fillRect(this.x - 1.5, this.y - s, 3, s * 2);
        ctx.restore();
      }
    }
  }

  /* ========================================================================
   * Enemy 基底クラス
   * ====================================================================== */
  class Enemy {
    constructor(type, x, y, opts) {
      const cfg = CFG.ENEMIES[type];
      opts = opts || {};
      this.id = ENTITY_ID++;
      this.type = type;
      this.x = x; this.y = y;
      this.r = cfg.r;
      this.maxHp = Math.ceil(cfg.hp * (opts.hpMult || 1));
      this.hp = this.maxHp;
      this.speed = cfg.speed * (opts.speedMult || 1);
      this.elite = cfg.elite;
      this.xp = cfg.xp;
      this.score = cfg.score;
      this.vx = 0; this.vy = 0;
      this.rot = Math.random() * TAU;
      this.age = 0;
      this.hitFlash = 0;
      this.paralyze = 0;
      this.pending = false;     // 居合の「斬られ予約状態」
      this.lockStroke = -1;
      this.lockCount = 0;
      this.inside = false;
      this.lastHitAt = -99;
      this.dead = false;
      this.isEnemy = true;
      this.pullX = 0; this.pullY = 0;
      this.form = null;         // 所属フォーメーション
      this.slot = 0;
      this.grazeIn = false;     // 見切り判定帯の内側にいるか
      this.grazeCd = 0;
      this.knockX = 0; this.knockY = 0;
    }
    get lockable() { return !this.dead && this.age > 0.05; }
    update(dt, game) {
      this.age += dt;
      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.grazeCd > 0) this.grazeCd -= dt;
      if (this.pending) return;
      // 死体ボウリングのノックバック
      if (this.knockX || this.knockY) {
        this.x += this.knockX * dt; this.y += this.knockY * dt;
        const kd = Math.exp(-7 * dt);
        this.knockX *= kd; this.knockY *= kd;
        if (Math.abs(this.knockX) + Math.abs(this.knockY) < 5) { this.knockX = 0; this.knockY = 0; }
      }
      if (this.paralyze > 0) { this.paralyze -= dt; return; }
      if (this.form && !this.form.done) {
        const sp = this.form.slotPos(this.slot, this);
        if (sp) {
          // 陣形スロットへ吸着（陣形を美しく保つ）
          const dx = sp.x - this.x, dy = sp.y - this.y;
          const d = Math.hypot(dx, dy);
          const v = Math.min(d / Math.max(dt, 1e-4), Math.max(this.speed * 2.4, d * 8));
          if (d > 0.01) { this.vx = dx / d * v; this.vy = dy / d * v; this.x += this.vx * dt; this.y += this.vy * dt; }
          this.rot += dt * 1.5;
          this.anchored = true;
          if (this.formBehave) this.behavior(dt, game);
          this.anchored = false;
          return;
        }
        this.form = null;
      }
      this.behavior(dt, game);
      if (this.pullX || this.pullY) {
        this.x += this.pullX * dt; this.y += this.pullY * dt;
        this.pullX = 0; this.pullY = 0;
      }
    }
    seek(dt, tx, ty, speed) {
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * speed; this.vy = (dy / d) * speed;
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    behavior(dt, game) {
      this.seek(dt, game.player.x, game.player.y, this.speed);
    }
    drawBody(ctx, pal) {
      ctx.fillStyle = col(pal, '#333');
      ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
    }
    draw(ctx, pal, game) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const spawnA = Math.min(1, this.age / 0.25);
      ctx.globalAlpha = spawnA;
      if (this.pending) {
        // 白く発光して時間が完全に止まった状態
        ctx.save();
        this.drawBody(ctx, pal);
        ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
        ctx.fillStyle = pal.inv ? 'rgba(255,30,66,0.6)' : 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(0, 0, this.r * 1.1, 0, TAU); ctx.fill();
        ctx.restore();
      } else {
        this.drawBody(ctx, pal);
        if (this.hitFlash > 0) {
          ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
          ctx.fillStyle = pal.inv ? 'rgba(255,30,66,0.5)' : `rgba(255,255,255,${Math.min(0.8, this.hitFlash * 8)})`;
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (this.paralyze > 0 && !pal.inv) {
        ctx.strokeStyle = U.rgba(C.shiden, 0.8);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * TAU;
          ctx.moveTo(Math.cos(a) * this.r * 0.4, Math.sin(a) * this.r * 0.4);
          ctx.lineTo(Math.cos(a + 0.3) * this.r * 1.3, Math.sin(a + 0.3) * this.r * 1.3);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* 1. 笠蜘蛛（群れ雑魚）：赤い三つ目紋様の黒塗り六角形ドローン */
  class SwarmSpider extends Enemy {
    constructor(x, y, opts) {
      super('spider', x, y, opts);
      this.ox = (opts && opts.ox) || 0;
      this.oy = (opts && opts.oy) || 0;
      this.wob = Math.random() * TAU;
    }
    behavior(dt, game) {
      const pl = game.player;
      const gx = this.x - this.ox, gy = this.y - this.oy; // 群れ中心
      const dc = Math.hypot(pl.x - gx, pl.y - gy);
      if (dc < 170) { const k = Math.exp(-0.7 * dt); this.ox *= k; this.oy *= k; }
      const dx = pl.x - gx, dy = pl.y - gy;
      const d = Math.hypot(dx, dy) || 1;
      this.wob += dt * 4;
      const wx = Math.cos(this.wob) * 18, wy = Math.sin(this.wob * 1.3) * 18;
      this.vx = (dx / d) * this.speed + wx;
      this.vy = (dy / d) * this.speed + wy;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.rot += dt * 1.5;
    }
    drawBody(ctx, pal) {
      const r = this.r;
      ctx.rotate(this.rot);
      // 脚
      ctx.strokeStyle = col(pal, '#3A4255');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        const k = Math.sin(this.age * 14 + i) * 0.15;
        ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
        ctx.lineTo(Math.cos(a + k) * r * 1.35, Math.sin(a + k) * r * 1.35);
      }
      ctx.stroke();
      polygon(ctx, 6, r, 0);
      ctx.fillStyle = col(pal, '#0D1018');
      ctx.fill();
      ctx.strokeStyle = col(pal, '#495267');
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // 赤い三つ目
      ctx.rotate(-this.rot);
      ctx.fillStyle = col(pal, C.crimson);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.arc(i * r * 0.36, -r * 0.12 + Math.abs(i) * r * 0.12, r * 0.14, 0, TAU); ctx.fill();
      }
      if (!pal.inv) {
        ctx.fillStyle = 'rgba(255,30,66,0.25)';
        ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.55, 0, TAU); ctx.fill();
      }
    }
  }

  /* 2. 鉄砲足軽（狙撃手）：橙色の菱形＋赤い照準レーザー */
  class SniperAshigaru extends Enemy {
    constructor(x, y, opts) {
      super('ashigaru', x, y, opts);
      this.state = 'move';
      this.st = 0;
      this.shots = 0;
      this.aimAng = 0;
      this.bulletSpeed = 230 * ((opts && opts.bulletMult) || 1);
      this.formBehave = true;
    }
    behavior(dt, game) {
      const pl = game.player;
      const d = Math.hypot(pl.x - this.x, pl.y - this.y);
      const onScreen = game.inView(this.x, this.y, -20);
      this.st += dt;
      if (this.state === 'move') {
        if (!this.anchored) this.seek(dt, pl.x, pl.y, this.speed);
        this.aimAng = Math.atan2(pl.y - this.y, pl.x - this.x);
        if (d < (this.anchored ? 460 : 330) && onScreen && this.st > 0.6) { this.state = 'aim'; this.st = 0; }
      } else if (this.state === 'aim') {
        this.aimAng = Math.atan2(pl.y - this.y, pl.x - this.x);
        if (this.st >= 0.9) { this.state = 'fire'; this.st = 0; this.shots = 0; }
      } else if (this.state === 'fire') {
        if (this.st >= this.shots * 0.15 && this.shots < 3) {
          game.spawnBullet(this.x + Math.cos(this.aimAng) * 18, this.y + Math.sin(this.aimAng) * 18,
            Math.cos(this.aimAng) * this.bulletSpeed, Math.sin(this.aimAng) * this.bulletSpeed);
          this.shots++;
        }
        if (this.shots >= 3) { this.state = 'cool'; this.st = 0; }
      } else if (this.state === 'cool') {
        if (d > 360 && !this.anchored) this.seek(dt, pl.x, pl.y, this.speed * 0.6);
        if (this.st > 1.8) { this.state = d < 330 ? 'aim' : 'move'; this.st = 0; }
      }
    }
    drawTelegraph(ctx, pal, game) {
      if (this.state !== 'aim' || this.pending) return;
      const a = 0.25 + (this.st / 0.9) * 0.6;
      ctx.save();
      ctx.strokeStyle = colA(pal, C.crimson, a);
      ctx.lineWidth = Math.max(1 + (this.st / 0.9) * 1.5, 2.5 / game.camera.zoom);
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.aimAng) * 900, this.y + Math.sin(this.aimAng) * 900);
      ctx.stroke();
      ctx.restore();
    }
    drawBody(ctx, pal) {
      const r = this.r;
      ctx.rotate(this.aimAng);
      // 菱形シルエット
      ctx.beginPath();
      ctx.moveTo(r * 1.15, 0); ctx.lineTo(0, r * 0.8); ctx.lineTo(-r, 0); ctx.lineTo(0, -r * 0.8); ctx.closePath();
      ctx.fillStyle = col(pal, '#2A1606');
      ctx.fill();
      ctx.strokeStyle = col(pal, C.ashigaru);
      ctx.lineWidth = 2;
      ctx.stroke();
      // 銃身
      ctx.fillStyle = col(pal, '#8F949E');
      ctx.fillRect(r * 0.3, -2, r * 1.1, 4);
      // 陣笠
      ctx.fillStyle = col(pal, C.ashigaru);
      ctx.beginPath(); ctx.arc(-r * 0.15, 0, r * 0.38, 0, TAU); ctx.fill();
      ctx.fillStyle = col(pal, C.crimson);
      ctx.beginPath(); ctx.arc(r * 0.05, 0, r * 0.12, 0, TAU); ctx.fill();
    }
  }

  /* 3. 幻影忍（分裂妖）：シアン発光の手裏剣型高速忍 */
  class SplitterNinja extends Enemy {
    constructor(x, y, opts) {
      const mini = !!(opts && opts.mini);
      super(mini ? 'ninjaMini' : 'ninja', x, y, opts);
      this.mini = mini;
      this.zig = Math.random() * TAU;
      if (opts && opts.vx) { this.vx = opts.vx; this.vy = opts.vy; this.burst = 0.35; } else this.burst = 0;
    }
    behavior(dt, game) {
      if (this.burst > 0) {
        this.burst -= dt;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= Math.exp(-4 * dt); this.vy *= Math.exp(-4 * dt);
        this.rot += dt * 18;
        return;
      }
      const pl = game.player;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.zig += dt * 5;
      const side = Math.sin(this.zig) * 0.9;
      const nx = -dy / d, ny = dx / d;
      this.vx = (dx / d + nx * side) * this.speed;
      this.vy = (dy / d + ny * side) * this.speed;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.rot += dt * 9;
    }
    drawBody(ctx, pal) {
      const r = this.r;
      ctx.rotate(this.rot);
      if (!pal.inv) {
        ctx.fillStyle = 'rgba(0,240,255,0.14)';
        ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, TAU); ctx.fill();
      }
      // 四方手裏剣
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.32, Math.sin(a + Math.PI / 4) * r * 0.32);
      }
      ctx.closePath();
      ctx.fillStyle = col(pal, '#06222A');
      ctx.fill();
      ctx.strokeStyle = col(pal, C.cyan);
      ctx.lineWidth = this.mini ? 1.2 : 1.8;
      ctx.stroke();
      ctx.fillStyle = col(pal, '#E8FEFF');
      ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, TAU); ctx.fill();
    }
  }

  /* 4. 提灯お化け（自爆誘爆）：黄金に脈動する提灯（中央に『爆』） */
  class BombLantern extends Enemy {
    constructor(x, y, opts) {
      super('lantern', x, y, opts);
      this.bob = Math.random() * TAU;
      this.isBomb = true;
    }
    behavior(dt, game) {
      this.bob += dt * 3;
      this.seek(dt, game.player.x, game.player.y + Math.sin(this.bob) * 30, this.speed);
    }
    drawBody(ctx, pal) {
      const r = this.r;
      const pulse = 0.5 + Math.sin(this.age * 6) * 0.5;
      if (!pal.inv) {
        ctx.fillStyle = `rgba(255,190,46,${0.12 + pulse * 0.18})`;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.fill();
      }
      // 提灯本体（楕円＋骨）
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r, 0, 0, TAU);
      ctx.fillStyle = col(pal, '#3A2404');
      ctx.fill();
      ctx.strokeStyle = col(pal, C.gold);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = colA(pal, C.gold, 0.45);
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.ellipse(0, i * r * 0.32, r * 0.85 * Math.sqrt(1 - Math.pow(i * 0.32, 2)), 1.2, 0, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = col(pal, '#1A1A1A');
      ctx.fillRect(-r * 0.4, -r - 4, r * 0.8, 5);
      ctx.fillRect(-r * 0.4, r - 1, r * 0.8, 5);
      ctx.fillStyle = pal.inv ? C.paper : `rgba(255,${200 + pulse * 55},${80 + pulse * 100},1)`;
      ctx.font = `900 ${r * 0.95}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('爆', 0, 1);
    }
  }

  /* 5. 重装鬼（装甲エリート）：深紅の鬼面紋様の大型八角形＋白い装甲リング */
  class ArmoredOni extends Enemy {
    constructor(x, y, opts) { super('oni', x, y, opts); }
    behavior(dt, game) {
      this.seek(dt, game.player.x, game.player.y, this.speed);
      this.rot += dt * 0.4;
    }
    drawBody(ctx, pal) {
      const r = this.r;
      // 装甲リング（残HP分のセグメント）
      const segs = this.maxHp;
      ctx.lineWidth = 4;
      for (let i = 0; i < segs; i++) {
        const a0 = this.rot + (i / segs) * TAU + 0.08, a1 = this.rot + ((i + 1) / segs) * TAU - 0.08;
        ctx.strokeStyle = i < this.hp ? col(pal, C.oniArmor) : colA(pal, C.oniArmor, 0.12);
        ctx.beginPath(); ctx.arc(0, 0, r + 5, a0, a1); ctx.stroke();
      }
      polygon(ctx, 8, r, Math.PI / 8 + this.rot * 0.2);
      ctx.fillStyle = col(pal, '#1A0608');
      ctx.fill();
      ctx.strokeStyle = col(pal, C.crimson);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // 鬼面
      ctx.strokeStyle = col(pal, C.crimson);
      ctx.fillStyle = col(pal, C.crimson);
      ctx.lineWidth = 2;
      // 角
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.35); ctx.lineTo(-r * 0.62, -r * 0.85); ctx.lineTo(-r * 0.25, -r * 0.45);
      ctx.moveTo(r * 0.45, -r * 0.35); ctx.lineTo(r * 0.62, -r * 0.85); ctx.lineTo(r * 0.25, -r * 0.45);
      ctx.fill();
      // 目
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.1); ctx.lineTo(-r * 0.12, r * 0.02); ctx.lineTo(-r * 0.45, r * 0.12); ctx.closePath();
      ctx.moveTo(r * 0.5, -r * 0.1); ctx.lineTo(r * 0.12, r * 0.02); ctx.lineTo(r * 0.45, r * 0.12); ctx.closePath();
      ctx.fill();
      // 牙の口
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, r * 0.4); ctx.lineTo(-r * 0.25, r * 0.55); ctx.lineTo(-r * 0.1, r * 0.4); ctx.lineTo(0, r * 0.58);
      ctx.lineTo(r * 0.1, r * 0.4); ctx.lineTo(r * 0.25, r * 0.55); ctx.lineTo(r * 0.45, r * 0.4);
      ctx.stroke();
    }
  }

  /* 6. 狂刃浪人（高速エリート）：紫の残像を纏う剣士（抜刀予兆0.6秒→高速突進） */
  class BerserkRonin extends Enemy {
    constructor(x, y, opts) {
      super('ronin', x, y, opts);
      this.state = 'approach';
      this.st = 0;
      this.dashAng = 0;
      this.ghosts = [];
    }
    get countering() { return this.state === 'warn'; }
    behavior(dt, game) {
      const pl = game.player;
      const d = Math.hypot(pl.x - this.x, pl.y - this.y);
      this.st += dt;
      if (this.state === 'approach') {
        this.seek(dt, pl.x, pl.y, this.speed);
        if (d < 270 && this.st > 0.8) { this.state = 'warn'; this.st = 0; this.dashAng = Math.atan2(pl.y - this.y, pl.x - this.x); }
      } else if (this.state === 'warn') {
        if (this.st >= 0.6) { this.state = 'dash'; this.st = 0; }
      } else if (this.state === 'dash') {
        const sp = 760;
        this.x += Math.cos(this.dashAng) * sp * dt;
        this.y += Math.sin(this.dashAng) * sp * dt;
        if (this.ghosts.length < 12 && Math.random() < 0.6) this.ghosts.push({ x: this.x, y: this.y, a: 0.6 });
        if (this.st >= 0.5) { this.state = 'recover'; this.st = 0; }
      } else if (this.state === 'recover') {
        if (this.st >= 0.9) { this.state = 'approach'; this.st = 0; }
      }
      for (const g of this.ghosts) g.a -= dt * 1.6;
      this.ghosts = this.ghosts.filter((g) => g.a > 0);
    }
    drawTelegraph(ctx, pal, game) {
      if (this.state !== 'warn' || this.pending) return;
      const p = this.st / 0.6;
      ctx.save();
      ctx.strokeStyle = colA(pal, C.crimson, 0.3 + p * 0.6);
      ctx.lineWidth = Math.max(3 + p * 8, 2.5 / game.camera.zoom);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.dashAng) * 380, this.y + Math.sin(this.dashAng) * 380);
      ctx.stroke();
      ctx.strokeStyle = pal.inv ? C.ink : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    draw(ctx, pal, game) {
      if (!pal.inv) {
        for (const g of this.ghosts) {
          ctx.fillStyle = U.rgba(C.shiden, g.a * 0.4);
          ctx.beginPath(); ctx.arc(g.x, g.y, this.r, 0, TAU); ctx.fill();
        }
      }
      super.draw(ctx, pal, game);
    }
    drawBody(ctx, pal) {
      const r = this.r;
      const ang = this.state === 'approach' ? Math.atan2(this.vy, this.vx) : this.dashAng;
      if (!pal.inv) {
        ctx.fillStyle = U.rgba(C.shiden, 0.18 + Math.sin(this.age * 10) * 0.06);
        ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.fill();
      }
      ctx.rotate(ang);
      // 刀
      ctx.strokeStyle = col(pal, this.state === 'warn' ? C.crimson : '#D8DEE9');
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.5); ctx.lineTo(r * 1.6, r * 0.2); ctx.stroke();
      // 羽織の胴
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(-r * 0.3, r * 0.85); ctx.lineTo(-r * 0.9, 0); ctx.lineTo(-r * 0.3, -r * 0.85); ctx.closePath();
      ctx.fillStyle = col(pal, '#1D0A26');
      ctx.fill();
      ctx.strokeStyle = col(pal, C.shiden);
      ctx.lineWidth = 2;
      ctx.stroke();
      // 頭（ぼさ髪）
      ctx.fillStyle = col(pal, '#0B0B10');
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, TAU); ctx.fill();
      ctx.strokeStyle = col(pal, C.crimson);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.42); ctx.lineTo(-r * 0.9, -r * 0.7); ctx.stroke();
      // HPピップ
      ctx.rotate(-ang);
      for (let i = 0; i < this.maxHp; i++) {
        ctx.fillStyle = i < this.hp ? col(pal, C.shiden) : colA(pal, C.shiden, 0.15);
        ctx.fillRect(-9 + i * 7, -r - 9, 5, 3);
      }
    }
  }

  /* 無明の分身（召喚専用） */
  class SaintClone extends Enemy {
    constructor(x, y, opts) {
      super('ninja', x, y, opts);
      this.type = 'saintClone';
      this.r = 24; this.maxHp = 1; this.hp = 1;
      this.score = 300; this.xp = 2;
      this.state = 'stance'; this.st = 0;
      this.tx = opts.tx; this.ty = opts.ty;
      this.boss = opts.boss;
      this.dashAng = Math.atan2(this.ty - y, this.tx - x);
      this.isClone = true;
    }
    behavior(dt) {
      this.st += dt;
      if (this.state === 'stance') {
        if (this.st >= 1.6) { this.state = 'dash'; this.st = 0; }
      } else if (this.state === 'dash') {
        this.x += Math.cos(this.dashAng) * 900 * dt;
        this.y += Math.sin(this.dashAng) * 900 * dt;
        if (this.st > 0.55) { this.dead = true; this.vanished = true; }
      }
    }
    drawTelegraph(ctx, pal, game) {
      if (this.state !== 'stance' || this.pending) return;
      const p = this.st / 1.6;
      ctx.save();
      ctx.strokeStyle = colA(pal, C.crimson, 0.2 + p * 0.5);
      ctx.lineWidth = Math.max(2 + p * 5, 2.5 / game.camera.zoom);
      ctx.setLineDash([14, 8]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.dashAng) * 520, this.y + Math.sin(this.dashAng) * 520);
      ctx.stroke();
      ctx.restore();
    }
    drawBody(ctx, pal) {
      drawSaintFigure(ctx, pal, this.r, this.age, this.dashAng, 0.75, this.state === 'stance' ? this.st / 1.6 : 1);
    }
  }

  function drawSaintFigure(ctx, pal, r, t, ang, alpha, charge) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    // 羽衣（白銀と漆黒）
    ctx.save();
    ctx.rotate(Math.sin(t * 1.4) * 0.1);
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      const s = i ? -1 : 1;
      ctx.moveTo(0, -r * 0.2);
      ctx.bezierCurveTo(s * r * 1.6, -r * 0.6, s * r * 1.9, r * 0.6 + Math.sin(t * 2 + i) * 6, s * r * 0.8, r * 1.4);
      ctx.bezierCurveTo(s * r * 0.9, r * 0.6, s * r * 0.5, r * 0.2, 0, r * 0.3);
      ctx.fillStyle = i ? col(pal, 'rgba(230,236,250,0.22)') : col(pal, 'rgba(10,12,20,0.85)');
      ctx.fill();
      ctx.strokeStyle = col(pal, 'rgba(230,236,250,0.6)');
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    // 胴
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7); ctx.lineTo(r * 0.55, r * 0.9); ctx.lineTo(-r * 0.55, r * 0.9); ctx.closePath();
    ctx.fillStyle = col(pal, '#0A0C14');
    ctx.fill();
    ctx.strokeStyle = col(pal, '#E6ECFA');
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 頭
    ctx.fillStyle = col(pal, '#E6ECFA');
    ctx.beginPath(); ctx.arc(0, -r * 0.8, r * 0.28, 0, TAU); ctx.fill();
    ctx.fillStyle = col(pal, C.crimson);
    ctx.fillRect(-r * 0.2, -r * 0.84, r * 0.4, 2.5);
    // 刀（居合構え）
    ctx.rotate(ang);
    ctx.strokeStyle = col(pal, charge >= 1 ? C.crimson : '#F8FAFC');
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.2); ctx.lineTo(r * 1.4, r * 0.1); ctx.stroke();
    if (charge > 0 && charge < 1 && !pal.inv) {
      ctx.strokeStyle = U.rgba(C.crimson, charge);
      ctx.lineWidth = 6 * charge;
      ctx.beginPath(); ctx.arc(0, 0, r * (1.6 - charge * 0.5), 0, TAU * charge); ctx.stroke();
    }
    ctx.restore();
  }

  /* ========================================================================
   * ステージギミック3種
   * ====================================================================== */
  class Gimmick {
    constructor(kind, x, y) {
      this.id = ENTITY_ID++;
      this.kind = kind;
      this.x = x; this.y = y;
      this.r = kind === 'barrel' ? 18 : 16;
      this.hp = 1; this.maxHp = 1;
      this.dead = false;
      this.isGimmick = true;
      this.age = 0;
      this.lockStroke = -1; this.lockCount = 0; this.inside = false;
      this.pending = false;
    }
    get lockable() { return !this.dead && this.age > 0.3; }
    update(dt) { this.age += dt; }
    draw(ctx, pal) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = Math.min(1, this.age / 0.4);
      const s = Math.min(1, this.age / 0.3);
      ctx.scale(s, s);
      this.drawBody(ctx, pal);
      if (this.pending) {
        ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
        ctx.fillStyle = pal.inv ? 'rgba(255,30,66,0.5)' : 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(0, 0, this.r * 1.1, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  /* 【火薬樽】斬ると半径120pxを大誘爆し、近くの敵も自動ロックオン */
  class PowderBarrel extends Gimmick {
    constructor(x, y) { super('barrel', x, y); }
    drawBody(ctx, pal) {
      const r = this.r;
      if (!pal.inv) {
        ctx.fillStyle = `rgba(255,190,46,${0.1 + Math.sin(this.age * 4) * 0.05})`;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = col(pal, '#3B2412');
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = col(pal, C.gold);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = col(pal, '#9AA0AA');
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.45); ctx.lineTo(r * 0.8, -r * 0.45); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.45); ctx.lineTo(r * 0.8, r * 0.45); ctx.stroke();
      ctx.fillStyle = col(pal, C.gold);
      ctx.font = `900 ${r * 0.8}px "Hiragino Mincho ProN","Yu Mincho",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('火', 0, 1);
      // 導火線の火花
      if (!pal.inv) {
        ctx.fillStyle = Math.random() < 0.5 ? C.gold : '#fff';
        ctx.beginPath(); ctx.arc(r * 0.3, -r - 4, 2 + Math.random() * 2, 0, TAU); ctx.fill();
      }
    }
  }
  /* 【紫電灯籠】斬ると周囲の敵5体に連鎖雷撃が走り3秒麻痺 */
  class ThunderLantern extends Gimmick {
    constructor(x, y) { super('thunder', x, y); }
    drawBody(ctx, pal) {
      const r = this.r;
      if (!pal.inv) {
        ctx.fillStyle = U.rgba(C.shiden, 0.15 + Math.sin(this.age * 8) * 0.07);
        ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, TAU); ctx.fill();
      }
      // 灯籠（笠＋火袋＋台）
      ctx.fillStyle = col(pal, '#24182E');
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.5); ctx.lineTo(0, -r * 1.2); ctx.lineTo(r, -r * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillRect(-r * 0.55, -r * 0.5, r * 1.1, r);
      ctx.fillRect(-r * 0.75, r * 0.5, r * 1.5, r * 0.35);
      ctx.strokeStyle = col(pal, C.shiden);
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-r * 0.55, -r * 0.5, r * 1.1, r);
      ctx.fillStyle = col(pal, C.cyan);
      ctx.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
      if (!pal.inv && Math.random() < 0.3) {
        ctx.strokeStyle = U.rgba(C.cyan, 0.8);
        ctx.beginPath();
        const a = Math.random() * TAU;
        ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
        ctx.stroke();
      }
    }
  }
  /* 【虚空水晶】斬ると周囲に3秒間の十字次元斬 */
  class VoidCrystal extends Gimmick {
    constructor(x, y) { super('crystal', x, y); }
    drawBody(ctx, pal) {
      const r = this.r;
      ctx.rotate(this.age * 0.8);
      if (!pal.inv) {
        ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.sin(this.age * 5) * 0.04})`;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, TAU); ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r * 0.7, 0); ctx.closePath();
      ctx.fillStyle = col(pal, '#0E1018');
      ctx.fill();
      ctx.strokeStyle = col(pal, '#FFFFFF');
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = col(pal, C.crimson);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(0, r * 1.3); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.stroke();
    }
  }

  /* ========================================================================
   * 弾・真空波・残光斬撃・魂ジェム
   * ====================================================================== */
  class EnemyBullet {
    constructor(x, y, vx, vy, opts) {
      this.id = ENTITY_ID++;
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.r = (opts && opts.r) || P.BULLET_RADIUS;
      this.life = (opts && opts.life) || 7;
      this.dead = false;
      this.isBullet = true;
      this.lockStroke = -1; this.lockCount = 0; this.inside = false;
      this.pending = false;
      this.fire = !!(opts && opts.fire);
      this.age = 0;
      this.grazeIn = false;
      this.grazeCd = 0;
    }
    get lockable() { return !this.dead; }
    update(dt, game) {
      if (this.pending) return;
      this.age += dt;
      if (this.grazeCd > 0) this.grazeCd -= dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0 || !game.inView(this.x, this.y, game.view.r * 0.6)) this.dead = true;
    }
    draw(ctx, pal) {
      const r = P.BULLET_DRAW_RADIUS;   // 描画のみ8.5（当たり判定は7のまま）
      if (this.pending) {
        ctx.fillStyle = pal.inv ? C.crimson : '#FFFFFF';
        ctx.beginPath(); ctx.arc(this.x, this.y, r * 1.2, 0, TAU); ctx.fill();
        return;
      }
      // 白芯＋紅ネオン外光をはっきり描く
      if (!pal.inv) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this.fire ? 'rgba(255,120,30,0.32)' : 'rgba(255,30,66,0.32)';
        ctx.beginPath(); ctx.arc(this.x, this.y, r * 2.1, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = col(pal, this.fire ? '#FF7A1E' : C.crimson);
      ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = pal.inv ? C.ink : '#FFD0D8';
      ctx.stroke();
      ctx.fillStyle = pal.inv ? C.paper : '#FFFFFF';
      ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.42, 0, TAU); ctx.fill();
    }
  }

  /* 真空三日月波（貫通／天叢雲時は画面端で反射して3秒旋回） */
  // ============================================================
  //  AfterimageSlash：燕返し／無想連閃の時間差残光斬撃（v3）
  //  手動斬撃の軌跡（ポリライン）を記憶し、delay 秒後に高速で同じ軌道を斬り抜ける。
  //  当たり判定は main.js 側（_updateAfterimages）で行い、ここは進行と描画のみ。
  // ============================================================
  class AfterimageSlash {
    constructor(pts, opts) {
      this.pts = pts;                       // [{x,y}, ...]（2点以上）
      this.delay = opts.delay;              // 発動までの実時間
      this.sweep = opts.sweep || 0.1;       // 斬り抜けに掛かる時間
      this.dmg = opts.dmg;
      this.half = opts.half;
      this.src = opts.src || 'tsubame';
      this.color = opts.color || '#BFF6FF';
      this.edge = opts.edge || C.gold;
      this.seen = new Set();
      this.t = 0;
      this.prog = 0;                        // 0..1 の掃引進捗
      this.lastLen = 0;                     // 前フレームまでに処理した軌跡長
      this.dead = false;
      let L = 0;
      this.cum = [0];
      for (let i = 1; i < pts.length; i++) {
        L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        this.cum.push(L);
      }
      this.len = Math.max(1, L);
    }
    get active() { return this.t >= this.delay; }
    /** 軌跡長 d の地点の座標 */
    pointAt(d) {
      const p = this.pts, c = this.cum;
      if (d <= 0) return { x: p[0].x, y: p[0].y };
      for (let i = 1; i < p.length; i++) {
        if (d <= c[i]) {
          const seg = c[i] - c[i - 1] || 1;
          const k = (d - c[i - 1]) / seg;
          return { x: U.lerp(p[i - 1].x, p[i].x, k), y: U.lerp(p[i - 1].y, p[i].y, k) };
        }
      }
      const q = p[p.length - 1];
      return { x: q.x, y: q.y };
    }
    /** 進行し、今フレームで新たに掃引した区間の折れ線を返す（未発動なら null） */
    update(dt) {
      this.t += dt;
      if (!this.active) return null;
      this.prog = Math.min(1, (this.t - this.delay) / this.sweep);
      const d1 = this.prog * this.len;
      const d0 = this.lastLen;
      this.lastLen = d1;
      if (this.prog >= 1) this.dead = true;
      if (d1 <= d0) return null;
      const out = [this.pointAt(d0)];
      for (let i = 1; i < this.pts.length - 1; i++) if (this.cum[i] > d0 && this.cum[i] < d1) out.push(this.pts[i]);
      out.push(this.pointAt(d1));
      return out;
    }
    draw(ctx, pal) {
      // 発動前は薄い予兆の軌跡（記憶された斬撃の残像）
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (!this.active) {
        const a = 0.12 + 0.18 * (this.t / Math.max(0.01, this.delay));
        ctx.strokeStyle = colA(pal, this.color, a);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(this.pts[0].x, this.pts[0].y);
        for (let i = 1; i < this.pts.length; i++) ctx.lineTo(this.pts[i].x, this.pts[i].y);
        ctx.stroke();
        ctx.restore();
        return;
      }
      // 掃引中：光る斬撃の頭
      const head = this.pointAt(this.prog * this.len);
      const tail = this.pointAt(Math.max(0, this.prog * this.len - 120));
      const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      g.addColorStop(0, colA(pal, this.color, 0));
      g.addColorStop(1, colA(pal, this.color, 0.95));
      ctx.strokeStyle = colA(pal, this.edge, 0.7);
      ctx.lineWidth = this.half * 0.9;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.strokeStyle = g;
      ctx.lineWidth = this.half * 0.55;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.fillStyle = pal.inv ? C.ink : '#FFFFFF';
      ctx.beginPath(); ctx.arc(head.x, head.y, this.half * 0.32, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  class CrescentWave {
    constructor(x, y, angle, size, awakened) {
      this.x = x; this.y = y;
      this.angle = angle;
      this.speed = awakened ? 620 : 720;
      this.vx = Math.cos(angle) * this.speed; this.vy = Math.sin(angle) * this.speed;
      this.size = size;
      this.r = 22 * size;
      this.life = awakened ? 2.8 : 0.75;
      this.orbitA = angle;     // 天叢雲：螺旋軌道の位相
      this.max = this.life;
      this.awakened = awakened;
      this.hitMap = new Map();
      this.riftT = 0;
      this.spin = 0;
      this.dead = false;
      this.lx = x; this.ly = y;
    }
    update(dt, game) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.spin += dt * 10;
      if (this.awakened) {
        // 天叢雲：主人公を中心とする巨大な螺旋軌道（外へ広がって戻るブーメラン大車輪）
        const pl = game.player;
        const p = 1 - this.life / this.max;
        const R = 70 + 300 * Math.sin(Math.PI * p);
        this.orbitA += dt * 4.6;
        const nx = pl.x + Math.cos(this.orbitA) * R, ny = pl.y + Math.sin(this.orbitA) * R;
        this.vx = (nx - this.x) / Math.max(dt, 1e-4); this.vy = (ny - this.y) / Math.max(dt, 1e-4);
        this.x = nx; this.y = ny;
      } else {
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (!game.inView(this.x, this.y, 140)) this.dead = true;
      }
      this.angle = Math.atan2(this.vy, this.vx);
    }
    draw(ctx, pal) {
      const a = Math.min(1, this.life / Math.min(0.3, this.max));
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      const r = this.r;
      ctx.fillStyle = colA(pal, this.awakened ? C.gold : C.cyan, 0.3 * a);
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
      ctx.arc(-r * 0.45, 0, r * 0.82, Math.PI / 2, -Math.PI / 2, true);
      ctx.fill();
      ctx.fillStyle = pal.inv ? C.crimson : `rgba(255,255,255,${0.9 * a})`;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, -Math.PI / 2.3, Math.PI / 2.3);
      ctx.arc(-r * 0.25, 0, r * 0.78, Math.PI / 2.3, -Math.PI / 2.3, true);
      ctx.fill();
      ctx.restore();
    }
  }

  /* 魂ジェム（翡翠色の経験値） */
  class SoulGem {
    constructor(x, y, value, vx, vy) {
      this.x = x; this.y = y;
      this.value = value;
      this.vx = vx || U.rand(-60, 60); this.vy = vy || U.rand(-60, 60);
      this.magnet = false;
      this.age = 0;
      this.dead = false;
      this.ph = Math.random() * TAU;
    }
    /** 竜巻一斉バキューム：螺旋軌道で秒速1800pxでプレイヤーへ */
    startTornado(px, py, dir) {
      this.tornado = true;
      this.magnet = true;
      this.spin = dir || 1;
      this.tr = Math.hypot(this.x - px, this.y - py);
      this.ta = Math.atan2(this.y - py, this.x - px);
    }
    update(dt, game) {
      this.age += dt;
      const pl = game.player;
      if (this.tornado) {
        const r = this.tr;
        const tang = Math.min(r * 7, 1100);
        const radial = Math.sqrt(Math.max(0, P.TORNADO_SPEED * P.TORNADO_SPEED - tang * tang));
        this.tr = Math.max(0, r - Math.max(radial, 500) * dt);
        this.ta += this.spin * (tang / Math.max(20, r)) * dt;
        const ox = this.x, oy = this.y;
        this.x = pl.x + Math.cos(this.ta) * this.tr;
        this.y = pl.y + Math.sin(this.ta) * this.tr;
        this.vx = (this.x - ox) / Math.max(dt, 1e-4); this.vy = (this.y - oy) / Math.max(dt, 1e-4);
        if (this.tr < 16) { this.dead = true; game.collectGem(this); }
        return;
      }
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!this.magnet && this.age > 0.25 && (d < game.magnetRadius() || game.magnetAll)) this.magnet = true;
      if (this.magnet) {
        const sp = 420 + Math.min(900, this.age * 300);
        this.vx += (dx / d) * sp * dt * 8;
        this.vy += (dy / d) * sp * dt * 8;
        const v = Math.hypot(this.vx, this.vy);
        const max = 900;
        if (v > max) { this.vx = this.vx / v * max; this.vy = this.vy / v * max; }
        if (d < 18) { this.dead = true; game.collectGem(this); return; }
      } else {
        const k = Math.exp(-3 * dt);
        this.vx *= k; this.vy *= k;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    /** 特大魂オーブのティア（1:朱玉 2:金玉 3:虹玉） */
    get tier() { return this.value >= 80 ? 3 : this.value >= 30 ? 2 : 1; }
    _drawMerged(ctx, pal, game) {
      const t = game.realTime;
      const tier = this.tier;
      const R = tier === 3 ? 16 : tier === 2 ? 13 : 10;
      const pulse = 1 + Math.sin(t * 7 + this.ph) * 0.12;
      ctx.save();
      ctx.translate(this.x, this.y);
      if (!pal.inv) {
        ctx.globalCompositeOperation = 'lighter';
        const glow = tier === 3 ? C.cyan : tier === 2 ? C.gold : C.crimson;
        ctx.fillStyle = U.rgba(glow, 0.22);
        ctx.beginPath(); ctx.arc(0, 0, R * 2.4 * pulse, 0, TAU); ctx.fill();
        // 脈動リング／回転光輪
        const rings = tier === 3 ? [C.cyan, C.gold, C.crimson] : tier === 2 ? [C.gold] : [C.crimson];
        rings.forEach((c, i) => {
          ctx.save();
          ctx.rotate(t * (1.6 + i * 0.9) * (i % 2 ? -1 : 1));
          ctx.strokeStyle = U.rgba(c, 0.85);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, R * (1.35 + i * 0.32) * pulse, 0, TAU * 0.78); ctx.stroke();
          ctx.restore();
        });
        if (tier >= 2) {
          for (let i = 0; i < 6; i++) {
            const a = t * 2.4 + i * TAU / 6;
            ctx.fillStyle = U.rgba(C.gold, 0.8);
            ctx.fillRect(Math.cos(a) * R * 1.9 - 1.5, Math.sin(a) * R * 1.9 - 1.5, 3, 3);
          }
        }
        if (tier === 3 && Math.random() < 0.5) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
          const a = Math.random() * TAU;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
          ctx.lineTo(Math.cos(a + 0.3) * R * 2.2, Math.sin(a + 0.3) * R * 2.2); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // 二重菱形＋白芯
      ctx.rotate(t * 1.2);
      const outer = tier === 3 ? '#FFFFFF' : tier === 2 ? C.gold : C.crimson;
      ctx.fillStyle = col(pal, outer);
      ctx.beginPath(); ctx.moveTo(0, -R * 1.3); ctx.lineTo(R, 0); ctx.lineTo(0, R * 1.3); ctx.lineTo(-R, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col(pal, tier === 1 ? C.gold : tier === 2 ? '#FFF3C4' : C.cyan);
      ctx.beginPath(); ctx.moveTo(0, -R * 0.8); ctx.lineTo(R * 0.6, 0); ctx.lineTo(0, R * 0.8); ctx.lineTo(-R * 0.6, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = pal.inv ? C.paper : '#FFFFFF';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.28, 0, TAU); ctx.fill();
      ctx.restore();
    }
    draw(ctx, pal, game) {
      if (this.isMerged) { this._drawMerged(ctx, pal, game); return; }
      const s = 3.2 + Math.min(5, Math.sqrt(this.value) * 1.4);
      const pulse = 1 + Math.sin(game.realTime * 6 + this.ph) * 0.12;
      const big = this.value >= 8;
      const c = big ? C.gold : C.jade;
      if (this.tornado && !pal.inv) {
        // 翡翠色の竜巻軌跡
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgba(C.jade, 0.45);
        ctx.lineWidth = s * 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - this.vx * 0.03, this.y - this.vy * 0.03); ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(game.realTime * 1.5 + this.ph);
      if (!pal.inv) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = U.rgba(c, 0.18);
        ctx.beginPath(); ctx.arc(0, 0, s * 2.2 * pulse, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = col(pal, c);
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.4 * pulse); ctx.lineTo(s * pulse, 0); ctx.lineTo(0, s * 1.4 * pulse); ctx.lineTo(-s * pulse, 0); ctx.closePath();
      ctx.fill();
      if (!pal.inv) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(s * 0.4, 0); ctx.lineTo(0, -s * 0.1); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  /* 黒縄地獄のミニブラックホール */
  class MiniBlackHole {
    constructor(x, y) {
      this.x = x; this.y = y; this.r = 70; this.life = 1.6; this.max = 1.6; this.tick = 0; this.dead = false;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx, pal, game) {
      const a = Math.min(1, this.life / 0.3, (this.max - this.life) / 0.15 + 0.2);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = pal.inv ? `rgba(9,10,15,${a})` : `rgba(0,0,0,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
      ctx.rotate(game.realTime * 6);
      ctx.strokeStyle = colA(pal, C.crimson, 0.8 * a);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(0, 0, 26 + i * 12, i, i + 2.2); ctx.stroke();
      }
      ctx.strokeStyle = pal.inv ? C.ink : `rgba(255,255,255,${a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  /* ========================================================================
   * 秘伝の巻物（Jackpot Scroll）：エリート撃破で確定ドロップ
   * ====================================================================== */
  class Scroll {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.r = 16;
      this.life = P.SCROLL_LIFE;
      this.age = 0;
      this.dead = false;
      this.vy = -120;
    }
    update(dt, game) {
      this.age += dt;
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.vy *= Math.exp(-4 * dt);
      this.y += this.vy * dt;
      const pl = game.player;
      const d = Math.hypot(pl.x - this.x, pl.y - this.y);
      if (d < 80 && d > 1) { this.x += (pl.x - this.x) / d * 160 * dt; this.y += (pl.y - this.y) / d * 160 * dt; }
      if (d < this.r + pl.r + 8) { this.dead = true; game.collectScroll(this); }
    }
    draw(ctx, pal, game) {
      const t = game.realTime;
      const blink = this.life < 4 && Math.floor(t * 8) % 2 === 0;
      if (blink) return;
      ctx.save();
      ctx.translate(this.x, this.y + Math.sin(t * 3 + this.age) * 4);
      if (!pal.inv) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
        g.addColorStop(0, 'rgba(255,190,46,0.55)');
        g.addColorStop(1, 'rgba(255,190,46,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.fill();
        ctx.rotate(t * 1.2);
        ctx.strokeStyle = 'rgba(255,230,160,0.6)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34); ctx.stroke();
        }
        ctx.rotate(-t * 1.2);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.rotate(-0.35);
      // 巻物本体
      ctx.fillStyle = col(pal, '#F3E6C4');
      ctx.fillRect(-14, -8, 28, 16);
      ctx.fillStyle = col(pal, '#7A1020');
      ctx.fillRect(-14, -8, 28, 4);
      ctx.fillStyle = col(pal, C.gold);
      ctx.fillRect(-18, -10, 5, 20);
      ctx.fillRect(13, -10, 5, 20);
      ctx.fillStyle = col(pal, '#1A0608');
      ctx.font = '900 10px "Hiragino Mincho ProN","Yu Mincho",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('秘伝', 0, 3);
      ctx.restore();
    }
  }

  /* ========================================================================
   * 5大陣形スポナー（Formation）：一筆書きでなぞりたくなる美しい陣形
   * 陣形のアンカー（中心）が移動し、各メンバーは自分のスロットへ吸着する。
   * ====================================================================== */
  class Formation {
    constructor(type, game, cfg) {
      this.type = type;
      this.t = 0;
      this.done = false;
      this.members = [];
      this.slots = [];        // ローカル座標 [x, y]
      this.rot = 0;
      this.rotV = 0;
      this.scale = 1;
      this.carrier = null;    // 中心の火薬樽（Gimmick）
      Object.assign(this, cfg || {});
    }
    add(e, ox, oy) {
      e.form = this;
      e.slot = this.slots.length;
      this.slots.push([ox, oy]);
      this.members.push(e);
      return e;
    }
    _rotPt(ox, oy) {
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      return { x: this.x + (ox * c - oy * s) * this.scale, y: this.y + (ox * s + oy * c) * this.scale };
    }
    slotPos(i) {
      if (this.type === 'sLine') {
        // S字大名行列：各メンバーは同じS字曲線を時間差で行進
        const u = this.t * this.speed - i * this.spacing;
        if (u > this.endU) return null;  // 終点に到達したメンバーから自由行動へ
        const along = u, side = Math.sin(u / this.wave * TAU) * this.amp;
        return { x: this.x + this.dx * along - this.dy * side, y: this.y + this.dy * along + this.dx * side };
      }
      const sl = this.slots[i];
      return this._rotPt(sl[0], sl[1]);
    }
    update(dt, game) {
      if (this.done) return;
      this.t += dt;
      const pl = game.player;
      const alive = this.members.some((m) => !m.dead && m.form === this);
      if (!alive && this.type !== 'opening') { this.finish(); return; }
      switch (this.type) {
        case 'opening':
          // 2.5秒は二重円陣を保ってゆっくり回転し、その後一斉に襲い掛かる
          this.rot += dt * 0.35;
          if (this.t > 2.6 || !alive) this.finish();
          break;
        case 'ring': {
          const dx = pl.x - this.x, dy = pl.y - this.y, d = Math.hypot(dx, dy) || 1;
          if (d > 175) { this.x += dx / d * 72 * dt; this.y += dy / d * 72 * dt; }
          this.rot += dt * 0.6;
          if (d <= 175 || this.t > 11) this.finish();
          break;
        }
        case 'sLine':
          if (this.t * this.speed - (this.members.length - 1) * this.spacing > this.endU) this.finish();
          break;
        case 'vWing':
          this.x += this.vx * dt; this.y += this.vy * dt;
          if (this.t > 1.2 && !game.inView(this.x, this.y, 260)) this.finish();
          break;
        case 'spiral':
          this.rot += dt * 0.55;
          this.scale = Math.max(0.55, 1.25 - this.t * 0.08);
          if (this.t > 9.5) this.finish();
          break;
        case 'sniper': {
          const dx = pl.x - this.x, dy = pl.y - this.y, d = Math.hypot(dx, dy) || 1;
          if (d > 300) { this.x += dx / d * 55 * dt; this.y += dy / d * 55 * dt; }
          const want = Math.atan2(dy, dx) - Math.PI / 2;
          this.rot += U.clamp(U.angleDiff(this.rot, want), -dt, dt);
          if (this.t > 14) this.finish();
          break;
        }
      }
      if (this.carrier && !this.carrier.dead) { this.carrier.x = this.x; this.carrier.y = this.y; }
    }
    finish() {
      this.done = true;
      for (const m of this.members) if (m.form === this) m.form = null;
    }
  }

  /** 陣形を生成して game.enemies へ投入する */
  function spawnFormation(game, type, opts) {
    opts = opts || {};
    const cfg = CFG.FORMATIONS[type];
    const pl = game.player;
    const V = game.view;
    const eo = opts.enemyOpts || {};
    const push = (e) => { game.enemies.push(e); return e; };
    const edge = () => game._edgePoint();
    let f;
    if (type === 'opening') {
      // 主人公の上方220px：火薬樽1＋提灯お化け2を中心に、20体の笠蜘蛛が二重円陣
      const x = pl.x, y = pl.y - 220;
      f = new Formation('opening', game, { x, y });
      const barrel = new PowderBarrel(x, y);
      barrel.age = 1;
      game.gimmicks.push(barrel);
      f.carrier = barrel;
      f.add(push(new BombLantern(x - 30, y, eo)), -30, 0);
      f.add(push(new BombLantern(x + 30, y, eo)), 30, 0);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; f.add(push(new SwarmSpider(x + Math.cos(a) * 70, y + Math.sin(a) * 70, eo)), Math.cos(a) * 70, Math.sin(a) * 70); }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.26; f.add(push(new SwarmSpider(x + Math.cos(a) * 118, y + Math.sin(a) * 118, eo)), Math.cos(a) * 118, Math.sin(a) * 118); }
      for (const m of f.members) m.age = 0.2;
    } else if (type === 'sLine') {
      const n = U.randInt(cfg.min, cfg.max);
      const st = edge();
      const tx = pl.x + U.rand(-120, 120), ty = pl.y + U.rand(-120, 120);
      const L = Math.hypot(tx - st.x, ty - st.y) || 1;
      f = new Formation('sLine', game, { x: st.x, y: st.y, dx: (tx - st.x) / L, dy: (ty - st.y) / L, speed: 115, spacing: 30, amp: 70, wave: 340, endU: L + 60 });
      for (let i = 0; i < n; i++) {
        const sp = { x: st.x - f.dx * i * 30, y: st.y - f.dy * i * 30 };
        f.add(push(new SwarmSpider(sp.x, sp.y, eo)), 0, 0);
      }
    } else if (type === 'ring') {
      const n = U.randInt(cfg.min, cfg.max);
      const st = edge();
      f = new Formation('ring', game, { x: st.x, y: st.y });
      const useBarrel = Math.random() < 0.6;
      if (useBarrel) {
        const barrel = new PowderBarrel(st.x, st.y);
        game.gimmicks.push(barrel);
        f.carrier = barrel;
      } else {
        f.add(push(new BombLantern(st.x, st.y, eo)), 0, 0);
      }
      const inner = n > 20 ? 10 : 0;
      for (let i = 0; i < n; i++) {
        const ringN = i < inner ? inner : n - inner;
        const k = i < inner ? i : i - inner;
        const R = i < inner ? 64 : 104 + (n - 18) * 1.5;
        const a = (k / ringN) * TAU + (i < inner ? 0.3 : 0);
        f.add(push(new SwarmSpider(st.x + Math.cos(a) * R, st.y + Math.sin(a) * R, eo)), Math.cos(a) * R, Math.sin(a) * R);
      }
    } else if (type === 'vWing') {
      // 雁行（V字）で画面を斜めに高速通過
      const corner = U.randInt(0, 3);
      // 可視範囲の斜め外側から反対側へ横断
      const vw = V.hw * 2, vh = V.hh * 2;
      const sx = V.x0 + (corner % 2 === 0 ? -120 : vw + 120), sy = V.y0 + (corner < 2 ? U.rand(-60, vh * 0.35) : U.rand(vh * 0.65, vh + 60));
      const tx = 2 * V.cx - sx + U.rand(-80, 80), ty = 2 * V.cy - sy + U.rand(-80, 80);
      const L = Math.hypot(tx - sx, ty - sy) || 1;
      const dir = Math.atan2(ty - sy, tx - sx);
      f = new Formation('vWing', game, { x: sx, y: sy, vx: (tx - sx) / L * 215, vy: (ty - sy) / L * 215, rot: dir + Math.PI / 2 });
      for (let i = 0; i < cfg.min; i++) {
        const k = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1);
        const ox = side * k * 26, oy = k * 28;  // 先頭が前方（ローカル -y が進行方向）
        const Cls = (i === 0 || i % 3 === 0) ? SplitterNinja : SwarmSpider;
        const p = f._rotPt(ox, oy);
        const e = push(new Cls(p.x, p.y, eo));
        f.add(e, ox, oy);
      }
    } else if (type === 'spiral') {
      const n = U.randInt(cfg.min, cfg.max);
      const cx = Math.random() < 0.5 ? pl.x : V.cx, cy = Math.random() < 0.5 ? pl.y : V.cy;
      f = new Formation('spiral', game, { x: cx, y: cy, scale: 1.25 });
      for (let i = 0; i < n; i++) {
        const th = i * 0.43, R = 110 + i * 8.5;
        const p = f._rotPt(Math.cos(th) * R, Math.sin(th) * R);
        const e = push(new SwarmSpider(p.x, p.y, eo));
        f.add(e, Math.cos(th) * R, Math.sin(th) * R);
      }
    } else if (type === 'sniper') {
      const st = edge();
      f = new Formation('sniper', game, { x: st.x, y: st.y });
      const S = 88;
      const corners = [[-S, -S], [S, -S], [S, S], [-S, S]];
      for (const c of corners) f.add(push(new SniperAshigaru(st.x + c[0], st.y + c[1], eo)), c[0], c[1]);
      for (const c of [[0, -S], [0, S]]) f.add(push(new ArmoredOni(st.x + c[0], st.y + c[1], eo)), c[0], c[1]);
      for (const c of [[-S, 0], [S, 0], [-S / 2, -S], [S / 2, -S], [-S / 2, S], [S / 2, S]]) f.add(push(new SwarmSpider(st.x + c[0], st.y + c[1], eo)), c[0], c[1]);
    }
    if (f) game.formations.push(f);
    return f;
  }

  /* ========================================================================
   * WeakCore：ボスの弱点核（黄金に光る部位マーカー）
   * ====================================================================== */
  class WeakCore {
    constructor(boss, index, r, hp) {
      this.id = ENTITY_ID++;
      this.boss = boss;
      this.index = index;
      this.x = boss.x; this.y = boss.y;
      this.r = r || 16;
      this.maxHp = hp || 6;
      this.hp = this.maxHp;
      this.broken = false;
      this.regen = 0;
      this.isCore = true;
      this.lockStroke = -1; this.lockCount = 0; this.inside = false;
      this.pending = false;
      this.hitFlash = 0;
      this.dead = false;
    }
    get lockable() { return !this.broken && !this.boss.entering && !this.boss.executing && !this.boss.dead; }
    update(dt) {
      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.broken) {
        this.regen -= dt;
        if (this.regen <= 0) { this.broken = false; this.hp = this.maxHp; }
      }
    }
    breakCore(regen) {
      this.broken = true;
      this.regen = regen || 10;
      this.hp = 0;
    }
    draw(ctx, pal, game) {
      const t = game.realTime;
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.broken) {
        ctx.strokeStyle = colA(pal, '#5A4A2A', 0.8);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, this.r * 0.7, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke();
        ctx.restore();
        return;
      }
      const pulse = 0.5 + Math.sin(t * 7 + this.index) * 0.5;
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      ctx.fillStyle = colA(pal, C.gold, 0.18 + pulse * 0.15);
      ctx.beginPath(); ctx.arc(0, 0, this.r * 1.6, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = col(pal, this.hitFlash > 0 ? '#FFFFFF' : C.gold);
      ctx.beginPath(); ctx.arc(0, 0, this.r * 0.55, 0, TAU); ctx.fill();
      ctx.strokeStyle = col(pal, C.gold);
      ctx.lineWidth = 2;
      ctx.save();
      ctx.rotate(t * 2);
      polygon(ctx, 4, this.r, 0);
      ctx.stroke();
      ctx.restore();
      // 核HP
      const f = this.hp / this.maxHp;
      ctx.strokeStyle = colA(pal, '#FFFFFF', 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, this.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      if (this.pending) {
        ctx.fillStyle = pal.inv ? C.crimson : '#FFFFFF';
        ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  /* ========================================================================
   * Boss 基底クラス
   * ====================================================================== */
  class Boss {
    constructor(kind, game, opts) {
      opts = opts || {};
      const cfg = CFG.BOSSES[kind];
      this.id = ENTITY_ID++;
      this.kind = kind;
      this.name = cfg.name;
      this.en = cfg.en;
      this.isBoss = true;
      this.level = opts.level || 0;      // エンドレス強化段階
      this.hpMult = opts.hpMult || 1;
      this.spdMult = opts.spdMult || 1;
      this.maxHp = Math.round(cfg.hp * this.hpMult);
      this.hp = this.maxHp;
      this.x = game.view.cx; this.y = game.view.y0 - 120;
      this.r = 40;
      this.cores = [];
      this.t = 0;
      this.entering = 1.6;
      this.stun = 0;
      this.down = false;
      this.chant = null;
      this.atkT = 0;
      this.defense = 0.4;
      this.dead = false;
      this.executing = false;
      this.hitFlash = 0;
      this.lockStroke = -1; this.lockCount = 0; this.inside = false;
      this.pending = false;
      this.telegraphs = [];
      this.contactCd = 0;
    }
    get lockable() { return !this.dead && !this.entering && !this.executing; }
    get coresAlive() { return this.cores.filter((c) => !c.broken); }
    /** 当たり判定用の部位リスト [{x,y,r}] */
    parts() { return [this]; }

    takeDamageMult() { return 1 - this.defense * (this.down ? 0.5 : 1); }

    cancelChant() {
      if (this.chant) { this.chant = null; this.telegraphs = this.telegraphs.filter((t) => !t.chant); }
    }

    stunFor(sec, isDown) {
      this.stun = Math.max(this.stun, sec);
      if (isDown) this.down = true;
      this.cancelChant();
    }

    baseUpdate(dt, game) {
      this.t += dt;
      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.contactCd > 0) this.contactCd -= dt;
      for (const c of this.cores) c.update(dt);
      // テレグラフ更新
      for (const tg of this.telegraphs) tg.t += dt;
      if (this.entering > 0) {
        this.entering -= dt;
        if (this.entering <= 0) this.entering = 0;
        return false;
      }
      if (this.executing) return false;
      if (this.stun > 0) {
        this.stun -= dt;
        if (this.stun <= 0) { this.stun = 0; this.down = false; }
        return false;
      }
      return true;
    }

    /** チャント（大技詠唱）バー描画 */
    drawChantBar(ctx, pal) {
      if (!this.chant) return;
      const p = Math.min(1, this.chant.t / this.chant.dur);
      const w = 120;
      ctx.save();
      ctx.translate(this.x, this.y - this.r - 34);
      ctx.fillStyle = pal.inv ? 'rgba(9,10,15,0.2)' : 'rgba(0,0,0,0.6)';
      ctx.fillRect(-w / 2, -5, w, 10);
      ctx.fillStyle = col(pal, C.crimson);
      ctx.fillRect(-w / 2, -5, w * p, 10);
      ctx.strokeStyle = col(pal, C.gold);
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -5, w, 10);
      ctx.font = '800 13px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = col(pal, '#FFFFFF');
      ctx.fillText(`詠唱：${this.chant.name}`, 0, -10);
      ctx.restore();
    }

    drawDownMark(ctx, pal, game) {
      if (this.stun > 0 && !this.executing) {
        ctx.save();
        ctx.font = '900 18px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = col(pal, this.down ? C.gold : C.cyan);
        ctx.fillText(this.down ? `大ダウン ${this.stun.toFixed(1)}` : `スタン ${this.stun.toFixed(1)}`, this.x, this.y - this.r - 20 + Math.sin(game.realTime * 8) * 3);
        ctx.restore();
      }
    }

    drawTelegraphs(ctx, pal) {
      for (const tg of this.telegraphs) {
        const p = Math.min(1, tg.t / tg.dur);
        ctx.save();
        if (tg.type === 'line') {
          ctx.strokeStyle = colA(pal, C.crimson, 0.15 + p * 0.5);
          ctx.lineWidth = tg.w * (0.4 + p * 0.6);
          ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.moveTo(tg.x1, tg.y1); ctx.lineTo(tg.x2, tg.y2); ctx.stroke();
          ctx.strokeStyle = colA(pal, '#FFFFFF', 0.4 + p * 0.5);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([16, 10]);
          ctx.lineDashOffset = -tg.t * 120;
          ctx.stroke();
        } else if (tg.type === 'circle') {
          ctx.fillStyle = colA(pal, C.crimson, 0.08 + p * 0.22);
          ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = colA(pal, C.crimson, 0.8);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r * p, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
      this.telegraphs = this.telegraphs.filter((tg) => tg.t < tg.dur + (tg.linger || 0));
    }

    /** ボス全体（部位・核・拠点）を平行移動 */
    shift(dx, dy) {
      this.x += dx; this.y += dy;
      if (this.segs) for (const sg of this.segs) { sg.x += dx; sg.y += dy; }
      if (this.home) { this.home.x += dx; this.home.y += dy; }
      for (const c of this.cores) { c.x += dx; c.y += dy; }
    }
    /** 無限マップ：プレイヤーから可視半径×1.5以上離れたら移動速度2.2倍で追跡 */
    chaseMult(game) {
      const d = Math.hypot(game.player.x - this.x, game.player.y - this.y);
      return d > game.view.r * P.BOSS_CHASE_DIST ? P.BOSS_CHASE_SPEED : 1;
    }

    /** 処刑中：膝をつく */
    updateExecution(dt, game) {
      const c = game.execCenter || game.view;
      const tx = c.x != null ? c.x : c.cx, ty = c.y != null ? c.y : c.cy;
      const dx = (tx - this.x) * Math.min(1, dt * 6), dy = (ty - this.y) * Math.min(1, dt * 6);
      this.shift(dx, dy);
    }
  }

  /* ------------------------------------------------------------------------
   * 第1幕ボス：からくり大百足・黒鉄（KUROGANE）
   * ---------------------------------------------------------------------- */
  class BossCentipede extends Boss {
    constructor(game, opts) {
      super('centipede', game, opts);
      const cfg = CFG.BOSSES.centipede;
      this.segR = cfg.segR;
      this.r = 32;
      this.spacing = 46;
      this.segs = [];
      const V = game.view;
      for (let i = 0; i < cfg.segments; i++) this.segs.push({ x: V.cx, y: V.y0 - 120 - i * this.spacing, r: i === 0 ? 32 : this.segR });
      this.heading = Math.PI / 2;
      this.speed = 150 * this.spdMult;
      this.target = { x: V.cx, y: V.y0 + V.hh * 0.8 };
      this.wanderT = 0;
      this.sprayT = 2.5;
      this.chargeT = 7;
      this.charge = null;
      const coreHp = 6 + this.level * 2;
      [0, 2, 5, 7].forEach((si, i) => { const c = new WeakCore(this, i, 15, coreHp); c.seg = si; this.cores.push(c); });
    }
    parts() { return this.segs; }
    cancelChant() {
      super.cancelChant();
      this.charge = null;
    }
    update(dt, game) {
      const active = this.baseUpdate(dt, game);
      const head = this.segs[0];
      if (this.executing) {
        this.updateExecution(dt, game);
        head.x = this.x; head.y = this.y;
      } else if (this.entering > 0) {
        head.y += 140 * dt;
        head.x = game.view.cx + Math.sin(this.t * 3) * 30;
      } else if (active) {
        if (this.charge) {
          const c = this.charge;
          c.t += dt;
          if (c.t >= c.wait) {
            head.x += Math.cos(c.ang) * 980 * this.spdMult * dt;
            head.y += Math.sin(c.ang) * 980 * this.spdMult * dt;
            this.heading = c.ang;
            if (c.t > c.wait + c.len / 980) { this.charge = null; this.chant = null; }
          }
          if (this.chant) this.chant.t += dt;
        } else {
          // うねりながら徘徊
          this.wanderT -= dt;
          const dtx = this.target.x - head.x, dty = this.target.y - head.y;
          const chase = this.chaseMult(game);
          if (this.wanderT <= 0 || Math.hypot(dtx, dty) < 60 || chase > 1) {
            this.wanderT = 2.4;
            const pl = game.player;
            const V = game.view;
            this.target = Math.random() < 0.45 || chase > 1
              ? { x: pl.x, y: pl.y }
              : { x: U.rand(V.x0 + 90, V.x1 - 90), y: U.rand(V.y0 + 90, V.y1 - 90) };
          }
          const want = Math.atan2(this.target.y - head.y, this.target.x - head.x) + Math.sin(this.t * 2.6) * 0.6;
          this.heading += U.clamp(U.angleDiff(this.heading, want), -2.4 * dt, 2.4 * dt);
          head.x += Math.cos(this.heading) * this.speed * chase * dt;
          head.y += Math.sin(this.heading) * this.speed * chase * dt;
          // 攻撃①：胴体から全方位赤弾ばら撒き
          this.sprayT -= dt;
          if (this.sprayT <= 0) {
            this.sprayT = 4.4 - Math.min(1.5, this.level * 0.3);
            const bs = (170 + this.level * 20);
            for (let i = 1; i < this.segs.length; i++) {
              const s = this.segs[i], p = this.segs[i - 1];
              const a = Math.atan2(s.y - p.y, s.x - p.x) + Math.PI / 2;
              game.spawnBullet(s.x, s.y, Math.cos(a) * bs, Math.sin(a) * bs);
              game.spawnBullet(s.x, s.y, -Math.cos(a) * bs, -Math.sin(a) * bs);
            }
          }
          // 攻撃②（大技詠唱）：赤い突進予兆ライン→画面横断チャージ
          this.chargeT -= dt;
          if (this.chargeT <= 0) {
            this.chargeT = 9 - Math.min(3, this.level * 0.6);
            const pl = game.player;
            const ang = Math.atan2(pl.y - head.y, pl.x - head.x);
            const len = Math.hypot(game.view.hw, game.view.hh) * 2;
            this.charge = { ang, t: 0, wait: 1.3, len };
            this.chant = { name: '黒鉄大蛇突', t: 0, dur: 1.3 };
            this.telegraphs.push({ type: 'line', x1: head.x, y1: head.y, x2: head.x + Math.cos(ang) * len, y2: head.y + Math.sin(ang) * len, w: 60, t: 0, dur: 1.3, chant: true });
          }
        }
        // 無限マップ：画面外へ突き抜けたらチャージを終えてプレイヤーへ向き直る（壁反射なし）
        if (!game.inView(head.x, head.y, 120)) {
          if (this.charge && this.charge.t > this.charge.wait) { this.charge = null; this.chant = null; }
          if (!this.charge) this.heading = Math.atan2(game.player.y - head.y, game.player.x - head.x);
        }
      }
      // 節の追従（チェーン拘束）
      for (let i = 1; i < this.segs.length; i++) {
        const s = this.segs[i], p = this.segs[i - 1];
        const dx = s.x - p.x, dy = s.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > this.spacing) {
          s.x = p.x + (dx / d) * this.spacing;
          s.y = p.y + (dy / d) * this.spacing;
        }
      }
      this.x = head.x; this.y = head.y;
      for (const c of this.cores) { const s = this.segs[c.seg]; c.x = s.x; c.y = s.y; }
    }
    drawBody(ctx, pal) {
      // 断面分解用：頭部のみ
      ctx.save();
      polygon(ctx, 6, 32, 0);
      ctx.fillStyle = col(pal, '#141821');
      ctx.fill();
      ctx.restore();
    }
    draw(ctx, pal, game) {
      const kneel = this.executing;
      for (let i = this.segs.length - 1; i >= 0; i--) {
        const s = this.segs[i];
        const p = this.segs[Math.max(0, i - 1)];
        const ang = i === 0 ? this.heading : Math.atan2(p.y - s.y, p.x - s.x);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(ang);
        // 脚
        ctx.strokeStyle = col(pal, '#5A6378');
        ctx.lineWidth = 3;
        const leg = Math.sin(this.t * 12 + i) * 0.4;
        ctx.beginPath();
        ctx.moveTo(0, -s.r * 0.6); ctx.lineTo(-8 + leg * 10, -s.r - 14);
        ctx.moveTo(0, s.r * 0.6); ctx.lineTo(-8 - leg * 10, s.r + 14);
        ctx.stroke();
        // 装甲節
        polygon(ctx, 6, s.r, 0);
        ctx.fillStyle = col(pal, i === 0 ? '#1C2130' : '#141821');
        ctx.fill();
        ctx.strokeStyle = col(pal, this.hitFlash > 0 ? '#FFFFFF' : '#7A869E');
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = colA(pal, C.crimson, 0.7);
        ctx.lineWidth = 1.2;
        polygon(ctx, 6, s.r * 0.6, Math.PI / 6);
        ctx.stroke();
        if (i === 0) {
          // 頭部：顎と赤い複眼
          ctx.fillStyle = col(pal, C.crimson);
          ctx.beginPath(); ctx.arc(s.r * 0.35, -s.r * 0.35, 4, 0, TAU); ctx.arc(s.r * 0.35, s.r * 0.35, 4, 0, TAU); ctx.fill();
          ctx.strokeStyle = col(pal, '#C9D2E3');
          ctx.lineWidth = 3;
          const m = Math.sin(this.t * 8) * 0.2;
          ctx.beginPath();
          ctx.moveTo(s.r * 0.8, -8); ctx.quadraticCurveTo(s.r * 1.6, -14 - m * 20, s.r * 1.5, 2);
          ctx.moveTo(s.r * 0.8, 8); ctx.quadraticCurveTo(s.r * 1.6, 14 + m * 20, s.r * 1.5, -2);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (kneel && !pal.inv) {
        ctx.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.1})`;
        ctx.beginPath(); ctx.arc(this.x, this.y, 50, 0, TAU); ctx.fill();
      }
      for (const c of this.cores) c.draw(ctx, pal, game);
      this.drawChantBar(ctx, pal);
      this.drawDownMark(ctx, pal, game);
    }
  }

  /* ------------------------------------------------------------------------
   * 第2幕ボス：六腕の重装鬼将・獄炎（GOKUEN）
   * ---------------------------------------------------------------------- */
  class BossSixArmGeneral extends Boss {
    constructor(game, opts) {
      super('general', game, opts);
      const cfg = CFG.BOSSES.general;
      this.r = cfg.bodyR;
      this.orbit = cfg.orbit;
      this.armR = cfg.armR;
      this.armRot = 0;
      this.home = { x: game.view.cx, y: game.view.cy - game.view.hh * 0.16 };
      this.spiralT = 3; this.spiral = 0; this.spiralAng = 0;
      this.slamT = 5;
      this.chantT = 12;
      this.cannonT = 2;
      const coreHp = 6 + this.level * 2;
      for (let i = 0; i < 6; i++) { const c = new WeakCore(this, i, cfg.armR, coreHp); c.weapon = i % 2 ? 'cannon' : 'sword'; this.cores.push(c); }
    }
    parts() { return [this]; }
    update(dt, game) {
      const active = this.baseUpdate(dt, game);
      this.armRot += dt * (this.stun > 0 ? 0.15 : 0.65 * this.spdMult);
      if (this.executing) {
        this.updateExecution(dt, game);
      } else if (this.entering > 0) {
        this.y += (this.home.y - this.y) * Math.min(1, dt * 2.2);
        this.x = this.home.x;
      } else if (active) {
        // 拠点はカメラ中心のやや上へゆっくり追従（離れすぎたら2.2倍速）
        const V = game.view;
        const tx = V.cx, ty = V.cy - V.hh * 0.16;
        const hd = Math.hypot(tx - this.home.x, ty - this.home.y);
        if (hd > 1) {
          const step = Math.min(hd, 70 * this.chaseMult(game) * dt);
          this.home.x += (tx - this.home.x) / hd * step; this.home.y += (ty - this.home.y) / hd * step;
        }
        this.x = this.home.x + Math.sin(this.t * 0.5) * V.hw * 0.36;
        this.y = this.home.y + Math.sin(this.t * 1.0) * V.hh * 0.16;
        const bs = 1 + this.level * 0.12;
        // 攻撃①：火炎弾の螺旋連射
        this.spiralT -= dt;
        if (this.spiralT <= 0 && this.spiral <= 0 && !this.chant) { this.spiral = 3; this.spiralT = 7; }
        if (this.spiral > 0) {
          this.spiral -= dt;
          this.spiralAcc = (this.spiralAcc || 0) + dt;
          while (this.spiralAcc > 0.085) {
            this.spiralAcc -= 0.085;
            this.spiralAng += 0.36;
            for (let k = 0; k < 2; k++) {
              const a = this.spiralAng + k * Math.PI;
              game.spawnBullet(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, Math.cos(a) * 190 * bs, Math.sin(a) * 190 * bs, { fire: true });
            }
          }
        }
        // 攻撃②：床面への巨大赤円予兆→叩きつけ衝撃波
        this.slamT -= dt;
        if (this.slamT <= 0) {
          this.slamT = 6 - Math.min(2, this.level * 0.4);
          const pl = game.player;
          this.telegraphs.push({ type: 'circle', x: pl.x, y: pl.y, r: 125, t: 0, dur: 1.2, onEnd: 'slam' });
        }
        // 大砲腕：狙撃
        this.cannonT -= dt;
        if (this.cannonT <= 0) {
          this.cannonT = 3;
          for (const c of this.cores) {
            if (c.broken || c.weapon !== 'cannon') continue;
            const a = Math.atan2(game.player.y - c.y, game.player.x - c.x);
            game.spawnBullet(c.x, c.y, Math.cos(a) * 240 * bs, Math.sin(a) * 240 * bs, { fire: true });
          }
        }
        // 大技詠唱：獄炎大旋風
        this.chantT -= dt;
        if (this.chantT <= 0 && !this.chant) {
          this.chantT = 14 - Math.min(4, this.level * 0.8);
          this.chant = { name: '獄炎大旋風', t: 0, dur: 2.4 };
        }
        if (this.chant) {
          this.chant.t += dt;
          if (this.chant.t >= this.chant.dur) {
            this.chant = null;
            this.ringQueue = [0, 0.26, 0.52];
            this.ringT = 0;
            this.ringIdx = 0;
          }
        }
        // 獄炎大旋風の発動（3連リング）
        if (this.ringQueue) {
          this.ringT += dt;
          while (this.ringQueue && this.ringIdx < this.ringQueue.length && this.ringT >= this.ringQueue[this.ringIdx]) {
            const ring = this.ringIdx++;
            for (let i = 0; i < 24; i++) {
              const a = (i / 24) * TAU + ring * 0.13;
              game.spawnBullet(this.x, this.y, Math.cos(a) * 200 * bs, Math.sin(a) * 200 * bs, { fire: true });
            }
          }
          if (this.ringIdx >= 3) this.ringQueue = null;
        }
        // テレグラフ終了処理
        for (const tg of this.telegraphs) {
          if (tg.onEnd === 'slam' && tg.t >= tg.dur && !tg.done) {
            tg.done = true;
            game.bossShockwave(tg.x, tg.y, tg.r);
          }
        }
      }
      for (const c of this.cores) {
        const a = this.armRot + (c.index / 6) * TAU;
        c.x = this.x + Math.cos(a) * this.orbit;
        c.y = this.y + Math.sin(a) * this.orbit;
        c.ang = a;
      }
    }
    drawBody(ctx, pal) {
      polygon(ctx, 8, this.r, Math.PI / 8);
      ctx.fillStyle = col(pal, '#1B0A0A');
      ctx.fill();
      ctx.strokeStyle = col(pal, C.crimson);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    draw(ctx, pal, game) {
      // 腕（浮遊からくり鬼腕）
      for (const c of this.cores) {
        ctx.save();
        ctx.strokeStyle = colA(pal, '#7A869E', c.broken ? 0.15 : 0.5);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(c.x, c.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.translate(c.x, c.y);
        ctx.rotate(c.ang + Math.PI / 2);
        ctx.globalAlpha = c.broken ? 0.3 : 1;
        // 腕甲
        ctx.fillStyle = col(pal, '#2A1010');
        ctx.fillRect(-9, -10, 18, 24);
        ctx.strokeStyle = col(pal, '#C9A04A');
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-9, -10, 18, 24);
        if (c.weapon === 'sword') {
          ctx.strokeStyle = col(pal, '#E6ECFA');
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -52); ctx.stroke();
          ctx.strokeStyle = colA(pal, C.crimson, 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = col(pal, '#555B66');
          ctx.fillRect(-5, -36, 10, 26);
          ctx.fillStyle = col(pal, '#FF7A1E');
          ctx.beginPath(); ctx.arc(0, -36, 3, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      // 本体：巨大武者
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.executing) ctx.scale(1, 0.85);
      if (!pal.inv) {
        const glow = this.chant ? 0.35 + Math.sin(this.t * 20) * 0.15 : 0.15;
        ctx.fillStyle = `rgba(255,60,30,${glow})`;
        ctx.beginPath(); ctx.arc(0, 0, this.r * 1.5, 0, TAU); ctx.fill();
      }
      this.drawBody(ctx, pal);
      // 兜と面
      ctx.fillStyle = col(pal, '#2E0E0E');
      ctx.beginPath(); ctx.arc(0, -6, this.r * 0.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = col(pal, C.gold);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-this.r * 0.2, -this.r * 0.55); ctx.quadraticCurveTo(-this.r * 0.9, -this.r * 1.3, -this.r * 0.4, -this.r * 1.35);
      ctx.moveTo(this.r * 0.2, -this.r * 0.55); ctx.quadraticCurveTo(this.r * 0.9, -this.r * 1.3, this.r * 0.4, -this.r * 1.35);
      ctx.stroke();
      ctx.fillStyle = col(pal, this.hitFlash > 0 ? '#FFFFFF' : C.crimson);
      ctx.beginPath();
      ctx.moveTo(-18, -10); ctx.lineTo(-5, -4); ctx.lineTo(-18, 0); ctx.closePath();
      ctx.moveTo(18, -10); ctx.lineTo(5, -4); ctx.lineTo(18, 0); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = col(pal, '#E8ECF2');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, 14); ctx.lineTo(-6, 20); ctx.lineTo(0, 14); ctx.lineTo(6, 20); ctx.lineTo(14, 14); ctx.stroke();
      ctx.restore();
      for (const c of this.cores) c.draw(ctx, pal, game);
      this.drawChantBar(ctx, pal);
      this.drawDownMark(ctx, pal, game);
    }
  }

  /* ------------------------------------------------------------------------
   * 最終幕ボス：次元喰らいの剣聖・無明（MUMYO）
   * ---------------------------------------------------------------------- */
  class BossSwordSaint extends Boss {
    constructor(game, opts) {
      super('saint', game, opts);
      const cfg = CFG.BOSSES.saint;
      this.r = cfg.bodyR;
      this.orbit = cfg.orbit;
      this.mirrorRot = 0;
      this.home = { x: game.view.cx, y: game.view.cy - game.view.hh * 0.3 };
      this.teleT = 5;
      this.fade = 1;
      this.teleporting = 0;
      this.riftT = 4.5;
      this.cloneT = 10;
      this.fanT = 2.5;
      this.clones = [];
      this.aimAng = Math.PI / 2;
      const coreHp = 6 + this.level * 2;
      for (let i = 0; i < 5; i++) { const c = new WeakCore(this, i, cfg.mirrorR, coreHp); c.mirror = true; this.cores.push(c); }
      const bodyCore = new WeakCore(this, 5, 13, coreHp + 2);
      bodyCore.body = true;
      this.cores.push(bodyCore);
    }
    update(dt, game) {
      const active = this.baseUpdate(dt, game);
      this.mirrorRot += dt * (this.stun > 0 ? 0.2 : 0.9 * this.spdMult);
      if (this.executing) {
        this.updateExecution(dt, game);
        this.fade = 1;
      } else if (this.entering > 0) {
        this.x = this.home.x;
        this.y += (this.home.y - this.y) * Math.min(1, dt * 2.5);
      } else if (active) {
        const pl = game.player;
        this.aimAng = Math.atan2(pl.y - this.y, pl.x - this.x);
        // 瞬身（テレポート移動）
        if (this.teleporting > 0) {
          this.teleporting -= dt;
          this.fade = Math.abs(this.teleporting - 0.3) / 0.3;
          if (this.teleporting <= 0.3 && !this.teleDone) {
            this.teleDone = true;
            const V = game.view;
            this.x = U.rand(V.x0 + 120, V.x1 - 120);
            this.y = U.rand(V.y0 + 100, V.y0 + V.hh * 1.2);
          }
          if (this.teleporting <= 0) { this.fade = 1; this.teleporting = 0; }
        } else {
          this.x += Math.sin(this.t * 0.8) * 30 * dt;
          this.y += Math.cos(this.t * 1.1) * 20 * dt;
          this.teleT -= dt;
          if (this.teleT <= 0 && !this.chant) { this.teleT = 6; this.teleporting = 0.6; this.teleDone = false; }
          // 離れすぎたら即座に瞬身で追跡
          if (this.chaseMult(game) > 1 && this.teleporting <= 0) { this.teleporting = 0.6; this.teleDone = false; this.teleT = 6; }
        }
        const bs = 1 + this.level * 0.12;
        // 鏡からの扇状弾
        this.fanT -= dt;
        if (this.fanT <= 0) {
          this.fanT = 3.4 - Math.min(1.2, this.level * 0.25);
          for (const c of this.cores) {
            if (c.broken || !c.mirror) continue;
            const a = Math.atan2(pl.y - c.y, pl.x - c.x);
            for (let k = -1; k <= 1; k++) game.spawnBullet(c.x, c.y, Math.cos(a + k * 0.22) * 180 * bs, Math.sin(a + k * 0.22) * 180 * bs);
          }
        }
        // 攻撃①（大技詠唱）：敵版・次元斬予兆ライン3本→1.2秒後に空間ごと斬り裂く
        this.riftT -= dt;
        if (this.riftT <= 0 && !this.chant) {
          this.riftT = 8 - Math.min(3, this.level * 0.6);
          this.chant = { name: '次元喰らい・三界断', t: 0, dur: 1.2 };
          const L = Math.hypot(game.view.hw, game.view.hh) * 2;
          for (let i = 0; i < 3; i++) {
            const a = U.rand(0, Math.PI);
            const ox = pl.x + U.rand(-90, 90) * (i === 0 ? 0 : 1), oy = pl.y + U.rand(-90, 90) * (i === 0 ? 0 : 1);
            this.telegraphs.push({
              type: 'line', chant: true, onEnd: 'saintRift',
              x1: ox - Math.cos(a) * L, y1: oy - Math.sin(a) * L, x2: ox + Math.cos(a) * L, y2: oy + Math.sin(a) * L,
              w: 34, t: 0, dur: 1.2
            });
          }
        }
        if (this.chant) {
          this.chant.t += dt;
          if (this.chant.t >= this.chant.dur) {
            this.chant = null;
            for (const tg of this.telegraphs) {
              if (tg.onEnd === 'saintRift' && !tg.done) { tg.done = true; game.bossRiftCut(tg.x1, tg.y1, tg.x2, tg.y2); }
            }
          }
        }
        // 攻撃②：分身4体の一斉居合構え
        this.cloneT -= dt;
        if (this.cloneT <= 0 && !this.chant) {
          this.cloneT = 13 - Math.min(4, this.level * 0.8);
          this.clones = [];
          const base = Math.random() * TAU;
          for (let i = 0; i < 4; i++) {
            const a = base + (i / 4) * TAU;
            const x = pl.x + Math.cos(a) * 210, y = pl.y + Math.sin(a) * 210;
            const cl = new SaintClone(x, y, { tx: pl.x, ty: pl.y, boss: this });
            this.clones.push(cl);
            game.enemies.push(cl);
          }
          this.cloneWave = (this.cloneWave || 0) + 1;
        }
      }
      for (const c of this.cores) {
        if (c.body) { c.x = this.x; c.y = this.y - 4; continue; }
        const a = this.mirrorRot + (c.index / 5) * TAU;
        c.x = this.x + Math.cos(a) * this.orbit;
        c.y = this.y + Math.sin(a) * this.orbit;
      }
      this.clones = this.clones.filter((c) => !c.dead);
    }
    get lockable() { return !this.dead && !this.entering && !this.executing && this.fade > 0.4; }
    drawBody(ctx, pal) {
      drawSaintFigure(ctx, pal, this.r, this.t, this.aimAng, 1, 1);
    }
    draw(ctx, pal, game) {
      // 鏡
      for (const c of this.cores) {
        if (c.body) continue;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(this.mirrorRot * 2 + c.index);
        ctx.globalAlpha = c.broken ? 0.25 : 1;
        polygon(ctx, 6, 18, 0);
        ctx.fillStyle = col(pal, '#0E1220');
        ctx.fill();
        ctx.strokeStyle = col(pal, '#E6ECFA');
        ctx.lineWidth = 2;
        ctx.stroke();
        if (!pal.inv) {
          ctx.fillStyle = 'rgba(230,236,250,0.25)';
          ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(4, -12); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = this.fade;
      if (this.executing) { ctx.translate(0, 10); ctx.scale(1, 0.8); }
      if (!pal.inv) {
        ctx.fillStyle = `rgba(230,236,250,${0.08 + (this.chant ? 0.15 : 0)})`;
        ctx.beginPath(); ctx.arc(0, 0, this.r * 2, 0, TAU); ctx.fill();
      }
      this.drawBody(ctx, pal);
      if (this.hitFlash > 0 && !pal.inv) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
      for (const c of this.cores) c.draw(ctx, pal, game);
      this.drawChantBar(ctx, pal);
      this.drawDownMark(ctx, pal, game);
    }
  }

  const BOSS_CLASSES = { centipede: BossCentipede, general: BossSixArmGeneral, saint: BossSwordSaint };
  const ENEMY_CLASSES = {
    spider: SwarmSpider, ashigaru: SniperAshigaru, ninja: SplitterNinja, ninjaMini: SplitterNinja,
    lantern: BombLantern, oni: ArmoredOni, ronin: BerserkRonin
  };
  const GIMMICK_CLASSES = { barrel: PowderBarrel, thunder: ThunderLantern, crystal: VoidCrystal };

  ZI.Entities = {
    Player, Enemy, SwarmSpider, SniperAshigaru, SplitterNinja, BombLantern, ArmoredOni, BerserkRonin, SaintClone,
    Gimmick, PowderBarrel, ThunderLantern, VoidCrystal,
    EnemyBullet, CrescentWave, AfterimageSlash, SoulGem, MiniBlackHole, Scroll, Formation, spawnFormation,
    WeakCore, Boss, BossCentipede, BossSixArmGeneral, BossSwordSaint,
    BOSS_CLASSES, ENEMY_CLASSES, GIMMICK_CLASSES
  };
})();
