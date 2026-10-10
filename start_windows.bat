@echo off
setlocal
cd /d "%~dp0"
if not exist dist\web\index.html (
 echo Missing build. Run setup_windows.bat first.
 pause
 exit /b 1
)
call npm start
if errorlevel 1 pause
