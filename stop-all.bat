@echo off
title PassManage Shutdown
echo Stopping PassManage services...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
wsl -d Ubuntu -u root -- service postgresql stop >nul 2>&1
echo All PassManage services stopped.
timeout /t 3
