@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
if errorlevel 1 (
  echo.
  echo JUNYX failed to stop. Review the error above.
  pause
  exit /b 1
)
echo JUNYX stopped.
endlocal
