import { v4 as generateUuid } from 'uuid';
import type { ContentType } from './Condition';
import type { Stat, StatOption, StatType, StatValue } from './Stat';

export type FunctionReturnType = StatType | 'void';

export const FUNCTION_RETURN_TYPES: FunctionReturnType[] = [
    'void', 'number', 'text', 'checkbox', 'option', 'optionList',
    'actor', 'actorList', 'item', 'itemList', 'location', 'locationList', 'contentList',
];

// A tagged string fits existing ID pickers and mixed ID lists without converting references into values.
const FUNCTION_REFERENCE_PREFIX = 'function:';
export const functionReference = (id: string): string => `${FUNCTION_REFERENCE_PREFIX}${id}`;
export const isFunctionReference = (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith(FUNCTION_REFERENCE_PREFIX);
export const functionReferenceId = (value: string): string => value.slice(FUNCTION_REFERENCE_PREFIX.length);

export const GLOBAL_STAT_REFERENCE_PREFIX = 'globalStat:';
export const globalStatReference = (id: string): string => `${GLOBAL_STAT_REFERENCE_PREFIX}${id}`;
export const isGlobalStatReference = (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith(GLOBAL_STAT_REFERENCE_PREFIX);
export const globalStatReferenceId = (value: string): string => value.slice(GLOBAL_STAT_REFERENCE_PREFIX.length);
export const isValueReference = (value: unknown): value is string => isFunctionReference(value) || isGlobalStatReference(value);

export type FunctionValueResolver = (value: unknown, type: StatType) => StatValue;

// The scalar type of one element of a single-kind list type. The mixed 'contentList' has no single element
// type and resolves to undefined; use isListValueType to detect every list-valued type.
export const listElementType = (type: StatType): StatType | undefined => ({
    actorList: 'actor', itemList: 'item', locationList: 'location', optionList: 'option',
} as Partial<Record<StatType, StatType>>)[type];

// Any type whose value is a string[] of ids, including the mixed 'contentList'.
export const isListValueType = (type: StatType): boolean => type === 'contentList' || !!listElementType(type);

export const matchesFunctionType = (fn: GameFunction, type: StatType): boolean => fn.returnType === type;

export const functionPickerOptions = (functions: GameFunction[] | undefined, type: StatType) =>
    (functions || []).filter(fn => matchesFunctionType(fn, type)).map(fn => ({
        key: functionReference(fn.id), label: `${fn.name}()`, category: 'Functions', description: fn.description,
    }));

export const valuePickerOptions = (configuration: { functions?: GameFunction[]; globalStats?: Stat[] } | undefined, type: StatType) => [
    ...functionPickerOptions(configuration?.functions, type),
    ...(configuration?.globalStats || []).filter(stat => stat.type === type).map(stat => ({
        key: globalStatReference(stat.id), label: stat.name, category: 'Global Stats', description: stat.guidance,
    })),
];

export const validateFunctionResult = (value: unknown, type: FunctionReturnType): void => {
    if (type === 'void') {
        return;
    }
    const valid = type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : type === 'checkbox' ? typeof value === 'boolean'
            : isListValueType(type) ? Array.isArray(value) && value.every(entry => typeof entry === 'string' && !isValueReference(entry))
                : typeof value === 'string' && !isValueReference(value);
    if (!valid) {
        throw new Error(`Expected a ${type} function result, received ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}.`);
    }
};

export type GameFunction = {
    id: string;
    name: string;
    description: string;
    script: string;
    returnType: FunctionReturnType;
};

export const cloneGameFunction = (fn: GameFunction): GameFunction => ({
    id: fn.id || generateUuid(),
    name: fn.name,
    description: fn.description,
    script: fn.script || '',
    returnType: fn.returnType || 'void',
});

export type FunctionInvocation = {
    id: string;
    kind: 'function';
    functionId: string;
};

export type FunctionScriptEntity = {
    id: string;
    name: string;
    kind: ContentType;
    get: (statName: string) => StatValue | undefined;
    getObjects: (statName: string) => FunctionScriptObject[];
    set: (statName: string, value: StatValue) => void;
    getField?: (fieldName: string) => string | undefined;
    setField?: (fieldName: string, value: string) => void;
};

export type FunctionScriptObject = FunctionScriptEntity | StatOption;

export type FunctionScriptBindings = {
    get: (statName: string) => StatValue | undefined;
    getObjects: (statName: string) => FunctionScriptObject[];
    set: (statName: string, value: StatValue) => void;
    getActor: (name: string) => FunctionScriptEntity | undefined;
    getLocation: (name: string) => FunctionScriptEntity | undefined;
    getItem: (name: string) => FunctionScriptEntity | undefined;
    actors: () => FunctionScriptEntity[];
    locations: () => FunctionScriptEntity[];
    items: () => FunctionScriptEntity[];
    call: (name: string) => unknown;
};

export type FunctionScriptTestResult = { value: unknown; errors: string[] };

export const runFunctionScript = (script: string | undefined, bindings: FunctionScriptBindings, onError?: (message: string) => void): unknown => {
    const body = (script || '').trim();
    if (!body) {
        return undefined;
    }
    try {
        const scriptFunction = new Function(
            'get', 'set', 'getActor', 'getLocation', 'getItem', 'actors', 'locations', 'items', 'call', 'getObjects', body,
        );
        return scriptFunction(
            bindings.get, bindings.set, bindings.getActor, bindings.getLocation, bindings.getItem,
            bindings.actors, bindings.locations, bindings.items, bindings.call, bindings.getObjects,
        );
    } catch (error) {
        const message = `Function script error: ${error instanceof Error ? error.message : String(error)}`;
        if (onError) {
            onError(message);
        } else {
            console.error(message);
        }
        return undefined;
    }
};
