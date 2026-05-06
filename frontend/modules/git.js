// ── Git Integration ───────────────────────────────────────
// Status badges in tree, quick diff overlay, commit modal
// Ctrl+Shift+G → commit modal

(function () {

  let isRepo     = false;
  let statusMap  = new Map(); // relPath → 'M'|'A'|'U'

  // ── Repo detection ────────────────────────────────────────
  async function checkRepo() {
    if (!state.folder) { isRepo = false; return; }
    try {
      const res  = await apiFetch('/git/is-repo?path=' + encodeURIComponent(state.folder));
      const data = await res.json();
      isRepo = !!data.is_repo;
    } catch { isRepo = false; }
  }

  // ── Status fetch + badge update ───────────────────────────
  async function fetchStatus() {
    if (!state.folder || !isRepo) { statusMap.clear(); updateBadges(); return; }
    try {
      const res     = await apiFetch('/git/status?path=' + encodeURIComponent(state.folder));
      const entries = await res.json();
      statusMap.clear();
      for (const e of entries) statusMap.set(e.file.replace(/\\/g, '/'), e.status);
      updateBadges();
    } catch {}
  }

  function updateBadges() {
    document.querySelectorAll('.tree-item').forEach(row => {
      row.querySelectorAll('.git-badge').forEach(b => b.remove());
      if (!isRepo) return;

      const absPath = row.dataset.path || '';
      const rel     = absPath.replace(/\\/g, '/').slice(
        (state.folder || '').replace(/\\/g, '/').replace(/\/$/, '').length + 1
      );
      const status = statusMap.get(rel);
      if (!status) return;

      const badge = document.createElement('span');
      badge.className = 'git-badge git-badge-' + status;
      badge.textContent = status;
      row.appendChild(badge);
    });
  }

  // ── Diff overlay ──────────────────────────────────────────
  const elDiffOverlay = document.getElementById('git-diff-overlay');
  const elDiffTitle   = document.getElementById('git-diff-title');
  const elDiffBody    = document.getElementById('git-diff-body');
  const elDiffClose   = document.getElementById('git-diff-close');

  async function showDiff(filePath) {
    if (!state.folder || !isRepo) return;
    const rel = filePath.replace(/\\/g, '/').slice(
      state.folder.replace(/\\/g, '/').replace(/\/$/, '').length + 1
    );

    elDiffTitle.textContent = rel;
    elDiffBody.innerHTML    = '<div class="git-diff-loading">Loading…</div>';
    elDiffOverlay.classList.remove('hidden');

    try {
      const res  = await apiFetch(
        '/git/diff?path=' + encodeURIComponent(state.folder) +
        '&file=' + encodeURIComponent(rel)
      );
      const text = await res.text();
      renderDiff(text);
    } catch (err) {
      elDiffBody.innerHTML = '<div class="git-diff-err">Error: ' + err.message + '</div>';
    }
  }

  function renderDiff(text) {
    if (!text.trim()) {
      elDiffBody.innerHTML = '<div class="git-diff-empty">No changes</div>';
      return;
    }
    const lines = text.split('\n');
    elDiffBody.innerHTML = '';
    for (const line of lines) {
      const el = document.createElement('div');
      el.className = 'git-diff-line';
      if      (line.startsWith('+') && !line.startsWith('+++')) el.classList.add('git-diff-add');
      else if (line.startsWith('-') && !line.startsWith('---')) el.classList.add('git-diff-del');
      else if (line.startsWith('@@'))                           el.classList.add('git-diff-hunk');
      else if (line.startsWith('diff ') || line.startsWith('index ') ||
               line.startsWith('---')   || line.startsWith('+++'))
        el.classList.add('git-diff-meta');
      el.textContent = line;
      elDiffBody.appendChild(el);
    }
  }

  function closeDiff() { elDiffOverlay.classList.add('hidden'); }

  elDiffClose?.addEventListener('click', closeDiff);
  elDiffOverlay?.addEventListener('mousedown', e => { if (e.target === elDiffOverlay) closeDiff(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !elDiffOverlay.classList.contains('hidden')) closeDiff();
  });

  // ── Commit modal ──────────────────────────────────────────
  const elCommitOverlay = document.getElementById('git-commit-overlay');
  const elCommitInput   = document.getElementById('git-commit-msg');
  const elCommitBtn     = document.getElementById('git-commit-btn');
  const elCommitStatus  = document.getElementById('git-commit-status');
  const elCommitClose   = document.getElementById('git-commit-close');

  function openCommit() {
    if (!isRepo) return;
    elCommitInput.value   = '';
    elCommitStatus.textContent = '';
    elCommitStatus.className   = '';
    elCommitOverlay.classList.remove('hidden');
    setTimeout(() => elCommitInput.focus(), 50);
  }

  function closeCommit() { elCommitOverlay.classList.add('hidden'); }

  async function doCommit() {
    const msg = elCommitInput.value.trim();
    if (!msg) { elCommitInput.focus(); return; }

    elCommitBtn.disabled = true;
    elCommitStatus.textContent = 'Committing…';
    elCommitStatus.className   = '';

    try {
      await apiFetch('/git/commit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ path: state.folder, message: msg }),
      });
      elCommitStatus.textContent = '✓ Commit created';
      elCommitStatus.className   = 'git-commit-ok';
      elCommitInput.value = '';
      statusMap.clear();
      updateBadges();
      setTimeout(closeCommit, 1200);
    } catch (err) {
      elCommitStatus.textContent = '✗ ' + err.message;
      elCommitStatus.className   = 'git-commit-err';
    } finally {
      elCommitBtn.disabled = false;
    }
  }

  elCommitBtn?.addEventListener('click', doCommit);
  elCommitClose?.addEventListener('click', closeCommit);
  elCommitInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doCommit(); }
    if (e.key === 'Escape') closeCommit();
  });
  elCommitOverlay?.addEventListener('mousedown', e => { if (e.target === elCommitOverlay) closeCommit(); });

  // ── Context menu: View Diff ───────────────────────────────
  const elDiffItem = document.getElementById('fo-diff');
  elDiffItem?.addEventListener('click', () => {
    window.sane.hideCtxMenu?.();
    const path = window.sane.getCtxPath?.();
    if (path) showDiff(path);
  });

  // ── Keyboard shortcut: Ctrl+Shift+G → commit ─────────────
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
      e.preventDefault();
      if (!elCommitOverlay.classList.contains('hidden')) closeCommit();
      else openCommit();
    }
  });

  // ── Boot + periodic refresh ───────────────────────────────
  document.addEventListener('sane:folder-loaded', async () => {
    await checkRepo();
    await fetchStatus();
  });

  setInterval(async () => {
    if (!state.folder) return;
    await fetchStatus();
  }, 4000);

  // Expose for external use
  window.sane = window.sane || {};
  window.sane.gitOpenCommit = openCommit;
  window.sane.gitShowDiff   = showDiff;
  window.sane.gitIsRepo     = () => isRepo;

})();
