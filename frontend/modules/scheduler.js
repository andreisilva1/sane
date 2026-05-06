(function () {
  const elOverlay  = document.getElementById('sched-overlay');
  const elClose    = document.getElementById('sched-close');
  const elList     = document.getElementById('sched-list');
  const elCmdInput = document.getElementById('sched-cmd');
  const elLblInput = document.getElementById('sched-label');
  const elIntInput = document.getElementById('sched-interval');
  const elAddBtn   = document.getElementById('sched-add-btn');
  const elNotice   = document.getElementById('sched-notice');

  let jobs = [];
  let pollTimer = null;

  // ── Open / close ──────────────────────────────────────────
  async function open() {
    elOverlay.classList.remove('hidden');
    await loadJobs();
    pollTimer = setInterval(loadJobs, 3000);
  }

  function close() {
    elOverlay.classList.add('hidden');
    clearInterval(pollTimer);
  }

  elClose.addEventListener('click', close);
  elOverlay.addEventListener('mousedown', (e) => {
    if (e.target === elOverlay) close();
  });

  // ── Load jobs from backend ────────────────────────────────
  async function loadJobs() {
    try {
      const url = state.folder
        ? '/schedule/load?dir=' + encodeURIComponent(state.folder)
        : '/schedule/list';
      const res = await apiFetch(url);
      jobs = (await res.json()) || [];
      render();
    } catch {}
  }

  // ── Render job list ───────────────────────────────────────
  function render() {
    elList.innerHTML = '';
    if (!jobs.length) {
      elList.innerHTML = '<div class="sched-empty">No jobs yet. Add one below.</div>';
      return;
    }
    for (const job of jobs) {
      const row = document.createElement('div');
      row.className = 'sched-row';

      const info = document.createElement('div');
      info.className = 'sched-info';

      const label = document.createElement('span');
      label.className = 'sched-label';
      label.textContent = job.label;

      const meta = document.createElement('span');
      meta.className = 'sched-meta';
      const secs = job.intervalMs / 1000;
      meta.textContent = `every ${secs >= 60 ? (secs / 60).toFixed(0) + 'm' : secs + 's'}`;
      if (job.lastRun) meta.textContent += ` · last: ${job.lastRun}`;

      info.append(label, meta);

      const controls = document.createElement('div');
      controls.className = 'sched-controls';

      const toggle = document.createElement('button');
      toggle.className = 'sched-toggle' + (job.running ? ' sched-running' : '');
      toggle.textContent = job.running ? 'Stop' : 'Start';
      toggle.addEventListener('click', async () => {
        await apiFetch('/schedule/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ID: job.id }),
        });
        document.dispatchEvent(new CustomEvent('sane:activity', {
          detail: (job.running ? 'Stopped' : 'Started') + ' scheduler: ' + job.label,
        }));
        await loadJobs();
      });

      const del = document.createElement('button');
      del.className = 'sched-del';
      del.textContent = '×';
      del.title = 'Delete job';
      del.addEventListener('click', async () => {
        await apiFetch('/schedule/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ID: job.id }),
        });
        await loadJobs();
      });

      controls.append(toggle, del);
      row.append(info, controls);
      elList.appendChild(row);
    }
  }

  // ── Add job ───────────────────────────────────────────────
  elAddBtn.addEventListener('click', addJob);
  elCmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addJob(); });

  async function addJob() {
    const cmd = elCmdInput.value.trim();
    if (!cmd) return;
    const intervalMs = Math.max(1000, (parseFloat(elIntInput.value) || 5) * 60 * 1000);
    await apiFetch('/schedule/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label:      elLblInput.value.trim() || cmd,
        cmd,
        dir:        state.folder || '',
        intervalMs,
      }),
    });
    if (state.folder) {
      await apiFetch('/schedule/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Dir: state.folder }),
      });
    }
    elCmdInput.value = '';
    elLblInput.value = '';
    elIntInput.value = '';
    await loadJobs();
  }

  // ── Expose ────────────────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.openScheduler = open;
})();
