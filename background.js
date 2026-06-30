/* ============================================================
   Sponge Clock — service worker
   • Opens the three surfaces (full tab / mini window / present)
   • Re-arms a chrome.alarm so the end-of-time alert fires even
     when no window is focused
   • Auto-opens the mini window on browser startup (opt-in)
   ============================================================ */
importScripts("engine.js");

const TIMER_URL = chrome.runtime.getURL("timer.html");
const MINI_URL = chrome.runtime.getURL("mini.html");
const ALARM = "sc-chime";

chrome.runtime.onInstalled.addListener(() => { rescheduleAlarm(); });
chrome.runtime.onStartup.addListener(() => { rescheduleAlarm(); maybeAutoMini(); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg) return;
  if (msg.type === "sc-sync") { rescheduleAlarm(); return; }
  if (msg.type === "open") {
    openSurface(msg.surface).then(() => reply && reply({ ok: true }));
    return true; // async reply
  }
});

async function openSurface(which) {
  if (which === "mini") return openMini();
  return openTimerTab(which === "full"); // "full" = present, "tab" = normal
}

async function openTimerTab(present) {
  const tabs = await chrome.tabs.query({ url: TIMER_URL + "*" });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    return;
  }
  chrome.tabs.create({ url: present ? TIMER_URL + "?present=1" : TIMER_URL });
}

async function openMini() {
  const wins = await chrome.windows.getAll({ populate: true });
  for (const w of wins) {
    if (w.tabs && w.tabs.some((t) => t.url && t.url.startsWith(MINI_URL))) {
      await chrome.windows.update(w.id, { focused: true, drawAttention: true });
      return;
    }
  }
  const { left, top } = await topRight(300, 320);
  chrome.windows.create({
    url: MINI_URL, type: "popup", width: 300, height: 320, left, top, focused: true,
  });
}

// Place a window in the top-right corner of the primary display's work area.
async function topRight(w, h) {
  try {
    const info = await chrome.system.display.getInfo();
    const p = (info.find((d) => d.isPrimary) || info[0]).workArea;
    return { left: Math.max(p.left, p.left + p.width - w - 24), top: p.top + 24 };
  } catch (_) {
    return { left: 200, top: 80 };
  }
}

async function maybeAutoMini() {
  try {
    const o = await chrome.storage.local.get(SC.PREF_AUTOMINI);
    if (o[SC.PREF_AUTOMINI]) openMini();
  } catch (_) {}
}

async function rescheduleAlarm() {
  await chrome.alarms.clear(ALARM);
  const s = await SC.getStore();
  if (!s.running) return;
  let when = 0;
  if (s.mode === "countdown") {
    when = s.endAt;
  } else if (s.mode === "agenda" && s.agenda && s.agenda.length) {
    const total = s.agenda.reduce((a, x) => a + x.ms, 0);
    when = s.agendaStartAt - s.agendaBase + total;
  }
  if (when > Date.now()) chrome.alarms.create(ALARM, { when });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) notifyEnd();
});

function notifyEnd() {
  try {
    chrome.notifications.create("sc-end", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "발표 시간 종료",
      message: "설정한 시간이 끝났습니다. 지금부터 초과 시간이 카운트됩니다.",
      priority: 2,
      requireInteraction: false,
    });
  } catch (_) {}
}

// Clicking the notification brings the mini timer forward.
chrome.notifications.onClicked.addListener((id) => {
  if (id === "sc-end") { openMini(); chrome.notifications.clear(id); }
});
