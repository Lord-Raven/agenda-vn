import { v4 as generateUuid } from 'uuid';
import { ActorConditionTarget, ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';

// 'location' stats hold a location ID (a key into the save's atlas) rather than a display value.
export type ActorStatType = 'number' | 'option' | 'text' | 'checkbox' | 'location';
export type ActorStatDisplayType = 'straight' | 'percentage' | 'bar' | 'rating' | 'letter grade';
export type ActorStatValue = number | string | boolean;

export const isNumericDisplayType = (type: ActorStatType): boolean => type === 'number';

export const isLocationDisplayType = (type: ActorStatType): boolean => type === 'location';

// Resolves the effective display style for a numeric stat, defaulting to a plain number.
export const resolveActorStatDisplayType = (stat: ActorStat): ActorStatDisplayType => (stat.type === 'number' ? (stat.displayType || 'straight') : 'straight');

export type ActorStatOption = {
    name: string;
    description: string;
};

type ActorStatValueOptions = {
    evaluateDiceNotation?: boolean;
};

const DICE_EXPRESSION_PATTERN = /^\s*[+-]?\s*(?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*\s*$/i;

const rollDie = (sides: number): number => Math.floor(Math.random() * sides) + 1;

export const evaluateNumericStatExpression = (value: unknown): number | undefined => {
    if (Number.isFinite(value)) {
        return Number(value);
    }

    if (typeof value !== 'string') {
        return undefined;
    }

    const expression = value.trim();
    if (!expression || !DICE_EXPRESSION_PATTERN.test(expression)) {
        return undefined;
    }

    const terms = expression.match(/[+-]?\s*(?:\d*d\d+|\d+)/gi) || [];
    let total = 0;

    for (const rawTerm of terms) {
        const compactTerm = rawTerm.replace(/\s+/g, '').toLowerCase();
        const sign = compactTerm.startsWith('-') ? -1 : 1;
        const unsignedTerm = compactTerm.replace(/^[+-]/, '');

        if (unsignedTerm.includes('d')) {
            const [countText, sidesText] = unsignedTerm.split('d');
            const count = countText === '' ? 1 : Number(countText);
            const sides = Number(sidesText);
            if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || sides < 1 || count > 100 || sides > 10000) {
                return undefined;
            }
            for (let rollIndex = 0; rollIndex < count; rollIndex += 1) {
                total += sign * rollDie(sides);
            }
            continue;
        }

        const numericValue = Number(unsignedTerm);
        if (!Number.isFinite(numericValue)) {
            return undefined;
        }
        total += sign * numericValue;
    }

    return total;
};

// A single rule used to resolve a per-actor stat's value for a given target actor; rules are evaluated in
// order and the first whose conditions are satisfied wins (conditions may reference the target via the
// 'variable' actor target so they can inspect the target actor's own stats).
export type ActorStatValueRule = {
    id: string;
    value: ActorStatValue;
    conditions: ConditionCollection[];
};

// Represents a custom stat that applies to all actors in the game.
export type ActorStat = {
    id: string;
    name: string;
    description: string;
    // When true, this stat's value on a given actor is a mapping of target actorId to a value of `type`
    // (e.g. the host actor's affinity toward each other actor), rather than a single scalar value.
    perActor?: boolean;
    // Rules used to resolve a default value for a given target actor when perActor is true and neither the
    // host actor's own perActorValueRules nor an explicit override provide a value. Evaluated in order.
    perActorDefaultRules?: ActorStatValueRule[];
    guidance: string;
    default: ActorStatValue;
    type: ActorStatType;
    // Only meaningful when type is 'number'; controls how the numeric value is rendered (straight number, bar, etc).
    displayType?: ActorStatDisplayType;
    options?: ActorStatOption[];
    min?: number;
    max?: number;
    setByPlayer: boolean;
    exposed: boolean;
    iconName?: string;
    labelIconName?: string;
};

type ActorStatTextContext = {
    getPlayerActor?: () => { name?: string } | undefined;
    primaryUser?: { name?: string };
};

export const resolveActorStatText = (
    rawText: string | undefined,
    stage?: ActorStatTextContext | null,
): string => {
    const playerName = stage?.getPlayerActor?.()?.name || stage?.primaryUser?.name || 'the player';
    return String(rawText || '').replace(/\{\{\s*user\s*\}\}/gi, playerName);
};

export const cloneActorStatValueRule = (rule: ActorStatValueRule): ActorStatValueRule => ({
    id: rule.id,
    value: typeof rule.value === 'boolean' || typeof rule.value === 'number' || typeof rule.value === 'string' ? rule.value : 0,
    conditions: (rule.conditions || []).map((collection) => [...collection]),
});

export const cloneActorStatValueRules = (rules: ActorStatValueRule[] | undefined): ActorStatValueRule[] => (rules || []).map(cloneActorStatValueRule);

export const cloneActorStat = (stat: ActorStat): ActorStat => ({
    id: stat.id || generateUuid(),
    name: stat.name,
    description: stat.description,
    perActor: stat.perActor === true,
    perActorDefaultRules: cloneActorStatValueRules(stat.perActorDefaultRules),
    guidance: stat.guidance,
    default: typeof stat.default === 'boolean' ? stat.default : (typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : (stat.type === 'checkbox' ? false : 0)),
    type: stat.type,
    displayType: stat.type === 'number' ? (stat.displayType || 'straight') : undefined,
    options: (stat.options || []).map((option) => ({
        name: option.name,
        description: option.description,
    })),
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
    setByPlayer: stat.setByPlayer === true || stat.exposed === true,
    exposed: stat.exposed === true,
    iconName: stat.iconName || (stat.displayType === 'rating' ? 'star' : undefined),
    labelIconName: stat.labelIconName || undefined,
});

export const isNumericActorStat = (stat: ActorStat): boolean => isNumericDisplayType(stat.type);

export const resolveActorStatDefault = (stat: ActorStat, options: ActorStatValueOptions = {}): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === 'string' && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || '';
    }

    if (stat.type === 'text' || stat.type === 'location') {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }

    if (options.evaluateDiceNotation) {
        return evaluateNumericStatExpression(stat.default) ?? 0;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

export const normalizeActorStatValue = (value: unknown, stat: ActorStat, options: ActorStatValueOptions = {}): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        const fallback = resolveActorStatDefault(stat, options);
        if (typeof value === 'string' && optionNames.includes(value)) {
            return value;
        }
        return typeof fallback === 'string' ? fallback : '';
    }

    if (stat.type === 'text' || stat.type === 'location') {
        if (typeof value === 'string') {
            return value;
        }
        const fallback = resolveActorStatDefault(stat, options);
        return typeof fallback === 'string' ? fallback : '';
    }

    if (stat.type === 'checkbox') {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const lower = value.trim().toLowerCase();
            if (lower === 'true') return true;
            if (lower === 'false') return false;
        }
        return typeof resolveActorStatDefault(stat, options) === 'boolean' ? resolveActorStatDefault(stat, options) : false;
    }

    const expressionValue = options.evaluateDiceNotation ? evaluateNumericStatExpression(value) : undefined;
    let resolved = Number.isFinite(value)
        ? Number(value)
        : expressionValue !== undefined
            ? expressionValue
            : Number(resolveActorStatDefault(stat, options)) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

// Finds the first rule in an ordered list whose conditions are satisfied by the given context (e.g. with
// context.currentActor set to the target actor so 'variable' actor-stat conditions inspect the target).
// Returns undefined if no rule matches, so callers can continue to the next fallback tier.
export const resolvePerActorValueRule = (
    rules: ActorStatValueRule[] | undefined,
    stat: ActorStat,
    context: ConditionContext,
): ActorStatValue | undefined => {
    const matchedRule = (rules || []).find((rule) => evaluateConditionCollections(rule.conditions, context));
    return matchedRule ? normalizeActorStatValue(matchedRule.value, stat) : undefined;
};

export type StatUpdateTargetType = 'player' | 'actor';
export type StatUpdateOperation = 'set' | 'adjust';

// A single stat write performed by a StatUpdateRule. Shares ActorStatValue (and, for numeric stats, the same
// dice/relative expression support) with ActorStatValueRule so both rule flavors can use the same editors.
export type StatUpdate = {
    id: string;
    targetType: StatUpdateTargetType;
    // Only meaningful for 'actor' updates: 'any' targets every active actor, otherwise a specific actor id.
    actorId: ActorConditionTarget;
    statId: string;
    operation: StatUpdateOperation;
    value: ActorStatValue;
};

// A recurring "every <calendar condition> do these things" rule; conditions are the same ConditionCollections
// used by schedules and per-actor default rules, and are re-evaluated for each in-game period entered.
export type StatUpdateRule = {
    id: string;
    conditions: ConditionCollection[];
    updates: StatUpdate[];
};

export const cloneStatUpdate = (update: any): StatUpdate => ({
    id: update?.id || generateUuid(),
    targetType: update?.targetType === 'player' ? 'player' : 'actor',
    actorId: `${update?.actorId || 'any'}`,
    statId: `${update?.statId || ''}`,
    operation: update?.operation === 'set' ? 'set' : 'adjust',
    value: typeof update?.value === 'boolean' || typeof update?.value === 'number' || typeof update?.value === 'string' ? update.value : 0,
});

export const cloneStatUpdateRule = (rule: any): StatUpdateRule => ({
    id: rule?.id || generateUuid(),
    conditions: Array.isArray(rule?.conditions)
        ? rule.conditions.map((collection: unknown) => Array.isArray(collection) ? [...collection] : [])
        : [],
    updates: Array.isArray(rule?.updates) ? rule.updates.map(cloneStatUpdate) : [],
});

export const cloneStatUpdateRules = (rules: unknown): StatUpdateRule[] => (Array.isArray(rules) ? rules : []).map(cloneStatUpdateRule);

// Resolves the value a stat update writes, given the target's current value. Numeric stats evaluate the
// update's value as a dice/relative expression, so 'adjust' adds the rolled amount while 'set' replaces with
// it; non-numeric stats always write a literal value.
export const applyStatUpdateValue = (currentValue: ActorStatValue | undefined, update: StatUpdate, stat: ActorStat): ActorStatValue => {
    if (!isNumericDisplayType(stat.type)) {
        return normalizeActorStatValue(update.value, stat);
    }

    const amount = evaluateNumericStatExpression(update.value);
    if (amount === undefined) {
        return normalizeActorStatValue(currentValue, stat);
    }

    if (update.operation === 'set') {
        return normalizeActorStatValue(amount, stat);
    }

    const base = Number.isFinite(currentValue) ? Number(currentValue) : Number(resolveActorStatDefault(stat)) || 0;
    return normalizeActorStatValue(base + amount, stat);
};