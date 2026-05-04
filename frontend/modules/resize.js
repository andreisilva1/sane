// ── Panel Resize (panel_resize_v1) ─────────────────────────
// Drag #sidebar-resizer → resize sidebar
// Drag #ai-resizer      → resize AI panel
// Persists widths to localStorage

(function () {
  const SIDEBAR_KEY  = 'sane_sidebar_w';
  const AI_KEY       = 'sane_ai_w';
  const SIDEBAR_MIN  = 120;
  const SIDEBAR_MAX  = 480;
  const AI_MIN       = 240;
  const AI_MAX       = 600;

  const root        = document.documentElement;
  const elSidebar   = document.getElementById('sidebar');
  const elAiPanel   = document.getElementById('ai-panel');
  const elSidebarRz = document.getElementById('sidebar-resizer');
  const elAiRz      = document.getElementById('ai-resizer');

  // ── Restore saved sizes ───────────────────────────────────
  const savedSidebar = parseInt(localStorage.getItem(SIDEBAR_KEY));
  if (savedSidebar) {
    root.style.setProperty('--sidebar-w', savedSidebar + 'px');
  }
  const savedAi = parseInt(localStorage.getItem(AI_KEY));
  if (savedAi && elAiPanel) {
    elAiPanel.style.width = savedAi + 'px';
  }

  // ── Generic drag helper ───────────────────────────────────
  function makeDraggable(handle, onMove, onDone) {
    handle.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();

      // Disable sidebar transition during drag
      elSidebar.style.transition = 'none';

      const startX = e.clientX;

      function move(ev) { onMove(ev.clientX - startX, startX, ev.clientX); }
      function up()     {
        elSidebar.style.transition = '';
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup',   up);
        if (onDone) onDone();
      }

      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup',   up);
    });
  }

  // ── Sidebar resize ────────────────────────────────────────
  if (elSidebarRz) {
    const startW = () => elSidebar.offsetWidth;
    let   w0 = 0;

    elSidebarRz.addEventListener('mousedown', () => { w0 = startW(); });

    makeDraggable(elSidebarRz, (dx) => {
      if (elSidebar.classList.contains('collapsed')) return;
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w0 + dx));
      root.style.setProperty('--sidebar-w', w + 'px');
    }, () => {
      const w = elSidebar.offsetWidth;
      localStorage.setItem(SIDEBAR_KEY, w);
    });
  }

  // ── AI panel resize ───────────────────────────────────────
  if (elAiRz && elAiPanel) {
    let w0 = 0;

    elAiRz.addEventListener('mousedown', () => { w0 = elAiPanel.offsetWidth; });

    makeDraggable(elAiRz, (dx) => {
      const w = Math.min(AI_MAX, Math.max(AI_MIN, w0 - dx)); // dragging left → panel grows
      elAiPanel.style.width = w + 'px';
    }, () => {
      localStorage.setItem(AI_KEY, elAiPanel.offsetWidth);
    });
  }
})();
