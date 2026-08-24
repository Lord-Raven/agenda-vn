import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { ActorSchedule, cloneActorSchedule } from '../content/Actor';
import { Stat, StatDisplayType, StatType, StatValue, StatValueRule, StatUpdateRule, cloneStatValueRules, cloneStatUpdateRules, findStatOptionByValue, getStatOptionValue, isNumericDisplayType, normalizeLocationListValue, cloneStat } from '../content/Stat';
import { Button, GlassPanel, LocationMultiSelect, LocationSelect, TextArea, TextInput, Title } from '../components/UiComponents';
import { IconPicker } from '../components/StatRating';
import { ActorScheduleEditor } from '../components/ActorScheduleEditor';
import { ConditionEditor } from '../components/ConditionEditor';
import { StatUpdateRuleEditor } from '../components/StatUpdateRuleEditor';
import { StatValueInput } from '../components/StatValueInput';
import { Add, KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';

interface StatManagementPanelProps {
    stage: () => Stage;
}

const resolveStatDefaultValue = (stat: Stat): StatValue => {
    if (stat.type === 'option') {
        const defaultOption = findStatOptionByValue(stat, stat.default);
        return defaultOption?.value || (stat.options?.[0] ? getStatOptionValue(stat.options[0], 0) : '');
    }

    if (stat.type === 'locationList') {
        return normalizeLocationListValue(stat.default);
    }

    if (stat.type === 'text' || stat.type === 'location') {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

const normalizeStatValue = (value: unknown, stat: Stat): StatValue => {
    if (stat.type === 'option') {
        const selectedOption = findStatOptionByValue(stat, value);
        if (selectedOption) {
            return selectedOption.value;
        }
        return resolveStatDefaultValue(stat);
    }

    if (stat.type === 'locationList') {
        return Array.isArray(value) ? normalizeLocationListValue(value) : resolveStatDefaultValue(stat);
    }

    if (stat.type === 'text' || stat.type === 'location') {
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
    exposed: true,
    llmSees: true,
    llmMaintained: true,
    iconName: 'star',
});

const defaultActorStat = (): Stat => ({
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
    exposed: false,
    llmSees: true,
    llmMaintained: true,
    iconName: 'star',
});

const defaultLocationStat = (): Stat => ({
    id: generateUuid(),
    name: 'Name',
    description: 'A user-facing description of this stat.',
    guidance: 'Guidance for the LLM on how this stat is applied or what a high or low score is or represents.',
    default: 50,
    type: 'number',
    displayType: 'percentage',
    min: 0,
    max: 100,
    options: [],
    setByPlayer: false,
    exposed: false,
    llmSees: true,
    llmMaintained: true,
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

const normalizeGlobalStatShape = (stat: Stat): Stat => {
    if (stat.type === 'option') {
        const options = (stat.options || [])
            .filter(option => option.name.trim())
            .map((option, optionIndex) => ({ ...option, id: getStatOptionValue(option, optionIndex) }));
        const defaultValue = findStatOptionByValue({ ...stat, options }, stat.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');
        return {
            ...stat,
            options,
            default: defaultValue,
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    if (stat.type === 'locationList') {
        return {
            ...stat,
            default: normalizeLocationListValue(stat.default),
            options: [],
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    if (stat.type === 'text' || stat.type === 'location') {
        return {
            ...stat,
            default: typeof stat.default === 'string' ? stat.default : '',
            options: [],
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    return {
        ...stat,
        default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
        options: [],
        displayType: stat.type === 'number' ? (stat.displayType || 'straight') : undefined,
        iconName: stat.iconName || 'star',
    };
};

const normalizeActorStatShape = (stat: Stat): Stat => {
    if (stat.type === 'option') {
        const options = (stat.options || [])
            .filter(option => option.name.trim())
            .map((option, optionIndex) => ({ ...option, id: getStatOptionValue(option, optionIndex) }));
        const defaultValue = findStatOptionByValue({ ...stat, options }, stat.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');
        return {
            ...stat,
            options,
            default: defaultValue,
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    if (stat.type === 'locationList') {
        return {
            ...stat,
            default: normalizeLocationListValue(stat.default),
            options: [],
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    if (stat.type === 'text' || stat.type === 'location') {
        return {
            ...stat,
            default: typeof stat.default === 'string' ? stat.default : '',
            options: [],
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    return {
        ...stat,
        default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
        options: [],
        displayType: stat.type === 'number' ? (stat.displayType || 'straight') : undefined,
        iconName: stat.iconName || 'star',
    };
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

            actorStats.filter(stat => (isNumericDisplayType(stat.type) || stat.type === 'location' || stat.type === 'locationList') && !stat.perActor).forEach(stat => {
                if (!stat.id || !stat.name.trim()) {
                    return;
                }

                if (stat.type === 'location') {
                    const existing = actor.statMap[stat.id];
                    actor.statMap[stat.id] = typeof existing === 'string' ? existing : (typeof stat.default === 'string' ? stat.default : '');
                    return;
                }

                if (stat.type === 'locationList') {
                    const existing = actor.statMap[stat.id];
                    actor.statMap[stat.id] = Array.isArray(existing) ? normalizeLocationListValue(existing) : normalizeLocationListValue(stat.default);
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

            locationStats.filter(stat => isNumericDisplayType(stat.type) || stat.type === 'location' || stat.type === 'locationList').forEach(stat => {
                if (!stat.id || !stat.name.trim()) {
                    return;
                }

                if (stat.type === 'location') {
                    const existing = location.statMap[stat.id];
                    location.statMap[stat.id] = typeof existing === 'string' ? existing : (typeof stat.default === 'string' ? stat.default : '');
                    return;
                }

                if (stat.type === 'locationList') {
                    const existing = location.statMap[stat.id];
                    location.statMap[stat.id] = Array.isArray(existing) ? normalizeLocationListValue(existing) : normalizeLocationListValue(stat.default);
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
    }, [actorStats, globalStats, locationStats, stageInstance, statUpdateRules, universalSchedule, validGlobalStatValues]);

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

    const updateGlobalStatOption = (statIndex: number, optionIndex: number, patch: { name?: string; description?: string }) => {
        setGlobalStats(prev => prev.map((stat, idx) => {
            if (idx !== statIndex) {
                return stat;
            }

            const currentOptions = [...(stat.options || [])];
            const currentOption = currentOptions[optionIndex] || { id: generateUuid(), name: '', description: '' };
            const nextOption = { ...currentOption, id: getStatOptionValue(currentOption, optionIndex), ...patch };
            currentOptions[optionIndex] = nextOption;
            return { ...stat, options: currentOptions };
        }));
    };

    const removeGlobalStatOption = (statIndex: number, optionIndex: number) => {
        setGlobalStats(prev => prev.map((stat, idx) => {
            if (idx !== statIndex) {
                return stat;
            }

            const options = (stat.options || []).filter((_, idx2) => idx2 !== optionIndex);
            const defaultValue = findStatOptionByValue({ ...stat, options }, stat.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');

            return {
                ...stat,
                options,
                default: defaultValue,
            };
        }));
    };

    const addGlobalStatOption = (statIndex: number) => {
        setGlobalStats(prev => prev.map((stat, idx) => {
            if (idx !== statIndex) {
                return stat;
            }

            const options = [...(stat.options || [])];
            const nextLabel = `Option ${options.length + 1}`;
            options.push({
                id: generateUuid(),
                name: nextLabel,
                description: '',
            });

            return {
                ...stat,
                options,
                default: typeof stat.default === 'string' && stat.default.trim() ? stat.default : getStatOptionValue(options[options.length - 1], options.length - 1),
            };
        }));
    };

    const updateActorStat = (index: number, patch: Partial<Stat>) => {
        setActorStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const addGlobalStatDefaultRule = (index: number) => {
        setGlobalStats(prev => prev.map((stat, idx) => {
            if (idx !== index) {
                return stat;
            }
            const rule: StatValueRule = { id: generateUuid(), value: resolveStatDefaultValue(stat), conditions: [] };
            return { ...stat, defaultValueRules: [...(stat.defaultValueRules || []), rule] };
        }));
    };

    const removeGlobalStatDefaultRule = (index: number, ruleId: string) => {
        setGlobalStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, defaultValueRules: (stat.defaultValueRules || []).filter(rule => rule.id !== ruleId) } : stat
        )));
    };

    const updateGlobalStatDefaultRule = (index: number, ruleId: string, patch: Partial<StatValueRule>) => {
        setGlobalStats(prev => prev.map((stat, idx) => (
            idx === index
                ? { ...stat, defaultValueRules: (stat.defaultValueRules || []).map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule) }
                : stat
        )));
    };

    const addActorStatPerActorRule = (index: number) => {
        setActorStats(prev => prev.map((stat, idx) => {
            if (idx !== index) {
                return stat;
            }
            const rule: StatValueRule = { id: generateUuid(), value: resolveStatDefaultValue(stat), conditions: [] };
            return { ...stat, perActorDefaultRules: [...(stat.perActorDefaultRules || []), rule] };
        }));
    };

    const removeActorStatPerActorRule = (index: number, ruleId: string) => {
        setActorStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, perActorDefaultRules: (stat.perActorDefaultRules || []).filter(rule => rule.id !== ruleId) } : stat
        )));
    };

    const updateActorStatPerActorRule = (index: number, ruleId: string, patch: Partial<StatValueRule>) => {
        setActorStats(prev => prev.map((stat, idx) => (
            idx === index
                ? { ...stat, perActorDefaultRules: (stat.perActorDefaultRules || []).map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule) }
                : stat
        )));
    }; 

    const renderIconPicker = (value: string | undefined, onChange: (iconName: string | undefined) => void, allowClear = false) => (
        <IconPicker value={value} onChange={onChange} allowClear={allowClear} />
    );

    const renderRuleValueInput = (stat: Stat, rule: StatValueRule, onChange: (value: StatValue) => void) => (
        <StatValueInput stat={stat} value={rule.value} onChange={onChange} locations={locationOptions} stage={stage} />
    );

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Global Stats</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {globalStats.map((stat, statIndex) => {
                        const normalizedStat = normalizeGlobalStatShape(stat);
                        const optionEntries = normalizedStat.options || [];

                        return (
                            <div key={`player-stat-${statIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>
                                        {stat.name?.trim() || `Global Stat ${statIndex + 1}`}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <Button variant="secondary" disabled={statIndex === 0} onClick={() => moveGlobalStat(statIndex, -1)} style={{ padding: '4px 8px', minWidth: 0 }}>
                                            <KeyboardArrowUp fontSize="small" />
                                        </Button>
                                        <Button variant="secondary" disabled={statIndex === globalStats.length - 1} onClick={() => moveGlobalStat(statIndex, 1)} style={{ padding: '4px 8px', minWidth: 0 }}>
                                            <KeyboardArrowDown fontSize="small" />
                                        </Button>
                                        <Button variant="secondary" onClick={() => toggleGlobalStat(statIndex)}>
                                            {collapsedGlobalStats[statIndex] ? 'Expand' : 'Collapse'}
                                        </Button>
                                    </div>
                                </div>

                                {!collapsedGlobalStats[statIndex] && (
                                    <>
                                        <div style={{ marginTop: 10 }}>
                                            <div style={inlineFieldStyle}>
                                                <label style={fieldLabelStyle}>Name</label>
                                                <TextInput
                                                    fullWidth
                                                    value={stat.name}
                                                    onChange={(e) => setGlobalStatName(statIndex, e.target.value)}
                                                    placeholder="Setting name"
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Visible In UI</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.exposed === true}
                                                        onChange={(e) => updateGlobalStat(statIndex, { exposed: e.target.checked })}
                                                    />
                                                    Exposed
                                                </label>
                                            </div>
                                            
                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Editable In Settings</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.setByPlayer === true}
                                                        onChange={(e) => updateGlobalStat(statIndex, { setByPlayer: e.target.checked })}
                                                    />
                                                    Set by Player
                                                </label>
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Send to LLM</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.llmSees !== false}
                                                        onChange={(e) => updateGlobalStat(statIndex, { llmSees: e.target.checked, llmMaintained: e.target.checked ? stat.llmMaintained : false })}
                                                    />
                                                    Included in LLM context
                                                </label>
                                            </div>

                                            {stat.llmSees !== false && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Generatively Maintained</label>
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={stat.llmMaintained !== false}
                                                            onChange={(e) => updateGlobalStat(statIndex, { llmMaintained: e.target.checked })}
                                                        />
                                                        LLM may update this stat via outcomes
                                                    </label>
                                                </div>
                                            )}

                                            {(stat.exposed === true || stat.setByPlayer === true) && (
                                                <div style={inlineFieldTopStyle}>
                                                    <label style={fieldLabelStyle}>Description</label>
                                                    <TextArea
                                                        value={stat.description}
                                                        onChange={(e) => updateGlobalStat(statIndex, { description: e.target.value })}
                                                        rows={2}
                                                        style={{ width: '100%', resize: 'vertical' }}
                                                    />
                                                </div>
                                            )}

                                            <div style={inlineFieldTopStyle}>
                                                <label style={fieldLabelStyle}>Guidance</label>
                                                <TextArea
                                                    value={stat.guidance}
                                                    onChange={(e) => updateGlobalStat(statIndex, { guidance: e.target.value })}
                                                    rows={2}
                                                    style={{ width: '100%', resize: 'vertical' }}
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Type</label>
                                                <select
                                                    className="input-base"
                                                    value={stat.type}
                                                    onChange={(e) => {
                                                        const nextType = e.target.value as Stat['type'];
                                                        updateGlobalStat(statIndex, normalizeGlobalStatShape({
                                                            ...stat,
                                                            type: nextType,
                                                        }));
                                                    }}
                                                >
                                                    <option value="checkbox">Checkbox</option>
                                                    <option value="location">Location</option>
                                                    <option value="locationList">Location List</option>
                                                    <option value="number">Number</option>
                                                    <option value="option">Option</option>
                                                    <option value="text">Text</option>
                                                </select>
                                            </div>

                                            {normalizedStat.type === 'number' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Display</label>
                                                    <select
                                                        className="input-base"
                                                        value={normalizedStat.displayType || 'straight'}
                                                        onChange={(e) => {
                                                            const nextDisplayType = e.target.value as StatDisplayType;
                                                            updateGlobalStat(statIndex, {
                                                                displayType: nextDisplayType,
                                                                iconName: nextDisplayType === 'rating' ? (stat.iconName || 'star') : stat.iconName,
                                                            });
                                                        }}
                                                    >
                                                        <option value="straight">Straight Number</option>
                                                        <option value="percentage">Percentage</option>
                                                        <option value="bar">Bar</option>
                                                        <option value="rating">Rating</option>
                                                        <option value="letter grade">Letter Grade</option>
                                                    </select>
                                                </div>
                                            )}

                                            {normalizedStat.type === 'option' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 10 }}>
                                                    <div style={{ ...inlineFieldStyle, marginBottom: 4 }}>
                                                        <label style={fieldLabelStyle}>Default Option</label>
                                                        <select
                                                            className="input-base"
                                                            value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                            onChange={(e) => updateGlobalStat(statIndex, { default: e.target.value })}
                                                        >
                                                            {optionEntries.map((option, idx) => (
                                                                <option key={getStatOptionValue(option, idx)} value={getStatOptionValue(option, idx)}>
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {optionEntries.map((option, optionIndex) => (
                                                        <div key={`${statIndex}-option-${optionIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 8 }}>
                                                            <div style={inlineFieldStyle}>
                                                                <label style={fieldLabelStyle}>Option Name</label>
                                                                <TextInput
                                                                    fullWidth
                                                                    value={option.name}
                                                                    onChange={(e) => updateGlobalStatOption(statIndex, optionIndex, { name: e.target.value })}
                                                                    placeholder="Option name"
                                                                />
                                                            </div>
                                                            {(stat.exposed === true || stat.setByPlayer === true) && (
                                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                                    <label style={fieldLabelStyle}>Option Description</label>
                                                                    <TextArea
                                                                        value={option.description}
                                                                        onChange={(e) => updateGlobalStatOption(statIndex, optionIndex, { description: e.target.value })}
                                                                        rows={2}
                                                                        style={{ width: '100%', resize: 'vertical' }}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div style={{ marginTop: 8 }}>
                                                                <Button variant="danger" onClick={() => removeGlobalStatOption(statIndex, optionIndex)}>
                                                                    Remove Option
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    <Button variant="secondary" onClick={() => addGlobalStatOption(statIndex)}>
                                                        Add Option
                                                    </Button>
                                                </div>
                                            )}

                                            {normalizedStat.type === 'text' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Value</label>
                                                    <TextArea
                                                        value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                        onChange={(e) => updateGlobalStat(statIndex, { default: e.target.value })}
                                                        rows={2}
                                                        style={{ width: '100%', resize: 'vertical' }}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'location' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Location</label>
                                                    <LocationSelect
                                                        value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                        onChange={(locationId) => updateGlobalStat(statIndex, { default: locationId })}
                                                        locations={locationOptions}
                                                        stage={stage}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'locationList' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Locations</label>
                                                    <LocationMultiSelect
                                                        values={Array.isArray(normalizedStat.default) ? normalizedStat.default : []}
                                                        onChange={(locationIds) => updateGlobalStat(statIndex, { default: locationIds })}
                                                        locations={locationOptions}
                                                        stage={stage}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'number' && normalizedStat.displayType === 'rating' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Rating Icon</label>
                                                    {renderIconPicker(normalizedStat.iconName, (iconName) => updateGlobalStat(statIndex, { iconName }))}
                                                </div>
                                            )}

                                            {isNumericDisplayType(normalizedStat.type) && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                    <label style={fieldLabelStyle}>Properties</label>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Default</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={String(Number.isFinite(normalizedStat.default) ? Number(normalizedStat.default) : 0)}
                                                                onChange={(e) => updateGlobalStat(statIndex, { default: Number(e.target.value) || 0 })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Min</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={typeof normalizedStat.min === 'number' ? String(normalizedStat.min) : ''}
                                                                onChange={(e) => updateGlobalStat(statIndex, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Max</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={typeof normalizedStat.max === 'number' ? String(normalizedStat.max) : ''}
                                                                onChange={(e) => updateGlobalStat(statIndex, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 10 }}>
                                            <label style={fieldLabelStyle}>Default Value Rules</label>
                                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                                Evaluated in order when a new game starts. The first matching rule wins and seeds this stat's starting value; falls back to the Default above if none match.
                                            </span>
                                            {(stat.defaultValueRules || []).length === 0 && (
                                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                                    No rules. The Default value above is used to start every new game.
                                                </span>
                                            )}
                                            {(stat.defaultValueRules || []).map((rule) => (
                                                <div
                                                    key={rule.id}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '6px',
                                                        padding: '8px',
                                                        border: '1px solid var(--agenda-line-subtle)',
                                                        borderRadius: 6,
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ color: 'var(--agenda-text-primary)', fontSize: '12px' }}>Value</span>
                                                        {renderRuleValueInput(stat, rule, (value) => updateGlobalStatDefaultRule(statIndex, rule.id, { value }))}
                                                        <Button
                                                            variant="danger"
                                                            onClick={() => removeGlobalStatDefaultRule(statIndex, rule.id)}
                                                            style={{ marginLeft: 'auto' }}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                    <ConditionEditor
                                                        conditionCollections={rule.conditions}
                                                        globalStats={[...globalStats, ...actorStats]}
                                                        actorStats={actorStats}
                                                        actors={Object.values(stageInstance.getSave().actors || {})}
                                                        locations={locationOptions}
                                                        onChange={(conditions) => updateGlobalStatDefaultRule(statIndex, rule.id, { conditions })}
                                                    />
                                                    {rule.conditions.length === 0 && (
                                                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                                            Always matches (should typically be the last rule).
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                            <Button
                                                variant="secondary"
                                                onClick={() => addGlobalStatDefaultRule(statIndex)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifySelf: 'start' }}
                                            >
                                                <Add fontSize="small" /> Add rule
                                            </Button>
                                        </div>

                                        <div style={{ marginTop: 10 }}>
                                            <Button variant="danger" onClick={() => removeGlobalStat(statIndex)}>Remove Global Stat</Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    <Button
                        variant="secondary"
                        onClick={() => {
                            setGlobalStats(prev => [...prev, defaultGlobalStat()]);
                            setCollapsedGlobalStats(prev => [...prev, false]);
                        }}
                    >
                        Add Global Stat
                    </Button>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Actor Stats</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {actorStats.map((stat, statIndex) => {
                        const normalizedStat = normalizeActorStatShape(stat);
                        const optionEntries = normalizedStat.options || [];

                        return (
                            <div key={`actor-stat-${statIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>
                                        {stat.name?.trim() || `Actor Stat ${statIndex + 1}`}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <Button variant="secondary" disabled={statIndex === 0} onClick={() => moveActorStat(statIndex, -1)} style={{ padding: '4px 8px', minWidth: 0 }}>
                                            <KeyboardArrowUp fontSize="small" />
                                        </Button>
                                        <Button variant="secondary" disabled={statIndex === actorStats.length - 1} onClick={() => moveActorStat(statIndex, 1)} style={{ padding: '4px 8px', minWidth: 0 }}>
                                            <KeyboardArrowDown fontSize="small" />
                                        </Button>
                                        <Button variant="secondary" onClick={() => toggleActorStat(statIndex)}>
                                            {collapsedActorStats[statIndex] ? 'Expand' : 'Collapse'}
                                        </Button>
                                    </div>
                                </div>

                                {!collapsedActorStats[statIndex] && (
                                    <>
                                        <div style={{ marginTop: 10 }}>
                                            <div style={inlineFieldStyle}>
                                                <label style={fieldLabelStyle}>Name</label>
                                                <TextInput
                                                    fullWidth
                                                    value={stat.name}
                                                    onChange={(e) => updateActorStat(statIndex, { name: e.target.value })}
                                                    placeholder="Stat name"
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Visible In UI</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.exposed === true}
                                                        onChange={(e) => updateActorStat(statIndex, { exposed: e.target.checked })}
                                                    />
                                                    Exposed
                                                </label>
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Per Actor</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.perActor === true}
                                                        onChange={(e) => updateActorStat(statIndex, { perActor: e.target.checked })}
                                                    />
                                                    Maps other actors to distinct values
                                                </label>
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Send to LLM</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.llmSees !== false}
                                                        onChange={(e) => updateActorStat(statIndex, { llmSees: e.target.checked, llmMaintained: e.target.checked ? stat.llmMaintained : false })}
                                                    />
                                                    Included in LLM context
                                                </label>
                                            </div>

                                            {stat.llmSees !== false && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Generatively Maintained</label>
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={stat.llmMaintained !== false}
                                                            onChange={(e) => updateActorStat(statIndex, { llmMaintained: e.target.checked })}
                                                        />
                                                        LLM may update this stat via outcomes
                                                    </label>
                                                </div>
                                            )}

                                            {stat.exposed === true && (
                                                <div style={inlineFieldTopStyle}>
                                                    <label style={fieldLabelStyle}>Description</label>
                                                    <TextArea
                                                        value={stat.description}
                                                        onChange={(e) => updateActorStat(statIndex, { description: e.target.value })}
                                                        rows={2}
                                                        placeholder="Describe what this stat represents."
                                                        style={{ width: '100%', resize: 'vertical' }}
                                                    />
                                                </div>
                                            )}

                                            <div style={inlineFieldTopStyle}>
                                                <label style={fieldLabelStyle}>Guidance</label>
                                                <TextArea
                                                    value={stat.guidance}
                                                    onChange={(e) => updateActorStat(statIndex, { guidance: e.target.value })}
                                                    rows={2}
                                                    placeholder="Guidance for using this stat in generated narrative."
                                                    style={{ width: '100%', resize: 'vertical' }}
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Type</label>
                                                <select
                                                    className="input-base"
                                                    value={normalizedStat.type}
                                                    onChange={(e) => {
                                                        const nextType = e.target.value as Stat['type'];
                                                        updateActorStat(statIndex, normalizeActorStatShape({
                                                            ...stat,
                                                            type: nextType,
                                                        }));
                                                    }}
                                                >
                                                    <option value="checkbox">Checkbox</option>
                                                    <option value="location">Location</option>
                                                    <option value="locationList">Location List</option>
                                                    <option value="number">Number</option>
                                                    <option value="option">Option</option>
                                                    <option value="text">Text</option>
                                                </select>
                                            </div>

                                            {normalizedStat.type === 'number' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Display</label>
                                                    <select
                                                        className="input-base"
                                                        value={normalizedStat.displayType || 'straight'}
                                                        onChange={(e) => {
                                                            const nextDisplayType = e.target.value as StatDisplayType;
                                                            updateActorStat(statIndex, {
                                                                displayType: nextDisplayType,
                                                                iconName: nextDisplayType === 'rating' ? (stat.iconName || 'star') : stat.iconName,
                                                            });
                                                        }}
                                                    >
                                                        <option value="straight">Straight Number</option>
                                                        <option value="percentage">Percentage</option>
                                                        <option value="bar">Bar</option>
                                                        <option value="rating">Rating</option>
                                                        <option value="letter grade">Letter Grade</option>
                                                    </select>
                                                </div>
                                            )}

                                            {normalizedStat.type === 'option' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 10 }}>
                                                    <div style={{ ...inlineFieldStyle, marginBottom: 4 }}>
                                                        <label style={fieldLabelStyle}>Default Option</label>
                                                        <select
                                                            className="input-base"
                                                            value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                            onChange={(e) => updateActorStat(statIndex, { default: e.target.value })}
                                                        >
                                                            {optionEntries.map((option, idx) => (
                                                                <option key={getStatOptionValue(option, idx)} value={getStatOptionValue(option, idx)}>
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {optionEntries.map((option, optionIndex) => (
                                                        <div key={`${statIndex}-actor-option-${optionIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 8 }}>
                                                            <div style={inlineFieldStyle}>
                                                                <label style={fieldLabelStyle}>Option Name</label>
                                                                <TextInput
                                                                    fullWidth
                                                                    value={option.name}
                                                                    onChange={(e) => {
                                                                        setActorStats(prev => prev.map((item, idx) => {
                                                                            if (idx !== statIndex) {
                                                                                return item;
                                                                            }

                                                                            const currentOptions = [...(item.options || [])];
                                                                            const currentOption = currentOptions[optionIndex] || { id: generateUuid(), name: '', description: '' };
                                                                            const nextOption = { ...currentOption, id: getStatOptionValue(currentOption, optionIndex), name: e.target.value };
                                                                            currentOptions[optionIndex] = nextOption;
                                                                            return { ...item, options: currentOptions };
                                                                        }));
                                                                    }}
                                                                    placeholder="Option name"
                                                                />
                                                            </div>
                                                            {stat.exposed === true && (
                                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                                    <label style={fieldLabelStyle}>Option Description</label>
                                                                    <TextArea
                                                                        value={option.description}
                                                                        onChange={(e) => {
                                                                            setActorStats(prev => prev.map((item, idx) => {
                                                                                if (idx !== statIndex) {
                                                                                    return item;
                                                                                }

                                                                                const currentOptions = [...(item.options || [])];
                                                                                const currentOption = currentOptions[optionIndex] || { id: generateUuid(), name: '', description: '' };
                                                                                const nextOption = { ...currentOption, id: getStatOptionValue(currentOption, optionIndex), description: e.target.value };
                                                                                currentOptions[optionIndex] = nextOption;
                                                                                return { ...item, options: currentOptions };
                                                                            }));
                                                                        }}
                                                                        rows={2}
                                                                        style={{ width: '100%', resize: 'vertical' }}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div style={{ marginTop: 8 }}>
                                                                <Button variant="danger" onClick={() => {
                                                                    setActorStats(prev => prev.map((item, idx) => {
                                                                        if (idx !== statIndex) {
                                                                            return item;
                                                                        }

                                                                        const options = (item.options || []).filter((_, idx2) => idx2 !== optionIndex);
                                                                        const defaultValue = findStatOptionByValue({ ...item, options }, item.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');

                                                                        return {
                                                                            ...item,
                                                                            options,
                                                                            default: defaultValue,
                                                                        };
                                                                    }));
                                                                }}>
                                                                    Remove Option
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    <Button variant="secondary" onClick={() => {
                                                        setActorStats(prev => prev.map((item, idx) => {
                                                            if (idx !== statIndex) {
                                                                return item;
                                                            }

                                                            const options = [...(item.options || [])];
                                                            const nextLabel = `Option ${options.length + 1}`;
                                                            options.push({
                                                                id: generateUuid(),
                                                                name: nextLabel,
                                                                description: '',
                                                            });

                                                            return {
                                                                ...item,
                                                                options,
                                                                default: typeof item.default === 'string' && item.default.trim() ? item.default : getStatOptionValue(options[options.length - 1], options.length - 1),
                                                            };
                                                        }));
                                                    }}>
                                                        Add Option
                                                    </Button>
                                                </div>
                                            )}

                                            {normalizedStat.type === 'text' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Value</label>
                                                    <TextArea
                                                        value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                        onChange={(e) => updateActorStat(statIndex, { default: e.target.value })}
                                                        rows={2}
                                                        style={{ width: '100%', resize: 'vertical' }}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'location' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Location</label>
                                                    <LocationSelect
                                                        value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                        onChange={(locationId) => updateActorStat(statIndex, { default: locationId })}
                                                        locations={locationOptions}
                                                        stage={stage}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'locationList' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Locations</label>
                                                    <LocationMultiSelect
                                                        values={Array.isArray(normalizedStat.default) ? normalizedStat.default : []}
                                                        onChange={(locationIds) => updateActorStat(statIndex, { default: locationIds })}
                                                        locations={locationOptions}
                                                        stage={stage}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'number' && normalizedStat.displayType === 'rating' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Rating Icon</label>
                                                    {renderIconPicker(normalizedStat.iconName, (iconName) => updateActorStat(statIndex, { iconName }))}
                                                </div>
                                            )}

                                            <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Label Icon</label>
                                                {renderIconPicker(stat.labelIconName, (iconName) => updateActorStat(statIndex, { labelIconName: iconName || undefined }), true)}
                                            </div>

                                            {isNumericDisplayType(normalizedStat.type) && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                    <label style={fieldLabelStyle}>Properties</label>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Default</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={String(Number.isFinite(normalizedStat.default) ? Number(normalizedStat.default) : 0)}
                                                                onChange={(e) => updateActorStat(statIndex, { default: Number(e.target.value) || 0 })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Min</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={typeof normalizedStat.min === 'number' ? String(normalizedStat.min) : ''}
                                                                onChange={(e) => updateActorStat(statIndex, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Max</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={typeof normalizedStat.max === 'number' ? String(normalizedStat.max) : ''}
                                                                onChange={(e) => updateActorStat(statIndex, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {stat.perActor && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Value Rules</label>
                                                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                                        Evaluated in order for the target actor being considered (use "Variable" actor targets to inspect the target's own stats). The first matching rule wins; falls back to Default above if none match. An actor's own rules (configured on its detail page) take precedence over these.
                                                    </span>
                                                    {(stat.perActorDefaultRules || []).length === 0 && (
                                                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                                            No rules. The Default value below is used for every target.
                                                        </span>
                                                    )}
                                                    {(stat.perActorDefaultRules || []).map((rule) => (
                                                        <div
                                                            key={rule.id}
                                                            style={{
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '6px',
                                                                padding: '8px',
                                                                border: '1px solid var(--agenda-line-subtle)',
                                                                borderRadius: 6,
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ color: 'var(--agenda-text-primary)', fontSize: '12px' }}>Value</span>
                                                                {renderRuleValueInput(stat, rule, (value) => updateActorStatPerActorRule(statIndex, rule.id, { value }))}
                                                                <Button
                                                                    variant="danger"
                                                                    onClick={() => removeActorStatPerActorRule(statIndex, rule.id)}
                                                                    style={{ marginLeft: 'auto' }}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                            <ConditionEditor
                                                                conditionCollections={rule.conditions}
                                                                globalStats={[...actorStats, ...globalStats]}
                                                                actorStats={actorStats}
                                                                actors={Object.values(stageInstance.getSave().actors || {})}
                                                                locations={locationOptions}
                                                                allowVariableActorTarget
                                                                onChange={(conditions) => updateActorStatPerActorRule(statIndex, rule.id, { conditions })}
                                                            />
                                                            {rule.conditions.length === 0 && (
                                                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                                                    Always matches (should typically be the last rule).
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <Button
                                                        variant="secondary"
                                                        onClick={() => addActorStatPerActorRule(statIndex)}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifySelf: 'start' }}
                                                    >
                                                        <Add fontSize="small" /> Add rule
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ marginTop: 10 }}>
                                            <Button variant="danger" onClick={() => removeActorStat(statIndex)}>Remove Actor Stat</Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    <Button
                        variant="secondary"
                        onClick={() => {
                            setActorStats(prev => [...prev, defaultActorStat()]);
                            setCollapsedActorStats(prev => [...prev, false]);
                        }}
                    >
                        Add Actor Stat
                    </Button>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Location Stats</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {locationStats.map((stat, statIndex) => {
                        const normalizedStat = normalizeActorStatShape(stat);
                        const optionEntries = normalizedStat.options || [];

                        return (
                            <div key={`location-stat-${statIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>
                                        {stat.name?.trim() || `Location Stat ${statIndex + 1}`}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <Button variant="secondary" disabled={statIndex === 0} onClick={() => moveLocationStat(statIndex, -1)} style={{ padding: '4px 8px', minWidth: 0 }}>
                                            <KeyboardArrowUp fontSize="small" />
                                        </Button>
                                        <Button variant="secondary" disabled={statIndex === locationStats.length - 1} onClick={() => moveLocationStat(statIndex, 1)} style={{ padding: '4px 8px', minWidth: 0 }}>
                                            <KeyboardArrowDown fontSize="small" />
                                        </Button>
                                        <Button variant="secondary" onClick={() => toggleLocationStat(statIndex)}>
                                            {collapsedLocationStats[statIndex] ? 'Expand' : 'Collapse'}
                                        </Button>
                                    </div>
                                </div>

                                {!collapsedLocationStats[statIndex] && (
                                    <>
                                        <div style={{ marginTop: 10 }}>
                                            <div style={inlineFieldStyle}>
                                                <label style={fieldLabelStyle}>Name</label>
                                                <TextInput
                                                    fullWidth
                                                    value={stat.name}
                                                    onChange={(e) => updateLocationStat(statIndex, { name: e.target.value })}
                                                    placeholder="Stat name"
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Visible In UI</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.exposed === true}
                                                        onChange={(e) => updateLocationStat(statIndex, { exposed: e.target.checked })}
                                                    />
                                                    Exposed
                                                </label>
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Send to LLM</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.llmSees !== false}
                                                        onChange={(e) => updateLocationStat(statIndex, { llmSees: e.target.checked, llmMaintained: e.target.checked ? stat.llmMaintained : false })}
                                                    />
                                                    Included in LLM context
                                                </label>
                                            </div>

                                            {stat.llmSees !== false && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Generatively Maintained</label>
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={stat.llmMaintained !== false}
                                                            onChange={(e) => updateLocationStat(statIndex, { llmMaintained: e.target.checked })}
                                                        />
                                                        LLM may update this stat via outcomes
                                                    </label>
                                                </div>
                                            )}

                                            {stat.exposed === true && (
                                                <div style={inlineFieldTopStyle}>
                                                    <label style={fieldLabelStyle}>Description</label>
                                                    <TextArea
                                                        value={stat.description}
                                                        onChange={(e) => updateLocationStat(statIndex, { description: e.target.value })}
                                                        rows={2}
                                                        placeholder="Describe what this stat represents."
                                                        style={{ width: '100%', resize: 'vertical' }}
                                                    />
                                                </div>
                                            )}

                                            <div style={inlineFieldTopStyle}>
                                                <label style={fieldLabelStyle}>Guidance</label>
                                                <TextArea
                                                    value={stat.guidance}
                                                    onChange={(e) => updateLocationStat(statIndex, { guidance: e.target.value })}
                                                    rows={2}
                                                    placeholder="Guidance for using this stat in generated narrative."
                                                    style={{ width: '100%', resize: 'vertical' }}
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Type</label>
                                                <select
                                                    className="input-base"
                                                    value={normalizedStat.type}
                                                    onChange={(e) => {
                                                        const nextType = e.target.value as Stat['type'];
                                                        updateLocationStat(statIndex, normalizeActorStatShape({
                                                            ...stat,
                                                            type: nextType,
                                                        }));
                                                    }}
                                                >
                                                    <option value="checkbox">Checkbox</option>
                                                    <option value="location">Location</option>
                                                    <option value="locationList">Location List</option>
                                                    <option value="number">Number</option>
                                                    <option value="option">Option</option>
                                                    <option value="text">Text</option>
                                                </select>
                                            </div>

                                            {normalizedStat.type === 'number' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Display</label>
                                                    <select
                                                        className="input-base"
                                                        value={normalizedStat.displayType || 'straight'}
                                                        onChange={(e) => {
                                                            const nextDisplayType = e.target.value as StatDisplayType;
                                                            updateLocationStat(statIndex, {
                                                                displayType: nextDisplayType,
                                                                iconName: nextDisplayType === 'rating' ? (stat.iconName || 'star') : stat.iconName,
                                                            });
                                                        }}
                                                    >
                                                        <option value="straight">Straight Number</option>
                                                        <option value="percentage">Percentage</option>
                                                        <option value="bar">Bar</option>
                                                        <option value="rating">Rating</option>
                                                        <option value="letter grade">Letter Grade</option>
                                                    </select>
                                                </div>
                                            )}

                                            {normalizedStat.type === 'option' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 10 }}>
                                                    <div style={{ ...inlineFieldStyle, marginBottom: 4 }}>
                                                        <label style={fieldLabelStyle}>Default Option</label>
                                                        <select
                                                            className="input-base"
                                                            value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                            onChange={(e) => updateLocationStat(statIndex, { default: e.target.value })}
                                                        >
                                                            {optionEntries.map((option, idx) => (
                                                                <option key={getStatOptionValue(option, idx)} value={getStatOptionValue(option, idx)}>
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {optionEntries.map((option, optionIndex) => (
                                                        <div key={`${statIndex}-location-option-${optionIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 8 }}>
                                                            <div style={inlineFieldStyle}>
                                                                <label style={fieldLabelStyle}>Option Name</label>
                                                                <TextInput
                                                                    fullWidth
                                                                    value={option.name}
                                                                    onChange={(e) => {
                                                                        setLocationStats(prev => prev.map((item, idx) => {
                                                                            if (idx !== statIndex) {
                                                                                return item;
                                                                            }

                                                                            const currentOptions = [...(item.options || [])];
                                                                            const currentOption = currentOptions[optionIndex] || { id: generateUuid(), name: '', description: '' };
                                                                            const nextOption = { ...currentOption, id: getStatOptionValue(currentOption, optionIndex), name: e.target.value };
                                                                            currentOptions[optionIndex] = nextOption;
                                                                            return { ...item, options: currentOptions };
                                                                        }));
                                                                    }}
                                                                    placeholder="Option name"
                                                                />
                                                            </div>
                                                            {stat.exposed === true && (
                                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                                    <label style={fieldLabelStyle}>Option Description</label>
                                                                    <TextArea
                                                                        value={option.description}
                                                                        onChange={(e) => {
                                                                            setLocationStats(prev => prev.map((item, idx) => {
                                                                                if (idx !== statIndex) {
                                                                                    return item;
                                                                                }

                                                                                const currentOptions = [...(item.options || [])];
                                                                                const currentOption = currentOptions[optionIndex] || { id: generateUuid(), name: '', description: '' };
                                                                                const nextOption = { ...currentOption, id: getStatOptionValue(currentOption, optionIndex), description: e.target.value };
                                                                                currentOptions[optionIndex] = nextOption;
                                                                                return { ...item, options: currentOptions };
                                                                            }));
                                                                        }}
                                                                        rows={2}
                                                                        style={{ width: '100%', resize: 'vertical' }}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div style={{ marginTop: 8 }}>
                                                                <Button variant="danger" onClick={() => {
                                                                    setLocationStats(prev => prev.map((item, idx) => {
                                                                        if (idx !== statIndex) {
                                                                            return item;
                                                                        }

                                                                        const options = (item.options || []).filter((_, idx2) => idx2 !== optionIndex);
                                                                        const defaultValue = findStatOptionByValue({ ...item, options }, item.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');

                                                                        return {
                                                                            ...item,
                                                                            options,
                                                                            default: defaultValue,
                                                                        };
                                                                    }));
                                                                }}>
                                                                    Remove Option
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    <Button variant="secondary" onClick={() => {
                                                        setLocationStats(prev => prev.map((item, idx) => {
                                                            if (idx !== statIndex) {
                                                                return item;
                                                            }

                                                            const options = [...(item.options || [])];
                                                            const nextLabel = `Option ${options.length + 1}`;
                                                            options.push({
                                                                id: generateUuid(),
                                                                name: nextLabel,
                                                                description: '',
                                                            });

                                                            return {
                                                                ...item,
                                                                options,
                                                                default: typeof item.default === 'string' && item.default.trim() ? item.default : getStatOptionValue(options[options.length - 1], options.length - 1),
                                                            };
                                                        }));
                                                    }}>
                                                        Add Option
                                                    </Button>
                                                </div>
                                            )}

                                            {normalizedStat.type === 'text' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Value</label>
                                                    <TextArea
                                                        value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                        onChange={(e) => updateLocationStat(statIndex, { default: e.target.value })}
                                                        rows={2}
                                                        style={{ width: '100%', resize: 'vertical' }}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'location' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Location</label>
                                                    <LocationSelect
                                                        value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                        onChange={(locationId) => updateLocationStat(statIndex, { default: locationId })}
                                                        locations={locationOptions}
                                                        stage={stage}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'locationList' && (
                                                <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Locations</label>
                                                    <LocationMultiSelect
                                                        values={Array.isArray(normalizedStat.default) ? normalizedStat.default : []}
                                                        onChange={(locationIds) => updateLocationStat(statIndex, { default: locationIds })}
                                                        locations={locationOptions}
                                                        stage={stage}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'number' && normalizedStat.displayType === 'rating' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Rating Icon</label>
                                                    {renderIconPicker(normalizedStat.iconName, (iconName) => updateLocationStat(statIndex, { iconName }))}
                                                </div>
                                            )}

                                            <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Label Icon</label>
                                                {renderIconPicker(stat.labelIconName, (iconName) => updateLocationStat(statIndex, { labelIconName: iconName || undefined }), true)}
                                            </div>

                                            {isNumericDisplayType(normalizedStat.type) && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                    <label style={fieldLabelStyle}>Properties</label>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Default</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={String(Number.isFinite(normalizedStat.default) ? Number(normalizedStat.default) : 0)}
                                                                onChange={(e) => updateLocationStat(statIndex, { default: Number(e.target.value) || 0 })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Min</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={typeof normalizedStat.min === 'number' ? String(normalizedStat.min) : ''}
                                                                onChange={(e) => updateLocationStat(statIndex, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Max</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={typeof normalizedStat.max === 'number' ? String(normalizedStat.max) : ''}
                                                                onChange={(e) => updateLocationStat(statIndex, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ marginTop: 10 }}>
                                            <Button variant="danger" onClick={() => removeLocationStat(statIndex)}>Remove Location Stat</Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    <Button
                        variant="secondary"
                        onClick={() => {
                            setLocationStats(prev => [...prev, defaultLocationStat()]);
                            setCollapsedLocationStats(prev => [...prev, false]);
                        }}
                    >
                        Add Location Stat
                    </Button>
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
                    actors={Object.values(save.actors || {})}
                    locations={locationOptions}
                    stage={stage}
                    onChange={setStatUpdateRules}
                />
            </GlassPanel>
        </div>
    );
};

export default StatManagementPanel;
