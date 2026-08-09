import { v4 as generateUuid } from 'uuid';
import { Condition } from './Condition';
import { CalendarTimeOfDay } from './CalendarEvent';
import type { Stage } from '../Stage';

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

export async function generateMapImageForTimeOfDay(map: Map, timeOfDay: CalendarTimeOfDay, stage: Stage): Promise<string> {
    const baseImageUrl = map.imageUrl?.trim();
    const prompt = map.timeOfDayImagePrompts?.[timeOfDay]?.trim();
    if (!baseImageUrl || !prompt) {
        return '';
    }

    const generationKey = `map-image/${map.id}/${timeOfDay}`;
    const existingGeneration = stage.generationPromises[generationKey];
    if (existingGeneration) {
        return existingGeneration as Promise<string>;
    }

    const request = stage.makeImageFromImage({
        image: await getDataUrl(baseImageUrl),
        prompt: `Using the provided base image for ${map.name || 'this map'}, adapt it for ${timeOfDay}: ${prompt}`,
        remove_background: false,
        transfer_type: 'edit',
    }, '')
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