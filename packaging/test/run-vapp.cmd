@echo off
rem VAPP-03/04/05 on an installed EmbedForge (Windows). Right-click this file and choose
rem "Run as administrator". The result is also written to vapp-result.txt next to it.
"%ProgramFiles%\EmbedForge\embedforge-app\bin\embedforge-setup.exe" vapp --package "%~dp0usb-update" > "%~dp0vapp-result.txt" 2>&1
type "%~dp0vapp-result.txt"
pause
