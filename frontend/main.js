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

let _treeSnapshot = '';

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
const RECENT_KEY     = 'sane_recent_folders';
const RECENT_MAX     = 8;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}
function pushRecent(dir) {
  const list = [dir, ...getRecent().filter(p => p !== dir)].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  document.dispatchEvent(new CustomEvent('sane:recent-updated'));
}

async function loadFolder(dir) {
  setStatus('Loading…', 'info');
  try {
    const res   = await apiFetch('/files?path=' + encodeURIComponent(dir));
    const nodes = await res.json() || [];
    state.folder = dir;
    elFolderName.textContent = dir.split(/[/\\]/).pop();
    _treeSnapshot = JSON.stringify(nodes);
    renderTree(nodes);
    setStatus('Folder loaded', 'ok');
    pushRecent(dir);
    document.body.classList.add('has-folder');
  } catch (err) {
    setStatus('Failed to load folder: ' + err.message, 'err');
  }
}

async function openFolder() {
  let dir;
  try {
    const { open } = window.__TAURI__.dialog;
    dir = await open({ directory: true, multiple: false });
  } catch (err) {
    setStatus('Dialog error: ' + err.message, 'err');
    return;
  }
  if (!dir) { setStatus(''); return; }
  loadFolder(dir);
}

window.sane = window.sane || {};
window.sane.loadFolder = loadFolder;
window.sane.getRecent  = getRecent;

// ── File tree helpers ─────────────────────────────────────
function getExpandedPaths() {
  const paths = new Set();
  elTree.querySelectorAll('.tree-item.dir').forEach(row => {
    const sibling = row.nextElementSibling;
    if (sibling?.classList.contains('tree-children') && !sibling.classList.contains('hidden')) {
      paths.add(row.dataset.path);
    }
  });
  return paths;
}

function restoreExpandedPaths(paths) {
  if (!paths.size) return;
  elTree.querySelectorAll('.tree-item.dir').forEach(row => {
    if (paths.has(row.dataset.path)) row.click();
  });
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

    row.setAttribute('tabindex', '0');

    if (node.isDir) {
      let expanded = false;
      const childWrap = document.createElement('div');
      childWrap.className = 'tree-children hidden';
      if (node.children && node.children.length > 0) {
        buildTreeNodes(node.children, childWrap, depth + 1);
      }

      function toggleDir() {
        expanded = !expanded;
        icon.textContent = expanded ? '▾' : '▸';
        childWrap.classList.toggle('hidden', !expanded);
      }

      row.addEventListener('click', e => { e.stopPropagation(); toggleDir(); });
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ')        { e.preventDefault(); toggleDir(); }
        if (e.key === 'ArrowRight' && !expanded)        { e.preventDefault(); toggleDir(); }
        if (e.key === 'ArrowLeft'  &&  expanded)        { e.preventDefault(); toggleDir(); }
        if (e.key === 'ArrowLeft'  && !expanded) {
          e.preventDefault();
          row.closest('.tree-children')?.previousElementSibling?.focus();
        }
      });

      container.appendChild(row);
      container.appendChild(childWrap);
    } else {
      row.addEventListener('click', e => { e.stopPropagation(); openFile(node.path, row); });
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); openFile(node.path, row); }
      });
      container.appendChild(row);
    }
  }
}

// ── Open File ─────────────────────────────────────────────
const BINARY_EXTS = /\.(db|sqlite|sqlite3|png|jpg|jpeg|gif|bmp|ico|webp|pdf|zip|tar|gz|exe|dll|so)$/i;

async function openFile(path, rowEl) {
  setStatus('Opening…', 'info');

  // Mark selection
  document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
  if (rowEl) rowEl.classList.add('selected');

  if (state.dirty) {
    const ok = confirm('Unsaved changes. Discard and open?');
    if (!ok) return;
  }

  state.filePath = path;
  elCurrentFile.textContent = path.split(/[/\\]/).pop();
  elHeaderSep.classList.remove('hidden');

  // Binary / non-text files: delegate entirely to onFileOpen hooks, skip editor loading
  if (BINARY_EXTS.test(path)) {
    state.content = '';
    state.dirty   = false;
    elEditor.value = '';
    setStatus('');
    if (window.sane?.onFileOpen) window.sane.onFileOpen(path);
    return;
  }

  try {
    const res = await apiFetch('/file?path=' + encodeURIComponent(path));
    const content = await res.text();

    state.content  = content;
    state.dirty    = false;

    elEditor.value = content;
    elEditor.disabled = false;
    elBtnSave.disabled = true;
    setStatus('');
    if (window.sane?.onFileOpen) window.sane.onFileOpen(path);
  } catch (err) {
    setStatus('Failed to open: ' + err.message, 'err');
  }
}

// ── Save File ─────────────────────────────────────────────
async function saveFile() {
  if (!state.filePath) return;
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
    setStatus('Saved', 'ok');
  } catch (err) {
    setStatus('Save failed: ' + err.message, 'err');
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

const AUTOPAIRS  = { '(': ')', '[': ']', '{': '}', "'": "'", '"': '"', '`': '`' };
const AUTOCLOSE  = new Set([')', ']', '}', "'", '"', '`']);

elEditor.addEventListener('keydown', (e) => {
  // Ctrl+S / Cmd+S → save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (!elBtnSave.disabled) saveFile();
    return;
  }

  // Tab → insert spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = elEditor.selectionStart;
    const v = elEditor.value;
    elEditor.value = v.slice(0, s) + '    ' + v.slice(elEditor.selectionEnd);
    elEditor.selectionStart = elEditor.selectionEnd = s + 4;
    return;
  }

  // Auto-pair: ( [ { ' " `
  if (AUTOPAIRS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const close = AUTOPAIRS[e.key];
    const s   = elEditor.selectionStart;
    const end = elEditor.selectionEnd;
    const v   = elEditor.value;
    e.preventDefault();
    if (s !== end) {
      // Wrap selection
      elEditor.value = v.slice(0, s) + e.key + v.slice(s, end) + close + v.slice(end);
      elEditor.selectionStart = s + 1;
      elEditor.selectionEnd   = end + 1;
    } else {
      // Insert pair and place cursor inside
      elEditor.value = v.slice(0, s) + e.key + close + v.slice(s);
      elEditor.selectionStart = elEditor.selectionEnd = s + 1;
    }
    elEditor.dispatchEvent(new Event('input'));
    return;
  }

  // Skip over closing char if it's already the next character
  if (AUTOCLOSE.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const s = elEditor.selectionStart;
    const v = elEditor.value;
    if (s === elEditor.selectionEnd && v[s] === e.key) {
      e.preventDefault();
      elEditor.selectionStart = elEditor.selectionEnd = s + 1;
      return;
    }
  }

  // Smart backspace: delete both chars of a pair
  if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const s = elEditor.selectionStart;
    const v = elEditor.value;
    if (s === elEditor.selectionEnd && s > 0 && AUTOPAIRS[v[s - 1]] === v[s]) {
      e.preventDefault();
      elEditor.value = v.slice(0, s - 1) + v.slice(s + 1);
      elEditor.selectionStart = elEditor.selectionEnd = s - 1;
      elEditor.dispatchEvent(new Event('input'));
    }
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

// ── File tree: ArrowUp/Down + Shift+F10 context menu ─────
elTree.addEventListener('keydown', e => {
  const items = [...elTree.querySelectorAll('.tree-item')].filter(el => {
    // only visible items (not inside a hidden children wrapper)
    return !el.closest('.tree-children.hidden');
  });
  const cur  = document.activeElement;
  const idx  = items.indexOf(cur);

  if (e.key === 'ArrowDown' && idx >= 0) {
    e.preventDefault();
    items[Math.min(idx + 1, items.length - 1)]?.focus();
    return;
  }
  if (e.key === 'ArrowUp' && idx >= 0) {
    e.preventDefault();
    items[Math.max(idx - 1, 0)]?.focus();
    return;
  }
  // Shift+F10 or Ctrl+. → open context menu at focused item
  if ((e.key === 'F10' && e.shiftKey) || (e.ctrlKey && e.key === '.')) {
    if (cur && cur.classList.contains('tree-item')) {
      e.preventDefault();
      const rect = cur.getBoundingClientRect();
      cur.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, clientX: rect.left + 8, clientY: rect.top + 8
      }));
    }
  }
});

// ── Expose tree refresh for other modules ─────────────────
window.sane = window.sane || {};
window.sane.refreshTree = async function () {
  if (!state.folder) return;
  try {
    const res   = await apiFetch('/files?path=' + encodeURIComponent(state.folder));
    const nodes = await res.json() || [];
    _treeSnapshot = JSON.stringify(nodes);
    renderTree(nodes);
  } catch (err) {
    setStatus('Refresh failed: ' + err.message, 'err');
  }
};
window.sane.openFile = (path) => openFile(path, null);


// ── Boot ──────────────────────────────────────────────────
elEditor.disabled = true;
waitForBackend().then(() => {
  const last = getRecent()[0];
  if (last) {
    loadFolder(last);
  } else {
    setStatus('Ready', 'ok');
  }
});

// ── Auto tree refresh (polls every 3s, skips during AI work) ──
setInterval(async () => {
  if (!state.folder || window.sane.isAIStreaming?.()) return;
  try {
    const res      = await apiFetch('/files?path=' + encodeURIComponent(state.folder));
    const nodes    = await res.json() || [];
    const snapshot = JSON.stringify(nodes);
    if (snapshot === _treeSnapshot) return;
    _treeSnapshot = snapshot;
    const expanded = getExpandedPaths();
    renderTree(nodes);
    restoreExpandedPaths(expanded);
  } catch {}
}, 3000);
