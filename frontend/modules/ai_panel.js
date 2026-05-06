(function () {
  const elPanel    = document.getElementById('ai-panel');
  const elClose    = document.getElementById('ai-close');
  const elTierBtn  = document.getElementById('ai-tier-btn');
  const elTierMenu = document.getElementById('ai-tier-menu');
  const elMessages = document.getElementById('ai-messages');
  const elInput    = document.getElementById('ai-input');
  const elSend     = document.getElementById('ai-send');
  const elCtx      = document.getElementById('ai-ctx');
  const elStatus   = document.getElementById('ai-status');
  const elPBToggle = document.getElementById('ai-pb-toggle');

  const TIERS = [
    { id: 'fast',     label: 'Fast',     model: 'qwen2.5-coder',     icon: '⚡' },
    { id: 'balanced', label: 'Balanced', model: 'deepseek-coder-v2', icon: '⚖️' },
    { id: 'advanced', label: 'Advanced', model: 'qwen2.5-coder:32b', icon: '🧠' },
  ];
  const STORAGE_KEY = 'sane_active_tier';

  let activeTierId = localStorage.getItem(STORAGE_KEY) || null;
  let streaming    = false;
  let abortCtrl    = null;
  let pbMode       = false;
  let pbLocked     = false;

  // ── Chat history persistence ──────────────────────────────
  const CHAT_KEY    = 'sane_chat_history';
  let _savePaused   = false;

  // ── Shared model accessor (used by task_mode.js) ──────────
  function getActiveTier() { return TIERS.find(t => t.id === activeTierId) || null; }
  function getModel()      { return getActiveTier()?.model || null; }

  window.sane = window.sane || {};
  Object.defineProperty(window.sane, 'activeModel', { get: getModel, configurable: true });

  // ── Tier button ───────────────────────────────────────────
  const elNoModel    = document.getElementById('ai-no-model');
  const elInputRow   = document.getElementById('ai-input-row');
  const elNoModelBtn = document.getElementById('ai-no-model-btn');

  if (elNoModelBtn) elNoModelBtn.addEventListener('click', () => window.sane.openAISetup?.());

  function renderTierBtn() {
    const tier = getActiveTier();
    elTierBtn.textContent = tier ? (tier.icon + ' ' + tier.label) : 'Set up AI';
    elTierBtn.classList.toggle('ai-tier-live', !!tier);
    elSend.disabled = !tier;
    if (elNoModel)  elNoModel.classList.toggle('hidden', !!tier);
    if (elInputRow) elInputRow.classList.toggle('hidden', !tier);
  }

  // ── Tier menu ─────────────────────────────────────────────
  async function openTierMenu() {
    elTierMenu.innerHTML = '<div class="ai-tier-loading">Checking…</div>';
    elTierMenu.classList.remove('hidden');

    let installed = new Set();
    try {
      const res    = await apiFetch('/ai/models');
      const models = await res.json() || [];
      installed    = new Set(models.filter(m => m.installed).map(m => m.name));
    } catch {}

    elTierMenu.innerHTML = '';
    for (const tier of TIERS) {
      const isInst   = installed.has(tier.model) || [...installed].some(m => m.startsWith(tier.model));
      const isActive = activeTierId === tier.id;
      const item     = document.createElement('div');
      item.className = 'ai-tier-item' + (isActive ? ' ai-tier-item-active' : '');
      item.innerHTML = `
        <span class="ai-tier-label">${tier.icon} ${tier.label}</span>
        <span class="ai-tier-status ${isActive ? 'ats-active' : isInst ? 'ats-ready' : 'ats-missing'}">
          ${isActive ? 'active' : isInst ? 'ready' : 'not installed'}
        </span>`;
      item.addEventListener('click', () => handleTierSwitch(tier, isInst));
      elTierMenu.appendChild(item);
    }
  }

  function closeTierMenu() { elTierMenu.classList.add('hidden'); }

  elTierBtn.addEventListener('click', () => {
    elTierMenu.classList.contains('hidden') ? openTierMenu() : closeTierMenu();
  });

  document.addEventListener('mousedown', (e) => {
    if (!elTierBtn.contains(e.target) && !elTierMenu.contains(e.target)) closeTierMenu();
  });

  // ── Tier switch ───────────────────────────────────────────
  function handleTierSwitch(tier, isInstalled) {
    closeTierMenu();
    if (tier.id === activeTierId) return;

    if (isInstalled) {
      activateTier(tier);
    } else {
      askDownload(tier);
    }
  }

  function activateTier(tier) {
    activeTierId = tier.id;
    localStorage.setItem(STORAGE_KEY, tier.id);
    renderTierBtn();

    if (elMessages.children.length > 0) {
      addSeparator('— Switched to ' + tier.label + ' —');
    }

    document.dispatchEvent(new CustomEvent('sane:model-activated', {
      detail: { model: tier.model, tier: tier.label, source: 'panel' }
    }));
  }

  function askDownload(tier) {
    const el = document.createElement('div');
    el.className = 'ai-separator ai-sep-prompt';
    el.innerHTML = `
      <span>${tier.icon} <strong>${tier.label}</strong> is not installed.</span>
      <div class="ai-sep-btns">
        <button class="ai-sep-yes">Download</button>
        <button class="ai-sep-no">Cancel</button>
      </div>`;
    el.querySelector('.ai-sep-yes').addEventListener('click', () => {
      el.remove();
      window.sane.openAISetup?.();
    });
    el.querySelector('.ai-sep-no').addEventListener('click', () => el.remove());
    elMessages.appendChild(el);
    elMessages.scrollTop = elMessages.scrollHeight;
  }

  // ── Project Builder mode ──────────────────────────────────
  function enterPBMode() {
    pbMode = true;
    elPBToggle.textContent = '← Chat';
    elPBToggle.classList.add('pb-active');
    elInput.placeholder = 'Describe your project… (Enter to generate)';
    addSeparator('── Project Builder ──');
  }

  function exitPBMode() {
    pbMode = false;
    elPBToggle.textContent = '+ Builder';
    elPBToggle.classList.remove('pb-active');
    elInput.placeholder = 'Ask anything… (Enter to send, Shift+Enter for newline)';
    addSeparator('── Chat ──');
  }

  function togglePBMode() {
    if (!elPanel.classList.contains('hidden') && pbMode) exitPBMode();
    else { open(); enterPBMode(); }
  }

  elPBToggle.addEventListener('click', () => {
    pbMode ? exitPBMode() : enterPBMode();
  });

  // ── Open / close ──────────────────────────────────────────
  function open() {
    elPanel.classList.remove('hidden');
    elInput.focus();
    renderTierBtn();
  }

  function close() {
    elPanel.classList.add('hidden');
    closeTierMenu();
  }

  function toggle() {
    elPanel.classList.contains('hidden') ? open() : close();
  }

  // ── History: save / restore / clear ──────────────────────
  function saveHistory() {
    if (_savePaused) return;
    const entries = [];
    elMessages.querySelectorAll(':scope > .ai-msg, :scope > .ai-separator').forEach(el => {
      if (el.classList.contains('ai-separator')) {
        entries.push({ kind: 'sep', text: el.textContent.trim() });
      } else {
        const role = [...el.classList].find(c => c.startsWith('ai-') && c !== 'ai-msg' && c !== 'ai-streaming' && c !== 'ai-error')?.slice(3) || 'assistant';
        entries.push({ kind: 'msg', role, text: el.textContent.trim() });
      }
    });
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(entries)); } catch {}
  }

  function restoreHistory() {
    _savePaused = true;
    try {
      const saved = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
      for (const e of saved) {
        if (e.kind === 'sep') addSeparator(e.text);
        else addMessage(e.role, e.text || '');
      }
    } catch {} finally { _savePaused = false; }
  }

  function clearHistory() {
    if (!confirm('Limpar todo o histórico do chat?')) return;
    elMessages.innerHTML = '';
    localStorage.removeItem(CHAT_KEY);
  }

  // ── Messages ──────────────────────────────────────────────
  function addDelBtn(el) {
    const btn = document.createElement('button');
    btn.className = 'ai-msg-del';
    btn.setAttribute('aria-label', 'Delete');
    btn.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); saveHistory(); });
    el.appendChild(btn);
  }

  function addMessage(role, text) {
    const el = document.createElement('div');
    el.className = 'ai-msg ai-' + role;
    el.textContent = text;
    addDelBtn(el);
    elMessages.appendChild(el);
    elMessages.scrollTop = elMessages.scrollHeight;
    saveHistory();
    return el;
  }

  function addSeparator(text) {
    const el = document.createElement('div');
    el.className = 'ai-separator';
    el.textContent = text;
    addDelBtn(el);
    elMessages.appendChild(el);
    elMessages.scrollTop = elMessages.scrollHeight;
    saveHistory();
  }

  let _scrollRaf = null;
  function appendToMessage(el, chunk) {
    el.insertAdjacentText('beforeend', chunk);
    if (!_scrollRaf) {
      _scrollRaf = requestAnimationFrame(() => {
        elMessages.scrollTop = elMessages.scrollHeight;
        _scrollRaf = null;
      });
    }
  }

  // ── Apply code to editor ──────────────────────────────────
  function tryAddApplyBtn(msgEl, fullText) {
    const match = fullText.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (!match || !state.filePath) return;
    const code = match[1];

    const btn = document.createElement('button');
    btn.className = 'ai-apply-btn';
    btn.textContent = '↳ Apply to editor';
    btn.addEventListener('click', async () => {
      const elEditor = document.getElementById('editor');
      const selStart = elEditor.selectionStart;
      const selEnd   = elEditor.selectionEnd;
      const hasSelection = selStart !== selEnd;

      window.sane.history?.push();
      if (hasSelection) {
        // Replace only the selected range
        const before = elEditor.value.slice(0, selStart);
        const after  = elEditor.value.slice(selEnd);
        elEditor.value = before + code + after;
      } else {
        elEditor.value = code;
      }

      elEditor.dispatchEvent(new Event('input'));
      state.content = elEditor.value;
      state.dirty   = false;
      await saveFile();
      btn.textContent = '✓ Applied';
      btn.disabled = true;
    });
    msgEl.appendChild(btn);
  }

  // ── Send ──────────────────────────────────────────────────
  async function send() {
    if (pbLocked) return;

    // Project Builder mode — route to PB handler
    if (pbMode) {
      if (streaming) return;
      const text = elInput.value.trim();
      if (!text) return;
      if (!getModel()) { setStatus('Set up an AI model first', 'err'); return; }
      addMessage('user', text);
      elInput.value = '';
      elInput.style.height = '';
      window.sane.pbHandleSend?.(text);
      return;
    }

    if (streaming) { abort(); return; }
    const text = elInput.value.trim();
    if (!text) return;
    const model = getModel();
    if (!model) { setStatus('Set up an AI model first', 'err'); return; }

    // ── Auto project context ─────────────────────────────────
    let autoCtx = '';
    if (state.folder) {
      try {
        const res = await apiFetch('/ai/project-context?path=' + encodeURIComponent(state.folder));
        const ctx = await res.json();
        const folderName = state.folder.split(/[/\\]/).pop();
        let block = `[Project: ${folderName}] — ${ctx.files.length} files\n`;
        block += ctx.files.map(f => '  ' + f).join('\n');
        if (ctx.key_files?.length) {
          for (const kf of ctx.key_files) {
            block += `\n\n=== ${kf.path} ===\n${kf.content}`;
          }
        }
        autoCtx = block;
      } catch {}
    }

    let prompt = text;
    if (elCtx.checked && state.filePath) {
      const fname = state.filePath.split(/[/\\]/).pop();
      prompt = `[Current file: ${fname}]\n\`\`\`\n${state.content}\n\`\`\`\n\n${text}`;
    }

    // Prepend pinned project context if any
    const projCtx = window.sane?.getProjectContext?.();
    if (projCtx) prompt = projCtx + '\n' + prompt;

    // Prepend project memory if any
    const memCtx = window.sane?.getMemoryContext?.();
    if (memCtx) prompt = memCtx + '\n' + prompt;

    // Prepend live project context (outermost — broadest context first)
    if (autoCtx) prompt = autoCtx + '\n\n' + prompt;

    addMessage('user', text);
    elInput.value = '';
    elInput.style.height = '';

    const elReply = addMessage('assistant', '');
    elReply.classList.add('ai-streaming');

    streaming = true;
    elSend.textContent = '■';
    elSend.title = 'Stop';
    abortCtrl = new AbortController();
    let fullText = '';

    try {
      const res = await fetch('http://localhost:7654/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const t = await res.text();
        elReply.textContent = '⚠ ' + t;
        elReply.classList.add('ai-error');
        return;
      }

      const reader     = res.body.getReader();
      const dec        = new TextDecoder();
      let   buf        = '';
      let   streamDone = false;

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
          if (evt.response) { fullText += evt.response; appendToMessage(elReply, evt.response); }
          if (evt.done) { streamDone = true; break; }
        }
        if (streamDone) break;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        elReply.textContent = '⚠ ' + err.message;
        elReply.classList.add('ai-error');
        addDelBtn(elReply);
      } else {
        if (!elReply.textContent) {
          elReply.textContent = '(stopped)';
          addDelBtn(elReply);
        }
      }
    } finally {
      elReply.classList.remove('ai-streaming');
      streaming = false;
      abortCtrl = null;
      elSend.textContent = '↑';
      elSend.title = 'Send';
      if (fullText) tryAddApplyBtn(elReply, fullText);
      saveHistory();
    }
  }

  function abort() { if (abortCtrl) abortCtrl.abort(); }

  // ── Events ────────────────────────────────────────────────
  elSend.addEventListener('click', send);
  elClose.addEventListener('click', close);

  elInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  elInput.addEventListener('input', () => {
    elInput.style.height = 'auto';
    elInput.style.height = Math.min(elInput.scrollHeight, 140) + 'px';
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      toggle();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      togglePBMode();
    }
    // ESC cancels active stream; if idle, closes panel
    if (e.key === 'Escape' && !elPanel.classList.contains('hidden')) {
      if (streaming) { e.stopPropagation(); abort(); }
      else close();
    }
  });

  document.addEventListener('sane:ai-ask', async (e) => {
    const { prompt } = e.detail;
    if (!prompt) return;
    if (elPanel.classList.contains('hidden')) open();
    elInput.value = prompt;
    elInput.style.height = 'auto';
    send();
  });

  // Sync when model activated from ai_setup.js overlay
  document.addEventListener('sane:model-activated', (e) => {
    if (e.detail.source === 'panel') return; // already handled
    const tier = TIERS.find(t => e.detail.model && e.detail.model.startsWith(t.model));
    if (tier && tier.id !== activeTierId) {
      activeTierId = tier.id;
      if (!elPanel.classList.contains('hidden') && elMessages.children.length > 0) {
        addSeparator('— Switched to ' + tier.label + ' —');
      }
    }
    renderTierBtn();
  });

  renderTierBtn();
  restoreHistory();

  const elClearBtn = document.getElementById('ai-clear');
  if (elClearBtn) elClearBtn.addEventListener('click', clearHistory);

  // ── Expose helpers for project_builder.js ─────────────────
  window.sane = window.sane || {};

  window.sane.aiAddMessage = (role, text) => addMessage(role, text);
  window.sane.aiAddSeparator = (text) => addSeparator(text);
  window.sane.aiAddElement = (el) => {
    elMessages.appendChild(el);
    elMessages.scrollTop = elMessages.scrollHeight;
  };
  window.sane.aiLockInput = (locked) => {
    pbLocked = locked;
    elInput.readOnly = locked;
    elInput.placeholder = locked
      ? 'Building project… please wait'
      : pbMode
        ? 'Describe your project… (Enter to generate)'
        : 'Ask anything… (Enter to send, Shift+Enter for newline)';
    elSend.disabled  = locked || !getActiveTier();
    elPBToggle.disabled = locked;
  };
  window.sane.aiOpenPanel = open;
  window.sane.aiEnterPBMode = () => { open(); if (!pbMode) enterPBMode(); };
  window.sane.cancelAI = () => { if (streaming) abort(); };
  window.sane.isAIStreaming = () => streaming;
})();
