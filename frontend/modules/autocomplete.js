// ── Autocomplete (feature_reintroduction_autocomplete_v1) ──
// Pure frontend. Only active for .py files.
// Shows keyword/builtin suggestions while typing (2+ chars).

(function () {
  const elEditor = document.getElementById('editor');

  const KW = [
    'False','None','True','and','as','assert','async','await',
    'break','class','continue','def','del','elif','else','except',
    'finally','for','from','global','if','import','in','is','lambda',
    'nonlocal','not','or','pass','raise','return','try','while','with','yield',
  ];
  const BI = [
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
  ];
  const ALL = [...new Set([...KW, ...BI])].sort();

  // ── Dropdown element ──────────────────────────────────────
  const elMenu = document.createElement('div');
  elMenu.id = 'ac-menu';
  elMenu.className = 'hidden';
  document.body.appendChild(elMenu);

  let active  = false;   // .py file open
  let items   = [];      // current suggestion list
  let selIdx  = 0;

  // ── State ─────────────────────────────────────────────────
  function wordBefore() {
    const val = elEditor.value;
    const pos = elEditor.selectionStart;
    let start = pos;
    while (start > 0 && /\w/.test(val[start - 1])) start--;
    return { word: val.slice(start, pos), start, end: pos };
  }

  // ── Show / hide ───────────────────────────────────────────
  function show() { elMenu.classList.remove('hidden'); }
  function hide() { elMenu.classList.add('hidden'); items = []; selIdx = 0; }

  function update() {
    if (!active) return hide();
    const { word } = wordBefore();
    if (word.length < 2) return hide();

    const lo = word.toLowerCase();
    items = ALL.filter(w => w.toLowerCase().startsWith(lo) && w !== word);
    if (items.length === 0) return hide();

    selIdx = 0;
    render();
    position();
    show();
  }

  function render() {
    elMenu.innerHTML = '';
    const visible = items.slice(0, 10);
    visible.forEach((w, i) => {
      const el = document.createElement('div');
      el.className = 'ac-item' + (i === 0 ? ' ac-selected' : '');
      el.textContent = w;
      el.addEventListener('mousedown', (e) => { e.preventDefault(); accept(i); });
      el.addEventListener('mousemove', () => setSelected(i));
      elMenu.appendChild(el);
    });
  }

  function setSelected(i) {
    elMenu.querySelectorAll('.ac-item').forEach((el, j) =>
      el.classList.toggle('ac-selected', j === i));
    selIdx = i;
  }

  // ── Position dropdown near cursor ─────────────────────────
  function position() {
    const editorRect = elEditor.getBoundingClientRect();
    const style      = getComputedStyle(elEditor);
    const lh         = parseFloat(style.lineHeight) || 22;
    const padTop     = parseFloat(style.paddingTop)  || 14;
    const padLeft    = parseFloat(style.paddingLeft) || 18;

    const text = elEditor.value;
    const pos  = elEditor.selectionStart;
    const linesBefore = text.slice(0, pos).split('\n');
    const lineNum     = linesBefore.length - 1;
    const colNum      = linesBefore[linesBefore.length - 1].length;

    // Approximate character width using a canvas
    if (!position._ctx) {
      const c = document.createElement('canvas');
      position._ctx = c.getContext('2d');
    }
    position._ctx.font = style.fontSize + ' ' + style.fontFamily;
    const charW = position._ctx.measureText('m').width;

    const top  = editorRect.top  + padTop  + (lineNum + 1) * lh - elEditor.scrollTop;
    const left = editorRect.left + padLeft + colNum * charW;

    const menuH = Math.min(items.length, 10) * 24 + 4;
    const menuW = 160;

    elMenu.style.top  = Math.min(top,  window.innerHeight - menuH - 4) + 'px';
    elMenu.style.left = Math.min(left, window.innerWidth  - menuW - 4) + 'px';
  }

  // ── Accept suggestion ─────────────────────────────────────
  function accept(i) {
    const { word, start, end } = wordBefore();
    const completion = (items[i] !== undefined ? items[i] : items[selIdx]);
    if (!completion) return hide();

    const val = elEditor.value;
    elEditor.value = val.slice(0, start) + completion + val.slice(end);
    elEditor.selectionStart = elEditor.selectionEnd = start + completion.length;
    elEditor.dispatchEvent(new Event('input'));
    hide();
  }

  // ── Keyboard intercept ────────────────────────────────────
  elEditor.addEventListener('keydown', (e) => {
    if (elMenu.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(Math.min(selIdx + 1, Math.min(items.length, 10) - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(Math.max(selIdx - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); }
      if (e.key === 'Enter') {
        // Only intercept Enter if a non-first item is selected (first is just default typing)
        if (selIdx === 0 && items.length > 1) { hide(); return; }
        e.preventDefault();
      }
      accept(selIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  }, true); // capture phase so we run before other handlers

  elEditor.addEventListener('input',  update);
  elEditor.addEventListener('blur',   () => setTimeout(hide, 100));
  elEditor.addEventListener('scroll', () => { if (!elMenu.classList.contains('hidden')) position(); });

  // ── Enable only for .py files ─────────────────────────────
  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    active = !!(path && path.endsWith('.py'));
    hide();
  };
})();
