export type CalendarEvent = {
    id: string;
    name: string;
    date: string; // YYYY-MM-DD
    duration: CalendarTimeOfDay[];
    locationId: string;
    actorIds: string[];
    description: string;
    guidance: string;
    mandatory?: boolean;
    participantActorIds?: string[];
    recurrence?: CalendarEventRecurrence;
    recurrenceParentId?: string;
    recurrenceInstanceIndex?: number;
}

export type CalendarTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export const ALL_DAY_DURATION = ['morning', 'afternoon', 'evening'] as CalendarTimeOfDay[];
export const TWENTY_FOUR_HOUR_DURATION = ['morning', 'afternoon', 'evening', 'night'] as CalendarTimeOfDay[];

export const CALENDAR_TIME_OF_DAY_ORDER: CalendarTimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

// 'timeOfDay' names the four daily slots Morning/Afternoon/Evening/Night; 'phase' presents the same four
// slots as abstract, unnamed Phase 1-4 for games that do not want a literal clock.
export type TimeMode = 'timeOfDay' | 'phase';

const PHASE_LABELS: Record<CalendarTimeOfDay, string> = {
    morning: 'Phase 1',
    afternoon: 'Phase 2',
    evening: 'Phase 3',
    night: 'Phase 4',
};

// Time mode is purely presentational and the label helpers below are called from stage-less leaf components
// (ConditionEditor and friends), so Stage mirrors the configured mode here rather than threading it as a prop.
let activeTimeMode: TimeMode = 'timeOfDay';

export const setActiveTimeMode = (mode: unknown) => {
    activeTimeMode = mode === 'phase' ? 'phase' : 'timeOfDay';
};

export const getActiveTimeMode = (): TimeMode => activeTimeMode;

export const isPhaseTimeMode = (): boolean => activeTimeMode === 'phase';

export const formatTimeSlot = (slot?: string): string => {
    if (!slot) {
        return isPhaseTimeMode() ? 'Unknown Phase' : 'Unknown Time';
    }
    if (isPhaseTimeMode() && PHASE_LABELS[slot as CalendarTimeOfDay]) {
        return PHASE_LABELS[slot as CalendarTimeOfDay];
    }
    return `${slot[0].toUpperCase()}${slot.slice(1)}`;
};

export const timeSlotTerm = (plural: boolean = false): string => isPhaseTimeMode()
    ? (plural ? 'Phases' : 'Phase')
    : (plural ? 'Times of day' : 'Time of day');


export type CalendarEventRecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export type CalendarEventRecurrence = {
    frequency: CalendarEventRecurrenceFrequency;
    interval: number;
    untilDate: string;
}