/* Цикл ресурсов — фоновая пыль руды на canvas. */
(function () {
  const COR = window.COR = window.COR || {};
  const U = COR.util;

  class Ambient {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext("2d") : null;
      this.particles = [];
      this.enabled = true;
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.last = 0;
      this.raf = 0;
      this.reduced = U.prefersReducedMotion();
      if (!this.ctx) return;
      this.resize();
      this.spawn();
      window.addEventListener("resize", () => this.resize());
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && this.enabled) this.start();
      });
      if (!this.reduced) this.start();
      else this.drawStatic();
    }

    resize() {
      if (!this.ctx) return;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = Math.floor(this.w * this.dpr);
      this.canvas.height = Math.floor(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.reduced) this.drawStatic();
    }

    spawn() {
      const count = this.w < 700 ? 18 : 38;
      this.particles = [];
      for (let i = 0; i < count; i += 1) {
        this.particles.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          size: 0.7 + Math.random() * 1.9,
          vx: -0.03 + Math.random() * 0.09,
          vy: -0.04 - Math.random() * 0.12,
          alpha: 0.03 + Math.random() * 0.13,
          copper: Math.random() > 0.42,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    setEnabled(on) {
      this.enabled = !!on;
      if (!this.enabled) {
        this.stop();
        this.clear();
      } else if (!this.reduced) {
        this.start();
      } else {
        this.drawStatic();
      }
    }

    start() {
      if (!this.ctx || this.raf || !this.enabled) return;
      if (this.reduced) { this.drawStatic(); return; }
      this.last = performance.now();
      const loop = (now) => {
        if (!this.enabled || document.hidden) {
          this.raf = 0;
          return;
        }
        const dt = Math.min(48, now - this.last) / 16.67;
        this.last = now;
        this.update(dt);
        this.draw();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    clear() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.w, this.h);
    }

    update(dt) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.phase += 0.005 * dt;
        if (p.y < -10) { p.y = this.h + 10; p.x = Math.random() * this.w; }
        if (p.x < -10) p.x = this.w + 10;
        if (p.x > this.w + 10) p.x = -10;
      }
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      for (const p of this.particles) {
        const a = p.alpha * (0.72 + Math.sin(p.phase) * 0.28);
        ctx.fillStyle = p.copper
          ? `rgba(232, 163, 74, ${a.toFixed(3)})`
          : `rgba(95, 208, 212, ${(a * 0.8).toFixed(3)})`;
        const s = p.size;
        ctx.fillRect(p.x, p.y, s, s);
      }
    }

    drawStatic() {
      if (!this.ctx) return;
      this.update(0);
      this.draw();
    }
  }

  COR.Ambient = Ambient;
})();
