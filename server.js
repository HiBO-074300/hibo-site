/*
 * 文章平台服务 —— Node 原生模块，零 npm 依赖
 *
 * 职责：
 *   1. 提供 public/ 静态文件
 *   2. GET /api/articles  扫描 content/ 目录，返回文章列表（按时间倒序）
 *   3. GET /api/article   读取单个 .md，解析 front-matter + 正文，返回 JSON
 *   4. 文件库（根目录由 config.json 配置）
 *      GET /api/library  配置里的全部根（一级菜单）
 *      GET /api/browse   浏览某一层目录，只列出 PDF / HTML / MD
 *      GET /api/view     取文件内容：md 解析成 HTML，pdf/html 给原始地址
 *      GET /raw          输出文件原始字节，支持 Range（PDF 内嵌查看需要）
 *
 * 文章只认 content/ 目录下的 .md / .markdown，按 mtime 或 front-matter 的 date 排序。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseMarkdown, splitFrontMatter } = require('./lib/markdown');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONTENT_DIR = path.join(ROOT, 'content');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const PORT = Number(process.env.PORT) || 80;

/* 文件库只放行这三类，其余一律隐藏也读不到 */
const ALLOWED_EXT = new Set(['.pdf', '.html', '.htm', '.md', '.markdown']);

/* 首页「最近更新」递归扫描的上限，防止超大目录把响应拖慢 */
const MAX_SCAN = 20000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/* 只允许 .md / .markdown，且解析后必须仍落在 content/ 内，防止 ../ 穿越 */
function resolveContentFile(name) {
  if (typeof name !== 'string' || !name) return null;
  const base = path.basename(name);
  if (!/\.(md|markdown)$/i.test(base)) return null;

  const full = path.resolve(CONTENT_DIR, base);
  const root = path.resolve(CONTENT_DIR) + path.sep;
  if (!full.startsWith(root)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

/* 取文章时间：front-matter 的 date 优先，其次文件修改时间 */
function resolveDate(meta, stats) {
  const raw = meta && meta.date ? String(meta.date).trim() : '';
  if (raw) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return stats.mtime.toISOString();
}

function titleFromMeta(meta, fallback) {
  if (meta && meta.title) return String(meta.title).trim();
  /* 文件名兜底：2026-10-09-hello-world -> hello world */
  return fallback.replace(/\.(md|markdown)$/i, '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/[-_]+/g, ' ').trim() || '未命名';
}

/* 只读文件头部解析 front-matter，避免整篇读入 */
function readHeadMeta(full) {
  try {
    const fd = fs.openSync(full, 'r');
    const buf = Buffer.alloc(4096);
    const bytes = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    return splitFrontMatter(buf.slice(0, bytes).toString('utf8')).meta;
  } catch {
    /* 解析失败就用文件名兜底，不影响列表 */
    return {};
  }
}

function listArticles() {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const items = [];
  for (const name of fs.readdirSync(CONTENT_DIR)) {
    if (!/\.(md|markdown)$/i.test(name)) continue;
    const full = path.join(CONTENT_DIR, name);
    let stats;
    try {
      stats = fs.statSync(full);
    } catch {
      continue; /* 文件正被占用或已删除，跳过 */
    }
    if (!stats.isFile()) continue;

    const meta = readHeadMeta(full);

    items.push({
      file: name,
      title: titleFromMeta(meta, name),
      summary: meta && meta.summary ? String(meta.summary).trim() : '',
      category: meta && meta.category ? String(meta.category).trim() : '',
      date: resolveDate(meta, stats),
      size: stats.size,
    });
  }

  /* 时间倒序：新的在前；同一天则文件名倒序，保证顺序稳定 */
  items.sort((a, b) => (b.date.localeCompare(a.date) || b.file.localeCompare(a.file)));
  return items;
}

function readArticle(name) {
  const full = resolveContentFile(name);
  if (!full) return null;

  const source = fs.readFileSync(full, 'utf8');
  const { meta, body } = splitFrontMatter(source);
  const stats = fs.statSync(full);

  return {
    file: path.basename(full),
    title: titleFromMeta(meta, path.basename(full)),
    summary: meta && meta.summary ? String(meta.summary).trim() : '',
    category: meta && meta.category ? String(meta.category).trim() : '',
    date: resolveDate(meta, stats),
    html: parseMarkdown(body, { resolveNote }),
  };
}

function sendJson(res, status, payload) {
  const buf = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

/* ==================== 文件库：根目录来自 config.json ==================== */

const DEFAULT_CONFIG = {
  _说明: 'sites 里每一项是一个要展示的根，可以是文件夹，也可以是单个文件。path 支持绝对路径（如 D:/资料）或相对本目录的路径（如 files）。文件库只展示 .pdf / .html / .md 三种文件，其余自动隐藏。改完本文件刷新页面即生效，无需重启服务。',
  sites: [{ name: '资料库', path: 'files' }],
};

/* 每次请求都重读配置，改完 config.json 刷新页面即生效 */
function loadConfig() {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, ''));
  } catch (err) {
    /* 最常见的坑：Windows 路径写成反斜杠（D:\资料），反斜杠是 JSON 转义符，整个文件会解析失败 */
    return {
      sites: [],
      tools: [],
      site: {},
      error: 'config.json 解析失败：' + String(err.message).slice(0, 160) + ' —— Windows 路径请用正斜杠，如 D:/资料',
    };
  }

  const list = Array.isArray(cfg.sites) ? cfg.sites : [];
  const sites = list
    .filter((s) => s && typeof s.path === 'string' && s.path.trim())
    .map((s) => {
      const abs = path.resolve(ROOT, s.path.trim());
      let stat = null;
      try {
        stat = fs.statSync(abs);
      } catch {
        /* 路径不存在也要列出来，前端会标成「不可用」 */
      }
      return {
        name: String(s.name || path.basename(abs) || s.path).trim(),
        abs,
        kind: !stat ? 'missing' : stat.isDirectory() ? 'dir' : 'file',
      };
    });

  const tools = (Array.isArray(cfg.tools) ? cfg.tools : [])
    .filter((t) => t && typeof t.url === 'string' && t.url.trim())
    .map((t) => {
      const url = t.url.trim();
      return {
        name: String(t.name || url).trim(),
        desc: t.desc ? String(t.desc).trim() : '',
        url,
        external: /^(https?:\/\/|:)/i.test(url),
      };
    });

  const raw = cfg.site && typeof cfg.site === 'object' ? cfg.site : {};
  const pick = (key) => (typeof raw[key] === 'string' ? raw[key].trim() : '');
  const site = {
    founded: pick('founded'),
    linkName: pick('linkName'),
    linkUrl: pick('linkUrl'),
  };

  return { sites, tools, site, error: '' };
}

function readSites() {
  return loadConfig().sites;
}

function toIndex(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

/* 把 rel 解析到 base 之内；越界（../、绝对路径）返回 null */
function resolveUnder(base, rel) {
  const rootAbs = path.resolve(base);
  const full = path.resolve(rootAbs, rel || '');
  if (full !== rootAbs && !full.startsWith(rootAbs + path.sep)) return null;
  return full;
}

function relJoin(base, name) {
  return base ? base + '/' + name : name;
}

function describe(name, rel, abs) {
  let size = 0;
  let mtime = '';
  try {
    const st = fs.statSync(abs);
    size = st.size;
    mtime = st.mtime.toISOString();
  } catch {
    /* 读不到就留空，不影响列出文件名 */
  }
  return { name, path: rel, ext: path.extname(name).slice(1).toLowerCase(), size, mtime };
}

/* 一级菜单：配置里的全部根 + 各自当前层的文件量 */
function library() {
  const { sites, error } = loadConfig();

  const items = sites.map((site, index) => {
    let dirs = 0;
    let files = 0;
    if (site.kind === 'dir') {
      try {
        for (const e of fs.readdirSync(site.abs, { withFileTypes: true })) {
          if (e.isDirectory()) dirs++;
          else if (e.isFile() && ALLOWED_EXT.has(path.extname(e.name).toLowerCase())) files++;
        }
      } catch {
        /* 无权限，按 0 计 */
      }
    } else if (site.kind === 'file') {
      files = 1;
    }
    const ext = site.kind === 'file' ? path.extname(site.abs).slice(1).toLowerCase() : '';
    return { index, name: site.name, kind: site.kind, ext, dirs, files };
  });

  return { error, items };
}

/* 顶部菜单「工具」：config.json 的 tools，纯跳转，不引入任何服务端新能力 */
function tools() {
  const { tools: list, error } = loadConfig();
  return { error, items: list };
}

/* 文章页侧栏用：站点成立日期与那个跳转链接 */
function siteInfo() {
  const { site, error } = loadConfig();
  return { error, ...site };
}

/* ==================== [[笔记名]] 双链 ==================== */

/* 文件名（去扩展名、小写）→ 页面地址。带缓存，避免每次渲染都全盘扫描 */
let wikiCache = { at: 0, map: null };
const WIKI_TTL = 15000;

function noteIndex() {
  const now = Date.now();
  if (wikiCache.map && now - wikiCache.at < WIKI_TTL) return wikiCache.map;

  const map = new Map();
  const add = (file, url) => {
    const key = file.replace(/\.(md|markdown)$/i, '').toLowerCase();
    if (!map.has(key)) map.set(key, url); /* 同名先到先得 */
  };

  /* content/ 的文章排在最前，同名时优先指向文章页 */
  try {
    for (const name of fs.readdirSync(CONTENT_DIR)) {
      if (/\.(md|markdown)$/i.test(name)) add(name, '/article.html?file=' + encodeURIComponent(name));
    }
  } catch {
    /* 目录不存在就当没有 */
  }

  const walk = (dir, rel, index, depth) => {
    if (depth > 12) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      if (e.name.startsWith('.')) continue;

      const childRel = relJoin(rel, e.name);
      if (e.isDirectory()) {
        walk(path.join(dir, e.name), childRel, index, depth + 1);
      } else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) {
        add(e.name, '/viewer.html?root=' + index + '&path=' + encodeURIComponent(childRel));
      }
    }
  };

  const { sites } = loadConfig();
  sites.forEach((site, index) => {
    if (site.kind === 'file') {
      if (/\.(md|markdown)$/i.test(path.extname(site.abs))) {
        add(path.basename(site.abs), '/viewer.html?root=' + index + '&path=');
      }
    } else if (site.kind === 'dir') {
      walk(site.abs, '', index, 0);
    }
  });

  wikiCache = { at: now, map };
  return map;
}

/* 交给 parseMarkdown 的回调：笔记名 → 页面地址，查不到返回空串（原样显示） */
function resolveNote(name) {
  return noteIndex().get(String(name).trim().toLowerCase()) || '';
}

/* 首页「最近更新」：content 的文章 + config.json 各目录里的文件，按修改时间倒序 */
function recentFiles(limit) {
  const { sites } = loadConfig();
  const seen = new Set();
  const items = [];
  let scanned = 0;

  function push(abs, entry) {
    if (seen.has(abs)) return; /* content 同时被登记进 config 时去重 */
    seen.add(abs);
    items.push(entry);
  }

  function describeRecent(name, rel, stats, siteName, index) {
    return {
      kind: 'file',
      title: name,
      ext: path.extname(name).slice(1).toLowerCase(),
      site: siteName,
      mtime: stats.mtime.toISOString(),
      url: '/viewer.html?root=' + index + '&path=' + encodeURIComponent(rel || ''),
    };
  }

  function walk(dir, rel, siteName, index, depth) {
    if (depth > 12 || scanned >= MAX_SCAN) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      if (e.name.startsWith('.')) continue; /* .obsidian / .git / .trash 一律跳过 */
      scanned++;
      if (scanned > MAX_SCAN) return;

      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, relJoin(rel, e.name), siteName, index, depth + 1);
        continue;
      }
      if (!e.isFile() || !ALLOWED_EXT.has(path.extname(e.name).toLowerCase())) continue;

      let stats;
      try {
        stats = fs.statSync(full);
      } catch {
        continue;
      }
      push(full, describeRecent(e.name, relJoin(rel, e.name), stats, siteName, index));
    }
  }

  /* content/ 顶层的文章 */
  if (fs.existsSync(CONTENT_DIR)) {
    for (const name of fs.readdirSync(CONTENT_DIR)) {
      if (!/\.(md|markdown)$/i.test(name)) continue;
      const full = path.join(CONTENT_DIR, name);
      let stats;
      try {
        stats = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stats.isFile()) continue;
      push(full, {
        kind: 'article',
        title: titleFromMeta(readHeadMeta(full), name),
        mtime: stats.mtime.toISOString(),
        url: '/article.html?file=' + encodeURIComponent(name),
      });
    }
  }

  /* config.json 登记的根：文件夹递归，单个文件直接收 */
  sites.forEach((site, index) => {
    if (site.kind === 'file') {
      let stats;
      try {
        stats = fs.statSync(site.abs);
      } catch {
        return;
      }
      push(site.abs, describeRecent(path.basename(site.abs), '', stats, site.name, index));
    } else if (site.kind === 'dir') {
      walk(site.abs, '', site.name, index, 0);
    }
  });

  items.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return items.slice(0, limit);
}

/* 浏览一层目录：文件夹 + 白名单内的文件 */
function browse(index, rel) {
  const site = readSites()[index];
  if (!site || site.kind === 'missing') return null;

  /* 配置项本身就是单个文件 */
  if (site.kind === 'file') {
    return {
      root: index,
      name: site.name,
      path: '',
      crumbs: [{ name: site.name, path: '' }],
      dirs: [],
      files: [describe(path.basename(site.abs), '', site.abs)],
    };
  }

  const full = resolveUnder(site.abs, rel);
  if (!full) return null;

  let stats;
  try {
    stats = fs.statSync(full);
  } catch {
    return null;
  }
  if (!stats.isDirectory()) return null;

  const dirs = [];
  const files = [];
  try {
    for (const e of fs.readdirSync(full, { withFileTypes: true })) {
      const childRel = relJoin(rel, e.name);
      if (e.isDirectory()) {
        dirs.push({ name: e.name, path: childRel });
      } else if (e.isFile() && ALLOWED_EXT.has(path.extname(e.name).toLowerCase())) {
        files.push(describe(e.name, childRel, path.join(full, e.name)));
      }
    }
  } catch {
    /* 无权限，列成空目录 */
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh'));

  const crumbs = [{ name: site.name, path: '' }];
  let acc = '';
  for (const seg of String(rel || '').split('/')) {
    if (!seg) continue;
    acc = relJoin(acc, seg);
    crumbs.push({ name: seg, path: acc });
  }

  return { root: index, name: site.name, path: rel || '', crumbs, dirs, files };
}

/* 定位到具体文件；越界、目录、非白名单类型都返回 null */
function resolveTarget(index, rel) {
  const site = readSites()[index];
  if (!site || site.kind === 'missing') return null;

  const abs = site.kind === 'file' ? site.abs : resolveUnder(site.abs, rel);
  if (!abs) return null;

  let stats;
  try {
    stats = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!stats.isFile() || !ALLOWED_EXT.has(path.extname(abs).toLowerCase())) return null;
  return abs;
}

function rawUrl(index, rel) {
  return '/raw?root=' + index + '&path=' + encodeURIComponent(rel || '');
}

/* md 解析成 HTML 直接给前端；pdf / html 给出原始字节地址 */
function viewFile(index, rel) {
  const abs = resolveTarget(index, rel);
  if (!abs) return null;

  const ext = path.extname(abs).toLowerCase();
  const name = path.basename(abs);

  if (ext === '.md' || ext === '.markdown') {
    const source = fs.readFileSync(abs, 'utf8');
    const { meta, body } = splitFrontMatter(source);
    return {
      kind: 'markdown',
      name,
      title: titleFromMeta(meta, name),
      date: resolveDate(meta, fs.statSync(abs)),
      html: parseMarkdown(body, { resolveNote }),
    };
  }

  return { kind: ext === '.pdf' ? 'pdf' : 'html', name, url: rawUrl(index, rel) };
}

/* 输出原始字节；PDF 内嵌查看会发 Range 请求，必须支持 206 */
function sendRaw(req, res, filePath) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const total = stats.size;
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = 0;
      let end = total - 1;
      if (m[1] === '') {
        start = Math.max(0, total - Number(m[2] || 0)); /* bytes=-500 取尾部 */
      } else {
        start = Number(m[1]);
        if (m[2] !== '') end = Math.min(Number(m[2]), total - 1);
      }
      if (start > end || start >= total) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + total });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': total,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  if (pathname === '/api/articles') {
    sendJson(res, 200, listArticles());
    return;
  }

  if (pathname === '/api/article') {
    const article = readArticle(url.searchParams.get('file'));
    if (!article) {
      sendJson(res, 404, { error: '文章不存在' });
      return;
    }
    sendJson(res, 200, article);
    return;
  }

  if (pathname === '/api/library') {
    sendJson(res, 200, library());
    return;
  }

  if (pathname === '/api/tools') {
    sendJson(res, 200, tools());
    return;
  }

  if (pathname === '/api/site') {
    sendJson(res, 200, siteInfo());
    return;
  }

  if (pathname === '/api/recent') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 50);
    sendJson(res, 200, { items: recentFiles(limit) });
    return;
  }

  if (pathname === '/api/browse') {
    const data = browse(toIndex(url.searchParams.get('root')), url.searchParams.get('path') || '');
    if (!data) {
      sendJson(res, 404, { error: '目录不存在或未配置' });
      return;
    }
    sendJson(res, 200, data);
    return;
  }

  if (pathname === '/api/view') {
    const data = viewFile(toIndex(url.searchParams.get('root')), url.searchParams.get('path') || '');
    if (!data) {
      sendJson(res, 404, { error: '文件不存在或类型不支持' });
      return;
    }
    sendJson(res, 200, data);
    return;
  }

  if (pathname === '/raw') {
    const file = resolveTarget(toIndex(url.searchParams.get('root')), url.searchParams.get('path') || '');
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    sendRaw(req, res, file);
    return;
  }

  /* 静态文件：根路径落到 index.html，其余限制在 public/ 内 */
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, rel);
  if (target !== PUBLIC_DIR && !target.startsWith(path.resolve(PUBLIC_DIR) + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  sendFile(res, target);
});

/* 启动前确保目录存在，避免首次运行直接报错 */
for (const dir of [PUBLIC_DIR, CONTENT_DIR, path.join(ROOT, 'files')]) {
  fs.mkdirSync(dir, { recursive: true });
}

/* 首次运行补一份配置模板，用户照着改即可 */
if (!fs.existsSync(CONFIG_FILE)) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
  } catch {
    /* 写不了就跳过，服务照常以空配置启动 */
  }
}

/* 默认监听所有网卡，局域网设备可直接访问；只想本机用就 set HOST=127.0.0.1 */
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`文章平台已启动，监听 ${HOST}:${PORT}`);
  console.log(`  本机    http://127.0.0.1:${PORT}/`);

  if (HOST !== '127.0.0.1') {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  局域网  http://${net.address}:${PORT}/   (${name})`);
        }
      }
    }
  }

  console.log(`内容目录： ${CONTENT_DIR}`);
  console.log(`文件库配置： ${CONFIG_FILE}`);
});
