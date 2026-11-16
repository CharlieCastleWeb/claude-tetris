# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no build, no tests, no linter. README and UI text are in Spanish.

## Run

- `open index.html`, or serve statically: `python3 -m http.server 8000` → http://localhost:8000

## Architecture

Three files: `index.html` (DOM + canvases `#board` 300×600, `#next-canvas` 120×120, `#overlay`), `style.css`, `game.js` (all logic, one global script in strict mode, no modules).

`game.js` details that span functions:
- Board = `ROWS×COLS` matrix; cell `0` empty, `1–7` = piece type. The same index keys `COLORS` and `PIECES` (index 0 is `null`), so adding/changing a piece means editing both arrays in sync and the `randomPiece` range (`Math.random()*7+1`).
- Game state lives in module-level `let` globals (`board, current, next, score, lines, level, paused, gameOver, ...`), reset in `init()`; restart button just calls `init()`.
- Loop: `requestAnimationFrame(loop)` accumulates `dropAccum` vs `dropInterval`; gravity and `lockPiece()` happen there. Pause/game over cancel the rAF (`animId`) and show the overlay; unpause restarts `loop`.
- Lock flow: `lockPiece()` → `merge()` → `clearLines()` (updates score/level/`dropInterval`) → `spawn()` (game over if the new piece collides).
- Scoring: line table × level; hard drop +2/cell, soft drop +1/cell. Speed: `max(100, 1000 − (level−1)×90)` ms.
- Rotation: `rotateCW` + simple kick offsets `[0,-1,1,-2,2]` in `tryRotate` (not SRS). Piece 7-bag is not used (pure random).
- Input: single `keydown` listener (arrows, X, Space, P).
