@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1"
set "ARENA_SETUP_EXIT=%errorlevel%"
if not defined ARENA_NO_PAUSE if not defined ARENA_SETUP_NO_PAUSE pause
exit /b %ARENA_SETUP_EXIT%
