/* ============================================================
   Sponge Clock — shared timer engine (cross-platform)
   Single source of truth for the timer state.
   • As a Chrome extension  → chrome.storage.local (+ runtime msgs)
   • As a plain web app/PWA  → localStorage (+ BroadcastChannel sync)
   Loaded as a classic script (window.SC) and via importScripts in
   the service worker (self.SC).
   ============================================================ */
;(function (global) {
  "use strict";

  const KEY = "sc.state";
  const PREF_AUTOMINI = "sc.autoMini";

  const DEFAULTS = {
    mode: "countdown",       // "countdown" | "stopwatch" | "agenda"
    durationMs: 300000,
    running: false,
    endAt: 0,
    remainingMs: 300000,
    swStartAt: 0,
    swElapsed: 0,
    agenda: [],              // [{ label, ms }, ...] multi-segment program
    agendaStartAt: 0,        // epoch when the agenda run (re)started
    agendaBase: 0,           // elapsed ms accrued before current run (pause)
    sound: true,
    voice: true,           // spoken announcements (TTS)
    theme: "dark",         // "dark" | "light"
    accent: "blue",        // colors the calm zone (see ACCENTS)
    overrunFlash: true,    // flash the screen red when over time
    updatedAt: 0,
  };

  const ZONES = {
    calm:   { a: "#5ac8fa", b: "#0a84ff", glow: "rgba(10,132,255,0.45)" },
    go:     { a: "#5ee7a0", b: "#30d158", glow: "rgba(48,209,88,0.40)" },
    warn:   { a: "#ffd66b", b: "#ff9f0a", glow: "rgba(255,159,10,0.45)" },
    danger: { a: "#ff7a6b", b: "#ff3b30", glow: "rgba(255,59,48,0.55)" },
  };

  // Accent options recolor the "calm" zone (>50% left). Warn/danger keep
  // their semantic amber/red so urgency still reads the same.
  const ACCENTS = {
    blue:     { a: "#5ac8fa", b: "#0a84ff", glow: "rgba(10,132,255,0.45)" },
    purple:   { a: "#bf5af2", b: "#7d3cff", glow: "rgba(125,60,255,0.45)" },
    green:    { a: "#5ee7a0", b: "#30d158", glow: "rgba(48,209,88,0.45)" },
    pink:     { a: "#ff7eb3", b: "#ff2d78", glow: "rgba(255,45,120,0.45)" },
    graphite: { a: "#c7ced9", b: "#8a93a3", glow: "rgba(138,147,163,0.40)" },
  };

  function zoneColors(zone, accent) {
    if (zone === "calm") return ACCENTS[accent] || ACCENTS.blue;
    return ZONES[zone];
  }

  function zoneFor(remaining, duration) {
    if (remaining <= 0) return "danger";
    const f = duration > 0 ? remaining / duration : 0;
    if (f <= 0.10) return "danger";
    if (f <= 0.20) return "warn";
    if (f <= 0.50) return "go";
    return "calm";
  }

  // ---- environment detection ----
  const IS_EXT = !!(
    typeof chrome !== "undefined" &&
    chrome.storage && chrome.storage.local &&
    chrome.runtime && chrome.runtime.id
  );

  // ---- storage adapter ----
  const Store = (function () {
    const localListeners = [];
    let bc = null;
    if (!IS_EXT && typeof BroadcastChannel !== "undefined") {
      try { bc = new BroadcastChannel("sc-state"); } catch (_) {}
    }
    function get() {
      if (IS_EXT) return chrome.storage.local.get(KEY).then((o) => o[KEY]);
      try {
        const raw = (typeof localStorage !== "undefined") && localStorage.getItem(KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : undefined);
      } catch (_) { return Promise.resolve(undefined); }
    }
    function set(state) {
      if (IS_EXT) return chrome.storage.local.set({ [KEY]: state });
      try { if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
      // same-tab listeners (storage/BroadcastChannel don't echo to the writer)
      localListeners.forEach((f) => { try { f(state); } catch (_) {} });
      if (bc) { try { bc.postMessage(state); } catch (_) {} }
      return Promise.resolve();
    }
    function subscribe(cb) {
      if (IS_EXT) {
        chrome.storage.onChanged.addListener((ch, area) => {
          if (area === "local" && ch[KEY]) cb(ch[KEY].newValue);
        });
        return;
      }
      localListeners.push(cb);
      if (bc) bc.addEventListener("message", (e) => cb(e.data));
      if (typeof window !== "undefined") {
        window.addEventListener("storage", (e) => {
          if (e.key === KEY && e.newValue) { try { cb(JSON.parse(e.newValue)); } catch (_) {} }
        });
      }
    }
    return { get, set, subscribe };
  })();

  function getStore() {
    return Store.get().then((s) => Object.assign({}, DEFAULTS, s || {}));
  }
  function setStore(next) {
    next.updatedAt = Date.now();
    return Store.set(next).then(() => next);
  }

  // Pure: derive display values from raw state + a clock reading.
  function computed(s, now) {
    now = now || Date.now();

    if (s.mode === "stopwatch") {
      const e = s.running ? now - s.swStartAt : s.swElapsed;
      return {
        displayMs: e, frac: (e % 60000) / 60000, overtime: false,
        zone: "calm", running: s.running, mode: "stopwatch",
        durationMs: s.durationMs, endAt: 0, sound: s.sound,
        segIndex: 0, segCount: 0, segLabel: "", nextLabel: "", totalRemaining: e,
      };
    }

    if (s.mode === "agenda" && s.agenda && s.agenda.length) {
      const segs = s.agenda;
      const total = segs.reduce((a, x) => a + x.ms, 0);
      let elapsed = s.running ? s.agendaBase + (now - s.agendaStartAt) : s.agendaBase;
      if (elapsed < 0) elapsed = 0;
      // locate current segment
      let acc = 0, idx = -1, segStart = 0;
      for (let i = 0; i < segs.length; i++) {
        if (elapsed < acc + segs[i].ms) { idx = i; segStart = acc; break; }
        acc += segs[i].ms;
      }
      if (idx === -1) { idx = segs.length - 1; segStart = total - segs[idx].ms; } // past the end
      const segMs = segs[idx].ms;
      const inLast = idx === segs.length - 1;
      const segRemaining = (segStart + segMs) - elapsed; // <0 only on last seg
      const overtime = inLast && segRemaining <= 0;
      return {
        displayMs: segRemaining,
        frac: segMs > 0 ? Math.max(0, Math.min(1, segRemaining / segMs)) : 0,
        overtime,
        zone: zoneFor(segRemaining, segMs),
        running: s.running, mode: "agenda",
        durationMs: segMs,
        // unique per segment → cue tracker resets each segment
        endAt: s.running ? Math.round(s.agendaStartAt - s.agendaBase + segStart + segMs) : -(idx + 1),
        sound: s.sound,
        segIndex: idx, segCount: segs.length,
        segLabel: segs[idx].label || ("구간 " + (idx + 1)),
        nextLabel: idx + 1 < segs.length ? (segs[idx + 1].label || ("구간 " + (idx + 2))) : "",
        totalRemaining: total - elapsed,
      };
    }

    const rem = s.running ? s.endAt - now : s.remainingMs;
    return {
      displayMs: rem,
      frac: s.durationMs > 0 ? Math.max(0, Math.min(1, rem / s.durationMs)) : 0,
      overtime: rem <= 0,
      zone: zoneFor(rem, s.durationMs),
      running: s.running, mode: "countdown",
      durationMs: s.durationMs, endAt: s.endAt, sound: s.sound,
      segIndex: 0, segCount: 0, segLabel: "", nextLabel: "", totalRemaining: rem,
    };
  }

  // ---- mutations ----
  function agendaTotal(s) { return (s.agenda || []).reduce((a, x) => a + x.ms, 0); }

  async function start() {
    const s = await getStore();
    const now = Date.now();
    if (s.mode === "stopwatch") {
      await setStore(Object.assign(s, { running: true, swStartAt: now - s.swElapsed }));
    } else if (s.mode === "agenda") {
      let base = s.agendaBase;
      if (base >= agendaTotal(s)) base = 0; // finished → restart
      await setStore(Object.assign(s, { running: true, agendaBase: base, agendaStartAt: now }));
    } else {
      let rem = s.running ? s.endAt - now : s.remainingMs;
      if (rem <= 0) rem = s.durationMs;
      await setStore(Object.assign(s, { running: true, endAt: now + rem }));
    }
    sync();
  }
  async function pause() {
    const s = await getStore();
    if (!s.running) return;
    const now = Date.now();
    if (s.mode === "stopwatch") {
      await setStore(Object.assign(s, { running: false, swElapsed: now - s.swStartAt }));
    } else if (s.mode === "agenda") {
      await setStore(Object.assign(s, { running: false, agendaBase: s.agendaBase + (now - s.agendaStartAt) }));
    } else {
      await setStore(Object.assign(s, { running: false, remainingMs: s.endAt - now }));
    }
    sync();
  }
  async function toggle() {
    const s = await getStore();
    return s.running ? pause() : start();
  }
  async function reset() {
    const s = await getStore();
    if (s.mode === "stopwatch") {
      await setStore(Object.assign(s, { running: false, swElapsed: 0, swStartAt: 0 }));
    } else if (s.mode === "agenda") {
      await setStore(Object.assign(s, { running: false, agendaBase: 0, agendaStartAt: 0 }));
    } else {
      await setStore(Object.assign(s, { running: false, remainingMs: s.durationMs, endAt: 0 }));
    }
    sync();
  }

  // Build a multi-segment program. segs = [{ label, ms }, ...]
  async function setAgenda(segs) {
    const s = await getStore();
    const clean = (segs || []).filter((x) => x && x.ms > 0)
      .map((x) => ({ label: String(x.label || "").slice(0, 24), ms: Math.round(x.ms) }));
    await setStore(Object.assign(s, {
      mode: clean.length ? "agenda" : "countdown",
      agenda: clean, running: false, agendaBase: 0, agendaStartAt: 0,
    }));
    sync();
  }

  // Jump to the start of the next segment (or finish if on the last one).
  async function skipSegment() {
    const s = await getStore();
    if (s.mode !== "agenda" || !s.agenda.length) return;
    const now = Date.now();
    const elapsed = s.running ? s.agendaBase + (now - s.agendaStartAt) : s.agendaBase;
    let acc = 0, target = agendaTotal(s);
    for (let i = 0; i < s.agenda.length; i++) {
      if (elapsed < acc + s.agenda[i].ms) { target = acc + s.agenda[i].ms; break; }
      acc += s.agenda[i].ms;
    }
    await setStore(Object.assign(s, { agendaBase: target, agendaStartAt: now }));
    sync();
  }

  // Count down to an absolute wall-clock time (next occurrence of h:m).
  async function setTarget(h, m) {
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    let ms = t.getTime() - Date.now();
    if (ms <= 0) ms += 24 * 3600 * 1000; // already passed today → tomorrow
    const s = await getStore();
    await setStore(Object.assign(s, {
      mode: "countdown", durationMs: ms, remainingMs: ms, endAt: Date.now() + ms, running: true,
    }));
    sync();
    return ms;
  }
  async function addMinute() {
    const s = await getStore();
    if (s.mode !== "countdown") return;
    const patch = { durationMs: s.durationMs + 60000 };
    if (s.running) patch.endAt = s.endAt + 60000;
    else patch.remainingMs = s.remainingMs + 60000;
    await setStore(Object.assign(s, patch));
    sync();
  }
  async function setDuration(ms) {
    const s = await getStore();
    await setStore(Object.assign(s, {
      mode: "countdown", durationMs: ms, running: false, remainingMs: ms, endAt: 0,
    }));
    sync();
  }
  async function setMode(mode) {
    const s = await getStore();
    if (mode === s.mode) return;
    s.mode = mode;
    if (mode === "stopwatch") { s.running = false; s.swElapsed = 0; s.swStartAt = 0; }
    else { s.running = false; s.remainingMs = s.durationMs; s.endAt = 0; }
    await setStore(s);
    sync();
  }
  async function setSound(on) {
    const s = await getStore();
    await setStore(Object.assign(s, { sound: !!on }));
  }
  async function setVoice(on) {
    const s = await getStore();
    await setStore(Object.assign(s, { voice: !!on }));
  }
  async function setTheme(theme) {
    const s = await getStore();
    await setStore(Object.assign(s, { theme: theme === "light" ? "light" : "dark" }));
  }
  async function setAccent(accent) {
    const s = await getStore();
    await setStore(Object.assign(s, { accent: ACCENTS[accent] ? accent : "blue" }));
  }
  async function setOverrun(on) {
    const s = await getStore();
    await setStore(Object.assign(s, { overrunFlash: !!on }));
  }

  function sync() {
    if (IS_EXT) { try { chrome.runtime.sendMessage({ type: "sc-sync" }); } catch (_) {} }
  }

  // Ask the platform to open a surface. Extension → background opens a
  // real window/tab. Standalone returns false so the page handles it
  // inline (fullscreen / Picture-in-Picture / new tab).
  function openSurface(which) {
    if (IS_EXT) { try { chrome.runtime.sendMessage({ type: "open", surface: which }); } catch (_) {} return true; }
    return false;
  }

  function onChange(cb) {
    Store.subscribe((raw) => cb(Object.assign({}, DEFAULTS, raw || {})));
  }

  global.SC = {
    KEY, PREF_AUTOMINI, DEFAULTS, ZONES, ACCENTS, zoneFor, zoneColors,
    isExtension: IS_EXT,
    getStore, computed, start, pause, toggle, reset,
    addMinute, setDuration, setMode, setSound, setVoice, setTheme,
    setAccent, setOverrun, setAgenda, skipSegment, setTarget,
    onChange, sync, openSurface,
  };
})(typeof self !== "undefined" ? self : window);
