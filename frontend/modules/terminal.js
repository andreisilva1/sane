// ── Terminal (feature_reintroduction_terminal_v1) ─────────
// Depends on globals: state, apiFetch, setStatus
// Ctrl+` → toggle terminal panel; runs shell commands via /shell

(function () {
  const elPanel  = document.getElementById('term-panel');
  const elBody   = document.getElementById('term-body');
  const elInput  = document.getElementById('term-input');
  const elPrompt = document.getElementById('term-prompt');
  const elClose  = document.getElementById('term-close');
  const elClear  = document.getElementById('term-clear');

  let history = [];
  let histIdx = -1;
  let cwd     = null;   // tracks current working directory

  // ── Open / close ──────────────────────────────────────────
  function open() {
    elPanel.classList.remove('hidden');
    elInput.focus();
    if (cwd === null) cwd = state.folder || null;
    updatePrompt();
  }

  function close() {
    elPanel.classList.add('hidden');
  }

  function toggle() {
    if (elPanel.classList.contains('hidden')) open(); else close();
  }

  function updatePrompt() {
    if (!cwd) { elPrompt.textContent = '$'; return; }
    const parts = cwd.replace(/\\/g, '/').split('/');
    elPrompt.textContent = parts[parts.length - 1] + ' $';
  }

  // ── Output ────────────────────────────────────────────────
  function appendLine(text, cls) {
    const lines = String(text).split('\n');
    for (const line of lines) {
      if (line === '' && lines.length > 1 && line === lines[lines.length - 1]) break;
      const el = document.createElement('div');
      el.className = 'term-line ' + cls;
      el.textContent = line;
      elBody.appendChild(el);
    }
    elBody.scrollTop = elBody.scrollHeight;
  }

  function appendCmd(cmd) {
    const el = document.createElement('div');
    el.className = 'term-line term-cmd';
    const prompt = elPrompt.textContent;
    el.textContent = prompt + ' ' + cmd;
    elBody.appendChild(el);
    elBody.scrollTop = elBody.scrollHeight;
  }

  // ── Run command ───────────────────────────────────────────
  async function run(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    history.unshift(trimmed);
    if (history.length > 200) history.pop();
    histIdx = -1;

    appendCmd(trimmed);
    elInput.value = '';
    elInput.disabled = true;

    // Handle cls / clear locally
    if (trimmed === 'cls' || trimmed === 'clear') {
      elBody.innerHTML = '';
      elInput.disabled = false;
      elInput.focus();
      return;
    }

    // Handle `cd` locally
    if (/^cd(\s|$)/.test(trimmed)) {
      const target = trimmed.slice(2).trim();
      if (!target || target === '~') {
        cwd = state.folder || cwd;
      } else {
        cwd = resolvePath(cwd || state.folder || '', target);
      }
      updatePrompt();
      elInput.disabled = false;
      elInput.focus();
      return;
    }

    try {
      const res  = await apiFetch('/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Cmd: trimmed, Cwd: cwd || state.folder || '' }),
      });
      const data = await res.json();

      if (data.stdout) appendLine(data.stdout.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, ''), 'term-stdout');
      if (data.stderr) appendLine(data.stderr.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, ''), 'term-stderr');

      if (data.exitCode !== 0) {
        appendLine('Exit ' + data.exitCode, 'term-err');
      }
    } catch (err) {
      appendLine('Error: ' + err.message, 'term-err');
    }

    elInput.disabled = false;
    elInput.focus();
    refreshTree();
  }

  async function refreshTree() {
    if (!state.folder) return;
    try {
      const res   = await apiFetch('/files?path=' + encodeURIComponent(state.folder));
      const nodes = await res.json();
      renderTree(nodes || []);
    } catch {}
  }

  function resolvePath(base, target) {
    const sep = base.includes('\\') ? '\\' : '/';
    if (target.match(/^[A-Za-z]:[/\\]/) || target.startsWith('/')) return target;
    const parts = base.replace(/[/\\]/g, '/').split('/');
    const tparts = target.replace(/\\/g, '/').split('/');
    for (const p of tparts) {
      if (p === '..') parts.pop();
      else if (p && p !== '.') parts.push(p);
    }
    return parts.join(sep);
  }

  // ── Events ────────────────────────────────────────────────
  elInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run(elInput.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx < history.length - 1) {
        histIdx++;
        elInput.value = history[histIdx];
        elInput.setSelectionRange(elInput.value.length, elInput.value.length);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx > 0) {
        histIdx--;
        elInput.value = history[histIdx];
      } else {
        histIdx = -1;
        elInput.value = '';
      }
    }
  });

  elClose.addEventListener('click', close);
  elClear.addEventListener('click', () => { elBody.innerHTML = ''; });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'Backquote') {
      e.preventDefault();
      toggle();
    }
  });

  // Reset cwd when folder changes
  const _prevOpen = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (_prevOpen) _prevOpen(path);
  };
})();
