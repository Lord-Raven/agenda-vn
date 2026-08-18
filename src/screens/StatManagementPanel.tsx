import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { ActorSchedule, cloneActorSchedule } from '../content/Actor';
import { ActorStat, ActorStatType, ActorStatValue, ActorStatValueRule, cloneActorStatValueRules, isNumericDisplayType } from '../content/ActorStat';
import { Button, GlassPanel, LocationSelect, TextArea, TextInput, Title } from '../components/UiComponents';
import { IconPicker } from '../components/ActorStatRating';
import { ActorScheduleEditor } from '../components/ActorScheduleEditor';
import { ConditionEditor } from '../components/ConditionEditor';
import { Add } from '@mui/icons-material';

interface StatManagementPanelProps {
    stage: () => Stage;
}

const cloneActorStat = (stat: ActorStat): ActorStat => ({
    name: stat.name,
    description: stat.description,
    perActor: stat.perActor === true,
    perActorDefaultRules: cloneActorStatValueRules(stat.perActorDefaultRules),
    guidance: stat.guidance,
    default: typeof stat.default === 'boolean' ? stat.default : (typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : (stat.type === 'checkbox' ? false : 0)),
    type: stat.type,
    options: (stat.options || []).map((option) => ({
        name: option.name,
        description: option.description,
    })),
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
    setByPlayer: stat.setByPlayer === true || stat.exposed === true,
    exposed: stat.exposed === true,
    iconName: stat.iconName || (stat.type === 'rating' ? 'star' : undefined),
});

const resolveStatDefaultValue = (stat: ActorStat): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === 'string' && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || '';
    }

    if (stat.type === 'text' || stat.type === 'location') {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

const normalizeStatValue = (value: unknown, stat: ActorStat): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof value === 'string' && optionNames.includes(value)) {
            return value;
        }
        return resolveStatDefaultValue(stat);
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

const defaultPlayerStat = (): ActorStat => ({
    name: 'New Setting',
    description: 'Describe what this player setting controls.',
    guidance: 'How this setting should influence generated narrative and behavior.',
    default: 'Default',
    type: 'option',
    options: [{
        name: 'Default',
        description: 'Default option behavior for this setting.',
    }],
    setByPlayer: true,
    exposed: true,
    iconName: 'star',
});

const defaultActorStat = (): ActorStat => ({
    name: 'Name',
    description: 'A user-facing description of this stat.',
    perActor: false,
    perActorDefaultRules: [],
    guidance: 'Guidance for the LLM on how this stat is applied or what a high or low score is or represents.',
    default: 50,
    type: 'percentage',
    min: 0,
    max: 100,
    options: [],
    setByPlayer: false,
    exposed: false,
    iconName: 'star',
});

const clampStatValue = (value: number, stat: ActorStat): number => {
    let resolved = Number.isFinite(value) ? Number(value) : Number(stat.default) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

const normalizePlayerStatShape = (stat: ActorStat): ActorStat => {
    if (stat.type === 'option') {
        const options = (stat.options || []).filter(option => option.name.trim());
        const defaultValue = typeof stat.default === 'string' && options.some(option => option.name === stat.default)
            ? stat.default
            : (options[0]?.name || '');
        return {
            ...stat,
            options,
            default: defaultValue,
            min: undefined,
            max: undefined,
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
            iconName: stat.iconName || 'star',
        };
    }

    return {
        ...stat,
        default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
        options: [],
        iconName: stat.iconName || 'star',
    };
};

const normalizeActorStatShape = (stat: ActorStat): ActorStat => {
    if (stat.type === 'option') {
        const options = (stat.options || []).filter(option => option.name.trim());
        const defaultValue = typeof stat.default === 'string' && options.some(option => option.name === stat.default)
            ? stat.default
            : (options[0]?.name || '');
        return {
            ...stat,
            options,
            default: defaultValue,
            min: undefined,
            max: undefined,
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
            iconName: stat.iconName || 'star',
        };
    }

    return {
        ...stat,
        default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
        options: [],
        iconName: stat.iconName || 'star',
    };
};

export const StatManagementPanel: FC<StatManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const configuration = stageInstance.getConfiguration();

    const [playerStats, setPlayerStats] = useState<ActorStat[]>(() =>
        (configuration.playerStats || []).map(cloneActorStat),
    );
    const locationOptions = useMemo(
        () => Object.values(save.atlas || {})
            .filter(location => location.active !== false)
            .map(location => ({ id: location.id, name: location.name, imageUrl: location.imageUrl })),
        [save.atlas],
    );
    const [collapsedPlayerStats, setCollapsedPlayerStats] = useState<boolean[]>(() =>
        (configuration.playerStats || []).map(() => true),
    );
    const [collapsedActorStats, setCollapsedActorStats] = useState<boolean[]>(() =>
        (configuration.actorStats || []).map(() => true),
    );
    const [actorStats, setActorStats] = useState<ActorStat[]>(() =>
        (configuration.actorStats || []).map(cloneActorStat),
    );
    const [playerStatValues, setPlayerStatValues] = useState<{ [key: string]: ActorStatValue }>(() => ({
        ...configuration.playerStatValues,
        ...save.playerStatValues,
    }));
    const [universalSchedule, setUniversalSchedule] = useState<ActorSchedule>(() =>
        cloneActorSchedule(configuration.universalSchedule),
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

    const validPlayerStatValues = useMemo(() => {
        const nextValues: { [key: string]: ActorStatValue } = {};

        playerStats.forEach((stat) => {
            const statName = (stat.name || '').trim();
            if (!statName) {
                return;
            }

            nextValues[statName] = normalizeStatValue(playerStatValues[statName], stat);
        });

        return nextValues;
    }, [playerStatValues, playerStats]);

    const saveGameConfiguration = useCallback(() => {
        stageInstance.updateConfiguration({
            actorStats,
            playerStats,
            playerStatValues: validPlayerStatValues,
            universalSchedule,
        });

        const currentSave = stageInstance.getSave();
        const statNames = new Set(
            actorStats
                .filter(stat => !stat.perActor)
                .map(stat => stat.name.trim())
                .filter(Boolean),
        );

        Object.values(currentSave.actors || {}).forEach(actor => {
            if (!actor.statMap || typeof actor.statMap !== 'object') {
                actor.statMap = {};
            }

            actorStats.filter(stat => (isNumericDisplayType(stat.type) || stat.type === 'location') && !stat.perActor).forEach(stat => {
                const statName = stat.name.trim();
                if (!statName) {
                    return;
                }

                if (stat.type === 'location') {
                    const existing = actor.statMap[statName];
                    actor.statMap[statName] = typeof existing === 'string' ? existing : (typeof stat.default === 'string' ? stat.default : '');
                    return;
                }

                const existing = actor.statMap[statName];
                const fallback = Number.isFinite(stat.default) ? Number(stat.default) : 0;
                const value = Number.isFinite(existing) ? Number(existing) : fallback;
                actor.statMap[statName] = clampStatValue(value, stat);
            });

            Object.keys(actor.statMap).forEach(statName => {
                if (!statNames.has(statName)) {
                    delete actor.statMap[statName];
                }
            });
        });
    }, [actorStats, playerStats, stageInstance, universalSchedule, validPlayerStatValues]);

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

    const updatePlayerStat = (index: number, patch: Partial<ActorStat>) => {
        setPlayerStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const setPlayerStatName = (index: number, rawName: string) => {
        const previousName = (playerStats[index]?.name || '').trim();

        updatePlayerStat(index, { name: rawName });

        const trimmedNextName = rawName.trim();
        if (!previousName || !trimmedNextName || previousName === trimmedNextName) {
            return;
        }

        setPlayerStatValues((prev) => {
            const nextValues = { ...prev };
            const existingValue = nextValues[previousName];
            delete nextValues[previousName];
            if (existingValue !== undefined) {
                nextValues[trimmedNextName] = existingValue;
            }
            return nextValues;
        });
    };

    const removePlayerStat = (index: number) => {
        const removedName = (playerStats[index]?.name || '').trim();

        setPlayerStats(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedPlayerStats(prev => prev.filter((_, idx) => idx !== index));

        if (removedName) {
            setPlayerStatValues((prev) => {
                const nextValues = { ...prev };
                delete nextValues[removedName];
                return nextValues;
            });
        }
    };

    const togglePlayerStat = (index: number) => {
        setCollapsedPlayerStats(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
    };

    const updatePlayerStatOption = (statIndex: number, optionIndex: number, patch: { name?: string; description?: string }) => {
        setPlayerStats(prev => prev.map((stat, idx) => {
            if (idx !== statIndex) {
                return stat;
            }

            const currentOptions = [...(stat.options || [])];
            const nextOption = { ...(currentOptions[optionIndex] || { name: '', description: '' }), ...patch };
            currentOptions[optionIndex] = nextOption;
            return { ...stat, options: currentOptions };
        }));
    };

    const removePlayerStatOption = (statIndex: number, optionIndex: number) => {
        setPlayerStats(prev => prev.map((stat, idx) => {
            if (idx !== statIndex) {
                return stat;
            }

            const options = (stat.options || []).filter((_, idx2) => idx2 !== optionIndex);
            const defaultValue = typeof stat.default === 'string' && options.some(option => option.name === stat.default)
                ? stat.default
                : (options[0]?.name || '');

            return {
                ...stat,
                options,
                default: defaultValue,
            };
        }));
    };

    const addPlayerStatOption = (statIndex: number) => {
        setPlayerStats(prev => prev.map((stat, idx) => {
            if (idx !== statIndex) {
                return stat;
            }

            const options = [...(stat.options || [])];
            const nextLabel = `Option ${options.length + 1}`;
            options.push({
                name: nextLabel,
                description: '',
            });

            return {
                ...stat,
                options,
                default: typeof stat.default === 'string' && stat.default.trim() ? stat.default : nextLabel,
            };
        }));
    };

    const updateActorStat = (index: number, patch: Partial<ActorStat>) => {
        setActorStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const addActorStatPerActorRule = (index: number) => {
        setActorStats(prev => prev.map((stat, idx) => {
            if (idx !== index) {
                return stat;
            }
            const rule: ActorStatValueRule = { id: generateUuid(), value: resolveStatDefaultValue(stat), conditions: [] };
            return { ...stat, perActorDefaultRules: [...(stat.perActorDefaultRules || []), rule] };
        }));
    };

    const removeActorStatPerActorRule = (index: number, ruleId: string) => {
        setActorStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, perActorDefaultRules: (stat.perActorDefaultRules || []).filter(rule => rule.id !== ruleId) } : stat
        )));
    };

    const updateActorStatPerActorRule = (index: number, ruleId: string, patch: Partial<ActorStatValueRule>) => {
        setActorStats(prev => prev.map((stat, idx) => (
            idx === index
                ? { ...stat, perActorDefaultRules: (stat.perActorDefaultRules || []).map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule) }
                : stat
        )));
    };

    const renderIconPicker = (value: string | undefined, onChange: (iconName: string | undefined) => void, allowClear = false) => (
        <IconPicker value={value} onChange={onChange} allowClear={allowClear} />
    );

    const renderRuleValueInput = (stat: ActorStat, rule: ActorStatValueRule, onChange: (value: ActorStatValue) => void) => {
        if (stat.type === 'checkbox') {
            return (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                    <input type="checkbox" checked={rule.value === true} onChange={(e) => onChange(e.target.checked)} />
                    {rule.value === true ? 'True' : 'False'}
                </label>
            );
        }
        if (stat.type === 'option') {
            const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
            return (
                <select className="input-base" value={typeof rule.value === 'string' ? rule.value : ''} onChange={(e) => onChange(e.target.value)}>
                    {optionNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            );
        }
        if (stat.type === 'text') {
            return <TextInput fullWidth value={typeof rule.value === 'string' ? rule.value : ''} onChange={(e) => onChange(e.target.value)} />;
        }
        if (stat.type === 'location') {
            return (
                <LocationSelect
                    value={typeof rule.value === 'string' ? rule.value : ''}
                    onChange={(locationId) => onChange(locationId)}
                    locations={locationOptions}
                />
            );
        }
        return (
            <TextInput
                fullWidth
                type="number"
                value={String(Number.isFinite(rule.value) ? Number(rule.value) : 0)}
                onChange={(e) => onChange(Number(e.target.value) || 0)}
            />
        );
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Player Stats</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {playerStats.map((stat, statIndex) => {
                        const optionEntries = stat.options || [];
                        const normalizedStat = normalizePlayerStatShape(stat);

                        return (
                            <div key={`player-stat-${statIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--agenda-text-primary)' }}>
                                        {stat.name?.trim() || `Player Stat ${statIndex + 1}`}
                                    </div>
                                    <Button variant="secondary" onClick={() => togglePlayerStat(statIndex)}>
                                        {collapsedPlayerStats[statIndex] ? 'Expand' : 'Collapse'}
                                    </Button>
                                </div>

                                {!collapsedPlayerStats[statIndex] && (
                                    <>
                                        <div style={{ marginTop: 10 }}>
                                            <div style={inlineFieldStyle}>
                                                <label style={fieldLabelStyle}>Name</label>
                                                <TextInput
                                                    fullWidth
                                                    value={stat.name}
                                                    onChange={(e) => setPlayerStatName(statIndex, e.target.value)}
                                                    placeholder="Setting name"
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Visible In UI</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.exposed === true}
                                                        onChange={(e) => updatePlayerStat(statIndex, { exposed: e.target.checked })}
                                                    />
                                                    Exposed
                                                </label>
                                            </div>

                                            {stat.exposed === true && (
                                                <div style={inlineFieldTopStyle}>
                                                    <label style={fieldLabelStyle}>Description</label>
                                                    <TextArea
                                                        value={stat.description}
                                                        onChange={(e) => updatePlayerStat(statIndex, { description: e.target.value })}
                                                        rows={2}
                                                        style={{ width: '100%', resize: 'vertical' }}
                                                    />
                                                </div>
                                            )}

                                            <div style={inlineFieldTopStyle}>
                                                <label style={fieldLabelStyle}>Guidance</label>
                                                <TextArea
                                                    value={stat.guidance}
                                                    onChange={(e) => updatePlayerStat(statIndex, { guidance: e.target.value })}
                                                    rows={2}
                                                    style={{ width: '100%', resize: 'vertical' }}
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Display</label>
                                                <select
                                                    className="input-base"
                                                    value={stat.type}
                                                    onChange={(e) => {
                                                        const nextDisplayType = e.target.value as ActorStat['type'];
                                                        updatePlayerStat(statIndex, normalizePlayerStatShape({
                                                            ...stat,
                                                            type: nextDisplayType,
                                                        }));
                                                    }}
                                                >
                                                    <option value="checkbox">Checkbox</option>
                                                    <option value="letter grade">Letter Grade</option>
                                                    <option value="location">Location</option>
                                                    <option value="number">Number</option>
                                                    <option value="option">Option</option>
                                                    <option value="percentage">Percentage</option>
                                                    <option value="rating">Rating</option>
                                                    <option value="text">Text</option>
                                                </select>
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Editable In Settings</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.setByPlayer === true}
                                                        onChange={(e) => updatePlayerStat(statIndex, { setByPlayer: e.target.checked })}
                                                    />
                                                    Set by Player
                                                </label>
                                            </div>

                                            {normalizedStat.type === 'option' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 10 }}>
                                                    <div style={{ ...inlineFieldStyle, marginBottom: 4 }}>
                                                        <label style={fieldLabelStyle}>Default Option</label>
                                                        <select
                                                            className="input-base"
                                                            value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                            onChange={(e) => updatePlayerStat(statIndex, { default: e.target.value })}
                                                        >
                                                            {optionEntries.map((option, idx) => (
                                                                <option key={`${statIndex}-default-option-${idx}`} value={option.name}>
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
                                                                    onChange={(e) => updatePlayerStatOption(statIndex, optionIndex, { name: e.target.value })}
                                                                    placeholder="Option name"
                                                                />
                                                            </div>
                                                            {stat.exposed === true && (
                                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                                    <label style={fieldLabelStyle}>Option Description</label>
                                                                    <TextArea
                                                                        value={option.description}
                                                                        onChange={(e) => updatePlayerStatOption(statIndex, optionIndex, { description: e.target.value })}
                                                                        rows={2}
                                                                        style={{ width: '100%', resize: 'vertical' }}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div style={{ marginTop: 8 }}>
                                                                <Button variant="danger" onClick={() => removePlayerStatOption(statIndex, optionIndex)}>
                                                                    Remove Option
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    <Button variant="secondary" onClick={() => addPlayerStatOption(statIndex)}>
                                                        Add Option
                                                    </Button>
                                                </div>
                                            )}

                                            {normalizedStat.type === 'text' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Default Value</label>
                                                    <TextArea
                                                        value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                                        onChange={(e) => updatePlayerStat(statIndex, { default: e.target.value })}
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
                                                        onChange={(locationId) => updatePlayerStat(statIndex, { default: locationId })}
                                                        locations={locationOptions}
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'rating' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Rating Icon</label>
                                                    {renderIconPicker(normalizedStat.iconName, (iconName) => updatePlayerStat(statIndex, { iconName }))}
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
                                                                onChange={(e) => updatePlayerStat(statIndex, { default: Number(e.target.value) || 0 })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Min</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={typeof normalizedStat.min === 'number' ? String(normalizedStat.min) : ''}
                                                                onChange={(e) => updatePlayerStat(statIndex, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div style={compactChipLabelStyle}>Max</div>
                                                            <TextInput
                                                                fullWidth
                                                                type="number"
                                                                value={typeof normalizedStat.max === 'number' ? String(normalizedStat.max) : ''}
                                                                onChange={(e) => updatePlayerStat(statIndex, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ marginTop: 10 }}>
                                            <Button variant="danger" onClick={() => removePlayerStat(statIndex)}>Remove Player Stat</Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    <Button
                        variant="secondary"
                        onClick={() => {
                            setPlayerStats(prev => [...prev, defaultPlayerStat()]);
                            setCollapsedPlayerStats(prev => [...prev, false]);
                        }}
                    >
                        Add Player Stat
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
                                    <div style={{ fontWeight: 600, color: 'var(--agenda-text-primary)' }}>
                                        {stat.name?.trim() || `Actor Stat ${statIndex + 1}`}
                                    </div>
                                    <Button variant="secondary" onClick={() => toggleActorStat(statIndex)}>
                                        {collapsedActorStats[statIndex] ? 'Expand' : 'Collapse'}
                                    </Button>
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
                                                <label style={fieldLabelStyle}>Display</label>
                                                <select
                                                    className="input-base"
                                                    value={normalizedStat.type}
                                                    onChange={(e) => {
                                                        const nextDisplayType = e.target.value as ActorStat['type'];
                                                        updateActorStat(statIndex, normalizeActorStatShape({
                                                            ...stat,
                                                            type: nextDisplayType,
                                                        }));
                                                    }}
                                                >
                                                    <option value="checkbox">Checkbox</option>
                                                    <option value="letter grade">Letter Grade</option>
                                                    <option value="location">Location</option>
                                                    <option value="number">Number</option>
                                                    <option value="option">Option</option>
                                                    <option value="percentage">Percentage</option>
                                                    <option value="rating">Rating</option>
                                                    <option value="text">Text</option>
                                                </select>
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
                                                                <option key={`${statIndex}-actor-default-option-${idx}`} value={option.name}>
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
                                                                            const nextOption = { ...(currentOptions[optionIndex] || { name: '', description: '' }), name: e.target.value };
                                                                            currentOptions[optionIndex] = nextOption;
                                                                            return { ...item, options: currentOptions };
                                                                        }));
                                                                    }}
                                                                    placeholder="Option name"
                                                                />
                                                            </div>
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
                                                                            const nextOption = { ...(currentOptions[optionIndex] || { name: '', description: '' }), description: e.target.value };
                                                                            currentOptions[optionIndex] = nextOption;
                                                                            return { ...item, options: currentOptions };
                                                                        }));
                                                                    }}
                                                                    rows={2}
                                                                    style={{ width: '100%', resize: 'vertical' }}
                                                                />
                                                            </div>
                                                            <div style={{ marginTop: 8 }}>
                                                                <Button variant="danger" onClick={() => {
                                                                    setActorStats(prev => prev.map((item, idx) => {
                                                                        if (idx !== statIndex) {
                                                                            return item;
                                                                        }

                                                                        const options = (item.options || []).filter((_, idx2) => idx2 !== optionIndex);
                                                                        const defaultValue = typeof item.default === 'string' && options.some(option => option.name === item.default)
                                                                            ? item.default
                                                                            : (options[0]?.name || '');

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
                                                                name: nextLabel,
                                                                description: '',
                                                            });

                                                            return {
                                                                ...item,
                                                                options,
                                                                default: typeof item.default === 'string' && item.default.trim() ? item.default : nextLabel,
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
                                                    />
                                                </div>
                                            )}

                                            {normalizedStat.type === 'rating' && (
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
                                                                playerStats={[...actorStats, ...playerStats]}
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
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Universal Schedule</Title>
                <span style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: '11px', marginBottom: 10 }}>
                    Applies to every actor and is evaluated after that actor's own schedule. The first destination to match wins, but any matching "Generally unavailable" entry supersedes a matched location.
                </span>
                <ActorScheduleEditor
                    schedule={universalSchedule}
                    locations={locationOptions}
                    playerStats={playerStats}
                    actorStats={actorStats}
                    actors={Object.values(save.actors || {})}
                    emptyLabel="No universal schedule entries. Every actor falls back to their own schedule."
                    onChange={setUniversalSchedule}
                />
            </GlassPanel>
        </div>
    );
};

export default StatManagementPanel;
