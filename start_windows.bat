@echo off
setlocal
cd /d "%~dp0"
if not exist ".local\node-v22.19.0-win-x64\node.exe" (
 echo Preparing the local runtime. First launch requires internet access.
 set "ARENA_SETUP_NO_PAUSE=1"
 call setup_windows.bat
 if errorlevel 1 (
  if not defined ARENA_NO_PAUSE pause
  exit /b 1
 )
)
if exist ".local\node-v22.19.0-win-x64\node.exe" set "PATH=%~dp0.local\node-v22.19.0-win-x64;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js 22.19.0 is required. The local runtime was not found.
 if not defined ARENA_NO_PAUSE pause
 exit /b 1
)
node scripts\start-local.mjs
set "ARENA_START_EXIT=%errorlevel%"
if not "%ARENA_START_EXIT%"=="0" if not defined ARENA_NO_PAUSE pause
exit /b %ARENA_START_EXIT%
