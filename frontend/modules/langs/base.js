// Shared tokenizer factory for C-family languages (JS, Go, Java).
// Each language calls window.sane.langBase.makeCLikeTokenizer(kwSet, biSet, defKws)
// and registers the result as its lang.tokenize function.
(function () {
  window.sane = window.sane || {};
  window.sane.langs = window.sane.langs || {};

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // defKeywords: identifiers after which the next identifier is a name (func/class/etc.)
  function makeCLikeTokenizer(kwSet, biSet, defKeywords) {
    const defKwSet = new Set(defKeywords || []);
    // Groups: 1=string  2=comment  3=number  4=identifier
    const re = new RegExp(
      '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`[^`]*`)' +
      '|(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)' +
      '|\\b(0x[\\da-fA-F]+|\\d+\\.?\\d*(?:[eE][+-]?\\d+)?)\\b' +
      '|([A-Za-z_][\\w]*)',
      'g'
    );
    return function tokenize(code) {
      let html = '', last = 0, prevDef = false;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) {
        if (m.index > last) html += esc(code.slice(last, m.index));
        last = m.index + m[0].length;
        const [, str, cmt, num, id] = m;
        if (str !== undefined) {
          html += '<span class="hl-st">' + esc(m[0]) + '</span>';
          prevDef = false;
        } else if (cmt !== undefined) {
          html += '<span class="hl-cm">' + esc(m[0]) + '</span>';
          prevDef = false;
        } else if (num !== undefined) {
          html += '<span class="hl-nu">' + esc(m[0]) + '</span>';
          prevDef = false;
        } else if (id !== undefined) {
          if (kwSet.has(m[0])) {
            prevDef = defKwSet.has(m[0]);
            html += '<span class="hl-kw">' + esc(m[0]) + '</span>';
          } else if (prevDef) {
            html += '<span class="hl-fn">' + esc(m[0]) + '</span>';
            prevDef = false;
          } else if (biSet.has(m[0])) {
            html += '<span class="hl-bi">' + esc(m[0]) + '</span>';
            prevDef = false;
          } else {
            html += esc(m[0]);
            prevDef = false;
          }
        }
      }
      if (last < code.length) html += esc(code.slice(last));
      return html;
    };
  }

  window.sane.langBase = { makeCLikeTokenizer };
})();
