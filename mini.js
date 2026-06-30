/* Mini floating window. Hosts the always-on-top (Picture-in-Picture) mode. */
(() => {
  "use strict";
  const CIRC = 552.92; // 2π·88
  const $ = (s) => document.querySelector(s);
  const body = document.body;
  const el = {
    root: $("#mini-root"), glow: $("#glow"), dot: $("#dot"),
    prog: $("#prog"), time: $("#time"), sub: $("#sub"),
    play: $("#playBtn"), reset: $("#resetBtn"), add: $("#addBtn"),
    pin: $("#pinBtn"), expand: $("#expandBtn"),
    note: $("#pip-note"), unpin: $("#unpinBtn"),
  };
  let S = null;
  let pipWin = null;

  function fmt(ms) {
    const neg = ms < 0;
    const t = Math.round(Math.abs(ms) / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (n) => String(n).padStart(2, "0");
    return (neg ? "+" : "") + (h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`);
  }
  function applyZone(zone) {
    const z = SC.zoneColors(zone, S ? S.accent : "blue");
    const r = document.documentElement.style;
    r.setProperty("--ring-a", z.a);
    r.setProperty("--ring-b", z.b);
    r.setProperty("--glow", z.glow);
    el.prog.style.stroke = z.b;
    if (pipWin) {
      const pr = pipWin.document.documentElement.style;
      pr.setProperty("--ring-a", z.a); pr.setProperty("--ring-b", z.b); pr.setProperty("--glow", z.glow);
    }
  }
  function render() {
    if (!S) return;
    const c = SC.computed(S);
    el.time.textContent = fmt(c.displayMs);
    el.time.classList.toggle("sign", c.mode === "countdown" && c.displayMs < 0);
    el.prog.style.strokeDashoffset = CIRC * (1 - c.frac);
    applyZone(c.zone);
    body.dataset.running = c.running ? "1" : "0";
    body.dataset.mode = c.mode;
    body.dataset.over = c.overtime ? "1" : "0";
    if (c.mode === "stopwatch") el.sub.textContent = c.running ? "측정 중" : "스톱워치";
    else if (c.mode === "agenda") el.sub.textContent = c.overtime
      ? "어젠다 종료" : `${c.segLabel} · ${c.segIndex + 1}/${c.segCount}`;
    else if (c.overtime) el.sub.textContent = "시간 초과";
    else el.sub.textContent = c.running ? "발표 중" : "시작 준비됨";
    el.play.setAttribute("aria-label", c.running ? "정지" : "시작");
    body.dataset.theme = S.theme;
    SCCues.tick(c, S.sound, S.voice);
  }

  // ---- controls ----
  el.play.addEventListener("click", () => { SCSound.unlock(); SC.toggle(); });
  el.reset.addEventListener("click", () => SC.reset());
  el.add.addEventListener("click", () => SC.addMinute());
  el.expand.addEventListener("click", () => chrome.runtime.sendMessage({ type: "open", surface: "full" }));
  el.pin.addEventListener("click", togglePip);
  el.unpin.addEventListener("click", () => { if (pipWin) pipWin.close(); });

  // ---- always-on-top via Document Picture-in-Picture ----
  async function togglePip() {
    if (pipWin) { pipWin.close(); return; }
    if (!("documentPictureInPicture" in window)) {
      el.sub.textContent = "이 브라우저는 미지원";
      return;
    }
    try {
      pipWin = await documentPictureInPicture.requestWindow({ width: 240, height: 250 });
    } catch (_) { return; }

    // carry styles into the floating window
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) =>
      pipWin.document.head.appendChild(n.cloneNode(true)));
    pipWin.document.body.dataset.mode = body.dataset.mode;
    pipWin.document.body.dataset.running = body.dataset.running;
    pipWin.document.body.append(el.root);   // move live UI into PiP
    body.dataset.pinned = "1";
    el.note.hidden = false;

    pipWin.addEventListener("pagehide", () => {
      body.append(el.root);                 // bring UI back
      el.note.hidden = true;
      body.dataset.pinned = "0";
      pipWin = null;
    });
  }
  // keep PiP body data-attrs in sync for icon toggles
  function mirrorToPip() {
    if (!pipWin) return;
    pipWin.document.body.dataset.mode = body.dataset.mode;
    pipWin.document.body.dataset.running = body.dataset.running;
    pipWin.document.body.dataset.over = body.dataset.over;
  }

  // ---- live sync + loop ----
  SC.onChange((s) => { S = s; });
  function loop() { render(); mirrorToPip(); requestAnimationFrame(loop); }
  // safety tick for throttled rAF (window behind others)
  setInterval(render, 250);

  (async () => {
    S = await SC.getStore();
    render();
    requestAnimationFrame(loop);
    // first user interaction unlocks audio
    document.addEventListener("pointerdown", () => SCSound.unlock(), { once: true });
  })();
})();
