import { CalendarTimeOfDay } from './CalendarEvent';
import type { Stat, StatValue } from './Stat';

export type ConditionComparison = 'equals' | 'notEquals' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual';
export type ActorConditionTarget = 'any' | 'none' | 'variable' | string;

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

export type ActorStatCondition = {
    type: 'actorStat';
    actorId: ActorConditionTarget;
    statId: string;
    comparison: ConditionComparison;
    value: string | number | boolean;
};

// Checks the identity of the context-specific ('variable') actor against a specific actor chosen via an
// actor picker in the UI. Only meaningful where a variable actor exists (e.g. perActor stat rules), so it
// always evaluates against context.currentActor rather than tracking its own actor target.
export type ActorIdentityCondition = {
    type: 'actorIdentity';
    comparison: 'equals' | 'notEquals';
    value: string;
};

export type Condition = CalendarCondition | GlobalStatCondition | ActorStatCondition | ActorIdentityCondition;

// A ConditionCollection is an array of Condition objects, where all conditions must be satisfied for the collection to be considered true.
export type ConditionCollection = Condition[];

export type ConditionContext = {
    currentDate?: string;
    currentTimeOfDay?: CalendarTimeOfDay;
    globalStatValues?: Record<string, StatValue>;
    globalStats?: Stat[];
    actorStats?: Stat[];
    actors?: Array<{ id?: string; name?: string; statMap?: Record<string, StatValue>; generic?: boolean; status?: string }> | Record<string, { id?: string; name?: string; statMap?: Record<string, StatValue>; generic?: boolean; status?: string }>;
    currentActor?: { id?: string; name?: string; statMap?: Record<string, StatValue>; generic?: boolean; status?: string };
    actorStatValues?: Record<string, Record<string, StatValue>>;
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
    const variableActorId = condition.type === 'actorStat' && condition.actorId === 'variable' ? (context.currentActor?.id || '') : '';
    return `${JSON.stringify(condition)}|${context.currentDate || ''}|${context.currentTimeOfDay || ''}|${variableActorId}`;
};

// Resolves a condition's target value, rolling dice notation deterministically if present.
const resolveConditionValue = (condition: Condition, context: ConditionContext): string | number | boolean => {
    const value = (condition as GlobalStatCondition | ActorStatCondition | CalendarCondition).value;
    return isDiceNotation(value) ? rollDiceNotation(value, buildDiceSeed(condition, context)) : value;
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

const getActorStatValue = (actor: { statMap?: Record<string, StatValue> } | undefined, statId: string): StatValue | undefined => {
    if (!actor) {
        return undefined;
    }
    return actor.statMap?.[statId];
};

type ConditionActor = { id?: string; name?: string; statMap?: Record<string, StatValue>; generic?: boolean; status?: string };

// Resolves which actor(s) an actorStat condition's `actorId` target refers to: 'any'/'none' check every actor
// in context, 'variable' refers to the actor currently under consideration (context.currentActor, e.g. the
// target of a perActor stat), and any other value is a specific actor id.
const resolveConditionActorSubjects = (actorId: ActorConditionTarget, context: ConditionContext): { mode: 'any' | 'none' | 'single'; actors: ConditionActor[] } => {
    const actorList = Array.isArray(context.actors)
        ? context.actors
        : context.actors
            ? Object.values(context.actors)
            : [];

    if (actorId === 'any') {
        return { mode: 'any', actors: actorList };
    }

    if (actorId === 'none') {
        return { mode: 'none', actors: actorList };
    }

    if (actorId === 'variable') {
        const resolvedCurrentActor = context.currentActor || (context.actors && !Array.isArray(context.actors)
            ? Object.values(context.actors)[0]
            : undefined);
        return { mode: 'single', actors: resolvedCurrentActor ? [resolvedCurrentActor] : [] };
    }

    const targetActor = actorList.find((actor) => actor?.id === actorId);
    return { mode: 'single', actors: targetActor ? [targetActor] : [] };
};

export const evaluateActorStatCondition = (condition: ActorStatCondition, context: ConditionContext): boolean => {
    const { mode, actors } = resolveConditionActorSubjects(condition.actorId, context);
    const stat = context.actorStats?.find(candidate => candidate.id === condition.statId);
    const resolvedValue = resolveConditionValue(condition, context);
    const matches = (actor: ConditionActor) => compareValues(getActorStatValue(actor, stat?.id || ''), resolvedValue, condition.comparison);

    if (mode === 'any') return actors.some(matches);
    if (mode === 'none') return !actors.some(matches);
    return actors.length > 0 && matches(actors[0]);
};

export const evaluateActorIdentityCondition = (condition: ActorIdentityCondition, context: ConditionContext): boolean => {
    const resolvedCurrentActor = context.currentActor || (context.actors && !Array.isArray(context.actors)
        ? Object.values(context.actors)[0]
        : undefined);
    return !!resolvedCurrentActor && compareValues(resolvedCurrentActor.id, condition.value, condition.comparison);
};

export const evaluateCondition = (condition: Condition, context: ConditionContext): boolean => {
    if (condition.type === 'calendar') {
        const actual = getCalendarValue(condition, context);
        return compareValues(actual, resolveConditionValue(condition, context), condition.comparison);
    }

    if (condition.type === 'globalStat') {
        const stat = context.globalStats?.find(candidate => candidate.id === condition.statId);
            const actual = stat ? context.globalStatValues?.[condition.statId] : undefined;
        return compareValues(actual, resolveConditionValue(condition, context), condition.comparison);
    }

    if (condition.type === 'actorIdentity') {
        return evaluateActorIdentityCondition(condition, context);
    }

    return evaluateActorStatCondition(condition, context);
};

export const evaluateConditionCollection = (conditionCollection: ConditionCollection, context: ConditionContext): boolean => {
    // log all condition evaluations for debugging purposes
    console.log('Evaluating condition collection:', conditionCollection);
    console.log('Context:', context);
    conditionCollection.forEach((condition, index) => {
        console.log(`Evaluating condition #${index}:`, condition);
        const result = evaluateCondition(condition, context);
        console.log(`Result of condition #${index}:`, result);
    });

    return conditionCollection.every((condition) => evaluateCondition(condition, context));
};

export const evaluateConditionCollections = (conditionCollections: ConditionCollection[] | undefined, context: ConditionContext, returnDefault: boolean = true): boolean => {
    if (conditionCollections && conditionCollections.length > 0) {
        return conditionCollections.some((collection) => evaluateConditionCollection(collection, context));
    }
    return returnDefault;
};

export const hasVariableActorTarget = (conditionCollections: ConditionCollection[] | undefined): boolean => {
    return !!conditionCollections?.some((collection) => collection.some((condition) => condition.type === 'actorIdentity' || (condition.type === 'actorStat' && condition.actorId === 'variable')));
};