import {ReactElement} from "react";
import { v4 as uuidv4 } from 'uuid';
import {StageBase, StageResponse, InitialData, Message, User, Character, AspectRatio} from "@chub-ai/stages-ts";
import { ConditionContext, evaluateConditionCollections } from "./content/Condition";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import { Actor, ACTOR_SCHEDULE_AVAILABLE, ActorSchedule, applyActorInitialStats, cloneActorSchedule, findBestNameMatch, getLinkedActorLore, resolveActorSchedule, ScheduleContext } from "./content/Actor";
import { DEFAULT_VOICE_MODULATION } from '@lord-raven/novel-visualizer';
import { buildInitialGlobalStatValues, findStatOptionByValue, formatReferenceStatText, formatStatOptionValueText, isListStatType, isReferenceStatType, resolveStatOptionPool, resolveReferenceKind, Stat, StatType, StatValue, StatUpdate, StatUpdateRule, StatUpdateAction, GameAction, applyStatUpdateValue, cloneStat, cloneStatUpdateAction, cloneStatUpdateRules, includeNewOptionListOptions, normalizeStatValue, resolveStatText, setOptionListSourceResolver } from './content/Stat';
import { GameFunction, cloneGameFunction, runFunctionScript, FunctionScriptBindings, FunctionScriptEntity, FunctionScriptObject, FunctionScriptTestResult, isFunctionReference, functionReference, functionReferenceId, functionReferenceArguments, namedFunctionArguments, positionalFunctionArguments, parseFunctionCallText, isGlobalStatReference, globalStatReferenceId, isValueReference, listElementType, validateFunctionResult } from './content/Function';
import { resolveStatValue } from './content/Stat';
import { evaluateValueExpression } from './content/ValueExpression';
import { SkitActionValue, StartSkitAction } from './content/Stat';
import { ALL_DAY_DURATION, CalendarEvent, CalendarEventRecurrence, CalendarEventRecurrenceFrequency, CalendarTimeOfDay, TimeMode, setActiveTimeMode } from "./content/CalendarEvent";
import { Item } from "./content/Item";
import { compareControlPriority, Control, ControlPlacement, isControlAvailable } from "./content/Control";
import { buildScriptLog, generateContext, generateSkitScript, generateSkitSummary, Skit } from "./content/Skit";
import { createDefaultAtlas, isLocationAvailable, isLocationDisabled, Location } from "./content/Location";
import { Map as GameMap } from "./content/Map";
import { cloneUiSettings, DEFAULT_UI_SETTINGS, UiSettings } from './content/Style';
import { BaseScreen } from "./screens/BaseScreen";
import { Lore, updateLoreEntry } from "./content/Lore";
import { DEFAULT_PLAYER_THEME_COLOR } from "./screens/SettingsScreen";
import {buildPrompt} from "./utils/PromptBuilder.js";
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    getStructuredFieldTags,
    parseStructuredResponse,
    parseStructuredListValue,
    parseXmlTagsToObjects,
    StructuredFieldDefinition,
} from "./utils/StructuredResponse.js";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = {
    saves: (SaveType | undefined)[]
    configuration: GameConfiguration
    lastSaveSlot: number
};

export type SaveType = {
    configuration?: GameConfiguration; // Snapshot of the rules used by this playthrough; absent on legacy saves.
    playerId: string;
    actors: {[key: string]: Actor};
    atlas: {[key: string]: Location};
    maps: GameMap[];
    universalSchedule: ActorSchedule;
    inventory: Item[];
    timeline: TimelineEntry[];
    timestamp: number; // Time of last save
    enableImpersonation?: boolean;
    enableFontEffects?: boolean;
    enableTextToSpeech?: boolean;
    enableHaptics?: boolean;
    language?: string;
    lorebook?: Lore[];
    currentDate?: string;
    currentTimeOfDay?: CalendarTimeOfDay;
    upcomingEvents?: CalendarEvent[];
    globalStatValues?: {[key: string]: StatValue};
    uiSettings?: UiSettings;
    betaMode?: boolean;
}

const ACTOR_SEED_FIELDS: StructuredFieldDefinition[] = [
    {
        key: 'name',
        label: 'Name',
        description: 'A distinct first name for the character.',
    },
    {
        key: 'profile',
        label: 'Profile',
        description: '2-4 sentences describing personality, motives, or social role.',
    },
    {
        key: 'description',
        label: 'Description',
        description: '1-3 sentences describing key visual traits to guide character art generation.',
    },
];

const LORE_UPDATE_CANDIDATE_FIELDS: StructuredFieldDefinition[] = [
    {
        key: 'reasoning',
        label: 'Reasoning',
        description: 'Brief explanation of which characters, if any, have profile details that should be revised to reflect the player\'s identity, role, or choices.',
    },
    {
        key: 'characterGuidance',
        label: 'Characters',
        description: 'One brief line for each character whose profile should be updated, formatted as Character Name: specific guidance for the profile revision. Leave empty if none apply.',
    },
];

type LoreUpdateCandidate = {
    actor: Actor;
    guidance: string;
};

const CALENDAR_TIME_ORDER: CalendarTimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

// Upper bound on how many in-game periods a single calendar advance will replay stat update rules for, so a
// large jump (or malformed dates) cannot spin indefinitely.
const MAX_STAT_UPDATE_PERIODS = 128;

// Prevent cyclical function calls from recursing indefinitely.
const MAX_FUNCTION_INVOCATION_DEPTH = 8;
type ScriptContext = { readOnly: boolean; stack: string[] };

// Simple (string) metadata fields a function script may read/write directly on an actor/location/item via
// getField/setField, bypassing the Stat system entirely. Deliberately excludes complex fields (schedule,
// outfits, statMap, availabilityConditions, etc.) that have their own structure/semantics.
const ACTOR_SCRIPT_FIELDS: (keyof Actor)[] = ['name', 'displayName', 'role', 'birthDate', 'summary', 'description', 'background', 'profile', 'category', 'themeColor', 'themeFontFamily', 'voiceId'];
const LOCATION_SCRIPT_FIELDS: (keyof Location)[] = ['name', 'description', 'category', 'imagePrompt', 'imageUrl', 'themeColor'];
const ITEM_SCRIPT_FIELDS: (keyof Item)[] = ['name', 'description', 'category', 'imagePrompt', 'imageUrl', 'themeColor'];

// Canon configuration for new games. Saves retain snapshots; creator rule edits also update the active snapshot.
export type GameConfiguration = {
    versionId?: string; // Changed on each successful publication, not on local creator edits.
    actors: Actor[], // All defined actors for a new game
    locations: Location[], // All defined locations for a new game
    items: Item[], // All defined items for a new game
    maps: GameMap[], // All defined maps for a new game
    universalSchedule: ActorSchedule, // Universal schedule for all actors (applies to current and new games)
    lorebook: Lore[], // Lore entries to seed into new games
    calendarEvents: CalendarEvent[], // Calendar event series definitions to seed into new games
    actorStats: Stat[], // All custom actor stats and defaults (applies to current and new games)
    locationStats: Stat[], // All custom location stats and defaults (applies to current and new games)
    itemStats: Stat[], // All custom item stats and defaults (applies to current and new games)
    globalStats: Stat[], // Stats that apply to the game in general (player or world state)
    functions: GameFunction[], // Global scripts invoked by actions or other functions
    globalStatValues: {[key: string]: StatValue}, // Legacy configuration field; values now belong only to saves.
    statUpdateRules: StatUpdateRule[], // Conditional actions at new-game startup or as in-game time advances
    controls: Control[], // UI controls displayed in map docks, Settings, outcomes, or actor cards.
    uiSettings: UiSettings, // Default UI styling for new games
    title: string, // Title of this game
    titleImageUrl: string, // URL of a title image for the game
    titleImagePrompt: string, // Prompt for generating a title image for the game
    backgroundImageUrl: string, // URL of a background image for the menu and calendar screens
    backgroundImagePrompt: string, // Prompt for generating a background image for the menu and calendar screens
    startingDate: string; // The starting date of the game, in YYYY-MM-DD format (applies to new game)
    artStyle: string; // Describes the art style used for image generation
    creatorNotes: string; // Optional notes from the creator about the game, its world, or its characters; this is displayed in the Creator Notes HTML.
    versionNotes: string; // Optional notes about the current version of the game, its world, or its characters; this replaces version details in MenuScreen and is inserted after creator notes in Creator Notes HTML.
    castActorIds: string[]; // Optional allowlist of actor ids for the Creator Notes HTML cast section; if empty, all active actors are included.
    slideshowLocationIds: string[]; // Optional allowlist of location ids for the Creator Notes HTML slideshow; if empty, active locations are used in their existing order.
    dateMode: DateMode; // Whether the game tracks real calendar dates or an abstract turn/day counter
    timeMode: TimeMode; // Whether the four daily slots are presented as times of day or as abstract phases
    useEvents: boolean; // Whether the calendar event system (event panel, calendar screen, generated/mandatory events) is enabled

}

// 'calendar' shows real calendar dates and month grids; 'turnBased' hides real dates behind a Day N counter and a timeline view.
export type DateMode = 'calendar' | 'turnBased';

const cloneActor = (actor: Actor, stripImagePrompts: boolean = false): Actor => new Actor({
    ...actor,
    outfits: (actor.outfits || []).map(outfit => ({
        ...outfit,
        prompts: stripImagePrompts ? {} : { ...(outfit.prompts || {}) },
        emotionPack: { ...(outfit.emotionPack || {}) },
    })),
    statMap: actor.statMap && typeof actor.statMap === 'object' ? { ...actor.statMap } : {},
});

const cloneLocation = (location: Location, stripImagePrompts: boolean = false): Location => new Location({
    ...location,
    alternativeImages: (location.alternativeImages || []).map(alternative => ({
        ...alternative,
        imagePrompt: stripImagePrompts ? '' : alternative.imagePrompt,
        conditionCollections: (alternative.conditionCollections || []).map(collection => [...collection]),
    })),
    focalPoint: location.focalPoint ? { ...location.focalPoint } : undefined,
    statMap: location.statMap && typeof location.statMap === 'object' ? { ...location.statMap } : {},
});

const cloneItem = (item: Item, stripImagePrompts: boolean = false): Item => new Item({
    ...item,
    imagePrompt: stripImagePrompts ? '' : item.imagePrompt,
    alternativeImages: (item.alternativeImages || []).map(alternative => ({
        ...alternative,
        imagePrompt: stripImagePrompts ? '' : alternative.imagePrompt,
        conditionCollections: (alternative.conditionCollections || []).map(collection => [...collection]),
    })),
    availabilityConditions: (item.availabilityConditions || []).map((collection) => [...collection]),
    statMap: item.statMap && typeof item.statMap === 'object' ? { ...item.statMap } : {},
});

const cloneControl = (control: Control): Control => new Control({
    ...control,
    availabilityConditions: (control.availabilityConditions || []).map((collection) => [...collection]),
    actions: (control.actions || []).map(cloneStatUpdateAction),
});

const cloneMap = (map: GameMap): GameMap => new GameMap({
    ...map,
    focalPoint: map.focalPoint ? { ...map.focalPoint } : undefined,
    availabilityConditions: (map.availabilityConditions || []).map((collection) => [...collection]),
    links: (map.links || []).map((link) => ({
        ...link,
        coordinates: { ...link.coordinates },
    })),
});

const cloneLore = (entry: Lore): Lore => ({
    ...entry,
    triggers: [...(entry.triggers || [])],
    conditionCollections: (entry.conditionCollections || []).map((collection) => [...collection]),
    triggerConditionCollections: (entry.triggerConditionCollections || []).map((collection) => [...collection]),
});

const cloneCalendarEvent = (event: CalendarEvent): CalendarEvent => ({
    ...event,
    duration: [...(event.duration || ALL_DAY_DURATION)],
    actorIds: [...(event.actorIds || event.participantActorIds || [])],
    participantActorIds: [...(event.participantActorIds || event.actorIds || [])],
    recurrence: event.recurrence
        ? {
            frequency: event.recurrence.frequency,
            interval: Number(event.recurrence.interval) || 1,
            untilDate: event.recurrence.untilDate,
        }
        : undefined,
});


type TimelineEntry = {
    calendarEventId?: string;
    date?: string;
    calendarEventEndTimeOfDay?: CalendarTimeOfDay;
    skit?: Skit;
}

// The subset of GameConfiguration that is portable: it is what gets exported as JSON from the GameManagementPanel
// and is the same content pushed to/pulled from storage so new games (and other owner-hosted chats) stay in sync.
// Global starting values come from Stat defaults/rules, never from a save's current values.
export type PortableGameConfiguration = {
    versionId?: string;
    artStyle?: string;
    universalSchedule?: ActorSchedule;
    title: string;
    titleImageUrl: string;
    titleImagePrompt: string;
    backgroundImageUrl: string;
    backgroundImagePrompt: string;
    creatorNotes: string;
    versionNotes: string;
    startingDate: string;
    actorStats: Stat[];
    locationStats: Stat[];
    itemStats: Stat[];
    globalStats: Stat[];
    functions: GameFunction[];
    statUpdateRules: StatUpdateRule[];
    actors: Actor[];
    locations: Location[];
    items: Item[];
    maps: GameMap[];
    lorebook: Lore[];
    calendarEvents: CalendarEvent[];
    uiSettings: UiSettings;
    castActorIds: string[];
    slideshowLocationIds: string[];
    dateMode: DateMode;
    timeMode: TimeMode;
    useEvents: boolean;
    controls: Control[];
};

// Shared by the GameManagementPanel's JSON export/preview and Stage's storage sync so both always agree on shape.
export const buildPortableGameConfiguration = (input: PortableGameConfiguration): PortableGameConfiguration => ({
    versionId: input.versionId,
    artStyle: input.artStyle,
    universalSchedule: cloneActorSchedule(input.universalSchedule),
    title: input.title,
    titleImageUrl: input.titleImageUrl,
    titleImagePrompt: input.titleImagePrompt,
    backgroundImageUrl: input.backgroundImageUrl,
    backgroundImagePrompt: input.backgroundImagePrompt,
    creatorNotes: input.creatorNotes,
    versionNotes: input.versionNotes,
    startingDate: input.startingDate,
    actorStats: (input.actorStats || []).map(cloneStat),
    locationStats: (input.locationStats || []).map(cloneStat),
    itemStats: (input.itemStats || []).map(cloneStat),
    globalStats: (input.globalStats || []).map(cloneStat),
    functions: (input.functions || []).map(cloneGameFunction),
    statUpdateRules: cloneStatUpdateRules(input.statUpdateRules),
    actors: (input.actors || []).map(actor => cloneActor(actor)),
    locations: (input.locations || []).map(location => cloneLocation(location)),
    items: (input.items || []).map(item => cloneItem(item)),
    maps: (input.maps || []).map(cloneMap),
    lorebook: (input.lorebook || []).map(cloneLore),
    calendarEvents: (input.calendarEvents || []).map(cloneCalendarEvent),
    uiSettings: cloneUiSettings(input.uiSettings || DEFAULT_UI_SETTINGS),
    castActorIds: [...(input.castActorIds || [])],
    slideshowLocationIds: [...(input.slideshowLocationIds || [])],
    dateMode: input.dateMode === 'turnBased' ? 'turnBased' : 'calendar',
    timeMode: input.timeMode === 'phase' ? 'phase' : 'timeOfDay',
    useEvents: input.useEvents !== false,
    controls: (input.controls || []).map((control) => new Control(control)),
});

const cloneConfiguration = (configuration: GameConfiguration): GameConfiguration => {
    const copy: GameConfiguration = JSON.parse(JSON.stringify(configuration));
    return { ...copy, ...buildPortableGameConfiguration(copy), globalStatValues: {}, artStyle: copy.artStyle,
        universalSchedule: cloneActorSchedule(copy.universalSchedule) };
};

const getStorageError = (response: { error?: string; errors?: unknown[]; status?: number }): string | undefined => {
    if (!response) return 'Storage returned no response.';
    if (response.error) return response.error;
    if (response.errors?.length) return JSON.stringify(response.errors);
    if (response.status !== undefined && response.status >= 400) return `Storage request failed (${response.status}).`;
    return undefined;
};

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    readonly SAVE_SLOT_COUNT = 10;
    readonly INITIAL_ACTORS = 5;

    saveData: ChatStateType;
    primaryUser: User;
    primaryCharacter: Character;
    // Monotonically incremented whenever a key is added to generationPromises, and never reset.
    // Lets observers (e.g. LoadingScreen) reliably detect that loading activity occurred even if
    // the interval polling generationPromises' keys never catches it while a key is present (e.g.
    // when the activity starts and finishes entirely within a single microtask flush).
    generationPromiseStartCount: number = 0;
    generationPromises: {[key: string]: Promise<any|void>} = new Proxy({}, {
        set: (target: {[key: string]: Promise<any|void>}, prop: string, value: Promise<any|void>) => {
            target[prop] = value;
            this.generationPromiseStartCount++;
            return true;
        },
    });
    anticipatedLoadingPromiseCount: number = 4;
    isOwner: boolean = false;
    // False when this chat had no prior chat state, so there are no unpublished creator changes to protect.
    private hadChatState: boolean = false;
    private statContextSave?: SaveType;
    private cloneUpdateInProgress = false;

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        // Registered before any save/config normalization so sourced option stats can see their optionList.
        setOptionListSourceResolver((statId) => {
            const save = this.statContextSave || this.saveData?.saves?.[this.saveData.lastSaveSlot];
            const configuration = save?.configuration || this.saveData?.configuration;
            const globalStat = configuration?.globalStats?.find((candidate) => candidate.id === statId);
            if (!globalStat) {
                const stat = [...(configuration?.actorStats || []), ...(configuration?.locationStats || []), ...(configuration?.itemStats || [])]
                    .find((candidate) => candidate.id === statId);
                return stat ? { stat } : undefined;
            }
            return { stat: globalStat, value: save?.globalStatValues?.[statId],
                resolveValue: (value, type) => this.resolveValue(value, type, save) };
        });
        const {
            characters,
            users,
            config,
            messageState,
            environment,
            initState,
            chatState
        } = data;
        
        this.primaryUser = Object.values(users)[0];
        this.primaryCharacter = Object.values(characters)[0];

        // config may be a JSON representation of a configuration; if so, we can use it to populate the default configuration for new games.
        const loadedConfiguration = config && config.json ? JSON.parse(config.json) : {};
        const defaultConfiguration = {...this.createDefaultNewGameConfiguration(), ...loadedConfiguration};


        // Populate default saves with SAVE_SLOT_COUNT undefines:
        this.hadChatState = chatState != null;
        this.saveData = chatState != null
            ? chatState
            : {
                saves: Array(this.SAVE_SLOT_COUNT).fill(undefined),
                configuration: defaultConfiguration,
                lastSaveSlot: 0,
            };
        
        
        this.ensureChatState();

    }

    private createDefaultNewGameConfiguration(): GameConfiguration {
        return {
            actors: [],
            locations: [],
            items: [],
            maps: [],
            universalSchedule: {},
            lorebook: [],
            calendarEvents: [],
            actorStats: [],
            locationStats: [],
            itemStats: [],
            globalStats: [],
            functions: [],
            globalStatValues: {},
            statUpdateRules: [],
            controls: [],
            uiSettings: cloneUiSettings(DEFAULT_UI_SETTINGS),
            title: 'Agenda VN',
            titleImageUrl: '',
            titleImagePrompt: 'Generate a title image for a visual novel game called "Agenda VN".',
            backgroundImageUrl: '',
            backgroundImagePrompt: 'Generate a background image for the menu and calendar screens of a visual novel game called "Agenda VN".',
            startingDate: new Date().toISOString().slice(0, 10),
            artStyle: 'Anime-inspired concept art with thick brush strokes and vibrant colors, emphasizing expression and dynamic composition.',
            creatorNotes: '',
            versionNotes: '',
            castActorIds: [],
            slideshowLocationIds: [],
            dateMode: 'calendar',
            timeMode: 'timeOfDay',
            useEvents: true,
        };
    }

    private ensureChatState() {
        if (!this.saveData.saves) {
            this.saveData.saves = Array(this.SAVE_SLOT_COUNT).fill(undefined);
        }

        if (typeof this.saveData.lastSaveSlot !== 'number' || Number.isNaN(this.saveData.lastSaveSlot)) {
            this.saveData.lastSaveSlot = 0;
        }

        const defaultConfiguration = this.createDefaultNewGameConfiguration();
        const activeSave = this.saveData.saves[this.saveData.lastSaveSlot];

        this.saveData.saves.forEach((save) => {
            if (save) {
                save.maps = (save.maps || []).map(map => map instanceof GameMap ? map : cloneMap(map));
            }
        });

        if (!this.saveData.configuration) {
            this.saveData.configuration = {
                ...defaultConfiguration,
                actors: [],
                locations: [],
                items: [],
                maps: (activeSave?.maps || []).map(cloneMap),
                universalSchedule: cloneActorSchedule(activeSave?.universalSchedule),
                lorebook: (activeSave?.lorebook || []).map(cloneLore),
                calendarEvents: [],
                actorStats: [],
                locationStats: [],
                itemStats: [],
                globalStats: [],
                globalStatValues: {},
                statUpdateRules: [],
                controls: [],
                uiSettings: cloneUiSettings(activeSave?.uiSettings || {}),
            };
        }

        // Backfill any missing fields and coerce array items into proper class instances in place, rather than
        // replacing the whole configuration (and its arrays) with new clones on every call. getConfiguration()
        // callers rely on the returned references being stable so in-place edits actually stick.
        this.normalizeConfiguration(this.saveData.configuration, defaultConfiguration);
        this.saveData.saves.forEach(save => {
            if (save) {
                save.configuration ??= {
                    ...cloneConfiguration(this.saveData.configuration),
                    universalSchedule: cloneActorSchedule(save.universalSchedule),
                };
                this.normalizeConfiguration(save.configuration, defaultConfiguration);
            }
        });
        const configuration = activeSave?.configuration || this.saveData.configuration;
        setActiveTimeMode(configuration.timeMode);
        this.syncUniversalSchedule();
    }

    private normalizeConfiguration(configuration: GameConfiguration, defaultConfiguration: GameConfiguration) {
        configuration.actors = (configuration.actors || defaultConfiguration.actors).map(actor => actor instanceof Actor ? actor : cloneActor(actor));
        configuration.locations = (configuration.locations || defaultConfiguration.locations).map(location => location instanceof Location ? location : cloneLocation(location));
        configuration.items = (configuration.items || defaultConfiguration.items).map(item => item instanceof Item ? item : cloneItem(item));
        configuration.maps = (configuration.maps || defaultConfiguration.maps).map(map => map instanceof GameMap ? map : cloneMap(map));
        configuration.universalSchedule = configuration.universalSchedule || defaultConfiguration.universalSchedule;
        configuration.lorebook = configuration.lorebook || defaultConfiguration.lorebook;
        configuration.calendarEvents = configuration.calendarEvents || defaultConfiguration.calendarEvents;
        configuration.actorStats = configuration.actorStats || defaultConfiguration.actorStats;
        configuration.locationStats = configuration.locationStats || defaultConfiguration.locationStats;
        configuration.itemStats = configuration.itemStats || defaultConfiguration.itemStats;
        configuration.globalStats = configuration.globalStats || defaultConfiguration.globalStats;
        configuration.functions = configuration.functions || defaultConfiguration.functions;
        // Discard legacy tester overrides without touching the save's own stat values.
        configuration.globalStatValues = {};
        configuration.statUpdateRules = configuration.statUpdateRules || defaultConfiguration.statUpdateRules;
        configuration.controls = (configuration.controls || defaultConfiguration.controls).map((control) => control instanceof Control ? control : cloneControl(control));
        configuration.uiSettings = configuration.uiSettings || defaultConfiguration.uiSettings;
        configuration.startingDate = configuration.startingDate || defaultConfiguration.startingDate;
        configuration.title = configuration.title || defaultConfiguration.title;
        configuration.titleImageUrl = configuration.titleImageUrl || defaultConfiguration.titleImageUrl;
        configuration.titleImagePrompt = configuration.titleImagePrompt || defaultConfiguration.titleImagePrompt;
        configuration.backgroundImageUrl = configuration.backgroundImageUrl || defaultConfiguration.backgroundImageUrl;
        configuration.backgroundImagePrompt = configuration.backgroundImagePrompt || defaultConfiguration.backgroundImagePrompt;
        configuration.artStyle = configuration.artStyle || defaultConfiguration.artStyle;
        configuration.creatorNotes = configuration.creatorNotes || defaultConfiguration.creatorNotes;
        configuration.versionNotes = configuration.versionNotes || defaultConfiguration.versionNotes;
        configuration.castActorIds = configuration.castActorIds || defaultConfiguration.castActorIds;
        configuration.slideshowLocationIds = configuration.slideshowLocationIds || defaultConfiguration.slideshowLocationIds;
        configuration.dateMode = configuration.dateMode === 'turnBased' ? 'turnBased' : 'calendar';
        configuration.timeMode = configuration.timeMode === 'phase' ? 'phase' : 'timeOfDay';
        configuration.useEvents = configuration.useEvents !== false;
    }

    // Creator rule edits are mirrored into the active snapshot, never into other save slots.
    private syncUniversalSchedule() {
        this.saveData.saves.forEach((save) => {
            if (save) {
                const configuration = save.configuration || this.saveData.configuration;
                save.universalSchedule = cloneActorSchedule(configuration.universalSchedule);
            }
        });
    }

    // Creator tools use the draft; explicit save contexts always use that playthrough's snapshot.
    getConfiguration(save?: SaveType): GameConfiguration {
        this.ensureChatState();
        const selectedSave = save || this.saveData.saves[this.saveData.lastSaveSlot];
        return ((save || !this.isOwner) && selectedSave?.configuration) || this.saveData.configuration;
    }

    getPublishedConfiguration(): GameConfiguration {
        this.ensureChatState();
        return this.saveData.configuration;
    }

    // Builds a ScheduleContext from a save, adding the stat definitions needed to resolve schedule entries
    // that point at a location-type ActorStat rather than a fixed location id.
    getScheduleContext(save: SaveType): ScheduleContext {
        const configuration = this.getConfiguration(save);
        return { ...save, globalStats: configuration.globalStats, actorStats: configuration.actorStats, locationStats: configuration.locationStats, itemStats: configuration.itemStats,
            resolveValue: (value, type) => this.resolveValue(value, type, save) };
    }

    resolveValue(value: unknown, type: StatType, save: SaveType = this.getSave(), stack: string[] = []): StatValue {
        const namedSource = (name: string, kind: 'function' | 'stat', expectedType: StatType, args?: unknown[]): StatValue => {
            const normalizedName = name.trim().toLowerCase();
            const configuration = this.getConfiguration(save);
            const matches = kind === 'function'
                ? configuration.functions.filter(fn => fn.name.trim().toLowerCase() === normalizedName)
                : configuration.globalStats.filter(stat => stat.name.trim().toLowerCase() === normalizedName);
            if (matches.length !== 1) {
                throw new Error(`${matches.length ? 'Ambiguous' : 'Unknown'} ${kind} name: ${name}`);
            }
            const reference = kind === 'function'
                ? functionReference(matches[0].id, positionalFunctionArguments(matches[0] as GameFunction, args))
                : `globalStat:${matches[0].id}`;
            return this.resolveValue(reference, expectedType, save, stack);
        };
        if (isGlobalStatReference(value)) {
            const id = globalStatReferenceId(value);
            const configuration = this.getConfiguration(save);
            const stat = configuration.globalStats.find(candidate => candidate.id === id);
            if (!stat) {
                throw new Error(`Unknown global stat reference: ${id}`);
            }
            if (stat.type !== type && !(type === 'contentList' && isReferenceStatType(stat.type))) {
                throw new Error(`Global stat "${stat.name}" has type ${stat.type}, not ${type}.`);
            }
            if (stack.includes(value) || stack.length >= MAX_FUNCTION_INVOCATION_DEPTH) {
                throw new Error(`Maximum value reference depth exceeded or cyclic global stat reference: ${stat.name}`);
            }
            return this.readStatValue(save.globalStatValues?.[id], stat, save, [...stack, value]);
        }
        if (isFunctionReference(value)) {
            const id = functionReferenceId(value);
            const fn = this.getConfiguration(save).functions.find(candidate => candidate.id === id);
            if (!fn) {
                throw new Error(`Unknown function reference: ${id}`);
            }
            if (fn.returnType !== type && !(type === 'contentList' && isReferenceStatType(fn.returnType as StatType))) {
                throw new Error(`Function "${fn.name}" returns ${fn.returnType || 'void'}, not ${type}.`);
            }
            const errors: string[] = [];
            const result = this.runGameFunction(save, fn, stack.length, message => errors.push(message), { readOnly: true, stack }, functionReferenceArguments(value));
            if (errors.length) {
                throw new Error(errors.join('\n'));
            }
            validateFunctionResult(result, fn.returnType);
            return result as StatValue;
        }
        if (typeof value === 'string' && type === 'number' && value.trim()) {
            return evaluateValueExpression(value, {
                call: (name, args) => Number(namedSource(name, 'function', 'number', args)),
                get: name => Number(namedSource(name, 'stat', 'number')),
            });
        }
        if (typeof value === 'string' && type === 'text') {
            const call = parseFunctionCallText(value);
            if (call) return namedSource(call.name, 'function', 'text', call.args);
            return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) => {
                if (['user', 'char'].includes(name.trim().toLowerCase())) return match;
                if (!this.getConfiguration(save).functions.some(fn => fn.name.trim().toLowerCase() === name.trim().toLowerCase())) return match;
                return String(namedSource(name, 'function', 'text'));
            });
        }
        const elementType = listElementType(type);
        if ((elementType || type === 'contentList') && Array.isArray(value)) {
            return value.flatMap(entry => {
                if (!isValueReference(entry)) {
                    return typeof entry === 'string' ? [entry] : [];
                }
                const configuration = this.getConfiguration(save);
                const sourceType = isGlobalStatReference(entry)
                    ? configuration.globalStats.find(candidate => candidate.id === globalStatReferenceId(entry))?.type
                    : configuration.functions.find(candidate => candidate.id === functionReferenceId(entry))?.returnType;
                // Mixed lists accept entries referencing any content kind, scalar or list; single-kind lists
                // only accept their own list type or their scalar element type.
                const entryType = type === 'contentList'
                    ? (sourceType && isReferenceStatType(sourceType as StatType) ? sourceType as StatType : type)
                    : sourceType === type ? type : elementType!;
                const resolved = this.resolveValue(entry, entryType, save, stack);
                return Array.isArray(resolved) ? resolved : [String(resolved)];
            });
        }
        return value as StatValue;
    }

    readStatValue(value: unknown, stat: Stat, save: SaveType = this.getSave(), stack: string[] = []): StatValue {
        return this.withStatContext(save, () =>
            resolveStatValue(value, stat, { resolveValue: (source, type) => this.resolveValue(source, type, save, stack) }));
    }

    private withStatContext<T>(save: SaveType, action: () => T): T {
        const previousSave = this.statContextSave;
        this.statContextSave = save;
        try {
            return action();
        } finally {
            this.statContextSave = previousSave;
        }
    }

    // Actor-card rules bind "Variable" actor targets to the actor whose card is displayed.
    getVisibleControls(placement: ControlPlacement, actor?: Actor): Control[] {
        const context = {
            ...this.getScheduleContext(this.getSave()),
            ...(placement === 'actorCard' || placement === 'outcome' ? { currentActor: actor } : {}),
        };
        return (this.getConfiguration(this.getSave()).controls || [])
            .filter((control) => control.placement === placement && isControlAvailable(control, context))
            .sort(compareControlPriority);
    }

    runControlActions(control: Control): Skit | null {
        return this.runButtonActions(control.actions || []);
    }

    // Resolve the first skit only after every stat/function action has finished.
    runButtonActions(actions: StatUpdateAction[]): Skit | null {
        const save = this.getSave();
        const skit = this.applyActions(save, actions);
        this.saveGame();
        return skit;
    }

    private applyActions(save: SaveType, actions: StatUpdateAction[]): Skit | null {
        const context = this.getScheduleContext(save);
        for (const action of actions) {
            if (action.kind !== 'skit') {
                this.applyStatUpdateAction(save, action, context);
            }
        }
        const skitAction = actions.find((action): action is StartSkitAction => action.kind === 'skit');
        const skit = skitAction ? this.createStatUpdateSkit(save, skitAction) : null;
        if (skit) {
            save.timeline.push({ date: save.currentDate || this.getStartingDate(save), skit });
        }
        return skit;
    }

    // Directly sets a global stat's value (used by 'statEditor' controls) and saves.
    setGlobalStatValue(statId: string, value: StatValue) {
        const stat = (this.getConfiguration(this.getSave()).globalStats || []).find((candidate) => candidate.id === statId);
        if (!stat) {
            return;
        }
        const save = this.getSave();
        save.globalStatValues = save.globalStatValues || {};
        save.globalStatValues[stat.id] = this.readStatValue(value, stat, save);
        this.saveGame();
    }

    updateConfiguration(updates: Partial<GameConfiguration>, usePublished: boolean = false) {
        this.ensureChatState();
        const currentSave = this.saveData.saves[this.saveData.lastSaveSlot];
        const current = (!usePublished && !this.isOwner && currentSave?.configuration) || this.saveData.configuration;
        const next = {
            ...current,
            ...updates,
            globalStatValues: {},
            actors: (updates.actors ?? current.actors).map(actor => actor instanceof Actor ? actor : cloneActor(actor)),
            locations: (updates.locations ?? current.locations).map(location => location instanceof Location ? location : cloneLocation(location)),
            items: (updates.items ?? current.items).map(item => item instanceof Item ? item : cloneItem(item)),
            maps: (updates.maps ?? current.maps).map(map => map instanceof GameMap ? map : cloneMap(map)),
        };

        if (!usePublished && !this.isOwner && currentSave) {
            currentSave.configuration = next;
        } else {
            this.saveData.configuration = next;
        }
        const affectedSave = usePublished && !this.isOwner ? undefined : currentSave;
        if (updates.globalStats) {
            const configuration = next;
            configuration.globalStats.forEach((stat) => {
                const previousStat = current.globalStats?.find((candidate) => candidate.id === stat.id);
                const values = affectedSave?.globalStatValues;
                if (values && values[stat.id] !== undefined) {
                    values[stat.id] = includeNewOptionListOptions(values[stat.id], previousStat, stat)!;
                }
            });
        }
        if (this.isOwner && affectedSave) {
            const snapshot = affectedSave.configuration!;
            // Content still requires its own Apply action; all other draft edits are live in this slot.
            affectedSave.configuration = {
                ...cloneConfiguration(next),
                actors: snapshot.actors,
                locations: snapshot.locations,
                items: snapshot.items,
                maps: snapshot.maps,
                lorebook: snapshot.lorebook,
                calendarEvents: snapshot.calendarEvents,
                versionId: snapshot.versionId,
            };
            if (updates.uiSettings) affectedSave.uiSettings = cloneUiSettings(next.uiSettings);
        }
        if (affectedSave) {
            this.syncGlobalStats(affectedSave);
            this.syncActorStats(affectedSave);
            this.syncLocationStats(affectedSave);
            this.syncItemStats(affectedSave);
        }
        setActiveTimeMode(this.getConfiguration(affectedSave).timeMode);
        this.syncUniversalSchedule();
    }

    // Copies an actor/location/map/lore entry from the canon configuration into the current save,
    // replacing an existing entry or adding it when the current save does not contain it yet.
    applyConfigurationActorToSave(actorId: string): boolean {
        const configuredActor = (this.getConfiguration().actors || []).find(actor => actor.id === actorId);
        const save = this.getSave();
        if (!configuredActor) {
            return false;
        }
        save.actors[actorId] = cloneActor(configuredActor, true);
        this.syncActorStats(save);
        this.saveGame();
        return true;
    }

    applyConfigurationLocationToSave(locationId: string): boolean {
        const configuredLocation = (this.getConfiguration().locations || []).find(location => location.id === locationId);
        const save = this.getSave();
        if (!configuredLocation) {
            return false;
        }
        save.atlas[locationId] = cloneLocation(configuredLocation, true);
        this.syncLocationStats(save);
        this.saveGame();
        return true;
    }

    applyConfigurationItemToSave(itemId: string): boolean {
        const configuredItem = (this.getConfiguration().items || []).find(item => item.id === itemId);
        const save = this.getSave();
        const index = (save.inventory || []).findIndex(item => item.id === itemId);
        if (!configuredItem) {
            return false;
        }
        if (index === -1) {
            save.inventory = [...(save.inventory || []), cloneItem(configuredItem, true)];
        } else {
            save.inventory[index] = cloneItem(configuredItem, true);
        }
        this.syncItemStats(save);
        this.saveGame();
        return true;
    }

    applyConfigurationMapToSave(mapId: string): boolean {
        const configuredMap = (this.getConfiguration().maps || []).find(map => map.id === mapId);
        const save = this.getSave();
        const index = (save.maps || []).findIndex(map => map.id === mapId);
        if (!configuredMap) {
            return false;
        }
        if (index === -1) {
            save.maps = [...(save.maps || []), cloneMap(configuredMap)];
        } else {
            save.maps[index] = cloneMap(configuredMap);
        }
        this.saveGame();
        return true;
    }

    applyConfigurationLoreToSave(loreId: string): boolean {
        const configuredLore = (this.getConfiguration().lorebook || []).find(entry => entry.id === loreId);
        const save = this.getSave();
        const index = (save.lorebook || []).findIndex(entry => entry.id === loreId);
        if (!configuredLore) {
            return false;
        }
        if (index === -1) {
            save.lorebook = [...(save.lorebook || []), cloneLore(configuredLore)];
        } else {
            const lorebook = save.lorebook || [];
            lorebook[index] = cloneLore(configuredLore);
            save.lorebook = lorebook;
        }
        this.saveGame();
        return true;
    }

    applyConfigurationCalendarEventToSave(eventId: string): boolean {
        const configuredEvent = this.getManagedCalendarEvents(true).find(event => event.id === eventId);
        if (!configuredEvent) {
            return false;
        }
        this.upsertCalendarEventSeries(configuredEvent, false);
        return true;
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

        // Test whether userId has storage access to update this bot.
        try {
            const response = await this.storage.set('dummy', {data: "dummy data"}).forCharacterSensitive(this.primaryCharacter.anonymizedId);
            console.log(response);
            const storageError = getStorageError(response);
            if (storageError) {
                console.log(`Failed sensitive storage access for ${this.primaryCharacter.anonymizedId}: ${storageError}`);
                await this.readStageConfiguration();
            } else {
                console.log(`Successfully accessed sensitive storage for ${this.primaryCharacter.anonymizedId}`);
                // Creators load configuration from chat state; only a brand-new chat is seeded from the published configuration.
                if (!this.hadChatState) {
                    await this.readStageConfiguration();
                }
                this.isOwner = true;
            }
        } catch (error) {
            console.log(`Error accessing sensitive storage for ${this.primaryCharacter.anonymizedId}: ${error}`);
        }

        return {
            success: true,
            error: null,
            initState: null,
            chatState: this.saveData,
        };
    }

    // Unused functions required by the interface.
    async setState(state: MessageStateType): Promise<void> {}
    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {return {}}
    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {return {}}

    pushMessage(message: string) {
        this.messenger.impersonate({
            speaker_id: this.primaryCharacter.anonymizedId,
            is_main: false,
            parent_id: null,
            message: message
        });
    }

    generateFreshSave(
        playerData: {name: string, personality: string, themeColor?: string, themeFontFamily?: string, birthDate?: string},
        selectedGlobalStatValues: {[key: string]: StatValue} = {},
    ): SaveType {
        const configuration = this.getPublishedConfiguration();
        const startingDate = configuration.startingDate || new Date().toISOString().slice(0, 10);

        const actors: {[key: string]: Actor} = {
                [this.primaryUser.anonymizedId]: {
                    id: this.primaryUser.anonymizedId,
                    loreId: '',
                    active: true,
                    name: playerData.name,
                    displayName: playerData.name,
                    role: 'You',
                    birthDate: playerData.birthDate ?? '',
                    summary: '',
                    sourcePath: '',
                    description: '',
                    background: '',
                    profile: playerData.personality,
                    category: '',
                    outfits: [],
                    outfitId: '',
                    statMap: {},
                    statInitialMap: {},
                    schedule: {},
                    themeColor: playerData.themeColor || DEFAULT_PLAYER_THEME_COLOR,
                    themeFontFamily: playerData.themeFontFamily || '',
                    voiceId: '',
                    voiceModulation: DEFAULT_VOICE_MODULATION,
                },
            };

        (configuration.actors || [])
            .filter(actor => actor?.active !== false)
            .forEach((configuredActor) => {
                const seededActor = cloneActor(configuredActor, true);
                if (seededActor.id !== this.primaryUser.anonymizedId) {
                    actors[seededActor.id] = seededActor;
                }
            });

        const atlas: {[key: string]: Location} = createDefaultAtlas();
        (configuration.locations || [])
            .filter(location => location?.active !== false)
            .forEach((configuredLocation) => {
                const seededLocation = cloneLocation(configuredLocation, true);
                atlas[seededLocation.id] = seededLocation;
            });

        const inventory: Item[] = (configuration.items || [])
            .filter(item => item?.active !== false)
            .map(configuredItem => cloneItem(configuredItem, true));

        const draftSaveContext = {
            configuration: cloneConfiguration(configuration),
            playerId: this.primaryUser.anonymizedId,
            actors,
            atlas,
            maps: (configuration.maps || []).filter(map => map.active !== false).map(cloneMap),
            universalSchedule: cloneActorSchedule(configuration.universalSchedule),
            inventory,
            timeline: [],
            timestamp: Date.now(),
            currentDate: startingDate,
            currentTimeOfDay: 'morning',
            globalStatValues: {},
        } as SaveType;

        const seededEvents = (configuration.calendarEvents || []).flatMap(event =>
            this.expandRecurringEvent(this.normalizeCalendarEventForSave(cloneCalendarEvent(event), draftSaveContext)),
        );

        const globalStatValues = this.withStatContext(draftSaveContext, () =>
            buildInitialGlobalStatValues(configuration.globalStats || [], selectedGlobalStatValues,
                this.getScheduleContext(draftSaveContext), draftSaveContext.globalStatValues));

        this.syncActorStats(draftSaveContext);
        this.syncLocationStats(draftSaveContext);
        this.syncItemStats(draftSaveContext);

        return {configuration: draftSaveContext.configuration,
            playerId: this.primaryUser.anonymizedId,
            actors,
            atlas,
            maps: (configuration.maps || []).filter(map => map.active !== false).map(cloneMap),
            universalSchedule: cloneActorSchedule(configuration.universalSchedule),
            inventory: inventory.map(item => cloneItem(item, true)),
            timeline: [],
            timestamp: Date.now(),
            currentDate: startingDate,
            currentTimeOfDay: 'morning',
            upcomingEvents: seededEvents,
            lorebook: (configuration.lorebook || []).map(cloneLore),
            globalStatValues,
            uiSettings: cloneUiSettings(configuration.uiSettings || DEFAULT_UI_SETTINGS),
        };
    }

    async startNewGame(playerData: {name: string, data: Partial<SaveType>, personality: string, themeColor?: string, themeFontFamily?: string, birthDate?: string}): Promise<void> {
        // Insert a dummy promise into generationPromises to ensure the loading screen shows until we manually clear it after the initial actors are loaded.
        this.generationPromises['newGame'] = new Promise(() => {});

        // Get empty save slot or replace the oldest save if all slots are full
        const emptySlotIndex = this.saveData.saves.findIndex(save => !save);
        const saveSlotIndex = emptySlotIndex !== -1 ? emptySlotIndex : (this.saveData.lastSaveSlot + 1) % this.SAVE_SLOT_COUNT;
        console.log(`Using slot ${saveSlotIndex}`);

        // Create new save data structure
        const { globalStatValues: selectedGlobalStatValues, ...saveSettings } = playerData.data;
        const newSave: SaveType = this.generateFreshSave(playerData, selectedGlobalStatValues);
        Object.assign(newSave, saveSettings);

        const persistedConfiguration = this.getPublishedConfiguration();

        if (!newSave.lorebook || newSave.lorebook.length === 0) {
            console.log('Initializing lorebook for new save');
            newSave.lorebook = persistedConfiguration.lorebook.map(cloneLore);
            console.log(newSave.lorebook);
        }

        if (!newSave.maps || newSave.maps.length === 0) {
            newSave.maps = persistedConfiguration.maps.map(cloneMap);
        }

        if (!newSave.upcomingEvents || newSave.upcomingEvents.length === 0) {
            const seededEvents = persistedConfiguration.calendarEvents.flatMap(event =>
                this.expandRecurringEvent(this.normalizeCalendarEventForSave(cloneCalendarEvent(event), newSave)),
            );
            newSave.upcomingEvents = seededEvents;
        }

        if (!newSave.uiSettings) {
            newSave.uiSettings = cloneUiSettings(persistedConfiguration.uiSettings || DEFAULT_UI_SETTINGS);
        }

        this.syncGlobalStats(newSave);
        this.syncActorStats(newSave);
        this.syncLocationStats(newSave);
        this.syncItemStats(newSave);

        if (!newSave.currentDate && persistedConfiguration.startingDate) {
            newSave.currentDate = persistedConfiguration.startingDate;
        }

        this.anticipatedLoadingPromiseCount = 200; // Set to a large number at first.

        // Save the new game
        this.saveData.saves[saveSlotIndex] = newSave;
        this.saveData.lastSaveSlot = saveSlotIndex;

        // Generate all characters
        this.loadActors()
        
        console.log('Finished loading initial actors for new game');

        // Ask the LLM to indicate whether any existing character profile (internally, lore) needs to be updated based upon user's identity/role/choices.
        const actorsNeedingLoreUpdate = await this.identifyActorsNeedingLoreUpdate(newSave).catch(error => {
            console.error('Failed to identify actors needing lore updates for new game', error);
            return [] as LoreUpdateCandidate[];
        });

        // Once the number is known, we can adjust the anticipated loading promise count accordingly.
        this.anticipatedLoadingPromiseCount = Math.max(actorsNeedingLoreUpdate.length + 4, 4);

        // Kick off lore updates in batches of three at a time. These each add a promise to the promises array (within updateLoreEntry) to help track the overall progress of the loading process.
        this.runLoreUpdatesWithConcurrency(actorsNeedingLoreUpdate).catch(error => {
            console.error('Error running lore updates for new game', error);
        });

        const startupContext = this.getScheduleContext(newSave);
        const startupActions = (persistedConfiguration.statUpdateRules || [])
            .filter(rule => rule.trigger === 'startup' && evaluateConditionCollections(rule.conditions, startupContext))
            .flatMap(rule => rule.updates || []);
        this.applyActions(newSave, startupActions);

        delete this.generationPromises['newGame']; // Clear the dummy promise to allow the loading screen to finish.

        console.log('Rebuilding upcoming events for new game');
        this.rebuildUpcomingEvents(newSave);

        console.log('Saving new game');
        this.saveGame();
        console.log('Done setting up new game: ');
        console.log(this.generationPromises);
    }

    // Called when the calendar screen displays.
    loadCalendarScreen() {
        const save = this.getSave();
        this.ensureCalendarState(save);

        if (this.getUpcomingEvents().length === 0) {
            this.rebuildUpcomingEvents(save)
        }
    }
    
    loadSave(slotIndex: number) {
        if (this.saveData.saves[slotIndex]) {
            this.saveData.lastSaveSlot = slotIndex;
            setActiveTimeMode(this.getConfiguration(this.saveData.saves[slotIndex]).timeMode);
        }
    }

    canUpdateSave(slotIndex: number): boolean {
        const save = this.saveData.saves[slotIndex];
        if (!save) return false;
        const published = this.getPublishedConfiguration();
        if (this.isOwner) {
            return JSON.stringify(buildPortableGameConfiguration(published))
                !== JSON.stringify(buildPortableGameConfiguration(save.configuration!));
        }
        return !!published.versionId
            && save.configuration?.versionId !== published.versionId;
    }

    async cloneAndUpdateSave(slotIndex: number): Promise<number> {
        return this.updateSaveFromConfiguration(slotIndex, true);
    }

    // Applies the entire creator draft to the current slot without publishing or requiring a free slot.
    async applyConfigurationToSave(): Promise<void> {
        if (!this.isOwner) throw new Error('Only creators can apply the draft configuration.');
        await this.updateSaveFromConfiguration(this.saveData.lastSaveSlot, false);
    }

    private async updateSaveFromConfiguration(slotIndex: number, clone: boolean): Promise<number> {
        if (this.cloneUpdateInProgress) {
            throw new Error('A save update is already in progress.');
        }
        this.cloneUpdateInProgress = true;
        try {
            return await this.createUpdatedSave(slotIndex, clone);
        } finally {
            this.cloneUpdateInProgress = false;
        }
    }

    private async createUpdatedSave(slotIndex: number, clone: boolean): Promise<number> {
        if (!this.saveData.saves[slotIndex]) {
            throw new Error('An existing save is required to apply configuration.');
        }
        if (clone && !this.canUpdateSave(slotIndex)) {
            throw new Error(this.isOwner
                ? 'This save already matches the creator draft.'
                : 'This save has no published update available.');
        }
        const targetSlot = clone
            ? Array.from({ length: this.SAVE_SLOT_COUNT }, (_, index) => index)
                .find(index => !this.saveData.saves[index])
            : slotIndex;
        if (targetSlot === undefined) {
            throw new Error('An empty save slot is required to clone and update.');
        }
        const source = this.saveData.saves[slotIndex]!;
        const copy: SaveType = JSON.parse(JSON.stringify(source));
        const configuration = cloneConfiguration(this.getPublishedConfiguration());
        copy.configuration = configuration;
        configuration.actors.forEach(actor => {
            if (actor.id !== copy.playerId) copy.actors[actor.id] = cloneActor(actor, true);
        });
        configuration.locations.forEach(location => { copy.atlas[location.id] = cloneLocation(location, true); });
        configuration.items.forEach(item => {
            const index = copy.inventory.findIndex(candidate => candidate.id === item.id);
            if (index < 0) copy.inventory.push(cloneItem(item, true));
            else copy.inventory[index] = cloneItem(item, true);
        });
        configuration.maps.forEach(map => {
            const index = copy.maps.findIndex(candidate => candidate.id === map.id);
            if (index < 0) copy.maps.push(cloneMap(map));
            else copy.maps[index] = cloneMap(map);
        });
        const lorebook = copy.lorebook ??= [];
        configuration.lorebook.forEach(entry => {
            const index = lorebook.findIndex(candidate => candidate.id === entry.id);
            if (index < 0) lorebook.push(cloneLore(entry));
            else lorebook[index] = cloneLore(entry);
        });
        const seriesIds = new Set(configuration.calendarEvents.map(event => event.recurrenceParentId || event.id));
        copy.upcomingEvents = (copy.upcomingEvents || [])
            .filter(event => !seriesIds.has(event.recurrenceParentId || event.id));
        const completedEvents = new Set(copy.timeline.map(entry => entry.calendarEventId).filter(Boolean));
        const series = new Map<string, CalendarEvent>();
        [...configuration.calendarEvents].sort((a, b) => this.compareCalendarEvents(a, b)).forEach(event => {
            const seriesId = event.recurrenceParentId || event.id;
            if (!series.has(seriesId)) series.set(seriesId, { ...event, id: seriesId });
        });
        copy.upcomingEvents.push(...[...series.values()].flatMap(event =>
            this.expandRecurringEvent(this.normalizeCalendarEventForSave(cloneCalendarEvent(event), copy)))
            .filter(event => !completedEvents.has(event.id)));
        copy.universalSchedule = cloneActorSchedule(configuration.universalSchedule);
        copy.uiSettings = cloneUiSettings(configuration.uiSettings);
        this.ensureCalendarState(copy);
        copy.maps = copy.maps.map(cloneMap);
        copy.timestamp = Date.now();

        // Persist an isolated candidate first: a rejected write must not consume a slot or switch games.
        const nextState = { ...this.saveData, saves: [...this.saveData.saves], lastSaveSlot: targetSlot };
        nextState.saves[targetSlot] = copy;
        const response = await this.messenger.updateChatState(nextState);
        if (!response.success) {
            throw new Error(response.error || 'Failed to persist the updated save.');
        }
        this.saveData = nextState;
        setActiveTimeMode(configuration.timeMode);
        return targetSlot;
    }

    saveToSlot(slotIndex: number) {
        this.saveData.saves[slotIndex] = JSON.parse(JSON.stringify(this.getSave()));
        this.saveData.lastSaveSlot = slotIndex;
        this.saveGame();
    }

    saveGame() {
        const currentSave = this.saveData.saves[this.saveData.lastSaveSlot];
        if (currentSave) {
            currentSave.timestamp = Date.now();
        }
        this.messenger.updateChatState(this.saveData);
    }

    isCalendarScreenLoading(): boolean {
        return Object.keys(this.generationPromises).length > 0;
    }

    getUpcomingEvents(): CalendarEvent[] {
        const save = this.getSave();
        this.ensureCalendarState(save);

        return (save.upcomingEvents || [])
            .filter(event => this.isFutureEvent(event))
            .map(event => this.resolveCalendarEvent(event, save))
            .sort((a, b) => this.compareCalendarEvents(a, b));
    }

    getManagedCalendarEvents(useConfiguration: boolean = false): CalendarEvent[] {
        const save = this.getSave();
        this.ensureCalendarState(save);
        const events = useConfiguration ? this.getConfiguration().calendarEvents || [] : save.upcomingEvents || [];

        const groupedBySeries = new Map<string, CalendarEvent[]>();
        events.forEach((event) => {
            const seriesId = event.recurrenceParentId || event.id;
            const existing = groupedBySeries.get(seriesId) || [];
            existing.push(event);
            groupedBySeries.set(seriesId, existing);
        });

        return Array.from(groupedBySeries.values())
            .map((seriesEvents) => {
                const sortedSeries = [...seriesEvents].sort((left, right) => {
                    const leftIndex = Number.isFinite(left.recurrenceInstanceIndex) ? Number(left.recurrenceInstanceIndex) : 0;
                    const rightIndex = Number.isFinite(right.recurrenceInstanceIndex) ? Number(right.recurrenceInstanceIndex) : 0;
                    if (leftIndex !== rightIndex) {
                        return leftIndex - rightIndex;
                    }
                    return this.compareCalendarEvents(left, right);
                });
                return sortedSeries[0];
            })
            .filter((event): event is CalendarEvent => Boolean(event))
            .sort((a, b) => this.compareCalendarEvents(a, b));
    }

    createCalendarEventDraft(useConfiguration: boolean = false): CalendarEvent {
        const save = this.getSave();
        this.ensureCalendarState(save);
        const configuration = this.getConfiguration();

        const locations = useConfiguration
            ? (configuration.locations || []).filter(location => location.active !== false)
            : Object.values(save.atlas || {}).filter(location => location.active !== false);
        const fallbackLocation = locations[0];
        const actors = useConfiguration ? configuration.actors || [] : Object.values(save.actors || {});
        const actorIds = actors
            .filter(actor => actor.id !== save.playerId)
            .filter(actor => actor.active !== false)
            .slice(0, 1)
            .map(actor => actor.id);
        const date = this.addDays(save.currentDate || this.getStartingDate(save), 1);

        return {
            id: this.createCalendarEventId(),
            name: 'New Event',
            date,
            duration: [...ALL_DAY_DURATION],
            locationId: fallbackLocation?.id || '',
            actorIds,
            participantActorIds: [...actorIds],
            description: '',
            guidance: '',
            mandatory: false,
        };
    }

    upsertCalendarEventSeries(event: CalendarEvent, useConfiguration: boolean = false): CalendarEvent {
        const save = this.getSave();
        this.ensureCalendarState(save);
        const configuration = this.getConfiguration();

        if (useConfiguration) {
            const normalizedBaseEvent = this.normalizeCalendarEventForSave({
                ...event,
                id: `${event.recurrenceParentId || event.id || this.createCalendarEventId()}`.trim() || this.createCalendarEventId(),
                recurrenceParentId: undefined,
                recurrenceInstanceIndex: undefined,
            }, save, true);
            const seriesId = normalizedBaseEvent.id;
            const remainingEvents = (configuration.calendarEvents || []).filter((candidate) => {
                const candidateSeriesId = candidate.recurrenceParentId || candidate.id;
                return candidateSeriesId !== seriesId;
            });
            const nextCalendarEvents = [...remainingEvents, ...this.expandRecurringEvent(normalizedBaseEvent)]
                .sort((left, right) => this.compareCalendarEvents(left, right));
            this.updateConfiguration({ calendarEvents: nextCalendarEvents });
            return normalizedBaseEvent;
        }

        const seriesId = `${event.recurrenceParentId || event.id || this.createCalendarEventId()}`.trim() || this.createCalendarEventId();
        const normalizedBaseEvent = this.normalizeCalendarEventForSave({
            ...event,
            id: seriesId,
            recurrenceParentId: undefined,
            recurrenceInstanceIndex: undefined,
        }, save);

        this.removeCalendarEventSeries(save, seriesId);
        save.upcomingEvents = [...(save.upcomingEvents || []), ...this.expandRecurringEvent(normalizedBaseEvent)]
            .sort((a, b) => this.compareCalendarEvents(a, b));
        this.saveGame();

        return normalizedBaseEvent;
    }

    deleteCalendarEventSeries(eventId: string, useConfiguration: boolean = false): boolean {
        const save = this.getSave();
        this.ensureCalendarState(save);

        if (useConfiguration) {
            const configuration = this.getConfiguration();
            const matchedEvent = (configuration.calendarEvents || []).find(event => event.id === eventId);
            if (!matchedEvent) {
                return false;
            }
            const seriesId = matchedEvent.recurrenceParentId || matchedEvent.id;
            const remainingEvents = (configuration.calendarEvents || []).filter((event) => {
                const candidateSeriesId = event.recurrenceParentId || event.id;
                return candidateSeriesId !== seriesId;
            });
            if (remainingEvents.length === configuration.calendarEvents.length) {
                return false;
            }
            this.updateConfiguration({ calendarEvents: remainingEvents });
            return true;
        }

        const matchedEvent = (save.upcomingEvents || []).find(event => event.id === eventId);
        if (!matchedEvent) {
            return false;
        }

        const seriesId = matchedEvent.recurrenceParentId || matchedEvent.id;
        const originalCount = (save.upcomingEvents || []).length;
        this.removeCalendarEventSeries(save, seriesId);

        if ((save.upcomingEvents || []).length === originalCount) {
            return false;
        }

        this.saveGame();
        return true;
    }

    skipNextEvent(): CalendarEvent | null {
        const save = this.getSave();
        this.ensureCalendarState(save);

        const nextEvent = this.getUpcomingEvents()[0];
        if (!nextEvent) {
            return null;
        }

        const nextSkit = this.advanceCalendarAfterEvent(save, nextEvent);
        save.timeline.push({
            calendarEventId: nextEvent.id,
            date: nextEvent.date,
        });
        save.upcomingEvents = (save.upcomingEvents || []).filter(event => event.id !== nextEvent.id);

        this.rebuildUpcomingEvents(save);
        if (nextSkit) {
            save.timeline.push({ date: save.currentDate, skit: nextSkit });
        }
        this.saveGame();
        return nextEvent;
    }

    startCalendarEventSkit(eventId: string): Skit | null {
        const save = this.getSave();
        this.ensureCalendarState(save);

        const storedEvent = (save.upcomingEvents || []).find(event => event.id === eventId);
        const selectedEvent = storedEvent ? this.resolveCalendarEvent(storedEvent, save) : undefined;
        if (!selectedEvent) {
            return null;
        }

        const selectedLocation = save.atlas[selectedEvent.locationId];
        if (!selectedLocation) {
            return null;
        }

        const scheduleContext = this.getScheduleContext(save);
        const requestedActorIds = selectedEvent.actorIds || selectedEvent.participantActorIds || [];
        const scheduledActorIds = Object.values(save.actors || {})
            .filter(actor => actor.id !== save.playerId && actor.active !== false)
            .filter(actor => resolveActorSchedule(actor, scheduleContext) === selectedLocation.id)
            .map(actor => actor.id);
        const eligibleRequestedActorIds = requestedActorIds.filter(actorId => {
            const actor = save.actors?.[actorId];
            const destination = actor ? resolveActorSchedule(actor, scheduleContext) : '';
            return actor?.active !== false && (destination === ACTOR_SCHEDULE_AVAILABLE || destination === selectedLocation.id);
        });

        const skit = new Skit({
            initialLocationId: selectedLocation.id,
            guidance: selectedEvent.guidance || selectedEvent.description,
            script: [],
            initialActors: Array.from(new Set([...scheduledActorIds, ...eligibleRequestedActorIds])),
            summary: '',
        });

        if (!save.timeline) {
            save.timeline = [];
        }

        save.timeline.push({
            calendarEventId: selectedEvent.id,
            date: selectedEvent.date,
            calendarEventEndTimeOfDay: this.getEventEndTimeOfDay(selectedEvent),
            skit,
        });
        save.upcomingEvents = (save.upcomingEvents || []).filter(event => event.id !== selectedEvent.id);

        this.rebuildUpcomingEvents(save);
        this.saveGame();
        return skit;
    }

    async continueSkit(): Promise<void> {
        const skit = this.getCurrentSkit();
        if (!skit) return;
        try {
            const entries = await generateSkitScript(skit, this);
            skit.script.push(...entries);
            console.log('continueSkit: Updated skit.script length:', skit.script.length);
            this.saveGame();
        } catch (err) {
            console.error('Error continuing skit script', err);
        }
        return;
    }

    getCurrentLocationEvent(locationId: string): CalendarEvent | null {
        if (!this.areEventsEnabled()) {
            return null;
        }
        const save = this.getSave();
        this.ensureCalendarState(save);
        const currentDate = save.currentDate || this.getStartingDate(save);
        const currentTimeOfDay = save.currentTimeOfDay || 'morning';

        return [...(save.upcomingEvents || [])]
            .map(event => this.resolveCalendarEvent(event, save))
            .filter((event) => event.locationId === locationId)
            .filter((event) => event.date === currentDate)
            .filter((event) => event.duration.includes(currentTimeOfDay))
            .sort((left, right) => this.compareCalendarEvents(left, right))[0] || null;
    }

    private getCurrentMandatoryEvent(save: SaveType): CalendarEvent | null {
        if (!this.areEventsEnabled()) {
            return null;
        }
        const currentDate = save.currentDate || this.getStartingDate(save);
        const currentTimeOfDay = save.currentTimeOfDay || 'morning';

        return [...(save.upcomingEvents || [])]
            .filter(event => event.mandatory === true)
            .filter(event => event.date === currentDate)
            .filter(event => this.normalizeCalendarEventDuration(event.duration).includes(currentTimeOfDay))
            .sort((left, right) => this.compareCalendarEvents(left, right))[0] || null;
    }

    canVisitLocation(locationId: string): boolean {
        const save = this.getSave();
        const location = save.atlas?.[locationId];
        if (!location || location.active === false || isLocationDisabled(location, this.getScheduleContext(save))) {
            return false;
        }

        return Boolean(this.getCurrentLocationEvent(locationId)) || isLocationAvailable(location, this.getScheduleContext(save));
    }

    // Disabled locations don't exist yet/anymore and should never appear on maps.
    isLocationVisible(locationId: string): boolean {
        const save = this.getSave();
        const location = save.atlas?.[locationId];
        if (!location || location.active === false) {
            return false;
        }
        return !isLocationDisabled(location, this.getScheduleContext(save));
    }

    startLocationVisit(locationId: string): Skit | null {
        const save = this.getSave();
        const location = save.atlas?.[locationId];
        if (!location || location.active === false) {
            return null;
        }

        const currentEvent = this.getCurrentLocationEvent(locationId);
        if (currentEvent) {
            return this.startCalendarEventSkit(currentEvent.id);
        }

        if (!this.canVisitLocation(locationId)) {
            return null;
        }

        const initialActors = Object.values(save.actors || {})
            .filter((actor) => actor.id !== save.playerId && actor.active !== false)
            .filter((actor) => resolveActorSchedule(actor, this.getScheduleContext(save)) === location.id)
            .map((actor) => actor.id);
        const skit = new Skit({
            initialLocationId: location.id,
            guidance: '',
            script: [],
            initialActors,
            summary: '',
        });

        save.timeline = save.timeline || [];
        save.timeline.push({
            date: save.currentDate || this.getStartingDate(save),
            skit,
        });
        this.saveGame();
        return skit;
    }

    deleteSave(slotIndex: number) {
        this.saveData.saves[slotIndex] = undefined;
        if (this.saveData.lastSaveSlot === slotIndex) {
            this.saveData.lastSaveSlot = this.saveData.saves.findIndex(save => save !== undefined) ?? 0;
        }
        this.saveGame();
    }

    getSave(): SaveType {
        const save = this.saveData.saves[this.saveData.lastSaveSlot] || this.generateFreshSave({name: this.primaryUser.name, personality: this.primaryUser.chatProfile});
        this.ensureCalendarState(save);
        return save;
    }

    getUiSettings(): UiSettings {
        const save = this.getSave();
        this.ensureCalendarState(save);
        return {...DEFAULT_UI_SETTINGS, ...(save.uiSettings || {})};
    }

    updateUiSettings(updates: Partial<UiSettings>) {
        const save = this.getSave();
        this.ensureCalendarState(save);
        const uiSettings = {
            ...DEFAULT_UI_SETTINGS,
            ...(save.uiSettings || {}),
            ...updates,
        };
        save.uiSettings = uiSettings;
        this.updateConfiguration({ uiSettings: cloneUiSettings(uiSettings) });
        this.saveGame();
    }

    getPlayerActor(): Actor {
        return this.getSave().actors[this.getSave().playerId];
    }

    getCurrentSkit(): Skit | null {
        // Returns the most recent skit with no ending from the timeline, or null if there is no such skit.
        const save = this.getSave();
        if (!save.timeline || save.timeline.length === 0) {
            return null;
        }
        // Find the last entry with a skit and return it if it's not marked as over:
        for (let i = save.timeline.length - 1; i >= 0; i--) {
            const entry = save.timeline[i];
            if (entry.skit) {
                if (!entry.skit.over) {
                    return entry.skit;
                } else {
                    break;
                }
            }
        }
        return null;
    }

    private pickRandom<T>(items: T[]): T | null {
        if (!items.length) {
            return null;
        }
        const index = Math.floor(Math.random() * items.length);
        return items[index] || null;
    }

    private takeRandomDistinct<T>(items: T[], count: number): T[] {
        const pool = [...items];
        const selections: T[] = [];

        while (pool.length > 0 && selections.length < count) {
            const index = Math.floor(Math.random() * pool.length);
            const [item] = pool.splice(index, 1);
            if (item !== undefined) {
                selections.push(item);
            }
        }

        return selections;
    }

    private formatDate(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private addDays(baseDate: string, days: number): string {
        const parsedBaseDate = new Date(`${baseDate}T00:00:00Z`);
        if (Number.isNaN(parsedBaseDate.getTime())) {
            return this.formatDate(new Date());
        }

        parsedBaseDate.setUTCDate(parsedBaseDate.getUTCDate() + days);
        return this.formatDate(parsedBaseDate);
    }

    // Whether the active configuration hides real calendar dates behind an abstract Day N counter.
    getDateMode(): DateMode {
        return this.getConfiguration(this.getSave()).dateMode === 'turnBased' ? 'turnBased' : 'calendar';
    }

    // Whether the four daily slots are presented as named times of day or as abstract numbered phases.
    getTimeMode(): TimeMode {
        return this.getConfiguration(this.getSave()).timeMode === 'phase' ? 'phase' : 'timeOfDay';
    }

    areEventsEnabled(): boolean {
        return this.getConfiguration(this.getSave()).useEvents !== false;
    }

    // Converts a YYYY-MM-DD date into the 1-based day number relative to the configured starting date.
    getDayNumberForDate(dateKey: string): number {
        const startingDate = this.getConfiguration(this.getSave()).startingDate || this.formatDate(new Date());
        const start = new Date(`${startingDate}T00:00:00Z`);
        const target = new Date(`${dateKey}T00:00:00Z`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())) {
            return 1;
        }

        const diffDays = Math.round((target.getTime() - start.getTime()) / 86400000);
        return diffDays + 1;
    }

    // Converts a 1-based day number back into a YYYY-MM-DD date relative to the configured starting date.
    getDateForDayNumber(dayNumber: number): string {
        const startingDate = this.getConfiguration(this.getSave()).startingDate || this.formatDate(new Date());
        const normalizedDayNumber = Number.isFinite(dayNumber) ? Math.floor(dayNumber) : 1;
        return this.addDays(startingDate, normalizedDayNumber - 1);
    }

    private addMonths(baseDate: string, months: number): string {
        const parsedBaseDate = new Date(`${baseDate}T00:00:00Z`);
        if (Number.isNaN(parsedBaseDate.getTime())) {
            return this.formatDate(new Date());
        }

        parsedBaseDate.setUTCMonth(parsedBaseDate.getUTCMonth() + months);
        return this.formatDate(parsedBaseDate);
    }

    private createCalendarEventId(): string {
        return `event-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    private removeCalendarEventSeries(save: SaveType, seriesId: string) {
        save.upcomingEvents = (save.upcomingEvents || []).filter((event) => {
            const eventSeriesId = event.recurrenceParentId || event.id;
            return eventSeriesId !== seriesId;
        });
    }

    private normalizeCalendarTimeOfDay(value: unknown): CalendarTimeOfDay | undefined {
        const normalized = `${value || ''}`.trim().toLowerCase();
        if (normalized === 'morning' || normalized === 'afternoon' || normalized === 'evening' || normalized === 'night') {
            return normalized;
        }
        return undefined;
    }

    private calendarTimeOrder(timeOfDay?: CalendarTimeOfDay): number {
        const resolved = this.normalizeCalendarTimeOfDay(timeOfDay) || 'morning';
        const index = CALENDAR_TIME_ORDER.indexOf(resolved);
        return index >= 0 ? index : 0;
    }

    private normalizeCalendarEventDuration(duration: unknown): CalendarTimeOfDay[] {
        const candidateSlots = Array.isArray(duration)
            ? duration
            : typeof duration === 'string'
                ? duration.split(',')
                : [];
        const normalizedSlots = Array.from(new Set(
            candidateSlots
                .map((slot) => this.normalizeCalendarTimeOfDay(slot))
                .filter((slot): slot is CalendarTimeOfDay => Boolean(slot)),
        ));

        if (normalizedSlots.length === 0) {
            return [...ALL_DAY_DURATION];
        }

        return normalizedSlots.sort((left, right) => this.calendarTimeOrder(left) - this.calendarTimeOrder(right));
    }

    private getEventStartTimeOfDay(event: CalendarEvent): CalendarTimeOfDay {
        return this.normalizeCalendarEventDuration(event.duration)[0] || 'morning';
    }

    private getEventEndTimeOfDay(event: CalendarEvent): CalendarTimeOfDay {
        const duration = this.normalizeCalendarEventDuration(event.duration);
        return duration[duration.length - 1] || 'evening';
    }

    private getNextTimeOfDay(timeOfDay: CalendarTimeOfDay): CalendarTimeOfDay {
        const index = this.calendarTimeOrder(timeOfDay);
        return CALENDAR_TIME_ORDER[Math.min(index + 1, CALENDAR_TIME_ORDER.length - 1)];
    }

    private compareCalendarEvents(left: CalendarEvent, right: CalendarEvent): number {
        const dateCompare = `${left.date || ''}`.localeCompare(`${right.date || ''}`);
        if (dateCompare !== 0) {
            return dateCompare;
        }

        const timeCompare = this.calendarTimeOrder(this.getEventStartTimeOfDay(left)) - this.calendarTimeOrder(this.getEventStartTimeOfDay(right));
        if (timeCompare !== 0) {
            return timeCompare;
        }

        return `${left.id || ''}`.localeCompare(`${right.id || ''}`);
    }

    private advanceCalendarAfterEvent(save: SaveType, event: CalendarEvent) {
        const eventDate = `${event.date || ''}`.trim() || save.currentDate || this.getStartingDate(save);
        return this.advanceTimeToNextSlot(save, eventDate, this.getEventEndTimeOfDay(event));
    }

    // Advances the save's calendar position to the slot following (date, timeOfDay), rolling to the next day
    // after night, and replays any stat update rules for periods entered along the way.
    private advanceTimeToNextSlot(save: SaveType, date: string, timeOfDay: CalendarTimeOfDay) {
        const previousDate = save.currentDate || this.getStartingDate(save);
        const previousTimeOfDay = save.currentTimeOfDay || 'morning';

        if (timeOfDay === 'night') {
            save.currentDate = this.addDays(date, 1);
            save.currentTimeOfDay = 'morning';
        } else {
            save.currentDate = date;
            save.currentTimeOfDay = this.getNextTimeOfDay(timeOfDay);
        }

        return this.applyStatUpdateRules(save, previousDate, previousTimeOfDay);
    }

    // Replays the configured stat update rules for every in-game period entered between the previous calendar
    // position (exclusive) and the save's current one (inclusive), so recurring rules such as "every morning"
    // still fire for periods skipped by a multi-day jump.
    private applyStatUpdateRules(save: SaveType, previousDate: string, previousTimeOfDay: CalendarTimeOfDay): Skit | null {
        const rules = (this.getConfiguration(save).statUpdateRules || []).filter(rule => rule.trigger !== 'startup');
        if (rules.length === 0) {
            return null;
        }

        const targetDate = save.currentDate || previousDate;
        const targetTimeOfDay = save.currentTimeOfDay || previousTimeOfDay;
        let date = previousDate;
        let timeOfDay = previousTimeOfDay;
        let nextSkit: Skit | null = null;

        for (let step = 0; step < MAX_STAT_UPDATE_PERIODS; step++) {
            if (date === targetDate && timeOfDay === targetTimeOfDay) {
                return nextSkit;
            }

            if (timeOfDay === 'night') {
                date = this.addDays(date, 1);
                timeOfDay = 'morning';
            } else {
                timeOfDay = this.getNextTimeOfDay(timeOfDay);
            }

            if (date > targetDate) {
                return nextSkit;
            }

            const context: ConditionContext = { ...this.getScheduleContext(save), currentDate: date, currentTimeOfDay: timeOfDay };
            rules
                .filter(rule => evaluateConditionCollections(rule.conditions, context))
                .forEach(rule => (rule.updates || []).forEach(update => {
                    if (update.kind === 'skit') {
                        if (!nextSkit) {
                            nextSkit = this.createStatUpdateSkit(save, update);
                        }
                    } else {
                        this.applyStatUpdateAction(save, update, context);
                    }
                }));
        }
        return nextSkit;
    }

    private resolveSkitActionValue(save: SaveType, source: SkitActionValue, type: StatType): StatValue {
        if (typeof source !== 'object' || Array.isArray(source)) {
            if (type === 'text' && typeof source === 'string' && source.trim()) {
                const name = source.trim().toLowerCase();
                const fn = !isValueReference(source) && this.getConfiguration(save).functions.find(candidate => candidate.returnType === 'text' && candidate.name.trim().toLowerCase() === name);
                if (fn) {
                    source = functionReference(fn.id);
                }
            }
            const value = this.resolveValue(source, type, save);
            validateFunctionResult(value, type);
            return value;
        }
        const configuration = this.getConfiguration(save);
        const stats = source.targetType === 'global' ? configuration.globalStats
            : source.targetType === 'actor' ? configuration.actorStats
                : source.targetType === 'location' ? configuration.locationStats : configuration.itemStats;
        const stat = stats.find(candidate => candidate.id === source.statId);
        if (!stat || stat.type !== type) {
            throw new Error(`Skit action requires a ${type} stat: ${source.statId}`);
        }
        if (source.targetType === 'global') {
            return this.readStatValue(save.globalStatValues?.[stat.id], stat, save);
        }
        const entity = source.targetType === 'actor' ? save.actors[source.targetId]
            : source.targetType === 'location' ? save.atlas[source.targetId]
                : save.inventory.find(item => item.id === source.targetId);
        if (!entity || entity.active === false) {
            throw new Error(`Unknown skit stat owner: ${source.targetType} ${source.targetId}`);
        }
        return this.readStatValue(entity.statMap?.[stat.id], stat, save);
    }

    private createStatUpdateSkit(save: SaveType, action: StartSkitAction): Skit {
        const locationId = this.resolveSkitActionValue(save, action.locationId, 'location');
        const actorIds = this.resolveSkitActionValue(save, action.actorIds, 'actorList');
        const guidance = action.guidance === undefined ? '' : this.resolveSkitActionValue(save, action.guidance, 'text');
        if (typeof locationId !== 'string' || !save.atlas[locationId] || save.atlas[locationId].active === false) {
            throw new Error(`Unknown skit action location: ${locationId}`);
        }
        if (!Array.isArray(actorIds) || actorIds.some(id => !save.actors[id] || save.actors[id].active === false)) {
            throw new Error(`Invalid skit action participants: ${actorIds}`);
        }
        if (typeof guidance !== 'string') {
            throw new Error('Skit action guidance must be text.');
        }
        return new Skit({
            initialLocationId: locationId,
            initialActors: [...new Set(actorIds.filter(id => id !== save.playerId))],
            guidance
        });
    }

    // Applies a single StatUpdateRule action: a direct stat write ('stat' kind, the original behavior) or a
    // global function invocation ('function' kind).
    private applyStatUpdateAction(save: SaveType, update: GameAction, context: ConditionContext) {
        if (update.kind === 'function') {
            const fn = this.getConfiguration(save).functions.find(candidate => candidate.id === update.functionId);
            if (!fn) {
                console.error(`Unknown function: ${update.functionId}`);
                return;
            }
            this.runGameFunction(save, fn, 0, undefined, { readOnly: false, stack: [] }, update.args);
            return;
        }
        this.applyStatUpdate(save, update, context);
    }

    // Resolves the actor(s) an update targets for a given ContentTarget: the 'any'/'none'
    // meta-targets, 'variable' (context.currentActor), or
    // a literal actor id.
    private resolveUpdateTargetActors(save: SaveType, actorId: string, context: ConditionContext): Actor[] {
        const activeActors = Object.values(save.actors || {}).filter(actor => actor.active !== false);
        if (actorId === 'any') {
            return activeActors;
        }
        if (actorId === 'none') {
            return [];
        }
        if (actorId === 'variable') {
            return context.currentActor ? activeActors.filter(actor => actor.id === context.currentActor?.id) : [];
        }
        return activeActors.filter(actor => actor.id === actorId);
    }

    // Location/item counterparts of resolveUpdateTargetActors; there's no context-bound location/item, so
    // 'variable' resolves to nothing.
    private resolveUpdateTargetLocations(save: SaveType, locationId: string): Location[] {
        const activeLocations = Object.values(save.atlas || {}).filter(location => location.active !== false);
        if (locationId === 'any') {
            return activeLocations;
        }
        return activeLocations.filter(location => location.id === locationId);
    }

    private resolveUpdateTargetItems(save: SaveType, itemId: string): Item[] {
        const activeItems = (save.inventory || []).filter(item => item.active !== false);
        if (itemId === 'any') {
            return activeItems;
        }
        return activeItems.filter(item => item.id === itemId);
    }

    private getStatsForUpdateTarget(targetType: StatUpdate['targetType'], save: SaveType): Stat[] {
        const configuration = this.getConfiguration(save);
        switch (targetType) {
            case 'global': return configuration.globalStats || [];
            case 'location': return configuration.locationStats || [];
            case 'item': return configuration.itemStats || [];
            default: return configuration.actorStats || [];
        }
    }

    // The entity instances (with statMaps) a non-global update targets, per its targetType.
    private resolveUpdateTargetEntities(save: SaveType, update: StatUpdate, context: ConditionContext): Array<Actor | Location | Item> {
        if (update.targetType !== 'global') {
            update = { ...update, targetId: String(this.resolveValue(update.targetId, update.targetType, save)) };
        }
        switch (update.targetType) {
            case 'location': return this.resolveUpdateTargetLocations(save, update.targetId);
            case 'item': return this.resolveUpdateTargetItems(save, update.targetId);
            case 'actor': return this.resolveUpdateTargetActors(save, update.targetId, context);
            default: return [];
        }
    }

    // Builds the get/set accessors a function script uses to read/write a global stat by name.
    private buildGlobalScriptAccessors(save: SaveType, context: ScriptContext): Pick<FunctionScriptBindings, 'get' | 'getObjects' | 'set'> {
        const stats = this.getConfiguration(save).globalStats || [];
        const findStat = (name: string) => stats.find(candidate => candidate.name.trim().toLowerCase() === `${name || ''}`.trim().toLowerCase());
        return {
            get: (name: string) => {
                const stat = findStat(name);
                return stat ? this.readStatValue(save.globalStatValues?.[stat.id], stat, save, context.stack) : undefined;
            },
            getObjects: (name: string) => {
                const stat = findStat(name);
                return this.resolveScriptStatObjects(save, stat, stat ? save.globalStatValues?.[stat.id] : undefined, name, context);
            },
            set: (name: string, value: StatValue) => {
                if (context.readOnly) {
                    throw new Error('Function-backed values are read-only: set() is not allowed.');
                }
                const stat = findStat(name);
                if (!stat) {
                    return;
                }
                save.globalStatValues = save.globalStatValues || {};
                save.globalStatValues[stat.id] = this.readStatValue(value, stat, save, context.stack);
            },
        };
    }

    private resolveScriptStatObjects(save: SaveType, stat: Stat | undefined, value: StatValue | undefined, name: string, context: ScriptContext): FunctionScriptObject[] {
        if (!stat || !isListStatType(stat.type)) {
            throw new Error(`getObjects("${name}") requires an option list or content list stat.`);
        }
        const ids = this.readStatValue(value, stat, save, context.stack) as string[];
        if (stat.type === 'optionList') {
            const options = resolveStatOptionPool(stat);
            return ids.flatMap(id => {
                const option = options.find(candidate => candidate.id === id);
                return option ? [{ ...option }] : [];
            });
        }
        // Single-kind lists resolve to one kind; mixed contentList ids are probed against every collection.
        const statKind = resolveReferenceKind(stat.type);
        const configuration = this.getConfiguration(save);
        return ids.flatMap(id => {
            const kind = statKind ?? (save.actors?.[id] ? 'actor' : save.atlas?.[id] ? 'location' : save.inventory?.some(item => item.id === id) ? 'item' : undefined);
            if (!kind) {
                return [];
            }
            const stats = kind === 'actor' ? configuration.actorStats : kind === 'location' ? configuration.locationStats : configuration.itemStats;
            const fields = kind === 'actor' ? ACTOR_SCRIPT_FIELDS : kind === 'location' ? LOCATION_SCRIPT_FIELDS : ITEM_SCRIPT_FIELDS;
            const entity = kind === 'actor' ? save.actors?.[id]
                : kind === 'location' ? save.atlas?.[id]
                    : save.inventory?.find(item => item.id === id);
            return entity && entity.active !== false
                ? [this.buildEntityScriptAccessor(save, entity, kind, stats || [], fields, context)]
                : [];
        });
    }

    // Wraps a live entity (actor/location/item) and its configured stat definitions into a FunctionScriptEntity
    // whose get/set accessors read/write the entity's own statMap by stat name. When `fieldAllowlist` is given
    // (actor/location only), also exposes getField/setField for that allowlist of simple metadata fields.
    private buildEntityScriptAccessor(
        save: SaveType,
        entity: { id: string; name: string; statMap: { [key: string]: StatValue } },
        kind: FunctionScriptEntity['kind'],
        stats: Stat[],
        fieldAllowlist?: string[],
        context: ScriptContext = { readOnly: false, stack: [] },
    ): FunctionScriptEntity {
        const statMap = entity.statMap;
        const entityFields = entity as unknown as Record<string, unknown>;
        const findStat = (statName: string) => stats.find(candidate => candidate.name.trim().toLowerCase() === `${statName || ''}`.trim().toLowerCase());
        const accessor: FunctionScriptEntity = {
            id: entity.id,
            name: entity.name,
            kind,
            get: (statName: string) => {
                const stat = findStat(statName);
                return stat ? this.readStatValue(statMap[stat.id], stat, save, context.stack) : undefined;
            },
            getObjects: (statName: string) => {
                const stat = findStat(statName);
                return this.resolveScriptStatObjects(save, stat, stat ? statMap[stat.id] : undefined, statName, context);
            },
            set: (statName: string, value: StatValue) => {
                if (context.readOnly) {
                    throw new Error('Function-backed values are read-only: entity.set() is not allowed.');
                }
                const stat = findStat(statName);
                if (!stat) {
                    return;
                }
                statMap[stat.id] = this.readStatValue(value, stat, save, context.stack);
            },
        };
        if (fieldAllowlist) {
            const findField = (fieldName: string) => fieldAllowlist.find(candidate => candidate.toLowerCase() === `${fieldName || ''}`.trim().toLowerCase());
            accessor.getField = (fieldName: string) => {
                const field = findField(fieldName);
                return field ? String(entityFields[field] ?? '') : undefined;
            };
            accessor.setField = (fieldName: string, value: string) => {
                if (context.readOnly) {
                    throw new Error('Function-backed values are read-only: setField() is not allowed.');
                }
                const field = findField(fieldName);
                if (field) {
                    entityFields[field] = `${value ?? ''}`;
                }
            };
        }
        return accessor;
    }

    private findActorScriptEntity(save: SaveType, name: string, context: ScriptContext): FunctionScriptEntity | undefined {
        const actor = Object.values(save.actors || {}).find(candidate => candidate.active !== false && candidate.name.trim().toLowerCase() === `${name || ''}`.trim().toLowerCase());
        return actor ? this.buildEntityScriptAccessor(save, actor, 'actor', this.getConfiguration(save).actorStats || [], ACTOR_SCRIPT_FIELDS, context) : undefined;
    }

    private findLocationScriptEntity(save: SaveType, name: string, context: ScriptContext): FunctionScriptEntity | undefined {
        const location = Object.values(save.atlas || {}).find(candidate => candidate.active !== false && candidate.name.trim().toLowerCase() === `${name || ''}`.trim().toLowerCase());
        return location ? this.buildEntityScriptAccessor(save, location, 'location', this.getConfiguration(save).locationStats || [], LOCATION_SCRIPT_FIELDS, context) : undefined;
    }

    private findItemScriptEntity(save: SaveType, name: string, context: ScriptContext): FunctionScriptEntity | undefined {
        const item = (save.inventory || []).find(candidate => candidate.active !== false && candidate.name.trim().toLowerCase() === `${name || ''}`.trim().toLowerCase());
        return item ? this.buildEntityScriptAccessor(save, item, 'item', this.getConfiguration(save).itemStats || [], ITEM_SCRIPT_FIELDS, context) : undefined;
    }

    // Every active (non-deleted) actor/location/item, wrapped as FunctionScriptEntity, for scripts that need to
    // loop over the full cast (e.g. `actors().forEach(a => ...)`).
    private buildActorScriptEntities(save: SaveType, context: ScriptContext): FunctionScriptEntity[] {
        const actorStats = this.getConfiguration(save).actorStats || [];
        return Object.values(save.actors || {})
            .filter(actor => actor.active !== false)
            .map(actor => this.buildEntityScriptAccessor(save, actor, 'actor', actorStats, ACTOR_SCRIPT_FIELDS, context));
    }

    private buildLocationScriptEntities(save: SaveType, context: ScriptContext): FunctionScriptEntity[] {
        const locationStats = this.getConfiguration(save).locationStats || [];
        return Object.values(save.atlas || {})
            .filter(location => location.active !== false)
            .map(location => this.buildEntityScriptAccessor(save, location, 'location', locationStats, LOCATION_SCRIPT_FIELDS, context));
    }

    private buildItemScriptEntities(save: SaveType, context: ScriptContext): FunctionScriptEntity[] {
        const itemStats = this.getConfiguration(save).itemStats || [];
        return (save.inventory || [])
            .filter(item => item.active !== false)
            .map(item => this.buildEntityScriptAccessor(save, item, 'item', itemStats, ITEM_SCRIPT_FIELDS, context));
    }

    private buildFunctionScriptBindings(save: SaveType, depth: number, context: ScriptContext, onError?: (message: string) => void, fn?: GameFunction, args?: Record<string, StatValue>): FunctionScriptBindings {
        const configuration = this.getConfiguration(save);
        const call = (name: string, callArgs?: Record<string, unknown>): unknown => {
            if (depth >= MAX_FUNCTION_INVOCATION_DEPTH) {
                throw new Error('Maximum function invocation depth exceeded.');
            }
            const normalizedName = `${name || ''}`.trim().toLowerCase();
            const target = (configuration.functions || []).find(candidate => candidate.name.trim().toLowerCase() === normalizedName);
            if (!target) {
                throw new Error(`Unknown function: ${name}`);
            }
            return this.runGameFunction(save, target, depth + 1, onError, context, namedFunctionArguments(target, callArgs));
        };
        // Arguments resolve lazily (and only once) so unused argument errors don't fail the invocation;
        // omitted arguments fall back to the parameter's default through the normal stat pipeline.
        const resolvedArgs = new Map<string, StatValue>();
        const arg = (name: string): StatValue | undefined => {
            const parameter = fn && (fn.parameters || []).find(candidate => candidate.name.trim().toLowerCase() === `${name || ''}`.trim().toLowerCase());
            if (!parameter) {
                throw new Error(`Unknown function parameter: ${name}`);
            }
            if (!resolvedArgs.has(parameter.id)) {
                resolvedArgs.set(parameter.id, this.readStatValue(args?.[parameter.id], parameter, save, context.stack));
            }
            return resolvedArgs.get(parameter.id);
        };
        return {
            ...this.buildGlobalScriptAccessors(save, context),
            getActor: (name: string) => this.findActorScriptEntity(save, name, context),
            getLocation: (name: string) => this.findLocationScriptEntity(save, name, context),
            getItem: (name: string) => this.findItemScriptEntity(save, name, context),
            actors: () => this.buildActorScriptEntities(save, context),
            locations: () => this.buildLocationScriptEntities(save, context),
            items: () => this.buildItemScriptEntities(save, context),
            call,
            arg,
        };
    }

    private runGameFunction(save: SaveType, fn: GameFunction, depth: number, onError?: (message: string) => void, context: ScriptContext = { readOnly: false, stack: [] }, args?: Record<string, StatValue>): unknown {
        const reference = functionReference(fn.id);
        if (context.stack.includes(reference) || context.stack.length >= MAX_FUNCTION_INVOCATION_DEPTH) {
            throw new Error(`Maximum function invocation depth exceeded or cyclic function reference: ${fn.name}`);
        }
        const nextContext = { ...context, stack: [...context.stack, reference] };
        let failed = false;
        const reportError = (message: string) => {
            failed = true;
            if (onError) onError(message);
            else console.error(message);
        };
        const result = runFunctionScript(fn.script, this.buildFunctionScriptBindings(save, depth, nextContext, reportError, fn, args), reportError);
        if (!failed) validateFunctionResult(result, fn.returnType || 'void');
        return result;
    }

    testFunction(fn: GameFunction, functions: GameFunction[] = this.getConfiguration().functions, readOnly: boolean = fn.returnType !== undefined && fn.returnType !== 'void'): FunctionScriptTestResult {
        const errors: string[] = [];
        try {
            const save = structuredClone(this.getSave());
            const configuration = structuredClone(this.getConfiguration());
            configuration.functions = structuredClone([...functions.filter(candidate => candidate.id !== fn.id), fn]);
            const runtime: Stage = Object.create(this);
            runtime.getConfiguration = () => configuration;
            const value = runtime.runGameFunction(save, fn, 0, message => errors.push(message), { readOnly, stack: [] });
            return { value, errors };
        } catch (error) {
            errors.push((error as Error)?.message || String(error));
            return { value: undefined, errors };
        }
    }

    private applyStatUpdate(save: SaveType, update: StatUpdate, context: ConditionContext = {}) {
        const stat = this.getStatsForUpdateTarget(update.targetType, save).find(candidate => candidate.id === update.statId);
        if (!stat) {
            return;
        }

        if (update.targetType === 'global') {
            save.globalStatValues = save.globalStatValues || {};
            save.globalStatValues[stat.id] = this.applyResolvedStatUpdate(save.globalStatValues[stat.id], update, stat, save);
            return;
        }


        this.resolveUpdateTargetEntities(save, update, context).forEach(entity => {
            entity.statMap = entity.statMap || {};
            entity.statMap[stat.id] = this.applyResolvedStatUpdate(entity.statMap[stat.id], update, stat, save);
        });
    }

    private applyResolvedStatUpdate(current: StatValue | undefined, update: StatUpdate, stat: Stat, save: SaveType): StatValue {
        if (update.operation === 'set' || (stat.type !== 'number' && stat.type !== 'optionList')) {
            return this.readStatValue(applyStatUpdateValue(current, {
                ...update, value: this.resolveValue(update.value, stat.type, save),
            }, stat), stat, save);
        }
        const currentValue = this.readStatValue(current, stat, save);
        const operand = stat.type === 'optionList' && !Array.isArray(update.value)
            ? [update.value] : update.value;
        return applyStatUpdateValue(currentValue, {
            ...update, value: this.resolveValue(operand, stat.type, save),
        }, { ...stat, default: currentValue });
    }

    resolveCalendarEvent(event: CalendarEvent, save: SaveType = this.getSave()): CalendarEvent {
        const actorIds = this.resolveValue(event.actorIds || event.participantActorIds || [], 'actorList', save) as string[];
        return { ...event, locationId: String(this.resolveValue(event.locationId, 'location', save)), actorIds, participantActorIds: [...actorIds] };
    }

    private normalizeCalendarEventForSave(event: CalendarEvent, save: SaveType, useConfiguration: boolean = false): CalendarEvent {
        const configuration = this.getConfiguration(save);
        const allLocations = useConfiguration
            ? (configuration.locations || []).filter(location => location.active !== false)
            : Object.values(save.atlas || {}).filter(location => location.active !== false);
        const allActors = useConfiguration
            ? configuration.actors || []
            : Object.values(save.actors || {});
        const fallbackLocationId = allLocations[0]?.id || '';
        const locationId = isValueReference(event.locationId) || allLocations.some(location => location.id === event.locationId)
            ? event.locationId
            : fallbackLocationId;
        const name = `${event.name || ''}`.trim() || 'Untitled Event';
        const date = `${event.date || ''}`.trim() || (save.currentDate || this.getStartingDate(save));
        const actorIds = Array.from(new Set(
            (event.actorIds || event.participantActorIds || [])
                .filter(actorId => isValueReference(actorId) || allActors.some(actor => actor.id === actorId && actor.active !== false))
                .map(actorId => `${actorId}`),
        ));
        const locationName = allLocations.find(location => location.id === locationId)?.name || 'an unknown location';
        const description = `${event.description || ''}`.trim() || `${name} at ${locationName}.`;
        const guidance = `${event.guidance || description || name}`.trim();

        return {
            ...event,
            id: `${event.id || this.createCalendarEventId()}`,
            name,
            date,
            duration: this.normalizeCalendarEventDuration(event.duration),
            locationId,
            actorIds,
            participantActorIds: [...actorIds],
            description,
            guidance,
            mandatory: event.mandatory === true,
            recurrence: this.normalizeCalendarEventRecurrence(event.recurrence, date),
            recurrenceParentId: undefined,
            recurrenceInstanceIndex: undefined,
        };
    }

    private normalizeRecurrenceFrequency(value: unknown): CalendarEventRecurrenceFrequency | undefined {
        const normalized = `${value || ''}`.trim().toLowerCase();
        if (normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly') {
            return normalized;
        }
        return undefined;
    }

    private normalizeCalendarEventRecurrence(rawRecurrence: any, eventDate: string): CalendarEventRecurrence | undefined {
        if (!rawRecurrence || typeof rawRecurrence !== 'object') {
            return undefined;
        }

        const frequency = this.normalizeRecurrenceFrequency(
            rawRecurrence.frequency
            ?? rawRecurrence.Frequency
            ?? rawRecurrence.type
            ?? rawRecurrence.Type,
        );
        if (!frequency) {
            return undefined;
        }

        const intervalCandidate = Number(rawRecurrence.interval ?? rawRecurrence.Interval ?? 1);
        const interval = Number.isFinite(intervalCandidate) && intervalCandidate > 0
            ? Math.floor(intervalCandidate)
            : 1;
        const untilDate = `${rawRecurrence.untilDate ?? rawRecurrence.UntilDate ?? rawRecurrence.endDate ?? rawRecurrence.EndDate ?? ''}`.trim();

        if (!untilDate || this.getDayDifference(eventDate, untilDate) < 0) {
            return undefined;
        }

        return {
            frequency,
            interval,
            untilDate,
        };
    }

    private expandRecurringEvent(event: CalendarEvent): CalendarEvent[] {
        const recurrence = event.recurrence;
        if (!recurrence) {
            return [event];
        }

        const expanded: CalendarEvent[] = [
            {
                ...event,
                recurrenceParentId: event.recurrenceParentId || event.id,
                recurrenceInstanceIndex: event.recurrenceInstanceIndex ?? 0,
            },
        ];

        let nextDate = event.date;
        let iteration = 0;
        const maxGeneratedInstances = 180;
        while (iteration < maxGeneratedInstances) {
            iteration += 1;
            if (recurrence.frequency === 'daily') {
                nextDate = this.addDays(nextDate, recurrence.interval);
            } else if (recurrence.frequency === 'weekly') {
                nextDate = this.addDays(nextDate, recurrence.interval * 7);
            } else {
                nextDate = this.addMonths(nextDate, recurrence.interval);
            }

            if (this.getDayDifference(nextDate, recurrence.untilDate) < 0) {
                break;
            }

            expanded.push({
                ...event,
                id: `${event.id}-r${iteration}`,
                date: nextDate,
                recurrenceParentId: event.id,
                recurrenceInstanceIndex: iteration,
            });
        }

        return expanded;
    }

    private parseOutcomeCharacters(rawCharacters: any): string[] {
        if (Array.isArray(rawCharacters)) {
            return rawCharacters.map(item => `${item || ''}`.trim()).filter(Boolean);
        }
        if (typeof rawCharacters === 'string') {
            return rawCharacters
                .split(',')
                .map(item => item.trim())
                .filter(Boolean);
        }
        if (rawCharacters && typeof rawCharacters === 'object') {
            const characterField = rawCharacters.Character ?? rawCharacters.character;
            if (Array.isArray(characterField)) {
                return characterField.map(item => `${item || ''}`.trim()).filter(Boolean);
            }
            if (typeof characterField === 'string') {
                return [characterField.trim()].filter(Boolean);
            }
        }
        return [];
    }

    private buildCalendarEventFromOutcome(details: any, save: SaveType): CalendarEvent | null {
        const source = details?.event || details || {};
        const eventName = `${source.name ?? source.Name ?? ''}`.trim();
        if (!eventName) {
            return null;
        }

        const eventDate = `${source.date ?? source.Date ?? save.currentDate ?? this.getStartingDate(save)}`.trim();
        const resolvedDate = eventDate || this.addDays(save.currentDate || this.getStartingDate(save), 1);
        const locationText = `${source.location ?? source.Location ?? ''}`.trim();
        const locations = Object.values(save.atlas || {}).filter(location => location.active !== false);
        const matchedLocation = findBestNameMatch(locationText, locations, ['id', 'name']) || locations[0];
        if (!matchedLocation) {
            return null;
        }

        const actorCandidates = this.parseOutcomeCharacters(
            source.requiredCharacters
            ?? source.RequiredCharacters
            ?? source.characters
            ?? source.Character
            ?? source.character,
        );
        const availableActors = Object.values(save.actors || {}).filter(actor => actor.active !== false);
        const actorIds = actorCandidates
            .map(name => findBestNameMatch(name, availableActors, ['id', 'name'])?.id)
            .filter((id): id is string => Boolean(id));

        const description = `${source.description ?? source.Description ?? `${eventName} at ${matchedLocation.name}.`}`.trim();
        const hiddenAgenda = `${source.secret ?? source.Secret ?? source.hiddenAgenda ?? source.guidance ?? source.Guidance ?? description}`.trim();
        const mandatoryValue = source.mandatory ?? source.Mandatory;
        const recurrence = this.normalizeCalendarEventRecurrence(
            source.recurrence ?? source.Recurrence,
            resolvedDate,
        );

        return {
            id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            name: eventName,
            date: resolvedDate,
            duration: this.normalizeCalendarEventDuration(source.duration ?? source.Duration ?? source.timeOfDay ?? source.TimeOfDay),
            locationId: matchedLocation.id,
            actorIds,
            participantActorIds: [...actorIds],
            description,
            guidance: hiddenAgenda,
            mandatory: mandatoryValue === true || ['true', 'yes', '1'].includes(`${mandatoryValue || ''}`.trim().toLowerCase()),
            recurrence,
        };
    }

    private getDayDifference(startDate: string, endDate: string): number {
        const start = new Date(`${startDate}T00:00:00Z`);
        const end = new Date(`${endDate}T00:00:00Z`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return 0;
        }

        return Math.round((end.getTime() - start.getTime()) / 86400000);
    }

    private getStartingDate(save: SaveType): string {

        return this.getConfiguration(save).startingDate || save.currentDate || new Date().toISOString().slice(0, 10);
    }

    private buildEventName(locationName: string, participantNames: string[]): string {
        if (participantNames.length === 0) {
            return `Visit ${locationName}`;
        }

        if (participantNames.length === 1) {
            return `${participantNames[0]} at ${locationName}`;
        }

        return `${participantNames[0]} & ${participantNames[1]} at ${locationName}`;
    }

    private ensureCalendarState(save: SaveType) {

        if (!save.currentDate) {
            save.currentDate = this.getStartingDate(save);
        }

        save.currentTimeOfDay = this.normalizeCalendarTimeOfDay(save.currentTimeOfDay) || 'morning';

        if (!save.upcomingEvents) {
            save.upcomingEvents = [];
        }

        save.upcomingEvents = save.upcomingEvents.map((event) => ({
            ...event,
            actorIds: event.actorIds || event.participantActorIds || [],
            participantActorIds: event.participantActorIds || event.actorIds || [],
            duration: this.normalizeCalendarEventDuration(event.duration),
            description: event.description || event.guidance || `${event.name} at ${save.atlas[event.locationId]?.name || 'an unknown location'}.`,
            guidance: event.guidance || event.description || event.name,
            mandatory: event.mandatory === true,
            recurrence: this.normalizeCalendarEventRecurrence(event.recurrence, event.date),
            recurrenceParentId: event.recurrenceParentId || undefined,
            recurrenceInstanceIndex: Number.isFinite(event.recurrenceInstanceIndex)
                ? Number(event.recurrenceInstanceIndex)
                : undefined,
        }));

        this.syncGlobalStats(save);
        this.syncActorStats(save);
        this.syncLocationStats(save);
        this.syncItemStats(save);

        if (!save.uiSettings) {
            save.uiSettings = {...DEFAULT_UI_SETTINGS};
        } else {
            save.uiSettings = {...DEFAULT_UI_SETTINGS, ...save.uiSettings};
        }
    }

    private syncActorStats(save: SaveType) {
        this.syncEntityStats(Object.values(save.actors || {}), this.getConfiguration(save).actorStats, save);
    }

    private syncLocationStats(save: SaveType) {
        this.syncEntityStats(Object.values(save.atlas || {}), this.getConfiguration(save).locationStats, save);
    }

    private syncItemStats(save: SaveType) {
        save.inventory = (save.inventory || []).map(item => item instanceof Item ? item : cloneItem(item));
        this.syncEntityStats(save.inventory, this.getConfiguration(save).itemStats, save);
    }

    private syncEntityStats(entities: { statMap: Record<string, StatValue> }[], stats: Stat[] | undefined, save: SaveType) {
        const configuredStats = (stats || []).filter(stat => stat?.name?.trim());
        const statIds = new Set(configuredStats.map(stat => stat.id));

        entities.forEach(entity => {
            if (!entity.statMap || typeof entity.statMap !== 'object') {
                entity.statMap = {};
            }

            configuredStats.forEach(stat => {
                const existingValue = entity.statMap[stat.id];
                entity.statMap[stat.id] = this.readStatValue(existingValue, stat, save);
            });

            Object.keys(entity.statMap).forEach(statId => {
                if (!statIds.has(statId)) {
                    delete entity.statMap[statId];
                }
            });
        });
    }

    private syncGlobalStats(save: SaveType) {
        const configuredStats = (this.getConfiguration(save).globalStats || []).filter(stat => stat?.name?.trim());
        const currentValues = save.globalStatValues && typeof save.globalStatValues === 'object'
            ? save.globalStatValues
            : {};

        const normalizedValues: { [key: string]: StatValue } = {};
        configuredStats.forEach((stat) => {
            const value = this.readStatValue(currentValues[stat.id], stat, save);
            currentValues[stat.id] = value;
            normalizedValues[stat.id] = value;
        });

        save.globalStatValues = normalizedValues;
    }

    private createCalendarEvents(save: SaveType, count: number): CalendarEvent[] {
        this.ensureCalendarState(save);

        const playerId = save.playerId;
        const availableActors = Object.values(save.actors || {}).filter(actor =>
            actor.id !== playerId && actor.name.toLowerCase() !== 'cassiel',
        ).filter(actor => actor.active !== false);

        const generatedEvents: CalendarEvent[] = [];
        const upcomingEvents = (save.upcomingEvents || []).filter(event => this.isFutureEvent(event));
        const sortedExistingEvents = [...upcomingEvents].sort((a, b) => a.date.localeCompare(b.date));
        let dateCursor = sortedExistingEvents.length > 0
            ? sortedExistingEvents[sortedExistingEvents.length - 1].date
            : (save.currentDate || new Date().toISOString().slice(0, 10));

        for (let i = 0; i < count; i += 1) {
            const location = this.pickRandom(Object.values(save.atlas || {}).filter(candidate => candidate.active !== false));
            if (!location) {
                break;
            }

            const participantCount = Math.min(availableActors.length, 1 + Math.floor(Math.random() * 3));
            const participants = participantCount > 0
                ? this.takeRandomDistinct(availableActors, Math.max(1, participantCount))
                : [];

            dateCursor = this.addDays(dateCursor, 1 + Math.floor(Math.random() * 4));
            const participantNames = participants.map(actor => actor.name);
            const eventName = this.buildEventName(location.name, participantNames);
            const locationContext = location.description?.trim()
                ? location.description.trim()
                : `A scene centered on ${location.name}.`;
            const description = participantNames.length > 0
                ? `${eventName} at ${location.name} featuring ${participantNames.join(', ')}.`
                : `${eventName} at ${location.name}.`;
            const guidance = `${eventName}. ${locationContext} Guide the skit toward the event's private purpose without exposing it to the player.`;

            generatedEvents.push({
                id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
                name: eventName,
                date: dateCursor,
                duration: [...ALL_DAY_DURATION],
                locationId: location.id,
                actorIds: participants.map(actor => actor.id),
                participantActorIds: participants.map(actor => actor.id),
                description,
                guidance: guidance,
            });
        }

        return generatedEvents;
    }

    private isFutureEvent(event: CalendarEvent): boolean {
        const save = this.getSave();
        const currentDate = save.currentDate || this.getStartingDate(save);
        const eventDate = `${event.date || ''}`.trim();
        if (!eventDate) {
            return false;
        }

        if (eventDate > currentDate) {
            return true;
        }

        if (eventDate < currentDate) {
            return false;
        }

        const currentTimeOrder = this.calendarTimeOrder(save.currentTimeOfDay || 'morning');
        const eventStartTimeOrder = this.calendarTimeOrder(this.getEventStartTimeOfDay(event));
        return eventStartTimeOrder >= currentTimeOrder;
    }

    rebuildUpcomingEvents(save: SaveType = this.getSave(), targetEventCount: number = 6): CalendarEvent[] {
        this.ensureCalendarState(save);

        const existingUpcomingEvents = (save.upcomingEvents || [])
            .filter(event => this.isFutureEvent(event))
            .sort((a, b) => this.compareCalendarEvents(a, b));

        const neededEventCount = this.areEventsEnabled() ? Math.max(targetEventCount - existingUpcomingEvents.length, 0) : 0;
        const newEvents = neededEventCount > 0 ? this.createCalendarEvents(save, neededEventCount) : [];

        save.upcomingEvents = [...existingUpcomingEvents, ...newEvents]
            .sort((a, b) => this.compareCalendarEvents(a, b));
        this.saveGame();

        return save.upcomingEvents;
    }

    private escapeRegex(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private hasExpectedResponseTags(result: string, expectedFields?: StructuredFieldDefinition[]): boolean {
        const expectedFromFields = expectedFields ? getStructuredFieldTags(expectedFields) : [];
        
        return expectedFromFields.every(tag => {
            const escapedTag = this.escapeRegex(tag);
            const tagPattern = new RegExp(`<\\s*${escapedTag}\\s*>[\\s\\S]*?<\\s*\\/\\s*${escapedTag}\\s*>`, 'i');
            return tagPattern.test(result);
        });
    }

    public async generateText(
        prompt: string,
        minTokens: number = 50,
        maxTokens: number = 500,
        expectedFields?: StructuredFieldDefinition[]
    ): Promise<string> {

        const tries = (expectedFields?.length || 0) > 0 ? 3 : 1;
        for (let attempt = 1; attempt <= tries; attempt += 1) {
            try {
                console.log(`Attempting text generation (attempt ${attempt} of ${tries})`);
                const response = await this.generator.textGen({
                    prompt: `{{messages}}${prompt.replace('{{user}}', this.getPlayerActor().name)}`,
                    min_tokens: minTokens,
                    max_tokens: maxTokens,
                    include_history: true,
                    stop: ['#END']
                });
                const result = response?.result || '';
                
                // If empty or missing expected tags or contains a large percentage (30%) of Chinese characters:
                if (!result || !this.hasExpectedResponseTags(result, expectedFields) || (result.replace(/[^\u4e00-\u9fff]/g, '').length / result.length) > 0.3) {
                    const expectedTags = expectedFields ? getStructuredFieldTags(expectedFields) : [];
                    const errorText = expectedTags.length > 0
                        ? `missing expected tags: ${expectedTags.join(', ')}`
                        : (
                            (result.replace(/[^\u4e00-\u9fff]/g, '').length / result.length) > 0.3
                                ? 'response contains too many Chinese characters'
                                : 'empty response'
                        );
                    throw new Error(`Invalid response format: ${errorText}. Response: ${result}`);
                }
                console.log('Successful text generation:', result);
                return result;
            } catch (error) {
                console.log(`Text generation attempt ${attempt} failed:`, error);
                if (attempt === tries) {
                    console.log(`Exhausted text gen retries.`);
                    throw error;
                }
            }
        }
        return ''; // Return an empty string if all attempts fail
    }

    startSkit(calendarEvent: CalendarEvent): Skit | null {
        const save = this.getSave();
        calendarEvent = this.resolveCalendarEvent(calendarEvent, save);
        const selectedLocation = save.atlas[calendarEvent.locationId];

        if (!selectedLocation) {
            return null;
        }

        let skit: Skit;

        const initialActors = Object.values(save.actors || {})
            .filter(actor => actor.id !== save.playerId && actor.active !== false)
            .filter(actor => resolveActorSchedule(actor, this.getScheduleContext(save)) === selectedLocation.id)
            .map(actor => actor.id);

        skit = new Skit({
            initialLocationId: selectedLocation.id,
            guidance: calendarEvent.guidance || calendarEvent.description,
            script: [],
            initialActors,
            summary: '',
        });

        if (!save.timeline) {
            save.timeline = [];
        }
        save.timeline.push({
            calendarEventId: calendarEvent?.id,
            date: calendarEvent?.date,
            skit,
        });

        return skit;
    }

    endSkit(): Skit | null {
        const save = this.getSave();
        const currentSkit = this.getCurrentSkit();
        if (currentSkit) {
            currentSkit.over = true;
        }
        const loreUpdatePromises: Promise<unknown>[] = [];

        // Flag additional lore updates asynchronously; the scene can finish without waiting for this request.
        this.flagLoreForUpdate(currentSkit).catch(error => {
            console.error('Error flagging lore updates for skit:', error);
        });


        // This is where various outcomes of the skit are processed and applied to the save state.
        // Outcomes are attached to the message where they occurred, so process every entry.
        console.log(`Processing outcomes for skit:`);
        const outcomes = currentSkit?.script.flatMap(entry => entry.outcomes || []) || [];
        console.log(outcomes);
        const scheduledLoreIds = new Set<string>();
        for (const outcome of outcomes) {
            switch (outcome.type) {
                case 'LORE_UPDATE':
                    // Lore revisions are intentionally started without delaying scene cleanup.
                    const loreEntry = findBestNameMatch(outcome.details?.loreTitle, save.lorebook || [], ['title']);
                    if (loreEntry && loreEntry.updatable && !scheduledLoreIds.has(loreEntry.id)) {
                        scheduledLoreIds.add(loreEntry.id);
                        loreUpdatePromises.push(updateLoreEntry(loreEntry, this, outcome.details?.guidance));
                    }
                    break;
                case 'ACTOR_STAT':
                    // For stat changes, we expect details to include an actorId, and either a statMap of numeric
                    // deltas or a statName + absoluteValue for a direct assignment (e.g. text/option stats).
                    const actorId = outcome.details?.actorId;
                    const statMap = outcome.details?.statMap || {};
                    if (actorId && save.actors?.[actorId]) {
                        const actor = save.actors[actorId];
                        const configuredStats = (this.getConfiguration(save).actorStats || []).filter(stat => stat?.name?.trim());
                        const configuredStatByName = new Map(configuredStats.map(stat => [stat.name, stat]));

                        if (outcome.details?.absoluteValue !== undefined) {
                            const incomingStatName = `${outcome.details?.statName || ''}`.trim();
                            const resolvedStat = configuredStatByName.get(incomingStatName)
                                || configuredStats.find(configured => configured.name.toLowerCase() === incomingStatName.toLowerCase());
                            if (incomingStatName && resolvedStat) {
                                actor.statMap = actor.statMap || {};
                                actor.statMap[resolvedStat.id] = this.readStatValue(outcome.details.absoluteValue, resolvedStat, save);
                            }
                            this.saveGame();
                            break;
                        }

                        for (const [stat, value] of Object.entries(statMap)) {
                            const incomingStatName = `${stat}`.trim();
                            const changeValue = Number(value);
                            if (!incomingStatName || !Number.isFinite(changeValue)) {
                                continue;
                            }

                            const resolvedStat = configuredStatByName.get(incomingStatName)
                                || configuredStats.find(configured => configured.name.toLowerCase() === incomingStatName.toLowerCase());
                            const targetStatId = resolvedStat?.id || incomingStatName;
                            actor.statMap = actor.statMap || {};
                            const existingValue = Number(resolvedStat ? this.readStatValue(actor.statMap[targetStatId], resolvedStat, save) : actor.statMap[targetStatId]);
                            const currentValue = Number.isFinite(existingValue)
                                ? existingValue
                                : (resolvedStat
                                    ? Number(normalizeStatValue(Number(resolvedStat.default) || 0, resolvedStat))
                                    : 0);
                            const nextValue = currentValue + changeValue;
                            actor.statMap[targetStatId] = resolvedStat
                                ? Number(normalizeStatValue(nextValue, resolvedStat))
                                : nextValue;
                        }
                        this.saveGame();
                    }
                    break;
                case 'PLAYER_STAT':
                    // For global/world stat changes, we expect a statName and either a numeric changeValue
                    // (delta) or an absoluteValue for a direct assignment (e.g. text/option stats).
                    const configuredGlobalStats = (this.getConfiguration(save).globalStats || []).filter(stat => stat?.name?.trim());
                    const configuredGlobalStatByName = new Map(configuredGlobalStats.map(stat => [stat.name, stat]));
                    const incomingGlobalStatName = `${outcome.details?.statName || ''}`.trim();
                    const resolvedGlobalStat = configuredGlobalStatByName.get(incomingGlobalStatName)
                        || configuredGlobalStats.find(configured => configured.name.toLowerCase() === incomingGlobalStatName.toLowerCase());
                    if (incomingGlobalStatName && resolvedGlobalStat) {
                        save.globalStatValues = save.globalStatValues || {};
                        if (outcome.details?.absoluteValue !== undefined) {
                            save.globalStatValues[resolvedGlobalStat.id] = this.readStatValue(outcome.details.absoluteValue, resolvedGlobalStat, save);
                        } else {
                            const changeValue = Number(outcome.details?.changeValue ?? 0);
                            if (Number.isFinite(changeValue) && changeValue !== 0) {
                                const existingValue = Number(this.readStatValue(save.globalStatValues[resolvedGlobalStat.id], resolvedGlobalStat, save));
                                const currentValue = Number.isFinite(existingValue)
                                    ? existingValue
                                    : Number(normalizeStatValue(Number(resolvedGlobalStat.default) || 0, resolvedGlobalStat));
                                save.globalStatValues[resolvedGlobalStat.id] = Number(normalizeStatValue(currentValue + changeValue, resolvedGlobalStat));
                            }
                        }
                        this.saveGame();
                    }
                    break;
                case 'NEW_EVENT':
                    // For new events, we expect details to include the event data.
                    const newEvent = this.areEventsEnabled() ? this.buildCalendarEventFromOutcome(outcome.details, save) : null;
                    if (newEvent) {
                        save.upcomingEvents = save.upcomingEvents || [];
                        save.upcomingEvents.push(...this.expandRecurringEvent(newEvent));
                        this.saveGame();
                    }
                    break;
            }
        }
        Promise.all(loreUpdatePromises).catch(error => {
            console.error('Error processing skit lore updates:', error);
        });
        
        // Generate a summary. No need to wait.
        this.summaryCheck();

        // Increment time or tick over the day: calendar-event skits jump to the slot after the
        // event's duration; other skits (e.g. plain location visits) just advance one slot.
        const timelineEntry = (save.timeline || []).find(entry => entry.skit === currentSkit);
        const currentDate = save.currentDate || this.getStartingDate(save);
        const currentTimeOfDay = save.currentTimeOfDay || 'morning';
        const nextSkit = timelineEntry?.calendarEventId
            ? this.advanceTimeToNextSlot(save, timelineEntry.date || currentDate, timelineEntry.calendarEventEndTimeOfDay || currentTimeOfDay)
            : this.advanceTimeToNextSlot(save, currentDate, currentTimeOfDay);

        this.rebuildUpcomingEvents(save)
        if (this.areEventsEnabled()) {
            this.showPriorityMessage('Calendar updated with new upcoming events.');
        }

        if (nextSkit) {
            save.timeline.push({ date: save.currentDate, skit: nextSkit });
        }
        this.saveGame();

        if (nextSkit) {
            return nextSkit;
        }
        const mandatoryEvent = this.getCurrentMandatoryEvent(save);
        return mandatoryEvent ? this.startCalendarEventSkit(mandatoryEvent.id) : null;
    }

    // Callback to show priority messages in the tooltip bar
    private priorityMessageCallback?: (message: string, icon?: any, durationMs?: number) => void;

    /**
     * Register a callback to show priority messages in the tooltip bar.
     * This is typically set by the App component that has access to the TooltipContext.
     */
    setPriorityMessageCallback(callback: (message: string, icon?: any, durationMs?: number) => void) {
        this.priorityMessageCallback = callback;
    }

    /**
     * Show a priority message in the tooltip bar that temporarily overrides normal tooltips.
     * @param message The message to display
     * @param icon Optional icon to show with the message
     * @param durationMs How long to show the message (default: 5000ms)
     */
    showPriorityMessage(message: string, icon?: any, durationMs: number = 5000) {
        if (this.priorityMessageCallback) {
            this.priorityMessageCallback(message, icon, durationMs);
        } else {
            console.warn('Priority message callback not set:', message);
        }
    }

    async makeImage(imageRequest: any, defaultUrl: string): Promise<string> {
        if (this.getConfiguration().artStyle) {
            imageRequest.prompt = `${imageRequest.prompt || ''}\nArt Style: ${this.getConfiguration().artStyle}`;
        }
        return (await this.generator.makeImage(imageRequest))?.url ?? defaultUrl;
    }

    async makeImageFromImage(imageToImageRequest: any, defaultUrl: string): Promise<string> {
        /*if (this.getConfiguration().artStyle) {
            imageToImageRequest.prompt = `${imageToImageRequest.prompt || ''}\nArt Style: ${this.getConfiguration().artStyle}`;
        }*/
        const finalRequest = {
            remove_background: false,
            transfer_type: 'edit',
            ...imageToImageRequest
        }
        const imageUrl = (await this.generator.imageToImage(finalRequest))?.url ?? defaultUrl;
        if (finalRequest.remove_background && finalRequest.transfer_type == 'edit' && imageUrl != defaultUrl) {
            try {
                return this.removeBackground(imageUrl);
            } catch (exception: any) {
                console.error(`Error removing background from image, error`, exception);
                return imageUrl;
            }
        }
        return imageUrl;
    }

    async removeBackground(imageUrl: string, options: { throwOnError?: boolean } = {}) {
        try {
            const response = await this.generator.removeBackground({image: imageUrl});
            if (options.throwOnError && (!response?.url || response.url === imageUrl)) {
                throw new Error('Background removal did not return an updated image.');
            }
            return response?.url ?? imageUrl;
        } catch (error) {
            console.error(`Error removing background`, error);
            if (options.throwOnError) {
                throw error;
            }
            return imageUrl;
        }
    }

    async uploadFile(fileName: string, file: File): Promise<string> {
        // Don't honor file's name; want to overwrite existing content that may have had a different actual name.
        // TODO: Maybe check if this actually overwrites the way I hope it does.
        const updateResponse = await this.storage.set(fileName, file).forUser();
        if (!updateResponse.data || updateResponse.data.length == 0) {
            throw new Error('Failed to upload file to storage.');
        }
        console.log('Uploaded file:');
        console.log(updateResponse);
        return updateResponse.data[0].value;
    }

    private buildActiveSettingContextSummary(save: SaveType): string {
        const agendaConfig = this.getConfiguration();
        const settingControls = (agendaConfig?.controls || []).filter((control) => control.active !== false && control.type === 'settings');
        if (!agendaConfig?.globalStats?.length) {
            return 'No player stat context is active.';
        }

        const settingsByStatId = new Map(settingControls.map((control) => [control.statId, control]));
        const lines: string[] = [];
        for (const stat of agendaConfig.globalStats) {
            const control = settingsByStatId.get(stat.id);
            const statName = (stat.name || '').trim();
            if (!statName) {
                continue;
            }

            const value = this.readStatValue(save.globalStatValues?.[stat.id], stat, save);
            const selectedOption = stat.type === 'option' ? findStatOptionByValue(stat, value) : undefined;
            const valueText = formatStatOptionValueText(stat, value) || (isReferenceStatType(stat.type)
                ? formatReferenceStatText(stat, value, { actors: save.actors, items: save.inventory, locations: save.atlas })
                : (typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : value)));

            if (stat.type === 'option') {
                const optionDescription = resolveStatText(selectedOption?.option.description, this).trim();
                const line = [
                    `${statName}: ${valueText}`,
                    resolveStatText(control?.description, this).trim(),
                    optionDescription,
                ].filter(Boolean).join('\n');
                lines.push(line);
                continue;
            }

            const line = [
                `${statName}: ${valueText}`,
                resolveStatText(control?.description, this).trim(),
            ].filter(Boolean).join('\n');
            lines.push(line);
        }

        return lines.length > 0 ? lines.join('\n\n') : 'No player stat context is active.';
    }

    private async flagLoreForUpdate(skit?: Skit | null): Promise<void> {
        if (!skit?.script?.length) {
            return;
        }

        const save = this.getSave();
        const loreEntries = (save.lorebook || []).filter(lore => lore.enabled && lore.updatable);
        if (loreEntries.length === 0) {
            return;
        }

        const alreadyFlagged = new Set(
            skit.script
                .flatMap(entry => entry.outcomes || [])
                .filter(outcome => outcome.type === 'LORE_UPDATE')
                .map(outcome => `${outcome.details?.loreTitle || ''}`.trim().toLowerCase())
                .filter(Boolean),
        );
        const generationKey = `flagLoreForUpdate-${skit.id}`;
        const generationPromise = this.generateText(
            buildPrompt()
                .addBlock('Instructions',
                    `Review the completed skit and identify existing lore entries whose content may now be incomplete, inaccurate, or missing important information because of what happened in the scene. ` +
                    `Only select entries that genuinely need revision. Do not invent lore entries, and do not select an entry merely because it was mentioned. ` +
                    `For every selected entry, provide concise, specific guidance for revising that entry. If no entries require revision, return an empty <LoreUpdates></LoreUpdates> block.`
                )
                .addBlock('Response Format',
                    `<LoreUpdates>\n` +
                    `  <LoreUpdate><Entry>Exact Lore Entry Title</Entry><Guidance>Specific information to add, remove, or revise based on the scene.</Guidance></LoreUpdate>\n` +
                    `  <!-- Repeat LoreUpdate for each entry that requires revision. -->\n` +
                    `</LoreUpdates>\n#END#`
                )
                .addBlock('Example Response',
                    `<LoreUpdates>\n` +
                    `  <LoreUpdate><Entry>The Shells</Entry><Guidance>Add that the expedition uncovered a Coral Razor and record the disagreement over how the threat should be handled.</Guidance></LoreUpdate>\n` +
                    `  <LoreUpdate><Entry>Cyanea</Entry><Guidance>Update her recent history to include the expedition and her changed understanding of the Coral Razor.</Guidance></LoreUpdate>\n` +
                    `</LoreUpdates>\n#END#`
                )
                .addBlock('Lore Entries Available for Revision',
                    loreEntries.map(lore => `${lore.title}:\n${lore.content}`).join('\n\n')
                )
                .addBlock('Skit Content', buildScriptLog(skit, [], this))
                .addBlock('Additional Context', generateContext(skit, this, 3))
                .format(),
            20,
            2000,
        ).then(response => {
            const parsed = parseXmlTagsToObjects(response);
            const rawUpdates = parsed?.LoreUpdates?.LoreUpdate ?? parsed?.LoreUpdate ?? [];
            const loreUpdates = Array.isArray(rawUpdates) ? rawUpdates : [rawUpdates];
            const scheduled = new Set<string>(alreadyFlagged);

            for (const loreUpdate of loreUpdates) {
                const loreName = `${loreUpdate?.Entry || loreUpdate?.entry || ''}`.trim();
                const guidance = `${loreUpdate?.Guidance || loreUpdate?.guidance || ''}`.trim();
                if (!loreName || !guidance) {
                    continue;
                }

                const loreEntry = findBestNameMatch(loreName, loreEntries, ['title']);
                const loreKey = loreEntry?.title.trim().toLowerCase() || '';
                if (!loreEntry || !loreKey || scheduled.has(loreKey)) {
                    continue;
                }

                scheduled.add(loreKey);
                console.log(`Lore update flagged for "${loreEntry.title}" after skit review.`);
                updateLoreEntry(loreEntry, this, guidance).catch(error => {
                    console.error(`Error updating lore entry ${loreEntry.title}`, error);
                });
            }
        }).finally(() => {
            delete this.generationPromises[generationKey];
        });

        this.generationPromises[generationKey] = generationPromise;
        await generationPromise;
    }

    private buildLoreUpdateCandidatePrompt(save: SaveType, candidateActors: Actor[]): string {
        const playerActor = this.getPlayerActor();
        const playerIdentity = [playerActor?.name, playerActor?.profile || playerActor?.description]
            .filter(Boolean)
            .join(': ') || 'No player identity established yet.';

        return buildPrompt()
            .addBlock('Instructions',
                `This is a preparatory request to review existing character profiles for a narrative game. ` +
                `Identify the top twenty characters, if any, that require profile revision to account for the player's identity, role, stats, or choices established below. ` +
                `Many—probably most—characters will require no substantial change; focus on selecting only those whose profiles clearly conflict with or would greatly benefit from this context.`)
            .addBlock('Player Identity', playerIdentity)
            .addBlock('Active Configuration Context', this.buildActiveSettingContextSummary(save))
            .addBlock('Available Characters', candidateActors.map(actor =>
                `${actor.name}: ${actor.profile || actor.description || 'No profile available.'}`,
            ))
            .addBlock('Response Format',
                `<Reasoning>Brief explanation of which characters, if any, have profile details that should be revised to reflect the player's identity, role, or choices.</Reasoning>\n` +
                `<Characters>\n` +
                `<Character>Character Name: specific guidance for the profile revision.</Character>\n` +
                `<!-- Repeat the Character element once for each character whose profile should be updated. Leave Characters empty if none apply. -->\n` +
                `</Characters>\n` +
                `#END#`,
            )
            .addBlock('Example Response',
                `System:\n` +
                `<Reasoning>Mirel's profile treats the player as a stranger, but the player is established as her employer, so her profile should be updated to reflect that relationship.</Reasoning>\n` +
                `<Characters>\n` +
                `<Character>Mirel: Update her profile to reflect that the player is now her employer and that she has begun relying on them for access to old transit hubs.</Character>\n` +
                `</Characters>\n` +
                `#END#`,
            )
            .format();
    }

    // Identifies which existing characters' lore/profile should be revised to reflect the player's established identity, role, or choices.
    private async identifyActorsNeedingLoreUpdate(save: SaveType): Promise<LoreUpdateCandidate[]> {
        
        const candidateActors = Object.values(save.actors || {})
            .filter(actor => actor.id !== save.playerId)
            .filter(actor => getLinkedActorLore(actor, this)?.updatable);

        if (candidateActors.length === 0) {
            return [];
        }

        // Add promise to the stage's generationPromises to track this operation.
        this.generationPromises[`identifyActorsNeedingLoreUpdate-${save.playerId}`] = new Promise(() => {});

        const response = await this.generateText(
            this.buildLoreUpdateCandidatePrompt(save, candidateActors),
            20,
            2000,
            LORE_UPDATE_CANDIDATE_FIELDS,
        );

        const parsed = parseStructuredResponse(response, LORE_UPDATE_CANDIDATE_FIELDS);
        const characterGuidanceText = parsed['characterGuidance'] || '';
        const taggedCharacterGuidance = Array.from(characterGuidanceText.matchAll(
            /<\s*Character\s*>([\s\S]*?)<\s*\/\s*Character\s*>/gi,
        )).map(match => match[1].trim());
        const candidateGuidance = (taggedCharacterGuidance.length > 0 ? taggedCharacterGuidance : characterGuidanceText.split('\n'))
            .map(line => line.trim())
            .filter(Boolean);

        const matchedActors: LoreUpdateCandidate[] = [];
        for (const line of candidateGuidance) {
            const separatorIndex = line.indexOf(':');
            if (separatorIndex <= 0) {
                continue;
            }

            const name = line.slice(0, separatorIndex).trim();
            const guidance = line.slice(separatorIndex + 1).trim();
            if (!name || !guidance) {
                continue;
            }

            const matchedActor = findBestNameMatch(name, candidateActors, ['name']);
            if (matchedActor && !matchedActors.some(candidate => candidate.actor === matchedActor)) {
                matchedActors.push({ actor: matchedActor, guidance });
            }
        }

        delete this.generationPromises[`identifyActorsNeedingLoreUpdate-${save.playerId}`];
        return matchedActors;
    }

    // Runs updateLoreEntry() for the given actors' linked lore, limiting how many run concurrently.
    private async runLoreUpdatesWithConcurrency(candidates: LoreUpdateCandidate[], concurrency: number = 3): Promise<void> {
        const queue = [...candidates];
        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            let candidate: LoreUpdateCandidate | undefined;
            while ((candidate = queue.shift())) {
                const loreEntry = getLinkedActorLore(candidate.actor, this);
                if (!loreEntry) {
                    continue;
                } else {
                    console.log(`Updating lore entry for actor ${candidate.actor.name}`);
                    if (this.getSave()?.lorebook?.includes(loreEntry)) {
                        console.log(`Lore entry for actor ${candidate.actor.name} is present in the lorebook.`);
                    }
                    if (this.getConfiguration()?.lorebook?.includes(loreEntry)) {
                        console.log(`Lore entry for actor ${candidate.actor.name} is present in the configured lorebook.`);
                    }  
                }
                await updateLoreEntry(loreEntry, this, candidate.guidance).catch(error => {
                    console.error(`Error updating lore entry for actor ${candidate?.actor.name}`, error);
                });
            }
        });
        await Promise.all(workers);
    }

    private buildActorSeedPrompt(save: SaveType, existingActorNames: string[]): string {
        return buildPrompt()
            .addBlock('Instructions',
                `This is a preparatory request for generating one new supporting character for a narrative game. ` +
                `Create an original character who fits the world and avoids duplicating other characters or the player.` +
                `Keep it grounded within the constraints of the setting.`)
            .addBlock('Active Configuration Context', this.buildActiveSettingContextSummary(save))
            .addBlock('Existing Character Names', existingActorNames.join(', '))
            .addBlock('Response Format', buildStructuredResponseFormat(ACTOR_SEED_FIELDS, { includeEndTag: true }))
            .addBlock('Example Response',
                buildStructuredExampleResponse(
                    ACTOR_SEED_FIELDS,
                    {
                        name: 'Mirel',
                        profile: 'Mirel is observant, practical, and quietly theatrical when she tells stories. She scavenges old transit hubs for useful artifacts and treats every social exchange like a puzzle. She wants status but fears becoming dependent on anyone.',
                        description: 'A lean woman with short copper hair, soot-smudged skin, and alert amber eyes. She wears layered expedition gear with salvaged metallic charms and a patched hooded cloak.',
                    },
                    { includeEndTag: true },
                ))
            .format();
    }

    async summaryCheck() {
        const save = this.getSave();
        // Look at past skits (starting from the beginning), and find one that doesn't have a summary, to generate:
        const skitToSummarize = (save.timeline || []).find(entry => entry.skit && !entry.skit.summary)?.skit;
        if (skitToSummarize) {
            console.log(`Summarizing an old skit.`);
            generateSkitSummary(skitToSummarize, this).then(summary => {
                if (summary) {
                    this.saveGame();
                }
            });
        }
    }

    async generateTitleImage() {
        const configuration = this.getConfiguration();
        const titleImagePrompt = buildPrompt()
            .addBlock('Instructions',
                `${configuration.titleImagePrompt || ''}` +
                `The game is titled "${configuration.title}".`,
            )
            .format();
        const imageUrl = await this.makeImage({ prompt: titleImagePrompt, aspect_ratio: AspectRatio.WIDESCREEN_HORIZONTAL, remove_background: true }, configuration.titleImageUrl || '');
        return imageUrl;
    }

    async generateBackgroundImage() {
        const configuration = this.getConfiguration();
        const backgroundImagePrompt = buildPrompt()
            .addBlock('Instructions',
                `${configuration.backgroundImagePrompt || ''}` +
                `The game is titled "${configuration.title}".`,
            )
            .format();
        const imageUrl = await this.makeImage({ prompt: backgroundImagePrompt, aspect_ratio: AspectRatio.WIDESCREEN_HORIZONTAL }, configuration.backgroundImageUrl || '');
        return imageUrl;
    }

    loadActors() {
        if (Object.keys(this.generationPromises).includes('loadActors')) {
            return this.generationPromises['loadActors'];
        }

        const save = this.getSave();
        const configuredActors = this.getConfiguration().actors || [];
        const configuredActorStats = this.getConfiguration().actorStats || [];

        // Seed actors from the game configuration first.
        for (const configuredActor of configuredActors) {
            const newActor = new Actor({
                ...configuredActor,
                statMap: configuredActor?.statMap && typeof configuredActor.statMap === 'object'
                    ? { ...configuredActor.statMap }
                    : {},
            });

            if (!save.actors[newActor.id]) {
                applyActorInitialStats(newActor, configuredActorStats, this.getScheduleContext(save));
                save.actors[newActor.id] = newActor;
            }
        }

        this.syncActorStats(save);

        this.saveGame();
    }

    isVerticalLayout(): boolean {
        // Determine if the layout should be vertical based on window aspect ratio
        // Vertical layout when height > width (portrait orientation)
        return window.innerHeight > window.innerWidth;
    }


    // Gathers the same portable configuration content that GameManagementPanel exports as JSON, so it can be
    // pushed to or pulled from storage.
    private buildPortableConfiguration(): PortableGameConfiguration {
        const configuration = this.getConfiguration();

        return buildPortableGameConfiguration({
            versionId: configuration.versionId,
            artStyle: configuration.artStyle,
            universalSchedule: configuration.universalSchedule,
            title: configuration.title,
            titleImageUrl: configuration.titleImageUrl,
            titleImagePrompt: configuration.titleImagePrompt,
            backgroundImageUrl: configuration.backgroundImageUrl,
            backgroundImagePrompt: configuration.backgroundImagePrompt,
            creatorNotes: configuration.creatorNotes,
            versionNotes: configuration.versionNotes,
            startingDate: configuration.startingDate,
            actorStats: configuration.actorStats,
            locationStats: configuration.locationStats,
            itemStats: configuration.itemStats,
            globalStats: configuration.globalStats,
            functions: configuration.functions,
            statUpdateRules: configuration.statUpdateRules,
            actors: (configuration.actors || []).filter(actor => actor.active !== false),
            locations: (configuration.locations || []).filter(location => location.active !== false),
            items: (configuration.items || []).filter(item => item.active !== false),
            maps: (configuration.maps || []).filter(map => map.active !== false),
            lorebook: configuration.lorebook || [],
            calendarEvents: configuration.calendarEvents || [],
            uiSettings: configuration.uiSettings,
            castActorIds: configuration.castActorIds || [],
            controls: (configuration.controls || []).filter((control) => control.active !== false),
            slideshowLocationIds: configuration.slideshowLocationIds || [],
            dateMode: configuration.dateMode,
            timeMode: configuration.timeMode,
            useEvents: configuration.useEvents,
        });
    }

    // Storage functionality
    // Creators work from chat state so unpublished changes are never overwritten by the published configuration.
    async readStageConfiguration(speakerIds: string[] = []): Promise<void> {
        if (this.isOwner) {
            return;
        }
        console.log('Attempting to read stage configuration');
        const characterIds = speakerIds.length ? speakerIds : [this.primaryCharacter.anonymizedId];
        const response = await this.storage.get('agenda_configuration').forCharacters(characterIds);
        const storageError = getStorageError(response);
        if (storageError) throw new Error(`Failed to read the published configuration: ${storageError}`);
        // response.data is a list of StorageDatum entries; the stored configuration lives in an entry's `value`.
        const entries = Array.isArray(response?.data) ? response.data : [];
        const storedContent = entries.find((entry: any) => entry?.key === 'agenda_configuration' && entry.value)?.value;

        console.log('Stored stage configuration:');
        console.log(storedContent);

        // If there was content, load it as the game's configuration so new games use the latest saved content.
        if (storedContent && typeof storedContent === 'object') {
            console.log('Should load configuration');
            const updates = storedContent as Partial<GameConfiguration>;
            this.updateConfiguration({ ...updates, versionId: updates.versionId }, true);
            const result = await this.messenger.updateChatState(this.saveData);
            if (!result.success) {
                throw new Error(result.error || 'Failed to persist the downloaded configuration.');
            }
        }
    }


    // Pushes the chat-state configuration to global storage so other users pick it up. Only the owner can publish.
    async publishStageConfiguration(): Promise<boolean> {
        if (!this.isOwner) {
            return false;
        }
        try {
            const portableConfiguration = this.buildPortableConfiguration();
            portableConfiguration.versionId = uuidv4();
            const response = await this.storage.set('agenda_configuration', portableConfiguration).forCharacterSensitive(this.primaryCharacter.anonymizedId);
            console.log(response);
            const storageError = getStorageError(response);
            if (storageError) throw new Error(storageError);
            this.saveData.configuration.versionId = portableConfiguration.versionId;
            const result = await this.messenger.updateChatState(this.saveData);
            if (!result.success) {
                throw new Error(result.error || 'Failed to persist the published configuration version.');
            }
            return true;
        } catch (error) {
            console.error(`Error publishing stage configuration: ${error}`);
            return false;
        }
    }


    render(): ReactElement {
        return <BaseScreen stage={() => this}/>;
    }

}
