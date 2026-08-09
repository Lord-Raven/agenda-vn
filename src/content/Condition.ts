import { CalendarTimeOfDay } from './CalendarEvent';

export type ConditionComparison = 'equals' | 'notEquals' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual';

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
    value: string | number;
};

export type Condition = CalendarCondition | PlayerStatCondition;

export type ConditionContext = {
    currentDate?: string;
    currentTimeOfDay?: CalendarTimeOfDay;
    playerStatValues?: Record<string, string | number>;
};

const TIME_OF_DAY_VALUES: Record<CalendarTimeOfDay, number> = {
    morning: 0,
    afternoon: 1,
    evening: 2,
    night: 3,
};

const compareValues = (actual: string | number | undefined, expected: string | number, comparison: ConditionComparison): boolean => {
    if (actual === undefined) {
        return false;
    }

    const numericActual = typeof actual === 'number' ? actual : Number(actual);
    const numericExpected = typeof expected === 'number' ? expected : Number(expected);
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

export const evaluateCondition = (condition: Condition, context: ConditionContext): boolean => {
    const actual = condition.type === 'calendar'
        ? getCalendarValue(condition, context)
        : context.playerStatValues?.[condition.statName];
    return compareValues(actual, condition.value, condition.comparison);
};

export const evaluateConditions = (conditions: Condition[] | undefined, context: ConditionContext): boolean => {
    return !conditions?.length || conditions.every((condition) => evaluateCondition(condition, context));
};