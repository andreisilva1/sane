// ── AI Setup — local_ai_one_click_system_v1 ───────────────
// Manages model tier selection, download, activation, persistence.
// Ollama presence check + auto-install + model delete.
// Depends on: apiFetch, setStatus

(function () {

  const TIERS = [
    {
      id: 'fast',
      icon: '⚡',
      label: 'Fast',
      desc: 'Instant responses. Ideal for lower-end machines.',
      model: 'qwen2.5-coder',
      size: '~1.5 GB',
      req: '8 GB RAM',
    },
    {
      id: 'balanced',
      icon: '⚖️',
      label: 'Balanced',
      desc: 'Best balance between speed and quality for coding.',
      model: 'deepseek-r1',
      size: '~4.7 GB',
      req: '16 GB RAM',
      recommended: true,
    },
    {
      id: 'advanced',
      icon: '🧠',
      label: 'Advanced',
      desc: 'Maximum quality and code understanding. Requires more resources.',
      model: 'phi4',
      size: '~9.1 GB',
      req: '32 GB RAM',
    },
  ];

  const STORAGE_KEY = 'sane_active_tier';

  function saveActive(tierId) { localStorage.setItem(STORAGE_KEY, tierId); }
  function loadActive()       { return localStorage.getItem(STORAGE_KEY); }
  function tierById(id)       { return TIERS.find(t => t.id === id) || null; }

  // ── DOM refs ──────────────────────────────────────────────
  const elOverlay    = document.getElementById('ais-overlay');
  const elClose      = document.getElementById('ais-close');
  const elCards      = document.getElementById('ais-cards');
  const elOllamaWarn = document.getElementById('ais-ollama-warn');
  const elAIBadge    = document.getElementById('ai-badge');

  // Corner widget refs
  const elWidget        = document.getElementById('ollama-widget');
  const elWidgetFill    = document.getElementById('ollama-widget-fill');
  const elWidgetInfo    = document.getElementById('ollama-widget-info');
  const elWidgetTitle   = document.getElementById('ollama-widget-title');
  const elWidgetCancel  = document.getElementById('ollama-widget-cancel');

  elWidgetCancel?.addEventListener('click', cancelOllamaInstall);

  // ── State ─────────────────────────────────────────────────
  let installedModels  = new Set();
  let pullTimers       = {};
  let activeTierId     = loadActive();
  let ollamaState      = 'unknown'; // not_installed | not_running | running
  let ollamaInstalling = false;
  let installPollTimer = null;

  // ── Open / close ──────────────────────────────────────────
  async function open() {
    elOverlay.classList.remove('hidden');
    await refresh();
  }

  function close() {
    elOverlay.classList.add('hidden');
  }

  elClose.addEventListener('click', close);
  elOverlay.addEventListener('mousedown', (e) => {
    if (e.target === elOverlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elOverlay.classList.contains('hidden')) close();
  });

  elAIBadge.addEventListener('click', open);

  // ── Ollama state ──────────────────────────────────────────
  async function fetchOllamaStatus() {
    try {
      const res  = await apiFetch('/ai/ollama/status');
      return await res.json();
    } catch {
      return { state: 'unknown', installState: '' };
    }
  }

  function renderOllamaWarn(status) {
    const { state, installState } = status;
    ollamaState = state;
    elOllamaWarn.classList.remove('ais-ok');

    if (state !== 'not_installed') {
      // Ollama is present on this machine
      elOllamaWarn.classList.add('ais-ok');
      elOllamaWarn.innerHTML =
        `<span class="ais-warn-text ais-warn-ok">Ollama detected — download a model below to get started.</span>` +
        `<button class="ais-install-btn ais-btn-ghost" id="ais-reinstall-btn">Reinstall Ollama</button>`;
      document.getElementById('ais-reinstall-btn')?.addEventListener('click', () => startOllamaInstall(true));
      elOllamaWarn.classList.remove('hidden');
      return;
    }

    // state === 'not_installed'
    if (installState === 'done') {
      elOllamaWarn.innerHTML =
        `<span class="ais-warn-text ais-warn-restart">✓ Ollama installed — restart Sane to activate AI features.</span>`;
    } else if (installState === 'downloading' || installState === 'installing') {
      elOllamaWarn.innerHTML =
        `<span class="ais-warn-text">Installing Ollama in background…</span>` +
        `<button class="ais-install-btn" disabled>Installing…</button>`;
    } else if (installState === 'error') {
      elOllamaWarn.innerHTML =
        `<span class="ais-warn-text">⚠ Ollama install failed.</span>` +
        `<button class="ais-install-btn" id="ais-install-btn">Retry</button>`;
      document.getElementById('ais-install-btn')?.addEventListener('click', () => startOllamaInstall(false));
    } else {
      elOllamaWarn.innerHTML =
        `<span class="ais-warn-text">⚠ Ollama not found — required for AI features.</span>` +
        `<button class="ais-install-btn" id="ais-install-btn">Install automatically</button>`;
      document.getElementById('ais-install-btn')?.addEventListener('click', () => startOllamaInstall(false));
    }
    elOllamaWarn.classList.remove('hidden');
  }

  // ── Ollama install ────────────────────────────────────────
  async function startOllamaInstall(force = false) {
    ollamaInstalling = true;
    renderOllamaWarn({ state: 'not_installed', installState: 'downloading' });
    renderCards();

    try {
      await apiFetch('/ai/ollama/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Force: force }),
      });
    } catch { /* fire and forget */ }

    showWidget('Downloading Ollama', 0);
    pollInstallStatus();
  }

  function showWidget(title, pct, info) {
    elWidget.classList.remove('hidden');
    elWidgetTitle.textContent = title;
    elWidgetFill.style.width  = pct + '%';
    elWidgetInfo.textContent  = info || (pct + '%');
  }

  function hideWidget() {
    elWidget.classList.add('hidden');
  }

  async function cancelOllamaInstall() {
    clearInterval(installPollTimer);
    installPollTimer = null;
    ollamaInstalling = false;
    hideWidget();
    try { await apiFetch('/ai/ollama/install/cancel', { method: 'POST' }); } catch {}
    refresh();
  }

  function pollInstallStatus() {
    clearInterval(installPollTimer);
    installPollTimer = setInterval(async () => {
      try {
        const res  = await apiFetch('/ai/ollama/install/status');
        const st   = await res.json();

        if (st.state === 'downloading') {
          const info = st.pct > 0 ? st.pct + '%' : (st.msg || 'Connecting…');
          showWidget('Downloading Ollama', st.pct, info);
        } else if (st.state === 'installing') {
          showWidget('Installing Ollama', 100, 'Installing…');
        } else if (st.state === 'done') {
          clearInterval(installPollTimer);
          installPollTimer = null;
          ollamaInstalling = false;
          hideWidget();
          renderOllamaWarn({ state: 'not_installed', installState: 'done' });
          renderCards();
        } else if (st.state === 'error') {
          clearInterval(installPollTimer);
          installPollTimer = null;
          ollamaInstalling = false;
          hideWidget();
          setStatus('Ollama install failed: ' + st.msg, 'err');
          refresh();
        } else if (!st.state) {
          // was cancelled externally — stop polling
          clearInterval(installPollTimer);
          installPollTimer = null;
          ollamaInstalling = false;
          hideWidget();
        }
      } catch {}
    }, 800);
  }

  // ── Refresh model list ────────────────────────────────────
  async function refresh() {
    const ollamaStatus = await fetchOllamaStatus();

    // If a background install is running, re-attach polling; otherwise clear flag
    if (ollamaStatus.installState === 'downloading' || ollamaStatus.installState === 'installing') {
      ollamaInstalling = true;
      if (!installPollTimer) pollInstallStatus();
    } else {
      ollamaInstalling = false;
    }

    renderOllamaWarn(ollamaStatus);

    // Only fetch models if Ollama is reachable
    if (ollamaStatus.state !== 'not_installed') {
      try {
        const res    = await apiFetch('/ai/models');
        const models = await res.json() || [];
        installedModels = new Set(models.filter(m => m.installed).map(m => m.name));
      } catch {
        installedModels = new Set();
      }
    } else {
      installedModels = new Set();
    }

    // Invalidate stored tier if model is gone
    if (activeTierId) {
      const tier = tierById(activeTierId);
      const present = tier && (installedModels.has(tier.model) ||
        [...installedModels].some(m => m.startsWith(tier.model)));
      if (!present) {
        activeTierId = null;
        localStorage.removeItem(STORAGE_KEY);
        document.dispatchEvent(new CustomEvent('sane:model-deactivated'));
      }
    }

    renderCards();
    updateBadge();
  }

  // ── Render tier cards ─────────────────────────────────────
  function renderCards() {
    elCards.innerHTML = '';
    const ram      = navigator.deviceMemory || 8;
    const suggested = ram < 12 ? 'fast' : ram < 28 ? 'balanced' : 'advanced';
    const blocked  = ollamaInstalling || ollamaState === 'not_installed';

    for (const tier of TIERS) {
      const isInstalled = installedModels.has(tier.model) ||
        [...installedModels].some(m => m.startsWith(tier.model));
      const isActive    = activeTierId === tier.id;
      const isSuggested = suggested === tier.id;

      const card = document.createElement('div');
      card.className = 'ais-card' + (isActive ? ' ais-active' : '');
      card.dataset.tier = tier.id;

      card.innerHTML = `
        <div class="ais-card-head">
          <span class="ais-icon">${tier.icon}</span>
          <span class="ais-label">${tier.label}</span>
          ${tier.recommended ? '<span class="ais-badge-rec">Recommended</span>' : ''}
          ${isSuggested && !tier.recommended ? '<span class="ais-badge-sug">For your machine</span>' : ''}
          ${isActive ? '<span class="ais-badge-on">Active</span>' : ''}
        </div>
        <div class="ais-desc">${tier.desc}</div>
        <div class="ais-meta">${tier.size} &nbsp;·&nbsp; ${tier.req}</div>
        <div class="ais-progress hidden" id="ais-prog-${tier.id}">
          <div class="ais-bar"><div class="ais-fill" id="ais-fill-${tier.id}"></div></div>
          <div class="ais-prog-label" id="ais-plabel-${tier.id}">Starting…</div>
        </div>
        <div class="ais-actions">
          ${renderButton(tier, isInstalled, isActive, blocked)}
        </div>
      `;

      elCards.appendChild(card);
      wireCard(card, tier, isInstalled, isActive, blocked);
    }
  }

  function renderButton(tier, isInstalled, isActive, blocked) {
    const delBtn = `<button class="ais-btn ais-btn-delete" data-action="delete" title="Uninstall model">Remove</button>`;

    if (isActive) {
      return `<button class="ais-btn ais-btn-active" disabled>AI Active</button>${delBtn}`;
    }
    if (isInstalled) {
      return `<button class="ais-btn ais-btn-activate" data-action="activate">Activate AI</button>${delBtn}`;
    }
    if (blocked) {
      const tip = ollamaInstalling
        ? 'Ollama is being installed, please wait…'
        : 'Install Ollama first';
      return `<button class="ais-btn ais-btn-download" disabled title="${tip}">Download AI</button>`;
    }
    return `<button class="ais-btn ais-btn-download" data-action="download">Download AI</button>`;
  }

  function wireCard(card, tier, isInstalled, isActive, blocked) {
    card.querySelector('[data-action="download"]')?.addEventListener('click', () => startDownload(tier));
    card.querySelector('[data-action="activate"]')?.addEventListener('click', () => activate(tier));
    card.querySelector('[data-action="delete"]')?.addEventListener('click',   () => confirmDelete(card, tier));
  }

  // ── Download ──────────────────────────────────────────────
  async function startDownload(tier) {
    const alreadyInstalled = installedModels.has(tier.model) ||
      [...installedModels].some(m => m.startsWith(tier.model));
    if (alreadyInstalled) { activate(tier); return; }

    // Re-check Ollama state (it may have changed since cards were rendered)
    const status = await fetchOllamaStatus();
    if (status.installState === 'downloading' || status.installState === 'installing') {
      setStatus('Ollama is being installed — please wait', '');
      return;
    }
    if (status.state === 'not_installed') {
      renderOllamaWarn(status);
      elOllamaWarn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    doModelDownload(tier);
  }

  function doModelDownload(tier) {
    const progEl  = document.getElementById('ais-prog-' + tier.id);
    const fillEl  = document.getElementById('ais-fill-' + tier.id);
    const labelEl = document.getElementById('ais-plabel-' + tier.id);
    const card    = document.querySelector(`.ais-card[data-tier="${tier.id}"]`);
    const btn     = card?.querySelector('[data-action="download"]');

    if (btn) { btn.textContent = 'Downloading…'; btn.disabled = true; }
    progEl?.classList.remove('hidden');

    apiFetch('/ai/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Name: tier.model }),
    }).catch(err => {
      if (labelEl) labelEl.textContent = 'Error: ' + err.message;
    });

    clearInterval(pullTimers[tier.id]);
    pullTimers[tier.id] = setInterval(async () => {
      try {
        const res = await apiFetch('/ai/pull/status?name=' + encodeURIComponent(tier.model));
        const st  = await res.json();

        if (st.total > 0) {
          const pct = Math.round((st.completed / st.total) * 100);
          if (fillEl)  fillEl.style.width = pct + '%';
          if (labelEl) labelEl.textContent = st.status + ' · ' + pct + '%';
        } else {
          if (labelEl) labelEl.textContent = st.status || 'Preparing…';
        }

        if (st.done) {
          clearInterval(pullTimers[tier.id]);
          if (st.error) {
            if (labelEl) labelEl.textContent = 'Error: ' + st.error;
            if (btn) { btn.textContent = 'Retry'; btn.disabled = false; }
          } else {
            installedModels.add(tier.model);
            if (fillEl)  fillEl.style.width = '100%';
            if (labelEl) labelEl.textContent = 'Download complete!';
            setTimeout(() => { progEl?.classList.add('hidden'); renderCards(); }, 1200);
          }
        }
      } catch {}
    }, 600);
  }

  // ── Delete model ──────────────────────────────────────────
  function confirmDelete(card, tier) {
    const actionsEl = card.querySelector('.ais-actions');
    if (!actionsEl) return;
    actionsEl.innerHTML =
      `<span class="ais-del-confirm">Remove ${tier.label}?</span>` +
      `<button class="ais-btn ais-btn-del-yes">Yes, remove</button>` +
      `<button class="ais-btn ais-btn-del-no">Cancel</button>`;
    actionsEl.querySelector('.ais-btn-del-yes').addEventListener('click', () => doDelete(tier));
    actionsEl.querySelector('.ais-btn-del-no').addEventListener('click', () => renderCards());
  }

  async function doDelete(tier) {
    setStatus('Removing ' + tier.label + '…', '');
    try {
      await apiFetch('/ai/model', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Name: tier.model }),
      });
      installedModels.delete(tier.model);
      if (activeTierId === tier.id) {
        activeTierId = null;
        localStorage.removeItem(STORAGE_KEY);
        updateBadge();
        document.dispatchEvent(new CustomEvent('sane:model-deactivated'));
      }
      setStatus(tier.label + ' removed', 'ok');
    } catch (err) {
      setStatus('Remove failed: ' + err.message, 'err');
    }
    renderCards();
  }

  // ── Activate ──────────────────────────────────────────────
  function activate(tier) {
    activeTierId = tier.id;
    saveActive(tier.id);
    updateBadge();
    renderCards();
    close();

    document.dispatchEvent(new CustomEvent('sane:model-activated', {
      detail: { model: tier.model, tier: tier.label }
    }));
    setStatus('AI activated: ' + tier.label, 'ok');
  }

  // ── Badge ─────────────────────────────────────────────────
  function updateBadge() {
    if (!elAIBadge) return;
    const tier = tierById(activeTierId);
    if (tier) {
      elAIBadge.textContent = 'AI · ' + tier.label;
      elAIBadge.classList.add('ais-badge-live');
    } else {
      elAIBadge.textContent = 'Set up AI';
      elAIBadge.classList.remove('ais-badge-live');
    }
  }

  // ── Boot ──────────────────────────────────────────────────
  updateBadge();

  // Sync badge when model switched from chat panel
  document.addEventListener('sane:model-activated', (e) => {
    if (e.detail.source !== 'panel') return;
    const tier = TIERS.find(t => e.detail.model && e.detail.model.startsWith(t.model));
    if (tier) { activeTierId = tier.id; saveActive(tier.id); updateBadge(); }
  });

  // Re-render AI panel input state on deactivation
  document.addEventListener('sane:model-deactivated', () => {
    document.dispatchEvent(new CustomEvent('sane:render-ai-input'));
  });

  window.sane = window.sane || {};
  window.sane.openAISetup = open;

  if (!activeTierId) {
    setTimeout(() => {
      if (!localStorage.getItem(STORAGE_KEY)) open();
    }, 1500);
  }
})();
