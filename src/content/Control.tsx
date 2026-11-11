import { v4 as generateUuid } from 'uuid';
import { ConditionCollection, ConditionContext, CONTENT_TYPES, ContentType, evaluateConditionCollections } from './Condition';
import { cloneStatUpdateAction, StatUpdateAction } from './Stat';

// Settings controls render in SettingsScreen; actor stat displays render on actor cards.
// Pop-ups overlay gameplay; only the first available control in priority order is displayed.
// 'standalone' controls render nowhere on their own; they are attached to content elsewhere
// (currently as List Screen card details).
export type ControlPlacement = 'top' | 'bottom' | 'actorCard' | 'outcome' | 'settings' | 'popup' | 'standalone';

// 'button' runs outcomes; 'statDisplay'/'statEditor' show/edit a global stat.
// 'actorStatDisplay' shows a read-only stat belonging to the actor whose card is displayed;
// 'settings' exposes a global stat as a player-editable setting.
// 'statBadge' is a standalone display for one content type (actor/item/location): it shows a content
// stat or a function value for the entity it is attached to, e.g. on List Screen card entries.
export type ControlType = 'button' | 'statDisplay' | 'statEditor' | 'actorStatDisplay' | 'statOutcome' | 'settings' | 'popup' | 'statBadge';
export type ContentListDisplay = 'carousel' | 'abbreviated';
export const STAT_DISPLAY_TYPES = ['straight', 'percentage', 'bar', 'rating', 'letter grade'] as const;
export type StatDisplayType = typeof STAT_DISPLAY_TYPES[number];
export type StatDisplaySettings = Pick<Control, 'displayType' | 'displayColor' | 'ratingIconName'>;

export const CONTROL_TYPES: ControlType[] = ['button', 'statDisplay', 'statEditor', 'actorStatDisplay', 'statOutcome', 'settings', 'popup', 'statBadge'];

// References embed a stat badge control wherever content details are listed (e.g. ListSection.details).
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
    // 'statBadge' only: the content type whose entities this badge attaches to.
    contentType: ContentType = 'actor';
    // 'statBadge' only: a content stat reference ("<kind>Stat:<id>") or a function reference whose
    // variable content parameter binds to the attached entity.
    badgeSource: string = '';
    // Undefined uses the normal picker options; an array is resolved as a list of allowed option IDs.
    pickerSource?: string[];
    // Pop-ups display this Screen regardless of its availability; map link conditions still apply.
    screenId: string = '';
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
        this.placement = this.type === 'popup' ? 'popup' : this.type === 'statOutcome' ? 'outcome' : this.type === 'actorStatDisplay' ? 'actorCard' : this.type === 'settings' ? 'settings' : this.type === 'statBadge' ? 'standalone' : this.placement === 'top' ? 'top' : 'bottom';
        this.availabilityConditions = Array.isArray(this.availabilityConditions) ? this.availabilityConditions.map((collection) => [...collection]) : [];
        this.label = `${this.label || ''}`;
        this.iconName = `${this.iconName || ''}`;
        this.description = `${this.description || ''}`;
        this.actions = Array.isArray(this.actions) ? this.actions.map(cloneStatUpdateAction) : [];
        this.statId = `${this.statId || ''}`;
        this.contentType = CONTENT_TYPES.includes(this.contentType) ? this.contentType : 'actor';
        this.badgeSource = typeof this.badgeSource === 'string' && !isControlReference(this.badgeSource) ? this.badgeSource : '';
        this.pickerSource = Array.isArray(this.pickerSource) ? this.pickerSource.filter((entry): entry is string => typeof entry === 'string') : undefined;
        this.screenId = `${this.screenId || ''}`;
        this.contentListDisplay = this.contentListDisplay === 'abbreviated' ? 'abbreviated' : 'carousel';
        this.displayType = STAT_DISPLAY_TYPES.includes(this.displayType) ? this.displayType : 'straight';
        this.displayColor = `${this.displayColor || ''}`;
        this.ratingIconName = `${this.ratingIconName || 'star'}`;
        this.outcomeStatTarget = this.outcomeStatTarget === 'actor' ? 'actor' : 'global';
    }
}
