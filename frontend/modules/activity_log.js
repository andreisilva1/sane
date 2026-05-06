(function () {
  const STORAGE_KEY = 'sane:activityLog';
  const MAX_ENTRIES = 300;

  // ── Storage ───────────────────────────────────────────────
  function loadLog() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveLog(log) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  }

  function addEntry(msg) {
    const log = loadLog();
    const now = new Date();
    log.unshift({
      ts:  now.toISOString(),
      hm:  now.toTimeString().slice(0, 5),
      day: now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      msg: String(msg),
    });
    if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
    saveLog(log);
  }

  // ── Listen for activity events ────────────────────────────
  document.addEventListener('sane:activity', (e) => {
    addEntry(e.detail);
  });

  // ── Panel ─────────────────────────────────────────────────
  const elOverlay = document.getElementById('alog-overlay');
  const elClose   = document.getElementById('alog-close');
  const elBody    = document.getElementById('alog-body');
  const elClear   = document.getElementById('alog-clear');

  function open() {
    renderLog();
    elOverlay.classList.remove('hidden');
  }

  function close() {
    elOverlay.classList.add('hidden');
  }

  function renderLog() {
    const log = loadLog();
    elBody.innerHTML = '';

    if (!log.length) {
      elBody.innerHTML = '<div class="alog-empty">No activity recorded yet.</div>';
      return;
    }

    let lastDay = null;
    for (const entry of log) {
      if (entry.day !== lastDay) {
        const hdr = document.createElement('div');
        hdr.className = 'alog-day';
        hdr.textContent = entry.day;
        elBody.appendChild(hdr);
        lastDay = entry.day;
      }
      const row = document.createElement('div');
      row.className = 'alog-row';

      const time = document.createElement('span');
      time.className = 'alog-time';
      time.textContent = entry.hm;

      const msg = document.createElement('span');
      msg.className = 'alog-msg';
      msg.textContent = '✔ ' + entry.msg;

      row.append(time, msg);
      elBody.appendChild(row);
    }
  }

  elClose.addEventListener('click', close);
  elOverlay.addEventListener('mousedown', (e) => {
    if (e.target === elOverlay) close();
  });
  elClear.addEventListener('click', () => {
    saveLog([]);
    renderLog();
  });

  // ── Ctrl+Shift+J ──────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      elOverlay.classList.contains('hidden') ? open() : close();
    }
  });

  // ── Expose ────────────────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.openActivityLog = open;
})();
