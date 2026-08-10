type LoreType = "character" | "location" | "other" | string;
import { v4 as generateUuid } from 'uuid';
import { buildStructuredExampleResponse, buildStructuredResponseFormat, parseStructuredResponse, StructuredFieldDefinition } from '../utils/StructuredResponse';
import { Stage } from '../Stage';
import { generateContext } from './Skit';
import { buildPrompt } from '../utils/PromptBuilder';
import { ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';

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
        .filter((entry) => evaluateConditionCollections(entry.conditionCollections, context))
        .filter((entry) => isLoreProbabilityActive(entry));
};

export const formatLoreEntriesAsContext = (entries: Lore[] = []): string => {
    return entries
        .map((entry) => {
            const title = (entry.title || '').trim() || 'Lore';
            const content = String(entry.content || '').trim();
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
        conditionCollections: [],
        ...params,
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

export async function updateLoreEntry(loreEntry: Lore, stage: Stage): Promise<Lore> {
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
        .format(),
        10,
        1000,
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