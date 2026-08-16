import { FC } from 'react';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { ActorSchedule, ACTOR_SCHEDULE_AVAILABLE, ACTOR_SCHEDULE_UNAVAILABLE } from '../content/Actor';
import { Location } from '../content/Location';
import { ActorStat } from '../Stage';
import { Button } from './UiComponents';
import { ConditionEditor } from './ConditionEditor';

interface ActorScheduleEditorProps {
    schedule: ActorSchedule;
    locations: Location[];
    playerStats: ActorStat[];
    actors?: Array<{ id: string; name: string }>;
    onChange: (schedule: ActorSchedule) => void;
}

const selectStyle = {
    minHeight: 38,
    background: 'var(--agenda-surface-base)',
    color: 'var(--agenda-text-primary)',
    border: '1px solid var(--agenda-line-subtle)',
    borderRadius: 6,
    padding: '0 8px',
};

const cloneSchedule = (entries: Array<[string, ActorSchedule[string]]>): ActorSchedule => Object.fromEntries(
    entries.map(([destination, collections]) => [destination, collections.map(collection => [...collection])]),
);

export const ActorScheduleEditor: FC<ActorScheduleEditorProps> = ({ schedule, locations, playerStats, actors = [], onChange }) => {
    const entries = Object.entries(schedule);
    const targets = [
        { id: ACTOR_SCHEDULE_AVAILABLE, name: 'Generally available' },
        { id: ACTOR_SCHEDULE_UNAVAILABLE, name: 'Generally unavailable' },
        ...locations.map(location => ({ id: location.id, name: location.name || 'Unnamed location' })),
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
        const destination = targets.find(target => !usedTargets.has(target.id))?.id;
        if (destination) {
            onChange(cloneSchedule([...entries, [destination, []]]));
        }
    };

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            {entries.map(([destination, conditionCollections], index) => (
                <div key={destination} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--agenda-line-subtle)', borderRadius: 6, background: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <select aria-label="Schedule destination" style={{ ...selectStyle, flex: '1 1 220px' }} value={destination} onChange={event => updateEntry(index, event.target.value, conditionCollections)}>
                            {targets.map(target => <option key={target.id} value={target.id} disabled={target.id !== destination && entries.some(([current]) => current === target.id)}>{target.name}</option>)}
                        </select>
                        <Button variant="secondary" disabled={index === 0} onClick={() => moveEntry(index, -1)} aria-label="Move schedule entry up" style={{ minWidth: 34, padding: 6 }}><ArrowUpward fontSize="small" /></Button>
                        <Button variant="secondary" disabled={index === entries.length - 1} onClick={() => moveEntry(index, 1)} aria-label="Move schedule entry down" style={{ minWidth: 34, padding: 6 }}><ArrowDownward fontSize="small" /></Button>
                        <Button variant="danger" onClick={() => onChange(cloneSchedule(entries.filter((_, currentIndex) => currentIndex !== index)))} aria-label="Delete schedule entry" style={{ minWidth: 34, padding: 6 }}><Delete fontSize="small" /></Button>
                    </div>
                    <ConditionEditor conditionCollections={conditionCollections} playerStats={playerStats} actors={actors} onChange={collections => updateEntry(index, destination, collections)} />
                    {conditionCollections.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Always applies when reached.</span>}
                </div>
            ))}
            {entries.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>No schedule entries. This actor is generally available.</span>}
            <Button variant="secondary" disabled={entries.length >= targets.length} onClick={addEntry} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}>
                <Add fontSize="small" /> Add schedule entry
            </Button>
        </div>
    );
};