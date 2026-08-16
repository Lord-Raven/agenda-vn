import { CalendarTimeOfDay } from './CalendarEvent';

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
    statName: string;
    comparison: ConditionComparison;
    value: string | number | boolean;
};

export type ActorStatCondition = {
    type: 'actorStat';
    actorId: ActorConditionTarget;
    statName: string;
    comparison: ConditionComparison;
    value: string | number | boolean;
};

export type Condition = CalendarCondition | PlayerStatCondition | ActorStatCondition;

// A ConditionCollection is an array of Condition objects, where all conditions must be satisfied for the collection to be considered true.
export type ConditionCollection = Condition[];

export type ConditionContext = {
    currentDate?: string;
    currentTimeOfDay?: CalendarTimeOfDay;
    playerStatValues?: Record<string, string | number | boolean>;
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

const getActorStatValue = (actor: { statMap?: Record<string, string | number | boolean> } | undefined, statName: string): string | number | boolean | undefined => {
    if (!actor) {
        return undefined;
    }
    return actor.statMap?.[statName];
};

export const evaluateActorStatCondition = (condition: ActorStatCondition, context: ConditionContext): boolean => {
    const actorList = Array.isArray(context.actors)
        ? context.actors
        : context.actors
            ? Object.values(context.actors)
            : [];

    const resolvedCurrentActor = context.currentActor || (context.actors && !Array.isArray(context.actors)
        ? Object.values(context.actors)[0]
        : undefined);

    if (condition.actorId === 'any') {
        return actorList.some((actor) => compareValues(getActorStatValue(actor, condition.statName), condition.value, condition.comparison));
    }

    if (condition.actorId === 'none') {
        return !actorList.some((actor) => compareValues(getActorStatValue(actor, condition.statName), condition.value, condition.comparison));
    }

    if (condition.actorId === 'variable') {
        return compareValues(getActorStatValue(resolvedCurrentActor, condition.statName), condition.value, condition.comparison);
    }

    const targetActor = actorList.find((actor) => actor?.id === condition.actorId);
    return compareValues(getActorStatValue(targetActor, condition.statName), condition.value, condition.comparison);
};

export const evaluateCondition = (condition: Condition, context: ConditionContext): boolean => {
    if (condition.type === 'calendar') {
        const actual = getCalendarValue(condition, context);
        return compareValues(actual, condition.value, condition.comparison);
    }

    if (condition.type === 'playerStat') {
        const actual = context.playerStatValues?.[condition.statName];
        return compareValues(actual, condition.value, condition.comparison);
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
    return !!conditionCollections?.some((collection) => collection.some((condition) => condition.type === 'actorStat' && condition.actorId === 'variable'));
};