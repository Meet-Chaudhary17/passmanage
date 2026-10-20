@echo off
title PassManage Launcher
echo ===================================================
echo   Starting PassManage Full Security Stack
echo ===================================================

echo [1/4] Starting PostgreSQL Database in WSL...
start "PassManage - 1. PostgreSQL DB" powershell -NoExit -Command "wsl -d Ubuntu -u root -- bash -c 'pg_ctlcluster 18 main start && pg_lsclusters && tail -f /dev/null'"

timeout /t 3 /nobreak >nul

echo [2/4] Starting Python Biometric Face Service...
start "PassManage - 2. Face Service (Port 8000)" powershell -NoExit -Command "cd C:\24BBS0147\passmanage\face-service; .\venv\Scripts\python.exe main.py"

timeout /t 5 /nobreak >nul

echo [3/4] Starting Node.js Backend API...
start "PassManage - 3. Backend API (Port 5000)" powershell -NoExit -Command "cd C:\24BBS0147\passmanage\backend; node src/index.js"

timeout /t 3 /nobreak >nul

echo [4/4] Starting React Frontend UI...
start "PassManage - 4. React Frontend (Port 5173)" powershell -NoExit -Command "cd C:\24BBS0147\passmanage\frontend; npm run dev"

echo.
echo ===================================================
echo   All 4 services are running continuously!
echo   Open Chrome at: http://localhost:5173
echo ===================================================
timeout /t 5
