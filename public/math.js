/*
 * 数学公式渲染。
 * 前提：页面已引入 /vendor/katex/katex.min.js 与 /vendor/katex/contrib/auto-render.min.js。
 * 正文里的 $...$ 与 $$...$$ 由 KaTeX 就地渲染；没有 KaTeX 时静默跳过，
 * 公式会以纯文本显示，不影响阅读。
 */
(function () {
  var DELIMITERS = [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
  ];

  /* 供异步填充内容的页面调用：内容写进 DOM 之后再渲染 */
  window.renderMath = function (root) {
    if (!root || typeof window.renderMathInElement !== 'function') return;
    window.renderMathInElement(root, {
      delimiters: DELIMITERS,
      throwOnError: false, /* 单个公式写错不至于让整页报错 */
    });
  };

  /* 页面上已有的静态公式也顺手处理一遍 */
  document.addEventListener('DOMContentLoaded', function () {
    var boxes = document.querySelectorAll('[data-math]');
    for (var i = 0; i < boxes.length; i++) window.renderMath(boxes[i]);
  });
})();
