import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, User, Character, AspectRatio} from "@chub-ai/stages-ts";
import { ConditionCollection, ConditionContext, evaluateConditionCollections } from "./content/Condition";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import { Actor, ACTOR_SCHEDULE_AVAILABLE, ActorSchedule, applyActorInitialStats, cloneActorSchedule, findBestNameMatch, loadSupportedActor, resolveActorSchedule, ScheduleContext } from "./content/Actor";
import { Stat, StatType, StatValue, StatUpdate, StatUpdateRule, applyStatUpdateValue, cloneStat, cloneStatUpdateRules, normalizeStatValue, resolveStatValueRule, resolveStatText } from './content/Stat';
import { ALL_DAY_DURATION, CalendarEvent, CalendarEventRecurrence, CalendarEventRecurrenceFrequency, CalendarTimeOfDay } from "./content/CalendarEvent";
import { Item } from "./content/Item";
import { generateContext, generateSkitScript, Skit } from "./content/Skit";
import { createDefaultAtlas, isLocationAvailable, Location } from "./content/Location";
import { Map as GameMap } from "./content/Map";
import { cloneUiSettings, DEFAULT_UI_SETTINGS, UiSettings } from './content/Style';
import { BaseScreen } from "./screens/BaseScreen";
import { createLoreEntry, Lore, updateLoreEntry } from "./content/Lore";
import { DEFAULT_PLAYER_THEME_COLOR } from "./screens/SettingsScreen";
import {buildPrompt} from "./utils/PromptBuilder.js";
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    getStructuredFieldTags,
    parseStructuredResponse,
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
    playerId: string;
    actors: {[key: string]: Actor};
    atlas: {[key: string]: Location};
    maps: GameMap[];
    universalSchedule: ActorSchedule;
    inventory: Item[];
    timeline: TimelineEntry[];
    timestamp: number; // Time of last save
    textToSpeech?: boolean;
    enableImpersonation?: boolean;
    enableFontEffects?: boolean;
    enableTextToSpeech?: boolean;
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
        label: 'NAME',
        description: 'A distinct first name for the character.',
    },
    {
        key: 'profile',
        label: 'PROFILE',
        description: '2-4 sentences describing personality, motives, or social role.',
    },
    {
        key: 'description',
        label: 'DESCRIPTION',
        description: '1-3 sentences describing key visual traits to guide character art generation.',
    },
];

const INTRO_SKIT_FIELDS: StructuredFieldDefinition[] = [
    {
        key: 'guidance',
        label: 'GUIDANCE',
        description: 'A concise intro scene direction that establishes the world, tone, and immediate hook for the player.',
    },
    {
        key: 'location',
        label: 'LOCATION',
        description: 'A single location name selected from Available Locations.',
    },
    {
        key: 'participants',
        label: 'PARTICIPANTS',
        description: 'Comma-separated character names selected from Available Characters who should be present in the intro.',
    },
];

const CALENDAR_TIME_ORDER: CalendarTimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

// Upper bound on how many in-game periods a single calendar advance will replay stat update rules for, so a
// large jump (or malformed dates) cannot spin indefinitely.
const MAX_STAT_UPDATE_PERIODS = 128;

// Represents a configuration that is used to initialize new games, but can also influence existing games.
export type GameConfiguration = {
    
    actors: Actor[], // All defined actors for a new game
    locations: Location[], // All defined locations for a new game
    maps: GameMap[], // All defined maps for a new game
    universalSchedule: ActorSchedule, // Universal schedule for all actors (applies to current and new games)
    lorebook: Lore[], // Lore entries to seed into new games
    calendarEvents: CalendarEvent[], // Calendar event series definitions to seed into new games
    actorStats: Stat[], // All custom actor stats and defaults (applies to current and new games)
    locationStats: Stat[], // All custom location stats and defaults (applies to current and new games)
    globalStats: Stat[], // Stats that apply to the game in general (player or world state)
    globalStatValues: {[key: string]: StatValue}, // Selected/default values for global stats
    statUpdateRules: StatUpdateRule[], // Recurring stat changes applied as in-game time advances
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

}

const cloneActor = (actor: Actor): Actor => new Actor({
    ...actor,
    outfits: (actor.outfits || []).map(outfit => ({
        ...outfit,
        prompts: { ...(outfit.prompts || {}) },
        emotionPack: { ...(outfit.emotionPack || {}) },
    })),
    statMap: actor.statMap && typeof actor.statMap === 'object' ? { ...actor.statMap } : {},
});

const cloneLocation = (location: Location): Location => new Location({
    ...location,
    focalPoint: location.focalPoint ? { ...location.focalPoint } : undefined,
    statMap: location.statMap && typeof location.statMap === 'object' ? { ...location.statMap } : {},
});

const cloneMap = (map: GameMap): GameMap => new GameMap({
    ...map,
    links: (map.links || []).map((link) => ({
        ...link,
        coordinates: { ...link.coordinates },
    })),
});

const cloneLore = (entry: Lore): Lore => ({
    ...entry,
    triggers: [...(entry.triggers || [])],
    conditionCollections: (entry.conditionCollections || []).map((collection) => [...collection]),
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
    skit?: Skit;
}

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    readonly SAVE_SLOT_COUNT = 10;
    readonly INITIAL_ACTORS = 5;

    saveData: ChatStateType;
    primaryUser: User;
    primaryCharacter: Character;
    generationPromises: {[key: string]: Promise<any|void>} = {};
    anticipatedLoadingPromiseCount: number = 4;

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
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
            maps: [],
            universalSchedule: {},
            lorebook: [],
            calendarEvents: [],
            actorStats: [],
            locationStats: [],
            globalStats: [],
            globalStatValues: {},
            statUpdateRules: [],
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
                maps: (activeSave?.maps || []).map(cloneMap),
                universalSchedule: cloneActorSchedule(activeSave?.universalSchedule),
                lorebook: (activeSave?.lorebook || []).map(cloneLore),
                calendarEvents: [],
                actorStats: (this.getConfiguration()?.actorStats || []).map(cloneStat),
                locationStats: (this.getConfiguration()?.locationStats || []).map(cloneStat),
                globalStats: (this.getConfiguration()?.globalStats || []).map(cloneStat),
                globalStatValues: { ...(activeSave?.globalStatValues || {}) },
                statUpdateRules: cloneStatUpdateRules(this.getConfiguration()?.statUpdateRules),
                uiSettings: cloneUiSettings(activeSave?.uiSettings || {}),
            };
            this.syncUniversalSchedule();
            return;
        }

        this.saveData.configuration = {
            actors: (this.saveData.configuration.actors || defaultConfiguration.actors).map(cloneActor),
            locations: (this.saveData.configuration.locations || defaultConfiguration.locations).map(cloneLocation),
            maps: (this.saveData.configuration.maps || defaultConfiguration.maps).map(cloneMap),
            universalSchedule: cloneActorSchedule(this.saveData.configuration.universalSchedule),
            lorebook: (this.saveData.configuration.lorebook || defaultConfiguration.lorebook).map(cloneLore),
            calendarEvents: (this.saveData.configuration.calendarEvents || defaultConfiguration.calendarEvents).map(cloneCalendarEvent),
            actorStats: (this.saveData.configuration.actorStats || defaultConfiguration.actorStats).map(cloneStat),
            locationStats: (this.saveData.configuration.locationStats || defaultConfiguration.locationStats).map(cloneStat),
            globalStats: (this.saveData.configuration.globalStats || defaultConfiguration.globalStats).map(cloneStat),
            globalStatValues: { ...(this.saveData.configuration.globalStatValues || defaultConfiguration.globalStatValues) },
            statUpdateRules: cloneStatUpdateRules(this.saveData.configuration.statUpdateRules),
            uiSettings: cloneUiSettings(this.saveData.configuration.uiSettings || defaultConfiguration.uiSettings),
            startingDate: this.saveData.configuration.startingDate || defaultConfiguration.startingDate,
            title: this.saveData.configuration.title || defaultConfiguration.title,
            titleImageUrl: this.saveData.configuration.titleImageUrl || defaultConfiguration.titleImageUrl,
            titleImagePrompt: this.saveData.configuration.titleImagePrompt || defaultConfiguration.titleImagePrompt,
            backgroundImageUrl: this.saveData.configuration.backgroundImageUrl || defaultConfiguration.backgroundImageUrl,
            backgroundImagePrompt: this.saveData.configuration.backgroundImagePrompt || defaultConfiguration.backgroundImagePrompt,
            artStyle: this.saveData.configuration.artStyle || defaultConfiguration.artStyle,
            creatorNotes: this.saveData.configuration.creatorNotes || defaultConfiguration.creatorNotes,
            versionNotes: this.saveData.configuration.versionNotes || defaultConfiguration.versionNotes,
        };

        this.syncUniversalSchedule();
    }

    // The universal schedule lives on the configuration but is mirrored into every save so it can be resolved from save context.
    private syncUniversalSchedule() {
        this.saveData.saves.forEach((save) => {
            if (save) {
                save.universalSchedule = cloneActorSchedule(this.saveData.configuration.universalSchedule);
            }
        });
    }

    getConfiguration(): GameConfiguration {
        this.ensureChatState();
        return this.saveData.configuration;
    }

    // Builds a ScheduleContext from a save, adding the stat definitions needed to resolve schedule entries
    // that point at a location-type ActorStat rather than a fixed location id.
    getScheduleContext(save: SaveType): ScheduleContext {
        const configuration = this.getConfiguration();
        return { ...save, globalStats: configuration.globalStats, actorStats: configuration.actorStats };
    }

    updateConfiguration(updates: Partial<GameConfiguration>) {
        this.ensureChatState();
        const current = this.saveData.configuration;
        this.saveData.configuration = {
            ...current,
            ...updates,
            title: updates.title ?? current.title ?? 'Agenda VN',
            titleImageUrl: updates.titleImageUrl ?? current.titleImageUrl ?? '',
            titleImagePrompt: updates.titleImagePrompt ?? current.titleImagePrompt ?? '',
            backgroundImageUrl: updates.backgroundImageUrl ?? current.backgroundImageUrl ?? '',
            backgroundImagePrompt: updates.backgroundImagePrompt ?? current.backgroundImagePrompt ?? '',
            actors: (updates.actors ?? current.actors ?? []).map(cloneActor),
            locations: (updates.locations ?? current.locations ?? []).map(cloneLocation),
            maps: (updates.maps ?? current.maps ?? []).map(cloneMap),
            universalSchedule: cloneActorSchedule(updates.universalSchedule ?? current.universalSchedule),
            lorebook: (updates.lorebook ?? current.lorebook ?? []).map(cloneLore),
            calendarEvents: (updates.calendarEvents ?? current.calendarEvents ?? []).map(cloneCalendarEvent),
            actorStats: (updates.actorStats ?? current.actorStats ?? []).map(cloneStat),
            locationStats: (updates.locationStats ?? current.locationStats ?? []).map(cloneStat),
            globalStats: (updates.globalStats ?? current.globalStats ?? []).map(cloneStat),
            globalStatValues: { ...(updates.globalStatValues ?? current.globalStatValues ?? {}) },
            statUpdateRules: cloneStatUpdateRules(updates.statUpdateRules ?? current.statUpdateRules),
            uiSettings: cloneUiSettings(updates.uiSettings ?? current.uiSettings ?? DEFAULT_UI_SETTINGS),
            startingDate: updates.startingDate ?? current.startingDate,
        };

        const currentSave = this.saveData.saves[this.saveData.lastSaveSlot];
        if (currentSave) {
            currentSave.globalStatValues = { ...(this.saveData.configuration.globalStatValues || {}) };
            this.syncActorStats(currentSave);
            this.syncLocationStats(currentSave);
            this.syncGlobalStats(currentSave);
        }
        this.syncUniversalSchedule();
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

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

    generateFreshSave(playerData: {name: string, personality: string, themeColor?: string}): SaveType {
        const configuration = this.getConfiguration();
        const startingDate = configuration.startingDate || new Date().toISOString().slice(0, 10);

        const actors: {[key: string]: Actor} = {
                [this.primaryUser.anonymizedId]: {
                    id: this.primaryUser.anonymizedId,
                    loreId: '',
                    active: true,
                    name: playerData.name,
                    displayName: playerData.name,
                    role: '',
                    birthDate: '',
                    description: '',
                    background: '',
                    profile: playerData.personality,
                    category: '',
                    outfits: [],
                    outfitId: '',
                    statMap: {},
                    statInitialMap: {},
                    perActorStatMap: {},
                    perActorValueRules: {},
                    schedule: {},
                    themeColor: playerData.themeColor || DEFAULT_PLAYER_THEME_COLOR,
                    themeFontFamily: '',
                    voiceId: ''
                },
            };

        (configuration.actors || [])
            .filter(actor => actor?.active !== false)
            .forEach((configuredActor) => {
                const seededActor = cloneActor(configuredActor);
                if (seededActor.id !== this.primaryUser.anonymizedId) {
                    actors[seededActor.id] = seededActor;
                }
            });

        const atlas: {[key: string]: Location} = createDefaultAtlas();
        (configuration.locations || [])
            .filter(location => location?.active !== false)
            .forEach((configuredLocation) => {
                const seededLocation = cloneLocation(configuredLocation);
                atlas[seededLocation.id] = seededLocation;
            });

        const draftSaveContext = {
            playerId: this.primaryUser.anonymizedId,
            actors,
            atlas,
            maps: (configuration.maps || []).filter(map => map.active !== false).map(cloneMap),
            universalSchedule: cloneActorSchedule(configuration.universalSchedule),
            inventory: [],
            timeline: [],
            timestamp: Date.now(),
        } as SaveType;

        const seededEvents = (configuration.calendarEvents || []).flatMap(event =>
            this.expandRecurringEvent(this.normalizeCalendarEventForSave(cloneCalendarEvent(event), draftSaveContext)),
        );

        // Resolve each global stat's starting value from its defaultValueRules (first match wins), falling
        // back to the configured value/default; used to seed a brand new save.
        const configuredGlobalStats = (configuration.globalStats || []).filter(stat => stat?.name?.trim());
        const globalStatValues: { [key: string]: StatValue } = {};
        const globalStatContext: ConditionContext = {
            actors: Object.values(actors),
            globalStats: configuration.globalStats,
            actorStats: configuration.actorStats,
            globalStatValues,
        };
        configuredGlobalStats.forEach((stat) => {
            const ruleValue = resolveStatValueRule(stat.defaultValueRules, stat, globalStatContext);
            globalStatValues[stat.id] = ruleValue !== undefined
                ? ruleValue
                : normalizeStatValue(configuration.globalStatValues?.[stat.id], stat);
        });

        return {playerId: this.primaryUser.anonymizedId,
            actors,
            atlas,
            maps: (configuration.maps || []).filter(map => map.active !== false).map(cloneMap),
            universalSchedule: cloneActorSchedule(configuration.universalSchedule),
            inventory: [],
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

    startNewGame(playerData: {name: string, data: Partial<SaveType>, personality: string, themeColor?: string}) {
        // Insert a dummy promise into generationPromises to ensure the loading screen shows until we manually clear it after the initial actors are loaded.
        this.generationPromises['newGame'] = new Promise(() => {});

        // Get empty save slot or replace the oldest save if all slots are full
        const emptySlotIndex = this.saveData.saves.findIndex(save => save === undefined);
        const saveSlotIndex = emptySlotIndex !== -1 ? emptySlotIndex : (this.saveData.lastSaveSlot + 1) % this.SAVE_SLOT_COUNT;

        // Create new save data structure
        const newSave: SaveType = this.generateFreshSave(playerData);
        Object.assign(newSave, playerData.data);

        const persistedConfiguration = this.getConfiguration();

        if (!newSave.globalStatValues) {
            newSave.globalStatValues = { ...(persistedConfiguration.globalStatValues || {}) };
        }

        if (!newSave.lorebook || newSave.lorebook.length === 0) {
            newSave.lorebook = persistedConfiguration.lorebook.map(cloneLore);
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

        this.syncActorStats(newSave);
    this.syncLocationStats(newSave);
    this.syncGlobalStats(newSave);

        if (!newSave.currentDate && persistedConfiguration.startingDate) {
            newSave.currentDate = persistedConfiguration.startingDate;
        }

        this.anticipatedLoadingPromiseCount = Math.max(this.INITIAL_ACTORS - Object.keys(newSave.actors).length, 0) * 1 + 3;

        // Save the new game
        this.saveData.saves[saveSlotIndex] = newSave;
        this.saveData.lastSaveSlot = saveSlotIndex;

        // Generate all characters
        this.loadActors().finally(async () => {
            console.log('Finished loading initial actors for new game');

            const generatedIntroSeed = await this.generateIntroSkitSeed(newSave).catch(error => {
                console.error('Failed to generate intro skit seed for new game', error);
                return null;
            });
            const defaultLocationId = Object.values(newSave.atlas || {})[0]?.id || '';
            const defaultInitialActors = Object.values(newSave.actors || {})
                .filter(actor => actor.id !== newSave.playerId)
                .slice(0, 1)
                .map(actor => actor.id);

            const introSkit = new Skit({
                initialLocationId: generatedIntroSeed?.locationId || defaultLocationId,
                guidance: generatedIntroSeed?.guidance || `${this.getPlayerActor()?.name || 'The player'} is briefly introduced to the concept of the world or setting.`,
                script: [],
                initialActors: generatedIntroSeed?.initialActorIds?.length ? generatedIntroSeed.initialActorIds : defaultInitialActors,
                summary: ''
            });

            delete this.generationPromises['newGame']; // Clear the dummy promise to allow the loading screen to finish.

            // Push intro to timeline to start the game:
            newSave.timeline.push({
                calendarEventId: undefined,
                date: newSave.currentDate || this.getStartingDate(newSave),
                skit: introSkit
            });

            this.rebuildUpcomingEvents(newSave).catch(error => {
                console.error('Error seeding upcoming events for new game', error);
            });

            this.saveGame();
        });
    }

    // Called when the calendar screen displays.
    loadCalendarScreen() {
        const save = this.getSave();
        this.ensureCalendarState(save);

        if (!this.generationPromises['calendarEvents'] && this.getUpcomingEvents().length === 0) {
            this.generationPromises['calendarEvents'] = this.rebuildUpcomingEvents(save).then(() => {
                this.showPriorityMessage('Upcoming events are now available.');
            }).finally(() => {
                delete this.generationPromises['calendarEvents'];
            });
        }
    }
    
    loadSave(slotIndex: number) {
        if (this.saveData.saves[this.saveData.lastSaveSlot]) {
            this.saveData.lastSaveSlot = slotIndex;
        }
    }

    saveToSlot(slotIndex: number) {
        this.saveData.saves[slotIndex] = JSON.parse(JSON.stringify(this.getSave()));
        this.saveData.lastSaveSlot = slotIndex;
        this.saveGame();
    }

    saveGame() {
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
            .sort((a, b) => this.compareCalendarEvents(a, b));
    }

    getManagedCalendarEvents(): CalendarEvent[] {
        const save = this.getSave();
        this.ensureCalendarState(save);

        const groupedBySeries = new Map<string, CalendarEvent[]>();
        (save.upcomingEvents || []).forEach((event) => {
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

    createCalendarEventDraft(): CalendarEvent {
        const save = this.getSave();
        this.ensureCalendarState(save);

        const locations = Object.values(save.atlas || {}).filter(location => location.active !== false);
        const fallbackLocation = locations[0];
        const actorIds = Object.values(save.actors || {})
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
            guidance: ''
        };
    }

    upsertCalendarEventSeries(event: CalendarEvent): CalendarEvent {
        const save = this.getSave();
        this.ensureCalendarState(save);

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

    deleteCalendarEventSeries(eventId: string): boolean {
        const save = this.getSave();
        this.ensureCalendarState(save);

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

        this.advanceCalendarAfterEvent(save, nextEvent);
        save.timeline.push({
            calendarEventId: nextEvent.id,
            date: nextEvent.date,
        });
        save.upcomingEvents = (save.upcomingEvents || []).filter(event => event.id !== nextEvent.id);

        this.rebuildUpcomingEvents(save);
        this.saveGame();
        return nextEvent;
    }

    startCalendarEventSkit(eventId: string): Skit | null {
        const save = this.getSave();
        this.ensureCalendarState(save);

        const selectedEvent = (save.upcomingEvents || []).find(event => event.id === eventId);
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

        this.advanceCalendarAfterEvent(save, selectedEvent);
        if (!save.timeline) {
            save.timeline = [];
        }

        save.timeline.push({
            calendarEventId: selectedEvent.id,
            date: selectedEvent.date,
            skit,
        });
        save.upcomingEvents = (save.upcomingEvents || []).filter(event => event.id !== selectedEvent.id);

        this.rebuildUpcomingEvents(save);
        this.saveGame();
        return skit;
    }

    async continueSkit(): Promise<void> {
        const skit = (this.getSave() as any).currentSkit as Skit;
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
        const save = this.getSave();
        this.ensureCalendarState(save);
        const currentDate = save.currentDate || this.getStartingDate(save);
        const currentTimeOfDay = save.currentTimeOfDay || 'morning';

        return [...(save.upcomingEvents || [])]
            .filter((event) => event.locationId === locationId)
            .filter((event) => event.date === currentDate)
            .filter((event) => event.duration.includes(currentTimeOfDay))
            .sort((left, right) => this.compareCalendarEvents(left, right))[0] || null;
    }

    canVisitLocation(locationId: string): boolean {
        const save = this.getSave();
        const location = save.atlas?.[locationId];
        if (!location || location.active === false) {
            return false;
        }

        return Boolean(this.getCurrentLocationEvent(locationId)) || isLocationAvailable(location, this.getScheduleContext(save));
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
        save.uiSettings = {
            ...DEFAULT_UI_SETTINGS,
            ...(save.uiSettings || {}),
            ...updates,
        };
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
        const endingTimeOfDay = this.getEventEndTimeOfDay(event);
        const previousDate = save.currentDate || this.getStartingDate(save);
        const previousTimeOfDay = save.currentTimeOfDay || 'morning';

        if (endingTimeOfDay === 'night') {
            save.currentDate = this.addDays(eventDate, 1);
            save.currentTimeOfDay = 'morning';
        } else {
            save.currentDate = eventDate;
            save.currentTimeOfDay = this.getNextTimeOfDay(endingTimeOfDay);
        }

        this.applyStatUpdateRules(save, previousDate, previousTimeOfDay);
    }

    // Replays the configured stat update rules for every in-game period entered between the previous calendar
    // position (exclusive) and the save's current one (inclusive), so recurring rules such as "every morning"
    // still fire for periods skipped by a multi-day jump.
    private applyStatUpdateRules(save: SaveType, previousDate: string, previousTimeOfDay: CalendarTimeOfDay) {
        const rules = this.getConfiguration().statUpdateRules || [];
        if (rules.length === 0) {
            return;
        }

        const targetDate = save.currentDate || previousDate;
        const targetTimeOfDay = save.currentTimeOfDay || previousTimeOfDay;
        let date = previousDate;
        let timeOfDay = previousTimeOfDay;

        for (let step = 0; step < MAX_STAT_UPDATE_PERIODS; step++) {
            if (date === targetDate && timeOfDay === targetTimeOfDay) {
                return;
            }

            if (timeOfDay === 'night') {
                date = this.addDays(date, 1);
                timeOfDay = 'morning';
            } else {
                timeOfDay = this.getNextTimeOfDay(timeOfDay);
            }

            if (date > targetDate) {
                return;
            }

            const context: ConditionContext = { ...this.getScheduleContext(save), currentDate: date, currentTimeOfDay: timeOfDay };
            rules
                .filter(rule => evaluateConditionCollections(rule.conditions, context))
                .forEach(rule => (rule.updates || []).forEach(update => this.applyStatUpdate(save, update)));
        }
    }

    private applyStatUpdate(save: SaveType, update: StatUpdate) {
        const configuration = this.getConfiguration();

        if (update.targetType === 'player') {
            const stat = (configuration.globalStats || []).find(candidate => candidate.id === update.statId);
            if (!stat) {
                return;
            }
            save.globalStatValues = save.globalStatValues || {};
            save.globalStatValues[stat.id] = applyStatUpdateValue(save.globalStatValues[stat.id], update, stat);
            return;
        }

        const stat = (configuration.actorStats || []).find(candidate => candidate.id === update.statId);
        // perActor stats have no single target value, so they cannot be written by a rule.
        if (!stat || stat.perActor) {
            return;
        }

        Object.values(save.actors || {})
            .filter(actor => actor.active !== false)
            .filter(actor => update.actorId === 'any' || actor.id === update.actorId)
            .forEach(actor => {
                actor.statMap = actor.statMap || {};
                actor.statMap[stat.id] = applyStatUpdateValue(actor.statMap[stat.id], update, stat);
            });
    }

    private normalizeCalendarEventForSave(event: CalendarEvent, save: SaveType): CalendarEvent {
        const allLocations = Object.values(save.atlas || {}).filter(location => location.active !== false);
        const fallbackLocationId = allLocations[0]?.id || '';
        const locationId = allLocations.some(location => location.id === event.locationId)
            ? event.locationId
            : fallbackLocationId;
        const name = `${event.name || ''}`.trim() || 'Untitled Event';
        const date = `${event.date || ''}`.trim() || (save.currentDate || this.getStartingDate(save));
        const actorIds = Array.from(new Set(
            (event.actorIds || event.participantActorIds || [])
                .filter(actorId => Boolean(save.actors?.[actorId]))
                .filter(actorId => save.actors?.[actorId]?.active !== false)
                .map(actorId => `${actorId}`),
        ));
        const locationName = save.atlas[locationId]?.name || 'an unknown location';
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

        return this.getConfiguration().startingDate || save.currentDate || new Date().toISOString().slice(0, 10);
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
            recurrence: this.normalizeCalendarEventRecurrence(event.recurrence, event.date),
            recurrenceParentId: event.recurrenceParentId || undefined,
            recurrenceInstanceIndex: Number.isFinite(event.recurrenceInstanceIndex)
                ? Number(event.recurrenceInstanceIndex)
                : undefined,
        }));

        save.globalStatValues = { ...(this.getConfiguration().globalStatValues || {}) };

        this.syncActorStats(save);
        this.syncLocationStats(save);
        this.syncGlobalStats(save);

        if (!save.uiSettings) {
            save.uiSettings = {...DEFAULT_UI_SETTINGS};
        } else {
            save.uiSettings = {...DEFAULT_UI_SETTINGS, ...save.uiSettings};
        }
    }

    private syncActorStats(save: SaveType) {
        const configuredStats = (this.getConfiguration().actorStats || [])
            .filter(stat => stat?.name?.trim())
            .filter(stat => stat.type === 'number' || stat.type === 'checkbox' || stat.type === 'location');
        const scalarStats = configuredStats.filter(stat => !stat.perActor);
        const perActorStats = configuredStats.filter(stat => stat.perActor);
        const statIds = new Set(scalarStats.map(stat => stat.id));
        const perActorStatNames = new Set(perActorStats.map(stat => stat.name.trim()));

        Object.values(save.actors || {}).forEach(actor => {
            if (!actor.statMap || typeof actor.statMap !== 'object') {
                actor.statMap = {};
            }
            if (!actor.perActorStatMap || typeof actor.perActorStatMap !== 'object') {
                actor.perActorStatMap = {};
            }
            if (!actor.perActorValueRules || typeof actor.perActorValueRules !== 'object') {
                actor.perActorValueRules = {};
            }

            scalarStats.forEach(stat => {
                const existingValue = actor.statMap[stat.id];
                const normalized = normalizeStatValue(existingValue, stat);
                if (stat.type === 'location') {
                    actor.statMap[stat.id] = typeof normalized === 'string' ? normalized : '';
                    return;
                }
                actor.statMap[stat.id] = typeof normalized === 'boolean'
                    ? normalized
                    : Number.isFinite(normalized)
                        ? Number(normalized)
                        : 0;
            });

            Object.keys(actor.statMap).forEach(statId => {
                if (!statIds.has(statId)) {
                    delete actor.statMap[statId];
                }
            });

            perActorStats.forEach(stat => {
                const statName = stat.name.trim();
                if (!actor.perActorStatMap[statName] || typeof actor.perActorStatMap[statName] !== 'object') {
                    actor.perActorStatMap[statName] = {};
                }
                if (!Array.isArray(actor.perActorValueRules[statName])) {
                    actor.perActorValueRules[statName] = [];
                }
            });

            Object.keys(actor.perActorStatMap).forEach(statName => {
                if (!perActorStatNames.has(statName)) {
                    delete actor.perActorStatMap[statName];
                }
            });

            Object.keys(actor.perActorValueRules).forEach(statName => {
                if (!perActorStatNames.has(statName)) {
                    delete actor.perActorValueRules[statName];
                }
            });
        });
    }

    private syncLocationStats(save: SaveType) {
        const configuredStats = (this.getConfiguration().locationStats || [])
            .filter(stat => stat?.name?.trim())
            .filter(stat => stat.type === 'number' || stat.type === 'checkbox' || stat.type === 'location');
        const statIds = new Set(configuredStats.map(stat => stat.id));

        Object.values(save.atlas || {}).forEach(location => {
            if (!location.statMap || typeof location.statMap !== 'object') {
                location.statMap = {};
            }

            configuredStats.forEach(stat => {
                const existingValue = location.statMap[stat.id];
                const normalized = normalizeStatValue(existingValue, stat);
                if (stat.type === 'location') {
                    location.statMap[stat.id] = typeof normalized === 'string' ? normalized : '';
                    return;
                }
                location.statMap[stat.id] = typeof normalized === 'boolean'
                    ? normalized
                    : Number.isFinite(normalized)
                        ? Number(normalized)
                        : 0;
            });

            Object.keys(location.statMap).forEach(statId => {
                if (!statIds.has(statId)) {
                    delete location.statMap[statId];
                }
            });
        });
    }

    private syncGlobalStats(save: SaveType) {
        const configuredStats = (this.getConfiguration().globalStats || []).filter(stat => stat?.name?.trim());
        const currentValues = save.globalStatValues && typeof save.globalStatValues === 'object'
            ? save.globalStatValues
            : {};

        const normalizedValues: { [key: string]: StatValue } = {};
        configuredStats.forEach((stat) => {
            normalizedValues[stat.id] = normalizeStatValue(currentValues[stat.id], stat);
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

    async rebuildUpcomingEvents(save: SaveType = this.getSave(), targetEventCount: number = 6): Promise<CalendarEvent[]> {
        this.ensureCalendarState(save);

        const existingUpcomingEvents = (save.upcomingEvents || [])
            .filter(event => this.isFutureEvent(event))
            .sort((a, b) => this.compareCalendarEvents(a, b));

        const neededEventCount = Math.max(targetEventCount - existingUpcomingEvents.length, 0);
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
        maxTokens: number = 200,
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
                if (!result || !this.hasExpectedResponseTags(result, expectedFields)) {
                    const expectedTags = expectedFields ? getStructuredFieldTags(expectedFields) : [];
                    const errorText = expectedTags.length > 0
                        ? `missing expected tags: ${expectedTags.join(', ')}`
                        : 'empty response';
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

    endSkit() {
        const save = this.getSave();
        const currentSkit = this.getCurrentSkit();
        if (currentSkit) {
            currentSkit.over = true;
        }

        // This is where various outcomes of the skit are processed and applied to the save state
        // Get the final entry of the skit and process outcomes:
        console.log(`Processing outcomes for skit:`);
        const outcomes = currentSkit?.script[currentSkit.script.length - 1]?.outcomes || [];
        console.log(outcomes);
        for (const outcome of outcomes) {
            switch (outcome.type) {
                case 'LORE_UPDATE':
                    // For lore updates, we expect details to include a loreEntry with id, title, and content.
                    const loreEntry = findBestNameMatch(outcome.details?.loreTitle, save.lorebook || [], ['title']);
                    if (loreEntry && loreEntry.updatable) {
                        updateLoreEntry(loreEntry, this);
                    }
                    break;
                case 'ACTOR_STAT':
                    // For stat changes, we expect details to include an actorId and a statMap with the changes.
                    const actorId = outcome.details?.actorId;
                    const statMap = outcome.details?.statMap || {};
                    if (actorId && save.actors?.[actorId]) {
                        const actor = save.actors[actorId];
                        const configuredStats = (this.getConfiguration().actorStats || []).filter(stat => stat?.name?.trim());
                        const configuredStatByName = new Map(configuredStats.map(stat => [stat.name, stat]));
                        for (const [stat, value] of Object.entries(statMap)) {
                            const incomingStatName = `${stat}`.trim();
                            const changeValue = Number(value);
                            if (!incomingStatName || !Number.isFinite(changeValue)) {
                                continue;
                            }

                            const resolvedStat = configuredStatByName.get(incomingStatName)
                                || configuredStats.find(configured => configured.name.toLowerCase() === incomingStatName.toLowerCase());
                            if (resolvedStat?.perActor) {
                                // Per-actor stats require a target actor and aren't supported by this narrative outcome yet.
                                continue;
                            }
                            const targetStatId = resolvedStat?.id || incomingStatName;
                            actor.statMap = actor.statMap || {};
                            const existingValue = Number(actor.statMap[targetStatId]);
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
                case 'NEW_EVENT':
                    // For new events, we expect details to include the event data.
                    const newEvent = this.buildCalendarEventFromOutcome(outcome.details, save);
                    if (newEvent) {
                        save.upcomingEvents = save.upcomingEvents || [];
                        save.upcomingEvents.push(...this.expandRecurringEvent(newEvent));
                        this.saveGame();
                    }
                    break;
            }
        }

        if (!this.generationPromises['rebuildCalendarEvents']) {
            const rebuildEventsPromise = this.rebuildUpcomingEvents(save).then(() => {
                this.showPriorityMessage('Calendar updated with new upcoming events.');
            }).catch(error => {
                console.error('Error rebuilding upcoming events after skit', error);
            }).finally(() => {delete this.generationPromises['rebuildCalendarEvents']});
            this.generationPromises['rebuildCalendarEvents'] = rebuildEventsPromise;
        }

        this.saveGame();
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

    async removeBackground(imageUrl: string) {
        try {
                const response = await this.generator.removeBackground({image: imageUrl});
                return response?.url ?? imageUrl;
            } catch (error) {
                console.error(`Error removing background`, error);
                return imageUrl;
            }
    }

    async uploadFile(fileName: string, file: File): Promise<string> {
        // Don't honor file's name; want to overwrite existing content that may have had a different actual name.
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
        if (!agendaConfig?.globalStats?.length) {
            return 'No player stat context is active.';
        }

        const lines: string[] = [];
        for (const stat of agendaConfig.globalStats) {
            const statName = (stat.name || '').trim();
            if (!statName) {
                continue;
            }

            const value = normalizeStatValue(save.globalStatValues?.[stat.id], stat);
            const valueText = stat.type === 'location'
                ? (save.atlas?.[String(value)]?.name || '')
                : (typeof value === 'number' ? String(value) : value);

            if (stat.type === 'option') {
                const selectedOption = (stat.options || []).find(option => option.name === valueText);
                const optionDescription = resolveStatText(selectedOption?.description, this).trim();
                const line = [
                    `${statName}: ${valueText}`,
                    resolveStatText(stat.description, this).trim(),
                    optionDescription,
                ].filter(Boolean).join('\n');
                lines.push(line);
                continue;
            }

            const line = [
                `${statName}: ${valueText}`,
                resolveStatText(stat.description, this).trim(),
            ].filter(Boolean).join('\n');
            lines.push(line);
        }

        return lines.length > 0 ? lines.join('\n\n') : 'No player stat context is active.';
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

    private async generateActorSeed(save: SaveType): Promise<Partial<Actor> | null> {
        const existingActorNames = Object.values(save.actors || {})
            .map(actor => actor.name?.trim())
            .filter((name): name is string => Boolean(name));

        const response = await this.generateText(
            this.buildActorSeedPrompt(save, existingActorNames),
            40,
            220,
            ACTOR_SEED_FIELDS,
        );
        const parsed = parseStructuredResponse(response, ACTOR_SEED_FIELDS);
        const name = (parsed['name'] || '').trim();
        if (!name) {
            return null;
        }

        return {
            name,
            profile: (parsed['profile'] || '').trim(),
            description: (parsed['description'] || '').trim(),
            outfits: [],
            outfitId: '',
            statMap: {},
        };
    }

    private async generateIntroSkitSeed(save: SaveType): Promise<{ guidance: string; locationId: string; initialActorIds: string[] } | null> {
        const locations = Object.values(save.atlas || {});
        const availableActors = Object.values(save.actors || {}).filter(actor => actor.id !== save.playerId);
        const preferredActor = availableActors[0];

        if (!locations.length) {
            return null;
        }

        let response = '';
        let attempts = 3;
        while (attempts > 0) {
            attempts--;

            response = await this.generateText(
                buildPrompt()
                    .addBlock('Instructions',
                        `This is a preparatory request for the opening scene of a visual novel. ` +
                        `Generate concise but evocative guidance for the intro skit, plus the best location and 1-3 participants. ` +
                        `The guidance should introduce the core concept of the world and a strong first-scene hook. ` +
                        `Prefer including the preferred character if it fits naturally.`)
                    .addBlock('Preferred Character', preferredActor
                        ? `${preferredActor.name}: ${preferredActor.profile || preferredActor.description || 'No profile available.'}`
                        : 'None available.')
                    .addBlock('Available Locations', locations.map(location =>
                        `${location.name}: ${location.description || 'No description available.'}`,
                    ))
                    .addBlock('Available Characters', availableActors.slice(0, 14).map(actor =>
                        `${actor.name}: ${actor.profile || actor.description || 'No profile available.'}`,
                    ))
                    .addBlock('Response Format', buildStructuredResponseFormat(INTRO_SKIT_FIELDS, { includeEndTag: true }))
                    .addBlock('Example Response',
                        buildStructuredExampleResponse(
                            INTRO_SKIT_FIELDS,
                            {
                                guidance: `${this.getPlayerActor()?.name || 'The player'} arrives expecting a normal beginning, but the first conversation immediately reveals this world is stranger, more intimate, and more precarious than it first appears.`,
                                location: locations[0]?.name || 'Unknown Location',
                                participants: preferredActor ? preferredActor.name : '',
                            },
                            { includeEndTag: true },
                        ))
                    .addBlock('Additional Context', generateContext(undefined, this, 3))
                    .format(),
                20,
                360,
                INTRO_SKIT_FIELDS,
            ).catch(error => {
                console.error('Error generating intro skit seed', error);
                return '';
            });

            if (!response?.trim()) {
                continue;
            }

            const parsedResponse = parseStructuredResponse(response, INTRO_SKIT_FIELDS);
            const guidance = (parsedResponse.guidance || '').trim();
            const locationText = (parsedResponse.location || '').trim();
            const participantsText = (parsedResponse.participants || '').trim();

            if (!guidance) {
                continue;
            }

            const matchedLocation = findBestNameMatch(locationText, locations, ['name']);
            const locationId = matchedLocation?.id || locations[0].id;
            const initialActorIds = participantsText
                .split(',')
                .map(name => findBestNameMatch(name.trim(), availableActors, ['name'])?.id)
                .filter((id): id is string => Boolean(id))
                .slice(0, 3);

            return {
                guidance,
                locationId,
                initialActorIds,
            };
        }

        return null;
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

    async loadActors() {
        if (Object.keys(this.generationPromises).includes('loadActors')) {
            return this.generationPromises['loadActors'];
        }

        const promise = (async () => {
            const save = this.getSave();
            const configuredActors = this.getConfiguration().actors || [];
            const configuredActorStats = this.getConfiguration().actorStats || [];

            // Seed actors from the game configuration first.
            for (const configuredActor of configuredActors) {
                const seededActor = new Actor({
                    ...configuredActor,
                    statMap: configuredActor?.statMap && typeof configuredActor.statMap === 'object'
                        ? { ...configuredActor.statMap }
                        : {},
                });

                if (!save.actors[seededActor.id]) {
                    applyActorInitialStats(seededActor, configuredActorStats, this.getScheduleContext(save));
                    save.actors[seededActor.id] = seededActor;
                }
            }

            this.syncActorStats(save);

            // Distill seeded actors with incomplete details.
            const seededCandidates = Object.values(save.actors).filter(actor =>
                actor.id !== save.playerId && (!actor.profile?.trim() || !actor.description?.trim() || !actor.outfits?.length),
            );

            for (const seededActor of seededCandidates) {
                try {
                    const enrichedActor = await loadSupportedActor(seededActor, this);
                    if (enrichedActor) {
                        applyActorInitialStats(enrichedActor, configuredActorStats, this.getScheduleContext(save));
                        save.actors[enrichedActor.id] = enrichedActor;
                        this.syncActorStats(save);
                    }
                } catch (error) {
                    console.warn(`Failed to distill configured actor ${seededActor.name || seededActor.id}`, error);
                }
            }

            // Generate additional actors until we reach the initial roster size.
            let attemptsRemaining = Math.max((this.INITIAL_ACTORS - Object.keys(save.actors).length) * 2, 0);
            while (Object.keys(save.actors).length < this.INITIAL_ACTORS && attemptsRemaining > 0) {
                attemptsRemaining -= 1;

                let actorSeed: Partial<Actor> | null = null;
                try {
                    actorSeed = await this.generateActorSeed(save);
                } catch (error) {
                    console.warn('Failed to generate actor seed', error);
                    continue;
                }

                if (!actorSeed?.name) {
                    continue;
                }

                const nameKey = actorSeed.name.trim().toLowerCase();
                const duplicateByName = Object.values(save.actors).some(existing => existing.name?.trim().toLowerCase() === nameKey);
                if (duplicateByName) {
                    continue;
                }

                const draftActor = new Actor(actorSeed);
                try {
                    const newActor = await loadSupportedActor(draftActor, this);
                    if (!newActor) {
                        continue;
                    }

                    const alreadyExists = Object.values(save.actors).some(existing =>
                        existing.id === newActor.id || existing.name?.trim().toLowerCase() === newActor.name?.trim().toLowerCase(),
                    );
                    if (alreadyExists) {
                        continue;
                    }

                    applyActorInitialStats(newActor, configuredActorStats, this.getScheduleContext(save));
                    save.actors[newActor.id] = newActor;
                    this.syncActorStats(save);
                } catch (error) {
                    console.warn(`Failed to generate actor from seed ${actorSeed.name}`, error);
                }
            }

            this.saveGame();
        })().finally(() => {
            delete this.generationPromises['loadActors'];
        });

        console.log('Set promise');
        this.generationPromises['loadActors'] = promise;
        return promise;
    }

    isVerticalLayout(): boolean {
        // Determine if the layout should be vertical based on window aspect ratio
        // Vertical layout when height > width (portrait orientation)
        return window.innerHeight > window.innerWidth;
    }

    render(): ReactElement {
        return <BaseScreen stage={() => this}/>;
    }

}
