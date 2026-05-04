// ── Syntax Highlighting (feature_reintroduction_highlight_v1)
// Pure frontend — no backend. Only activates for .py files.
// Creates #editor-hl overlay inside #editor-area.

(function () {
  const elEditor = document.getElementById('editor');
  const elArea   = document.getElementById('editor-area');

  // Create the overlay div
  const elHL = document.createElement('div');
  elHL.id = 'editor-hl';
  elArea.insertBefore(elHL, elEditor);

  // ── Python token sets ─────────────────────────────────────
  const KW = new Set([
    'False','None','True','and','as','assert','async','await',
    'break','class','continue','def','del','elif','else','except',
    'finally','for','from','global','if','import','in','is','lambda',
    'nonlocal','not','or','pass','raise','return','try','while','with','yield',
  ]);

  const BI = new Set([
    'abs','all','any','ascii','bin','bool','breakpoint','bytearray','bytes',
    'callable','chr','classmethod','compile','complex','delattr','dict','dir',
    'divmod','enumerate','eval','exec','filter','float','format','frozenset',
    'getattr','globals','hasattr','hash','help','hex','id','input','int',
    'isinstance','issubclass','iter','len','list','locals','map','max',
    'memoryview','min','next','object','oct','open','ord','pow','print',
    'property','range','repr','reversed','round','set','setattr','slice',
    'sorted','staticmethod','str','sum','super','tuple','type','vars','zip',
    'Exception','ValueError','TypeError','KeyError','IndexError',
    'AttributeError','ImportError','OSError','RuntimeError','StopIteration',
    'NotImplementedError','NameError','ZeroDivisionError','FileNotFoundError',
  ]);

  // Token regex (groups: str, cmt, num, dec, ident)
  const TOK = /(`{3}[\s\S]*?`{3}|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(#[^\n]*)/
    .source
    .replace(/`/g, '`') // no actual template literals — placeholder
    ;

  // Rebuilt without template literal confusion:
  const TOK_RE = new RegExp(
    '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')' +
    '|(#[^\\n]*)' +
    '|\\b(\\d+\\.?\\d*(?:[eE][+-]?\\d+)?|0x[\\da-fA-F]+)\\b' +
    '|(@\\w+)' +
    '|([A-Za-z_]\\w*)',
    'g'
  );

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tokenize(code) {
    let html     = '';
    let last     = 0;
    let prevDef  = false;

    TOK_RE.lastIndex = 0;
    let m;

    while ((m = TOK_RE.exec(code)) !== null) {
      // Escape plain text between tokens
      if (m.index > last) html += esc(code.slice(last, m.index));
      last = m.index + m[0].length;

      const [, str, cmt, num, dec, id] = m;

      if (str !== undefined) {
        prevDef = false;
        html += `<span class="hl-st">${esc(m[0])}</span>`;
      } else if (cmt !== undefined) {
        prevDef = false;
        html += `<span class="hl-cm">${esc(m[0])}</span>`;
      } else if (num !== undefined) {
        prevDef = false;
        html += `<span class="hl-nu">${esc(m[0])}</span>`;
      } else if (dec !== undefined) {
        prevDef = false;
        html += `<span class="hl-dc">${esc(m[0])}</span>`;
      } else if (id !== undefined) {
        if (KW.has(m[0])) {
          prevDef = m[0] === 'def' || m[0] === 'class';
          html += `<span class="hl-kw">${esc(m[0])}</span>`;
        } else if (prevDef) {
          prevDef = false;
          html += `<span class="hl-fn">${esc(m[0])}</span>`;
        } else if (BI.has(m[0])) {
          prevDef = false;
          html += `<span class="hl-bi">${esc(m[0])}</span>`;
        } else {
          prevDef = false;
          html += esc(m[0]);
        }
      }
    }

    // Remaining plain text
    if (last < code.length) html += esc(code.slice(last));
    return html;
  }

  // ── State ─────────────────────────────────────────────────
  let hlActive = false;
  let hlTimer  = null;

  function enable() {
    hlActive = true;
    elEditor.classList.add('hl-active');
    elHL.style.display = '';
    update();
  }

  function disable() {
    hlActive = false;
    elEditor.classList.remove('hl-active');
    elHL.style.display = 'none';
    elHL.innerHTML = '';
  }

  function update() {
    if (!hlActive) return;
    elHL.innerHTML = tokenize(elEditor.value);
    syncScroll();
  }

  function scheduleUpdate() {
    clearTimeout(hlTimer);
    hlTimer = setTimeout(update, 30);
  }

  function syncScroll() {
    elHL.scrollTop  = elEditor.scrollTop;
    elHL.scrollLeft = elEditor.scrollLeft;
  }

  // ── Events ─────────────────────────────────────────────────
  elEditor.addEventListener('input',  scheduleUpdate);
  elEditor.addEventListener('scroll', syncScroll);

  // ── Chain onFileOpen hook ──────────────────────────────────
  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    if (path && path.endsWith('.py')) {
      enable();
    } else {
      disable();
    }
  };

  // Start hidden
  disable();
})();
