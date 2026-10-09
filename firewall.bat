@echo off
chcp 65001 >nul
title HiBO 防火墙放行

rem 需以管理员身份运行：右键本文件 -> 以管理员身份运行
net session >nul 2>&1
if errorlevel 1 (
  echo [错误] 需要管理员权限。
  echo        请右键本文件，选择「以管理员身份运行」。
  echo.
  pause
  exit /b 1
)

if not defined PORT set PORT=80

netsh advfirewall firewall show rule name="HiBO Web %PORT%" >nul 2>&1
if not errorlevel 1 (
  echo [跳过] 规则 "HiBO Web %PORT%" 已存在，无需重复添加。
) else (
  netsh advfirewall firewall add rule name="HiBO Web %PORT%" dir=in action=allow protocol=TCP localport=%PORT% profile=private
  if errorlevel 1 (
    echo [失败] 添加规则出错。
  ) else (
    echo [完成] 已放行 TCP %PORT% 入站（专用网络）。
  )
)

echo.
echo 以下是可供局域网设备访问的地址，取其中的局域网网卡：
echo.
ipconfig | findstr /i "IPv4"
echo.
echo 形如: http://192.168.x.x:%PORT%/
echo.
pause
