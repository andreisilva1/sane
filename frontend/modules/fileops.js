// ── File Operations (feature_reintroduction_fileops_v1) ───
// Depends on globals: state, API, apiFetch, setStatus, renderTree, openFile
// Adds: right-click context menu on file tree (new file, new folder, rename, delete)

(function () {
  const elTree     = document.getElementById('file-tree');
  const elMenu     = document.getElementById('fo-menu');
  const elDialog   = document.getElementById('fo-dialog');
  const elBackdrop = document.getElementById('fo-backdrop');
  const elTitle    = document.getElementById('fo-title');
  const elInput    = document.getElementById('fo-input');

  const elNewFile   = document.getElementById('fo-new-file');
  const elNewFolder = document.getElementById('fo-new-folder');
  const elRename    = document.getElementById('fo-rename');
  const elDelete    = document.getElementById('fo-delete');
  const elSepItems  = document.querySelectorAll('.fo-sep-rename');

  // ── Path helpers ──────────────────────────────────────────
  function sep(p) { return p.includes('\\') ? '\\' : '/'; }
  function parentOf(p) { const s = sep(p); return p.split(s).slice(0, -1).join(s); }
  function joinPath(dir, name) { return dir + sep(dir) + name; }
  function nameOf(p) { const s = sep(p); return p.split(s).pop(); }

  // ── Context menu state ────────────────────────────────────
  let ctxPath  = null;
  let ctxIsDir = false;

  function targetDir() {
    if (!ctxPath)   return state.folder;
    if (ctxIsDir)   return ctxPath;
    return parentOf(ctxPath);
  }

  function showMenu(e, path, isDir) {
    e.preventDefault();
    ctxPath  = path;
    ctxIsDir = isDir;

    const hasItem = !!path;
    elSepItems.forEach(el => el.classList.toggle('hidden', !hasItem));

    // Position (keep inside viewport)
    const menuW = 150, menuH = 110;
    const x = Math.min(e.clientX, window.innerWidth  - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    elMenu.style.left = x + 'px';
    elMenu.style.top  = y + 'px';
    elMenu.classList.remove('hidden');
  }

  function hideMenu() { elMenu.classList.add('hidden'); }

  // ── Dialog ────────────────────────────────────────────────
  let _onConfirm = null;
  let _keyHandler = null;

  function showDialog(title, defaultVal, onConfirm) {
    elTitle.textContent = title;
    elInput.value = defaultVal;
    elDialog.classList.remove('hidden');
    elInput.focus();
    elInput.select();
    _onConfirm = onConfirm;

    if (_keyHandler) elInput.removeEventListener('keydown', _keyHandler);
    _keyHandler = (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); confirmDialog(); }
      if (e.key === 'Escape') { closeDialog(); }
    };
    elInput.addEventListener('keydown', _keyHandler);
  }

  function confirmDialog() {
    const val = elInput.value.trim();
    const cb  = _onConfirm;
    closeDialog();
    if (val && cb) cb(val);
  }

  function closeDialog() {
    elDialog.classList.add('hidden');
    _onConfirm = null;
  }

  // ── Refresh tree ──────────────────────────────────────────
  async function refresh() {
    if (!state.folder) return;
    try {
      const res   = await apiFetch('/files?path=' + encodeURIComponent(state.folder));
      const nodes = await res.json();
      renderTree(nodes || []);
    } catch (err) {
      setStatus('Refresh error: ' + err.message, 'err');
    }
  }

  // ── Operations ────────────────────────────────────────────
  async function doNewFile() {
    const dir = targetDir();
    if (!dir) return;
    showDialog('New file in ' + nameOf(dir), 'untitled.py', async (name) => {
      if (!name.includes('.')) name += '.py';
      const path = joinPath(dir, name);
      try {
        await apiFetch('/file?path=' + encodeURIComponent(path), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '' }),
        });
        await refresh();
        // Find the new tree row and open the file
        const row = document.querySelector(`.tree-item[data-path="${CSS.escape(path)}"]`);
        openFile(path, row);
        setStatus('Created ' + name, 'ok');
      } catch (err) { setStatus('Error: ' + err.message, 'err'); }
    });
  }

  async function doNewFolder() {
    const dir = targetDir();
    if (!dir) return;
    showDialog('New folder in ' + nameOf(dir), 'new-folder', async (name) => {
      const path = joinPath(dir, name);
      try {
        await apiFetch('/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Path: path }),
        });
        await refresh();
        setStatus('Created ' + name, 'ok');
      } catch (err) { setStatus('Error: ' + err.message, 'err'); }
    });
  }

  async function doRename() {
    if (!ctxPath) return;
    const oldName = nameOf(ctxPath);
    showDialog('Rename', oldName, async (newName) => {
      if (newName === oldName) return;
      const newPath = joinPath(parentOf(ctxPath), newName);
      try {
        await apiFetch('/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ From: ctxPath, To: newPath }),
        });
        // Update open file reference if needed
        if (state.filePath === ctxPath) {
          state.filePath = newPath;
          document.getElementById('current-file').textContent =
            newName + (state.dirty ? ' ●' : '');
        }
        await refresh();
        setStatus('Renamed to ' + newName, 'ok');
      } catch (err) { setStatus('Error: ' + err.message, 'err'); }
    });
  }

  async function doDelete() {
    if (!ctxPath) return;
    const name = nameOf(ctxPath);
    const msg  = ctxIsDir
      ? `Delete folder "${name}" and all its contents?`
      : `Delete file "${name}"?`;
    if (!confirm(msg)) return;
    try {
      await apiFetch('/file?path=' + encodeURIComponent(ctxPath), { method: 'DELETE' });
      // Clear editor if the deleted file was open
      if (state.filePath === ctxPath || state.filePath?.startsWith(ctxPath + sep(ctxPath))) {
        state.filePath = null;
        state.content  = '';
        state.dirty    = false;
        document.getElementById('editor').value = '';
        document.getElementById('editor').disabled = true;
        document.getElementById('current-file').textContent = '';
        document.getElementById('header-sep').classList.add('hidden');
        document.getElementById('btn-save').disabled = true;
        if (window.sane?.onFileOpen) window.sane.onFileOpen(null);
      }
      await refresh();
      setStatus('Deleted ' + name, 'ok');
    } catch (err) { setStatus('Error: ' + err.message, 'err'); }
  }

  // ── Event wiring ──────────────────────────────────────────
  document.getElementById('sidebar').addEventListener('contextmenu', (e) => {
    const item  = e.target.closest('.tree-item');
    const path  = item?.dataset.path || null;
    const isDir = item?.classList.contains('dir') || false;
    showMenu(e, path, isDir);
  });

  // Hide menu on click outside
  document.addEventListener('mousedown', (e) => {
    if (!elMenu.contains(e.target)) hideMenu();
  });

  elNewFile.addEventListener('click',   () => { hideMenu(); doNewFile();   });
  elNewFolder.addEventListener('click', () => { hideMenu(); doNewFolder(); });
  elRename.addEventListener('click',    () => { hideMenu(); doRename();    });
  elDelete.addEventListener('click',    () => { hideMenu(); doDelete();    });

  window.sane = window.sane || {};
  window.sane.getCtxPath  = () => ctxPath;
  window.sane.hideCtxMenu = () => hideMenu();

  document.getElementById('fo-confirm').addEventListener('click', confirmDialog);
  elBackdrop.addEventListener('click', closeDialog);

  // Delete / Shift+Delete on selected tree item
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete') return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    const selected = document.querySelector('.tree-item.selected');
    if (!selected) return;
    e.preventDefault();
    ctxPath  = selected.dataset.path;
    ctxIsDir = selected.classList.contains('dir');
    doDelete();
  });
})();
