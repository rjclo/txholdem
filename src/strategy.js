const BASIC = "basic";
const MEDIUM = "medium";
const ADVANCED = "advanced";

function can(context, action) {
  return context.legalActions.includes(action);
}

function fallbackDecision(context) {
  if (can(context, "check")) {
    return { action: "check", amount: null };
  }

  if (can(context, "call")) {
    return { action: "call", amount: null };
  }

  if (can(context, "all-in")) {
    return { action: "all-in", amount: null };
  }

  return { action: "fold", amount: null };
}

function raiseTo(context, target) {
  if (!can(context, "raise")) {
    return can(context, "all-in") ? { action: "all-in", amount: null } : fallbackDecision(context);
  }

  const boundedTarget = Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, target));
  return { action: "raise", amount: boundedTarget };
}

function potSizedRaise(context, multiplier = 0.6) {
  const increment = Math.max(context.smallBlind, Math.round((context.pot * multiplier) / context.smallBlind) * context.smallBlind);
  return raiseTo(context, context.currentBet + increment);
}

function cheapCall(context, cap) {
  if (context.toCall === 0 && can(context, "check")) {
    return { action: "check", amount: null };
  }

  if (context.toCall <= cap && can(context, "call")) {
    return { action: "call", amount: null };
  }

  return { action: "fold", amount: null };
}

function premiumOrStrong(context) {
  return context.hole.tier === "premium" || context.hole.tier === "strong";
}

function speculativeOrBetter(context) {
  return premiumOrStrong(context) || context.hole.tier === "speculative";
}

function strongPostflop(context) {
  return context.postflop.category >= 2 || context.postflop.topPairOrBetter;
}

function decentDraw(context) {
  return context.postflop.flushDraw || context.postflop.straightDraw;
}

function shortStack(context) {
  return context.playerStack <= context.bigBlind * 15;
}

function latePosition(context) {
  return context.position === "late" || context.position === "button";
}

function earlyPosition(context) {
  return context.position === "early" || context.position === "small-blind" || context.position === "big-blind";
}

function basicTightPassive(context) {
  if (context.street === "preflop") {
    if (context.hole.tier === "premium") {
      return can(context, "raise") ? raiseTo(context, context.minRaiseTo) : fallbackDecision(context);
    }

    if (context.hole.tier === "strong") {
      return cheapCall(context, context.bigBlind * 4);
    }

    if (context.toCall === 0 && can(context, "check")) {
      return { action: "check", amount: null };
    }

    return { action: "fold", amount: null };
  }

  if (strongPostflop(context)) {
    return can(context, "call") ? { action: "call", amount: null } : fallbackDecision(context);
  }

  if (decentDraw(context)) {
    return cheapCall(context, Math.max(context.bigBlind * 2, Math.floor(context.pot * 0.2)));
  }

  return fallbackDecision(context);
}

function basicLoosePassive(context) {
  if (context.street === "preflop") {
    if (context.hole.tier === "premium") {
      return can(context, "raise") ? raiseTo(context, context.minRaiseTo) : fallbackDecision(context);
    }

    if (speculativeOrBetter(context) || latePosition(context)) {
      return cheapCall(context, Math.max(context.bigBlind * 6, Math.floor(context.pot * 0.4)));
    }

    return fallbackDecision(context);
  }

  if (strongPostflop(context) || decentDraw(context) || context.postflop.category >= 1) {
    return cheapCall(context, Math.max(context.bigBlind * 4, Math.floor(context.pot * 0.35)));
  }

  return fallbackDecision(context);
}

function basicTightAggressive(context) {
  if (context.street === "preflop") {
    if (premiumOrStrong(context)) {
      return potSizedRaise(context, context.hole.tier === "premium" ? 0.9 : 0.55);
    }

    if (context.toCall === 0 && context.hole.tier === "speculative" && latePosition(context)) {
      return { action: "check", amount: null };
    }

    return can(context, "check") ? { action: "check", amount: null } : { action: "fold", amount: null };
  }

  if (strongPostflop(context)) {
    return can(context, "raise") ? potSizedRaise(context, 0.7) : fallbackDecision(context);
  }

  if (decentDraw(context)) {
    return cheapCall(context, Math.floor(context.pot * 0.25));
  }

  return fallbackDecision(context);
}

function basicLooseAggressive(context) {
  if (context.street === "preflop") {
    if (premiumOrStrong(context) || (latePosition(context) && context.hole.tier === "speculative")) {
      return can(context, "raise") ? potSizedRaise(context, 0.8) : fallbackDecision(context);
    }

    if (speculativeOrBetter(context)) {
      return cheapCall(context, Math.floor(context.pot * 0.5) + context.bigBlind * 2);
    }

    return fallbackDecision(context);
  }

  if (strongPostflop(context) || decentDraw(context)) {
    return can(context, "raise") && Math.random() < 0.55
      ? potSizedRaise(context, 0.65)
      : fallbackDecision(context);
  }

  if (can(context, "check") && Math.random() < 0.25) {
    return { action: "check", amount: null };
  }

  return fallbackDecision(context);
}

function mediumPositionAware(context) {
  if (context.street === "preflop") {
    if (earlyPosition(context) && context.hole.tier === "weak") {
      return can(context, "check") ? { action: "check", amount: null } : { action: "fold", amount: null };
    }

    if (latePosition(context) && speculativeOrBetter(context)) {
      return can(context, "raise") ? potSizedRaise(context, 0.6) : fallbackDecision(context);
    }

    if (premiumOrStrong(context)) {
      return can(context, "raise") ? potSizedRaise(context, 0.75) : fallbackDecision(context);
    }

    return cheapCall(context, context.bigBlind * 3);
  }

  if (latePosition(context) && can(context, "raise") && (strongPostflop(context) || decentDraw(context))) {
    return potSizedRaise(context, 0.5);
  }

  return strongPostflop(context) ? fallbackDecision(context) : basicTightPassive(context);
}

function mediumPotOdds(context) {
  const price = context.toCall === 0 ? 0 : context.toCall / Math.max(1, context.pot + context.toCall);

  if (context.street === "preflop") {
    if (premiumOrStrong(context)) {
      return can(context, "raise") ? potSizedRaise(context, 0.7) : fallbackDecision(context);
    }

    if ((context.hole.tier === "speculative" && price <= 0.18) || price <= 0.12) {
      return cheapCall(context, context.toCall);
    }

    return fallbackDecision(context);
  }

  if (strongPostflop(context)) {
    return can(context, "raise") && price < 0.3 ? potSizedRaise(context, 0.55) : fallbackDecision(context);
  }

  if (decentDraw(context) && price <= 0.22) {
    return cheapCall(context, context.toCall);
  }

  if (context.postflop.category >= 1 && price <= 0.18) {
    return cheapCall(context, context.toCall);
  }

  return fallbackDecision(context);
}

function mediumSemiBluff(context) {
  if (context.street === "preflop") {
    return context.hole.tier === "speculative" && latePosition(context)
      ? potSizedRaise(context, 0.55)
      : basicLooseAggressive(context);
  }

  if (decentDraw(context) && can(context, "raise")) {
    return potSizedRaise(context, 0.7);
  }

  if (strongPostflop(context)) {
    return potSizedRaise(context, 0.6);
  }

  return fallbackDecision(context);
}

function mediumStackPressure(context) {
  if (shortStack(context)) {
    if (premiumOrStrong(context) || strongPostflop(context) || decentDraw(context)) {
      return can(context, "all-in") ? { action: "all-in", amount: null } : fallbackDecision(context);
    }

    return fallbackDecision(context);
  }

  if (context.street === "preflop" && premiumOrStrong(context)) {
    return can(context, "raise") ? potSizedRaise(context, 0.8) : fallbackDecision(context);
  }

  if (context.playersRemaining <= 3 && (strongPostflop(context) || decentDraw(context))) {
    return can(context, "raise") ? potSizedRaise(context, 0.75) : fallbackDecision(context);
  }

  return basicTightAggressive(context);
}

function advancedRangePressure(context) {
  if (context.street === "preflop") {
    if (latePosition(context) && context.playersRemaining <= 5 && context.hole.tier !== "weak") {
      return potSizedRaise(context, 0.75);
    }

    if (premiumOrStrong(context)) {
      return potSizedRaise(context, 0.85);
    }

    return mediumPositionAware(context);
  }

  if (context.playersRemaining <= 3 && can(context, "raise") && (strongPostflop(context) || decentDraw(context))) {
    return potSizedRaise(context, 0.8);
  }

  return mediumSemiBluff(context);
}

function advancedBoardTexture(context) {
  if (context.street === "preflop") {
    return mediumPositionAware(context);
  }

  if (context.postflop.boardTexture === "dry" && can(context, "raise") && context.postflop.category >= 1) {
    return potSizedRaise(context, 0.5);
  }

  if (context.postflop.boardTexture === "wet" && !strongPostflop(context) && !decentDraw(context)) {
    return fallbackDecision(context);
  }

  if (strongPostflop(context) || decentDraw(context)) {
    return can(context, "raise") ? potSizedRaise(context, 0.65) : fallbackDecision(context);
  }

  return fallbackDecision(context);
}

function advancedExploitative(context) {
  if (context.street === "preflop") {
    if (context.playersRemaining <= 4 && context.toCall <= context.bigBlind * 2 && speculativeOrBetter(context)) {
      return potSizedRaise(context, 0.7);
    }

    return mediumPositionAware(context);
  }

  if (context.toCall > 0 && context.toCall >= context.playerStack * 0.45) {
    return strongPostflop(context) || decentDraw(context)
      ? (can(context, "all-in") ? { action: "all-in", amount: null } : fallbackDecision(context))
      : { action: "fold", amount: null };
  }

  if (can(context, "raise") && (strongPostflop(context) || (decentDraw(context) && Math.random() < 0.5))) {
    return potSizedRaise(context, 0.75);
  }

  return fallbackDecision(context);
}

function advancedBalanced(context) {
  const roll = Math.random();

  if (context.street === "preflop") {
    if (premiumOrStrong(context)) {
      return roll < 0.75 ? potSizedRaise(context, 0.7) : fallbackDecision(context);
    }

    if (context.hole.tier === "speculative" && latePosition(context)) {
      return roll < 0.4 ? potSizedRaise(context, 0.55) : cheapCall(context, context.bigBlind * 4);
    }

    return fallbackDecision(context);
  }

  if (strongPostflop(context)) {
    return roll < 0.6 && can(context, "raise") ? potSizedRaise(context, 0.6) : fallbackDecision(context);
  }

  if (decentDraw(context)) {
    return roll < 0.35 && can(context, "raise") ? potSizedRaise(context, 0.5) : cheapCall(context, Math.floor(context.pot * 0.22));
  }

  return fallbackDecision(context);
}

export const STRATEGY_CATALOG = [
  {
    id: "basic-tight-passive",
    name: "Tight Passive",
    category: BASIC,
    description: "Plays fewer hands and avoids marginal aggression.",
    decide: basicTightPassive
  },
  {
    id: "basic-loose-passive",
    name: "Loose Passive",
    category: BASIC,
    description: "Sees more flops and prefers calling over raising.",
    decide: basicLoosePassive
  },
  {
    id: "basic-tight-aggressive",
    name: "Tight Aggressive",
    category: BASIC,
    description: "Plays stronger ranges and pushes value hands.",
    decide: basicTightAggressive
  },
  {
    id: "basic-loose-aggressive",
    name: "Loose Aggressive",
    category: BASIC,
    description: "Opens wider and pressures draws and medium strength hands.",
    decide: basicLooseAggressive
  },
  {
    id: "medium-position-aware",
    name: "Position Aware",
    category: MEDIUM,
    description: "Widens up in late position and tightens in early seats.",
    decide: mediumPositionAware
  },
  {
    id: "medium-pot-odds",
    name: "Pot Odds",
    category: MEDIUM,
    description: "Calls more when the price is favorable for draws or medium hands.",
    decide: mediumPotOdds
  },
  {
    id: "medium-semi-bluff",
    name: "Semi Bluff",
    category: MEDIUM,
    description: "Raises draws and mix-bluffs more often postflop.",
    decide: mediumSemiBluff
  },
  {
    id: "medium-stack-pressure",
    name: "Stack Pressure",
    category: MEDIUM,
    description: "Adjusts aggression for short stacks and heads-up pressure spots.",
    decide: mediumStackPressure
  },
  {
    id: "advanced-range-pressure",
    name: "Range Pressure",
    category: ADVANCED,
    description: "Attacks when perceived ranges are capped or positions are weak.",
    decide: advancedRangePressure
  },
  {
    id: "advanced-board-texture",
    name: "Board Texture",
    category: ADVANCED,
    description: "Changes aggression based on dry versus coordinated boards.",
    decide: advancedBoardTexture
  },
  {
    id: "advanced-exploitative",
    name: "Exploitative",
    category: ADVANCED,
    description: "Leans into pressure or caution based on current pot and stack pressure.",
    decide: advancedExploitative
  },
  {
    id: "advanced-balanced",
    name: "Balanced Mix",
    category: ADVANCED,
    description: "Adds frequency-based mixing to avoid one-note decisions.",
    decide: advancedBalanced
  }
];

const STRATEGY_MAP = new Map(STRATEGY_CATALOG.map((strategy) => [strategy.id, strategy]));
const CATEGORIES = [
  { id: BASIC, name: "Basic Strategy" },
  { id: MEDIUM, name: "Medium Level" },
  { id: ADVANCED, name: "Advanced Level" }
];

export const DEFAULT_ENABLED_STRATEGY_IDS = STRATEGY_CATALOG
  .filter((strategy) => strategy.category === BASIC)
  .map((strategy) => strategy.id);

export function sanitizeEnabledStrategyIds(enabledStrategyIds) {
  const provided = Array.isArray(enabledStrategyIds) ? enabledStrategyIds : DEFAULT_ENABLED_STRATEGY_IDS;
  const filtered = provided.filter((id) => STRATEGY_MAP.has(id));
  return filtered.length > 0 ? [...new Set(filtered)] : [...DEFAULT_ENABLED_STRATEGY_IDS];
}

function randomWeights(strategyIds) {
  const rawWeights = strategyIds.map(() => 0.05 + Math.random() ** 2);
  const total = rawWeights.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(strategyIds.map((id, index) => [id, Number((rawWeights[index] / total).toFixed(4))]));
}

export function createStrategyState(players, userSeat, enabledStrategyIds = DEFAULT_ENABLED_STRATEGY_IDS) {
  const enabledIds = sanitizeEnabledStrategyIds(enabledStrategyIds);
  const botProfiles = {};

  for (const player of players) {
    if (player.seat === userSeat) {
      continue;
    }

    botProfiles[player.seat] = randomWeights(enabledIds);
  }

  return {
    enabledStrategyIds: enabledIds,
    botProfiles
  };
}

export function updateStrategyState(players, userSeat, enabledStrategyIds) {
  return createStrategyState(players, userSeat, enabledStrategyIds);
}

function equalWeights(strategyIds) {
  const weight = Number((1 / strategyIds.length).toFixed(4));
  return Object.fromEntries(strategyIds.map((id) => [id, weight]));
}

function pickWeightedStrategy(weights, enabledStrategyIds) {
  const ids = enabledStrategyIds.filter((id) => (weights[id] ?? 0) > 0);
  const activeIds = ids.length > 0 ? ids : enabledStrategyIds;
  const sourceWeights = ids.length > 0 ? weights : equalWeights(enabledStrategyIds);
  let cursor = Math.random();

  for (const id of activeIds) {
    cursor -= sourceWeights[id] ?? 0;
    if (cursor <= 0) {
      return id;
    }
  }

  return activeIds[activeIds.length - 1];
}

export function chooseBotAction(context, strategyState, seat) {
  const enabledStrategyIds = sanitizeEnabledStrategyIds(strategyState?.enabledStrategyIds);
  const weights = strategyState?.botProfiles?.[seat] ?? equalWeights(enabledStrategyIds);
  const selectedStrategyId = pickWeightedStrategy(weights, enabledStrategyIds);
  const strategy = STRATEGY_MAP.get(selectedStrategyId);
  const decision = strategy?.decide(context) ?? fallbackDecision(context);

  if (decision.action === "raise" && can(context, "raise")) {
    return {
      action: "raise",
      amount: Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, Math.round(decision.amount / context.smallBlind) * context.smallBlind))
    };
  }

  if (decision.action && can(context, decision.action)) {
    return {
      action: decision.action,
      amount: decision.amount ?? null
    };
  }

  return fallbackDecision(context);
}

export function serializeStrategyMenu(enabledStrategyIds) {
  const enabled = new Set(sanitizeEnabledStrategyIds(enabledStrategyIds));
  return CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    strategies: STRATEGY_CATALOG
      .filter((strategy) => strategy.category === category.id)
      .map((strategy) => ({
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        enabled: enabled.has(strategy.id)
      }))
  }));
}

export function serializeBotStrategyProfile(strategyState, seat) {
  const enabledStrategyIds = sanitizeEnabledStrategyIds(strategyState?.enabledStrategyIds);
  const weights = strategyState?.botProfiles?.[seat] ?? equalWeights(enabledStrategyIds);

  return enabledStrategyIds
    .map((id) => ({
      id,
      name: STRATEGY_MAP.get(id)?.name ?? id,
      weight: weights[id] ?? 0
    }))
    .filter((entry) => entry.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      percent: Math.round(entry.weight * 100)
    }));
}
