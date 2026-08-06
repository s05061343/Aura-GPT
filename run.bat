@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1"
if errorlevel 1 (
  echo.
  echo Aura-GPT failed to start. Review the error above.
  pause
  exit /b 1
)
endlocal
