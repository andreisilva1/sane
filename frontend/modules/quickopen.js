// ── Quick Open (feature_reintroduction_quickopen_v1) ──────
// Depends on globals: openFile, setStatus
// Ctrl+P → fuzzy file search over current tree, Enter/click to open

(function () {
  const elOverlay = document.getElementById('qo-overlay');
  const elInput   = document.getElementById('qo-input');
  const elList    = document.getElementById('qo-list');

  let files    = [];   // { path, name, label } for all tree files
  let selected = 0;

  // ── Collect files from rendered tree ──────────────────────
  function collectFiles() {
    files = [];
    document.querySelectorAll('.tree-item:not(.dir)').forEach(el => {
      const path = el.dataset.path;
      if (!path) return;
      const parts = path.replace(/\\/g, '/').split('/');
      files.push({ path, name: parts[parts.length - 1], label: path });
    });
  }

  // ── Fuzzy match ───────────────────────────────────────────
  function score(query, target) {
    if (!query) return 1;
    query  = query.toLowerCase();
    target = target.toLowerCase();
    if (target.includes(query)) return 2;
    // character-order match
    let qi = 0;
    for (let i = 0; i < target.length && qi < query.length; i++) {
      if (target[i] === query[qi]) qi++;
    }
    return qi === query.length ? 1 : 0;
  }

  function highlight(text, query) {
    if (!query) return esc(text);
    const lo  = text.toLowerCase();
    const qlo = query.toLowerCase();
    const idx = lo.indexOf(qlo);
    if (idx >= 0) {
      return esc(text.slice(0, idx))
           + '<mark>' + esc(text.slice(idx, idx + qlo.length)) + '</mark>'
           + esc(text.slice(idx + qlo.length));
    }
    return esc(text);
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Render results ────────────────────────────────────────
  function render() {
    const q = elInput.value.trim();
    const results = files
      .map(f => ({ ...f, sc: Math.max(score(q, f.name), score(q, f.label)) }))
      .filter(f => f.sc > 0)
      .slice(0, 40);

    elList.innerHTML = '';
    results.forEach((f, i) => {
      const li = document.createElement('div');
      li.className = 'qo-item' + (i === 0 ? ' qo-selected' : '');
      li.dataset.idx = i;

      const nameEl = document.createElement('span');
      nameEl.className = 'qo-name';
      nameEl.innerHTML = highlight(f.name, q);

      const pathEl = document.createElement('span');
      pathEl.className = 'qo-path';
      pathEl.textContent = f.label;

      li.appendChild(nameEl);
      li.appendChild(pathEl);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i, results); });
      li.addEventListener('mousemove', () => setSelected(i));
      elList.appendChild(li);
    });

    selected = 0;
  }

  function setSelected(idx) {
    const items = elList.querySelectorAll('.qo-item');
    items.forEach((el, i) => el.classList.toggle('qo-selected', i === idx));
    selected = idx;
    const el = items[idx];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function pick(idx, results) {
    const list = results || getResults();
    const f = list[idx];
    if (!f) return;
    close();
    const row = document.querySelector(`.tree-item[data-path="${CSS.escape(f.path)}"]`);
    openFile(f.path, row);
  }

  function getResults() {
    const q = elInput.value.trim();
    return files
      .map(f => ({ ...f, sc: Math.max(score(q, f.name), score(q, f.label)) }))
      .filter(f => f.sc > 0)
      .slice(0, 40);
  }

  // ── Open / close ──────────────────────────────────────────
  function open() {
    collectFiles();
    elInput.value = '';
    render();
    elOverlay.classList.remove('hidden');
    elInput.focus();
  }

  function close() {
    elOverlay.classList.add('hidden');
  }

  // ── Keyboard ──────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      if (elOverlay.classList.contains('hidden')) open(); else close();
      return;
    }
    if (elOverlay.classList.contains('hidden')) return;

    if (e.key === 'Escape') { e.preventDefault(); close(); return; }

    const count = elList.querySelectorAll('.qo-item').length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(Math.min(selected + 1, count - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(Math.max(selected - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(selected, getResults()); }
  });

  elInput.addEventListener('input', render);

  elOverlay.addEventListener('mousedown', (e) => {
    if (e.target === elOverlay) close();
  });
})();
