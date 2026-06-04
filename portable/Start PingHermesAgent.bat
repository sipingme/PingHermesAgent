@echo off
setlocal EnableExtensions

rem PingHermesAgent Portable launcher (Windows)
rem Double-click on USB to start with data stored in this folder.

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "DATA=%ROOT%\data"
set "HERMES=%DATA%\hermes"
set "DESKTOP_UD=%DATA%\desktop"

if not exist "%HERMES%\home" mkdir "%HERMES%\home"
if not exist "%HERMES%\logs" mkdir "%HERMES%\logs"
if not exist "%DESKTOP_UD%" mkdir "%DESKTOP_UD%"

set "PINGHERMESAGENT_PORTABLE=1"
set "PINGHERMESAGENT_OFFLINE=1"
set "PINGHERMESAGENT_PORTABLE_ROOT=%ROOT%"
set "HERMES_HOME=%HERMES%"
set "HERMES_DESKTOP_USER_DATA_DIR=%DESKTOP_UD%"
set "USERPROFILE=%HERMES%\home"

set "APP="
if exist "%ROOT%\win\PingHermesAgent.exe" set "APP=%ROOT%\win\PingHermesAgent.exe"
if not defined APP if exist "%ROOT%\PingHermesAgent.exe" set "APP=%ROOT%\PingHermesAgent.exe"

if defined APP (
  start "" "%APP%"
  exit /b 0
)

echo PingHermesAgent.exe not found.
echo Copy the Windows build to win\PingHermesAgent.exe or place PingHermesAgent.exe next to this script.
echo See README.txt
pause
exit /b 1
