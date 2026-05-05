// ── AI Feature Settings ───────────────────────────────────
// Persists to localStorage. Exposes window.sane.aiSettings.
// Other modules check the flags before activating.

(function () {
  const STORAGE_KEY = 'sane:aiSettings';
  const DEFAULTS    = { insight: true, selfHealing: true, intentDetection: true };

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
    catch { return { ...DEFAULTS }; }
  }

  function save(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

  window.sane = window.sane || {};
  window.sane.aiSettings = load();

  // ── Panel elements ────────────────────────────────────────
  const elOverlay = document.getElementById('aicfg-overlay');
  const elClose   = document.getElementById('aicfg-close');
  const chkInsight  = document.getElementById('aicfg-insight');
  const chkHealing  = document.getElementById('aicfg-healing');
  const chkIntent   = document.getElementById('aicfg-intent');

  function open() {
    const s = window.sane.aiSettings;
    chkInsight.checked = s.insight         !== false;
    chkHealing.checked = s.selfHealing     !== false;
    chkIntent.checked  = s.intentDetection !== false;
    elOverlay.classList.remove('hidden');
  }

  function close() { elOverlay.classList.add('hidden'); }

  function onChange() {
    const s = {
      insight:         chkInsight.checked,
      selfHealing:     chkHealing.checked,
      intentDetection: chkIntent.checked,
    };
    window.sane.aiSettings = s;
    save(s);
  }

  elClose.addEventListener('click', close);
  elOverlay.addEventListener('mousedown', (e) => { if (e.target === elOverlay) close(); });
  chkInsight.addEventListener('change', onChange);
  chkHealing.addEventListener('change', onChange);
  chkIntent.addEventListener('change',  onChange);

  document.getElementById('ai-settings-btn').addEventListener('click', open);

  window.sane.openAISettings = open;
})();
