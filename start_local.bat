@echo off
setlocal
cd /d "%~dp0"
call start_windows.bat
exit /b %errorlevel%
