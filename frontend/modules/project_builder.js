// ── Project Builder (chat mode, two-phase) ───────────────────
// Phase 1: plan (file list only, tiny JSON — always parses)
// Phase 2: per-file content generation (raw text, no JSON)
// Entry: window.sane.pbHandleSend(text) called by ai_panel.js

(function () {

  let plan      = null;   // { summary, stack, steps: [{file, description}] }
  let abortCtrl = null;
  let activeCard = null;

  // ── Persistence (localStorage) ────────────────────────────
  const PB_PLAN_KEY     = 'sane_pb_plan';
  const PB_PROGRESS_KEY = 'sane_pb_progress';

  function savePlanState(p, startIdx) {
    localStorage.setItem(PB_PLAN_KEY, JSON.stringify(p));
    localStorage.setItem(PB_PROGRESS_KEY, String(startIdx));
  }

  function saveProgress(idx) {
    localStorage.setItem(PB_PROGRESS_KEY, String(idx));
  }

  function clearSavedBuild() {
    localStorage.removeItem(PB_PLAN_KEY);
    localStorage.removeItem(PB_PROGRESS_KEY);
  }

  function getSavedBuild() {
    try {
      const p   = JSON.parse(localStorage.getItem(PB_PLAN_KEY));
      const idx = parseInt(localStorage.getItem(PB_PROGRESS_KEY) || '0', 10);
      if (p && Array.isArray(p.steps) && p.steps.length > 0 && idx < p.steps.length) {
        return { savedPlan: p, startIdx: idx };
      }
    } catch {}
    return null;
  }

  // ── AI stream ─────────────────────────────────────────────
  async function streamAsk(prompt) {
    const model = window.sane?.activeModel;
    if (!model) throw new Error('No AI model — set one up first');

    abortCtrl = new AbortController();
    const res = await fetch(API + '/ai/ask', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, prompt }),
      signal:  abortCtrl.signal,
    });
    if (!res.ok) throw new Error(await res.text());

    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let   buf = '', full = '', done = false;

    while (true) {
      const { done: eof, value } = await reader.read();
      if (eof) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const raw of lines) {
        if (!raw.startsWith('data: ')) continue;
        let evt; try { evt = JSON.parse(raw.slice(6)); } catch { continue; }
        if (evt.response) full += evt.response;
        if (evt.done) { done = true; break; }
      }
      if (done) break;
    }
    abortCtrl = null;
    return full;
  }

  // ── JSON extraction (phase 1 only — plan is tiny, always clean) ──
  function extractJson(text) {
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // strip optional ```json fence
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (esc)                { esc = false; continue; }
      if (c === '\\' && inStr){ esc = true;  continue; }
      if (c === '"')          { inStr = !inStr; continue; }
      if (inStr)              { continue; }
      if (c === '{')            depth++;
      else if (c === '}')     { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    // fallback: first { … last }
    const end = text.lastIndexOf('}');
    if (end > start) return text.slice(start, end + 1);
    return null;
  }

  function repairJson(text) {
    let out = '', inStr = false, esc = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (esc) { out += c; esc = false; continue; }
      if (c === '\\' && inStr) { out += c; esc = true; continue; }
      if (c === '"') { inStr = !inStr; out += c; continue; }
      if (inStr) {
        if (c === '\n') { out += '\\n'; continue; }
        if (c === '\r') { out += '\\r'; continue; }
        if (c === '\t') { out += '\\t'; continue; }
      }
      out += c;
    }
    return out;
  }

  function parsePlan(raw) {
    try { return JSON.parse(raw); } catch {}
    try { return JSON.parse(repairJson(raw)); } catch {}
    return null;
  }

  // ── Phase 1 prompt: plan only (no content) ───────────────
  function buildPlanPrompt(desc, feedback) {
    const folder = state.folder?.split(/[/\\]/).pop() || 'project';
    return (
      `You are a project scaffolding planner. Output ONLY a JSON object listing files for a project. Do NOT include file contents.\n\n` +
      `PROJECT FOLDER: ${folder}\n` +
      `REQUEST: ${desc}\n` +
      (feedback ? `REFINEMENT: ${feedback}\n` : '') +
      `\nOutput exactly this JSON shape — nothing else:\n` +
      `{"summary":"one-line description","stack":"comma-separated technologies","steps":[{"file":"relative/path.ext","description":"what this file does and every npm package it imports"}]}\n\n` +
      `RULES:\n` +
      `1. Output starts with { and ends with } — no markdown, no explanation.\n` +
      `2. First entry must be README.md.\n` +
      `3. Include EVERY file needed: source files, components, styles, AND all config/manifest files. Never omit.\n` +
      `4. Dependency manifest (package.json / requirements.txt / go.mod / etc.) is MANDATORY. Its description must name every package the project will import.\n` +
      `5. Vite / React projects: index.html goes at the PROJECT ROOT (not inside public/). Entry file must be src/main.tsx. Reference it as <script type="module" src="/src/main.tsx">.\n` +
      `6. Use current stable versions: React 18, Vite 5, TypeScript 5, react-router-dom 6, chart.js 4, @vitejs/plugin-react 4, Express 4, Fastify 4.\n` +
      `7. Do NOT include a "content" field — file paths and descriptions only.\n` +
      `8. Generate package.json as the LAST step (after all source files), so all dependencies are known.\n` +
      `9. TypeScript projects must include tsconfig.json. Node+TS projects must include tsconfig.json and package.json with ts-node or tsx in devDependencies.\n` +
      `10. Use .tsx extension for React component files and .ts for non-JSX TypeScript files.`
    );
  }

  // ── Stack-specific generation hints ───────────────────────
  function stackHints(file, stack) {
    const f = file.toLowerCase();
    const s = (stack || '').toLowerCase();
    const isReact = s.includes('react') || f.endsWith('.tsx') || f.endsWith('.jsx');
    const isVite  = s.includes('vite');
    const isTS    = s.includes('typescript') || s.includes('ts') || f.endsWith('.ts') || f.endsWith('.tsx');
    const hints   = [];

    if (f === 'package.json') {
      hints.push(
        '- List EVERY npm package imported anywhere in this project as a dependency.',
        '- Current versions: react@18.2, react-dom@18.2, react-router-dom@6.8, vite@5.0, @vitejs/plugin-react@4.0, typescript@5.0, chart.js@4.0.',
        '- Scripts must include: "dev":"vite", "build":"tsc && vite build", "preview":"vite preview".',
        '- Do NOT set "main" for a Vite SPA.',
        '- devDependencies: vite, @vitejs/plugin-react, typescript, and all @types/* packages needed.',
      );
    }

    if (f === 'index.html' && (isVite || isReact)) {
      hints.push(
        '- File lives at the PROJECT ROOT, not inside public/.',
        '- Entry script: <script type="module" src="/src/main.tsx"></script>',
        '- Do NOT link any CSS file here; import CSS inside src/main.tsx or component files.',
        '- Only a minimal HTML shell — no inline scripts, no CDN links.',
      );
    }

    if (f.match(/vite\.config\.[tj]s$/)) {
      hints.push(
        '- Import: import react from "@vitejs/plugin-react"',
        '- plugins: [react()] — do NOT use @vitejs/plugin-react-swc unless requested.',
      );
    }

    if (isReact && (f.endsWith('.tsx') || f.endsWith('.jsx'))) {
      hints.push(
        '- NEVER put <script> tags inside JSX — they are ignored by React.',
        '- To use Chart.js or any canvas library: import Chart, declare useRef<HTMLCanvasElement>(null), initialise inside useEffect, and return () => chart.destroy() for cleanup.',
        '- Register Chart.js once: Chart.register(...registerables) at the top of any file that uses it.',
        '- All component props must be typed with a TypeScript interface.',
        '- Import every hook, type, and named export you use.',
        '- Use react-router-dom v6 API: import { Link, useNavigate } from "react-router-dom".',
      );
    }

    if (f === 'src/main.tsx' || f === 'src/index.tsx') {
      hints.push(
        '- Use ReactDOM.createRoot(document.getElementById("root")!).render(...).',
        '- Wrap the app in <React.StrictMode>.',
        '- Import global CSS here if a styles file exists in the project.',
      );
    }

    if (f.endsWith('requirements.txt')) {
      hints.push('- Pin exact versions. Include every package imported anywhere in the project.');
    }

    if (f === 'tsconfig.json') {
      hints.push(
        '- Use "strict": true.',
        '- For Vite/React: target "ESNext", module "ESNext", moduleResolution "Bundler", jsx "react-jsx".',
        '- For Node: target "ES2022", module "CommonJS" or "NodeNext", include ["src/**/*"].',
        '- Always set "outDir": "dist" and "rootDir": "src" for Node projects.',
        '- Do NOT include "paths" aliases unless explicitly needed.',
      );
    }

    if (isTS && !isReact && (f.endsWith('.ts'))) {
      hints.push(
        '- Use explicit TypeScript types for all function parameters and return values.',
        '- Export types and interfaces alongside the implementation.',
        '- Use ES module syntax (import/export) unless the project is Node CommonJS.',
      );
    }

    if (f === 'src/index.ts' || f === 'index.ts' || f === 'src/server.ts' || f === 'server.ts') {
      if (!isReact) {
        hints.push(
          '- This is the entry point — include all necessary imports.',
          '- For Express/Fastify: create the app, register routes, and call app.listen().',
          '- Export the app instance if the project has tests.',
        );
      }
    }

    return hints.length ? `IMPORTANT RULES FOR THIS FILE:\n${hints.join('\n')}\n\n` : '';
  }

  // ── Phase 2 prompt: single file content (raw text) ───────
  function buildFilePrompt(step) {
    const allFiles = plan.steps
      .map(s => `  ${s.file}  —  ${s.description}`)
      .join('\n');
    return (
      `Project: ${plan.summary}\n` +
      `Stack: ${plan.stack}\n\n` +
      `All project files:\n${allFiles}\n\n` +
      `Write the complete content for: ${step.file}\n` +
      `Purpose: ${step.description}\n\n` +
      stackHints(step.file, plan.stack) +
      `GENERAL RULES:\n` +
      `- Output ONLY the raw file content — no explanation, no markdown fences, no JSON wrapper.\n` +
      `- Complete and working — no TODOs, no placeholders, no stub functions.\n` +
      `- Import every package you use. Only reference files listed above.`
    );
  }

  function stripFences(text) {
    return text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```[\w.-]*\r?\n?/m, '')
      .replace(/\r?\n?```\s*$/m, '')
      .trim();
  }

  // ── Chat helpers ──────────────────────────────────────────
  function addMsg(role, text) {
    return window.sane.aiAddMessage(role, text);
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Review card ───────────────────────────────────────────
  function buildReviewCard(p, desc, onRebuild, onBuild) {
    const card = document.createElement('div');
    card.className = 'pb-card';

    const filesHtml = p.steps.map(s =>
      `<div class="pb-card-file">` +
      `<span class="pb-card-file-name">${escHtml(s.file)}</span>` +
      `<span class="pb-card-file-desc">${escHtml(s.description || '')}</span>` +
      `</div>`
    ).join('');

    card.innerHTML =
      `<div class="pb-card-head">` +
        `<div class="pb-card-summary">${escHtml(p.summary || '')}</div>` +
        (p.stack ? `<div class="pb-card-stack">${escHtml(p.stack)}</div>` : '') +
      `</div>` +
      `<div class="pb-card-files">${filesHtml}</div>` +
      `<div class="pb-card-foot">` +
        `<input class="pb-card-feedback" type="text" placeholder="Feedback to refine plan… (Enter to rebuild)" spellcheck="false" autocomplete="off">` +
        `<button class="pb-card-rebuild">↺ Rebuild</button>` +
        `<button class="pb-card-build">▶ Build</button>` +
        `<button class="pb-card-reject">✕ Reject</button>` +
      `</div>`;

    const feedback = card.querySelector('.pb-card-feedback');
    card.querySelector('.pb-card-rebuild').addEventListener('click', () => {
      onRebuild(desc, feedback.value.trim());
    });
    feedback.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); onRebuild(desc, feedback.value.trim()); }
    });
    card.querySelector('.pb-card-build').addEventListener('click', () => onBuild());
    card.querySelector('.pb-card-reject').addEventListener('click', () => {
      disableCard(card);
      clearSavedBuild();
      plan = null;
      addMsg('ai-pb-system', '— plan rejected —');
    });

    return card;
  }

  function disableCard(card) {
    card.querySelectorAll('button, input').forEach(el => el.disabled = true);
  }

  // ── Phase 1: generate plan (file list only) ───────────────
  async function generatePlan(desc, feedback) {
    if (activeCard) disableCard(activeCard);
    activeCard = null;

    const sysMsg = addMsg('ai-pb-system', '');
    sysMsg.innerHTML = '<span class="pb-spinner">⟳</span> Planning project structure<span class="pb-dots"></span>';

    try {
      const full = await streamAsk(buildPlanPrompt(desc, feedback));
      if (!full) throw new Error('AI returned an empty response.');

      const raw = extractJson(full);
      if (!raw) {
        const preview = full.slice(0, 120).replace(/\n/g, ' ');
        throw new Error(`No JSON in response. Got: "${preview}…"`);
      }

      plan = parsePlan(raw);
      if (!plan) throw new Error('Could not parse plan JSON. Try again.');
      if (!Array.isArray(plan.steps) || plan.steps.length === 0)
        throw new Error('Plan has no files. Try a more specific prompt.');

      const MANIFEST_RE = /^(package\.json|requirements\.txt|go\.mod|Cargo\.toml|Gemfile|pom\.xml|build\.gradle)$/i;

      // Inject manifest if model forgot to include one
      const hasManifest = plan.steps.some(s => MANIFEST_RE.test(s.file.split(/[/\\]/).pop()));
      if (!hasManifest) {
        const st = (plan.stack || '').toLowerCase();
        if (/node|react|vue|angular|next|vite|express|typescript|javascript|svelte/.test(st))
          plan.steps.push({ file: 'package.json',    description: 'npm manifest — list every dependency and devDependency used in the project, plus dev/build/preview scripts' });
        else if (/python|flask|django|fastapi/.test(st))
          plan.steps.push({ file: 'requirements.txt', description: 'Python dependencies with pinned versions for every package imported in the project' });
        else if (/\bgo\b|golang/.test(st))
          plan.steps.push({ file: 'go.mod',           description: 'Go module definition with all external imports' });
        else if (/rust/.test(st))
          plan.steps.push({ file: 'Cargo.toml',       description: 'Rust package manifest with all crate dependencies' });
        else if (/ruby/.test(st))
          plan.steps.push({ file: 'Gemfile',           description: 'Ruby gem dependencies' });
      }

      // Manifests last so all source files are known when generating them
      plan.steps.sort((a, b) => {
        const aM = MANIFEST_RE.test(a.file.split(/[/\\]/).pop());
        const bM = MANIFEST_RE.test(b.file.split(/[/\\]/).pop());
        if (aM && !bM) return 1;
        if (!aM && bM) return -1;
        return 0;
      });

      savePlanState(plan, 0);

      sysMsg.textContent = `✓ Plan ready — ${plan.steps.length} files`;

      const card = buildReviewCard(
        plan, desc,
        (d, fb) => generatePlan(d, fb),
        () => executePlan()
      );
      const elMessages = document.getElementById('ai-messages');
      elMessages.appendChild(card);
      elMessages.scrollTop = elMessages.scrollHeight;
      activeCard = card;
      window.sane.aiLockInput(false);

    } catch (err) {
      if (err.name === 'AbortError') {
        sysMsg.textContent = '— cancelled —';
        window.sane.aiLockInput(false);
        return;
      }
      sysMsg.textContent = '⚠ ' + err.message;
      sysMsg.className = 'ai-msg ai-pb-error';
      window.sane.aiLockInput(false);
    }
  }

  // ── Phase 2: generate + write each file ──────────────────
  async function executePlan(startIdx = 0) {
    if (!plan?.steps?.length) return;
    if (activeCard) { disableCard(activeCard); activeCard = null; }

    window.sane.aiLockInput(true);
    const total = plan.steps.length;

    for (let i = startIdx; i < total; i++) {
      const step     = plan.steps[i];
      const filePath = state.folder.replace(/[/\\]$/, '') + '/' + step.file.replace(/\\/g, '/');
      const label    = `[${i + 1}/${total}] ${step.file}`;

      const progressMsg = addMsg('ai-pb-progress', '');
      progressMsg.innerHTML = `<span class="pb-spinner">⟳</span> ${escHtml(label)}`;

      try {
        const raw     = await streamAsk(buildFilePrompt(step));
        const content = stripFences(raw);

        await apiFetch('/file?path=' + encodeURIComponent(filePath), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content }),
        });
        progressMsg.textContent = `✓ ${label}`;
        saveProgress(i + 1);
      } catch (err) {
        if (err.name === 'AbortError') {
          progressMsg.textContent = `— cancelled —`;
          window.sane.aiLockInput(false);
          return;
        }
        progressMsg.textContent = `✗ ${label} — ${err.message}`;
        progressMsg.className = 'ai-msg ai-pb-error';
        addMsg('ai-pb-error', `Build stopped at "${step.file}".`);
        window.sane.aiLockInput(false);
        return;
      }
    }

    clearSavedBuild();
    await window.sane.refreshTree?.();

    const folderName = state.folder.split(/[/\\]/).pop();
    const doneMsg = addMsg('ai-pb-done',
      `✓ ${total} file${total !== 1 ? 's' : ''} created in "${folderName}".`
    );

    const firstCode = plan.steps.find(s => /\.(py|js|ts|tsx|go|rs|rb|java|cpp|c|html)$/.test(s.file));
    if (firstCode) {
      const btn = document.createElement('button');
      btn.className = 'ai-apply-btn';
      btn.textContent = '↳ Open ' + firstCode.file;
      btn.style.marginTop = '4px';
      btn.addEventListener('click', () => {
        const p = state.folder.replace(/[/\\]$/, '') + '/' + firstCode.file;
        window.sane.openFile?.(p);
      });
      doneMsg.appendChild(btn);
    }

    plan = null;
    window.sane.aiLockInput(false);
    setStatus('Project built', 'ok');
  }

  // ── Resume card (shown on load if an incomplete build exists) ─
  function buildResumeCard(savedPlan, startIdx) {
    const remaining = savedPlan.steps.length - startIdx;
    const card = document.createElement('div');
    card.className = 'pb-resume-card';
    card.innerHTML =
      `<div class="pb-resume-title">↩ Unfinished build</div>` +
      `<div class="pb-resume-summary">${escHtml(savedPlan.summary || '')}</div>` +
      `<div class="pb-resume-progress">${startIdx} of ${savedPlan.steps.length} files done — ${remaining} remaining</div>` +
      `<div class="pb-resume-foot">` +
        `<button class="pb-resume-continue">▶ Continue</button>` +
        `<button class="pb-resume-discard">✕ Discard</button>` +
      `</div>`;

    card.querySelector('.pb-resume-continue').addEventListener('click', () => {
      if (!state.folder) {
        addMsg('ai-pb-error', '⚠ Open the project folder first, then continue.');
        return;
      }
      card.querySelector('.pb-resume-title').textContent = '▶ Build continued';
      card.classList.add('pb-resolved-continue');
      card.querySelectorAll('button').forEach(b => b.disabled = true);
      plan = savedPlan;
      window.sane.aiOpenPanel?.();
      executePlan(startIdx);
    });

    card.querySelector('.pb-resume-discard').addEventListener('click', () => {
      clearSavedBuild();
      card.querySelector('.pb-resume-title').textContent = '✕ Build discarded';
      card.classList.add('pb-resolved-discard');
      card.querySelectorAll('button').forEach(b => b.disabled = true);
    });

    return card;
  }

  function checkResumable() {
    const saved = getSavedBuild();
    if (!saved) return;
    const { savedPlan, startIdx } = saved;
    const card = buildResumeCard(savedPlan, startIdx);
    const elMessages = document.getElementById('ai-messages');
    if (elMessages) {
      elMessages.appendChild(card);
    }
  }

  // ── Entry point ───────────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.pbHandleSend = async function (text) {
    if (!state.folder) {
      window.sane.aiAddMessage('ai-pb-error', '⚠ Open a project folder first.');
      return;
    }
    window.sane.aiLockInput(true);
    await generatePlan(text, '');
  };

  // Check for a resumable build after the panel initialises
  setTimeout(checkResumable, 0);

})();
