import { CSSProperties, FC, useState } from 'react';
import { AutoAwesome, Theaters } from '@mui/icons-material';
import { Stage, TimelineEntry } from '../Stage';
import { formatDateLabel, generateSkitSummary, Skit } from '../content/Skit';
import { formatTimeSlot, timeSlotTerm } from '../content/CalendarEvent';
import { getLocationName } from '../content/Location';
import { Button, ConfirmDialog, TextArea } from '../components/UiComponents';
import { useTooltip } from '../components/TooltipContext';
import { TheaterScreen } from './TheaterScreen';

interface SkitDetailPanelProps {
    stage: () => Stage;
    entry: TimelineEntry;
    skit: Skit;
    onSummaryChange: (summary: string) => void;
}

const labelStyle: CSSProperties = { color: 'var(--agenda-text-muted)', fontSize: '13px' };

const readOnlyValueStyle: CSSProperties = {
    color: 'var(--agenda-text-primary)',
    fontSize: '14px',
    lineHeight: 1.5,
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--agenda-line-subtle)',
    background: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)',
};

// Every location the skit visited, starting with its initial location, in order of first appearance.
export const getSkitLocationIds = (skit: Skit): string[] => {
    const locationIds: string[] = [];
    const addLocation = (locationId?: string) => {
        if (locationId && !locationIds.includes(locationId)) {
            locationIds.push(locationId);
        }
    };
    addLocation(skit.initialLocationId);
    (skit.script || []).forEach((scriptEntry) => addLocation(scriptEntry.updatedLocationId));
    return locationIds;
};

// Every actor who participated in the skit (initial cast, later arrivals, and speakers), in order of first appearance.
export const getSkitActorIds = (skit: Skit): string[] => {
    const actorIds: string[] = [];
    const addActor = (actorId?: string) => {
        if (actorId && !actorIds.includes(actorId)) {
            actorIds.push(actorId);
        }
    };
    (skit.initialActors || []).forEach(addActor);
    (skit.script || []).forEach((scriptEntry) => {
        (scriptEntry.updatedActors || []).forEach(addActor);
        addActor(scriptEntry.speakerId);
    });
    return actorIds;
};

export const SkitDetailPanel: FC<SkitDetailPanelProps> = ({ stage, entry, skit, onSummaryChange }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [summary, setSummary] = useState(skit.summary || '');
    const [confirmGeneration, setConfirmGeneration] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState('');
    const [showTheater, setShowTheater] = useState(false);

    const save = stage().getSave();
    const dayLabel = stage().getDateMode() === 'calendar'
        ? formatDateLabel(entry.date)
        : `Day ${stage().getDayNumberForDate(entry.date || '')}`;
    const timeLabel = entry.timeOfDay ? formatTimeSlot(entry.timeOfDay) : '';

    const locationNames = getSkitLocationIds(skit).map((locationId) => getLocationName(locationId, stage()));
    const actorNames = getSkitActorIds(skit)
        .map((actorId) => save.actors?.[actorId]?.name || '')
        .filter((name) => name.length > 0);

    const updateSummary = (value: string) => {
        setSummary(value);
        onSummaryChange(value);
    };

    const generate = async () => {
        setConfirmGeneration(false);
        setGenerationError('');
        setIsGenerating(true);
        try {
            const generated = await generateSkitSummary(skit, stage());
            if (generated) {
                setSummary(generated);
                stage().saveGame();
            } else {
                setGenerationError('Failed to generate a summary. Please try again.');
            }
        } catch (error) {
            console.error('Failed to generate skit summary:', error);
            setGenerationError('Failed to generate a summary. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                    variant="secondary"
                    disabled={!(skit.script || []).length}
                    onClick={() => setShowTheater(true)}
                    onMouseEnter={() => setTooltip('Replay this skit in the theater', Theaters)}
                    onMouseLeave={clearTooltip}
                >
                    <Theaters fontSize="small" /> Theater
                </Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '10px' }}>
                <div style={{ display: 'grid', gap: '6px', alignContent: 'start' }}>
                    <label style={labelStyle}>Day</label>
                    <div style={readOnlyValueStyle}>{dayLabel}</div>
                </div>
                {timeLabel && (
                    <div style={{ display: 'grid', gap: '6px', alignContent: 'start' }}>
                        <label style={labelStyle}>{timeSlotTerm()}</label>
                        <div style={readOnlyValueStyle}>{timeLabel}</div>
                    </div>
                )}
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
                <label style={labelStyle}>{locationNames.length === 1 ? 'Location' : 'Locations'}</label>
                <div style={readOnlyValueStyle}>{locationNames.length > 0 ? locationNames.join(', ') : 'Unknown Location'}</div>
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
                <label style={labelStyle}>{actorNames.length === 1 ? 'Actor' : 'Actors'}</label>
                <div style={readOnlyValueStyle}>{actorNames.length > 0 ? actorNames.join(', ') : 'None'}</div>
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <label style={labelStyle}>Summary</label>
                    <Button
                        variant="secondary"
                        disabled={isGenerating || !(skit.script || []).length}
                        onClick={() => setConfirmGeneration(true)}
                        onMouseEnter={() => setTooltip('Regenerate the summary from this skit\'s script after confirming replacement of the current summary', AutoAwesome)}
                        onMouseLeave={clearTooltip}
                    >
                        <AutoAwesome fontSize="small" /> {isGenerating ? 'Generating...' : 'Generate'}
                    </Button>
                </div>
                <TextArea
                    value={summary}
                    onChange={(event) => updateSummary(event.target.value)}
                    rows={8}
                    disabled={isGenerating}
                    placeholder="No summary has been generated for this skit yet."
                    aria-label="Skit summary"
                    style={{ width: '100%', minHeight: '160px', resize: 'vertical' }}
                />
                {generationError && (
                    <div role="alert" style={{ color: 'var(--agenda-danger-text)', fontSize: '13px' }}>
                        {generationError}
                    </div>
                )}
            </div>
            <ConfirmDialog
                isOpen={confirmGeneration}
                title="Regenerate Summary?"
                message="This will replace the current summary with a newly generated one based on this skit's script. This cannot be undone."
                confirmText="Generate"
                onConfirm={generate}
                onCancel={() => setConfirmGeneration(false)}
            />
            {showTheater && (
                <TheaterScreen
                    stage={stage}
                    skit={skit}
                    onClose={() => setShowTheater(false)}
                />
            )}
        </div>
    );
};
