import { ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';

export type ActorStatType = 'number' | 'percentage' | 'rating' | 'letter grade' | 'option' | 'text' | 'checkbox';
export type ActorStatValue = number | string | boolean;

const NUMERIC_ACTOR_STAT_DISPLAY_TYPES: ActorStatType[] = ['number', 'percentage', 'rating', 'letter grade'];

export const isNumericDisplayType = (displayType: ActorStatType): boolean => NUMERIC_ACTOR_STAT_DISPLAY_TYPES.includes(displayType);

export type ActorStatOption = {
    name: string;
    description: string;
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
    name: stat.name,
    description: stat.description,
    perActor: stat.perActor === true,
    perActorDefaultRules: cloneActorStatValueRules(stat.perActorDefaultRules),
    guidance: stat.guidance,
    default: typeof stat.default === 'boolean' ? stat.default : (typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : (stat.type === 'checkbox' ? false : 0)),
    type: stat.type,
    options: (stat.options || []).map((option) => ({
        name: option.name,
        description: option.description,
    })),
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
    setByPlayer: stat.setByPlayer === true || stat.exposed === true,
    exposed: stat.exposed === true,
    iconName: stat.iconName || (stat.type === 'rating' ? 'star' : undefined),
    labelIconName: stat.labelIconName || undefined,
});

export const isNumericActorStat = (stat: ActorStat): boolean => isNumericDisplayType(stat.type);

export const resolveActorStatDefault = (stat: ActorStat): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === 'string' && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || '';
    }

    if (stat.type === 'text') {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

export const normalizeActorStatValue = (value: unknown, stat: ActorStat): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        const fallback = resolveActorStatDefault(stat);
        if (typeof value === 'string' && optionNames.includes(value)) {
            return value;
        }
        return typeof fallback === 'string' ? fallback : '';
    }

    if (stat.type === 'text') {
        if (typeof value === 'string') {
            return value;
        }
        const fallback = resolveActorStatDefault(stat);
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
        return typeof resolveActorStatDefault(stat) === 'boolean' ? resolveActorStatDefault(stat) : false;
    }

    let resolved = Number.isFinite(value) ? Number(value) : Number(resolveActorStatDefault(stat)) || 0;
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