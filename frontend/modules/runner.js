(function () {
  const elBtnRun    = document.getElementById('btn-run');
  const elBtnStop   = document.getElementById('btn-run-stop');
  const elBtnTrace  = document.getElementById('btn-trace');
  const elOutput    = document.getElementById('output-body');
  const elVenvInfo  = document.getElementById('output-venv');   // post-run info label
  const elVenvBtn   = document.getElementById('venv-btn');      // header selector button
  const elElapsed   = document.getElementById('output-elapsed');
  const elStdinRow  = document.getElementById('output-stdin-row');
  const elStdinInput= document.getElementById('output-stdin');

  let runAbort   = null;
  let runTimer   = null;
  let runSessId  = null;

  // ── Venv selector ─────────────────────────────────────────
  const VENV_KEY = () => 'sane_venv_' + (state.folder || '');
  let venvOptions  = [];   // [{name, python}]
  let selectedVenv = '';   // python path; '' = auto

  function venvLabel(python) {
    if (!python) return '';
    const parts = python.replace(/\\/g, '/').split('/');
    const si = parts.findIndex(p => p === 'Scripts' || p === 'bin');
    return si > 0 ? parts[si - 1] : 'venv';
  }

  function renderVenvBtn() {
    const isPy = state.filePath?.endsWith('.py');
    if (!isPy || venvOptions.length <= 1) {
      elVenvBtn.classList.add('hidden');
      return;
    }
    const label = selectedVenv ? venvLabel(selectedVenv) : (venvOptions[0]?.name || 'auto');
    elVenvBtn.textContent = label + ' ▾';
    elVenvBtn.classList.remove('hidden');
  }

  async function loadVenvs() {
    if (!state.folder) return;
    try {
      const res = await apiFetch('/pyenv/list?root=' + encodeURIComponent(state.folder));
      venvOptions = await res.json();
      selectedVenv = localStorage.getItem(VENV_KEY()) || '';
      // Validate stored path still exists in the list
      if (selectedVenv && !venvOptions.find(v => v.python === selectedVenv)) {
        selectedVenv = '';
        localStorage.removeItem(VENV_KEY());
      }
      renderVenvBtn();
    } catch {}
  }

  // ── Venv picker dropdown ──────────────────────────────────
  const picker = document.createElement('div');
  picker.id = 'venv-picker';
  picker.className = 'hidden';
  document.body.appendChild(picker);

  function openPicker() {
    picker.innerHTML = venvOptions.map(v => {
      const active = (selectedVenv === v.python) || (!selectedVenv && v === venvOptions[0]);
      return `<div class="venv-option${active ? ' venv-active' : ''}" data-python="${v.python}">${v.name}</div>`;
    }).join('');

    const rect = elVenvBtn.getBoundingClientRect();
    picker.style.left = rect.left + 'px';
    picker.style.top  = (rect.bottom + 4) + 'px';
    picker.classList.remove('hidden');

    picker.querySelectorAll('.venv-option').forEach(el => {
      el.addEventListener('click', () => {
        const python = el.dataset.python;
        selectedVenv = (python === 'python' && venvOptions.findIndex(v => v.python === python) === venvOptions.length - 1 && venvOptions.length > 1)
          ? '' : python;
        if (selectedVenv) localStorage.setItem(VENV_KEY(), selectedVenv);
        else localStorage.removeItem(VENV_KEY());
        renderVenvBtn();
        picker.classList.add('hidden');
      });
    });
  }

  elVenvBtn.addEventListener('click', () => {
    picker.classList.contains('hidden') ? openPicker() : picker.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!picker.classList.contains('hidden') && !picker.contains(e.target) && e.target !== elVenvBtn) {
      picker.classList.add('hidden');
    }
  });

  // ── Show/hide Run / Trace buttons based on language registry ─
  function extOf(path) {
    if (!path) return '';
    const dot   = path.lastIndexOf('.');
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return dot > slash ? path.slice(dot).toLowerCase() : '';
  }

  function onFileOpen(path) {
    const lang = window.sane.langs?.[extOf(path)];
    elBtnRun.classList.toggle('hidden',   !lang?.canRun);
    elBtnTrace.classList.toggle('hidden', !lang?.canTrace);
    if (path?.endsWith('.py')) loadVenvs();
    else { venvOptions = []; selectedVenv = ''; renderVenvBtn(); }
  }

  // ── Run ──────────────────────────────────────────────────
  async function run() {
    if (!state.filePath) return;

    // Auto-save before run
    if (state.dirty) {
      await saveFile();
    }

    // Clear output and switch to output tab
    elOutput.textContent    = '';
    elVenvInfo.textContent  = '';
    elElapsed.textContent   = '';
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
        body: JSON.stringify({ Path: state.filePath, Root: state.folder || '', ID: runSessId, ...(selectedVenv ? { Venv: selectedVenv } : {}) }),
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

          if (evt.type === 'info')   { elVenvInfo.textContent = evt.venv ? '(' + evt.venv + ')' : ''; }
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
    if (runSessId) {
      fetch(API + '/run/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ID: runSessId }),
      }).catch(() => {});
    }
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
  document.addEventListener('sane:folder-loaded', () => {
    venvOptions = []; selectedVenv = ''; renderVenvBtn();
  });

  window.sane = window.sane || {};
  window.sane.onFileOpen = onFileOpen;
  window.sane.getSelectedVenv = () => selectedVenv;
})();
