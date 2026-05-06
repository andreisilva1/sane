(function () {
  const elEditor  = document.getElementById('editor');
  const elArea    = document.getElementById('editor-area');

  // ── Toolbar (inserted before the textarea so it sits above it) ──
  const elBar = document.createElement('div');
  elBar.id = 'jv-bar';
  elBar.className = 'hidden';
  elArea.insertBefore(elBar, elEditor);

  const elStatus  = document.createElement('span');
  elStatus.id = 'jv-status';
  const elFmt     = document.createElement('button');
  elFmt.id = 'jv-fmt';
  elFmt.textContent = 'Format';
  elFmt.title = 'Format JSON (Alt+Shift+F)';
  const elToggle  = document.createElement('button');
  elToggle.id = 'jv-toggle';
  elToggle.textContent = 'Tree';
  elToggle.title = 'Toggle tree view';
  const elCloseBar = document.createElement('button');
  elCloseBar.id = 'jv-close';
  elCloseBar.textContent = '×';
  elCloseBar.title = 'Close JSON toolbar';
  elBar.append(elStatus, elFmt, elToggle, elCloseBar);

  // ── Tree panel (absolutely positioned, not in flow) ───────
  const elTree = document.createElement('div');
  elTree.id = 'jv-tree';
  elTree.className = 'hidden';
  elArea.appendChild(elTree);

  let active    = false;
  let treeOpen  = false;

  // ── Validate & status ─────────────────────────────────────
  function validate() {
    const src = elEditor.value.trim();
    if (!src) { elStatus.textContent = ''; return null; }
    try {
      const parsed = JSON.parse(src);
      elStatus.textContent = '✔ valid';
      elStatus.className = 'jv-ok';
      return parsed;
    } catch (err) {
      elStatus.textContent = '✖ ' + err.message.split('\n')[0];
      elStatus.className = 'jv-err';
      return null;
    }
  }

  // ── Format ────────────────────────────────────────────────
  function format() {
    const parsed = validate();
    if (parsed === null) return;
    const formatted = JSON.stringify(parsed, null, 2);
    if (formatted !== elEditor.value) {
      window.sane?.history?.push?.();
      elEditor.value = formatted;
      elEditor.dispatchEvent(new Event('input'));
      setStatus('JSON formatted', 'ok');
      document.dispatchEvent(new CustomEvent('sane:activity',
        { detail: 'JSON formatted' }));
    }
  }

  // ── Tree render ───────────────────────────────────────────
  function renderTree(val, depth = 0) {
    if (val === null) return span('jv-null', 'null');
    if (typeof val === 'boolean') return span('jv-bool', String(val));
    if (typeof val === 'number') return span('jv-num', String(val));
    if (typeof val === 'string') return span('jv-str', JSON.stringify(val));

    const isArr = Array.isArray(val);
    const keys  = Object.keys(val);
    if (keys.length === 0) return span('jv-punct', isArr ? '[]' : '{}');

    const details = document.createElement('details');
    details.open = depth < 2;
    const summary = document.createElement('summary');
    summary.className = 'jv-summary';
    summary.textContent = isArr
      ? `[ ${keys.length} item${keys.length !== 1 ? 's' : ''} ]`
      : `{ ${keys.length} key${keys.length !== 1 ? 's' : ''} }`;
    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'jv-list';
    for (const k of keys) {
      const li = document.createElement('li');
      if (!isArr) {
        const key = document.createElement('span');
        key.className = 'jv-key';
        key.textContent = k + ': ';
        li.appendChild(key);
      }
      li.appendChild(renderTree(val[k], depth + 1));
      ul.appendChild(li);
    }
    details.appendChild(ul);
    return details;
  }

  function span(cls, text) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  function refreshTree() {
    if (!treeOpen) return;
    const parsed = validate();
    elTree.innerHTML = '';
    if (parsed !== null) {
      elTree.appendChild(renderTree(parsed));
    }
  }

  function toggleTree() {
    treeOpen = !treeOpen;
    elToggle.textContent = treeOpen ? 'Raw' : 'Tree';
    elTree.classList.toggle('hidden', !treeOpen);
    elEditor.classList.toggle('jv-shrink', treeOpen);
    if (treeOpen) refreshTree();
  }

  // ── Event wiring ──────────────────────────────────────────
  elFmt.addEventListener('click', format);
  elToggle.addEventListener('click', toggleTree);
  elCloseBar.addEventListener('click', () => {
    if (treeOpen) toggleTree();
    elBar.classList.add('hidden');
    active = false;
  });

  let debounce = null;
  elEditor.addEventListener('input', () => {
    if (!active) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => { validate(); if (treeOpen) refreshTree(); }, 400);
  });

  // Alt+Shift+F → format
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.altKey && e.shiftKey && e.key === 'F') { e.preventDefault(); format(); }
  });

  // ── Hook ─────────────────────────────────────────────────
  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    active = !!(path && path.toLowerCase().endsWith('.json'));
    elBar.classList.toggle('hidden', !active);
    if (!active) {
      if (treeOpen) toggleTree();
      elStatus.textContent = '';
    } else {
      validate();
    }
  };
})();
