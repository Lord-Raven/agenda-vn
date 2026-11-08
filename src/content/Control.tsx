import { v4 as generateUuid } from 'uuid';
import { CONTENT_TYPES, ConditionCollection, ConditionContext, ContentType, evaluateConditionCollections } from './Condition';
import { cloneStatUpdateAction, Stat, StatType, StatUpdateAction } from './Stat';
import { functionReferenceId, GameFunction, globalStatReferenceId, isFunctionReference, isGlobalStatReference } from './Function';

// Settings controls render in SettingsScreen; actor stat displays render on actor cards.
// Pop-ups overlay gameplay; only the first available control in priority order is displayed.
export type ControlPlacement = 'top' | 'bottom' | 'actorCard' | 'outcome' | 'settings' | 'popup';

// 'button' runs outcomes; 'statDisplay'/'statEditor' show/edit a global stat.
// 'actorStatDisplay' shows a read-only stat belonging to the actor whose card is displayed;
// 'settings' exposes a global stat as a player-editable setting.
export type ControlType = 'button' | 'statDisplay' | 'statEditor' | 'actorStatDisplay' | 'statOutcome' | 'settings' | 'popup';
export type ContentListDisplay = 'carousel' | 'abbreviated';
export const STAT_DISPLAY_TYPES = ['straight', 'percentage', 'bar', 'rating', 'letter grade'] as const;
export type StatDisplayType = typeof STAT_DISPLAY_TYPES[number];
export type StatDisplaySettings = Pick<Control, 'displayType' | 'displayColor' | 'ratingIconName'>;

export type PopupDisplay = 'map' | 'list';

// One header entry of a list pop-up. Each header string yields its own page; pages without content are hidden.
export type PopupSection = {
    id: string;
    // Literal title; supports {{Function Name}} tags. Ignored when headerSource is set.
    header: string;
    // Optional text/textList function or text global stat reference supplying one or more titles.
    headerSource: string;
    // actorList/itemList/locationList function or global stat reference. Text parameters may be bound to
    // HEADER_VARIABLE_VALUE to receive the page's header.
    contentSource: string;
    // Shown at the right end of each card: function references whose content-kind parameter is bound to
    // "variable:<kind>", or content stat references (see contentStatReference).
    details: string[];
    // Run when a card is clicked, with "variable:<kind>" bound to the card and the header variable bound.
    actions: StatUpdateAction[];
};

export const POPUP_CONTENT_LIST_TYPES: Record<ContentType, StatType> = { actor: 'actorList', item: 'itemList', location: 'locationList' };

export const createPopupSection = (): PopupSection => ({
    id: generateUuid(), header: '', headerSource: '', contentSource: '', details: [], actions: [],
});

export const clonePopupSection = (source: unknown): PopupSection => {
    const section = source && typeof source === 'object' ? source as Partial<PopupSection> : {};
    return {
        id: typeof section.id === 'string' && section.id ? section.id : generateUuid(),
        header: `${section.header || ''}`,
        headerSource: `${section.headerSource || ''}`,
        contentSource: `${section.contentSource || ''}`,
        details: Array.isArray(section.details) ? section.details.filter((entry): entry is string => typeof entry === 'string') : [],
        actions: Array.isArray(section.actions) ? section.actions.map(cloneStatUpdateAction) : [],
    };
};

const CONTENT_STAT_REFERENCE_SUFFIX = 'Stat:';
export const contentStatReference = (kind: ContentType, statId: string): string => `${kind}${CONTENT_STAT_REFERENCE_SUFFIX}${statId}`;
export const parseContentStatReference = (value: unknown): { kind: ContentType; statId: string } | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const kind = CONTENT_TYPES.find(candidate => value.startsWith(`${candidate}${CONTENT_STAT_REFERENCE_SUFFIX}`));
    return kind ? { kind, statId: value.slice(kind.length + CONTENT_STAT_REFERENCE_SUFFIX.length) } : undefined;
};

// The content kind a section's contentSource lists, from the referenced function's or global stat's type.
export const popupContentKind = (configuration: { functions?: GameFunction[]; globalStats?: Stat[] }, source: string): ContentType | undefined => {
    const type = isFunctionReference(source)
        ? configuration.functions?.find(fn => fn.id === functionReferenceId(source))?.returnType
        : isGlobalStatReference(source)
            ? configuration.globalStats?.find(stat => stat.id === globalStatReferenceId(source))?.type
            : undefined;
    return CONTENT_TYPES.find(kind => POPUP_CONTENT_LIST_TYPES[kind] === type);
};

export const CONTROL_TYPES: ControlType[] = ['button', 'statDisplay', 'statEditor', 'actorStatDisplay', 'statOutcome', 'settings', 'popup'];

export const isControlAvailable = (control: Control, context: ConditionContext): boolean => (
    control.active !== false && evaluateConditionCollections(control.availabilityConditions, context)
);

export const compareControlPriority = (left: Control, right: Control): number =>
    (left.priority ?? 0) - (right.priority ?? 0);

export class Control {
    id: string = ''; // UUID
    active: boolean = true;
    name: string = ''; // Internal/admin label shown in ControlManagementPanel; not necessarily displayed in-game.
    priority: number = 0; // Lower numbers display first; ties keep configuration order.
    widthWeight: number = 1; // Relative width within a top/bottom control row.
    placement: ControlPlacement = 'bottom';
    type: ControlType = 'button';
    availabilityConditions: ConditionCollection[] = []; // Any collection may pass; all conditions within a collection must pass.

    // Labels/descriptions resolve context tags at render time, including {{Function Name("text", 2, true)}}.
    // Calls are read-only; arguments follow parameter order and omitted arguments use defaults.
    // Also supports {{Stat Name}}, {{Function Name}}, {{global:Stat Name}}, {{user}}.
    // Stat controls fall back to the stat's name when label is blank. Vertical top/bottom bars hide the
    // label and show iconName beside the value instead; other layouts use it to decorate the label.
    label: string = '';
    iconName: string = '';
    description: string = '';
    actions: StatUpdateAction[] = [];

    // The global stat shown/edited, or the actor stat shown by 'actorStatDisplay'.
    statId: string = '';
    // Undefined uses the normal picker options; an array is resolved as a list of allowed option IDs.
    pickerSource?: string[];
    // Map pop-ups display this map regardless of its normal availability; link conditions still apply.
    mapId: string = '';
    popupDisplay: PopupDisplay = 'map';
    popupSections: PopupSection[] = [];
    contentListDisplay: ContentListDisplay = 'carousel';
    displayType: StatDisplayType = 'straight';
    displayColor: string = '';
    ratingIconName: string = 'star';
    outcomeStatTarget: 'actor' | 'global' = 'global';

    constructor(props: any) {
        Object.assign(this, props);
        if (!this.id) {
            this.id = generateUuid();
        }
        this.active = this.active !== false;
        this.priority = Number.isFinite(this.priority) ? this.priority : 0;
        this.widthWeight = Number.isFinite(this.widthWeight) && this.widthWeight > 0 ? this.widthWeight : 1;
        this.type = CONTROL_TYPES.includes(this.type) ? this.type : 'button';
        this.placement = this.type === 'popup' ? 'popup' : this.type === 'statOutcome' ? 'outcome' : this.type === 'actorStatDisplay' ? 'actorCard' : this.type === 'settings' ? 'settings' : this.placement === 'top' ? 'top' : 'bottom';
        this.availabilityConditions = Array.isArray(this.availabilityConditions) ? this.availabilityConditions.map((collection) => [...collection]) : [];
        this.label = `${this.label || ''}`;
        this.iconName = `${this.iconName || ''}`;
        this.description = `${this.description || ''}`;
        this.actions = Array.isArray(this.actions) ? this.actions.map(cloneStatUpdateAction) : [];
        this.statId = `${this.statId || ''}`;
        this.pickerSource = Array.isArray(this.pickerSource) ? this.pickerSource.filter((entry): entry is string => typeof entry === 'string') : undefined;
        this.mapId = `${this.mapId || ''}`;
        this.popupDisplay = this.popupDisplay === 'list' ? 'list' : 'map';
        this.popupSections = Array.isArray(this.popupSections) ? this.popupSections.map(clonePopupSection) : [];
        this.contentListDisplay = this.contentListDisplay === 'abbreviated' ? 'abbreviated' : 'carousel';
        this.displayType = STAT_DISPLAY_TYPES.includes(this.displayType) ? this.displayType : 'straight';
        this.displayColor = `${this.displayColor || ''}`;
        this.ratingIconName = `${this.ratingIconName || 'star'}`;
        this.outcomeStatTarget = this.outcomeStatTarget === 'actor' ? 'actor' : 'global';
    }
}
