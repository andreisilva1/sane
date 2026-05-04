// ── HTML Preview (html_preview_v1) ─────────────────────────
// Ctrl+Shift+P → preview .html files in embedded iframe
// All relative assets and file:/// URLs are served via /preview-dir/
// Depends on: state, API, setStatus, window.sane (chained after runner.js)

(function () {
  const elBtn     = document.getElementById('btn-preview');
  const elPanel   = document.getElementById('preview-panel');
  const elFrame   = document.getElementById('preview-frame');
  const elClose   = document.getElementById('preview-close');
  const elRefresh = document.getElementById('preview-refresh');
  const elTitle   = document.getElementById('preview-title');

  function toPreviewUrl(filePath) {
    // Strip leading slash so the path sits cleanly after /preview-dir/
    // Backslashes → forward slashes (Windows paths)
    const p = filePath.replace(/\\/g, '/').replace(/^\//, '');
    return API + '/preview-dir/' + p;
  }

  function open() {
    if (!state.filePath) return;
    elTitle.textContent = state.filePath.split(/[/\\]/).pop();
    elFrame.src = toPreviewUrl(state.filePath);
    elPanel.classList.remove('hidden');
    setStatus('Preview opened', 'ok');
  }

  function close() {
    elPanel.classList.add('hidden');
    elFrame.src = '';
  }

  function refresh() {
    if (!elPanel.classList.contains('hidden') && state.filePath) {
      elFrame.src = toPreviewUrl(state.filePath);
    }
  }

  function onFileOpen(path) {
    const isHtml = path && (path.endsWith('.html') || path.endsWith('.htm'));
    if (!isHtml && !elPanel.classList.contains('hidden')) close();
    else if (isHtml && !elPanel.classList.contains('hidden')) refresh();
  }

  elBtn.addEventListener('click', open);
  elClose.addEventListener('click', close);
  elRefresh.addEventListener('click', refresh);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
      e.preventDefault();
      elPanel.classList.contains('hidden') ? open() : close();
    }
    if (e.key === 'Escape' && !elPanel.classList.contains('hidden')) close();
  });

  // Chain after runner.js's onFileOpen (runner.js loads before this module)
  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => { prev?.(path); onFileOpen(path); };
})();
