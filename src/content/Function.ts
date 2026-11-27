import { v4 as generateUuid } from 'uuid';
import type { ContentType } from './Condition';
import type { Stat, StatOption, StatType, StatValue } from './Stat';
import { cloneStat } from './Stat';

// 'textList' is function-only (no stat or parameter has it); it supplies multiple strings, e.g. pop-up headers.
export type FunctionReturnType = StatType | 'textList' | 'void';

export const FUNCTION_RETURN_TYPES: FunctionReturnType[] = [
    'void', 'number', 'text', 'textList', 'boolean', 'option', 'optionList',
    'actor', 'actorList', 'item', 'itemList', 'location', 'locationList', 'contentList',
];

// Narrows a return type to a StatType usable with stat machinery (resolveValue, value inputs, conditions).
export const isStatReturnType = (type: FunctionReturnType | undefined): type is StatType =>
    !!type && type !== 'void' && type !== 'textList';

// A tagged string fits existing ID pickers and mixed ID lists without converting references into values.
// Arguments ride along after a '?' as JSON keyed by parameter id: function:<id>?{"<paramId>":5}.
// Context-bound arguments use Variable references, e.g. "variable:actor" for the scheduled actor.
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
// Bound stat sources keep the entity binding separate from the stat id, including in formula macros.
export const boundStatReference = (kind: ContentType, statId: string, source: 'variable' | 'moved' = 'variable'): string =>
    `${source}Stat:${kind}:${statId}`;
export const parseBoundStatReference = (value: unknown): { kind: ContentType; statId: string; source: 'variable' | 'moved' } | undefined => {
    if (typeof value !== 'string') return undefined;
    const match = /^(variable|moved)Stat:(actor|item|location):(.+)$/.exec(value);
    return match ? { source: match[1] as 'variable' | 'moved', kind: match[2] as ContentType, statId: match[3] } : undefined;
};
export const isValueReference = (value: unknown): value is string =>
    isFunctionReference(value) || isGlobalStatReference(value) || !!parseBoundStatReference(value);

// Content variables bind "variable:<kind>" to an id; header and marker bind their respective text values.
export type FunctionVariableBindings = Partial<Record<ContentType, string>> & { header?: string; marker?: string; moved?: { kind: ContentType; id: string } };
export const HEADER_VARIABLE_VALUE = 'variable:header';
export const MARKER_VARIABLE_VALUE = 'variable:marker';
export const movedContentValue = (kind: ContentType): string => `variable:moved:${kind}`;
export const parseMovedContentValue = (value: unknown): ContentType | undefined =>
    (['actor', 'item', 'location'] as const).find(kind => value === movedContentValue(kind));
export type FunctionValueResolver = (value: unknown, type: StatType, variables?: FunctionVariableBindings) => StatValue;

// The scalar type of one element of a single-kind list type. The mixed 'contentList' has no single element
// type and resolves to undefined; use isListValueType to detect every list-valued type.
export const listElementType = (type: StatType): StatType | undefined => ({
    actorList: 'actor', itemList: 'item', locationList: 'location', optionList: 'option',
} as Partial<Record<StatType, StatType>>)[type];

// Any type whose value is a string[] of ids, including the mixed 'contentList'.
export const isListValueType = (type: StatType): boolean => type === 'contentList' || !!listElementType(type);

// Icon stats hold an icon name as plain text, so text-returning sources satisfy icon values and vice versa.
export const matchesValueType = (sourceType: StatType | FunctionReturnType | undefined, type: StatType): boolean =>
    sourceType === type || (sourceType === 'text' && type === 'icon') || (sourceType === 'icon' && type === 'text');

export const matchesFunctionType = (fn: GameFunction, type: StatType): boolean => matchesValueType(fn.returnType, type);

export const functionSignature = (fn: GameFunction): string =>
    `${fn.name}(${(fn.parameters || []).map(parameter => parameter.name).join(', ')})`;

export const functionPickerOptions = (functions: GameFunction[] | undefined, type: StatType) =>
    (functions || []).filter(fn => matchesFunctionType(fn, type)).map(fn => ({
        key: functionReference(fn.id), label: functionSignature(fn), category: 'Functions', description: fn.description,
    }));

// statFilter narrows the offered stats (e.g. to option stats sharing a source list); functions are
// never filtered because their results are not type checked against a source.
export const valuePickerOptions = (
    configuration: { functions?: GameFunction[]; globalStats?: Stat[]; actorStats?: Stat[]; itemStats?: Stat[]; locationStats?: Stat[] } | undefined,
    type: StatType,
    statFilter?: (stat: Stat) => boolean,
    context?: { variableContentType?: ContentType; movedContent?: { kinds: ContentType[]; label: string } },
) => {
    const movedContent = context?.movedContent;
    return [
        ...functionPickerOptions(configuration?.functions, type),
        ...(configuration?.globalStats || []).filter(stat => matchesValueType(stat.type, type) && (!statFilter || statFilter(stat))).map(stat => ({
            key: globalStatReference(stat.id), label: stat.name, category: 'Global Stats', description: stat.guidance,
        })),
        ...([
            ...(context?.variableContentType ? [{ kind: context.variableContentType, source: 'variable' as const, label: 'Variable' }] : []),
            ...(movedContent ? movedContent.kinds.map(kind => ({ kind, source: 'moved' as const, label: movedContent.label })) : []),
        ]).flatMap(({ kind, source, label }) => (configuration?.[`${kind}Stats`] || [])
            .filter(stat => matchesValueType(stat.type, type) && (!statFilter || statFilter(stat)))
            .map(stat => ({
                key: boundStatReference(kind, stat.id, source), label: stat.name,
                category: `${label} ${kind.charAt(0).toUpperCase() + kind.slice(1)} Stats`, description: stat.guidance,
            }))),
    ];
};

export const validateFunctionResult = (value: unknown, type: FunctionReturnType): void => {
    if (type === 'void') {
        return;
    }
    const valid = type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : type === 'boolean' ? typeof value === 'boolean'
            : type === 'textList' ? Array.isArray(value) && value.every(entry => typeof entry === 'string')
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

// Script entity accessors (from actors()/getActor()/getObjects() etc.) passed as arguments stand in for
// their entity; reference stats store id strings, so unwrap them (and array entries) to ids.
export const isFunctionScriptEntity = (value: unknown): value is FunctionScriptEntity =>
    !!value && typeof value === 'object'
    && typeof (value as FunctionScriptEntity).id === 'string'
    && typeof (value as FunctionScriptEntity).get === 'function'
    && typeof (value as FunctionScriptEntity).set === 'function';

const unwrapScriptEntityArgument = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(entry => (isFunctionScriptEntity(entry) ? entry.id : entry));
    }
    return isFunctionScriptEntity(value) ? value.id : value;
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
        byId[parameter.id] = unwrapScriptEntityArgument(value) as StatValue;
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

// A non-literal argument captured verbatim for the caller to resolve like a {{tag}} expression (content
// fields/stats, user/char/global stats, or nested calls); only produced when options.tagArguments is set.
export type FunctionCallTagArgument = { tag: string };
export const isFunctionCallTagArgument = (value: unknown): value is FunctionCallTagArgument =>
    !!value && typeof value === 'object' && typeof (value as FunctionCallTagArgument).tag === 'string';

export type FunctionCallArgument = string | number | boolean | FunctionCallTagArgument;

// Parses text that is exactly one "Name('a', 2, true)"-style call with literal arguments (quoted strings,
// numbers, booleans); returns undefined for anything else so callers fall back to literal text.
// With options.tagArguments, an unquoted non-literal argument (e.g. content:id) is captured up to the next
// top-level comma as a FunctionCallTagArgument for the caller to resolve.
export const parseFunctionCallText = (text: string, options?: { tagArguments?: boolean }): { name: string; args: FunctionCallArgument[] } | undefined => {
    const match = /^\s*([a-z_][a-z0-9_ ]*)\(([\s\S]*)\)\s*$/i.exec(text);
    if (!match) {
        return undefined;
    }
    const name = match[1].trim();
    const inner = match[2];
    const args: FunctionCallArgument[] = [];
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
            // A literal must end the argument; anything else is a tag argument when those are allowed.
            const literal = /^(true|false|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?=\s*(?:,|$))/i.exec(rest);
            if (literal) {
                position += literal[0].length;
                args.push(/^true$/i.test(literal[0]) ? true : /^false$/i.test(literal[0]) ? false : Number(literal[0]));
            } else if (options?.tagArguments) {
                // Capture up to the next top-level comma, respecting quotes and nested parentheses.
                const start = position;
                let quote = '';
                let parens = 0;
                while (position < inner.length) {
                    const current = inner[position];
                    if (quote) {
                        if (current === '\\') position++;
                        else if (current === quote) quote = '';
                    } else if (current === '"' || current === "'") {
                        quote = current;
                    } else if (current === '(') {
                        parens++;
                    } else if (current === ')') {
                        if (--parens < 0) return undefined;
                    } else if (current === ',' && parens === 0) {
                        break;
                    }
                    position++;
                }
                const tag = inner.slice(start, position).trim();
                if (quote || parens || !tag) {
                    return undefined;
                }
                args.push({ tag });
            } else {
                return undefined;
            }
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
    getLocation?: () => FunctionScriptEntity | undefined;
    isAvailable: () => boolean;
    isVisible?: () => boolean;
    set: (statName: string, value: StatValue) => void;
    getField?: (fieldName: string) => string | undefined;
    setField?: (fieldName: string, value: string) => void;
};

export type FunctionScriptObject = FunctionScriptEntity | StatOption;

export type FunctionScriptEntityLookup = {
    (): FunctionScriptEntity[];
    (id: string): FunctionScriptEntity | undefined;
    (ids: string[]): FunctionScriptEntity[];
};

export type FunctionScriptBindings = {
    get: (statName: string) => StatValue | undefined;
    getObjects: (statName: string) => FunctionScriptObject[];
    set: (statName: string, value: StatValue) => void;
    getActor: (name: string) => FunctionScriptEntity | undefined;
    getLocation: (name: string) => FunctionScriptEntity | undefined;
    getItem: (name: string) => FunctionScriptEntity | undefined;
    actors: FunctionScriptEntityLookup;
    locations: FunctionScriptEntityLookup;
    items: FunctionScriptEntityLookup;
    call: (name: string, args?: Record<string, unknown>) => unknown;
    // Reads one of the current invocation's arguments by parameter name, falling back to the parameter default.
    arg: (name: string) => StatValue | undefined;
    random: () => number;
};

export type FunctionScriptTestResult = { value: unknown; errors: string[] };

export const compileFunctionScript = (body: string) => new Function(
    'get', 'set', 'getActor', 'getLocation', 'getItem', 'actors', 'locations', 'items', 'call', 'getObjects', 'arg', 'random', body,
);

export const runFunctionScript = (script: string | undefined, bindings: FunctionScriptBindings, onError?: (message: string) => void): unknown => {
    const body = (script || '').trim();
    if (!body) {
        return undefined;
    }
    try {
        const scriptFunction = compileFunctionScript(body);
        return scriptFunction(
            bindings.get, bindings.set, bindings.getActor, bindings.getLocation, bindings.getItem,
            bindings.actors, bindings.locations, bindings.items, bindings.call, bindings.getObjects, bindings.arg, bindings.random,
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
