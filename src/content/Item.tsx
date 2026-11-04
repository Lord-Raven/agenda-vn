import { v4 as generateUuid } from 'uuid';
import { AspectRatio } from '@chub-ai/stages-ts';
import { AlternativeImage, createAlternativeImage } from './AlternativeImage';
import { ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';
import { createLoreEntry, formatLoreEntriesAsContext, selectConstantLoreEntries } from './Lore';
import { StatValue } from './Stat';
import { Stage } from '../Stage';
import { findBestNameMatch } from './Actor';
import { buildPrompt } from '../utils/PromptBuilder';
import { buildStructuredResponseFormat, parseStructuredResponse, StructuredFieldDefinition } from '../utils/StructuredResponse';
import { getImageGenerationSource } from '../utils/ImageSource';

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
    // Remove non-distinct entries:
    loreEntry.triggers = Array.from(new Set(loreEntry.triggers));

    if (isCreatorMode) {
        stage.updateConfiguration({ lorebook });
    } else {
        save.lorebook = save.lorebook || [];
        stage.saveGame();
    }
}

const ITEM_DETAIL_FIELDS: StructuredFieldDefinition[] = [
    { key: 'name', label: 'NAME', description: 'The item name.' },
    { key: 'category', label: 'CATEGORY', description: 'A concise organizational category for the item.' },
    { key: 'description', label: 'DESCRIPTION', description: 'A vivid but practical item description for the lorebook and UI.' },
    { key: 'themeColor', label: 'THEME COLOR', description: 'A hex UI theme color, like #8ab0cc.' },
];

type GeneratedItemDetails = Pick<Item, 'name' | 'category' | 'description' | 'themeColor'>;

export async function generateItemDetails(item: Item, stage: Stage, isCreatorMode: boolean = false): Promise<GeneratedItemDetails> {
    const generationKey = `item-details/${item.id}`;
    const existing = stage.generationPromises[generationKey];
    if (existing) {
        return existing as Promise<GeneratedItemDetails>;
    }

    const save = stage.getSave();
    const configuration = stage.getConfiguration();
    const worldContext = formatLoreEntriesAsContext(selectConstantLoreEntries(
        (isCreatorMode ? configuration.lorebook : save.lorebook) || [],
        { ...save, globalStats: configuration.globalStats, actorStats: configuration.actorStats, locationStats: configuration.locationStats, itemStats: configuration.itemStats },
    ), stage) || 'None provided.';

    const request = stage.generateText(buildPrompt()
        .addBlock('Instructions',
            'Use the existing item details and world context to produce polished item fields for this game. ' +
            'Preserve the identity of the item and keep it grounded in the same setting. Return the Response Format tags.')
        .addBlock('World Context', worldContext)
        .addBlock('Item Details', formatItemGenerationDetails(item))
        .addBlock('Response Format', buildStructuredResponseFormat(ITEM_DETAIL_FIELDS, { includeEndTag: true }))
        .format(), 50, 300, ITEM_DETAIL_FIELDS)
        .then((response: string) => {
            const parsed = parseStructuredResponse(response, ITEM_DETAIL_FIELDS);
            const name = parsed.name?.trim();
            const description = parsed.description?.trim();
            const themeColor = parsed.themeColor?.trim();
            if (!name || !description || !/^#([0-9A-F]{6}|[0-9A-F]{8})$/i.test(themeColor || '') || parsed.category === undefined) {
                throw new Error('Item generation returned incomplete or invalid details.');
            }
            return { name, category: parsed.category.trim(), description, themeColor };
        })
        .finally(() => { delete stage.generationPromises[generationKey]; });
    stage.generationPromises[generationKey] = request;
    return request;
}

function formatItemGenerationDetails(item: Item): string {
    return `Name: ${item.name || 'Unnamed item'}\n` +
        `Category: ${item.category || 'Uncategorized'}\n` +
        `Description: ${item.description || 'No description provided.'}\n` +
        `Theme Color: ${item.themeColor}`;
}

const ITEM_ART_PROMPT_FIELDS: StructuredFieldDefinition[] = [
    { key: 'artPrompt', label: 'ARTPROMPT', description: 'A concise prompt for the image model.' },
];

async function generateItemArtPrompt(item: Item, stage: Stage, alternative?: AlternativeImage): Promise<string> {
    const existingPrompt = (alternative ? alternative.imagePrompt : item.imagePrompt).trim();
    if (existingPrompt) {
        return existingPrompt;
    }

    const generationKey = alternative
        ? `item-alternative-prompt/${item.id}/${item.alternativeImages.indexOf(alternative)}`
        : `item-image-prompt/${item.id}`;
    const existing = stage.generationPromises[generationKey];
    if (existing) {
        return existing as Promise<string>;
    }

    const prompt = buildPrompt()
        .addBlock('Instructions', alternative
            ? 'Write one concise image-edit prompt to revise the base item image according to the alternative description. ' +
                'Preserve the same item, composition, and recognizable features. Focus on the visual changes. Return the Response Format tags.'
            : 'Write one concise image-generation prompt for a square illustration of this item. ' +
                'Focus on the item and its recognizable visual features. Return the Response Format tags.')
        .addBlock('Item Details', formatItemGenerationDetails(item));
    if (alternative) {
        prompt.addBlock('Alternative Description', alternative.description || 'No description provided.');
    }
    const request = stage.generateText(prompt
        .addBlock('Response Format', buildStructuredResponseFormat(ITEM_ART_PROMPT_FIELDS, { includeEndTag: true }))
        .format(), 10, 300, ITEM_ART_PROMPT_FIELDS)
        .then((response: string) => {
            const artPrompt = parseStructuredResponse(response, ITEM_ART_PROMPT_FIELDS).artPrompt?.trim();
            if (!artPrompt) {
                throw new Error('Item image generation returned no art prompt.');
            }
            if (alternative) {
                alternative.imagePrompt = artPrompt;
            } else {
                item.imagePrompt = artPrompt;
            }
            return artPrompt;
        })
        .finally(() => { delete stage.generationPromises[generationKey]; });
    stage.generationPromises[generationKey] = request;
    return request;
}

export async function generateBaseItemImage(item: Item, stage: Stage, force: boolean = false): Promise<string> {
    const generationKey = `item-base/${item.id}`;
    const existing = stage.generationPromises[generationKey];
    if (existing) {
        return existing as Promise<string>;
    }
    if (item.imageUrl.trim() && !force) {
        return item.imageUrl;
    }

    const request = (async () => {
        const prompt = await generateItemArtPrompt(item, stage);
        const imageUrl = await stage.makeImage({ prompt, aspect_ratio: AspectRatio.SQUARE }, '');
        if (!imageUrl) {
            throw new Error('Item image generation returned no image.');
        }
        item.imageUrl = imageUrl;
        return imageUrl;
    })().finally(() => { delete stage.generationPromises[generationKey]; });
    stage.generationPromises[generationKey] = request;
    return request;
}

export async function generateItemAlternativeImage(item: Item, alternative: AlternativeImage, stage: Stage, force: boolean = false): Promise<string> {
    const generationKey = `item-alternative-image/${item.id}/${item.alternativeImages.indexOf(alternative)}`;
    const existing = stage.generationPromises[generationKey];
    if (existing) {
        return existing as Promise<string>;
    }
    if (alternative.imageUrl && !force) {
        return alternative.imageUrl;
    }

    const request = (async () => {
        const baseImageUrl = await generateBaseItemImage(item, stage);
        const prompt = await generateItemArtPrompt(item, stage, alternative);
        const imageUrl = await stage.makeImageFromImage({
            image: await getImageGenerationSource(baseImageUrl),
            prompt,
            remove_background: false,
            transfer_type: 'edit',
        }, '');
        if (!imageUrl) {
            throw new Error('Alternative item generation returned no image.');
        }
        alternative.imageUrl = imageUrl;
        return imageUrl;
    })().finally(() => { delete stage.generationPromises[generationKey]; });
    stage.generationPromises[generationKey] = request;
    return request;
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

    constructor(props: any) {
        Object.assign(this, props);
        if (!this.id) {
            this.id = generateUuid();
        }
        this.active = this.active !== false;
        this.alternativeImages = Array.isArray(this.alternativeImages) ? this.alternativeImages.map(createAlternativeImage) : [];
        this.availabilityConditions = Array.isArray(this.availabilityConditions) ? this.availabilityConditions.map((collection) => [...collection]) : [];
        this.statMap = this.statMap && typeof this.statMap === 'object' ? { ...this.statMap } : {};
        if (!this.themeColor) {
            const colors = ['#8ab0cc', '#89cd87', '#7a7b6b', '#b98f6e', '#2e354d'];
            this.themeColor = colors[Math.floor(Math.random() * colors.length)];
        }
    }
}