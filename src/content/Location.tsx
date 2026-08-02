import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { findBestNameMatch } from './Actor';


// Customize this list to define which locations are restored when the map is cleared.
export const DEFAULT_ATLAS_LOCATIONS: Location[] = [];

export const createDefaultAtlas = () => {
	const atlas: Record<string, Location> = {};
	for (const seed of DEFAULT_ATLAS_LOCATIONS) {
		const location = new Location(seed);
		atlas[location.id] = location;
	}
	return atlas;
};

export function getLinkedLocationLore(locationName: string, stage: Stage) {
	return findBestNameMatch(locationName, stage.getSave().lorebook?.filter(lore => lore.type === 'location') ?? [], ['title']);
}

export function getLocationDescription(locationId: string, stage: Stage) {
	const location = stage.getSave().atlas[locationId];
	if (!location) {
		return '';
	}

	const lore = getLinkedLocationLore(location.name, stage);
	return lore?.content ?? location.description;
}

export function updateLocationDescription(locationId: string, description: string, stage: Stage) {
	const location = stage.getSave().atlas[locationId];
	if (!location) {
		return;
	}

	const lore = getLinkedLocationLore(location.name, stage);
	if (lore) {
		lore.content = description;
		return;
	}

	location.description = description;
}

export class Location {
    id: string = '';
    name: string = '';
    description: string = '';
	category: string = ''; // A category for filtering or organization in the UI. Could be a region ("house", "city") or could be a type of location ("dungeons", "shops"); it is for organizational and not gameplay purposes.
    imageUrl: string = ''; // URL for an image representing this location, used as background in skits or location displays.
    focalPoint?: { x: number, y: number } = { x: 0.5, y: 0.5 }; // Relative image focus used when cropping this location
	lightColor: string = ''; // This is the lighting color for the location, used to tint character images in skits. If not set, default to white (#ffffff).
    themeColor: string = ''; // A color associated with this location, used for UI theming.

    constructor(props: any) {
        Object.assign(this, props);
        // Generate ID if not provided, using the first non-host/non-player actor as context
        if (!this.id) {
            this.id = generateUuid();
        }
        if (!this.themeColor) {
            // Pick from the core game theme palette in index.scss.
            const colors = ['#8ab0cc', '#89cd87', '#7a7b6b', '#b98f6e', '#2e354d'];
            this.themeColor = colors[Math.floor(Math.random() * colors.length)];
        }
    }
}