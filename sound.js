/* Shared Web Audio cue helper (window.SCSound) — no asset files needed. */
;(function (g) {
  "use strict";
  let ctx = null;
  function ac() {
    if (!ctx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (A) ctx = new A();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function beep(freq, durMs, when, gain, type) {
    const c = ac();
    if (!c) return;
    when = when || 0; gain = gain || 0.18; type = type || "sine";
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const gn = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    o.connect(gn).connect(c.destination);
    o.start(t);
    o.stop(t + durMs / 1000 + 0.05);
  }
  g.SCSound = {
    unlock: ac,
    blip: () => beep(880, 90, 0, 0.12, "triangle"),
    tick: () => beep(880, 90, 0, 0.10, "triangle"),
    warn: () => { beep(660, 140); beep(660, 140, 0.20); },
    final: () => {
      beep(523.25, 260, 0, 0.20);
      beep(659.25, 260, 0.18, 0.20);
      beep(783.99, 520, 0.36, 0.22);
    },
  };
})(window);
