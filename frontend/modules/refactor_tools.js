// ── Refactor Tools (refactor_tools_v1) ────────────────────
// Ctrl+Shift+E → Extract Function (requires selection)
// Ctrl+Shift+L → Inline Variable (cursor on assignment line)
// Depends on: state, setStatus, saveFile

(function () {
  const elEditor = document.getElementById('editor');

  // ── Extract Function widget ───────────────────────────────
  const elWidget  = document.getElementById('ef-widget');
  const elEfName  = document.getElementById('ef-name');
  const elEfParam = document.getElementById('ef-param');
  const elEfApply = document.getElementById('ef-apply');
  const elEfCancel= document.getElementById('ef-cancel');
  const elEfStatus= document.getElementById('ef-status');

  let savedSel = null; // { start, end, text }

  function openExtract() {
    if (!state.filePath) { setStatus('Open a file first', 'err'); return; }
    const start = elEditor.selectionStart;
    const end   = elEditor.selectionEnd;
    if (start === end) { setStatus('Select code to extract', 'err'); return; }

    savedSel = { start, end, text: elEditor.value.slice(start, end) };
    elEfName.value   = '';
    elEfParam.value  = '';
    elEfStatus.textContent = '';
    elWidget.classList.remove('hidden');
    elEfName.focus();
  }

  function closeExtract() {
    elWidget.classList.add('hidden');
    savedSel = null;
  }

  async function applyExtract() {
    const fnName = elEfName.value.trim();
    if (!fnName) { elEfStatus.textContent = 'Enter a function name'; return; }
    if (!/^[A-Za-z_]\w*$/.test(fnName)) { elEfStatus.textContent = 'Invalid function name'; return; }
    if (!savedSel) { closeExtract(); return; }

    const params   = elEfParam.value.trim();
    const callArgs = params; // same for the call site
    const body     = savedSel.text;
    const code     = elEditor.value;

    // Detect base indentation of selection (first non-empty line)
    const firstLine = body.split('\n').find(l => l.trim()) || '';
    const bodyIndent = firstLine.match(/^(\s*)/)[1];

    // Dedent body relative to its current indent, re-indent with 4 spaces
    const lines = body.split('\n');
    const dedented = lines.map(l => {
      if (l.startsWith(bodyIndent)) return '    ' + l.slice(bodyIndent.length);
      return '    ' + l.trim();
    }).join('\n');

    const fnDef = `def ${fnName}(${params}):\n${dedented}\n`;

    // Find insertion point: last `def ` line at or before the selection start
    const before     = code.slice(0, savedSel.start);
    const defMatches = [...before.matchAll(/^def\s/gm)];
    let insertAt;
    if (defMatches.length > 0) {
      const lastDef = defMatches[defMatches.length - 1];
      insertAt = lastDef.index;
    } else {
      insertAt = 0;
    }

    // Build new code:
    // 1. Insert fnDef before insertAt
    // 2. Replace selection with call (using same indent as first selected line)
    const callLine   = `${bodyIndent}${fnName}(${callArgs})`;
    const withCall   = code.slice(0, savedSel.start) + callLine + code.slice(savedSel.end);
    // Adjust insertAt if it's within the replaced range (it shouldn't be)
    const finalCode  = withCall.slice(0, insertAt) + fnDef + '\n' + withCall.slice(insertAt);

    window.sane.history?.push();
    elEditor.value = finalCode;
    elEditor.dispatchEvent(new Event('input'));
    state.content = finalCode;
    await saveFile();

    setStatus(`Extracted: ${fnName}()`, 'ok');
    closeExtract();
  }

  elEfApply.addEventListener('click', applyExtract);
  elEfCancel.addEventListener('click', closeExtract);

  elEfName.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); elEfParam.focus(); }
    if (e.key === 'Escape') closeExtract();
  });
  elEfParam.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyExtract(); }
    if (e.key === 'Escape') closeExtract();
  });

  // ── Inline Variable ───────────────────────────────────────
  async function inlineVariable() {
    if (!state.filePath) { setStatus('Open a file first', 'err'); return; }
    const code    = elEditor.value;
    const pos     = elEditor.selectionStart;
    const lineStart = code.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd   = code.indexOf('\n', pos);
    const line      = code.slice(lineStart, lineEnd === -1 ? code.length : lineEnd);

    // Match: optional indent, identifier, =, value (not ==, +=, etc.)
    const m = line.match(/^(\s*)([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/);
    if (!m) { setStatus('Place cursor on a variable assignment', 'err'); return; }

    const [, , varName, value] = m;
    const trimmedVal = value.trimEnd();

    // Replace all standalone occurrences of varName (not the assignment line itself)
    // Split by lines, skip the assignment line, replace \bvarName\b
    const allLines = code.split('\n');
    let assignIdx  = -1;
    let count      = 0;

    // Find which line index the assignment is on
    let charCount = 0;
    for (let i = 0; i < allLines.length; i++) {
      if (charCount === lineStart) { assignIdx = i; break; }
      charCount += allLines[i].length + 1;
    }

    const re = new RegExp(`\\b${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

    const newLines = allLines.map((l, i) => {
      if (i === assignIdx) return null; // will be removed
      const replaced = l.replace(re, trimmedVal);
      if (replaced !== l) count += (l.match(re) || []).length;
      return replaced;
    }).filter(l => l !== null);

    if (count === 0) { setStatus(`No uses of '${varName}' found`, ''); return; }

    const newCode = newLines.join('\n');
    window.sane.history?.push();
    elEditor.value = newCode;
    elEditor.dispatchEvent(new Event('input'));
    state.content = newCode;
    await saveFile();
    setStatus(`Inlined '${varName}' — ${count} replacement${count === 1 ? '' : 's'}`, 'ok');
  }

  // ── Keyboard shortcuts ────────────────────────────────────
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      openExtract();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
      e.preventDefault();
      inlineVariable();
    }
    if (e.key === 'Escape' && !elWidget.classList.contains('hidden')) {
      closeExtract();
    }
  });
})();
