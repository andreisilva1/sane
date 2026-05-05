(function () {
  const elBar     = document.getElementById('ri-bar');
  const elLabel   = document.getElementById('ri-label');
  const elChevron = document.getElementById('ri-chevron');
  const elBody    = document.getElementById('ri-body');
  const elText    = document.getElementById('ri-text');

  let abortCtrl = null;

  document.addEventListener('sane:runend', async (e) => {
    if (window.sane?.aiSettings?.insight === false) return;
    const { stdout = '', stderr = '', exitCode, filePath } = e.detail;

    elBar.classList.add('hidden');
    elBody.classList.remove('ri-collapsed');
    elChevron.textContent = '▾';
    elText.textContent = '';

    const model = window.sane?.activeModel;
    if (!model || !filePath) return;

    const code   = document.getElementById('editor').value;
    const ext    = filePath.split('.').pop();
    const output = stdout.trim() + (stderr.trim() ? '\nSTDERR:\n' + stderr.trim() : '');

    const prompt =
      `You are a code behavior explainer. Given this ${ext} code and its output, write exactly 1 sentence (2 max) describing what the code actually did. ` +
      `Be specific: reference actual values from the output. Use plain English. No technical jargon unless unavoidable. Start with "This code".\n\n` +
      `Code:\n\`\`\`\n${code.slice(0, 2000)}\n\`\`\`\n\n` +
      `Output:\n${output.slice(0, 1000) || '(no output)'}\n` +
      `Exit code: ${exitCode}\n\n` +
      `Reply with only the explanation. Nothing else.`;

    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    elBar.classList.remove('hidden');
    elText.textContent = '…';

    try {
      const res = await fetch('http://localhost:7654/ai/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, prompt }),
        signal:  abortCtrl.signal,
      });

      if (!res.ok) { elBar.classList.add('hidden'); return; }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';
      let   full   = '';

      elText.textContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const raw of lines) {
          if (!raw.startsWith('data: ')) continue;
          const payload = raw.slice(6).trim();
          if (!payload) continue;
          let evt;
          try { evt = JSON.parse(payload); } catch { continue; }
          if (evt.response) { full += evt.response; elText.textContent = full; }
          if (evt.done) break;
        }
      }

      if (!full) elBar.classList.add('hidden');
    } catch (err) {
      if (err.name !== 'AbortError') elBar.classList.add('hidden');
    } finally {
      abortCtrl = null;
    }
  });

  elLabel.addEventListener('click', () => {
    const collapsed = elBody.classList.toggle('ri-collapsed');
    elChevron.textContent = collapsed ? '▸' : '▾';
  });
})();
