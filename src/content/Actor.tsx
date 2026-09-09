import { v4 as generateUuid } from 'uuid';
import { Emotion, EMOTION_PROMPTS, EmotionPack, EmotionPromptMap } from './Emotion';
import { Stage } from '../Stage';
import { Stat, StatValue, StatValueRule, cloneStatValueRules, isNumericDisplayType, isStatLlmSeen, normalizeLocationListValue, normalizeStatValue, resolveStatDefault, resolvePerActorValueRule, resolveStatText } from './Stat';
import { AspectRatio } from '@chub-ai/stages-ts';
import { createLoreEntry, formatLoreEntriesAsContext, selectConstantLoreEntries } from './Lore';
import {buildPrompt, PromptBuilder} from "../utils/PromptBuilder.js";
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    parseStructuredResponse,
    StructuredFieldDefinition,
} from "../utils/StructuredResponse.js";
import { ConditionCollection, ConditionContext, evaluateConditionCollections, hasVariableActorTarget, pickSeededItem } from './Condition';
import { formatCurrentDate } from './Skit';
// A single conditional modifier to an actor's initial stat value; numeric stats are adjusted, while text/location stats are replaced.
export type ActorStatModifier = {
    id: string;
    amount: StatValue;
    conditions: ConditionCollection[];
};

// The initial value and conditional modifiers used to compute an actor's stat value when a new game is initialized.
export type ActorStatInitial = {
    value: StatValue;
    modifiers: ActorStatModifier[];
};

const cloneStatModifier = (modifier: any): ActorStatModifier => ({
    id: modifier?.id || generateUuid(),
    amount: Array.isArray(modifier?.amount)
        ? normalizeLocationListValue(modifier.amount)
        : typeof modifier?.amount === 'boolean' || typeof modifier?.amount === 'string'
            ? modifier.amount
            : Number.isFinite(modifier?.amount)
                ? Number(modifier.amount)
                : 0,
    conditions: Array.isArray(modifier?.conditions)
        ? modifier.conditions.map((collection: unknown) => Array.isArray(collection) ? [...collection] : [])
        : [],
});

// Per-target-actor value overrides/rules for perActor stats, keyed by stat name then target actor id.
export type PerActorStatValueMap = { [statName: string]: { [targetActorId: string]: StatValue } };
// Per-actor override rules for perActor stats, keyed by stat name; these take precedence over the stat
// definition's own perActorDefaultRules.
export type PerActorValueRuleMap = { [statName: string]: StatValueRule[] };

export const clonePerActorStatValueMap = (map: unknown): PerActorStatValueMap => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
        return {};
    }
    return Object.fromEntries(Object.entries(map as Record<string, any>).map(([statName, targetMap]) => [
        statName,
        targetMap && typeof targetMap === 'object' && !Array.isArray(targetMap) ? { ...targetMap } : {},
    ]));
};

export const clonePerActorValueRuleMap = (map: unknown): PerActorValueRuleMap => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
        return {};
    }
    return Object.fromEntries(Object.entries(map as Record<string, any>).map(([statName, rules]) => [
        statName,
        cloneStatValueRules(Array.isArray(rules) ? rules : []),
    ]));
};

// Resolves a perActor stat's value for a given target actor: an explicit override on the host actor wins,
// then the host actor's own perActorValueRules, then the stat definition's perActorDefaultRules, then the
// stat's plain default. `context` should have `currentActor` set to the target actor so 'variable' actor-stat
// conditions in rules can inspect the target's own stats.
export const resolvePerActorStatValue = (
    hostActor: Pick<Actor, 'perActorStatMap' | 'perActorValueRules'>,
    stat: Stat,
    targetActorId: string,
    context: ConditionContext,
): StatValue => {
    const explicitValue = hostActor.perActorStatMap?.[stat.name]?.[targetActorId];
    if (explicitValue !== undefined) {
        return normalizeStatValue(explicitValue, stat);
    }

    const hostRuleValue = resolvePerActorValueRule(hostActor.perActorValueRules?.[stat.name], stat, context);
    if (hostRuleValue !== undefined) {
        return hostRuleValue;
    }

    const statRuleValue = resolvePerActorValueRule(stat.perActorDefaultRules, stat, context);
    if (statRuleValue !== undefined) {
        return statRuleValue;
    }

    return resolveStatDefault(stat);
};

const cloneStatInitialMap = (statInitialMap: unknown): { [key: string]: ActorStatInitial } => {
    if (!statInitialMap || typeof statInitialMap !== 'object' || Array.isArray(statInitialMap)) {
        return {};
    }
    return Object.fromEntries(Object.entries(statInitialMap as Record<string, any>).map(([statName, initial]) => [
        statName,
        {
            value: Array.isArray(initial?.value)
                ? normalizeLocationListValue(initial.value)
                : typeof initial?.value === 'boolean'
                ? initial.value
                : typeof initial?.value === 'string'
                    ? initial.value
                : Number.isFinite(initial?.value)
                    ? Number(initial.value)
                    : 0,
            modifiers: Array.isArray(initial?.modifiers) ? initial.modifiers.map(cloneStatModifier) : [],
        },
    ]));
};

export const ACTOR_SCHEDULE_AVAILABLE = 'available';
export const ACTOR_SCHEDULE_UNAVAILABLE = 'unavailable';
// Destination prefixes for schedule entries that resolve to a location dynamically via an ActorStat of type
// 'location', rather than a fixed location id; the suffix is the referenced ActorStat's id.
export const ACTOR_SCHEDULE_PLAYER_STAT_PREFIX = 'globalStat:';
export const ACTOR_SCHEDULE_ACTOR_STAT_PREFIX = 'actorStat:';
export type ActorSchedule = Record<string, ConditionCollection[]>;

export const cloneActorSchedule = (schedule: unknown): ActorSchedule => {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
        return {};
    }

    return Object.fromEntries(Object.entries(schedule).map(([destination, collections]) => {
        if (!Array.isArray(collections)) {
            return [destination, []];
        }
        const normalizedCollections = collections.length > 0 && !Array.isArray(collections[0])
            ? [collections]
            : collections;
        return [destination, normalizedCollections.map(collection => Array.isArray(collection) ? [...collection] : [])];
    }));
};

export type ScheduleContext = ConditionContext & {
    universalSchedule?: ActorSchedule;
    globalStats?: Stat[];
    actorStats?: Stat[];
};

// Resolves a stat's value to a single location id: 'location' stats already hold one, while 'locationList'
// stats hold a set and pick one deterministically for the given seed (so the same actor/destination/date/time
// always resolves to the same location, but different seeds can resolve independently).
const resolveStatLocationValue = (stat: Stat, value: StatValue | undefined, seed: string): string => {
    if (stat.type === 'locationList') {
        return pickSeededItem(normalizeLocationListValue(value), seed) || '';
    }
    return typeof value === 'string' ? value : '';
};

// Resolves a destination that references an ActorStat of type 'location'/'locationList' (see
// ACTOR_SCHEDULE_*_STAT_PREFIX) down to the actual location id it currently points to; a global stat reads
// from context.globalStatValues, while an actor stat reads from the scheduled actor's own statMap. Returns
// '' if unresolved.
const resolveScheduleStatDestination = (destination: string, actor: Pick<Actor, 'id' | 'statMap'>, context: ScheduleContext): string => {
    const seed = `${destination}|${context.currentDate || ''}|${context.currentTimeOfDay || ''}|${actor.id || ''}`;
    if (destination.startsWith(ACTOR_SCHEDULE_PLAYER_STAT_PREFIX)) {
        const statId = destination.slice(ACTOR_SCHEDULE_PLAYER_STAT_PREFIX.length);
        const stat = (context.globalStats || []).find(candidate => candidate.id === statId);
        if (!stat) {
            return '';
        }
        return resolveStatLocationValue(stat, context.globalStatValues?.[stat.id], seed);
    }
    if (destination.startsWith(ACTOR_SCHEDULE_ACTOR_STAT_PREFIX)) {
        const statId = destination.slice(ACTOR_SCHEDULE_ACTOR_STAT_PREFIX.length);
        const stat = (context.actorStats || []).find(candidate => candidate.id === statId);
        if (!stat) {
            return '';
        }
        return resolveStatLocationValue(stat, actor.statMap?.[stat.id], seed);
    }
    return destination;
};

// The actor's own rules are evaluated first, then the universal rules; the first matching destination wins,
// but any matching "unavailable" rule supersedes a matched location.
export const resolveActorSchedule = (actor: Pick<Actor, 'id' | 'name' | 'statMap' | 'schedule'>, context: ScheduleContext): string => {
    let destination = '';
    let unavailable = false;
    const evaluationContext: ScheduleContext = { ...context, currentActor: actor };

    for (const schedule of [actor.schedule, context?.universalSchedule]) {
        for (const [target, conditionCollections] of Object.entries(schedule || {})) {
            if (!evaluateConditionCollections(conditionCollections, evaluationContext)) {
                continue;
            }
            if (target === ACTOR_SCHEDULE_UNAVAILABLE) {
                unavailable = true;
            } else if (!destination) {
                destination = target;
            }
        }
    }

    if (unavailable) {
        return ACTOR_SCHEDULE_UNAVAILABLE;
    }
    if (!destination) {
        return ACTOR_SCHEDULE_AVAILABLE;
    }
    return resolveScheduleStatDestination(destination, actor, context) || ACTOR_SCHEDULE_AVAILABLE;
};


// An outfit represents a set of clothing or physical transformation that can be applied to a specific actor; each outfit comes with a full set of emotions
export type Outfit = {
    id: string;
    name: string;
    description: string;
    prompts: EmotionPack; // This emotionPack actually contains a map of prompts rather than image URLs. The keys are the same emotion keys, but the values are prompts describing how to alter the character's expression, pose, and overall demeanor to convey that emotion while wearing this outfit. These prompts are used to guide the image generation for each emotion when a character is wearing this outfit.
    emotionPack: EmotionPack;
    scale?: number; // Scale factor for the outfit, affecting the width of the character when rendered
    offsetX?: number; // Horizontal offset for the outfit, affecting the position of the character when rendered, as a percentage of the image's scaled width.
    offsetY?: number; // Vertical offset for the outfit, affecting the position of the character when rendered, as a percentage of the image's scaled height.
}

export class Actor {
    id: string = ''; // UUID
    loreId: string = ''; // The ID of the lore entry associated with this actor, if any. This is used to link the actor to their description in the lorebook.
    active: boolean = true; // Soft-delete flag. Inactive actors are hidden from management UIs.
    name: string = ''; // Full name (possibly with formatting, like last, first), to be used in content management.
    displayName: string = ''; // Name as it appears in NamePlate and chats, used everywhere beyond content management. Fall back to name.
    role: string = ''; // Optional role for this actor. This displays beneath the name in the NamePlate and under name in the ActorCard.
    birthDate: string = ''; // Optional birth date for this actor, in YYYY-MM-DD format. Used for age calculations and display.
    summary: string = ''; // A one-to-two sentence summary of this character. Used on ActorCard and in Creator Notes generation.
    description: string = ''; // Core physical description—not outfit-oriented
    background: string = ''; // Backstory and integral traits of this character (as opposed to "profile"/lore entry, which contains evolving details).
    profile: string = ''; // Evolving personality profile backed by a lore entry; this reflects the character's development and motives over time.
    category: string = ''; // A category for filtering or organization in the UI. Could be a role ("good guys", "baddies") or could be a type of character ("human", "elf"); it is for organizational and not gameplay purposes.
    outfitId: string = ''; // The ID of the current outfit for this actor; if empty, use the first outfit index
    outfits: Outfit[] = []; // Sets of outfits representing transformations for this actor; each outfit has a full set of emotions
    themeColor: string = ''; // Theme color (hex code)
    themeFontFamily: string = ''; // Font family stack for CSS styling
    voiceId: string = ''; // Voice ID for TTS
    voiceModulation: number = 1; // Modulation factor for the actor's voice in TTS (0.8 to 1.2)
    statMap: { [key: string]: StatValue } = {}; // Map of custom stat name to value for this actor
    statInitialMap: { [key: string]: ActorStatInitial } = {}; // Map of custom stat name to its initial value and conditional modifiers, used to seed statMap when a new game starts
    perActorStatMap: PerActorStatValueMap = {}; // For perActor stats: map of stat name to a map of target actorId to explicit value override
    perActorValueRules: PerActorValueRuleMap = {}; // For perActor stats: map of stat name to this actor's own default-value rules, which take precedence over the stat's perActorDefaultRules
    schedule: ActorSchedule = {}; // Destinations are evaluated in insertion order; the first matching collection wins.

    /**
     * Rehydrate an Actor from saved data
     */
    static fromSave(savedActor: any): Actor {
        const actor = Object.create(Actor.prototype);
        Object.assign(actor, savedActor);
        actor.active = savedActor?.active !== false;
        actor.voiceModulation = Math.min(1.2, Math.max(0.8, Number(savedActor?.voiceModulation) || 1));
        actor.statMap = savedActor?.statMap && typeof savedActor.statMap === 'object' ? { ...savedActor.statMap } : {};
        actor.statInitialMap = cloneStatInitialMap(savedActor?.statInitialMap);
        actor.perActorStatMap = clonePerActorStatValueMap(savedActor?.perActorStatMap);
        actor.perActorValueRules = clonePerActorValueRuleMap(savedActor?.perActorValueRules);
        actor.schedule = cloneActorSchedule(savedActor?.schedule);
        if (!Object.keys(actor.schedule).length && savedActor?.conditionCollections?.length) {
            actor.schedule = {
                [ACTOR_SCHEDULE_AVAILABLE]: savedActor.conditionCollections.map((collection: ConditionCollection) => [...collection]),
                [ACTOR_SCHEDULE_UNAVAILABLE]: [[]],
            };
        }
        return actor;
    }

    constructor(props: any) {
        Object.assign(this, props);
        if (!this.id) {
            this.id = generateUuid();
        }
        this.active = this.active !== false;
        this.voiceModulation = Math.min(1.2, Math.max(0.8, Number(this.voiceModulation) || 1));
        this.statMap = this.statMap && typeof this.statMap === 'object' ? { ...this.statMap } : {};
        this.statInitialMap = cloneStatInitialMap(this.statInitialMap);
        this.perActorStatMap = clonePerActorStatValueMap(this.perActorStatMap);
        this.perActorValueRules = clonePerActorValueRuleMap(this.perActorValueRules);
        this.schedule = cloneActorSchedule(this.schedule);
        if (!Object.keys(this.schedule).length && props?.conditionCollections?.length) {
            this.schedule = {
                [ACTOR_SCHEDULE_AVAILABLE]: props.conditionCollections.map((collection: ConditionCollection) => [...collection]),
                [ACTOR_SCHEDULE_UNAVAILABLE]: [[]],
            };
        }
    }
}

const DISTILLATION_FIELDS: StructuredFieldDefinition[] = [
    { key: 'name', label: 'NAME', description: 'Their simple name' },
    {
        key: 'role',
        label: 'ROLE',
        description: 'Their social or narrative role in the story, such as a warrior, scholar, councilor, or rival. Keep it concise.',
    },
    {
        key: 'birthDate',
        label: 'BIRTH DATE',
        description: 'A birth date for the character in YYYY-MM-DD format, based on age and the current date.',
    },
    {
        key: 'summary',
        label: 'SUMMARY',
        description: 'A very brief summary of the character and their role in the world or story. Use no more than two sentences; one sentence preferred.',
    },
    {
        key: 'description',
        label: 'DESCRIPTION',
        description: 'A vivid description of the character\'s core physical appearance: elements like gender, build, skin tone, eye color, hair color, ears, tails, or other distinguishing features.',
    },
    {
        key: 'outfit_description',
        label: 'OUTFIT DESCRIPTION',
        description: 'A detailed description of the character\'s current outfit, including style, colors, and any notable accessories or features.',
    },
    {
        key: 'outfit_name',
        label: 'OUTFIT NAME',
        aliases: ['OUTFIT'],
        description: 'A one- to two-word name for the character\'s current outfit that matches the description.',
    },
    {
        key: 'background',
        label: 'BACKGROUND',
        description: 'The character\'s fixed foundation: their backstory, origins, defining relationships, and integral traits that will not change over the course of the story.',
    },
    {
        key: 'profile',
        label: 'PROFILE',
        description: 'The character\'s current, evolving state: present personality traits, mannerisms, mood, goals, and motives as they stand right now. Do not restate the background; focus on what could plausibly shift as the story progresses.',
    },
    {
        key: 'voice',
        label: 'VOICE',
        description: 'Output the specific voice ID from the Available Voices section that best matches the character\'s apparent gender (foremost) and personality.',
    },
    {
        key: 'voice_modulation',
        label: 'VOICE MODULATION',
        description: 'A number from 0.8 to 1.2 that can mildly tune the selected voice down or up to suit the character. Use 1 for no modulation.',
    },
    {
        key: 'color',
        label: 'COLOR',
        description: 'A hex color that reflects the character\'s theme or mood—use darker or richer colors that will contrast with white text.',
    },
    {
        key: 'font',
        label: 'FONT',
        description: 'A font stack, or font family that reflects the character\'s personality; favor Google fonts when possible. This will be embedded in a CSS font-family property.',
    },
];

const OUTFIT_PROMPT_FIELDS: StructuredFieldDefinition[] = [
    {
        key: 'artPrompt',
        label: 'ART PROMPT',
        description: 'One concise image-edit prompt describing expression, posture, and demeanor changes for the target mood.',
    },
];

function buildActorStatFields(actorStats: Stat[], stage?: Stage): StructuredFieldDefinition[] {
    return actorStats.map((stat, index) => ({
        key: `stat_${index}`,
        label: `STAT ${index + 1}`,
        description:
            `${stat.type === 'checkbox' ? 'Boolean value' : 'Numeric value'} for "${stat.name}".` +
            ` Description: ${resolveStatText(stat.description, stage) || 'N/A'}.` +
            ` Guidance: ${resolveStatText(stat.guidance, stage) || 'N/A'}.` +
            `${stat.type === 'checkbox' ? ` Default: ${stat.default === true}.` : ` Range: ${typeof stat.min === 'number' ? stat.min : '-inf'} to ${typeof stat.max === 'number' ? stat.max : '+inf'}. Default: ${Number.isFinite(stat.default) ? Number(stat.default) : 0}.`}`,
    }));
}

function clampActorStatValue(value: number, stat: Stat): number {
    let normalized = Number.isFinite(value) ? Number(value) : Number(stat.default) || 0;
    if (typeof stat.min === 'number') {
        normalized = Math.max(stat.min, normalized);
    }
    if (typeof stat.max === 'number') {
        normalized = Math.min(stat.max, normalized);
    }
    return normalized;
}

// Computes an actor's initial stat value from its configured initial value and any modifiers whose conditions currently evaluate true.
export function resolveInitialActorStatValue(stat: Stat, initial: ActorStatInitial | undefined, context: ConditionContext): StatValue {
    if (stat.type === 'text' || stat.type === 'location' || stat.type === 'locationList') {
        return (initial?.modifiers || []).reduce((currentValue, modifier) => {
            return evaluateConditionCollections(modifier.conditions, context)
                ? normalizeStatValue(modifier.amount, stat, { evaluateDiceNotation: true })
                : currentValue;
        }, normalizeStatValue(initial?.value ?? stat.default, stat, { evaluateDiceNotation: true }));
    }

    if (stat.type === 'option') {
        return normalizeStatValue(initial?.value ?? stat.default, stat, { evaluateDiceNotation: true });
    }

    if (stat.type === 'checkbox') {
        const baseValue = typeof initial?.value === 'boolean'
            ? initial.value
            : typeof stat.default === 'boolean'
                ? stat.default
                : false;
        return baseValue;
    }

    const normalizedBaseValue = normalizeStatValue(initial?.value ?? stat.default, stat, { evaluateDiceNotation: true });
    const baseValue = Number.isFinite(normalizedBaseValue) ? Number(normalizedBaseValue) : 0;
    const modifierTotal = (initial?.modifiers || []).reduce((total, modifier) => {
        return evaluateConditionCollections(modifier.conditions, context) ? total + (Number.isFinite(modifier.amount) ? Number(modifier.amount) : 0) : total;
    }, 0);
    return clampActorStatValue(baseValue + modifierTotal, stat);
}

// Seeds an actor's statMap from its statInitialMap; used when initializing actors for a new game.
export function applyActorInitialStats(actor: Actor, actorStats: Stat[], context: ConditionContext): void {
    if (!actor.statMap || typeof actor.statMap !== 'object') {
        actor.statMap = {};
    }
    actorStats
        .filter(stat => stat?.name?.trim() && !stat.perActor)
        .forEach(stat => {
            actor.statMap[stat.id] = resolveInitialActorStatValue(stat, actor.statInitialMap?.[stat.id] || actor.statInitialMap?.[stat.name], context);
        });
}

// Mapping of voice IDs to a description of the voice, so the AI can choose an ID based on the character profile.
export const VOICE_MAP: {[key: string]: string} = {
    //'751212e5-a871-45c7-b10b-6f42a5785954': 'Feminine - British Accent - Posh and catty', // Obsolete version of Ilithya
    '03a438b7-ebfa-4f72-9061-f086d8f1fca6': 'Feminine - American - Warm and soothing',
    'a2533977-83cb-4c10-9955-0277e047538f': 'Feminine - American - Energetic and youthful',
    '057d53b3-bb28-47f1-9c19-a85a79851863': 'Feminine - American - Low and warm',
    '6e6619ba-4880-4cf3-a5df-d0697ba46656': 'Feminine - American - High and soft',
    'd6e05564-eea9-4181-aee9-fa0d7315f67d': 'Masculine - American - Cool and confident',
    'e6b74abb-f4b2-4a84-b9ef-c390512f2f47': 'Masculine - American - Posh and articulate',
    'bright_female_20s': 'Feminine - American - Bright and cheerful',
    'resonant_male_40s': 'Masculine - American - Resonant and mature',
    'gentle_female_30s': 'Feminine - American - Gentle and caring',
    'whispery_female_40s': 'Feminine - American - Whispery and mysterious',
    'formal_female_30s': 'Feminine - American - Formal and reedy',
    'professional_female_30s': 'Feminine - American - Professional and direct',
    'calm_female_20s': 'Feminine - American - Calm and soothing',
    'light_male_20s': 'Masculine - American - Light and thoughtful',
    'animated_male_20s': 'Masculine - American - Hip and lively',

    '6d147025-53bf-479b-a159-8a1510c6bb92': 'Androgynous - French - Youthful and softspoken', // Pikatchoum
    'f6e0ffd3-b512-4261-b4e4-e161391046fc': 'Feminine - American - Fried and youthful', // Daisy4Dayz
    '77a6e53d-16c7-47d7-84cc-5ea307e3a11d': 'Feminine - British - Saucy and bright', // BretonBrat
    '8c9b8c56-20e6-490e-b787-8efcff4e89f7': 'Feminine - British - Haughty and catty', // Ilithya
    '1e0aa062-c5ee-4731-9fa1-c34c11097b03': 'Feminine - French - Mature and warm', // Madame LaMarquise
    'bb3e5ef7-2eda-470c-b93b-32c39d285b0e': 'Feminine - French - Soft and insecure', // ohPaytriarchy
    '3383a73e-5a5b-4155-a741-5f0fe21b5b11': 'Feminine - French - High and light', // chocolatine_va ****
    'ae245bb9-83a9-4b34-9aa8-f670431b9c82': 'Feminine - French - Low and breathy', // VenusDeVelours ****
    '23626ae8-691f-45d4-9870-7fddea8a0184': 'Feminine - French - Nasal and youthful', // Solene-Cherie
    '9f882b0a-d0da-4d7d-ad0d-e868b851b6f1': 'Feminine - French - Bright and confident', // RosalinaKinks
    '35b7e629-4df8-4c0e-a107-d037c594838a': 'Feminine - French - Bright and warm', // EllyHart456
    '48d3008b-b1fd-4c36-81ea-d2f36413da9a': 'Feminine - French - Light and airy', // hummingael *****
    '3b46afa4-62a6-4ba7-9652-e5065d75db6e': 'Feminine - Multilingual - Calm and low', // youronlynora
    'a3a9a163-a283-4ba7-8535-d3f583ed342d': 'Feminine - Slavic - Keen and direct', // audio_allure
    'bfb9b9b1-e25e-4c06-859a-1271e29cc9d4': 'Masculine - British - Bold and whimsical', // Matt Berry
    '5004afbd-9f53-48af-8947-e8c31db03bd5': 'Masculine - French - Low and commanding', // candeur
    'e735ff09-8ab1-4a74-bff6-7b17f0207e9b': 'Masculine - French - Deep and resonant', // audioByDominic
    '74bedcda-2fcf-43ab-9aee-66b2bad14f69': 'Masculine - French - Light and relaxed', // Elias23h47
    '7fef668b-5cc4-47b1-b9ca-7dcadac15bf3': 'Masculine - French - Deep and warm', // daddydeep
    '825b8263-63ca-4729-82a6-78855b637214': 'Masculine - French - Friendly and approachable', // mercadien
    
};


export async function distillActor(actor: Actor, definition: any, stage: Stage, isCreatorMode: boolean = false): Promise<Actor|null> {
    console.log('Loading reserve actor:', definition.name);
    console.log(definition);

    // Location stats reference atlas IDs, which the distillation model has no way to supply.
    const actorStats = (stage.getConfiguration().actorStats || []).filter(stat => stat?.name?.trim() && stat.type !== 'location');
    const actorStatFields = buildActorStatFields(actorStats, stage);
    const distillationFields = DISTILLATION_FIELDS.concat(actorStatFields);

    // Preserve content while removing JSON-like structures.
    const definitionPersonality = String(definition.personality || actor.profile || actor.description || actor.name || '')
        .replace(/{/g, '(')
        .replace(/}/g, ')');
    definition.personality = definitionPersonality;

    const actorStatContext = actorStats.length > 0
        ? actorStats.map((stat, index) => {
            if (stat.type === 'checkbox') {
                return `${index + 1}. ${stat.name}\nDescription: ${resolveStatText(stat.description, stage) || 'N/A'}\nGuidance: ${resolveStatText(stat.guidance, stage) || 'N/A'}\nType: checkbox\nDefault: ${stat.default === true}`;
            }
            const defaultValue = Number.isFinite(stat.default) ? Number(stat.default) : 0;
            const minValue = typeof stat.min === 'number' ? `${stat.min}` : '-inf';
            const maxValue = typeof stat.max === 'number' ? `${stat.max}` : '+inf';
            return `${index + 1}. ${stat.name}\nDescription: ${resolveStatText(stat.description, stage) || 'N/A'}\nGuidance: ${resolveStatText(stat.guidance, stage) || 'N/A'}\nRange: ${minValue} to ${maxValue}\nDefault: ${defaultValue}`;
        }).join('\n\n')
        : 'No custom actor stats are configured.';

    const exampleStatValues = Object.fromEntries(actorStatFields.map((field, index) => {
        const sourceStat = actorStats[index];
        const fallbackValue = sourceStat?.type === 'checkbox'
            ? `${sourceStat.default === true}`
            : `${Number.isFinite(sourceStat?.default) ? Number(sourceStat.default) : 0}`;
        return [field.key, fallbackValue];
    }));

    // Take this data and use text generation to get an updated distillation of this character, including a physical description.
    const save = stage.getSave();
    const configuration = stage.getConfiguration();
    const worldContext = formatLoreEntriesAsContext(selectConstantLoreEntries(save.lorebook || [], { ...save, globalStats: configuration.globalStats, actorStats: configuration.actorStats })) || 'None provided.';
    const otherActorsContext = Object.values(stage.getSave().actors || {})
        .filter(otherActor => otherActor?.id && otherActor.id !== actor.id && otherActor.active !== false && otherActor !== stage.getPlayerActor())
        .map(otherActor => {
            return `${otherActor.name}\n` +
                (otherActor.role ? `  Role: ${otherActor.role}\n` : '') +
                (otherActor.birthDate ? `  Birth Date: ${otherActor.birthDate}\n` : '') +
                `  Summary: ${otherActor.summary || 'No summary available.'}\n` +
                `  Background: ${otherActor.background || 'No background available.'}\n` +
                `  Profile: ${getActorLore(otherActor.id, stage) || 'No profile available.'}`
        })
        .join('\n\n') || 'No other active actors are present in the world context.';

    const generationRequest = stage.generateText(buildPrompt()
            .addBlock('Instructions',
                `This is preparatory request for structured and formatted game content. ` +
                `The world and its rules are described below. ` +
                `The character details below describe a character of this world (${actor.name}) to convert into a set of defined fields for this game.`)
            .addBlock('World Context', worldContext)
            .addBlock('Other Actors', otherActorsContext)
            .addBlock('Current Date', formatCurrentDate(stage.getSave().currentDate, stage.getSave().currentTimeOfDay))
            .addBlock('Target Character', actor.name)
            .addBlock('Source Details', definition.personality)
            .addBlock('Custom Actor Stats', actorStatContext)
            .addBlock('Stat Guidance',
                actorStats.length > 0
                    ? `Output one numeric value for each STAT field in the response format. Keep values in range and aligned with the character profile.`
                    : `No stat output is required beyond the base fields.`)
            .addBlock('Available Voices', Object.entries(VOICE_MAP).map(([voiceId, voiceDesc]) => ' - ' + voiceId + ': ' + voiceDesc).join('\n'))
            .addBlock('Response Format',
                buildStructuredResponseFormat(distillationFields, { includeEndTag: true }))
            .addBlock('Example Response',
                buildStructuredExampleResponse(
                    distillationFields,
                    {
                        name: 'Jane Doe',
                        role: 'Frontier Mercenary',
                        birthDate: '1992-08-14',
                        summary: 'Jane is a frontier mercenary driven by loyalty to the people she cannot leave behind.',
                        description: 'A tall, athletic woman with short, dark hair and piercing blue eyes. She rarely smiles, but when she does, it lights up her face.',
                        outfit_description: 'She wears a simple, utilitarian outfit made from durable materials in dark colors. Lots of pockets and zippers.',
                        outfit_name: 'Adventurer\'s Gear',
                        background: 'Raised in a border settlement that was burned out when she was twelve, Jane came up through mercenary companies and learned early that promises are collateral. Her older brother, still missing after the raid, is the reason she keeps taking contracts along the frontier. She is unflinchingly loyal to the handful of people who have earned it, and constitutionally incapable of walking away from someone who cannot defend themselves.',
                        profile: 'Jane is confident and determined, quick-witted, and fiercely independent. Known for her sharp wit and strong presence, she has a commanding aura that draws attention. Deep down, Jane is driven by a need to prove she\'s worthy of love despite her past betrayals. She\'s here looking for someone who will challenge her and see beyond her tough exterior.',
                        voice: '03a438b7-ebfa-4f72-9061-f086d8f1fca6',
                        voice_modulation: '1.00',
                        color: '#666666',
                        font: 'Calibri, sans-serif',
                        ...exampleStatValues,
                    },
                    { includeEndTag: true }
                ))
            .addBlock('Task',
                `Output a single structured response that populates the required fields for this character: ${actor.name}.`
            )
        .format(),
        100,
        1000,
        distillationFields,
    );

    try {
        stage.generationPromises[`distilling_actor/${actor.id}`] = generationRequest;
        const generatedResponse = await generationRequest;
        if (generatedResponse === null || generatedResponse === undefined) {
            throw new Error(`Failed to generate distillation for actor ${actor.name}. Using existing data.`);
        }
        console.log('Generated character distillation:');
        console.log(generatedResponse);
        const parsedData = parseStructuredResponse(generatedResponse, distillationFields);

        // Validate that parsedData['color'] is a valid hex color, otherwise assign a random default:
        const themeColor = /^#([0-9A-F]{6}|[0-9A-F]{8})$/i.test(parsedData['color']) ?
                parsedData['color'] :
                ['#788ebdff', '#d3aa68ff', '#75c275ff', '#c28891ff', '#55bbb2ff'][Math.floor(Math.random() * 5)];

        const oldName = actor.name;
        // Fill in actor, but favor any current settings:
        actor.name = parsedData['name'] || actor.name || '';
        actor.displayName = actor.name;
        actor.role = parsedData['role'] || actor.role || '';
        actor.birthDate = parsedData['birthDate'] || actor.birthDate || '';
        actor.summary = parsedData['summary'] || actor.summary || '';
        actor.description = parsedData['description'] || actor.description || '';
        actor.background = parsedData['background'] || actor.background || '';
        actor.profile = parsedData['profile'] || actor.profile || '';
        actor.voiceId = parsedData['voice'] || actor.voiceId || '';
        const parsedVoiceModulation = Number(parsedData['voice_modulation']);
        actor.voiceModulation = Number.isFinite(parsedVoiceModulation)
            ? Math.min(1.2, Math.max(0.8, parsedVoiceModulation))
            : actor.voiceModulation;
        actor.themeColor = themeColor || actor.themeColor;
        actor.themeFontFamily = parsedData['font'] || actor.themeFontFamily || 'Arial, sans-serif';
        actor.outfits = actor.outfits.length > 0 ? actor.outfits : [];
        actor.statMap = actor.statMap && typeof actor.statMap === 'object' ? { ...actor.statMap } : {};

        actorStats.forEach((stat, index) => {
            const parsedValue = Number(parsedData[`stat_${index}`]);
            const currentValue = Number(actor.statMap[stat.id]);
            const fallbackValue = Number.isFinite(currentValue) ? currentValue : (Number.isFinite(stat.default) ? Number(stat.default) : 0);
            const resolvedValue = Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
            actor.statMap[stat.id] = clampActorStatValue(resolvedValue, stat);
        });

        upsertActorLoreEntry(actor, oldName, stage, isCreatorMode);

        if (parsedData['outfit_description'] && parsedData['outfit_name']) {
            const outfit: Outfit = {
                id: generateUuid(),
                name: parsedData['outfit_name'],
                description: parsedData['outfit_description'],
                prompts: {},
                emotionPack: {},
            };
            actor.outfits.push(outfit);
        }

        const currentOutfit = getActiveOutfit(actor);
        if (!currentOutfit.emotionPack['base']) {
            // Kick off base image generation:
            currentOutfit.name = parsedData['outfit_name'] || currentOutfit.name;
            currentOutfit.description = parsedData['outfit_description'] || currentOutfit.description;
            await generateBaseActorImage(actor, stage, false, true, actor.outfitId);
        } else if (!currentOutfit.emotionPack['neutral']) {
            // Kick off neutral image generation:
            await generateEmotionImage(actor, Emotion.neutral, stage, false, actor.outfitId);
        }
        delete stage.generationPromises[`distilling_actor/${actor.id}`];
        console.log('Removed generation promise: distilling_actor/' + actor.id);
        return actor;
    } catch (error) {
        delete stage.generationPromises[`distilling_actor/${actor.id}`];
        return null;
    }
}

export function upsertActorLoreEntry(actor: Actor, oldName: string, stage: Stage, isCreatorMode: boolean = false): void {
    let loreEntry = getLinkedActorLore(actor, stage, isCreatorMode);
    // If the actor has no associated lorebook record; create one with the character's name as the title and the profile as the content.
    if (!loreEntry) {
        loreEntry = createLoreEntry({
            type: 'character',
            title: actor.name,
            content: actor.profile,
            triggers: [],
            enabled: true,
            constant: false,
            insertionOrder: 0,
            priority: 0,
            probability: 100
        });
        if (isCreatorMode) {
            stage.getConfiguration().lorebook.push(loreEntry);
        } else {
            stage.getSave().lorebook?.push(loreEntry);
        }
    }
    loreEntry.title = actor.name;
    loreEntry.content = actor.profile;
    loreEntry.triggers = [...loreEntry.triggers.filter((trigger) => !oldName.includes(trigger)), ...actor.name.split(' ').filter(word => word.length > 2 && word.charAt(word.length - 1) !== '.')];

    if (!isCreatorMode) {
        stage.getSave().lorebook = stage.getSave().lorebook || [];
        stage.saveGame();
    }
}

function getActiveOutfit(actor: Actor): Outfit {
    if (actor.outfits.length === 0) {
        // Return a default outfit if none exist to avoid errors; this will be updated with real data when the emotion images are generated.
        actor.outfits.push({
            id: generateUuid(),
            name: 'Default Outfit',
            description: '',
            prompts: {},
            emotionPack: {}
        });
    }
    if (!actor.outfitId) {
        actor.outfitId = actor.outfits[0].id;
        return actor.outfits[0];
    } else {
        return actor.outfits.find(outfit => outfit.id === actor.outfitId) || actor.outfits[0];
    }
}

export function getOutfitById(actor: Actor, outfitId: string = ''): Outfit {
    const resolvedOutfitId = outfitId || actor.outfitId;
    return actor.outfits.find((outfit) => outfit.id === resolvedOutfitId) || getActiveOutfit(actor);
}

function getOutfitPrompt(outfit: Outfit, emotion: Emotion): string {
    return outfit.prompts?.[emotion] || '';
}

function setOutfitPrompt(outfit: Outfit, emotion: Emotion, prompt: string) {
    outfit.prompts = {
        ...(outfit.prompts || {}),
        [emotion]: prompt,
    };
}

export async function generateOutfitEmotionPrompt(actor: Actor, emotion: Emotion, stage: Stage, outfitId: string = ''): Promise<string> {
    const outfit = getOutfitById(actor, outfitId);
    const generationKey = `actor-prompt/${actor.id}/${outfit.id}/${emotion}`;
    const existingGeneration = stage.generationPromises[generationKey];
    if (existingGeneration) {
        return existingGeneration as Promise<string>;
    }

    const promptRequest = stage.generateText(buildPrompt()
        .addBlock('Instructions',
            `This is a preparatory request for a single image-edit instruction for character art generation. ` +
            `Write exactly one concise prompt for an image editing model to revise a base image of this character already in this outfit. ` +
            `The prompt is intended to guide the model in adjusting an image to suit the target mood by visually describing changes to this character's expression, posture, gesture, ` +
            `and demeanor in a way that takes their style, personality, and outfit into account where appropriate. ` +
            `Only describe elements that are relevant to the target image. Avoid incorporating environmental details, which cannot exist in the final portrait image. `)
        .addBlock('Character Core Appearance', actor.description)
        .addBlock('Current Outfit', outfit.description)
        .addBlock('Personality and Public Persona', actor.profile)
        .addBlock('Target Mood', `${emotion} (${EMOTION_PROMPTS[emotion]})`)
        .addBlock('Response Format',
            buildStructuredResponseFormat(OUTFIT_PROMPT_FIELDS, { includeEndTag: true }))
        .addBlock('Example Response',
            buildStructuredExampleResponse(
                OUTFIT_PROMPT_FIELDS,
                {
                    artPrompt: 'This woman is now in a flirty, playful mood. She smiles and leans forward slightly, with a glint in her half-lidded eyes. She blushes and plays with her hair.',
                },
                { includeEndTag: true },
            ))
        .addBlock('Example Response',
            buildStructuredExampleResponse(
                OUTFIT_PROMPT_FIELDS,
                {
                    artPrompt: 'This man is now in a somber, reflective mood. He looks downcast, with slumped shoulders and a frown. His eyes look down and away, and he appears lost in thought.',
                },
                { includeEndTag: true },
            ))
        .format(),
        10,
        250,
        OUTFIT_PROMPT_FIELDS,
    )
    .then((response: any) => {
        const parsedPrompt = parseStructuredResponse(`${response || ''}`, OUTFIT_PROMPT_FIELDS);
        const generatedPrompt = (parsedPrompt.artPrompt || '').trim();
        if (generatedPrompt) {
            setOutfitPrompt(outfit, emotion, generatedPrompt);
            stage.saveGame();
        }
        return generatedPrompt;
    }).finally(() => {
        delete stage.generationPromises[generationKey];
    });

    stage.generationPromises[generationKey] = promptRequest;
    return promptRequest;
}

export function getEmotionImage(actor: Actor, emotion: Emotion | string, stage?: Stage, outfitId: string = ''): string {
    const targetOutfitId = outfitId || actor.outfitId;
    if (!actor.outfits || actor.outfits.length === 0) {
        return '';
    }
    const emotionKey = typeof emotion === 'string' ? emotion : emotion;
    const emotionPack = getOutfitById(actor, targetOutfitId).emotionPack;
    const emotionUrl = emotionPack[emotionKey];
    const neutralUrl = emotionPack['neutral'] || emotionPack['base'];
    const fallbackUrl = neutralUrl || '';

    // Return the emotion image or fallback
    return emotionUrl || fallbackUrl;
}

function setEmotionImageUrl(actor: Actor, emotion: Emotion | string, outfitId: string = '', url: string = '') {
    const targetOutfitId = outfitId || actor.outfitId;
    const emotionPack = getOutfitById(actor, targetOutfitId).emotionPack;
    emotionPack[emotion] = url;
}

export async function generateBaseActorImage(
    actor: Actor,
    stage: Stage,
    force: boolean = false,
    fromAvatar: boolean = true,
    outfitId: string = '',
    sourceImageUrl: string = ''
): Promise<void> {
    const targetOutfitId = outfitId || actor.outfitId;
    const currentBaseImageUrl = getEmotionImage(actor, 'base', stage, targetOutfitId);

    console.log(`Populating images for actor ${actor.name} (ID: ${actor.id})`);
    // If the actor has no neutral emotion image in their emotion pack, generate one based on their description or from the existing avatar image
    if (!getOutfitById(actor, targetOutfitId).emotionPack['neutral'] || force) {
        console.log(`Generating base emotion image for actor ${actor.name}`);
        // Want to clear in-progress stuff if forcing
        if (force) {
            getOutfitById(actor, targetOutfitId).emotionPack = {};
            delete stage.generationPromises[`actor/${actor.id}`];
        }
        let imageUrl = '';
        let baseSourceImage = sourceImageUrl || '';
        
        if (!baseSourceImage || !fromAvatar) {
            console.log(`Generating new image for actor ${actor.name} from description`);
            // Use stage.makeImage to create a neutral expression based on the description
            imageUrl = await stage.makeImage({
                prompt: `Core appearance: ${actor.description}\n` +
                    `Outfit: ${getOutfitById(actor, targetOutfitId).description}.\n` +
                    `Ignore feet details, and create a waist-up portrait of this character with a neutral expression and pose, placed on a light gray background.`,
                aspect_ratio: AspectRatio.SQUARE
            }, '');
            baseSourceImage = imageUrl || '';
        }
        // Use stage.makeImageFromImage to create a base image.
        imageUrl = await stage.makeImageFromImage({
            image: await getDataUrl(baseSourceImage),
            prompt: `If necessary, alter this character to match their physical description:\n` +
                `${actor.description}\n` +
                `And current outfit:\n${getOutfitById(actor, targetOutfitId).description}\n` +
                `Swap the background to a textured gradient that garishly clashes with the character's palette.`,
            remove_background: false,
            transfer_type: 'edit'
        }, '');
        
        console.log(`Generated base emotion image for actor ${actor.name} from avatar image: ${imageUrl || ''}`);
        
        setEmotionImageUrl(actor, 'base', targetOutfitId, imageUrl || '');

        if (force) {
            // Invalidate all other emotions
            getOutfitById(actor, targetOutfitId).emotionPack = {'base': getEmotionImage(actor, 'base', stage, targetOutfitId)};
        }
        if (currentBaseImageUrl !== getEmotionImage(actor, 'base', stage, targetOutfitId)) {
            console.log('Done and base image has changed.');
            await generateEmotionImage(actor, Emotion.neutral, stage, false, targetOutfitId);
        }
        delete stage.generationPromises[`actor/${actor.id}`];
    }
}

async function getDataUrl(baseImageUrl: string): Promise<string> {
        // If baseImageUrl is an assets URL, we need to convert it to a data URL:
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

export async function generateEmotionImage(actor: Actor, emotion: Emotion, stage: Stage, force: boolean = false, outfitId: string = ''): Promise<string> {
    const targetOutfitId = outfitId || actor.outfitId;
    console.log(`Generating ${emotion} emotion image for actor ${actor.name} (ID: ${actor.id}) with outfit ID: ${targetOutfitId}`);
    if (getEmotionImage(actor, 'base', stage, targetOutfitId) && (!stage.generationPromises[`actor/${actor.id}`] || force)) {
        console.log(`Generating ${emotion} emotion image for actor ${actor.name}`);
        // Create a dummy promise to prevent duplicate generation while this is in progress; this will be deleted when the generation is complete
        try {
            stage.generationPromises[`actor/${actor.id}`] = new Promise(() => {});

            const outfit = getOutfitById(actor, targetOutfitId);
            const emotionPrompt = getOutfitPrompt(outfit, emotion) || await generateOutfitEmotionPrompt(actor, emotion, stage, targetOutfitId);
            console.log(`Using emotion prompt for ${emotion}: ${emotionPrompt}`);

            let baseImageUrl = await getDataUrl(getEmotionImage(actor, 'base', stage, targetOutfitId));

            const imageUrl = await stage.makeImageFromImage({
                image: baseImageUrl || '',
                prompt: emotionPrompt,
                remove_background: true,
                transfer_type: 'edit'
            }, '');
            delete stage.generationPromises[`actor/${actor.id}`];
            console.log(`Generated ${emotion} emotion image for actor ${actor.name}: ${imageUrl || ''}`);
            getOutfitById(actor, targetOutfitId).emotionPack[emotion] = imageUrl || '';
            return imageUrl || '';
        } catch (error) {
            delete stage.generationPromises[`actor/${actor.id}`];
        }
    }
    return '';
}

export function getLinkedActorLore(actor: Actor, stage: Stage, isCreatorMode: boolean = false) {
    const save = stage.getSave();
    const lorebook = isCreatorMode ? stage.getConfiguration().lorebook : save.lorebook;
    const actors = isCreatorMode ? stage.getConfiguration().actors : Object.values(save.actors);
    if (actor && actor.loreId) {
        const loreEntry = lorebook?.find(lore => lore.id === actor.loreId);
        if (loreEntry) {
            return loreEntry;
        }
        actor.loreId = ''; // Clear the loreId if it no longer exists
    }
    // Don't pick something that another actor is already linked to; only consider unassociated lore entries.
    const unassociatedLoreEntries = lorebook?.filter(lore => lore.type === 'character' && !actors.some(a => a.loreId === lore.id)) ?? [];
    const bestMatch = findBestNameMatch(actor.name, unassociatedLoreEntries, ['title']);
    if (bestMatch) {
        actor.loreId = bestMatch.id; // Link the actor to the best matching lore entry
    }
	return bestMatch;
}

export function getActorLore(actorId: string, stage: Stage) {
	const actor = stage.getSave().actors[actorId];
	if (!actor) {
		return '';
	}

	const lore = getLinkedActorLore(actor, stage);
    const save = stage.getSave();
    const configuration = stage.getConfiguration();
    const variableLoreText = (stage.getSave().lorebook || [])
        .filter((entry) => entry?.enabled && entry?.title && hasVariableActorTarget(entry.conditionCollections))
        .filter((entry) => evaluateConditionCollections(entry.conditionCollections, {
            actors: [actor],
            currentActor: actor,
            actorStatValues: { [actor.id]: actor.statMap || {} },
            globalStatValues: save.globalStatValues,
            globalStats: configuration.globalStats,
            actorStats: configuration.actorStats,
        }))
        .map((entry) => `Additional Instruction: ${entry.title}\n${entry.content}`)
        .join('\n\n');
	return [lore?.content ?? '', variableLoreText].filter(Boolean).join('\n\n');
}

export function updateActorProfile(actorId: string, profile: string, stage: Stage) {
    const actor = stage.getSave().actors[actorId];
    if (!actor) {
        return;
    }

    actor.profile = profile;
}

export function updateActorLore(actorId: string, lore: string, stage: Stage, isCreatorMode: boolean = false) {
    const actors = isCreatorMode ? stage.getConfiguration().actors : Object.values(stage.getSave().actors);
    const actor = actors.find(candidate => candidate.id === actorId);
	if (!actor) {
		return;
	}

    const linkedLore = getLinkedActorLore(actor, stage, isCreatorMode);
	if (linkedLore) {
		linkedLore.content = lore;
	}
}

const formatActorStatValue = (value: StatValue, stat: Stat, atlas?: { [key: string]: { name: string } }): string => {
    if (stat.type === 'checkbox') {
        return value === true ? 'yes' : 'no';
    }
    if (stat.type === 'location') {
        return atlas?.[String(value)]?.name || 'unknown location';
    }
    if (isNumericDisplayType(stat.type)) {
        const min = typeof stat.min === 'number' ? stat.min : undefined;
        const max = typeof stat.max === 'number' ? stat.max : undefined;
        const range = min !== undefined || max !== undefined ? ` (of ${min ?? '-inf'} to ${max ?? '+inf'})` : '';
        return `${value}${range}`;
    }
    return String(value ?? '');
};

// Used to build actor context for LLM requests. The `options` parameter allows specifying which elements of the actor's information should be included, such as outfit details, description, profile, stats, and lore.
export function buildActorContext(actor: Actor, outfitId: string, stage: Stage, otherActors: Actor[] = [], options: string[] = ['outfit', 'wardrobe', 'summary', 'description', 'profile', 'stats', 'lore']): PromptBuilder {
    const builder = buildPrompt(actor.displayName || actor.name);
    const currentOutfit = actor.outfits.find(a => a.id === outfitId) ?? actor.outfits[0];
    const wardrobe = actor.outfits.filter(o => o.id !== currentOutfit?.id && o.emotionPack['neutral']);
    const save = stage.getSave();

    if (options.includes('summary') && actor.summary) {
        builder.addBlock('Summary', actor.summary);
    }

    if (options.includes('description') && actor.description) {
        builder.addBlock('Description', actor.description);
    }

    if (options.includes('profile')) {
        const profile = [actor.background, options.includes('lore') ? getActorLore(actor.id, stage) : actor.profile]
            .map(text => (text || '').trim())
            .filter(Boolean)
            .join('\n\n');
        if (profile) {
            builder.addBlock('Profile', profile);
        }
    }

    if (options.includes('outfit') && currentOutfit) {
        builder.addBlock('Current Outfit', `${currentOutfit.name}: ${currentOutfit.description}`);
    }

    if (options.includes('wardrobe') && wardrobe.length > 0) {
        builder.addBlock('Other Outfits', wardrobe.map(outfit => outfit.name).join(', '));
    }

    if (options.includes('stats')) {
        const actorStatContext: ConditionContext = {
            currentDate: save.currentDate,
            currentTimeOfDay: save.currentTimeOfDay,
            globalStatValues: save.globalStatValues,
            globalStats: stage.getConfiguration().globalStats,
            actorStats: stage.getConfiguration().actorStats,
            actors: save.actors,
            currentActor: { id: actor.id, name: actor.name, statMap: actor.statMap },
        };
        const actorStats = (stage.getConfiguration().actorStats || []).filter(stat => stat?.name?.trim() && isStatLlmSeen(stat, actorStatContext));
        const scalarStatLines = actorStats
            .filter(stat => !stat.perActor && actor.statMap?.[stat.id] !== undefined)
            .map(stat => `${stat.name}: ${formatActorStatValue(normalizeStatValue(actor.statMap[stat.id], stat), stat, save.atlas)}`);
        if (scalarStatLines.length > 0) {
            builder.addBlock('Stats', scalarStatLines.join('\n'));
        }

        // Per-actor stats are mappings toward every other actor; only report entries for the supplied otherActors.
        const perActorStats = actorStats.filter(stat => stat.perActor);
        const targetActors = otherActors.filter(other => other && other.id !== actor.id);
        if (perActorStats.length > 0 && targetActors.length > 0) {
            const perActorLines = targetActors.map(target => {
                const context: ConditionContext = {
                    currentDate: save.currentDate,
                    currentTimeOfDay: save.currentTimeOfDay,
                    globalStatValues: save.globalStatValues,
                    globalStats: stage.getConfiguration().globalStats,
                    actorStats: stage.getConfiguration().actorStats,
                    actors: save.actors,
                    currentActor: { id: target.id, name: target.name, statMap: target.statMap },
                };
                const values = perActorStats
                    .map(stat => `${stat.name}: ${formatActorStatValue(resolvePerActorStatValue(actor, stat, target.id, context), stat, save.atlas)}`)
                    .join('; ');
                return `${target.displayName || target.name} - ${values}`;
            });
            builder.addBlock('Stats Toward Others', perActorLines.join('\n'));
        }
    }

    return builder;
}

/**
 * Calculate a similarity score between two names. Higher scores indicate better matches.
 * Returns a value between 0 and 1, where 1 is a perfect match.
 * @param name The reference name
 * @param possibleName The name to compare against
 * @returns A similarity score between 0 and 1
 */
export function getNameSimilarity(name: string, possibleName: string): number {
    name = name.toLowerCase();
    possibleName = possibleName.toLowerCase();

    // Exact match gets perfect score
    if (name === possibleName) {
        return 1.0;
    }

    // Check word-based matching first (higher priority)
    const names = name.split(' ').filter(word => word.length > 0);
    
    // Count matching words
    let matchingWords = 0;
    for (const namePart of names) {
        if (possibleName.includes(namePart)) {
            matchingWords++;
        }
    }
    
    // If we have good word matches, prioritize that
    const wordMatchRatio = matchingWords / names.length;
    if (wordMatchRatio >= 0.5) {
        // Boost score for word matches, scaled by the ratio
        return 0.7 + (wordMatchRatio * 0.3);
    }

    // Use Levenshtein distance for fuzzy matching
    const matrix = Array.from({ length: name.length + 1 }, () => Array(possibleName.length + 1).fill(0));
    for (let i = 0; i <= name.length; i++) {
        for (let j = 0; j <= possibleName.length; j++) {
            if (i === 0) {
                matrix[i][j] = j;
            } else if (j === 0) {
                matrix[i][j] = i;
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + (name[i - 1] === possibleName[j - 1] ? 0 : 1)
                );
            }
        }
    }
    
    const distance = matrix[name.length][possibleName.length];
    const maxLength = Math.max(name.length, possibleName.length);

    // Convert distance to similarity (0 to 1)
    return Math.max(0, 1 - (distance / maxLength));
}

/**
 * Find the best matching name from a list of candidates.
 * @param searchName The name to search for
 * @param candidates An array of objects with name properties
 * @param nameProperties The properties to use for comparison—default is ['name']
 * @returns The best matching candidate, or null if no good match is found
 */
export function findBestNameMatch<T extends Record<K, string | string[]>, K extends string = 'name'>(
    searchName: string,
    candidates: T[],
    nameProperties: K[] = ['name' as K]
): T | null {
    if (!searchName || candidates.length === 0) {
        return null;
    }

    let bestMatch: T | null = null;
    let bestScore = 0;
    const threshold = 0.7; // Minimum similarity threshold

    for (const candidate of candidates) {
        let score = 0;
        for (const property of nameProperties) {
            if (Array.isArray(candidate[property])) {
                for (const item of candidate[property]) {
                    if (typeof item === 'string') {
                        score = Math.max(score, getNameSimilarity(item, searchName));
                    }
                }
            } else if (typeof candidate[property] === 'string') {
                score = Math.max(score, getNameSimilarity(candidate[property] as string, searchName));
            }
        }
        // Only consider matches above threshold
        if (score > threshold && score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
        }
    }

    return bestMatch;
}
