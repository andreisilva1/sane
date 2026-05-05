(function () {
  const KEY      = 'sane_ui_mode';
  const elSelect = document.getElementById('mode-select');

  // ── Mode toggle ───────────────────────────────────────────
  function applyMode(mode) {
    document.body.classList.toggle('mode-friendly', mode === 'friendly');
    if (elSelect) elSelect.value = mode;
  }

  applyMode(localStorage.getItem(KEY) || 'classic');

  elSelect?.addEventListener('change', () => {
    const m = elSelect.value;
    localStorage.setItem(KEY, m);
    applyMode(m);
  });

  // ── Recent folders list ───────────────────────────────────
  function renderRecent() {
    const list = window.sane?.getRecent?.() || [];
    const el   = document.getElementById('tb-recent-list');
    if (!el) return;
    el.innerHTML = list.length
      ? list.map(p =>
          `<div class="tb-item" data-action="load-folder" data-path="${p.replace(/"/g,'&quot;')}"
                title="${p}">${p.split(/[/\\]/).pop()}</div>`
        ).join('')
      : `<div class="tb-item tb-item-sub" style="cursor:default">No recent folders</div>`;
  }

  document.addEventListener('sane:recent-updated', renderRecent);

  // ── Toolbar menu logic ────────────────────────────────────
  function simulateKey(key, mods) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  }

  const ACTIONS = {
    'open-folder':     () => document.getElementById('btn-open')?.click(),
    'save':            () => simulateKey('s', { ctrlKey: true }),
    'toggle-sidebar':  () => simulateKey('b', { ctrlKey: true }),
    'toggle-terminal': () => simulateKey('`', { ctrlKey: true }),
    'theme':           () => simulateKey(',', { ctrlKey: true }),
    'command-palette': () => simulateKey('P', { ctrlKey: true, shiftKey: true }),
    'shortcuts':       () => document.getElementById('btn-shortcuts')?.click(),
    'run':             () => document.getElementById('btn-run')?.click(),
    'preview':         () => simulateKey('V', { ctrlKey: true, shiftKey: true }),
    'trace':           () => document.getElementById('btn-trace')?.click(),
    'ai-panel':        () => simulateKey('A', { ctrlKey: true, shiftKey: true }),
    'project-builder': () => simulateKey('B', { ctrlKey: true, shiftKey: true }),
    'ai-refactor':     () => simulateKey('I', { ctrlKey: true, shiftKey: true }),
    'ai-setup':        () => window.sane?.openAISetup?.(),
  };

  let openMenu = null;

  function closeAll() {
    document.querySelectorAll('.tb-btn.tb-open, .tb-dropdown.tb-open').forEach(el => {
      el.classList.remove('tb-open');
    });
    openMenu = null;
  }

  function openDropdown(menu) {
    if (openMenu === menu) { closeAll(); return; }
    closeAll();
    menu.querySelector('.tb-btn').classList.add('tb-open');
    menu.querySelector('.tb-dropdown').classList.add('tb-open');
    openMenu = menu;
  }

  document.querySelectorAll('.tb-menu').forEach(menu => {
    const btn      = menu.querySelector('.tb-btn');
    const dropdown = menu.querySelector('.tb-dropdown');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Render recents fresh every time File menu opens
      if (menu.id === 'tb-file') renderRecent();
      openDropdown(menu);
    });

    btn.addEventListener('mouseenter', () => { if (openMenu && openMenu !== menu) openDropdown(menu); });

    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.tb-item');
      if (!item || item.classList.contains('tb-item-sub')) return;
      const action = item.dataset.action;
      closeAll();
      if (action === 'load-folder') {
        window.sane?.loadFolder?.(item.dataset.path);
      } else if (action && ACTIONS[action]) {
        ACTIONS[action]();
      }
    });
  });

  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
})();
