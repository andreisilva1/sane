// JavaScript language definition.
// Registers at window.sane.langs['.js'].
(function () {
  window.sane = window.sane || {};
  window.sane.langs = window.sane.langs || {};

  const KW = new Set([
    'break','case','catch','class','const','continue','debugger','default',
    'delete','do','else','export','extends','false','finally','for','function',
    'if','import','in','instanceof','let','new','null','of','return','static',
    'super','switch','this','throw','true','try','typeof','undefined','var',
    'void','while','with','yield','async','await',
  ]);

  const BI = new Set([
    'console','Math','JSON','Array','Object','String','Number','Boolean',
    'Date','RegExp','Error','Map','Set','WeakMap','WeakSet','Promise','Symbol',
    'Proxy','Reflect','parseInt','parseFloat','isNaN','isFinite','encodeURI',
    'encodeURIComponent','decodeURI','decodeURIComponent','setTimeout',
    'setInterval','clearTimeout','clearInterval','fetch','document','window',
    'navigator','location','history','localStorage','sessionStorage',
    'globalThis','Infinity','NaN','undefined',
  ]);

  const tokenize = window.sane.langBase.makeCLikeTokenizer(KW, BI, ['function', 'class']);

  window.sane.langs['.js'] = {
    name:        'JavaScript',
    canRun:      true,
    canTrace:    false,
    tokenize,
    completions: [...KW, ...BI].sort(),
  };
})();
