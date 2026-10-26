@echo off
setlocal
cd /d "%~dp0"
title Golf Swing Analyzer (iPhone mode)

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist node_modules goto run
echo First run: installing the app. This takes a minute or two and needs an internet connection.
echo.
call npm install
if errorlevel 1 goto failed

:run
echo.
echo Starting the Golf Swing Analyzer so your iPhone can reach it.
echo.
echo   1. Your iPhone must be on the same Wi-Fi as this computer.
echo   2. When Windows asks about the firewall, allow Node.js on PRIVATE networks only.
echo   3. Below, find the line that starts with "Network:" and open that address in Safari on your iPhone.
echo      If there are several, use the one that looks like 192.168.x.x or 10.x.x.x.
echo.
echo Leave this window open while you use it. Close it to stop the app.
echo.
call npm run dev -- --host
goto end

:nonode
echo Node.js was not found on this computer.
echo Install the LTS version from https://nodejs.org, or run:  winget install OpenJS.NodeJS.LTS
echo Then double-click this file again.
goto end

:failed
echo.
echo The install did not finish. Read the messages above, then double-click this file to try again.

:end
echo.
pause
