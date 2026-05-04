// ── AI Setup — local_ai_one_click_system_v1 ───────────────
// Manages model tier selection, download, activation, persistence.
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

  // ── Persistence ───────────────────────────────────────────
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

  // ── State ─────────────────────────────────────────────────
  let installedModels = new Set();
  let pullTimers      = {};
  let activeTierId    = loadActive();

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

  // ── Refresh model list ────────────────────────────────────
  async function refresh() {
    // Check Ollama
    try {
      const chk = await apiFetch('/ai/check');
      const { installed } = await chk.json();
      elOllamaWarn.classList.toggle('hidden', installed);
    } catch {
      elOllamaWarn.classList.remove('hidden');
    }

    // Fetch installed models
    try {
      const res    = await apiFetch('/ai/models');
      const models = await res.json() || [];
      installedModels = new Set(models.filter(m => m.installed).map(m => m.name));
    } catch {
      installedModels = new Set();
    }

    // Validate stored active tier — clear if model is no longer installed
    if (activeTierId) {
      const tier = tierById(activeTierId);
      const modelPresent = tier && (installedModels.has(tier.model) ||
        [...installedModels].some(m => m.startsWith(tier.model)));
      if (!modelPresent) {
        activeTierId = null;
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    renderCards();
    updateBadge();
  }

  // ── Render tier cards ─────────────────────────────────────
  function renderCards() {
    elCards.innerHTML = '';

    const ram = navigator.deviceMemory || 8;
    const suggested = ram < 12 ? 'fast' : ram < 28 ? 'balanced' : 'advanced';

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
          ${renderButton(tier, isInstalled, isActive)}
        </div>
      `;

      elCards.appendChild(card);
      wireCard(card, tier, isInstalled, isActive);
    }
  }

  function renderButton(tier, isInstalled, isActive) {
    if (isActive)    return `<button class="ais-btn ais-btn-active" disabled>AI Active</button>`;
    if (isInstalled) return `<button class="ais-btn ais-btn-activate" data-action="activate">Activate AI</button>`;
    return `<button class="ais-btn ais-btn-download" data-action="download">Download AI</button>`;
  }

  function wireCard(card, tier, isInstalled, isActive) {
    const btn = card.querySelector('[data-action]');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'download') startDownload(tier);
      if (btn.dataset.action === 'activate') activate(tier);
    });
  }

  // ── Download ──────────────────────────────────────────────
  async function startDownload(tier) {
    // If already installed, skip download and activate directly
    const alreadyInstalled = installedModels.has(tier.model) ||
      [...installedModels].some(m => m.startsWith(tier.model));
    if (alreadyInstalled) { activate(tier); return; }

    const progEl  = document.getElementById('ais-prog-' + tier.id);
    const fillEl  = document.getElementById('ais-fill-' + tier.id);
    const labelEl = document.getElementById('ais-plabel-' + tier.id);
    const card    = document.querySelector(`.ais-card[data-tier="${tier.id}"]`);
    const btn     = card?.querySelector('[data-action]');

    if (btn) { btn.textContent = 'Downloading…'; btn.disabled = true; }
    progEl?.classList.remove('hidden');

    try {
      await apiFetch('/ai/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Name: tier.model }),
      });
    } catch (err) {
      if (labelEl) labelEl.textContent = 'Error: ' + err.message;
      return;
    }

    // Poll status
    clearInterval(pullTimers[tier.id]);
    pullTimers[tier.id] = setInterval(async () => {
      try {
        const res  = await apiFetch('/ai/pull/status?name=' + encodeURIComponent(tier.model));
        const st   = await res.json();

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
            setTimeout(() => {
              progEl?.classList.add('hidden');
              renderCards();
            }, 1200);
          }
        }
      } catch {}
    }, 600);
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
      elAIBadge.textContent = '⬤ ' + tier.label;
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

  // Expose open globally
  window.sane = window.sane || {};
  window.sane.openAISetup = open;

  // Auto-open on first use if nothing active
  if (!activeTierId) {
    setTimeout(() => {
      if (!localStorage.getItem(STORAGE_KEY)) open();
    }, 1500);
  }
})();
