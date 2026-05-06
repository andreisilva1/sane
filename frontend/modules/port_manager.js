(function () {
  const elBar     = document.getElementById('pm-bar');
  const elText    = document.getElementById('pm-text');
  const elKill    = document.getElementById('pm-kill');
  const elDismiss = document.getElementById('pm-dismiss');

  let pendingPID = null;

  function hide() {
    elBar.classList.add('hidden');
    pendingPID = null;
  }

  function show(owner) {
    pendingPID = owner.pid;
    elText.textContent =
      `Port ${owner.port} in use by ${owner.name} (PID ${owner.pid})`;
    elBar.classList.remove('hidden');
  }

  // ── Kill ──────────────────────────────────────────────────
  elKill.addEventListener('click', async () => {
    if (!pendingPID) return;
    const pid  = pendingPID;
    const text = elText.textContent;
    hide();
    try {
      await fetch(API + '/port/kill', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ PID: pid }),
      });
      setStatus('Process killed (PID ' + pid + ')', 'ok');
      document.dispatchEvent(new CustomEvent('sane:activity',
        { detail: 'Process killed — ' + text }));
    } catch (err) {
      setStatus('Kill failed: ' + err.message, 'err');
    }
  });

  elDismiss.addEventListener('click', hide);

  // ── Detect port conflict in stderr ────────────────────────
  function extractPort(stderr) {
    // "address already in use :8080", "EADDRINUSE :::3000", "bind: address already in use"
    const m = stderr.match(/(?:EADDRINUSE|address already in use)[^\d]*:?(\d{2,5})/i);
    return m ? parseInt(m[1], 10) : null;
  }

  document.addEventListener('sane:runend', async (e) => {
    const { stderr = '', exitCode } = e.detail;
    if (exitCode === 0) return;
    hide();

    const port = extractPort(stderr);
    if (!port) return;

    try {
      const res = await fetch(API + '/port/owner?port=' + port);
      if (!res.ok) return;
      const owner = await res.json();
      show(owner);
    } catch {}
  });

  document.addEventListener('sane:runstart', hide);
})();
