/* Spoken announcements via the Web Speech API (window.SCVoice). */
;(function (g) {
  "use strict";
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  function speak(text) {
    if (!supported) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 1.05;
      u.pitch = 1.0;
      window.speechSynthesis.cancel(); // don't queue stale lines
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }
  g.SCVoice = { supported, speak };
})(window);
