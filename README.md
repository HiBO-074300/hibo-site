# HiBO 文章平台

Markdown 文章展示平台。文章 = `content/` 目录下的 `.md` 文件，**无需维护索引文件**，放进目录、刷新页面就有。

## 启动

双击 `start.bat`（默认端口 80）。**服务在后台运行，脚本窗口起完就自己关掉**，启动信息写在 `server.log` 里。

命令行启动：

```bash
cd path/to/hibo-site
$env:PORT=80; node server.js
```

浏览器打开 <http://127.0.0.1/>。服务默认监听所有网卡，**局域网设备也能访问**——把地址里的 `127.0.0.1` 换成本机局域网 IP 即可（如 `http://192.168.1.100/`）。

- 停止：双击 `stop.bat`
- 只想本机用：`set HOST=127.0.0.1 && start.bat`
- 局域网连不上，多半是防火墙：右键以管理员身份运行 `firewall.bat` 放行一次即可

## 端口

默认 **80**。这里有个坑：**IIS（W3SVC 服务）在跑的时候，80 会被系统的 http.sys 占住**，本服务起不来——启动脚本检测到端口占用会直接提示，不会硬启。

两个选择：

- 让出 80：管理员命令行执行 `net stop W3SVC`（会连带停掉排版台 `editor.html`），想彻底就再 `sc config W3SVC start= demand` 改成手动启动
- 换个端口：`set PORT=9090 && start.bat`，停止时也要带同一个端口：`set PORT=9090 && stop.bat`

## 目录结构

```
├─ server.js              Node 原生 http 服务（零第三方依赖）
├─ config.example.json    配置模板，复制为 config.json 后修改
├─ lib\markdown.js        轻量 Markdown 解析器
├─ public\                前端页面 + style.css / theme.js / panel.js
│                         另含排版台 editor.html、工作台 WorkTable.html
├─ content\               文章目录，只认 .md 与 .markdown
├─ files\                 文件库默认目录，放 PDF / HTML / MD
├─ start.bat / stop.bat   双击启动 / 停止（后台运行）
└─ firewall.bat           局域网访问需放行防火墙（右键以管理员身份运行）

首次运行会自动生成一份 `config.json`（默认只登记 `files/` 目录），想自定义就照 `config.example.json` 改。
```

## 写文章

在 `content/` 新建 `.md`，开头写 front-matter：

```markdown
---
title: 文章标题
date: 2026-10-09
category: 技术文章
summary: 一句话摘要，显示在列表页。
---

正文从这里开始。
```

- **文件名用小写字母、数字、连字符**，如 `2026-10-09-hello.md`。中文标题写进 `title` 字段——这样能避开中文文件名在 URL 里被拦截的老问题（IIS 会返回 404.11）。
- `date` 可省略，省略时按**文件修改时间**排序。所以改一下文件，列表顺序就变了。
- 列表按时间**倒序**排列，最新的在最上面。

## 支持的 Markdown 语法

标题、段落、无序/有序列表、引用、围栏代码块（带语言高亮 class）、分隔线、粗体、斜体、行内代码、链接、图片、表格、单行内换行。

不支持（别用）：HTML 混排、嵌套列表、Setext 标题。

## 文件库

导航里的「文件库」（`/files.html`）用来按目录浏览散装资料，展示哪些目录由 `config.json` 决定。每一项可以是一个文件夹，也可以是一个文件：

```json
{
  "sites": [
    { "name": "资料库", "path": "files" },
    { "name": "排版成品", "path": "D:/uploads" }
  ]
}
```

- `path` 支持绝对路径（`D:/资料`）或相对本目录的路径（`files`）
- **Windows 路径必须用正斜杠**：写成 `"D:\资料"` 会让整个 `config.json` 解析失败（反斜杠是 JSON 的转义符），文件库会直接提示配置错误
- **改完 `config.json` 刷新页面即生效**，不需要重启服务
- 只看得到 `.pdf`、`.html`、`.md` 三种文件，其余自动隐藏，也无法通过接口读到
- 一级菜单列出全部 `sites`，点文件夹逐级进入，点文件跳到预览页
- 预览方式：`.md` 直接排版渲染；`.html`、`.pdf` 用 iframe 内嵌。html 里的相对路径资源可能缺失，可点「新窗口打开」看完整效果

## 首页

首页列的不是全部文章，而是**最近更新的 10 条**——`content/` 的文章，加上 `config.json` 里所有目录（含子目录）中的 PDF / HTML / MD，统一按文件的修改时间倒序。点文章进文章页，点资料进文件库预览页。

- 只认文件系统的**修改时间**，不看 front-matter 的 `date`
- `.` 开头的隐藏目录（`.obsidian`、`.git`、`.trash` 等）不参与扫描
- 条数由 `/api/recent?limit=N` 控制（1–50），改默认值就改 `index.html` 里的 `limit=10`

## 工具

顶部导航的「工具」（`/tools.html`）是一个可自由扩展的入口页，内容来自 `config.json` 的 `tools`，加一项就多一个：

```json
{
  "tools": [
    { "name": "工作日志", "desc": "本机 5000 端口上的日志系统", "url": ":5000/" },
    { "name": "排版台", "desc": "文章排版与导出", "url": ":80/editor.html" },
    { "name": "站内页面", "url": "/some-page.html" }
  ]
}
```

- `url` 以 `/` 开头 → 站内路径，**当前页**跳转，可以指向站点里的 html，也可以是文件库里某个文件的预览地址
- `url` 以 `:` 开头 → **当前访问的主机 + 该端口**，**新标签页**打开。如 `:5000/` 在本机访问时是 `http://127.0.0.1:5000/`，换成局域网 IP 访问会自动跟着变，配置里不必出现 IP
- `url` 以 `http://` / `https://` 开头 → 完整外链，**新标签页**打开
- `desc` 可省略，省略时外链显示域名、站内显示路径
- 同样**改完刷新即生效**，不需要重启

## 界面

- **明暗主题**：导航栏右上角的太阳 / 月亮按钮切换，选择记在浏览器里（`localStorage`），首次访问跟随系统偏好，全站共用（`public/theme.js`）。
- **左侧栏**：**每个页面都有**（`public/panel.js` + 一个 `<aside class="side" id="side">`）。上方是 24 小时制翻牌时钟——数字分上下半、**从中轴翻转**，精确到秒；中间是当月日历并高亮今天；下方是 `HiBO / 建立 N 天`，点它跳到配置的链接。

侧栏内容来自 `config.json` 的 `site`：

```json
{
  "site": {
    "founded": "2026-01-19",
    "linkName": "关于 HiBO",
    "linkUrl": "/about.html"
  }
}
```

- `founded`：成立日期，决定「建立 N 天」（成立当天算第 1 天）；留空则整块不显示
- `linkName`：天数块悬停时的提示；`linkUrl`：点击后去哪

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/recent?limit=10` | 首页「最近更新」：content 文章 + config 目录，按修改时间倒序 |
| GET | `/api/tools` | 工具页的入口列表（`config.json` 的 `tools`） |
| GET | `/api/site` | 文章页侧栏的站点信息（`config.json` 的 `site`） |
| GET | `/api/articles` | 扫描 `content/`，返回文章列表（时间倒序） |
| GET | `/api/article?file=xxx.md` | 返回 `{file,title,summary,category,date,html}` |
| GET | `/api/library` | 文件库一级菜单，`config.json` 里的全部根 |
| GET | `/api/browse?root=0&path=sub` | 浏览一层目录，只列 PDF / HTML / MD |
| GET | `/api/view?root=0&path=a.md` | 取文件内容：md 转 HTML，pdf/html 给原始地址 |
| GET | `/raw?root=0&path=a.pdf` | 输出文件原始字节，支持 Range（PDF 内嵌需要） |

接口全部只读，没有任何写入能力。

## 迁移说明

当前零依赖，只用到 Node 内置模块，换到别的平台（Python/Go/云函数）时：
- 文章数据全部在 `content/*.md`，直接搬走即可
- `lib/markdown.js` 的 `parseMarkdown` 是纯函数，逻辑可原样移植
- 前端三个页面是纯静态 HTML，改一下接口地址就能复用

## 安全

- 只读接口，不接受 POST
- 文件名先 `path.basename` 再校验扩展名，并确认解析后的路径仍在 `content/` 内，防目录穿越
- 静态文件限制在 `public/` 内
- 文件库的目标路径解析后必须仍落在 `config.json` 登记的目录内，扩展名限 `.pdf` / `.html` / `.md`
- Markdown 输出统一做 HTML 转义，避免脚本注入
