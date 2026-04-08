const seatsContainer = document.querySelector("#seats");
const communityCardsContainer = document.querySelector("#community-cards");
const boardElement = document.querySelector(".board");
const tableElement = document.querySelector(".table");
const streetLabel = document.querySelector("#street-label");
const potLabel = document.querySelector("#pot-label");
const potBreakdown = document.querySelector("#pot-breakdown");
const lastActionLabel = document.querySelector("#last-action");
const userSeatBanner = document.querySelector("#user-seat-banner");
const settingsPanel = document.querySelector("#settings-panel");
const standingsPanel = document.querySelector("#standings-panel");
const hintPanel = document.querySelector("#hint-panel");
const standingsList = document.querySelector("#standings-list");
const settingsToggle = document.querySelector("#settings-toggle");
const standingsToggle = document.querySelector("#standings-toggle");
const hintToggle = document.querySelector("#hint-toggle");
const hintRefreshButton = document.querySelector("#hint-refresh");
const hintStatus = document.querySelector("#hint-status");
const hintEquity = document.querySelector("#hint-equity");
const hintHandLabel = document.querySelector("#hint-hand-label");
const hintOpponents = document.querySelector("#hint-opponents");
const hintMadeThreats = document.querySelector("#hint-made-threats");
const hintDrawThreats = document.querySelector("#hint-draw-threats");
const playerNameForm = document.querySelector("#player-name-form");
const playerNameInput = document.querySelector("#player-name-input");
const playerNameSave = document.querySelector("#player-name-save");
const strategyForm = document.querySelector("#strategy-form");
const strategyMenu = document.querySelector("#strategy-menu");
const strategySave = document.querySelector("#strategy-save");
const showBotStrategiesCheckbox = document.querySelector("#show-bot-strategies");
const turnSummary = document.querySelector("#turn-summary");
const newHandButton = document.querySelector("#new-hand-button");
const resetGameButton = document.querySelector("#reset-game-button");
const autoActionButton = document.querySelector("#auto-action-button");
const foldButton = document.querySelector("#fold-button");
const checkButton = document.querySelector("#check-button");
const callButton = document.querySelector("#call-button");
const allInButton = document.querySelector("#all-in-button");
const raiseButton = document.querySelector("#raise-button");
const raiseAmountInput = document.querySelector("#raise-amount");
const autoPlayBotsCheckbox = document.querySelector("#auto-play-bots");
const slowModeBotsCheckbox = document.querySelector("#slow-mode-bots");
const nextBotActionButton = document.querySelector("#next-bot-action-button");
const seatTemplate = document.querySelector("#seat-template");
const cardTemplate = document.querySelector("#card-template");

const ROLE_LABELS = {
  dealer: "Dealer",
  "small-blind": "Small Blind",
  "big-blind": "Big Blind",
  "to-act": "To Act",
  folded: "Folded",
  "all-in": "All In"
};

const UI_PREFERENCE_KEYS = {
  slowModeBots: "txholdem.slowModeBots",
  showBotStrategies: "txholdem.showBotStrategies",
  settingsCollapsed: "txholdem.settingsCollapsed",
  standingsCollapsed: "txholdem.standingsCollapsed",
  hintCollapsed: "txholdem.hintCollapsed",
  settingsPanelLayout: "txholdem.settingsPanelLayout",
  standingsPanelLayout: "txholdem.standingsPanelLayout",
  hintPanelLayout: "txholdem.hintPanelLayout"
};

const FLOATING_PANEL_LIMITS = {
  minWidth: 220,
  minHeight: 120,
  collapsedSize: 58,
  margin: 8
};

let currentGame = null;
let autoPlayTimer = null;
let requestInFlight = false;
let settingsCollapsed = false;
let standingsCollapsed = false;
let hintCollapsed = true;
let strategyFormDirty = false;
let showBotStrategies = false;
let manualFocusedSeat = null;
let boardFocused = false;
let strategySaveInFlight = false;
let slowModeBots = false;
let hintData = null;
let hintRequestInFlight = false;
let hintError = null;
let lastHintContextRequested = null;
let panelLayouts = {
  settings: null,
  standings: null,
  hint: null
};

function loadStoredObjectPreference(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function saveObjectPreference(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures and keep the in-memory preference.
  }
}

function getDisplayFocusedSeat(game = currentGame) {
  if (boardFocused) {
    return null;
  }

  if (manualFocusedSeat !== null) {
    return manualFocusedSeat;
  }

  return game?.actionSeat ?? null;
}

function loadStoredBooleanPreference(key, fallback = false) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function saveBooleanPreference(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures and keep the in-memory preference.
  }
}

function summarizeClientGame(game = currentGame) {
  if (!game) {
    return null;
  }

  return {
    handNumber: game.handNumber,
    street: game.street,
    pot: game.pot,
    actionSeat: game.actionSeat,
    userSeat: game.userSeat,
    currentBet: game.currentBet,
    currentTurn: game.currentTurn
      ? {
          seat: game.currentTurn.seat,
          name: game.currentTurn.name,
          isBot: game.currentTurn.isBot,
          toCall: game.currentTurn.toCall,
          legalActions: [...game.currentTurn.legalActions]
        }
      : null,
    communityCards: (game.communityCards ?? []).map((card) => card.code),
    lastAction: game.lastAction
  };
}

function logUiEvent(eventType, details = {}) {
  const payload = {
    eventType,
    details,
    uiState: {
      slowModeBots,
      autoPlayBots: autoPlayBotsCheckbox.checked,
      settingsCollapsed,
      standingsCollapsed,
      hintCollapsed,
      panelLayouts,
      focusedSeat: getDisplayFocusedSeat(),
      manualFocusedSeat,
      boardFocused,
      requestInFlight
    },
    game: summarizeClientGame()
  };

  fetch("/api/log-ui", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

function buildCard(card, options = {}) {
  if (!card) {
    const placeholder = document.createElement("div");
    placeholder.className = "card placeholder";
    return placeholder;
  }

  const element = cardTemplate.content.firstElementChild.cloneNode(true);
  const suitMap = { S: "♠", H: "♥", D: "♦", C: "♣" };

  element.querySelector(".card-rank").textContent = card.rank;
  element.querySelector(".card-suit").textContent = suitMap[card.suit];

  if (card.suit === "H" || card.suit === "D") {
    element.style.color = "#c63f3a";
  }

  if (options.isWinningBoardCard) {
    element.classList.add("is-winning-board-card");
  }

  return element;
}

function buildCardBack() {
  const cardBack = document.createElement("div");
  cardBack.className = "card-back";
  return cardBack;
}

function formatPlayerBet(player) {
  const actionLabel = player.streetAction ?? player.lastVisibleAction;

  if (!actionLabel) {
    return "No bet";
  }

  const [action, amount] = actionLabel.split(" ");

  if (action === "small-blind") {
    return `SB ${amount}`;
  }

  if (action === "big-blind") {
    return `BB ${amount}`;
  }

  if (action === "call") {
    return `Call ${amount}`;
  }

  if (action === "raise") {
    return `Raise ${amount}`;
  }

  if (action === "all-in") {
    return `All In ${amount}`;
  }

  if (action === "check") {
    return "Check";
  }

  if (action === "fold") {
    return "Fold";
  }

  return player.bet ? `Bet ${player.bet}` : "No bet";
}

function renderPlayers(players) {
  seatsContainer.replaceChildren();
  const displayFocusedSeat = getDisplayFocusedSeat();

  players.forEach((player) => {
    const seat = seatTemplate.content.firstElementChild.cloneNode(true);
    seat.classList.add(`seat-${player.seat}`);
    if (displayFocusedSeat === player.seat) {
      seat.classList.add("is-focused");
    }

    if (player.isUser) {
      seat.classList.add("is-user");
    }
    if (player.folded) {
      seat.classList.add("is-folded");
    }
    if (player.isWinner) {
      seat.classList.add("is-winner");
    }

    seat.querySelector(".player-name").textContent = player.name;
    seat.querySelector(".player-stack").textContent = `${player.stack} chips`;
    seat.querySelector(".player-bet").textContent = formatPlayerBet(player);
    seat.querySelector(".player-status").textContent = player.isUser
      ? "You"
      : player.isBot
        ? "Computer"
        : "Player";

    const roleMarkers = seat.querySelector(".role-markers");
    player.markers.forEach((role) => {
      if (!ROLE_LABELS[role]) {
        return;
      }

      const marker = document.createElement("span");
      marker.className = `marker ${role}`;
      marker.textContent = ROLE_LABELS[role];
      roleMarkers.appendChild(marker);
    });

    const holeCards = seat.querySelector(".hole-cards");
    if (player.visibleHand.length > 0) {
      player.visibleHand.forEach((card) => {
        holeCards.appendChild(buildCard(card));
      });
    } else if (!player.folded || currentGame?.street !== "showdown") {
      for (let index = 0; index < player.holeCardCount; index += 1) {
        holeCards.appendChild(buildCardBack());
      }
    }

    const strategyContainer = seat.querySelector(".player-strategies");
    const hintSeatButton = seat.querySelector(".hint-seat-button");
    hintSeatButton.hidden = !player.isUser;
    if (player.isUser) {
      hintSeatButton.addEventListener("click", (event) => {
        event.stopPropagation();
        logUiEvent("ui.click.hint-seat-button", {
          seat: player.seat
        });
        hintCollapsed = false;
        saveBooleanPreference(UI_PREFERENCE_KEYS.hintCollapsed, hintCollapsed);
        renderPanelStates();
        fetchHint(true);
      });
    }

    if (showBotStrategies && player.isBot && player.strategyProfile.length > 0) {
      const visibleStrategies = displayFocusedSeat === player.seat
        ? player.strategyProfile
        : player.strategyProfile.slice(0, 3);

      visibleStrategies.forEach((strategy) => {
        const chip = document.createElement("span");
        chip.className = "strategy-chip";
        chip.textContent = `${strategy.name} ${strategy.percent}%`;
        strategyContainer.appendChild(chip);
      });
    }

    seat.addEventListener("click", () => {
      manualFocusedSeat = manualFocusedSeat === player.seat ? null : player.seat;
      boardFocused = false;
      logUiEvent("ui.click.seat", {
        seat: player.seat,
        name: player.name,
        focusedSeat: getDisplayFocusedSeat(),
        manualFocusedSeat
      });
      if (currentGame) {
        renderGame(currentGame);
      }
    });

    seatsContainer.appendChild(seat);
  });
}

function renderCommunityCards(cards, winningIndices = []) {
  communityCardsContainer.replaceChildren();

  for (let index = 0; index < 5; index += 1) {
    communityCardsContainer.appendChild(
      buildCard(cards[index], {
        isWinningBoardCard: winningIndices.includes(index)
      })
    );
  }
}

function renderSidePots(sidePots, players) {
  potBreakdown.replaceChildren();

  if (!sidePots || sidePots.length === 0) {
    return;
  }

  sidePots.forEach((pot) => {
    const pill = document.createElement("div");
    pill.className = "pot-pill";

    const name = document.createElement("span");
    name.className = "pot-name";
    name.textContent = pot.name;

    const amount = document.createElement("span");
    amount.className = "pot-amount";
    amount.textContent = `${pot.amount} chips`;

    const eligible = document.createElement("span");
    eligible.className = "pot-eligible";
    eligible.textContent = `Eligible: ${pot.eligibleSeats.map((seat) => players[seat].name).join(", ")}`;

    pill.append(name, amount, eligible);
    potBreakdown.appendChild(pill);
  });
}

function formatDelta(player) {
  const baseline = player.sessionStartingStack ?? player.startingStack;
  const delta = player.stack - baseline;
  if (delta > 0) {
    return { text: `+${delta}`, className: "up" };
  }
  if (delta < 0) {
    return { text: `${delta}`, className: "down" };
  }
  return { text: "0", className: "flat" };
}

function renderStandings(players) {
  standingsList.replaceChildren();

  [...players]
    .sort((left, right) => right.stack - left.stack || left.seat - right.seat)
    .forEach((player) => {
      const row = document.createElement("div");
      row.className = "standings-row";
      if (player.isUser) {
        row.classList.add("is-user");
      }

      const name = document.createElement("span");
      name.className = "standings-name";
      name.textContent = player.name;

      const stack = document.createElement("span");
      stack.className = "standings-stack";
      stack.textContent = `${player.stack}`;

      const delta = document.createElement("span");
      const deltaView = formatDelta(player);
      delta.className = `standings-delta ${deltaView.className}`;
      delta.textContent = deltaView.text;

      row.append(name, stack, delta);
      standingsList.appendChild(row);
    });
}

function buildHintContextKey(game = currentGame) {
  if (!game) {
    return null;
  }

  return JSON.stringify({
    handNumber: game.handNumber,
    street: game.street,
    actionSeat: game.actionSeat,
    communityCards: game.communityCards.map((card) => card.code),
    players: game.players.map((player) => ({
      seat: player.seat,
      stack: player.stack,
      folded: player.folded,
      bet: player.bet
    }))
  });
}

function renderHintEntries(container, entries, emptyMessage) {
  container.replaceChildren();

  if (!entries || entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint-empty";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "hint-row";

    const holding = document.createElement("strong");
    holding.className = "hint-row-holding";
    holding.textContent = entry.holding;

    const label = document.createElement("span");
    label.className = "hint-row-label";
    label.textContent = entry.label;

    const combos = document.createElement("span");
    combos.className = "hint-row-combos";
    combos.textContent = `${entry.combos} combos`;

    row.append(holding, label, combos);
    container.appendChild(row);
  });
}

function renderHintPanel() {
  const contextKey = buildHintContextKey();
  const isStale = Boolean(hintData && hintData.contextKey !== contextKey);

  hintRefreshButton.disabled = hintRequestInFlight || !currentGame;

  if (hintRequestInFlight) {
    hintStatus.textContent = "Calculating win percentage and threat holdings...";
  } else if (hintError) {
    hintStatus.textContent = hintError;
  } else if (!hintData) {
    hintStatus.textContent = "Click Hint on your seat to calculate odds.";
  } else if (isStale) {
    hintStatus.textContent = "Board changed. Refresh hint to update the calculation.";
  } else {
    hintStatus.textContent = `Based on current board state. ${hintData.lastAction}`;
  }

  hintEquity.textContent = hintData ? `${hintData.winPercentage}%` : "-";
  hintHandLabel.textContent = hintData ? hintData.currentHandLabel : "-";
  hintOpponents.textContent = hintData ? `${hintData.opponentCount}` : "-";

  renderHintEntries(
    hintMadeThreats,
    hintData?.madeThreats,
    currentGame?.communityCards?.length >= 3
      ? "No made holdings currently beat your hand."
      : "Made-hand threats are available from the flop onward."
  );
  renderHintEntries(
    hintDrawThreats,
    hintData?.drawThreats,
    currentGame?.communityCards?.length >= 3 && currentGame?.communityCards?.length < 5
      ? "No obvious straight or flush draws stand out."
      : "Draw threats are only shown before the river."
  );
}

function maybeRefreshHint(game = currentGame) {
  if (
    hintCollapsed ||
    hintRequestInFlight ||
    !game ||
    game.street === "showdown" ||
    game.players?.[game.userSeat]?.folded
  ) {
    return;
  }

  const contextKey = buildHintContextKey(game);
  if (contextKey !== lastHintContextRequested) {
    fetchHint();
  }
}

function syncPlayerNameInput(game) {
  const user = game.players[game.userSeat];
  if (document.activeElement !== playerNameInput) {
    playerNameInput.value = user.name;
  }
}

function renderStrategyMenu(strategyCategories) {
  if (strategyFormDirty || strategySaveInFlight) {
    return;
  }

  strategyMenu.replaceChildren();

  strategyCategories.forEach((category) => {
    const section = document.createElement("section");
    section.className = "strategy-category";

    const title = document.createElement("p");
    title.className = "strategy-category-name";
    title.textContent = category.name;
    section.appendChild(title);

    category.strategies.forEach((strategy) => {
      const label = document.createElement("label");
      label.className = "strategy-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "strategy";
      checkbox.value = strategy.id;
      checkbox.checked = strategy.enabled;

      const text = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = strategy.name;
      const description = document.createElement("span");
      description.textContent = strategy.description;
      text.append(name, description);

      label.append(checkbox, text);
      section.appendChild(label);
    });

    strategyMenu.appendChild(section);
  });
}

function renderFloatingPanelState(panel, toggle, collapsed) {
  panel.classList.toggle("is-collapsed", collapsed);
  panel.classList.toggle("is-expanded", !collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.textContent = collapsed ? (toggle.dataset.collapsedLabel ?? "+") : "−";
}

function renderPanelStates() {
  renderFloatingPanelState(settingsPanel, settingsToggle, settingsCollapsed);
  renderFloatingPanelState(standingsPanel, standingsToggle, standingsCollapsed);
  renderFloatingPanelState(hintPanel, hintToggle, hintCollapsed);
  renderPanelLayouts();
}

function getViewportBounds() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizePanelLayout(layout, width, height) {
  const bounds = getViewportBounds();
  const maxLeft = Math.max(FLOATING_PANEL_LIMITS.margin, bounds.width - width - FLOATING_PANEL_LIMITS.margin);
  const maxTop = Math.max(FLOATING_PANEL_LIMITS.margin, bounds.height - height - FLOATING_PANEL_LIMITS.margin);

  return {
    left: clamp(layout.left, FLOATING_PANEL_LIMITS.margin, maxLeft),
    top: clamp(layout.top, FLOATING_PANEL_LIMITS.margin, maxTop),
    width: clamp(layout.width, FLOATING_PANEL_LIMITS.minWidth, bounds.width - FLOATING_PANEL_LIMITS.margin * 2),
    height: clamp(layout.height, FLOATING_PANEL_LIMITS.minHeight, bounds.height - FLOATING_PANEL_LIMITS.margin * 2)
  };
}

function applyPanelLayout(panel, layout, collapsed) {
  if (!layout) {
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "";
    panel.style.width = "";
    panel.style.height = "";
    return;
  }

  const width = collapsed ? FLOATING_PANEL_LIMITS.collapsedSize : layout.width;
  const height = collapsed ? FLOATING_PANEL_LIMITS.collapsedSize : layout.height;
  const normalized = normalizePanelLayout(
    { ...layout, width, height },
    width,
    height
  );

  panel.style.left = `${normalized.left}px`;
  panel.style.top = `${normalized.top}px`;
  panel.style.right = "auto";

  if (collapsed) {
    panel.style.width = "";
    panel.style.height = "";
  } else {
    panel.style.width = `${normalized.width}px`;
    panel.style.height = `${normalized.height}px`;
  }
}

function captureDefaultPanelLayout(panel) {
  const rect = panel.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

function persistPanelLayout(name) {
  const key = name === "settings"
    ? UI_PREFERENCE_KEYS.settingsPanelLayout
    : name === "standings"
      ? UI_PREFERENCE_KEYS.standingsPanelLayout
      : UI_PREFERENCE_KEYS.hintPanelLayout;
  saveObjectPreference(key, panelLayouts[name]);
}

function renderPanelLayouts() {
  applyPanelLayout(settingsPanel, panelLayouts.settings, settingsCollapsed);
  applyPanelLayout(standingsPanel, panelLayouts.standings, standingsCollapsed);
  applyPanelLayout(hintPanel, panelLayouts.hint, hintCollapsed);
}

function initializePanelLayouts() {
  panelLayouts.settings = loadStoredObjectPreference(UI_PREFERENCE_KEYS.settingsPanelLayout);
  panelLayouts.standings = loadStoredObjectPreference(UI_PREFERENCE_KEYS.standingsPanelLayout);
  panelLayouts.hint = loadStoredObjectPreference(UI_PREFERENCE_KEYS.hintPanelLayout);

  if (!panelLayouts.settings) {
    panelLayouts.settings = captureDefaultPanelLayout(settingsPanel);
  }

  if (!panelLayouts.standings) {
    panelLayouts.standings = captureDefaultPanelLayout(standingsPanel);
  }

  if (!panelLayouts.hint) {
    const width = 360;
    panelLayouts.hint = {
      width,
      height: 430,
      left: Math.max(FLOATING_PANEL_LIMITS.margin, window.innerWidth - width - 18),
      top: 174
    };
  }

  renderPanelLayouts();
}

function beginPanelDrag(event, name, panel) {
  if (event.button !== 0) {
    return;
  }

  const initialLayout = panelLayouts[name] ?? captureDefaultPanelLayout(panel);
  const startX = event.clientX;
  const startY = event.clientY;

  function handlePointerMove(moveEvent) {
    panelLayouts[name] = {
      ...initialLayout,
      left: initialLayout.left + (moveEvent.clientX - startX),
      top: initialLayout.top + (moveEvent.clientY - startY)
    };
    renderPanelLayouts();
  }

  function handlePointerUp() {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    persistPanelLayout(name);
    logUiEvent("ui.drag.panel", {
      panel: name,
      layout: panelLayouts[name]
    });
  }

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
}

function beginPanelResize(event, name, panel) {
  if (event.button !== 0) {
    return;
  }

  const initialLayout = panelLayouts[name] ?? captureDefaultPanelLayout(panel);
  const startX = event.clientX;
  const startY = event.clientY;

  function handlePointerMove(moveEvent) {
    panelLayouts[name] = {
      ...initialLayout,
      width: initialLayout.width + (moveEvent.clientX - startX),
      height: initialLayout.height + (moveEvent.clientY - startY)
    };
    renderPanelLayouts();
  }

  function handlePointerUp() {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    persistPanelLayout(name);
    logUiEvent("ui.resize.panel", {
      panel: name,
      layout: panelLayouts[name]
    });
  }

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
}

function wireFloatingPanel(name, panel) {
  const dragHandle = panel.querySelector(".panel-drag-handle");
  const resizeHandle = panel.querySelector(".panel-resize-handle");

  dragHandle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) {
      return;
    }

    beginPanelDrag(event, name, panel);
  });

  resizeHandle.addEventListener("pointerdown", (event) => {
    beginPanelResize(event, name, panel);
  });
}

function setActionButtonState(button, enabled, label = null) {
  button.disabled = !enabled || requestInFlight;
  if (label) {
    button.textContent = label;
  }
}

function updateActionPanel(game) {
  const turn = game.currentTurn;
  const legalActions = new Set(turn?.legalActions ?? []);
  const canFastForward = Boolean(game.canFastForward);
  const canAdvanceBot = Boolean(turn?.isBot && autoPlayBotsCheckbox.checked && slowModeBots);
  const isPlayerTurn = Boolean(turn && !turn.isBot);

  if (!turn) {
    turnSummary.textContent = game.street === "showdown"
      ? game.winningHandLabel
        ? `Hand complete. Winning hand: ${game.winningHandLabel}.`
        : "Hand complete. Start the next hand when ready."
      : "No active turn.";
    setActionButtonState(foldButton, canFastForward, canFastForward ? "Jump To End" : "Fold");
    setActionButtonState(checkButton, false);
    setActionButtonState(callButton, false);
    setActionButtonState(allInButton, false);
    setActionButtonState(raiseButton, false, "Raise To");
    autoActionButton.disabled = requestInFlight;
    nextBotActionButton.disabled = true;
    return;
  }

  const actorType = turn.isBot ? "Computer" : "Player";
  turnSummary.textContent = `${turn.name} (${actorType}) to act. To call: ${turn.toCall}. Current bet: ${game.currentBet}.`;
  setActionButtonState(foldButton, isPlayerTurn && legalActions.has("fold"), "Fold");
  setActionButtonState(checkButton, isPlayerTurn && legalActions.has("check"));
  setActionButtonState(callButton, isPlayerTurn && legalActions.has("call"), turn.toCall > 0 ? `Call ${turn.toCall}` : "Call");
  setActionButtonState(allInButton, isPlayerTurn && legalActions.has("all-in"), "All In");
  setActionButtonState(raiseButton, isPlayerTurn && legalActions.has("raise"), "Raise To");
  autoActionButton.disabled = requestInFlight;
  nextBotActionButton.disabled = !canAdvanceBot || requestInFlight;

  if (turn.minRaiseTo !== null) {
    raiseAmountInput.min = String(turn.minRaiseTo);
    raiseAmountInput.max = String(turn.maxRaiseTo);
    raiseAmountInput.step = String(game.blinds.small);
    if (!raiseAmountInput.value || Number(raiseAmountInput.value) < turn.minRaiseTo) {
      raiseAmountInput.value = String(turn.minRaiseTo);
    }
  } else {
    raiseAmountInput.value = "";
  }

  raiseAmountInput.disabled = !isPlayerTurn || !legalActions.has("raise") || requestInFlight;
}

function scheduleBotAutoPlay() {
  if (autoPlayTimer) {
    window.clearTimeout(autoPlayTimer);
    autoPlayTimer = null;
  }

  if (!currentGame?.currentTurn?.isBot || !autoPlayBotsCheckbox.checked || requestInFlight || slowModeBots) {
    return;
  }

  autoPlayTimer = window.setTimeout(() => {
    submitAutoAction();
  }, 700);
}

function renderGame(game) {
  currentGame = game;
  renderHintPanel();
  boardElement.classList.toggle("is-focused", boardFocused);
  streetLabel.textContent = game.street.toUpperCase();
  potLabel.textContent = `Pot: ${game.pot}`;
  lastActionLabel.textContent = game.lastAction;
  userSeatBanner.textContent = `You are ${game.players[game.userSeat].name} at seat ${game.userSeat + 1}`;
  syncPlayerNameInput(game);
  renderStrategyMenu(game.strategyMenu);
  renderStandings(game.players);
  renderPlayers(game.players);
  renderSidePots(game.sidePots, game.players);
  renderCommunityCards(game.communityCards, game.winningCommunityCardIndices ?? []);
  updateActionPanel(game);
  scheduleBotAutoPlay();
  renderHintPanel();
  maybeRefreshHint(game);
}

async function requestGame(url, options) {
  const method = options?.method ?? "GET";
  let requestBody = null;

  if (typeof options?.body === "string") {
    try {
      requestBody = JSON.parse(options.body);
    } catch {
      requestBody = options.body;
    }
  }

  logUiEvent("request.start", {
    url,
    method,
    body: requestBody
  });
  requestInFlight = true;
  updateActionPanel(currentGame ?? {});

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "x-learning-mode-reveal": String(!hintCollapsed)
    },
    ...options
  });

  requestInFlight = false;

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: `Request failed with status ${response.status}` }));
    logUiEvent("request.error", {
      url,
      method,
      status: response.status,
      body: requestBody,
      error: errorPayload.error || `Request failed with status ${response.status}`
    });
    throw new Error(errorPayload.error || `Request failed with status ${response.status}`);
  }

  const game = await response.json();
  logUiEvent("request.success", {
    url,
    method,
    body: requestBody,
    result: summarizeClientGame(game)
  });
  renderGame(game);
}

async function saveStrategiesFromMenu() {
  strategySaveInFlight = true;

  try {
    const enabledStrategyIds = [...strategyMenu.querySelectorAll("input[name='strategy']:checked")]
      .map((checkbox) => checkbox.value);
    strategyFormDirty = false;
    strategySave.disabled = true;
    await requestGame("/api/game/strategies", {
      method: "POST",
      body: JSON.stringify({ enabledStrategyIds })
    });
  } catch (error) {
    strategyFormDirty = true;
    lastActionLabel.textContent = error.message;
  } finally {
    strategySaveInFlight = false;
    strategySave.disabled = false;
  }
}

async function submitAction(action, amount = null) {
  try {
    await requestGame("/api/game/action", {
      method: "POST",
      body: JSON.stringify({ action, amount })
    });
  } catch (error) {
    lastActionLabel.textContent = error.message;
    updateActionPanel(currentGame);
  }
}

async function submitAutoAction() {
  try {
    await requestGame("/api/game/auto-action", {
      method: "POST"
    });
  } catch (error) {
    lastActionLabel.textContent = error.message;
    updateActionPanel(currentGame);
  }
}

async function submitAutoBotAction() {
  try {
    await requestGame("/api/game/auto-bot-action", {
      method: "POST"
    });
  } catch (error) {
    lastActionLabel.textContent = error.message;
    updateActionPanel(currentGame);
  }
}

async function submitFastForward() {
  try {
    await requestGame("/api/game/fast-forward", {
      method: "POST"
    });
  } catch (error) {
    lastActionLabel.textContent = error.message;
    updateActionPanel(currentGame);
  }
}

async function loadGame() {
  try {
    await requestGame("/api/game");
  } catch (error) {
    lastActionLabel.textContent = error.message;
  }
}

async function fetchHint(force = false) {
  if (!currentGame) {
    return;
  }

  if (currentGame.street === "showdown" || currentGame.players?.[currentGame.userSeat]?.folded) {
    hintData = null;
    hintError = "Hint is unavailable after you fold or once the hand is over.";
    renderHintPanel();
    return;
  }

  const contextKey = buildHintContextKey();
  if (!force && contextKey === lastHintContextRequested && hintData?.contextKey === contextKey) {
    return;
  }

  hintRequestInFlight = true;
  lastHintContextRequested = contextKey;
  renderHintPanel();
  logUiEvent("request.hint.start");

  try {
    const response = await fetch("/api/game/hint");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to calculate hint");
    }

    hintData = {
      ...payload,
      contextKey
    };
    hintError = null;
    logUiEvent("request.hint.success", {
      result: payload
    });
  } catch (error) {
    hintData = null;
    hintError = error.message;
    logUiEvent("request.hint.error", {
      error: error.message
    });
  } finally {
    hintRequestInFlight = false;
    renderHintPanel();
  }
}

newHandButton.addEventListener("click", async () => {
  logUiEvent("ui.click.new-hand");
  try {
    await requestGame("/api/game/new-hand", { method: "POST" });
  } catch (error) {
    lastActionLabel.textContent = error.message;
  }
});

resetGameButton.addEventListener("click", async () => {
  logUiEvent("ui.click.reset-game");
  try {
    await requestGame("/api/game/reset", { method: "POST" });
  } catch (error) {
    lastActionLabel.textContent = error.message;
  }
});

autoActionButton.addEventListener("click", () => {
  logUiEvent("ui.click.auto-act-current-seat");
  submitAutoAction();
});

foldButton.addEventListener("click", () => {
  logUiEvent("ui.click.fold-or-fast-forward", {
    canFastForward: Boolean(currentGame?.canFastForward)
  });
  if (currentGame?.canFastForward) {
    submitFastForward();
    return;
  }

  submitAction("fold");
});

checkButton.addEventListener("click", () => {
  logUiEvent("ui.click.check");
  submitAction("check");
});

callButton.addEventListener("click", () => {
  logUiEvent("ui.click.call");
  submitAction("call");
});

allInButton.addEventListener("click", () => {
  logUiEvent("ui.click.all-in");
  submitAction("all-in");
});

raiseButton.addEventListener("click", () => {
  logUiEvent("ui.click.raise", {
    amount: Number(raiseAmountInput.value)
  });
  submitAction("raise", Number(raiseAmountInput.value));
});

autoPlayBotsCheckbox.addEventListener("change", () => {
  logUiEvent("ui.toggle.auto-play-bots", {
    checked: autoPlayBotsCheckbox.checked
  });
  updateActionPanel(currentGame ?? {});
  scheduleBotAutoPlay();
});

slowModeBotsCheckbox.addEventListener("change", () => {
  slowModeBots = slowModeBotsCheckbox.checked;
  saveBooleanPreference(UI_PREFERENCE_KEYS.slowModeBots, slowModeBots);
  logUiEvent("ui.toggle.slow-mode-bots", {
    checked: slowModeBots
  });
  updateActionPanel(currentGame ?? {});
  scheduleBotAutoPlay();
});

nextBotActionButton.addEventListener("click", () => {
  manualFocusedSeat = null;
  logUiEvent("ui.click.next-bot-action");
  submitAutoBotAction();
});

settingsToggle.addEventListener("click", () => {
  settingsCollapsed = !settingsCollapsed;
  saveBooleanPreference(UI_PREFERENCE_KEYS.settingsCollapsed, settingsCollapsed);
  logUiEvent("ui.click.settings-toggle", {
    collapsed: settingsCollapsed
  });
  renderPanelStates();
});

standingsToggle.addEventListener("click", () => {
  standingsCollapsed = !standingsCollapsed;
  saveBooleanPreference(UI_PREFERENCE_KEYS.standingsCollapsed, standingsCollapsed);
  logUiEvent("ui.click.standings-toggle", {
    collapsed: standingsCollapsed
  });
  renderPanelStates();
});

hintToggle.addEventListener("click", () => {
  hintCollapsed = !hintCollapsed;
  saveBooleanPreference(UI_PREFERENCE_KEYS.hintCollapsed, hintCollapsed);
  logUiEvent("ui.click.hint-toggle", {
    collapsed: hintCollapsed
  });
  renderPanelStates();
});

hintRefreshButton.addEventListener("click", () => {
  logUiEvent("ui.click.hint-refresh");
  fetchHint(true);
});

boardElement.addEventListener("click", () => {
  boardFocused = !boardFocused;
  manualFocusedSeat = null;
  logUiEvent("ui.click.board", {
    boardFocused
  });
  if (currentGame) {
    renderGame(currentGame);
  }
});

tableElement.addEventListener("click", (event) => {
  if (event.target.closest(".seat") || event.target.closest(".board")) {
    return;
  }

  manualFocusedSeat = null;
  boardFocused = true;
  logUiEvent("ui.click.table-clear-focus");
  if (currentGame) {
    renderGame(currentGame);
  }
});

showBotStrategiesCheckbox.addEventListener("change", () => {
  showBotStrategies = showBotStrategiesCheckbox.checked;
  saveBooleanPreference(UI_PREFERENCE_KEYS.showBotStrategies, showBotStrategies);
  logUiEvent("ui.toggle.show-bot-strategies", {
    checked: showBotStrategies
  });
  if (currentGame) {
    renderPlayers(currentGame.players);
  }
});

playerNameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  logUiEvent("ui.submit.player-name", {
    name: playerNameInput.value
  });

  try {
    playerNameSave.disabled = true;
    await requestGame("/api/game/rename-user", {
      method: "POST",
      body: JSON.stringify({ name: playerNameInput.value })
    });
  } catch (error) {
    lastActionLabel.textContent = error.message;
  } finally {
    playerNameSave.disabled = false;
  }
});

strategyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  logUiEvent("ui.submit.strategy-form");
  await saveStrategiesFromMenu();
});

strategyMenu.addEventListener("change", () => {
  strategyFormDirty = true;
  logUiEvent("ui.change.strategy-menu", {
    enabledStrategyIds: [...strategyMenu.querySelectorAll("input[name='strategy']:checked")]
      .map((checkbox) => checkbox.value)
  });
  saveStrategiesFromMenu();
});

showBotStrategies = loadStoredBooleanPreference(UI_PREFERENCE_KEYS.showBotStrategies, false);
slowModeBots = loadStoredBooleanPreference(UI_PREFERENCE_KEYS.slowModeBots, false);
settingsCollapsed = loadStoredBooleanPreference(UI_PREFERENCE_KEYS.settingsCollapsed, false);
standingsCollapsed = loadStoredBooleanPreference(UI_PREFERENCE_KEYS.standingsCollapsed, false);
hintCollapsed = loadStoredBooleanPreference(UI_PREFERENCE_KEYS.hintCollapsed, true);
showBotStrategiesCheckbox.checked = showBotStrategies;
slowModeBotsCheckbox.checked = slowModeBots;

initializePanelLayouts();
wireFloatingPanel("settings", settingsPanel);
wireFloatingPanel("standings", standingsPanel);
wireFloatingPanel("hint", hintPanel);
window.addEventListener("resize", renderPanelLayouts);
renderPanelStates();
renderHintPanel();
logUiEvent("ui.app.loaded");
loadGame();
