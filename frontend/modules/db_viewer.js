(function () {
  const elEditorWrap = document.getElementById('editor-wrap');
  const elPanel      = document.getElementById('dv-panel');
  const elPath       = document.getElementById('dv-path');
  const elTables     = document.getElementById('dv-tables');
  const elGrid       = document.getElementById('dv-grid');
  const elQuery      = document.getElementById('dv-query');
  const elRunQuery   = document.getElementById('dv-run-query');
  const elPager      = document.getElementById('dv-pager');

  let currentDB    = null;
  let currentTable = null;
  let currentPage  = 0;

  // ── Show / hide ───────────────────────────────────────────
  function showPanel() {
    elEditorWrap.classList.add('hidden');
    elPanel.classList.remove('hidden');
  }

  function hidePanel() {
    elPanel.classList.add('hidden');
    elEditorWrap.classList.remove('hidden');
  }

  // ── Load DB ───────────────────────────────────────────────
  async function loadDB(path) {
    currentDB    = path;
    currentTable = null;
    elPath.textContent = path.split(/[\\/]/).pop();
    elTables.innerHTML = '<div class="dv-loading">Loading tables…</div>';
    elGrid.innerHTML   = '';
    elPager.innerHTML  = '';

    try {
      const res    = await apiFetch('/db/tables?path=' + encodeURIComponent(path));
      const tables = await res.json();
      elTables.innerHTML = '';

      if (!tables.length) {
        elTables.innerHTML = '<div class="dv-empty">No tables found</div>';
        return;
      }

      for (const t of tables) {
        const btn = document.createElement('button');
        btn.className   = 'dv-table-btn';
        btn.textContent = t;
        btn.addEventListener('click', () => selectTable(t, btn));
        elTables.appendChild(btn);
      }

      const first = elTables.querySelector('button');
      selectTable(tables[0], first);
    } catch (err) {
      elTables.innerHTML = '<div class="dv-err">Error: ' + err.message + '</div>';
    }
  }

  // ── Select table ──────────────────────────────────────────
  function selectTable(name, btn) {
    currentTable = name;
    currentPage  = 0;
    elTables.querySelectorAll('.dv-table-btn').forEach(b =>
      b.classList.toggle('dv-table-active', b === btn));
    elQuery.value = 'SELECT * FROM "' + name + '";';
    loadRows(1);
  }

  // ── Load rows (paginated preview, max 500 rows) ───────────
  async function loadRows(page) {
    if (!currentDB || !currentTable) return;
    currentPage = page;
    elGrid.innerHTML = '<div class="dv-loading">Loading…</div>';

    try {
      const url = '/db/rows?path=' + encodeURIComponent(currentDB)
        + '&table=' + encodeURIComponent(currentTable)
        + '&page=' + page;
      const res  = await apiFetch(url);
      const data = await res.json();
      renderGrid(data.columns, data.rows);
      renderPager(data.page, data.pages, data.total);
    } catch (err) {
      elGrid.innerHTML = '<div class="dv-err">Error: ' + err.message + '</div>';
    }
  }

  // ── Run custom query ──────────────────────────────────────
  elRunQuery.addEventListener('click', runQuery);
  elQuery.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); }
  });

  async function runQuery() {
    const sql = elQuery.value.trim();
    if (!sql || !currentDB) return;
    elGrid.innerHTML = '<div class="dv-loading">Running…</div>';
    elPager.innerHTML = '';

    try {
      const res  = await apiFetch('/db/query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ path: currentDB, query: sql }),
      });
      const data = await res.json();
      if (data.error) {
        elGrid.innerHTML = '<div class="dv-err">Query error: ' + data.error + '</div>';
        return;
      }
      renderGrid(data.columns, data.rows);
    } catch (err) {
      elGrid.innerHTML = '<div class="dv-err">Error: ' + err.message + '</div>';
    }
  }

  // ── Render table grid ─────────────────────────────────────
  function renderGrid(columns, rows) {
    elGrid.innerHTML = '';
    if (!columns || !columns.length) {
      elGrid.innerHTML = '<div class="dv-empty">No results</div>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'dv-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const col of columns) {
      const th = document.createElement('th');
      th.textContent = col;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const col of columns) {
        const td = document.createElement('td');
        const v = row[col];
        td.textContent = v === null ? 'NULL' : String(v);
        if (v === null) td.className = 'dv-null';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    elGrid.appendChild(table);
  }

  // ── Pager ─────────────────────────────────────────────────
  function renderPager(page, pages, total) {
    elPager.innerHTML = '';
    const info = document.createElement('span');
    info.className = 'dv-page-info';
    // page is 0-indexed from backend; display as 1-indexed to user
    info.textContent = total + ' rows' + (pages > 1 ? ` (page ${page + 1}/${pages})` : '');

    if (pages <= 1) { elPager.appendChild(info); return; }

    const prev = document.createElement('button');
    prev.textContent = '‹ Prev';
    prev.disabled = page <= 0;
    prev.addEventListener('click', () => loadRows(page - 1));

    const next = document.createElement('button');
    next.textContent = 'Next ›';
    next.disabled = page >= pages - 1;
    next.addEventListener('click', () => loadRows(page + 1));

    elPager.append(prev, info, next);
  }

  // ── onFileOpen hook ───────────────────────────────────────
  const prevHook = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prevHook) prevHook(path);
    if (path && /\.(db|sqlite|sqlite3)$/i.test(path)) {
      showPanel();
      loadDB(path);
    } else {
      hidePanel();
    }
  };

  // ── Expose (manual open kept for command palette) ─────────
  window.sane.openDBViewer = () => {
    if (currentDB) showPanel();
  };
})();
