import { v4 as generateUuid } from 'uuid';
import { ConditionCollection, ConditionContext, CONTENT_TYPES, ContentType, evaluateConditionCollections } from './Condition';
import { cloneStatUpdateAction, StatType, StatUpdateAction } from './Stat';
import type { FunctionVariableBindings } from './Function';

// Settings controls render in SettingsScreen.
// Pop-ups overlay gameplay; only the first available control in priority order is displayed.
// Standalone controls render only when referenced by a Bar, Card, or Pop-up.
export type ControlPlacement = 'bar' | 'outcome' | 'settings' | 'popup' | 'standalone';
export type BarOrientation = 'top' | 'bottom';

// 'button' runs outcomes; 'statDisplay'/'statEditor' show/edit a global stat.
// 'settings' exposes a global stat as a player-editable setting.
// 'statBadge' is a standalone display for one content type (actor/item/location): it shows a content
// stat or a function value for the entity it is attached to.
// 'dragDropDisplay' uses the same sources, restricted to content values. On Drag enables dragging;
// On Drop runs before the source's On Drag. An optional read-only boolean validator highlights
// receivers and suppresses On Drop when false; the source's On Drag still runs.
// 'card' composes labels, standalone badges, conditions, and actions for a content type.
export type ControlType = 'button' | 'statDisplay' | 'statEditor' | 'statOutcome' | 'settings' | 'popup' | 'statBadge' | 'dragDropDisplay' | 'card' | 'marker' | 'bar' | 'day';
export type MarkerInputType = 'actor' | 'item' | 'location' | 'screen' | 'string';
export const markerVariableBindings = (type: MarkerInputType, content: string): FunctionVariableBindings =>
    type === 'actor' || type === 'item' || type === 'location' ? { [type]: content } : { marker: content };
export type ContentListDisplay = 'carousel' | 'abbreviated';
export const STAT_DISPLAY_TYPES = ['straight', 'percentage', 'bar', 'rating', 'letter grade'] as const;
export type StatDisplayType = typeof STAT_DISPLAY_TYPES[number];
export type StatDisplaySettings = Pick<Control, 'displayType' | 'displayColor' | 'ratingIconName'>;

export const CONTROL_TYPES: ControlType[] = ['button', 'statDisplay', 'statEditor', 'statOutcome', 'settings', 'popup', 'statBadge', 'dragDropDisplay', 'card', 'marker', 'bar', 'day'];

export const isPopupTitleControl = (control: Control): boolean =>
    control.placement === 'standalone' && (control.type === 'button' || control.type === 'statDisplay' || control.type === 'statEditor');
export const isBarContentControl = (control: Control): boolean =>
    isPopupTitleControl(control) || (control.placement === 'standalone' && control.type === 'day');

export type ContentDisplayType = Extract<StatType, 'actor' | 'actorList' | 'item' | 'itemList' | 'location' | 'locationList' | 'contentList'>;
export const isContentDisplayType = (type: string | undefined): type is ContentDisplayType =>
    !!type && ['actor', 'actorList', 'item', 'itemList', 'location', 'locationList', 'contentList'].includes(type);

export type ContentDisplayContext = { control: Control; kind: ContentType; id: string; header?: string };

// References embed standalone stat badges in Card Controls.
const CONTROL_REFERENCE_PREFIX = 'control:';
export const controlReference = (id: string): string => `${CONTROL_REFERENCE_PREFIX}${id}`;
export const isControlReference = (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith(CONTROL_REFERENCE_PREFIX);
export const controlReferenceId = (value: string): string => value.slice(CONTROL_REFERENCE_PREFIX.length);

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
    placement: ControlPlacement = 'standalone';
    type: ControlType = 'button';
    barOrientation: BarOrientation = 'top';
    barControls: string[] = [];
    availabilityConditions: ConditionCollection[] = []; // Any collection may pass; all conditions within a collection must pass.
    visibilityConditions: ConditionCollection[] = []; // Cards only; unavailable visible cards remain disabled.

    // Labels/descriptions resolve context tags at render time, including {{Function Name("text", 2, true)}}.
    // Calls are read-only; arguments follow parameter order and omitted arguments use defaults.
    // Also supports {{Stat Name}}, {{Function Name}}, {{global:Stat Name}}, {{user}}.
    // Stat controls fall back to the stat's name when label is blank, except icon stats, whose blank label
    // shows no label at all. Buttons with a blank label show the iconName icon alone when one is set,
    // otherwise they fall back to the control name. Vertical top/bottom bars hide the
    // label and show iconName beside the value instead; other layouts use it to decorate the label.
    label: string = '';
    iconName: string = '';
    description: string = '';
    subLabel: string = '';
    cardDetails: string[] = [];
    useNamePlate: boolean = false;
    showPortrait: boolean = true;
    portraitScale: number = 100;
    showSourceLink: boolean = false;
    actions: StatUpdateAction[] = [];

    // The global stat shown/edited.
    statId: string = '';
    // The content type this badge or card attaches to.
    contentType: ContentType = 'actor';
    // Badge/display source: a content stat reference ("<kind>Stat:<id>") or a function reference whose
    // variable content parameter binds to the attached entity.
    badgeSource: string = '';
    // Drag/drop callbacks receive the moved entity in their first matching content parameter.
    onDragFunction: string = '';
    onDropFunction: string = '';
    dropValidationFunction: string = '';
    // Undefined uses the normal picker options; an array is resolved as a list of allowed option IDs.
    pickerSource?: string[];
    // Pop-ups display this Screen regardless of its availability; marker control conditions still apply.
    screenId: string = '';
    // Pop-ups only: control references rendered in the title bar, in selection order. Buttons and
    // stat displays/editors are eligible; availability conditions apply per control. A button whose
    // actions break the pop-up's availability conditions acts as a close button.
    titleBarControls: string[] = [];
    contentListDisplay: ContentListDisplay = 'carousel';
    displayType: StatDisplayType = 'straight';
    displayColor: string = '';
    ratingIconName: string = 'star';
    outcomeStatTarget: 'actor' | 'global' = 'global';
    markerInputType: MarkerInputType = 'string';
    cardControlId: string = '';
    contentList: { kind: 'actor' | 'item' | 'location' | 'mixed' | 'string'; values: string[] } = { kind: 'mixed', values: [] };

    constructor(props: Partial<Control> = {}) {
        const { popupControlId: _legacyPopupControlId, ...currentProps } = props as Partial<Control> & { popupControlId?: unknown };
        Object.assign(this, currentProps);
        if (!this.id) {
            this.id = generateUuid();
        }
        this.active = this.active !== false;
        this.priority = Number.isFinite(this.priority) ? this.priority : 0;
        this.widthWeight = Number.isFinite(this.widthWeight) && this.widthWeight > 0 ? this.widthWeight : 1;
        this.type = CONTROL_TYPES.includes(this.type) ? this.type : 'button';
        this.placement = this.type === 'bar' ? 'bar' : this.type === 'popup' ? 'popup' : this.type === 'statOutcome' ? 'outcome' : this.type === 'settings' ? 'settings' : 'standalone';
        this.barOrientation = this.barOrientation === 'bottom' ? 'bottom' : 'top';
        this.barControls = Array.isArray(this.barControls) ? this.barControls.filter(isControlReference) : [];
        this.availabilityConditions = Array.isArray(this.availabilityConditions) ? this.availabilityConditions.map(collection => collection.map(condition => ({ ...condition }))) : [];
        this.visibilityConditions = Array.isArray(this.visibilityConditions) ? this.visibilityConditions.map(collection => collection.map(condition => ({ ...condition }))) : [];
        this.label = `${this.label || ''}`;
        this.iconName = `${this.iconName || ''}`;
        this.description = `${this.description || ''}`;
        this.subLabel = `${this.subLabel || ''}`;
        this.cardDetails = Array.isArray(this.cardDetails) ? this.cardDetails.filter(isControlReference) : [];
        this.useNamePlate = this.useNamePlate === true;
        this.showPortrait = this.showPortrait !== false;
        this.portraitScale = Number.isFinite(this.portraitScale) ? Math.max(50, Math.min(100, this.portraitScale)) : 100;
        this.showSourceLink = this.showSourceLink === true;
        this.actions = Array.isArray(this.actions) ? this.actions.map(cloneStatUpdateAction) : [];
        this.statId = `${this.statId || ''}`;
        this.contentType = CONTENT_TYPES.includes(this.contentType) ? this.contentType : 'actor';
        this.badgeSource = typeof this.badgeSource === 'string' && !isControlReference(this.badgeSource) ? this.badgeSource : '';
        this.onDragFunction = typeof this.onDragFunction === 'string' ? this.onDragFunction : '';
        this.onDropFunction = typeof this.onDropFunction === 'string' ? this.onDropFunction : '';
        this.dropValidationFunction = typeof this.dropValidationFunction === 'string' ? this.dropValidationFunction : '';
        this.pickerSource = Array.isArray(this.pickerSource) ? this.pickerSource.filter((entry): entry is string => typeof entry === 'string') : undefined;
        this.screenId = `${this.screenId || ''}`;
        this.titleBarControls = Array.isArray(this.titleBarControls) ? this.titleBarControls.filter(isControlReference) : [];
        this.contentListDisplay = this.contentListDisplay === 'abbreviated' ? 'abbreviated' : 'carousel';
        this.displayType = STAT_DISPLAY_TYPES.includes(this.displayType) ? this.displayType : 'straight';
        this.displayColor = `${this.displayColor || ''}`;
        this.ratingIconName = `${this.ratingIconName || 'star'}`;
        this.outcomeStatTarget = this.outcomeStatTarget === 'actor' ? 'actor' : 'global';
        this.markerInputType = ['actor', 'item', 'location', 'screen', 'string'].includes(this.markerInputType) ? this.markerInputType : 'string';
        this.cardControlId = typeof this.cardControlId === 'string' ? this.cardControlId : '';
        const contentList = this.contentList as Partial<{ kind: string; values: unknown }> | undefined;
        this.contentList = {
            kind: this.type !== 'marker' && contentList && ['actor', 'item', 'location', 'mixed', 'string'].includes(String(contentList.kind))
                ? contentList.kind as 'actor' | 'item' | 'location' | 'mixed' | 'string'
                : 'mixed',
            values: contentList && Array.isArray(contentList.values) ? contentList.values.filter((entry): entry is string => typeof entry === 'string') : [],
        };
    }
}

export const DEFAULT_CARD_IDS: Record<ContentType, string> = {
    actor: 'default-actor-card', item: 'default-item-card', location: 'default-location-card',
};

export const createDefaultCardControls = (): Control[] => CONTENT_TYPES.map(contentType => new Control({
    id: DEFAULT_CARD_IDS[contentType],
    name: `Default ${contentType[0].toUpperCase()}${contentType.slice(1)} Card`,
    type: 'card', contentType,
    label: '{{content:name}}',
    subLabel: contentType === 'actor' ? '{{content:meta}}' : '',
    description: contentType === 'actor' ? '{{content:summary}}' : '',
    useNamePlate: contentType === 'actor',
    showPortrait: contentType !== 'actor',
    showSourceLink: contentType === 'actor',
}));
