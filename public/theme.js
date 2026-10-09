/*
 * 明暗主题：在 <head> 里同步执行，避免首屏闪白。
 * 选择记在 localStorage，首次访问跟随系统偏好。
 */
(function () {
  var KEY = 'hibo-theme';
  var root = document.documentElement;

  var saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (e) {
    /* 无痕模式等场景读不到，按系统偏好走 */
  }

  var preferDark = false;
  try {
    preferDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (e) {
    /* 老浏览器忽略 */
  }

  root.setAttribute('data-theme', saved || (preferDark ? 'dark' : 'light'));

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.theme-btn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {
        /* 存不了也不影响本次切换 */
      }
    });
  });
})();
