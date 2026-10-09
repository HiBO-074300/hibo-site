/*
 * 全站侧栏：翻牌时钟 + 当月日历 + 站点成立天数。
 * 页面里放一个 <aside class="side" id="side"></aside>，本脚本负责填充。
 * 数据来自 /api/site（config.json 的 site）。
 */
(function () {
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pad = function (n) { return String(n).padStart(2, '0'); };

  var slots = [];
  var calStamp = '';

  /* ---------- 翻牌时钟：上下半各一张牌，从中间翻 ---------- */

  /* 半个牌子：overflow 裁掉另一半，里面的数字按整张牌高排版 */
  function makeHalf(cls) {
    var box = document.createElement('span');
    box.className = 'flip-half ' + cls;
    var dig = document.createElement('span');
    dig.className = 'dig';
    box.appendChild(dig);
    return box;
  }

  /* 翻转用的牌面，同样是半张 */
  function makeLeaf(cls) {
    var box = document.createElement('span');
    box.className = 'leaf ' + cls;
    var dig = document.createElement('span');
    dig.className = 'dig';
    box.appendChild(dig);
    return box;
  }

  function makeDigit(host) {
    var flip = document.createElement('span');
    flip.className = 'flip';

    var halfBottom = makeHalf('half-bottom'); /* 静态下半 */
    var halfTop = makeHalf('half-top');       /* 静态上半 */
    var leafDown = makeLeaf('leaf-down');     /* 翻下去的牌 */
    var leafUp = makeLeaf('leaf-up');         /* 翻上来的牌 */

    flip.appendChild(halfBottom);
    flip.appendChild(halfTop);
    flip.appendChild(leafDown);
    flip.appendChild(leafUp);
    host.appendChild(flip);

    /* 四张牌先都写上 0，否则初始值恰好是 0 时（setDigit 会提前返回）会留白 */
    halfTop.firstChild.textContent = '0';
    halfBottom.firstChild.textContent = '0';
    leafDown.firstChild.textContent = '0';
    leafUp.firstChild.textContent = '0';

    return {
      el: flip,
      topDig: halfTop.firstChild,
      bottomDig: halfBottom.firstChild,
      downDig: leafDown.firstChild,
      upDig: leafUp.firstChild,
      value: '0',
      timer: 0,
    };
  }

  function buildClock(host) {
    for (var i = 0; i < 6; i++) {
      if (i === 2 || i === 4) {
        var colon = document.createElement('span');
        colon.className = 'clock-colon';
        colon.textContent = ':';
        host.appendChild(colon);
      }
      slots.push(makeDigit(host));
    }
  }

  /* 动画没跑完又来了新值（切后台再切回、秒数跳变）：先把下半落定，
     否则延时更新被取消，下半会停在更旧的值上，出现上下不一致 */
  function settle(slot) {
    if (!slot.timer) return;
    window.clearTimeout(slot.timer);
    slot.timer = 0;
    slot.bottomDig.textContent = slot.value;
    slot.el.classList.remove('flipping');
  }

  function setDigit(slot, next) {
    if (slot.value === next) return;

    settle(slot);

    var prev = slot.value;
    slot.value = next;

    if (reduceMotion) {
      slot.topDig.textContent = next;
      slot.bottomDig.textContent = next;
      slot.downDig.textContent = next;
      slot.upDig.textContent = next;
      return;
    }

    slot.downDig.textContent = prev; /* 绕中轴翻走：旧数字的上半 */
    slot.topDig.textContent = next;  /* 翻走后露出来的：新数字的上半 */
    slot.upDig.textContent = next;   /* 从中轴翻上来：新数字的下半 */
    /* 静态下半先留旧值，等翻完再换，避免露馅 */

    slot.el.classList.remove('flipping');
    void slot.el.offsetWidth; /* 强制重排，保证能连续触发动画 */
    slot.el.classList.add('flipping');

    slot.timer = window.setTimeout(function () {
      slot.timer = 0;
      slot.bottomDig.textContent = slot.value;
      slot.el.classList.remove('flipping');
    }, 640);
  }

  function tick() {
    var now = new Date();
    var text = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());

    for (var i = 0; i < slots.length; i++) setDigit(slots[i], text[i]);

    var dateBox = document.getElementById('clock-date');
    if (dateBox) {
      dateBox.textContent = now.getFullYear() + '年' + pad(now.getMonth() + 1) + '月' + pad(now.getDate()) + '日 星期' + WEEK[now.getDay()];
    }

    /* 跨日时重画日历 */
    var stamp = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();
    if (stamp !== calStamp) {
      calStamp = stamp;
      renderCalendar(now);
    }
  }

  /* ---------- 当月日历 ---------- */
  function renderCalendar(now) {
    var year = now.getFullYear();
    var month = now.getMonth();

    var head = document.getElementById('cal-head');
    if (head) head.textContent = year + ' 年 ' + (month + 1) + ' 月';

    var box = document.getElementById('cal-days');
    if (!box) return;
    box.textContent = '';

    var lead = (new Date(year, month, 1).getDay() + 6) % 7; /* 周一排第一列 */
    var total = new Date(year, month + 1, 0).getDate();
    var today = now.getDate();

    for (var i = 0; i < lead; i++) {
      var blank = document.createElement('span');
      blank.className = 'cal-day blank';
      box.appendChild(blank);
    }

    for (var day = 1; day <= total; day++) {
      var cell = document.createElement('span');
      var dow = (lead + day - 1) % 7;
      cell.className = 'cal-day' + (dow >= 5 ? ' weekend' : '') + (day === today ? ' today' : '');
      cell.textContent = day;
      box.appendChild(cell);
    }
  }

  /* ---------- 成立天数 ---------- */
  function daysSince(founded) {
    var start = new Date(founded + 'T00:00:00');
    if (Number.isNaN(start.getTime())) return null;
    return Math.floor((Date.now() - start.getTime()) / 86400000) + 1; /* 成立当天算第 1 天 */
  }

  function loadSite() {
    var block = document.getElementById('days');
    if (!block) return;

    fetch('/api/site', { cache: 'no-store' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data.linkUrl) block.href = data.linkUrl;
        if (data.linkName) block.title = data.linkName;

        var days = data.founded ? daysSince(data.founded) : null;
        if (days === null) {
          block.hidden = true; /* 没配成立日期就不占位置 */
          return;
        }

        document.getElementById('days-num').textContent = days;
        block.hidden = false;
      })
      .catch(function () {
        block.hidden = true;
      });
  }

  /* ---------- 组装 ---------- */
  function buildPanel() {
    var side = document.getElementById('side');
    if (!side) return;

    side.innerHTML =
      '<div class="clock">' +
        '<div class="clock-time" id="clock-time"></div>' +
        '<div class="clock-date" id="clock-date"></div>' +
      '</div>' +
      '<div class="cal">' +
        '<div class="cal-head" id="cal-head"></div>' +
        '<div class="cal-week">' +
          '<span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>' +
        '</div>' +
        '<div class="cal-days" id="cal-days"></div>' +
      '</div>' +
      '<a class="days" id="days" hidden>' +
        '<span class="days-brand">HiBO</span>' +
        '<span class="days-meta">建立 <b id="days-num">0</b> 天</span>' +
      '</a>';

    buildClock(document.getElementById('clock-time'));
    tick();
    window.setInterval(tick, 1000);

    /* 从后台切回来时立刻对齐，别干等下一个周期 */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tick();
    });

    loadSite();
  }

  document.addEventListener('DOMContentLoaded', buildPanel);
})();
