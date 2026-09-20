import { v4 as generateUuid } from 'uuid';
import { ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';
import { cloneStatUpdate, StatUpdate } from './Stat';

// Where a control is rendered on the map screen: 'top' alongside the date/turn indicator (replacing the old
// stat.exposed based Global Stat Bar contents), 'bottom' in a dedicated dock below the main map content.
export type ControlPlacement = 'top' | 'bottom';

// 'button' fires a defined set of stat updates when clicked. 'statDisplay' shows a read-only global stat
// value (the same rendering the Global Stat Bar used to do directly from stat.exposed). 'statEditor' lets the
// player change a global stat's value in place (e.g. picking an option from a dropdown).
export type ControlType = 'button' | 'statDisplay' | 'statEditor';

export const CONTROL_TYPES: ControlType[] = ['button', 'statDisplay', 'statEditor'];

export const isControlAvailable = (control: Control, context: ConditionContext): boolean => (
    control.active !== false && evaluateConditionCollections(control.availabilityConditions, context)
);

export class Control {
    id: string = ''; // UUID
    active: boolean = true;
    name: string = ''; // Internal/admin label shown in ControlManagementPanel; not necessarily displayed in-game.
    placement: ControlPlacement = 'bottom';
    type: ControlType = 'button';
    availabilityConditions: ConditionCollection[] = []; // Any collection may pass; all conditions within a collection must pass.

    // Only meaningful when type is 'button': the label shown on the button and the stat updates applied when clicked.
    label: string = '';
    iconName: string = '';
    actions: StatUpdate[] = [];

    // Only meaningful when type is 'statDisplay' or 'statEditor': the global stat this control shows/edits.
    statId: string = '';

    constructor(props: any) {
        Object.assign(this, props);
        if (!this.id) {
            this.id = generateUuid();
        }
        this.active = this.active !== false;
        this.placement = this.placement === 'top' ? 'top' : 'bottom';
        this.type = CONTROL_TYPES.includes(this.type) ? this.type : 'button';
        this.availabilityConditions = Array.isArray(this.availabilityConditions) ? this.availabilityConditions.map((collection) => [...collection]) : [];
        this.label = `${this.label || ''}`;
        this.iconName = `${this.iconName || ''}`;
        this.actions = Array.isArray(this.actions) ? this.actions.map(cloneStatUpdate) : [];
        this.statId = `${this.statId || ''}`;
    }
}
