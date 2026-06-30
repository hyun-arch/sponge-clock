/* ============================================================
   Sponge Clock — full presentation tab
   Renders from the shared engine (chrome.storage). All mutations
   go through SC.* so the popup / mini window stay in sync.
   ============================================================ */
(() => {
  "use strict";
  const RING_CIRC = 2 * Math.PI * 160; // r=160
  const $ = (s) => document.querySelector(s);
  const body = document.body;
  const el = {
    time: $("#time"), sub: $("#sublabel"), ring: $(".ring-progress"),
    wall: $("#wallclock"), playBtn: $("#playBtn"), resetBtn: $("#resetBtn"),
    addBtn: $("#addBtn"), soundBtn: $("#soundBtn"), fsBtn: $("#fsBtn"),
    pinBtn: $("#pinBtn"), presets: $("#presets"), customChip: $("#customChip"),
    modal: $("#customModal"), inMin: $("#inMin"), inSec: $("#inSec"),
    customApply: $("#customApply"), customCancel: $("#customCancel"),
    skipBtn: $("#skipBtn"), segBanner: $("#segBanner"),
    customTabs: $("#customTabs"), tgtH: $("#tgtH"), tgtM: $("#tgtM"),
    agendaList: $("#agendaList"), agendaAdd: $("#agendaAdd"),
    hint: $("#hint"), modeBtns: document.querySelectorAll(".mode-btn"),
    presentOverlay: $("#presentOverlay"), presentGo: $("#presentGo"),
    settingsBtn: $("#settingsBtn"), settingsModal: $("#settingsModal"),
    settingsClose: $("#settingsClose"), themeSeg: $("#themeSeg"),
    swatches: $("#swatches"), voiceToggle: $("#voiceToggle"),
    overrunToggle: $("#overrunToggle"),
  };
  let S = null;

  function fmt(ms) {
    const neg = ms < 0;
    const t = Math.round(Math.abs(ms) / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (n) => String(n).padStart(2, "0");
    return (neg ? "+" : "") + (h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`);
  }
  function applyZone(zone) {
    const z = SC.zoneColors(zone, S ? S.accent : "blue");
    setVars(document.documentElement.style, z);
    if (pipWin) {
      setVars(pipWin.document.documentElement.style, z);
      pipWin.document.body.dataset.mode = body.dataset.mode;
      pipWin.document.body.dataset.state = body.dataset.state;
    }
  }
  function setVars(style, z) {
    style.setProperty("--ring-a", z.a);
    style.setProperty("--ring-b", z.b);
    style.setProperty("--glow", z.glow);
  }
  function render() {
    if (!S) return;
    const c = SC.computed(S);
    el.time.textContent = fmt(c.displayMs);
    el.time.classList.toggle("sign", c.mode === "countdown" && c.displayMs < 0);
    el.ring.style.strokeDashoffset = RING_CIRC * (1 - c.frac);
    applyZone(c.zone);

    body.dataset.mode = c.mode;
    el.modeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.mode === c.mode));

    let st = "idle";
    if (c.overtime && (c.mode === "countdown" || c.mode === "agenda")) st = "overtime";
    else if (c.running) st = "running";
    else if (isDirty(c)) st = "paused";
    body.dataset.state = st;

    // agenda segment banner + skip control
    const isAgenda = c.mode === "agenda";
    el.segBanner.hidden = !isAgenda;
    el.skipBtn.hidden = !isAgenda;
    if (isAgenda) {
      el.segBanner.textContent = `${c.segLabel} · ${c.segIndex + 1}/${c.segCount}`;
    }

    if (c.mode === "stopwatch") el.sub.textContent = c.running ? "측정 중" : "스톱워치 — 시작하려면 Space";
    else if (isAgenda) {
      if (c.overtime) el.sub.textContent = "어젠다 종료";
      else if (c.nextLabel) el.sub.textContent = `다음: ${c.nextLabel} · 전체 ${fmt(c.totalRemaining)} 남음`;
      else el.sub.textContent = c.running ? "마지막 구간" : "시작하려면 Space";
    }
    else if (c.overtime) el.sub.textContent = "시간 초과";
    else if (c.running) el.sub.textContent = "발표 중";
    else if (st === "paused") el.sub.textContent = "일시정지";
    else el.sub.textContent = "시작하려면 Space";

    el.playBtn.setAttribute("aria-label", c.running ? "정지" : "시작");
    SCCues.tick(c, S.sound, S.voice);
  }
  function isDirty(c) {
    if (S.mode === "stopwatch") return S.swElapsed !== 0;
    if (S.mode === "agenda") return S.agendaBase !== 0;
    return S.remainingMs !== S.durationMs;
  }

  function markPreset(min) {
    document.querySelectorAll(".chip[data-min]").forEach((c) =>
      c.classList.toggle("is-active", Number(c.dataset.min) === min));
  }
  function reflectStatic() {
    body.dataset.sound = S.sound ? "on" : "off";
    body.dataset.theme = S.theme;
    body.dataset.overrun = S.overrunFlash ? "1" : "0";
    if (el.modal.getAttribute("aria-hidden") !== "false")
      markPreset(Math.round(S.durationMs / 60000));
    el.addBtn.style.visibility = S.mode === "countdown" ? "visible" : "hidden";
    el.presets.style.visibility = S.mode === "countdown" ? "visible" : "hidden";
    // settings reflection
    el.themeSeg.querySelectorAll(".seg-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.theme === S.theme));
    el.swatches.querySelectorAll(".swatch").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.accent === S.accent));
    el.voiceToggle.setAttribute("aria-checked", S.voice ? "true" : "false");
    el.overrunToggle.setAttribute("aria-checked", S.overrunFlash ? "true" : "false");
  }

  // ---- controls ----
  el.playBtn.addEventListener("click", () => { SCSound.unlock(); SC.toggle(); });
  el.resetBtn.addEventListener("click", () => SC.reset());
  el.addBtn.addEventListener("click", () => SC.addMinute());
  el.modeBtns.forEach((b) => b.addEventListener("click", () => SC.setMode(b.dataset.mode)));
  el.soundBtn.addEventListener("click", () => {
    const next = !(S && S.sound);
    SC.setSound(next);
    if (next) { SCSound.unlock(); SCSound.blip(); }
  });
  el.fsBtn.addEventListener("click", toggleFullscreen);
  el.pinBtn.addEventListener("click", goMini);

  // Extension → open the dedicated mini window. Standalone → float THIS
  // page's dial via Document Picture-in-Picture (works on any site/PWA).
  function goMini() {
    if (SC.openSurface("mini")) return;
    togglePagePip();
  }

  let pipWin = null;
  async function togglePagePip() {
    if (pipWin) { pipWin.close(); return; }
    if (!("documentPictureInPicture" in window)) { toggleFullscreen(); return; }
    const stage = document.querySelector(".stage");
    try { pipWin = await documentPictureInPicture.requestWindow({ width: 260, height: 260 }); }
    catch (_) { return; }
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) =>
      pipWin.document.head.appendChild(n.cloneNode(true)));
    pipWin.document.body.dataset.mode = body.dataset.mode;
    pipWin.document.body.dataset.state = body.dataset.state;
    pipWin.document.body.classList.add("pip");
    pipWin.document.body.append(stage);
    pipWin.addEventListener("pagehide", () => { body.append(stage); pipWin = null; });
  }

  el.presets.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip[data-min]");
    if (!chip) return;
    markPreset(Number(chip.dataset.min));
    SC.setDuration(Number(chip.dataset.min) * 60000);
  });

  // ---- custom / target / agenda modal ----
  let activeTab = "time";

  const AGENDA_PRESETS = {
    talk: [{ label: "발표", min: 20 }, { label: "Q&A", min: 5 }],
    lightning: [{ label: "발표 1", min: 5 }, { label: "발표 2", min: 5 }, { label: "발표 3", min: 5 }],
    workshop: [{ label: "도입", min: 10 }, { label: "실습", min: 25 }, { label: "공유", min: 10 }],
  };

  function addAgendaRow(label, min) {
    const row = document.createElement("div");
    row.className = "agenda-row";
    row.innerHTML =
      '<input class="ag-label" maxlength="24" placeholder="구간 이름" />' +
      '<input class="ag-min" type="number" min="0" max="999" inputmode="numeric" />' +
      '<span class="ag-unit">분</span>' +
      '<button class="ag-del" aria-label="삭제">✕</button>';
    row.querySelector(".ag-label").value = label || "";
    row.querySelector(".ag-min").value = min != null ? min : 5;
    row.querySelector(".ag-del").addEventListener("click", () => row.remove());
    el.agendaList.appendChild(row);
  }
  function setAgendaRows(segs) {
    el.agendaList.innerHTML = "";
    (segs && segs.length ? segs : AGENDA_PRESETS.talk).forEach((x) =>
      addAgendaRow(x.label, x.min != null ? x.min : Math.round(x.ms / 60000)));
  }
  function collectAgenda() {
    return [...el.agendaList.querySelectorAll(".agenda-row")].map((r) => ({
      label: r.querySelector(".ag-label").value.trim(),
      ms: (Math.max(0, Math.min(999, parseInt(r.querySelector(".ag-min").value, 10) || 0))) * 60000,
    })).filter((x) => x.ms > 0);
  }

  function switchTab(tab) {
    activeTab = tab;
    el.customTabs.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("is-active", t.dataset.tab === tab));
    el.modal.querySelectorAll(".tabpane").forEach((p) =>
      p.hidden = p.dataset.pane !== tab);
  }

  function openModal() {
    const totalSec = Math.round((S ? S.durationMs : 300000) / 1000);
    el.inMin.value = Math.floor(totalSec / 60);
    el.inSec.value = String(totalSec % 60).padStart(2, "0");
    setAgendaRows(S && S.agenda);
    switchTab(S && S.mode === "agenda" ? "agenda" : "time");
    el.modal.setAttribute("aria-hidden", "false");
    setTimeout(() => el.inMin.select(), 50);
  }
  function closeModal() { el.modal.setAttribute("aria-hidden", "true"); }
  function applyModal() {
    if (activeTab === "time") {
      const m = Math.max(0, Math.min(999, parseInt(el.inMin.value, 10) || 0));
      const s = Math.max(0, Math.min(59, parseInt(el.inSec.value, 10) || 0));
      const ms = (m * 60 + s) * 1000;
      if (ms > 0) { markPreset(-1); SC.setDuration(ms); }
    } else if (activeTab === "target") {
      const h = Math.max(0, Math.min(23, parseInt(el.tgtH.value, 10) || 0));
      const m = Math.max(0, Math.min(59, parseInt(el.tgtM.value, 10) || 0));
      markPreset(-1); SCSound.unlock(); SC.setTarget(h, m); // setTarget auto-starts
    } else if (activeTab === "agenda") {
      const segs = collectAgenda();
      if (segs.length) { markPreset(-1); SC.setAgenda(segs); }
    }
    closeModal();
  }

  el.customChip.addEventListener("click", openModal);
  el.customCancel.addEventListener("click", closeModal);
  el.customApply.addEventListener("click", applyModal);
  el.modal.addEventListener("click", (e) => { if (e.target === el.modal) closeModal(); });
  el.customTabs.addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (t) switchTab(t.dataset.tab);
  });
  el.agendaAdd.addEventListener("click", () => addAgendaRow("", 5));
  el.modal.querySelector(".agenda-presets").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-preset]");
    if (b) setAgendaRows(AGENDA_PRESETS[b.dataset.preset]);
  });
  [el.inMin, el.inSec, el.tgtH, el.tgtM].forEach((inp) =>
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") applyModal(); }));

  // skip to next agenda segment
  el.skipBtn.addEventListener("click", () => SC.skipSegment());

  // ---- settings modal ----
  function openSettings() { el.settingsModal.setAttribute("aria-hidden", "false"); }
  function closeSettings() { el.settingsModal.setAttribute("aria-hidden", "true"); }
  el.settingsBtn.addEventListener("click", openSettings);
  el.settingsClose.addEventListener("click", closeSettings);
  el.settingsModal.addEventListener("click", (e) => { if (e.target === el.settingsModal) closeSettings(); });
  el.themeSeg.addEventListener("click", (e) => {
    const b = e.target.closest(".seg-btn"); if (b) SC.setTheme(b.dataset.theme);
  });
  el.swatches.addEventListener("click", (e) => {
    const b = e.target.closest(".swatch"); if (b) SC.setAccent(b.dataset.accent);
  });
  el.voiceToggle.addEventListener("click", () => {
    const next = !(S && S.voice); SC.setVoice(next);
    if (next && typeof SCVoice !== "undefined") SCVoice.speak("음성 안내 켜짐");
  });
  el.overrunToggle.addEventListener("click", () => SC.setOverrun(!(S && S.overrunFlash)));

  // ---- fullscreen ----
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }
  document.addEventListener("fullscreenchange", () => {
    body.classList.toggle("is-fs", !!document.fullscreenElement);
  });

  // ---- present overlay (one-click fullscreen for the gesture) ----
  function setupPresent() {
    const params = new URLSearchParams(location.search);
    if (params.get("present") !== "1") return;
    el.presentOverlay.hidden = false;
    const go = () => {
      el.presentOverlay.hidden = true;
      SCSound.unlock();
      toggleFullscreen();
      history.replaceState(null, "", location.pathname);
    };
    el.presentGo.addEventListener("click", go);
    el.presentOverlay.addEventListener("click", (e) => { if (e.target !== el.presentGo) go(); });
  }

  // ---- keyboard ----
  document.addEventListener("keydown", (e) => {
    if (el.modal.getAttribute("aria-hidden") === "false") {
      if (e.key === "Escape") closeModal();
      return;
    }
    if (el.settingsModal.getAttribute("aria-hidden") === "false") {
      if (e.key === "Escape" || e.key === "s" || e.key === "S") closeSettings();
      return;
    }
    switch (e.key) {
      case " ": case "Spacebar": e.preventDefault(); SCSound.unlock(); SC.toggle(); break;
      case "r": case "R": case "ㄱ": SC.reset(); break;
      case "f": case "F": case "ㄹ": toggleFullscreen(); break;
      case "p": case "P": case "ㅔ": goMini(); break;
      case "s": case "S": case "ㄴ": openSettings(); break;
      case "n": case "N": case "ㅜ": SC.skipSegment(); break;
      case "+": case "=": SC.addMinute(); break;
      case "m": case "M": case "ㅡ": {
        const next = !(S && S.sound); SC.setSound(next);
        if (next) { SCSound.unlock(); SCSound.blip(); } break;
      }
      case "Escape": if (document.fullscreenElement) document.exitFullscreen(); break;
    }
  });

  // ---- wall clock + hint ----
  function wall() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    el.wall.textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  let hintTimer = setTimeout(() => el.hint.classList.add("hide"), 6000);
  function hideHint() { clearTimeout(hintTimer); el.hint.classList.add("hide"); }
  document.addEventListener("pointerdown", () => { SCSound.unlock(); hideHint(); }, { once: true });

  // ---- screen wake lock (don't let the display sleep mid-talk) ----
  let wakeLock = null;
  async function syncWakeLock(running) {
    if (!("wakeLock" in navigator)) return;
    try {
      if (running && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!running && wakeLock) {
        await wakeLock.release(); wakeLock = null;
      }
    } catch (_) {}
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S && S.running) syncWakeLock(true);
  });

  // ---- PWA: register service worker when served over http(s) ----
  if (!SC.isExtension && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // ---- live sync + loop ----
  SC.onChange((s) => { S = s; reflectStatic(); syncWakeLock(s.running); });
  function loop() { render(); requestAnimationFrame(loop); }
  setInterval(render, 250); // safety tick if tab is backgrounded

  (async () => {
    S = await SC.getStore();
    reflectStatic();
    setupPresent();
    wall(); setInterval(wall, 1000);
    render();
    requestAnimationFrame(loop);
  })();
})();
