// ── ANSI → HTML renderer ──────────────────────────────────
// Shared by terminal.js and runner.js.
// Parses SGR escape sequences into inline styles.
// All non-rendering codes (cursor movement, erase) are stripped silently.

(function () {

  // Standard 16 colors — values reference CSS vars so they respect theming.
  const FG = {
    30: 'var(--ansi-black)',     31: 'var(--ansi-red)',
    32: 'var(--ansi-green)',     33: 'var(--ansi-yellow)',
    34: 'var(--ansi-blue)',      35: 'var(--ansi-magenta)',
    36: 'var(--ansi-cyan)',      37: 'var(--ansi-white)',
    90: 'var(--ansi-br-black)',  91: 'var(--ansi-br-red)',
    92: 'var(--ansi-br-green)',  93: 'var(--ansi-br-yellow)',
    94: 'var(--ansi-br-blue)',   95: 'var(--ansi-br-magenta)',
    96: 'var(--ansi-br-cyan)',   97: 'var(--ansi-br-white)',
  };
  const BG = {
    40: 'var(--ansi-black)',     41: 'var(--ansi-red)',
    42: 'var(--ansi-green)',     43: 'var(--ansi-yellow)',
    44: 'var(--ansi-blue)',      45: 'var(--ansi-magenta)',
    46: 'var(--ansi-cyan)',      47: 'var(--ansi-white)',
    100:'var(--ansi-br-black)',  101:'var(--ansi-br-red)',
    102:'var(--ansi-br-green)',  103:'var(--ansi-br-yellow)',
    104:'var(--ansi-br-blue)',   105:'var(--ansi-br-magenta)',
    106:'var(--ansi-br-cyan)',   107:'var(--ansi-br-white)',
  };

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 256-color → CSS color string
  function ansi256(n) {
    n = n | 0;
    if (n < 16) {
      const map = [30,31,32,33,34,35,36,37,90,91,92,93,94,95,96,97];
      return FG[map[n]] || 'inherit';
    }
    if (n >= 232) {
      const v = Math.round(8 + (n - 232) * 10.3);
      return `rgb(${v},${v},${v})`;
    }
    const idx = n - 16;
    const b = idx % 6, g = Math.floor(idx / 6) % 6, r = Math.floor(idx / 36);
    const cv = v => v ? v * 40 + 55 : 0;
    return `rgb(${cv(r)},${cv(g)},${cv(b)})`;
  }

  function applySGR(params, s) {
    let i = 0;
    while (i < params.length) {
      const p = params[i];
      if      (p === 0 || p === '')  { s.fg = null; s.bg = null; s.bold = false; s.dim = false; s.italic = false; s.ul = false; }
      else if (p === 1)  { s.bold   = true; }
      else if (p === 2)  { s.dim    = true; }
      else if (p === 3)  { s.italic = true; }
      else if (p === 4)  { s.ul     = true; }
      else if (p === 22) { s.bold   = false; s.dim = false; }
      else if (p === 23) { s.italic = false; }
      else if (p === 24) { s.ul     = false; }
      else if (p === 39) { s.fg = null; }
      else if (p === 49) { s.bg = null; }
      else if (FG[p])    { s.fg = FG[p]; }
      else if (BG[p])    { s.bg = BG[p]; }
      else if (p === 38 && params[i+1] === 5 && params[i+2] != null) {
        s.fg = ansi256(params[i+2]); i += 2;
      } else if (p === 38 && params[i+1] === 2 && params[i+4] != null) {
        s.fg = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`; i += 4;
      } else if (p === 48 && params[i+1] === 5 && params[i+2] != null) {
        s.bg = ansi256(params[i+2]); i += 2;
      } else if (p === 48 && params[i+1] === 2 && params[i+4] != null) {
        s.bg = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`; i += 4;
      }
      i++;
    }
  }

  function stateToStyle(s) {
    const p = [];
    if (s.fg)     p.push('color:'           + s.fg);
    if (s.bg)     p.push('background:'      + s.bg);
    if (s.bold)   p.push('font-weight:700');
    if (s.dim)    p.push('opacity:0.5');
    if (s.italic) p.push('font-style:italic');
    if (s.ul)     p.push('text-decoration:underline');
    return p.join(';');
  }

  // Convert a string with ANSI escapes to safe HTML.
  function ansiToHtml(text) {
    if (typeof text !== 'string') return '';
    // Normalize line endings and strip OSC sequences (window title, hyperlinks, etc.)
    text = text.replace(/\r/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');

    const state = { fg: null, bg: null, bold: false, dim: false, italic: false, ul: false };
    const parts = [];
    const re    = /\x1b\[([0-9;]*)([A-Za-z])/g;
    let   last  = 0;

    for (const m of text.matchAll(re)) {
      if (m.index > last) {
        parts.push({ t: text.slice(last, m.index), style: stateToStyle(state) });
      }
      last = m.index + m[0].length;
      if (m[2] === 'm') {
        const params = m[1].split(';').map(p => p === '' ? 0 : parseInt(p, 10));
        applySGR(params, state);
      }
      // all other CSI commands (cursor, erase, etc.) are dropped silently
    }

    if (last < text.length) {
      parts.push({ t: text.slice(last), style: stateToStyle(state) });
    }

    return parts.map(({ t, style }) => {
      const e = esc(t);
      if (!e) return '';
      return style ? `<span style="${style}">${e}</span>` : e;
    }).join('');
  }

  // Strip all ANSI escapes — used for content-based line classification.
  function stripAnsi(text) {
    return String(text)
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\r/g, '');
  }

  // Return an extra CSS class based on line content.
  // Applied on top of the stream-type class (term-stdout, out-stderr, etc.)
  function classifyLine(raw) {
    const t = stripAnsi(raw).trimStart();
    if (/^(error[:\s]|err\b|Error:|TypeError|ReferenceError|SyntaxError|URIError|EvalError|Cannot find|Module not found|ENOENT|EACCES|EPERM|EADDRINUSE|ECONNREFUSED|exit code [^0]|✗|×|FAILED|BUILD FAILED|npm ERR!)/i.test(t))
      return 'tl-error';
    if (/^(warn[:\s]|warning|WARN|WARNING|⚠|DeprecationWarning|ExperimentalWarning)/i.test(t))
      return 'tl-warn';
    if (/^(✓|✔|done|DONE|ready|Ready|compiled|built in|server running|listening on|started|Local:|Network:|➜)/i.test(t))
      return 'tl-success';
    if (/^\s{2,}at /.test(raw) || /^\s*at .+\(.+:\d+:\d+\)/.test(t))
      return 'tl-stack';
    return '';
  }

  window.sane             = window.sane || {};
  window.sane.ansiToHtml  = ansiToHtml;
  window.sane.stripAnsi   = stripAnsi;
  window.sane.classifyLine = classifyLine;

})();
