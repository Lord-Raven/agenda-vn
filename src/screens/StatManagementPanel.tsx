import React, { FC, useCallback, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { Stat, cloneStat } from '../content/Stat';
import { StatEntryCategory } from '../components/StatEntryEditor';
import {
    CategorizedEntrySidebar,
    toggleSidebarCollapseState,
    useCachedSidebarCollapseState,
} from '../components/CategorizedEntrySidebar';
import { useDebouncedSave } from '../components/useDebouncedSave';
import { GlobalStatManagementPanel } from './GlobalStatManagementPanel';
import { StatsDetailPanel } from './StatsDetailPanel';

interface StatManagementPanelProps {
    stage: () => Stage;
    isCreatorMode: boolean;
}

const STAT_CATEGORIES: { id: StatEntryCategory; title: string }[] = [
    { id: 'global', title: 'Global' },
    { id: 'actor', title: 'Actor' },
    { id: 'location', title: 'Location' },
    { id: 'item', title: 'Item' },
];

const defaultGlobalStat = (): Stat => {
    const id = generateUuid();
    return {
        id,
        name: 'New Setting',
        guidance: 'How this setting should influence generated narrative and behavior.',
        default: 'Default',
        type: 'option',
        options: [{
            id: generateUuid(),
            name: 'Default',
            description: 'Default option behavior for this setting.',
        }],
        defaultValueRules: [{ id: `default:${id}`, value: 'Default', conditions: [] }],
        llmSees: { value: false, conditions: [] },
        llmMaintained: { value: false, conditions: [] },
    };
};

const defaultTypedStat = (): Stat => ({
    id: generateUuid(),
    name: 'Name',
    guidance: 'Guidance for the LLM on how this stat is applied or what a high or low score is or represents.',
    default: 50,
    type: 'number',
    min: 0,
    max: 100,
    options: [],
    llmSees: { value: false, conditions: [] },
    llmMaintained: { value: false, conditions: [] },
});

export const StatManagementPanel: FC<StatManagementPanelProps> = ({ stage, isCreatorMode }) => (
    isCreatorMode
        ? <CreatorStatManagementPanel stage={stage} />
        : <GlobalStatManagementPanel stage={stage} />
);

const CreatorStatManagementPanel: FC<{ stage: () => Stage }> = ({ stage }) => {
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const configuration = stageInstance.getConfiguration();
    const [stats, setStats] = useState<Record<StatEntryCategory, Stat[]>>(() => ({
        global: (configuration.globalStats || []).map(cloneStat),
        actor: (configuration.actorStats || []).map(cloneStat),
        location: (configuration.locationStats || []).map(cloneStat),
        item: (configuration.itemStats || []).map(cloneStat),
    }));
    const [selectedStatId, setSelectedStatId] = useState<string | null>(null);
    const [collapsedSections, setCollapsedSections] = useCachedSidebarCollapseState('stat-management');
    const shouldReduceMotion = useReducedMotion();

    const saveGameConfiguration = useCallback(() => {
        stageInstance.updateConfiguration({
            globalStats: stats.global,
            actorStats: stats.actor,
            locationStats: stats.location,
            itemStats: stats.item,
        });
    }, [stageInstance, stats]);
    useDebouncedSave(saveGameConfiguration);

    const sections = STAT_CATEGORIES.map(category => ({ ...category, entries: stats[category.id] }));
    const selectedSection = sections.find(section => section.entries.some(stat => stat.id === selectedStatId));
    const selectedIndex = selectedSection?.entries.findIndex(stat => stat.id === selectedStatId) ?? -1;
    const selectedStat = selectedSection?.entries[selectedIndex];
    const conditionActors = Object.values(save.actors || {}).filter(actor => actor.id !== save.playerId);
    const actorOptions = conditionActors.filter(actor => actor.active !== false);
    const locationOptions = Object.values(save.atlas || {}).filter(location => location.active !== false);
    const itemOptions = (save.inventory || []).filter(item => item.active !== false);

    const updateStat = (category: StatEntryCategory, id: string, patch: Partial<Stat>) => {
        setStats(current => ({
            ...current,
            [category]: current[category].map(stat => stat.id === id ? { ...stat, ...patch } : stat),
        }));
    };

    const handleCreateStat = (sectionId: string) => {
        const section = sections.find(candidate => candidate.id === sectionId);
        if (!section) {
            throw new Error(`Unknown stat category: ${sectionId}`);
        }
        const stat = section.id === 'global' ? defaultGlobalStat() : defaultTypedStat();
        setStats(current => ({ ...current, [section.id]: [...current[section.id], stat] }));
        setCollapsedSections(current => ({ ...current, [section.id]: false }));
        setSelectedStatId(stat.id);
    };

    const moveSelectedStat = (direction: -1 | 1) => {
        if (!selectedSection || !selectedStat) {
            return;
        }
        const category = selectedSection.id;
        const targetIndex = selectedIndex + direction;
        if (targetIndex < 0 || targetIndex >= stats[category].length) {
            return;
        }
        setStats(current => {
            const entries = [...current[category]];
            [entries[selectedIndex], entries[targetIndex]] = [entries[targetIndex], entries[selectedIndex]];
            return { ...current, [category]: entries };
        });
    };

    const removeSelectedStat = () => {
        if (!selectedSection || !selectedStat) {
            return;
        }
        setStats(current => ({
            ...current,
            [selectedSection.id]: current[selectedSection.id].filter(stat => stat.id !== selectedStat.id),
        }));
        setSelectedStatId(null);
    };

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
            gap: '20px', flex: 1, minHeight: 0, height: '100%',
        }}>
            <CategorizedEntrySidebar
                sections={sections}
                collapsedSections={collapsedSections}
                onToggleSection={sectionId => setCollapsedSections(current => toggleSidebarCollapseState(current, sectionId, false))}
                renderEntry={stat => (
                    <button
                        type="button"
                        aria-pressed={stat.id === selectedStatId}
                        onClick={() => setSelectedStatId(stat.id)}
                        style={{
                            width: '100%', textAlign: 'left', borderRadius: '8px', padding: '10px',
                            background: stat.id === selectedStatId
                                ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'
                                : 'color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)',
                            border: `1px solid ${stat.id === selectedStatId ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)'}`,
                            color: 'var(--agenda-text-primary)', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', gap: '2px',
                        }}
                    >
                        <span style={{ color: 'var(--agenda-highlight)', fontSize: '14px', fontWeight: 700 }}>
                            {stat.name.trim() || '(Unnamed Stat)'}
                        </span>
                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: '12px' }}>{stat.type}</span>
                    </button>
                )}
                getEntryKey={stat => stat.id}
                shouldReduceMotion={Boolean(shouldReduceMotion)}
                emptyListMessage="No stats have been defined yet."
                sectionEmptyMessage="No stats."
                defaultCollapsed={false}
                renderSectionAction={section => handleCreateStat(section.id)}
            />
            <div style={{
                background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
                border: '1px solid var(--agenda-line-subtle)', borderRadius: '12px',
                overflowY: 'auto', overflowX: 'hidden', minHeight: 0, maxHeight: '100%',
            }}>
                {selectedStat && selectedSection ? (
                    <StatsDetailPanel
                        key={selectedStat.id}
                        stat={selectedStat}
                        index={selectedIndex}
                        total={selectedSection.entries.length}
                        typeLabel={`${selectedSection.title} Stat`}
                        category={selectedSection.id}
                        onMove={moveSelectedStat}
                        onRemove={removeSelectedStat}
                        onPatch={patch => updateStat(selectedSection.id, selectedStat.id, patch)}
                        onNameChange={name => updateStat(selectedSection.id, selectedStat.id, { name })}
                        selfStats={selectedSection.entries}
                        globalStats={stats.global}
                        actorStats={stats.actor}
                        conditionActors={conditionActors}
                        valueActors={actorOptions}
                        items={itemOptions}
                        locations={locationOptions}
                        stage={stage}
                    />
                ) : (
                    <div style={{ color: 'var(--agenda-text-muted)', fontSize: '15px', textAlign: 'center', padding: '30px' }}>
                        Select a stat to view and edit details.
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatManagementPanel;
