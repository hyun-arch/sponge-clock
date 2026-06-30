/* Audio + voice cue scheduler (window.SCCues).
   Only the *visible* surface fires, so multiple open windows never
   double up. Tracks fired cues per run (keyed by endAt). */
;(function (g) {
  "use strict";
  let runId = null;
  let fired = new Set();
  let lastSeg = null;

  // c = computed() output; soundOn = beeps; voiceOn = spoken lines
  function tick(c, soundOn, voiceOn) {
    if (c.mode === "stopwatch" || !c.running) { lastSeg = null; return; }
    if (c.endAt !== runId) { runId = c.endAt; fired = new Set(); }

    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const sec = Math.ceil(c.displayMs / 1000);
    const hasVoice = voiceOn && typeof SCVoice !== "undefined" && SCVoice.supported;

    // ---- agenda segment transition ----
    if (c.mode === "agenda") {
      if (lastSeg === null) lastSeg = c.segIndex;
      else if (c.segIndex !== lastSeg) {
        lastSeg = c.segIndex;
        if (soundOn) SCSound.warn();
        if (hasVoice && c.segLabel) SCVoice.speak(c.segLabel + " 시작");
      }
    }

    // ---- within-segment beeps ----
    if (soundOn) {
      if (sec <= 10 && sec >= 1 && !fired.has("t" + sec)) { fired.add("t" + sec); SCSound.tick(); }
      if (!hasVoice && sec === 60 && !fired.has("60")) { fired.add("60"); SCSound.warn(); }
      if (!hasVoice && c.overtime && !fired.has("end")) { fired.add("end"); SCSound.final(); }
    }

    // ---- spoken announcements ----
    if (hasVoice) {
      if (sec === 60 && !fired.has("v60")) { fired.add("v60"); SCVoice.speak("1분 남았습니다"); }
      if (sec === 30 && !fired.has("v30")) { fired.add("v30"); SCVoice.speak("30초 남았습니다"); }
      if (c.overtime && !fired.has("vend")) {
        fired.add("vend");
        SCVoice.speak(c.mode === "agenda" ? "어젠다가 종료되었습니다" : "시간이 종료되었습니다");
      }
    }
  }
  g.SCCues = { tick };
})(window);
