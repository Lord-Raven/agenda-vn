import { v4 as generateUuid } from 'uuid';
import { ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';
import { cloneStatUpdate, StatUpdate } from './Stat';

// Actor stat displays render on actor cards; other controls render in the map's top or bottom dock.
export type ControlPlacement = 'top' | 'bottom' | 'actorCard' | 'outcome';

// 'button' fires stat updates; 'statDisplay'/'statEditor' show/edit a global stat.
// 'actorStatDisplay' shows a read-only stat belonging to the actor whose card is displayed.
export type ControlType = 'button' | 'statDisplay' | 'statEditor' | 'actorStatDisplay' | 'statOutcome';
export type ContentListDisplay = 'carousel' | 'abbreviated';
export const STAT_DISPLAY_TYPES = ['straight', 'percentage', 'bar', 'rating', 'letter grade'] as const;
export type StatDisplayType = typeof STAT_DISPLAY_TYPES[number];
export type StatDisplaySettings = Pick<Control, 'displayType' | 'displayColor' | 'ratingIconName'>;

export const CONTROL_TYPES: ControlType[] = ['button', 'statDisplay', 'statEditor', 'actorStatDisplay', 'statOutcome'];

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
    placement: ControlPlacement = 'bottom';
    type: ControlType = 'button';
    availabilityConditions: ConditionCollection[] = []; // Any collection may pass; all conditions within a collection must pass.

    // Stat controls fall back to the stat's name when label is blank; iconName decorates the label.
    label: string = '';
    iconName: string = '';
    actions: StatUpdate[] = [];

    // The global stat shown/edited, or the actor stat shown by 'actorStatDisplay'.
    statId: string = '';
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
        this.type = CONTROL_TYPES.includes(this.type) ? this.type : 'button';
        this.placement = this.type === 'statOutcome' ? 'outcome' : this.type === 'actorStatDisplay' ? 'actorCard' : this.placement === 'top' ? 'top' : 'bottom';
        this.availabilityConditions = Array.isArray(this.availabilityConditions) ? this.availabilityConditions.map((collection) => [...collection]) : [];
        this.label = `${this.label || ''}`;
        this.iconName = `${this.iconName || ''}`;
        this.actions = Array.isArray(this.actions) ? this.actions.map(cloneStatUpdate) : [];
        this.statId = `${this.statId || ''}`;
        this.contentListDisplay = this.contentListDisplay === 'abbreviated' ? 'abbreviated' : 'carousel';
        this.displayType = STAT_DISPLAY_TYPES.includes(this.displayType) ? this.displayType : 'straight';
        this.displayColor = `${this.displayColor || ''}`;
        this.ratingIconName = `${this.ratingIconName || 'star'}`;
        this.outcomeStatTarget = this.outcomeStatTarget === 'actor' ? 'actor' : 'global';
    }
}
