export class GameAudio {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private dingEl: HTMLAudioElement | null = null;

  constructor() {
    if (typeof Audio !== "undefined") {
      this.dingEl = new Audio("/sounds/order-ding.wav");
      this.dingEl.preload = "auto";
      this.dingEl.volume = 0.85;
    }
  }

  unlock() {
    this.unlocked = true;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    void this.ctx?.resume();
    if (this.dingEl) {
      this.dingEl.volume = 0;
      void this.dingEl.play().then(() => {
        this.dingEl?.pause();
        if (this.dingEl) {
          this.dingEl.currentTime = 0;
          this.dingEl.volume = 0.85;
        }
      }).catch(() => {});
    }
  }

  playDing() {
    if (!this.unlocked) return;
    if (this.dingEl) {
      this.dingEl.currentTime = 0;
      void this.dingEl.play().catch(() => this.synthDing());
      return;
    }
    this.synthDing();
  }

  private synthDing() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { f: 1568, t: 0 },
      { f: 1976, t: 0.155 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const osc2 = ctx.createOscillator();
      osc.type = "sine";
      osc2.type = "sine";
      osc.frequency.value = n.f;
      osc2.frequency.value = n.f * 2;
      const start = now + n.t;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc2.start(start);
      osc.stop(start + 0.22);
      osc2.stop(start + 0.22);
    }
  }
}
