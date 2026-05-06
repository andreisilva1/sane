(function () {
  const elPanel    = document.getElementById('hc-panel');
  const elClose    = document.getElementById('hc-close');
  const elMethod   = document.getElementById('hc-method');
  const elURL      = document.getElementById('hc-url');
  const elSend     = document.getElementById('hc-send');
  const elHeaders  = document.getElementById('hc-headers');
  const elBody     = document.getElementById('hc-body');
  const elStatus   = document.getElementById('hc-res-status');
  const elDuration = document.getElementById('hc-res-duration');
  const elResBody  = document.getElementById('hc-res-body');

  let loading = false;

  // ── Open / close ──────────────────────────────────────────
  function open()  { elPanel.classList.remove('hidden'); elURL.focus(); }
  function close() { elPanel.classList.add('hidden'); }

  elClose.addEventListener('click', close);
  elPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // ── Send request ──────────────────────────────────────────
  async function send() {
    const url = elURL.value.trim();
    if (!url || loading) return;

    // Parse headers (one per line: Key: Value)
    const headers = {};
    for (const line of elHeaders.value.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }

    loading = true;
    elSend.disabled = true;
    elSend.textContent = '…';
    elStatus.textContent = '';
    elResBody.textContent = '';
    elDuration.textContent = '';

    try {
      const res = await fetch(API + '/http-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method:  elMethod.value,
          url,
          headers,
          body: elBody.value,
        }),
      });
      const data = await res.json();

      if (data.error) {
        elStatus.textContent = 'Error';
        elStatus.className = 'hc-err';
        elResBody.textContent = data.error;
      } else {
        const code = data.status;
        elStatus.textContent = code;
        elStatus.className = code < 300 ? 'hc-ok' : code < 500 ? 'hc-warn' : 'hc-err';
        elDuration.textContent = data.durationMs + 'ms';

        // Pretty-print if JSON
        let body = data.body || '';
        try { body = JSON.stringify(JSON.parse(body), null, 2); } catch {}
        elResBody.textContent = body;

        document.dispatchEvent(new CustomEvent('sane:activity',
          { detail: `HTTP ${elMethod.value} ${url} → ${code} (${data.durationMs}ms)` }));
      }
    } catch (err) {
      elStatus.textContent = 'Error';
      elStatus.className = 'hc-err';
      elResBody.textContent = err.message;
    } finally {
      loading = false;
      elSend.disabled = false;
      elSend.textContent = 'Send';
    }
  }

  elSend.addEventListener('click', send);
  elURL.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); send(); }
  });

  // ── Show/hide body field based on method ──────────────────
  elMethod.addEventListener('change', () => {
    const needsBody = ['POST', 'PUT', 'PATCH'].includes(elMethod.value);
    elBody.closest('.hc-field').classList.toggle('hidden', !needsBody);
  });

  // ── Ctrl+Shift+H toggle ───────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
      e.preventDefault();
      elPanel.classList.contains('hidden') ? open() : close();
    }
  });

  // ── Expose ────────────────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.openHTTPClient = open;
})();
