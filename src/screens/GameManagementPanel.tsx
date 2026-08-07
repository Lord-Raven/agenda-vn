import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutoAwesome, Image as ImageIcon } from '@mui/icons-material';
import { ActorStat, ActorStatDisplayType, Stage } from '../Stage';
import { Button, GlassPanel, TextArea, TextInput, Title } from './UiComponents';
import { ImageUrlUploadField } from './ImageUrlUploadField';

interface GameManagementPanelProps {
    stage: () => Stage;
}

const NUMERIC_DISPLAY_TYPES: ActorStatDisplayType[] = ['number', 'percentage', 'stars', 'letter grade'];

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
    exposed: stat.exposed === true,
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
    options: [
        {
            name: 'Default',
            description: 'Default option behavior for this setting.',
        },
    ],
    exposed: true,
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
    exposed: false,
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

export const GameManagementPanel: FC<GameManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const configuration = stageInstance.getConfiguration();
    const defaultBackgroundImageUrl = 'https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png';

    const [title, setTitle] = useState<string>(() => configuration.title || '');
    const [titleImageUrl, setTitleImageUrl] = useState<string>(() => configuration.titleImageUrl || '');
    const [titleImagePrompt, setTitleImagePrompt] = useState<string>(() => configuration.titleImagePrompt || '');
    const [isUploadingTitleImage, setIsUploadingTitleImage] = useState(false);
    const [isGeneratingTitleImage, setIsGeneratingTitleImage] = useState(false);
    const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>(() => configuration.backgroundImageUrl || '');
    const [backgroundImagePrompt, setBackgroundImagePrompt] = useState<string>(() => configuration.backgroundImagePrompt || '');
    const [isUploadingBackgroundImage, setIsUploadingBackgroundImage] = useState(false);
    const [isGeneratingBackgroundImage, setIsGeneratingBackgroundImage] = useState(false);
    const [startingDate, setStartingDate] = useState<string>(() => configuration.startingDate || '');
    const [artStyle, setArtStyle] = useState<string>(() => configuration.artStyle || '');
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
    const [isCopyingConfigurationJson, setIsCopyingConfigurationJson] = useState(false);
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const didMountRef = useRef(false);
    const saveGameConfigurationRef = useRef<() => void>(() => {});

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

    const activeActors = useMemo(() => {
        return Object.values(save.actors || {})
            .filter(actor => actor.id !== save.playerId)
            .filter(actor => actor.active !== false)
            .map(actor => JSON.parse(JSON.stringify(actor)));
    }, [save.actors, save.playerId]);

    const activeLocations = useMemo(() => {
        return Object.values(save.atlas || {})
            .filter(location => location.active !== false)
            .map(location => JSON.parse(JSON.stringify(location)));
    }, [save.atlas]);

    const managedCalendarEvents = useMemo(() => {
        return stageInstance.getManagedCalendarEvents().map(event => JSON.parse(JSON.stringify(event)));
    }, [stageInstance, save.upcomingEvents, save.currentDate, save.currentTimeOfDay]);

    const portableGameConfiguration = useMemo(() => {
        return {
            title,
            titleImageUrl,
            titleImagePrompt,
            backgroundImageUrl,
            backgroundImagePrompt,
            startingDate,
            actorStats: actorStats.map(cloneActorStat),
            playerStats: playerStats.map(cloneActorStat),
            playerStatValues: { ...validPlayerStatValues },
            actors: activeActors,
            locations: activeLocations,
            lorebook: (save.lorebook || []).map(entry => JSON.parse(JSON.stringify(entry))),
            calendarEvents: managedCalendarEvents,
            uiSettings: JSON.parse(JSON.stringify(stageInstance.getUiSettings())),
        };
    }, [
        activeActors,
        activeLocations,
        actorStats,
        backgroundImagePrompt,
        backgroundImageUrl,
        managedCalendarEvents,
        playerStats,
        validPlayerStatValues,
        save.lorebook,
        stageInstance,
        startingDate,
        title,
        titleImagePrompt,
        titleImageUrl,
    ]);

    const portableGameConfigurationJson = useMemo(
        () => JSON.stringify(portableGameConfiguration, null, 2),
        [portableGameConfiguration],
    );

    const copyConfigurationJson = useCallback(async () => {
        if (isCopyingConfigurationJson) {
            return;
        }

        setIsCopyingConfigurationJson(true);
        try {
            await navigator.clipboard.writeText(portableGameConfigurationJson);
            stageInstance.showPriorityMessage('Copied GameConfiguration JSON to clipboard.');
        } catch (error) {
            console.error('Failed to copy GameConfiguration JSON:', error);
            stageInstance.showPriorityMessage('Failed to copy GameConfiguration JSON. Check console for details.');
        } finally {
            setIsCopyingConfigurationJson(false);
        }
    }, [isCopyingConfigurationJson, portableGameConfigurationJson, stageInstance]);

    const saveGameConfiguration = useCallback(() => {
        stageInstance.updateConfiguration({
            actors: activeActors,
            locations: activeLocations,
            lorebook: (save.lorebook || []).map(entry => JSON.parse(JSON.stringify(entry))),
            calendarEvents: managedCalendarEvents,
            actorStats,
            playerStats,
            playerStatValues: validPlayerStatValues,
            uiSettings: stageInstance.getUiSettings(),
            title,
            titleImageUrl,
            titleImagePrompt: titleImagePrompt,
            backgroundImageUrl,
            backgroundImagePrompt: backgroundImagePrompt,
            startingDate,
            artStyle,
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

    }, [activeActors, activeLocations, actorStats, backgroundImagePrompt, backgroundImageUrl, managedCalendarEvents, playerStats, save, stageInstance, startingDate, title, titleImagePrompt, titleImageUrl, validPlayerStatValues]);

    useEffect(() => {
        saveGameConfigurationRef.current = saveGameConfiguration;
    }, [saveGameConfiguration]);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = window.setTimeout(() => {
            saveGameConfigurationRef.current();
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
                saveGameConfigurationRef.current();
            }
        };
    }, []);

    const handleTitleImageUpload = async (file: File) => {
        setIsUploadingTitleImage(true);
        try {
            const uploadedUrl = await stageInstance.uploadFile('game-title-image.png', file);
            setTitleImageUrl(uploadedUrl);
            stageInstance.showPriorityMessage('Title image uploaded and will be saved automatically.');
        } catch (error) {
            console.error('Failed to upload title image:', error);
            stageInstance.showPriorityMessage('Failed to upload title image. Check console for details.');
        } finally {
            setIsUploadingTitleImage(false);
        }
    };

    const handleGenerateTitleImage = async () => {
        if (isGeneratingTitleImage) {
            return;
        }

        setIsGeneratingTitleImage(true);
        try {
            // Keep generation aligned with unsaved local edits before calling stage generation.
            stageInstance.updateConfiguration({
                title,
                titleImagePrompt,
            });

            const generatedUrl = await stageInstance.generateTitleImage();
            if (generatedUrl?.trim()) {
                setTitleImageUrl(generatedUrl);
                stageInstance.showPriorityMessage('Generated a new title image and will save it automatically.');
            } else {
                stageInstance.showPriorityMessage('No title image was generated. Try adjusting the prompt.');
            }
        } catch (error) {
            console.error('Failed to generate title image:', error);
            stageInstance.showPriorityMessage('Failed to generate title image. Check console for details.');
        } finally {
            setIsGeneratingTitleImage(false);
        }
    };

    const handleBackgroundImageUpload = async (file: File) => {
        setIsUploadingBackgroundImage(true);
        try {
            const uploadedUrl = await stageInstance.uploadFile('game-background-image.png', file);
            setBackgroundImageUrl(uploadedUrl);
            stageInstance.showPriorityMessage('Background image uploaded and will be saved automatically.');
        } catch (error) {
            console.error('Failed to upload background image:', error);
            stageInstance.showPriorityMessage('Failed to upload background image. Check console for details.');
        } finally {
            setIsUploadingBackgroundImage(false);
        }
    };

    const handleGenerateBackgroundImage = async () => {
        if (isGeneratingBackgroundImage) {
            return;
        }

        setIsGeneratingBackgroundImage(true);
        try {
            stageInstance.updateConfiguration({
                title,
                backgroundImagePrompt,
            });

            const generatedUrl = await stageInstance.generateBackgroundImage();
            if (generatedUrl?.trim()) {
                setBackgroundImageUrl(generatedUrl);
                stageInstance.showPriorityMessage('Generated a new background image and will save it automatically.');
            } else {
                stageInstance.showPriorityMessage('No background image was generated. Try adjusting the prompt.');
            }
        } catch (error) {
            console.error('Failed to generate background image:', error);
            stageInstance.showPriorityMessage('Failed to generate background image. Check console for details.');
        } finally {
            setIsGeneratingBackgroundImage(false);
        }
    };

    const updatePlayerStat = (index: number, patch: Partial<ActorStat>) => {
        setPlayerStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const setPlayerStatName = (index: number, rawName: string) => {
        const nextName = rawName;
        const previousName = (playerStats[index]?.name || '').trim();

        updatePlayerStat(index, { name: nextName });

        const trimmedNextName = nextName.trim();
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

    const removeActorStat = (index: number) => {
        setActorStats(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedActorStats(prev => prev.filter((_, idx) => idx !== index));
    };

    const toggleActorStat = (index: number) => {
        setCollapsedActorStats(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
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
            };
        }

        if (stat.displayType === 'text') {
            return {
                ...stat,
                default: typeof stat.default === 'string' ? stat.default : '',
                options: [],
                min: undefined,
                max: undefined,
            };
        }

        return {
            ...stat,
            default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
            options: [],
        };
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Game Settings</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Game Title</label>
                        <TextInput
                            fullWidth
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Agenda VN"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Start Date</label>
                        <TextInput
                            fullWidth
                            type="date"
                            value={startingDate}
                            onChange={(e) => setStartingDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Art Style</label>
                        <TextInput
                            fullWidth
                            value={artStyle}
                            onChange={(e) => setArtStyle(e.target.value)}
                            placeholder="Describe the art style for image generation."
                        />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Title Image Prompt</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start' }}>
                            <TextInput
                                fullWidth
                                value={titleImagePrompt}
                                onChange={(e) => setTitleImagePrompt(e.target.value)}
                                placeholder="Describe the title image style, atmosphere, and composition."
                            />
                            <Button
                                variant="secondary"
                                onClick={handleGenerateTitleImage}
                                disabled={isGeneratingTitleImage}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'stretch' }}
                            >
                                <AutoAwesome style={{ fontSize: '18px' }} />
                                {isGeneratingTitleImage ? 'Generating...' : 'Generate'}
                            </Button>
                        </div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <ImageUrlUploadField
                            imageUrl={titleImageUrl}
                            onImageUrlChange={setTitleImageUrl}
                            onUploadFile={handleTitleImageUpload}
                            isUploading={isUploadingTitleImage}
                            inputLabel="Title Image URL"
                            uploadButtonLabel="Upload Title Image"
                            previewBorder="3px solid var(--agenda-line-strong)"
                            previewBackgroundPosition="50% 45%"
                            previewWidth="220px"
                            previewHeight="124px"
                            previewPlaceholder={<ImageIcon style={{ fontSize: '46px', color: 'rgba(138, 176, 204, 0.35)' }} />}
                            onInvalidFile={() => stageInstance.showPriorityMessage('Please select a valid image file.')}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Background Image Prompt</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start' }}>
                            <TextInput
                                fullWidth
                                value={backgroundImagePrompt}
                                onChange={(e) => setBackgroundImagePrompt(e.target.value)}
                                placeholder="Describe the menu and calendar background atmosphere, setting, and composition."
                            />
                            <Button
                                variant="secondary"
                                onClick={handleGenerateBackgroundImage}
                                disabled={isGeneratingBackgroundImage}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'stretch' }}
                            >
                                <AutoAwesome style={{ fontSize: '18px' }} />
                                {isGeneratingBackgroundImage ? 'Generating...' : 'Generate'}
                            </Button>
                        </div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <ImageUrlUploadField
                            imageUrl={backgroundImageUrl}
                            onImageUrlChange={setBackgroundImageUrl}
                            onUploadFile={handleBackgroundImageUpload}
                            isUploading={isUploadingBackgroundImage}
                            inputLabel="Background Image URL"
                            uploadButtonLabel="Upload Background Image"
                            previewBorder="3px solid var(--agenda-line-strong)"
                            previewBackgroundPosition="50% 45%"
                            previewWidth="220px"
                            previewHeight="124px"
                            previewPlaceholder={<ImageIcon style={{ fontSize: '46px', color: 'rgba(138, 176, 204, 0.35)' }} />}
                            onInvalidFile={() => stageInstance.showPriorityMessage('Please select a valid image file.')}
                        />
                        {!backgroundImageUrl && (
                            <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px', marginTop: 6 }}>
                                Falls back to the existing default background image until you set one.
                            </div>
                        )}
                        {backgroundImageUrl && backgroundImageUrl.trim() === defaultBackgroundImageUrl && (
                            <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px', marginTop: 6 }}>
                                This matches the current built-in background image.
                            </div>
                        )}
                    </div>
                </div>
            </GlassPanel>

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
                                                    <option value="stars">stars</option>
                                                    <option value="letter grade">letter grade</option>
                                                    <option value="text">text</option>
                                                </select>
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Editable In Settings</label>
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={stat.exposed === true}
                                                        onChange={(e) => updatePlayerStat(statIndex, { exposed: e.target.checked })}
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

                                            {(normalizedStat.displayType === 'text') && (
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
                    {actorStats.map((stat, statIndex) => (
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

                                        <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                            <label style={fieldLabelStyle}>Properties</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                                                <div>
                                                    <div style={compactChipLabelStyle}>Default</div>
                                                    <TextInput
                                                        fullWidth
                                                        type="number"
                                                        value={String(stat.default)}
                                                        onChange={(e) => updateActorStat(statIndex, { default: Number(e.target.value) || 0 })}
                                                        placeholder="Default"
                                                    />
                                                </div>

                                                <div>
                                                    <div style={compactChipLabelStyle}>Min</div>
                                                    <TextInput
                                                        fullWidth
                                                        type="number"
                                                        value={typeof stat.min === 'number' ? String(stat.min) : ''}
                                                        onChange={(e) => updateActorStat(statIndex, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                        placeholder="Min"
                                                    />
                                                </div>

                                                <div>
                                                    <div style={compactChipLabelStyle}>Max</div>
                                                    <TextInput
                                                        fullWidth
                                                        type="number"
                                                        value={typeof stat.max === 'number' ? String(stat.max) : ''}
                                                        onChange={(e) => updateActorStat(statIndex, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                        placeholder="Max"
                                                    />
                                                </div>

                                                <div>
                                                    <div style={compactChipLabelStyle}>Display</div>
                                                    <select
                                                        className="input-base"
                                                        value={stat.displayType}
                                                        onChange={(e) => updateActorStat(statIndex, { displayType: e.target.value as ActorStat['displayType'] })}
                                                    >
                                                        <option value="number">number</option>
                                                        <option value="percentage">percentage</option>
                                                        <option value="stars">stars</option>
                                                        <option value="letter grade">letter grade</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 10 }}>
                                        <Button variant="danger" onClick={() => removeActorStat(statIndex)}>Remove Actor Stat</Button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}

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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>GameConfiguration JSON Export</Title>
                    <Button
                        variant="secondary"
                        onClick={copyConfigurationJson}
                        disabled={isCopyingConfigurationJson}
                    >
                        {isCopyingConfigurationJson ? 'Copying...' : 'Copy JSON'}
                    </Button>
                </div>

                <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                    Includes active actors and locations, plus current settings, styles, lorebook, and calendar event series.
                </div>

                <TextArea
                    readOnly
                    value={portableGameConfigurationJson}
                    rows={20}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                />
            </GlassPanel>
        </div>
    );
};

export default GameManagementPanel;