// ── AI Pipeline: Classify → Assemble Context → Execute ────
// Stage 1: IntentClassifier  — heuristics, extensible
// Stage 2: ContextAssembler  — provider-based, modular
// Stage 3: AIPipeline.process() — orchestrates the 4 stages
// Stage 4: execute(onToken, onDone, onError, signal) — SSE stream
//
// Extension points:
//   pipeline.contextAssembler.addProvider(p)   — inject future context sources
//   pipeline.contextAssembler.removeProvider(name)
//   Set window.sane._aiSelection before process() to inject selected code
//   Set window.sane._frameworkSignals (array) for framework-aware context

(function () {

  // ── Intent types ──────────────────────────────────────────
  const INTENT = {
    CHAT:       'CHAT_RESPONSE',
    FILE_EDIT:  'FILE_EDIT',
    PROJECT_OP: 'PROJECT_OPERATION',
    BUILDER:    'PROJECT_BUILDER',
  };

  // ── Intent Classifier ─────────────────────────────────────
  // Regex fast path (instant, multilingual) → LLM fallback for
  // ambiguous messages the regex doesn't confidently match.

  const PAT_BUILDER = [
    // Explicit creation verb (EN + PT)
    /\b(cri[ae]r?|fa[cç]a?|fazer?|make|build|create|generate|scaffold|construa?|desenvolva?|monte|montar|implemente?r?)\b.{0,80}\b(projeto|project|app|application|site|website|sistema|ferramenta|tool|game|jogo|dashboard|api|server|bot|plataforma|platform)\b/i,
    // "want / need / quero" + project noun
    /\b(quero|want|need|preciso|gostaria)\b.{0,50}\b(projeto|project|app|application|sistema|site|website|dashboard|ferramenta|tool|game|jogo)\b/i,
    // "start / begin a new project"
    /\b(start|begin|iniciar?|come[cç]ar?)\b.{0,30}\b(new|novo|um|uma)\b.{0,30}\b(projeto|project|app)\b/i,
    // "build me / build us"
    /\bbuild\s+(me|us)\b/i,
    // Implicit description: project noun + feature words, no question markers
    /^(?!.*\b(como|por\s*que|what\s+is|how\s+to|why|onde|when|quando|o\s+que\s+[eé])\b)(?=.*\b(projeto|project|app|application|sistema|site|dashboard)\b)(?=.*\b(simples|simple|minimalista|minimal|interativo|interactive|b[aá]sico|basic|completo|full|local|sem\s+login|without\s+login|100%)\b).+/i,
  ];
  const PAT_PROJECT_OP = [
    /\b(all\s+files?|entire\s+(project|codebase|repo|repository))\b/i,
    /\b(migrate|port|convert)\b.{0,30}\b(project|codebase|all|entire)\b/i,
  ];
  const PAT_FILE_EDIT = [
    /\b(fix|refactor|rewrite|improve|add|remove|update|change|modify|implement|simplify|optimize)\b.{0,60}\b(this|current)\b/i,
    /\b(this\s+file|this\s+code|this\s+function|this\s+class|este\s+arquivo|este\s+c[oó]digo|essa\s+fun[cç][aã]o)\b/i,
    /\b(corrija?|melhore?|atualize?|modifique?|refatore?|implemente?)\b.{0,60}\b(este|esse|isso|o\s+c[oó]digo|a\s+fun[cç][aã]o|a\s+classe)\b/i,
  ];

  // LLM fallback — used only when regex gives no signal
  const CLASSIFY_PROMPT =
    'Reply with exactly one word — the intent label. No explanation.\n\n' +
    'BUILDER=generate new project/app/tool from scratch | ' +
    'FILE_EDIT=modify the open file | ' +
    'PROJECT_OP=change multiple existing files | ' +
    'CHAT=anything else\n\nMessage: ';

  async function llmClassify(message, model) {
    try {
      const ac  = new AbortController();
      const tid = setTimeout(() => ac.abort(), 6000);
      const res = await fetch('http://localhost:7654/ai/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, prompt: CLASSIFY_PROMPT + '"' + message.slice(0, 200) + '"' }),
        signal:  ac.signal,
      });
      clearTimeout(tid);
      if (!res.ok) return INTENT.CHAT;
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf = '', full = '';
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const raw of lines) {
          if (!raw.startsWith('data: ')) continue;
          try { const e = JSON.parse(raw.slice(6)); if (e.response) full += e.response; if (e.done) break outer; } catch {}
        }
        // Stop as soon as we have a recognisable label (don't wait for a full response)
        const up = full.trim().toUpperCase();
        if (up.includes('BUILDER') || up.includes('FILE_EDIT') || up.includes('PROJECT_OP') || up.includes('CHAT')) break;
      }
      const label = full.trim().toUpperCase();
      if (label.includes('BUILDER'))    return INTENT.BUILDER;
      if (label.includes('FILE_EDIT'))  return INTENT.FILE_EDIT;
      if (label.includes('PROJECT_OP')) return INTENT.PROJECT_OP;
    } catch {}
    return INTENT.CHAT;
  }

  class IntentClassifier {
    async classify(message, fileOpen, model) {
      // Fast path — regex (instant, no LLM call)
      for (const p of PAT_BUILDER)    if (p.test(message)) return INTENT.BUILDER;
      for (const p of PAT_PROJECT_OP) if (p.test(message)) return INTENT.PROJECT_OP;
      if (fileOpen)
        for (const p of PAT_FILE_EDIT) if (p.test(message)) return INTENT.FILE_EDIT;

      // Slow path — LLM for ambiguous messages
      if (model) return llmClassify(message, model);
      return INTENT.CHAT;
    }
  }

  // ── Context Assembler ─────────────────────────────────────
  // Provider contract:
  //   { name: string, priority: number,
  //     gather(intent, state) → Promise<{ label, content } | null> }
  //
  // Higher priority = assembled first.
  // Budget: ~20 000 chars (~5 k tokens) — safe for local models.
  // Future providers (workspace memory, arch hints) plug in via addProvider().

  class ContextAssembler {
    constructor() { this._providers = []; }

    addProvider(p) {
      this._providers.push(p);
      this._providers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      return this;
    }

    removeProvider(name) {
      this._providers = this._providers.filter(p => p.name !== name);
      return this;
    }

    async assemble(intent, maxChars = 20000) {
      const chunks = [];
      let used = 0;
      for (const p of this._providers) {
        try {
          const r = await p.gather(intent, state);
          if (!r?.content) continue;
          if (used + r.content.length > maxChars) continue;
          chunks.push(r);
          used += r.content.length;
        } catch {}
      }
      return chunks.map(c => `[${c.label}]\n${c.content}`).join('\n\n');
    }
  }

  // ── Built-in providers ────────────────────────────────────

  // Selected code — highest priority; cleared by panel after each response
  const selectionProvider = {
    name: 'selection', priority: 100,
    gather(intent, st) {
      const sel = window.sane._aiSelection;
      if (!sel) return null;
      const fname = (st.filePath || '').split(/[/\\]/).pop();
      return {
        label:   fname ? `Selected code (${fname})` : 'Selected code',
        content: '```\n' + sel + '\n```',
      };
    },
  };

  // Current open file — included for FILE_EDIT/PROJECT_OP automatically,
  // and for CHAT only when the user checks "attach file"
  const currentFileProvider = {
    name: 'current-file', priority: 90,
    gather(intent, st) {
      if (!st.filePath || !st.content) return null;
      if (intent === INTENT.CHAT && !window.sane._attachFile) return null;
      const fname = st.filePath.split(/[/\\]/).pop();
      const body  = st.content.length > 10000
        ? st.content.slice(0, 10000) + '\n… (truncated)'
        : st.content;
      return { label: `Current file: ${fname}`, content: '```\n' + body + '\n```' };
    },
  };

  // Project memory notes
  const memoryProvider = {
    name: 'memory', priority: 80,
    gather(intent, st) {
      const ctx = window.sane.getMemoryContext?.();
      return ctx ? { label: 'Project memory', content: ctx } : null;
    },
  };

  // Pinned files
  const pinnedProvider = {
    name: 'pinned', priority: 75,
    gather(intent, st) {
      const ctx = window.sane.getProjectContext?.();
      return ctx ? { label: 'Pinned files', content: ctx } : null;
    },
  };

  // Project structure — skipped for FILE_EDIT (file is enough)
  const projectProvider = {
    name: 'project', priority: 60,
    async gather(intent, st) {
      if (intent === INTENT.FILE_EDIT && !window.sane._aiSelection) return null;
      if (!st.folder) return null;
      try {
        const res  = await apiFetch('/ai/project-context?path=' + encodeURIComponent(st.folder));
        const data = await res.json();
        const name = st.folder.split(/[/\\]/).pop();
        const list = (data.files || []).slice(0, 100).join('\n');
        const keys = (data.key_files || [])
          .map(f => `// ${f.path}\n${f.content.slice(0, 2500)}`).join('\n\n');
        const parts = [];
        if (list) parts.push(`${name} — ${data.files?.length || 0} files:\n${list}`);
        if (keys) parts.push(keys);
        return parts.length ? { label: 'Project structure', content: parts.join('\n\n') } : null;
      } catch { return null; }
    },
  };

  // Framework signals from intent_detection.js
  const frameworkProvider = {
    name: 'framework-signals', priority: 50,
    gather(intent, st) {
      const sigs = window.sane._frameworkSignals;
      return sigs?.length ? { label: 'Detected context', content: sigs.join(', ') } : null;
    },
  };

  // ── Pipeline ──────────────────────────────────────────────

  class AIPipeline {
    constructor() {
      this.classifier       = new IntentClassifier();
      this.contextAssembler = new ContextAssembler();
      [selectionProvider, currentFileProvider, memoryProvider,
       pinnedProvider, projectProvider, frameworkProvider]
        .forEach(p => this.contextAssembler.addProvider(p));
    }

    // Returns { intent, execute(onToken, onDone, onError, signal) }
    // opts.forceIntent: bypass classifier (e.g. ai_refactor forces FILE_EDIT)
    async process(message, opts = {}) {
      const model = window.sane.activeModel;
      if (!model) throw new Error('no-model');

      const intent = opts.forceIntent
        ? opts.forceIntent
        : await this.classifier.classify(message, !!state.filePath, model);

      const context = await this.contextAssembler.assemble(intent);

      return {
        intent,
        execute: (onToken, onDone, onError, signal) =>
          this._stream(message, context, intent, model, onToken, onDone, onError, signal),
      };
    }

    async _stream(message, context, intent, model, onToken, onDone, onError, signal) {
      const hint   = this._systemHint(intent);
      const prompt = context ? `${context}\n\n${hint}${message}` : `${hint}${message}`;

      try {
        const res = await fetch('http://localhost:7654/ai/ask', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ model, prompt }),
          signal,
        });
        if (!res.ok) { onError?.(await res.text()); return; }

        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let   buf    = '', full = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const raw of lines) {
            if (!raw.startsWith('data: ')) continue;
            let evt;
            try { evt = JSON.parse(raw.slice(6).trim()); } catch { continue; }
            if (evt.response) { full += evt.response; onToken(evt.response); }
            if (evt.done)     { onDone(full, intent); return; }
          }
        }
        onDone(full, intent);
      } catch (err) {
        // null signals user abort (not an error)
        onError?.(err.name === 'AbortError' ? null : err.message);
      }
    }

    _systemHint(intent) {
      if (intent === INTENT.FILE_EDIT)
        return 'Output the complete updated file in a single code block. No explanation before the block.\n\n';
      if (intent === INTENT.PROJECT_OP)
        return 'For each file that needs changes, use a separate code block with a comment showing its path.\n\n';
      if (intent === INTENT.BUILDER)
        return 'Generate all files needed for this project. For every file, use a separate code block preceded by a comment with its full relative path (e.g. // src/index.html). Include complete, working code — no placeholders.\n\n';
      return '';
    }
  }

  // ── Expose ────────────────────────────────────────────────
  window.sane = window.sane || {};
  window.sane.aiPipeline = new AIPipeline();
  window.sane.INTENT     = INTENT;

})();
