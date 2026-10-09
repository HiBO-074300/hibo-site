/*
 * 轻量 Markdown 解析 —— 够用即可，不引第三方库
 *
 * 支持：front-matter、标题、段落、无序/有序列表、引用、围栏代码块、
 *       分隔线、粗体、斜体、行内代码、链接、图片、表格、单行硬换行
 * 不支持（故意不支持，文章里也别用）：HTML 混排、嵌套列表、Setext 标题
 */

'use strict';

/* ---------------- front-matter ---------------- */

/*
 * 从文本开头切出 YAML 风格的 front-matter。
 * 只支持 key: value 和 key: [a, b] 两种写法，够放标题/日期/分类/摘要。
 */
function splitFrontMatter(source) {
  const text = source.replace(/^\uFEFF/, '');
  const meta = {};

  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { meta, body: text };

  match[1].split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(':');
    if (idx < 1) return;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) return;

    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean).join('、');
    } else {
      value = value.replace(/^["']|["']$/g, '');
    }
    meta[key] = value;
  });

  return { meta, body: text.slice(match[0].length) };
}

/* ---------------- HTML 转义 ---------------- */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 行内语法：代码 > 图片 > 链接 > 粗体 > 斜体 */
function inline(text) {
  let out = escapeHtml(text);

  /* 行内代码先抽出来占位，避免里面的 * _ 被当成强调 */
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  return out.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

function renderTableRow(line, tag) {
  const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  return `<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`;
}

/* ---------------- 块级解析 ---------------- */

function parseMarkdown(source) {
  const lines = String(source).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const html = [];

  let i = 0;
  const isTableSep = (line) => /^\|?[\s:-]*\|[\s|:-]*$/.test(line) && line.includes('-');

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    /* 空行 */
    if (!trimmed) {
      i++;
      continue;
    }

    /* 围栏代码块 */
    const fence = /^```(\w*)\s*$/.exec(trimmed);
    if (fence) {
      const lang = fence[1];
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        body.push(lines[i]);
        i++;
      }
      i++; /* 跳过收尾的 ``` */
      const cls = lang ? ` class="lang-${lang}"` : '';
      html.push(`<pre${cls}><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    /* 分隔线 */
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr>');
      i++;
      continue;
    }

    /* 标题 */
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2].replace(/\s+#+\s*$/, ''))}</h${level}>`);
      i++;
      continue;
    }

    /* 引用（连续 > 视为一块） */
    if (/^>\s?/.test(trimmed)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${parseMarkdown(body.join('\n'))}</blockquote>`);
      continue;
    }

    /* 表格：当前行有 | 且下一行是分隔行 */
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = renderTableRow(trimmed, 'th');
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        rows.push(renderTableRow(lines[i].trim(), 'td'));
        i++;
      }
      html.push(`<table><thead>${head}</thead><tbody>${rows.join('')}</tbody></table>`);
      continue;
    }

    /* 无序列表 */
    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    /* 有序列表 */
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^\d+[.)]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    /* 段落：吃到空行或下一个块级标记为止 */
    const para = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (!cur) break;
      if (/^(#{1,6}\s|>\s?|```|[-*+]\s|\d+[.)]\s)/.test(cur)) break;
      para.push(cur);
      i++;
    }
    if (para.length) {
      /* 单行内的换行用 <br> 保留，其余以空格连接 */
      const text = para.join('\n').replace(/\n/g, ' ');
      html.push(`<p>${inline(text)}</p>`);
    }
  }

  return html.join('\n');
}

module.exports = { parseMarkdown, splitFrontMatter };
