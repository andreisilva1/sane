// ── Python Runner (feature_reintroduction_runner_v1) ──────
// Depends on: state, API, setStatus (globals from main.js)
// Adds:       #btn-run button visibility, #output-panel SSE output
// Hook:       main.js calls sane.onFileOpen(path) after each file open

(function () {
  const elBtnRun   = document.getElementById('btn-run');
  const elBtnStop  = document.getElementById('btn-run-stop');
  const elOutput   = document.getElementById('output-body');
  const elPanel    = document.getElementById('output-panel');
  const elPanelClose = document.getElementById('output-close');
  const elVenv     = document.getElementById('output-venv');
  const elElapsed  = document.getElementById('output-elapsed');

  let runAbort = null;
  let runTimer = null;

  // ── Show/hide Run button based on file type ──────────────
  function onFileOpen(path) {
    const isPy = path && path.endsWith('.py');
    elBtnRun.classList.toggle('hidden', !isPy);
  }

  // ── Run ──────────────────────────────────────────────────
  async function run() {
    if (!state.filePath) return;

    // Auto-save before run
    if (state.dirty) {
      await saveFile();
    }

    // Clear output panel
    elOutput.textContent = '';
    elVenv.textContent   = '';
    elElapsed.textContent = '';
    elPanel.classList.remove('hidden');

    // Set running state
    elBtnRun.disabled  = true;
    elBtnStop.classList.remove('hidden');
    setStatus('Running…', 'info');
    console.log('[runner] Starting:', state.filePath);

    const startMs = Date.now();
    runTimer = setInterval(() => {
      elElapsed.textContent = ((Date.now() - startMs) / 1000).toFixed(1) + 's';
    }, 100);

    runAbort = new AbortController();

    try {
      const res = await fetch(API + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Path: state.filePath, Root: state.folder || '' }),
        signal: runAbort.signal,
      });

      if (!res.ok) {
        const txt = await res.text();
        appendLine('error', 'Backend error: ' + txt);
        return;
      }

      // Read SSE stream line by line
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';
      let   stderrBuf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete line

        for (const raw of lines) {
          if (!raw.startsWith('data: ')) continue;
          const payload = raw.slice(6).trim();
          if (!payload) continue;

          let evt;
          try { evt = JSON.parse(payload); } catch { continue; }

          if (evt.type === 'info')   { elVenv.textContent = evt.venv ? '(' + evt.venv + ')' : ''; }
          if (evt.type === 'stdout') appendLine('stdout', evt.text);
          if (evt.type === 'stderr') { stderrBuf += evt.text + '\n'; appendLine('stderr', evt.text); }
          if (evt.type === 'error')  appendLine('error',  evt.text);
          if (evt.type === 'done') {
            const code = evt.exitCode;
            const ms   = evt.duration;
            appendLine('meta', '─── exited ' + code + ' · ' + ms + 'ms ───');
            setStatus(code === 0 ? 'Run finished' : 'Exited ' + code, code === 0 ? 'ok' : 'err');
            document.dispatchEvent(new CustomEvent('sane:runend', {
              detail: { stderr: stderrBuf, exitCode: code, filePath: state.filePath }
            }));
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        appendLine('error', err.message);
        setStatus('Run error: ' + err.message, 'err');
        console.error('[runner] error', err);
      } else {
        appendLine('meta', '─── killed ───');
        setStatus('Killed', '');
      }
    } finally {
      clearInterval(runTimer);
      runAbort = null;
      elBtnRun.disabled = false;
      elBtnStop.classList.add('hidden');
    }
  }

  function stop() {
    if (runAbort) {
      runAbort.abort();
    }
  }

  function appendLine(type, text) {
    const line = document.createElement('div');
    line.className = 'out-line out-' + type;
    line.textContent = text;
    elOutput.appendChild(line);
    elOutput.scrollTop = elOutput.scrollHeight;
  }

  // ── Wire buttons ─────────────────────────────────────────
  elBtnRun.addEventListener('click', run);
  elBtnStop.addEventListener('click', stop);
  elPanelClose.addEventListener('click', () => elPanel.classList.add('hidden'));

  // Ctrl+Enter → run
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!elBtnRun.classList.contains('hidden') && !elBtnRun.disabled) run();
    }
  });

  // ── Register hook ─────────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.onFileOpen = onFileOpen;
})();
