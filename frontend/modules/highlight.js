// Generic syntax highlight overlay.
// Reads the tokenizer from window.sane.langs[ext].tokenize.
// Language definitions live in modules/langs/*.js.

(function () {
  const elEditor = document.getElementById('editor');
  const elArea   = document.getElementById('editor-area');

  // Overlay div sits behind the textarea; textarea text is transparent when active.
  const elHL = document.createElement('div');
  elHL.id = 'editor-hl';
  elArea.insertBefore(elHL, elEditor);

  let hlActive      = false;
  let hlTimer       = null;
  let currentLang   = null; // active lang descriptor or null

  function enable(lang) {
    currentLang = lang;
    hlActive    = true;
    elEditor.classList.add('hl-active');
    elHL.style.display = '';
    update();
  }

  function disable() {
    currentLang = null;
    hlActive    = false;
    elEditor.classList.remove('hl-active');
    elHL.style.display = 'none';
    elHL.innerHTML     = '';
  }

  function update() {
    if (!hlActive || !currentLang?.tokenize) return;
    elHL.innerHTML = currentLang.tokenize(elEditor.value);
    syncScroll();
  }

  function scheduleUpdate() {
    clearTimeout(hlTimer);
    hlTimer = setTimeout(update, 30);
  }

  function syncScroll() {
    elHL.scrollTop  = elEditor.scrollTop;
    elHL.scrollLeft = elEditor.scrollLeft;
  }

  elEditor.addEventListener('input',  scheduleUpdate);
  elEditor.addEventListener('scroll', syncScroll);

  // ── onFileOpen hook ───────────────────────────────────────
  const prev = window.sane?.onFileOpen;
  window.sane = window.sane || {};
  window.sane.onFileOpen = (path) => {
    if (prev) prev(path);
    const ext  = extOf(path);
    const lang = window.sane.langs?.[ext];
    lang?.tokenize ? enable(lang) : disable();
  };

  // Start hidden until a file is opened.
  disable();

  function extOf(path) {
    if (!path) return '';
    const dot   = path.lastIndexOf('.');
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return dot > slash ? path.slice(dot).toLowerCase() : '';
  }
})();
