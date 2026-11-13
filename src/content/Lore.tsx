type LoreType = "character" | "location" | "other" | string;
import { v4 as generateUuid } from 'uuid';
import { buildStructuredExampleResponse, buildStructuredResponseFormat, parseStructuredResponse, StructuredFieldDefinition } from '../utils/StructuredResponse';
import { Stage } from '../Stage';
import { generateContext } from './Skit';
import { buildPrompt } from '../utils/PromptBuilder';
import { ConditionCollection, ConditionContext, evaluateConditionCollections, hasVariableContentTarget } from './Condition';
import { Stat, StatType, StatValue, formatReferenceStatText, formatStatOptionValueText, isReferenceStatType } from './Stat';
import { FunctionVariableBindings, functionReference, isStatReturnType, parseFunctionCallText, positionalFunctionArguments } from './Function';

// Dynamic entry names loaded from configuration lorebook triggers
const TYPE_MAPPING: Record<LoreType, string[]> = {
    character: [],
    location: [],
    world: [],
    other: [], // Everything else ends up being assigned to this by default.
};

// Populate TYPE_MAPPING from loaded lore entries
export function updateTypeMapping(lore: Lore[]): void {
    TYPE_MAPPING.character = lore.filter(l => l.type === 'character').flatMap(l => l.triggers);
    TYPE_MAPPING.location = lore.filter(l => l.type === 'location').flatMap(l => l.triggers);
    TYPE_MAPPING.world = lore.filter(l => l.type === 'world').flatMap(l => l.triggers);
    TYPE_MAPPING.other = lore.filter(l => l.type === 'other').flatMap(l => l.triggers);
}

const LORE_UPDATE_RESPONSE_FIELDS: StructuredFieldDefinition[] = [
    {
        key: 'planning',
        label: 'PLANNING',
        description: 'Brief explanation of what changes were made and what was retained from the original.',
    },
    {
        key: 'content',
        label: 'CONTENT',
        description: 'Revised lore content that preserves still-true original information and integrates new updates.',
    },
];

export const MAX_ENTRIES = 30; // Maximum number of lore entries to add to context; if there are more, we'll prioritize based on priority and probability.

// Unused as-yet.
export type LoreTrigger = {
    id: string;
    // 'keyword' is a trigger that is a specific word or phrase
    // 'variable' is a trigger that can be replaced with a variable value (e.g., a character name).
    type: 'keyword' | 'variable';
    value: string;
};

export type Lore = {
    id: string;
    type: LoreType;
    title: string;
    content: string;
    triggers: string[];
    enabled: boolean;
    constant: boolean;
    updatable: boolean; // Whether this entry can be generatively updated.
    scanDepth: number; // default to 10
    insertionOrder: number;
    priority: number;
    probability: number; // 1 to 100
    conditionCollections: ConditionCollection[]; // Any collection may pass; all conditions within a collection must pass.
}

const resolveLoreProbability = (entry: Lore): number => {
    const value = Number(entry.probability);
    if (!Number.isFinite(value)) {
        return 100;
    }

    return Math.max(0, Math.min(100, value));
};

export const isLoreProbabilityActive = (entry: Lore): boolean => {
    return Math.random() * 100 <= resolveLoreProbability(entry);
};

export const selectConstantLoreEntries = (lorebook: Lore[] = [], context: ConditionContext = {}): Lore[] => {
    return lorebook
        .filter((entry) => entry?.enabled && entry?.constant)
        .filter((entry) => !hasVariableContentTarget(entry.conditionCollections))
        .filter((entry) => evaluateConditionCollections(entry.conditionCollections, context))
        .filter((entry) => isLoreProbabilityActive(entry));
};

// Duck-typed so this module doesn't need to import the Actor class.
export type LoreTextActor = { name: string; displayName?: string; statMap?: { [statId: string]: StatValue } };

// Reserved user/char/global tags take precedence over {{Function name}}.
const LORE_TAG_PATTERN = /\{\{\s*(user|char|global)\s*(?::\s*([^}]*?)\s*)?\}\}|\{\{\s*([^{}]*?)\s*\}\}/gi;

const findStatByKey = (stats: Stat[] | undefined, key: string): Stat | undefined => {
    const lowerKey = key.toLowerCase();
    return (stats || []).find((stat) => stat.id === key || (stat.name || '').trim().toLowerCase() === lowerKey);
};

type LoreTextContent = { fields: Record<string, string>; stats: Stat[]; statMap?: Record<string, StatValue> };
type LoreTextValue = { value: StatValue; text: string };

// Find operators outside quoted strings and function arguments, without mistaking a tag prefix for the separator.
const parseLoreTernary = (source: string): [string, string, string] | undefined => {
    let quote = '';
    let depth = 0;
    let question = -1;
    let colon = -1;
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (quote) {
            if (char === '\\') i++;
            else if (char === quote) quote = '';
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '(') {
            depth++;
        } else if (char === ')') {
            if (--depth < 0) return undefined;
        } else if (depth === 0 && char === '?') {
            if (question !== -1) return undefined;
            question = i;
        } else if (depth === 0 && char === ':' && question !== -1 && colon === -1) {
            const branchPrefix = source.slice(question + 1, i).trim();
            const isPrefix = /^(content|global)$/i.test(branchPrefix)
                || (/^(user|char)$/i.test(branchPrefix) && !(/\s/.test(source[i - 1]) && /\s/.test(source[i + 1] || '')));
            if (!isPrefix) colon = i;
        }
    }
    if (quote || depth || question < 0 || colon < 0) return undefined;
    const parts = [source.slice(0, question).trim(), source.slice(question + 1, colon).trim(), source.slice(colon + 1).trim()];
    return parts.every(Boolean) ? [parts[0], parts[1], parts[2]] : undefined;
};

const parseLoreLiteral = (source: string): StatValue | undefined => {
    const quote = source[0];
    if (quote === '"' || quote === "'") {
        let value = '';
        for (let i = 1; i < source.length; i++) {
            if (source[i] === quote) return i === source.length - 1 ? value : undefined;
            if (source[i] === '\\') {
                if (++i >= source.length) return undefined;
            }
            value += source[i];
        }
        return undefined;
    }
    if (/^(true|false)$/i.test(source)) return source.toLowerCase() === 'true';
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(source)) return Number(source);
    return undefined;
};

// Resolves template tags in lore and control text for LLM/display use, including {{Name("text", 2, true)}}.
// Bare names prefer functions, then global stats; calls use positional arguments and parameter defaults.
// Unresolvable tags (unknown stat/function, no target actor, void functions) are left untouched.
// Don't use on text written back to the source.
export function processLoreText(text: string | undefined, stage: Stage, targetActor?: LoreTextActor, variables?: FunctionVariableBindings, content?: LoreTextContent): string {
    const save = stage.getSave();
    const configuration = stage.getConfiguration(save);
    const player = stage.getPlayerActor();
    const lookup = { actors: save.actors, items: save.inventory, locations: save.atlas };

    const formatValue = (type: StatType, value: StatValue): string => {
        if (type === 'boolean') {
            return value === true ? 'yes' : 'no';
        }
        if (isReferenceStatType(type)) {
            return formatReferenceStatText({ type }, value, lookup, (kind) => `unknown ${kind || 'content'}`);
        }
        return Array.isArray(value) ? value.join(', ') : String(value ?? '');
    };

    const resolveStat = (stat: Stat, rawValue: unknown): LoreTextValue => {
        const value = stage.readStatValue(rawValue, stat, save);
        return { value, text: formatStatOptionValueText(stat, value) ?? formatValue(stat.type, value) };
    };

    const resolveTag = (source: string): LoreTextValue | undefined => {
        const reserved = /^(user|char|global)\s*(?::\s*(.*?)\s*)?$/i.exec(source);
        const contentTag = /^content\s*:\s*(.*?)\s*$/i.exec(source);
        if (contentTag && content) {
            const key = contentTag[1];
            const field = content.fields[key.toLowerCase()];
            if (field !== undefined) return { value: field, text: field };
            const stat = findStatByKey(content.stats, key);
            if (stat) return resolveStat(stat, content.statMap?.[stat.id]);
        }
        if (!reserved) {
            const call = parseFunctionCallText(source);
            const name = (call?.name || source).trim().toLowerCase();
            const fn = (configuration.functions || []).find(candidate => candidate.name.trim().toLowerCase() === name);
            if (fn) {
                const reference = functionReference(fn.id, positionalFunctionArguments(fn, call?.args));
                if (fn.returnType === 'textList') {
                    const value = stage.resolveTextList(reference, save, variables);
                    return { value, text: value.join(', ') };
                }
                if (!isStatReturnType(fn.returnType)) {
                    return undefined;
                }
                const value = stage.resolveValue(reference, fn.returnType, save, [], variables);
                return { value, text: formatValue(fn.returnType, value) };
            }
            if (call) {
                return undefined;
            }
            const stat = findStatByKey(configuration.globalStats, source);
            return stat ? resolveStat(stat, save.globalStatValues?.[stat.id]) : undefined;
        }
        const tagName = reserved[1].toLowerCase();
        const statKey = reserved[2];
        if (tagName === 'global') {
            const stat = statKey ? findStatByKey(configuration.globalStats, statKey) : undefined;
            return stat ? resolveStat(stat, save.globalStatValues?.[stat.id]) : undefined;
        }

        const actor: LoreTextActor | undefined = tagName === 'user' ? player : targetActor;
        if (!statKey) {
            if (tagName === 'user') {
                const value = player?.name || 'the player';
                return { value, text: value };
            }
            const value = actor && (actor.displayName || actor.name);
            return value === undefined ? undefined : { value, text: value };
        }

        const stat = findStatByKey(configuration.actorStats, statKey);
        return actor && stat ? resolveStat(stat, actor.statMap?.[stat.id]) : undefined;
    };

    const resolveExpression = (source: string): LoreTextValue | undefined => {
        const literal = parseLoreLiteral(source);
        return literal === undefined ? resolveTag(source) : { value: literal, text: String(literal) };
    };

    return String(text || '').replace(LORE_TAG_PATTERN, (match) => {
        const source = match.slice(2, -2).trim();
        const ternary = parseLoreTernary(source);
        if (ternary) {
            const condition = resolveExpression(ternary[0]);
            if (!condition) return match;
            return resolveExpression(condition.value ? ternary[1] : ternary[2])?.text ?? match;
        }
        return resolveTag(source)?.text ?? match;
    });
}

export const formatLoreEntriesAsContext = (entries: Lore[], stage: Stage): string => {
    const builder = buildPrompt();
    entries.forEach((entry) => {
        const title = (entry.title || '').trim() || 'Lore';
        const content = processLoreText(entry.content, stage).trim();
        if (content) {
            builder.addBlock(title, content);
        }
    });
    return builder.formatBlocks();
};

export function createLoreEntry(params: Partial<Omit<Lore, 'id'>>): Lore {
    return {
        type: "other",
        title: "",
        content: "",
        triggers: [],
        enabled: true,
        updatable: true,
        constant: false,
        scanDepth: 10,
        insertionOrder: 0,
        priority: 0,
        probability: 100,
        ...params,
        conditionCollections: (params.conditionCollections || []).map((collection) => [...collection]),
        id: generateUuid()
    };
}

export async function fetchLorebook() {
    const lorebookQuery = 'https://inference.chub.ai/api/lorebooks/miyo_rin/memoria-world-lore-5ddc2d6a3c0e?full=true';

    const response = await fetch(lorebookQuery);
    const item = await response.json();

    // Convert the fetched data into an array of Lore objects:
    const loreEntries: Lore[] = item.node.definition.embedded_lorebook.entries.map((entry: any, index: number) => {
        // Determine the type based on the title and the TYPE_MAPPING:
        let type: LoreType = "other"; // default to "other"
        for (const [key, names] of Object.entries(TYPE_MAPPING)) {
            if (names.includes(entry.name)) {
                type = key as LoreType;
                break;
            }
        }

        return createLoreEntry({
            type,
            title: entry.name,
            content: entry.content,
            triggers: entry.keys,
            enabled: entry.enabled,
            constant: entry.constant,
            insertionOrder: entry.insertion_order,
            priority: entry.priority,
            probability: entry.probability
        });
    });


    console.log('Fetched and parsed lorebook:');
    console.log(loreEntries);
    return loreEntries;

}

export async function updateLoreEntry(loreEntry: Lore, stage: Stage, additionalGuidance?: string): Promise<Lore> {
// Make a call with context and the current lore entry, asking for revisions based on context.
    const loreUpdatePromise = stage.generateText(buildPrompt()
        .addBlock('Instructions', `Based on the current context and recent events, output an updated or revised version of the content below, taking care to maintain all information from the original that remains true. If there are no significant changes, simply return the original content verbatim.`)
        .addBlock('Target Lore Title', loreEntry.title)
        .addBlock('Content for Revision', loreEntry.content)
        .addBlock('Response Format', buildStructuredResponseFormat(LORE_UPDATE_RESPONSE_FIELDS))
        .addBlock('Example Response',
            buildStructuredExampleResponse(LORE_UPDATE_RESPONSE_FIELDS, {
                planning: '<explanation of changes made and existing content to retain.>',
                content: '<revised content, including relevant updates and persisting other accurate details from the original.>',
            }))
        .addBlock('Additional Context', generateContext(undefined, stage, 3))
        .addBlock('Additional Guidance', additionalGuidance || '')
        .format(),
        10,
        2000,
        LORE_UPDATE_RESPONSE_FIELDS,
    ).then(response => {
        if (response) {
            const parsedResponse = parseStructuredResponse(response, LORE_UPDATE_RESPONSE_FIELDS);
            loreEntry.content = parsedResponse.content || loreEntry.content;
            stage.saveGame();
        }
    }).catch(error => {
        console.error(`Error updating lore entry ${loreEntry.title}`, error);
    }).finally(() => delete stage.generationPromises[`loreUpdate-${loreEntry.id}`]);
    stage.generationPromises[`loreUpdate-${loreEntry.id}`] = loreUpdatePromise;
    return loreUpdatePromise.then(() => loreEntry);
}