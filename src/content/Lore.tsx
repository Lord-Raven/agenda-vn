type LoreType = "character" | "location" | "other" | string;
import { v4 as generateUuid } from 'uuid';

// Dynamic entry names loaded from configuration lorebook triggers
const TYPE_MAPPING: Record<LoreType, string[]> = {
    character: [],
    location: [],
    other: [], // Everything else ends up being assigned to this by default.
};

// Populate TYPE_MAPPING from loaded lore entries
export function updateTypeMapping(lore: Lore[]): void {
    TYPE_MAPPING.character = lore.filter(l => l.type === 'character').flatMap(l => l.triggers);
    TYPE_MAPPING.location = lore.filter(l => l.type === 'location').flatMap(l => l.triggers);
    TYPE_MAPPING.other = lore.filter(l => l.type === 'other').flatMap(l => l.triggers);
}

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
    scanDepth: number; // default to 10
    insertionOrder: number;
    priority: number;
    probability: number; // 1 to 100
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

export const selectConstantLoreEntries = (lorebook: Lore[] = []): Lore[] => {
    return lorebook
        .filter((entry) => entry?.enabled && entry?.constant)
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
        constant: false,
        scanDepth: 10,
        insertionOrder: 0,
        priority: 0,
        probability: 100,
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