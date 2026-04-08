import {
  chooseBotAction,
  createStrategyState,
  serializeBotStrategyProfile,
  serializeStrategyMenu,
  sanitizeEnabledStrategyIds,
  updateStrategyState
} from "./strategy.js";

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

const SMALL_BLIND = 50;
const BIG_BLIND = 100;
const MAX_PLAYERS = 8;
const RANK_VALUE = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};
function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, code: `${rank}${suit}` });
    }
  }

  return deck;
}

function shuffle(deck) {
  const cards = [...deck];

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}

function randomSeat() {
  return Math.floor(Math.random() * MAX_PLAYERS);
}

function createPlayers(userSeat) {
  return Array.from({ length: MAX_PLAYERS }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    seat: index,
    stack: 10000,
    hand: [],
    folded: false,
    bet: 0,
    totalCommitted: 0,
    sessionStartingStack: 10000,
    startingStack: 10000,
    streetAction: null,
    lastVisibleAction: null,
    isBot: index !== userSeat
  }));
}

function nextSeat(currentSeat) {
  return (currentSeat + 1) % MAX_PLAYERS;
}

function playerHasChips(player) {
  return player.stack > 0;
}

function drawCards(deck, count) {
  return deck.splice(0, count);
}

function seatDistance(fromSeat, toSeat) {
  return (toSeat - fromSeat + MAX_PLAYERS) % MAX_PLAYERS;
}

function playerCanAct(player) {
  return !player.folded && player.stack > 0 && player.hand.length > 0;
}

function playersStillInHand(players) {
  return players.filter((player) => !player.folded && player.hand.length > 0);
}

function playersWithChips(players) {
  return players.filter((player) => playerHasChips(player));
}

function nextSeatWithChips(players, currentSeat) {
  for (let offset = 1; offset <= MAX_PLAYERS; offset += 1) {
    const seat = (currentSeat + offset) % MAX_PLAYERS;
    if (playerHasChips(players[seat])) {
      return seat;
    }
  }

  return currentSeat;
}

function playersWhoCanAct(players) {
  return players.filter((player) => playerCanAct(player));
}

function rankValue(rank) {
  return RANK_VALUE[rank];
}

function actingSeatsFrom(players, startSeat) {
  const orderedSeats = [];

  for (let offset = 0; offset < MAX_PLAYERS; offset += 1) {
    const seat = (startSeat + offset) % MAX_PLAYERS;
    if (playerCanAct(players[seat])) {
      orderedSeats.push(seat);
    }
  }

  return orderedSeats;
}

function nextActiveSeat(players, currentSeat) {
  for (let offset = 1; offset <= MAX_PLAYERS; offset += 1) {
    const seat = (currentSeat + offset) % MAX_PLAYERS;
    if (playerCanAct(players[seat])) {
      return seat;
    }
  }

  return null;
}

function firstSeatToActForStreet(players, street, dealerSeat, bigBlindSeat = null) {
  if (street === "preflop") {
    return bigBlindSeat === null ? null : nextActiveSeat(players, bigBlindSeat);
  }

  return nextActiveSeat(players, dealerSeat);
}

function postBlind(player, amount) {
  const blind = Math.min(player.stack, amount);
  player.stack -= blind;
  player.bet += blind;
  player.totalCommitted += blind;
  return blind;
}

function resetPlayersForHand(players) {
  return players.map((player) => ({
    ...player,
    hand: [],
    folded: !playerHasChips(player),
    bet: 0,
    totalCommitted: 0,
    startingStack: player.stack,
    streetAction: null,
    lastVisibleAction: null
  }));
}

function dealHoleCards(players, deck) {
  const activePlayers = players.filter((player) => playerHasChips(player));

  for (let round = 0; round < 2; round += 1) {
    for (const player of activePlayers) {
      player.hand.push(...drawCards(deck, 1));
    }
  }
}

function sortDescending(values) {
  return [...values].sort((left, right) => right - left);
}

function findStraightHigh(values) {
  const unique = [...new Set(values)].sort((left, right) => right - left);

  if (unique[0] === 14) {
    unique.push(1);
  }

  let run = 1;

  for (let index = 1; index < unique.length; index += 1) {
    if (unique[index] === unique[index - 1] - 1) {
      run += 1;
      if (run >= 5) {
        return unique[index - 4];
      }
    } else {
      run = 1;
    }
  }

  return null;
}

function countBySuit(cards) {
  const counts = new Map();

  for (const card of cards) {
    counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  }

  return counts;
}

function hasFourCardStraight(values) {
  const unique = [...new Set(values)].sort((left, right) => right - left);

  if (unique.includes(14)) {
    unique.push(1);
  }

  for (let index = 0; index < unique.length; index += 1) {
    let run = 1;
    for (let inner = index + 1; inner < unique.length; inner += 1) {
      if (unique[inner] === unique[inner - 1] - 1) {
        run += 1;
        if (run >= 4) {
          return true;
        }
      } else if (unique[inner] !== unique[inner - 1]) {
        break;
      }
    }
  }

  return false;
}

function compareScoreArrays(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

export function evaluateSevenCardHand(cards) {
  const values = cards.map((card) => RANK_VALUE[card.rank]);
  const rankCounts = new Map();
  const suitGroups = new Map();

  for (const card of cards) {
    const value = RANK_VALUE[card.rank];
    rankCounts.set(value, (rankCounts.get(value) ?? 0) + 1);

    if (!suitGroups.has(card.suit)) {
      suitGroups.set(card.suit, []);
    }
    suitGroups.get(card.suit).push(value);
  }

  const allRanksDesc = sortDescending(values);
  const distinctRanksDesc = sortDescending(rankCounts.keys());

  for (const suitValues of suitGroups.values()) {
    if (suitValues.length >= 5) {
      const straightFlushHigh = findStraightHigh(suitValues);
      if (straightFlushHigh !== null) {
        return {
          category: 8,
          tiebreaker: [straightFlushHigh],
          label: "Straight Flush"
        };
      }
    }
  }

  const quads = distinctRanksDesc.filter((value) => rankCounts.get(value) === 4);
  if (quads.length > 0) {
    const quadRank = quads[0];
    const kicker = distinctRanksDesc.find((value) => value !== quadRank);
    return {
      category: 7,
      tiebreaker: [quadRank, kicker],
      label: "Four of a Kind"
    };
  }

  const trips = distinctRanksDesc.filter((value) => rankCounts.get(value) === 3);
  const pairs = distinctRanksDesc.filter((value) => rankCounts.get(value) === 2);
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const tripRank = trips[0];
    const pairRank = trips.length > 1 ? trips[1] : pairs[0];
    return {
      category: 6,
      tiebreaker: [tripRank, pairRank],
      label: "Full House"
    };
  }

  for (const suitValues of suitGroups.values()) {
    if (suitValues.length >= 5) {
      return {
        category: 5,
        tiebreaker: sortDescending(suitValues).slice(0, 5),
        label: "Flush"
      };
    }
  }

  const straightHigh = findStraightHigh(values);
  if (straightHigh !== null) {
    return {
      category: 4,
      tiebreaker: [straightHigh],
      label: "Straight"
    };
  }

  if (trips.length > 0) {
    const tripRank = trips[0];
    const kickers = distinctRanksDesc.filter((value) => value !== tripRank).slice(0, 2);
    return {
      category: 3,
      tiebreaker: [tripRank, ...kickers],
      label: "Three of a Kind"
    };
  }

  if (pairs.length >= 2) {
    const highPair = pairs[0];
    const lowPair = pairs[1];
    const kicker = distinctRanksDesc.find((value) => value !== highPair && value !== lowPair);
    return {
      category: 2,
      tiebreaker: [highPair, lowPair, kicker],
      label: "Two Pair"
    };
  }

  if (pairs.length === 1) {
    const pairRank = pairs[0];
    const kickers = distinctRanksDesc.filter((value) => value !== pairRank).slice(0, 3);
    return {
      category: 1,
      tiebreaker: [pairRank, ...kickers],
      label: "One Pair"
    };
  }

  return {
    category: 0,
    tiebreaker: allRanksDesc.slice(0, 5),
    label: "High Card"
  };
}

function compareEvaluations(left, right) {
  if (left.category !== right.category) {
    return left.category - right.category;
  }

  return compareScoreArrays(left.tiebreaker, right.tiebreaker);
}

function buildKnownCardSet(cards) {
  return new Set(cards.map((card) => card.code));
}

function cardsExcluding(knownCards) {
  const excludedCodes = buildKnownCardSet(knownCards);
  return createDeck().filter((card) => !excludedCodes.has(card.code));
}

function cloneCards(cards) {
  return cards.map((card) => ({ ...card }));
}

function rankPairLabel(cards) {
  const values = cloneCards(cards).sort((left, right) => rankValue(right.rank) - rankValue(left.rank));
  if (values[0].rank === values[1].rank) {
    return `${values[0].rank}${values[1].rank}`;
  }

  return `${values[0].rank}${values[1].rank}`;
}

function createThreatEntry(map, label, evaluationLabel, category) {
  if (!map.has(label)) {
    map.set(label, {
      holding: label,
      label: evaluationLabel,
      category,
      combos: 0
    });
  }

  const entry = map.get(label);
  entry.combos += 1;
  if (category > entry.category) {
    entry.category = category;
    entry.label = evaluationLabel;
  }
}

function summarizeThreatMap(threatMap, limit = 12) {
  return [...threatMap.values()]
    .sort((left, right) =>
      right.category - left.category ||
      right.combos - left.combos ||
      left.holding.localeCompare(right.holding)
    )
    .slice(0, limit);
}

function drawTypeLabel(postflopDescription) {
  if (postflopDescription.flushDraw && postflopDescription.straightDraw) {
    return "Straight + Flush Draw";
  }

  if (postflopDescription.flushDraw) {
    return "Flush Draw";
  }

  if (postflopDescription.straightDraw) {
    return "Straight Draw";
  }

  return null;
}

function chooseFiveCardIndices(cardCount) {
  const combinations = [];

  for (let first = 0; first < cardCount - 4; first += 1) {
    for (let second = first + 1; second < cardCount - 3; second += 1) {
      for (let third = second + 1; third < cardCount - 2; third += 1) {
        for (let fourth = third + 1; fourth < cardCount - 1; fourth += 1) {
          for (let fifth = fourth + 1; fifth < cardCount; fifth += 1) {
            combinations.push([first, second, third, fourth, fifth]);
          }
        }
      }
    }
  }

  return combinations;
}

function bestFiveCardHand(cards) {
  let best = null;

  for (const indices of chooseFiveCardIndices(cards.length)) {
    const chosenCards = indices.map((index) => cards[index]);
    const evaluation = evaluateSevenCardHand(chosenCards);

    if (!best || compareEvaluations(evaluation, best.evaluation) > 0) {
      best = {
        evaluation,
        indices,
        cards: chosenCards
      };
    }
  }

  return best;
}

function distributePot(players, winnerSeats, pot, dealerSeat) {
  const share = Math.floor(pot / winnerSeats.length);
  let remainder = pot % winnerSeats.length;
  let cursor = nextSeat(dealerSeat);
  const awardedBySeat = new Map();

  while (winnerSeats.length > 0) {
    if (winnerSeats.includes(cursor)) {
      const award = share + (remainder > 0 ? 1 : 0);
      players[cursor].stack += award;
      awardedBySeat.set(cursor, (awardedBySeat.get(cursor) ?? 0) + award);
      remainder = Math.max(0, remainder - 1);
    }
    cursor = nextSeat(cursor);
    if (cursor === nextSeat(dealerSeat)) {
      break;
    }
  }

  return awardedBySeat;
}

function buildSidePots(players) {
  const allInLevels = [
    ...new Set(
      players
        .filter((player) => !player.folded && player.stack === 0 && player.totalCommitted > 0)
        .map((player) => player.totalCommitted)
    )
  ].sort((left, right) => left - right);
  const maxCommitment = Math.max(0, ...players.map((player) => player.totalCommitted));

  if (allInLevels.length === 0) {
    return [];
  }

  const commitmentLevels = [...new Set([...allInLevels, maxCommitment])].sort((left, right) => left - right);
  const sidePots = [];
  let previousLevel = 0;

  for (const level of commitmentLevels) {
    const contributors = players.filter((player) => player.totalCommitted >= level);
    const eligibleSeats = players
      .filter((player) => !player.folded && player.totalCommitted >= level)
      .map((player) => player.seat);
    const amount = (level - previousLevel) * contributors.length;

    if (amount > 0 && eligibleSeats.length > 0) {
      sidePots.push({
        amount,
        eligibleSeats
      });
    }

    previousLevel = level;
  }

  return sidePots.length > 1 ? sidePots : [];
}

function serializeSidePots(state) {
  return buildSidePots(state.players).map((pot, index) => ({
    name: index === 0 ? "Main Pot" : `Side Pot ${index}`,
    amount: pot.amount,
    eligibleSeats: pot.eligibleSeats
  }));
}

function getPositionBucket(state, seat) {
  if (seat === state.dealerSeat) {
    return "button";
  }

  if (seat === state.smallBlindSeat) {
    return "small-blind";
  }

  if (seat === state.bigBlindSeat) {
    return "big-blind";
  }

  const distance = seatDistance(state.dealerSeat, seat);

  if (distance <= 3) {
    return "early";
  }

  if (distance <= 5) {
    return "middle";
  }

  return "late";
}

function describeHoleCards(cards) {
  const values = cards.map((card) => rankValue(card.rank)).sort((left, right) => right - left);
  const suited = cards[0].suit === cards[1].suit;
  const pair = values[0] === values[1];
  const gap = Math.abs(values[0] - values[1]);
  let tier = "weak";

  if (
    pair && values[0] >= 10 ||
    (values[0] === 14 && values[1] >= 12) ||
    (values[0] === 14 && values[1] === 11 && suited) ||
    (values[0] === 13 && values[1] === 12 && suited)
  ) {
    tier = "premium";
  } else if (
    pair && values[0] >= 7 ||
    (values[0] >= 13 && values[1] >= 10) ||
    (values[0] === 12 && values[1] >= 10 && suited)
  ) {
    tier = "strong";
  } else if (
    pair ||
    suited ||
    gap <= 2 ||
    (values[0] >= 11 && values[1] >= 9)
  ) {
    tier = "speculative";
  }

  return {
    values,
    suited,
    pair,
    gap,
    tier
  };
}

function describePostflop(player, communityCards) {
  if (communityCards.length < 3) {
    return {
      category: 0,
      label: "Preflop",
      flushDraw: false,
      straightDraw: false,
      topPairOrBetter: false,
      boardTexture: "dry"
    };
  }

  const allCards = [...player.hand, ...communityCards];
  const evaluation = evaluateSevenCardHand(allCards);
  const suitCounts = [...countBySuit(allCards).values()];
  const flushDraw = suitCounts.some((count) => count >= 4);
  const straightDraw = hasFourCardStraight(allCards.map((card) => rankValue(card.rank)));
  const boardHigh = Math.max(...communityCards.map((card) => rankValue(card.rank)));
  const holeValues = player.hand.map((card) => rankValue(card.rank));
  const topPairOrBetter = evaluation.category >= 2 || (
    evaluation.category === 1 &&
    holeValues.some((value) => value === boardHigh)
  );
  const boardTexture = flushDraw || straightDraw ? "wet" : "dry";

  return {
    category: evaluation.category,
    label: evaluation.label,
    flushDraw,
    straightDraw,
    topPairOrBetter,
    boardTexture
  };
}

function buildDecisionContext(state, seat) {
  const player = state.players[seat];
  return {
    seat,
    street: state.street,
    legalActions: getLegalActions(state, seat),
    toCall: getToCall(state, seat),
    currentBet: state.currentBet,
    minRaiseTo: state.currentBet === 0 ? BIG_BLIND : state.currentBet + state.minRaise,
    maxRaiseTo: player.bet + player.stack,
    pot: state.pot,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    playerStack: player.stack,
    playerBet: player.bet,
    playersRemaining: playersStillInHand(state.players).length,
    position: getPositionBucket(state, seat),
    hole: describeHoleCards(player.hand),
    postflop: describePostflop(player, state.communityCards),
    communityCards: state.communityCards,
    hand: player.hand
  };
}

function buildMarkers(state, player) {
  const markers = [];

  if (player.seat === state.dealerSeat) {
    markers.push("dealer");
  }

  if (player.seat === state.smallBlindSeat) {
    markers.push("small-blind");
  }

  if (player.seat === state.bigBlindSeat) {
    markers.push("big-blind");
  }

  if (player.folded) {
    markers.push("folded");
  }

  if (player.stack === 0 && !player.folded) {
    markers.push("all-in");
  }

  if (player.seat === state.actionSeat && state.street !== "showdown") {
    markers.push("to-act");
  }

  return markers;
}

function getPlayer(state, seat) {
  return seat === null ? null : state.players[seat];
}

function getToCall(state, seat) {
  const player = getPlayer(state, seat);
  if (!player) {
    return 0;
  }

  return Math.max(0, state.currentBet - player.bet);
}

function getLegalActions(state, seat = state.actionSeat) {
  const player = getPlayer(state, seat);

  if (!player || state.street === "showdown" || player.folded || player.stack === 0) {
    return [];
  }

  const toCall = getToCall(state, seat);
  const legalActions = ["fold"];

  if (toCall === 0) {
    legalActions.push("check");
  } else if (player.stack >= toCall) {
    legalActions.push("call");
  }

  const minRaiseTo = state.currentBet === 0 ? BIG_BLIND : state.currentBet + state.minRaise;
  const maxRaiseTo = player.bet + player.stack;

  if (maxRaiseTo >= minRaiseTo) {
    legalActions.push("raise");
  }

  if (player.stack > 0) {
    legalActions.push("all-in");
  }

  return legalActions;
}

function buildPendingSeatsForRound(players, startSeat) {
  return actingSeatsFrom(players, startSeat);
}

function collectPendingAfterAggression(players, raiserSeat) {
  const startSeat = nextSeat(raiserSeat);
  return actingSeatsFrom(players, startSeat).filter((seat) => seat !== raiserSeat);
}

function awardPotToLastPlayer(state) {
  const remainingPlayers = playersStillInHand(state.players);
  const winner = remainingPlayers[0];
  winner.stack += state.pot;

  return {
    ...state,
    pot: 0,
    street: "showdown",
    actionSeat: null,
    pendingSeats: [],
    winnerSeat: winner.seat,
    winnerSeats: [winner.seat],
    winningHandLabel: "Uncontested",
    winningCommunityCardIndices: [],
    lastAction: `${winner.name} wins ${state.pot} chips uncontested`
  };
}

function awardPotAtShowdown(state) {
  const contenders = playersStillInHand(state.players);
  if (contenders.length === 0) {
    return {
      ...state,
      pot: 0,
      street: "showdown",
      actionSeat: null,
      pendingSeats: [],
      winnerSeat: null,
      winnerSeats: [],
      winningHandLabel: null,
      winningCommunityCardIndices: [],
      lastAction: "Showdown reached with no eligible contenders"
    };
  }

  const evaluations = contenders.map((player) => {
    const bestHand = bestFiveCardHand([...player.hand, ...state.communityCards]);

    return {
      seat: player.seat,
      name: player.name,
      bestHand,
      evaluation: bestHand.evaluation
    };
  });
  const evaluationBySeat = new Map(evaluations.map((entry) => [entry.seat, entry]));
  const sidePots = buildSidePots(state.players);
  const showdownPots = sidePots.length > 0
    ? sidePots
    : [
        {
          amount: state.pot,
          eligibleSeats: contenders.map((player) => player.seat)
        }
      ];
  const totalAwardedBySeat = new Map();
  const highlightedWinners = new Set();
  let primaryWinners = [];
  let primaryEvaluation = null;

  for (const sidePot of showdownPots) {
    const eligible = sidePot.eligibleSeats
      .map((seat) => evaluationBySeat.get(seat))
      .filter(Boolean);
    if (eligible.length === 0) {
      continue;
    }
    let bestEvaluation = eligible[0].evaluation;

    for (const contender of eligible.slice(1)) {
      if (compareEvaluations(contender.evaluation, bestEvaluation) > 0) {
        bestEvaluation = contender.evaluation;
      }
    }

    const winners = eligible.filter((contender) => compareEvaluations(contender.evaluation, bestEvaluation) === 0);
    const winnerSeats = winners.map((winner) => winner.seat);
    const awardedBySeat = distributePot(state.players, winnerSeats, sidePot.amount, state.dealerSeat);

    for (const seat of winnerSeats) {
      highlightedWinners.add(seat);
      totalAwardedBySeat.set(seat, (totalAwardedBySeat.get(seat) ?? 0) + (awardedBySeat.get(seat) ?? 0));
    }

    if (primaryWinners.length === 0) {
      primaryWinners = winners;
      primaryEvaluation = bestEvaluation;
    }
  }

  const winnerSeats = [...highlightedWinners];
  const winnerLabel = primaryWinners.map((winner) => winner.name).join(", ");
  const plural = primaryWinners.length > 1 ? "split" : "wins";
  const summaryAmount = primaryWinners.reduce((sum, winner) => sum + (totalAwardedBySeat.get(winner.seat) ?? 0), 0);
  const winningHandLabel = primaryEvaluation?.label ?? "Best Hand";
  const highlightedBoardIndices = primaryWinners.length > 0
    ? primaryWinners[0].bestHand.indices
        .filter((index) => index >= 2)
        .map((index) => index - 2)
    : [];

  return {
    ...state,
    pot: 0,
    street: "showdown",
    actionSeat: null,
    pendingSeats: [],
    winnerSeat: winnerSeats[0],
    winnerSeats,
    winningHandLabel,
    winningCommunityCardIndices: highlightedBoardIndices,
    lastAction: `${winnerLabel} ${plural} ${summaryAmount} chips with ${winningHandLabel}`
  };
}

function revealShowdown(state) {
  return awardPotAtShowdown(state);
}

function shouldAutoRunBoard(state) {
  return (
    state.street !== "showdown" &&
    playersStillInHand(state.players).length > 1 &&
    playersWhoCanAct(state.players).length <= 1
  );
}

function resolveAutomaticRunout(state) {
  let nextState = state;

  while (shouldAutoRunBoard(nextState)) {
    nextState = advanceStreet({
      ...nextState,
      lastAction: `${nextState.lastAction}. All remaining players are all-in; dealing out the board.`
    });
  }

  return nextState;
}

function startBettingRound(state, street) {
  const players = state.players.map((player) => ({
    ...player,
    bet: 0,
    streetAction: null,
    lastVisibleAction: player.streetAction ?? player.lastVisibleAction
  }));
  const startSeat = firstSeatToActForStreet(players, street, state.dealerSeat, state.bigBlindSeat);
  const pendingSeats = buildPendingSeatsForRound(players, startSeat);

  return resolveAutomaticRunout({
    ...state,
    street,
    players,
    currentBet: 0,
    minRaise: BIG_BLIND,
    actionSeat: pendingSeats[0] ?? null,
    pendingSeats,
    lastAction: `${street[0].toUpperCase()}${street.slice(1)} dealt`
  });
}

export function createInitialGame() {
  const userSeat = randomSeat();
  const players = createPlayers(userSeat);
  const dealerSeat = randomSeat();
  const strategyState = createStrategyState(players, userSeat);
  return startNewHand({
    handNumber: 0,
    players,
    dealerSeat,
    userSeat,
    strategyState
  });
}

export function renameUserPlayer(state, name) {
  const trimmedName = String(name ?? "").trim();

  if (!trimmedName) {
    throw new Error("Name cannot be empty");
  }

  if (trimmedName.length > 24) {
    throw new Error("Name must be 24 characters or fewer");
  }

  return {
    ...state,
    players: state.players.map((player) =>
      player.seat === state.userSeat
        ? {
            ...player,
            name: trimmedName
          }
        : player
    )
  };
}

export function startNewHand(previousState) {
  if (playersWithChips(previousState.players).length < 2) {
    return createInitialGame();
  }

  const handNumber = previousState.handNumber + 1;
  const dealerSeat = nextSeatWithChips(previousState.players, previousState.dealerSeat);
  const smallBlindSeat = nextSeatWithChips(previousState.players, dealerSeat);
  const bigBlindSeat = nextSeatWithChips(previousState.players, smallBlindSeat);
  const deck = shuffle(createDeck());
  const players = resetPlayersForHand(previousState.players);

  dealHoleCards(players, deck);
  const actionSeat = firstSeatToActForStreet(players, "preflop", dealerSeat, bigBlindSeat);

  const smallBlind = postBlind(players[smallBlindSeat], SMALL_BLIND);
  const bigBlind = postBlind(players[bigBlindSeat], BIG_BLIND);
  players[smallBlindSeat].streetAction = `small-blind ${smallBlind}`;
  players[smallBlindSeat].lastVisibleAction = `small-blind ${smallBlind}`;
  players[bigBlindSeat].streetAction = `big-blind ${bigBlind}`;
  players[bigBlindSeat].lastVisibleAction = `big-blind ${bigBlind}`;
  const pendingSeats = buildPendingSeatsForRound(players, actionSeat);

  return {
    handNumber,
    userSeat: previousState.userSeat,
    strategyState: previousState.strategyState,
    street: "preflop",
    pot: smallBlind + bigBlind,
    communityCards: [],
    deck,
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    actionSeat,
    pendingSeats,
    currentBet: BIG_BLIND,
    minRaise: BIG_BLIND,
    players,
    winnerSeat: null,
    winnerSeats: [],
    winningHandLabel: null,
    winningCommunityCardIndices: [],
    lastAction: `Hand ${handNumber} started`
  };
}

export function advanceStreet(state) {
  if (state.street === "showdown") {
    return startNewHand(state);
  }

  const nextState = {
    ...state,
    deck: [...state.deck],
    communityCards: [...state.communityCards]
  };

  if (state.street === "preflop") {
    drawCards(nextState.deck, 1);
    nextState.communityCards.push(...drawCards(nextState.deck, 3));
    return startBettingRound(nextState, "flop");
  }

  if (state.street === "flop") {
    drawCards(nextState.deck, 1);
    nextState.communityCards.push(...drawCards(nextState.deck, 1));
    return startBettingRound(nextState, "turn");
  }

  if (state.street === "turn") {
    drawCards(nextState.deck, 1);
    nextState.communityCards.push(...drawCards(nextState.deck, 1));
    return startBettingRound(nextState, "river");
  }

  return revealShowdown(nextState);
}

function progressAfterAction(state, seat, summary) {
  const remainingPlayers = playersStillInHand(state.players);

  if (remainingPlayers.length === 1) {
    return awardPotToLastPlayer({
      ...state,
      lastAction: summary
    });
  }

  if (state.pendingSeats.length === 0) {
    return advanceStreet({
      ...state,
      lastAction: summary
    });
  }

  return {
    ...state,
    actionSeat: state.pendingSeats[0],
    lastAction: summary
  };
}

export function applyAction(state, action, amount = null) {
  if (state.street === "showdown") {
    return startNewHand(state);
  }

  const seat = state.actionSeat;
  const legalActions = getLegalActions(state, seat);

  if (!legalActions.includes(action)) {
    throw new Error(`Illegal action: ${action}`);
  }

  const nextState = {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    pendingSeats: [...state.pendingSeats]
  };
  const player = nextState.players[seat];
  const toCall = getToCall(nextState, seat);
  nextState.pendingSeats = nextState.pendingSeats.filter((pendingSeat) => pendingSeat !== seat);

  if (action === "fold") {
    player.folded = true;
    player.streetAction = "fold";
    player.lastVisibleAction = "fold";
    return progressAfterAction(nextState, seat, `${player.name} folds`);
  }

  if (action === "check") {
    player.streetAction = "check";
    player.lastVisibleAction = "check";
    return progressAfterAction(nextState, seat, `${player.name} checks`);
  }

  if (action === "call") {
    const callAmount = Math.min(player.stack, toCall);
    player.stack -= callAmount;
    player.bet += callAmount;
    player.totalCommitted += callAmount;
    nextState.pot += callAmount;
    player.streetAction = `call ${player.bet}`;
    player.lastVisibleAction = `call ${player.bet}`;
    return progressAfterAction(nextState, seat, `${player.name} calls ${callAmount}`);
  }

  if (action === "all-in") {
    const shoveTo = player.bet + player.stack;
    const minRaiseTo = nextState.currentBet === 0 ? BIG_BLIND : nextState.currentBet + nextState.minRaise;

    if (shoveTo <= nextState.currentBet) {
      const callAmount = Math.min(player.stack, toCall);
      player.stack -= callAmount;
      player.bet += callAmount;
      player.totalCommitted += callAmount;
      nextState.pot += callAmount;
      player.streetAction = `all-in ${player.bet}`;
      player.lastVisibleAction = `all-in ${player.bet}`;
      return progressAfterAction(nextState, seat, `${player.name} is all-in for ${player.bet}`);
    }

    const putInChips = shoveTo - player.bet;
    player.stack = 0;
    player.bet = shoveTo;
    player.totalCommitted += putInChips;
    nextState.pot += putInChips;
    player.streetAction = `all-in ${shoveTo}`;
    player.lastVisibleAction = `all-in ${shoveTo}`;

    if (shoveTo >= minRaiseTo) {
      nextState.minRaise = Math.max(BIG_BLIND, shoveTo - nextState.currentBet);
      nextState.currentBet = shoveTo;
      nextState.pendingSeats = collectPendingAfterAggression(nextState.players, seat);
    }

    return progressAfterAction(nextState, seat, `${player.name} moves all-in for ${shoveTo}`);
  }

  const minRaiseTo = nextState.currentBet === 0 ? BIG_BLIND : nextState.currentBet + nextState.minRaise;
  const maxRaiseTo = player.bet + player.stack;
  const raiseTo = Number(amount);

  if (!Number.isFinite(raiseTo) || raiseTo < minRaiseTo || raiseTo > maxRaiseTo) {
    throw new Error(`Raise must be between ${minRaiseTo} and ${maxRaiseTo}`);
  }

  const putInChips = raiseTo - player.bet;
  player.stack -= putInChips;
  player.bet = raiseTo;
  player.totalCommitted += putInChips;
  nextState.pot += putInChips;
  player.streetAction = `raise ${raiseTo}`;
  player.lastVisibleAction = `raise ${raiseTo}`;
  nextState.minRaise = Math.max(BIG_BLIND, raiseTo - nextState.currentBet);
  nextState.currentBet = raiseTo;
  nextState.pendingSeats = collectPendingAfterAggression(nextState.players, seat);

  return progressAfterAction(nextState, seat, `${player.name} raises to ${raiseTo}`);
}

export function getAutoAction(state) {
  const seat = state.actionSeat;
  const player = getPlayer(state, seat);

  if (!player) {
    return { action: "check", amount: null };
  }

  return chooseBotAction(buildDecisionContext(state, seat), state.strategyState, seat);
}

export function applyAutoAction(state) {
  const { action, amount } = getAutoAction(state);
  return applyAction(state, action, amount);
}

export function applyAutoBotAction(state) {
  const actionPlayer = getPlayer(state, state.actionSeat);

  if (!actionPlayer) {
    throw new Error("No active turn");
  }

  if (!actionPlayer.isBot) {
    throw new Error("Next Bot Action is only available on bot turns");
  }

  return applyAutoAction(state);
}

export function updateEnabledStrategies(state, enabledStrategyIds) {
  return {
    ...state,
    strategyState: updateStrategyState(
      state.players,
      state.userSeat,
      sanitizeEnabledStrategyIds(enabledStrategyIds)
    )
  };
}

export function hydrateGameState(rawState) {
  if (!rawState || !Array.isArray(rawState.players) || rawState.players.length !== MAX_PLAYERS) {
    return createInitialGame();
  }

  const userSeat = Number.isInteger(rawState.userSeat)
    ? rawState.userSeat
    : Math.max(0, rawState.players.findIndex((player) => player.isBot === false));
  const basePlayers = createPlayers(userSeat);
  const players = basePlayers.map((basePlayer, index) => ({
    ...basePlayer,
    ...rawState.players[index],
    seat: index,
    isBot: index !== userSeat,
    sessionStartingStack:
      rawState.players[index]?.sessionStartingStack ??
      basePlayer.sessionStartingStack,
    startingStack: rawState.players[index]?.startingStack ?? rawState.players[index]?.stack ?? basePlayer.startingStack
  }));
  const enabledStrategyIds = rawState.strategyState?.enabledStrategyIds;
  const baseStrategyState = createStrategyState(players, userSeat, enabledStrategyIds);

  return {
    ...rawState,
    userSeat,
    players,
    strategyState: {
      enabledStrategyIds: baseStrategyState.enabledStrategyIds,
      botProfiles: rawState.strategyState?.botProfiles ?? baseStrategyState.botProfiles
    },
    winnerSeats: Array.isArray(rawState.winnerSeats) ? rawState.winnerSeats : [],
    winningHandLabel: rawState.winningHandLabel ?? null
    ,
    winningCommunityCardIndices: Array.isArray(rawState.winningCommunityCardIndices)
      ? rawState.winningCommunityCardIndices
      : []
  };
}

function restartAbandonedHand(state) {
  if (playersWithChips(state.players).length < 2) {
    return createInitialGame();
  }

  const players = state.players.map((player) => ({
    ...player,
    stack: player.startingStack,
    hand: [],
    folded: player.startingStack === 0,
    bet: 0,
    totalCommitted: 0,
    streetAction: null,
    lastVisibleAction: null
  }));
  const deck = shuffle(createDeck());

  dealHoleCards(players, deck);

  const dealerSeat = nextSeatWithChips(players, state.dealerSeat - 1 < 0 ? MAX_PLAYERS - 1 : state.dealerSeat - 1);
  const smallBlindSeat = nextSeatWithChips(players, dealerSeat);
  const bigBlindSeat = nextSeatWithChips(players, smallBlindSeat);
  const smallBlind = postBlind(players[smallBlindSeat], SMALL_BLIND);
  const bigBlind = postBlind(players[bigBlindSeat], BIG_BLIND);
  players[smallBlindSeat].streetAction = `small-blind ${smallBlind}`;
  players[smallBlindSeat].lastVisibleAction = `small-blind ${smallBlind}`;
  players[bigBlindSeat].streetAction = `big-blind ${bigBlind}`;
  players[bigBlindSeat].lastVisibleAction = `big-blind ${bigBlind}`;
  const actionSeat = firstSeatToActForStreet(players, "preflop", dealerSeat, bigBlindSeat);
  const pendingSeats = buildPendingSeatsForRound(players, actionSeat);

  return {
    ...state,
    street: "preflop",
    pot: smallBlind + bigBlind,
    communityCards: [],
    deck,
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    actionSeat,
    pendingSeats,
    currentBet: BIG_BLIND,
    minRaise: BIG_BLIND,
    players,
    winnerSeat: null,
    winnerSeats: [],
    winningHandLabel: null,
    winningCommunityCardIndices: [],
    lastAction: `Hand ${state.handNumber} restarted after app relaunch`
  };
}

export function snapshotForPersistence(state) {
  if (state.street === "showdown") {
    return state;
  }

  return restartAbandonedHand(state);
}

export function fastForwardHand(state) {
  if (state.street === "showdown") {
    return state;
  }

  const userPlayer = state.players[state.userSeat];

  if (!userPlayer.folded) {
    throw new Error("You can only jump to the end after folding");
  }

  let nextState = state;
  let safety = 0;

  while (nextState.street !== "showdown" && safety < 500) {
    nextState = applyAutoAction(nextState);
    safety += 1;
  }

  if (nextState.street !== "showdown") {
    throw new Error("Unable to fast-forward hand");
  }

  return nextState;
}

function activeOpponentSeats(state) {
  return playersStillInHand(state.players)
    .filter((player) => player.seat !== state.userSeat)
    .map((player) => player.seat);
}

function currentUserEvaluation(state) {
  const user = state.players[state.userSeat];

  if (!user || user.folded || user.hand.length !== 2) {
    throw new Error("Hint is only available while your hand is active");
  }

  if (state.communityCards.length >= 3) {
    return bestFiveCardHand([...user.hand, ...state.communityCards]).evaluation;
  }

  const hole = describeHoleCards(user.hand);
  return {
    category: -1,
    tiebreaker: [],
    label: `${hole.tier[0].toUpperCase()}${hole.tier.slice(1)} Start`
  };
}

function enumerateOpponentThreats(state) {
  if (state.communityCards.length < 3) {
    return {
      madeThreats: [],
      drawThreats: []
    };
  }

  const user = state.players[state.userSeat];
  const userEvaluation = bestFiveCardHand([...user.hand, ...state.communityCards]).evaluation;
  const availableCards = cardsExcluding([...user.hand, ...state.communityCards]);
  const madeThreatMap = new Map();
  const drawThreatMap = new Map();

  for (let first = 0; first < availableCards.length - 1; first += 1) {
    for (let second = first + 1; second < availableCards.length; second += 1) {
      const holding = [availableCards[first], availableCards[second]];
      const label = rankPairLabel(holding);
      const evaluation = bestFiveCardHand([...holding, ...state.communityCards]).evaluation;

      if (compareEvaluations(evaluation, userEvaluation) > 0) {
        createThreatEntry(madeThreatMap, label, evaluation.label, evaluation.category);
        continue;
      }

      if (state.communityCards.length < 5) {
        const drawProfile = describePostflop({ hand: holding }, state.communityCards);
        const drawLabel = drawTypeLabel(drawProfile);
        if (drawLabel) {
          createThreatEntry(drawThreatMap, label, drawLabel, drawProfile.category);
        }
      }
    }
  }

  return {
    madeThreats: summarizeThreatMap(madeThreatMap),
    drawThreats: summarizeThreatMap(drawThreatMap)
  };
}

function estimateUserEquity(state, iterations = 2500) {
  const user = state.players[state.userSeat];
  const opponents = activeOpponentSeats(state);

  if (user.folded || user.hand.length !== 2) {
    throw new Error("Hint is only available while your hand is active");
  }

  if (opponents.length === 0) {
    return 100;
  }

  const communityCards = [...state.communityCards];
  const knownCards = [...user.hand, ...communityCards];
  const availableCards = cardsExcluding(knownCards);
  let equity = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampleDeck = shuffle(availableCards);
    let cursor = 0;
    const opponentHands = opponents.map(() => {
      const hand = [sampleDeck[cursor], sampleDeck[cursor + 1]];
      cursor += 2;
      return hand;
    });
    const board = [...communityCards];

    while (board.length < 5) {
      board.push(sampleDeck[cursor]);
      cursor += 1;
    }

    const userEvaluation = bestFiveCardHand([...user.hand, ...board]).evaluation;
    const opponentEvaluations = opponentHands.map((hand) => bestFiveCardHand([...hand, ...board]).evaluation);
    let bestEvaluation = userEvaluation;

    for (const evaluation of opponentEvaluations) {
      if (compareEvaluations(evaluation, bestEvaluation) > 0) {
        bestEvaluation = evaluation;
      }
    }

    const tiedWinners = 1 + opponentEvaluations.filter(
      (evaluation) => compareEvaluations(evaluation, bestEvaluation) === 0
    ).length;

    if (compareEvaluations(userEvaluation, bestEvaluation) === 0) {
      equity += 1 / tiedWinners;
    }
  }

  return (equity / iterations) * 100;
}

export function buildUserHint(state) {
  const user = state.players[state.userSeat];
  const opponents = activeOpponentSeats(state);
  const currentEvaluation = currentUserEvaluation(state);
  const { madeThreats, drawThreats } = enumerateOpponentThreats(state);
  const winPercentage = estimateUserEquity(state, opponents.length >= 3 ? 1800 : 2500);

  return {
    handNumber: state.handNumber,
    street: state.street,
    opponentCount: opponents.length,
    currentHandLabel: currentEvaluation.label,
    winPercentage: Number(winPercentage.toFixed(1)),
    madeThreats,
    drawThreats,
    lastAction: state.lastAction
  };
}

function maskPlayers(state, options = {}) {
  const revealShowdownHands =
    state.street === "showdown" && (
      !state.players[state.userSeat].folded ||
      options.revealShowdownHandsForFoldedUser === true
    );

  return state.players.map((player) => ({
    id: player.id,
    name: player.name,
    seat: player.seat,
    stack: player.stack,
    bet: player.bet,
    totalCommitted: player.totalCommitted,
    sessionStartingStack: player.sessionStartingStack,
    startingStack: player.startingStack,
    folded: player.folded,
    streetAction: player.streetAction,
    lastVisibleAction: player.lastVisibleAction,
    markers: buildMarkers(state, player),
    isUser: player.seat === state.userSeat,
    isBot: player.isBot,
    strategyProfile: player.isBot ? serializeBotStrategyProfile(state.strategyState, player.seat) : [],
    visibleHand:
      player.seat === state.userSeat || (revealShowdownHands && !player.folded) ? player.hand : [],
    isWinner: state.winnerSeats.includes(player.seat),
    holeCardCount: player.hand.length,
    isOccupied: true
  }));
}

export function serializeGame(state, options = {}) {
  const actionPlayer = getPlayer(state, state.actionSeat);
  const legalActions = getLegalActions(state);
  const toCall = getToCall(state, state.actionSeat);
  const minRaiseTo = state.actionSeat === null
    ? null
    : state.currentBet === 0
      ? BIG_BLIND
      : state.currentBet + state.minRaise;
  const maxRaiseTo = state.actionSeat === null ? null : actionPlayer.bet + actionPlayer.stack;

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
    toCall,
    winnerSeat: state.winnerSeat,
    winnerSeats: state.winnerSeats,
    winningHandLabel: state.winningHandLabel,
    winningCommunityCardIndices: state.winningCommunityCardIndices ?? [],
    strategyMenu: serializeStrategyMenu(state.strategyState?.enabledStrategyIds),
    sidePots: serializeSidePots(state),
    communityCards: state.communityCards,
    players: maskPlayers(state, options),
    currentTurn: actionPlayer
      ? {
          seat: actionPlayer.seat,
          name: actionPlayer.name,
          isBot: actionPlayer.isBot,
          legalActions,
          toCall,
          minRaiseTo,
          maxRaiseTo
        }
      : null,
    canFastForward:
      state.street !== "showdown" &&
      state.players[state.userSeat].folded,
    blinds: {
      small: SMALL_BLIND,
      big: BIG_BLIND
    },
    lastAction: state.lastAction
  };
}
