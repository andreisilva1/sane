// ── Editor History — Undo / Redo (editor_history_v1) ──────
// Ctrl+Z → undo, Ctrl+Y → redo
// Custom stack because programmatic value= clears the native one.
// Depends on: state

(function () {
  const elEditor = document.getElementById('editor');
  const MAX      = 100;

  let stack      = [];   // [{content, selStart, selEnd, filePath}]
  let ptr        = -1;
  let debTimer   = null;
  let ignoreNext = false;

  // ── Snapshot helpers ──────────────────────────────────────
  function snap() {
    return {
      content:  elEditor.value,
      selStart: elEditor.selectionStart,
      selEnd:   elEditor.selectionEnd,
      filePath: state.filePath,
    };
  }

  function resetFor(filePath) {
    clearTimeout(debTimer);
    stack = [{ content: elEditor.value, selStart: 0, selEnd: 0, filePath }];
    ptr   = 0;
  }

  // ── Push a snapshot ───────────────────────────────────────
  function push() {
    const s = snap();
    // Reset stack when file changes
    if (ptr >= 0 && stack[ptr].filePath !== s.filePath) {
      resetFor(s.filePath);
      return;
    }
    // Skip if content identical to current head
    if (ptr >= 0 && stack[ptr].content === s.content) return;
    // Drop any redo entries ahead of ptr
    stack.length = ptr + 1;
    stack.push(s);
    ptr = stack.length - 1;
    if (stack.length > MAX) { stack.shift(); /* ptr stays at length-1 */ }
  }

  // ── Restore a snapshot ────────────────────────────────────
  function restore(s) {
    ignoreNext = true;
    elEditor.value          = s.content;
    elEditor.selectionStart = s.selStart;
    elEditor.selectionEnd   = s.selEnd;
    elEditor.dispatchEvent(new Event('input'));
    state.content = s.content;
  }

  // ── Undo / redo ───────────────────────────────────────────
  function undo() {
    if (ptr <= 0) return;
    clearTimeout(debTimer);
    push();           // save any unsaved debounced typing first
    if (ptr <= 0) return;
    ptr--;
    restore(stack[ptr]);
  }

  function redo() {
    if (ptr >= stack.length - 1) return;
    clearTimeout(debTimer);
    ptr++;
    restore(stack[ptr]);
  }

  // ── Listen for user input (debounced) ─────────────────────
  elEditor.addEventListener('input', () => {
    if (ignoreNext) { ignoreNext = false; return; }
    // Reset stack on file switch (main.js sets value without firing input,
    // but modules that load files may trigger it)
    if (ptr >= 0 && stack[ptr].filePath !== state.filePath) {
      resetFor(state.filePath);
      return;
    }
    clearTimeout(debTimer);
    debTimer = setTimeout(push, 500);
  });

  // ── Keyboard shortcuts ────────────────────────────────────
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (mod && e.key === 'y')                { e.preventDefault(); redo(); }
  });

  // ── Expose globally ───────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.history = {
    push,           // call BEFORE programmatic editor mutations
    reset: resetFor,
  };

  // Seed with initial empty state
  stack = [snap()];
  ptr   = 0;
})();
