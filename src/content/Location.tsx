import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { findBestNameMatch } from './Actor';
import { createLoreEntry, formatLoreEntriesAsContext, selectConstantLoreEntries } from './Lore';
import { buildPrompt } from '../utils/PromptBuilder.js';
import {
	buildStructuredExampleResponse,
	buildStructuredResponseFormat,
	parseStructuredResponse,
	StructuredFieldDefinition,
} from '../utils/StructuredResponse.js';


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

export function upsertLocationLoreEntry(location: Location, oldName: string, stage: Stage): void {
	let loreEntry = getLinkedLocationLore(oldName, stage);
	if (!loreEntry) {
		loreEntry = createLoreEntry({
			type: 'location',
			title: location.name,
			content: location.description,
			triggers: [],
			enabled: true,
			constant: false,
			insertionOrder: 0,
			priority: 0,
			probability: 100,
		});
		stage.getSave().lorebook?.push(loreEntry);
	}

	loreEntry.title = location.name;
	loreEntry.content = location.description;
	loreEntry.triggers = [
		...loreEntry.triggers.filter((trigger) => !oldName.includes(trigger)),
		...location.name.split(' '),
	];
}

const LOCATION_DISTILLATION_FIELDS: StructuredFieldDefinition[] = [
	{ key: 'name', label: 'NAME', description: 'The location name.' },
	{ key: 'category', label: 'CATEGORY', description: 'A concise organizational category for this location.' },
	{ key: 'description', label: 'DESCRIPTION', description: 'A vivid but practical description of the location for the game lorebook and UI.' },
	{ key: 'theme_color', label: 'THEME COLOR', description: 'A hex color that suits this location UI theme, like #8ab0cc.' },
	{ key: 'light_color', label: 'LIGHT COLOR', description: 'A hex lighting tint for the location, like #ffffff.' },
];

export async function distillLocation(location: Location, definition: any, stage: Stage): Promise<Location | null> {
	console.log('Distilling location:', definition?.name || location.name);
	console.log(definition);

	const generationKey = `distilling_location/${location.id}`;
	const existingGeneration = stage.generationPromises[generationKey];
	if (existingGeneration) {
		return existingGeneration as Promise<Location | null>;
	}

	const worldContext = formatLoreEntriesAsContext(selectConstantLoreEntries(stage.getSave().lorebook || [])) || 'None provided.';

	const locationDetails = [
		`Name: ${String(definition?.name || location.name || '').trim()}`,
		`Category: ${String(definition?.category || location.category || '').trim() || 'Uncategorized'}`,
		`Description: ${String(definition?.description || getLocationDescription(location.id, stage) || location.description || '').trim()}`,
		`Theme Color: ${String(definition?.themeColor || location.themeColor || '').trim()}`,
		`Light Color: ${String(definition?.lightColor || location.lightColor || '').trim()}`,
	].join('\n');

	const request = stage.generateText(
		buildPrompt()
			.addBlock(
				'Instructions',
				`This is a preparatory request for structured game content. ` +
				`The world and its rules are described below. ` +
				`Use the existing location details to produce a polished set of location fields for this game. ` +
				`Keep the location grounded in the same setting, and output valid hex colors for theme and light colors.`
			)
			.addBlock('World Context', worldContext)
			.addBlock('Location Details', locationDetails)
			.addBlock('Response Format', buildStructuredResponseFormat(LOCATION_DISTILLATION_FIELDS, { includeEndTag: true }))
			.addBlock(
				'Example Response',
				buildStructuredExampleResponse(
					LOCATION_DISTILLATION_FIELDS,
					{
						name: 'Amber Drop Cafe',
						category: 'Cafe',
						description: 'A narrow late-night cafe with amber pendant lights, scratched brass trim, and rain-streaked front windows that make every conversation feel private.',
						theme_color: '#b98f6e',
						light_color: '#ffd7b0',
					},
					{ includeEndTag: true },
				),
			)
			.format(),
		50,
		300,
		LOCATION_DISTILLATION_FIELDS,
	).then((generatedResponse: string) => {
		console.log('Generated location distillation:');
		console.log(generatedResponse);

		const parsedData = parseStructuredResponse(generatedResponse, LOCATION_DISTILLATION_FIELDS);
		const oldName = location.name;
		const nextName = (parsedData['name'] || location.name || '').trim() || location.name;
		const nextCategory = (parsedData['category'] || location.category || '').trim();
		const nextDescription = (parsedData['description'] || getLocationDescription(location.id, stage) || location.description || '').trim();
		const nextThemeColor = /^#([0-9A-F]{6}|[0-9A-F]{8})$/i.test(parsedData['theme_color'] || '')
			? parsedData['theme_color']
			: location.themeColor;
		const nextLightColor = /^#([0-9A-F]{6}|[0-9A-F]{8})$/i.test(parsedData['light_color'] || '')
			? parsedData['light_color']
			: location.lightColor;

		location.name = nextName;
		location.category = nextCategory;
		location.description = nextDescription;
		location.themeColor = nextThemeColor;
		location.lightColor = nextLightColor;

		upsertLocationLoreEntry(location, oldName, stage);

		return location;
	}).finally(() => {
		delete stage.generationPromises[generationKey];
	});

	stage.generationPromises[generationKey] = request;
	return request;
}

export class Location {
    id: string = '';
	active: boolean = true; // Soft-delete flag. Inactive locations are hidden from management UIs.
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
		this.active = this.active !== false;
        if (!this.themeColor) {
            // Pick from the core game theme palette in index.scss.
            const colors = ['#8ab0cc', '#89cd87', '#7a7b6b', '#b98f6e', '#2e354d'];
            this.themeColor = colors[Math.floor(Math.random() * colors.length)];
        }
		if (!this.lightColor) {
			this.lightColor = '#ffffff';
		}
    }
}