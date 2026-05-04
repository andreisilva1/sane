// ── Project Memory (ai_memory_v1) ─────────────────────────
// Ctrl+Shift+M → manage persistent notes injected into AI prompts
// Saved as .sane_memory.json in project root
// Depends on: state, apiFetch, setStatus

(function () {
  const elOverlay = document.getElementById('mem-overlay');
  const elClose   = document.getElementById('mem-close');
  const elList    = document.getElementById('mem-list');
  const elEmpty   = document.getElementById('mem-empty');
  const elInput   = document.getElementById('mem-input');
  const elAdd     = document.getElementById('mem-add-btn');
  const elStatus2 = document.getElementById('mem-status');

  const FILENAME = '.sane_memory.json';
  let entries = [];
  let nextId  = 1;

  // ── File path ─────────────────────────────────────────────
  function memPath() {
    if (!state.folder) return null;
    return state.folder.replace(/[/\\]$/, '') + '/' + FILENAME;
  }

  // ── Load / save ───────────────────────────────────────────
  async function load() {
    const path = memPath();
    if (!path) { entries = []; return; }
    try {
      const res  = await apiFetch('/file?path=' + encodeURIComponent(path));
      const data = JSON.parse(await res.text());
      entries = Array.isArray(data.entries) ? data.entries : [];
      nextId  = (entries.reduce((m, e) => Math.max(m, e.id || 0), 0)) + 1;
    } catch {
      entries = [];
      nextId  = 1;
    }
  }

  async function save() {
    const path = memPath();
    if (!path) return;
    try {
      await apiFetch('/file?path=' + encodeURIComponent(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.stringify({ entries }, null, 2) }),
      });
    } catch (err) {
      elStatus2.textContent = 'Save failed: ' + err.message;
    }
  }

  // ── Context builder ───────────────────────────────────────
  function getMemoryContext() {
    if (entries.length === 0) return '';
    let ctx = '--- Project Memory ---\n';
    for (const e of entries) ctx += '• ' + e.text + '\n';
    ctx += '---\n';
    return ctx;
  }

  // ── Add / delete ──────────────────────────────────────────
  async function addEntry() {
    const text = elInput.value.trim();
    if (!text) return;
    entries.push({ id: nextId++, text });
    elInput.value = '';
    elStatus2.textContent = '';
    render();
    await save();
  }

  async function deleteEntry(id) {
    entries = entries.filter(e => e.id !== id);
    render();
    await save();
  }

  // ── Render ────────────────────────────────────────────────
  function render() {
    elList.innerHTML = '';
    elEmpty.classList.toggle('hidden', entries.length > 0);

    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'mem-row';
      row.innerHTML =
        `<span class="mem-text">${escHtml(e.text)}</span>` +
        `<button class="mem-del" title="Remove">×</button>`;
      row.querySelector('.mem-del').addEventListener('click', () => deleteEntry(e.id));
      elList.appendChild(row);
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Open / close ──────────────────────────────────────────
  async function open() {
    if (!state.folder) { setStatus('Open a project folder first', 'err'); return; }
    elStatus2.textContent = 'Loading…';
    elOverlay.classList.remove('hidden');
    await load();
    render();
    elStatus2.textContent = '';
    elInput.focus();
  }

  function close() { elOverlay.classList.add('hidden'); }
  function toggle() { elOverlay.classList.contains('hidden') ? open() : close(); }

  elClose.addEventListener('click', close);
  elAdd.addEventListener('click', addEntry);
  elOverlay.addEventListener('mousedown', e => { if (e.target === elOverlay) close(); });

  elInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); addEntry(); }
    if (e.key === 'Escape') close();
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      toggle();
    }
    if (e.key === 'Escape' && !elOverlay.classList.contains('hidden')) close();
  });

  // ── Expose globally ───────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.getMemoryContext = getMemoryContext;
})();
