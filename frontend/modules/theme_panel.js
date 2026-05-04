// ── Theme Panel (theme_panel_v1) ───────────────────────────
// Ctrl+, → pick a dark theme
// Applies by setting data-theme on <html>, persists to localStorage

(function () {
  const STORAGE_KEY = 'sane_theme';

  const THEMES = [
    {
      id: 'void',
      name: 'Void',
      desc: 'Default near-black',
      vars: {
        '--bg': '#0a0a0c', '--bg2': '#111114', '--bg3': '#18181c', '--bg4': '#1e1e24',
        '--text': '#d4d8de', '--accent': '#e2e4e8', '--accent-h': '#f4f5f7',
      },
    },
    {
      id: 'graphite',
      name: 'Graphite',
      desc: 'Neutral gray tones',
      vars: {
        '--bg': '#0d0d0d', '--bg2': '#161616', '--bg3': '#1e1e1e', '--bg4': '#252525',
        '--text': '#cacaca', '--accent': '#e0e0e0', '--accent-h': '#f2f2f2',
      },
    },
    {
      id: 'ember',
      name: 'Ember',
      desc: 'Subtle warm tint',
      vars: {
        '--bg': '#0c0a08', '--bg2': '#141210', '--bg3': '#1c1916', '--bg4': '#23201c',
        '--text': '#d8d0c8', '--accent': '#e8ddd0', '--accent-h': '#f5ede0',
      },
    },
    {
      id: 'monolith',
      name: 'Monolith',
      desc: 'Pure black, high contrast',
      vars: {
        '--bg': '#000000', '--bg2': '#0a0a0a', '--bg3': '#111111', '--bg4': '#181818',
        '--text': '#f0f0f0', '--accent': '#ffffff', '--accent-h': '#ffffff',
      },
    },
  ];

  // ── Apply theme ───────────────────────────────────────────
  function apply(id) {
    const theme = THEMES.find(t => t.id === id) || THEMES[0];
    const root  = document.documentElement;
    for (const [k, v] of Object.entries(theme.vars)) {
      root.style.setProperty(k, v);
    }
    root.dataset.theme = theme.id;
    localStorage.setItem(STORAGE_KEY, theme.id);
  }

  // Apply saved theme on load
  apply(localStorage.getItem(STORAGE_KEY) || 'void');

  // ── UI ────────────────────────────────────────────────────
  const elOverlay = document.getElementById('tp-overlay');
  const elClose   = document.getElementById('tp-close');
  const elCards   = document.getElementById('tp-cards');

  function render() {
    const active = document.documentElement.dataset.theme || 'void';
    elCards.innerHTML = '';
    for (const t of THEMES) {
      const card = document.createElement('div');
      card.className = 'tp-card' + (t.id === active ? ' tp-card-active' : '');
      card.innerHTML = `
        <div class="tp-swatch" style="background:${t.vars['--bg2']};border-color:${t.vars['--accent']}20">
          <div class="tp-sw-bar" style="background:${t.vars['--bg4']}"></div>
          <div class="tp-sw-bar" style="background:${t.vars['--bg3']};width:60%"></div>
          <div class="tp-sw-bar" style="background:${t.vars['--accent']}30;width:80%"></div>
        </div>
        <div class="tp-card-name">${t.name}</div>
        <div class="tp-card-desc">${t.desc}</div>`;
      card.addEventListener('click', () => { apply(t.id); render(); });
      elCards.appendChild(card);
    }
  }

  function open()   { render(); elOverlay.classList.remove('hidden'); }
  function close()  { elOverlay.classList.add('hidden'); }
  function toggle() { elOverlay.classList.contains('hidden') ? open() : close(); }

  elClose.addEventListener('click', close);
  elOverlay.addEventListener('mousedown', e => { if (e.target === elOverlay) close(); });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); toggle(); }
    if (e.key === 'Escape' && !elOverlay.classList.contains('hidden')) close();
  });

  window.sane = window.sane || {};
  window.sane.applyTheme = apply;
})();
