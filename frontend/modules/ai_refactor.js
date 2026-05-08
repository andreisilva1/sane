// ── AI Refactor (ai_refactor_v1) ──────────────────────────
// Ctrl+Shift+I → describe refactor → diff preview → apply & save
// Depends on: state, apiFetch, setStatus, saveFile, window.sane.activeModel

(function () {
  const elOverlay  = document.getElementById('arf-overlay');
  const elClose    = document.getElementById('arf-close');
  const elFilename = document.getElementById('arf-filename');
  const elInput    = document.getElementById('arf-input');
  const elRunBtn   = document.getElementById('arf-run-btn');
  const elApplyBtn = document.getElementById('arf-apply-btn');
  const elStatus   = document.getElementById('arf-status');
  const elDiff     = document.getElementById('arf-diff');

  let pendingCode = null;
  let abortCtrl   = null;

  // ── Open / close ──────────────────────────────────────────
  function open() {
    if (!state.filePath) { setStatus('Open a file first', 'err'); return; }
    reset();
    elFilename.textContent = state.filePath.split(/[/\\]/).pop();
    elOverlay.classList.remove('hidden');
    elInput.focus();
  }

  function close() {
    if (abortCtrl) abortCtrl.abort();
    elOverlay.classList.add('hidden');
  }

  function reset() {
    elInput.value = '';
    elDiff.innerHTML = '';
    elApplyBtn.classList.add('hidden');
    elStatus.textContent = '';
    elRunBtn.disabled = false;
    elRunBtn.textContent = 'Refactor';
    pendingCode = null;
  }

  // ── Line diff (LCS-based) ─────────────────────────────────
  function diffLines(oldLines, newLines) {
    const m = oldLines.length;
    const n = newLines.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = oldLines[i-1] === newLines[j-1]
          ? dp[i-1][j-1] + 1
          : Math.max(dp[i-1][j], dp[i][j-1]);

    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i-1] === newLines[j-1]) {
        result.push({ type: 'eq', text: oldLines[i-1] }); i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        result.push({ type: 'add', text: newLines[j-1] }); j--;
      } else {
        result.push({ type: 'del', text: oldLines[i-1] }); i--;
      }
    }
    return result.reverse();
  }

  function renderDiff(original, proposed) {
    const diff = diffLines(original.split('\n'), proposed.split('\n'));
    const CONTEXT = 3;
    const changed = new Set(diff.reduce((acc, d, i) => { if (d.type !== 'eq') acc.push(i); return acc; }, []));
    const visible  = new Set();
    changed.forEach(i => {
      for (let k = Math.max(0, i - CONTEXT); k <= Math.min(diff.length - 1, i + CONTEXT); k++) visible.add(k);
    });

    elDiff.innerHTML = '';

    if (changed.size === 0) {
      const el = document.createElement('div');
      el.className = 'arf-diff-empty';
      el.textContent = 'No changes detected.';
      elDiff.appendChild(el);
      return;
    }

    let prev = -1;
    diff.forEach((d, i) => {
      if (!visible.has(i)) return;
      if (prev !== -1 && i > prev + 1) {
        const sep = document.createElement('div');
        sep.className = 'arf-diff-sep';
        sep.textContent = '···';
        elDiff.appendChild(sep);
      }
      prev = i;
      const row = document.createElement('div');
      row.className = 'arf-diff-row arf-' + d.type;
      row.textContent = (d.type === 'add' ? '+ ' : d.type === 'del' ? '- ' : '  ') + d.text;
      elDiff.appendChild(row);
    });
  }

  // ── Run refactor — delegates to AI pipeline with FILE_EDIT intent ──
  async function run() {
    const task = elInput.value.trim();
    if (!task || !state.content) return;

    elRunBtn.disabled = true;
    elRunBtn.textContent = 'Analyzing…';
    elDiff.innerHTML = '';
    elApplyBtn.classList.add('hidden');
    elStatus.textContent = 'Sending to AI…';
    pendingCode = null;

    try {
      if (!window.sane.activeModel) {
        elStatus.textContent = 'No model — set up AI first';
        return;
      }

      abortCtrl = new AbortController();
      const { execute } = await window.sane.aiPipeline.process(task, {
        forceIntent: window.sane.INTENT.FILE_EDIT,
      });

      let full = '';
      await new Promise(resolve => {
        execute(
          token => { full += token; },
          ()    => resolve(),
          err   => { if (err) elStatus.textContent = 'Error: ' + err; resolve(); },
          abortCtrl.signal,
        );
      });

      if (!full) return;
      const match = full.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (match) {
        pendingCode = match[1];
        renderDiff(state.content, pendingCode);
        elStatus.textContent = 'Review changes below:';
        elApplyBtn.classList.remove('hidden');
      } else {
        elStatus.textContent = 'No code block returned — try rephrasing.';
      }
    } catch (err) {
      if (err.name !== 'AbortError') elStatus.textContent = 'Error: ' + err.message;
    } finally {
      elRunBtn.disabled = false;
      elRunBtn.textContent = 'Re-run';
      abortCtrl = null;
    }
  }

  // ── Apply ─────────────────────────────────────────────────
  async function apply() {
    if (!pendingCode) return;
    const elEditor = document.getElementById('editor');
    window.sane.history?.push();
    elEditor.value = pendingCode;
    elEditor.dispatchEvent(new Event('input'));
    state.content = pendingCode;
    state.dirty   = false;
    await saveFile();
    setStatus('Refactor applied and saved', 'ok');
    close();
  }

  // ── Events ────────────────────────────────────────────────
  elRunBtn.addEventListener('click', run);
  elApplyBtn.addEventListener('click', apply);
  elClose.addEventListener('click', close);

  elOverlay.addEventListener('mousedown', e => { if (e.target === elOverlay) close(); });

  elInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    if (e.key === 'Escape') close();
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      elOverlay.classList.contains('hidden') ? open() : close();
    }
  });
})();
