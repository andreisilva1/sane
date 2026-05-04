// ── Error Insight (feature_reintroduction_error_insight_v1)
// Depends on: runner.js firing 'sane:runend', window.sane.onFileOpen
// Shows an inline error stripe + annotation when a Python run fails.

(function () {
  const elEditor = document.getElementById('editor');
  const elArea   = document.getElementById('editor-area');

  // ── Elements ──────────────────────────────────────────────
  const elStripe = document.createElement('div');
  elStripe.id = 'ei-stripe';
  elArea.appendChild(elStripe);

  const elNote = document.createElement('div');
  elNote.id = 'ei-note';
  elArea.appendChild(elNote);

  let errorLine = null; // 1-based

  // ── Layout helpers ────────────────────────────────────────
  function lineMetrics() {
    const s      = getComputedStyle(elEditor);
    const lh     = parseFloat(s.lineHeight) || 22;
    const padTop = parseFloat(s.paddingTop)  || 16;
    const padLeft= parseFloat(s.paddingLeft) || 20;
    return { lh, padTop, padLeft };
  }

  function positionElements() {
    if (!errorLine) return;
    const { lh, padTop } = lineMetrics();
    const top = padTop + (errorLine - 1) * lh - elEditor.scrollTop;

    elStripe.style.top    = top + 'px';
    elStripe.style.height = lh + 'px';

    elNote.style.top = (top + lh) + 'px';
  }

  // ── Parse traceback ───────────────────────────────────────
  function parseTraceback(stderr, filePath) {
    const lines     = stderr.split('\n');
    const fileRe    = /^\s*File "(.+?)", line (\d+)/;
    const norm      = p => p.replace(/\\/g, '/').toLowerCase();
    const targetNorm = filePath ? norm(filePath) : null;

    let matchedLine = null;

    for (const l of lines) {
      const m = l.match(fileRe);
      if (!m) continue;
      const candidateLine = parseInt(m[2], 10);
      // Accept if it matches the open file, or accept any if no file context
      if (!targetNorm || norm(m[1]) === targetNorm) {
        matchedLine = candidateLine;
      }
    }

    // Extract error message: last non-empty, non-traceback line
    let msg = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t && !t.startsWith('File ') && !t.startsWith('Traceback') && !t.startsWith('During handling')) {
        msg = t;
        break;
      }
    }

    return { line: matchedLine, msg };
  }

  // ── Show / clear ──────────────────────────────────────────
  function show(line, msg) {
    errorLine = line;
    elNote.textContent = msg;
    elStripe.classList.remove('hidden');
    elNote.classList.remove('hidden');
    positionElements();
  }

  function clear() {
    errorLine = null;
    elStripe.classList.add('hidden');
    elNote.classList.add('hidden');
  }

  // ── Events ────────────────────────────────────────────────
  elEditor.addEventListener('scroll', positionElements);

  elEditor.addEventListener('input', () => {
    if (!errorLine) return;
    const text    = elEditor.value.slice(0, elEditor.selectionStart);
    const curLine = text.split('\n').length;
    if (curLine === errorLine) clear();
  });

  document.addEventListener('sane:clearerror', clear);

  document.addEventListener('sane:runend', (e) => {
    const { stderr, exitCode, filePath } = e.detail;
    if (exitCode === 0 || !stderr.trim()) { clear(); return; }

    const { line, msg } = parseTraceback(stderr, filePath);
    if (!line) { clear(); return; }

    show(line, msg);
  });

  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    clear();
  };

  clear();
})();
