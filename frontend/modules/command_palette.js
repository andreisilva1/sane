// ── Command Palette ───────────────────────────────────────
// Ctrl+Shift+P → open palette, type to filter, Enter to run
// Deps: state, window.sane, openFile, setStatus

(function () {
  const elOverlay = document.getElementById('cp-overlay');
  const elInput   = document.getElementById('cp-input');
  const elList    = document.getElementById('cp-list');

  let selected = 0;

  // ── Helper: simulate a key event on document ──────────────
  function key(k, ctrl = false, shift = false, alt = false) {
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: k, ctrlKey: ctrl, shiftKey: shift, altKey: alt, bubbles: true, cancelable: true }
    ));
  }

  function focusTree() {
    document.getElementById('sidebar').classList.remove('collapsed');
    const first = document.querySelector('#file-tree .tree-item');
    if (first) { first.focus(); return; }
    document.getElementById('file-tree').focus();
  }

  function focusTerminal() {
    if (window.sane?.focusTerminal) { window.sane.focusTerminal(); return; }
    const panel = document.getElementById('term-panel');
    if (panel.classList.contains('hidden')) key('`', true);
    else document.getElementById('term-input')?.focus();
  }

  // ── Command registry ──────────────────────────────────────
  const CMDS = [
    { label: 'Open Folder',          icon: '⊕',  keys: '',             action: () => document.getElementById('btn-open').click() },
    { label: 'Save File',            icon: '↓',  keys: 'Ctrl+S',       action: () => { if (!document.getElementById('btn-save').disabled) document.getElementById('btn-save').click(); } },
    { label: 'Run File',             icon: '▶',  keys: 'Ctrl+Enter',   action: () => key('Enter', true) },
    { label: 'Trace Execution',      icon: '⏱',  keys: '',             action: () => window.sane?.runTrace?.(state.filePath) },
    { label: 'Preview HTML',         icon: '◧',  keys: 'Ctrl+Shift+V', action: () => key('V', true, true) },
    { label: 'Toggle Sidebar',       icon: '⊟',  keys: 'Ctrl+B',       action: () => document.getElementById('btn-sidebar').click() },
    { label: 'Toggle Terminal',      icon: '>_', keys: 'Ctrl+`',       action: () => key('`', true) },
    { label: 'Toggle AI Panel',      icon: '✦',  keys: 'Ctrl+Shift+A', action: () => { window.sane?.aiOpenPanel?.() ?? key('A', true, true); } },
    { label: 'Project Builder',      icon: '⬡',  keys: 'Ctrl+Shift+B', action: () => window.sane?.aiEnterPBMode?.() },
    { label: 'Quick Open File',      icon: '⚡',  keys: 'Ctrl+P',       action: () => key('p', true) },
    { label: 'Search in Files',      icon: '🔍', keys: 'Ctrl+Shift+F', action: () => key('F', true, true) },
    { label: 'AI Refactor',          icon: '✦',  keys: 'Ctrl+Shift+I', action: () => key('I', true, true) },
    { label: 'Extract Function',     icon: '⤴',  keys: 'Ctrl+Shift+E', action: () => key('E', true, true) },
    { label: 'Inline Variable',      icon: '⤵',  keys: 'Ctrl+Shift+L', action: () => key('L', true, true) },
    { label: 'Rename Symbol',        icon: '✎',  keys: 'F2',           action: () => key('F2') },
    { label: 'Go to Definition',     icon: '→',  keys: 'F12',          action: () => key('F12') },
    { label: 'Find References',      icon: '⇒',  keys: 'Shift+F12',    action: () => key('F12', false, true) },
    { label: 'Project Context',      icon: '📌', keys: 'Ctrl+Shift+C', action: () => key('C', true, true) },
    { label: 'Project Memory',       icon: '🗒', keys: 'Ctrl+Shift+M', action: () => key('M', true, true) },
    { label: 'Change Theme',         icon: '🎨', keys: 'Ctrl+,',       action: () => key(',', true) },
    { label: 'Keyboard Shortcuts',   icon: '?',  keys: '',             action: () => document.getElementById('btn-shortcuts').click() },
    { label: 'Focus Editor',         icon: '✏',  keys: 'Ctrl+1',       action: () => document.getElementById('editor').focus() },
    { label: 'Focus File Explorer',  icon: '📂', keys: 'Ctrl+2',       action: focusTree },
    { label: 'Focus Terminal',       icon: '>_', keys: 'Ctrl+3',       action: focusTerminal },
  ];

  // ── Filter + render ───────────────────────────────────────
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function highlight(text, q) {
    if (!q) return esc(text);
    const lo = text.toLowerCase(), qlo = q.toLowerCase();
    const idx = lo.indexOf(qlo);
    if (idx >= 0) {
      return esc(text.slice(0, idx))
           + '<mark>' + esc(text.slice(idx, idx + qlo.length)) + '</mark>'
           + esc(text.slice(idx + qlo.length));
    }
    return esc(text);
  }

  function getFiltered() {
    const q = elInput.value.trim().toLowerCase();
    if (!q) return CMDS;
    return CMDS.filter(c => c.label.toLowerCase().includes(q));
  }

  function render() {
    const list = getFiltered();
    elList.innerHTML = '';
    list.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'cp-item' + (i === 0 ? ' cp-selected' : '');
      el.dataset.idx = i;
      el.innerHTML =
        `<span class="cp-icon">${esc(c.icon)}</span>` +
        `<span class="cp-label">${highlight(c.label, elInput.value.trim())}</span>` +
        (c.keys ? `<span class="cp-key">${esc(c.keys)}</span>` : '');
      el.addEventListener('mousedown', e => { e.preventDefault(); pick(i, list); });
      el.addEventListener('mousemove', () => setSelected(i));
      elList.appendChild(el);
    });
    selected = 0;
  }

  function setSelected(idx) {
    const items = elList.querySelectorAll('.cp-item');
    items.forEach((el, i) => el.classList.toggle('cp-selected', i === idx));
    selected = idx;
    items[idx]?.scrollIntoView({ block: 'nearest' });
  }

  function pick(idx, list) {
    const cmd = list[idx];
    if (!cmd) return;
    close();
    setTimeout(() => cmd.action(), 30);
  }

  // ── Open / close ──────────────────────────────────────────
  function open() {
    elInput.value = '';
    render();
    elOverlay.classList.remove('hidden');
    elInput.focus();
  }

  function close() { elOverlay.classList.add('hidden'); }

  // ── Keyboard ──────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Ctrl+Shift+P → open/close
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      elOverlay.classList.contains('hidden') ? open() : close();
      return;
    }

    // Ctrl+1 / 2 / 3 — panel focus
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (e.key === '1') { e.preventDefault(); document.getElementById('editor').focus(); return; }
      if (e.key === '2') { e.preventDefault(); focusTree(); return; }
      if (e.key === '3') { e.preventDefault(); focusTerminal(); return; }
    }

    // Ctrl+B → toggle sidebar
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'b') {
      e.preventDefault();
      document.getElementById('btn-sidebar').click();
      return;
    }

    if (elOverlay.classList.contains('hidden')) return;

    const list = getFiltered();
    const count = list.length;
    if (e.key === 'Escape')    { e.preventDefault(); close(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(Math.min(selected + 1, count - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(Math.max(selected - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(selected, list); }
  });

  elInput.addEventListener('input', () => { render(); selected = 0; });
  elOverlay.addEventListener('mousedown', e => { if (e.target === elOverlay) close(); });

  // Expose for other modules
  window.sane = window.sane || {};
  window.sane.openCommandPalette = open;
})();
