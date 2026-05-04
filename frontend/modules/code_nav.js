// ── Code Navigation (code_navigation_v1) ──────────────────
// F12          → Go to Definition
// Shift+F12    → Find References
// Ctrl+Alt+←/→ → Navigation history
// Depends on: state, setStatus

(function () {
  const elEditor = document.getElementById('editor');
  const elRefs   = document.getElementById('refs-panel');

  // ── Nav history ───────────────────────────────────────────
  const navStack = [];
  let   navIdx   = -1;

  function pushNav() {
    navStack.splice(navIdx + 1);
    navStack.push(elEditor.selectionStart);
    if (navStack.length > 100) navStack.shift();
    navIdx = navStack.length - 1;
  }

  function navBack() {
    if (navIdx <= 0) return;
    navIdx--;
    applyNavPos(navStack[navIdx]);
  }

  function navForward() {
    if (navIdx >= navStack.length - 1) return;
    navIdx++;
    applyNavPos(navStack[navIdx]);
  }

  function applyNavPos(pos) {
    elEditor.focus();
    elEditor.setSelectionRange(pos, pos);
    scrollEditorToOffset(pos);
  }

  // ── Helpers ───────────────────────────────────────────────
  function getWordAtCursor() {
    const pos = elEditor.selectionStart;
    const txt = elEditor.value;
    let s = pos, e = pos;
    while (s > 0 && /\w/.test(txt[s - 1])) s--;
    while (e < txt.length && /\w/.test(txt[e])) e++;
    return txt.slice(s, e);
  }

  function lineNumOfOffset(offset) {
    return elEditor.value.slice(0, offset).split('\n').length;
  }

  function offsetOfLine(lineNum) {
    const lines = elEditor.value.split('\n');
    let off = 0;
    for (let i = 0; i < lineNum - 1 && i < lines.length; i++) off += lines[i].length + 1;
    return off;
  }

  function scrollEditorToOffset(offset) {
    const style   = getComputedStyle(elEditor);
    const lh      = parseFloat(style.lineHeight)  || 22;
    const padTop  = parseFloat(style.paddingTop)   || 16;
    const lineNum = lineNumOfOffset(offset);
    elEditor.scrollTop = padTop + (lineNum - 1) * lh - elEditor.clientHeight / 2 + lh / 2;
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Line-number flash ─────────────────────────────────────
  function flashLineNum(lineNum) {
    const rows = document.querySelectorAll('.ln-row');
    const row  = rows[lineNum - 1];
    if (!row) return;
    row.classList.add('ln-flash');
    setTimeout(() => row.classList.remove('ln-flash'), 700);
  }

  // ── Jump ──────────────────────────────────────────────────
  function jumpTo(lineNum) {
    pushNav();
    const off = offsetOfLine(lineNum);
    const line = elEditor.value.split('\n')[lineNum - 1] || '';
    elEditor.focus();
    elEditor.setSelectionRange(off, off + line.length);
    scrollEditorToOffset(off);
    flashLineNum(lineNum);
  }

  // ── Go to Definition (F12) ────────────────────────────────
  function goToDefinition() {
    const word = getWordAtCursor();
    if (!word) return;

    const lines = elEditor.value.split('\n');
    const curLine = lineNumOfOffset(elEditor.selectionStart);

    const patterns = [
      new RegExp(`^\\s*def\\s+${word}\\s*\\(`),
      new RegExp(`^\\s*class\\s+${word}[\\s:(]`),
      new RegExp(`^\\s*${word}\\s*=(?!=)`),
    ];

    // Search from cursor downward, then wrap around
    const order = [...Array(lines.length).keys()].map(i => (i + curLine) % lines.length);

    for (const pat of patterns) {
      for (const i of order) {
        if (i + 1 === curLine) continue; // skip current line
        if (pat.test(lines[i])) {
          jumpTo(i + 1);
          setStatus('Definition at line ' + (i + 1), '');
          return;
        }
      }
    }
    setStatus('No definition found for "' + word + '"', 'err');
  }

  // ── Find References (Shift+F12) ───────────────────────────
  function findReferences() {
    const word = getWordAtCursor();
    if (!word) return;

    const lines = elEditor.value.split('\n');
    const re    = new RegExp(`\\b${word}\\b`);
    const refs  = [];

    lines.forEach((line, i) => {
      if (re.test(line)) refs.push({ lineNum: i + 1, text: line.trim() });
    });

    if (refs.length === 0) { setStatus('No references to "' + word + '"', 'err'); return; }

    renderRefs(word, refs);
    setStatus(refs.length + ' reference' + (refs.length !== 1 ? 's' : '') + ' to "' + word + '"', '');
  }

  // ── Refs panel ────────────────────────────────────────────
  function renderRefs(word, refs) {
    elRefs.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'refs-header';
    header.innerHTML =
      `<span>${refs.length} reference${refs.length !== 1 ? 's' : ''} to <strong>${escHtml(word)}</strong></span>` +
      `<button id="refs-close-btn">×</button>`;
    elRefs.appendChild(header);

    const list = document.createElement('div');
    list.className = 'refs-list';
    refs.forEach(r => {
      const row = document.createElement('div');
      row.className = 'refs-row';
      row.innerHTML =
        `<span class="refs-lnum">${r.lineNum}</span>` +
        `<span class="refs-text">${escHtml(r.text)}</span>`;
      row.addEventListener('click', () => { jumpTo(r.lineNum); closeRefs(); });
      list.appendChild(row);
    });
    elRefs.appendChild(list);
    elRefs.classList.remove('hidden');

    document.getElementById('refs-close-btn').addEventListener('click', closeRefs);
  }

  function closeRefs() { elRefs.classList.add('hidden'); }

  // ── Keyboard ──────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    const inEditor = document.activeElement === elEditor;

    if (e.key === 'F12' && !e.shiftKey) {
      e.preventDefault();
      if (inEditor) goToDefinition();
    }

    if (e.key === 'F12' && e.shiftKey) {
      e.preventDefault();
      if (inEditor) findReferences();
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      navBack();
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      navForward();
    }

    if (e.key === 'Escape') closeRefs();
  });
})();
