// Java language definition.
// Registers at window.sane.langs['.java'].
(function () {
  window.sane = window.sane || {};
  window.sane.langs = window.sane.langs || {};

  const KW = new Set([
    'abstract','assert','boolean','break','byte','case','catch','char','class',
    'const','continue','default','do','double','else','enum','extends','final',
    'finally','float','for','goto','if','implements','import','instanceof','int',
    'interface','long','native','new','null','package','private','protected',
    'public','return','short','static','strictfp','super','switch',
    'synchronized','this','throw','throws','transient','true','false','try',
    'var','void','volatile','while','record','sealed','permits','yield',
  ]);

  const BI = new Set([
    'String','Integer','Long','Double','Float','Boolean','Character','Byte',
    'Short','Object','Number','Math','System','Arrays','Collections',
    'List','ArrayList','LinkedList','HashMap','TreeMap','Map','Set','HashSet',
    'TreeSet','Iterator','Optional','Stream','StringBuilder','StringBuffer',
    'Thread','Runnable','Exception','RuntimeException','Error',
    'IllegalArgumentException','NullPointerException','IndexOutOfBoundsException',
    'IOException','Scanner','PrintWriter','BufferedReader','InputStreamReader',
    'File','Path','Paths','Files','InputStream','OutputStream',
    'Override','SuppressWarnings','Deprecated','FunctionalInterface',
    'out','err','in','println','print','printf','format',
  ]);

  const tokenize = window.sane.langBase.makeCLikeTokenizer(KW, BI, ['class', 'interface', 'enum', 'record']);

  window.sane.langs['.java'] = {
    name:        'Java',
    canRun:      true,
    canTrace:    false,
    tokenize,
    completions: [...KW, ...BI].sort(),
  };
})();
