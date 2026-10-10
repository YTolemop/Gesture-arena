@echo off
setlocal
cd /d "%~dp0"
if not exist logs mkdir logs
node -e "if(process.version!=='v22.19.0'){console.error('Install Node.js 22.19.0 x64');process.exit(1)}" > logs\setup.log 2>&1
if errorlevel 1 goto fail
call npm ci >> logs\setup.log 2>&1
if errorlevel 1 goto fail
call npm run build >> logs\setup.log 2>&1
if errorlevel 1 goto fail
echo Setup complete. Run start_windows.bat
exit /b 0
:fail
type logs\setup.log
echo Setup failed. See logs\setup.log
pause
exit /b 1
