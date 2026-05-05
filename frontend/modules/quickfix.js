(function () {
  const elEditor = document.getElementById('editor');
  const elArea   = document.getElementById('editor-area');

  // ── Fix button element ────────────────────────────────────
  const elBtn = document.createElement('button');
  elBtn.id = 'qf-btn';
  elBtn.classList.add('hidden');
  elArea.appendChild(elBtn);

  let pendingFix = null;

  // ── Position ──────────────────────────────────────────────
  function position(errorLine) {
    if (!errorLine) return;
    const s      = getComputedStyle(elEditor);
    const lh     = parseFloat(s.lineHeight) || 22;
    const padTop = parseFloat(s.paddingTop)  || 16;
    const top    = padTop + errorLine * lh - elEditor.scrollTop;  // below the error line
    elBtn.style.top = (top + 2) + 'px';
  }

  elEditor.addEventListener('scroll', () => {
    if (pendingFix) position(pendingFix.line);
  });

  elEditor.addEventListener('input', () => {
    if (!pendingFix) return;
    const text    = elEditor.value.slice(0, elEditor.selectionStart);
    const curLine = text.split('\n').length;
    if (curLine === pendingFix.line) hide();
  });

  // ── Fix handlers ──────────────────────────────────────────
  async function applyFix() {
    if (!pendingFix) return;
    const { type, line, data } = pendingFix;

    if (type === 'pip') {
      const mod = data.module;
      elBtn.disabled = true;
      elBtn.textContent = 'Installing…';
      try {
        const res = await apiFetch('/shell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Cmd: 'pip install ' + mod, Cwd: state.folder || '' }),
        });
        const result = await res.json();
        if (result.exitCode === 0) {
          setStatus('Installed ' + mod, 'ok');
        } else {
          setStatus('pip install failed — check terminal', 'err');
        }
      } catch (err) {
        setStatus('pip error: ' + err.message, 'err');
      }
      hide();
      document.dispatchEvent(new CustomEvent('sane:clearerror'));
      return;
    }

    if (type === 'colon') {
      const lines = elEditor.value.split('\n');
      const idx   = line - 1;
      if (lines[idx] !== undefined) {
        lines[idx] = lines[idx].replace(/\s*$/, '') + ':';
        window.sane.history?.push();
        elEditor.value = lines.join('\n');
        elEditor.dispatchEvent(new Event('input'));
        setStatus('Added missing colon on line ' + line, 'ok');
      }
      hide();
      document.dispatchEvent(new CustomEvent('sane:clearerror'));
      return;
    }

    if (type === 'indent') {
      const lines = elEditor.value.split('\n');
      const idx   = line - 1;
      if (lines[idx] !== undefined) {
        lines[idx] = '    ' + lines[idx];
        window.sane.history?.push();
        elEditor.value = lines.join('\n');
        elEditor.dispatchEvent(new Event('input'));
        setStatus('Fixed indentation on line ' + line, 'ok');
      }
      hide();
      document.dispatchEvent(new CustomEvent('sane:clearerror'));
      return;
    }
  }

  elBtn.addEventListener('click', applyFix);

  function show(fix) {
    pendingFix = fix;
    elBtn.disabled = false;

    if (fix.type === 'pip')    elBtn.textContent = 'pip install ' + fix.data.module;
    if (fix.type === 'colon')  elBtn.textContent = 'Add missing \':\'';
    if (fix.type === 'indent') elBtn.textContent = 'Fix indentation';

    elBtn.classList.remove('hidden');
    position(fix.line);
  }

  function hide() {
    pendingFix = null;
    elBtn.classList.add('hidden');
  }

  // ── Error detection ───────────────────────────────────────
  function detect(stderr, filePath) {
    const lines = stderr.split('\n');
    const norm  = p => p.replace(/\\/g, '/').toLowerCase();
    const fileRe = /^\s*File "(.+?)", line (\d+)/;

    // Find last matching traceback line
    let errorLine = null;
    for (const l of lines) {
      const m = l.match(fileRe);
      if (m && (!filePath || norm(m[1]) === norm(filePath))) {
        errorLine = parseInt(m[2], 10);
      }
    }

    // Last non-empty line = error message
    let msg = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim()) { msg = lines[i].trim(); break; }
    }

    // ModuleNotFoundError / ImportError
    const modMatch = msg.match(/(?:ModuleNotFoundError|ImportError).*No module named '([^']+)'/);
    if (modMatch) {
      return { type: 'pip', line: errorLine, data: { module: modMatch[1].split('.')[0] } };
    }

    if (!errorLine) return null;

    // SyntaxError: expected ':'
    if (/SyntaxError.*expected\s*':'/.test(msg)) {
      return { type: 'colon', line: errorLine, data: {} };
    }

    // Heuristic: line ends with a block keyword but no colon
    const src = elEditor.value.split('\n')[errorLine - 1] || '';
    if (/^\s*(def|class|if|elif|else|for|while|try|except|finally|with|async\s+def|async\s+for|async\s+with)\b.*[^:]\s*$/.test(src)) {
      if (/SyntaxError/.test(msg)) {
        return { type: 'colon', line: errorLine, data: {} };
      }
    }

    // IndentationError
    if (/IndentationError/.test(msg)) {
      return { type: 'indent', line: errorLine, data: {} };
    }

    return null;
  }

  // ── Listen for run end ────────────────────────────────────
  document.addEventListener('sane:runend', (e) => {
    const { stderr, exitCode, filePath } = e.detail;
    if (exitCode === 0 || !stderr.trim()) { hide(); return; }
    const fix = detect(stderr, filePath);
    if (fix) show(fix); else hide();
  });

  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    hide();
  };
})();
