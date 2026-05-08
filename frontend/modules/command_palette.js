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

  // ── Command registry (section → alphabetical) ────────────
  const SECTIONS = [
    {
      name: 'File',
      cmds: [
        { label: 'Open Folder',         icon: '⊕',  keys: '',             action: () => document.getElementById('btn-open').click() },
        { label: 'Quick Open File',     icon: '⚡',  keys: 'Ctrl+P',       action: () => key('p', true) },
        { label: 'Save File',           icon: '↓',  keys: 'Ctrl+S',       action: () => { if (!document.getElementById('btn-save').disabled) document.getElementById('btn-save').click(); } },
        { label: 'Search in Files',     icon: '🔍', keys: 'Ctrl+Shift+F', action: () => key('F', true, true) },
      ],
    },
    {
      name: 'Run',
      cmds: [
        { label: 'Preview HTML',        icon: '◧',  keys: 'Ctrl+Shift+V', action: () => key('V', true, true) },
        { label: 'Run File',            icon: '▶',  keys: 'Ctrl+Enter',   action: () => key('Enter', true) },
        { label: 'Trace Execution',     icon: '⏱',  keys: '',             action: () => window.sane?.runTrace?.(state.filePath) },
      ],
    },
    {
      name: 'Editor',
      cmds: [
        { label: 'Extract Function',    icon: '⤴',  keys: 'Ctrl+Shift+E', action: () => key('E', true, true) },
        { label: 'Find References',     icon: '⇒',  keys: 'Shift+F12',    action: () => key('F12', false, true) },
        { label: 'Go to Definition',    icon: '→',  keys: 'F12',          action: () => key('F12') },
        { label: 'Inline Variable',     icon: '⤵',  keys: 'Ctrl+Shift+L', action: () => key('L', true, true) },
        { label: 'Rename Symbol',       icon: '✎',  keys: 'F2',           action: () => key('F2') },
      ],
    },
    {
      name: 'AI',
      cmds: [
        { label: 'AI Refactor',         icon: '✦',  keys: 'Ctrl+Shift+I', action: () => key('I', true, true) },
        { label: 'Project Context',     icon: '📌', keys: 'Ctrl+Shift+C', action: () => key('C', true, true) },
        { label: 'Project Memory',      icon: '🗒', keys: 'Ctrl+Shift+M', action: () => key('M', true, true) },
        { label: 'Toggle AI Panel',     icon: '✦',  keys: 'Ctrl+Shift+A', action: () => { window.sane?.aiOpenPanel?.() ?? key('A', true, true); } },
      ],
    },
    {
      name: 'Git',
      cmds: [
        { label: 'Git: Commit',         icon: '↑',  keys: 'Ctrl+Shift+G', action: () => window.sane?.gitOpenCommit?.() },
        { label: 'Git: View Diff',      icon: '±',  keys: '',             action: () => { const p = state.filePath; if (p) window.sane?.gitShowDiff?.(p); } },
      ],
    },
    {
      name: 'Dev Toolkit',
      cmds: [
        { label: '.env Manager',        icon: '⚙',  keys: 'Ctrl+Shift+N', action: () => key('N', true, true) },
        { label: 'Activity Log',        icon: '📋', keys: 'Ctrl+Shift+J', action: () => key('J', true, true) },
        { label: 'DB Viewer',           icon: '⊞',  keys: 'Ctrl+Shift+D', action: () => window.sane?.openDBViewer?.() },
        { label: 'Dev Scheduler',       icon: '⏲',  keys: '',             action: () => window.sane?.openScheduler?.() },
        { label: 'HTTP Client',         icon: '⇄',  keys: 'Ctrl+Shift+H', action: () => key('H', true, true) },
      ],
    },
    {
      name: 'View',
      cmds: [
        { label: 'Change Theme',        icon: '🎨', keys: 'Ctrl+,',       action: () => key(',', true) },
        { label: 'Focus Editor',        icon: '✏',  keys: 'Ctrl+1',       action: () => document.getElementById('editor').focus() },
        { label: 'Focus File Explorer', icon: '📂', keys: 'Ctrl+2',       action: focusTree },
        { label: 'Focus Terminal',      icon: '>_', keys: 'Ctrl+3',       action: focusTerminal },
        { label: 'Keyboard Shortcuts',  icon: '?',  keys: '',             action: () => document.getElementById('btn-shortcuts').click() },
        { label: 'Toggle Sidebar',      icon: '⊟',  keys: 'Ctrl+B',       action: () => document.getElementById('btn-sidebar').click() },
        { label: 'Toggle Terminal',     icon: '>_', keys: 'Ctrl+`',       action: () => key('`', true) },
      ],
    },
  ];

  // Flat list for filtered search
  const CMDS = SECTIONS.flatMap(s => s.cmds);

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
    if (!q) return null; // null = use sectioned view
    return CMDS.filter(c => c.label.toLowerCase().includes(q));
  }

  function makeItem(c, idx, list, q) {
    const el = document.createElement('div');
    el.className = 'cp-item' + (idx === 0 ? ' cp-selected' : '');
    el.dataset.idx = idx;
    el.innerHTML =
      `<span class="cp-icon">${esc(c.icon)}</span>` +
      `<span class="cp-label">${highlight(c.label, q)}</span>` +
      (c.keys ? `<span class="cp-key">${esc(c.keys)}</span>` : '');
    el.addEventListener('mousedown', e => { e.preventDefault(); pick(idx, list); });
    el.addEventListener('mousemove', () => setSelected(idx));
    return el;
  }

  function render() {
    const q    = elInput.value.trim();
    const list = getFiltered();
    elList.innerHTML = '';

    if (list) {
      // Filtered flat view
      list.forEach((c, i) => elList.appendChild(makeItem(c, i, list, q)));
    } else {
      // Sectioned view — build a flat ordered list for keyboard nav
      const flat = [];
      SECTIONS.forEach(sec => {
        const hdr = document.createElement('div');
        hdr.className = 'cp-section';
        hdr.textContent = sec.name;
        elList.appendChild(hdr);
        sec.cmds.forEach(c => {
          const idx = flat.length;
          flat.push(c);
          elList.appendChild(makeItem(c, idx, flat, ''));
        });
      });
      // Patch: re-wire mousemove/mousedown with the complete flat array after building
      elList.querySelectorAll('.cp-item').forEach((el, i) => {
        el.onmousedown = e => { e.preventDefault(); pick(i, flat); };
        el.onmousemove = () => setSelected(i);
      });
    }
    selected = 0;
  }

  function setSelected(idx) {
    const items = elList.querySelectorAll('.cp-item');
    items.forEach((el, i) => el.classList.toggle('cp-selected', i === idx));
    selected = idx;
    items[idx]?.scrollIntoView({ block: 'nearest' });
  }

  function currentList() {
    return getFiltered() ?? SECTIONS.flatMap(s => s.cmds);
  }

  function pick(idx, list) {
    const cmd = (list ?? currentList())[idx];
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

    const count = currentList().length;
    if (e.key === 'Escape')    { e.preventDefault(); close(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(Math.min(selected + 1, count - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(Math.max(selected - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(selected, null); }
  });

  elInput.addEventListener('input', () => { render(); selected = 0; });

  elInput.addEventListener('keydown', e => {
    const count = currentList().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(Math.min(selected + 1, count - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(Math.max(selected - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(selected, null); }
    if (e.key === 'Escape')    { e.preventDefault(); close(); }
  });
  elOverlay.addEventListener('mousedown', e => { if (e.target === elOverlay) close(); });

  // Expose for other modules
  window.sane = window.sane || {};
  window.sane.openCommandPalette = open;
})();
