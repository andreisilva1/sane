// ── Project Context (project_aware_ai_v1) ─────────────────
// Ctrl+Shift+C → manage pinned files injected into AI prompts
// Depends on: state, apiFetch, setStatus

(function () {
  const elOverlay = document.getElementById('ctx-overlay');
  const elClose   = document.getElementById('ctx-close');
  const elList    = document.getElementById('ctx-list');
  const elEmpty   = document.getElementById('ctx-empty');
  const elPin     = document.getElementById('ctx-pin-btn');

  const STORAGE_KEY = 'sane_pinned_ctx';
  let pinned = [];  // [{path, name, content}]

  // ── Persistence ───────────────────────────────────────────
  function load() {
    try { pinned = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { pinned = []; }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
  }

  load();

  // ── Context builder (called by AI panel) ──────────────────
  function getProjectContext() {
    if (pinned.length === 0) return '';
    let ctx = '--- Pinned context ---\n';
    for (const f of pinned) {
      const content = (f.path === state.filePath ? state.content : null) ?? f.content;
      ctx += `\nFile: ${f.name}\n\`\`\`\n${content}\n\`\`\`\n`;
    }
    ctx += '\n---\n';
    return ctx;
  }

  // ── Pin / unpin ───────────────────────────────────────────
  async function pinCurrent() {
    if (!state.filePath) { setStatus('Open a file first', 'err'); return; }
    const path = state.filePath;
    if (pinned.find(f => f.path === path)) { setStatus('Already pinned', ''); return; }

    const name    = path.split(/[/\\]/).pop();
    const content = state.content || '';
    pinned.push({ path, name, content });
    persist();
    render();
    setStatus('Pinned: ' + name, 'ok');
  }

  function unpin(path) {
    pinned = pinned.filter(f => f.path !== path);
    persist();
    render();
  }

  // ── Render panel ──────────────────────────────────────────
  function render() {
    elList.innerHTML = '';
    elEmpty.classList.toggle('hidden', pinned.length > 0);

    for (const f of pinned) {
      const row = document.createElement('div');
      row.className = 'ctx-row';

      const preview = (f.path === state.filePath ? state.content : f.content)
        .split('\n').slice(0, 3).join('\n');

      row.innerHTML = `
        <div class="ctx-row-head">
          <span class="ctx-fname">${escHtml(f.name)}</span>
          <button class="ctx-unpin" data-path="${escHtml(f.path)}" title="Remove">×</button>
        </div>
        <div class="ctx-preview">${escHtml(preview)}</div>`;

      row.querySelector('.ctx-unpin').addEventListener('click', () => unpin(f.path));
      elList.appendChild(row);
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Open / close ──────────────────────────────────────────
  function open()   { render(); elOverlay.classList.remove('hidden'); }
  function close()  { elOverlay.classList.add('hidden'); }
  function toggle() { elOverlay.classList.contains('hidden') ? open() : close(); }

  elClose.addEventListener('click', close);
  elPin.addEventListener('click', pinCurrent);
  elOverlay.addEventListener('mousedown', e => { if (e.target === elOverlay) close(); });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      toggle();
    }
    if (e.key === 'Escape' && !elOverlay.classList.contains('hidden')) close();
  });

  // ── Expose globally ───────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.getProjectContext = getProjectContext;
  window.sane.pinCurrentFile    = pinCurrent;
})();
