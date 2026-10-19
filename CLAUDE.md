# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no `package.json`, no build, no tests, no linter. README and UI strings are in Spanish.

## Running

Open `index.html` directly, or serve statically: `python3 -m http.server 8000` → http://localhost:8000.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, `game.js` (all logic, single script, `'use strict'`, global state).

- Global mutable state in `game.js` (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`…), reset by `init()`. Restart button re-calls `init()`.
- Board = `ROWS×COLS` matrix; cell is `0` or color/piece index 1–7, which indexes both `COLORS` and `PIECES` (index 0 is `null` in both).
- Piece = `{type, shape, x, y}`; `shape` is a square matrix whose cells hold the piece index. Rotation via `rotateCW`; `tryRotate` tries x-kicks `[0,-1,1,-2,2]` (no SRS, no floor kicks).
- Game loop: `requestAnimationFrame` `loop` accumulates dt into `dropAccum`; gravity step or `lockPiece()` when `>= dropInterval`. `lockPiece` → `merge` → `clearLines` → `spawn`. `spawn` calls `endGame()` if the new piece collides. Pause/game over cancel the rAF via `animId`.
- Scoring: `LINE_SCORES × level`; soft drop +1/cell, hard drop +2/cell. Level = `floor(lines/10)+1`; `dropInterval = max(100, 1000-(level-1)*90)` — duplicated in `clearLines` and `init` (initial 1000).
- Input: single `keydown` listener (arrows, `X`, Space, `P`). `updateHUD()` is called after every keypress and in scoring paths.

## Gotchas

- Canvas size is hardcoded in `index.html` (`board` 300×600, `next-canvas` 120×120). Changing `COLS`/`ROWS`/`BLOCK` in `game.js` requires updating the canvas `width`/`height` to match (`COLS*BLOCK` × `ROWS*BLOCK`).
- `drawNext` uses its own block size (`NB = 30`) and centers within a 4×4 grid.

## Skins

`SKINS` en `game.js` (`retro`, `neon`, `pastel`, `pixel`): cada una define `colors`, `colorsLight?`, `grid?` y `drawBlock(context, px, py, size, color, alpha)` (px/py en píxeles). `drawBlock(context,x,y,colorIndex,size,alpha)` resuelve paleta (tema + skin) y delega. `applySkin` setea `<html data-skin>` (CSS cambia el fondo de canvas en neon/pastel), persiste `localStorage('skin')` y redibuja vía `applyTheme`. Tecla `S` cicla skins. Draw functions deben resetear `shadowBlur`/`globalAlpha`.
