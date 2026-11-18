/* ==========================================================================
 * CHAIN SLASH : 絶・一閃 (ZETSU-ISSEN)
 * [5] js/effects.js — 水墨デカール・一刀両断の断面分解（Bisection）・
 *                     次元斬空間ズレ・12層Canvasレンダラー
 * 公開: window.ZetsuIssen.Effects
 * ========================================================================== */
(function () {
  'use strict';
  const ZI = (window.ZetsuIssen = window.ZetsuIssen || {});
  const CFG = ZI.Config;
  const C = CFG.COLORS;
  const P = CFG.PARAMS;
  const U = ZI.Util;
  const TAU = U.TAU;

  /* ------------------------------------------------------------------------
   * プリレンダー：墨飛沫スプライト
   * ---------------------------------------------------------------------- */
  const SPLATS = [];
  function buildSplats() {
    const kinds = [
      { col: [18, 22, 32], a: 0.75 },  // 血墨
      { col: [32, 12, 10], a: 0.7 }    // 焦げ跡
    ];
    kinds.forEach((k, ki) => {
      SPLATS[ki] = [];
      for (let v = 0; v < 4; v++) {
        const s = 96;
        const cv = document.createElement('canvas');
        cv.width = cv.height = s;
        const g = cv.getContext('2d');
        const cx = s / 2, cy = s / 2;
        g.fillStyle = `rgba(${k.col[0]},${k.col[1]},${k.col[2]},${k.a})`;
        // 主塊：不定形
        g.beginPath();
        const lobes = 9 + v * 2;
        for (let i = 0; i <= lobes; i++) {
          const a = (i / lobes) * TAU;
          const r = 16 + Math.random() * 12;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (i === 0) g.moveTo(x, y); else g.quadraticCurveTo(cx + Math.cos(a - 0.3) * (r + 8), cy + Math.sin(a - 0.3) * (r + 8), x, y);
        }
        g.fill();
        // 飛沫
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * TAU;
          const d = 24 + Math.random() * 20;
          const r = 1 + Math.random() * 4;
          g.beginPath();
          g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, TAU);
          g.fill();
        }
        // 筆の擦れ（放射状ストローク）
        g.strokeStyle = g.fillStyle;
        g.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * TAU;
          g.lineWidth = 1.5 + Math.random() * 3;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
          g.lineTo(cx + Math.cos(a) * (34 + Math.random() * 12), cy + Math.sin(a) * (34 + Math.random() * 12));
          g.stroke();
        }
        SPLATS[ki].push(cv);
      }
    });
  }

  /* ------------------------------------------------------------------------
   * InkDecal：床面の水墨飛沫（最大10秒でフェード）
   * ---------------------------------------------------------------------- */
  class InkDecal {
    constructor(x, y, size, kind, gold) {
      this.x = x; this.y = y;
      this.size = size;
      this.kind = kind === 'scorch' ? 1 : 0;
      // Rank S以上：金箔粒子が混じる
      this.gold = gold ? Array.from({ length: 9 }, () => [U.rand(-1, 1) * size * 0.9, U.rand(-1, 1) * size * 0.9, U.rand(1, 2.8), Math.random() * TAU]) : null;
      this.variant = (Math.random() * 4) | 0;
      this.rot = Math.random() * TAU;
      this.life = P.DECAL_LIFE;
      this.max = P.DECAL_LIFE;
      this.dead = false;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx, pal) {
      const a = Math.min(1, this.life / this.max * 1.6) * (pal.inv ? 1.1 : 1);
      if (a <= 0.01) return;
      const img = SPLATS[this.kind][this.variant];
      const s = this.size / 48;
      ctx.save();
      ctx.globalAlpha = Math.min(1, a);
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.scale(s, s);
      ctx.drawImage(img, -48, -48);
      ctx.restore();
      if (this.gold && !pal.inv) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, a) * 0.9;
        ctx.fillStyle = C.gold;
        for (const g of this.gold) {
          ctx.save();
          ctx.translate(this.x + g[0], this.y + g[1]);
          ctx.rotate(g[3]);
          ctx.fillRect(-g[2], -g[2] * 0.6, g[2] * 2, g[2] * 1.2);
          ctx.restore();
        }
        ctx.restore();
      }
    }
  }

  /* ------------------------------------------------------------------------
   * SlicedHalf：一刀両断の断面パーツ（0.45秒で垂直方向へズレて消滅）
   * ---------------------------------------------------------------------- */
  class SlicedHalf {
    constructor(ref, x, y, angle, side, color) {
      this.ref = ref;            // drawBody(ctx, pal) を持つエンティティ
      this.x = x; this.y = y;
      this.angle = angle;
      this.side = side;
      this.color = color || C.bladeWhite;
      this.t = 0;
      this.dur = P.BISECT_TIME;
      this.spin = U.rand(0.15, 0.45);
      this.drift = U.rand(18, 30);
      this.dead = false;
    }
    update(dt) {
      this.t += dt;
      if (this.t >= this.dur) this.dead = true;
    }
    draw(ctx, pal) {
      const p = Math.min(1, this.t / this.dur);
      const e = U.easeOutCubic(p);
      const off = 3 + e * this.drift;
      const nx = -Math.sin(this.angle) * this.side;
      const ny = Math.cos(this.angle) * this.side;
      ctx.save();
      ctx.globalAlpha = 1 - p * p;
      ctx.translate(this.x + nx * off, this.y + ny * off);
      ctx.rotate(this.angle);
      ctx.beginPath();
      if (this.side > 0) ctx.rect(-260, 0, 520, 260); else ctx.rect(-260, -260, 520, 260);
      ctx.clip();
      ctx.rotate(this.spin * e * this.side - this.angle);
      if (this.ref && this.ref.drawBody) this.ref.drawBody(ctx, pal, true);
      ctx.restore();
      // 断面の閃光線
      if (p < 0.5) {
        const a = 1 - p / 0.5;
        const L = (this.ref && this.ref.r ? this.ref.r : 16) * 1.5;
        const cx = Math.cos(this.angle), cy = Math.sin(this.angle);
        ctx.save();
        ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
        ctx.strokeStyle = pal.inv ? U.rgba(C.crimson, a) : `rgba(255,255,255,${a})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(this.x + nx * off - cx * L, this.y + ny * off - cy * L);
        ctx.lineTo(this.x + nx * off + cx * L, this.y + ny * off + cy * L);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ------------------------------------------------------------------------
   * VoidRift：次元斬『空間の裂け目』（ロジックは main.js の Game が処理）
   * ---------------------------------------------------------------------- */
  class VoidRift {
    constructor(x1, y1, x2, y2, dur, opts) {
      opts = opts || {};
      this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
      this.len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
      this.angle = Math.atan2(y2 - y1, x2 - x1);
      this.dur = dur;
      this.t = 0;
      this.tick = 0;
      this.width = opts.width || P.VOID_WIDTH;
      this.edge = opts.edge || C.voidEdge;
      this.thick = !!opts.thick;
      this.mini = !!opts.mini;
      this.pull = !!opts.pull;
      this.dmgMult = opts.dmgMult || 1;
      this.closeMult = opts.closeMult == null ? 1 : opts.closeMult;
      this.noShift = !!opts.noShift;
      this.closed = false;
      this.dead = false;
      this.jagT = 0;
      this._jag();
    }
    _jag() {
      const n = Math.max(3, Math.min(48, Math.floor(this.len / 16)));
      if (!this.jag || this.jag.length !== n + 1) this.jag = new Float32Array(n + 1);
      for (let i = 0; i <= n; i++) {
        this.jag[i] = (i === 0 || i === n) ? 0 : (Math.random() * 2 - 1) * this.width * 0.55;
      }
    }
    update(dt) {
      this.t += dt;
      this.jagT += dt;
      if (this.jagT > 0.05) { this.jagT = 0; this._jag(); }
    }
    get progress() { return this.t / this.dur; }
    draw(ctx, pal) {
      const grow = Math.min(1, this.t / 0.08);
      const remain = this.dur - this.t;
      const closing = remain < 0.15 ? Math.max(0, remain / 0.15) : 1;
      const w = this.width * (this.thick ? 1.8 : this.mini ? 0.6 : 1) * (remain < 0.15 ? 0.4 + closing * 0.9 : 1);
      const dx = (this.x2 - this.x1) * grow, dy = (this.y2 - this.y1) * grow;
      const nx = -Math.sin(this.angle), ny = Math.cos(this.angle);
      const n = this.jag.length - 1;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const o = this.jag[i] * (w / this.width);
        pts.push(this.x1 + dx * t + nx * o, this.y1 + dy * t + ny * o);
      }
      const stroke = (lw, style) => {
        ctx.lineWidth = lw;
        ctx.strokeStyle = style;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
      };
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'miter';
      // 虚空の黒い裂け目
      stroke(w * 1.2, pal.inv ? 'rgba(9,10,15,0.9)' : 'rgba(0,0,0,0.85)');
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      const edge = pal.inv ? C.crimson : this.edge;
      stroke(w * 3.2, U.rgba(pal.inv ? C.crimson : (edge === C.cyan ? C.crimson : C.cyan), 0.1 * closing));
      stroke(w * 2.4, U.rgba(edge, 0.18 * closing));
      stroke(w * 0.9, U.rgba(edge, 0.85));
      stroke(Math.max(1.5, w * 0.32), pal.inv ? C.ink : C.voidCore);
      // 端の火花
      if (!this.mini) {
        ctx.fillStyle = pal.inv ? C.crimson : '#fff';
        const ex = this.x1 + dx, ey = this.y1 + dy;
        ctx.beginPath(); ctx.arc(ex, ey, 2.5 + Math.random() * 2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(this.x1, this.y1, 2 + Math.random() * 2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------------
   * SlashTrail：斬撃リボン軌跡（加算合成・テーパー付き）
   * ---------------------------------------------------------------------- */
  class SlashTrail {
    constructor(x1, y1, x2, y2, opts) {
      opts = opts || {};
      this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
      this.width = opts.width || 10;
      this.color = opts.color || C.cyan;
      this.core = opts.core || C.bladeWhite;
      this.life = opts.life || 0.22;
      this.max = this.life;
      this.curve = opts.curve == null ? U.rand(-0.18, 0.18) : opts.curve;
      this.glow = opts.glow || 1;      // 1:通常 2:覚醒ブルーム 3:鬼神焼き付き
      this.dead = false;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    /** Phase3：黄金 → 深紅 → シアンへ色変化 */
    _shiftColor(p) {
      const stops = [C.gold, C.crimson, C.cyan];
      const f = Math.min(1.999, p * 2);
      const i = Math.floor(f), k = f - i;
      const a = U.hexToRgb(stops[i]), b = U.hexToRgb(stops[i + 1]);
      return '#' + [a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k].map((v) => ('0' + Math.round(v).toString(16)).slice(-2)).join('');
    }
    draw(ctx, pal) {
      const a0 = Math.max(0, this.life / this.max);
      // 残光は長く尾を引くよう緩やかにフェード
      const a = this.glow >= 2 ? Math.pow(a0, 0.6) : a0;
      const dx = this.x2 - this.x1, dy = this.y2 - this.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const mx = (this.x1 + this.x2) / 2 + nx * len * this.curve;
      const my = (this.y1 + this.y2) / 2 + ny * len * this.curve;
      const w = this.width * (0.35 + a * 0.65);
      const col = pal.inv ? C.crimson : (this.glow === 3 ? this._shiftColor(1 - a0) : this.color);
      // テーパーポリゴン（始点細・中央太・終点細）
      const ribbon = (ww, style) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.quadraticCurveTo(mx + nx * ww, my + ny * ww, this.x2, this.y2);
        ctx.quadraticCurveTo(mx - nx * ww * 0.35, my - ny * ww * 0.35, this.x1, this.y1);
        ctx.fill();
      };
      ctx.save();
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      if (this.glow >= 2 && !pal.inv) {
        // ブルーム層3重描画
        ribbon(w * 4.2, U.rgba(col, 0.06 * a));
        ribbon(w * 2.8, U.rgba(col, 0.12 * a));
      }
      ribbon(w * 1.8, U.rgba(col, 0.22 * a));
      ribbon(w, U.rgba(col, 0.75 * a));
      ribbon(w * 0.38, pal.inv ? U.rgba(C.ink, a) : U.rgba(this.core, a));
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------------
   * CorpseShard：死体ボウリング連鎖の「吹っ飛び肉弾」（断面パーツ）
   * 斬撃方向の左右斜め前方へ秒速680pxで射出。衝突判定は main.js。
   * ---------------------------------------------------------------------- */
  class CorpseShard {
    constructor(ref, x, y, slashAngle, side, gen) {
      this.ref = ref;
      this.x = x; this.y = y;
      this.slashAngle = slashAngle;
      this.side = side;
      const dir = slashAngle + side * U.rand(0.35, 0.65);
      this.vx = Math.cos(dir) * P.CORPSE_SPEED;
      this.vy = Math.sin(dir) * P.CORPSE_SPEED;
      this.r = Math.max(8, (ref && ref.r ? ref.r : 14) * 0.75);
      this.rot = 0;
      this.vr = side * U.rand(8, 16);
      this.life = P.CORPSE_LIFE;
      this.max = P.CORPSE_LIFE;
      this.gen = gen || 0;          // 連鎖世代
      this.dead = false;
      this.hit = null;              // 最初に当たった敵（断面の持ち主は除外）
      this.tx = x; this.ty = y;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      const d = Math.exp(-1.2 * dt);
      this.vx *= d; this.vy *= d;
      this.tx = this.x; this.ty = this.y;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.rot += this.vr * dt;
    }
    draw(ctx, pal) {
      const a = Math.min(1, this.life / this.max * 2);
      // 墨の尾
      ctx.save();
      ctx.strokeStyle = pal.inv ? `rgba(9,10,15,${0.5 * a})` : `rgba(255,30,66,${0.35 * a})`;
      ctx.lineWidth = this.r * 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.slashAngle + this.rot);
      ctx.beginPath();
      if (this.side > 0) ctx.rect(-200, 0, 400, 200); else ctx.rect(-200, -200, 400, 200);
      ctx.clip();
      ctx.rotate(-this.slashAngle);
      if (this.ref && this.ref.drawBody) this.ref.drawBody(ctx, pal, true);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------------
   * SparkParticle：火花・墨粒・破片・火の粉
   * kind: 0=spark(線) 1=dot 2=ink 3=shard 4=gem-spark
   * ---------------------------------------------------------------------- */
  class SparkParticle {
    constructor() { this.dead = true; }
    reset(x, y, vx, vy, life, size, color, kind, drag) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.life = life; this.max = life;
      this.size = size; this.color = color;
      this.kind = kind || 0;
      this.drag = drag == null ? 3.5 : drag;
      this.rot = Math.random() * TAU;
      this.vr = U.rand(-12, 12);
      this.dead = false;
      return this;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      const d = Math.exp(-this.drag * dt);
      this.vx *= d; this.vy *= d;
      if (this.kind === 3) this.vy += 520 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.rot += this.vr * dt;
    }
  }

  /* Shockwave：衝撃波リング */
  class Shockwave {
    constructor(x, y, r0, r1, life, color, width) {
      this.x = x; this.y = y; this.r0 = r0; this.r1 = r1;
      this.life = life; this.max = life;
      this.color = color; this.width = width || 6;
      this.dead = false;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx, pal) {
      const p = 1 - this.life / this.max;
      const r = U.lerp(this.r0, this.r1, U.easeOutCubic(p));
      const a = 1 - p;
      const col = pal.inv ? C.crimson : this.color;
      ctx.strokeStyle = U.rgba(col, 0.25 * a);
      ctx.lineWidth = this.width * 2.6 * a + 1;
      ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = U.rgba(col, 0.9 * a);
      ctx.lineWidth = this.width * a + 0.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, TAU); ctx.stroke();
    }
  }

  /* LightningBolt：雷撃 */
  class LightningBolt {
    constructor(x1, y1, x2, y2, color, life, width) {
      this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
      this.color = color || C.shiden;
      this.life = life || 0.2; this.max = this.life;
      this.width = width || 2.5;
      this.dead = false;
      this.t = 0;
      this._gen();
    }
    _gen() {
      const len = Math.hypot(this.x2 - this.x1, this.y2 - this.y1);
      const n = Math.max(3, Math.min(14, Math.floor(len / 22)));
      const nx = -(this.y2 - this.y1) / (len || 1), ny = (this.x2 - this.x1) / (len || 1);
      this.pts = [this.x1, this.y1];
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const o = (Math.random() * 2 - 1) * Math.min(26, len * 0.12);
        this.pts.push(U.lerp(this.x1, this.x2, t) + nx * o, U.lerp(this.y1, this.y2, t) + ny * o);
      }
      this.pts.push(this.x2, this.y2);
    }
    update(dt) {
      this.life -= dt; this.t += dt;
      if (this.t > 0.04) { this.t = 0; this._gen(); }
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx, pal) {
      const a = this.life / this.max;
      const col = pal.inv ? C.crimson : this.color;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(this.pts[0], this.pts[1]);
        for (let i = 2; i < this.pts.length; i += 2) ctx.lineTo(this.pts[i], this.pts[i + 1]);
        ctx.stroke();
      };
      ctx.strokeStyle = U.rgba(col, 0.3 * a); ctx.lineWidth = this.width * 4; path();
      ctx.strokeStyle = U.rgba(col, 0.95 * a); ctx.lineWidth = this.width; path();
      ctx.strokeStyle = pal.inv ? U.rgba(C.ink, a) : `rgba(255,255,255,${a})`; ctx.lineWidth = this.width * 0.4; path();
    }
  }

  /* Beam：建御雷の雷柱／処刑の黄金一閃など */
  class Beam {
    constructor(x, y, width, life, color, vertical) {
      this.x = x; this.y = y; this.width = width; this.life = life; this.max = life;
      this.color = color; this.vertical = vertical !== false;
      this.angle = 0; this.len = 2000;
      this.dead = false;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx, pal) {
      const a = this.life / this.max;
      const col = pal.inv ? C.crimson : this.color;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.vertical ? 0 : this.angle);
      const w = this.width * (0.4 + a * 0.6);
      if (this.vertical) {
        const g = ctx.createLinearGradient(-w, 0, w, 0);
        g.addColorStop(0, U.rgba(col, 0));
        g.addColorStop(0.5, U.rgba(col, 0.9 * a));
        g.addColorStop(1, U.rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-w, -1200, w * 2, 1200);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(-w * 0.18, -1200, w * 0.36, 1200);
      } else {
        const g = ctx.createLinearGradient(0, -w, 0, w);
        g.addColorStop(0, U.rgba(col, 0));
        g.addColorStop(0.5, U.rgba(col, 0.95 * a));
        g.addColorStop(1, U.rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-this.len, -w, this.len * 2, w * 2);
        ctx.fillStyle = pal.inv ? U.rgba(C.ink, a) : `rgba(255,255,255,${a})`;
        ctx.fillRect(-this.len, -w * 0.16, this.len * 2, w * 0.32);
      }
      ctx.restore();
    }
  }

  /* FloatingText：ダメージ数値・漢字コールアウト */
  class FloatingText {
    constructor() { this.dead = true; }
    reset(x, y, text, color, size, kind, life) {
      this.x = x; this.y = y; this.text = text; this.color = color;
      this.size = size; this.kind = kind || 'dmg';
      this.life = life || (this.kind === 'callout' ? 1.15 : this.kind === 'info' ? 1.2 : 0.6);
      this.max = this.life;
      this.vy = this.kind === 'dmg' ? -70 : this.kind === 'callout' ? -18 : -40;
      this.vx = this.kind === 'dmg' ? U.rand(-20, 20) : 0;
      this.dead = false;
      return this;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vy *= Math.exp(-2.5 * dt);
    }
  }

  /* ScreenCrack：画面割れ（パリン） */
  class ScreenCrack {
    constructor(x, y, life) {
      this.x = x; this.y = y; this.life = life; this.max = life; this.dead = false;
      this.lines = [];
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + U.rand(-0.15, 0.15);
        const pts = [x, y];
        let px = x, py = y, aa = a;
        const segs = U.randInt(4, 8);
        for (let s = 0; s < segs; s++) {
          aa += U.rand(-0.35, 0.35);
          const d = U.rand(50, 160);
          px += Math.cos(aa) * d; py += Math.sin(aa) * d;
          pts.push(px, py);
        }
        this.lines.push(pts);
      }
      // 同心の割れ環
      this.rings = [U.rand(60, 90), U.rand(160, 220), U.rand(300, 380)];
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx, inv) {
      const a = Math.min(1, this.life / this.max * 1.4);
      ctx.save();
      ctx.lineJoin = 'miter';
      ctx.strokeStyle = inv ? `rgba(9,10,15,${a})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = 2;
      for (const pts of this.lines) {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
      }
      ctx.lineWidth = 1.2;
      for (const r of this.rings) {
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const ang = (i / 14) * TAU;
          const rr = r + Math.sin(i * 7.3) * 14;
          const x = this.x + Math.cos(ang) * rr, y = this.y + Math.sin(ang) * rr;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* BlueFlameLine：縮地の蒼炎残像ライン（3秒） */
  class FlameLine {
    constructor(x1, y1, x2, y2, life) {
      this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
      this.life = life; this.max = life; this.tick = 0; this.dead = false;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx, pal, time) {
      const a = Math.min(1, this.life / this.max * 2);
      const col = pal.inv ? C.crimson : '#3AA8FF';
      ctx.lineCap = 'round';
      const flick = 0.75 + Math.sin(time * 30 + this.x1) * 0.25;
      ctx.strokeStyle = U.rgba(col, 0.22 * a * flick); ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(this.x1, this.y1); ctx.lineTo(this.x2, this.y2); ctx.stroke();
      ctx.strokeStyle = U.rgba(C.cyan, 0.7 * a); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(this.x1, this.y1); ctx.lineTo(this.x2, this.y2); ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------------
   * EffectManager：全エフェクトの更新と上限キャップ管理
   * ---------------------------------------------------------------------- */
  class EffectManager {
    constructor() {
      this.decals = [];
      this.halves = [];
      this.rifts = [];
      this.trails = [];
      this.rings = [];
      this.bolts = [];
      this.beams = [];
      this.flames = [];
      this.cracks = [];
      this.corpses = [];
      this.phase = 1;      // 現在のトランスフェーズ（残光の長さに使用）
      this.goldLeaf = false;
      // 固定長プール（パーティクル800／テキスト80）
      this.particlePool = [];
      for (let i = 0; i < P.PARTICLE_MAX; i++) this.particlePool.push(new SparkParticle());
      this.particles = [];
      this.textPool = [];
      for (let i = 0; i < P.TEXT_MAX; i++) this.textPool.push(new FloatingText());
      this.texts = [];
      this.lastCalloutT = 0;
      this.splatsReady = false;
    }

    ensureAssets() {
      if (!this.splatsReady) { buildSplats(); this.splatsReady = true; }
    }

    clear() {
      this.decals.length = 0; this.halves.length = 0; this.rifts.length = 0; this.trails.length = 0;
      this.rings.length = 0; this.bolts.length = 0; this.beams.length = 0; this.flames.length = 0; this.cracks.length = 0;
      this.corpses.length = 0;
      for (const p of this.particles) { p.dead = true; this.particlePool.push(p); }
      this.particles.length = 0;
      for (const t of this.texts) { t.dead = true; this.textPool.push(t); }
      this.texts.length = 0;
    }

    /* --- 生成 API --- */
    decal(x, y, size, kind) {
      if (this.decals.length >= P.DECAL_MAX) this.decals.shift();
      this.decals.push(new InkDecal(x, y, size, kind, this.goldLeaf && kind !== 'scorch'));
    }
    corpse(ref, x, y, slashAngle, gen) {
      if (this.corpses.length >= P.CORPSE_MAX - 1) return false;
      this.corpses.push(new CorpseShard(ref, x, y, slashAngle, 1, gen));
      this.corpses.push(new CorpseShard(ref, x, y, slashAngle, -1, gen));
      return true;
    }
    bisect(ref, x, y, angle, color) {
      if (this.halves.length >= P.SLICED_MAX) this.halves.splice(0, 2);
      this.halves.push(new SlicedHalf(ref, x, y, angle, 1, color));
      this.halves.push(new SlicedHalf(ref, x, y, angle, -1, color));
    }
    rift(x1, y1, x2, y2, dur, opts) {
      if (this.rifts.length >= P.VOID_MAX) {
        // 最古の裂け目を即閉鎖させず削除（上限管理）
        this.rifts.shift();
      }
      const r = new VoidRift(x1, y1, x2, y2, dur, opts);
      this.rifts.push(r);
      return r;
    }
    /** opts.slash=true のプレイヤー斬撃はトランスフェーズで残光時間が伸びる（0.25／0.65／1.2秒） */
    trail(x1, y1, x2, y2, opts) {
      opts = opts || {};
      if (opts.slash) {
        opts.life = P.TRAIL_LIFE[this.phase - 1];
        opts.glow = this.phase;
      }
      if (this.trails.length > 220) this.trails.shift();
      this.trails.push(new SlashTrail(x1, y1, x2, y2, opts));
    }
    ring(x, y, r0, r1, life, color, width) {
      if (this.rings.length > 90) this.rings.shift();
      this.rings.push(new Shockwave(x, y, r0, r1, life, color, width));
    }
    bolt(x1, y1, x2, y2, color, life, width) {
      if (this.bolts.length > 90) this.bolts.shift();
      this.bolts.push(new LightningBolt(x1, y1, x2, y2, color, life, width));
    }
    beam(x, y, width, life, color, vertical, angle) {
      if (this.beams.length > 60) this.beams.shift();
      const b = new Beam(x, y, width, life, color, vertical);
      if (angle != null) b.angle = angle;
      this.beams.push(b);
      return b;
    }
    flame(x1, y1, x2, y2, life) {
      if (this.flames.length > 120) this.flames.shift();
      const f = new FlameLine(x1, y1, x2, y2, life);
      this.flames.push(f);
      return f;
    }
    crack(x, y, life) {
      this.cracks.push(new ScreenCrack(x, y, life));
    }
    particle(x, y, vx, vy, life, size, color, kind, drag) {
      let p = this.particlePool.pop();
      if (!p) {
        // 上限到達：最古のパーティクルを再利用
        p = this.particles.shift();
        if (!p) return null;
      }
      p.reset(x, y, vx, vy, life, size, color, kind, drag);
      this.particles.push(p);
      return p;
    }
    sparks(x, y, n, color, speed, life, kind) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = speed * U.rand(0.35, 1);
        this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * U.rand(0.6, 1), U.rand(1.2, 2.6), color, kind == null ? 0 : kind);
      }
    }
    sparksDir(x, y, n, color, angle, spread, speed, life) {
      for (let i = 0; i < n; i++) {
        const a = angle + U.rand(-spread, spread);
        const s = speed * U.rand(0.4, 1);
        this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * U.rand(0.6, 1), U.rand(1.2, 2.4), color, 0);
      }
    }
    inkBurst(x, y, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = speed * U.rand(0.2, 1);
        this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(0.35, 0.8), U.rand(2, 5), '#121620', 2, 4);
      }
    }
    text(x, y, text, color, size, kind, life) {
      let t = this.textPool.pop();
      if (!t) {
        t = this.texts.shift();
        if (!t) return null;
      }
      t.reset(x, y, text, color, size, kind, life);
      this.texts.push(t);
      return t;
    }
    callout(x, y, text, color, size, now) {
      // 同時多発時は少しずらして重なりを回避
      const dy = (now - this.lastCalloutT < 0.4) ? -46 : 0;
      this.lastCalloutT = now;
      return this.text(x, y + dy, text, color, size || 50, 'callout');
    }

    update(dtFx, dtReal) {
      const upd = (arr, dt) => {
        for (let i = 0; i < arr.length; i++) arr[i].update(dt);
      };
      upd(this.decals, dtFx);
      upd(this.halves, dtFx);
      upd(this.trails, dtReal);
      upd(this.rings, dtFx);
      upd(this.bolts, dtReal);
      upd(this.beams, dtReal);
      upd(this.flames, dtFx);
      upd(this.cracks, dtReal);
      upd(this.corpses, dtFx);
      U.compact(this.decals, (o) => !o.dead);
      U.compact(this.halves, (o) => !o.dead);
      U.compact(this.trails, (o) => !o.dead);
      U.compact(this.rings, (o) => !o.dead);
      U.compact(this.bolts, (o) => !o.dead);
      U.compact(this.beams, (o) => !o.dead);
      U.compact(this.flames, (o) => !o.dead);
      U.compact(this.cracks, (o) => !o.dead);
      U.compact(this.corpses, (o) => !o.dead);
      // プール型（インプレース削除＋プール返却）
      const ps = this.particles;
      let w = 0;
      for (let r = 0; r < ps.length; r++) {
        const p = ps[r];
        p.update(dtFx);
        if (p.dead) this.particlePool.push(p); else ps[w++] = p;
      }
      ps.length = w;
      const ts = this.texts;
      w = 0;
      for (let r = 0; r < ts.length; r++) {
        const t = ts[r];
        t.update(dtReal);
        if (t.dead) this.textPool.push(t); else ts[w++] = t;
      }
      ts.length = w;
    }
  }

  /* ------------------------------------------------------------------------
   * Renderer：12層 Canvas レンダラー
   * ---------------------------------------------------------------------- */
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.buffer = document.createElement('canvas');
      this.bctx = this.buffer.getContext('2d');
      this.bgCache = document.createElement('canvas');
      this.bgCtx = this.bgCache.getContext('2d');
      this.vignette = document.createElement('canvas');
      this.dpr = 1;
      this.w = 0; this.h = 0;
      this.theme = null;
      this.splits = [];
      this.flash = 0;
      this.flashColor = '#ffffff';
      this.embers = [];
      this.stars = [];
      this.bamboo = [];
      for (let i = 0; i < 70; i++) this.embers.push({ x: Math.random(), y: Math.random(), s: U.rand(0.5, 2), v: U.rand(12, 40), p: Math.random() * TAU });
      // v2 画面トランス
      this.beat = 0;                 // BGMキック同期の脈動（1→0）
      this.patT = 0;                 // 紋様のアニメ時間（覚醒以降2.5倍速）
      this.mix2 = 0; this.mix3 = 0;  // 背景ベース色の覚醒・鬼神ブレンド
      this.ambient = [];
      for (let i = 0; i < 90; i++) this.ambient.push(this._newAmbient(true));
      this.arcs = [];                // 鬼神：空間を走る紫電アーク
      this.bgBolts = [];             // 鬼神：背景の黄金・深紅の稲妻＆空間亀裂
      this.arcT = 0;
      this.brushQueue = [];
      this.brush = null;             // 巨大毛筆背景カットイン
      this.ca = null;                // RGB色収差
      this.caR = document.createElement('canvas');
      this.caC = document.createElement('canvas');
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth, h = window.innerHeight;
      this.dpr = dpr; this.w = w; this.h = h;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.buffer.width = this.canvas.width;
      this.buffer.height = this.canvas.height;
      this.caR.width = this.caC.width = this.canvas.width;
      this.caR.height = this.caC.height = this.canvas.height;
      this._buildVignette();
      this.theme = null; // 背景キャッシュ再生成
    }

    _buildVignette() {
      const v = this.vignette;
      v.width = 512; v.height = 512;
      const g = v.getContext('2d');
      const grd = g.createRadialGradient(256, 256, 120, 256, 256, 360);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.6, 'rgba(2,3,5,0.35)');
      grd.addColorStop(1, 'rgba(2,3,5,0.95)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 512, 512);
      // 墨のにじみ（四隅）
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (let i = 0; i < 40; i++) {
        const corner = i % 4;
        const cx = corner % 2 === 0 ? 0 : 512, cy = corner < 2 ? 0 : 512;
        g.beginPath();
        g.arc(cx + U.rand(-60, 60), cy + U.rand(-60, 60), U.rand(30, 90), 0, TAU);
        g.fill();
      }
    }

    /* -------- Layer 1 背景キャッシュ -------- */
    _buildBg(theme) {
      const w = this.w, h = this.h, dpr = this.dpr;
      const cv = this.bgCache;
      cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
      const g = this.bgCtx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = C.bgInkDeep;
      g.fillRect(0, 0, w, h);
      if (theme === 'bamboo') {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#0A1224');
        grd.addColorStop(1, '#060810');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        // 石畳の格子紋様
        g.strokeStyle = 'rgba(120,160,220,0.06)';
        g.lineWidth = 1;
        const s = 56;
        for (let y = 0, row = 0; y < h + s; y += s * 0.6, row++) {
          const off = (row % 2) * s * 0.5;
          g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
          for (let x = -s + off; x < w + s; x += s) {
            g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s * 0.6); g.stroke();
          }
        }
        // 遠景の霧
        for (let i = 0; i < 8; i++) {
          const fg = g.createRadialGradient(U.rand(0, w), U.rand(0, h), 0, U.rand(0, w), U.rand(0, h), U.rand(200, 420));
          fg.addColorStop(0, 'rgba(40,70,120,0.07)');
          fg.addColorStop(1, 'rgba(40,70,120,0)');
          g.fillStyle = fg; g.fillRect(0, 0, w, h);
        }
        this.bamboo = [];
        const n = Math.max(10, Math.floor(w / 70));
        for (let i = 0; i < n; i++) {
          const edge = Math.random() < 0.75;
          const x = edge ? (Math.random() < 0.5 ? U.rand(-20, w * 0.22) : U.rand(w * 0.78, w + 20)) : U.rand(0, w);
          this.bamboo.push({ x, w: U.rand(5, 12), depth: edge ? U.rand(0.5, 1) : U.rand(0.15, 0.35), ph: Math.random() * TAU, joint: U.rand(70, 120) });
        }
      } else if (theme === 'castle') {
        const grd = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * 0.8);
        grd.addColorStop(0, '#1C0808');
        grd.addColorStop(1, '#070304');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        // 天守の瓦紋様
        g.strokeStyle = 'rgba(255,90,60,0.05)';
        for (let y = 20; y < h; y += 34) {
          g.beginPath();
          for (let x = 0; x <= w; x += 34) g.arc(x, y, 17, 0, Math.PI, false);
          g.stroke();
        }
      } else if (theme === 'void' || theme === 'endless') {
        const grd = g.createRadialGradient(w / 2, h * 0.45, 30, w / 2, h / 2, Math.max(w, h) * 0.8);
        grd.addColorStop(0, '#0E1220');
        grd.addColorStop(1, '#020306');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 240; i++) {
          g.fillStyle = `rgba(230,236,255,${U.rand(0.1, 0.7)})`;
          const s = Math.random() < 0.08 ? 1.8 : 1;
          g.fillRect(Math.random() * w, Math.random() * h, s, s);
        }
        if (theme === 'void') this._torii(g, w / 2, h * 0.78, Math.min(w, h) * 0.32);
      }
      this.theme = theme;
    }

    _torii(g, cx, by, s) {
      g.save();
      g.strokeStyle = 'rgba(200,210,235,0.10)';
      g.fillStyle = 'rgba(200,210,235,0.06)';
      g.lineWidth = 2;
      const pw = s * 0.07, ph = s * 0.9;
      // 柱
      g.fillRect(cx - s * 0.4 - pw / 2, by - ph, pw, ph);
      g.fillRect(cx + s * 0.4 - pw / 2, by - ph, pw, ph);
      g.strokeRect(cx - s * 0.4 - pw / 2, by - ph, pw, ph);
      g.strokeRect(cx + s * 0.4 - pw / 2, by - ph, pw, ph);
      // 笠木（反り）
      g.beginPath();
      g.moveTo(cx - s * 0.62, by - ph - s * 0.02);
      g.quadraticCurveTo(cx, by - ph + s * 0.08, cx + s * 0.62, by - ph - s * 0.02);
      g.lineTo(cx + s * 0.58, by - ph + s * 0.06);
      g.quadraticCurveTo(cx, by - ph + s * 0.15, cx - s * 0.58, by - ph + s * 0.06);
      g.closePath(); g.fill(); g.stroke();
      // 貫
      g.fillRect(cx - s * 0.5, by - ph * 0.75, s, s * 0.05);
      g.strokeRect(cx - s * 0.5, by - ph * 0.75, s, s * 0.05);
      g.restore();
    }

    _gear(ctx, x, y, r, teeth, rot, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.strokeStyle = U.rgba(color, alpha);
      ctx.lineWidth = 3;
      ctx.beginPath();
      const inner = r * 0.86;
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * TAU, a1 = ((i + 0.25) / teeth) * TAU, a2 = ((i + 0.5) / teeth) * TAU, a3 = ((i + 0.75) / teeth) * TAU;
        ctx.lineTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
        ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
        ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
        ctx.lineTo(Math.cos(a3) * inner, Math.sin(a3) * inner);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
        ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
        ctx.stroke();
      }
      ctx.restore();
    }

    _mandala(ctx, x, y, R, t, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        const r = R * (0.35 + k * 0.22);
        const n = 6 + k * 3;
        ctx.save();
        ctx.rotate(t * (k % 2 ? -0.06 : 0.08) * (1 + k * 0.3));
        ctx.strokeStyle = U.rgba(color, alpha * (1 - k * 0.15));
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU * 2;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 3 + k, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    /* -------- v2 トランス：アンビエント粒子 -------- */
    _newAmbient(scatter) {
      return { x: Math.random(), y: scatter ? Math.random() : 1.05, v: U.rand(0.4, 1), s: U.rand(0.6, 1.4), p: Math.random() * TAU, k: Math.random() };
    }

    /** フェーズ別の紋様パラメータ */
    _trance(game, pal) {
      const ph = game.trancePhase || 1;
      const theme = game.stage ? game.stage.theme : 'void';
      const base = {
        bamboo: [C.jade, C.cyan], castle: [C.gold, C.gold], void: ['#C8D2EB', '#C8D2EB'], endless: [null, null]
      }[theme] || [C.cyan, C.cyan];
      if (ph === 1) return { ph, alpha: 0.05, colA: base[0], colB: base[1], pulse: 1 };
      if (ph === 2) return { ph, alpha: 0.18, colA: C.cyan, colB: C.crimson, pulse: 1 };
      return { ph, alpha: 0.24, colA: C.gold, colB: C.crimson, pulse: 1 + 0.08 * this.beat };
    }

    _drawLayer1(ctx, game, pal) {
      const w = this.w, h = this.h;
      const dt = game.dtReal || 0.016;
      if (pal.inv) {
        ctx.fillStyle = C.paper;
        ctx.fillRect(-40, -40, w + 80, h + 80);
        // 和紙の繊維
        ctx.strokeStyle = 'rgba(9,10,15,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 30; i++) {
          const y = (i * 53.7) % h;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + Math.sin(i) * 20); ctx.stroke();
        }
        return;
      }
      const theme = game.stage ? game.stage.theme : 'void';
      if (this.theme !== theme) this._buildBg(theme);
      ctx.drawImage(this.bgCache, 0, 0, this.bgCache.width, this.bgCache.height, 0, 0, w, h);

      const tr = this._trance(game, pal);
      // 背景ベース色：通常墨黒 → 覚醒紅墨 → 鬼神黄金墨
      this.mix2 += ((tr.ph >= 2 ? 1 : 0) - this.mix2) * Math.min(1, dt * 3);
      this.mix3 += ((tr.ph >= 3 ? 1 : 0) - this.mix3) * Math.min(1, dt * 3);
      if (this.mix2 > 0.01) { ctx.fillStyle = U.rgba(C.bgInkAwaken, 0.62 * this.mix2); ctx.fillRect(-40, -40, w + 80, h + 80); }
      if (this.mix3 > 0.01) { ctx.fillStyle = U.rgba(C.bgInkKishin, 0.7 * this.mix3); ctx.fillRect(-40, -40, w + 80, h + 80); }
      // 紋様のアニメ速度（覚醒以降2.5倍）
      this.patT += dt * Math.max(0.1, game.worldScale == null ? 1 : Math.max(game.worldScale, 0.25)) * (tr.ph >= 2 ? 2.5 : 1);
      const t = this.patT;
      const k = tr.alpha / 0.18;     // 紋様の発光強度係数

      ctx.save();
      // 鬼神：バスドラムに合わせ紋様が 1.0 → 1.08 へ脈動
      if (tr.pulse !== 1) {
        ctx.translate(w / 2, h / 2); ctx.scale(tr.pulse, tr.pulse); ctx.translate(-w / 2, -h / 2);
      }
      if (theme === 'bamboo') {
        ctx.lineCap = 'round';
        for (const b of this.bamboo) {
          const sway = Math.sin(t * 0.9 + b.ph) * 16 * b.depth;
          const a = (0.1 + b.depth * 0.22) * k;
          ctx.strokeStyle = `rgba(10,30,26,${0.6 * b.depth + 0.2})`;
          ctx.lineWidth = b.w * b.depth + 2;
          ctx.beginPath(); ctx.moveTo(b.x, h + 10); ctx.quadraticCurveTo(b.x + sway * 0.3, h * 0.5, b.x + sway, -10); ctx.stroke();
          ctx.strokeStyle = U.rgba(tr.colA, Math.min(1, a * 0.9));
          ctx.lineWidth = tr.ph >= 2 ? 2 : 1.2;
          ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.4, h + 10); ctx.quadraticCurveTo(b.x + sway * 0.3 + b.w * 0.4, h * 0.5, b.x + sway + b.w * 0.4, -10); ctx.stroke();
          ctx.strokeStyle = U.rgba(tr.colB, Math.min(1, a));
          for (let y = h; y > 0; y -= b.joint) {
            const kk = 1 - y / h;
            const sx = b.x + sway * kk * kk + sway * 0.3 * (1 - kk) * kk * 2;
            ctx.beginPath(); ctx.moveTo(sx - b.w * 0.6, y); ctx.lineTo(sx + b.w * 0.6, y); ctx.stroke();
          }
          if (b.depth > 0.5) {
            ctx.fillStyle = U.rgba(tr.colA, Math.min(0.6, (0.05 + b.depth * 0.05) * k));
            for (let j = 0; j < 3; j++) {
              const ly = (h * (0.15 + j * 0.25) + b.ph * 30) % h;
              const kk = 1 - ly / h;
              ctx.beginPath();
              ctx.ellipse(b.x + sway * kk + 12, ly, 18, 3.5, -0.5 + Math.sin(t + j) * 0.2, 0, TAU);
              ctx.fill();
            }
          }
        }
      } else if (theme === 'castle') {
        const m = Math.min(w, h);
        this._gear(ctx, w * 0.5, h * 0.5, m * 0.42, 28, t * 0.05, tr.colA, tr.alpha);
        this._gear(ctx, w * 0.12, h * 0.2, m * 0.22, 16, -t * 0.09, tr.colB, tr.alpha * 1.1);
        this._gear(ctx, w * 0.9, h * 0.85, m * 0.26, 18, t * 0.08, tr.colA, tr.alpha * 1.1);
        ctx.globalCompositeOperation = 'lighter';
        for (const e of this.embers) {
          e.y -= (e.v / h) * dt * Math.max(0.3, game.worldScale || 1) * (tr.ph >= 2 ? 2.5 : 1);
          if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); }
          const x = e.x * w + Math.sin(t * 1.5 + e.p) * 12;
          ctx.fillStyle = `rgba(255,${120 + (e.p * 20) | 0},40,${0.35 + Math.sin(t * 4 + e.p) * 0.2})`;
          ctx.fillRect(x, e.y * h, e.s, e.s * 1.6);
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (theme === 'void') {
        this._mandala(ctx, w / 2, h * 0.45, Math.min(w, h) * 0.46, t, tr.ph === 1 ? '#C8D2EB' : tr.colA, tr.alpha);
        if (tr.ph >= 2) this._mandala(ctx, w / 2, h * 0.45, Math.min(w, h) * 0.3, -t * 1.3, tr.colB, tr.alpha * 0.8);
      } else if (theme === 'endless') {
        const cyc = ['#E6ECFF', '#FF1E42', '#FFBE2E'];
        const ph = (game.time / 40) % 3;
        const i0 = Math.floor(ph), f = ph - i0;
        const c0 = U.hexToRgb(cyc[i0]), c1 = U.hexToRgb(cyc[(i0 + 1) % 3]);
        const cyCol = '#' + [c0.r + (c1.r - c0.r) * f, c0.g + (c1.g - c0.g) * f, c0.b + (c1.b - c0.b) * f]
          .map((v) => ('0' + Math.round(v).toString(16)).slice(-2)).join('');
        const colA = tr.ph === 1 ? cyCol : tr.colA, colB = tr.ph === 1 ? cyCol : tr.colB;
        ctx.fillStyle = U.rgba(cyCol, 0.05);
        ctx.fillRect(0, 0, w, h);
        this._mandala(ctx, w / 2, h / 2, Math.min(w, h) * 0.5, t, colA, Math.max(0.08, tr.alpha));
        this._gear(ctx, w * 0.15, h * 0.8, Math.min(w, h) * 0.2, 16, t * 0.1, colB, Math.max(0.06, tr.alpha * 0.8));
        this._gear(ctx, w * 0.85, h * 0.2, Math.min(w, h) * 0.2, 16, -t * 0.1, colB, Math.max(0.06, tr.alpha * 0.8));
      }
      ctx.restore();

      // 鬼神：背景を走る黄金・深紅の稲妻＆空間亀裂
      if (tr.ph >= 3 && Math.random() < dt * 3) {
        const x0 = Math.random() * w, pts = [x0, -10];
        let x = x0, y = -10;
        while (y < h + 10) { x += U.rand(-60, 60); y += U.rand(40, 90); pts.push(x, y); }
        this.bgBolts.push({ pts, life: 0.35, max: 0.35, col: Math.random() < 0.5 ? C.gold : C.crimson });
      }
      if (this.bgBolts.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'miter';
        for (const b of this.bgBolts) {
          b.life -= dt;
          const a = Math.max(0, b.life / b.max);
          for (const [lw, al] of [[10, 0.12], [3, 0.5], [1.2, 0.9]]) {
            ctx.strokeStyle = al > 0.8 ? `rgba(255,255,255,${a * al})` : U.rgba(b.col, a * al);
            ctx.lineWidth = lw;
            ctx.beginPath(); ctx.moveTo(b.pts[0], b.pts[1]);
            for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
            ctx.stroke();
          }
        }
        ctx.restore();
        U.compact(this.bgBolts, (b) => b.life > 0);
      }

      this._drawAmbient(ctx, game, tr, dt);

      // バレットタイム時の墨黒への沈み込み
      if (game.bulletFx > 0.01) {
        ctx.fillStyle = `rgba(3,4,6,${0.72 * game.bulletFx})`;
        ctx.fillRect(-40, -40, w + 80, h + 80);
      }
    }

    /** 環境アンビエント粒子：墨塵20 ／ 火の粉＆ネオン桜吹雪90 ／ 黄金光粒子＋紫電アーク */
    _drawAmbient(ctx, game, tr, dt) {
      const w = this.w, h = this.h;
      const n = tr.ph === 1 ? 20 : 90;
      const sc = Math.max(0.25, game.worldScale == null ? 1 : game.worldScale);
      ctx.save();
      for (let i = 0; i < n; i++) {
        const q = this.ambient[i];
        if (tr.ph === 1) {
          // 墨塵：ゆっくり漂う
          q.y -= q.v * 0.008 * dt * sc; q.x += Math.sin(this.patT * 0.4 + q.p) * 0.0004;
          if (q.y < -0.05) Object.assign(q, this._newAmbient(false));
          ctx.fillStyle = `rgba(120,135,160,${0.12 + q.k * 0.12})`;
          ctx.beginPath(); ctx.arc(q.x * w, q.y * h, 1.5 + q.s * 1.5, 0, TAU); ctx.fill();
        } else if (tr.ph === 2) {
          // 火の粉＆ネオン桜吹雪：下から上へ高速で吹き上がる
          q.y -= q.v * 0.45 * dt * sc; q.x += Math.sin(this.patT * 2 + q.p) * 0.0016;
          if (q.y < -0.05) Object.assign(q, this._newAmbient(false));
          const x = q.x * w, y = q.y * h;
          ctx.globalCompositeOperation = 'lighter';
          if (q.k < 0.5) {
            ctx.fillStyle = `rgba(255,${110 + (q.k * 160) | 0},40,${0.55 + Math.sin(this.patT * 8 + q.p) * 0.25})`;
            ctx.fillRect(x, y, 1.6 * q.s, 3.2 * q.s);
          } else {
            ctx.save();
            ctx.translate(x, y); ctx.rotate(this.patT * 3 * q.s + q.p);
            ctx.fillStyle = U.rgba(q.k < 0.8 ? C.sakura : C.cyan, 0.6);
            ctx.beginPath(); ctx.ellipse(0, 0, 4.5 * q.s, 2.2 * q.s, 0, 0, TAU); ctx.fill();
            ctx.restore();
          }
        } else {
          // 黄金の光粒子
          q.y -= q.v * 0.3 * dt * sc; q.x += Math.sin(this.patT * 3 + q.p) * 0.002;
          if (q.y < -0.05) Object.assign(q, this._newAmbient(false));
          ctx.globalCompositeOperation = 'lighter';
          const tw = 0.5 + Math.sin(this.patT * 10 + q.p) * 0.5;
          ctx.fillStyle = U.rgba(q.k < 0.75 ? C.gold : C.crimson, 0.35 + tw * 0.5);
          ctx.beginPath(); ctx.arc(q.x * w, q.y * h, 1 + q.s * 1.6 * tw, 0, TAU); ctx.fill();
        }
      }
      // 鬼神：空間を走る紫電の稲妻アーク（毎秒4〜8本）
      if (tr.ph >= 3) {
        this.arcT -= dt;
        if (this.arcT <= 0) {
          this.arcT = 1 / U.rand(4, 8);
          const x1 = Math.random() * w, y1 = Math.random() * h, a = Math.random() * TAU, L = U.rand(80, 220);
          const pts = [x1, y1];
          const segs = 6;
          for (let s = 1; s <= segs; s++) {
            const t = s / segs;
            pts.push(x1 + Math.cos(a) * L * t + U.rand(-14, 14), y1 + Math.sin(a) * L * t + U.rand(-14, 14));
          }
          this.arcs.push({ pts, life: 0.16 });
        }
      }
      if (this.arcs.length) {
        ctx.globalCompositeOperation = 'lighter';
        for (const r of this.arcs) {
          r.life -= dt;
          const a = Math.max(0, r.life / 0.16);
          ctx.strokeStyle = U.rgba(C.shiden, 0.8 * a); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(r.pts[0], r.pts[1]);
          for (let i = 2; i < r.pts.length; i += 2) ctx.lineTo(r.pts[i], r.pts[i + 1]);
          ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${0.8 * a})`; ctx.lineWidth = 0.8; ctx.stroke();
        }
        U.compact(this.arcs, (r) => r.life > 0);
      }
      ctx.restore();
    }

    /* -------- 巨大毛筆背景カットイン（Layer 2） -------- */
    queueBrush(text, sub, phase, fx, now) {
      if (this.brushQueue.length >= 3) this.brushQueue.shift();
      this.brushQueue.push({ text, sub, phase });
      this._fxRef = fx;
    }
    _updateBrush(dt, game) {
      if (this.brush) {
        this.brush.t += dt;
        if (this.brush.t >= this.brush.dur) this.brush = null;
      }
      if (!this.brush && this.brushQueue.length) {
        const b = this.brushQueue.shift();
        this.brush = { text: b.text, sub: b.sub, phase: b.phase, t: 0, dur: P.BRUSH_CUTIN_TIME };
        if (game && game.onBrushStart) game.onBrushStart(this.brush);
      }
    }
    _drawBrush(ctx, pal) {
      const b = this.brush;
      if (!b) return;
      const w = this.w, h = this.h;
      const p = b.t / b.dur;
      const appear = Math.min(1, b.t / 0.22);
      const fade = p > 0.72 ? Math.max(0, 1 - (p - 0.72) / 0.28) : 1;
      const big = b.phase >= 3;
      // 覚醒：画面幅75% ／ 鬼神：画面全体を覆う
      const targetW = w * (big ? 0.96 : 0.75);
      ctx.save();
      ctx.font = `900 100px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","MS PMincho",serif`;
      const mw = ctx.measureText(b.text).width || 100;
      let size = 100 * targetW / mw;
      size = Math.min(size, h * (big ? 0.62 : 0.45));
      const scale = 1.35 - 0.35 * U.easeOutCubic(appear);
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.rotate(-0.05);
      ctx.font = `900 ${size}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","MS PMincho",serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const a = appear * fade;
      if (pal.inv) {
        ctx.fillStyle = `rgba(9,10,15,${0.18 * a})`;
        ctx.fillText(b.text, 0, 0);
      } else {
        // 墨のにじみ
        ctx.fillStyle = `rgba(0,0,0,${0.45 * a})`;
        ctx.fillText(b.text, size * 0.04, size * 0.05);
        const g = ctx.createLinearGradient(-targetW / 2, 0, targetW / 2, 0);
        if (big) { g.addColorStop(0, U.rgba(C.crimson, 0.42 * a)); g.addColorStop(0.5, U.rgba(C.gold, 0.5 * a)); g.addColorStop(1, U.rgba(C.crimson, 0.42 * a)); }
        else { g.addColorStop(0, U.rgba(C.cyan, 0.26 * a)); g.addColorStop(0.5, U.rgba(C.gold, 0.32 * a)); g.addColorStop(1, U.rgba(C.cyan, 0.26 * a)); }
        ctx.fillStyle = g;
        ctx.fillText(b.text, 0, 0);
        ctx.lineWidth = Math.max(2, size * 0.012);
        ctx.strokeStyle = U.rgba(big ? C.gold : '#FFFFFF', 0.35 * a);
        ctx.strokeText(b.text, 0, 0);
        ctx.font = `800 ${Math.max(14, size * 0.09)}px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif`;
        ctx.fillStyle = U.rgba(big ? C.gold : C.cyan, 0.55 * a);
        ctx.fillText(b.sub, 0, size * 0.62);
      }
      ctx.restore();
    }

    /* -------- 画面外周の集中線＆オーラ枠（Layer 12） -------- */
    _drawSpeedLines(ctx, game, pal) {
      const ph = game.trancePhase || 1;
      if (ph < 2 || game.state === 'TITLE' || game.state === 'DOJO') return;
      const w = this.w, h = this.h, cx = w / 2, cy = h / 2;
      const R = Math.hypot(cx, cy) + 20;
      const n = ph >= 3 ? 72 : 48;
      ctx.save();
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.35) continue; // 毎フレーム高速明滅
        const a = (i / n) * TAU + U.rand(-0.04, 0.04);
        const inner = R * U.rand(0.6, 0.82);
        const half = (ph >= 3 ? U.rand(0.012, 0.03) : U.rand(0.004, 0.012));
        ctx.fillStyle = pal.inv ? `rgba(9,10,15,${U.rand(0.08, 0.2)})`
          : ph >= 3 ? U.rgba(i % 2 ? C.gold : C.crimson, U.rand(0.18, 0.45)) : `rgba(255,255,255,${U.rand(0.08, 0.28)})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a - half) * R, cy + Math.sin(a - half) * R);
        ctx.lineTo(cx + Math.cos(a + half) * R, cy + Math.sin(a + half) * R);
        ctx.closePath();
        ctx.fill();
      }
      // 鬼神：上下左右の端に燃え盛るネオンフレーム
      if (ph >= 3 && !pal.inv) {
        const fl = 0.75 + Math.sin(this.patT * 23) * 0.15 + Math.random() * 0.1;
        const d = Math.min(w, h) * 0.07 * (1 + this.beat * 0.4);
        const edges = [[0, 0, w, d, 0, 0, 0, d], [0, h - d, w, d, 0, h, 0, h - d], [0, 0, d, h, 0, 0, d, 0], [w - d, 0, d, h, w, 0, w - d, 0]];
        for (const e of edges) {
          const g = ctx.createLinearGradient(e[4], e[5], e[6], e[7]);
          g.addColorStop(0, U.rgba(C.crimson, 0.5 * fl));
          g.addColorStop(0.4, U.rgba(C.gold, 0.28 * fl));
          g.addColorStop(1, U.rgba(C.gold, 0));
          ctx.fillStyle = g;
          ctx.fillRect(e[0], e[1], e[2], e[3]);
        }
      }
      ctx.restore();
    }

    /* -------- RGB色収差（赤とシアンを左右にズラした加算描画） -------- */
    chromatic(px, dur) {
      if (this.ca && this.ca.t < this.ca.dur && this.ca.px > px) return;
      this.ca = { px, t: 0, dur: dur || P.CA_TIME };
    }
    _applyChromatic(dt) {
      const ca = this.ca;
      if (!ca) return;
      ca.t += dt;
      if (ca.t >= ca.dur) { this.ca = null; return; }
      if (this.lowFx) return;
      const k = 1 - ca.t / ca.dur;
      const px = ca.px * this.dpr * (0.4 + 0.6 * k);
      const W = this.canvas.width, H = this.canvas.height;
      const tint = (cv, col) => {
        const g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'copy';
        g.drawImage(this.canvas, 0, 0);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = col;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      };
      tint(this.caR, '#FF0000');
      tint(this.caC, '#00FFFF');
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * k + 0.2;
      ctx.drawImage(this.caR, px, 0);
      ctx.drawImage(this.caC, -px, 0);
      ctx.restore();
    }

    /* -------- Layer 10 パーティクル描画 -------- */
    _drawParticles(ctx, fx, pal) {
      const ps = fx.particles;
      // 墨粒（通常合成）
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.kind !== 2) continue;
        const a = p.life / p.max;
        ctx.fillStyle = pal.inv ? `rgba(9,10,15,${a})` : `rgba(18,22,32,${0.85 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.4), 0, TAU); ctx.fill();
      }
      ctx.save();
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.kind === 2) continue;
        const a = p.life / p.max;
        const col = pal.inv ? (p.kind === 3 ? C.ink : C.crimson) : p.color;
        if (p.kind === 0) {
          ctx.strokeStyle = U.rgba(col, a);
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
        } else if (p.kind === 3) {
          // ガラス・空間破片
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = pal.inv ? `rgba(9,10,15,${a})` : `rgba(230,240,255,${a * 0.8})`;
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 2); ctx.lineTo(p.size * 1.4, p.size); ctx.lineTo(-p.size, p.size * 1.2);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = U.rgba(col, a);
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.restore();
    }

    /* -------- Layer 11 フローティングテキスト -------- */
    _drawTexts(ctx, fx, pal, time) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of fx.texts) {
        const p = 1 - t.life / t.max;
        const a = t.life < 0.25 ? t.life / 0.25 : 1;
        let scale = 1;
        if (t.kind === 'callout') scale = p < 0.12 ? U.easeOutBack(p / 0.12) * 1.15 : 1.15 - Math.min(0.15, (p - 0.12) * 0.4);
        else if (t.kind === 'dmg') scale = p < 0.1 ? 0.6 + p * 6 : 1;
        const size = t.size * scale;
        ctx.globalAlpha = a;
        if (t.kind === 'callout') {
          ctx.font = `900 ${size}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","MS PMincho",serif`;
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(4, size * 0.16);
          ctx.strokeStyle = pal.inv ? 'rgba(243,244,246,0.95)' : 'rgba(3,4,6,0.92)';
          ctx.strokeText(t.text, t.x, t.y);
          let fill = t.color;
          if (t.color === 'rainbow') {
            const g = ctx.createLinearGradient(t.x - size * 3, 0, t.x + size * 3, 0);
            const hshift = (time * 240) % 360;
            for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(hshift + i * 50) % 360},100%,62%)`);
            fill = g;
          } else if (pal.inv) fill = t.color === '#FFFFFF' ? C.ink : C.crimson;
          ctx.fillStyle = fill;
          ctx.fillText(t.text, t.x, t.y);
          // 加算グロー
          if (!pal.inv) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = a * 0.35;
            ctx.fillText(t.text, t.x, t.y);
            ctx.globalCompositeOperation = 'source-over';
          }
        } else {
          ctx.font = `800 ${size}px "Hiragino Sans","Yu Gothic","Noto Sans JP",system-ui,sans-serif`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = pal.inv ? 'rgba(243,244,246,0.9)' : 'rgba(0,0,0,0.85)';
          ctx.strokeText(t.text, t.x, t.y);
          ctx.fillStyle = pal.inv ? C.ink : t.color;
          ctx.fillText(t.text, t.x, t.y);
        }
      }
      ctx.restore();
    }

    /* -------- 画面二分割（次元斬ズレ／第弐奥義） -------- */
    addSplit(x1, y1, x2, y2, offset, dur) {
      if (this.splits.length > 3) this.splits.shift();
      this.splits.push({ x1, y1, x2, y2, offset, t: 0, dur, hold: 0 });
    }

    _applySplit(game) {
      if (!this.splits.length || this.lowFx) return;
      const s = this.splits[this.splits.length - 1];
      const ctx = this.ctx, dpr = this.dpr;
      const k = s.hold > 0 ? 1 : Math.sin(Math.min(1, s.t / s.dur) * Math.PI);
      const off = s.offset * (s.hold > 0 ? 1 : k);
      if (Math.abs(off) < 0.5) return;
      // ワールド座標 → スクリーン座標（カメラ考慮）
      const cam = game.camera;
      const cx = this.w / 2, cy = this.h / 2;
      const tx = (x) => (x - cx) * cam.zoom + cx + cam.sx;
      const ty = (y) => (y - cy) * cam.zoom + cy + cam.sy;
      const ax = tx(s.x1), ay = ty(s.y1), bx = tx(s.x2), by = ty(s.y2);
      const ang = Math.atan2(by - ay, bx - ax);
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const nx = -dy, ny = dx;
      const bc = this.bctx;
      bc.setTransform(1, 0, 0, 1, 0, 0);
      bc.clearRect(0, 0, this.buffer.width, this.buffer.height);
      bc.drawImage(this.canvas, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // 全面クリアは行わず、両半面を上書きする（隙間には元画像が残り亀裂のように見える）
      const big = 6000;
      const mx = (ax + bx) / 2 * dpr, my = (ay + by) / 2 * dpr;
      const W = this.canvas.width, H = this.canvas.height;
      const rect = [[0, 0], [W, 0], [W, H], [0, H]];
      for (let side = -1; side <= 1; side += 2) {
        // キャンバス矩形を半平面でクリップした凸多角形（巨大パスを避けて軽量化）
        const poly = [];
        for (let i = 0; i < 4; i++) {
          const p = rect[i], q = rect[(i + 1) % 4];
          const dp = ((p[0] - mx) * nx + (p[1] - my) * ny) * side;
          const dq = ((q[0] - mx) * nx + (q[1] - my) * ny) * side;
          if (dp >= 0) poly.push(p);
          if ((dp >= 0) !== (dq >= 0)) {
            const t = dp / (dp - dq);
            poly.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
          }
        }
        if (poly.length < 3) continue;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(this.buffer, dx * off * side * dpr + nx * Math.abs(off) * 0.25 * side * dpr, dy * off * side * dpr + ny * Math.abs(off) * 0.25 * side * dpr);
        ctx.restore();
      }
      // 断面の白線
      ctx.globalCompositeOperation = game.pal.inv ? 'source-over' : 'lighter';
      ctx.strokeStyle = game.pal.inv ? C.crimson : '#FFFFFF';
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(mx - dx * big, my - dy * big);
      ctx.lineTo(mx + dx * big, my + dy * big);
      ctx.stroke();
      ctx.strokeStyle = U.rgba(C.crimson, 0.5);
      ctx.lineWidth = 8 * dpr;
      ctx.stroke();
      ctx.restore();
    }

    updatePost(dt, game) {
      this.beat = Math.max(0, this.beat - dt * 6);
      this._updateBrush(dt, game);
      for (const s of this.splits) {
        if (s.hold > 0) s.hold -= dt; else s.t += dt;
      }
      U.compact(this.splits, (s) => s.hold > 0 || s.t < s.dur);
      this.flash = Math.max(0, this.flash - dt * 3.2);
    }

    doFlash(a, color) {
      this.flash = Math.max(this.flash, a);
      this.flashColor = color || '#ffffff';
    }

    /* ===================================================================
     * draw(game)：12層の厳密な描画順序
     * ================================================================= */
    draw(game) {
      const ctx = this.ctx;
      const fx = game.fx;
      const pal = game.pal;
      const w = this.w, h = this.h, dpr = this.dpr;
      const cam = game.camera;
      const cx = w / 2, cy = h / 2;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = pal.inv ? C.paper : C.bgInkDeep;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // カメラ変換（ズーム＋シェイク）
      const z = cam.zoom;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cx - cx * z + cam.sx), dpr * (cy - cy * z + cam.sy));

      // Layer 1: 背景ベース＆ステージ固有環境紋様
      this._drawLayer1(ctx, game, pal);

      // Layer 2: 巨大毛筆背景カットイン＋床面デカール＋ボス危険予兆エリア
      this._drawBrush(ctx, pal);
      for (const d of fx.decals) d.draw(ctx, pal);
      for (const f of fx.flames) f.draw(ctx, pal, game.time);
      for (const b of game.bosses) b.drawTelegraphs(ctx, pal, game);
      for (const e of game.enemies) if (e.drawTelegraph) e.drawTelegraph(ctx, pal, game);

      // Layer 3: 魂ジェム＆設置ギミック＆秘伝の巻物
      for (const g of game.gimmicks) g.draw(ctx, pal, game);
      if (game.scrolls) for (const sc of game.scrolls) sc.draw(ctx, pal, game);
      for (const g of game.gems) g.draw(ctx, pal, game);

      // Layer 4: 一刀両断された敵の断面パーツ（＋死体ボウリングの吹っ飛び肉弾）
      for (const s of fx.halves) s.draw(ctx, pal);
      for (const c of fx.corpses) c.draw(ctx, pal);

      // Layer 5: 生存中の敵・エリート・ボス本体＋部位マーカー
      for (const e of game.enemies) e.draw(ctx, pal, game);
      for (const b of game.bosses) b.draw(ctx, pal, game);
      for (const hole of game.blackHoles) hole.draw(ctx, pal, game);

      // Layer 6: 敵弾＆プレイヤーの追尾クナイ・真空波
      for (const b of game.bullets) b.draw(ctx, pal, game);
      for (const k of game.kunais) k.draw(ctx, pal, game);
      for (const wv of game.waves) wv.draw(ctx, pal, game);

      // Layer 7: 次元斬ライン（空間ズレは Layer 12 で合成）＋第弐奥義の漆黒の太陽
      for (const r of fx.rifts) r.draw(ctx, pal);
      if (game.drawUltWorld) game.drawUltWorld(ctx, pal);

      // Layer 8: ロックオン接続線・予測ルート・番号バッジ
      if (game.drawLockOverlay) game.drawLockOverlay(ctx, pal);

      // Layer 9: 主人公
      if (game.player) game.player.draw(ctx, pal, game);

      // Layer 10: 加算合成エフェクト
      ctx.save();
      ctx.globalCompositeOperation = pal.inv ? 'source-over' : 'lighter';
      for (const t of fx.trails) t.draw(ctx, pal);
      for (const r of fx.rings) r.draw(ctx, pal);
      for (const b of fx.bolts) b.draw(ctx, pal);
      for (const b of fx.beams) b.draw(ctx, pal);
      ctx.restore();
      this._drawParticles(ctx, fx, pal);

      // Layer 11: フローティングテキスト
      this._drawTexts(ctx, fx, pal, game.time);

      // Layer 12: スクリーンポストエフェクト
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._applySplit(game);
      this._applyChromatic(game.dtReal || 0.016);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._drawSpeedLines(ctx, game, pal);
      for (const c of fx.cracks) c.draw(ctx, pal.inv);
      if (game.drawUltScreen) game.drawUltScreen(ctx, pal, w, h);
      // ビネット（バレットタイムで強化）
      const vig = 0.35 + game.bulletFx * 0.65;
      if (!pal.inv) {
        ctx.globalAlpha = vig;
        ctx.drawImage(this.vignette, -w * 0.08, -h * 0.08, w * 1.16, h * 1.16);
        ctx.globalAlpha = 1;
      }
      // 被弾時の赤い縁
      if (game.hurtFx > 0) {
        const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.7);
        g.addColorStop(0, 'rgba(255,30,66,0)');
        g.addColorStop(1, `rgba(255,30,66,${0.45 * game.hurtFx})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (this.flash > 0) {
        ctx.globalAlpha = Math.min(1, this.flash);
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }

  ZI.Effects = {
    EffectManager, Renderer, InkDecal, SlicedHalf, CorpseShard, VoidRift, SlashTrail, SparkParticle,
    Shockwave, LightningBolt, Beam, FloatingText, ScreenCrack, FlameLine
  };
})();
