type LoreType = "character" | "location" | "other" | string;
import { v4 as generateUuid } from 'uuid';
import { buildStructuredExampleResponse, buildStructuredResponseFormat, parseStructuredResponse, StructuredFieldDefinition } from '../utils/StructuredResponse';
import { Stage } from '../Stage';
import { generateContext } from './Skit';
import { buildPrompt } from '../utils/PromptBuilder';
import { ConditionCollection, ConditionContext, evaluateConditionCollections, hasVariableContentTarget } from './Condition';
import { Stat, StatValue, formatReferenceStatText, formatStatOptionValueText, isFunctionStatType, normalizeStatValue, resolveReferenceKind } from './Stat';

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

// {{user}}, {{char}}, {{global:Stat}}, {{user:Stat}}, {{char:Stat}}; stats match by id or (case-insensitive) name.
const LORE_TAG_PATTERN = /\{\{\s*(user|char|global)\s*(?::\s*([^}]*?)\s*)?\}\}/gi;

const findStatByKey = (stats: Stat[] | undefined, key: string): Stat | undefined => {
    const lowerKey = key.toLowerCase();
    return (stats || []).find((stat) => stat.id === key || (stat.name || '').trim().toLowerCase() === lowerKey);
};

// Resolves template tags in lore text for LLM/display use. Unresolvable tags (unknown stat, no target actor,
// perActor/function stats) are left untouched. Don't use on text that will be written back to the lore entry.
export function processLoreText(text: string | undefined, stage: Stage, targetActor?: LoreTextActor): string {
    const save = stage.getSave();
    const configuration = stage.getConfiguration();
    const player = stage.getPlayerActor();
    const lookup = { actors: save.actors, items: save.inventory, locations: save.atlas };

    const formatValue = (stat: Stat, rawValue: unknown): string => {
        const value = normalizeStatValue(rawValue, stat);
        if (stat.type === 'checkbox') {
            return value === true ? 'yes' : 'no';
        }
        if (resolveReferenceKind(stat.type)) {
            return formatReferenceStatText(stat, value, lookup, (kind) => `unknown ${kind}`);
        }
        return formatStatOptionValueText(stat, value) ?? String(value ?? '');
    };

    return String(text || '').replace(LORE_TAG_PATTERN, (match, tag: string, statKey: string | undefined) => {
        const tagName = tag.toLowerCase();
        if (tagName === 'global') {
            const stat = statKey ? findStatByKey(configuration.globalStats, statKey) : undefined;
            if (!stat || isFunctionStatType(stat.type)) {
                return match;
            }
            return formatValue(stat, save.globalStatValues?.[stat.id] ?? configuration.globalStatValues?.[stat.id]);
        }

        const actor: LoreTextActor | undefined = tagName === 'user' ? player : targetActor;
        if (!statKey) {
            if (tagName === 'user') {
                return player?.name || 'the player';
            }
            return actor ? (actor.displayName || actor.name) : match;
        }

        const stat = findStatByKey(configuration.actorStats, statKey);
        if (!actor || !stat || stat.perActor || isFunctionStatType(stat.type)) {
            return match;
        }
        return formatValue(stat, actor.statMap?.[stat.id]);
    });
}

export const formatLoreEntriesAsContext = (entries: Lore[], stage: Stage): string => {
    return entries
        .map((entry) => {
            const title = (entry.title || '').trim() || 'Lore';
            const content = processLoreText(entry.content, stage).trim();
            if (!content) {
                return '';
            }

            return `${title}:\n${content}`;
        })
        .filter(Boolean)
        .join('\n\n');
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