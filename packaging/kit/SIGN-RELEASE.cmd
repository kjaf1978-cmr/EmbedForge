@echo off
rem EmbedForge release signing. Double-click this file. Your key stays on your USB stick.
title EmbedForge release signing
"%~dp0embedforge-sign.exe" --kit "%~dp0."
