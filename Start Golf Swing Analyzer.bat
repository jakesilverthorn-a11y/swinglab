@echo off
setlocal
cd /d "%~dp0"
title Golf Swing Analyzer

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist node_modules goto run
echo First run: installing the app. This takes a minute or two and needs an internet connection.
echo.
call npm install
if errorlevel 1 goto failed

:run
echo.
echo Starting the Golf Swing Analyzer at http://localhost:5173
echo Leave this window open while you use it. Close it to stop the app.
echo.
call npm run dev -- --host localhost --open
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
