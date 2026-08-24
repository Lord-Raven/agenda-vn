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
import { ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';
import { AlternativeImage, createAlternativeImage, getMatchingAlternativeImage } from './AlternativeImage';
import { StatValue } from './Stat';

export type CalendarDayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const LOCATION_DAY_OF_WEEK_ORDER: CalendarDayOfWeek[] = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday',
];

export const LOCATION_DAY_OF_WEEK_LABELS: Record<CalendarDayOfWeek, string> = {
	monday: 'Monday',
	tuesday: 'Tuesday',
	wednesday: 'Wednesday',
	thursday: 'Thursday',
	friday: 'Friday',
	saturday: 'Saturday',
	sunday: 'Sunday',
};

export const normalizeLocationOpenTimes = (openTimes: unknown): Partial<Record<CalendarDayOfWeek, CalendarTimeOfDay[]>> => {
	if (!openTimes || typeof openTimes !== 'object') {
		return {};
	}

	return LOCATION_DAY_OF_WEEK_ORDER.reduce<Partial<Record<CalendarDayOfWeek, CalendarTimeOfDay[]>>>((normalized, day) => {
		const candidate = (openTimes as Partial<Record<CalendarDayOfWeek, unknown>>)[day];
		if (!Array.isArray(candidate)) {
			return normalized;
		}

		const slots = LOCATION_TIME_OF_DAY_ORDER.filter((slot) => candidate.includes(slot));
		if (slots.length > 0) {
			normalized[day] = slots;
		}
		return normalized;
	}, {});
};

// A disabled location is hidden entirely from maps (e.g. a business that doesn't exist yet).
export const isLocationDisabled = (location: Location, context: ConditionContext): boolean => {
	return evaluateConditionCollections(location.availabilityConditions?.disabled, context, false);
};

// An inactive location still appears (grayed out) but cannot be visited (e.g. a business closed for the day).
export const isLocationInactive = (location: Location, context: ConditionContext): boolean => {
	return !evaluateConditionCollections(location.availabilityConditions?.unavailable, context);
};

export const isLocationAvailable = (location: Location, context: ConditionContext): boolean => {
	return location.active !== false && !isLocationDisabled(location, context) && !isLocationInactive(location, context);
};


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

export function getLinkedLocationLore(location: Location, stage: Stage) {
	if (location && location.loreId) {
		const loreEntry = stage.getSave().lorebook?.find(lore => lore.id === location.loreId);
		if (loreEntry) {
			return loreEntry;
		}
		location.loreId = ''; // Clear the loreId if it no longer exists
	}

	const unassociatedLoreEntries = stage.getSave().lorebook?.filter(lore => lore.type === 'location' && !Object.values(stage.getSave().atlas).some(a => a.loreId === lore.id)) ?? [];

	const bestMatch = findBestNameMatch(location.name, unassociatedLoreEntries, ['title']);
	if (bestMatch) {
		location.loreId = bestMatch.id; // Link the location to the best matching lore entry
	}
	return bestMatch;
}


export function updateLocationDescription(locationId: string, description: string, stage: Stage) {
	const location = stage.getSave().atlas[locationId];
	if (!location) {
		return;
	}

	const lore = getLinkedLocationLore(location, stage);
	if (lore) {
		lore.content = description;
	}

	location.description = description;
}

export function upsertLocationLoreEntry(location: Location, oldName: string, stage: Stage): void {
	let loreEntry = getLinkedLocationLore(location, stage);
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

const LOCATION_ALTERNATIVE_IMAGE_PROMPT_FIELDS: StructuredFieldDefinition[] = [
	{ key: 'artPrompt', label: 'ARTPROMPT', description: 'A concise image-edit prompt describing how the location image should be updated for the alternative description.' },
];

const LOCATION_BASE_IMAGE_PROMPT_FIELDS: StructuredFieldDefinition[] = [
	{ key: 'artPrompt', label: 'ARTPROMPT', description: 'A concise image-generation prompt describing the base visual composition for this location.' },
];

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

export function getLocationImageUrl(location: Location | undefined, stage?: Stage): string {
	if (!location) {
		return '';
	}

	return getMatchingAlternativeImage(location.alternativeImages, stage?.getSave())?.imageUrl || location.imageUrl || '';
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
			`Theme Color: ${location.themeColor || '#8ab0cc'}`)
		.addBlock('Response Format', buildStructuredResponseFormat(LOCATION_BASE_IMAGE_PROMPT_FIELDS, { includeEndTag: true }))
		.addBlock('Example Response', buildStructuredExampleResponse(
			LOCATION_BASE_IMAGE_PROMPT_FIELDS,
			{
					artPrompt: 'A moody vertical illustration of a narrow late-night cafe with amber pendant lights, scratched brass trim, and rain-streaked front windows, framed as a welcoming backdrop for story scenes.',
			},
			{ includeEndTag: true },
		))
		.format(),
		10,
		300,
		LOCATION_BASE_IMAGE_PROMPT_FIELDS,
	)
		.then((response: any) => {
			const parsedPrompt = parseStructuredResponse(`${response || ''}`, LOCATION_BASE_IMAGE_PROMPT_FIELDS);
			const prompt = (parsedPrompt.artPrompt || '').trim();
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
			aspect_ratio: AspectRatio.WIDESCREEN_HORIZONTAL,
		}, '');

		const qwenifiedImage = generatedImage ? await stage.makeImageFromImage({
			image: generatedImage,
			prompt: ''
		}, generatedImage) : '';

		location.imageUrl = qwenifiedImage || generatedImage || '';
		return location.imageUrl;
	})().finally(() => {
		delete stage.generationPromises[generationKey];
	});

	stage.generationPromises[generationKey] = request;
	return request;
}

export async function generateLocationAlternativeImagePrompt(location: Location, alternative: AlternativeImage, stage: Stage, force: boolean = false): Promise<string> {
	const existingPrompt = alternative.imagePrompt.trim();
	if (existingPrompt && !force) {
		return existingPrompt;
	}

	const alternativeIndex = location.alternativeImages.indexOf(alternative);
	const generationKey = `location-alternative-prompt/${location.id}/${alternativeIndex}`;
	const existingGeneration = stage.generationPromises[generationKey];
	if (existingGeneration) {
		return existingGeneration as Promise<string>;
	}

	const promptRequest = stage.generateText(buildPrompt()
		.addBlock('Instructions',
			`This is a preparatory request for a single image-edit instruction for location art generation. ` +
			`Write exactly one concise prompt for an image editing model to revise a base image of this location according to the alternative description. ` +
			`The prompt should describe how the environment changes while preserving the same location, composition, and major structures. ` +
			`Focus on the visual changes implied by the description, including lighting, atmosphere, weather, objects, or other practical details. ` +
			`Return the result using the Response Format tags.`)
		.addBlock('Location Details',
			`Name: ${location.name || 'Unnamed location'}\n` +
			`Category: ${location.category || 'Uncategorized'}\n` +
			`Description: ${location.description || 'No description provided.'}\n` +
			`Theme Color: ${location.themeColor || '#8ab0cc'}`)
		.addBlock('Alternative Description', alternative.description || 'No description provided.')
		.addBlock('Response Format', buildStructuredResponseFormat(LOCATION_ALTERNATIVE_IMAGE_PROMPT_FIELDS, { includeEndTag: true }))
		.addBlock('Example Response', buildStructuredExampleResponse(
			LOCATION_ALTERNATIVE_IMAGE_PROMPT_FIELDS,
			{
				artPrompt: 'Cover the scene in fresh snow with pale winter light and frosted windows while preserving the same building layout.',
			},
			{ includeEndTag: true },
		))
		.format(),
		10,
		500,
		LOCATION_ALTERNATIVE_IMAGE_PROMPT_FIELDS,
	)
		.then((response: any) => {
			const parsedPrompt = parseStructuredResponse(`${response || ''}`, LOCATION_ALTERNATIVE_IMAGE_PROMPT_FIELDS);
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

export async function generateLocationAlternativeImage(
	location: Location,
	alternative: AlternativeImage,
	stage: Stage,
	force: boolean = false,
): Promise<string> {
	const alternativeIndex = location.alternativeImages.indexOf(alternative);
	const generationKey = `location-alternative-image/${location.id}/${alternativeIndex}`;
	const existingGeneration = stage.generationPromises[generationKey];
	if (existingGeneration) {
		return existingGeneration as Promise<string>;
	}

	if (!force) {
		if (alternative.imageUrl) {
			return alternative.imageUrl;
		}
	}

	const request = (async () => {
		const baseImageUrl = await generateBaseLocationImage(location, stage, false);
		if (!baseImageUrl) {
			return '';
		}

		const prompt = await generateLocationAlternativeImagePrompt(location, alternative, stage);
		if (!prompt) {
			return '';
		}

		const imageUrl = await stage.makeImageFromImage({
			image: await getDataUrl(baseImageUrl),
			prompt: prompt,
			remove_background: false,
			transfer_type: 'edit',
		}, '');

		alternative.imageUrl = imageUrl || '';

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

	const save = stage.getSave();
	const configuration = stage.getConfiguration();
	const worldContext = formatLoreEntriesAsContext(selectConstantLoreEntries(save.lorebook || [], { ...save, globalStats: configuration.globalStats, actorStats: configuration.actorStats })) || 'None provided.';

	const locationDetails = [
		`Name: ${String(definition?.name || location.name || '').trim()}`,
		`Category: ${String(definition?.category || location.category || '').trim() || 'Uncategorized'}`,
		`Description: ${String(definition?.description || getLocationDescription(location.id, stage) || location.description || '').trim()}`,
		`Theme Color: ${String(definition?.themeColor || location.themeColor || '').trim()}`,
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

		location.name = nextName;
		location.category = nextCategory;
		location.description = nextDescription;
		location.themeColor = nextThemeColor;

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
	loreId: string = ''; // The ID of the lore entry associated with this location, if any. This is used to link the location to its description in the lorebook.
	active: boolean = true; // Soft-delete flag. Inactive locations are hidden from management UIs.
    name: string = '';
    description: string = '';
	category: string = ''; // A category for filtering or organization in the UI. Could be a region ("house", "city") or could be a type of location ("dungeons", "shops"); it is for organizational and not gameplay purposes.
    imagePrompt: string = ''; // A prompt for generating a base image representing this location, used as a fallback background in skits or location displays.
	imageUrl: string = ''; // URL for a base image representing this location, used as a fallback background in skits or location displays.
	alternativeImages: AlternativeImage[] = [];
    focalPoint?: { x: number, y: number } = { x: 0.5, y: 0.5 }; // Relative image focus used when cropping this location
    themeColor: string = ''; // A color associated with this location, used for UI theming.
	availabilityConditions: Record<'unavailable' | 'disabled', ConditionCollection[]> = { unavailable: [], disabled: [] }; // Any collection may pass; all conditions within a collection must pass.
	statMap: { [key: string]: StatValue } = {}; // Map of custom location stat id to value for this location

    constructor(props: any) {
        Object.assign(this, props);
        // Generate ID if not provided, using the first non-host/non-player actor as context
        if (!this.id) {
            this.id = generateUuid();
        }
		this.active = this.active !== false;
		this.alternativeImages = Array.isArray(this.alternativeImages) ? this.alternativeImages.map(createAlternativeImage) : [];
		const availabilityConditionsSource = (this.availabilityConditions || {}) as Record<string, ConditionCollection[]>;
		this.availabilityConditions = {
			unavailable: (availabilityConditionsSource.unavailable || []).map((collection) => [...collection]),
			disabled: (availabilityConditionsSource.disabled || []).map((collection) => [...collection]),
		};
		this.statMap = this.statMap && typeof this.statMap === 'object' ? { ...this.statMap } : {};
        if (!this.themeColor) {
            // Pick from the core game theme palette in index.scss.
            const colors = ['#8ab0cc', '#89cd87', '#7a7b6b', '#b98f6e', '#2e354d'];
            this.themeColor = colors[Math.floor(Math.random() * colors.length)];
        }
    }
}

// Replace {{user}} with the player's name
export function getLocationName(locationId: string, stage: Stage): string {
	const location = stage.getSave().atlas[locationId];
	return location?.name.replace('{{user}}', stage.getPlayerActor().name) || 'Unknown Location';
}

export function getLocationDescription(locationId: string, stage: Stage): string {
	const location = stage.getSave().atlas[locationId];

	const lore = getLinkedLocationLore(location, stage);
	return (lore?.content ?? location.description).replace('{{user}}', stage.getPlayerActor().name) || 'Unknown Description';
}