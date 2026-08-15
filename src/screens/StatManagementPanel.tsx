import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActorStat, ActorStatDisplayType, Stage } from '../Stage';
import { Button, GlassPanel, TextArea, TextInput, Title } from '../components/UiComponents';
import { RATING_ICON_OPTIONS } from '../components/ActorStatRating';

interface StatManagementPanelProps {
    stage: () => Stage;
}

const NUMERIC_DISPLAY_TYPES: ActorStatDisplayType[] = ['number', 'percentage', 'rating', 'letter grade'];

const isNumericDisplayType = (displayType: ActorStatDisplayType): boolean => NUMERIC_DISPLAY_TYPES.includes(displayType);

const cloneActorStat = (stat: ActorStat): ActorStat => ({
    name: stat.name,
    description: stat.description,
    guidance: stat.guidance,
    default: typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : 0,
    displayType: stat.displayType,
    options: (stat.options || []).map((option) => ({
        name: option.name,
        description: option.description,
    })),
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
    setByPlayer: stat.setByPlayer === true || stat.exposed === true,
    exposed: stat.exposed === true,
    iconName: stat.iconName || (stat.displayType === 'rating' ? 'star' : undefined),
});

const resolveStatDefaultValue = (stat: ActorStat): number | string => {
    if (stat.displayType === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === 'string' && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || '';
    }

    if (stat.displayType === 'text') {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

const normalizeStatValue = (value: unknown, stat: ActorStat): number | string => {
    if (stat.displayType === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof value === 'string' && optionNames.includes(value)) {
            return value;
        }
        return resolveStatDefaultValue(stat);
    }

    if (stat.displayType === 'text') {
        if (typeof value === 'string') {
            return value;
        }
        return resolveStatDefaultValue(stat);
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
    displayType: 'option',
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
    guidance: 'Guidance for the LLM on how this stat is applied or what a high or low score is or represents.',
    default: 50,
    displayType: 'percentage',
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
    if (stat.displayType === 'option') {
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

    if (stat.displayType === 'text') {
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
    if (stat.displayType === 'option') {
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

    if (stat.displayType === 'text') {
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
    const [collapsedPlayerStats, setCollapsedPlayerStats] = useState<boolean[]>(() =>
        (configuration.playerStats || []).map(() => true),
    );
    const [collapsedActorStats, setCollapsedActorStats] = useState<boolean[]>(() =>
        (configuration.actorStats || []).map(() => true),
    );
    const [actorStats, setActorStats] = useState<ActorStat[]>(() =>
        (configuration.actorStats || []).map(cloneActorStat),
    );
    const [playerStatValues, setPlayerStatValues] = useState<{ [key: string]: number | string }>(() => ({
        ...configuration.playerStatValues,
        ...save.playerStatValues,
    }));
    const [pipIconSearch, setPipIconSearch] = useState('');
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
        const nextValues: { [key: string]: number | string } = {};

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
        });

        const currentSave = stageInstance.getSave();
        const statNames = new Set(
            actorStats
                .filter(stat => isNumericDisplayType(stat.displayType))
                .map(stat => stat.name.trim())
                .filter(Boolean),
        );

        Object.values(currentSave.actors || {}).forEach(actor => {
            if (!actor.statMap || typeof actor.statMap !== 'object') {
                actor.statMap = {};
            }

            actorStats.filter(stat => isNumericDisplayType(stat.displayType)).forEach(stat => {
                const statName = stat.name.trim();
                if (!statName) {
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
    }, [actorStats, playerStats, stageInstance, validPlayerStatValues]);

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

    const renderPipIconPicker = (stat: ActorStat, onChange: (iconName: string) => void) => {
        const filteredOptions = RATING_ICON_OPTIONS.filter((option) => {
            const query = pipIconSearch.trim().toLowerCase();
            if (!query) {
                return true;
            }
            return option.label.toLowerCase().includes(query) || option.key.toLowerCase().includes(query);
        });

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <TextInput
                    fullWidth
                    value={pipIconSearch}
                    onChange={(e) => setPipIconSearch(e.target.value)}
                    placeholder="Search icon"
                />
                <div
                    style={{
                        display: 'grid',
                        gridAutoFlow: 'column',
                        gridAutoColumns: 'minmax(72px, 1fr)',
                        gridTemplateRows: '1fr',
                        gap: '8px',
                        overflowX: 'auto',
                        paddingBottom: '4px',
                        paddingRight: '4px',
                    }}
                >
                    {filteredOptions.map((option) => {
                        const Icon = option.icon;
                        const active = (stat.iconName || 'star') === option.key;
                        return (
                            <button
                                key={`icon-${option.key}`}
                                type="button"
                                onClick={() => onChange(option.key)}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    background: active ? 'color-mix(in srgb, var(--agenda-highlight) 16%, transparent)' : 'var(--agenda-surface-raised)',
                                    border: active ? '1px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)',
                                    borderRadius: '8px',
                                    color: 'var(--agenda-text-primary)',
                                    cursor: 'pointer',
                                    padding: '10px 8px',
                                    minHeight: '72px',
                                    fontSize: '11px',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <Icon style={{ fontSize: 24, color: active ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)' }} />
                                <span>{option.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
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

                                            <div style={inlineFieldTopStyle}>
                                                <label style={fieldLabelStyle}>Description</label>
                                                <TextArea
                                                    value={stat.description}
                                                    onChange={(e) => updatePlayerStat(statIndex, { description: e.target.value })}
                                                    rows={2}
                                                    style={{ width: '100%', resize: 'vertical' }}
                                                />
                                            </div>

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
                                                    value={stat.displayType}
                                                    onChange={(e) => {
                                                        const nextDisplayType = e.target.value as ActorStat['displayType'];
                                                        updatePlayerStat(statIndex, normalizePlayerStatShape({
                                                            ...stat,
                                                            displayType: nextDisplayType,
                                                        }));
                                                    }}
                                                >
                                                    <option value="option">option</option>
                                                    <option value="number">number</option>
                                                    <option value="percentage">percentage</option>
                                                    <option value="rating">rating</option>
                                                    <option value="letter grade">letter grade</option>
                                                    <option value="text">text</option>
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

                                            {normalizedStat.displayType === 'option' && (
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
                                                            <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                                <label style={fieldLabelStyle}>Option Description</label>
                                                                <TextArea
                                                                    value={option.description}
                                                                    onChange={(e) => updatePlayerStatOption(statIndex, optionIndex, { description: e.target.value })}
                                                                    rows={2}
                                                                    style={{ width: '100%', resize: 'vertical' }}
                                                                />
                                                            </div>
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

                                            {normalizedStat.displayType === 'text' && (
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

                                            {normalizedStat.displayType === 'rating' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Icon</label>
                                                    {renderPipIconPicker(normalizedStat, (iconName) => updatePlayerStat(statIndex, { iconName }))}
                                                </div>
                                            )}

                                            {isNumericDisplayType(normalizedStat.displayType) && (
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
                                                    value={normalizedStat.displayType}
                                                    onChange={(e) => {
                                                        const nextDisplayType = e.target.value as ActorStat['displayType'];
                                                        updateActorStat(statIndex, normalizeActorStatShape({
                                                            ...stat,
                                                            displayType: nextDisplayType,
                                                        }));
                                                    }}
                                                >
                                                    <option value="option">option</option>
                                                    <option value="number">number</option>
                                                    <option value="percentage">percentage</option>
                                                    <option value="rating">rating</option>
                                                    <option value="letter grade">letter grade</option>
                                                    <option value="text">text</option>
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

                                            {normalizedStat.displayType === 'option' && (
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

                                            {normalizedStat.displayType === 'text' && (
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

                                            {normalizedStat.displayType === 'rating' && (
                                                <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                                    <label style={fieldLabelStyle}>Icon</label>
                                                    {renderPipIconPicker(normalizedStat, (iconName) => updateActorStat(statIndex, { iconName }))}
                                                </div>
                                            )}

                                            {isNumericDisplayType(normalizedStat.displayType) && (
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
        </div>
    );
};

export default StatManagementPanel;
