// ── Theme Panel (theme_panel_v2) ───────────────────────────
// Ctrl+, → pick a theme. Applies by setting CSS vars on <html>.
// Persists to localStorage.

(function () {
  const STORAGE_KEY = 'sane_theme';

  // ── Theme definitions ─────────────────────────────────────
  const THEMES = [
    // ── Aegean Light ────────────────────────────────────────
    {
      id:   'aegean-light',
      name: 'Aegean Light',
      desc: 'Marble ivory — warm & readable',
      swatch: { bg: '#EDE6DA', bar1: '#D8CFC1', bar2: '#D4AF37', bar3: '#2F4A5C' },
      vars: {
        '--bg':            '#F6F3EE',
        '--bg2':           '#EDE6DA',
        '--bg3':           '#E3DAC9',
        '--bg4':           '#D8CFC1',
        '--text':          '#1C1A18',
        '--text-dim':      '#3A352F',
        '--text-muted':    '#7A746B',
        '--accent':        '#A88E3A',
        '--accent-h':      '#C2A14A',
        '--accent-bg':     'rgba(212,175,55,0.12)',
        '--border':        '#D0C8B8',
        '--border2':       '#C4BAA8',
        '--border3':       '#B4AA98',
        '--success':       '#3A6B3A',
        '--success-bg':    'rgba(58,107,58,0.1)',
        '--danger':        '#8B3A3A',
        '--danger-bg':     'rgba(139,58,58,0.1)',
        '--glass-bg':      'rgba(246,243,238,0.96)',
        '--shadow-sm':     '0 2px 8px rgba(0,0,0,0.07)',
        '--shadow-md':     '0 4px 24px rgba(0,0,0,0.11)',
        '--shadow-lg':     '0 8px 48px rgba(0,0,0,0.16)',
        '--cursor-color':  '#D4AF37',
        '--selection-bg':  'rgba(212,175,55,0.2)',
        '--line-hl':       '#EDE6DA',
        '--scrollbar-bg':  'rgba(0,0,0,0.12)',
        '--hl-kw':         '#A88E3A',
        '--hl-fn':         '#2F4A5C',
        '--hl-st':         '#7A746B',
        '--hl-nu':         '#C2A14A',
        '--hl-cm':         '#A8A094',
        '--hl-bi':         '#5C768A',
        '--hl-dc':         '#A88E3A',
      },
    },

    // ── Aegean Night ─────────────────────────────────────────
    {
      id:   'aegean-night',
      name: 'Aegean Night',
      desc: 'Deep stone — burnished gold',
      swatch: { bg: '#1A1815', bar1: '#22201C', bar2: '#B89B3C', bar3: '#2C4452' },
      vars: {
        '--bg':            '#12110F',
        '--bg2':           '#1A1815',
        '--bg3':           '#22201C',
        '--bg4':           '#2A2723',
        '--text':          '#E8E2D8',
        '--text-dim':      '#A8A094',
        '--text-muted':    '#6A6460',
        '--accent':        '#B89B3C',
        '--accent-h':      '#CDB050',
        '--accent-bg':     'rgba(184,155,60,0.14)',
        '--border':        '#2A2723',
        '--border2':       '#343128',
        '--border3':       '#403D38',
        '--success':       '#4A8050',
        '--success-bg':    'rgba(74,128,80,0.1)',
        '--danger':        '#A04040',
        '--danger-bg':     'rgba(160,64,64,0.1)',
        '--glass-bg':      'rgba(26,24,21,0.96)',
        '--shadow-sm':     '0 2px 8px rgba(0,0,0,0.4)',
        '--shadow-md':     '0 4px 24px rgba(0,0,0,0.6)',
        '--shadow-lg':     '0 8px 48px rgba(0,0,0,0.75)',
        '--cursor-color':  '#B89B3C',
        '--selection-bg':  'rgba(184,155,60,0.2)',
        '--line-hl':       '#1F1D19',
        '--scrollbar-bg':  'rgba(255,255,255,0.07)',
        '--hl-kw':         '#B89B3C',
        '--hl-fn':         '#5C8AA8',
        '--hl-st':         '#D6CEC2',
        '--hl-nu':         '#9F8732',
        '--hl-cm':         '#7A746B',
        '--hl-bi':         '#7A9AB0',
        '--hl-dc':         '#CDB050',
      },
    },

    // ── Void ─────────────────────────────────────────────────
    {
      id:   'void',
      name: 'Void',
      desc: 'Default near-black',
      swatch: { bg: '#111114', bar1: '#18181c', bar2: '#e2e4e8', bar3: '#61afef' },
      vars: {
        '--bg':            '#0a0a0c',
        '--bg2':           '#111114',
        '--bg3':           '#18181c',
        '--bg4':           '#1e1e24',
        '--text':          '#d4d8de',
        '--text-dim':      '#606470',
        '--text-muted':    '#383c44',
        '--accent':        '#e2e4e8',
        '--accent-h':      '#f4f5f7',
        '--accent-bg':     'rgba(255,255,255,0.06)',
        '--border':        'rgba(255,255,255,0.05)',
        '--border2':       'rgba(255,255,255,0.09)',
        '--border3':       'rgba(255,255,255,0.15)',
        '--success':       '#3fb950',
        '--success-bg':    'rgba(63,185,80,0.08)',
        '--danger':        '#f85149',
        '--danger-bg':     'rgba(248,81,73,0.08)',
        '--glass-bg':      'rgba(18,21,30,0.92)',
        '--shadow-sm':     '0 2px 8px rgba(0,0,0,0.35)',
        '--shadow-md':     '0 4px 24px rgba(0,0,0,0.55)',
        '--shadow-lg':     '0 8px 48px rgba(0,0,0,0.7)',
        '--cursor-color':  '#e2e4e8',
        '--selection-bg':  'rgba(255,255,255,0.12)',
        '--line-hl':       '#111114',
        '--scrollbar-bg':  'rgba(255,255,255,0.08)',
        '--hl-kw':         '#b47eed',
        '--hl-fn':         '#61afef',
        '--hl-st':         '#7ec678',
        '--hl-nu':         '#d19a66',
        '--hl-cm':         '#485263',
        '--hl-bi':         '#56b6c2',
        '--hl-dc':         '#e06c75',
      },
    },

    // ── Graphite ──────────────────────────────────────────────
    {
      id:   'graphite',
      name: 'Graphite',
      desc: 'Neutral gray tones',
      swatch: { bg: '#161616', bar1: '#1e1e1e', bar2: '#e0e0e0', bar3: '#61afef' },
      vars: {
        '--bg':            '#0d0d0d',
        '--bg2':           '#161616',
        '--bg3':           '#1e1e1e',
        '--bg4':           '#252525',
        '--text':          '#cacaca',
        '--text-dim':      '#5e5e5e',
        '--text-muted':    '#363636',
        '--accent':        '#e0e0e0',
        '--accent-h':      '#f2f2f2',
        '--accent-bg':     'rgba(255,255,255,0.06)',
        '--border':        'rgba(255,255,255,0.05)',
        '--border2':       'rgba(255,255,255,0.09)',
        '--border3':       'rgba(255,255,255,0.15)',
        '--success':       '#3fb950',
        '--success-bg':    'rgba(63,185,80,0.08)',
        '--danger':        '#f85149',
        '--danger-bg':     'rgba(248,81,73,0.08)',
        '--glass-bg':      'rgba(13,13,13,0.94)',
        '--shadow-sm':     '0 2px 8px rgba(0,0,0,0.35)',
        '--shadow-md':     '0 4px 24px rgba(0,0,0,0.55)',
        '--shadow-lg':     '0 8px 48px rgba(0,0,0,0.7)',
        '--cursor-color':  '#e0e0e0',
        '--selection-bg':  'rgba(255,255,255,0.12)',
        '--line-hl':       '#161616',
        '--scrollbar-bg':  'rgba(255,255,255,0.08)',
        '--hl-kw':         '#b47eed',
        '--hl-fn':         '#61afef',
        '--hl-st':         '#7ec678',
        '--hl-nu':         '#d19a66',
        '--hl-cm':         '#485263',
        '--hl-bi':         '#56b6c2',
        '--hl-dc':         '#e06c75',
      },
    },

    // ── Ember ─────────────────────────────────────────────────
    {
      id:   'ember',
      name: 'Ember',
      desc: 'Subtle warm tint',
      swatch: { bg: '#141210', bar1: '#1c1916', bar2: '#e8ddd0', bar3: '#d19a66' },
      vars: {
        '--bg':            '#0c0a08',
        '--bg2':           '#141210',
        '--bg3':           '#1c1916',
        '--bg4':           '#23201c',
        '--text':          '#d8d0c8',
        '--text-dim':      '#60584e',
        '--text-muted':    '#383028',
        '--accent':        '#e8ddd0',
        '--accent-h':      '#f5ede0',
        '--accent-bg':     'rgba(255,245,230,0.06)',
        '--border':        'rgba(255,240,220,0.05)',
        '--border2':       'rgba(255,240,220,0.09)',
        '--border3':       'rgba(255,240,220,0.15)',
        '--success':       '#3fb950',
        '--success-bg':    'rgba(63,185,80,0.08)',
        '--danger':        '#f85149',
        '--danger-bg':     'rgba(248,81,73,0.08)',
        '--glass-bg':      'rgba(12,10,8,0.94)',
        '--shadow-sm':     '0 2px 8px rgba(0,0,0,0.35)',
        '--shadow-md':     '0 4px 24px rgba(0,0,0,0.55)',
        '--shadow-lg':     '0 8px 48px rgba(0,0,0,0.7)',
        '--cursor-color':  '#e8ddd0',
        '--selection-bg':  'rgba(255,240,200,0.12)',
        '--line-hl':       '#141210',
        '--scrollbar-bg':  'rgba(255,240,220,0.08)',
        '--hl-kw':         '#b47eed',
        '--hl-fn':         '#61afef',
        '--hl-st':         '#7ec678',
        '--hl-nu':         '#d19a66',
        '--hl-cm':         '#485263',
        '--hl-bi':         '#56b6c2',
        '--hl-dc':         '#e06c75',
      },
    },

    // ── Monolith ──────────────────────────────────────────────
    {
      id:   'monolith',
      name: 'Monolith',
      desc: 'Pure black, high contrast',
      swatch: { bg: '#0a0a0a', bar1: '#111111', bar2: '#ffffff', bar3: '#61afef' },
      vars: {
        '--bg':            '#000000',
        '--bg2':           '#0a0a0a',
        '--bg3':           '#111111',
        '--bg4':           '#181818',
        '--text':          '#f0f0f0',
        '--text-dim':      '#646464',
        '--text-muted':    '#323232',
        '--accent':        '#ffffff',
        '--accent-h':      '#ffffff',
        '--accent-bg':     'rgba(255,255,255,0.07)',
        '--border':        'rgba(255,255,255,0.06)',
        '--border2':       'rgba(255,255,255,0.10)',
        '--border3':       'rgba(255,255,255,0.18)',
        '--success':       '#3fb950',
        '--success-bg':    'rgba(63,185,80,0.08)',
        '--danger':        '#f85149',
        '--danger-bg':     'rgba(248,81,73,0.08)',
        '--glass-bg':      'rgba(0,0,0,0.96)',
        '--shadow-sm':     '0 2px 8px rgba(0,0,0,0.5)',
        '--shadow-md':     '0 4px 24px rgba(0,0,0,0.7)',
        '--shadow-lg':     '0 8px 48px rgba(0,0,0,0.85)',
        '--cursor-color':  '#ffffff',
        '--selection-bg':  'rgba(255,255,255,0.15)',
        '--line-hl':       '#0a0a0a',
        '--scrollbar-bg':  'rgba(255,255,255,0.08)',
        '--hl-kw':         '#b47eed',
        '--hl-fn':         '#61afef',
        '--hl-st':         '#7ec678',
        '--hl-nu':         '#d19a66',
        '--hl-cm':         '#485263',
        '--hl-bi':         '#56b6c2',
        '--hl-dc':         '#e06c75',
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

  // Apply saved theme on load (default: Aegean Light)
  apply(localStorage.getItem(STORAGE_KEY) || 'void');

  // ── UI ────────────────────────────────────────────────────
  const elOverlay = document.getElementById('tp-overlay');
  const elClose   = document.getElementById('tp-close');
  const elCards   = document.getElementById('tp-cards');

  function render() {
    const active = document.documentElement.dataset.theme || 'aegean-light';
    elCards.innerHTML = '';
    for (const t of THEMES) {
      const card = document.createElement('div');
      card.className = 'tp-card' + (t.id === active ? ' tp-card-active' : '');
      card.innerHTML = `
        <div class="tp-swatch" style="background:${t.swatch.bg}">
          <div class="tp-sw-bar" style="background:${t.swatch.bar1}"></div>
          <div class="tp-sw-bar" style="background:${t.swatch.bar2};width:60%;opacity:0.6"></div>
          <div class="tp-sw-bar" style="background:${t.swatch.bar3};width:40%;opacity:0.8"></div>
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
