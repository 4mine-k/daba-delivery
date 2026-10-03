@echo off
title Daba-Delivery
echo Starting Daba-Delivery...
start "" "http://localhost:5173"
node "%~dp0server.js"
pause
