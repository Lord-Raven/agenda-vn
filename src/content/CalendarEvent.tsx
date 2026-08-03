export type CalendarEvent = {
    id: string;
    name: string;
    date: string; // YYYY-MM-DD
    duration: CalendarTimeOfDay[];
    locationId: string;
    actorIds: string[];
    description: string;
    guidance: string;
    participantActorIds?: string[];
    recurrence?: CalendarEventRecurrence;
    recurrenceParentId?: string;
    recurrenceInstanceIndex?: number;
}

export type CalendarTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export const ALL_DAY_DURATION = ['morning', 'afternoon', 'evening'] as CalendarTimeOfDay[];
export const TWENTY_FOUR_HOUR_DURATION = ['morning', 'afternoon', 'evening', 'night'] as CalendarTimeOfDay[];


export type CalendarEventRecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export type CalendarEventRecurrence = {
    frequency: CalendarEventRecurrenceFrequency;
    interval: number;
    untilDate: string;
}