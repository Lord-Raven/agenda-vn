import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, User, Character} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import { Actor, findBestNameMatch, loadSupportedActor, getActorLore, getEmotionImage } from "./content/Actor";
import { Emotion } from "./content/Emotion";
import { AffinityChangeInfo } from "./screens/AffinityPopIn";
import { Item } from "./content/Item";
import { generateContext, Skit, SkitType } from "./content/Skit";
import { createDefaultAtlas, getLinkedLocationLore, Location } from "./content/Location";
import { BaseScreen } from "./screens/BaseScreen";
import { fetchLorebook, Lore, updateTypeMapping } from "./content/Lore";
import { DEFAULT_PLAYER_THEME_COLOR } from "./screens/SettingsScreen";
import {buildPrompt} from "./utils/PromptBuilder.js";
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
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
    inventory: Item[];
    timeline: TimelineEntry[];
    turn: number;
    startingDate?: string;
    timestamp: number; // Time of last save
    textToSpeech?: boolean;
    disableImpersonation?: boolean;
    language?: string;
    lorebook?: Lore[];
    expeditionChoices?: ExpeditionChoice[];
    currentDate?: string;
    upcomingEvents?: CalendarEvent[];
    agendaConfig?: {
        context: ContextSegment[];
        settings: CustomSetting[];
        selectedSettings: {[key: string]: string};
        actorStats?: ActorStat[];
    };
    uiSettings?: UiSettings;
    betaMode?: boolean;
}

export type UiSettings = {
    gameTitle: string;
    uiFontFamily: string;
    flavorFontFamily: string;
    mistColor: string;
    verdantColor: string;
    fogColor: string;
    textSecondaryColor: string;
    bgDeepColor: string;
    bgMidColor: string;
    bgSoftColor: string;
    borderColor: string;
    borderStrongColor: string;
    calendarOverlayStart: string;
    calendarOverlayMid: string;
    calendarOverlayEnd: string;
    calendarCardBackground: string;
    calendarCardBorder: string;
}

const DEFAULT_UI_SETTINGS: UiSettings = {
    gameTitle: 'Agenda VN',
    uiFontFamily: '"Geologica", sans-serif',
    flavorFontFamily: '"Lora", Georgia, serif',
    mistColor: '#8ab0cc',
    verdantColor: '#89cd87',
    fogColor: '#edf2f2',
    textSecondaryColor: '#b9d2e3',
    bgDeepColor: '#1a1e30',
    bgMidColor: '#24293f',
    bgSoftColor: '#2e354d',
    borderColor: 'rgba(138, 176, 204, 0.34)',
    borderStrongColor: 'rgba(137, 205, 135, 0.44)',
    calendarOverlayStart: 'rgba(10, 28, 37, 0.79)',
    calendarOverlayMid: 'rgba(21, 41, 30, 0.73)',
    calendarOverlayEnd: 'rgba(35, 24, 56, 0.78)',
    calendarCardBackground: 'rgba(28, 34, 52, 0.92)',
    calendarCardBorder: 'rgba(138, 176, 204, 0.34)',
};

const LORE_UPDATE_RESPONSE_FIELDS: StructuredFieldDefinition[] = [
    {
        key: 'planning',
        label: 'PLANNING',
        description: 'Brief explanation of what changes were made and what was retained from the original.',
    },
    {
        key: 'content',
        label: 'CONTENT',
        description: 'Revised lore content that preserves still-true original information and integrates new updates.',
    },
];

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

export type CalendarEvent = {
    id: string;
    name: string;
    date: string; // YYYY-MM-DD
    locationId: string;
    actorIds: string[];
    description: string;
    hiddenAgenda: string;
    status: 'upcoming' | 'played' | 'skipped';
    participantActorIds?: string[];
    guidance?: string;
}

// Represents a piece of context to be included in generative requests. Has a title and text body/array of sub-segments
export type ContextSegment = {
    title: string;
    body: string|ContextSegment[];
}

// Represents a custom stat that applies to all actors in the game.
export type ActorStat = {
    name: string; // Display name of the stat
    description: string; // User-facing description of what the stat represents
    guidance: string; // Guidance for how the stat should be used in generative requests
    default: number; // Default value of the stat
    displayType: 'number' | 'percentage' | 'stars' | 'letter grade'; // How the stat should be displayed in the UI
    min?: number; // Minimum value of the stat (optional)
    max?: number; // Maximum value of the stat (optional)
}

// Represents a setting drop-down that can build added to the game.
export type CustomSetting = {
    title: string; // Name of the setting
    description: string; // Description of what it does
    options: {[key: string]: ContextSegment} // Map of option name to a ContextSegment that it will cause to be used.
}

// Represents a configuration that is used to initialize new games, but can also influence existing games.
export type GameConfiguration = {
    
    actors: Actor[], // All defined actors for a new game
    locations: Location[], // All defined locations for a new game
    context: ContextSegment[], // All defined context segments (applies to current and new games)
    settings: CustomSetting[], // All defined custom settings (applies to current and new games)
    actorStats: ActorStat[], // All custom actor stats and defaults (applies to current and new games)
    startingDate: string; // The starting date of the game, in YYYY-MM-DD format (applies to new game)

}

const cloneContextSegment = (segment: ContextSegment): ContextSegment => ({
    title: segment.title,
    body: typeof segment.body === 'string' ? segment.body : (segment.body || []).map(cloneContextSegment),
});

const cloneCustomSetting = (setting: CustomSetting): CustomSetting => ({
    title: setting.title,
    description: setting.description,
    options: Object.fromEntries(
        Object.entries(setting.options || {}).map(([key, value]) => [key, cloneContextSegment(value)]),
    ),
});

const cloneActorStat = (stat: ActorStat): ActorStat => ({
    name: stat.name,
    description: stat.description,
    guidance: stat.guidance,
    default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
    displayType: stat.displayType,
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
});

type ExpeditionChoice = {
    id: string;
    locationId: string;
    description: string;
    name: string;
    partnerActorIds: string[];
}

type TimelineEntry = {
    turn: number;
    description: string;
    skit?: Skit;
}

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {


    readonly SAVE_SLOT_COUNT = 10;
    readonly INITIAL_ACTORS = 33; // Gotta load 'em all.

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

        // Populate default saves with SAVE_SLOT_COUNT undefines:
        this.saveData = chatState != null
            ? chatState
            : {
                saves: Array(this.SAVE_SLOT_COUNT).fill(undefined),
                configuration: this.createDefaultNewGameConfiguration(),
                lastSaveSlot: 0,
            };
        this.ensureChatState();

    }

    private createDefaultNewGameConfiguration(): GameConfiguration {
        return {
            actors: [],
            locations: [],
            context: [],
            settings: [],
            actorStats: [],
            startingDate: new Date().toISOString().slice(0, 10),
        };
    }

    private ensureChatState() {
        if (!this.saveData.saves) {
            this.saveData.saves = Array(this.SAVE_SLOT_COUNT).fill(undefined);
        }

        if (typeof this.saveData.lastSaveSlot !== 'number' || Number.isNaN(this.saveData.lastSaveSlot)) {
            this.saveData.lastSaveSlot = 0;
        }

        const activeSave = this.saveData.saves[this.saveData.lastSaveSlot];
        const defaultConfiguration = this.createDefaultNewGameConfiguration();
        const legacyContext = activeSave?.agendaConfig?.context || [];
        const legacySettings = activeSave?.agendaConfig?.settings || [];
        const legacyActorStats = activeSave?.agendaConfig?.actorStats || [];

        if (!this.saveData.configuration) {
            this.saveData.configuration = {
                ...defaultConfiguration,
                context: legacyContext.map(cloneContextSegment),
                settings: legacySettings.map(cloneCustomSetting),
            };
            return;
        }

        this.saveData.configuration = {
            actors: this.saveData.configuration.actors || defaultConfiguration.actors,
            locations: this.saveData.configuration.locations || defaultConfiguration.locations,
            context: (this.saveData.configuration.context || legacyContext).map(cloneContextSegment),
            settings: (this.saveData.configuration.settings || legacySettings).map(cloneCustomSetting),
            actorStats: (this.saveData.configuration.actorStats || legacyActorStats).map(cloneActorStat),
            startingDate: this.saveData.configuration.startingDate || defaultConfiguration.startingDate,
        };
    }

    getConfiguration(): GameConfiguration {
        this.ensureChatState();
        return this.saveData.configuration;
    }

    updateConfiguration(updates: Partial<GameConfiguration>) {
        this.ensureChatState();
        const current = this.saveData.configuration;
        this.saveData.configuration = {
            ...current,
            ...updates,
            actors: (updates.actors ?? current.actors ?? []).map(actor => ({...actor})),
            locations: (updates.locations ?? current.locations ?? []).map(location => ({...location})),
            context: (updates.context ?? current.context ?? []).map(cloneContextSegment),
            settings: (updates.settings ?? current.settings ?? []).map(cloneCustomSetting),
            actorStats: (updates.actorStats ?? current.actorStats ?? []).map(cloneActorStat),
            startingDate: updates.startingDate ?? current.startingDate,
        };

        const currentSave = this.saveData.saves[this.saveData.lastSaveSlot];
        if (currentSave) {
            if (!currentSave.agendaConfig) {
                currentSave.agendaConfig = {
                    context: [],
                    settings: [],
                    selectedSettings: {},
                    actorStats: [],
                };
            }
            currentSave.agendaConfig.actorStats = this.saveData.configuration.actorStats.map(cloneActorStat);
            this.syncActorStats(currentSave);
        }

        this.saveGame();
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
        //if (this.isAuthenticated) {
            this.messenger.impersonate({
                speaker_id: this.primaryCharacter.anonymizedId,
                is_main: false,
                parent_id: null,
                message: message
            });
        //}
    }

    generateFreshSave(playerData: {name: string, personality: string, themeColor?: string}): SaveType {
        const startingDate = this.getConfiguration().startingDate || new Date().toISOString().slice(0, 10);

        return {playerId: this.primaryUser.anonymizedId,
            actors: {
                [this.primaryUser.anonymizedId]: {
                    id: this.primaryUser.anonymizedId,
                    name: playerData.name,
                    description: '',
                    profile: playerData.personality,
                    outfits: [], // Ditto.
                    outfitId: '', // Ditto.
                    statMap: {},
                    themeColor: playerData.themeColor || DEFAULT_PLAYER_THEME_COLOR,
                    themeFontFamily: '',
                    voiceId: ''
                },
            },
            atlas: createDefaultAtlas(),
            inventory: [],
            timeline: [],
            turn: 0,
            startingDate,
            timestamp: Date.now(),
            currentDate: startingDate,
            upcomingEvents: [],
            agendaConfig: {
                context: [],
                settings: [],
                selectedSettings: {},
                actorStats: this.getConfiguration().actorStats.map(cloneActorStat),
            },
            uiSettings: {...DEFAULT_UI_SETTINGS},
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
        if (!newSave.agendaConfig) {
            newSave.agendaConfig = {
                context: persistedConfiguration.context.map(cloneContextSegment),
                settings: persistedConfiguration.settings.map(cloneCustomSetting),
                selectedSettings: Object.fromEntries(
                    persistedConfiguration.settings.map(setting => {
                        const optionName = Object.keys(setting.options || {})[0];
                        return [setting.title, optionName || ''];
                    }),
                ),
                actorStats: persistedConfiguration.actorStats.map(cloneActorStat),
            };
        } else if (!newSave.agendaConfig.actorStats) {
            newSave.agendaConfig.actorStats = persistedConfiguration.actorStats.map(cloneActorStat);
        }

        this.syncActorStats(newSave);

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
                skitType: SkitType.INTRO,
                initialLocationId: generatedIntroSeed?.locationId || defaultLocationId,
                guidance: generatedIntroSeed?.guidance || `${this.getPlayerActor()?.name || 'The player'} begins their first day in Ardeia, meeting someone who reveals both the fragile hope and hidden danger of this world.`,
                script: [],
                initialActors: generatedIntroSeed?.initialActorIds?.length ? generatedIntroSeed.initialActorIds : defaultInitialActors,
                summary: ''
            });

            delete this.generationPromises['newGame']; // Clear the dummy promise to allow the loading screen to finish.

            // Push intro to timeline to start the game:
            newSave.timeline.push({
                turn: 0,
                description: 'Introduction to the world',
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

    // Backward compatibility shim while older UI references remain.
    loadMapScreen() {
        this.loadCalendarScreen();
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

    isMapScreenLoading(): boolean {
        return this.isCalendarScreenLoading();
    }

    getUpcomingEvents(): CalendarEvent[] {
        const save = this.getSave();
        this.ensureCalendarState(save);

        return (save.upcomingEvents || [])
            .filter(event => event.status === 'upcoming' && event.date >= (save.currentDate || '0000-01-01'))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    skipNextEvent(): CalendarEvent | null {
        const save = this.getSave();
        this.ensureCalendarState(save);

        const nextEvent = this.getUpcomingEvents()[0];
        if (!nextEvent) {
            return null;
        }

        nextEvent.status = 'skipped';
        save.turn = this.getDayDifference(this.getStartingDate(save), nextEvent.date);
        save.currentDate = nextEvent.date;
        save.timeline.push({
            turn: save.turn,
            description: `Skipped event: ${nextEvent.name} at ${save.atlas[nextEvent.locationId]?.name || 'Unknown Location'}.`,
        });

        this.rebuildUpcomingEvents(save);
        this.saveGame();
        return nextEvent;
    }

    startCalendarEventSkit(eventId: string): Skit | null {
        const save = this.getSave();
        this.ensureCalendarState(save);

        const selectedEvent = (save.upcomingEvents || []).find(event => event.id === eventId && event.status === 'upcoming');
        if (!selectedEvent) {
            return null;
        }

        const selectedLocation = save.atlas[selectedEvent.locationId];
        if (!selectedLocation) {
            return null;
        }

        const skit = new Skit({
            skitType: SkitType.SOCIAL,
            initialLocationId: selectedLocation.id,
            guidance: selectedEvent.hiddenAgenda || selectedEvent.guidance || selectedEvent.description,
            script: [],
            initialActors: selectedEvent.actorIds || selectedEvent.participantActorIds || [],
            summary: '',
        });

        selectedEvent.status = 'played';
        save.turn = this.getDayDifference(this.getStartingDate(save), selectedEvent.date);
        save.currentDate = selectedEvent.date;
        if (!save.timeline) {
            save.timeline = [];
        }

        save.timeline.push({
            turn: save.turn,
            description: `Event: ${selectedEvent.name}`,
            skit,
        });

        this.rebuildUpcomingEvents(save);
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
        // Get last entry with a skit that is not marked as over:
        for (let i = save.timeline.length - 1; i >= 0; i--) {
            const entry = save.timeline[i];
            if (entry.skit && !entry.skit.over) {
                return entry.skit;
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

    private getDayDifference(startDate: string, endDate: string): number {
        const start = new Date(`${startDate}T00:00:00Z`);
        const end = new Date(`${endDate}T00:00:00Z`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return 0;
        }

        return Math.round((end.getTime() - start.getTime()) / 86400000);
    }

    private getStartingDate(save: SaveType): string {
        if (save.startingDate) {
            return save.startingDate;
        }

        if (save.currentDate) {
            const derivedStartingDate = this.addDays(save.currentDate, -(save.turn || 0));
            save.startingDate = derivedStartingDate;
            return derivedStartingDate;
        }

        const fallbackDate = this.getConfiguration().startingDate || new Date().toISOString().slice(0, 10);
        save.startingDate = fallbackDate;
        return fallbackDate;
    }

    private syncCurrentDateToTurn(save: SaveType) {
        const startingDate = this.getStartingDate(save);
        save.currentDate = this.addDays(startingDate, save.turn || 0);
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
        const startingDate = this.getStartingDate(save);
        if (typeof save.turn !== 'number' || Number.isNaN(save.turn)) {
            save.turn = 0;
        }

        save.currentDate = this.addDays(startingDate, save.turn);

        if (!save.upcomingEvents) {
            save.upcomingEvents = [];
        }

        save.upcomingEvents = save.upcomingEvents.map((event) => ({
            ...event,
            actorIds: event.actorIds || event.participantActorIds || [],
            participantActorIds: event.participantActorIds || event.actorIds || [],
            description: event.description || event.guidance || `${event.name} at ${save.atlas[event.locationId]?.name || 'an unknown location'}.`,
            hiddenAgenda: event.hiddenAgenda || event.guidance || event.description || event.name,
            guidance: event.guidance || event.hiddenAgenda || event.description || event.name,
        }));

        if (!save.agendaConfig) {
            save.agendaConfig = {
                context: [],
                settings: [],
                selectedSettings: {},
                actorStats: [],
            };
        }

        if (!save.agendaConfig.actorStats) {
            save.agendaConfig.actorStats = this.getConfiguration().actorStats.map(cloneActorStat);
        }

        this.syncActorStats(save);

        if (!save.uiSettings) {
            save.uiSettings = {...DEFAULT_UI_SETTINGS};
        } else {
            save.uiSettings = {...DEFAULT_UI_SETTINGS, ...save.uiSettings};
        }
    }

    private normalizeActorStatValue(value: number, stat: ActorStat): number {
        let resolved = Number.isFinite(value) ? Number(value) : Number(stat.default) || 0;
        if (typeof stat.min === 'number') {
            resolved = Math.max(stat.min, resolved);
        }
        if (typeof stat.max === 'number') {
            resolved = Math.min(stat.max, resolved);
        }
        return resolved;
    }

    private syncActorStats(save: SaveType) {
        const configuredStats = (save.agendaConfig?.actorStats || []).filter(stat => stat?.name?.trim());
        const statNames = new Set(configuredStats.map(stat => stat.name));

        Object.values(save.actors || {}).forEach(actor => {
            if (!actor.statMap || typeof actor.statMap !== 'object') {
                actor.statMap = {};
            }

            configuredStats.forEach(stat => {
                const existingValue = actor.statMap[stat.name];
                const fallback = Number.isFinite(stat.default) ? Number(stat.default) : 0;
                const value = Number.isFinite(existingValue) ? Number(existingValue) : fallback;
                actor.statMap[stat.name] = this.normalizeActorStatValue(value, stat);
            });

            Object.keys(actor.statMap).forEach(statName => {
                if (!statNames.has(statName)) {
                    delete actor.statMap[statName];
                }
            });
        });
    }

    private createCalendarEvents(save: SaveType, count: number): CalendarEvent[] {
        this.ensureCalendarState(save);

        const playerId = save.playerId;
        const availableActors = Object.values(save.actors || {}).filter(actor =>
            actor.id !== playerId && actor.name.toLowerCase() !== 'cassiel',
        );

        const generatedEvents: CalendarEvent[] = [];
        const upcomingEvents = (save.upcomingEvents || []).filter(event => event.status === 'upcoming');
        const sortedExistingEvents = [...upcomingEvents].sort((a, b) => a.date.localeCompare(b.date));
        let dateCursor = sortedExistingEvents.length > 0
            ? sortedExistingEvents[sortedExistingEvents.length - 1].date
            : (save.currentDate || new Date().toISOString().slice(0, 10));

        for (let i = 0; i < count; i += 1) {
            const location = this.pickRandom(Object.values(save.atlas || {}));
            if (!location) {
                break;
            }

            const participantCount = Math.min(availableActors.length, location.id.startsWith('ardeia-') ? 3 : 2);
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
            const hiddenAgenda = `${eventName}. ${locationContext} Guide the skit toward the event's private purpose without exposing it to the player.`;

            generatedEvents.push({
                id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
                name: eventName,
                date: dateCursor,
                locationId: location.id,
                actorIds: participants.map(actor => actor.id),
                participantActorIds: participants.map(actor => actor.id),
                description,
                hiddenAgenda,
                guidance: hiddenAgenda,
                status: 'upcoming',
            });
        }

        return generatedEvents;
    }

    async rebuildUpcomingEvents(save: SaveType = this.getSave(), targetEventCount: number = 6): Promise<CalendarEvent[]> {
        this.ensureCalendarState(save);

        const existingEvents = save.upcomingEvents || [];
        const existingUpcomingEvents = existingEvents
            .filter(event => event.status === 'upcoming' && event.date >= (save.currentDate || '0000-01-01'))
            .sort((a, b) => a.date.localeCompare(b.date));

        const neededEventCount = Math.max(targetEventCount - existingUpcomingEvents.length, 0);
        const newEvents = neededEventCount > 0 ? this.createCalendarEvents(save, neededEventCount) : [];

        save.upcomingEvents = [...existingEvents, ...newEvents]
            .sort((a, b) => a.date.localeCompare(b.date));
        this.saveGame();

        return save.upcomingEvents;
    }

    public async generateText(prompt: string, minTokens: number = 50, maxTokens: number = 200): Promise<string> {
        const response = await this.generator.textGen({
            prompt: `{{messages}}${prompt}`,
            min_tokens: minTokens,
            max_tokens: maxTokens,
            include_history: true,
            stop: ['#END']
        });
        return response?.result || '';
    }

    private buildTravelTimelineDescription(location: Location): string {
        return `Visited ${location.name}.`;
    }

    startTravelSkit(selectedLocationId: string): Skit | null {
        const save = this.getSave();
        const selectedLocation = save.atlas[selectedLocationId];

        if (!selectedLocation) {
            return null;
        }

        let skit: Skit;

        skit = new Skit({
            skitType: SkitType.SOCIAL,
            initialLocationId: selectedLocation.id,
            guidance: '',
            script: [],
            initialActors: [],
            summary: '',
        });

        save.turn += 1;
        this.syncCurrentDateToTurn(save);
        if (!save.timeline) {
            save.timeline = [];
        }
        save.timeline.push({
            turn: save.turn,
            description: this.buildTravelTimelineDescription(selectedLocation),
            skit,
        });

        return skit;
    }

    endSkit() {
        const save = this.getSave();
        const currentSkit = this.getCurrentSkit();
        if (currentSkit) {
            currentSkit.over = true;
            save.turn += 1;
            this.syncCurrentDateToTurn(save);
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
                    if (loreEntry) {
                        // Make a call with context and the current lore entry, asking for revisions based on context.
                        const loreUpdatePromise = this.generateText(buildPrompt()
                            .addBlock('Instructions', `Based on the current context and recent events, output an updated or revised version of the content below, taking care to maintain all information from the original that remains true. If there are no significant changes, simply return the original content verbatim.`)
                            .addBlock('Target Lore Title', loreEntry.title)
                            .addBlock('Content for Revision', loreEntry.content)
                            .addBlock('Response Format', buildStructuredResponseFormat(LORE_UPDATE_RESPONSE_FIELDS))
                            .addBlock('Example Response',
                                buildStructuredExampleResponse(LORE_UPDATE_RESPONSE_FIELDS, {
                                    planning: '<explanation of changes made and existing content to retain.>',
                                    content: '<revised content, including relevant updates and persisting other accurate details from the original.>',
                                }))
                            .addBlock('Additional Context', generateContext(undefined, this, 3))
                            .format(),
                            10, 1000
                        ).then(response => {
                            if (response) {
                                const parsedResponse = parseStructuredResponse(response, LORE_UPDATE_RESPONSE_FIELDS);
                                loreEntry.content = parsedResponse.content || loreEntry.content;
                                this.saveGame();
                            }
                        }).catch(error => {
                            console.error(`Error updating lore entry ${loreEntry.title}`, error);
                        }).finally(() => delete this.generationPromises[`loreUpdate-${loreEntry.id}`]);
                        this.generationPromises[`loreUpdate-${loreEntry.id}`] = loreUpdatePromise;
                    }
                    break;
                case 'RELATIONSHIP_CHANGE': {
                    // For relationship changes, we expect details to include actorId and change (e.g. +10 or -5).
                    const actor = findBestNameMatch(outcome.details?.actorName, Object.values(save.actors), ['name']);
                    if (actor) {
                        const affinityStatName = Object.keys(actor.statMap || {}).find((key) => key.toLowerCase() === 'affinity');
                        if (!affinityStatName) {
                            break;
                        }

                        const previousAffinity = Number(actor.statMap?.[affinityStatName] || 0);
                        const nextAffinity = Math.min(10, Math.max(0, previousAffinity + (outcome.details?.changeValue || 0)));
                        actor.statMap[affinityStatName] = nextAffinity;
                        const effectiveChange = nextAffinity - previousAffinity;
                        if (effectiveChange !== 0) {
                            const isPositive = effectiveChange > 0;
                            const emotionKey = isPositive
                                ? (getEmotionImage(actor, Emotion.joy) ? Emotion.joy :
                                   getEmotionImage(actor, Emotion.love) ? Emotion.love :
                                   getEmotionImage(actor, Emotion.kindness) ? Emotion.kindness : Emotion.neutral)
                                : (getEmotionImage(actor, Emotion.sadness) ? Emotion.sadness :
                                   getEmotionImage(actor, Emotion.disappointment) ? Emotion.disappointment : Emotion.neutral);
                            const portraitUrl = getEmotionImage(actor, emotionKey);
                            this.showAffinityChange({
                                id: `${actor.id}-${Date.now()}`,
                                actorName: actor.name,
                                portraitUrl,
                                change: effectiveChange,
                                themeColor: actor.themeColor || '#ffffff',
                            });
                        }
                    }
                    break;
                }
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

    // Callback to show affinity change pop-ins
    private affinityChangeCallback?: (info: AffinityChangeInfo) => void;

    /**
     * Register a callback to display affinity change pop-ins.
     */
    setAffinityChangeCallback(callback: (info: AffinityChangeInfo) => void) {
        this.affinityChangeCallback = callback;
    }

    /**
     * Trigger an affinity change pop-in.
     */
    showAffinityChange(info: AffinityChangeInfo) {
        if (this.affinityChangeCallback) {
            this.affinityChangeCallback(info);
        }
    }

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

    async makeImage(imageRequest: Object, defaultUrl: string): Promise<string> {
        return (await this.generator.makeImage(imageRequest))?.url ?? defaultUrl;
    }

    async makeImageFromImage(imageToImageRequest: any, defaultUrl: string): Promise<string> {

        const imageUrl = (await this.generator.imageToImage(imageToImageRequest))?.url ?? defaultUrl;
        if (imageToImageRequest.remove_background && imageToImageRequest.transfer_type == 'edit' && imageUrl != defaultUrl) {
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
            console.warn (`Falling back to Chub's background removal.`);
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
        const agendaConfig = save.agendaConfig;
        if (!agendaConfig?.settings?.length) {
            return 'No custom setting context is active.';
        }

        const lines: string[] = [];
        for (const setting of agendaConfig.settings) {
            const optionName = agendaConfig.selectedSettings?.[setting.title] || Object.keys(setting.options || {})[0] || '';
            if (!optionName) {
                continue;
            }

            const context = setting.options?.[optionName];
            if (!context) {
                continue;
            }

            const contextBody = typeof context.body === 'string'
                ? context.body
                : (context.body || []).map(segment => `${segment.title}: ${typeof segment.body === 'string' ? segment.body : ''}`).join('\n');
            lines.push(`${setting.title}: ${optionName}\n${context.title}: ${contextBody}`.trim());
        }

        return lines.length > 0 ? lines.join('\n\n') : 'No custom setting context is active.';
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
                        profile: 'Mirel is observant, practical, and quietly theatrical when she tells stories. She scavenges old transit hubs for useful artifacts and treats every social exchange like a puzzle. She wants status in Ardeia but fears becoming dependent on anyone.',
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

        const response = await this.generateText(this.buildActorSeedPrompt(save, existingActorNames), 40, 220);
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
                                guidance: `${this.getPlayerActor()?.name || 'The player'} arrives expecting a normal beginning, but the first conversation immediately reveals that Ardeia is stranger, more intimate, and more precarious than it first appears.`,
                                location: locations[0]?.name || 'Unknown Location',
                                participants: preferredActor ? preferredActor.name : '',
                            },
                            { includeEndTag: true },
                        ))
                    .addBlock('Additional Context', generateContext(undefined, this, 3))
                    .format(),
                20,
                360,
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

    async loadActors() {
        if (Object.keys(this.generationPromises).includes('loadActors')) {
            return this.generationPromises['loadActors'];
        }

        const promise = (async () => {
            const save = this.getSave();
            const configuredActors = this.getConfiguration().actors || [];

            // Seed actors from the game configuration first.
            for (const configuredActor of configuredActors) {
                const seededActor = new Actor({
                    ...configuredActor,
                    statMap: configuredActor?.statMap && typeof configuredActor.statMap === 'object'
                        ? { ...configuredActor.statMap }
                        : {},
                });

                if (!save.actors[seededActor.id]) {
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
