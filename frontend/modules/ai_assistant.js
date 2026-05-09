// ── AI Pipeline: Classify → Assemble Context → Execute ────
// Stage 1: IntentClassifier  — LLM-first, regex as optional hints only
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
  // LLM-first: every message goes through a lightweight LLM classification
  // step that returns structured JSON. Regex patterns are used only as
  // optional hints injected into the classification prompt — they never
  // make the routing decision directly.

  // Regex hint generators — inform the LLM, do NOT route.
  const HINT_BUILDER = [
    /\b(cri[ae]r?|fa[cç]a?|fazer?|make|build|create|generate|scaffold|construa?|desenvolva?|monte|montar|implemente?r?)\b.{0,80}\b(projeto|project|app|application|site|website|sistema|ferramenta|tool|game|jogo|dashboard|api|server|bot|plataforma|platform)\b/i,
    /\b(quero|want|need|preciso|gostaria)\b.{0,50}\b(projeto|project|app|application|sistema|site|website|dashboard|ferramenta|tool|game|jogo)\b/i,
    /\b(start|begin|iniciar?|come[cç]ar?)\b.{0,30}\b(new|novo|um|uma)\b.{0,30}\b(projeto|project|app)\b/i,
    /\bbuild\s+(me|us)\b/i,
    /^(?!.*\b(como|por\s*que|what\s+is|how\s+to|why|onde|when|quando|o\s+que\s+[eé])\b)(?=.*\b(projeto|project|app|application|sistema|site|dashboard)\b)(?=.*\b(simples|simple|minimalista|minimal|interativo|interactive|b[aá]sico|basic|completo|full|local|sem\s+login|without\s+login|100%)\b).+/i,
  ];
  const HINT_PROJECT_OP = [
    /\b(all\s+files?|entire\s+(project|codebase|repo|repository))\b/i,
    /\b(migrate|port|convert)\b.{0,30}\b(project|codebase|all|entire)\b/i,
  ];
  const HINT_FILE_EDIT = [
    /\b(fix|refactor|rewrite|improve|add|remove|update|change|modify|implement|simplify|optimize)\b.{0,60}\b(this|current)\b/i,
    /\b(this\s+file|this\s+code|this\s+function|this\s+class|este\s+arquivo|este\s+c[oó]digo|essa\s+fun[cç][aã]o)\b/i,
    /\b(corrija?|melhore?|atualize?|modifique?|refatore?|implemente?)\b.{0,60}\b(este|esse|isso|o\s+c[oó]digo|a\s+fun[cç][aã]o|a\s+classe)\b/i,
  ];

  // ── Classification prompt ─────────────────────────────────
  const CLASSIFY_PROMPT =
    'You are an intent classifier for a code editor AI system.\n\n' +
    'Your job is to determine what the user wants to do based on their message.\n\n' +
    'You MUST choose exactly one intent:\n' +
    'CHAT_RESPONSE → general questions, explanations, discussions\n' +
    'FILE_EDIT → changes to a specific file or localized code\n' +
    'PROJECT_OPERATION → multi-file or project-wide changes\n' +
    'PROJECT_BUILDER → creating a new project from scratch\n\n' +
    'Be conservative:\n' +
    '- Prefer FILE_EDIT over PROJECT_OPERATION when unsure\n' +
    '- Prefer CHAT_RESPONSE if no clear action is requested\n\n' +
    'Return ONLY valid JSON — no text outside the JSON object:\n' +
    '{"intent":"CHAT_RESPONSE|FILE_EDIT|PROJECT_OPERATION|PROJECT_BUILDER","confidence":0.85,"reason":"brief reason","target":{"type":"none|current_file|specific_file|multiple_files|project","file":"optional path","scope_hint":"optional"}}';

  function buildClassifyPrompt(message, fileOpen, fileName, regexHint) {
    const ctx = [
      fileOpen && fileName ? 'Active file: ' + fileName : null,
      regexHint            ? 'Pattern hint: ' + regexHint : null,
    ].filter(Boolean).join('\n');
    return CLASSIFY_PROMPT +
      (ctx ? '\n\nContext:\n' + ctx : '') +
      '\n\nMessage: "' + message.slice(0, 300) + '"';
  }

  // Returns true when `text` contains a complete JSON object (brace depth 0).
  function isJsonComplete(text) {
    let depth = 0, inStr = false, esc = false;
    for (const c of text) {
      if (esc)              { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true;  continue; }
      if (c === '"')        { inStr = !inStr; continue; }
      if (inStr)            { continue; }
      if      (c === '{')   { depth++; }
      else if (c === '}')   { depth--; if (depth === 0) return true; }
    }
    return false;
  }

  // Extracts the first complete JSON object from a string.
  function extractJsonObject(text) {
    text = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    return text.slice(start, end + 1);
  }

  // Calls the LLM and returns a structured classification result, or null on failure.
  async function llmClassify(message, model, fileOpen, fileName, regexHint) {
    const prompt = buildClassifyPrompt(message, fileOpen, fileName, regexHint);
    try {
      const ac  = new AbortController();
      const tid = setTimeout(() => ac.abort(), 8000);
      const res = await fetch('http://localhost:7654/ai/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, prompt }),
        signal:  ac.signal,
      });
      clearTimeout(tid);
      if (!res.ok) return null;

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   buf = '', full = '';

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const raw of lines) {
          if (!raw.startsWith('data: ')) continue;
          try {
            const e = JSON.parse(raw.slice(6));
            if (e.response) { full += e.response; }
            if (e.done || isJsonComplete(full)) break outer;
          } catch {}
        }
      }

      const jsonStr = extractJsonObject(full);
      if (!jsonStr) return null;

      const result = JSON.parse(jsonStr);
      if (!result.intent || typeof result.confidence !== 'number') return null;

      const intentMap = {
        'CHAT_RESPONSE':    INTENT.CHAT,
        'FILE_EDIT':        INTENT.FILE_EDIT,
        'PROJECT_OPERATION': INTENT.PROJECT_OP,
        'PROJECT_BUILDER':  INTENT.BUILDER,
      };
      const mapped = intentMap[result.intent];
      if (!mapped) return null;

      return { intent: mapped, confidence: result.confidence };
    } catch {
      return null;
    }
  }

  class IntentClassifier {
    async classify(message, fileOpen, model) {
      // Compute regex hint — for informing the LLM only, not for routing.
      let regexHint = null;
      for (const p of HINT_BUILDER)    if (p.test(message)) { regexHint = 'PROJECT_BUILDER';   break; }
      if (!regexHint)
        for (const p of HINT_PROJECT_OP) if (p.test(message)) { regexHint = 'PROJECT_OPERATION'; break; }
      if (!regexHint && fileOpen)
        for (const p of HINT_FILE_EDIT)  if (p.test(message)) { regexHint = 'FILE_EDIT';         break; }

      // LLM classification — primary decision.
      if (model) {
        const fileName = state.filePath ? state.filePath.split(/[/\\]/).pop() : null;
        const result   = await llmClassify(message, model, fileOpen, fileName, regexHint);
        if (result && result.confidence >= 0.6) return result.intent;
      }

      // Fallback: LLM unavailable, timed out, parse failure, or low confidence.
      if (fileOpen) return INTENT.FILE_EDIT;
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
      const sigs = window.sane._frameworkSignals ? [...window.sane._frameworkSignals] : [];
      // Detect TypeScript workspace from open file extension or content
      const ext = (st.filePath || '').split('.').pop().toLowerCase();
      if (ext === 'ts' || ext === 'tsx') {
        if (!sigs.some(s => /typescript/i.test(s))) sigs.push('TypeScript workspace');
      }
      if (ext === 'tsx' || (st.content || '').includes('from "react"') || (st.content || '').includes("from 'react'")) {
        if (!sigs.some(s => /react/i.test(s))) sigs.push('React');
      }
      return sigs.length ? { label: 'Detected context', content: sigs.join(', ') } : null;
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
