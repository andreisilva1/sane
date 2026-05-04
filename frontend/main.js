// ── Config ────────────────────────────────────────────────
const API = 'http://localhost:7654';

// Suppress native browser/webview context menu globally
document.addEventListener('contextmenu', e => e.preventDefault());

// ── State ─────────────────────────────────────────────────
const state = {
  folder:   null,   // string | null
  filePath: null,   // string | null
  content:  '',     // string
  dirty:    false,  // boolean
};

// ── DOM refs ──────────────────────────────────────────────
const elBtnOpen    = document.getElementById('btn-open');
const elBtnSave    = document.getElementById('btn-save');
const elFolderName = document.getElementById('folder-name');
const elHeaderSep  = document.getElementById('header-sep');
const elCurrentFile= document.getElementById('current-file');
const elTree       = document.getElementById('file-tree');
const elEditor     = document.getElementById('editor');
const elStatus     = document.getElementById('status-msg');

// ── Status bar ────────────────────────────────────────────
function setStatus(msg, type = '') {
  elStatus.textContent = msg;
  elStatus.className = type;
  if (type === 'ok') setTimeout(() => { if (elStatus.textContent === msg) elStatus.textContent = ''; }, 2500);
}

// ── Backend helpers ───────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }
  return res;
}

async function waitForBackend() {
  for (let i = 0; i < 30; i++) {
    try { await fetch(API + '/ping'); return; } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  setStatus('Backend not reachable on :7654', 'err');
}

// ── Open Folder ───────────────────────────────────────────
async function openFolder() {
  console.log('[sane] Open Folder clicked');
  setStatus('Opening folder…', 'info');

  let dir;
  try {
    const { open } = window.__TAURI__.dialog;
    dir = await open({ directory: true, multiple: false });
  } catch (err) {
    setStatus('Dialog error: ' + err.message, 'err');
    console.error('[sane] dialog error', err);
    return;
  }

  if (!dir) {
    setStatus('');
    return;
  }

  console.log('[sane] Folder selected:', dir);
  setStatus('Loading…', 'info');

  try {
    const res = await apiFetch('/files?path=' + encodeURIComponent(dir));
    const nodes = await res.json() || [];

    state.folder = dir;
    elFolderName.textContent = dir.split(/[/\\]/).pop();
    renderTree(nodes);
    setStatus('Folder loaded', 'ok');
  } catch (err) {
    setStatus('Failed to load folder: ' + err.message, 'err');
    console.error('[sane] /files error', err);
  }
}

// ── File tree ─────────────────────────────────────────────
function renderTree(nodes) {
  elTree.innerHTML = '';
  buildTreeNodes(nodes || [], elTree, 0);
}

function buildTreeNodes(nodes, container, depth) {
  for (const node of nodes) {
    const row = document.createElement('div');
    row.className = 'tree-item' + (node.isDir ? ' dir' : '');
    row.style.paddingLeft = (8 + depth * 14) + 'px';
    row.dataset.path = node.path;

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = node.isDir ? '▸' : '·';
    if (!node.isDir) {
      const ext = node.name.includes('.') ? node.name.split('.').pop().toLowerCase() : '';
      if (ext) row.dataset.ext = ext;
    }
    row.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = node.name;
    row.appendChild(label);

    if (node.isDir) {
      let expanded = false;
      const childWrap = document.createElement('div');
      childWrap.className = 'tree-children hidden';
      if (node.children && node.children.length > 0) {
        buildTreeNodes(node.children, childWrap, depth + 1);
      }

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        expanded = !expanded;
        icon.textContent = expanded ? '▾' : '▸';
        childWrap.classList.toggle('hidden', !expanded);
      });

      container.appendChild(row);
      container.appendChild(childWrap);
    } else {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        openFile(node.path, row);
      });
      container.appendChild(row);
    }
  }
}

// ── Open File ─────────────────────────────────────────────
async function openFile(path, rowEl) {
  console.log('[sane] Opening file:', path);
  setStatus('Opening…', 'info');

  // Mark selection
  document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
  if (rowEl) rowEl.classList.add('selected');

  if (state.dirty) {
    const ok = confirm('Unsaved changes. Discard and open?');
    if (!ok) return;
  }

  try {
    const res = await apiFetch('/file?path=' + encodeURIComponent(path));
    const content = await res.text();
    console.log('[sane] File opened, length:', content.length);

    state.filePath = path;
    state.content  = content;
    state.dirty    = false;

    elEditor.value = content;
    elEditor.disabled = false;
    elCurrentFile.textContent = path.split(/[/\\]/).pop();
    elHeaderSep.classList.remove('hidden');
    elBtnSave.disabled = true;
    setStatus('');
    if (window.sane?.onFileOpen) window.sane.onFileOpen(path);
  } catch (err) {
    setStatus('Failed to open: ' + err.message, 'err');
    console.error('[sane] /file GET error', err);
  }
}

// ── Save File ─────────────────────────────────────────────
async function saveFile() {
  if (!state.filePath) return;
  console.log('[sane] Saving:', state.filePath);
  setStatus('Saving…', 'info');

  try {
    await apiFetch('/file?path=' + encodeURIComponent(state.filePath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: elEditor.value }),
    });

    state.content = elEditor.value;
    state.dirty   = false;
    elBtnSave.disabled = true;
    elCurrentFile.textContent = state.filePath.split(/[/\\]/).pop();
    console.log('[sane] Saved OK');
    setStatus('Saved', 'ok');
  } catch (err) {
    setStatus('Save failed: ' + err.message, 'err');
    console.error('[sane] /file POST error', err);
  }
}

// ── Editor events ─────────────────────────────────────────
elEditor.addEventListener('input', () => {
  if (!state.dirty) {
    state.dirty = true;
    elBtnSave.disabled = false;
    elCurrentFile.textContent = state.filePath.split(/[/\\]/).pop() + ' ●';
  }
});

elEditor.addEventListener('keydown', (e) => {
  // Ctrl+S / Cmd+S → save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (!elBtnSave.disabled) saveFile();
  }
  // Tab → insert spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = elEditor.selectionStart;
    const v = elEditor.value;
    elEditor.value = v.slice(0, s) + '    ' + v.slice(elEditor.selectionEnd);
    elEditor.selectionStart = elEditor.selectionEnd = s + 4;
  }
});

// ── Button wiring ─────────────────────────────────────────
elBtnOpen.addEventListener('click', openFolder);
elBtnSave.addEventListener('click', saveFile);

document.getElementById('btn-sidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

(function () {
  const elOverlay = document.getElementById('kb-overlay');
  document.getElementById('btn-shortcuts').addEventListener('click', () =>
    elOverlay.classList.toggle('hidden'));
  document.getElementById('kb-close').addEventListener('click', () =>
    elOverlay.classList.add('hidden'));
  elOverlay.addEventListener('mousedown', (e) => {
    if (e.target === elOverlay) elOverlay.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elOverlay.classList.contains('hidden'))
      elOverlay.classList.add('hidden');
  });
})();

// ── Boot ──────────────────────────────────────────────────
elEditor.disabled = true;
waitForBackend().then(() => {
  setStatus('Ready', 'ok');
  console.log('[sane] Backend ready');
});
