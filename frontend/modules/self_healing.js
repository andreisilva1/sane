(function () {
  const elBar     = document.getElementById('sh-bar');
  const elFixes   = document.getElementById('sh-fixes');
  const elDismiss = document.getElementById('sh-dismiss');

  // ── Helpers ───────────────────────────────────────────────
  function getCode()   { return document.getElementById('editor').value; }
  function getFolder() { return state?.folder || ''; }

  function askAI(prompt) {
    document.dispatchEvent(new CustomEvent('sane:ai-ask', { detail: { prompt } }));
  }

  function runCmd(cmd) {
    window.sane?.runInTerminal?.(cmd);
  }

  async function createFile(absPath) {
    try {
      await apiFetch('/file?path=' + encodeURIComponent(absPath), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ Content: '' }),
      });
      window.sane?.refreshTree?.();
      setStatus('Created ' + absPath.split(/[\\/]/).pop(), 'ok');
    } catch (e) {
      setStatus('Could not create file: ' + e.message, 'err');
    }
  }

  function resolvePath(filePath, rel) {
    if (!rel) return rel;
    if (/^[A-Za-z]:[/\\]/.test(rel) || rel.startsWith('/')) return rel;
    const dir   = filePath.replace(/[/\\][^/\\]+$/, '');
    const parts = dir.replace(/\\/g, '/').split('/');
    rel.replace(/\\/g, '/').split('/').forEach(p => {
      if (p === '..') parts.pop();
      else if (p && p !== '.') parts.push(p);
    });
    return parts.join('\\');
  }

  // ── Pattern catalogue ─────────────────────────────────────
  // Each entry: { match(stderr,stdout,filePath,code) → obj|null, fixes(obj,ctx) → [{label,icon,apply}] }
  const PATTERNS = [

    // pip install
    {
      match: s => { const m = s.match(/ModuleNotFoundError: No module named '([^'.]+)/); return m && { mod: m[1] }; },
      fixes: ({ mod }) => [
        { icon: '▶', label: `pip install ${mod}`,        apply: () => runCmd(`pip install ${mod}`) },
        { icon: '▶', label: `pip3 install ${mod}`,       apply: () => runCmd(`pip3 install ${mod}`) },
        { icon: '✦', label: 'Fix import path with AI',   apply: (ctx) => askAI(`The import '${mod}' fails. Fix the import statement in this code — it may be a wrong relative path or typo:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // npm / node missing module
    {
      match: s => { const m = s.match(/Cannot find module '([^']+)'/); return m && { mod: m[1] }; },
      fixes: ({ mod }) => [
        { icon: '▶', label: `npm install ${mod}`,        apply: () => runCmd(`npm install ${mod}`) },
        { icon: '▶', label: `npm install ${mod} --save-dev`, apply: () => runCmd(`npm install ${mod} --save-dev`) },
      ],
    },

    // Missing local file
    {
      match: (s, _o, fp) => {
        const m = s.match(/FileNotFoundError: \[Errno 2\] No such file or directory: '([^']+)'/);
        return m && { file: m[1], abs: fp ? resolvePath(fp, m[1]) : m[1] };
      },
      fixes: ({ file, abs }) => [
        { icon: '📄', label: `Create missing file: ${file}`, apply: () => createFile(abs) },
        { icon: '✦',  label: 'Fix the file path with AI',    apply: (ctx) => askAI(`File '${file}' not found. Fix the file path or create the file reference in this code:\n\`\`\`\n${ctx.code.slice(0, 2000)}\n\`\`\``) },
      ],
    },

    // Permission denied
    {
      match: s => /PermissionError: \[Errno (13|1)\]/.test(s) ? {} : null,
      fixes: () => [
        { icon: '▶', label: 'Fix file permissions (chmod)',  apply: (ctx) => askAI(`PermissionError when running this code. Suggest how to fix file permissions or change the file path:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\``) },
      ],
    },

    // UnicodeDecodeError
    {
      match: s => /UnicodeDecodeError/.test(s) ? {} : null,
      fixes: () => [
        { icon: '✦', label: 'Add encoding parameter with AI', apply: (ctx) => askAI(`UnicodeDecodeError in this code. Add encoding='utf-8' (and errors='replace' if needed) to all file open() calls:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // IndentationError
    {
      match: s => { const m = s.match(/IndentationError: (.+)/); return m && { msg: m[1] }; },
      fixes: ({ msg }) => [
        { icon: '✦', label: 'Fix indentation with AI', apply: (ctx) => askAI(`IndentationError: ${msg}\n\nFix the indentation in this Python code:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // KeyError
    {
      match: s => { const m = s.match(/KeyError: (.+)/); return m && { key: m[1].trim() }; },
      fixes: ({ key }) => [
        { icon: '✦', label: `Add safe .get() check for key ${key}`, apply: (ctx) => askAI(`KeyError for key ${key}. Replace direct dict[key] accesses with .get(${key}) or add key existence checks in this code:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // AttributeError NoneType
    {
      match: s => { const m = s.match(/AttributeError: 'NoneType' object has no attribute '(.+)'/); return m && { attr: m[1] }; },
      fixes: ({ attr }) => [
        { icon: '✦', label: `Add None check before .${attr}`, apply: (ctx) => askAI(`AttributeError: NoneType has no attribute '${attr}'. Add None/null checks before accessing .${attr} in this code:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // TypeError wrong args
    {
      match: s => { const m = s.match(/TypeError: (.+takes .+positional argument.+)/); return m && { msg: m[1] }; },
      fixes: ({ msg }) => [
        { icon: '✦', label: 'Fix function arguments with AI', apply: (ctx) => askAI(`TypeError: ${msg}\n\nFix the function call arguments in this code:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // NameError
    {
      match: s => { const m = s.match(/NameError: name '(.+)' is not defined/); return m && { name: m[1] }; },
      fixes: ({ name }) => [
        { icon: '✦', label: `Define or import '${name}'`, apply: (ctx) => askAI(`NameError: '${name}' is not defined. Add the missing variable definition or import for '${name}' in this code:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // RecursionError
    {
      match: s => /RecursionError: maximum recursion depth/.test(s) ? {} : null,
      fixes: () => [
        { icon: '✦', label: 'Add base case / fix recursion with AI', apply: (ctx) => askAI(`RecursionError: recursion depth exceeded. Add a proper base case or fix the recursive logic in this code:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // ZeroDivisionError
    {
      match: s => /ZeroDivisionError/.test(s) ? {} : null,
      fixes: () => [
        { icon: '✦', label: 'Add zero-division guard with AI', apply: (ctx) => askAI(`ZeroDivisionError in this code. Add a zero check before all division operations:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },

    // Connection refused
    {
      match: s => /ConnectionRefusedError|ECONNREFUSED/.test(s) ? {} : null,
      fixes: () => [
        { icon: '✦', label: 'Add connection error handling', apply: (ctx) => askAI(`Connection was refused. Add try/except error handling around the connection code and show a clear message if the server is unreachable:\n\`\`\`\n${ctx.code.slice(0, 2000)}\n\`\`\``) },
      ],
    },

    // JSON decode error
    {
      match: s => /json\.decoder\.JSONDecodeError|SyntaxError.*JSON/.test(s) ? {} : null,
      fixes: () => [
        { icon: '✦', label: 'Add JSON validation with AI', apply: (ctx) => askAI(`JSONDecodeError: invalid JSON. Wrap the JSON parsing in a try/except and validate the input before parsing:\n\`\`\`python\n${ctx.code.slice(0, 2000)}\n\`\`\`\nShow only the corrected file.`) },
      ],
    },
  ];

  // ── Render ────────────────────────────────────────────────
  function render(fixes, ctx) {
    elFixes.innerHTML = '';
    fixes.forEach(fix => {
      const row = document.createElement('div');
      row.className = 'sh-fix';

      const lbl = document.createElement('span');
      lbl.className = 'sh-fix-label';
      lbl.textContent = fix.icon + ' ' + fix.label;

      const btn = document.createElement('button');
      btn.className = 'sh-apply';
      btn.textContent = 'Apply';
      btn.addEventListener('click', () => {
        fix.apply(ctx);
        hide();
      });

      row.append(lbl, btn);
      elFixes.appendChild(row);
    });

    elBar.classList.remove('hidden');
  }

  function hide() { elBar.classList.add('hidden'); }

  // ── Events ────────────────────────────────────────────────
  elDismiss.addEventListener('click', hide);

  document.addEventListener('sane:runend', (e) => {
    if (window.sane?.aiSettings?.selfHealing === false) return;
    const { stderr = '', stdout = '', exitCode, filePath } = e.detail;
    hide();
    if (exitCode === 0 || !stderr.trim()) return;

    const code = getCode();
    const ctx  = { code, filePath, folder: getFolder() };

    for (const pattern of PATTERNS) {
      const match = pattern.match(stderr, stdout, filePath, code);
      if (match) {
        const fixes = pattern.fixes(match).filter(Boolean);
        if (fixes.length) { render(fixes, ctx); break; }
      }
    }
  });

  // Clear on new run
  document.addEventListener('sane:runstart', hide);
})();
