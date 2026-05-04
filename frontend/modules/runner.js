// ── Python Runner (feature_reintroduction_runner_v1) ──────
// Depends on: state, API, setStatus (globals from main.js)
// Adds:       #btn-run button visibility, #output-panel SSE output
// Hook:       main.js calls sane.onFileOpen(path) after each file open

(function () {
  const elBtnRun    = document.getElementById('btn-run');
  const elBtnStop   = document.getElementById('btn-run-stop');
  const elBtnTrace  = document.getElementById('btn-trace');
  const elOutput    = document.getElementById('output-body');
  const elVenv      = document.getElementById('output-venv');
  const elElapsed   = document.getElementById('output-elapsed');
  const elStdinRow  = document.getElementById('output-stdin-row');
  const elStdinInput= document.getElementById('output-stdin');

  let runAbort   = null;
  let runTimer   = null;
  let runSessId  = null;

  // ── Show/hide Run button based on file type ──────────────
  function onFileOpen(path) {
    const canRun = path && (path.endsWith('.py') || path.endsWith('.js'));
    elBtnRun.classList.toggle('hidden', !canRun);
  }

  // ── Run ──────────────────────────────────────────────────
  async function run() {
    if (!state.filePath) return;

    // Auto-save before run
    if (state.dirty) {
      await saveFile();
    }

    // Clear output and switch to output tab
    elOutput.textContent  = '';
    elVenv.textContent    = '';
    elElapsed.textContent = '';
    Object.keys(openLine).forEach(k => delete openLine[k]);
    document.getElementById('ri-bar')?.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('sane:runstart'));
    window.sane?.showOutputTab?.();

    // Set running state
    runSessId = Math.random().toString(36).slice(2);
    elBtnRun.disabled = true;
    elBtnStop.classList.remove('hidden');
    elStdinRow.classList.add('hidden');  // hidden until a prompt is detected
    elStdinInput.value = '';
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
        body: JSON.stringify({ Path: state.filePath, Root: state.folder || '', ID: runSessId }),
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
      let   buf       = '';
      let   stdoutBuf = '';
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
          if (evt.type === 'stdout') {
            stdoutBuf += evt.text;
            appendText('stdout', evt.text);
            // Show stdin row only when there's an open (unfinished) line — indicates a prompt
            const hasPrompt = !!openLine['stdout'];
            elStdinRow.classList.toggle('hidden', !hasPrompt);
            if (hasPrompt) elStdinInput.focus();
          }
          if (evt.type === 'stderr') { stderrBuf += evt.text + '\n'; appendText('stderr', evt.text + '\n'); }
          if (evt.type === 'error')  appendLine('error',  evt.text);
          if (evt.type === 'done') {
            const code = evt.exitCode;
            const ms   = evt.duration;
            appendLine('meta', '─── exited ' + code + ' · ' + ms + 'ms ───');
            setStatus(code === 0 ? 'Run finished' : 'Exited ' + code, code === 0 ? 'ok' : 'err');
            document.dispatchEvent(new CustomEvent('sane:runend', {
              detail: { stdout: stdoutBuf, stderr: stderrBuf, exitCode: code, filePath: state.filePath }
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
      runAbort  = null;
      runSessId = null;
      elBtnRun.disabled = false;
      elBtnStop.classList.add('hidden');
      elStdinRow.classList.add('hidden');
      elStdinInput.value = '';
    }
  }

  function stop() {
    if (runAbort) {
      runAbort.abort();
    }
  }

  // openLine tracks the current open <div> per stream type so partial
  // lines (e.g. input() prompts without \n) accumulate in the same element.
  const openLine = {};

  function appendText(type, text) {
    const segs = text.split('\n');
    for (let i = 0; i < segs.length; i++) {
      if (!openLine[type]) {
        const div = document.createElement('div');
        div.className = 'out-line out-' + type;
        elOutput.appendChild(div);
        openLine[type] = div;
      }
      openLine[type].textContent += segs[i];
      if (i < segs.length - 1) openLine[type] = null; // newline closes line
    }
    elOutput.scrollTop = elOutput.scrollHeight;
  }

  function appendLine(type, text) {
    openLine[type] = null;
    appendText(type, text + '\n');
  }

  // ── Send stdin to running process ─────────────────────────
  elStdinInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !runSessId) return;
    e.preventDefault();
    const text = elStdinInput.value;
    elStdinInput.value = '';
    elStdinRow.classList.add('hidden'); // hide until next prompt
    appendLine('meta', '› ' + text);
    try {
      await fetch(API + '/run/stdin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ID: runSessId, Input: text }),
      });
    } catch {}
  });

  // ── Wire buttons ─────────────────────────────────────────
  elBtnRun.addEventListener('click', run);
  elBtnStop.addEventListener('click', stop);
  elBtnTrace.addEventListener('click', () => window.sane.runTrace?.(state.filePath));

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
