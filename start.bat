@echo off
chcp 65001 >nul
if not defined PORT set PORT=80

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 node 命令，请先安装 Node.js 并加入 PATH
  pause & exit /b 1
)

netstat -ano | findstr "LISTENING" | findstr ":%PORT%" >nul
if not errorlevel 1 (
  echo [提示] 端口 %PORT% 已被占用，服务起不来。
  echo        看是谁占的：netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"
  echo        换端口运行：set PORT=9090 ^&^& start.bat
  echo.
  pause
  exit /b 1
)

echo 正在后台启动 HiBO 文章平台（端口 %PORT%）...

rem 用独立进程跑，窗口隐藏，脚本自己退出不留窗口
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden -RedirectStandardOutput '%~dp0server.log' -RedirectStandardError '%~dp0server.err'"

timeout /t 2 /nobreak >nul

netstat -ano | findstr "LISTENING" | findstr ":%PORT%" >nul
if errorlevel 1 (
  echo [失败] 服务没起来，错误信息如下：
  if exist "%~dp0server.err" type "%~dp0server.err"
  if exist "%~dp0server.log" type "%~dp0server.log"
  echo.
  pause
  exit /b 1
)

echo [成功] 已在后台运行，本窗口会自动关闭。
echo.
if exist "%~dp0server.log" type "%~dp0server.log"
echo.
echo 停止服务：双击 stop.bat
timeout /t 6 /nobreak >nul
