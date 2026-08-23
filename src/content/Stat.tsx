import { v4 as generateUuid } from 'uuid';
import { ActorConditionTarget, ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';

// 'location' stats hold a location ID (a key into the save's atlas) rather than a display value.
// 'locationList' stats hold a set of location IDs (chosen via a multi-select picker) rather than a single value.
export type StatType = 'number' | 'option' | 'text' | 'checkbox' | 'location' | 'locationList';
export type StatDisplayType = 'straight' | 'percentage' | 'bar' | 'rating' | 'letter grade';
export type StatValue = number | string | boolean | string[];

export const isNumericDisplayType = (type: StatType): boolean => type === 'number';

export const isLocationDisplayType = (type: StatType): boolean => type === 'location';

export const isLocationListDisplayType = (type: StatType): boolean => type === 'locationList';

export const normalizeLocationListValue = (value: unknown): string[] => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

// Resolves the effective display style for a numeric stat, defaulting to a plain number.
export const resolveStatDisplayType = (stat: Stat): StatDisplayType => (stat.type === 'number' ? (stat.displayType || 'straight') : 'straight');

export type StatOption = {
    name: string;
    description: string;
};

type StatValueOptions = {
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
export type StatValueRule = {
    id: string;
    value: StatValue;
    conditions: ConditionCollection[];
};

// Represents a custom stat that applies to all actors in the game.
export type Stat = {
    id: string;
    name: string;
    description: string;
    // When true, this stat's value on a given actor is a mapping of target actorId to a value of `type`
    // (e.g. the host actor's affinity toward each other actor), rather than a single scalar value.
    perActor?: boolean;
    // Rules used to resolve a default value for a given target actor when perActor is true and neither the
    // host actor's own perActorValueRules nor an explicit override provide a value. Evaluated in order.
    perActorDefaultRules?: StatValueRule[];
    // For global stats: rules used to resolve this stat's initial value when a new game starts, evaluated in
    // order (first matching wins); falls back to `default` if none match. See applyGlobalStatDefaults.
    defaultValueRules?: StatValueRule[];
    guidance: string;
    default: StatValue;
    type: StatType;
    // Only meaningful when type is 'number'; controls how the numeric value is rendered (straight number, bar, etc).
    displayType?: StatDisplayType;
    options?: StatOption[];
    min?: number;
    max?: number;
    setByPlayer: boolean;
    exposed: boolean;
    iconName?: string;
    labelIconName?: string;
};

type StatTextContext = {
    getPlayerActor?: () => { name?: string } | undefined;
    primaryUser?: { name?: string };
};

export const applyUserPlaceholder = (rawText: string | undefined, playerName: string): string => (
    String(rawText || '').replace(/\{\{\s*user\s*\}\}/gi, playerName || 'the player')
);

export const resolveStatText = (
    rawText: string | undefined,
    stage?: StatTextContext | null,
): string => applyUserPlaceholder(rawText, stage?.getPlayerActor?.()?.name || stage?.primaryUser?.name || 'the player');

export const cloneStatValueRule = (rule: StatValueRule): StatValueRule => ({
    id: rule.id,
    value: typeof rule.value === 'boolean' || typeof rule.value === 'number' || typeof rule.value === 'string' ? rule.value : 0,
    conditions: (rule.conditions || []).map((collection) => [...collection]),
});

export const cloneStatValueRules = (rules: StatValueRule[] | undefined): StatValueRule[] => (rules || []).map(cloneStatValueRule);

export const cloneStat = (stat: Stat): Stat => ({
    id: stat.id || generateUuid(),
    name: stat.name,
    description: stat.description,
    perActor: stat.perActor === true,
    perActorDefaultRules: cloneStatValueRules(stat.perActorDefaultRules),
    defaultValueRules: cloneStatValueRules(stat.defaultValueRules),
    guidance: stat.guidance,
    default: stat.type === 'locationList'
        ? normalizeLocationListValue(stat.default)
        : (typeof stat.default === 'boolean' ? stat.default : (typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : (stat.type === 'checkbox' ? false : 0))),
    type: stat.type,
    displayType: stat.type === 'number' ? (stat.displayType || 'straight') : undefined,
    options: (stat.options || []).map((option) => ({
        name: option.name,
        description: option.description,
    })),
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
    setByPlayer: stat.setByPlayer === true,
    exposed: stat.exposed === true,
    iconName: stat.iconName || (stat.displayType === 'rating' ? 'star' : undefined),
    labelIconName: stat.labelIconName || undefined,
});

export const resolveStatDefault = (stat: Stat, options: StatValueOptions = {}): StatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === 'string' && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || '';
    }

    if (stat.type === 'locationList') {
        return normalizeLocationListValue(stat.default);
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

export const normalizeStatValue = (value: unknown, stat: Stat, options: StatValueOptions = {}): StatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        const fallback = resolveStatDefault(stat, options);
        if (typeof value === 'string' && optionNames.includes(value)) {
            return value;
        }
        return typeof fallback === 'string' ? fallback : '';
    }

    if (stat.type === 'locationList') {
        return Array.isArray(value) ? normalizeLocationListValue(value) : normalizeLocationListValue(resolveStatDefault(stat, options));
    }

    if (stat.type === 'text' || stat.type === 'location') {
        if (typeof value === 'string') {
            return value;
        }
        const fallback = resolveStatDefault(stat, options);
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
        return typeof resolveStatDefault(stat, options) === 'boolean' ? resolveStatDefault(stat, options) : false;
    }

    const expressionValue = options.evaluateDiceNotation ? evaluateNumericStatExpression(value) : undefined;
    let resolved = Number.isFinite(value)
        ? Number(value)
        : expressionValue !== undefined
            ? expressionValue
            : Number(resolveStatDefault(stat, options)) || 0;
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
    rules: StatValueRule[] | undefined,
    stat: Stat,
    context: ConditionContext,
): StatValue | undefined => {
    const matchedRule = (rules || []).find((rule) => evaluateConditionCollections(rule.conditions, context));
    return matchedRule ? normalizeStatValue(matchedRule.value, stat) : undefined;
};

// Generic alias for resolvePerActorValueRule; used wherever an ordered StatValueRule list needs to be
// resolved but there is no per-actor target involved (e.g. a global stat's defaultValueRules at game start).
export const resolveStatValueRule = resolvePerActorValueRule;

export type StatUpdateTargetType = 'player' | 'actor';
export type StatUpdateOperation = 'set' | 'adjust';

// A single stat write performed by a StatUpdateRule. Shares StatValue (and, for numeric stats, the same
// dice/relative expression support) with StatValueRule so both rule flavors can use the same editors.
export type StatUpdate = {
    id: string;
    targetType: StatUpdateTargetType;
    // Only meaningful for 'actor' updates: 'any' targets every active actor, otherwise a specific actor id.
    actorId: ActorConditionTarget;
    statId: string;
    operation: StatUpdateOperation;
    value: StatValue;
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
export const applyStatUpdateValue = (currentValue: StatValue | undefined, update: StatUpdate, stat: Stat): StatValue => {
    if (!isNumericDisplayType(stat.type)) {
        return normalizeStatValue(update.value, stat);
    }

    const amount = evaluateNumericStatExpression(update.value);
    if (amount === undefined) {
        return normalizeStatValue(currentValue, stat);
    }

    if (update.operation === 'set') {
        return normalizeStatValue(amount, stat);
    }

    const base = Number.isFinite(currentValue) ? Number(currentValue) : Number(resolveStatDefault(stat)) || 0;
    return normalizeStatValue(base + amount, stat);
};