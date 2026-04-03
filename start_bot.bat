@echo off
chcp 65001 >nul
title MyCash Bot
cd /d E:\Arhiv\projects\MyCash
echo ===========================
echo    MyCash Bot
echo ===========================
echo.
echo Press Ctrl+C to stop
echo.
python bot.py
pause
