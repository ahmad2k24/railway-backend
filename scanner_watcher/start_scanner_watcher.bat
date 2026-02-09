@echo off
title Corleone Forged - Scanner Watcher
echo.
echo  ========================================
echo   Corleone Forged Scanner Watcher
echo  ========================================
echo.
echo  Starting scanner watcher...
echo  (Press Ctrl+C to stop)
echo.

cd /d "%~dp0"
python scanner_watcher.py

pause
