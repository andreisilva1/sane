// ── Line Numbers (feature_reintroduction_linenumbers_v1) ──
// Depends on: elEditor (global from main.js)
// No backend calls. Syncs a div of line numbers with the textarea.

(function () {
  const elNums   = document.getElementById('line-numbers');
  const elEditor = document.getElementById('editor');

  let lastCount   = 0;
  let lastCurLine = -1;

  function getLineHeight() {
    // Read from computed style once per session (font is constant)
    if (!getLineHeight._val) {
      const lh = parseFloat(getComputedStyle(elEditor).lineHeight);
      getLineHeight._val = isNaN(lh) ? 21 : lh;
    }
    return getLineHeight._val;
  }

  function currentLine() {
    const text = elEditor.value.slice(0, elEditor.selectionStart);
    return text.split('\n').length - 1;
  }

  function update() {
    const count = (elEditor.value.match(/\n/g) || []).length + 1;
    const cur   = currentLine();

    // Rebuild only if line count changed
    if (count !== lastCount) {
      elNums.innerHTML = '';
      for (let i = 1; i <= count; i++) {
        const d = document.createElement('span');
        d.className = 'ln-row';
        d.textContent = i;
        elNums.appendChild(d);
      }
      lastCount = count;
      lastCurLine = -1; // force active update
    }

    // Update active line highlight
    if (cur !== lastCurLine) {
      const rows = elNums.children;
      if (lastCurLine >= 0 && rows[lastCurLine]) rows[lastCurLine].classList.remove('ln-active');
      if (rows[cur]) rows[cur].classList.add('ln-active');
      lastCurLine = cur;
    }

    syncScroll();
  }

  function syncScroll() {
    elNums.scrollTop = elEditor.scrollTop;
  }

  // ── Events ─────────────────────────────────────────────
  elEditor.addEventListener('input',  update);
  elEditor.addEventListener('scroll', syncScroll);
  elEditor.addEventListener('click',  update);
  elEditor.addEventListener('keyup',  update);

  // ── Chain onFileOpen hook ───────────────────────────────
  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    requestAnimationFrame(update);
  };

  // Initial render (empty state)
  update();
})();
