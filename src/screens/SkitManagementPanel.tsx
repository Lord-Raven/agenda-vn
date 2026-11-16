import { FC, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Stage, TimelineEntry } from '../Stage';
import { formatDateLabel } from '../content/Skit';
import { formatTimeSlot } from '../content/CalendarEvent';
import { getLocationName } from '../content/Location';
import {
    CategorizedEntrySection,
    CategorizedEntrySidebar,
    toggleSidebarCollapseState,
    useCachedSidebarCollapseState,
} from '../components/CategorizedEntrySidebar';
import { SkitDetailPanel } from './SkitDetailPanel';

interface SkitManagementPanelProps {
    stage: () => Stage;
}

type SkitTimelineEntry = TimelineEntry & { skit: NonNullable<TimelineEntry['skit']> };

export const SkitManagementPanel: FC<SkitManagementPanelProps> = ({ stage }) => {
    const shouldReduceMotion = useReducedMotion();
    const save = stage().getSave();

    const skitEntries = useMemo(
        () => ((save.timeline || []) as TimelineEntry[]).filter((entry): entry is SkitTimelineEntry => !!entry.skit),
        [save.timeline],
    );

    const skitSections = useMemo<CategorizedEntrySection<SkitTimelineEntry>[]>(() => {
        const sections: CategorizedEntrySection<SkitTimelineEntry>[] = [];
        const sectionsByDate = new Map<string, CategorizedEntrySection<SkitTimelineEntry>>();
        for (const entry of skitEntries) {
            const dateKey = entry.date || 'unknown';
            let section = sectionsByDate.get(dateKey);
            if (!section) {
                section = {
                    id: `skit-day-${dateKey}`,
                    title: !entry.date
                        ? 'Unknown Day'
                        : stage().getDateMode() === 'calendar'
                            ? formatDateLabel(entry.date)
                            : `Day ${stage().getDayNumberForDate(entry.date)}`,
                    entries: [],
                };
                sectionsByDate.set(dateKey, section);
                sections.push(section);
            }
            section.entries.push(entry);
        }
        return sections;
    }, [skitEntries, stage]);

    const [selectedSkitId, setSelectedSkitId] = useState<string | null>(
        () => skitEntries[skitEntries.length - 1]?.skit.id || null,
    );

    const selectedEntry = useMemo(
        () => skitEntries.find((entry) => entry.skit.id === selectedSkitId) || null,
        [skitEntries, selectedSkitId],
    );

    const [collapsedDays, setCollapsedDays] = useCachedSidebarCollapseState('skit-management');

    const updateSelectedSummary = (summary: string) => {
        if (selectedEntry) {
            selectedEntry.skit.summary = summary;
        }
    };

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
                gap: '20px',
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                height: '100%',
            }}
        >
            <CategorizedEntrySidebar
                sections={skitSections}
                collapsedSections={collapsedDays}
                onToggleSection={(sectionId) => {
                    setCollapsedDays((current) => toggleSidebarCollapseState(current, sectionId, true));
                }}
                renderEntry={(entry) => {
                    const isSelected = selectedSkitId === entry.skit.id;
                    const timeLabel = entry.timeOfDay ? formatTimeSlot(entry.timeOfDay) : '';
                    const statusLabel = entry.skit.over ? '' : 'In progress';
                    const subtitle = [timeLabel, statusLabel].filter(Boolean).join(' — ');
                    return (
                        <motion.button
                            whileHover={{ scale: 1.01 }}
                            type="button"
                            onClick={() => setSelectedSkitId(entry.skit.id)}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                background: isSelected
                                    ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'
                                    : 'color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)',
                                border: `1px solid ${isSelected ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)'}`,
                                borderRadius: '8px',
                                padding: '8px 10px',
                                color: 'var(--agenda-text-primary)',
                                cursor: 'pointer',
                                display: 'grid',
                                gap: '2px',
                            }}
                        >
                            <span style={{ fontWeight: 700 }}>
                                {getLocationName(entry.skit.initialLocationId, stage())}
                            </span>
                            {subtitle && (
                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: '12px' }}>
                                    {subtitle}
                                </span>
                            )}
                        </motion.button>
                    );
                }}
                getEntryKey={(entry) => entry.skit.id}
                shouldReduceMotion={Boolean(shouldReduceMotion)}
                emptyListMessage="No skits have occurred yet."
                defaultCollapsed
                sectionEmptyMessage="No skits"
            />

            <div
                style={{
                    background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
                    border: '1px solid var(--agenda-line-subtle)',
                    borderRadius: '12px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    minWidth: 0,
                    maxHeight: '100%',
                }}
            >
                {!selectedEntry ? (
                    <div
                        style={{
                            color: 'var(--agenda-text-muted)',
                            fontSize: '15px',
                            textAlign: 'center',
                            padding: '30px',
                        }}
                    >
                        Select a skit to view its details.
                    </div>
                ) : (
                    <SkitDetailPanel
                        key={selectedEntry.skit.id}
                        stage={stage}
                        entry={selectedEntry}
                        skit={selectedEntry.skit}
                        onSummaryChange={updateSelectedSummary}
                    />
                )}
            </div>
        </div>
    );
};
