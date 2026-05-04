// ── Task Mode (feature_reintroduction_task_mode_v1) ───────
// Depends on: state, apiFetch, setStatus, window.sane.onFileOpen
// Ctrl+Shift+T → describe a task → AI plans → user confirms → AI applies

(function () {
  const elOverlay  = document.getElementById('tm-overlay');
  const elClose    = document.getElementById('tm-close');
  const elFilename = document.getElementById('tm-filename');
  const elTask     = document.getElementById('tm-task');
  const elPlanBtn  = document.getElementById('tm-plan-btn');
  const elPlanBox  = document.getElementById('tm-plan-box');
  const elPlanText = document.getElementById('tm-plan-text');
  const elApplyBtn = document.getElementById('tm-apply-btn');
  const elStatus   = document.getElementById('tm-status');

  let pendingCode = null;
  let abortCtrl   = null;

  // ── Open / close ──────────────────────────────────────────
  function open() {
    if (!state.filePath) { setStatus('Open a file first', 'err'); return; }
    reset();
    elFilename.textContent = state.filePath.split(/[/\\]/).pop();
    elOverlay.classList.remove('hidden');
    elTask.focus();
  }

  function close() {
    if (abortCtrl) abortCtrl.abort();
    elOverlay.classList.add('hidden');
  }

  function reset() {
    elTask.value    = '';
    elPlanText.textContent = '';
    elPlanBox.classList.add('hidden');
    elApplyBtn.classList.add('hidden');
    elStatus.textContent = '';
    elPlanBtn.disabled = false;
    elPlanBtn.textContent = 'Plan';
    pendingCode = null;
  }

  // ── Stream helper ─────────────────────────────────────────
  async function streamAsk(prompt, onChunk) {
    const model = getModel();
    if (!model) { elStatus.textContent = 'No model — open AI Panel first'; return null; }

    abortCtrl = new AbortController();
    const res = await fetch('http://localhost:7654/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt }),
      signal: abortCtrl.signal,
    });

    if (!res.ok) throw new Error(await res.text());

    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let   buf    = '';
    let   full   = '';
    let   streamDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const raw of lines) {
        if (!raw.startsWith('data: ')) continue;
        let evt;
        try { evt = JSON.parse(raw.slice(6)); } catch { continue; }
        if (evt.response) { full += evt.response; onChunk(evt.response); }
        if (evt.done) { streamDone = true; break; }
      }
      if (streamDone) break;
    }
    return full;
  }

  function getModel() {
    return window.sane?.activeModel || null;
  }

  // ── Pass 1: Plan ──────────────────────────────────────────
  async function plan() {
    const task = elTask.value.trim();
    if (!task) return;
    if (!state.content) { elStatus.textContent = 'File is empty'; return; }

    elPlanBtn.disabled = true;
    elPlanBtn.textContent = 'Planning…';
    elPlanBox.classList.remove('hidden');
    elPlanText.textContent = '';
    elApplyBtn.classList.add('hidden');
    elStatus.textContent = '';
    pendingCode = null;

    const fname = state.filePath.split(/[/\\]/).pop();
    const prompt =
      `You are a Python code assistant. The user wants to modify a file.\n\n` +
      `File: ${fname}\n\`\`\`python\n${state.content}\n\`\`\`\n\n` +
      `Task: ${task}\n\n` +
      `First, briefly list the changes you will make (2-5 bullet points). ` +
      `Then output the complete modified file inside a single \`\`\`python block. ` +
      `Output nothing after the closing \`\`\`.`;

    try {
      const full = await streamAsk(prompt, (chunk) => {
        elPlanText.textContent += chunk;
        elPlanBox.scrollTop = elPlanBox.scrollHeight;
      });

      if (full) {
        pendingCode = extractCode(full);
        if (pendingCode) {
          elApplyBtn.classList.remove('hidden');
          elStatus.textContent = 'Review the plan above, then apply.';
        } else {
          elStatus.textContent = 'AI did not return a code block. Try rephrasing.';
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        elStatus.textContent = 'Error: ' + err.message;
      }
    } finally {
      elPlanBtn.disabled = false;
      elPlanBtn.textContent = 'Re-plan';
      abortCtrl = null;
    }
  }

  // ── Pass 2: Apply ─────────────────────────────────────────
  function apply() {
    if (!pendingCode) return;
    const elEditor = document.getElementById('editor');
    window.sane.history?.push();
    elEditor.value = pendingCode;
    elEditor.dispatchEvent(new Event('input'));
    state.content = pendingCode;
    state.dirty   = true;
    document.getElementById('btn-save').disabled = false;
    const fname = state.filePath.split(/[/\\]/).pop();
    document.getElementById('current-file').textContent = fname + ' ●';
    setStatus('Task applied — review and save', 'ok');
    close();
  }

  // ── Extract code block ────────────────────────────────────
  function extractCode(text) {
    const match = text.match(/```(?:python)?\n([\s\S]*?)```/);
    return match ? match[1] : null;
  }

  // ── Events ────────────────────────────────────────────────
  elPlanBtn.addEventListener('click', plan);
  elApplyBtn.addEventListener('click', apply);
  elClose.addEventListener('click', close);

  elOverlay.addEventListener('mousedown', (e) => {
    if (e.target === elOverlay) close();
  });

  elTask.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); plan(); }
    if (e.key === 'Escape') close();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      elOverlay.classList.contains('hidden') ? open() : close();
    }
  });
})();
