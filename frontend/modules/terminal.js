// ── Terminal (multi-session + output tab) ─────────────────
// Ctrl+` → toggle. Multiple terminal sessions + Output as a tab.

(function () {
  const elPanel    = document.getElementById('term-panel');
  const elTabs     = document.getElementById('term-tabs');
  const elSessions = document.getElementById('term-sessions');
  const elClose    = document.getElementById('term-close');
  const elClear    = document.getElementById('term-clear');
  const elNewBtn   = document.getElementById('term-new-btn');
  const elOutPane  = document.getElementById('output-pane');

  let sessions    = [];
  let activeTabId = null;
  let sessCounter = 0;

  // ── Tab helpers ───────────────────────────────────────────
  let outTabBtn; // reference to output tab button (for unread dot)

  function makeTabBtn(id, label, closeable) {
    const btn = document.createElement('button');
    btn.className = 'term-tab';
    btn.dataset.tab = id;
    const lbl = document.createElement('span');
    lbl.className = 'term-tab-lbl';
    lbl.textContent = label;
    btn.appendChild(lbl);
    if (closeable) {
      const x = document.createElement('span');
      x.className = 'term-tab-x';
      x.textContent = '×';
      x.addEventListener('mousedown', e => { e.stopPropagation(); removeSession(id); });
      btn.appendChild(x);
    }
    btn.addEventListener('click', () => switchTab(id));
    return btn;
  }

  function switchTab(id) {
    activeTabId = id;
    elTabs.querySelectorAll('.term-tab').forEach(b =>
      b.classList.toggle('term-tab-active', b.dataset.tab === id)
    );
    elOutPane.classList.toggle('hidden', id !== 'output');
    for (const s of sessions) s.pane.classList.toggle('hidden', s.id !== id);

    if (id === 'output') {
      outTabBtn?.classList.remove('term-tab-dot');
    } else {
      const s = sessions.find(s => s.id === id);
      if (s) s.input.focus();
    }
  }

  // ── Session management ────────────────────────────────────
  function createSession() {
    sessCounter++;
    const id    = 'term-' + sessCounter;
    const label = 'Terminal ' + sessCounter;

    const pane = document.createElement('div');
    pane.className = 'term-pane hidden';

    const body = document.createElement('div');
    body.className = 'term-body';

    const inputRow = document.createElement('div');
    inputRow.className = 'term-input-row';

    const prompt = document.createElement('span');
    prompt.className = 'term-prompt';
    if (sessCounter === 1) prompt.id = 'term-prompt';
    prompt.textContent = '$';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'term-session-input';
    if (sessCounter === 1) input.id = 'term-input';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = 'Enter command…';

    inputRow.append(prompt, input);
    pane.append(body, inputRow);
    elSessions.appendChild(pane);

    const sess = { id, label, pane, body, input, prompt,
      history: [], histIdx: -1,
      cwd: state.folder || null,
      procId: null, abort: null };

    sessions.push(sess);
    wireInput(sess);
    updatePrompt(sess);

    const btn = makeTabBtn(id, label, true);
    elTabs.insertBefore(btn, outTabBtn); // terminals before output tab
    return sess;
  }

  function removeSession(id) {
    const idx = sessions.findIndex(s => s.id === id);
    if (idx < 0) return;
    const sess = sessions[idx];
    sess.abort?.abort();
    sess.pane.remove();
    elTabs.querySelector(`[data-tab="${id}"]`)?.remove();
    sessions.splice(idx, 1);
    if (activeTabId === id) {
      const next = sessions[idx] || sessions[idx - 1];
      switchTab(next ? next.id : 'output');
    }
  }

  // ── Panel open/close/toggle ───────────────────────────────
  function open(tabId) {
    elPanel.classList.remove('hidden');
    if (sessions.length === 0) {
      const s = createSession();
      switchTab(tabId || s.id);
    } else {
      switchTab(tabId || activeTabId || sessions[0].id);
    }
  }

  function close() { elPanel.classList.add('hidden'); }
  function toggle() { elPanel.classList.contains('hidden') ? open() : close(); }

  // ── Prompt ────────────────────────────────────────────────
  function updatePrompt(sess) {
    if (sess.procId) { sess.prompt.textContent = '›'; return; }
    if (!sess.cwd)   { sess.prompt.textContent = '$'; return; }
    const parts = sess.cwd.replace(/\\/g, '/').split('/');
    sess.prompt.textContent = parts[parts.length - 1] + ' $';
  }

  // ── Path helpers ──────────────────────────────────────────
  function resolvePath(base, target) {
    const sep = base.includes('\\') ? '\\' : '/';
    if (/^[A-Za-z]:[/\\]/.test(target) || target.startsWith('/')) return target;
    const parts  = base.replace(/[/\\]/g, '/').split('/');
    const tparts = target.replace(/\\/g, '/').split('/');
    for (const p of tparts) {
      if (p === '..') parts.pop();
      else if (p && p !== '.') parts.push(p);
    }
    return parts.join(sep);
  }

  // ── Output helpers ────────────────────────────────────────
  function appendLine(sess, text, cls) {
    String(text).split('\n').forEach(line => {
      const el = document.createElement('div');
      el.className = 'term-line ' + cls;
      el.textContent = line;
      sess.body.appendChild(el);
    });
    sess.body.scrollTop = sess.body.scrollHeight;
  }

  function appendCmd(sess, label, text) {
    const el = document.createElement('div');
    el.className = 'term-line term-cmd';
    el.textContent = label + ' ' + text;
    sess.body.appendChild(el);
    sess.body.scrollTop = sess.body.scrollHeight;
  }

  // ── Run command ───────────────────────────────────────────
  async function run(sess, cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    sess.history.unshift(trimmed);
    if (sess.history.length > 200) sess.history.pop();
    sess.histIdx = -1;

    appendCmd(sess, sess.prompt.textContent, trimmed);

    if (trimmed === 'cls' || trimmed === 'clear') { sess.body.innerHTML = ''; return; }

    if (/^cd(\s|$)/.test(trimmed)) {
      const target = trimmed.slice(2).trim();
      sess.cwd = (!target || target === '~')
        ? (state.folder || sess.cwd)
        : resolvePath(sess.cwd || state.folder || '', target);
      updatePrompt(sess);
      return;
    }

    const procId = Math.random().toString(36).slice(2);
    sess.procId = procId;
    sess.abort  = new AbortController();
    updatePrompt(sess);

    try {
      const res = await fetch('http://localhost:7654/shell', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ Cmd: trimmed, Cwd: sess.cwd || state.folder || '', ID: procId }),
        signal:  sess.abort.signal,
      });

      if (!res.ok) { appendLine(sess, 'Error: ' + await res.text(), 'term-err'); return; }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const raw of lines) {
          if (!raw.startsWith('data: ')) continue;
          let evt; try { evt = JSON.parse(raw.slice(6)); } catch { continue; }
          if      (evt.type === 'stdout') appendLine(sess, evt.text, 'term-stdout');
          else if (evt.type === 'stderr') appendLine(sess, evt.text, 'term-stderr');
          else if (evt.type === 'error')  appendLine(sess, evt.text, 'term-err');
          else if (evt.type === 'done')   {
            if (evt.exitCode !== 0) appendLine(sess, 'Exit ' + evt.exitCode, 'term-err');
            break;
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') appendLine(sess, 'Error: ' + err.message, 'term-err');
    } finally {
      sess.procId = null;
      sess.abort  = null;
      updatePrompt(sess);
      refreshTree();
    }
  }

  async function sendStdin(sess, text) {
    if (!sess.procId) return;
    appendCmd(sess, '›', text);
    try {
      await fetch('http://localhost:7654/shell/stdin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ID: sess.procId, Input: text }),
      });
    } catch {}
  }

  // ── Wire input to session ─────────────────────────────────
  function wireInput(sess) {
    sess.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = sess.input.value;
        sess.input.value = '';
        if (sess.procId) sendStdin(sess, val);
        else run(sess, val);
      } else if (e.key === 'ArrowUp' && !sess.procId) {
        e.preventDefault();
        if (sess.histIdx < sess.history.length - 1) {
          sess.histIdx++;
          sess.input.value = sess.history[sess.histIdx];
          sess.input.setSelectionRange(sess.input.value.length, sess.input.value.length);
        }
      } else if (e.key === 'ArrowDown' && !sess.procId) {
        e.preventDefault();
        if (sess.histIdx > 0) { sess.histIdx--; sess.input.value = sess.history[sess.histIdx]; }
        else { sess.histIdx = -1; sess.input.value = ''; }
      } else if (e.key === 'c' && e.ctrlKey && sess.procId) {
        e.preventDefault();
        sess.abort?.abort();
        appendLine(sess, '^C', 'term-err');
      }
    });
  }

  // ── Tree refresh ──────────────────────────────────────────
  async function refreshTree() {
    if (window.sane?.refreshTree) { await window.sane.refreshTree(); return; }
    if (!state.folder) return;
    try {
      const res   = await apiFetch('/files?path=' + encodeURIComponent(state.folder));
      const nodes = await res.json();
      renderTree(nodes || []);
    } catch {}
  }

  // ── Clear active pane ─────────────────────────────────────
  elClear.addEventListener('click', () => {
    if (activeTabId === 'output') {
      document.getElementById('output-body').innerHTML = '';
    } else {
      sessions.find(s => s.id === activeTabId)?.body && (sessions.find(s => s.id === activeTabId).body.innerHTML = '');
    }
  });

  elClose.addEventListener('click', close);

  elNewBtn.addEventListener('click', () => {
    const s = createSession();
    switchTab(s.id);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'Backquote') {
      e.preventDefault();
      toggle();
    }
  });

  // ── Init: output tab button first ────────────────────────
  outTabBtn = makeTabBtn('output', '▶ Output', false);
  elTabs.appendChild(outTabBtn);

  // Create first terminal
  const first = createSession();
  switchTab(first.id);

  // ── Public API ────────────────────────────────────────────
  window.sane = window.sane || {};

  window.sane.showOutputTab = function () {
    if (elPanel.classList.contains('hidden')) elPanel.classList.remove('hidden');
    switchTab('output');
    // dot indicator removed on switch, so nothing extra needed
  };

  window.sane.focusTerminal = function () {
    open(sessions[0]?.id);
  };

  window.sane.runInTerminal = function (cmd) {
    if (elPanel.classList.contains('hidden')) elPanel.classList.remove('hidden');
    const sess = sessions[0] || createSession();
    switchTab(sess.id);
    setTimeout(() => run(sess, cmd), 30);
  };
})();
