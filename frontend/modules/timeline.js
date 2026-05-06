// ── Execution Timeline + Inline Output ───────────────────
// Triggered by ⏱ Trace button (runner.js wires it)
// GET /trace?path=... → array of steps → navigable panel + inline annotations

(function () {
  const elPanel     = document.getElementById('tl-panel');
  const elInfo      = document.getElementById('tl-info');
  const elPrev      = document.getElementById('tl-prev');
  const elNext      = document.getElementById('tl-next');
  const elClose     = document.getElementById('tl-close');
  const elLineLbl   = document.getElementById('tl-line');
  const elVars      = document.getElementById('tl-vars');
  const elOut       = document.getElementById('tl-out');
  const elEditor    = document.getElementById('editor');
  const elEditorArea= document.getElementById('editor-area');
  const elWarn      = document.getElementById('tl-warn');
  const elBtnTrace  = document.getElementById('btn-trace');

  // ── Line highlight overlay ────────────────────────────────
  const elLineHl = document.createElement('div');
  elLineHl.id = 'tl-line-hl';
  elEditorArea.appendChild(elLineHl);

  let steps      = [];
  let cur        = 0;
  let hlLine     = 0;
  let traceAbort = null;

  // ── Metrics ───────────────────────────────────────────────
  function getLineMetrics() {
    const cs    = getComputedStyle(elEditor);
    const lineH = parseFloat(cs.lineHeight);
    const padTop = parseFloat(cs.paddingTop);
    return { lineH, padTop };
  }

  // ── Line highlight ────────────────────────────────────────
  function updateHighlight() {
    if (!hlLine || elPanel.classList.contains('hidden')) {
      elLineHl.style.display = 'none';
    } else {
      const { lineH, padTop } = getLineMetrics();
      const top = padTop + (hlLine - 1) * lineH - elEditor.scrollTop;
      elLineHl.style.display = 'block';
      elLineHl.style.top     = top + 'px';
      elLineHl.style.height  = lineH + 'px';
    }
  }

  function scrollEditorToLine(lineNum) {
    const { lineH, padTop } = getLineMetrics();
    const lineTop = padTop + (lineNum - 1) * lineH;
    const lineBot = lineTop + lineH;
    if (lineTop < elEditor.scrollTop) {
      elEditor.scrollTop = lineTop - padTop;
    } else if (lineBot > elEditor.scrollTop + elEditor.clientHeight) {
      elEditor.scrollTop = lineBot - elEditor.clientHeight + padTop;
    }
  }

  elEditor.addEventListener('scroll', updateHighlight);

  // ── Button state ──────────────────────────────────────────
  function setBtn(mode) {
    if (mode === 'idle') {
      elBtnTrace.textContent = '⏱ Trace';
      elBtnTrace.classList.remove('tl-btn-active');
    } else if (mode === 'loading') {
      elBtnTrace.textContent = '◼ Cancel';
      elBtnTrace.classList.add('tl-btn-active');
    } else {
      elBtnTrace.textContent = '⏱ Close';
      elBtnTrace.classList.add('tl-btn-active');
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Render current step ───────────────────────────────────
  function render() {
    if (!steps.length) return;
    const s = steps[cur];

    elInfo.textContent = `Step ${cur + 1} / ${steps.length}`;
    elLineLbl.textContent = `Line ${s.n}`;

    const entries = Object.entries(s.v || {});
    elVars.innerHTML = entries.length
      ? entries.map(([k, v]) =>
          `<span class="tl-var"><span class="tl-vname">${esc(k)}</span>`+
          `<span class="tl-veq"> = </span>`+
          `<span class="tl-vval">${esc(v)}</span></span>`
        ).join('')
      : '<span class="tl-empty">no variables yet</span>';

    if (s.o) {
      elOut.textContent = s.o;
      elOut.classList.remove('tl-out-empty');
    } else {
      elOut.textContent = '(no output yet)';
      elOut.classList.add('tl-out-empty');
    }

    elPrev.disabled = cur === 0;
    elNext.disabled = cur === steps.length - 1;

    hlLine = s.n;
    scrollEditorToLine(s.n);
    updateHighlight();
  }

  function goto(idx) {
    cur = Math.max(0, Math.min(idx, steps.length - 1));
    render();
  }

  // ── Open / close ──────────────────────────────────────────
  function open(data) {
    steps = data.steps || [];
    cur   = 0;
    if (!steps.length) { setStatus('Trace produced no steps', ''); setBtn('idle'); return; }

    elWarn.classList.toggle('hidden', !data.truncated);
    elPanel.classList.remove('hidden');
    render();
    elPanel.focus();
    setBtn('open');
  }

  function close() {
    elPanel.classList.add('hidden');
    steps  = [];
    hlLine = 0;
    updateHighlight();
    setBtn('idle');
  }

  // ── Keyboard nav ──────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (elPanel.classList.contains('hidden') || !steps.length) return;

    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goto(ctrl ? cur - 10 : cur - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goto(ctrl ? cur + 10 : cur + 1); }
    if (e.key === 'Home')       { e.preventDefault(); goto(0); }
    if (e.key === 'End')        { e.preventDefault(); goto(steps.length - 1); }
    if (e.key === 'Escape')     { close(); }
  });

  elPrev.addEventListener('click', () => goto(cur - 1));
  elNext.addEventListener('click', () => goto(cur + 1));
  elClose.addEventListener('click', close);

  document.getElementById('tl-scrub')?.addEventListener('click', e => {
    const bar = e.currentTarget;
    const pct = e.offsetX / bar.offsetWidth;
    goto(Math.round(pct * (steps.length - 1)));
  });

  // ── Clear highlight on file switch ───────────────────────
  const _prevOpen = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = function (path) {
    _prevOpen?.(path);
    hlLine = 0;
    updateHighlight();
    // Also close panel if it was open for a different file
    if (!elPanel.classList.contains('hidden')) close();
  };

  // ── Entry point ───────────────────────────────────────────
  window.sane.runTrace = async function (filePath) {
    if (traceAbort) {
      traceAbort.abort();
      traceAbort = null;
      setBtn('idle');
      setStatus('Trace cancelled', '');
      return;
    }

    if (!elPanel.classList.contains('hidden')) {
      close();
      return;
    }

    if (!filePath || !filePath.endsWith('.py')) {
      setStatus('Timeline only works with Python files', '');
      return;
    }
    if (state.dirty) await saveFile();

    traceAbort = new AbortController();
    setBtn('loading');
    setStatus('Tracing…', 'info');

    try {
      const venv = window.sane.getSelectedVenv?.() || '';
      const traceUrl = '/trace?path=' + encodeURIComponent(filePath) + (venv ? '&python=' + encodeURIComponent(venv) : '');
      const res  = await apiFetch(traceUrl, { signal: traceAbort.signal });
      const data = await res.json();

      if (data.error) {
        setStatus('Trace error — check output panel', 'err');
        const out = document.getElementById('output-body');
        if (out) {
          const div = document.createElement('div');
          div.className = 'out-line out-stderr';
          div.textContent = data.error;
          out.appendChild(div);
          window.sane?.showOutputTab?.();
        }
      }

      if (!data.steps?.length) {
        setStatus('No trace steps — script may be too simple or errored immediately', '');
        setBtn('idle');
        return;
      }

      setStatus(data.truncated
        ? `Trace limited to ${data.steps.length} steps`
        : `Traced ${data.steps.length} steps`, 'ok');

      open(data);
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('Trace cancelled', '');
      } else {
        setStatus('Trace failed: ' + err.message, 'err');
      }
      setBtn('idle');
    } finally {
      traceAbort = null;
    }
  };
})();
