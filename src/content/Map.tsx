import { v4 as generateUuid } from 'uuid';
import { Condition } from './Condition';
import { CalendarTimeOfDay } from './CalendarEvent';
import type { Stage } from '../Stage';
import { buildPrompt } from '../utils/PromptBuilder.js';
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    parseStructuredResponse,
    StructuredFieldDefinition,
} from '../utils/StructuredResponse.js';

const MAP_TIME_OF_DAY_PROMPT_FIELDS: StructuredFieldDefinition[] = [
    { key: 'artPrompt', label: 'ARTPROMPT', description: 'A concise image-edit prompt describing how the map art should be updated for the selected time of day.' },
];

const MAP_TIME_OF_DAY_DESCRIPTIONS: Record<CalendarTimeOfDay, string> = {
    morning: 'soft early light, cooler shadows, and a sense of the day beginning',
    afternoon: 'bright neutral daylight, crisp visibility, and clear landmark details',
    evening: 'warm sunset tones, longer shadows, and lights beginning to glow',
    night: 'deep darkness, moonlight, artificial lights, and strong illuminated landmarks',
};

export function getMapImageUrl(map: Map | undefined, timeOfDay: CalendarTimeOfDay = 'morning'): string {
    return map?.timeOfDayImageUrls?.[timeOfDay] || map?.imageUrl || '';
}

async function getDataUrl(imageUrl: string): Promise<string> {
    if (imageUrl.startsWith('/assets/')) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    }
    return imageUrl;
}

export async function generateMapTimeOfDayPrompt(map: Map, timeOfDay: CalendarTimeOfDay, stage: Stage): Promise<string> {
    const existingPrompt = map.timeOfDayImagePrompts?.[timeOfDay]?.trim();
    if (existingPrompt) {
        return existingPrompt;
    }

    const generationKey = `map-prompt/${map.id}/${timeOfDay}`;
    const existingGeneration = stage.generationPromises[generationKey];
    if (existingGeneration) {
        return existingGeneration as Promise<string>;
    }

    const promptRequest = stage.generateText(buildPrompt()
        .addBlock('Instructions',
            `This is a preparatory request for a single image-edit instruction for map art generation. ` +
            `Write exactly one concise prompt for an image editing model to revise a base map image for the selected time of day. ` +
            `Preserve the map's layout, labels, landmarks, paths, and composition. ` +
            `Focus on lighting, color temperature, shadows, atmosphere, and illuminated details. ` +
            `Return the result using the Response Format tags.`)
        .addBlock('Map Details',
            `Name: ${map.name || 'Unnamed map'}\n` +
            `Category: ${map.category || 'Uncategorized'}\n` +
            `Description: ${map.description || 'No description provided.'}`)
        .addBlock('Target Time of Day', `${timeOfDay} (${MAP_TIME_OF_DAY_DESCRIPTIONS[timeOfDay]})`)
        .addBlock('Response Format', buildStructuredResponseFormat(MAP_TIME_OF_DAY_PROMPT_FIELDS, { includeEndTag: true }))
        .addBlock('Example Response', buildStructuredExampleResponse(
            MAP_TIME_OF_DAY_PROMPT_FIELDS,
            {
                artPrompt: 'Shift the map into evening with warm low-angle light, long landmark shadows, and softly glowing windows while preserving every path, label, and structure.',
            },
            { includeEndTag: true },
        ))
        .format(),
        10,
        100,
        MAP_TIME_OF_DAY_PROMPT_FIELDS,
    )
        .then((response: any) => {
            const parsedPrompt = parseStructuredResponse(`${response || ''}`, MAP_TIME_OF_DAY_PROMPT_FIELDS);
            const prompt = (parsedPrompt.artPrompt || '').trim();
            if (prompt) {
                map.timeOfDayImagePrompts = {
                    ...(map.timeOfDayImagePrompts || {}),
                    [timeOfDay]: prompt,
                };
            }
            return prompt;
        })
        .finally(() => {
            delete stage.generationPromises[generationKey];
        });

    stage.generationPromises[generationKey] = promptRequest;
    return promptRequest;
}

export async function generateMapImageForTimeOfDay(map: Map, timeOfDay: CalendarTimeOfDay, stage: Stage): Promise<string> {
    const baseImageUrl = map.imageUrl?.trim();
    if (!baseImageUrl) {
        return '';
    }

    const generationKey = `map-image/${map.id}/${timeOfDay}`;
    const existingGeneration = stage.generationPromises[generationKey];
    if (existingGeneration) {
        return existingGeneration as Promise<string>;
    }

    const request = (async () => {
        const prompt = await generateMapTimeOfDayPrompt(map, timeOfDay, stage);
        if (!prompt) {
            return '';
        }

        const imageUrl = await stage.makeImageFromImage({
            image: await getDataUrl(baseImageUrl),
            prompt: `Using the provided base image for ${map.name || 'this map'}, adapt it for ${timeOfDay}: ${prompt}`,
            remove_background: false,
            transfer_type: 'edit',
        }, '');

        map.timeOfDayImageUrls = {
            ...(map.timeOfDayImageUrls || {}),
            [timeOfDay]: imageUrl || '',
        };
        return imageUrl || '';
    })()
        .then((imageUrl) => {
            map.timeOfDayImageUrls = {
                ...(map.timeOfDayImageUrls || {}),
                [timeOfDay]: imageUrl || '',
            };
            return imageUrl || '';
        })
        .finally(() => {
            delete stage.generationPromises[generationKey];
        });

    stage.generationPromises[generationKey] = request;
    return request;
}

// A map is a collection of links to other Maps or Locations.
export class Map {
    id: string = generateUuid();
    active: boolean = true; // Soft-delete flag. Inactive maps are hidden from management UIs.
    priority: number = 0; // A priority for ordering maps in the UI. Lower numbers are higher priority. This is also used to determine which Map shows by default; the lowest number displays when the game starts; a lower number will display if two maps have the same Location when leaving a skit. Maps cannot share a priority number.
    name: string = '';
    description: string = '';
    category: string = ''; // A category for filtering or organization in the UI. Could be a region, perhaps ("northlands", "ocean"); it is for organizational and not gameplay purposes.
    imagePrompt: string = ''; // A prompt for generating a map image 
    imageUrl: string = ''; // URL for the map image
    timeOfDayImagePrompts: Partial<Record<CalendarTimeOfDay, string>> = {};
    timeOfDayImageUrls: Partial<Record<CalendarTimeOfDay, string>> = {};
    links: MapLink[] = []; // Links to other maps or locations

    constructor(data?: Partial<Map>) {
        Object.assign(this, data || {});
        this.timeOfDayImagePrompts = { ...(data?.timeOfDayImagePrompts || {}) };
        this.timeOfDayImageUrls = { ...(data?.timeOfDayImageUrls || {}) };
        this.links = (data?.links || []).map((link) => ({
            ...link,
            parentId: data?.id || this.id,
            coordinates: { ...link.coordinates },
            conditions: Array.isArray(link.conditions) ? [...link.conditions] : [],
        }));
    }
}

export interface MapLink {
    parentId: string; // The ID of the parent Map
    childId: string; // The ID of the child map or location
    coordinates: { x: number; y: number }; // Coordinates for the link on the parent Map (x and y are between 0 and 1, representing a percentage of the map's width and height)
    conditions?: Condition[]; // All conditions must pass for this link to be available.
}