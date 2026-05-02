const API = 'http://localhost:7654';

const elTree        = document.getElementById('file-tree');
const elEditor      = document.getElementById('editor');
const elCurrentFile = document.getElementById('current-file');
const elFolderName  = document.getElementById('folder-name');
const elBtnSave     = document.getElementById('btn-save');

let currentPath      = null;
let isDirty          = false;
let selectedTreePath = null;
let ctxTarget        = null;
let treeDragStart    = null;
let treeDragGhost    = null;
let treeDragOverEl   = null;

// ── Backend health ────────────────────────────────────────

async function waitForBackend() {
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`${API}/ping`);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  console.error('sane-backend not reachable on :7654');
}

// ── Folder open ───────────────────────────────────────────

async function openFolder() {
  if (isDirty && !confirm('Unsaved changes. Continue?')) return;

  const { open } = window.__TAURI__.dialog;
  const dir = await open({ directory: true, multiple: false });
  if (!dir) return;

  currentFolder = dir;
  elFolderName.textContent = dir.split(/[/\\]/).pop();

  const res = await fetch(`${API}/files?path=${encodeURIComponent(dir)}`);
  if (!res.ok) { alert('Failed to list directory'); return; }

  const nodes = await res.json();
  allFiles = [];
  elTree.innerHTML = '';
  renderTree(nodes, elTree, 0);
  collectFiles(nodes);
}

async function refreshTree() {
  if (!currentFolder) return;
  const res = await fetch(`${API}/files?path=${encodeURIComponent(currentFolder)}`);
  if (!res.ok) return;
  const nodes = await res.json();
  allFiles = [];
  elTree.innerHTML = '';
  renderTree(nodes, elTree, 0);
  collectFiles(nodes);
  if (currentPath) {
    const row = findTreeItem(currentPath);
    if (row) row.classList.add('selected');
  }
}

// ── Tree rendering ────────────────────────────────────────

function renderTree(nodes, container, depth) {
  for (const node of nodes) {
    if (node.isDir) {
      const wrap = document.createElement('div');

      const row = document.createElement('div');
      row.className = 'tree-item dir';
      row.style.paddingLeft = `${8 + depth * 14}px`;
      row.dataset.path  = node.path;
      row.dataset.isDir = '1';
      row.innerHTML = `<span class="arrow">▶</span><span class="tree-name">${escapeHtml(node.name)}</span>`;

      const childWrap = document.createElement('div');
      childWrap.className = 'tree-children';

      if (node.children && node.children.length > 0) {
        renderTree(node.children, childWrap, depth + 1);
      }

      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('rename-input')) return;
        e.stopPropagation();
        const open = childWrap.classList.toggle('open');
        row.querySelector('.arrow').textContent = open ? '▼' : '▶';
        selectedTreePath = node.path;
      });

      row.addEventListener('contextmenu', (e) => {
        treeDragStart = null;
        e.preventDefault();
        e.stopPropagation();
        selectedTreePath = node.path;
        showCtxMenu(e, node.path, true);
      });

      row.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.classList.contains('arrow') || e.target.classList.contains('rename-input')) return;
        treeDragStart = { x: e.clientX, y: e.clientY, path: node.path, isDir: true, name: node.name, activated: false };
      });

      wrap.appendChild(row);
      wrap.appendChild(childWrap);
      container.appendChild(wrap);
    } else {
      const row = document.createElement('div');
      row.className = 'tree-item file';
      row.style.paddingLeft = `${8 + depth * 14}px`;
      row.dataset.path  = node.path;
      row.dataset.isDir = '0';
      row.innerHTML = `<span class="arrow"> </span><span class="tree-name">${escapeHtml(node.name)}</span>`;

      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('rename-input')) return;
        e.stopPropagation();
        selectedTreePath = node.path;
        openFile(node.path, row);
      });

      row.addEventListener('contextmenu', (e) => {
        treeDragStart = null;
        e.preventDefault();
        e.stopPropagation();
        selectedTreePath = node.path;
        showCtxMenu(e, node.path, false);
      });

      row.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.classList.contains('rename-input')) return;
        treeDragStart = { x: e.clientX, y: e.clientY, path: node.path, isDir: false, name: node.name, activated: false };
      });

      container.appendChild(row);
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── File open / save ──────────────────────────────────────

async function openFile(path, el) {
  if (isDirty && !confirm('Unsaved changes. Discard?')) return;
  clearErrorHighlight();

  document.querySelectorAll('.tree-item.selected')
    .forEach(e => e.classList.remove('selected'));
  el?.classList.add('selected');

  const res = await fetch(`${API}/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) { alert(`Cannot open: ${res.statusText}`); return; }

  elEditor.value = await res.text();
  currentPath = path;
  elCurrentFile.textContent = basename(path);
  elBtnSave.disabled = false;
  isDirty = false;
  const isPy = path.endsWith('.py');
  isPy ? enableHighlight() : disableHighlight();
  document.getElementById('btn-run').classList.toggle('hidden', !isPy);
  document.getElementById('py-env').classList.toggle('hidden', !isPy);
  if (isPy) detectPyEnv();
  updateLineNumbers();
  updateLineHighlight();
}

async function saveFile() {
  if (!currentPath) return;
  const res = await fetch(`${API}/file?path=${encodeURIComponent(currentPath)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: elEditor.value }),
  });
  if (res.ok) {
    isDirty = false;
    elCurrentFile.textContent = basename(currentPath);
  } else {
    alert('Save failed: ' + res.statusText);
  }
}

function basename(path) {
  return path.split(/[/\\]/).pop();
}

// ── Events ────────────────────────────────────────────────

elEditor.addEventListener('input', () => {
  if (!isDirty && currentPath) {
    isDirty = true;
    elCurrentFile.textContent = basename(currentPath) + ' ●';
  }
  refreshHighlight();
  updateLineNumbers();
});

document.getElementById('btn-open').addEventListener('click', openFolder);
elBtnSave.addEventListener('click', saveFile);

// ── Python-friendly editing ───────────────────────────────

function markDirty() {
  if (!isDirty && currentPath) {
    isDirty = true;
    elCurrentFile.textContent = basename(currentPath) + ' ●';
  }
}

// Low-level splice: replace [start, start+del) with ins, place cursor after ins
function editorSplice(start, del, ins) {
  const v = elEditor.value;
  elEditor.value = v.slice(0, start) + ins + v.slice(start + del);
  const p = start + ins.length;
  elEditor.setSelectionRange(p, p);
  markDirty();
  refreshHighlight();
  updateLineNumbers();
}

function lineStartOf(pos) {
  return elEditor.value.lastIndexOf('\n', pos - 1) + 1;
}

function editorIndent() {
  const { value: v, selectionStart: ss, selectionEnd: se } = elEditor;
  if (ss === se) { editorSplice(ss, 0, '    '); return; }

  const ls    = lineStartOf(ss);
  const lines = v.slice(ls, se).split('\n');
  const out   = lines.map(l => '    ' + l).join('\n');
  elEditor.value = v.slice(0, ls) + out + v.slice(se);
  elEditor.setSelectionRange(ss + 4, se + lines.length * 4);
  markDirty();
}

function editorDedent() {
  const { value: v, selectionStart: ss, selectionEnd: se } = elEditor;
  const ls      = lineStartOf(ss);
  const lineEnd = v.indexOf('\n', ss);
  const end     = ss === se ? (lineEnd === -1 ? v.length : lineEnd) : se;

  const lines   = v.slice(ls, end).split('\n');
  const out     = lines.map(l => l.replace(/^ {1,4}/, ''));
  const removed = lines.map((l, i) => l.length - out[i].length);
  const result  = out.join('\n');

  elEditor.value = v.slice(0, ls) + result + v.slice(end);

  const newSS = Math.max(ls, ss - removed[0]);
  const newSE = ss === se ? newSS : se - removed.reduce((a, b) => a + b, 0);
  elEditor.setSelectionRange(newSS, newSE);
  markDirty();
}

function editorEnter() {
  const { value: v, selectionStart: ss, selectionEnd: se } = elEditor;
  const ls     = lineStartOf(ss);
  const indent = v.slice(ls, ss).match(/^( *)/)[1];
  const extra  = v.slice(ls, ss).trimEnd().endsWith(':') ? '    ' : '';
  editorSplice(ss, se - ss, '\n' + indent + extra);
}

function editorSmartBackspace() {
  const { value: v, selectionStart: ss, selectionEnd: se } = elEditor;
  if (ss !== se) return false;
  const before = v.slice(lineStartOf(ss), ss);
  if (!/^ +$/.test(before)) return false;
  const remove = before.length % 4 || 4;
  editorSplice(ss - remove, remove, '');
  return true;
}

// ── Pair auto-complete ────────────────────────────────────

const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };

function editorPairBackspace() {
  const { value: v, selectionStart: ss, selectionEnd: se } = elEditor;
  if (ss !== se || ss === 0) return false;
  const prev = v[ss - 1], next = v[ss];
  if (PAIRS[prev] !== undefined && PAIRS[prev] === next) {
    editorSplice(ss - 1, 2, '');
    return true;
  }
  return false;
}

function handlePairs(e) {
  const { value: v, selectionStart: ss, selectionEnd: se } = elEditor;
  const ch = e.key;
  if (ch.length !== 1) return false;

  const closer   = PAIRS[ch];
  const isCloser = ch === ')' || ch === ']' || ch === '}';
  const isQuote  = ch === '"' || ch === "'";

  // Skip over existing closing bracket or quote
  if ((isCloser || isQuote) && ss === se && v[ss] === ch) {
    elEditor.setSelectionRange(ss + 1, ss + 1);
    return true;
  }

  // Opening bracket → insert pair; wraps any active selection
  if (closer && !isQuote) {
    const sel = v.slice(ss, se);
    editorSplice(ss, se - ss, ch + sel + closer);
    elEditor.setSelectionRange(ss + 1, ss + 1 + sel.length);
    return true;
  }

  // Quote → conditional auto-close
  if (isQuote) {
    const prev = v[ss - 1], prev2 = v[ss - 2];
    if (ss === se && /\w/.test(prev))             return false; // apostrophes: it's
    if (ss === se && prev === ch && prev2 === ch)  return false; // avoid """" runaway
    const sel = v.slice(ss, se);
    editorSplice(ss, se - ss, ch + sel + ch);
    elEditor.setSelectionRange(ss + 1, ss + 1 + sel.length);
    return true;
  }

  return false;
}

elEditor.addEventListener('keydown', e => {
  // Autocomplete navigation (takes priority when dropdown is open)
  if (acItems.length > 0) {
    if (e.key === 'ArrowDown')               { e.preventDefault(); acMove(1);  return; }
    if (e.key === 'ArrowUp')                 { e.preventDefault(); acMove(-1); return; }
    if (e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); confirmAutocomplete(); return; }
    if (e.key === 'Escape')                  { e.preventDefault(); closeAutocomplete(); return; }
    if (e.key.length === 1 || e.key === 'Backspace') closeAutocomplete();
  }

  // Ctrl+. → autocomplete
  if ((e.ctrlKey || e.metaKey) && e.key === '.') { e.preventDefault(); openAutocomplete(); return; }

  if (e.key === 'Tab') {
    e.preventDefault();
    e.shiftKey ? editorDedent() : editorIndent();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    editorEnter();
  } else if (e.key === 'Backspace') {
    if (editorPairBackspace() || editorSmartBackspace()) e.preventDefault();
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (handlePairs(e)) e.preventDefault();
  }
});

// ── Syntax highlight ──────────────────────────────────────

const PY_KEYWORDS = new Set([
  'False','None','True','and','as','assert','async','await',
  'break','class','continue','def','del','elif','else','except',
  'finally','for','from','global','if','import','in','is',
  'lambda','nonlocal','not','or','pass','raise','return',
  'try','while','with','yield',
]);

function highlightPython(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];

    // Triple-quoted strings (must check before single-quoted)
    if ((ch === '"' || ch === "'") && code[i + 1] === ch && code[i + 2] === ch) {
      const q = ch + ch + ch;
      let j = i + 3;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code.startsWith(q, j)) { j += 3; break; }
        j++;
      }
      if (j > code.length) j = code.length;
      out += `<span class="hl-str">${escapeHtml(code.slice(i, j))}</span>`;
      i = j; continue;
    }

    // Single-line string
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== ch && code[j] !== '\n') {
        if (code[j] === '\\') j++;
        j++;
      }
      if (code[j] === ch) j++;
      out += `<span class="hl-str">${escapeHtml(code.slice(i, j))}</span>`;
      i = j; continue;
    }

    // Comment
    if (ch === '#') {
      let j = i;
      while (j < code.length && code[j] !== '\n') j++;
      out += `<span class="hl-comment">${escapeHtml(code.slice(i, j))}</span>`;
      i = j; continue;
    }

    // Decorator
    if (ch === '@') {
      let j = i + 1;
      while (j < code.length && /\w/.test(code[j])) j++;
      out += `<span class="hl-deco">${escapeHtml(code.slice(i, j))}</span>`;
      i = j; continue;
    }

    // Number (not preceded by a word char)
    if (/\d/.test(ch) && (i === 0 || !/\w/.test(code[i - 1]))) {
      let j = i;
      while (j < code.length && /[\d._xXbBoO]/.test(code[j])) j++;
      out += `<span class="hl-num">${escapeHtml(code.slice(i, j))}</span>`;
      i = j; continue;
    }

    // Identifier: keyword, function call, or plain name
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < code.length && /\w/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (PY_KEYWORDS.has(word)) {
        out += `<span class="hl-kw">${escapeHtml(word)}</span>`;
      } else if (code[j] === '(') {
        out += `<span class="hl-fn">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
      i = j; continue;
    }

    out += escapeHtml(ch);
    i++;
  }
  return out;
}

let hlTimer = null;

function doRefreshHighlight() {
  const wrap = document.getElementById('editor-wrap');
  if (!wrap || !wrap.classList.contains('hl-active')) return;
  document.getElementById('editor-highlight').innerHTML = highlightPython(elEditor.value);
  syncHighlightScroll();
}

function refreshHighlight() {
  clearTimeout(hlTimer);
  hlTimer = setTimeout(doRefreshHighlight, 150);
}

function syncHighlightScroll() {
  const hl = document.getElementById('editor-highlight');
  if (!hl) return;
  hl.scrollTop  = elEditor.scrollTop;
  hl.scrollLeft = elEditor.scrollLeft;
}

function enableHighlight() {
  document.getElementById('editor-wrap').classList.add('hl-active');
  doRefreshHighlight();
}

function disableHighlight() {
  document.getElementById('editor-wrap').classList.remove('hl-active');
  document.getElementById('editor-highlight').innerHTML = '';
}

elEditor.addEventListener('scroll', () => {
  syncHighlightScroll();
  syncLineNumbersScroll();
  requestAnimationFrame(updateLineHighlight);
});

// ── Editor chrome (line numbers + current-line highlight) ──

function syncLineNumbersScroll() {
  const el = document.getElementById('line-numbers');
  if (el) el.scrollTop = elEditor.scrollTop;
}

function updateLineNumbers() {
  const el = document.getElementById('line-numbers');
  if (!el) return;
  const count = (elEditor.value.match(/\n/g) || []).length + 1;
  if (+el.dataset.count !== count) {
    el.dataset.count = count;
    let html = '';
    for (let i = 1; i <= count; i++) html += `<div>${i}</div>`;
    el.innerHTML = html;
  }
  el.scrollTop = elEditor.scrollTop;
}

function updateLineHighlight() {
  const el = document.getElementById('line-highlight');
  if (!el) return;
  const lh  = parseFloat(getComputedStyle(elEditor).lineHeight);
  const row = elEditor.value.slice(0, elEditor.selectionStart).split('\n').length - 1;
  el.style.top    = `${18 + row * lh - elEditor.scrollTop}px`;
  el.style.height = `${lh}px`;
}

elEditor.addEventListener('keyup',  () => requestAnimationFrame(updateLineHighlight));
elEditor.addEventListener('click',  updateLineHighlight);

// Bootstrap chrome on load (1 empty line)
updateLineNumbers();
updateLineHighlight();

// ── Init ──────────────────────────────────────────────────

waitForBackend().then(initAIPlugin);

// ── File index ────────────────────────────────────────────

let allFiles = [];

function collectFiles(nodes) {
  for (const node of nodes) {
    if (!node.isDir) allFiles.push(node);
    if (node.children) collectFiles(node.children);
  }
}

// ── Sidebar toggle ────────────────────────────────────────

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('hidden');
}

// ── Quick Open ────────────────────────────────────────────

let qoSelected = 0;
let qoResults  = [];

function openQuickOpen() {
  const input = document.getElementById('quick-open-input');
  document.getElementById('quick-open').classList.remove('hidden');
  input.value = '';
  input.focus();
  filterFiles('');
}

function closeQuickOpen() {
  document.getElementById('quick-open').classList.add('hidden');
}

function filterFiles(query) {
  qoSelected = 0;

  if (query.startsWith('>')) {
    qoResults = filterCommands(query.slice(1).trimStart());
  } else {
    const q = query.toLowerCase();
    qoResults = q
      ? allFiles.filter(f => f.name.toLowerCase().includes(q))
      : allFiles.slice(0, 50);
  }

  renderQuickList(query);
}

function filterCommands(q) {
  const commands = [
    { name: 'toggle sidebar',  action: toggleSidebar },
    { name: 'save file',       action: saveFile },
    { name: 'global search',   action: openGlobalSearch },
    { name: 'theme',           action: openThemePanel },
    { name: 'new folder',      action: () => openNewFolderDialog() },
  ];
  return q ? commands.filter(c => c.name.includes(q.toLowerCase())) : commands;
}

function renderQuickList(query) {
  const list = document.getElementById('quick-open-list');
  list.innerHTML = '';

  if (qoResults.length === 0) {
    list.innerHTML = '<div class="qo-empty">no results</div>';
    return;
  }

  const isCmd = query.startsWith('>');

  qoResults.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'qo-item' + (i === qoSelected ? ' selected' : '');

    if (isCmd) {
      el.innerHTML = `<span class="qo-name">&gt;&nbsp;${escapeHtml(item.name)}</span>`;
    } else {
      el.innerHTML = `<span class="qo-name">${highlightMatch(item.name, query.toLowerCase())}</span>`
                   + `<span class="qo-path">${escapeHtml(item.path)}</span>`;
    }

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      confirmSelection(item, isCmd);
    });

    list.appendChild(el);
  });
}

function highlightMatch(name, q) {
  if (!q) return escapeHtml(name);
  const idx = name.toLowerCase().indexOf(q);
  if (idx === -1) return escapeHtml(name);
  return escapeHtml(name.slice(0, idx))
    + `<mark>${escapeHtml(name.slice(idx, idx + q.length))}</mark>`
    + escapeHtml(name.slice(idx + q.length));
}

function handleKeyboardNavigation(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    qoSelected = Math.min(qoSelected + 1, qoResults.length - 1);
    updateQoSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    qoSelected = Math.max(qoSelected - 1, 0);
    updateQoSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const isCmd = document.getElementById('quick-open-input').value.startsWith('>');
    confirmSelection(qoResults[qoSelected], isCmd);
  } else if (e.key === 'Escape') {
    closeQuickOpen();
  }
}

function updateQoSelection() {
  document.querySelectorAll('.qo-item').forEach((el, i) => {
    el.classList.toggle('selected', i === qoSelected);
  });
  document.querySelectorAll('.qo-item')[qoSelected]?.scrollIntoView({ block: 'nearest' });
}

function confirmSelection(item, isCmd) {
  if (!item) return;
  closeQuickOpen();
  if (isCmd) item.action();
  else openFile(item.path, findTreeItem(item.path));
}

function findTreeItem(path) {
  for (const el of document.querySelectorAll('.tree-item')) {
    if (el.dataset.path === path) return el;
  }
  return null;
}

// ── Global keyboard shortcuts ─────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'F2' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (document.activeElement !== elEditor && selectedTreePath) {
      e.preventDefault();
      startRename(selectedTreePath);
    }
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.altKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); openGridEditor(); return; }
  if (e.key === 'p') { e.preventDefault(); openQuickOpen(); }
  if (e.key === 'n') { e.preventDefault(); openNewFileDialog(); }
  if (e.key === 'N') { e.preventDefault(); openNewFolderDialog(); }
  if (e.key === '`') { e.preventDefault(); toggleTerminal(); }
  if (e.key === 's') { e.preventDefault(); saveFile(); }
  if (e.key === 'b') { e.preventDefault(); toggleSidebar(); }
  if (e.shiftKey && e.key === 'F') { e.preventDefault(); openGlobalSearch(); }
  if (e.shiftKey && (e.key === 'O' || e.key === 'o')) { e.preventDefault(); openFloatingOutput(); }
  if (e.shiftKey && (e.key === 'K' || e.key === 'k')) { e.preventDefault(); killRun(); }
  if (e.key === ',') { e.preventDefault(); openThemePanel(); }
  if (e.key === 'Enter') { e.preventDefault(); runPython(); }
});

// ── Quick Open event wiring ───────────────────────────────

const elQoInput = document.getElementById('quick-open-input');
elQoInput.addEventListener('keydown', handleKeyboardNavigation);
elQoInput.addEventListener('input', (e) => filterFiles(e.target.value));
document.getElementById('quick-open-backdrop').addEventListener('click', closeQuickOpen);

// ── Global Search ─────────────────────────────────────────

let currentFolder = null;
let gsDebounce    = null;
let gsFlat        = [];
let gsSelected    = -1;

function openGlobalSearch(prefill) {
  if (!currentFolder) return;
  document.getElementById('global-search').classList.remove('hidden');
  const input = document.getElementById('gs-input');
  input.value = prefill || '';
  input.focus();
  if (prefill) input.select();
  document.getElementById('gs-results').innerHTML = '';
  document.getElementById('gs-count').textContent = '';
  gsFlat     = [];
  gsSelected = -1;
  if (prefill) performSearch(prefill);
}

function closeGlobalSearch() {
  document.getElementById('global-search').classList.add('hidden');
}

function performSearch(query) {
  clearTimeout(gsDebounce);
  if (!query.trim()) {
    document.getElementById('gs-results').innerHTML = '';
    document.getElementById('gs-count').textContent = '';
    return;
  }
  gsDebounce = setTimeout(async () => {
    const url = `${API}/search?root=${encodeURIComponent(currentFolder)}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return;
    renderResults(await res.json(), query);
  }, 200);
}

function renderResults(results, query) {
  const container = document.getElementById('gs-results');
  const countEl   = document.getElementById('gs-count');
  container.innerHTML = '';
  gsFlat     = [];
  gsSelected = -1;

  if (!results.length) {
    container.innerHTML = '<div class="gs-empty">no results</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;

  const q = query.toLowerCase();

  // Group by file
  const byFile = new Map();
  for (const r of results) {
    if (!byFile.has(r.path)) byFile.set(r.path, []);
    byFile.get(r.path).push(r);
  }

  for (const [path, matches] of byFile) {
    const group = document.createElement('div');
    group.className = 'gs-file-group';

    const header = document.createElement('div');
    header.className = 'gs-file-header';
    header.innerHTML = `<span class="gs-file-arrow">▼</span>`
                     + `<span class="gs-file-name">${escapeHtml(basename(path))}</span>`
                     + `<span class="gs-file-count">${matches.length}</span>`;

    const matchList = document.createElement('div');
    matchList.className = 'gs-matches';

    header.addEventListener('click', () => {
      const collapsed = matchList.classList.toggle('collapsed');
      header.querySelector('.gs-file-arrow').textContent = collapsed ? '▶' : '▼';
    });

    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'gs-match';
      row.innerHTML = `<span class="gs-line-num">${m.line}</span>`
                    + `<span class="gs-line-content">${highlightMatch(m.content, q)}</span>`;

      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        openFileAtLine(m.path, m.line);
        closeGlobalSearch();
      });

      gsFlat.push({ el: row, path: m.path, line: m.line });
      matchList.appendChild(row);
    }

    group.appendChild(header);
    group.appendChild(matchList);
    container.appendChild(group);
  }
}

function handleGsNavigation(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    gsSelected = Math.min(gsSelected + 1, gsFlat.length - 1);
    updateGsSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    gsSelected = Math.max(gsSelected - 1, 0);
    updateGsSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = gsFlat[gsSelected];
    if (item) { openFileAtLine(item.path, item.line); closeGlobalSearch(); }
  } else if (e.key === 'Escape') {
    closeGlobalSearch();
  }
}

function updateGsSelection() {
  gsFlat.forEach(({ el }, i) => el.classList.toggle('selected', i === gsSelected));
  gsFlat[gsSelected]?.el.scrollIntoView({ block: 'nearest' });
}

async function openFileAtLine(path, line) {
  await openFile(path, findTreeItem(path));
  scrollToLine(line);
}

function scrollToLine(lineNum) {
  const lines = elEditor.value.split('\n');
  let offset = 0;
  for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) {
    offset += lines[i].length + 1;
  }
  const lineLen = (lines[lineNum - 1] || '').length;
  elEditor.focus();
  elEditor.setSelectionRange(offset, offset + lineLen);
  const ratio = (lineNum - 1) / Math.max(lines.length - 1, 1);
  elEditor.scrollTop = ratio * (elEditor.scrollHeight - elEditor.clientHeight);
}

// ── Global Search event wiring ────────────────────────────

const elGsInput = document.getElementById('gs-input');
elGsInput.addEventListener('keydown', handleGsNavigation);
elGsInput.addEventListener('input', (e) => performSearch(e.target.value));
document.getElementById('gs-backdrop').addEventListener('click', closeGlobalSearch);

// ── AI Panel ──────────────────────────────────────────────

let activeModel = null;
let aiModels    = [];

function openAIPanel() {
  document.getElementById('ai-panel').classList.remove('hidden');
  loadModels();
}

function closeAIPanel() {
  document.getElementById('ai-panel').classList.add('hidden');
}

async function loadModels() {
  const statusEl = document.getElementById('ai-ollama-status');
  statusEl.textContent = 'connecting…';
  document.getElementById('ai-model-list').innerHTML = '';

  try {
    const res = await fetch(`${API}/ai/models`);
    if (!res.ok) {
      statusEl.textContent = await res.text();
      return;
    }
    aiModels = await res.json();
    statusEl.textContent = 'ollama running';
    renderModelList();
  } catch {
    statusEl.textContent = 'backend unavailable';
  }
}

function renderModelList() {
  const list = document.getElementById('ai-model-list');
  list.innerHTML = '';

  for (const model of aiModels) {
    const isActive  = model.name === activeModel;
    const isPulling = pullPolls[model.name] !== undefined;
    const row = document.createElement('div');
    row.className    = 'ai-row' + (isActive ? ' active' : '');
    row.dataset.model = model.name;

    const nameEl = document.createElement('span');
    nameEl.className = 'ai-row-name';
    nameEl.textContent = model.name;

    const sizeEl = document.createElement('span');
    sizeEl.className = 'ai-row-size' + (model.installed ? ' local' : '');
    sizeEl.textContent = model.size || '';

    const btn = document.createElement('button');
    btn.className = 'ai-row-btn';

    if (isActive) {
      btn.textContent = 'active';
      btn.classList.add('is-active');
      btn.disabled = true;
    } else if (isPulling) {
      btn.disabled    = true;
      btn.textContent = '…';
      sizeEl.textContent = 'pulling…';
    } else if (model.installed) {
      btn.textContent = 'use';
      btn.addEventListener('click', () => setActiveModel(model.name));
    } else {
      btn.textContent = 'pull';
      btn.addEventListener('click', () => installModel(model, btn, sizeEl));
    }

    row.appendChild(nameEl);
    row.appendChild(sizeEl);
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// ── Model pull + polling ──────────────────────────────────

const pullPolls = {}; // name → timer id (undefined = not pulling)

async function installModel(model, btn, sizeEl) {
  btn.disabled = true;
  sizeEl.textContent = 'starting…';

  try {
    await fetch(`${API}/ai/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model.name }),
    });
    schedulePullPoll(model.name);
  } catch {
    btn.textContent = 'pull';
    btn.disabled = false;
    sizeEl.textContent = model.size || '';
  }
}

function schedulePullPoll(name) {
  clearTimeout(pullPolls[name]);
  pullPolls[name] = setTimeout(() => pollPull(name), 1200);
}

async function pollPull(name) {
  try {
    const res = await fetch(`${API}/ai/pull/status?name=${encodeURIComponent(name)}`);
    const st  = await res.json();
    applyPullState(name, st);
    if (st.running) {
      schedulePullPoll(name);
    } else {
      delete pullPolls[name];
    }
  } catch {
    schedulePullPoll(name);
  }
}

function applyPullState(name, st) {
  const row = document.querySelector(`#ai-model-list [data-model="${CSS.escape(name)}"]`);
  if (!row) return;

  const sizeEl = row.querySelector('.ai-row-size');
  const btn    = row.querySelector('.ai-row-btn');

  if (st.running) {
    btn.disabled    = true;
    btn.textContent = '…';
    if (st.total > 0) {
      const pct = Math.round(st.completed / st.total * 100);
      sizeEl.textContent = `${pct}%`;
    } else {
      sizeEl.textContent = st.status || 'pulling…';
    }
    return;
  }

  if (st.done && !st.error) {
    const model = aiModels.find(m => m.name === name);
    if (model) model.installed = true;
    sizeEl.classList.add('local');
    sizeEl.textContent = model?.size || '';
    btn.disabled    = false;
    btn.textContent = 'use';
    btn.onclick     = () => setActiveModel(name);
    return;
  }

  if (st.done || st.error) {
    btn.disabled    = false;
    btn.textContent = 'retry';
    sizeEl.textContent = 'failed';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  for (const name of Object.keys(pullPolls)) {
    clearTimeout(pullPolls[name]);
    pollPull(name);
  }
});

function setActiveModel(name) {
  activeModel = name;
  const indicator = document.getElementById('ai-indicator');
  indicator.textContent = name;
  indicator.classList.remove('hidden');
  renderModelList();
}

document.getElementById('btn-ai').addEventListener('click', handleAIClick);
document.getElementById('ai-backdrop').addEventListener('click', closeAIPanel);

// ── AI Plugin install flow ────────────────────────────────

let ollamaInstalled = false;

async function initAIPlugin() {
  try {
    const res = await fetch(`${API}/ai/check`);
    const data = await res.json();
    ollamaInstalled = data.installed;
    if (ollamaInstalled) {
      document.getElementById('btn-ai').classList.add('ready');
    }
  } catch { }
}

async function handleAIClick() {
  if (ollamaInstalled) { openAIPanel(); return; }

  try {
    const res = await fetch(`${API}/ai/check`);
    const data = await res.json();
    ollamaInstalled = data.installed;
    if (ollamaInstalled) {
      document.getElementById('btn-ai').classList.add('ready');
      openAIPanel();
      return;
    }
  } catch { }

  document.getElementById('ai-install').classList.remove('hidden');
}

document.getElementById('aii-dismiss').addEventListener('click', () => {
  document.getElementById('ai-install').classList.add('hidden');
});

document.getElementById('aii-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('aii-cmd-text').textContent).catch(() => {});
});

// ── New file dialog ───────────────────────────────────────

function openNewFileDialog(targetFolder) {
  if (!currentFolder) {
    const btn = document.getElementById('btn-open');
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 600);
    return;
  }
  const parent = (typeof targetFolder === 'string') ? targetFolder : currentFolder;
  document.getElementById('new-file-folder').textContent = basename(parent);
  document.getElementById('new-file').dataset.parent = parent;
  const input = document.getElementById('new-file-input');
  input.value = '';
  document.getElementById('new-file').classList.remove('hidden');
  requestAnimationFrame(() => input.focus());
}

function closeNewFileDialog() {
  document.getElementById('new-file').classList.add('hidden');
}

async function confirmNewFile() {
  let name = document.getElementById('new-file-input').value.trim();
  if (!name) return;
  if (!name.includes('.')) name += '.py';

  const parent = document.getElementById('new-file').dataset.parent || currentFolder;
  const sep = parent.includes('\\') ? '\\' : '/';
  const filePath = parent.replace(/[/\\]+$/, '') + sep + name;
  closeNewFileDialog();

  try {
    const res = await fetch(`${API}/file?path=${encodeURIComponent(filePath)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    });
    if (!res.ok) { alert(`Could not create: ${await res.text()}`); return; }
    await refreshTree();
    await openFile(filePath, findTreeItem(filePath));
  } catch (err) {
    alert(`Error: ${err}`);
  }
}

document.getElementById('new-file-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmNewFile(); }
  if (e.key === 'Escape') closeNewFileDialog();
});
document.getElementById('new-file-backdrop').addEventListener('click', closeNewFileDialog);

// ── New folder dialog ─────────────────────────────────────

let newFolderParent = null;

function openNewFolderDialog(targetFolder) {
  if (!currentFolder) {
    const btn = document.getElementById('btn-open');
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 600);
    return;
  }
  newFolderParent = (typeof targetFolder === 'string') ? targetFolder : currentFolder;
  document.getElementById('new-folder-parent').textContent = basename(newFolderParent);
  const input = document.getElementById('new-folder-input');
  input.value = '';
  document.getElementById('new-folder').classList.remove('hidden');
  requestAnimationFrame(() => input.focus());
}

function closeNewFolderDialog() {
  document.getElementById('new-folder').classList.add('hidden');
}

async function confirmNewFolder() {
  const name = document.getElementById('new-folder-input').value.trim();
  if (!name) return;
  const parent = newFolderParent || currentFolder;
  const sep = parent.includes('\\') ? '\\' : '/';
  const folderPath = parent.replace(/[/\\]+$/, '') + sep + name;
  closeNewFolderDialog();
  try {
    const res = await fetch(`${API}/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    });
    if (!res.ok) { alert(await res.text()); return; }
    await refreshTree();
  } catch (err) {
    alert(`Error: ${err}`);
  }
}

document.getElementById('new-folder-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmNewFolder(); }
  if (e.key === 'Escape') closeNewFolderDialog();
});
document.getElementById('new-folder-backdrop').addEventListener('click', closeNewFolderDialog);

// ── Context menu ──────────────────────────────────────────

function showCtxMenu(e, path, isDir) {
  if (!document.getElementById('grid-editor').classList.contains('hidden')) return;
  ctxTarget = { path, isDir };

  document.getElementById('ctx-new-file').classList.toggle('hidden', !isDir);
  document.getElementById('ctx-new-folder').classList.toggle('hidden', !isDir);
  document.getElementById('ctx-sep').classList.toggle('hidden', !isDir);

  const menu = document.getElementById('ctx-menu');
  menu.style.visibility = 'hidden';
  menu.classList.remove('hidden');
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let x = e.clientX, y = e.clientY;
  if (x + mw > window.innerWidth)  x = window.innerWidth  - mw - 4;
  if (y + mh > window.innerHeight) y = window.innerHeight - mh - 4;
  menu.style.left = `${x}px`;
  menu.style.top  = `${y}px`;
  menu.style.visibility = '';
}

function closeCtxMenu() {
  document.getElementById('ctx-menu').classList.add('hidden');
  ctxTarget = null;
}

document.addEventListener('mousedown', (e) => {
  if (!document.getElementById('ctx-menu').contains(e.target)) closeCtxMenu();
});

document.getElementById('ctx-new-file').addEventListener('click', () => {
  const path = ctxTarget?.path;
  closeCtxMenu();
  openNewFileDialog(path);
});
document.getElementById('ctx-new-folder').addEventListener('click', () => {
  const path = ctxTarget?.path;
  closeCtxMenu();
  openNewFolderDialog(path);
});
document.getElementById('ctx-rename').addEventListener('click', () => {
  const target = ctxTarget;
  closeCtxMenu();
  if (target) startRename(target.path);
});
document.getElementById('ctx-delete').addEventListener('click', () => {
  const target = ctxTarget;
  closeCtxMenu();
  if (target) deleteItem(target.path, target.isDir);
});

document.getElementById('file-tree').addEventListener('contextmenu', (e) => {
  if (e.target.closest('.tree-item')) return;
  e.preventDefault();
  if (!currentFolder) return;
  showCtxMenu(e, currentFolder, true);
});

// ── Inline rename ─────────────────────────────────────────

function startRename(path) {
  if (!path) return;
  const targetRow = findTreeItem(path);
  if (!targetRow) return;

  const nameSpan = targetRow.querySelector('.tree-name');
  if (!nameSpan) return;

  const originalName = nameSpan.textContent;
  const isDir = targetRow.dataset.isDir === '1';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = originalName;
  nameSpan.replaceWith(input);
  input.focus();
  if (!isDir && originalName.includes('.')) {
    input.setSelectionRange(0, originalName.lastIndexOf('.'));
  } else {
    input.select();
  }

  let done = false;

  async function doRename() {
    if (done) return;
    done = true;
    const newName = input.value.trim();
    if (!newName || newName === originalName) { doCancel(); return; }

    const sep = path.includes('\\') ? '\\' : '/';
    const parentDir = path.includes('\\')
      ? path.slice(0, path.lastIndexOf('\\'))
      : path.slice(0, path.lastIndexOf('/'));
    const newPath = parentDir + sep + newName;

    try {
      const res = await fetch(`${API}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: path, to: newPath }),
      });
      if (!res.ok) { alert(await res.text()); done = false; doCancel(); return; }

      if (currentPath) {
        const srcN = path.replace(/\\/g, '/');
        const curN = currentPath.replace(/\\/g, '/');
        if (curN === srcN) {
          currentPath = newPath;
          elCurrentFile.textContent = newName + (isDirty ? ' ●' : '');
        } else if (isDir && curN.startsWith(srcN + '/')) {
          currentPath = newPath + currentPath.slice(path.length);
          elCurrentFile.textContent = basename(currentPath) + (isDirty ? ' ●' : '');
        }
      }
      await refreshTree();
    } catch (err) {
      alert(String(err)); done = false; doCancel();
    }
  }

  function doCancel() {
    done = true;
    if (input.parentNode) {
      const span = document.createElement('span');
      span.className = 'tree-name';
      span.textContent = originalName;
      input.replaceWith(span);
    }
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); doRename(); }
    if (e.key === 'Escape') { done = true; doCancel(); }
  });
  input.addEventListener('blur', () => { if (!done) doCancel(); });
}

// ── Delete item ───────────────────────────────────────────

async function deleteItem(path, isDir) {
  if (!path) return;
  const name = basename(path);
  const msg = isDir
    ? `Delete folder "${name}" and all its contents? This cannot be undone.`
    : `Delete "${name}"? This cannot be undone.`;
  if (!confirm(msg)) return;

  try {
    const res = await fetch(`${API}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (!res.ok) { alert(await res.text()); return; }

    if (currentPath) {
      const srcN = path.replace(/\\/g, '/');
      const curN = currentPath.replace(/\\/g, '/');
      if (curN === srcN || (isDir && curN.startsWith(srcN + '/'))) {
        currentPath = null;
        elEditor.value = '';
        elCurrentFile.textContent = 'no file open';
        isDirty = false;
        elBtnSave.disabled = true;
        clearErrorHighlight();
        disableHighlight();
        updateLineNumbers();
        document.getElementById('btn-run').classList.add('hidden');
        document.getElementById('py-env').classList.add('hidden');
      }
    }
    await refreshTree();
  } catch (err) {
    alert(String(err));
  }
}

// ── Move to folder ────────────────────────────────────────

async function moveToFolder(srcPath, targetDir, srcIsDir) {
  const sep  = targetDir.includes('\\') ? '\\' : '/';
  const name = basename(srcPath);
  const destPath = targetDir.replace(/[/\\]+$/, '') + sep + name;

  if (srcPath === destPath) return;

  const srcN = srcPath.replace(/\\/g, '/');
  const dstN = destPath.replace(/\\/g, '/');
  if (srcIsDir && (dstN === srcN || dstN.startsWith(srcN + '/'))) {
    alert('Cannot move a folder into itself.');
    return;
  }

  try {
    const res = await fetch(`${API}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: srcPath, to: destPath }),
    });
    if (!res.ok) { alert(await res.text()); return; }

    if (currentPath) {
      const curN = currentPath.replace(/\\/g, '/');
      if (curN === srcN) {
        currentPath = destPath;
        elCurrentFile.textContent = name + (isDirty ? ' ●' : '');
      } else if (srcIsDir && curN.startsWith(srcN + '/')) {
        currentPath = destPath + currentPath.slice(srcPath.length);
        elCurrentFile.textContent = basename(currentPath) + (isDirty ? ' ●' : '');
      }
    }
    await refreshTree();
  } catch (err) {
    alert(String(err));
  }
}

// ── Tree drag & drop ──────────────────────────────────────

document.addEventListener('mousemove', (e) => {
  if (!treeDragStart) return;

  if (!treeDragStart.activated) {
    if (Math.abs(e.clientX - treeDragStart.x) < 5 && Math.abs(e.clientY - treeDragStart.y) < 5) return;
    treeDragStart.activated = true;
    treeDragGhost = document.createElement('div');
    treeDragGhost.id = 'tree-drag-ghost';
    treeDragGhost.textContent = treeDragStart.name;
    document.body.appendChild(treeDragGhost);
    document.body.style.cursor = 'grabbing';
  }

  treeDragGhost.style.left = e.clientX + 'px';
  treeDragGhost.style.top  = e.clientY + 'px';

  const el  = document.elementFromPoint(e.clientX, e.clientY);
  const row = el?.closest?.('.tree-item');
  const valid = row && row.dataset.isDir === '1' && row.dataset.path !== treeDragStart.path;

  if (treeDragOverEl && treeDragOverEl !== row) {
    treeDragOverEl.classList.remove('drag-over');
    treeDragOverEl = null;
  }
  if (valid) {
    row.classList.add('drag-over');
    treeDragOverEl = row;
  }
});

document.addEventListener('mouseup', (e) => {
  if (!treeDragStart) return;

  const info = treeDragStart;
  treeDragStart = null;

  if (treeDragGhost) { treeDragGhost.remove(); treeDragGhost = null; }

  const target = treeDragOverEl;
  if (treeDragOverEl) { treeDragOverEl.classList.remove('drag-over'); treeDragOverEl = null; }

  document.body.style.cursor = '';

  if (info.activated && target) moveToFolder(info.path, target.dataset.path, info.isDir);
});

// ── Error highlight ───────────────────────────────────────

function highlightErrorLine(lineNum) {
  const el = document.getElementById('error-highlight');
  if (!lineNum) { el.style.display = 'none'; return; }

  const lineH = parseFloat(getComputedStyle(elEditor).lineHeight);
  const padTop = 18;
  el.style.top    = (padTop + (lineNum - 1) * lineH) + 'px';
  el.style.height = lineH + 'px';
  el.style.display = 'block';

  // Jump cursor to the error line
  const lines = elEditor.value.split('\n');
  let pos = 0;
  for (let i = 0; i < lineNum - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  elEditor.setSelectionRange(pos, pos);
  elEditor.focus();

  // Scroll line into view (~1/3 from top)
  const targetTop = padTop + (lineNum - 1) * lineH - elEditor.clientHeight / 3;
  elEditor.scrollTop = Math.max(0, targetTop);
  syncHighlightScroll();
  syncLineNumbersScroll();
  updateLineHighlight();
}

function clearErrorHighlight() {
  const el = document.getElementById('error-highlight');
  if (el) el.style.display = 'none';
}

// ── Traceback parser ──────────────────────────────────────

function parseTraceback(stderr) {
  if (!stderr.includes('Traceback (most recent call last)')) return null;

  const lines  = stderr.trim().split('\n');
  const fileRe = /^\s+File "([^"]+)", line (\d+)/;

  let errorLineNum = null;
  let errorContext = '';

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(fileRe);
    if (!m) continue;
    const fp = m[1].replace(/\\/g, '/');
    const cp = (currentPath || '').replace(/\\/g, '/');
    if (cp && (fp === cp || fp.endsWith('/' + cp.split('/').pop()))) {
      errorLineNum = parseInt(m[2]);
      errorContext  = lines[i + 1]?.trim() || '';
    }
  }

  // Last non-indented, non-traceback line = the error message
  let errorMsg = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l && !l.startsWith('File ') && !l.startsWith('Traceback') &&
        !l.startsWith('During') && !/^[~^]+$/.test(l)) {
      errorMsg = l;
      break;
    }
  }

  return { lineNum: errorLineNum, errorMsg, errorContext };
}

// ── Python execution ──────────────────────────────────────

let isRunning   = false;
let runAbortCtrl = null;

function setPyEnvBadge(label) {
  const el = document.getElementById('py-env');
  el.textContent = `Python: ${label}`;
  el.classList.toggle('venv', label !== 'global');
}

async function detectPyEnv() {
  if (!currentFolder) return;
  try {
    const res = await fetch(`${API}/pyenv?root=${encodeURIComponent(currentFolder)}`);
    if (!res.ok) return;
    const data = await res.json();
    setPyEnvBadge(data.venv);
  } catch { }
}

async function runPython() {
  if (!currentPath || !currentPath.endsWith('.py') || isRunning) return;
  if (isDirty) await saveFile();

  const panel   = document.getElementById('output-panel');
  const body    = document.getElementById('output-body');
  const status  = document.getElementById('output-status');
  const btnRun  = document.getElementById('btn-run');
  const btnStop = document.getElementById('btn-stop-run');

  clearErrorHighlight();
  panel.classList.remove('hidden');
  body.innerHTML = '<span class="out-info">Running…</span>';
  status.textContent = '';
  isRunning = true;
  btnRun.disabled = true;
  btnStop.classList.remove('hidden');
  foEmit('fo-status', { status: 'running', file: currentPath });

  const ctrl = new AbortController();
  runAbortCtrl = ctrl;
  let firstOutput = true;
  let accStderr   = '';

  try {
    const res = await fetch(`${API}/run`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: currentPath, root: currentFolder }),
      signal:  ctrl.signal,
    });

    if (!res.ok) {
      const msg = await res.text();
      body.innerHTML = `<span class="out-stderr">${escapeHtml(msg)}</span>`;
      status.textContent = 'error';
      foEmit('fo-result', { status: 'error', stdout: '', stderr: msg, duration: 0 });
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let boundary;
      while ((boundary = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, boundary);
        buf = buf.slice(boundary + 2);
        if (!chunk.startsWith('data: ')) continue;
        let evt;
        try { evt = JSON.parse(chunk.slice(6)); } catch { continue; }

        if (evt.type === 'info') {
          if (evt.venv) setPyEnvBadge(evt.venv);

        } else if (evt.type === 'stdout' || evt.type === 'stderr') {
          if (firstOutput) { body.innerHTML = ''; firstOutput = false; }
          const span = document.createElement('span');
          span.className   = evt.type === 'stdout' ? 'out-stdout' : 'out-stderr';
          span.textContent = evt.text + '\n';
          body.appendChild(span);
          body.scrollTop = body.scrollHeight;
          if (evt.type === 'stderr') accStderr += evt.text + '\n';

        } else if (evt.type === 'error') {
          body.innerHTML = `<span class="out-stderr">${escapeHtml(evt.text)}</span>`;
          status.textContent = 'error';
          foEmit('fo-result', { status: 'error', stdout: '', stderr: evt.text, duration: 0 });
          return;

        } else if (evt.type === 'done') {
          if (firstOutput) body.innerHTML = '<span class="out-info">(no output)</span>';
          const ms    = evt.duration;
          const label = evt.exitCode === 0 ? 'finished'
                      : evt.exitCode === -1 ? 'killed'
                      : `exit ${evt.exitCode}`;
          status.textContent = `${label} · ${ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(2) + 's'}`;

          // Highlight error line from accumulated stderr
          if (accStderr) {
            const tb = parseTraceback(accStderr);
            if (tb?.lineNum) highlightErrorLine(tb.lineNum);
          }

          foEmit('fo-result', {
            status:   evt.exitCode === 0 ? 'finished' : 'error',
            stderr:   accStderr,
            exitCode: evt.exitCode,
            duration: ms,
          });
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (firstOutput) body.innerHTML = '<span class="out-info">(killed)</span>';
      status.textContent = 'killed';
    } else {
      body.innerHTML = `<span class="out-stderr">${escapeHtml(String(err))}</span>`;
      status.textContent = 'error';
    }
    foEmit('fo-result', { status: 'error', stdout: '', stderr: String(err), duration: 0 });
  } finally {
    isRunning    = false;
    runAbortCtrl = null;
    btnRun.disabled = false;
    btnStop.classList.add('hidden');
  }
}

function killRun() {
  if (runAbortCtrl) runAbortCtrl.abort();
}

document.getElementById('btn-run').addEventListener('click', runPython);
document.getElementById('btn-stop-run').addEventListener('click', killRun);
document.getElementById('output-close').addEventListener('click', () => {
  document.getElementById('output-panel').classList.add('hidden');
});
document.getElementById('btn-popout').addEventListener('click', openFloatingOutput);

// ── Floating Output Window ────────────────────────────────

async function openFloatingOutput() {
  if (!window.__TAURI__) return;

  const { WebviewWindow } = window.__TAURI__.webviewWindow;
  const LABEL = 'floating-output';

  // Bring existing window to front if already open
  try {
    const existing = await WebviewWindow.getByLabel(LABEL);
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
  } catch {}

  // Restore last saved geometry
  let x, y, width = 420, height = 300;
  try {
    const saved = JSON.parse(localStorage.getItem('sane_float_geo_v1') || 'null');
    if (saved) {
      if (saved.x      != null) x      = saved.x;
      if (saved.y      != null) y      = saved.y;
      if (saved.width  > 100)   width  = saved.width;
      if (saved.height > 80)    height = saved.height;
    }
  } catch {}

  // Default to bottom-right of primary monitor
  if (x == null || y == null) {
    try {
      const { primaryMonitor } = window.__TAURI__.window;
      const mon = await primaryMonitor();
      if (mon) {
        const sf = mon.scaleFactor || 1;
        x = Math.round(mon.size.width  / sf) - width  - 24;
        y = Math.round(mon.size.height / sf) - height - 60;
      }
    } catch {}
  }

  new WebviewWindow(LABEL, {
    url:        'float.html',
    title:      'Output — Sane',
    width,
    height,
    x,
    y,
    alwaysOnTop: true,
    resizable:   true,
    decorations: true,
    skipTaskbar: false,
  });
}

function foEmit(event, payload) {
  try { window.__TAURI__?.event.emit(event, payload); } catch {}
}

// ── Terminal ──────────────────────────────────────────────

let termHistory = [];
let termHistIdx = -1;
let termCwd     = '';

function termShortCwd(cwd) {
  return cwd ? basename(cwd) : '~';
}

function resolveCwd(base, target) {
  if (!target || target === '.') return base;
  const sep = base.includes('\\') ? '\\' : '/';
  // Absolute
  if (target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target)) return target;
  if (target === '~') return base; // no home resolution, stay put
  if (target === '..') {
    const parts = base.replace(/[/\\]+$/, '').split(/[/\\]/);
    if (parts.length > 1) parts.pop();
    return parts.join(sep) || sep;
  }
  return base.replace(/[/\\]+$/, '') + sep + target;
}

function termAppend(cls, text) {
  const out = document.getElementById('term-output');
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  out.appendChild(el);
  out.scrollTop = out.scrollHeight;
}

function toggleTerminal() {
  const panel = document.getElementById('terminal-panel');
  if (panel.classList.contains('hidden')) openTerminal();
  else closeTerminal();
}

function openTerminal() {
  if (!termCwd) termCwd = currentFolder || '';
  document.getElementById('term-cwd').textContent = termShortCwd(termCwd);
  document.getElementById('terminal-panel').classList.remove('hidden');
  document.getElementById('btn-terminal').classList.add('active');
  document.getElementById('term-input').focus();
}

function closeTerminal() {
  document.getElementById('terminal-panel').classList.add('hidden');
  document.getElementById('btn-terminal').classList.remove('active');
}

async function termRun() {
  const input = document.getElementById('term-input');
  const raw   = input.value.trim();
  if (!raw) return;

  // History
  if (termHistory[0] !== raw) termHistory.unshift(raw);
  if (termHistory.length > 200) termHistory.pop();
  termHistIdx = -1;
  input.value = '';

  const out = document.getElementById('term-output');
  const cwd = termCwd;

  // Print prompt + command
  const cmdEl = document.createElement('div');
  cmdEl.className = 'term-cmd-line';
  cmdEl.textContent = `${termShortCwd(cwd)}$ ${raw}`;
  out.appendChild(cmdEl);
  out.scrollTop = out.scrollHeight;

  // Built-ins
  if (raw === 'clear' || raw === 'cls') { document.getElementById('term-output').innerHTML = ''; return; }

  if (raw === 'pwd') { termAppend('term-stdout', cwd || '(unknown)'); return; }

  if (raw.startsWith('cd')) {
    const arg = raw.slice(2).trim();
    if (!arg) return;
    const next = resolveCwd(cwd, arg);
    termCwd = next;
    document.getElementById('term-cwd').textContent = termShortCwd(termCwd);
    return;
  }

  // Running indicator
  const spinner = document.createElement('div');
  spinner.className = 'term-info';
  spinner.textContent = '…';
  out.appendChild(spinner);
  out.scrollTop = out.scrollHeight;

  try {
    const res = await fetch(`${API}/shell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: raw, cwd }),
    });
    spinner.remove();

    if (!res.ok) {
      termAppend('term-stderr', await res.text());
      return;
    }
    const data = await res.json();
    if (data.stdout) termAppend('term-stdout', data.stdout.replace(/\n$/, ''));
    if (data.stderr) termAppend('term-stderr', data.stderr.replace(/\n$/, ''));
    if (data.exitCode !== 0 && !data.stdout && !data.stderr) {
      termAppend('term-info', `exit ${data.exitCode}`);
    }
  } catch (err) {
    spinner.remove();
    termAppend('term-stderr', String(err));
  }
}

document.getElementById('term-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); termRun(); return; }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    termHistIdx = Math.min(termHistIdx + 1, termHistory.length - 1);
    if (termHistIdx >= 0) e.target.value = termHistory[termHistIdx];
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    termHistIdx = Math.max(termHistIdx - 1, -1);
    e.target.value = termHistIdx >= 0 ? termHistory[termHistIdx] : '';
    return;
  }
  if (e.ctrlKey && e.key === 'l') { e.preventDefault(); document.getElementById('term-output').innerHTML = ''; }
});

document.getElementById('btn-terminal').addEventListener('click', toggleTerminal);
document.getElementById('term-clear').addEventListener('click',   () => { document.getElementById('term-output').innerHTML = ''; });
document.getElementById('term-close').addEventListener('click',   closeTerminal);

// ── Free Mode ─────────────────────────────────────────────

// ── Theme system ──────────────────────────────────────────

const THEME_KEY = 'sane_theme_v1';

const THEME_VARS = [
  // Interface
  { group: 'Interface' },
  { v: '--bg',          name: 'Background',    hint: 'editor, panels' },
  { v: '--bg-sidebar',  name: 'Sidebar',       hint: 'file tree' },
  { v: '--bg-header',   name: 'Headers',       hint: 'top bars, term header' },
  { v: '--border',      name: 'Borders',       hint: 'dividers, edges' },
  // Text
  { group: 'Text' },
  { v: '--text',        name: 'Normal text',   hint: 'editor content' },
  { v: '--text-dim',    name: 'Dim text',      hint: 'line numbers, hints' },
  { v: '--text-bright', name: 'Bright text',   hint: 'filenames, active' },
  { v: '--accent',      name: 'Accent',        hint: 'buttons, links' },
  { v: '--selected',    name: 'Selection',     hint: 'selected files' },
  // Syntax
  { group: 'Syntax (Python)' },
  { v: '--hl-kw',       name: 'Keywords',      hint: 'def, class, if…' },
  { v: '--hl-str',      name: 'Strings',       hint: '"text", \'text\'' },
  { v: '--hl-comment',  name: 'Comments',      hint: '# comment' },
  { v: '--hl-num',      name: 'Numbers',       hint: '42, 3.14' },
  { v: '--hl-fn',       name: 'Functions',     hint: 'name after def' },
  { v: '--hl-deco',     name: 'Decorators',    hint: '@property' },
];

const FONTS = [
  "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
  "'Fira Code', monospace",
  "'JetBrains Mono', monospace",
  "'Consolas', monospace",
  "'Source Code Pro', monospace",
  "'Courier New', monospace",
];

const PRESETS = {
  default: {
    '--bg': '#1a1a1a', '--bg-sidebar': '#161616', '--bg-header': '#111111',
    '--text': '#c8c8c8', '--text-dim': '#555555', '--text-bright': '#e8e8e8',
    '--accent': '#5294e2', '--border': '#262626', '--selected': '#1e3050', '--hover': '#1f1f1f',
    '--hl-kw': '#b4a0e5', '--hl-str': '#89c07a', '--hl-comment': '#4d5566',
    '--hl-num': '#d4976c', '--hl-fn': '#82b4d4', '--hl-deco': '#e5a550',
    '--font': FONTS[0], '--size': '13px',
  },
  black: {
    '--bg': '#0c0c0c', '--bg-sidebar': '#080808', '--bg-header': '#050505',
    '--text': '#d4d4d4', '--text-dim': '#3a3a3a', '--text-bright': '#f0f0f0',
    '--accent': '#4a90d9', '--border': '#181818', '--selected': '#0d2040', '--hover': '#101010',
    '--hl-kw': '#c09ee8', '--hl-str': '#7dc07a', '--hl-comment': '#363d4a',
    '--hl-num': '#e0985a', '--hl-fn': '#78b0d8', '--hl-deco': '#e8a840',
    '--font': FONTS[0], '--size': '13px',
  },
  white: {
    '--bg': '#f2f1ec', '--bg-sidebar': '#eae9e4', '--bg-header': '#e2e1dc',
    '--text': '#2c2c2c', '--text-dim': '#909090', '--text-bright': '#111111',
    '--accent': '#2b6db5', '--border': '#c8c7c0', '--selected': '#c2d4ee', '--hover': '#e6e5e0',
    '--hl-kw': '#6b4aab', '--hl-str': '#3a7a30', '--hl-comment': '#8a9878',
    '--hl-num': '#b05a20', '--hl-fn': '#1a5a8a', '--hl-deco': '#986020',
    '--font': FONTS[0], '--size': '13px',
  },
};

let currentPreset = 'default';

function applyTheme(vars) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    if (k === '--font') {
      root.style.setProperty('--font', v);
    } else {
      root.style.setProperty(k, v);
    }
  }
}

function saveTheme() {
  const root   = document.documentElement;
  const stored = { preset: currentPreset, vars: {} };
  for (const entry of THEME_VARS) {
    if (entry.group) continue;
    stored.vars[entry.v] = root.style.getPropertyValue(entry.v).trim()
      || getComputedStyle(root).getPropertyValue(entry.v).trim();
  }
  stored.vars['--font'] = root.style.getPropertyValue('--font').trim()
    || getComputedStyle(root).getPropertyValue('--font').trim();
  stored.vars['--size'] = root.style.getPropertyValue('--size').trim()
    || getComputedStyle(root).getPropertyValue('--size').trim();
  localStorage.setItem(THEME_KEY, JSON.stringify(stored));
}

function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    currentPreset = stored.preset || 'default';
    if (stored.vars) applyTheme(stored.vars);
  } catch {
    localStorage.removeItem(THEME_KEY);
  }
}

function openThemePanel() {
  buildThemePanel();
  document.getElementById('theme-panel').classList.remove('hidden');
}

function closeThemePanel() {
  document.getElementById('theme-panel').classList.add('hidden');
}

function buildThemePanel() {
  const root    = document.documentElement;
  const colors  = document.getElementById('theme-colors');
  colors.innerHTML = '';

  // Sync preset buttons
  document.querySelectorAll('.tpreset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.p === currentPreset);
  });

  for (const entry of THEME_VARS) {
    if (entry.group) {
      const g = document.createElement('div');
      g.className = 'tgroup';
      g.textContent = entry.group;
      colors.appendChild(g);
      continue;
    }

    const current = (root.style.getPropertyValue(entry.v) || getComputedStyle(root).getPropertyValue(entry.v)).trim();
    const row = document.createElement('div');
    row.className = 'trow';

    const inp = document.createElement('input');
    inp.type  = 'color';
    inp.value = current || '#000000';
    inp.addEventListener('input', () => {
      root.style.setProperty(entry.v, inp.value);
      setPreset('custom');
      saveTheme();
    });

    const name = document.createElement('span');
    name.className = 'trow-name';
    name.textContent = entry.name;

    const hint = document.createElement('span');
    hint.className = 'trow-hint';
    hint.textContent = entry.hint;

    row.appendChild(inp);
    row.appendChild(name);
    row.appendChild(hint);
    colors.appendChild(row);
  }

  // Font row
  const fg = document.createElement('div');
  fg.className = 'tgroup';
  fg.textContent = 'Font';
  colors.appendChild(fg);

  const fontRow = document.createElement('div');
  fontRow.className = 'trow';
  const sel = document.createElement('select');
  const fontLabels = ['Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', 'Source Code Pro', 'Courier New'];
  FONTS.forEach((f, i) => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = fontLabels[i];
    const cur = (root.style.getPropertyValue('--font') || getComputedStyle(root).getPropertyValue('--font')).trim();
    if (cur.includes(fontLabels[i])) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    root.style.setProperty('--font', sel.value);
    setPreset('custom');
    saveTheme();
  });

  const sizeRow = document.createElement('div');
  sizeRow.className = 'trow';
  const sizeSel = document.createElement('select');
  ['12px','13px','14px','15px','16px'].forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    const cur = (root.style.getPropertyValue('--size') || getComputedStyle(root).getPropertyValue('--size')).trim();
    if (cur === s) opt.selected = true;
    sizeSel.appendChild(opt);
  });
  sizeSel.addEventListener('change', () => {
    root.style.setProperty('--size', sizeSel.value);
    setPreset('custom');
    saveTheme();
  });

  const fontName = document.createElement('span');
  fontName.className = 'trow-name';
  fontName.textContent = 'Family';
  fontRow.appendChild(sel);
  fontRow.appendChild(fontName);
  colors.appendChild(fontRow);

  const sizeName = document.createElement('span');
  sizeName.className = 'trow-name';
  sizeName.textContent = 'Size';
  sizeRow.appendChild(sizeSel);
  sizeRow.appendChild(sizeName);
  colors.appendChild(sizeRow);
}

function setPreset(p) {
  currentPreset = p;
  document.querySelectorAll('.tpreset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.p === p);
  });
  if (p !== 'custom') {
    applyTheme(PRESETS[p]);
    saveTheme();
    buildThemePanel();
  }
}

// Preset buttons
document.querySelectorAll('.tpreset').forEach(btn => {
  btn.addEventListener('click', () => setPreset(btn.dataset.p));
});

document.getElementById('theme-close').addEventListener('click', closeThemePanel);
document.getElementById('theme-backdrop').addEventListener('click', closeThemePanel);

document.getElementById('theme-reset').addEventListener('click', () => {
  localStorage.removeItem(THEME_KEY);
  currentPreset = 'default';
  document.documentElement.removeAttribute('style');
  buildThemePanel();
});

document.getElementById('theme-export').addEventListener('click', () => {
  const root   = document.documentElement;
  const out    = { preset: currentPreset, vars: {} };
  for (const entry of THEME_VARS) {
    if (entry.group) continue;
    out.vars[entry.v] = (root.style.getPropertyValue(entry.v) || getComputedStyle(root).getPropertyValue(entry.v)).trim();
  }
  out.vars['--font'] = (root.style.getPropertyValue('--font') || getComputedStyle(root).getPropertyValue('--font')).trim();
  out.vars['--size'] = (root.style.getPropertyValue('--size') || getComputedStyle(root).getPropertyValue('--size')).trim();
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sane-theme.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('theme-import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.vars) {
        applyTheme(data.vars);
        currentPreset = data.preset === 'custom' ? 'custom' : (PRESETS[data.preset] ? data.preset : 'custom');
        saveTheme();
        buildThemePanel();
      }
    } catch { alert('Invalid theme file.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ── Editor context menu ───────────────────────────────────

let editorCtxSel = '';

function showEditorCtxMenu(e) {
  e.preventDefault();
  editorCtxSel = elEditor.value.slice(elEditor.selectionStart, elEditor.selectionEnd);

  const hasSel   = editorCtxSel.length > 0;
  const isPy     = currentPath?.endsWith('.py');
  const hasFile  = !!currentPath;
  const hasModel = !!activeModel;
  const hasFolder = !!currentFolder;

  const get = id => document.getElementById(id);

  get('edc-cut').classList.toggle('disabled', !hasSel);
  get('edc-copy').classList.toggle('disabled', !hasSel);
  get('edc-save').classList.toggle('disabled', !hasFile);
  get('edc-run').classList.toggle('hidden', !isPy);
  get('edc-run').classList.toggle('disabled', isRunning);
  get('edc-sep2').classList.toggle('hidden', !hasSel && !hasModel);
  get('edc-explain').classList.toggle('hidden', !hasSel);
  get('edc-explain').classList.toggle('disabled', !hasModel);
  get('edc-explain').textContent = hasModel
    ? `Explain with AI`
    : `Explain with AI (no model active)`;
  if (hasModel) get('edc-explain').querySelector?.('.ctx-hint')?.remove?.();
  get('edc-search').classList.toggle('hidden', !hasSel || !hasFolder);

  const menu = get('editor-ctx-menu');
  menu.style.visibility = 'hidden';
  menu.classList.remove('hidden');
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = e.clientX, y = e.clientY;
  if (x + mw > window.innerWidth)  x = window.innerWidth  - mw - 4;
  if (y + mh > window.innerHeight) y = window.innerHeight - mh - 4;
  menu.style.left = `${x}px`;
  menu.style.top  = `${y}px`;
  menu.style.visibility = '';
}

function closeEditorCtxMenu() {
  document.getElementById('editor-ctx-menu').classList.add('hidden');
}

elEditor.addEventListener('contextmenu', showEditorCtxMenu);

document.addEventListener('mousedown', (e) => {
  if (!document.getElementById('editor-ctx-menu').contains(e.target)) closeEditorCtxMenu();
});

document.getElementById('edc-cut').addEventListener('mousedown', (e) => {
  e.preventDefault(); closeEditorCtxMenu();
  elEditor.focus();
  document.execCommand('cut');
});
document.getElementById('edc-copy').addEventListener('mousedown', (e) => {
  e.preventDefault(); closeEditorCtxMenu();
  elEditor.focus();
  document.execCommand('copy');
});
document.getElementById('edc-paste').addEventListener('mousedown', (e) => {
  e.preventDefault(); closeEditorCtxMenu();
  elEditor.focus();
  document.execCommand('paste');
});
document.getElementById('edc-save').addEventListener('mousedown', (e) => {
  e.preventDefault(); closeEditorCtxMenu(); saveFile();
});
document.getElementById('edc-run').addEventListener('mousedown', (e) => {
  e.preventDefault(); closeEditorCtxMenu(); runPython();
});
document.getElementById('edc-explain').addEventListener('mousedown', (e) => {
  e.preventDefault();
  const sel = editorCtxSel;
  closeEditorCtxMenu();
  if (sel && activeModel) explainWithAI(sel);
});
document.getElementById('edc-search').addEventListener('mousedown', (e) => {
  e.preventDefault();
  const sel = editorCtxSel;
  closeEditorCtxMenu();
  if (sel) openGlobalSearch(sel);
});

// ── AI Explain ────────────────────────────────────────────

let aiExplainAbort = null;

function renderAIResponse(text) {
  const el = document.getElementById('ai-explain-response');
  el.innerHTML = '';

  // Split on code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    if (part.startsWith('```')) {
      const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
      const pre = document.createElement('code');
      pre.className = 'ai-code';
      pre.textContent = code;
      el.appendChild(pre);
    } else {
      // Process inline: `code` and **bold**
      const frag = document.createDocumentFragment();
      const segments = part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
      for (const seg of segments) {
        if (seg.startsWith('`') && seg.endsWith('`')) {
          const code = document.createElement('code');
          code.className = 'ai-inline';
          code.textContent = seg.slice(1, -1);
          frag.appendChild(code);
        } else if (seg.startsWith('**') && seg.endsWith('**')) {
          const b = document.createElement('strong');
          b.textContent = seg.slice(2, -2);
          frag.appendChild(b);
        } else {
          frag.appendChild(document.createTextNode(seg));
        }
      }
      el.appendChild(frag);
    }
  }
  el.scrollTop = el.scrollHeight;
}

async function explainWithAI(code) {
  if (!activeModel) return;

  const panel      = document.getElementById('ai-explain');
  const responseEl = document.getElementById('ai-explain-response');
  const statusEl   = document.getElementById('ai-explain-status');
  const stopBtn    = document.getElementById('ai-explain-stop');
  const snippetEl  = document.getElementById('ai-explain-snippet');
  const badgeEl    = document.getElementById('ai-explain-badge');

  // Cancel any in-progress request
  if (aiExplainAbort) { aiExplainAbort.abort(); aiExplainAbort = null; }

  panel.classList.remove('hidden');
  snippetEl.textContent = code.length > 400 ? code.slice(0, 400) + '…' : code;
  badgeEl.textContent   = activeModel;
  responseEl.textContent = '';
  statusEl.textContent   = 'Thinking…';
  stopBtn.classList.remove('hidden');

  const prompt = `Explain the following code concisely. Be direct and technical.\n\n${code}`;
  const ctrl   = new AbortController();
  aiExplainAbort = ctrl;

  try {
    const res = await fetch(`${API}/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: activeModel, prompt }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      statusEl.textContent = await res.text();
      stopBtn.classList.add('hidden');
      return;
    }

    statusEl.textContent = '';
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let boundary;
      while ((boundary = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, boundary);
        buf = buf.slice(boundary + 2);
        if (!chunk.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(chunk.slice(6));
          if (data.response) {
            fullText += data.response;
            responseEl.textContent = fullText; // plain while streaming
            responseEl.scrollTop   = responseEl.scrollHeight;
          }
        } catch {}
      }
    }

    // Render with basic markdown after stream completes
    if (fullText) renderAIResponse(fullText);
  } catch (err) {
    if (err.name !== 'AbortError') statusEl.textContent = String(err);
  } finally {
    aiExplainAbort = null;
    stopBtn.classList.add('hidden');
  }
}

document.getElementById('ai-explain-stop').addEventListener('click', () => {
  if (aiExplainAbort) { aiExplainAbort.abort(); aiExplainAbort = null; }
  document.getElementById('ai-explain-status').textContent = 'Stopped.';
  document.getElementById('ai-explain-stop').classList.add('hidden');
});

document.getElementById('ai-explain-close').addEventListener('click', () => {
  if (aiExplainAbort) { aiExplainAbort.abort(); aiExplainAbort = null; }
  document.getElementById('ai-explain').classList.add('hidden');
});

// ── Import parser ─────────────────────────────────────────

function parseImports(code) {
  const imports = new Map(); // symbol → display string
  for (const line of code.split('\n')) {
    const t = line.trim();

    // import os, sys as system
    const m1 = t.match(/^import\s+(.+)/);
    if (m1) {
      for (const part of m1[1].split(',')) {
        const segs  = part.trim().split(/\s+as\s+/);
        const name  = segs[0].trim();
        const alias = (segs[1] || name).trim();
        if (alias) imports.set(alias, `import ${name}`);
      }
      continue;
    }

    // from os import path, getcwd as cwd
    const m2 = t.match(/^from\s+(\S+)\s+import\s+\(?([\s\S]+?)\)?$/);
    if (m2) {
      const mod = m2[1];
      for (const part of m2[2].replace(/[()]/g, '').split(',')) {
        const segs  = part.trim().split(/\s+as\s+/);
        const name  = segs[0].trim();
        const alias = (segs[1] || name).trim();
        if (name) imports.set(alias, `from ${mod} import ${name}`);
      }
    }
  }
  return imports;
}

// ── Character width measurement ───────────────────────────

let _charWidthCache = { val: 0, expires: 0 };

function getCharWidth() {
  const now = Date.now();
  if (now < _charWidthCache.expires) return _charWidthCache.val;
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  const style  = getComputedStyle(elEditor);
  ctx.font     = `${style.fontSize} ${style.fontFamily}`;
  const w = ctx.measureText('M').width;
  _charWidthCache = { val: w, expires: now + 10000 };
  return w;
}

function getEditorRowCol(clientX, clientY) {
  const rect  = elEditor.getBoundingClientRect();
  const style = getComputedStyle(elEditor);
  const lineH = parseFloat(style.lineHeight);
  const charW = getCharWidth();
  const relY  = clientY - rect.top  + elEditor.scrollTop  - 18;
  const relX  = clientX - rect.left + elEditor.scrollLeft - 22;
  return {
    row: Math.max(0, Math.floor(relY / lineH)),
    col: Math.max(0, Math.round(relX / charW)),
  };
}

function getWordAtRowCol(row, col) {
  const lines = elEditor.value.split('\n');
  if (row >= lines.length) return null;
  const line = lines[row];
  let s = Math.min(col, line.length), e = s;
  while (s > 0 && /\w/.test(line[s - 1])) s--;
  while (e < line.length && /\w/.test(line[e])) e++;
  return s === e ? null : line.slice(s, e);
}

// ── Import hover tooltip ──────────────────────────────────

let hoverTimer       = null;
let hoverActiveWord  = null;

elEditor.addEventListener('mousemove', (e) => {
  if (!currentPath?.endsWith('.py')) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    const { row, col } = getEditorRowCol(e.clientX, e.clientY);
    const word = getWordAtRowCol(row, col);
    if (!word || word === hoverActiveWord) return;
    const src = parseImports(elEditor.value).get(word);
    if (!src) { hideImportTooltip(); return; }
    hoverActiveWord = word;
    const tip = document.getElementById('import-tooltip');
    tip.textContent = src;
    tip.classList.remove('hidden');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - th - 10;
    if (x + tw > window.innerWidth)  x = window.innerWidth  - tw - 8;
    if (y < 0)                        y = e.clientY + 20;
    tip.style.left = `${x}px`;
    tip.style.top  = `${y}px`;
  }, 280);
});

elEditor.addEventListener('mouseleave', hideImportTooltip);

function hideImportTooltip() {
  clearTimeout(hoverTimer);
  hoverActiveWord = null;
  document.getElementById('import-tooltip').classList.add('hidden');
}

// ── Autocomplete ──────────────────────────────────────────

const PY_BUILTINS = [
  'abs','all','any','ascii','bin','bool','breakpoint','bytearray','bytes',
  'callable','chr','classmethod','compile','complex','delattr','dict','dir',
  'divmod','enumerate','eval','exec','filter','float','format','frozenset',
  'getattr','globals','hasattr','hash','help','hex','id','input','int',
  'isinstance','issubclass','iter','len','list','locals','map','max',
  'memoryview','min','next','object','oct','open','ord','pow','print',
  'property','range','repr','reversed','round','set','setattr','slice',
  'sorted','staticmethod','str','sum','super','tuple','type','vars','zip',
  '__name__','__file__','__doc__','__package__','__spec__',
];

let acItems     = [];
let acSelected  = 0;
let acWordStart = 0;

function getWordBeforeCursor() {
  const pos = elEditor.selectionStart;
  const m   = elEditor.value.slice(0, pos).match(/\w+$/);
  return { word: m ? m[0] : '', start: m ? pos - m[0].length : pos };
}

function collectCompletions(prefix) {
  const code    = elEditor.value;
  const imports = parseImports(code);
  const defined = new Set();
  for (const m of code.matchAll(/\b(?:def|class)\s+(\w+)/g)) defined.add(m[1]);
  for (const m of code.matchAll(/^(\w+)\s*=/gm))             defined.add(m[1]);

  const p    = prefix.toLowerCase();
  const seen = new Set();
  const out  = [];

  const add = (name, type) => {
    if (!name || seen.has(name)) return;
    if (!name.toLowerCase().startsWith(p)) return;
    seen.add(name);
    out.push({ name, type });
  };

  for (const [sym] of imports)   add(sym,  'import');
  for (const name of defined)    add(name, 'local');
  for (const b of PY_BUILTINS)  add(b,    'builtin');

  return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
}

function getCaretCoords() {
  const pos   = elEditor.selectionStart;
  const lines = elEditor.value.slice(0, pos).split('\n');
  const row   = lines.length - 1;
  const col   = lines[row].length;
  const rect  = elEditor.getBoundingClientRect();
  const style = getComputedStyle(elEditor);
  const lineH = parseFloat(style.lineHeight);
  const charW = getCharWidth();
  return {
    x: rect.left + 22 + col * charW - elEditor.scrollLeft,
    y: rect.top  + 18 + row * lineH - elEditor.scrollTop + lineH,
  };
}

function openAutocomplete() {
  if (!currentPath?.endsWith('.py')) return;
  const { word, start } = getWordBeforeCursor();
  acWordStart = start;
  acItems     = collectCompletions(word);
  acSelected  = 0;
  if (!acItems.length) { closeAutocomplete(); return; }
  renderAutocomplete();
}

function renderAutocomplete() {
  const ac = document.getElementById('autocomplete');
  ac.innerHTML = '';
  acItems.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'ac-item' + (i === acSelected ? ' selected' : '');
    el.innerHTML  = `<span class="ac-item-name">${escapeHtml(item.name)}</span>`
                  + `<span class="ac-item-type">${item.type}</span>`;
    el.addEventListener('mousedown', (e) => { e.preventDefault(); acSelected = i; confirmAutocomplete(); });
    ac.appendChild(el);
  });
  ac.classList.remove('hidden');

  const { x, y } = getCaretCoords();
  const aw = ac.offsetWidth, ah = ac.offsetHeight;
  let fx = x, fy = y;
  if (fx + aw > window.innerWidth)  fx = window.innerWidth  - aw - 8;
  if (fy + ah > window.innerHeight) fy = y - ah - parseFloat(getComputedStyle(elEditor).lineHeight) - 4;
  ac.style.left = `${fx}px`;
  ac.style.top  = `${fy}px`;
  ac.children[acSelected]?.scrollIntoView({ block: 'nearest' });
}

function closeAutocomplete() {
  document.getElementById('autocomplete').classList.add('hidden');
  acItems = [];
}

function confirmAutocomplete() {
  const item = acItems[acSelected];
  if (!item) return;
  const pos = elEditor.selectionStart;
  editorSplice(acWordStart, pos - acWordStart, item.name);
  closeAutocomplete();
  elEditor.focus();
}

function acMove(delta) {
  acSelected = Math.max(0, Math.min(acSelected + delta, acItems.length - 1));
  document.querySelectorAll('.ac-item').forEach((el, i) => el.classList.toggle('selected', i === acSelected));
  document.querySelectorAll('.ac-item')[acSelected]?.scrollIntoView({ block: 'nearest' });
}

// Close autocomplete when clicking outside
document.addEventListener('mousedown', (e) => {
  if (!document.getElementById('autocomplete').contains(e.target)) closeAutocomplete();
});

// ── Grid Editor ───────────────────────────────────────────

const GRID_COLS = 12;
const GRID_ROWS = 8;
const GRID_KEY  = 'sane_grid_v1';

const COMPONENT_IDS   = ['sidebar', 'editor', 'terminal', 'output'];
const COMPONENT_NAMES = { sidebar: 'Sidebar', editor: 'Editor', terminal: 'Terminal', output: 'Output' };
const COMPONENT_COLORS = {
  sidebar:  '#5294e2',
  editor:   '#4ec94e',
  terminal: '#e5a550',
  output:   '#e06c75',
};
const COMPONENT_SPANS = {
  sidebar:  { colspan: 2, rowspan: 8 },
  editor:   { colspan: 10, rowspan: 6 },
  terminal: { colspan: 10, rowspan: 2 },
  output:   { colspan: 10, rowspan: 2 },
};

function getComponentEl(id) {
  switch (id) {
    case 'sidebar':  return document.getElementById('sidebar');
    case 'editor':   return document.getElementById('editor-area');
    case 'terminal': return document.getElementById('terminal-panel');
    case 'output':   return document.getElementById('output-panel');
  }
}

const DEFAULT_GRID_STATE = () => ({
  active: false,
  hidden: [],
  items: [
    { id: 'sidebar',  col: 1,  row: 1, colspan: 2,  rowspan: 8 },
    { id: 'editor',   col: 3,  row: 1, colspan: 10, rowspan: 5 },
    { id: 'terminal', col: 3,  row: 6, colspan: 5,  rowspan: 3 },
    { id: 'output',   col: 8,  row: 6, colspan: 5,  rowspan: 3 },
  ],
});

let gridState      = DEFAULT_GRID_STATE();
let gridSnapshot   = null;
// { type:'move'|'mesa'|'resize', id, handle, item:{col,row,colspan,rowspan} }
let geDragState    = null;
let geLastValidCell = null;

function applyGridLayout(state) {
  const app = document.getElementById('app');

  if (!state.active) {
    app.style.gridTemplateColumns = '';
    app.style.gridTemplateRows    = '';
    for (const id of COMPONENT_IDS) {
      const el = getComponentEl(id);
      el.style.gridArea   = '';
      el.style.gridColumn = '';
      el.style.gridRow    = '';
      el.style.width      = '';
      el.style.height     = '';
      el.style.minWidth   = '';
      el.style.minHeight  = '';
      el.classList.remove('ge-mesa-hidden');
    }
    return;
  }

  app.style.gridTemplateColumns = `repeat(${GRID_COLS}, 1fr)`;
  app.style.gridTemplateRows    = `repeat(${GRID_ROWS}, 1fr)`;

  for (const item of state.items) {
    const el = getComponentEl(item.id);
    if (state.hidden.includes(item.id)) {
      el.classList.add('ge-mesa-hidden');
      el.style.gridArea = '';
    } else {
      el.classList.remove('ge-mesa-hidden');
      el.style.width     = '100%';
      el.style.height    = '100%';
      el.style.minWidth  = '0';
      el.style.minHeight = '0';
      el.style.gridArea  =
        `${item.row} / ${item.col} / ${item.row + item.rowspan} / ${item.col + item.colspan}`;
    }
  }
}

function loadGridLayout() {
  try {
    const raw = localStorage.getItem(GRID_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    gridState = saved;
    if (gridState.active) applyGridLayout(gridState);
  } catch {
    localStorage.removeItem(GRID_KEY);
  }
}

function saveGridLayout() {
  gridState.active = true;
  applyGridLayout(gridState);
  localStorage.setItem(GRID_KEY, JSON.stringify(gridState));
  closeGridEditor(true);
}

function resetGridLayout() {
  gridState = DEFAULT_GRID_STATE();
  applyGridLayout(gridState);
  localStorage.removeItem(GRID_KEY);
  buildGridEditor();
}

function exportGridLayout() {
  const blob = new Blob([JSON.stringify(gridState, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'sane-grid.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function openGridEditor() {
  gridSnapshot = JSON.parse(JSON.stringify(gridState));
  buildGridEditor();
  document.getElementById('grid-editor').classList.remove('hidden');
}

function closeGridEditor(saved = false) {
  if (!saved) {
    gridState = gridSnapshot;
    applyGridLayout(gridState);
  }
  document.getElementById('grid-editor').classList.add('hidden');
  geDragState = null;
  document.body.style.userSelect = '';
}

function buildGridEditor() {
  buildGeCanvas();
  buildGeMesa();
}

function getCellFromPoint(canvas, x, y) {
  const rect = canvas.getBoundingClientRect();
  const relX  = x - rect.left;
  const relY  = y - rect.top;
  const cellW = rect.width  / GRID_COLS;
  const cellH = rect.height / GRID_ROWS;
  const col   = Math.floor(relX / cellW) + 1;
  const row   = Math.floor(relY / cellH) + 1;
  if (col < 1 || col > GRID_COLS || row < 1 || row > GRID_ROWS) return null;
  return { col, row };
}

function getOverlapping(id, col, row, colspan, rowspan) {
  const result = [];
  for (const item of gridState.items) {
    if (item.id === id) continue;
    if (gridState.hidden.includes(item.id)) continue;
    const aR = col + colspan - 1;
    const aB = row + rowspan - 1;
    const bR = item.col + item.colspan - 1;
    const bB = item.row + item.rowspan - 1;
    if (col <= bR && aR >= item.col && row <= bB && aB >= item.row) result.push(item.id);
  }
  return result;
}

function clampPlacement(col, row, colspan, rowspan) {
  return {
    col: Math.max(1, Math.min(col, GRID_COLS - colspan + 1)),
    row: Math.max(1, Math.min(row, GRID_ROWS - rowspan + 1)),
  };
}

function computeResizeItem(dragState, cell) {
  if (!cell) return null;
  const o = dragState.item; // snapshot
  let { col, row, colspan, rowspan } = o;
  switch (dragState.handle) {
    case 'e':
      colspan = Math.max(1, Math.min(cell.col - o.col + 1, GRID_COLS - o.col + 1));
      break;
    case 's':
      rowspan = Math.max(1, Math.min(cell.row - o.row + 1, GRID_ROWS - o.row + 1));
      break;
    case 'w':
      col     = Math.max(1, Math.min(cell.col, o.col + o.colspan - 1));
      colspan = o.col + o.colspan - col;
      break;
    case 'n':
      row     = Math.max(1, Math.min(cell.row, o.row + o.rowspan - 1));
      rowspan = o.row + o.rowspan - row;
      break;
  }
  return { col, row, colspan, rowspan };
}

function makeTile(item, fromMesa) {
  const tile = document.createElement('div');
  tile.className = fromMesa ? 'ge-tile ge-mesa-tile' : 'ge-tile';
  tile.dataset.id = item.id;
  tile.style.setProperty('--tile-color', COMPONENT_COLORS[item.id]);
  tile.style.background = COMPONENT_COLORS[item.id] + '22';

  if (!fromMesa) {
    // 4 resize handles
    for (const dir of ['n', 'e', 's', 'w']) {
      const h = document.createElement('div');
      h.className = `ge-handle ge-handle-${dir}`;
      h.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        geLastValidCell = null;
        geDragState = {
          type:   'resize',
          id:     item.id,
          handle: dir,
          item:   { col: item.col, row: item.row, colspan: item.colspan, rowspan: item.rowspan },
        };
        document.body.style.userSelect = 'none';
      });
      tile.appendChild(h);
    }
  }

  const label = document.createElement('span');
  label.className   = 'ge-tile-label';
  label.textContent = COMPONENT_NAMES[item.id];
  tile.appendChild(label);

  tile.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('ge-handle')) return;
    e.preventDefault();
    geLastValidCell = null;
    geDragState = {
      type: fromMesa ? 'mesa' : 'move',
      id:   item.id,
      item: { col: item.col, row: item.row, colspan: item.colspan, rowspan: item.rowspan },
    };
    document.body.style.userSelect = 'none';
    tile.classList.add('ge-tile-dragging');
  });

  return tile;
}

function buildGeCanvas() {
  const canvas = document.getElementById('ge-canvas');
  canvas.innerHTML = '';

  for (let r = 1; r <= GRID_ROWS; r++) {
    for (let c = 1; c <= GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className      = 'ge-cell';
      cell.style.gridArea = `${r} / ${c} / ${r + 1} / ${c + 1}`;
      canvas.appendChild(cell);
    }
  }

  const preview = document.createElement('div');
  preview.id = 'ge-preview';
  canvas.appendChild(preview);

  for (const item of gridState.items) {
    if (gridState.hidden.includes(item.id)) continue;
    const tile = makeTile(item, false);
    tile.style.gridArea = `${item.row} / ${item.col} / ${item.row + item.rowspan} / ${item.col + item.colspan}`;
    canvas.appendChild(tile);
  }
}

function buildGeMesa() {
  const mesaItems = document.getElementById('ge-mesa-items');
  mesaItems.innerHTML = '';

  const hiddenItems = gridState.items.filter(i => gridState.hidden.includes(i.id));

  if (hiddenItems.length === 0) {
    const empty = document.createElement('span');
    empty.className   = 'ge-mesa-empty';
    empty.textContent = 'All placed — drag a tile here to remove from layout';
    mesaItems.appendChild(empty);
  } else {
    for (const item of hiddenItems) {
      mesaItems.appendChild(makeTile(item, true));
    }
  }
}

// ── Grid Editor mouse-based drag + resize ─────────────────

document.addEventListener('mousemove', (e) => {
  if (!geDragState) return;
  const canvas  = document.getElementById('ge-canvas');
  const preview = document.getElementById('ge-preview');
  if (!canvas || !preview) return;

  const cell = getCellFromPoint(canvas, e.clientX, e.clientY);

  if (geDragState.type === 'move' || geDragState.type === 'mesa') {
    if (!cell) { preview.style.display = 'none'; return; }
    const { colspan, rowspan } = geDragState.item;
    const { col, row } = clampPlacement(cell.col, cell.row, colspan, rowspan);
    geLastValidCell = { col, row };
    const conflict = getOverlapping(geDragState.id, col, row, colspan, rowspan).length > 0;
    preview.style.gridArea = `${row} / ${col} / ${row + rowspan} / ${col + colspan}`;
    preview.style.display  = '';
    preview.classList.toggle('ge-drop-warn', conflict);
  } else if (geDragState.type === 'resize') {
    const p = computeResizeItem(geDragState, cell);
    if (cell) geLastValidCell = cell;
    if (!p) { preview.style.display = 'none'; return; }
    const conflict = getOverlapping(geDragState.id, p.col, p.row, p.colspan, p.rowspan).length > 0;
    preview.style.gridArea = `${p.row} / ${p.col} / ${p.row + p.rowspan} / ${p.col + p.colspan}`;
    preview.style.display  = '';
    preview.classList.toggle('ge-drop-warn', conflict);
  }
});

document.addEventListener('mouseup', (e) => {
  if (!geDragState) return;
  document.body.style.userSelect = '';

  const canvas  = document.getElementById('ge-canvas');
  const preview = document.getElementById('ge-preview');
  if (preview) preview.style.display = 'none';

  const rawCell = getCellFromPoint(canvas, e.clientX, e.clientY);
  const cell    = rawCell || geLastValidCell;
  const item    = gridState.items.find(i => i.id === geDragState.id);

  if ((geDragState.type === 'move' || geDragState.type === 'mesa') && item) {
    // Check if released over mesa
    const mesa     = document.getElementById('ge-mesa');
    const mesaRect = mesa?.getBoundingClientRect();
    const overMesa = mesaRect &&
      e.clientX >= mesaRect.left && e.clientX <= mesaRect.right &&
      e.clientY >= mesaRect.top  && e.clientY <= mesaRect.bottom;

    if (overMesa && geDragState.type === 'move') {
      if (!gridState.hidden.includes(geDragState.id)) gridState.hidden.push(geDragState.id);
    } else if (cell && !overMesa) {
      const { colspan, rowspan } = geDragState.item;
      const { col, row } = clampPlacement(cell.col, cell.row, colspan, rowspan);
      const overlapping  = getOverlapping(geDragState.id, col, row, colspan, rowspan);
      if (overlapping.length > 0) {
        alert(`Cell occupied by: ${overlapping.map(id => COMPONENT_NAMES[id]).join(', ')}`);
      } else {
        item.col = col;
        item.row = row;
        gridState.hidden = gridState.hidden.filter(h => h !== geDragState.id);
      }
    }

  } else if (geDragState.type === 'resize' && item && cell) {
    const p = computeResizeItem(geDragState, cell);
    if (p) {
      const overlapping = getOverlapping(geDragState.id, p.col, p.row, p.colspan, p.rowspan);
      if (overlapping.length > 0) {
        alert(`Cell occupied by: ${overlapping.map(id => COMPONENT_NAMES[id]).join(', ')}`);
      } else {
        item.col     = p.col;
        item.row     = p.row;
        item.colspan = p.colspan;
        item.rowspan = p.rowspan;
      }
    }
  }

  geDragState     = null;
  geLastValidCell = null;
  buildGridEditor();
});

document.getElementById('ge-backdrop').addEventListener('click', () => closeGridEditor(false));
document.getElementById('ge-cancel').addEventListener('click', () => closeGridEditor(false));
document.getElementById('ge-save').addEventListener('click', saveGridLayout);
document.getElementById('ge-export').addEventListener('click', exportGridLayout);
document.getElementById('ge-reset').addEventListener('click', resetGridLayout);

loadGridLayout();
loadTheme();
