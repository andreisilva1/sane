(function () {
  const elEditor = document.getElementById('editor');
  const elArea   = document.getElementById('editor-area');

  // ── Bar elements (created once, appended to editor-area) ──
  const elBar     = document.createElement('div');
  elBar.id = 'ix-bar';
  const elLabel   = document.createElement('span');
  elLabel.id = 'ix-label';
  const elChips   = document.createElement('span');
  elChips.id = 'ix-chips';
  const elDismiss = document.createElement('button');
  elDismiss.id = 'ix-dismiss';
  elDismiss.textContent = '×';
  elDismiss.title = 'Dismiss';
  elBar.append(elLabel, elChips, elDismiss);
  elArea.appendChild(elBar);

  const dismissed = new Set(); // dismissed per filePath
  let   debounce  = null;

  // ── Detection rules ───────────────────────────────────────
  const RULES = [
    {
      label: '⚡ FastAPI',
      test: c => /\bfrom fastapi\b|\bimport fastapi\b/i.test(c),
      suggestions: [
        { text: '→ Add a route',      prompt: 'Add a new FastAPI route to my code. Show only the route function with decorator.' },
        { text: '→ Generate docs',    prompt: 'Suggest how to add automatic OpenAPI documentation to this FastAPI code.' },
        { text: '→ Add middleware',   prompt: 'Add CORS middleware and a basic auth middleware to this FastAPI app.' },
      ],
    },
    {
      label: '🌶 Flask',
      test: c => /\bfrom flask\b|\bimport flask\b/i.test(c),
      suggestions: [
        { text: '→ Add a route',    prompt: 'Add a new Flask route to this code. Show only the new route function.' },
        { text: '→ Add auth',       prompt: 'Add basic token authentication to this Flask app.' },
        { text: '→ Add CORS',       prompt: 'Add CORS support to this Flask application.' },
      ],
    },
    {
      label: '🟢 Express.js',
      test: c => /require\(['"]express['"]\)|from ['"]express['"]/i.test(c),
      suggestions: [
        { text: '→ Add route',       prompt: 'Add a new REST route to this Express.js app.' },
        { text: '→ Add middleware',  prompt: 'Add error handling middleware and request logging to this Express.js app.' },
      ],
    },
    {
      label: '⚛ React',
      test: c => /from ['"]react['"]|import React/i.test(c),
      suggestions: [
        { text: '→ Add component',  prompt: 'Generate a new reusable React component that fits this codebase.' },
        { text: '→ Add state',      prompt: 'Add useState and useEffect hooks to manage data in this React component.' },
        { text: '→ Add prop types', prompt: 'Add PropTypes validation to all components in this file.' },
      ],
    },
    {
      label: '🔌 API client',
      test: c => /\bfetch\s*\(|import axios|require\(['"]axios['"]\)/i.test(c),
      suggestions: [
        { text: '→ Add error handling', prompt: 'Add proper error handling and loading states to the fetch/axios calls in this code.' },
        { text: '→ Add retry logic',    prompt: 'Add automatic retry logic with exponential backoff to the API calls in this code.' },
      ],
    },
    {
      label: '📊 Data analysis',
      test: c => /\bimport pandas\b|\bimport numpy\b|\bfrom pandas\b|\bfrom numpy\b/i.test(c),
      suggestions: [
        { text: '→ Add visualization', prompt: 'Add matplotlib or seaborn visualizations appropriate for this data analysis code.' },
        { text: '→ Add summary stats', prompt: 'Add summary statistics and data quality checks to this pandas/numpy code.' },
        { text: '→ Export results',    prompt: 'Add code to export the results of this analysis to CSV and generate a summary report.' },
      ],
    },
    {
      label: '🤖 Machine learning',
      test: c => /\bimport tensorflow\b|\bimport torch\b|\bimport sklearn\b|\bfrom sklearn\b|\bfrom torch\b/i.test(c),
      suggestions: [
        { text: '→ Add training loop', prompt: 'Add a complete training loop with validation and early stopping to this ML code.' },
        { text: '→ Add metrics',       prompt: 'Add evaluation metrics and a confusion matrix to this machine learning code.' },
      ],
    },
    {
      label: '🗄 Database',
      test: c => /\bimport sqlite3\b|\bfrom sqlalchemy\b|\bimport sqlalchemy\b|\bimport psycopg2\b/i.test(c),
      suggestions: [
        { text: '→ Add CRUD',      prompt: 'Add complete CRUD (create, read, update, delete) functions for the database in this code.' },
        { text: '→ Add migration', prompt: 'Generate a database migration script for the schema defined in this code.' },
      ],
    },
    {
      label: '🖥 CLI script',
      test: c => /\bimport argparse\b|\bsys\.argv\b|\bimport click\b/i.test(c),
      suggestions: [
        { text: '→ Add --help',       prompt: 'Improve the CLI argument parser in this script with better --help descriptions and validation.' },
        { text: '→ Add subcommands',  prompt: 'Refactor this CLI script to use subcommands (like git add, git commit).' },
      ],
    },
    {
      label: '🧪 Test suite',
      test: c => /\bimport pytest\b|\bimport unittest\b|\bfrom unittest\b|\bdef test_/i.test(c),
      suggestions: [
        { text: '→ Add fixtures',    prompt: 'Add pytest fixtures and parametrize decorators to improve this test suite.' },
        { text: '→ Add edge cases',  prompt: 'Suggest edge cases and add tests for them in this test file.' },
      ],
    },
    {
      label: '🕹 Pygame',
      test: c => /\bimport pygame\b|\bfrom pygame\b/i.test(c),
      suggestions: [
        { text: '→ Add game loop',  prompt: 'Add a proper game loop with delta time to this pygame code.' },
        { text: '→ Add sprites',    prompt: 'Add a sprite class and group management to this pygame project.' },
      ],
    },
    {
      label: '🌐 HTTP client',
      test: c => /\bimport requests\b|\bfrom requests\b/i.test(c) && !/\bfrom fastapi\b|\bimport fastapi\b|\bfrom flask\b/.test(c),
      suggestions: [
        { text: '→ Add retry',      prompt: 'Add retry logic and timeout handling to the requests calls in this code.' },
        { text: '→ Add auth',       prompt: 'Add API key or OAuth authentication headers to the requests in this code.' },
      ],
    },
    {
      label: '🪟 Desktop GUI',
      test: c => /\bimport tkinter\b|\bfrom tkinter\b|\bimport PyQt\b|\bfrom PyQt/i.test(c),
      suggestions: [
        { text: '→ Add menu bar',   prompt: 'Add a menu bar with File and Help menus to this desktop GUI code.' },
        { text: '→ Add dialog',     prompt: 'Add a settings dialog box to this GUI application.' },
      ],
    },
    {
      label: '📄 HTML page',
      test: c => /<!DOCTYPE html|<html\b/i.test(c),
      suggestions: [
        { text: '→ Add CSS',        prompt: 'Add clean, modern CSS styling to this HTML page.' },
        { text: '→ Add JavaScript', prompt: 'Add interactive JavaScript to make this HTML page dynamic.' },
        { text: '→ Make responsive', prompt: 'Add responsive design and mobile-friendly media queries to this HTML page.' },
      ],
    },
    {
      label: '📜 DOM script',
      test: c => /document\.querySelector|document\.getElementById|addEventListener/i.test(c) && !/<!DOCTYPE html|<html\b/i.test(c),
      suggestions: [
        { text: '→ Add event handlers', prompt: 'Add comprehensive event handling to the DOM manipulations in this script.' },
        { text: '→ Add error checks',   prompt: 'Add null checks and error handling to the DOM operations in this code.' },
      ],
    },
  ];

  // ── Detect & render ───────────────────────────────────────
  function detect(filePath) {
    if (window.sane?.aiSettings?.intentDetection === false) { hide(); return; }
    if (!filePath || dismissed.has(filePath)) { hide(); return; }

    const code = elEditor.value;
    if (!code.trim()) { hide(); return; }

    const match = RULES.find(r => r.test(code));
    if (!match) { hide(); window.sane._frameworkSignals = null; return; }

    // Expose framework signal to the AI pipeline context assembler
    window.sane._frameworkSignals = [match.label];

    elLabel.textContent = match.label + ' detected';
    elChips.innerHTML = '';

    match.suggestions.slice(0, 3).forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'ix-chip';
      chip.textContent = s.text;
      chip.addEventListener('click', () => {
        // Dispatch a natural message — pipeline classifies intent and assembles context
        document.dispatchEvent(new CustomEvent('sane:ai-ask', {
          detail: { text: s.text.replace(/^→\s*/, '') }
        }));
      });
      elChips.appendChild(chip);
    });

    elBar.classList.remove('ix-hidden');
  }

  function hide() {
    elBar.classList.add('ix-hidden');
    window.sane._frameworkSignals = null;
  }

  // ── Dismiss ───────────────────────────────────────────────
  elDismiss.addEventListener('click', () => {
    if (state?.filePath) dismissed.add(state.filePath);
    hide();
  });

  // ── Triggers ──────────────────────────────────────────────
  function schedule() {
    clearTimeout(debounce);
    debounce = setTimeout(() => detect(state?.filePath), 1400);
  }

  elEditor.addEventListener('input', schedule);

  // Hook into file open (runner.js sets window.sane.onFileOpen first)
  const _origOpen = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = function (path) {
    _origOpen?.(path);
    hide();
    clearTimeout(debounce);
    debounce = setTimeout(() => detect(path), 700);
  };
})();
