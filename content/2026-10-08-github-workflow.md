---
title: 从零到 GitHub 的完整流程 + 常见问题排雷手册
date: 2026-10-08
category: 技术文章
summary: 从配置身份到 push 授权的完整照抄流程，外加 10 个高频报错的排查表。
---

# 从零到 GitHub 的完整流程 + 常见问题排雷手册

## 一、完整标准流程（照抄版）

### 第 1 步：配置 Git 身份（只需一次）

```bash
git config --global user.name "你的用户名"
git config --global user.email "你的邮箱"
```

验证：

```bash
git config --global --list
```

### 第 2 步：在 GitHub 上创建仓库

1. 登录 github.com → 右上角 + → New repository
2. Repository name 填 `wechat-paibantai`
3. 选 Public 或 Private
4. ⚠️ 不要勾选 Add README / .gitignore / License（本地已有）
5. 点 Create repository
6. 复制仓库地址：`https://github.com/你的用户名/wechat-paibantai.git`

### 第 3 步：本地初始化 + 关联

```bash
cd 你的项目目录
git init
git remote add origin https://github.com/你的用户名/wechat-paibantai.git
```

⚠️ 如果报 `remote origin already exists`：

```bash
git remote remove origin
git remote add origin https://github.com/你的用户名/wechat-paibantai.git
```

验证：

```bash
git remote -v
```

### 第 4 步：忽略不需要的文件

```bash
echo ".encoding-probe.txt" >> .gitignore
echo ".tmp-diag.html" >> .gitignore
echo ".tmp-shot.html" >> .gitignore
```

### 第 5 步：暂存 → 提交 → 推送

```bash
git add .
git status          # 确认看到 new file: 列表
git commit -m "first commit"
git branch -M main
git push -u origin main
```

### 第 6 步：浏览器授权

push 时弹出浏览器 → 登录 GitHub → 点 Authorize → 完成。

## 二、常见问题排雷手册

### 问题 1：`fatal: not in a git directory`

| 原因 | 解决 |
|---|---|
| 不在 Git 仓库里就执行了 `git config` | 加 `--global`，或先 `cd` 到项目目录再 `git init` |

### 问题 2：`remote origin already exists`

| 原因 | 解决 |
|---|---|
| 之前已经关联过 origin | `git remote remove origin` 再重新 add，或 `git remote set-url origin 正确地址` |

### 问题 3：`nothing added to commit but untracked files present`

| 原因 | 解决 |
|---|---|
| `git add` 没生效，或 add 的文件不存在 | 用 `git add .` 一次性加所有，再 `git status` 确认 |

### 问题 4：`src refspec main does not match any`

| 原因 | 解决 |
|---|---|
| 本地没有任何 commit | 先 `git add .` → `git commit -m "xxx"` |

### 问题 5：`remote: Repository not found.`

| 原因 | 解决 |
|---|---|
| 仓库不存在 / 用户名写错 / 没权限 | 检查 `git remote -v` 里的地址，确认 GitHub 上仓库真的存在 |
| ⚠️ 最常见的坑：用户名拼错 | `HiBO` vs `HiBO-074300` ← 你今天踩的就是这个 |

### 问题 6：push 时认证失败

| 原因 | 解决 |
|---|---|
| 用了 GitHub 登录密码 | GitHub 不支持密码 push，要用 Personal Access Token |
| 不知道 Token 在哪 | Settings → Developer settings → Personal access tokens → Tokens(classic) → 勾 repo → Generate |

### 问题 7：`TLS certificate verification has been disabled`

| 原因 | 解决 |
|---|---|
| 电脑上 Git/代理/杀毒关了 HTTPS 证书校验 | 不影响推送功能；想修就 `git config --global http.sslVerify true` |

### 问题 8：GitHub 页面显示 "This repository is empty"

| 原因 | 解决 |
|---|---|
| 本地没 commit 就 push 了 | `git log --oneline` 确认有提交记录 |
| 推了但推到错误仓库 | `git remote -v` 检查地址 |
| 推的是空分支 | 确认 `git status` 里有文件，`git commit` 成功 |

### 问题 9：`git add README.md` 后 `git status` 里没它

| 原因 | 解决 |
|---|---|
| 文件已被 .gitignore 忽略 | `cat .gitignore` 检查 |
| 文件已在暂存区/已跟踪 | `git ls-files README.md` 确认 |
| 文件实际不存在 | `dir README.md` 确认 |

### 问题 10：push 后 GitHub 上文件不全

| 原因 | 解决 |
|---|---|
| 有些文件被 .gitignore 排除了 | 正常行为，检查 `.gitignore` |
| 只 add 了部分文件 | 用 `git add .` 重新加，再 commit + push |

## 三、日常开发常用命令速查

```bash
git status              # 看当前状态
git add .               # 暂存所有改动
git commit -m "说明"     # 提交
git push                # 推送到远程
git pull                # 拉取远程更新
git log --oneline       # 看提交历史
git branch              # 看当前分支
git checkout -b 分支名  # 建新分支并切换
```

## 四、一句话口诀

> init → remote add → .gitignore → add → commit → push

中间任何一步报错，先跑 `git status` + `git remote -v`，80% 的问题一眼就能定位。
