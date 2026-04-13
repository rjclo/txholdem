# TX Holdem

Texas Hold'em table app with two ways to run:

- desktop app mode on macOS via Electron
- browser mode via the local Node server

## Requirements

- Node.js 18+ recommended
- macOS for the desktop app build and packaged `.app`

## Preferred: Run As A Mac App

From this folder:

```bash
cd /Users/rlo/Documents/txholdem
npm install
npm run desktop
```

This launches the game in its own desktop window and starts the local backend automatically.

## Build A macOS App

To generate a distributable macOS app bundle:

```bash
cd /Users/rlo/Documents/txholdem
npm install
npm run dist:mac
```

Build output is written to `dist/`.

## Browser Mode

If you want to run it in a browser instead:

```bash
cd /Users/rlo/Documents/txholdem
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## Development Mode

To run the backend with automatic restart on server-side file changes:

```bash
cd /Users/rlo/Documents/txholdem
npm run dev
```

## Current Features

- 8-seat Texas Hold'em table
- cash game and tournament mode
- tournament field size from 8 to 100 players
- blind level clock, action clock, and time bank
- off-table bot simulation with table refills
- bot strategy system with:
  - one basic style per hand
  - optional medium and advanced modifiers
- showdown hand reveal for all non-folded players
- tournament finish screen with champion and top 3 podium
- floating Settings, Standings, and Hint panels
- odds and ICM-aware hint panel

## Save Data And Logs

- Browser mode saves state to `game-state.json` in this project folder.
- Desktop app mode saves state and logs in the app runtime data folder.
- Debug logs are written to `logs/game-debug.jsonl` in the active runtime data directory.

## Main Commands

```bash
npm run desktop
npm run dist:mac
npm start
npm run dev
```

## Main Files

- `electron/main.js`: desktop app bootstrap
- `server.js`: HTTP server and API routes
- `src/game.js`: game engine, betting flow, showdown logic, tournament handling
- `src/strategy.js`: bot strategy selection and action logic
- `public/index.html`: UI structure
- `public/app.js`: client behavior
- `public/styles.css`: table and panel styling
