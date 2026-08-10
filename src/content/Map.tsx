import { v4 as generateUuid } from 'uuid';
import { ConditionCollection } from './Condition';
import type { Stage } from '../Stage';
import { AlternativeImage, createAlternativeImage, getMatchingAlternativeImage } from './AlternativeImage';
import { buildPrompt } from '../utils/PromptBuilder.js';
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    parseStructuredResponse,
    StructuredFieldDefinition,
} from '../utils/StructuredResponse.js';

const MAP_ALTERNATIVE_IMAGE_PROMPT_FIELDS: StructuredFieldDefinition[] = [
    { key: 'artPrompt', label: 'ARTPROMPT', description: 'A concise image-edit prompt describing how the map art should be updated for the alternative description.' },
];

export function getMapImageUrl(map: Map | undefined, stage?: Stage): string {
    if (!map) {
        return '';
    }
    return getMatchingAlternativeImage(map.alternativeImages, stage?.getSave())?.imageUrl || map.imageUrl || '';
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

export async function generateMapAlternativeImagePrompt(map: Map, alternative: AlternativeImage, stage: Stage): Promise<string> {
    const existingPrompt = alternative.imagePrompt.trim();
    if (existingPrompt) {
        return existingPrompt;
    }

    const alternativeIndex = map.alternativeImages.indexOf(alternative);
    const generationKey = `map-alternative-prompt/${map.id}/${alternativeIndex}`;
    const existingGeneration = stage.generationPromises[generationKey];
    if (existingGeneration) {
        return existingGeneration as Promise<string>;
    }

    const promptRequest = stage.generateText(buildPrompt()
        .addBlock('Instructions',
            `This is a preparatory request for a single image-edit instruction for map art generation. ` +
            `Write exactly one concise prompt for an image editing model to revise a base map image according to the alternative description. ` +
            `Preserve the map's layout, labels, landmarks, paths, and composition. ` +
            `Focus on lighting, color temperature, shadows, atmosphere, and illuminated details. ` +
            `Return the result using the Response Format tags.`)
        .addBlock('Map Details',
            `Name: ${map.name || 'Unnamed map'}\n` +
            `Category: ${map.category || 'Uncategorized'}\n` +
            `Description: ${map.description || 'No description provided.'}`)
        .addBlock('Alternative Description', alternative.description || 'No description provided.')
        .addBlock('Response Format', buildStructuredResponseFormat(MAP_ALTERNATIVE_IMAGE_PROMPT_FIELDS, { includeEndTag: true }))
        .addBlock('Example Response', buildStructuredExampleResponse(
            MAP_ALTERNATIVE_IMAGE_PROMPT_FIELDS,
            {
                artPrompt: 'Cover the map in fresh snow with pale winter light and partially frozen waterways while preserving every path, label, and structure.',
            },
            { includeEndTag: true },
        ))
        .format(),
        10,
        100,
        MAP_ALTERNATIVE_IMAGE_PROMPT_FIELDS,
    )
        .then((response: any) => {
            const parsedPrompt = parseStructuredResponse(`${response || ''}`, MAP_ALTERNATIVE_IMAGE_PROMPT_FIELDS);
            const prompt = (parsedPrompt.artPrompt || '').trim();
            if (prompt) {
                alternative.imagePrompt = prompt;
            }
            return prompt;
        })
        .finally(() => {
            delete stage.generationPromises[generationKey];
        });

    stage.generationPromises[generationKey] = promptRequest;
    return promptRequest;
}

export async function generateMapAlternativeImage(map: Map, alternative: AlternativeImage, stage: Stage): Promise<string> {
    const baseImageUrl = map.imageUrl?.trim();
    if (!baseImageUrl) {
        return '';
    }

    const alternativeIndex = map.alternativeImages.indexOf(alternative);
    const generationKey = `map-alternative-image/${map.id}/${alternativeIndex}`;
    const existingGeneration = stage.generationPromises[generationKey];
    if (existingGeneration) {
        return existingGeneration as Promise<string>;
    }

    const request = (async () => {
        const prompt = await generateMapAlternativeImagePrompt(map, alternative, stage);
        if (!prompt) {
            return '';
        }

        const imageUrl = await stage.makeImageFromImage({
            image: await getDataUrl(baseImageUrl),
            prompt: `Using the provided base image for ${map.name || 'this map'}, adapt it for ${alternative.description || 'the requested alternative'}: ${prompt}`,
            remove_background: false,
            transfer_type: 'edit',
        }, '');

        alternative.imageUrl = imageUrl || '';
        return imageUrl || '';
    })()
        .then((imageUrl) => {
            alternative.imageUrl = imageUrl || '';
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
    alternativeImages: AlternativeImage[] = [];
    links: MapLink[] = []; // Links to other maps or locations

    constructor(data?: Partial<Map>) {
        Object.assign(this, data || {});
        this.alternativeImages = (data?.alternativeImages || []).map(createAlternativeImage);
        this.links = (data?.links || []).map((link) => ({
            ...link,
            parentId: data?.id || this.id,
            coordinates: { ...link.coordinates },
            conditionCollections: (link.conditionCollections || []).map((collection) => [...collection]),
        }));
    }
}

export interface MapLink {
    parentId: string; // The ID of the parent Map
    childId: string; // The ID of the child map or location
    coordinates: { x: number; y: number }; // Coordinates for the link on the parent Map (x and y are between 0 and 1, representing a percentage of the map's width and height)
    conditionCollections?: ConditionCollection[]; // Any collection may pass; all conditions within a collection must pass.
}