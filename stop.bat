@echo off
chcp 65001 >nul
if not defined PORT set PORT=80
cd /d "%~dp0"

echo 正在停止端口 %PORT% 上的服务...

powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort %PORT% -State Listen -EA SilentlyContinue|Select -First 1;if(-not $c){Write-Host '  没有服务在运行';exit};$p=Get-Process -Id $c.OwningProcess -EA SilentlyContinue;if($p -and $p.ProcessName -eq 'node'){Stop-Process -Id $p.Id -Force;Write-Host ('  已停止，PID '+$p.Id)}elseif($p){Write-Host ('  拒绝：端口被 '+$p.ProcessName+' 占用，非 Node 进程')}else{Write-Host '  找不到进程'}"

echo.
pause
