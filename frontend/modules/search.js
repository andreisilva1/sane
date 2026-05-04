// ── Global Search (feature_reintroduction_search_v1) ──────
// Depends on globals: state, API, apiFetch, openFile, setStatus
// Ctrl+Shift+F → search all files in open folder via /search

(function () {
  const elOverlay = document.getElementById('gs-overlay');
  const elInput   = document.getElementById('gs-input');
  const elResults = document.getElementById('gs-results');
  const elCount   = document.getElementById('gs-count');

  let debounceTimer = null;

  // ── Open / close ──────────────────────────────────────────
  function open() {
    elOverlay.classList.remove('hidden');
    elInput.focus();
    elInput.select();
    if (elInput.value.trim()) runSearch();
  }

  function close() {
    elOverlay.classList.add('hidden');
  }

  // ── Search ────────────────────────────────────────────────
  function scheduleSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 250);
  }

  async function runSearch() {
    const q = elInput.value.trim();
    if (!q || !state.folder) {
      elResults.innerHTML = '';
      elCount.textContent = '';
      return;
    }

    elCount.textContent = 'Searching…';
    try {
      const res  = await apiFetch(
        '/search?root=' + encodeURIComponent(state.folder) +
        '&q='           + encodeURIComponent(q)
      );
      const data = await res.json();
      renderResults(data, q);
    } catch (err) {
      elCount.textContent = 'Error';
      setStatus('Search error: ' + err.message, 'err');
    }
  }

  // ── Render ────────────────────────────────────────────────
  function relPath(full) {
    if (!state.folder) return full;
    const base = state.folder.replace(/[/\\]$/, '');
    if (full.startsWith(base)) {
      return full.slice(base.length).replace(/^[/\\]/, '');
    }
    return full;
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function hlMatch(text, q) {
    const lo  = text.toLowerCase();
    const qlo = q.toLowerCase();
    const idx = lo.indexOf(qlo);
    if (idx < 0) return esc(text);
    return esc(text.slice(0, idx))
      + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>'
      + esc(text.slice(idx + q.length));
  }

  function renderResults(results, q) {
    elResults.innerHTML = '';

    if (!results || results.length === 0) {
      elCount.textContent = 'No results';
      return;
    }

    const capped = results.length >= 500;
    elCount.textContent = results.length + (capped ? '+' : '') + ' result' + (results.length !== 1 ? 's' : '');

    // Group by file
    const byFile = new Map();
    for (const r of results) {
      if (!byFile.has(r.path)) byFile.set(r.path, []);
      byFile.get(r.path).push(r);
    }

    for (const [path, hits] of byFile) {
      const fileGroup = document.createElement('div');
      fileGroup.className = 'gs-group';

      const fileHeader = document.createElement('div');
      fileHeader.className = 'gs-file';
      fileHeader.textContent = relPath(path);
      fileGroup.appendChild(fileHeader);

      for (const hit of hits) {
        const row = document.createElement('div');
        row.className = 'gs-row';

        const lineEl = document.createElement('span');
        lineEl.className = 'gs-line';
        lineEl.textContent = hit.line;

        const contentEl = document.createElement('span');
        contentEl.className = 'gs-content';
        contentEl.innerHTML = hlMatch(hit.content, q);

        row.appendChild(lineEl);
        row.appendChild(contentEl);

        row.addEventListener('click', () => {
          const treeRow = document.querySelector(`.tree-item[data-path="${CSS.escape(path)}"]`);
          openFile(path, treeRow).then(() => goToLine(hit.line));
          close();
        });

        fileGroup.appendChild(row);
      }

      elResults.appendChild(fileGroup);
    }
  }

  // ── Jump to line ──────────────────────────────────────────
  function goToLine(n) {
    const el = document.getElementById('editor');
    if (!el || !el.value) return;
    const lines = el.value.split('\n');
    let offset = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    el.selectionStart = el.selectionEnd = offset;
    el.focus();
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.scrollTop = Math.max(0, (n - 1) * lh - el.clientHeight / 3);
  }

  // ── Events ────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      if (elOverlay.classList.contains('hidden')) open(); else close();
      return;
    }
    if (!elOverlay.classList.contains('hidden') && e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  elInput.addEventListener('input', scheduleSearch);

  elOverlay.addEventListener('mousedown', (e) => {
    if (e.target === elOverlay) close();
  });
})();
