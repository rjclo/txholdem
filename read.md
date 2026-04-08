# Texas Hold'em Local Run Guide

## Requirements

- Node.js 18+ recommended

## Run Locally

From this folder:

```bash
cd /Users/rlo/Documents/txholdem
npm start
```

Then open:

```text
http://localhost:3000
```

## Development Mode

To run with automatic restart on backend file changes:

```bash
cd /Users/rlo/Documents/txholdem
npm run dev
```

## Notes

- The app serves both the backend API and frontend UI from `server.js`.
- Game state is autosaved to `game-state.json`.
- Debug logs are written to `logs/game-debug.jsonl`.
- If you want a fresh session, use the `Reset Game` button in the UI.

## Main Files

- `server.js`: HTTP server and API routes
- `src/game.js`: game engine, betting flow, showdown logic, hint calculations
- `src/strategy.js`: bot strategies
- `public/index.html`: page structure
- `public/app.js`: client UI logic
- `public/styles.css`: table and panel styling
