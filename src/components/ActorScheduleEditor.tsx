import { FC } from 'react';
import { Add, ArrowDownward, ArrowUpward, Delete, EventAvailable, EventBusy } from '@mui/icons-material';
import { ActorSchedule, ACTOR_SCHEDULE_AVAILABLE, ACTOR_SCHEDULE_UNAVAILABLE } from '../content/Actor';
import { ActorStat } from '../content/ActorStat';
import { Button } from './UiComponents';
import { SearchableOptionPicker } from './ActorStatRating';
import { ConditionEditor } from './ConditionEditor';

interface ActorScheduleEditorProps {
    schedule: ActorSchedule;
    locations: Array<{ id: string; name: string; imageUrl?: string }>;
    playerStats: ActorStat[];
    actors?: Array<{ id: string; name: string }>;
    emptyLabel?: string;
    onChange: (schedule: ActorSchedule) => void;
}

const cloneSchedule = (entries: Array<[string, ActorSchedule[string]]>): ActorSchedule => Object.fromEntries(
    entries.map(([destination, collections]) => [destination, collections.map(collection => [...collection])]),
);

export const ActorScheduleEditor: FC<ActorScheduleEditorProps> = ({ schedule, locations, playerStats, actors = [], emptyLabel = 'No schedule entries. This actor is generally available.', onChange }) => {
    const entries = Object.entries(schedule);
    const targets = [
        { key: ACTOR_SCHEDULE_AVAILABLE, label: 'Generally available', icon: EventAvailable },
        { key: ACTOR_SCHEDULE_UNAVAILABLE, label: 'Generally unavailable', icon: EventBusy },
        ...locations.map(location => ({ key: location.id, label: location.name || 'Unnamed location', imageUrl: location.imageUrl || '' })),
    ];

    const updateEntry = (index: number, destination: string, collections: ActorSchedule[string]) => {
        const nextEntries = entries.map((entry, currentIndex) => currentIndex === index
            ? [destination, collections] as [string, ActorSchedule[string]]
            : entry);
        onChange(cloneSchedule(nextEntries));
    };

    const moveEntry = (index: number, offset: -1 | 1) => {
        const targetIndex = index + offset;
        if (targetIndex < 0 || targetIndex >= entries.length) {
            return;
        }
        const nextEntries = [...entries];
        [nextEntries[index], nextEntries[targetIndex]] = [nextEntries[targetIndex], nextEntries[index]];
        onChange(cloneSchedule(nextEntries));
    };

    const addEntry = () => {
        const usedTargets = new Set(entries.map(([destination]) => destination));
        const destination = targets.find(target => !usedTargets.has(target.key))?.key;
        if (destination) {
            onChange(cloneSchedule([...entries, [destination, []]]));
        }
    };

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            {entries.map(([destination, conditionCollections], index) => {
                // A destination can only be scheduled once, so hide targets already claimed by another entry.
                const availableTargets = targets.filter(target => target.key === destination || !entries.some(([current]) => current === target.key));
                return (
                    <div key={destination} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--agenda-line-subtle)', borderRadius: 6, background: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                                <SearchableOptionPicker
                                    value={destination}
                                    onChange={(nextValue) => {
                                        const nextDestination = (Array.isArray(nextValue) ? nextValue[0] : nextValue) || destination;
                                        if (nextDestination !== destination) {
                                            updateEntry(index, nextDestination, conditionCollections);
                                        }
                                    }}
                                    options={availableTargets}
                                    defaultOptionKeys={[ACTOR_SCHEDULE_AVAILABLE, ACTOR_SCHEDULE_UNAVAILABLE]}
                                    allowClear={false}
                                    title="Choose schedule destination"
                                    placeholder="Search locations"
                                />
                            </div>
                            <Button variant="secondary" disabled={index === 0} onClick={() => moveEntry(index, -1)} aria-label="Move schedule entry up" style={{ minWidth: 34, padding: 6 }}><ArrowUpward fontSize="small" /></Button>
                            <Button variant="secondary" disabled={index === entries.length - 1} onClick={() => moveEntry(index, 1)} aria-label="Move schedule entry down" style={{ minWidth: 34, padding: 6 }}><ArrowDownward fontSize="small" /></Button>
                            <Button variant="danger" onClick={() => onChange(cloneSchedule(entries.filter((_, currentIndex) => currentIndex !== index)))} aria-label="Delete schedule entry" style={{ minWidth: 34, padding: 6 }}><Delete fontSize="small" /></Button>
                        </div>
                        <ConditionEditor conditionCollections={conditionCollections} playerStats={playerStats} actors={actors} locations={locations} onChange={collections => updateEntry(index, destination, collections)} />
                        {conditionCollections.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Always applies when reached.</span>}
                    </div>
                );
            })}
            {entries.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>{emptyLabel}</span>}
            <Button variant="secondary" disabled={entries.length >= targets.length} onClick={addEntry} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}>
                <Add fontSize="small" /> Add schedule entry
            </Button>
        </div>
    );
};