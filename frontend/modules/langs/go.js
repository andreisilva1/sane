// Go language definition.
// Registers at window.sane.langs['.go'].
(function () {
  window.sane = window.sane || {};
  window.sane.langs = window.sane.langs || {};

  const KW = new Set([
    'break','case','chan','const','continue','default','defer','else',
    'fallthrough','for','func','go','goto','if','import','interface','map',
    'package','range','return','select','struct','switch','type','var',
  ]);

  const BI = new Set([
    // built-in functions
    'append','cap','clear','close','complex','copy','delete','imag','len',
    'make','max','min','new','panic','print','println','real','recover',
    // predeclared types
    'bool','byte','complex64','complex128','error','float32','float64',
    'int','int8','int16','int32','int64','rune','string',
    'uint','uint8','uint16','uint32','uint64','uintptr',
    // predeclared constants / zero value
    'true','false','nil','iota',
    // common stdlib identifiers
    'fmt','os','io','err','ctx','http','json','sync','time','strings',
    'strconv','bytes','bufio','log','math','sort','filepath','errors',
  ]);

  const tokenize = window.sane.langBase.makeCLikeTokenizer(KW, BI, ['func', 'type']);

  window.sane.langs['.go'] = {
    name:        'Go',
    canRun:      true,
    canTrace:    false,
    tokenize,
    completions: [...KW, ...BI].sort(),
  };
})();
