import { v4 as generateUuid } from 'uuid';
import type { ContentType } from './Condition';
import type { Stat, StatOption, StatType, StatValue } from './Stat';
import { cloneStat } from './Stat';

export type FunctionReturnType = StatType | 'void';

export const FUNCTION_RETURN_TYPES: FunctionReturnType[] = [
    'void', 'number', 'text', 'checkbox', 'option', 'optionList',
    'actor', 'actorList', 'item', 'itemList', 'location', 'locationList', 'contentList',
];

// A tagged string fits existing ID pickers and mixed ID lists without converting references into values.
// Arguments ride along after a '?' as JSON keyed by parameter id: function:<id>?{"<paramId>":5}.
const FUNCTION_REFERENCE_PREFIX = 'function:';
export const functionReference = (id: string, args?: Record<string, StatValue>): string =>
    `${FUNCTION_REFERENCE_PREFIX}${id}${args && Object.keys(args).length ? `?${JSON.stringify(args)}` : ''}`;
export const isFunctionReference = (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith(FUNCTION_REFERENCE_PREFIX);
export const functionReferenceId = (value: string): string => {
    const raw = value.slice(FUNCTION_REFERENCE_PREFIX.length);
    const argsIndex = raw.indexOf('?');
    return argsIndex < 0 ? raw : raw.slice(0, argsIndex);
};
// Arguments stored in an arg-bearing function reference, keyed by parameter id; undefined when absent or malformed.
export const functionReferenceArguments = (value: string): Record<string, StatValue> | undefined => {
    const argsIndex = value.indexOf('?');
    if (argsIndex < 0) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(value.slice(argsIndex + 1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, StatValue> : undefined;
    } catch {
        return undefined;
    }
};

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

export const functionSignature = (fn: GameFunction): string =>
    `${fn.name}(${(fn.parameters || []).map(parameter => parameter.name).join(', ')})`;

export const functionPickerOptions = (functions: GameFunction[] | undefined, type: StatType) =>
    (functions || []).filter(fn => matchesFunctionType(fn, type)).map(fn => ({
        key: functionReference(fn.id), label: functionSignature(fn), category: 'Functions', description: fn.description,
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
    // Typed like Stats so defaults, options, min/max, and value inputs all reuse the stat machinery.
    parameters?: Stat[];
};

export const cloneGameFunction = (fn: GameFunction): GameFunction => ({
    id: fn.id || generateUuid(),
    name: fn.name,
    description: fn.description,
    script: fn.script || '',
    returnType: fn.returnType || 'void',
    parameters: (fn.parameters || []).map(cloneStat),
});

// Finds a parameter by display name, ignoring case and surrounding spaces.
export const findFunctionParameter = (fn: GameFunction, name: string): Stat | undefined => {
    const normalizedName = `${name || ''}`.trim().toLowerCase();
    return (fn.parameters || []).find(parameter => parameter.name.trim().toLowerCase() === normalizedName);
};

// Converts script-facing by-name arguments into the stored by-id shape; unknown names are an error.
export const namedFunctionArguments = (fn: GameFunction, args: Record<string, unknown> | undefined): Record<string, StatValue> | undefined => {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return undefined;
    }
    const byId: Record<string, StatValue> = {};
    for (const [name, value] of Object.entries(args)) {
        const parameter = findFunctionParameter(fn, name);
        if (!parameter) {
            throw new Error(`Function "${fn.name}" has no parameter named ${name}.`);
        }
        byId[parameter.id] = value as StatValue;
    }
    return byId;
};

// Converts positional arguments (formula/text call sites) into the stored by-id shape.
export const positionalFunctionArguments = (fn: GameFunction, args: unknown[] | undefined): Record<string, StatValue> | undefined => {
    if (!args || args.length === 0) {
        return undefined;
    }
    const parameters = fn.parameters || [];
    if (args.length > parameters.length) {
        throw new Error(`Function "${fn.name}" takes ${parameters.length} argument${parameters.length === 1 ? '' : 's'}, received ${args.length}.`);
    }
    const byId: Record<string, StatValue> = {};
    args.forEach((value, index) => {
        byId[parameters[index].id] = value as StatValue;
    });
    return byId;
};

// Parses text that is exactly one "Name('a', 2, true)"-style call with literal arguments (quoted strings,
// numbers, booleans); returns undefined for anything else so callers fall back to literal text.
export const parseFunctionCallText = (text: string): { name: string; args: (string | number | boolean)[] } | undefined => {
    const match = /^\s*([a-z_][a-z0-9_ ]*)\(([\s\S]*)\)\s*$/i.exec(text);
    if (!match) {
        return undefined;
    }
    const name = match[1].trim();
    const inner = match[2];
    const args: (string | number | boolean)[] = [];
    let position = 0;
    const skipSpace = () => { while (/\s/.test(inner[position] || '')) position++; };
    skipSpace();
    while (position < inner.length) {
        const char = inner[position];
        if (char === '"' || char === "'") {
            position++;
            let value = '';
            while (position < inner.length && inner[position] !== char) {
                if (inner[position] === '\\') position++;
                value += inner[position++] ?? '';
            }
            if (inner[position] !== char) {
                return undefined;
            }
            position++;
            args.push(value);
        } else {
            const rest = inner.slice(position);
            const literal = /^(true|false|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i.exec(rest);
            if (!literal) {
                return undefined;
            }
            position += literal[0].length;
            args.push(/^true$/i.test(literal[0]) ? true : /^false$/i.test(literal[0]) ? false : Number(literal[0]));
        }
        skipSpace();
        if (position >= inner.length) {
            break;
        }
        if (inner[position] !== ',') {
            return undefined;
        }
        position++;
        skipSpace();
        if (position >= inner.length) {
            return undefined;
        }
    }
    return { name, args };
};

export type FunctionInvocation = {
    id: string;
    kind: 'function';
    functionId: string;
    // Argument values keyed by parameter id; omitted entries use the parameter's default.
    args?: Record<string, StatValue>;
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
    call: (name: string, args?: Record<string, unknown>) => unknown;
    // Reads one of the current invocation's arguments by parameter name, falling back to the parameter default.
    arg: (name: string) => StatValue | undefined;
};

export type FunctionScriptTestResult = { value: unknown; errors: string[] };

export const runFunctionScript = (script: string | undefined, bindings: FunctionScriptBindings, onError?: (message: string) => void): unknown => {
    const body = (script || '').trim();
    if (!body) {
        return undefined;
    }
    try {
        const scriptFunction = new Function(
            'get', 'set', 'getActor', 'getLocation', 'getItem', 'actors', 'locations', 'items', 'call', 'getObjects', 'arg', body,
        );
        return scriptFunction(
            bindings.get, bindings.set, bindings.getActor, bindings.getLocation, bindings.getItem,
            bindings.actors, bindings.locations, bindings.items, bindings.call, bindings.getObjects, bindings.arg,
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
