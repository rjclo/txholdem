import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyAction,
  applyAutoAction,
  applyAutoBotAction,
  buildUserHint,
  createInitialGame,
  fastForwardHand,
  hydrateGameState,
  renameUserPlayer,
  serializeGame,
  snapshotForPersistence,
  startNewHand,
  updateTournamentConfig,
  updateUiPreferences,
  updateEnabledStrategies
} from "./src/game.js";
import { debugLogFile, logDebugEvent } from "./src/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const runtimeDataDir = process.env.TXHOLDEM_DATA_DIR
  ? path.resolve(process.env.TXHOLDEM_DATA_DIR)
  : __dirname;
const saveFile = path.join(runtimeDataDir, "game-state.json");
const defaultPort = Number(process.env.PORT || 3000);
let gameState = null;

function summarizeState(state) {
  if (!state) {
    return null;
  }

  return {
    handNumber: state.handNumber,
    street: state.street,
    pot: state.pot,
    dealerSeat: state.dealerSeat,
    smallBlindSeat: state.smallBlindSeat,
    bigBlindSeat: state.bigBlindSeat,
    actionSeat: state.actionSeat,
    userSeat: state.userSeat,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pendingSeats: [...(state.pendingSeats ?? [])],
    communityCards: (state.communityCards ?? []).map((card) => card.code),
    lastAction: state.lastAction,
    players: state.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      stack: player.stack,
      bet: player.bet,
      totalCommitted: player.totalCommitted,
      folded: player.folded,
      isBot: player.isBot,
      hand: (player.hand ?? []).map((card) => card.code),
      streetAction: player.streetAction
    }))
  };
}

async function logStateTransition(eventType, beforeState, afterState, details = {}) {
  await logDebugEvent(eventType, {
    ...details,
    before: summarizeState(beforeState),
    after: summarizeState(afterState)
  });
}

function getSerializeOptions(request) {
  return {
    revealShowdownHandsForFoldedUser: request.headers["x-learning-mode-reveal"] === "true"
  };
}

async function handleStateMutation(request, response, eventType, mutate, details = {}) {
  const beforeState = gameState;

  try {
    const nextState = await mutate();
    gameState = nextState;
    await persistGameState(gameState);
    await logStateTransition(eventType, beforeState, gameState, details);
    return json(response, 200, serializeGame(gameState, getSerializeOptions(request)));
  } catch (error) {
    await logDebugEvent(`${eventType}.error`, {
      ...details,
      error: {
        message: error.message,
        stack: error.stack
      },
      state: summarizeState(beforeState)
    });
    return json(response, 400, { error: error.message });
  }
}

async function ensureRuntimeDataDir() {
  await mkdir(runtimeDataDir, { recursive: true });
}

async function loadGameState() {
  try {
    const contents = await readFile(saveFile, "utf8");
    return hydrateGameState(JSON.parse(contents));
  } catch {
    return createInitialGame();
  }
}

async function persistGameState(state) {
  await writeFile(saveFile, JSON.stringify(snapshotForPersistence(state), null, 2));
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

async function serveStatic(urlPath, response) {
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  const extension = path.extname(filePath);

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    response.end(contents);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && requestUrl.pathname === "/api/game") {
      await logDebugEvent("api.game.read", {
        state: summarizeState(gameState)
      });
      return json(response, 200, serializeGame(gameState, getSerializeOptions(request)));
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/game/hint") {
      try {
        const hint = buildUserHint(gameState);
        await logDebugEvent("api.game.hint", {
          state: summarizeState(gameState),
          hint
        });
        return json(response, 200, hint);
      } catch (error) {
        await logDebugEvent("api.game.hint.error", {
          error: {
            message: error.message,
            stack: error.stack
          },
          state: summarizeState(gameState)
        });
        return json(response, 400, { error: error.message });
      }
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/new-hand") {
      return handleStateMutation(request, response, "api.game.new-hand", () => startNewHand(gameState));
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/reset") {
      return handleStateMutation(
        request,
        response,
        "api.game.reset",
        () => createInitialGame({
          uiPreferences: gameState?.uiPreferences
        })
      );
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/action") {
      const { action, amount } = await readRequestBody(request);
      return handleStateMutation(
        request,
        response,
        "api.game.action",
        () => applyAction(gameState, action, amount),
        { request: { action, amount } }
      );
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/auto-action") {
      return handleStateMutation(request, response, "api.game.auto-action", () => applyAutoAction(gameState));
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/auto-bot-action") {
      return handleStateMutation(request, response, "api.game.auto-bot-action", () => applyAutoBotAction(gameState));
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/fast-forward") {
      return handleStateMutation(request, response, "api.game.fast-forward", () => fastForwardHand(gameState));
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/rename-user") {
      const { name } = await readRequestBody(request);
      return handleStateMutation(
        request,
        response,
        "api.game.rename-user",
        () => renameUserPlayer(gameState, name),
        { request: { name } }
      );
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/strategies") {
      const { enabledStrategyIds } = await readRequestBody(request);
      return handleStateMutation(
        request,
        response,
        "api.game.strategies",
        () => updateEnabledStrategies(gameState, enabledStrategyIds),
        { request: { enabledStrategyIds } }
      );
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/tournament-config") {
      const { tournament } = await readRequestBody(request);
      return handleStateMutation(
        request,
        response,
        "api.game.tournament-config",
        () => updateTournamentConfig(gameState, tournament),
        { request: { tournament } }
      );
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/game/ui-preferences") {
      const { uiPreferences } = await readRequestBody(request);
      return handleStateMutation(
        request,
        response,
        "api.game.ui-preferences",
        () => updateUiPreferences(gameState, uiPreferences),
        { request: { uiPreferences } }
      );
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/log-ui") {
      try {
        const event = await readRequestBody(request);
        await logDebugEvent("ui.event", event);
        return json(response, 200, { ok: true });
      } catch (error) {
        return json(response, 400, { error: error.message });
      }
    }

    if (request.method === "GET") {
      return serveStatic(requestUrl.pathname, response);
    }

    return json(response, 405, { error: "Method not allowed" });
  });
}

export async function startServer(port = defaultPort) {
  await ensureRuntimeDataDir();
  gameState = await loadGameState();
  await persistGameState(gameState);

  const server = createAppServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  await logDebugEvent("server.started", {
    port: actualPort,
    saveFile,
    debugLogFile,
    initialState: summarizeState(gameState)
  });

  return {
    server,
    port: actualPort,
    stop: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    })
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().then(({ port }) => {
    console.log(`Texas Hold'em app running at http://localhost:${port}`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
