// Python language definition.
// Registers at window.sane.langs['.py'].
(function () {
  window.sane = window.sane || {};
  window.sane.langs = window.sane.langs || {};

  const KW = new Set([
    'False','None','True','and','as','assert','async','await',
    'break','class','continue','def','del','elif','else','except',
    'finally','for','from','global','if','import','in','is','lambda',
    'nonlocal','not','or','pass','raise','return','try','while','with','yield',
  ]);

  const BI = new Set([
    'abs','all','any','ascii','bin','bool','breakpoint','bytearray','bytes',
    'callable','chr','classmethod','compile','complex','delattr','dict','dir',
    'divmod','enumerate','eval','exec','filter','float','format','frozenset',
    'getattr','globals','hasattr','hash','help','hex','id','input','int',
    'isinstance','issubclass','iter','len','list','locals','map','max',
    'memoryview','min','next','object','oct','open','ord','pow','print',
    'property','range','repr','reversed','round','set','setattr','slice',
    'sorted','staticmethod','str','sum','super','tuple','type','vars','zip',
    'Exception','ValueError','TypeError','KeyError','IndexError',
    'AttributeError','ImportError','OSError','RuntimeError','StopIteration',
    'NotImplementedError','NameError','ZeroDivisionError','FileNotFoundError',
  ]);

  // Python-specific regex: triple-quoted strings, decorators, single/double quoted
  const TOK_RE = new RegExp(
    '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')' +
    '|(#[^\\n]*)' +
    '|\\b(\\d+\\.?\\d*(?:[eE][+-]?\\d+)?|0x[\\da-fA-F]+)\\b' +
    '|(@\\w+)' +
    '|([A-Za-z_]\\w*)',
    'g'
  );

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tokenize(code) {
    let html = '', last = 0, prevDef = false;
    TOK_RE.lastIndex = 0;
    let m;
    while ((m = TOK_RE.exec(code)) !== null) {
      if (m.index > last) html += esc(code.slice(last, m.index));
      last = m.index + m[0].length;
      const [, str, cmt, num, dec, id] = m;
      if (str !== undefined) {
        html += '<span class="hl-st">' + esc(m[0]) + '</span>';
        prevDef = false;
      } else if (cmt !== undefined) {
        html += '<span class="hl-cm">' + esc(m[0]) + '</span>';
        prevDef = false;
      } else if (num !== undefined) {
        html += '<span class="hl-nu">' + esc(m[0]) + '</span>';
        prevDef = false;
      } else if (dec !== undefined) {
        html += '<span class="hl-dc">' + esc(m[0]) + '</span>';
        prevDef = false;
      } else if (id !== undefined) {
        if (KW.has(m[0])) {
          prevDef = m[0] === 'def' || m[0] === 'class';
          html += '<span class="hl-kw">' + esc(m[0]) + '</span>';
        } else if (prevDef) {
          html += '<span class="hl-fn">' + esc(m[0]) + '</span>';
          prevDef = false;
        } else if (BI.has(m[0])) {
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
  }

  window.sane.langs['.py'] = {
    name:        'Python',
    canRun:      true,
    canTrace:    true,
    tokenize,
    completions: [...KW, ...BI].sort(),
  };
})();
