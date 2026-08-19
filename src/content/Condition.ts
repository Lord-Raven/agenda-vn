import { CalendarTimeOfDay } from './CalendarEvent';
import type { ActorStat } from './ActorStat';

export type ConditionComparison = 'equals' | 'notEquals' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual';
export type ActorConditionTarget = 'any' | 'none' | 'variable' | string;

export type CalendarCondition = {
    type: 'calendar';
    field: 'timeOfDay' | 'dayOfWeek' | 'day' | 'month' | 'year';
    comparison: ConditionComparison;
    value: string | number;
};

export type PlayerStatCondition = {
    type: 'playerStat';
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

export type Condition = CalendarCondition | PlayerStatCondition | ActorStatCondition | ActorIdentityCondition;

// A ConditionCollection is an array of Condition objects, where all conditions must be satisfied for the collection to be considered true.
export type ConditionCollection = Condition[];

export type ConditionContext = {
    currentDate?: string;
    currentTimeOfDay?: CalendarTimeOfDay;
    playerStatValues?: Record<string, string | number | boolean>;
    playerStats?: ActorStat[];
    actorStats?: ActorStat[];
    actors?: Array<{ id?: string; name?: string; statMap?: Record<string, string | number | boolean>; generic?: boolean; status?: string }> | Record<string, { id?: string; name?: string; statMap?: Record<string, string | number | boolean>; generic?: boolean; status?: string }>;
    currentActor?: { id?: string; name?: string; statMap?: Record<string, string | number | boolean>; generic?: boolean; status?: string };
    actorStatValues?: Record<string, Record<string, string | number | boolean>>;
};

const TIME_OF_DAY_VALUES: Record<CalendarTimeOfDay, number> = {
    morning: 0,
    afternoon: 1,
    evening: 2,
    night: 3,
};

const compareValues = (actual: string | number | boolean | undefined, expected: string | number | boolean, comparison: ConditionComparison): boolean => {
    if (actual === undefined) {
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

const getActorStatValue = (actor: { statMap?: Record<string, string | number | boolean> } | undefined, statId: string): string | number | boolean | undefined => {
    if (!actor) {
        return undefined;
    }
    return actor.statMap?.[statId];
};

type ConditionActor = { id?: string; name?: string; statMap?: Record<string, string | number | boolean>; generic?: boolean; status?: string };

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
    const matches = (actor: ConditionActor) => compareValues(getActorStatValue(actor, stat?.id || ''), condition.value, condition.comparison);

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
        return compareValues(actual, condition.value, condition.comparison);
    }

    if (condition.type === 'playerStat') {
        const stat = context.playerStats?.find(candidate => candidate.id === condition.statId);
            const actual = stat ? context.playerStatValues?.[condition.statId] : undefined;
        return compareValues(actual, condition.value, condition.comparison);
    }

    if (condition.type === 'actorIdentity') {
        return evaluateActorIdentityCondition(condition, context);
    }

    return evaluateActorStatCondition(condition, context);
};

export const evaluateConditionCollection = (conditionCollection: ConditionCollection, context: ConditionContext): boolean => {
    return conditionCollection.every((condition) => evaluateCondition(condition, context));
};

export const evaluateConditionCollections = (conditionCollections: ConditionCollection[] | undefined, context: ConditionContext): boolean => {
    return !conditionCollections?.length
        || conditionCollections.some((collection) => evaluateConditionCollection(collection, context));
};

export const hasVariableActorTarget = (conditionCollections: ConditionCollection[] | undefined): boolean => {
    return !!conditionCollections?.some((collection) => collection.some((condition) => condition.type === 'actorIdentity' || (condition.type === 'actorStat' && condition.actorId === 'variable')));
};