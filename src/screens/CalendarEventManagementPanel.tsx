import React, { FC, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { DoNotDisturb } from '@mui/icons-material';
import { Stage } from '../Stage';
import { ALL_DAY_DURATION, CalendarEvent, CalendarEventRecurrence, CalendarTimeOfDay } from '../content/CalendarEvent';
import { Button, GlassPanel, TextArea, TextInput, Title } from '../components/UiComponents';
import { SearchableOptionPicker } from '../components/ActorStatRating';
import {
    CategorizedEntrySection,
    CategorizedEntrySidebar,
    toggleSidebarCollapseState,
    useCachedSidebarCollapseState,
} from '../components/CategorizedEntrySidebar';

interface CalendarEventManagementPanelProps {
    stage: () => Stage;
}

const TIME_OF_DAY_ORDER: CalendarTimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];
const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

const formatTimeOfDay = (timeOfDay: CalendarTimeOfDay) => `${timeOfDay[0].toUpperCase()}${timeOfDay.slice(1)}`;

const normalizeDuration = (duration: CalendarEvent['duration']): CalendarTimeOfDay[] => {
    const unique = Array.from(new Set((duration || []).filter((slot): slot is CalendarTimeOfDay => TIME_OF_DAY_ORDER.includes(slot as CalendarTimeOfDay))));
    if (unique.length === 0) {
        return [...ALL_DAY_DURATION];
    }
    return unique.sort((left, right) => TIME_OF_DAY_ORDER.indexOf(left) - TIME_OF_DAY_ORDER.indexOf(right));
};

const durationSummary = (duration: CalendarTimeOfDay[]) => {
    const slots = normalizeDuration(duration);
    if (slots.length === 1) {
        return formatTimeOfDay(slots[0]);
    }
    return `${formatTimeOfDay(slots[0])} - ${formatTimeOfDay(slots[slots.length - 1])}`;
};

const cloneEvent = (event: CalendarEvent): CalendarEvent => ({
    ...event,
    duration: normalizeDuration(event.duration),
    actorIds: [...(event.actorIds || event.participantActorIds || [])],
    participantActorIds: [...(event.participantActorIds || event.actorIds || [])],
    recurrence: event.recurrence ? { ...event.recurrence } : undefined,
});

const addDaysToDateKey = (dateKey: string, days: number): string => {
    const parsed = new Date(`${dateKey}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        return dateKey;
    }

    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10);
};

const recurrenceSummary = (recurrence?: CalendarEventRecurrence): string => {
    if (!recurrence) {
        return 'Does not repeat';
    }

    const interval = Math.max(1, Number(recurrence.interval) || 1);
    const unit = recurrence.frequency === 'daily'
        ? (interval === 1 ? 'day' : 'days')
        : recurrence.frequency === 'weekly'
            ? (interval === 1 ? 'week' : 'weeks')
            : (interval === 1 ? 'month' : 'months');
    return `Every ${interval} ${unit} until ${recurrence.untilDate}`;
};

const monthYearForEvent = (dateKey: string): { id: string; label: string; sortKey: number } => {
    const parsed = new Date(`${dateKey}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        return {
            id: 'unknown-date',
            label: 'Unknown Date',
            sortKey: Number.MAX_SAFE_INTEGER,
        };
    }

    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth();
    return {
        id: `${year}-${String(month + 1).padStart(2, '0')}`,
        label: MONTH_YEAR_FORMATTER.format(parsed),
        sortKey: year * 100 + month,
    };
};

const eventSortKey = (event: CalendarEvent): number => {
    const parsed = new Date(`${event.date}T00:00:00Z`);
    const day = Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
    const firstSlot = normalizeDuration(event.duration)[0];
    const slotOrder = TIME_OF_DAY_ORDER.indexOf(firstSlot);
    return (day * 10) + (slotOrder < 0 ? TIME_OF_DAY_ORDER.length : slotOrder);
};

export const CalendarEventManagementPanel: FC<CalendarEventManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const shouldReduceMotion = useReducedMotion();

    const actors = useMemo(
        () => Object.values(save.actors || {})
            .filter(actor => actor.id !== save.playerId)
            .filter(actor => actor.active !== false)
            .sort((a, b) => a.name.localeCompare(b.name)),
        [save.actors, save.playerId],
    );
    const locations = useMemo(
        () => Object.values(save.atlas || {})
            .filter(location => location.active !== false)
            .sort((a, b) => a.name.localeCompare(b.name)),
        [save.atlas],
    );

    const [events, setEvents] = useState<CalendarEvent[]>(() =>
        stageInstance.getManagedCalendarEvents().map(cloneEvent),
    );
    const [selectedEventId, setSelectedEventId] = useState<string | null>(() => events[0]?.id || null);
    const [draft, setDraft] = useState<CalendarEvent>(() => cloneEvent(events[0] || stageInstance.createCalendarEventDraft()));
    const [isNewDraft, setIsNewDraft] = useState<boolean>(() => events.length === 0);
    const [collapsedSections, setCollapsedSections] = useCachedSidebarCollapseState('calendar-event-management');

    const eventSections = useMemo<CategorizedEntrySection<CalendarEvent>[]>(() => {
        const grouped = new Map<string, { id: string; title: string; sortKey: number; entries: CalendarEvent[] }>();

        for (const event of events) {
            const group = monthYearForEvent(event.date);
            const existing = grouped.get(group.id);
            if (existing) {
                existing.entries.push(event);
                continue;
            }

            grouped.set(group.id, {
                id: group.id,
                title: group.label,
                sortKey: group.sortKey,
                entries: [event],
            });
        }

        return Array.from(grouped.values())
            .map((section) => ({
                id: section.id,
                title: section.title,
                entries: section.entries.sort((left, right) => {
                    const byDateAndTime = eventSortKey(left) - eventSortKey(right);
                    if (byDateAndTime !== 0) {
                        return byDateAndTime;
                    }
                    return left.name.localeCompare(right.name);
                }),
            }))
            .sort((left, right) => {
                const leftSort = monthYearForEvent(left.entries[0]?.date || '').sortKey;
                const rightSort = monthYearForEvent(right.entries[0]?.date || '').sortKey;
                return leftSort - rightSort;
            });
    }, [events]);

    const refreshEvents = (nextSelectedId?: string) => {
        const refreshed = stageInstance.getManagedCalendarEvents().map(cloneEvent);
        setEvents(refreshed);

        const preferredId = nextSelectedId || selectedEventId;
        const matched = preferredId ? refreshed.find(event => event.id === preferredId) : undefined;
        if (matched) {
            setSelectedEventId(matched.id);
            setDraft(cloneEvent(matched));
            setIsNewDraft(false);
            return;
        }

        if (refreshed.length > 0) {
            setSelectedEventId(refreshed[0].id);
            setDraft(cloneEvent(refreshed[0]));
            setIsNewDraft(false);
            return;
        }

        const freshDraft = stageInstance.createCalendarEventDraft();
        setSelectedEventId(null);
        setDraft(cloneEvent(freshDraft));
        setIsNewDraft(true);
    };

    const startNewDraft = () => {
        const freshDraft = stageInstance.createCalendarEventDraft();
        setSelectedEventId(null);
        setDraft(cloneEvent(freshDraft));
        setIsNewDraft(true);
    };

    const selectEvent = (eventId: string) => {
        const selected = events.find(item => item.id === eventId);
        if (!selected) {
            return;
        }

        setSelectedEventId(eventId);
        setDraft(cloneEvent(selected));
        setIsNewDraft(false);
    };

    const updateDraft = (patch: Partial<CalendarEvent>) => {
        setDraft(prev => ({
            ...prev,
            ...patch,
            duration: normalizeDuration(patch.duration ?? prev.duration),
        }));
    };

    const toggleDurationSlot = (slot: CalendarTimeOfDay) => {
        setDraft(prev => {
            const existing = normalizeDuration(prev.duration);
            const nextDuration = existing.includes(slot)
                ? existing.filter(item => item !== slot)
                : [...existing, slot];

            return {
                ...prev,
                duration: normalizeDuration(nextDuration),
            };
        });
    };

    const updateActorSelection = (nextActorIds: string[]) => {
        setDraft(prev => ({
            ...prev,
            actorIds: [...nextActorIds],
            participantActorIds: [...nextActorIds],
        }));
    };

    const setRecurrenceEnabled = (enabled: boolean) => {
        if (!enabled) {
            updateDraft({ recurrence: undefined });
            return;
        }

        const recurrence: CalendarEventRecurrence = {
            frequency: draft.recurrence?.frequency || 'weekly',
            interval: Math.max(1, Number(draft.recurrence?.interval) || 1),
            untilDate: draft.recurrence?.untilDate || addDaysToDateKey(draft.date, 30),
        };

        updateDraft({ recurrence });
    };

    const saveDraft = () => {
        const savedEvent = stageInstance.upsertCalendarEventSeries({
            ...draft,
            actorIds: [...(draft.actorIds || [])],
            participantActorIds: [...(draft.actorIds || [])],
        });
        refreshEvents(savedEvent.id);
    };

    const deleteDraft = () => {
        if (isNewDraft) {
            startNewDraft();
            return;
        }

        if (!draft.id) {
            return;
        }

        stageInstance.deleteCalendarEventSeries(draft.id);
        refreshEvents();
    };

    const recurrenceEnabled = Boolean(draft.recurrence);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '14px', minHeight: 0 }}>
            <GlassPanel variant="default" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>Calendar Events</Title>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={startNewDraft}>New Event</Button>
                    <Button variant="secondary" onClick={() => refreshEvents()}>Refresh</Button>
                </div>

                <div style={{ minHeight: 0, overflow: 'hidden' }}>
                    <CategorizedEntrySidebar
                        sections={eventSections}
                        collapsedSections={collapsedSections}
                        onToggleSection={(sectionId) => {
                            setCollapsedSections((current) => toggleSidebarCollapseState(current, sectionId, true));
                        }}
                        renderEntry={(event) => (
                            <button
                                key={event.id}
                                className="input-base"
                                onClick={() => selectEvent(event.id)}
                                style={{
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    borderColor: selectedEventId === event.id ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)',
                                    background: selectedEventId === event.id
                                        ? 'linear-gradient(145deg, rgba(39, 58, 60, 0.92), rgba(21, 26, 40, 0.92))'
                                        : 'linear-gradient(145deg, rgba(27, 33, 51, 0.92), rgba(21, 26, 40, 0.92))',
                                }}
                            >
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{event.name}</div>
                                <div style={{ fontSize: '13px', color: 'var(--agenda-text-muted)' }}>{event.date}</div>
                                <div style={{ fontSize: '12px', color: 'var(--agenda-text-muted)' }}>{durationSummary(event.duration)}</div>
                                <div style={{ fontSize: '12px', color: 'var(--agenda-text-muted)' }}>{recurrenceSummary(event.recurrence)}</div>
                            </button>
                        )}
                        getEntryKey={(event) => event.id}
                        shouldReduceMotion={Boolean(shouldReduceMotion)}
                        emptyListMessage="No saved events."
                        sectionEmptyMessage="No events in this month."
                    />
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>{isNewDraft ? 'Create Event' : 'Edit Event'}</Title>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Name</label>
                        <TextInput
                            fullWidth
                            value={draft.name}
                            onChange={(e) => updateDraft({ name: e.target.value })}
                            placeholder="Event name"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Date</label>
                        <TextInput
                            fullWidth
                            type="date"
                            value={draft.date}
                            onChange={(e) => updateDraft({ date: e.target.value })}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Location</label>
                        <select
                            className="input-base"
                            value={draft.locationId}
                            onChange={(e) => updateDraft({ locationId: e.target.value })}
                        >
                            {locations.map(location => (
                                <option key={location.id} value={location.id}>{location.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>
                            Duration Slots ({durationSummary(draft.duration)})
                        </label>
                        <div style={{
                            border: '1px solid var(--agenda-line-subtle)',
                            borderRadius: 8,
                            padding: 10,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: '6px 10px',
                        }}>
                            {TIME_OF_DAY_ORDER.map(slot => (
                                <label key={slot} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--agenda-text-primary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={normalizeDuration(draft.duration).includes(slot)}
                                        onChange={() => toggleDurationSlot(slot)}
                                    />
                                    {formatTimeOfDay(slot)}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Description</label>
                        <TextArea
                            value={draft.description}
                            onChange={(e) => updateDraft({ description: e.target.value })}
                            rows={3}
                            style={{ width: '100%', resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Guidance</label>
                        <TextArea
                            value={draft.guidance}
                            onChange={(e) => updateDraft({ guidance: e.target.value })}
                            rows={3}
                            style={{ width: '100%', resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Participants</label>
                        <SearchableOptionPicker
                            multiple
                            values={draft.actorIds || []}
                            onChange={(nextValue) => updateActorSelection(Array.isArray(nextValue) ? nextValue : [])}
                            options={actors.map((actor) => ({ key: actor.id, label: actor.name }))}
                            allowClear
                            emptyLabel="No actors"
                            title="Choose involved actors"
                            placeholder="Search actors"
                            defaultOptionKeys={[]}
                            renderButton={(selectedValue) => {
                                const selectedActors = Array.isArray(selectedValue) ? selectedValue : [];
                                const count = selectedActors.length;
                                return (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', color: count > 0 ? 'var(--agenda-text-primary)' : 'var(--agenda-text-muted)' }}>
                                        {count > 0 ? `${count} selected` : <><DoNotDisturb style={{ fontSize: 18 }} />No actors</>}
                                    </span>
                                );
                            }}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--agenda-text-muted)', marginBottom: 8 }}>
                            <input
                                type="checkbox"
                                checked={recurrenceEnabled}
                                onChange={(e) => setRecurrenceEnabled(e.target.checked)}
                            />
                            Recurring Event
                        </label>

                        {recurrenceEnabled && draft.recurrence && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                <select
                                    className="input-base"
                                    value={draft.recurrence.frequency}
                                    onChange={(e) => updateDraft({
                                        recurrence: {
                                            ...draft.recurrence!,
                                            frequency: e.target.value as CalendarEventRecurrence['frequency'],
                                        },
                                    })}
                                >
                                    <option value="daily">daily</option>
                                    <option value="weekly">weekly</option>
                                    <option value="monthly">monthly</option>
                                </select>

                                <TextInput
                                    fullWidth
                                    type="number"
                                    min={1}
                                    value={String(draft.recurrence.interval)}
                                    onChange={(e) => updateDraft({
                                        recurrence: {
                                            ...draft.recurrence!,
                                            interval: Math.max(1, Number(e.target.value) || 1),
                                        },
                                    })}
                                    placeholder="Interval"
                                />

                                <TextInput
                                    fullWidth
                                    type="date"
                                    value={draft.recurrence.untilDate}
                                    onChange={(e) => updateDraft({
                                        recurrence: {
                                            ...draft.recurrence!,
                                            untilDate: e.target.value,
                                        },
                                    })}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <Button variant="danger" onClick={deleteDraft}>{isNewDraft ? 'Reset Draft' : 'Delete Event'}</Button>
                    <Button variant="primary" onClick={saveDraft}>Save Event</Button>
                </div>
            </GlassPanel>
        </div>
    );
};

export default CalendarEventManagementPanel;
