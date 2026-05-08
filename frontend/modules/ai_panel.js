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
  const TIERS = [
    { id: 'fast',     label: 'Fast',     model: 'qwen2.5-coder',     icon: '⚡' },
    { id: 'balanced', label: 'Balanced', model: 'deepseek-coder-v2', icon: '⚖️' },
    { id: 'advanced', label: 'Advanced', model: 'qwen2.5-coder:32b', icon: '🧠' },
  ];
  const STORAGE_KEY = 'sane_active_tier';

  let activeTierId = localStorage.getItem(STORAGE_KEY) || null;
  let streaming    = false;
  let abortCtrl    = null;
  let pbLocked     = false;

  // ── Markdown renderer ─────────────────────────────────────
  function renderMarkdown(text) {
    function esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function inline(s) {
      return esc(s)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
    }

    const lines = text.split('\n');
    const out = [];
    let inCode = false, codeLines = [];
    let inList = false, listOrdered = false;

    function closeList() {
      if (!inList) return;
      out.push(listOrdered ? '</ol>' : '</ul>');
      inList = false;
    }

    for (const line of lines) {
      if (line.trimStart().startsWith('```')) {
        if (!inCode) { closeList(); inCode = true; codeLines = []; }
        else { inCode = false; out.push(`<pre><code>${codeLines.map(esc).join('\n')}</code></pre>`); }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      const hMatch = line.match(/^(#{1,3}) (.+)/);
      if (hMatch) {
        closeList();
        out.push(`<h${hMatch[1].length}>${inline(hMatch[2])}</h${hMatch[1].length}>`);
        continue;
      }

      const ulMatch = line.match(/^[ \t]*[-*+] (.+)/);
      if (ulMatch) {
        if (!inList || listOrdered) { closeList(); out.push('<ul>'); inList = true; listOrdered = false; }
        out.push(`<li>${inline(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = line.match(/^[ \t]*\d+\. (.+)/);
      if (olMatch) {
        if (!inList || !listOrdered) { closeList(); out.push('<ol>'); inList = true; listOrdered = true; }
        out.push(`<li>${inline(olMatch[1])}</li>`);
        continue;
      }

      if (line.startsWith('> ')) { closeList(); out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue; }
      if (/^[-*_]{3,}$/.test(line.trim())) { closeList(); out.push('<hr>'); continue; }
      if (!line.trim()) { closeList(); out.push('<br>'); continue; }

      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }

    closeList();
    if (inCode) out.push(`<pre><code>${codeLines.map(esc).join('\n')}</code></pre>`);
    return out.join('');
  }

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
        const text = el.dataset.raw ?? el.querySelector('.ai-msg-content')?.textContent.trim() ?? el.textContent.trim();
        entries.push({ kind: 'msg', role, text });
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
    if (!confirm('Clear all chat history?')) return;
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
    el.dataset.raw = text;
    const content = document.createElement('div');
    content.className = 'ai-msg-content';
    if (role === 'assistant' && text) content.innerHTML = renderMarkdown(text);
    else content.textContent = text;
    el.appendChild(content);
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
    el._raw = (el._raw || '') + chunk;
    if (!_scrollRaf) {
      _scrollRaf = requestAnimationFrame(() => {
        elMessages.scrollTop = elMessages.scrollHeight;
        _scrollRaf = null;
      });
    }
    if (!el._mdTimer) {
      el._mdTimer = setTimeout(() => {
        el._mdTimer = null;
        const content = el.querySelector('.ai-msg-content');
        if (content) content.innerHTML = renderMarkdown(el._raw);
      }, 80);
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

  // FILE_EDIT mode — replace entire file with the generated code
  function tryAddFileApplyBtn(msgEl, fullText) {
    const match = fullText.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (!match || !state.filePath) { tryAddApplyBtn(msgEl, fullText); return; }
    const code = match[1];

    const btn = document.createElement('button');
    btn.className = 'ai-apply-btn ai-apply-file';
    btn.textContent = '↳ Apply (replace file)';
    btn.addEventListener('click', async () => {
      const elEditor = document.getElementById('editor');
      window.sane.history?.push();
      elEditor.value = code;
      elEditor.dispatchEvent(new Event('input'));
      state.content = code;
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
    if (streaming) { abort(); return; }
    const text = elInput.value.trim();
    if (!text) return;
    if (!getModel()) { setStatus('Set up an AI model first', 'err'); return; }

    addMessage('user', text);
    elInput.value = '';
    elInput.style.height = '';

    const elReply = addMessage('assistant', '');
    elReply.classList.add('ai-streaming');
    streaming  = true;
    elSend.textContent = '■';
    elSend.title = 'Stop';
    abortCtrl = new AbortController();

    function finalize(fullText, intent) {
      clearTimeout(elReply._mdTimer); elReply._mdTimer = null;
      elReply.classList.remove('ai-streaming');
      streaming  = false;
      abortCtrl  = null;
      elSend.textContent = '↑';
      elSend.title = 'Send';
      window.sane._aiSelection = null;
      const text = fullText || elReply._raw || '';
      if (text) {
        const content = elReply.querySelector('.ai-msg-content');
        if (content) { elReply.dataset.raw = text; content.innerHTML = renderMarkdown(text); }
        if (intent === window.sane.INTENT?.FILE_EDIT) tryAddFileApplyBtn(elReply, text);
        else tryAddApplyBtn(elReply, text);
      }
      saveHistory();
    }

    try {
      const { intent, execute } = await window.sane.aiPipeline.process(text);

      // PROJECT_BUILDER intent → hand off to PB handler
      if (intent === window.sane.INTENT.BUILDER) {
        elReply.remove();
        window.sane.pbHandleSend?.(text);
        elReply.classList.remove('ai-streaming');
        streaming = false; abortCtrl = null;
        elSend.textContent = '↑'; elSend.title = 'Send';
        return;
      }

      await new Promise(resolve => {
        execute(
          token  => appendToMessage(elReply, token),
          (full, intentType) => { finalize(full, intentType); resolve(); },
          err    => {
            clearTimeout(elReply._mdTimer); elReply._mdTimer = null;
            const content = elReply.querySelector('.ai-msg-content') || elReply;
            if (err !== null) {
              content.textContent = '⚠ ' + err;
              elReply.classList.add('ai-error');
              finalize('', null);
            } else {
              // stopped — render whatever arrived
              finalize(elReply._raw || '', null);
              if (!content.textContent.trim()) content.textContent = '(stopped)';
            }
            resolve();
          },
          abortCtrl.signal,
        );
      });
    } catch (err) {
      if (err.message === 'no-model') setStatus('Set up an AI model first', 'err');
      elReply.remove();
      finalize('', null);
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
    // ESC cancels active stream; if idle, closes panel
    if (e.key === 'Escape' && !elPanel.classList.contains('hidden')) {
      if (streaming) { e.stopPropagation(); abort(); }
      else close();
    }
  });

  // Sync "attach file" checkbox with pipeline provider
  elCtx.addEventListener('change', () => { window.sane._attachFile = elCtx.checked; });
  window.sane._attachFile = elCtx.checked;

  document.addEventListener('sane:ai-ask', async (e) => {
    const { text, prompt } = e.detail;
    if (!text && !prompt) return;
    if (elPanel.classList.contains('hidden')) open();
    elInput.value = text || prompt || '';
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
      : 'Ask anything… (Enter to send, Shift+Enter for newline)';
    elSend.disabled = locked || !getActiveTier();
  };
  window.sane.aiOpenPanel = open;
  window.sane.aiEnterPBMode = open;
  window.sane.cancelAI = () => { if (streaming) abort(); };
  window.sane.isAIStreaming = () => streaming;
})();
