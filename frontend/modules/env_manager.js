(function () {
  const elOverlay   = document.getElementById('env-overlay');
  const elClose     = document.getElementById('env-close');
  const elFileList  = document.getElementById('env-files');
  const elEntries   = document.getElementById('env-entries');
  const elAddKey    = document.getElementById('env-add-key');
  const elAddVal    = document.getElementById('env-add-val');
  const elAddBtn    = document.getElementById('env-add-btn');
  const elActiveBadge = document.getElementById('env-active-badge');
  const elMissing   = document.getElementById('env-missing');

  let currentPath = null;
  let entries     = [];
  let showSecrets = false;

  // ── Open / close ──────────────────────────────────────────
  async function open() {
    if (!state.folder) { setStatus('Open a folder first', 'err'); return; }
    elOverlay.classList.remove('hidden');
    await loadFiles();
  }

  function close() {
    elOverlay.classList.add('hidden');
  }

  elClose.addEventListener('click', close);
  elOverlay.addEventListener('mousedown', (e) => {
    if (e.target === elOverlay) close();
  });

  // ── Load file list ────────────────────────────────────────
  async function loadFiles() {
    try {
      const res  = await apiFetch('/env/list?dir=' + encodeURIComponent(state.folder));
      const files = await res.json();
      elFileList.innerHTML = '';

      if (!files.length) {
        elFileList.innerHTML = '<span class="env-empty">No .env files found in project</span>';
        elEntries.innerHTML = '';
        currentPath = null;
        return;
      }

      for (const f of files) {
        const btn = document.createElement('button');
        btn.className = 'env-file-btn' + (f.active ? ' env-file-active' : '');
        btn.textContent = f.name;
        btn.title = f.path;
        btn.addEventListener('click', () => loadFile(f.path, btn));
        elFileList.appendChild(btn);
        if (f.active && !currentPath) loadFile(f.path, btn);
      }
      if (!currentPath && files.length) {
        const firstBtn = elFileList.querySelector('button');
        loadFile(files[0].path, firstBtn);
      }
    } catch (err) {
      setStatus('Env error: ' + err.message, 'err');
    }
  }

  // ── Load entries for a file ───────────────────────────────
  async function loadFile(path, btn) {
    currentPath = path;
    elFileList.querySelectorAll('.env-file-btn').forEach(b =>
      b.classList.toggle('env-file-active', b === btn));
    try {
      const res = await apiFetch('/env/read?path=' + encodeURIComponent(path));
      entries = await res.json();
      renderEntries();
      detectMissing();
    } catch (err) {
      setStatus('Env read error: ' + err.message, 'err');
    }
  }

  // ── Render entries ────────────────────────────────────────
  function renderEntries() {
    elEntries.innerHTML = '';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.key === '') {
        if (e.comment) {
          const row = document.createElement('div');
          row.className = 'env-comment';
          row.textContent = '# ' + e.comment;
          elEntries.appendChild(row);
        }
        continue;
      }
      const row = document.createElement('div');
      row.className = 'env-row';

      const key = document.createElement('input');
      key.className = 'env-key';
      key.value = e.key;
      key.spellcheck = false;
      key.addEventListener('change', () => { entries[i].key = key.value; save(); });

      const val = document.createElement('input');
      val.className = 'env-val';
      val.type = isSensitive(e.key) && !showSecrets ? 'password' : 'text';
      val.value = e.value;
      val.spellcheck = false;
      val.addEventListener('change', () => { entries[i].value = val.value; save(); });

      const del = document.createElement('button');
      del.className = 'env-del';
      del.textContent = '×';
      del.title = 'Remove';
      del.addEventListener('click', () => { entries.splice(i, 1); save(); renderEntries(); });

      row.append(key, val, del);
      elEntries.appendChild(row);
    }

    // Toggle secret visibility button
    const hasSecrets = entries.some(e => e.key && isSensitive(e.key));
    if (hasSecrets) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'env-toggle-secrets';
      toggleBtn.textContent = showSecrets ? 'Hide secrets' : 'Show secrets';
      toggleBtn.addEventListener('click', () => {
        showSecrets = !showSecrets;
        renderEntries();
      });
      elEntries.appendChild(toggleBtn);
    }
  }

  function isSensitive(key) {
    return /secret|password|token|key|pwd|pass/i.test(key);
  }

  // ── Detect missing vars in open file ─────────────────────
  async function detectMissing() {
    elMissing.innerHTML = '';
    if (!state.filePath) return;
    try {
      const res = await apiFetch('/env/detect?path=' + encodeURIComponent(state.filePath));
      const missing = await res.json();
      if (!missing.length) return;
      for (const key of missing) {
        const chip = document.createElement('span');
        chip.className = 'env-missing-chip';
        chip.title = 'Missing in active .env';
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ ' + key;
        addBtn.addEventListener('click', () => {
          entries.push({ key, value: '' });
          save();
          renderEntries();
          chip.remove();
        });
        chip.appendChild(addBtn);
        elMissing.appendChild(chip);
      }
    } catch {}
  }

  // ── Add entry ─────────────────────────────────────────────
  elAddBtn.addEventListener('click', addEntry);
  elAddKey.addEventListener('keydown', (e) => { if (e.key === 'Enter') addEntry(); });

  function addEntry() {
    const key = elAddKey.value.trim();
    if (!key || !currentPath) return;
    entries.push({ key, value: elAddVal.value });
    elAddKey.value = '';
    elAddVal.value = '';
    save();
    renderEntries();
  }

  // ── Save to disk ──────────────────────────────────────────
  async function save() {
    if (!currentPath) return;
    try {
      await apiFetch('/env/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, entries }),
      });
    } catch (err) {
      setStatus('Env save failed: ' + err.message, 'err');
    }
  }

  // ── Activate env for runs ─────────────────────────────────
  document.getElementById('env-activate-btn').addEventListener('click', async () => {
    if (!currentPath) return;
    try {
      await apiFetch('/env/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath }),
      });
      const name = currentPath.split(/[\\/]/).pop();
      elActiveBadge.textContent = name;
      elActiveBadge.classList.remove('hidden');
      elFileList.querySelectorAll('.env-file-btn').forEach(b => {
        b.classList.toggle('env-file-active', b.title === currentPath);
      });
      setStatus('Active env: ' + name, 'ok');
      document.dispatchEvent(new CustomEvent('sane:activity',
        { detail: 'Environment loaded (' + name + ')' }));
    } catch (err) {
      setStatus('Activate failed: ' + err.message, 'err');
    }
  });

  document.getElementById('env-deactivate-btn').addEventListener('click', async () => {
    try {
      await apiFetch('/env/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '' }),
      });
      elActiveBadge.textContent = '';
      elActiveBadge.classList.add('hidden');
      setStatus('Env cleared', 'ok');
    } catch {}
  });

  // ── Keyboard shortcut ─────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      elOverlay.classList.contains('hidden') ? open() : close();
    }
  });

  // ── Expose ────────────────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.openEnvManager = open;
})();
