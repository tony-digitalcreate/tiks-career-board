@echo off
rem Tik's Career Board launcher - starts the server (scans every 4h) and opens the app
cd /d "%~dp0"
start "Tiks Career Board Server" /min node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:3809"
