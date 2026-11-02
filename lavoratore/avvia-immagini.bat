@echo off
rem Il PC delle immagini di Wesion: prende i post senza foto e le fa con ComfyUI.
rem ComfyUI deve essere acceso. Chiudi questa finestra per fermarlo.
title Wesion - immagini con ComfyUI
cd /d "%~dp0.."
node --env-file=lavoratore\.env.lavoratore lavoratore\immagini.mjs
pause
