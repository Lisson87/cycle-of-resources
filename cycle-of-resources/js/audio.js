/* Цикл ресурсов — звук на Web Audio API.
   Без внешних библиотек: короткие синтезированные сигналы вместо файлов. */
(function () {
  const COR = window.COR = window.COR || {};
  class Sound {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.lastClick = 0;
    }

    init() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.055;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (e) {
        return false;
      }
    }

    resume() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    }

    tone(freq, dur, type, gain, slideTo, delay) {
      if (!this.enabled || !this.init()) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      const peak = gain == null ? 0.5 : gain;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    play(name) {
      if (!this.enabled) return;
      if (name === "click") {
        const now = performance.now();
        if (now - this.lastClick < 35) return;
        this.lastClick = now;
        this.tone(540 + Math.random() * 80, 0.055, "triangle", 0.35, 720);
      } else if (name === "build") {
        this.tone(150, 0.12, "square", 0.32, 70);
        this.tone(320, 0.08, "triangle", 0.18, 220, 0.03);
      } else if (name === "remove") {
        this.tone(220, 0.09, "sine", 0.18, 140);
      } else if (name === "craft") {
        this.tone(620, 0.07, "triangle", 0.28, 760);
        this.tone(880, 0.07, "sine", 0.14, 900, 0.06);
      } else if (name === "tech") {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.22, null, i * 0.085));
      } else if (name === "achievement") {
        [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.28, "sine", 0.2, null, i * 0.1));
      } else if (name === "error") {
        this.tone(150, 0.16, "sawtooth", 0.22, 90);
      } else if (name === "boost") {
        this.tone(320, 0.35, "sawtooth", 0.18, 1100);
        this.tone(640, 0.3, "sine", 0.12, 1600, 0.08);
      } else if (name === "save") {
        this.tone(880, 0.06, "sine", 0.12, 990);
        this.tone(1170, 0.08, "sine", 0.1, 1200, 0.05);
      } else if (name === "open") {
        this.tone(300, 0.08, "sine", 0.12, 420);
      }
    }
  }
  COR.Sound = Sound;
})();
