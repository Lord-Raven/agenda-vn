import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { ActorSchedule, cloneActorSchedule } from '../content/Actor';
import { Stat, StatValue, StatUpdateRule, cloneStatValueRules, cloneStatUpdateRules, findStatOptionByValue, isNumericDisplayType, isReferenceDisplayType, isReferenceListDisplayType, normalizeReferenceListValue, cloneStat } from '../content/Stat';
import { Button, GlassPanel, Title } from '../components/UiComponents';
import { ActorScheduleEditor } from '../components/ActorScheduleEditor';
import { StatUpdateRuleEditor } from '../components/StatUpdateRuleEditor';
import { resolveStatDefaultValue, StatEntryEditor } from '../components/StatEntryEditor';
import { Add } from '@mui/icons-material';

interface StatManagementPanelProps {
    stage: () => Stage;
}

const normalizeStatValue = (value: unknown, stat: Stat): StatValue => {
    if (stat.type === 'option') {
        const selectedOption = findStatOptionByValue(stat, value);
        if (selectedOption) {
            return selectedOption.value;
        }
        return resolveStatDefaultValue(stat);
    }

    if (isReferenceListDisplayType(stat.type)) {
        return Array.isArray(value) ? normalizeReferenceListValue(value) : resolveStatDefaultValue(stat);
    }

    if (stat.type === 'text' || isReferenceDisplayType(stat.type)) {
        if (typeof value === 'string') {
            return value;
        }
        return resolveStatDefaultValue(stat);
    }

    if (stat.type === 'checkbox') {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const lowered = value.trim().toLowerCase();
            if (lowered === 'true') return true;
            if (lowered === 'false') return false;
        }
        return resolveStatDefaultValue(stat) as boolean;
    }

    let resolved = Number.isFinite(value) ? Number(value) : Number(resolveStatDefaultValue(stat)) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

const defaultGlobalStat = (): Stat => ({
    id: generateUuid(),
    name: 'New Setting',
    description: 'Describe what this player setting controls.',
    guidance: 'How this setting should influence generated narrative and behavior.',
    default: 'Default',
    type: 'option',
    options: [{
        id: generateUuid(),
        name: 'Default',
        description: 'Default option behavior for this setting.',
    }],
    setByPlayer: true,
    exposed: { value: true, conditions: [] },
    llmSees: { value: true, conditions: [] },
    llmMaintained: { value: true, conditions: [] },
    iconName: 'star',
});

const defaultTypedStat = (): Stat => ({
    id: generateUuid(),
    name: 'Name',
    description: 'A user-facing description of this stat.',
    perActor: false,
    perActorDefaultRules: [],
    guidance: 'Guidance for the LLM on how this stat is applied or what a high or low score is or represents.',
    default: 50,
    type: 'number',
    displayType: 'percentage',
    min: 0,
    max: 100,
    options: [],
    setByPlayer: false,
    exposed: { value: false, conditions: [] },
    llmSees: { value: true, conditions: [] },
    llmMaintained: { value: true, conditions: [] },
    iconName: 'star',
});

const swapArrayItems = <T,>(items: T[], indexA: number, indexB: number): T[] => {
    const next = [...items];
    [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
    return next;
};

const clampStatValue = (value: number, stat: Stat): number => {
    let resolved = Number.isFinite(value) ? Number(value) : Number(stat.default) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

export const StatManagementPanel: FC<StatManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const configuration = stageInstance.getConfiguration();

    const [globalStats, setGlobalStats] = useState<Stat[]>(() =>
        (configuration.globalStats || []).map(cloneStat),
    );
    const locationOptions = useMemo(
        () => Object.values(save.atlas || {})
            .filter(location => location.active !== false),
        [save.atlas],
    );
    const actorOptions = useMemo(
        () => Object.values(save.actors || {})
            .filter(actor => actor.active !== false),
        [save.actors],
    );
    const itemOptions = useMemo(
        () => (save.inventory || [])
            .filter(item => item.active !== false),
        [save.inventory],
    );
    const [collapsedGlobalStats, setCollapsedGlobalStats] = useState<boolean[]>(() =>
        (configuration.globalStats || []).map(() => true),
    );
    const [collapsedActorStats, setCollapsedActorStats] = useState<boolean[]>(() =>
        (configuration.actorStats || []).map(() => true),
    );
    const [actorStats, setActorStats] = useState<Stat[]>(() =>
        (configuration.actorStats || []).map(cloneStat),
    );
    const [collapsedLocationStats, setCollapsedLocationStats] = useState<boolean[]>(() =>
        (configuration.locationStats || []).map(() => true),
    );
    const [locationStats, setLocationStats] = useState<Stat[]>(() =>
        (configuration.locationStats || []).map(cloneStat),
    );
    const [collapsedItemStats, setCollapsedItemStats] = useState<boolean[]>(() =>
        (configuration.itemStats || []).map(() => true),
    );
    const [itemStats, setItemStats] = useState<Stat[]>(() =>
        (configuration.itemStats || []).map(cloneStat),
    );
    const [globalStatValues, setGlobalStatValues] = useState<{ [key: string]: StatValue }>(() => ({
        ...configuration.globalStatValues,
        ...save.globalStatValues,
    }));
    const [universalSchedule, setUniversalSchedule] = useState<ActorSchedule>(() =>
        cloneActorSchedule(configuration.universalSchedule),
    );
    const [statUpdateRules, setStatUpdateRules] = useState<StatUpdateRule[]>(() =>
        cloneStatUpdateRules(configuration.statUpdateRules),
    );
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const didMountRef = useRef(false);

    const fieldLabelStyle: React.CSSProperties = {
        display: 'block',
        color: 'var(--agenda-text-muted)',
        marginBottom: 0,
        fontSize: '13px',
        lineHeight: 1.1,
    };

    const inlineFieldStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '120px minmax(0, 1fr)',
        gap: '10px',
        alignItems: 'center',
        marginBottom: 8,
    };

    const inlineFieldTopStyle: React.CSSProperties = {
        ...inlineFieldStyle,
        alignItems: 'start',
    };

    const compactChipLabelStyle: React.CSSProperties = {
        color: 'var(--agenda-text-muted)',
        fontSize: '12px',
        marginBottom: 4,
    };

    const validGlobalStatValues = useMemo(() => {
        const nextValues: { [key: string]: StatValue } = {};

        globalStats.forEach((stat) => {
            if (!stat.id || !(stat.name || '').trim()) {
                return;
            }

            nextValues[stat.id] = normalizeStatValue(globalStatValues[stat.id], stat);
        });

        return nextValues;
    }, [globalStatValues, globalStats]);

    const saveGameConfiguration = useCallback(() => {
        stageInstance.updateConfiguration({
            actorStats,
            locationStats,
            itemStats,
            globalStats: globalStats,
            globalStatValues: validGlobalStatValues,
            universalSchedule,
            statUpdateRules,
        });

        const currentSave = stageInstance.getSave();
        const statIds = new Set(
            actorStats
                .filter(stat => !stat.perActor)
                .map(stat => stat.id),
        );

        Object.values(currentSave.actors || {}).forEach(actor => {
            if (!actor.statMap || typeof actor.statMap !== 'object') {
                actor.statMap = {};
            }

            actorStats.filter(stat => (isNumericDisplayType(stat.type) || isReferenceDisplayType(stat.type) || isReferenceListDisplayType(stat.type)) && !stat.perActor).forEach(stat => {
                if (!stat.id || !stat.name.trim()) {
                    return;
                }

                if (isReferenceDisplayType(stat.type)) {
                    const existing = actor.statMap[stat.id];
                    actor.statMap[stat.id] = typeof existing === 'string' ? existing : (typeof stat.default === 'string' ? stat.default : '');
                    return;
                }

                if (isReferenceListDisplayType(stat.type)) {
                    const existing = actor.statMap[stat.id];
                    actor.statMap[stat.id] = Array.isArray(existing) ? normalizeReferenceListValue(existing) : normalizeReferenceListValue(stat.default);
                    return;
                }

                const existing = actor.statMap[stat.id];
                const fallback = Number.isFinite(stat.default) ? Number(stat.default) : 0;
                const value = Number.isFinite(existing) ? Number(existing) : fallback;
                actor.statMap[stat.id] = clampStatValue(value, stat);
            });

            Object.keys(actor.statMap).forEach(statId => {
                if (!statIds.has(statId)) {
                    delete actor.statMap[statId];
                }
            });
        });

        const locationStatIds = new Set(locationStats.map(stat => stat.id));

        Object.values(currentSave.atlas || {}).forEach(location => {
            if (!location.statMap || typeof location.statMap !== 'object') {
                location.statMap = {};
            }

            locationStats.filter(stat => isNumericDisplayType(stat.type) || isReferenceDisplayType(stat.type) || isReferenceListDisplayType(stat.type)).forEach(stat => {
                if (!stat.id || !stat.name.trim()) {
                    return;
                }

                if (isReferenceDisplayType(stat.type)) {
                    const existing = location.statMap[stat.id];
                    location.statMap[stat.id] = typeof existing === 'string' ? existing : (typeof stat.default === 'string' ? stat.default : '');
                    return;
                }

                if (isReferenceListDisplayType(stat.type)) {
                    const existing = location.statMap[stat.id];
                    location.statMap[stat.id] = Array.isArray(existing) ? normalizeReferenceListValue(existing) : normalizeReferenceListValue(stat.default);
                    return;
                }

                const existing = location.statMap[stat.id];
                const fallback = Number.isFinite(stat.default) ? Number(stat.default) : 0;
                const value = Number.isFinite(existing) ? Number(existing) : fallback;
                location.statMap[stat.id] = clampStatValue(value, stat);
            });

            Object.keys(location.statMap).forEach(statId => {
                if (!locationStatIds.has(statId)) {
                    delete location.statMap[statId];
                }
            });
        });

        const itemStatIds = new Set(itemStats.map(stat => stat.id));

        (currentSave.inventory || []).forEach(item => {
            if (!item.statMap || typeof item.statMap !== 'object') {
                item.statMap = {};
            }

            itemStats.filter(stat => isNumericDisplayType(stat.type) || isReferenceDisplayType(stat.type) || isReferenceListDisplayType(stat.type)).forEach(stat => {
                if (!stat.id || !stat.name.trim()) {
                    return;
                }

                item.statMap[stat.id] = normalizeStatValue(item.statMap[stat.id], stat);
            });

            Object.keys(item.statMap).forEach(statId => {
                if (!itemStatIds.has(statId)) {
                    delete item.statMap[statId];
                }
            });
        });
    }, [actorStats, globalStats, itemStats, locationStats, stageInstance, statUpdateRules, universalSchedule, validGlobalStatValues]);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = window.setTimeout(() => {
            saveGameConfiguration();
        }, 300);

        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
        };
    }, [saveGameConfiguration]);

    useEffect(() => {
        return () => {
            if (autoSaveTimeoutRef.current) {
                saveGameConfiguration();
            }
        };
    }, [saveGameConfiguration]);

    const updateGlobalStat = (index: number, patch: Partial<Stat>) => {
        setGlobalStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const setGlobalStatName = (index: number, rawName: string) => {
        const previousName = (globalStats[index]?.name || '').trim();

        updateGlobalStat(index, { name: rawName });

        const trimmedNextName = rawName.trim();
        if (!previousName || !trimmedNextName || previousName === trimmedNextName) {
            return;
        }

        setGlobalStatValues((prev) => {
            const nextValues = { ...prev };
            const existingValue = nextValues[previousName];
            delete nextValues[previousName];
            if (existingValue !== undefined) {
                nextValues[trimmedNextName] = existingValue;
            }
            return nextValues;
        });
    };

    const removeGlobalStat = (index: number) => {
        const removedName = (globalStats[index]?.name || '').trim();

        setGlobalStats(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedGlobalStats(prev => prev.filter((_, idx) => idx !== index));

        if (removedName) {
            setGlobalStatValues((prev) => {
                const nextValues = { ...prev };
                delete nextValues[removedName];
                return nextValues;
            });
        }
    };

    const toggleGlobalStat = (index: number) => {
        setCollapsedGlobalStats(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
    };

    const moveGlobalStat = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= globalStats.length) {
            return;
        }
        setGlobalStats(prev => swapArrayItems(prev, index, targetIndex));
        setCollapsedGlobalStats(prev => swapArrayItems(prev, index, targetIndex));
    };

    const updateActorStat = (index: number, patch: Partial<Stat>) => {
        setActorStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const removeActorStat = (index: number) => {
        setActorStats(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedActorStats(prev => prev.filter((_, idx) => idx !== index));
    };

    const toggleActorStat = (index: number) => {
        setCollapsedActorStats(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
    };

    const moveActorStat = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= actorStats.length) {
            return;
        }
        setActorStats(prev => swapArrayItems(prev, index, targetIndex));
        setCollapsedActorStats(prev => swapArrayItems(prev, index, targetIndex));
    };

    const updateLocationStat = (index: number, patch: Partial<Stat>) => {
        setLocationStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const removeLocationStat = (index: number) => {
        setLocationStats(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedLocationStats(prev => prev.filter((_, idx) => idx !== index));
    };

    const toggleLocationStat = (index: number) => {
        setCollapsedLocationStats(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
    };

    const moveLocationStat = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= locationStats.length) {
            return;
        }
        setLocationStats(prev => swapArrayItems(prev, index, targetIndex));
        setCollapsedLocationStats(prev => swapArrayItems(prev, index, targetIndex));
    };

    const updateItemStat = (index: number, patch: Partial<Stat>) => {
        setItemStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const removeItemStat = (index: number) => {
        setItemStats(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedItemStats(prev => prev.filter((_, idx) => idx !== index));
    };

    const toggleItemStat = (index: number) => {
        setCollapsedItemStats(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
    };

    const moveItemStat = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= itemStats.length) {
            return;
        }
        setItemStats(prev => swapArrayItems(prev, index, targetIndex));
        setCollapsedItemStats(prev => swapArrayItems(prev, index, targetIndex));
    };

    const conditionActors = Object.values(save.actors || {});

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>Global Stats</Title>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setGlobalStats(prev => [...prev, defaultGlobalStat()]);
                            setCollapsedGlobalStats(prev => [...prev, false]);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Add fontSize="small" /> Add
                    </Button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {globalStats.map((stat, statIndex) => (
                        <StatEntryEditor
                            key={`player-stat-${statIndex}`}
                            stat={stat}
                            index={statIndex}
                            total={globalStats.length}
                            typeLabel="Global Stat"
                            category="global"
                            collapsed={collapsedGlobalStats[statIndex]}
                            onToggleCollapse={() => toggleGlobalStat(statIndex)}
                            onMove={(direction) => moveGlobalStat(statIndex, direction)}
                            onRemove={() => removeGlobalStat(statIndex)}
                            onPatch={(patch) => updateGlobalStat(statIndex, patch)}
                            onNameChange={(name) => setGlobalStatName(statIndex, name)}
                            selfStats={globalStats}
                            globalStats={globalStats}
                            actorStats={actorStats}
                            conditionActors={conditionActors}
                            valueActors={actorOptions}
                            items={itemOptions}
                            locations={locationOptions}
                            stage={stage}
                            fieldLabelStyle={fieldLabelStyle}
                            inlineFieldStyle={inlineFieldStyle}
                            inlineFieldTopStyle={inlineFieldTopStyle}
                            compactChipLabelStyle={compactChipLabelStyle}
                        />
                    ))}
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>Actor Stats</Title>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setActorStats(prev => [...prev, defaultTypedStat()]);
                            setCollapsedActorStats(prev => [...prev, false]);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Add fontSize="small" /> Add
                    </Button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {actorStats.map((stat, statIndex) => (
                        <StatEntryEditor
                            key={`actor-stat-${statIndex}`}
                            stat={stat}
                            index={statIndex}
                            total={actorStats.length}
                            typeLabel="Actor Stat"
                            category="actor"
                            collapsed={collapsedActorStats[statIndex]}
                            onToggleCollapse={() => toggleActorStat(statIndex)}
                            onMove={(direction) => moveActorStat(statIndex, direction)}
                            onRemove={() => removeActorStat(statIndex)}
                            onPatch={(patch) => updateActorStat(statIndex, patch)}
                            selfStats={actorStats}
                            globalStats={globalStats}
                            actorStats={actorStats}
                            conditionActors={conditionActors}
                            valueActors={actorOptions}
                            items={itemOptions}
                            locations={locationOptions}
                            stage={stage}
                            fieldLabelStyle={fieldLabelStyle}
                            inlineFieldStyle={inlineFieldStyle}
                            inlineFieldTopStyle={inlineFieldTopStyle}
                            compactChipLabelStyle={compactChipLabelStyle}
                        />
                    ))}
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>Location Stats</Title>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setLocationStats(prev => [...prev, defaultTypedStat()]);
                            setCollapsedLocationStats(prev => [...prev, false]);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Add fontSize="small" /> Add
                    </Button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {locationStats.map((stat, statIndex) => (
                        <StatEntryEditor
                            key={`location-stat-${statIndex}`}
                            stat={stat}
                            index={statIndex}
                            total={locationStats.length}
                            typeLabel="Location Stat"
                            category="location"
                            collapsed={collapsedLocationStats[statIndex]}
                            onToggleCollapse={() => toggleLocationStat(statIndex)}
                            onMove={(direction) => moveLocationStat(statIndex, direction)}
                            onRemove={() => removeLocationStat(statIndex)}
                            onPatch={(patch) => updateLocationStat(statIndex, patch)}
                            selfStats={locationStats}
                            globalStats={globalStats}
                            actorStats={actorStats}
                            conditionActors={conditionActors}
                            valueActors={actorOptions}
                            items={itemOptions}
                            locations={locationOptions}
                            stage={stage}
                            fieldLabelStyle={fieldLabelStyle}
                            inlineFieldStyle={inlineFieldStyle}
                            inlineFieldTopStyle={inlineFieldTopStyle}
                            compactChipLabelStyle={compactChipLabelStyle}
                        />
                    ))}
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>Item Stats</Title>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setItemStats(prev => [...prev, defaultTypedStat()]);
                            setCollapsedItemStats(prev => [...prev, false]);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Add fontSize="small" /> Add
                    </Button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {itemStats.map((stat, statIndex) => (
                        <StatEntryEditor
                            key={`item-stat-${statIndex}`}
                            stat={stat}
                            index={statIndex}
                            total={itemStats.length}
                            typeLabel="Item Stat"
                            category="item"
                            collapsed={collapsedItemStats[statIndex]}
                            onToggleCollapse={() => toggleItemStat(statIndex)}
                            onMove={(direction) => moveItemStat(statIndex, direction)}
                            onRemove={() => removeItemStat(statIndex)}
                            onPatch={(patch) => updateItemStat(statIndex, patch)}
                            selfStats={itemStats}
                            globalStats={globalStats}
                            actorStats={actorStats}
                            conditionActors={conditionActors}
                            valueActors={actorOptions}
                            items={itemOptions}
                            locations={locationOptions}
                            stage={stage}
                            scriptLabel="Default Script"
                            fieldLabelStyle={fieldLabelStyle}
                            inlineFieldStyle={inlineFieldStyle}
                            inlineFieldTopStyle={inlineFieldTopStyle}
                            compactChipLabelStyle={compactChipLabelStyle}
                        />
                    ))}
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Universal Schedule</Title>

                <span style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: '11px', marginBottom: 10 }}>
                    Applies to every actor and is evaluated after that actor's own schedule. The first destination to match wins, but any matching "Unavailable" entry supersedes a matched location.
                </span>
                <ActorScheduleEditor
                    schedule={universalSchedule}
                    locations={locationOptions}
                    globalStats={globalStats}
                    actorStats={actorStats}
                    actors={Object.values(save.actors || {})}
                    emptyLabel="No universal schedule entries. Every actor falls back to their own schedule."
                    onChange={setUniversalSchedule}
                />
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Stat Update Events</Title>
                <span style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: '11px', marginBottom: 10 }}>
                    Recurring stat changes applied at the start of every in-game time period whose conditions match. Numeric stats accept dice or relative notation (e.g. "1d6+1" or "-2").
                </span>
                <StatUpdateRuleEditor
                    rules={statUpdateRules}
                    globalStats={globalStats}
                    actorStats={actorStats}
                    locationStats={locationStats}
                    itemStats={itemStats}
                    actors={Object.values(save.actors || {})}
                    items={itemOptions}
                    locations={locationOptions}
                    stage={stage}
                    onChange={setStatUpdateRules}
                />
            </GlassPanel>
        </div>
    );
};

export default StatManagementPanel;
