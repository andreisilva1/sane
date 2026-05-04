// ── Rename Symbol (rename_symbol_v1) ──────────────────────
// F2 → highlight all occurrences + rename widget fixed top-right
// Works on selection or any word at cursor. Any text, not just identifiers.
// Depends on: state, setStatus, saveFile

(function () {
  const elEditor = document.getElementById('editor');
  const elArea   = document.getElementById('editor-area');
  const elWidget = document.getElementById('rn-widget');
  const elOld    = document.getElementById('rn-old');
  const elInput  = document.getElementById('rn-input');
  const elCount  = document.getElementById('rn-count');
  const elConfirm= document.getElementById('rn-confirm');
  const elCancel = document.getElementById('rn-cancel');

  // ── Create highlight overlay (same pattern as #editor-hl) ──
  const elRnHl = document.createElement('div');
  elRnHl.id = 'rn-hl';
  elArea.insertBefore(elRnHl, elEditor);

  let searchText = '';
  let active     = false;

  // ── Helpers ───────────────────────────────────────────────
  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function countOccurrences(text, word) {
    if (!word) return 0;
    return text.split(word).length - 1;
  }

  // ── Scroll sync (same as highlight.js) ───────────────────
  function syncScroll() {
    if (!active) return;
    elRnHl.scrollTop  = elEditor.scrollTop;
    elRnHl.scrollLeft = elEditor.scrollLeft;
  }
  elEditor.addEventListener('scroll', syncScroll, { passive: true });

  // ── Render occurrence backgrounds ─────────────────────────
  function renderHighlights(word) {
    if (!word) { elRnHl.innerHTML = ''; return; }
    const escapedContent = escHtml(elEditor.value);
    const escapedWord    = escHtml(word);
    const re = new RegExp(escRe(escapedWord), 'g');
    elRnHl.innerHTML = escapedContent.replace(re, '<mark class="rn-match">$&</mark>');
    syncScroll();
  }

  // ── Get text to rename ────────────────────────────────────
  function getTarget() {
    const s = elEditor.selectionStart;
    const e = elEditor.selectionEnd;
    if (s !== e) return elEditor.value.slice(s, e);

    // Word at cursor (any non-whitespace, stop at brackets/quotes)
    const txt = elEditor.value;
    let a = s, b = s;
    while (a > 0 && /[^\s"'`()[\]{},;]/.test(txt[a - 1])) a--;
    while (b < txt.length && /[^\s"'`()[\]{},;]/.test(txt[b])) b++;
    return txt.slice(a, b);
  }

  // ── Open ──────────────────────────────────────────────────
  function open() {
    if (!state.filePath) { setStatus('Open a file first', 'err'); return; }
    const word = getTarget();
    if (!word) { setStatus('Select text or place cursor on a word', 'err'); return; }

    searchText = word;
    active     = true;

    const n = countOccurrences(elEditor.value, word);
    elOld.textContent   = word.length > 26 ? word.slice(0, 26) + '…' : word;
    elInput.value       = word;
    elCount.textContent = n + ' occurrence' + (n !== 1 ? 's' : '');

    elEditor.classList.add('rn-active');
    renderHighlights(word);
    elWidget.classList.remove('hidden');
    requestAnimationFrame(() => { elInput.select(); elInput.focus(); });
  }

  function close() {
    active = false;
    elEditor.classList.remove('rn-active');
    elRnHl.innerHTML = '';
    elWidget.classList.add('hidden');
    elEditor.focus();
  }

  // ── Apply ─────────────────────────────────────────────────
  async function apply() {
    const newText = elInput.value;
    if (!newText || newText === searchText) { close(); return; }

    const updated = elEditor.value.split(searchText).join(newText);
    window.sane.history?.push();
    elEditor.value = updated;
    elEditor.dispatchEvent(new Event('input'));
    state.content = updated;
    state.dirty   = false;
    close();
    await saveFile();
    const label = searchText.length > 20 ? searchText.slice(0, 20) + '…' : searchText;
    setStatus('Renamed "' + label + '" → "' + newText + '"', 'ok');
  }

  // ── Update count preview as user types ────────────────────
  elInput.addEventListener('input', () => {
    const n   = countOccurrences(elEditor.value, searchText);
    const nw  = elInput.value;
    elCount.textContent = n + ' occurrence' + (n !== 1 ? 's' : '') +
      (nw && nw !== searchText ? ' → "' + nw + '"' : '');
  });

  elConfirm.addEventListener('click', apply);
  elCancel.addEventListener('click', close);

  elInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); apply(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'F2') {
      e.preventDefault();
      active ? close() : open();
    }
    if (e.key === 'Escape' && active) close();
  });
})();
