import { v4 as generateUuid } from 'uuid';
import { AspectRatio } from '@chub-ai/stages-ts';
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
import { CalendarTimeOfDay } from './CalendarEvent';


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

export const LOCATION_TIME_OF_DAY_ORDER: CalendarTimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

export const LOCATION_TIME_OF_DAY_LABELS: Record<CalendarTimeOfDay, string> = {
	morning: 'Morning',
	afternoon: 'Afternoon',
	evening: 'Evening',
	night: 'Night',
};

const LOCATION_TIME_OF_DAY_PROMPT_FIELDS: StructuredFieldDefinition[] = [
	{ key: 'prompt', label: 'PROMPT', description: 'A concise image-edit prompt describing how the location should change for the selected time of day.' },
];

const LOCATION_BASE_IMAGE_PROMPT_FIELDS: StructuredFieldDefinition[] = [
	{ key: 'prompt', label: 'PROMPT', description: 'A concise image-generation prompt describing the base visual composition for this location.' },
];

const LOCATION_TIME_OF_DAY_DESCRIPTIONS: Record<CalendarTimeOfDay, string> = {
	morning: 'soft early light, cooler shadows, dew, first activity, and a sense of the day just beginning',
	afternoon: 'brighter neutral daylight, crisp visibility, busier activity, and a clear view of the location',
	evening: 'warm sunset tones, longer shadows, glowing windows and lamps, and a gentle winding-down atmosphere',
	night: 'deep darkness, artificial light sources, reflections, moonlight, and a quieter after-hours mood',
};

async function getDataUrl(baseImageUrl: string): Promise<string> {
	if (baseImageUrl && baseImageUrl.startsWith('/assets/')) {
		const response = await fetch(baseImageUrl);
		const blob = await response.blob();
		const reader = new FileReader();
		reader.readAsDataURL(blob);
		baseImageUrl = await new Promise<string>((resolve) => {
			reader.onloadend = () => resolve(reader.result as string);
		});
	}
	return baseImageUrl;
}

export function getLocationImageUrl(location: Location | undefined, stage?: Stage, timeOfDay?: CalendarTimeOfDay): string {
	if (!location) {
		return '';
	}

	const resolvedTimeOfDay = timeOfDay || stage?.getSave().currentTimeOfDay || 'morning';
	return location.timeOfDayImageUrls?.[resolvedTimeOfDay] || location.imageUrl || '';
}

export function getLocationTimeOfDayPrompt(location: Location | undefined, timeOfDay: CalendarTimeOfDay): string {
	return location?.timeOfDayImagePrompts?.[timeOfDay] || '';
}

export function getLocationImagePrompt(location: Location | undefined): string {
	return location?.imagePrompt || '';
}

export async function generateLocationImagePrompt(location: Location, stage: Stage, force: boolean = false): Promise<string> {
	const existingPrompt = getLocationImagePrompt(location).trim();
	if (existingPrompt && !force) {
		return existingPrompt;
	}

	const generationKey = `location-image-prompt/${location.id}`;
	const existingGeneration = stage.generationPromises[generationKey];
	if (existingGeneration) {
		return existingGeneration as Promise<string>;
	}

	const promptRequest = stage.generateText(buildPrompt()
		.addBlock('Instructions',
			`This is a preparatory request for a single image-generation prompt for location art. ` +
			`Write exactly one concise prompt for an image generation model to create a base image of this location. ` +
			`The prompt should describe the setting in a vivid but practical way, preserving the location's identity and leaving room for later time-of-day adjustments. ` +
			`Return the result using the Response Format tags.`)
		.addBlock('Location Details',
			`Name: ${location.name || 'Unnamed location'}\n` +
			`Category: ${location.category || 'Uncategorized'}\n` +
			`Description: ${location.description || 'No description provided.'}\n` +
			`Theme Color: ${location.themeColor || '#8ab0cc'}\n` +
			`Light Color: ${location.lightColor || '#ffffff'}`)
		.addBlock('Response Format', buildStructuredResponseFormat(LOCATION_BASE_IMAGE_PROMPT_FIELDS, { includeEndTag: true }))
		.addBlock('Example Response', buildStructuredExampleResponse(
			LOCATION_BASE_IMAGE_PROMPT_FIELDS,
			{
				prompt: 'A moody vertical illustration of a narrow late-night cafe with amber pendant lights, scratched brass trim, and rain-streaked front windows, framed as a welcoming backdrop for story scenes.',
			},
			{ includeEndTag: true },
		))
		.format(),
		10,
		100,
		LOCATION_BASE_IMAGE_PROMPT_FIELDS,
	)
		.then((response: any) => {
			const parsedPrompt = parseStructuredResponse(`${response || ''}`, LOCATION_BASE_IMAGE_PROMPT_FIELDS);
			const prompt = (parsedPrompt.prompt || '').trim();
			if (prompt) {
				location.imagePrompt = prompt;
			}
			return prompt;
		})
		.finally(() => {
			delete stage.generationPromises[generationKey];
		});

	stage.generationPromises[generationKey] = promptRequest;
	return promptRequest;
}

export async function generateBaseLocationImage(location: Location, stage: Stage, force: boolean = false): Promise<string> {
	const generationKey = `location-base/${location.id}`;
	const existingGeneration = stage.generationPromises[generationKey];
	if (existingGeneration) {
		return existingGeneration as Promise<string>;
	}

	const currentBaseImageUrl = (location.imageUrl || '').trim();
	if (currentBaseImageUrl && !force) {
		return currentBaseImageUrl;
	}

	const request = (async () => {
		const basePrompt = await generateLocationImagePrompt(location, stage, false);
		if (!basePrompt) {
			return '';
		}

		const generatedImage = await stage.makeImage({
			prompt: basePrompt,
			aspect_ratio: AspectRatio.PHOTO_VERTICAL,
		}, '');

		location.imageUrl = generatedImage || '';
		return location.imageUrl;
	})().finally(() => {
		delete stage.generationPromises[generationKey];
	});

	stage.generationPromises[generationKey] = request;
	return request;
}

export async function generateLocationTimeOfDayPrompt(location: Location, timeOfDay: CalendarTimeOfDay, stage: Stage, force: boolean = false): Promise<string> {
	const existingPrompt = getLocationTimeOfDayPrompt(location, timeOfDay).trim();
	if (existingPrompt && !force) {
		return existingPrompt;
	}

	const generationKey = `location-prompt/${location.id}/${timeOfDay}`;
	const existingGeneration = stage.generationPromises[generationKey];
	if (existingGeneration) {
		return existingGeneration as Promise<string>;
	}

	const promptRequest = stage.generateText(buildPrompt()
		.addBlock('Instructions',
			`This is a preparatory request for a single image-edit instruction for location art generation. ` +
			`Write exactly one concise prompt for an image editing model to revise a base image of this location for the selected time of day. ` +
			`The prompt should describe how the environment changes while preserving the same location, composition, and major structures. ` +
			`Focus on lighting, atmosphere, color temperature, weather, reflections, shadows, and any practical details that distinguish this time of day. ` +
			`Return the result using the Response Format tags.`)
		.addBlock('Location Details',
			`Name: ${location.name || 'Unnamed location'}\n` +
			`Category: ${location.category || 'Uncategorized'}\n` +
			`Description: ${location.description || 'No description provided.'}\n` +
			`Theme Color: ${location.themeColor || '#8ab0cc'}\n` +
			`Light Color: ${location.lightColor || '#ffffff'}`)
		.addBlock('Target Time of Day', `${LOCATION_TIME_OF_DAY_LABELS[timeOfDay]} (${LOCATION_TIME_OF_DAY_DESCRIPTIONS[timeOfDay]})`)
		.addBlock('Response Format', buildStructuredResponseFormat(LOCATION_TIME_OF_DAY_PROMPT_FIELDS, { includeEndTag: true }))
		.addBlock('Example Response', buildStructuredExampleResponse(
			LOCATION_TIME_OF_DAY_PROMPT_FIELDS,
			{
				prompt: 'Shift the scene into evening by warming the light, lengthening the shadows, and turning on windows and lamps while preserving the same building layout.',
			},
			{ includeEndTag: true },
		))
		.format(),
		10,
		100,
		LOCATION_TIME_OF_DAY_PROMPT_FIELDS,
	)
		.then((response: any) => {
			const parsedPrompt = parseStructuredResponse(`${response || ''}`, LOCATION_TIME_OF_DAY_PROMPT_FIELDS);
			const prompt = (parsedPrompt.prompt || '').trim();
			if (prompt) {
				location.timeOfDayImagePrompts = {
					...(location.timeOfDayImagePrompts || {}),
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

export async function generateLocationImageForTimeOfDay(
	location: Location,
	timeOfDay: CalendarTimeOfDay,
	stage: Stage,
	force: boolean = false,
): Promise<string> {
	const generationKey = `location-image/${location.id}/${timeOfDay}`;
	const existingGeneration = stage.generationPromises[generationKey];
	if (existingGeneration) {
		return existingGeneration as Promise<string>;
	}

	if (!force) {
		const existingTimeOfDayImage = location.timeOfDayImageUrls?.[timeOfDay] || '';
		if (existingTimeOfDayImage) {
			return existingTimeOfDayImage;
		}
	}

	const request = (async () => {
		const baseImageUrl = await generateBaseLocationImage(location, stage, false);
		if (!baseImageUrl) {
			return '';
		}

		const prompt = await generateLocationTimeOfDayPrompt(location, timeOfDay, stage);
		if (!prompt) {
			return '';
		}

		const imageUrl = await stage.makeImageFromImage({
			image: await getDataUrl(baseImageUrl),
			prompt: `Using the provided base image for ${location.name || 'this location'}, adapt the scene for ${LOCATION_TIME_OF_DAY_LABELS[timeOfDay].toLowerCase()}: ${prompt}`,
			remove_background: false,
			transfer_type: 'edit',
		}, '');

		location.timeOfDayImageUrls = {
			...(location.timeOfDayImageUrls || {}),
			[timeOfDay]: imageUrl || '',
		};

		return imageUrl || '';
	})().finally(() => {
		delete stage.generationPromises[generationKey];
	});

	stage.generationPromises[generationKey] = request;
	return request;
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
    imagePrompt: string = ''; // A prompt for generating a base image representing this location, used as a fallback background in skits or location displays.
	imageUrl: string = ''; // URL for a base image representing this location, used as a fallback background in skits or location displays.
	timeOfDayImagePrompts: Partial<Record<CalendarTimeOfDay, string>> = {}; // Optional mapping of time-of-day to image-edit prompts for this location. Keys are "morning", "afternoon", "evening", "night".
	timeOfDayImageUrls: Partial<Record<CalendarTimeOfDay, string>> = {}; // Optional mapping of time-of-day to image URLs for this location. Keys are "morning", "afternoon", "evening", "night".
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
		this.timeOfDayImagePrompts = this.timeOfDayImagePrompts && typeof this.timeOfDayImagePrompts === 'object'
			? { ...(this.timeOfDayImagePrompts as Partial<Record<CalendarTimeOfDay, string>>) }
			: {};
		this.timeOfDayImageUrls = this.timeOfDayImageUrls && typeof this.timeOfDayImageUrls === 'object'
			? { ...(this.timeOfDayImageUrls as Partial<Record<CalendarTimeOfDay, string>>) }
			: {};
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