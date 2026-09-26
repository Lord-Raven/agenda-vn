import { CalendarTimeOfDay } from './CalendarEvent';
import { normalizeStatValue, type Stat, type StatValue } from './Stat';

export type ConditionComparison = 'equals' | 'notEquals' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual';
// The kinds of stat-bearing content that conditions, stat updates, reference stats, and scripts can target.
export type ContentType = 'actor' | 'location' | 'item';
export const CONTENT_TYPES: ContentType[] = ['actor', 'location', 'item'];
// 'any'/'none'/'variable' are meta-targets (see resolveConditionContentSubjects); anything else is a specific
// content (actor/location/item) id.
export type ContentTarget = 'any' | 'none' | 'variable' | string;

export type CalendarCondition = {
    type: 'calendar';
    field: 'timeOfDay' | 'dayOfWeek' | 'day' | 'month' | 'year';
    comparison: ConditionComparison;
    value: string | number;
};

export type GlobalStatCondition = {
    type: 'globalStat';
    statId: string;
    comparison: ConditionComparison;
    value: string | number | boolean;
};

export type ContentStatCondition = {
    type: 'contentStat';
    contentType: ContentType;
    targetId: ContentTarget;
    statId: string;
    comparison: ConditionComparison;
    value: string | number | boolean;
};

// Checks the identity of the context-specific ('variable') entity of `contentType` against a specific entity
// chosen in the UI. Only meaningful where such a variable entity is bound (e.g. context.currentActor during
// perActor stat rules), so it has no target of its own.
export type ContentIdentityCondition = {
    type: 'contentIdentity';
    contentType: ContentType;
    comparison: 'equals' | 'notEquals';
    value: string;
};

export type Condition = CalendarCondition | GlobalStatCondition | ContentStatCondition | ContentIdentityCondition;

// A ConditionCollection is an array of Condition objects, where all conditions must be satisfied for the collection to be considered true.
export type ConditionCollection = Condition[];

export type ConditionEntity = { id?: string; name?: string; statMap?: Record<string, StatValue>; active?: boolean; generic?: boolean; status?: string };
export type ConditionEntityCollection = ConditionEntity[] | Record<string, ConditionEntity>;

// Field names mirror SaveType (actors/atlas/inventory) so a spread save works as a context directly.
export type ConditionContext = {
    currentDate?: string;
    currentTimeOfDay?: CalendarTimeOfDay;
    globalStatValues?: Record<string, StatValue>;
    globalStats?: Stat[];
    actorStats?: Stat[];
    locationStats?: Stat[];
    itemStats?: Stat[];
    actors?: ConditionEntityCollection;
    atlas?: ConditionEntityCollection;
    inventory?: ConditionEntityCollection;
    currentActor?: ConditionEntity;
    currentLocation?: ConditionEntity;
    currentItem?: ConditionEntity;
    actorStatValues?: Record<string, Record<string, StatValue>>;
};

const CONTENT_CONTEXT_KEYS = {
    actor: { entities: 'actors', stats: 'actorStats', current: 'currentActor' },
    location: { entities: 'atlas', stats: 'locationStats', current: 'currentLocation' },
    item: { entities: 'inventory', stats: 'itemStats', current: 'currentItem' },
} as const;

export const getContextContentStats = (context: ConditionContext, contentType: ContentType): Stat[] => (
    context[CONTENT_CONTEXT_KEYS[contentType].stats] || []
);

export const getContextContentEntities = (context: ConditionContext, contentType: ContentType): ConditionEntity[] => {
    const collection = context[CONTENT_CONTEXT_KEYS[contentType].entities];
    const entities = Array.isArray(collection) ? collection : collection ? Object.values(collection) : [];
    return entities.filter((entity) => entity && entity.active !== false);
};

// The 'variable' entity of a content type; a keyed (single-entry) collection doubles as the bound entity.
export const getContextCurrentContent = (context: ConditionContext, contentType: ContentType): ConditionEntity | undefined => {
    const keys = CONTENT_CONTEXT_KEYS[contentType];
    const collection = context[keys.entities];
    return context[keys.current] || (collection && !Array.isArray(collection) ? Object.values(collection)[0] : undefined);
};

const TIME_OF_DAY_VALUES: Record<CalendarTimeOfDay, number> = {
    morning: 0,
    afternoon: 1,
    evening: 2,
    night: 3,
};

// Dice notation support (e.g. "1d6+1") for condition target values. Rolls must be deterministic for a given
// condition at a given point in the in-game calendar, so the same condition evaluated repeatedly at the same
// date/time/actor yields the same result, while distinct conditions (even sharing the same notation) roll
// independently. This is achieved by seeding a PRNG off a hash of the condition's own definition plus the
// relevant context (date, time of day, and - for 'variable' actor targets - the current actor's id).
const DICE_NOTATION_PATTERN = /^(\d*)d(\d+)([+-]\d+)?$/i;

export const isDiceNotation = (value: unknown): value is string => typeof value === 'string' && DICE_NOTATION_PATTERN.test(value.trim());

// FNV-1a string hash, used only to derive a numeric seed for the dice PRNG - not for anything security-sensitive.
export const hashString = (value: string): number => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

// mulberry32 PRNG - small, fast, and deterministic for a given 32-bit seed.
export const createSeededRandom = (seed: number) => {
    let state = seed;
    return () => {
        state |= 0;
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// Deterministically picks an item from a list based on a seed string (e.g. combining a schedule destination,
// the current date/time of day, and a target actor id), so the same inputs always yield the same pick while
// different seeds (different actors, dates, etc.) can pick independently.
export const pickSeededItem = <T,>(items: T[], seed: string): T | undefined => {
    if (items.length === 0) {
        return undefined;
    }
    const random = createSeededRandom(hashString(seed));
    return items[Math.floor(random() * items.length) % items.length];
};

const rollDiceNotation = (notation: string, seed: string): number => {
    const match = notation.trim().match(DICE_NOTATION_PATTERN);
    if (!match) {
        return NaN;
    }
    const count = match[1] ? parseInt(match[1], 10) : 1;
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;
    const random = createSeededRandom(hashString(seed));
    let total = modifier;
    for (let roll = 0; roll < count; roll++) {
        total += Math.floor(random() * sides) + 1;
    }
    return total;
};

// Builds a seed identifying "this condition, at this point in the game" - the condition's own definition
// (which includes its dice notation value) plus the parts of context that could vary its meaning.
const buildDiceSeed = (condition: Condition, context: ConditionContext): string => {
    const variableTargetId = condition.type === 'contentStat' && condition.targetId === 'variable' ? (getContextCurrentContent(context, condition.contentType)?.id || '') : '';
    return `${JSON.stringify(condition)}|${context.currentDate || ''}|${context.currentTimeOfDay || ''}|${variableTargetId}`;
};

// Resolves a condition's target value, rolling dice notation deterministically if present.
const resolveConditionValue = (condition: Condition, context: ConditionContext): string | number | boolean => {
    const value = (condition as GlobalStatCondition | ContentStatCondition | CalendarCondition).value;
    return isDiceNotation(value) ? rollDiceNotation(value, buildDiceSeed(condition, context)) : value;
};

const normalizeStatConditionValue = (value: string | number | boolean, stat: Stat | undefined): string | number | boolean => {
    if (!stat || stat.type !== 'option') {
        return value;
    }
    const normalized = normalizeStatValue(value, stat);
    return typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean' ? normalized : value;
};

const compareValues = (actual: StatValue | undefined, expected: string | number | boolean, comparison: ConditionComparison): boolean => {
    if (actual === undefined || Array.isArray(actual)) {
        return false;
    }

    const numericActual = typeof actual === 'number' || typeof actual === 'boolean' ? Number(actual) : Number(actual);
    const numericExpected = typeof expected === 'number' || typeof expected === 'boolean' ? Number(expected) : Number(expected);
    const canCompareNumerically = Number.isFinite(numericActual) && Number.isFinite(numericExpected);
    const left = canCompareNumerically ? numericActual : String(actual).toLowerCase();
    const right = canCompareNumerically ? numericExpected : String(expected).toLowerCase();

    switch (comparison) {
        case 'equals': return left === right;
        case 'notEquals': return left !== right;
        case 'greaterThan': return left > right;
        case 'greaterThanOrEqual': return left >= right;
        case 'lessThan': return left < right;
        case 'lessThanOrEqual': return left <= right;
    }
};

const getCalendarValue = (condition: CalendarCondition, context: ConditionContext): string | number | undefined => {
    if (condition.field === 'timeOfDay') {
        if (!context.currentTimeOfDay) {
            return undefined;
        }
        return typeof condition.value === 'number'
            ? TIME_OF_DAY_VALUES[context.currentTimeOfDay]
            : context.currentTimeOfDay;
    }

    if (!context.currentDate) {
        return undefined;
    }
    const date = new Date(`${context.currentDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    switch (condition.field) {
        case 'dayOfWeek': return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
        case 'day': return date.getUTCDate();
        case 'month': return date.getUTCMonth() + 1;
        case 'year': return date.getUTCFullYear();
        default: return undefined;
    }
};

// Resolves which entities a content condition's target refers to: 'any'/'none' check every active entity of
// the content type, 'variable' refers to the one currently under consideration (see getContextCurrentContent),
// and any other value is a specific entity id.
const resolveConditionContentSubjects = (contentType: ContentType, targetId: ContentTarget, context: ConditionContext): { mode: 'any' | 'none' | 'single'; entities: ConditionEntity[] } => {
    if (targetId === 'variable') {
        const current = getContextCurrentContent(context, contentType);
        return { mode: 'single', entities: current ? [current] : [] };
    }

    const entities = getContextContentEntities(context, contentType);
    if (targetId === 'any' || targetId === 'none') {
        return { mode: targetId, entities };
    }
    return { mode: 'single', entities: entities.filter((entity) => entity.id === targetId).slice(0, 1) };
};

export const evaluateContentStatCondition = (condition: ContentStatCondition, context: ConditionContext): boolean => {
    const { mode, entities } = resolveConditionContentSubjects(condition.contentType, condition.targetId, context);
    const stat = getContextContentStats(context, condition.contentType).find(candidate => candidate.id === condition.statId);
    const resolvedValue = normalizeStatConditionValue(resolveConditionValue(condition, context), stat);
    const matches = (entity: ConditionEntity) => compareValues(stat ? normalizeStatValue(entity.statMap?.[stat.id], stat) : undefined, resolvedValue, condition.comparison);

    if (mode === 'any') return entities.some(matches);
    if (mode === 'none') return !entities.some(matches);
    return entities.length > 0 && matches(entities[0]);
};

export const evaluateContentIdentityCondition = (condition: ContentIdentityCondition, context: ConditionContext): boolean => {
    const current = getContextCurrentContent(context, condition.contentType);
    return !!current && compareValues(current.id, condition.value, condition.comparison);
};

export const evaluateCondition = (condition: Condition, context: ConditionContext): boolean => {
    if (condition.type === 'calendar') {
        const actual = getCalendarValue(condition, context);
        return compareValues(actual, resolveConditionValue(condition, context), condition.comparison);
    }

    if (condition.type === 'globalStat') {
        const stat = context.globalStats?.find(candidate => candidate.id === condition.statId);
        const actual = stat ? normalizeStatValue(context.globalStatValues?.[condition.statId], stat) : undefined;
        return compareValues(actual, normalizeStatConditionValue(resolveConditionValue(condition, context), stat), condition.comparison);
    }

    if (condition.type === 'contentIdentity') {
        return evaluateContentIdentityCondition(condition, context);
    }

    return evaluateContentStatCondition(condition, context);
};

export const evaluateConditionCollection = (conditionCollection: ConditionCollection, context: ConditionContext): boolean => {
    return conditionCollection.every((condition) => evaluateCondition(condition, context));
};

export const evaluateConditionCollections = (conditionCollections: ConditionCollection[] | undefined, context: ConditionContext, returnDefault: boolean = true): boolean => {
    if (conditionCollections && conditionCollections.length > 0) {
        return conditionCollections.some((collection) => evaluateConditionCollection(collection, context));
    }
    return returnDefault;
};

// Whether any condition depends on a bound 'variable' entity (of `contentType`, or of any type if omitted).
export const hasVariableContentTarget = (conditionCollections: ConditionCollection[] | undefined, contentType?: ContentType): boolean => {
    return !!conditionCollections?.some((collection) => collection.some((condition) => {
        const isVariable = condition.type === 'contentIdentity' || (condition.type === 'contentStat' && condition.targetId === 'variable');
        return isVariable && (!contentType || condition.contentType === contentType);
    }));
};