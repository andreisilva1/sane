(function () {
  const elEditor = document.getElementById('editor');

  const CODE_EXTS = new Set(['.py','.js','.ts','.tsx','.go','.java','.c','.cpp','.cs','.rb','.rs','.php','.swift','.kt']);
  let active = false;

  // ── Toolbar element ───────────────────────────────────────
  const elBar = document.createElement('div');
  elBar.id = 'ait-bar';
  elBar.className = 'hidden';
  document.body.appendChild(elBar);

  const ACTIONS = [
    { label: 'Explain',  text: 'Explain this code concisely.' },
    { label: 'Improve',  text: 'Improve this code and show the updated version.' },
    { label: 'Refactor', text: 'Refactor this code for clarity and best practices.' },
  ];

  for (const action of ACTIONS) {
    const btn = document.createElement('button');
    btn.className = 'ait-btn';
    btn.textContent = action.label;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // preserve selection
      const sel = elEditor.value.slice(elEditor.selectionStart, elEditor.selectionEnd).trim();
      if (!sel) return;
      hide();
      // Store selection so the context assembler picks it up
      window.sane._aiSelection = sel;
      document.dispatchEvent(new CustomEvent('sane:ai-ask', {
        detail: { text: action.text }
      }));
    });
    elBar.appendChild(btn);
  }

  // ── Show / hide ───────────────────────────────────────────
  function show(x, y) {
    const barW = 200, barH = 30;
    const cx = Math.min(Math.max(x - barW / 2, 8), window.innerWidth  - barW - 8);
    const cy = Math.max(y - barH - 8, 8);
    elBar.style.left = cx + 'px';
    elBar.style.top  = cy + 'px';
    elBar.classList.remove('hidden');
  }

  function hide() { elBar.classList.add('hidden'); }

  // ── Selection detection ───────────────────────────────────
  function checkSelection(mouseX, mouseY) {
    if (!active) return hide();
    const sel = elEditor.value.slice(elEditor.selectionStart, elEditor.selectionEnd).trim();
    if (!sel) return hide();
    show(mouseX, mouseY);
  }

  elEditor.addEventListener('mouseup', (e) => {
    setTimeout(() => checkSelection(e.clientX, e.clientY), 10);
  });

  elEditor.addEventListener('keyup', (e) => {
    if (e.shiftKey) {
      const rect = elEditor.getBoundingClientRect();
      setTimeout(() => checkSelection(rect.left + rect.width / 2, rect.top + 40), 10);
    } else {
      hide();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!elBar.contains(e.target)) hide();
  });

  // ── Hook ─────────────────────────────────────────────────
  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    const ext = path ? path.slice(path.lastIndexOf('.')).toLowerCase() : '';
    active = CODE_EXTS.has(ext);
    hide();
  };
})();
