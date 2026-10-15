import { v4 as generateUuid } from 'uuid';
import type { ContentType } from './Condition';
import type { StatOption, StatValue } from './Stat';

export type GameFunction = {
    id: string;
    name: string;
    description: string;
    script: string;
};

export const cloneGameFunction = (fn: GameFunction): GameFunction => ({
    id: fn.id || generateUuid(),
    name: fn.name,
    description: fn.description,
    script: fn.script || '',
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
