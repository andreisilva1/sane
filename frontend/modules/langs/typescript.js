// TypeScript language definition.
// Registers at window.sane.langs['.ts'].
(function () {
  window.sane = window.sane || {};
  window.sane.langs = window.sane.langs || {};

  const KW = new Set([
    'break','case','catch','class','const','continue','debugger','default',
    'delete','do','else','export','extends','false','finally','for','function',
    'if','import','in','instanceof','let','new','null','of','return','static',
    'super','switch','this','throw','true','try','typeof','undefined','var',
    'void','while','with','yield','async','await',
    // TypeScript-specific
    'interface','type','enum','namespace','module','declare','abstract',
    'implements','readonly','override','satisfies','as','is','infer','never',
    'unknown','any','asserts','using','keyof','unique',
  ]);

  const BI = new Set([
    'console','Math','JSON','Array','Object','String','Number','Boolean',
    'Date','RegExp','Error','Map','Set','WeakMap','WeakSet','Promise','Symbol',
    'Proxy','Reflect','parseInt','parseFloat','isNaN','isFinite','encodeURI',
    'encodeURIComponent','decodeURI','decodeURIComponent','setTimeout',
    'setInterval','clearTimeout','clearInterval','fetch','document','window',
    'navigator','location','history','localStorage','sessionStorage',
    'globalThis','Infinity','NaN','undefined',
    // Node globals
    'process','Buffer','__dirname','__filename','require','module','exports',
    // TS utility types
    'Partial','Required','Readonly','Record','Pick','Omit','Exclude','Extract',
    'NonNullable','ReturnType','InstanceType','Parameters','ConstructorParameters',
    'Awaited','NoInfer',
  ]);

  const tokenize = window.sane.langBase.makeCLikeTokenizer(KW, BI, ['function', 'class', 'interface', 'type', 'enum']);

  window.sane.langs['.ts'] = {
    name:        'TypeScript',
    canRun:      true,
    canTrace:    false,
    tokenize,
    completions: [...KW, ...BI].sort(),
  };
})();
