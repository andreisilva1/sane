// ── AI Inline Toolbar (feature_reintroduction_ai_inline_v1)
// Depends on: state, window.sane.onFileOpen, 'sane:ai-ask' event
// Shows a floating toolbar when text is selected in a .py editor.

(function () {
  const elEditor = document.getElementById('editor');

  let active = false; // only for .py files

  // ── Toolbar element ───────────────────────────────────────
  const elBar = document.createElement('div');
  elBar.id = 'ait-bar';
  elBar.className = 'hidden';
  document.body.appendChild(elBar);

  const ACTIONS = [
    { id: 'explain',  label: 'Explain',  prompt: sel => `Explain this Python code concisely:\n\`\`\`python\n${sel}\n\`\`\`` },
    { id: 'improve',  label: 'Improve',  prompt: sel => `Improve this Python code. Show only the improved version with a brief note on what changed:\n\`\`\`python\n${sel}\n\`\`\`` },
    { id: 'refactor', label: 'Refactor', prompt: sel => `Refactor this Python code for clarity and best practices. Show the refactored version:\n\`\`\`python\n${sel}\n\`\`\`` },
  ];

  for (const action of ACTIONS) {
    const btn = document.createElement('button');
    btn.className = 'ait-btn';
    btn.textContent = action.label;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // don't lose selection
      const sel = elEditor.value.slice(elEditor.selectionStart, elEditor.selectionEnd).trim();
      if (!sel) return;
      hide();
      document.dispatchEvent(new CustomEvent('sane:ai-ask', {
        detail: { prompt: action.prompt(sel), label: action.label }
      }));
    });
    elBar.appendChild(btn);
  }

  // ── Show / hide ───────────────────────────────────────────
  function show(x, y) {
    // Keep inside viewport
    const barW = 180, barH = 30;
    const cx = Math.min(Math.max(x - barW / 2, 8), window.innerWidth  - barW - 8);
    const cy = Math.max(y - barH - 8, 8);
    elBar.style.left = cx + 'px';
    elBar.style.top  = cy + 'px';
    elBar.classList.remove('hidden');
  }

  function hide() {
    elBar.classList.add('hidden');
  }

  // ── Selection detection ───────────────────────────────────
  function checkSelection(mouseX, mouseY) {
    if (!active) return hide();
    const start = elEditor.selectionStart;
    const end   = elEditor.selectionEnd;
    if (end <= start) return hide();
    const sel = elEditor.value.slice(start, end).trim();
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
    } else if (!e.shiftKey) {
      hide();
    }
  });

  // Hide on click elsewhere
  document.addEventListener('mousedown', (e) => {
    if (!elBar.contains(e.target)) hide();
  });

  // ── Hook ─────────────────────────────────────────────────
  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    active = !!(path && path.endsWith('.py'));
    hide();
  };
})();
