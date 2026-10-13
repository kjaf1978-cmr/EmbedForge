@echo off
rem NETApps Electric Simulation release signing. Double-click this file. Your key stays on your USB stick.
title NETApps Electric Simulation release signing
"%~dp0embedforge-sign.exe" --kit "%~dp0."
