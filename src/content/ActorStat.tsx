export type ActorStatType = 'number' | 'percentage' | 'rating' | 'letter grade' | 'option' | 'text' | 'checkbox';
export type ActorStatValue = number | string | boolean;

const NUMERIC_ACTOR_STAT_DISPLAY_TYPES: ActorStatType[] = ['number', 'percentage', 'rating', 'letter grade'];

export const isNumericDisplayType = (displayType: ActorStatType): boolean => NUMERIC_ACTOR_STAT_DISPLAY_TYPES.includes(displayType);

export type ActorStatOption = {
    name: string;
    description: string;
};

// Represents a custom stat that applies to all actors in the game.
export type ActorStat = {
    name: string;
    description: string;
    // perActor: boolean; // Implement all related requirements.
    guidance: string;
    default: ActorStatValue;
    type: ActorStatType;
    options?: ActorStatOption[];
    min?: number;
    max?: number;
    setByPlayer: boolean;
    exposed: boolean;
    iconName?: string;
    labelIconName?: string;
};

type ActorStatTextContext = {
    getPlayerActor?: () => { name?: string } | undefined;
    primaryUser?: { name?: string };
};

export const resolveActorStatText = (
    rawText: string | undefined,
    stage?: ActorStatTextContext | null,
): string => {
    const playerName = stage?.getPlayerActor?.()?.name || stage?.primaryUser?.name || 'the player';
    return String(rawText || '').replace(/\{\{\s*user\s*\}\}/gi, playerName);
};

export const cloneActorStat = (stat: ActorStat): ActorStat => ({
    name: stat.name,
    description: stat.description,
    guidance: stat.guidance,
    default: typeof stat.default === 'boolean' ? stat.default : (typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : (stat.type === 'checkbox' ? false : 0)),
    type: stat.type,
    options: (stat.options || []).map((option) => ({
        name: option.name,
        description: option.description,
    })),
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
    setByPlayer: stat.setByPlayer === true || stat.exposed === true,
    exposed: stat.exposed === true,
    iconName: stat.iconName || (stat.type === 'rating' ? 'star' : undefined),
    labelIconName: stat.labelIconName || undefined,
});

export const isNumericActorStat = (stat: ActorStat): boolean => isNumericDisplayType(stat.type);

export const resolveActorStatDefault = (stat: ActorStat): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === 'string' && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || '';
    }

    if (stat.type === 'text') {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

export const normalizeActorStatValue = (value: unknown, stat: ActorStat): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        const fallback = resolveActorStatDefault(stat);
        if (typeof value === 'string' && optionNames.includes(value)) {
            return value;
        }
        return typeof fallback === 'string' ? fallback : '';
    }

    if (stat.type === 'text') {
        if (typeof value === 'string') {
            return value;
        }
        const fallback = resolveActorStatDefault(stat);
        return typeof fallback === 'string' ? fallback : '';
    }

    if (stat.type === 'checkbox') {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const lower = value.trim().toLowerCase();
            if (lower === 'true') return true;
            if (lower === 'false') return false;
        }
        return typeof resolveActorStatDefault(stat) === 'boolean' ? resolveActorStatDefault(stat) : false;
    }

    let resolved = Number.isFinite(value) ? Number(value) : Number(resolveActorStatDefault(stat)) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};