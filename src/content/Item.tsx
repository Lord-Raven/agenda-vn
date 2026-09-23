import { v4 as generateUuid } from 'uuid';
import { AlternativeImage, createAlternativeImage } from './AlternativeImage';
import { ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';
import { createLoreEntry } from './Lore';
import { cloneFunctionScriptOverrideMap, FunctionScriptOverrideMap, StatValue } from './Stat';
import { Stage } from '../Stage';
import { findBestNameMatch } from './Actor';

export const isItemAvailable = (item: Item, context: ConditionContext): boolean => (
    item.active !== false && evaluateConditionCollections(item.availabilityConditions, context)
);

export function getItemImageUrl(item: Item | undefined, context?: ConditionContext): string {
    if (!item) {
        return '';
    }

    return (context ? item.alternativeImages?.find((alternative) => evaluateConditionCollections(alternative.conditionCollections, context))?.imageUrl : '') || item.imageUrl || '';
}

export function getItemImagePrompt(item: Item | undefined): string {
    return item?.imagePrompt || '';
}

export function getLinkedItemLore(item: Item, stage: Stage, isCreatorMode: boolean = false) {
    const save = stage.getSave();
    const lorebook = isCreatorMode ? stage.getConfiguration().lorebook : save.lorebook;
    const items = isCreatorMode ? stage.getConfiguration().items : save.inventory;

    if (item.loreId) {
        const loreEntry = lorebook?.find(lore => lore.id === item.loreId);
        if (loreEntry) {
            return loreEntry;
        }
        item.loreId = '';
    }

    const unassociatedLoreEntries = lorebook?.filter(lore => lore.type === 'item' && !items.some(candidate => candidate.loreId === lore.id)) ?? [];
    const bestMatch = findBestNameMatch(item.name, unassociatedLoreEntries, ['title']);
    if (bestMatch) {
        item.loreId = bestMatch.id;
    }
    return bestMatch;
}

export function getItemDescription(itemId: string, stage: Stage, isCreatorMode: boolean = false): string {
    const items = isCreatorMode ? stage.getConfiguration().items : stage.getSave().inventory;
    const item = items.find(candidate => candidate.id === itemId);
    if (!item) {
        return '';
    }
    return getLinkedItemLore(item, stage, isCreatorMode)?.content || item.description || '';
}

export function updateItemDescription(itemId: string, description: string, stage: Stage, isCreatorMode: boolean = false) {
    const save = stage.getSave();
    const items = isCreatorMode ? stage.getConfiguration().items : save.inventory;
    const item = items.find(candidate => candidate.id === itemId);
    if (!item) {
        return;
    }

    const lore = getLinkedItemLore(item, stage, isCreatorMode);
    if (lore) {
        lore.content = description;
        if (isCreatorMode) {
            stage.updateConfiguration({ lorebook: stage.getConfiguration().lorebook || [] });
        } else {
            save.lorebook = save.lorebook || [];
            stage.saveGame();
        }
    }

    item.description = description;
    if (isCreatorMode) {
        stage.updateConfiguration({ items: stage.getConfiguration().items || [] });
    } else {
        stage.saveGame();
    }
}

export function upsertItemLoreEntry(item: Item, oldName: string, stage: Stage, isCreatorMode: boolean = false): void {
    const save = stage.getSave();
    let loreEntry = getLinkedItemLore(item, stage, isCreatorMode);
    let lorebook = stage.getConfiguration().lorebook || [];
    if (!loreEntry) {
        loreEntry = createLoreEntry({
            type: 'item',
            title: item.name,
            content: item.description,
            triggers: [],
            enabled: true,
            constant: false,
            insertionOrder: 0,
            priority: 0,
            probability: 100,
        });
        if (isCreatorMode) {
            lorebook = [...lorebook, loreEntry];
        } else {
            save.lorebook = save.lorebook || [];
            save.lorebook.push(loreEntry);
        }
    }

    loreEntry.title = item.name;
    loreEntry.content = item.description;
    loreEntry.triggers = [
        ...loreEntry.triggers.filter((trigger) => !oldName.includes(trigger)),
        ...item.name.split(' '),
    ];

    if (isCreatorMode) {
        stage.updateConfiguration({ lorebook });
    } else {
        save.lorebook = save.lorebook || [];
        stage.saveGame();
    }
}

export class Item {
    id: string = ''; // UUID
    loreId: string = '';
    active: boolean = true;
    name: string = ''; // Display name
    description: string = ''; // Description of the item
    category: string = '';
    imagePrompt: string = '';
    imageUrl: string = '';
    alternativeImages: AlternativeImage[] = [];
    themeColor: string = '';
    availabilityConditions: ConditionCollection[] = [];
    statMap: { [key: string]: StatValue } = {};
    // Per-instance overrides of this item's function-type stats (e.g. a custom "onUse" implementation), keyed
    // by the function stat's id; falls back to that stat definition's own script when absent/empty.
    // See resolveFunctionScript.
    functionScriptOverrides: FunctionScriptOverrideMap = {};

    constructor(props: any) {
        Object.assign(this, props);
        if (!this.id) {
            this.id = generateUuid();
        }
        this.active = this.active !== false;
        this.alternativeImages = Array.isArray(this.alternativeImages) ? this.alternativeImages.map(createAlternativeImage) : [];
        this.availabilityConditions = Array.isArray(this.availabilityConditions) ? this.availabilityConditions.map((collection) => [...collection]) : [];
        this.statMap = this.statMap && typeof this.statMap === 'object' ? { ...this.statMap } : {};
        this.functionScriptOverrides = cloneFunctionScriptOverrideMap(this.functionScriptOverrides);
        if (!this.themeColor) {
            const colors = ['#8ab0cc', '#89cd87', '#7a7b6b', '#b98f6e', '#2e354d'];
            this.themeColor = colors[Math.floor(Math.random() * colors.length)];
        }
    }
}