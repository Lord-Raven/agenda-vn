import { Map as GameMap } from './Map';
import { CONTENT_TYPES, ConditionContext, ContentType, evaluateConditionCollections } from './Condition';
import { cloneStatUpdateAction, Stat, StatType, StatUpdateAction } from './Stat';
import { functionReferenceId, GameFunction, globalStatReferenceId, isFunctionReference, isGlobalStatReference } from './Function';
import { v4 as generateUuid } from 'uuid';

export type ScreenType = 'map' | 'list';

// Each resolved header yields a page; pages without content are hidden.
export type ListSection = {
    id: string;
    // Literal title supporting template tags; ignored when headerSource is set.
    header: string;
    // A text/textList function or global stat reference.
    headerSource: string;
    // An actorList/itemList/locationList source; text parameters may bind the header variable.
    contentSource: string;
    // Content stat references or functions with their content parameter bound to the card.
    details: string[];
    // Card-click actions bind the variable content target and header.
    actions: StatUpdateAction[];
};

export const LIST_CONTENT_TYPES: Record<ContentType, StatType> = { actor: 'actorList', item: 'itemList', location: 'locationList' };

export const createListSection = (): ListSection => ({
    id: generateUuid(), header: '', headerSource: '', contentSource: '', details: [], actions: [],
});

export const cloneListSection = (source: unknown): ListSection => {
    const section = source && typeof source === 'object' ? source as Partial<ListSection> : {};
    return {
        id: typeof section.id === 'string' && section.id ? section.id : generateUuid(),
        header: `${section.header || ''}`,
        headerSource: `${section.headerSource || ''}`,
        contentSource: `${section.contentSource || ''}`,
        details: Array.isArray(section.details) ? section.details.filter((entry): entry is string => typeof entry === 'string') : [],
        actions: Array.isArray(section.actions) ? section.actions.map(cloneStatUpdateAction) : [],
    };
};

export const contentStatReference = (kind: ContentType, statId: string): string => `${kind}Stat:${statId}`;
export const parseContentStatReference = (value: unknown): { kind: ContentType; statId: string } | undefined => {
    if (typeof value !== 'string') return undefined;
    const kind = CONTENT_TYPES.find(candidate => value.startsWith(`${candidate}Stat:`));
    return kind ? { kind, statId: value.slice(kind.length + 'Stat:'.length) } : undefined;
};

export const listContentKind = (configuration: { functions?: GameFunction[]; globalStats?: Stat[] }, source: string): ContentType | undefined => {
    const type = isFunctionReference(source)
        ? configuration.functions?.find(fn => fn.id === functionReferenceId(source))?.returnType
        : isGlobalStatReference(source)
            ? configuration.globalStats?.find(stat => stat.id === globalStatReferenceId(source))?.type
            : undefined;
    return CONTENT_TYPES.find(kind => LIST_CONTENT_TYPES[kind] === type);
};

// Retain both types' settings when switching type in the editor.
export class Screen extends GameMap {
    type: ScreenType = 'map';
    sections: ListSection[] = [];

    constructor(data?: Partial<Screen>) {
        super(data);
        this.type = data?.type === 'list' ? 'list' : 'map';
        this.sections = (data?.sections || []).map(cloneListSection);
        this.priority = Number.isFinite(this.priority) ? this.priority : 0;
    }
}

export const isScreenAvailable = (screen: Screen, context: ConditionContext): boolean =>
    screen.active !== false && evaluateConditionCollections(screen.availabilityConditions, context);

// Stable sorting preserves configuration order for equal priorities.
export const compareScreenPriority = (left: Screen, right: Screen): number => left.priority - right.priority;
