/* Popup control center — quick controls + launchers. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const body = document.body;
  const el = {
    time: $("#time"), sub: $("#sub"), wall: $("#wall"), dot: $("#dot"),
    glow: $("#glow"), play: $("#playBtn"), reset: $("#resetBtn"), add: $("#addBtn"),
    presets: $("#presets"), sound: $("#soundBtn"), soundLabel: $("#soundLabel"),
    voiceToggle: $("#voiceToggle"),
    autoMini: $("#autoMini"), modeBtns: document.querySelectorAll(".mode-btn"),
  };

  let S = null; // latest raw state

  function fmt(ms) {
    const neg = ms < 0;
    const t = Math.round(Math.abs(ms) / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (n) => String(n).padStart(2, "0");
    const core = h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
    return (neg ? "+" : "") + core;
  }

  function applyZone(zone) {
    const z = SC.zoneColors(zone, S ? S.accent : "blue");
    const r = document.documentElement.style;
    r.setProperty("--ring-a", z.a);
    r.setProperty("--ring-b", z.b);
    r.setProperty("--glow", z.glow);
  }

  function render() {
    if (!S) return;
    const c = SC.computed(S);
    el.time.textContent = fmt(c.displayMs);
    el.time.classList.toggle("sign", c.mode === "countdown" && c.displayMs < 0);
    applyZone(c.zone);
    body.dataset.running = c.running ? "1" : "0";
    body.dataset.mode = c.mode;
    el.modeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.mode === c.mode));
    if (c.mode === "stopwatch") el.sub.textContent = c.running ? "측정 중" : "스톱워치";
    else if (c.mode === "agenda") el.sub.textContent = c.overtime
      ? "어젠다 종료" : `${c.segLabel} · ${c.segIndex + 1}/${c.segCount}`;
    else if (c.overtime) el.sub.textContent = "시간 초과";
    else el.sub.textContent = c.running ? "발표 중" : "시작 준비됨";
    el.play.setAttribute("aria-label", c.running ? "정지" : "시작");
  }

  function markPreset(min) {
    document.querySelectorAll(".chip[data-min]").forEach((c) =>
      c.classList.toggle("is-active", Number(c.dataset.min) === min));
  }

  // ---- wiring ----
  el.play.addEventListener("click", () => { SCSound.unlock(); SC.toggle(); });
  el.reset.addEventListener("click", () => SC.reset());
  el.add.addEventListener("click", () => SC.addMinute());
  el.presets.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip[data-min]");
    if (!chip) return;
    const min = Number(chip.dataset.min);
    markPreset(min);
    SC.setDuration(min * 60000);
  });
  el.modeBtns.forEach((b) => b.addEventListener("click", () => SC.setMode(b.dataset.mode)));
  el.sound.addEventListener("click", () => {
    const next = !(S && S.sound);
    SC.setSound(next);
    if (next) { SCSound.unlock(); SCSound.blip(); }
  });
  document.querySelectorAll(".launch-btn").forEach((b) =>
    b.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open", surface: b.dataset.open });
      window.close();
    }));
  el.voiceToggle.addEventListener("click", () => {
    const next = !(S && S.voice);
    SC.setVoice(next);
    if (next && typeof SCVoice !== "undefined") SCVoice.speak("음성 안내 켜짐");
  });
  el.autoMini.addEventListener("change", () => {
    chrome.storage.local.set({ [SC.PREF_AUTOMINI]: el.autoMini.checked });
  });

  // ---- live sync ----
  SC.onChange((s) => { S = s; reflectStatic(); });
  function reflectStatic() {
    body.dataset.sound = S.sound ? "on" : "off";
    body.dataset.theme = S.theme;
    el.soundLabel.textContent = S.sound ? "소리 켜짐" : "소리 꺼짐";
    if (el.voiceToggle) el.voiceToggle.setAttribute("aria-checked", S.voice ? "true" : "false");
    markPreset(Math.round(S.durationMs / 60000));
  }

  // ---- wall clock + render loop ----
  function wall() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    el.wall.textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function loop() { render(); requestAnimationFrame(loop); }

  // ---- init ----
  (async () => {
    S = await SC.getStore();
    const pref = await chrome.storage.local.get(SC.PREF_AUTOMINI);
    el.autoMini.checked = !!pref[SC.PREF_AUTOMINI];
    reflectStatic();
    wall(); setInterval(wall, 1000);
    render();
    requestAnimationFrame(loop);
  })();
})();
